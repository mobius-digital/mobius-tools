/* Offline checks for the alarms (alarms.js, round 21, 2026-11-26): each alarm fires, dedupes (a second look refreshes the
 * same row and never pings again), clears itself when fixed, and respects its per brand setting. The rows go through
 * the real urgent.js (in-memory SQLite for D1); Meta and Slack are mocked; invented brands, people and numbers.
 *   node test-alarms.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { alarmsPass, accountProblem, rejectedStep, trackingGap, noOrdersHours, storeStep, campaignChecks, soldOutHits, handleOf, adLink, slugOf, alarmCfg, cleanAlarmCfg, ALARM_TYPES, _resetAlarms, medianOf, wakingHours, runningSets, metaMs, STOPS_ALL } from './src/alarms.js';
import { raiseAlert, clearAlert, urgentSweep, alertPeople, DM_TONIGHT, ALERT_TYPES, _resetUrgent } from './src/urgent.js';
import { _reset } from './src/automations.js';
import { _resetNotify, NOTIFY_TYPES } from './src/notify.js';

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
const env = { DB: { prepare: prep } };
const addDays = (ymd, n) => { const x = new Date(`${ymd}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const TODAY = '2026-03-11';
let NOW = Date.parse('2026-03-11T20:00:00Z'), HOUR = 14;
const BRANDS = [
  { act_id: 'brand_northlake_golf', name: 'Northlake Golf', active: 1, tz: 'America/Chicago', currency: 'USD', meta_act: 'act_100', tw_shop: 'northlake.example' },
  { act_id: 'brand_pinecrest_candle', name: 'Pinecrest Candle', active: 1, tz: 'America/Chicago', currency: 'USD', meta_act: 'act_200', tw_shop: 'pinecrest.example' },
];
function fresh() {
  db = new DatabaseSync(':memory:'); _reset(); _resetUrgent(); _resetNotify(); _resetAlarms();
  db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
  db.exec(`CREATE TABLE accounts (act_id TEXT PRIMARY KEY, account_status INTEGER, last_error TEXT)`);
  db.exec(`CREATE TABLE connections (brand_id TEXT, kind TEXT, external_id TEXT)`);
  db.exec(`CREATE TABLE daily_insights (act_id TEXT, date TEXT, spend REAL, purchases REAL)`);
  db.exec(`CREATE TABLE tw_daily (act_id TEXT, date TEXT, metric TEXT, value REAL, synced_at TEXT, PRIMARY KEY (act_id, date, metric))`);
  db.exec(`CREATE TABLE tw_ad_attr (act_id TEXT, date TEXT, ad_id TEXT, model TEXT, orders REAL)`);
  db.exec(`CREATE TABLE meta_campaigns (act_id TEXT, campaign_id TEXT PRIMARY KEY, name TEXT, status TEXT, daily_budget REAL)`);
  db.exec(`CREATE TABLE meta_adsets (act_id TEXT, adset_id TEXT PRIMARY KEY, campaign_id TEXT, name TEXT, status TEXT, daily_budget REAL, start_time TEXT, end_time TEXT)`);
  db.exec(`CREATE TABLE briefs (act_id TEXT, date TEXT, status TEXT)`);
  for (const b of BRANDS) { db.prepare(`INSERT INTO accounts VALUES (?, 1, NULL)`).run(b.meta_act); db.prepare(`INSERT INTO connections VALUES (?, 'meta', ?)`).run(b.act_id, b.meta_act); }
  setS('automationRoles', { brand_northlake_golf: { buyer: 'sam@agency.example' } });
  slack.length = 0; metaCalls.length = 0; META = {};
  NOW = Date.parse('2026-03-11T20:00:00Z'); HOUR = 14;
}
const setS = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, typeof v === 'string' ? v : JSON.stringify(v));
const rows = sql => db.prepare(sql).all();
const open = type => { try { return rows(`SELECT * FROM p_notice WHERE ntype = '${type}' AND state = 'open'`); } catch { return []; } };
const all = type => { try { return rows(`SELECT * FROM p_notice WHERE ntype = '${type}'`); } catch { return []; } };
const slack = [], metaCalls = [];
let META = {};
const ud = {
  getSetting: async (e, k) => db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k)?.value ?? null,
  listAccounts: async () => BRANDS,
  slackApi: async (e, method, args) => { slack.push([method, args]); return method === 'users.lookupByEmail' ? { ok: true, user: { id: 'U_' + args.email.slice(0, 3).toUpperCase() } } : { ok: true }; },
  brandsFor: async () => null, emailAllowed: async () => true, alertsMuted: async () => false,
  ownerEmail: 'owner@agency.example',
};
const d = {
  getSetting: ud.getSetting,
  putSetting: async (e, k, v) => setS(k, String(v)),
  listAccounts: async () => BRANDS,
  localDate: () => TODAY, localHourFrac: () => HOUR, addDays,
  now: () => NOW,
  meta: async (e, path, params) => {
    metaCalls.push([path, params]);
    const k = Object.keys(META).find(p => path === p);
    if (!k) throw new Error('no mock for ' + path);
    const v = META[k];
    return typeof v === 'function' ? v(params) : v;
  },
  metaBackedOff: async () => false, can: () => true,
  liveDailyBudget: async () => 500,
  raise: o => raiseAlert(env, ud, { now: new Date(NOW), ...o }),
  clear: (type, thing) => clearAlert(env, ud, { type, thing, now: new Date(NOW) }),
};
let n = 0;
const ok = (name, fn) => Promise.resolve().then(fn).then(() => { n++; }, e => { console.error('FAILED: ' + name + '\n', e); process.exitCode = 1; });
const healthy = () => { META['act_100'] = { account_status: 1, spend_cap: '0', amount_spent: '100000' }; META['act_200'] = { account_status: 1 }; META['act_100/ads'] = { data: [] }; META['act_200/ads'] = { data: [] }; };

/* ================= the pure parts ================= */
await ok('accountProblem: disabled, unpaid, review, closed; limit reached; limit too small for one more day', () => {
  assert.equal(accountProblem({ account_status: 1 }), null);
  assert.equal(accountProblem({ account_status: 2 }).kind, 'disabled');
  assert.equal(accountProblem({ account_status: 3 }).kind, 'unpaid');
  assert.equal(accountProblem({ account_status: 9 }).kind, 'unpaid');
  assert.equal(accountProblem({ account_status: 7 }).kind, 'review');
  assert.equal(accountProblem({ account_status: 101 }).kind, 'closed');
  assert.equal(accountProblem({ account_status: 1, spend_cap: '500000', amount_spent: '500000' }).kind, 'limit_reached');
  const near = accountProblem({ account_status: 1, spend_cap: '500000', amount_spent: '480000' }, 400);
  assert.equal(near.kind, 'limit_near'); assert.equal(near.left, 200);
  assert.equal(accountProblem({ account_status: 1, spend_cap: '500000', amount_spent: '480000' }, 100), null, 'enough left for today');
  assert.equal(accountProblem({ account_status: 1, spend_cap: '0', amount_spent: '480000' }, 400), null, 'no limit set');
});
await ok('rejectedStep: first seen today counts today; yesterday\'s stay theirs; a fixed day clears', () => {
  const seed = rejectedStep(null, [{ id: '1' }, { id: '2' }], TODAY);
  assert.deepEqual(seed.todays, [], 'the first look only remembers'); assert.deepEqual(seed.open, {}); assert.deepEqual(seed.ids, { 1: 'seed', 2: 'seed' });
  const a = rejectedStep({}, [{ id: '1' }, { id: '2' }], TODAY);
  assert.equal(a.todays.length, 2); assert.deepEqual(a.clearDays, []);
  const b = rejectedStep({ 1: '2026-03-10' }, [{ id: '1' }, { id: '3' }], TODAY);
  assert.deepEqual(b.todays.map(x => x.id), ['3']); assert.deepEqual(b.ids, { 1: '2026-03-10', 3: TODAY });
  const c = rejectedStep({ 1: '2026-03-10', 3: TODAY }, [], TODAY);
  assert.deepEqual(c.clearDays.sort(), ['2026-03-10', TODAY]); assert.deepEqual(c.ids, {});
});
await ok('trackingGap: a wide drop fires per source; small days and a thin history do not', () => {
  const prior = Array.from({ length: 7 }, () => ({ orders: 40, pixel: 30, tw: 32, spend: 500 }));
  assert.deepEqual(trackingGap({ orders: 40, pixel: 30, tw: 30, spend: 500 }, prior).broken, []);
  const g = trackingGap({ orders: 40, pixel: 2, tw: 31, spend: 500 }, prior);
  assert.deepEqual(g.broken.map(x => x.source), ['pixel']);
  assert.equal(trackingGap({ orders: 40, pixel: 10, tw: 31, spend: 500 }, prior).broken.length, 0, 'a third of normal is not a wide gap');
  assert.equal(trackingGap({ orders: 5, pixel: 0, tw: 0, spend: 500 }, prior).ran, false, 'too few orders to judge');
  assert.equal(trackingGap({ orders: 40, pixel: 0, tw: 0, spend: 10 }, prior).ran, false, 'too little spend to judge');
  assert.equal(trackingGap({ orders: 40, pixel: 0, tw: null, spend: 500 }, prior.slice(0, 2)).broken.length, 0, 'a thin history judges nothing');
});
await ok('noOrdersHours and storeStep: N from the pace; an order resets; spend counts across looks and midnight', () => {
  assert.equal(noOrdersHours(5), null); assert.equal(noOrdersHours(48), 4); assert.equal(noOrdersHours(24), 8); assert.equal(noOrdersHours(8), 24);
  const h = 36e5, t0 = Date.parse('2026-03-11T14:00:00Z');
  let s = storeStep(null, { day: TODAY, orders: 10, syncedMs: t0, spendDay: 100 }, { nowMs: t0, hours: 4 });
  assert.equal(s.judged, false, 'the first look only remembers');
  s = storeStep(s.next, { day: TODAY, orders: 10, syncedMs: t0 + 3 * h, spendDay: 200 }, { nowMs: t0 + 3 * h, hours: 4 });
  assert.equal(s.down, null, '3 quiet hours is not 4');
  s = storeStep(s.next, { day: TODAY, orders: 10, syncedMs: t0 + 5 * h, spendDay: 300 }, { nowMs: t0 + 5 * h, hours: 4 });
  assert.deepEqual(s.down, { hours: 5, spend: 200 });
  const stale = storeStep(s.next, { day: TODAY, orders: 10, syncedMs: t0 + 5 * h, spendDay: 300 }, { nowMs: t0 + 8 * h, hours: 4 });
  assert.equal(stale.judged, false, 'an old Triple Whale sync judges nothing');
  s = storeStep(s.next, { day: TODAY, orders: 11, syncedMs: t0 + 6 * h, spendDay: 320 }, { nowMs: t0 + 6 * h, hours: 4 });
  assert.equal(s.ordered, true); assert.equal(s.down, null);
  const nd = storeStep({ day: '2026-03-10', orders: 30, spendDay: 900, cum: 900, orderAt: t0, cumAt: 800 }, { day: TODAY, orders: 0, syncedMs: t0 + 6 * h, spendDay: 60 }, { nowMs: t0 + 6 * h, hours: 4 });
  assert.deepEqual(nd.down, { hours: 6, spend: 160 }, 'across midnight: yesterday\'s tail plus today');
  const small = storeStep(s.next, { day: TODAY, orders: 11, syncedMs: t0 + 11 * h, spendDay: 330 }, { nowMs: t0 + 11 * h, hours: 4 });
  assert.equal(small.down, null, 'under the spend floor: ads were not really spending');
});
await ok('campaignChecks: stalled against pace; young, unscheduled and lifetime campaigns are never stalled; over budget past Meta\'s own 75%', () => {
  const now = Date.parse('2026-03-11T20:00:00Z'), old = '2026-02-01T00:00:00Z';
  const camps = [
    { id: 'c1', name: 'Sale | Broad', daily_budget: '50000', created_time: old, spend: 10 },
    { id: 'c2', name: 'Evergreen', daily_budget: '20000', created_time: old, spend: 120 },
    { id: 'c3', name: 'New today', daily_budget: '50000', created_time: '2026-03-11T15:00:00Z', spend: 0 },
    { id: 'c4', name: 'ABO test', daily_budget: null, created_time: old, spend: 0 },
    { id: 'c5', name: 'Starts later', daily_budget: '30000', created_time: old, spend: 0 },
    { id: 'c6', name: 'Lifetime', daily_budget: null, lifetime_budget: '900000', created_time: old, spend: 0 },
  ];
  const sets = { c1: { running: 2, budget: 0 }, c2: { running: 1, budget: 0 }, c3: { running: 1, budget: 0 }, c4: { running: 2, budget: 100 }, c6: { running: 1, budget: 0 } };
  const r = campaignChecks(camps, sets, { frac: 14 / 24, nowMs: now });
  assert.deepEqual(r.stalled.map(c => c.id), ['c1', 'c4']);
  assert.equal(r.over, null);
  const o = campaignChecks([{ id: 'c1', name: 'x', daily_budget: '20000', created_time: old, spend: 400 }], { c1: { running: 1 } }, { frac: 0.5, nowMs: now });
  assert.deepEqual(o.over, { spent: 400, budget: 200 });
  assert.equal(campaignChecks([{ id: 'c1', name: 'x', daily_budget: '20000', created_time: old, spend: 340 }], { c1: { running: 1 } }, { frac: 0.5, nowMs: now }).over, null, 'Meta may spend up to 75% over on its own');
});
await ok('soldOutHits: a whole product at 0 with a live ad on its product page; a size gap or a collection link is not', () => {
  const products = [{ title: 'Black Wedge 56', onHand: 0, status: 'out' }, { title: 'Putter Cover', onHand: 4, sizeGap: ['L'] }, { title: 'Tee Pack', onHand: 0, status: 'off' }];
  const ads = [
    { id: '1', name: 'Wedge static', creative: { object_story_spec: { link_data: { link: 'https://shop.example/products/black-wedge-56?utm=x' } } } },
    { id: '2', name: 'Sale video', creative: { object_story_spec: { video_data: { call_to_action: { value: { link: 'https://shop.example/collections/sale' } } } } } },
    { id: '3', name: 'Cover', creative: { asset_feed_spec: { link_urls: [{ website_url: 'https://shop.example/products/putter-cover' }] } } },
  ];
  assert.equal(handleOf(adLink(ads[0])), 'black-wedge-56'); assert.equal(handleOf(adLink(ads[1])), null); assert.equal(slugOf('Black Wedge 56'), 'black-wedge-56');
  assert.deepEqual(soldOutHits(products, ads), [{ product: 'Black Wedge 56', ads: ['Wedge static'] }]);
});
await ok('alarmCfg and cleanAlarmCfg: known keys only, sold out off by default, brand ids only', () => {
  assert.deepEqual(alarmCfg(null), { twUndercounts: false, soldOut: false, noOrdersHours: null, off: [] });
  assert.deepEqual(alarmCfg('{"twUndercounts":true,"noOrdersHours":"6","off":["sold_out","nope"]}'), { twUndercounts: true, soldOut: false, noOrdersHours: 6, off: ['sold_out'] });
  assert.deepEqual(Object.keys(cleanAlarmCfg({ brand_northlake_golf: { soldOut: true }, 'act_1': {}, x: 1 })), ['brand_northlake_golf']);
});
await ok('every alarm is a known urgent type with a catalog entry; the Slack bridge is the money-stopped three', () => {
  for (const t of ALARM_TYPES) { assert.ok(ALERT_TYPES.includes(t), t); assert.ok(NOTIFY_TYPES.some(x => x.id === t && x.urgent), t); }
  assert.deepEqual(DM_TONIGHT, ['account_blocked', 'campaign_stalled', 'no_orders']);
});

/* ================= the pass: fires, dedupes, clears, respects its settings ================= */
await ok('who hears an alarm: the brand buyer and the owner', async () => {
  fresh();
  assert.deepEqual(await alertPeople(env, ud, 'ad_rejected', 'brand_northlake_golf'), ['sam@agency.example', 'owner@agency.example']);
  assert.deepEqual(await alertPeople(env, ud, 'ad_rejected', 'brand_pinecrest_candle'), ['owner@agency.example'], 'no buyer set: the owner');
});
await ok('a. account blocked: fires for buyer and owner with a Slack DM tonight, refresh never pings again, clears when fixed', async () => {
  fresh(); healthy(); HOUR = 8;
  META['act_100'] = { account_status: 3 };
  await alarmsPass(env, d);
  assert.equal(open('account_blocked').length, 2);
  assert.match(open('account_blocked')[0].title, /Northlake Golf: Meta ad account has a payment problem/);
  assert.equal(slack.filter(s => s[0] === 'chat.postMessage').length, 2, 'the bridge DM to both, once');
  assert.equal(rows(`SELECT account_status FROM accounts WHERE act_id = 'act_100'`)[0].account_status, 3, 'the status is kept');
  NOW += 3600e3; slack.length = 0;
  await alarmsPass(env, d);
  assert.equal(all('account_blocked').length, 2, 'same rows'); assert.equal(slack.length, 0, 'a refresh never pings');
  NOW += 3600e3; META['act_100'] = { account_status: 1 };
  await alarmsPass(env, d);
  assert.equal(open('account_blocked').length, 0); assert.equal(all('account_blocked')[0].answer, 'fixed');
});
await ok('a. the account limit: reached fires; a Meta read that fails falls back to what is stored', async () => {
  fresh(); healthy(); HOUR = 8;
  META['act_200'] = { account_status: 1, spend_cap: '100000', amount_spent: '100000' };
  await alarmsPass(env, d);
  assert.match(open('account_blocked')[0].title, /Pinecrest Candle: Meta ad account hit its spending limit/);
  assert.match(open('account_blocked')[0].body, /\$1,000/);
  NOW += 3600e3; delete META['act_200'];
  await alarmsPass(env, d);
  assert.equal(open('account_blocked').length, 1, 'stored limit still says reached');
});
await ok('a. alarmDm off: the row, no DM; notifyCopies on: the person\'s own choices decide (none chosen = no DM)', async () => {
  fresh(); healthy(); HOUR = 8; setS('alarmDm', 'off');
  META['act_100'] = { account_status: 2 };
  await alarmsPass(env, d);
  assert.equal(open('account_blocked').length, 2); assert.equal(slack.length, 0);
  fresh(); healthy(); HOUR = 8; setS('notifyCopies', 'on');
  META['act_100'] = { account_status: 2 };
  await alarmsPass(env, d);
  assert.equal(open('account_blocked').length, 2); assert.equal(slack.length, 0);
});
await ok('b. ads rejected in live campaigns: first opens today\'s row, a later one counts up the same row, fixed clears; paused campaigns never count', async () => {
  fresh(); healthy(); HOUR = 8;
  await alarmsPass(env, d);   // the first look at the brand: nothing rejected yet, remembered
  NOW += 3600e3;
  META['act_100/ads'] = { data: [{ id: 'a1', name: 'BF Static 1', effective_status: 'DISAPPROVED', campaign: { effective_status: 'ACTIVE' } },
    { id: 'a9', name: 'Old', effective_status: 'DISAPPROVED', campaign: { effective_status: 'PAUSED' } }] };
  await alarmsPass(env, d);
  let r = open('ad_rejected');
  assert.equal(r.length, 2); assert.equal(r[0].thing_key, `ad_rejected:brand_northlake_golf:${TODAY}`);
  assert.match(r[0].title, /Northlake Golf: 1 ad rejected today/);
  assert.equal(slack.length, 0, 'a Locus row only tonight');
  NOW += 3600e3;
  META['act_100/ads'] = { data: [{ id: 'a1', name: 'BF Static 1', effective_status: 'DISAPPROVED', campaign: { effective_status: 'ACTIVE' } },
    { id: 'a2', name: 'BF Static 2', effective_status: 'WITH_ISSUES', campaign: { effective_status: 'ACTIVE' } }] };
  await alarmsPass(env, d);
  r = open('ad_rejected');
  assert.equal(all('ad_rejected').length, 2, 'the same rows'); assert.match(r[0].title, /2 ads rejected or with issues today/);
  assert.equal(r[0].created_at, new Date(NOW - 3600e3).toISOString(), 'still the first episode');
  NOW += 3600e3; META['act_100/ads'] = { data: [] };
  await alarmsPass(env, d);
  assert.equal(open('ad_rejected').length, 0);
});
await ok('b. an ad rejected yesterday keeps yesterday\'s row up (never today\'s); a new one today opens today\'s', async () => {
  fresh(); healthy(); HOUR = 8;
  setS('alarmState', { brand_northlake_golf: { rej: { a1: '2026-03-10' }, up: { 'ad_rejected:brand_northlake_golf:2026-03-10': 1 } } });
  META['act_100/ads'] = { data: [{ id: 'a1', name: 'Old reject', effective_status: 'DISAPPROVED', campaign: { effective_status: 'ACTIVE' } }] };
  await alarmsPass(env, d);
  assert.equal(open('ad_rejected').filter(x => x.thing_key.endsWith(TODAY)).length, 0, 'not today\'s');
  assert.match(open('ad_rejected')[0].title, /1 ad rejected since Mar 10/);
  NOW += 3600e3;
  META['act_100/ads'] = { data: [{ id: 'a1', name: 'Old reject', effective_status: 'DISAPPROVED', campaign: { effective_status: 'ACTIVE' } }, { id: 'a3', name: 'New reject', effective_status: 'DISAPPROVED', campaign: { effective_status: 'ACTIVE' } }] };
  await alarmsPass(env, d);
  const t = open('ad_rejected').filter(x => x.thing_key.endsWith(TODAY));
  assert.match(t[0].body, /New reject/); assert.doesNotMatch(t[0].body, /Old reject/);
  /* still rejected 31 hours later: the hourly refresh keeps the earlier day's row past the 30 hour sweep */
  NOW += 31 * 3600e3;
  await alarmsPass(env, d); await urgentSweep(env, ud, { now: new Date(NOW) });
  assert.ok(open('ad_rejected').some(x => x.thing_key.endsWith('2026-03-10')), 'kept while the ad is still rejected');
});
await ok('b. the first run after deploy: ads already rejected in live campaigns raise nothing; one rejected later does', async () => {
  fresh(); healthy(); HOUR = 8;
  META['act_100/ads'] = { data: [{ id: 'a1', name: 'Months old', effective_status: 'DISAPPROVED', campaign: { effective_status: 'ACTIVE' } }] };
  await alarmsPass(env, d);
  assert.equal(all('ad_rejected').length, 0, 'no false "today" on deploy day');
  NOW += 3600e3;
  META['act_100/ads'] = { data: [{ id: 'a1', name: 'Months old', effective_status: 'DISAPPROVED', campaign: { effective_status: 'ACTIVE' } }, { id: 'a2', name: 'Fresh one', effective_status: 'DISAPPROVED', campaign: { effective_status: 'ACTIVE' } }] };
  await alarmsPass(env, d);
  assert.equal(open('ad_rejected').length, 2); assert.match(open('ad_rejected')[0].body, /Fresh one/); assert.doesNotMatch(open('ad_rejected')[0].body, /Months old/);
});
await ok('b. a second page of problem ads is read, so a new one past the first 100 is still seen', async () => {
  fresh(); healthy(); HOUR = 8;
  setS('alarmState', { brand_northlake_golf: { rej: {} } });
  META['act_100/ads'] = p => p.after === 'p2'
    ? { data: [{ id: 'z9', name: 'On page two', effective_status: 'DISAPPROVED', campaign: { effective_status: 'ACTIVE' } }] }
    : { data: [{ id: 'z1', name: 'Paused one', effective_status: 'DISAPPROVED', campaign: { effective_status: 'PAUSED' } }], paging: { next: 'x', cursors: { after: 'p2' } } };
  await alarmsPass(env, d);
  assert.match(open('ad_rejected')[0].body, /On page two/);
});
await ok('e. a live campaign stopped spending: fires (with the DM), clears when it spends; over budget fires and clears; never before 10am', async () => {
  fresh(); healthy();
  db.exec(`INSERT INTO meta_adsets VALUES ('act_100', 's1', 'c1', 'Set', 'ACTIVE', NULL, NULL, NULL)`);
  META['act_100/campaigns'] = { data: [{ id: 'c1', name: 'BF | Broad', daily_budget: '100000', created_time: '2026-02-01T00:00:00Z', insights: { data: [{ spend: '3' }] } }] };
  HOUR = 9; await alarmsPass(env, d);
  assert.equal(metaCalls.filter(c => c[0] === 'act_100/campaigns').length, 0, 'no campaign read before 10am');
  META['act_100/adsets'] = { data: [{ id: 's1', campaign_id: 'c1' }] };
  HOUR = 14; await alarmsPass(env, d);
  assert.equal(open('campaign_stalled').length, 0, 'the first look today only remembers the spend');
  NOW += 3600e3; HOUR = 15; await alarmsPass(env, d);
  assert.match(open('campaign_stalled')[0].title, /Northlake Golf: 1 live campaign stopped spending/);
  assert.ok(slack.some(s => s[0] === 'chat.postMessage'), 'the bridge DM');
  assert.equal(metaCalls.filter(c => c[0] === 'act_200/campaigns').length, 0, 'no live campaign in D1: no Meta read');
  NOW += 3600e3; HOUR = 16;
  META['act_100/campaigns'] = { data: [{ id: 'c1', name: 'BF | Broad', daily_budget: '100000', created_time: '2026-02-01T00:00:00Z', insights: { data: [{ spend: '2100' }] } }] };
  await alarmsPass(env, d);
  assert.equal(open('campaign_stalled').length, 0, 'spending again: cleared');
  assert.match(open('over_budget')[0].title, /Northlake Golf spent far over today's budgets/);
  NOW += 3600e3; HOUR = 17;
  META['act_100/campaigns'] = { data: [{ id: 'c1', name: 'BF | Broad', daily_budget: '300000', created_time: '2026-02-01T00:00:00Z', insights: { data: [{ spend: '2100' }] } }] };
  await alarmsPass(env, d);
  assert.equal(open('over_budget').length, 0);
});
await ok('e. a blocked account is one alarm, not two: the stalled campaigns stay quiet', async () => {
  fresh(); healthy();
  META['act_100'] = { account_status: 2 };
  db.exec(`INSERT INTO meta_adsets VALUES ('act_100', 's1', 'c1', 'Set', 'ACTIVE', NULL, NULL, NULL)`);
  META['act_100/campaigns'] = { data: [{ id: 'c1', name: 'BF | Broad', daily_budget: '100000', created_time: '2026-02-01T00:00:00Z', insights: { data: [{ spend: '0' }] } }] };
  await alarmsPass(env, d);
  assert.equal(open('account_blocked').length, 2); assert.equal(open('campaign_stalled').length, 0);
});

/* The store and tracking need Triple Whale's daily rows. */
function seedOrders(act, perDay, { today = null, todayAt = '2026-03-11 19:30:00', yesterday = null, yAt = '2026-03-11 07:00:00' } = {}) {
  for (let i = 1; i <= 14; i++) {
    const dt = addDays(TODAY, -i);
    const v = i === 1 && yesterday != null ? yesterday : perDay;
    db.prepare(`INSERT INTO tw_daily VALUES (?, ?, 'totalOrders', ?, ?)`).run(act, dt, v, i === 1 ? yAt : `${addDays(dt, 1)} 08:00:00`);
  }
  if (today != null) db.prepare(`INSERT INTO tw_daily VALUES (?, ?, 'totalOrders', ?, ?) ON CONFLICT DO UPDATE SET value = excluded.value, synced_at = excluded.synced_at`).run(act, TODAY, today, todayAt);
}
const spendRow = (meta, dt, s, p = 0) => db.prepare(`INSERT INTO daily_insights VALUES (?, ?, ?, ?)`).run(meta, dt, s, p);
await ok('d. ads spending, no store order for N hours: fires (with the DM), refreshes, clears on the next order; respects noOrdersHours and off', async () => {
  fresh(); healthy();
  seedOrders('brand_northlake_golf', 48, { today: 20, todayAt: '2026-03-11 14:00:00' });
  spendRow('act_100', TODAY, 300);
  NOW = Date.parse('2026-03-11T14:10:00Z'); HOUR = 8; await alarmsPass(env, d);
  db.prepare(`UPDATE tw_daily SET synced_at = '2026-03-11 19:00:00' WHERE date = ? AND act_id = 'brand_northlake_golf'`).run(TODAY);
  db.prepare(`UPDATE daily_insights SET spend = 500 WHERE act_id = 'act_100' AND date = ?`).run(TODAY);
  NOW = Date.parse('2026-03-11T19:10:00Z'); HOUR = 13; await alarmsPass(env, d);
  assert.match(open('no_orders')[0].title, /Northlake Golf: no store orders in 5 hours/);
  assert.match(open('no_orders')[0].body, /\$200/);
  assert.equal(slack.filter(s => s[0] === 'chat.postMessage').length, 2, 'the bridge DM to buyer and owner');
  db.prepare(`UPDATE tw_daily SET synced_at = '2026-03-11 20:00:00' WHERE date = ? AND act_id = 'brand_northlake_golf'`).run(TODAY);
  NOW = Date.parse('2026-03-11T20:10:00Z'); HOUR = 14; slack.length = 0; await alarmsPass(env, d);
  assert.equal(all('no_orders').length, 2); assert.equal(slack.length, 0, 'a refresh never pings');
  assert.match(open('no_orders')[0].title, /6 hours/);
  db.prepare(`UPDATE tw_daily SET value = 21, synced_at = '2026-03-11 21:00:00' WHERE date = ? AND act_id = 'brand_northlake_golf'`).run(TODAY);
  NOW = Date.parse('2026-03-11T21:10:00Z'); HOUR = 15; await alarmsPass(env, d);
  assert.equal(open('no_orders').length, 0, 'an order came in: cleared');
  /* noOrdersHours: a brand that sets 8 hours waits 8 */
  fresh(); healthy(); setS('alarms:brand_northlake_golf', { noOrdersHours: 8 });
  seedOrders('brand_northlake_golf', 48, { today: 20, todayAt: '2026-03-11 14:00:00' }); spendRow('act_100', TODAY, 300);
  NOW = Date.parse('2026-03-11T14:10:00Z'); HOUR = 8; await alarmsPass(env, d);
  db.prepare(`UPDATE tw_daily SET synced_at = '2026-03-11 19:00:00' WHERE date = ? AND act_id = 'brand_northlake_golf'`).run(TODAY);
  db.prepare(`UPDATE daily_insights SET spend = 500 WHERE act_id = 'act_100' AND date = ?`).run(TODAY);
  NOW = Date.parse('2026-03-11T19:10:00Z'); HOUR = 13; await alarmsPass(env, d);
  assert.equal(open('no_orders').length, 0, '5 hours is not 8');
  /* off for the brand */
  fresh(); healthy(); setS('alarms:brand_northlake_golf', { off: ['no_orders'] });
  seedOrders('brand_northlake_golf', 48, { today: 20, todayAt: '2026-03-11 14:00:00' }); spendRow('act_100', TODAY, 300);
  NOW = Date.parse('2026-03-11T14:10:00Z'); HOUR = 8; await alarmsPass(env, d);
  db.prepare(`UPDATE tw_daily SET synced_at = '2026-03-11 19:00:00' WHERE date = ? AND act_id = 'brand_northlake_golf'`).run(TODAY);
  db.prepare(`UPDATE daily_insights SET spend = 500 WHERE act_id = 'act_100' AND date = ?`).run(TODAY);
  NOW = Date.parse('2026-03-11T19:10:00Z'); HOUR = 13; await alarmsPass(env, d);
  assert.equal(open('no_orders').length, 0, 'switched off for this brand');
});
await ok('c. purchases not tracked: once a day after Triple Whale synced yesterday; fires, clears the next day; skipped where Triple Whale undercounts', async () => {
  fresh(); healthy();
  seedOrders('brand_northlake_golf', 40, { yesterday: 40, yAt: '2026-03-11 07:00:00' });
  for (let i = 1; i <= 8; i++) {
    const dt = addDays(TODAY, -i);
    spendRow('act_100', dt, 500, i === 1 ? 1 : 30);
    db.prepare(`INSERT INTO tw_ad_attr VALUES ('brand_northlake_golf', ?, 'ad1', 'lastPlatformClick', ?)`).run(dt, 30);
  }
  HOUR = 12; await alarmsPass(env, d);
  assert.equal(open('tracking_lost').length, 0, 'not before 1pm');
  HOUR = 13; await alarmsPass(env, d);
  const r = open('tracking_lost');
  assert.equal(r.length, 2); assert.match(r[0].title, /Northlake Golf: purchases are not being tracked/);
  assert.match(r[0].body, /the Meta pixel recorded 1/); assert.doesNotMatch(r[0].body, /Triple Whale recorded/);
  assert.equal(slack.length, 0, 'a Locus row only tonight');
  const st = JSON.parse(rows(`SELECT value FROM settings WHERE key = 'alarmState'`)[0].value);
  assert.equal(st.brand_northlake_golf.trackDay, TODAY, 'once a day');
  /* the next day the pixel is back */
  db.prepare(`UPDATE daily_insights SET purchases = 30 WHERE act_id = 'act_100' AND date = ?`).run(addDays(TODAY, -1));
  st.brand_northlake_golf.trackDay = addDays(TODAY, -1); setS('alarmState', st);
  await alarmsPass(env, d);
  assert.equal(open('tracking_lost').length, 0, 'judged fine: cleared');
  /* Triple Whale undercounts here: the brand is skipped */
  fresh(); healthy(); setS('alarms:brand_northlake_golf', { twUndercounts: true });
  seedOrders('brand_northlake_golf', 40, { yesterday: 40, yAt: '2026-03-11 07:00:00' });
  for (let i = 1; i <= 8; i++) { spendRow('act_100', addDays(TODAY, -i), 500, 30); db.prepare(`INSERT INTO tw_ad_attr VALUES ('brand_northlake_golf', ?, 'ad1', 'lastPlatformClick', ?)`).run(addDays(TODAY, -i), i === 1 ? 0 : 30); }
  HOUR = 13; await alarmsPass(env, d);
  assert.equal(open('tracking_lost').length, 0, 'Triple Whale is not judged here');
  /* ...but the pixel still is */
  fresh(); healthy(); setS('alarms:brand_northlake_golf', { twUndercounts: true });
  seedOrders('brand_northlake_golf', 40, { yesterday: 40, yAt: '2026-03-11 07:00:00' });
  for (let i = 1; i <= 8; i++) spendRow('act_100', addDays(TODAY, -i), 500, i === 1 ? 0 : 30);
  HOUR = 13; await alarmsPass(env, d);
  assert.match(open('tracking_lost')[0].body, /the Meta pixel recorded 0/);
  /* yesterday not synced after midnight yet: no judgment, tried again next hour */
  fresh(); healthy();
  seedOrders('brand_northlake_golf', 40, { yesterday: 40, yAt: '2026-03-11 02:00:00' });
  for (let i = 1; i <= 8; i++) spendRow('act_100', addDays(TODAY, -i), 500, i === 1 ? 0 : 30);
  HOUR = 13; await alarmsPass(env, d);
  assert.equal(open('tracking_lost').length, 0);
  assert.equal(JSON.parse(rows(`SELECT value FROM settings WHERE key = 'alarmState'`)[0].value).brand_northlake_golf.trackDay, undefined);
});
await ok('c. yesterday\'s Triple Whale per ad rows not synced yet: no "recorded 0", wait; from 11pm the pixel alone is judged', async () => {
  fresh(); healthy();
  seedOrders('brand_northlake_golf', 40, { yesterday: 40, yAt: '2026-03-11 07:00:00' });
  for (let i = 1; i <= 8; i++) {
    const dt = addDays(TODAY, -i);
    spendRow('act_100', dt, 500, 30);
    if (i > 1) db.prepare(`INSERT INTO tw_ad_attr VALUES ('brand_northlake_golf', ?, 'ad1', 'lastPlatformClick', ?)`).run(dt, 30);
  }
  HOUR = 13; await alarmsPass(env, d);
  assert.equal(all('tracking_lost').length, 0);
  assert.equal(JSON.parse(rows(`SELECT value FROM settings WHERE key = 'alarmState'`)[0].value).brand_northlake_golf.trackDay, undefined, 'tried again next hour');
  HOUR = 23; await alarmsPass(env, d);
  assert.equal(all('tracking_lost').length, 0, 'the pixel is fine and Triple Whale is not judged');
  assert.equal(JSON.parse(rows(`SELECT value FROM settings WHERE key = 'alarmState'`)[0].value).brand_northlake_golf.trackDay, TODAY);
  /* a day with no Meta row is not "the pixel recorded 0" either */
  assert.deepEqual(trackingGap({ orders: 40, pixel: null, tw: null, spend: 500 }, Array.from({ length: 7 }, () => ({ orders: 40, pixel: 30, tw: 30, spend: 500 }))).broken, []);
});
await ok('a. the daily spending limit: used up today stops everything; budgets over it warn without silencing the stalled check', () => {
  const p = accountProblem({ account_status: 1, adtrust_dsl: 1000 }, 800, 995);
  assert.equal(p.kind, 'dsl_reached'); assert.ok(STOPS_ALL.has(p.kind));
  const q = accountProblem({ account_status: 1, adtrust_dsl: 1000 }, 1500, 200);
  assert.equal(q.kind, 'dsl_over'); assert.ok(!STOPS_ALL.has(q.kind));
  assert.ok(!STOPS_ALL.has('limit_near'), 'a near limit is not a stop');
  assert.equal(accountProblem({ account_status: 1, adtrust_dsl: -1 }, 5000, 4000), null, '-1 = no daily limit');
  assert.equal(accountProblem({ account_status: 1, adtrust_dsl: 1000 }, 900, 300), null);
});
await ok('e. Meta times with an offset are compared as times: a set starting at midnight Central has not started at 6:05pm Central', () => {
  const now = Date.parse('2026-12-01T00:05:00Z');   // Nov 30, 6:05pm Central
  assert.equal(metaMs('2026-12-01T00:00:00-0600'), Date.parse('2026-12-01T06:00:00Z'));
  assert.ok('2026-12-01T00:00:00-0600' <= new Date(now).toISOString(), 'the old string test said it had started');
  assert.deepEqual(runningSets([{ c: 'h1', b: 0, st: '2026-12-01T00:00:00-0600', et: '2026-12-17T23:59:00-0600' }], now), {});
  const r = runningSets([{ c: 'h1', b: 50, st: '2026-11-30T09:00:00-0600', et: null }, { c: 'h1', b: 25, st: null, et: '2026-11-30T12:00:00-0600' }], now);
  assert.deepEqual(r, { h1: { running: 1, budget: 50, since: Date.parse('2026-11-30T15:00:00Z') } }, 'an ended set drops out');
});
await ok('e. a scheduled campaign at 6pm before its sets start: no stalled row, no DM, no campaign read', async () => {
  fresh(); healthy();
  NOW = Date.parse('2026-03-12T00:05:00Z'); HOUR = 18.1;
  db.exec(`INSERT INTO meta_adsets VALUES ('act_100', 's1', 'c1', 'Holiday | New people', 'ACTIVE', NULL, '2026-03-12T00:00:00-0600', NULL)`);
  META['act_100/campaigns'] = { data: [{ id: 'c1', name: 'Holiday', daily_budget: '15000', created_time: '2026-02-01T00:00:00Z', insights: { data: [] } }] };
  META['act_100/adsets'] = { data: [{ id: 's1', campaign_id: 'c1', start_time: '2026-03-12T00:00:00-0600' }] };
  for (let i = 0; i < 3; i++) { await alarmsPass(env, d); NOW += 3600e3; HOUR += 1; }
  assert.equal(all('campaign_stalled').length, 0); assert.equal(slack.length, 0);
  assert.equal(metaCalls.filter(c => c[0] === 'act_100/campaigns').length, 0);
});
await ok('e. a real 6pm start: not stalled at 7pm or 8pm, paced from its start; spend that moved or no earlier look is not stalled', () => {
  const start = Date.parse('2026-11-27T00:00:00Z'), mid = Date.parse('2026-11-26T06:00:00Z');
  const camps = [{ id: 'c1', name: 'BF', daily_budget: '150000', created_time: '2026-11-20T00:00:00Z', spend: 70 }];
  const sets = runningSets([{ c: 'c1', b: 0, st: '2026-11-26T18:00:00-0600' }], start + 36e5);
  assert.equal(campaignChecks(camps, sets, { frac: 19 / 24, nowMs: start + 36e5, midnightMs: mid, prev: { c1: 70 } }).stalled.length, 0, '7pm');
  assert.equal(campaignChecks([{ ...camps[0], spend: 150 }], runningSets([{ c: 'c1', st: '2026-11-26T18:00:00-0600' }], start + 2 * 36e5), { frac: 20 / 24, nowMs: start + 2 * 36e5, midnightMs: mid, prev: { c1: 150 } }).stalled.length, 0, '8pm');
  /* 7 hours after the start with nothing spent, and nothing spent at the last look: stalled, paced from the start */
  const late = start + 7 * 36e5, s7 = runningSets([{ c: 'c1', st: '2026-11-26T18:00:00-0600' }], late);
  const r = campaignChecks([{ ...camps[0], spend: 0 }], s7, { frac: 1, nowMs: late, midnightMs: mid, prev: { c1: 0 } });
  assert.equal(r.stalled.length, 1); assert.equal(Math.round(r.stalled[0].expected), Math.round(1500 * 7 / 24));
  assert.equal(campaignChecks([{ ...camps[0], spend: 40 }], s7, { frac: 1, nowMs: late, midnightMs: mid, prev: { c1: 10 } }).stalled.length, 0, 'spend moved');
  assert.equal(campaignChecks([{ ...camps[0], spend: 0 }], s7, { frac: 1, nowMs: late, midnightMs: mid, prev: null }).stalled.length, 0, 'no earlier look today');
});
await ok('e. sets paused by hand in Ads Manager (D1 still says running): the live read finds none, no row', async () => {
  fresh(); healthy();
  db.exec(`INSERT INTO meta_adsets VALUES ('act_100', 's1', 'c1', 'Set', 'ACTIVE', NULL, NULL, NULL)`);
  META['act_100/campaigns'] = { data: [{ id: 'c1', name: 'BF | Broad', daily_budget: '100000', created_time: '2026-02-01T00:00:00Z', insights: { data: [{ spend: '3' }] } }] };
  META['act_100/adsets'] = { data: [] };
  HOUR = 14; await alarmsPass(env, d); NOW += 3600e3; HOUR = 15; await alarmsPass(env, d);
  assert.equal(all('campaign_stalled').length, 0);
});
await ok('e. over budget after a mid-day budget cut: judged against the day\'s larger budget', () => {
  const old = '2026-02-01T00:00:00Z';
  const c = [{ id: 'c1', name: 'x', daily_budget: '20000', created_time: old, spend: 400 }];
  assert.ok(campaignChecks(c, { c1: { running: 1 } }, { frac: 0.5, nowMs: Date.parse('2026-03-11T20:00:00Z') }).over, 'no earlier budget: over');
  assert.equal(campaignChecks(c, { c1: { running: 1 } }, { frac: 0.5, nowMs: Date.parse('2026-03-11T20:00:00Z'), dayBudget: 1000 }).over, null, 'it was $1,000 this morning');
});
await ok('d. after a sale week the window does not shrink: the median day; an overnight gap is not "no orders"', () => {
  const days = [10, 10, 10, 10, 10, 10, 10, 10, 10, 80, 80, 80, 80, 80];
  assert.equal(medianOf(days), 10); assert.equal(noOrdersHours(medianOf(days)), 20);
  assert.ok(noOrdersHours(days.reduce((s, x) => s + x, 0) / days.length) <= 8, 'the mean would have said 8 hours or less');
  /* last order 11pm Central, now 9am Central: one waking hour, not ten */
  const last = Date.parse('2026-03-12T04:00:00Z'), now = Date.parse('2026-03-12T14:00:00Z');   // daylight time: UTC-5
  assert.equal(wakingHours(last, now, 'America/Chicago'), 1);
  const s = storeStep({ day: TODAY, orders: 30, spendDay: 100, cum: 100, orderAt: last, cumAt: 0 }, { day: '2026-03-12', orders: 0, syncedMs: now, spendDay: 300 }, { nowMs: now, hours: 6, tz: 'America/Chicago' });
  assert.equal(s.down, null, 'the night does not count');
  const s2 = storeStep({ day: TODAY, orders: 30, spendDay: 100, cum: 100, orderAt: last, cumAt: 0 }, { day: '2026-03-12', orders: 0, syncedMs: now + 6 * 36e5, spendDay: 300 }, { nowMs: now + 6 * 36e5, hours: 6, tz: 'America/Chicago' });
  assert.deepEqual(s2.down, { hours: 16, spend: 400 }, 'seven waking hours: down, and the text says the real gap');
});
await ok('a muted brand is never read; a clear runs only for a row this pass raised', async () => {
  fresh(); healthy(); HOUR = 8;
  const md = { ...d, alertsMuted: async (e, id) => id === 'brand_pinecrest_candle' };
  await alarmsPass(env, md);
  assert.equal(metaCalls.filter(c => String(c[0]).startsWith('act_200')).length, 0);
  const st = JSON.parse(rows(`SELECT value FROM settings WHERE key = 'alarmState'`)[0].value);
  assert.equal(st.brand_pinecrest_candle, undefined); assert.deepEqual(st.brand_northlake_golf.up, {});
});
await ok('f. sold out: off by default (no Supply or Meta read); switched on it fires and clears', async () => {
  fresh(); healthy(); HOUR = 9;
  let supply = 0;
  const sd = { ...d, supplyBrandOf: async () => { supply++; return { id: 'north' }; }, supplyFetch: async () => ({ products: [{ title: 'Black Wedge 56', onHand: 0, status: 'out' }] }) };
  META['act_100/ads'] = p => (p.effective_status || []).includes('ACTIVE')
    ? { data: [{ id: '1', name: 'Wedge static', creative: { object_story_spec: { link_data: { link: 'https://shop.example/products/black-wedge-56' } } } }] } : { data: [] };
  await alarmsPass(env, sd);
  assert.equal(supply, 0); assert.equal(open('sold_out').length, 0);
  setS('alarms:brand_northlake_golf', { soldOut: true });
  await alarmsPass(env, sd);
  assert.match(open('sold_out')[0].title, /Northlake Golf: 1 advertised product sold out/);
  assert.match(open('sold_out')[0].body, /Black Wedge 56/);
  const st = JSON.parse(rows(`SELECT value FROM settings WHERE key = 'alarmState'`)[0].value); st.brand_northlake_golf.soldDay = '2026-03-10'; setS('alarmState', st);
  sd.supplyFetch = async () => ({ products: [{ title: 'Black Wedge 56', onHand: 12, status: 'ok' }] });
  await alarmsPass(env, sd);
  assert.equal(open('sold_out').length, 0, 'back in stock: cleared');
});
await ok('Meta backing off: no Meta read at all; stored numbers still judge', async () => {
  fresh(); healthy(); HOUR = 14;
  db.prepare(`UPDATE accounts SET account_status = 2 WHERE act_id = 'act_100'`).run();
  await alarmsPass(env, { ...d, metaBackedOff: async () => true });
  assert.equal(metaCalls.length, 0);
  assert.equal(open('account_blocked').length, 2, 'the stored status still raises');
});
await ok('the hourly sweep clears an alarm row no check has seen for 30 hours', async () => {
  fresh(); healthy(); HOUR = 8;
  META['act_100'] = { account_status: 2 };
  await alarmsPass(env, d);
  assert.equal(open('account_blocked').length, 2);
  await urgentSweep(env, ud, { now: new Date(NOW + 29 * 3600e3) });
  assert.equal(open('account_blocked').length, 2);
  await urgentSweep(env, ud, { now: new Date(NOW + 31 * 3600e3) });
  assert.equal(open('account_blocked').length, 0);
});
await ok('a flapping alarm DMs once a day: fixed then broken again the same day opens the row, no second DM; the next day may DM', async () => {
  fresh(); healthy(); HOUR = 8;
  META['act_100'] = { account_status: 9 };
  await alarmsPass(env, d);
  assert.equal(slack.filter(s => s[0] === 'chat.postMessage').length, 2);
  NOW += 3600e3; META['act_100'] = { account_status: 1 }; await alarmsPass(env, d);
  assert.equal(open('account_blocked').length, 0);
  NOW += 3600e3; META['act_100'] = { account_status: 9 }; slack.length = 0; await alarmsPass(env, d);
  assert.equal(open('account_blocked').length, 2, 'the row is back');
  assert.equal(slack.filter(s => s[0] === 'chat.postMessage').length, 0, 'no second DM today');
  NOW += 3600e3; META['act_100'] = { account_status: 1 }; await alarmsPass(env, d);
  NOW += 24 * 3600e3; META['act_100'] = { account_status: 9 }; await alarmsPass(env, d);
  assert.equal(slack.filter(s => s[0] === 'chat.postMessage').length, 2, 'a new day: DMs again');
});
await ok('no em or en dashes in any alarm text', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('./src/alarms.js', import.meta.url), 'utf8');
  assert.ok(!/[\u2014\u2013]/.test(src));
  for (const r of rows(`SELECT title, body FROM p_notice`)) assert.ok(!/[\u2014\u2013]/.test(r.title + r.body));
});

console.log(process.exitCode ? 'test-alarms: FAILED' : `test-alarms: ${n} checks passed`);
