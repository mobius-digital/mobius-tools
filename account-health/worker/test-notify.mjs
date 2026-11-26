/* Offline checks for the notify presets (notify.js, 2026-11-26): the default sends nothing, each preset fills the right
 * cells, a channel change refills unless custom, a cell edit sets custom, cleanNotify, wants, the GET and PUT of
 * /api/me/delivery through handleAutomations, owner only types, brandguard's field list, and the morning brief DM
 * recipient rule (mywork.js dmRecipients). In-memory SQLite for D1, Slack mocked, invented people and brands.
 *   node test-notify.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { NOTIFY_TYPES, NOTIFY_PRESETS, catalogTypes, fillPreset, applyPreset, applyChannels, applyCell, cleanNotify, defaultNotify, wants, personWants, notifyOf, saveNotify, _resetNotify } from './src/notify.js';
import { handleAutomations, _reset } from './src/automations.js';
import { CLIENT_RULES } from './src/brandguard.js';
import { _test as myWork } from './src/mywork.js';
import { ROSTER } from './src/actions.js';

let db;
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = (sql, a) => { const o = {}; for (const m of sql.matchAll(/\?(\d+)/g)) { const v = a[+m[1] - 1]; o['p' + m[1]] = v === undefined ? null : typeof v === 'boolean' ? +v : v; } return o; };
const prep = sql => {
  let args = [];
  const st = () => db.prepare(bindSql(sql));
  const o = { bind(...a) { args = a; return o; }, async first() { return st().get(vals(sql, args)) || null; }, async all() { return { results: st().all(vals(sql, args)) }; },
    async run() { if (!/\?\d/.test(sql)) { db.exec(sql); return { meta: {} }; } st().run(vals(sql, args)); return { meta: {} }; } };
  return o;
};
const env = { DB: { prepare: prep } };
function fresh() {
  db = new DatabaseSync(':memory:'); _reset(); _resetNotify();
  db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
}
const setS = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, typeof v === 'string' ? v : JSON.stringify(v));

const BRANDS = [{ act_id: 'brand_northlake_golf', name: 'Northlake Golf', tz: 'America/Chicago', active: 1 }];
let session = null, client = null;
const d = {
  now: () => new Date('2026-03-11T16:00:00Z'),
  getSetting: async (e, k) => db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k)?.value ?? null,
  listAccounts: async () => BRANDS,
  slackApi: async () => ({ ok: true }),
  isAdmin: async () => !!session, sessionEmail: async () => session, clientScope: () => client, brandsFor: async () => null,
  ownerEmail: 'owner@agency.example',
};
const json = (o, status = 200) => ({ status, body: o });
const call = async (method, path, body, dd = d) => handleAutomations(new Request('https://x.test' + path, { method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) }), env, path.split('?')[0], json, dd);
const as = (email, c = null) => { session = email; client = c; };
let n = 0;
const ok = (name, fn) => Promise.resolve().then(fn).then(() => { n++; }, e => { console.error('FAILED: ' + name + '\n', e); process.exitCode = 1; });

const TEAM = catalogTypes({ owner: false }), OWNER = catalogTypes({ owner: true });
const allCells = t => Object.values(t).flatMap(c => [c.slack_dm, c.email, c.push]);

await ok('the default sends nothing anywhere: urgent_brief, every channel off, every cell off', () => {
  const n0 = defaultNotify(OWNER);
  assert.equal(n0.preset, 'urgent_brief');
  assert.deepEqual(n0.channels, { slack_dm: false, email: false, push: false });
  assert.ok(allCells(n0.types).every(v => v === false));
  for (const t of OWNER) for (const c of ['slack_dm', 'email', 'push']) assert.equal(wants(n0, t.id, c), false);
  assert.equal(Object.keys(n0.types).length, OWNER.length, 'complete for the catalog');
});
await ok('each preset fills the right cells for the channels on', () => {
  const ch = { slack_dm: true, email: false, push: true };
  const u = fillPreset(OWNER, 'only_urgent', ch);
  assert.deepEqual(u.spend_high, { slack_dm: true, email: false, push: true });
  assert.deepEqual(u.morning_brief, { slack_dm: false, email: false, push: false });
  assert.deepEqual(u.ad_calls, { slack_dm: false, email: false, push: false });
  const b = fillPreset(OWNER, 'urgent_brief', ch);
  assert.deepEqual(b.morning_brief, { slack_dm: true, email: false, push: true });
  assert.deepEqual(b.ad_calls, { slack_dm: false, email: false, push: false });
  const e = fillPreset(OWNER, 'everything', ch);
  for (const id of ['spend_high', 'ad_calls', 'war_room', 'morning_brief', 'tasks_late']) assert.equal(e[id].slack_dm, true, id);
  assert.deepEqual(NOTIFY_PRESETS.map(p => p.id), ['only_urgent', 'urgent_brief', 'everything', 'custom']);
});
await ok('a channel change refills from the preset; custom keeps its cells; a cell edit sets custom', () => {
  let s = defaultNotify(TEAM);
  s = applyChannels(TEAM, s, { slack_dm: true });
  assert.equal(s.types.spend_low.slack_dm, true); assert.equal(s.types.morning_brief.slack_dm, true); assert.equal(s.types.ad_calls.slack_dm, false);
  s = applyPreset(TEAM, s, 'only_urgent');
  assert.equal(s.preset, 'only_urgent'); assert.equal(s.types.morning_brief.slack_dm, false);
  s = applyCell(TEAM, s, 'ad_calls', { slack_dm: true });
  assert.equal(s.preset, 'custom'); assert.equal(s.types.ad_calls.slack_dm, true);
  s = applyChannels(TEAM, s, { slack_dm: false });
  assert.equal(s.types.ad_calls.slack_dm, true, 'custom keeps the cell');
  assert.equal(wants(s, 'ad_calls', 'slack_dm'), false, 'an off channel reads false at send time');
  s = applyChannels(TEAM, s, { slack_dm: true });
  assert.equal(wants(s, 'ad_calls', 'slack_dm'), true, 'switching it back restores the cell');
  s = applyPreset(TEAM, s, 'everything');
  assert.equal(s.preset, 'everything', 'a preset resets custom');
});
await ok('cleanNotify drops unknown ids, coerces booleans, and holds a client to client_waiting with no slack or push', () => {
  const c = cleanNotify({ preset: 'custom', channels: { slack_dm: 1, email: true, fax: true }, types: { spend_high: { slack_dm: true, email: 'yes' }, nope: { slack_dm: true } } }, TEAM);
  assert.deepEqual(c.channels, { slack_dm: false, email: true, push: false });
  assert.ok(!('nope' in c.types)); assert.deepEqual(c.types.spend_high, { slack_dm: true, email: false, push: false });
  assert.ok(!('fax' in c.channels));
  const cl = cleanNotify({ preset: 'custom', channels: { slack_dm: true, email: true, push: true }, types: { client_waiting: { slack_dm: true, email: true, push: true }, spend_high: { email: true } } }, catalogTypes({ client: true }), { client: true });
  assert.deepEqual(Object.keys(cl.types), ['client_waiting']);
  assert.deepEqual(cl.channels, { slack_dm: false, email: true, push: false });
  assert.deepEqual(cl.types.client_waiting, { slack_dm: false, email: true, push: false });
});
await ok('wants: in_app always true, push always false (no sender yet)', () => {
  const s = applyChannels(TEAM, applyPreset(TEAM, defaultNotify(TEAM), 'everything'), { slack_dm: true, email: true, push: true });
  assert.equal(wants(null, 'spend_high', 'in_app'), true);
  assert.equal(wants(s, 'spend_high', 'push'), false);
  assert.equal(wants(s, 'spend_high', 'email'), true);
});
await ok('owner only types are missing from a teammate catalog; a client gets only client_waiting', () => {
  const ids = TEAM.map(t => t.id);
  for (const id of ['claude_failed', 'meta_sync', 'outage', 'war_room']) assert.ok(!ids.includes(id), id);
  assert.ok(OWNER.some(t => t.id === 'outage'));
  assert.deepEqual(catalogTypes({ client: true }).map(t => t.id), ['client_waiting']);
  assert.equal(NOTIFY_TYPES.length, 22, '15 plus the 7 alarms (alarms.js)');
});
await ok('GET then PUT /api/me/delivery keeps the old fields and round trips notify', async () => {
  fresh(); as('sam@agency.example');
  const g = await call('GET', '/api/me/delivery');
  assert.equal(g.status, 200);
  for (const k of ['delivery', 'per', 'modes', 'ways', 'ways_note']) assert.ok(k in g.body, k);
  assert.equal(g.body.notify.preset, 'urgent_brief');
  assert.ok(!g.body.catalog.types.some(t => t.id === 'outage'), 'a teammate does not see owner only types');
  assert.equal(g.body.catalog.copies_on, false);
  assert.deepEqual(g.body.catalog.channels.map(c => c.id), ['in_app', 'slack_dm', 'email', 'push']);
  assert.equal(g.body.catalog.channels.find(c => c.id === 'push').ready, false);
  assert.match(g.body.catalog.channels.find(c => c.id === 'email').note, /product mailbox/);
  const p = await call('PUT', '/api/me/delivery', { notify: { channels: { slack_dm: true } } });
  assert.equal(p.body.notify.types.spend_high.slack_dm, true);
  assert.equal(p.body.notify.types.morning_brief.slack_dm, true);
  const p2 = await call('PUT', '/api/me/delivery', { notify: { preset: 'everything', types: { ad_calls: { slack_dm: false } } } });
  assert.equal(p2.body.notify.preset, 'custom', 'a types edit wins and sets custom');
  assert.equal(p2.body.notify.types.ad_calls.slack_dm, false); assert.equal(p2.body.notify.types.review.slack_dm, true);
  const p3 = await call('PUT', '/api/me/delivery', { delivery: { mode: 'mute' } });
  assert.equal(p3.body.delivery.mode, 'mute', 'the old delivery field still works');
  assert.equal(p3.body.notify.preset, 'custom', 'and does not touch notify');
  setS('notifyCopies', 'on');
  assert.equal((await call('GET', '/api/me/delivery')).body.catalog.copies_on, true);
  as('owner@agency.example');
  assert.ok((await call('GET', '/api/me/delivery')).body.catalog.types.some(t => t.id === 'outage'), 'the owner sees owner only types');
});
await ok('someone on the morning brief DM list sees Slack DM on with nothing saved, and a first save keeps it', async () => {
  fresh();
  const r = ROSTER.find(x => x.email && x.name !== 'Cole');   // a roster person, read from code (no name typed here)
  setS('myworkDmPeople', [r.name]); as(String(r.email).toLowerCase());
  const g = await call('GET', '/api/me/delivery');
  assert.equal(g.body.notify.channels.slack_dm, true, 'the page shows the DM they get today');
  assert.equal(g.body.notify.types.morning_brief.slack_dm, true);
  const p = await call('PUT', '/api/me/delivery', { notify: { channels: { email: true } } });
  assert.equal(p.body.notify.channels.slack_dm, true, 'an unrelated save does not drop the DM');
  const people = myWork.peopleFrom({});
  const saved = { [String(r.email).toLowerCase()]: p.body.notify };
  assert.ok(myWork.dmRecipients([r.name], people, saved).some(x => x.name === r.name), 'still on the 5am DM');
  setS('myworkDmPeople', []); fresh(); setS('myworkDmPeople', []); as(String(r.email).toLowerCase());
  assert.equal((await call('GET', '/api/me/delivery')).body.notify.channels.slack_dm, false, 'off the list: the plain default');
  assert.equal(defaultNotify(TEAM, { slackDm: true }).types.morning_brief.slack_dm, true);
  assert.equal(defaultNotify(TEAM).channels.slack_dm, false);
});
await ok('a client PUT keeps only client_waiting, never slack or push', async () => {
  fresh(); as('pat@northlake.example', { email: 'pat@northlake.example', ids: new Set(['brand_northlake_golf']) });
  const p = await call('PUT', '/api/me/delivery', { notify: { channels: { slack_dm: true, email: true, push: true }, types: { spend_high: { email: true } } } });
  assert.deepEqual(Object.keys(p.body.notify.types), ['client_waiting']);
  assert.equal(p.body.notify.channels.slack_dm, false); assert.equal(p.body.notify.channels.push, false);
  assert.deepEqual(p.body.catalog.types.map(t => t.id), ['client_waiting']);
});
await ok('personWants: false with nothing saved, true once a channel is on, false when the channel is not ready', async () => {
  fresh(); as('sam@agency.example');
  await call('GET', '/api/me/delivery');
  assert.equal(await personWants(env, d, 'sam@agency.example', 'spend_high', 'slack_dm'), false);
  assert.equal(await personWants(env, d, 'sam@agency.example', 'spend_high', 'in_app'), true);
  await call('PUT', '/api/me/delivery', { notify: { channels: { slack_dm: true, email: true } } });
  assert.equal(await personWants(env, d, 'sam@agency.example', 'spend_high', 'slack_dm'), true);
  assert.equal(await personWants(env, d, 'sam@agency.example', 'spend_high', 'email'), false, 'email is not ready (no sendEmail)');
  assert.equal(await personWants(env, { ...d, slackApi: null }, 'sam@agency.example', 'spend_high', 'slack_dm'), false);
  assert.equal((await notifyOf(env, 'nobody@agency.example')).preset, 'urgent_brief');
});
await ok("brandguard's PUT /api/me/delivery fields include notify", () => {
  assert.deepEqual(CLIENT_RULES.find(r => r.m === 'PUT' && r.p === '/api/me/delivery').fields, ['delivery', 'per', 'notify']);
});
await ok('morning brief DM recipients: the code list, opt ins, saved opt outs', () => {
  const people = [
    { name: 'Avery', email: 'avery@agency.example', slack: 'U_AVERY' },
    { name: 'Blake', email: 'blake@agency.example', slack: 'U_BLAKE' },
    { name: 'Casey', email: 'casey@agency.example', slack: 'U_CASEY' },
    { name: 'Drew', email: '', slack: 'U_DREW' },
  ];
  const on = applyChannels(OWNER, defaultNotify(OWNER), { slack_dm: true });               // urgent_brief + Slack: wants the brief
  const offCell = applyCell(OWNER, on, 'morning_brief', { slack_dm: false });                // custom, brief off
  const noSlack = defaultNotify(OWNER);                                                       // saved, Slack off
  const names = rs => rs.map(p => p.name).sort();
  assert.deepEqual(names(myWork.dmRecipients(['Avery', 'Drew'], people, {})), ['Avery', 'Drew'], 'nothing saved: today\'s list as is');
  assert.deepEqual(names(myWork.dmRecipients(['Avery'], people, { 'casey@agency.example': on })), ['Avery', 'Casey'], 'an opt in joins');
  assert.deepEqual(names(myWork.dmRecipients(['Avery', 'Blake'], people, { 'avery@agency.example': offCell, 'blake@agency.example': noSlack })), [], 'saved opt outs leave');
  assert.deepEqual(names(myWork.dmRecipients(['Drew'], people, {})), ['Drew'], 'a name with no email keeps today\'s behavior');
  assert.deepEqual(names(myWork.dmRecipients([], people, { 'casey@agency.example': on }, { slackReady: false })), [], 'no Slack: no opt in joins');
});
await ok('notify_chosen: false until a notify save, a delivery only save does not count, a dismiss (the default) does', async () => {
  fresh(); as('new@agency.example');
  assert.equal((await call('GET', '/api/me/delivery')).body.notify_chosen, false, 'never saved: v5 asks once');
  const p0 = await call('PUT', '/api/me/delivery', { delivery: { mode: 'mute' } });
  assert.equal(p0.body.notify_chosen, false, 'the older delivery fields are not a preset choice');
  const p1 = await call('PUT', '/api/me/delivery', { notify: { preset: 'urgent_brief' } });
  assert.equal(p1.body.notify_chosen, true, 'the default saved by a dismiss counts as chosen');
  assert.equal(p1.body.notify.preset, 'urgent_brief');
  assert.equal((await call('GET', '/api/me/delivery')).body.notify_chosen, true, 'never asked again');
  as('pick@agency.example');
  const p2 = await call('PUT', '/api/me/delivery', { notify: { preset: 'only_urgent' } });
  assert.equal(p2.body.notify.preset, 'only_urgent'); assert.equal(p2.body.notify_chosen, true);
  fresh(); as('pat@northlake.example', { email: 'pat@northlake.example', ids: new Set(['brand_northlake_golf']) });
  assert.equal((await call('GET', '/api/me/delivery')).body.notify_chosen, false, 'a client is asked too');
  assert.equal((await call('PUT', '/api/me/delivery', { notify: { preset: 'everything' } })).body.notify_chosen, true);
});
await ok('saveNotify makes the row with the old columns at their defaults', async () => {
  fresh(); as('sam@agency.example');
  await call('GET', '/api/me/delivery');
  await saveNotify(env, 'lee@agency.example', defaultNotify(TEAM));
  const r = db.prepare(`SELECT read_hour, mode, notify_json FROM p_person_delivery WHERE person_id = 'lee@agency.example'`).get();
  assert.equal(r.read_hour, 7); assert.equal(r.mode, 'now'); assert.equal(JSON.parse(r.notify_json).preset, 'urgent_brief');
});

console.log(process.exitCode ? 'test-notify: FAILED' : `test-notify: ${n} checks passed`);
