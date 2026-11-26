/* Review fixes: the brand a request names is resolved first and only then checked, a removed person is
   nobody, the view only door lets a viewer set its own bell and prefs, a look and approve client may
   approve, and the server flag starts at old. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, asCaller, call, NORTH, RIVER, RIVER_AD_ACCOUNT } from '../src/platform/testkit/index.mjs';
import { seedRows, setGoals } from './brands/seed.mjs';

/* River Tea's old ad account is moved to North Kites: the connection row changes brand, River keeps the id
   as its legacy key and alias (a brand is known by every id it ever had). */
function moved() {
  const env = makeEnv({ groups: ['brands'], rows: seedRows() });
  setGoals(env);
  env.DB.raw.prepare(`UPDATE connections SET brand_id = ? WHERE external_id = ?`).run(NORTH, RIVER_AD_ACCOUNT);
  env.DB.raw.prepare(`UPDATE brands SET name = 'River Tea SECRET', target_roas = 9.99 WHERE id = ?`).run(RIVER);
  return env;
}

for (const kind of ['client', 'limited']) {
  test(`${kind}: the rules of the other brand through a moved ad account id are refused`, async () => {
    const env = moved();
    const r = await call(env, 'GET', `/pw/api/brand/rules?act=${RIVER_AD_ACCOUNT}`, { token: asCaller(kind) });
    assert.ok(r.status === 403 || r.json.goal_roas !== 9.99, 'the goal of the other brand was read');
    assert.equal(r.status, 403);
    const own = await call(env, 'GET', `/pw/api/brand/rules?act=${NORTH}`, { token: asCaller(kind) });
    assert.notEqual(own.status, 403);
  });
  test(`${kind}: the brand page of the other brand through a moved ad account id is refused`, async () => {
    const env = moved();
    const r = await call(env, 'GET', `/pw/api/brand?act=${RIVER_AD_ACCOUNT}`, { token: asCaller(kind) });
    assert.ok(r.status === 403 || !/River Tea SECRET|river/i.test(r.text), 'the other brand page was read');
  });
}

test('the owner still reads either brand by any id it had', async () => {
  const r = await call(moved(), 'GET', `/pw/api/brand/rules?act=${RIVER_AD_ACCOUNT}`, { token: asCaller('owner') });
  assert.notEqual(r.status, 403);
});

test('a person on removedEmails is nobody, the owner never is', async () => {
  const env = makeEnv({ groups: ['orgs'] });
  const team = asCaller('team'), owner = asCaller('owner');
  assert.equal((await call(env, 'GET', '/ah/api/me/prefs', { token: team })).status, 200);
  env.DB.insert('settings', [{ key: 'removedEmails', value: JSON.stringify(['TEAM@agency.test', 'owner@agency.test']) }]);
  assert.equal((await call(env, 'GET', '/ah/api/me/prefs', { token: team })).status, 401);
  assert.equal((await call(env, 'GET', '/ah/api/me/prefs', { token: owner })).status, 200);
});

test('GET /ah/api/team marks a removed person and says the screen may remove safely', async () => {
  const env = makeEnv({ groups: ['orgs'], old: { 'GET /api/team': () => ({ domain: 'agency.test', owner: 'owner@agency.test', members: [] }) } });
  env.DB.insert('settings', [{ key: 'removedEmails', value: JSON.stringify(['gone@agency.test', 'owner@agency.test']) }]);
  const r = await call(env, 'GET', '/ah/api/team', { token: asCaller('owner') });
  assert.equal(r.status, 200);
  assert.equal(r.json.safe_remove, true);
  assert.equal(r.json.needs_brands_for_guests, true);
  const by = Object.fromEntries(r.json.members.map(m => [m.email, m]));
  assert.equal(by['gone@agency.test'].removed, true);
  assert.equal(by['owner@agency.test'].removed, undefined);
});

test('a view only teammate may save its own prefs again, and nothing else', async () => {
  const env = makeEnv({ groups: ['orgs'] });
  const viewer = asCaller('viewer');
  const ok = await call(env, 'PUT', '/ah/api/me/prefs', { token: viewer, body: { morning_dm: true } });
  assert.equal(ok.status, 200);
  const no = await call(env, 'PUT', '/ah/api/settings', { token: viewer, body: { x: 1 } });
  assert.equal(no.status, 403);
});

test('the server flag is old when no engineMode row exists', async () => {
  const env = makeEnv();
  env.DB.raw.prepare(`DELETE FROM settings WHERE key = 'engineMode'`).run();
  const r = await call(env, 'GET', '/ah/api/me/prefs', { token: asCaller('owner') });
  assert.equal(r.engine, 'pipe');
  const h = await call(env, 'GET', '/v1/health');
  assert.equal(h.json.mode, 'old');
});

test('a look and approve client login (not pinned) may save its own prefs, and no other write', async () => {
  const env = makeEnv({ groups: ['orgs'] });
  const client = asCaller('client');
  assert.equal((await call(env, 'GET', '/ah/api/me/prefs', { token: client })).status, 200);
  env.DB.insert('settings', [{ key: 'clientUsers', value: JSON.stringify({ 'client@northkites.test': { brands: [NORTH], name: 'Client Person', readOnly: true } }) }]);
  const ok = await call(env, 'PUT', '/ah/api/me/prefs', { token: client, body: { morning_dm: true }, keep: true });
  assert.equal(ok.status, 200);
  const no = await call(env, 'PUT', `/pw/api/brand/rules?act=${NORTH}`, { token: client, body: { act: NORTH }, keep: true });
  assert.equal(no.status, 403);
});

test('GET /ah/api/reports says can_skip, to the team and to a client', async () => {
  const env = makeEnv({ groups: ['reports'] });
  const team = await call(env, 'GET', '/ah/api/reports', { token: asCaller('owner') });
  assert.equal(team.json.can_skip, true);
  const client = await call(env, 'GET', `/ah/api/reports?act=${NORTH}`, { token: asCaller('client') });
  assert.equal(client.json.can_skip, true);
});
