/* Offline checks for the daily ad calls (src/hub.js buyerList, the funnel role pass 2026-10-26).
 *   node test-calls.mjs      (from profit/worker)
 * A real SQLite (node:sqlite) stands in for D1. Checks: an opener (first click credits it at goal) is kept as Mixed, never
 * Cut; a closer with no first-click credit is still Cut; a set under the brand's min days is never called; a small ad that
 * opens journeys is kept instead of Trimmed; every why carries days, spend vs needed, CPA vs goal, CTR, CPM, frequency and
 * the hook rate for video. */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE connections (id TEXT, brand_id TEXT, kind TEXT, external_id TEXT, last_error TEXT);
  CREATE TABLE tw_ad_attr (act_id TEXT, date TEXT, ad_id TEXT, model TEXT, revenue REAL, orders REAL, platform TEXT);
  CREATE TABLE p_br_doc (act_id TEXT, line_id TEXT, key TEXT, data_json TEXT);
  CREATE TABLE daily_insights (act_id TEXT, date TEXT, spend REAL);
  CREATE TABLE ad_daily (act_id TEXT, ad_id TEXT, date TEXT, spend REAL, impressions INTEGER, reach INTEGER, link_clicks INTEGER, leads REAL, video_3s INTEGER);
  CREATE TABLE ads (act_id TEXT, ad_id TEXT, name TEXT, adset_id TEXT, campaign_id TEXT, created_time TEXT, first_spend_date TEXT);
  CREATE TABLE meta_adsets (act_id TEXT, adset_id TEXT, campaign_id TEXT, name TEXT, status TEXT, daily_budget REAL);
  CREATE TABLE meta_campaigns (act_id TEXT, campaign_id TEXT, objective TEXT);
  CREATE TABLE tw_order_touch (act_id TEXT, order_id TEXT, date TEXT, model TEXT, platform TEXT, ad_id TEXT, weight REAL, click_date TEXT);
  CREATE TABLE tw_orders (act_id TEXT, order_id TEXT, customer_id TEXT, date TEXT, total REAL);`);
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { st().run(vals(args)); return {}; } }; };
const env = { DB: { prepare: stmt } };
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const ctx = { addDays, localDate: () => '2026-10-26' };
const T = '2026-10-25';
const ins = (t, ...v) => db.prepare(`INSERT INTO ${t} VALUES (${v.map(() => '?').join(',')})`).run(...v);

ins('connections', 'c1', 'brand_a', 'meta', 'act_1', null);
for (let k = 0; k <= 28; k += 7) ins('daily_insights', 'act_1', addDays(T, -k), 500);
ins('meta_campaigns', 'act_1', 'cmp1', 'OUTCOME_SALES');
const SETS = [['s1', 'Opener set'], ['s2', 'Closer set'], ['s3', 'Young set'], ['s4', 'Working set']];
for (const [id, name] of SETS) ins('meta_adsets', 'act_1', id, 'cmp1', name, 'ACTIVE', 100);
/* ad, set, first spend, $ a day, video 3s a day */
const ADS = [['a1', 's1', addDays(T, -9), 20, 0], ['a2', 's2', addDays(T, -9), 45, 400], ['a3', 's3', addDays(T, -1), 100, 0], ['a4', 's4', addDays(T, -9), 70, 0], ['a5', 's4', addDays(T, -9), 20, 0]];
for (const [ad, set, first, sp, v3] of ADS) {
  ins('ads', 'act_1', ad, `Ad ${ad}`, set, 'cmp1', `${first}T00:00:00Z`, first);
  for (let k = 0; k < 7; k++) { const d = addDays(T, -k); if (d >= first) ins('ad_daily', 'act_1', ad, d, sp, 2000, 1500, 30, 0, v3); }
}
const attr = (ad, model, ord, rev, d = T) => ins('tw_ad_attr', 'brand_a', d, ad, model, rev, ord, 'meta');
attr('a1', 'lastPlatformClick', 0, 0);              // last click: nothing
attr('a1', 'fullFirstClick', 4, 400);               // first click: 4 sales at $35 (goal $40)
attr('a2', 'lastPlatformClick', 1, 50);             // closer: 1 sale at $315, no first-click credit
attr('a4', 'lastPlatformClick', 20, 2000);          // the working main ad
attr('a5', 'fullFirstClick', 4, 380);               // small ad: 0 last click, 4 first-click sales at $35
/* a1's first-click orders: 3 of 4 are the customer's first order. */
ins('tw_orders', 'brand_a', 'old', 'cu4', addDays(T, -60), 90);
for (let i = 1; i <= 4; i++) { ins('tw_orders', 'brand_a', `o${i}`, `cu${i}`, T, 100); ins('tw_order_touch', 'brand_a', `o${i}`, T, 'fullFirstClick', 'meta', 'a1', 1, T); }

const { buyerList } = await import('./src/hub.js');
const out = await buyerList(env, ctx, [{ act_id: 'brand_a', name: 'Alpha', currency: 'USD', tz: 'America/Chicago', target_cpa: 40 }]);
const bySet = id => out.rows.filter(r => r.adset_id === id);
const checks = [];
async function check(name, fn) { try { await fn(); checks.push(true); console.log('PASS ', name); } catch (e) { checks.push(false); console.log('FAIL ', name, '\n      ' + e.message); } }

await check('opener kept: last click says cut, first click at goal turns it Mixed with no cut', () => {
  const r = bySet('s1');
  assert.equal(r.length, 1, JSON.stringify(r.map(x => x.kind)));
  assert.equal(r[0].kind, 'mixed'); assert.equal(r[0].kept_by, 'opener'); assert.equal(r[0].role, 'opener');
  assert.equal(r[0].first_click.fc_orders, 4); assert.equal(r[0].first_click.fc_new_share, 0.75);
  assert.match(r[0].why, /^Last click says cut \(\$140, 0 sales in 7 days\), but first click credits it with 4 sales at \$35 CPA and 75% new customers: it opens journeys\. Keep it; judge it on first click\./);
  assert.match(r[0].why, /10 days running \(3 needed\), \$140 spent \(\$80 needed to judge\), CPA none vs \$40 goal, CTR 1\.5%, CPM \$10, frequency 1\.3\./);
});
await check('closer cut: no first-click credit, still a Cut with the numbers', () => {
  const r = bySet('s2');
  assert.equal(r.length, 1); assert.equal(r[0].kind, 'cut'); assert.equal(r[0].role, 'closer'); assert.ok(!r[0].kept_by);
  assert.equal(r[0].first_click.fc_orders, 0);   // an ad with no first-click row counts 0, never NaN
  assert.match(r[0].why, /10 days running \(3 needed\), \$315 spent \(\$80 needed to judge\), CPA \$315 vs \$40 goal, CTR 1\.5%, CPM \$23, frequency 1\.3, hook rate 20%\./);
});
await check('min days respected: a 2-day set is never called, however much it spent', () => {
  assert.equal(bySet('s3').length, 0);
});
await check('trim guard: a small ad that opens journeys is kept, the main ad scales', () => {
  const r = bySet('s4');
  assert.deepEqual(r.map(x => x.kind).sort(), ['mixed', 'scale']);
  const m = r.find(x => x.kind === 'mixed');
  assert.equal(m.ad_id, 'a5'); assert.equal(m.kept_by, 'opener');
  assert.ok(!out.rows.some(x => x.kind === 'trim'));
  assert.match(r.find(x => x.kind === 'scale').why, /Raise the budget 20% and watch 3 days\. 10 days running, \$630 spent, CPA \$32 vs \$40 goal, CTR 1\.5%, CPM \$23, frequency 1\.3\.$/);
  assert.match(m.why, /^Last click says cut \(\$140, 0 sales in 7 days\), but first click credits it with 4 sales at \$35 CPA/);
});
await check('brand counts the openers kept; no em dashes anywhere', () => {
  assert.equal(out.brands[0].n_opener_kept, 2);
  assert.ok(!JSON.stringify(out).includes('—'));
});

/* Brand B (the 2026-10-26 live audit): the account is under goal ($74 a sale against $40). */
ins('connections', 'c2', 'brand_b', 'meta', 'act_2', null);
for (let k = 0; k <= 28; k += 7) ins('daily_insights', 'act_2', addDays(T, -k), 500);
ins('meta_campaigns', 'act_2', 'cmpS', 'OUTCOME_SALES'); ins('meta_campaigns', 'act_2', 'cmpL', 'OUTCOME_LEADS');
for (const [id, name, c] of [['b1', 'Best set', 'cmpS'], ['b2', 'Weak set', 'cmpS'], ['b3', 'Slow set', 'cmpS'], ['b4', 'Giveaway leads', 'cmpL']]) ins('meta_adsets', 'act_2', id, c, name, 'ACTIVE', 100);
/* ad, set, $ a day, days back from T it ran (from, to) */
const BADS = [['b1a', 'b1', 100, 0, 6], ['b2a', 'b2', 50, 0, 6], ['b2b', 'b2', 10, 0, 6], ['b3a', 'b3', 10, 0, 13], ['b4a', 'b4', 30, 0, 6]];
for (const [ad, set, sp, k0, k1] of BADS) {
  const first = addDays(T, -k1);
  ins('ads', 'act_2', ad, `Ad ${ad}`, set, set === 'b4' ? 'cmpL' : 'cmpS', `${first}T00:00:00Z`, first);
  for (let k = k0; k <= k1; k++) ins('ad_daily', 'act_2', ad, addDays(T, -k), sp, 2000, 1500, 30, 0, 0);
}
const battr = (ad, ord, d = T) => ins('tw_ad_attr', 'brand_b', d, ad, 'lastPlatformClick', ord * 100, ord, 'meta');
battr('b1a', 11);                       // $64 a sale: over the cut line, yet the account's best by far
battr('b2b', 2);                        // the weak set's small ad: 2 sales at $35
battr('b3a', 4, addDays(T, -10));       // the slow set: 4 sales at $35 over 14 days, none in the last 7
battr('b4a', 0);
const outB = await buyerList(env, ctx, [{ act_id: 'brand_b', name: 'Beta', currency: 'USD', tz: 'America/Chicago', target_cpa: 40 }]);
const rowB = id => outB.rows.filter(r => r.adset_id === id);
await check('best set kept: the account is under goal and this set holds most of its sales at better than the account', () => {
  const r = rowB('b1');
  assert.equal(r.length, 1); assert.equal(r[0].kind, 'mixed'); assert.equal(r[0].kept_by, 'best_set');
  assert.match(r[0].why, /^Last click says cut \(\$700, 11 sales at \$64 each in 7 days\), but this set brings 11 sales of the account's 13 sales at \$64 each, while the whole account runs \$92 a sale against the \$40 goal: it is the best you have\./);
  assert.equal(outB.brands[0].n_best_kept, 1);
});
await check('a cut set with a strong small ad names it: move it to a working set', () => {
  const r = rowB('b2');
  assert.equal(r.length, 1); assert.equal(r[0].kind, 'cut'); assert.equal(r[0].keep_ad.ad_id, 'b2b');
  assert.match(r[0].why, /; keep ad "Ad b2b" \(\$35 a sale on \$70, 2 sales\) and move it to a working set first\. /);
});
await check('scale needs the last 7 days: a slow set on goal over 14 days with no sale this week is not scaled', () => {
  assert.equal(rowB('b3').length, 0);
});
await check('lead set: never judged on sales rules, labelled "no lead goal set"', () => {
  assert.equal(rowB('b4').length, 0);
  assert.deepEqual(outB.brands[0].lead_no_goal, ['Giveaway leads']);
  assert.match(outB.brands[0].note, /"Giveaway leads"\) not judged: no lead goal set/);
});
console.log(`\n${checks.filter(Boolean).length}/${checks.length} passed`);
if (checks.some(c => !c)) process.exit(1);
