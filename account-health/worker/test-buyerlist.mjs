/* Offline checks for THE BUYER LIST (2026-10-26, src/buyerlist.js): one list across brands sorted by money at stake (ad
 * calls, test minimums due off, Ready cards with approved ads), the shared state (Done = quiet 3 days, Skip = until
 * tomorrow, a Meta write in the last 3 days = watched), the one daily Slack post (head, owner, top 5, launches, button),
 * the tick (once a day from the morning hour, the switch), the settings. In-memory SQLite (node:sqlite); the profit
 * worker, Meta and Slack are mocked.
 *   node test-buyerlist.mjs      (from account-health/worker) */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { buildBuyerList, setState, readState, buyerMessage, buyerPostTick, buyerSettings, saveBuyerSettings, headOf, oneLine, shortWhy, DEFAULT_BUYER_CHANNEL,
  normDays, isLaunchDay, nextLaunchDay, launchedRows } from './src/buyerlist.js';
import { cardToLive } from './src/launch.js';

const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { st().run(vals(args)); return { success: true }; } }; };
const env = { DB: { prepare: stmt }, OWNER_EMAIL: 'cole@go-mobius-digital.com' };
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE p_meta_write (id TEXT PRIMARY KEY, act TEXT NOT NULL, brand TEXT, level TEXT, object TEXT NOT NULL, name TEXT, action TEXT NOT NULL, field TEXT, before TEXT, after TEXT, summary TEXT, by TEXT, at TEXT NOT NULL, undone TEXT);
  CREATE TABLE p_work_file (id TEXT, batch_id TEXT, ad TEXT, version INTEGER, mime TEXT, name TEXT, created_at TEXT, kind TEXT, deleted_at TEXT);
  CREATE TABLE p_work_comment (id TEXT, batch_id TEXT, file_id TEXT, kind TEXT, parent_id TEXT, fixed_at TEXT, author_name TEXT, created_at TEXT);
  CREATE TABLE p_br_batch (id TEXT, act_id TEXT, brief_json TEXT, num TEXT, title TEXT, stage TEXT, board_stage TEXT, asana_section TEXT);
  CREATE TABLE p_launch (id TEXT, act TEXT, meta_act TEXT, batch_id TEXT, num TEXT, work_file TEXT, studio_ad TEXT, cards TEXT, ad_id TEXT, ad_name TEXT, adset_id TEXT, adset_name TEXT,
    status TEXT, eff_status TEXT, checked_at TEXT, by TEXT, at TEXT);
  CREATE TABLE p_studio_batch (id TEXT, br_batch_id TEXT);
  CREATE TABLE p_studio_ad (id TEXT, batch_id TEXT, status TEXT, created_at TEXT);`);
const setting = k => (db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k) || {}).value ?? null;
const setSetting = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, v);

let BOARD = [
  { id: 'c1', act_id: 'brand_alpha', brand: 'Alpha Golf', num: '415', title: 'Gift hook', board: 'ready' },
  { id: 'c2', act_id: 'brand_alpha', brand: 'Alpha Golf', num: '416', title: 'Nothing approved', board: 'ready' },
  { id: 'c3', act_id: 'brand_beta', brand: 'Beta Socks', num: '88', title: 'Still making', board: 'making' },
];
let today = '2026-10-26', hour = 5, posts = [], dueCalls = [];
/* The morning read (buyerai.js) is tested in test-buyerai.mjs; off here so the post does not wait for it. */
setSetting('buyerAI', 'off');
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
  profit: async path => { assert.match(path, /^\/api\/hub\/today\?act=/); return { rows: CALLS, banners: [{ act_id: 'brand_beta', brand: 'Beta Socks', kind: 'tracking_gap', text: 'Tracking gap on Beta Socks: no cuts until tracking is fixed.' }, { act_id: 'brand_gal', brand: 'Galway Bay', kind: 'tracking_gap', text: 'x' }] }; },
  dueOff: async (e, act) => { dueCalls.push(act); return act === 'brand_beta' ? { due: [{ id: '555', name: '415 | Test 415', min: 20, day: 6, why: 'judged' }] } : { due: [] }; },
  listBoard: async () => ({ cards: BOARD }),
  slackPost: async (e, channel, text, blocks, opts) => { posts.push({ channel, text, blocks, opts }); return { ok: true, ts: '1.0' }; },
  tagOf: async (e, name) => name === 'Cole' ? '<@U_COLE>' : null,
};
/* Card c1: ads 415-1 (approved), 415-2 (approved, already launched), 415-3 (changes asked). c2: one ad in review. */
db.exec(`INSERT INTO p_work_file VALUES ('f1', 'c1', '1', 1, 'image/png', 'a', '2026-10-20', 'version', NULL), ('f2', 'c1', '2', 1, 'image/png', 'b', '2026-10-20', 'version', NULL),
  ('f3', 'c1', '3', 1, 'image/png', 'c', '2026-10-20', 'version', NULL), ('f4', 'c2', '1', 1, 'image/png', 'd', '2026-10-20', 'version', NULL);
  INSERT INTO p_work_comment VALUES ('k1', 'c1', 'f1', 'approval', NULL, NULL, 'Cole', '2026-10-21'), ('k2', 'c1', 'f2', 'approval', NULL, NULL, 'Cole', '2026-10-21'),
  ('k3', 'c1', 'f3', 'change_request', NULL, NULL, 'Cole', '2026-10-21');
  INSERT INTO p_br_batch (id, act_id, brief_json, num, title) VALUES ('c1', 'brand_alpha', NULL, '415', 'Gift hook'), ('c2', 'brand_alpha', NULL, '416', 'Nothing approved');
  INSERT INTO p_launch (id, act, batch_id, work_file, eff_status, at) VALUES ('l1', 'brand_alpha', 'c1', 'f2', 'PAUSED', '2026-01-01T00:00:00Z');`);

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
    ['cut', 'Alpha Golf', 'Pause this ad set'], ['trim', 'Alpha Golf', 'Pause this ad'], ['launch', 'Alpha Golf', 'Launch 1 approved ad'],
    ['scale', 'Beta Socks', 'Raise budget 20%'], ['mixed', 'Beta Socks', 'Your call'], ['minoff', 'Beta Socks', 'Take the test minimum off']],
    'grouped by brand, the brand with the most money at stake first, then by money inside it');
  assert.deepEqual(list.groups.map(g => [g.brand, g.n, g.n_do, g.stake]), [['Alpha Golf', 3, 2, 1490], ['Beta Socks', 3, 2, 840]]);
  assert.equal(list.n_do, 4, 'Agree to all can make the cut, the trim, the scale and the minimum; launch and Your call need Cole');
  assert.equal(list.rows.find(r => r.kind === 'minoff').stake, 140, 'a minimum = a week of it');
  assert.equal(list.rows.find(r => r.kind === 'mixed').do, null, 'Mixed has no Do');
  assert.equal(list.rows.find(r => r.kind === 'launch').card_id, 'c1');
  assert.equal(list.rows[0].why, 'Spent $1,400 (3.5x the goal) with no sale in 7 days.');
  assert.equal(list.n, 6); assert.equal(list.n_brands, 2); assert.equal(list.stake, 1400 + 400 + 300 + 140 + 90);
  assert.equal(list.owner, 'Cole');
  assert.deepEqual(list.banners.map(b => b.brand), ['Beta Socks'], 'tracking gap banner passes through, paused brands left out');
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
  assert.deepEqual(l.hidden, { done: 1, skipped: 1, watched: 1, dropped: 0, locked: 0 });
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

await check('the Slack DM: "N changes ready across B brands, $X at stake", the top 5 one-liners and Open; nothing else', async () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ kind: 'cut', act_id: i < 4 ? 'a' : 'b', brand: i < 4 ? 'Alpha' : 'Beta', name: `Set ${i}`, action: 'Pause this ad set', stake: 1000 - i * 100, currency: 'USD' }))
    .concat([{ kind: 'launch', act_id: 'a', brand: 'Alpha', name: '#415 Gift hook', action: 'Launch 3 approved ads', stake: 0, n_ads: 3 }]);
  const L = { n: rows.length, n_brands: 2, stake: rows.reduce((s, r) => s + r.stake, 0), currency: 'USD', owner: 'Cole', rows, launched_yesterday: { n: 4, brands: ['Alpha'] }, ai: { n_read: 2 } };
  const m = buyerMessage(L, '<@U_COLE>');
  const lines = m.text.split('\n');
  assert.equal(lines[0], '*8 changes ready across 2 brands, $4.9K at stake*');
  assert.equal(lines[1], '• *Alpha*: Pause this ad set, "Set 0"');
  assert.equal(lines.length, 6, 'the head and 5 one-liners, nothing else');
  assert.ok(!/Owner|Launched yesterday|Morning read|more in Locus/.test(m.text));
  const btn = m.blocks.find(b => b.type === 'actions').elements[0];
  assert.equal(btn.url, 'https://tools.go-mobius-digital.com/profit/?open=buyer&act=all'); assert.equal(btn.action_id, 'noop_open'); assert.equal(btn.text.text, 'Open');
  assert.ok(!/—/.test(m.text), 'no em dashes');
  assert.equal(headOf({ n: 0 }), 'Buyer list: nothing to do today');
  assert.equal(headOf({ n: 1, n_brands: 1, stake: 0 }), '1 change ready across 1 brand');
});

await check('one-line why: at most 3 numbers; the full reason stays for the details', () => {
  assert.equal(shortWhy({ kind: 'cut', spend: 561, results: 0, days: 7, judged_on: 'roas', goal_roas: 2.2, currency: 'USD' }), '$561 in 7 days, 0 sales, goal ROAS 2.2x');
  assert.equal(shortWhy({ kind: 'cut', spend: 400, results: 4, cpa: 100, goal: 52, days: 7, judged_on: 'cpa' }), '$400 in 7 days, $100 a sale, goal $52');
  assert.equal(shortWhy({ kind: 'scale', spend: 400, results: 9, cpa: 20, goal: 40, days: 7, judged_on: 'cpa' }), '9 sales at $20 each in 7 days, goal $40');
  assert.equal(shortWhy({ kind: 'trim', spend: 300, results: 1, roas: 0.8, goal_roas: 2.2, days: 7, judged_on: 'roas' }), '$300 in 7 days, ROAS 0.8x, goal ROAS 2.2x');
  assert.equal(shortWhy({ kind: 'refresh', ctr: 0.0161, prev_ctr: 0.029, why: 'x' }), 'The main ad gets 44% fewer clicks than last week');
});

await check('the tick: nothing before the morning hour; ONE post a day to the buyer channel (default #daily-briefs); the switch', async () => {
  hour = 4; assert.match((await buyerPostTick(env, d)).skipped, /before 5am/);
  hour = 5; posts = [];
  const r = await buyerPostTick(env, d);
  assert.equal(posts.length, 1); assert.equal(posts[0].channel, DEFAULT_BUYER_CHANNEL); assert.equal(r.channel, 'C0C8UA53U3W');
  assert.match(posts[0].text, /^\*\d+ changes ready across 2 brands/);
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
  assert.deepEqual(s, { buyerOwner: 'Ahsan', buyerChannel: DEFAULT_BUYER_CHANNEL, buyerPost: false, launchDays: 'mon,thu', buyerAI: false });
  assert.equal((await saveBuyerSettings(env, { launchDays: ['thu', 'Tue'] })).launchDays, 'tue,thu', 'week order');
  await assert.rejects(saveBuyerSettings(env, { launchDays: 'someday' }));
  await saveBuyerSettings(env, { launchDays: 'mon,thu' });
  await assert.rejects(saveBuyerSettings(env, { buyerChannel: '#daily-briefs' }));
  await assert.rejects(saveBuyerSettings(env, { buyerOwner: '  ' }));
  assert.equal((await buyerSettings(env)).buyerOwner, 'Ahsan');
});

await check('launch days: Monday and Thursday by default; the next one is never today', () => {
  assert.equal(normDays('Mon, thursday'), 'mon,thu'); assert.equal(normDays(''), null);
  assert.ok(isLaunchDay('2026-10-26', 'mon,thu')); assert.ok(!isLaunchDay('2026-10-27', 'mon,thu')); assert.ok(isLaunchDay('2026-10-29', 'mon,thu'));
  assert.equal(nextLaunchDay('2026-10-26', 'mon,thu'), '2026-10-29'); assert.equal(nextLaunchDay('2026-10-29', 'mon,thu'), '2026-11-02');
});

/* c4: Ready, one approved ad, its own date Wed Oct 28. c5: Review, dated Nov 27 (BFCM). */
db.exec(`INSERT INTO p_work_file VALUES ('f5', 'c4', '1', 1, 'image/png', 'e', '2026-10-20', 'version', NULL);
  INSERT INTO p_work_comment VALUES ('k5', 'c4', 'f5', 'approval', NULL, NULL, 'Cole', '2026-10-21');
  INSERT INTO p_br_batch (id, act_id, num, title) VALUES ('c4', 'brand_beta', '90', 'Dated drop'), ('c5', 'brand_beta', '91', 'Black Friday');`);
BOARD.push({ id: 'c4', act_id: 'brand_beta', brand: 'Beta Socks', num: '90', title: 'Dated drop', board: 'ready', launch_on: '2026-10-28' },
  { id: 'c5', act_id: 'brand_beta', brand: 'Beta Socks', num: '91', title: 'Black Friday', board: 'review', launch_on: '2026-11-27' });

await check('a Ready card is a Launch row only on a launch day; any other day it waits for the next one (quiet line), a dated card waits for its date', async () => {
  today = '2026-10-27';   // Tuesday
  let l = await buildBuyerList(env, d, { act: 'all' });
  assert.ok(!l.rows.some(r => r.kind === 'launch'), 'no launch to-dos on a Tuesday');
  assert.equal(l.launch_today, false);
  assert.deepEqual(l.next_launch, { date: '2026-10-29', day: 'Thursday', n: 1, n_ads: 1 });
  assert.deepEqual(l.scheduled.map(s => [s.card_id, s.date, s.dated, s.n_ads, s.board]),
    [['c4', '2026-10-28', true, 1, 'ready'], ['c1', '2026-10-29', false, 1, 'ready'], ['c5', '2026-11-27', true, null, 'review']]);
  today = '2026-10-28';   // Wednesday, c4's own date
  l = await buildBuyerList(env, d, { act: 'all' });
  assert.deepEqual(l.rows.filter(r => r.kind === 'launch').map(r => [r.card_id, r.launch_on]), [['c4', '2026-10-28']], 'a dated card goes out on its date, any weekday');
  today = '2026-10-29';   // Thursday
  l = await buildBuyerList(env, d, { act: 'all' });
  assert.deepEqual(l.rows.filter(r => r.kind === 'launch').map(r => r.card_id).sort(), ['c1', 'c4'], 'launch day: both, and the past-dated one stays until launched');
  assert.deepEqual(l.scheduled.map(s => s.card_id), ['c5']);
  today = '2026-10-26';
});

const realToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
const realYest = new Date(Date.parse(realToday + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
await check('Launched: p_launch of the last 30 days, newest first, with brand, ad, ad set, who, status and the card; yesterday counted for the post', async () => {
  const at1 = new Date(Date.parse(realYest + 'T17:00:00Z')).toISOString(), at2 = new Date(Date.parse(realYest + 'T18:00:00Z')).toISOString();
  db.prepare(`INSERT INTO p_launch (id, act, meta_act, batch_id, num, ad_id, ad_name, adset_id, adset_name, status, eff_status, checked_at, by, at) VALUES
    ('l2', 'brand_alpha', 'act_1', 'c1', '415', '9001', '415-1 | Still', '77', 'Testing', 'PAUSED', 'PAUSED', ?1, 'cole@go-mobius-digital.com', ?1),
    ('l3', 'brand_beta', 'act_2', NULL, NULL, '9002', '90-1 | Video', '78', 'Testing', 'ACTIVE', 'ACTIVE', ?2, 'ahsan@x', ?2),
    ('l4', 'brand_beta', 'act_2', NULL, NULL, '9003', 'old', '78', 'Testing', 'PAUSED', 'PAUSED', NULL, 'x', '2026-01-02T00:00:00Z')`.replace(/\?(\d)/g, ':p$1')).run({ p1: at1, p2: at2 });
  const rows = await launchedRows(env, ACCTS);
  assert.deepEqual(rows.map(r => [r.id, r.brand, r.ad_name, r.adset, r.card]), [['l3', 'Beta Socks', '90-1 | Video', 'Testing', null], ['l2', 'Alpha Golf', '415-1 | Still', 'Testing', '#415 Gift hook']]);
  assert.equal(rows[1].checked, false, 'never read again = created paused'); assert.match(rows[0].ads_manager, /act=2&selected_ad_ids=9002/);
  assert.equal((await launchedRows(env, ACCTS.slice(1))).length, 1, 'only the brands asked for');
  today = realToday;
  const l = await buildBuyerList(env, d, { act: 'all' });
  assert.deepEqual(l.launched_yesterday, { n: 2, brands: ['Beta Socks', 'Alpha Golf'] });
  today = '2026-10-26';
});

await check('a single ad or carousel launch moves its card to Live only from Ready or Review', async () => {
  db.exec(`INSERT INTO p_br_batch (id, act_id, board_stage, stage) VALUES ('m1', 'brand_alpha', 'ready', 'production'), ('m2', 'brand_alpha', 'live', 'live'), ('m3', 'brand_alpha', NULL, 'production');
    UPDATE p_br_batch SET asana_section = 'Ready to launch' WHERE id = 'm3';`);
  const moved = [];
  const md = { moveCard: async (e, id) => { moved.push(id); return { to: 'live', asana: { moved: true } }; } };
  assert.deepEqual(await cardToLive(env, md, 'm1', 'x'), { to: 'live', asana: { moved: true } });
  assert.equal(await cardToLive(env, md, 'm2', 'x'), null);
  await cardToLive(env, md, 'm3', 'x'); await cardToLive(env, md, null, 'x');
  assert.deepEqual(moved, ['m1', 'm3']);
});

console.log(`\n${n}/${n + bad} passed`);
if (bad) process.exit(1);
