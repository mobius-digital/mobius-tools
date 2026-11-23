/* Offline checks for the creator graduate engine (src/creatorengine.js, 2026-11-22): the creator matching, and one
 * plan against a mocked Meta campaign that exercises graduate, keep, demote, pause, load and replace.
 * In-memory SQLite, Graph API mocked, nothing written to Meta (dry).
 *   node test-creatorengine.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { keyOf, nameOf, creatorFromName, creatorOfSet, trybeTags, planBrand, saveCfg, runBrand, readCfg, creatorEngineTick } from './src/creatorengine.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(':memory:');
for (const st of fs.readFileSync(path.join(here, 'schema.sql'), 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied ALTER */ } }
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const DB = { prepare(sql) { let args = []; const st = () => db.prepare(bindSql(sql));
  return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } }; } };
const env = { DB, META_TOKEN: 'x' };

const ACT = 'brand_t', META = 'act_9';
db.exec(`INSERT INTO accounts (act_id, name, currency, tz) VALUES ('${META}', 'Test', 'USD', 'America/Chicago')`);
db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, legacy_key, source, target_cpa) VALUES ('${ACT}', 't', 'Test', 'active', 'USD', 'America/Chicago', '${META}', 'locus', 50)`);
db.exec(`INSERT INTO connections (id, brand_id, kind, external_id, is_primary, source) VALUES ('m', '${ACT}', 'meta', '${META}', 1, 'locus')`);

let pass = 0;
const ok = (name, fn) => Promise.resolve().then(fn).then(() => { pass++; console.log('PASS ', name); }).catch(e => { console.log('FAIL ', name, '\n', e); process.exitCode = 1; });

await ok('names: keys, display names, ad names, set names, Trybe tags', () => {
  assert.equal(keyOf('Michael Kerr'), keyOf('MichaelKerr'));
  assert.equal(nameOf('JoshRutherford'), 'Josh Rutherford');
  assert.equal(creatorFromName('JoshRutherford | Josh - 2 | Partnership'), 'JoshRutherford');
  assert.equal(creatorFromName('999 H | robertwilliams-fry_Carver02_111326_META'), 'robertwilliams-fry');
  assert.equal(creatorFromName('412 B | Still'), null);
  assert.equal(creatorOfSet('Ace | Jett Slepak'), 'Jett Slepak');
  assert.equal(creatorOfSet('Trybe | 11/04'), null);
  assert.equal(creatorOfSet('Creator Pool'), null);
  assert.deepEqual(trybeTags({ name: 'x', creative: { url_tags: 'utm_source=fb&trybe_adid=ab12cd34' } }), ['ab12cd34']);
  assert.deepEqual(trybeTags({ name: 'Kelly_Earrings_20261113_trybe=5a1c8fc9' }), ['5a1c8fc9']);
});

/* A campaign: pool with Ann (3 live, graduates) and Bo (1); sets for Cy (2 live, beating goal: keep), Di (2 live for 9
   days, not beating: demote), Ed (0 live: pause), Fi (8 live = full, one stale loser: replace on a new video). */
const CAMP = '100', POOL = '200';
const sets = [
  { id: POOL, name: 'Creator Pool', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '3000' },
  { id: '301', name: 'Creator | Cy Lee', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '1500' },
  { id: '302', name: 'Creator | Di Moss', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '1500' },
  { id: '303', name: 'Creator | Ed Fox', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '1500' },
  { id: '304', name: 'Creator | Fi Gale', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '1500' },
];
const ad = (id, set, name, on = true, created = '2026-11-01') => ({ id, name, adset_id: set, status: on ? 'ACTIVE' : 'PAUSED', effective_status: on ? 'ACTIVE' : 'PAUSED', created_time: created + 'T00:00:00Z', creative: { id: 'c' + id } });
const ads = [
  ad('1', POOL, 'AnnRay | a1'), ad('2', POOL, 'AnnRay | a2'), ad('3', POOL, 'AnnRay | a3'), ad('4', POOL, 'BoTan | b1'),
  ad('11', '301', 'CyLee | c1'), ad('12', '301', 'CyLee | c2'),
  ad('21', '302', 'DiMoss | d1'), ad('22', '302', 'DiMoss | d2'),
  ad('31', '303', 'EdFox | e1', false),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => ad(String(40 + i), '304', `FiGale | f${i}`)),
];
/* numbers: Cy sold 2 at $40 (beats $50); Fi's f1 spent $150 with 0 sales (past wait); everyone else spent a little. */
db.exec(`INSERT INTO ad_daily (act_id, ad_id, date, spend) VALUES ('${META}', '11', '2026-11-20', 80), ('${META}', '41', '2026-11-18', 150), ('${META}', '21', '2026-11-20', 30)`);
db.exec(`CREATE TABLE IF NOT EXISTS tw_ad_attr (act_id TEXT, date TEXT, ad_id TEXT, model TEXT, revenue REAL, orders REAL, platform TEXT)`);
db.exec(`INSERT INTO tw_ad_attr (act_id, date, ad_id, model, revenue, orders) VALUES ('${ACT}', '2026-11-20', '11', 'lastPlatformClick', 200, 2)`);
/* Fi has a new approved Trybe video with an ad in another campaign */
db.exec(`CREATE TABLE IF NOT EXISTS p_trybe_sub (act_id TEXT, sub_id TEXT, trybe_id TEXT, creator_id TEXT, creator TEXT, status TEXT, media TEXT, program TEXT, product TEXT, angle TEXT, transcript TEXT, thumb TEXT, created_at TEXT, ads_count INTEGER DEFAULT 0, ads_first TEXT, ads_last TEXT, approved_seen TEXT, alerted TEXT, synced_at TEXT, PRIMARY KEY (act_id, sub_id))`);
db.exec(`CREATE TABLE IF NOT EXISTS p_trybe_ad (act_id TEXT, ad_id TEXT, trybe_id TEXT, name TEXT, status TEXT, adset_id TEXT, adset TEXT, campaign TEXT, start_time TEXT, created_time TEXT, synced_at TEXT, PRIMARY KEY (act_id, ad_id))`);
db.exec(`INSERT INTO p_trybe_sub (act_id, sub_id, trybe_id, creator, status, approved_seen) VALUES ('${ACT}', 's1', 'feed0001', 'Fi Gale', 'approved', '2026-11-20')`);
db.exec(`INSERT INTO p_trybe_ad (act_id, ad_id, trybe_id, name, status, adset_id) VALUES ('${ACT}', '900', 'feed0001', 'FiGale_x_20261120_trybe=feed0001', 'PAUSED', '999')`);
/* Di has been under 3 since Nov 13 */
db.exec(`INSERT INTO settings (key, value) VALUES ('creatorEngineState:${ACT}', '{"sets":{"302":{"under3_since":"2026-11-13"}}}')`);

const J = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
const calls = [];
const d = { xfetch: async (u, o = {}) => { calls.push((o.method || 'GET') + ' ' + u); const p = new URL(u).pathname.replace(/^\/v[\d.]+\//, '');
  if (p === CAMP) return J({ id: CAMP, name: '[MD] ABO | Creator Campaign', effective_status: 'ACTIVE', account_id: '9' });
  if (p === `${CAMP}/adsets`) return J({ data: sets });
  if (p === `${CAMP}/ads`) return J({ data: ads });
  return J({ error: { message: 'unexpected ' + p } }); }, centralDate: () => '2026-11-22' };

await ok('plan: graduate, keep, demote, pause, replace, propose', async () => {
  await saveCfg(env, ACT, { mode: 'suggest', campaign: CAMP, pool: POOL });
  const p = await planBrand(env, d, ACT, { today: '2026-11-22' });
  assert.equal(p.error, undefined, p.error);
  const g = p.moves.find(m => m.kind === 'graduate');
  assert.ok(g && g.creator === 'Ann Ray' && g.ads.length === 3 && g.budget === 15, 'Ann graduates with 3 ads at $15');
  assert.ok(!p.moves.some(m => m.creator === 'Bo Tan'), 'Bo stays in the pool');
  assert.ok(p.keeps.some(k => k.creator === 'Cy Lee'), 'Cy kept under 3 because beating goal');
  assert.equal(p.moves.filter(m => m.kind === 'move' && m.from === '302').length, 2, 'Di\'s 2 ads go to the pool');
  assert.ok(p.moves.some(m => m.kind === 'pause_set' && m.set === '302' && m.after_moves), 'Di\'s set pauses after the moves');
  assert.ok(p.moves.some(m => m.kind === 'pause_set' && m.set === '303'), 'Ed\'s empty set pauses');
  const load = p.moves.find(m => m.kind === 'load');
  assert.ok(load && load.to === '304' && load.replace && load.replace.id === '41', 'Fi\'s new video replaces f1');
  assert.ok(p.drafts.some(x => x.kind === 'graduate_dm' && x.creator === 'Ann Ray') && p.drafts.some(x => x.kind === 'discord'), 'drafts made');
  assert.ok(!JSON.stringify(p.drafts).match(/[—–]/), 'no em dashes');
  assert.equal(p.proposals.length, 0, 'Cy has 2 sales: no raise until 3');
  assert.equal(p.nextState.sets['302'].under3_since, '2026-11-13', 'under-3 clock kept');
});

await ok('suggest only: flat suggestions with reasons and ids, nothing written to Meta, live mode refused', async () => {
  calls.length = 0;
  const r = await runBrand(env, d, ACT, { today: '2026-11-22' });
  const k = new Set(r.suggestions.map(s => s.kind));
  for (const want of ['graduate', 'keep', 'demote', 'pause', 'replace']) assert.ok(k.has(want), 'has ' + want);
  for (const s of r.suggestions) { assert.ok(s.id && s.reason && Array.isArray(s.ad_ids), 'row shape ' + s.kind); assert.ok(!/[—–]/.test(s.reason)); }
  const dem = r.suggestions.find(s => s.kind === 'demote');
  assert.deepEqual(dem.ad_ids.sort(), ['21', '22']); assert.equal(dem.to_set_id, POOL);
  assert.equal(r.suggestions.find(s => s.kind === 'replace').pause_ad_id, '41');
  assert.ok(calls.length && calls.every(c => c.startsWith('GET ')), 'only Graph reads: ' + calls.filter(c => !c.startsWith('GET ')).join(', '));
  await saveCfg(env, ACT, { mode: 'live' });
  assert.equal((await readCfg(env, ACT)).mode, 'suggest', 'live is not a mode any more');
  db.exec(`UPDATE settings SET value = json_set(value, '$.mode', 'live') WHERE key = 'creatorEngine:${ACT}'`);
  assert.equal((await readCfg(env, ACT)).mode, 'suggest', 'an old stored live reads as suggest');
  calls.length = 0;
  const t = await creatorEngineTick(env, { ...d, centralHour: () => 7, listBrands: async () => [], slackPost: async () => { throw new Error('posted to Slack'); } }, { force: true });
  assert.equal(t.ran.length, 1); assert.ok(calls.every(c => c.startsWith('GET ')));
  const src = fs.readFileSync(path.join(here, 'src/creatorengine.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/locusWrite|copy_ad|slackPost|creatorRaiseRows/.test(code), 'no write helpers in the engine code');
});

console.log(`\n${pass}/3 passed`);
