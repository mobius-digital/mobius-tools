/* Offline checks for the notify presets (notify.js, 2026-11-26): the default sends nothing, each preset fills the right
 * cells, a channel change refills unless custom, a cell edit sets custom, cleanNotify, wants, the GET and PUT of
 * /api/me/delivery through handleAutomations, owner only types, brandguard's field list, and the morning brief DM
 * recipient rule (mywork.js dmRecipients). In-memory SQLite for D1, Slack mocked, invented people and brands.
 *   node test-notify.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { NOTIFY_TYPES, NOTIFY_PRESETS, CLIENT_PRESETS, catalogView, catalogTypes, fillPreset, applyPreset, applyChannels, applyCell, cleanNotify, defaultNotify, wants, personWants, notifyOf, saveNotify, _resetNotify } from './src/notify.js';
import { handleAutomations, _reset } from './src/automations.js';
import { CLIENT_RULES, SETUP_MAY } from './src/brandguard.js';
import { readFileSync } from 'node:fs';
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

const BRANDS = [{ act_id: 'brand_northlake_golf', name: 'Northlake Golf', tz: 'America/Chicago', active: 1 },
  { act_id: 'brand_southpine_tees', name: 'Southpine Tees', tz: 'America/Chicago', active: 1 }];
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

const TEAM = catalogTypes({ owner: false }), OWNER = catalogTypes({ owner: true }), CLIENT = catalogTypes({ client: true });
const CLIENT_IDS = ['client_approval_due', 'client_waiting', 'client_replies', 'client_daily', 'client_reports'];
const PAT = { email: 'pat@northlake.example', ids: new Set(['brand_northlake_golf']) };
const TEAM_IDS = NOTIFY_TYPES.filter(t => t.who !== 'client').map(t => t.id);
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
await ok('cleanNotify drops unknown ids, coerces booleans, and holds a client to the client types', () => {
  const c = cleanNotify({ preset: 'custom', channels: { slack_dm: 1, email: true, fax: true }, types: { spend_high: { slack_dm: true, email: 'yes' }, nope: { slack_dm: true } } }, TEAM);
  assert.deepEqual(c.channels, { slack_dm: false, email: true, push: false });
  assert.ok(!('nope' in c.types)); assert.deepEqual(c.types.spend_high, { slack_dm: true, email: false, push: false });
  assert.ok(!('fax' in c.channels));
  const cl = cleanNotify({ preset: 'custom', channels: { slack_dm: true, email: true, push: true }, types: { client_waiting: { slack_dm: true, email: true, push: true }, spend_high: { email: true } } }, catalogTypes({ client: true }), { client: true });
  assert.deepEqual(Object.keys(cl.types), CLIENT_IDS);
  assert.equal(cl.audience, 'client');
  assert.deepEqual(cl.channels, { slack_dm: true, email: true, push: true }, 'Slack DM, email and phone per type, as for the team');
  assert.deepEqual(cl.types.client_waiting, { slack_dm: true, email: true, push: true });
  assert.ok(!('spend_high' in cl.types), 'an internal alert never sticks to a client');
  assert.equal(wants(cl, 'client_waiting', 'push'), false, 'no phone sender yet');
});
await ok('wants: in_app always true, push always false (no sender yet)', () => {
  const s = applyChannels(TEAM, applyPreset(TEAM, defaultNotify(TEAM), 'everything'), { slack_dm: true, email: true, push: true });
  assert.equal(wants(null, 'spend_high', 'in_app'), true);
  assert.equal(wants(s, 'spend_high', 'push'), false);
  assert.equal(wants(s, 'spend_high', 'email'), true);
});
await ok('owner only types are missing from a teammate catalog; a client gets only the client types', () => {
  const ids = TEAM.map(t => t.id);
  for (const id of ['claude_failed', 'meta_sync', 'outage', 'war_room']) assert.ok(!ids.includes(id), id);
  assert.ok(OWNER.some(t => t.id === 'outage'));
  assert.deepEqual(catalogTypes({ client: true }).map(t => t.id), CLIENT_IDS);
  assert.ok(!OWNER.some(t => t.who === 'client'), 'no client type in a team list, not even the owner\'s');
  assert.equal(NOTIFY_TYPES.length, 26, '15 plus the 7 alarms (alarms.js) plus 4 more client types');
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
await ok('a client PUT keeps only the client types; a team type in the body is dropped', async () => {
  fresh(); as('pat@northlake.example', PAT);
  const p = await call('PUT', '/api/me/delivery', { notify: { channels: { slack_dm: true, email: true, push: true }, types: { spend_high: { email: true } } } });
  assert.deepEqual(Object.keys(p.body.notify.types), CLIENT_IDS);
  assert.equal(p.body.notify.channels.slack_dm, true); assert.equal(p.body.notify.channels.email, true);
  assert.deepEqual(p.body.catalog.types.map(t => t.id), CLIENT_IDS);
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
await ok('notify_chosen: false until a notify save, a delivery only save does not count, a preset save does', async () => {
  fresh(); as('new@agency.example');
  assert.equal((await call('GET', '/api/me/delivery')).body.notify_chosen, false, 'never saved: v5 asks once');
  const p0 = await call('PUT', '/api/me/delivery', { delivery: { mode: 'mute' } });
  assert.equal(p0.body.notify_chosen, false, 'the older delivery fields are not a preset choice');
  const p1 = await call('PUT', '/api/me/delivery', { notify: { preset: 'urgent_brief' } });
  assert.equal(p1.body.notify_chosen, true, 'saving the default preset counts as chosen');
  assert.equal(p1.body.notify.preset, 'urgent_brief');
  assert.equal((await call('GET', '/api/me/delivery')).body.notify_chosen, true, 'never asked again');
  as('pick@agency.example');
  const p2 = await call('PUT', '/api/me/delivery', { notify: { preset: 'only_urgent' } });
  assert.equal(p2.body.notify.preset, 'only_urgent'); assert.equal(p2.body.notify_chosen, true);
  as('both@agency.example');
  const p3 = await call('PUT', '/api/me/delivery', { notify: { channels: { slack_dm: true, email: true }, preset: 'everything' } });
  assert.equal(p3.body.notify.preset, 'everything', 'the first preset sheet body: channels and preset in one save');
  assert.equal(p3.body.notify.channels.slack_dm, true); assert.equal(p3.body.notify.channels.email, true);
  assert.equal(p3.body.notify.types.ad_calls.slack_dm, true, 'a picked channel fills the preset');
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

/* ---- client presets (2026-11-26) ---- */
await ok('the client list: five types, the same three presets in client words, urgent = an approval due soon', () => {
  assert.ok(CLIENT.every(t => t.who === 'client'));
  assert.deepEqual(CLIENT.filter(t => t.urgent).map(t => t.id), ['client_approval_due']);
  const ch = { slack_dm: false, email: true, push: false };
  const ids = preset => Object.entries(fillPreset(CLIENT, preset, ch)).filter(([, c]) => c.email).map(([id]) => id).sort();
  assert.deepEqual(ids('only_urgent'), ['client_approval_due']);
  assert.deepEqual(ids('urgent_brief'), ['client_approval_due', 'client_daily', 'client_reports'], 'the morning brief for a client is the daily update and reports');
  assert.deepEqual(ids('everything'), [...CLIENT_IDS].sort());
  const v = catalogView({ slackApi: true }, { client: true }, false);
  assert.equal(v.audience, 'client');
  assert.deepEqual(v.presets.map(p => p.id), NOTIFY_PRESETS.map(p => p.id));
  assert.deepEqual(v.presets, CLIENT_PRESETS);
  assert.deepEqual(v.channels.map(c => c.id), ['in_app', 'slack_dm', 'email', 'push']);
  assert.equal(v.channels.find(c => c.id === 'slack_dm').ready, true, 'Slack DM per type, as for the team');
  const words = JSON.stringify(v);
  assert.ok(!/money at risk|broken|meta sync|claude|outage|spend far|war room/i.test(words), 'no internal alert words');
  assert.ok(!/[\u2013\u2014]/.test(words), 'no dashes');
  assert.equal(catalogView({}, { owner: true }, false).audience, 'team');
});
await ok('a client\'s saved choice never opts them into a team brief or an internal alert', async () => {
  fresh(); as('pat@northlake.example', PAT);
  await call('PUT', '/api/me/delivery', { notify: { preset: 'everything', channels: { slack_dm: true, email: true } } });
  const raw = JSON.parse(db.prepare(`SELECT notify_json FROM p_person_delivery WHERE person_id = 'pat@northlake.example'`).get().notify_json);
  assert.equal(raw.audience, 'client', 'stored with its audience');
  const asTeam = cleanNotify(raw, OWNER);
  assert.ok(allCells(asTeam.types).every(v => v === false), 'read with a team list: nothing on');
  assert.deepEqual(asTeam.channels, { slack_dm: false, email: false, push: false });
  assert.equal(await personWants(env, d, 'pat@northlake.example', 'spend_high', 'slack_dm'), false);
  assert.equal(await personWants(env, d, 'pat@northlake.example', 'account_blocked', 'slack_dm'), false);
  const people = [{ name: 'Pat', email: 'pat@northlake.example', slack: 'U_PAT' }];
  assert.deepEqual(myWork.dmRecipients([], people, { 'pat@northlake.example': raw }), [], 'never on the team morning DM');
});
await ok('a client login end to end: asked once, own brand only, client list only, saved, never asked again', async () => {
  fresh(); as('pat@northlake.example', PAT);
  const g = await call('GET', '/api/me/delivery');
  assert.equal(g.status, 200);
  assert.equal(g.body.notify_chosen, false, 'the first sign in sheet asks a client too');
  assert.equal(g.body.catalog.audience, 'client');
  assert.deepEqual(g.body.catalog.types.map(t => t.id), CLIENT_IDS);
  assert.equal(g.body.notify.preset, 'urgent_brief');
  assert.deepEqual(g.body.notify.channels, { slack_dm: false, email: false, push: false }, 'nothing leaves Locus until a channel is on');
  assert.deepEqual(g.body.brands, [{ id: 'brand_northlake_golf', name: 'Northlake Golf' }], 'its own brand and no other');
  const text = JSON.stringify(g.body);
  assert.ok(!text.includes('Southpine') && !text.includes('brand_southpine_tees'), 'another brand never shows');
  for (const id of TEAM_IDS) assert.ok(!text.includes('"' + id + '"'), 'no internal type: ' + id);
  const g2 = await call('GET', '/api/me/delivery?as=client&act=brand_southpine_tees');
  assert.ok(!g2.body.preview, 'a client asking for the preview gets its own page');
  assert.deepEqual(g2.body.brands, [{ id: 'brand_northlake_golf', name: 'Northlake Golf' }]);
  const p = await call('PUT', '/api/me/delivery', { notify: { preset: 'only_urgent', channels: { email: true } } });
  assert.equal(p.body.notify_chosen, true);
  assert.equal(p.body.notify.preset, 'only_urgent');
  assert.deepEqual(Object.entries(p.body.notify.types).filter(([, c]) => c.email).map(([id]) => id), ['client_approval_due']);
  const p2 = await call('PUT', '/api/me/delivery', { notify: { types: { client_replies: { email: true }, outage: { email: true } } } });
  assert.equal(p2.body.notify.preset, 'custom');
  assert.equal(p2.body.notify.types.client_replies.email, true);
  assert.ok(!('outage' in p2.body.notify.types));
  const again = await call('GET', '/api/me/delivery');
  assert.equal(again.body.notify_chosen, true, 'never asked again');
  assert.equal(again.body.notify.types.client_replies.email, true);
});
await ok('See as client: the team reads the client page with its default, for its own brand, and nothing is saved', async () => {
  fresh(); as('sam@agency.example');
  await call('GET', '/api/me/delivery');
  const rows = () => db.prepare(`SELECT COUNT(*) AS n FROM p_person_delivery`).get().n;
  const before = rows();
  const g = await call('GET', '/api/me/delivery?as=client&act=brand_northlake_golf');
  assert.equal(g.status, 200);
  assert.equal(g.body.preview, true);
  assert.equal(g.body.catalog.audience, 'client');
  assert.deepEqual(g.body.catalog.types.map(t => t.id), CLIENT_IDS);
  assert.deepEqual(g.body.catalog.presets, CLIENT_PRESETS);
  assert.equal(g.body.notify.preset, 'urgent_brief');
  assert.deepEqual(g.body.brands, [{ id: 'brand_northlake_golf', name: 'Northlake Golf' }]);
  assert.ok(!('per' in g.body) && !('delivery' in g.body), 'no automation or team choice comes along');
  const text = JSON.stringify(g.body);
  for (const id of TEAM_IDS) assert.ok(!text.includes('"' + id + '"'), 'no internal type: ' + id);
  const p = await call('PUT', '/api/me/delivery?as=client', { notify: { preset: 'everything', channels: { email: true } } });
  assert.equal(p.status, 400, 'a save while seeing as client is refused');
  assert.equal(rows(), before, 'nothing written');
  const mine = await call('GET', '/api/me/delivery');
  assert.equal(mine.body.notify_chosen, false, 'the teammate\'s own choice is untouched');
  assert.equal(mine.body.catalog.audience, 'team');
  const scoped = { ...d, brandsFor: async () => new Set(['brand_southpine_tees']) };
  const other = await call('GET', '/api/me/delivery?as=client&act=brand_northlake_golf', null, scoped);
  assert.deepEqual(other.body.brands, [], 'a brand this teammate cannot see is not named');
});
await ok('brandguard: a client may read and save its own delivery (also on Get started); both copies identical', () => {
  assert.ok(CLIENT_RULES.some(r => r.m === 'GET' && r.p === '/api/me/delivery'));
  assert.ok(CLIENT_RULES.some(r => r.m === 'PUT' && r.p === '/api/me/delivery'));
  assert.ok(SETUP_MAY.has('GET /api/me/delivery') && SETUP_MAY.has('PUT /api/me/delivery'));
  const here = new URL('.', import.meta.url);
  assert.equal(readFileSync(new URL('./src/brandguard.js', here), 'utf8'), readFileSync(new URL('../../profit/worker/src/brandguard.js', here), 'utf8'));
});

console.log(process.exitCode ? 'test-notify: FAILED' : `test-notify: ${n} checks passed`);
