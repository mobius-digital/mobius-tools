/* Offline checks for THE CLIENT POSTS (2026-10-19, the reporting audit phase 1, src/clientpost.js):
 *   the six-line daily, the weekly post, the weekly sending on the Monday call's confirm (meetings.js), the refusal
 *   of the "client" Send-to-Slack target (worker.js), the one-channel guards, and no bot post into a client channel.
 *   node test-clientpost.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dailyPost, dailyThread, weeklyPost, weekSentence, dailyVerdict, pctChange, shortMoney, oneChannel, internalChannel, CM_WORDS } from './src/clientpost.js';
import { clientBits, clientMessages } from './src/calendar.js';
import { confirm, ensureMeetings } from './src/meetings.js';
import { allowedChannels } from './src/askschedule.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const results = [];
async function check(name, fn) { try { await fn(); results.push(true); console.log('PASS ', name); } catch (e) { results.push(false); console.log('FAIL ', name, '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }

/* ---------------- an in-memory D1 ---------------- */
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
  ('brand_alpha', 'alpha', 'Alpha Golf', 'active', 'USD', 'America/Chicago', 'locus', 'C_ALPHA_IN', 'C_ALPHA_CLIENT')`);

/* ---------------- the daily ---------------- */
const DAY = { sales: 719, spend: 489, mer: 1.47, plan: 1800 };
const MONTH = { ym: '2026-10', sales: 19574, goal: 30603, day_of_month: 17 };
await check('the daily: title, Yesterday with its date, labelled bullets, the month, Next only when written; no headline, no weekday title', () => {
  const t = dailyPost({ brand: 'Dartee Golf', date: '2026-10-15', day: { sales: 1458, spend: 519, mer: 2.81, amer: 1.95, plan: 1800 }, month: { ym: '2026-10', sales: 17800, plan: 27000, spend: 8100, day_of_month: 15, days_in_month: 31 }, others: [1018, 1600, 822], next: 'Ahsan steps the ads back up Monday.' });
  assert.equal(t, [
    '*Dartee Golf \u00b7 Daily update*',
    '*Yesterday, Thursday Oct 15*',
    '\u2022 Sales: *$1,458* (plan $1,800, under plan)',
    '\u2022 Ad spend: *$519*',
    '\u2022 MER: *2.81x*',
    '\u2022 aMER (new customers): *1.95x*',
    '', '*October so far* (15 of 31 days)',
    '\u2022 Sales: *$17.8K* of $27K planned',
    '\u2022 Ad spend: *$8,100*',
    '\u2022 MER: *2.20x*',
    '', '*Next:* Ahsan steps the ads back up Monday.',
    '', '_More numbers in the thread._'].join('\n'));
  assert.ok(!/Hey Team|Meta|Google|[\u2014\u2013]/.test(t), 'no opener, no channel named, no em dashes');
});
await check('no Next line when nobody wrote one; "best day this month" beats the plan read', () => {
  const t = dailyPost({ brand: 'Dartee Golf', date: '2026-10-17', day: { sales: 1500, spend: 489, mer: 3.07, plan: 1800 }, month: { ym: '2026-10', sales: 19574, plan: 30603, day_of_month: 17 }, others: [1018, 1438, 822], next: '' });
  assert.ok(!t.includes('Next'), t);
  assert.ok(t.includes('\u2022 Sales: *$1,500* (plan $1,800, best day this month)'), t);
  assert.ok(!t.includes('aMER'), 'no aMER line when it is unknown');
  assert.equal(dailyVerdict({ sales: 1900, plan: 1800, others: [2500, 2200] }), 'on plan');
  assert.equal(dailyVerdict({ sales: 1700, plan: 1800, others: [2500, 2200] }), 'under plan');
  assert.equal(dailyVerdict({ sales: 1700, plan: null, others: [2500, 2200] }), null, 'no plan, no word');
  assert.equal(dailyVerdict({ sales: 1700, plan: null, others: [900] }), null, 'one other day is not a month');
  const noGoal = dailyPost({ brand: 'B', date: '2026-10-03', day: { sales: 800, spend: 300, mer: 2.67 }, month: { ym: '2026-10', sales: 2400, plan: null, day_of_month: 3 } });
  assert.ok(noGoal.includes('\u2022 Sales: *$2,400*\n'), noGoal);
});
await check('the thread is numbers only: orders, new vs returning, every ad channel that spent (biggest first, Triple Whale sales), contribution margin only when trusted', () => {
  const day = { sales: 1458, orders: 38, new_orders: 12, new_rev: 520, ret_rev: 938, cm: 312, attr: true,
    channels: [{ name: 'Google', spend: 69, roas: 2.19, purchases: 3 }, { name: 'Meta', spend: 450, roas: 3.24, purchases: 11 }, { name: 'TikTok', spend: 0, roas: null, purchases: 0 }] };
  const t = dailyThread({ date: '2026-10-15', day, cm_ok: true });
  assert.equal(t, [
    '*More on Thursday Oct 15*',
    '\u2022 Orders: *38* (12 from new customers), average order $38',
    '\u2022 Sales from new customers: *$520*, returning *$938*',
    '\u2022 Meta: *$450* spent, *$1,458* in sales tracked to it (3.24x)',
    '\u2022 Google: *$69* spent, *$151* in sales tracked to it (2.19x)',
    '\u2022 Contribution margin: *$312*',
    '', `_Sales tracked to a channel are Triple Whale\u2019s count, so the channels can add up to more than the day. ${CM_WORDS}_`].join('\n'));
  const broken = dailyThread({ date: '2026-10-15', day: { ...day, channels: [{ name: 'Google', spend: 122, roas: 0.16, purchases: 1 }] }, cm_ok: false });
  assert.ok(broken.includes('\u2022 Google: *$122* spent, too few tracked orders to rate yet'), broken);
  assert.ok(!broken.includes('Contribution margin'), 'no CM when the cost data is not trusted');
  const unsynced = dailyThread({ date: '2026-10-15', day: { ...day, attr: false }, cm_ok: true });
  assert.ok(unsynced.includes('\u2022 Meta: *$450* spent\n'), 'spend only when attribution is not synced');
  assert.equal(dailyThread({ date: '2026-10-15', day: {} }), '', 'nothing to say = no thread');
  assert.ok(!/What we saw|What it means|What we|Hey Team/.test(t), 'no narrative');
});
await check('shortMoney and pctChange', () => {
  assert.equal(shortMoney(19574), '$19.6K'); assert.equal(shortMoney(7318), '$7,318'); assert.equal(shortMoney(30000), '$30K');
  assert.equal(pctChange(5890, 6958), '▼15%'); assert.equal(pctChange(3105, 3140), 'flat'); assert.equal(pctChange(7318, 6840), '▲7%'); assert.equal(pctChange(5, null), '');
});

/* ---------------- the weekly ---------------- */
const TOTALS = { sales: 5890, spend: 3105, mer: 1.90, cm: 1784 }, PREV = { sales: 6958, spend: 3140, mer: 2.22, cm: 2620 };
await check('the weekly: title, the rule sentence, labelled bullets with ONE comparison each, contribution margin defined, This week, We need from you with dates, the link', () => {
  const t = weeklyPost({ brand: 'Grunk Dolfer', period: 'weekly', start: '2026-10-12', end: '2026-10-18', totals: { ...TOTALS, amer: 1.2 }, previous: { ...PREV, amer: 1.41 },
    this_week: ['Splatter Collection goes live Friday; the drop email goes today', 'Three Splatter ads into testing by Thursday'],
    from_you: [{ text: 'Is Splatter full price or a deal?', asked: '2026-10-13', due: '2026-10-22' }, 'Photos for Splatter Collection (live Fri Oct 23)'], url: 'https://tools.go-mobius-digital.com/profit/?reports=abc' });
  assert.equal(t, [
    '*Grunk Dolfer \u00b7 Weekly report, Oct 12 to 18*',
    '_A quieter week: sales down 15% on the same ad spend._',
    '', '*The week* (compared with the week before)',
    '\u2022 Sales: *$5,890* (down 15%)',
    '\u2022 Ad spend: *$3,105* (flat)',
    '\u2022 MER: *1.90x* (was 2.22x)',
    '\u2022 aMER (new customers): *1.20x* (was 1.41x)',
    '\u2022 Contribution margin: *$1,784* (was $2,620)',
    `_${CM_WORDS}_`,
    '', '*This week*',
    '\u2022 Splatter Collection goes live Friday; the drop email goes today',
    '\u2022 Three Splatter ads into testing by Thursday',
    '', '*We need from you*',
    '\u2022 Is Splatter full price or a deal? (asked Oct 13, needed by Oct 22)',
    '\u2022 Photos for Splatter Collection (live Fri Oct 23)',
    '', '<https://tools.go-mobius-digital.com/profit/?reports=abc|Open the full report>'].join('\n'));
  assert.ok(!/vs plan|Hey Team|Profit|\u25B2|\u25BC/.test(t), 'no plan comparison, no opener, no "Profit", no arrows');
});
await check('weekSentence: one fixed sentence per shape of the week, never a model', () => {
  assert.equal(weekSentence({ sales: 7318, spend: 3650, mer: 2.01 }, { sales: 6840, spend: 4680, mer: 1.46 }), 'Sales up 7% on 22% less ad spend, so each ad dollar brought back more.');
  assert.equal(weekSentence({ sales: 8000, spend: 4000, mer: 2 }, { sales: 7000, spend: 3200, mer: 2.19 }), 'Sales up 14% on 25% more ad spend, but each ad dollar brought back a little less.');
  assert.equal(weekSentence({ sales: 8000, spend: 4000, mer: 2 }, { sales: 7000, spend: 3450, mer: 2.03 }), 'Sales up 14% on 16% more ad spend, with each ad dollar bringing back about the same.');
  assert.equal(weekSentence({ sales: 6000, spend: 4000, mer: 1.5 }, { sales: 7000, spend: 3200, mer: 2.19 }), 'Sales down 14% on 25% more ad spend, so each ad dollar brought back less.');
  assert.equal(weekSentence({ sales: 7000, spend: 3200 }, { sales: 7000, spend: 3200 }), 'A steady week: sales and ad spend both about where they were.');
  assert.equal(weekSentence({ sales: 7000, spend: 2500, mer: 2.8 }, { sales: 7000, spend: 3200, mer: 2.19 }), 'Sales held on 22% less ad spend, so each ad dollar brought back more.');
  assert.equal(weekSentence({ sales: 7000 }, {}), null, 'nothing to compare = no sentence');
  assert.equal(weekSentence({ sales: 24000, spend: 9000 }, { sales: 20000, spend: 9000 }, 'month'), 'Sales up 20% on the same ad spend.');
});
await check('the weekly without a call: no This week block; the monthly says the month; contribution margin left out when CM is unknown; long asks are clipped, 3 at most', () => {
  const t = weeklyPost({ brand: 'Grunk Dolfer', period: 'monthly', start: '2026-09-01', totals: { sales: 24000, spend: 9000, mer: 2.67, cm: null }, previous: { sales: 20000, spend: 8000, mer: 2.5 }, url: 'https://x/y',
    from_you: ['aaaaa ' + 'word '.repeat(40), 'two', 'three', 'four'] });
  const L = t.split('\n');
  assert.equal(L[0], '*Grunk Dolfer \u00b7 September report*');
  assert.equal(L[1], '_Sales up 20% on 13% more ad spend, and it paid: each ad dollar brought back more._');
  assert.equal(L[3], '*The month* (compared with the month before)');
  assert.equal(L[4], '\u2022 Sales: *$24,000* (up 20%)');
  assert.ok(!t.includes('Contribution margin') && !t.includes('This month'), t);
  const asks = L.slice(L.indexOf('*We need from you*') + 1).filter(l => l.startsWith('\u2022'));
  assert.equal(asks.length, 3); assert.ok(asks[0].length <= 164 && asks[0].endsWith('...'), asks[0]);
});

/* ---------------- the calendar pieces for the weekly ---------------- */
await check('clientBits: confirmed dates in the window (7 days for the weekly) and the asks; no bot post to clients left in calendar.js', () => {
  const data = { items: [
    { act: 'brand_alpha', src: 'cal', kind: 'drop', name: 'Splatter Collection (name TBD)', status: 'conf', start: '2026-10-23', end: '2026-10-23', assets: false, offer: false },
    { act: 'brand_alpha', src: 'cal', kind: 'sale', name: 'Old sale', status: 'conf', start: '2026-10-01', end: null },
    { act: 'brand_alpha', src: 'cal', kind: 'drop', name: 'Far drop', status: 'conf', start: '2026-12-01' },
    { act: 'brand_beta', src: 'cal', kind: 'drop', name: 'Beta', status: 'conf', start: '2026-10-22' }], emails: [], brands: [] };
  const b = { id: 'brand_alpha', name: 'Alpha Golf' };
  const bits = clientBits(data, b, '2026-10-19');
  assert.deepEqual(bits.soon.map(e => e.name), ['Splatter Collection (name TBD)']);
  assert.deepEqual(clientBits(data, b, '2026-10-19', 3).soon, [], 'Oct 23 is outside a 3-day window');
  assert.deepEqual(clientBits(data, b, '2026-10-19', 6).soon.map(e => e.name), ['Splatter Collection (name TBD)'], 'inside 7 days');
  assert.deepEqual(bits.need, ['Photos for Splatter Collection (live Fri Oct 23)', 'What customers get with Splatter Collection: full price or a deal?', 'Is Old sale still running? It has no end date yet.']);
  const m = clientMessages(data, b, '2026-10-19');
  assert.equal(m.length, 1); assert.match(m[0].text, /Splatter Collection goes live/);
  const src = fs.readFileSync(path.join(here, 'src', 'calendar.js'), 'utf8');
  assert.ok(!src.includes("username: 'Mobius Digital'"), 'the Mobius Digital client branch is gone');
  assert.ok(!/getSetting\(env, 'calendarClient'\)/.test(src), 'calendarClient is not read');
  assert.ok(src.includes('export async function clientCalendarFor'));
});

/* ---------------- the weekly sends on the call's confirm ---------------- */
db.exec(`INSERT INTO reports (act_id, period, period_start, period_end, status, generated_at, summary, data_json) VALUES ('brand_alpha', 'weekly', '2026-10-12', '2026-10-18', 'draft', '2026-10-19T11:00:00Z', 'x', '{"totals":{"sales":1}}')`);
const env = { DB };
await ensureMeetings(env);
const mkMeeting = id => db.exec(`INSERT INTO p_meeting (id, title, date, kind, status, created_at, updated_at) VALUES ('${id}', 'Monday call', '2026-10-19', 'monday_call', 'extracted', '2026-10-19T13:00:00Z', '2026-10-19T13:00:00Z')`);
const calls = { sent: [], synced: [] };
const deps = review_first => ({
  listBrands: async () => [{ act_id: 'brand_alpha', name: 'Alpha Golf', slack_channel: null, brief_channel: 'C_ALPHA_CLIENT', review_first }],
  sendReport: async (e, act, start) => { calls.sent.push([act, start]); return { ok: true, channel: 'C_ALPHA_CLIENT' }; },
  slackSyncReport: async (e, act, start) => { calls.synced.push([act, start]); },
  createAsk: async () => 'rq_1', slackPost: async () => ({ ok: true }), slackApi: async () => ({ ok: false }),
});
await check('review_first OFF: confirming the call writes This week + From you on the open draft and sends the weekly at once', async () => {
  mkMeeting('m1');
  const r = await confirm(env, deps(false), { id: 'm1', summary: 'ok', brands: [{ brand_id: 'brand_alpha', this_week: ['Splatter goes live Friday'], need_from_client: ['Is Splatter full price or a deal?'] }] }, 'cole@go-mobius-digital.com');
  const row = db.prepare(`SELECT data_json FROM reports WHERE act_id = 'brand_alpha'`).get();
  const data = JSON.parse(row.data_json);
  assert.deepEqual(data.this_week, ['Splatter goes live Friday']); assert.deepEqual(data.need_from_you, ['Is Splatter full price or a deal?']);
  assert.deepEqual(calls.sent, [['brand_alpha', '2026-10-12']]);
  assert.equal(r.brands[0].report.sent, true);
  assert.equal(calls.synced.length, 0, 'sendReport redraws the card itself');
});
await check('review_first ON: the draft card is redrawn with the new text and nothing is sent until a person presses Send', async () => {
  calls.sent.length = 0; calls.synced.length = 0; mkMeeting('m2');
  await confirm(env, deps(true), { id: 'm2', summary: 'ok', brands: [{ brand_id: 'brand_alpha', this_week: ['Three Splatter ads into testing'] }] }, 'cole@go-mobius-digital.com');
  assert.equal(calls.sent.length, 0);
  assert.deepEqual(calls.synced, [['brand_alpha', '2026-10-12']]);
  assert.equal(db.prepare(`SELECT status FROM reports WHERE act_id = 'brand_alpha'`).get().status, 'draft');
});

/* ---------------- the worker: no auto send at 6am, the client Send-to-Slack target refused ---------------- */
await check('reportsPass drafts only, whatever review_first says; the 11am fallback and the call confirm are the only automatic sends', () => {
  const src = fs.readFileSync(path.join(here, 'src', 'worker.js'), 'utf8');
  const pass = src.slice(src.indexOf('async function reportsPass('), src.indexOf('async function reportFallbackPass('));
  assert.ok(!pass.includes('sendReport('), 'reportsPass never calls sendReport');
  assert.ok(src.includes('const REPORT_FALLBACK_HOUR = 11;'));
  const fb = src.slice(src.indexOf('async function reportFallbackPass('), src.indexOf('const metaIdOf'));
  assert.ok(fb.includes('if (a.review_first || internalOnly(a)) continue;'), 'review-first brands wait for a person');
  assert.ok(fb.includes("row?.status !== 'draft'"), 'only a draft is sent as it stands');
  const sb = src.slice(src.indexOf('async function sendBrief('), src.indexOf('async function brandHasClientLogin('));
  assert.ok(sb.includes('clientDailyFor(env, acct, date, text, full)') && sb.includes("addDays(date, -2)"), 'one day per post, missed days within two days get their own');
  assert.ok(!sb.includes('shortBriefText('), 'the old opener-and-numbers short post is not sent');
});
globalThis.fetch = async (url) => new Response(JSON.stringify({ error: 'offline: ' + url }), { status: 503 });
const AH = (await import('./src/worker.js')).default;
await check('Export > Send to Slack refuses the "client" target and no longer offers that channel', async () => {
  const envW = { DB, ADMIN_TOKEN: 'tok', SLACK_BOT_TOKEN: 'xoxb' };
  const call = (method, p, body) => AH.fetch(new Request(`https://ah.test${p}`, { method, headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), envW, { waitUntil() {} });
  const r = await call('POST', '/api/share/slack', { act: 'brand_alpha', to: 'client', png: 'x' });
  assert.equal(r.status, 400); assert.match((await r.json()).error, /Client channels only get the daily update/);
  const g = await call('GET', '/api/share/slack?act=brand_alpha');
  assert.equal(g.status, 200); const j = await g.json(); assert.equal(j.client, null, JSON.stringify(j));
});

/* ---------------- the one-channel guards ---------------- */
await check('a brand whose internal channel is its client channel has no internal channel for any tick', async () => {
  const one = { act_id: 'b1', name: 'One', slack_channel: 'C_SAME', brief_channel: 'C_SAME' }, two = { act_id: 'b2', name: 'Two', slack_channel: 'C_IN', brief_channel: 'C_CL' };
  assert.equal(oneChannel(one), true); assert.equal(oneChannel(two), false);
  assert.equal(internalChannel(one), null); assert.equal(internalChannel(two), 'C_IN'); assert.equal(internalChannel({ slack_channel: null }), null);
  const chans = await allowedChannels({}, { listAccounts: async () => [one, two], getSetting: async () => 'C0STRAT' });
  assert.deepEqual([...chans.keys()], ['C_IN', 'C0STRAT']);
  for (const [f, needle] of [['alerts.js', "a.slack_channel !== a.brief_channel) return a.slack_channel"], ['actions.js', 'brand.slack_channel !== brand.brief_channel ? brand.slack_channel : null'], ['minoff.js', 'a.slack_channel === a.brief_channel) { st.acts[a.act_id]'],
    ['asana-brand.js', 'acct.slack_channel === acct.brief_channel) acct.slack_channel = null'], ['calendar.js', 'b.channel === b.client_channel) continue'], ['worker.js', 'internalChannel(a) || def']]) {
    assert.ok(fs.readFileSync(path.join(here, 'src', f), 'utf8').includes(needle), `${f} guards the one-channel brand`);
  }
});

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
