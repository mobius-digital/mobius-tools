/* Paid > Google and TikTok (through the tracker's platform rows), and Paid > All channels. */
// from profit/worker/src/hub.js (TW_PLAT, twPlatformFrom, twPlatformMany, allChannelsMany, twPivotMany)
import { roas, cpa, cpm, ctr, safeDiv } from '../numbers/defs.js';
import { num, dates, lowDay } from './base.js';
import { metaMany, creditMany } from './metamany.js';
import { channelRows } from './allchannels.js';

/* The tracker's metric ids for each platform's own numbers. The first id that has a value wins. */
const PLATFORM_METRICS = {
  google: { spend: ['ga_adCost'], impr: ['totalGoogleAdsImpressions'], clicks: ['totalGoogleAdsClicks'], roas: ['ga_ROAS'], cpa: ['googleAllCpa'] },
  tiktok: { spend: ['tiktok_spend', 'tiktokAdsSpend', 'tk_adCost'], impr: ['tiktokImpressions'], ctr: ['tiktokCtr'],
    roas: ['tiktok_complete_payment_roas'], purchases: ['tiktokPurchases'], cpm: ['averageTiktokCpm'] },
};
const ALL_METRICS = ['pinterestSpend', 'pinterestAdsSpend', 'pi_adCost', 'amazonAds', 'amazonAdsConversionValue', 'klaviyoPlacedOrderSales',
  'totalKlaviyoPlacedOrderTotalPriceCampaigns', 'totalKlaviyoPlacedOrderTotalPriceFlows', 'blendedAds', 'netSales', 'totalNetTaxes',
  'newCustomersOrders', 'fb_ads_spend'];
const idsOf = P => Object.values(P).flat();
const START = { spend: 0, impressions: 0, clicks: 0, tw_revenue: 0, tw_purchases: 0, pr: 0, po: 0, prAny: false, poAny: false };

/** brand id -> metric -> day -> value, in one statement. */
async function trackerDays(ctx, acts, from, to, metrics) {
  const out = Object.fromEntries(acts.map(a => [a, {}]));
  for (const r of await ctx.db.all('ads.trackerDaysMany', { acts, from, to, metrics })) {
    ((out[r.act_id] ??= {})[r.metric] ??= {})[r.date] = r.value;
  }
  return out;
}

/* One day of a platform: its own spend and delivery, its own sales count, and the tracker's credit. */
function platformDay(P, piv, byDate, d) {
  const pick = key => {
    for (const id of P[key] || []) { const v = piv[id] && piv[id][d]; if (v != null) return v; }
    return null;
  };
  const spend = num(pick('spend')), impr = num(pick('impr'));
  const clicks = P.clicks ? num(pick('clicks')) : (pick('ctr') != null ? impr * pick('ctr') / 100 : 0);
  const pRev = pick('roas') != null ? spend * pick('roas') : null;
  const pOrd = P.purchases ? pick('purchases') : (pick('cpa') ? spend / pick('cpa') : null);
  const c = byDate[d];
  return { date: d, spend, impressions: impr, clicks, platform_revenue: pRev, platform_purchases: pOrd,
    tw_revenue: c ? c.rev : 0, tw_purchases: c ? c.ord : 0 };
}

function rollUp(P, piv, byDate, from, to, w, model) {
  const days = dates(from, to).map(d => platformDay(P, piv, byDate, d));
  const t = { ...START };
  for (const x of days) {
    for (const k of ['spend', 'impressions', 'clicks', 'tw_revenue', 'tw_purchases']) t[k] += x[k] || 0;
    if (x.platform_revenue != null) { t.pr += x.platform_revenue; t.prAny = true; }
    if (x.platform_purchases != null) { t.po += x.platform_purchases; t.poAny = true; }
  }
  const own = model === 'platform';
  /* Today: the credit lands overnight, so a today with no credit yet is "pending", never a 0. */
  const pending = !own && from === to && to === w.today && !byDate[to];
  const rev = own ? (t.prAny ? t.pr : null) : pending ? null : t.tw_revenue;
  const ord = own ? (t.poAny ? t.po : null) : pending ? null : t.tw_purchases;
  return { series: days, m: { spend: t.spend, impressions: t.impressions, clicks: t.clicks, revenue: rev, purchases: ord,
    platform_revenue: t.prAny ? t.pr : null, platform_purchases: t.poAny ? t.po : null,
    roas: rev == null ? null : roas(rev, t.spend), cpa: ord ? cpa(t.spend, ord) : null, cpm: cpm(t.spend, t.impressions),
    ctr: ctr(t.clicks, t.impressions), cpc: safeDiv(t.spend, t.clicks), ...(pending ? { attr_pending: true } : {}) } };
}

function point(x, model) {
  const rev = model === 'platform' ? x.platform_revenue : x.tw_revenue, ord = model === 'platform' ? x.platform_purchases : x.tw_purchases;
  return { date: x.date, spend: x.spend, revenue: rev, purchases: ord, platform_revenue: x.platform_revenue, impressions: x.impressions,
    clicks: x.clicks, roas: rev == null ? null : roas(rev, x.spend), cpa: ord ? cpa(x.spend, ord) : null,
    cpm: cpm(x.spend, x.impressions), ctr: ctr(x.clicks, x.impressions) };
}

/** One brand on one platform: this window, the window before and a line per day. */
function platformBrand(brand, w, model, P, piv, byDate) {
  const cur = rollUp(P, piv, byDate, w.from, w.to, w, model);
  const prev = w.pf ? rollUp(P, piv, byDate, w.pf, w.pt, w, model) : null;
  return { act_id: brand.act_id, name: brand.name, currency: brand.currency,
    goals: { cpa: brand.target_cpa ?? null, roas: brand.target_roas ?? null }, cur: cur.m, prev: prev ? prev.m : null,
    series: cur.series.map(x => point(x, model)), prev_series: prev ? prev.series.map(x => point(x, model)) : [],
    source: 'via Triple Whale' };
}

/** Paid > Google or TikTok for every brand asked. */
export async function platformMany(ctx, brands, w, model, platform) {
  const P = PLATFORM_METRICS[platform];
  const acts = brands.map(b => b.act_id), lo = lowDay(w);
  const pivs = await trackerDays(ctx, acts, lo, w.to, [...new Set(idsOf(P))]);
  const credit = await creditMany(ctx, acts, lo, w.to, model === 'platform' ? 'lastPlatformClick' : model, platform);
  return brands.map(b => platformBrand(b, w, model, P, pivs[b.act_id] || {}, credit[b.act_id] || {}));
}

/** Paid > All channels for every brand asked. */
export async function allChannelsMany(ctx, brands, w, model) {
  const acts = brands.map(b => b.act_id), lo = lowDay(w);
  const meta = await metaMany(ctx, brands, w, model);
  const metrics = [...new Set([...idsOf(PLATFORM_METRICS.google), ...idsOf(PLATFORM_METRICS.tiktok), ...ALL_METRICS])];
  const pivs = await trackerDays(ctx, acts, lo, w.to, metrics);
  const creditModel = model === 'platform' ? 'lastPlatformClick' : model;
  const google = await creditMany(ctx, acts, lo, w.to, creditModel, 'google');
  const tiktok = await creditMany(ctx, acts, lo, w.to, creditModel, 'tiktok');
  const fresh = {};
  for (const r of await ctx.db.all('ads.newOrdersBySource', { acts, from: w.from, to: w.to })) (fresh[r.act_id] ??= {})[r.source] = r.n;
  return brands.map((b, i) => {
    const piv = pivs[b.act_id] || {};
    const g = platformBrand(b, w, model, PLATFORM_METRICS.google, piv, google[b.act_id] || {});
    const t = platformBrand(b, w, model, PLATFORM_METRICS.tiktok, piv, tiktok[b.act_id] || {});
    return channelRows(b, w, meta[i], g, t, piv, fresh[b.act_id] || {});
  });
}
