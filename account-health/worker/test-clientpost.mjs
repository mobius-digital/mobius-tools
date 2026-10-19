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
import { dailyPost, weeklyPost, headlineOf, sentenceOf, dailyVerdict, pctChange, shortMoney, oneChannel, internalChannel } from './src/clientpost.js';
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
await check('the daily is six lines: day, numbers with one verdict word, headline, month line, Next; no opener', () => {
  const t = dailyPost({ brand: 'Dartee Golf', date: '2026-10-17', headline: 'Quiet Saturday: no repeat buyers at all, so the day only just paid for itself', day: DAY, month: MONTH, others: [1018, 1438, 822], next: 'Ahsan steps Meta back up Monday if the cost per new customer holds.' });
  const L = t.split('\n');
  assert.equal(L.length, 5, t);   // five lines of text: the audit's six counts the thread pointer, which is the reply
  assert.equal(L[0], '*Dartee Golf · Saturday, Oct 17*');
  assert.equal(L[1], 'Sales *$719* · Ads *$489* · *1.47x*   under plan');
  assert.equal(L[2], 'Quiet Saturday: no repeat buyers at all, so the day only just paid for itself');
  assert.equal(L[3], 'October: $19.6K of $30.6K planned, 17 days in.');
  assert.equal(L[4], '*Next:* Ahsan steps Meta back up Monday if the cost per new customer holds.');
  assert.ok(!/Hey Team|→|%/.test(t), 'no opener, no arrow, no percentages');
  assert.ok(!/[—–]/.test(t), 'no em dashes');
});
await check('no Next line when nobody wrote one; no headline line on a v1 brief; "best day this month" beats the plan read', () => {
  const t = dailyPost({ brand: 'Dartee Golf', date: '2026-10-17', headline: null, day: { ...DAY, sales: 1500 }, month: MONTH, others: [1018, 1438, 822], next: '' });
  const L = t.split('\n');
  assert.equal(L.length, 3, t);
  assert.equal(L[1], 'Sales *$1,500* · Ads *$489* · *1.47x*   best day this month');
  assert.equal(dailyVerdict({ sales: 1900, plan: 1800, others: [2500, 2200] }), 'on plan');
  assert.equal(dailyVerdict({ sales: 1700, plan: 1800, others: [2500, 2200] }), 'under plan');
  assert.equal(dailyVerdict({ sales: 1700, plan: null, others: [2500, 2200] }), null, 'no plan, no word');
  assert.equal(dailyVerdict({ sales: 1700, plan: null, others: [900] }), null, 'one other day is not a month');
  const noGoal = dailyPost({ brand: 'B', date: '2026-10-03', day: DAY, month: { ym: '2026-10', sales: 2400, goal: null, day_of_month: 3 } });
  assert.match(noGoal, /October so far: \$2,400, 3 days in\./);
});
await check('headlineOf reads the stored brief\'s bold line after the opener; shortMoney and pctChange', () => {
  assert.equal(headlineOf('Hey Team :wave: Here\'s the Daily Update for October 17 →\n*Friday only just paid for itself*\n\n*October 17*\nNet Sales: $719'), 'Friday only just paid for itself');
  assert.equal(headlineOf('Hey Team :wave: Here\'s the Daily Update for October 17 →\n\n*October 17*'), null, 'a v1 brief has no headline');
  assert.equal(shortMoney(19574), '$19.6K'); assert.equal(shortMoney(7318), '$7,318'); assert.equal(shortMoney(30000), '$30K');
  assert.equal(pctChange(5890, 6958), '▼15%'); assert.equal(pctChange(3105, 3140), 'flat'); assert.equal(pctChange(7318, 6840), '▲7%'); assert.equal(pctChange(5, null), '');
});

/* ---------------- the weekly ---------------- */
const TOTALS = { sales: 5890, spend: 3105, mer: 1.90, cm: 1784 }, PREV = { sales: 6958, spend: 3140, mer: 2.22, cm: 2620 };
await check('the weekly: brand and week, four numbers with ONE comparison each, one sentence, This week, From you, the link', () => {
  const t = weeklyPost({ brand: 'Grunk Dolfer', period: 'weekly', start: '2026-10-12', totals: TOTALS, previous: PREV,
    sentence: 'A slower week: same spend, fewer sales, mostly from the Burgundy drop cooling off.',
    this_week: ['Splatter Collection goes live Friday; the drop email goes today', 'Three Splatter ads into testing by Thursday', 'Splatter Collection goes live Fri Oct 23'],
    from_you: ['Is Splatter full price or a deal? Need it by Wednesday.'], url: 'https://tools.go-mobius-digital.com/profit/?reports=abc' });
  const L = t.split('\n');
  assert.equal(L[0], '*Grunk Dolfer · week of Oct 12*');
  assert.equal(L[1], 'Sales *$5,890* ▼15% · Ads *$3,105* flat · *1.90x* (was 2.22x) · Profit *$1,784* ▼32%');
  assert.equal(L[2], 'A slower week: same spend, fewer sales, mostly from the Burgundy drop cooling off.');
  assert.equal(L[3], '*This week*');
  assert.equal(L[4], '• Splatter Collection goes live Friday; the drop email goes today');
  assert.equal(L[6], '• Splatter Collection goes live Fri Oct 23');
  assert.equal(L[7], '*From you:* Is Splatter full price or a deal? Need it by Wednesday.');
  assert.equal(L[8], '<https://tools.go-mobius-digital.com/profit/?reports=abc|Open the report>');
  assert.equal(L.length, 9);
  assert.ok(!/vs plan|Hey Team/.test(t), 'no plan comparison, no opener');
  assert.equal((t.match(/%/g) || []).length, 2, 'one comparison per number (spend is flat), MER as (was x)');
});
await check('the weekly without a call: no This week block at all; the monthly says the month; profit left out when CM is unknown', () => {
  const t = weeklyPost({ brand: 'Grunk Dolfer', period: 'monthly', start: '2026-09-01', totals: { sales: 24000, spend: 9000, mer: 2.67, cm: null }, previous: { sales: 20000, spend: 8000, mer: 2.5 }, sentence: null, this_week: [], from_you: [], url: 'https://x/y' });
  const L = t.split('\n');
  assert.equal(L[0], '*Grunk Dolfer · September*');
  assert.equal(L[1], 'Sales *$24,000* ▲20% · Ads *$9,000* ▲13% · *2.67x* (was 2.50x)');
  assert.equal(L[2], '<https://x/y|Open the report>');
  assert.equal(L.length, 3);
});
await check('sentenceOf borrows the first sentence of What it means from the frozen summary', () => {
  const s = 'What we saw\n• Sales fell 15% on the same spend.\nWhat it means\nThe Burgundy drop cooled off and nothing replaced it, so the same ad money bought fewer sales. Next week the Splatter launch should lift it.\nWhat we\'re doing\n• Three ads into testing.';
  assert.equal(sentenceOf(s), 'The Burgundy drop cooled off and nothing replaced it, so the same ad money bought fewer sales.');
  assert.equal(sentenceOf('nothing here'), null);
  assert.equal(sentenceOf('What we saw\n• x.\n\nWhat it means\n\nSame spend bought fewer sales. More.'), 'Same spend bought fewer sales.', 'a blank line after the title is fine');
  const big = weeklyPost({ brand: 'D', start: '2026-10-12', totals: { sales: 7318, spend: 3650, mer: 2.01, cm: 1907 }, previous: { sales: 6840, spend: 4680, mer: 1.46, cm: 355 } }).split('\n')[1];
  assert.equal(big, 'Sales *$7,318* ▲7% · Ads *$3,650* ▼22% · *2.01x* (was 1.46x) · Profit *$1,907* (was $355)', 'profit past a 100% swing reads "was"');
});

/* ---------------- the calendar pieces for the weekly ---------------- */
await check('clientBits: confirmed dates in 14 days and the asks, one computation shared with the preview; no bot post to clients left in calendar.js', () => {
  const data = { items: [
    { act: 'brand_alpha', src: 'cal', kind: 'drop', name: 'Splatter Collection (name TBD)', status: 'conf', start: '2026-10-23', end: '2026-10-23', assets: false, offer: false },
    { act: 'brand_alpha', src: 'cal', kind: 'sale', name: 'Old sale', status: 'conf', start: '2026-10-01', end: null },
    { act: 'brand_alpha', src: 'cal', kind: 'drop', name: 'Far drop', status: 'conf', start: '2026-12-01' },
    { act: 'brand_beta', src: 'cal', kind: 'drop', name: 'Beta', status: 'conf', start: '2026-10-22' }], emails: [], brands: [] };
  const b = { id: 'brand_alpha', name: 'Alpha Golf' };
  const bits = clientBits(data, b, '2026-10-19');
  assert.deepEqual(bits.soon.map(e => e.name), ['Splatter Collection (name TBD)']);
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
