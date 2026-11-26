/* Paid > All channels: one row per channel, the blended totals and the day series for one brand. */
// from profit/worker/src/hub.js (channelRows, sumM)
import { num, dates } from './base.js';

/* The total of one tracker metric between two days. null when no day has a value. */
function total(piv, id, from, to) {
  let t = 0, any = false;
  for (const d in piv[id] || {}) if (d >= from && d <= to && piv[id][d] != null) { t += piv[id][d]; any = true; }
  return any ? t : null;
}

function range(piv, from, to) {
  const s = id => total(piv, id, from, to);
  return { pin: s('pinterestSpend') ?? s('pinterestAdsSpend') ?? s('pi_adCost'),
    amzSpend: s('amazonAds'), amzRev: s('amazonAdsConversionValue'),
    email: s('klaviyoPlacedOrderSales'), camp: s('totalKlaviyoPlacedOrderTotalPriceCampaigns'), flows: s('totalKlaviyoPlacedOrderTotalPriceFlows'),
    blended: s('blendedAds'), revenue: (s('netSales') ?? 0) - (s('totalNetTaxes') ?? 0), nc: s('newCustomersOrders') };
}

function platformRow(id, label, p, nc) {
  return { id, label, spend: p.cur.spend, revenue: p.cur.revenue, purchases: p.cur.purchases, platform_revenue: p.cur.platform_revenue,
    prev_revenue: p.prev?.revenue ?? null, prev_spend: p.prev?.spend ?? null, nc: nc || 0 };
}

function rowsOf(meta, g, t, cur, prev, fresh) {
  const rows = [
    platformRow('meta', 'Meta', meta, fresh.meta), platformRow('google', 'Google', g, fresh.google), platformRow('tiktok', 'TikTok', t, fresh.tiktok),
    { id: 'pinterest', label: 'Pinterest', spend: cur.pin, revenue: null, purchases: null, platform_revenue: null, prev_revenue: null,
      prev_spend: prev?.pin ?? null, nc: fresh.pinterest || 0 },
    { id: 'amazon', label: 'Amazon ads', spend: cur.amzSpend, revenue: cur.amzRev, purchases: null, platform_revenue: null,
      prev_revenue: prev?.amzRev ?? null, prev_spend: prev?.amzSpend ?? null, nc: 0 },
    { id: 'email', label: 'Email and SMS', spend: null, revenue: cur.email, purchases: null, platform_revenue: null,
      prev_revenue: prev?.email ?? null, prev_spend: null, campaigns: cur.camp, flows: cur.flows, nc: fresh.klaviyo || 0 },
  ].filter(r => (r.spend || 0) > 0 || (r.revenue || 0) > 0);
  const credited = rows.reduce((s, r) => s + (r.revenue || 0), 0);
  rows.push({ id: 'rest', label: 'Everything else', spend: null, revenue: Math.max(0, cur.revenue - credited), purchases: null,
    platform_revenue: null, prev_revenue: null, prev_spend: null, nc: fresh.organic || 0 });
  return rows;
}

const byDate = list => Object.fromEntries((list || []).map(x => [x.date, x]));

/* The paid platforms added up for one day or one window. */
function paidSum(parts) {
  const have = parts.filter(Boolean);
  const s = k => have.reduce((y, r) => y + num(r[k]), 0);
  return { have, s };
}

function paidDay(d, A, B, C) {
  const { s } = paidSum([A[d], B[d], C[d]]);
  return { purchases: s('purchases'), paid_spend: s('spend'), impressions: s('impressions'), clicks: s('clicks') };
}

function paidTotal(m, g, t) {
  const { have, s } = paidSum([m, g, t]);
  const pending = have.some(r => r.attr_pending);
  return { spend: s('spend'), purchases: pending ? null : s('purchases'), impressions: s('impressions'), clicks: s('clicks'),
    attr_pending: pending || undefined };
}

/* Per day: store revenue and blended spend from the tracker, spend per platform, and the paid platforms' totals. */
function seriesOf(w, piv, meta, g, t) {
  const store = d => { const s = piv.netSales?.[d]; return s == null ? null : s - num(piv.totalNetTaxes?.[d]); };
  const blended = d => piv.blendedAds?.[d] ?? null;
  const metaSpend = piv.fb_ads_spend || {};
  const gSpend = Object.fromEntries(g.series.map(x => [x.date, x.spend])), tSpend = Object.fromEntries(t.series.map(x => [x.date, x.spend]));
  const mS = byDate(meta.series), gS = byDate(g.series), tS = byDate(t.series);
  const mP = byDate(meta.prev_series), gP = byDate(g.prev_series), tP = byDate(t.prev_series);
  const series = dates(w.from, w.to).map(d => ({ date: d, meta: num(metaSpend[d]), google: num(gSpend[d]), tiktok: num(tSpend[d]),
    revenue: store(d), spend: blended(d), ...paidDay(d, mS, gS, tS) }));
  const prev_series = w.pf ? dates(w.pf, w.pt).map(d => ({ date: d, revenue: store(d), spend: blended(d), ...paidDay(d, mP, gP, tP) })) : [];
  return { series, prev_series };
}

/** One brand's All channels answer. `fresh` = new customer orders per source. */
export function channelRows(brand, w, meta, g, t, piv, fresh) {
  const cur = range(piv, w.from, w.to), prev = w.pf ? range(piv, w.pf, w.pt) : null;
  const { series, prev_series } = seriesOf(w, piv, meta, g, t);
  return { act_id: brand.act_id, name: brand.name, currency: brand.currency, revenue: cur.revenue, blended_spend: cur.blended,
    prev_revenue: prev ? prev.revenue : null, prev_blended: prev ? prev.blended : null, new_orders: cur.nc,
    rows: rowsOf(meta, g, t, cur, prev, fresh), series, prev_series,
    paid: paidTotal(meta.cur, g.cur, t.cur), prev_paid: w.pf ? paidTotal(meta.prev, g.prev, t.prev) : null };
}
