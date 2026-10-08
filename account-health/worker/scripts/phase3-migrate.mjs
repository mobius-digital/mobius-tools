/* Phase 3 of the brand-first rebuild: move every brand-owned row onto the brand id.
 *   node scripts/phase3-migrate.mjs --db=<database id> [--dry]
 * Run on the staging copy first, then production (93e7cdeb-19a9-4950-8146-e24b189f410f).
 * Idempotent: a row already on a brand id is left alone, so a second run only finishes what is left.
 * Before production: take a time-travel bookmark (`wrangler d1 time-travel info mobius-account-health`).
 *
 * What it does, in order:
 *   1. brands gains the settings columns and they are copied from each brand's old accounts row;
 *      storage_prefix = the old act id (R2 files stay where they are).
 *   2. every old id a brand had (its legacy_key) is in brand_alias.
 *   3. every brand-owned table/column holding an old id is rewritten to the brand id, in rowid chunks.
 *      META_TABLES (Meta's own data) are left on the Meta account id.
 *   4. settings: per-brand keys renamed (except Meta-level metaStructAt:), id maps in values rewritten.
 *   5. brands.legacy_key = id; the brand_accounts view is (re)created.
 * Prints row counts before and after for every table it touched. */
import { remoteEnv } from './d1rest.mjs';
import { META_TABLES, BRAND_SETTING_COLS, BRAND_VIEW_SQL, ensureBrandColumns } from '../src/brands.js';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const DRY = process.argv.includes('--dry');
const database = arg('db');
if (!database) { console.error('--db=<database id> is required'); process.exit(1); }
const env = await remoteEnv({ database });
const DB = env.DB;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const run = async (sql, ...p) => { if (DRY) { console.log('  [dry]', sql.replace(/\s+/g, ' ').slice(0, 160), p.length ? JSON.stringify(p).slice(0, 80) : ''); return { meta: { changes: 0 } }; } return DB.prepare(sql).bind(...p).run(); };

console.log(`phase 3 on ${database}${DRY ? ' (dry run)' : ''}`);

/* 1. settings columns + copy */
if (!DRY) await ensureBrandColumns(env);
const brands = await q(`SELECT * FROM brands`);
const legacy = brands.filter(b => b.legacy_key && b.legacy_key !== b.id);
const cols = BRAND_SETTING_COLS.map(([c]) => c).filter(c => c !== 'storage_prefix');
for (const b of legacy) {
  const a = (await q(`SELECT * FROM accounts WHERE act_id = ?1`, b.legacy_key))[0];
  if (!a) { console.log(`  ${b.id}: no accounts row for ${b.legacy_key}, settings left default`); continue; }
  if (b.storage_prefix) continue;   // already copied on an earlier run
  await run(`UPDATE brands SET ${cols.map((c, i) => `${c} = ?${i + 2}`).join(', ')}, storage_prefix = ?${cols.length + 2}, updated_at = datetime('now') WHERE id = ?1`,
    b.id, ...cols.map(c => a[c] ?? (c.endsWith('_json') && c !== 'google_spend_json' && c !== 'report_config_json' ? '{}' : (/^(brief_enabled|brief_review|tw_attr_done)$/.test(c) ? 0 : c === 'review_first' ? 1 : null))), b.legacy_key);
}
console.log(`1. settings copied for ${legacy.length} brands`);

/* 2. aliases for every legacy key */
for (const b of legacy) await run(`INSERT OR IGNORE INTO brand_alias (alias, brand_id, kind) VALUES (?1, ?2, ?3)`, b.legacy_key, b.id, /^act_/.test(b.legacy_key) ? 'meta_act' : 'legacy');
const aliasRows = await q(`SELECT alias, brand_id FROM brand_alias`);
const alias = new Map(aliasRows.map(r => [r.alias, r.brand_id]));
/* Only aliases that were a brand's FILING key move data. A backup Meta account (Party Patch Ad Acc 2)
   is an alias too, but rows filed under it are Meta's and it files no brand rows. */
/* The old filing keys, from brand_alias, so a SECOND run still knows them (after the first run every
   legacy_key equals the brand id and that diff is empty). A backup Meta account files no brand rows
   (its data is Meta's), so it is left out. */
const backups = new Set((await q(`SELECT external_id FROM connections WHERE kind = 'meta' AND COALESCE(json_extract(config_json, '$.role'), '') = 'backup'`)).map(r => r.external_id));
const moveFrom = new Map([...legacy.map(b => [b.legacy_key, b.id]), ...aliasRows.filter(r => r.alias !== r.brand_id && !backups.has(r.alias)).map(r => [r.alias, r.brand_id])]);
if (!moveFrom.size) { console.log('no old ids known: nothing to move. Stopping.'); process.exit(0); }
console.log(`2. ${alias.size} aliases, ${moveFrom.size} filing keys to move`);

/* 3. brand-owned tables */
const tables = (await q(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`)).map(r => r.name);
const report = [];
for (const t of tables.sort()) {
  if (META_TABLES.includes(t) || ['brands', 'connections', 'brand_alias', 'settings'].includes(t)) continue;
  const tcols = (await q(`SELECT name FROM pragma_table_info(?1)`, t)).map(c => c.name).filter(c => /^(act|act_id|pending_act)$/.test(c));
  for (const c of tcols) {
    const keys = [...moveFrom.keys()];
    const inList = keys.map((_, i) => `?${i + 1}`).join(',');
    const before = (await q(`SELECT COUNT(*) n FROM "${t}" WHERE "${c}" IN (${inList})`, ...keys))[0].n;
    if (!before) continue;
    const { lo, hi } = (await q(`SELECT MIN(rowid) lo, MAX(rowid) hi FROM "${t}"`))[0];
    const CHUNK = 25000;
    for (const [old, bid] of moveFrom) {
      for (let s = lo; s <= hi; s += CHUNK) {
        await run(`UPDATE "${t}" SET "${c}" = ?1 WHERE "${c}" = ?2 AND rowid BETWEEN ?3 AND ?4`, bid, old, s, s + CHUNK - 1);
      }
    }
    const after = DRY ? before : (await q(`SELECT COUNT(*) n FROM "${t}" WHERE "${c}" IN (${inList})`, ...keys))[0].n;
    report.push(`${t}.${c}: ${before} rows moved${after ? `, ${after} LEFT BEHIND` : ''}`);
  }
}
console.log('3. tables\n   ' + report.join('\n   '));

/* 4. settings */
const KEEP_KEY = /^metaStructAt:/;            // Meta-level: stays on the Meta account id
const VALUE_KEYS = ['deliveryState', 'movedDone', 'reportTokens', 'shareTokens', 'userBrands'];
/* An old id inside a key or value: not preceded by a letter or digit (so asanaHook_act_1 matches, which \b would
   not) and not followed by a digit (so act_103 never matches inside act_1033194534145987). Longest first. */
const tokenRe = new RegExp(`(?<![A-Za-z0-9])(${[...moveFrom.keys()].sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![0-9])`, 'g');
const swap = s => s.replace(tokenRe, m => moveFrom.get(m) || m);
const srows = await q(`SELECT key, value FROM settings`);
let renamed = 0, rewritten = 0;
for (const r of srows) {
  if (!KEEP_KEY.test(r.key) && tokenRe.test(r.key)) {
    tokenRe.lastIndex = 0;
    const nk = swap(r.key);
    if (!nk || nk === r.key) { tokenRe.lastIndex = 0; continue; }   // never delete a key renamed onto itself
    await run(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, nk, r.value);
    await run(`DELETE FROM settings WHERE key = ?1`, r.key);
    renamed++;
  }
  tokenRe.lastIndex = 0;
  if (VALUE_KEYS.includes(r.key) && tokenRe.test(r.value || '')) {
    tokenRe.lastIndex = 0;
    await run(`UPDATE settings SET value = ?2 WHERE key = ?1`, r.key, swap(r.value));
    rewritten++;
  }
  tokenRe.lastIndex = 0;
}
console.log(`4. settings: ${renamed} keys renamed, ${rewritten} values rewritten`);

/* 4b. ids inside other stored text: Studio product fingerprints (p_studio_cfg keys dna:<id>:...)
   and saved dashboards (p_dashboard.spec_json scope + pinned blocks). */
let cfgMoved = 0, dashFixed = 0;
for (const r of await q(`SELECT key, value FROM p_studio_cfg`).catch(() => [])) {
  tokenRe.lastIndex = 0;
  if (!tokenRe.test(r.key)) continue;
  tokenRe.lastIndex = 0;
  if (swap(r.key) === r.key) continue;   // never delete a key renamed onto itself
  await run(`INSERT INTO p_studio_cfg (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, swap(r.key), r.value);
  await run(`DELETE FROM p_studio_cfg WHERE key = ?1`, r.key);
  cfgMoved++;
}
for (const r of await q(`SELECT id, spec_json FROM p_dashboard`).catch(() => [])) {
  tokenRe.lastIndex = 0;
  if (!tokenRe.test(r.spec_json || '')) continue;
  tokenRe.lastIndex = 0;
  await run(`UPDATE p_dashboard SET spec_json = ?2 WHERE id = ?1`, r.id, swap(r.spec_json));
  dashFixed++;
}
tokenRe.lastIndex = 0;
console.log(`4b. studio keys moved ${cfgMoved}, dashboards fixed ${dashFixed}`);

/* 5. brands file under their own id; the view */
await run(`UPDATE brands SET legacy_key = id WHERE legacy_key IS NULL OR legacy_key <> id`);
await run(`DROP VIEW IF EXISTS brand_accounts`);
await run(BRAND_VIEW_SQL);
if (!DRY) {
  const v = await q(`SELECT act_id, name, active, meta_act, tw_shop, slack_channel FROM brand_accounts ORDER BY name`);
  console.log('5. brand_accounts:\n   ' + v.map(r => `${r.act_id.padEnd(26)} active=${r.active} meta=${r.meta_act || '-'} tw=${r.tw_shop || '-'} ch=${r.slack_channel || '-'}`).join('\n   '));
}
console.log('done');
