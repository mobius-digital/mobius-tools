/* Offline checks for CLIENT ONBOARDING (onboard.js, 2026-11-26; the contract is onboarding-spec.md, Cole's decisions
 * of Nov 26). Drives the REAL account-health worker (and the profit worker for one goal route) in node against an
 * in-memory SQLite. Stripe, Slack, the Ledger and everything else are mocked; MAIL_DRY is set, so no mail leaves:
 * every message lands on mail.js `outbox`, and the last check proves the mocked fetch never saw Gmail or Resend.
 * Sample world only (Northlake Golf, @example.com).
 *   node --import "file:///.../stubwasm.mjs" test-onboarding.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');

/* ---------------- database (same shim as test-clients.mjs) ---------------- */
const mkDb = () => {
  const db = new DatabaseSync(':memory:');
  const bindSql = sql => { let hi = 0; return sql.replace(/\?(\d*)/g, (_, n) => { if (n) { hi = Math.max(hi, +n); return ':p' + n; } hi++; return ':p' + hi; }); };
  const vals = (a, sql) => { const used = new Set([...bindSql(sql).matchAll(/:p(\d+)/g)].map(m => 'p' + m[1])); return Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]).filter(([k]) => used.has(k))); };
  const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args, sql)) || null; }, async all() { return { results: st().all(vals(args, sql)) }; }, async run() { const r = st().run(vals(args, sql)); return { meta: { changes: r.changes } }; } }; };
  return { db, DB: { prepare: stmt, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } } };
};
const { db, DB } = mkDb();
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied */ } } };
load(path.join(root, 'profit', 'worker', 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'migrations', 'brand-001.sql'));
load(path.join(here, 'schema.sql'));
db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, source) VALUES ('brand_alpha', 'alpha', 'Alpha Golf', 'active', 'USD', 'America/Chicago', 'locus')`);
const setSetting = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, JSON.stringify(v));
const getSetting = k => { const r = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k); return r ? JSON.parse(r.value) : null; };
setSetting('clientUsers', { 'nick@alpha.example.com': { brands: ['brand_alpha'], name: 'Nick' } });
setSetting('newClientTeam', [{ name: 'Sam', email: 'sam@example.com' }, { name: 'Ahsan', email: 'ahsan@go-mobius-digital.com' }, { name: 'Cole', email: 'cole@go-mobius-digital.com' }]);

/* ---------------- tokens ---------------- */
const SECRET = 'test-session-secret';
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const mint = (email, key = SECRET) => { const p = b64u(`${email}|${Date.now() + 3600e3}`); return `mds.${p}.${b64u(crypto.createHmac('sha256', key).update(p).digest())}`; };
const OWNER = mint('cole@go-mobius-digital.com'), TEAM = mint('ahsan@go-mobius-digital.com'), OTHER_CLIENT = mint('nick@alpha.example.com');
const PAT = mint('pat@example.com'), JAMIE = mint('jamie@example.com');

/* ---------------- mocks: Stripe (stateful), Slack, everything else offline ---------------- */
const { outbox } = await import('./src/mail.js');
const log = [];   // every fetch: {u, method, body, idem, mails}
const S = { n: 0, customers: [], invoices: {}, subs: {}, posted: [] };
const sid = p => `${p}_${++S.n}`;
const flat = body => Object.fromEntries(new URLSearchParams(String(body || '')));
function stripeMock(u, init) {
  const url = new URL(u), p = url.pathname.replace(/^\/v1\//, ''), m = init.method || 'GET', b = flat(init.body), q = Object.fromEntries(url.searchParams);
  const ok = j => new Response(JSON.stringify(j), { status: 200 });
  /* A test can run one thing in the middle of a Stripe call (the webhook landing during a "Check if paid"). */
  if (S.hook && m === 'GET' && /^invoices\/in_/.test(p)) { const hk = S.hook; S.hook = null; hk(); }
  if (m === 'GET' && p === 'subscriptions') return ok({ data: Object.values(S.subs).filter(x => x.customer === q.customer) });
  if (m === 'POST' && p === 'webhook_endpoints') return ok({ id: 'we_1', secret: 'whsec_test' });
  if (m === 'POST' && p.startsWith('webhook_endpoints/')) return ok({ id: 'we_1' });
  if (m === 'POST' && p === 'products') return ok({ id: 'prod_1' });
  if (m === 'GET' && p === 'customers/search') { const e = (/email:'([^']+)'/.exec(q.query) || [])[1]; return ok({ data: S.customers.filter(c => c.email === e) }); }
  if (m === 'POST' && p === 'customers') { const c = { id: sid('cus'), email: b.email }; S.customers.push(c); return ok(c); }
  if (m === 'POST' && /^customers\//.test(p)) return ok({ id: p.split('/')[1] });
  if (m === 'GET' && p === 'invoices') {
    let list = Object.values(S.invoices).filter(i => i.customer === q.customer);
    if (q.status) list = list.filter(i => i.status === q.status);
    if (q['created[gte]']) list = list.filter(i => i.created >= +q['created[gte]']);
    return ok({ data: list });
  }
  if (m === 'POST' && p === 'invoices') { const i = { id: sid('in'), status: 'draft', customer: b.customer, amount_due: 0, lines: { data: [] }, created: Math.floor(Date.now() / 1000), metadata: { locus: b['metadata[locus]'], locus_kind: b['metadata[locus_kind]'], locus_v: b['metadata[locus_v]'] } }; S.invoices[i.id] = i; return ok(i); }
  if (m === 'POST' && p === 'invoiceitems') {
    if (S.failItems > 0) { S.failItems--; return new Response(JSON.stringify({ error: { message: 'stripe mock: line refused' } }), { status: 500 }); }
    const i = S.invoices[b.invoice];
    if (i) { i.lines = { data: [...((i.lines && i.lines.data) || []), { amount: +b.amount }] }; i.amount_due = (i.amount_due || 0) + (+b.amount); }
    return ok({ id: sid('ii') });
  }
  let mm;
  if ((mm = /^invoices\/(in_\w+)\/finalize$/.exec(p))) { S.invoices[mm[1]].status = 'open'; return ok(S.invoices[mm[1]]); }
  if ((mm = /^invoices\/(in_\w+)\/send$/.exec(p))) { const i = S.invoices[mm[1]]; i.status = i.status === 'draft' ? 'open' : i.status; i.hosted_invoice_url = `https://invoice.stripe.example/i/${crypto.randomBytes(6).toString("hex")}`; return ok(i); }
  if ((mm = /^invoices\/(in_\w+)\/void$/.exec(p))) { S.invoices[mm[1]].status = 'void'; return ok(S.invoices[mm[1]]); }
  if ((mm = /^invoices\/(in_\w+)$/.exec(p))) { const i = S.invoices[mm[1]]; if (!i) return new Response('{"error":{"message":"no"}}', { status: 404 }); if (m === 'POST') i.auto_advance = b.auto_advance; return ok(i); }
  if (m === 'GET' && /^payment_intents\//.test(p)) return ok({ id: p.split('/')[1], payment_method: 'pm_card_1' });
  if (m === 'POST' && p === 'subscriptions') { const s = { id: sid('sub'), body: b, customer: b.customer, metadata: { locus: b['metadata[locus]'], locus_v: b['metadata[locus_v]'] } }; S.subs[s.id] = s; return ok(s); }
  if ((mm = /^subscriptions\/(sub_\d+)$/.exec(p))) return ok(S.subs[mm[1]] || { id: mm[1], metadata: {} });
  return new Response(JSON.stringify({ error: { message: 'stripe mock: ' + m + ' ' + p } }), { status: 400 });
}
let slackN = 0;
function slackMock(u, init) {
  const method = u.split('/api/')[1].split('?')[0];
  const j = o => new Response(JSON.stringify({ ok: true, ...o }), { status: 200 });
  if (method === 'auth.test') return j({ user_id: 'UBOT', team_id: 'T1' });
  if (method === 'conversations.create') return j({ channel: { id: `C0TEST${String(++slackN).padStart(4, '0')}` } });
  if (method === 'users.lookupByEmail') return j({ user: { id: 'U' + crypto.createHash('md5').update(u).digest('hex').slice(0, 8).toUpperCase() } });
  if (method === 'users.list') return j({ members: [] });
  if (method === 'conversations.members' && S.slackJoin) return j({ members: ['UEXTERNAL1'] });
  if (method === 'users.info' && S.slackJoin) return j({ user: { id: 'UEXTERNAL1', is_bot: false, is_stranger: true, team_id: 'TOTHER' } });
  if (method === 'chat.postMessage') { let bd; try { bd = JSON.parse(String(init.body || '{}')); } catch { bd = { raw: String(init.body || '') }; } S.posted.push(bd); return j({ ts: '1.1', channel: 'C0X' }); }
  return j({ ts: '1.1', channel: 'C0X' });
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url?.url || url);
  const h = init.headers || {};
  log.push({ u, method: init.method || 'GET', body: init.body, idem: h['Idempotency-Key'] || null, mails: outbox.length });
  if (u.startsWith('https://api.stripe.com/')) return stripeMock(u, init);
  if (u.startsWith('https://slack.com/api/')) return slackMock(u, init);
  return new Response(JSON.stringify({ error: 'offline: ' + u }), { status: 503 });
};

const AH = (await import('./src/worker.js')).default;
const PF = (await import('../../profit/worker/src/worker.js')).default;
const ledgerCalls = [];
const ahEnv = { DB, SESSION_SECRET: SECRET, GOOGLE_CLIENT_ID: 'cid', MAIL_DRY: '1', STRIPE_SECRET_KEY: 'sk_test_mock', SLACK_BOT_TOKEN: 'xoxb-test',
  LEDGER: { fetch: async req => { ledgerCalls.push({ url: req.url, body: await req.json() }); return new Response(JSON.stringify({ ok: true }), { status: 200 }); } } };
const ctx = { waitUntil() {} };
const pfEnv = { DB, AUTH: { fetch: req => AH.fetch(req, ahEnv, ctx) } };
ahEnv.PROFIT = { fetch: req => PF.fetch(req, pfEnv, ctx) };
const call = async (worker, tok, method, p, body) => {
  const env = worker === 'ah' ? ahEnv : pfEnv;
  const res = await (worker === 'ah' ? AH : PF).fetch(new Request(`https://${worker}.test${p}`, { method, headers: { ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, ctx);
  let j = null; try { j = await res.json(); } catch {}
  return { status: res.status, j };
};
const ah = (tok, m, p, b) => call('ah', tok, m, p, b), pf = (tok, m, p, b) => call('pf', tok, m, p, b);
const onb = await import('./src/onboard.js');
/* p_notice (the bell) is live in production; here it is made the way automations.js makes it. */
await (await import('./src/automations.js')).ensure({ DB });
const newclient = await import('./src/newclient.js');
const mail = await import('./src/mail.js');

const results = [];
async function check(name, fn) { try { await fn(); results.push(true); console.log('PASS ', name); } catch (e) { results.push(false); console.log('FAIL ', name, '\n      ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n      ')); } }
const count = t => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
const row = act => { const r = db.prepare(`SELECT * FROM p_onboard WHERE act_id = ?`).get(act); return r && { ...r, steps: JSON.parse(r.steps_json), conn: JSON.parse(r.connect_json), rem: JSON.parse(r.reminders_json) }; };
const mailsTo = (to, re) => outbox.filter(m => m.to === to && (!re || re.test(m.subject)));
const noDashes = s => assert.ok(!/[\u2014\u2013]/.test(String(s)), 'no em or en dash: ' + String(s).slice(0, 120));
/* Send and the welcome email both N days ago (day 0 for reminders is the welcome email, not the Send press). */
const backdate = (act, days) => {
  const at = new Date(Date.now() - days * 864e5).toISOString();
  db.prepare(`UPDATE p_onboard SET sent_at = ? WHERE act_id = ?`).run(at, act);
  db.prepare(`UPDATE p_newclient SET steps_json = json_set(steps_json, '$.email.at', ?) WHERE act_id = ? AND json_extract(steps_json, '$.email.status') = 'done'`).run(at, act);
};
const THURSDAY = '2026-11-26';

const FORM = {
  name: 'Northlake Golf', website: 'northlakegolf.example.com', contact_name: 'Pat Doyle', contact_email: 'pat@example.com',
  services: ['meta_ads', 'email'], goal_measure: 'cpa', ad_budget: 15000, budget_open: false, retainer: 4000, start_date: '2026-11-26',
  signer_name: '', signer_email: '', payer_email: '', company_legal: '',
  team: { strategist: 'ahsan@go-mobius-digital.com', buyer: 'sam@example.com', editor: '', designer: '' },
  send: { welcome: true, agreement: true, invoice: true },
};
const ACT = 'brand_northlake_golf';

/* ---------------- the checks ---------------- */
await check('options: the team gets the form (extras on for Mobius, every tick on); a client never does', async () => {
  const r = await ah(TEAM, 'GET', '/api/onboard/options');
  assert.equal(r.status, 200); assert.equal(r.j.extras, true); assert.equal(r.j.owner, false);
  assert.deepEqual(r.j.defaults.send, { welcome: true, agreement: true, invoice: true });
  assert.ok(r.j.team.some(p => p.email === 'sam@example.com'), 'the roster, not Asana');
  assert.equal((await ah(OTHER_CLIENT, 'GET', '/api/onboard/options')).status, 403);
});

await check('preview: names who gets what, writes nothing, sends nothing, no Drive or Asana; a blank in the agreement blocks Send; a taken name is 409', async () => {
  const before = { nc: count('brands'), out: outbox.length, log: log.length };
  const r = await ah(OWNER, 'POST', '/api/onboard/preview', { ...FORM, signer_name: 'Sam Rivera', signer_email: 'sam.rivera@example.com', payer_email: 'billing@example.com' });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.equal(r.j.welcome.to, 'pat@example.com'); assert.match(r.j.welcome.subject, /^Welcome to Mobius Digital, Pat$/);
  assert.ok(r.j.welcome.body.includes('{{sign-in link}}')); noDashes(r.j.welcome.body);
  assert.equal(r.j.agreement.to, 'sam.rivera@example.com'); assert.equal(r.j.agreement.ok_to_send, true); assert.deepEqual(r.j.agreement.blanks, []);
  assert.equal(r.j.invoice.to, 'billing@example.com'); assert.equal(r.j.invoice.amount, 4000);
  assert.ok(!r.j.extras.some(x => /drive|asana/i.test(x)), 'no Drive, no Asana');
  assert.match(r.j.confirm, /Welcome to Pat Doyle\. Agreement to Sam Rivera\. Invoice for \$4,000 to billing@example.com\. Pressing Send signs the agreement for Mobius Digital as Cole Wetzler\./);
  assert.deepEqual(r.j.problems, []);
  assert.equal(count('brands'), before.nc); assert.equal(outbox.length, before.out);
  assert.ok(!log.slice(before.log).some(x => /stripe|slack|asana|googleapis/.test(x.u)), 'no outside call');
  const blank = await ah(OWNER, 'POST', '/api/onboard/preview', { ...FORM, agreement: { vars: { term: '' } } });
  assert.deepEqual(blank.j.agreement.blanks, ['term']); assert.equal(blank.j.agreement.ok_to_send, false); assert.ok(blank.j.problems.length);
  const send = await ah(OWNER, 'POST', '/api/onboard/send', { ...FORM, agreement: { vars: { term: '' } }, confirm: true });
  assert.equal(send.status, 400); assert.equal(count('brands'), before.nc, 'nothing made');
  assert.equal((await ah(OWNER, 'POST', '/api/onboard/preview', { ...FORM, name: 'Alpha Golf' })).status, 409);
  assert.equal((await ah(TEAM, 'POST', '/api/onboard/preview', FORM)).status, 403, 'only the owner');
  assert.equal((await ah(OWNER, 'POST', '/api/onboard/send', FORM)).status, 400, 'no confirm, no send');
});

let sent;
await check('send once: brand, link, checklist, login; welcome first, then the agreement, the first invoice (no subscription), Slack channels, the Slack invite AFTER the welcome, Ledger; no Drive, no Asana', async () => {
  const from = log.length, out0 = outbox.length;
  const r = await ah(OWNER, 'POST', '/api/onboard/send', { ...FORM, confirm: true });
  assert.equal(r.status, 200, JSON.stringify(r.j)); sent = r.j;
  assert.equal(r.j.act, ACT); assert.equal(r.j.slug, 'northlake-golf');
  assert.match(r.j.invite_link, /\/profit\/v5\/\?invite=[0-9a-f]{32}$/);
  for (const k of ['link', 'welcome', 'agreement', 'invoice', 'slack', 'slackInvite', 'ledger', 'summary']) assert.equal(r.j.results[k].status, 'done', `${k}: ${r.j.results[k].text}`);
  const run = db.prepare(`SELECT * FROM p_newclient WHERE act_id = ?`).get(ACT);
  const st = JSON.parse(run.steps_json);
  assert.equal(st.v, 2); assert.deepEqual(st.services, ['meta_ads', 'email']);
  assert.ok(!run.asana_project && !run.drive_url, 'no Asana project, no Drive folder');
  const calls = log.slice(from);
  assert.ok(!calls.some(c => /asana\.com|googleapis\.com\/drive/.test(c.u)), 'no Asana or Drive call');
  const p = row(ACT);
  assert.ok(p && p.sent_at && p.extras === 1 && p.sign_pay === 1 && p.uses_invoice === 1); assert.equal(p.ad_budget, 15000);
  assert.equal(p.steps.connect.holder, 'pat@example.com');
  assert.equal(db.prepare(`SELECT monthly_budget FROM brands WHERE id = ?`).get(ACT).monthly_budget, 15000);
  const users = getSetting('clientUsers'); assert.deepEqual(users['pat@example.com'].brands, [ACT]); assert.ok(users['pat@example.com'].last_invite);
  const mails = outbox.slice(out0);
  assert.equal(mails[0].to, 'pat@example.com'); assert.match(mails[0].subject, /^Welcome to Mobius Digital, Pat$/);
  assert.ok(mails[0].text.includes(r.j.invite_link), 'the invite link in the welcome'); assert.ok(!mails[0].text.includes('{{sign-in link}}')); noDashes(mails[0].text);
  assert.ok(mails.some(m => /agreement/i.test(m.subject) && m.to === 'pat@example.com'), 'the agreement from Cole\'s Gmail');
  /* Stripe: the guards, then the one off invoice, finalized and sent. Never a subscription before it is paid. */
  const stripePaths = calls.filter(c => c.u.startsWith('https://api.stripe.com/')).map(c => `${c.method} ${new URL(c.u).pathname.replace('/v1/', '')}${new URL(c.u).searchParams.get('status') ? '?status' : new URL(c.u).search.includes('created') ? '?created' : ''}`);
  const want = ['GET customers/search', 'POST customers', 'GET invoices?status', 'GET invoices?created', 'POST invoices', 'POST invoiceitems'];
  assert.equal(S.invoices[st.stripe.invoice].amount_due, 400000, 'the line is on the invoice');
  let at = 0; for (const w of want) { const i = stripePaths.indexOf(w, at); assert.ok(i >= at, `${w} in order: ${stripePaths.join(' | ')}`); at = i; }
  assert.ok(stripePaths.some(x => /finalize$/.test(x)) && stripePaths.some(x => /send$/.test(x)));
  assert.ok(!stripePaths.some(x => /subscriptions/.test(x)), 'no subscription yet');
  assert.equal(calls.find(c => /\/v1\/invoices$/.test(c.u) && c.method === 'POST').idem, `locus-first-${run.id}`);
  const inv = S.invoices[st.stripe.invoice]; assert.equal(inv.metadata.locus_kind, 'first'); assert.equal(inv.metadata.locus_v, '2'); assert.equal(inv.status, 'open');
  /* Slack: the channels, then the Slack Connect invite only once the welcome was in the outbox. */
  const shared = calls.find(c => c.u.includes('conversations.inviteShared'));
  assert.ok(shared && shared.mails > out0, 'the Slack invite went after the welcome email');
  assert.ok(calls.findIndex(c => c.u.includes('conversations.create')) < calls.indexOf(shared));
  assert.equal(ledgerCalls.length, 1); assert.deepEqual(ledgerCalls[0].body, { name: 'Northlake Golf', retainer: 4000, active: true, billing: 'retainer' });
  /* A second press with the same name is refused. */
  assert.equal((await ah(OWNER, 'POST', '/api/onboard/send', { ...FORM, confirm: true })).status, 409);
});

await check('ticks are honoured: agreement and invoice unticked = nothing goes to Stripe and no agreement mail; send-part sends one later', async () => {
  const from = log.length, out0 = outbox.length;
  const r = await ah(OWNER, 'POST', '/api/onboard/send', { ...FORM, name: 'Harbor Putters', contact_email: 'lee@harbor.example.com', contact_name: 'Lee Park', send: { welcome: true, agreement: false, invoice: false }, confirm: true });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.equal(r.j.results.agreement.status, 'skipped'); assert.equal(r.j.results.invoice.status, 'skipped');
  assert.ok(!log.slice(from).some(c => c.u.startsWith('https://api.stripe.com/')), 'no Stripe call');
  assert.ok(!outbox.slice(out0).some(m => /agreement/i.test(m.subject)), 'no agreement mail');
  assert.equal((await ah(TEAM, 'POST', '/api/onboard/send-part', { act: r.j.act, part: 'agreement', confirm: true })).status, 403, 'owner only');
  const part = await ah(OWNER, 'POST', '/api/onboard/send-part', { act: r.j.act, part: 'agreement', confirm: true });
  assert.equal(part.status, 200, JSON.stringify(part.j)); assert.equal(part.j.result.status, 'done');
  assert.ok(outbox.slice(out0).some(m => m.to === 'lee@harbor.example.com' && /agreement/i.test(m.subject)));
});

await check('the gate rides on /api/me: a new client is held on Get started; a short profile; the welcome cards flag', async () => {
  const me = await ah(PAT, 'GET', '/api/me');
  assert.equal(me.status, 200); assert.equal(me.j.role, 'client');
  const o = me.j.client.onboarding;
  assert.equal(o.gated, true); assert.equal(o.brand, ACT); assert.equal(o.slug, 'northlake-golf'); assert.deepEqual(o.left, ['sign_pay', 'connect', 'brief', 'assets']); assert.equal(o.total, 4); assert.equal(o.only, null);
  assert.equal(me.j.client.profile_done, false); assert.equal(me.j.client.welcome_seen, false);
  assert.equal((await ah(PAT, 'PUT', '/api/clients/me', { phone: 'call me' })).status, 400, 'a phone is digits');
  const p = await ah(PAT, 'PUT', '/api/clients/me', { name: 'Pat Doyle', title: 'Founder', phone: '+1 (555) 010-0000', welcome_seen: true });
  assert.equal(p.status, 200); assert.equal(p.j.title, 'Founder'); assert.equal(p.j.welcome_seen, true);
  const me2 = await ah(PAT, 'GET', '/api/me');
  assert.equal(me2.j.client.profile_done, true); assert.equal(me2.j.client.title, 'Founder'); assert.equal(me2.j.client.welcome_seen, true);
  /* A brand with no checklist (every existing client) is never gated; the team never is. */
  const nick = await ah(OTHER_CLIENT, 'GET', '/api/me'); assert.equal(nick.j.client.onboarding, null);
  assert.equal((await ah(TEAM, 'GET', '/api/me')).j.client, undefined);
  /* Gated per brand: a client whose running brand has no checklist keeps it while the new brand is set up. */
  const u = getSetting('clientUsers'); u['pat@example.com'].brands = [ACT, 'brand_alpha']; setSetting('clientUsers', u);
  const two = (await ah(PAT, 'GET', '/api/me')).j.client.onboarding;
  assert.equal(two.gated, true); assert.deepEqual(two.gated_slugs, ['northlake-golf']); assert.equal(two.all_gated, false, 'Alpha Golf stays open');
  /* The screens' rule (profit/v5/gate.js, used by router.js normalise): only the held brand goes to Get started. */
  const gate = await import('../../profit/v5/gate.js');
  const st = { role: 'client', asClient: false, me: { client: { onboarding: two } } };
  const g = gate.gateOf(st);
  assert.equal(gate.gateRoute({ view: 'brand', brand: 'alpha', line: 'home', tab: 'index' }, g).line, 'home', 'the running brand opens');
  assert.equal(gate.gateRoute({ view: 'brand', brand: 'northlake-golf', line: 'home', tab: 'index' }, g).line, 'get-started', 'the new brand is held');
  assert.equal(gate.gateRoute({ view: 'brand', brand: 'northlake-golf', line: 'profile', tab: 'index' }, g).line, 'profile', 'the profile is always open');
  assert.equal(gate.heldHere(st, { view: 'brand', brand: 'alpha' }), false); assert.equal(gate.heldHere(st, { view: 'brand', brand: 'northlake-golf' }), true);
  assert.equal(gate.gateOf({ ...st, asClient: true }), null, 'See as client is never gated');
  const u2 = getSetting('clientUsers'); u2['pat@example.com'].brands = [ACT]; setSetting('clientUsers', u2);
  assert.equal((await ah(PAT, 'GET', '/api/me')).j.client.onboarding.all_gated, true);
});

/* The server's own hold (brandguard.js heldBrands, 2026-11-26): the same answer as /api/me, on every route. */
const isHeld = r => r.status === 403 && !!r.j && r.j.gated === true && r.j.error === 'Finish setting up first.';
const isOpen = r => r.status !== 401 && r.status !== 403;
await check('the server holds a gated client: brand data refused on both workers (403 gated), every Get started route open, old clients and the team never held, two brands held on the new one only', async () => {
  assert.deepEqual((await ah(PAT, 'GET', '/api/me')).j.client.onboarding.gated_brands, [ACT]);
  /* Data routes for the held brand: refused, on account-health and on the profit worker, with or without a brand named. */
  const data = [['ah', `/api/production?act=${ACT}`], ['ah', `/api/meta/live?act=${ACT}`], ['ah', `/api/daycheck/now?act=${ACT}`],
    ['pf', `/api/hub/live?act=${ACT}`], ['pf', `/api/client?act=${ACT}&days=30`], ['pf', `/api/costs?act=${ACT}`], ['pf', '/api/overview?days=30&series=0'], ['ah', '/api/metaday?days=30']];
  const leaked = [];
  for (const [w, p] of data) { const r = await call(w, PAT, 'GET', p); if (!isHeld(r)) leaked.push(`${w} ${p} -> ${r.status} ${JSON.stringify(r.j).slice(0, 80)}`); }
  assert.deepEqual(leaked, [], 'not held:\n' + leaked.join('\n'));
  assert.ok(isHeld(await ah(PAT, 'PUT', `/api/accounts/${ACT}`, { target_roas: 9 })), 'a write to the held brand');
  assert.ok(isHeld(await pf(PAT, 'PUT', '/api/goals', { act: ACT, sales: 1 })), 'a write on the profit worker');
  assert.ok(isHeld(await ah(PAT, 'GET', `/api/production?act_id=${ACT}`)), 'act_id alone');
  /* Every route Get started, the profile, the welcome cards and the bell call stays open. */
  const setup = [['GET', '/api/me'], ['GET', '/api/clients/me'], ['GET', `/api/onboard?act=${ACT}`], ['GET', `/api/brand/assets-link?act=${ACT}`], ['GET', '/api/notices'],
    ['GET', '/api/brands'], ['GET', `/api/requests?act=${ACT}`], ['GET', '/api/me/prefs'], ['GET', '/api/me/delivery']];
  const shut = [];
  for (const [m, p] of setup) { const r = await ah(PAT, m, p); if (!isOpen(r)) shut.push(`${m} ${p} -> ${r.status} ${JSON.stringify(r.j).slice(0, 80)}`); }
  const writes = [['PUT', '/api/clients/me', { welcome_seen: true }], ['POST', '/api/requests', { act: ACT, kind: 'request', title: 'Locus feedback', text: 'Hello from setup' }],
    ['PUT', '/api/me/prefs', { morning_dm: false }], ['PUT', '/api/onboard/connect', { act: ACT, platform: 'email', skip: false }],
    /* Bodies that change nothing (a bad value, an unknown id): only "is it let through" is checked here. */
    ['POST', '/api/requests/reply', { id: 'req_nope', text: 'hi' }], ['PUT', '/api/me/delivery', { delivery: 'nope' }], ['POST', '/api/notices/done', { id: 'nt_nope' }],
    ['PUT', '/api/brand/assets-link', { act: ACT, url: 'javascript:alert(1)' }], ['PUT', '/api/onboard/brief', { act: ACT, answers: { password: 'x' } }],
    ['POST', '/api/onboard/handoff', { act: ACT, step: 'nope' }]];
  for (const [m, p, b] of writes) { const r = await ah(PAT, m, p, b); if (isHeld(r) || r.status === 401) shut.push(`${m} ${p} -> ${r.status} ${JSON.stringify(r.j).slice(0, 80)}`); }
  assert.deepEqual(shut, [], 'held on a setup route:\n' + shut.join('\n'));
  /* Every other exact route a client may call is held, on both workers (a probe over CLIENT_RULES). */
  const bg = await import('./src/brandguard.js');
  const answered = [];
  for (const r of bg.CLIENT_RULES) {
    if (!r.p || r.hq || r.onb || bg.SETUP_MAY.has(r.m + ' ' + r.p)) continue;
    for (const w of ['ah', 'pf']) {
      const res = await call(w, PAT, r.m, r.p, r.m === 'GET' || r.m === 'HEAD' ? undefined : {});
      if (!isHeld(res)) answered.push(`${w} ${r.m} ${r.p} -> ${res.status} ${JSON.stringify(res.j).slice(0, 60)}`);
    }
  }
  assert.deepEqual(answered, [], 'a non setup route answered a held client: ' + answered.join(' | '));
  /* The sign in routes carry no session and never meet the hold. */
  assert.ok(!isHeld(await ah(null, 'POST', '/api/clients/code', { invite: 'nope' })));
  /* Old clients (no checklist) and the team are never held, on the same routes. */
  for (const [w, p] of [['ah', '/api/production?act=brand_alpha'], ['pf', '/api/hub/live?act=brand_alpha'], ['pf', '/api/costs?act=brand_alpha']]) {
    const r = await call(w, OTHER_CLIENT, 'GET', p); assert.ok(isOpen(r), `old client ${w} ${p} -> ${r.status}`);
  }
  for (const tok of [TEAM, OWNER]) for (const [w, p] of [['ah', `/api/production?act=${ACT}`], ['pf', `/api/hub/live?act=${ACT}`]]) {
    const r = await call(w, tok, 'GET', p); assert.ok(isOpen(r), `team ${w} ${p} -> ${r.status}`);
  }
  /* Two brands: the running one opens, the held one is refused, and a read with no brand leaves the held one out. */
  const u = getSetting('clientUsers'); u['pat@example.com'].brands = [ACT, 'brand_alpha']; setSetting('clientUsers', u);
  try {
    assert.ok(isOpen(await pf(PAT, 'GET', '/api/hub/live?act=brand_alpha')), 'the running brand opens');
    assert.ok(isOpen(await ah(PAT, 'GET', '/api/production?act=brand_alpha')));
    assert.ok(isHeld(await pf(PAT, 'GET', `/api/hub/live?act=${ACT}`)), 'the new brand is held');
    assert.ok(isHeld(await ah(PAT, 'GET', `/api/production?act=brand_alpha&act=${ACT}`)), 'a second copy of the brand');
    assert.ok(isHeld(await ah(PAT, 'POST', '/api/production/comment', { act: ACT, id: 'x', text: 'hi' })), 'a body brand');
    const all = await pf(PAT, 'GET', '/api/overview?days=30&series=0');
    assert.ok(isOpen(all), `no brand named -> ${all.status}`); assert.ok(!JSON.stringify(all.j).includes(ACT), 'the held brand is left out of an answer');
    assert.ok(isOpen(await ah(PAT, 'GET', `/api/onboard?act=${ACT}`)), 'Get started of the held brand still opens');
    /* The morning line (no brand on the route, plain strings): only the running brand's line, read and sent as a DM.
       The Connect your AI scope and the morning DM's sender (openIdsFor) leave the held brand out too. */
    const realPf = ahEnv.PROFIT.fetch;
    ahEnv.PROFIT.fetch = async req => new URL(req.url).pathname === '/api/hub/kept'
      ? new Response(JSON.stringify({ date: '2026-11-25', brands: [{ act_id: ACT, name: 'Northlake Golf', has: true, line: 'Northlake Golf kept $1 yesterday.' }, { act_id: 'brand_alpha', name: 'Alpha Golf', has: true, line: 'Alpha Golf kept $2 yesterday.' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : realPf(req);
    try {
      const mg = await ah(PAT, 'GET', '/api/me/morning');
      assert.equal(mg.status, 200, JSON.stringify(mg.j)); assert.deepEqual(mg.j.lines, ['Alpha Golf kept $2 yesterday.'], 'the line of the held brand is left out');
      const n0 = S.posted.length;
      const mp = await ah(PAT, 'POST', '/api/me/morning');
      assert.equal(mp.status, 200, JSON.stringify(mp.j)); assert.deepEqual(mp.j.lines, ['Alpha Golf kept $2 yesterday.']);
      assert.ok(S.posted.slice(n0).length && !JSON.stringify(S.posted.slice(n0)).includes('Northlake'), 'the DM names no held brand');
      const open = await bg.openIdsFor(ahEnv, 'pat@example.com');
      assert.ok(open.has('brand_alpha') && !open.has(ACT), 'openIdsFor: the running brand only');
    } finally { ahEnv.PROFIT.fetch = realPf; }
  } finally { const u2 = getSetting('clientUsers'); u2['pat@example.com'].brands = [ACT]; setSetting('clientUsers', u2); }
  assert.ok(isHeld(await ah(PAT, 'GET', '/api/me/morning')), 'one brand, held: the morning line is refused');
});

await check('the emailed 6 digit code: hashed, 10 minutes, 5 tries, one use, one send a minute', async () => {
  const users = getSetting('clientUsers');
  const invite = users['pat@example.com'].invite.token;
  const out0 = outbox.length;
  const a = await ah(null, 'POST', '/api/clients/code', { invite });
  assert.equal(a.status, 200); assert.equal(a.j.ok, true); assert.match(a.j.to, /^pa\*+@example\.com$/);
  const m = outbox.slice(out0).find(x => x.subject === 'Your Locus code'); assert.ok(m, 'the code mail'); assert.equal(m.via, 'gmail', 'no Resend key = Cole\'s Gmail');
  const code = (/(\d{3}) (\d{3})/.exec(m.text) || []).slice(1).join('');
  const stored = getSetting(`code:${invite}`);
  assert.match(stored.h, /^[0-9a-f]{64}$/); assert.ok(!JSON.stringify(stored).includes(code), 'the code itself is never stored');
  assert.ok(stored.exp - Date.now() > 9 * 60e3 && stored.exp - Date.now() <= 10 * 60e3);
  const again = await ah(null, 'POST', '/api/clients/code', { invite });
  assert.equal(again.j.wait, true); assert.equal(outbox.filter(x => x.subject === 'Your Locus code').length, 1, 'one send a minute');
  const wrong = code === '000000' ? '111111' : '000000';
  const w1 = await ah(null, 'POST', '/api/clients/code/verify', { invite, code: wrong });
  assert.equal(w1.status, 400); assert.equal(w1.j.error, 'That code is not right. 4 tries left.');
  for (let i = 0; i < 3; i++) await ah(null, 'POST', '/api/clients/code/verify', { invite, code: wrong });
  const w5 = await ah(null, 'POST', '/api/clients/code/verify', { invite, code: wrong });
  assert.equal(w5.j.error, 'That code ran out. Ask for a new one.');
  const spent = getSetting(`code:${invite}`);
  assert.equal(spent.h, undefined, 'the hash is gone after 5 wrong'); assert.equal(spent.sends.length, 1, 'the send limits survive the drop');
  assert.equal((await ah(null, 'POST', '/api/clients/code/verify', { invite, code })).status, 400, 'the old code is dead too');
  /* Spending a code never resets the send limits: still one a minute. */
  assert.equal((await ah(null, 'POST', '/api/clients/code', { invite })).j.wait, true, 'five wrong guesses do not reset the minute');
  assert.equal(outbox.filter(x => x.subject === 'Your Locus code').length, 1);
  setSetting(`code:${invite}`, { ...getSetting(`code:${invite}`), sent_at: Date.now() - 61e3 });
  /* A new code, the right one: a session, and the invite is used up. */
  await ah(null, 'POST', '/api/clients/code', { invite });
  assert.equal(getSetting(`code:${invite}`).sends.length, 2, 'this hour now has two sends');
  const m2 = outbox.filter(x => x.subject === 'Your Locus code').pop();
  const code2 = (/(\d{3}) (\d{3})/.exec(m2.text) || []).slice(1).join('');
  const ok = await ah(null, 'POST', '/api/clients/code/verify', { invite, code: code2 });
  assert.equal(ok.status, 200, JSON.stringify(ok.j)); assert.equal(ok.j.role, 'client'); assert.equal(ok.j.email, 'pat@example.com'); assert.match(ok.j.token, /^mds\./);
  assert.equal(getSetting('clientUsers')['pat@example.com'].invite, undefined, 'one use'); assert.ok(getSetting('clientUsers')['pat@example.com'].last_sign_in);
  assert.equal((await ah(null, 'POST', '/api/clients/code/verify', { invite, code: code2 })).status, 400);
  /* An expired code. */
  await ah(OWNER, 'POST', '/api/clients/link', { email: 'pat@example.com' });
  const inv2 = getSetting('clientUsers')['pat@example.com'].invite.token;
  setSetting(`code:${inv2}`, { h: 'x', exp: Date.now() - 1, tries: 0, sent_at: 0, sends: [] });
  assert.equal((await ah(null, 'POST', '/api/clients/code/verify', { invite: inv2, code: '123456' })).j.error, 'That code ran out. Ask for a new one.');
  assert.equal((await ah(null, 'POST', '/api/clients/code', { invite: 'f'.repeat(32) })).status, 400, 'a dead invite');
});

await check('the client writes its own brand: brief (ten questions per services), assets link, connect; another brand refused', async () => {
  const st = await ah(PAT, 'GET', `/api/onboard?act=${ACT}`);
  assert.equal(st.status, 200, JSON.stringify(st.j));
  assert.equal(st.j.viewer, 'client'); assert.equal(st.j.team, undefined, 'no team block for a client');
  assert.equal(st.j.brief.total, 10, 'Meta ads ticked, the client approves ads: 10 questions shown');
  assert.equal(st.j.brief.questions.find(q => q.key === 'goal_answer').text, 'What cost per sale would you be happy with?');
  assert.ok(!/\b(in|cus|sub|pi)_[a-z0-9]/i.test(JSON.stringify(st.j)), 'no Stripe ids for the client');
  const b = await ah(PAT, 'PUT', '/api/onboard/brief', { act: ACT, answers: { solves: 'Putters that fix the yips.', goal_answer: '$40 a sale', tried_failed: '__unsure' } });
  assert.equal(b.status, 200, JSON.stringify(b.j)); assert.equal(b.j.brief.answered, 3); assert.deepEqual(b.j.brief.unsure, ['tried_failed']);
  assert.equal((await ah(PAT, 'PUT', '/api/onboard/brief', { act: ACT, answers: { password: 'x' } })).status, 400, 'unknown key');
  assert.equal((await ah(PAT, 'PUT', '/api/onboard/brief', { act: 'brand_alpha', answers: { solves: 'x' } })).status, 403, 'another brand');
  assert.equal((await ah(OTHER_CLIENT, 'GET', `/api/onboard?act=${ACT}`)).status, 403, 'another client');
  const a = await ah(PAT, 'PUT', '/api/brand/assets-link', { act: ACT, url: 'https://drive.google.com/drive/folders/abc', label: 'Shoots' });
  assert.equal(a.status, 200); assert.equal(a.j.kind, 'drive');
  assert.equal((await ah(PAT, 'PUT', '/api/brand/assets-link', { act: ACT, url: 'javascript:alert(1)' })).status, 400);
  const g = await ah(PAT, 'GET', `/api/brand/assets-link?act=${ACT}`); assert.equal(g.j.from, 'link'); assert.equal(g.j.label, 'Shoots');
  /* Connect: Shopify gives the store address and code (team waiting), TikTok "we don't use this", the client cannot tick a team layer. */
  assert.equal((await ah(PAT, 'PUT', '/api/onboard/connect', { act: ACT, platform: 'shopify', inputs: { shop_url: 'not a store' } })).status, 400);
  const c = await ah(PAT, 'PUT', '/api/onboard/connect', { act: ACT, platform: 'shopify', inputs: { shop_url: 'https://northlake-golf.myshopify.com/admin', code: '1234' } });
  assert.equal(c.status, 200, JSON.stringify(c.j));
  const shop = c.j.connect.platforms.find(x => x.key === 'shopify');
  assert.equal(shop.layers.team.state, 'waiting'); assert.equal(shop.layers.team.checks_itself, false); assert.match(shop.layers.team.note, /does not let anyone send this request automatically/);
  assert.equal(shop.layers.app.state, 'waiting', 'no install link yet (the app is in Shopify review): nothing for the client to press, so it waits on us');
  assert.equal(shop.layers.app.url, null);
  assert.equal(JSON.parse(db.prepare(`SELECT answers_json FROM p_br_onboard WHERE act_id = ?`).get(ACT).answers_json).shopify_url, 'northlake-golf.myshopify.com');
  assert.ok(!db.prepare(`SELECT 1 FROM connections WHERE brand_id = ? AND kind = 'triple_whale'`).get(ACT), 'a client\'s store is never linked by the client');
  assert.equal((await ah(PAT, 'PUT', '/api/onboard/connect', { act: ACT, platform: 'tiktok', skip: true })).j.connect.platforms.find(x => x.key === 'tiktok').skipped, true);
  assert.equal((await ah(PAT, 'PUT', '/api/onboard/connect', { act: ACT, platform: 'shopify', layer: 'team', ticked: true })).status, 403, 'brandguard: not a field the client may send');
  const meta = await ah(PAT, 'PUT', '/api/onboard/connect', { act: ACT, platform: 'meta', said: true });
  assert.equal(meta.status, 200); assert.equal(meta.j.connect.platforms.find(x => x.key === 'meta').layers.team.state, 'waiting');
  const ga = meta.j.connect.platforms.find(x => x.key === 'meta');
  assert.deepEqual(ga.layers.team.copy[0], ['Our Meta Business ID', '695359915477596']);
  /* The team ticks a layer a person checks. */
  const t = await ah(TEAM, 'PUT', '/api/onboard/connect', { act: ACT, platform: 'shopify', layer: 'team', ticked: true });
  assert.equal(t.status, 200); assert.equal(t.j.connect.platforms.find(x => x.key === 'shopify').layers.team.state, 'done');
  assert.ok(db.prepare(`SELECT 1 FROM connections WHERE brand_id = ? AND kind = 'triple_whale'`).get(ACT), 'the team\'s tick links the store to Triple Whale (extras)');
  /* Shopify collaborator approved and no install link: Shopify holds nothing back on the gate. */
  const sh = c.j.connect && (await ah(PAT, 'GET', `/api/onboard?act=${ACT}`)).j.connect.platforms.find(x => x.key === 'shopify');
  assert.equal(sh.layers.app.state, 'waiting');
  const probe = onb._test.connectState({ extras: 1, services: [], conn: { shopify: { team: { ticked_at: 'x' } } } }, { items: {}, conns: {} }, await onb.agencyAccess(ahEnv), '');
  assert.ok(!probe.todoNames.includes('Shopify'), 'reminders and Remind them never name Shopify');
  assert.equal(probe.platforms.find(x => x.key === 'shopify').layers.app.state, 'waiting');
  const withLink = onb._test.connectState({ extras: 1, services: [], conn: { shopify: { team: { ticked_at: 'x' } } } }, { items: {}, conns: {} }, await onb.agencyAccess(ahEnv), 'https://apps.shopify.example/locus');
  assert.equal(withLink.platforms.find(x => x.key === 'shopify').layers.app.state, 'todo', 'with an install link it is the client\'s to press');
  assert.ok(!(await onb.onboardLines(ahEnv)).some(l => l.kind === 'install_link'), 'no impossible "send the install link" line');
});

await check('connect safety: a client never links a Triple Whale store or a Google Ads account itself; the team confirms; another brand\'s store never wipes this one', async () => {
  const H = 'brand_harbor_putters';
  /* Triple Whale: the client types a store, it only waits; the team's line confirms it and the tick links it. */
  db.prepare(`INSERT INTO connections (id, brand_id, kind, external_id, label, is_primary, status, source) VALUES ('triple_whale:alpha-golf.myshopify.com', 'brand_alpha', 'triple_whale', 'alpha-golf.myshopify.com', 'a', 1, 'connected', 'locus')`).run();
  const LEE = mint('lee@harbor.example.com');
  const tw = await ah(LEE, 'PUT', '/api/onboard/connect', { act: H, platform: 'tw', inputs: { shop_url: 'alpha-golf.myshopify.com' } });
  assert.equal(tw.status, 200, JSON.stringify(tw.j));
  assert.equal(tw.j.connect.platforms.find(x => x.key === 'tw').layers.team.state, 'waiting');
  assert.ok(!db.prepare(`SELECT 1 FROM connections WHERE brand_id = ? AND kind = 'triple_whale'`).get(H), 'not linked by the client');
  assert.ok(!JSON.stringify(tw.j).includes('brand_alpha'), 'nothing about another client');
  const lines = await onb.onboardLines(ahEnv);
  const conf = lines.find(l => l.act === H && l.kind === 'confirm_tw');
  assert.ok(conf, 'Confirm line for the team'); assert.deepEqual(conf.action, { kind: 'tick', platform: 'tw', layer: 'team' });
  /* The team's tick tries the link: another brand's store is refused (the team sees why), and the tick does not land. */
  const bad = await ah(TEAM, 'PUT', '/api/onboard/connect', { act: H, platform: 'tw', layer: 'team', ticked: true });
  assert.equal(bad.status, 400); assert.equal(row(H).conn.tw.team.ticked_at, undefined);
  /* A store already on another brand never wipes this brand's own store (setTripleWhale checks first). */
  db.prepare(`INSERT INTO connections (id, brand_id, kind, external_id, label, is_primary, status, source) VALUES ('triple_whale:harbor.myshopify.com', ?, 'triple_whale', 'harbor.myshopify.com', 'h', 1, 'connected', 'locus')`).run(H);
  const { setTripleWhale } = await import('./src/brands.js');
  await assert.rejects(setTripleWhale(ahEnv, H, 'alpha-golf.myshopify.com'));
  assert.ok(db.prepare(`SELECT 1 FROM connections WHERE brand_id = ? AND external_id = 'harbor.myshopify.com'`).get(H), 'the brand keeps its own store');
  assert.equal((await ah(LEE, 'PUT', '/api/onboard/connect', { act: H, platform: 'tw', inputs: { shop_url: 'other.myshopify.com' } })).status, 409, 'already connected: the client cannot change it');
  /* Google Ads: an ID the Mobius manager already reaches is never requested or linked by a client. */
  onb.useAdsProbe(async () => ['1112223333']);
  const from = log.length;
  const g1 = await ah(LEE, 'PUT', '/api/onboard/connect', { act: H, platform: 'google_ads', inputs: { customer_id: '111-222-3333' } });
  assert.equal(g1.status, 200, JSON.stringify(g1.j));
  assert.ok(!db.prepare(`SELECT 1 FROM connections WHERE brand_id = ? AND kind = 'google_ads'`).get(H), 'not linked');
  assert.ok(!getSetting(`connectPending:${H}`)?.google_ads, 'no pending link that would attach it later');
  assert.ok((await onb.onboardLines(ahEnv)).some(l => l.act === H && l.kind === 'confirm_gads'), 'the team confirms it');
  /* An ID the manager does not reach: one request, once per ID; a repeat sends nothing. */
  let invites = 0;
  const g2 = await ah(LEE, 'PUT', '/api/onboard/connect', { act: H, platform: 'google_ads', inputs: { customer_id: '444-555-6666' } });
  assert.equal(g2.status, 200, JSON.stringify(g2.j));
  invites = log.slice(from).filter(x => /googleads|customerClientLinks/i.test(x.u)).length;
  const pend = getSetting(`connectPending:${H}`);
  assert.equal(pend.google_ads.id, '4445556666', 'a pending link: it attaches only after their Accept');
  const n0 = log.length;
  await ah(LEE, 'PUT', '/api/onboard/connect', { act: H, platform: 'google_ads', inputs: { customer_id: '4445556666' } });
  assert.equal(log.slice(n0).filter(x => /googleads|customerClientLinks/i.test(x.u)).length, 0, 'the same ID never asks twice');
  await ah(LEE, 'PUT', '/api/onboard/connect', { act: H, platform: 'google_ads', inputs: { customer_id: '7778889999' } });
  const cap = await ah(LEE, 'PUT', '/api/onboard/connect', { act: H, platform: 'google_ads', inputs: { customer_id: '1231231234' } });
  assert.equal(cap.status, 429, 'at most 3 IDs a brand');
  /* The team's tick on Google Ads links what the client typed. */
  const tick = await ah(TEAM, 'PUT', '/api/onboard/connect', { act: H, platform: 'google_ads', layer: 'team', ticked: true });
  assert.equal(tick.status, 200, JSON.stringify(tick.j));
  assert.ok(db.prepare(`SELECT 1 FROM connections WHERE brand_id = ? AND kind = 'google_ads'`).get(H));
  onb.useAdsProbe(async () => null);
  void invites;
});

await check('hand off: a colleague gets an onboard_only login and one email; Mobius addresses refused; sign and pay emails nobody until the owner says yes', async () => {
  const out0 = outbox.length;
  assert.equal((await ah(PAT, 'POST', '/api/onboard/handoff', { act: ACT, step: 'brief', email: 'ahsan@go-mobius-digital.com', name: 'Ahsan' })).status, 400);
  const h = await ah(PAT, 'POST', '/api/onboard/handoff', { act: ACT, step: 'brief', email: 'jamie@example.com', name: 'Jamie Fox' });
  assert.equal(h.status, 200, JSON.stringify(h.j)); assert.deepEqual(h.j.holder, { email: 'jamie@example.com', name: 'Jamie Fox' });
  const u = getSetting('clientUsers')['jamie@example.com'];
  assert.deepEqual(u.onboard_only, ['brief']); assert.equal(u.handed_by, 'pat@example.com'); assert.deepEqual(u.brands, [ACT]);
  const m = outbox.slice(out0).find(x => x.to === 'jamie@example.com');
  assert.match(m.subject, /^Pat asked you to help with Northlake Golf's setup$/); assert.match(m.text, /answer ten short questions about Northlake Golf/); assert.match(m.text, /\/profit\/v5\/\?invite=/);
  assert.equal(row(ACT).steps.brief.holder, 'jamie@example.com'); assert.equal(row(ACT).steps.brief.handed, true);
  const j = await ah(JAMIE, 'GET', `/api/onboard?act=${ACT}`);
  assert.equal(j.status, 200); assert.deepEqual(j.j.steps.map(s => s.key), ['brief']); assert.deepEqual(j.j.only, ['brief']);
  assert.equal((await ah(JAMIE, 'GET', `/api/activities?act=${ACT}`)).status, 403, 'only Get started');
  assert.equal((await ah(JAMIE, 'PUT', '/api/onboard/connect', { act: ACT, platform: 'meta', said: true })).status, 403, 'not their step');
  assert.equal((await ah(JAMIE, 'PUT', '/api/onboard/brief', { act: ACT, answers: { uvp: 'Hand made in Ohio.' } })).status, 200, 'their step');
  /* Sign and pay: no email, a pending signer, the owner decides. */
  const out1 = outbox.length;
  const s = await ah(PAT, 'POST', '/api/onboard/handoff', { act: ACT, step: 'sign_pay', email: 'sam.rivera@example.com', name: 'Sam Rivera', role: 'signer' });
  assert.equal(s.status, 200); assert.equal(s.j.pending, true); assert.equal(outbox.length, out1, 'nobody emailed');
  assert.equal((await ah(TEAM, 'POST', '/api/onboard/approve-signer', { act: ACT, yes: true })).status, 403, 'owner only');
  const y = await ah(OWNER, 'POST', '/api/onboard/approve-signer', { act: ACT, yes: true });
  assert.equal(y.status, 200, JSON.stringify(y.j));
  assert.ok(outbox.slice(out1).some(x => x.to === 'sam.rivera@example.com' && /agreement/i.test(x.subject)), 'the same signing link to Sam');
  assert.equal(db.prepare(`SELECT client_email FROM p_contract WHERE token = ?`).get(row(ACT).token).client_email, 'sam.rivera@example.com');
  assert.equal(row(ACT).steps.sign_pay.pending_signer, undefined);
  /* A one-job invite is never merged into a Google account that already has a login for another brand. */
  const { claimInvite } = await import('./src/clients.js');
  const jamieInvite = getSetting('clientUsers')['jamie@example.com'].invite.token;
  const before = JSON.stringify(getSetting('clientUsers'));
  const refused = await claimInvite(ahEnv, jamieInvite, 'nick@alpha.example.com');
  assert.ok(refused && refused.error, 'refused, with a plain reason'); assert.match(refused.error, /Use the email this was sent to/);
  assert.equal(JSON.stringify(getSetting('clientUsers')), before, 'nothing merged, the limit stays');
});

await check('hand off limits: once per address per step in 20 hours, five a day per brand, never a done step or a finished setup; another brand\'s address gets the same answer and an owner line; the old holder loses the step', async () => {
  const H = 'brand_harbor_putters', LEE = mint('lee@harbor.example.com');
  const out0 = outbox.length;
  const a = await ah(LEE, 'POST', '/api/onboard/handoff', { act: H, step: 'brief', email: 'kim@harbor.example.com', name: 'Kim Ito' });
  assert.equal(a.status, 200, JSON.stringify(a.j)); assert.equal(a.j.text, 'We emailed them.');
  assert.equal((await ah(LEE, 'POST', '/api/onboard/handoff', { act: H, step: 'brief', email: 'kim@harbor.example.com', name: 'Kim Ito' })).status, 409, 'not twice in 20 hours');
  /* Another brand's address: the same words back, nothing mailed, no login touched, an owner line. */
  const nickBefore = JSON.stringify(getSetting('clientUsers')['nick@alpha.example.com']);
  const n = await ah(LEE, 'POST', '/api/onboard/handoff', { act: H, step: 'assets', email: 'nick@alpha.example.com', name: 'Nick' });
  assert.equal(n.status, 200); assert.equal(n.j.text, 'We emailed them.'); assert.ok(!/another brand|login/i.test(JSON.stringify(n.j)), 'nothing about other brands');
  assert.equal(JSON.stringify(getSetting('clientUsers')['nick@alpha.example.com']), nickBefore);
  assert.ok(!outbox.slice(out0).some(m => m.to === 'nick@alpha.example.com'));
  assert.ok((await onb.onboardLines(ahEnv)).some(l => l.act === H && l.kind === 'handoff_blocked' && l.to.owner_only), 'the owner decides');
  /* "I'll do it myself": Kim loses the brief, and a login that held nothing else goes. */
  const self = await ah(LEE, 'POST', '/api/onboard/handoff', { act: H, step: 'brief', email: 'lee@harbor.example.com', name: 'Lee Park' });
  assert.equal(self.status, 200, JSON.stringify(self.j));
  assert.equal(getSetting('clientUsers')['kim@harbor.example.com'], undefined, 'the one-job login is gone with its job');
  /* Five mails a day per brand. */
  for (const [i, step] of ['connect', 'brief', 'connect', 'brief'].entries()) {
    const r = await ah(LEE, 'POST', '/api/onboard/handoff', { act: H, step, email: `p${i}@harbor.example.com`, name: 'P ' + i });
    assert.equal(r.status, 200, JSON.stringify(r.j));
  }
  assert.equal((await ah(LEE, 'POST', '/api/onboard/handoff', { act: H, step: 'connect', email: 'p9@harbor.example.com', name: 'P 9' })).status, 429, 'five a day per brand');
  /* A done step, and a finished setup. */
  await ah(LEE, 'PUT', '/api/brand/assets-link', { act: H, url: 'https://drive.google.com/drive/folders/h1' });
  await ah(LEE, 'GET', `/api/onboard?act=${H}`);
  const done = await ah(LEE, 'POST', '/api/onboard/handoff', { act: H, step: 'assets', email: 'q@harbor.example.com', name: 'Q' });
  assert.equal(done.status, 409); assert.match(done.j.error, /That step is done/);
  db.prepare(`UPDATE p_onboard SET finished_at = ? WHERE act_id = ?`).run(new Date().toISOString(), H);
  assert.equal((await ah(LEE, 'POST', '/api/onboard/handoff', { act: H, step: 'brief', email: 'q@harbor.example.com', name: 'Q' })).status, 409, 'finished: nothing left to hand on');
  db.prepare(`UPDATE p_onboard SET finished_at = NULL WHERE act_id = ?`).run(H);
  /* A handed colleague cannot read the assets link of a step they were not handed. */
  const P2 = mint('p2@harbor.example.com');
  assert.deepEqual(getSetting('clientUsers')['p2@harbor.example.com'].onboard_only, ['connect']);
  assert.equal((await ah(P2, 'GET', `/api/brand/assets-link?act=${H}`)).status, 403);
  assert.equal((await ah(P2, 'GET', `/api/onboard?act=${H}`)).status, 200, 'their own step still opens');
  /* Parallel wrong codes: each try is counted in one statement, so a burst cannot get more than five guesses. */
  const lt = getSetting('clientUsers')['lee@harbor.example.com'].invite.token;
  await ah(null, 'POST', '/api/clients/code', { invite: lt });
  const right = (/(\d{3}) (\d{3})/.exec(outbox.filter(m => m.to === 'lee@harbor.example.com' && m.subject === 'Your Locus code').pop().text) || []).slice(1).join('');
  const wrong = right === '000000' ? '111111' : '000000';
  const burst = await Promise.all(Array.from({ length: 8 }, () => ah(null, 'POST', '/api/clients/code/verify', { invite: lt, code: wrong })));
  assert.ok(burst.filter(r => /not right/.test(r.j.error || '')).length <= 4, 'at most four "not right" answers');
  assert.equal((await ah(null, 'POST', '/api/clients/code/verify', { invite: lt, code: right })).status, 400, 'the code is spent after the burst');
});

await check('reminders: day 3 and day 7 once each, to the step holder, never about money or signing; not outside 9 to 5; off switch', async () => {
  const tick = h => onb.onboardTick(ahEnv, { canAfford: () => true, centralHour: () => h, centralDate: () => THURSDAY });
  backdate(ACT, 4);
  const out0 = outbox.length;
  assert.deepEqual((await tick(20)).reminded, [], 'evening: nothing');
  const r1 = await tick(10);
  assert.ok(r1.reminded.some(x => x.act === ACT && x.which === 'd3'), JSON.stringify(r1));
  const mine = outbox.slice(out0).filter(m => /a few minutes left on your setup/.test(m.subject) && /Northlake/.test(m.subject));
  assert.ok(mine.length >= 1);
  assert.ok(mine.some(m => m.to === 'jamie@example.com' && /ten questions/.test(m.text)), 'the handed colleague gets the brief one');
  assert.ok(!mine.some(m => m.to === 'pat@example.com' && /ten questions/.test(m.text)), 'not the main contact');
  for (const m of mine) { assert.ok(!/agreement|invoice|pay/i.test(m.text), 'never money or signing: ' + m.text); noDashes(m.text); }
  assert.ok(row(ACT).rem.d3);
  const n1 = outbox.length; await tick(11); assert.equal(outbox.filter((m, i) => i >= n1 && /Northlake/.test(m.subject)).length, 0, 'day 3 once');
  backdate(ACT, 8);
  const n2 = outbox.length; await tick(10);
  assert.ok(outbox.slice(n2).some(m => /still waiting on a few setup steps/.test(m.subject) && /Northlake/.test(m.subject)), 'day 7');
  const n3 = outbox.length; await tick(10); assert.equal(outbox.slice(n3).filter(m => /Northlake/.test(m.subject)).length, 0, 'day 7 once');
  setSetting('onboardReminders', 'off');
  db.prepare(`UPDATE p_onboard SET reminders_json = '{}' WHERE act_id = ?`).run(ACT);
  const n4 = outbox.length; await tick(10); assert.equal(outbox.length, n4, 'switched off');
  db.prepare(`DELETE FROM settings WHERE key = 'onboardReminders'`).run();
  db.prepare(`UPDATE p_onboard SET reminders_json = '{"d3":"x","d7":"x"}' WHERE act_id = ?`).run(ACT);
});

await check('reminders only reach someone who heard from us: not with the welcome unticked or failed, not after the run is removed, not to a removed login, not on a weekend; day 0 is the welcome', async () => {
  const tick = (h = 10, date = THURSDAY) => onb.onboardTick(ahEnv, { canAfford: () => true, centralHour: () => h, centralDate: () => date });
  const mk = async (name, email, send) => { const r = await ah(OWNER, 'POST', '/api/onboard/send', { ...FORM, name, contact_name: 'Ro Vale', contact_email: email, send, confirm: true }); assert.equal(r.status, 200, JSON.stringify(r.j)); return r.j; };
  const quiet = await mk('Quiet Links', 'ro@quiet.example.com', { welcome: false, agreement: false, invoice: false });
  const failed = await mk('Failed Links', 'ro@failed.example.com', { welcome: true, agreement: false, invoice: false });
  const gone = await mk('Gone Links', 'ro@gone.example.com', { welcome: true, agreement: false, invoice: false });
  const left = await mk('Left Links', 'ro@left.example.com', { welcome: true, agreement: false, invoice: false });
  for (const x of [quiet, failed, gone, left]) backdate(x.act, 4);
  db.prepare(`UPDATE p_onboard SET sent_at = ? WHERE act_id = ?`).run(new Date(Date.now() - 4 * 864e5).toISOString(), quiet.act);
  /* The welcome "failed": its step is not done. */
  db.prepare(`UPDATE p_newclient SET steps_json = json_set(steps_json, '$.email.status', 'failed') WHERE id = ?`).run(failed.run_id);
  /* The login was taken away from this one. */
  const u = getSetting('clientUsers'); delete u['ro@left.example.com']; setSetting('clientUsers', u);
  /* This client was removed. */
  assert.equal((await ah(OWNER, 'POST', '/api/new-client/remove', { id: gone.run_id })).status, 200);
  assert.equal(row(gone.act), undefined, 'the checklist goes with the run');
  /* No lines or Remind them either. */
  const lines = await onb.onboardLines(ahEnv);
  for (const x of [quiet, failed, gone, left]) assert.ok(!lines.some(l => l.act === x.act && l.kind === 'client_waiting'), 'no waiting line for ' + x.act);
  assert.equal((await ah(TEAM, 'POST', '/api/onboard/remind', { act: quiet.act, step: 'connect' })).status, 409, 'no Remind them before the welcome');
  assert.equal((await ah(TEAM, 'POST', '/api/onboard/remind', { act: left.act, step: 'connect' })).status, 409, 'no Remind them to a removed login');
  assert.equal((await ah(TEAM, 'GET', `/api/onboard?act=${quiet.act}`)).j.team.can_remind.connect, false);
  const out0 = outbox.length;
  await tick(10, '2026-11-28');
  assert.equal(outbox.length, out0, 'Saturday: nothing');
  await tick();
  const sent = outbox.slice(out0).map(m => m.to);
  for (const e of ['ro@quiet.example.com', 'ro@failed.example.com', 'ro@gone.example.com', 'ro@left.example.com']) assert.ok(!sent.includes(e), 'no reminder to ' + e);
  assert.ok(!row(quiet.act).rem.d3 && !row(failed.act).rem.d3, 'nothing stamped, so the reminder still comes once the welcome goes');
  /* The welcome goes now: day 0 is today, so no reminder yet even though Send was 4 days ago. */
  const w = await ah(OWNER, 'POST', '/api/onboard/send-part', { act: quiet.act, part: 'welcome', confirm: true });
  assert.equal(w.status, 200, JSON.stringify(w.j));
  const o1 = outbox.length; await tick();
  assert.ok(!outbox.slice(o1).some(m => m.to === 'ro@quiet.example.com' && /setup/.test(m.subject)), 'counted from the welcome');
});

await check('Remind them: the team reminds one step (masked address), not twice in 20 hours; sign and pay is the owner\'s', async () => {
  const r = await ah(TEAM, 'POST', '/api/onboard/remind', { act: ACT, step: 'assets' });
  assert.equal(r.status, 409, 'assets is done (the link is there)');
  const c = await ah(TEAM, 'POST', '/api/onboard/remind', { act: ACT, step: 'connect' });
  assert.equal(c.status, 200, JSON.stringify(c.j)); assert.match(c.j.to, /^pa\*+@example\.com$/);
  const again = await ah(TEAM, 'POST', '/api/onboard/remind', { act: ACT, step: 'connect' });
  assert.equal(again.status, 409); assert.match(again.j.error, /^Reminded \d+ hours? ago$/);
  assert.equal((await ah(TEAM, 'POST', '/api/onboard/remind', { act: ACT, step: 'sign_pay' })).status, 403);
  const from = log.length;
  const sp = await ah(OWNER, 'POST', '/api/onboard/remind', { act: ACT, step: 'sign_pay' });
  assert.equal(sp.status, 200, JSON.stringify(sp.j));
  assert.ok(log.slice(from).some(x => /\/v1\/invoices\/in_\d+\/send$/.test(x.u)), 'Stripe re-sends its own invoice');
  assert.equal(row(ACT).rem.manual.length, 2);
  assert.equal((await ah(PAT, 'POST', '/api/onboard/remind', { act: ACT, step: 'connect' })).status, 403, 'not a client route');
});

await check('team lines on My day: the owner sees every line, the brand\'s team the team lines only, ticked with /api/mywork/done', async () => {
  /* The invoice went out 8 days ago. */
  db.prepare(`UPDATE p_newclient SET steps_json = json_set(steps_json, '$.stripe.sent_at', ?) WHERE act_id = ?`).run(new Date(Date.now() - 8 * 864e5).toISOString(), ACT);
  const o = await ah(OWNER, 'GET', '/api/mywork?who=Cole');
  assert.equal(o.status, 200, JSON.stringify(o.j).slice(0, 300));
  const lines = o.j.items.filter(i => i.source === 'onboard' && i.act_id === ACT);
  const kinds = lines.map(i => i.onboard.kind);
  assert.ok(kinds.includes('client_waiting'), kinds.join(','));
  const conn = lines.find(i => i.onboard.kind === 'client_waiting' && i.onboard.step === 'connect');
  assert.match(conn.text, /^Northlake Golf has not connected .+, 8 days$/); assert.equal(conn.bucket, 'late'); assert.equal(conn.onboard.remind, true);
  assert.equal(conn.link, 'https://locus.go-mobius-digital.com/profit/v5/#/brand/northlake-golf/get-started/index');
  assert.ok(kinds.includes('pay'), 'the invoice line (owner)');
  assert.ok(kinds.includes('goal'), 'the client typed a goal and the brand has none');
  for (const l of lines) noDashes(l.text);
  const t = await ah(TEAM, 'GET', '/api/mywork');
  assert.equal(t.status, 200);
  const tl = t.j.items.filter(i => i.source === 'onboard' && i.act_id === ACT);
  assert.ok(tl.some(i => i.onboard.kind === 'client_waiting'), 'the strategist on the brand sees the waiting lines');
  assert.ok(!tl.some(i => ['pay', 'sign', 'signer', 'invoice_held', 'budget'].includes(i.onboard.kind)), 'money and signing lines are the owner\'s');
  const d = await ah(TEAM, 'PUT', '/api/mywork/done', { key: conn.id });
  assert.equal(d.status, 200, JSON.stringify(d.j));
  assert.equal((await ah(TEAM, 'GET', '/api/mywork')).j.items.find(i => i.id === conn.id).done, true);
  /* The list and one client page. */
  const L = await ah(TEAM, 'GET', '/api/onboard/list');
  const me = L.j.clients.find(c => c.act === ACT);
  assert.match(me.line, /^Not signed\. Not paid\. \d+ of \d+ connected\. Brief \d+ of 10. Assets linked\.$/);
  const page = await ah(TEAM, 'GET', `/api/onboard?act=${ACT}`);
  assert.equal(page.j.viewer, 'team'); assert.equal(page.j.team.contact.email, 'pat@example.com'); assert.ok(page.j.team.lines.length);
});

await check('a client changes its own goals: one activities row with who, a bell note for the owner and the brand\'s team', async () => {
  const a0 = count('activities');
  /* While the brand is held on Get started its goals are not open yet (the server hold); this check is about after. */
  assert.ok(isHeld(await ah(PAT, 'PUT', `/api/accounts/${ACT}`, { target_roas: 2.5, target_cpa: 40 })), 'held first');
  assert.equal(count('activities'), a0, 'nothing written while held');
  db.prepare(`UPDATE p_onboard SET gate = 0 WHERE act_id = ?`).run(ACT);
  try {
  const r = await ah(PAT, 'PUT', `/api/accounts/${ACT}`, { target_roas: 2.5, target_cpa: 40 });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.equal(count('activities'), a0 + 1);
  const act = db.prepare(`SELECT * FROM activities WHERE event_type = 'client_change' ORDER BY event_time DESC LIMIT 1`).get();
  assert.equal(act.actor, 'Pat Doyle (client)'); assert.equal(act.object_id, ACT); assert.equal(act.category, 'goal');
  assert.match(act.summary, /^Pat Doyle changed the goal ROAS to 2\.5, the goal cost to \$40$/); noDashes(act.summary);
  const notes = db.prepare(`SELECT person_id FROM p_notice WHERE brand_id = ? AND title = ?`).all(ACT, act.summary).map(x => x.person_id).sort();
  assert.deepEqual(notes, ['ahsan@go-mobius-digital.com', 'cole@go-mobius-digital.com', 'sam@example.com']);
  /* The profit worker's goal route logs the same way (the shared brandguard.js). */
  const g = await pf(PAT, 'PUT', '/api/goals', { act: ACT, sales: 90000, spend: 15000 });
  assert.ok(g.status < 400, JSON.stringify(g.j));
  assert.equal(count('activities'), a0 + 2);
  assert.equal((await ah(OTHER_CLIENT, 'PUT', `/api/accounts/${ACT}`, { target_roas: 9 })).status, 403, 'never another brand');
  assert.equal(count('activities'), a0 + 2);
  /* A brand with no New client run (every existing client): the bell goes to its team from userBrands too. */
  setSetting('userBrands', { 'jordan@go-mobius-digital.com': ['brand_alpha'], 'other@go-mobius-digital.com': ['brand_zzz'] });
  const n = await ah(OTHER_CLIENT, 'PUT', '/api/accounts/brand_alpha', { target_roas: 3 });
  assert.equal(n.status, 200, JSON.stringify(n.j));
  const who = db.prepare(`SELECT person_id FROM p_notice WHERE brand_id = 'brand_alpha'`).all().map(x => x.person_id).sort();
  assert.deepEqual(who, ['cole@go-mobius-digital.com', 'jordan@go-mobius-digital.com'], 'the buyer on the brand hears, not only the owner');
  const { auditSummary } = await import('./src/brandguard.js');
  assert.equal(auditSummary('Pat Doyle', 'ad rules', { rules: { cr_cut_cpa_x: 2 } }), 'Pat Doyle changed how far over the goal cost an ad set is cut to 2');
  db.prepare(`DELETE FROM settings WHERE key = 'userBrands'`).run();
  } finally { db.prepare(`UPDATE p_onboard SET gate = 1 WHERE act_id = ?`).run(ACT); (await import('./src/brandguard.js')).forgetHeld(); (await import('../../profit/worker/src/brandguard.js')).forgetHeld(); }
});

await check('billing: paid = the billing day (subscription anchored one month on, card saved, made once); a second invoice in a month is held; Send it anyway; no invoice while one is unpaid', async () => {
  const run = db.prepare(`SELECT * FROM p_newclient WHERE act_id = ?`).get(ACT);
  const st = JSON.parse(run.steps_json).stripe;
  const paidAt = Math.floor(Date.UTC(2026, 0, 31, 18) / 1000);   // Jan 31 in Central
  /* Never on a zero or part payment, or another invoice: those start nothing. */
  assert.equal(await newclient.markFirstPaid(ahEnv, run, { ...S.invoices[st.invoice], status: 'paid', amount_paid: 0, status_transitions: { paid_at: paidAt } }), null, 'a $0 "paid" starts nothing');
  assert.equal(await newclient.markFirstPaid(ahEnv, run, { id: 'in_other', status: 'paid', amount_paid: 400000 }), null, 'another invoice starts nothing');
  assert.equal(Object.values(S.subs).length, 0);
  const inv = { ...S.invoices[st.invoice], status: 'paid', amount_paid: 400000, payment_intent: 'pi_1', status_transitions: { paid_at: paidAt } };
  /* Through the signed webhook route. */
  const body = JSON.stringify({ type: 'invoice.paid', data: { object: inv } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', 'whsec_test').update(`${t}.${body}`).digest('hex');
  const hook = await AH.fetch(new Request('https://ah.test/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': `t=${t},v1=${sig}` }, body }), ahEnv, ctx);
  assert.equal(hook.status, 200);
  const subs = Object.values(S.subs);
  assert.equal(subs.length, 1);
  assert.equal(+subs[0].body.billing_cycle_anchor, Date.UTC(2026, 1, 28, 12) / 1000, 'a 31st moves to the last day of February');
  assert.equal(subs[0].body.proration_behavior, 'none'); assert.equal(subs[0].body.collection_method, 'charge_automatically'); assert.equal(subs[0].body.default_payment_method, 'pm_card_1');
  assert.equal(subs[0].body['metadata[locus_v]'], '2');
  assert.ok(log.some(x => x.idem === `locus-sub-${run.id}`));
  const s2 = JSON.parse(db.prepare(`SELECT steps_json FROM p_newclient WHERE id = ?`).get(run.id).steps_json).stripe;
  assert.equal(s2.paid, true); assert.equal(s2.billing_day, 31); assert.equal(s2.autopay, true);
  await newclient.stripeEvent(ahEnv, { type: 'invoice.paid', data: { object: inv } });
  assert.equal(Object.values(S.subs).length, 1, 'idempotent: never a second subscription');
  /* invoice.created on that subscription while another invoice exists this month: held as a draft. */
  S.invoices[st.invoice].status = 'paid'; S.invoices[st.invoice].created = Math.floor(Date.now() / 1000);
  const draft = { id: 'in_held1', status: 'draft', customer: st.customer, subscription: subs[0].id, created: Math.floor(Date.now() / 1000) };
  S.invoices[draft.id] = { ...draft };
  assert.equal(await newclient.stripeEvent(ahEnv, { type: 'invoice.created', data: { object: draft } }), 'held');
  assert.equal(S.invoices.in_held1.auto_advance, 'false');
  const held = JSON.parse(db.prepare(`SELECT steps_json FROM p_newclient WHERE id = ?`).get(run.id).steps_json).stripe.held;
  assert.equal(held.invoice, 'in_held1');
  const o = await ah(OWNER, 'GET', '/api/mywork?who=Cole');
  const hl = o.j.items.find(i => i.source === 'onboard' && i.onboard.kind === 'invoice_held');
  assert.ok(hl, 'the owner line'); assert.equal(hl.text, 'Northlake Golf: next invoice held, there is already an invoice this month');
  /* The hold outlives onboarding: a finished setup still shows it, with the release button, on My day and its page. */
  db.prepare(`UPDATE p_onboard SET finished_at = ? WHERE act_id = ?`).run(new Date().toISOString(), ACT);
  assert.ok((await ah(OWNER, 'GET', '/api/mywork?who=Cole')).j.items.some(i => i.source === 'onboard' && i.onboard.kind === 'invoice_held'), 'still on My day once finished');
  const pg = await ah(OWNER, 'GET', `/api/onboard?act=${ACT}`);
  assert.ok(pg.j.team.lines.some(l => l.kind === 'invoice_held' && l.action && l.action.kind === 'release'), 'Send it anyway on their page');
  db.prepare(`UPDATE p_onboard SET finished_at = NULL WHERE act_id = ?`).run(ACT);
  assert.deepEqual(hl.onboard.action, { kind: 'release', invoice: 'in_held1' });
  assert.equal((await ah(TEAM, 'POST', '/api/onboard/billing', { act: ACT, release: 'in_held1' })).status, 403);
  const rel = await ah(OWNER, 'POST', '/api/onboard/billing', { act: ACT, release: 'in_held1' });
  assert.equal(rel.status, 200, JSON.stringify(rel.j)); assert.equal(S.invoices.in_held1.status, 'open');
  /* An old subscription (no locus_v) is never touched. */
  S.subs.sub_old = { id: 'sub_old', metadata: {} };
  assert.equal(await newclient.stripeEvent(ahEnv, { type: 'invoice.created', data: { object: { id: 'in_x', status: 'draft', customer: st.customer, subscription: 'sub_old' } } }), 'not ours');
  /* No new first invoice while one is unpaid: a client whose customer already has an open invoice. */
  S.customers.push({ id: 'cus_busy', email: 'busy@example.com' });
  S.invoices.in_busy = { id: 'in_busy', status: 'open', customer: 'cus_busy', created: 1 };
  const busy = await ah(OWNER, 'POST', '/api/onboard/send', { ...FORM, name: 'Busy Tees', contact_name: 'Bo Ray', contact_email: 'busy@example.com', confirm: true });
  assert.equal(busy.status, 200);
  assert.equal(busy.j.results.invoice.status, 'failed'); assert.match(busy.j.results.invoice.text, /already an unpaid invoice/);
  assert.equal(Object.values(S.invoices).filter(i => i.customer === 'cus_busy').length, 1, 'nothing new made');
});

await check('first invoice retry: a line that failed is added again before the invoice is sent, so an empty invoice never settles as paid', async () => {
  S.failItems = 1;
  const r = await ah(OWNER, 'POST', '/api/onboard/send', { ...FORM, name: 'Retry Tees', contact_name: 'Ash Lin', contact_email: 'ash@retry.example.com', confirm: true });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.equal(r.j.results.invoice.status, 'failed', 'the line failed');
  const run = db.prepare(`SELECT * FROM p_newclient WHERE act_id = ?`).get(r.j.act);
  const id = JSON.parse(run.steps_json).stripe.invoice;
  assert.equal(S.invoices[id].status, 'draft'); assert.equal(S.invoices[id].amount_due, 0, 'an empty draft is on file');
  const from = log.length;
  const again = await ah(OWNER, 'POST', '/api/onboard/send-part', { act: r.j.act, part: 'invoice', confirm: true });
  assert.equal(again.status, 200, JSON.stringify(again.j)); assert.equal(again.j.result.status, 'done');
  const calls = log.slice(from).filter(c => c.u.startsWith('https://api.stripe.com/')).map(c => `${c.method} ${new URL(c.u).pathname}`);
  const item = calls.findIndex(c => /invoiceitems$/.test(c)), fin = calls.findIndex(c => /finalize$/.test(c));
  assert.ok(item >= 0 && fin > item, 'the line goes on before finalize: ' + calls.join(' | '));
  assert.equal(log.slice(from).find(c => /invoiceitems$/.test(c.u)).idem, `locus-item-${run.id}`, 'the same idempotency key');
  assert.equal(S.invoices[id].amount_due, 400000); assert.equal(S.invoices[id].status, 'open');
});

await check('test mode (mailTestTo): Stripe and the Slack Connect invite never reach the real client', async () => {
  setSetting('mailTestTo', 'qa@example.com');
  const from = log.length;
  const r = await ah(OWNER, 'POST', '/api/onboard/send', { ...FORM, name: 'Test Mode Golf', contact_name: 'Real Person', contact_email: 'real.person@client.example.com', confirm: true });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  const calls = log.slice(from);
  assert.ok(!calls.some(c => /api\.stripe\.com|slack\.com/.test(c.u) && String(c.body || '').includes('real.person')), 'no Stripe or Slack call carries the real address');
  assert.ok(!calls.some(c => c.u.includes('conversations.inviteShared')), 'no Slack Connect invite');
  assert.equal(r.j.results.slackInvite.status, 'skipped'); assert.match(r.j.results.slackInvite.text, /Test mode/);
  assert.ok(S.customers.some(c => c.email === 'qa@example.com'), 'the Stripe customer is the test address');
  db.prepare(`DELETE FROM settings WHERE key = 'mailTestTo'`).run();
});

await check('Resend with no key sends nothing through Resend; a key and a sender move product mail there; the test recipient rewrite', async () => {
  const n = outbox.length;
  await mail.sendProductMail(ahEnv, 'x@example.com', 'Your Locus code', 'Your code is 123 456.');
  assert.equal(outbox[n].via, 'gmail', 'no RESEND_API_KEY = Cole\'s Gmail');
  assert.equal(await mail.productSender({ ...ahEnv, RESEND_API_KEY: 're_test' }), 'gmail', 'a key without mailFrom is not enough');
  setSetting('mailFrom', 'Locus <hello@locus.example.com>');
  await mail.sendProductMail({ ...ahEnv, RESEND_API_KEY: 're_test' }, 'y@example.com', 'Your Locus code', 'x');
  assert.equal(outbox[outbox.length - 1].via, 'resend');
  db.prepare(`DELETE FROM settings WHERE key = 'mailFrom'`).run();
  setSetting('mailTestTo', 'qa@example.com');
  await mail.sendMail(ahEnv, 'pat@example.com', 'Hello', 'Hi');
  const last = outbox[outbox.length - 1];
  assert.equal(last.to, 'qa@example.com'); assert.equal(last.subject, '[test for pat@example.com] Hello');
  db.prepare(`DELETE FROM settings WHERE key = 'mailTestTo'`).run();
});

await check('other agencies (onboardExtras off): only a brand, connect and an invite; no agreement, invoice, brief, Slack or Ledger', async () => {
  setSetting('onboardExtras', 'off');
  const opt = await ah(TEAM, 'GET', '/api/onboard/options');
  assert.equal(opt.j.extras, false); assert.deepEqual(opt.j.defaults.send, { welcome: true, agreement: false, invoice: false });
  assert.equal((await ah(OWNER, 'POST', '/api/onboard/send', { ...FORM, name: 'Other Co', contact_email: 'o@other.example.com', retainer: 100, confirm: true })).status, 403, 'refuses an invoice');
  const l0 = ledgerCalls.length, from = log.length;
  const r = await ah(OWNER, 'POST', '/api/onboard/send', { name: 'Other Co', contact_name: 'Olly Ng', contact_email: 'o@other.example.com', services: ['meta_ads'], send: { welcome: true }, confirm: true });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  for (const k of ['agreement', 'invoice', 'slack', 'ledger']) assert.equal(r.j.results[k].status, 'skipped');
  assert.equal(ledgerCalls.length, l0); assert.ok(!log.slice(from).some(c => /stripe|slack\.com/.test(c.u)));
  const p = row(r.j.act); assert.equal(p.sign_pay, 0); assert.equal(p.extras, 0);
  /* Decision 11: connect only. No brief, no assets link: the gate opens once connect is done. */
  const OLLY = mint('o@other.example.com');
  const st0 = await ah(OLLY, 'GET', `/api/onboard?act=${r.j.act}`);
  assert.deepEqual(st0.j.steps.map(s => s.key), ['connect']); assert.equal(st0.j.brief, null);
  assert.deepEqual((await ah(OLLY, 'GET', '/api/me')).j.client.onboarding.left, ['connect']);
  for (const pl of st0.j.connect.platforms) await ah(OLLY, 'PUT', '/api/onboard/connect', { act: r.j.act, platform: pl.key, skip: true });
  assert.equal((await ah(OLLY, 'GET', `/api/onboard?act=${r.j.act}`)).j.gated, false, 'connect done, nothing else asked');
  assert.equal((await ah(OLLY, 'GET', '/api/me')).j.client.onboarding.gated, false);
  const w = outbox.filter(m => m.to === 'o@other.example.com').pop();
  assert.ok(!/agreement|invoice|Slack|sign and pay/i.test(w.text), w.text);
  db.prepare(`DELETE FROM settings WHERE key = 'onboardExtras'`).run();
});

await check('finish: Mark finished ends the gate; a finished brand has no lines', async () => {
  assert.equal((await ah(PAT, 'POST', '/api/onboard/finish', { act: ACT })).status, 403);
  const f = await ah(TEAM, 'POST', '/api/onboard/finish', { act: ACT });
  assert.equal(f.status, 200);
  assert.equal((await ah(PAT, 'GET', '/api/me')).j.client.onboarding.gated, false);
  /* Finished = the server lets the brand's data through on the next request, on both workers. */
  for (const [w, p] of [['ah', `/api/production?act=${ACT}`], ['pf', `/api/hub/live?act=${ACT}`], ['pf', '/api/overview?days=30&series=0']]) {
    const r = await call(w, PAT, 'GET', p); assert.ok(isOpen(r), `finished ${w} ${p} -> ${r.status} ${JSON.stringify(r.j).slice(0, 80)}`);
  }
  assert.ok(!(await onb.onboardLines(ahEnv)).some(l => l.act === ACT));
  /* A held invoice arriving after setup ended still reaches the owner. */
  const runId = db.prepare(`SELECT id FROM p_newclient WHERE act_id = ?`).get(ACT).id;
  db.prepare(`UPDATE p_newclient SET steps_json = json_set(steps_json, '$.stripe.held', json(?)) WHERE id = ?`).run(JSON.stringify({ invoice: 'in_late', why: 'the last one is not paid', at: new Date().toISOString() }), runId);
  const late = (await onb.onboardLines(ahEnv)).filter(l => l.act === ACT);
  assert.deepEqual(late.map(l => l.kind), ['invoice_held']); assert.ok(late[0].to.owner_only);
  assert.equal((await ah(TEAM, 'POST', '/api/onboard/reopen', { act: ACT })).status, 403, 'reopen is the owner\'s');
});

/* ---------------- recheck 1 (2026-11-26): the fixes after the second review ---------------- */
const NOPAPER = { welcome: true, agreement: false, invoice: false };
const sendOne = async (name, contact_name, contact_email, extra = {}) => {
  const r = await ah(OWNER, 'POST', '/api/onboard/send', { ...FORM, name, contact_name, contact_email, send: NOPAPER, confirm: true, ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  return r.j;
};
const tickAt = () => onb.onboardTick(ahEnv, { canAfford: () => true, centralHour: () => 10, centralDate: () => THURSDAY });

await check('a client who signs up with another Google address: the day 3 reminder, the waiting line and Remind them reach that login; a colleague who did the same loses the step when it is taken back; nothing is stamped while nobody can be mailed', async () => {
  const { claimInvite } = await import('./src/clients.js');
  const j = await sendOne('Claim Links', 'Cam Ode', 'cam@claim.example.com');
  const A = j.act;
  const inv = getSetting('clientUsers')['cam@claim.example.com'].invite.token;
  assert.equal(await claimInvite(ahEnv, inv, 'cam.google@gmail.example.com'), true);
  const u = getSetting('clientUsers');
  assert.equal(u['cam@claim.example.com'], undefined, 'the login moved');
  assert.deepEqual(u['cam.google@gmail.example.com'].claimed_from, ['cam@claim.example.com']);
  assert.equal(row(A).steps.connect.holder, 'cam@claim.example.com', 'the checklist still names the invited address');
  assert.equal(onb.liveLogin(u, 'cam@claim.example.com', A), 'cam.google@gmail.example.com');
  assert.equal(onb.liveLogin(u, 'cam@claim.example.com', 'brand_alpha'), null, 'only for its own brand');
  backdate(A, 4);
  const out0 = outbox.length;
  const t = await tickAt();
  const mine = t.reminded.find(x => x.act === A);
  assert.ok(mine && mine.which === 'd3' && mine.sent === 1, JSON.stringify(t.reminded));
  assert.ok(outbox.slice(out0).some(m => m.to === 'cam.google@gmail.example.com' && /Claim Links/.test(m.subject)), 'the live login gets the reminder');
  assert.ok(row(A).rem.d3);
  assert.ok((await onb.onboardLines(ahEnv)).some(l => l.act === A && l.kind === 'client_waiting' && l.step === 'connect'), 'the team line is there');
  const pg = await ah(TEAM, 'GET', `/api/onboard?act=${A}`);
  assert.equal(pg.j.team.can_remind.connect, true); assert.equal(pg.j.team.contact.signed_in_as, 'cam.google@gmail.example.com');
  const rm = await ah(TEAM, 'POST', '/api/onboard/remind', { act: A, step: 'brief' });
  assert.equal(rm.status, 200, JSON.stringify(rm.j)); assert.match(rm.j.to, /^ca\*+@gmail\.example\.com$/);
  assert.ok(outbox.some(m => m.to === 'cam.google@gmail.example.com' && /a few minutes left/.test(m.subject)));
  /* The colleague claims with another address; the client takes the step back: that live login goes. */
  const CAM = mint('cam.google@gmail.example.com');
  const h = await ah(CAM, 'POST', '/api/onboard/handoff', { act: A, step: 'assets', email: 'dee@claim.example.com', name: 'Dee Ray' });
  assert.equal(h.status, 200, JSON.stringify(h.j));
  assert.equal(await claimInvite(ahEnv, getSetting('clientUsers')['dee@claim.example.com'].invite.token, 'dee.g@other.example.com'), true);
  assert.deepEqual(getSetting('clientUsers')['dee.g@other.example.com'].onboard_only, ['assets']);
  const back = await ah(CAM, 'POST', '/api/onboard/handoff', { act: A, step: 'assets', email: 'cam.google@gmail.example.com', name: 'Cam Ode' });
  assert.equal(back.status, 200, JSON.stringify(back.j));
  assert.equal(getSetting('clientUsers')['dee.g@other.example.com'], undefined, 'the colleague\'s live login lost the step');
  /* A step is open and nobody has a login: no mail, no stamp, so the reminder still goes once someone does. */
  const lost = await sendOne('Lost Links', 'Lou Ng', 'lou@lost.example.com');
  const u2 = getSetting('clientUsers'); delete u2['lou@lost.example.com']; setSetting('clientUsers', u2);
  backdate(lost.act, 4);
  const o1 = outbox.length;
  await tickAt();
  assert.ok(!outbox.slice(o1).some(m => m.to === 'lou@lost.example.com'));
  assert.equal(row(lost.act).rem.d3, undefined, 'not stamped while nobody could be mailed');
});

await check('removing a set-up client takes the brand off its logins: the client and the colleague lose it, a login with another brand keeps that one', async () => {
  const j = await sendOne('Gone Again', 'Gil Ode', 'gil@gone.example.com');
  const A = j.act, GIL = mint('gil@gone.example.com');
  assert.equal((await ah(GIL, 'POST', '/api/onboard/handoff', { act: A, step: 'brief', email: 'hal@gone.example.com', name: 'Hal Ode' })).status, 200);
  const u = getSetting('clientUsers'); u['ivy@gone.example.com'] = { brands: [A, 'brand_alpha'], name: 'Ivy' }; setSetting('clientUsers', u);
  assert.equal((await ah(GIL, 'GET', `/api/onboard?act=${A}`)).status, 200);
  const rm = await ah(OWNER, 'POST', '/api/new-client/remove', { id: j.run_id });
  assert.equal(rm.status, 200, JSON.stringify(rm.j)); assert.equal(rm.j.logins_removed, 3);
  const after = getSetting('clientUsers');
  assert.equal(after['gil@gone.example.com'], undefined); assert.equal(after['hal@gone.example.com'], undefined);
  assert.deepEqual(after['ivy@gone.example.com'].brands, ['brand_alpha']);
  const me = await ah(GIL, 'GET', '/api/me');
  assert.ok(me.status !== 200 || !((me.j.client && me.j.client.brands) || []).some(b => b.id === A), 'the old session has no brand');
  assert.ok([401, 403].includes((await ah(GIL, 'GET', `/api/onboard?act=${A}`)).status), 'the old session is refused');
  assert.ok([401, 403].includes((await ah(GIL, 'GET', `/api/accounts/${A}`)).status), 'the brand is not theirs any more');
});

await check('the old public connect link: for a set-up client a store or Google Ads ID is only kept and the team confirms it; the old form hands out no connect link; the hourly Google request skips them; older clients unchanged', async () => {
  const { connectToken, onboardAdsTick } = await import('./src/connect.js');
  const j = await sendOne('Door Links', 'Dot Ng', 'dot@door.example.com', { send: { welcome: false, agreement: false, invoice: false } });
  const A = j.act;
  const tok = await connectToken(ahEnv, A);
  const tw = await ah(null, 'POST', `/api/connect/${tok}`, { key: 'tw', value: 'someone-else.myshopify.com' });
  assert.equal(tw.status, 200, JSON.stringify(tw.j));
  assert.ok(!db.prepare(`SELECT 1 FROM connections WHERE brand_id = ? AND kind = 'triple_whale'`).get(A), 'not linked from the old page');
  assert.equal(row(A).conn.tw.team.inputs.shop_url, 'someone-else.myshopify.com');
  const from = log.length;
  const ga = await ah(null, 'POST', `/api/connect/${tok}`, { key: 'google_ads', value: '222-333-4444' });
  assert.equal(ga.status, 200, JSON.stringify(ga.j));
  assert.ok(!getSetting(`connectPending:${A}`)?.google_ads, 'no pending link that would attach it later');
  assert.ok(!log.slice(from).some(x => /googleads|customerClientLinks/i.test(x.u)), 'no manager request');
  assert.ok(!db.prepare(`SELECT 1 FROM connections WHERE brand_id = ? AND kind = 'google_ads'`).get(A));
  const lines = (await onb.onboardLines(ahEnv)).filter(l => l.act === A);
  assert.ok(lines.some(l => l.kind === 'confirm_tw'), 'Confirm the store');
  assert.ok(lines.some(l => l.kind === 'confirm_gads' && /old connect link/.test(l.detail)), 'Confirm the Google Ads ID');
  /* The old onboarding form: no connect link for this brand, Locus instead. (Production adds p_br_onboard.name with a
     guarded ALTER the shim never ran.) */
  try { db.exec(`ALTER TABLE p_br_onboard ADD COLUMN name TEXT`); } catch { /* already there */ }
  const ft = db.prepare(`SELECT token FROM p_br_onboard WHERE act_id = ?`).get(A).token;
  const form = await pf(null, 'GET', `/api/onboard/${ft}`);
  assert.equal(form.status, 200, JSON.stringify(form.j)); assert.equal(form.j.links.connect, undefined); assert.match(form.j.links.locus, /\/profit\/v5\/$/);
  /* An older client (no checklist): the old page and form work as they did. */
  db.prepare(`INSERT INTO brands (id, slug, name, status, currency, tz, source) VALUES ('brand_beta', 'beta', 'Beta Golf', 'active', 'USD', 'America/Chicago', 'locus')`).run();
  db.prepare(`INSERT INTO p_br_onboard (act_id, token, answers_json) VALUES ('brand_beta', ?, ?)`).run('b'.repeat(32), JSON.stringify({ gads_id: '555-666-7777' }));
  db.prepare(`UPDATE p_br_onboard SET answers_json = json_set(answers_json, '$.gads_id', '888-999-0000') WHERE act_id = ?`).run(A);
  const asked = [];
  await onboardAdsTick(ahEnv, async (env, id) => { asked.push(id); return {}; });
  assert.ok(asked.includes('5556667777'), 'an older client still gets the request'); assert.ok(!asked.includes('8889990000'), 'a set-up client is skipped');
  const btok = await connectToken(ahEnv, 'brand_beta');
  assert.equal((await ah(null, 'POST', `/api/connect/${btok}`, { key: 'tw', value: 'beta-golf.myshopify.com' })).status, 200);
  assert.ok(db.prepare(`SELECT 1 FROM connections WHERE brand_id = 'brand_beta' AND kind = 'triple_whale'`).get(), 'an older client links as before');
  assert.ok((await pf(null, 'GET', `/api/onboard/${'b'.repeat(32)}`)).j.links.connect, 'the old form still hands out its connect link');
  /* The team's tick is what links the set-up client's ID. */
  const tick = await ah(TEAM, 'PUT', '/api/onboard/connect', { act: A, platform: 'google_ads', layer: 'team', ticked: true });
  assert.equal(tick.status, 200, JSON.stringify(tick.j));
  assert.ok(db.prepare(`SELECT 1 FROM connections WHERE brand_id = ? AND kind = 'google_ads'`).get(A), 'the team\'s tick links it');
});

await check('limits hold under a burst: parallel hand offs mail one per address per step and five a day; parallel code requests send one code; two logins made at the same moment are both kept', async () => {
  const j = await sendOne('Burst Links', 'Bea Ng', 'bea@burst.example.com');
  const A = j.act, BEA = mint('bea@burst.example.com');
  const out0 = outbox.length;
  const same = await Promise.all(Array.from({ length: 4 }, () => ah(BEA, 'POST', '/api/onboard/handoff', { act: A, step: 'brief', email: 'cy@burst.example.com', name: 'Cy Ng' })));
  assert.equal(outbox.slice(out0).filter(m => m.to === 'cy@burst.example.com').length, 1, 'one mail to one address for one step');
  assert.equal(same.filter(x => x.status === 200).length, 1, same.map(x => x.status).join(','));
  const many = await Promise.all(Array.from({ length: 8 }, (_, i) => ah(BEA, 'POST', '/api/onboard/handoff', { act: A, step: i % 2 ? 'connect' : 'assets', email: `m${i}@burst.example.com`, name: 'M ' + i })));
  const mailed = outbox.slice(out0).filter(m => /^m\d@burst\.example\.com$/.test(m.to));
  assert.equal(mailed.length, 4, 'five a day per brand, the burst included');
  assert.equal(many.filter(x => x.status === 429).length, 4, many.map(x => x.status).join(','));
  assert.equal(row(A).rem.handoffs.length, 5);
  /* Codes. */
  const inv = getSetting('clientUsers')['bea@burst.example.com'].invite.token;
  const c0 = outbox.length;
  const codes = await Promise.all(Array.from({ length: 6 }, () => ah(null, 'POST', '/api/clients/code', { invite: inv })));
  assert.equal(outbox.slice(c0).filter(m => m.subject === 'Your Locus code').length, 1, 'one code mail');
  assert.equal(codes.filter(x => x.j && x.j.wait).length, 5);
  assert.equal(getSetting(`code:${inv}`).sends.length, 1);
  /* Two logins made at the same moment (two steps handed in parallel) are both kept. */
  const k = await sendOne('Burst Two', 'Bo Ng', 'bo@bursttwo.example.com');
  const BO = mint('bo@bursttwo.example.com');
  const two = await Promise.all([
    ah(BO, 'POST', '/api/onboard/handoff', { act: k.act, step: 'brief', email: 'q1@bursttwo.example.com', name: 'Q One' }),
    ah(BO, 'POST', '/api/onboard/handoff', { act: k.act, step: 'connect', email: 'q2@bursttwo.example.com', name: 'Q Two' })]);
  assert.deepEqual(two.map(x => x.status), [200, 200]);
  const u = getSetting('clientUsers');
  assert.deepEqual(u['q1@bursttwo.example.com'].onboard_only, ['brief']); assert.deepEqual(u['q2@bursttwo.example.com'].onboard_only, ['connect']);
  assert.ok(u['bo@bursttwo.example.com'], 'the client\'s own login is untouched');
});

await check('billing edges: paid outside Stripe counts, a part payment does not; a subscription this run made is reused; a webhook during Check if paid is kept; another brand on the same Stripe customer never holds this one', async () => {
  const r = await ah(OWNER, 'POST', '/api/onboard/send', { ...FORM, name: 'Wire Tees', contact_name: 'Wes Ng', contact_email: 'wes@wire.example.com', confirm: true });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  const run = db.prepare(`SELECT * FROM p_newclient WHERE act_id = ?`).get(r.j.act);
  const st = JSON.parse(run.steps_json).stripe;
  const now = Math.floor(Date.now() / 1000);
  const base = { ...S.invoices[st.invoice], status: 'paid', amount_paid: 0, total: 400000, status_transitions: { paid_at: now } };
  assert.equal(await newclient.markFirstPaid(ahEnv, run, { ...base, amount_remaining: 150000 }), null, 'part paid starts nothing');
  const n0 = Object.keys(S.subs).length;
  const paid = await newclient.markFirstPaid(ahEnv, run, { ...base, amount_remaining: 0, paid_out_of_band: true });
  assert.ok(paid && paid.subscription && paid.paid, 'a check or a wire marked paid in Stripe counts');
  assert.equal(Object.keys(S.subs).length, n0 + 1);
  /* The id lost from the row (an older copy written over it): Stripe's own is reused, never a second. */
  db.prepare(`UPDATE p_newclient SET steps_json = json_remove(steps_json, '$.stripe.subscription') WHERE id = ?`).run(run.id);
  const again = await newclient.markFirstPaid(ahEnv, run, { ...base, amount_remaining: 0, paid_out_of_band: true });
  assert.equal(again.subscription, paid.subscription); assert.equal(Object.keys(S.subs).length, n0 + 1, 'reused');
  /* The webhook lands while "Check if paid" reads Stripe: what it wrote is kept. */
  const r2 = await ah(OWNER, 'POST', '/api/onboard/send', { ...FORM, name: 'Race Tees', contact_name: 'Ria Ng', contact_email: 'ria@race.example.com', confirm: true });
  const run2 = db.prepare(`SELECT * FROM p_newclient WHERE act_id = ?`).get(r2.j.act);
  S.hook = () => db.prepare(`UPDATE p_newclient SET steps_json = json_set(steps_json, '$.stripe.paid', json('true'), '$.stripe.subscription', 'sub_webhook', '$.stripe.billing_day', 5) WHERE id = ?`).run(run2.id);
  const chk = await newclient.runStep(ahEnv, run2.id, 'stripe', {});
  assert.equal(S.hook, null, 'the webhook ran in the middle');
  const s2 = JSON.parse(db.prepare(`SELECT steps_json FROM p_newclient WHERE id = ?`).get(run2.id).steps_json).stripe;
  assert.equal(s2.subscription, 'sub_webhook'); assert.equal(s2.paid, true); assert.equal(s2.billing_day, 5); assert.equal(chk.status, 'done');
  /* Two brands, one payer email, one Stripe customer. */
  S.subs.sub_9001 = { id: 'sub_9001', customer: 'cus_shared', metadata: { locus: 'run_b', locus_v: '2' } };
  S.invoices.in_a1 = { id: 'in_a1', status: 'paid', customer: 'cus_shared', created: now, subscription: 'sub_9000', metadata: { locus: 'run_a' } };
  const dB = { id: 'in_b1', status: 'draft', customer: 'cus_shared', subscription: 'sub_9001', created: now };
  S.invoices.in_b1 = { ...dB };
  assert.equal(await newclient.stripeEvent(ahEnv, { type: 'invoice.created', data: { object: dB } }), 'fine', 'another brand\'s invoice never holds this one');
  S.invoices.in_b0 = { id: 'in_b0', status: 'paid', customer: 'cus_shared', created: now, metadata: { locus: 'run_b' } };
  assert.equal(await newclient.stripeEvent(ahEnv, { type: 'invoice.created', data: { object: dB } }), 'held', 'its own first invoice this month still holds it');
});

await check('one-job logins and small edges: the team making one full clears the limit (its own brand only); a blocked hand off still takes the step from the colleague; the Slack welcome only asks to sign what there is; the last welcome card says Cole\'s words', async () => {
  const j = await sendOne('Job Links', 'Jo Ng', 'jo@job.example.com', { sign_pay: false });
  const A = j.act, JO = mint('jo@job.example.com');
  assert.equal((await ah(JO, 'POST', '/api/onboard/handoff', { act: A, step: 'brief', email: 'kai@job.example.com', name: 'Kai Ng' })).status, 200);
  assert.deepEqual(getSetting('clientUsers')['kai@job.example.com'].onboard_only, ['brief']);
  const bl = await ah(JO, 'POST', '/api/onboard/handoff', { act: A, step: 'brief', email: 'nick@alpha.example.com', name: 'Nick' });
  assert.equal(bl.status, 200); assert.equal(bl.j.text, 'We emailed them.');
  assert.equal(getSetting('clientUsers')['kai@job.example.com'], undefined, 'the colleague lost the step to the blocked hand off');
  assert.equal(row(A).steps.brief.holder, 'nick@alpha.example.com');
  /* One-job login made full by the team: refused for another brand, cleared for its own. */
  assert.equal((await ah(JO, 'POST', '/api/onboard/handoff', { act: A, step: 'connect', email: 'lin@job.example.com', name: 'Lin Ng' })).status, 200);
  const bad = await ah(OWNER, 'POST', '/api/clients/invite', { emails: ['lin@job.example.com'], brands: ['brand_alpha'] });
  assert.equal(bad.j.failed[0]?.email, 'lin@job.example.com', JSON.stringify(bad.j)); assert.match(bad.j.failed[0].error, /one-job setup login/);
  assert.deepEqual(getSetting('clientUsers')['lin@job.example.com'].onboard_only, ['connect']);
  const good = await ah(OWNER, 'POST', '/api/clients/invite', { emails: ['lin@job.example.com'], brands: [A] });
  assert.equal(good.status, 200, JSON.stringify(good.j));
  assert.equal(getSetting('clientUsers')['lin@job.example.com'].onboard_only, undefined, 'a full login now');
  /* The Slack welcome on join: no sign line when there is nothing to sign; the full line when there is. */
  const welcomeFor = async act => {
    const ch = db.prepare(`SELECT slack_client FROM p_newclient WHERE act_id = ?`).get(act).slack_client;
    assert.ok(ch, 'a client channel');
    S.slackJoin = true; const p0 = S.posted.length;
    try { assert.equal(await newclient.welcomeOnJoinByChannel({ ...ahEnv, SLACK_USER_TOKEN: 'xoxp-test' }, ch), true); } finally { S.slackJoin = false; }
    return S.posted.slice(p0).map(x => x.text || '').find(t => /What happens next/.test(t)) || '';
  };
  const none = await welcomeFor(A);
  assert.match(none, /Finish Get started/); assert.ok(!/Sign the agreement|first invoice/.test(none), none);
  const both = await welcomeFor(ACT);
  assert.match(both, /Sign the agreement and pay the first invoice/);
  noDashes(none); noDashes(both);
  /* The last welcome card (profit/v5), exactly. The page module needs a browser, so its constant is read from source. */
  const src = fs.readFileSync(path.join(root, 'profit', 'v5', 'pages', 'get-started', '_welcome.js'), 'utf8');
  const cfg = fs.readFileSync(path.join(root, 'profit', 'v5', 'config.js'), 'utf8');
  const APP = /export const APP_NAME = '([^']+)'/.exec(cfg)[1], OWN = /export const OWNER_FIRST = '([^']+)'/.exec(cfg)[1];
  const expr = /export const LAST_CARD = ([^\n]+);/.exec(src)[1];
  const text = new Function('APP_NAME', 'OWNER_FIRST', 'return ' + expr)(APP, OWN);
  assert.equal(text, 'Locus is new and we keep building it. Look around. If something is missing, confusing, or you have an idea that would help you, tell Cole. Tap below to message the team, or tell him in Slack.');
  assert.match(src, /p: LAST_CARD, last: true \}/, 'it is the last card');
});

await check('nothing left for real: no Gmail, no Resend, no Google token call in the whole run; every mail is in the outbox', async () => {
  assert.ok(!log.some(x => /gmail\.googleapis\.com|api\.resend\.com|oauth2\.googleapis\.com\/token/.test(x.u)), log.filter(x => /gmail|resend|oauth2/.test(x.u)).map(x => x.u).join(', '));
  assert.ok(outbox.length > 10);
  for (const m of outbox) noDashes(m.subject + ' ' + m.text);
});

globalThis.fetch = realFetch;
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
