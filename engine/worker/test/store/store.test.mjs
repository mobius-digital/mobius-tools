/* Tests for the store group: access for every row, the shape of each ported answer against its made up
   sample, the numbers on a small made up brand, the forwards, and that a client never reads the other brand.
   Run: node --test "engine/worker/test/store/*.test.mjs" */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { makeEnv, asCaller, call, sameShape, genAccessTests, assertNoLeak, NORTH, RIVER, NORTH_AD_ACCOUNT, RIVER_AD_ACCOUNT, RIVER_IDS }
  from '../../src/platform/testkit/index.mjs';
import { routes } from '../../src/store/routes.js';
import { dayIn, addDays } from '../../src/platform/time.js';
import { storeRoll } from '../../src/store/sales.js';
import { marginOverride } from '../../src/store/economics.js';

const GROUPS = { groups: ['store'] };
const TODAY = dayIn('America/Chicago');
const day = n => addDays(TODAY, n);
const sample = name => new URL(`../../src/store/samples/${name}.json`, import.meta.url);
const readSample = name => JSON.parse(readFileSync(sample(name), 'utf8'));

/* One tracker day for a brand: { metric: value } -> rows. */
const twDay = (act, date, values) => Object.entries(values).map(([metric, value]) => ({ act_id: act, date, metric, value }));

const NORTH_DAY = { netSales: 1100, totalSales: 1150, totalNetTaxes: 100, totalTaxes: 105, totalNewGrossSales: 1300, totalShippingPrice: 50,
  totalOrders: 20, totalOrdersCombinedItemsQuantity: 30, newCustomersOrders: 8, newCustomerSales: 500, rcRevenue: 500,
  blendedAds: 200, pixelCostPerSession: 0.5, pixelCostPerAtc: 4, totalProductCosts: 300, totalShippingCosts: 60, totalHandlingFees: 10,
  totalPaymentGatewayCosts: 30, klaviyoPlacedOrderSales: 150, totalKlaviyoPlacedOrderTotalPriceCampaigns: 90,
  totalKlaviyoPlacedOrderTotalPriceFlows: 60, totalKlaviyoClickedEmail: 40, totalKlaviyoClickedSms: 5, totalAmazonSales: 70, totalAmazonOrders: 2 };
const RIVER_DAY = { netSales: 9000, totalSales: 9100, totalNetTaxes: 0, totalOrders: 90, newCustomersOrders: 30, newCustomerSales: 3000,
  rcRevenue: 6000, blendedAds: 999, klaviyoPlacedOrderSales: 777 };

function rows() {
  const tw_daily = [], tw_orders = [];
  for (let n = -10; n <= -1; n++) tw_daily.push(...twDay(NORTH, day(n), NORTH_DAY), ...twDay(RIVER, day(n), RIVER_DAY));
  /* North: three customers. One bought twice. One order has no customer. History starts 200 days back. */
  const order = (act, id, cust, n, total, products, source) => ({ act_id: act, order_id: id, customer_id: cust, date: day(n), total, products_json: JSON.stringify(products), source });
  tw_orders.push(order(NORTH, 'n0', 'c0', -200, 40, ['p1'], 'meta'), order(NORTH, 'n1', 'c1', -100, 60, ['p1', 'p2'], 'meta'),
    order(NORTH, 'n2', 'c1', -80, 80, ['p3'], 'klaviyo'), order(NORTH, 'n3', 'c2', -5, 50, ['p2'], 'google'),
    order(NORTH, 'n4', null, -4, 30, ['p1'], null), order(NORTH, 'n5', 'c1', -3, 90, ['p1'], 'direct'),
    order(RIVER, 'r1', 'rc1', -5, 5555, ['rp1'], 'meta'));
  return { tw_daily, tw_orders,
    tw_order_touch: [
      { act_id: NORTH, order_id: 'n3', date: day(-5), model: 'lastPlatformClick', platform: 'meta', ad_id: 'ad_n1' },
      { act_id: NORTH, order_id: 'n5', date: day(-3), model: 'lastPlatformClick', platform: 'meta', ad_id: 'ad_n1' },
      { act_id: RIVER, order_id: 'r1', date: day(-5), model: 'lastPlatformClick', platform: 'meta', ad_id: 'ad_r1' }],
    ads: [{ act_id: NORTH_AD_ACCOUNT, ad_id: 'ad_n1', name: 'North ad', adset_id: 'set_n1' }, { act_id: NORTH_AD_ACCOUNT, ad_id: 'ad_n2', name: 'North two', adset_id: 'set_n1' },
      { act_id: RIVER_AD_ACCOUNT, ad_id: 'ad_r1', name: 'River ad', adset_id: 'set_r1' }],
    ad_daily: [{ act_id: NORTH_AD_ACCOUNT, ad_id: 'ad_n1', date: day(-3), spend: 100 }, { act_id: NORTH_AD_ACCOUNT, ad_id: 'ad_n1', date: day(-20), spend: 50.555 },
      { act_id: NORTH_AD_ACCOUNT, ad_id: 'ad_n2', date: day(-2), spend: 25 }, { act_id: RIVER_AD_ACCOUNT, ad_id: 'ad_r1', date: day(-3), spend: 4321 }],
    meta_adsets: [{ act_id: NORTH_AD_ACCOUNT, adset_id: 'set_n1', name: 'North set' }, { act_id: RIVER_AD_ACCOUNT, adset_id: 'set_r1', name: 'River set' }],
    daily_insights: [{ act_id: NORTH_AD_ACCOUNT, date: day(-2), spend: 120 }],
    p_cost_health: [{ act_id: NORTH, verdict: 'good' }, { act_id: RIVER, verdict: 'broken' }],
    connections: [{ id: 'tw:north', brand_id: NORTH, kind: 'triple_whale', external_id: 'north-kites.shop.test', is_primary: 1 }],
    settings: [{ key: `productTitles:${NORTH}`, value: JSON.stringify({ at: Date.now(), map: { p1: 'Red Kite', p2: 'Blue Kite' } }) },
      { key: `productNames:${NORTH}`, value: JSON.stringify({ p3: 'Old Kite' }) },
      { key: `productTitles:${RIVER}`, value: JSON.stringify({ at: Date.now(), map: { rp1: 'River Leaf Tin' } }) }] };
}

const env = (more = {}) => makeEnv({ ...GROUPS, rows: { ...rows(), ...more } });
const get = (e, path, kind = 'owner') => call(e, 'GET', path, { token: asCaller(kind) });

/* The answer must have the shape of its sample. UPDATE_SAMPLES=1 writes the sample from the made up rows. */
function checkShape(name, json) {
  if (process.env.UPDATE_SAMPLES === '1') {
    const { meta, ...rest } = json;
    writeFileSync(sample(name), JSON.stringify(rest, null, 2) + '\n');
  }
  assert.deepEqual(sameShape(readSample(name), json), []);
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);

genAccessTests(routes, GROUPS);

test('customers: same shape as the sample, and the unit numbers are right', async () => {
  const r = await get(env(), `/pw/api/customers?act=${NORTH}&months=2&days=5`);
  assert.equal(r.status, 200);
  assert.equal(r.engine, 'new');
  checkShape('customers', r.json);
  const h = r.json.headline;
  assert.deepEqual(r.json.window, { days: 5, from: day(-5), to: day(-1) });
  near(h.sales, 5000);                 // 5 days of 1100 less 100 tax
  near(h.spend, 1000);
  near(h.cac, 25);                     // 1000 over 40 new orders
  near(h.new_aov, 62.5);               // half of sales over 40 new orders
  near(h.margin, 0.6);                 // 1000 less 400 costs, over 1000
  near(h.first_order_cm, 62.5 * 0.6 - 25);
  near(h.repeat_share, 0.6);
  near(h.mer, 5);
  assert.equal(h.thin, true);
  assert.equal(r.json.cm_ok, true);
  assert.equal(r.json.account.tw_shop, 'north-kites.shop.test');
});

test('customers: the journey counts people, guests, product names and the window', async () => {
  const j = (await get(env(), `/pw/api/customers?act=${NORTH}&days=10`)).json.journey;
  assert.equal(j.have, true);
  assert.equal(j.customers, 3);
  assert.equal(j.certain_customers, 2);            // c0 was first seen in the first 60 days of history
  assert.equal(j.guest_orders, 1);
  assert.equal(j.orders, 6);
  assert.equal(j.days_to_second, 20);
  assert.equal(j.products.first[0].name, 'Blue Kite');
  assert.equal(j.products.next[0].name, 'Old Kite');
  assert.deepEqual(j.window, { from: day(-10), to: day(-1), orders: 2, returning_orders: 1, returning_share: 0.5, revenue: 140, returning_revenue: 90 });
  assert.equal(j.curve.find(c => c.days === 30).customers, 1);
});

test('customers: journey=0 leaves the journey out, a named range is used, an unknown brand is 404', async () => {
  const r = await get(env(), `/pw/api/customers?act=${NORTH}&journey=0&from=${day(-3)}&to=${day(-2)}`);
  assert.equal(r.json.journey, null);
  assert.deepEqual(r.json.window, { days: 30, from: day(-3), to: day(-2) });
  near(r.json.headline.sales, 2000);
  const none = await get(env(), '/pw/api/customers?act=brand_nobody_home');
  assert.equal(none.status, 404);
  assert.deepEqual(none.json, { error: 'unknown account' });
  assert.equal((await get(env(), '/pw/api/customers')).status, 404);
});

test('customers: a bad cost check with no typed margin says cm_ok false, a typed margin wins', async () => {
  const bad = await get(env({ p_cost_health: [{ act_id: NORTH, verdict: 'broken' }] }), `/pw/api/customers?act=${NORTH}&journey=0`);
  assert.equal(bad.json.cm_ok, false);
  const e = env({ p_cost_health: [{ act_id: NORTH, verdict: 'broken' }] });
  e.DB.exec(`UPDATE brands SET goals_json = '{"default":{"cm_pct":0.5}}' WHERE id = '${NORTH}'`);
  const typed = await get(e, `/pw/api/customers?act=${NORTH}&journey=0&days=5`);
  assert.equal(typed.json.cm_ok, true);
  assert.equal(typed.json.margin_pct, 0.5);
  near(typed.json.headline.margin, 0.5);
});

test('customers: a brand with its own cost rule, or an extra ad cost, goes to the old worker', async () => {
  const rule = await get(env({ p_cost_rule: [{ act_id: NORTH, cost: 'product', rule: 'pct_revenue', amount: 30, start_date: day(-90) }] }), `/pw/api/customers?act=${NORTH}`);
  assert.equal(rule.engine, 'forward');
  const cost = await get(env({ p_expense: [{ act_id: NORTH, name: 'Agency ads', amount: 100, start_date: day(-90), is_ad_spend: 1 }] }), `/pw/api/customers?act=${NORTH}`);
  assert.equal(cost.engine, 'forward');
  const other = await get(env({ p_cost_rule: [{ act_id: RIVER, cost: 'product', rule: 'pct_revenue', amount: 30, start_date: day(-90) }] }), `/pw/api/customers?act=${NORTH}`);
  assert.equal(other.engine, 'new', 'another brand\'s rule must not matter');
});

test('product names older than a day send the request to the old worker', async () => {
  const stale = { settings: [{ key: `productTitles:${NORTH}`, value: JSON.stringify({ at: Date.now() - 25 * 3600e3, map: { p1: 'Red Kite' } }) }] };
  assert.equal((await get(env(stale), `/pw/api/customers?act=${NORTH}`)).engine, 'forward');
  assert.equal((await get(env(stale), `/pw/api/hub/store?act=${NORTH}`)).engine, 'forward');
  assert.equal((await get(env(stale), `/pw/api/customers?act=${NORTH}&journey=0`)).engine, 'new');
  assert.equal((await get(env(stale), `/pw/api/hub/email?act=${NORTH}`)).engine, 'new');
});

test('hub/store: one brand has the shape of the sample and the right totals', async () => {
  const r = await get(env(), `/pw/api/hub/store?act=${NORTH}&days=5`);
  assert.equal(r.status, 200);
  checkShape('hub-store', r.json);
  assert.deepEqual(r.json.window, { from: day(-5), to: day(-1), pf: day(-10), pt: day(-6), span: 5, today: TODAY });
  const b = r.json.brands[0];
  near(b.cur.revenue, 5000);
  near(b.cur.aov, 50);
  near(b.cur.discounts, 5 * (1300 + 50 + 105 - 1150));
  near(b.cur.returns, 5 * (1150 - 1100 - 5));
  near(b.cur.sessions, 2000);
  near(b.cur.conversion, 0.05);
  near(b.cur.new_share, 0.5);
  near(b.prev.revenue, 5000);
  assert.equal(b.series.length, 5);
  assert.equal(b.prev_series.length, 5);
  assert.equal(b.product_orders, 3);
  assert.deepEqual(b.products.map(p => p.title).sort(), ['Blue Kite', 'Red Kite']);
  assert.equal(r.json.model_label, 'Triple Whale, last platform click');
});

test('hub/store: many brands get the short row, cmp none has no days before, a limited teammate sees only theirs', async () => {
  const all = await get(env(), '/pw/api/hub/store?days=3&cmp=none');
  checkShape('hub-store-all', all.json);
  assert.equal(all.json.brands.length, 2);
  assert.equal(all.json.brands[0].prev, null);
  assert.equal(all.json.window.pf, null);
  assert.ok(!('products' in all.json.brands[0]));
  const lim = await get(env(), '/pw/api/hub/store?days=3', 'limited');
  assert.deepEqual(lim.json.brands.map(b => b.act_id), [NORTH]);
  for (const id of RIVER_IDS) assert.ok(!lim.text.includes(id));
  assert.ok(!lim.text.includes('9000') && !lim.text.includes('River'));
});

test('hub/email: same shape as the sample, share of sales is right', async () => {
  const r = await get(env(), `/pw/api/hub/email?act=${NORTH}&days=4`);
  checkShape('hub-email', r.json);
  const b = r.json.brands[0];
  near(b.cur.email, 600);
  near(b.cur.revenue, 4000);
  near(b.cur.share, 0.15);
  assert.deepEqual(b.series[0], { date: day(-4), campaigns: 90, flows: 60, email: 150 });
});

test('hub/stockads: same shape as the sample, spend is shared across the products an ad sold', async () => {
  const r = await get(env(), `/pw/api/hub/stockads?act=${NORTH}`);
  checkShape('hub-stockads', r.json);
  const b = r.json.brands[0];
  assert.equal(b.spend, 176);                      // 150.555 + 25, rounded
  assert.equal(b.mapped, 151);
  assert.deepEqual(b.products, { p2: { spend: 75.28, orders: 1, ads: 1 }, p1: { spend: 75.28, orders: 1, ads: 1 } });
  assert.deepEqual(b.adsets, [{ adset_id: 'set_n1', name: 'North set', s7: 125, s30: 175.56, products: [['p2', 1], ['p1', 1]] }]);
  assert.equal((await get(env(), '/pw/api/hub/stockads')).engine, 'forward', 'many brands at once go to the old worker');
});

for (const path of ['/pw/api/customers?days=10', '/pw/api/hub/store?days=10', '/pw/api/hub/email?days=10', '/pw/api/hub/stockads']) {
  test(`${path}: a client never reads the other brand`, async () => {
    const { mine } = await assertNoLeak(env(), 'GET', path);
    assert.equal(mine.status, 200);
    assert.equal(mine.engine, 'new');
    for (const word of ['River', '5555', '4321', '9000', 'rp1', 'ad_r1', 'set_r1']) assert.ok(!mine.text.includes(word), `the answer holds ${word}`);
  });
}

test('the store roll and the typed margin keep the old rules', () => {
  assert.equal(storeRoll({}, day(-2), day(-1)).revenue, null);
  assert.equal(storeRoll({}, day(-2), day(-1)).aov, null);
  assert.equal(marginOverride({ goals_json: '{"2026-01":{"cm_pct":0.4},"default":{"cm_pct":0.2}}' }, '2026-03'), 0.4);
  assert.equal(marginOverride({ goals_json: '{"2026-05":{"sales":1},"default":{"cm_pct":0.2}}' }, '2026-03'), 0.2);
  assert.equal(marginOverride({ goals_json: '' }, '2026-03'), null);
});
