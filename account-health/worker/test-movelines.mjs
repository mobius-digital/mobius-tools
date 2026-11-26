/* Offline checks for the move lines (movelines.js, 2026-11-26): each "move to Locus" item's line on My day, for the
 * right person, grouped, clearing itself; never in the 5am DM; the snapshots the ticks leave (calendar countdown,
 * Monday plans); and the read from D1 (gatherLines) on invented data. In-memory SQLite for D1, nothing posted.
 *   node test-movelines.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { lineItems, gatherLines, countdownFrom, LINE_SOURCES, tkey, keepNewMeta, countdownStale, NEW_META_KEY, V5, v5Link } from './src/movelines.js';
import { _test as mw, DM_SKIP } from './src/mywork.js';
import { _test as cn, callNudgeTick } from './src/callnudge.js';
import { _resetFlags } from './src/jobflags.js';

const { isPerson, forPerson, dmText, dmMessage, peopleFrom } = mw;
let db;
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = (sql, a) => { const o = {}; for (const m of sql.matchAll(/\?(\d+)/g)) { const v = a[+m[1] - 1]; o['p' + m[1]] = v === undefined ? null : typeof v === 'boolean' ? +v : v; } return o; };
const prep = sql => {
  let args = [];
  const st = () => db.prepare(bindSql(sql));
  const o = { bind(...a) { args = a; return o; }, async first() { return st().get(vals(sql, args)) || null; }, async all() { return { results: st().all(vals(sql, args)) }; },
    async run() { if (!/\?\d/.test(sql)) { db.exec(sql); return { meta: {} }; } st().run(vals(sql, args)); return { meta: {} }; } };
  return o;
};
const env = { DB: { prepare: prep, batch: async l => Promise.all(l.map(s => s.run())) }, OWNER_EMAIL: 'owner@agency.example' };
function fresh() {
  db = new DatabaseSync(':memory:'); _resetFlags();
  db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
}
const setS = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, typeof v === 'string' ? v : JSON.stringify(v));
const getSetting = async (e, k) => db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k)?.value ?? null;
const putSetting = async (e, k, v) => setS(k, String(v));
let n = 0;
const ok = (name, fn) => Promise.resolve().then(fn).then(() => { n++; }, e => { console.error('FAILED: ' + name + '\n', e); process.exitCode = 1; });

const OWNER = 'owner@agency.example';
const SAM = { name: 'Sam', email: 'sam@agency.example', slack: 'U0SAMPLE01' };
const KAI = { name: 'Kai', email: 'kai@agency.example', slack: 'U0SAMPLE02' };
const BOSS = { name: 'Riley', email: OWNER, slack: '' };
const STRAT = { brand_northlake_golf: 'Sam', brand_pine_ridge: 'Kai' };
const opts = { isPerson, strat: STRAT, ownerEmail: OWNER };
const TODAY = '2026-11-30';   // a Monday
const no = s => !/[—–]/.test(JSON.stringify(s));

await ok('no plan yet: the top line of My day for a check-in person, gone once a plan or out is posted, never on weekends', () => {
  const checkin = { people: { [SAM.slack]: { name: 'Sam', roles: ['strategist'] }, U0GUEST01: { name: 'Guest', weekOnly: true } }, day: { ts: '1.1', people: {} }, off: false, hour: 9, from: 5, channel: 'C0SAMPLE' };
  const it = lineItems({ today: TODAY, checkin }, SAM, opts);
  assert.equal(it.length, 1);
  assert.equal(it[0].source, 'checkin'); assert.equal(it[0].top, true); assert.equal(it[0].nudge, true); assert.equal(it[0].bucket, 'today');
  assert.match(it[0].link, /app_redirect\?channel=C0SAMPLE/);
  assert.equal(lineItems({ today: TODAY, checkin: { ...checkin, day: { ts: '1.1', people: { [SAM.slack]: { plan: 'x' } } } } }, SAM, opts).length, 0, 'a plan clears it');
  assert.equal(lineItems({ today: TODAY, checkin: { ...checkin, day: { ts: '1.1', people: { [SAM.slack]: { out: true } } } } }, SAM, opts).length, 0, 'out today clears it');
  assert.equal(lineItems({ today: TODAY, checkin: { ...checkin, hour: 4 } }, SAM, opts).length, 0, 'not before the morning hour');
  assert.equal(lineItems({ today: TODAY, checkin: { ...checkin, day: null } }, SAM, opts).length, 0, 'not before the check-in post is up');
  assert.equal(lineItems({ today: '2026-11-29', checkin }, SAM, opts).length, 0, 'not on a Sunday');
  assert.equal(lineItems({ today: TODAY, checkin }, KAI, opts).length, 0, 'not a check-in person');
});

await ok('Monday week plans: one row per strategist with a count, cleared by the week post, today only', () => {
  const L = { today: TODAY, mondayPlans: { date: TODAY, brands: [{ act: 'brand_northlake_golf', name: 'Northlake Golf' }, { act: 'brand_pine_ridge', name: 'Pine Ridge' }, { act: 'brand_harbor_tees', name: 'Harbor Tees' }] }, weekplan: {} };
  const s = lineItems(L, SAM, opts);
  assert.equal(s.length, 1); assert.equal(s[0].text, "Write this week's plan for 1 brand"); assert.equal(s[0].brand, 'Northlake Golf');
  const o = lineItems(L, BOSS, opts);
  assert.equal(o.length, 1, 'a brand with no strategist is the owner\'s'); assert.match(o[0].detail, /Harbor Tees/);
  const posted = { ...L, weekplan: { U0SAMPLE01: { name: 'Sam', brands: [{ a: 'brand_northlake_golf' }] } } };
  assert.equal(lineItems(posted, SAM, opts).length, 0, 'the week post clears it');
  assert.equal(lineItems({ ...L, today: '2026-12-01' }, SAM, opts).length, 0, 'only on that Monday');
});

await ok('calendar countdown: the snapshot per date and owner; tomorrow needs you, a week out is watching; gone once live', () => {
  const data = { brands: [{ id: 'brand_northlake_golf', name: 'Northlake Golf', team: { strat: 'Sam', buyer: 'Kai' } }],
    items: [
      { id: 'e1', act: 'brand_northlake_golf', name: 'Winter drop', start: '2026-12-01', steps: [{ key: 'built', label: 'Ads built', who: 'Sam', state: 'late' }, { key: 'loaded', label: 'Ads loaded', who: 'Kai', state: 'open' }, { key: 'briefs', label: 'Ads briefed', who: 'Sam', state: 'done' }] },
      { id: 'e2', act: 'brand_northlake_golf', name: 'Gift guide', start: '2026-12-07', steps: [{ key: 'briefs', label: 'Ads briefed', who: 'the strategist', state: 'open' }] },
      { id: 'e3', act: 'brand_northlake_golf', name: 'Far away', start: '2026-12-20', steps: [{ key: 'briefs', label: 'Ads briefed', who: 'Sam', state: 'open' }] },
    ] };
  const who = (s, team) => /^the /i.test(s.who) ? '' : s.who;
  const cd = countdownFrom(data, TODAY, who);
  assert.equal(cd.date, TODAY);
  assert.deepEqual(cd.items.map(i => [i.event, i.who, i.steps.join('+')]), [['Winter drop', 'Sam', 'Ads built'], ['Winter drop', 'Kai', 'Ads loaded'], ['Gift guide', '', 'Ads briefed']]);
  const s = lineItems({ today: TODAY, countdown: cd }, SAM, opts);
  assert.equal(s.length, 1); assert.equal(s[0].bucket, 'today'); assert.equal(s[0].text, 'Winter drop goes live tomorrow: 1 step open');
  const o = lineItems({ today: TODAY, countdown: cd }, BOSS, opts);
  assert.equal(o.length, 1, 'nobody named = the owner'); assert.equal(o[0].bucket, 'week'); assert.match(o[0].text, /Gift guide goes live Mon Dec 7: 1 step open/);
  assert.equal(lineItems({ today: '2026-12-01', countdown: cd }, SAM, opts).length, 0, 'gone once the date is live');
});

await ok('card comments: changes asked on my card and tags of me, one row, cleared by a new version, a move or my answer', () => {
  const base = { id: 'b1', num: '12', title: 'Winter statics', act_id: 'brand_northlake_golf', assignee_name: 'Sam Rivers', board_stage: 'making' };
  const C = (id, extra) => ({ ...base, batch_id: extra.batch_id || 'b1', id, created_at: '2026-11-29 10:00:00', ...extra });
  const comments = [
    C('c1', { kind: 'change_request', author_name: 'Client Person', body: 'Make the logo bigger' }),
    C('c2', { batch_id: 'b2', num: '13', title: 'Gift video', assignee_name: 'Kai', kind: 'comment', author_name: 'Kai', body: '@Sam can you check the caption?' }),
    C('c3', { batch_id: 'b3', num: '14', title: 'Other', assignee_name: 'Kai', kind: 'comment', author_name: 'Kai', body: '@Samuel unrelated' }),
  ];
  const s = lineItems({ today: TODAY, comments, versions: {} }, SAM, opts);
  assert.equal(s.length, 1); assert.equal(s[0].source, 'comments');
  assert.equal(s[0].text, '2 cards with comments or changes for you');
  assert.match(s[0].detail, /Changes asked on card 12 "Winter statics"/); assert.match(s[0].detail, /Kai tagged you on card 13/);
  assert.equal(s[0].v5, '#/agency/all/a-production/pipeline');
  const v = lineItems({ today: TODAY, comments, versions: { b1: '2026-11-29T11:00:00.000Z' } }, SAM, opts);
  assert.equal(v[0].text, 'Kai tagged you on card 13 "Gift video"', 'a newer version clears the changes; one card reads by name');
  assert.match(v[0].link, /open=production&card=b2/);
  const answered = [...comments, C('c4', { batch_id: 'b2', kind: 'comment', author_name: 'Sam', body: 'done', created_at: '2026-11-29 12:00:00' })];
  const moved = answered.map(c => c.batch_id === 'b1' ? { ...c, board_stage: 'review' } : c);
  assert.equal(lineItems({ today: TODAY, comments: moved, versions: {} }, SAM, opts).length, 0, 'my answer and the move to Review clear both');
  assert.equal(lineItems({ today: TODAY, comments, versions: {} }, KAI, opts).length, 0, 'Kai wrote them; nothing for Kai');
  assert.equal(tkey('2026-11-29T11:00:00.000Z'), '2026-11-29 11:00:00');
});

await ok('new ad accounts and connect asks: the owner only, one row each, gone when matched or made', () => {
  const L = { today: TODAY, newClients: { waiting: [{ name: 'Harbor Tees', blocked: false }, { name: 'Pine Ridge', blocked: true }], untracked: 2 },
    connect: [{ act: 'brand_northlake_golf', name: 'Northlake Golf', key: 'email', label: 'Klaviyo private key', how: 'make it and paste it in Locus' }] };
  const o = lineItems(L, BOSS, opts);
  assert.deepEqual(o.map(i => i.text), ['2 new Meta ad accounts to match to a client', 'Give Locus access to 1 new client ad account', '1 client connect ask waiting on you']);
  assert.equal(o[0].v5, '#/agency/all/a-clients/new'); assert.equal(o[2].v5, '#/agency/all/a-settings/integrations');
  assert.equal(lineItems(L, SAM, opts).length, 0, 'never a teammate');
  assert.equal(lineItems({ ...L, newClients: { waiting: [], untracked: 2 }, connect: [] }, BOSS, opts).length, 0, 'matched and made: gone');
  assert.equal(lineItems({ ...L, newClients: { waiting: [{ name: 'Harbor Tees', blocked: false }], untracked: 0 }, connect: [] }, BOSS, opts).length, 0, 'no new account to match yet');
});

await ok('creator videos: the buyer gets load, the reviewer gets review, summed across brands', () => {
  const cr = { brands: [{ act: 'brand_northlake_golf', name: 'Northlake Golf', review: 4, queue: 3 }, { act: 'brand_pine_ridge', name: 'Pine Ridge', review: 2, queue: 0 }],
    team: { brand_northlake_golf: { strat: 'Sam', buyer: 'Kai' }, brand_pine_ridge: { strat: 'Sam', buyer: 'Kai' } } };
  assert.deepEqual(lineItems({ today: TODAY, creators: cr }, KAI, opts).map(i => i.text), ['3 approved creator videos to load']);
  const s = lineItems({ today: TODAY, creators: cr }, SAM, opts);
  assert.deepEqual(s.map(i => i.text), ['6 creator videos to review']); assert.equal(s[0].v5, '#/agency/all/a-creators/to-review');
  assert.equal(lineItems({ today: TODAY, creators: null }, SAM, opts).length, 0, 'switch off: nothing');
});

await ok('My work: the lines join the list, never reach the 5am DM, and say no dash', () => {
  assert.deepEqual([...DM_SKIP].sort(), ['goal', ...LINE_SOURCES].sort());
  const people = peopleFrom({ [SAM.slack]: { name: 'Sam', roles: ['strategist'] } });
  const sam = people.find(p => p.name === 'Sam');
  const g = { today: TODAY, brands: [], tasks: [], cards: [], call: null, mentions: [], own: [], dismissed: [], onboard: [], goals: [], ownerEmail: OWNER, names: {},
    lines: { today: TODAY, checkin: { people: { [sam.slack]: { name: 'Sam' } }, day: { ts: '1.1', people: {} }, hour: 9, from: 5, channel: 'C0SAMPLE' },
      mondayPlans: { date: TODAY, brands: [{ act: 'brand_northlake_golf', name: 'Northlake Golf' }] }, weekplan: {} } };
  const r = forPerson(g, sam);
  assert.ok(r.items.some(i => i.source === 'checkin'));
  assert.equal(dmText(r, sam, TODAY), null, 'only move lines open: no DM text');
  assert.equal(dmMessage(r, sam, TODAY), null, 'only move lines open: no DM');
  assert.ok(no(r.items));
});

await ok('brandsWithoutPlanRows keeps the brand id the line needs', () => {
  const rows = cn.brandsWithoutPlanRows([{ act_id: 'brand_northlake_golf', name: 'Northlake Golf', report: { fresh: true }, thread: [] }, { act_id: 'brand_pine_ridge', name: 'Pine Ridge', report: { fresh: true }, thread: [{ text: 'plan' }] }]);
  assert.deepEqual(rows, [{ act: 'brand_northlake_golf', name: 'Northlake Golf' }]);
  assert.deepEqual(cn.brandsWithoutPlan([{ act_id: 'x', name: 'Northlake Golf', report: { fresh: true }, thread: [] }]), ['Northlake Golf']);
});

await ok('the Monday 7am pass stores the list for the line, and with jobOn:mondayPlansPost off posts nothing', async () => {
  fresh();
  db.exec(`CREATE TABLE reports (act_id TEXT, period TEXT, period_start TEXT, period_end TEXT, status TEXT, summary TEXT, data_json TEXT, slack_ts TEXT, slack_channel TEXT, sent_at TEXT)`);
  db.prepare(`INSERT INTO reports VALUES ('brand_northlake_golf', 'weekly', '2026-11-23', '2026-11-29', 'draft', '', '{}', NULL, NULL, NULL)`).run();
  const posts = [];
  const dep = { getSetting, putSetting, centralDate: () => TODAY, centralHour: () => 7, listBrands: async () => [{ act_id: 'brand_northlake_golf', name: 'Northlake Golf' }],
    slackApi: async (e, m, b) => { posts.push([m, b]); return { ok: true }; } };
  setS('jobOn:mondayPlansPost', 'off');
  const out = await callNudgeTick(env, dep);
  assert.deepEqual(out.plans, { quiet: ['Northlake Golf'] });
  assert.equal(posts.length, 0, 'quiet: nothing posted');
  assert.deepEqual(JSON.parse(await getSetting(env, `mondayPlans:${TODAY}`)), { date: TODAY, brands: [{ act: 'brand_northlake_golf', name: 'Northlake Golf' }] });
  /* default (nothing saved): the post goes exactly as today, and the list is stored too */
  fresh();
  db.exec(`CREATE TABLE reports (act_id TEXT, period TEXT, period_start TEXT, period_end TEXT, status TEXT, summary TEXT, data_json TEXT, slack_ts TEXT, slack_channel TEXT, sent_at TEXT)`);
  db.prepare(`INSERT INTO reports VALUES ('brand_northlake_golf', 'weekly', '2026-11-23', '2026-11-29', 'draft', '', '{}', NULL, NULL, NULL)`).run();
  posts.length = 0;
  await callNudgeTick(env, dep);
  assert.equal(posts.filter(p => p[0] === 'chat.postMessage').length, 1);
  assert.match(posts[0][1].text, /Monday plans/);
  assert.ok(await getSetting(env, `mondayPlans:${TODAY}`));
});

await ok('gatherLines reads every source from D1 and a missing table leaves its line out', async () => {
  fresh();
  db.exec(`CREATE TABLE p_br_batch (id TEXT PRIMARY KEY, num TEXT, title TEXT, assignee_name TEXT, board_stage TEXT, act_id TEXT);
    CREATE TABLE p_work_comment (id TEXT, batch_id TEXT, act_id TEXT, author_email TEXT, author_name TEXT, author_role TEXT, body TEXT, kind TEXT, created_at TEXT);
    CREATE TABLE p_work_file (id TEXT, batch_id TEXT, kind TEXT, deleted_at TEXT, created_at TEXT);
    CREATE TABLE p_newclient (id TEXT, name TEXT, act_id TEXT, slack_internal TEXT, steps_json TEXT, created_at TEXT);
    CREATE TABLE connections (brand_id TEXT, kind TEXT, external_id TEXT);
    CREATE TABLE accounts (act_id TEXT, name TEXT);
    CREATE TABLE daily_insights (act_id TEXT);
    CREATE TABLE p_br_doc (act_id TEXT, line_id TEXT, key TEXT);
    CREATE TABLE brands (id TEXT, name TEXT);
    CREATE TABLE p_trybe_sub (act_id TEXT, trybe_id TEXT, status TEXT, ads_count INTEGER);
    CREATE TABLE p_trybe_ad (act_id TEXT, trybe_id TEXT);
    CREATE TABLE p_season_answer (act_id TEXT, key TEXT, value TEXT);`);
  db.exec(`INSERT INTO p_br_batch VALUES ('b1', '12', 'Winter statics', 'Sam', 'making', 'brand_northlake_golf');
    INSERT INTO p_work_comment VALUES ('c1', 'b1', 'brand_northlake_golf', NULL, 'Client Person', 'client', 'Bigger logo', 'change_request', datetime('now'));
    INSERT INTO p_newclient VALUES ('n1', 'Harbor Tees', NULL, 'C0SAMPLE', '{}', datetime('now'));
    INSERT INTO accounts VALUES ('act_100', 'Harbor Tees US'), ('act_200', 'Old unrelated account'), ('act_300', 'Synced long ago');
    INSERT INTO daily_insights VALUES ('act_300');
    INSERT INTO brands VALUES ('brand_northlake_golf', 'Northlake Golf');
    INSERT INTO p_br_doc VALUES ('brand_northlake_golf', '', 'clarity');
    INSERT INTO p_trybe_sub VALUES ('brand_northlake_golf', 't1', 'pending', 0), ('brand_northlake_golf', 't2', 'approved', 0), ('brand_northlake_golf', 't3', 'approved', 0);
    INSERT INTO p_trybe_ad VALUES ('brand_northlake_golf', 't3');
    INSERT INTO p_season_answer VALUES ('brand_northlake_golf', 'strategist', 'Sam'), ('brand_northlake_golf', 'buyer', 'Kai');`);
  setS('connectInvited:brand_northlake_golf', { email: '2026-11-28T10:00:00Z', clarity: '2026-11-28T10:00:00Z' });
  setS('connectPending:brand_pine_ridge', { google_ads: { id: '1234567890', error: 'refused' } });
  setS('feature:creatorProgram', 'on');
  /* only act_100 was new at a discovery; act_200 sits in the old pool and must not be counted, act_300 has synced */
  setS(NEW_META_KEY, [{ act: 'act_100', name: 'Harbor Tees US', at: new Date().toISOString() }, { act: 'act_300', name: 'Synced long ago', at: new Date().toISOString() }]);
  setS(`mondayPlans:${TODAY}`, { date: TODAY, brands: [{ act: 'brand_northlake_golf', name: 'Northlake Golf' }] });
  const today = new Date().toISOString().slice(0, 10);
  const d = { getSetting, centralHour: () => 9 };
  const L = await gatherLines(env, d, { today, brands: [{ act_id: 'brand_northlake_golf', name: 'Northlake Golf' }] });
  assert.equal(L.comments.length, 1);
  assert.deepEqual(L.newClients, { waiting: [{ name: 'Harbor Tees', blocked: false }], untracked: 1 });
  assert.deepEqual(L.connect.map(a => a.label).sort(), ['Google Ads manager request', 'Klaviyo private key'], 'the Clarity token is made, so only Klaviyo and the failed Google request');
  assert.deepEqual(L.creators.brands, [{ act: 'brand_northlake_golf', name: 'Northlake Golf', review: 1, queue: 1 }]);
  assert.equal(L.creators.team.brand_northlake_golf.buyer, 'Kai');
  /* the owner and Sam each get their lines from that read */
  const o = lineItems(L, BOSS, opts).map(i => i.source).sort();
  assert.deepEqual(o, ['connect', 'newmeta']);
  const s = lineItems(L, SAM, opts).map(i => i.text);
  assert.ok(s.includes('Changes asked on card 12 "Winter statics"'));
  assert.ok(s.includes('1 creator video to review'));
  /* tables gone: every line is simply left out, nothing throws */
  fresh();
  const empty = await gatherLines(env, d, { today, brands: [] });
  assert.deepEqual(empty.comments, []); assert.deepEqual(empty.connect, []);
  assert.deepEqual(lineItems(empty, BOSS, opts), []);
});

await ok('new Meta accounts: only the ones new at a discovery count, 14 days, and none = no match line', async () => {
  fresh();
  db.exec(`CREATE TABLE p_newclient (id TEXT, name TEXT, act_id TEXT, slack_internal TEXT, steps_json TEXT, created_at TEXT);
    CREATE TABLE connections (brand_id TEXT, kind TEXT, external_id TEXT);
    CREATE TABLE accounts (act_id TEXT, name TEXT);
    CREATE TABLE daily_insights (act_id TEXT);`);
  db.exec(`INSERT INTO p_newclient VALUES ('n1', 'Harbor Tees', NULL, 'C0SAMPLE', '{}', datetime('now'));
    INSERT INTO accounts VALUES ('act_1', 'A'), ('act_2', 'B'), ('act_3', 'C'), ('act_4', 'D');`);
  const today = new Date().toISOString().slice(0, 10), d = { getSetting };
  let L = await gatherLines(env, d, { today });
  assert.equal(L.newClients.untracked, 0, 'a pool of old unconnected accounts with nothing new is not a line');
  assert.equal(lineItems(L, BOSS, opts).filter(i => i.id.startsWith('newmeta:match')).length, 0);
  /* a discovery finds act_4 new; a second one finds nothing new and keeps it; an old entry ages out */
  const now = new Date().toISOString(), old = new Date(Date.now() - 20 * 864e5).toISOString();
  setS(NEW_META_KEY, [{ act: 'act_2', name: 'B', at: old }]);
  await keepNewMeta(env, [{ act_id: 'act_4', name: 'D' }], now);
  await keepNewMeta(env, [], now);
  assert.deepEqual(JSON.parse(await getSetting(env, NEW_META_KEY)).map(f => f.act), ['act_4'], 'kept 14 days, never twice');
  L = await gatherLines(env, d, { today });
  assert.equal(L.newClients.untracked, 1);
  assert.deepEqual(lineItems(L, BOSS, opts).map(i => i.text), ['1 new Meta ad account to match to a client']);
  /* matched: a meta connection on it clears the line */
  db.exec(`INSERT INTO connections VALUES ('brand_harbor_tees', 'meta', 'act_4')`);
  L = await gatherLines(env, d, { today });
  assert.equal(L.newClients.untracked, 0);
});

await ok('every move line carries an absolute link for the old My work page; v5 still wins on the v5 bell', () => {
  const cr = { brands: [{ act: 'brand_northlake_golf', name: 'Northlake Golf', review: 1, queue: 1 }], team: { brand_northlake_golf: { strat: 'Riley', buyer: 'Riley' } } };
  const comments = [1, 2].map(i => ({ id: 'c' + i, batch_id: 'b' + i, num: String(i), title: 'T', act_id: 'a', assignee_name: 'Riley', board_stage: 'making', kind: 'change_request', author_name: 'Client', body: 'x', created_at: '2026-11-29 10:00:00' }));
  const L = { today: TODAY, newClients: { waiting: [{ name: 'Harbor Tees', blocked: false }, { name: 'Pine Ridge', blocked: true }], untracked: 1 },
    connect: [{ act: 'a', name: 'N', key: 'email', label: 'Klaviyo private key', how: 'x' }], creators: cr, comments, versions: {},
    countdown: { date: TODAY, items: [{ id: 'e', event: 'Winter drop', start: '2026-12-01', who: '', steps: ['Ads built'] }] } };
  const it = lineItems(L, BOSS, opts);
  assert.equal(new Set(it.map(i => i.source)).size, 5);
  for (const i of it) assert.match(i.link, /^https:\/\//, i.id + ' has an absolute link');
  for (const i of it.filter(x => x.v5)) assert.equal(i.link, v5Link(i.v5));
  assert.equal(v5Link(V5.calendar), 'https://locus.go-mobius-digital.com/profit/v5/#/agency/all/a-calendar/index');
});

await ok('countdown: a step owner of two names reaches both; the snapshot is redone while it lists open steps', () => {
  const cd = { date: TODAY, items: [{ id: 'e', event: 'Winter drop', start: '2026-12-01', who: 'Sam + Kai', steps: ['Ads built'] }] };
  assert.equal(lineItems({ today: TODAY, countdown: cd }, SAM, opts).length, 1);
  assert.equal(lineItems({ today: TODAY, countdown: cd }, KAI, opts).length, 1);
  assert.equal(lineItems({ today: TODAY, countdown: { ...cd, items: [{ ...cd.items[0], who: 'Kai and Riley' }] } }, SAM, opts).length, 0);
  assert.equal(countdownStale(null, TODAY), true, 'none yet (deploy day): make it');
  assert.equal(countdownStale({ date: '2026-11-29', items: [] }, TODAY), true, 'from yesterday');
  assert.equal(countdownStale(cd, TODAY), true, 'open steps: check again next hour');
  assert.equal(countdownStale({ date: TODAY, items: [] }, TODAY), false, 'nothing open today: leave it');
});

await ok('card comments: a card moved to Scheduled or Off clears changes asked; a tag is a week, and a live or off card drops it', () => {
  const base = { batch_id: 'b1', num: '12', title: 'Winter statics', act_id: 'a', assignee_name: 'Sam', created_at: '2026-11-29 10:00:00' };
  const ch = stage => [{ ...base, id: 'c1', board_stage: stage, kind: 'change_request', author_name: 'Client', body: 'Bigger logo' }];
  assert.equal(lineItems({ today: TODAY, comments: ch('making'), versions: {} }, SAM, opts).length, 1);
  for (const st of ['scheduled', 'off', 'ready', 'live', 'done']) assert.equal(lineItems({ today: TODAY, comments: ch(st), versions: {} }, SAM, opts).length, 0, st);
  const tag = (stage, at) => [{ ...base, id: 'c2', assignee_name: 'Kai', board_stage: stage, kind: 'comment', author_name: 'Kai', body: '@Sam look', created_at: at }];
  assert.equal(lineItems({ today: TODAY, comments: tag('review', '2026-11-29 10:00:00'), versions: {} }, SAM, opts).length, 1);
  assert.equal(lineItems({ today: TODAY, comments: tag('review', '2026-11-20 10:00:00'), versions: {} }, SAM, opts).length, 0, 'older than a week');
  assert.equal(lineItems({ today: TODAY, comments: tag('live', '2026-11-29 10:00:00'), versions: {} }, SAM, opts).length, 0, 'the card is live');
});

console.log(process.exitCode ? 'test-movelines: FAILED' : `test-movelines: ${n} checks passed`);
