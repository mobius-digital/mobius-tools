/* Platform status inside Locus (pulse.js, 2026-11-06): a change posts one #outages card; "Send to all clients"
   reaches EVERY active brand with a client channel (the old Pulse's hand-ticked list missed Ice & Gold and Yak). */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { pulseTick, pulseStatus, pulseButton } from './src/pulse.js';
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE brands (id TEXT, name TEXT, status TEXT, client_channel TEXT);`);
for (const [id, n, s, c] of [['b1', 'Bonk', 'active', 'C1'], ['b2', 'Ice & Gold', 'active', 'C2'], ['b3', 'Yak Sports', 'active', 'C3'], ['b4', 'Lucky', 'active', null], ['b5', 'Galway', 'paused', 'C5']])
  db.prepare(`INSERT INTO brands VALUES (?,?,?,?)`).run(id, n, s, c);
const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => db.prepare(sql).run(...args) });
const env = { DB: { prepare: sql => stmt(sql) } };
let metaSt = 'No known issues';
const F = async url => {
  if (/metastatus/.test(url)) return new Response(JSON.stringify([{ id: 'ads-manager', name: 'Ads Manager', services: [{ name: 'Ads Creation', status: metaSt }] }]));
  if (/google/.test(url)) return new Response('[]');
  if (/shopify/.test(url)) return new Response('nope', { status: 500 });
  return new Response(JSON.stringify({ components: [] }));
};
const posts = [], updates = [];
const slackApi = async (e, m, b) => { if (m === 'chat.postMessage') { posts.push(b); return { ok: b.channel !== 'C3x', channel: b.channel, ts: String(posts.length) }; } if (m === 'chat.update') updates.push(b); return { ok: true }; };
let r = await pulseTick(env, { F, slackApi });
assert.equal(r.changes, 0); assert.equal(posts.length, 0, 'first read only learns the state');
r = await pulseTick(env, { F, slackApi }); assert.equal(posts.length, 0, 'no change, no post');
metaSt = 'Major disruption';
r = await pulseTick(env, { F, slackApi });
assert.equal(r.changes, 1); assert.equal(posts.length, 1); assert.equal(posts[0].channel, 'C0BHXMYRE5V');
const card = JSON.stringify(posts[0]); assert.match(card, /Meta: Ads Manager/); assert.match(card, /pulse_send/); assert.match(card, /Outage/);
const s = await pulseStatus(env); assert.equal(s.incidents.length, 1); assert.equal(s.platforms.find(p => p.id === 'meta').state.worst, 'outage');
const id = JSON.parse(card).attachments[0].blocks.at(-1).elements[0].value;
const waits = []; const ctx = { waitUntil: p => waits.push(p) };
const tap = { type: 'block_actions', user: { id: 'U1' }, channel: { id: 'C0BHXMYRE5V' }, message: { ts: '1' }, actions: [{ action_id: 'pulse_send', value: id }] };
await pulseButton(env, ctx, tap, { slackApi, ACK: () => 'ack' }); await Promise.all(waits);
const sent = posts.slice(1).map(p => p.channel); assert.deepEqual(sent, ['C1', 'C2', 'C3'], 'every active client channel, none paused, none missing');
assert.ok(!JSON.stringify(posts[1]).includes('pulse_send'), 'clients get no button'); assert.ok(!JSON.stringify(posts[1]).includes('Locus'), 'no Locus link to clients');
assert.match(JSON.stringify(updates.at(-1)), /Sent to 3 of 3 clients/);
waits.length = 0; await pulseButton(env, ctx, tap, { slackApi, ACK: () => 'ack' }); await Promise.all(waits);
assert.equal(posts.length, 4, 'a second tap sends nothing');
metaSt = 'No known issues'; r = await pulseTick(env, { F, slackApi });
assert.match(JSON.stringify(posts.at(-1)), /Working again/);
console.log('PASS test-pulse: 5 checks');
