/* The metrics group: who may read what, the shape of every ported answer, what a client login can never
   see, when a request is sent to the old engine, and the ad series figures. All offline, made up brands. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, asCaller, call, sameShape, genAccessTests, assertNoLeak, NORTH, RIVER, RIVER_IDS, NORTH_AD_ACCOUNT }
  from '../../src/platform/testkit/index.mjs';
import { addDays } from '../../src/platform/time.js';
import { routes } from '../../src/metrics/routes.js';
import { forgetStale } from '../../src/metrics/service.js';
import { dayEconomics, totals } from '../../src/metrics/money.js';
import { checkIsStale } from '../../src/metrics/health.js';
import { liveReplaces, wholeDays } from '../../src/metrics/series.js';
import { storeData, setGoals, today, NORTH_SECOND_AD_ACCOUNT } from './fixture.mjs';

const sample = name => JSON.parse(readFileSync(new URL(`../../src/metrics/samples/${name}.json`, import.meta.url), 'utf8'));
const t = today();
const DATA = storeData();

function freshEnv(change) {
  const rows = change ? change(structuredClone(DATA)) : DATA;
  const env = makeEnv({ groups: ['metrics'], rows });
  setGoals(env);
  forgetStale();
  return env;
}
const oldCalls = env => env.calls.filter(c => c.path !== '/api/me');
const get = (env, path, kind = 'owner', opts) => call(env, 'GET', path, { token: asCaller(kind, opts) });

/* Every row: nobody 401, a client naming the other brand 403, a limited teammate, the forwards. */
genAccessTests(routes, { groups: ['metrics'] });

const PORTED = {
  overview: '/pw/api/overview?days=30',
  client: `/pw/api/client?act=${NORTH}&days=30`,
  forecast: `/pw/api/forecast?act=${NORTH}`,
  plan: `/pw/api/plan?act=${NORTH}`,
  series: `/ah/api/series?act=${NORTH}&days=30`,
};
for (const [name, path] of Object.entries(PORTED)) {
  test(`${name}: the answer has the old shape`, async () => {
    const env = freshEnv();
    const r = await get(env, path);
    assert.equal(r.status, 200);
    assert.equal(r.engine, 'new');
    assert.deepEqual(sameShape(r.json, sample(name)), []);
    assert.equal(oldCalls(env).length, 0, 'the old engine was asked');
    assert.ok(env.logs.at(-1).db <= 15, `too many statements: ${env.logs.at(-1).db}`);
  });
}

/* What only the team or only the other brand may see. None of it may reach a client of North Kites. */
const NEVER = [...RIVER_IDS, 'River Tea', 'River secret cost', 'river plan note', 'river budget change', 'omnisend',
  'C0NORTH0001', 'C0NORTH0002', 'C0RIVER0001', 'report_config', 'slack_channel', 'brief_channel', 'agreed_by', 'team only'];
const noLeak = text => { for (const word of NEVER) assert.ok(!text.includes(word), `a client's answer holds ${word}`); };

for (const [name, path] of Object.entries(PORTED)) {
  test(`${name}: a client reads its own brand and nothing of the other`, async () => {
    const bare = path.replace(/[?&]act=[^&]*/, '').replace(/\/([a-z]+)&/, '/$1?');
    const { mine, none } = await assertNoLeak(freshEnv(), 'GET', bare);
    assert.equal(mine.status, 200);
    assert.equal(mine.engine, 'new');
    noLeak(mine.text);
    noLeak(none.text);
    if (name !== 'overview') assert.equal(none.status, 403, 'a client must name its brand here');
  });
}

test('overview: a client gets its own brand only, marked as a client answer', async () => {
  const r = await get(freshEnv(), '/pw/api/overview?days=14', 'client');
  assert.deepEqual(r.json.accounts.map(a => a.act_id), [NORTH]);
  assert.equal(r.json.kind, 'client');
  assert.ok(r.json.accounts[0].window.sales > 0);
});

test('overview: a teammate limited to one brand gets that brand, and cannot name the other', async () => {
  const env = freshEnv();
  const r = await get(env, '/pw/api/overview?days=14', 'limited');
  assert.deepEqual(r.json.accounts.map(a => a.act_id), [NORTH]);
  assert.equal(r.json.kind, 'admin');
  for (const id of RIVER_IDS) assert.ok(!r.text.includes(id));
  assert.equal((await get(env, `/pw/api/overview?act=${RIVER}`, 'limited')).status, 403);
  assert.equal((await get(env, `/pw/api/overview?act=${RIVER}`, 'client')).status, 403);
});

test('overview: a named brand does not narrow the answer (the old route ignored it)', async () => {
  const r = await get(freshEnv(), `/pw/api/overview?act=${NORTH}&days=7`);
  assert.deepEqual(r.json.accounts.map(a => a.act_id).sort(), [NORTH, RIVER]);
  assert.ok(r.json.accounts.every(a => a.window.sales > 0));
});

test('overview: the longest window with a compare period stays inside the statement budget', async () => {
  const env = freshEnv();
  for (const path of ['/pw/api/overview?days=180&cmp=prev', '/pw/api/overview?days=180&cmp=yoy']) {
    const r = await get(env, path);
    assert.equal(r.status, 200);
    assert.equal(r.engine, 'new');
    assert.ok(env.logs.at(-1).db <= 30, `statements: ${env.logs.at(-1).db}`);
  }
});

test('a view only teammate may read', async () => {
  const r = await get(freshEnv(), `/pw/api/client?act=${NORTH}&days=7`, 'viewer');
  assert.equal(r.status, 200);
  assert.equal(r.json.rows.length, 7);
});

test('liveReplaces: the live row takes the stored row\'s place for its day, never sits beside it', () => {
  const rows = [{ date: '2026-03-09', sales: 1 }, { date: '2026-03-10', sales: 2 }];
  liveReplaces(rows, { date: '2026-03-10', sales: 9 });
  assert.deepEqual(rows, [{ date: '2026-03-09', sales: 1 }, { date: '2026-03-10', sales: 9 }]);
  liveReplaces(rows, { date: '2026-03-11', sales: 4 });
  assert.deepEqual(rows.map(r => r.date), ['2026-03-09', '2026-03-10', '2026-03-11']);
  assert.deepEqual(wholeDays(rows, '2026-03-11').map(r => r.date), ['2026-03-09', '2026-03-10']);
});

const SENT_ON = [
  ['overview, a window that ends today', `/pw/api/overview?from=${addDays(t, -6)}&to=${t}`],
  ['client, a window that ends today', `/pw/api/client?act=${NORTH}&from=${addDays(t, -6)}&to=${t}`],
  ['client, a single day', `/pw/api/client?act=${NORTH}&from=${addDays(t, -3)}&to=${addDays(t, -3)}`],
  ['forecast, a month that is not a month', `/pw/api/forecast?act=${NORTH}&month=soon`],
  ['plan, a month that is not a month', `/pw/api/plan?act=${NORTH}&month=2026-13`],
];
for (const [what, path] of SENT_ON) {
  test(`sent to the old engine as the same person: ${what}`, async () => {
    const env = freshEnv();
    const token = asCaller('owner');
    const r = await call(env, 'GET', path, { token });
    assert.equal(r.engine, 'forward');
    const sent = oldCalls(env).pop();
    assert.equal(`/${sent.worker}${sent.path}${sent.search}`, path);
    assert.equal(sent.token, token);
    assert.ok(env.logs.at(-1).forwarded.length > 10, 'the log line says why');
  });
}

test('overview: an old cost check sends one request to the old engine, then the engine answers itself', async () => {
  const env = freshEnv(d => { d.p_cost_health = d.p_cost_health.filter(r => r.act_id !== NORTH); return d; });
  const first = await get(env, '/pw/api/overview?days=7');
  assert.equal(first.engine, 'forward');
  const second = await get(env, '/pw/api/overview?days=7');
  assert.equal(second.engine, 'new');
  const north = second.json.accounts.find(a => a.act_id === NORTH);
  assert.ok(['good', 'noisy', 'broken', 'none'].includes(north.cost_health.verdict), 'judged on the spot');
  assert.equal(checkIsStale([{ act_id: 'b' }], { b: { checked_at: '2020-01-01 00:00:00' } }, Date.now()), true);
});

test('series: two ad accounts fold into one row a day, purchases and revenue are the tracker\'s', async () => {
  const r = await get(freshEnv(), `/ah/api/series?act=${NORTH}&days=10`);
  const rows = r.json.rows;
  assert.equal(rows.length, 10);
  assert.ok(rows.every(x => x.act_id === NORTH));
  assert.equal(new Set(rows.map(x => x.date)).size, 10);
  const main = DATA.daily_insights.find(x => x.act_id === NORTH_AD_ACCOUNT && x.date === addDays(t, -1));
  const second = DATA.daily_insights.find(x => x.act_id === NORTH_SECOND_AD_ACCOUNT && x.date === addDays(t, -1));
  const day1 = rows.find(x => x.date === addDays(t, -1));
  assert.ok(Math.abs(day1.spend - (main.spend + second.spend)) < 1e-9);
  assert.equal(day1.meta_purchases, main.purchases + second.purchases);
  const credited = DATA.tw_ad_attr.find(x => x.act_id === NORTH && x.date === addDays(t, -1) && x.platform === 'meta' && x.model === 'lastPlatformClick');
  assert.equal(day1.revenue, credited.revenue);
  assert.equal(day1.purchases, credited.orders);
  const unsynced = rows.find(x => x.date === addDays(t, -2));
  assert.equal(unsynced.purchases, null, 'a day the tracker has not synced is not zero');
  assert.equal(unsynced.revenue, null);
  assert.ok(unsynced.meta_revenue > 0);
  assert.deepEqual(r.json.events.map(e => e.id), ['a1']);
  assert.equal(r.json.account.today, t);
  assert.equal(r.json.attribution, 'triple_whale:lastPlatformClick');
});

test('series: an old row with no platform counts only when its ad is one of the brand\'s own', async () => {
  const r = await get(freshEnv(), `/ah/api/series?act=${NORTH}&days=200`);
  const date = addDays(t, -160);
  const own = DATA.tw_ad_attr.find(x => x.act_id === NORTH && x.date === date && x.ad_id === `${NORTH_AD_ACCOUNT}_ad1` && x.model === 'lastPlatformClick');
  assert.equal(own.platform, null);
  assert.equal(r.json.rows.find(x => x.date === date).revenue, own.revenue);
});

test('series and the brand reads: an unknown brand, or none, is the old 404', async () => {
  const env = freshEnv();
  for (const path of ['/ah/api/series?act=brand_nobody', '/ah/api/series', '/pw/api/client', '/pw/api/forecast?act=brand_nobody', '/pw/api/plan']) {
    const r = await get(env, path);
    assert.equal(r.status, 404, path);
    assert.deepEqual(r.json, { error: 'unknown account' });
  }
});

test('the money model: no sales figure is no row, and a total nobody knows is null, never 0', () => {
  assert.equal(dayEconomics({ totalOrders: { '2026-01-02': 3 } }, {}, '2026-01-02', null, []), null);
  const row = dayEconomics({ netSales: { '2026-01-02': 110 }, totalNetTaxes: { '2026-01-02': 10 } }, {}, '2026-01-02', null, []);
  assert.equal(row.sales, 100);
  assert.equal(row.spend, null);
  assert.equal(row.mer, null);
  assert.equal(row.gross_profit, null);
  const sum = totals([row]);
  assert.equal(sum.sales, 100);
  assert.equal(sum.spend, null);
  assert.equal(sum.cm, null);
  assert.equal(sum.aov, null);
  assert.equal(totals([]).sales, null);
});
