/* Offline checks for BRAND COSTS (src/costs.js, 2026-11-25) and net profit after fixed costs on the client profit link.
 *   node test-costs.mjs            (from profit/worker)
 *   node test-costs.mjs --capture  prints the hashes of the answers below; run on the commit BEFORE this change
 *                                  (copy this file beside that commit's src/) to refresh MAIN when one of the captured
 *                                  routes is changed on purpose.
 * A real SQLite (node:sqlite) stands in for D1, the clock is frozen, the brands are made up.
 *
 * THE SAFETY PROPERTY these checks prove: a brand with no cost rule and no fixed cost gets the same bytes as before.
 *   1. dayEconomics equals a pasted copy of the old function over 2,000 random days, with every "no rule" input.
 *   2. Through the real worker: a rule on ANOTHER brand, and a rule added then removed on this one, change nothing.
 *   3. With the new tables missing, the answers hash to what the commit before this change answered (MAIN).
 * Then: what a rule does to the money, the writes, the cost sheet, GET /api/costs, and the client profit link. */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const CAPTURE = process.argv.includes('--capture');
/* The answers of the commit before this change, for the same seed and the same frozen clock (sha256, first 16). */
const MAIN = {
  client: 'ab2ca84498a572c4', overview: 'f5035864888475f7', drill: 'd8301beaacb11a5b', kept: 'c42dc8bd8b92dcb6', profit: '97417201b1dbb0e3', profit_mtd: '87329c101a7cf256', costs_old: '200035a7a73a6a4d',
};

/* ---------------- a frozen clock ---------------- */
const RealDate = Date, NOW = RealDate.parse('2026-10-20T18:00:00Z');
globalThis.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } };

/* ---------------- an in-memory D1 ---------------- */
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
load(path.join(root, 'account-health', 'worker', 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'migrations', 'fixed-001.sql'));
/* A database from before this change: the two new tables do not exist until something makes them. */
db.exec('DROP TABLE IF EXISTS p_cost_rule; DROP TABLE IF EXISTS p_product_cost;');

/* ---------------- two made-up brands ---------------- */
db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, source) VALUES
  ('brand_alpha', 'alpha', 'Alpha Golf', 'active', 'USD', 'America/Chicago', 'locus'),
  ('brand_beta', 'beta', 'Beta Socks', 'active', 'USD', 'America/Chicago', 'locus')`);
const rnd = (seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(7);
const addDay = (d, n) => { const t = new RealDate(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const put = db.prepare(`INSERT INTO tw_daily (act_id, date, metric, value, synced_at) VALUES (?, ?, ?, ?, '2026-10-20 06:00:00')`);
const cents = x => Math.round(x * 100) / 100;
for (let d = '2026-07-01'; d <= '2026-10-19'; d = addDay(d, 1)) {
  for (const act of ['brand_alpha', 'brand_beta']) {
    const orders = 20 + Math.floor(rnd() * 30), net = cents(orders * (55 + rnd() * 20)), ship = cents(orders * 6), tax = cents(net * 0.07), total = cents(net + ship + tax);
    const m = { netSales: total, totalNetTaxes: tax, totalShippingPrice: ship, totalOrders: orders, newCustomersOrders: Math.floor(orders * 0.6), blendedAds: cents(total * (0.2 + rnd() * 0.1)),
      newCustomerSales: cents(total * 0.55), rcRevenue: cents(total * 0.45), totalPaymentGatewayCosts: cents(total * 0.03), klaviyoPlacedOrderSales: cents(total * 0.15) };
    /* Alpha has every cost in Triple Whale. Beta charges for delivery and has no shipping cost and no product cost there. */
    if (act === 'brand_alpha') { m.totalProductCosts = cents(net * (0.28 + rnd() * 0.04)); m.totalShippingCosts = cents(orders * 7.5); m.totalHandlingFees = cents(orders * 0.5); }
    for (const [k, v] of Object.entries(m)) put.run(act, d, k, v);
  }
}
const TOKEN = 'a1b2c3d4e5f6a7b8c9d0';
db.prepare(`INSERT INTO p_profit_share (act_id, token) VALUES ('brand_alpha', ?)`).run(TOKEN);
const BETA_TOKEN = 'b1b2c3d4e5f6a7b8c9d0';
db.prepare(`INSERT INTO p_profit_share (act_id, token) VALUES ('brand_beta', ?)`).run(BETA_TOKEN);

const PW = await import('./src/worker.js');
const PF = PW.default;
const env = { DB, ADMIN_TOKEN: 'adm' };
const pending = [];
const raw = async (method, p, body) => {
  const r = await PF.fetch(new Request('https://pf.test' + p, { method, headers: { Authorization: 'Bearer adm', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, { waitUntil(p) { pending.push(Promise.resolve(p).catch(() => {})); } });
  const text = await r.text();
  await Promise.all(pending.splice(0));
  return { status: r.status, text };
};
const call = async (method, p, body) => { const r = await raw(method, p, body); let j = null; try { j = JSON.parse(r.text); } catch { /* not json */ } return { status: r.status, j, text: r.text }; };

/* Stamps written by SQLite's own clock are not frozen; they carry no meaning here. */
const norm = s => s.replace(/"(checked_at|created_at|updated_at|added_at|uploaded_at)":"[^"]*"/g, '"$1":"T"');
const W = 'from=2026-10-01&to=2026-10-15';
const ROUTES = {
  client: `/api/client?act=brand_alpha&${W}`,
  overview: `/api/overview?${W}&fresh=1`,
  drill: `/api/hub/drill?act=brand_alpha&${W}&cmp=none`,
  kept: '/api/hub/kept?act=brand_alpha&calls=0',
  profit: `/api/profit/${TOKEN}?${W}`,
  profit_mtd: `/api/profit/${TOKEN}`,
};
const OLD_COST_KEYS = ['account', 'margin_pct', 'health', 'shipping', 'worst', 'rows', 'skus'];
async function capture() {
  const out = {};
  for (const [k, p] of Object.entries(ROUTES)) { const r = await raw('GET', p); if (r.status !== 200) throw new Error(`${k}: HTTP ${r.status} ${r.text.slice(0, 200)}`); out[k] = norm(r.text); }
  return out;
}
/* NO GOAL SET (2026-11-26) added goals_planned to /api/client and goals_planned + month to each /api/overview row.
   Without exactly those keys the answer is the one MAIN hashed: everything else in the payload is unchanged. */
/* STORE SOURCE (2026-11-26, storesource.js) added store_source + store_label wherever store numbers are shown. With no
   Shopify rows they must say Triple Whale, not synced yet; without them the answer is the one MAIN hashed. */
function withoutStoreSource(text) {
  const j = JSON.parse(text);
  let seen = 0;
  const walk = o => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== 'object') return;
    if ('store_source' in o) {
      assert.equal(o.store_source, 'triple_whale');
      if ('store_label' in o) assert.equal(o.store_label, 'Store numbers: Triple Whale (Shopify not synced yet)');
      delete o.store_source; delete o.store_label; seen++;
    }
    Object.values(o).forEach(walk);
  };
  walk(j);
  return seen ? JSON.stringify(j) : text;
}
function beforeGoalsPlanned(k, text0) {
  const text = withoutStoreSource(text0);
  if (k !== 'client' && k !== 'overview') return text;
  const j = JSON.parse(text);
  if (k === 'client') { assert.equal(typeof j.goals_planned, 'boolean'); delete j.goals_planned; }
  else for (const a of j.accounts) { assert.equal(typeof a.goals_planned, 'boolean'); assert.match(a.month, /^\d{4}-\d{2}$/); delete a.goals_planned; delete a.month; }
  return JSON.stringify(j);
}
/* Brand Alpha's own part of an answer that lists every brand. */
const alphaOnly = c => ({ ...c, overview: JSON.stringify(JSON.parse(c.overview).accounts.find(a => a.act_id === 'brand_alpha')) });
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const costsOld = async () => { const j = (await call('GET', '/api/costs?act=brand_alpha&days=60')).j; return norm(JSON.stringify(Object.fromEntries(OLD_COST_KEYS.map(k => [k, j[k]])))); };

/* Every brand graded once, so no answer below depends on a background refresh having landed. */
await call('POST', '/api/cost-health-refresh');
const first = await capture();          // taken while p_cost_rule does not exist
const firstCosts = await costsOld();    // (this read is what creates the new tables)

if (CAPTURE) {
  console.log('const MAIN = {');
  console.log('  ' + [...Object.keys(ROUTES).map(k => `${k}: '${hash(first[k])}'`), `costs_old: '${hash(firstCosts)}'`].join(', ') + ',');
  console.log('};');
  process.exit(0);
}

const C = await import('./src/costs.js');
const checks = [];
async function check(name, fn) { try { await fn(); checks.push(true); console.log('PASS ', name); } catch (e) { checks.push(false); console.log('FAIL ', name, '\n      ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n      ')); } }
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg}: ${a} != ${b}`);

/* ---------------- 1. the golden copy ---------------- */
/* dayEconomics as it stood on the commit before this change, pasted verbatim (worker.js, with the two names it reads). */
const SALES_IDS = ['netSales', 'totalSales'];
const pick = (piv, date, ids) => { for (const id of ids) { const v = piv[id]?.[date]; if (v != null) return v; } return null; };
function dayEconomicsV0(piv, meta, date, marginPct) {
  const totalSales = pick(piv, date, SALES_IDS);   // Shopify TOTAL SALES (incl. shipping + tax)
  if (totalSales == null) return null;
  // Tax is collected for the state, not earned, so it comes off the top. Defaults
  // to 0 before the metric is backfilled, which degrades to total sales - never
  // back to the old double-counted figure.
  const tax = piv.totalNetTaxes?.[date] ?? 0;
  const shipRev = piv.totalShippingPrice?.[date] ?? 0;
  const shipCost = piv.totalShippingCosts?.[date] ?? 0;
  const handling = piv.totalHandlingFees?.[date] ?? 0;
  const sales = totalSales - tax;            // CTC's "Net Sales + Shipping"
  const netSales = sales - shipRev;          // = Shopify net_sales, for the waterfall
  const mrow = meta[date];
  const gSpend = piv.ga_adCost?.[date] ?? null;
  const spend = piv.blendedAds?.[date] ?? (mrow || gSpend != null ? (mrow?.spend ?? 0) + (gSpend ?? 0) : null);
  const rawNew = piv.newCustomerSales?.[date] ?? null;
  const rawRet = piv.rcRevenue?.[date] ?? null;
  const rawSplit = (rawNew ?? 0) + (rawRet ?? 0);
  // Rebase the new/returning split onto net sales - TW reports it against order
  // revenue (incl. tax), so the raw figures do not add up to our headline.
  const newShare = rawSplit > 0 && rawNew != null ? rawNew / rawSplit : null;
  const newRev = newShare != null ? sales * newShare : rawNew;
  const cogs = piv.totalProductCosts?.[date] ?? null;
  const fees = piv.totalPaymentGatewayCosts?.[date] ?? null;
  // Everything variable except ad spend. Ad spend is subtracted separately so the
  // page can show gross profit (the pre-marketing line) as its own step.
  const variableCosts = cogs != null ? cogs + shipCost + handling + (fees ?? 0) : null;
  const grossProfit = marginPct != null ? sales * marginPct
    : variableCosts != null ? sales - variableCosts : null;
  const orders = piv.totalOrders?.[date] ?? null;
  const newOrders = piv.newCustomersOrders?.[date] ?? null;
  return {
    date, sales, total_sales: totalSales, tax, net_sales: netSales, ship_rev: shipRev, spend,
    orders, new_orders: newOrders, email_rev: piv.klaviyoPlacedOrderSales?.[date] ?? null,
    new_rev: newRev,
    ret_rev: newShare != null ? sales * (1 - newShare) : rawRet,
    new_share: newShare,
    cogs, ship_cost: shipCost, handling, fees, gross_profit: grossProfit,
    meta_spend: mrow?.spend ?? null, google_spend: gSpend,
    mer: spend ? sales / spend : null,
    amer: newRev != null && spend ? newRev / spend : null,
    cm: grossProfit != null && spend != null ? grossProfit - spend : null,
    margin: sales > 0 && grossProfit != null ? grossProfit / sales : null,
  };
}
const METRICS = ['netSales', 'totalSales', 'totalNetTaxes', 'totalShippingPrice', 'totalShippingCosts', 'totalHandlingFees', 'ga_adCost', 'blendedAds', 'newCustomerSales', 'rcRevenue',
  'totalProductCosts', 'totalPaymentGatewayCosts', 'totalOrders', 'newCustomersOrders', 'klaviyoPlacedOrderSales'];
const D = '2026-10-10';
const randomPivot = r => {
  const piv = {};
  for (const m of METRICS) {
    const k = r();
    if (k < 0.15) continue;                                  // the metric is missing altogether
    if (k < 0.25) { piv[m] = {}; continue; }                 // the metric exists, this day does not
    piv[m] = { [D]: k < 0.32 ? null : k < 0.42 ? 0 : k < 0.5 ? -cents(r() * 500) : cents(r() * 5000) };
  }
  return piv;
};
/* Every input that must behave exactly like "no rule at all". */
const NO_RULE = [undefined, null, [],
  [{ id: 1, cost: 'shipping', rule: 'per_order', source: 'typed', amount: 9, start_date: '2026-11-01', end_date: null, status: 'on' }],     // not started yet
  [{ id: 2, cost: 'product', rule: 'pct_revenue', source: 'typed', amount: 30, start_date: '2026-01-01', end_date: '2026-09-30', status: 'on' }],   // already ended
  [{ id: 3, cost: 'shipping', rule: 'per_order', source: 'typed', amount: 9, start_date: '2026-01-01', end_date: null, status: 'off' }],    // switched off
  [{ id: 4, cost: 'shipping', rule: 'weight_tier', source: 'typed', amount: null, table_json: '[{"min":0,"max":1,"amount":5}]', start_date: '2026-01-01', end_date: null, status: 'on' },
    { id: 5, cost: 'shipping', rule: 'zone', source: 'typed', table_json: '[{"zone":"US","amount":5}]', start_date: '2026-01-01', status: 'on' },
    { id: 6, cost: 'product', rule: 'per_item', source: 'typed', amount: 4, start_date: '2026-01-01', status: 'on' }],                       // saved only, never applied
];

await check('1. dayEconomics with no rule equals the old function, byte for byte, over 2,000 random days', () => {
  assert.equal(typeof PW.dayEconomics, 'function', 'worker.js exports dayEconomics');
  const r = (seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(2026);
  let withRow = 0;
  for (let i = 0; i < 2000; i++) {
    const piv = randomPivot(r), meta = r() < 0.5 ? {} : { [D]: { spend: cents(r() * 800) } }, m = r() < 0.5 ? null : 0.6;
    const want = JSON.stringify(dayEconomicsV0(piv, meta, D, m));
    if (want !== 'null') withRow++;
    assert.equal(JSON.stringify(PW.dayEconomics(piv, meta, D, m)), want, `day ${i}, four arguments`);
    for (const [k, rules] of NO_RULE.entries()) assert.equal(JSON.stringify(PW.dayEconomics(piv, meta, D, m, rules)), want, `day ${i}, no-rule input ${k}`);
  }
  assert.ok(withRow > 1000, 'most random days produce a row');
});

/* ---------------- 3 then 2: through the real worker ---------------- */
await check('3. with the new tables missing, every answer hashes to what the commit before this change answered', () => {
  for (const k of Object.keys(ROUTES)) assert.equal(hash(beforeGoalsPlanned(k, first[k])), MAIN[k], `${k} changed for a brand with no cost rule`);
});
await check('11a. GET /api/costs keeps every old key with the same value as before the change', () => {
  assert.equal(hash(firstCosts), MAIN.costs_old);
});
let betaRule;
await check('2. a rule on ANOTHER brand changes nothing for this one; a rule added then removed here changes nothing either', async () => {
  const p = await call('PUT', '/api/costs', { act: 'brand_beta', rule: { cost: 'shipping', rule: 'per_order', amount: 6.5, start_date: '2026-10-01' } });
  assert.equal(p.status, 200, p.text.slice(0, 300));
  betaRule = p.j.shipping_rules.rules[0];
  const a = alphaOnly(await capture()), f = alphaOnly(first);
  for (const k of Object.keys(ROUTES)) assert.equal(a[k], f[k], `${k}: brand_alpha moved when brand_beta got a rule`);
  assert.notEqual(JSON.parse((await capture()).overview).accounts.find(x => x.act_id === 'brand_beta').window.ship_cost, JSON.parse(first.overview).accounts.find(x => x.act_id === 'brand_beta').window.ship_cost, 'and brand_beta did move');
  const add = await call('PUT', '/api/costs', { act: 'brand_alpha', rule: { cost: 'shipping', rule: 'per_order', amount: 3, start_date: '2026-10-01' } });
  assert.equal(add.status, 200);
  const mid = alphaOnly(await capture());
  assert.notEqual(mid.client, f.client, 'the rule moved brand_alpha');
  const del = await call('DELETE', `/api/costs?act=brand_alpha&id=${add.j.shipping_rules.rules[0].id}`);
  assert.equal(del.status, 200); assert.equal(del.j.shipping_rules.rules.length, 0);
  const b = alphaOnly(await capture());
  for (const k of Object.keys(ROUTES)) assert.equal(b[k], f[k], `${k}: brand_alpha did not come back after its rule was removed`);
  assert.equal(await costsOld(), firstCosts, 'the old keys of GET /api/costs came back too');
});

/* ---------------- 4, 5. the pure function ---------------- */
const R = (o) => ({ id: 1, cost: 'shipping', rule: 'per_order', source: 'typed', amount: 5, start_date: '2026-10-01', end_date: null, status: 'on', ...o });
await check('4. ruleCosts: per order, % of revenue, dates, off, saved-only kinds, and which rule wins', () => {
  const day = { sales: 1000, orders: 10 };
  assert.deepEqual(C.ruleCosts([R()], '2026-10-05', day), { shipping: 50, src: { shipping: 'typed' } });
  assert.deepEqual(C.ruleCosts([R({ cost: 'product', rule: 'pct_revenue', amount: 30 })], '2026-10-05', day), { product: 300, src: { product: 'typed' } });
  assert.equal(C.ruleCosts([R()], '2026-10-05', { sales: 1000, orders: null }), null, 'no order count = nothing for that day');
  assert.equal(C.ruleCosts([R()], '2026-09-30', day), null, 'not started');
  assert.equal(C.ruleCosts([R({ end_date: '2026-10-04' })], '2026-10-05', day), null, 'ended');
  assert.deepEqual(C.ruleCosts([R({ end_date: '2026-10-05' })], '2026-10-05', day).shipping, 50, 'the end date is its last day');
  assert.equal(C.ruleCosts([R({ status: 'off' })], '2026-10-05', day), null, 'off');
  for (const rule of ['weight_tier', 'zone', 'per_item']) assert.equal(C.ruleCosts([R({ rule })], '2026-10-05', day), null, rule + ' is saved, never applied');
  assert.equal(C.ruleCosts([], '2026-10-05', day), null); assert.equal(C.ruleCosts(null, '2026-10-05', day), null);
  const three = [R({ id: 1, amount: 1, source: 'typed', start_date: '2026-10-03' }), R({ id: 2, amount: 2, source: 'sheet', start_date: '2026-10-02' }), R({ id: 3, amount: 3, source: 'connection', start_date: '2026-10-01' })];
  assert.equal(C.ruleCosts(three, '2026-10-05', day).shipping, 30, 'connection beats sheet beats typed');
  assert.equal(C.ruleCosts(three.slice(0, 2), '2026-10-05', day).shipping, 20, 'sheet beats typed');
  assert.equal(C.ruleCosts([R({ id: 1, amount: 1, start_date: '2026-10-01' }), R({ id: 2, amount: 2, start_date: '2026-10-04' })], '2026-10-05', day).shipping, 20, 'the later start wins among equals');
  assert.equal(C.ruleCosts([R({ id: 1, amount: 1, start_date: '2026-10-01' }), R({ id: 2, amount: 2, start_date: '2026-10-04' })], '2026-10-03', day).shipping, 10, 'and only once it has started');
  assert.equal(C.ruleCosts([R({ amount: 5 })], '2026-10-05', { sales: 1000, orders: -3 }).shipping, 0, 'a negative count never makes a negative cost');
});
await check('5. a shipping rule moves ship_cost, gross profit, CM and margin from its start date only; a flat margin still wins', () => {
  const piv = { netSales: {}, totalOrders: {}, totalProductCosts: {}, totalShippingCosts: {}, blendedAds: {} };
  for (const d of ['2026-09-30', '2026-10-01']) { piv.netSales[d] = 1000; piv.totalOrders[d] = 10; piv.totalProductCosts[d] = 300; piv.totalShippingCosts[d] = 80; piv.blendedAds[d] = 200; }
  const rule = [R({ amount: 5 })];
  assert.equal(JSON.stringify(PW.dayEconomics(piv, {}, '2026-09-30', null, rule)), JSON.stringify(dayEconomicsV0(piv, {}, '2026-09-30', null)), 'the day before the start is untouched');
  const a = PW.dayEconomics(piv, {}, '2026-10-01', null, rule), b = dayEconomicsV0(piv, {}, '2026-10-01', null);
  assert.equal(a.ship_cost, 50); assert.equal(b.ship_cost, 80);
  assert.equal(a.gross_profit, b.gross_profit + 30); assert.equal(a.cm, b.cm + 30); near(a.margin, b.margin + 0.03, 'margin');
  assert.deepEqual(a.cost_src, { shipping: 'typed' }); assert.ok(!('cost_src' in b));
  assert.deepEqual(Object.keys(a).slice(0, -1), Object.keys(b), 'the old keys keep their order');
  const m = PW.dayEconomics(piv, {}, '2026-10-01', 0.6, rule), m0 = dayEconomicsV0(piv, {}, '2026-10-01', 0.6);
  assert.equal(m.gross_profit, m0.gross_profit); assert.equal(m.cm, m0.cm);
  const p = PW.dayEconomics({ netSales: { [D]: 1000 }, blendedAds: { [D]: 100 } }, {}, D, null, [R({ cost: 'product', rule: 'pct_revenue', amount: 40, start_date: '2026-01-01' })]);
  assert.equal(p.cogs, 400); assert.equal(p.gross_profit, 600); assert.equal(p.cm, 500);
});

/* ---------------- 6. a product rule and the cost check ---------------- */
await check('6. a product rule gives a brand with no Triple Whale product cost a contribution margin, and the cost check follows at once', async () => {
  const before = (await call('GET', `/api/client?act=brand_beta&${W}`)).j;
  assert.equal(before.totals.cm, null, 'no product cost, no CM');
  assert.equal(db.prepare(`SELECT verdict FROM p_cost_health WHERE act_id = 'brand_beta'`).get().verdict, 'none');
  const p = await call('PUT', '/api/costs', { act: 'brand_beta', rule: { cost: 'product', rule: 'pct_revenue', amount: 35, start_date: '2026-07-01' } });
  assert.equal(p.status, 200, p.text.slice(0, 300));
  assert.notEqual(db.prepare(`SELECT verdict FROM p_cost_health WHERE act_id = 'brand_beta'`).get().verdict, 'none');
  const after = (await call('GET', `/api/client?act=brand_beta&${W}`)).j;
  assert.ok(after.totals.cm != null, 'CM now shows');
  near(after.totals.cogs, after.totals.sales * 0.35, '35% of revenue');
  near(after.totals.ship_cost, after.totals.orders * 6.5, 'and the per order shipping rule from check 2');
  assert.equal(after.shipping.mode, 'measured'); assert.equal(after.shipping.source, 'locus');
  assert.deepEqual(after.rows[0].cost_src, { shipping: 'typed', product: 'typed' });
  const d = (await call('GET', `/api/hub/drill?act=brand_beta&${W}&cmp=none`)).j.brands[0];
  near(d.profit.cur.cm, after.totals.cm, 'the tile drill-down prices it the same way');
});

/* ---------------- 7, 8. the writes ---------------- */
await check('7. PUT refuses bad input with a sentence, closes the old open rule the day before, and never touches another brand', async () => {
  const bad = async (rule, re) => { const r = await call('PUT', '/api/costs', { act: 'brand_alpha', rule }); assert.equal(r.status, 400, JSON.stringify(rule)); assert.match(r.j.error, re); };
  await bad({ cost: 'shipping', rule: 'per_order', amount: 'abc', start_date: '2026-10-01' }, /not a number/);
  await bad({ cost: 'shipping', rule: 'per_order', amount: -4, start_date: '2026-10-01' }, /not a number/);
  await bad({ cost: 'shipping', rule: 'per_order', amount: '1.2.3', start_date: '2026-10-01' }, /not a number/);
  await bad({ cost: 'product', rule: 'pct_revenue', amount: 140, start_date: '2026-10-01' }, /more than 100/);
  await bad({ cost: 'shipping', rule: 'per_order', amount: 5, start_date: '2026-10-05', end_date: '2026-10-01' }, /before the start/);
  await bad({ cost: 'shipping', rule: 'per_order', amount: 5 }, /date this rule starts/);
  await bad({ cost: 'product', rule: 'weight_tier', table: [{ min: 0, max: 1, amount: 4 }], start_date: '2026-10-01' }, /cannot be used for product/);
  await bad({ cost: 'fees', rule: 'per_order', amount: 1, start_date: '2026-10-01' }, /shipping or product/);
  await bad({ cost: 'shipping', rule: 'weight_tier', table: [{ min: 0, max: 2, amount: 4 }, { min: 1, max: 3, amount: 6 }], start_date: '2026-10-01' }, /overlap/);
  await bad({ cost: 'shipping', rule: 'weight_tier', table: [{ min: 2, max: 1, amount: 4 }], start_date: '2026-10-01' }, /below/);
  await bad({ cost: 'shipping', rule: 'zone', table: [], start_date: '2026-10-01' }, /between 1 and 60/);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM p_cost_rule WHERE act_id = 'brand_alpha'`).get().n, 0, 'nothing bad was stored');
  assert.equal(C.cleanRule({ cost: 'shipping', rule: 'per_order', amount: '$1,234.50', start_date: '2026-10-01' })[1].amount, 1234.5);

  const one = await call('PUT', '/api/costs', { act: 'brand_alpha', rule: { cost: 'shipping', rule: 'per_order', amount: 4, start_date: '2026-09-01', label: 'Old rate' } });
  assert.equal(one.status, 200); assert.equal(one.j.ok, true); assert.equal(one.j.shipping_rules.rules[0].source, 'typed'); assert.equal(one.j.shipping_rules.rules[0].applied, true);
  assert.ok(!/@/.test(one.text), 'no email leaves the worker');
  const early = await call('PUT', '/api/costs', { act: 'brand_alpha', rule: { cost: 'shipping', rule: 'per_order', amount: 9, start_date: '2026-08-01' } });
  assert.equal(early.status, 400); assert.match(early.j.error, /already starts on or after/);
  const two = await call('PUT', '/api/costs', { act: 'brand_alpha', rule: { cost: 'shipping', rule: 'per_order', amount: 5, start_date: '2026-10-10', source: 'connection' } });
  assert.equal(two.status, 200);
  const rows = db.prepare(`SELECT amount, start_date, end_date, source FROM p_cost_rule WHERE act_id = 'brand_alpha' ORDER BY start_date`).all();
  assert.deepEqual(rows.map(r => [r.amount, r.start_date, r.end_date, r.source]), [[4, '2026-09-01', '2026-10-09', 'typed'], [5, '2026-10-10', null, 'typed']], 'the old rule ends the day before; the source is always typed here');
  const c = (await call('GET', `/api/client?act=brand_alpha&${W}`)).j.rows;
  near(c.find(r => r.date === '2026-10-09').ship_cost, c.find(r => r.date === '2026-10-09').orders * 4, 'old rate to Oct 9');
  near(c.find(r => r.date === '2026-10-10').ship_cost, c.find(r => r.date === '2026-10-10').orders * 5, 'new rate from Oct 10');

  /* an id from brand_beta sent with act: brand_alpha */
  const steal = await call('PUT', '/api/costs', { act: 'brand_alpha', rule: { id: betaRule.id, amount: 99, start_date: '2026-10-01' } });
  assert.equal(steal.status, 404);
  assert.equal(db.prepare(`SELECT amount FROM p_cost_rule WHERE id = ?`).get(betaRule.id).amount, 6.5, 'brand_beta\'s rule is untouched');
  /* editing by id changes only the allowed fields */
  const id = two.j.shipping_rules.rules.find(r => r.amount === 5).id;
  const ed = await call('PUT', '/api/costs', { act: 'brand_alpha', rule: { id, cost: 'product', rule: 'pct_revenue', amount: 5.5, start_date: '2026-10-10', status: 'off', notes: 'paused' } });
  assert.equal(ed.status, 200);
  const row = db.prepare(`SELECT cost, rule, amount, status, notes FROM p_cost_rule WHERE id = ?`).get(id);
  assert.deepEqual([row.cost, row.rule, row.amount, row.status, row.notes], ['shipping', 'per_order', 5.5, 'off', 'paused']);
  assert.equal((await call('PUT', '/api/costs', { act: 'brand_nope', rule: {} })).status, 404);
  assert.equal((await call('PUT', '/api/costs', { act: 'all', rule: {} })).status, 404);
  assert.equal((await call('GET', '/api/costs/sheet?act=brand_alpha')).status, 404, 'the sheet route only takes POST');
});
await check('8. DELETE removes only the named brand\'s row', async () => {
  const wrong = await call('DELETE', `/api/costs?act=brand_alpha&id=${betaRule.id}`);
  assert.equal(wrong.status, 404);
  assert.ok(db.prepare(`SELECT id FROM p_cost_rule WHERE id = ?`).get(betaRule.id), 'still there');
  assert.equal((await call('DELETE', '/api/costs?act=brand_alpha')).status, 400);
  for (const r of db.prepare(`SELECT id FROM p_cost_rule WHERE act_id = 'brand_alpha'`).all()) assert.equal((await call('DELETE', `/api/costs?act=brand_alpha&id=${r.id}`)).status, 200);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM p_cost_rule WHERE act_id = 'brand_alpha'`).get().n, 0);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM p_cost_rule WHERE act_id = 'brand_beta'`).get().n, 2);
  const b = alphaOnly(await capture()), f = alphaOnly(first);
  for (const k of Object.keys(ROUTES)) assert.equal(b[k], f[k], `${k}: back to the bytes it started with`);
});

/* ---------------- 9, 10. the cost sheet ---------------- */
await check('9. parseSheet: BOM, semicolons, tabs, quotes, money signs, header names, and every refusal', () => {
  const a = C.parseSheet('﻿Variant SKU,Title,Cost per item\nAB-1,"Polo, navy","$1,234.50"\nAB-2,Hat,12\n');
  assert.deepEqual(a.rows, [{ line: 2, sku: 'AB-1', title: 'Polo, navy', unit_cost: 1234.5 }, { line: 3, sku: 'AB-2', title: 'Hat', unit_cost: 12 }]);
  assert.deepEqual([a.errors.length, a.duplicates], [0, 0]);
  const s = C.parseSheet('sku;unit_cost\r\nX1;4.25\r\nX2;"say ""hi""";\r\n*;3\r\n');
  assert.deepEqual(s.rows.map(r => [r.sku, r.unit_cost]), [['X1', 4.25], ['*', 3]]); assert.match(s.errors[0].reason, /not a number/); assert.equal(s.errors[0].line, 3);
  assert.deepEqual(C.parseSheet('SKU\tCOGS\tName\nT1\t7\tTee\n').rows, [{ line: 2, sku: 'T1', title: 'Tee', unit_cost: 7 }]);
  assert.match(C.parseSheet('name,price\nTee,7\n').refused, /needs a SKU column/); assert.equal(C.parseSheet('name,price\nTee,7\n').rows.length, 0);
  assert.match(C.parseSheet('sku,price\nT,7\n').refused, /needs a cost column/);
  const e = C.parseSheet('sku,cost\n,5\nNEG,-2\nOK,3\nOK,4\nBIG,2000000\nNONE,\n' + 'L'.repeat(81) + ',1\n');
  assert.deepEqual(e.rows, [{ line: 5, sku: 'OK', title: null, unit_cost: 4 }], 'a repeated SKU keeps the last row');
  assert.equal(e.duplicates, 1);
  assert.deepEqual(e.errors.map(x => x.line), [2, 3, 6, 7, 8]);
  assert.match(e.errors[0].reason, /No SKU/); assert.match(e.errors[1].reason, /below zero/); assert.match(e.errors[2].reason, /too large/); assert.match(e.errors[3].reason, /no cost/); assert.match(e.errors[4].reason, /80 characters/);
  const many = n => 'sku,cost\n' + Array.from({ length: n }, (_, i) => `S${i},1`).join('\n');
  assert.equal(C.parseSheet(many(2000)).rows.length, 2000);
  assert.match(C.parseSheet(many(2001)).refused, /more than 2,000 rows/);
  assert.match(C.parseSheet('sku,cost\n' + 'x'.repeat(301 * 1024)).refused, /too big/);
  assert.match(C.parseSheet('').refused, /empty/);
  assert.ok(!JSON.stringify([C.RULES, e, C.parseSheet('').refused]).includes(String.fromCharCode(0x2014)), 'no long dashes');
});
await check('10. the sheet route: a dry run writes nothing, a real run writes, the same sheet twice leaves the same rows', async () => {
  const csv = 'SKU,Cost,Title\nA1,4.5,Polo\nA2,9,Hat\nA3,oops,Sock\n';
  const n = () => db.prepare(`SELECT COUNT(*) n FROM p_product_cost`).get().n;
  const dry = await call('POST', '/api/costs/sheet', { act: 'brand_alpha', csv, start_date: '2026-11-01' });
  assert.equal(dry.status, 200); assert.deepEqual([dry.j.dry_run, dry.j.rows_ok, dry.j.rows_read, dry.j.errors.length, dry.j.applied], [true, 2, 3, 1, false]);
  assert.match(dry.j.note, /not used in profit yet/); assert.equal(n(), 0, 'dry run is the default and writes nothing');
  assert.equal((await call('POST', '/api/costs/sheet', { act: 'brand_alpha', csv })).status, 400, 'a start date is required');
  assert.equal((await call('POST', '/api/costs/sheet', { act: 'brand_alpha', csv: 'a,b\n1,2', start_date: '2026-11-01' })).status, 400);
  const real = await call('POST', '/api/costs/sheet', { act: 'brand_alpha', csv, start_date: '2026-11-01', filename: 'costs.csv', dry_run: false });
  assert.equal(real.status, 200); assert.equal(n(), 2);
  const again = await call('POST', '/api/costs/sheet', { act: 'brand_alpha', csv: csv.replace('4.5', '5'), start_date: '2026-11-01', filename: 'costs.csv', dry_run: false });
  assert.equal(again.status, 200); assert.equal(n(), 2, 'the same sheet again replaces, never adds');
  assert.equal(db.prepare(`SELECT unit_cost FROM p_product_cost WHERE sku = 'A1'`).get().unit_cost, 5);
  const page = (await call('GET', '/api/costs?act=brand_alpha')).j;
  assert.deepEqual([page.product_cost.sheet.skus, page.product_cost.sheet.filename, page.product_cost.sheet.applied, page.product_cost.coverage.skus_on_file], [2, 'costs.csv', false, 2]);
  assert.ok(page.missing.some(m => /cost sheet \(2 products\) is saved/.test(m)));
  const b = alphaOnly(await capture()), f = alphaOnly(first);
  for (const k of Object.keys(ROUTES)) assert.equal(b[k], f[k], `${k}: a saved sheet changes no number`);
  assert.equal((await call('DELETE', `/api/costs?act=brand_beta&sheet=${again.j.batch}`)).status, 404, 'another brand cannot remove it');
  assert.equal((await call('DELETE', `/api/costs?act=brand_alpha&sheet=${again.j.batch}`)).status, 200); assert.equal(n(), 0);
});

/* ---------------- 11. the page ---------------- */
await check('11b. GET /api/costs: the new keys, and each "missing" line under its condition and not otherwise', async () => {
  const a = (await call('GET', '/api/costs?act=brand_alpha')).j;
  for (const k of [...OLD_COST_KEYS, 'currency', 'fixed', 'shipping_rules', 'product_cost', 'payment_fees', 'handling', 'margin_override', 'choices', 'missing']) assert.ok(k in a, k);
  assert.deepEqual(a.missing, ['No fixed costs entered, so net profit cannot be shown. Add rent, team, software or any fee you pay.'], 'Alpha has every cost in Triple Whale: only fixed costs are missing');
  assert.deepEqual([a.shipping_rules.in_use, a.product_cost.in_use, a.payment_fees.source, a.handling.source, a.margin_override], [{ source: 'triple_whale' }, { source: 'triple_whale' }, 'triple_whale', 'triple_whale', null]);
  assert.equal(a.shipping_rules.last30.tw, a.shipping_rules.last30.used); assert.deepEqual(a.choices.applied_today, ['per_order', 'pct_revenue']);
  assert.equal(a.product_cost.coverage.days, 30); assert.equal(a.product_cost.coverage.days_with_cost, 30);

  /* Beta: both rules from checks 2 and 6 are in force. */
  const b = (await call('GET', '/api/costs?act=brand_beta')).j;
  assert.deepEqual([b.shipping_rules.in_use.source, b.product_cost.in_use.source], ['locus', 'locus']);
  assert.equal(b.shipping_rules.last30.tw, null);
  const oct = (await call('GET', '/api/client?act=brand_beta&from=2026-10-01&to=2026-10-19')).j.totals;
  near(b.shipping_rules.last30.used, oct.orders * 6.5, 'used = the rule on the days since it started (Oct 1), nothing before');
  assert.ok(!b.missing.some(m => /No shipping cost|No product cost|No payment fees/.test(m)), JSON.stringify(b.missing));
  /* switch both off: the absences are named, with the brand's own figure */
  for (const r of [...b.shipping_rules.rules, ...b.product_cost.rules]) await call('PUT', '/api/costs', { act: 'brand_beta', rule: { ...r, status: 'off' } });
  const off = (await call('GET', '/api/costs?act=brand_beta')).j;
  assert.ok(off.missing.some(m => /^No shipping cost: customers paid \$[\d,]+ for delivery in the last 30 days/.test(m)), JSON.stringify(off.missing));
  assert.ok(off.missing.some(m => /^No product cost:/.test(m)));
  assert.deepEqual([off.shipping_rules.in_use.source, off.product_cost.in_use.source], ['none', 'none']);
  /* a saved-only rule is the only rule for its cost */
  const z = await call('PUT', '/api/costs', { act: 'brand_beta', rule: { cost: 'shipping', rule: 'zone', table: [{ zone: 'US', amount: 6 }, { zone: 'Canada', amount: 14 }], start_date: '2026-10-01' } });
  assert.equal(z.status, 200);
  const zr = z.j.shipping_rules.rules.find(r => r.rule === 'zone');
  assert.deepEqual([zr.applied, zr.table.length], [false, 2]);
  assert.ok(z.j.missing.some(m => /Your shipping cost rule \(by country or zone\) is saved\. It will be used once Locus reads each order.s items, weight and country\. Until then no shipping cost is counted\./.test(m)), JSON.stringify(z.j.missing));
  assert.ok(z.j.missing.some(m => /^No shipping cost/.test(m)), 'a saved-only rule does not hide the absence');
  await call('DELETE', `/api/costs?act=brand_beta&id=${zr.id}`);
  /* a per order rule on days with no order count */
  db.exec(`DELETE FROM tw_daily WHERE act_id = 'brand_beta' AND metric = 'totalOrders' AND date IN ('2026-10-17', '2026-10-18')`);
  for (const r of b.shipping_rules.rules) await call('PUT', '/api/costs', { act: 'brand_beta', rule: { ...r, status: 'on' } });
  const blind = (await call('GET', '/api/costs?act=brand_beta')).j;
  assert.ok(blind.missing.some(m => m === '2 days had no order count, so the per order shipping rule could not be used on them.'), JSON.stringify(blind.missing));
  /* fixed costs entered: that line goes; a flat margin with a rule on says so */
  await call('PUT', '/api/expenses', { act: 'brand_beta', items: [{ name: 'Warehouse', category: 'rent', kind: 'monthly', amount: 3100, start_date: '2026-09-01' }] });
  const fx = (await call('GET', '/api/costs?act=brand_beta')).j;
  assert.ok(!fx.missing.some(m => /No fixed costs/.test(m))); assert.equal(fx.fixed.active, 1); near(fx.fixed.month_total, 1900, '19 whole days of October at 100 a day');
  assert.equal(fx.fixed.items[0].name, 'Warehouse'); assert.ok(!/@/.test(JSON.stringify(fx.fixed)));
  await call('PUT', '/api/margin', { act: 'brand_beta', margin_pct: 0.62 });
  const fm = (await call('GET', '/api/costs?act=brand_beta')).j;
  assert.equal(fm.margin_override, 0.62); assert.equal(fm.product_cost.in_use.source, 'flat_margin');
  assert.ok(fm.missing.includes('A flat margin of 62% is set, so profit uses that. The rules below are shown for reference.'));
  await call('PUT', '/api/margin', { act: 'brand_beta', margin_pct: '' });
  assert.ok(!JSON.stringify([a.missing, off.missing, z.j.missing, blind.missing, fm.missing]).includes(String.fromCharCode(0x2014)), 'no long dashes in any line');
});

/* ---------------- 12. the client profit link ---------------- */
/* settings costsNetInPosts: the one switch for everything a client reads (default off). */
const netSwitch = on => { db.exec(`DELETE FROM settings WHERE key = 'costsNetInPosts'`); if (on) db.exec(`INSERT INTO settings (key, value) VALUES ('costsNetInPosts', '1')`); };
await check('12. /api/profit/:token: ONE fixed costs total and net profit, never a category, and only with the client switch on and a trusted cost check', async () => {
  const P = `/api/profit/${TOKEN}?${W}`;
  netSwitch(false);
  const none = (await call('GET', P)).j;
  assert.ok(!('fixed' in none) && !('net' in none), 'no fixed cost, no keys at all');
  await call('PUT', '/api/expenses', { act: 'brand_alpha', items: [{ name: 'Klaviyo plan', category: 'software', kind: 'monthly', amount: 3100, start_date: '2026-09-01', notes: 'secret note' }] });
  /* the switch is off (the default): a brand WITH fixed costs gets the same bytes as a brand with none */
  assert.equal(norm((await raw('GET', P)).text), first.profit, 'switch off: the client link is byte for byte what it was, no fixed and no net');
  netSwitch(true);
  const one = (await call('GET', P)).j;
  assert.deepEqual(one.fixed, { total: 1500 }, 'one total (15 days at 100) and nothing else: no category rows on a client page');
  near(one.net, one.mtd.cm - 1500, 'net = cm - fixed');
  assert.ok(!/Klaviyo|secret|added_by|by_category|Software|software/.test(JSON.stringify(one)), 'never a row name, a note, who added it or a category');
  const items = (await call('GET', '/api/expenses?act=brand_alpha')).j.items;
  await call('PUT', '/api/expenses', { act: 'brand_alpha', items: [...items, { name: 'Outside help', category: 'Contractors and freelancers', kind: 'monthly', amount: 6200, start_date: '2026-10-01' },
    { name: 'Podcast read', category: 'marketing', kind: 'once', amount: 500, start_date: '2026-10-05', is_ad_spend: true }] });
  const two = (await call('GET', P)).j;
  assert.deepEqual(two.fixed, { total: 4500 }, 'still one total: 1,500 + 3,000');
  assert.ok(!/Contractors|Outside help|Podcast/.test(JSON.stringify(two)), 'the brand\'s own category names stay off the client page');
  near(two.mtd.cm, one.mtd.cm - 500, 'the "counts as ad spend" row is already inside CM here');
  /* THE SCREEN ADDS UP: the page shows contribution margin, one fixed costs line and net profit, with both kinds of row entered */
  assert.equal(Math.round((two.waterfall.cm - two.fixed.total) * 100), Math.round(two.net * 100), 'contribution margin - fixed costs = net profit, exactly, never the ad cost twice');
  db.exec(`UPDATE p_cost_health SET verdict = 'broken' WHERE act_id = 'brand_alpha'`);
  const broken = (await call('GET', P)).j;
  assert.equal(broken.cm_ok, false); assert.ok(!('fixed' in broken) && !('net' in broken), 'a broken cost check shows no net profit');
  db.exec(`UPDATE p_cost_health SET verdict = 'good' WHERE act_id = 'brand_alpha'`);
  /* a window before any fixed cost started */
  const early = (await call('GET', `/api/profit/${TOKEN}?from=2026-08-01&to=2026-08-20`)).j;
  assert.ok(!('fixed' in early) && !('net' in early));
  /* switched off again with the rows still there: gone from the payload */
  netSwitch(false);
  const off = (await call('GET', P)).j;
  assert.ok(!('fixed' in off) && !('net' in off), 'switch off: no fixed or net field a client page would render');
  near(off.mtd.cm, two.mtd.cm, 'contribution margin itself does not depend on the switch');
  netSwitch(true);
  await call('PUT', '/api/expenses', { act: 'brand_alpha', items: [] });
  assert.equal(norm((await raw('GET', P)).text), first.profit, 'and with the fixed costs removed, the same bytes as at the start, switch on or off');
  netSwitch(false);
});
await check('12b. categories are the brand\'s own: any name is saved, GET /api/expenses and GET /api/costs list the brand\'s distinct ones, the built-in list is only suggestions', async () => {
  const items = [
    { name: 'Klaviyo plan', category: 'software', kind: 'monthly', amount: 310, start_date: '2026-09-01' },          // an old id
    { name: 'Shopify plan', category: 'Software', kind: 'monthly', amount: 93, start_date: '2026-09-01' },            // the same group by its label
    { name: 'Video editor', category: '  Contractors: video ', kind: 'weekly', amount: 350, start_date: '2026-09-07' },
    { name: 'Insurance', category: 'Insurance', kind: 'yearly', amount: 3650, start_date: '2026-01-01' },
    { name: 'Trade stand', category: 'Events', kind: 'custom', amount: 900, start_date: '2026-10-01', end_date: '2026-10-30' },
    { name: 'Coffee', category: '', kind: 'daily', amount: 4, start_date: '2026-10-01' },
    { name: 'Audit', category: 'Insurance', kind: 'quarterly', amount: 920, start_date: '2026-10-01' },
  ];
  const put = await call('PUT', '/api/expenses', { act: 'brand_alpha', items });
  assert.equal(put.status, 200, JSON.stringify(put.j));
  const g = (await call('GET', '/api/expenses?act=brand_alpha')).j;
  const by = Object.fromEntries(g.items.map(x => [x.name, x]));
  assert.deepEqual([by['Shopify plan'].category, by['Video editor'].category, by['Video editor'].category_label, by.Coffee.category, by.Insurance.kind, by['Trade stand'].end_date],
    ['software', 'Contractors: video', 'Contractors: video', 'other', 'yearly', '2026-10-30']);
  const mine = [{ id: 'Contractors: video', label: 'Contractors: video' }, { id: 'Events', label: 'Events' }, { id: 'Insurance', label: 'Insurance' }, { id: 'other', label: 'Other' }, { id: 'software', label: 'Software' }];
  assert.deepEqual(g.brand_categories, mine, 'the brand\'s distinct categories'); assert.deepEqual(put.j.brand_categories, mine, 'and on the save answer');
  assert.ok(g.categories.every(c => c.id && c.label) && g.kinds.some(k => k.id === 'weekly') && g.kinds.some(k => k.id === 'custom'), 'suggestions and every kind ride along');
  const c = (await call('GET', '/api/costs?act=brand_alpha')).j;
  assert.deepEqual(c.fixed.brand_categories, mine, 'GET /api/costs lists them too'); assert.equal(c.fixed.items.length, 7);
  assert.ok(!/agency/i.test(JSON.stringify([g.categories, g.kinds, c.fixed.categories, c.fixed.kinds, c.missing])), 'no "agency" wording anywhere in the choices');
  /* P&L (the team and the brand's own data) spreads each kind over Oct 1 to 15 */
  const pl = (await call('GET', `/api/client?act=brand_alpha&${W}`)).j, amt = Object.fromEntries(pl.fixed.items.map(i => [i.name, i.amount]));
  near(amt['Klaviyo plan'], 150, 'monthly'); near(amt['Video editor'], 15 * 50, 'weekly: 50 a day'); near(amt.Insurance, 15 * 10, 'yearly: 10 a day');
  near(amt['Trade stand'], 15 * 30, 'custom: 900 over 30 days'); near(amt.Coffee, 60, 'daily'); near(amt.Audit, 15 * 10, 'quarterly: 920 over the 92 days of Q4');
  assert.match((await call('PUT', '/api/expenses', { act: 'brand_alpha', items: [{ ...items[0], category: 'y'.repeat(41) }] })).j.error, /up to 40 characters/);
  assert.match((await call('PUT', '/api/expenses', { act: 'brand_alpha', items: [{ name: 'Stand', kind: 'custom', amount: 9, start_date: '2026-10-01' }] })).j.error, /pick the date it ends/);
  assert.equal((await call('GET', '/api/expenses?act=brand_alpha')).j.items.length, 7, 'a refused save changes nothing');
  await call('PUT', '/api/expenses', { act: 'brand_alpha', items: [] });
  assert.deepEqual((await call('GET', '/api/expenses?act=brand_alpha')).j.brand_categories, []);
});

/* ---------------- 13 to 17. review fixes (2026-11-25) ---------------- */
await check('13. a saved-only rule never ends the rule in use; a new rule ends only the open rule of its own kind', async () => {
  const P = rule => call('PUT', '/api/costs', { act: 'brand_alpha', rule });
  const open = () => db.prepare(`SELECT rule, amount, start_date, end_date FROM p_cost_rule WHERE act_id = 'brand_alpha' ORDER BY id`).all().map(r => [r.rule, r.start_date, r.end_date]);
  const day = async d => (await call('GET', `/api/client?act=brand_alpha&${W}`)).j.rows.find(r => r.date === d);
  assert.equal((await P({ cost: 'shipping', rule: 'per_order', amount: 6.5, start_date: '2026-09-01' })).status, 200);
  assert.equal((await P({ cost: 'product', rule: 'pct_revenue', amount: 30, start_date: '2026-09-01' })).status, 200);
  const before = await day('2026-10-12');
  near(before.ship_cost, before.orders * 6.5, 'per order shipping'); near(before.cogs, before.sales * 0.3, '30% product cost');
  const wt = await P({ cost: 'shipping', rule: 'weight_tier', table: [{ min: 0, max: 1, amount: 5 }, { min: 1, max: 5, amount: 9 }], start_date: '2026-10-10' });
  const pi = await P({ cost: 'product', rule: 'per_item', amount: 4, start_date: '2026-10-10' });
  assert.equal(wt.status, 200); assert.equal(pi.status, 200);
  assert.deepEqual(open(), [['per_order', '2026-09-01', null], ['pct_revenue', '2026-09-01', null], ['weight_tier', '2026-10-10', null], ['per_item', '2026-10-10', null]], 'both applied rules stay open');
  const after = await day('2026-10-12');
  assert.equal(after.ship_cost, before.ship_cost, 'shipping did not fall back to Triple Whale'); assert.equal(after.cogs, before.cogs, 'product cost did not vanish'); assert.equal(after.cm, before.cm);
  assert.deepEqual([pi.j.shipping_rules.in_use.source, pi.j.product_cost.in_use.source], ['locus', 'locus']);
  assert.ok(pi.j.missing.includes('Your shipping cost rule (by weight) is saved. It will be used once Locus reads each order’s items, weight and country. Until then your per order rule stays in use.'), JSON.stringify(pi.j.missing));
  assert.ok(pi.j.missing.includes('Your product cost rule (per item) is saved. It will be used once Locus reads each order’s items, weight and country. Until then your % of revenue rule stays in use.'), JSON.stringify(pi.j.missing));
  /* a second saved-only rule ends the first saved-only one, not the applied one */
  assert.equal((await P({ cost: 'shipping', rule: 'zone', table: [{ zone: 'US', amount: 6 }], start_date: '2026-10-12' })).status, 200);
  /* a new applied rule ends the applied one, and leaves the saved-only one alone */
  assert.equal((await P({ cost: 'shipping', rule: 'per_order', amount: 7, start_date: '2026-10-14' })).status, 200);
  assert.deepEqual(open(), [['per_order', '2026-09-01', '2026-10-13'], ['pct_revenue', '2026-09-01', null], ['weight_tier', '2026-10-10', '2026-10-11'], ['per_item', '2026-10-10', null], ['zone', '2026-10-12', null], ['per_order', '2026-10-14', null]]);
  const d14 = await day('2026-10-14'); near(d14.ship_cost, d14.orders * 7, 'the new rate from Oct 14');
  for (const r of db.prepare(`SELECT id FROM p_cost_rule WHERE act_id = 'brand_alpha'`).all()) assert.equal((await call('DELETE', `/api/costs?act=brand_alpha&id=${r.id}`)).status, 200);
  const b = alphaOnly(await capture()), f = alphaOnly(first);
  for (const k of Object.keys(ROUTES)) assert.equal(b[k], f[k], `${k}: back to the bytes it started with`);
});
await check('14. a decimal comma is refused, never read 10 or 100 times too large', () => {
  const amt = a => C.cleanRule({ cost: 'shipping', rule: 'per_order', amount: a, start_date: '2026-10-01' });
  for (const a of ['4,50', '12,5', '1.234,56', '0,5']) assert.match(amt(a)[0], /with a point/, a);
  for (const a of ['1,2,3', '1,23,456', ',5', '5,', '1,2345']) assert.ok(amt(a)[0], `${a} is refused`);
  assert.equal(amt('4.50')[1].amount, 4.5); assert.equal(amt(4.5)[1].amount, 4.5); assert.equal(amt('1,234')[1].amount, 1234); assert.equal(amt('$1,234,567.50')[1].amount, 1234567.5);
  assert.match(C.cleanRule({ cost: 'shipping', rule: 'zone', table: [{ zone: 'US', amount: '6,5' }], start_date: '2026-10-01' })[0], /not a number/);
  const s = C.parseSheet('SKU;Cost\nA1;12,50\nA2;4,5\nA3;1.234,56\nA4;"1,234.50"\nA5;7.25\nA6;-3,5\n');
  assert.deepEqual(s.rows.map(r => [r.sku, r.unit_cost]), [['A4', 1234.5], ['A5', 7.25]], 'only the unambiguous rows are read');
  assert.deepEqual(s.errors.map(e => e.line), [2, 3, 4, 7]);
  for (const e of s.errors) assert.match(e.reason, /write the cost with a point, like 12\.50/);
  assert.equal(C.plainNumber('12,50'), NaN); assert.equal(C.plainNumber('-2', { sign: true }), -2); assert.equal(C.plainNumber('-2'), NaN);
});
await check('15. a one-time cost dated after the window is out of P&L, the Costs page and the client link alike', async () => {
  netSwitch(true);
  await call('PUT', '/api/expenses', { act: 'brand_alpha', items: [{ name: 'Rent', category: 'rent', kind: 'monthly', amount: 3100, start_date: '2026-09-01' }, { name: 'Trade show', category: 'marketing', kind: 'once', amount: 5000, start_date: '2026-11-15' }] });
  const pl = (await call('GET', `/api/client?act=brand_alpha&${W}`)).j;
  near(pl.fixed.total, 1500, 'P&L: 15 days of rent, not the trade show that has not happened');
  assert.ok(!pl.fixed.items.some(i => i.name === 'Trade show'));
  const link = (await call('GET', `/api/profit/${TOKEN}?${W}`)).j;
  near(link.fixed.total, pl.fixed.total, 'the client link and P&L agree'); near(link.net, pl.totals.cm - pl.fixed.total, 'on net profit too');
  near((await call('GET', '/api/costs?act=brand_alpha')).j.fixed.month_total, 1900, 'the Costs page month total: 19 days of rent');
  const dr = (await call('GET', `/api/hub/drill?act=brand_alpha&${W}&cmp=none`)).text;
  assert.ok(!dr.includes('Trade show'), 'and the tile drill-down');
  await call('PUT', '/api/expenses', { act: 'brand_alpha', items: [] });
  netSwitch(false);
});
await check('16. the client link: a product rule that starts inside the window withholds profit; from the first day it shows', async () => {
  /* Beta has no Triple Whale product cost, a 35% product rule, a per order shipping rule and a monthly rent of 3,100. */
  const P = `/api/profit/${BETA_TOKEN}?${W}`;
  const setStart = d => { db.prepare(`UPDATE p_cost_rule SET start_date = ?, status = 'on' WHERE act_id = 'brand_beta' AND cost = 'product' AND rule = 'pct_revenue'`).run(d); db.exec(`UPDATE p_cost_health SET verdict = 'good' WHERE act_id = 'brand_beta'`); };
  setStart('2026-10-11'); netSwitch(true);
  const rows = (await call('GET', `/api/client?act=brand_beta&${W}`)).j.rows;
  assert.equal(rows.filter(r => r.gross_profit != null).length, 5, 'five costed days out of fifteen');
  const part = (await call('GET', P)).j;
  assert.equal(part.cm_ok, false); assert.equal(part.mtd.cm, null); assert.equal(part.waterfall, null);
  assert.ok(!('net' in part) && !('fixed' in part), 'no net profit over a window that is only partly costed');
  assert.ok(part.mtd.sales > 0 && part.mtd.spend > 0, 'sales and spend still show');
  setStart('2026-10-01');
  const whole = (await call('GET', P)).j;
  assert.equal(whole.cm_ok, true); assert.ok(whole.mtd.cm != null);
  near(whole.net, whole.mtd.cm - 1500, 'fifteen days of margin against fifteen days of rent');
  near(whole.waterfall.sales - whole.waterfall.cogs - whole.waterfall.ship_cost - whole.waterfall.handling - whole.waterfall.fees, whole.waterfall.gross_profit, 'and the waterfall adds up');
  setStart('2026-07-01'); netSwitch(false);
});
await check('16b. partlyCosted withholds only when the product rule is in force inside the window', () => {
  const rows = [{ date: '2026-10-01', gross_profit: null }, { date: '2026-10-02', gross_profit: 40 }, { date: '2026-10-03', gross_profit: 55 }];
  const rule = (start, end = null, extra = {}) => [{ id: 1, cost: 'product', rule: 'pct_revenue', amount: 30, start_date: start, end_date: end, status: 'on', ...extra }];
  assert.equal(C.partlyCosted(rule('2026-10-02'), rows), true, 'starts inside the window: withheld');
  assert.equal(C.partlyCosted(rule('2026-09-01', '2026-10-02'), rows), true, 'ends inside the window: still in force on some of its days');
  assert.equal(C.partlyCosted(rule('2025-01-01', '2025-12-31'), rows), false, 'ended before the window: the gaps are Triple Whale\'s own and read as they always did');
  assert.equal(C.partlyCosted(rule('2026-11-01'), rows), false, 'starts after the window: no say over it');
  assert.equal(C.partlyCosted(rule('2025-01-01', '2025-12-31'), rows, 'gross_profit', '2026-10-01', '2026-10-03'), false, 'the same with the window passed in');
  assert.equal(C.partlyCosted(rule('2026-10-04'), rows, 'gross_profit', '2026-10-01', '2026-10-05'), true, 'the window passed in decides, not only the days that have a row');
  assert.equal(C.partlyCosted(rule('2026-10-02', null, { status: 'off' }), rows), false, 'switched off');
  assert.equal(C.partlyCosted(rule('2026-10-02', null, { rule: 'per_item' }), rows), false, 'a saved-only rule');
  assert.equal(C.partlyCosted(rule('2026-10-02', null, { cost: 'shipping' }), rows), false, 'a shipping rule');
  assert.equal(C.partlyCosted(rule('2026-09-01'), rows.slice(1)), false, 'every day costed'); assert.equal(C.partlyCosted(rule('2026-09-01'), [rows[0]]), false, 'no day costed');
  assert.equal(C.partlyCosted([], rows), false); assert.equal(C.partlyCosted(null, rows), false, 'no rule at all: never touched');
});
await check('17. a teammate limited to one brand cannot write another brand\'s costs or expenses, whatever the Content-Type', async () => {
  const X = await import('./src/expenses.js');
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
  const accountsFor = async () => [{ act_id: 'brand_alpha', name: 'Alpha Golf', currency: 'USD' }, { act_id: 'brand_beta', name: 'Beta Socks', currency: 'USD' }];
  const only = new Set(['brand_alpha']);
  const send = (handler, path, method, body, type, o = only) => { const url = new URL('https://pf.test' + path);
    return handler({ path: url.pathname, url, request: new Request(url, { method, headers: { 'Content-Type': type }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, json, accountsFor, email: 'mate@example.com', client: null, only: o }); };
  const rulesN = () => db.prepare(`SELECT COUNT(*) n FROM p_cost_rule WHERE act_id = 'brand_beta'`).get().n, expN = () => db.prepare(`SELECT COUNT(*) n FROM p_expense WHERE act_id = 'brand_beta'`).get().n;
  const r0 = rulesN(), e0 = expN(), s0 = db.prepare(`SELECT COUNT(*) n FROM p_product_cost`).get().n;
  const rule = { cost: 'product', rule: 'pct_revenue', amount: 5, start_date: '2026-11-01' };
  for (const type of ['text/plain', 'application/json', 'application/x-www-form-urlencoded']) {
    assert.equal((await send(C.handleCosts, '/api/costs', 'PUT', { act: 'brand_beta', rule }, type)).status, 404, `PUT /api/costs as ${type}`);
    assert.equal((await send(C.handleCosts, '/api/costs/sheet', 'POST', { act: 'brand_beta', csv: 'sku,cost\nA,1\n', start_date: '2026-11-01', dry_run: false }, type)).status, 404, `sheet as ${type}`);
    assert.equal((await send(X.handleExpenses, '/api/expenses', 'PUT', { act: 'brand_beta', items: [] }, type)).status, 404, `PUT /api/expenses as ${type}`);
  }
  const anyId = db.prepare(`SELECT id FROM p_cost_rule WHERE act_id = 'brand_beta' LIMIT 1`).get().id;
  assert.equal((await send(C.handleCosts, `/api/costs?act=brand_beta&id=${anyId}`, 'DELETE', null, 'text/plain')).status, 404);
  assert.deepEqual([rulesN(), expN(), db.prepare(`SELECT COUNT(*) n FROM p_product_cost`).get().n], [r0, e0, s0], 'nothing of brand_beta changed');
  /* their own brand still works, and a person with no limit is not affected */
  const own = await send(C.handleCosts, '/api/costs', 'PUT', { act: 'brand_alpha', rule: { cost: 'shipping', rule: 'zone', table: [{ zone: 'US', amount: 6 }], start_date: '2026-11-01' } }, 'text/plain');
  assert.equal(own.status, 200);
  const free = await send(C.handleCosts, '/api/costs', 'PUT', { act: 'brand_beta', rule: { cost: 'shipping', rule: 'zone', table: [{ zone: 'US', amount: 6 }], start_date: '2026-11-01' } }, 'text/plain', null);
  assert.equal(free.status, 200);
  db.exec(`DELETE FROM p_cost_rule WHERE rule = 'zone'`);
});

await check('18. goals_planned (client, overview with month) and planned (plan): own sales goal, else default\'s; a previous month alone is unplanned', async () => {
  const ym = '2026-10';   // the frozen clock's month
  const was = db.prepare(`SELECT goals_json FROM brands WHERE id = 'brand_alpha'`).get().goals_json;
  const cases = [
    ['no key for the month, default has sales', { default: { sales: 40000, spend: 9000 } }, true],
    ['no key, a previous month and default', { '2026-09': { sales: 40000 }, default: { sales: 40000, spend: 9000 } }, true],
    ['a previous month only', { '2026-09': { sales: 40000, spend: 9000 } }, false],
    ['an empty key, default has sales', { default: { sales: 40000 }, [ym]: {} }, true],
    ['a spend only key, default spend only', { default: { spend: 11000 }, [ym]: { spend: 11000 } }, false],
    ['a margin only key, default has sales', { default: { sales: 40000 }, [ym]: { cm_pct: 0.5 } }, true],
    ['a margin only key, no default', { '2026-09': { sales: 40000 }, [ym]: { cm_pct: 0.5 } }, false],
    ['planned', { [ym]: { sales: 52000, spend: 11000 } }, true],
  ];
  try {
    for (const [label, goals, want] of cases) {
      db.prepare(`UPDATE brands SET goals_json = ? WHERE id = 'brand_alpha'`).run(JSON.stringify(goals));
      const c = (await call('GET', `/api/client?act=brand_alpha&${W}`)).j;
      assert.equal(c.goals_planned, want, `${label}: client`);
      const o = (await call('GET', `/api/overview?${W}&fresh=1`)).j.accounts.find(a => a.act_id === 'brand_alpha');
      assert.equal(o.goals_planned, want, `${label}: overview`); assert.equal(o.month, ym, `${label}: overview month`);
      const p = (await call('GET', '/api/plan?act=brand_alpha')).j;
      assert.equal(p.planned, want, `${label}: plan`);
    }
  } finally { db.prepare(`UPDATE brands SET goals_json = ? WHERE id = 'brand_alpha'`).run(was ?? null); }
});

await check('19. a save for a later month keeps the legacy default goal on its month; the quarter uses the same test', async () => {
  const was = db.prepare(`SELECT goals_json FROM brands WHERE id = 'brand_alpha'`).get().goals_json;
  const read = () => JSON.parse(db.prepare(`SELECT goals_json FROM brands WHERE id = 'brand_alpha'`).get().goals_json);
  try {
    // The shape every save leaves: default = the last typed goal, plus that month's own key.
    db.prepare(`UPDATE brands SET goals_json = ? WHERE id = 'brand_alpha'`).run(JSON.stringify({ default: { sales: 40000, spend: 9000 }, '2026-10': { sales: 40000, spend: 9000 } }));
    const q1 = (await call('GET', '/api/quarter?act=brand_alpha&q=2026-Q4')).j;
    assert.deepEqual(q1.per.map(x => x.planned), [true, true, false], 'quarter: Oct own key, Nov legacy default, Dec unplanned');
    assert.equal(q1.per[1].goal_sales, 40000, 'quarter: November shows the default goal');
    assert.deepEqual(q1.unplanned, ['2026-12'], 'quarter: only December unplanned');
    const r = await call('PUT', '/api/goals', { act: 'brand_alpha', month: '2026-12', sales: 61000, spend: 15000 });
    assert.equal(r.status, 200, 'goals save');
    const g = read();
    assert.equal(g['2026-11']?.sales, 40000, 'November got its own key with the legacy goal');
    assert.equal(g['2026-12'].sales, 61000, 'December saved'); assert.equal(g.default.sales, 61000, 'default rewritten');
    const q2 = (await call('GET', '/api/quarter?act=brand_alpha&q=2026-Q4')).j;
    assert.deepEqual(q2.per.map(x => x.goal_sales), [40000, 40000, 61000], 'quarter after the save: November keeps its number');
    assert.deepEqual(q2.unplanned, [], 'quarter after the save: all planned');
  } finally { db.prepare(`UPDATE brands SET goals_json = ? WHERE id = 'brand_alpha'`).run(was ?? null); }
});

const pass = checks.filter(Boolean).length;
console.log(`\n${pass}/${checks.length} passed`);
process.exit(pass === checks.length ? 0 : 1);
