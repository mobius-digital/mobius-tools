/* Offline checks for THE BUYER LIST (2026-10-26, src/buyerlist.js): one list across brands sorted by money at stake (ad
 * calls, test minimums due off, Ready cards with approved ads), the shared state (Done = quiet 3 days, Skip = until
 * tomorrow, a Meta write in the last 3 days = watched), the one daily Slack post (head, owner, top 5, launches, button),
 * the tick (once a day from the morning hour, the switch), the settings. In-memory SQLite (node:sqlite); the profit
 * worker, Meta and Slack are mocked.
 *   node test-buyerlist.mjs      (from account-health/worker) */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { buildBuyerList, setState, readState, buyerMessage, buyerPostTick, buyerSettings, saveBuyerSettings, headOf, oneLine, DEFAULT_BUYER_CHANNEL } from './src/buyerlist.js';

const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { st().run(vals(args)); return { success: true }; } }; };
const env = { DB: { prepare: stmt }, OWNER_EMAIL: 'cole@go-mobius-digital.com' };
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE p_meta_write (id TEXT PRIMARY KEY, act TEXT NOT NULL, brand TEXT, level TEXT, object TEXT NOT NULL, name TEXT, action TEXT NOT NULL, field TEXT, before TEXT, after TEXT, summary TEXT, by TEXT, at TEXT NOT NULL, undone TEXT);
  CREATE TABLE p_work_file (id TEXT, batch_id TEXT, ad TEXT, version INTEGER, mime TEXT, name TEXT, created_at TEXT, kind TEXT, deleted_at TEXT);
  CREATE TABLE p_work_comment (id TEXT, batch_id TEXT, file_id TEXT, kind TEXT, parent_id TEXT, fixed_at TEXT, author_name TEXT, created_at TEXT);
  CREATE TABLE p_br_batch (id TEXT, act_id TEXT, brief_json TEXT);
  CREATE TABLE p_launch (id TEXT, act TEXT, batch_id TEXT, work_file TEXT, studio_ad TEXT, cards TEXT, eff_status TEXT);
  CREATE TABLE p_studio_batch (id TEXT, br_batch_id TEXT);
  CREATE TABLE p_studio_ad (id TEXT, batch_id TEXT, status TEXT, created_at TEXT);`);
const setting = k => (db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k) || {}).value ?? null;
const setSetting = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, v);

let today = '2026-10-26', hour = 5, posts = [], dueCalls = [];
const ACCTS = [
  { act_id: 'brand_alpha', name: 'Alpha Golf', currency: 'USD' },
  { act_id: 'brand_beta', name: 'Beta Socks', currency: 'USD' },
  { act_id: 'brand_gal', name: 'Galway Bay', currency: 'USD' },   // paused: never on the list
];
const CALLS = [
  { kind: 'cut', act_id: 'brand_alpha', brand: 'Alpha Golf', adset_id: '111', adset: 'Retarget 7d', stake: 1400, currency: 'USD', why: 'Spent $1,400 (3.5x the goal) with no sale in 7 days. More words here.' },
  { kind: 'scale', act_id: 'brand_beta', brand: 'Beta Socks', adset_id: '222', adset: 'Broad | Gift', stake: 400, currency: 'USD', why: '9 sales at $20 each, under the $40 goal over 7 days. Raise the budget 20% and watch 3 days.' },
  { kind: 'trim', act_id: 'brand_alpha', brand: 'Alpha Golf', adset_id: '333', adset: 'Broad', ad_id: '3331', ad: 'Hook B', stake: 90, currency: 'USD', why: 'This ad costs $120 a sale.' },
  { kind: 'mixed', act_id: 'brand_beta', brand: 'Beta Socks', adset_id: '444', adset: 'LAL 1%', stake: 300, currency: 'USD', why: 'Cheap sales but cost per sale is over the ceiling.' },
  { kind: 'fix', act_id: 'brand_alpha', brand: 'Alpha Golf', why: 'Meta spent nothing yesterday.' },
  { kind: 'cut', act_id: 'brand_gal', brand: 'Galway Bay', adset_id: '999', adset: 'Paused brand', stake: 5000, why: 'x' },
];
const d = {
  centralHour: () => hour, centralDate: () => today, canAfford: () => true,
  listAccounts: async () => ACCTS,
  mintSession: async () => ({ token: 't' }),
  profit: async path => { assert.match(path, /^\/api\/hub\/today\?act=/); return { rows: CALLS }; },
  dueOff: async (e, act) => { dueCalls.push(act); return act === 'brand_beta' ? { due: [{ id: '555', name: '415 | Test 415', min: 20, day: 6, why: 'judged' }] } : { due: [] }; },
  listBoard: async () => ({ cards: [
    { id: 'c1', act_id: 'brand_alpha', brand: 'Alpha Golf', num: '415', title: 'Gift hook', board: 'ready' },
    { id: 'c2', act_id: 'brand_alpha', brand: 'Alpha Golf', num: '416', title: 'Nothing approved', board: 'ready' },
    { id: 'c3', act_id: 'brand_beta', brand: 'Beta Socks', num: '88', title: 'Still making', board: 'making' },
  ] }),
  slackPost: async (e, channel, text, blocks, opts) => { posts.push({ channel, text, blocks, opts }); return { ok: true, ts: '1.0' }; },
  tagOf: async (e, name) => name === 'Cole' ? '<@U_COLE>' : null,
};
/* Card c1: ads 415-1 (approved), 415-2 (approved, already launched), 415-3 (changes asked). c2: one ad in review. */
db.exec(`INSERT INTO p_work_file VALUES ('f1', 'c1', '1', 1, 'image/png', 'a', '2026-10-20', 'version', NULL), ('f2', 'c1', '2', 1, 'image/png', 'b', '2026-10-20', 'version', NULL),
  ('f3', 'c1', '3', 1, 'image/png', 'c', '2026-10-20', 'version', NULL), ('f4', 'c2', '1', 1, 'image/png', 'd', '2026-10-20', 'version', NULL);
  INSERT INTO p_work_comment VALUES ('k1', 'c1', 'f1', 'approval', NULL, NULL, 'Cole', '2026-10-21'), ('k2', 'c1', 'f2', 'approval', NULL, NULL, 'Cole', '2026-10-21'),
  ('k3', 'c1', 'f3', 'change_request', NULL, NULL, 'Cole', '2026-10-21');
  INSERT INTO p_br_batch VALUES ('c1', 'brand_alpha', NULL), ('c2', 'brand_alpha', NULL);
  INSERT INTO p_launch VALUES ('l1', 'brand_alpha', 'c1', 'f2', NULL, NULL, 'PAUSED');`);

let n = 0, bad = 0;
const check = async (name, fn) => { try { await fn(); n++; console.log('PASS ', name); } catch (e) { bad++; console.log('FAIL ', name, '\n   ', e.stack.split('\n').slice(0, 4).join('\n   ')); } };

await check('oneLine: the first sentence, cut at a word', () => {
  assert.equal(oneLine('Spent $1,400 (3.5x the goal) with no sale in 7 days. More words here.'), 'Spent $1,400 (3.5x the goal) with no sale in 7 days.');
  assert.ok(oneLine('word '.repeat(80), 60).endsWith('…'));
});

let list;
await check('one list across brands, by money at stake: calls (no Fix), a test minimum due off, a Ready card with approved ads not on Meta; paused brands left out', async () => {
  list = await buildBuyerList(env, d, { act: 'all' });
  assert.deepEqual(list.rows.map(r => [r.kind, r.brand, r.action]), [
    ['cut', 'Alpha Golf', 'Cut the ad set'], ['scale', 'Beta Socks', 'Raise budget 20%'], ['mixed', 'Beta Socks', 'Your call'],
    ['minoff', 'Beta Socks', 'Take test minimum off'], ['trim', 'Alpha Golf', 'Turn off this ad'], ['launch', 'Alpha Golf', 'Launch 1 approved ad']]);
  assert.equal(list.rows.find(r => r.kind === 'minoff').stake, 140, 'a minimum = a week of it');
  assert.equal(list.rows.find(r => r.kind === 'mixed').do, null, 'Mixed has no Do');
  assert.equal(list.rows.find(r => r.kind === 'launch').card_id, 'c1');
  assert.equal(list.rows[0].why, 'Spent $1,400 (3.5x the goal) with no sale in 7 days.');
  assert.equal(list.n, 6); assert.equal(list.n_brands, 2); assert.equal(list.stake, 1400 + 400 + 300 + 140 + 90);
  assert.equal(list.owner, 'Cole');
  assert.deepEqual(dueCalls.sort(), ['brand_alpha', 'brand_beta'], 'minimums read live once per brand when minoff.js has not run');
});

await check('the live minimum read is cached for the day; minoff.js state wins when it ran', async () => {
  dueCalls = [];
  await buildBuyerList(env, d, { act: 'all' });
  assert.equal(dueCalls.length, 0, 'cached');
  setSetting('minOffDone', JSON.stringify({ date: today, acts: { brand_beta: 'posted 2', brand_alpha: 'nothing due' } }));
  setSetting(`minOff:brand_beta:${today}`, JSON.stringify({ items: [{ id: '555', name: '415', min: 20, day: 6, why: 'judged', done: 'Cole' }, { id: '556', name: '416', min: 10, day: 7, why: 'past 7 days' }] }));
  const l = await buildBuyerList(env, d, { act: 'all' });
  assert.deepEqual(l.rows.filter(r => r.kind === 'minoff').map(r => r.object), ['556'], 'a line taken off in Slack stays off');
});

await check('one brand: only its rows', async () => {
  const l = await buildBuyerList(env, d, { act: 'brand_beta' });
  assert.ok(l.rows.every(r => r.act_id === 'brand_beta'));
});

await check('shared state: Done = quiet 3 days, Skip = until tomorrow, Clear = back; a Meta write on the object in 3 days = watched', async () => {
  await setState(env, { act: 'brand_alpha', object: '111', action: 'cut', status: 'done', name: 'Retarget 7d' }, 'cole@go-mobius-digital.com', today);
  await setState(env, { act: 'brand_beta', object: '444', action: 'mixed', status: 'skipped' }, 'cole@go-mobius-digital.com', today);
  db.prepare(`INSERT INTO p_meta_write VALUES ('mw1', 'act_2', 'brand_beta', 'adset', '222', 'Broad | Gift', 'meta_budget', 'daily_budget', NULL, NULL, 'Budget up', 'ahsan@x', ?, NULL)`).run(new Date(Date.now() - 2 * 864e5).toISOString());
  db.prepare(`INSERT INTO p_meta_write VALUES ('mw2', 'act_1', 'brand_alpha', 'ad', '3331', 'Hook B', 'meta_pause', 'status', NULL, NULL, 'Paused', 'x', ?, NULL)`).run(new Date(Date.now() - 4 * 864e5).toISOString());
  const l = await buildBuyerList(env, d, { act: 'all' });
  assert.deepEqual(l.rows.map(r => r.kind).sort(), ['launch', 'minoff', 'trim'], 'cut done, mixed skipped, scale watched; the 4-day-old write no longer hides the trim');
  assert.deepEqual(l.hidden, { done: 1, skipped: 1, watched: 1 });
  const st = await readState(env, new Set(['brand_alpha']), today);
  assert.equal(st.states.length, 1); assert.equal(st.states[0].quiet_until, '2026-10-29');
  /* tomorrow: the skip is over, the done is not */
  today = '2026-10-27';
  const t2 = await buildBuyerList(env, d, { act: 'all' });
  assert.ok(t2.rows.some(r => r.kind === 'mixed'), 'skip ends tomorrow'); assert.ok(!t2.rows.some(r => r.kind === 'cut'), 'done still quiet');
  today = '2026-10-29';
  const t3 = await buildBuyerList(env, d, { act: 'all' });
  assert.ok(t3.rows.some(r => r.kind === 'cut'), 'done is quiet 3 days, then back if the rule still says so');
  today = '2026-10-26';
  await setState(env, { act: 'brand_alpha', object: '111', action: 'cut', status: 'clear' }, 'x', today);
  assert.ok((await buildBuyerList(env, d, { act: 'all' })).rows.some(r => r.kind === 'cut'), 'clear = back on the list');
  await assert.rejects(setState(env, { act: 'brand_alpha', object: '', action: 'cut', status: 'done' }, 'x', today));
});

await check('the Slack post: head with count, brands and money; owner tagged; top 5; launches named when outside the top 5; Open in Locus', async () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ kind: 'cut', act_id: i < 4 ? 'a' : 'b', brand: i < 4 ? 'Alpha' : 'Beta', name: `Set ${i}`, action: 'Cut the ad set', stake: 1000 - i * 100, currency: 'USD' }))
    .concat([{ kind: 'launch', act_id: 'a', brand: 'Alpha', name: '#415 Gift hook', action: 'Launch 3 approved ads', stake: 0, n_ads: 3 }]);
  const L = { n: rows.length, n_brands: 2, stake: rows.reduce((s, r) => s + r.stake, 0), currency: 'USD', owner: 'Cole', rows };
  const m = buyerMessage(L, '<@U_COLE>');
  const lines = m.text.split('\n');
  assert.equal(lines[0], '*Buyer list: 8 to do across 2 brands, $4.9K at stake*');
  assert.equal(lines[1], 'Owner: <@U_COLE>');
  assert.equal(lines[2], '1. *Alpha*: Cut the ad set, "Set 0" ($1,000 at stake)');
  assert.equal(lines.filter(l => /^\d\. /.test(l)).length, 5);
  assert.match(m.text, /Also 1 card ready to launch \(3 approved ads\)\./);
  assert.match(m.text, /_and 3 more in Locus_/);
  const btn = m.blocks.find(b => b.type === 'actions').elements[0];
  assert.equal(btn.url, 'https://tools.go-mobius-digital.com/profit/?open=buyer&act=all'); assert.equal(btn.action_id, 'noop_open');
  assert.ok(!/—/.test(m.text), 'no em dashes');
  assert.equal(headOf({ n: 0 }), 'Buyer list: nothing to do today');
});

await check('the tick: nothing before the morning hour; ONE post a day to the buyer channel (default #daily-briefs); the switch', async () => {
  hour = 4; assert.match((await buyerPostTick(env, d)).skipped, /before 5am/);
  hour = 5; posts = [];
  const r = await buyerPostTick(env, d);
  assert.equal(posts.length, 1); assert.equal(posts[0].channel, DEFAULT_BUYER_CHANNEL); assert.equal(r.channel, 'C0C8UA53U3W');
  assert.match(posts[0].text, /^\*Buyer list: \d+ to do across 2 brands/); assert.match(posts[0].text, /Owner: <@U_COLE>/);
  hour = 6; await buyerPostTick(env, d);
  assert.equal(posts.length, 1, 'once a day');
  today = '2026-10-30'; setSetting('buyerPost', 'off');
  assert.deepEqual(await buyerPostTick(env, d), { skipped: 'off' });
  setSetting('buyerPost', 'on'); setSetting('buyerChannel', 'C0C8B4ZCGKT');
  await buyerPostTick(env, d);
  assert.equal(posts[1].channel, 'C0C8B4ZCGKT', 'the channel is a setting');
  today = '2026-10-26';
});

await check('settings: owner, channel, post switch; bad input refused', async () => {
  const s = await saveBuyerSettings(env, { buyerOwner: 'Ahsan', buyerChannel: '', buyerPost: false });
  assert.deepEqual(s, { buyerOwner: 'Ahsan', buyerChannel: DEFAULT_BUYER_CHANNEL, buyerPost: false });
  await assert.rejects(saveBuyerSettings(env, { buyerChannel: '#daily-briefs' }));
  await assert.rejects(saveBuyerSettings(env, { buyerOwner: '  ' }));
  assert.equal((await buyerSettings(env)).buyerOwner, 'Ahsan');
});

console.log(`\n${n}/${n + bad} passed`);
if (bad) process.exit(1);
