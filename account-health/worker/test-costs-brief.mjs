/* Offline checks for BRAND COSTS and NET PROFIT AFTER FIXED COSTS in the Daily Brief and the reports (2026-11-25).
 *   node --import <a loader that stubs .wasm> test-costs-brief.mjs      (from account-health/worker)
 *   ... test-costs-brief.mjs --capture   prints the hashes below. Run it on the commit BEFORE this change (copy this
 *       file beside that commit's src/, and add to the end of its src/worker.js:
 *       export { econDay, briefData, reportData, buildBriefText, buildBriefTextV2, reportHeadline, spendFor };)
 *       to refresh MAIN when the brief or the report is changed on purpose.
 * A real SQLite (node:sqlite) stands in for D1, the clock is frozen, the brands are made up.
 *
 * THE SAFETY PROPERTY: a brand with no cost rule and no fixed cost gets the same brief data, brief text, report data
 * and report headline as before, whether the new tables exist or not, and whatever another brand has set. */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const CAPTURE = process.argv.includes('--capture');
/* What the commit before this change produced for the same seed and the same frozen clock (sha256, first 16). */
const MAIN = { brief: '98d0262dcc901cda', text1: '84d87e3a03aba8c5', text2: '2e5210a5ce6facbf', report: 'e800191e61ba83ee', headline: '20367b4e9e604d4c' };

const RealDate = Date, NOW = RealDate.parse('2026-10-20T18:00:00Z');
globalThis.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } };

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const db = new DatabaseSync(':memory:');
const bindSql = sql => { let hi = 0; return sql.replace(/\?(\d*)/g, (_, n) => { if (n) { hi = Math.max(hi, +n); return ':p' + n; } hi++; return ':p' + hi; }); };
const vals = (a, sql) => { const used = new Set([...bindSql(sql).matchAll(/:p(\d+)/g)].map(m => 'p' + m[1])); return Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]).filter(([k]) => used.has(k))); };
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args, sql)) || null; }, async all() { return { results: st().all(vals(args, sql)) }; }, async run() { const r = st().run(vals(args, sql)); return { meta: { changes: Number(r.changes) } }; } }; };
const DB = { prepare: stmt, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied */ } } };
load(path.join(root, 'profit', 'worker', 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'migrations', 'brand-001.sql'));
load(path.join(here, 'schema.sql'));
/* A database from before this change: no cost rule table, no cost sheet table, no expense table. */
db.exec('DROP TABLE IF EXISTS p_cost_rule; DROP TABLE IF EXISTS p_product_cost; DROP TABLE IF EXISTS p_expense;');

db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, source) VALUES
  ('brand_alpha', 'alpha', 'Alpha Golf', 'active', 'USD', 'America/Chicago', 'locus'),
  ('brand_beta', 'beta', 'Beta Socks', 'active', 'USD', 'America/Chicago', 'locus')`);
const rnd = (seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; });
const addDay = (d, n) => { const t = new RealDate(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const cents = x => Math.round(x * 100) / 100;
{
  const r = rnd(7), put = db.prepare(`INSERT INTO tw_daily (act_id, date, metric, value, synced_at) VALUES (?, ?, ?, ?, '2026-10-20 06:00:00')`);
  for (let d = '2026-08-01'; d <= '2026-10-19'; d = addDay(d, 1)) {
    for (const act of ['brand_alpha', 'brand_beta']) {
      const orders = 20 + Math.floor(r() * 30), net = cents(orders * (55 + r() * 20)), ship = cents(orders * 6), tax = cents(net * 0.07), total = cents(net + ship + tax);
      const m = { netSales: total, totalNetTaxes: tax, totalShippingPrice: ship, totalOrders: orders, newCustomersOrders: Math.floor(orders * 0.6), blendedAds: cents(total * (0.2 + r() * 0.1)),
        newCustomerSales: cents(total * 0.55), rcRevenue: cents(total * 0.45), totalPaymentGatewayCosts: cents(total * 0.03),
        totalProductCosts: cents(net * (0.28 + r() * 0.04)), totalShippingCosts: cents(orders * 7.5), totalHandlingFees: cents(orders * 0.5) };
      for (const [k, v] of Object.entries(m)) put.run(act, d, k, v);
    }
  }
}
const goals = JSON.stringify({ '2026-10': { sales: 90000, spend: 22000 } });
const ACCT = id => ({ act_id: id, name: id === 'brand_alpha' ? 'Alpha Golf' : 'Beta Socks', currency: 'USD', tz: 'America/Chicago', goals_json: goals, brief_enabled: 1 });

const AH = await import('./src/worker.js');
const env = { DB };
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const UP = '2026-10-19', WK = ['2026-10-05', '2026-10-11'];
async function capture(act = 'brand_alpha') {
  const brief = await AH.briefData(env, ACCT(act), UP);
  const report = await AH.reportData(env, ACCT(act), 'weekly', WK[0], WK[1]);
  return { brief: JSON.stringify(brief), text1: AH.buildBriefText(brief, [UP], 'Notes.'), text2: AH.buildBriefTextV2(brief, [UP], 'Headline: A day.\nNotes.'),
    report: JSON.stringify(report), headline: AH.reportHeadline(report), _brief: brief, _report: report };
}
const KEYS = ['brief', 'text1', 'text2', 'report', 'headline'];
const first = await capture();          // taken while none of the three tables exists

if (CAPTURE) {
  console.log(`const MAIN = { ${KEYS.map(k => `${k}: '${hash(first[k])}'`).join(', ')} };`);
  process.exit(0);
}

const PW = await import('../../profit/worker/src/worker.js');
const X = await import('../../profit/worker/src/expenses.js');
const C = await import('../../profit/worker/src/costs.js');
const results = [];
async function check(name, fn) { try { await fn(); results.push(true); console.log('PASS ', name); } catch (e) { results.push(false); console.log('FAIL ', name, '\n      ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n      ')); } }
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg}: ${a} != ${b}`);
const same = (a, b, msg) => { for (const k of KEYS) assert.equal(a[k], b[k], `${k}: ${msg}`); };

/* ---------------- the golden copy of econDay ---------------- */
/* econDay as it stood on the commit before this change, pasted verbatim (worker.js). twDay and TW_SALES are pasted with
   it; spendFor is the worker's own, which this change does not touch. */
const TW_SALES = ['netSales', 'totalSales'];
function twDay(piv, date, ids) { for (const id of ids) { const v = piv[id]?.[date]; if (v != null) return v; } return null; }
const spendFor = AH.spendFor;
function econDayV0(piv, metaBy, date, cmPct) {
  const totalSales = twDay(piv, date, TW_SALES);
  if (totalSales == null) return null;
  const tax = piv.totalNetTaxes?.[date] ?? 0;
  const sales = totalSales - tax;
  const shipCost = piv.totalShippingCosts?.[date] ?? 0;
  const handling = piv.totalHandlingFees?.[date] ?? 0;
  const cogs = piv.totalProductCosts?.[date] ?? null;
  const fees = piv.totalPaymentGatewayCosts?.[date] ?? null;
  const mrow = metaBy[date];
  const gSpend = piv.ga_adCost?.[date] ?? null;
  // Same guard as the Daily Brief: a blended total that contradicts Meta's own
  // API is rebuilt rather than believed. The weekly report sums these days, so
  // an unchecked one understates a whole week's spend.
  const sp = spendFor(piv, date, mrow?.spend ?? null);
  const spend = sp.spend;
  const rawNew = piv.newCustomerSales?.[date] ?? null;
  const rawRet = piv.rcRevenue?.[date] ?? null;
  const split = (rawNew ?? 0) + (rawRet ?? 0);
  const newShare = split > 0 && rawNew != null ? rawNew / split : null;
  const newRev = newShare != null ? sales * newShare : rawNew;
  const variable = cogs != null ? cogs + shipCost + handling + (fees ?? 0) : null;
  const gp = cmPct != null ? sales * cmPct : variable != null ? sales - variable : null;
  return {
    date, sales, spend,
    orders: piv.totalOrders?.[date] ?? null,
    new_rev: newRev,
    ret_rev: newShare != null ? sales * (1 - newShare) : rawRet,
    new_orders: piv.newCustomersOrders?.[date] ?? null,
    meta_spend: mrow?.spend ?? null, google_spend: gSpend, spend_source: sp.source,
    gp, margin: sales > 0 && gp != null ? gp / sales : null,
    cm: gp != null && spend != null ? gp - spend : null,
  };
}
const METRICS = ['netSales', 'totalSales', 'totalNetTaxes', 'totalShippingPrice', 'totalShippingCosts', 'totalHandlingFees', 'ga_adCost', 'blendedAds', 'fb_ads_spend', 'newCustomerSales', 'rcRevenue',
  'totalProductCosts', 'totalPaymentGatewayCosts', 'totalOrders', 'newCustomersOrders'];
const D = '2026-10-10';
const NO_RULE = [undefined, null, [],
  [{ id: 1, cost: 'shipping', rule: 'per_order', source: 'typed', amount: 9, start_date: '2026-11-01', end_date: null, status: 'on' }],
  [{ id: 2, cost: 'product', rule: 'pct_revenue', source: 'typed', amount: 30, start_date: '2026-01-01', end_date: '2026-09-30', status: 'on' }],
  [{ id: 3, cost: 'shipping', rule: 'per_order', source: 'typed', amount: 9, start_date: '2026-01-01', end_date: null, status: 'off' }],
  [{ id: 4, cost: 'shipping', rule: 'weight_tier', source: 'typed', table_json: '[{"min":0,"max":1,"amount":5}]', start_date: '2026-01-01', status: 'on' }, { id: 6, cost: 'product', rule: 'per_item', source: 'typed', amount: 4, start_date: '2026-01-01', status: 'on' }],
];
await check('econDay with no rule equals the old function, byte for byte, over 2,000 random days', () => {
  assert.equal(typeof AH.econDay, 'function');
  const r = rnd(2026);
  let withRow = 0;
  for (let i = 0; i < 2000; i++) {
    const piv = {};
    for (const m of METRICS) { const k = r(); if (k < 0.15) continue; if (k < 0.25) { piv[m] = {}; continue; } piv[m] = { [D]: k < 0.32 ? null : k < 0.42 ? 0 : k < 0.5 ? -cents(r() * 500) : cents(r() * 5000) }; }
    const meta = r() < 0.5 ? {} : { [D]: { spend: cents(r() * 800) } }, m = r() < 0.5 ? null : 0.6;
    const want = JSON.stringify(econDayV0(piv, meta, D, m));
    if (want !== 'null') withRow++;
    assert.equal(JSON.stringify(AH.econDay(piv, meta, D, m)), want, `day ${i}`);
    for (const [k, rules] of NO_RULE.entries()) assert.equal(JSON.stringify(AH.econDay(piv, meta, D, m, rules)), want, `day ${i}, no-rule input ${k}`);
  }
  assert.ok(withRow > 1000);
});
await check('with a rule, econDay prices the day exactly like the profit worker\'s dayEconomics, and adds no key', () => {
  const rules = [{ id: 1, cost: 'shipping', rule: 'per_order', source: 'typed', amount: 5, start_date: '2026-10-01', status: 'on' }, { id: 2, cost: 'product', rule: 'pct_revenue', source: 'typed', amount: 30, start_date: '2026-10-05', status: 'on' }];
  const r = rnd(11);
  for (let i = 0; i < 300; i++) {
    const orders = Math.floor(r() * 80), total = cents(500 + r() * 6000), d = r() < 0.5 ? '2026-10-03' : '2026-10-08';
    const piv = { netSales: { [d]: total }, totalNetTaxes: { [d]: cents(total * 0.06) }, totalOrders: { [d]: orders }, totalShippingCosts: { [d]: 40 }, totalHandlingFees: { [d]: 12 }, totalPaymentGatewayCosts: { [d]: cents(total * 0.03) }, blendedAds: { [d]: 900 } };
    if (r() < 0.7) piv.totalProductCosts = { [d]: cents(total * 0.25) };
    const a = AH.econDay(piv, {}, d, null, rules), p = PW.dayEconomics(piv, {}, d, null, rules);
    assert.equal(a.gp, p.gross_profit, `gross profit, day ${i}`); assert.equal(a.margin, p.margin);
    assert.deepEqual(Object.keys(a), Object.keys(econDayV0(piv, {}, d, null)), 'the row keeps the same keys');
    near(p.ship_cost, orders * 5, 'the rule priced shipping');
    if (d === '2026-10-08') near(p.cogs, (total - cents(total * 0.06)) * 0.3, 'and product cost from Oct 5');
  }
});

/* ---------------- brief and report, through the database ---------------- */
await check('with the new tables missing, brief data, both brief texts, report data and the headline are what the commit before produced', () => {
  /* STORE SOURCE (2026-11-26, profit storesource.js): brief and report data carry store_source + store_label. With no
     Shopify rows they say Triple Whale, not synced yet; without those two keys the payload is the one MAIN hashed. */
  const noStore = (k, s) => {
    if (k !== 'brief' && k !== 'report') return s;
    const j = JSON.parse(s);
    assert.equal(j.store_source, 'triple_whale', `${k} names its store source`);
    assert.equal(j.store_label, 'Store numbers: Triple Whale (Shopify not synced yet)');
    delete j.store_source; delete j.store_label;
    return JSON.stringify(j);
  };
  for (const k of KEYS) assert.equal(hash(noStore(k, first[k])), MAIN[k], `${k} changed for a brand with no cost rule and no fixed cost`);
  assert.ok(first._brief.mtd.cm != null && first._report.totals.cm != null, 'and the seed does produce a contribution margin');
});
await check('the tables existing but empty for this brand changes nothing; neither does a rule or a fixed cost on ANOTHER brand', async () => {
  await C.ensure(env); await X.ensure(env);
  same(await capture(), first, 'empty tables');
  db.exec(`INSERT INTO p_cost_rule (act_id, cost, rule, source, amount, start_date, status) VALUES ('brand_beta', 'shipping', 'per_order', 'typed', 3, '2026-09-01', 'on'), ('brand_beta', 'product', 'pct_revenue', 'typed', 40, '2026-09-01', 'on')`);
  db.exec(`INSERT INTO p_expense (act_id, name, category, kind, amount, start_date) VALUES ('brand_beta', 'Rent', 'rent', 'monthly', 3100, '2026-09-01')`);
  db.exec(`INSERT INTO settings (key, value) VALUES ('costsNetInPosts', '1')`);
  same(await capture(), first, 'another brand\'s rule, fixed cost and the posts switch');
  /* rules that never apply to this brand's days */
  db.exec(`INSERT INTO p_cost_rule (act_id, cost, rule, source, amount, table_json, start_date, end_date, status) VALUES
    ('brand_alpha', 'shipping', 'per_order', 'typed', 9, NULL, '2026-01-01', NULL, 'off'),
    ('brand_alpha', 'shipping', 'zone', 'typed', NULL, '[{"zone":"US","amount":6}]', '2026-01-01', NULL, 'on'),
    ('brand_alpha', 'product', 'per_item', 'typed', 4, NULL, '2026-01-01', NULL, 'on'),
    ('brand_alpha', 'product', 'pct_revenue', 'typed', 30, NULL, '2027-01-01', NULL, 'on')`);
  same(await capture(), first, 'an off rule, saved-only rules and a rule that has not started');
  db.exec(`DELETE FROM p_cost_rule WHERE act_id = 'brand_alpha'`);
});
await check('a rule on this brand moves its brief and report from the start date, the way the profit worker prices it', async () => {
  const beta0 = await capture('brand_beta');
  db.exec(`DELETE FROM p_cost_rule; DELETE FROM p_expense;`);
  const betaPlain = await capture('brand_beta');
  const day = (c, d) => c._brief.days.find(x => x.date === d).a;
  const a = day(beta0, '2026-10-15'), b = day(betaPlain, '2026-10-15');
  near(a.ship_cost, a.orders * 3, 'per order shipping'); near(a.cogs, a.sales * 0.4, '40% of revenue');
  near(a.cm, a.sales - a.cogs - a.ship_cost - a.handling - a.fees - a.spend, 'CM uses the rule figures');
  assert.notEqual(a.cm, b.cm); assert.equal(a.sales, b.sales); assert.equal(a.spend, b.spend);
  assert.notEqual(beta0._brief.margin_28d, betaPlain._brief.margin_28d, 'the 28-day margin gate sees the rule too');
  const rule = [{ id: 1, cost: 'shipping', rule: 'per_order', source: 'typed', amount: 3, start_date: '2026-09-01', status: 'on' }, { id: 2, cost: 'product', rule: 'pct_revenue', source: 'typed', amount: 40, start_date: '2026-09-01', status: 'on' }];
  const piv = {}; for (const r of db.prepare(`SELECT date, metric, value FROM tw_daily WHERE act_id = 'brand_beta' AND date BETWEEN '2026-10-05' AND '2026-10-11'`).all()) (piv[r.metric] ??= {})[r.date] = r.value;
  let gp = 0; for (let d = WK[0]; d <= WK[1]; d = addDay(d, 1)) gp += PW.dayEconomics(piv, {}, d, null, rule).gross_profit;
  near(beta0._report.totals.gp, gp, 'the report week adds up to the profit worker\'s gross profit');
  assert.notEqual(beta0._report.totals.cm, betaPlain._report.totals.cm);
  /* shipping charged with no Triple Whale cost: a Locus shipping rule clears the "uncosted" flag */
  db.exec(`DELETE FROM tw_daily WHERE act_id = 'brand_beta' AND metric = 'totalShippingCosts'`);
  assert.equal((await AH.briefData(env, ACCT('brand_beta'), UP)).shipping_mode, 'uncosted');
  db.exec(`INSERT INTO p_cost_rule (act_id, cost, rule, source, amount, start_date, status) VALUES ('brand_beta', 'shipping', 'per_order', 'typed', 3, '2026-09-01', 'on')`);
  assert.equal((await AH.briefData(env, ACCT('brand_beta'), UP)).shipping_mode, 'costed');
  db.exec(`DELETE FROM p_cost_rule`);
  same(await capture(), first, 'brand_alpha never moved');
});

/* ---------------- net profit after fixed costs ---------------- */
await check('a fixed cost adds net profit to the brief payload; a report and every Slack text carry it only when costsNetInPosts is on, and the rows add up', async () => {
  db.exec(`DELETE FROM settings WHERE key = 'costsNetInPosts'`);
  db.exec(`INSERT INTO p_expense (act_id, name, category, kind, amount, start_date, is_ad_spend, notes) VALUES
    ('brand_alpha', 'Warehouse', 'rent', 'monthly', 3100, '2026-09-01', 0, 'private note'),
    ('brand_alpha', 'Outside help', 'Contractors', 'monthly', 6200, '2026-10-01', 0, NULL),
    ('brand_alpha', 'Podcast read', 'marketing', 'once', 500, '2026-10-07', 1, NULL)`);
  const c = await capture();
  const b = c._brief, a = b.days.find(x => x.date === UP).a, a0 = first._brief.days.find(x => x.date === UP).a;
  near(a.fixed, 300, 'rent 100 + outside help 200 a day'); assert.equal(a.ad_expense, 0); near(a.net, a.cm - 300, 'day net');
  assert.equal(a.cm, a0.cm, 'contribution margin itself is unchanged');
  const fm = b.fixed.mtd;
  near(fm.fixed, 19 * 300, 'month to date'); near(fm.ad_expense, 500, 'the "counts as ad spend" row'); near(fm.net, b.mtd.cm - 5700 - 500, 'brief CM has no ad expenses in it, so they come off here');
  assert.equal(b.mtd.cm, first._brief.mtd.cm);
  /* The narrative prompts hand the whole mtd object to the model, so net profit must never sit on it. */
  assert.deepEqual(b.mtd, first._brief.mtd, 'mtd is exactly what the model was given before: no fixed, no ad_expense, no net');
  /* the brief payload is the team's: categories by the brand's own names stay here */
  assert.deepEqual(b.fixed, { by_category: [{ category: 'Contractors', label: 'Contractors', amount: 3800 }, { category: 'rent', label: 'Rent and premises', amount: 1900 }], in_posts: false,
    mtd: { fixed: fm.fixed, ad_expense: fm.ad_expense, net: fm.net } });
  assert.ok(!/Warehouse|Outside help|Podcast|private note/.test(c.brief + c.report), 'never a row\'s name or note');
  assert.equal(c.text1, first.text1, 'the posts switch is off: the v1 text is exactly as before');
  assert.equal(c.text2, first.text2, 'and the v2 text');
  /* THE SWITCH IS OFF: a newly generated report is a client page and carries NO fixed or net field at all */
  assert.equal(c.report, first.report, 'switch off: the report is byte for byte the report of a brand with no fixed cost');
  assert.ok(!('fixed' in c._report) && !('net' in c._report.totals) && !('fixed' in c._report.totals) && !('ad_expense' in c._report.totals) && !('net' in c._report.previous), 'no field a client page would render');
  assert.equal(c.headline, first.headline, 'the posts switch is off: the report headline is exactly as before');
  /* The client post a report sends (clientReportText, which reportFallbackPass sends with no person pressing Send). */
  const row = { period: 'weekly', period_start: WK[0], period_end: WK[1] };
  const post0 = await AH.clientReportText(env, ACCT('brand_alpha'), row, first._report);
  const postOff = await AH.clientReportText(env, ACCT('brand_alpha'), row, c._report);
  /* 2026-11-26 (the client reports rebuild): contribution margin rides the same frozen switch as net profit in the post. */
  assert.ok(!post0.includes('Contribution margin') && !post0.includes('Net profit'));
  assert.equal(postOff, post0, 'the posts switch is off: the weekly client post is exactly as before, net profit and its footnote absent');

  db.exec(`INSERT INTO settings (key, value) VALUES ('costsNetInPosts', '1')`);
  const on = await capture();
  assert.equal(on._brief.fixed.in_posts, true);
  /* a report generated with the switch on: one fixed costs total, the extra ad costs, net profit. No categories. */
  const t = on._report.totals, p = on._report.previous;
  assert.deepEqual(on._report.fixed, { in_posts: true }, 'the choice is frozen into the report, and no category rides along');
  assert.ok(!/by_category|Contractors|Rent and premises/.test(on.report), 'no per-category rows on a client page');
  near(t.fixed, 7 * 300, 'report week'); near(t.ad_expense, 500, 'the podcast read fell in this week'); near(t.net, t.cm - 2100 - 500, 'report net');
  near(p.fixed, 3 * 3100 / 30 + 4 * 300, 'the week before (Sep 28 to Oct 4): rent only in September, outside help from Oct 1'); near(p.net, p.cm - 1510, 'previous net');
  assert.equal(t.cm, first._report.totals.cm, 'contribution margin does not depend on the switch');
  /* THE SCREEN ADDS UP with both kinds of row (a fixed cost and a "counts as ad spend" cost): cm - fixed - extra ad = net */
  assert.equal(Math.round((t.cm - t.fixed - t.ad_expense) * 100), Math.round(t.net * 100), 'report: contribution margin minus the two lines shown is net profit, exactly');
  assert.equal(Math.round((b.mtd.cm - fm.fixed - fm.ad_expense) * 100), Math.round(fm.net * 100), 'brief month: the same');
  const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  assert.ok(on.headline.startsWith(first.headline + `\n• *Fixed costs* ${money(t.fixed)}\n• *Extra ad costs* ${money(500)}\n• *Net profit* ${money(t.net)}`), on.headline);
  const postOn = await AH.clientReportText(env, ACCT('brand_alpha'), row, on._report);
  assert.ok(postOn.includes(`• Fixed costs: *${money(t.fixed)}*\n• Extra ad costs: *$500*\n• Net profit: *${money(t.net)}* (was ${money(p.net)})`), postOn);
  assert.equal(postOn.split('• Net profit').length - 1, 1, 'switch on: the weekly client post prints it once');
  /* FROZEN AT GENERATION: the headline and the client post read the report's own value and cannot disagree, whatever
     the switch says when the text is built. */
  db.exec(`DELETE FROM settings WHERE key = 'costsNetInPosts'`);
  assert.equal(await AH.clientReportText(env, ACCT('brand_alpha'), row, on._report), postOn, 'a report generated ON still prints net after the switch goes off');
  assert.equal(AH.reportHeadline(on._report), on.headline, 'and so does its headline');
  db.exec(`INSERT INTO settings (key, value) VALUES ('costsNetInPosts', '1')`);
  assert.equal(await AH.clientReportText(env, ACCT('brand_alpha'), row, c._report), post0, 'a report generated OFF prints none after the switch goes on');
  assert.equal(AH.reportHeadline(c._report), first.headline, 'and neither does its headline');
  /* even a report whose totals somehow hold net but whose frozen value is not on: both stay silent together */
  const odd = { ...on._report, fixed: undefined };
  assert.ok(!AH.reportHeadline(odd).includes('Net profit') && !(await AH.clientReportText(env, ACCT('brand_alpha'), row, odd)).includes('Net profit'), 'no frozen yes, no net anywhere');
  assert.deepEqual(on._brief.mtd, first._brief.mtd, 'and mtd still carries no net profit for the model');
  assert.ok(on.text1.includes(`Contribution Margin: *${money(a.cm)}*`) && on.text1.includes(`Fixed costs: *${money(a.fixed)}*\nNet profit: *${money(a.net)}*`), on.text1);
  assert.equal(on.text1.split('Net profit').length - 1, 1, 'v1: once, for the day');
  assert.ok(on.text2.includes(`Fixed costs: *${money(a.fixed)}*\nNet profit: *${money(a.net)}*`), on.text2);
  assert.ok(on.text2.includes(`Fixed costs: *${money(fm.fixed)}*\nExtra ad costs: *$500*\nNet profit: *${money(fm.net)}*`), 'v2 month: the extra ad costs row sits between, so the three add up\n' + on.text2);
  assert.equal(on.text2.split('Net profit').length - 1, 2, 'v2: the day and the month so far');
  assert.ok(!/after fixed costs|agency/i.test(on.text1 + on.text2 + on.headline + postOn + on.report + on.brief), 'no "agency" wording and one label, "Net profit"');
  /* the cost check not trusted: the builders print neither CM nor net */
  const broken = { ...on._brief, cogs_quality: { verdict: 'broken' } };
  assert.ok(!AH.buildBriefText(broken, [UP], '').includes('Net profit') && !AH.buildBriefTextV2(broken, [UP], '').includes('Net profit'));
  /* fixed costs removed: everything is back to the first bytes, switch still on */
  db.exec(`DELETE FROM p_expense`);
  same(await capture(), first, 'back to the start');
});
await check('a brand whose only fixed cost is a "counts as ad spend" row, or whose CM is hidden, gets no net profit', async () => {
  db.exec(`INSERT INTO p_expense (act_id, name, category, kind, amount, start_date, is_ad_spend) VALUES ('brand_alpha', 'Podcast read', 'marketing', 'once', 500, '2026-10-07', 1)`);
  same(await capture(), first, 'an ad-spend row alone adds nothing');
  db.exec(`DELETE FROM p_expense; INSERT INTO p_expense (act_id, name, category, kind, amount, start_date) VALUES ('brand_alpha', 'Rent', 'rent', 'monthly', 3100, '2026-09-01')`);
  db.exec(`DELETE FROM tw_daily WHERE act_id = 'brand_alpha' AND metric = 'totalProductCosts'`);
  const c = await capture();
  assert.equal(c._report.cm_ok, false); assert.ok(!('net' in c._report.totals) && !('fixed' in c._report), 'report: no CM, no net profit');
  assert.ok(!('fixed' in c._brief) && !('net' in c._brief.mtd), 'brief: no CM, no net profit');
  assert.ok(!c.headline.includes('Net profit'));
});
await check('a product rule that starts inside the window: the report withholds margin and net, the brief counts fixed costs on the costed days only', async () => {
  /* brand_alpha has no Triple Whale product cost left (deleted above), a monthly rent of 3,100 and the posts switch on. */
  db.exec(`INSERT INTO p_cost_rule (act_id, cost, rule, source, amount, start_date, status) VALUES ('brand_alpha', 'product', 'pct_revenue', 'typed', 40, '2026-10-15', 'on')`);
  const c = await capture(), b = c._brief;
  const costed = b.days.filter(x => x.date <= UP && x.a && x.a.cm != null).map(x => x.date);
  assert.deepEqual(costed, ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19'], 'only the days from the rule start have a margin');
  near(b.fixed.mtd.fixed, 5 * 100, 'five costed days of rent, not nineteen'); near(b.fixed.mtd.net, b.mtd.cm - 500, 'net and CM cover the same five days');
  /* the report week Oct 5 to 11 is all before the rule: no margin at all, as before the rule */
  assert.equal(c._report.totals.cm, null); assert.ok(!('net' in c._report.totals));
  /* a week only partly under the rule (Oct 12 to 18, the rule ends Oct 13): two costed days out of seven. The 28 days
     before the week are all ruled, so the cost check passes and only the one-window guard stands in the way. */
  db.exec(`UPDATE p_cost_rule SET start_date = '2026-09-01', end_date = '2026-10-13' WHERE act_id = 'brand_alpha'`);
  const mid = await AH.reportData(env, ACCT('brand_alpha'), 'weekly', '2026-10-12', '2026-10-18');
  assert.equal(mid.cm_ok, true, 'the cost check itself passes on the ruled days');
  assert.equal(mid.totals.cm, null, 'gross profit of 2 days minus ad spend of 7 is not shown'); assert.equal(mid.totals.gp, null); assert.equal(mid.totals.margin, null);
  assert.ok(mid.previous.cm != null && mid.previous.net != null, 'the week before is wholly ruled and keeps its margin and net');
  assert.ok(!('net' in mid.totals) && !('fixed' in mid), 'and no net profit');
  assert.ok(mid.totals.sales > 0 && mid.totals.spend > 0, 'sales and spend are untouched');
  assert.ok(!AH.reportHeadline(mid).includes('Contribution margin') && !AH.reportHeadline(mid).includes('Net profit'));
  /* storePeriod (the Strategist's store view) prices with the same rules and withholds the same way */
  const sp = await AH.storePeriod(env, ACCT('brand_alpha'), '2026-10-12', '2026-10-18');
  assert.equal(sp.contribution_margin, null); assert.equal(sp.gross_margin_pct, null);
  /* the rule open ended again: one window, so margin and net are back, and storePeriod agrees with the report */
  db.exec(`UPDATE p_cost_rule SET end_date = NULL WHERE act_id = 'brand_alpha'`);
  const full = await AH.reportData(env, ACCT('brand_alpha'), 'weekly', '2026-10-12', '2026-10-18');
  assert.ok(full.totals.cm != null); near(full.totals.net, full.totals.cm - 700, 'seven days of rent against seven days of margin');
  const sp2 = await AH.storePeriod(env, ACCT('brand_alpha'), '2026-10-12', '2026-10-18');
  near(sp2.contribution_margin, full.totals.cm, 'storePeriod and the report give the same contribution margin for a ruled brand');
  near(sp2.gross_margin_pct, full.totals.margin, 'and the same gross margin');
  db.exec(`DELETE FROM p_cost_rule; DELETE FROM p_expense;`);
});

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
