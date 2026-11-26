/* A login that is removed or narrowed loses its access on the next request. These tests make two
   calls with nothing forgotten in between (keep: true), the way a running worker sees them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, asCaller, call, useGroup, NORTH, RIVER } from '../src/platform/testkit/index.mjs';
import { probe, SCHEMA, ROWS } from './probe.mjs';

useGroup(probe);
const env0 = () => makeEnv({ sql: SCHEMA, rows: ROWS });
const setting = (env, key, value) => env.DB.insert('settings', [{ key, value: JSON.stringify(value) }]);
const item = { id: 'n1', title: 'renamed' };
const brandPath = id => `/ah/api/probe/brand/${id}`;
const one = id => `/pw/api/probe/one?act=${id}`;

test('a session the old side now refuses is refused on the next account-health request', async () => {
  const env = env0(), token = asCaller('team');
  assert.equal((await call(env, 'PUT', brandPath(NORTH), { token, body: { name: 'a' } })).status, 200);
  env.signedOut.add(token);
  assert.equal((await call(env, 'PUT', brandPath(NORTH), { token, body: { name: 'a' }, keep: true })).status, 401);
  assert.equal((await call(env, 'GET', '/v1/engine', { token: asCaller('owner'), keep: true })).status, 200);
});

test('a refusal on an account-health path also ends what was kept for the profit paths', async () => {
  const env = env0(), token = asCaller('team');
  assert.equal((await call(env, 'GET', one(NORTH), { token })).status, 200);
  env.signedOut.add(token);
  assert.equal((await call(env, 'PUT', brandPath(NORTH), { token, body: { name: 'a' }, keep: true })).status, 401);
  assert.equal((await call(env, 'GET', one(NORTH), { token, keep: true })).status, 401);
});

test('a teammate made view only cannot write on the very next request', async () => {
  const env = env0(), token = asCaller('team');
  assert.equal((await call(env, 'PUT', `/pw/api/probe/item?act=${NORTH}`, { token, body: item })).status, 200);
  assert.equal((await call(env, 'PUT', brandPath(NORTH), { token, body: { name: 'a' }, keep: true })).status, 200);
  setting(env, 'userRoles', { 'team@agency.test': 'viewer' });
  assert.equal((await call(env, 'PUT', `/pw/api/probe/item?act=${NORTH}`, { token, body: item, keep: true })).status, 403);
  assert.equal((await call(env, 'PUT', brandPath(NORTH), { token, body: { name: 'a' }, keep: true })).status, 403);
  assert.equal((await call(env, 'GET', one(NORTH), { token, keep: true })).status, 200);
});

test('a teammate limited to one brand stops seeing the other on the very next request', async () => {
  const env = env0(), token = asCaller('team');
  const before = await call(env, 'GET', '/pw/api/probe/brands', { token });
  assert.ok(before.text.includes(RIVER) && before.text.includes(NORTH));
  setting(env, 'userBrands', { 'team@agency.test': [NORTH] });
  const after = await call(env, 'GET', '/pw/api/probe/brands', { token, keep: true });
  assert.equal(after.status, 200);
  assert.ok(after.text.includes(NORTH));
  assert.ok(!after.text.includes(RIVER), 'the other brand is still listed');
  assert.equal((await call(env, 'GET', one(RIVER), { token, keep: true })).status, 403);
  assert.equal((await call(env, 'PUT', brandPath(RIVER), { token, body: { name: 'a' }, keep: true })).status, 403);
});

test('a client taken off the client list is nobody on the very next request', async () => {
  const env = env0(), token = asCaller('client');
  assert.equal((await call(env, 'GET', one(NORTH), { token })).status, 200);
  setting(env, 'clientUsers', {});
  assert.equal((await call(env, 'GET', one(NORTH), { token, keep: true })).status, 401);
  assert.equal((await call(env, 'PUT', brandPath(NORTH), { token, body: { name: 'a' }, keep: true })).status, 401);
});

test('a client keeps only the brands the client list still holds', async () => {
  const env = env0(), token = asCaller('client', { brands: [NORTH, RIVER] });
  assert.equal((await call(env, 'GET', one(RIVER), { token })).status, 200);
  const email = JSON.parse(env.DB.rows('settings', "key = 'clientUsers'")[0].value);
  const mine = Object.keys(email).find(e => email[e].brands.includes(RIVER));
  setting(env, 'clientUsers', { [mine]: { brands: [NORTH] } });
  assert.equal((await call(env, 'GET', one(RIVER), { token, keep: true })).status, 403);
  assert.equal((await call(env, 'GET', one(NORTH), { token, keep: true })).status, 200);
});

test('a pinned client login whose pass ran out is nobody', async () => {
  const me = { email: 'desk@club.test', exp: Date.now() + 86400e3, master: false, role: 'client',
    client: { name: 'Club', hq: true, brands: [{ id: NORTH, name: NORTH, access: {} }] } };
  const env = makeEnv({ sql: SCHEMA, rows: ROWS, old: { 'GET /api/me': () => me } });
  const token = 'tok_pinned_club_login';
  setting(env, 'clientUsers', { 'desk@club.test': { hq: true, hq_until: Date.now() + 60e3, brands: [] } });
  assert.equal((await call(env, 'GET', one(NORTH), { token, keep: true })).status, 200);
  setting(env, 'clientUsers', { 'desk@club.test': { hq: true, hq_until: Date.now() - 1, brands: [] } });
  assert.equal((await call(env, 'GET', one(NORTH), { token, keep: true })).status, 401);
});
