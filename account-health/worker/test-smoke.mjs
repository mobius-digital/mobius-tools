/* Offline checks for the daily smoke check (smoke.js, 2026-10-10): the route table against the generated route
 * list, the plan per brand (what each brand has connected), the hourly tick (waits for its hour, runs once a
 * Central day, spreads over ticks when the budget is short, posts ONE message of failures), quiet mode, the
 * switch, connections and freshness, in-process routes one at a time, the meter put back, and the admin routes.
 * In-memory SQLite for D1; the PROFIT and SUPPLY bindings, this worker's own routes, Meta, Asana and Slack mocked.
 * Nothing here reaches a real Slack channel.
 *   node test-smoke.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SMOKE_ROUTES, buildPlan, smokeTick, smokeRunNow, handleSmoke, slackText } from './src/smoke.js';
import { ROUTES } from './src/routes.js';

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); pass++; };

/* ---------------- D1 ---------------- */
const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : v]));
const prep = sql => { let args = []; const st = () => db.prepare(bindSql(sql));
  const o = { bind(...a) { args = a; return o; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { st().run(vals(args)); return {}; } };
  return o; };
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
db.exec(`CREATE TABLE daily_insights (act_id TEXT, date TEXT, spend REAL)`);
db.exec(`CREATE TABLE tw_daily (act_id TEXT, date TEXT, metric TEXT, value REAL, synced_at TEXT)`);
db.exec(`CREATE TABLE connections (brand_id TEXT, kind TEXT, external_id TEXT)`);
db.exec(`INSERT INTO connections VALUES ('brand_lucky', 'meta', 'act_111'), ('brand_bonk', 'meta', 'act_222')`);
const getSetting = async (env, k) => db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k)?.value ?? null;
const putSetting = async (env, k, v) => { db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).run(k, String(v)); };
const delSetting = k => db.prepare(`DELETE FROM settings WHERE key = ?`).run(k);

/* ---------------- clock: Saturday 2026-10-10, Central ---------------- */
const TODAY = '2026-10-10', YDAY = '2026-10-09';
let HOUR = 5;
const NOW = Date.parse('2026-10-10T11:00:00Z');
const addDays = (ymd, n) => { const x = new Date(`${ymd}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const iso = h => new Date(NOW - h * 36e5).toISOString();
function seedFresh() {
  db.exec(`DELETE FROM daily_insights; DELETE FROM tw_daily;`);
  for (const act of ['act_111', 'act_222']) db.prepare(`INSERT INTO daily_insights VALUES (?, ?, 100)`).run(act, YDAY);
  for (const b of ['brand_lucky', 'brand_bonk']) db.prepare(`INSERT INTO tw_daily VALUES (?, ?, 'netSales', 1, ?)`).run(b, YDAY, iso(2).replace('T', ' ').slice(0, 19));
  putSetting(null, 'lastHourly', JSON.stringify({ at: iso(1) }));
  putSetting(null, 'lastRun', JSON.stringify({ at: iso(8) }));
}

/* ---------------- brands and their connections ---------------- */
const ACCTS = [
  { act_id: 'brand_lucky', name: 'Lucky Golf', tz: 'America/Chicago', meta_act: 'act_111', tw_shop: 'lucky-wedges.myshopify.com', last_sync_insights: iso(1).replace('T', ' ').slice(0, 19), last_error: null },
  { act_id: 'brand_bonk', name: 'Bonk Golf', tz: 'America/Chicago', meta_act: 'act_222', tw_shop: '9f63c4-2.myshopify.com', last_sync_insights: iso(2), last_error: null },
];
const item = (key, state, extra = {}) => ({ key, name: key, state, note: `${key} is ${state}`, ...extra });
let REPORT;
const baseReport = () => ({
  agency: [item('meta', 'ok'), item('tw', 'ok'), item('slack', 'ok'), item('asana', 'ok'), item('anthropic', 'ok'),
    item('google', 'ok', { checks: [{ name: 'Google Analytics', ok: true }, { name: 'Google Ads API', ok: true }] }), item('stripe', 'off')],
  brands: [
    { act_id: 'brand_lucky', items: [item('meta', 'ok'), item('tw', 'ok'), item('ga4', 'ok'), item('gsc', 'off'), item('clarity', 'off'), item('tiktok', 'part'),
      item('google_ads', 'ok', { levels: [{ name: 'Through Triple Whale', on: true }, { name: 'Direct', on: true }] }),
      item('email', 'ok', { tool: 'klaviyo', levels: [{ name: 'Through Triple Whale', on: true }, { name: 'Direct', on: true }] })] },
    { act_id: 'brand_bonk', items: [item('meta', 'ok'), item('tw', 'ok'), item('ga4', 'off'), item('gsc', 'off'), item('clarity', 'off'), item('tiktok', 'off'),
      item('google_ads', 'part', { levels: [{ name: 'Through Triple Whale', on: true }, { name: 'Direct', on: false }] }),
      item('email', 'part', { tool: 'klaviyo', levels: [{ name: 'Through Triple Whale', on: true }, { name: 'Direct', on: false }] })] },
  ],
});

/* ---------------- the meter (worker.js SUB_USED / subLeft / hold) ---------------- */
let USED = 0, LIMIT = 10000; const RESERVE = 8;
const meter = { left: () => LIMIT - USED - RESERVE, used: () => USED, spend: (n = 1) => { USED += n; }, zero: () => { USED = 0; },
  hold: () => { const was = USED; return extra => { USED = was + extra; }; } };

/* ---------------- mocks: profit binding, in-process routes, supply, Meta, Asana, Slack ---------------- */
const calls = []; let FAIL = new Map(); let ahActive = 0, ahMax = 0;
const answer = (path, status = 200, body = { ok: true }) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const respond = p => { const f = [...FAIL].find(([k]) => p.startsWith(k)); return f ? answer(p, f[1].status, f[1].body) : answer(p); };
const env = {
  DB: { prepare: prep },
  META_TOKEN: 'm', ASANA_TOKEN: 'a', SLACK_BOT_TOKEN: 'x', SUPPLY_TOKEN: 's',
  PROFIT: { async fetch(req) { const u = new URL(req.url); calls.push({ w: 'profit', path: u.pathname + u.search, auth: req.headers.get('Authorization') }); await new Promise(r => setTimeout(r, 2)); return respond(u.pathname + u.search); } },
  SUPPLY: { async fetch(req) { const u = new URL(req.url); calls.push({ w: 'supply', path: u.pathname + u.search }); if (u.pathname === '/api/brands') return answer('', 200, { brands: [{ id: 'lucky', act_id: 'brand_lucky', active: true }, { id: 'old', act_id: 'act_999', active: true }] }); return respond(u.pathname); } },
};
const ahFetch = async (req) => {
  const u = new URL(req.url); ahActive++; ahMax = Math.max(ahMax, ahActive);
  calls.push({ w: 'ah', path: u.pathname + u.search, auth: req.headers.get('Authorization') });
  USED = 0;                                     // handle() resets the meter, as the real one does
  await new Promise(r => setTimeout(r, 3)); USED += 5;   // ...and spends five calls
  ahActive--;
  return respond(u.pathname + u.search);
};
const slack = [];
const slackApi = async (env, method, p) => { slack.push({ method, p }); USED++; return method === 'auth.test' ? { ok: true } : { ok: true, ts: '1.1' }; };
const xf = [];
const xfetch = async (url) => { xf.push(String(url)); USED++; return answer('', 200, { id: '1' }); };
const d = {
  getSetting, putSetting, listAccounts: async (env, active) => { USED++; return ACCTS; }, localDate: () => TODAY, addDays,
  centralHour: () => HOUR, centralDate: () => TODAY, slackApi, xfetch, isAdmin: async req => req.headers.get('Authorization') === 'Bearer admin',
  mintSession: async (env, email) => ({ token: 'mds.cole.' + email }), integrationsReport: async () => { USED += 20; return REPORT; },
  ahFetch, meter, now: () => NOW,
};
const reset = () => { calls.length = 0; slack.length = 0; xf.length = 0; FAIL = new Map(); USED = 0; LIMIT = 10000; ahMax = 0; REPORT = baseReport(); seedFresh(); };

/* ================= 1. the route table matches the routes the workers really answer ================= */
for (const r of SMOKE_ROUTES) {
  if (r.w === 'supply') continue;
  const p = r.path.split('?')[0];
  const known = ROUTES.find(x => x.p === p && x.w === r.w && (x.m === 'GET' || x.m === 'ANY'))
    || ROUTES.filter(x => x.m === 'ANY' && x.w === r.w && p.startsWith(x.p)).length;
  ok(known, `route table: ${r.w} ${p} is a GET the ${r.w} worker answers (src/routes.js)`);
}
ok(SMOKE_ROUTES.every(r => ['all', 'brand', 'both'].includes(r.scope)), 'every route has a scope');
ok(SMOKE_ROUTES.every(r => !/POST|PUT|DELETE|write|send|undo|sync|run/i.test(r.path)), 'only reads: no write, send, undo, sync or run route is checked');

/* ================= 2. the plan follows what each brand has ================= */
reset();
const brands = ACCTS.map(a => ({ ...a, supply: a.act_id === 'brand_lucky' ? 'lucky' : null, items: REPORT.brands.find(b => b.act_id === a.act_id).items }));
const plan = buildPlan(brands, { from: '2026-09-10', to: YDAY });
const of = (act, frag) => plan.filter(c => c.act === act && c.path.includes(frag));
ok(of('brand_lucky', '/api/google/ads?').length === 1 && of('brand_bonk', '/api/google/ads?').length === 0, 'Google Ads routes only for a brand linked directly');
ok(of('brand_lucky', '/api/klaviyo').length === 2 && of('brand_bonk', '/api/klaviyo').length === 0, 'Klaviyo routes only for a brand with its own key');
ok(of('brand_lucky', '/api/google/website').length === 1 && of('brand_lucky', '/api/google/search').length === 0, 'GA4 checked when readable, Search Console skipped when not linked');
ok(plan.filter(c => c.w === 'supply').map(c => c.act).join() === 'brand_lucky', 'Stock only where Supply carries the brand');
ok(plan.filter(c => c.path.startsWith('/api/tiktok')).length === 0, 'TikTok direct skipped when only through Triple Whale');
ok(plan.filter(c => c.path === '/api/overview?days=30').length === 1, 'All-only routes run once');
ok(of('all', '/api/calendar?act=all').length === 1 && of('brand_bonk', '/api/calendar').length === 1, '"both" routes run for All clients and each brand');
ok(plan.every(c => !/[{}]/.test(c.path)), 'every placeholder filled');
ok(of('brand_lucky', '/api/google/ads?')[0].path.includes('from=2026-09-10&to=2026-10-09'), 'Google window is the 30 days to yesterday');
eq(plan.map(c => c.id), plan.map((_, i) => i), 'ids are positions');
const one = buildPlan(brands, { from: 'a', to: 'b', only: 'brand_bonk' });
ok(one.length && one.every(c => c.act === 'brand_bonk'), 'a one-brand run checks only that brand');

/* ================= 3. the tick: waits for its hour, runs, posts failures once ================= */
reset();
putSetting(null, 'strategistChannel', 'C_STRAT');
HOUR = 5;
eq(await smokeTick(env, d), { waiting: 'starts at 6:00 Central' }, 'before 6am Central it waits');
HOUR = 6;
FAIL.set('/api/hub/paid?platform=meta&act=brand_bonk', { status: 500, body: { error: 'D1_ERROR: no such column' } });
FAIL.set('/api/klaviyo?act=brand_lucky&what=overview', { status: 502, body: { error: 'Klaviyo said the key is invalid' } });
USED = 7000;   // briefs and the rest already spent most of the tick
const t1 = await smokeTick(env, d);
ok(t1.finished, 'with room in the budget one tick finishes the run');
ok(USED >= 7000, 'the meter was put back: the tick count is the saved count plus the smoke spend, never reset to zero');
eq(ahMax, 1, 'in-process routes run one at a time');
ok(calls.filter(c => c.w !== 'supply').every(c => c.auth === 'Bearer mds.cole.cole@go-mobius-digital.com'), 'every route is read with a minted owner session');
const posts = slack.filter(s => s.method === 'chat.postMessage');
eq(posts.length, 1, 'ONE Slack message per run');
eq(posts[0].p.channel, 'C_STRAT', 'to the Strategist channel');
const txt = posts[0].p.text;
ok(/2 of \d+ checks failed/.test(txt), 'the headline says how many failed');
ok(txt.includes('Bonk Golf, Ads &gt; Meta: HTTP 500: D1_ERROR: no such column'), 'the line names the brand, the page and the error');
ok(txt.includes('<https://tools.go-mobius-digital.com/profit/?open=meta&act=brand_bonk|Open>'), 'and links to that page in Locus');
ok(txt.includes('Lucky Golf, Email and SMS: HTTP 502: Klaviyo said the key is invalid'), 'an in-process route failure is reported the same way');
ok(!/\u2014|\u2013/.test(txt), 'no em or en dashes in the message');
const last = JSON.parse(await getSetting(null, 'smokeLast'));
eq(last.failed.length, 2, 'smokeLast keeps the failures');
ok(last.posted === true && last.total > 50 && last.checked === last.routes && last.not_checked === 0, 'smokeLast: posted, every route checked');
ok(last.cost > 0 && last.by_page.length > 10, 'smokeLast: cost and per-page counts');
const callsAfter = calls.length;
eq(await smokeTick(env, d), { done: true }, 'the next tick the same day does nothing');
eq(calls.length, callsAfter, '...and calls nothing');

/* ================= 4. short budget: spread over ticks, post once at the end ================= */
reset();
putSetting(null, 'strategistChannel', 'C_STRAT');
delSetting('smokeRun');
HOUR = 7; FAIL.set('/api/briefs?act=brand_lucky', { status: 500, body: { error: 'boom' } });
LIMIT = 10000; USED = 10000 - 8 - 1500 - 120;   // 120 left over the keep
const a1 = await smokeTick(env, d);
ok(!a1.finished && a1.checked > 0 && a1.left > 0, 'a short budget checks part and keeps the rest for the next tick');
ok(USED <= 10000 - 8 - 1500 + 30, 'it leaves the keep for the jobs after it');
eq(slack.filter(s => s.method === 'chat.postMessage').length, 0, 'nothing posted mid-run');
const prog = JSON.parse(await getSetting(null, 'smokeRun'));
eq(prog.next, prog.results.length, 'progress saved in smokeRun');
let guard = 0;
while (guard++ < 40) { USED = 10000 - 8 - 1500 - 200; HOUR++; const r = await smokeTick(env, d); if (r.finished) break; }
const done = JSON.parse(await getSetting(null, 'smokeLast'));
ok(done.ticks > 1 && done.checked === done.routes, 'later ticks finish the run');
const rc = calls.filter(c => !(c.w === 'supply' && c.path.startsWith('/api/brands')));
eq([new Set(rc.map(c => c.w + c.path)).size, rc.length], [done.routes, done.routes], 'every route checked exactly once across ticks');
eq(slack.filter(s => s.method === 'chat.postMessage').length, 1, 'one post at the end');
ok(slack.find(s => s.method === 'chat.postMessage').p.text.includes('Lucky Golf, Reports &gt; Brief: HTTP 500: boom'), 'with the failure');
const before = USED; LIMIT = 10000; USED = 10000 - 8 - 200;
const deferred = await (async () => { delSetting('smokeRun'); return smokeTick(env, d); })();
eq(deferred, { deferred: 'out of budget' }, 'almost no budget: it defers instead of starting');
void before;

/* ================= 5. quiet, the switch, no channel ================= */
reset(); delSetting('smokeRun'); HOUR = 6;
putSetting(null, 'strategistChannel', 'C_STRAT');
await smokeTick(env, d);
eq(slack.filter(s => s.method === 'chat.postMessage').length, 0, 'a clean run posts nothing by default (quiet)');
reset(); delSetting('smokeRun'); putSetting(null, 'smokeQuiet', 'off');
await smokeTick(env, d);
const q = slack.filter(s => s.method === 'chat.postMessage');
ok(q.length === 1 && /^Locus check, Sat, Oct 10: all \d+ checks passed\.$/.test(q[0].p.text), 'smokeQuiet off: one line when everything passed');
delSetting('smokeQuiet');
reset(); delSetting('smokeRun'); putSetting(null, 'smokeCheck', 'off');
eq(await smokeTick(env, d), { off: true }, 'smokeCheck off stops it');
eq(calls.length, 0, '...before any call');
delSetting('smokeCheck');
reset(); delSetting('smokeRun'); delSetting('strategistChannel'); FAIL.set('/api/brand?act=brand_lucky', { status: 500, body: { error: 'x' } });
await smokeTick(env, d);
eq(slack.filter(s => s.method === 'chat.postMessage').length, 0, 'no Strategist channel: nothing posted');
ok(/No Strategist channel/.test(JSON.parse(await getSetting(null, 'smokeLast')).post_error), '...and the card says why');
putSetting(null, 'smokeHour', '8'); delSetting('smokeRun'); HOUR = 7;
eq(await smokeTick(env, d), { waiting: 'starts at 8:00 Central' }, 'smokeHour moves the start');
delSetting('smokeHour');

/* ================= 6. connections and freshness ================= */
reset(); delSetting('smokeRun'); HOUR = 6; putSetting(null, 'strategistChannel', 'C_STRAT');
await smokeTick(env, d);   // a clean run remembers what was ok
delSetting('smokeRun'); slack.length = 0;
REPORT = baseReport();
REPORT.brands[0].items.find(i => i.key === 'ga4').state = 'warn';                         // was ok, now not
REPORT.brands[1].items.find(i => i.key === 'meta').state = 'bad';                         // broken
REPORT.agency.find(i => i.key === 'google').checks[1].ok = false;                         // a Google check stopped
REPORT.agency.find(i => i.key === 'tw').state = 'off';                                    // a core key gone
db.exec(`DELETE FROM tw_daily WHERE act_id = 'brand_bonk'`);
db.prepare(`INSERT INTO tw_daily VALUES ('brand_bonk', '2026-10-06', 'netSales', 1, ?)`).run(iso(3));
putSetting(null, 'lastHourly', JSON.stringify({ at: iso(5) }));
await smokeTick(env, d);
const ct = slack.find(s => s.method === 'chat.postMessage').p.text;
ok(ct.includes('Lucky Golf, Connection: ga4'), 'a connection that was ok and is not now is a failure');
ok(ct.includes('Bonk Golf, Connection: meta'), 'a bad connection is a failure');
ok(ct.includes('All clients, Connection: Google: Google Ads API'), 'a Google check that stopped is a failure');
ok(ct.includes('All clients, Connection: tw'), 'a core agency key that is gone is a failure');
ok(!ct.includes('Connection: stripe') && !ct.includes('Connection: gsc'), 'never-connected things are not failures');
ok(ct.includes('Bonk Golf, Data: Triple Whale data: Triple Whale data (tw_daily) stops at 2026-10-06, expected 2026-10-09'), 'stale Triple Whale data is a failure');
ok(ct.includes('Hourly jobs: The hourly jobs last finished 5 hours ago'), 'the hourly jobs not running is a failure');
ok(ct.includes('open=health&act=brand_bonk'), 'freshness links to Data health');
reset(); delSetting('smokeRun');
xfetchFail: {
  const was = d.xfetch;
  d.xfetch = async url => { xf.push(url); USED++; return /graph\.facebook/.test(url) ? answer('', 400, { error: { message: 'Error validating access token' } }) : answer('', 200, {}); };
  await smokeTick(env, d);
  d.xfetch = was;
}
ok(slack.find(s => s.method === 'chat.postMessage').p.text.includes('Meta token: Meta refused the token: Error validating access token'), 'a refused Meta token is a failure');
ok(xf.some(u => u.includes('graph.facebook.com') && !u.includes('access_token')), 'the Meta token goes in a header, never the URL');

/* ================= 7. the admin routes ================= */
reset();
putSetting(null, 'strategistChannel', 'C_STRAT');
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const rq = (method, path, body, tok = 'admin') => new Request('https://ah.internal' + path, { method, headers: { Authorization: 'Bearer ' + tok }, ...(body ? { body: JSON.stringify(body) } : {}) });
eq((await handleSmoke(rq('GET', '/api/smoke', null, 'nope'), env, '/api/smoke', json, d)).status, 401, 'routes are admin only');
eq(await handleSmoke(rq('GET', '/api/other'), env, '/api/other', json, d), null, 'other paths pass through');
FAIL.set('/api/season/war?act=brand_lucky', { status: 500, body: { error: 'war broke' } });
let r = await (await handleSmoke(rq('POST', '/api/smoke/run', {}), env, '/api/smoke/run', json, d)).json();
ok(r.ok && r.last.dry === true && r.last.manual === true, 'Run now is a dry run unless asked');
eq(slack.filter(s => s.method === 'chat.postMessage').length, 0, 'a dry run posts nothing');
ok(r.last.failed.some(f => f.page === 'Season > War Room' && f.brand === 'Lucky Golf'), 'a dry run still records the failure for the card');
r = await (await handleSmoke(rq('POST', '/api/smoke/run', { dry: false, brand: 'brand_lucky' }), env, '/api/smoke/run', json, d)).json();
eq(slack.filter(s => s.method === 'chat.postMessage').length, 1, 'Run now with posting on posts once');
ok(r.last.only === 'brand_lucky' && r.last.failed.filter(f => f.kind === 'route').every(f => f.brand === 'Lucky Golf'), 'Run now for one brand');
const g = await (await handleSmoke(rq('GET', '/api/smoke'), env, '/api/smoke', json, d)).json();
ok(g.last && g.settings.check === 'on' && g.settings.quiet === 'on' && g.settings.hour === 6 && g.settings.channel === true, 'GET /api/smoke: the last run and the switches');
await handleSmoke(rq('PUT', '/api/smoke', { check: 'off', quiet: 'off' }), env, '/api/smoke', json, d);
eq([await getSetting(null, 'smokeCheck'), await getSetting(null, 'smokeQuiet')], ['off', 'off'], 'PUT /api/smoke switches it');
delSetting('smokeCheck'); delSetting('smokeQuiet');
eq((await handleSmoke(rq('POST', '/api/smoke/run', { brand: 'brand_nope' }), env, '/api/smoke/run', json, d)).status, 400, 'an inactive brand is refused');

/* ================= 8. a broken profit binding is reported, not thrown ================= */
reset(); delSetting('smokeRun'); putSetting(null, 'strategistChannel', 'C_STRAT');
const P = env.PROFIT; delete env.PROFIT;
await smokeTick(env, d);
env.PROFIT = P;
ok(slack.find(s => s.method === 'chat.postMessage').p.text.includes('The PROFIT service binding is missing'), 'a missing binding is a failure line, not a crash');

/* ================= 9. text rules ================= */
const src = readFileSync(new URL('./src/smoke.js', import.meta.url), 'utf8');
ok(!/\u2014/.test(src), 'no em dashes in smoke.js');
ok(slackText({ failed: [], total: 3, not_checked: 0 }, 'Sat, Oct 10') === 'Locus check, Sat, Oct 10: all 3 checks passed.', 'the all-clear line');

console.log(`smoke: ${pass} checks passed`);
