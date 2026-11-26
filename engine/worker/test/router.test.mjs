/* The request path: the flag, the table, forwarding, the fallback, meta, compare and the kernel routes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, asCaller, call, useGroup, sameShape, NORTH, RIVER } from '../src/platform/testkit/index.mjs';
import { buildTable } from '../src/platform/table.js';
import { differences } from '../src/platform/compare.js';
import { handle } from '../src/platform/router.js';
import { probe, SCHEMA, ROWS } from './probe.mjs';

useGroup(probe);
const opts = { sql: SCHEMA, rows: ROWS };
const env0 = (more = {}) => makeEnv({ ...opts, ...more });
const lastOld = env => env.calls.filter(c => c.path !== '/api/me').pop();

test('health is public and says the mode', async () => {
  const r = await call(env0(), 'GET', '/v1/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.mode, 'new');
  assert.ok(r.json.routes > 5);
});

test('preflight answers with the headers the old workers send', async () => {
  const res = await handle(new Request('https://engine.test/pw/api/probe/one', { method: 'OPTIONS' }), env0(), {});
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(res.headers.get('Access-Control-Allow-Headers'), 'Authorization, Content-Type');
});

test('a ported answer keeps its shape and gains meta', async () => {
  const r = await call(env0(), 'GET', `/pw/api/probe/one?act=${NORTH}`, { token: asCaller('team') });
  assert.equal(r.engine, 'new');
  assert.equal(r.json.meta.engine, 'new');
  assert.deepEqual(sameShape(r.json, { rows: [{ id: '', act_id: '', title: '', slack_channel: '', notes_internal: '' }] }), []);
});

test('a handler may fill the meta source and window', async () => {
  const r = await call(env0(), 'GET', '/pw/api/probe/later', { token: asCaller('team') });
  assert.equal(r.json.ok, true);
  assert.equal(r.json.meta.source, 'test');
  assert.deepEqual(r.json.meta.window, { from: '2026-01-01', to: '2026-01-07', tz: 'UTC' });
});

test('a forwarded row goes to its old worker as the same person, body and all', async () => {
  const env = env0(), token = asCaller('team');
  const r = await call(env, 'POST', '/ah/api/probe/fwd?x=1', { token, body: { hello: 'there' } });
  assert.ok(r.forwarded);
  const sent = lastOld(env);
  assert.deepEqual([sent.worker, sent.method, sent.path, sent.search, sent.token], ['ah', 'POST', '/api/probe/fwd', '?x=1', token]);
  assert.deepEqual(JSON.parse(sent.body), { hello: 'there' });
});

test('a forwarded row still checks who is asking first', async () => {
  const env = env0();
  assert.equal((await call(env, 'GET', '/pw/api/probe/fwd')).status, 401);
  assert.equal((await call(env, 'GET', `/pw/api/probe/fwd?act=${RIVER}`, { token: asCaller('client') })).status, 403);
  assert.equal(lastOld(env), undefined);
});

test('a handler can forward one request at run time', async () => {
  const env = env0();
  const r = await call(env, 'GET', '/pw/api/probe/later?live=1', { token: asCaller('team') });
  assert.equal(r.engine, 'forward');
  assert.equal(env.logs.pop().forwarded, 'a live read');
});

test('a ported read that breaks falls back to the old worker and says so in the log', async () => {
  const env = env0();
  const r = await call(env, 'GET', '/pw/api/probe/boom', { token: asCaller('team') });
  assert.equal(r.status, 200);
  assert.equal(r.engine, 'fallback');
  assert.ok(r.forwarded);
  assert.match(env.logs.pop().fell_back, /a bug in a handler/);
});

test('a write that breaks does not fall back', async () => {
  const env = env0();
  const r = await call(env, 'PUT', '/pw/api/probe/boom', { token: asCaller('team'), body: {} });
  assert.equal(r.status, 500);
  assert.equal(lastOld(env), undefined);
});

test('an error a handler raises keeps the old shape and status', async () => {
  const r = await call(env0(), 'GET', '/pw/api/probe/gone', { token: asCaller('team') });
  assert.equal(r.status, 404);
  assert.deepEqual(r.json, { error: 'unknown account' });
});

test('a path with no row is piped to the old worker untouched and logged as unlisted', async () => {
  const env = env0();
  const r = await call(env, 'POST', '/ah/api/not-listed?z=9', { token: 'tok_anything_at_all', body: { a: 1 } });
  assert.equal(r.engine, 'pipe');
  const sent = lastOld(env);
  assert.deepEqual([sent.worker, sent.path, sent.search, sent.body], ['ah', '/api/not-listed', '?z=9', '{"a":1}']);
  assert.equal(env.logs.pop().why, 'unlisted');
});

test('a path outside /pw, /ah and /v1 is 404', async () => {
  assert.equal((await call(env0(), 'GET', '/api/probe/one')).status, 404);
});

test('the one flag: mode old pipes everything, and the switch itself still answers', async () => {
  const env = env0(), owner = asCaller('owner');
  const put = await call(env, 'PUT', '/v1/engine', { token: owner, body: { mode: 'old' } });
  assert.equal(put.json.mode, 'old');
  const r = await call(env, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token: owner });
  assert.equal(r.engine, 'pipe');
  assert.equal(lastOld(env).path, '/api/probe/one');
  const back = await call(env, 'PUT', '/v1/engine', { token: owner, body: { mode: 'new' } });
  assert.equal(back.json.mode, 'new');
  assert.equal((await call(env, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token: owner })).engine, 'new');
});

test('the flag can be set by hand in the settings table', async () => {
  const env = env0();
  env.DB.insert('settings', [{ key: 'engineMode', value: 'old' }]);
  assert.equal((await call(env, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token: asCaller('owner') })).engine, 'pipe');
});

test('one route can be sent back on its own', async () => {
  const env = env0(), owner = asCaller('owner');
  await call(env, 'PUT', '/v1/engine', { token: owner, body: { forward: ['GET /pw/api/probe/one'] } });
  assert.equal((await call(env, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token: owner })).engine, 'pipe');
  assert.equal((await call(env, 'GET', '/pw/api/probe/many', { token: owner })).engine, 'new');
});

test('only the owner may flip the switch', async () => {
  const env = env0();
  assert.equal((await call(env, 'PUT', '/v1/engine', { token: asCaller('team'), body: { mode: 'old' } })).status, 403);
  assert.equal((await call(env, 'PUT', '/v1/engine', { token: asCaller('client'), body: { mode: 'old' } })).status, 403);
  assert.equal((await call(env, 'GET', '/v1/engine', { token: asCaller('owner') })).json.mode, 'new');
});

test('input: a needed value missing is 400, an unknown body key is refused, a bad optional query value is left out', async () => {
  const env = env0(), token = asCaller('team');
  assert.equal((await call(env, 'PUT', `/pw/api/probe/item?act=${NORTH}`, { token, body: { id: 'n1' } })).status, 400);
  assert.equal((await call(env, 'PUT', `/pw/api/probe/item?act=${NORTH}`, { token, body: { id: 'n1', title: 't', extra: 1 } })).status, 400);
  const r = await call(env, 'GET', '/pw/api/probe/many?days=abc&order=title', { token });
  assert.equal(r.json.days, null);
  assert.equal(r.json.rows[0].title, 'river one');
  assert.equal((await call(env, 'GET', '/pw/api/probe/many?order=nope', { token })).status, 400);
});

test('a borrowed field comes from one old GET as the caller', async () => {
  const env = env0({ old: { 'GET /api/settings': () => ({ chat_connected: true, other: 'not taken' }) } });
  const token = asCaller('team');
  const r = await call(env, 'GET', '/pw/api/probe/borrow', { token });
  assert.equal(r.json.connected, true);
  assert.equal(lastOld(env).token, token);
});

test('the route list names every row, and a row that is not complete stops the build', async () => {
  const r = await call(env0(), 'GET', '/v1/routes', { token: asCaller('owner') });
  assert.ok(r.json.routes.some(x => x.path === '/pw/api/probe/fwd' && x.engine === 'forward' && x.why));
  assert.ok(r.json.routes.every(x => x.doc && x.who));
  const row = { method: 'GET', path: '/pw/api/x', access: { team: true }, handler: () => ({}), doc: 'A fine doc line.', source: { old: 'pw', file: 'f.js' } };
  const build = more => () => buildTable([{ name: 'probe', routes: [{ ...row, ...more }] }]);
  assert.throws(build({ doc: '' }), /needs a doc line/);
  assert.throws(build({ access: undefined }), /needs access/);
  assert.throws(build({ handler: 'forward' }), /needs source.why|go together/);
  assert.throws(build({ path: '/v1/x' }), /only the kernel/);
  assert.throws(build({ input: { query: { n: 'integer' } } }), /unknown input type/);
  assert.throws(build({ access: { own: [{ in: 'body', key: 'id', table: 'some_table' }] } }), /OWN_TABLES/);
  assert.throws(() => buildTable([{ name: 'probe', routes: [row, row] }]), /listed twice/);
});

test('compare: the same answer is a match, a different one lists where', async () => {
  const same = { rows: [{ id: 'n1', act_id: NORTH, title: 'north one', slack_channel: 'C0NORTH0001', notes_internal: 'team only' },
    { id: 'n2', act_id: 'act_111', title: 'north old id', slack_channel: null, notes_internal: null }] };
  const env = env0({ old: { 'GET /api/probe/one': () => same } });
  const token = asCaller('owner');
  const r = await call(env, 'POST', '/v1/compare', { token, body: { path: `/pw/api/probe/one?act=${NORTH}` } });
  assert.equal(r.json.match, true, JSON.stringify(r.json));
  const env2 = env0({ old: { 'GET /api/probe/one': () => ({ rows: [{ ...same.rows[0], title: 'changed' }], extra: 1 }) } });
  const r2 = await call(env2, 'POST', '/v1/compare', { token, body: { path: `/pw/api/probe/one?act=${NORTH}` } });
  assert.equal(r2.json.match, false);
  const where = r2.json.differences.map(d => d.at);
  assert.ok(where.includes('rows.length') && where.includes('rows[0].title') && where.includes('extra'));
});

test('compare says so when a route is forwarded, and refuses a client', async () => {
  const env = env0();
  const r = await call(env, 'POST', '/v1/compare', { token: asCaller('owner'), body: { path: '/pw/api/probe/fwd' } });
  assert.equal(r.json.engine, 'forward');
  assert.equal((await call(env, 'POST', '/v1/compare', { token: asCaller('client'), body: { path: '/pw/api/probe/one' } })).status, 403);
});

test('differences: close numbers match, meta and ignored keys are skipped, null against missing is a difference', () => {
  assert.deepEqual(differences({ a: 0.1 + 0.2, meta: 1, t: 5 }, { a: 0.3, t: 9 }, new Set(['t'])), []);
  assert.equal(differences({ a: null }, {}).length, 1);
  assert.equal(differences({ a: 1 }, { a: '1' }).length, 1);
});

test('number definitions are served, to a client too', async () => {
  const r = await call(env0(), 'GET', '/v1/metrics/definitions', { token: asCaller('client') });
  assert.equal(r.status, 200);
  assert.ok(r.json.definitions.some(d => d.id === 'mer' && d.definition && d.formula && d.source && d.unit));
});

test('compare: a handler that broke is not a match, and says the old engine answered', async () => {
  const r = await call(env0(), 'POST', '/v1/compare', { token: asCaller('owner'), body: { path: '/pw/api/probe/boom' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.match, false);
  assert.equal(r.json.engine, 'fallback');
  assert.match(r.json.note, /handler broke and the old engine answered: a bug in a handler/);
});

test('compare: a hand off the handler meant is still a match', async () => {
  const r = await call(env0(), 'POST', '/v1/compare', { token: asCaller('owner'), body: { path: '/pw/api/probe/later?live=1' } });
  assert.equal(r.json.match, true);
  assert.equal(r.json.engine, 'forward');
});

test('the engine pages are for the owner alone: a teammate gets 403 on each', async () => {
  const env = env0();
  for (const kind of ['team', 'limited', 'viewer']) {
    const token = asCaller(kind);
    assert.equal((await call(env, 'GET', '/v1/routes', { token })).status, 403, kind + ' routes');
    assert.equal((await call(env, 'GET', '/v1/engine', { token })).status, 403, kind + ' engine');
    assert.equal((await call(env, 'POST', '/v1/compare', { token, body: { path: `/pw/api/probe/one?act=${NORTH}` } })).status, 403, kind + ' compare');
  }
  assert.equal((await call(env, 'GET', '/v1/routes', { token: asCaller('client') })).status, 403);
  assert.equal((await call(env, 'GET', '/v1/routes')).status, 401);
});

test('in mode old a teammate cannot run the new code through compare', async () => {
  const env = env0();
  await call(env, 'PUT', '/v1/engine', { token: asCaller('owner'), body: { mode: 'old' } });
  const token = asCaller('limited');
  assert.equal((await call(env, 'GET', `/pw/api/probe/one?act=${NORTH}`, { token })).engine, 'pipe');
  const r = await call(env, 'POST', '/v1/compare', { token, body: { path: `/pw/api/probe/one?act=${NORTH}` } });
  assert.equal(r.status, 403);
  assert.equal(r.json.new_status, undefined);
});
