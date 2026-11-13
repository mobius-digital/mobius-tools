/* Offline checks for ADS > TRYBE (2026-11-05, src/trybe.js): the key, the sync (approved_seen: the submitted day on a
 * brand's first sync, today after), the Queue (not in Meta / in Meta with no spend), Live and Creators on Triple Whale
 * numbers, the rebook rule, the client's trimmed view, the Calls banner, the daily tick and its Slack line.
 * In-memory SQLite (node:sqlite); Trybe and Slack are mocked.
 *   node test-trybe.mjs      (from account-health/worker) */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { storeKey, keyFor, syncBrand, trybeView, trybeAll, trybeBanners, trybeTick, trybeIdOf, staleMessage, handleTrybe, queueState, STALE_DAYS, talkBank, talkMessage, welcomeText, fridayMessages } from './src/trybe.js';

const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const used = sql => [...new Set([...sql.matchAll(/\?(\d+)/g)].map(m => +m[1]))];
const vals = (sql, a) => Object.fromEntries(used(sql).map(n => ['p' + n, a[n - 1] === undefined ? null : typeof a[n - 1] === 'boolean' ? +a[n - 1] : a[n - 1]]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(sql, args)) || null; }, async all() { return { results: st().all(vals(sql, args)) }; }, async run() { st().run(vals(sql, args)); return { success: true }; } }; };
const env = { DB: { prepare: stmt } };
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE p_br_doc (act_id TEXT, line_id TEXT, key TEXT, data_json TEXT, status TEXT, source TEXT, updated_at TEXT, PRIMARY KEY (act_id, line_id, key));
  CREATE TABLE connections (brand_id TEXT, kind TEXT, external_id TEXT);
  CREATE TABLE ads (act_id TEXT, ad_id TEXT, name TEXT, status TEXT);
  CREATE TABLE ad_daily (act_id TEXT, ad_id TEXT, date TEXT, spend REAL);
  CREATE TABLE tw_ad_attr (act_id TEXT, date TEXT, ad_id TEXT, model TEXT, revenue REAL, orders REAL, platform TEXT);
  INSERT INTO connections VALUES ('brand_alpha', 'meta', 'act_1');`);

const KEY = 'tk_live_abcdefghijklmnopqrstuvwxyz012345';
const sub = (n, o = {}) => ({ id: `submission_${n}`, trybe_id: `0000000${n}`.slice(-8), creator: { id: o.c || 'creator_a', name: o.cn || 'Ann' }, status: o.status || 'approved', media_type: 'video',
  program: { name: 'Core' }, products: [{ name: 'Wedge' }], angles: [], transcript: { text: `Line ${n}` }, thumbnail_url: 'https://cdn.jointrybe.com/brands/61f30dbd-0caf-43a9-9369-1343a6c76df7/submissions/x/t.jpg',
  created_at: o.at || '2026-10-20T10:00:00Z', ads: { count: o.ads || 0, first_day: null, last_day: null } });
let SUBS = [sub(1, { ads: 2 }), sub(2), sub(3, { at: '2026-11-04T10:00:00Z' }), sub(4, { status: 'pending' }), sub(5, { c: 'creator_b', cn: 'Bo', ads: 1, at: '2026-09-01T10:00:00Z' })];
let calls = [], posts = [];
let TODAY = '2026-11-05';
let META = [];
const d = { metaAds: async () => META, centralDate: () => TODAY, centralHour: () => 6, canAfford: () => true,
  listBrands: async () => [{ act_id: 'brand_alpha', name: 'Alpha Golf', slack_channel: 'C1', brief_channel: 'C2' }, { act_id: 'brand_beta', name: 'Beta', slack_channel: 'C3' }],
  slackPost: async (e, ch, text) => { posts.push({ ch, text }); return { ts: '1' }; },
  xfetch: async (u, o) => { calls.push(u); const url = new URL(u);
    if (o.headers.Authorization !== `Bearer ${KEY}`) return new Response(JSON.stringify({ error: { type: 'invalid_api_key' } }), { status: 401 });
    if (url.pathname.endsWith('/submissions')) return Response.json({ data: SUBS, has_more: false });
    if (url.pathname.endsWith('/creator-performance')) return Response.json({ data: [{ creator: { id: 'creator_b', name: 'Bo' }, activity: { last_submission_at: '2026-09-01T10:00:00Z' }, performance: { earnings_cents: 1234, trybe_gmv_cents: 5000 } }], has_more: false });
    return Response.json({ data: [], has_more: false }); } };

assert.equal(trybeIdOf('TysonHeller_Polo_20261012_trybe=e363d8b4'), 'e363d8b4');
assert.equal(trybeIdOf('GD-EB-L09 | Still'), null);

/* the key: refused in plain words, kept when Trybe accepts it */
await assert.rejects(() => storeKey(env, d, 'brand_alpha', 'nope'), /starts with tk_live_/);
await assert.rejects(() => storeKey(env, d, 'brand_alpha', 'tk_live_wrongwrongwrongwrongwrong'), /did not accept/);
await storeKey(env, d, 'brand_alpha', KEY);
assert.equal((await keyFor(env, 'brand_alpha')).key, KEY);

/* first sync: approved_seen = the submitted day */
const s1 = await syncBrand(env, d, 'brand_alpha');
assert.equal(s1.subs, 5);
const seen = id => db.prepare(`SELECT approved_seen FROM p_trybe_sub WHERE sub_id = ?`).get(id).approved_seen;
assert.equal(seen('submission_2'), '2026-10-20');
assert.equal(seen('submission_4'), null);
/* a later sync: a video newly approved is stamped today; an old stamp is kept */
SUBS = [...SUBS.filter(s => s.id !== 'submission_4'), sub(4), sub(6, { at: '2026-10-01T10:00:00Z' })];
TODAY = '2026-11-06';
await syncBrand(env, d, 'brand_alpha');
assert.equal(seen('submission_4'), '2026-11-06');
assert.equal(seen('submission_6'), '2026-11-06');
assert.equal(seen('submission_2'), '2026-10-20');

/* Meta + Triple Whale: video 1 and 5 spent; video 3 has an ad that never spent */
META = [{ id: 'a1', name: 'Ann_Wedge_trybe=00000001', effective_status: 'ACTIVE', created_time: '2026-10-25T00:00:00Z', adset: { id: 's1', name: 'Trybe | 10/25' }, campaign: { name: 'Creators' } },
  { id: 'a1b', name: 'Ann_Wedge_v2_trybe=00000001', effective_status: 'ADSET_PAUSED', adset: { id: 's0', name: 'Old' } },
  { id: 'a3', name: 'Ann_trybe=00000003', effective_status: 'ACTIVE', created_time: '2026-11-05T00:00:00Z', adset: { id: 's2', name: 'Trybe | 11/05' }, campaign: { name: 'Creators' } },
  { id: 'a5', name: 'Bo_trybe=00000005', effective_status: 'ACTIVE', adset: { id: 's1', name: 'Trybe | 10/25' } }, { id: 'x', name: 'GD-EB-L09 | Still', effective_status: 'ACTIVE' }];
await syncBrand(env, d, 'brand_alpha');
assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM p_trybe_ad`).get().n, 4, 'only ads named trybe= are kept');
assert.equal(queueState([], ''), 'not_launched'); assert.equal(queueState([{ status: 'PAUSED' }], ''), 'off'); assert.equal(queueState([{ status: 'PENDING_REVIEW' }], ''), 'review');
assert.equal(queueState([{ status: 'ACTIVE', start_time: '2026-12-01' }], '2026-11-06'), 'scheduled'); assert.equal(queueState([{ status: 'DISAPPROVED' }], ''), 'rejected');
db.exec(`INSERT INTO ad_daily VALUES ('act_1', 'a1', '2026-11-01', 100), ('act_1', 'a1b', '2026-11-02', 20), ('act_1', 'a5', '2026-11-03', 60), ('act_1', 'x', '2026-11-03', 820), ('act_1', 'a1', '2026-09-01', 999);
  INSERT INTO tw_ad_attr VALUES ('brand_alpha', '2026-11-01', 'a1', 'lastPlatformClick', 300, 2, 'meta'), ('brand_alpha', '2026-11-03', 'a5', 'lastPlatformClick', 400, 4, 'meta'),
    ('brand_alpha', '2026-11-03', 'x', 'lastPlatformClick', 900, 14, 'meta'), ('brand_alpha', '2026-11-03', 'a1', 'firstClick', 9999, 99, 'meta');`);
const v = await trybeView(env, d, 'brand_alpha');
assert.equal(v.account.spend, 1000); assert.equal(v.account.orders, 20); assert.equal(v.account.cpa, 50);
assert.deepEqual(v.live.map(x => [x.trybe_id, x.spend, x.orders, x.ads, x.on]), [['00000001', 120, 2, 2, 1], ['00000005', 60, 4, 1, 1]]);
assert.equal(v.account.share, 0.18); assert.equal(v.account.trybe_cpa, 30);
/* the queue: oldest approval first; 3 is in Meta with no spend, the rest are not in Meta */
assert.deepEqual(v.queue.map(q => [q.trybe_id, q.state, q.days]), [['00000002', 'not_launched', 17], ['00000003', 'no_spend', 2], ['00000004', 'not_launched', 0], ['00000006', 'not_launched', 0]]);
assert.equal(v.counts.stale, 1); assert.equal(v.counts.not_launched, 3); assert.equal(v.counts.no_spend, 1);
assert.equal(v.queue[1].adset, 'Trybe | 11/05'); assert.equal(v.queue[1].launched, '2026-11-05'); assert.equal(v.live[0].adset, 'Trybe | 10/25');
assert.match(v.portal, /jointrybe\.com\/brand\?b=61f30dbd/);
/* creators: Bo beats the account ($15 a sale vs $50) and has been quiet since Sep 1 = rebook; Ann costs $60 = no */
const bo = v.creators.find(c => c.name === 'Bo'), ann = v.creators.find(c => c.name === 'Ann');
assert.equal(bo.cpa, 15); assert.equal(bo.rebook, true); assert.equal(bo.earnings, 12.34);
assert.equal(ann.cpa, 60); assert.equal(ann.rebook, false);
/* a client: Live and Creators only, no queue, rules, earnings or full transcript */
const cv = await trybeView(env, d, 'brand_alpha', { client: true });
assert.equal(cv.queue, undefined); assert.equal(cv.rules, undefined); assert.equal(cv.creators[0].earnings, undefined); assert.equal(cv.live[0].transcript, undefined);

/* agency view + the Calls banner */
const json0 = (o, s = 200) => ({ o, s });
const H0 = { isAdmin: async () => true, sessionEmail: async () => 'x@y', brandsFor: async () => null, resolveBrandId: async (e, id) => id, isClient: () => false, deps: d };
const R0 = (path, method, body) => handleTrybe(new Request('https://x' + path, { method, body: JSON.stringify(body) }), env, new URL('https://x' + path), path, json0, H0);
const all = await trybeAll(env, d, await d.listBrands());
assert.equal(all.alerts, false);
assert.deepEqual(all.brands.map(b => [b.act_id, b.queue, b.no_spend, b.stale]), [['brand_alpha', 3, 1, 1]]);
assert.deepEqual(all.no_key.map(b => b.act_id), ['brand_beta']);
const bn = await trybeBanners(env, new Set(['brand_alpha']), TODAY);
assert.equal(bn.length, 1); assert.match(bn[0].text, /^1 approved Trybe video has waited 3 days or more/);

db.prepare(`INSERT INTO settings (key, value) VALUES ('trybeAlerts', 'off')`).run();
assert.equal((await trybeTick(env, d, { force: true })).posted, 0, 'alerts are off until turned on');
db.exec(`DELETE FROM settings WHERE key IN ('trybeDay', 'trybeAlerts')`);
assert.equal((await R0('/api/trybe/alerts', 'PUT', { on: true })).o.alerts, true);
/* the tick: once a day; one Slack line per brand for videos not yet alerted; never twice */
const t1 = await trybeTick(env, d);
assert.equal(t1.synced, 1); assert.equal(t1.posted, 1);
assert.equal(posts[0].ch, 'C1'); assert.match(posts[0].text, /^CREATORS · Alpha Golf: Launch 1 approved Trybe video \(not launched after 3 days\)/); assert.ok(!/[—–]/.test(posts[0].text));
assert.match(posts[0].text, /\n\*CREATORS · Alpha Golf\*\n<@U06C37MDWD7>\n• Launch 1 approved Trybe video/, 'lane first; no buyer named = Cole');
assert.deepEqual(await trybeTick(env, d), { skipped: 'done today' });
TODAY = '2026-11-07'; posts = [];
const t2 = await trybeTick(env, d);
assert.equal(t2.posted, 0, 'video 2 is not repeated; video 3 is launched (no spend yet), so it is not backlog');
TODAY = '2026-11-09'; posts = [];
const t3 = await trybeTick(env, d);
assert.equal(t3.posted, 1); assert.match(posts[0].text, /Launch 2 approved Trybe videos/, 'videos 4 and 6 turned 3 days old');
/* Monday adds the rebook list */
assert.match(staleMessage('Alpha', [], [{ name: 'Bo', quiet_days: 66, cpa: 15 }], 'https://x', { strat: '<@U_AHSAN>' }).text, /\n<@U_AHSAN>\n• Rebook this week: Bo \(66 days quiet, \$15 a sale\)/);
assert.equal(staleMessage('Alpha', [], [], 'https://x'), null);

/* routes: a client reads its brand trimmed and may write nothing */
const json = (o, s = 200) => ({ o, s });
const H = c => ({ isAdmin: async () => true, sessionEmail: async () => 'x@y', brandsFor: async () => null, resolveBrandId: async (e, id) => id, isClient: () => c, deps: d });
const R = (path, method = 'GET', body) => handleTrybe(new Request('https://x' + path, { method, body: body ? JSON.stringify(body) : undefined }), env, new URL('https://x' + path), path.split('?')[0], json, H(false));
assert.equal(await handleTrybe(new Request('https://x/api/other'), env, new URL('https://x/api/other'), '/api/other', json, H(false)), null);
assert.equal((await R('/api/trybe?act=all')).o.brands.length, 1);
assert.ok((await R('/api/trybe?act=brand_alpha')).o.queue);
const rr = await R('/api/trybe/rules', 'PUT', { act: 'brand_alpha', rules: 'Scale hard — always.' });
assert.equal(rr.o.rules, 'Scale hard, always.');
const cl = await handleTrybe(new Request('https://x/api/trybe/key', { method: 'PUT', body: '{}' }), env, new URL('https://x/api/trybe/key'), '/api/trybe/key', json, H(true));
assert.equal(cl.s, 403);
assert.equal(STALE_DAYS, 3);
/* Creator Discord talk (2026-11-13): 15 questions per brand, polls fit Discord's limits, no dashes or pay words, tags only where given. */
for (const a of ['brand_party_patch', 'brand_dartee_golf', 'brand_grunk_dolfer', 'brand_ice_and_gold']) {
  const bank = talkBank(a, 'Brand');
  assert.equal(bank.length, 15);
  assert.ok(bank.some(x => typeof x === 'string') && bank.some(x => x.poll));
  for (const [i, x] of bank.entries()) {
    const m = talkMessage(x, a + i), all = m.content + JSON.stringify(m.poll || {});
    assert.ok(!/[—–]|\$|cash|prize|paid|pay|earn/i.test(all), all);
    if (m.poll) { assert.ok(m.poll.question.text.length <= 300); for (const y of m.poll.answers) assert.ok(y.poll_media.text.length <= 55, y.poll_media.text); }
  }
}
assert.match(welcomeText(['<@111111111111111111>'], 's', {}), /^Welcome <@111111111111111111>!/);
assert.match(fridayMessages([{ creator: 'Amy Jo', tag: '<@1>', product: 'Hat' }, { creator: 'Bo Ko' }], 'pp', 'x').head, /<@1>[\s\S]*Bo/);
console.log('trybe: all checks passed');
