/* The store source switch (2026-11-26): store numbers from Shopify (p_shop_daily) when its days cover the window,
   else the tracker exactly as before. The old profit worker and the engine are asked the same question over the
   same made up database and must answer the same, for Shopify covered, partly covered, and each forced setting. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import oldProfit from '../../../../profit/worker/src/worker.js';
import * as oldSwitch from '../../../../profit/worker/src/storesource.js';
import * as newSwitch from '../../src/metrics/storesource.js';
import { makeEnv, asCaller, call, NORTH, RIVER } from '../../src/platform/testkit/index.mjs';
import { differences } from '../../src/platform/compare.js';
import { addDays } from '../../src/platform/time.js';
import { forgetStale } from '../../src/metrics/service.js';
import { storeData, setGoals, today, TZ } from './fixture.mjs';

const OLD_KEY = 'old-engine-test-key';
const t = today();
const stampNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/* One Shopify day: money, paid orders and a $0 sample order the paid count leaves out. `i` is how many days ago. */
function shopDay(act, i, over = {}) {
  const orders = 10 + (i % 7), sales = 1000 + i * 3;
  return { act_id: act, day: addDays(t, -i), shop: 'north-kites.example', gross_sales: sales + 150, discounts: -100, returns: -20,
    net_sales: sales - 60, shipping: 60, taxes: 40, total_sales: sales + 40, sales, refunds: 20, orders_all: orders + 1,
    orders, zero_orders: 1, new_orders: 4, returning_orders: orders - 4, paid_sales: sales + 40, orders_source: 'orders',
    currency: 'USD', synced_at: stampNow(), orders_at: stampNow(), ...over };
}
const shopRows = (act, days, skip = new Set()) => Array.from({ length: days }, (_, k) => k + 1).filter(i => !skip.has(i)).map(i => shopDay(act, i));

function envWith({ shop = [], settings = [] } = {}) {
  const data = storeData();
  data.p_shop_daily = shop;
  data.settings = [...(data.settings || []), ...settings];
  const env = makeEnv({ groups: ['metrics'], rows: data });
  setGoals(env);
  forgetStale();
  return env;
}

async function askOld(env, path) {
  const res = await oldProfit.fetch(new Request(`https://old.test${path}`, { headers: { Authorization: `Bearer ${OLD_KEY}` } }),
    { DB: env.DB, ADMIN_TOKEN: OLD_KEY }, { waitUntil() {} });
  return { status: res.status, json: await res.json() };
}

async function same(env, path) {
  forgetStale();
  const now = await call(env, 'GET', `/pw${path}`, { token: asCaller('owner') });
  assert.equal(now.engine, 'new', `the engine did not answer ${path} itself`);
  const old = await askOld(env, path.startsWith('/api/overview') ? `${path}${path.includes('?') ? '&' : '?'}fresh=1` : path);
  assert.equal(now.status, old.status, `status of ${path}`);
  const diff = differences(old.json, now.json);
  assert.deepEqual(diff.slice(0, 12), [], `${path}: ${diff.length} differences`);
  return now.json;
}

const PATHS = ['/api/overview?days=30', `/api/client?act=${NORTH}&days=30`, `/api/forecast?act=${NORTH}`, `/api/plan?act=${NORTH}`];
const dataOf = j => j.data || j;

test('no Shopify rows: every answer keeps its numbers and says Triple Whale, not synced yet', async () => {
  const env = envWith();
  for (const p of PATHS) await same(env, p);
  const c = dataOf(await same(env, `/api/client?act=${NORTH}&days=30`));
  assert.equal(c.store_source, 'triple_whale');
  assert.equal(c.store_label, 'Store numbers: Triple Whale (Shopify not synced yet)');
});

test('Shopify covers the window: the store numbers are Shopify paid orders and total sales less tax, old and new agree', async () => {
  const env = envWith({ shop: shopRows(NORTH, 120) });
  for (const p of PATHS) await same(env, p);
  const c = dataOf(await same(env, `/api/client?act=${NORTH}&days=30`));
  assert.equal(c.store_source, 'shopify');
  assert.equal(c.store_label, 'Store numbers: Shopify');
  let sales = 0, orders = 0, fresh = 0;
  for (let i = 1; i <= 30; i++) { const r = shopDay(NORTH, i); sales += r.sales; orders += r.orders; fresh += r.new_orders; }
  assert.ok(Math.abs(c.totals.sales - sales) < 1e-6, `sales ${c.totals.sales} != ${sales}`);
  assert.equal(c.totals.orders, orders, 'paid orders only: the $0 sample orders are not counted');
  assert.equal(c.totals.new_orders, fresh);
  assert.ok(Math.abs(c.totals.aov - sales / orders) < 1e-9);
  const ov = await same(env, '/api/overview?days=30');
  assert.equal(ov.accounts.find(a => a.act_id === NORTH).store_source, 'shopify');
  assert.equal(ov.accounts.find(a => a.act_id === RIVER).store_source, 'triple_whale', 'a brand without Shopify rows is untouched');
});

test('a gap in the Shopify days: the whole window stays Triple Whale, old and new agree', async () => {
  const env = envWith({ shop: shopRows(NORTH, 120, new Set([9])) });
  const c = dataOf(await same(env, `/api/client?act=${NORTH}&days=30`));
  assert.equal(c.store_source, 'triple_whale');
  assert.equal(c.store_label, 'Store numbers: Triple Whale (Shopify not synced for every day yet)');
  const tw = dataOf(await same(envWith(), `/api/client?act=${NORTH}&days=30`));
  assert.deepEqual(c.totals, tw.totals, 'the numbers are exactly the tracker numbers');
  for (const p of PATHS) await same(env, p);
});

test('a day synced before it ended is not a whole day: Triple Whale', async () => {
  const shop = shopRows(NORTH, 40);
  shop[0].synced_at = `${addDays(t, -1)} 12:00:00`;
  const c = dataOf(await same(envWith({ shop }), `/api/client?act=${NORTH}&days=7`));
  assert.equal(c.store_source, 'triple_whale');
});

test('money re-read after the day ended but orders read mid-day: not a whole day, Triple Whale', async () => {
  const shop = shopRows(NORTH, 40);
  shop[0].orders_at = `${addDays(t, -1)} 12:00:00`;
  const c = dataOf(await same(envWith({ shop }), `/api/client?act=${NORTH}&days=7`));
  assert.equal(c.store_source, 'triple_whale');
});

test('forced settings: tw keeps the tracker, shopify reads Shopify even with a gap; old and new agree', async () => {
  const shop = shopRows(NORTH, 120, new Set([9]));
  const tw = envWith({ shop: shopRows(NORTH, 120), settings: [{ key: `storeSource:${NORTH}`, value: 'tw' }] });
  const a = dataOf(await same(tw, `/api/client?act=${NORTH}&days=30`));
  assert.equal(a.store_source, 'triple_whale');
  assert.equal(a.store_label, 'Store numbers: Triple Whale (set in brand settings)');
  for (const p of PATHS) await same(tw, p);
  const sh = envWith({ shop, settings: [{ key: `storeSource:${NORTH}`, value: 'shopify' }] });
  const b = dataOf(await same(sh, `/api/client?act=${NORTH}&days=30`));
  assert.equal(b.store_source, 'shopify');
  assert.ok(!b.rows.some(r => r.date === addDays(t, -9)), 'the day Shopify does not have is missing, never the tracker\'s');
  for (const p of PATHS) await same(sh, p);
});

test('the hub store read is sent to the old worker once a brand has Shopify rows', async () => {
  const env = makeEnv({ groups: ['metrics', 'store'], rows: { ...storeData(), p_shop_daily: shopRows(NORTH, 10) } });
  const r = await call(env, 'GET', `/pw/api/hub/store?act=${NORTH}&days=5`, { token: asCaller('owner') });
  assert.equal(r.engine, 'forward');
  const e = await call(env, 'GET', `/pw/api/hub/email?act=${NORTH}&days=5`, { token: asCaller('owner') });
  assert.equal(e.engine, 'forward', 'email share of store sales reads the store too');
  const c = await call(env, 'GET', `/pw/api/hub/store?act=${RIVER}&days=5`, { token: asCaller('owner') });
  assert.equal(c.engine, 'new', 'a brand with no Shopify rows is still answered here');
  assert.equal(c.json.brands[0].store_source, 'triple_whale');
});

test('paid all channels reads store sales: sent to the old worker once a brand has Shopify rows or a setting', async () => {
  const env = makeEnv({ groups: ['metrics', 'store', 'ads'], rows: { ...storeData(), p_shop_daily: shopRows(NORTH, 10) } });
  const r = await call(env, 'GET', `/pw/api/hub/paid?act=${NORTH}&platform=all&days=5`, { token: asCaller('owner') });
  assert.equal(r.engine, 'forward');
  const m = await call(env, 'GET', `/pw/api/hub/paid?act=${NORTH}&platform=meta&days=5`, { token: asCaller('owner') });
  assert.notEqual(m.engine, 'forward', 'Meta alone reads no store numbers');
  const c = await call(env, 'GET', `/pw/api/hub/paid?act=${RIVER}&platform=all&days=5`, { token: asCaller('owner') });
  assert.notEqual(c.engine, 'forward', 'a brand with no Shopify rows is still answered here');
  const set = makeEnv({ groups: ['metrics', 'store', 'ads'], rows: { ...storeData(), settings: [{ key: `storeSource:${RIVER}`, value: 'tw' }] } });
  const s2 = await call(set, 'GET', `/pw/api/hub/paid?act=${RIVER}&platform=all&days=5`, { token: asCaller('owner') });
  assert.equal(s2.engine, 'forward');
});

test('the switch rules are the same words and the same decisions in both copies', () => {
  for (const s of ['shopify', 'triple_whale']) for (const r of ['covered', 'set', 'partial', 'not_synced']) {
    assert.equal(newSwitch.storeLabel(s, r), oldSwitch.storeLabel(s, r));
  }
  assert.deepEqual(newSwitch.SHOP_METRICS, oldSwitch.SHOP_METRICS);
  for (const day of ['2026-03-07', '2026-03-08', '2026-11-01', '2026-11-26']) {
    assert.equal(newSwitch.dayEndStamp(day, TZ), oldSwitch.dayEndStamp(day, TZ));
  }
  assert.equal(oldSwitch.dayEndStamp('2026-11-26', 'America/Chicago'), '2026-11-27 06:00:00');
  assert.equal(oldSwitch.dayEndStamp('2026-07-04', 'America/Chicago'), '2026-07-05 05:00:00');
  const rows = shopRows(NORTH, 5);
  for (const [mode, from, to] of [['auto', addDays(t, -5), addDays(t, -1)], ['auto', addDays(t, -6), addDays(t, -1)], ['tw', addDays(t, -3), t], ['shopify', addDays(t, -9), t]]) {
    const o = oldSwitch.decideStore(mode, rows, from, to, { tz: TZ });
    const n = newSwitch.decideStore(mode, rows, from, to, { tz: TZ });
    assert.deepEqual(n, o, `${mode} ${from} ${to}`);
  }
});
