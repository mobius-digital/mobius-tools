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
 *   GET /api/hub/today?act=
 */
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
    return { from, to, pf, pt, span };
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
      if (platform === 'meta') out = accts.length === 1 ? [await metaBrand(env, accts[0], w0, model, true)] : await metaMany(env, accts, w0, model);
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
    if (path === '/api/hub/orders') return json({ ...base, ...(await ordersFor(env, accts[0], win(accts[0]), model, url)) });
    if (path === '/api/hub/customer') return json(await customerFor(env, accts[0], url.searchParams.get('customer') || ''));
    if (path === '/api/hub/today') {
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
  SUM(d.purchases) p_ord, SUM(d.revenue) p_rev, SUM(d.video_3s) v3, SUM(d.video_thruplay) thru, SUM(d.video_plays) plays`;
function metaMetrics(r, attr) {
  const spend = num(r.spend), impr = num(r.impr), clicks = num(r.clicks), atc = num(r.atc);
  const ord = attr ? attr.ord : num(r.p_ord), rev = attr ? attr.rev : num(r.p_rev);
  return { spend, impressions: impr, reach: num(r.reach), clicks, atc, purchases: ord, revenue: rev, platform_purchases: num(r.p_ord), platform_revenue: num(r.p_rev),
    roas: div(rev, spend), cpa: div(spend, ord), cpm: div(spend * 1000, impr), ctr: div(clicks, impr), cpc: div(spend, clicks), cost_per_atc: div(spend, atc),
    atc_rate: div(atc, clicks), purchase_rate: div(ord, atc), frequency: div(impr, num(r.reach)),
    hook: num(r.v3) ? div(num(r.v3), impr) : null, hold: num(r.v3) ? div(num(r.thru), num(r.v3)) : null };
}
async function metaBrand(env, a, w, model, detail) {
  const act = a.act_id;
  const tot = async (from, to) => {
    const r = await env.DB.prepare(`SELECT ${META_COLS} FROM ad_daily d WHERE d.act_id = ?1 AND d.date BETWEEN ?2 AND ?3`).bind(act, from, to).first();
    const at = model === 'platform' ? null : await env.DB.prepare(`SELECT SUM(revenue) rev, SUM(orders) ord FROM tw_ad_attr WHERE act_id = ?1 AND model = ?2 AND date BETWEEN ?3 AND ?4 AND (platform = 'meta' OR platform IS NULL)`).bind(act, model, from, to).first();
    return metaMetrics(r || {}, at ? { rev: num(at.rev), ord: num(at.ord) } : null);
  };
  const cur = await tot(w.from, w.to);
  const prev = w.pf ? await tot(w.pf, w.pt) : null;
  const goals = { cpa: a.target_cpa ?? null, roas: a.target_roas ?? null };
  const out = { act_id: act, name: a.name, currency: a.currency, goals, cur, prev };
  if (!detail) return out;

  /* Daily series, by campaign. */
  const { results: daily } = await env.DB.prepare(`SELECT d.date, COALESCE(x.campaign_id, '?') campaign_id, ${META_COLS} FROM ad_daily d LEFT JOIN ads x ON x.ad_id = d.ad_id
    WHERE d.act_id = ?1 AND d.date BETWEEN ?2 AND ?3 GROUP BY d.date, campaign_id ORDER BY d.date`).bind(act, w.from, w.to).all();
  const { byAd, byDate } = await attrByAd(env, act, w.from, w.to, model, 'meta');
  const { results: prevDaily } = w.pf ? await env.DB.prepare(`SELECT d.date, SUM(d.spend) spend, SUM(d.purchases) p_ord, SUM(d.revenue) p_rev FROM ad_daily d WHERE d.act_id = ?1 AND d.date BETWEEN ?2 AND ?3 GROUP BY d.date ORDER BY d.date`).bind(act, w.pf, w.pt).all() : { results: [] };
  const prevAttr = w.pf ? (await attrByAd(env, act, w.pf, w.pt, model, 'meta')).byDate : {};

  /* Campaign > ad set > ad, with names. */
  const { results: adRows } = await env.DB.prepare(`SELECT d.ad_id, x.name ad_name, x.adset_id, x.campaign_id, x.media_type, x.first_spend_date, x.created_time, ${META_COLS}
    FROM ad_daily d LEFT JOIN ads x ON x.ad_id = d.ad_id WHERE d.act_id = ?1 AND d.date BETWEEN ?2 AND ?3 GROUP BY d.ad_id`).bind(act, w.from, w.to).all();
  const { results: camps } = await env.DB.prepare(`SELECT campaign_id, name, objective, status, daily_budget, lifetime_budget, bid_strategy FROM meta_campaigns WHERE act_id = ?1`).bind(act).all().catch(() => ({ results: [] }));
  const { results: sets } = await env.DB.prepare(`SELECT adset_id, campaign_id, name, status, daily_budget, optimization_goal, min_spend FROM meta_adsets WHERE act_id = ?1`).bind(act).all().catch(() => ({ results: [] }));
  const cName = Object.fromEntries((camps || []).map(c => [c.campaign_id, c])), sName = Object.fromEntries((sets || []).map(s => [s.adset_id, s]));
  const { results: prevAds } = w.pf ? await env.DB.prepare(`SELECT x.campaign_id, x.adset_id, SUM(d.spend) spend, SUM(d.purchases) p_ord FROM ad_daily d LEFT JOIN ads x ON x.ad_id = d.ad_id WHERE d.act_id = ?1 AND d.date BETWEEN ?2 AND ?3 GROUP BY x.adset_id`).bind(act, w.pf, w.pt).all() : { results: [] };
  const prevAttrAd = w.pf ? (await attrByAd(env, act, w.pf, w.pt, model, 'meta')).byAd : {};
  const { results: prevAdIds } = w.pf ? await env.DB.prepare(`SELECT DISTINCT d.ad_id, x.adset_id, x.campaign_id FROM ad_daily d LEFT JOIN ads x ON x.ad_id = d.ad_id WHERE d.act_id = ?1 AND d.date BETWEEN ?2 AND ?3`).bind(act, w.pf, w.pt).all() : { results: [] };
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
    return { date: d.date, spend: d.spend, purchases: ord, revenue: rev, platform_revenue: d.p_rev, cpa: div(d.spend, ord), roas: div(rev, d.spend), ctr: div(d.clicks, d.impr), camps: d.camps };
  });
  out.prev_series = (prevDaily || []).map(d => { const at = prevAttr[d.date]; const ord = model === 'platform' ? num(d.p_ord) : (at ? at.ord : 0), rev = model === 'platform' ? num(d.p_rev) : (at ? at.rev : 0); return { date: d.date, spend: num(d.spend), purchases: ord, revenue: rev, cpa: div(num(d.spend), ord) }; });

  /* The account's own changes in the window (budget, launches, pauses), for chart markers. */
  const { results: changes } = await env.DB.prepare(`SELECT substr(event_time,1,10) date, category, summary, actor, object_name FROM activities WHERE act_id = ?1 AND substr(event_time,1,10) BETWEEN ?2 AND ?3
    AND category IN ('budget','new_campaign','campaign_paused','campaign_relaunched','bid_strategy','new_creative','new_adset','manual') ORDER BY event_time DESC LIMIT 60`).bind(act, w.from, w.to).all().catch(() => ({ results: [] }));
  out.changes = changes || [];
  return out;
}

/** Meta totals for many brands: 2 queries per window, whatever the brand count. */
async function metaMany(env, accts, w, model) {
  const acts = accts.map(a => a.act_id);
  const lo = w.pf && w.pf < w.from ? w.pf : w.from;
  const { results } = await env.DB.prepare(`SELECT d.act_id, CASE WHEN d.date >= ?1 THEN 'cur' ELSE 'prev' END win, ${META_COLS} FROM ad_daily d
    WHERE d.act_id IN (${inList(acts.length, 5)}) AND ((d.date BETWEEN ?1 AND ?2) OR (d.date BETWEEN ?3 AND ?4)) GROUP BY d.act_id, win`)
    .bind(w.from, w.to, w.pf || '9999', w.pt || '0000', ...acts).all();
  const at = await attrMany(env, acts, lo, w.to, model, 'meta');
  const raw = {}; for (const r of results || []) (raw[r.act_id] ??= {})[r.win] = r;
  return accts.map(a => {
    const cA = model === 'platform' ? null : sumAttr(at[a.act_id], w.from, w.to);
    const pA = model === 'platform' || !w.pf ? null : sumAttr(at[a.act_id], w.pf, w.pt);
    return { act_id: a.act_id, name: a.name, currency: a.currency, goals: { cpa: a.target_cpa ?? null, roas: a.target_roas ?? null },
      cur: metaMetrics(raw[a.act_id]?.cur || {}, cA), prev: w.pf ? metaMetrics(raw[a.act_id]?.prev || {}, pA) : null };
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
  const meta = await metaMany(env, accts, w, model);
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
    const rev = usePlat ? (t.prAny ? t.pr : null) : t.tw_revenue, ord = usePlat ? (t.poAny ? t.po : null) : t.tw_purchases;
    return { series: ds, m: { spend: t.spend, impressions: t.impressions, clicks: t.clicks, revenue: rev, purchases: ord, platform_revenue: t.prAny ? t.pr : null, platform_purchases: t.poAny ? t.po : null,
      roas: div(rev ?? 0, t.spend), cpa: ord ? div(t.spend, ord) : null, cpm: div(t.spend * 1000, t.impressions), ctr: div(t.clicks, t.impressions), cpc: div(t.spend, t.clicks) } };
  };
  const cur = roll(w.from, w.to), prev = w.pf ? roll(w.pf, w.pt) : null;
  return { act_id: a.act_id, name: a.name, currency: a.currency, goals: { cpa: a.target_cpa ?? null, roas: a.target_roas ?? null }, cur: cur.m, prev: prev ? prev.m : null,
    series: cur.series.map(x => ({ date: x.date, spend: x.spend, revenue: model === 'platform' ? x.platform_revenue : x.tw_revenue, purchases: model === 'platform' ? x.platform_purchases : x.tw_purchases, platform_revenue: x.platform_revenue })),
    prev_series: prev ? prev.series.map(x => ({ date: x.date, spend: x.spend, revenue: model === 'platform' ? x.platform_revenue : x.tw_revenue })) : [], source: 'via Triple Whale' };
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
  const series = dates(w.from, w.to, ctx.addDays).map(d => ({ date: d, meta: num(mBy[d]), google: num(gBy[d]), tiktok: num(tBy[d]) }));
  return { act_id: a.act_id, name: a.name, currency: a.currency, revenue: cr.revenue, blended_spend: cr.blended, prev_revenue: pr ? pr.revenue : null, prev_blended: pr ? pr.blended : null, new_orders: cr.nc, rows, series };
}

/* ---------- Creative ---------- */
const formatOf = name => { const parts = String(name || '').split('|'); if (parts.length < 2) return null; const t = parts[parts.length - 1].trim(); return /[a-z]/i.test(t) ? t.replace(/\s+/g, ' ').slice(0, 24) : null; };
const batchOf = name => { const m = String(name || '').match(/^\s*(?:[A-Z]{1,4}_)?(\d{2,4})\b/); return m ? m[1] : null; };
async function creativeBrand(env, a, w, model) {
  const act = a.act_id;
  const { results: ads } = await env.DB.prepare(`SELECT d.ad_id, x.name, x.media_type, x.first_spend_date, x.created_time, x.campaign_id, x.adset_id, ${META_COLS}
    FROM ad_daily d LEFT JOIN ads x ON x.ad_id = d.ad_id WHERE d.act_id = ?1 AND d.date BETWEEN ?2 AND ?3 GROUP BY d.ad_id HAVING SUM(d.spend) > 0`).bind(act, w.from, w.to).all();
  const { byAd } = await attrByAd(env, act, w.from, w.to, model, 'meta');
  const { results: camps } = await env.DB.prepare(`SELECT campaign_id, name FROM meta_campaigns WHERE act_id = ?1`).bind(act).all().catch(() => ({ results: [] }));
  const cName = Object.fromEntries((camps || []).map(c => [c.campaign_id, c.name]));
  /* Angle per ad: the batch number leading the ad name -> the test library -> its angle. */
  const { results: batches } = await env.DB.prepare(`SELECT b.num, g.name angle FROM p_br_batch b LEFT JOIN p_br_angle g ON g.id = b.angle_id WHERE b.act_id = ?1`).bind(act).all().catch(() => ({ results: [] }));
  const angleOf = Object.fromEntries((batches || []).map(b => [String(b.num).replace(/^\D+/, ''), b.angle]));
  const today = w.to;
  const rows = (ads || []).map(r => {
    const m = metaMetrics(r, model === 'platform' ? null : (byAd[r.ad_id] || { rev: 0, ord: 0 }));
    const first = r.first_spend_date || (r.created_time || '').slice(0, 10) || null;
    const b = batchOf(r.name);
    return { id: r.ad_id, name: r.name || r.ad_id, media_type: r.media_type || (num(r.v3) > 0 ? 'video' : 'image'), campaign: cName[r.campaign_id] || null,
      first_spend: first, age: first ? Math.max(0, Math.round((Date.parse(today) - Date.parse(first)) / 864e5)) : null,
      format: formatOf(r.name), batch: b, angle: b ? (angleOf[b] || null) : null, ...m };
  }).sort((x, y) => y.spend - x.spend);
  /* Fatigue: CPA by days since an ad first spent, over every ad-day in the window. */
  const { results: adDays } = await env.DB.prepare(`SELECT d.ad_id, d.date, d.spend, d.impressions, d.link_clicks, d.purchases FROM ad_daily d WHERE d.act_id = ?1 AND d.date BETWEEN ?2 AND ?3 AND d.spend > 0`).bind(act, w.from, w.to).all();
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
  const { results: wk } = await env.DB.prepare(`SELECT d.ad_id, d.date, d.spend FROM ad_daily d WHERE d.act_id = ?1 AND d.date BETWEEN ?2 AND ?3 AND d.spend > 0`).bind(act, from12, w.to).all();
  const { results: firsts } = await env.DB.prepare(`SELECT ad_id, first_spend_date, created_time FROM ads WHERE act_id = ?1`).bind(act).all();
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
