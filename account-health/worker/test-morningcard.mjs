/* Offline checks for THE MORNING CARD (2026-10-13, src/morningcard.js): one card per brand in its internal channel at
 * the morning hour, the 5-line cap with "and N more", tags from the roster, the thread (calls list + reminder lines),
 * the Monday line, the card updated in place on Done and on a ✅, alerts and requests replying in its thread, a brand
 * whose internal channel is its client channel skipped, once a day. In-memory SQLite (node:sqlite); Slack, the profit
 * worker (Today's calls), the calendar and the Production board are mocked.
 *   node test-morningcard.mjs      (from account-health/worker) */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { morningCardTick, previewCard, teamPost, cardActionDone, cardCallMade, cardProdDone, cardBriefState, cardReaction, callsText, morningHour, MAX_LINES, buildCard } from './src/morningcard.js';
import { addAction, markDone, onActionDone, handleReaction, actionTick, ensureActions } from './src/actions.js';
import { postTo as alertPost } from './src/alerts.js';

const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { st().run(vals(args)); return { success: true }; } }; };
const env = { DB: { prepare: stmt }, OWNER_EMAIL: 'cole@go-mobius-digital.com' };
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE briefs (act_id TEXT, date TEXT, posted_at TEXT, channel TEXT, status TEXT, text TEXT, data_json TEXT, PRIMARY KEY (act_id, date));
  CREATE TABLE reports (act_id TEXT, period TEXT, period_start TEXT, status TEXT);
  CREATE TABLE p_request (id TEXT, act_id TEXT, kind TEXT, title TEXT, status TEXT, created_at TEXT);
  CREATE TABLE p_br_batch (id TEXT, act_id TEXT);`);
await ensureActions(env);
const setting = k => (db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k) || {}).value ?? null;
const setSetting = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, v);

let hour = 5, today = '2026-10-13', posts = [], updates = [], reads = [];
const ACCTS = [
  { act_id: 'brand_alpha', name: 'Alpha Golf', slack_channel: 'C_ALPHA', brief_channel: 'C_ALPHA_CLIENT', brief_enabled: 1, currency: 'USD' },
  { act_id: 'brand_beta', name: 'Beta Socks', slack_channel: 'C_BETA', brief_channel: 'C_BETA_CLIENT', brief_enabled: 1, currency: 'USD' },
  { act_id: 'brand_gamma', name: 'Gamma Patch', slack_channel: 'C_GAMMA', brief_channel: 'C_GAMMA', brief_enabled: 1 },
  { act_id: 'brand_gal', name: 'Galway Bay', slack_channel: 'C_GAL', brief_channel: 'C_GAL2', brief_enabled: 1 },
  { act_id: 'brand_harbor', name: 'Harborline', slack_channel: 'C_HB', brief_channel: 'C_HB2', brief_enabled: 1 },
];
const CALLS = { brand_alpha: [
  { kind: 'cut', adset_id: 'as1', adset: 'Retarget 7d', stake: 1400, currency: 'USD', why: 'No sale in 7 days.' },
  { kind: 'cut', adset_id: 'as2', adset: 'Broad 2', stake: 600, currency: 'USD', why: 'Cost per sale 2x the goal.' },
  { kind: 'scale', adset_id: 'as3', adset: 'Broad | Gift', stake: 400, currency: 'USD', why: '9 sales under goal.' },
  { kind: 'fix', why: 'Meta spent nothing yesterday.' }] };
const d = {
  centralHour: () => hour, centralDate: () => today, canAfford: () => true,
  getSetting: async (e, k) => setting(k), putSetting: async (e, k, v) => setSetting(k, String(v)),
  listAccounts: async () => ACCTS,
  listBrands: async () => ACCTS.map(a => ({ act_id: a.act_id, name: a.name, slack_channel: a.slack_channel })),
  mintSession: async (e, email) => ({ token: 'tok-' + email }),
  profit: async path => { reads.push(path); return { rows: CALLS[new URL('http://x' + path).searchParams.get('act')] || [] }; },
  slackPost: async (e, channel, text, blocks, opts = {}) => { posts.push({ channel, text, blocks, opts }); return { ok: true, ts: `${100 + posts.length}.000`, channel }; },
  slackApi: async (e, method, body) => {
    if (method === 'users.lookupByEmail') return body.email === 'ahsan@go-mobius-digital.com' ? { ok: true, user: { id: 'U_AHSAN' } } : body.email === 'cole@go-mobius-digital.com' ? { ok: true, user: { id: 'U_COLE' } } : { ok: false, error: 'users_not_found' };
    if (method === 'users.list') return { ok: true, members: [{ id: 'U_RAD', real_name: 'Radhesh Kumar' }, { id: 'U_BOT', real_name: 'Radhesh Bot', is_bot: true }] };
    if (method === 'users.info') return { ok: true, user: { real_name: 'Cole' } };
    if (method === 'chat.update') { updates.push(body); return { ok: true }; }
    if (method === 'chat.postMessage') { posts.push({ channel: body.channel, text: body.text, blocks: body.blocks, opts: body }); return { ok: true, ts: `${100 + posts.length}.000` }; }
    return { ok: true };
  },
  teamOf: async (e, ids) => Object.fromEntries(ids.map(id => [id, { strat: 'Ahsan', buyer: 'Ahsan' }])),
  calendarData: async () => ({ items: [{ id: 'ev1', act: 'brand_alpha', name: 'Fall drop', start: '2026-10-14', steps: [{ label: 'Ads loaded', state: 'open', who: 'Ahsan' }, { label: 'Email', state: 'done', who: 'Cole' }] }] }),
  listBoard: async () => ({ cards: [{ id: 'b9', act_id: 'brand_alpha', num: '312', title: 'Hook test', board: 'making', due: '2026-10-10', late: true, assignee: 'Ravo' }] }),
};
onActionDone((e, row) => cardActionDone(e, d, row));
const brief = (act, date, status, sales = 1438.11, plan = 1800.19, mer = 2.1052, posted = '2026-10-13T10:12:42.032Z') =>
  db.prepare(`INSERT OR REPLACE INTO briefs (act_id, date, posted_at, status, data_json) VALUES (?, ?, ?, ?, ?)`).run(act, date, posted, status, JSON.stringify({ day: { a: { sales, mer }, f: { sales: plan } } }));
let n = 0, bad = 0;
const check = async (name, fn) => { try { await fn(); n++; console.log('PASS ', name); } catch (e) { bad++; console.log('FAIL ', name, '\n   ', e.stack.split('\n').slice(0, 3).join('\n   ')); } };

const ids = {};
await check('setup: tasks due today and overdue for Alpha (more than five lines in all), one for Beta', async () => {
  ids.t1 = (await addAction(env, { act: 'brand_alpha', text: 'Finish the Meta account consolidation', owner: 'Ahsan', due: '2026-10-13' })).id;
  ids.t2 = (await addAction(env, { act: 'brand_alpha', text: 'Review the Web Skitters site', owner: 'Radhesh', due: '2026-10-11' })).id;
  ids.t3 = (await addAction(env, { act: 'brand_alpha', text: 'Gifting angles for Trybe creators', owner: 'Cole', due: '2026-10-13' })).id;
  ids.t4 = (await addAction(env, { act: 'brand_alpha', text: 'Send the size chart', owner: 'Noma', due: '2026-10-13' })).id;
  ids.t5 = (await addAction(env, { act: 'brand_alpha', text: 'Not due yet', owner: 'Ahsan', due: '2026-10-20' })).id;
  ids.b1 = (await addAction(env, { act: 'brand_beta', text: 'Ask for the photos', owner: 'Somebody', due: '2026-10-13' })).id;
  db.prepare(`INSERT INTO p_request VALUES ('rq1', 'brand_alpha', 'ask', 'Fall polo samples', 'open', '2026-10-09T15:00:00Z')`).run();
  db.prepare(`INSERT INTO p_br_batch VALUES ('b9', 'brand_alpha')`).run();
  assert.equal(await morningHour(env), 5, 'the default morning hour is 5');
});

await check('the tick: nothing before the hour; a brand whose brief is not in waits (up to two hours)', async () => {
  hour = 4; assert.deepEqual(await morningCardTick(env, d), { skipped: 'before 5am Central' });
  hour = 5; posts = [];
  const r = await morningCardTick(env, d);
  assert.equal(posts.length, 0, 'no brief yet = no card yet');
  assert.match(r.waiting.join(' '), /Alpha Golf \(the brief is not written yet\)/);
});

let alphaCard;
await check('one card per brand to its INTERNAL channel; internal = client channel, paused and Harborline skipped; 5 lines max + "and N more"; tags from the roster', async () => {
  brief('brand_alpha', '2026-10-12', 'sent'); brief('brand_beta', '2026-10-12', 'draft', 900, 1000, 3);
  posts = []; reads = [];
  const r = await morningCardTick(env, d);
  assert.deepEqual(r.posted.sort(), ['Alpha Golf', 'Beta Socks']);
  assert.equal(JSON.parse(setting('morningCardDone')).acts.brand_gamma, 'no internal channel', 'internal channel is the client channel');
  assert.ok(!reads.some(p => /brand_gal|brand_harbor/.test(p)), 'paused and Harborline never read');
  const top = posts.filter(p => !p.opts.thread_ts);
  assert.deepEqual(top.map(p => p.channel).sort(), ['C_ALPHA', 'C_BETA'], 'one top-level post per brand, never a client channel');
  alphaCard = top.find(p => p.channel === 'C_ALPHA');
  const lines = alphaCard.text.split('\n');
  assert.equal(lines[0], '*Alpha Golf · Tue Oct 13*');
  assert.equal(lines[1], 'Yesterday $1,438 (plan $1,800) · MER 2.11x · client daily sent 5:12');
  assert.equal(lines[2], '<@U_AHSAN> Today\'s calls: cut 2 ad sets, scale 1 · $2.4K at stake', 'calls first, one line, buyer tagged');
  const action = lines.slice(2).filter(l => /^(<@|\*[A-Z])/.test(l) && !/^\*Client owes/.test(l));
  assert.equal(action.length, MAX_LINES, 'five lines at most');
  assert.ok(lines.includes('_and 2 more in Locus_'), 'the rest are counted');
  assert.ok(lines.some(l => l === '<@U_RAD> Review the Web Skitters site · 2 days late'), 'no roster email: one users.list match');
  assert.ok(lines.some(l => /^\*Ravo\* 312 - Hook test · Making · 3 days late$/.test(l)), 'late production card, a bold name when Slack has no id');
  assert.ok(lines.includes('*Client owes* Fall polo samples · 4 days'));
  assert.ok(!/Weekly report/.test(alphaCard.text), 'no weekly line on a Tuesday');
  const btns = alphaCard.blocks.filter(b => b.type === 'actions').map(b => b.elements[0]);
  assert.deepEqual(btns.map(b => [b.text.text, b.url, b.action_id]), [['Open Alpha Golf in Locus', 'https://tools.go-mobius-digital.com/profit/?act=brand_alpha', 'noop_open'], ['Make the calls', 'https://tools.go-mobius-digital.com/profit/?open=today&act=brand_alpha', 'noop_open']]);
  const beta = top.find(p => p.channel === 'C_BETA');
  assert.match(beta.text.split('\n')[1], /client daily waiting for your OK$/);
  assert.equal(beta.blocks.filter(b => b.type === 'actions').length, 1, 'no calls = no Make the calls button');
  assert.ok(!/—/.test(JSON.stringify(posts)), 'no em dash anywhere');
});

await check('the thread: the full calls list, then one reminder line per owner with Done buttons; the rows point at their line', async () => {
  const thread = posts.filter(p => p.opts.thread_ts === '101.000' || (p.opts.thread_ts && p.channel === 'C_ALPHA'));
  const ts = JSON.parse(setting('morningCard:brand_alpha:2026-10-13')).ts;
  assert.ok(thread.every(p => p.opts.thread_ts === ts), 'every reply is under the card');
  assert.match(thread[0].text, /^Today's calls: Alpha Golf\n\*Cut\* "Retarget 7d", \$1,400 at stake/);
  assert.ok(!thread[0].blocks.some(b => b.type === 'context' || b.type === 'actions'), 'no buttons or footnote on the list in the thread');
  const rem = thread.slice(1);
  assert.equal(rem.length, 4, 'Ahsan, Radhesh, Cole, Noma');
  assert.ok(rem.some(p => /^<@U_AHSAN>, Alpha Golf: 1 due today\./.test(p.text)));
  assert.ok(rem.every(p => p.blocks.some(b => b.type === 'actions' && b.elements.some(e => /^act_done_/.test(e.action_id)))), 'Done buttons on each line');
  const row = db.prepare(`SELECT reminded_on, slack_channel, slack_ts FROM p_action WHERE id = ?`).get(ids.t2);
  assert.equal(row.reminded_on, '2026-10-13'); assert.equal(row.slack_channel, 'C_ALPHA'); assert.ok(rem.some(p => p.opts && posts.indexOf(p) >= 0) && row.slack_ts);
  assert.equal(db.prepare(`SELECT reminded_on FROM p_action WHERE id = ?`).get(ids.t5).reminded_on, null, 'not due yet = not reminded');
});

await check('once a day: a second tick posts nothing; actionTick has nothing left to remind for those brands', async () => {
  posts = [];
  const r = await morningCardTick(env, d);
  assert.equal(r.skipped, 'all posted today'); assert.equal(posts.length, 0);
  hour = 7;
  const a = await actionTick(env, { ...d, listBrands: d.listBrands });
  assert.equal(posts.length, 0, `nothing re-posted (${JSON.stringify(a)})`);
  hour = 5;
});

await check('Done anywhere updates the card in place: struck through, no new message; opening it again restores it', async () => {
  posts = []; updates = [];
  await markDone(env, ids.t2, true, { by: 'Radhesh', how: 'slack' });
  assert.equal(posts.length, 0, 'never a new post');
  assert.equal(updates.length, 1); assert.equal(updates[0].channel, 'C_ALPHA');
  assert.ok(updates[0].text.includes('<@U_RAD> ~Review the Web Skitters site · 2 days late~ ✓'));
  await markDone(env, ids.t2, false);
  assert.ok(updates[1].text.includes('<@U_RAD> Review the Web Skitters site · 2 days late') && !updates[1].text.includes('~Review'));
});

await check('a ✅ on the card itself marks every task line on it done (one redraw); a ✅ elsewhere is ignored', async () => {
  updates = [];
  const c = JSON.parse(setting('morningCard:brand_alpha:2026-10-13'));
  const ad = { ...d, cardReaction: (e, ev) => cardReaction(e, d, ev) };
  const r = await handleReaction(env, ad, { type: 'reaction_added', reaction: 'white_check_mark', user: 'U_COLE', item: { channel: 'C_ALPHA', ts: c.ts } });
  assert.equal(r.card, true); assert.equal(r.done, 2, "the two task lines shown");
  const shownTasks = c.items.filter(i => i.kind === 'task').flatMap(i => i.ids);
  for (const id of shownTasks) assert.equal(db.prepare(`SELECT status FROM p_action WHERE id = ?`).get(id).status, 'done');
  assert.equal(updates.length, 1, 'one redraw, not one per line');
  assert.ok(!/~Today's calls/.test(updates[0].text), 'the calls line is not a task');
  const r2 = await handleReaction(env, ad, { type: 'reaction_added', reaction: 'white_check_mark', item: { channel: 'C_ALPHA', ts: '999.000' } });
  assert.equal(r2.ignored, 'not a reminder');
});

await check('calls made on the page count on the line; all made = struck; a judged late Production card is struck; the daily sent later updates line 2', async () => {
  updates = [];
  assert.equal(await cardCallMade(env, d, 'brand_alpha', 'as1'), true);
  assert.match(updates[0].text, /scale 1 · \$2\.4K at stake · 1 of 3 made/);
  await cardCallMade(env, d, 'brand_alpha', 'as2'); await cardCallMade(env, d, 'brand_alpha', 'as3');
  assert.match(updates[2].text, /<@U_AHSAN> ~Today's calls: cut 2 ad sets, scale 1 · \$2\.4K at stake~ ✓/);
  assert.equal(await cardCallMade(env, d, 'brand_alpha', 'not-a-call'), false);
  await cardProdDone(env, d, 'b9');
  assert.match(updates[3].text, /\*Ravo\* ~312 - Hook test · Making · 3 days late~ ✓/);
  brief('brand_beta', '2026-10-12', 'sent', 900, 1000, 3, '2026-10-13T12:40:00Z');
  await cardBriefState(env, d, ACCTS[1]);
  assert.match(updates[4].text, /Yesterday \$900 \(plan \$1,000\) · MER 3\.00x · client daily sent 7:40/);
});

await check('later posts go in the card\'s thread with the person tagged (alerts, requests, calendar, meetings use teamPost); no card = top-level', async () => {
  posts = [];
  const c = JSON.parse(setting('morningCard:brand_alpha:2026-10-13'));
  await teamPost(env, d, 'C_ALPHA', '*Fela asked for something: new photos.*', [{ type: 'section', text: { type: 'mrkdwn', text: '*Fela asked for something: new photos.*' } }], { username: 'Locus', tagName: 'Ahsan' });
  assert.equal(posts[0].opts.thread_ts, c.ts); assert.match(posts[0].text, /^<@U_AHSAN> \*Fela asked/); assert.match(posts[0].blocks[0].text.text, /^<@U_AHSAN> /);
  assert.ok(!('reply_broadcast' in posts[0].opts));
  await teamPost(env, d, 'C_GAMMA', 'no card here', null, { tagName: 'Ahsan' });
  assert.equal(posts[1].opts.thread_ts, undefined, 'no card in that channel = top-level, untagged as before'); assert.equal(posts[1].text, 'no card here');
  await alertPost(env, d, 'C_ALPHA', { text: '<@U_COLE> Revenue is 40% under a normal day', blocks: [] });
  assert.equal(posts[2].opts.thread_ts, c.ts, 'a fired alert replies under the card');
  await alertPost(env, d, 'C_ALPHA', { text: 'test', blocks: [] }, { thread: false });
  assert.equal(posts[3].opts.thread_ts, undefined, 'a test alert from Locus posts where it would without a card');
});

await check('Monday: the weekly line, and the card waits for the weekly report (posting anyway after two hours)', async () => {
  today = '2026-10-12'; hour = 5; posts = [];
  brief('brand_alpha', '2026-10-11', 'sent'); brief('brand_beta', '2026-10-11', 'sent');
  let r = await morningCardTick(env, d);
  assert.equal(posts.length, 0); assert.match(r.waiting.join(' '), /weekly report is not drafted yet/);
  db.prepare(`INSERT INTO reports VALUES ('brand_alpha', 'weekly', '2026-10-05', 'draft')`).run();
  r = await morningCardTick(env, d);
  const a = posts.find(p => p.channel === 'C_ALPHA' && !p.opts.thread_ts);
  assert.match(a.text, /\nWeekly report drafted · write this week's plan in this thread$/);
  hour = 7; r = await morningCardTick(env, d);
  const b = posts.find(p => p.channel === 'C_BETA' && !p.opts.thread_ts);
  assert.match(b.text, /Weekly report not drafted yet/); assert.match(r.posted.join(' '), /Beta Socks \(the weekly report is not drafted yet\)/);
  today = '2026-10-13'; hour = 5;
});

await check('preview: the card as words for one brand, nothing posted; the switch stops the tick; the hour is a setting', async () => {
  posts = [];
  const p = await previewCard(env, d, 'brand_alpha');
  assert.equal(posts.length, 0);
  assert.match(p.text, /^Alpha Golf · Tue Oct 13\n/); assert.match(p.text, /@Ahsan Today's calls/); assert.ok(!/<@/.test(p.text));
  assert.ok(p.thread.length >= 1);
  await assert.rejects(previewCard(env, d, 'brand_nope'), /No such active brand/);
  setSetting('morningCard', 'off'); assert.deepEqual(await morningCardTick(env, d), { skipped: 'off' }); setSetting('morningCard', 'on');
  setSetting('morningHour', '7'); hour = 6; assert.deepEqual(await morningCardTick(env, d), { skipped: 'before 7am Central' }); setSetting('morningHour', '5');
  setSetting('briefHour', '6'); db.prepare(`DELETE FROM settings WHERE key = 'morningHour'`).run(); assert.equal(await morningHour(env), 6, 'falls back to briefHour');
});

await check('a report day: the skipped daily reads "no client daily today, the weekly report covers it", numbers still shown', async () => {
  db.prepare(`UPDATE briefs SET status = 'skipped', text = 'No daily today: the weekly report covers Mon, Oct 12.' WHERE act_id = 'brand_beta' AND date = '2026-10-12'`).run();
  const p = await previewCard(env, d, 'brand_beta');
  assert.match(p.text.split('\n')[1], /^Yesterday \$900 \(plan \$1,000\) · MER 3\.00x · no client daily today, the weekly report covers it$/);
});

await check('callsText: nouns and money', () => {
  assert.equal(callsText([{ kind: 'cut', adset: 'a', stake: 100 }, { kind: 'trim', ad: 'x', stake: 20 }], 'USD'), 'Today\'s calls: cut 1 ad set, trim 1 · $120 at stake');
  assert.equal(callsText([{ kind: 'fix' }]), null);
});

await check('the leak finder: ONE line for the biggest NEW leak over $500, tagged; the first day only records the ids', async () => {
  const L = { leaks: [{ id: 'old', cost: 900, title: 'Old one', owner: 'Ahsan' }, { id: 'new', cost: 4543, title: '"Pmax | Wedges" costs 3.1x the goal per sale', owner: 'Ahsan' }, { id: 'small', cost: 120, title: 'Small', owner: 'Ahsan' }] };
  const dl = { ...d, leaks: async () => L };
  const day = '2026-10-15', prev = '2026-10-14';
  const first = await buildCard(env, dl, ACCTS[1], day, {});
  assert.ok(!first.items.some(i => i.kind === 'leak'), 'no card yesterday = nothing announced as new');
  assert.deepEqual(first.leaks, ['old', 'new']);
  setSetting(`morningCard:brand_beta:${prev}`, JSON.stringify({ leaks: ['old'] }));
  const c = await buildCard(env, dl, ACCTS[1], day, {});
  const line = c.items.find(i => i.kind === 'leak');
  assert.ok(line, 'a new leak line'); assert.match(line.text, /^New leak: "Pmax \| Wedges" costs 3\.1x the goal per sale · \$4\.5K a month, est\./);
  assert.equal(line.tag, '<@U_AHSAN>'); assert.equal(c.items.filter(i => i.kind === 'leak').length, 1);
  const quiet = await buildCard(env, { ...d, leaks: async () => ({ leaks: [{ id: 'old', cost: 900 }] }) }, ACCTS[1], day, {});
  assert.ok(!quiet.items.some(i => i.kind === 'leak'), 'nothing new = no line');
});

console.log(`\n${n}/${n + bad} passed`);
if (bad) process.exit(1);
