/* The ads group: access rules for every row, then each ported route against its sample, its numbers
   and a leak check for a client login. Offline: the fake database and the two fake old workers.
   Run: node --test "engine/worker/test/ads/*.test.mjs" */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, asCaller, call, sameShape, genAccessTests, assertNoLeak, NORTH, RIVER, RIVER_IDS } from '../../src/platform/testkit/index.mjs';
import { routes } from '../../src/ads/routes.js';
import { seedRows, WINDOW, TO } from './seed.mjs';

const OPTS = { groups: ['ads'] };
const env = (more = {}) => makeEnv({ ...OPTS, rows: seedRows(), ...more });
const sample = name => JSON.parse(readFileSync(new URL(`../../src/ads/samples/${name}.json`, import.meta.url), 'utf8'));
const get = (e, path, kind = 'owner') => call(e, 'GET', path, { token: asCaller(kind) });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);

genAccessTests(routes, OPTS);

const SHAPES = [
  ['hub-paid-meta', `/pw/api/hub/paid?platform=meta&act=${NORTH}&${WINDOW}`],
  ['hub-paid-meta-all-brands', `/pw/api/hub/paid?platform=meta&${WINDOW}`],
  ['hub-paid-all', `/pw/api/hub/paid?platform=all&act=${NORTH}&${WINDOW}`],
  ['hub-paid-google', `/pw/api/hub/paid?platform=google&act=${NORTH}&${WINDOW}`],
  ['hub-creative', `/pw/api/hub/creative?act=${NORTH}&${WINDOW}`],
  ['activities', '/ah/api/activities?act=all&from=2026-01-01&to=2026-01-31T23:59:59&limit=2000'],
  ['ad-updates', `/ah/api/ad-updates?act=${NORTH}&from=2026-01-01&to=2026-01-31`],
  ['launch-list', `/ah/api/launch/list?act=${NORTH}`],
];
for (const [name, path] of SHAPES) {
  test(`${path.split('?')[0]} (${name}): answers from the database in the old shape`, async () => {
    const r = await get(env(), path);
    assert.equal(r.status, 200);
    assert.equal(r.engine, 'new');
    assert.deepEqual(sameShape(sample(name), r.json), []);
  });
}

const LEAKS = [`/pw/api/hub/paid?platform=meta&${WINDOW}`, `/pw/api/hub/paid?platform=all&${WINDOW}`, `/pw/api/hub/paid?platform=tiktok&${WINDOW}`,
  `/pw/api/hub/creative?${WINDOW}`, '/ah/api/activities?from=2026-01-01', '/ah/api/ad-updates?from=2026-01-01', '/ah/api/launch/list'];
for (const path of LEAKS) {
  test(`${path.split('&')[0]}: a client never reads the other brand`, async () => {
    await assertNoLeak(env(), 'GET', path);
  });
}

test('hub/paid meta: totals, credited sales and the lead split come out of the formulas', async () => {
  const b = (await get(env(), `/pw/api/hub/paid?platform=meta&act=${NORTH}&${WINDOW}`)).json.brands[0];
  assert.equal(b.cur.spend, 225);
  assert.equal(b.cur.revenue, 450);               // the tracker's credit, not the platform's 390
  assert.equal(b.cur.platform_revenue, 390);
  assert.equal(b.cur.lead_spend, 30);
  near(b.cur.roas, 450 / 195);                    // over the sales spend, lead campaigns left out
  near(b.cur.cpa, 195 / 12);
  near(b.cur.cpl, 30 / 60);
  assert.deepEqual(b.goals, { metric: 'roas', cpa: 30, roas: 2.2, ncpa: null, cpl: 0.75, cpl_lo: 0.5, cpl_auto: true });
  assert.equal(b.campaigns[0].id, 'c1');
  assert.deepEqual(b.campaigns[0].prev, { spend: 60, purchases: 2, cpa: 30 });
  assert.equal(b.campaigns[0].adsets[0].ads.length, 2);
  assert.equal(b.changes.length, 3);
});

test('hub/paid meta under the platform model uses the platform count', async () => {
  const r = await get(env(), `/pw/api/hub/paid?platform=meta&model=platform&act=${NORTH}&${WINDOW}`);
  assert.equal(r.json.model_label, 'Platform reported');
  assert.equal(r.json.brands[0].cur.revenue, 390);
  assert.equal(r.json.brands[0].cur.purchases, 12);
});

test('hub/paid: today with no credit yet is pending, never a false 0', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const rows = seedRows();
  rows.daily_insights = [{ act_id: 'act_111', date: today, spend: 75, impressions: 7000, reach: 4000, clicks: 200, link_clicks: 150, purchases: 5, revenue: 260 }];
  for (const path of [`/pw/api/hub/paid?platform=meta&act=${NORTH}&from=${today}&to=${today}`, `/pw/api/hub/paid?platform=meta&from=${today}&to=${today}`]) {
    const r = await get(makeEnv({ ...OPTS, rows }), path);
    const cur = r.json.brands.find(b => b.act_id === NORTH).cur;
    assert.equal(r.engine, 'new');
    assert.equal(cur.spend, 75);
    assert.equal(cur.attr_pending, true);
    assert.equal(cur.revenue, null);
    assert.equal(cur.roas, null);
  }
});

test('hub/paid: every brand for the owner, only their own for a limited teammate, 404 for a brand that is not active', async () => {
  const all = await get(env(), `/pw/api/hub/paid?platform=meta&${WINDOW}`);
  assert.deepEqual(all.json.brands.map(b => b.act_id).sort(), [NORTH, RIVER]);
  const mine = await get(env(), `/pw/api/hub/paid?platform=all&${WINDOW}`, 'limited');
  assert.deepEqual(mine.json.brands.map(b => b.act_id), [NORTH]);
  for (const id of RIVER_IDS) assert.ok(!mine.text.includes(id));
  const rows = seedRows();
  rows.brands[0].status = 'paused';
  const gone = await get(makeEnv({ ...OPTS, rows }), `/pw/api/hub/paid?act=${NORTH}&${WINDOW}`);
  assert.equal(gone.status, 404);
  assert.deepEqual(gone.json, { error: 'unknown account' });
});

test('hub/paid all channels: one row per channel and the rest', async () => {
  const b = (await get(env(), `/pw/api/hub/paid?platform=all&act=${NORTH}&${WINDOW}`)).json.brands[0];
  assert.deepEqual(b.rows.map(r => r.id), ['meta', 'google', 'tiktok', 'amazon', 'email', 'rest']);
  assert.equal(b.revenue, 3 * (900 - 60));
  assert.equal(b.blended_spend, 630);
  assert.equal(b.rows.find(r => r.id === 'google').revenue, 270);
  assert.equal(b.rows.find(r => r.id === 'meta').nc, 1);
  assert.equal(b.paid.spend, 225 + 150 + 120);
  assert.equal(b.series.length, 7);
});

test('hub/creative: ad set first, customer value, look alikes and the rollups', async () => {
  const r = (await get(env(), `/pw/api/hub/creative?act=${NORTH}&${WINDOW}`)).json;
  assert.equal(r.window.to, TO);
  const ad = r.ads[0];
  assert.equal(ad.id, '1001');
  assert.equal(ad.angle, 'Lightness');
  assert.equal(ad.fc_rev, 600);
  assert.equal(ad.lc_rev, 360);
  assert.equal(ad.set_rank, 1);
  near(ad.set_share, 120 / 195);
  assert.deepEqual([ad.ltv_n, ad.ltv_first, ad.ltv90], [1, 50, 80]);
  assert.equal(ad.twin_kind, 'alike');
  assert.equal(r.alike.length, 1);
  assert.equal(r.by_angle[0].key, 'Lightness');
  assert.equal(r.by_type.some(x => x.key === 'video'), false);   // the lead ad stays out of the sales rollups
  assert.equal(r.weeks.length, 12);
  assert.equal(r.fatigue.reduce((s, f) => s + f.spend, 0), 195);
});

test('activities: one brand, every brand, the limit, and a limited teammate', async () => {
  const one = await get(env(), `/ah/api/activities?act=${NORTH}`);
  assert.deepEqual(one.json.rows.map(x => x.id), ['ev3', 'ev2', 'ev1']);
  assert.equal(one.json.rows[0].act_id, NORTH);
  assert.equal(one.json.rows[0].meta_act, 'act_111');
  const all = await get(env(), '/ah/api/activities?act=all&limit=2');
  assert.equal(all.json.rows.length, 2);
  const mine = await get(env(), '/ah/api/activities?act=all', 'limited');
  assert.deepEqual([...new Set(mine.json.rows.map(x => x.act_id))], [NORTH]);
});

test('ad-updates: only changes with a client reason, joined to the write behind them', async () => {
  const r = await get(env(), `/ah/api/ad-updates?act=${NORTH}&from=2026-01-01&to=2026-01-31`, 'client');
  assert.deepEqual(r.json.changes.map(c => c.id), ['ev3', 'ev1']);
  assert.deepEqual(r.json.changes[1].before, { daily_budget: 80 });
  assert.equal(r.json.changes[0].platform, 'google');
  assert.deepEqual(r.json.changes[0].after, { budget: 50 });
  assert.equal(r.json.act, NORTH);
  const none = await get(env(), '/ah/api/ad-updates?act=all');
  assert.equal(none.status, 400);
  assert.deepEqual(none.json, { error: 'Pick one brand.' });
});

test('ad-updates: a change undone in the app is left out', async () => {
  const rows = seedRows();
  rows.p_meta_write[0].undone = '2026-01-06T16:00:00Z';
  const r = await get(makeEnv({ ...OPTS, rows }), `/ah/api/ad-updates?act=${NORTH}&from=2026-01-01&to=2026-01-31`);
  assert.deepEqual(r.json.changes.map(c => c.id), ['ev3']);
});

test('launch/list: read here, forwarded for a refresh or when a learning waits to be filed', async () => {
  const all = await get(env(), '/ah/api/launch/list');
  assert.equal(all.engine, 'new');
  assert.deepEqual(all.json.launches.map(l => l.id).sort(), ['l1', 'l9']);
  const mine = await get(env(), '/ah/api/launch/list', 'limited');
  assert.deepEqual(mine.json.launches.map(l => l.id), ['l1']);
  const fresh = await get(env(), `/ah/api/launch/list?act=${NORTH}&refresh=1`);
  assert.equal(fresh.engine, 'forward');
  const rows = seedRows();
  rows.p_launch[0].filed_at = null;
  const e = makeEnv({ ...OPTS, rows });
  const waiting = await get(e, `/ah/api/launch/list?act=${NORTH}`);
  assert.equal(waiting.engine, 'forward');
  assert.equal(e.DB.rows('p_launch', `id = 'l1'`)[0].filed_at, null);   // the engine itself wrote nothing
});

test('no ported ads route writes to the database', async () => {
  const e = env();
  for (const [, path] of SHAPES) await get(e, path);
  assert.equal(e.DB.log.filter(sql => /^\s*(insert|update|delete|replace)\b/i.test(sql)).length, 0);
});
