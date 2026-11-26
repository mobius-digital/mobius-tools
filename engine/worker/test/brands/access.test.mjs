/* Access rules for every brands row: nobody, client, limited teammate, view only, and the forwards. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genAccessTests, makeEnv, asCaller, call, NORTH } from '../../src/platform/testkit/index.mjs';
import { routes } from '../../src/brands/routes.js';

genAccessTests(routes, { groups: ['brands'] });

test('brands: every path of the group has a row, ported or forwarded with a reason', () => {
  const want = ['GET /ah/api/brands', 'GET /ah/api/accounts', 'PUT /ah/api/accounts/:id', 'GET /pw/api/brand', 'GET /pw/api/brand/rules',
    'PUT /pw/api/brand/rules', 'GET /pw/api/costs', 'PUT /pw/api/costs', 'DELETE /pw/api/costs', 'GET /pw/api/costs/sheet',
    'POST /pw/api/costs/sheet', 'GET /pw/api/expenses', 'PUT /pw/api/expenses', 'GET /ah/api/integrations',
    'GET /ah/api/tiktok/status', 'POST /ah/api/tiktok/start'];
  assert.deepEqual(routes.map(r => `${r.method} ${r.path}`).sort(), want.sort());
  for (const r of routes) {
    assert.ok(r.doc && r.doc.length > 20, `${r.path} needs a doc line`);
    if (r.handler === 'forward') assert.ok(r.source.why, `${r.path} is forwarded and needs a why`);
  }
});

test('brands: a forwarded write reaches the old worker with its body unchanged', async () => {
  const env = makeEnv({ groups: ['brands'] });
  const body = { act: NORTH, items: [{ name: 'Rent', kind: 'monthly', amount: 1200, start_date: '2026-01-01' }] };
  const r = await call(env, 'PUT', '/pw/api/expenses', { token: asCaller('team'), body });
  const sent = env.calls.filter(c => c.path !== '/api/me').pop();
  assert.equal(r.engine, 'forward');
  assert.equal(sent.worker, 'pw');
  assert.equal(sent.path, '/api/expenses');
  assert.deepEqual(JSON.parse(sent.body), body);
});

test('brands: a client may not read the team only rows', async () => {
  const env = makeEnv({ groups: ['brands'] });
  const token = asCaller('client');
  for (const [method, path] of [['GET', '/ah/api/brands'], ['GET', '/ah/api/tiktok/status'], ['POST', '/ah/api/tiktok/start'], ['GET', '/pw/api/costs/sheet']]) {
    const r = await call(env, method, path, { token, body: method === 'GET' ? undefined : {} });
    assert.equal(r.status, 403, `${method} ${path}`);
  }
  assert.equal(env.calls.filter(c => c.path !== '/api/me').length, 0, 'a refused request must not reach the old worker');
});
