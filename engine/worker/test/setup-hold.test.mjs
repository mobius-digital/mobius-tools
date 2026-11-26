/* The Get started hold (2026-11-26): a client login whose brand is still being set up reads none of that brand's data
   through the engine, the same rule as the old brand guard (account-health brandguard.js heldBrands). The old side's
   /api/me says which brands are held (client.onboarding.gated_brands); old clients, finished ones and the team never are. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, asCaller, call, useGroup, NORTH, RIVER, RIVER_IDS } from '../src/platform/testkit/index.mjs';
import { probe, SCHEMA, ROWS } from './probe.mjs';

const open = { team: true, client: true };
const src = { old: 'ah', file: 'test/setup-hold.test.mjs', engine: 'new' };
/* Two made up routes at paths of setting up the engine does not serve yet: a reply to the team (open while held)
   and Get started itself. */
const extra = [
  { method: 'POST', path: '/ah/api/requests/reply', access: { ...open, brand: 'need' }, input: { body: { text: 'string?' }, loose: true },
    handler: async ctx => ({ ok: true, brand: ctx.scope.brand }), doc: 'A reply to the team, a stand in.', source: src },
  { method: 'GET', path: '/ah/api/onboard', access: { ...open, brand: 'need' }, input: { query: { act: 'brand?' } },
    handler: async ctx => ({ ok: true, brand: ctx.scope.brand }), doc: 'Get started, a stand in.', source: src },
];
useGroup({ ...probe, routes: [...probe.routes, ...extra] });

/* The old side's /api/me for a client, with the onboarding answer this test wants. */
const emailOf = brands => `client+${brands.join('+').replace(/[^a-z0-9]/g, '')}@northkites.test`;
function oldMe(brands, onboarding) {
  return { 'GET /api/me': request => {
    const token = (request.headers.get('Authorization') || '').slice(7);
    const exp = Date.now() + 86400e3;
    if (token.startsWith('tok_owner')) return { email: 'owner@agency.test', exp, master: false, role: 'owner' };
    if (token.startsWith('tok_team')) return { email: 'team@agency.test', exp, master: false, role: 'team' };
    return { email: emailOf(brands), exp, master: false, role: 'client',
      client: { name: 'Client Person', welcomed: true, onboarding, brands: brands.map(id => ({ id, name: id, access: {} })) } };
  } };
}
const held = (list, brands, extraFields = {}) => ({ gated: true, brand: list[0], left: ['connect'], only: null, gated_slugs: list, gated_brands: list, all_gated: list.length === brands.length, ...extraFields });
const env0 = old => makeEnv({ sql: SCHEMA, rows: ROWS, old });
const ids = r => (r.json.rows || []).map(x => x.id).sort();
const isHeld = r => r.status === 403 && r.json.gated === true && r.json.error === 'Finish setting up first.';

test('a client whose only brand is held: its data is refused, named or not, with gated: true', async () => {
  const env = env0(oldMe([NORTH], held([NORTH], [NORTH])));
  const token = asCaller('client', { brands: [NORTH] });
  assert.ok(isHeld(await call(env, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token })));
  assert.ok(isHeld(await call(env, 'GET', '/pw/api/probe/many', { token })));
  assert.ok(isHeld(await call(env, 'PUT', '/pw/api/probe/item', { token, body: { act: NORTH, id: 'n1', title: 'x' } })));
  assert.equal(env.DB.rows('p_inspo', "id = 'n1'")[0].title, 'north one', 'nothing written');
});

test('the routes of setting up stay open while held', async () => {
  const env = env0(oldMe([NORTH], held([NORTH], [NORTH])));
  const token = asCaller('client', { brands: [NORTH] });
  const get = await call(env, 'GET', `/ah/api/onboard?act=${NORTH}`, { token });
  assert.equal(get.status, 200, JSON.stringify(get.json)); assert.equal(get.json.brand, NORTH);
  const reply = await call(env, 'POST', '/ah/api/requests/reply', { token, body: { act: NORTH, text: 'hi' } });
  assert.equal(reply.status, 200, JSON.stringify(reply.json)); assert.equal(reply.json.brand, NORTH);
});

test('a one-job colleague opens Get started only', async () => {
  const env = env0(oldMe([NORTH], held([NORTH], [NORTH], { only: ['brief'] })));
  const token = asCaller('client', { brands: [NORTH] });
  assert.equal((await call(env, 'GET', `/ah/api/onboard?act=${NORTH}`, { token })).status, 200);
  const r = await call(env, 'POST', '/ah/api/requests/reply', { token, body: { act: NORTH, text: 'hi' } });
  assert.equal(r.status, 403); assert.match(r.json.error, /one setup job/);
  assert.equal((await call(env, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token })).status, 403);
});

test('an old client (no checklist) and a finished one are never held', async () => {
  for (const onboarding of [null, { gated: false, brand: NORTH, left: [], only: null, gated_slugs: [], gated_brands: [], all_gated: false }]) {
    const env = env0(oldMe([NORTH], onboarding));
    const token = asCaller('client', { brands: [NORTH] });
    const r = await call(env, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token });
    assert.equal(r.status, 200, JSON.stringify(r.json)); assert.deepEqual(ids(r), ['n1', 'n2']);
  }
});

test('the team and the owner are never held', async () => {
  const env = env0(oldMe([NORTH], held([NORTH], [NORTH])));
  for (const kind of ['owner', 'team']) {
    const r = await call(env, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token: asCaller(kind) });
    assert.equal(r.status, 200); assert.deepEqual(ids(r), ['n1', 'n2']);
  }
});

test('two brands: the running one opens, the held one is refused and left out of every answer', async () => {
  const brands = [NORTH, RIVER];
  const env = env0(oldMe(brands, held([RIVER], brands)));
  const token = asCaller('client', { brands });
  const north = await call(env, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token });
  assert.equal(north.status, 200); assert.deepEqual(ids(north), ['n1', 'n2']);
  assert.ok(isHeld(await call(env, 'GET', `/pw/api/probe/one?act=${RIVER}`, { token })));
  assert.ok(isHeld(await call(env, 'GET', '/pw/api/probe/one?act=act_222', { token })), 'an old id of the held brand');
  assert.ok(isHeld(await call(env, 'PUT', '/pw/api/probe/item', { token, body: { act: NORTH, id: 'r1', title: 'x' } })), 'a record of the held brand');
  const many = await call(env, 'GET', '/pw/api/probe/many', { token });
  assert.equal(many.status, 200); assert.deepEqual(ids(many), ['n1', 'n2']);
  for (const id of RIVER_IDS) assert.ok(!many.text.includes(id), `the answer holds ${id}`);
  /* Message the team still reaches the held brand. */
  assert.equal((await call(env, 'POST', '/ah/api/requests/reply', { token, body: { act: RIVER, text: 'hi' } })).status, 200);
});

test('a held login is asked about again on every request, so finishing opens at once; an open one keeps its minute', async () => {
  const meCalls = env => env.calls.filter(c => c.path === '/api/me').length;
  const token = asCaller('client', { brands: [NORTH] });
  const env = env0(oldMe([NORTH], held([NORTH], [NORTH])));
  await call(env, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token });
  const first = meCalls(env);
  assert.equal(first, 1, 'nothing kept: asked once, not twice');
  await call(env, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token, keep: true });
  assert.equal(meCalls(env), first + 1, 'a kept held answer is asked again, once');
  const env2 = env0(oldMe([NORTH], null));
  await call(env2, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token });
  const once = meCalls(env2);
  await call(env2, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token, keep: true });
  assert.equal(meCalls(env2), once, 'kept a minute');
});
