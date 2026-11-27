/* Offline checks for Shopify daily store totals (src/shopsync.js, 2026-11-26): money per day from ShopifyQL with
 * sales = total sales minus tax, paid orders only ($0 sample orders counted apart), new vs returning, the store's own
 * day boundary, the 60-day read_orders window, a page cap that never writes a half-counted day, the hourly tick, and the
 * orders-only money when ShopifyQL is refused (read_reports + protected customer data Level 2).
 *   node test-shopsync.mjs   (from profit/worker) */
import assert from 'node:assert/strict';
import { syncShopDaily, shopDailyTick, moneyRows, classifyOrder, ordersStart, dayIn, salesQuery, ensureShopDaily,
  orderMoney, ordersQuery, ordersQueryCost, ACCESS_REPORTS, ACCESS_ORDERS, isAccessNote, shopMoneyKey, noteSyncError,
  PAGE_MONEY, PAGE_COUNTS, MAX_QUERY_COST } from './src/shopsync.js';
import { dayComplete, overlayShopify } from './src/storesource.js';
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
  /* Both were tried this hour (one synced, one failed): neither runs again for 50 minutes. */
  const again = await shopDailyTick({ DB }, { F, now, tokenFor: async () => 'tok' });
  assert.equal(again.skipped, 'every store is fresh');
  assert.ok(db.prepare(`SELECT orders_try_at FROM p_shopify WHERE shop = 'gone.myshopify.com'`).get().orders_try_at);
});

await ok('a store that keeps failing goes to the back of the line and never starves the healthy ones', async () => {
  const { db, DB } = makeDb();
  for (const i of [1, 2, 3]) put(db, { shop: `bad${i}.myshopify.com`, act_id: `brand_bad${i}` });
  put(db, { shop: SHOP, act_id: ACT });
  const F = async (url, init) => fakeShop()(url.replace(/https:\/\/[^/]+/, `https://${SHOP}`), init);
  const tokenFor = async shop => (shop === SHOP ? 'tok' : null);
  /* The healthy store synced a while ago; the three failing ones never did, so they go first once. */
  await ensureShopDaily({ DB }); db.prepare(`UPDATE p_shopify SET orders_sync_at = '2026-11-20 10:00:00' WHERE shop = ?`).run(SHOP);
  let t = NOW;
  const first = await shopDailyTick({ DB }, { F, now: () => t, tokenFor });
  assert.deepEqual(first.stores.map(s => s.shop).sort(), ['bad1.myshopify.com', 'bad2.myshopify.com', 'bad3.myshopify.com']);
  t += 60 * 60000;                                                      // the next hour: the healthy store goes first
  const next = await shopDailyTick({ DB }, { F, now: () => t, tokenFor });
  assert.equal(next.stores[0].shop, SHOP); assert.equal(next.stores[0].error, undefined);
  assert.ok(db.prepare(`SELECT orders_sync_at FROM p_shopify WHERE shop = ?`).get(SHOP).orders_sync_at > '2026-11-20 10:00:00');
});

await ok('a failed orders pass leaves orders_at alone while the money stamp moves', async () => {
  const { db, DB } = makeDb(); put(db);
  const sqlRows = [{ day: '2026-11-19', orders: '1', total_sales: '54', taxes: '4', returns: '0' }];
  const early = Date.parse('2026-11-19T20:00:00Z');
  await syncShopDaily({ DB }, { shop: SHOP, act_id: ACT }, { token: 'tok', F: fakeShop({ sqlRows, orders: [order('2026-11-19T15:00:00Z', 54)] }), wait, now: () => early, days: 3 });
  const before = db.prepare(`SELECT synced_at, orders_at FROM p_shop_daily WHERE day = '2026-11-19'`).get();
  assert.equal(before.orders_at, before.synced_at);
  const ok200 = fakeShop({ sqlRows });
  const broken = async (url, init) => (JSON.parse(init.body).query.includes('orders(') ? new Response('', { status: 503 }) : ok200(url, init));
  await assert.rejects(syncShopDaily({ DB }, { shop: SHOP, act_id: ACT }, { token: 'tok', F: broken, wait, now, days: 3 }), /503/);
  const after = db.prepare(`SELECT synced_at, orders_at, orders FROM p_shop_daily WHERE day = '2026-11-19'`).get();
  assert.ok(after.synced_at > before.synced_at);                       // money re-read after the day ended
  assert.equal(after.orders_at, before.orders_at);                     // the counts are still the mid-day ones
  assert.equal(after.orders, 1);
});

/* ---- Orders-only money: ShopifyQL refused (read_reports + protected customer data Level 2) ---- */
const DENIED = 'Access denied for shopifyqlQuery field. Required access: `read_reports` access scope. Also: Level 2 access to Customer data including name, address, phone, and email fields.';
const money = (createdAt, o = {}) => order(createdAt, o.total ?? 108, {
  subtotalPriceSet: { shopMoney: { amount: String(o.subtotal ?? 90) } }, totalDiscountsSet: { shopMoney: { amount: String(o.disc ?? 10) } },
  totalShippingPriceSet: { shopMoney: { amount: String(o.ship ?? 10) } }, totalTaxSet: { shopMoney: { amount: String(o.tax ?? 8) } },
  currentTotalTaxSet: { shopMoney: { amount: String(o.curTax ?? o.tax ?? 8) } }, totalRefundedSet: { shopMoney: { amount: String(o.refunded ?? 0) } },
  taxesIncluded: false, ...(o.extra || {}) });
/** A Shopify that refuses fields: ShopifyQL (always), and optionally customerJourneySummary or the whole orders list. */
function deniedShop({ orders = [], denyJourney = false, denyOrders = false, sqlOk = false, sqlRows = [] } = {}) {
  const base = fakeShop({ orders, sqlRows });
  const calls = [];
  const deny = field => new Response(JSON.stringify({ errors: [{ message: `Access denied for ${field} field.`, extensions: { code: 'ACCESS_DENIED' } }] }));
  const F = async (url, init) => {
    const { query } = JSON.parse(init.body); calls.push(query);
    if (query.includes('shopifyqlQuery') && !sqlOk) return new Response(JSON.stringify({ errors: [{ message: DENIED, extensions: { code: 'ACCESS_DENIED' } }] }));
    if (query.includes('orders(') && denyOrders) return deny('orders');
    if (query.includes('orders(') && denyJourney && query.includes('customerJourneySummary')) return deny('customerJourneySummary');
    return base(url, init);
  };
  F.calls = calls; return F;
}
const shopRow = db => db.prepare(`SELECT orders_error, orders_denied_at, orders_sync_at, orders_wide_at FROM p_shopify WHERE shop = ?`).get(SHOP);
const asked = (F, what) => F.calls.filter(q => q.includes(what)).length;

await ok('one order to money: total sales is price minus every refund, tax after returns, pending in, cancelled and voided out', async () => {
  const m = orderMoney(money('2026-11-19T15:00:00Z', { refunded: 20, curTax: 6 }));
  assert.deepEqual(m, { total_sales: 88, taxes: 6, shipping: 10, discounts: -10, refunds: 20, gross_sales: 100 });
  assert.equal(orderMoney(money('2026-11-19T15:00:00Z', { extra: { displayFinancialStatus: 'PENDING' } })).total_sales, 108);
  assert.equal(orderMoney(money('2026-11-19T15:00:00Z', { extra: { cancelledAt: '2026-11-19T16:00:00Z' } })), null);
  assert.equal(orderMoney(money('2026-11-19T15:00:00Z', { extra: { displayFinancialStatus: 'VOIDED' } })), null);
  assert.equal(orderMoney(money('2026-11-19T15:00:00Z', { extra: { test: true } })), null);
  /* Prices that include tax: the tax comes out of gross. */
  assert.equal(orderMoney(money('2026-11-19T15:00:00Z', { extra: { taxesIncluded: true } })).gross_sales, 92);
  const q = ordersQuery({ money: true });
  for (const f of ['totalRefundedSet', 'currentTotalTaxSet', 'totalShippingPriceSet', 'totalDiscountsSet', 'subtotalPriceSet', 'customerJourneySummary']) assert.ok(q.includes(f), f);
  /* No protected customer fields are ever asked for. */
  for (const f of ['email', 'phone', 'customer {', 'Address', 'displayName', 'firstName']) assert.ok(!q.includes(f), f);
  assert.ok(!ordersQuery().includes('totalRefundedSet'));
});

await ok('ShopifyQL refused: money and orders come from the orders list, marked orders, noted once, and the switch covers the days', async () => {
  const { db, DB } = makeDb(); put(db);
  const F = deniedShop({ orders: [
    money('2026-11-19T15:00:00Z', { refunded: 20, curTax: 6 }),                          // paid, partly refunded
    money('2026-11-19T16:00:00Z', { total: 50, subtotal: 50, disc: 0, ship: 0, tax: 0, extra: { displayFinancialStatus: 'PENDING' } }),
    money('2026-11-19T17:00:00Z', { total: 0, subtotal: 0, disc: 0, ship: 0, tax: 0 }), // creator sample
    money('2026-11-19T18:00:00Z', { extra: { cancelledAt: '2026-11-19T19:00:00Z' } }),
    money('2026-11-19T19:00:00Z', { extra: { test: true } }),
  ] });
  const r = await syncShopDaily({ DB }, { shop: SHOP, act_id: ACT, scopes: 'read_orders' }, { token: 'tok', F, wait, now, days: 3 });
  assert.equal(r.money_source, 'orders'); assert.equal(r.access, ACCESS_REPORTS); assert.equal(r.money_days, 3);
  const d19 = rows(db).find(x => x.day === '2026-11-19');
  assert.equal(d19.total_sales, 138); assert.equal(d19.taxes, 6); assert.equal(d19.sales, 132);
  assert.equal(d19.refunds, 20); assert.equal(d19.returns, -20); assert.equal(d19.shipping, 10); assert.equal(d19.gross_sales, 150);
  assert.equal(d19.orders, 1); assert.equal(d19.zero_orders, 1); assert.equal(d19.orders_all, 3); assert.equal(d19.new_orders, 1);
  assert.equal(d19.orders_source, 'orders'); assert.equal(d19.money_source, 'orders');
  const d18 = rows(db).find(x => x.day === '2026-11-18');
  assert.equal(d18.sales, 0); assert.equal(d18.orders, 0);                                // a day with no orders is a real zero
  assert.equal(dayComplete(d19, '2026-11-19', 'America/Chicago'), true);                   // synced after the day ended
  const s = shopRow(db);
  assert.equal(s.orders_error, ACCESS_REPORTS); assert.ok(s.orders_denied_at); assert.equal(s.orders_sync_at, s.orders_denied_at);
});

await ok('a 90-day backfill without ShopifyQL fills only the last 59 days; older days stay empty', async () => {
  const { db, DB } = makeDb(); put(db);
  const F = deniedShop({ orders: [money('2026-09-01T15:00:00Z'), money('2026-10-01T15:00:00Z')] });
  const r = await syncShopDaily({ DB }, { shop: SHOP, act_id: ACT, scopes: 'read_orders' }, { token: 'tok', F, wait, now, days: 90 });
  assert.equal(r.orders_from, '2026-09-23');
  const d = rows(db);
  assert.equal(d[0].day, '2026-09-23'); assert.equal(d.length, 59);
  assert.equal(d.find(x => x.day === '2026-10-01').sales, 100);
});

await ok('inside 6 hours ShopifyQL is not asked again; after that it is, and once it answers the note clears', async () => {
  const { db, DB } = makeDb(); put(db);
  const orders = [money('2026-11-19T15:00:00Z')];
  const F1 = deniedShop({ orders });
  await syncShopDaily({ DB }, { shop: SHOP, act_id: ACT }, { token: 'tok', F: F1, wait, now, days: 3 });
  assert.equal(asked(F1, 'shopifyqlQuery'), 1);
  const row = () => ({ shop: SHOP, act_id: ACT, ...db.prepare(`SELECT orders_denied_at, orders_error FROM p_shopify WHERE shop = ?`).get(SHOP) });
  const F2 = deniedShop({ orders });
  const r2 = await syncShopDaily({ DB }, row(), { token: 'tok', F: F2, wait, now: () => NOW + 3600000, days: 3 });
  assert.equal(asked(F2, 'shopifyqlQuery'), 0); assert.equal(r2.money_source, 'orders');
  assert.equal(shopRow(db).orders_error, ACCESS_REPORTS);                               // still says why
  /* Seven hours later the access has arrived: ShopifyQL is asked and answers. */
  const F3 = deniedShop({ orders, sqlOk: true, sqlRows: [{ day: '2026-11-19', orders: '1', total_sales: '108', taxes: '8', returns: '0' }] });
  const r3 = await syncShopDaily({ DB }, row(), { token: 'tok', F: F3, wait, now: () => NOW + 7 * 3600000, days: 3 });
  assert.equal(asked(F3, 'shopifyqlQuery'), 1); assert.equal(r3.money_source, 'shopifyql');
  assert.equal(shopRow(db).orders_error, null); assert.equal(shopRow(db).orders_denied_at, null);
  assert.equal(rows(db).find(x => x.day === '2026-11-19').money_source, 'shopifyql');
});

await ok('the brand setting orders skips ShopifyQL entirely and leaves no error', async () => {
  const { db, DB } = makeDb(); put(db);
  db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, 'orders')`).run(shopMoneyKey(ACT));
  const F = deniedShop({ orders: [money('2026-11-19T15:00:00Z')] });
  const r = await syncShopDaily({ DB }, { shop: SHOP, act_id: ACT }, { token: 'tok', F, wait, now, days: 3 });
  assert.equal(asked(F, 'shopifyqlQuery'), 0); assert.equal(r.money_source, 'orders'); assert.equal(r.access, undefined);
  assert.equal(shopRow(db).orders_error, null);
});

await ok('a store that refuses customerJourneySummary still syncs; new vs returning stay empty and the switch leaves them missing', async () => {
  const { db, DB } = makeDb(); put(db);
  const F = deniedShop({ orders: [money('2026-11-19T15:00:00Z')], denyJourney: true });
  const r = await syncShopDaily({ DB }, { shop: SHOP, act_id: ACT }, { token: 'tok', F, wait, now, days: 3 });
  assert.ok(r.new_vs_returning);
  const d19 = rows(db).find(x => x.day === '2026-11-19');
  assert.equal(d19.orders, 1); assert.equal(d19.new_orders, null); assert.equal(d19.returning_orders, null); assert.equal(d19.sales, 100);
  const piv = overlayShopify({ newCustomersOrders: { '2026-11-19': 7 } }, [d19], '2026-11-19', '2026-11-19');
  assert.equal(piv.totalOrders['2026-11-19'], 1); assert.equal(piv.newCustomersOrders['2026-11-19'], undefined);
});

await ok('a store that refuses the orders list too: plain error, and the hourly tick leaves it for 6 hours', async () => {
  const { db, DB } = makeDb(); put(db);
  const F = deniedShop({ denyOrders: true });
  await assert.rejects(syncShopDaily({ DB: makeDb().DB }, { shop: SHOP, act_id: ACT }, { token: 'tok', F, wait, now, days: 3 }), new RegExp(ACCESS_ORDERS));
  let t = NOW, tries = 0;
  const FF = async (url, init) => { tries++; return F(url, init); };
  const first = await shopDailyTick({ DB }, { F: FF, now: () => t, tokenFor: async () => 'tok' });
  assert.equal(first.stores[0].error, ACCESS_ORDERS);
  assert.equal(shopRow(db).orders_error, ACCESS_ORDERS); assert.ok(isAccessNote(shopRow(db).orders_error));
  for (const h of [1, 2, 5]) {                                                           // hours 1 to 5: not touched
    t = NOW + h * 3600000; const before = tries;
    assert.equal((await shopDailyTick({ DB }, { F: FF, now: () => t, tokenFor: async () => 'tok' })).skipped, 'every store is fresh');
    assert.equal(tries, before);
  }
  t = NOW + 6 * 3600000 + 60000;                                                          // past 6 hours: tried again
  const later = await shopDailyTick({ DB }, { F: FF, now: () => t, tokenFor: async () => 'tok' });
  assert.equal(later.stores[0].shop, SHOP);
});

await ok('the hourly tick keeps a ShopifyQL-refused store syncing from orders, without asking ShopifyQL, 14 days once a day', async () => {
  const { db, DB } = makeDb(); put(db);
  const orders = [money('2026-11-10T15:00:00Z'), money('2026-11-19T15:00:00Z')];
  let t = NOW; const F = deniedShop({ orders });
  const one = await shopDailyTick({ DB }, { F, now: () => t, tokenFor: async () => 'tok' });
  assert.equal(one.stores[0].money_source, 'orders'); assert.equal(one.stores[0].access, ACCESS_REPORTS);
  assert.equal(one.stores[0].money_days, 3);                                             // first pass: no denial on record yet
  t += 3600000;
  const two = await shopDailyTick({ DB }, { F, now: () => t, tokenFor: async () => 'tok' });
  assert.equal(two.stores[0].money_days, 14);                                            // the daily wide read
  assert.ok(rows(db).find(x => x.day === '2026-11-10'));
  assert.equal(asked(F, 'shopifyqlQuery'), 1);                                           // asked once, then held
  t += 3600000;
  const three = await shopDailyTick({ DB }, { F, now: () => t, tokenFor: async () => 'tok' });
  assert.equal(three.stores[0].money_days, 3);                                           // wide read done for today
  assert.equal(asked(F, 'shopifyqlQuery'), 1);
});

/* ---- Review fixes: query cost, tips, the seam, the hold label, the wide read cut short ---- */
/** Shopify's requested cost of an orders query string: 2 + first x (1 + 2 per money set + 1 for the journey). */
const costOf = q => {
  const first = Number((q.match(/orders\(first: (\d+)/) || [])[1]);
  const sets = (q.match(/shopMoney \{ amount \}/g) || []).length, journey = q.includes('customerJourneySummary') ? 1 : 0;
  return { first, cost: 2 + first * (1 + 2 * sets + journey) };
};

await ok('every orders query stays under Shopify\'s 1,000-point limit, with the page size the cost allows', async () => {
  for (const money of [true, false]) for (const journey of [true, false]) {
    const { first, cost } = costOf(ordersQuery({ money, journey }));
    assert.equal(first, money ? PAGE_MONEY : PAGE_COUNTS);
    assert.ok(cost <= MAX_QUERY_COST, `money ${money} journey ${journey}: ${cost}`);
    assert.equal(cost, ordersQueryCost({ money, journey }));
  }
  assert.ok(PAGE_MONEY <= 50 && PAGE_COUNTS <= 200);
  assert.ok(ordersQuery({ money: true }).includes('totalTipReceivedSet'));
});

await ok('a tip is not a sale: it comes out of total sales', async () => {
  const m = orderMoney(money('2026-11-19T15:00:00Z', { total: 113, extra: { totalTipReceivedSet: { shopMoney: { amount: '5' } } } }));
  assert.equal(m.total_sales, 108); assert.equal(m.taxes, 8);
});

await ok('the seam: the first ShopifyQL answer re-reads every orders-money day, so no refund is booked twice', async () => {
  const { db, DB } = makeDb(); put(db);
  /* Orders-only for 20 days, one order on Nov 5 refunded later (booked on Nov 5 by orders). */
  await syncShopDaily({ DB }, { shop: SHOP, act_id: ACT, scopes: 'read_orders' }, { token: 'tok',
    F: deniedShop({ orders: [money('2026-11-05T15:00:00Z', { refunded: 30 })] }), wait, now, days: 20 });
  assert.equal(rows(db).find(x => x.day === '2026-11-05').money_source, 'orders');
  /* Access arrives: a 3-day run asks ShopifyQL back to Nov 1, and days it sends no row for are zero under its name. */
  const seen = [];
  const base = deniedShop({ orders: [money('2026-11-05T15:00:00Z', { refunded: 30 })], sqlOk: true,
    sqlRows: [{ day: '2026-11-12', orders: '1', total_sales: '78', taxes: '8', returns: '-30' }] });
  const F = async (url, init) => { const b = JSON.parse(init.body); if (b.query.includes('shopifyqlQuery')) seen.push(b.variables.q); return base(url, init); };
  const r = await syncShopDaily({ DB }, { shop: SHOP, act_id: ACT, scopes: 'read_orders' }, { token: 'tok', F, wait, now, days: 3 });
  assert.equal(r.money_source, 'shopifyql'); assert.equal(r.seam_from, '2026-11-01');
  assert.match(seen[0], /SINCE -20d UNTIL today/);
  const d = rows(db);
  assert.equal(d.filter(x => x.money_source === 'orders').length, 0);
  assert.equal(d.find(x => x.day === '2026-11-05').sales, 0);
  assert.equal(d.find(x => x.day === '2026-11-12').refunds, 30);
  assert.equal(d.find(x => x.day === '2026-11-05').orders, 1);                            // the counts stay
  /* The next run is back to 3 days: nothing left to re-read. */
  const r2 = await syncShopDaily({ DB }, { shop: SHOP, act_id: ACT }, { token: 'tok', F: deniedShop({ sqlOk: true }), wait, now, days: 3 });
  assert.equal(r2.seam_from, undefined);
});

await ok('a store held for refusing the orders list was never refused ShopifyQL: the next run asks it', async () => {
  const { db, DB } = makeDb(); put(db);
  await noteSyncError({ DB }, SHOP, ACCESS_ORDERS, NOW);
  const s = db.prepare(`SELECT orders_denied_at, orders_error FROM p_shopify WHERE shop = ?`).get(SHOP);
  const F = deniedShop({ orders: [money('2026-11-19T15:00:00Z')], sqlOk: true, sqlRows: [{ day: '2026-11-19', orders: '1', total_sales: '108', taxes: '8', returns: '0' }] });
  const r = await syncShopDaily({ DB }, { shop: SHOP, act_id: ACT, ...s }, { token: 'tok', F, wait, now: () => NOW + 3600000, days: 3 });
  assert.equal(asked(F, 'shopifyqlQuery'), 1); assert.equal(r.money_source, 'shopifyql');
  assert.equal(shopRow(db).orders_error, null);                                          // never says read_reports
});

await ok('a wide read cut short by the page cap is not stamped done, and the money path gets more pages', async () => {
  const { db, DB } = makeDb(); put(db);
  await ensureShopDaily({ DB });
  db.prepare(`UPDATE p_shopify SET orders_error = ?, orders_denied_at = ?, orders_sync_at = ? WHERE shop = ?`).run(ACCESS_REPORTS, '2026-11-20 16:00:00', '2026-11-20 16:00:00', SHOP);
  const orders = Array.from({ length: 30 }, (_, i) => money(`2026-11-${String(7 + Math.floor(i / 3)).padStart(2, '0')}T15:00:00Z`));
  /* A budget for 12 calls: the tick picks 8 pages (the largest step it can afford); the fake serves 1 order a page. */
  const F1 = fakeShop({ orders, per: 1 });
  const out = await shopDailyTick({ DB }, { F: F1, now, tokenFor: async () => 'tok', canAfford: n => n <= 12 });
  assert.equal(out.stores[0].money_source, 'orders'); assert.ok(out.stores[0].resume_from);
  assert.equal(F1.calls.filter(c => c.query.includes('orders(')).length, 8);
  assert.equal(shopRow(db).orders_wide_at, null);
  /* With room for 80 pages the read finishes and the wide read is stamped. */
  const t = NOW + 3600000;
  const done = await shopDailyTick({ DB }, { F: fakeShop({ orders, per: 1 }), now: () => t, tokenFor: async () => 'tok' });
  assert.equal(done.stores[0].resume_from, undefined); assert.ok(shopRow(db).orders_wide_at);
});

console.log(`\n${n} passed`);
