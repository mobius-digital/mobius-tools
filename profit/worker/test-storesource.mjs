/* Offline checks for the store source switch (src/storesource.js, 2026-11-26): store numbers come from Shopify
 * (p_shop_daily) when its days cover the window, else Triple Whale exactly as before; a gap falls back for the whole
 * window; the brand setting forces either; paid orders only; every payload carries the label. The engine copy and the
 * old worker are checked against each other in engine/worker/test/metrics/storesource.test.mjs.
 *   node test-storesource.mjs   (from profit/worker) */
import assert from 'node:assert/strict';
import { decideStore, overlayShopify, storeSwitch, storeSwitchMany, storeDaily, storeTag, dayEndStamp, shopCoverage, sourceOf, markSource } from './src/storesource.js';
import { ensureShopDaily } from './src/shopsync.js';
import { makeDb } from './test-d1.mjs';
import { dailyCard, sameDaily } from '../../account-health/worker/src/clientpost.js';

const ACT = 'brand_test', TZ = 'America/Chicago';
const NOW = Date.parse('2026-11-20T18:00:00Z');           // noon Nov 20 in Chicago
const day = i => { const d = new Date('2026-11-20T00:00:00Z'); d.setUTCDate(d.getUTCDate() - i); return d.toISOString().slice(0, 10); };
const SYNCED = '2026-11-20 17:00:00';
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log('PASS ', name); };

/* One Shopify day `i` days before Nov 20: paid orders 10, one $0 sample order, sales = total sales minus tax. */
const shop = (i, o = {}) => ({ act_id: ACT, day: day(i), shop: 'test-store.myshopify.com', gross_sales: 1200, discounts: -150, returns: -50,
  net_sales: 1000, shipping: 80, taxes: 60, total_sales: 1140, sales: 1080, refunds: 50, orders_all: 11, orders: 10, zero_orders: 1,
  new_orders: 4, returning_orders: 6, paid_sales: 1140, orders_source: 'orders', currency: 'USD', synced_at: SYNCED, orders_at: SYNCED, ...o });
const range = (a, b, skip = []) => { const out = []; for (let i = a; i <= b; i++) if (!skip.includes(i)) out.push(shop(i)); return out; };
/* A Triple Whale pivot with different numbers, so the source is visible. */
const twPiv = (from, to) => {
  const piv = { netSales: {}, totalNetTaxes: {}, totalOrders: {}, newCustomersOrders: {}, blendedAds: {}, newCustomerSales: {}, rcRevenue: {} };
  for (let d = from; d <= to; d = new Date(Date.parse(d + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10)) {
    piv.netSales[d] = 2000; piv.totalNetTaxes[d] = 100; piv.totalOrders[d] = 25; piv.newCustomersOrders[d] = 9; piv.blendedAds[d] = 500;
    piv.newCustomerSales[d] = 600; piv.rcRevenue[d] = 1400;
  }
  return piv;
};
const opts = { tz: TZ, now: NOW };

await ok('a day is whole only when it synced after it ended (the store\'s midnight, in UTC)', () => {
  assert.equal(dayEndStamp('2026-11-19', TZ), '2026-11-20 06:00:00');
  assert.equal(dayEndStamp('2026-07-04', TZ), '2026-07-05 05:00:00');
  assert.equal(dayEndStamp('2026-11-19', 'UTC'), '2026-11-20 00:00:00');
  const early = [shop(1, { synced_at: '2026-11-20 03:00:00', orders_at: '2026-11-20 03:00:00' })];   // 9pm Nov 19 in Chicago
  assert.equal(shopCoverage(early, day(1), day(1), opts).ok, false);
  assert.equal(shopCoverage([shop(1)], day(1), day(1), opts).ok, true);
  /* The money was re-read after the day ended but the orders pass failed: the counts are still the 9pm ones. */
  const halfOrders = [shop(1, { orders_at: '2026-11-20 03:00:00' })];
  assert.equal(shopCoverage(halfOrders, day(1), day(1), opts).ok, false);
  assert.equal(shopCoverage([shop(1, { orders_at: null })], day(1), day(1), opts).ok, false);
});

await ok('covered: Shopify; a gap: Triple Whale for the whole window; nothing: not synced yet', () => {
  const d1 = decideStore('auto', range(1, 30), day(30), day(1), opts);
  assert.equal(d1.source, 'shopify'); assert.equal(d1.label, 'Store numbers: Shopify');
  const d2 = decideStore('auto', range(1, 30, [7]), day(30), day(1), opts);
  assert.equal(d2.source, 'triple_whale'); assert.equal(d2.reason, 'partial'); assert.equal(d2.first_missing, day(7));
  assert.equal(d2.label, 'Store numbers: Triple Whale (Shopify not synced for every day yet)');
  const d3 = decideStore(undefined, [], day(30), day(1), opts);
  assert.equal(d3.source, 'triple_whale'); assert.equal(d3.label, 'Store numbers: Triple Whale (Shopify not synced yet)');
  /* Older days carry ShopifyQL money only (no paid order count): not covered. */
  const d4 = decideStore('auto', [...range(1, 29), shop(30, { orders_source: 'shopifyql', orders: null })], day(30), day(1), opts);
  assert.equal(d4.source, 'triple_whale');
  /* Today is optional; a window of today alone needs today's row. */
  assert.equal(decideStore('auto', range(1, 5), day(5), day(0), opts).source, 'shopify');
  assert.equal(decideStore('auto', range(1, 5), day(0), day(0), opts).source, 'triple_whale');
  assert.equal(decideStore('auto', range(0, 5), day(0), day(0), opts).source, 'shopify');
  /* A day ShopifyQL left out (no sales) but the orders list read as zero orders is a real $0 day. */
  const zero = shop(3, { sales: null, total_sales: null, taxes: null, orders: 0, new_orders: 0, returning_orders: 0, zero_orders: 0 });
  assert.equal(decideStore('auto', [...range(1, 2), zero, ...range(4, 5)], day(5), day(1), opts).source, 'shopify');
});

await ok('forced settings: tw is Triple Whale even when covered, shopify is Shopify even with a gap', () => {
  const a = decideStore('tw', range(1, 30), day(30), day(1), opts);
  assert.equal(a.source, 'triple_whale'); assert.equal(a.label, 'Store numbers: Triple Whale (set in brand settings)');
  const b = decideStore('shopify', range(1, 30, [7]), day(30), day(1), opts);
  assert.equal(b.source, 'shopify'); assert.equal(b.reason, 'set');
  assert.equal(decideStore('shopify', range(1, 30), day(30), day(1), opts).label, 'Store numbers: Shopify');
  assert.equal(decideStore('nonsense', range(1, 30), day(30), day(1), opts).mode, 'auto');
});

await ok('overlay: total sales minus tax, PAID orders only, new orders, refunds; a missing day reads as missing', () => {
  const piv = twPiv(day(3), day(1));
  overlayShopify(piv, [shop(1), shop(2, { orders_source: 'shopifyql', orders: null })], day(3), day(1));
  assert.equal(piv.netSales[day(1)] - piv.totalNetTaxes[day(1)], 1080, 'sales = Shopify total sales minus tax');
  assert.equal(piv.totalOrders[day(1)], 10, 'the $0 sample order is not an order');
  assert.equal(piv.newCustomersOrders[day(1)], 4);
  assert.equal(piv.totalRefunds[day(1)], 50);
  assert.equal(piv.totalSales[day(1)], 1190, 'order revenue = total sales before returns');
  assert.equal(piv.totalShippingPrice[day(1)], 80);
  assert.equal(piv.totalNewGrossSales[day(1)], 1200);
  assert.equal(piv.netSales[day(2)], 1140, 'a ShopifyQL day still carries the money');
  assert.ok(!(day(2) in piv.totalOrders), 'but no order count: never Triple Whale\'s');
  assert.ok(!(day(3) in piv.netSales) && !(day(3) in piv.totalOrders), 'a day Shopify does not have is missing');
  assert.equal(piv.blendedAds[day(1)], 500, 'ad spend stays Triple Whale\'s');
  assert.equal(piv.newCustomerSales[day(1)], 600, 'the new vs returning money split stays Triple Whale\'s');
});

await ok('the switch on a database: no table means Triple Whale and the pivot untouched, byte for byte', async () => {
  const { DB } = makeDb();
  const piv = twPiv(day(10), day(1)), before = JSON.stringify(piv);
  const d = await storeSwitch({ DB }, { act_id: ACT, tz: TZ }, piv, day(10), day(1), { now: NOW });
  assert.equal(JSON.stringify(piv), before);
  assert.deepEqual(storeTag(d), { store_source: 'triple_whale', store_label: 'Store numbers: Triple Whale (Shopify not synced yet)' });
  assert.deepEqual(storeTag(null), storeTag(d), 'a payload built without a decision says the same');
});

await ok('the switch on a database: rows that cover go in, the setting forces, the time zone is read when not given', async () => {
  const { db, DB } = makeDb();
  db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
  await ensureShopDaily({ DB });
  db.prepare(`INSERT INTO brand_accounts (act_id, name) VALUES (?, ?)`).run(ACT, 'Test');
  db.exec(`ALTER TABLE brand_accounts ADD COLUMN tz TEXT`);
  db.prepare(`UPDATE brand_accounts SET tz = ? WHERE act_id = ?`).run(TZ, ACT);
  const cols = Object.keys(shop(1));
  const ins = db.prepare(`INSERT INTO p_shop_daily (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
  for (const r of range(1, 12)) ins.run(...cols.map(c => r[c]));
  const piv = twPiv(day(10), day(1));
  const d = await storeSwitch({ DB }, ACT, piv, day(10), day(1), { now: NOW });
  assert.equal(d.source, 'shopify');
  assert.equal(piv.totalOrders[day(4)], 10);
  const many = { [ACT]: twPiv(day(10), day(1)), other: twPiv(day(10), day(1)) };
  const ds = await storeSwitchMany({ DB }, [ACT, 'other'], many, day(10), day(1), { now: NOW });
  assert.equal(ds[ACT].source, 'shopify'); assert.equal(ds.other.source, 'triple_whale');
  assert.equal(many.other.totalOrders[day(4)], 25, 'the other brand is untouched');
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`).run(`storeSource:${ACT}`, 'tw');
  const piv2 = twPiv(day(10), day(1));
  assert.equal((await storeSwitch({ DB }, { act_id: ACT, tz: TZ }, piv2, day(10), day(1), { now: NOW })).source, 'triple_whale');
  assert.equal(piv2.totalOrders[day(4)], 25);
  assert.equal(sourceOf(markSource(piv2, d)), d);
  assert.ok(!Object.keys(piv2).includes('store'), 'the source rides beside the pivot, never as a key in it');
});

await ok('storeDaily: daily totals from the source it picks, with the label', async () => {
  const { db, DB } = makeDb();
  db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
  db.exec(`CREATE TABLE tw_daily (act_id TEXT, date TEXT, metric TEXT, value REAL, PRIMARY KEY (act_id, date, metric))`);
  await ensureShopDaily({ DB });
  const tw = db.prepare(`INSERT INTO tw_daily VALUES (?, ?, ?, ?)`);
  for (let i = 1; i <= 3; i++) { tw.run(ACT, day(i), 'netSales', 2000); tw.run(ACT, day(i), 'totalNetTaxes', 100); tw.run(ACT, day(i), 'totalOrders', 25); }
  const a = await storeDaily({ DB }, { act_id: ACT, tz: TZ }, day(3), day(1), { now: NOW });
  assert.equal(a.store_source, 'triple_whale'); assert.equal(a.days.length, 3); assert.equal(a.days[0].sales, 1900); assert.equal(a.days[0].orders, 25);
  const cols = Object.keys(shop(1));
  const ins = db.prepare(`INSERT INTO p_shop_daily (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
  for (const r of range(1, 3)) ins.run(...cols.map(c => r[c]));
  const b = await storeDaily({ DB }, { act_id: ACT, tz: TZ }, day(3), day(1), { now: NOW });
  assert.equal(b.store_source, 'shopify'); assert.equal(b.store_label, 'Store numbers: Shopify');
  assert.deepEqual(b.days[0], { date: day(3), sales: 1080, total_sales: 1140, tax: 60, shipping: 80, refunds: 50, orders: 10, new_orders: 4 });
});

await ok('client daily: the gray line names only the store source, never our sync status; an edit check ignores that line', () => {
  const base = { brand: 'Test Brand', date: '2026-11-19', today: '2026-11-20', day: { sales: 1000, spend: 400, mer: 2.5 },
    month: { ym: '2026-11', sales: 19000, spend: 7000 }, at: new Date('2026-11-20T14:00:00Z'), now: new Date('2026-11-20T14:00:00Z') };
  const plain = dailyCard(base).plain;
  assert.match(plain, /_Triple Whale/, 'built without a source: as before');
  const sh = dailyCard({ ...base, store: 'shopify', store_label: 'Store numbers: Shopify' }).plain;
  assert.match(sh, /_Shopify/); assert.doesNotMatch(sh, /Store numbers/);
  const tw = dailyCard({ ...base, store: 'triple_whale', store_label: 'Store numbers: Triple Whale (Shopify not synced yet)' }).plain;
  assert.match(tw, /_Triple Whale/); assert.doesNotMatch(tw, /synced|Store numbers/);
  assert.equal(tw, plain, 'a brand still on Triple Whale reads exactly as before');
  assert.ok(sameDaily(plain, sh) && sameDaily(sh, tw), 'only the context line differs');
  assert.ok(!sameDaily(sh, sh.replace('$1,000', '$1,100')));
});

console.log(`\n${n} passed`);
