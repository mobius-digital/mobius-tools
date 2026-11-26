/* The data door: the brand filter comes from the scope, never from the caller. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register, door, compile, SYSTEM, SYSTEM_SCOPE } from '../src/platform/db.js';
import { makeEnv, asCaller, call, useGroup, NORTH, RIVER } from '../src/platform/testkit/index.mjs';
import { probe, SCHEMA, ROWS } from './probe.mjs';

useGroup(probe);
const env0 = () => makeEnv({ sql: SCHEMA, rows: ROWS });
const scopeNorth = { all: false, brand: NORTH, ids: [NORTH, 'act_111'], brand_ids: null };
const team = { kind: 'team', email: 'team@agency.test', view_only: false, brand_ids: null, ids: null };
const client = { kind: 'client', email: 'client@northkites.test', view_only: false, brand_ids: [NORTH], ids: new Set([NORTH, 'act_111']) };

test('a statement with no brand macro and no scope none cannot be registered', () => {
  assert.throws(() => register('bad', { q: { scope: 'brand', sql: 'SELECT 1 FROM t' } }), /no brand macro/);
});

test('scope none needs a why', () => {
  assert.throws(() => register('bad', { q: { scope: 'none', sql: 'SELECT 1' } }), /needs a why/);
});

test('a write must say it writes, and a table is never changed', () => {
  assert.throws(() => register('bad', { q: { scope: 'brand', sql: 'DELETE FROM t WHERE {{brand:act_id}}' } }), /write: true/);
  assert.throws(() => register('bad', { q: { scope: 'none', why: 'x', sql: 'DROP TABLE t' } }), /never changes a table/);
  assert.throws(() => register('bad', { q: { scope: 'none', why: 'x', write: true, sql: 'ALTER TABLE t ADD c' } }), /never changes a table/);
});

test('the brand macro is filled from the scope with every id of the brand', () => {
  const { sql, values } = compile({ name: 't', sql: 'SELECT * FROM t WHERE {{brand:act_id}} AND k = :k', pick: {} }, scopeNorth, { k: 'x' });
  assert.equal(sql, 'SELECT * FROM t WHERE act_id IN (?, ?) AND k = ?');
  assert.deepEqual(values, [NORTH, 'act_111', 'x']);
});

test('the one brand macro fails when no brand was named', () => {
  assert.throws(() => compile({ name: 't', sql: 'SELECT * FROM t WHERE {{brand:act_id}}' }, { all: true, brand: null, ids: [] }, {}), /Pick a brand/);
});

test('the many brands macro: all, some, none', () => {
  const q = { name: 't', sql: 'SELECT * FROM t WHERE {{brands:act_id}}' };
  assert.match(compile(q, { all: true, brand: null, ids: [] }, {}).sql, /WHERE 1=1$/);
  assert.match(compile(q, { all: false, brand: null, ids: ['a', 'b'] }, {}).sql, /act_id IN \(\?, \?\)$/);
  assert.match(compile(q, { all: false, brand: null, ids: [] }, {}).sql, /WHERE 1=0$/);
});

test('a value is always bound, never pasted in, and a colon inside quotes is left alone', () => {
  const q = { name: 't', sql: "SELECT * FROM t WHERE at > '12:00:00' AND name = :name AND id IN (:ids)" };
  const nasty = "x' OR 1=1 --";
  const { sql, values } = compile(q, SYSTEM_SCOPE, { name: nasty, ids: ['a', 'b', 'c'] });
  assert.equal(sql, "SELECT * FROM t WHERE at > '12:00:00' AND name = ? AND id IN (?, ?, ?)");
  assert.deepEqual(values, [nasty, 'a', 'b', 'c']);
});

test('a sort comes from the fixed pick map, anything else is refused', () => {
  const q = { name: 't', sql: 'SELECT * FROM t ORDER BY {{pick:order}}', pick: { order: { id: 'id', title: 'title DESC' } } };
  assert.match(compile(q, SYSTEM_SCOPE, { order: 'title' }).sql, /ORDER BY title DESC$/);
  assert.throws(() => compile(q, SYSTEM_SCOPE, { order: 'id; DROP TABLE t' }), /unknown order/);
});

test('a missing value is an error, not a silent null', () => {
  assert.throws(() => compile({ name: 't', sql: 'SELECT :a' }, SYSTEM_SCOPE, {}), /no value for :a/);
});

test('a group may only run its own statements and the kernel ones', async () => {
  const db = door(env0(), scopeNorth, {}, 'DB', { domain: 'store', caller: team });
  await assert.rejects(() => db.all('probe.one'), /may not run probe.one/);
  assert.deepEqual(await db.one('platform.settingGet', { key: 'nothing' }), null);
});

test('only the kernel has a system door', async () => {
  const db = door(env0(), SYSTEM_SCOPE, {}, 'DB', { ...SYSTEM, domain: 'probe' });
  await assert.rejects(() => db.all('probe.unfiltered'), /only the kernel/);
});

test('a client cannot run a scope none statement, unless it is held to its own email', async () => {
  const db = door(env0(), scopeNorth, {}, 'DB', { domain: 'probe', caller: client });
  await assert.rejects(() => db.all('probe.unfiltered'), e => e.status === 403);
  await assert.rejects(() => db.one('probe.mine', { email: 'someone@else.test' }), e => e.status === 403);
  assert.equal(await db.one('probe.mine', { email: client.email }), null);
});

test('a view only caller never reaches a write', async () => {
  const db = door(env0(), scopeNorth, {}, 'DB', { domain: 'probe', caller: { ...team, view_only: true } });
  await assert.rejects(() => db.run('probe.rename', { id: 'n1', title: 'x' }), e => e.status === 403);
});

test('nobody reaches no statement on a row that is not public', async () => {
  const db = door(env0(), scopeNorth, {}, 'DB', { domain: 'probe', caller: { kind: 'nobody' } });
  await assert.rejects(() => db.all('probe.one'), e => e.status === 401);
});

test('a request has a budget of 40 statements', async () => {
  const counters = {};
  const db = door(env0(), scopeNorth, counters, 'DB', { domain: 'probe', caller: team });
  for (let i = 0; i < 40; i++) await db.all('probe.one');
  await assert.rejects(() => db.all('probe.one'), e => e.code === 'db_budget');
});

test('a write lands on the named brand only, and the other brand is untouched', async () => {
  const env = env0();
  const before = env.DB.rows('p_inspo', `act_id = '${RIVER}'`);
  const token = asCaller('team');
  const hit = await call(env, 'PUT', `/pw/api/probe/item?act=${NORTH}`, { token, body: { id: 'n1', title: 'renamed' } });
  assert.equal(hit.json.changes, 1);
  const miss = await call(env, 'PUT', `/pw/api/probe/item?act=${NORTH}`, { token, body: { id: 'r1', title: 'stolen' } });
  assert.equal(miss.json.changes, 0);
  assert.deepEqual(env.DB.rows('p_inspo', `act_id = '${RIVER}'`), before);
  const add = await call(env, 'POST', '/pw/api/probe/item?act=act_111', { token, body: { id: 'n9', title: 'new' } });
  assert.equal(add.status, 200);
  assert.equal(env.DB.rows('p_inspo', "id = 'n9'")[0].act_id, NORTH);
});

test('batch runs every statement through the same door', async () => {
  const db = door(env0(), scopeNorth, {}, 'DB', { domain: 'probe', caller: team });
  const out = await db.batch([['probe.rename', { id: 'n1', title: 'a' }], ['probe.one', {}]]);
  assert.equal(out[0].changes, 1);
  assert.equal(out[1].length, 2);
});
