/* Offline checks for the report hold (drafthold.js, round 21, 2026-11-26): a client daily or report draft whose numbers
 * look broken (Triple Whale not synced for the last day, no sales while ads spent, a failing Meta sync) is marked with
 * the reason in p_draft_hold; the draft row itself is never touched; numbers that come in later keep the hold with a
 * "write it again" reason (the draft still has the old numbers) until a rebuild; the hold drops once the draft is sent
 * or skipped; the route is team only.
 * In-memory SQLite for D1, invented brands and numbers.
 *   node test-drafthold.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { holdOf, holdFacts, markHold, listHolds, recheckHolds, zonedMidnight, _resetHolds, holdFor, STALE_REASON } from './src/drafthold.js';

let db;
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = (sql, a) => { const o = {}; for (const m of sql.matchAll(/\?(\d+)/g)) { const v = a[+m[1] - 1]; o['p' + m[1]] = v === undefined ? null : typeof v === 'boolean' ? +v : v; } return o; };
const prep = sql => {
  let args = [];
  const st = () => db.prepare(bindSql(sql));
  const o = { bind(...a) { args = a; return o; }, async first() { return st().get(vals(sql, args)) || null; }, async all() { return { results: st().all(vals(sql, args)) }; },
    async run() { if (!/\?\d/.test(sql)) { db.exec(sql); return { meta: {} }; } st().run(vals(sql, args)); return { meta: {} }; } };
  return o;
};
const env = { DB: { prepare: prep } };
const addDays = (ymd, n) => { const x = new Date(`${ymd}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const BRAND = { act_id: 'brand_northlake_golf', name: 'Northlake Golf', tz: 'America/Chicago', tw_shop: 'northlake.example', last_error: null };
let accts = [BRAND];
const d = { listAccounts: async () => accts, addDays };
function fresh() {
  db = new DatabaseSync(':memory:'); _resetHolds(); accts = [{ ...BRAND }];
  db.exec(`CREATE TABLE connections (brand_id TEXT, kind TEXT, external_id TEXT)`);
  db.exec(`CREATE TABLE daily_insights (act_id TEXT, date TEXT, spend REAL)`);
  db.exec(`CREATE TABLE tw_daily (act_id TEXT, date TEXT, metric TEXT, value REAL, synced_at TEXT, PRIMARY KEY (act_id, date, metric))`);
  db.exec(`CREATE TABLE briefs (act_id TEXT, date TEXT, status TEXT, text TEXT)`);
  db.exec(`CREATE TABLE reports (act_id TEXT, period TEXT, period_start TEXT, status TEXT)`);
  db.exec(`INSERT INTO connections VALUES ('brand_northlake_golf', 'meta', 'act_100')`);
}
const tw = (date, sales, at) => db.prepare(`INSERT INTO tw_daily VALUES ('brand_northlake_golf', ?, 'netSales', ?, ?) ON CONFLICT DO UPDATE SET value = excluded.value, synced_at = excluded.synced_at`).run(date, sales, at);
const spend = (date, s) => db.prepare(`INSERT INTO daily_insights VALUES ('act_100', ?, ?)`).run(date, s);
let n = 0;
const ok = (name, fn) => Promise.resolve().then(fn).then(() => { n++; }, e => { console.error('FAILED: ' + name + '\n', e); process.exitCode = 1; });
const DAY = '2026-03-10';

await ok('holdOf: Triple Whale not synced, missing days, zero sales with spend, a failing sync; fine numbers hold nothing', () => {
  assert.equal(holdOf({ tw: true, twSynced: true, missingDays: 0, sales: 900, spend: 300, syncError: false }), null);
  assert.deepEqual(holdOf({ tw: true, twSynced: false, sales: 900, spend: 300 }), { code: 'tw', reason: 'Numbers look incomplete: Triple Whale has not synced' });
  assert.match(holdOf({ tw: true, twSynced: true, missingDays: 2, sales: 900, spend: 300 }).reason, /Triple Whale has no numbers for 2 days/);
  assert.deepEqual(holdOf({ tw: true, twSynced: true, missingDays: 0, sales: 0, spend: 300 }), { code: 'zero', reason: 'Numbers look incomplete: no sales recorded while ads spent $300' });
  assert.equal(holdOf({ tw: true, twSynced: true, missingDays: 0, sales: 0, spend: 10 }), null, 'no spend to speak of');
  assert.equal(holdOf({ tw: true, twSynced: true, missingDays: 0, sales: 500, spend: 300, syncError: true }).code, 'sync');
  assert.equal(holdOf({ tw: false, twSynced: true, sales: null, spend: 300 }), null, 'a brand without Triple Whale is not held for it');
  for (const r of ['tw', 'zero', 'sync']) assert.ok(!/[\u2014\u2013]/.test(JSON.stringify(holdOf({ tw: true, twSynced: r !== 'tw', sales: r === 'zero' ? 0 : 5, spend: 300, syncError: r === 'sync' }))));
});
await ok('zonedMidnight: the brand day starts at its own midnight', () => {
  assert.equal(new Date(zonedMidnight('2026-03-11', 'America/Chicago')).toISOString(), '2026-03-11T05:00:00.000Z');
  assert.equal(new Date(zonedMidnight('2026-01-11', 'America/New_York')).toISOString(), '2026-01-11T05:00:00.000Z');
});
await ok('a daily draft: held while Triple Whale last synced before the day ended; numbers in later = still held, "write it again"; a rebuild releases', async () => {
  fresh();
  tw(DAY, 1200, '2026-03-11 02:00:00'); spend(DAY, 400);
  db.exec(`INSERT INTO briefs VALUES ('brand_northlake_golf', '${DAY}', 'draft', 'the client post')`);
  const h = await markHold(env, d, 'brand_northlake_golf', 'brief', 'daily', DAY, DAY);
  assert.equal(h.code, 'tw');
  const l = await listHolds(env, 'all');
  assert.equal(l.length, 1); assert.equal(l[0].reason, 'Numbers look incomplete: Triple Whale has not synced'); assert.equal(l[0].kind, 'brief');
  assert.deepEqual({ ...db.prepare(`SELECT * FROM briefs`).all()[0] }, { act_id: 'brand_northlake_golf', date: DAY, status: 'draft', text: 'the client post' }, 'the draft is never touched');
  tw(DAY, 1250, '2026-03-11 09:00:00');
  const r = await recheckHolds(env, d);
  assert.deepEqual(r, { checked: 1, released: 0, stale: 1 });
  const s2 = await listHolds(env, 'all');
  assert.equal(s2.length, 1, 'the draft still carries the old numbers: still held'); assert.equal(s2[0].code, 'stale'); assert.equal(s2[0].reason, STALE_REASON);
  await recheckHolds(env, d);
  assert.equal((await listHolds(env, 'all'))[0].code, 'stale', 'stays stale');
  /* the rebuild marks it again with good numbers: released */
  assert.equal(await markHold(env, d, 'brand_northlake_golf', 'brief', 'daily', DAY, DAY), null);
  assert.equal((await listHolds(env, 'all')).length, 0);
});
await ok('zero sales with spend holds; a failing Meta sync holds; a sent draft drops its hold', async () => {
  fresh();
  tw(DAY, 0, '2026-03-11 09:00:00'); spend(DAY, 400);
  db.exec(`INSERT INTO briefs VALUES ('brand_northlake_golf', '${DAY}', 'draft', 'x')`);
  assert.equal((await markHold(env, d, accts[0], 'brief', 'daily', DAY, DAY)).code, 'zero');
  db.exec(`UPDATE briefs SET status = 'sent'`);
  await recheckHolds(env, d);
  assert.equal((await listHolds(env, 'all')).length, 0, 'sent: the hold goes');
  fresh(); tw(DAY, 900, '2026-03-11 09:00:00'); spend(DAY, 400);
  accts[0].last_error = 'Meta said: token expired';
  assert.equal((await markHold(env, d, accts[0], 'brief', 'daily', DAY, DAY)).reason, 'Numbers look incomplete: the Meta sync is failing');
});
await ok('a weekly report: a missing day holds; full and synced numbers do not; listHolds by brand', async () => {
  fresh();
  const start = '2026-03-02', end = '2026-03-08';
  for (let i = 0; i < 7; i++) { const dt = addDays(start, i); if (i !== 3) tw(dt, 800, '2026-03-09 09:00:00'); spend(dt, 300); }
  db.exec(`INSERT INTO reports VALUES ('brand_northlake_golf', 'weekly', '${start}', 'draft')`);
  assert.match((await markHold(env, d, accts[0], 'report', 'weekly', start, end)).reason, /no numbers for 1 day/);
  assert.equal((await listHolds(env, 'brand_northlake_golf')).length, 1); assert.equal((await listHolds(env, 'brand_other')).length, 0);
  tw(addDays(start, 3), 800, '2026-03-09 09:00:00');
  assert.equal(await markHold(env, d, accts[0], 'report', 'weekly', start, end), null);
  assert.equal((await listHolds(env, 'all')).length, 0);
});
await ok('holdFacts reads stored rows only', async () => {
  fresh(); tw(DAY, 500, '2026-03-11 09:00:00'); spend(DAY, 120);
  const f = await holdFacts(env, d, accts[0], DAY, DAY);
  assert.deepEqual(f, { tw: true, twSynced: true, missingDays: 0, sales: 500, spend: 120, syncError: false });
});
await ok('wired: the draft builders mark holds, the hourly tick rechecks, the route is team only', async () => {
  const w = readFileSync(new URL('./src/worker.js', import.meta.url), 'utf8');
  assert.match(w, /markHold\(env, holdDeps\(\), actId, 'brief', 'daily', date, date\)/);
  assert.match(w, /markHold\(env, holdDeps\(\), acct, 'report', period, start, end\)/);
  assert.match(w, /ran\.draftHolds = await recheckHolds\(env, holdDeps\(\)\)/);
  assert.match(w, /path === '\/api\/draft-holds' && request\.method === 'GET'/);
  const g = readFileSync(new URL('./src/brandguard.js', import.meta.url), 'utf8');
  assert.ok(!g.includes('/api/draft-holds'), 'not on the client allowlist: a client login is refused');
});

console.log(process.exitCode ? 'test-drafthold: FAILED' : `test-drafthold: ${n} checks passed`);
