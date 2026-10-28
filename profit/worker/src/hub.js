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
import { rulesFor, goalOf } from './brand.js';
import { memo } from './memo.js';
/* Speed (2026-10-26): the buyer's list is built once for a page that asks for /api/hub/kept and /api/hub/today at the
   same moment (in-flight calls share, then 20 seconds), and the Agency view's command answer is kept 3 minutes. Keys
   are the exact brand list asked for, and a write clears both (memo.js). The answers are unchanged. */
const buyerListOnce = (env, ctx, accts) => memo(`bl|${accts.map(a => a.act_id).join(',')}`, 20e3, () => buyerList(env, ctx, accts));

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
    if (path === '/api/hub/ad-days') {
      const ids = String(url.searchParams.get('ads') || '').split(',').filter(x => /^\d{5,25}$/.test(x)).slice(0, 25);
      if (!ids.length) return json({ error: 'ads is required' }, 400);
      return json({ ...base, ...(await adDays(env, accts[0], ids, model)) });
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
      return json({ items: [...(cs || []).map(c => ({ kind: 'camp', id: c.campaign_id, label: c.name, act: c.act_id, act_id: c.act_id, brand: nm[c.act_id] })), ...(ads || []).map(a => ({ kind: 'ad', id: a.ad_id, label: a.name, act: a.act_id, act_id: a.act_id, brand: nm[a.act_id] }))] });
    }
    if (path === '/api/hub/moved') return json({ ...base, items: await movedMany(env, ctx, accts) });
    if (path === '/api/hub/command') return json(await memo(`cmd|${accts.map(a => a.act_id).join(',')}`, 180e3, () => commandMany(env, ctx, accts)));
    if (path === '/api/hub/stockads') return json({ brands: await Promise.all(accts.map(a => stockAds(env, ctx, a))) });
    if (path === '/api/hub/yesterday') return json(await yesterdayMany(env, ctx, accts.filter(a => !SKIP_HUB.test(a.name || '')), act === 'all'));
    if (path === '/api/hub/today' && url.searchParams.get('live') !== '1') return json(await buyerListOnce(env, ctx, accts.filter(a => !SKIP_HUB.test(a.name || ''))));
    /* The hero number and the morning line (2026-10-11): what each brand kept yesterday, with the bites. */
    if (path === '/api/hub/kept') return json(await keptMany(env, ctx, act === 'all' ? accts.filter(a => !SKIP_HUB.test(a.name || '')) : accts, { calls: url.searchParams.get('calls') !== '0' }));
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

/* ---------- Today: the media buyer's list (2026-10-09; AD CALLS v2 2026-10-15) ----------
   Meta only for now. Per brand, the 7 days ending on the latest day Triple Whale attribution has landed
   (tw_ad_attr, lastPlatformClick), so a window never ends on a half-attributed day; a set under 1 result a
   day is judged on 14 days instead (rules window_auto), because 7 days of a slow set cannot reach 3 sales.
   THE AD SET IS THE UNIT (Cole's doctrine). The rules are the brand's own (brand.js rulesFor; the approved
   page "Locus Ad Call Rules", 2026-10-15) and the SAME numbers v2.js creative() applies on Ads > Meta > Ads:
     the goal = the brand's metric (cost per sale, per new customer, per lead, or ROAS), and the UNIT is that
       goal in dollars (for ROAS: the brand's order value in the window / the goal ROAS);
     WAIT until the set has spent cr_judge_x units AND run cr_min_days (a good set shows 0 sales 1 time in 7 at 2x);
     SCALE at cr_scale_buys+ results on the main goal AND every guardrail met (2026-10-21);
     CUT past cr_cut_zero_x units with no result, or cr_cut_spend_x units at worse than cr_cut_cpa_x the goal, AND at least
       one guardrail broken (or none set);
     MIXED when the main goal and a guardrail disagree (main met with a guardrail broken, or past the cut line with every
       guardrail met): no button, one sentence on what disagrees. It replaces the old roas_guard silent keep;
     every set row carries `checks` (the numbers against goal / account) and `evidence {for, against}`; a Cut or Mixed row
       whose sales are 60%+ new customers with a click rate over the account median carries `funnel` (a tag, never a call);
     TRIM a small ad in a working set only on its OWN spend past the same line, never the main ad;
     REFRESH the main ad when its link CTR fell 20%+ AND its frequency rose (fatigue, not a slow week).
   A campaign's Meta objective decides what it is judged on: sales campaigns on the brand metric, lead
   campaigns on cost per lead (goal_cpl), awareness / engagement / traffic never on sales (Refresh only).
   Every call carries the money at stake; rows sort on it. */
const OFF_STATUS = /^(PAUSED|CAMPAIGN_PAUSED|ADSET_PAUSED|DELETED|ARCHIVED)$/;
const moneyOf = (cur) => v => (v == null ? '' : `${cur && cur !== 'USD' ? cur + ' ' : '$'}${Math.round(v).toLocaleString('en-US')}`);
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const OBJ_SALES = /^(OUTCOME_SALES|CONVERSIONS|PRODUCT_CATALOG_SALES|OUTCOME_APP_PROMOTION|APP_INSTALLS)$/;
const OBJ_LEADS = /^(OUTCOME_LEADS|LEAD_GENERATION)$/;
const objKind = o => !o || OBJ_SALES.test(o) ? 'sales' : OBJ_LEADS.test(o) ? 'leads' : 'reach';
const NOUN = { cpa: ['sale', 'sales'], roas: ['sale', 'sales'], ncpa: ['new customer', 'new customers'], cpl: ['lead', 'leads'] };
const COST = { cpa: 'cost per sale', roas: 'cost per sale', ncpa: 'cost per new customer', cpl: 'cost per lead' };
const cap = t => t[0].toUpperCase() + t.slice(1);
export async function buyerList(env, ctx, accts) {
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
  const RULES = Object.fromEntries(meta.map(a => [a.act_id, rulesFor(a, docOf[a.act_id] || null)]));
  const W = meta.filter(a => toOf[a.act_id]).map(a => { const t = toOf[a.act_id]; return { act: a.act_id, f: ctx.addDays(t, -6), t, l2: ctx.addDays(t, -1), pf: ctx.addDays(t, -13), pt: ctx.addDays(t, -7) }; });
  let adRows = [], attrRows = [], newRows = [], fcNewRows = [];
  if (W.length) {
    /* Two parameters a brand (D1 binds at most 100); the window edges are worked out in SQL. pf..t = 14 days. */
    const vals = W.map((_, i) => `(?${i * 2 + 3}, ?${i * 2 + 4})`).join(', ');
    const binds = W.flatMap(w => [w.act, w.t]);
    const lo = W.map(w => w.pf).sort()[0], hi = W.map(w => w.t).sort().pop();
    const CTE = `WITH w0(brand, t) AS (VALUES ${vals}), w AS (SELECT brand, t, date(t, '-6 day') f, date(t, '-1 day') l2, date(t, '-13 day') pf, date(t, '-7 day') pt FROM w0)`;
    /* New customers per ad for every brand (2026-10-21): the ncpa goal reads them, and so do the evidence and the
       "Feeds the funnel" tag on every row. */
    const wantNew = true;
    [adRows, attrRows, newRows, fcNewRows] = await Promise.all([
      env.DB.prepare(`${CTE} SELECT c.brand_id act_id, d.act_id meta_act, d.ad_id, x.name ad_name, x.adset_id, s.name set_name, s.status set_status, s.daily_budget, s.campaign_id, mc.objective,
          COALESCE(x.first_spend_date, substr(x.created_time, 1, 10)) first_spend,
          SUM(CASE WHEN d.date BETWEEN w.f AND w.t THEN d.spend ELSE 0 END) spend,
          SUM(d.spend) spend14,
          SUM(CASE WHEN d.date BETWEEN w.f AND w.t THEN d.impressions ELSE 0 END) impr,
          SUM(CASE WHEN d.date BETWEEN w.f AND w.t THEN d.reach ELSE 0 END) reach,
          SUM(CASE WHEN d.date BETWEEN w.f AND w.t THEN d.link_clicks ELSE 0 END) clicks,
          SUM(CASE WHEN d.date BETWEEN w.f AND w.t THEN COALESCE(d.video_3s, 0) ELSE 0 END) v3,
          SUM(CASE WHEN d.date BETWEEN w.f AND w.t THEN COALESCE(d.purchases, 0) ELSE 0 END) mp,
          SUM(CASE WHEN d.date BETWEEN w.f AND w.t THEN COALESCE(d.leads, 0) ELSE 0 END) leads,
          SUM(COALESCE(d.leads, 0)) leads14,
          SUM(CASE WHEN d.date BETWEEN w.l2 AND w.t THEN d.spend ELSE 0 END) s2,
          SUM(CASE WHEN d.date BETWEEN w.pf AND w.pt THEN d.impressions ELSE 0 END) p_impr,
          SUM(CASE WHEN d.date BETWEEN w.pf AND w.pt THEN d.reach ELSE 0 END) p_reach,
          SUM(CASE WHEN d.date BETWEEN w.pf AND w.pt THEN d.link_clicks ELSE 0 END) p_clicks
        FROM ad_daily d JOIN connections c ON c.kind = 'meta' AND c.external_id = d.act_id JOIN w ON w.brand = c.brand_id
        LEFT JOIN ads x ON x.act_id = d.act_id AND x.ad_id = d.ad_id LEFT JOIN meta_adsets s ON s.adset_id = x.adset_id LEFT JOIN meta_campaigns mc ON mc.campaign_id = s.campaign_id
        WHERE d.date BETWEEN ?1 AND ?2 AND d.date BETWEEN w.pf AND w.t GROUP BY c.brand_id, d.ad_id HAVING spend14 > 0`).bind(lo, hi, ...binds).all().then(r => r.results || []),
      /* Last platform click (the call) and full first click (the funnel role, 2026-10-26) in one pass. */
      env.DB.prepare(`${CTE} SELECT t.act_id, t.ad_id,
          SUM(CASE WHEN t.model = 'lastPlatformClick' AND t.date BETWEEN w.f AND w.t THEN t.orders ELSE 0 END) ord, SUM(CASE WHEN t.model = 'lastPlatformClick' AND t.date BETWEEN w.f AND w.t THEN t.revenue ELSE 0 END) rev,
          SUM(CASE WHEN t.model = 'lastPlatformClick' THEN t.orders ELSE 0 END) ord14, SUM(CASE WHEN t.model = 'lastPlatformClick' THEN t.revenue ELSE 0 END) rev14,
          SUM(CASE WHEN t.model = 'fullFirstClick' AND t.date BETWEEN w.f AND w.t THEN t.orders ELSE 0 END) ford, SUM(CASE WHEN t.model = 'fullFirstClick' AND t.date BETWEEN w.f AND w.t THEN t.revenue ELSE 0 END) frev,
          SUM(CASE WHEN t.model = 'fullFirstClick' THEN t.orders ELSE 0 END) ford14, SUM(CASE WHEN t.model = 'fullFirstClick' THEN t.revenue ELSE 0 END) frev14,
          SUM(CASE WHEN t.model = 'fullFirstClick' THEN 1 ELSE 0 END) fn_rows
        FROM tw_ad_attr t JOIN w ON w.brand = t.act_id
        WHERE t.date BETWEEN ?1 AND ?2 AND t.model IN ('lastPlatformClick', 'fullFirstClick') AND (t.platform = 'meta' OR t.platform IS NULL) AND t.date BETWEEN w.pf AND w.t GROUP BY t.act_id, t.ad_id`).bind(lo, hi, ...binds).all().then(r => r.results || []),
      /* New customers per ad: an order whose customer has no earlier order (tw_orders keeps 400 days). */
      wantNew ? env.DB.prepare(`${CTE} SELECT t.act_id, t.ad_id, SUM(CASE WHEN t.date BETWEEN w.f AND w.t THEN t.weight ELSE 0 END) n, SUM(t.weight) n14
          FROM tw_order_touch t JOIN w ON w.brand = t.act_id JOIN tw_orders o ON o.act_id = t.act_id AND o.order_id = t.order_id
          WHERE t.date BETWEEN ?1 AND ?2 AND t.model = 'lastPlatformClick' AND t.date BETWEEN w.pf AND w.t AND o.customer_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM tw_orders p WHERE p.act_id = o.act_id AND p.customer_id = o.customer_id AND p.date < o.date)
          GROUP BY t.act_id, t.ad_id`).bind(lo, hi, ...binds).all().then(r => r.results || []).catch(() => []) : [],
      /* First-click orders per ad that tw_orders can place (a customer id), and how many were the customer's first order. */
      env.DB.prepare(`${CTE} SELECT t.act_id, t.ad_id,
          SUM(CASE WHEN t.date BETWEEN w.f AND w.t THEN t.weight ELSE 0 END) k, SUM(t.weight) k14,
          SUM(CASE WHEN t.date BETWEEN w.f AND w.t AND NOT EXISTS (SELECT 1 FROM tw_orders p WHERE p.act_id = o.act_id AND p.customer_id = o.customer_id AND p.date < o.date) THEN t.weight ELSE 0 END) n,
          SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM tw_orders p WHERE p.act_id = o.act_id AND p.customer_id = o.customer_id AND p.date < o.date) THEN t.weight ELSE 0 END) n14
          FROM tw_order_touch t JOIN w ON w.brand = t.act_id JOIN tw_orders o ON o.act_id = t.act_id AND o.order_id = t.order_id
          WHERE t.date BETWEEN ?1 AND ?2 AND t.model = 'fullFirstClick' AND t.date BETWEEN w.pf AND w.t AND o.customer_id IS NOT NULL
          GROUP BY t.act_id, t.ad_id`).bind(lo, hi, ...binds).all().then(r => r.results || []).catch(() => []),
    ]);
  }
  const atOf = {}; for (const r of attrRows) atOf[`${r.act_id}|${r.ad_id}`] = { ord: num(r.ord), rev: num(r.rev), ord14: num(r.ord14), rev14: num(r.rev14),
    ford: num(r.ford), frev: num(r.frev), ford14: num(r.ford14), frev14: num(r.frev14) };
  /* A brand has first click when any of its ads has a fullFirstClick row (the role is null without it, never "closer"). */
  const hasFc = new Set(attrRows.filter(r => num(r.fn_rows) > 0).map(r => r.act_id));
  const fnOf = {}; for (const r of fcNewRows) fnOf[`${r.act_id}|${r.ad_id}`] = { k: num(r.k), k14: num(r.k14), n: num(r.n), n14: num(r.n14) };
  const nwOf = {}; for (const r of newRows) nwOf[`${r.act_id}|${r.ad_id}`] = { n: num(r.n), n14: num(r.n14) };
  const rows = [], brands = [], banners = [];
  let note = null;
  for (const a of meta) {
    const R = RULES[a.act_id];
    const metric = R.goal_metric;
    const $ = moneyOf(a.currency), w = W.find(v => v.act === a.act_id);
    const from = w ? w.f : null, to = w ? w.t : null;
    if (!note || accts.length === 1) note = R;
    const goalCpa = R.target_cpa > 0 ? R.target_cpa : null;
    const base = { act_id: a.act_id, brand: a.name, currency: a.currency, from, to, metric };
    const fix = (meta_act, why) => rows.push({ kind: 'fix', ...base, meta_act, adset_id: null, adset: null, ad_id: null, ad: null, spend: null, orders: null, revenue: null, cpa: null, goal: goalCpa, roas: null, n_ads: null, anchor: null, stake: 1e6, why });
    /* fix: the connection, and a Meta account that went quiet yesterday. */
    for (const c of metas[a.act_id]) if (c.last_error) fix(c.external_id, `Meta connection error, so these numbers may be stale: ${String(c.last_error).slice(0, 140)}`);
    const S = spOf[a.act_id] || {}, normY = (num(S[wk[1]]) + num(S[wk[2]]) + num(S[wk[3]]) + num(S[wk[4]])) / 4;
    if (!(num(S[y]) > 0) && normY > 50) fix(metas[a.act_id][0].external_id, `Meta spent nothing yesterday; a normal ${WEEKDAY[new Date(`${y}T12:00:00Z`).getUTCDay()]} is ${$(normY)}. Check billing, rejected ads and paused campaigns.`);
    if (!w) { brands.push({ act_id: a.act_id, name: a.name, from: null, to: null, goal: goalCpa, metric, n_sets_judged: 0, note: 'No Triple Whale attribution in the last 30 days.' }); continue; }
    /* Ad sets from the ads that spent in the 14 days. */
    const sets = {};
    for (const r of adRows.filter(r => r.act_id === a.act_id)) {
      if (!r.adset_id || !(num(r.spend14) > 0)) continue;
      const at = atOf[`${a.act_id}|${r.ad_id}`] || { ord: 0, rev: 0, ord14: 0, rev14: 0, ford: 0, frev: 0, ford14: 0, frev14: 0 };
      const nw = nwOf[`${a.act_id}|${r.ad_id}`] || { n: 0, n14: 0 };
      const fn = fnOf[`${a.act_id}|${r.ad_id}`] || { k: 0, k14: 0, n: 0, n14: 0 };
      const s = sets[r.adset_id] ||= { id: r.adset_id, name: r.set_name || `Ad set ${r.adset_id}`, status: r.set_status || null, budget: r.daily_budget ?? null, campaign: r.campaign_id || null,
        obj: objKind(r.objective), objective: r.objective || null, meta_act: r.meta_act, first: null, w7: { spend: 0, orders: 0, revenue: 0, nc: 0, leads: 0, ford: 0, frev: 0, fk: 0, fn: 0 }, w14: { spend: 0, orders: 0, revenue: 0, nc: 0, leads: 0, ford: 0, frev: 0, fk: 0, fn: 0 }, s2: 0, ads: [] };
      s.w7.spend += num(r.spend); s.w7.orders += at.ord; s.w7.revenue += at.rev; s.w7.nc += nw.n; s.w7.leads += num(r.leads);
      s.w14.spend += num(r.spend14); s.w14.orders += at.ord14; s.w14.revenue += at.rev14; s.w14.nc += nw.n14; s.w14.leads += num(r.leads14);
      s.w7.mp = (s.w7.mp || 0) + num(r.mp);
      s.w7.ford += at.ford; s.w7.frev += at.frev; s.w7.fk += fn.k; s.w7.fn += fn.n;
      s.w14.ford += at.ford14; s.w14.frev += at.frev14; s.w14.fk += fn.k14; s.w14.fn += fn.n14;
      s.s2 += num(r.s2);
      if (r.first_spend && (!s.first || r.first_spend < s.first)) s.first = r.first_spend;
      if (num(r.spend) > 0) s.ads.push({ id: r.ad_id, name: r.ad_name || r.ad_id, first: r.first_spend || null, spend: num(r.spend), orders: at.ord, revenue: at.rev, nc: nw.n, leads: num(r.leads),
        impr: num(r.impr), reach: num(r.reach), clicks: num(r.clicks), v3: num(r.v3), p_impr: num(r.p_impr), p_reach: num(r.p_reach), p_clicks: num(r.p_clicks),
        ford: at.ford, frev: at.frev, fk: fn.k, fn: fn.n, mp: num(r.mp) });
    }
    const live = Object.values(sets).filter(s => s.w7.spend > 0 && !(s.status && OFF_STATUS.test(s.status) && !(s.s2 > 0)));
    /* The unit: the goal in dollars for the brand's metric. A ROAS goal turns into a cost per sale through the
       brand's own order value over the window (all its Meta sets), so the spend gates still mean "N goals". */
    const tot = live.reduce((x, s) => ({ rev: x.rev + s.w7.revenue, ord: x.ord + s.w7.orders }), { rev: 0, ord: 0 });
    const aov = tot.ord ? tot.rev / tot.ord : null;
    /* GOALS AND AD CALLS (Cole approved 2026-10-21, docs/locus-v4/goals-and-ad-calls.html): the brand's goal_metric is the
       MAIN goal (goalOf: the Meta platform goal first, in that same metric, then the brand's). target_roas and target_cpa
       are GUARDRAILS when they are not the main metric; an empty field never counts, and roas_guard off drops the ROAS one. */
    const trMain = metric === 'roas' ? goalOf(R, 'roas') : null;
    const unitOf = m => m === 'roas' ? (trMain && aov ? aov / trMain : null) : goalOf(R, m);
    const unitMain = unitOf(metric);
    if (!unitMain) {
      const worst = live.filter(s => s.w7.spend > 300 && !s.w7.orders).sort((p, q) => q.w7.spend - p.w7.spend)[0];
      const what = metric === 'roas' ? 'goal ROAS' : `goal ${COST[metric]}`;
      if (worst) fix(worst.meta_act, `No ${what} set, and "${worst.name}" spent ${$(worst.w7.spend)} with no sale in 7 days. Set the goal in Home > Goals so Locus can make the calls.`);
      brands.push({ act_id: a.act_id, name: a.name, from, to, goal: null, metric, n_sets_judged: 0 });
      continue;
    }
    /* The account, for the evidence: new-customer share, the median ad set click rate, the spend (7 days, live sets). */
    const acct = live.reduce((x, s) => ({ spend: x.spend + s.w7.spend, ord: x.ord + s.w7.orders, nc: x.nc + s.w7.nc }), { spend: 0, ord: 0, nc: 0 });
    const acctNew = acct.ord ? Math.min(1, acct.nc / acct.ord) : null;
    const ctrOf = s => { const im = s.ads.reduce((t, x) => t + x.impr, 0), cl = s.ads.reduce((t, x) => t + x.clicks, 0); return im >= 1000 ? cl / im : null; };
    const ctrs = live.map(ctrOf).filter(v => v != null).sort((p, q) => p - q);
    const acctCtr = ctrs.length ? (ctrs.length % 2 ? ctrs[(ctrs.length - 1) / 2] : (ctrs[ctrs.length / 2 - 1] + ctrs[ctrs.length / 2]) / 2) : null;
    const P = v => `${Math.round(v * 100)}%`, P2 = v => `${(v * 100).toFixed(1)}%`, X1 = v => `${v >= 10 ? v.toFixed(1) : v.toFixed(2).replace(/0$/, '')}x`;
    /* FUNNEL ROLE (2026-10-26, Cole: think like a top media buyer before telling anyone to cut). Triple Whale full first
       click against last platform click over the SAME window, on the same 1.3x line as leakctx.js and the Opener / Closer
       chips: opener = first-click credit (revenue; orders when neither has revenue) 1.3x+ its last-click credit AND, on 2+
       first-click sales, a first-click cost per result (or ROAS) at or better than the goal; closer = last-click credit
       1.3x+ its first-click credit; both = in between (or first-click heavy but off goal, flagged `heavier`). Null without
       first-click data for the brand, or for a lead set. An opener is never Cut or Trimmed: last click cannot see the
       journeys it starts, so the row turns Mixed and says to judge it on first click. */
    const fcOn = hasFc.has(a.act_id);
    const roleOf = (o, m, unit, tr) => {
      if (!fcOn || !m || m === 'cpl' || !unit) return null;
      const byRev = o.frev > 0 || o.revenue > 0, fcC = byRev ? o.frev : o.ford, lcC = byRev ? o.revenue : o.orders;
      if (!(fcC > 0) && !(lcC > 0)) return null;
      const fres = m === 'ncpa' ? o.fn : o.ford, fcpa = fres ? o.spend / fres : null, froas = o.spend ? o.frev / o.spend : null;
      const onGoal = o.ford >= 2 && (m === 'roas' ? froas != null && froas >= tr : fcpa != null && fcpa <= unit);
      const heavier = fcC >= lcC * 1.3;
      return { role: heavier && onGoal ? 'opener' : lcC >= fcC * 1.3 ? 'closer' : 'both', heavier, on_goal: onGoal,
        fc_orders: o.ford, fc_revenue: o.frev, lc_orders: o.orders, lc_revenue: o.revenue, fc_results: fres, fc_cpa: fcpa, fc_roas: froas,
        fc_new_share: o.fk >= 2 ? Math.min(1, o.fn / o.fk) : null, fc_known: o.fk };
    };
    /* The numbers a buyer wants, in one sentence: days running, spend, the goal number, CTR, CPM, frequency, hook rate. */
    const SHORT = { cpa: 'CPA', ncpa: 'cost per new customer', cpl: 'cost per lead' };
    const statLine = ({ spend, res, revenue, age, d, m, unit, tr, need }) => {
      const parts = [];
      if (age != null) parts.push(`${age} day${age === 1 ? '' : 's'} running${need ? ` (${R.cr_min_days} needed)` : ''}`);
      parts.push(`${$(spend)} spent${need && unit ? ` (${$(R.cr_judge_x * unit)} needed to judge)` : ''}`);
      if (m === 'roas') parts.push(`ROAS ${X1(spend ? revenue / spend : 0)} vs ${X1(tr)} goal`);
      else if (m && unit) parts.push(`${SHORT[m]} ${res ? $(spend / res) : 'none'} vs ${$(unit)} goal`);
      if (d.impr >= 500) {
        parts.push(`CTR ${P2(d.clicks / d.impr)}`, `CPM ${$(d.spend * 1000 / d.impr)}`);
        if (d.reach) parts.push(`frequency ${(d.impr / d.reach).toFixed(1)}`);
        if (d.v3 / d.impr >= 0.01) parts.push(`hook rate ${P(d.v3 / d.impr)}`);   // under 1%: a static ad with stray plays
      }
      return cap(parts.join(', ')) + '.';
    };
    const delivOf = ads => ads.reduce((t, x) => ({ spend: t.spend + x.spend, impr: t.impr + x.impr, clicks: t.clicks + x.clicks, reach: t.reach + x.reach, v3: t.v3 + x.v3 }), { spend: 0, impr: 0, clicks: 0, reach: 0, v3: 0 });
    /* BEST SET GUARD (2026-10-26 live audit, Bonk "235 | Still": 24 of 59 Meta orders, the account's cheapest, was a Cut).
       When the whole account is under its goal over the set's own window (7 or 14 days), a sales set holding 25%+ of the
       account's results at better than the account's own number is what keeps the account up: never Cut it, it turns
       Mixed (kept_by 'best_set'). */
    const salesSets = metric === 'cpl' ? [] : live.filter(s => s.obj === 'sales');
    const rW = (w, s) => metric === 'ncpa' ? s[w].nc : s[w].orders;
    const acctW = w => { const a = salesSets.reduce((x, s) => ({ spend: x.spend + s[w].spend, res: x.res + rW(w, s), rev: x.rev + s[w].revenue }), { spend: 0, res: 0, rev: 0 });
      a.num = metric === 'roas' ? (a.spend ? a.rev / a.spend : null) : a.res ? a.spend / a.res : null;
      a.under = a.spend > 0 && (metric === 'roas' ? a.num == null || a.num < trMain : a.num == null || a.num > unitMain); return a; };
    const ACW = { w7: acctW('w7'), w14: acctW('w14') };
    const propsUp = (s, w) => {
      const a = ACW[w], r = rW(w, s);
      if (!a.under || !a.res || r < 3 || r / a.res < 0.25) return null;
      const v = metric === 'roas' ? s[w].revenue / s[w].spend : s[w].spend / r;
      return a.num == null || (metric === 'roas' ? v > a.num : v < a.num) ? { a, r, v } : null;
    };
    let judged = 0, notSales = 0, noLeadGoal = 0, slow = 0, openers = 0, bestKept = 0; const kept = [], leadNoGoal = [];
    const rowsAt = rows.length;
    for (const s of live) {
      /* What this set is judged on: its campaign's objective. */
      const m = s.obj === 'leads' ? 'cpl' : s.obj === 'reach' ? null : metric;
      if (s.obj === 'reach') notSales++;
      const unit = m ? unitOf(m) : null;
      if (m === 'cpl' && !unit) { noLeadGoal++; leadNoGoal.push(s.name); }
      s.ads.sort((p, q) => q.spend - p.spend);
      const top = s.ads[0], share = top ? top.spend / s.w7.spend : 0;
      const anchor = top && share >= R.cr_anchor_pct / 100 ? { ad_id: top.id, name: top.name, share } : null;
      const resOf = x => m === 'ncpa' ? x.nc : m === 'cpl' ? x.leads : x.orders;
      /* A slow set (under 1 result a day over 7 days) is judged on its 14 days. */
      const use14 = !!unit && R.window_auto && resOf(s.w7) < 7 && s.w14.spend > s.w7.spend;
      if (use14) slow++;
      const X = use14 ? s.w14 : s.w7, days = use14 ? 14 : 7;
      const res = resOf(X), cpr = res ? X.spend / res : null, roas = div(X.revenue, X.spend);
      const tr = metric === 'roas' ? trMain : R.target_roas;
      const age = s.first ? Math.round((Date.parse(to) - Date.parse(s.first)) / 864e5) + 1 : null;
      const fr = roleOf(X, m, unit, tr);
      /* The guardrails that apply to this set (sales sets only; a lead set has no sales to guard). */
      const cps = X.orders ? X.spend / X.orders : null;
      const guards = [];
      if (m && m !== 'cpl') {
        if (metric !== 'roas' && R.roas_guard && R.target_roas) guards.push({ k: 'roas', ok: roas != null && roas >= R.target_roas, lim: R.target_roas });
        if (metric !== 'cpa' && R.cpa_guard && R.target_cpa) guards.push({ k: 'cpa', ok: cps != null && cps <= R.target_cpa, lim: R.target_cpa });
      }
      const gText = g => g.k === 'roas' ? `ROAS ${roas != null ? X1(roas) : '0x'} ${g.ok ? 'beats' : 'is under'} the ${X1(g.lim)} floor`
        : cps != null ? `cost per sale ${$(cps)} is ${g.ok ? 'under' : 'over'} the ${$(g.lim)} ceiling` : `no sale against the ${$(g.lim)} cost per sale ceiling`;
      /* The numbers and the evidence, on every set row (the ad set panel on Ads > Calls reads them). */
      const [one1, many1] = m ? NOUN[m] : NOUN.cpa;
      const onGoal = m === 'roas' ? roas != null && roas >= tr : cpr != null && cpr <= unit;
      const mainNum = m === 'roas' ? (roas != null ? X1(roas) : '0x') : cpr != null ? $(cpr) : 'none';
      const nShare = s.w7.orders ? Math.min(1, s.w7.nc / s.w7.orders) : null, ctr = ctrOf(s);
      const freq = top && top.reach ? top.impr / top.reach : null, spShare = acct.spend ? s.w7.spend / acct.spend : null;
      const checks = [], ev = { for: [], against: [] };
      if (m && unit) {
        checks.push({ label: `${m === 'roas' ? 'ROAS' : cap(COST[m])} (main goal)`, value: mainNum, vs: `goal ${m === 'roas' ? X1(tr) : $(unit)} · ${onGoal ? 'on' : res ? (m === 'roas' ? 'under' : 'over') : 'no ' + one1}`, tone: onGoal ? 'good' : res || X.spend >= unit ? 'bad' : '' });
        if (onGoal) ev.for.push(m === 'roas' ? `ROAS ${mainNum}, at or over the ${X1(tr)} goal` : `${cap(many1)} at ${mainNum}, under the ${$(unit)} goal`);
        else if (res) ev.against.push(m === 'roas' ? `ROAS ${mainNum}, under the ${X1(tr)} goal` : `${cap(many1)} at ${mainNum}, over the ${$(unit)} goal`);
        else if (X.spend >= unit) ev.against.push(`No ${one1} on ${$(X.spend)} spent`);
      }
      for (const g of guards) {
        checks.push({ label: `${g.k === 'roas' ? 'ROAS' : 'Cost per sale'} (guardrail)`, value: g.k === 'roas' ? (roas != null ? X1(roas) : '0x') : cps != null ? $(cps) : 'no sale', vs: `${g.k === 'roas' ? `floor ${X1(g.lim)}` : `ceiling ${$(g.lim)}`} · ${g.ok ? 'met' : g.k === 'roas' ? 'under' : 'over'}`, tone: g.ok ? 'good' : 'bad' });
        (g.ok ? ev.for : ev.against).push(cap(gText(g)));
      }
      if (m && m !== 'cpl') {
        if (m !== 'roas' && !guards.some(g => g.k === 'roas')) checks.push({ label: 'ROAS', value: roas != null ? X1(roas) : '0x', vs: R.target_roas && !R.roas_guard ? 'ROAS guard off' : 'no floor set', tone: '' });
        if (m !== 'cpa' && !guards.some(g => g.k === 'cpa')) checks.push({ label: 'Cost per sale', value: cps != null ? $(cps) : 'no sale', vs: 'no limit set', tone: '' });
        if (nShare != null) {
          checks.push({ label: 'New customers', value: P(nShare), vs: acctNew != null ? `account ${P(acctNew)}` : '', tone: nShare >= 0.6 && (acctNew == null || nShare > acctNew) ? 'good' : acctNew != null && nShare < acctNew * 0.8 ? 'bad' : '' });
          if (nShare >= 0.6 && (acctNew == null || nShare > acctNew)) ev.for.push(`${P(nShare)} new customers${acctNew != null ? `, above the account's ${P(acctNew)}` : ''}`);
          else if (acctNew != null && nShare < acctNew * 0.8 && s.w7.orders >= 3) ev.against.push(`Only ${P(nShare)} new customers against the account's ${P(acctNew)}`);
        }
      }
      if (ctr != null) {
        checks.push({ label: 'Click rate', value: P2(ctr), vs: acctCtr != null ? `account median ${P2(acctCtr)}` : '', tone: acctCtr == null ? '' : ctr > acctCtr ? 'good' : ctr < acctCtr * 0.8 ? 'bad' : '' });
        if (acctCtr != null && ctr > acctCtr) ev.for.push(`Click rate ${P2(ctr)}, above the account median ${P2(acctCtr)}`);
        else if (acctCtr != null && ctr < acctCtr * 0.8) ev.against.push(`Click rate ${P2(ctr)}, under the account median ${P2(acctCtr)}`);
      }
      if (freq != null) {
        checks.push({ label: 'Frequency (main ad)', value: freq.toFixed(1), vs: 'fine under 3', tone: freq < 3 ? 'good' : 'bad' });
        if (freq >= 3) ev.against.push(`People see the main ad ${freq.toFixed(1)} times, over 3`);
      }
      if (spShare != null) {
        checks.push({ label: 'Spend share of the account', value: P(spShare), vs: `${$(s.w7.spend)} of ${$(acct.spend)}`, tone: '' });
        if (spShare >= 0.2 && !onGoal && m) ev.against.push(`${P(spShare)} of the account's spend on one set`);
      }
      const setRow = { ...base, meta_act: s.meta_act, campaign_id: s.campaign, objective: s.objective, adset_id: s.id, adset: s.name, ad_id: null, ad: null, spend: X.spend, orders: X.orders, results: res, revenue: X.revenue,
        cpa: cpr, goal: unit, goal_roas: tr, roas, n_ads: s.ads.length, anchor, top_ad: top ? { ad_id: top.id, name: top.name, share } : null, days, judged_on: m,
        set: { spend: X.spend, orders: X.orders, revenue: X.revenue, cpa: cpr, status: s.status, budget: s.budget }, checks, evidence: ev,
        role: fr ? fr.role : null, first_click: fr, ad_roles: s.ads.map(x => ({ ad_id: x.id, role: (roleOf(x, m, unit, tr) || {}).role || null })) };
      const sd = delivOf(s.ads);
      const setStat = need => statLine({ spend: X.spend, res, revenue: X.revenue, age, d: sd, m, unit, tr, need });
      /* Feeds the funnel: a TAG on a Cut or Mixed row, never a call. 60%+ of its sales are new customers AND its click rate
         beats the account's median ad set click rate (7 days). */
      /* clearly above the account (round four): 60%+ new AND at least 5 points over the account's share, click rate 25%+ over the median */
      const funnel = nShare != null && nShare >= 0.6 && (acctNew == null || nShare >= acctNew + 0.05) && ctr != null && acctCtr != null && ctr >= acctCtr * 1.25
        ? { new_share: nShare, ctr, acct_new_share: acctNew, acct_ctr: acctCtr } : null;
      let working = true;
      if (unit && X.spend >= R.cr_judge_x * unit && !(age != null && age < R.cr_min_days)) {
        judged++;
        const [one, many] = NOUN[m];
        const n = k => `${Number.isInteger(k) ? k : k.toFixed(1)} ${Math.round(k) === 1 ? one : many}`;
        const overLine = m === 'roas' ? roas != null && roas < tr / R.cr_cut_cpa_x : cpr != null && cpr > R.cr_cut_cpa_x * unit;
        const cutZero = !res && X.spend >= R.cr_cut_zero_x * unit;
        const cutBar = cutZero || (res > 0 && X.spend >= R.cr_cut_spend_x * unit && overLine);
        /* ONE WAY EACH (2026-10-22, Cole: "I'm so confused"): the ROAS floor only stops a cut, the CPA ceiling only stops a
           scale. Before, each also blocked the other call, so a 2.5x floor turned nearly every Scale into Mixed. */
        const broken = guards.filter(g => g.k === 'cpa' && !g.ok), met = guards.filter(g => g.k === 'roas' && g.ok);
        const win = days === 14 ? '14 days (a slow set)' : '7 days';
        const goalTxt = m === 'roas' ? `${X1(tr)} goal ROAS` : `${$(unit)} goal`;
        /* Mixed: the main goal and a guardrail disagree. No button; the sentence says what disagrees. */
        const mainSaid = onGoal
          ? (m === 'roas' ? `ROAS ${mainNum} beats the ${X1(tr)} goal` : `Cheap ${many} (${mainNum} against ${$(unit)})`)
          : res ? (m === 'roas' ? `ROAS ${mainNum} misses the ${X1(tr)} goal` : `${cap(many)} cost ${mainNum} against the ${$(unit)} goal`)
          : `No ${one} on ${$(X.spend)} spent`;
        const mixed = gs => ({ kind: 'mixed', ...setRow, stake: 0.5 * X.spend, ...(funnel ? { funnel } : {}),
          why: `${mainSaid} but ${gs.map(gText).join(' and ')}. ${setStat(false)}` });
        /* The role guard: last click says cut, first click says it starts the sales. Keep it, no button. */
        const fcSaid = f => `first click credits it with ${n(f.fc_results)} at ${m === 'roas' ? `${X1(f.fc_roas)} ROAS` : `${$(f.fc_cpa)} ${m === 'cpa' ? 'CPA' : 'each'}`}${f.fc_new_share != null ? ` and ${P(f.fc_new_share)} new customers` : ''}`;
        const openerRow = (row, lastSaid, f, stat) => ({ ...row, kind: 'mixed', kept_by: 'opener', stake: 0.5 * row.spend,
          why: `Last click says cut (${lastSaid}), but ${fcSaid(f)}: it opens journeys. Keep it; judge it on first click. ${stat}` });
        const lastSet = cutZero ? `${$(X.spend)}, 0 ${many} in ${days} days` : `${$(X.spend)}, ${n(res)} at ${m === 'roas' ? `${X1(roas)} ROAS` : `${$(cpr)} each`} in ${days} days`;
        /* Scale needs the last 7 days to agree (2026-10-26 audit, Trybe Jett Slepak): a slow set that qualifies on 14 days
           but had no result in the last 7 is not scaled. */
        const quiet7 = use14 && !resOf(s.w7);
        if (res >= R.cr_scale_buys && onGoal && !quiet7) {
          if (broken.length) { rows.push(mixed(broken)); kept.push(s.name); }
          else rows.push({ kind: 'scale', ...setRow, stake: 0.2 * X.spend,
            why: m === 'roas' ? `${n(res)} at ${X1(roas)} ROAS, at or over the ${X1(tr)} goal over ${win}. Raise the budget 20% and watch 3 days.`
              : `${n(res)} at ${$(cpr)} each, ${Math.round(cpr) < Math.round(unit) ? 'under' : 'at'} the ${goalTxt} over ${win}${met.length ? `; ${met.map(gText).join(' and ')}` : ''}. Raise the budget 20% and watch 3 days.` });
          if (!broken.length) rows[rows.length - 1].why += ` ${setStat(false)}`;
        } else if (cutBar && met.length) { working = true; rows.push(mixed(met)); kept.push(s.name); }
        else if (cutBar && m === metric && propsUp(s, use14 ? 'w14' : 'w7')) { working = true; bestKept++;
          const { a: aw, r: rr, v: vv } = propsUp(s, use14 ? 'w14' : 'w7');
          const v = m === 'roas' ? `${X1(vv)} ROAS` : `${$(vv)} each`, av = m === 'roas' ? `${X1(aw.num || 0)} ROAS` : aw.num != null ? `${$(aw.num)} a ${one}` : `no ${one}`;
          rows.push({ kind: 'mixed', ...setRow, kept_by: 'best_set', stake: 0.5 * X.spend, ...(funnel ? { funnel } : {}),
            why: `Last click says cut (${lastSet}), but this set brings ${n(rr)} of the account's ${n(aw.res)} at ${v}, while the whole account runs ${av} against the ${goalTxt}: it is the best you have. Cut the weaker sets first, then judge it again. ${setStat(true)}` }); }
        else if (cutBar && fr && fr.role === 'opener') { working = true; openers++;
          rows.push({ ...openerRow(setRow, lastSet, fr, setStat(true)), ...(funnel ? { funnel } : {}) }); }
        else if (cutBar) {
          /* A strong small ad inside a set being cut (2026-10-26 audit, Dartee 347-1: 4.3x ROAS on $125): name it, move it. */
          const star = s.ads.map(ad => { const r = resOf(ad); return { ad, r, v: m === 'roas' ? (ad.spend ? ad.revenue / ad.spend : 0) : r ? ad.spend / r : null }; })
            .filter(x => x.r >= 2 && (m === 'roas' ? x.v >= tr : x.v != null && x.v <= unit)).sort((p, q) => m === 'roas' ? q.v - p.v : p.v - q.v)[0];
          const keepTxt = star ? `; keep ad "${star.ad.name}" (${m === 'roas' ? `${X1(star.v)} ROAS` : `${$(star.v)} a ${one}`} on ${$(star.ad.spend)}, ${n(star.r)}${star.ad.nc && m !== 'ncpa' ? `, ${Math.round(star.ad.nc)} new` : ''}) and move it to a working set first` : '';
          working = false;
          rows.push({ kind: 'cut', ...setRow, stake: cutZero ? X.spend : Math.max(0, X.spend - unit * res), ...(funnel ? { funnel } : {}),
            ...(star ? { keep_ad: { ad_id: star.ad.id, name: star.ad.name, spend: star.ad.spend, results: star.r, value: star.v } } : {}),
            why: (cutZero ? `Spent ${$(X.spend)} (${(X.spend / unit).toFixed(1)}x the goal) with no ${one} in ${win}`
              : m === 'roas' ? `ROAS ${X1(roas)} against the ${X1(tr)} goal, on ${$(X.spend)} spent over ${win}`
              : `${cap(COST[m])} ${$(cpr)}, ${(cpr / unit).toFixed(1)}x the ${goalTxt}, on ${$(X.spend)} spent over ${win}${broken.length ? `; ${broken.map(gText).join(' and ')}` : ''}`) + `${keepTxt}. ${setStat(true)}` }); }
        if (working && s.ads.length >= 2) for (const ad of s.ads) {
          if (anchor && ad.id === anchor.ad_id) continue;
          /* Trim = the ad over the SAME line on its OWN spend (7 days), once it has run cr_min_days. */
          const aAge = ad.first ? Math.round((Date.parse(to) - Date.parse(ad.first)) / 864e5) : null;
          if (aAge != null && aAge < R.cr_min_days) continue;
          const ares = resOf(ad), acpr = ares ? ad.spend / ares : null, aroas = div(ad.revenue, ad.spend);
          const aguard = !!(R.roas_guard && tr && m !== 'cpl' && aroas != null && aroas >= tr);
          const aover = ares ? (ad.spend >= R.cr_cut_spend_x * unit && (m === 'roas' ? aroas < tr / R.cr_cut_cpa_x : acpr > R.cr_cut_cpa_x * unit) && !aguard)
            : ad.spend >= R.cr_cut_zero_x * unit;
          if (!aover) continue;
          const afr = roleOf(ad, m, unit, tr);
          const adStat = statLine({ spend: ad.spend, res: ares, revenue: ad.revenue, age: aAge, d: delivOf([ad]), m, unit, tr, need: true });
          const adRow = { ...setRow, ad_id: ad.id, ad: ad.name, spend: ad.spend, orders: ad.orders, results: ares, revenue: ad.revenue, cpa: acpr, roas: aroas, days: 7, role: afr ? afr.role : null, first_click: afr };
          if (afr && afr.role === 'opener') { openers++;
            rows.push(openerRow(adRow, ares ? `${$(ad.spend)}, ${n(ares)} at ${m === 'roas' ? `${X1(aroas)} ROAS` : `${$(acpr)} each`} in 7 days` : `${$(ad.spend)}, 0 ${many} in 7 days`, afr, adStat)); continue; }
          rows.push({ kind: 'trim', ...adRow, stake: Math.max(0, ad.spend - unit * ares),
            why: (ares ? `This ad costs ${$(acpr)} a ${one}, ${(acpr / unit).toFixed(1)}x the ${$(unit)} goal, on ${$(ad.spend)} of its own spend, while the set works${cpr != null ? ` at ${$(cpr)}` : ''}. Turn off this ad only.`
              : `This ad spent ${$(ad.spend)} of its own (${(ad.spend / unit).toFixed(1)}x the goal) with no ${one} while the set works. Turn off this ad only.`) + ` ${adStat}` });
        }
      }
      /* Refresh: the main ad wears out. Runs for every objective (awareness sets included). */
      if (anchor && working) {
        const ad = s.ads[0];
        if (ad.impr >= 2000 && ad.p_impr >= 2000) {
          const ctr = ad.clicks / ad.impr, pctr = ad.p_clicks / ad.p_impr;
          const freq = ad.reach ? ad.impr / ad.reach : null, pfreq = ad.p_reach ? ad.p_impr / ad.p_reach : null;
          const freqUp = freq == null || pfreq == null || freq > pfreq;
          if (pctr > 0 && ctr <= pctr * 0.8 && freqUp) rows.push({ kind: 'refresh', ...setRow, ad_id: ad.id, ad: ad.name, stake: 0.3 * s.w7.spend, ctr, prev_ctr: pctr, freq, prev_freq: pfreq,
            why: `The main ad (${Math.round(anchor.share * 100)}% of the set's spend) gets ${Math.round((1 - ctr / pctr) * 100)}% fewer clicks than the week before (${(ctr * 100).toFixed(2)}% vs ${(pctr * 100).toFixed(2)}%)${freq != null && pfreq != null ? ` while people see it more often (${freq.toFixed(1)} vs ${pfreq.toFixed(1)} times)` : ''}. Brief a new version of it now; do not switch it off. ${statLine({ spend: ad.spend, res: m ? resOf(ad) : 0, revenue: ad.revenue, age: ad.first ? Math.round((Date.parse(to) - Date.parse(ad.first)) / 864e5) + 1 : null, d: delivOf([ad]), m, unit, tr, need: false })}`, role: (roleOf(ad, m, unit, tr) || {}).role || null });
        }
      }
    }
    /* TRACKING GAP GUARD (2026-10-26 Ice & Gold audit: Meta's pixel counted 20 purchases in a week, Triple Whale credited 0
       to this week's Meta clicks). Over the 7 days, when Meta's own purchases on the spending sales sets are 3+ and Triple
       Whale's last platform click orders on those same ads are 30% of that or less, the brand has a tracking gap: every
       Cut and Trim turns Mixed (kept_by 'tracking_gap', no Do button) and the brand gets one banner line. */
    const gapSets = live.filter(s => s.obj === 'sales');
    const gapMeta = gapSets.reduce((t, s) => t + (s.w7.mp || 0), 0), gapTw = gapSets.reduce((t, s) => t + s.w7.orders, 0);
    const gap = gapMeta >= 3 && gapTw <= 0.3 * gapMeta ? { meta: Math.round(gapMeta), tw: Math.round(gapTw) } : null;
    if (gap) {
      const cnt = v => `${Math.round(v)} sale${Math.round(v) === 1 ? '' : 's'}`;
      for (let i = rowsAt; i < rows.length; i++) {
        const r = rows[i]; if (r.kind !== 'cut' && r.kind !== 'trim') continue;
        const set = sets[r.adset_id], ad = r.ad_id && set ? set.ads.find(x => x.id === r.ad_id) : null;
        const mp = ad ? ad.mp : set ? set.w7.mp || 0 : 0, tw = ad ? ad.orders : set ? set.w7.orders : 0;
        rows[i] = { ...r, kind: 'mixed', kept_by: 'tracking_gap', was: r.kind, stake: 0.5 * (r.spend || 0),
          why: `Tracking gap: Meta counts ${cnt(mp)} on this ${ad ? 'ad' : 'set'} in 7 days, Triple Whale counts ${cnt(tw)}. Fix tracking before cutting. ${r.why}` };
      }
      banners.push({ act_id: a.act_id, brand: a.name, kind: 'tracking_gap', ...gap,
        text: `Tracking gap on ${a.name}: Meta counts ${cnt(gap.meta)} on its spending ads this week, Triple Whale credits ${cnt(gap.tw)} to them. No cuts until tracking is fixed.` });
    }
    const notes = [];
    if (gap) notes.push(`Tracking gap: Meta counts ${gap.meta} sales this week, Triple Whale ${gap.tw}; cuts are on hold.`);
    if (notSales) notes.push(`${notSales} awareness or traffic ad set${notSales === 1 ? '' : 's'} not judged on sales (only Refresh).`);
    if (openers) notes.push(`${openers} cut or trim${openers === 1 ? '' : 's'} kept as opener${openers === 1 ? '' : 's'}: last click says cut, first click says ${openers === 1 ? 'it starts' : 'they start'} sales at goal.`);
    if (kept.length) notes.push(`${kept.length} ad set${kept.length === 1 ? '' : 's'} mixed: the main goal and a guardrail disagree, so the buyer decides (${kept.slice(0, 3).map(n => `"${n}"`).join(', ')}).`);
    if (noLeadGoal) notes.push(`${noLeadGoal} lead ad set${noLeadGoal === 1 ? '' : 's'} (${leadNoGoal.slice(0, 3).map(x => `"${x}"`).join(', ')}) not judged: no lead goal set. Set a goal cost per lead in Home > Goals; sales rules never apply to them.`);
    if (bestKept) notes.push(`${bestKept} ad set${bestKept === 1 ? '' : 's'} kept as the account's best while the whole account is under goal.`);
    brands.push({ act_id: a.act_id, name: a.name, from, to, goal: unitMain, metric, n_sets_judged: judged, n_slow: slow, n_opener_kept: openers, n_best_kept: bestKept, tracking_gap: gap, lead_no_goal: leadNoGoal, first_click: fcOn, kept, note: notes.join(' ') || undefined });
  }
  const r = note || rulesFor(null, null), pct = Math.round(r.cr_anchor_pct), [one, many] = NOUN[r.goal_metric] || NOUN.cpa;
  const goalWord = r.goal_metric === 'roas' ? 'goal (your order value at the goal ROAS)' : `goal ${COST[r.goal_metric]}`;
  const rules_note = `Ad sets first, on Triple Whale last platform click over 7 days (14 for a set under 1 ${one} a day). A set waits until it has spent ${r.cr_judge_x}x the ${goalWord} AND run ${r.cr_min_days} days. Scale: ${r.cr_scale_buys}+ ${many} on goal and every guardrail met. Cut: ${r.cr_cut_zero_x}x the goal spent with no ${one}, OR ${r.cr_cut_spend_x}x spent at worse than ${r.cr_cut_cpa_x}x the goal, and a guardrail broken (or none set). Mixed: the main goal and a guardrail (${r.roas_guard ? 'goal ROAS, ' : ''}cost per sale, when set and not the main goal) disagree; you decide. In a working set the main ad (${pct}%+ of its spend) is never cut; a small ad is a Trim only on its own spend past the same line. Opener guard: a set or ad that Triple Whale first click credits with 1.3x+ its last-click credit, at the goal on 2+ sales, is never cut or trimmed; it turns Mixed and is judged on first click. Refresh: the main ad's clicks fell 20%+ and people see it more often. The same numbers as Ads > Meta > Ads${accts.length > 1 ? ' (each brand\'s own settings apply)' : ''}.`;
  return { as_of, rules_note, brands, banners, rows: rows.sort((p, q) => q.stake - p.stake) };
}

/* ---------- THE HERO NUMBER AND THE MORNING LINE (2026-10-11, docs/two-products.md section 5) ----------
   "Yesterday you actually kept $X": one number per brand for the brand's own local yesterday. It is the contribution
   margin the P&L already computes (the host's dayEconomics: sales minus ad spend, product cost, shipping, handling and
   fees, or the flat margin override), named contribution, never profit. The bites under it are those lines. Revenue is
   Shopify total sales after returns and minus tax, so there is no refunds bite: it would count returns twice.
   A normal day = the mean of the brand's last 28 days with data (10+ needed), so the sentence under the number can say
   how yesterday compared. The morning line (one sentence per brand, shown on Home until noon and sent as a Slack DM by
   account-health morning.js) rides on the same call so the app and Slack never disagree; it counts the buyer's calls
   from buyerList for "N things to change". Custom expenses marked "counts as ad spend" join spend here as everywhere. */
const BITES = [['ads', 'Ads', r => r.spend], ['cogs', 'Product cost', r => r.cogs], ['shipping', 'Shipping and handling', r => num(r.ship_cost) + num(r.handling)], ['fees', 'Fees', r => r.fees]];
async function keptMany(env, ctx, accts, opts = {}) {
  const as_of = new Date().toISOString();
  if (!accts.length) return { as_of, date: null, brands: [] };
  const acts = accts.map(a => a.act_id);
  const y = ctx.addDays(ctx.localDate(accts[0].tz), -1), lo = ctx.addDays(y, -28);
  const [piv, metaRows, health, exps, calls] = await Promise.all([
    twPivotMany(env, acts, lo, y, ECON_IDS),
    env.DB.prepare(`SELECT c.brand_id act_id, d.date, SUM(d.spend) spend FROM daily_insights d JOIN connections c ON c.kind = 'meta' AND c.external_id = d.act_id
      WHERE c.brand_id IN (${inList(acts.length, 3)}) AND d.date BETWEEN ?1 AND ?2 GROUP BY c.brand_id, d.date`).bind(lo, y, ...acts).all().then(r => r.results || []).catch(() => []),
    env.DB.prepare(`SELECT act_id, verdict FROM p_cost_health WHERE act_id IN (${inList(acts.length)})`).bind(...acts).all().then(r => r.results || []).catch(() => []),
    ctx.loadExpenses(env, acts).catch(() => ({})),
    opts.calls === false ? Promise.resolve(null) : buyerListOnce(env, ctx, accts.filter(a => !SKIP_HUB.test(a.name || ''))).catch(() => null),
  ]);
  const metaBy = {}; for (const r of metaRows) (metaBy[r.act_id] ??= {})[r.date] = { spend: r.spend };
  const verdict = Object.fromEntries(health.map(r => [r.act_id, r.verdict]));
  const brands = accts.map(a => {
    const P = piv[a.act_id] || {}, M = metaBy[a.act_id] || {}, mp = ctx.marginOverride(a, ctx.monthOf(y));
    const rows = dates(lo, y, ctx.addDays).map(d => ctx.econ(P, M, d, mp)).filter(Boolean);
    const sp = ctx.spread(exps[a.act_id] || [], lo, y, rows); ctx.applyAdSpend(rows, sp.adByDate);
    const x = rows.find(r => r.date === y) || null;
    const base = rows.filter(r => r.date !== y && r.cm != null);
    const normal = base.length >= 10 ? base.reduce((s, r) => s + r.cm, 0) / base.length : null;
    const broken = verdict[a.act_id] === 'broken';
    const kept = x && !broken && x.cm != null ? x.cm : null;
    const bites = !x ? [] : mp != null
      ? [{ k: 'ads', label: 'Ads', v: num(x.spend) }, { k: 'costs', label: `Product and delivery at ${Math.round((1 - mp) * 100)}%`, v: Math.max(0, num(x.sales) - num(x.gross_profit)) }]
      : BITES.map(([k, label, f]) => ({ k, label, v: f(x) == null ? null : num(f(x)) })).filter(b => b.v != null && b.v > 0);
    const $ = moneyOf(a.currency);
    const c = calls ? (calls.rows || []).filter(r => r.act_id === a.act_id) : null;
    const change = c ? c.filter(r => ['cut', 'trim', 'scale', 'refresh'].includes(r.kind)).length : null, fix = c ? c.filter(r => r.kind === 'fix').length : null;
    const todo = change == null ? '' : !change && !fix ? 'Nothing to change.' : [change ? `${change === 1 ? 'One thing' : change + ' things'} to change` : '', fix ? `${fix === 1 ? 'one' : fix} to fix` : ''].filter(Boolean).join(', ').replace(/^one/, 'One') + '.';
    const adsPct = x && x.sales > 0 && x.spend != null ? Math.round(x.spend / x.sales * 100) : null;
    const line = !x ? `${a.name}: no numbers for yesterday yet.`
      : kept != null ? `${a.name} kept ${$(kept)} yesterday on ${$(x.sales)} of sales${adsPct != null ? `; ads at ${adsPct}%` : ''}. ${todo}`.trim()
      : `${a.name} sold ${$(x.sales)} yesterday${adsPct != null ? `; ads at ${adsPct}%` : ''}. Contribution needs cost data. ${todo}`.trim();
    return { act_id: a.act_id, name: a.name, currency: a.currency, date: y, has: !!x, broken, margin_pct: mp,
      sales: x ? x.sales : null, spend: x ? x.spend : null, orders: x ? x.orders : null, kept, normal, bites, ads_pct: adsPct,
      to_change: change, to_fix: fix, line };
  });
  return { as_of, date: y, brands };
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

/* ONE AD, DAY BY DAY (2026-10-21, Cole: "what if it was good last week and suddenly went bad; when did it start?"). The last
   90 days of the ad (or of every ad that runs the same creative), each day with Meta's delivery and Triple Whale's credit under
   the screen's model, the same numbers the gallery adds up. The ad sheet draws the trends and the week table from it. */
async function adDays(env, a, ids, model) {
  const act = a.act_id, IN = ids.map((_, i) => `?${i + 2}`).join(',');
  const { results } = await env.DB.prepare(`SELECT d.date, ${META_COLS} FROM ad_daily d WHERE d.act_id IN ${metaOf(1)} AND d.ad_id IN (${IN}) GROUP BY d.date ORDER BY d.date DESC LIMIT 90`)
    .bind(act, ...ids).all();
  const rows = (results || []).reverse();
  const attr = {}; let attrLast = null;
  if (model !== 'platform' && rows.length) {
    const IN2 = ids.map((_, i) => `?${i + 5}`).join(',');
    const { results: ar } = await env.DB.prepare(`SELECT date, SUM(revenue) rev, SUM(orders) ord FROM tw_ad_attr WHERE act_id = ?1 AND model = ?2 AND date BETWEEN ?3 AND ?4 AND (platform = 'meta' OR platform IS NULL) AND ad_id IN (${IN2}) GROUP BY date`)
      .bind(act, model, rows[0].date, rows[rows.length - 1].date, ...ids).all();
    for (const r of ar || []) { attr[r.date] = { rev: r.rev || 0, ord: r.ord || 0 }; if (!attrLast || r.date > attrLast) attrLast = r.date; }
    const { results: lr } = await env.DB.prepare(`SELECT MAX(date) d FROM tw_ad_attr WHERE act_id = ?1 AND model = 'lastPlatformClick'`).bind(act).all().catch(() => ({ results: [] }));
    if (lr && lr[0] && lr[0].d) attrLast = lr[0].d;
  }
  const days = rows.map(r => { const m = metaMetrics(r, model === 'platform' ? null : (attr[r.date] || { rev: 0, ord: 0 }));
    return { date: r.date, spend: m.spend, impressions: m.impressions, reach: m.reach, clicks: m.clicks, purchases: m.purchases, revenue: m.revenue,
      cpa: m.cpa, roas: m.roas, ctr: m.ctr, cpm: m.cpm, frequency: m.reach ? m.impressions / m.reach : null, hook: m.impressions && num(r.v3) ? num(r.v3) / m.impressions : null,
      attr_pending: model !== 'platform' && attrLast != null && r.date > attrLast };
  });
  return { ads: ids, days, attr_last: attrLast };
}

/* ---------- Paid > Meta ---------- */
const META_COLS = `SUM(d.spend) spend, SUM(d.impressions) impr, SUM(d.reach) reach, SUM(d.link_clicks) clicks, SUM(d.clicks_all) clicks_all, SUM(d.add_to_cart) atc,
  SUM(d.purchases) p_ord, SUM(d.revenue) p_rev, SUM(d.video_3s) v3, SUM(d.video_thruplay) thru, SUM(d.video_plays) plays,
  SUM(d.video_p25) p25, SUM(d.video_p50) p50, SUM(d.video_p75) p75, SUM(d.video_p100) p100, SUM(d.leads) leads`;
function metaMetrics(r, attr) {
  const spend = num(r.spend), impr = num(r.impr), clicks = num(r.clicks), atc = num(r.atc);
  const ord = attr ? attr.ord : num(r.p_ord), rev = attr ? attr.rev : num(r.p_rev);
  return { spend, impressions: impr, reach: num(r.reach), clicks, atc, purchases: ord, revenue: rev, platform_purchases: num(r.p_ord), platform_revenue: num(r.p_rev),
    /* Leads (2026-10-28, Cole: lead campaigns had no numbers): Meta's own lead count (instant forms + pixel leads), never TW. */
    leads: num(r.leads), cpl: div(spend, num(r.leads)), lead_rate: div(num(r.leads), clicks),
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
  const goals = (await adGoalMap(env, [a]))[a.act_id];
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
  const add = (t, r) => { for (const k of ['spend', 'impr', 'reach', 'clicks', 'clicks_all', 'atc', 'p_ord', 'p_rev', 'v3', 'thru', 'plays', 'leads']) t[k] = (t[k] || 0) + num(r[k]); };
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
  out.campaigns = Object.values(campMap).map(c => ({ id: c.id, name: c.name, objective: c.objective, obj: objKind(c.objective), status: c.status, budget: c.budget,
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

/* THE AD GOAL ON THE META SCREENS (2026-10-22, Cole: "I changed it to ROAS but nothing changed"). goals.cpa / goals.roas
   are the numbers a Meta screen colours against: the brand's ad goal in its own measure (the Meta platform goal first,
   goalOf), plus the other one as the guardrail. metric says which one decides. One query for every brand. */
async function adGoalMap(env, accts) {
  const acts = accts.map(a => a.act_id); if (!acts.length) return {};
  const { results } = await env.DB.prepare(`SELECT act_id, data_json FROM p_br_doc WHERE act_id IN (${inList(acts.length, 1)}) AND line_id = '' AND key = 'rules'`).bind(...acts).all().catch(() => ({ results: [] }));
  const doc = {}; for (const r of results || []) { try { doc[r.act_id] = JSON.parse(r.data_json || '{}'); } catch {} }
  const out = {};
  for (const a of accts) {
    const R = rulesFor(a, doc[a.act_id] || null), m = R.goal_metric;
    out[a.act_id] = { metric: m, cpa: (m === 'cpa' ? goalOf(R, 'cpa') : R.target_cpa) || null, roas: (m === 'roas' ? goalOf(R, 'roas') : R.target_roas) || null,
      ncpa: (m === 'ncpa' ? goalOf(R, 'ncpa') : +R.goal_ncpa) || null, cpl: +R.goal_cpl || null };
  }
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
  const GM = await adGoalMap(env, accts);
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
    return { act_id: a.act_id, name: a.name, currency: a.currency, goals: GM[a.act_id],
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

/* ---------- Look-alike ads (2026-10-18) ----------
   Meta's Andromeda treats ads that look alike as one ad: they share delivery and the "test" teaches nothing.
   Meta's own similarity fields exist in the API but come back empty on every account (probed 2026-10-17), so
   Locus judges it from the AI tags it already has (ad_tag, no new AI cost). Two LIVE ads in the SAME ad set are:
   - "same": the same creative (asset_key) running twice;
   - "alike": the same format, hook, person, product and offer AND the message + notes share 40%+ of their words.
   Groups are joined (A~B and B~C = one group of 3). Ads with no tags are never judged. */
const ALIKE_KEYS = ['format', 'hook', 'person', 'product', 'offer'];
const ALIKE_STOP = new Set('a an and the of to in on with for at by from into over under its it is are be this that their his her our your as or but no not very more most'.split(' '));
const alikeWords = t => new Set(`${(t && t.message) || ''} ${(t && t.notes) || ''}`.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
  .filter(w => w.length > 2 && !ALIKE_STOP.has(w)).map(w => w.replace(/(ing|ed|es|s)$/, '')));
const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const w of a) if (b.has(w)) n++; return n / (a.size + b.size - n); };
export function lookAlikeGroups(ads) {
  const bySet = {};
  for (const r of ads) if (r.adset_id && (r.asset_key || r.tags)) (bySet[r.adset_id] ||= []).push(r);
  const out = [];
  for (const [set, list] of Object.entries(bySet)) {
    if (list.length < 2) continue;
    const parent = list.map((_, i) => i), find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
    const kind = {};
    const words = list.map(r => r.tags ? alikeWords(r.tags) : null);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      let k = null;
      if (a.asset_key && a.asset_key === b.asset_key) k = 'same';
      else if (a.tags && b.tags && ALIKE_KEYS.every(x => String(a.tags[x] || '').toLowerCase() === String(b.tags[x] || '').toLowerCase()) && jaccard(words[i], words[j]) >= 0.4) k = 'alike';
      if (!k) continue;
      const ri = find(i), rj = find(j); if (ri !== rj) parent[rj] = ri;
      kind[`${i}|${j}`] = k;
    }
    const groups = {};
    list.forEach((r, i) => (groups[find(i)] ||= []).push(i));
    for (const idx of Object.values(groups)) {
      if (idx.length < 2) continue;
      const same = idx.some(i => idx.some(j => kind[`${Math.min(i, j)}|${Math.max(i, j)}`] === 'same'));
      const ads2 = idx.map(i => list[i]).sort((x, y) => num(y.spend) - num(x.spend));
      out.push({ adset_id: set, kind: same ? 'same' : 'alike', ads: ads2.map(r => ({ id: r.id, name: r.name, spend: num(r.spend) })), spend: ads2.reduce((s, r) => s + num(r.spend), 0) });
    }
  }
  return out.sort((x, y) => y.spend - x.spend);
}

/* ---------- Creative ---------- */
const formatOf =name => { const parts = String(name || '').split('|'); if (parts.length < 2) return null; const t = parts[parts.length - 1].trim(); return /[a-z]/i.test(t) ? t.replace(/\s+/g, ' ').slice(0, 24) : null; };
const batchOf = name => { const m = String(name || '').match(/^\s*(?:[A-Z]{1,4}_)?(\d{2,4})\b/); return m ? m[1] : null; };
async function creativeBrand(env, a, w, model) {
  const act = a.act_id;
  const { results: ads } = await env.DB.prepare(`SELECT d.ad_id, x.name, x.media_type, x.first_spend_date, x.created_time, x.campaign_id, x.adset_id, x.asset_key, MAX(d.date) last_day, ${META_COLS}
    FROM ad_daily d LEFT JOIN ads x ON x.ad_id = d.ad_id WHERE d.act_id IN ${metaOf(1)} AND d.date BETWEEN ?2 AND ?3 GROUP BY d.ad_id HAVING SUM(d.spend) > 0`).bind(act, w.from, w.to).all();
  const { byAd } = await attrByAd(env, act, w.from, w.to, model, 'meta');
  /* First-click credit per ad, beside the screen's model: an ad Triple Whale credits far more on FIRST
     click starts journeys (top of funnel); one credited more on the last click closes them. */
  const fc = model === 'fullFirstClick' ? byAd : (await attrByAd(env, act, w.from, w.to, 'fullFirstClick', 'meta')).byAd;
  const lc = model === 'lastPlatformClick' ? byAd : (await attrByAd(env, act, w.from, w.to, 'lastPlatformClick', 'meta')).byAd;
  const { results: camps } = await env.DB.prepare(`SELECT campaign_id, name, objective FROM meta_campaigns WHERE act_id IN ${metaOf(1)}`).bind(act).all().catch(() => ({ results: [] }));
  const { results: setRows } = await env.DB.prepare(`SELECT adset_id, name FROM meta_adsets WHERE act_id IN ${metaOf(1)}`).bind(act).all().catch(() => ({ results: [] }));
  const sName = Object.fromEntries((setRows || []).map(x => [x.adset_id, x.name]));
  const cName = Object.fromEntries((camps || []).map(c => [c.campaign_id, c.name]));
  const cObj = Object.fromEntries((camps || []).map(c => [c.campaign_id, objKind(c.objective)]));
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
    return { id: r.ad_id, name: r.name || r.ad_id, media_type: r.media_type || (num(r.v3) > 0 ? 'video' : 'image'), campaign: cName[r.campaign_id] || null, obj: cObj[r.campaign_id] || 'sales', adset_id: r.adset_id || null,
      fc_rev: model === 'platform' ? null : num((fc[r.ad_id] || {}).rev), lc_rev: model === 'platform' ? null : num((lc[r.ad_id] || {}).rev),
      first_spend: first, age: first ? Math.max(0, Math.round((Date.parse(today) - Date.parse(first)) / 864e5)) : null,
      format: formatOf(r.name), batch: b, angle: b ? (angleOf[b] || null) : null, asset_key: r.asset_key || null, tags: r.asset_key ? (tagOf[r.asset_key] || null) : null, last_day: r.last_day || null, ...m };
  }).sort((x, y) => y.spend - x.spend);
  /* THE AD SET IS THE UNIT (Cole, 2026-10-08). Meta spends inside an ad set as one system: the ad that
     takes most of the budget is often the broad opener, and the smaller ads with prettier numbers ride
     on the traffic it warms. So every ad carries its ad set's totals, its share of that spend and its
     rank, and the Creative screen judges the set first and the ad by its role in it. */
  const sets = {};
  for (const r of rows) { if (!r.adset_id) continue; const x = sets[r.adset_id] ||= { id: r.adset_id, name: sName[r.adset_id] || null, spend: 0, revenue: 0, purchases: 0, ads: 0 }; x.spend += r.spend; x.revenue += r.revenue || 0; x.purchases += r.purchases || 0; x.leads = (x.leads || 0) + (r.leads || 0); x.ads++; }
  for (const x of Object.values(sets)) { x.cpa = div(x.spend, x.purchases); x.roas = div(x.revenue, x.spend); x.cpl = div(x.spend, x.leads); }
  /* CUSTOMER VALUE PER AD (2026-10-08, the Hyros idea). The ad that STARTED a customer is the Meta ad on
     the first-click touch of their first order (tw_order_touch, fullFirstClick); their value is everything
     they spent in the 90 days from that first order (tw_orders). Only customers whose first order is 90+
     days old count, so the number is never flattered by customers who have not had time to come back.
     Independent of the date window: it is a property of the ad. */
  const ltv = await ltvByAd(env, act, w.to).catch(() => ({}));
  for (const r of rows) { const l = ltv[r.id]; if (l && l.n) { r.ltv_n = l.n; r.ltv_first = l.first / l.n; r.ltv90 = l.v90 / l.n; r.ltv_x = l.first ? l.v90 / l.first : null; } }
  /* Look-alikes among the ads still spending (the last 7 days of the window), per ad set. */
  const liveFrom = new Date(Date.parse(w.to) - 6 * 864e5).toISOString().slice(0, 10);
  const alike = lookAlikeGroups(rows.filter(r => r.last_day && r.last_day >= liveFrom));
  for (const g of alike) for (const x of g.ads) { const r = rows.find(y => y.id === x.id); if (r) { r.twins = g.ads.filter(y => y.id !== x.id).map(y => ({ id: y.id, name: y.name })); r.twin_kind = g.kind; } }
  const rankIn = {};
  for (const r of rows) { if (!r.adset_id) continue; const k = rankIn[r.adset_id] = (rankIn[r.adset_id] || 0) + 1; const x = sets[r.adset_id];
    r.adset = { id: x.id, name: x.name, spend: x.spend, purchases: x.purchases, revenue: x.revenue, cpa: x.cpa, roas: x.roas, leads: x.leads || 0, cpl: x.cpl, ads: x.ads }; r.set_share = div(r.spend, x.spend); r.set_rank = k; }
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
  return { act_id: act, name: a.name, currency: a.currency, goals: (await adGoalMap(env, [a]))[act], ads: rows.slice(0, 400), fatigue, weeks: weeks.map(x => ({ ...x, fresh_share: div(x.fresh, x.spend) })),
    by_format: roll('format'), by_angle: roll('angle'), by_type: roll('media_type'),
    alike: alike.map(g => ({ ...g, adset_name: sName[g.adset_id] || null })) };
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
  else if (adset) { filter = `AND t.ad_id IN (SELECT ad_id FROM ads WHERE adset_id = ?5 AND act_id IN (SELECT external_id FROM connections WHERE brand_id = ?1 AND kind = 'meta'))`; bind.push(adset); }
  else if (campaign) { filter = `AND t.ad_id IN (SELECT ad_id FROM ads WHERE campaign_id = ?5 AND act_id IN (SELECT external_id FROM connections WHERE brand_id = ?1 AND kind = 'meta'))`; bind.push(campaign); }
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
   - LOOK-ALIKES: ads in one ad set Meta likely counts as one (lookAlikeGroups, from the AI tags), last 7 days.
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
  let piv = {}, adQ = none, fatQ = none, conQ = none, docQ = none, yd = null, simQ = none;
  if (acts.length) {
    const IN1 = inList(acts.length, 1), IN3 = inList(acts.length, 3);
    [piv, adQ, fatQ, conQ, docQ, yd, simQ] = await Promise.all([
      twPivotMany(env, acts, ctx.addDays(y, -22), y, ['totalSales', 'totalNetTaxes', 'blendedAds', 'totalOrders']),
      env.DB.prepare(`SELECT c.brand_id act_id, MAX(substr(x.created_time, 1, 10)) last_ad, SUM(CASE WHEN substr(x.created_time, 1, 10) >= ?2 THEN 1 ELSE 0 END) new14
        FROM ads x JOIN connections c ON c.kind = 'meta' AND c.external_id = x.act_id WHERE c.brand_id IN (${IN3}) AND x.created_time IS NOT NULL AND substr(x.created_time, 1, 10) <= ?1 GROUP BY c.brand_id`).bind(y, ctx.addDays(y, -13), ...acts).all().catch(() => none),
      env.DB.prepare(`SELECT c.brand_id act_id, d.date, SUM(d.spend) spend, SUM(d.impressions) impr, SUM(d.reach) reach, SUM(d.link_clicks) clicks, SUM(d.video_views) v3
        FROM daily_insights d JOIN connections c ON c.kind = 'meta' AND c.external_id = d.act_id WHERE c.brand_id IN (${IN3}) AND d.date BETWEEN ?1 AND ?2 GROUP BY c.brand_id, d.date`).bind(ctx.addDays(y, -20), y, ...acts).all().catch(() => none),
      env.DB.prepare(`SELECT brand_id, kind FROM connections WHERE brand_id IN (${IN1})`).bind(...acts).all().catch(() => none),
      env.DB.prepare(`SELECT act_id, data_json FROM p_br_doc WHERE act_id IN (${IN1}) AND line_id = '' AND key = 'rules'`).bind(...acts).all().catch(() => none),
      yesterdayMany(env, ctx, live, true).catch(() => null),
      env.DB.prepare(`SELECT c.brand_id act_id, x.ad_id id, MAX(x.name) name, MAX(x.adset_id) adset_id, MAX(x.asset_key) asset_key, MAX(t.tags_json) tags_json, SUM(d.spend) spend
        FROM ad_daily d JOIN ads x ON x.ad_id = d.ad_id JOIN connections c ON c.kind = 'meta' AND c.external_id = d.act_id LEFT JOIN ad_tag t ON t.asset_key = x.asset_key
        WHERE c.brand_id IN (${IN3}) AND d.date BETWEEN ?1 AND ?2 AND d.spend > 0 GROUP BY c.brand_id, x.ad_id`).bind(ctx.addDays(y, -6), y, ...acts).all().catch(() => none),
    ]);
  }
  const AD = Object.fromEntries((adQ.results || []).map(r => [r.act_id, r]));
  const FT = {}; for (const r of fatQ.results || []) (FT[r.act_id] ??= {})[r.date] = r;
  const KINDS = {}; for (const r of conQ.results || []) (KINDS[r.brand_id] ??= new Set()).add(r.kind);
  const DOC = {}; for (const r of docQ.results || []) { try { DOC[r.act_id] = JSON.parse(r.data_json || 'null'); } catch {} }
  const YD = Object.fromEntries(((yd && yd.brands) || []).map(b => [b.act_id, b]));
  const SIM = {}; for (const r of simQ.results || []) { let t = null; try { t = r.tags_json ? JSON.parse(r.tags_json) : null; } catch {} (SIM[r.act_id] ??= []).push({ ...r, tags: t }); }
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
    /* LOOK-ALIKES: ads in one ad set that Meta likely counts as one (lookAlikeGroups). Flagged when they hold
       $100+ and 10%+ of the week's Meta spend. */
    const sim = lookAlikeGroups(SIM[a.act_id] || []);
    const simSpend = sim.reduce((t, g) => t + g.spend, 0), simAds = sim.reduce((t, g) => t + g.ads.length, 0);
    const similar = sim.length ? { groups: sim.length, ads: simAds, spend: Math.round(simSpend), same: sim.filter(g => g.kind === 'same').length } : null;
    if (similar && simSpend >= Math.max(100, metaSpend7 * 0.1)) add('warn', 'similar',
      `${simAds} Meta ads in ${sim.length} ad set${sim.length === 1 ? '' : 's'} look alike (${$(simSpend)} this week): Meta likely counts each group as one ad`, 'adcreative');
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
    out.push({ ...base, goal, cadence, fatigue: fat, similar, daycheck, gaps: gaps.map(g => g[0]), reasons });
  }
  return { as_of, yesterday: y, market: yd ? yd.market : null, brands: out };
}
