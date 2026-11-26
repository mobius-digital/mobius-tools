/* Offline checks for HOW WE READ IT (2026-11-26, the client reports rebuild, src/reportread.js): talking points stored
 * (team only), the read drafted from meeting notes or typed notes, approve writes reports.summary, sendReport refuses
 * before approval and sends after it with the read first, the 11am fallback never sends, a client login cannot reach
 * any of the routes, and the call's confirm drafts the read instead of sending.
 * Drives the REAL account-health worker in node against an in-memory SQLite; the model and Slack are mocked.
 *   node --import <a loader that stubs .wasm> test-reportread.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { shapeRead, readFacts, cleanRead, reportDrafted, readRow, approvedRead, readLink, reportPageUrl, GATE_ERROR } from './src/reportread.js';
import { confirm, ensureMeetings, teamViewOf } from './src/meetings.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const EM = String.fromCharCode(0x2014), EN = String.fromCharCode(0x2013), DOT = String.fromCharCode(0xb7), BUL = String.fromCharCode(0x2022);
const results = [];
async function check(name, fn) { try { await fn(); results.push(true); console.log('PASS ', name); } catch (e) { results.push(false); console.log('FAIL ', name, '\n      ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n      ')); } }

/* ---------------- an in-memory D1 ---------------- */
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
db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, source, internal_channel, client_channel) VALUES
  ('brand_sample', 'sample', 'Sample Golf Co', 'active', 'USD', 'America/Chicago', 'locus', 'C_SAMPLE_IN', 'C_SAMPLE_CLIENT')`);

/* The frozen report data (invented numbers). */
const DATA = {
  account: { act_id: 'brand_sample', name: 'Sample Golf Co', currency: 'USD' }, period: 'weekly', start: '2026-11-16', end: '2026-11-22', prev_start: '2026-11-09', prev_end: '2026-11-15',
  totals: { sales: 12400, spend: 4100, mer: 3.02, orders: 180, aov: 68.9, new_rev: 5200, ret_rev: 7200, new_orders: 70, cm: 2100 },
  previous: { sales: 10900, spend: 4000, mer: 2.73, orders: 160, aov: 68.1, cm: 1700 },
  channels: [
    { id: 'meta', label: 'Meta', cur: { spend: 3500, roas: 2.4, revenue: 8400, purchases: 120, source: 'Triple Whale' }, prev: { spend: 3400, roas: 2.1, revenue: 7140, purchases: 100, source: 'Triple Whale' } },
    { id: 'google', label: 'Google', cur: { spend: 600, roas: 1.2, revenue: 720, purchases: 1, low_signal: true, source: 'Triple Whale' }, prev: null },
  ],
  ads: { top: [{ ad_id: '9001', name: '415 B | Still', headline: 'New colorway', spend: 1200, share: 0.34, video: false }] },
  attr: { ads: { lastPlatformClick: { '9001': { revenue: 3600, orders: 40 } } } },
  cm_ok: true,
};
db.prepare(`INSERT INTO reports (act_id, period, period_start, period_end, status, generated_at, summary, data_json) VALUES ('brand_sample', 'weekly', '2026-11-16', '2026-11-22', 'draft', '2026-11-23T11:00:00Z', NULL, ?)`).run(JSON.stringify(DATA));

/* ---------------- mocks: the model and Slack ---------------- */
const SECRET = 'test-session-secret';
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const mint = (email, key = SECRET) => { const p = b64u(`${email}|${Date.now() + 3600e3}`); return `mds.${p}.${b64u(crypto.createHmac('sha256', key).update(p).digest())}`; };
db.prepare(`INSERT INTO settings (key, value) VALUES ('clientUsers', ?)`).run(JSON.stringify({ 'owner@samplegolf.test': { brands: ['brand_sample'], name: 'Sam' } }));
const CLIENT = mint('owner@samplegolf.test'), TEAM = mint('teammate@go-mobius-digital.com');

const seen = { model: [], slack: [] };
const POINTS = { points: [{ line: 'Meta carried the week on the new colorway', proof: '2.40x ROAS' }, { line: `Google spend bought almost nothing ${EM} one order`, proof: '$600 spent' }], questions: ['Do we pull Google back?'], proposed: 'A good week: sales up 14% on flat spend.' };
globalThis.fetch = async (url, init = {}) => {
  const u = String(url?.url || url);
  if (u.startsWith('https://api.anthropic.com/v1/messages')) {
    const body = JSON.parse(init.body);
    const sys = (Array.isArray(body.system) ? body.system.map(s => s.text).join('\n') : body.system) || '';
    const user = body.messages[0].content;
    seen.model.push({ model: body.model, sys, user });
    const text = /TALKING POINTS/.test(sys) ? 'Here you go:\n' + JSON.stringify(POINTS)
      : `**How we read it**\nA good week ${EM} sales up 14% on the same ad spend.\nThe new colorway did the work on Meta.\nWe hold Meta and pull Google back this week.`;
    return new Response(JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }), { status: 200 });
  }
  if (u.startsWith('https://slack.com/api/')) {
    const body = typeof init.body === 'string' ? (() => { try { return JSON.parse(init.body); } catch { return init.body; } })() : init.body;
    seen.slack.push({ u, body });
    return new Response(JSON.stringify({ ok: true, ts: '1.1', channel: body?.channel || 'C', user_id: 'U1', user: 'cole' }), { status: 200 });
  }
  return new Response(JSON.stringify({ error: 'offline: ' + u }), { status: 503 });
};

const AH = (await import('./src/worker.js')).default;
const env = { DB, ADMIN_TOKEN: 'tok', SESSION_SECRET: SECRET, ANTHROPIC_API_KEY: 'k', SLACK_BOT_TOKEN: 'xoxb', SLACK_USER_TOKEN: 'xoxp' };
const call = (method, p, body, auth = 'tok') => AH.fetch(new Request(`https://ah.test${p}`, { method, headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, { waitUntil() {} });
const KEY = { act: 'brand_sample', period: 'weekly', start: '2026-11-16' };
const Q = '?act=brand_sample&period=weekly&start=2026-11-16';
const summaryNow = () => db.prepare(`SELECT summary, status FROM reports WHERE act_id = 'brand_sample' AND period_start = '2026-11-16'`).get();

await check('a client login cannot reach any report-read route (403 before any handler), and nothing is written', async () => {
  for (const [m, p, b] of [['GET', `/api/report-read${Q}`], ['POST', '/api/report-read/points', KEY], ['POST', '/api/report-read/draft', { ...KEY, notes: 'x' }], ['PUT', '/api/report-read', { ...KEY, text: 'x' }], ['POST', '/api/report-read/approve', { ...KEY, text: 'x', send: true }]]) {
    const r = await call(m, p, b, CLIENT);
    assert.equal(r.status, 403, `${m} ${p} answered ${r.status}`);
  }
  const noAuth = await call('GET', `/api/report-read${Q}`, null, 'nope');
  assert.equal(noAuth.status, 401);
  assert.equal(seen.model.length, 0, 'no model call'); assert.equal(seen.slack.length, 0, 'no Slack call');
  const src = fs.readFileSync(path.join(here, 'src', 'brandguard.js'), 'utf8');
  assert.ok(!src.includes('report-read'), 'not on CLIENT_RULES');
});

await check('GET before anything: status none, empty fields, the v5 link', async () => {
  const r = await call('GET', `/api/report-read${Q}`);
  assert.equal(r.status, 200); const j = await r.json();
  assert.equal(j.status, 'none'); assert.equal(j.points, null); assert.equal(j.draft, null); assert.equal(j.read_text, null);
  assert.equal(j.report_status, 'draft');
  assert.equal(j.link, 'https://locus.go-mobius-digital.com/profit/v5/#/brand/sample/reports/index');
});

await check('talking points: written by the model from the frozen numbers, stored in p_report_read (never on the report row), status points', async () => {
  const r = await call('POST', '/api/report-read/points', KEY);
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.equal(j.status, 'points'); assert.equal(j.points.points.length, 2);
  assert.deepEqual(j.points.points[1], { line: 'Google spend bought almost nothing, one order', why: '$600 spent' }, 'dashes go; the proof is why');
  assert.deepEqual(j.points.questions, ['Do we pull Google back?']); assert.match(j.points.proposed, /good week/);
  const m = seen.model.at(-1);
  assert.equal(m.model, 'claude-sonnet-5-5');
  assert.match(m.user, /"roas_tw":2\.4/); assert.match(m.user, /"mer_whole_store":3\.02/); assert.match(m.user, /"too_few_orders":true/);
  const rep = summaryNow(); assert.equal(rep.summary, null, 'reports.summary stays NULL');
  const raw = db.prepare(`SELECT data_json FROM reports WHERE act_id = 'brand_sample'`).get().data_json;
  assert.ok(!raw.includes('Do we pull Google back'), 'team-only points are not in the report row');
});

await check('draft with typed notes: the notes are the team view (typed), the model is told to follow them, the draft is cleaned, status drafted', async () => {
  const r = await call('POST', '/api/report-read/draft', { ...KEY, notes: 'We think it was the colorway. Hold Meta, pull Google back.' });
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.equal(j.status, 'drafted'); assert.equal(j.team_source, 'typed'); assert.equal(j.team_view, 'We think it was the colorway. Hold Meta, pull Google back.');
  assert.equal(j.draft, 'A good week, sales up 14% on the same ad spend.\nThe new colorway did the work on Meta.\nWe hold Meta and pull Google back this week.');
  const m = seen.model.at(-1);
  assert.match(m.sys, /THE TEAM'S VIEW WINS/); assert.match(m.user, /THE TEAM'S VIEW \(notes the team added\)/); assert.match(m.user, /Hold Meta, pull Google back/);
  assert.match(m.user, /Talking points the team prepared/);
  assert.equal(summaryNow().summary, null, 'a draft is not the summary');
});

await check('send is refused before approval, with the gate message, and nothing reaches Slack', async () => {
  const before = seen.slack.length;
  const r = await call('POST', '/api/report-send', KEY);
  assert.equal(r.status, 400); assert.equal((await r.json()).error, GATE_ERROR);
  assert.equal(seen.slack.length, before);
  assert.equal(summaryNow().status, 'draft');
});

await check('PUT saves a person\'s edit as the draft (line breaks kept)', async () => {
  const r = await call('PUT', '/api/report-read', { ...KEY, text: 'A good week.\nWe hold Meta.' });
  const j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j));
  assert.equal(j.status, 'drafted'); assert.equal(j.draft, 'A good week.\nWe hold Meta.');
  const bad = await call('PUT', '/api/report-read', { ...KEY, text: '   ' });
  assert.equal(bad.status, 400);
});

await check('approve writes read_text, approved_by (the session email), status approved AND reports.summary', async () => {
  const r = await call('POST', '/api/report-read/approve', { ...KEY, text: 'A good week: sales up 14% on flat spend.\nWe hold Meta and pull Google back.' }, TEAM);
  const j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j));
  assert.equal(j.status, 'approved'); assert.equal(j.approved_by, 'teammate@go-mobius-digital.com'); assert.ok(j.approved_at);
  assert.equal(j.read_text, 'A good week: sales up 14% on flat spend.\nWe hold Meta and pull Google back.');
  assert.equal(summaryNow().summary, j.read_text);
});

await check('an edit after approval drops it back to a draft (re-approve) and clears the summary; approve again', async () => {
  let r = await call('PUT', '/api/report-read', { ...KEY, text: 'A good week, edited.' });
  let j = await r.json(); assert.equal(j.status, 'drafted'); assert.equal(j.read_text, null); assert.equal(summaryNow().summary, null);
  r = await call('POST', '/api/report-read/approve', KEY, TEAM);
  j = await r.json(); assert.equal(j.status, 'approved'); assert.equal(j.read_text, 'A good week, edited.', 'no text = approve the draft');
});

await check('approve with send when the send fails: the approval stays and the error comes back (200, sent.ok false)', async () => {
  db.exec(`UPDATE brands SET client_channel = NULL WHERE id = 'brand_sample'`);
  try {
    const r = await call('POST', '/api/report-read/approve', { ...KEY, send: true }, TEAM);
    const j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j));
    assert.equal(j.ok, false); assert.equal(j.approved, true); assert.equal(j.status, 'approved'); assert.equal(j.sent.ok, false);
    assert.match(j.error, /no client channel/);
    assert.equal(summaryNow().status, 'draft');
  } finally { db.exec(`UPDATE brands SET client_channel = 'C_SAMPLE_CLIENT' WHERE id = 'brand_sample'`); }
});

await check('approve with send: sendReport posts How we read it first, By platform on Triple Whale, the new report page link; the report is frozen', async () => {
  const before = seen.slack.length;
  const r = await call('POST', '/api/report-read/approve', { ...KEY, text: 'A good week: sales up 14% on flat spend.\nWe hold Meta and pull Google back.', send: true }, TEAM);
  const j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j));
  assert.equal(j.approved, true); assert.equal(j.report_status, 'sent'); assert.equal(j.sent.channel, 'C_SAMPLE_CLIENT');
  const post = seen.slack.slice(before).find(s => s.u.includes('chat.postMessage') && s.body?.channel === 'C_SAMPLE_CLIENT');
  assert.ok(post, 'posted to the client channel');
  const text = post.body.text;
  const L = text.split('\n');
  assert.equal(L[0], `*Sample Golf Co ${DOT} Weekly report, Nov 16 to 22*`);
  assert.equal(L[2], '*How we read it*'); assert.equal(L[3], 'A good week: sales up 14% on flat spend.'); assert.equal(L[4], 'We hold Meta and pull Google back.');
  assert.ok(text.includes(`${BUL} MER (whole store): *3.02x* (was 2.73x)`), text);
  assert.ok(text.includes(['*By platform* (Triple Whale attributed)', `${BUL} Meta: $3,500 spent, 2.40x ROAS`, `${BUL} Google: $600 spent, too few orders to read`].join('\n')), text);
  assert.ok(!/aMER|Contribution margin/.test(text), 'no aMER; no CM without the frozen in_posts switch');
  assert.match(text, /<https:\/\/locus\.go-mobius-digital\.com\/profit\/v5\/report\.html\?t=[0-9a-f]{32}&period=weekly&start=2026-11-16\|Open the full report>/);
  const rep = summaryNow(); assert.equal(rep.status, 'sent'); assert.equal(rep.summary, 'A good week: sales up 14% on flat spend.\nWe hold Meta and pull Google back.');
});

await check('a sent report is frozen: every write route refuses; GET still answers', async () => {
  for (const [m, p, b] of [['POST', '/api/report-read/points', KEY], ['POST', '/api/report-read/draft', KEY], ['PUT', '/api/report-read', { ...KEY, text: 'x' }], ['POST', '/api/report-read/approve', { ...KEY, text: 'x' }]]) {
    const r = await call(m, p, b); assert.equal(r.status, 409, `${m} ${p}`);
  }
  const g = await call('GET', `/api/report-read${Q}`); assert.equal(g.status, 200); assert.equal((await g.json()).report_status, 'sent');
});

await check('makeReport\'s hook (reportDrafted): new numbers make an approved read a draft again, then the points are rewritten', async () => {
  const k = ['brand_sample', 'monthly', '2026-10-01'];
  db.prepare(`INSERT INTO p_report_read (act_id, period, period_start, status, read_text, approved_by, approved_at, updated_at) VALUES (?, ?, ?, 'approved', 'Old read.', 'a@b', '2026-11-01', '2026-11-01')`).run(...k);
  const d = { claude: async () => JSON.stringify(POINTS) };
  await reportDrafted(env, d, { act_id: k[0], name: 'Sample Golf Co' }, k[1], k[2], DATA);
  const row = await readRow(env, ...k);
  assert.equal(row.status, 'drafted'); assert.equal(row.draft, 'Old read.'); assert.equal(row.read_text, null); assert.equal(approvedRead(row), null);
  assert.equal(shapeRead(row).points.points.length, 2);
  const failing = { claude: async () => 'no json here' };
  await assert.rejects(() => reportDrafted(env, failing, { act_id: k[0] }, k[1], k[2], DATA), /without JSON/);
});

await check('the old narrative is gone from makeReport; points are written after the row; reports.summary NULL at draft', () => {
  const src = fs.readFileSync(path.join(here, 'src', 'worker.js'), 'utf8');
  assert.ok(!src.includes('async function writeReportNarrative('), 'writeReportNarrative removed');
  const mk = src.slice(src.indexOf('async function makeReport('), src.indexOf('async function reportToken('));
  assert.ok(mk.includes('const summary = null;') && mk.includes('reportDrafted(env, readDeps()'), 'talking points, no summary');
  const sr = src.slice(src.indexOf('async function sendReport('), src.indexOf('async function reportsPass('));
  assert.ok(sr.indexOf('throw new Error(READ_GATE_ERROR)') < sr.indexOf('slackPost('), 'the gate comes before any post');
});

await check('the 11am fallback never sends: it lists each draft as waiting for an approved read', () => {
  const src = fs.readFileSync(path.join(here, 'src', 'worker.js'), 'utf8');
  const fb = src.slice(src.indexOf('async function reportFallbackPass('), src.indexOf('const metaIdOf'));
  assert.ok(!fb.includes('sendReport('), 'no sendReport call left in the fallback');
  assert.ok(fb.includes("skipped: 'waits for an approved read'"));
});

await check('the call\'s confirm drafts How we read it from the brand\'s notes (source meeting) and sends nothing', async () => {
  db.prepare(`INSERT INTO reports (act_id, period, period_start, period_end, status, generated_at, summary, data_json) VALUES ('brand_sample', 'weekly', '2026-11-23', '2026-11-29', 'draft', '2026-11-30T11:00:00Z', NULL, ?)`).run(JSON.stringify({ ...DATA, start: '2026-11-23', end: '2026-11-29' }));
  db.prepare(`INSERT INTO reports (act_id, period, period_start, period_end, status, generated_at, summary, data_json) VALUES ('brand_sample', 'monthly', '2026-11-01', '2026-11-30', 'draft', '2026-12-01T11:00:00Z', NULL, ?)`).run(JSON.stringify({ ...DATA, period: 'monthly', start: '2026-11-01', end: '2026-11-30' }));
  await ensureMeetings(env);
  db.exec(`INSERT INTO p_meeting (id, title, date, kind, status, created_at, updated_at) VALUES ('mt1', 'Monday call', '2026-12-01', 'monday_call', 'extracted', '2026-12-01T13:00:00Z', '2026-12-01T13:00:00Z')`);
  const { draftRead } = await import('./src/reportread.js');
  const sent = [];
  const d = {
    listBrands: async () => [{ act_id: 'brand_sample', name: 'Sample Golf Co', slack_channel: 'C_SAMPLE_IN', brief_channel: 'C_SAMPLE_CLIENT', review_first: false }],
    sendReport: async (...a) => { sent.push(a); return { ok: true }; },
    slackSyncReport: async () => {},
    draftReportRead: (e, act, period, start, o) => draftRead(e, { claude: async (_, x) => { seen.model.push({ sys: x.system, user: x.user }); return 'A strong month. We hold Meta.'; } }, { act_id: act, name: 'Sample Golf Co' }, period, start, o),
    createAsk: async () => 'rq_1', slackPost: async () => ({ ok: true }), slackApi: async () => ({ ok: false }),
  };
  const r = await confirm(env, d, { id: 'mt1', summary: 'Good call.', brands: [{ brand_id: 'brand_sample', decisions: ['Hold Meta budget'], this_week: ['Holiday ads go live Friday'], need_from_client: ['Gift card photos'] }] }, 'teammate@go-mobius-digital.com');
  assert.equal(sent.length, 0, 'nothing sent');
  assert.deepEqual(r.brands[0].reads.map(x => `${x.period}:${x.status}`).sort(), ['monthly:drafted', 'weekly:drafted']);
  for (const [p, s] of [['weekly', '2026-11-23'], ['monthly', '2026-11-01']]) {
    const row = await readRow(env, 'brand_sample', p, s);
    assert.equal(row.status, 'drafted'); assert.equal(row.team_source, 'meeting'); assert.equal(row.meeting_id, 'mt1');
    assert.match(row.team_view, /Decisions:\n- Hold Meta budget/); assert.match(row.team_view, /This week:\n- Holiday ads go live Friday/);
    assert.equal(row.draft, 'A strong month. We hold Meta.');
  }
  assert.match(seen.model.at(-1).user, /notes from the call/);
  const src = fs.readFileSync(path.join(here, 'src', 'meetings.js'), 'utf8');
  assert.ok(!src.includes('d.sendReport('), 'meetings.js never calls sendReport');
});

await check('a later call never replaces an approved read or one from typed notes; a call with several brands leaves the call summary out', async () => {
  const { draftRead } = await import('./src/reportread.js');
  const views = [];
  const d = {
    listBrands: async () => [{ act_id: 'brand_sample', name: 'Sample Golf Co', slack_channel: 'C_SAMPLE_IN', brief_channel: 'C_SAMPLE_CLIENT' }, { act_id: 'brand_other', name: 'Other Sample Co', slack_channel: 'C_OTHER_IN', brief_channel: 'C_OTHER_CLIENT' }],
    sendReport: async () => { throw new Error('never sends'); }, slackSyncReport: async () => {},
    draftReportRead: (e, act, period, start, o) => { views.push(o.notes); return draftRead(e, { claude: async () => 'Second call read.' }, { act_id: act, name: 'Sample Golf Co' }, period, start, o); },
    createAsk: async () => 'rq_2', slackPost: async () => ({ ok: true }), slackApi: async () => ({ ok: false }),
  };
  db.exec(`UPDATE p_report_read SET status = 'approved', read_text = 'Approved weekly read.', approved_by = 'a@b' WHERE act_id = 'brand_sample' AND period = 'weekly' AND period_start = '2026-11-23'`);
  db.exec(`INSERT INTO p_meeting (id, title, date, kind, status, created_at, updated_at) VALUES ('mt2', 'Team call', '2026-12-02', 'monday_call', 'extracted', '2026-12-02T13:00:00Z', '2026-12-02T13:00:00Z')`);
  const r = await confirm(env, d, { id: 'mt2', summary: 'Other Sample Co had a rough week and we cut its budget.', brands: [
    { brand_id: 'brand_sample', decisions: ['Raise Meta'] }, { brand_id: 'brand_other', decisions: ['Cut budget'] }] }, 'teammate@go-mobius-digital.com');
  const wk = await readRow(env, 'brand_sample', 'weekly', '2026-11-23');
  assert.equal(wk.status, 'approved'); assert.equal(wk.read_text, 'Approved weekly read.'); assert.equal(wk.meeting_id, 'mt1', 'team view untouched');
  assert.ok(r.warnings.some(w => /weekly report was already approved, left as is/.test(w)), JSON.stringify(r.warnings));
  const mo = await readRow(env, 'brand_sample', 'monthly', '2026-11-01');
  assert.equal(mo.status, 'drafted'); assert.equal(mo.draft, 'Second call read.'); assert.equal(mo.meeting_id, 'mt2');
  assert.equal(views.length, 1);
  assert.ok(!/Other Sample Co|rough week|Call summary/.test(views[0]), 'no other brand in the view: ' + views[0]);
  assert.match(views[0], /Decisions:\n- Raise Meta/);

  db.exec(`UPDATE p_report_read SET team_source = 'typed', team_view = 'Our own notes.' WHERE act_id = 'brand_sample' AND period = 'monthly' AND period_start = '2026-11-01'`);
  db.exec(`INSERT INTO p_meeting (id, title, date, kind, status, created_at, updated_at) VALUES ('mt3', 'Brand call', '2026-12-03', 'brand_call', 'extracted', '2026-12-03T13:00:00Z', '2026-12-03T13:00:00Z')`);
  const r3 = await confirm(env, d, { id: 'mt3', summary: 'Only this brand.', brands: [{ brand_id: 'brand_sample', decisions: ['Hold'] }] }, 'teammate@go-mobius-digital.com');
  const mo3 = await readRow(env, 'brand_sample', 'monthly', '2026-11-01');
  assert.equal(mo3.team_view, 'Our own notes.'); assert.equal(mo3.draft, 'Second call read.');
  assert.ok(r3.warnings.some(w => /monthly report was written from the team's own notes, left as is/.test(w)), JSON.stringify(r3.warnings));
  assert.equal(views.length, 1, 'no redraft');
  assert.match(teamViewOf({ decisions: ['Hold'] }, { title: 'Brand call', date: '2026-12-03' }, 'Only this brand.', 'X'), /Call summary: Only this brand\./, 'a one-brand call keeps its summary');
});

await check('a hand edit (PUT) is kept by a later call; Write it again with notes \'\' clears the team view and the edit mark', async () => {
  const { draftRead } = await import('./src/reportread.js');
  const K = { act: 'brand_sample', period: 'monthly', start: '2026-11-01' };
  db.exec(`UPDATE p_report_read SET team_source = 'meeting', team_view = 'Call notes.' WHERE act_id = 'brand_sample' AND period = 'monthly' AND period_start = '2026-11-01'`);
  let r = await call('PUT', '/api/report-read', { ...K, text: 'Our hand edit.' });
  let j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j)); assert.ok(j.edited_at, 'edit marked');
  const views = [];
  const d = {
    listBrands: async () => [{ act_id: 'brand_sample', name: 'Sample Golf Co', slack_channel: 'C_SAMPLE_IN', brief_channel: 'C_SAMPLE_CLIENT' }],
    sendReport: async () => { throw new Error('never sends'); }, slackSyncReport: async () => {},
    draftReportRead: (e, act, period, start, o) => { views.push(o.notes); return draftRead(e, { claude: async () => 'Call read.' }, { act_id: act, name: 'Sample Golf Co' }, period, start, o); },
    createAsk: async () => 'rq_3', slackPost: async () => ({ ok: true }), slackApi: async () => ({ ok: false }),
  };
  db.exec(`INSERT INTO p_meeting (id, title, date, kind, status, created_at, updated_at) VALUES ('mt4', 'Brand call', '2026-12-04', 'brand_call', 'extracted', '2026-12-04T13:00:00Z', '2026-12-04T13:00:00Z')`);
  const r4 = await confirm(env, d, { id: 'mt4', summary: 'Only this brand.', brands: [{ brand_id: 'brand_sample', decisions: ['Hold'] }] }, 'teammate@go-mobius-digital.com');
  const mo = await readRow(env, 'brand_sample', 'monthly', '2026-11-01');
  assert.equal(mo.draft, 'Our hand edit.'); assert.equal(views.length, 0, 'no redraft');
  assert.ok(r4.warnings.some(w => /monthly report was edited by hand, left as is/.test(w)), JSON.stringify(r4.warnings));

  seen.model.length = 0;
  r = await call('POST', '/api/report-read/draft', { ...K, notes: '' });
  j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j));
  assert.equal(j.team_view, null); assert.equal(j.team_source, null); assert.equal(j.edited_at, null, 'a model draft clears the edit mark');
  assert.match(seen.model.at(-1).user, /No notes from the team/);
  /* notes left out keep the stored view (none now) */
  db.exec(`UPDATE p_report_read SET team_view = 'Kept.', team_source = 'typed' WHERE act_id = 'brand_sample' AND period = 'monthly' AND period_start = '2026-11-01'`);
  r = await call('POST', '/api/report-read/draft', K);
  j = await r.json(); assert.equal(j.team_view, 'Kept.');
});

await check('the public report view strips campaign / ad set names and every attribution model but the one shown', async () => {
  const { stripReportView } = await import('../../profit/worker/src/worker.js');
  const d = { ads: { top: [{ ad_id: '1', name: '415 B | Still', campaign: 'C', adset: 'S', spend: 1 }] },
    attr: { models: ['lastPlatformClick', 'firstClick', 'linear'], ads: { lastPlatformClick: { 1: { revenue: 2 } }, firstClick: {}, linear: {} }, channels: { lastPlatformClick: {}, linear: {} } } };
  stripReportView(d, 'platform');
  assert.deepEqual(d.ads.top[0], { ad_id: '1', name: '415 B | Still', spend: 1 });
  assert.deepEqual(d.attr.models, ['lastPlatformClick']); assert.deepEqual(Object.keys(d.attr.ads), ['lastPlatformClick']); assert.deepEqual(Object.keys(d.attr.channels), ['lastPlatformClick']);
  const e = { attr: { models: ['lastPlatformClick', 'firstClick', 'linear'], ads: { lastPlatformClick: {}, firstClick: {}, linear: {} } } };
  stripReportView(e, 'firstClick');
  assert.deepEqual(e.attr.models, ['lastPlatformClick', 'firstClick'], 'the old page keeps the brand\'s stored model');
});

await check('GET /api/reports carries read_status per row (team), and a client row never does', async () => {
  let r = await call('GET', '/api/reports?act=all');
  let j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j));
  const mo = j.rows.find(x => x.period === 'monthly' && x.period_start === '2026-11-01');
  assert.equal(mo.read_status, 'drafted');
  db.prepare(`INSERT INTO reports (act_id, period, period_start, period_end, status, generated_at, summary, data_json) VALUES ('brand_sample', 'weekly', '2026-10-05', '2026-10-11', 'sent', '2026-10-12T11:00:00Z', 'x', '{}')`).run();
  r = await call('GET', '/api/reports?act=brand_sample', null, CLIENT);
  j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j));
  assert.ok(j.rows.length >= 1 && j.rows.every(x => x.status === 'sent' && !('read_status' in x)), JSON.stringify(j.rows));
});

await check('reportCard: every actions block has unique action_ids (no read, drafted, approved), and an internal-only card too', async () => {
  const { reportCard } = await import('./src/worker.js');
  db.prepare(`INSERT INTO reports (act_id, period, period_start, period_end, status, generated_at, summary, data_json) VALUES ('brand_sample', 'weekly', '2026-11-30', '2026-12-06', 'draft', '2026-12-07T11:00:00Z', NULL, ?)`).run(JSON.stringify({ ...DATA, start: '2026-11-30', end: '2026-12-06' }));
  const row = () => db.prepare(`SELECT * FROM reports WHERE act_id = 'brand_sample' AND period = 'weekly' AND period_start = '2026-11-30'`).get();
  const acct = { act_id: 'brand_sample', name: 'Sample Golf Co', brief_channel: 'C_SAMPLE_CLIENT', slack_channel: 'C_SAMPLE_IN' };
  const ids = card => card.blocks.filter(b => b.type === 'actions').map(b => b.elements.map(e => e.action_id));
  const unique = (card, label) => { for (const xs of ids(card)) assert.equal(new Set(xs).size, xs.length, `${label}: ${xs.join(', ')}`); };
  let c = await reportCard(env, acct, row()); unique(c, 'no read'); assert.ok(ids(c)[0].includes('noop_open_1'), 'approve button there');
  db.prepare(`INSERT INTO p_report_read (act_id, period, period_start, status, draft, updated_at) VALUES ('brand_sample', 'weekly', '2026-11-30', 'drafted', 'A draft.', '2026-12-07')`).run();
  c = await reportCard(env, acct, row()); unique(c, 'drafted');
  db.exec(`UPDATE p_report_read SET status = 'approved', read_text = 'A draft.' WHERE act_id = 'brand_sample' AND period = 'weekly' AND period_start = '2026-11-30'`);
  c = await reportCard(env, acct, row()); unique(c, 'approved'); assert.ok(!ids(c)[0].includes('noop_open_1'), 'no approve button once approved');
  c = await reportCard(env, { ...acct, brief_channel: null }, row()); unique(c, 'internal only');
});

await check('helpers: cleanRead strips markdown and dashes; readFacts keeps internals Triple Whale only; teamViewOf; links', () => {
  assert.equal(cleanRead(`## How we read it\n**Good** week ${EN} up.`), 'Good week, up.');
  const f = readFacts({ ...DATA, channels: [{ id: 'tiktok', label: 'TikTok', cur: { spend: 50, roas: 3, source: undefined }, prev: null }] });
  assert.equal(f.platforms[0].this_period.roas_tw, undefined, 'a platform-reported ROAS is never given as Triple Whale');
  assert.equal(f.top_meta_ads[0].roas_tw, 3); assert.equal(f.totals.mer_whole_store, 3.02);
  assert.equal(teamViewOf({ decisions: [], items: [{ kind: 'client', text: 'Told them about BF' }], this_week: [], need_from_client: [] }, { title: 'Call', date: '2026-12-01' }, '', 'X'), 'From the "Call" call on 2026-12-01.\n\nWhat we told the client:\n- Told them about BF');
  assert.equal(readLink('brand_sample_golf'), 'https://locus.go-mobius-digital.com/profit/v5/#/brand/sample-golf/reports/index');
  assert.equal(reportPageUrl('abc'), 'https://locus.go-mobius-digital.com/profit/v5/report.html?t=abc');
  const all = fs.readFileSync(path.join(here, 'src', 'reportread.js'), 'utf8');
  assert.ok(!all.includes(EM) && !all.includes(EN), 'no em or en dash in reportread.js');
});

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
