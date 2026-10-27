/* Offline checks for THE BUYER REVIEW FLOW + THE MORNING READ (2026-10-26, src/buyerai.js): the ads under a row (7-day
 * numbers, Triple Whale sales, role, hook rate for video only, covers), Disagree (one Sonnet call, drop or hold, saved as a
 * lesson, his final call), the morning read (one Opus call per brand, effort medium, reads plan + lessons + rule rows,
 * stored per day, shown on the list and the post), the tick (hours, switch, $5 cap, lock), the post waiting for it, the
 * cost tally. In-memory SQLite (node:sqlite); the model, the profit worker and Slack are mocked.
 *   node test-buyerai.mjs      (from account-health/worker) */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { adNumbers, withCovers, disagree, decide, lessonsFor, lessonsText, readBrand, readAI, buyerAITick, aiPassDone, meter, spentToday, noDash, roleOf, DAY_CAP,
  shortLine, trackVerdict, trackingCheck } from './src/buyerai.js';
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
/* Lucky's real 2026-10-27 case: "Black Wedges | Still" in the CBO, $561 in 7 days, Meta's own pixel counts 1 purchase
   (Black Wedges - 7), Triple Whale 0. Not a tracking break: the cut stands. */
db.exec(`INSERT INTO meta_adsets VALUES ('act_1', '600', '900', 'Black Wedges | Still', 'ACTIVE', NULL, 'OFFSITE_CONVERSIONS', NULL);
  INSERT INTO ads VALUES ('act_1', '2001', 'Black Wedges - 9', '600', '900', '2026-10-20', '2026-10-20', 'ACTIVE'), ('act_1', '2002', 'Black Wedges - 7', '600', '900', '2026-10-20', '2026-10-20', 'ACTIVE');
  INSERT INTO ad_daily VALUES ('act_1', '2001', '2026-10-22', 403.09, 15000, 0, 0, 300, 0, 9000, 0), ('act_1', '2002', '2026-10-22', 157.71, 6000, 1, 120, 100, 0, 4000, 0);`);
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
  { kind: 'cut', act_id: 'brand_lucky', brand: 'Lucky Golf', meta_act: 'act_1', adset_id: '600', adset: 'Black Wedges | Still', stake: 561, spend: 561, results: 0, days: 7, goal_roas: 2.2, judged_on: 'roas', currency: 'USD',
    why: 'Spent $561 (2.5x the goal) with no sale in 7 days. 7 days running, $561 spent, ROAS 0.00x against 2.2x, CTR 2.1%, CPM $27.' },
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
/* The mock model answers the way the live one did on 2026-10-27 (long, an "if tracking is clean" chain, "check the UTMs"),
   so the tests prove Locus shortens it and puts its own check in place of the ask. */
const passOut = b => {
  const keys = [...b.messages[0].content.matchAll(/"key":"([^"]+)"/g)].map(m => m[1]);
  const row = k => k.endsWith('|500|cut') ? { key: k, verdict: 'drop', action: '', why: 'First click credits it with 5 sales, so it opens journeys \u2014 keep it.', move: 'none', budget: 0, ad_id: '' }
    : k.endsWith('|600|cut') ? { key: k, verdict: 'change', action: 'Hold the cut today and check the UTMs on Black Wedges - 9 and - 7',
      why: 'Zero last-click and zero first-click sales on $560 is odd for posts that drove 14 sales, which points to a UTM or tracking break. If tracking is clean, cut the set and keep the CBO whole.', move: 'none', budget: 0, ad_id: '' }
    : k.endsWith('|1002|trim') ? { key: k, verdict: 'change', action: 'Turn off the static and move its budget into the video hook ad today', why: 'The static made 1 sale on $70 while the video made 3.', move: 'pause', budget: 0, ad_id: '' }
    : { key: k, verdict: 'keep', action: '', why: 'Right as written.', move: 'none', budget: 0, ad_id: '' };
  return { summary: 'Hold the Carver cut \u2014 it opens journeys.', rows: keys.map(row),
    extra: [{ type: 'relaunch', name: 'Carver hook A', adset_id: '', ad_id: '1001', campaign_id: '', action: 'Turn back on', why: '3 sales at $70 each, 5 counted from the first visit.', move: 'resume', budget: 0, stake: 210 },
      { type: 'tracking', name: 'Black Wedges | Still', adset_id: '600', ad_id: '', campaign_id: '900', action: 'Check UTMs and Triple Whale attribution on copied Black Wedges ads', why: '$561 with 0 sales.', move: 'none', budget: 0, stake: 561 },
      { type: 'other', name: 'Bad id', adset_id: 'abc', ad_id: '', campaign_id: '', action: 'x', why: 'y', move: 'pause', budget: 0, stake: -5 }] };
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
  assert.deepEqual(ai.extra.map(x => x.name), ['Carver hook A', 'Bad id'], 'the "check UTMs" extra is gone: Locus checked, tracking is fine');
  assert.equal(ai.extra[0].ad_id, '1001'); assert.equal(ai.extra[1].adset_id, null, 'an id the data did not give is dropped'); assert.equal(ai.extra[1].stake, 0);
  assert.equal(ai.rows.find(x => x.key === 'brand_lucky|500|cut').verdict, 'drop');
});

test('the prompt shape: action max 8 words, why max 20, a move per change, never "check tracking"; Locus\'s own tracking check is in the input', async () => {
  calls = [];
  await readBrand(env, d, ACCTS[0], { today });
  const b = calls[0], sys = b.system, u = b.messages[0].content, sch = b.output_config.format.schema;
  assert.match(sys, /at most 8 words, starting with a verb/); assert.match(sys, /at most 20 words and at most 3 numbers/);
  assert.match(sys, /NEVER tell Cole to check tracking, UTMs, tags, the pixel or attribution/);
  assert.match(sys, /No "if X then Y" chains/); assert.match(sys, /never write UTM, CBO \(unless it is part of a campaign's name\), first click, last click/);
  assert.deepEqual(sch.properties.rows.items.required, ['key', 'verdict', 'action', 'why', 'move', 'budget', 'ad_id']);
  assert.deepEqual(sch.properties.rows.items.properties.move.enum, ['pause', 'resume', 'budget', 'none']);
  assert.ok(sch.properties.extra.items.required.includes('why') && !('reason' in sch.properties.extra.items.properties));
  assert.match(u, /TRACKING CHECKS \(Locus checked these itself/);
  assert.match(u, /- Black Wedges \| Still \(600\): Tracking is fine: Meta also counts just 1 sale on \$561/, 'Meta counts 1 purchase on $561: not a tracking break');
  assert.match(u, /- 420 \| Carver \(500\): Meta counts 14 sales, Triple Whale 4, on \$280 in 7 days/);
  const ai = (await readAI(env, null, today)).get('brand_lucky');
  const bw = ai.rows.find(x => x.key === 'brand_lucky|600|cut');
  assert.equal(bw.verdict, 'keep', 'the ask to check UTMs becomes the rule\'s own call, with the fact');
  assert.equal(bw.why, 'Tracking is fine: Meta also counts just 1 sale on $561'); assert.equal(bw.checked, bw.why);
  const trim = ai.rows.find(x => x.key === 'brand_lucky|1002|trim');
  assert.equal(trim.action, 'Turn off the static', 'cut to 8 words at a clause'); assert.equal(trim.move, 'pause');
  for (const x of [...ai.rows, ...ai.extra]) {
    assert.ok(x.action.split(/\s+/).filter(Boolean).length <= 8, `action too long: ${x.action}`);
    assert.ok(x.why.split(/\s+/).length <= 20, `why too long: ${x.why}`);
    assert.ok(!/\butms?\b|check (the )?track|\bif\b/i.test(`${x.action} ${x.why}`), `asks or chains: ${x.action} / ${x.why}`);
  }
  assert.ok(ai.summary.split(/\s+/).length <= 20);
  assert.equal(shortLine('Hold the cut today and check the UTMs. If tracking is clean, cut it.', 8), 'Hold the cut today and check the UTMs');
  assert.equal(shortLine('Pause it if sales do not come back by Friday', 8), 'Pause it');
});

test('tracking verdicts: fine, a real gap, and ads with no Triple Whale tag (read live from Meta) become the call', async () => {
  assert.equal(trackVerdict({ meta: 1, tw: 0, spend: 572 }).fact, 'Tracking is fine: Meta also counts just 1 sale on $572');
  assert.equal(trackVerdict({ meta: 3, tw: 3, spend: 300 }).fact, 'Tracking is fine: Meta also counts 3 sales on $300');
  assert.equal(trackVerdict({ meta: 9, tw: 1, spend: 300 }).fine, false);
  assert.equal(trackVerdict({ leads_goal: true, leads: 0, spend: 138 }).fact, 'Meta counts 0 leads on $138 in 7 days');
  const metaCalls = [];
  const envT = { ...env, META_TOKEN: 'tok' };
  const dT = { ...d, xfetch: async url => { metaCalls.push(url); return { ok: true, json: async () => ({ 1001: { creative: { url_tags: 'utm_source=facebook' } }, 1002: { creative: { url_tags: 'tw_source={{site_source_name}}&tw_adid={{ad.id}}' } } }) }; } };
  const nums = await adNumbers(env, { act: 'brand_lucky', metaActs: ['act_1'], adsetIds: ['500', '600'] });
  const t = await trackingCheck(envT, dT, nums.ads);
  assert.equal(metaCalls.length, 1, 'one Meta read, only for the set whose counts disagree'); assert.match(metaCalls[0], /ids=1001%2C1002/);
  assert.deepEqual(t.get('500').tags, { read: true, n: 2, missing: 1 });
  assert.equal(t.get('500').action, 'Add Triple Whale tags to 1 ad'); assert.match(t.get('500').fact, /^1 of 2 ads have no Triple Whale tag/);
  assert.equal(t.get('600').fine, true); assert.equal(t.get('600').tags, null, 'a set whose counts agree is not read from Meta');
});

test('the list shows ONE final call per row: the read\'s change replaces the rule (tagged), a drop leaves the list, the tracking ask is a fact; Agree can make the moves', async () => {
  await readBrand(env, d, ACCTS[0], { today });
  const list = await buildBuyerList(env, d, { act: 'all', live: false });
  const bw = list.rows.find(r => r.adset_id === '600' && r.kind === 'cut');
  assert.equal(bw.action, 'Pause this ad set'); assert.equal(bw.why, '$561 in 7 days, 0 sales, goal ROAS 2.2x');
  assert.equal(bw.checked, 'Tracking is fine: Meta also counts just 1 sale on $561'); assert.equal(bw.do, 'pause'); assert.ok(!bw.changed);
  assert.match(bw.why_full, /CTR 2\.1%/, 'the full reason stays for the details');
  const trim = list.rows.find(r => r.object === '1002');
  assert.equal(trim.changed, true); assert.equal(trim.action, 'Turn off the static'); assert.equal(trim.rule.action, 'Pause this ad'); assert.equal(trim.do, 'pause'); assert.equal(trim.ad_id, '1002');
  assert.ok(!list.rows.some(r => r.object === '500' && r.kind === 'cut'), 'the dropped cut is not on the list');
  assert.equal(list.quiet.find(r => r.object === '500' && r.kind === 'cut').hidden.why, 'dropped'); assert.equal(list.hidden.dropped, 1);
  const extra = list.rows.find(r => r.kind === 'ai' && r.ad_id === '1001');
  assert.ok(extra); assert.equal(extra.from, 'morning read'); assert.equal(extra.do, 'resume'); assert.equal(extra.action, 'Turn back on'); assert.equal(extra.stake, 210);
  assert.equal(list.rows.find(r => r.name === 'Bad id').do, null, 'no id to act on: needs Cole');
  assert.equal(list.counts.ai, 2); assert.equal(list.ai.n_read, 1);
  assert.deepEqual(list.groups.map(g => g.brand), ['Lucky Golf']);
  const m = buyerMessage(list, '<@U_COLE>').text;
  assert.match(m, /^\*\d+ changes ready across 1 brand, \$[\d,.K]+ at stake\*/);
  assert.match(m, /\u2022 \*Lucky Golf\*: Pause this ad set, "Black Wedges \| Still"/);
  assert.ok(!/UTM|check|morning read|Owner/i.test(m)); assert.ok(!/[\u2014\u2013]/.test(m));
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
