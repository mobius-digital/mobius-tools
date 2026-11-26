/* The kernel's own routes, one by one: health, the route list, compare and the switch.
   Each gets a shape test and a test that a client login learns nothing through it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, asCaller, call, useGroup, sameShape, genAccessTests, NORTH, RIVER, RIVER_IDS } from '../../src/platform/testkit/index.mjs';
import { routes } from '../../src/platform/routes.js';
import { probe, SCHEMA, ROWS } from '../probe.mjs';

useGroup(probe);
const opts = { sql: SCHEMA, rows: ROWS };
const env0 = (more = {}) => makeEnv({ ...opts, ...more });
const oldCalls = env => env.calls.filter(c => c.path !== '/api/me');
const setting = (env, key) => env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
const noOtherBrand = (text, also = []) => {
  for (const id of [...RIVER_IDS, 'river one', 'C0RIVER0001', ...also]) assert.ok(!text.includes(id), `the answer holds ${id}`);
};

const SAMPLES = {
  health: { ok: true, worker: 'x', mode: 'new', routes: 1, time: '2026-01-01T00:00:00.000Z' },
  route: { method: 'GET', path: '/pw/api/x', domain: 'x', doc: 'x', who: 'team', brand: 'opt', client_fields: null,
    engine: 'new', why: '', old: 'pw', old_file: 'x.js', borrows: [], ignore: [], input: null },
  engine: { mode: 'new', forward: ['GET /pw/api/x'] },
  compare: { route: 'GET /pw/api/x', engine: 'new', match: true, old_status: 200, new_status: 200, ms_old: 1, ms_new: 1,
    differences: [{ at: 'a', old: '1', new: '2' }], more: 0 },
  compareForwarded: { route: 'GET /pw/api/x', engine: 'forward', match: true, note: 'x', differences: [], more: 0 },
};

/* Every row: nobody 401 (but health), a client 403, a limited teammate, a view only teammate on a write. */
genAccessTests(routes.filter(r => r.path !== '/v1/metrics/definitions'), opts);

/* ---- GET /v1/health ---- */

test('health: the shape, with no sign in and no old worker asked', async () => {
  const env = env0();
  const r = await call(env, 'GET', '/v1/health');
  assert.equal(r.status, 200);
  assert.equal(r.engine, 'new');
  assert.deepEqual(sameShape(r.json, SAMPLES.health), []);
  assert.deepEqual(Object.keys(r.json).sort(), ['meta', 'mode', 'ok', 'routes', 'time', 'worker']);
  assert.equal(env.calls.length, 0);
});

test('health: says nothing about any brand or person, signed in or not', async () => {
  for (const kind of ['nobody', 'client', 'team']) {
    const r = await call(env0(), 'GET', '/v1/health', { token: asCaller(kind) });
    assert.equal(r.status, 200);
    noOtherBrand(r.text, [NORTH, '@']);
  }
});

test('health: still answers in mode old, and says so', async () => {
  const env = env0();
  env.DB.insert('settings', [{ key: 'engineMode', value: 'old' }]);
  const r = await call(env, 'GET', '/v1/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.mode, 'old');
  assert.equal(r.engine, 'new');
});

test('health: a write to it is not found', async () => {
  assert.equal((await call(env0(), 'POST', '/v1/health', { body: {} })).status, 404);
});

/* ---- GET /v1/routes ---- */

test('routes: the shape of the list and of every row', async () => {
  const r = await call(env0(), 'GET', '/v1/routes', { token: asCaller('owner') });
  assert.equal(r.status, 200);
  assert.equal(r.json.count, r.json.routes.length);
  assert.equal(r.json.forwarded, r.json.routes.filter(x => x.engine === 'forward').length);
  for (const row of r.json.routes) {
    assert.deepEqual(Object.keys(row).sort(), Object.keys(SAMPLES.route).sort(), `${row.method} ${row.path}`);
    assert.deepEqual(sameShape(row, SAMPLES.route).filter(d => !d.startsWith('input')), [], `${row.method} ${row.path}`);
    assert.ok(row.doc.length >= 8 && row.who, `${row.method} ${row.path} has no doc or who`);
    if (row.engine === 'forward') assert.ok(row.why, `${row.method} ${row.path} is forwarded with no reason`);
  }
});

test('routes: the five kernel paths are listed with the right people', async () => {
  const r = await call(env0(), 'GET', '/v1/routes', { token: asCaller('owner') });
  const who = key => { const [m, p] = key.split(' '); return (r.json.routes.find(x => x.method === m && x.path === p) || {}).who; };
  assert.equal(who('GET /v1/health'), 'anyone');
  assert.equal(who('GET /v1/routes'), 'owner');
  assert.equal(who('POST /v1/compare'), 'owner');
  assert.equal(who('GET /v1/engine'), 'owner');
  assert.equal(who('PUT /v1/engine'), 'owner');
});

test('routes: only the owner gets the list, statements included', async () => {
  const env = env0();
  for (const kind of ['team', 'limited', 'viewer']) {
    const r = await call(env, 'GET', '/v1/routes', { token: asCaller(kind) });
    assert.equal(r.status, 403, kind);
    assert.deepEqual(Object.keys(r.json), ['error'], kind);
  }
  const owner = await call(env, 'GET', '/v1/routes', { token: asCaller('owner') });
  assert.ok(owner.json.queries, 'the owner got no statement list');
});

test('engine: a teammate of any kind cannot read the switch', async () => {
  const env = env0();
  for (const kind of ['team', 'limited', 'viewer']) {
    const r = await call(env, 'GET', '/v1/engine', { token: asCaller(kind) });
    assert.equal(r.status, 403, kind);
    assert.deepEqual(Object.keys(r.json), ['error'], kind);
  }
});

test('routes: a client login is refused and learns no path', async () => {
  const r = await call(env0(), 'GET', '/v1/routes', { token: asCaller('client') });
  assert.equal(r.status, 403);
  assert.deepEqual(Object.keys(r.json), ['error']);
  assert.ok(!r.text.includes('/pw/') && !r.text.includes('/ah/'));
});

test('routes: holds no id of a brand and no old worker address', async () => {
  const r = await call(env0(), 'GET', '/v1/routes', { token: asCaller('owner') });
  noOtherBrand(r.text, [NORTH, 'old-ah.test', 'old-pw.test']);
});

/* ---- GET and PUT /v1/engine ---- */

test('engine: the shape of the switch', async () => {
  const env = env0();
  env.DB.insert('settings', [{ key: 'engineForward', value: JSON.stringify(['GET /pw/api/probe/one']) }]);
  const r = await call(env, 'GET', '/v1/engine', { token: asCaller('owner') });
  assert.equal(r.status, 200);
  assert.deepEqual(sameShape(r.json, SAMPLES.engine), []);
  assert.deepEqual([r.json.mode, r.json.forward], ['new', ['GET /pw/api/probe/one']]);
});

test('engine: a broken flag row reads as old (the default) with nothing sent back', async () => {
  const env = env0();
  env.DB.insert('settings', [{ key: 'engineMode', value: 'sideways' }, { key: 'engineForward', value: '{not json' }]);
  const r = await call(env, 'GET', '/v1/engine', { token: asCaller('owner') });
  assert.deepEqual([r.json.mode, r.json.forward], ['old', []]);
});

test('engine: a client login cannot read the switch or flip it', async () => {
  const env = env0(), token = asCaller('client');
  const get = await call(env, 'GET', '/v1/engine', { token });
  assert.equal(get.status, 403);
  assert.deepEqual(Object.keys(get.json), ['error']);
  assert.equal((await call(env, 'PUT', '/v1/engine', { token, body: { mode: 'old' } })).status, 403);
  assert.equal((await setting(env, 'engineMode')).value, 'new');   // the test kit turns it on
});

test('engine: a teammate, a limited teammate and a view only teammate cannot flip it', async () => {
  const env = env0();
  for (const kind of ['team', 'limited', 'viewer']) {
    const r = await call(env, 'PUT', '/v1/engine', { token: asCaller(kind), body: { mode: 'old', forward: ['GET /pw/api/probe/one'] } });
    assert.equal(r.status, 403, kind);
  }
  assert.equal((await setting(env, 'engineMode')).value, 'new');   // the test kit turns it on
  assert.equal(await setting(env, 'engineForward'), null);
  assert.equal(oldCalls(env).length, 0);
});

test('engine: the owner flips it, the two rows land and nothing else changes', async () => {
  const env = env0(), owner = asCaller('owner');
  env.DB.insert('settings', [{ key: 'someOtherSetting', value: 'kept' }]);
  const r = await call(env, 'PUT', '/v1/engine', { token: owner,
    body: { mode: 'old', forward: ['GET /pw/api/probe/one', 'GET /pw/api/probe/one', 'GET /pw/api/probe/many'] } });
  assert.equal(r.status, 200);
  assert.deepEqual(sameShape(r.json, SAMPLES.engine), []);
  assert.deepEqual([r.json.mode, r.json.forward], ['old', ['GET /pw/api/probe/one', 'GET /pw/api/probe/many']]);
  assert.equal((await setting(env, 'engineMode')).value, 'old');
  assert.deepEqual(JSON.parse((await setting(env, 'engineForward')).value), ['GET /pw/api/probe/one', 'GET /pw/api/probe/many']);
  assert.equal((await setting(env, 'someOtherSetting')).value, 'kept');
  assert.equal(oldCalls(env).length, 0, 'the switch must not call an old worker');
});

test('engine: setting one half leaves the other half alone', async () => {
  const env = env0(), owner = asCaller('owner');
  await call(env, 'PUT', '/v1/engine', { token: owner, body: { forward: ['GET /pw/api/probe/one'] } });
  const r = await call(env, 'PUT', '/v1/engine', { token: owner, body: { mode: 'old' } });
  assert.deepEqual([r.json.mode, r.json.forward], ['old', ['GET /pw/api/probe/one']]);
  const back = await call(env, 'PUT', '/v1/engine', { token: owner, body: { mode: 'new', forward: [] } });
  assert.deepEqual([back.json.mode, back.json.forward], ['new', []]);
  const empty = await call(env, 'PUT', '/v1/engine', { token: owner, body: {} });
  assert.deepEqual([empty.json.mode, empty.json.forward], ['new', []]);
});

test('engine: a wrong mode, a wrong route key or an unknown key is refused and nothing is written', async () => {
  const env = env0(), owner = asCaller('owner');
  for (const body of [{ mode: 'off' }, { mode: '' }, { forward: ['nope'] }, { forward: ['get /pw/api/x'] },
    { mode: 'old', extra: 1 }]) {
    const r = await call(env, 'PUT', '/v1/engine', { token: owner, body });
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  assert.equal((await setting(env, 'engineMode')).value, 'new');   // the test kit turns it on
  assert.equal(await setting(env, 'engineForward'), null);
});

test('engine: the switch can always be flipped back while everything is piped', async () => {
  const env = env0(), owner = asCaller('owner');
  await call(env, 'PUT', '/v1/engine', { token: owner, body: { mode: 'old' } });
  assert.equal((await call(env, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token: owner })).engine, 'pipe');
  assert.equal((await call(env, 'GET', '/v1/engine', { token: owner })).json.mode, 'old');
  await call(env, 'PUT', '/v1/engine', { token: owner, body: { mode: 'new' } });
  assert.equal((await call(env, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token: owner })).engine, 'new');
});

/* ---- POST /v1/compare ---- */

const northRows = { rows: [
  { id: 'n1', act_id: NORTH, title: 'north one', slack_channel: 'C0NORTH0001', notes_internal: 'team only' },
  { id: 'n2', act_id: 'act_111', title: 'north old id', slack_channel: null, notes_internal: null }] };

test('compare: the shape of a match and of a difference', async () => {
  const token = asCaller('owner'), path = `/pw/api/probe/one?act=${NORTH}`;
  const same = await call(env0({ old: { 'GET /api/probe/one': () => northRows } }), 'POST', '/v1/compare', { token, body: { path } });
  assert.equal(same.status, 200);
  assert.deepEqual(sameShape(same.json, { ...SAMPLES.compare, differences: [] }), []);
  assert.deepEqual([same.json.match, same.json.route, same.json.old_status, same.json.new_status], [true, 'GET /pw/api/probe/one', 200, 200]);
  const other = await call(env0({ old: { 'GET /api/probe/one': () => ({ rows: [] }) } }), 'POST', '/v1/compare', { token, body: { path } });
  assert.deepEqual(sameShape(other.json, SAMPLES.compare), []);
  assert.equal(other.json.match, false);
});

test('compare: asks the old worker once, with GET, the same query and the same person', async () => {
  const env = env0({ old: { 'GET /api/probe/one': () => northRows } }), token = asCaller('owner');
  await call(env, 'POST', '/v1/compare', { token, body: { path: `/pw/api/probe/one?act=${NORTH}` } });
  const sent = oldCalls(env);
  assert.equal(sent.length, 1);
  assert.deepEqual([sent[0].worker, sent[0].method, sent[0].path, sent[0].search, sent[0].token],
    ['pw', 'GET', '/api/probe/one', `?act=${NORTH}`, token]);
});

test('compare: a forwarded route is reported and no old worker is asked', async () => {
  const env = env0();
  const r = await call(env, 'POST', '/v1/compare', { token: asCaller('owner'), body: { path: '/pw/api/probe/fwd' } });
  assert.deepEqual(sameShape(r.json, SAMPLES.compareForwarded), []);
  assert.equal(oldCalls(env).length, 0);
});

test('compare: an old status that differs is the first difference', async () => {
  const env = env0({ old: { 'GET /api/probe/one': () => new Response(JSON.stringify({ error: 'nope' }), { status: 500 }) } });
  const r = await call(env, 'POST', '/v1/compare', { token: asCaller('owner'), body: { path: `/pw/api/probe/one?act=${NORTH}` } });
  assert.equal(r.json.match, false);
  assert.deepEqual(r.json.differences[0], { at: '(status)', old: '500', new: '200' });
});

test('compare: only read routes with an old worker can be compared', async () => {
  const env = env0(), token = asCaller('owner');
  const bad = path => call(env, 'POST', '/v1/compare', { token, body: { path } });
  assert.equal((await bad('/v1/engine')).status, 400);
  assert.equal((await bad('/api/probe/one')).status, 400);
  assert.equal((await bad('')).status, 400);
  assert.equal((await bad('/pw/api/not-listed')).status, 404);
  assert.equal((await bad('/pw/api/probe/item')).status, 404, 'a write route must not be found');
  assert.equal((await call(env, 'POST', '/v1/compare', { token, body: {} })).status, 400);
  assert.equal((await call(env, 'POST', '/v1/compare', { token, body: { path: '/pw/api/probe/one', method: 'PUT' } })).status, 400);
  assert.equal(oldCalls(env).length, 0);
});

test('compare: an address in the path goes nowhere, only the path part is used', async () => {
  const env = env0({ old: { 'GET /api/probe/one': () => northRows } });
  const r = await call(env, 'POST', '/v1/compare', { token: asCaller('owner'), body: { path: `https://elsewhere.test/pw/api/probe/one?act=${NORTH}` } });
  assert.equal(r.json.match, true);
  const sent = oldCalls(env);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].worker, 'pw');
});

test('compare: works while everything is piped, so the proof can be read before switching on', async () => {
  const env = env0({ old: { 'GET /api/probe/one': () => northRows } });
  env.DB.insert('settings', [{ key: 'engineMode', value: 'old' }]);
  const r = await call(env, 'POST', '/v1/compare', { token: asCaller('owner'), body: { path: `/pw/api/probe/one?act=${NORTH}` } });
  assert.equal(r.status, 200);
  assert.equal(r.json.match, true, JSON.stringify(r.json));
});

test('compare: a client login is refused before anything runs', async () => {
  const env = env0({ old: { 'GET /api/probe/one': () => northRows } });
  const r = await call(env, 'POST', '/v1/compare', { token: asCaller('client'), body: { path: `/pw/api/probe/one?act=${RIVER}` } });
  assert.equal(r.status, 403);
  assert.deepEqual(Object.keys(r.json), ['error']);
  noOtherBrand(r.text);
  assert.equal(oldCalls(env).length, 0);
});

test('compare: a teammate of any kind is refused before anything runs, whatever the mode', async () => {
  for (const mode of ['new', 'old']) {
    const env = env0({ old: { 'GET /api/probe/one': () => northRows, 'GET /api/probe/many': () => ({ rows: [], days: null }) } });
    env.DB.insert('settings', [{ key: 'engineMode', value: mode }]);
    for (const kind of ['team', 'limited', 'viewer']) {
      const token = asCaller(kind);
      for (const path of [`/pw/api/probe/one?act=${NORTH}`, `/pw/api/probe/one?act=${RIVER}`, '/pw/api/probe/many']) {
        const r = await call(env, 'POST', '/v1/compare', { token, body: { path } });
        assert.equal(r.status, 403, `${mode} ${kind} ${path}`);
        assert.deepEqual(Object.keys(r.json), ['error']);
        noOtherBrand(r.text);
      }
    }
    assert.equal(oldCalls(env).length, 0, 'an old worker was asked for a refused compare');
    assert.equal(env.DB.log.filter(sql => /p_inspo/.test(sql)).length, 0, 'the new handler ran for a refused compare');
  }
});

test('compare: the owner asking for a brand is held to that brand on the engine side', async () => {
  const env = env0({ old: { 'GET /api/probe/one': () => northRows } });
  const r = await call(env, 'POST', '/v1/compare', { token: asCaller('owner'), body: { path: `/pw/api/probe/one?act=${NORTH}` } });
  assert.equal(r.json.match, true);
  noOtherBrand(r.text);
});

test('compare: nobody is refused', async () => {
  const env = env0();
  assert.equal((await call(env, 'POST', '/v1/compare', { body: { path: '/pw/api/probe/one' } })).status, 401);
  assert.equal(oldCalls(env).length, 0);
});
