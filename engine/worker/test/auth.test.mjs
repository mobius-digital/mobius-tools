/* Who is this: the same sessions and role settings the old engine uses. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, asCaller, call, useGroup, reset, NORTH, RIVER } from '../src/platform/testkit/index.mjs';
import { identify } from '../src/platform/auth.js';
import { probe, SCHEMA, ROWS } from './probe.mjs';

useGroup(probe);
const env0 = () => makeEnv({ sql: SCHEMA, rows: ROWS });
const req = token => new Request('https://engine.test/v1/health', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
const who = async (env, kind, opts) => {
  const token = asCaller(kind, opts);
  await call(env, 'GET', '/v1/health', {});            // writes the people settings into the fake database
  reset();
  return identify(req(token), env);
};

test('no session is nobody', async () => {
  const c = await identify(req(''), env0());
  assert.equal(c.kind, 'nobody');
});

test('a session the old side does not know is nobody', async () => {
  const c = await identify(req('tok_made_up_by_a_stranger'), env0());
  assert.equal(c.kind, 'nobody');
});

test('the owner sees every brand', async () => {
  const c = await who(env0(), 'owner');
  assert.equal(c.kind, 'owner');
  assert.equal(c.brand_ids, null);
  assert.equal(c.view_only, false);
});

test('a teammate with no brand list sees every brand', async () => {
  const c = await who(env0(), 'team');
  assert.equal(c.kind, 'team');
  assert.equal(c.brand_ids, null);
  assert.equal(c.ids, null);
});

test('a teammate with a brand list is held to it, old ids included', async () => {
  const c = await who(env0(), 'limited');
  assert.deepEqual(c.brand_ids, [NORTH]);
  assert.ok(c.ids.has(NORTH) && c.ids.has('act_111') && c.ids.has('asana_111'));
  assert.ok(!c.ids.has(RIVER) && !c.ids.has('act_222'));
});

test('a brand list written with an old id still resolves to the brand', async () => {
  const c = await who(env0(), 'limited', { brands: ['act_222'] });
  assert.deepEqual(c.brand_ids, [RIVER]);
  assert.ok(c.ids.has(RIVER) && !c.ids.has(NORTH));
});

test('a view only teammate is marked view only', async () => {
  const c = await who(env0(), 'viewer');
  assert.equal(c.kind, 'team');
  assert.equal(c.view_only, true);
});

test('a client has only its own brands', async () => {
  const c = await who(env0(), 'client');
  assert.equal(c.kind, 'client');
  assert.deepEqual(c.brand_ids, [NORTH]);
  assert.ok(c.ids.has('act_111') && !c.ids.has(RIVER));
  assert.equal(c.client.read_only, false);
});

const at = (path, token) => new Request(`https://engine.test${path}`, { headers: { Authorization: `Bearer ${token}` } });

test('on the profit paths the old side is asked once a minute per session, as the old profit worker did', async () => {
  const env = env0();
  const token = asCaller('team');
  await call(env, 'GET', '/v1/health', {});
  reset();
  env.calls.length = 0;
  await identify(at('/pw/api/probe/one', token), env);
  await identify(at('/pw/api/probe/one', token), env);
  assert.equal(env.calls.filter(c => c.path === '/api/me').length, 1);
});

test('on the account-health paths and the engine own paths the old side is asked on every request', async () => {
  const env = env0();
  const token = asCaller('team');
  await call(env, 'GET', '/v1/health', {});
  reset();
  env.calls.length = 0;
  await identify(at('/ah/api/probe/fwd', token), env);
  await identify(at('/ah/api/probe/fwd', token), env);
  await identify(at('/v1/engine', token), env);
  assert.equal(env.calls.filter(c => c.path === '/api/me').length, 3);
});

test('a kept answer never outlives the end of the session', async () => {
  const exp = Date.now() + 40;
  const env = makeEnv({ sql: SCHEMA, old: { 'GET /api/me': () => (Date.now() < exp
    ? { email: 'team@agency.test', exp, master: false, role: 'team' }
    : new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })) } });
  const token = 'tok_short_lived_session';
  assert.equal((await identify(at('/pw/api/probe/one', token), env)).kind, 'team');
  await new Promise(done => setTimeout(done, 60));
  assert.equal((await identify(at('/pw/api/probe/one', token), env)).kind, 'nobody');
});

test('the admin key with no name is the owner, because the old side says so', async () => {
  const env = makeEnv({ sql: SCHEMA, old: { 'GET /api/me': () => ({ email: null, exp: null, master: true, role: 'owner' }) } });
  const c = await identify(req('some_admin_key_value'), env);
  assert.equal(c.kind, 'owner');
  assert.equal(c.via, 'master');
});

test('when the old side is down nobody is let in', async () => {
  const env = env0();
  env.OLD_AH = { fetch: async () => { throw new Error('down'); } };
  const r = await call(env, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token: asCaller('owner') });
  assert.equal(r.status, 401);
});
