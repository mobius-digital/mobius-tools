/* Offline checks for CLIENT REQUESTS AND APPROVALS (2026-10-10, src/requests.js): the real account-health worker in
 * node against an in-memory SQLite (node:sqlite), brandguard.js in front exactly as in production, Slack mocked
 * (nothing leaves the machine). Same harness as test-clients.mjs.
 *   node test-requests.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');

/* ---------------- databases ---------------- */
const mkDb = () => {
  const db = new DatabaseSync(':memory:');
  const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
  const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
  const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } }; };
  return { db, DB: { prepare: stmt, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } } };
};
const { db, DB } = mkDb();
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied */ } } };
load(path.join(root, 'profit', 'worker', 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'migrations', 'brand-001.sql'));
load(path.join(here, 'schema.sql'));
db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, source, internal_channel, client_channel) VALUES
  ('brand_alpha', 'alpha', 'Alpha Golf', 'active', 'USD', 'America/Chicago', 'locus', 'C_ALPHA_IN', 'C_ALPHA_CLIENT'),
  ('brand_beta', 'beta', 'Beta Socks', 'active', 'USD', 'America/Chicago', 'locus', 'C_BETA_IN', 'C_BETA_CLIENT')`);
const AD1 = 'a'.repeat(24), AD2 = 'b'.repeat(24), ADB = 'c'.repeat(24);
db.exec(`INSERT INTO p_studio_ad (id, act_id, status, spec_json) VALUES ('${AD1}', 'brand_alpha', 'review', '{"headline":"Burgundy is back"}'), ('${AD2}', 'brand_alpha', 'review', '{}'), ('${ADB}', 'brand_beta', 'review', '{}')`);
const setSetting = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, JSON.stringify(v));
setSetting('clientUsers', { 'nick@alpha.com': { brands: ['brand_alpha'], name: 'Nick' }, 'bea@beta.com': { brands: ['brand_beta'], name: 'Bea' } });
setSetting('userBrands', { 'noma@go-mobius-digital.com': ['brand_beta'] });

const cal = mkDb();
cal.db.exec(`CREATE TABLE events (id TEXT PRIMARY KEY, brand_id TEXT, name TEXT, type TEXT, status TEXT, brief TEXT, launch_date TEXT, promo_end_date TEXT, inventory_date TEXT, asset_deadline TEXT, teaser_start TEXT, channels TEXT, owner TEXT, notes TEXT, assets_link TEXT, created_at TEXT, updated_at TEXT, updated_by TEXT, locus_brand TEXT, asana TEXT, ticks TEXT);
  CREATE TABLE changelog (id TEXT, brand_id TEXT, event_id TEXT, event_name TEXT, change_summary TEXT, changed_by TEXT, created_at TEXT);
  CREATE TABLE people (email TEXT, name TEXT);
  INSERT INTO events (id, brand_id, name, type, status, brief, launch_date, channels, locus_brand, ticks) VALUES ('ev_a', 'alpha', 'Alpha drop', 'product_launch', 'tentative', '20% off', '2026-11-01', '{}', 'brand_alpha', '{}'), ('ev_b', 'beta', 'Beta sale', 'promo', 'tentative', '', '2026-11-02', '{}', 'brand_beta', '{}');`);

/* ---------------- tokens and mocks ---------------- */
const SECRET = 'test-session-secret';
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const mint = email => { const p = b64u(`${email}|${Date.now() + 3600e3}`); return `mds.${p}.${b64u(crypto.createHmac('sha256', SECRET).update(p).digest())}`; };
const CLIENT = mint('nick@alpha.com'), BEA = mint('bea@beta.com'), TEAM = mint('ahsan@go-mobius-digital.com'), NOMA = mint('noma@go-mobius-digital.com');

const realFetch = globalThis.fetch;
const slack = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url?.url || url);
  if (u === 'https://slack.com/api/chat.postMessage') { slack.push(JSON.parse(init.body)); return new Response(JSON.stringify({ ok: true, ts: '1.1', channel: JSON.parse(init.body).channel }), { status: 200 }); }
  return new Response(JSON.stringify({ error: 'offline: ' + u }), { status: 503 });
};

const AH = (await import('./src/worker.js')).default;
const env = { DB, CAL: cal.DB, SESSION_SECRET: SECRET, SLACK_BOT_TOKEN: 'xoxb-test' };
const ctx = { waitUntil() {} };
const ah = async (tok, method, p, body) => {
  const res = await AH.fetch(new Request(`https://ah.test${p}`, { method, headers: { ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, ctx);
  let j = null; try { j = await res.json(); } catch {}
  return { status: res.status, j };
};

const results = [];
async function check(name, fn) { try { await fn(); results.push(true); console.log('PASS ', name); } catch (e) { results.push(false); console.log('FAIL ', name, '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }
const ids = {};

/* ---------------- the checks ---------------- */
await check('brandguard.js is byte-identical in both workers and pins every Requests route to the client\'s brand', async () => {
  const a = fs.readFileSync(path.join(here, 'src', 'brandguard.js'), 'utf8');
  assert.equal(a, fs.readFileSync(path.join(root, 'profit', 'worker', 'src', 'brandguard.js'), 'utf8'));
  const { CLIENT_RULES } = await import('./src/brandguard.js');
  const mine = CLIENT_RULES.filter(r => r.p && r.p.startsWith('/api/requests'));
  assert.deepEqual(mine.map(r => `${r.m} ${r.p} ${r.act}`).sort(), ['GET /api/requests need', 'POST /api/requests need', 'POST /api/requests/decide need', 'POST /api/requests/reply need']);
});

await check('the team sends approvals: Studio ads, a calendar date, an offer, a link (other brands\' ads and dates refused)', async () => {
  let r = await ah(TEAM, 'POST', '/api/requests', { act: 'brand_alpha', kind: 'approval', what: 'studio', ref: [AD1, AD2], title: 'Burgundy statics, round 1' });
  assert.equal(r.status, 200, JSON.stringify(r.j)); ids.studio = r.j.id;
  r = await ah(TEAM, 'POST', '/api/requests', { act: 'brand_alpha', kind: 'approval', what: 'date', ref: 'ev_a', title: 'Confirm the drop date' });
  assert.equal(r.status, 200); ids.date = r.j.id;
  r = await ah(TEAM, 'POST', '/api/requests', { act: 'brand_alpha', kind: 'approval', what: 'offer', title: 'Black Friday offer', text: '25% off sitewide, free hat over $150' });
  assert.equal(r.status, 200); ids.offer = r.j.id;
  r = await ah(TEAM, 'POST', '/api/requests', { act: 'brand_alpha', kind: 'approval', what: 'link', title: 'New landing page', link: 'https://example.com/lp' });
  assert.equal(r.status, 200); ids.link = r.j.id;
  assert.equal((await ah(TEAM, 'POST', '/api/requests', { act: 'brand_alpha', kind: 'approval', what: 'studio', ref: [AD1, ADB], title: 'Mixed' })).status, 400, 'beta ad on alpha');
  assert.equal((await ah(TEAM, 'POST', '/api/requests', { act: 'brand_alpha', kind: 'approval', what: 'date', ref: 'ev_b', title: 'Wrong date' })).status, 400, 'beta date on alpha');
  assert.equal((await ah(TEAM, 'POST', '/api/requests', { act: 'brand_alpha', kind: 'approval', what: 'link', title: 'Bad link', link: 'javascript:alert(1)' })).status, 400, 'bad link');
  r = await ah(TEAM, 'POST', '/api/requests', { act: 'brand_beta', kind: 'approval', what: 'studio', ref: [ADB], title: 'Beta ad' });
  assert.equal(r.status, 200); ids.beta = r.j.id;
  assert.equal(slack.length, 0, 'the team sending an approval posts nothing');
});

await check('the client sees its own brand only, with previews and "N waiting"; another brand, "all" or no brand is refused', async () => {
  const r = await ah(CLIENT, 'GET', '/api/requests?act=brand_alpha');
  assert.equal(r.status, 200);
  assert.equal(r.j.items.length, 4); assert.equal(r.j.waiting_client, 4);
  assert.ok(r.j.items.every(i => i.act_id === 'brand_alpha'));
  const st = r.j.items.find(i => i.id === ids.studio);
  assert.deepEqual(st.ads.map(a => a.id), [AD1, AD2]); assert.equal(st.ads[0].headline, 'Burgundy is back');
  assert.equal(r.j.items.find(i => i.id === ids.date).date.name, 'Alpha drop');
  assert.ok(!JSON.stringify(r.j).includes('C_ALPHA'), 'no Slack channel ids reach the client');
  for (const p of ['/api/requests?act=brand_beta', '/api/requests?act=all', '/api/requests']) assert.equal((await ah(CLIENT, 'GET', p)).status, 403, p);
});

await check('a client request posts ONE line to the brand\'s INTERNAL channel; a client can never send an approval', async () => {
  const r = await ah(CLIENT, 'POST', '/api/requests', { act: 'brand_alpha', title: 'Pause the hoodie ads', text: 'We sold out of medium.', link: 'https://example.com/hoodie' });
  assert.equal(r.status, 200); ids.req = r.j.id; assert.equal(r.j.notified, true);
  assert.equal(slack.length, 1); assert.equal(slack[0].channel, 'C_ALPHA_IN'); assert.match(slack[0].text, /Nick asked for something: Pause the hoodie ads/);
  assert.ok(!slack.some(m => /CLIENT/.test(m.channel)), 'never the client channel');
  assert.equal((await ah(CLIENT, 'POST', '/api/requests', { act: 'brand_alpha', kind: 'approval', what: 'offer', title: 'x', text: 'y' })).status, 403);
  assert.equal((await ah(CLIENT, 'POST', '/api/requests', { act: 'brand_beta', title: 'Sneaky', text: 'x' })).status, 403);
  assert.equal((await ah(CLIENT, 'POST', '/api/requests', { title: 'No brand', text: 'x' })).status, 403);
});

await check('the client cannot touch another brand\'s item, whatever act it names, and cannot mark anything done', async () => {
  assert.equal((await ah(CLIENT, 'POST', '/api/requests/decide', { act: 'brand_alpha', id: ids.beta, decision: 'approved' })).status, 403, 'beta item with alpha act');
  assert.equal((await ah(CLIENT, 'POST', '/api/requests/decide', { act: 'brand_beta', id: ids.beta, decision: 'approved' })).status, 403, 'beta act');
  assert.equal((await ah(CLIENT, 'POST', '/api/requests/reply', { act: 'brand_alpha', id: ids.beta, text: 'hi' })).status, 403);
  assert.equal((await ah(CLIENT, 'POST', '/api/requests/done', { act: 'brand_alpha', id: ids.req })).status, 403);
  assert.equal((await ah(BEA, 'POST', '/api/requests/decide', { act: 'brand_beta', id: ids.studio, decision: 'approved' })).status, 403, 'Bea on alpha\'s item');
  assert.equal(db.prepare(`SELECT status FROM p_studio_ad WHERE id = ?`).get(ADB).status, 'review');
});

await check('approving Studio ads marks them approved in Studio; approving a date confirms it on the calendar (logged as Locus, so not posted twice)', async () => {
  const before = slack.length;
  let r = await ah(CLIENT, 'POST', '/api/requests/decide', { act: 'brand_alpha', id: ids.studio, decision: 'approved' });
  assert.equal(r.status, 200); assert.equal(r.j.effect.ads_approved, 2);
  assert.deepEqual(db.prepare(`SELECT status FROM p_studio_ad WHERE act_id = 'brand_alpha' ORDER BY id`).all().map(x => x.status), ['approved', 'approved']);
  r = await ah(CLIENT, 'POST', '/api/requests/decide', { act: 'brand_alpha', id: ids.date, decision: 'approved' });
  assert.equal(r.status, 200); assert.equal(r.j.effect.date_confirmed, 'ev_a');
  assert.equal(cal.db.prepare(`SELECT status FROM events WHERE id = 'ev_a'`).get().status, 'confirmed');
  const log = cal.db.prepare(`SELECT * FROM changelog WHERE event_id = 'ev_a'`).get();
  assert.equal(log.changed_by, 'Locus'); assert.match(log.change_summary, /Nick approved it in Requests/);
  assert.equal(slack.length, before + 2); assert.ok(slack.slice(before).every(m => m.channel === 'C_ALPHA_IN'));
  assert.match(slack[before + 1].text, /confirmed on the calendar/);
});

await check('asking for changes needs a note, which lands in the thread and in Slack', async () => {
  assert.equal((await ah(CLIENT, 'POST', '/api/requests/decide', { act: 'brand_alpha', id: ids.offer, decision: 'changes' })).status, 400);
  const r = await ah(CLIENT, 'POST', '/api/requests/decide', { act: 'brand_alpha', id: ids.offer, decision: 'changes', note: 'Make it 20%, not 25%.' });
  assert.equal(r.status, 200); assert.equal(r.j.status, 'changes');
  const l = await ah(CLIENT, 'GET', '/api/requests?act=brand_alpha');
  const it = l.j.items.find(i => i.id === ids.offer);
  assert.equal(it.status, 'changes'); assert.equal(it.thread.at(-1).text, 'Changes: Make it 20%, not 25%.');
  assert.match(slack.at(-1).text, /Nick asked for changes on "Black Friday offer"/);
  assert.equal(l.j.waiting_client, 1, 'only the link is still waiting for the client');
});

await check('the thread: the team replies (no Slack), the client replies (one line), the team marks it done and can reopen', async () => {
  const before = slack.length;
  assert.equal((await ah(TEAM, 'POST', '/api/requests/reply', { act: 'brand_alpha', id: ids.req, text: 'Paused. Back on when stock lands.' })).status, 200);
  assert.equal(slack.length, before);
  assert.equal((await ah(TEAM, 'POST', '/api/requests/done', { act: 'brand_alpha', id: ids.req })).status, 200);
  assert.equal((await ah(CLIENT, 'POST', '/api/requests/reply', { act: 'brand_alpha', id: ids.req, text: 'Stock lands Tuesday.' })).status, 200);
  assert.equal(slack.length, before + 1); assert.match(slack.at(-1).text, /Nick replied on "Pause the hoodie ads"/);
  const it = (await ah(TEAM, 'GET', '/api/requests?act=brand_alpha')).j.items.find(i => i.id === ids.req);
  assert.equal(it.status, 'open', 'a client reply reopens a done request');
  assert.deepEqual(it.thread.map(m => m.role), ['team', 'client']);
  assert.equal((await ah(TEAM, 'POST', '/api/requests/done', { act: 'brand_alpha', id: ids.req })).j.status, 'done');
  assert.equal((await ah(TEAM, 'POST', '/api/requests/done', { act: 'brand_alpha', id: ids.req, done: false })).j.status, 'open');
});

await check('the team sees every brand on All clients; a teammate limited to one brand sees only that one', async () => {
  const all = await ah(TEAM, 'GET', '/api/requests?act=all');
  assert.deepEqual([...new Set(all.j.items.map(i => i.act_id))].sort(), ['brand_alpha', 'brand_beta']);
  assert.ok(all.j.waiting_team >= 2, 'the open client request and the changes ask');
  const lim = await ah(NOMA, 'GET', '/api/requests?act=all');
  assert.deepEqual([...new Set(lim.j.items.map(i => i.act_id))], ['brand_beta']);
  assert.equal((await ah(NOMA, 'GET', '/api/requests?act=brand_alpha')).status, 403);
  assert.equal((await ah(null, 'GET', '/api/requests?act=all')).status, 401, 'signed out');
});

globalThis.fetch = realFetch;
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
