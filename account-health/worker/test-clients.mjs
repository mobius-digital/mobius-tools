/* Offline security checks for CLIENT LOGINS (2026-10-09): brandguard.js (both workers), clients.js, the
 * calendar's client rules, and the auth changes in both workers. Drives the REAL account-health and profit
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
globalThis.fetch = async (url, init = {}) => {
  const u = String(url?.url || url);
  if (u.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
    const email = decodeURIComponent(u.split('id_token=')[1] || '');
    return new Response(JSON.stringify({ aud: 'cid', email, email_verified: 'true' }), { status: 200 });
  }
  if (u.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'gtok', expires_in: 3600 }), { status: 200 });
  if (u.includes('gmail/v1/users/me/messages/send')) { mails.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); }
  return new Response(JSON.stringify({ error: 'offline: ' + u }), { status: 503 });
};

const AH = (await import('./src/worker.js')).default;
const PF = (await import('../../profit/worker/src/worker.js')).default;
const keyPem = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const ahEnv = { DB, CAL: cal.DB, SESSION_SECRET: SECRET, GOOGLE_CLIENT_ID: 'cid', GOOGLE_SA_KEY: JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: keyPem }) };
const ctx = { waitUntil() {} };
/* Production shape: the profit worker has NO SESSION_SECRET and NO ADMIN_TOKEN; it asks account-health. */
const pfEnv = { DB, AUTH: { fetch: req => AH.fetch(req, ahEnv, ctx) } };
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

await check('/api/me says who: client (with brands), team, owner', async () => {
  const c = await ah(CLIENT, 'GET', '/api/me');
  assert.equal(c.status, 200); assert.equal(c.j.role, 'client'); assert.deepEqual(c.j.client.brands.map(b => b.id), ['brand_alpha']);
  assert.deepEqual(c.j.client.brands[0].access, { pl: true, strategist: true, changes: true, creators: true }, 'every switch is ON by default');
  assert.equal((await ah(TEAM, 'GET', '/api/me')).j.role, 'team');
  assert.equal((await ah(OWNER, 'GET', '/api/me')).j.role, 'owner');
});

await check('a client cannot read another brand, or "all", on either worker', async () => {
  for (const [w, p] of [['ah', '/api/reports?act=brand_beta'], ['ah', '/api/klaviyo?act=brand_beta&what=overview'], ['ah', '/api/calendar?act=brand_beta'],
    ['pf', '/api/hub/paid?platform=meta&act=brand_beta'], ['pf', '/api/hub/store?act=all'], ['pf', '/api/customers?act=act_222'], ['ah', '/api/reports?act=all']]) {
    const r = await call(w, CLIENT, 'GET', p);
    assert.equal(r.status, 403, `${w} ${p} -> ${r.status}`);
  }
});

await check('a client cannot call a write route (403 on every non-GET outside the calendar and its profile)', async () => {
  for (const [w, m, p, b] of [['ah', 'PUT', '/api/accounts/brand_alpha', { target_cpa: 1 }], ['ah', 'POST', '/api/report-send', { act: 'brand_alpha' }], ['ah', 'PUT', '/api/settings', { briefHour: 3 }],
    ['ah', 'PUT', '/api/team', { email: 'x@y.com' }], ['ah', 'POST', '/api/clients/invite', { emails: ['a@b.com'], brands: ['brand_alpha'] }], ['ah', 'PUT', '/api/clients/access', { act: 'brand_alpha', pl: true }],
    ['ah', 'POST', '/api/activities', { act: 'brand_alpha' }], ['ah', 'POST', '/api/studio-ai/plan', { act: 'brand_alpha' }], ['pf', 'PUT', '/api/goals', { act: 'brand_alpha' }], ['pf', 'PUT', '/api/plan', { act: 'brand_alpha' }],
    ['pf', 'PUT', '/api/dashboard', { act: 'brand_alpha' }], ['pf', 'POST', '/api/report-send', { act: 'brand_alpha' }], ['ah', 'DELETE', '/api/calendar/event?id=ev_a'], ['ah', 'POST', '/api/calendar/tick', { id: 'ev_a', key: 'x', done: true }],
    ['ah', 'POST', '/api/calendar/asana', { id: 'ev_a' }], ['ah', 'POST', '/api/calendar/restore', { id: 'ev_a' }], ['ah', 'POST', '/api/share/slack', { act: 'brand_alpha' }]]) {
    const r = await call(w, CLIENT, m, p, b);
    assert.equal(r.status, 403, `${w} ${m} ${p} -> ${r.status}`);
  }
});

await check('a client cannot open settings, team, integrations, data health or the brief', async () => {
  for (const [w, p] of [['ah', '/api/settings'], ['ah', '/api/team'], ['ah', '/api/integrations'], ['ah', '/api/clients'], ['pf', '/api/data-health?act=brand_alpha&days=14'],
    ['pf', '/api/briefs?act=brand_alpha'], ['pf', '/api/brief?act=brand_alpha'], ['ah', '/api/brand/rules?act=brand_alpha'], ['pf', '/api/brand/rules?act=brand_alpha'], ['ah', '/api/assets?act=brand_alpha'],
    ['pf', '/api/season?act=brand_alpha'], ['pf', '/api/dashboards?act=brand_alpha'], ['ah', '/api/schedule-health'], ['ah', '/api/research/run?act=brand_alpha'],
    ['pf', '/api/hub/command?act=brand_alpha'], ['pf', '/api/hub/command?act=all'], ['ah', '/api/command/work']]) {
    const r = await call(w, CLIENT, 'GET', p);
    assert.equal(r.status, 403, `${w} ${p} -> ${r.status}`);
  }
});

await check('the Strategist internals are refused; the client Strategist is ON by default, can be turned off, and is never the team engine', async () => {
  for (const p of ['/api/ask/findings', '/api/ask/memory', '/api/ask/settings', '/api/ask/usage', '/api/ask/skills', '/api/ask/progress?id=abcdef1', '/api/ask/reports', '/api/ask/schedules'])
    assert.equal((await ah(CLIENT, 'GET', p)).status, 403, p);
  assert.equal((await ah(CLIENT, 'POST', '/api/ask/memory', { text: 'x' })).status, 403);
  assert.equal((await ah(CLIENT, 'POST', '/api/ask/apply', { id: 'p1' })).status, 403);
  const on = await ah(CLIENT, 'POST', '/api/ask', { question: 'how are sales', screen: { act_id: 'brand_alpha' } });
  assert.notEqual(on.status, 403, 'on by default'); assert.match(on.j.error, /not set up/, 'reaches the client-safe path (no model key offline)');
  setSetting('clientAccess', { brand_alpha: { strategist: false } });
  const off = await ah(CLIENT, 'POST', '/api/ask', { question: 'how are sales', screen: { act_id: 'brand_alpha' } });
  assert.equal(off.status, 403, 'turned off for the brand'); assert.match(off.j.error, /switched off/);
  setSetting('clientAccess', {});
  const other = await ah(CLIENT, 'POST', '/api/ask', { question: 'how is beta', screen: { act_id: 'brand_beta' } });
  assert.equal(other.status, 403);
  setSetting('clientAccess', {});
});

await check('reports: a client sees SENT reports only, never a draft', async () => {
  const list = await pf(CLIENT, 'GET', '/api/reports?act=brand_alpha');
  assert.equal(list.status, 200);
  assert.deepEqual(list.j.rows.map(r => r.status), ['sent']); assert.equal(list.j.lastRun, undefined);
  const draft = await pf(CLIENT, 'GET', '/api/report?act=brand_alpha&period=weekly&start=2026-10-05');
  assert.equal(draft.status, 404); assert.ok(!JSON.stringify(draft.j).includes('DRAFT TEXT'));
  const sent = await ah(CLIENT, 'GET', '/api/report?act=brand_alpha&period=weekly&start=2026-09-28');
  assert.equal(sent.status, 200); assert.equal(sent.j.summary, 'Sent one');
  assert.equal(sent.j.data.cm, 5, 'P&L is on by default, so the margin shows');
  assert.equal(sent.j.slack_channel, undefined);
  setSetting('clientAccess', { brand_alpha: { pl: false } });
  const off = await ah(CLIENT, 'GET', '/api/report?act=brand_alpha&period=weekly&start=2026-09-28');
  assert.equal(off.j.data.cm, undefined, 'contribution margin scrubbed once P&L is turned off');
  setSetting('clientAccess', {});
});

await check('P&L is on by default and still behind its switch', async () => {
  assert.notEqual((await pf(CLIENT, 'GET', '/api/client?act=brand_alpha&days=30')).status, 403, 'on by default');
  setSetting('clientAccess', { brand_alpha: { pl: false } });
  assert.equal((await pf(CLIENT, 'GET', '/api/client?act=brand_alpha&days=30')).status, 403, 'turned off = refused');
  setSetting('clientAccess', {});
});

await check('defaults: P&L, change history, the creator link and the Strategist are ON with nothing stored; an override turns one off', async () => {
  setSetting('clientAccess', {});
  for (const [w, p] of [['ah', '/api/activities?act=brand_alpha'], ['ah', '/api/google/ads-changes?act=brand_alpha'], ['pf', '/api/client?act=brand_alpha&days=30'], ['pf', '/api/forecast?act=brand_alpha']]) {
    let r; try { r = await call(w, CLIENT, 'GET', p); } catch (e) { r = { status: 'handler ran: ' + e.message }; }
    assert.notEqual(r.status, 403, `${w} ${p} refused with every switch on by default`);
  }
  const me = await ah(CLIENT, 'GET', '/api/clients/me');
  assert.equal(me.j.brands[0].access.creators, true, 'creator link on by default');
  /* The owner turns Changes off for the brand: only the override is stored, and the route is refused. */
  const put = await ah(OWNER, 'PUT', '/api/clients/access', { act: 'brand_alpha', changes: false });
  assert.equal(put.status, 200); assert.deepEqual(getSetting('clientAccess'), { brand_alpha: { changes: false } }, 'only the override is stored');
  assert.equal((await ah(CLIENT, 'GET', '/api/activities?act=brand_alpha')).status, 403, 'Changes turned off = refused');
  assert.notEqual((await pf(CLIENT, 'GET', '/api/client?act=brand_alpha&days=30')).status, 403, 'P&L untouched');
  const list = await ah(OWNER, 'GET', '/api/clients?act=brand_alpha');
  assert.deepEqual(list.j.access.brand_alpha, { pl: true, strategist: true, changes: false, creators: true }, 'the card reads the defaults plus the override');
  /* Turned back on = the override row goes. */
  await ah(OWNER, 'PUT', '/api/clients/access', { act: 'brand_alpha', changes: true });
  assert.deepEqual(getSetting('clientAccess'), {}, 'back to the default leaves nothing stored');
  /* A teammate cannot change a switch, and a client never can. */
  assert.equal((await ah(TEAM, 'PUT', '/api/clients/access', { act: 'brand_alpha', pl: false })).status, 403);
  assert.equal((await ah(CLIENT, 'PUT', '/api/clients/access', { act: 'brand_alpha', pl: false })).status, 403);
});

await check('Home: /api/overview answers with the client\'s brand only, internal keys always scrubbed, costs once P&L is off', async () => {
  const dflt = JSON.stringify((await pf(CLIENT, 'GET', '/api/overview?days=30&series=0')).j);
  for (const k of ['"slack_channel"', '"brief_channel"', '"report_config"']) assert.ok(!dflt.includes(k), `${k} leaked with the defaults on`);
  setSetting('clientAccess', { brand_alpha: { pl: false } });
  const r = await pf(CLIENT, 'GET', '/api/overview?days=30&series=0');
  setSetting('clientAccess', {});
  assert.equal(r.status, 200, JSON.stringify(r.j).slice(0, 200));
  assert.deepEqual(r.j.accounts.map(a => a.act_id), ['brand_alpha']);
  const s = JSON.stringify(r.j);
  for (const k of ['"cogs"', '"cm"', '"gross_profit"', '"margin_pct"', '"slack_channel"', '"brief_channel"', '"report_config"', '"cost_health"']) assert.ok(!s.includes(k), `${k} leaked`);
  const team = await pf(TEAM, 'GET', '/api/overview?days=30&series=0');
  assert.equal(team.status, 200); assert.equal(team.j.accounts.length, 2, 'team still sees every brand');
});

await check('War Room live: a client may read its own brand Triple Whale day (never another or all); costs go while P&L is off', async () => {
  assert.equal((await ah(CLIENT, 'GET', '/api/tw-day?act=brand_beta')).status, 403, 'another brand');
  assert.equal((await ah(CLIENT, 'GET', '/api/tw-day?act=all')).status, 403, 'all');
  assert.notEqual((await ah(CLIENT, 'GET', '/api/tw-day?act=brand_alpha')).status, 403, 'its own brand passes the guard');
  const { CLIENT_RULES } = await import('./src/brandguard.js');
  const rule = CLIENT_RULES.find(r => r.p === '/api/tw-day');
  const day = () => ({ map: { netSales: 100, blendedAds: 20, orders: 3, totalProductCosts: 40, grossProfit: 60, totalPaymentGatewayCosts: 3 }, hours: { netSales: [1], totalProductCosts: [1] } });
  const off = rule.post(day(), { pl: true, changes: false });
  assert.deepEqual(Object.keys(off.map).sort(), ['blendedAds', 'netSales', 'orders'], 'P&L off: cost ids stripped');
  assert.deepEqual(Object.keys(off.hours), ['netSales']);
  assert.equal(Object.keys(rule.post(day(), { pl: false, changes: false }).map).length, 6, 'P&L on: the whole map');
});

await check('survey: a client reads its own brand\'s post-purchase survey card, never another brand\'s, and cannot change or forget it', async () => {
  const own = await ah(CLIENT, 'GET', '/api/survey?act=brand_alpha');
  assert.equal(own.status, 200, 'own brand'); assert.equal(own.j.error, 'not_linked');
  assert.equal((await ah(CLIENT, 'GET', '/api/survey?act=brand_beta')).status, 403, 'another brand');
  assert.equal((await ah(CLIENT, 'GET', '/api/survey?act=all')).status, 403, 'all');
  assert.equal((await ah(CLIENT, 'PUT', '/api/survey', { act: 'brand_alpha', question_id: '1' })).status, 403, 'pin');
  assert.equal((await ah(CLIENT, 'DELETE', '/api/survey?act=brand_alpha')).status, 403, 'forget');
  assert.equal((await ah(CLIENT, 'PUT', '/api/brand-links', { act: 'brand_alpha', survey_key: 'x'.repeat(30) })).status, 403, 'paste a key');
  assert.equal((await ah(OWNER, 'GET', '/api/survey?act=brand_beta')).status, 200, 'the owner reads any brand');
});

await check('ads: a client may open its own ad, never another brand\'s', async () => {
  assert.equal((await ah(CLIENT, 'GET', '/api/ad-video?ad=9002&mode=preview')).status, 403);
  assert.equal((await ah(CLIENT, 'GET', '/api/ad-breakdown?ad=9002&from=2026-09-01&to=2026-09-30')).status, 403);
  assert.equal((await ah(CLIENT, 'GET', '/api/ad-creatives?act=brand_alpha&ads=9001,9002')).status, 403, 'one foreign ad in the list refuses the call');
  assert.equal((await ah(CLIENT, 'GET', '/api/ad-video?ad=424242')).status, 403, 'an unknown ad is refused');
  /* Offline the handler then fails on Meta (no token); what matters is that the guard let it through. */
  let mine; try { mine = await ah(CLIENT, 'GET', '/api/ad-video?ad=9001&mode=preview'); } catch (e) { mine = { status: 'handler ran: ' + e.message }; }
  assert.notEqual(mine.status, 403, 'own ad passes the guard'); assert.notEqual(mine.status, 401);
});

await check('calendar: add and note on its own brand; never touch another brand\'s date', async () => {
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
  assert.equal(cal.db.prepare(`SELECT launch_date FROM events WHERE id = 'ev_b'`).get().launch_date, '2026-11-02', 'beta untouched');
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

await check('inviting: owner only, Mobius emails refused, the email goes only on approval, remove works', async () => {
  assert.equal((await ah(TEAM, 'GET', '/api/clients')).status, 200, 'the team can see the list');
  assert.equal((await ah(TEAM, 'POST', '/api/clients/invite', { emails: 'x@y.com', brands: ['brand_alpha'] })).status, 403, 'only Cole invites');
  const dom = await ah(OWNER, 'POST', '/api/clients/invite', { emails: 'ravo@go-mobius-digital.com', brands: ['brand_alpha'] });
  assert.equal(dom.j.failed.length, 1); assert.match(dom.j.failed[0].error, /Mobius account/);
  assert.equal((await ah(OWNER, 'POST', '/api/clients/invite', { emails: 'new@beta.com', brands: ['brand_beta'], send: true, subject: 's', body: 'b' })).status, 400, 'no send without approval');
  const draft = await ah(OWNER, 'GET', '/api/clients/draft?brands=brand_beta&email=new@beta.com&name=Sam%20Lee');
  assert.match(draft.j.body, /Hi Sam,/); assert.match(draft.j.body, /Continue with Google/); assert.ok(!/\u2014/.test(draft.j.body + draft.j.subject), 'no em dashes');
  const inv = await ah(OWNER, 'POST', '/api/clients/invite', { emails: 'new@beta.com', brands: ['brand_beta'], access: { pl: false, strategist: true, changes: true, creators: true }, send: true, approved: true, subject: draft.j.subject, body: draft.j.body });
  assert.equal(inv.status, 200, JSON.stringify(inv.j)); assert.deepEqual(inv.j.sent, ['new@beta.com']); assert.equal(mails.length, 1);
  assert.deepEqual(getSetting('clientAccess').brand_beta, { pl: false }, 'the invite stores only what was turned off');
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
  for (const b of c.j.brands) { assert.ok(Array.isArray(b.reasons)); assert.ok(b.reasons.some(r => r.kind === 'setup'), 'no data = setup gaps named'); }
  const w = await ah(OWNER, 'GET', '/api/command/work');
  assert.equal(w.status, 200, JSON.stringify(w.j).slice(0, 300)); assert.ok(Array.isArray(w.j.pending) && Array.isArray(w.j.alerts));
  setSetting('userBrands', { 'ahsan@go-mobius-digital.com': ['brand_beta'] });
  const t = await pf(TEAM, 'GET', '/api/hub/command?act=all');
  assert.deepEqual(t.j.brands.map(b => b.act_id), ['brand_beta']);
  setSetting('userBrands', {});
});

await check('Costs (2026-10-10): a client adds and edits its own brand\'s custom expenses with P&L on, never another brand\'s, never with P&L off', async () => {
  const item = { name: 'Warehouse rent', category: 'rent', kind: 'monthly', amount: 3000, start_date: '2026-10-01' };
  const put = await pf(CLIENT, 'PUT', '/api/expenses', { act: 'brand_alpha', items: [item] });
  assert.equal(put.status, 200, JSON.stringify(put.j));
  assert.equal(put.j.items[0].added_by, 'Nick', 'the client\'s own name');
  assert.ok(!JSON.stringify(put.j).includes('@'), 'no email in the answer');
  const got = await pf(CLIENT, 'GET', '/api/expenses?act=brand_alpha');
  assert.equal(got.status, 200); assert.deepEqual(got.j.items.map(x => x.name), ['Warehouse rent']);
  assert.ok(got.j.sources && 'cogs' in got.j.sources, 'where each cost comes from rides along (P&L on)');
  /* another brand, "all", or a body/query mismatch: refused */
  assert.equal((await pf(CLIENT, 'GET', '/api/expenses?act=brand_beta')).status, 403);
  assert.equal((await pf(CLIENT, 'PUT', '/api/expenses', { act: 'brand_beta', items: [item] })).status, 403);
  assert.equal((await pf(CLIENT, 'PUT', '/api/expenses?act=brand_alpha', { act: 'brand_beta', items: [item] })).status, 403);
  assert.equal((await pf(CLIENT, 'PUT', '/api/expenses', { act: 'all', items: [] })).status, 403);
  /* P&L switched off for the brand: both routes refused, nothing changes */
  setSetting('clientAccess', { brand_alpha: { pl: false } });
  assert.equal((await pf(CLIENT, 'GET', '/api/expenses?act=brand_alpha')).status, 403);
  assert.equal((await pf(CLIENT, 'PUT', '/api/expenses', { act: 'brand_alpha', items: [] })).status, 403);
  setSetting('clientAccess', {});
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM p_expense WHERE act_id = 'brand_alpha'`).get().n, 1, 'still there');
  /* the team edits any brand; Cole's row keeps "Added by" through the client's later edit */
  const t = await pf(OWNER, 'PUT', '/api/expenses', { act: 'brand_beta', items: [{ name: 'Klaviyo', category: 'software', kind: 'monthly', amount: 400, start_date: '2026-09-01' }] });
  assert.equal(t.status, 200, JSON.stringify(t.j)); assert.equal(t.j.items[0].added_by, 'Cole');
  const tg = await pf(TEAM, 'GET', '/api/expenses?act=brand_alpha');
  assert.equal(tg.status, 200); assert.equal(tg.j.items[0].added_by, 'Nick', 'the team sees what the client added');
  const id = got.j.items[0].id;
  const t2 = await pf(OWNER, 'PUT', '/api/expenses', { act: 'brand_alpha', items: [{ ...got.j.items[0], id, amount: 3200 }, { name: 'Podcast read', category: 'marketing', kind: 'once', amount: 900, start_date: '2026-10-03', is_ad_spend: true }] });
  assert.equal(t2.status, 200);
  const rent = t2.j.items.find(x => x.name === 'Warehouse rent');
  assert.equal(rent.amount, 3200); assert.equal(rent.added_by, 'Nick', 'editing keeps who added it');
  assert.equal(t2.j.items.find(x => x.name === 'Podcast read').added_by, 'Cole');
  /* a client cannot slip another brand's row id into its own list to take it over */
  const betaId = t.j.items[0].id;
  const steal = await pf(CLIENT, 'PUT', '/api/expenses', { act: 'brand_alpha', items: [{ id: betaId, name: 'Mine now', kind: 'monthly', amount: 1, start_date: '2026-10-01' }] });
  assert.equal(steal.status, 200);
  assert.equal(db.prepare(`SELECT name FROM p_expense WHERE act_id = 'brand_beta'`).get().name, 'Klaviyo', 'beta untouched');
  assert.equal(steal.j.items[0].added_by, 'Nick', 'treated as a new row of its own');
  /* P&L off: the expense keys ride nowhere in Home */
  setSetting('clientAccess', { brand_alpha: { pl: false } });
  const ov = JSON.stringify((await pf(CLIENT, 'GET', '/api/overview?days=30&series=0')).j);
  setSetting('clientAccess', {});
  assert.ok(!ov.includes('"ad_expense"'), 'ad_expense scrubbed with P&L off');
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
