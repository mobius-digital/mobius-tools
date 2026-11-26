/* The one ported write of the brands group: PUT /ah/api/accounts/:id saves goals and budgets on one
   brand row. Everything else that route can do is sent on to the old engine before any row changes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, asCaller, call, NORTH, RIVER } from '../../src/platform/testkit/index.mjs';
import { seedRows, setGoals } from './seed.mjs';

function world() {
  const env = makeEnv({ groups: ['brands'], rows: seedRows() });
  setGoals(env);
  return env;
}
const brandRow = (env, id) => env.DB.rows('brands', `id = '${id}'`)[0];
const oldCalls = env => env.calls.filter(c => c.path !== '/api/me');
const put = (env, id, body, kind = 'team') => call(env, 'PUT', `/ah/api/accounts/${id}`, { token: asCaller(kind), body });

test('PUT /ah/api/accounts/:id: the goal lands on the brand row and nothing else changes', async () => {
  const env = world();
  const before = brandRow(env, NORTH), other = brandRow(env, RIVER);
  const r = await put(env, NORTH, { target_roas: 3.2 });
  assert.equal(r.status, 200);
  assert.equal(r.engine, 'new');
  assert.equal(r.json.ok, true);
  const after = brandRow(env, NORTH);
  assert.equal(after.target_roas, 3.2);
  for (const key of ['name', 'status', 'tz', 'target_cpa', 'monthly_budget', 'budgets_json', 'goals_json', 'internal_channel', 'client_channel', 'brief_enabled']) {
    assert.deepEqual(after[key], before[key], `${key} changed`);
  }
  assert.deepEqual(brandRow(env, RIVER), other, 'the other brand changed');
  assert.equal(oldCalls(env).length, 0, 'a plain goal save must not reach the old worker');
});

test('PUT /ah/api/accounts/:id: every field the old editor saved on the row is saved the same way', async () => {
  const env = world();
  const r = await put(env, NORTH, { name: 'North Kites Co', tz: 'America/Denver', monthly_budget: '', target_cpa: '31.5',
    budgets: { '2026-12': 12000 }, goals: { default: { sales: 50000 } } });
  assert.equal(r.status, 200);
  const row = brandRow(env, NORTH);
  assert.equal(row.name, 'North Kites Co');
  assert.equal(row.tz, 'America/Denver');
  assert.equal(row.monthly_budget, null, 'an empty value clears the number');
  assert.equal(row.target_cpa, 31.5);
  assert.equal(row.target_roas, 2.5, 'a missing value keeps what was there');
  assert.deepEqual(JSON.parse(row.budgets_json), { '2026-12': 12000 });
  assert.deepEqual(JSON.parse(row.goals_json), { default: { sales: 50000 } });
});

test('PUT /ah/api/accounts/:id: an old id for the brand saves on the brand', async () => {
  const env = world();
  const r = await put(env, 'act_111', { target_cpa: 19 });
  assert.equal(r.status, 200);
  assert.equal(brandRow(env, NORTH).target_cpa, 19);
  assert.equal(brandRow(env, RIVER).target_cpa, 41);
});

test('PUT /ah/api/accounts/:id: status, channels, the brief switch and the tracker shop go to the old engine untouched', async () => {
  for (const extra of [{ active: 0 }, { active: true }, { tw_shop: 'shop.test' }, { tw_shop: '' }, { slack_channel: 'C0NEW000001' }, { brief_channel: '' }, { brief_enabled: 1 }]) {
    const env = world();
    const before = brandRow(env, NORTH);
    const body = { target_roas: 9, ...extra };
    const r = await put(env, NORTH, body);
    const sent = oldCalls(env).pop();
    assert.equal(r.engine, 'forward', JSON.stringify(extra));
    assert.deepEqual([sent.worker, sent.method, sent.path], ['ah', 'PUT', `/api/accounts/${NORTH}`]);
    assert.deepEqual(JSON.parse(sent.body), body);
    assert.deepEqual(brandRow(env, NORTH), before, 'the engine wrote before sending the request on');
  }
});

test('PUT /ah/api/accounts/:id: an ad account no brand has yet is sent on when it is being added, and unknown otherwise', async () => {
  const env = world();
  const add = await put(env, 'act_999', { active: 1, name: 'New Brand' });
  assert.equal(add.engine, 'forward');
  const plain = await put(env, 'act_999', { target_roas: 2 });
  assert.deepEqual([plain.status, plain.json.error], [404, 'unknown account']);
  const odd = await put(env, 'not-an-id', { target_roas: 2 });
  assert.equal(odd.status, 404);
  assert.equal(env.DB.rows('brands').length, 2);
});

test('PUT /ah/api/accounts/:id: a value that is not text or a number is refused and nothing is saved', async () => {
  const env = world();
  const before = brandRow(env, NORTH);
  const r = await put(env, NORTH, { target_roas: { $gt: 0 } });
  assert.equal(r.status, 400);
  assert.deepEqual(brandRow(env, NORTH), before);
  const notJson = await call(env, 'PUT', `/ah/api/accounts/${NORTH}`, { token: asCaller('team'), body: 'target_roas=3' });
  assert.equal(notJson.status, 400);
});

test('PUT /ah/api/accounts/:id: a client saves goals on its own brand and nothing the team sets', async () => {
  const env = world();
  const ok = await put(env, NORTH, { target_cpa: 22 }, 'client');
  assert.equal(ok.status, 200);
  assert.equal(brandRow(env, NORTH).target_cpa, 22);
  const before = brandRow(env, NORTH), other = brandRow(env, RIVER);
  for (const body of [{ active: 0 }, { tw_shop: 'other-store.test' }, { slack_channel: 'C0RIVER0001' }, { brief_enabled: 1 }, { target_cpa: 1, status: 'paused' }]) {
    const r = await put(env, NORTH, body, 'client');
    assert.equal(r.status, 403, JSON.stringify(body));
  }
  const theirs = await put(env, RIVER, { target_cpa: 1 }, 'client');
  assert.equal(theirs.status, 403);
  const viaBody = await put(env, NORTH, { act: RIVER, target_cpa: 1 }, 'client');
  assert.equal(viaBody.status, 403);
  assert.deepEqual(brandRow(env, NORTH), before);
  assert.deepEqual(brandRow(env, RIVER), other);
  assert.equal(oldCalls(env).length, 0, 'a refused client write must not reach the old worker');
});

test('PUT /ah/api/accounts/:id: a teammate with a brand list cannot save on another brand, a view only teammate cannot save at all', async () => {
  const env = world();
  const other = brandRow(env, RIVER), mine = brandRow(env, NORTH);
  assert.equal((await put(env, RIVER, { target_cpa: 1 }, 'limited')).status, 403);
  assert.equal((await put(env, NORTH, { target_cpa: 1 }, 'viewer')).status, 403);
  assert.deepEqual(brandRow(env, RIVER), other);
  assert.deepEqual(brandRow(env, NORTH), mine);
  assert.equal((await put(env, NORTH, { target_cpa: 17 }, 'limited')).status, 200);
  assert.equal(brandRow(env, NORTH).target_cpa, 17);
});
