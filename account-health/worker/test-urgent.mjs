/* Offline checks for urgent alerts in Locus first (urgent.js, 2026-11-26): one row per person per thing, a second raise
 * updates, clear marks fixed, a raise after clear reopens the same row, hidden today stays hidden and comes back the
 * next day, who hears (brand buyer, all buyer, owner fallback, brandsFor, never a client), copies only when
 * notifyCopies is on and only on a new episode, GET /api/notices (alerts in order, a client sees none), notices/done
 * hides, the hourly sweep, and pulse.js raising and clearing an outage with its #outages post unchanged.
 * In-memory SQLite for D1, Slack mocked, invented people and brands.
 *   node test-urgent.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { raiseAlert, clearAlert, urgentSweep, alertPeople, _resetUrgent } from './src/urgent.js';
import { handleAutomations, _reset } from './src/automations.js';
import { _resetNotify } from './src/notify.js';
import { _resetFlags } from './src/jobflags.js';
import { pulseTick } from './src/pulse.js';

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
const BRANDS = [
  { act_id: 'brand_northlake_golf', name: 'Northlake Golf', active: 1 },
  { act_id: 'brand_pinecrest_candle', name: 'Pinecrest Candle', active: 1 },
];
function fresh() {
  db = new DatabaseSync(':memory:'); _reset(); _resetUrgent(); _resetNotify(); _resetFlags();
  db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
  db.exec(`CREATE TABLE briefs (act_id TEXT, date TEXT, status TEXT, text TEXT)`);
  db.exec(`CREATE TABLE accounts (act_id TEXT PRIMARY KEY, last_error TEXT)`);
}
const setS = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, typeof v === 'string' ? v : JSON.stringify(v));
const rows = sql => db.prepare(sql).all();
const slack = [];
let session = null, client = null, held = {};
const d = {
  getSetting: async (e, k) => db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k)?.value ?? null,
  listAccounts: async () => BRANDS,
  slackApi: async (e, method, args) => { slack.push([method, args]); return method === 'users.lookupByEmail' ? { ok: true, user: { id: 'U_' + args.email.slice(0, 3).toUpperCase() } } : { ok: true }; },
  isAdmin: async () => !!session, sessionEmail: async () => session, clientScope: () => client,
  brandsFor: async (e, email) => held[email] || null,
  emailAllowed: async (e, email) => !email.endsWith('@client.example'),
  alertsMuted: async (e, id) => id === 'brand_muted_test',
  ownerEmail: 'owner@agency.example',
};
const json = (o, status = 200) => ({ status, body: o });
const call = async (method, path, body) => handleAutomations(new Request('https://x.test' + path, { method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) }), env, path.split('?')[0], json, d);
const as = (email, c = null) => { session = email; client = c; };
let n = 0;
const ok = (name, fn) => Promise.resolve().then(fn).then(() => { n++; }, e => { console.error('FAILED: ' + name + '\n', e); process.exitCode = 1; });
const T0 = '2026-03-11T16:00:00Z';   // 10am Central
const hrs = h => new Date(Date.parse(T0) + h * 36e5).toISOString();
const SPEND = { type: 'spend_high', thing: 'brand_northlake_golf', brand_id: 'brand_northlake_golf', title: 'Northlake Golf is spending far above normal', body: 'Spent $900 against a normal $300 (budgets included).' };

await ok('one row per person per thing; a second raise updates, never inserts', async () => {
  fresh();
  const r1 = await raiseAlert(env, d, { ...SPEND, now: T0 });
  assert.deepEqual(r1.opened, ['owner@agency.example'], 'no buyer set: the owner');
  const r2 = await raiseAlert(env, d, { ...SPEND, body: 'Spent $1,000 against a normal $300.', now: hrs(1) });
  assert.deepEqual(r2.refreshed, ['owner@agency.example']);
  const all = rows(`SELECT * FROM p_notice`);
  assert.equal(all.length, 1);
  assert.equal(all[0].kind, 'alert'); assert.equal(all[0].ntype, 'spend_high'); assert.equal(all[0].thing_key, 'spend_high:brand_northlake_golf');
  assert.equal(all[0].created_at, new Date(T0).toISOString(), 'created_at stays the episode start');
  assert.equal(all[0].seen_at, hrs(1)); assert.match(all[0].body, /1,000/);
  assert.deepEqual(JSON.parse(all[0].button_json), { kind: 'open', page: 'meta/live-now', brand_id: 'brand_northlake_golf', label: 'Open' });
});
await ok('clear marks fixed; a raise after clear reopens the same row (count stays 1)', async () => {
  await clearAlert(env, d, { type: 'spend_high', thing: 'brand_northlake_golf', now: hrs(2) });
  let r = rows(`SELECT * FROM p_notice`)[0];
  assert.equal(r.state, 'done'); assert.equal(r.answer, 'fixed'); assert.equal(r.done_by, 'locus');
  const again = await raiseAlert(env, d, { ...SPEND, now: hrs(3) });
  assert.deepEqual(again.opened, ['owner@agency.example'], 'a new episode');
  assert.equal(rows(`SELECT * FROM p_notice`).length, 1);
  r = rows(`SELECT * FROM p_notice`)[0];
  assert.equal(r.state, 'open'); assert.equal(r.created_at, hrs(3)); assert.equal(r.answer, null); assert.equal(r.done_at, null);
});
await ok('hidden today stays hidden; it comes back the next day if still true', async () => {
  fresh(); as('owner@agency.example');
  await raiseAlert(env, d, { ...SPEND, now: T0 });
  const id = rows(`SELECT id FROM p_notice`)[0].id;
  const nowD = { ...d, now: () => new Date(T0) };
  const h = await handleAutomations(new Request('https://x.test/api/notices/done', { method: 'POST', body: JSON.stringify({ id }) }), env, '/api/notices/done', json, nowD);
  assert.deepEqual(h.body, { ok: true, state: 'done', answer: 'hidden' });
  const no = await handleAutomations(new Request('https://x.test/api/notices/done', { method: 'POST', body: JSON.stringify({ id, done: false }) }), env, '/api/notices/done', json, nowD);
  assert.equal(no.status, 409); assert.match(no.body.error, /clears itself when it is fixed/);
  const same = await raiseAlert(env, d, { ...SPEND, now: hrs(4) });
  assert.deepEqual(same.hidden, ['owner@agency.example']);
  assert.equal(rows(`SELECT state FROM p_notice`)[0].state, 'done');
  const next = await raiseAlert(env, d, { ...SPEND, now: hrs(24) });
  assert.deepEqual(next.opened, ['owner@agency.example'], 'the next Central day it reopens');
  assert.equal(rows(`SELECT state FROM p_notice`)[0].state, 'open'); assert.equal(rows(`SELECT COUNT(*) AS c FROM p_notice`)[0].c, 1);
});
await ok('hide, then it clears, then it breaks again the same day: a new episode opens the row again', async () => {
  fresh(); as('owner@agency.example');
  await raiseAlert(env, d, { ...SPEND, now: T0 });
  const id = rows(`SELECT id FROM p_notice`)[0].id;
  const nowD = { ...d, now: () => new Date(T0) };
  await handleAutomations(new Request('https://x.test/api/notices/done', { method: 'POST', body: JSON.stringify({ id }) }), env, '/api/notices/done', json, nowD);
  assert.equal(rows(`SELECT answer FROM p_notice`)[0].answer, 'hidden');
  await clearAlert(env, d, { type: 'spend_high', thing: 'brand_northlake_golf', now: hrs(1) });
  assert.equal(rows(`SELECT answer FROM p_notice`)[0].answer, 'fixed', 'the hidden episode ended with the fix');
  const back = await raiseAlert(env, d, { ...SPEND, now: hrs(5) });
  assert.deepEqual(back.opened, ['owner@agency.example'], 'same Central day, new episode: open again');
  assert.equal(rows(`SELECT state FROM p_notice`)[0].state, 'open'); assert.equal(rows(`SELECT COUNT(*) AS c FROM p_notice`)[0].c, 1);
});
await ok('who hears: brand buyer, else all buyer, else owner; brandsFor drops; never a client', async () => {
  fresh();
  assert.deepEqual(await alertPeople(env, d, 'spend_low', 'brand_northlake_golf'), ['owner@agency.example']);
  setS('automationRoles', { all: { buyer: 'alex@agency.example' } });
  assert.deepEqual(await alertPeople(env, d, 'spend_low', 'brand_northlake_golf'), ['alex@agency.example']);
  setS('automationRoles', { all: { buyer: 'alex@agency.example' }, brand_northlake_golf: { buyer: 'sam@agency.example', owner: 'robin@agency.example' } });
  assert.deepEqual(await alertPeople(env, d, 'spend_high', 'brand_northlake_golf'), ['sam@agency.example']);
  assert.deepEqual(await alertPeople(env, d, 'brief_failed', 'brand_northlake_golf'), ['owner@agency.example', 'robin@agency.example']);
  assert.deepEqual(await alertPeople(env, d, 'outage', null), ['owner@agency.example']);
  held = { 'sam@agency.example': new Set(['brand_pinecrest_candle']) };
  assert.deepEqual(await alertPeople(env, d, 'spend_high', 'brand_northlake_golf'), [], 'held to another brand: dropped');
  held = {};
  setS('automationRoles', { brand_northlake_golf: { buyer: 'pat@client.example' } });
  setS('clientUsers', { 'pat@client.example': { brands: ['brand_northlake_golf'] } });
  assert.deepEqual(await alertPeople(env, d, 'spend_high', 'brand_northlake_golf'), [], 'a client is never a recipient');
});
await ok('muted test brands and brands we do not run get no row', async () => {
  fresh();
  assert.equal((await raiseAlert(env, d, { ...SPEND, brand_id: 'brand_muted_test', thing: 'brand_muted_test', now: T0 })).skipped, 'muted test brand');
  assert.equal((await raiseAlert(env, d, { ...SPEND, brand_id: 'brand_gone', thing: 'brand_gone', now: T0 })).skipped, 'not a brand we run');
  let count = 0; try { count = rows(`SELECT * FROM p_notice`).length; } catch { count = 0; }
  assert.equal(count, 0);
});
await ok('notifyCopies off: no Slack call; on: one DM on a new episode only, never on a refresh', async () => {
  fresh(); slack.length = 0;
  as('owner@agency.example');
  await call('PUT', '/api/me/delivery', { notify: { channels: { slack_dm: true } } });
  await raiseAlert(env, d, { ...SPEND, now: T0 });
  assert.equal(slack.length, 0, 'copies off: nothing outside Locus');
  assert.equal(JSON.parse(rows(`SELECT sent_json FROM p_notice`)[0].sent_json).copies, 'off');
  await clearAlert(env, d, { type: 'spend_high', thing: 'brand_northlake_golf', now: hrs(1) });
  setS('notifyCopies', 'on');
  await raiseAlert(env, d, { ...SPEND, now: hrs(2) });
  assert.equal(slack.filter(s => s[0] === 'chat.postMessage').length, 1, 'one DM on the new episode');
  assert.equal(JSON.parse(rows(`SELECT sent_json FROM p_notice`)[0].sent_json).slack, 'sent');
  await raiseAlert(env, d, { ...SPEND, now: hrs(3) });
  assert.equal(slack.filter(s => s[0] === 'chat.postMessage').length, 1, 'a refresh never pings again');
  const dm = slack.find(s => s[0] === 'chat.postMessage')[1].text;
  assert.ok(!/[\u2014\u2013]/.test(dm));
});
await ok('GET /api/notices: alerts in the stated order with counts and features; a client sees none', async () => {
  fresh(); as('owner@agency.example');
  await raiseAlert(env, d, { type: 'spend_low', thing: 'brand_pinecrest_candle', brand_id: 'brand_pinecrest_candle', title: 'Pinecrest Candle spent far below normal', now: T0 });
  await raiseAlert(env, d, { ...SPEND, now: hrs(1) });
  await raiseAlert(env, d, { type: 'outage', thing: 'meta', title: 'Meta is having problems', now: T0 });
  await raiseAlert(env, d, { type: 'claude_failed', thing: 'agency', title: 'Claude key or credit failed', now: T0 });
  const g = await call('GET', '/api/notices');
  assert.deepEqual(g.body.alerts.map(a => a.type), ['outage', 'claude_failed', 'spend_high', 'spend_low']);
  assert.equal(g.body.counts.alerts, 4);
  assert.ok(g.body.alerts.every(a => a.urgent && a.thing && a.seen_at));
  assert.equal(g.body.bell.filter(r => r.kind === 'alert').length, 4, 'also in the bell');
  assert.deepEqual(Object.keys(g.body.features).sort(), ['creatorProgram', 'siteReviewsOpen', 'socialPosting']);
  assert.equal(g.body.features.socialPosting, true, 'social runs as today until the owner parks it'); assert.equal(g.body.features.creatorProgram, false, 'an empty workspace starts without the creator program');
  db.prepare(`INSERT INTO p_notice (id, person_id, brand_id, kind, ntype, thing_key, title, state, home, created_at) VALUES ('x1', 'pat@client.example', 'brand_northlake_golf', 'alert', 'spend_high', 'spend_high:brand_northlake_golf', 'x', 'open', 1, ?)`).run(T0);
  as('pat@client.example', { email: 'pat@client.example', ids: new Set(['brand_northlake_golf']) });
  const c = await call('GET', '/api/notices');
  assert.deepEqual(c.body.alerts, []); assert.equal(c.body.bell.length, 0);
  assert.ok('features' in c.body, 'a client learns the switches too');
});
await ok('the sweep clears spend after 36 hours, Claude after 24, meta sync when last_error is empty, brief when sent', async () => {
  fresh();
  await raiseAlert(env, d, { ...SPEND, now: T0 });
  await raiseAlert(env, d, { type: 'spend_low', thing: 'brand_pinecrest_candle', brand_id: 'brand_pinecrest_candle', title: 'x', now: hrs(20) });
  setS('lastClaudeAlert', { at: Date.parse(T0) });
  await raiseAlert(env, d, { type: 'claude_failed', thing: 'agency', title: 'x', now: T0 });
  db.prepare(`INSERT INTO accounts VALUES ('act_100', 'ad sync: boom')`).run();
  await raiseAlert(env, d, { type: 'meta_sync', thing: 'brand_northlake_golf', brand_id: 'brand_northlake_golf', title: 'x', button: { act: 'act_100' }, now: hrs(30) });
  db.prepare(`INSERT INTO briefs VALUES ('brand_pinecrest_candle', '2026-03-10', 'error', 'x')`).run();
  await raiseAlert(env, d, { type: 'brief_failed', thing: 'brand_pinecrest_candle', brand_id: 'brand_pinecrest_candle', title: 'x', button: { date: '2026-03-10' }, now: hrs(30) });
  const open = () => rows(`SELECT ntype FROM p_notice WHERE state = 'open' ORDER BY ntype`).map(r => r.ntype);
  await urgentSweep(env, d, { now: hrs(35) });
  assert.deepEqual(open(), ['brief_failed', 'claude_failed', 'meta_sync', 'spend_high', 'spend_low'].filter(x => x !== 'claude_failed'), 'claude cleared after 24 quiet hours; spend_high (35h) stays');
  await urgentSweep(env, d, { now: hrs(37) });
  assert.deepEqual(open(), ['brief_failed', 'meta_sync', 'spend_low'], 'spend_high cleared after 36 hours unseen');
  db.prepare(`UPDATE accounts SET last_error = NULL`).run();
  db.prepare(`UPDATE briefs SET status = 'sent'`).run();
  await urgentSweep(env, d, { now: hrs(38) });
  assert.deepEqual(open(), ['spend_low']);
  await urgentSweep(env, d, { now: hrs(57) });
  assert.deepEqual(open(), [], 'spend_low cleared 37 hours after it was last seen');
});
await ok('pulse: an outage raises on degraded Meta and clears when operational; the #outages post is unchanged', async () => {
  fresh();
  let metaSt = 'No known issues';
  const F = async url => {
    if (/metastatus/.test(url)) return new Response(JSON.stringify([{ id: 'ads-manager', name: 'Ads Manager', services: [{ name: 'Ads Creation', status: metaSt }] }]));
    if (/google/.test(url)) return new Response('[]');
    if (/shopify/.test(url)) return new Response('nope', { status: 500 });
    return new Response(JSON.stringify({ components: [] }));
  };
  const calls = [];
  const urgent = { raise: o => { calls.push(['raise', o.type, o.thing, o.title]); }, clear: (t, th) => { calls.push(['clear', t, th]); } };
  const withU = [], without = [];
  const sk = list => async (e, m, b) => { if (m === 'chat.postMessage') list.push(b); return { ok: true, channel: b.channel, ts: '1' }; };
  await pulseTick(env, { F, slackApi: sk(withU), urgent });
  assert.ok(calls.some(c => c[0] === 'clear' && c[2] === 'meta'), 'operational Meta clears');
  assert.ok(!calls.some(c => c[2] === 'shopify'), 'a feed that never loaded neither raises nor clears');
  metaSt = 'Major disruption'; calls.length = 0;
  await pulseTick(env, { F, slackApi: sk(withU), urgent });
  assert.deepEqual(calls.find(c => c[2] === 'meta'), ['raise', 'outage', 'meta', 'Meta Ads is having problems']);
  /* The same change without urgent: the #outages card is the same. */
  db.exec(`DELETE FROM settings`); metaSt = 'No known issues';
  await pulseTick(env, { F, slackApi: sk(without) });
  metaSt = 'Major disruption';
  await pulseTick(env, { F, slackApi: sk(without) });
  const strip = p => JSON.stringify(p).replace(/pulse:alert:\d+/g, 'ID').replace(/[A-Z][a-z]{2} \d+, \d+:\d+ [AP]M [A-Z]{3}/g, 'WHEN');
  assert.equal(withU.length, 1); assert.equal(without.length, 1);
  assert.equal(strip(withU[0]), strip(without[0]));
  metaSt = 'No known issues'; calls.length = 0;
  await pulseTick(env, { F, slackApi: sk(withU), urgent });
  assert.ok(calls.some(c => c[0] === 'clear' && c[2] === 'meta'));
});

console.log(process.exitCode ? 'test-urgent: FAILED' : `test-urgent: ${n} checks passed`);
