/* Offline checks for the Monday account review (review.js, 2026-10-10): the prompt, the switch (off by default),
 * Monday + hour gating, paused brands and the test account never reviewed, internal channel only (never the client
 * channel), Apply cards in the thread capped, two brands an hour, once per brand per Monday, the subrequest budget,
 * a failed brand tried once more then left, and the routes (admin only, toggle, dry-run preview posts nothing).
 * In-memory SQLite for settings; the Strategist (engine.answerWeb) and Slack are mocked. Nothing real is called.
 *   node test-review.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reviewPrompt, reviewBrands, reviewTick, handleReview, MAX_CARDS, MAX_PER_TICK } from './src/review.js';

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
const env = { DB: { prepare: () => { throw new Error('review.js should not query D1 directly'); } } };
const getSetting = async (e, k) => db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k)?.value ?? null;
const putSetting = async (e, k, v) => { db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).run(k, v); };

/* ---------------- brands: three to review, paused ones, one without a channel, one pointing at its client channel ---------------- */
const ACCTS = [
  { act_id: 'brand_lucky', name: 'Lucky Golf', slack_channel: 'CLUCKYINT1', brief_channel: 'CLUCKYCLI1' },
  { act_id: 'brand_bonk', name: 'Bonk Golf', slack_channel: 'CBONKINT01', brief_channel: 'CBONKCLI01' },
  { act_id: 'brand_party', name: 'Party Patch', slack_channel: 'CPARTYINT1', brief_channel: 'CPARTYCLI1' },
  { act_id: 'brand_galway', name: 'Galway Bay', slack_channel: 'CGALWAYIN1', brief_channel: 'CGALWAYCL1' },
  { act_id: 'brand_sock', name: 'The Golf Sock', slack_channel: 'CSOCKINT01', brief_channel: '' },
  { act_id: 'brand_pickle', name: 'Le Pickle Club', slack_channel: 'CPICKLEIN1', brief_channel: '' },
  { act_id: 'brand_nochan', name: 'Dartee', slack_channel: '', brief_channel: 'CDARTEECL1' },
  { act_id: 'brand_same', name: 'Grunk Dolfer', slack_channel: 'CGRUNKSAM1', brief_channel: 'CGRUNKSAM1' },
];
const CLIENT_CHANNELS = new Set(ACCTS.map(a => a.brief_channel).filter(Boolean));

/* ---------------- clock: Monday 2026-10-12 ---------------- */
let TODAY = '2026-10-12', HOUR = 11;
/* ---------------- mocks ---------------- */
const asked = [];
let FAIL = new Set();
const proposal = (b, i) => ({ id: `p_${b}_${i}`, action: 'meta_budget', summary: `Raise ${b} ad set ${i} budget`, detail: 'Because it is working.' });
const engine = {
  answerWeb: async (e, q, hist, h, extra) => {
    asked.push({ q, extra });
    const id = extra?.screen?.act_id;
    if (FAIL.has(id)) return { error: 'model overloaded' };
    return { answer: `Where ${id} stands: on goal.\n\n**The week**\n- one thing`, proposals: Array.from({ length: 6 }, (_, i) => proposal(id, i + 1)), cost: 0.62, costLine: '$0.62 · Opus 5.5 · 9 steps · 61s', model: 'claude-opus-5-5' };
  },
  proposalBlocks: p => [{ type: 'section', text: { type: 'mrkdwn', text: `*${p.summary}*` } }, { type: 'actions', elements: [{ type: 'button', action_id: 'ask_apply', value: JSON.stringify({ askp: p.id, app: 'locus' }) }] }],
};
const slackCalls = [];
let SLACK_SCOPE_FAIL = false;
const slackApi = async (e, method, p) => {
  slackCalls.push({ method, p });
  if (SLACK_SCOPE_FAIL && p.username) return { ok: false, error: 'missing_scope' };
  return { ok: true, ts: '1790000000.' + String(slackCalls.length).padStart(6, '0') };
};
let AFFORD = true, ADMIN = true;
const d = {
  getSetting, putSetting, slackApi, listAccounts: async (e, active) => ACCTS.map(a => ({ ...a })),
  centralDate: () => TODAY, centralHour: () => HOUR, briefHour: async () => 9,
  subCanAfford: () => AFFORD, strategist: () => ({ engine, h: () => ({}) }),
  isAdmin: async () => ADMIN, sessionEmail: async () => 'cole@go-mobius-digital.com',
};
const json = (o, status = 200) => ({ status, body: o });
const req = (method, path, body) => ({ method, url: 'https://ah.internal' + path, json: async () => body || {} });
const state = async () => JSON.parse((await getSetting(env, 'mondayReviewDone')) || '{}');

let n = 0;
const check = async (name, fn) => { await fn(); n++; console.log('ok', n, name); };

await check('the prompt names the brand, every source, the ad set rule, the card cap, internal only; no em dashes', async () => {
  const p = reviewPrompt({ act_id: 'brand_lucky', name: 'Lucky Golf' }, TODAY);
  for (const s of ['brand_lucky', '/api/hub/command?act=brand_lucky', '/api/hub/yesterday?act=brand_lucky', 'plan view', 'creatives view', 'meta_read', 'stock view', 'calendar view', 'next 14 days', 'changes view', 'Never cut the anchor', 'INTERNAL', `at most ${MAX_CARDS}`, 'Triple Whale'])
    assert.ok(p.includes(s), s);
  const DASH = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');
  assert.ok(!DASH.test(p));
  for (const f of ['src/review.js', '../../profit/strategist.js']) assert.ok(!DASH.test(fs.readFileSync(new URL(f, import.meta.url), 'utf8')), `no em dash in ${f}`);
});

await check('the brand list: paused brands and the test account are never in it; no channel and client channel are skipped', async () => {
  const bs = await reviewBrands(env, d);
  const names = bs.map(b => b.name);
  for (const x of ['Galway Bay', 'The Golf Sock', 'Le Pickle Club']) assert.ok(!names.includes(x), x);
  assert.equal(bs.find(b => b.act_id === 'brand_nochan').skip, 'no internal Slack channel set');
  assert.equal(bs.find(b => b.act_id === 'brand_same').skip, 'its internal channel is the client channel');
  assert.equal(bs.filter(b => !b.skip).length, 3);
});

await check('off by default: nothing asked, nothing posted', async () => {
  const r = await reviewTick(env, d);
  assert.equal(r.off, true);
  assert.equal(asked.length, 0); assert.equal(slackCalls.length, 0);
});

await putSetting(env, 'mondayReview', 'on');

await check('on, but not Monday or before the reports hour: waits', async () => {
  TODAY = '2026-10-13';
  assert.equal((await reviewTick(env, d)).notMonday, true);
  TODAY = '2026-10-12'; HOUR = 10;
  assert.equal((await reviewTick(env, d)).waiting, true);
  assert.equal(asked.length, 0);
  HOUR = 11;
});

await check('the budget: no room = deferred before any brand starts (skips still written down)', async () => {
  AFFORD = false;
  const r = await reviewTick(env, d);
  assert.equal(r.deferred, true); assert.equal(asked.length, 0); assert.equal(slackCalls.length, 0);
  assert.equal(r.skipped.length, 2, 'brands that cannot be reviewed are written down at no cost');
  AFFORD = true;
});

await check(`Monday 11am: ${MAX_PER_TICK} brands, one message each to the INTERNAL channel, Apply cards in the thread, capped`, async () => {
  const r = await reviewTick(env, d);
  assert.deepEqual(r.ran, ['Lucky Golf', 'Bonk Golf']);
  assert.equal(r.deferred, true);
  assert.equal(r.skipped.length, 0, 'already written down');
  assert.equal(asked.length, 2);
  assert.equal(asked[0].extra.screen.act_id, 'brand_lucky');   // strat_run records the brand (strattools brandOfCtx)
  assert.equal(asked[0].extra.who, 'Monday review');            // and who
  const tops = slackCalls.filter(c => !c.p.thread_ts), cards = slackCalls.filter(c => c.p.thread_ts);
  assert.equal(tops.length, 2);
  assert.deepEqual(tops.map(c => c.p.channel), ['CLUCKYINT1', 'CBONKINT01']);
  for (const c of slackCalls) assert.ok(!CLIENT_CHANNELS.has(c.p.channel), 'never a client channel');
  assert.ok(tops[0].p.blocks[0].text.text.includes('Monday review: Lucky Golf'));
  assert.ok(JSON.stringify(tops[0].p.blocks).includes(`${MAX_CARDS} suggested changes in the thread`));
  assert.ok(!JSON.stringify(tops[0].p.blocks).includes('ask_apply'), 'the read itself carries no Apply button (a tap would replace it)');
  assert.equal(cards.length, MAX_CARDS * 2);
  assert.ok(cards.every(c => c.p.blocks.some(b => b.type === 'actions' && b.elements[0].action_id === 'ask_apply')));
  const st = await state();
  assert.equal(st.acts.brand_lucky.status, 'ok'); assert.equal(st.acts.brand_lucky.cards, MAX_CARDS); assert.equal(st.acts.brand_lucky.cost, 0.62);
  assert.equal(st.acts.brand_nochan.status, 'skipped');
});

await check('the next hour finishes the last brand; after that nothing runs again that Monday', async () => {
  HOUR = 12; asked.length = 0; slackCalls.length = 0;
  const r = await reviewTick(env, d);
  assert.deepEqual(r.ran, ['Party Patch']);
  HOUR = 13; asked.length = 0; slackCalls.length = 0;
  const r2 = await reviewTick(env, d);
  assert.deepEqual(r2.ran, []); assert.equal(asked.length, 0); assert.equal(slackCalls.length, 0);
});

await check('a failed answer is tried once more next hour, then left; nothing is posted for it', async () => {
  TODAY = '2026-10-19'; HOUR = 11; asked.length = 0; slackCalls.length = 0; FAIL = new Set(['brand_lucky']);
  const r = await reviewTick(env, d);
  assert.equal(r.errors.length, 1); assert.deepEqual(r.ran, ['Bonk Golf']);
  assert.ok(!slackCalls.some(c => c.p.channel === 'CLUCKYINT1'));
  HOUR = 12; await reviewTick(env, d);
  HOUR = 13; asked.length = 0; await reviewTick(env, d);
  assert.ok(!asked.some(a => a.extra.screen.act_id === 'brand_lucky'), 'two tries, then left');
  const st = await state();
  assert.equal(st.acts.brand_lucky.status, 'error'); assert.equal(st.acts.brand_lucky.tries, 2);
  FAIL = new Set();
});

await check('the Strategist name not allowed: posts again under the app name', async () => {
  TODAY = '2026-10-26'; HOUR = 11; slackCalls.length = 0; SLACK_SCOPE_FAIL = true;
  const r = await reviewTick(env, d);
  assert.deepEqual(r.ran, ['Lucky Golf', 'Bonk Golf']);
  assert.ok(slackCalls.some(c => !c.p.username && !c.p.thread_ts && c.p.channel === 'CLUCKYINT1'));
  SLACK_SCOPE_FAIL = false;
});

await check('routes: admin only; GET shows the switch and this Monday; PUT turns it off', async () => {
  ADMIN = false;
  assert.equal((await handleReview(req('GET', '/api/ask/review'), env, '/api/ask/review', json, d)).status, 401);
  ADMIN = true;
  assert.equal(await handleReview(req('GET', '/api/ask/schedules'), env, '/api/ask/schedules', json, d), null);
  const g = await handleReview(req('GET', '/api/ask/review'), env, '/api/ask/review', json, d);
  assert.equal(g.body.on, true); assert.ok(/11am Central/.test(g.body.when));
  assert.equal(g.body.brands.find(b => b.act_id === 'brand_lucky').today.status, 'ok');
  const p = await handleReview(req('PUT', '/api/ask/review', { on: false }), env, '/api/ask/review', json, d);
  assert.equal(p.body.on, false);
  assert.equal(await getSetting(env, 'mondayReview'), 'off');
  TODAY = '2026-11-02'; assert.equal((await reviewTick(env, d)).off, true);
});

await check('preview: one brand, built and returned, posted nowhere, recorded as a preview; paused brands refused', async () => {
  slackCalls.length = 0; asked.length = 0;
  const r = await handleReview(req('POST', '/api/ask/review/preview', { act: 'brand_party' }), env, '/api/ask/review/preview', json, d);
  assert.equal(r.status, 200);
  assert.equal(r.body.dry, true); assert.equal(r.body.proposals.length, MAX_CARDS); assert.ok(r.body.text.includes('brand_party'));
  assert.equal(r.body.channel, 'CPARTYINT1');
  assert.equal(slackCalls.length, 0);
  assert.equal(asked[0].extra.who, 'cole@go-mobius-digital.com (preview)');
  assert.equal(JSON.parse(await getSetting(env, 'mondayReviewDone')).acts.brand_party, undefined, 'a preview does not count as this Monday\'s run');
  const bad = await handleReview(req('POST', '/api/ask/review/preview', { act: 'brand_galway' }), env, '/api/ask/review/preview', json, d);
  assert.equal(bad.status, 400);
});

console.log(`\n${n} checks passed`);
