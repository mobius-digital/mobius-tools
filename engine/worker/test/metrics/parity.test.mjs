/* Proof on made up data: the old profit worker and the new engine are asked the same question over the
   same database, and the answers must match to the last figure. The old worker file is imported and run
   as it is. It is never changed. (The old account-health worker cannot be loaded in Node, so the ad
   series has its own checks in metrics.test.mjs.) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import oldProfit, { DEFAULT_LAST_MONTH as OLD_DEFAULT_LAST_MONTH, monthPlanned as oldMonthPlanned } from '../../../../profit/worker/src/worker.js';
import { DEFAULT_LAST_MONTH, monthPlanned, goalsFor } from '../../src/metrics/series.js';
import { makeEnv, asCaller, call, NORTH, RIVER } from '../../src/platform/testkit/index.mjs';
import { differences } from '../../src/platform/compare.js';
import { addDays, monthOf } from '../../src/platform/time.js';
import { forgetStale } from '../../src/metrics/service.js';
import { prevMonth } from '../../src/metrics/forecast.js';
import { storeData, setGoals, today } from './fixture.mjs';

const OLD_KEY = 'old-engine-test-key';

function freshEnv() {
  const env = makeEnv({ groups: ['metrics'], rows: storeData() });
  setGoals(env);
  forgetStale();
  return env;
}

/* The old profit worker, asked directly, over the same database. */
async function askOld(env, path) {
  const waits = [];
  const res = await oldProfit.fetch(new Request(`https://old.test${path}`, { headers: { Authorization: `Bearer ${OLD_KEY}` } }),
    { DB: env.DB, ADMIN_TOKEN: OLD_KEY }, { waitUntil: p => waits.push(p) });
  const json = await res.json();
  await Promise.allSettled(waits);
  return { status: res.status, json };
}

async function same(path, { oldPath = path } = {}) {
  const env = freshEnv();
  const now = await call(env, 'GET', `/pw${path}`, { token: asCaller('owner') });
  assert.equal(now.engine, 'new', `the engine did not answer ${path} itself`);
  const old = await askOld(env, oldPath);
  assert.equal(now.status, old.status, `status of ${path}`);
  const diff = differences(old.json, now.json);
  assert.deepEqual(diff.slice(0, 12), [], `${path}: ${diff.length} differences`);
  return { old: old.json, now: now.json, env };
}

const t = today();
const ym = monthOf(t);
const yday = addDays(t, -1);
const join = path => (path.includes('?') ? '&' : '?');
/* The old worker keeps an overview for 90 seconds. fresh=1 makes it read again for each test. */
const overviewPaths = [
  '/api/overview',
  '/api/overview?days=7',
  '/api/overview?days=7&cmp=none&series=0',
  '/api/overview?days=90&cmp=yoy',
  `/api/overview?from=${addDays(t, -45)}&to=${addDays(t, -10)}&cmp=prev`,
  `/api/overview?from=${addDays(t, -200)}&to=${addDays(t, -150)}&cmp=yoy`,
  `/api/overview?from=${addDays(t, -3)}&to=${addDays(t, -30)}`,
  '/api/overview?days=500&cmp=nonsense',
];
for (const path of overviewPaths) {
  test(`same answer as the old engine: ${path}`, async () => {
    const { now } = await same(path, { oldPath: `${path}${join(path)}fresh=1` });
    assert.equal(now.accounts.length, 2);
  });
}

const clientPaths = [
  `/api/client?act=${NORTH}`,
  `/api/client?act=${NORTH}&days=7`,
  `/api/client?act=${RIVER}&days=120`,
  `/api/client?act=${NORTH}&from=${ym}-01&to=${yday}`,
  `/api/client?act=${NORTH}&from=${addDays(t, -70)}&to=${addDays(t, -35)}`,
  `/api/client?act=act_111&days=14`,
  '/api/client?act=brand_nobody',
  '/api/client',
];
for (const path of clientPaths) {
  test(`same answer as the old engine: ${path}`, async () => {
    if (path.endsWith(`to=${yday}`) && yday < `${ym}-02`) return;   // on the 2nd the window is one day, which is sent on
    await same(path);
  });
}

const monthPaths = [
  `/api/forecast?act=${NORTH}`,
  `/api/forecast?act=${RIVER}`,
  `/api/forecast?act=${NORTH}&month=${prevMonth(ym)}`,
  `/api/forecast?act=${NORTH}&month=${prevMonth(prevMonth(prevMonth(ym)))}`,
  '/api/forecast?act=brand_nobody',
  `/api/plan?act=${NORTH}`,
  `/api/plan?act=${RIVER}`,
  `/api/plan?act=${NORTH}&month=${prevMonth(ym)}`,
  `/api/plan?act=${NORTH}&month=${monthOf(addDays(`${ym}-28`, 10))}`,
  `/api/plan?act=${RIVER}&month=${monthOf(addDays(`${ym}-28`, 45))}`,
  '/api/plan?act=brand_nobody',
];
for (const path of monthPaths) {
  test(`same answer as the old engine: ${path}`, () => same(path));
}

test('same answer as the old engine with no history at all: the forecast says so, the plan is empty', async () => {
  const env = makeEnv({ groups: ['metrics'] });
  forgetStale();
  for (const path of [`/api/forecast?act=${NORTH}`, `/api/plan?act=${NORTH}`, `/api/client?act=${NORTH}&days=10`]) {
    const now = await call(env, 'GET', `/pw${path}`, { token: asCaller('owner') });
    const old = await askOld(env, path);
    assert.equal(now.status, old.status, path);
    assert.deepEqual(differences(old.json, now.json), [], path);
  }
});

/* NO GOAL SET (2026-11-26): goals_planned on /api/client and /api/overview (with month), and planned on /api/plan,
   count a month as planned when its own key carries a sales goal, else when default does (a goal typed into default
   counts). Only falling back to a previous month's key is unplanned. Old and new answer the same for each case. */
const prevYm = (() => { const d = new Date(ym + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
/* Default covers a month only up to DEFAULT_LAST_MONTH (2026-11) and only while no later month has a key: every save
   writes default, so it cannot say which month it was typed for. The clock decides which answer a default case wants. */
const legacy = ym <= DEFAULT_LAST_MONTH;
const nextYm = (() => { const d = new Date(ym + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })();
const GOAL_CASES = [
  ['default only', { default: { sales: 40000, spend: 9000 } }, legacy],
  ['no own key, a previous month and default (the save shape)', { [prevYm]: { sales: 30000 }, default: { sales: 40000, spend: 9000 } }, legacy],
  ['no own key, a LATER month and default', { [nextYm]: { sales: 30000 }, default: { sales: 30000 } }, false],
  ['own key and default', { [ym]: { sales: 52000 }, default: { sales: 40000 } }, true],
  ['an empty own key and default', { default: { sales: 40000 }, [ym]: {} }, legacy],
  ['a spend only own key and default', { default: { sales: 40000 }, [ym]: { spend: 11000 } }, legacy],
  ['a margin only own key and default', { default: { sales: 40000 }, [ym]: { cm_pct: 0.5 } }, legacy],
  ['a spend only own key, a spend only default', { default: { spend: 11000 }, [ym]: { spend: 11000 } }, false],
  ['previous month only', { [prevYm]: { sales: 30000, spend: 9000 } }, false],
  ['a margin only own key, previous month, no default', { [prevYm]: { sales: 30000 }, [ym]: { cm_pct: 0.5 } }, false],
  ['a sales goal of its own', { [ym]: { sales: 52000, spend: 11000 } }, true],
  ['a sales goal of 0', { [ym]: { sales: 0 } }, true],
];
/* The rule on fixed months, whatever today is: the save shape plans no month after DEFAULT_LAST_MONTH, and the goal a
   covered month reads is default's, not the previous month's key. Same answer as the old worker. */
test('goal rule on fixed months: default covers up to November 2026 only, and its number is the goal', () => {
  assert.equal(DEFAULT_LAST_MONTH, OLD_DEFAULT_LAST_MONTH, 'one cut-off month in both');
  const saved = { default: { sales: 100 }, '2026-10': { sales: 90 } };
  for (const [m, want] of [['2026-09', false], ['2026-10', true], ['2026-11', true], ['2026-12', false], ['2027-03', false]]) {
    assert.equal(monthPlanned(saved, m), want, `${m} new`);
    assert.equal(oldMonthPlanned(saved, m), want, `${m} old`);
  }
  assert.equal(goalsFor({ goals_json: JSON.stringify(saved) }, '2026-11').sales, 100, 'November reads the default goal');
  assert.equal(goalsFor({ goals_json: JSON.stringify(saved) }, '2026-12').sales, 90, 'December still inherits (unplanned, shown as no goal)');
  assert.equal(monthPlanned({ default: { sales: 5 }, '2026-12': { sales: 5 } }, '2026-11'), false, 'a later key: November not planned by default');
});

for (const [label, goals, want] of GOAL_CASES) {
  test(`goals_planned and planned, old and new agree: ${label}`, async () => {
    const env = makeEnv({ groups: ['metrics'], rows: storeData() });
    setGoals(env);
    env.DB.raw.prepare('UPDATE brands SET goals_json = ? WHERE id = ?').run(JSON.stringify(goals), NORTH);
    for (const [path, read] of [
      [`/api/client?act=${NORTH}`, j => j.goals_planned],
      ['/api/overview', j => { const a = j.accounts.find(x => x.act_id === NORTH); assert.equal(a.month, ym); return a.goals_planned; }],
      [`/api/plan?act=${NORTH}`, j => j.planned],
    ]) {
      forgetStale();
      const now = await call(env, 'GET', `/pw${path}`, { token: asCaller('owner') });
      assert.equal(now.engine, 'new', path);
      const old = await askOld(env, path === '/api/overview' ? `${path}?fresh=1` : path);
      assert.deepEqual(differences(old.json, now.json).slice(0, 12), [], `${label}: ${path}`);
      assert.equal(read(now.json), want, `${label}: ${path} new`);
      assert.equal(read(old.json), want, `${label}: ${path} old`);
    }
  });
}

/* TODAY ONCE (2026-11-26). The hourly tracker sync can store a partial today in tw_daily. The old worker then built
   a row for today from it AND pushed the live row beside it: the day was listed twice and summed twice. Now the live
   row takes the stored row's place, the plan counts whole days only, and the engine (which sends a window ending
   today to the old worker) agrees with the old worker on every window it answers itself. */
const STORED_TODAY = { netSales: 3000, totalNetTaxes: 0, totalOrders: 30, blendedAds: 700 };
const LIVE_TODAY = { netSales: 5000, totalNetTaxes: 0, totalOrders: 50, blendedAds: 900 };
function envWithStoredToday() {
  const env = makeEnv({ groups: ['metrics'], rows: storeData() });
  setGoals(env);
  forgetStale();
  const put = env.DB.raw.prepare('INSERT INTO tw_daily (act_id, date, metric, value) VALUES (?, ?, ?, ?)');
  for (const [m, v] of Object.entries(STORED_TODAY)) put.run(NORTH, t, m, v);
  return env;
}
/* The old worker with a stand-in tracker that answers /api/tw-day with today's live numbers. */
async function askOldLive(env, path) {
  const AUTH = { fetch: async req => {
    const u = new URL(req.url);
    if (u.pathname !== '/api/tw-day') return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ date: u.searchParams.get('date'), as_of: new Date().toISOString(), map: LIVE_TODAY, hours: {} }),
      { headers: { 'Content-Type': 'application/json' } });
  } };
  const res = await oldProfit.fetch(new Request(`https://old.test${path}`, { headers: { Authorization: `Bearer ${OLD_KEY}` } }),
    { DB: env.DB, ADMIN_TOKEN: OLD_KEY, AUTH }, { waitUntil() {} });
  return { status: res.status, json: await res.json() };
}
const once = dates => assert.deepEqual(dates, [...new Set(dates)], `a date is listed twice: ${dates.join(', ')}`);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} != ${b}`);
/* The month's days before today that the tracker synced (the fixture skips the day 40 days back). */
const wholeMonthDays = () => { let n = 0; for (let d = `${ym}-01`; d < t; d = addDays(d, 1)) if (d !== addDays(t, -40)) n++; return n; };

test('today once: /api/client on a window ending today lists today once, the live row, and sums it once', async () => {
  const env = envWithStoredToday();
  const r = await askOldLive(env, `/api/client?act=${NORTH}&from=${addDays(t, -6)}&to=${t}`);
  assert.equal(r.status, 200);
  const dates = r.json.rows.map(x => x.date);
  once(dates);
  assert.equal(dates.length, 7);
  assert.equal(r.json.rows.at(-1).date, t);
  near(r.json.rows.at(-1).sales, LIVE_TODAY.netSales, 'today is the live row, not the stored partial');
  assert.ok(r.json.live_as_of, 'the live read happened');
  near(r.json.totals.sales, r.json.rows.reduce((s, x) => s + x.sales, 0), 'totals sum each day once');
  assert.equal(r.json.totals.days, 7);
  assert.equal(r.json.mtd.days, wholeMonthDays() + 1, 'month to date counts today once');
  if (r.json.plan) assert.equal(r.json.plan.days, wholeMonthDays(), 'the plan counts whole days only');
});

test('today once: /api/overview on a window ending today has one point for today and window totals that add up', async () => {
  const env = envWithStoredToday();
  const r = await askOldLive(env, `/api/overview?from=${addDays(t, -6)}&to=${t}&cmp=none&fresh=1`);
  assert.equal(r.status, 200);
  const north = r.json.accounts.find(a => a.act_id === NORTH);
  once(north.series.map(x => x.date));
  near(north.series.at(-1).sales, LIVE_TODAY.netSales, 'today is the live row');
  near(north.window.sales, north.series.reduce((s, x) => s + x.sales, 0), 'window totals sum each day once');
  assert.equal(north.mtd.days, wholeMonthDays() + 1, 'month to date counts today once');
  if (north.plan) assert.equal(north.plan.days, wholeMonthDays(), 'the plan counts whole days only');
});

test('today once: with a stored partial today, the engine and the old worker agree on a window ending yesterday', async () => {
  const env = envWithStoredToday();
  const path = `/api/client?act=${NORTH}&days=30`;
  const now = await call(env, 'GET', `/pw${path}`, { token: asCaller('owner') });
  assert.equal(now.engine, 'new');
  const old = await askOld(env, path);
  assert.deepEqual(differences(old.json, now.json).slice(0, 12), []);
  once(now.json.rows.map(x => x.date));
  assert.ok(now.json.rows.every(x => x.date < t), 'a window ending yesterday never carries today');
});

test('today once: a window ending today is sent to the old worker (which lists today once, above)', async () => {
  const env = envWithStoredToday();
  const r = await call(env, 'GET', `/pw/api/client?act=${NORTH}&from=${addDays(t, -6)}&to=${t}`, { token: asCaller('owner') });
  assert.equal(r.engine, 'forward');
});
