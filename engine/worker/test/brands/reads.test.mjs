/* The ported reads of the brands group: same shape as the samples, the same answer as the old code on
   the same rows at the same moment, and no leak to a client or a teammate with a brand list. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, asCaller, call, sameShape, assertNoLeak, NORTH, RIVER, RIVER_IDS } from '../../src/platform/testkit/index.mjs';
import { seedRows, setGoals } from './seed.mjs';
/* The old code, read only. The tests run it on the same made up rows to prove the port answers the same. */
import { handleStaff as oldBrandRoutes } from '../../../../profit/worker/src/brand.js';
import { listBrands as oldListBrands, KINDS as OLD_KINDS } from '../../../../account-health/worker/src/brands.js';

const sample = name => JSON.parse(readFileSync(new URL(`../../src/brands/samples/${name}.json`, import.meta.url), 'utf8'));
const plain = v => JSON.parse(JSON.stringify(v));
const noMeta = j => { const { meta, ...rest } = j; return rest; };

function world() {
  const env = makeEnv({ groups: ['brands'], rows: seedRows() });
  setGoals(env);
  return env;
}

async function oldProfit(env, path, query) {
  const url = new URL(`https://old.test${path}${query}`);
  const r = await oldBrandRoutes(new Request(url), { DB: env.DB, MEDIA: {} }, url, path, (o, s = 200) => ({ o, s }));
  return { status: r.s, json: plain(r.o) };
}

/* The old /api/accounts answer, with the old statements as they are. */
// from account-health/worker/src/worker.js (listAccounts, metaAvailable, GET /api/accounts)
function oldAccounts(env) {
  const parse = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
  const all = sql => env.DB.raw.prepare(sql).all().map(r => ({ ...r }));
  const stamp = env.DB.raw.prepare(`SELECT value FROM settings WHERE key = 'lastDiscover'`).get();
  return plain({
    accounts: all(`SELECT * FROM brand_accounts  ORDER BY active DESC, name`).map(a => ({ ...a, budgets: parse(a.budgets_json, {}), goals: parse(a.goals_json, {}) })),
    meta_available: all(`SELECT act_id, name, currency, tz, account_status FROM accounts
     WHERE act_id NOT IN (SELECT external_id FROM connections WHERE kind = 'meta') ORDER BY name`),
    lastDiscover: parse(stamp && stamp.value, null) });
}

for (const [path, name] of [['/ah/api/brands', 'brands'], ['/ah/api/accounts', 'accounts'],
  [`/pw/api/brand?act=${NORTH}`, 'brand'], [`/pw/api/brand/rules?act=${NORTH}`, 'brand-rules']]) {
  test(`GET ${path.split('?')[0]}: the answer has the shape of its sample`, async () => {
    const r = await call(world(), 'GET', path, { token: asCaller('owner') });
    assert.equal(r.status, 200);
    assert.equal(r.engine, 'new');
    assert.deepEqual(sameShape(r.json, sample(name)), []);
    assert.equal(r.json.meta.engine, 'new');
  });
}

test('GET /ah/api/brands: the same answer as the old code on the same rows', async () => {
  const env = world();
  const mine = await call(env, 'GET', '/ah/api/brands', { token: asCaller('owner') });
  assert.deepEqual(noMeta(mine.json), plain({ brands: await oldListBrands({ DB: env.DB }), kinds: OLD_KINDS }));
  assert.equal(mine.json.brands.length, 2);
  assert.ok(!('config_json' in mine.json.brands[0].connections[0]));
});

test('GET /ah/api/accounts: the same answer as the old code on the same rows', async () => {
  const env = world();
  const mine = await call(env, 'GET', '/ah/api/accounts', { token: asCaller('team') });
  assert.deepEqual(noMeta(mine.json), oldAccounts(env));
  assert.deepEqual(mine.json.meta_available.map(a => a.act_id), ['act_999']);
  assert.equal(mine.json.lastDiscover.found, 3);
});

test('GET /pw/api/brand and /pw/api/brand/rules: the same answer as the old code on the same rows', async () => {
  const env = world();
  for (const brand of [NORTH, RIVER]) {
    for (const path of ['/api/brand', '/api/brand/rules']) {
      const mine = await call(env, 'GET', `/pw${path}?act=${brand}`, { token: asCaller('owner') });
      const old = await oldProfit(env, path, `?act=${brand}`);
      assert.equal(mine.status, old.status);
      assert.deepEqual(noMeta(mine.json), old.json, `${path} for ${brand}`);
    }
  }
});

test('GET /pw/api/brand: tests join their ads by number and by tag, with the tracker revenue', async () => {
  const r = await call(world(), 'GET', `/pw/api/brand?act=${NORTH}`, { token: asCaller('owner') });
  const b = Object.fromEntries(r.json.batches.map(x => [x.num, x]));
  assert.deepEqual(r.json.batches.map(x => x.num), ['102', '101', '100']);
  assert.deepEqual(b['101'].ad_ids.sort(), ['nkad1', 'nkad2', 'nkad3']);
  assert.equal(b['101'].stats.spend, 178.75);
  assert.equal(b['101'].stats.rev, 275.5);
  assert.equal(b['101'].stats.orders, 5);
  assert.equal(b['101'].stats.cpa, 35.75);
  assert.equal(b['101'].box, 'call');
  assert.equal(b['100'].legacy.sheet_row, 4);
  assert.ok(!('legacy_json' in b['100']));
  assert.equal(b['102'].box, 'making');
  assert.equal(r.json.untagged.ads[0].ad_id, 'nkad4');
  assert.equal(r.json.next_num, '103');
  assert.equal(r.json.rules.test_cpa, 31);
});

test('GET /pw/api/brand: an old id for the brand answers as the brand, the old refusals keep their words', async () => {
  const env = world();
  const token = asCaller('owner');
  const viaOld = await call(env, 'GET', '/pw/api/brand/rules?act=act_111', { token });
  assert.equal(viaOld.status, 200);
  assert.equal(viaOld.json.goal_roas, 2.5);
  const none = await call(env, 'GET', '/pw/api/brand', { token });
  assert.deepEqual([none.status, none.json.error], [400, 'pick a brand first']);
  const all = await call(env, 'GET', '/pw/api/brand/rules?act=all', { token });
  assert.deepEqual([all.status, all.json.error], [400, 'pick a brand first']);
  const unknown = await call(env, 'GET', '/pw/api/brand?act=brand_nobody_home', { token });
  assert.deepEqual([unknown.status, unknown.json.error], [404, 'unknown account']);
  assert.deepEqual(await oldProfit(env, '/api/brand', '?act=brand_nobody_home'), { status: 404, json: { error: 'unknown account' } });
});

test('leak: a client reads its own brand only, on every ported read', async () => {
  for (const path of ['/ah/api/accounts', '/pw/api/brand', '/pw/api/brand/rules']) {
    const { mine } = await assertNoLeak(world(), 'GET', path);
    assert.equal(mine.status, 200, path);
    assert.ok(!mine.text.includes('rtad') && !mine.text.includes('River Tea'), `${path} holds a River Tea row`);
  }
});

test('leak: a client gets no scan stamp, no unclaimed ad account, no channel and no stored key', async () => {
  const env = world();
  const token = asCaller('client');
  const acc = await call(env, 'GET', '/ah/api/accounts', { token });
  assert.deepEqual(acc.json.accounts.map(a => a.act_id), [NORTH]);
  assert.ok(!('lastDiscover' in acc.json));
  assert.deepEqual(acc.json.meta_available, []);
  for (const key of ['slack_channel', 'brief_channel', 'internal_channel', 'client_channel', 'report_config_json', 'storage_prefix']) {
    assert.ok(!(key in acc.json.accounts[0]), `a client got ${key}`);
  }
  assert.ok(!/C0NORTH|C0RIVER/.test(acc.text));
  const page = await call(env, 'GET', `/pw/api/brand?act=${NORTH}`, { token });
  assert.equal(page.status, 200);
  assert.ok(!('klaviyo' in page.json.docs['']), 'a client got a stored key');
  assert.ok(!page.text.includes('stored-key'));
  assert.ok('profile' in page.json.docs[''] && 'rules' in page.json.docs['']);
  const team = await call(env, 'GET', `/pw/api/brand?act=${NORTH}`, { token: asCaller('team') });
  assert.ok('klaviyo' in team.json.docs[''], 'the team keeps the whole doc list');
});

test('leak: a teammate with a brand list gets those brands only', async () => {
  const env = world();
  const token = asCaller('limited');
  const brands = await call(env, 'GET', '/ah/api/brands', { token });
  assert.deepEqual(brands.json.brands.map(b => b.id), [NORTH]);
  const acc = await call(env, 'GET', '/ah/api/accounts', { token });
  assert.deepEqual(acc.json.accounts.map(a => a.act_id), [NORTH]);
  assert.deepEqual(acc.json.meta_available, []);
  for (const r of [brands, acc]) for (const id of RIVER_IDS) assert.ok(!r.text.includes(id), `the answer holds ${id}`);
  const other = await call(env, 'GET', `/pw/api/brand?act=${RIVER}`, { token });
  assert.equal(other.status, 403);
});
