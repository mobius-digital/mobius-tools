/* Offline checks for Shopify daily store totals (src/shopsync.js, 2026-11-26): money per day from ShopifyQL with
 * sales = total sales minus tax, paid orders only ($0 sample orders counted apart), new vs returning, the store's own
 * day boundary, the 60-day read_orders window, a page cap that never writes a half-counted day, and the hourly tick.
 *   node test-shopsync.mjs   (from profit/worker) */
import assert from 'node:assert/strict';
import { syncShopDaily, shopDailyTick, moneyRows, classifyOrder, ordersStart, dayIn, salesQuery } from './src/shopsync.js';
import { makeDb } from './test-d1.mjs';

const SHOP = 'test-store.myshopify.com', ACT = 'brand_test';
const NOW = Date.parse('2026-11-20T18:00:00Z'), now = () => NOW;
const wait = async () => {};
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log('PASS ', name); };

const order = (createdAt, amount, o = {}) => ({ createdAt, test: false, cancelledAt: null, displayFinancialStatus: 'PAID',
  totalPriceSet: { shopMoney: { amount: String(amount) } }, customerJourneySummary: { customerOrderIndex: 1 }, ...o });

/** A fake Shopify GraphQL endpoint: shop info, one ShopifyQL answer, and the orders split into pages of `per`. */
function fakeShop({ sqlRows = [], orders = [], per = 250, tz = 'America/Chicago', parseErrors = null } = {}) {
  const calls = [];
  const F = async (url, init) => {
    assert.equal(url, `https://${SHOP}/admin/api/2026-07/graphql.json`);
    const { query, variables } = JSON.parse(init.body); calls.push({ query, variables });
    const reply = data => new Response(JSON.stringify({ data, extensions: { cost: { throttleStatus: { currentlyAvailable: 1800, restoreRate: 100 } } } }));
    if (query.includes('ianaTimezone')) return reply({ shop: { ianaTimezone: tz, currencyCode: 'USD' } });
    if (query.includes('shopifyqlQuery')) return reply({ shopifyqlQuery: parseErrors ? { tableData: null, parseErrors } : { tableData: { columns: [], rows: sqlRows }, parseErrors: [] } });
    if (query.includes('orders(')) {
      const start = variables.after ? Number(variables.after) : 0;
      const nodes = orders.slice(start, start + per), next = start + per;
      return reply({ orders: { nodes, pageInfo: { hasNextPage: next < orders.length, endCursor: String(next) } } });
    }
    throw new Error('unexpected query');
  };
  F.calls = calls; return F;
}
const put = (db, o = {}) => db.prepare(`INSERT INTO p_shopify (shop, act_id, access_token, scopes) VALUES (?,?,?,?)`)
  .run(o.shop || SHOP, 'act_id' in o ? o.act_id : ACT, o.access_token ?? 'tok', o.scopes ?? 'read_orders,read_reports');
const rows = db => db.prepare(`SELECT * FROM p_shop_daily ORDER BY day`).all();

await ok('ShopifyQL rows: sales is total sales minus tax, refunds are positive, bad days are dropped', async () => {
  const m = moneyRows([
    { day: '2026-11-19', orders: '4', gross_sales: '120', discounts: '-20', returns: '-15', net_sales: '85', shipping_charges: '10', taxes: '8', total_sales: '103' },
    { day: 'not a day', total_sales: '5' },
  ]);
  assert.equal(m.length, 1);
  assert.equal(m[0].sales, 95); assert.equal(m[0].refunds, 15); assert.equal(m[0].orders_all, 4);
  assert.match(salesQuery(90), /FROM sales SHOW .*total_sales.*GROUP BY day SINCE -90d UNTIL today/);
});

await ok('an order counts only when paid, above $0, not a test and not cancelled', async () => {
  assert.equal(classifyOrder(order('2026-11-19T12:00:00Z', 40)), 'paid');
  assert.equal(classifyOrder(order('2026-11-19T12:00:00Z', 0)), 'zero');
  assert.equal(classifyOrder(order('2026-11-19T12:00:00Z', 40, { test: true })), null);
  assert.equal(classifyOrder(order('2026-11-19T12:00:00Z', 40, { cancelledAt: '2026-11-19T13:00:00Z' })), null);
  assert.equal(classifyOrder(order('2026-11-19T12:00:00Z', 40, { displayFinancialStatus: 'PENDING' })), null);
  assert.equal(classifyOrder(order('2026-11-19T12:00:00Z', 40, { displayFinancialStatus: 'PARTIALLY_REFUNDED' })), 'paid');
});

await ok('days follow the store time zone, and the orders list stops at 60 days without read_all_orders', async () => {
  assert.equal(dayIn('2026-11-20T03:00:00Z', 'America/Chicago'), '2026-11-19');
  assert.equal(ordersStart('2026-11-20', 90, 'read_orders'), '2026-09-23');
  assert.equal(ordersStart('2026-11-20', 90, 'read_orders,read_all_orders'), '2026-08-23');
  assert.equal(ordersStart('2026-11-20', 3, 'read_orders'), '2026-11-18');
});

await ok('a sync writes money and paid orders per day, new vs returning, and marks the store synced', async () => {
  const { db, DB } = makeDb(); put(db);
  const F = fakeShop({
    sqlRows: [{ day: '2026-11-19', orders: '3', total_sales: '108', taxes: '8', returns: '0' }],
    orders: [
      order('2026-11-19T15:00:00Z', 54),
      order('2026-11-19T16:00:00Z', 54, { customerJourneySummary: { customerOrderIndex: 3 } }),
      order('2026-11-19T17:00:00Z', 0),                                  // creator sample: not an order
      order('2026-11-20T04:00:00Z', 20),                                 // 10pm Nov 19 in Chicago
    ],
  });
  const r = await syncShopDaily({ DB }, { shop: SHOP, act_id: ACT, scopes: 'read_orders' }, { token: 'tok', F, wait, now, days: 3 });
  assert.equal(r.money_days, 1); assert.equal(r.order_days, 3); assert.equal(r.resume_from, undefined);
  const d = rows(db), d19 = d.find(x => x.day === '2026-11-19');
  assert.equal(d19.sales, 100); assert.equal(d19.orders_all, 3);
  assert.equal(d19.orders, 3); assert.equal(d19.zero_orders, 1); assert.equal(d19.new_orders, 2); assert.equal(d19.returning_orders, 1);
  assert.equal(d19.paid_sales, 128); assert.equal(d19.orders_source, 'orders');
  assert.equal(d.find(x => x.day === '2026-11-20').orders, 0);           // a day with no orders is a real zero
  const s = db.prepare(`SELECT orders_sync_at, orders_days, orders_error FROM p_shopify WHERE shop = ?`).get(SHOP);
  assert.ok(s.orders_sync_at); assert.equal(s.orders_days, 3); assert.equal(s.orders_error, null);
});

await ok('a ShopifyQL parse error throws instead of writing nothing quietly', async () => {
  const { db, DB } = makeDb(); put(db);
  await assert.rejects(syncShopDaily({ DB }, { shop: SHOP, act_id: ACT }, { token: 'tok', F: fakeShop({ parseErrors: ['bad column'] }), wait, now }), /ShopifyQL: bad column/);
  assert.equal(rows(db).length, 0);
});

await ok('the page cap leaves the last, half-read day for the next call and says where to resume', async () => {
  const { db, DB } = makeDb(); put(db);
  const orders = [order('2026-11-18T15:00:00Z', 10), order('2026-11-19T15:00:00Z', 10), order('2026-11-19T16:00:00Z', 10), order('2026-11-20T15:00:00Z', 10)];
  const r = await syncShopDaily({ DB }, { shop: SHOP, act_id: ACT }, { token: 'tok', F: fakeShop({ orders, per: 2 }), wait, now, days: 3, maxPages: 1 });
  assert.equal(r.resume_from, '2026-11-19');
  assert.deepEqual(rows(db).map(x => [x.day, x.orders]), [['2026-11-18', 1]]);
  const r2 = await syncShopDaily({ DB }, { shop: SHOP, act_id: ACT }, { token: 'tok', F: fakeShop({ orders: orders.slice(1) }), wait, now, days: 3, from: r.resume_from });
  assert.equal(r2.resume_from, undefined);
  assert.deepEqual(rows(db).map(x => [x.day, x.orders]), [['2026-11-18', 1], ['2026-11-19', 2], ['2026-11-20', 1]]);
});

await ok('the hourly tick syncs matched stores only, skips fresh ones, and notes a lost connection', async () => {
  const { db, DB } = makeDb(); put(db); put(db, { shop: 'other.myshopify.com', act_id: null }); put(db, { shop: 'gone.myshopify.com', act_id: 'brand_gone' });
  const F = async (url, init) => fakeShop()(url.replace(/https:\/\/[^/]+/, `https://${SHOP}`), init);
  const out = await shopDailyTick({ DB }, { F, now, tokenFor: async shop => shop === SHOP ? 'tok' : null });
  assert.equal(out.stores.length, 2);
  assert.equal(out.stores.find(s => s.shop === 'gone.myshopify.com').error, 'not connected');
  assert.equal(db.prepare(`SELECT orders_error FROM p_shopify WHERE shop = 'gone.myshopify.com'`).get().orders_error.startsWith('not connected'), true);
  assert.equal(db.prepare(`SELECT orders_sync_at FROM p_shopify WHERE shop = 'other.myshopify.com'`).get().orders_sync_at, null);
  const again = await shopDailyTick({ DB }, { F, now, tokenFor: async () => 'tok' });
  assert.deepEqual(again.stores.map(s => s.shop), ['gone.myshopify.com']);   // the synced one is fresh for 50 minutes
});

console.log(`\n${n} passed`);
