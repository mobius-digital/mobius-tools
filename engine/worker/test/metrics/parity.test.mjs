/* Proof on made up data: the old profit worker and the new engine are asked the same question over the
   same database, and the answers must match to the last figure. The old worker file is imported and run
   as it is. It is never changed. (The old account-health worker cannot be loaded in Node, so the ad
   series has its own checks in metrics.test.mjs.) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import oldProfit from '../../../../profit/worker/src/worker.js';
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
const GOAL_CASES = [
  ['default only', { default: { sales: 40000, spend: 9000 } }, true],
  ['no own key, a previous month and default', { [prevYm]: { sales: 30000 }, default: { sales: 40000, spend: 9000 } }, true],
  ['own key and default', { [ym]: { sales: 52000 }, default: { sales: 40000 } }, true],
  ['an empty own key and default', { default: { sales: 40000 }, [ym]: {} }, true],
  ['a spend only own key and default', { default: { sales: 40000 }, [ym]: { spend: 11000 } }, true],
  ['a margin only own key and default', { default: { sales: 40000 }, [ym]: { cm_pct: 0.5 } }, true],
  ['a spend only own key, a spend only default', { default: { spend: 11000 }, [ym]: { spend: 11000 } }, false],
  ['previous month only', { [prevYm]: { sales: 30000, spend: 9000 } }, false],
  ['a margin only own key, previous month, no default', { [prevYm]: { sales: 30000 }, [ym]: { cm_pct: 0.5 } }, false],
  ['a sales goal of its own', { [ym]: { sales: 52000, spend: 11000 } }, true],
  ['a sales goal of 0', { [ym]: { sales: 0 } }, true],
];
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
