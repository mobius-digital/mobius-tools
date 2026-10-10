/* Offline checks for src/survey.js (post-purchase survey: Fairing and KnoCommerce vs Triple Whale).
 * Fairing and KnoCommerce are mocked; no real call is made.
 *   node test-survey.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const db = new DatabaseSync(':memory:');
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied */ } } };
load(path.join(here, 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'migrations', 'brand-001.sql'));
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : v]));
const DB = { prepare(sql) { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } }; } };
const env = { DB };

/* Triple Whale's orders for the brand: 10 orders with their lastPlatformClick source. */
const day = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
const TW = { 1001: 'meta', 1002: 'meta', 1003: 'meta', 1004: 'google', 1005: 'google', 1006: 'organic', 1007: 'organic', 1008: 'tiktok', 1009: 'klaviyo', 1010: 'meta' };
for (const [id, src] of Object.entries(TW)) db.prepare(`INSERT INTO tw_orders (act_id, order_id, customer_id, date, total, source) VALUES ('brand_a', ?, 'c', ?, 50, ?)`).run(String(id), day, src);

/* What each order's customer said (Fairing, question 7 = how did you hear), plus a second question on a few orders. */
const SAID = { 1001: 'Facebook', 1002: 'Instagram', 1003: 'TikTok', 1004: 'Google search', 1005: 'Friend or family', 1006: 'Podcast', 1007: 'Other', 1008: 'TikTok', 1009: 'Instagram', 1010: 'Facebook', 1011: 'YouTube' };
const at = (i) => new Date(Date.now() - (3 * 864e5) + i * 1000).toISOString();
let n = 0;
const FAIR = [
  ...Object.entries(SAID).map(([oid, ans]) => ({ id: `r${++n}`, inserted_at: at(n), question: 'How did you hear about us?', question_id: 7, response: ans, other: ans === 'Other', other_response: ans === 'Other' ? 'my golf buddy told me' : null, order_id: oid === '1011' ? 'gid://shopify/Order/99999' : oid, customer_id: 'c' + oid, email: 'secret@person.com' })),
  ...['Price', 'Design', 'Price', 'Price', 'Design', 'Reviews'].map((ans, i) => ({ id: `q${i}`, inserted_at: at(50 + i), question: 'What made you buy today?', question_id: 9, response: ans, order_id: String(1001 + i) })),
];
const KEY = 'fairing_secret_token_abc123';
let fcalls = [];
const fairing = async (url, init = {}) => {
  const u = new URL(url); fcalls.push(u.search);
  if (init.headers.Authorization !== KEY) return new Response(JSON.stringify({ message: 'Unauthorized', status: 401 }), { status: 401 });
  assert.equal(u.origin + u.pathname, 'https://app.fairing.co/api/responses');
  const min = u.searchParams.get('inserted_at_min'), after = u.searchParams.get('starting_after'), limit = +u.searchParams.get('limit') || 100;
  let list = FAIR.filter(r => !min || r.inserted_at > min).sort((a, b) => a.inserted_at.localeCompare(b.inserted_at));
  if (after) list = list.slice(list.findIndex(r => r.id === after) + 1);
  const page = list.slice(0, Math.min(limit, 10));       // pages of 10 so the cursor is exercised
  const next = list.length > page.length ? `https://app.fairing.co/api/responses?${new URLSearchParams({ ...(min ? { inserted_at_min: min } : {}), sort: 'inserted_at_asc', limit: String(limit), starting_after: page[page.length - 1].id })}` : null;
  return new Response(JSON.stringify({ data: page, next, prev: null }));
};

const sv = await import('./src/survey.js');
sv.useFetch(fairing);
const checks = [];
async function check(name, fn) { try { await fn(); checks.push(true); console.log('PASS ', name); } catch (e) { checks.push(false); console.log('FAIL ', name, '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }

await check('answers map to the seven channels', async () => {
  const cases = { 'Facebook': 'facebook_instagram', 'Instagram ad': 'facebook_instagram', 'TikTok': 'tiktok', 'Tik Tok': 'tiktok', 'Google search': 'google_youtube', 'YouTube': 'google_youtube',
    'A podcast': 'podcast', 'Friend or family': 'word_of_mouth', 'my golf buddy told me': 'word_of_mouth', 'Influencer': 'influencer', 'A YouTuber I follow': 'influencer', 'Billboard': 'other', '': 'other' };
  for (const [a, c] of Object.entries(cases)) assert.equal(sv.channelOf(a), c, a);
  assert.equal(sv.twChannel('meta'), 'facebook_instagram'); assert.equal(sv.twChannel('organic'), null); assert.equal(sv.twChannel('klaviyo'), 'other_click:klaviyo');
});
await check('not connected: the report says so and makes no call', async () => {
  const r = await sv.surveyReport(env, 'brand_a'); assert.equal(r.error, 'not_linked'); assert.equal(fcalls.length, 0);
});
await check('a short or wrong Fairing key is refused and nothing is stored', async () => {
  await assert.rejects(() => sv.storeFairing(env, 'brand_a', 'short'), /too short/);
  await assert.rejects(() => sv.storeFairing(env, 'brand_a', 'x'.repeat(30)), /refused the key/);
  assert.equal(await sv.surveyDoc(env, 'brand_a', 'fairing'), null);
});
await check('a good key is checked with one read, kept, and never in the report', async () => {
  fcalls = [];
  await sv.storeFairing(env, 'brand_a', ` ${KEY} `);
  assert.equal(fcalls.length, 1); assert.match(fcalls[0], /limit=1/);
  assert.equal((await sv.surveyDoc(env, 'brand_a', 'fairing')).key, KEY);
  assert.deepEqual((await sv.surveyStatus(env, 'brand_a')).fairing.has, true);
});
let rep;
await check('first read pulls every page (cursor followed), picks the "how did you hear" question by its answers', async () => {
  fcalls = [];
  rep = await sv.surveyReport(env, 'brand_a', { from: new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10) });
  assert.equal(fcalls.length, 2, 'two pages of 10'); assert.match(fcalls[1], /starting_after=/);
  assert.equal(rep.provider, 'fairing'); assert.equal(rep.question.id, '7'); assert.equal(rep.questions.length, 2);
  assert.equal(rep.responses, 11); assert.equal(rep.matched, 10, 'the gid order is not in Triple Whale'); assert.equal(rep.with_order, 11);
  assert.ok(!JSON.stringify(rep).includes(KEY), 'no key'); assert.ok(!JSON.stringify(rep).includes('secret@person.com'), 'no email');
});
await check('agreement and per-channel shares against Triple Whale lastPlatformClick', async () => {
  const c = Object.fromEntries(rep.channels.map(x => [x.key, x]));
  /* Agree: 1001 meta/FB, 1002 meta/IG, 1004 google/google, 1008 tiktok/tiktok, 1010 meta/FB = 5 of 10. */
  assert.equal(rep.agreement, 50);
  /* Paid in TW: 1001-1005, 1008, 1010 = 7, of which 5 agree. */
  assert.equal(rep.paid_matched, 7); assert.equal(rep.agreement_paid, 71.4);
  assert.equal(c.facebook_instagram.said, 4); assert.equal(c.facebook_instagram.tw, 4); assert.equal(c.facebook_instagram.agree, 3);
  assert.equal(c.tiktok.said, 2); assert.equal(c.tiktok.tw, 1); assert.equal(c.tiktok.said_share, 20); assert.equal(c.tiktok.tw_share, 10); assert.equal(c.tiktok.gap_pts, 10);
  assert.equal(c.word_of_mouth.said, 2, 'friend + the typed "golf buddy"'); assert.equal(c.podcast.said, 1);
  assert.equal(c.google_youtube.said_all, 2, 'Google + YouTube, all answers'); assert.equal(c.google_youtube.said, 1);
  const tw = Object.fromEntries(rep.tw_other.map(x => [x.key, x.tw]));
  assert.equal(tw.no_click, 2); assert.equal(tw.klaviyo, 1);
  assert.ok(rep.thin, 'under 30 matched'); assert.ok(rep.answers.some(a => a.answer === 'my golf buddy told me'));
});
await check('a second open within 6 hours makes no call; fresh reads only what is new', async () => {
  fcalls = [];
  await sv.surveyReport(env, 'brand_a'); assert.equal(fcalls.length, 0);
  FAIR.push({ id: 'new1', inserted_at: new Date().toISOString(), question: 'How did you hear about us?', question_id: 7, response: 'Podcast', order_id: '1007' });
  const r = await sv.surveyReport(env, 'brand_a', { fresh: true });
  assert.equal(fcalls.length, 1); assert.match(decodeURIComponent(fcalls[0]), /inserted_at_min=\d{4}-/);
  assert.equal(r.responses, 12);
});
await check('a question can be pinned and unpinned', async () => {
  await sv.setSurveyQuestion(env, 'brand_a', '9');
  const r = await sv.surveyReport(env, 'brand_a'); assert.equal(r.question.id, '9'); assert.equal(r.question.pinned, true);
  await sv.setSurveyQuestion(env, 'brand_a', '');
  assert.equal((await sv.surveyReport(env, 'brand_a')).question.id, '7');
});
await check('a failed sync keeps the cursor and the last answers', async () => {
  const before = (await sv.surveyReport(env, 'brand_a')).responses;
  sv.useFetch(async () => new Response('boom', { status: 500 }));
  const r = await sv.surveyReport(env, 'brand_a', { fresh: true });
  assert.match(r.sync_error, /Fairing answered 500/); assert.equal(r.responses, before);
  sv.useFetch(fairing);
});
await check('forget removes the key and the answers', async () => {
  await sv.forgetSurvey(env, 'brand_a', 'fairing');
  assert.equal((await sv.surveyReport(env, 'brand_a')).error, 'not_linked');
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM survey_responses WHERE act_id = 'brand_a'`).get().n, 0);
});

/* ---------- KnoCommerce (shape from Kno's OpenAPI spec v1.3.0) ---------- */
let kcalls = [], tokens = 0;
const KNO = [
  { id: 'k1', created_at: at(1), updated_at: at(1), completed_at: at(1), customer_id: '5', survey_id: 's', order: { id: 'gid://shopify/Order/1001', name: '#1001' }, response: [{ questionId: 'qa', label: 'How did you hear about us?', value: 'Instagram' }] },
  { id: 'k2', created_at: at(2), updated_at: at(2), completed_at: at(2), customer_id: '6', survey_id: 's', order: { id: '1006' }, response: [{ questionId: 'qa', label: 'How did you hear about us?', value: 'Other', other: true, otherValue: 'A podcast I listen to' }] },
  { id: 'k3', created_at: at(3), updated_at: at(3), completed_at: at(3), customer_id: '7', survey_id: 's', order: { id: '1008' }, response: [{ questionId: 'qa', label: 'How did you hear about us?', value: ['TikTok'] }] },
];
const kno = async (url, init = {}) => {
  const u = new URL(url);
  if (u.pathname === '/api/oauth2/token') {
    kcalls.push('token');
    assert.equal(init.method, 'POST'); assert.equal(u.searchParams.get('grant_type'), 'client_credentials'); assert.match(u.searchParams.get('scope'), /RESPONSES/);
    if (init.headers.Authorization !== 'Basic ' + Buffer.from('cid_1:sec_2').toString('base64')) return new Response(JSON.stringify({ error: 'invalid_authorization_header' }), { status: 400 });
    return new Response(JSON.stringify({ token_type: 'bearer', expires_in: 3600, access_token: 'tok' + (++tokens), scope: 'RESPONSES' }));
  }
  assert.equal(u.origin + u.pathname, 'https://app-api.knocommerce.com/api/rest/responses');
  kcalls.push(u.search);
  if (init.headers.Authorization === 'Bearer tok1' && tokens === 1 && kcalls.filter(x => x !== 'token').length === 1) return new Response('', { status: 401 });   // expired once: refresh
  assert.ok(u.searchParams.get('updatedAt[gte]')); assert.equal(u.searchParams.get('expand'), 'order');
  const page = u.searchParams.get('pageToken') ? KNO.slice(2) : KNO.slice(0, 2);
  return new Response(JSON.stringify({ results: page, nextPageToken: u.searchParams.get('pageToken') ? null : 'p2', hasMore: !u.searchParams.get('pageToken') }));
};
sv.useFetch(kno);
await check('Kno: one box takes client_id:client_secret; a bad pair or a bad format is refused', async () => {
  await assert.rejects(() => sv.storeKno(env, 'brand_a', 'nocolon'), /client_id:client_secret/);
  await assert.rejects(() => sv.storeKno(env, 'brand_a', 'cid_1:wrong'), /refused the client ID/);
  await sv.storeKno(env, 'brand_a', 'cid_1:sec_2');
  const d = await sv.surveyDoc(env, 'brand_a', 'knocommerce'); assert.equal(d.client_id, 'cid_1');
});
await check('Kno: token refreshed on a 401, both pages read, answers and orders parsed', async () => {
  kcalls = [];
  const r = await sv.surveyReport(env, 'brand_a', { from: new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10) });
  assert.equal(r.provider, 'knocommerce'); assert.equal(r.sync_error, null);
  assert.ok(kcalls.includes('token'), 'refreshed'); assert.ok(kcalls.some(x => /pageToken=p2/.test(x)), 'second page');
  assert.equal(r.responses, 3); assert.equal(r.matched, 3, 'gid order ids match Triple Whale ids');
  const c = Object.fromEntries(r.channels.map(x => [x.key, x]));
  assert.equal(c.podcast.said, 1, 'typed other answer'); assert.equal(c.tiktok.agree, 1); assert.equal(c.facebook_instagram.agree, 1);
  assert.equal(r.agreement, 66.7);
  assert.ok(!JSON.stringify(r).includes('sec_2') && !/\btok\d/.test(JSON.stringify(r)), 'no secret or token');
});

const ok = checks.filter(Boolean).length;
console.log(`\n${ok}/${checks.length} passed`);
if (ok !== checks.length) process.exit(1);
