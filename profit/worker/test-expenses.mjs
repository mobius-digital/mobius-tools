/* Offline checks for src/expenses.js (Costs like Triple Whale, 2026-10-10).
 *   node test-expenses.mjs      (from profit/worker)
 * A real SQLite (node:sqlite) stands in for D1. Checks: every kind spreads per day the way the Costs page says;
 * end dates and windows clip; old p_fixed_cost rows are copied once as monthly costs and a deleted one never comes
 * back; "counts as ad spend" raises spend and lowers MER / CM through the REAL profit worker (/api/client and the
 * drill-down), while the other expenses only feed Net profit; bad input is refused. Who may edit which brand is
 * checked in account-health/worker/test-clients.mjs (the real auth path). */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } }; };
const DB = { prepare: stmt, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied */ } } };
load(path.join(root, 'profit', 'worker', 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'migrations', 'brand-001.sql'));
load(path.join(root, 'account-health', 'worker', 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'migrations', 'fixed-001.sql'));

const X = await import('./src/expenses.js');
const checks = [];
async function check(name, fn) { try { await fn(); checks.push(true); console.log('PASS ', name); } catch (e) { checks.push(false); console.log('FAIL ', name, '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg}: ${a} != ${b}`);

/* Three days of store numbers: revenue, platform spend, paid orders. */
const ROWS = () => [
  { date: '2026-10-01', sales: 1000, spend: 200, orders: 10, new_rev: 500, gross_profit: 600, cm: 400, mer: 5 },
  { date: '2026-10-02', sales: 2000, spend: 400, orders: 20, new_rev: 800, gross_profit: 1200, cm: 800, mer: 5 },
  { date: '2026-10-03', sales: 0, spend: 100, orders: 0, new_rev: 0, gross_profit: 0, cm: -100, mer: 0 },
];

await check('monthly: spread evenly over its month\'s days (3,100 in October = 100 a day), clipped to start and end', () => {
  const s = X.spread([{ id: 1, name: 'Rent', kind: 'monthly', amount: 3100, start_date: '2026-09-01' }], '2026-10-01', '2026-10-03', ROWS());
  near(s.total, 300, 'three days'); near(s.byDate['2026-10-02'], 100, 'a day');
  const c = X.spread([{ name: 'Rent', kind: 'monthly', amount: 3100, start_date: '2026-10-02', end_date: '2026-10-02' }], '2026-10-01', '2026-10-31', ROWS());
  near(c.total, 100, 'only its one day');
  const feb = X.spread([{ name: 'Rent', kind: 'monthly', amount: 2800, start_date: '2026-01-01' }], '2027-02-01', '2027-02-28', []);
  near(feb.total, 2800, 'a whole short month adds to the monthly amount');
  near(X.spread([{ name: 'x', kind: 'monthly', amount: 3100, start_date: '2026-11-01' }], '2026-10-01', '2026-10-31', []).total, 0, 'not started yet');
});
await check('one time: the whole amount on its date, and only when the window holds that date', () => {
  const e = [{ name: 'Photo shoot', kind: 'once', amount: 1500, start_date: '2026-10-02', end_date: '2026-12-31' }];
  const s = X.spread(e, '2026-10-01', '2026-10-03', ROWS());
  near(s.total, 1500, 'in window'); assert.deepEqual(Object.keys(s.byDate), ['2026-10-02']);
  near(X.spread(e, '2026-10-03', '2026-10-31', ROWS()).total, 0, 'outside the window');
});
await check('% of revenue, % of ad spend and per order follow each day\'s numbers', () => {
  const s = X.spread([
    { name: 'Royalty', kind: 'pct_revenue', amount: 5, start_date: '2026-01-01' },
    { name: 'Agency 10%', kind: 'pct_spend', amount: 10, start_date: '2026-01-01' },
    { name: 'Insert card', kind: 'per_order', amount: 0.5, start_date: '2026-10-02' },
  ], '2026-10-01', '2026-10-03', ROWS());
  const by = Object.fromEntries(s.items.map(i => [i.name, i.amount]));
  near(by.Royalty, 150, '5% of 3,000'); near(by['Agency 10%'], 70, '10% of 700'); near(by['Insert card'], 10, '20 orders from Oct 2');
  near(s.total, 230, 'total');
  assert.equal(X.spread([{ name: 'r', kind: 'pct_revenue', amount: 5, start_date: '2026-01-01' }], '2026-10-01', '2026-10-03', []).items.length, 0, 'no rows = nothing to take a % of');
});
await check('"counts as ad spend" goes to its own pile, joins spend, and MER / aMER / CM follow; % of ad spend reads the platforms alone', () => {
  const list = [{ name: 'Influencer', kind: 'monthly', amount: 3100, start_date: '2026-10-01', is_ad_spend: 1 }, { name: 'Agency 10%', kind: 'pct_spend', amount: 10, start_date: '2026-10-01' }];
  const rows = ROWS();
  const s = X.spread(list, '2026-10-01', '2026-10-03', rows);
  near(s.ad_total, 300, 'ad pile'); near(s.total, 70, 'the rest'); assert.equal(s.ad_items[0].name, 'Influencer');
  X.applyAdSpend(rows, s.adByDate);
  assert.equal(rows[0].spend, 300); assert.equal(rows[0].base_spend, 200); assert.equal(rows[0].ad_expense, 100);
  near(rows[0].mer, 1000 / 300, 'MER on the new spend'); near(rows[0].amer, 500 / 300, 'aMER'); assert.equal(rows[0].cm, 300, 'CM = GP - new spend');
  X.applyAdSpend(rows, s.adByDate); assert.equal(rows[0].spend, 300, 'never added twice');
  near(X.spread(list, '2026-10-01', '2026-10-03', rows).total, 70, '% of ad spend still reads the platforms, not the expense');
});
await check('bad input is refused with a plain sentence', () => {
  assert.match(X.clean({ name: '' })[0], /needs a name/);
  assert.match(X.clean({ name: 'a', amount: 'x', start_date: '2026-10-01' })[0], /not a number/);
  assert.match(X.clean({ name: 'a', amount: 120, kind: 'pct_revenue', start_date: '2026-10-01' })[0], /more than 100/);
  assert.match(X.clean({ name: 'a', amount: 1, start_date: '' })[0], /pick the date/);
  assert.match(X.clean({ name: 'a', amount: 1, start_date: '2026-10-05', end_date: '2026-10-01' })[0], /before the start/);
  const [err, c] = X.clean({ name: 'Shoot', kind: 'once', amount: '$1,500', start_date: '2026-10-02', end_date: '2026-12-01', category: 'nope', is_ad_spend: 'yes' });
  assert.equal(err, null); assert.equal(c.amount, 1500); assert.equal(c.end_date, null, 'a one-time cost has no end'); assert.equal(c.category, 'other'); assert.equal(c.is_ad_spend, 1);
  assert.ok(!/—/.test(JSON.stringify([X.CATEGORIES, X.KINDS])), 'no em dashes in the choices');
});

/* ---------- the real worker ---------- */
db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, source) VALUES ('brand_alpha', 'alpha', 'Alpha Golf', 'active', 'USD', 'America/Chicago', 'locus')`);
db.exec(`INSERT INTO p_fixed_cost (act_id, name, category, monthly, start_month, end_month, created_by) VALUES
  ('brand_alpha', 'Klaviyo', 'Software', 3100, '2026-09', NULL, 'cole@go-mobius-digital.com'),
  ('brand_alpha', 'Old retainer', 'Agency fee', 6000, '2026-01', '2026-08', NULL)`);
const put = (metric, date, v) => db.prepare(`INSERT INTO tw_daily (act_id, date, metric, value) VALUES (?, ?, ?, ?)`).run('brand_alpha', date, metric, v);
for (const [d, sales, spend, orders] of [['2026-10-01', 1000, 200, 10], ['2026-10-02', 2000, 400, 20], ['2026-10-03', 1500, 300, 15]]) {
  put('netSales', d, sales); put('blendedAds', d, spend); put('totalOrders', d, orders); put('totalProductCosts', d, sales * 0.3); put('newCustomersOrders', d, orders / 2);
}
const PF = (await import('./src/worker.js')).default;
const env = { DB, ADMIN_TOKEN: 'adm' };
const call = async (method, p, body) => { const r = await PF.fetch(new Request('https://pf.test' + p, { method, headers: { Authorization: 'Bearer adm', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, { waitUntil() {} }); return { status: r.status, j: await r.json() }; };
const Q = '/api/client?act=brand_alpha&from=2026-10-01&to=2026-10-03';

let before;
await check('old fixed expenses are copied once as monthly costs (category mapped, end month to its last day)', async () => {
  const g = await call('GET', '/api/expenses?act=brand_alpha');
  assert.equal(g.status, 200, JSON.stringify(g.j));
  const by = Object.fromEntries(g.j.items.map(x => [x.name, x]));
  assert.deepEqual([by.Klaviyo.kind, by.Klaviyo.category, by.Klaviyo.amount, by.Klaviyo.start_date, by.Klaviyo.end_date, by.Klaviyo.added_by], ['monthly', 'software', 3100, '2026-09-01', null, 'Cole']);
  assert.deepEqual([by['Old retainer'].category, by['Old retainer'].end_date], ['agency', '2026-08-31']);
  assert.ok(g.j.sources && g.j.sources.from, 'where each cost comes from');
  before = (await call('GET', Q)).j;
  near(before.fixed.total, 300, 'Klaviyo 3 days = 300 under Net profit'); assert.equal(before.totals.spend, 900);
});
await check('a migrated row the brand removes never comes back', async () => {
  const g = await call('GET', '/api/expenses?act=brand_alpha');
  const keep = g.j.items.filter(x => x.name !== 'Old retainer');
  assert.equal((await call('PUT', '/api/expenses', { act: 'brand_alpha', items: keep })).status, 200);
  X._reset(); await X.ensure(env);   // a fresh isolate runs the copy again
  const again = await call('GET', '/api/expenses?act=brand_alpha');
  assert.deepEqual(again.j.items.map(x => x.name), ['Klaviyo']);
});
await check('"counts as ad spend" changes spend, MER and CM on P&L; the rest only changes Net profit', async () => {
  const g = await call('GET', '/api/expenses?act=brand_alpha');
  const items = [...g.j.items, { name: 'Podcast read', category: 'marketing', kind: 'once', amount: 600, start_date: '2026-10-02', is_ad_spend: true },
    { name: 'Agency 10%', category: 'agency', kind: 'pct_spend', amount: 10, start_date: '2026-10-01' }];
  const p = await call('PUT', '/api/expenses', { act: 'brand_alpha', items });
  assert.equal(p.status, 200, JSON.stringify(p.j));
  const a = (await call('GET', Q)).j;
  assert.equal(a.totals.spend, 1500, '900 platforms + 600 podcast'); assert.equal(a.totals.ad_expense, 600); assert.equal(a.totals.base_spend, 900);
  near(a.totals.mer, 4500 / 1500, 'MER on the new spend'); near(a.totals.cm, before.totals.cm - 600, 'CM down by the ad expense');
  near(a.totals.cac, 1500 / 22.5, 'cost per new customer on the new spend');
  near(a.fixed.ad_total, 600, 'ad pile'); assert.equal(a.fixed.ad_items[0].name, 'Podcast read');
  near(a.fixed.total, 300 + 90, 'Klaviyo + 10% of the platforms\' 900 under Net profit');
  /* switch the podcast off "ad spend": spend and MER go back, Net profit carries it instead */
  const off = items.map(x => x.name === 'Podcast read' ? { ...x, is_ad_spend: false } : x);
  await call('PUT', '/api/expenses', { act: 'brand_alpha', items: off.map(x => ({ ...x, id: undefined })) });
  const b = (await call('GET', Q)).j;
  assert.equal(b.totals.spend, 900); near(b.totals.mer, 5, 'MER back'); near(b.totals.cm, before.totals.cm, 'CM back'); near(b.fixed.total, 990, 'Net profit carries it');
});
await check('the tile drill-down prices it the same way (spend, ad items, Net profit)', async () => {
  const g = await call('GET', '/api/expenses?act=brand_alpha');
  await call('PUT', '/api/expenses', { act: 'brand_alpha', items: g.j.items.map(x => x.name === 'Podcast read' ? { ...x, is_ad_spend: true } : x) });
  const d = await call('GET', '/api/hub/drill?act=brand_alpha&from=2026-10-01&to=2026-10-03&cmp=none');
  assert.equal(d.status, 200, JSON.stringify(d.j).slice(0, 300));
  const b = d.j.brands[0];
  assert.equal(b.cur.spend, 1500); assert.equal(b.cur.ad_expense, 600); assert.equal(b.ad_items[0].name, 'Podcast read');
  near(b.profit.cur.fixed, 390, 'under Net profit'); near(b.profit.cur.net, b.profit.cur.cm - 390, 'net = cm - custom');
});

const pass = checks.filter(Boolean).length;
console.log(`\n${pass}/${checks.length} passed`);
process.exit(pass === checks.length ? 0 : 1);
