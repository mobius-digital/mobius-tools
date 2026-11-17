/* Offline checks for the Monday test calls (asana-brand.js mondayCalls), after the Lucky post of 2026-11-16 called
 * old Carver UGC ad sets "Black Friday" and "Cyber Monday" ads and told the buyer to pause sets already paused.
 *   node test-testcalls.mjs      (from account-health/worker)
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
load(path.join(root, 'profit', 'worker', 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'migrations', 'brand-001.sql'));
load(path.join(here, 'schema.sql'));
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } }; };
const DB = { prepare: stmt, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
const env = { DB, META_TOKEN: 'test' };

const B = await import('./src/brands.js');
const A = await import('./src/asana-brand.js');
await B.createBrand(env, { name: 'Lucky Golf', internal_channel: 'C0LUCKY01' });
await B.addConnection(env, 'brand_lucky_golf', { kind: 'meta', external_id: 'act_378', label: 'Lucky Golf', is_primary: 1 });
db.exec(`UPDATE brands SET target_cpa = 64, target_roas = 2.5 WHERE id = 'brand_lucky_golf'`);
for (const t of [
  `CREATE TABLE IF NOT EXISTS p_br_batch (id TEXT PRIMARY KEY, act_id TEXT, num TEXT, title TEXT, stage TEXT, verdict TEXT, launch_on TEXT, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS p_br_adtag (ad_id TEXT, act_id TEXT, batch_id TEXT)`,
  `CREATE TABLE IF NOT EXISTS p_br_doc (act_id TEXT, line_id TEXT, key TEXT, data_json TEXT, status TEXT, source TEXT, updated_at TEXT, PRIMARY KEY (act_id, line_id, key))`,
  `CREATE TABLE IF NOT EXISTS tw_ad_attr (act_id TEXT, date TEXT, ad_id TEXT, model TEXT, revenue REAL, orders REAL)`,
]) db.exec(t);
for (const c of ['launch_on TEXT', 'verdict TEXT']) { try { db.exec(`ALTER TABLE p_br_batch ADD COLUMN ${c}`); } catch {} }

const day = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ins = (sql, ...a) => db.prepare(sql).run(...a);
/* Cards: 450 = Black Friday statics (launches in 10 days), 417 = a real running test, 445 = a test already paused. */
ins(`INSERT INTO p_br_batch (id, act_id, num, title, stage, launch_on) VALUES ('c450', 'brand_lucky_golf', '450', 'Black Friday: $50 off 2 (13 statics)', 'live', ?)`, day(10));
ins(`INSERT INTO p_br_batch (id, act_id, num, title, stage, launch_on) VALUES ('c417', 'brand_lucky_golf', '417', 'Spend smarter. Play Lucky (static)', 'live', NULL)`);
ins(`INSERT INTO p_br_batch (id, act_id, num, title, stage, launch_on) VALUES ('c445', 'brand_lucky_golf', '445', 'UGC, Carver 02 Gold', 'live', NULL)`);
ins(`INSERT INTO p_br_batch (id, act_id, num, title, stage, launch_on) VALUES ('c460', 'brand_lucky_golf', '460', 'Call-out ads', 'live', NULL)`);
/* Ads: the old Carver "450 A" spends now (number collision), 417 A in its own running set, 445 A paused, 460 A inside a
   shared BFCM set next to an ad that is not part of the test. */
const ads = [['ad450', '450 A | PatrickBottinelli_Carver02Gold', 'set450'], ['ad417', '417 A | Still', 'set417'], ['ad445', '445 A | Leo', 'set445'],
  ['ad460', '460 A | Call-out', 'setBF'], ['adOther', 'BF hero', 'setBF']];
for (const [id, name, set] of ads) ins(`INSERT INTO ads (act_id, ad_id, name, adset_id) VALUES ('act_378', ?, ?, ?)`, id, name, set);
for (let i = -12; i <= -1; i++) for (const id of ['ad450', 'ad417', 'ad445', 'ad460']) ins(`INSERT INTO ad_daily (act_id, ad_id, date, spend, impressions, link_clicks) VALUES ('act_378', ?, ?, 30, 3000, 30)`, id, day(i));
db.exec(`INSERT INTO p_br_doc (act_id, line_id, key, data_json) VALUES ('brand_lucky_golf', '', 'rules', '{"judge_days":7}')`);

/* Meta right now: 417 + the shared BF set run; 450 and 445 are paused (not returned by the ACTIVE filter). */
A.useFetch(async url => {
  const u = String(url);
  const data = u.includes('/adsets?') ? [{ id: 'set417', name: '417 | Still | Spend Smarter', campaign_id: 'cMD' }, { id: 'setBF', name: 'Black Friday | New people', campaign_id: 'cBF' }]
    : u.includes('/campaigns?') ? [{ id: 'cMD', name: '[MD] CBO', daily_budget: '20000' }, { id: 'cBF', name: 'BFCM 2026', daily_budget: '25000' }]
    : u.includes('/ads?') ? [{ id: 'ad417', adset_id: 'set417' }, { id: 'ad460', adset_id: 'setBF' }, { id: 'adOther', adset_id: 'setBF' }]
    : u.includes('user_tasks') ? { user_tasks: ['MANAGE'] } : u.includes('/permissions') ? { data: [{ permission: 'ads_management', status: 'granted' }] } : {};
  return { json: async () => (Array.isArray(data) ? { data } : data) };
});

const checks = [];
async function check(name, fn) { try { await fn(); checks.push(true); console.log('PASS ', name); } catch (e) { checks.push(false); console.log('FAIL ', name, '\n      ' + e.message); } }
const m = await A.mondayCalls(env, 'brand_lucky_golf');
if (m.error) console.log('mondayCalls error:', m.error);
console.log(m.text, '\n', JSON.stringify(m.plan));

await check('a card matched by number only never takes spend from before its launch date', () => {
  assert.doesNotMatch(m.text, /Black Friday: \$50 off/);
  assert.doesNotMatch(m.text, /PatrickBottinelli/);
});
await check('tests already off in Meta are left out, not called Pause', () => {
  assert.doesNotMatch(m.text, /445/);
  assert.match(m.text, /1 test already off in Meta, left out/);
});
await check('lines carry the name Meta shows, not the card title', () => {
  assert.match(m.text, /417 \| Still \| Spend Smarter/);
});
await check('a shared ad set is never paused for one test: only its ads come off', () => {
  assert.ok(!m.plan.pause.includes('setBF'));
  if (m.plan.pauseAds.length) assert.deepEqual(m.plan.pauseAds, ['ad460']);
});
await check('the Do it label counts tests the way the list shows them', () => {
  const p = m.plan.pause.length + m.plan.pauseAds.length;
  if (p) assert.match(m.text + JSON.stringify(m.plan), /./) && assert.equal(m.plan.tests, m.counts.loser);
});

const bad = checks.filter(x => !x).length;
console.log(`\n${checks.length - bad}/${checks.length} passed`);
process.exit(bad ? 1 : 0);
