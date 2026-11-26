/* Offline tests for the automations group: the access rules of every row, the answer shapes, the writes,
   and that a client login never reads another brand. Made up brands and people only.
   Run: node --test "engine/worker/test/automations/*.test.mjs" */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, asCaller, call, sameShape, genAccessTests, assertNoLeak, NORTH, RIVER, RIVER_IDS } from '../../src/platform/testkit/index.mjs';
import { routes } from '../../src/automations/routes.js';

const sample = name => JSON.parse(readFileSync(new URL(`../../src/automations/samples/${name}.json`, import.meta.url), 'utf8'));
/* The parts of an answer whose keys depend on what a person picked (a trigger's own words, a button, the send record). */
const FREE = new Set(['when', 'if', 'do', 'tell', 'button', 'sent', 'parts']);
const fixed = v => (Array.isArray(v) ? v.map(fixed) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, FREE.has(k) ? null : fixed(x)])) : v);
const shapeDiff = (answer, name) => sameShape(fixed(answer), fixed(sample(name)));
const OWNER = 'owner@agency.test', TEAM = 'team@agency.test', LIMITED = 'limited@agency.test', CLIENT = 'client@northkites.test';
const AT = '2026-01-05T10:00:00.000Z';
const old = { 'GET /api/team': () => ({ domain: 'agency.test', owner: OWNER, members: [] }) };

const auto = (id, brand, owner, state, more = {}) => ({ id, brand_id: brand, owner_person: owner, name: `Automation ${id}`, state,
  trigger_json: { type: 'plan_missing', hour: 10 }, conditions_json: [], actions_json: [], audience_json: { who: [{ kind: 'me' }], text: '' },
  created_by: owner, created_at: AT, updated_at: AT, ...more });
const notice = (id, person, brand, kind, more = {}) => ({ id, person_id: person, brand_id: brand, kind, title: `Row ${id}`, body: 'team words',
  button_json: { notices: ['x'] }, sent_json: { bell: AT, released_by: OWNER }, state: 'open', home: 1, created_at: AT, ...more });

const rows = () => ({
  settings: [{ key: 'automationsOn', value: 'off' }, { key: 'allowedEmails', value: JSON.stringify(['guest@other.test']) },
    { key: 'automationRoles', value: JSON.stringify({ all: { buyer: TEAM }, [RIVER]: { owner: OWNER }, team: ['guest@other.test'] }) }],
  p_automation: [
    auto('au_all', 'all', TEAM, 'on'),
    auto('au_north', NORTH, OWNER, 'on', { trigger_json: { type: 'card_status', status: 'review' }, actions_json: [{ type: 'ai_check' }],
      audience_json: { who: [{ kind: 'role', role: 'maker' }, { kind: 'clients' }], text: '' } }),
    auto('au_river', RIVER, OWNER, 'on', { name: 'A rule about river-tea', audience_json: { who: [{ kind: 'clients' }, { kind: 'role', role: 'buyer' }], text: '' } }),
    auto('au_river_draft', RIVER, OWNER, 'draft'),
    auto('au_limited_own', RIVER, LIMITED, 'paused'),
  ],
  p_automation_run: [
    { id: 'ar_1', automation_id: 'au_all', brand_id: NORTH, event_key: 'k1', started_at: AT, result: 'done', why: null, title: 'North run' },
    { id: 'ar_2', automation_id: 'au_river', brand_id: RIVER, event_key: 'k2', started_at: AT, result: 'skipped', why: 'quiet', title: 'River run' },
    { id: 'ar_3', automation_id: 'au_river', brand_id: RIVER, event_key: 'k3', started_at: AT, result: 'folded', why: null, title: 'Folded' },
  ],
  p_automation_sub: [{ automation_id: 'au_all', person_id: TEAM, mode: 'mute', ways_json: null, at_hour: 9, updated_at: AT },
    { automation_id: 'au_all', person_id: OWNER, mode: 'daily_line', ways_json: null, at_hour: 8, updated_at: AT }],
  p_person_delivery: [{ person_id: OWNER, read_hour: 6, read_days: ['mon'], mode: 'morning_read', ways_json: { home: true, slack: true, email: false }, updated_at: AT }],
  p_notice: [
    notice('nt_owner', OWNER, NORTH, 'proposal'),
    notice('nt_owner_held', OWNER, RIVER, 'tell', { hold_until: '2999-01-01T00:00:00.000Z' }),
    notice('nt_owner_draft', OWNER, RIVER, 'tell', { state: 'draft' }),
    notice('nt_client_ok', CLIENT, NORTH, 'tell'),
    notice('nt_client_river', CLIENT, RIVER, 'tell', { title: 'About river-tea' }),
    notice('nt_client_task', CLIENT, NORTH, 'proposal'),
    notice('nt_limited_river', LIMITED, RIVER, 'tell'),
    notice('nt_limited_north', LIMITED, NORTH, 'tell'),
  ],
});
const opts = () => ({ groups: ['automations'], rows: rows(), old });
const env = () => makeEnv(opts());

genAccessTests(routes, { groups: ['automations'], old });

test('GET automations: the old keys, every automation, runs without folded ones', async () => {
  const r = await call(env(), 'GET', '/ah/api/automations', { token: asCaller('owner') });
  assert.equal(r.status, 200);
  assert.equal(r.engine, 'new');
  assert.deepEqual(Object.keys(r.json).filter(k => k !== 'meta'), ['power', 'can_power', 'can_edit', 'can_clients', 'automations', 'templates', 'runs',
    'brands', 'options', 'modes', 'team_size', 'note']);
  assert.deepEqual(shapeDiff(r.json, 'automations'), []);
  assert.equal(r.json.automations.length, 5);
  assert.ok(!('cursor' in r.json.automations[0]));
  assert.deepEqual(r.json.runs.map(x => x.id).sort(), ['ar_1', 'ar_2']);
  assert.equal(r.json.runs.find(x => x.id === 'ar_2').brand, 'River Tea');
  assert.equal(r.json.templates.length, 25);
  assert.equal(r.json.power, false);
  assert.equal(r.json.can_power, true);
  /* owner, team (a role), limited (an automation), guest (invited), at the least. The client is never team. */
  assert.ok(r.json.team_size >= 4);
  const north = r.json.automations.find(a => a.id === 'au_north');
  assert.equal(north.brand_name, 'North Kites');
  assert.equal(north.costs_ai, true);
  assert.ok(north.notes.some(n => n.startsWith('Nobody is set as the card\'s maker')));
});

test('GET automations: a teammate limited to one brand sees that brand and what they made', async () => {
  const r = await call(env(), 'GET', '/ah/api/automations', { token: asCaller('limited') });
  assert.deepEqual(r.json.automations.map(a => a.id).sort(), ['au_limited_own', 'au_north']);
  assert.deepEqual(r.json.brands, [{ id: NORTH, name: 'North Kites' }]);
  assert.deepEqual(r.json.runs, []);
  assert.equal(r.json.can_power, false);
});

test('GET automations: forwarded when the old tables are not there, or the team domain is not known', async () => {
  const bare = await call(makeEnv({ old }), 'GET', '/ah/api/automations', { token: asCaller('owner') });
  assert.ok(bare.forwarded);
  const noTeam = await call(makeEnv({ groups: ['automations'], rows: rows() }), 'GET', '/ah/api/automations', { token: asCaller('owner') });
  assert.ok(noTeam.forwarded);
});

test('GET automations/test: not found, as the old worker says', async () => {
  const r = await call(env(), 'GET', '/ah/api/automations/test', { token: asCaller('team') });
  assert.equal(r.status, 404);
  assert.deepEqual(r.json, { error: 'not found' });
});

const draft = { when: { type: 'card_stale', status: 'making', days: 5 }, do: [{ type: 'task', text: 'Check it', due_days: 1 }],
  tell: { who: [{ kind: 'me' }] }, brand: NORTH, state: 'draft' };

test('PUT automations: a new draft lands as one row, named by its sentence', async () => {
  const e = env();
  const r = await call(e, 'PUT', '/ah/api/automations', { token: asCaller('team'), body: draft });
  assert.equal(r.status, 200);
  assert.equal(r.engine, 'new');
  assert.deepEqual(Object.keys(r.json).filter(k => k !== 'meta'), ['ok', 'power', 'automation']);
  assert.deepEqual(shapeDiff(r.json, 'automation-saved'), []);
  const a = r.json.automation;
  assert.match(a.id, /^au_[0-9a-f]{14}$/);
  assert.equal(a.name, 'When a card has sat in Making for 5 days, for North Kites, put "Check it" on the home list, due in 1 day, then tell me, each in their own way.');
  const [row] = e.DB.rows('p_automation', `id = '${a.id}'`);
  assert.equal(row.brand_id, NORTH);
  assert.equal(row.owner_person, TEAM);
  assert.equal(row.scope, 'brand');
  assert.equal(row.kind, 'rule');
  assert.equal(row.state, 'draft');
  assert.equal(e.DB.rows('p_automation').length, 6);
});

test('PUT automations: switching one off changes that row only', async () => {
  const e = env();
  const before = e.DB.rows('p_automation', `id != 'au_all'`);
  const r = await call(e, 'PUT', '/ah/api/automations', { token: asCaller('team'), body: { id: 'au_all', state: 'draft' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.automation.state, 'draft');
  const [row] = e.DB.rows('p_automation', `id = 'au_all'`);
  assert.equal(row.state, 'draft');
  assert.equal(row.version, 2);
  assert.deepEqual(e.DB.rows('p_automation', `id != 'au_all'`), before);
});

test('PUT automations: switching on, or naming a client, goes to the old worker and writes nothing here', async () => {
  const e = env();
  const before = e.DB.rows('p_automation');
  const on = await call(e, 'PUT', '/ah/api/automations', { token: asCaller('owner'), body: { ...draft, state: 'on' } });
  assert.ok(on.forwarded);
  const client = await call(e, 'PUT', '/ah/api/automations', { token: asCaller('owner'), body: { ...draft, tell: { who: [{ kind: 'clients' }] } } });
  assert.ok(client.forwarded);
  asCaller('client');
  const person = await call(e, 'PUT', '/ah/api/automations', { token: asCaller('owner'),
    body: { ...draft, tell: { who: [{ kind: 'person', email: CLIENT }] } } });
  assert.ok(person.forwarded);
  assert.deepEqual(e.DB.rows('p_automation'), before);
});

test('PUT automations: the old refusals, in the old words', async () => {
  const e = env();
  const limited = asCaller('limited');
  const other = await call(e, 'PUT', '/ah/api/automations', { token: limited, body: { ...draft, brand: RIVER } });
  assert.equal(other.status, 403);
  assert.equal(other.json.error, 'You can set automations for your own brands only. Pick one.');
  const all = await call(e, 'PUT', '/ah/api/automations', { token: limited, body: { ...draft, brand: 'all' } });
  assert.equal(all.status, 403);
  const unseen = await call(e, 'PUT', '/ah/api/automations', { token: limited, body: { id: 'au_river', state: 'draft' } });
  assert.equal(unseen.status, 404);
  assert.equal(unseen.json.error, 'No automation with that id.');
  const empty = await call(e, 'PUT', '/ah/api/automations', { token: asCaller('team'), body: {} });
  assert.equal(empty.status, 400);
  assert.equal(empty.json.error, 'Pick what sets it off first.');
  const brand = await call(e, 'PUT', '/ah/api/automations', { token: asCaller('team'), body: { ...draft, brand: 'brand_nobody' } });
  assert.equal(brand.json.error, 'No brand with that id.');
  assert.equal(e.DB.rows('p_automation').length, 5);
});

test('DELETE automations: the row and its saved choices go, nothing else', async () => {
  const e = env();
  const r = await call(e, 'DELETE', '/ah/api/automations?id=au_all', { token: asCaller('team') });
  assert.deepEqual({ ...r.json, meta: undefined }, { ok: true, meta: undefined });
  assert.equal(e.DB.rows('p_automation', `id = 'au_all'`).length, 0);
  assert.equal(e.DB.rows('p_automation').length, 4);
  assert.equal(e.DB.rows('p_automation_sub').length, 0);
  const unseen = await call(e, 'DELETE', '/ah/api/automations?id=au_river', { token: asCaller('limited') });
  assert.equal(unseen.status, 404);
  const none = await call(e, 'DELETE', '/ah/api/automations', { token: asCaller('team') });
  assert.equal(none.status, 404);
  assert.equal(e.DB.rows('p_automation').length, 4);
});

test('GET people: the old keys, roles and the team list', async () => {
  const r = await call(env(), 'GET', '/ah/api/automations/people', { token: asCaller('owner') });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json).filter(k => k !== 'meta'), ['ok', 'can_edit', 'can_all', 'can_team', 'role_words', 'roles', 'brands', 'team', 'note']);
  assert.deepEqual(shapeDiff(r.json, 'people'), []);
  assert.deepEqual(r.json.roles, { all: { buyer: TEAM }, [RIVER]: { owner: OWNER } });
  assert.deepEqual(r.json.team.find(t => t.email === 'guest@other.test'), { email: 'guest@other.test', by_hand: true });
  assert.ok(!r.json.team.some(t => t.email === CLIENT));
  const limited = await call(env(), 'GET', '/ah/api/automations/people', { token: asCaller('limited') });
  assert.deepEqual(Object.keys(limited.json.roles), ['all']);
  assert.deepEqual(limited.json.brands, [{ id: NORTH, name: 'North Kites' }]);
  assert.equal(limited.json.can_all, false);
});

test('PUT people: one settings row is saved, with the old refusals', async () => {
  const e = env();
  const r = await call(e, 'PUT', '/ah/api/automations/people', { token: asCaller('team'), body: { roles: { [NORTH]: { strategist: 'Team@Agency.test', buyer: '' } } } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.roles[NORTH], { strategist: TEAM });
  const saved = JSON.parse(e.DB.rows('settings', `key = 'automationRoles'`)[0].value);
  assert.deepEqual(saved, { all: { buyer: TEAM }, [RIVER]: { owner: OWNER }, [NORTH]: { strategist: TEAM }, team: ['guest@other.test'] });
  const outsider = await call(e, 'PUT', '/ah/api/automations/people', { token: asCaller('team'), body: { roles: { all: { buyer: 'someone@elsewhere.test' } } } });
  assert.equal(outsider.status, 400);
  assert.match(outsider.json.error, /is not on the team, so they cannot be the buyer/);
  const limited = asCaller('limited');
  const all = await call(e, 'PUT', '/ah/api/automations/people', { token: limited, body: { roles: { all: { buyer: TEAM } } } });
  assert.equal(all.json.error, 'Only someone who sees every brand can set a role for every brand.');
  const other = await call(e, 'PUT', '/ah/api/automations/people', { token: limited, body: { roles: { [RIVER]: { buyer: TEAM } } } });
  assert.equal(other.status, 403);
  const list = await call(e, 'PUT', '/ah/api/automations/people', { token: asCaller('team'), body: { team_add: [TEAM] } });
  assert.equal(list.json.error, 'Only the owner changes the team list.');
  assert.deepEqual(JSON.parse(e.DB.rows('settings', `key = 'automationRoles'`)[0].value), saved);
  const owner = await call(e, 'PUT', '/ah/api/automations/people', { token: asCaller('owner'), body: { team_add: [TEAM], team_remove: ['guest@other.test'] } });
  assert.deepEqual(JSON.parse(e.DB.rows('settings', `key = 'automationRoles'`)[0].value).team, [TEAM]);
  assert.equal(owner.json.team.find(t => t.email === TEAM).by_hand, true);
});

test('GET notices: a person\'s own open and done rows, sorted into home, bell and morning', async () => {
  const r = await call(env(), 'GET', '/ah/api/notices', { token: asCaller('owner') });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json).filter(k => k !== 'meta'), ['email', 'home', 'bell', 'morning', 'counts']);
  assert.deepEqual(shapeDiff(r.json, 'notices'), []);
  assert.deepEqual(r.json.bell.map(x => x.id).sort(), ['nt_owner', 'nt_owner_held']);
  assert.deepEqual(r.json.home.map(x => x.id), ['nt_owner']);
  assert.deepEqual(r.json.morning.map(x => x.id), ['nt_owner_held']);
  assert.deepEqual(r.json.counts, { open: 2, taps: 1 });
  assert.deepEqual(Object.keys(r.json.bell[0]), ['id', 'kind', 'title', 'body', 'brand_id', 'automation_id', 'run_id', 'state', 'home', 'due_at',
    'held_until', 'button', 'sent', 'answer', 'created_at', 'done_at']);
  const limited = await call(env(), 'GET', '/ah/api/notices', { token: asCaller('limited') });
  assert.deepEqual(limited.json.bell.map(x => x.id), ['nt_limited_north']);
});

test('GET notices: a client reads only the plain line for its own brand', async () => {
  const { none } = await assertNoLeak(env(), 'GET', '/ah/api/notices');
  assert.equal(none.status, 200);
  assert.deepEqual(none.json.bell.map(x => x.id), ['nt_client_ok']);
  /* The handler answers with brand_id too. The last filter drops a key that reads like a brand id, on the old worker as well. */
  assert.deepEqual(Object.keys(none.json.bell[0]), ['id', 'kind', 'title', 'state', 'home', 'held_until', 'created_at', 'done_at']);
  assert.deepEqual(none.json.home, []);
  assert.ok(!none.text.includes('team words') && !none.text.includes(OWNER));
});

test('GET me/delivery: my defaults and my choice per automation', async () => {
  const r = await call(env(), 'GET', '/ah/api/me/delivery', { token: asCaller('owner') });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json).filter(k => k !== 'meta'), ['ok', 'email', 'delivery', 'per', 'modes', 'ways', 'ways_note']);
  assert.deepEqual(shapeDiff(r.json, 'delivery'), []);
  assert.deepEqual(r.json.delivery, { tz: null, read_hour: 6, read_days: ['mon'], quiet_from: null, quiet_to: null, break_quiet: ['tap', 'down'],
    mode: 'morning_read', ways: { home: true, slack: true, email: false } });
  assert.deepEqual(r.json.per.map(p => p.automation_id).sort(), ['au_all', 'au_limited_own', 'au_north', 'au_river']);
  const mine = r.json.per.find(p => p.automation_id === 'au_all');
  assert.deepEqual({ mode: mine.mode, at_hour: mine.at_hour, own: mine.own }, { mode: 'daily_line', at_hour: 8, own: true });
  assert.deepEqual(r.json.ways, { home: true, bell: true, slack: true, email: true });
});

test('GET me/delivery: a client lists only what tells it, with no team words', async () => {
  const { none } = await assertNoLeak(env(), 'GET', '/ah/api/me/delivery');
  assert.equal(none.status, 200);
  assert.deepEqual(none.json.per.map(p => p.automation_id), ['au_north']);
  assert.equal(none.json.per[0].name, 'A message from your team');
  assert.equal(none.json.per[0].sentence, 'About: a production card moves to a stage');
  assert.deepEqual(none.json.ways, { home: false, bell: true, slack: false, email: true });
  assert.deepEqual(none.json.per[0].ways, { home: false, slack: false, email: false });
});

test('PUT me/delivery: only my own rows change', async () => {
  const e = env();
  const others = () => [e.DB.rows('p_person_delivery', `person_id != '${TEAM}'`), e.DB.rows('p_automation_sub', `person_id != '${TEAM}'`)];
  const before = others();
  const body = { delivery: { read_hour: 9, mode: 'only_if_missing', ways: { slack: true }, tz: 'Not/AZone' },
    per: [{ automation_id: 'au_all', mode: null }, { automation_id: 'au_north', mode: 'mute', at_hour: 30 }, { automation_id: 'au_nope', mode: 'mute' },
      { automation_id: 'au_river', mode: 'shout' }] };
  const r = await call(e, 'PUT', '/ah/api/me/delivery', { token: asCaller('team'), body });
  assert.equal(r.status, 200);
  assert.equal(r.engine, 'new');
  assert.deepEqual(r.json.delivery, { tz: null, read_hour: 9, read_days: ['mon', 'tue', 'wed', 'thu', 'fri'], quiet_from: null, quiet_to: null,
    break_quiet: ['tap', 'down'], mode: 'only_if_missing', ways: { home: true, slack: true, email: false } });
  assert.deepEqual(e.DB.rows('p_automation_sub', `person_id = '${TEAM}'`).map(s => [s.automation_id, s.mode, s.at_hour]), [['au_north', 'mute', null]]);
  assert.deepEqual(others(), before);
});

test('PUT me/delivery: a client saves its own choice and never the home list or the chat app', async () => {
  const e = env();
  const token = asCaller('client');
  const r = await call(e, 'PUT', '/ah/api/me/delivery', { token, body: { delivery: { ways: { home: true, slack: true, email: true } },
    per: [{ automation_id: 'au_river', mode: 'mute' }, { automation_id: 'au_north', mode: 'mute' }] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.delivery.ways, { home: false, slack: false, email: true });
  assert.deepEqual(e.DB.rows('p_automation_sub', `person_id = '${CLIENT}'`).map(s => s.automation_id), ['au_north']);
  for (const id of RIVER_IDS) assert.ok(!r.text.includes(id));
  const extra = await call(e, 'PUT', '/ah/api/me/delivery', { token, body: { delivery: {}, person: OWNER } });
  assert.equal(extra.status, 403);
});

test('PUT me/delivery: a long list of choices goes to the old worker whole', async () => {
  const e = env();
  const many = Array.from({ length: 31 }, (_, i) => auto(`au_m${i}`, 'all', TEAM, 'on'));
  e.DB.insert('p_automation', many);
  const r = await call(e, 'PUT', '/ah/api/me/delivery', { token: asCaller('team'), body: { per: many.map(a => ({ automation_id: a.id, mode: 'mute' })) } });
  assert.ok(r.forwarded);
  assert.equal(e.DB.rows('p_automation_sub', `person_id = '${TEAM}' AND mode = 'mute' AND automation_id LIKE 'au_m%'`).length, 0);
});

test('people: a person taken off on the Team screen is not on the team and cannot be given a role, the owner never is', async () => {
  const GONE = 'gone@agency.test';
  const e = env();
  e.DB.insert('settings', [{ key: 'removedEmails', value: JSON.stringify([GONE, 'Guest@Other.test', OWNER]) },
    { key: 'automationRoles', value: JSON.stringify({ all: { buyer: TEAM }, [RIVER]: { owner: OWNER }, [NORTH]: { maker: GONE }, team: ['guest@other.test'] }) }]);
  const r = await call(e, 'GET', '/ah/api/automations/people', { token: asCaller('owner') });
  assert.equal(r.status, 200);
  const team = r.json.team.map(t => t.email);
  assert.ok(!team.includes(GONE), 'a removed teammate on the agency domain is still on the team');
  assert.ok(!team.includes('guest@other.test'), 'a removed invited person is still on the team');
  assert.ok(team.includes(OWNER), 'the owner was taken off the team');
  const before = e.DB.rows('settings', `key = 'automationRoles'`)[0].value;
  const no = await call(e, 'PUT', '/ah/api/automations/people', { token: asCaller('owner'), body: { roles: { [NORTH]: { buyer: GONE } } } });
  assert.equal(no.status, 400);
  assert.match(no.json.error, /is not on the team, so they cannot be the buyer/);
  const guest = await call(e, 'PUT', '/ah/api/automations/people', { token: asCaller('owner'), body: { team_add: ['guest@other.test'] } });
  assert.equal(guest.status, 400);
  assert.equal(e.DB.rows('settings', `key = 'automationRoles'`)[0].value, before);
  const owner = await call(e, 'PUT', '/ah/api/automations/people', { token: asCaller('owner'), body: { roles: { [NORTH]: { buyer: OWNER } } } });
  assert.equal(owner.status, 200);
  assert.equal(owner.json.roles[NORTH].buyer, OWNER);
});
