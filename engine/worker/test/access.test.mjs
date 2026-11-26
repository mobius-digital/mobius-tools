/* May they do this: roles, brand limits, client logins, and the last filter on the way out. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, asCaller, call, useGroup, genAccessTests, assertNoLeak, NORTH, RIVER, RIVER_IDS } from '../src/platform/testkit/index.mjs';
import { filterBrands, scrub } from '../src/platform/scrub.js';
import { probe, SCHEMA, ROWS } from './probe.mjs';

useGroup(probe);
const opts = { sql: SCHEMA, rows: ROWS };
const env0 = () => makeEnv(opts);
const ids = r => (r.json.rows || []).map(x => x.id).sort();

/* The same checks every group runs over its own rows, here over the made up group. */
genAccessTests(probe.routes, opts);

test('the owner reads one brand, and an old id means the same brand', async () => {
  const env = env0(), token = asCaller('owner');
  assert.deepEqual(ids(await call(env, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token })), ['n1', 'n2']);
  assert.deepEqual(ids(await call(env, 'GET', '/pw/api/probe/one?act=act_111', { token })), ['n1', 'n2']);
  assert.deepEqual(ids(await call(env, 'GET', `/pw/api/probe/one?act=${RIVER}`, { token })), ['r1']);
});

test('all brands for the owner is every brand, for a limited teammate it quietly means theirs', async () => {
  const env = env0();
  assert.deepEqual(ids(await call(env, 'GET', '/pw/api/probe/many?act=all', { token: asCaller('owner') })), ['n1', 'n2', 'r1']);
  assert.deepEqual(ids(await call(env, 'GET', '/pw/api/probe/many?act=all', { token: asCaller('limited') })), ['n1', 'n2']);
  assert.deepEqual(ids(await call(env, 'GET', '/pw/api/probe/many', { token: asCaller('limited') })), ['n1', 'n2']);
});

test('a limited teammate cannot name the other brand in a body either', async () => {
  const env = env0(), token = asCaller('limited');
  const r = await call(env, 'PUT', '/pw/api/probe/item', { token, body: { act: RIVER, id: 'r1', title: 'x' } });
  assert.equal(r.status, 403);
  const r2 = await call(env, 'PUT', `/pw/api/probe/item?act=${NORTH}`, { token, body: { act_id: RIVER, id: 'r1', title: 'x' } });
  assert.equal(r2.status, 403);
  assert.equal(env.DB.rows('p_inspo', "id = 'r1'")[0].title, 'river one');
});

test('a statement that forgets the brand is still filtered on the way out for a limited teammate', async () => {
  const r = await call(env0(), 'GET', '/pw/api/probe/unfiltered', { token: asCaller('limited') });
  assert.equal(r.status, 200);
  assert.deepEqual(ids(r), ['n1', 'n2']);
});

test('a client cannot read another brand: refused by name, refused for all, and never in an answer', async () => {
  const env = env0();
  const { mine } = await assertNoLeak(env, 'GET', '/pw/api/probe/many');
  assert.deepEqual(ids(mine), ['n1', 'n2']);
  await assertNoLeak(env, 'GET', '/pw/api/probe/brands');
});

test('a client must name its brand where the row needs one', async () => {
  const r = await call(env0(), 'GET', '/pw/api/probe/one', { token: asCaller('client') });
  assert.equal(r.status, 403);
  assert.equal(r.json.error, 'Pick your brand first.');
});

test('a client cannot slip the other brand in as a second copy, a body field or a list', async () => {
  const env = env0(), token = asCaller('client');
  const tries = [
    ['GET', `/pw/api/probe/many?act=${NORTH}&act=${RIVER}`, undefined],
    ['GET', `/pw/api/probe/many?act=${NORTH}&act_id=${RIVER}`, undefined],
    ['PUT', `/pw/api/probe/item?act=${NORTH}`, { act_id: RIVER, id: 'n1', title: 'x' }],
    ['PUT', '/pw/api/probe/item', { act: [RIVER], id: 'n1', title: 'x' }],
    ['PUT', '/pw/api/probe/item', { act: NORTH, screen: { act_id: RIVER }, id: 'n1', title: 'x' }],
  ];
  for (const [method, path, body] of tries) assert.equal((await call(env, method, path, { token, body })).status, 403, path);
});

test('a client cannot touch a record of another brand by its id', async () => {
  const env = env0();
  const r = await call(env, 'PUT', `/pw/api/probe/item?act=${NORTH}`, { token: asCaller('client'), body: { id: 'r1', title: 'stolen' } });
  assert.equal(r.status, 403);
  assert.equal(r.json.error, 'That belongs to another brand.');
  assert.equal(env.DB.rows('p_inspo', "id = 'r1'")[0].title, 'river one');
});

test('a client write may carry only the listed fields', async () => {
  const env = env0(), token = asCaller('client');
  const bad = await call(env, 'PUT', `/pw/api/probe/item?act=${NORTH}`, { token, body: { id: 'n1', title: 'ok', note: 'x' } });
  assert.equal(bad.status, 403);
  assert.match(bad.json.error, /note is set by the agency team/);
  const good = await call(env, 'PUT', `/pw/api/probe/item?act=${NORTH}`, { token, body: { id: 'n1', title: 'mine' } });
  assert.equal(good.status, 200);
  assert.equal(env.DB.rows('p_inspo', "id = 'n1'")[0].title, 'mine');
});

test('a client never sees team only keys or a chat channel id', async () => {
  const r = await call(env0(), 'GET', `/pw/api/probe/one?act=${NORTH}`, { token: asCaller('client') });
  assert.equal(r.status, 200);
  assert.ok(!r.text.includes('slack_channel') && !r.text.includes('notes_internal') && !r.text.includes('C0NORTH0001'));
  const team = await call(env0(), 'GET', `/pw/api/probe/one?act=${NORTH}`, { token: asCaller('team') });
  assert.ok(team.text.includes('notes_internal'));
});

test('a client cannot read an agency setting, and reads a per person row only as itself', async () => {
  const env = env0(), token = asCaller('client');
  assert.equal((await call(env, 'GET', '/pw/api/probe/setting', { token })).status, 403);
  assert.equal((await call(env, 'GET', '/pw/api/probe/mine', { token })).status, 200);
  assert.equal((await call(env, 'GET', '/pw/api/probe/mine?as=team@agency.test', { token })).status, 403);
  assert.equal((await call(env, 'GET', '/pw/api/probe/setting', { token: asCaller('team') })).json.value, 'none');
});

test('a brand named in the path: a client reaches its own, not the other', async () => {
  const env = env0(), token = asCaller('client');
  const own = await call(env, 'PUT', `/ah/api/probe/brand/${NORTH}`, { token, body: { name: 'x' } });
  assert.equal(own.status, 200);
  assert.equal(own.json.brand, NORTH);
  assert.equal((await call(env, 'PUT', `/ah/api/probe/brand/${RIVER}`, { token, body: { name: 'x' } })).status, 403);
  assert.equal((await call(env, 'PUT', `/ah/api/probe/brand/${NORTH}?act=${RIVER}`, { token, body: { name: 'x' } })).status, 403);
  assert.equal((await call(env, 'PUT', `/ah/api/probe/brand/${NORTH}`, { token, body: { status: 'paused' } })).status, 403);
});

test('a client with a read only login cannot write', async () => {
  const env = makeEnv({ ...opts, old: { 'GET /api/me': () => ({ email: 'ro@northkites.test', role: 'client', master: false,
    client: { name: 'Read Only', hq: true, readOnly: true, brands: [{ id: NORTH, name: 'North Kites', access: {} }] } }) } });
  const token = 'tok_read_only_client';
  env.DB.insert('settings', [{ key: 'clientUsers', value: JSON.stringify({ 'ro@northkites.test': { hq: true, readOnly: true, brands: [] } }) }]);
  assert.equal((await call(env, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token, keep: true })).status, 200);
  assert.equal((await call(env, 'PUT', `/pw/api/probe/item?act=${NORTH}`, { token, body: { id: 'n1', title: 'x' }, keep: true })).status, 403);
});

test('a client whose last brand was removed opens nothing', async () => {
  const r = await call(env0(), 'GET', '/pw/api/probe/many', { token: asCaller('client', { brands: [] }) });
  assert.equal(r.status, 401);
});

test('only the owner passes an owner only row', async () => {
  const env = env0();
  assert.equal((await call(env, 'PUT', '/pw/api/probe/owner', { token: asCaller('team'), body: {} })).status, 403);
  assert.equal((await call(env, 'PUT', '/pw/api/probe/owner', { token: asCaller('owner'), body: {} })).status, 200);
});

test('the scope a handler gets holds the ids of the named brand only', async () => {
  const r = await call(env0(), 'GET', `/pw/api/probe/brands?act=${NORTH}`, { token: asCaller('owner') });
  assert.equal(r.json.scope.brand, NORTH);
  assert.ok(r.json.scope.ids.includes('act_111') && !r.json.scope.ids.some(x => RIVER_IDS.includes(x)));
  assert.equal(r.json.accounts.length, 2);       // ctx.brands.list is the caller's brands, whatever was named
});

test('filterBrands drops rows and keys of other brands, scrub drops team only keys', () => {
  const only = new Set([NORTH]);
  const out = filterBrands({ rows: [{ act_id: NORTH, x: 1 }, { act_id: RIVER, x: 2 }], by: { [NORTH]: 1, [RIVER]: 2 }, n: 3 }, only);
  assert.deepEqual(out, { rows: [{ act_id: NORTH, x: 1 }], by: { [NORTH]: 1 }, n: 3 });
  assert.deepEqual(scrub({ a: 1, team: [1], posts_to: 'C012345678', deep: [{ created_by: 'x', keep: true }] }), { a: 1, deep: [{ keep: true }] });
});
