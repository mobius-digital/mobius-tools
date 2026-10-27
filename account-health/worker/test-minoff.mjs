/* Offline checks for TEST MINIMUMS DUE OFF (2026-10-15, src/minoff.js + asana-brand.js testMinimumsDue): which ad sets
 * are due (judged and not a loser, or past min_days, and still set in Meta), the daily tick (once a Central day from the
 * morning hour, waits for the morning card, paused brands and The Golf Sock skipped, the buyer tagged, the switch), and
 * the Take it off / Take all N off buttons (locusWrite min_spend min 0 as the tapper, the message redrawn struck through).
 * In-memory SQLite (node:sqlite); the Graph API and Slack are mocked.
 *   node test-minoff.mjs      (from account-health/worker) */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { minOffTick, handleMinOffButton, minOffMessage, minOffLine } from './src/minoff.js';
import { testMinimumsDue, useFetch, nudgeCall } from './src/asana-brand.js';
import { minRow } from './src/buyerlist.js';

const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { st().run(vals(args)); return { success: true }; } }; };
const env = { DB: { prepare: stmt, batch: async () => [] }, META_TOKEN: 'tok' };
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
const setSetting = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, v);
const getSetting = k => db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k)?.value ?? null;

let n = 0, bad = 0;
const check = async (name, fn) => { try { await fn(); n++; console.log('PASS ', name); } catch (e) { bad++; console.log('FAIL ', name, '\n   ', e.stack); } };

/* ---------- 1. the judgement: asana-brand.js testMinimumsDue on a real (in-memory) brand, Meta mocked ---------- */
const TODAY = new Date().toISOString().slice(0, 10);
const ago = k => { const d = new Date(TODAY + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - k); return d.toISOString().slice(0, 10); };
db.exec(`CREATE TABLE brand_accounts (act_id TEXT, name TEXT, target_cpa REAL, target_roas REAL, slack_channel TEXT, meta_act TEXT, brief_channel TEXT);
  CREATE TABLE p_br_doc (act_id TEXT, line_id TEXT, key TEXT, data_json TEXT);
  CREATE TABLE p_br_batch (id TEXT, act_id TEXT, num TEXT, title TEXT, stage TEXT, verdict TEXT);
  CREATE TABLE connections (brand_id TEXT, kind TEXT, external_id TEXT, is_primary INTEGER, added_at TEXT);
  CREATE TABLE ads (ad_id TEXT, act_id TEXT, name TEXT);
  CREATE TABLE p_br_adtag (ad_id TEXT, act_id TEXT, batch_id TEXT);
  CREATE TABLE ad_daily (act_id TEXT, ad_id TEXT, date TEXT, spend REAL, impressions REAL, link_clicks REAL, video_3s REAL, video_thruplay REAL, add_to_cart REAL);
  CREATE TABLE tw_ad_attr (act_id TEXT, ad_id TEXT, date TEXT, model TEXT, revenue REAL, orders REAL);`);
db.exec(`INSERT INTO brand_accounts VALUES ('brand_alpha', 'Alpha Golf', 40, NULL, 'C_ALPHA', 'act_1', 'C_ALPHA_CLIENT');
  INSERT INTO connections VALUES ('brand_alpha', 'meta', 'act_1', 1, '2026-01-01');
  INSERT INTO p_br_doc VALUES ('brand_alpha', '', 'rules', '{"min_days":3}');`);
/* min_days 3 here (a minimum due off before the judge days are up only happens when min_days < judge_days).
   Tests: 101 a winner (minimum due, judged), 102 a loser (no minimum change: Monday pauses it), 103 early on day 3
   (not due), 104 early on day 5, past min_days (due), 105 a winner whose minimum is already 0 in Meta (not due). */
const tests = [
  { num: '101', first: 9, spend: 300, orders: 10 }, { num: '102', first: 9, spend: 300, orders: 0 },
  { num: '103', first: 2, spend: 20, orders: 0 }, { num: '104', first: 4, spend: 20, orders: 0 }, { num: '105', first: 9, spend: 300, orders: 10 },
];
for (const t of tests) {
  db.prepare(`INSERT INTO p_br_batch VALUES (?, 'brand_alpha', ?, ?, 'live', NULL)`).run('b' + t.num, t.num, 'Test ' + t.num);
  db.prepare(`INSERT INTO ads VALUES (?, 'act_1', ?)`).run('ad' + t.num, `${t.num} | ad`);
  db.prepare(`INSERT INTO ad_daily VALUES ('act_1', ?, ?, ?, 1000, 10, 0, 0, 0)`).run('ad' + t.num, ago(t.first), t.spend);
  db.prepare(`INSERT INTO tw_ad_attr VALUES ('brand_alpha', ?, ?, 'lastPlatformClick', ?, ?)`).run('ad' + t.num, ago(t.first), t.orders * 100, t.orders);
}
const MIN = { 101: 2000, 102: 2000, 103: 1500, 104: 1500, 105: 0 };
const graph = [];
useFetch(async url => {
  const u = new URL(url); graph.push(u.pathname);
  if (u.pathname.endsWith('/adsets')) return { json: async () => ({ data: Object.entries(MIN).map(([k, v]) => ({ id: 'as' + k, name: `${k} | Test ${k}`, campaign_id: 'c1', daily_min_spend_target: String(v) })) }) };
  if (u.pathname.endsWith('/campaigns')) return { json: async () => ({ data: [{ id: 'c1', name: 'Testing', daily_budget: '20000' }] }) };
  return { json: async () => ({}) };
});
await check('testMinimumsDue: judged (not a loser) or past min_days, and still set in Meta; nothing else; reads Meta live', async () => {
  const r = await testMinimumsDue(env, 'brand_alpha');
  assert.equal(r.error, undefined, r.error);
  assert.equal(r.channel, 'C_ALPHA');
  assert.deepEqual(r.due.map(x => x.id).sort(), ['as101', 'as104']);   // 104: the nudge (2026-10-27) judges it past min_days
  const w = r.due.find(x => x.id === 'as101'), e = r.due.find(x => x.id === 'as104');
  assert.equal(w.min, 20); assert.equal(w.why, 'judged'); assert.equal(w.day, 10); assert.equal(w.act, 'act_1');
  assert.equal(e.min, 15); assert.match(e.why, /^Meta did not pick it: \$20 in 5 days/); assert.equal(e.then, 'pause'); assert.equal(e.day, 5);
  assert.ok(graph.some(p => p.endsWith('act_1/adsets')), 'live Meta read');
  assert.ok(!graph.some(p => /user_tasks|permissions/.test(p)), 'the list-only path skips the Monday permission reads');
});
await check('testMinimumsDue: a brand with no goal CPA says so (the tick retries, then records it)', async () => {
  db.exec(`UPDATE brand_accounts SET target_cpa = NULL`);
  const r = await testMinimumsDue(env, 'brand_alpha');
  assert.match(r.error, /goal cost per sale/);
  db.exec(`UPDATE brand_accounts SET target_cpa = 40`);
});

/* ---------- 1b. THE NUDGE (2026-10-27): a minimum past min_days, judged on how Meta spent past it ---------- */
await check('nudgeCall: well past the minimum and on goal = winner; barely past = Meta did not pick it; between = the campaign decides', async () => {
  const cpa = { goal_metric: 'cpa', test_cpa: 40, win_roas: 2 }, roas = { goal_metric: 'roas', test_roas: 2.2, win_roas: 2.2 };
  assert.equal(nudgeCall({ spend: 125, orders: 4 }, 10, 8, cpa).kind, 'winner');          // $125 > 1.5 x $80, $31 a sale
  assert.equal(nudgeCall({ spend: 120, orders: 1 }, 10, 8, cpa).kind, 'campaign');        // spent past it but $120 a sale
  assert.equal(nudgeCall({ spend: 85, orders: 0 }, 10, 8, cpa).kind, 'not_picked');       // $85 <= 1.15 x $80
  assert.equal(nudgeCall({ spend: 100, orders: 0 }, 10, 8, cpa).kind, 'campaign');
  assert.equal(nudgeCall({ spend: 130, rev: 400 }, 10, 8, roas).kind, 'winner');           // ROAS 3.1x
  assert.equal(nudgeCall({ spend: 130, rev: 100 }, 10, 8, roas).kind, 'campaign');
  const np = nudgeCall({ spend: 72, orders: 0 }, 10, 8, cpa);
  assert.equal(np.call, 'loser'); assert.match(np.why, /^Meta did not pick it: \$72 in 8 days on a \$10\/day minimum/);
  assert.equal(nudgeCall({ spend: 50 }, 0, 8, cpa), null);
  assert.ok(!/—/.test(JSON.stringify([np, nudgeCall({ spend: 120, orders: 4 }, 10, 8, cpa)])));
});
await check('testMinimumsDue: past min_days a set with a minimum is judged by the nudge (not starved), every outcome due off; not picked also pauses', async () => {
  db.exec(`INSERT INTO brand_accounts VALUES ('brand_nudge', 'Nudge Golf', 40, NULL, 'C_N', 'act_9', 'C_N_CLIENT');
    INSERT INTO connections VALUES ('brand_nudge', 'meta', 'act_9', 1, '2026-01-01');
    INSERT INTO p_br_doc VALUES ('brand_nudge', '', 'rules', '{"judge_spend":156}');`);
  /* 201 winner, 202 Meta did not pick it, 203 in between, 204 day 5 (not yet), 205 no minimum and starved (Monday pauses it, not due) */
  const N = [{ num: '201', first: 8, spend: 140, orders: 5 }, { num: '202', first: 8, spend: 82, orders: 0 }, { num: '203', first: 8, spend: 105, orders: 1 },
    { num: '204', first: 4, spend: 40, orders: 0 }, { num: '205', first: 8, spend: 20, orders: 0 }];
  for (const t of N) {
    db.prepare(`INSERT INTO p_br_batch VALUES (?, 'brand_nudge', ?, ?, 'live', NULL)`).run('n' + t.num, t.num, 'Test ' + t.num);
    db.prepare(`INSERT INTO ads VALUES (?, 'act_9', ?)`).run('nad' + t.num, `${t.num} A | UGC`);
    db.prepare(`INSERT INTO ad_daily VALUES ('act_9', ?, ?, ?, 1000, 10, 0, 0, 0)`).run('nad' + t.num, ago(t.first), t.spend);
    db.prepare(`INSERT INTO tw_ad_attr VALUES ('brand_nudge', ?, ?, 'lastPlatformClick', ?, ?)`).run('nad' + t.num, ago(t.first), t.orders * 100, t.orders);
  }
  const NM = { 201: 1000, 202: 1000, 203: 1000, 204: 1000, 205: 0 };
  useFetch(async url => {
    const u = new URL(url);
    if (u.pathname.endsWith('/adsets')) return { json: async () => ({ data: Object.entries(NM).map(([k, v]) => ({ id: 'ns' + k, name: `${k} | UGC | Carver`, campaign_id: 'c9', daily_min_spend_target: String(v) })) }) };
    if (u.pathname.endsWith('/campaigns')) return { json: async () => ({ data: [{ id: 'c9', name: '[MD] CBO', daily_budget: '50000' }] }) };
    return { json: async () => ({}) };
  });
  const r = await testMinimumsDue(env, 'brand_nudge');
  assert.equal(r.error, undefined, r.error);
  const by = Object.fromEntries(r.due.map(x => [x.id, x]));
  assert.deepEqual(Object.keys(by).sort(), ['ns201', 'ns202', 'ns203']);
  assert.equal(by.ns201.nudge, 'winner'); assert.equal(by.ns201.then, undefined);
  assert.equal(by.ns202.nudge, 'not_picked'); assert.equal(by.ns202.then, 'pause'); assert.match(by.ns202.why, /Meta did not pick it/);
  assert.equal(by.ns203.nudge, 'campaign'); assert.equal(by.ns203.min, 10); assert.equal(by.ns203.day, 9);
  /* the Buyer list rows: one-line action, one-line why */
  const rows = r.due.map(x => minRow({ act_id: 'brand_nudge', name: 'Nudge Golf' }, x));
  const row = id => rows.find(x => x.object === id);
  assert.equal(row('ns201').action, 'Take the minimum off, keep it');
  assert.equal(row('ns202').action, 'Take the minimum off and pause'); assert.equal(row('ns202').then, 'pause'); assert.equal(row('ns202').do, 'minoff');
  assert.equal(row('ns203').action, 'Take the minimum off'); assert.equal(row('ns203').then, null);
  for (const x of rows) { assert.ok(x.why.length <= 140 && !/\n/.test(x.why), x.why); assert.ok(!/—/.test(x.action + x.why)); }
  assert.match(minOffLine({ ...by.ns202, name: '202 | UGC | Carver' }), /Pause it too/);
});

/* ---------- 2. the tick ---------- */
let hour = 6, posts = [], writes = [], replaced = [];
const BRANDS = [
  { act_id: 'brand_alpha', name: 'Alpha Golf', slack_channel: 'C_ALPHA', brief_channel: 'C_ALPHA_CLIENT' },
  { act_id: 'brand_beta', name: 'Beta Socks', slack_channel: 'C_BETA', brief_channel: 'C_BETA_CLIENT' },
  { act_id: 'brand_sock', name: 'The Golf Sock', slack_channel: 'C_SOCK' },
  { act_id: 'brand_galway', name: 'Galway Bay', slack_channel: 'C_GAL' },
  { act_id: 'brand_nochan', name: 'No Channel Co', slack_channel: null },
];
const DUE = {
  brand_alpha: { due: [{ id: '111', name: '101 | Hook test', act: 'act_1', min: 20, day: 10, why: 'judged' }, { id: '222', name: '104 | Price test', act: 'act_1', min: 15.5, day: 9, why: 'past 7 days' }] },
  brand_beta: { due: [] },
};
const asked = [];
let afford = true;
const d = {
  centralHour: () => hour, centralDate: () => '2026-10-15', canAfford: () => afford,
  listAccounts: async () => BRANDS,
  teamOf: async (env, ids) => Object.fromEntries(ids.map(id => [id, { strat: 'Ahsan', buyer: id === 'brand_alpha' ? 'Noma' : 'Ahsan' }])),
  tagOf: async (env, name) => (name === 'Noma' ? '<@U_NOMA>' : `*${name}*`),
  teamPost: async (env, channel, text, blocks, opts) => { posts.push({ channel, text, blocks, opts }); return { ts: `${posts.length}.000`, channel }; },
  dueOff: async (env, act) => { asked.push(act); if (!DUE[act]) throw new Error('should not be asked for ' + act); return DUE[act]; },
  slackName: async (env, uid) => (uid === 'U_COLE' ? 'Cole' : null),
  write: async (env, b, ctx) => { writes.push({ b, ctx }); if (b.object === '222' && b.fail) return { error: 'nope' }; return WRITE[b.object] ? WRITE[b.object]() : { ok: true, write: 'mw_' + b.object, level: 'adset', object: b.object }; },
};
const WRITE = {};
const card = (act, ch) => { setSetting(`morningCard:${act}:2026-10-15`, JSON.stringify({ act, date: '2026-10-15', channel: ch, ts: '99.000' })); setSetting('morningCardIdx:2026-10-15', JSON.stringify({ C_ALPHA: 'brand_alpha', C_BETA: 'brand_beta' })); };

await check('the tick: nothing before the morning hour; waits for the morning card; skips paused brands, The Golf Sock and no channel', async () => {
  setSetting('morningHour', '7');
  assert.deepEqual(await minOffTick(env, d), { skipped: 'before 7am Central' });
  hour = 7;
  let r = await minOffTick(env, d);
  assert.deepEqual(r.waiting.sort(), ['Alpha Golf', 'Beta Socks']);
  assert.deepEqual(r.skipped, ['No Channel Co']);
  assert.equal(posts.length, 0); assert.equal(asked.length, 0, 'no Meta read while waiting');
  assert.ok(!asked.includes('brand_sock') && !asked.includes('brand_galway'));
});
await check('the tick: one message per brand with something due, buyer tagged, a Take it off per line and Take all N off; nothing due = no post; once a day', async () => {
  card('brand_alpha', 'C_ALPHA'); card('brand_beta', 'C_BETA');
  const r = await minOffTick(env, d);
  assert.deepEqual(r.posted, ['Alpha Golf (2)']); assert.deepEqual(r.quiet, ['Beta Socks']);
  assert.equal(posts.length, 1);
  const p = posts[0];
  assert.equal(p.channel, 'C_ALPHA');
  assert.equal(p.text, '<@U_NOMA> 101 | Hook test: test minimum $20/day is due off (day 10, judged).\n104 | Price test: test minimum $15.50/day is due off (day 9, past 7 days).');
  assert.equal(p.blocks.length, 3);
  assert.equal(p.blocks[0].accessory.action_id, 'minoff_one_0'); assert.equal(p.blocks[0].accessory.text.text, 'Take it off');
  assert.deepEqual(JSON.parse(p.blocks[1].accessory.value), { a: 'brand_alpha', d: '2026-10-15', s: '222' });
  const all = p.blocks[2].elements[0];
  assert.equal(all.action_id, 'minoff_all'); assert.equal(all.text.text, 'Take all 2 off'); assert.ok(all.confirm, 'Take all asks first');
  assert.ok(!/—/.test(JSON.stringify(p)), 'no em dash');
  const saved = JSON.parse(getSetting('minOff:brand_alpha:2026-10-15'));
  assert.equal(saved.ts, '1.000'); assert.equal(saved.items.length, 2); assert.equal(saved.tag, '<@U_NOMA>');
  assert.equal(writes.length, 0, 'never applied by itself');
  posts = []; asked.length = 0;
  const again = await minOffTick(env, d);
  assert.equal(again.skipped, 'all checked today'); assert.equal(posts.length, 0); assert.equal(asked.length, 0);
});
await check('the tick: a single due set gets no Take all button; past the wait it posts without a card; out of budget defers before the brand', async () => {
  setSetting('minOffDone', JSON.stringify({}));
  db.prepare(`DELETE FROM settings WHERE key LIKE 'morningCard%'`).run();
  DUE.brand_alpha = { due: [DUE.brand_alpha.due[0]] };
  afford = false; hour = 11;
  let r = await minOffTick(env, d);
  assert.equal(r.deferred, 'budget'); assert.equal(posts.length, 0);
  afford = true;
  r = await minOffTick(env, d);
  assert.deepEqual(r.posted, ['Alpha Golf (1)']);
  assert.equal(posts[0].blocks.length, 1, 'one line, no Take all');
});
await check('the tick: switched off with settings.minOffPost = off; a failing brand retries once, then is recorded', async () => {
  setSetting('minOffPost', 'off');
  assert.deepEqual(await minOffTick(env, d), { skipped: 'off' });
  setSetting('minOffPost', 'on');
  setSetting('minOffDone', JSON.stringify({}));
  DUE.brand_beta = { error: 'No Meta ad account connected.' };
  posts = [];
  let r = await minOffTick(env, d);
  assert.deepEqual(r.failed, ['Beta Socks (No Meta ad account connected.)']);
  r = await minOffTick(env, d);
  assert.equal(JSON.parse(getSetting('minOffDone')).acts.brand_beta, 'failed: No Meta ad account connected.');
  assert.equal((await minOffTick(env, d)).skipped, 'all checked today');
});

/* ---------- 3. the buttons ---------- */
const ACK = () => 'ACK';
const xfetch = async (url, init) => { replaced.push(JSON.parse(init.body)); return { ok: true }; };
const tapPayload = (action_id, value) => ({ type: 'block_actions', user: { id: 'U_COLE' }, response_url: 'https://hooks.slack.test/r', actions: [{ action_id, value: JSON.stringify(value) }] });
const run = async payload => { const ctx = { waitUntil: p => (ctx.p = p) }; const a = handleMinOffButton(env, ctx, payload, d, { ACK, xfetch }); assert.equal(await a, 'ACK'); await ctx.p; };

await check('Take it off: locusWrite kind min_spend, min 0, as the Slack tapper; the line struck "Done by Cole, undo in Locus"', async () => {
  setSetting('minOff:brand_alpha:2026-10-15', JSON.stringify({ act: 'brand_alpha', date: '2026-10-15', brand: 'Alpha Golf', channel: 'C_ALPHA', ts: '5.000', tag: '<@U_NOMA>',
    items: [{ id: '111', name: '101 | Hook test', min: 20, day: 10, why: 'judged' }, { id: '222', name: '104 | Price test', min: 15, day: 9, why: 'past 7 days' }, { id: '333', name: '106 | Box test', min: 10, day: 12, why: 'judged' }] }));
  writes = []; replaced = [];
  await run(tapPayload('minoff_one_0', { a: 'brand_alpha', d: '2026-10-15', s: '111' }));
  assert.equal(writes.length, 1);
  assert.deepEqual({ ...writes[0].b, reason: undefined }, { act: 'brand_alpha', kind: 'min_spend', object: '111', level: 'adset', min: 0, reason: undefined });
  assert.match(writes[0].b.reason, /day 10, judged/);
  assert.deepEqual(writes[0].ctx, { who: 'Cole' });
  const m = replaced[0];
  assert.equal(m.replace_original, true);
  assert.equal(m.blocks[0].text.text, '<@U_NOMA> ~101 | Hook test: test minimum $20/day~ Done by Cole, undo in Locus');
  assert.equal(m.blocks[0].accessory, undefined, 'no button on a done line');
  assert.equal(m.blocks[3].elements[0].text.text, 'Take all 2 off');
  assert.equal(JSON.parse(getSetting('minOff:brand_alpha:2026-10-15')).items[0].write, 'mw_111');
});
await check('Take all N off: every open line, already-off counts as done, a refusal keeps its button with the reason; a second tap says already done', async () => {
  WRITE['222'] = () => ({ error: 'Nothing would change: it is already set that way.' });
  WRITE['333'] = () => ({ error: 'Meta: (#100) Permission denied' });
  writes = []; replaced = [];
  await run(tapPayload('minoff_all', { a: 'brand_alpha', d: '2026-10-15' }));
  assert.deepEqual(writes.map(w => w.b.object), ['222', '333'], 'the done one is not written again');
  const m = replaced[0];
  assert.match(m.blocks[1].text.text, /^~104 \| Price test: test minimum \$15\/day~ Already off in Meta \(checked by Cole\)$/);
  assert.match(m.blocks[2].text.text, /due off \(day 12, judged\)\. _Didn't work: Meta: \(#100\) Permission denied_$/);
  assert.equal(m.blocks[2].accessory.action_id, 'minoff_one_2', 'the failed line keeps its button');
  assert.equal(m.blocks.length, 3, 'one open line left: no Take all');
  delete WRITE['333'];
  replaced = [];
  await run(tapPayload('minoff_one_2', { a: 'brand_alpha', d: '2026-10-15', s: '333' }));
  assert.match(replaced[0].blocks[2].text.text, /^~106 \| Box test.*Done by Cole/);
  replaced = []; writes = [];
  await run(tapPayload('minoff_all', { a: 'brand_alpha', d: '2026-10-15' }));
  assert.equal(writes.length, 0); assert.equal(replaced[0].text, 'Already done.'); assert.equal(replaced[0].replace_original, false);
});
await check('an old message (no state) says so and writes nothing', async () => {
  writes = []; replaced = [];
  await run(tapPayload('minoff_one_0', { a: 'brand_alpha', d: '2026-10-01', s: '111' }));
  assert.equal(writes.length, 0); assert.match(replaced[0].text, /out of date/);
});
await check('the line and message helpers', async () => {
  assert.equal(minOffLine({ name: 'A <b>', min: 7, day: 8, why: 'past 7 days' }), 'A &lt;b&gt;: test minimum $7/day is due off (day 8, past 7 days).');
  const m = minOffMessage({ act: 'x', date: 'y', items: [{ id: '1', name: 'A', min: 5, day: 8, why: 'judged', done: 'Ravo' }] });
  assert.equal(m.text, '~A: test minimum $5/day~ Done by Ravo, undo in Locus'); assert.equal(m.blocks.length, 1);
});

console.log(`\n${n} passed, ${bad} failed`);
if (bad) process.exit(1);
