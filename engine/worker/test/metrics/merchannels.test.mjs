/* Sales that count toward MER (2026-11-27): MER and aMER count only the brand's MER channels, store sales stay
   whole. The pure copy must decide what profit's merchannels.js decides; a series with left-out channel sales has
   lower MER and the same sales; the engine and the old profit worker answer the same over the same made up rows;
   reads the engine does not count channels for are sent to the old worker. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import oldProfit from '../../../../profit/worker/src/worker.js';
import * as oldMer from '../../../../profit/worker/src/merchannels.js';
import * as mc from '../../src/metrics/merchannels.js';
import { buildSeries } from '../../src/metrics/series.js';
import { totals } from '../../src/metrics/money.js';
import { applyAdSpend } from '../../src/metrics/expenses.js';
import { makeEnv, asCaller, call, NORTH, RIVER } from '../../src/platform/testkit/index.mjs';
import { differences } from '../../src/platform/compare.js';
import { addDays } from '../../src/platform/time.js';
import { forgetStale } from '../../src/metrics/service.js';
import { storeData, setGoals, today } from './fixture.mjs';

const OLD_KEY = 'old-engine-test-key';
const t = today();

/* ---------- the pure copy ---------- */

test('the copy decides every channel the way profit does', () => {
  const keys = ['web', '580111', '3890849', 'tiktok', 'amazon', 'ebay', '420755537921', 'whatnot', 'faire', 'pos', 'b2b',
    'subscription_contract', 'shopify_draft_order', 'unknown', '999999', 'some_new_app', 'tag:wholesale'];
  for (const k of keys) assert.deepEqual(mc.describe(k), oldMer.describe(k), k);
  assert.deepEqual(mc.KINDS, oldMer.KINDS);
  for (const [s, tag] of [['WEB', ''], ['Amazon', null], ['', ''], ['web', 'Wholesale!']]) assert.equal(mc.channelKey(s, tag), oldMer.channelKey(s, tag));
  const cfg = mc.merConfig('{"counts":{"amazon":true,"web":false,"x":"no"},"tags":["VIP","vip",""]}');
  assert.deepEqual(cfg, oldMer.merConfig('{"counts":{"amazon":true,"web":false,"x":"no"},"tags":["VIP","vip",""]}'));
  assert.deepEqual(cfg, { counts: { amazon: true, web: false }, tags: ['vip'] });
  assert.deepEqual(mc.merConfig('not json'), { counts: {}, tags: ['wholesale'] });
});

test('default rule: the brand\'s own website only; TikTok Shop, Shop app, Amazon, Whatnot and wholesale do not; a brand tick wins', () => {
  const cfg = mc.merConfig(null);
  assert.equal(mc.counts('web', cfg), true);
  assert.equal(mc.counts('tiktok', cfg), false);
  assert.equal(mc.counts('3890849', cfg), false);
  assert.equal(mc.counts('some_new_app', cfg), false, 'an unknown source is left out until someone ticks it');
  assert.equal(mc.counts('amazon', cfg), false);
  assert.equal(mc.counts('whatnot', cfg), false);
  assert.equal(mc.counts('tag:wholesale', cfg), false);
  const own = mc.merConfig({ counts: { amazon: true, web: false } });
  assert.equal(mc.counts('amazon', own), true);
  assert.equal(mc.counts('web', own), false);
});

test('left-out sales per day, the pivot, and the counted sales of a row', () => {
  const rows = [
    { day: '2026-11-01', channel: 'web', sales: 500, orders: 5 },
    { day: '2026-11-01', channel: 'amazon', sales: 200, orders: 4 },
    { day: '2026-11-01', channel: 'whatnot', sales: 50, orders: 1 },
    { day: '2026-11-02', channel: 'amazon', sales: 80, orders: 2 },
    { day: '2026-11-03', channel: 'web', sales: 300, orders: 3 },
  ];
  const cfg = mc.merConfig(null);
  assert.deepEqual(mc.excludedByDay(rows, cfg), { '2026-11-01': { sales: 250, orders: 5 }, '2026-11-02': { sales: 80, orders: 2 } });
  assert.deepEqual(mc.excludedByDay(rows, cfg), oldMer.excludedByDay(rows, cfg));
  const piv = mc.applyMerChannels({}, rows, cfg, '2026-11-02', '2026-11-03');
  assert.deepEqual(piv.merExcluded, { '2026-11-02': 80 }, 'only days inside the window, only days with left-out sales');
  assert.equal(mc.applyMerChannels(null, rows, cfg, 'a', 'z'), null);
  assert.equal(mc.merSalesFor(1000, 250), 750);
  assert.equal(mc.merSalesFor(100, 250), 0, 'never below 0');
  assert.equal(mc.merSalesFor(null, 5), null);
  assert.equal(mc.merSalesOf({ sales: 10, mer_sales: 7 }), 7);
  assert.equal(mc.merSalesOf({ sales: 10 }), 10);
  assert.equal(mc.countedShare(rows, cfg), oldMer.countedShare(rows, cfg));
  assert.equal(mc.countedShare([], cfg), 1);
  const sum = mc.channelSummary(rows, cfg);
  assert.deepEqual(sum, oldMer.channelSummary(rows, cfg));
  assert.deepEqual(sum.map(c => c.key), ['web', 'amazon', 'whatnot']);
  const row = mc.merRow({ sales: 1000, new_rev: 400, spend: 250 }, 200);
  assert.equal(row.mer_sales, 800);
  assert.equal(row.mer_new_rev, 320);
  assert.equal(row.mer, 3.2);
});

/* ---------- the series ---------- */

function rawFor(mer) {
  const piv = {};
  for (let i = 1; i <= 3; i++) {
    const d = `2026-11-0${i}`;
    for (const [m, v] of Object.entries({ netSales: 1100, totalNetTaxes: 100, blendedAds: 250, newCustomerSales: 600, rcRevenue: 400, totalOrders: 10 })) {
      ((piv[m] ??= {})[d] = v);
    }
  }
  return { piv: { [NORTH]: piv }, meta: {}, rules: {}, exp: {}, attr: {}, shop: { rows: {}, modes: {}, mer, now: Date.parse('2026-11-05T12:00:00Z') } };
}
const acct = { act_id: NORTH, tz: 'UTC', goals_json: '{}' };

test('a series with left-out channel sales: MER and aMER drop, sales, orders and profit do not', () => {
  const plain = buildSeries(rawFor({ rows: {}, cfg: {} }), acct, '2026-11-01', '2026-11-03');
  const cut = buildSeries(rawFor({ rows: { [NORTH]: [
    { day: '2026-11-01', channel: 'web', sales: 750, orders: 8 },
    { day: '2026-11-01', channel: 'amazon', sales: 250, orders: 2 },
    { day: '2026-11-02', channel: 'whatnot', sales: 500, orders: 1 },
  ] }, cfg: {} }), acct, '2026-11-01', '2026-11-03');
  const [a, b] = [totals(plain.rows), totals(cut.rows)];
  assert.equal(b.sales, a.sales, 'store sales stay whole');
  assert.equal(b.orders, a.orders);
  assert.equal(b.cm, a.cm);
  assert.equal(a.mer, 3000 / 750);
  assert.equal(b.mer_sales, 3000 - 750);
  assert.equal(b.mer, 2250 / 750);
  assert.ok(b.amer < a.amer);
  assert.equal(b.mer_new_rev, a.new_rev * (2250 / 3000), 'each day takes the same cut of new customer sales');
  assert.equal(cut.rows[0].mer_sales, 750);
  assert.equal(cut.rows[2].mer_sales, 1000, 'a day without channel rows counts whole');
  assert.equal(plain.rows[0].mer_sales, 1000);
  /* A brand that ticks Amazon back in counts it again. */
  const ticked = buildSeries(rawFor({ rows: { [NORTH]: [{ day: '2026-11-01', channel: 'amazon', sales: 250, orders: 2 }] },
    cfg: { [NORTH]: mc.merConfig({ counts: { amazon: true } }) } }), acct, '2026-11-01', '2026-11-03');
  assert.equal(totals(ticked.rows).mer, a.mer);
});

test('extra costs counted as ad spend: MER stays on counted sales', () => {
  const rows = [{ date: '2026-11-01', sales: 1000, mer_sales: 800, new_rev: 500, mer_new_rev: 400, spend: 200, gross_profit: 600 }];
  applyAdSpend(rows, { '2026-11-01': 200 });
  assert.equal(rows[0].mer, 2);
  assert.equal(rows[0].amer, 1);
  const whole = [{ date: '2026-11-01', sales: 1000, new_rev: 500, spend: 200, gross_profit: 600 }];
  applyAdSpend(whole, { '2026-11-01': 200 });
  assert.equal(whole[0].mer, 2.5, 'a row without counted sales counts whole');
});

/* ---------- the engine against the old worker ---------- */

/* Amazon and Whatnot orders on most days of the last 120, plus storefront rows. */
function channelRows(act) {
  const out = [];
  for (let i = 1; i <= 120; i++) {
    const day = addDays(t, -i);
    out.push({ act_id: act, day, channel: 'web', sales: 700 + i, orders: 7 });
    if (i % 3) out.push({ act_id: act, day, channel: 'amazon', sales: 150 + (i % 5) * 10, orders: 3 });
    if (i % 4 === 0) out.push({ act_id: act, day, channel: '420755537921', sales: 90, orders: 1 });
  }
  return out;
}

function envWith({ channels = [], settings = [], groups = ['metrics'] } = {}) {
  const data = storeData();
  data.p_sales_channel = channels;
  data.settings = [...(data.settings || []), ...settings];
  const env = makeEnv({ groups, rows: data });
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

test('Amazon and Whatnot left out: the engine and the old worker agree, MER drops, sales do not', async () => {
  const before = dataOf(await same(envWith(), `/api/client?act=${NORTH}&days=30`));
  const env = envWith({ channels: channelRows(NORTH) });
  const after = dataOf(await same(env, `/api/client?act=${NORTH}&days=30`));
  assert.equal(after.totals.sales, before.totals.sales, 'store sales stay whole');
  assert.ok(after.totals.mer < before.totals.mer, `MER drops: ${after.totals.mer} against ${before.totals.mer}`);
  assert.ok(after.totals.mer_sales < after.totals.sales);
  for (const p of PATHS) await same(env, p);
});

test('a brand that ticks Amazon in: the engine and the old worker agree on the setting', async () => {
  const env = envWith({ channels: channelRows(NORTH), settings: [{ key: `merChannels:${NORTH}`, value: JSON.stringify({ counts: { amazon: true } }) }] });
  for (const p of PATHS) await same(env, p);
});

test('customers and all channels show MER: sent to the old worker once a brand has channel rows or a setting', async () => {
  const env = envWith({ channels: channelRows(NORTH), groups: ['metrics', 'store', 'ads'] });
  const c = await call(env, 'GET', `/pw/api/customers?act=${NORTH}`, { token: asCaller('owner') });
  assert.equal(c.engine, 'forward');
  const p = await call(env, 'GET', `/pw/api/hub/paid?act=${NORTH}&platform=all&days=5`, { token: asCaller('owner') });
  assert.equal(p.engine, 'forward');
  const m = await call(env, 'GET', `/pw/api/hub/paid?act=${NORTH}&platform=meta&days=5`, { token: asCaller('owner') });
  assert.notEqual(m.engine, 'forward', 'Meta alone shows no MER');
  const r = await call(env, 'GET', `/pw/api/hub/paid?act=${RIVER}&platform=all&days=5`, { token: asCaller('owner') });
  assert.notEqual(r.engine, 'forward', 'a brand with no channel rows is still answered here');
  const set = envWith({ settings: [{ key: `merChannels:${RIVER}`, value: '{"counts":{"amazon":true}}' }], groups: ['metrics', 'store', 'ads'] });
  const s = await call(set, 'GET', `/pw/api/hub/paid?act=${RIVER}&platform=all&days=5`, { token: asCaller('owner') });
  assert.equal(s.engine, 'forward');
});
