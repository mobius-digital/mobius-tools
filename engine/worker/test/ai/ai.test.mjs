/* Group ai, offline tests: the access rules of every row, the shape of every ported read against its made up
   sample, a leak test for a client login, and for each write that its rows landed and no other row moved.
   Run: node --test "engine/worker/test/ai/*.test.mjs" */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, asCaller, call, sameShape, genAccessTests, assertNoLeak, NORTH, RIVER, RIVER_IDS } from '../../src/platform/testkit/index.mjs';
import { routes } from '../../src/ai/routes.js';

const SAMPLES = JSON.parse(readFileSync(new URL('../../src/ai/samples/all.json', import.meta.url), 'utf8'));
const ADDRESS = 'https://old-ah.test/ai/mcp';
const old = { 'GET /api/connect-ai': () => ({ address: ADDRESS, on: true }) };
const ON = { key: 'connectAi', value: '1' };
const FAR = '2999-01-01T00:00:00.000Z', PAST = '2001-01-01T00:00:00.000Z';
const TEAM = 'team@agency.test', CLIENT = 'client@northkites.test', OWNER = 'owner@agency.test';

const key = (id, email, more = {}) => ({ id, key_hash: `hash_${id}`, prefix: 'lk_abcd', email, role: 'team', brands_json: '"all"', label: 'One',
  created_at: '2030-01-01T00:00:00.000Z', expires_at: FAR, ...more });
const card = (id, act_id, more = {}) => ({ id, act_id, kind: 'pause', title: `Card ${id}`, why: 'Made up reason.', level: 'ad', object_id: '1200000001',
  status: 'waiting', by_email: TEAM, by_key: 'aik_1', created_at: `2030-01-02T00:00:0${id.slice(-1)}.000Z`, expires_at: FAR, audience: 'team', ...more });
const run = (id, more = {}) => ({ id, at: new Date(Date.now() - 3600e3).toISOString(), surface: 'web', who: TEAM, brand: null, question: 'How did we do?',
  model: 'm', effort: 'medium', in_tok: 100, cache_read: 0, cache_write: 0, out_tok: 20, cost: 0.25, steps: 2, ms: 2500, stopped: 0, error: null, ...more });
const envWith = (rows = {}, more = {}) => makeEnv({ groups: ['ai'], old, rows: { settings: [ON], ...rows }, ...more });
const get = (env, path, kind = 'team') => call(env, 'GET', `/ah/api/${path}`, { token: asCaller(kind) });
const shape = (r, name) => assert.deepEqual(sameShape(r.json, SAMPLES[name]), []);

genAccessTests(routes, { groups: ['ai'], old, rows: { settings: [ON] } });

test('connect-ai: the old shape, with the address borrowed from the old worker', async () => {
  const env = envWith();
  const r = await get(env, 'connect-ai');
  assert.equal(r.status, 200);
  shape(r, 'connect-ai');
  assert.equal(r.json.address, ADDRESS);
  assert.deepEqual(r.json.you, { email: TEAM, role: 'team' });
  assert.equal(r.json.can_switch, false);
  assert.equal((await get(env, 'connect-ai', 'owner')).json.can_switch, true);
});

test('connect-ai: a client login may read it, a view only teammate cannot act, limits come from settings', async () => {
  const env = envWith({ settings: [ON, { key: 'connectAiApply', value: 'on' }, { key: 'connectAiLimits', value: '{"perMin":5}' }] });
  const c = await get(env, 'connect-ai', 'client');
  assert.equal(c.status, 200);
  assert.equal(c.json.you.role, 'client');
  assert.equal(c.json.applies_on_yes, true);
  assert.deepEqual(c.json.limits, { perMin: 5, perDay: 1500, proposalsPerDay: 30 });
  assert.equal((await get(env, 'connect-ai', 'viewer')).json.can_act, false);
});

test('connect-ai: off means applies_on_yes is false and the lists are empty', async () => {
  const env = makeEnv({ groups: ['ai'], old, rows: { settings: [{ key: 'connectAiApply', value: '1' }], p_ai_key: [key('aik_1', TEAM)] } });
  const s = await get(env, 'connect-ai');
  assert.equal(s.json.on, false);
  assert.equal(s.json.applies_on_yes, false);
  assert.deepEqual((await get(env, 'connect-ai/keys')).json.keys, []);
  assert.deepEqual((await get(env, 'connect-ai/calls')).json.calls, []);
  const p = await get(env, 'connect-ai/proposals');
  assert.deepEqual([p.json.on, p.json.proposals, p.json.can_act], [false, [], true]);
});

test('connect-ai: a sign in with no email of its own gets 401 with the old words', async () => {
  const env = makeEnv({ groups: ['ai'], rows: { settings: [ON] }, old: { ...old, 'GET /api/me': () => ({ master: true, role: 'owner' }) } });
  const r = await call(env, 'GET', '/ah/api/connect-ai', { token: 'tok_master_key' });
  assert.equal(r.status, 401);
  assert.equal(r.json.error, 'Sign in as yourself to connect your AI.');
});

test('keys: my own keys only, the owner may ask for everyone, a teammate may not', async () => {
  const rows = { p_ai_key: [key('aik_1', TEAM), key('aik_2', OWNER, { revoked_at: '2030-01-05T00:00:00.000Z' }), key('aik_3', CLIENT, { expires_at: PAST })] };
  const env = envWith(rows);
  const mine = await get(env, 'connect-ai/keys');
  shape(mine, 'connect-ai/keys');
  assert.deepEqual(mine.json.keys.map(k => k.id), ['aik_1']);
  assert.ok(!mine.text.includes('hash_'), 'a key hash went out');
  assert.deepEqual((await get(env, 'connect-ai/keys?all=1')).json.keys.map(k => k.id), ['aik_1']);
  const all = await get(env, 'connect-ai/keys?all=1', 'owner');
  assert.deepEqual(all.json.keys.map(k => `${k.id}:${k.state}`).sort(), ['aik_1:live', 'aik_2:revoked', 'aik_3:expired']);
  const client = await get(env, 'connect-ai/keys?all=1', 'client');
  assert.deepEqual(client.json.keys.map(k => k.id), ['aik_3']);
});

test('calls: my own calls only, in the old shape', async () => {
  const calls = [{ key_id: 'aik_1', email: TEAM, tool: 'list_brands', act_id: NORTH, at: '2030-01-02T00:00:00.000Z', ok: 1 },
    { key_id: 'aik_2', email: OWNER, tool: 'top_ads', act_id: RIVER, at: '2030-01-02T00:00:01.000Z', ok: 0, note: 'made up' },
    { key_id: 'aik_3', email: CLIENT, tool: 'get_numbers', act_id: NORTH, at: '2030-01-02T00:00:02.000Z', ok: 1 }];
  const env = envWith({ p_ai_call: calls });
  const mine = await get(env, 'connect-ai/calls');
  shape(mine, 'connect-ai/calls');
  assert.deepEqual(mine.json.calls.map(c => [c.key_id, c.brand_id, c.ok]), [['aik_1', NORTH, true]]);
  assert.equal((await get(env, 'connect-ai/calls?all=1', 'owner')).json.calls.length, 3);
  const client = await get(env, 'connect-ai/calls?all=1', 'client');
  assert.deepEqual(client.json.calls.map(c => c.key_id), ['aik_3']);
  assert.deepEqual(client.json.calls.map(c => c.brand_id), [NORTH], 'a client keeps brand_id on its rows');
  for (const id of RIVER_IDS) assert.ok(!client.text.includes(id));
});

test('make a key: the row lands with a hash, never the key, and the answer has the old shape', async () => {
  const env = envWith({ p_ai_key: [key('aik_9', OWNER)] });
  const r = await call(env, 'POST', '/ah/api/connect-ai/keys', { token: asCaller('team'), body: { label: ' Desk\u0007 AI ', days: 'x' } });
  assert.equal(r.status, 200);
  assert.match(r.json.key, /^lk_[A-Za-z0-9_-]{24,80}$/);
  assert.equal(r.json.personal_address, `${ADDRESS}/${r.json.key}`);
  assert.deepEqual([r.json.label, r.json.brands, r.json.state, r.json.role, r.json.email], ['Desk  AI', 'all', 'live', 'team', TEAM]);
  const rows = env.DB.rows('p_ai_key');
  assert.equal(rows.length, 2);
  const made = rows.find(x => x.id === r.json.id);
  assert.match(made.key_hash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(rows).includes(r.json.key), 'the key itself was stored');
  assert.equal(Math.round((Date.parse(made.expires_at) - Date.parse(made.created_at)) / 86400e3), 90);
  assert.deepEqual(rows.find(x => x.id === 'aik_9'), env.DB.rows('p_ai_key', "id = 'aik_9'")[0]);
});

test('make a key: a client key carries only its own brands, and cannot name another brand', async () => {
  const env = envWith();
  const token = asCaller('client');
  const ok = await call(env, 'POST', '/ah/api/connect-ai/keys', { token, body: { days: 7 } });
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.json.brands, ok.json.role], [[NORTH], 'client']);
  const bad = await call(env, 'POST', '/ah/api/connect-ai/keys', { token, body: { brands: [RIVER] } });
  assert.equal(bad.status, 403);
  assert.equal(bad.json.error, 'One of those brands is not yours.');
  assert.equal(env.DB.rows('p_ai_key').length, 1);
  const limited = await call(env, 'POST', '/ah/api/connect-ai/keys', { token: asCaller('limited'), body: {} });
  assert.deepEqual(limited.json.brands, [NORTH]);
});

test('make a key: refused when it is off, and at five working keys', async () => {
  const off = makeEnv({ groups: ['ai'], old });
  const r = await call(off, 'POST', '/ah/api/connect-ai/keys', { token: asCaller('team'), body: {} });
  assert.deepEqual([r.status, r.json.error], [403, 'Connecting your own AI is not switched on yet.']);
  const full = envWith({ p_ai_key: [1, 2, 3, 4, 5].map(i => key(`aik_${i}`, TEAM)) });
  const f = await call(full, 'POST', '/ah/api/connect-ai/keys', { token: asCaller('team'), body: {} });
  assert.deepEqual([f.status, f.json.error], [409, 'You already have 5 working keys. Turn one off first.']);
  assert.equal(full.DB.rows('p_ai_key').length, 5);
});

test('make a key: when the key table is not there yet, the old worker gets the request', async () => {
  const env = makeEnv({ old, rows: { settings: [ON] } });
  const r = await call(env, 'POST', '/ah/api/connect-ai/keys', { token: asCaller('team'), body: { label: 'One' } });
  assert.equal(r.engine, 'forward');
  const sent = env.calls.filter(x => x.method === 'POST').pop();
  assert.deepEqual([sent.path, sent.body], ['/api/connect-ai/keys', '{"label":"One"}']);
});

test('turn a key off: my own key, not another person\'s, and the owner may turn off any', async () => {
  const env = envWith({ p_ai_key: [key('aik_1', TEAM), key('aik_2', OWNER), key('aik_3', CLIENT)] });
  const post = (kind, id) => call(env, 'POST', '/ah/api/connect-ai/keys/revoke', { token: asCaller(kind), body: { id } });
  const other = await post('team', 'aik_2');
  assert.deepEqual([other.status, other.json.error], [404, 'No key with that id.']);
  assert.equal((await post('client', 'aik_1')).status, 404);
  assert.ok(env.DB.rows('p_ai_key').every(k => !k.revoked_at), 'a key of another person was turned off');
  const mine = await post('team', 'aik_1');
  assert.deepEqual([mine.status, mine.json.ok, mine.json.id, mine.json.state], [200, true, 'aik_1', 'revoked']);
  assert.equal((await post('owner', 'aik_3')).status, 200);
  const state = Object.fromEntries(env.DB.rows('p_ai_key').map(k => [k.id, !!k.revoked_at]));
  assert.deepEqual(state, { aik_1: true, aik_2: false, aik_3: true });
  const stamp = env.DB.rows('p_ai_key', "id = 'aik_1'")[0].revoked_at;
  await post('team', 'aik_1');
  assert.equal(env.DB.rows('p_ai_key', "id = 'aik_1'")[0].revoked_at, stamp);
});

const CARDS = [card('aip_1', NORTH), card('aip_2', NORTH, { audience: 'client', by_email: CLIENT }), card('aip_3', RIVER),
  card('aip_4', NORTH, { expires_at: PAST }), card('aip_5', NORTH, { status: 'declined' }), card('aip_6', RIVER, { audience: 'client' })];

test('cards: the team sees the waiting cards of its brands, in the old shape, without writing', async () => {
  const env = envWith({ p_ai_proposal: CARDS });
  const r = await get(env, 'connect-ai/proposals');
  shape(r, 'connect-ai/proposals');
  assert.deepEqual(r.json.proposals.map(p => p.id), ['aip_6', 'aip_3', 'aip_2', 'aip_1']);
  const one = await get(env, `connect-ai/proposals?act=${NORTH}&all=1`);
  assert.deepEqual(one.json.proposals.map(p => `${p.id}:${p.status}`), ['aip_5:declined', 'aip_4:expired', 'aip_2:waiting', 'aip_1:waiting']);
  assert.equal(env.DB.rows('p_ai_proposal', "id = 'aip_4'")[0].status, 'waiting');
  const limited = await get(env, 'connect-ai/proposals', 'limited');
  assert.deepEqual(limited.json.proposals.map(p => p.id), ['aip_2', 'aip_1']);
  assert.deepEqual(limited.json.proposals.map(p => p.brand_id), [NORTH, NORTH], 'a teammate with a brand list keeps brand_id');
  const unknown = await get(env, 'connect-ai/proposals?act=brand_no_such');
  assert.deepEqual([unknown.status, unknown.json.error], [403, 'You do not have access to that brand.']);
});

test('cards: a client login sees only its own side\'s cards on its own brand, and nothing of the other brand', async () => {
  const env = envWith({ p_ai_proposal: CARDS });
  const { mine, none } = await assertNoLeak(env, 'GET', '/ah/api/connect-ai/proposals');
  assert.deepEqual(mine.json.proposals.map(p => p.id), ['aip_2']);
  assert.deepEqual(mine.json.proposals.map(p => p.brand_id), [NORTH], 'a client keeps brand_id on its rows');
  assert.deepEqual(none.json.proposals.map(p => p.id), ['aip_2']);
  assert.equal(mine.json.you.role, 'client');
  const all = await get(env, 'connect-ai/proposals?all=1', 'client');
  assert.deepEqual(all.json.proposals.map(p => p.id), ['aip_2']);
});

test('lookups: off without a share, on with the share of the last 30 days', async () => {
  const off = await get(envWith(), 'lookups');
  assert.deepEqual([off.json.on, off.json.mode, 'share' in off.json, off.json.lookups.length], [false, 'off', false, 25]);
  assert.deepEqual(off.json.lookups.find(l => l.id === 'brand_goal'),
    { id: 'brand_goal', title: 'The goals set for the brand', example: 'What is the goal ROAS?', needs_dates: false, page: { line: 'brand-settings', tab: 'goals' } });
  const runs = [run('r_1', { kind: 'lookup', cost: 0 }), run('r_2', { kind: 'lookup', cost: 0.004 }), run('r_3', { kind: 'router', cost: 0.006 }),
    run('r_4'), run('r_5'), run('r_6', { at: PAST })];
  const on = await get(envWith({ settings: [ON, { key: 'freeLookups', value: 'code' }], strat_run: runs }), 'lookups');
  shape(on, 'lookups');
  assert.equal(on.json.mode, 'code');
  assert.deepEqual(on.json.share, { days: 30, lookups: 2, assistant: 2, share_pct: 50, lookup_cost: 0.01, assistant_cost: 0.5 });
});

test('lookups: the share is null when the log cannot be read, as before', async () => {
  const env = makeEnv({ old, rows: { settings: [{ key: 'freeLookups', value: 'on' }] } });
  const r = await get(env, 'lookups');
  assert.deepEqual([r.status, r.engine, r.json.on, r.json.share], [200, 'new', true, null]);
  assert.ok(env.logs.some(l => l.swallowed));
});

test('ask settings: defaults, then what was saved, in the old shape', async () => {
  const bare = await get(envWith(), 'ask/settings');
  assert.deepEqual([bare.json.model, bare.json.instructions, bare.json.indexChannels, bare.json.channel], ['smart', '', '', null]);
  assert.deepEqual(Object.keys(bare.json.presets), ['smart', 'quick', 'deep']);
  const env = envWith({ settings: [{ key: 'strategistModel', value: 'deep' }, { key: 'strategistInstructions', value: 'Keep it short.' }] });
  const r = await get(env, 'ask/settings');
  shape(r, 'ask/settings');
  assert.deepEqual([r.json.model, r.json.instructions], ['deep', 'Keep it short.']);
});

test('ask usage: totals and the lists, in the old shape, 30 days unless asked, 90 at most', async () => {
  const runs = [run('r_1'), run('r_2', { cost: 0.26, who: null, brand: 'North Kites' }), run('r_3', { at: new Date(Date.now() - 40 * 86400e3).toISOString() })];
  const env = envWith({ strat_run: runs });
  const r = await get(env, 'ask/usage?days=30');
  shape(r, 'ask/usage');
  assert.deepEqual([r.json.days, r.json.answers, r.json.cost, r.json.in_tok, r.json.avg_seconds], [30, 2, 0.51, 200, 2.5]);
  assert.deepEqual(r.json.by_person.map(p => p.who).sort(), [TEAM, 'unknown']);
  assert.equal(r.json.recent.length, 2);
  const wide = await get(env, 'ask/usage?days=400');
  assert.deepEqual([wide.json.days, wide.json.answers], [90, 3]);
  assert.equal((await get(env, 'ask/usage?days=abc')).json.days, 30);
});

const SAVED = [{ key: 'strategistBrief', value: 'We sell kites and tea.' }, { key: 'strategistPlaybook', value: 'Read the ad set first.' }];

test('ask findings: forwarded while the brief or the playbook is still the default text', async () => {
  const r = await get(envWith({ settings: [ON, SAVED[0]] }), 'ask/findings');
  assert.equal(r.engine, 'forward');
});

test('ask findings: answered here once both texts are saved, in the old shape and order', async () => {
  const finding = (k, more) => ({ key: k, kind: 'pacing', severity: 'low', title: 'Made up', detail: 'Made up.', amount: 10, month: '2030-01',
    evidence: '{"days":3}', state: 'new', first_seen: '2030-01-01', last_seen: '2030-01-02', ...more });
  const fresh = new Date(Date.now() - 3600e3).toISOString();
  const env = envWith({ settings: [ON, ...SAVED, { key: 'strategistLastBriefing', value: '{"at":"2030-01-01T00:00:00.000Z","text":"Made up.","findings":1}' },
    { key: 'strategistNotes', value: '[{"at":"2030-01-01","text":"Made up."}]' },
    { key: 'strategistPending', value: JSON.stringify([{ id: 'p1', at: fresh, action: 'pause', tool: true, summary: 'Pause it', detail: 'Why', patch: { body: { rows: [1] } }, preview: 'held' }, { id: 'p2', at: PAST }]) }],
  findings: [finding('a:low', { evidence: 'not json' }), finding('b:high', { severity: 'high' }), finding('c:done', { state: 'done' }),
    finding('d:later', { state: 'snoozed', snooze_until: '2999-01-01' }), finding('e:back', { state: 'snoozed', snooze_until: '2001-01-01', severity: 'med' })] });
  const r = await get(env, 'ask/findings');
  assert.equal(r.engine, 'new');
  shape(r, 'ask/findings');
  assert.deepEqual(r.json.findings.map(f => f.key), ['b:high', 'e:back', 'a:low']);
  assert.deepEqual([r.json.findings[0].evidence, r.json.findings[2].evidence], [{ days: 3 }, {}]);
  assert.deepEqual([r.json.brief, r.json.playbook, r.json.channel], ['We sell kites and tea.', 'Read the ad set first.', null]);
  assert.deepEqual(r.json.memory, { notes: [{ at: '2030-01-01', text: 'Made up.' }], watches: [], muted: [] });
  assert.deepEqual(r.json.pending, [{ id: 'p1', action: 'pause', tool: true, summary: 'Pause it', detail: 'Why', at: fresh }]);
  assert.ok(!('patch' in r.json.pending[0]) && !('preview' in r.json.pending[0]));
});

test('save the brief: one settings row, cut at 4000 characters, nothing else moved', async () => {
  const env = envWith({ settings: [ON, { key: 'strategistPlaybook', value: 'Read the ad set first.' }] });
  const before = env.DB.rows('settings', "key NOT IN ('strategistBrief', 'userRoles', 'userBrands', 'clientUsers')");
  const r = await call(env, 'PUT', '/ah/api/ask/brief', { token: asCaller('team'), body: { text: 'k'.repeat(4100) } });
  assert.deepEqual([r.status, r.json.ok, r.engine], [200, true, 'new']);
  assert.equal(env.DB.rows('settings', "key = 'strategistBrief'")[0].value.length, 4000);
  assert.deepEqual(env.DB.rows('settings', "key NOT IN ('strategistBrief', 'userRoles', 'userBrands', 'clientUsers')"), before);
  const empty = await call(env, 'PUT', '/ah/api/ask/brief', { token: asCaller('owner'), body: {} });
  assert.equal(empty.status, 200);
  assert.equal(env.DB.rows('settings', "key = 'strategistBrief'")[0].value, '');
});

test('my own key: a view only teammate and a look and approve client may make one and turn it off, as the old door', async () => {
  const env = envWith({ p_ai_key: [key('aik_1', TEAM)] });
  const viewer = asCaller('viewer');
  const made = await call(env, 'POST', '/ah/api/connect-ai/keys', { token: viewer, body: { label: 'Mine' } });
  assert.equal(made.status, 200);
  assert.equal(made.json.email, 'viewer@agency.test');
  const notMine = await call(env, 'POST', '/ah/api/connect-ai/keys/revoke', { token: viewer, body: { id: 'aik_1' } });
  assert.equal(notMine.status, 404);
  const off = await call(env, 'POST', '/ah/api/connect-ai/keys/revoke', { token: viewer, body: { id: made.json.id } });
  assert.deepEqual([off.status, off.json.state], [200, 'revoked']);
  assert.equal(env.DB.rows('p_ai_key', "id = 'aik_1'")[0].revoked_at, null);

  const client = asCaller('client');
  await call(env, 'GET', '/ah/api/connect-ai', { token: client });
  env.DB.insert('settings', [{ key: 'clientUsers', value: JSON.stringify({ [CLIENT]: { brands: [NORTH], name: 'Client Person', readOnly: true } }) }]);
  const c = await call(env, 'POST', '/ah/api/connect-ai/keys', { token: client, body: {}, keep: true });
  assert.equal(c.status, 200);
  assert.deepEqual([c.json.email, c.json.brands], [CLIENT, [NORTH]]);
  const cOff = await call(env, 'POST', '/ah/api/connect-ai/keys/revoke', { token: client, body: { id: c.json.id }, keep: true });
  assert.equal(cOff.status, 200);
  const other = await call(env, 'POST', '/ah/api/connect-ai/keys/revoke', { token: client, body: { id: 'aik_1' }, keep: true });
  assert.equal(other.status, 404);
  const cBad = await call(env, 'POST', '/ah/api/connect-ai/keys', { token: client, body: { brands: [RIVER] }, keep: true });
  assert.equal(cBad.status, 403);
});

test('my own key: the look and approve pass reaches these two writes only', async () => {
  const env = envWith();
  const viewer = asCaller('viewer');
  for (const path of ['/ah/api/ask/settings', '/ah/api/ask/brief']) {
    const r = await call(env, 'PUT', path, { token: viewer, body: {} });
    assert.equal(r.status, 403, path);
  }
});
