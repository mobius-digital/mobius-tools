/* Locus v2 data layer (2026-10-07). Every v2 screen reads one route from here.
 *
 * THE FOUR RULES (docs/locus-hub/spec-v2.md):
 *  - Platform data is the core: spend, impressions, clicks, video and add to cart come from the
 *    platform's own rows (Meta `ad_daily`; Google / TikTok through Triple Whale's platform rows
 *    until they are connected directly). Store money comes from Shopify through Triple Whale.
 *  - Triple Whale is for ATTRIBUTION only, and the model is a switch: `model` =
 *    lastPlatformClick (default) | fullFirstClick | fullLastClick | linear | linearAll | platform.
 *    Every credited number also returns the platform's own figure so the gap can be shown.
 *  - Every number comes with its compare window (`cmp` = prev | yoy | none).
 *  - All brands sums only within one currency; the screens say so when mixed.
 *
 * Routes (authed, mounted by worker.js):
 *   GET /api/hub/paid?platform=meta|google|tiktok|all&act=&model=&cmp=&days|from&to
 *   GET /api/hub/creative?act=&model=&days|from&to
 *   GET /api/hub/store?act=&cmp=&days|from&to
 *   GET /api/hub/email?act=&cmp=&days|from&to
 *   GET /api/hub/orders?act=&model=&ad=|adset=|campaign=|platform=&days|from&to
 *   GET /api/hub/customer?act=&customer=
 *   GET /api/hub/live?act=           today so far, live from Triple Whale (the top-bar chip; also /api/hub/today?live=1)
 *   GET /api/hub/today?act=          the media buyer's list: ad set calls over the last 7 days of attribution
 *   GET /api/hub/yesterday?act=      a verdict per brand per day for 14 days, and the detail behind the last one
 *   GET /api/hub/moved?act=          what moved yesterday against the same weekday over 8 weeks
 *   GET /api/hub/find?q=&act=        any Meta campaign or ad by name (the ask bar's jump list)
 *   GET /api/hub/stockads?act=        products and ad sets tied to ad spend through Triple Whale orders (30 days)
 *   GET /api/hub/drill?act=&model=&cmp=&days|from&to   the data behind every headline tile (drillMany, end of file)
 *   GET /api/hub/command?act=all      the agency command center: why each brand needs attention (team only)
 */
import { metaOf } from './brandids.js';
import { rulesFor } from './brand.js';

/* Brand-first phase 3 (2026-10-08): `act` / `a.act_id` here is the BRAND id. Meta's own tables
   (ad_daily, ads, meta_campaigns, meta_adsets, activities) stay on the Meta ad account id, so they
   are read with `act_id IN ${metaOf(n)}` (every Meta account the brand has), or joined through
   `connections` when grouped across brands. Triple Whale tables (tw_*) and p_* are the brand's. */
const MODELS = new Set(['lastPlatformClick', 'fullFirstClick', 'fullLastClick', 'linear', 'linearAll', 'platform']);
const MODEL_LABEL = { lastPlatformClick: 'Triple Whale, last platform click', fullFirstClick: 'Triple Whale, first click', fullLastClick: 'Triple Whale, last click', linear: 'Triple Whale, linear (paid)', linearAll: 'Triple Whale, linear (all)', platform: 'Platform reported' };
const TOUCH_FALLBACK = { linear: 'linearAll', platform: 'lastPlatformClick' };
const num = v => (v == null || !isFinite(+v) ? 0 : +v);
const div = (a, b) => (b ? a / b : null);

export async function handleHub(ctx) {
  const { path, url, env, json } = ctx;
  if (!path.startsWith('/api/hub/')) return null;
  const model = MODELS.has(url.searchParams.get('model')) ? url.searchParams.get('model') : 'lastPlatformClick';
  const cmp = ['prev', 'yoy', 'none'].includes(url.searchParams.get('cmp')) ? url.searchParams.get('cmp') : 'prev';
  const act = url.searchParams.get('act') || 'all';
  const all = await ctx.accountsFor();
  const accts = act === 'all' ? all : all.filter(a => a.act_id === act);
  if (!accts.length) return json({ error: 'unknown account' }, 404);
  const win = a => {
    const { from, to } = ctx.windowFor(a);
    const span = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
    let pf = null, pt = null;
    if (cmp === 'prev') { pt = ctx.addDays(from, -1); pf = ctx.addDays(pt, -(span - 1)); }
    else if (cmp === 'yoy') { pf = `${+from.slice(0, 4) - 1}${from.slice(4)}`; pt = `${+to.slice(0, 4) - 1}${to.slice(4)}`; }
    /* `today` (2026-10-09): the Today preset is the one window that holds the brand's own today. Meta's ad rows and
       Triple Whale's attribution land overnight, so the readers below take Meta's account totals for today from
       `daily_insights` (synced through the day) and mark the credited numbers `attr_pending` instead of a false 0. */
    return { from, to, pf, pt, span, today: ctx.localDate(a.tz) };
  };
  const base = { model, model_label: MODEL_LABEL[model], cmp };
  try {
    /* ONE window for every brand on an all-brands screen (they are all US shops; the worker's
       per-brand clamp differs only around midnight), and every reader below takes the whole
       list and asks D1 ONCE, grouped by act_id: a per-brand loop is 10+ queries a brand and
       the worker's subrequest budget is per page load. */
    const w0 = accts.map(win).sort((x, y) => (x.to < y.to ? -1 : 1))[0];
    if (path === '/api/hub/paid') {
      const platform = ['meta', 'google', 'tiktok', 'all'].includes(url.searchParams.get('platform')) ? url.searchParams.get('platform') : 'meta';
      let out;
      if (platform === 'meta') out = accts.length === 1 ? [await metaBrand(env, accts[0], w0, model, true)] : await metaMany(env, accts, w0, model, ctx);
      else if (platform === 'all') out = await allChannelsMany(env, ctx, accts, w0, model);
      else out = await twPlatformMany(env, ctx, accts, w0, model, platform);
      return json({ ...base, platform, window: w0, brands: out });
    }
    if (path === '/api/hub/creative') {
      const a = accts[0]; const w = win(a);
      return json({ ...base, window: w, ...(await creativeBrand(env, a, w, model)) });
    }
    if (path === '/api/hub/store') return json({ ...base, window: w0, brands: await storeMany(env, ctx, accts, w0) });
    if (path === '/api/hub/email') return json({ ...base, window: w0, brands: await emailMany(env, ctx, accts, w0) });
    if (path === '/api/hub/drill') return json({ ...base, window: w0, brands: await drillMany(env, ctx, accts, w0, model) });
    if (path === '/api/hub/orders') return json({ ...base, ...(await ordersFor(env, accts[0], win(accts[0]), model, url)) });
    if (path === '/api/hub/customer') return json(await customerFor(env, accts[0], url.searchParams.get('customer') || ''));
    if (path === '/api/hub/find') {
      const q = String(url.searchParams.get('q') || '').trim().replace(/[%_]/g, '');
      if (q.length < 3) return json({ items: [] });
      const ids = accts.map(a => a.act_id), nm = Object.fromEntries(accts.map(a => [a.act_id, a.name]));
      const IN = ids.map((_, i) => `?${i + 2}`).join(',');
      const { results: ads } = await env.DB.prepare(`SELECT x.ad_id, x.name, c.brand_id act_id FROM ads x JOIN connections c ON c.kind = 'meta' AND c.external_id = x.act_id WHERE c.brand_id IN (${IN}) AND x.name LIKE ?1 ORDER BY COALESCE(x.first_spend_date, x.created_time) DESC LIMIT 8`).bind(`%${q}%`, ...ids).all().catch(() => ({ results: [] }));
      const { results: cs } = await env.DB.prepare(`SELECT m.campaign_id, m.name, c.brand_id act_id FROM meta_campaigns m JOIN connections c ON c.kind = 'meta' AND c.external_id = m.act_id WHERE c.brand_id IN (${IN}) AND m.name LIKE ?1 ORDER BY m.created_time DESC LIMIT 5`).bind(`%${q}%`, ...ids).all().catch(() => ({ results: [] }));
      return json({ items: [...(cs || []).map(c => ({ kind: 'camp', id: c.campaign_id, label: c.name, act: c.act_id, brand: nm[c.act_id] })), ...(ads || []).map(a => ({ kind: 'ad', id: a.ad_id, label: a.name, act: a.act_id, brand: nm[a.act_id] }))] });
    }
    if (path === '/api/hub/moved') return json({ ...base, items: await movedMany(env, ctx, accts) });
    if (path === '/api/hub/command') return json(await commandMany(env, ctx, accts));
    if (path === '/api/hub/stockads') return json({ brands: await Promise.all(accts.map(a => stockAds(env, ctx, a))) });
    if (path === '/api/hub/yesterday') return json(await yesterdayMany(env, ctx, accts.filter(a => !SKIP_HUB.test(a.name || '')), act === 'all'));
    if (path === '/api/hub/today' && url.searchParams.get('live') !== '1') return json(await buyerList(env, ctx, accts.filter(a => !SKIP_HUB.test(a.name || ''))));
    /* Live "today so far" (the top-bar chip). It was /api/hub/today until 2026-10-09, when that path
       became the media buyer's list; /api/hub/today?live=1 still answers the old shape. */
    if (path === '/api/hub/live' || path === '/api/hub/today') {
      const rows = await Promise.all(accts.map(async a => {
        const t = ctx.localDate(a.tz);
        const d = await ctx.twDay(a, t).catch(() => null);
        if (!d) return { act_id: a.act_id, name: a.name, currency: a.currency };
        const row = ctx.liveRow(a, d) || {};
        return { act_id: a.act_id, name: a.name, currency: a.currency, sales: row.sales ?? null, spend: row.spend ?? null, orders: row.orders ?? null, as_of: d.as_of || null };
      }));
      return json({ brands: rows });
    }
  } catch (e) { return json({ error: e.message }, 500); }
  return null;
}

/* ---------- what moved (2026-10-08, Triple Whale Lighthouse's job, done simply) ----------
   Yesterday per brand against the SAME WEEKDAY over the last 8 weeks (a Tuesday is compared with
   Tuesdays). A move is shown when it is 25%+ off normal AND at least 1.5 standard deviations, so a
   noisy brand is not flagged every day. Revenue moves name the cause (orders or the average order),
   MER moves name revenue or spend. Store numbers only: Shopify through Triple Whale.
   COPIED in account-health/worker/src/moved.js (`movesFor`), which posts the same finding to each
   brand's internal Slack channel at 8am Central: change the thresholds in both places together. */
async function movedMany(env, ctx, accts) {
  const d = ctx.addDays(ctx.localDate(accts[0].tz), -1);
  const from = ctx.addDays(d, -56);
  const ids = ['totalSales', 'totalNetTaxes', 'blendedAds', 'totalOrders', 'newCustomersOrders'];
  const piv = await twPivotMany(env, accts.map(a => a.act_id), from, d, ids);
  const out = [];
  const pctTxt = v => `${Math.abs(Math.round(v * 100))}% ${v >= 0 ? 'up' : 'down'}`;
  for (const a of accts) {
    const P = piv[a.act_id] || {};
    const day = dt => { const g = k => num(P[k] && P[k][dt]); const rev = g('totalSales') - g('totalNetTaxes'), sp = g('blendedAds'), o = g('totalOrders'), n = g('newCustomersOrders');
      return { has: !!(P.totalSales && P.totalSales[dt] != null), rev, sp, o, mer: sp ? rev / sp : null, aov: o ? rev / o : null, cac: n ? sp / n : null }; };
    const x = day(d); if (!x.has) continue;
    const base = Array.from({ length: 28 }, (_, i) => day(ctx.addDays(d, -1 - i))).filter(r => r.has);
    if (base.length < 20) continue;
    const mean = k => { const v = base.map(r => r[k]).filter(v => v != null && isFinite(v)); return v.length >= 4 ? v.reduce((s, y) => s + y, 0) / v.length : null; };
    const sd = k => { const m = mean(k); const v = base.map(r => r[k]).filter(v => v != null && isFinite(v)); return m == null ? null : Math.sqrt(v.reduce((s, y) => s + (y - m) ** 2, 0) / v.length); };
    const flags = [];
    for (const [k, label, lower] of [['rev', 'Revenue', false], ['mer', 'MER', false], ['sp', 'Ad spend', 'n'], ['cac', 'Cost per new customer', true], ['aov', 'Average order', false], ['o', 'Orders', false]]) {
      const m = mean(k), s = sd(k), v = x[k];
      if (m == null || v == null || !m) continue;
      if ((k === 'rev' || k === 'sp') && m < 150) continue;
      const ch = v / m - 1, z = s ? (v - m) / s : 0;
      if (Math.abs(ch) < 0.25 || Math.abs(z) < 1.5) continue;
      let why = '';
      if (k === 'rev') { const oc = mean('o') ? x.o / mean('o') - 1 : 0, ac = mean('aov') && x.aov ? x.aov / mean('aov') - 1 : 0; why = Math.abs(oc) >= Math.abs(ac) ? `orders ${pctTxt(oc)}` : `average order ${pctTxt(ac)}`; }
      if (k === 'mer') { const rc = mean('rev') ? x.rev / mean('rev') - 1 : 0, sc = mean('sp') ? x.sp / mean('sp') - 1 : 0; why = Math.abs(rc) >= Math.abs(sc) ? `revenue ${pctTxt(rc)}` : `spend ${pctTxt(sc)}`; }
      if (k === 'cac') { const sc = mean('sp') ? x.sp / mean('sp') - 1 : 0; why = `spend ${pctTxt(sc)}`; }
      flags.push({ act_id: a.act_id, name: a.name, currency: a.currency, date: d, metric: k, label, value: v, normal: m, change: ch, z, good: lower === 'n' ? null : ((ch > 0) !== !!lower), why });
    }
    /* Orders and AOV only when revenue itself did not move: otherwise they are the cause, already named. */
    const revHit = flags.some(f => f.metric === 'rev');
    for (const f of flags.filter(f => !(revHit && (f.metric === 'o' || f.metric === 'aov'))).slice(0, 3)) out.push(f);
  }
  return out.sort((p, q) => (Math.abs(q.z) * (q.good === false ? 1.4 : 1)) - (Math.abs(p.z) * (p.good === false ? 1.4 : 1))).slice(0, 24);
}

/* ---------- Yesterday: a verdict per brand per day (2026-10-09) ----------
   Each of the last 14 days (ending yesterday) judged against the SAME WEEKDAY over the 8 weeks before
   it (4+ of them with data), with the What moved test: flagged when 25%+ off normal AND 1.5+ standard
   deviations. Revenue and email tests are skipped when their normal is under 150; spend-based ratios
   (MER, cost per new customer, Meta / Google cost per sale) when the normal SPEND behind them is.
   Store money is Shopify through Triple Whale (tw_daily); Meta spend and delivery are Meta's own
   (daily_insights over every Meta account of the brand); orders per platform are Triple Whale
   lastPlatformClick (tw_ad_attr). Triple Whale attribution lands a day or two late: a day after the
   brand's latest tw_ad_attr row is `attr_pending` and its cost-per-sale tests are skipped (a day inside
   the synced range with no rows really had no attributed sale). A day with spend and no sale counts
   its cost per sale as the whole spend (a floor on the true figure), so it can still be flagged.
   Same paused / test brands as account-health moved.js are left out. */
const SKIP_HUB = /galway|instyler|gum of gods|judy ?p|le ?pickle|popby|golf sock/i;
const CHANGE_CATS = ['budget', 'new_campaign', 'campaign_paused', 'campaign_relaunched', 'bid_strategy', 'targeting', 'new_creative', 'new_adset', 'manual'];
const YD_TESTS = [   // [metric, label, lower is better, the key whose normal must be 150+]
  ['rev', 'Revenue', false, 'rev'], ['mer', 'MER', false, 'sp'], ['cac', 'Cost per new customer', true, 'sp'],
  ['mcpa', 'Meta cost per sale', true, 'msp'], ['gcpa', 'Google cost per sale', true, 'gsp'], ['email', 'Email revenue', false, 'email']];
const YD_LINKS = [['cpm', 'Meta CPM', 'up'], ['ctr', 'Meta link CTR', 'down'], ['cvr', 'Meta clicks that buy', 'down'], ['aov', 'Average order', 'down'], ['sp', 'Ad spend', null]];
const YD_IDS = ['totalSales', 'totalNetTaxes', 'blendedAds', 'totalOrders', 'newCustomersOrders', 'fb_ads_spend', 'klaviyoPlacedOrderSales', 'totalKlaviyoPlacedOrderTotalPriceCampaigns'];
const statOf = (rows, k) => {
  const v = rows.map(r => r[k]).filter(x => x != null && isFinite(x));
  if (v.length < 4) return null;
  const m = v.reduce((s, y) => s + y, 0) / v.length;
  return { m, s: Math.sqrt(v.reduce((s, y) => s + (y - m) ** 2, 0) / v.length) };
};
async function yesterdayMany(env, ctx, accts, all) {
  const as_of = new Date().toISOString();
  if (!accts.length) return { as_of, days: [], brands: [], market: null };
  const last = ctx.addDays(ctx.localDate(accts[0].tz), -1);
  const first = ctx.addDays(last, -13), lo = ctx.addDays(first, -56);
  const acts = accts.map(a => a.act_id);
  const IN = inList(acts.length, 3);
  const [piv, metaQ, attrQ, chQ] = await Promise.all([
    twPivotMany(env, acts, lo, last, YD_IDS),
    env.DB.prepare(`SELECT c.brand_id act_id, d.date, SUM(d.spend) spend, SUM(d.impressions) impr, SUM(d.link_clicks) clicks FROM daily_insights d
      JOIN connections c ON c.kind = 'meta' AND c.external_id = d.act_id WHERE c.brand_id IN (${IN}) AND d.date BETWEEN ?1 AND ?2 GROUP BY c.brand_id, d.date`).bind(lo, last, ...acts).all(),
    env.DB.prepare(`SELECT act_id, date, CASE WHEN platform = 'meta' OR platform IS NULL THEN 'meta' WHEN platform = 'google' THEN 'google' ELSE 'other' END p, SUM(orders) ord, SUM(revenue) rev
      FROM tw_ad_attr WHERE act_id IN (${IN}) AND model = 'lastPlatformClick' AND date BETWEEN ?1 AND ?2 GROUP BY act_id, date, p`).bind(lo, last, ...acts).all(),
    env.DB.prepare(`SELECT c.brand_id act_id, a.event_time, a.category, a.summary, a.reason FROM activities a JOIN connections c ON c.kind = 'meta' AND c.external_id = a.act_id
      WHERE c.brand_id IN (${IN}) AND substr(a.event_time, 1, 10) BETWEEN ?1 AND ?2 AND a.category IN (${CHANGE_CATS.map(c => `'${c}'`).join(',')}) AND NOT (a.category = 'targeting' AND (a.summary LIKE 'Custom audience%' OR a.summary LIKE '%Triple Whale Generated Audience%')) ORDER BY a.event_time DESC`).bind(ctx.addDays(last, -2), last, ...acts).all().catch(() => ({ results: [] })),
  ]);
  const MD = {}, AT = {}, MAXA = {}, CH = {};
  for (const r of metaQ.results || []) (MD[r.act_id] ??= {})[r.date] = { spend: num(r.spend), impr: num(r.impr), clicks: num(r.clicks) };
  for (const r of attrQ.results || []) { ((AT[r.act_id] ??= {})[r.date] ??= {})[r.p] = { ord: num(r.ord), rev: num(r.rev) }; if (!MAXA[r.act_id] || r.date > MAXA[r.act_id]) MAXA[r.act_id] = r.date; }
  /* Meta logs one action as several rows (an audience made twice in the same second): fold same summary, same minute. */
  const seen = new Set();
  for (const r of chQ.results || []) { const k = `${r.act_id}|${String(r.event_time).slice(0, 16)}|${r.summary}`; if (seen.has(k)) continue; seen.add(k); (CH[r.act_id] ??= []).push(r); }
  const days = dates(first, last, ctx.addDays);
  const out = [], mk = [];
  for (const a of accts) {
    const P = piv[a.act_id] || {}, M = MD[a.act_id] || {}, A = AT[a.act_id] || {}, maxA = MAXA[a.act_id] || null;
    if (all && !Object.keys(P).length && !Object.keys(M).length) continue;   // no Triple Whale and no Meta: nothing to judge
    const day = dt => {
      const g = k => num(P[k] && P[k][dt]);
      const rev = g('totalSales') - g('totalNetTaxes'), sp = g('blendedAds'), o = g('totalOrders'), n = g('newCustomersOrders');
      const m = M[dt] || { spend: 0, impr: 0, clicks: 0 }, at = A[dt];
      const pending = !at && !(maxA && dt <= maxA);
      const mo = pending ? null : num(at?.meta?.ord), go = pending ? null : num(at?.google?.ord);
      const gsp = Math.max(0, sp - g('fb_ads_spend'));
      const cpa = (s, ord) => (ord == null ? null : ord > 0 ? s / ord : s > 0 ? s : null);
      return { has: !!(P.totalSales && P.totalSales[dt] != null), pending, rev, sp, orders: o, new_orders: n, mer: sp ? rev / sp : null, cac: n ? sp / n : null, aov: o ? rev / o : null,
        msp: m.spend, impr: m.impr, clicks: m.clicks, meta_orders: mo, meta_rev: pending ? null : num(at?.meta?.rev), mcpa: cpa(m.spend, mo),
        gsp, google_orders: go, gcpa: cpa(gsp, go), email: P.klaviyoPlacedOrderSales && P.klaviyoPlacedOrderSales[dt] != null ? g('klaviyoPlacedOrderSales') : null,
        cpm: m.impr ? m.spend * 1000 / m.impr : null, ctr: m.impr ? m.clicks / m.impr : null, cvr: mo != null && m.clicks ? mo / m.clicks : null };
    };
    const judge = dt => {
      const x = day(dt);
      /* NORMAL = THE BRAND'S OWN LAST 28 DAYS (2026-10-09). Tested on Mar to Oct 2026, six brands: the same weekday over 8 weeks
         missed a normal day's revenue by 39% on average, the last 28 days by 30% (MER 31% vs 28%); weekday patterns are weak for
         these brands and 8 weeks lags a trend. Bad days fell from up to 6 a month per brand to about 1 to 3. Keep moved.js in step. */
      const base = Array.from({ length: 28 }, (_, i) => day(ctx.addDays(dt, -1 - i))).filter(r => r.has);
      if (!x.has || base.length < 20) return { date: dt, verdict: 'none', x, base, flags: [] };
      const flags = [];
      for (const [k, label, lower, floorKey] of YD_TESTS) {
        if ((k === 'mcpa' || k === 'gcpa') && x.pending) continue;
        const st = statOf(base, k), fl = statOf(base, floorKey), v = x[k];
        if (!st || !st.m || v == null || !fl || fl.m < 150) continue;
        const change = v / st.m - 1, z = st.s ? (v - st.m) / st.s : 0;
        /* Revenue down 60% or more always counts, however swingy the brand (Grunk Oct 8: $289 vs $988 read 'normal'). Tested: ~1 more alarm a month. */
        if (!(k === 'rev' && change <= -0.6) && (Math.abs(change) < 0.25 || Math.abs(z) < 1.5)) continue;
        flags.push({ metric: k, label, value: v, normal: st.m, change, z, bad: lower ? change > 0 : change < 0 });
      }
      const bad = flags.filter(f => f.bad);
      const verdict = bad.length >= 2 || bad.some(f => Math.abs(f.z) >= 2.5) ? 'vbad' : bad.length === 1 ? 'bad'
        : flags.some(f => !f.bad && (f.metric === 'rev' || f.metric === 'mer')) ? 'good' : 'normal';
      return { date: dt, verdict, x, base, flags };
    };
    const js = days.map(judge);
    const L = js[js.length - 1];
    const NK = ['rev', 'sp', 'orders', 'new_orders', 'mer', 'cac', 'aov', 'msp', 'impr', 'clicks', 'meta_orders', 'meta_rev', 'mcpa', 'gsp', 'google_orders', 'gcpa', 'email', 'cpm', 'ctr', 'cvr'];
    const norm = {}; for (const k of NK) { const st = statOf(L.base, k); norm[k] = st ? st.m : null; }
    const links = YD_LINKS.map(([k, label, worseWhen]) => {
      const v = L.x[k], st = statOf(L.base, k);
      const change = v != null && st && st.m ? v / st.m - 1 : null;
      return { k, label, value: v, normal: st ? st.m : null, change, z: change != null && st.s ? (v - st.m) / st.s : null,
        worse: worseWhen == null || change == null ? null : worseWhen === 'up' ? change > 0 : change < 0 };
    });
    const hasCamp = P.totalKlaviyoPlacedOrderTotalPriceCampaigns && Object.keys(P.totalKlaviyoPlacedOrderTotalPriceCampaigns).length > 0;
    const x = {}; for (const k of NK) x[k] = L.x[k];
    const detail = { date: L.date, verdict: L.verdict, attr_pending: L.x.pending, base_weeks: L.base.length,
      flags: L.flags, links, x, norm,
      changes: (CH[a.act_id] || []).slice(0, 6).map(c => ({ at: c.event_time, category: c.category, summary: c.summary, reason: c.reason || null })),
      email_sent: hasCamp ? num(P.totalKlaviyoPlacedOrderTotalPriceCampaigns[L.date]) > 0 : null };
    out.push({ act_id: a.act_id, name: a.name, currency: a.currency, cells: js.map(j => { const rs = statOf(j.base, 'rev'), ms = statOf(j.base, 'mer');
      /* Every square explains itself (2026-10-09, Cole clicked old days and nothing told him why): what moved, and revenue and MER against that brand's normal. */
      return { date: j.date, verdict: j.verdict, ...(j.x.pending ? { attr_pending: true } : {}),
        moved: (j.flags || []).map(f => ({ label: f.label, change: f.change, bad: f.bad })), rev: j.x.has ? j.x.rev : null, rev_norm: rs ? rs.m : null, mer: j.x.has ? j.x.mer : null, mer_norm: ms ? ms.m : null }; }), last: detail });
    if (L.x.msp >= 50) mk.push({ name: a.name, x: L.x, norm });
  }
  /* The market: when CPM jumped on half or more of the brands spending on Meta, it is Meta's auction, not one account. */
  const up = (v, n, by) => v != null && n ? v >= n * (1 + by) : false, down = (v, n, by) => v != null && n ? v <= n * (1 - by) : false;
  const cpmUp = mk.filter(b => up(b.x.cpm, b.norm.cpm, 0.2)), ctrDown = mk.filter(b => down(b.x.ctr, b.norm.ctr, 0.2)), cvrDown = mk.filter(b => !b.x.pending && down(b.x.cvr, b.norm.cvr, 0.2));
  const market = { date: last, meta_brands: mk.length, cpm_up: cpmUp.length, ctr_down: ctrDown.length, cvr_down: cvrDown.length,
    cpm_up_brands: cpmUp.map(b => b.name), verdict: mk.length >= 3 && cpmUp.length >= mk.length / 2 ? 'market' : 'normal' };
  return { as_of, days, brands: out, market };
}

/* ---------- Today: the media buyer's list (2026-10-09) ----------
   Meta only for now. Per brand, the 7 days ending on the latest day Triple Whale attribution has
   landed (tw_ad_attr, lastPlatformClick), so a window never ends on a half-attributed day. THE AD SET
   IS THE UNIT (Cole's doctrine): a set is judged once it has spent cr_judge_x goal CPAs; Scale =
   cr_scale_buys+ sales at or under goal; Cut = cr_cut_zero_x goals spent with no sale, or cr_cut_spend_x
   spent at a CPA over cr_cut_cpa_x the goal. Inside a WORKING set (CPA within 1.3x goal) the anchor
   (top-spend ad with cr_anchor_pct%+ of the set) is never cut or trimmed; a small ad over the cut line
   is a Trim; an anchor whose link CTR fell 20%+ against the 7 days before is a Refresh (replace it,
   never just switch it off). Rules and goal are the brand's own (brand.js rulesFor, the same numbers
   the Creative page states). Every call carries the money at stake; rows sort on it. */
const OFF_STATUS = /^(PAUSED|CAMPAIGN_PAUSED|ADSET_PAUSED|DELETED|ARCHIVED)$/;
const moneyOf = (cur) => v => (v == null ? '' : `${cur && cur !== 'USD' ? cur + ' ' : '$'}${Math.round(v).toLocaleString('en-US')}`);
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
async function buyerList(env, ctx, accts) {
  const as_of = new Date().toISOString();
  const y = accts.length ? ctx.addDays(ctx.localDate(accts[0].tz), -1) : null;
  if (!accts.length) return { as_of, rules_note: '', brands: [], rows: [] };
  const acts = accts.map(a => a.act_id);
  const IN = inList(acts.length, 3);
  const wk = [0, 7, 14, 21, 28].map(k => ctx.addDays(y, -k));
  const [conQ, maxQ, docQ, spQ] = await Promise.all([
    env.DB.prepare(`SELECT brand_id, external_id, last_error FROM connections WHERE kind = 'meta' AND brand_id IN (${inList(acts.length, 1)})`).bind(...acts).all(),
    env.DB.prepare(`SELECT act_id, MAX(date) d FROM tw_ad_attr WHERE act_id IN (${IN}) AND model = 'lastPlatformClick' AND date BETWEEN ?1 AND ?2 GROUP BY act_id`).bind(ctx.addDays(y, -30), y, ...acts).all(),
    env.DB.prepare(`SELECT act_id, data_json FROM p_br_doc WHERE act_id IN (${inList(acts.length, 1)}) AND line_id = '' AND key = 'rules'`).bind(...acts).all().catch(() => ({ results: [] })),
    env.DB.prepare(`SELECT c.brand_id act_id, d.date, SUM(d.spend) spend FROM daily_insights d JOIN connections c ON c.kind = 'meta' AND c.external_id = d.act_id
      WHERE c.brand_id IN (${inList(acts.length, 6)}) AND d.date IN (?1, ?2, ?3, ?4, ?5) GROUP BY c.brand_id, d.date`).bind(...wk, ...acts).all(),
  ]);
  const metas = {}; for (const r of conQ.results || []) (metas[r.brand_id] ??= []).push(r);
  const toOf = Object.fromEntries((maxQ.results || []).map(r => [r.act_id, r.d]));
  const docOf = Object.fromEntries((docQ.results || []).map(r => { let d = {}; try { d = JSON.parse(r.data_json || '{}'); } catch {} return [r.act_id, d]; }));
  const spOf = {}; for (const r of spQ.results || []) (spOf[r.act_id] ??= {})[r.date] = num(r.spend);
  const meta = accts.filter(a => metas[a.act_id]);
  const W = meta.filter(a => toOf[a.act_id]).map(a => { const t = toOf[a.act_id]; return { act: a.act_id, f: ctx.addDays(t, -6), t, l2: ctx.addDays(t, -1), pf: ctx.addDays(t, -13), pt: ctx.addDays(t, -7) }; });
  let adRows = [], attrRows = [];
  if (W.length) {
    /* Two parameters a brand (D1 binds at most 100); the window edges are worked out in SQL. */
    const vals = W.map((_, i) => `(?${i * 2 + 3}, ?${i * 2 + 4})`).join(', ');
    const binds = W.flatMap(w => [w.act, w.t]);
    const lo = W.map(w => w.pf).sort()[0], hi = W.map(w => w.t).sort().pop();
    const CTE = `WITH w0(brand, t) AS (VALUES ${vals}), w AS (SELECT brand, t, date(t, '-6 day') f, date(t, '-1 day') l2, date(t, '-13 day') pf, date(t, '-7 day') pt FROM w0)`;
    [adRows, attrRows] = await Promise.all([
      env.DB.prepare(`${CTE} SELECT c.brand_id act_id, d.act_id meta_act, d.ad_id, x.name ad_name, x.adset_id, s.name set_name, s.status set_status, s.daily_budget,
          SUM(CASE WHEN d.date BETWEEN w.f AND w.t THEN d.spend ELSE 0 END) spend,
          SUM(CASE WHEN d.date BETWEEN w.f AND w.t THEN d.impressions ELSE 0 END) impr,
          SUM(CASE WHEN d.date BETWEEN w.f AND w.t THEN d.link_clicks ELSE 0 END) clicks,
          SUM(CASE WHEN d.date BETWEEN w.l2 AND w.t THEN d.spend ELSE 0 END) s2,
          SUM(CASE WHEN d.date BETWEEN w.pf AND w.pt THEN d.impressions ELSE 0 END) p_impr,
          SUM(CASE WHEN d.date BETWEEN w.pf AND w.pt THEN d.link_clicks ELSE 0 END) p_clicks
        FROM ad_daily d JOIN connections c ON c.kind = 'meta' AND c.external_id = d.act_id JOIN w ON w.brand = c.brand_id
        LEFT JOIN ads x ON x.act_id = d.act_id AND x.ad_id = d.ad_id LEFT JOIN meta_adsets s ON s.adset_id = x.adset_id
        WHERE d.date BETWEEN ?1 AND ?2 AND d.date BETWEEN w.pf AND w.t GROUP BY c.brand_id, d.ad_id HAVING spend > 0`).bind(lo, hi, ...binds).all().then(r => r.results || []),
      env.DB.prepare(`${CTE} SELECT t.act_id, t.ad_id, SUM(t.orders) ord, SUM(t.revenue) rev FROM tw_ad_attr t JOIN w ON w.brand = t.act_id
        WHERE t.date BETWEEN ?1 AND ?2 AND t.model = 'lastPlatformClick' AND (t.platform = 'meta' OR t.platform IS NULL) AND t.date BETWEEN w.f AND w.t GROUP BY t.act_id, t.ad_id`).bind(lo, hi, ...binds).all().then(r => r.results || []),
    ]);
  }
  const atOf = {}; for (const r of attrRows) atOf[`${r.act_id}|${r.ad_id}`] = { ord: num(r.ord), rev: num(r.rev) };
  const rows = [], brands = [];
  let note = null;
  for (const a of meta) {
    const R = rulesFor(a, docOf[a.act_id] || null);
    const goal = R.target_cpa > 0 ? R.target_cpa : null;
    if (!note || accts.length === 1) note = R;
    const $ = moneyOf(a.currency), w = W.find(v => v.act === a.act_id);
    const from = w ? w.f : null, to = w ? w.t : null;
    const base = { act_id: a.act_id, brand: a.name, currency: a.currency, from, to };
    const fix = (meta_act, why) => rows.push({ kind: 'fix', ...base, meta_act, adset_id: null, adset: null, ad_id: null, ad: null, spend: null, orders: null, revenue: null, cpa: null, goal, roas: null, n_ads: null, anchor: null, stake: 1e6, why });
    /* fix: the connection, and a Meta account that went quiet yesterday. */
    for (const c of metas[a.act_id]) if (c.last_error) fix(c.external_id, `Meta connection error, so these numbers may be stale: ${String(c.last_error).slice(0, 140)}`);
    const S = spOf[a.act_id] || {}, normY = (num(S[wk[1]]) + num(S[wk[2]]) + num(S[wk[3]]) + num(S[wk[4]])) / 4;
    if (!(num(S[y]) > 0) && normY > 50) fix(metas[a.act_id][0].external_id, `Meta spent nothing yesterday; a normal ${WEEKDAY[new Date(`${y}T12:00:00Z`).getUTCDay()]} is ${$(normY)}. Check billing, rejected ads and paused campaigns.`);
    if (!w) { brands.push({ act_id: a.act_id, name: a.name, from: null, to: null, goal, n_sets_judged: 0, note: 'No Triple Whale attribution in the last 30 days.' }); continue; }
    /* Ad sets from the ads that spent in the window. */
    const sets = {};
    for (const r of adRows.filter(r => r.act_id === a.act_id)) {
      if (!r.adset_id || !(num(r.spend) > 0)) continue;
      const at = atOf[`${a.act_id}|${r.ad_id}`] || { ord: 0, rev: 0 };
      const s = sets[r.adset_id] ||= { id: r.adset_id, name: r.set_name || `Ad set ${r.adset_id}`, status: r.set_status || null, budget: r.daily_budget ?? null, meta_act: r.meta_act, spend: 0, s2: 0, orders: 0, revenue: 0, ads: [] };
      s.spend += num(r.spend); s.s2 += num(r.s2); s.orders += at.ord; s.revenue += at.rev;
      s.ads.push({ id: r.ad_id, name: r.ad_name || r.ad_id, spend: num(r.spend), orders: at.ord, revenue: at.rev, impr: num(r.impr), clicks: num(r.clicks), p_impr: num(r.p_impr), p_clicks: num(r.p_clicks) });
    }
    const live = Object.values(sets).filter(s => s.spend > 0 && !(s.status && OFF_STATUS.test(s.status) && !(s.s2 > 0)));
    if (!goal) {
      const worst = live.filter(s => s.spend > 300 && !s.orders).sort((p, q) => q.spend - p.spend)[0];
      if (worst) fix(worst.meta_act, `No goal cost per sale set, and "${worst.name}" spent ${$(worst.spend)} with no sale in 7 days. Set the goal in Settings > Goals so Locus can make the calls.`);
      brands.push({ act_id: a.act_id, name: a.name, from, to, goal: null, n_sets_judged: 0 });
      continue;
    }
    let judged = 0;
    for (const s of live) {
      if (s.spend < R.cr_judge_x * goal) continue;
      judged++;
      s.ads.sort((p, q) => q.spend - p.spend);
      const cpa = s.orders ? s.spend / s.orders : null, roas = div(s.revenue, s.spend);
      const top = s.ads[0], share = top ? top.spend / s.spend : 0;
      const anchor = top && share >= R.cr_anchor_pct / 100 ? { ad_id: top.id, name: top.name, share } : null;
      const working = cpa != null && cpa <= 1.3 * goal;
      const setRow = { ...base, meta_act: s.meta_act, adset_id: s.id, adset: s.name, ad_id: null, ad: null, spend: s.spend, orders: s.orders, revenue: s.revenue, cpa, goal, roas, n_ads: s.ads.length, anchor,
        set: { spend: s.spend, orders: s.orders, revenue: s.revenue, cpa, status: s.status, budget: s.budget } };
      const sales = n => `${n} sale${n === 1 ? '' : 's'}`;
      if (s.orders >= R.cr_scale_buys && cpa <= goal) rows.push({ kind: 'scale', ...setRow, stake: 0.2 * s.spend,
        why: `${sales(s.orders)} at ${$(cpa)} each, ${Math.round(cpa) < Math.round(goal) ? 'under' : 'at'} the ${$(goal)} goal over 7 days. Raise the budget 20% and watch 3 days.` });
      else if (!working && !s.orders && s.spend >= R.cr_cut_zero_x * goal) rows.push({ kind: 'cut', ...setRow, stake: s.spend,
        why: `Spent ${$(s.spend)} (${(s.spend / goal).toFixed(1)}x the goal) with no sale in 7 days.` });
      else if (!working && cpa != null && s.spend >= R.cr_cut_spend_x * goal && cpa > R.cr_cut_cpa_x * goal) rows.push({ kind: 'cut', ...setRow, stake: Math.max(0, s.spend - goal * s.orders),
        why: `Cost per sale ${$(cpa)}, ${(cpa / goal).toFixed(1)}x the ${$(goal)} goal, on ${$(s.spend)} spent.` });
      if (!working) continue;
      if (s.ads.length >= 2) for (const ad of s.ads) {
        if (anchor && ad.id === anchor.ad_id) continue;
        const acpa = ad.orders ? ad.spend / ad.orders : null;
        if (ad.spend < 2 * goal || !(ad.orders === 0 || acpa > R.cr_cut_cpa_x * goal)) continue;
        rows.push({ kind: 'trim', ...setRow, ad_id: ad.id, ad: ad.name, spend: ad.spend, orders: ad.orders, revenue: ad.revenue, cpa: acpa, roas: div(ad.revenue, ad.spend), stake: Math.max(0, ad.spend - goal * ad.orders),
          why: ad.orders ? `This ad costs ${$(acpa)} a sale, ${(acpa / goal).toFixed(1)}x the ${$(goal)} goal, on ${$(ad.spend)} spent, while the set works at ${$(cpa)}. Turn off this ad only.`
            : `This ad spent ${$(ad.spend)} with no sale while the set works at ${$(cpa)} a sale. Turn off this ad only.` });
      }
      if (anchor) {
        const ad = s.ads[0];
        if (ad.impr >= 2000 && ad.p_impr >= 2000) {
          const ctr = ad.clicks / ad.impr, pctr = ad.p_clicks / ad.p_impr;
          if (pctr > 0 && ctr <= pctr * 0.8) rows.push({ kind: 'refresh', ...setRow, ad_id: ad.id, ad: ad.name, stake: 0.3 * s.spend, ctr, prev_ctr: pctr,
            why: `The main ad (${Math.round(anchor.share * 100)}% of the set's spend) gets ${Math.round((1 - ctr / pctr) * 100)}% fewer clicks than the week before (${(ctr * 100).toFixed(2)}% vs ${(pctr * 100).toFixed(2)}%). Brief a new version of it now; do not switch it off.` });
        }
      }
    }
    brands.push({ act_id: a.act_id, name: a.name, from, to, goal, n_sets_judged: judged });
  }
  const r = note || rulesFor(null, null), pct = Math.round(r.cr_anchor_pct);
  const rules_note = `Ad sets first, over the last 7 days of Triple Whale attribution: judged after ${r.cr_judge_x}x the goal cost per sale is spent; scale at ${r.cr_scale_buys}+ sales at or under goal; cut at ${r.cr_cut_zero_x}x the goal spent with no sale, or ${r.cr_cut_spend_x}x spent at over ${r.cr_cut_cpa_x}x the goal; in a set working within 1.3x the goal, the main ad (${pct}%+ of its spend) is never cut${accts.length > 1 ? ' (each brand\'s own settings apply)' : ''}.`;
  return { as_of, rules_note, brands, rows: rows.sort((p, q) => q.stake - p.stake) };
}

/* ---------- shared readers ---------- */
const inList = (n, start = 1) => Array.from({ length: n }, (_, i) => `?${i + start}`).join(',');
/** tw_daily for many brands in one query -> { act: { metric: { date: value } } } */
async function twPivotMany(env, acts, from, to, ids) {
  const { results } = await env.DB.prepare(`SELECT act_id, date, metric, value FROM tw_daily WHERE act_id IN (${inList(acts.length, 3)}) AND date BETWEEN ?1 AND ?2 AND metric IN (${inList(ids.length, acts.length + 3)})`)
    .bind(from, to, ...acts, ...ids).all();
  const out = Object.fromEntries(acts.map(a => [a, {}]));
  for (const r of results || []) ((out[r.act_id] ??= {})[r.metric] ??= {})[r.date] = r.value;
  return out;
}
/** Attribution per brand per day for one platform and model, in one query. */
async function attrMany(env, acts, from, to, model, platform) {
  const out = Object.fromEntries(acts.map(a => [a, {}]));
  if (model === 'platform') return out;
  const plat = platform === 'meta' ? `(platform = 'meta' OR platform IS NULL)` : `platform = '${platform}'`;
  const { results } = await env.DB.prepare(`SELECT act_id, date, SUM(revenue) rev, SUM(orders) ord FROM tw_ad_attr WHERE act_id IN (${inList(acts.length, 4)}) AND model = ?1 AND date BETWEEN ?2 AND ?3 AND ${plat} GROUP BY act_id, date`)
    .bind(model, from, to, ...acts).all();
  for (const r of results || []) out[r.act_id][r.date] = { rev: r.rev || 0, ord: r.ord || 0 };
  return out;
}
const sumAttr = (byDate, from, to) => { let rev = 0, ord = 0; for (const d in byDate || {}) if (d >= from && d <= to) { rev += byDate[d].rev; ord += byDate[d].ord; } return { rev, ord }; };
async function twPivot(env, act, from, to, ids) {
  const { results } = await env.DB.prepare(`SELECT date, metric, value FROM tw_daily WHERE act_id = ?1 AND date BETWEEN ?2 AND ?3 AND metric IN (${ids.map((_, i) => `?${i + 4}`).join(',')})`)
    .bind(act, from, to, ...ids).all();
  const piv = {};
  for (const r of results || []) (piv[r.metric] ??= {})[r.date] = r.value;
  return piv;
}
const sumM = (piv, id, from, to) => { let t = 0, any = false; for (const d in piv[id] || {}) if (d >= from && d <= to && piv[id][d] != null) { t += piv[id][d]; any = true; } return any ? t : null; };
const dates = (from, to, add) => { const out = []; for (let d = from; d <= to; d = add(d, 1)) out.push(d); return out; };

/** Triple Whale attribution per ad (and per day) for one platform, one model. */
async function attrByAd(env, act, from, to, model, platform) {
  if (model === 'platform') return { byAd: {}, byDate: {} };
  const plat = platform === 'meta' ? `(platform = 'meta' OR platform IS NULL)` : `platform = '${platform}'`;
  const { results } = await env.DB.prepare(`SELECT ad_id, date, SUM(revenue) rev, SUM(orders) ord FROM tw_ad_attr WHERE act_id = ?1 AND model = ?2 AND date BETWEEN ?3 AND ?4 AND ${plat} GROUP BY ad_id, date`)
    .bind(act, model, from, to).all();
  const byAd = {}, byDate = {};
  for (const r of results || []) {
    const a = byAd[r.ad_id] ||= { rev: 0, ord: 0 }; a.rev += r.rev || 0; a.ord += r.ord || 0;
    const d = byDate[r.date] ||= { rev: 0, ord: 0 }; d.rev += r.rev || 0; d.ord += r.ord || 0;
  }
  return { byAd, byDate };
}

/* ---------- Paid > Meta ---------- */
const META_COLS = `SUM(d.spend) spend, SUM(d.impressions) impr, SUM(d.reach) reach, SUM(d.link_clicks) clicks, SUM(d.clicks_all) clicks_all, SUM(d.add_to_cart) atc,
  SUM(d.purchases) p_ord, SUM(d.revenue) p_rev, SUM(d.video_3s) v3, SUM(d.video_thruplay) thru, SUM(d.video_plays) plays,
  SUM(d.video_p25) p25, SUM(d.video_p50) p50, SUM(d.video_p75) p75, SUM(d.video_p100) p100`;
function metaMetrics(r, attr) {
  const spend = num(r.spend), impr = num(r.impr), clicks = num(r.clicks), atc = num(r.atc);
  const ord = attr ? attr.ord : num(r.p_ord), rev = attr ? attr.rev : num(r.p_rev);
  return { spend, impressions: impr, reach: num(r.reach), clicks, atc, purchases: ord, revenue: rev, platform_purchases: num(r.p_ord), platform_revenue: num(r.p_rev),
    roas: div(rev, spend), cpa: div(spend, ord), cpm: div(spend * 1000, impr), ctr: div(clicks, impr), cpc: div(spend, clicks), cost_per_atc: div(spend, atc),
    atc_rate: div(atc, clicks), purchase_rate: div(ord, atc), frequency: div(impr, num(r.reach)),
    hook: num(r.v3) ? div(num(r.v3), impr) : null, hold: num(r.v3) ? div(num(r.thru), num(r.v3)) : null,
    /* Where people stop watching (Motion's retention curve): share of IMPRESSIONS still watching at 3
       seconds, 25%, 50%, 75% and the end. Meta's own watch counts, video ads only. */
    curve: num(r.v3) && num(r.p25) ? [num(r.v3), num(r.p25), num(r.p50), num(r.p75), num(r.p100)].map(v => div(v, impr)) : null };
}
async function metaBrand(env, a, w, model, detail) {
  const act = a.act_id;
  const tot = async (from, to) => {
    let r = await env.DB.prepare(`SELECT ${META_COLS} FROM ad_daily d WHERE d.act_id IN ${metaOf(1)} AND d.date BETWEEN ?2 AND ?3`).bind(act, from, to).first();
    const live = from === to && to === w.today;
    if (live && !num(r?.spend)) r = (await env.DB.prepare(`SELECT SUM(spend) spend, SUM(impressions) impr, SUM(reach) reach, SUM(link_clicks) clicks, SUM(clicks) clicks_all, SUM(purchases) p_ord, SUM(revenue) p_rev FROM daily_insights WHERE act_id IN ${metaOf(1)} AND date = ?2`).bind(act, to).first().catch(() => null)) || r;
    const at = model === 'platform' ? null : await env.DB.prepare(`SELECT SUM(revenue) rev, SUM(orders) ord, COUNT(*) n FROM tw_ad_attr WHERE act_id = ?1 AND model = ?2 AND date BETWEEN ?3 AND ?4 AND (platform = 'meta' OR platform IS NULL)`).bind(act, model, from, to).first();
    const m = metaMetrics(r || {}, at ? { rev: num(at.rev), ord: num(at.ord) } : null);
    if (live && at && !num(at.n)) Object.assign(m, { purchases: null, revenue: null, roas: null, cpa: null, purchase_rate: null, attr_pending: true });
    return m;
  };
  const cur = await tot(w.from, w.to);
  const prev = w.pf ? await tot(w.pf, w.pt) : null;
  const goals = { cpa: a.target_cpa ?? null, roas: a.target_roas ?? null };
  const out = { act_id: act, name: a.name, currency: a.currency, goals, cur, prev };
  if (!detail) return out;

  /* Daily series, by campaign. */
  const { results: daily } = await env.DB.prepare(`SELECT d.date, COALESCE(x.campaign_id, '?') campaign_id, ${META_COLS} FROM ad_daily d LEFT JOIN ads x ON x.ad_id = d.ad_id
    WHERE d.act_id IN ${metaOf(1)} AND d.date BETWEEN ?2 AND ?3 GROUP BY d.date, campaign_id ORDER BY d.date`).bind(act, w.from, w.to).all();
  const { byAd, byDate } = await attrByAd(env, act, w.from, w.to, model, 'meta');
  const { results: prevDaily } = w.pf ? await env.DB.prepare(`SELECT d.date, SUM(d.spend) spend, SUM(d.purchases) p_ord, SUM(d.revenue) p_rev, SUM(d.impressions) impr, SUM(d.link_clicks) clicks FROM ad_daily d WHERE d.act_id IN ${metaOf(1)} AND d.date BETWEEN ?2 AND ?3 GROUP BY d.date ORDER BY d.date`).bind(act, w.pf, w.pt).all() : { results: [] };
  const prevAttr = w.pf ? (await attrByAd(env, act, w.pf, w.pt, model, 'meta')).byDate : {};

  /* Campaign > ad set > ad, with names. */
  const { results: adRows } = await env.DB.prepare(`SELECT d.ad_id, x.name ad_name, x.adset_id, x.campaign_id, x.media_type, x.first_spend_date, x.created_time, ${META_COLS}
    FROM ad_daily d LEFT JOIN ads x ON x.ad_id = d.ad_id WHERE d.act_id IN ${metaOf(1)} AND d.date BETWEEN ?2 AND ?3 GROUP BY d.ad_id`).bind(act, w.from, w.to).all();
  const { results: camps } = await env.DB.prepare(`SELECT campaign_id, name, objective, status, daily_budget, lifetime_budget, bid_strategy FROM meta_campaigns WHERE act_id IN ${metaOf(1)}`).bind(act).all().catch(() => ({ results: [] }));
  const { results: sets } = await env.DB.prepare(`SELECT adset_id, campaign_id, name, status, daily_budget, optimization_goal, min_spend FROM meta_adsets WHERE act_id IN ${metaOf(1)}`).bind(act).all().catch(() => ({ results: [] }));
  const cName = Object.fromEntries((camps || []).map(c => [c.campaign_id, c])), sName = Object.fromEntries((sets || []).map(s => [s.adset_id, s]));
  const { results: prevAds } = w.pf ? await env.DB.prepare(`SELECT x.campaign_id, x.adset_id, SUM(d.spend) spend, SUM(d.purchases) p_ord FROM ad_daily d LEFT JOIN ads x ON x.ad_id = d.ad_id WHERE d.act_id IN ${metaOf(1)} AND d.date BETWEEN ?2 AND ?3 GROUP BY x.adset_id`).bind(act, w.pf, w.pt).all() : { results: [] };
  const prevAttrAd = w.pf ? (await attrByAd(env, act, w.pf, w.pt, model, 'meta')).byAd : {};
  const { results: prevAdIds } = w.pf ? await env.DB.prepare(`SELECT DISTINCT d.ad_id, x.adset_id, x.campaign_id FROM ad_daily d LEFT JOIN ads x ON x.ad_id = d.ad_id WHERE d.act_id IN ${metaOf(1)} AND d.date BETWEEN ?2 AND ?3`).bind(act, w.pf, w.pt).all() : { results: [] };
  const prevBy = { camp: {}, set: {} };
  for (const r of prevAds || []) {
    for (const [k, id] of [['camp', r.campaign_id], ['set', r.adset_id]]) { const b = prevBy[k][id] ||= { spend: 0, p_ord: 0, ord: 0 }; b.spend += num(r.spend); b.p_ord += num(r.p_ord); }
  }
  if (model !== 'platform') for (const r of prevAdIds || []) { const at = prevAttrAd[r.ad_id]; if (!at) continue; for (const [k, id] of [['camp', r.campaign_id], ['set', r.adset_id]]) { const b = prevBy[k][id] ||= { spend: 0, p_ord: 0, ord: 0 }; b.ord += at.ord; } }
  const add = (t, r) => { for (const k of ['spend', 'impr', 'reach', 'clicks', 'clicks_all', 'atc', 'p_ord', 'p_rev', 'v3', 'thru', 'plays']) t[k] = (t[k] || 0) + num(r[k]); };
  const campMap = {};
  for (const r of adRows || []) {
    const cid = r.campaign_id || '?', sid = r.adset_id || '?';
    const c = campMap[cid] ||= { id: cid, name: cName[cid]?.name || (cid === '?' ? 'Unknown campaign' : `Campaign ${cid}`), objective: cName[cid]?.objective || null, status: cName[cid]?.status || null,
      budget: cName[cid]?.daily_budget ?? null, raw: {}, attr: { rev: 0, ord: 0 }, sets: {} };
    const s = c.sets[sid] ||= { id: sid, name: sName[sid]?.name || `Ad set ${sid}`, status: sName[sid]?.status || null, budget: sName[sid]?.daily_budget ?? null, min_spend: sName[sid]?.min_spend ?? null, goal: sName[sid]?.optimization_goal || null, raw: {}, attr: { rev: 0, ord: 0 }, ads: [] };
    const at = byAd[r.ad_id] || { rev: 0, ord: 0 };
    add(c.raw, r); add(s.raw, r); c.attr.rev += at.rev; c.attr.ord += at.ord; s.attr.rev += at.rev; s.attr.ord += at.ord;
    s.ads.push({ id: r.ad_id, name: r.ad_name || r.ad_id, media_type: r.media_type || null, first_spend: r.first_spend_date || (r.created_time || '').slice(0, 10) || null, ...metaMetrics(r, model === 'platform' ? null : at) });
  }
  const pm = (b) => b ? { spend: b.spend, purchases: model === 'platform' ? b.p_ord : b.ord, cpa: div(b.spend, model === 'platform' ? b.p_ord : b.ord) } : null;
  out.campaigns = Object.values(campMap).map(c => ({ id: c.id, name: c.name, objective: c.objective, status: c.status, budget: c.budget,
    ...metaMetrics(c.raw, model === 'platform' ? null : c.attr), prev: pm(prevBy.camp[c.id]),
    adsets: Object.values(c.sets).map(s => ({ id: s.id, name: s.name, status: s.status, budget: s.budget, min_spend: s.min_spend, goal: s.goal, ...metaMetrics(s.raw, model === 'platform' ? null : s.attr), prev: pm(prevBy.set[s.id]),
      ads: s.ads.sort((x, y) => y.spend - x.spend) })).sort((x, y) => y.spend - x.spend) }))
    .sort((x, y) => y.spend - x.spend);

  /* The day series: spend by campaign, purchases and revenue under the model, plus the compare window. */
  const byDay = {};
  for (const r of daily || []) { const d = byDay[r.date] ||= { date: r.date, spend: 0, p_ord: 0, p_rev: 0, impr: 0, clicks: 0, atc: 0, camps: {} }; d.spend += num(r.spend); d.p_ord += num(r.p_ord); d.p_rev += num(r.p_rev); d.impr += num(r.impr); d.clicks += num(r.clicks); d.atc += num(r.atc); d.camps[r.campaign_id] = (d.camps[r.campaign_id] || 0) + num(r.spend); }
  out.series = Object.values(byDay).sort((x, y) => (x.date < y.date ? -1 : 1)).map(d => {
    const at = byDate[d.date]; const ord = model === 'platform' ? d.p_ord : (at ? at.ord : 0), rev = model === 'platform' ? d.p_rev : (at ? at.rev : 0);
    return { date: d.date, spend: d.spend, purchases: ord, revenue: rev, platform_revenue: d.p_rev, cpa: div(d.spend, ord), roas: div(rev, d.spend), ctr: div(d.clicks, d.impr), cpm: div(d.spend * 1000, d.impr), impressions: d.impr, clicks: d.clicks, camps: d.camps };
  });
  out.prev_series = (prevDaily || []).map(d => { const at = prevAttr[d.date]; const ord = model === 'platform' ? num(d.p_ord) : (at ? at.ord : 0), rev = model === 'platform' ? num(d.p_rev) : (at ? at.rev : 0); return { date: d.date, spend: num(d.spend), purchases: ord, revenue: rev, cpa: div(num(d.spend), ord), roas: div(rev, num(d.spend)), ctr: div(num(d.clicks), num(d.impr)), cpm: div(num(d.spend) * 1000, num(d.impr)) }; });

  /* The account's own changes in the window (budget, launches, pauses), for chart markers. */
  const { results: changes } = await env.DB.prepare(`SELECT substr(event_time,1,10) date, category, summary, actor, object_name FROM activities WHERE act_id IN ${metaOf(1)} AND substr(event_time,1,10) BETWEEN ?2 AND ?3
    AND category IN ('budget','new_campaign','campaign_paused','campaign_relaunched','bid_strategy','new_creative','new_adset','manual') ORDER BY event_time DESC LIMIT 60`).bind(act, w.from, w.to).all().catch(() => ({ results: [] }));
  out.changes = changes || [];
  return out;
}

/** Meta totals for many brands: 2 queries per window, whatever the brand count. */
async function metaMany(env, accts, w, model, ctx) {
  const acts = accts.map(a => a.act_id);
  const lo = w.pf && w.pf < w.from ? w.pf : w.from;
  const { results } = await env.DB.prepare(`SELECT c.brand_id act_id, CASE WHEN d.date >= ?1 THEN 'cur' ELSE 'prev' END win, ${META_COLS} FROM ad_daily d
    JOIN connections c ON c.kind = 'meta' AND c.external_id = d.act_id
    WHERE c.brand_id IN (${inList(acts.length, 5)}) AND ((d.date BETWEEN ?1 AND ?2) OR (d.date BETWEEN ?3 AND ?4)) GROUP BY c.brand_id, win`)
    .bind(w.from, w.to, w.pf || '9999', w.pt || '0000', ...acts).all();
  const at = await attrMany(env, acts, lo, w.to, model, 'meta');
  const raw = {}; for (const r of results || []) (raw[r.act_id] ??= {})[r.win] = r;
  /* The day series per brand (2026-10-09, every tile carries its line): ONE grouped query for every brand and both
     windows; attribution per day comes from the attrMany read above. */
  const { results: dayRows } = await env.DB.prepare(`SELECT c.brand_id act_id, d.date, SUM(d.spend) spend, SUM(d.impressions) impr, SUM(d.link_clicks) clicks, SUM(d.purchases) p_ord, SUM(d.revenue) p_rev FROM ad_daily d
    JOIN connections c ON c.kind = 'meta' AND c.external_id = d.act_id
    WHERE c.brand_id IN (${inList(acts.length, 5)}) AND ((d.date BETWEEN ?1 AND ?2) OR (d.date BETWEEN ?3 AND ?4)) GROUP BY c.brand_id, d.date`)
    .bind(w.from, w.to, w.pf || '9999', w.pt || '0000', ...acts).all().catch(() => ({ results: [] }));
  const byDay = {}; for (const r of dayRows || []) (byDay[r.act_id] ??= {})[r.date] = r;
  /* Today: Meta's account totals so far from daily_insights (ad rows land overnight), attribution pending. */
  const live = w.from === w.to && w.to === w.today;
  if (live) {
    const { results: di } = await env.DB.prepare(`SELECT c.brand_id act_id, SUM(i.spend) spend, SUM(i.impressions) impr, SUM(i.reach) reach, SUM(i.link_clicks) clicks, SUM(i.clicks) clicks_all, SUM(i.purchases) p_ord, SUM(i.revenue) p_rev FROM daily_insights i
      JOIN connections c ON c.kind = 'meta' AND c.external_id = i.act_id WHERE c.brand_id IN (${inList(acts.length, 2)}) AND i.date = ?1 GROUP BY c.brand_id`).bind(w.to, ...acts).all().catch(() => ({ results: [] }));
    for (const r of di || []) if (!num(raw[r.act_id]?.cur?.spend)) (raw[r.act_id] ??= {}).cur = r;
  }
  const add = ctx ? ctx.addDays : null;
  const seriesOf = (act, from, to) => !add ? [] : dates(from, to, add).map(d => { const r = byDay[act]?.[d] || {}; const a2 = at[act]?.[d];
    const spend = num(r.spend), impr = num(r.impr), clicks = num(r.clicks);
    const ord = model === 'platform' ? num(r.p_ord) : (a2 ? a2.ord : 0), rev = model === 'platform' ? num(r.p_rev) : (a2 ? a2.rev : 0);
    return { date: d, spend, impressions: impr, clicks, purchases: ord, revenue: rev, roas: div(rev, spend), cpa: div(spend, ord), cpm: div(spend * 1000, impr), ctr: div(clicks, impr) }; });
  return accts.map(a => {
    const cA = model === 'platform' ? null : sumAttr(at[a.act_id], w.from, w.to);
    const pA = model === 'platform' || !w.pf ? null : sumAttr(at[a.act_id], w.pf, w.pt);
    const cur = metaMetrics(raw[a.act_id]?.cur || {}, cA);
    if (live && model !== 'platform' && !at[a.act_id]?.[w.to]) Object.assign(cur, { purchases: null, revenue: null, roas: null, cpa: null, purchase_rate: null, attr_pending: true });
    return { act_id: a.act_id, name: a.name, currency: a.currency, goals: { cpa: a.target_cpa ?? null, roas: a.target_roas ?? null },
      cur, prev: w.pf ? metaMetrics(raw[a.act_id]?.prev || {}, pA) : null,
      series: seriesOf(a.act_id, w.from, w.to), prev_series: w.pf ? seriesOf(a.act_id, w.pf, w.pt) : [] };
  });
}
async function twPlatformMany(env, ctx, accts, w, model, platform) {
  const P = TW_PLAT[platform];
  const ids = [...new Set(Object.values(P).flat())];
  const lo = w.pf && w.pf < w.from ? w.pf : w.from;
  const acts = accts.map(a => a.act_id);
  const pivs = await twPivotMany(env, acts, lo, w.to, ids);
  const ats = await attrMany(env, acts, lo, w.to, model === 'platform' ? 'lastPlatformClick' : model, platform);
  return accts.map(a => twPlatformFrom(ctx, a, w, model, P, pivs[a.act_id] || {}, ats[a.act_id] || {}));
}
async function allChannelsMany(env, ctx, accts, w, model) {
  const acts = accts.map(a => a.act_id);
  const lo = w.pf && w.pf < w.from ? w.pf : w.from;
  const meta = await metaMany(env, accts, w, model, ctx);
  const ids = [...new Set([...Object.values(TW_PLAT.google).flat(), ...Object.values(TW_PLAT.tiktok).flat(), 'pinterestSpend', 'pinterestAdsSpend', 'pi_adCost', 'amazonAds', 'amazonAdsConversionValue', 'klaviyoPlacedOrderSales', 'totalKlaviyoPlacedOrderTotalPriceCampaigns', 'totalKlaviyoPlacedOrderTotalPriceFlows', 'blendedAds', 'netSales', 'totalNetTaxes', 'newCustomersOrders', 'fb_ads_spend'])];
  const pivs = await twPivotMany(env, acts, lo, w.to, ids);
  const m = model === 'platform' ? 'lastPlatformClick' : model;
  const atG = await attrMany(env, acts, lo, w.to, m, 'google');
  const atT = await attrMany(env, acts, lo, w.to, m, 'tiktok');
  const { results: nc } = await env.DB.prepare(`SELECT o.act_id, o.source, COUNT(*) n FROM tw_orders o WHERE o.act_id IN (${inList(acts.length, 3)}) AND o.date BETWEEN ?1 AND ?2 AND o.customer_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM tw_orders p WHERE p.act_id = o.act_id AND p.customer_id = o.customer_id AND p.date < o.date) GROUP BY o.act_id, o.source`).bind(w.from, w.to, ...acts).all().catch(() => ({ results: [] }));
  const ncBy = {}; for (const r of nc || []) (ncBy[r.act_id] ??= {})[r.source] = r.n;
  return accts.map((a, i) => {
    const piv = pivs[a.act_id] || {};
    const g = twPlatformFrom(ctx, a, w, model, TW_PLAT.google, piv, atG[a.act_id] || {});
    const t = twPlatformFrom(ctx, a, w, model, TW_PLAT.tiktok, piv, atT[a.act_id] || {});
    return channelRows(ctx, a, w, meta[i], g, t, piv, ncBy[a.act_id] || {});
  });
}
async function storeMany(env, ctx, accts, w) {
  const acts = accts.map(a => a.act_id);
  const lo = w.pf && w.pf < w.from ? w.pf : w.from;
  const pivs = await twPivotMany(env, acts, lo, w.to, STORE_IDS);
  if (accts.length > 1) return accts.map(a => { const piv = pivs[a.act_id] || {}; return { act_id: a.act_id, name: a.name, currency: a.currency, cur: storeRoll(piv, w.from, w.to, ctx.addDays), prev: w.pf ? storeRoll(piv, w.pf, w.pt, ctx.addDays) : null,
    series: dates(w.from, w.to, ctx.addDays).map(d => { const r = storeRoll(piv, d, d, ctx.addDays); return { date: d, revenue: r.revenue, orders: r.orders }; }) }; });
  return [await storeBrand(env, ctx, accts[0], w, pivs[accts[0].act_id] || {})];
}
async function emailMany(env, ctx, accts, w) {
  const acts = accts.map(a => a.act_id);
  const lo = w.pf && w.pf < w.from ? w.pf : w.from;
  const pivs = await twPivotMany(env, acts, lo, w.to, EMAIL_IDS);
  return accts.map(a => emailFrom(ctx, a, w, pivs[a.act_id] || {}));
}

/* ---------- Paid > Google / TikTok (through Triple Whale's platform rows) ---------- */
const TW_PLAT = {
  google: { spend: ['ga_adCost'], impr: ['totalGoogleAdsImpressions'], clicks: ['totalGoogleAdsClicks'], roas: ['ga_ROAS'], cpa: ['googleAllCpa'] },
  tiktok: { spend: ['tiktok_spend', 'tiktokAdsSpend', 'tk_adCost'], impr: ['tiktokImpressions'], ctr: ['tiktokCtr'], roas: ['tiktok_complete_payment_roas'], purchases: ['tiktokPurchases'], cpm: ['averageTiktokCpm'] },
};
function twPlatformFrom(ctx, a, w, model, P, piv, byDate) {
  const pick = (key, d) => { for (const id of P[key] || []) { const v = piv[id]?.[d]; if (v != null) return v; } return null; };
  const day = d => {
    const spend = num(pick('spend', d)), impr = num(pick('impr', d));
    const clicks = P.clicks ? num(pick('clicks', d)) : (pick('ctr', d) != null ? impr * pick('ctr', d) / 100 : 0);
    const pRev = pick('roas', d) != null ? spend * pick('roas', d) : null;
    const pOrd = P.purchases ? pick('purchases', d) : (pick('cpa', d) ? spend / pick('cpa', d) : null);
    const at = byDate[d];
    return { date: d, spend, impressions: impr, clicks, platform_revenue: pRev, platform_purchases: pOrd, tw_revenue: at ? at.rev : 0, tw_purchases: at ? at.ord : 0 };
  };
  const roll = (from, to) => {
    const ds = dates(from, to, ctx.addDays).map(day);
    const t = ds.reduce((s, x) => { for (const k of ['spend', 'impressions', 'clicks', 'tw_revenue', 'tw_purchases']) s[k] += x[k] || 0; if (x.platform_revenue != null) { s.pr += x.platform_revenue; s.prAny = true; } if (x.platform_purchases != null) { s.po += x.platform_purchases; s.poAny = true; } return s; },
      { spend: 0, impressions: 0, clicks: 0, tw_revenue: 0, tw_purchases: 0, pr: 0, po: 0, prAny: false, poAny: false });
    const usePlat = model === 'platform';
    /* Today: Triple Whale's attribution lands overnight, so an unsynced today is "pending", never a 0. */
    const pending = !usePlat && from === to && to === w.today && !byDate[to];
    const rev = usePlat ? (t.prAny ? t.pr : null) : pending ? null : t.tw_revenue, ord = usePlat ? (t.poAny ? t.po : null) : pending ? null : t.tw_purchases;
    return { series: ds, m: { spend: t.spend, impressions: t.impressions, clicks: t.clicks, revenue: rev, purchases: ord, platform_revenue: t.prAny ? t.pr : null, platform_purchases: t.poAny ? t.po : null,
      roas: rev == null ? null : div(rev, t.spend), cpa: ord ? div(t.spend, ord) : null, cpm: div(t.spend * 1000, t.impressions), ctr: div(t.clicks, t.impressions), cpc: div(t.spend, t.clicks), ...(pending ? { attr_pending: true } : {}) } };
  };
  const cur = roll(w.from, w.to), prev = w.pf ? roll(w.pf, w.pt) : null;
  const pt = x => { const rev = model === 'platform' ? x.platform_revenue : x.tw_revenue, ord = model === 'platform' ? x.platform_purchases : x.tw_purchases;
    return { date: x.date, spend: x.spend, revenue: rev, purchases: ord, platform_revenue: x.platform_revenue, impressions: x.impressions, clicks: x.clicks,
      roas: rev == null ? null : div(rev, x.spend), cpa: ord ? div(x.spend, ord) : null, cpm: div(x.spend * 1000, x.impressions), ctr: div(x.clicks, x.impressions) }; };
  return { act_id: a.act_id, name: a.name, currency: a.currency, goals: { cpa: a.target_cpa ?? null, roas: a.target_roas ?? null }, cur: cur.m, prev: prev ? prev.m : null,
    series: cur.series.map(pt), prev_series: prev ? prev.series.map(pt) : [], source: 'via Triple Whale' };
}

/* ---------- Paid > All channels ---------- */
function channelRows(ctx, a, w, meta, g, t, piv, ncBy) {
  const rng = (from, to) => ({
    pin: sumM(piv, 'pinterestSpend', from, to) ?? sumM(piv, 'pinterestAdsSpend', from, to) ?? sumM(piv, 'pi_adCost', from, to),
    amzSpend: sumM(piv, 'amazonAds', from, to), amzRev: sumM(piv, 'amazonAdsConversionValue', from, to),
    email: sumM(piv, 'klaviyoPlacedOrderSales', from, to), camp: sumM(piv, 'totalKlaviyoPlacedOrderTotalPriceCampaigns', from, to), flows: sumM(piv, 'totalKlaviyoPlacedOrderTotalPriceFlows', from, to),
    blended: sumM(piv, 'blendedAds', from, to), revenue: (sumM(piv, 'netSales', from, to) ?? 0) - (sumM(piv, 'totalNetTaxes', from, to) ?? 0), nc: sumM(piv, 'newCustomersOrders', from, to),
  });
  const cr = rng(w.from, w.to), pr = w.pf ? rng(w.pf, w.pt) : null;
  const rows = [
    { id: 'meta', label: 'Meta', spend: meta.cur.spend, revenue: meta.cur.revenue, purchases: meta.cur.purchases, platform_revenue: meta.cur.platform_revenue, prev_revenue: meta.prev?.revenue ?? null, prev_spend: meta.prev?.spend ?? null, nc: ncBy.meta || 0 },
    { id: 'google', label: 'Google', spend: g.cur.spend, revenue: g.cur.revenue, purchases: g.cur.purchases, platform_revenue: g.cur.platform_revenue, prev_revenue: g.prev?.revenue ?? null, prev_spend: g.prev?.spend ?? null, nc: ncBy.google || 0 },
    { id: 'tiktok', label: 'TikTok', spend: t.cur.spend, revenue: t.cur.revenue, purchases: t.cur.purchases, platform_revenue: t.cur.platform_revenue, prev_revenue: t.prev?.revenue ?? null, prev_spend: t.prev?.spend ?? null, nc: ncBy.tiktok || 0 },
    { id: 'pinterest', label: 'Pinterest', spend: cr.pin, revenue: null, purchases: null, platform_revenue: null, prev_revenue: null, prev_spend: pr?.pin ?? null, nc: ncBy.pinterest || 0 },
    { id: 'amazon', label: 'Amazon ads', spend: cr.amzSpend, revenue: cr.amzRev, purchases: null, platform_revenue: null, prev_revenue: pr?.amzRev ?? null, prev_spend: pr?.amzSpend ?? null, nc: 0 },
    { id: 'email', label: 'Email and SMS', spend: null, revenue: cr.email, purchases: null, platform_revenue: null, prev_revenue: pr?.email ?? null, prev_spend: null, campaigns: cr.camp, flows: cr.flows, nc: ncBy.klaviyo || 0 },
  ].filter(r => (r.spend || 0) > 0 || (r.revenue || 0) > 0);
  const credited = rows.reduce((s, r) => s + (r.revenue || 0), 0);
  rows.push({ id: 'rest', label: 'Everything else', spend: null, revenue: Math.max(0, cr.revenue - credited), purchases: null, platform_revenue: null, prev_revenue: null, prev_spend: null, nc: ncBy.organic || 0 });
  /* Daily spend per platform, for the stacked chart (Meta's own spend as Triple Whale carries it). */
  const mBy = piv.fb_ads_spend || {};
  const gBy = Object.fromEntries(g.series.map(x => [x.date, x.spend])), tBy = Object.fromEntries(t.series.map(x => [x.date, x.spend]));
  /* Per day, the blended view (2026-10-09, All channels draws the same tiles and chart as Home): store revenue and
     blended spend from Triple Whale, and the paid platforms' credited purchases, spend, impressions and clicks
     (Meta's own delivery rows, Google and TikTok as Triple Whale carries them). */
  const day = (piv2, d) => { const s = piv2.netSales?.[d]; return s == null ? null : s - num(piv2.totalNetTaxes?.[d]); };
  const at = (list) => Object.fromEntries((list || []).map(x => [x.date, x]));
  const mS = at(meta.series), gS = at(g.series), tS = at(t.series), mP = at(meta.prev_series), gP = at(g.prev_series), tP = at(t.prev_series);
  const paidOf = (d, A, B, C) => { const x = [A[d], B[d], C[d]].filter(Boolean); const s = k => x.reduce((y, r) => y + num(r[k]), 0); return { purchases: s('purchases'), paid_spend: s('spend'), impressions: s('impressions'), clicks: s('clicks') }; };
  const series = dates(w.from, w.to, ctx.addDays).map(d => ({ date: d, meta: num(mBy[d]), google: num(gBy[d]), tiktok: num(tBy[d]), revenue: day(piv, d), spend: piv.blendedAds?.[d] ?? null, ...paidOf(d, mS, gS, tS) }));
  const prev_series = w.pf ? dates(w.pf, w.pt, ctx.addDays).map(d => ({ date: d, revenue: day(piv, d), spend: piv.blendedAds?.[d] ?? null, ...paidOf(d, mP, gP, tP) })) : [];
  const paid = (m, gg, tt) => { const x = [m, gg, tt].filter(Boolean); const s = k => x.reduce((y, r) => y + num(r[k]), 0); const pend = x.some(r => r.attr_pending);
    return { spend: s('spend'), purchases: pend ? null : s('purchases'), impressions: s('impressions'), clicks: s('clicks'), attr_pending: pend || undefined }; };
  return { act_id: a.act_id, name: a.name, currency: a.currency, revenue: cr.revenue, blended_spend: cr.blended, prev_revenue: pr ? pr.revenue : null, prev_blended: pr ? pr.blended : null, new_orders: cr.nc, rows, series, prev_series,
    paid: paid(meta.cur, g.cur, t.cur), prev_paid: w.pf ? paid(meta.prev, g.prev, t.prev) : null };
}

/* ---------- Creative ---------- */
const formatOf = name => { const parts = String(name || '').split('|'); if (parts.length < 2) return null; const t = parts[parts.length - 1].trim(); return /[a-z]/i.test(t) ? t.replace(/\s+/g, ' ').slice(0, 24) : null; };
const batchOf = name => { const m = String(name || '').match(/^\s*(?:[A-Z]{1,4}_)?(\d{2,4})\b/); return m ? m[1] : null; };
async function creativeBrand(env, a, w, model) {
  const act = a.act_id;
  const { results: ads } = await env.DB.prepare(`SELECT d.ad_id, x.name, x.media_type, x.first_spend_date, x.created_time, x.campaign_id, x.adset_id, x.asset_key, ${META_COLS}
    FROM ad_daily d LEFT JOIN ads x ON x.ad_id = d.ad_id WHERE d.act_id IN ${metaOf(1)} AND d.date BETWEEN ?2 AND ?3 GROUP BY d.ad_id HAVING SUM(d.spend) > 0`).bind(act, w.from, w.to).all();
  const { byAd } = await attrByAd(env, act, w.from, w.to, model, 'meta');
  /* First-click credit per ad, beside the screen's model: an ad Triple Whale credits far more on FIRST
     click starts journeys (top of funnel); one credited more on the last click closes them. */
  const fc = model === 'fullFirstClick' ? byAd : (await attrByAd(env, act, w.from, w.to, 'fullFirstClick', 'meta')).byAd;
  const lc = model === 'lastPlatformClick' ? byAd : (await attrByAd(env, act, w.from, w.to, 'lastPlatformClick', 'meta')).byAd;
  const { results: camps } = await env.DB.prepare(`SELECT campaign_id, name FROM meta_campaigns WHERE act_id IN ${metaOf(1)}`).bind(act).all().catch(() => ({ results: [] }));
  const { results: setRows } = await env.DB.prepare(`SELECT adset_id, name FROM meta_adsets WHERE act_id IN ${metaOf(1)}`).bind(act).all().catch(() => ({ results: [] }));
  const sName = Object.fromEntries((setRows || []).map(x => [x.adset_id, x.name]));
  const cName = Object.fromEntries((camps || []).map(c => [c.campaign_id, c.name]));
  /* Angle per ad: the batch number leading the ad name -> the test library -> its angle. */
  const { results: batches } = await env.DB.prepare(`SELECT b.num, g.name angle FROM p_br_batch b LEFT JOIN p_br_angle g ON g.id = b.angle_id WHERE b.act_id = ?1`).bind(act).all().catch(() => ({ results: [] }));
  const angleOf = Object.fromEntries((batches || []).map(b => [String(b.num).replace(/^\D+/, ''), b.angle]));
  const today = w.to;
  /* AI tags per creative (account-health creative.js fills ad_tag hourly). */
  const { results: tagRows } = await env.DB.prepare(`SELECT asset_key, tags_json FROM ad_tag WHERE act_id IN ${metaOf(1)} AND tags_json IS NOT NULL`).bind(act).all().catch(() => ({ results: [] }));
  const tagOf = Object.fromEntries((tagRows || []).map(t => { try { return [t.asset_key, JSON.parse(t.tags_json)]; } catch { return [t.asset_key, null]; } }));
  const rows = (ads || []).map(r => {
    const m = metaMetrics(r, model === 'platform' ? null : (byAd[r.ad_id] || { rev: 0, ord: 0 }));
    const first = r.first_spend_date || (r.created_time || '').slice(0, 10) || null;
    const b = batchOf(r.name);
    return { id: r.ad_id, name: r.name || r.ad_id, media_type: r.media_type || (num(r.v3) > 0 ? 'video' : 'image'), campaign: cName[r.campaign_id] || null, adset_id: r.adset_id || null,
      fc_rev: model === 'platform' ? null : num((fc[r.ad_id] || {}).rev), lc_rev: model === 'platform' ? null : num((lc[r.ad_id] || {}).rev),
      first_spend: first, age: first ? Math.max(0, Math.round((Date.parse(today) - Date.parse(first)) / 864e5)) : null,
      format: formatOf(r.name), batch: b, angle: b ? (angleOf[b] || null) : null, asset_key: r.asset_key || null, tags: r.asset_key ? (tagOf[r.asset_key] || null) : null, ...m };
  }).sort((x, y) => y.spend - x.spend);
  /* THE AD SET IS THE UNIT (Cole, 2026-10-08). Meta spends inside an ad set as one system: the ad that
     takes most of the budget is often the broad opener, and the smaller ads with prettier numbers ride
     on the traffic it warms. So every ad carries its ad set's totals, its share of that spend and its
     rank, and the Creative screen judges the set first and the ad by its role in it. */
  const sets = {};
  for (const r of rows) { if (!r.adset_id) continue; const x = sets[r.adset_id] ||= { id: r.adset_id, name: sName[r.adset_id] || null, spend: 0, revenue: 0, purchases: 0, ads: 0 }; x.spend += r.spend; x.revenue += r.revenue || 0; x.purchases += r.purchases || 0; x.ads++; }
  for (const x of Object.values(sets)) { x.cpa = div(x.spend, x.purchases); x.roas = div(x.revenue, x.spend); }
  /* CUSTOMER VALUE PER AD (2026-10-08, the Hyros idea). The ad that STARTED a customer is the Meta ad on
     the first-click touch of their first order (tw_order_touch, fullFirstClick); their value is everything
     they spent in the 90 days from that first order (tw_orders). Only customers whose first order is 90+
     days old count, so the number is never flattered by customers who have not had time to come back.
     Independent of the date window: it is a property of the ad. */
  const ltv = await ltvByAd(env, act, w.to).catch(() => ({}));
  for (const r of rows) { const l = ltv[r.id]; if (l && l.n) { r.ltv_n = l.n; r.ltv_first = l.first / l.n; r.ltv90 = l.v90 / l.n; r.ltv_x = l.first ? l.v90 / l.first : null; } }
  const rankIn = {};
  for (const r of rows) { if (!r.adset_id) continue; const k = rankIn[r.adset_id] = (rankIn[r.adset_id] || 0) + 1; const x = sets[r.adset_id];
    r.adset = { id: x.id, name: x.name, spend: x.spend, purchases: x.purchases, revenue: x.revenue, cpa: x.cpa, roas: x.roas, ads: x.ads }; r.set_share = div(r.spend, x.spend); r.set_rank = k; }
  /* Fatigue: CPA by days since an ad first spent, over every ad-day in the window. */
  const { results: adDays } = await env.DB.prepare(`SELECT d.ad_id, d.date, d.spend, d.impressions, d.link_clicks, d.purchases FROM ad_daily d WHERE d.act_id IN ${metaOf(1)} AND d.date BETWEEN ?2 AND ?3 AND d.spend > 0`).bind(act, w.from, w.to).all();
  const { results: attrDays } = model === 'platform' ? { results: [] } : await env.DB.prepare(`SELECT ad_id, date, SUM(orders) ord FROM tw_ad_attr WHERE act_id = ?1 AND model = ?2 AND date BETWEEN ?3 AND ?4 AND (platform = 'meta' OR platform IS NULL) GROUP BY ad_id, date`).bind(act, model, w.from, w.to).all();
  const ordAt = {}; for (const r of attrDays || []) ordAt[`${r.ad_id}|${r.date}`] = r.ord;
  const firstOf = Object.fromEntries(rows.map(r => [r.id, r.first_spend]));
  const BUCKETS = [[0, 3, 'Days 0-3'], [4, 7, 'Days 4-7'], [8, 14, 'Week 2'], [15, 21, 'Week 3'], [22, 30, 'Week 4'], [31, 60, 'Month 2'], [61, 9999, 'Older']];
  const fat = BUCKETS.map(([lo, hi, label]) => ({ label, lo, hi, spend: 0, orders: 0, impr: 0, clicks: 0, ads: new Set() }));
  for (const r of adDays || []) {
    const f = firstOf[r.ad_id]; if (!f) continue;
    const age = Math.round((Date.parse(r.date) - Date.parse(f)) / 864e5); const b = fat.find(x => age >= x.lo && age <= x.hi); if (!b) continue;
    b.spend += num(r.spend); b.orders += model === 'platform' ? num(r.purchases) : num(ordAt[`${r.ad_id}|${r.date}`]); b.impr += num(r.impressions); b.clicks += num(r.link_clicks); b.ads.add(r.ad_id);
  }
  const fatigue = fat.map(b => ({ label: b.label, spend: b.spend, orders: b.orders, cpa: div(b.spend, b.orders), ctr: div(b.clicks, b.impr), ads: b.ads.size }));
  /* Launch cadence, 12 weeks: new ads per week and the share of spend on ads under 14 days old. */
  const from12 = new Date(Date.parse(w.to) - 83 * 864e5).toISOString().slice(0, 10);
  const { results: wk } = await env.DB.prepare(`SELECT d.ad_id, d.date, d.spend FROM ad_daily d WHERE d.act_id IN ${metaOf(1)} AND d.date BETWEEN ?2 AND ?3 AND d.spend > 0`).bind(act, from12, w.to).all();
  const { results: firsts } = await env.DB.prepare(`SELECT ad_id, first_spend_date, created_time FROM ads WHERE act_id IN ${metaOf(1)}`).bind(act).all();
  const fs = Object.fromEntries((firsts || []).map(r => [r.ad_id, r.first_spend_date || (r.created_time || '').slice(0, 10)]));
  const weeks = Array.from({ length: 12 }, (_, i) => { const s = new Date(Date.parse(from12) + i * 7 * 864e5).toISOString().slice(0, 10); return { week: s, launched: 0, spend: 0, fresh: 0 }; });
  const wIdx = d => Math.min(11, Math.floor((Date.parse(d) - Date.parse(from12)) / (7 * 864e5)));
  for (const [id, f] of Object.entries(fs)) if (f && f >= from12 && f <= w.to) weeks[wIdx(f)].launched++;
  for (const r of wk || []) { const i = wIdx(r.date); if (i < 0) continue; weeks[i].spend += num(r.spend); const f = fs[r.ad_id]; if (f && (Date.parse(r.date) - Date.parse(f)) / 864e5 < 14) weeks[i].fresh += num(r.spend); }
  /* Rollups by format, angle and media type. */
  const roll = key => { const by = {}; for (const r of rows) { const k = r[key] || 'Untagged'; const b = by[k] ||= { key: k, ads: 0, spend: 0, revenue: 0, purchases: 0, impr: 0, clicks: 0, v3: 0 }; b.ads++; b.spend += r.spend; b.revenue += r.revenue; b.purchases += r.purchases; b.impr += r.impressions; b.clicks += r.clicks; b.v3 += (r.hook || 0) * r.impressions; }
    return Object.values(by).map(b => ({ ...b, roas: div(b.revenue, b.spend), cpa: div(b.spend, b.purchases), ctr: div(b.clicks, b.impr), hook: b.v3 ? div(b.v3, b.impr) : null })).sort((x, y) => y.spend - x.spend); };
  return { act_id: act, name: a.name, currency: a.currency, goals: { cpa: a.target_cpa ?? null, roas: a.target_roas ?? null }, ads: rows.slice(0, 400), fatigue, weeks: weeks.map(x => ({ ...x, fresh_share: div(x.fresh, x.spend) })),
    by_format: roll('format'), by_angle: roll('angle'), by_type: roll('media_type') };
}

async function ltvByAd(env, act, asOf) {
  const { results } = await env.DB.prepare(`WITH firsts AS (SELECT customer_id, MIN(date) fd FROM tw_orders WHERE act_id = ?1 AND customer_id IS NOT NULL GROUP BY customer_id),
    fo AS (SELECT o.order_id, o.customer_id, o.date fd, o.total ft FROM tw_orders o JOIN firsts f ON f.customer_id = o.customer_id AND f.fd = o.date WHERE o.act_id = ?1 AND o.date <= date(?2, '-90 day')),
    acq AS (SELECT DISTINCT t.ad_id, fo.customer_id, fo.fd, fo.ft FROM tw_order_touch t JOIN fo ON fo.order_id = t.order_id WHERE t.act_id = ?1 AND t.model = 'fullFirstClick' AND (t.platform = 'meta' OR t.platform IS NULL)),
    val AS (SELECT a.ad_id, a.customer_id, a.ft, (SELECT SUM(o.total) FROM tw_orders o WHERE o.act_id = ?1 AND o.customer_id = a.customer_id AND o.date >= a.fd AND o.date <= date(a.fd, '+90 day')) v90 FROM acq a)
    SELECT ad_id, COUNT(*) n, SUM(ft) first, SUM(v90) v90 FROM val GROUP BY ad_id`).bind(act, asOf).all();
  return Object.fromEntries((results || []).map(r => [r.ad_id, { n: r.n, first: r.first || 0, v90: r.v90 || 0 }]));
}

/* ---------- Store ---------- */
const STORE_IDS = ['totalNewGrossSales', 'totalSales', 'netSales', 'totalRefunds', 'totalTaxes', 'totalNetTaxes', 'totalShippingPrice', 'totalOrders', 'totalOrdersCombinedItemsQuantity', 'newCustomersOrders', 'newCustomerSales', 'rcRevenue',
  'klaviyoPlacedOrderSales', 'totalAmazonSales', 'totalAmazonOrders', 'amazonNetSales', 'totalAmazonFees', 'totalAmazonRefunds', 'totalTiktokShopsSales', 'totalTiktokShopsOrders', 'totalTiktokShopsNetSales', 'totalTiktokShopsRefunds', 'totalTiktokShopsFees',
  'pixelCostPerSession', 'pixelCostPerAtc', 'pixelPurchases', 'blendedAds'];
function storeRoll(piv, from, to, add) {
  const s = id => sumM(piv, id, from, to);
  const gross = s('totalNewGrossSales'), order = s('totalSales'), net = s('netSales'), taxes = s('totalTaxes'), netTax = s('totalNetTaxes'), ship = s('totalShippingPrice');
  const discounts = gross != null && order != null ? Math.max(0, gross + (ship || 0) + (taxes || 0) - order) : null;
  const returns = order != null && net != null ? Math.max(0, order - net - ((taxes || 0) - (netTax || 0))) : null;
  const revenue = net != null ? net - (netTax || 0) : null;
  const orders = s('totalOrders'), newO = s('newCustomersOrders');
  const newShare = (() => { const n = s('newCustomerSales'), r = s('rcRevenue'); return n != null && r != null && n + r > 0 ? n / (n + r) : null; })();
  /* Sessions and carts are derived from Triple Whale's daily cost-per figures and blended spend. */
  let sessions = 0, carts = 0, any = false;
  for (const d of dates(from, to, add)) { const sp = piv.blendedAds?.[d], cps = piv.pixelCostPerSession?.[d], cpa = piv.pixelCostPerAtc?.[d]; if (sp && cps) { sessions += sp / cps; any = true; } if (sp && cpa) carts += sp / cpa; }
  return { gross, discounts, returns, shipping: ship, taxes: netTax, revenue, orders, units: s('totalOrdersCombinedItemsQuantity'), aov: div(revenue ?? 0, orders), upo: div(s('totalOrdersCombinedItemsQuantity') ?? 0, orders),
    new_orders: newO, returning_orders: orders != null && newO != null ? orders - newO : null, new_share: newShare,
    new_revenue: revenue != null && newShare != null ? revenue * newShare : null, returning_revenue: revenue != null && newShare != null ? revenue * (1 - newShare) : null,
    email: s('klaviyoPlacedOrderSales'), sessions: any ? sessions : null, carts: any ? carts : null, conversion: any && sessions ? div(orders ?? 0, sessions) : null,
    amazon: { sales: s('totalAmazonSales'), orders: s('totalAmazonOrders'), net: s('amazonNetSales'), fees: s('totalAmazonFees'), refunds: s('totalAmazonRefunds') },
    tiktok_shop: { sales: s('totalTiktokShopsSales'), orders: s('totalTiktokShopsOrders'), net: s('totalTiktokShopsNetSales'), fees: s('totalTiktokShopsFees'), refunds: s('totalTiktokShopsRefunds') } };
}
async function storeBrand(env, ctx, a, w, piv) {
  const cur = storeRoll(piv, w.from, w.to, ctx.addDays), prev = w.pf ? storeRoll(piv, w.pf, w.pt, ctx.addDays) : null;
  const series = dates(w.from, w.to, ctx.addDays).map(d => { const r = storeRoll(piv, d, d, ctx.addDays); return { date: d, revenue: r.revenue, orders: r.orders, aov: r.aov, new_share: r.new_share, discounts: r.discounts, sessions: r.sessions, conversion: r.conversion }; });
  const prev_series = w.pf ? dates(w.pf, w.pt, ctx.addDays).map(d => { const r = storeRoll(piv, d, d, ctx.addDays); return { date: d, revenue: r.revenue, orders: r.orders }; }) : [];
  /* What sells first: products in first carts in the window (tw_orders), titled. */
  const { results: ords } = await env.DB.prepare(`SELECT products_json, total FROM tw_orders WHERE act_id = ?1 AND date BETWEEN ?2 AND ?3 AND products_json IS NOT NULL`).bind(a.act_id, w.from, w.to).all().catch(() => ({ results: [] }));
  const pc = {};
  for (const o of ords || []) { let p = []; try { p = JSON.parse(o.products_json); } catch {} for (const id of p.slice(0, 3)) { const b = pc[id] ||= { id, orders: 0, revenue: 0 }; b.orders++; b.revenue += num(o.total) / Math.max(1, Math.min(3, p.length)); } }
  const top = Object.values(pc).sort((x, y) => y.orders - x.orders).slice(0, 12);
  const titles = await ctx.productTitles(a, top.map(t => t.id)).catch(() => ({}));
  return { act_id: a.act_id, name: a.name, currency: a.currency, cur, prev, series, prev_series, products: top.map(t => ({ ...t, title: titles[t.id] || `Product ${t.id}` })), product_orders: (ords || []).length };
}

/* ---------- Email ---------- */
const EMAIL_IDS = ['klaviyoPlacedOrderSales', 'totalKlaviyoPlacedOrderTotalPriceCampaigns', 'totalKlaviyoPlacedOrderTotalPriceFlows', 'totalKlaviyoClickedEmail', 'totalKlaviyoClickedSms', 'netSales', 'totalNetTaxes'];
function emailFrom(ctx, a, w, piv) {
  const roll = (from, to) => { const s = id => sumM(piv, id, from, to); const rev = (s('netSales') ?? 0) - (s('totalNetTaxes') ?? 0);
    return { email: s('klaviyoPlacedOrderSales'), campaigns: s('totalKlaviyoPlacedOrderTotalPriceCampaigns'), flows: s('totalKlaviyoPlacedOrderTotalPriceFlows'), email_clicks: s('totalKlaviyoClickedEmail'), sms_clicks: s('totalKlaviyoClickedSms'), revenue: rev, share: rev ? div(s('klaviyoPlacedOrderSales') ?? 0, rev) : null }; };
  const series = dates(w.from, w.to, ctx.addDays).map(d => ({ date: d, campaigns: num(piv.totalKlaviyoPlacedOrderTotalPriceCampaigns?.[d]), flows: num(piv.totalKlaviyoPlacedOrderTotalPriceFlows?.[d]), email: num(piv.klaviyoPlacedOrderSales?.[d]) }));
  return { act_id: a.act_id, name: a.name, currency: a.currency, cur: roll(w.from, w.to), prev: w.pf ? roll(w.pf, w.pt) : null, series };
}

/* ---------- Drill: the orders behind a cell, and one customer's journey ---------- */
async function ordersFor(env, a, w, model, url) {
  const m = TOUCH_FALLBACK[model] || model;
  const ad = url.searchParams.get('ad'), adset = url.searchParams.get('adset'), campaign = url.searchParams.get('campaign'), platform = url.searchParams.get('platform');
  let filter = '', bind = [a.act_id, m, w.from, w.to];
  if (ad) { filter = 'AND t.ad_id = ?5'; bind.push(ad); }
  else if (adset) { filter = 'AND t.ad_id IN (SELECT ad_id FROM ads WHERE adset_id = ?5)'; bind.push(adset); }
  else if (campaign) { filter = 'AND t.ad_id IN (SELECT ad_id FROM ads WHERE campaign_id = ?5)'; bind.push(campaign); }
  else if (platform) { filter = 'AND t.platform = ?5'; bind.push(platform); }
  const { results } = await env.DB.prepare(`SELECT t.order_id, t.date, t.ad_id, t.weight, t.click_date, o.total, o.customer_id, o.products_json, x.name ad_name,
      (SELECT COUNT(*) FROM tw_orders p WHERE p.act_id = o.act_id AND p.customer_id = o.customer_id AND p.date < o.date) prior
    FROM tw_order_touch t LEFT JOIN tw_orders o ON o.act_id = t.act_id AND o.order_id = t.order_id LEFT JOIN ads x ON x.ad_id = t.ad_id
    WHERE t.act_id = ?1 AND t.model = ?2 AND t.date BETWEEN ?3 AND ?4 ${filter} ORDER BY t.date DESC LIMIT 300`).bind(...bind).all().catch(e => ({ results: [], error: e.message }));
  const byOrder = {};
  for (const r of results || []) { const o = byOrder[r.order_id] ||= { order_id: r.order_id, date: r.date, total: num(r.total), customer_id: r.customer_id, new: r.customer_id ? !r.prior : null, ads: [], click_date: r.click_date }; o.ads.push(r.ad_name || r.ad_id); }
  const list = Object.values(byOrder);
  return { model_used: m, note: m !== model ? `Orders are listed under ${MODEL_LABEL[m]}; ${MODEL_LABEL[model]} keeps no per-order list.` : null, orders: list,
    total: list.reduce((s, o) => s + o.total, 0), new_customers: list.filter(o => o.new).length };
}
async function customerFor(env, a, customer) {
  if (!customer) return { error: 'customer required' };
  const { results: orders } = await env.DB.prepare(`SELECT order_id, date, total, source, products_json FROM tw_orders WHERE act_id = ?1 AND customer_id = ?2 ORDER BY date`).bind(a.act_id, customer).all();
  const ids = (orders || []).map(o => o.order_id);
  const { results: touches } = ids.length ? await env.DB.prepare(`SELECT t.order_id, t.model, t.platform, t.click_date, x.name ad_name FROM tw_order_touch t LEFT JOIN ads x ON x.ad_id = t.ad_id WHERE t.act_id = ?1 AND t.order_id IN (${ids.map((_, i) => `?${i + 2}`).join(',')})`).bind(a.act_id, ...ids).all() : { results: [] };
  return { customer, orders: (orders || []).map(o => ({ ...o, touches: (touches || []).filter(t => t.order_id === o.order_id) })), lifetime: (orders || []).reduce((s, o) => s + num(o.total), 0) };
}

/* ---------- stock against ad spend (2026-10-08, Supply in Locus) ----------
   Which products each Meta ad actually sells, from Triple Whale orders, never from ad names
   (Lucky's are "414 B | Still" and creator names). For every ad: its last-platform-click orders
   in the last 30 days (tw_order_touch) -> the Shopify product ids in those orders
   (tw_orders.products_json, the same ids Supply uses) -> the ad's 30-day spend shared across
   them. On Lucky this ties ~80% of spend to a product. Read by Store > Stock, the stock chip
   on ad sets and ads, and the Strategist's stock view (account-health copies this function:
   keep the two in step). */
async function stockAds(env, ctx, a) {
  const today = ctx.localDate(a.tz), from = ctx.addDays(today, -30), from7 = ctx.addDays(today, -7);
  const [touch, spend, sets] = await Promise.all([
    env.DB.prepare(`SELECT t.ad_id, o.products_json FROM tw_order_touch t JOIN tw_orders o ON o.act_id = t.act_id AND o.order_id = t.order_id
      WHERE t.act_id = ?1 AND t.model = 'lastPlatformClick' AND t.date >= ?2`).bind(a.act_id, from).all().then(r => r.results || []).catch(() => []),
    env.DB.prepare(`SELECT d.ad_id, a.adset_id, SUM(d.spend) s30, SUM(CASE WHEN d.date >= ?3 THEN d.spend ELSE 0 END) s7
      FROM ad_daily d LEFT JOIN ads a ON a.ad_id = d.ad_id WHERE d.act_id IN ${metaOf(1)} AND d.date >= ?2 GROUP BY d.ad_id`).bind(a.act_id, from, from7).all().then(r => r.results || []).catch(() => []),
    env.DB.prepare(`SELECT adset_id, name FROM meta_adsets WHERE act_id IN ${metaOf(1)}`).bind(a.act_id).all().then(r => r.results || []).catch(() => []),
  ]);
  const ordersOf = new Map();
  for (const t of touch) {
    let ps = []; try { ps = [...new Set(JSON.parse(t.products_json || '[]').map(String))]; } catch {}
    if (!ps.length) continue;
    if (!ordersOf.has(t.ad_id)) ordersOf.set(t.ad_id, []);
    ordersOf.get(t.ad_id).push(ps);
  }
  const products = {}, ads = {}, setAgg = {};
  const setName = Object.fromEntries(sets.map(s => [s.adset_id, s.name]));
  let total = 0, mapped = 0;
  for (const s of spend) {
    const s30 = num(s.s30); total += s30;
    const ords = ordersOf.get(s.ad_id) || [];
    const cnt = {};
    for (const ps of ords) for (const p of ps) {
      cnt[p] = (cnt[p] || 0) + 1;
      const x = products[p] || (products[p] = { spend: 0, orders: 0, ads: 0 });
      x.spend += s30 / ords.length / ps.length; x.orders += 1;
    }
    for (const p of Object.keys(cnt)) products[p].ads += 1;
    if (ords.length) mapped += s30;
    const top = Object.entries(cnt).sort((x, y) => y[1] - x[1]);
    if (top.length) ads[s.ad_id] = top.slice(0, 2).map(([p, n]) => [p, n]);
    if (s.adset_id) {
      const g = setAgg[s.adset_id] || (setAgg[s.adset_id] = { adset_id: s.adset_id, name: setName[s.adset_id] || null, s7: 0, s30: 0, cnt: {} });
      g.s7 += num(s.s7); g.s30 += s30;
      for (const [p, n] of Object.entries(cnt)) g.cnt[p] = (g.cnt[p] || 0) + n;
    }
  }
  for (const p of Object.values(products)) p.spend = Math.round(p.spend * 100) / 100;
  const adsets = Object.values(setAgg).filter(g => g.s30 > 0).map(g => ({ adset_id: g.adset_id, name: g.name, s7: Math.round(g.s7 * 100) / 100, s30: Math.round(g.s30 * 100) / 100,
    products: Object.entries(g.cnt).sort((x, y) => y[1] - x[1]).slice(0, 3) })).sort((x, y) => y.s30 - x.s30);
  return { act_id: a.act_id, name: a.name, from, to: today, model: 'lastPlatformClick', spend: Math.round(total), mapped: Math.round(mapped), products, ads, adsets };
}

/* ---------- the data behind a tile (2026-10-09, Cole: "what Triple Whale does: the DATA behind the number") ----------
   Clicking a headline tile on Home, Ads, Store or P&L opens a drill-down: the number, its day line and a breakdown
   for that metric. ONE route feeds every metric so the panel switches instantly between them (cached in the page).
   Everything comes from what Locus already computes, grouped across brands:
     - the store money per day through the host's `dayEconomics` + `totals` (same revenue, CM and margin override
       as /api/overview, so the panel's number matches the tile's);
     - spend, credited revenue, purchases and first orders per platform from `allChannelsMany` (All channels);
     - Klaviyo campaigns vs flows from the same tw_daily pivot;
     - top products (one brand) from `storeMany`;
     - custom expenses (expenses.js, 2026-10-10): the ones marked "counts as ad spend" join each day's spend before the
       totals (so spend, MER, CAC and CM match /api/overview); the rest are the Net profit line under CM.
   A client sees the same answer through brandguard: `profit` (costs, CM, fixed) is scrubbed unless P&L is on.
   Today is served live elsewhere (twDay); tw_daily never holds it, so a Today window has no breakdown here. */
const ECON_IDS = ['netSales', 'totalSales', 'totalNetTaxes', 'totalShippingPrice', 'totalShippingCosts', 'totalHandlingFees', 'ga_adCost', 'blendedAds',
  'newCustomerSales', 'rcRevenue', 'totalProductCosts', 'totalPaymentGatewayCosts', 'totalOrders', 'newCustomersOrders', 'klaviyoPlacedOrderSales',
  'totalKlaviyoPlacedOrderTotalPriceCampaigns', 'totalKlaviyoPlacedOrderTotalPriceFlows'];
async function drillMany(env, ctx, accts, w, model) {
  const acts = accts.map(a => a.act_id), lo = w.pf && w.pf < w.from ? w.pf : w.from;
  const [chs, sts, pivs, metaRows, health, exps] = await Promise.all([
    allChannelsMany(env, ctx, accts, w, model).catch(() => accts.map(() => null)),
    accts.length === 1 ? storeMany(env, ctx, accts, w).catch(() => [null]) : Promise.resolve([]),
    twPivotMany(env, acts, lo, w.to, ECON_IDS),
    env.DB.prepare(`SELECT c.brand_id act_id, d.date, SUM(d.spend) spend FROM daily_insights d JOIN connections c ON c.kind = 'meta' AND c.external_id = d.act_id
      WHERE c.brand_id IN (${inList(acts.length, 3)}) AND d.date BETWEEN ?1 AND ?2 GROUP BY c.brand_id, d.date`).bind(lo, w.to, ...acts).all().then(r => r.results || []).catch(() => []),
    env.DB.prepare(`SELECT act_id, verdict FROM p_cost_health WHERE act_id IN (${inList(acts.length)})`).bind(...acts).all().then(r => r.results || []).catch(() => []),
    ctx.loadExpenses(env, acts).catch(() => ({})),
  ]);
  const metaBy = {}; for (const r of metaRows) (metaBy[r.act_id] ??= {})[r.date] = { spend: r.spend };
  const verdict = Object.fromEntries(health.map(r => [r.act_id, r.verdict]));
  const MONEY = ['sales', 'net_sales', 'ship_rev', 'tax', 'cogs', 'ship_cost', 'handling', 'fees', 'gross_profit', 'spend', 'cm'];
  return accts.map((a, i) => {
    const piv = pivs[a.act_id] || {}, meta = metaBy[a.act_id] || {}, mp = ctx.marginOverride(a, ctx.monthOf(w.to));
    const exp = exps[a.act_id] || [];
    /* each window's day rows with its "counts as ad spend" expenses already inside spend, and the spread itself */
    const rowsOf = (f, t) => { if (!f) return [[], ctx.spread([], f, t, [])]; const r = dates(f, t, ctx.addDays).map(d => ctx.econ(piv, meta, d, mp)).filter(Boolean);
      const sp = ctx.spread(exp, f, t, r); ctx.applyAdSpend(r, sp.adByDate); return [r, sp]; };
    const [rows, fc] = rowsOf(w.from, w.to), [prows, fp] = rowsOf(w.pf, w.pt);
    const T = ctx.totals(rows), P = prows.length ? ctx.totals(prows) : null;
    const em = (f, t) => ({ campaigns: sumM(piv, 'totalKlaviyoPlacedOrderTotalPriceCampaigns', f, t), flows: sumM(piv, 'totalKlaviyoPlacedOrderTotalPriceFlows', f, t) });
    const head = (x, f, t) => x && { sales: x.sales, spend: x.spend, orders: x.orders, new_orders: x.new_orders, new_rev: x.new_rev, ret_rev: x.ret_rev, aov: x.aov, new_aov: x.new_aov,
      cac: x.cac, mer: x.mer, amer: x.amer, email_rev: x.email_rev, ad_expense: x.ad_expense, ...em(f, t) };
    const money = (x, fx) => { if (!x) return null; const o = Object.fromEntries(MONEY.map(k => [k, x[k] ?? null])); o.ad_expense = x.ad_expense ?? null; o.fixed = fx; o.net = x.cm != null ? x.cm - fx : null; return o; };
    const ch = chs[i] || null, st = sts[0] || null;
    const day = r => ({ date: r.date, sales: r.sales, spend: r.spend, orders: r.orders, new_orders: r.new_orders, new_rev: r.new_rev, email_rev: r.email_rev,
      campaigns: piv.totalKlaviyoPlacedOrderTotalPriceCampaigns?.[r.date] ?? null, flows: piv.totalKlaviyoPlacedOrderTotalPriceFlows?.[r.date] ?? null });
    const spendBy = Object.fromEntries((ch?.series || []).map(x => [x.date, x]));
    return {
      act_id: a.act_id, name: a.name, currency: a.currency, margin_pct: mp, cost_verdict: verdict[a.act_id] || null,
      cur: head(T, w.from, w.to), prev: head(P, w.pf, w.pt),
      series: rows.map(r => ({ ...day(r), meta: spendBy[r.date]?.meta ?? null, google: spendBy[r.date]?.google ?? null, tiktok: spendBy[r.date]?.tiktok ?? null })),
      prev_series: prows.map(day),
      channels: ch ? ch.rows.map(r => ({ id: r.id, label: r.label, spend: r.spend, prev_spend: r.prev_spend, revenue: r.revenue, prev_revenue: r.prev_revenue, purchases: r.purchases, nc: r.nc })) : [],
      paid: ch?.paid || null, prev_paid: ch?.prev_paid || null,
      products: st && st.products ? st.products.slice(0, 8) : [],
      ad_items: fc.ad_items,
      profit: { cur: money(T, fc.total), prev: money(P, fp.total), fixed_items: fc.items, ad_items: fc.ad_items,
        series: rows.map(r => ({ date: r.date, cm: r.cm, fixed: fc.byDate[r.date] || 0 })), prev_series: prows.map(r => ({ date: r.date, cm: r.cm })) },
    };
  });
}

/* ---------- THE COMMAND CENTER (2026-10-09): why each brand needs attention ----------
   Home for "All clients" (profit/command.js). Every signal is read from data Locus already has, on FIXED
   windows ending yesterday (so the reasons do not move with the period picker), and each comes back as a
   reason {sev bad|warn|info, kind, text, go (the Locus page that shows it)}:
   - GOAL: blended cost per paid order (all ad spend / paid orders, the same CPA the alerts use) against the
     brand's goal CPA, or MER against the month's plan (sales / spend) or target ROAS when there is no goal
     CPA. Judged on a rolling 3 days so one slow day is not a streak; "off" = 10%+ the wrong side of goal.
     The streak is the run of off days ending yesterday (only days with spend count). 3+ days = warn, 7+ = bad.
   - CADENCE: days since the last new Meta ad (ads.created_time over every Meta account of the brand), only for
     a brand spending $100+ on Meta in the last 7 days. 10+ days = warn, 21+ = bad.
   - FATIGUE: Meta link CTR, hook (3s views / impressions) and frequency (impressions / reach per day), the last
     7 days against the 14 before (daily_insights). Flagged when 2 of the 3 moved the wrong way by 15%+ on
     $300+ of Meta spend in the 7 days.
   - DAY CHECK: yesterdayMany's verdict for yesterday, and the bad days in the last 7.
   - SETUP: no Triple Whale shop, no Meta account, no goals, no Asana project.
   Paused and test brands (SKIP_HUB) come back `paused` with no reasons: never flag them (Cole's rule).
   Asana, pending new clients and alerts live on account-health (/api/command/work); the AI read is /api/read. */
function monthGoals(goals, ym) {
  const g = goals && typeof goals === 'object' ? goals : {};
  if (g[ym]) return g[ym];
  const prior = Object.keys(g).filter(k => /^\d{4}-\d{2}$/.test(k) && k < ym).sort().pop();
  return prior ? g[prior] || {} : g.default || {};
}
async function commandMany(env, ctx, accts) {
  const as_of = new Date().toISOString();
  if (!accts.length) return { as_of, brands: [] };
  const y = ctx.addDays(ctx.localDate(accts[0].tz), -1);
  const live = accts.filter(a => !SKIP_HUB.test(a.name || ''));
  const acts = live.map(a => a.act_id);
  const none = { results: [] };
  let piv = {}, adQ = none, fatQ = none, conQ = none, docQ = none, yd = null;
  if (acts.length) {
    const IN1 = inList(acts.length, 1), IN3 = inList(acts.length, 3);
    [piv, adQ, fatQ, conQ, docQ, yd] = await Promise.all([
      twPivotMany(env, acts, ctx.addDays(y, -22), y, ['totalSales', 'totalNetTaxes', 'blendedAds', 'totalOrders']),
      env.DB.prepare(`SELECT c.brand_id act_id, MAX(substr(x.created_time, 1, 10)) last_ad, SUM(CASE WHEN substr(x.created_time, 1, 10) >= ?2 THEN 1 ELSE 0 END) new14
        FROM ads x JOIN connections c ON c.kind = 'meta' AND c.external_id = x.act_id WHERE c.brand_id IN (${IN3}) AND x.created_time IS NOT NULL AND substr(x.created_time, 1, 10) <= ?1 GROUP BY c.brand_id`).bind(y, ctx.addDays(y, -13), ...acts).all().catch(() => none),
      env.DB.prepare(`SELECT c.brand_id act_id, d.date, SUM(d.spend) spend, SUM(d.impressions) impr, SUM(d.reach) reach, SUM(d.link_clicks) clicks, SUM(d.video_views) v3
        FROM daily_insights d JOIN connections c ON c.kind = 'meta' AND c.external_id = d.act_id WHERE c.brand_id IN (${IN3}) AND d.date BETWEEN ?1 AND ?2 GROUP BY c.brand_id, d.date`).bind(ctx.addDays(y, -20), y, ...acts).all().catch(() => none),
      env.DB.prepare(`SELECT brand_id, kind FROM connections WHERE brand_id IN (${IN1})`).bind(...acts).all().catch(() => none),
      env.DB.prepare(`SELECT act_id, data_json FROM p_br_doc WHERE act_id IN (${IN1}) AND line_id = '' AND key = 'rules'`).bind(...acts).all().catch(() => none),
      yesterdayMany(env, ctx, live, true).catch(() => null),
    ]);
  }
  const AD = Object.fromEntries((adQ.results || []).map(r => [r.act_id, r]));
  const FT = {}; for (const r of fatQ.results || []) (FT[r.act_id] ??= {})[r.date] = r;
  const KINDS = {}; for (const r of conQ.results || []) (KINDS[r.brand_id] ??= new Set()).add(r.kind);
  const DOC = {}; for (const r of docQ.results || []) { try { DOC[r.act_id] = JSON.parse(r.data_json || 'null'); } catch {} }
  const YD = Object.fromEntries(((yd && yd.brands) || []).map(b => [b.act_id, b]));
  const days = dates(ctx.addDays(y, -13), y, ctx.addDays);
  const out = [];
  for (const a of accts) {
    const base = { act_id: a.act_id, name: a.name, currency: a.currency };
    if (SKIP_HUB.test(a.name || '')) { out.push({ ...base, paused: true, reasons: [] }); continue; }
    const reasons = [], add = (sev, kind, text, go, extra) => reasons.push({ sev, kind, text, go, ...(extra || {}) });
    const $ = moneyOf(a.currency || 'USD');
    /* GOAL */
    const P = piv[a.act_id] || {}, val = (k, d) => num(P[k] && P[k][d]);
    const roll = (d, n) => { const r = { rev: 0, sp: 0, o: 0 }; for (let i = 0; i < n; i++) { const x = ctx.addDays(d, -i); r.rev += val('totalSales', x) - val('totalNetTaxes', x); r.sp += val('blendedAds', x); r.o += val('totalOrders', x); } return r; };
    const rules = rulesFor(a, DOC[a.act_id]);
    const mg = monthGoals(a.goals, y.slice(0, 7));
    const goalCpa = rules.target_cpa || null;
    const goalMer = mg.sales > 0 && mg.spend > 0 ? mg.sales / mg.spend : a.target_roas > 0 ? +a.target_roas : null;
    const goal = goalCpa ? { kind: 'cpa', target: goalCpa } : goalMer ? { kind: 'mer', target: goalMer } : null;
    if (goal) {
      const w7 = roll(y, 7);
      goal.value7 = goal.kind === 'cpa' ? (w7.o ? w7.sp / w7.o : null) : (w7.sp ? w7.rev / w7.sp : null);
      let streak = 0;
      for (let i = days.length - 1; i >= 0; i--) {
        const r = roll(days[i], 3); if (!(r.sp > 0)) break;
        const v = goal.kind === 'cpa' ? (r.o ? r.sp / r.o : Infinity) : r.rev / r.sp;
        if (!(goal.kind === 'cpa' ? v > goal.target * 1.1 : v < goal.target * 0.9)) break;
        streak++;
      }
      goal.off_days = streak;
      const fmt = v => goal.kind === 'cpa' ? $(v) : `${(+v).toFixed(2)}x`;
      if (streak >= 3 && goal.value7 != null) add(streak >= 7 ? 'bad' : 'warn', 'goal',
        `${goal.kind === 'cpa' ? 'CPA' : 'MER'} ${fmt(goal.value7)} vs ${fmt(goal.target)} goal over 7 days, off goal ${streak >= days.length ? `${streak}+` : streak} days running`, 'overview', { days: streak });
    }
    /* CADENCE */
    const F = FT[a.act_id] || {};
    const sum = (r, k) => { let s = 0; for (const d in F) if (d >= r.from && d <= r.to) s += num(F[d][k]); return s; };
    const w = { from: ctx.addDays(y, -6), to: y }, b = { from: ctx.addDays(y, -20), to: ctx.addDays(y, -7) };
    const metaSpend7 = sum(w, 'spend');
    const ad = AD[a.act_id];
    const cadence = ad && ad.last_ad ? { last_ad: ad.last_ad, days_since: Math.round((Date.parse(y) - Date.parse(ad.last_ad)) / 864e5), new_14: num(ad.new14) } : null;
    if (cadence && metaSpend7 >= 100 && cadence.days_since >= 10) add(cadence.days_since >= 21 ? 'bad' : 'warn', 'cadence', `No new Meta ad in ${cadence.days_since} days (last one ${cadence.last_ad})`, 'adcreative', { days: cadence.days_since });
    /* FATIGUE */
    const rate = (r, k, d) => { const n = sum(r, k), q = sum(r, d); return q ? n / q : null; };
    const freq = r => { let s = 0, n = 0; for (const d in F) if (d >= r.from && d <= r.to && num(F[d].reach) > 0) { s += num(F[d].impr) / num(F[d].reach); n++; } return n ? s / n : null; };
    const ch = (x, p) => (x != null && p ? x / p - 1 : null);
    const fat = { spend7: Math.round(metaSpend7), ctr: rate(w, 'clicks', 'impr'), ctr_prev: rate(b, 'clicks', 'impr'), hook: rate(w, 'v3', 'impr'), hook_prev: rate(b, 'v3', 'impr'), freq: freq(w), freq_prev: freq(b) };
    fat.ctr_change = ch(fat.ctr, fat.ctr_prev); fat.hook_change = ch(fat.hook, fat.hook_prev); fat.freq_change = ch(fat.freq, fat.freq_prev);
    const signs = [];
    if (fat.ctr_change != null && fat.ctr_change <= -0.15) signs.push(`CTR down ${Math.round(-fat.ctr_change * 100)}%`);
    if (fat.hook_change != null && fat.hook_change <= -0.15 && fat.hook_prev > 0.02) signs.push(`hook rate down ${Math.round(-fat.hook_change * 100)}%`);
    if (fat.freq_change != null && fat.freq_change >= 0.15) signs.push(`frequency up ${Math.round(fat.freq_change * 100)}%`);
    fat.signs = signs;
    if (metaSpend7 >= 300 && signs.length >= 2) add(signs.length >= 3 ? 'bad' : 'warn', 'fatigue', `Creative fatigue on Meta: ${signs.join(', ')} (last 7 days vs the 14 before)`, 'adcreative');
    /* DAY CHECK */
    const yb = YD[a.act_id];
    let daycheck = null;
    if (yb && yb.cells && yb.cells.length) {
      const last = yb.cells[yb.cells.length - 1], wk = yb.cells.slice(-7);
      daycheck = { date: last.date, verdict: last.verdict, moved: (last.moved || []).filter(m => m.bad).map(m => m.label), bad7: wk.filter(c => c.verdict === 'bad' || c.verdict === 'vbad').length };
      if (last.verdict === 'bad' || last.verdict === 'vbad') add(last.verdict === 'vbad' ? 'bad' : 'warn', 'daycheck', `Bad day yesterday${daycheck.moved.length ? `: ${daycheck.moved.join(', ').toLowerCase()} off its normal` : ''}`, 'yesterday');
      else if (daycheck.bad7 >= 3) add('warn', 'daycheck', `${daycheck.bad7} bad days in the last 7`, 'yesterday');
    }
    /* SETUP */
    const K = KINDS[a.act_id] || new Set();
    const gaps = [];
    if (!a.tw_shop && !K.has('triple_whale')) gaps.push(['No Triple Whale shop, so no store numbers', 'settings']);
    if (!K.has('meta')) gaps.push(['No Meta ad account connected', 'settings']);
    if (!goal && !(mg.sales > 0)) gaps.push(['No goals set (goal CPA or a monthly plan)', 'plan']);
    if (!K.has('asana')) gaps.push(['No Asana project linked', 'settings']);
    for (const [t, go] of gaps) add('info', 'setup', t, go);
    out.push({ ...base, goal, cadence, fatigue: fat, daycheck, gaps: gaps.map(g => g[0]), reasons });
  }
  return { as_of, yesterday: y, market: yd ? yd.market : null, brands: out };
}
