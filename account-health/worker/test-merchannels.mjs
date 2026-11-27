/* Sales that count toward MER in account-health (2026-11-27, profit merchannels.js). Offline:
 *   node test-merchannels.mjs      (from account-health/worker)
 * The client daily divides the month's MER and aMER by counted sales (mer_sales / mer_new_rev) while Sales stays whole;
 * a payload without them reads as before. merday.js reads p_sales_channel + the brand's setting into left-out sales per
 * day, and a missing table reads as nothing left out. Sample brand and numbers are made up. */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { dailyCard, dailyPost } from './src/clientpost.js';
import { merExcluded, merExcludedMany, excludedSum } from './src/merday.js';

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); } catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.stack || e.message}`); }
}
const mkDb = () => {
  const db = new DatabaseSync(':memory:');
  const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
  const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : v]));
  const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { st().run(vals(args)); return {}; } }; };
  return { db, DB: { prepare: stmt } };
};

const BASE = { brand: 'Sample Golf', date: '2026-11-20', today: '2026-11-21', at: new Date('2026-11-21T13:05:00Z'), now: new Date('2026-11-21T13:05:00Z'), thread: false,
  day: { sales: 1000, spend: 500, mer: 1.6, amer: 0.8 } };
const rowOf = (plain, label) => plain.split('\n').filter(l => l.startsWith(label + ':'));

await check('client daily: the month MER and aMER divide counted sales; Sales and the Amazon row stay whole', () => {
  const m = dailyCard({ ...BASE, month: { ym: '2026-11', sales: 30000, mer_sales: 20000, spend: 10000, new_rev: 12000, mer_new_rev: 8000, day_of_month: 20, days_in_month: 30 },
    amazon: { day: { sales: 200, orders: 4 }, month: { sales: 10000, orders: 180 } } });
  assert.deepEqual(rowOf(m.plain, 'MER'), ['MER: *1.60x*', 'MER: *2.00x*'], 'day MER as given, month MER = 20,000 / 10,000');
  assert.deepEqual(rowOf(m.plain, 'aMER'), ['aMER: *0.80x*', 'aMER: *0.80x*'], 'month aMER = 8,000 / 10,000');
  assert.ok(m.plain.includes('Sales: *$1,000*') && m.plain.includes('Sales: *$30K*'), 'sales stay whole-store');
  assert.ok(m.plain.includes('Amazon: *$200*') && m.plain.includes('Amazon: *$10K*'), 'the Amazon row is unchanged');
});

await check('client daily: no mer_sales = whole-store MER exactly as before', () => {
  const m = dailyCard({ ...BASE, month: { ym: '2026-11', sales: 30000, spend: 10000, new_rev: 12000, day_of_month: 20, days_in_month: 30 } });
  assert.deepEqual(rowOf(m.plain, 'MER'), ['MER: *1.60x*', 'MER: *3.00x*']);
  assert.deepEqual(rowOf(m.plain, 'aMER'), ['aMER: *0.80x*', 'aMER: *1.20x*']);
});

await check('old daily text: the month MER line divides counted sales too', () => {
  const t = dailyPost({ brand: 'Sample Golf', date: '2026-11-20', day: { sales: 1000, spend: 500, mer: 1.6 }, month: { ym: '2026-11', sales: 30000, mer_sales: 24000, spend: 10000, day_of_month: 20, days_in_month: 30 } });
  assert.ok(t.includes('• MER: *2.40x*'), t);
  assert.ok(t.includes('• Sales: *$30K*'), 'sales stay whole');
});

await check('merday: left-out sales per day from p_sales_channel, the default rule and the brand setting; no table = nothing left out', async () => {
  const { db, DB } = mkDb();
  const env = { DB };
  assert.deepEqual(await merExcluded(env, 'brand_s', '2026-11-01', '2026-11-03'), {}, 'before the first sync: nothing left out');
  db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
  db.exec(`CREATE TABLE p_sales_channel (act_id TEXT, day TEXT, channel TEXT, sales REAL, orders INTEGER, synced_at TEXT, PRIMARY KEY (act_id, day, channel))`);
  db.exec(`INSERT INTO p_sales_channel (act_id, day, channel, sales, orders) VALUES
    ('brand_s', '2026-11-01', 'web', 900, 9), ('brand_s', '2026-11-01', 'amazon', 300, 6), ('brand_s', '2026-11-01', 'tag:wholesale', 100, 1),
    ('brand_s', '2026-11-02', 'web', 800, 8), ('brand_s', '2026-11-02', '420755537921', 50, 1),
    ('brand_s', '2026-11-04', 'amazon', 999, 9), ('brand_t', '2026-11-01', 'amazon', 70, 1)`);
  assert.deepEqual(await merExcluded(env, 'brand_s', '2026-11-01', '2026-11-03'), { '2026-11-01': 400, '2026-11-02': 50 }, 'Amazon, wholesale tag and Whatnot out by default; the window holds');
  db.exec(`INSERT INTO settings (key, value) VALUES ('merChannels:brand_s', '{"counts":{"amazon":true}}')`);
  assert.deepEqual(await merExcluded(env, 'brand_s', '2026-11-01', '2026-11-03'), { '2026-11-01': 100, '2026-11-02': 50 }, 'a brand that counts Amazon keeps it in MER');
  const many = await merExcludedMany(env, ['brand_s', 'brand_t'], '2026-11-01', '2026-11-02');
  assert.deepEqual(many, { brand_s: { '2026-11-01': 100, '2026-11-02': 50 }, brand_t: { '2026-11-01': 70 } });
  assert.equal(excludedSum(many.brand_s, '2026-11-01', '2026-11-02'), 150);
});

console.log(`\n${passed}/${passed + failed} passed`);
if (failed) process.exit(1);
