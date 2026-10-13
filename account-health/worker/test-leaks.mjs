/* Offline checks for src/leaks.js, the leak finder (2026-10-13). Google Ads, GA4, the model, Klaviyo, Meta's list and
 * TikTok are all mocked; nothing leaves the machine.
 *   node test-leaks.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const db = new DatabaseSync(':memory:');
/* ?N and bare ? become named parameters; only the used values are passed (D1 ignores extras, node:sqlite refuses them). */
const bindSql = sql => { let hi = 0; return sql.replace(/\?(\d*)/g, (_, n) => { if (n) { hi = Math.max(hi, +n); return ':p' + n; } hi++; return ':p' + hi; }); };
const vals = (a, sql) => { const used = new Set([...bindSql(sql).matchAll(/:p(\d+)/g)].map(m => 'p' + m[1])); return Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : v]).filter(([k]) => used.has(k))); };
const DB = { prepare(sql) { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args, sql)) || null; }, async all() { return { results: st().all(vals(args, sql)) }; }, async run() { const r = st().run(vals(args, sql)); return { meta: { changes: r.changes } }; } }; } };
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied */ } } };
load(path.join(root, 'profit', 'worker', 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'migrations', 'brand-001.sql'));
load(path.join(here, 'schema.sql'));
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { DB, ANTHROPIC_API_KEY: 'k', GOOGLE_ADS_MCC: '5566468199', GOOGLE_SA_KEY: JSON.stringify({ client_email: 'sa@x.iam', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };

/* The brand: goal $50 a sale, Google Ads + GA4 linked, a Meta account. */
const run = (sql, ...a) => db.prepare(bindSql(sql)).run(vals(a, sql));
db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, source) VALUES ('brand_x', 'x', 'Test Golf', 'active', 'USD', 'America/Chicago', 'locus'), ('brand_y', 'y', 'Bare Co', 'active', 'USD', 'America/Chicago', 'locus')`);
db.exec(`INSERT INTO connections (id, brand_id, kind, external_id, is_primary, source) VALUES ('meta:act_77', 'brand_x', 'meta', 'act_77', 1, 'locus'), ('gads:1', 'brand_x', 'google_ads', '1234567890', 1, 'locus'), ('ga4:1', 'brand_x', 'ga4', '999', 1, 'locus')`);
db.exec(`INSERT INTO p_br_doc (act_id, line_id, key, data_json) VALUES ('brand_x', '', 'rules', '{"target_cpa":50}')`);
const ba = db.prepare(`SELECT act_id, name FROM brand_accounts WHERE act_id = 'brand_x'`).get();
assert.ok(ba, 'brand_accounts answers for the test brand');
db.exec(`CREATE TABLE IF NOT EXISTS tw_ad_attr (act_id TEXT, date TEXT, ad_id TEXT, model TEXT, revenue REAL, orders REAL, platform TEXT)`);
db.exec(`CREATE TABLE IF NOT EXISTS ad_creative (ad_id TEXT PRIMARY KEY, json TEXT, fetched_at TEXT)`);
db.exec(`INSERT INTO ads (act_id, ad_id, name, adset_id) VALUES ('act_77', 'ad1', 'Broad ad', 'as1'), ('act_77', 'ad2', 'Other ad', 'as2')`);
db.exec(`INSERT INTO ad_creative (ad_id, json, fetched_at) VALUES ('ad1', '{"link":"https://test.com/products/a?utm=x"}', '2026-10-12')`);
for (let i = 0; i < 7; i++) { run(`INSERT INTO ad_daily (act_id, ad_id, date, spend, impressions, link_clicks, reach) VALUES ('act_77', 'ad1', date('2026-10-12', ?1), 100, 10000, 250, 6000)`, `-${i} day`); run(`INSERT INTO ad_daily (act_id, ad_id, date, spend, impressions, link_clicks, reach) VALUES ('act_77', 'ad2', date('2026-10-12', ?1), 50, 10000, 80, 7000)`, `-${i} day`); }
db.exec(`INSERT INTO tw_ad_attr VALUES ('brand_x', '2026-10-10', 'ad1', 'fullFirstClick', 1400, 7, 'meta'), ('brand_x', '2026-10-10', 'ad1', 'lastPlatformClick', 700, 2, 'meta'), ('brand_x', '2026-10-01', 'g', 'lastPlatformClick', 1500, 10, 'google')`);
for (let i = 0; i < 30; i++) run(`INSERT INTO tw_daily (act_id, date, metric, value) VALUES ('brand_x', date('2026-10-12', ?1), 'totalOrders', 10)`, `-${i} day`);

/* ---------- the mocked outside world ---------- */
const seen = { mutate: [], gaql: [], ga4: 0, model: 0 };
let JUDGE = null, JUDGE_LESSON_STATUS = 'holds';
const REVIEW = { summary: 'Page a is the problem: PMax and the paid page both land there.', leaks: [
  { id: 'google_pmax:camp:222', verdict: 'not_the_cause', why: 'It lands on /products/a, which converts 0.2% against 0.8% for the site.', check: 'Fix page a first.', root: 'page a' },
  { id: 'landing_page:/products/a', verdict: 'real', why: 'The page itself.', check: '', root: 'page a' }] };
const LESSON = { status: 'holds', why: 'Competitor terms in a brand campaign are cheap insurance against conquesting.', rule: 'Never block competitor brand names in the brand campaign.', area: 'google_search' };
const TERMS = [
  { term: 'wildcat drivers', spend: 22, clicks: 9 }, { term: 'golf wedges', spend: 30, clicks: 12 }, { term: 'test golf', spend: 15, clicks: 20 },
  { term: 'free golf clubs', spend: 0.4, clicks: 1 },   // under the $1 floor: never sent to the model
];
const R = (j, s = 200) => new Response(JSON.stringify(j), { status: s, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), body = init.body && /^\s*[{[]/.test(String(init.body)) ? JSON.parse(init.body) : null;
  if (u.startsWith('https://oauth2.googleapis.com/token')) return R({ access_token: 'tok', expires_in: 3600 });
  if (u.includes('googleads.googleapis.com') && u.endsWith(':search')) {
    const q = body.query; seen.gaql.push(q);
    if (/FROM search_term_view/.test(q)) return R({ results: TERMS.map(t => ({ searchTermView: { searchTerm: t.term, status: 'NONE' }, campaign: { id: '111', name: 'Search | Non-brand', advertisingChannelType: 'SEARCH' }, adGroup: { id: '5', name: 'Wedges' }, metrics: { costMicros: String(t.spend * 1e6), clicks: String(t.clicks), impressions: '100', conversions: 0, conversionsValue: 0 } })) });
    if (/FROM campaign_search_term_insight/.test(q)) { assert.match(q, /campaign_search_term_insight\.campaign_id = '222'/); return R({ results: [
      { campaignSearchTermInsight: { categoryLabel: 'black clover hats', id: '1' }, metrics: { clicks: '40', impressions: '900', conversions: 0, conversionsValue: 0 } },
      { campaignSearchTermInsight: { categoryLabel: 'golf wedges', id: '2' }, metrics: { clicks: '60', impressions: '900', conversions: 2, conversionsValue: 300 } },
      { campaignSearchTermInsight: { categoryLabel: 'putter', id: '3' }, metrics: { clicks: '4', impressions: '90', conversions: 0, conversionsValue: 0 } }] }); }
    if (/FROM asset_group/.test(q)) return R({ results: [{ campaign: { id: '222' }, assetGroup: { finalUrls: ['https://test.com/products/a'] }, metrics: { costMicros: '1' } }] });
    if (/video_trueview_views|video_views/.test(q)) return R({ results: [{ campaign: { id: '333' }, metrics: { videoTrueviewViews: '5000', videoTrueviewViewRate: 0.07, trueviewAverageCpv: '180000' } }] });
    if (/FROM campaign WHERE/.test(q)) return R({ results: [
      { campaign: { id: '111', name: 'Search | Non-brand', status: 'ENABLED', advertisingChannelType: 'SEARCH' }, metrics: { costMicros: String(400e6), clicks: '300', impressions: '9000', conversions: 6, conversionsValue: 900 } },
      { campaign: { id: '222', name: 'Pmax | Wedges', status: 'ENABLED', advertisingChannelType: 'PERFORMANCE_MAX' }, metrics: { costMicros: String(3000e6), clicks: '4000', impressions: '90000', conversions: 15, conversionsValue: 2500 } },
      { campaign: { id: '333', name: 'DG | Prospecting', status: 'ENABLED', advertisingChannelType: 'DEMAND_GEN' }, metrics: { costMicros: String(600e6), clicks: '500', impressions: '70000', conversions: 0, conversionsValue: 0 } }] });
    throw new Error('unexpected GAQL ' + q);
  }
  if (u.includes('googleads.googleapis.com') && u.endsWith('campaignCriteria:mutate')) {
    seen.mutate.push(body);
    if (body.operations[0].create && body.operations[0].create.keyword.text === 'refuse me') return R({ error: { message: 'Request contains an invalid argument.', details: [{ errors: [{ message: 'The keyword is not allowed.', errorCode: { criterionError: 'KEYWORD_HAS_INVALID_CHARS' } }] }] } }, 400);
    return R(body.validateOnly ? {} : { results: [{ resourceName: body.operations[0].remove || 'customers/1234567890/campaignCriteria/111~777' }] });
  }
  if (u.includes('analyticsdata.googleapis.com')) {
    seen.ga4++;
    const dims = (body.dimensions || []).map(d => d.name).join(',');
    const two = (body.dateRanges || []).length > 1;
    if (dims === 'deviceCategory,eventName') return R({ rows: [
      /* phones: add to cart 3% (benchmark 5.4%, own 90 days 4%) = a leak; cart to checkout 44% (benchmark 45%) = fine */
      ...[['mobile', 'add_to_cart', 600, 4000], ['mobile', 'begin_checkout', 264, 1800], ['mobile', 'purchase', 180, 1200],
        /* desktop: 2,000 sessions, add to cart 9% (benchmark 9.9%, only 9% under) = not a leak; checkouts under the floor */
        ['desktop', 'add_to_cart', 180, 800], ['desktop', 'begin_checkout', 70, 300], ['desktop', 'purchase', 30, 120]]
        .flatMap(([d, e, c, b]) => [{ dimensionValues: [{ value: d }, { value: e }, { value: 'cur' }], metricValues: [{ value: String(c) }] }, { dimensionValues: [{ value: d }, { value: e }, { value: 'base' }], metricValues: [{ value: String(b) }] }]) ] });
    if (dims === 'deviceCategory' && two) return R({ rows: [
      { dimensionValues: [{ value: 'mobile' }, { value: 'cur' }], metricValues: [{ value: '20000' }, { value: '180' }, { value: '18000' }, { value: '9000' }] },
      { dimensionValues: [{ value: 'mobile' }, { value: 'base' }], metricValues: [{ value: '100000' }, { value: '1200' }, { value: '120000' }, { value: '50000' }] },
      { dimensionValues: [{ value: 'desktop' }, { value: 'cur' }], metricValues: [{ value: '2000' }, { value: '30' }, { value: '3000' }, { value: '900' }] },
      { dimensionValues: [{ value: 'desktop' }, { value: 'base' }], metricValues: [{ value: '8000' }, { value: '120' }, { value: '12000' }, { value: '4000' }] }] });
    if (dims === 'landingPage') return R({ rows: [
      { dimensionValues: [{ value: '/products/a' }], metricValues: [{ value: '6000' }, { value: '12' }, { value: '1200' }, { value: '1200' }] },
      { dimensionValues: [{ value: '/' }], metricValues: [{ value: '5000' }, { value: '60' }, { value: '6000' }, { value: '3000' }] },
      { dimensionValues: [{ value: '/products/tiny' }], metricValues: [{ value: '300' }, { value: '0' }, { value: '0' }, { value: '100' }] }] });
    if (!dims) return R({ rows: [{ metricValues: [{ value: '12000' }, { value: '96' }, { value: '9600' }] }] });
    throw new Error('unexpected GA4 ' + dims);
  }
  if (u === 'https://api.anthropic.com/v1/messages') {
    seen.model++;
    const sys = String(body.system), usr = body.messages[0].content;
    if (/reviewing an automatic leak list/.test(sys)) { seen.reviews = (seen.reviews || 0) + 1; seen.reviewSys = sys; seen.reviewUser = usr; return R({ content: [{ type: 'text', text: JSON.stringify(REVIEW) }] }); }
    if (/pushed back on something/.test(sys)) { seen.lessonUser = usr; return R({ content: [{ type: 'text', text: JSON.stringify({ ...LESSON, status: JUDGE_LESSON_STATUS }) }] }); }
    seen.system = sys; seen.user = usr;
    return R({ content: [{ type: 'text', text: JSON.stringify(JUDGE) }] });
  }
  throw new Error('unexpected fetch ' + u);
};

const L = await import('./src/leaks.js');
const G = await import('./src/google.js');
G.useFetch(globalThis.fetch);
const S = new Map();
const META_ROWS = [
  { kind: 'cut', act_id: 'brand_x', adset_id: 'as1', adset: 'Broad | Still', ad_id: null, ad: null, spend: 700, orders: 2, goal: 50, stake: 600, why: 'Cost per sale $350, 7.0x the $50 goal, on $700 spent.', from: '2026-10-06', to: '2026-10-12' },
  { kind: 'scale', act_id: 'brand_x', adset_id: 'as2', adset: 'Winners', stake: 200, why: 'scale' },
];
const FLOWS = [{ id: 'F1', name: 'Welcome series', trigger: 'Added to List', status: 'live', revenue: 900 }, { id: 'F2', name: 'Cart reminder', trigger: 'Metric', status: 'live', revenue: 1200 },
  { id: 'F3', name: 'Old browse', trigger: 'Metric', status: 'manual', revenue: 1500, updated: '2026-09-20' }];
const BYF = { F3: Array.from({ length: 120 }, (_, i) => (i < 60 ? 40 : 0)) };
const d = {
  getSetting: async (env, k) => S.get(k) ?? null, putSetting: async (env, k, v) => { S.set(k, v); }, xfetch: (...a) => globalThis.fetch(...a),
  mintSession: async () => ({ token: 't' }), profit: async p => { assert.match(p, /^\/api\/hub\/today\?act=brand_x$/); return { rows: META_ROWS }; },
  klaviyo: async (env, act, what) => what === 'flows_report' ? { flows: FLOWS } : { attr_from: '2026-06-15', by_flow: BYF, days: Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(12 - (i % 12)).padStart(2, '0')}`, gained: 10 })) },
  tiktok: async () => ({ error: 'not_connected' }),
};

const EM = String.fromCharCode(0x2014);
const checks = [];
async function check(name, fn) { try { await fn(); checks.push(true); console.log('PASS ', name); } catch (e) { checks.push(false); console.log('FAIL ', name, '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }

JUDGE = { terms: [{ i: 0, label: 'irrelevant', why: "another brand's driver" }, { i: 1, label: 'relevant', why: 'they sell wedges' }, { i: 2, label: 'brand', why: 'the brand' }],
  categories: [{ i: 0, label: 'irrelevant', why: 'another brand’s hats' }], flows: { missing: ['post_purchase', 'winback'], replaced: [] } };
let res;
await check('one read: every source, one judge call and one cross-check call, the leaks to act on ranked by money a month', async () => {
  res = await L.leaksFor(env, d, 'brand_x', { days: 30, fresh: true, ai: true });
  assert.equal(res.error, undefined, res.error);
  assert.equal(seen.model, 2, 'one search-term judge call, one cross-check call');
  const act = res.leaks.filter(l => l.verdict !== 'not_the_cause' && l.verdict !== 'measurement');
  const costs = act.map(l => l.cost).filter(v => v != null);
  assert.deepEqual(costs, costs.slice().sort((a, b) => b - a), 'sorted by cost');
  const unpriced = act.findIndex(l => l.cost == null);
  assert.ok(unpriced === -1 || act.slice(unpriced).every(l => l.cost == null), 'unpriced leaks come after the priced ones');
  assert.ok(!/free golf clubs/.test(seen.user), 'a term under the $1 floor is never sent to the model');
  assert.ok(/judge every search from this, never from a word list/.test(seen.system));
});
await check('search terms: only the ones judged irrelevant become negatives', async () => {
  const n = res.leaks.find(l => l.id === 'google_search:negatives');
  assert.ok(n, 'the negatives leak'); assert.deepEqual(n.items.map(x => x.term), ['wildcat drivers']);
  assert.equal(n.items[0].campaign_id, '111'); assert.equal(n.cost, 22); assert.equal(n.apply.kind, 'negative');
});
await check('PMax: categories with 10+ clicks and no sale, judged irrelevant, priced at the campaign CPC', async () => {
  const p = res.leaks.find(l => l.id === 'google_pmax:categories');
  assert.ok(p); assert.deepEqual(p.items.map(x => x.label), ['black clover hats']);
  assert.equal(p.items[0].est, 30, '40 clicks x $0.75 (3000 / 4000)');
  assert.ok(seen.gaql.some(q => /campaign_search_term_insight\.category_label/.test(q)));
});
await check('Google campaigns over the brand cut line (PMax at 4x, Demand Gen with no sale); Search at 1.3x is not', async () => {
  const pm = res.leaks.find(l => l.id === 'google_pmax:camp:222'), dg = res.leaks.find(l => l.id === 'google_video:camp:333');
  assert.ok(pm && dg); assert.equal(pm.cost, 2250, '3000 - 50 x 15'); assert.equal(dg.cost, 600);
  assert.match(dg.number, /5,000 views, 7\.0% view rate/);
  assert.ok(!res.leaks.some(l => l.id === 'google_search:camp:111'));
});
await check('Meta: Cut rows from Today’s calls x 30/7, never Scale rows, never recomputed', async () => {
  const m = res.leaks.filter(l => l.area === 'meta');
  assert.equal(m.length, 1); assert.equal(m[0].cost, Math.round(600 * 30 / 7)); assert.match(m[0].number, /7\.0x the \$50 goal/);
});
await check('funnel: a step under the benchmark by 20%+ AND under its own 90 days is a leak; 9% under is not; under the floor says so', async () => {
  const f = res.leaks.filter(l => l.area === 'funnel');
  assert.deepEqual(f.map(l => l.id), ['funnel:mobile:atc']);
  assert.match(f[0].benchmark, /Littledata, Oct 2026/); assert.match(f[0].number, /own 90 days before: 4\.0%/);
  /* 20000 x (5.4% - 3%) = 480 carts x 180/600 = 144 orders x $100 */
  assert.equal(f[0].cost, 14400);
  assert.match(res.areas.funnel.note, /Not enough data yet/); assert.match(res.areas.funnel.note, /checkouts, under the 300 floor/);
});
await check('landing pages: 500+ paid sessions under 70% of the paid site rate, priced; small pages skipped', async () => {
  const lp = res.leaks.filter(l => l.area === 'landing_page');
  assert.deepEqual(lp.map(l => l.page), ['/products/a']);
  /* site 0.8%, page 0.2%: 6000 x 0.6% = 36 orders x $100 */
  assert.equal(lp[0].cost, 3600);
});
await check('email: missing core flows priced from orders or sign-ups; an earning flow switched off is a leak', async () => {
  const pp = res.leaks.find(l => l.id === 'email:missing:post_purchase'), wb = res.leaks.find(l => l.id === 'email:missing:winback'), off = res.leaks.find(l => l.id === 'email:off:F3');
  assert.equal(pp.cost, Math.round(300 * 1.80)); assert.match(pp.benchmark, /Klaviyo 2026/);
  assert.equal(wb.cost, null, 'win-back cannot be priced'); assert.equal(off && off.cost, 500, 'a third of its 90-day revenue: it stopped earning before the 30 days ahead of going off');
});
await check('the cross-check reads the other channels before calling a leak', async () => {
  const u = JSON.parse(seen.reviewUser.slice(seen.reviewUser.indexOf('LEAKS (ranked by money):') + 24));
  const meta = u.find(l => l.area === 'meta'), pm = u.find(l => l.id === 'google_pmax:camp:222');
  assert.equal(meta.context.set_ctr_pct, 2.5, 'the cut ad set clicks 2.5%'); assert.equal(meta.context.brand_median_set_ctr_pct, 2.5);
  assert.equal(meta.context.first_click_revenue, 1400); assert.equal(meta.context.last_click_revenue, 700, 'an opener: first click twice the last click');
  assert.equal(meta.context.lands_on[0].page, '/products/a', 'where the ads send people, from the cached creative'); assert.equal(meta.context.lands_on[0].buy_pct, 0.2);
  assert.equal(pm.context.lands_on[0].page, '/products/a', 'PMax final URLs');
  const brand = JSON.parse(seen.reviewUser.slice(seen.reviewUser.indexOf('BRAND-WIDE CONTEXT:') + 19, seen.reviewUser.indexOf('THE TEAM')));
  assert.equal(brand.tracking.ga4_purchases, 210); assert.equal(brand.tracking.shopify_orders, 300); assert.equal(brand.google_measurement.google_reported_value, 3400); assert.equal(brand.google_measurement.triple_whale_google_revenue, 1500);
  assert.ok(/never blame a platform from its own number alone/.test(seen.reviewSys));
});
await check('the verdicts land on the leaks; not the cause ranks after what to act on', async () => {
  const pm = res.leaks.find(l => l.id === 'google_pmax:camp:222'), lp = res.leaks.find(l => l.id === 'landing_page:/products/a');
  assert.equal(pm.verdict, 'not_the_cause'); assert.equal(pm.root, 'page a'); assert.match(pm.why_ctx, /0\.2%/); assert.equal(lp.verdict, 'real');
  assert.ok(res.leaks.indexOf(pm) > res.leaks.findIndex(l => l.verdict !== 'not_the_cause' && l.verdict !== 'measurement' && l.cost != null && l.cost < pm.cost), 'folded under the leaks to act on');
  assert.equal(res.reviewed, true); assert.match(res.summary, /Page a/);
});
await check('a teammate pushes back: saved, judged against the leak and its context, and every later read follows it', async () => {
  const r = await L.lessonFromLeak(env, d, 'brand_x', { leak_id: 'google_search:negatives', text: 'Our Google lead says never block competitor names in the brand campaign.', author: 'Ahsan', role: 'Google buyer' }, 'cole@go-mobius-digital.com');
  assert.equal(r.status, 'holds'); assert.match(r.rule, /Never block competitor/);
  assert.match(seen.lessonUser, /wildcat drivers|nothing to do with/, 'the judge saw the leak it was about');
  assert.equal(S.has('leaks:brand_x:30'), true, 'settings mock keeps its own cache');
  const row = db.prepare(`SELECT * FROM p_leak_lesson WHERE id = ?`).get(r.id);
  assert.equal(row.act_id, 'brand_x'); assert.equal(row.status, 'holds'); assert.equal(row.area, 'google_search');
  const again = await L.leaksFor(env, d, 'brand_x', { days: 30, fresh: true, ai: true });
  assert.match(seen.system, /THE TEAM'S LESSONS[\s\S]*HOLDS, follow it[\s\S]*Never block competitor/, 'the search-term judge reads it');
  assert.match(seen.reviewUser, /Never block competitor/, 'the cross-check reads it');
  assert.equal(again.lessons.length, 1); assert.equal(again.lessons[0].author, 'Ahsan');
});
await check('a client\u2019s pushback is its own brand\u2019s only; Remove deletes a lesson', async () => {
  const r = await L.lessonFromLeak(env, d, 'brand_x', { text: 'Do not count our wholesale page as a leak.', scope: 'all', area: 'landing_page' }, 'nick@x.com', true);
  assert.equal(db.prepare(`SELECT act_id FROM p_leak_lesson WHERE id = ?`).get(r.id).act_id, 'brand_x');
  const t = await L.lessonFromLeak(env, d, 'brand_x', { text: 'Every brand: give a new page two weeks.', scope: 'all' }, 'cole@go-mobius-digital.com', false);
  assert.equal(db.prepare(`SELECT act_id FROM p_leak_lesson WHERE id = ?`).get(t.id).act_id, '', 'the team can teach every brand');
  const C = await import('./src/leakctx.js');
  assert.match(String((await C.deleteLesson(env, t.id, 'brand_y')).error || ''), /^$/, 'an every-brand lesson has no owner brand to clash with');
  assert.equal((await C.deleteLesson(env, r.id, 'brand_y')).error, 'That lesson belongs to another brand.');
  assert.equal((await C.deleteLesson(env, r.id, 'brand_x')).ok, true);
});
await check('the AI check is on demand: a plain read reuses the last check’s labels and verdicts with NO model call', async () => {
  const m0 = seen.model;
  TERMS.push({ term: 'brand new search', spend: 5, clicks: 2 });
  db.exec(`DELETE FROM settings WHERE key LIKE 'gadlk2:%'`);   // Google's own hourly cache, so the new term is read
  const plain = await L.leaksFor(env, d, 'brand_x', { days: 30, fresh: true });
  assert.equal(seen.model, m0, 'no AI on a plain read');
  assert.deepEqual(plain.leaks.find(l => l.id === 'google_search:negatives').items.map(x => x.term), ['wildcat drivers'], 'last check’s labels reused');
  assert.equal(plain.leaks.find(l => l.id === 'google_pmax:camp:222').verdict, 'not_the_cause', 'last check’s verdict reused');
  assert.match(plain.areas.google.note, /1 search term with spend came in since the last AI check/);
  assert.ok(plain.ai_check && plain.ai_check.at, 'says when the last check ran'); assert.equal(plain.ai, null);
  TERMS.pop();
  const ran = res.ai_check; assert.ok(ran.usd >= 0 && ran.ok, 'the button’s run says what it cost');
});
await check('a brand never checked shows the plain list, says it is not cross-checked, and costs nothing', async () => {
  S.delete('leaksAI:brand_x:30'); const m0 = seen.model;
  const r = await L.leaksFor(env, d, 'brand_x', { days: 30, fresh: true });
  assert.equal(seen.model, m0); assert.equal(r.reviewed, false); assert.equal(r.review_error, 'not checked yet');
  assert.ok(!r.leaks.some(l => l.id === 'google_search:negatives'), 'no negatives until a check has judged the terms');
  assert.match(r.areas.google.note, /judged by the AI check/);
  await L.leaksFor(env, d, 'brand_x', { days: 30, fresh: true, ai: true });
});
await check('suggestions, never orders: the review is told the team makes the calls; fix lines suggest', async () => {
  assert.match(seen.reviewSys, /SUGGESTIONS to a team that makes the calls, never orders or bans/);
  const m = res.leaks.find(l => l.area === 'meta');
  assert.match(m.fix, /^One option is/); assert.match(m.fix, /the call is yours/);
});
await check('the final call: Locus judges a pushback once; when it disagrees a person decides, and the lists follow that call', async () => {
  JUDGE_LESSON_STATUS = 'does_not_hold';
  const r = await L.lessonFromLeak(env, d, 'brand_x', { leak_id: 'landing_page:/products/a', text: 'That page is brand new, give it two weeks before calling it a leak.', author: 'William', role: 'Web dev' }, 'cole@go-mobius-digital.com');
  assert.equal(r.status, 'does_not_hold'); assert.equal(r.decision, null, 'no decision until a person makes it');
  const C = await import('./src/leakctx.js');
  assert.equal((await C.decideLesson(env, 'brand_y', r.id, 'team', 'x')).error, 'That lesson belongs to another brand.');
  assert.equal((await C.decideLesson(env, 'brand_x', r.id, 'team', 'cole@go-mobius-digital.com')).ok, true);
  const row = db.prepare(`SELECT decision, decided_by FROM p_leak_lesson WHERE id = ?`).get(r.id);
  assert.equal(row.decision, 'team'); assert.equal(row.decided_by, 'cole@go-mobius-digital.com');
  await L.leaksFor(env, d, 'brand_x', { days: 30, fresh: true, ai: true });
  assert.match(seen.reviewUser, /THE TEAM'S FINAL CALL: follow it, even where the data disagreed[^\n]*William/);
  const t = await L.lessonFromLeak(env, d, 'brand_x', { text: 'Never judge a creator ad set before 10 days.', final: true }, 'cole@go-mobius-digital.com');
  assert.equal(t.decision, 'team', '"go with ours" said up front is recorded at once');
  JUDGE_LESSON_STATUS = 'holds';
});
await check('the answer is cached; the next read makes no call', async () => {
  const before = seen.model + seen.gaql.length + seen.ga4;
  const again = await L.leaksFor(env, d, 'brand_x', { days: 30 });
  assert.equal(again.cached, true); assert.equal(seen.model + seen.gaql.length + seen.ga4, before);
});
await check('a replaced flow that earns about as much is not a leak', async () => {
  JUDGE = { ...JUDGE, flows: { missing: [], replaced: [{ off: 'F3', by: 'F1' }] } };
  BYF.F1 = Array.from({ length: 120 }, (_, i) => (i >= 97 ? 40 : 0));
  const r = await L.leaksFor(env, d, 'brand_x', { days: 30, fresh: true, ai: true });
  assert.ok(!r.leaks.some(l => l.id === 'email:off:F3'));
});
await check('Apply: propose = validateOnly (nothing written), then the write, a Change Log row, the term leaves the list', async () => {
  await L.leaksFor(env, d, 'brand_x', { days: 30, fresh: true, ai: true });
  seen.mutate.length = 0;
  const pv = await L.applyNegative(env, d, 'brand_x', { term: 'wildcat drivers', campaign_id: '111' }, 'cole@go-mobius-digital.com');
  assert.equal(pv.propose, true); assert.equal(seen.mutate.length, 1); assert.equal(seen.mutate[0].validateOnly, true);
  assert.deepEqual(seen.mutate[0].operations[0].create, { campaign: 'customers/1234567890/campaigns/111', negative: true, keyword: { text: 'wildcat drivers', matchType: 'EXACT' } });
  const r = await L.applyNegative(env, d, 'brand_x', { term: 'wildcat drivers', campaign_id: '111', confirm: true }, 'cole@go-mobius-digital.com');
  assert.equal(r.ok, true); assert.equal(seen.mutate[1].validateOnly, undefined); assert.equal(r.undo, 'customers/1234567890/campaignCriteria/111~777');
  const log = db.prepare(`SELECT * FROM activities WHERE event_type = 'google_write'`).all();
  assert.equal(log.length, 1); assert.equal(log[0].act_id, 'act_77', 'filed under the brand’s Meta account like every manual row'); assert.match(log[0].actor, /cole@go-mobius-digital\.com in Locus/);
  const after = JSON.parse(S.get('leaks:brand_x:30'));
  assert.ok(!after.leaks.some(l => l.id === 'google_search:negatives'), 'the only term is gone, so the leak is gone');
  const again = await L.applyNegative(env, d, 'brand_x', { term: 'wildcat drivers', confirm: true }, 'x');
  assert.match(again.error, /not on the leak list/);
});
await check('Undo removes the criterion by its resource name, and only inside this brand’s account', async () => {
  const bad = await L.undoNegative(env, d, 'brand_x', 'customers/999/campaignCriteria/1~2', 'x');
  assert.match(bad.error, /not in this brand/);
  const r = await L.undoNegative(env, d, 'brand_x', 'customers/1234567890/campaignCriteria/111~777', 'x');
  assert.equal(r.ok, true); assert.deepEqual(seen.mutate.at(-1).operations[0], { remove: 'customers/1234567890/campaignCriteria/111~777' });
});
await check('a Google refusal comes back in Google’s words, never thrown', async () => {
  const r = await G.adsNegative(env, 'brand_x', { campaign_id: '111', text: 'refuse me', validate: true });
  assert.match(r.error, /Google Ads refused it: The keyword is not allowed/);
});
await check('a brand with no links and no Klaviyo says what is missing, with no model call', async () => {
  const m0 = seen.model;
  const r = await L.leaksFor(env, { ...d, klaviyo: async () => ({ error: 'Klaviyo is not connected' }), profit: null }, 'brand_y', { fresh: true, ai: true });
  assert.equal(r.leaks.length, 0); assert.equal(r.areas.google.state, 'not_linked'); assert.equal(r.areas.funnel.state, 'not_linked'); assert.equal(r.areas.email.state, 'not_linked');
  assert.equal(seen.model, m0, 'nothing to judge, so no model call');
});
await check('the client scope: the leak routes are on CLIENT_RULES in BOTH brandguard copies', async () => {
  const a = await import('./src/brandguard.js'), b = await import('../../profit/worker/src/brandguard.js');
  for (const x of [a, b]) for (const [m, p] of [['GET', '/api/leaks'], ['POST', '/api/leaks/apply'], ['POST', '/api/leaks/undo']]) assert.ok(x.CLIENT_RULES.some(r => r.m === m && r.p === p), `${m} ${p}`);
  assert.equal(fs.readFileSync(path.join(here, 'src', 'brandguard.js'), 'utf8'), fs.readFileSync(path.join(root, 'profit', 'worker', 'src', 'brandguard.js'), 'utf8'));
});
await check('no em dashes in the engine, the screens or the judge prompt', async () => {
  for (const f of [path.join(here, 'src', 'leaks.js'), path.join(here, 'src', 'leakctx.js'), path.join(root, 'profit', 'leaks.js')]) assert.ok(!fs.readFileSync(f, 'utf8').includes(EM), f);
  assert.ok(!L.judgeSystem('X', '').includes(EM));
  const C = await import('./src/leakctx.js'); assert.ok(!C.reviewSystem('X').includes(EM));
});

const ok = checks.filter(Boolean).length;
console.log(`\n${ok}/${checks.length} passed`);
process.exit(ok === checks.length ? 0 : 1);
