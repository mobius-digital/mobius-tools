/* Offline checks for WHO SENDS IT (2026-11-26, src/sender.js): the senders setting (defaults = today's senders),
 * the top switch and the per kind pills, the locked kinds, the email fallback while there is no Locus mailbox,
 * slackPost with opts.kind (stub fetch: which token, whether the app name is added), envFor for the protected
 * standing.js, the buyerDeps wrapper for the protected buyerlist.js, and the v5 page group (a small fake DOM).
 * In-memory SQLite (node:sqlite), Slack stubbed: nothing leaves the machine.
 *   node test-sender.mjs */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SENDER_KINDS, sendersOf, setAll, setKind, resolveSenders, senderFor, senderToken, envFor, slackPostWith, buyerSlackPost, clearSenderCache, postAs } from './src/sender.js';

const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; },
  async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } }; };
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
const getSetting = async (env, k) => (await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(k).first())?.value ?? null;
const putSetting = async (env, k, v) => { await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, v).run(); clearSenderCache(env); };
const mkEnv = (extra = {}) => ({ DB: { prepare: stmt }, SLACK_BOT_TOKEN: 'xoxb-bot', SLACK_USER_TOKEN: 'xoxp-user', ...extra });
const reset = () => db.exec(`DELETE FROM settings`);

let n = 0, bad = 0;
const check = async (name, fn) => { try { await fn(); n++; console.log('PASS ', name); } catch (e) { bad++; console.log('FAIL ', name, '\n   ', String(e.stack || e).split('\n').slice(0, 4).join('\n    ')); } };

/* What each path sends as today (the spec's table): these must stay the defaults. */
const TODAY = { client_checkin: 'cole', client_daily: 'cole', client_report: 'cole', client_update: 'cole', client_recap: 'cole', client_outage: 'locus',
  client_post: 'locus', onboarding_slack: 'cole', onboarding_email: 'cole', login_email: 'cole', internal_alert: 'locus', team_notice: 'locus',
  approval_ask: 'locus', strategist_reply: 'locus', creator_discord: 'locus' };

await check('1. defaults: every client kind but outage and Strategist posts = Cole; alerts, notices, approvals = Locus; = today exactly', async () => {
  reset(); const env = mkEnv();
  const r = resolveSenders(null, env).resolved;
  assert.deepEqual(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.who])), TODAY);
  assert.equal(r.login_email.def, 'locus', 'login_email defaults to Locus on paper');
  assert.equal(r.login_email.fallback, true, '...and falls back to Cole while there is no Locus mailbox');
  for (const k of Object.keys(TODAY)) assert.equal((await senderFor(env, k)).who, TODAY[k], k);
});

await check('2. all: locus, then one kind set to Cole: that kind Cole, the rest Locus; the top switch again clears the per kind values', async () => {
  let s = setAll({}, 'locus');
  s = setKind(s, 'client_daily', 'cole');
  const r = resolveSenders(s, mkEnv()).resolved;
  assert.equal(r.client_daily.who, 'cole');
  for (const k of ['client_checkin', 'client_report', 'client_update', 'client_recap', 'client_outage', 'client_post', 'onboarding_slack', 'internal_alert', 'team_notice']) assert.equal(r[k].who, 'locus', k);
  const again = setAll(s, 'cole');
  assert.deepEqual(again, { all: 'cole', kinds: {} });
  assert.ok(Object.values(resolveSenders(again, mkEnv()).resolved).filter(v => !v.locked).every(v => v.who === 'cole'));
});

await check('3. locked kinds ignore a Cole value (approval_ask, strategist_reply, creator_discord)', async () => {
  reset(); const env = mkEnv();
  const raw = { all: 'cole', kinds: { approval_ask: 'cole', strategist_reply: 'cole', creator_discord: 'cole', internal_alert: 'cole', team_notice: 'cole' } };
  assert.deepEqual(sendersOf(raw).kinds, {}, 'sendersOf drops them');
  await putSetting(env, 'senders', JSON.stringify(raw));
  for (const k of ['approval_ask', 'strategist_reply', 'creator_discord', 'internal_alert', 'team_notice']) {
    const s = await senderFor(env, k);
    assert.equal(s.who, 'locus', k); assert.equal(s.locked, true); assert.equal(s.slack.token, 'xoxb-bot');
    assert.ok(SENDER_KINDS[k].why, 'a locked kind says why');
  }
  assert.deepEqual(setKind({}, 'approval_ask', 'cole'), { all: null, kinds: {} }, 'a pill cannot set a locked kind');
});

await check('4. an unknown kind = Locus; Cole with no SLACK_USER_TOKEN throws, never returns the bot token', async () => {
  reset();
  const u = await senderFor(mkEnv(), 'made_up_kind');
  assert.equal(u.who, 'locus'); assert.equal(u.slack.token, 'xoxb-bot');
  const env = mkEnv({ SLACK_USER_TOKEN: undefined });
  await assert.rejects(() => senderFor(env, 'client_daily'), /No Slack user token/);
  assert.equal(await senderToken(env, 'onboarding_slack'), null, 'senderToken answers null instead (the onboarding posts skip Slack, as today)');
  const s = await senderFor(mkEnv(), 'client_daily');
  assert.deepEqual(s.slack, { token: 'xoxp-user', asUser: true });
});

await check('5. an email kind set to Locus with no LOCUS_MAIL_FROM resolves to Cole and says fallback; with the mailbox it is Locus', async () => {
  reset(); const env = mkEnv();
  await putSetting(env, 'senders', JSON.stringify({ all: 'locus', kinds: {} }));
  const m = await senderFor(env, 'onboarding_email');
  assert.equal(m.who, 'cole'); assert.equal(m.fallback, true); assert.deepEqual(m.mail, { subject: null, fromName: null, signature: true });
  const withBox = mkEnv({ LOCUS_MAIL_FROM: 'app-mailbox-placeholder' });
  const m2 = await senderFor(withBox, 'onboarding_email');
  assert.equal(m2.who, 'locus'); assert.deepEqual(m2.mail, { subject: 'app-mailbox-placeholder', fromName: 'Locus', signature: false });
  assert.equal(resolveSenders({ all: 'locus' }, env).resolved.login_email.why, 'Locus email is not set up yet, so these still come from you.');
});

await check('6. sendersOf drops junk keys and values; PUT then GET round trip through the settings table', async () => {
  reset(); const env = mkEnv();
  assert.deepEqual(sendersOf({ all: 'bob', kinds: { client_daily: 'locus', nope: 'cole', client_report: 7, login_email: 'locus' }, extra: 1 }),
    { all: null, kinds: { client_daily: 'locus' } }, 'junk out; an email kind set to Locus is dropped while there is no mailbox');
  assert.deepEqual(sendersOf('not json'), { all: null, kinds: {} });
  assert.deepEqual(sendersOf(['x']), { all: null, kinds: {} });
  /* The two lines the worker's routes run (account-health worker.js PUT and GET /api/settings). */
  const src = fs.readFileSync(new URL('./src/worker.js', import.meta.url), 'utf8');
  assert.match(src, /if \('senders' in b\) \{ await putSetting\(env, 'senders', JSON\.stringify\(sendersOf\(b\.senders, \{ mailbox: env\.LOCUS_MAIL_FROM \|\| null \}\)\)\); clearSenderCache\(env\); \}/);
  assert.match(src, /senders: resolveSenders\(await getSetting\(env, 'senders'\), env\),/);
  const b = { senders: { all: 'locus', kinds: { client_recap: 'cole', approval_ask: 'cole' } } };
  if ('senders' in b) await putSetting(env, 'senders', JSON.stringify(sendersOf(b.senders, { mailbox: env.LOCUS_MAIL_FROM || null })));
  const got = resolveSenders(await getSetting(env, 'senders'), env);
  assert.deepEqual({ all: got.all, kinds: got.kinds }, { all: 'locus', kinds: { client_recap: 'cole' } });
  assert.equal(got.resolved.client_recap.who, 'cole'); assert.equal(got.resolved.client_daily.who, 'locus'); assert.equal(got.resolved.approval_ask.who, 'locus');
  assert.equal((await senderFor(env, 'client_daily')).who, 'locus', 'senderFor reads the new value (the PUT clears the cache)');
});

/* A stub Slack: records each call's token and body. */
const calls = [];
const fakeFetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ url: String(url), auth: (init.headers || {}).Authorization || (init.headers || {}).authorization, body });
  return new Response(JSON.stringify({ ok: true, ts: '1.1', channel: body?.channel || 'C1' }));
};

await check('7. slackPost with kind: the token and the app name follow the setting; asUser alone (old callers) is unchanged', async () => {
  reset(); const env = mkEnv();
  calls.length = 0;
  await slackPostWith(env, fakeFetch, 'C1', 'hi', null, { kind: 'client_daily' });
  assert.equal(calls[0].auth, 'Bearer xoxp-user'); assert.ok(!('username' in calls[0].body), 'Cole: no name override');
  await slackPostWith(env, fakeFetch, 'C1', 'hi', null, { kind: 'team_notice' });
  assert.equal(calls[1].auth, 'Bearer xoxb-bot'); assert.equal(calls[1].body.username, 'Locus'); assert.ok(calls[1].body.icon_url);
  await putSetting(env, 'senders', JSON.stringify({ all: null, kinds: { client_daily: 'locus' } }));
  await slackPostWith(env, fakeFetch, 'C1', 'hi', null, { kind: 'client_daily', thread_ts: '9.9' });
  assert.equal(calls[2].auth, 'Bearer xoxb-bot'); assert.equal(calls[2].body.username, 'Locus'); assert.equal(calls[2].body.thread_ts, '9.9');
  assert.ok(!('kind' in calls[2].body), 'kind never reaches Slack');
  /* old callers: asUser and nothing else */
  await slackPostWith(env, fakeFetch, 'C1', 'hi', null, { asUser: true });
  assert.equal(calls[3].auth, 'Bearer xoxp-user'); assert.ok(!('username' in calls[3].body));
  await slackPostWith(env, fakeFetch, 'C1', 'hi', [{ type: 'section' }], { username: 'Locus' });
  assert.equal(calls[4].auth, 'Bearer xoxb-bot'); assert.equal(calls[4].body.username, 'Locus');
  await slackPostWith(env, fakeFetch, 'C1', 'hi', null, {});
  assert.equal(calls[5].body.username, 'Locus'); assert.equal(calls[5].body.icon_emoji, ':bar_chart:', 'no username: the old chart icon, as before');
  await assert.rejects(() => slackPostWith(mkEnv({ SLACK_USER_TOKEN: undefined }), fakeFetch, 'C1', 'hi', null, { asUser: true }), /No Slack user token/);
  /* house style messages with a status bar carry their attachment */
  await slackPostWith(env, fakeFetch, 'C1', 'hi', [{ type: 'header' }], { username: 'Locus', attachments: [{ color: '#E01E5A', blocks: [] }] });
  assert.equal(calls[6].body.attachments[0].color, '#E01E5A');
  /* postAs: the user token posts plainly; the bot adds the name */
  calls.length = 0;
  await postAs({ slack: { token: 'xoxp-user', asUser: true } }, { channel: 'C2', text: 'x' }, fakeFetch);
  await postAs({ slack: { token: 'xoxb-bot', asUser: false, username: 'Locus', icon_url: 'i' } }, { channel: 'C2', text: 'x' }, fakeFetch);
  assert.ok(!('username' in calls[0].body)); assert.equal(calls[1].body.username, 'Locus');
});

await check('8. envFor(env, locus) swaps only SLACK_USER_TOKEN; envFor(env, cole) is env as is', () => {
  const env = mkEnv({ OTHER: 'x' });
  assert.equal(envFor(env, 'cole'), env);
  const e2 = envFor(env, 'locus');
  assert.notEqual(e2, env); assert.equal(e2.SLACK_USER_TOKEN, 'xoxb-bot'); assert.equal(e2.SLACK_BOT_TOKEN, 'xoxb-bot');
  assert.equal(e2.DB, env.DB); assert.equal(e2.OTHER, 'x'); assert.equal(env.SLACK_USER_TOKEN, 'xoxp-user', 'the real env is untouched');
});

await check('9. buyerDeps wrapper: an asUser post from buyerlist.js gets kind client_update; a bot post passes through', async () => {
  const seen = [];
  const wrapped = buyerSlackPost(async (e, c, t, b, o) => { seen.push(o); return { ts: '1' }; });
  await wrapped({}, 'C1', 't', null, { asUser: true });
  await wrapped({}, 'C1', 't', null, { username: 'Locus' });
  await wrapped({}, 'C1', 't', null);
  assert.deepEqual(seen[0], { asUser: true, kind: 'client_update' });
  assert.deepEqual(seen[1], { username: 'Locus' }); assert.equal(seen[2], undefined);
  const src = fs.readFileSync(new URL('./src/worker.js', import.meta.url), 'utf8');
  assert.match(src, /slackPost: buyerSlackPost\(slackPost\)/, 'buyerDeps uses it');
  /* with the default setting the wrapped post still goes as Cole, like today */
  reset(); calls.length = 0;
  const real = buyerSlackPost((e, c, t, b, o) => slackPostWith(e, fakeFetch, c, t, b, o));
  await real(mkEnv(), 'C1', 'what we did', null, { asUser: true });
  assert.equal(calls[0].auth, 'Bearer xoxp-user');
});

await check('10. no protected file was edited, and each send path in the spec passes its kind', () => {
  const read = f => fs.readFileSync(new URL('./src/' + f, import.meta.url), 'utf8');
  const w = read('worker.js');
  assert.equal((w.match(/kind: 'client_daily'/g) || []).length >= 3, true, 'sendBrief: the post, a missed day, the thread');
  assert.match(w, /slackPost\(env, channel, text, null, \{ kind: 'client_report' \}\)/);
  assert.match(w, /handleClientUpdateButton\(await checkinEnv\(env\)/); assert.match(w, /handleStanding\(request, await checkinEnv\(env\)/);
  assert.match(read('callscreen.js'), /\{ kind: 'client_recap' \}/);
  assert.match(read('pulse.js'), /senderFor\(env, 'client_outage'\)/);
  assert.match(read('slackwrite.js'), /senderFor\(env, 'client_post'\)/);
  assert.equal((read('newclient.js').match(/senderToken\(env, 'onboarding_slack'\)/g) || []).length, 3);
  assert.match(read('newclient.js'), /kind: 'onboarding_email'/); assert.match(read('contract.js'), /kind: 'onboarding_email'/); assert.match(read('clients.js'), /kind: 'login_email'/);
  assert.match(read('mail.js'), /senderFor\(env, opts\.kind\)/);
});

/* ---------------- the v5 page group (a small fake DOM) ---------------- */
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {}; this.on = {}; this.style = { setProperty() {} }; this.dataset = {}; this.nodeType = 1; this.disabled = false; this._cls = new Set(); this._text = '';
    const me = this; this.classList = { add: (...c) => c.forEach(x => me._cls.add(x)), remove: (...c) => c.forEach(x => me._cls.delete(x)), toggle: (c, f) => ((f ?? !me._cls.has(c)) ? me._cls.add(c) : me._cls.delete(c)), contains: c => me._cls.has(c) }; }
  setAttribute(k, v) { if (k === 'class') this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); else this.attrs[k] = String(v); }
  getAttribute(k) { return k === 'class' ? [...this._cls].join(' ') : (this.attrs[k] ?? null); }
  append(...k) { this.children.push(...k); }
  replaceChildren(...k) { this.children = k; }
  addEventListener(t, f) { (this.on[t] ||= []).push(f); }
  click() { if (this.disabled) return; (this.on.click || []).forEach(f => f({ currentTarget: this, target: this })); }
  all() { return this.children.flatMap(c => (c.nodeType === 1 ? [c, ...c.all()] : [])); }
  querySelectorAll(sel) { const t = sel.toUpperCase(); return this.all().filter(e => e.tagName === t); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set innerHTML(v) { this._text = ''; }
  get content() { return { firstChild: new El('svg') }; }
}
globalThis.document = { createElement: t => new El(t), createElementNS: (ns, t) => new El(t), createTextNode: s => ({ nodeType: 3, textContent: String(s) }), head: new El('head'), body: new El('body'), querySelector: () => null, querySelectorAll: () => [] };
globalThis.location = new URL('https://app.example.test/profit/v5/');
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

await check('v5: the "Who it comes from" group renders, locked rows are disabled, a pill stages one object, Save sends one PUT', async () => {
  const { whoGroup } = await import('../../profit/v5/pages/a-settings/sending.js');
  const { stage } = await import('../../profit/v5/pages/brand-settings/_set.js');
  const P = await import('../../profit/v5/pages/a-settings/_senders.js');
  const env = mkEnv();
  const answer = resolveSenders(null, env);
  /* the page's own copy of the kinds matches the worker's */
  assert.deepEqual(Object.keys(P.SAMPLE_SENDERS.resolved), Object.keys(SENDER_KINDS));
  for (const [k, v] of Object.entries(P.SAMPLE_SENDERS.resolved)) { assert.equal(v.who, answer.resolved[k].who, k); assert.equal(v.label, answer.resolved[k].label, k); assert.equal(v.locked, answer.resolved[k].locked, k); }
  const puts = [];
  const ctx = { sample: false, settingNow: (k, f) => f, saveSetting: async (k, v) => { puts.push({ k, v }); return v; } };
  const S = stage(ctx, { live: { 'agency.senders': P.storedOf(answer) }, savers: { 'agency.senders': v => ctx.saveSetting('agency.senders', v) } });
  const g = whoGroup(S, { senders: answer, senderPerson: 'Pat' });
  const text = g.textContent;
  assert.match(text, /Who it comes from/); assert.match(text, /Locus is the app\. Pat posts as you, with your name and photo\./);
  assert.match(text, /Everything from/); assert.match(text, /Mixed/, 'today the kinds differ, so the top switch reads Mixed');
  const segs = g.all().filter(e => e._cls.has('lx-seg'));
  assert.equal(segs.length, 1 + Object.keys(SENDER_KINDS).length, 'the top switch and one row per kind');
  const byLabel = l => segs.find(s => s.attrs['aria-label'] === l);
  const locked = byLabel('Strategist answers in threads');
  assert.ok(locked._cls.has('lx-sn-locked')); assert.ok(locked.children.every(b => b.disabled), 'locked rows are disabled');
  assert.ok(locked.children[0]._cls.has('on'), 'a locked row shows Locus');
  const mail = byLabel('Onboarding emails (welcome, agreement, reminders)');
  assert.equal(mail.children[0].disabled, true, 'no Locus mailbox: the Locus pill is off for email rows'); assert.match(text, /Locus email is not set up yet/);
  /* one pill: Call recaps to Locus */
  byLabel('Call recaps').children[0].click();
  assert.equal(S.dirty, 1); assert.deepEqual(S.get('agency.senders'), { all: null, kinds: { client_recap: 'locus' } });
  /* the top switch: everything from Pat, the per kind values cleared */
  const top = () => g.all().filter(e => e._cls.has('lx-seg')).find(s => s.attrs['aria-label'] === 'Everything from');
  top().children[1].click();
  assert.deepEqual(S.get('agency.senders'), { all: 'cole', kinds: {} });
  assert.ok(!/Mixed/.test(g.textContent.replace('Mixed: the rows below', '')), 'one value everywhere: no Mixed');
  await S.save();
  assert.equal(puts.length, 1, 'Save sends one PUT'); assert.deepEqual(puts[0], { k: 'agency.senders', v: { all: 'cole', kinds: {} } });
  /* data.js sends agency.senders to the worker */
  assert.match(fs.readFileSync(new URL('../../profit/v5/data.js', import.meta.url), 'utf8'), /AGENCY_KEYS = \[[^\]]*'senders'/);
});

console.log(`\n${n}/${n + bad} passed`);
/* data.js (imported by the page) keeps a BroadcastChannel open, so the process is ended here. */
process.exit(bad ? 1 : 0);
