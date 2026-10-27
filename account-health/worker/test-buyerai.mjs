/* Offline checks for THE BUYER REVIEW FLOW + THE MORNING READ (2026-10-26, src/buyerai.js): the ads under a row (7-day
 * numbers, Triple Whale sales, role, hook rate for video only, covers), Disagree (one Sonnet call, drop or hold, saved as a
 * lesson, his final call), the morning read (one Opus call per brand, effort medium, reads plan + lessons + rule rows,
 * stored per day, shown on the list and the post), the tick (hours, switch, $5 cap, lock), the post waiting for it, the
 * cost tally. In-memory SQLite (node:sqlite); the model, the profit worker and Slack are mocked.
 *   node test-buyerai.mjs      (from account-health/worker) */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { adNumbers, withCovers, disagree, decide, lessonsFor, lessonsText, readBrand, readAI, buyerAITick, aiPassDone, meter, spentToday, noDash, roleOf, DAY_CAP } from './src/buyerai.js';
import { buildBuyerList, buyerMessage, buyerPostTick, readState } from './src/buyerlist.js';

const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { success: true, meta: { changes: r.changes } }; } }; };
const env = { DB: { prepare: stmt, batch: async list => { for (const s of list) await s.run(); } }, OWNER_EMAIL: 'cole@go-mobius-digital.com', ANTHROPIC_API_KEY: 'k', SESSION_SECRET: 's',
  MEDIA: { head: async k => (k === 'cov/1001.webp' ? { size: 1 } : null) } };
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE p_meta_write (id TEXT PRIMARY KEY, act TEXT NOT NULL, brand TEXT, level TEXT, object TEXT NOT NULL, name TEXT, action TEXT NOT NULL, field TEXT, before TEXT, after TEXT, summary TEXT, by TEXT, at TEXT NOT NULL, undone TEXT);
  CREATE TABLE connections (id TEXT, brand_id TEXT, kind TEXT, external_id TEXT);
  CREATE TABLE brand_accounts (act_id TEXT, name TEXT, currency TEXT, target_cpa REAL, target_roas REAL, tw_shop TEXT);
  CREATE TABLE ads (act_id TEXT, ad_id TEXT, name TEXT, adset_id TEXT, campaign_id TEXT, created_time TEXT, first_spend_date TEXT, status TEXT);
  CREATE TABLE ad_daily (act_id TEXT, ad_id TEXT, date TEXT, spend REAL, impressions INTEGER, purchases REAL DEFAULT 0, revenue REAL DEFAULT 0, link_clicks INTEGER, video_3s INTEGER DEFAULT 0, reach INTEGER, leads REAL DEFAULT 0);
  CREATE TABLE tw_ad_attr (act_id TEXT, ad_id TEXT, date TEXT, model TEXT, platform TEXT, orders REAL, revenue REAL);
  CREATE TABLE tw_order_touch (act_id TEXT, order_id TEXT, date TEXT, model TEXT, platform TEXT, ad_id TEXT, weight REAL DEFAULT 1, click_date TEXT);
  CREATE TABLE tw_orders (act_id TEXT, order_id TEXT, date TEXT, customer_id TEXT);
  CREATE TABLE meta_campaigns (act_id TEXT, campaign_id TEXT, name TEXT, objective TEXT, status TEXT, daily_budget REAL, lifetime_budget REAL, bid_strategy TEXT);
  CREATE TABLE meta_adsets (act_id TEXT, adset_id TEXT, campaign_id TEXT, name TEXT, status TEXT, daily_budget REAL, optimization_goal TEXT, min_spend REAL);`);
const setting = k => (db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k) || {}).value ?? null;
const setSetting = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, v);

/* Lucky-like brand: one campaign, set 500 with a video ad (1001) and an image ad (1002), 7 days to 2026-10-25. */
db.exec(`INSERT INTO connections VALUES ('c1', 'brand_lucky', 'meta', 'act_1');
  INSERT INTO brand_accounts VALUES ('brand_lucky', 'Lucky Golf', 'USD', 52, 3.0, 'x');
  INSERT INTO meta_campaigns VALUES ('act_1', '900', '[MD] CBO', 'OUTCOME_SALES', 'ACTIVE', 450, NULL, NULL);
  INSERT INTO meta_adsets VALUES ('act_1', '500', '900', '420 | Carver', 'ACTIVE', NULL, 'OFFSITE_CONVERSIONS', 20);
  INSERT INTO ads VALUES ('act_1', '1001', 'Carver hook A', '500', '900', '2026-10-10', '2026-10-10', 'ACTIVE'), ('act_1', '1002', 'Carver static', '500', '900', '2026-10-10', '2026-10-10', 'PAUSED'),
    ('act_1', '1003', 'Old ad no spend', '500', '900', '2026-09-01', '2026-09-01', 'PAUSED');`);
for (let i = 0; i < 7; i++) {
  const day = `2026-10-${String(19 + i).padStart(2, '0')}`;
  db.prepare(`INSERT INTO ad_daily VALUES ('act_1', '1001', ?, 30, 1000, 2, 200, 20, 300, 400, 0)`).run(day);
  db.prepare(`INSERT INTO ad_daily VALUES ('act_1', '1002', ?, 10, 500, 0, 0, 5, 0, 300, 0)`).run(day);
}
db.exec(`INSERT INTO tw_ad_attr VALUES ('brand_lucky', '1001', '2026-10-20', 'lastPlatformClick', 'meta', 3, 300), ('brand_lucky', '1001', '2026-10-21', 'fullFirstClick', 'meta', 5, 600),
    ('brand_lucky', '1002', '2026-10-22', 'lastPlatformClick', 'meta', 1, 90);
  INSERT INTO tw_orders VALUES ('brand_lucky', 'o1', '2026-10-21', 'cu1'), ('brand_lucky', 'o2', '2026-10-21', 'cu2'), ('brand_lucky', 'o0', '2026-01-01', 'cu2');
  INSERT INTO tw_order_touch VALUES ('brand_lucky', 'o1', '2026-10-21', 'fullFirstClick', 'meta', '1001', 1, NULL), ('brand_lucky', 'o2', '2026-10-21', 'fullFirstClick', 'meta', '1001', 1, NULL);`);

let today = '2026-10-26', hour = 5, posts = [], calls = [];
let answer = () => ({ stance: 'drop', answer: "Fair, I'll drop it. It only launched on the 19th \u2014 too early." });
const ACCTS = [{ act_id: 'brand_lucky', name: 'Lucky Golf', currency: 'USD' }, { act_id: 'brand_gal', name: 'Galway Bay', currency: 'USD' }];
const CALLS = [
  { kind: 'cut', act_id: 'brand_lucky', brand: 'Lucky Golf', meta_act: 'act_1', adset_id: '500', adset: '420 | Carver', stake: 280, currency: 'USD', goal: 52, judged_on: 'cpa', role: 'both', why: 'Spent $280 with 4 sales at $70 each, over the $52 goal.' },
  { kind: 'trim', act_id: 'brand_lucky', brand: 'Lucky Golf', meta_act: 'act_1', adset_id: '500', adset: '420 | Carver', ad_id: '1002', ad: 'Carver static', stake: 70, currency: 'USD', goal: 52, judged_on: 'cpa', why: 'This ad costs $70 a sale.' },
];
const d = {
  centralHour: () => hour, centralDate: () => today, canAfford: () => true,
  listAccounts: async () => ACCTS, mintSession: async () => ({ token: 't' }),
  profit: async () => ({ rows: CALLS, banners: [] }),
  listBoard: async () => ({ cards: [] }),
  slackPost: async (e, channel, text, blocks) => { posts.push({ channel, text, blocks }); return { ok: true, ts: '1.0' }; },
  tagOf: async () => '<@U_COLE>',
  xfetch: async (url, init) => {
    const b = JSON.parse(init.body); calls.push(b);
    const out = b.model === 'claude-opus-5-5' ? passOut(b) : answer(b);
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(out) }], usage: b.model === 'claude-opus-5-5' ? { input_tokens: 20000, output_tokens: 3000 } : { input_tokens: 3000, output_tokens: 200 } }) };
  },
};
const passOut = b => {
  const keys = [...b.messages[0].content.matchAll(/"key":"([^"]+)"/g)].map(m => m[1]);
  return { summary: 'Hold the Carver cut \u2014 it opens journeys.', rows: keys.map((k, i) => ({ key: k, verdict: i === 0 ? 'drop' : 'keep', reason: i === 0 ? 'First click credits it with 5 sales.' : 'The static has 1 sale on $70.', change: '' })),
    extra: [{ type: 'relaunch', name: 'Carver hook A', adset_id: '', ad_id: '1001', campaign_id: '', action: 'Copy it into the CBO as a winner', reason: '3 sales at $70 last click, 5 first click.', stake: 210 },
      { type: 'other', name: 'Bad id', adset_id: 'abc', ad_id: '', campaign_id: '', action: 'x', reason: 'y', stake: -5 }] };
};

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('the ads under a row: 7-day numbers each, sales from Triple Whale (not Meta), hook rate only for video, role and new-customer share, covers when stored', async () => {
  const r = await adNumbers(env, { act: 'brand_lucky', metaActs: ['act_1'], adsetIds: ['500'] });
  assert.equal(r.to, '2026-10-25'); assert.equal(r.from, '2026-10-19');
  assert.deepEqual(r.ads.map(a => a.ad_id), ['1001', '1002'], 'biggest spend first; an ad with no spend in the window is left out');
  const [v, i] = r.ads;
  assert.equal(v.spend, 210); assert.equal(v.sales, 3, 'Triple Whale last click, not Meta purchases (14)'); assert.equal(v.cpa, 70); assert.equal(v.roas, 1.43);
  assert.equal(v.ctr, 2); assert.equal(v.cpm, 30); assert.equal(v.freq, 2.5); assert.equal(v.video, true); assert.equal(v.hook, 30);
  assert.equal(v.role, 'opener', 'first click $600 vs last click $300 with 5 first-click sales'); assert.equal(v.new_share, 50, 'one of two first-click customers was new');
  assert.equal(i.video, false); assert.equal(i.hook, null); assert.equal(i.status, 'PAUSED');
  const one = await adNumbers(env, { act: 'brand_lucky', metaActs: ['act_1'], adIds: ['1003'] });
  assert.deepEqual(one.ads.map(a => a.ad_id), ['1003'], 'an ad asked for by id is always shown');
  const c = await withCovers(env, r.ads);
  assert.match(c[0].cover, /\/cover\/1001\.[a-f0-9]{16}\.webp$/); assert.equal(c[1].cover, null, 'no stored cover: the page falls back to /api/ad-creatives');
  assert.equal(roleOf(100, 300, 1, true), 'closer'); assert.equal(roleOf(0, 0, 0, false), null);
});

test('Disagree, Locus drops it: ONE Sonnet call with his words and the numbers; saved as a lesson with his call final; the row goes quiet', async () => {
  calls = [];
  const row = { key: 'brand_lucky|500|cut', kind: 'cut', object: '500', action: 'Cut the ad set', name: '420 | Carver', adset_id: '500', meta_act: 'act_1', why: 'Spent $280...', goal: 52, metric: 'cpa' };
  const j = await disagree(env, d, { act: 'brand_lucky', brand: 'Lucky Golf', row, why: 'It just launched, give it till Friday.', author: 'cole@go-mobius-digital.com', today });
  assert.equal(calls.length, 1); assert.equal(calls[0].model, 'claude-sonnet-5-5');
  const u = calls[0].messages[0].content;
  assert.match(u, /It just launched, give it till Friday/); assert.match(u, /"spend":280/); assert.match(u, /Carver hook A/);
  assert.equal(j.stance, 'drop'); assert.equal(j.decision, 'mine');
  assert.ok(!/[\u2014\u2013]/.test(j.answer), 'no em dashes in what Locus says'); assert.match(j.answer, /^Fair, I'll drop it\./);
  const st = await readState(env, null, today);
  assert.ok(st.states.find(s => s.object === '500' && s.action === 'cut' && s.status === 'done'));
  const ls = await lessonsFor(env, 'brand_lucky');
  assert.equal(ls.length, 1); assert.equal(ls[0].text, 'It just launched, give it till Friday.');
  assert.match(lessonsText(ls), /LOCUS AGREED WITH COLE/);
});

test('Disagree, Locus holds: two sentences with numbers, then his choice is final (mine = quiet + remembered; locus = recorded); another brand is refused', async () => {
  answer = () => ({ stance: 'hold', answer: 'I still think it should go. It spent $210 on the static for 1 sale.' });
  const row = { key: 'brand_lucky|1002|trim', kind: 'trim', object: '1002', action: 'Turn off this ad', name: 'Carver static', adset_id: '500', ad_id: '1002', meta_act: 'act_1' };
  const j = await disagree(env, d, { act: 'brand_lucky', brand: 'Lucky Golf', row, why: 'Statics feed retargeting.', author: 'Cole', today });
  assert.equal(j.stance, 'hold'); assert.equal(j.decision, null);
  await assert.rejects(decide(env, { act: 'brand_other', id: j.id, decision: 'mine', who: 'Cole', today }), /another brand/);
  await assert.rejects(decide(env, { act: 'brand_lucky', id: j.id, decision: 'maybe', who: 'Cole', today }), /Go with yours/);
  await decide(env, { act: 'brand_lucky', id: j.id, decision: 'mine', who: 'Cole', today });
  const st = await readState(env, null, today);
  assert.ok(st.states.find(s => s.object === '1002' && s.action === 'trim' && s.status === 'done'));
  assert.match(lessonsText(await lessonsFor(env, 'brand_lucky')), /COLE'S FINAL CALL: follow it/);
  const k = await disagree(env, d, { act: 'brand_lucky', brand: 'Lucky Golf', row: { ...row, key: 'x', object: '999' }, why: 'Nope.', author: 'Cole', today });
  await decide(env, { act: 'brand_lucky', id: k.id, decision: 'locus', who: 'Cole', today });
  assert.match(lessonsText(await lessonsFor(env, 'brand_lucky')), /SETTLED FOR LOCUS/);
  assert.equal((await readState(env, null, today)).states.filter(s => s.object === '999').length, 0, 'Go with Locus leaves the row to be done');
  await assert.rejects(disagree(env, d, { act: 'brand_lucky', brand: 'Lucky Golf', row, why: '', author: 'Cole', today }), /Say why/);
});

test('the morning read: ONE Opus call (effort medium) reading the plan, lessons, rule rows, sets and campaigns; stored per day; bad ids dropped; no em dashes', async () => {
  db.exec(`DELETE FROM p_buyer_state`);
  const { remember } = await import('./src/stratmem.js');
  await remember(env, { scope: 'brand_lucky', topic: 'account structure', text: 'Since Oct 4 Lucky runs ONE campaign, [MD] CBO about $450/day; do not suggest splitting it back out.', source: 'test' });
  calls = [];
  const r = await readBrand(env, d, ACCTS[0], { today });
  assert.equal(r.status, 'done'); assert.equal(calls.length, 1);
  const b = calls[0];
  assert.equal(b.model, 'claude-opus-5-5'); assert.equal(b.output_config.effort, 'medium');
  const u = b.messages[0].content;
  assert.match(u, /THE ACCOUNT PLAN \(follow it\):\n- account structure: Since Oct 4 Lucky runs ONE campaign/);
  assert.match(u, /COLE'S FINAL CALL/); assert.match(u, /brand_lucky\|500\|cut/); assert.match(u, /\[MD\] CBO/); assert.match(u, /"budget":null/); assert.match(u, /"daily_budget":450/);
  assert.match(u, /"new_share_pct":50/); assert.match(u, /"fc_sales":5/);
  const ai = (await readAI(env, null, today)).get('brand_lucky');
  assert.equal(ai.status, 'done'); assert.ok(!/[\u2014\u2013]/.test(ai.summary));
  assert.equal(ai.extra.length, 2); assert.equal(ai.extra[0].ad_id, '1001'); assert.equal(ai.extra[1].adset_id, null, 'an id the data did not give is dropped'); assert.equal(ai.extra[1].stake, 0);
  assert.equal(ai.rows.find(x => x.key === 'brand_lucky|500|cut').verdict, 'drop');
});

test('the list and the post read it: a verdict on each rule row, drops sink, the missed calls are rows "from the morning read"', async () => {
  const list = await buildBuyerList(env, d, { act: 'all', live: false });
  const cut = list.rows.find(r => r.kind === 'cut'), extra = list.rows.find(r => r.kind === 'ai' && r.ad_id === '1001');
  assert.equal(cut.ai.verdict, 'drop'); assert.equal(cut.goal, 52); assert.equal(cut.metric, 'cpa');
  assert.ok(extra); assert.equal(extra.from, 'morning read'); assert.equal(extra.do, null); assert.equal(extra.stake, 210);
  assert.equal(list.rows[list.rows.length - 1].key, cut.key, 'the dropped call sinks under the rest');
  assert.equal(list.counts.ai, 2); assert.equal(list.ai.n_read, 1);
  const m = buyerMessage(list, '<@U_COLE>').text;
  assert.match(m, /Morning read: 1 brand read, 2 calls the rules missed, 1 to drop\./);
  assert.match(m, /\(from the morning read\)/); assert.match(m, /\(morning read says drop it\)/);
  assert.ok(!/[\u2014\u2013]/.test(m));
});

test('the tick: off switch, hours (an hour before the post to noon), one brand per paused brand skipped, the $5 cap, the lock', async () => {
  const fresh = '2026-10-27';
  today = fresh; hour = 3;
  assert.match((await buyerAITick(env, d)).skipped, /before 4am/);
  setSetting('buyerAI', 'off'); hour = 4;
  assert.deepEqual(await buyerAITick(env, d), { skipped: 'off' });
  assert.equal(await aiPassDone(env, d, fresh), true, 'off: the post never waits');
  setSetting('buyerAI', 'on');
  assert.equal(await aiPassDone(env, d, fresh), false);
  setSetting('buyerAILock', String(Date.now()));
  assert.match((await buyerAITick(env, d)).skipped, /another tick/);
  setSetting('buyerAILock', '0');
  calls = [];
  const r = await buyerAITick(env, d);
  assert.equal(r.ran.brand_lucky.status, 'done'); assert.equal(r.ran.brand_gal, undefined, 'a paused brand is never read');
  assert.equal(calls.length, 1);
  assert.equal(await aiPassDone(env, d, fresh), true);
  assert.deepEqual(await buyerAITick(env, d), { date: fresh, done: true }, 'read once a day');
  today = '2026-10-28'; setSetting(`aiSpend:buyer:day:${today}`, String(DAY_CAP - 0.1)); calls = [];
  const c = await buyerAITick(env, d);
  assert.equal(c.ran.brand_lucky, 'capped'); assert.equal(calls.length, 0, 'past the cap: no call');
});

test('the post waits for the morning read in the post hour, then goes anyway; the cost is tallied per month and per day', async () => {
  today = '2026-10-29'; hour = 5; posts = [];
  setSetting('buyerChannel', 'U06C37MDWD7');
  assert.deepEqual(await buyerPostTick(env, d), { deferred: 'morning read not finished' });
  hour = 6;
  const p = await buyerPostTick(env, d);
  assert.equal(p.posted > 0, true); assert.equal(posts.length, 1);
  const before = await spentToday(env, '2026-10-30');
  const usd = await meter(env, { input_tokens: 1e6, output_tokens: 1e5 }, 'claude-opus-5-5', 'pass', '2026-10-30');
  assert.equal(Math.round(usd * 100) / 100, 6, 'Opus 5.5: $4 in + $20 out per million');
  assert.equal(await spentToday(env, '2026-10-30'), before + 6);
  const month = JSON.parse(setting('aiSpend:buyer:2026-10'));
  assert.ok(month.usd >= 6); assert.ok(month.by.pass >= 6); assert.ok(month.by.disagree > 0);
  assert.equal(noDash('a \u2014 b \u2013 c'), 'a, b, c');
});

test('run now: settings buyerAIRunNow = a Slack id reads every brand at any hour, then posts the list there as a preview, once', async () => {
  today = '2026-10-31'; hour = 20; posts = []; calls = [];
  setSetting('buyerAIRunNow', 'C0C8B4ZCGKT');
  const r = await buyerAITick(env, d);
  assert.equal(r.ran.brand_lucky.status, 'done'); assert.equal(calls.length, 1);
  assert.equal(r.preview.channel, 'C0C8B4ZCGKT'); assert.equal(posts.length, 1); assert.equal(posts[0].channel, 'C0C8B4ZCGKT');
  assert.equal(setting('buyerAIRunNow'), '0');
  assert.match((await buyerAITick(env, d)).skipped, /after noon/);
});

let pass = 0;
for (const [name, fn] of tests) {
  try { await fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}\n    ${String(e.stack || e).split('\n').slice(0, 6).join('\n    ')}`); }
}
console.log(`\n${pass}/${tests.length} passed`);
if (pass !== tests.length) process.exit(1);
