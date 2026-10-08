/* Offline checks for src/brands.js: the mirror from accounts + brand docs into brands /
 * connections / brand_alias, the alias lookup, and hand-added connections.
 *   node test-brands.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const db = new DatabaseSync(':memory:');
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied */ } } };
load(path.join(here, 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'migrations', 'brand-001.sql'));
try { db.exec(`ALTER TABLE accounts ADD COLUMN demo INTEGER NOT NULL DEFAULT 0`); } catch { /* there */ }
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } }; };
const DB = { prepare: stmt, async batch(list) { const out = []; db.exec('BEGIN'); try { for (const s of list) out.push(await s.run()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return out; } };
const env = { DB };

db.exec(`INSERT INTO accounts (act_id, name, active, tw_shop, slack_channel, brief_channel, last_sync_insights) VALUES
  ('act_378', 'Lucky Golf', 1, 'lucky-wedges.myshopify.com', 'C_LUCKY_INT', 'C_LUCKY_CLIENT', '2026-10-08 12:00:00'),
  ('act_103', 'Party Patch', 1, 'party-patch-1.myshopify.com', 'C_PP_INT', NULL, NULL),
  ('act_701', 'Party Patch Ad Acc 2', 0, NULL, NULL, NULL, NULL),
  ('act_952', 'Ice & Gold', 1, NULL, 'C_IG_INT', NULL, NULL),
  ('act_999', 'Not a client', 0, NULL, NULL, NULL, NULL)`);
db.exec(`INSERT INTO accounts (act_id, name, active, demo) VALUES ('demo_harborline', 'Harborline Supply', 0, 1)`);
db.exec(`UPDATE accounts SET last_error = 'Meta said no' WHERE act_id = 'act_952'`);
const doc = (act, key, data) => db.prepare(`INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source) VALUES (?, '', ?, ?, 'approved', 'staff')`).run(act, key, JSON.stringify(data));
doc('act_378', 'google', { ga4: '358', gsc: 'sc-domain:luckygolf.com', ads: '6859' });
doc('act_378', 'klaviyo', { key: 'pk_secret_never_copied', account_id: 'SquHGF', company: 'Lucky Golf', verified_at: '2026-10-07' });
doc('act_378', 'asana', { project_gid: '1206', project_name: 'Lucky Golf', url: 'https://app.asana.com/x' });
doc('act_378', 'links', { drive: 'https://drive.google.com/d1', frame: 'https://next.frame.io/p1' });
doc('act_103', 'profile', { drive: 'https://drive.google.com/pp' });
doc('act_103', 'tiktok', { advertiser_id: '7001' });
db.exec(`INSERT INTO p_shopify (shop, act_id, access_token) VALUES ('lucky-wedges.myshopify.com', 'act_378', 'shpat_x')`);

const B = await import('./src/brands.js');

const checks = [];
async function check(name, fn) { try { await fn(); checks.push(true); console.log('PASS ', name); } catch (e) { checks.push(false); console.log('FAIL ', name, '\n      ' + e.message); } }
const rows = sql => db.prepare(sql).all();

await check('slugify makes readable ids', () => {
  assert.equal(B.slugify('Ice & Gold'), 'ice_and_gold');
  assert.equal(B.slugify('  Lucky Golf! '), 'lucky_golf');
  assert.equal(B.slugify(''), 'brand');
});

let first;
await check('first sync makes one brand per active or demo account, none for inactive ones', async () => {
  first = await B.syncRegistry(env);
  const ids = rows(`SELECT id, status, legacy_key FROM brands ORDER BY id`).map(r => `${r.id}:${r.status}:${r.legacy_key}`);
  assert.deepEqual(ids, ['brand_harborline_supply:demo:demo_harborline', 'brand_ice_and_gold:active:act_952', 'brand_lucky_golf:active:act_378', 'brand_party_patch:active:act_103']);
  assert.equal(first.brandsAdded.length, 4);
});

await check('channels carry over as internal / client', () => {
  const r = db.prepare(`SELECT internal_channel, client_channel FROM brands WHERE id = 'brand_lucky_golf'`).get();
  assert.equal(r.internal_channel, 'C_LUCKY_INT'); assert.equal(r.client_channel, 'C_LUCKY_CLIENT');
});

await check('connections derived from accounts, Shopify and brand docs', () => {
  const c = rows(`SELECT kind, external_id, label, status FROM connections WHERE brand_id = 'brand_lucky_golf' ORDER BY kind`).map(r => `${r.kind}=${r.external_id}`);
  assert.deepEqual(c, ['asana=1206', 'drive=https://drive.google.com/d1', 'frame=https://next.frame.io/p1', 'ga4=358', 'google_ads=6859', 'gsc=sc-domain:luckygolf.com', 'klaviyo=SquHGF', 'meta=act_378', 'shopify=lucky-wedges.myshopify.com', 'triple_whale=lucky-wedges.myshopify.com']);
  const pp = rows(`SELECT kind, external_id FROM connections WHERE brand_id = 'brand_party_patch' ORDER BY kind`).map(r => `${r.kind}=${r.external_id}`);
  assert.deepEqual(pp, ['drive=https://drive.google.com/pp', 'meta=act_103', 'tiktok=7001', 'triple_whale=party-patch-1.myshopify.com']);
  assert.equal(db.prepare(`SELECT status FROM connections WHERE kind = 'meta' AND external_id = 'act_952'`).get().status, 'error');
});

await check('no secret ever lands in connections', () => {
  const all = JSON.stringify(rows(`SELECT * FROM connections`));
  assert.ok(!all.includes('pk_secret'), 'klaviyo key leaked');
  assert.ok(!all.includes('shpat_'), 'shopify token leaked');
});

await check('aliases resolve every old id', async () => {
  assert.equal((await B.brandOf(env, 'act_378')).id, 'brand_lucky_golf');
  assert.equal((await B.brandOf(env, 'brand_lucky_golf')).id, 'brand_lucky_golf');
  assert.equal((await B.brandOf(env, 'lucky_golf')).id, 'brand_lucky_golf');
  assert.equal(await B.brandOf(env, 'act_999'), null);
  assert.equal(await B.legacyKeyOf(env, 'brand_party_patch'), 'act_103');
});

await check('second sync with nothing changed writes nothing', async () => {
  const r = await B.syncRegistry(env);
  assert.equal(r.writes, 0, JSON.stringify(r));
});

await check('a change in the old tables is mirrored (rename, new key, removed key)', async () => {
  db.exec(`UPDATE accounts SET name = 'Lucky Golf Co', slack_channel = 'C_NEW' WHERE act_id = 'act_378'`);
  db.exec(`DELETE FROM p_br_doc WHERE act_id = 'act_378' AND key = 'klaviyo'`);
  doc('act_952', 'asana', { project_gid: '1219', project_name: 'Ice & Gold' });
  const r = await B.syncRegistry(env);
  const b = db.prepare(`SELECT id, name, internal_channel FROM brands WHERE legacy_key = 'act_378'`).get();
  assert.equal(b.id, 'brand_lucky_golf', 'the id never changes on a rename');
  assert.equal(b.name, 'Lucky Golf Co'); assert.equal(b.internal_channel, 'C_NEW');
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM connections WHERE kind = 'klaviyo'`).get().n, 0);
  assert.equal(db.prepare(`SELECT brand_id FROM connections WHERE kind = 'asana' AND external_id = '1219'`).get().brand_id, 'brand_ice_and_gold');
  assert.equal(r.connectionsRemoved, 1);
});

await check('a second Meta account attaches to Party Patch by hand and the mirror leaves it alone', async () => {
  await B.addConnection(env, 'act_103', { kind: 'meta', external_id: 'act_701', label: 'Party Patch Ad Acc 2' });
  await B.syncRegistry(env);
  const m = rows(`SELECT external_id, source, is_primary FROM connections WHERE brand_id = 'brand_party_patch' AND kind = 'meta' ORDER BY external_id`);
  assert.deepEqual(m.map(r => `${r.external_id}:${r.source}:${r.is_primary}`), ['act_103:mirror:1', 'act_701:locus:0']);
  assert.equal((await B.brandOf(env, 'act_701')).id, 'brand_party_patch');
});

await check('an outside account cannot be on two brands', async () => {
  await assert.rejects(B.addConnection(env, 'brand_lucky_golf', { kind: 'meta', external_id: 'act_701' }), /already connected to brand_party_patch/);
  await assert.rejects(B.addConnection(env, 'brand_lucky_golf', { kind: 'meta', external_id: '701' }), /act_123456/);
  await assert.rejects(B.addConnection(env, 'brand_lucky_golf', { kind: 'myspace', external_id: 'x' }), /Unknown connection kind/);
});

await check('a brand switched off in the old table is paused, keeps its id and connections', async () => {
  db.exec(`UPDATE accounts SET active = 0 WHERE act_id = 'act_952'`);
  await B.syncRegistry(env);
  const b = db.prepare(`SELECT status FROM brands WHERE id = 'brand_ice_and_gold'`).get();
  assert.equal(b.status, 'paused');
  assert.ok(db.prepare(`SELECT COUNT(*) n FROM connections WHERE brand_id = 'brand_ice_and_gold'`).get().n > 0);
  db.exec(`UPDATE accounts SET active = 1 WHERE act_id = 'act_952'`);
  await B.syncRegistry(env);
  assert.equal(db.prepare(`SELECT status FROM brands WHERE id = 'brand_ice_and_gold'`).get().status, 'active');
});

await check('a name clash gets a numbered slug, never a merge', async () => {
  db.exec(`INSERT INTO accounts (act_id, name, active) VALUES ('act_555', 'Party Patch', 1)`);
  await B.syncRegistry(env);
  assert.equal(db.prepare(`SELECT id FROM brands WHERE legacy_key = 'act_555'`).get().id, 'brand_party_patch_2');
});

await check('listBrands nests connections and never returns a secret', async () => {
  const list = await B.listBrands(env);
  const pp = list.find(b => b.id === 'brand_party_patch');
  assert.equal(pp.connections.filter(c => c.kind === 'meta').length, 2);
  assert.ok(!JSON.stringify(list).includes('pk_') && !JSON.stringify(list).includes('shpat_'));
});

const failed = checks.filter(x => !x).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
