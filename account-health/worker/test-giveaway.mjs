/* Offline checks for giveaway spend vs sales MER (2026-10-10, profit/worker/src/giveaway.js).
 *   node test-giveaway.mjs      (from account-health/worker)
 * In-memory SQLite (node:sqlite) for D1, Klaviyo mocked. Checks: the most to pay per entry (Dartee $3.20, Lucky $1.40,
 * Grunk's 3.0 floor), the campaign match rules, the split math (sales spend, Sales MER, blended MER), entries from Meta
 * leads and from a Klaviyo list, status and pace, Lucky and Dartee seeded once by name, a brand without a giveaway
 * unchanged (hub route, command center, brief), the REAL profit worker routes (/api/hub/giveaway, /api/giveaway,
 * /api/hub/command judged on sales spend), the brief and report lines, and no em dashes in what it writes. */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } }; };
const DB = { prepare: stmt, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied */ } } };
load(path.join(root, 'profit', 'worker', 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'migrations', 'brand-001.sql'));
load(path.join(here, 'schema.sql'));
try { db.exec(`CREATE TABLE IF NOT EXISTS meta_campaigns (act_id TEXT NOT NULL, campaign_id TEXT PRIMARY KEY, name TEXT, objective TEXT, status TEXT, daily_budget REAL, lifetime_budget REAL, bid_strategy TEXT, created_time TEXT, synced_at TEXT)`); } catch {}

const G = await import('../../profit/worker/src/giveaway.js');
const checks = [];
async function check(name, fn) { try { await fn(); checks.push(true); console.log('PASS ', name); } catch (e) { checks.push(false); console.log('FAIL ', name, '\n      ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n      ')); } }
const near = (a, b, msg) => assert.ok(a != null && Math.abs(a - b) < 0.011, `${msg}: ${a} != ${b}`);

/* Dates around the real today (America/Chicago), so the workers' own clocks agree with the data. */
const T = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const D = n => { const d = new Date(T + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const day0 = D(-3), day1 = D(-2), day2 = D(-1);

/* ---------------- pure ---------------- */
await check('most to pay per entry = buy rate x AOV / floor: Dartee $3.20, Lucky $1.40, Grunk on a 3.0 floor', () => {
  const dartee = G.SEEDS.find(s => s.match.test('Dartee Golf')).cfg, lucky = G.SEEDS.find(s => s.match.test('Lucky Golf')).cfg;
  assert.equal(G.maxCostPerEntry(dartee, G.merFloorFor('Dartee Golf', dartee)), 3.2);
  assert.equal(G.maxCostPerEntry(lucky, G.merFloorFor('Lucky Golf', lucky)), 1.4);
  assert.equal(G.merFloorFor('Grunk Dolfer', null), 3.0);
  assert.equal(G.merFloorFor('Bonk Golf', null), 2.5);
  near(G.maxCostPerEntry({ buy_rate: 0.1, aov: 90 }, G.merFloorFor('Grunk Dolfer', null)), 3, 'Grunk');
  assert.equal(G.merFloorFor('Grunk Dolfer', { mer_floor: 2.8 }), 2.8, 'the giveaway\'s own floor wins');
  assert.equal(G.maxCostPerEntry({ buy_rate: null, aov: 80 }, 2.5), null, 'no buy rate, no figure');
});
await check('matching: name holds giveaway or leads (any case), a leads objective, extra terms; sales campaigns never', () => {
  const cfg = { extra_terms: ['Sweeps'], match_objective: 1 };
  assert.ok(G.matchesCampaign(cfg, { name: '[MD] GIVEAWAY | Win a belt', objective: 'OUTCOME_SALES' }));
  assert.ok(G.matchesCampaign(cfg, { name: 'Holiday Leads push', objective: 'OUTCOME_TRAFFIC' }));
  assert.ok(G.matchesCampaign(cfg, { name: 'Form', objective: 'OUTCOME_LEADS' }));
  assert.ok(G.matchesCampaign(cfg, { name: 'Old form', objective: 'LEAD_GENERATION' }));
  assert.ok(G.matchesCampaign(cfg, { name: 'October sweeps', objective: 'OUTCOME_SALES' }), 'extra term');
  assert.ok(!G.matchesCampaign(cfg, { name: '[MD] CBO # 2', objective: 'OUTCOME_SALES' }));
  assert.ok(!G.matchesCampaign({ ...cfg, match_objective: 0 }, { name: 'Form', objective: 'OUTCOME_LEADS' }), 'objective switched off');
  assert.ok(!G.matchesCampaign(cfg, { name: null, objective: null }), 'an unsynced campaign is sales');
});
await check('the split: sales spend, Sales MER on it, blended MER beside it; nothing in the window = blended only', () => {
  const cfg = { act_id: 'x', name: 'G', start: '2026-10-09', end: '2026-11-16', buy_rate: 0.1, aov: 80, entries_goal: 10000, daily_budget: 555 };
  const g = G.judge(cfg, { brand: 'Dartee Golf', today: '2026-10-11', from: '2026-10-09', to: '2026-10-10', revenue: 6000, spend: 2400,
    window_gw: { spend: 575, leads: 190, days: {} }, to_date_gw: { spend: 575, leads: 190, leads_counted: true, campaigns: [] } });
  near(g.window.sales_spend, 1825, 'sales spend'); near(g.window.sales_mer, 6000 / 1825, 'Sales MER'); near(g.window.blended_mer, 2.5, 'blended MER');
  assert.equal(g.to_date.entries, 190); assert.equal(g.to_date.entries_source, 'meta_leads'); near(g.to_date.cost_per_entry, 3.03, 'cost per entry');
  assert.equal(g.status, 'on_track'); assert.equal(g.to_date.days_elapsed, 2); assert.equal(g.to_date.days_total, 39);
  assert.equal(g.to_date.expected_entries, 513); assert.equal(g.to_date.pace_status, 'behind');
  const over = G.judge(cfg, { brand: 'Dartee Golf', today: '2026-10-11', from: '2026-10-09', to: '2026-10-10', revenue: 6000, spend: 2400,
    window_gw: { spend: 575 }, to_date_gw: { spend: 575, leads: 190 }, list: { count: 150 } });
  assert.equal(over.status, 'on_track', 'no Klaviyo list set: the list count is ignored');
  const kl = G.judge({ ...cfg, klaviyo_list_id: 'AbC123', list_baseline: 0 }, { brand: 'Dartee Golf', today: '2026-10-11', from: '2026-10-09', to: '2026-10-10', revenue: 6000, spend: 2400,
    window_gw: { spend: 575 }, to_date_gw: { spend: 575, leads: 190 }, list: { count: 150 } });
  assert.equal(kl.to_date.entries_source, 'klaviyo'); near(kl.to_date.cost_per_entry, 3.83, 'cost per entry'); assert.equal(kl.status, 'over_max');
  const before = G.judge(cfg, { brand: 'Dartee Golf', today: '2026-10-11', from: '2026-10-01', to: '2026-10-08', revenue: 6000, spend: 2400, window_gw: { spend: 0 } });
  assert.equal(before.in_window, false); near(before.window.sales_mer, 2.5, 'nothing to take out: Sales MER equals blended');
  assert.equal(G.judge(cfg, { brand: 'Dartee Golf', today: '2026-10-05', from: '2026-10-01', to: '2026-10-04' }).status, 'not_started');
  assert.equal(G.judge(cfg, { brand: 'Dartee Golf', today: '2026-10-20', from: '2026-10-01', to: '2026-10-04' }).payback.status, 'later');
  assert.equal(G.judge(cfg, { brand: 'Dartee Golf', today: '2026-12-02', from: '2026-10-01', to: '2026-10-04' }).payback.status, 'needs_segment');
  const pb = G.judge({ ...cfg, payback_segment_id: 'Seg123' }, { brand: 'Dartee Golf', currency: 'USD', today: '2026-12-02', from: '2026-10-01', to: '2026-10-04', to_date_gw: { spend: 1000 }, payback_seg: { count: 40 } }).payback;
  assert.equal(pb.status, 'measured'); near(pb.return, 3.2, '40 buyers x $80 on $1,000');
});
await check('settings are checked in plain words ("3" means 3%)', () => {
  assert.match(G.clean({ start: '', end: '' })[0], /start and end/);
  assert.match(G.clean({ start: '2026-10-09', end: '2026-10-01', buy_rate: 3, aov: 80 })[0], /before the start/);
  assert.match(G.clean({ start: '2026-10-09', end: '2026-11-16', aov: 80 })[0], /share of entries that buy is needed/);
  assert.match(G.clean({ start: '2026-10-09', end: '2026-11-16', buy_rate: 3, aov: 'x' })[0], /not a number/);
  const [err, c] = G.clean({ start: '2026-10-09', end: '2026-11-16', buy_rate: '3', aov: '$117', extra_terms: 'Sweeps, , WIN', klaviyo_list_id: 'XyZ12a' });
  assert.equal(err, null); assert.equal(c.buy_rate, 0.03); assert.equal(c.aov, 117); assert.deepEqual(c.extra_terms, ['sweeps', 'win']);
});

/* ---------------- data ---------------- */
db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, source) VALUES
  ('brand_dartee_golf', 'dartee_golf', 'Dartee Golf', 'active', 'USD', 'America/Chicago', 'locus'),
  ('brand_lucky_golf', 'lucky_golf', 'Lucky Golf', 'active', 'USD', 'America/Chicago', 'locus'),
  ('brand_bonk_golf', 'bonk_golf', 'Bonk Golf', 'active', 'USD', 'America/Chicago', 'locus')`);
db.exec(`INSERT INTO connections (id, brand_id, kind, external_id, is_primary, source) VALUES
  ('meta:act_963', 'brand_dartee_golf', 'meta', 'act_963', 1, 'locus'), ('meta:act_378', 'brand_lucky_golf', 'meta', 'act_378', 1, 'locus'), ('meta:act_125', 'brand_bonk_golf', 'meta', 'act_125', 1, 'locus')`);
db.exec(`INSERT INTO meta_campaigns (act_id, campaign_id, name, objective) VALUES
  ('act_963', 'c1', '[MD] Giveaway | Win a belt', 'OUTCOME_SALES'), ('act_963', 'c2', '[MD] CBO # 2', 'OUTCOME_SALES'),
  ('act_963', 'c3', 'Form campaign', 'OUTCOME_LEADS'), ('act_963', 'c4', 'Holiday LEADS push', 'OUTCOME_TRAFFIC'),
  ('act_125', 'b1', 'Bonk Giveaway test', 'OUTCOME_SALES'), ('act_125', 'b2', 'Bonk sales', 'OUTCOME_SALES')`);
db.exec(`INSERT INTO ads (act_id, ad_id, name, campaign_id) VALUES ('act_963', 'a1', 'g', 'c1'), ('act_963', 'a2', 's', 'c2'), ('act_963', 'a3', 'f', 'c3'), ('act_963', 'a4', 'l', 'c4'),
  ('act_125', 'k1', 'bg', 'b1'), ('act_125', 'k2', 'bs', 'b2')`);
const ad = (act, id, date, spend, leads = 0) => db.prepare(`INSERT INTO ad_daily (act_id, ad_id, date, spend, leads) VALUES (?, ?, ?, ?, ?)`).run(act, id, date, spend, leads);
ad('act_963', 'a1', day0, 100); ad('act_963', 'a1', day1, 200, 80); ad('act_963', 'a1', day2, 300, 90);
for (const d of [day0, day1, day2]) { ad('act_963', 'a2', d, 500); ad('act_125', 'k1', d, 100); ad('act_125', 'k2', d, 400); }
ad('act_963', 'a3', day1, 50, 20); ad('act_963', 'a4', day1, 25);
const tw = (act, date, metric, v) => db.prepare(`INSERT INTO tw_daily (act_id, date, metric, value) VALUES (?, ?, ?, ?)`).run(act, date, metric, v);
for (const act of ['brand_dartee_golf', 'brand_bonk_golf']) for (const d of [day0, day1, day2]) {
  tw(act, d, 'totalSales', 3000); tw(act, d, 'netSales', 3000); tw(act, d, 'totalNetTaxes', 0); tw(act, d, 'blendedAds', 1200); tw(act, d, 'totalOrders', 30);
}
const goals = JSON.stringify({ [day2.slice(0, 7)]: { sales: 90000, spend: 30000 }, [day0.slice(0, 7)]: { sales: 90000, spend: 30000 } });
db.prepare(`UPDATE brands SET goals_json = ? WHERE id IN ('brand_dartee_golf', 'brand_bonk_golf')`).run(goals);
const env = { DB };

await check('Lucky and Dartee are seeded once, by name, with the agreed defaults; a removed one never comes back', async () => {
  const g = await G.loadGiveaways(env);
  assert.deepEqual(Object.keys(g).sort(), ['brand_dartee_golf', 'brand_lucky_golf']);
  const d = g.brand_dartee_golf, l = g.brand_lucky_golf;
  assert.deepEqual([d.start, d.end, d.daily_budget, d.entries_goal, d.buy_rate, d.aov], ['2026-10-09', '2026-11-16', 555, 10000, 0.1, 80]);
  assert.deepEqual([l.start, l.end, l.daily_budget, l.entries_goal, l.buy_rate, l.aov], ['2026-10-14', '2026-11-16', 200, 5000, 0.03, 117]);
  await G.removeGiveaway(env, 'brand_lucky_golf');
  G._reset();
  assert.deepEqual(Object.keys(await G.loadGiveaways(env)), ['brand_dartee_golf']);
});
await check('spend: only matched campaigns and only on the giveaway\'s dates; Meta leads counted', async () => {
  await G.saveGiveaway(env, 'brand_dartee_golf', { name: 'Dartee giveaway', start: day1, end: D(30), buy_rate: 10, aov: 80, entries_goal: 10000, daily_budget: 555 }, 'test');
  const cfgs = await G.loadGiveaways(env);
  const sp = (await G.giveawaySpend(env, cfgs, day0, day2)).brand_dartee_golf;
  near(sp.spend, 575, 'c1 on day1 and day2, c3 and c4 on day1; c1 on day0 is before the start'); assert.equal(sp.leads, 190);
  assert.deepEqual(sp.campaigns.map(c => c.id).sort(), ['c1', 'c3', 'c4']);
  near(sp.days[day1].spend, 275, 'day1'); assert.equal(sp.days[day0], undefined);
});

/* ---------------- the real profit worker ---------------- */
const PF = (await import('../../profit/worker/src/worker.js')).default;
const penv = { DB, ADMIN_TOKEN: 'adm' };
const call = async (method, p, body) => { const r = await PF.fetch(new Request('https://pf.test' + p, { method, headers: { Authorization: 'Bearer adm', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), penv, { waitUntil() {} }); return { status: r.status, j: await r.json() }; };

await check('/api/hub/giveaway: Dartee split over the window; Bonk (no giveaway) is simply absent', async () => {
  const r = await call('GET', `/api/hub/giveaway?act=all&from=${day1}&to=${day2}&cmp=none`);
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.deepEqual(r.j.brands.map(b => b.act_id), ['brand_dartee_golf']);
  const b = r.j.brands[0];
  near(b.window.revenue, 6000, 'revenue'); near(b.window.spend, 2400, 'all spend'); near(b.window.giveaway_spend, 575, 'giveaway');
  near(b.window.sales_mer, 6000 / 1825, 'Sales MER'); near(b.window.blended_mer, 2.5, 'blended');
  assert.equal(b.to_date.entries, 190); near(b.to_date.cost_per_entry, 3.03, 'cost per entry'); assert.equal(b.max_cost_per_entry, 3.2); assert.equal(b.status, 'on_track');
  const bonk = await call('GET', `/api/hub/giveaway?act=brand_bonk_golf&from=${day1}&to=${day2}`);
  assert.deepEqual(bonk.j.brands, [], 'Bonk has a campaign named Giveaway but no giveaway: nothing splits');
});
await check('/api/giveaway: read, refuse bad input, save, Klaviyo list counts the entries', async () => {
  const g = await call('GET', '/api/giveaway?act=brand_dartee_golf');
  assert.equal(g.j.floor, 2.5); assert.equal(g.j.max_cost_per_entry, 3.2); assert.equal(g.j.klaviyo_connected, false);
  const bad = await call('PUT', '/api/giveaway', { act: 'brand_dartee_golf', start: day1, end: day0, buy_rate: 10, aov: 80 });
  assert.equal(bad.status, 400); assert.match(bad.j.error, /before the start/);
  db.prepare(`INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source) VALUES ('brand_dartee_golf', '', 'klaviyo', ?, 'approved', 'staff')`).run(JSON.stringify({ key: 'pk_test_123456789012' }));
  const ok = await call('PUT', '/api/giveaway', { act: 'brand_dartee_golf', name: 'Dartee giveaway', start: day1, end: D(30), buy_rate: 10, aov: 80, entries_goal: 10000, daily_budget: 555, klaviyo_list_id: 'AbC123', list_baseline: 50 });
  assert.equal(ok.status, 200, JSON.stringify(ok.j));
  const real = globalThis.fetch; let asked = null;
  globalThis.fetch = async (u, o) => { if (String(u).startsWith('https://a.klaviyo.com/api/lists/AbC123')) { asked = o.headers.Authorization; return new Response(JSON.stringify({ data: { attributes: { name: 'Giveaway', profile_count: 200 } } }), { status: 200 }); } return real(u, o); };
  try {
    const r = await call('GET', `/api/hub/giveaway?act=brand_dartee_golf&from=${day1}&to=${day2}`);
    const b = r.j.brands[0];
    assert.equal(asked, 'Klaviyo-API-Key pk_test_123456789012');
    assert.equal(b.to_date.entries_source, 'klaviyo'); assert.equal(b.to_date.entries, 150, '200 members minus the 50 already there');
    near(b.to_date.cost_per_entry, 575 / 150, 'cost per entry'); assert.equal(b.status, 'over_max');
  } finally { globalThis.fetch = real; }
  /* back to Meta leads for the rest */
  await call('PUT', '/api/giveaway', { act: 'brand_dartee_golf', name: 'Dartee giveaway', start: day1, end: D(30), buy_rate: 10, aov: 80, entries_goal: 10000, daily_budget: 555 });
});
await check('the command center judges MER on SALES spend with a giveaway, and on all spend without one', async () => {
  const r = await call('GET', '/api/hub/command?act=all');
  assert.equal(r.status, 200, JSON.stringify(r.j).slice(0, 300));
  const dar = r.j.brands.find(b => b.act_id === 'brand_dartee_golf'), bonk = r.j.brands.find(b => b.act_id === 'brand_bonk_golf');
  assert.equal(dar.goal.kind, 'mer'); assert.equal(dar.goal.sales, true);
  near(dar.goal.value7, 9000 / (3600 - 575), '7-day Sales MER');
  assert.ok(!dar.reasons.some(x => x.kind === 'goal'), 'Sales MER 2.98 is within 10% of the 3.0 goal: no reason');
  assert.equal(dar.giveaway.status, 'on_track');
  assert.ok(!bonk.goal.sales, 'Bonk is judged on all spend'); near(bonk.goal.value7, 2.5, 'blended');
  assert.ok(bonk.reasons.some(x => x.kind === 'goal' && /^MER 2\.50x/.test(x.text)), 'Bonk off goal on blended MER, as before');
});

/* ---------------- the brief and the report (account-health) ---------------- */
const AH = await import('./src/worker.js');
const T2 = AH._giveawayTest;
const acctOf = async id => (await DB.prepare(`SELECT * FROM brand_accounts WHERE act_id = ?1`).bind(id).first());
await check('briefData: Dartee\'s days carry giveaway spend and Sales MER; Bonk\'s brief data has no giveaway', async () => {
  const d = await T2.briefData(env, await acctOf('brand_dartee_golf'), day2);
  const a1 = d.days.find(x => x.date === day1).a, a2 = d.days.find(x => x.date === day2).a;
  near(a1.giveaway_spend, 275, 'day1 giveaway'); near(a1.sales_mer, 3000 / (1200 - 275), 'day1 Sales MER');
  near(a2.giveaway_spend, 300, 'day2'); assert.ok(d.giveaway && d.giveaway.name === 'Dartee giveaway');
  const b = await T2.briefData(env, await acctOf('brand_bonk_golf'), day2);
  assert.equal(b.giveaway, null); assert.equal(b.days.find(x => x.date === day2).a.sales_mer, undefined);
});
const briefData = (gw) => ({
  account: { name: 'Dartee Golf', currency: 'USD' }, month: day2.slice(0, 7), up_to: day2, goals: { sales: 90000, spend: 30000 }, goals_planned: true,
  cogs_quality: { verdict: 'good' }, mtd: { sales: 6000, spend: 2400, ...(gw ? { giveaway_spend: 575, sales_mer: 3.29 } : {}) },
  days: [{ date: day2, f: { sales: 3000, spend: 1000, mer: 3 }, a: { sales: 3000, spend: 1200, mer: 2.5, amer: 1, ...(gw ? { giveaway_spend: 300, sales_spend: 900, sales_mer: 3000 / 900 } : {}) } }],
  giveaway: gw ? { name: 'Dartee giveaway', start: day1, end: D(30), to_date: { entries: 1234, cost_per_entry: 1.2, giveaway_spend: 1480.8 }, window: { giveaway_spend: 575 } } : null,
});
await check('brief lines: Sales MER on a giveaway day plus ONE giveaway line; a brand without one is unchanged', () => {
  const v2 = T2.buildBriefTextV2(briefData(true), [day2], null), v1 = T2.buildBriefText(briefData(true), [day2], null);
  for (const t of [v2, v1]) {
    assert.match(t, /Sales MER: \*3\.33x\* \(2\.50x including giveaway spend\)/);
    assert.equal((t.match(/Giveaway: 1,234 entries at \$1\.20 each, building the Black Friday list\./g) || []).length, 1, t);
    assert.ok(!/\nMER: /.test(t), 'the plain MER row is replaced on that day');
  }
  const plain2 = T2.buildBriefTextV2(briefData(false), [day2], null), plain1 = T2.buildBriefText(briefData(false), [day2], null);
  for (const t of [plain2, plain1]) { assert.match(t, /\nMER: \*2\.50x\*/); assert.ok(!/Giveaway|Sales MER/.test(t)); }
  assert.ok(!/—/.test(v2 + v1), 'no em dashes');
});
await check('report headline: Sales MER and the giveaway line only when one ran; an old frozen report renders as before', () => {
  const base = { account: { currency: 'USD' }, period: 'weekly', totals: { sales: 6000, spend: 2400, mer: 2.5, cm: null }, forecast: {}, previous: {} };
  const old = T2.reportHeadline(base);
  assert.ok(!/Giveaway|Sales MER/.test(old)); assert.equal(old.split('\n').length, 3);
  const g = T2.reportHeadline({ ...base, giveaway: { to_date: { entries: 1234, cost_per_entry: 1.2, giveaway_spend: 1480 }, window: { giveaway_spend: 575, sales_mer: 3.29, blended_mer: 2.5 } } });
  assert.match(g, /• \*Sales MER\* 3\.29x  \(2\.50x including giveaway spend\)/);
  assert.match(g, /• \*Giveaway\* 1,234 entries at \$1\.20 each, building the Black Friday list\./);
});
await check('reportData carries the giveaway for Dartee\'s week and not for Bonk\'s', async () => {
  const r = await T2.reportData(env, await acctOf('brand_dartee_golf'), 'weekly', day0, D(3));
  assert.ok(r.giveaway, 'giveaway present'); near(r.giveaway.window.giveaway_spend, 575, 'week giveaway spend');
  const b = await T2.reportData(env, await acctOf('brand_bonk_golf'), 'weekly', day0, D(3));
  assert.equal(b.giveaway, undefined);
});
await check('the Strategist\'s store view carries the split', async () => {
  const s = await T2.storePeriod(env, await acctOf('brand_dartee_golf'), day1, day2);
  near(s.giveaway_spend, 575, 'giveaway'); near(s.sales_spend, 1825, 'sales spend'); near(s.sales_mer, 6000 / 1825, 'Sales MER');
  assert.match(s.how_to_read, /GIVEAWAY/); assert.match(s.giveaway.read, /Sales MER/);
  const b = await T2.storePeriod(env, await acctOf('brand_bonk_golf'), day1, day2);
  assert.equal(b.giveaway, undefined); assert.ok(!/GIVEAWAY/.test(b.how_to_read));
});
await check('client logins: /api/hub/giveaway is on CLIENT_RULES with act need, in both identical brandguard copies', async () => {
  const a = fs.readFileSync(path.join(root, 'profit/worker/src/brandguard.js'), 'utf8'), b = fs.readFileSync(path.join(here, 'src/brandguard.js'), 'utf8');
  assert.equal(a, b);
  const { CLIENT_RULES } = await import('./src/brandguard.js');
  const r = CLIENT_RULES.find(x => x.p === '/api/hub/giveaway');
  assert.deepEqual([r.m, r.act], ['GET', 'need']);
  assert.ok(!CLIENT_RULES.some(x => x.p === '/api/giveaway'), 'the settings stay team only');
});
await check('no em dashes in the giveaway code or its screen', () => {
  for (const f of ['profit/worker/src/giveaway.js', 'profit/giveaway.js']) assert.ok(!/—/.test(fs.readFileSync(path.join(root, f), 'utf8')), f);
});

const pass = checks.filter(Boolean).length;
console.log(`\n${pass}/${checks.length} passed`);
process.exit(pass === checks.length ? 0 : 1);
