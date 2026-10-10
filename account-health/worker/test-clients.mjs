/* Offline security checks for CLIENT LOGINS (2026-10-09) and THE BRAND EDITION (2026-10-10, docs/locus-hub/editions.md):
 * brandguard.js (both workers), clients.js, the client mode of the assistant engine, the calendar's client rules, the
 * daily caps, and the auth changes in both workers. Drives the REAL account-health and profit
 * workers in node against an in-memory SQLite (node:sqlite), the profit worker's AUTH binding wired to the
 * account-health worker exactly as in production (no SESSION_SECRET on profit), Google and Gmail mocked.
 *   node test-clients.mjs      (from account-health/worker)
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
  /* ?N and bare ? (numbered on from the highest so far, as SQLite does) become named parameters. */
  const bindSql = sql => { let hi = 0; return sql.replace(/\?(\d*)/g, (_, n) => { if (n) { hi = Math.max(hi, +n); return ':p' + n; } hi++; return ':p' + hi; }); };
  /* D1 ignores a bound value the SQL does not use; node:sqlite refuses it, so only the used ones are passed. */
  const vals = (a, sql) => { const used = new Set([...bindSql(sql).matchAll(/:p(\d+)/g)].map(m => 'p' + m[1])); return Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]).filter(([k]) => used.has(k))); };
  const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args, sql)) || null; }, async all() { return { results: st().all(vals(args, sql)) }; }, async run() { const r = st().run(vals(args, sql)); return { meta: { changes: r.changes } }; } }; };
  return { db, DB: { prepare: stmt, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } } };
};
const { db, DB } = mkDb();
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied */ } } };
load(path.join(root, 'profit', 'worker', 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'migrations', 'brand-001.sql'));
load(path.join(here, 'schema.sql'));
db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, source) VALUES
  ('brand_alpha', 'alpha', 'Alpha Golf', 'active', 'USD', 'America/Chicago', 'locus'),
  ('brand_beta', 'beta', 'Beta Socks', 'active', 'USD', 'America/Chicago', 'locus')`);
db.exec(`INSERT INTO connections (id, brand_id, kind, external_id, is_primary, source) VALUES
  ('meta:act_111', 'brand_alpha', 'meta', 'act_111', 1, 'locus'), ('meta:act_222', 'brand_beta', 'meta', 'act_222', 1, 'locus')`);
try { db.exec(`INSERT INTO ads (ad_id, act_id, name) VALUES ('9001', 'act_111', 'Alpha ad'), ('9002', 'act_222', 'Beta ad')`); } catch (e) { db.exec(`CREATE TABLE IF NOT EXISTS ads (ad_id TEXT PRIMARY KEY, act_id TEXT, name TEXT)`); db.exec(`INSERT INTO ads (ad_id, act_id, name) VALUES ('9001', 'act_111', 'Alpha ad'), ('9002', 'act_222', 'Beta ad')`); }
db.exec(`INSERT INTO reports (act_id, period, period_start, period_end, status, summary, data_json) VALUES
  ('brand_alpha', 'weekly', '2026-09-28', '2026-10-04', 'sent', 'Sent one', '{"cm":5,"sales":100}'),
  ('brand_alpha', 'weekly', '2026-10-05', '2026-10-11', 'draft', 'DRAFT TEXT', '{"sales":1}'),
  ('brand_beta', 'weekly', '2026-09-28', '2026-10-04', 'sent', 'Beta report', '{}')`);
const setSetting = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, JSON.stringify(v));
const getSetting = k => { const r = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k); return r ? JSON.parse(r.value) : null; };
setSetting('clientUsers', { 'nick@alpha.com': { brands: ['brand_alpha'], name: 'Nick' }, 'empty@alpha.com': { brands: [] }, 'guest@outside.com': { brands: ['brand_alpha'] } });
setSetting('allowedEmails', ['guest@outside.com']);

/* Lineup's calendar database (CAL). */
const cal = mkDb();
cal.db.exec(`CREATE TABLE events (id TEXT PRIMARY KEY, brand_id TEXT, name TEXT, type TEXT, status TEXT, brief TEXT, launch_date TEXT, promo_end_date TEXT, inventory_date TEXT, asset_deadline TEXT, teaser_start TEXT, channels TEXT, owner TEXT, notes TEXT, assets_link TEXT, created_at TEXT, updated_at TEXT, updated_by TEXT, locus_brand TEXT, asana TEXT, ticks TEXT);
  CREATE TABLE changelog (id TEXT, brand_id TEXT, event_id TEXT, event_name TEXT, change_summary TEXT, changed_by TEXT, created_at TEXT);
  CREATE TABLE people (email TEXT, name TEXT);
  INSERT INTO events (id, brand_id, name, type, status, launch_date, channels, locus_brand, ticks) VALUES ('ev_a', 'alpha', 'Alpha drop', 'product_launch', 'tentative', '2026-11-01', '{}', 'brand_alpha', '{}'), ('ev_b', 'beta', 'Beta sale', 'promo', 'tentative', '2026-11-02', '{}', 'brand_beta', '{}');`);

/* ---------------- tokens and mocks ---------------- */
const SECRET = 'test-session-secret';
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const mint = (email, key = SECRET) => { const p = b64u(`${email}|${Date.now() + 3600e3}`); return `mds.${p}.${b64u(crypto.createHmac('sha256', key).update(p).digest())}`; };
const CLIENT = mint('nick@alpha.com'), TEAM = mint('ahsan@go-mobius-digital.com'), OWNER = mint('cole@go-mobius-digital.com');
const EMPTY = mint('empty@alpha.com'), GUEST = mint('guest@outside.com'), STRANGER = mint('someone@else.com');
const FORGED_DEV = mint('cole@go-mobius-digital.com', 'dev');

const realFetch = globalThis.fetch;
const mails = [];
/* The model, when a check sets it: body -> the Messages API answer. */
const MOCK = { anthropic: null };
globalThis.fetch = async (url, init = {}) => {
  const u = String(url?.url || url);
  if (u.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
    const email = decodeURIComponent(u.split('id_token=')[1] || '');
    return new Response(JSON.stringify({ aud: 'cid', email, email_verified: 'true' }), { status: 200 });
  }
  if (u.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'gtok', expires_in: 3600 }), { status: 200 });
  if (u.includes('gmail/v1/users/me/messages/send')) { mails.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); }
  if (u.startsWith('https://api.anthropic.com/') && MOCK.anthropic) return new Response(JSON.stringify({ model: 'claude-opus-5-5', ...MOCK.anthropic(JSON.parse(init.body)) }), { status: 200 });
  return new Response(JSON.stringify({ error: 'offline: ' + u }), { status: 503 });
};

const AH = (await import('./src/worker.js')).default;
const PF = (await import('../../profit/worker/src/worker.js')).default;
const keyPem = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const ahEnv = { DB, CAL: cal.DB, SESSION_SECRET: SECRET, GOOGLE_CLIENT_ID: 'cid', GOOGLE_SA_KEY: JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: keyPem }) };
const ctx = { waitUntil() {} };
/* Production shape: the profit worker has NO SESSION_SECRET and NO ADMIN_TOKEN; it asks account-health. */
const pfEnv = { DB, AUTH: { fetch: req => AH.fetch(req, ahEnv, ctx) } };
ahEnv.PROFIT = { fetch: req => PF.fetch(req, pfEnv, ctx) };
const call = async (worker, tok, method, p, body) => {
  const env = worker === 'ah' ? ahEnv : pfEnv;
  const res = await (worker === 'ah' ? AH : PF).fetch(new Request(`https://${worker}.test${p}`, { method, headers: { ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, ctx);
  let j = null; try { j = await res.json(); } catch {}
  return { status: res.status, j };
};
const ah = (tok, m, p, b) => call('ah', tok, m, p, b), pf = (tok, m, p, b) => call('pf', tok, m, p, b);

const results = [];
async function check(name, fn) { try { await fn(); results.push(true); console.log('PASS ', name); } catch (e) { results.push(false); console.log('FAIL ', name, '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }


/* ---------------- the checks ---------------- */
const today = new Date().toISOString().slice(0, 10);
/* Passed the guard: the handler ran (it may still fail offline on Meta, Triple Whale or Google, which is fine here). */
const ran = async (w, tok, m, p, b) => { try { return await call(w, tok, m, p, b); } catch (e) { return { status: 'handler threw: ' + String(e.message).slice(0, 80), j: null }; } };
const passed = r => r.status !== 401 && r.status !== 403 && r.status !== 429;

await check('brandguard.js is byte-identical in both workers', () => {
  assert.equal(fs.readFileSync(path.join(here, 'src', 'brandguard.js'), 'utf8'), fs.readFileSync(path.join(root, 'profit', 'worker', 'src', 'brandguard.js'), 'utf8'));
});

await check('Google sign-in: a client email signs in as a client, a stranger is refused, sign-in is recorded', async () => {
  const ok = await ah(null, 'POST', '/api/google-login', { credential: 'nick@alpha.com' });
  assert.equal(ok.status, 200); assert.equal(ok.j.role, 'client');
  assert.ok(getSetting('clientUsers')['nick@alpha.com'].last_sign_in, 'last sign-in recorded');
  const no = await ah(null, 'POST', '/api/google-login', { credential: 'someone@else.com' });
  assert.equal(no.status, 403); assert.match(no.j.error, /no Locus login/);
  const team = await ah(null, 'POST', '/api/google-login', { credential: 'ahsan@go-mobius-digital.com' });
  assert.equal(team.j.role, 'team');
});

await check('/api/me says who: client (with brands, every old switch reading on), team, owner', async () => {
  const c = await ah(CLIENT, 'GET', '/api/me');
  assert.equal(c.status, 200); assert.equal(c.j.role, 'client'); assert.deepEqual(c.j.client.brands.map(b => b.id), ['brand_alpha']);
  assert.deepEqual(c.j.client.brands[0].access, { pl: true, strategist: true, changes: true, creators: true });
  /* A stored override from before 2026-10-10 is ignored: the switches are gone. */
  setSetting('clientAccess', { brand_alpha: { pl: false, changes: false } });
  assert.deepEqual((await ah(CLIENT, 'GET', '/api/me')).j.client.brands[0].access, { pl: true, strategist: true, changes: true, creators: true });
  setSetting('clientAccess', {});
  assert.equal((await ah(TEAM, 'GET', '/api/me')).j.role, 'team');
  assert.equal((await ah(OWNER, 'GET', '/api/me')).j.role, 'owner');
});

/* THE BRAND EDITION: every page a single brand has answers a client for its own brand. */
const PAGE_ROUTES = [
  // Home: Overview, Day check, P&L, Goals, Requests
  ['pf', '/api/overview?days=30&series=0'], ['pf', '/api/hub/live?act=brand_alpha'], ['pf', '/api/client?act=brand_alpha&days=30'], ['pf', '/api/forecast?act=brand_alpha'],
  ['pf', '/api/costs?act=brand_alpha'], ['pf', '/api/expenses?act=brand_alpha'], ['pf', '/api/plan?act=brand_alpha&month=2026-10'], ['pf', '/api/quarter?act=brand_alpha'], ['pf', '/api/rhythm?act=brand_alpha'],
  ['ah', '/api/metaday?days=30'], ['ah', '/api/daycheck/now?act=brand_alpha'], ['ah', '/api/requests?act=brand_alpha'], ['pf', '/api/data-health?act=brand_alpha&days=14'],
  // Ads: Today, All channels, Meta and its jobs, Google and its jobs, TikTok, Tests and angles
  ['pf', '/api/hub/today?act=brand_alpha'], ['pf', '/api/hub/paid?platform=all&act=brand_alpha'], ['pf', '/api/hub/paid?platform=meta&act=brand_alpha'], ['pf', '/api/hub/drill?act=brand_alpha'],
  ['pf', '/api/hub/orders?act=brand_alpha'], ['pf', '/api/hub/creative?act=brand_alpha'], ['ah', '/api/meta/live?act=brand_alpha'], ['ah', '/api/activities?act=brand_alpha'], ['ah', '/api/series?act=brand_alpha&days=45'],
  ['ah', '/api/creative?act=brand_alpha'], ['pf', '/api/ads?act=brand_alpha'], ['ah', '/api/launch/list?act=brand_alpha'], ['ah', '/api/google/ads?act=brand_alpha'], ['ah', '/api/google/ads-ads?act=brand_alpha'],
  ['ah', '/api/google/ads-terms?act=brand_alpha'], ['ah', '/api/google/ads-changes?act=brand_alpha'], ['ah', '/api/tiktok/report?act=brand_alpha'], ['pf', '/api/brand/tests-overview'], ['ah', '/api/your-ads-link?act=brand_alpha'],
  // Email and SMS, Store
  ['pf', '/api/hub/email?act=brand_alpha'], ['ah', '/api/klaviyo?act=brand_alpha&what=overview'], ['pf', '/api/hub/store?act=brand_alpha'], ['pf', '/api/customers?act=brand_alpha'], ['pf', '/api/cohorts?act=brand_alpha'],
  ['ah', '/api/survey?act=brand_alpha'], ['ah', '/api/google/website?act=brand_alpha'], ['ah', '/api/google/search?act=brand_alpha'], ['ah', '/api/clarity?act=brand_alpha'],
  // Products, Creative, Brand
  ['pf', '/api/hub/stockads?act=brand_alpha'], ['pf', '/api/studio?act=brand_alpha'], ['pf', '/api/studio/asana?act=brand_alpha'], ['pf', '/api/amb?act=brand_alpha'], ['pf', '/api/amb/ads?act=brand_alpha'],
  ['ah', '/api/assets?act=brand_alpha'], ['pf', '/api/brand?act=brand_alpha'], ['pf', '/api/brand/rules?act=brand_alpha'],
  // Calendar, Reports (sent only), Dashboards, Season, Tools
  ['ah', '/api/calendar?act=brand_alpha'], ['pf', '/api/briefs?act=brand_alpha'], ['pf', '/api/brief?act=brand_alpha'], ['pf', '/api/reports?act=brand_alpha'], ['pf', '/api/dashboards?act=brand_alpha'],
  ['pf', '/api/snapshots'], ['pf', '/api/season?act=brand_alpha'], ['pf', '/api/season/war?act=brand_alpha'], ['ah', '/api/tw-day?act=brand_alpha'], ['pf', '/api/scenario?act=brand_alpha'],
  // Brand settings and the profile
  ['ah', '/api/accounts'], ['ah', '/api/integrations'], ['ah', '/api/clients/me'],
];
await check('the brand edition: every page a brand has answers a client for its own brand (both workers)', async () => {
  const shut = [];
  for (const [w, p] of PAGE_ROUTES) { const r = await ran(w, CLIENT, 'GET', p); if (!passed(r)) shut.push(`${w} ${p} -> ${r.status} ${JSON.stringify(r.j).slice(0, 80)}`); }
  assert.deepEqual(shut, [], 'refused:\n' + shut.join('\n'));
});

await check('another brand, an old Meta id of another brand, or "all" is refused everywhere a client goes', async () => {
  const let_ = [];
  for (const [w, p] of PAGE_ROUTES) {
    if (!/act=brand_alpha/.test(p)) continue;
    for (const other of ['brand_beta', 'act_222', 'all']) {
      const r = await ran(w, CLIENT, 'GET', p.replace('act=brand_alpha', 'act=' + other));
      if (r.status !== 403) let_.push(`${w} ${p} as ${other} -> ${r.status}`);
    }
  }
  assert.deepEqual(let_, [], 'let through:\n' + let_.join('\n'));
});

await check('the agency edition stays the agency\'s: every agency-only route is 403 for a client', async () => {
  const open = [];
  for (const [w, m, p, b] of [
    ['ah', 'GET', '/api/settings'], ['ah', 'GET', '/api/team'], ['ah', 'GET', '/api/clients'], ['ah', 'GET', '/api/schedule-health'], ['ah', 'GET', '/api/command/work'],
    ['ah', 'GET', '/api/agency/economics'], ['ah', 'GET', '/api/agency/workload'], ['ah', 'GET', '/api/ask/settings'], ['ah', 'GET', '/api/ask/memory'], ['ah', 'GET', '/api/ask/skills'],
    ['ah', 'GET', '/api/ask/usage'], ['ah', 'GET', '/api/ask/findings'], ['ah', 'GET', '/api/ask/schedules'], ['ah', 'GET', '/api/ask/review'], ['ah', 'GET', '/api/ask/reports'], ['ah', 'GET', '/api/alerts'],
    ['ah', 'GET', '/api/new-client/options'], ['pf', 'GET', '/api/brief-note?act=brand_alpha'], ['ah', 'GET', '/api/calendar/client-preview'], ['ah', 'GET', '/api/smoke'], ['ah', 'GET', '/api/meta-access'],
    ['ah', 'GET', '/api/google/ads-accounts'], ['ah', 'GET', '/api/tiktok/status'], ['ah', 'GET', '/api/atria/status'], ['ah', 'GET', '/api/frame/status'], ['pf', 'GET', '/api/slack-channels'],
    ['ah', 'GET', '/api/share/slack?act=brand_alpha'], ['pf', 'GET', '/api/hub/command?act=all'], ['pf', 'GET', '/api/hub/command?act=brand_alpha'], ['pf', 'GET', '/api/amb/overview'],
    ['pf', 'GET', '/api/brand/overview'], ['pf', 'GET', '/api/connections'], ['ah', 'GET', '/api/slack-identity'],
    ['ah', 'PUT', '/api/settings', { briefHour: 3 }], ['ah', 'PUT', '/api/team', { email: 'x@y.com' }], ['ah', 'POST', '/api/clients/invite', { emails: ['a@b.com'], brands: ['brand_alpha'] }],
    ['ah', 'POST', '/api/clients/remove', { email: 'nick@alpha.com' }], ['ah', 'POST', '/api/report-send', { act: 'brand_alpha' }], ['pf', 'POST', '/api/brief-send', { act: 'brand_alpha' }],
    ['pf', 'POST', '/api/brief-draft', { act: 'brand_alpha' }], ['pf', 'PUT', '/api/brief-text', { act: 'brand_alpha', text: 'x' }], ['pf', 'POST', '/api/report-generate', { act: 'brand_alpha' }],
    ['pf', 'PUT', '/api/report-summary', { act: 'brand_alpha' }], ['pf', 'PUT', '/api/client-settings', { act: 'brand_alpha', brief_channel: 'C0123456789' }], ['ah', 'POST', '/api/new-client', { name: 'x' }],
    ['ah', 'PUT', '/api/ask/settings', { model: 'deep' }], ['ah', 'POST', '/api/ask/apply', { id: 'p1' }], ['ah', 'POST', '/api/ask/memory', { text: 'x' }], ['ah', 'PUT', '/api/alerts', { act: 'brand_alpha' }],
    ['ah', 'POST', '/api/dashboard-post', { id: 'db_0000000000' }], ['ah', 'POST', '/api/share/slack', { act: 'brand_alpha' }], ['ah', 'POST', '/api/calendar/tick', { id: 'ev_a', key: 'x', done: true }],
    ['ah', 'POST', '/api/calendar/asana', { id: 'ev_a' }], ['pf', 'POST', '/api/studio/key', { key: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx' }], ['pf', 'POST', '/api/studio/canva/setup', { act: 'brand_alpha' }],
    ['ah', 'POST', '/api/research/step', { act: 'brand_alpha', step: 'market' }], ['ah', 'POST', '/api/research/prefill', { act: 'brand_alpha' }], ['ah', 'POST', '/api/voice/staff/build-skill', { act: 'brand_alpha' }],
    ['ah', 'POST', '/api/discover'], ['ah', 'POST', '/api/sync?act=brand_alpha'], ['ah', 'PUT', '/api/agency/settings', { x: 1 }], ['ah', 'POST', '/api/brand-asana/sync', { act: 'brand_alpha' }],
    ['ah', 'POST', '/api/supply/orders?brand=alpha', { act: 'brand_alpha' }], ['ah', 'PUT', '/api/meta-business', { id: '1' }], ['ah', 'POST', '/api/brands', { name: 'Mine' }],
    ['ah', 'POST', '/api/tiktok/start'], ['pf', 'POST', '/api/connections/map', { act: 'brand_alpha', shop: 'x.myshopify.com' }], ['ah', 'POST', '/api/assets/sync?act=brand_alpha'],
  ]) { const r = await ran(w, CLIENT, m, p, b); if (r.status !== 403) open.push(`${w} ${m} ${p} -> ${r.status}`); }
  assert.deepEqual(open, [], 'open to a client:\n' + open.join('\n'));
});

await check('writes: a client changes its own brand through the team\'s routes, never another brand\'s or the agency\'s fields', async () => {
  /* Brand settings: own brand, safe fields only. */
  assert.equal((await ah(CLIENT, 'PUT', '/api/accounts/brand_alpha', { name: 'Alpha Golf Co', target_cpa: 40 })).status, 200);
  assert.equal(db.prepare(`SELECT name FROM brands WHERE id = 'brand_alpha'`).get().name, 'Alpha Golf Co');
  assert.equal((await ah(CLIENT, 'PUT', '/api/accounts/brand_beta', { name: 'Hijack' })).status, 403, 'another brand');
  assert.equal((await ah(CLIENT, 'PUT', '/api/accounts/act_222', { name: 'Hijack' })).status, 403, 'another brand by its Meta id');
  for (const k of ['slack_channel', 'brief_channel', 'tw_shop', 'active', 'brief_enabled']) assert.equal((await ah(CLIENT, 'PUT', '/api/accounts/brand_alpha', { [k]: k === 'active' ? false : 'C0123456789' })).status, 403, k);
  assert.equal(db.prepare(`SELECT name FROM brands WHERE id = 'brand_beta'`).get().name, 'Beta Socks');
  /* Integrations: their own keys and links, never an id Mobius's access reaches. */
  for (const k of ['ga4', 'gsc', 'google_ads', 'meta', 'tw_shop']) assert.equal((await ah(CLIENT, 'PUT', '/api/brand-links', { act: 'brand_alpha', [k]: '1234567890' })).status, 403, k);
  assert.ok(passed(await ran('ah', CLIENT, 'PUT', '/api/brand-links', { act: 'brand_alpha', drive: 'https://drive.google.com/drive/folders/x' })), 'their own Drive link');
  /* Goals and the plan. */
  assert.equal((await pf(CLIENT, 'PUT', '/api/plan', { act: 'brand_alpha', month: '2026-11', sales: 50000, spend: 10000 })).status, 200);
  assert.equal((await pf(CLIENT, 'PUT', '/api/goals', { act: 'brand_beta', sales: 1 })).status, 403);
  /* The War Room plan: their own, without the team's notes. */
  const war = await pf(CLIENT, 'PUT', '/api/season/war', { act: 'brand_alpha', patch: { goals: [{ metric: 'revenue', target: 90000 }], notes: 'CLIENT WROTE THIS' } });
  assert.equal(war.status, 200, JSON.stringify(war.j)); assert.equal(war.j.war.notes, undefined, 'notes stay the team\'s');
  assert.equal((await pf(CLIENT, 'PUT', '/api/season/war', { act: 'brand_beta', patch: { goals: [] } })).status, 403);
  /* A record named by id must be theirs: dashboards, scenarios, Studio ads, change log rows. */
  const dB = await pf(OWNER, 'PUT', '/api/dashboard', { act: 'brand_beta', name: 'Beta board', spec: { blocks: [{ type: 'note', text: 'hi' }] } });
  assert.equal(dB.status, 200, JSON.stringify(dB.j));
  assert.equal((await pf(CLIENT, 'GET', `/api/dashboard?id=${dB.j.id}`)).status, 403);
  assert.equal((await pf(CLIENT, 'PUT', '/api/dashboard', { act: 'brand_alpha', id: dB.j.id, name: 'Mine now', spec: { blocks: [{ type: 'note', text: 'x' }] } })).status, 403);
  assert.equal((await pf(CLIENT, 'DELETE', `/api/dashboard?id=${dB.j.id}`)).status, 403);
  const agencyBoard = await pf(OWNER, 'PUT', '/api/dashboard', { act: 'all', name: 'Every brand', spec: { blocks: [{ type: 'note', text: 'agency' }] } });
  assert.equal((await pf(CLIENT, 'GET', `/api/dashboard?id=${agencyBoard.j.id}`)).status, 403, 'an all-brands board has no brand: the agency\'s');
  const dA = await pf(CLIENT, 'PUT', '/api/dashboard', { act: 'brand_alpha', name: 'My board', spec: { blocks: [{ type: 'note', text: 'mine' }] } });
  assert.equal(dA.status, 200, JSON.stringify(dA.j));
  const myList = await pf(CLIENT, 'GET', '/api/dashboards?act=brand_alpha');
  assert.deepEqual(myList.j.dashboards.map(x => x.name), ['My board'], 'only its own brand\'s boards, never the agency\'s');
  const sB = db.prepare(`INSERT INTO p_scenario (id, act_id, kind, name, inputs_json) VALUES ('sc_bbbbbbbbbb', 'brand_beta', 'roas', 'Beta what-if', '{}')`).run();
  assert.equal((await pf(CLIENT, 'PUT', '/api/scenario', { act: 'brand_alpha', id: 'sc_bbbbbbbbbb', kind: 'roas', name: 'Mine' })).status, 403);
  assert.equal((await pf(CLIENT, 'DELETE', '/api/scenario?id=sc_bbbbbbbbbb')).status, 403);
  assert.equal((await pf(CLIENT, 'PUT', '/api/scenario', { act: 'brand_alpha', kind: 'roas', name: 'Our what-if', inputs: { aov: 80 } })).status, 200);
  db.exec(`INSERT INTO p_studio_ad (id, act_id, spec_json) VALUES ('a0a0a0a0a0a0a0a0a0a0a0a0', 'brand_alpha', '{}'), ('b0b0b0b0b0b0b0b0b0b0b0b0', 'brand_beta', '{}')`);
  assert.equal((await pf(CLIENT, 'POST', '/api/studio/status', { id: 'b0b0b0b0b0b0b0b0b0b0b0b0', status: 'approved' })).status, 403);
  assert.equal((await pf(CLIENT, 'POST', '/api/studio/status', { id: 'a0a0a0a0a0a0a0a0a0a0a0a0', status: 'approved' })).status, 200);
  assert.equal(db.prepare(`SELECT status FROM p_studio_ad WHERE id = 'b0b0b0b0b0b0b0b0b0b0b0b0'`).get().status, 'review', 'beta untouched');
  try { db.exec(`INSERT INTO activities (id, act_id, event_time) VALUES ('ev-alpha', 'act_111', '2026-10-01T00:00:00Z'), ('ev-beta', 'act_222', '2026-10-01T00:00:00Z')`); } catch {}
  assert.equal((await ah(CLIENT, 'PATCH', '/api/activities/ev-beta', { reason: 'mine' })).status, 403);
  assert.equal((await ah(CLIENT, 'PATCH', '/api/activities/ev-alpha', { reason: 'Launch week' })).status, 200);
  /* Live ad changes: the same propose / confirm path, its brand only. */
  assert.equal((await ah(CLIENT, 'POST', '/api/meta/write', { act: 'brand_beta', kind: 'pause', object: '1' })).status, 403);
  assert.equal((await ah(CLIENT, 'POST', '/api/klaviyo/write', { act: 'brand_beta' })).status, 403);
  assert.equal((await ah(CLIENT, 'POST', '/api/google/write', { act: 'brand_beta' })).status, 403);
  assert.ok(passed(await ran('ah', CLIENT, 'POST', '/api/meta/write', { act: 'brand_alpha', kind: 'pause', object: '1' })), 'its own brand reaches the propose step');
});

await check('the scrub: Slack channel ids, report config and the team\'s notes never reach a client; costs and margins now do', async () => {
  db.exec(`UPDATE brands SET internal_channel = 'C0123456789', client_channel = 'C0987654321' WHERE id = 'brand_alpha'`);
  const board = await pf(OWNER, 'PUT', '/api/dashboard', { act: 'brand_alpha', name: 'Posted board', schedule: 'monday', channel: 'C0123456789', spec: { blocks: [{ type: 'note', text: 'p' }] } });
  for (const [w, p] of [['ah', '/api/accounts'], ['pf', '/api/overview?days=30&series=0'], ['ah', '/api/calendar?act=brand_alpha'], ['pf', '/api/dashboards?act=brand_alpha'], ['ah', '/api/integrations'], ['ah', '/api/me']]) {
    const s = JSON.stringify((await ran(w, CLIENT, 'GET', p)).j || {});
    for (const bad of ['C0123456789', 'C0987654321', '"report_config"', '"review_first"', '"steer"']) assert.ok(!s.includes(bad), `${p} leaks ${bad}`);
  }
  /* A client editing that board keeps the team's posting setup (never sees it, never clears it). */
  assert.equal((await pf(CLIENT, 'PUT', '/api/dashboard', { act: 'brand_alpha', id: board.j.id, name: 'Posted board, renamed', spec: { blocks: [{ type: 'note', text: 'q' }] } })).status, 200);
  const row = db.prepare(`SELECT name, channel, schedule FROM p_dashboard WHERE id = ?`).get(board.j.id);
  assert.deepEqual([row.name, row.channel, row.schedule], ['Posted board, renamed', 'C0123456789', 'monday']);
  /* Costs and margins are not scrubbed any more: a sent report carries its contribution margin. */
  const sent = await ah(CLIENT, 'GET', '/api/report?act=brand_alpha&period=weekly&start=2026-09-28');
  assert.equal(sent.status, 200); assert.equal(sent.j.data.cm, 5);
  db.exec(`UPDATE brands SET internal_channel = NULL, client_channel = NULL WHERE id = 'brand_alpha'`);
});

await check('reports and briefs: a client reads what was SENT, never a draft, the review or the send', async () => {
  const list = await pf(CLIENT, 'GET', '/api/reports?act=brand_alpha');
  assert.equal(list.status, 200);
  assert.deepEqual(list.j.rows.map(r => r.status), ['sent']); assert.equal(list.j.lastRun, undefined);
  const draft = await pf(CLIENT, 'GET', '/api/report?act=brand_alpha&period=weekly&start=2026-10-05');
  assert.equal(draft.status, 404); assert.ok(!JSON.stringify(draft.j).includes('DRAFT TEXT'));
  try { db.exec(`INSERT INTO briefs (act_id, date, status, text, steer) VALUES ('brand_alpha', '2026-10-08', 'sent', 'SENT BRIEF', 'TEAM STEER'), ('brand_alpha', '2026-10-09', 'draft', 'DRAFT BRIEF', NULL)`); } catch (e) { db.exec(`INSERT INTO briefs (act_id, date, status, text) VALUES ('brand_alpha', '2026-10-08', 'sent', 'SENT BRIEF'), ('brand_alpha', '2026-10-09', 'draft', 'DRAFT BRIEF')`); }
  const bl = JSON.stringify((await ran('pf', CLIENT, 'GET', '/api/briefs?act=brand_alpha')).j);
  assert.ok(bl.includes('SENT BRIEF') && !bl.includes('DRAFT BRIEF') && !bl.includes('TEAM STEER'), bl.slice(0, 200));
  const one = JSON.stringify((await ran('pf', CLIENT, 'GET', '/api/brief?act=brand_alpha&date=2026-10-09')).j || {});
  assert.ok(!one.includes('DRAFT BRIEF') && !one.includes('TEAM STEER'), 'the brief page history holds sent briefs only');
});

await check('the assistant: a client asks the SAME engine in its client mode, pinned to its brand, its own sign-in, no SQL, no agency memory', async () => {
  /* Offline with no model key: the client path answers that it is not set up (never the team path, never a 403). */
  const off = await ah(CLIENT, 'POST', '/api/ask', { question: 'how are sales', screen: { act_id: 'brand_alpha' } });
  assert.notEqual(off.status, 403); assert.match(off.j.error, /not set up/);
  assert.equal((await ah(CLIENT, 'POST', '/api/ask', { question: 'how is beta', screen: { act_id: 'brand_beta' } })).status, 403);
  setSetting('strategistInstructions', 'TEAM ONLY: we are dropping Beta Socks next month');
  ahEnv.ANTHROPIC_API_KEY = 'test-key';
  const asked = [];
  let turn = 0;
  MOCK.anthropic = body => {
    asked.push(body);
    turn++;
    const use = { input_tokens: 2000, output_tokens: 100 };
    if (turn === 1) return { content: [{ type: 'tool_use', id: 't1', name: 'query_locus', input: { sql: 'SELECT * FROM brands' } }], stop_reason: 'tool_use', usage: use };
    if (turn === 2) return { content: [{ type: 'tool_use', id: 't2', name: 'locus_get', input: { path: '/api/reports?act=brand_beta' } }], stop_reason: 'tool_use', usage: use };
    if (turn === 3) return { content: [{ type: 'tool_use', id: 't3', name: 'locus_get', input: { path: '/api/reports?act=brand_alpha' } }], stop_reason: 'tool_use', usage: use };
    return { content: [{ type: 'text', text: 'One weekly report was sent, for Sept 28 to Oct 4.' }], stop_reason: 'end_turn', usage: use };
  };
  try {
    const r = await ah(CLIENT, 'POST', '/api/ask', { question: 'what reports did we get?', screen: { act_id: 'brand_alpha', screen: 'Reports' }, runId: 'abc1234' });
    assert.equal(r.status, 200, JSON.stringify(r.j)); assert.match(r.j.answer, /weekly report/); assert.equal(r.j.client, true);
    const tools = asked[0].tools.map(t => t.name);
    assert.ok(tools.includes('locus_get') && tools.includes('locus_routes'), tools.join(','));
    for (const t of ['query_locus', 'read_app', 'search_slack', 'read_thread', 'recall', 'read_skill', 'save_skill', 'locus_write', 'meta_read', 'tool_search_tool_regex']) assert.ok(!tools.includes(t), `${t} offered to a client`);
    const sys = JSON.stringify(asked[0].system);
    assert.match(sys, /ACCESS RULE/); assert.match(sys, /Alpha Golf/);
    for (const bad of ['Beta Socks', 'TEAM ONLY', 'Standing instructions', 'The active brands right now']) assert.ok(!sys.includes(bad), `system prompt carries ${bad}`);
    const results = JSON.stringify(asked.slice(1).map(b => b.messages[b.messages.length - 1]));
    assert.match(results, /Not available on this login/, 'the SQL tool was refused');
    assert.match(results, /do not have access to that brand/, 'another brand refused through the client\'s own sign-in');
    assert.ok(results.includes('2026-09-28') && !results.includes('2026-10-05'), 'its own reports read through the guard, the draft left out: ' + results.slice(-600));
    const use = getSetting(`clientAsk:${today}:nick@alpha.com`);
    assert.ok(use && use.n === 1 && use.cost > 0, 'the cost is counted against the client\'s day: ' + JSON.stringify(use));
    /* The team's daily question count is not touched by a client's question. */
    assert.equal(getSetting('strategistUsage'), null);
  } finally { MOCK.anthropic = null; delete ahEnv.ANTHROPIC_API_KEY; }
  /* Progress and Stop: only for the client's own run. */
  setSetting('askRun:zzz9999', { steps: ['Reading the numbers'], stop: false });
  const peek = await ah(CLIENT, 'GET', '/api/ask/progress?id=zzz9999');
  assert.deepEqual(peek.j.steps, [], 'someone else\'s run shows nothing');
  assert.equal((await ah(CLIENT, 'POST', '/api/ask/stop', { id: 'zzz9999' })).j.ok, false);
  setSetting('askRunWho:zzz9999', 'nick@alpha.com');
  assert.deepEqual((await ah(CLIENT, 'GET', '/api/ask/progress?id=zzz9999')).j.steps, ['Reading the numbers']);
  assert.equal((await ah(CLIENT, 'POST', '/api/ask/stop', { id: 'zzz9999' })).j.ok, true);
});

await check('the daily caps: Studio $3 and the assistant $2 per client per day, refused with 429 and a plain message when spent', async () => {
  const sKey = `clientStudio:${today}:nick@alpha.com`, aKey = `clientAsk:${today}:nick@alpha.com`;
  setSetting(sKey, { n: 9, cost: 2.9 });
  const full = await pf(CLIENT, 'POST', '/api/studio/make', { act: 'brand_alpha', n: 1, spec: { images: ['x'] } });
  assert.equal(full.status, 429); assert.match(full.j.error, /\$3 a day/);
  assert.equal((await pf(CLIENT, 'POST', '/api/studio/make', { act: 'brand_alpha', n: 4, spec: {} })).status, 429, 'four at once would pass the cap');
  setSetting(sKey, { n: 0, cost: 0 });
  const free = await ran('pf', CLIENT, 'POST', '/api/studio/make', { act: 'brand_alpha', n: 1, spec: { images: ['x'] } });
  assert.ok(passed(free), 'under the cap it reaches the handler: ' + free.status);
  assert.deepEqual(getSetting(sKey), { n: 0, cost: 0 }, 'a call that failed (no image key offline) is not charged');
  assert.equal((await ah(CLIENT, 'POST', '/api/studio-ai/video-create', { act: 'brand_alpha' })).status !== 429, true);
  setSetting(sKey, { n: 1, cost: 2 });
  assert.equal((await ah(CLIENT, 'POST', '/api/studio-ai/video-create', { act: 'brand_alpha' })).status, 429, 'a video estimate would pass $3');
  setSetting(aKey, { n: 30, cost: 2 });
  assert.equal((await ah(CLIENT, 'POST', '/api/read', { screen: 'overview', scope: 'Alpha', facts: {} })).status, 429);
  ahEnv.ANTHROPIC_API_KEY = 'test-key';
  try { const a = await ah(CLIENT, 'POST', '/api/ask', { question: 'x', screen: { act_id: 'brand_alpha' } }); assert.equal(a.status, 429); assert.match(a.j.error, /\$2 a day/); }
  finally { delete ahEnv.ANTHROPIC_API_KEY; }
  setSetting(aKey, { n: 0, cost: 0 });
  assert.equal((await ah(CLIENT, 'POST', '/api/read', { screen: 'command', facts: {} })).status, 403, 'the command center read is the agency\'s');
  /* The team has no cap. */
  assert.notEqual((await ran('pf', OWNER, 'POST', '/api/studio/make', { act: 'brand_alpha', n: 1, spec: { images: ['x'] } })).status, 429);
});

await check('War Room: a client reads its whole plan for its brand (never another or all), the team\'s notes stay out', async () => {
  assert.equal((await ah(CLIENT, 'GET', '/api/tw-day?act=brand_beta')).status, 403, 'another brand');
  assert.equal((await ah(CLIENT, 'GET', '/api/tw-day?act=all')).status, 403, 'all');
  assert.equal((await pf(CLIENT, 'GET', '/api/season/war?act=all')).status, 403);
  await pf(OWNER, 'PUT', '/api/season/war', { act: 'brand_alpha', patch: { notes: 'TEAM NOTE', thresholds: { mer: 2 } } });
  const w = await pf(CLIENT, 'GET', '/api/season/war?act=brand_alpha');
  assert.equal(w.status, 200, JSON.stringify(w.j).slice(0, 300)); assert.equal(w.j.war.notes, undefined); assert.deepEqual(w.j.war.thresholds, { mer: 2 }, 'the rest of the plan is theirs: ' + JSON.stringify(w.j.war));
  assert.equal((await pf(OWNER, 'GET', '/api/season/war?act=brand_alpha')).j.war.notes, 'TEAM NOTE');
});

await check('survey: a client reads and manages its own brand\'s survey card, never another brand\'s', async () => {
  const own = await ah(CLIENT, 'GET', '/api/survey?act=brand_alpha');
  assert.equal(own.status, 200, 'own brand'); assert.equal(own.j.error, 'not_linked');
  assert.equal((await ah(CLIENT, 'GET', '/api/survey?act=brand_beta')).status, 403, 'another brand');
  assert.equal((await ah(CLIENT, 'GET', '/api/survey?act=all')).status, 403, 'all');
  assert.equal((await ah(CLIENT, 'PUT', '/api/survey', { act: 'brand_beta', question_id: '1' })).status, 403, 'pin another brand\'s');
  assert.equal((await ah(CLIENT, 'DELETE', '/api/survey?act=brand_beta')).status, 403, 'forget another brand\'s');
  assert.equal((await ah(OWNER, 'GET', '/api/survey?act=brand_beta')).status, 200, 'the owner reads any brand');
});

await check('ads: a client may open its own ad, never another brand\'s', async () => {
  assert.equal((await ah(CLIENT, 'GET', '/api/ad-video?ad=9002&mode=preview')).status, 403);
  assert.equal((await ah(CLIENT, 'GET', '/api/ad-breakdown?ad=9002&from=2026-09-01&to=2026-09-30')).status, 403);
  assert.equal((await ah(CLIENT, 'GET', '/api/ad-creatives?act=brand_alpha&ads=9001,9002')).status, 403, 'one foreign ad in the list refuses the call');
  assert.equal((await ah(CLIENT, 'GET', '/api/ad-video?ad=424242')).status, 403, 'an unknown ad is refused');
  const mine = await ran('ah', CLIENT, 'GET', '/api/ad-video?ad=9001&mode=preview');
  assert.ok(passed(mine), 'own ad passes the guard');
});

await check('calendar: add, note, remove and put back its own brand\'s dates; never another brand\'s; never tick or Asana', async () => {
  const add = await ah(CLIENT, 'POST', '/api/calendar/event', { act: 'brand_alpha', name: 'Client launch', start: '2026-11-20', kind: 'drop' });
  assert.equal(add.status, 200, JSON.stringify(add.j));
  assert.equal((await ah(CLIENT, 'POST', '/api/calendar/event', { act: 'brand_beta', name: 'Sneaky', start: '2026-11-20' })).status, 403);
  assert.equal((await ah(CLIENT, 'POST', '/api/calendar/event', { act: 'brand_alpha', id: 'ev_b', name: 'Hijack', start: '2026-11-20' })).status, 403, 'editing beta\'s date with alpha\'s act');
  assert.equal((await ah(CLIENT, 'POST', '/api/calendar/move', { id: 'ev_b', start: '2026-12-01' })).status, 403);
  assert.equal((await ah(CLIENT, 'POST', '/api/calendar/move', { id: 'ev_a', start: '2026-11-03' })).status, 200);
  assert.equal((await ah(CLIENT, 'POST', '/api/calendar/comment', { id: 'ev_b', text: 'hi' })).status, 403);
  assert.equal((await ah(CLIENT, 'POST', '/api/calendar/comment', { id: 'ev_a', text: 'Photos come Friday' })).status, 200);
  assert.equal((await ah(CLIENT, 'GET', '/api/calendar/history?id=ev_b')).status, 403);
  const h = await ah(CLIENT, 'GET', '/api/calendar/history?id=ev_a');
  assert.equal(h.status, 200); assert.ok(h.j.history.some(x => x.s === 'Note: Photos come Friday' && x.b === 'Nick'));
  assert.equal((await ah(CLIENT, 'DELETE', '/api/calendar/event?id=ev_b')).status, 403, 'remove another brand\'s date');
  assert.equal((await ah(CLIENT, 'POST', '/api/calendar/restore', { id: 'ev_b' })).status, 403);
  assert.equal((await ah(CLIENT, 'DELETE', '/api/calendar/event?id=ev_a')).status, 200, 'remove its own');
  assert.equal(cal.db.prepare(`SELECT status FROM events WHERE id = 'ev_a'`).get().status, 'cancelled');
  assert.equal((await ah(CLIENT, 'POST', '/api/calendar/restore', { id: 'ev_a' })).status, 200, 'and put it back');
  assert.equal((await ah(CLIENT, 'POST', '/api/calendar/tick', { id: 'ev_a', key: 'briefs', done: true })).status, 403);
  assert.equal(cal.db.prepare(`SELECT launch_date, status FROM events WHERE id = 'ev_b'`).get().launch_date, '2026-11-02', 'beta untouched');
  assert.equal(cal.db.prepare(`SELECT status FROM events WHERE id = 'ev_b'`).get().status, 'tentative');
});

await check('a removed or brand-less client gets nothing; a team guest is never treated as a client', async () => {
  assert.equal((await ah(EMPTY, 'GET', '/api/reports?act=brand_alpha')).status, 401);
  assert.equal((await pf(EMPTY, 'GET', '/api/overview?days=30')).status, 401);
  assert.equal((await ah(STRANGER, 'GET', '/api/me')).status, 401);
  assert.equal((await pf(STRANGER, 'GET', '/api/overview')).status, 401);
  assert.equal((await ah(GUEST, 'GET', '/api/me')).j.role, 'team', 'allowedEmails wins over clientUsers');
});

await check('profit worker: a token signed with the old "dev" fallback key is refused', async () => {
  assert.equal((await pf(FORGED_DEV, 'GET', '/api/overview')).status, 401);
  assert.equal((await pf(FORGED_DEV, 'GET', '/api/auth-check')).j.local_session_verify, false);
  assert.equal((await pf(OWNER, 'GET', '/api/overview?days=30&series=0')).status, 200, 'a real session still works by delegation');
});

await check('profit worker now SEES who is asking: a limited teammate is held to their brands there too', async () => {
  setSetting('userBrands', { 'ahsan@go-mobius-digital.com': ['brand_beta'] });
  assert.equal((await pf(TEAM, 'GET', '/api/hub/store?act=brand_alpha')).status, 403);
  const ov = await pf(TEAM, 'GET', '/api/overview?days=30&series=0');
  assert.deepEqual(ov.j.accounts.map(a => a.act_id), ['brand_beta']);
  setSetting('userBrands', {});
});

await check('inviting: owner only, Mobius emails refused, the email goes only on approval, no switches, remove works', async () => {
  assert.equal((await ah(TEAM, 'GET', '/api/clients')).status, 200, 'the team can see the list');
  assert.equal((await ah(TEAM, 'POST', '/api/clients/invite', { emails: 'x@y.com', brands: ['brand_alpha'] })).status, 403, 'only Cole invites');
  const dom = await ah(OWNER, 'POST', '/api/clients/invite', { emails: 'ravo@go-mobius-digital.com', brands: ['brand_alpha'] });
  assert.equal(dom.j.failed.length, 1); assert.match(dom.j.failed[0].error, /Mobius account/);
  assert.equal((await ah(OWNER, 'POST', '/api/clients/invite', { emails: 'new@beta.com', brands: ['brand_beta'], send: true, subject: 's', body: 'b' })).status, 400, 'no send without approval');
  const draft = await ah(OWNER, 'GET', '/api/clients/draft?brands=brand_beta&email=new@beta.com&name=Sam%20Lee');
  assert.match(draft.j.body, /Hi Sam,/); assert.match(draft.j.body, /Continue with Google/); assert.ok(!/\u2014/.test(draft.j.body + draft.j.subject), 'no em dashes');
  assert.ok(!/read-only/i.test(draft.j.body), 'the invite no longer says read-only');
  setSetting('clientAccess', {});
  const inv = await ah(OWNER, 'POST', '/api/clients/invite', { emails: 'new@beta.com', brands: ['brand_beta'], access: { pl: false }, send: true, approved: true, subject: draft.j.subject, body: draft.j.body });
  assert.equal(inv.status, 200, JSON.stringify(inv.j)); assert.deepEqual(inv.j.sent, ['new@beta.com']); assert.equal(mails.length, 1);
  assert.deepEqual(getSetting('clientAccess'), {}, 'an old screen\'s switches are ignored');
  assert.equal((await ah(OWNER, 'PUT', '/api/clients/access', { act: 'brand_beta', pl: false })).status, 404, 'the switch route is gone');
  const list = await ah(OWNER, 'GET', '/api/clients?act=brand_beta');
  assert.deepEqual(list.j.clients.map(c => c.email), ['new@beta.com']); assert.ok(list.j.clients[0].last_invite);
  const NEW = mint('new@beta.com');
  assert.equal((await ah(NEW, 'GET', '/api/reports?act=brand_alpha')).status, 403);
  assert.equal((await ah(OWNER, 'POST', '/api/clients/remove', { email: 'new@beta.com' })).status, 200);
  assert.equal((await ah(NEW, 'GET', '/api/me')).status, 401, 'removed = locked out at once');
});

await check('the command center answers the team (every brand with its reasons) and a limited teammate only their brands', async () => {
  const c = await pf(OWNER, 'GET', '/api/hub/command?act=all');
  assert.equal(c.status, 200, JSON.stringify(c.j).slice(0, 300));
  assert.deepEqual(c.j.brands.map(b => b.act_id).sort(), ['brand_alpha', 'brand_beta']);
  const w = await ah(OWNER, 'GET', '/api/command/work');
  assert.equal(w.status, 200, JSON.stringify(w.j).slice(0, 300)); assert.ok(Array.isArray(w.j.pending) && Array.isArray(w.j.alerts));
  setSetting('userBrands', { 'ahsan@go-mobius-digital.com': ['brand_beta'] });
  const t = await pf(TEAM, 'GET', '/api/hub/command?act=all');
  assert.deepEqual(t.j.brands.map(b => b.act_id), ['brand_beta']);
  setSetting('userBrands', {});
});

await check('Costs: a client adds and edits its own brand\'s custom expenses, never another brand\'s', async () => {
  const item = { name: 'Warehouse rent', category: 'rent', kind: 'monthly', amount: 3000, start_date: '2026-10-01' };
  const put = await pf(CLIENT, 'PUT', '/api/expenses', { act: 'brand_alpha', items: [item] });
  assert.equal(put.status, 200, JSON.stringify(put.j));
  assert.equal(put.j.items[0].added_by, 'Nick', 'the client\'s own name');
  assert.ok(!JSON.stringify(put.j).includes('@'), 'no email in the answer');
  const got = await pf(CLIENT, 'GET', '/api/expenses?act=brand_alpha');
  assert.equal(got.status, 200); assert.deepEqual(got.j.items.map(x => x.name), ['Warehouse rent']);
  assert.ok(got.j.sources && 'cogs' in got.j.sources, 'where each cost comes from rides along');
  assert.equal((await pf(CLIENT, 'GET', '/api/expenses?act=brand_beta')).status, 403);
  assert.equal((await pf(CLIENT, 'PUT', '/api/expenses', { act: 'brand_beta', items: [item] })).status, 403);
  assert.equal((await pf(CLIENT, 'PUT', '/api/expenses?act=brand_alpha', { act: 'brand_beta', items: [item] })).status, 403);
  assert.equal((await pf(CLIENT, 'PUT', '/api/expenses', { act: 'all', items: [] })).status, 403);
  const t = await pf(OWNER, 'PUT', '/api/expenses', { act: 'brand_beta', items: [{ name: 'Klaviyo', category: 'software', kind: 'monthly', amount: 400, start_date: '2026-09-01' }] });
  assert.equal(t.status, 200, JSON.stringify(t.j));
  const betaId = t.j.items[0].id;
  const steal = await pf(CLIENT, 'PUT', '/api/expenses', { act: 'brand_alpha', items: [{ id: betaId, name: 'Mine now', kind: 'monthly', amount: 1, start_date: '2026-10-01' }] });
  assert.equal(steal.status, 200);
  assert.equal(db.prepare(`SELECT name FROM p_expense WHERE act_id = 'brand_beta'`).get().name, 'Klaviyo', 'beta untouched');
});

await check('a client can edit only its own profile', async () => {
  const r = await ah(CLIENT, 'PUT', '/api/clients/me', { name: 'Nick Y', welcomed: true });
  assert.equal(r.status, 200);
  assert.equal(getSetting('clientUsers')['nick@alpha.com'].name, 'Nick Y');
  const me = await ah(CLIENT, 'GET', '/api/clients/me');
  assert.equal(me.j.welcomed, true); assert.deepEqual(me.j.brands.map(b => b.id), ['brand_alpha']);
  assert.equal((await ah(CLIENT, 'PUT', '/api/clients/me', { email: 'cole@go-mobius-digital.com', brands: ['brand_beta'] })).status, 200);
  assert.deepEqual(getSetting('clientUsers')['nick@alpha.com'].brands, ['brand_alpha'], 'a client cannot widen its own brands');
});

await check('Inspiration: a client reads its own brand\'s Atria board and the shared season boards, never another brand\'s board', async () => {
  const { swipeBoardsFor } = await import('../../profit/worker/src/season.js');
  const shared = swipeBoardsFor('brand_alpha')[0];
  const r = await ran('ah', CLIENT, 'GET', `/api/atria/board?board_id=${shared}&act=brand_alpha`);
  assert.ok(passed(r), 'a shared season board: ' + r.status);
  assert.equal((await ah(CLIENT, 'GET', `/api/atria/board?board_id=${swipeBoardsFor('brand_lucky_golf').pop()}&act=brand_alpha`)).status, 403, 'another brand\'s own board');
  assert.equal((await ah(CLIENT, 'GET', `/api/atria/board?board_id=${shared}`)).status, 403, 'no brand named');
  assert.ok(passed(await ran('ah', OWNER, 'GET', `/api/atria/board?board_id=${swipeBoardsFor('brand_lucky_golf').pop()}`)), 'the team reads any board');
});

/* Products > Stock and Drops for clients (2026-10-10): read only, own brand, costs and suppliers stripped. Supply is mocked
   behind the SUPPLY binding; every request it gets is recorded so the test can prove nothing but GETs reached it. */
await check('Stock and Drops (2026-10-10): a client reads its own brand, costs and suppliers stripped; never another brand, Buying or a Supply write', async () => {
  const seen = [];
  const FIX = {
    brandName: 'Alpha Golf', tz: 'America/Chicago', today: '2026-10-10', generatedAt: '2026-10-10T12:00:00Z', lastRun: '2026-10-10T11:00:00Z', historyDays: 400, historyStart: '2025-09-01',
    settings: { buffer_days: 10, cover_days: 180, asana_project: 'ASANA-SECRET' }, headline: { revenueAtRisk: 9999 }, decisions: [{ title: 'Order Polo by Oct 20', body: 'about $4.2k at cost' }],
    products: [{ id: '101', title: 'Polo Navy', image: 'https://cdn/p.png', lineId: 'l_polo', lineName: 'Polos', status: 'order', lifecycle: 'core', decision: 'keep', onHand: 40, velocity: 1.2, perWeek: 8.4,
      runOutDays: 33, runOutDate: '2026-11-12', incoming: 100, incomingLands: '2026-12-01', weeksOfCover: 5, sold90: 108, cost: 11.5, price: 65, factoryId: 'fac_wst_golf', factoryName: 'WST Golf Ltd',
      leadDays: 75, moq: 100, suggested: 220, atCost: 2530, revenueAtRisk: 1400, deadCost: 50, notes: 'Factory rep is Mr Chen, 20% deposit',
      variants: [{ id: 'v1', sku: 'PN-M', axis: 'M', onHand: 20, velocity: 0.7, isCore: true, runOutDays: 28, cost: 11.5, price: 65, suggested: 120, series: [1, 2], incomingOrders: [{ orderId: 'PO-0007', qty: 60, lands: '2026-12-01', status: 'production' }] }] }],
    lines: [{ id: 'l_polo', name: 'Polos', target: 12, cutRulePct: 25, planned: true, keep: 9, decide: 2, cut: 1, openSlots: 1, weeksOfCover: 5, onHand: 400, factoryId: 'fac_wst_golf', factoryName: 'WST Golf Ltd', moq: 100,
      dead: { units: 3, cost: 35, retail: 195 }, revenueAtRisk: 1400, plan: [{ productId: '101', rank: 1, band: false, near: false, state: 'keep', decided: true }] }],
    slots: [{ id: 's1', name: 'Spring 2027 · Polo 1', line_id: 'l_polo', lineName: 'Polos', collection_id: 'c1', collectionName: 'Spring 2027', status: 'sampling', factoryId: 'fac_wst_golf', dates: { briefDue: '2026-09-01', onSite: '2027-03-01' },
      next: { what: 'Sample approved', on: '2026-11-01', days: 22, late: false }, asana_task: 'https://app.asana.com/0/1/2', asana_gid: '2', notes: 'Use the cheaper thread, saves $0.40', sample_tracking: 'DHL 123',
      made: { orderId: 'PO-0007', status: 'production', label: 'In production', expected_at: '2026-12-01' }, sample: { state: 'coming', label: 'Sample due Oct 30', on: '2026-10-30' } }],
    collections: [{ id: 'c1', name: 'Spring 2027', drop_at: '2027-03-01', designs: 1, notes: 'Budget $12k', withTask: 1 }],
    orders: [{ id: 'PO-0007', status: 'production', factory_id: 'fac_wst_golf', factoryName: 'WST Golf Ltd', expected_at: '2026-12-01', units: 100, received: 0, atCost: 1150, deposit: '50% paid', tracking: 'DHL 999', notes: 'pay balance on ship',
      lines: [{ unit_cost: 11.5 }] }, { id: 'PO-0008', status: 'draft', units: 50, atCost: 575 }],
    factories: [{ id: 'fac_wst_golf', name: 'WST Golf Ltd', contact: 'chen@wst.example', moq_default: 100, closures: [{ from: '2027-02-06', to: '2027-02-20', label: 'Chinese New Year' }] }],
    asanaLoose: [{ name: 'Loose card', url: 'https://app.asana.com/0/9/9' }], db: { lines: [{ id: 'l_polo', target_designs: 12, factory_id: 'fac_wst_golf' }], factories: [{ name: 'WST Golf Ltd' }] },
  };
  ahEnv.SUPPLY = { fetch: async req => {
    const u = new URL(req.url); seen.push(`${req.method} ${u.pathname} ${u.searchParams.get('brand') || ''} ${req.headers.get('Authorization')}`);
    if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'no writes in this test' }), { status: 500 });
    if (u.pathname === '/api/brands') return new Response(JSON.stringify({ brands: [{ id: 'alpha', name: 'Alpha', act_id: 'brand_alpha', makes: true, buys: true, active: true }, { id: 'beta', name: 'Beta', act_id: 'brand_beta', makes: true, buys: true, active: true }] }));
    if (u.pathname === '/api/state') return new Response(JSON.stringify({ ...FIX, brandName: u.searchParams.get('brand') }));
    return new Response('{}', { status: 404 });
  } };
  ahEnv.SUPPLY_TOKEN = 'supply-token';
  try {
    /* the client's own brand: the brand list (Drops on, Buying never) and the stripped state */
    const br = await ah(CLIENT, 'GET', '/api/supply/client?act=brand_alpha&what=brands');
    assert.equal(br.status, 200, JSON.stringify(br.j)); assert.deepEqual(br.j.brands, [{ id: 'alpha', act_id: 'brand_alpha', name: 'Alpha', makes: true, buys: false, active: true }]);
    const r = await ah(CLIENT, 'GET', '/api/supply/client?act=brand_alpha&what=state');
    assert.equal(r.status, 200, JSON.stringify(r.j));
    const p = r.j.products[0], s = r.j.slots[0];
    assert.equal(p.onHand, 40); assert.equal(p.runOutDate, '2026-11-12'); assert.equal(p.incomingLands, '2026-12-01'); assert.equal(p.incoming, 100); assert.equal(p.image, 'https://cdn/p.png');
    assert.equal(p.status, 'ok', 'an order-timing status reads as fine'); assert.equal(p.decision, 'keep');
    assert.deepEqual(p.variants[0].incomingOrders, [{ qty: 60, lands: '2026-12-01' }]);
    assert.equal(s.status, 'sampling'); assert.equal(s.next.on, '2026-11-01'); assert.equal(s.made.label, 'In production'); assert.equal(r.j.collections[0].drop_at, '2027-03-01');
    assert.equal(r.j.lines[0].plan[0].state, 'keep'); assert.equal(r.j.lines[0].cut, 1);
    assert.deepEqual(r.j.orders, [{ id: 'restock_1', status: 'production', expected_at: '2026-12-01', landed_at: null, overdue: false, units: 100, received: 0 }], 'placed restocks only, dates and units');
    assert.deepEqual(r.j.factories, [{ id: 'f1', closures: [{ from: '2027-02-06', to: '2027-02-20', label: 'Chinese New Year' }] }]);
    const raw = JSON.stringify(r.j);
    for (const bad of ['"cost"', '"price"', 'atCost', 'unit_cost', 'WST', 'wst', 'chen', 'Mr Chen', 'deposit', 'DHL', 'asana', 'ASANA', 'PO-000', 'Budget', 'cheaper thread', 'suggested', 'revenueAtRisk', 'deadCost', '"moq"', 'leadDays', 'settings', 'decisions', 'headline', 'asanaLoose', 'notes', 'factoryName', 'draft'])
      assert.ok(!raw.includes(bad), `client answer leaks ${bad}`);
    /* Ad spend per product (the Stock page's Ads column): their brand only */
    { const sa = await pf(CLIENT, 'GET', '/api/hub/stockads?act=brand_alpha'); assert.equal(sa.status, 200, 'stockads ' + JSON.stringify(sa.j)); }
    assert.equal((await pf(CLIENT, 'GET', '/api/hub/stockads?act=brand_beta')).status, 403);
    /* another brand, "all", no brand: refused before Supply is asked */
    const before = seen.length;
    for (const q of ['act=brand_beta&what=state', 'act=act_222&what=brands', 'act=all&what=state', 'what=state'])
      assert.equal((await ah(CLIENT, 'GET', '/api/supply/client?' + q)).status, 403, q);
    assert.equal(seen.length, before, 'Supply never asked for another brand');
    /* Buying and every Supply write: the proxy's write routes and anything else under /api/supply are off the list */
    for (const [m, p2, b] of [['POST', '/api/supply/orders?brand=alpha', { act: 'brand_alpha', lines: [] }], ['PUT', '/api/supply/products/101?brand=alpha', { act: 'brand_alpha', decision: 'cut' }],
      ['POST', '/api/supply/slots?brand=alpha', { act: 'brand_alpha', name: 'x' }], ['PUT', '/api/supply/collections?brand=alpha', { act: 'brand_alpha' }], ['GET', '/api/supply/orders?act=brand_alpha'], ['GET', '/api/supply/state?act=brand_alpha'],
      ['POST', '/api/supply/client?act=brand_alpha', { act: 'brand_alpha' }]])
      assert.equal((await ah(CLIENT, m, p2, b)).status, 403, `${m} ${p2}`);
    assert.ok(seen.every(x => x.startsWith('GET ')), 'only reads reached Supply: ' + seen.join(' | '));
    assert.ok(seen.every(x => x.endsWith('Bearer supply-token')), 'Supply is called with the Supply token, never the client session');
    /* the team: same read for any brand; the Strategist's write proxy still answers the team */
    const t = await ah(TEAM, 'GET', '/api/supply/client?act=brand_beta&what=state');
    assert.equal(t.status, 200, 'team ' + JSON.stringify(t.j)); assert.equal(t.j.brand, 'beta');
    const tw = await ah(TEAM, 'PUT', '/api/supply/products/101?brand=alpha', { decision: 'keep' });
    assert.equal(tw.status, 502, 'team write still reaches the proxy (the mock refuses writes)');
    assert.equal((await ah(null, 'GET', '/api/supply/client?act=brand_alpha&what=state')).status, 401, 'no login, no stock');
  } finally { delete ahEnv.SUPPLY; delete ahEnv.SUPPLY_TOKEN; }
});

globalThis.fetch = realFetch;
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
