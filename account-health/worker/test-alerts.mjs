/* Offline checks for live checks, alerts, scheduled tasks, the Ledger door and DM routing (2026-10-09):
 * checknow.js (curve math, today vs normal by this hour, signs, cache, market), alerts.js (rules, evaluation for
 * today / yesterday / last 7 days, goal and fixed baselines, the hourly tick firing once a day, routes, the
 * Strategist's tools and actions), askschedule.js (task / check / dashboard kinds) and slack-router (DMs -> Locus).
 * In-memory SQLite for D1; Triple Whale, Meta, Slack, Pulse, Breezeway, Claude and the Ledger mocked.
 *   node test-alerts.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { hourArr, cumShare, shareAt, brandNow, checkNow, signsOf } from './src/checknow.js';
import { cleanRule, ruleText, evalBrand, isDue, alertTick, handleAlerts, autoTools, autoActions, ensureAlerts } from './src/alerts.js';
import { runSchedule, scheduleTick, ensureSched } from './src/askschedule.js';
import { useFetch as marketFetch } from './src/market.js';

const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const prep = sql => {
  let args = [];
  const st = () => db.prepare(bindSql(sql));
  const o = { bind(...a) { args = a; return o; }, async first() { return st().get(vals(args)) || null; },
    async all() { return { results: st().all(vals(args)) }; }, async run() { if (!/\?\d/.test(sql) && !args.length) { db.exec(sql); return { meta: { changes: 0 } }; } const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } };
  return o;
};
const DB = { prepare: prep, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
db.exec(`CREATE TABLE tw_daily (act_id TEXT, date TEXT, metric TEXT, value REAL, PRIMARY KEY (act_id, date, metric))`);
db.exec(`CREATE TABLE daily_insights (act_id TEXT, date TEXT, spend REAL, impressions INTEGER)`);
db.exec(`CREATE TABLE hourly_insights (act_id TEXT NOT NULL, date TEXT NOT NULL, hour INTEGER NOT NULL, spend REAL NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0,
  purchases REAL NOT NULL DEFAULT 0, revenue REAL NOT NULL DEFAULT 0, synced_at TEXT, PRIMARY KEY (act_id, date, hour))`);
db.exec(`CREATE TABLE connections (brand_id TEXT, kind TEXT, external_id TEXT)`);
db.exec(`CREATE TABLE p_dashboard (id TEXT PRIMARY KEY, name TEXT, channel TEXT)`);
db.exec(`INSERT INTO connections VALUES ('brand_lucky', 'meta', 'act_111'), ('brand_bonk', 'meta', 'act_222')`);
db.exec(`INSERT INTO p_dashboard VALUES ('dash_1', 'Morning numbers', NULL)`);
const getSetting = async (env, k) => db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k)?.value ?? null;
const putSetting = async (env, k, v) => { db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).run(k, v); };
const COLE = 'U06C37MDWD7', AHSAN = 'U06K732S4BD';

/* ---------------- fixed clock: Friday 2026-10-09, 12:00 local ---------------- */
const TODAY = '2026-10-09';
let HOUR = 12;
const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
for (let i = 1; i <= 28; i++) {
  const day = addDays(TODAY, -i);
  for (const [m, v] of [['netSales', 2400], ['totalNetTaxes', 0], ['totalOrders', 24], ['newCustomersOrders', 12], ['blendedAds', 1200]]) db.prepare(`INSERT INTO tw_daily VALUES (?, ?, ?, ?)`).run('brand_lucky', day, m, v);
  db.prepare(`INSERT INTO daily_insights VALUES (?, ?, ?, ?)`).run('act_111', day, 400, 40000);
}

/* ---------------- mocks ---------------- */
let TODAY_SALES = 1200, TODAY_LAST3_ORDERS = 1, META_TODAY_SPEND = 20;
const twCalls = [];
const chart = (id, perHour, upTo = 24) => ({ metricId: id, values: { current: perHour * upTo }, charts: { current: Array.from({ length: upTo }, (_, x) => ({ x, y: perHour })) } });
const twSummary = async (env, shop, start) => {
  twCalls.push(start);
  if (start === TODAY) {
    const ord = Array.from({ length: 12 }, (_, x) => ({ x, y: x >= 9 ? TODAY_LAST3_ORDERS : 1 }));
    return { map: { netSales: TODAY_SALES, totalNetTaxes: 0, totalOrders: 12, totalOrdersWithAmount: 10, newCustomersOrders: 8, blendedAds: 600 },
      raw: { metrics: [{ metricId: 'totalOrders', charts: { current: ord } }] } };
  }
  return { map: {}, raw: { metrics: [chart('netSales', 100), chart('totalOrders', 1), chart('blendedAds', 50)] } };
};
const metaCalls = [];
const metaAll = async (env, path, params) => {
  metaCalls.push(params.time_range.since);
  const rows = [];
  for (let day = params.time_range.since; day <= params.time_range.until; day = addDays(day, 1)) {
    const hours = day === TODAY ? HOUR : 24;
    for (let h = 0; h < hours; h++) rows.push({ date_start: day, hourly_stats_aggregated_by_advertiser_time_zone: `${String(h).padStart(2, '0')}:00:00 - ${String(h).padStart(2, '0')}:59:59`,
      spend: String(day === TODAY ? META_TODAY_SPEND : 20), impressions: String(day === TODAY ? 1000 : 1000), actions: [], action_values: [] });
  }
  return rows;
};
const slackCalls = [];
const USERS = { [COLE]: { id: COLE, profile: { email: 'cole@go-mobius-digital.com' } }, [AHSAN]: { id: AHSAN, profile: { email: 'ahsan@go-mobius-digital.com' } }, UGUEST: { id: 'UGUEST', is_restricted: true, profile: {} } };
const slackApi = async (env, method, p) => {
  slackCalls.push({ method, p });
  if (method === 'chat.postMessage') return { ok: true, ts: '1790000000.' + String(slackCalls.length).padStart(6, '0') };
  if (method === 'users.info') return USERS[p.user] ? { ok: true, user: USERS[p.user] } : { ok: false, error: 'user_not_found' };
  if (method === 'users.lookupByEmail') return p.email === 'ahsan@go-mobius-digital.com' ? { ok: true, user: { id: AHSAN } } : { ok: false };
  if (method === 'conversations.list') return { ok: true, channels: [{ id: 'C_LUCKY_INT', name: 'lucky-internal' }, { id: 'C_LUCKY_CLI', name: 'lucky-golf' }] };
  return { ok: true };
};
const ACCTS = [
  { act_id: 'brand_lucky', name: 'Lucky Golf', tz: 'America/Chicago', currency: 'USD', meta_act: 'act_111', tw_shop: 'lucky.myshopify.com', slack_channel: 'C_LUCKY_INT', brief_channel: 'C_LUCKY_CLI', active: 1, target_cpa: 45, target_roas: 2.5, goals_json: JSON.stringify({ '2026-10': { sales: 93000, spend: 31000 } }) },
  { act_id: 'brand_bonk', name: 'Bonk Golf', tz: 'America/Chicago', currency: 'USD', meta_act: null, tw_shop: null, slack_channel: 'C_BONK_INT', active: 1 },
];
const daysInMonth = ymd => { const [y, m] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const goalsFor = (acct, ym) => { const g = JSON.parse(acct.goals_json || '{}'); return g[ym] || null; };
const posted = [];
const d = {
  getSetting, putSetting, listAccounts: async () => ACCTS, localDate: () => TODAY, localHourFrac: () => HOUR, addDays,
  twSummary, twShift: async () => 0, metaAll, pickAction: () => 0, PURCHASE_TYPES: [], xfetch: async () => { throw new Error('no web here'); }, subCanAfford: () => true,
  centralHour: () => HOUR, centralDate: dt => !dt || Date.now() - dt.getTime() < 6 * 3600e3 ? TODAY : new Date(dt).toISOString().slice(0, 10),
  slackApi, isAdmin: async req => /Bearer (admin|sess)/.test(req.headers.get('Authorization') || ''),
  sessionEmail: async (env, req) => (req.headers.get('Authorization') || '').includes('sess-limited') ? 'noma@go-mobius-digital.com' : null,
  goalsFor, daysInMonth, twMetaDaily: async () => ({}), mintSession: async (env, email) => ({ token: 'mds.minted.' + email }),
  postDashboard: async (env, row) => { posted.push(row); return { ok: true }; },
};
const LEDGER_HITS = [];
const env = { DB, TW_API_KEY: 'tw', META_TOKEN: 'meta', ANTHROPIC_API_KEY: 'k', SLACK_BOT_TOKEN: 'x',
  LEDGER: { fetch: async req => { LEDGER_HITS.push({ url: req.url, auth: req.headers.get('Authorization'), body: await req.json() }); return new Response(JSON.stringify({ answer: 'September software was $1,204, mostly Klaviyo and Asana.' }), { status: 200 }); } } };
marketFetch(async url => {
  if (/ad-status/.test(url)) return new Response(JSON.stringify({ lastRun: new Date().toISOString(), platforms: [{ id: 'meta', name: 'Meta', state: { worst: 'degraded', services: { a: { name: 'Ads Manager', state: 'degraded' } } } }], incidents: [] }));
  if (/headwinds/.test(url)) return new Response(JSON.stringify([{ date: addDays(TODAY, -1), hyb_status: 'BAD' }]));
  return new Response('{}', { status: 404 });
});

const checks = [];
const check = async (name, fn) => { try { await fn(); checks.push({ name, pass: true }); } catch (e) { checks.push({ name, pass: false, error: e.stack?.split('\n').slice(0, 3).join(' | ') }); } };
const fresh = () => db.exec(`DELETE FROM settings WHERE key LIKE 'checknow:%'`);

/* ---------------- checknow ---------------- */
await check('curve math: hourly arrays, cumulative share, share at a fractional hour', async () => {
  const a = hourArr({ metrics: [chart('netSales', 10)] }, ['totalSales', 'netSales']);
  assert.equal(a.length, 24); assert.equal(a[5], 10);
  const cum = cumShare([a, a.map((v, h) => h < 12 ? 20 : 0)]);
  assert.ok(Math.abs(cum[11] - (0.5 + 1) / 2) < 1e-4);
  assert.equal(shareAt(null, 12), 0.5);
  assert.ok(Math.abs(shareAt(cumShare([a]), 12.5) - 12.5 / 24) < 1e-4);
});
await check('brandNow: today so far vs a normal day by this hour (28 days scaled by the hourly curve)', async () => {
  fresh(); TODAY_SALES = 1200;
  const b = await brandNow(env, d, ACCTS[0]);
  assert.equal(b.today_so_far.revenue, 1200);
  assert.equal(b.normal_by_now.revenue, 1200, 'a normal 2,400 day is half done by noon on a flat curve');
  assert.equal(b.vs.revenue, 1);
  assert.equal(b.today_so_far.orders, 10, 'paid orders, not every order');
  assert.equal(b.today_so_far.new_customers, 6, 'new customers less the free orders');
  assert.match(b.curve, /Triple Whale's hourly curve, last 5 days/);
  assert.ok(metaCalls.includes(addDays(TODAY, -28)), 'Meta hourly backfilled once when the history was thin');
  assert.equal(b.normal_by_now.meta_spend, 240); assert.equal(b.today_so_far.meta_spend, 240);
  assert.equal(b.signs.filter(s => s.level === 'high').length, 0);
});
await check('brandNow: slow revenue, no orders for 3 hours and stuck Meta spend become plain signs; the answer is cached 10 minutes', async () => {
  fresh(); TODAY_SALES = 450; TODAY_LAST3_ORDERS = 0; META_TODAY_SPEND = 8;
  const n0 = twCalls.length;
  const b = await brandNow(env, d, ACCTS[0]);
  const txt = b.signs.map(s => s.text).join(' ');
  assert.match(txt, /Revenue is at 38% of a normal day by this hour \(\$450 so far, about \$1,200 is normal by now\)/);
  assert.match(txt, /No orders in the last 3 hours/);
  assert.match(txt, /Meta has spent 40% of a normal day/);
  assert.equal(b.signs[0].level, 'high');
  assert.equal(twCalls.length - n0, 1, 'the curve is kept for the day: one Triple Whale call');
  const again = await brandNow(env, d, ACCTS[0]);
  assert.equal(again.cached, true); assert.equal(twCalls.length - n0, 1);
  assert.ok(!/—/.test(JSON.stringify(b)));
});
await check('checkNow: all brands + the market now (Pulse, Breezeway); a brand with no Triple Whale says so', async () => {
  const r = await checkNow(env, d, { act: 'all' });
  assert.equal(r.brands.length, 2);
  assert.match(r.headline, /Something looks off on Lucky Golf/);
  assert.ok(r.weird);
  assert.deepEqual(r.market.platforms_now.map(p => p.platform), ['Meta']);
  assert.equal(r.market.breezeway.status, 'BAD');
  assert.match(r.brands.find(b => b.act_id === 'brand_bonk').notes.join(' '), /No Triple Whale shop/);
  assert.equal(r.chatter, null, 'the web search runs only when asked');
  TODAY_LAST3_ORDERS = 1; META_TODAY_SPEND = 20;
});

/* ---------------- rules ---------------- */
await check('cleanRule + ruleText: Cole\'s example reads back in plain words; ROAS today and bad thresholds are refused', async () => {
  const c = cleanRule({ metric: 'revenue', window: 'today', baseline: 'normal', comparison: 'below', threshold: 50, at_hour_central: 12 });
  assert.ok(c.rule);
  assert.equal(ruleText({ ...c.rule, act: 'brand_lucky' }, 'Lucky Golf'), "Tell us when Lucky Golf's revenue today so far by 12pm Central is under 50% of a normal day by that hour.");
  assert.match(cleanRule({ metric: 'roas', window: 'today', threshold: 80 }).error, /finished days/);
  assert.match(cleanRule({ metric: 'revenue', threshold: 5000, baseline: 'normal' }).error, /percent/);
  assert.match(cleanRule({ metric: 'vibes', threshold: 5 }).error, /Metric must be/);
  assert.equal(cleanRule({ metric: 'cpa', window: 'last 7 days', baseline: 'fixed', comparison: 'above', threshold: 40 }).rule.window, 'last7');
});
await check('evalBrand: today below normal fires with the number and the normal; goal pro-rates to the hour; fixed compares the number', async () => {
  fresh(); TODAY_SALES = 450;
  const row = { act: 'brand_lucky', metric: 'revenue', window: 'today', baseline: 'normal', comparison: 'below', threshold: 50, at_hour_central: 12 };
  const r = await evalBrand(env, d, row, ACCTS[0]);
  assert.equal(r.fire, true);
  assert.match(r.text, /\*Lucky Golf: revenue today so far by 12pm Central is at 38% of normal\.\*\n\$450 against \$1,200 for a normal day by this hour \(last 28 days\)\./);
  const g = await evalBrand(env, d, { ...row, baseline: 'goal' }, ACCTS[0]);
  assert.ok(Math.abs(g.base - 93000 / 31 * 0.5) < 0.01, 'the monthly goal per day, half done by noon');
  const f = await evalBrand(env, d, { ...row, metric: 'mer', baseline: 'fixed', threshold: 1 }, ACCTS[0]);
  assert.equal(f.fire, true); assert.match(f.text, /MER today so far by 12pm Central is 0\.75x, under your line of 1\.00x/);
  const ok = await evalBrand(env, d, { ...row, threshold: 30 }, ACCTS[0]);
  assert.equal(ok.fire, false);
});
await check('evalBrand: yesterday and last 7 days against the 28 days before; an unsynced day waits; no goal says where to set one', async () => {
  const y = await evalBrand(env, d, { act: 'brand_lucky', metric: 'cpa', window: 'last7', baseline: 'normal', comparison: 'above', threshold: 120 }, ACCTS[0]);
  assert.equal(y.base, 50); assert.equal(y.value, 50); assert.equal(y.fire, false);
  const cpm = await evalBrand(env, d, { act: 'brand_lucky', metric: 'meta_cpm', window: 'yesterday', baseline: 'fixed', comparison: 'above', threshold: 8 }, ACCTS[0]);
  assert.equal(cpm.value, 10); assert.equal(cpm.fire, true);
  db.exec(`DELETE FROM tw_daily WHERE date = '${addDays(TODAY, -1)}'`);
  const w = await evalBrand(env, d, { act: 'brand_lucky', metric: 'revenue', window: 'yesterday', baseline: 'normal', comparison: 'below', threshold: 50 }, ACCTS[0]);
  assert.match(w.wait, /not synced/);
  for (const [m, v] of [['netSales', 2400], ['totalNetTaxes', 0], ['totalOrders', 24], ['newCustomersOrders', 12], ['blendedAds', 1200]]) db.prepare(`INSERT INTO tw_daily VALUES (?, ?, ?, ?)`).run('brand_lucky', addDays(TODAY, -1), m, v);
  const ng = await evalBrand(env, d, { act: 'brand_lucky', metric: 'orders', window: 'yesterday', baseline: 'goal', comparison: 'below', threshold: 50 }, ACCTS[0]);
  assert.match(ng.skip, /no goal for orders/);
});
await check('isDue: at its hour (up to 2 hours late), once a day; no hour = every hour 9am to 9pm for today', async () => {
  const r = { active: 1, window: 'today', at_hour_central: 12 };
  HOUR = 11; assert.equal(isDue(r, d), false);
  HOUR = 12; assert.equal(isDue(r, d), true);
  HOUR = 15; assert.equal(isDue(r, d), false);
  HOUR = 13; assert.equal(isDue({ ...r, last_checked: new Date().toISOString() }, d), false);
  assert.equal(isDue({ ...r, last_checked: '2026-10-08T17:00:00Z' }, d), true);
  assert.equal(isDue({ ...r, last_fired: new Date().toISOString() }, d), false);
  assert.equal(isDue({ active: 1, window: 'today', at_hour_central: null }, d), true);
  HOUR = 22; assert.equal(isDue({ active: 1, window: 'today', at_hour_central: null }, d), false);
  HOUR = 12;
});

/* ---------------- routes ---------------- */
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
const call = async (method, path, body, auth = 'Bearer admin') => {
  const res = await handleAlerts(new Request('https://ah.test' + path, { method, headers: { Authorization: auth, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, path.split('?')[0], json, d);
  return { status: res.status, j: await res.json() };
};
let alertId;
await check('routes: create, list in plain words, refuse a client channel, pause, test now, delete; no sign-in = 401', async () => {
  assert.equal((await call('GET', '/api/alerts', null, '')).status, 401);
  const bad = await call('PUT', '/api/alerts', { act: 'brand_lucky', metric: 'revenue', threshold: 50, channel: 'C_LUCKY_CLI' });
  assert.equal(bad.status, 400); assert.match(bad.j.error, /never a client channel/);
  const ok = await call('PUT', '/api/alerts', { act: 'brand_lucky', metric: 'revenue', window: 'today', baseline: 'normal', comparison: 'below', threshold: 50, at_hour_central: 12, mention: COLE, by: 'cole' });
  assert.equal(ok.status, 200); alertId = ok.j.alert.id;
  assert.match(alertId, /^al_[0-9a-f]{10}$/);
  const list = await call('GET', '/api/alerts');
  assert.equal(list.j.alerts[0].rule, "Tell us when Lucky Golf's revenue today so far by 12pm Central is under 50% of a normal day by that hour.");
  assert.equal(list.j.alerts[0].channel_name, "the brand's internal channel");
  assert.ok(list.j.metrics.some(m => m.id === 'meta_cpm'));
  const t = await call('POST', '/api/alerts/test', { id: alertId });
  assert.equal(t.j.fires, true); assert.match(t.j.fired[0].text, /38% of normal/);
  assert.equal((await call('POST', '/api/alerts/pause', { id: alertId, active: false })).j.active, false);
  assert.equal((await call('GET', '/api/alerts')).j.alerts[0].active, false);
  await call('POST', '/api/alerts/pause', { id: alertId, active: true });
  const dm = await call('PUT', '/api/alerts', { act: 'all', metric: 'spend', threshold: 30, channel: 'UGUEST' });
  assert.equal(dm.status, 400, 'a guest cannot be DMed alerts');
});
await check('route /api/daycheck/now: one brand, or all brands filtered to a limited person\'s brands', async () => {
  db.exec(`INSERT OR REPLACE INTO settings VALUES ('userBrands', '{"noma@go-mobius-digital.com": ["brand_bonk"]}')`);
  const one = await call('GET', '/api/daycheck/now?act=brand_lucky');
  assert.equal(one.j.brands.length, 1); assert.equal(one.j.brands[0].name, 'Lucky Golf');
  const lim = await call('GET', '/api/daycheck/now?act=all', null, 'Bearer sess-limited');
  assert.deepEqual(lim.j.brands.map(b => b.name), ['Bonk Golf']);
  db.exec(`DELETE FROM settings WHERE key = 'userBrands'`);
});

/* ---------------- the hourly tick ---------------- */
await check('alertTick: fires once at 12pm Central with the number, the normal, the tag and the Locus link; never twice a day', async () => {
  fresh(); HOUR = 12; slackCalls.length = 0;
  const r = await alertTick(env, d);
  assert.deepEqual(r.fired, [alertId]);
  const p = slackCalls.find(c => c.method === 'chat.postMessage');
  assert.equal(p.p.channel, 'C_LUCKY_INT');
  const body = JSON.stringify(p.p.blocks);
  assert.match(body, /<@U06C37MDWD7> \*Lucky Golf: revenue today so far by 12pm Central is at 38% of normal/);
  assert.match(body, /\$450 against \$1,200/);
  assert.match(body, /open=yesterday&act=brand_lucky/);
  assert.match(body, /Reports > Dashboards > Alerts/);
  assert.ok(!/—/.test(body));
  slackCalls.length = 0;
  HOUR = 13; const again = await alertTick(env, d);
  assert.equal(again.fired.length, 0); assert.equal(slackCalls.filter(c => c.method === 'chat.postMessage').length, 0);
  const row = db.prepare(`SELECT * FROM p_alert WHERE id = ?`).get(alertId);
  assert.equal(row.last_status, 'fired'); assert.equal(row.last_value, 450);
  HOUR = 12;
});

/* ---------------- the Strategist ---------------- */
const tools = Object.fromEntries(autoTools({ auto: d }).map(t => [t.def.name, t]));
const acts = Object.fromEntries(autoActions({ auto: d }).map(a => [a.name, a]));
const slackCtx = (user = COLE) => ({ surface: 'slack', ev: { user, channel: 'D1', ts: '1.1' }, screen: { act_id: 'brand_lucky' } });
await check('create_alert: "tell me if revenue is under half by noon" becomes one card; dm = the person; Apply goes through the route', async () => {
  const p = await acts.create_alert.propose(env, { brand: 'Lucky', metric: 'revenue', window: 'today', baseline: 'normal', comparison: 'below', threshold: 50, at_hour: 12, channel: 'dm', summary: 'Alert me if Lucky revenue is under half by noon' }, null, slackCtx(AHSAN));
  assert.ok(!p.error, p.error);
  assert.match(p.detail, /under 50% of a normal day by that hour/); assert.match(p.detail, /Posts to a direct message/);
  assert.equal(p.patch.method, 'PUT'); assert.equal(p.patch.path, '/api/alerts');
  assert.equal(p.patch.body.channel, AHSAN); assert.equal(p.patch.body.mention, null);
  const sent = [];
  const r = await acts.create_alert.apply(env, p.patch, null, { call: async (m, path, body) => { sent.push({ m, path, body }); return (await call(m, path, body)).j; } });
  assert.equal(r.ok, true); assert.equal(sent[0].body.act, 'brand_lucky');
  const web = await acts.create_alert.propose(env, { brand: 'Lucky Golf', metric: 'cpa', window: 'last7', baseline: 'fixed', comparison: 'above', threshold: 40, summary: 'x' }, null, { surface: 'web', who: 'ahsan@go-mobius-digital.com' });
  assert.equal(web.patch.body.channel, null); assert.equal(web.patch.body.mention, AHSAN, 'Locus asker is tagged by their Slack id');
  const refused = await acts.create_alert.propose(env, { brand: 'Lucky Golf', metric: 'revenue', window: 'today', baseline: 'normal', comparison: 'below', threshold: 50, channel: '#lucky-golf', summary: 'x' }, null, slackCtx());
  assert.match(refused.error, /never a client channel/);
});
await check('list_alerts, pause_alert and delete_alert find a rule by its words', async () => {
  const l = JSON.parse((await tools.list_alerts.run(env, {}, slackCtx())).text);
  assert.ok(l.length >= 2);
  const p = await acts.pause_alert.propose(env, { alert: alertId, active: false, summary: 'Pause it' });
  assert.equal(p.patch.path, '/api/alerts/pause');
  await call('PUT', '/api/alerts', { act: 'brand_lucky', metric: 'cpa', window: 'last7', baseline: 'fixed', comparison: 'above', threshold: 40 });
  const del = await acts.delete_alert.propose(env, { alert: 'CPA the last 7 days over', summary: 'Delete it' });
  assert.ok(!del.error, del.error);
  assert.match(del.patch.path, /^\/api\/alerts\?id=al_/);
});
await check('check_now tool: the channel\'s brand by default, JSON with the signs', async () => {
  const r = await tools.check_now.run(env, {}, slackCtx());
  const j = JSON.parse(r.text);
  assert.equal(j.scope, 'brand_lucky'); assert.ok(j.brands[0].signs.length);
});
await check('ask_ledger: Cole only; forwards to the Ledger\'s /api/ask with a minted Cole session and returns its answer', async () => {
  const no = await tools.ask_ledger.run(env, { question: 'What did we spend on software in September?' }, slackCtx(AHSAN));
  assert.equal(no.is_error, true); assert.match(no.text, /Cole only/);
  const yes = await tools.ask_ledger.run(env, { question: 'What did we spend on software in September?' }, slackCtx(COLE));
  assert.match(yes.text, /THE LEDGER'S ANSWER[\s\S]*\$1,204/);
  assert.equal(LEDGER_HITS[0].url, 'https://mobius-ledger.mobius-digital.workers.dev/api/ask');
  assert.equal(LEDGER_HITS[0].auth, 'Bearer mds.minted.cole@go-mobius-digital.com');
  assert.match(LEDGER_HITS[0].body.question, /software in September/);
  const web = await tools.ask_ledger.run(env, { question: 'P&L for Q3' }, { surface: 'web', who: 'cole@go-mobius-digital.com' });
  assert.ok(!web.is_error);
});

/* ---------------- scheduled tasks ---------------- */
const answers = [];
const engine = {
  answerWeb: async (env2, q) => { answers.push(q); return /Scheduled task/.test(q)
    ? { answer: 'Lucky ad set 412 is spending past its CPA; I suggest cutting its budget 20%.', proposals: [{ id: 'p1', summary: 'Cut 412 budget to $80 a day', detail: '$100 -> $80' }] }
    : { answer: 'Report built.', reports: [{ title: 'Lucky week', blocks: [{ type: 'text', text: 'Revenue up 8%.' }] }] }; },
  proposalBlocks: p => [{ type: 'section', text: { type: 'mrkdwn', text: `*${p.summary}*` } }, { type: 'actions', elements: [{ type: 'button', action_id: 'ask_apply', value: JSON.stringify({ askp: p.id, app: 'locus' }) }] }],
};
const sd = { ...d, strategist: () => ({ engine, h: () => ({}) }), auto: d };
await check('schedule_task card: a task in words -> PUT /api/ask/schedules with kind task; never to a client channel or a DM', async () => {
  const p = await acts.schedule_task.propose(env, { instruction: 'Every Monday check Lucky ad sets and suggest budget moves', kind: 'task', brand: 'Lucky Golf', cadence: 'monday', hour: 9, summary: 'Weekly budget check' }, null, slackCtx());
  assert.ok(!p.error, p.error);
  assert.equal(p.patch.body.kind, 'task'); assert.equal(p.patch.body.channel, 'C_LUCKY_INT'); assert.equal(p.patch.body.hour_central, 9);
  assert.match(p.detail, /Apply card for a person to approve/);
  assert.match((await acts.schedule_task.propose(env, { instruction: 'post the numbers please', kind: 'task', brand: 'Lucky Golf', cadence: 'daily', channel: '#lucky-golf', summary: 'x' }, null, slackCtx())).error, /never a client channel/);
  const dash = await acts.schedule_task.propose(env, { kind: 'dashboard', dashboard: 'morning', brand: 'Lucky Golf', cadence: 'weekdays', summary: 'x' }, null, slackCtx());
  assert.ok(!dash.error, dash.error);
  assert.equal(dash.patch.body.ref, 'dash_1');
});
await check('a scheduled TASK posts the answer and one Apply card per suggested change in the thread, never applying them', async () => {
  await ensureSched(env);
  db.exec(`INSERT INTO p_ask_schedule (id, question, act, cadence, hour_central, channel, created_by, kind) VALUES ('sq_task000001', 'Check Lucky ad sets and suggest budget moves', 'brand_lucky', 'daily', 9, 'C_LUCKY_INT', 'cole@go-mobius-digital.com', 'task')`);
  slackCalls.length = 0;
  const row = db.prepare(`SELECT * FROM p_ask_schedule WHERE id = 'sq_task000001'`).get();
  const r = await runSchedule(env, row, sd);
  assert.equal(r.ok, true); assert.equal(r.cards, 1);
  assert.match(answers.at(-1), /Scheduled task[\s\S]*PROPOSE it with your actions/);
  const posts = slackCalls.filter(c => c.method === 'chat.postMessage');
  assert.equal(posts.length, 2);
  assert.match(JSON.stringify(posts[0].p.blocks), /1 suggested change in the thread/);
  assert.equal(posts[1].p.thread_ts, posts[0].p.ts ?? posts[1].p.thread_ts);
  assert.match(JSON.stringify(posts[1].p.blocks), /ask_apply/);
  assert.equal(db.prepare(`SELECT last_status FROM p_ask_schedule WHERE id = 'sq_task000001'`).get().last_status, 'ok, 1 Apply card');
});
await check('CHECK and DASHBOARD kinds read and post only: no model call, no daily cap; a REPORT posts the report text', async () => {
  db.exec(`INSERT INTO p_ask_schedule (id, question, act, cadence, hour_central, channel, created_by, kind, ref) VALUES ('sq_check00001', 'The live check', 'brand_lucky', 'weekdays', 9, 'C_LUCKY_INT', 'cole', 'check', NULL), ('sq_dash000001', 'Post the dashboard', 'all', 'daily', 9, 'C_LUCKY_INT', 'cole', 'dashboard', 'dash_1'), ('sq_rep0000001', 'Build the Lucky week report', 'brand_lucky', 'monday', 9, 'C_LUCKY_INT', 'cole', 'report', NULL)`);
  const n = answers.length; slackCalls.length = 0;
  const c = await runSchedule(env, db.prepare(`SELECT * FROM p_ask_schedule WHERE id = 'sq_check00001'`).get(), sd);
  assert.equal(c.ok, true); assert.equal(answers.length, n, 'no model call');
  assert.match(JSON.stringify(slackCalls.find(x => x.method === 'chat.postMessage').p.blocks), /Lucky Golf right now[\s\S]*revenue 38% of normal by now/);
  const dsh = await runSchedule(env, db.prepare(`SELECT * FROM p_ask_schedule WHERE id = 'sq_dash000001'`).get(), sd);
  assert.equal(dsh.ok, true); assert.equal(posted[0].channel, 'C_LUCKY_INT'); assert.equal(posted[0].id, 'dash_1');
  slackCalls.length = 0;
  const rep = await runSchedule(env, db.prepare(`SELECT * FROM p_ask_schedule WHERE id = 'sq_rep0000001'`).get(), sd);
  assert.equal(rep.ok, true); assert.match(JSON.stringify(slackCalls[0].p.blocks), /Lucky week[\s\S]*Revenue up 8%/);
  db.exec(`INSERT OR REPLACE INTO settings VALUES ('askSchedRuns', '{"date":"${TODAY}","n":10}')`);
  db.exec(`UPDATE p_ask_schedule SET last_run = NULL`);
  HOUR = 10;
  const tick = await scheduleTick(env, { ...sd, centralDate: () => TODAY });
  assert.ok(tick.capped, 'model kinds stop at the cap');
  assert.ok(tick.ran.includes('sq_check00001') && tick.ran.includes('sq_dash000001'), 'read-only kinds still run: ' + JSON.stringify(tick));
  HOUR = 12;
});

/* ---------------- slack-router: DMs come to the Strategist ---------------- */
const secret = 'sig';
const sign = raw => { const ts = String(Math.floor(Date.now() / 1000)); return { 'x-slack-request-timestamp': ts, 'x-slack-signature': 'v0=' + crypto.createHmac('sha256', secret).update(`v0:${ts}:${raw}`).digest('hex') }; };
const router = (await import('../../slack-router/worker/src/worker.js')).default;
const hits = [];
const binding = (name, owns = false) => ({ fetch: async req => { hits.push({ name, url: req.url }); return new Response(JSON.stringify({ owns }), { status: 200 }); } });
await check('router: a DM (text or file) goes to Locus now; a channel Locus does not own still goes to the Ledger', async () => {
  const renv = { SLACK_SIGNING_SECRET: secret, LEDGER: binding('LEDGER'), AUTH: binding('AUTH', false), PULSE: binding('PULSE') };
  const ev = async e => { hits.length = 0; const raw = JSON.stringify({ type: 'event_callback', event: e }); await router.fetch(new Request('https://r.test/slack/events', { method: 'POST', headers: { 'Content-Type': 'application/json', ...sign(raw) }, body: raw }), renv); return hits.at(-1); };
  const dm = await ev({ type: 'message', channel_type: 'im', channel: 'D123', user: COLE, text: 'how is Lucky today' });
  assert.equal(dm.name, 'AUTH'); assert.match(dm.url, /\/slack\/events$/);
  assert.equal((await ev({ type: 'message', channel_type: 'im', channel: 'D123', user: COLE, files: [{ id: 'F1' }] })).name, 'AUTH');
  const fin = await ev({ type: 'app_mention', channel_type: 'channel', channel: 'C_FINANCE', user: COLE, text: '<@B> P&L?' });
  assert.equal(fin.name, 'LEDGER');
});

const failed = checks.filter(c => !c.pass);
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : `\n      ${c.error}`}`);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
