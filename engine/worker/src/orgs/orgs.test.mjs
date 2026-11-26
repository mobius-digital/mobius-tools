/* Offline tests for the orgs group: access for every row, the shape of every ported answer against its
   made up sample, what each write wrote, and that a client login or a limited teammate sees only its own. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, asCaller, call, sameShape, genAccessTests, assertNoLeak, NORTH, RIVER, RIVER_IDS } from '../platform/testkit/index.mjs';
import { routes } from './routes.js';

const sample = name => JSON.parse(readFileSync(new URL(`./samples/${name}.json`, import.meta.url), 'utf8'));
/* What the fake old worker answers for the borrowed fields. */
const old = {
  'GET /api/team': () => ({ domain: 'agency.test', owner: 'owner@agency.test', members: [] }),
  'GET /api/clients': () => ({ clients: [], locus: 'https://app.agency.test/' }),
  'GET /api/settings': () => ({ slackInteractive: true, hasSlackToken: true, hasTwKey: false, buyerOwner: 'Pat', buyerChannel: 'C0AGENCY003' }),
};
const opts = { groups: ['orgs'], old };
const world = (rows = {}) => makeEnv({ ...opts, rows });
const settingsRows = map => ({ settings: Object.entries(map).map(([key, value]) => ({ key, value: typeof value === 'string' ? value : JSON.stringify(value) })) });
const stored = (env, key) => { const r = env.DB.rows('settings').find(x => x.key === key); return r ? r.value : undefined; };

/* The kit writes clientUsers from the client callers it knows, so the client logins of these tests are callers. */
const CLIENT = asCaller('client');
const RIVER_CLIENT = asCaller('client', { brands: [RIVER] });
const BOTH_CLIENT = asCaller('client', { brands: [NORTH, RIVER] });
const OWNER = asCaller('owner');
const TEAM = asCaller('team');
const LIMITED = asCaller('limited');

genAccessTests(routes, opts);

/* ---- who you are ---- */

test('GET /ah/api/me: the owner gets the old answer, same shape as the sample', async () => {
  const r = await call(world(), 'GET', '/ah/api/me', { token: OWNER });
  assert.equal(r.status, 200);
  assert.equal(r.engine, 'new');
  assert.deepEqual(sameShape(r.json, sample('me')), []);
  assert.equal(r.json.role, 'owner');
  assert.equal(r.json.email, 'owner@agency.test');
});

test('GET /ah/api/me: a client gets its own brands and nothing of the other brand', async () => {
  const env = makeEnv({ groups: ['orgs'], old: { ...old, 'GET /api/me': () => sample('me-client') } });
  const r = await call(env, 'GET', '/ah/api/me', { token: CLIENT });
  assert.equal(r.status, 200);
  assert.deepEqual(sameShape(r.json, sample('me-client')), []);
  assert.deepEqual(r.json.client.brands.map(b => b.id), [NORTH]);
  await assertNoLeak(world(), 'GET', '/ah/api/me');
});

/* ---- your own preferences ---- */

test('GET /ah/api/me/prefs: same shape as the sample, old entries are dropped', async () => {
  const now = Date.now();
  const env = world(settingsRows({ 'userPrefs:team@agency.test': { morning_dm: 1,
    nudge: { 'card:example': { state: 'snoozed', until: now + 1000 }, gone: { state: 'done', until: now - 8 * 86400e3 }, odd: { state: 'later', until: now + 1000 } } } }));
  const r = await call(env, 'GET', '/ah/api/me/prefs', { token: TEAM });
  assert.equal(r.status, 200);
  assert.deepEqual(sameShape(r.json, sample('me-prefs')), []);
  assert.equal(r.json.email, 'team@agency.test');
  assert.equal(r.json.prefs.morning_dm, true);
  assert.deepEqual(Object.keys(r.json.prefs.nudge), ['card:example']);
});

test('GET /ah/api/me/prefs: nothing stored gives the empty preferences', async () => {
  const r = await call(world(), 'GET', '/ah/api/me/prefs', { token: OWNER });
  assert.deepEqual(r.json.prefs, { morning_dm: false, nudge: {}, home_tiles: [] });
});

test('GET /ah/api/me/prefs: a client reads its own row, never another person\'s', async () => {
  const rows = settingsRows({ 'userPrefs:client@northkites.test': { morning_dm: true, nudge: {} },
    'userPrefs:team@agency.test': { morning_dm: false, nudge: { [`card:${RIVER}`]: { state: 'done', until: Date.now() + 5000 } } } });
  const { mine } = await assertNoLeak(world(rows), 'GET', '/ah/api/me/prefs');
  assert.equal(mine.json.email, 'client@northkites.test');
  assert.deepEqual(mine.json.prefs, { morning_dm: true, nudge: {}, home_tiles: [] });
});

test('PUT /ah/api/me/prefs: writes the caller\'s one row and leaves the others alone', async () => {
  const other = JSON.stringify({ morning_dm: true, nudge: {} });
  const env = world(settingsRows({ 'userPrefs:owner@agency.test': other, slackChannel: 'C0AGENCY001' }));
  const far = Date.now() + 90 * 86400e3;
  const r = await call(env, 'PUT', '/ah/api/me/prefs', { token: TEAM,
    body: { morning_dm: true, nudge: { a: { state: 'snoozed' }, b: { state: 'done', until: far }, c: { state: 'nope' } } } });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.email, 'team@agency.test');
  assert.deepEqual(Object.keys(r.json.prefs.nudge).sort(), ['a', 'b']);
  assert.ok(r.json.prefs.nudge.b.until < far, 'a far date is held to 30 days');
  assert.deepEqual(JSON.parse(stored(env, 'userPrefs:team@agency.test')), r.json.prefs);
  assert.equal(stored(env, 'userPrefs:owner@agency.test'), other);
  assert.equal(stored(env, 'slackChannel'), 'C0AGENCY001');
  const again = await call(env, 'PUT', '/ah/api/me/prefs', { token: TEAM, body: { nudge: { a: { state: null } } } });
  assert.deepEqual(Object.keys(again.json.prefs.nudge), ['b']);
  assert.equal(again.json.prefs.morning_dm, true);
});

test('PUT /ah/api/me/prefs: a client saves its own row, and only the two allowed fields', async () => {
  const env = world();
  const ok = await call(env, 'PUT', '/ah/api/me/prefs', { token: CLIENT, body: { morning_dm: true } });
  assert.equal(ok.status, 200);
  assert.equal(JSON.parse(stored(env, 'userPrefs:client@northkites.test')).morning_dm, true);
  const extra = await call(env, 'PUT', '/ah/api/me/prefs', { token: CLIENT, body: { morning_dm: false, email: 'team@agency.test' } });
  assert.equal(extra.status, 403);
  assert.equal(stored(env, 'userPrefs:team@agency.test'), undefined);
  assert.equal(JSON.parse(stored(env, 'userPrefs:client@northkites.test')).morning_dm, true);
});

test('PUT /ah/api/me/prefs: a body that is not JSON is refused with the old words', async () => {
  const r = await call(world(), 'PUT', '/ah/api/me/prefs', { token: TEAM, body: 'not json' });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'bad json');
});

/* ---- the team ---- */

test('GET /ah/api/team: same shape as the sample, roles, guests and brand lists read from settings', async () => {
  const env = world(settingsRows({ allowedEmails: ['Guest@Studio.test'] }));
  const r = await call(env, 'GET', '/ah/api/team', { token: OWNER });
  assert.equal(r.status, 200);
  assert.deepEqual(sameShape(r.json, sample('team')), []);
  assert.equal(r.json.domain, 'agency.test');
  assert.equal(r.json.owner, 'owner@agency.test');
  assert.equal(r.json.you, 'owner@agency.test');
  assert.equal(r.json.can_set_brands, true);
  const by = Object.fromEntries(r.json.members.map(m => [m.email, m]));
  assert.deepEqual(by['guest@studio.test'], { email: 'guest@studio.test', role: 'admin', guest: true, brands: [] });
  assert.equal(by['viewer@agency.test'].role, 'viewer');
  assert.deepEqual(by['limited@agency.test'].brands, [NORTH]);
  assert.deepEqual(r.json.members.map(m => m.email), [...r.json.members.map(m => m.email)].sort());
});

test('GET /ah/api/team: a teammate is told they cannot set brands', async () => {
  const r = await call(world(), 'GET', '/ah/api/team', { token: TEAM });
  assert.equal(r.json.can_set_brands, false);
  assert.equal(r.json.you, 'team@agency.test');
});

/* ---- the client logins ---- */

test('GET /ah/api/clients: same shape as the sample, every login for the owner', async () => {
  const r = await call(world(), 'GET', `/ah/api/clients?act=${NORTH}`, { token: OWNER });
  assert.equal(r.status, 200);
  assert.deepEqual(sameShape(r.json, sample('clients')), []);
  assert.equal(r.json.can_edit, true);
  assert.equal(r.json.locus, 'https://app.agency.test/');
  assert.deepEqual(Object.keys(r.json.access), [NORTH]);
  assert.ok(r.json.clients.length >= 2 && r.json.clients.every(c => c.brands.some(b => b.id === NORTH)));
  const both = r.json.clients.find(c => c.brands.length === 2);
  assert.deepEqual(both.brands.map(b => b.name).sort(), ['North Kites', 'River Tea']);
  const all = await call(world(), 'GET', '/ah/api/clients?act=all', { token: OWNER });
  assert.deepEqual(all.json.access, {});
  assert.ok(all.json.clients.some(c => c.brands.every(b => b.id === RIVER)));
  assert.deepEqual(all.json.clients.map(c => c.email), [...all.json.clients.map(c => c.email)].sort((a, b) => a.localeCompare(b)));
});

test('GET /ah/api/clients: a teammate with one brand sees only that brand\'s logins and no id of the other', async () => {
  const r = await call(world(), 'GET', '/ah/api/clients', { token: LIMITED });
  assert.equal(r.status, 200);
  assert.equal(r.json.can_edit, false);
  assert.ok(r.json.clients.length >= 2);
  for (const c of r.json.clients) assert.deepEqual(c.brands.map(b => b.id), [NORTH]);
  for (const id of RIVER_IDS) assert.ok(!r.text.includes(id), `the answer holds ${id}`);
  assert.ok(!r.text.includes('River Tea'));
  const other = await call(world(), 'GET', `/ah/api/clients?act=${RIVER}`, { token: LIMITED });
  assert.equal(other.status, 403);
});

test('the team list, the client logins and the agency settings are closed to a client login', async () => {
  for (const [method, path] of [['GET', '/ah/api/team'], ['GET', '/ah/api/clients'], ['GET', '/ah/api/settings'], ['PUT', '/ah/api/settings']]) {
    for (const token of [CLIENT, RIVER_CLIENT, BOTH_CLIENT]) {
      const env = world();
      const r = await call(env, method, path, { token, body: method === 'PUT' ? { slackSendWho: 'anyone' } : undefined });
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.equal(stored(env, 'slackSendWho'), undefined);
    }
  }
});

/* ---- the agency settings ---- */

test('GET /ah/api/settings: same shape as the sample, and the old fallbacks when nothing is stored', async () => {
  const r = await call(world(), 'GET', '/ah/api/settings', { token: TEAM });
  assert.equal(r.status, 200);
  assert.deepEqual(sameShape(r.json, sample('settings')), []);
  assert.deepEqual(Object.keys(r.json).filter(k => k !== 'meta'), Object.keys(sample('settings')));
  const want = { slackChannel: null, slackSendWho: 'owner', slackInteractive: true, paceAlertPct: 0.15, movedPost: true,
    marketHandles: '', marketChatter: true, seasonTab: { label: 'Black Friday', mode: 'auto' }, dailyBriefsChannel: '',
    briefClientStyle: 'short', todayPost: true, actionRemind: true, minOffPost: true, buyerOwner: 'Pat', buyerChannel: 'C0AGENCY003',
    buyerPost: true, launchDays: 'mon,thu', buyerAI: true, morningHour: 5, morningCard: true, dailyBriefsError: null,
    hasSlackToken: true, hasTwKey: false, checkinAutoApprove: true, askInClientChannels: true, slackIndexClient: true };
  const { meta, ...got } = r.json;
  assert.deepEqual(got, want);
  assert.equal(meta.engine, 'new');
});

test('GET /ah/api/settings: stored values are read the old way', async () => {
  const env = world(settingsRows({ slackChannel: 'C0AGENCY001', slackSendWho: 'anyone', paceAlertPct: '0.2', movedPost: 'off',
    marketHandles: 'one, two', seasonTab: { label: 'Autumn', mode: 'on' }, briefClientStyle: 'full', buyerOwner: '  Robin   Lee ',
    buyerChannel: 'U0PERSON001', launchDays: 'Thu, tuesday', buyerAI: 'off', briefHour: '7', dailyBriefsError: { why: 'x' },
    askInClientChannels: '0', slackIndexClient: '1' }));
  const r = await call(env, 'GET', '/ah/api/settings', { token: OWNER });
  const j = r.json;
  assert.equal(j.slackChannel, 'C0AGENCY001');
  assert.equal(j.slackSendWho, 'anyone');
  assert.equal(j.paceAlertPct, 0.2);
  assert.equal(j.movedPost, false);
  assert.deepEqual(j.seasonTab, { label: 'Autumn', mode: 'on' });
  assert.equal(j.briefClientStyle, 'full');
  assert.equal(j.buyerOwner, 'Robin Lee');
  assert.equal(j.buyerChannel, 'U0PERSON001');
  assert.equal(j.launchDays, 'tue,thu');
  assert.equal(j.buyerAI, false);
  assert.equal(j.morningHour, 7);
  assert.deepEqual(j.dailyBriefsError, { why: 'x' });
  assert.equal(j.askInClientChannels, false);
  assert.equal(j.slackIndexClient, true);
  assert.equal(j.checkinAutoApprove, true);
});

test('PUT /ah/api/settings: writes only the rows named, in the old form', async () => {
  const env = world(settingsRows({ marketHandles: 'keep me', 'userPrefs:team@agency.test': '{"morning_dm":true,"nudge":{}}' }));
  const r = await call(env, 'PUT', '/ah/api/settings', { token: TEAM, body: { slackSendWho: 'anyone', paceAlertPct: 'x', movedPost: false,
    seasonTab: { label: '  Autumn  ', mode: 'odd' }, dailyBriefsChannel: 'not a channel', buyerOwner: '   ', buyerChannel: 'C0AGENCY009',
    todayPost: true, slackIndexClient: false, checkinAutoApprove: 'yes', morningHour: 6, unknownKey: 1 } });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(stored(env, 'slackSendWho'), 'anyone');
  assert.equal(stored(env, 'paceAlertPct'), '0.15');
  assert.equal(stored(env, 'movedPost'), 'off');
  assert.equal(stored(env, 'seasonTab'), '{"label":"Autumn","mode":"auto"}');
  assert.equal(stored(env, 'dailyBriefsChannel'), '');
  assert.equal(stored(env, 'buyerOwner'), undefined);
  assert.equal(stored(env, 'buyerChannel'), 'C0AGENCY009');
  assert.equal(stored(env, 'todayPost'), 'on');
  assert.equal(stored(env, 'slackIndexClient'), '0');
  assert.equal(stored(env, 'checkinAutoApprove'), '1');
  assert.equal(stored(env, 'morningHour'), '6');
  assert.equal(stored(env, 'briefHour'), '6');
  assert.equal(stored(env, 'marketHandles'), 'keep me');
  assert.equal(stored(env, 'unknownKey'), undefined);
  assert.equal(stored(env, 'slackChannel'), undefined);
  assert.equal(stored(env, 'userPrefs:team@agency.test'), '{"morning_dm":true,"nudge":{}}');
  assert.equal(env.calls.filter(c => c.path !== '/api/me').length, 0, 'a settings save reaches no old worker');
});

test('PUT /ah/api/settings: a bad hour is refused with the old words, after the other rows are saved', async () => {
  const env = world();
  const r = await call(env, 'PUT', '/ah/api/settings', { token: OWNER, body: { morningCard: false, morningHour: 24 } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'The hour is a whole number from 0 to 23.');
  assert.equal(stored(env, 'morningCard'), 'off');
  assert.equal(stored(env, 'morningHour'), undefined);
  assert.equal(stored(env, 'briefHour'), undefined);
});

/* ---- sign in ---- */

test('the four sign in doors are forwarded with no session, body and query untouched', async () => {
  const env = world();
  const login = await call(env, 'POST', '/ah/api/google-login', { body: { credential: 'abc', invite: 'def' } });
  assert.equal(login.engine, 'forward');
  let sent = env.calls.at(-1);
  assert.deepEqual([sent.worker, sent.method, sent.path, sent.token, sent.body], ['ah', 'POST', '/api/google-login', '', '{"credential":"abc","invite":"def"}']);
  await call(env, 'POST', '/ah/api/clients/signin', { body: { t: 'x' } });
  assert.equal(env.calls.at(-1).path, '/api/clients/signin');
  await call(env, 'POST', '/ah/api/clients/login-link', { body: { invite: 'x' } });
  assert.equal(env.calls.at(-1).path, '/api/clients/login-link');
  const info = await call(env, 'GET', '/ah/api/clients/invite-info?t=0123', {});
  sent = env.calls.at(-1);
  assert.equal(info.engine, 'forward');
  assert.deepEqual([sent.path, sent.search], ['/api/clients/invite-info', '?t=0123']);
});
