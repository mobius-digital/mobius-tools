/* The daily series of one brand, built from rows already loaded (load.js). Nothing here reads the database.
   Also the month's goals, the plan so far, the platform split and the shipping check. */
// from profit/worker/src/worker.js (inheritedGoals, goalsFor, pubAccount, seriesFor, channelsFor, shippingMode, planFor)
import { mer, roas, cpa, sum as sumKey } from '../numbers/defs.js';
import { addDays, monthOf } from '../platform/time.js';
import { safeJson } from '../platform/text.js';
import { dayEconomics } from './money.js';
import { shippingRuled } from './costs.js';
import { spread, applyAdSpend } from './expenses.js';
import { switchStore } from './storesource.js';

export const daysInMonth = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();

/* What a month with no plan of its own inherits: the most recent month before it that has one.
   `default` is only the fallback when no dated month exists. The margin override carries forward. */
function inheritedGoals(g, ym) {
  const months = Object.keys(g).filter(k => /^\d{4}-\d{2}$/.test(k)).sort();
  const prior = months.filter(k => k < ym).pop();
  if (prior) return g[prior] || {};
  const d = g.default || {};
  if (months.some(k => k > ym)) return d.cm_pct != null ? { cm_pct: d.cm_pct } : {};
  return d;
}

export function goalsFor(acct, ym) {
  const g = safeJson(acct.goals_json, {});
  // When default is what plans this month (defaultCovers), its numbers are the month's numbers.
  return { ...inheritedGoals(g, ym), ...(defaultCovers(g, ym) ? g.default : {}), ...(g[ym] || {}) };
}

export const marginOverride = (acct, ym) => goalsFor(acct, ym).cm_pct ?? null;

/* Is a month PLANNED (old goalsPlanned, 2026-11-26)? Planned when its own key has a sales goal, or when defaultCovers
   says "default" holds this month's goal. Every save writes the month key AND default, so default cannot say which
   month it was typed for: a sales goal in default with no key for the month is the legacy current-month goal, and it
   covers months up to DEFAULT_LAST_MONTH only while no LATER month has a key. Same rule as account-health goalplan.js
   and profit worker.js (which also keeps that goal in its own key on save, keepDefaultMonth). */
export const DEFAULT_LAST_MONTH = '2026-11';
export function defaultCovers(g, ym) {
  if (!g || typeof g !== 'object' || !(ym <= DEFAULT_LAST_MONTH)) return false;
  const d = g.default;
  if (!(d && typeof d === 'object' && d.sales != null)) return false;
  return !Object.keys(g).some(k => /^\d{4}-\d{2}$/.test(k) && k > ym);
}
export function monthPlanned(g, ym) {
  if (!g || typeof g !== 'object') return false;
  const own = g[ym];
  if (own && typeof own === 'object' && own.sales != null) return true;
  return defaultCovers(g, ym);
}
export const goalsPlanned = (acct, ym) => monthPlanned(safeJson(acct.goals_json, {}), ym);

export const pubAccount = a => ({ act_id: a.act_id, name: a.name, currency: a.currency, tz: a.tz, tw_shop: a.tw_shop });

/* The tracker rows of one window only. */
function within(piv, from, to) {
  const out = {};
  for (const [metric, byDate] of Object.entries(piv || {})) {
    for (const [date, value] of Object.entries(byDate)) if (date >= from && date <= to) (out[metric] ??= {})[date] = value;
  }
  return out;
}

/** Does this brand record what delivery costs it? Only `uncosted` is a problem: money charged for delivery
 *  with nothing booked against it. A cost that equals the charge is not flagged. */
export function shippingMode(piv) {
  const total = m => Object.values(piv[m] || {}).reduce((a, b) => a + (b || 0), 0);
  const rev = total('totalShippingPrice'), cost = total('totalShippingCosts');
  const orders = total('totalOrders');
  // A day counts only when the customer was charged for delivery.
  let billed = 0, matched = 0;
  const perDay = [];
  for (const [d, r] of Object.entries(piv.totalShippingPrice || {})) {
    if (!(r > 0)) continue;
    billed++;
    if (Math.abs((piv.totalShippingCosts?.[d] ?? 0) - r) < 0.005) matched++;
    const o = piv.totalOrders?.[d];
    if (o > 0) perDay.push(r / o);
  }
  perDay.sort((a, b) => a - b);
  const per = n => (orders > 0 ? n / orders : null);
  const base = {
    rev, cost, orders, billed_days: billed, matched_days: matched,
    rev_per_order: per(rev), cost_per_order: per(cost),
    charge_lo: perDay.length ? perDay[0] : null,
    charge_hi: perDay.length ? perDay[perDay.length - 1] : null,
  };
  if (rev <= 0 && cost <= 0) return { ...base, mode: 'none', note: 'no shipping billed or costed' };
  if (rev > 0 && cost <= 0) {
    return { ...base, mode: 'uncosted', note: `customers were charged ${Math.round(rev)} for shipping and Triple Whale records no fulfillment cost against any of it, so contribution margin is overstated by whatever delivery actually costs - add shipping rates in Triple Whale to close the gap` };
  }
  return { ...base, mode: 'measured', note: rev >= cost ? `shipping makes ${Math.round(rev - cost)} over the window` : `shipping loses ${Math.round(cost - rev)} over the window` };
}

/** The day rows of one brand over [from, to], from loaded rows. `raw` is what load.js returns.
 *  Returns { rows, margin_pct, shipping, piv, exp, rules, store }, the old seriesFor answer. `store` says where
 *  the store numbers came from (storesource.js): Shopify's days replace the tracker's when they cover the window. */
export function buildSeries(raw, acct, from, to) {
  const id = acct.act_id;
  const piv = within(raw.piv[id], from, to);
  const store = switchStore(piv, raw.shop, acct, from, to, raw.shop ? raw.shop.now : Date.now());
  const meta = raw.meta[id] || {};
  const marginPct = marginOverride(acct, monthOf(to));
  let ship = shippingMode(piv);
  const rules = raw.rules[id] || [];
  /* A shipping rule set by the brand is a delivery cost: "nothing booked against delivery" no longer holds. */
  if (ship.mode === 'uncosted' && rules.length && shippingRuled(rules, from, to)) {
    ship = { ...ship, mode: 'measured', source: 'locus', note: 'shipping cost comes from the rule set in Locus' };
  }
  const rows = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const row = dayEconomics(piv, meta, d, marginPct, rules);
    if (row) rows.push(row);
  }
  /* Extra costs marked "counts as ad spend" join spend here, so every number that rests on spend holds them. */
  const exp = raw.exp[id] || [];
  if (exp.some(e => +e.is_ad_spend)) applyAdSpend(rows, spread(exp, from, to, rows).adByDate);
  return { rows, margin_pct: marginPct, shipping: ship, piv, exp, rules, store };
}

/* The first of these tracker metrics that has a value in the window, summed over it. */
function sumMetric(piv, ids, from, to) {
  let t = 0, any = false;
  for (const id of ids) {
    const m = piv[id];
    if (!m) continue;
    for (const d in m) if (d >= from && d <= to && m[d] != null) { t += m[d]; any = true; }
    if (any) break;
  }
  return any ? t : null;
}

/* Revenue and orders the tracker credits to each platform in the window (last platform click). */
function creditedBy(attrRows, from, to) {
  const a = {};
  for (const r of attrRows || []) {
    if (r.date < from || r.date > to) continue;
    const at = (a[r.platform || 'other'] ??= { rev: 0, ord: 0 });
    at.rev += r.rev || 0;
    at.ord += r.ord || 0;
  }
  return a;
}

/** The platform split of one window. Spend is each platform's own, revenue is the tracker's, never the
 *  platform's own claim. "Everything else" is store revenue not credited to a platform or to email. */
export function channelsFor(attrRows, rows, piv, from, to) {
  const a = creditedBy(attrRows, from, to);
  const sales = sumKey(rows, 'sales');
  const paid = (id, label, spend) => {
    const at = a[id];
    if (!(spend > 0) && !at) return null;
    const rev = at ? at.rev : null, ord = at ? at.ord : null;
    return { id, label, spend: spend ?? 0, revenue: rev, orders: ord,
      roas: rev != null && spend > 0 ? roas(rev, spend) : null, cpa: ord > 0 && spend > 0 ? cpa(spend, ord) : null,
      attributed: at ? 'Triple Whale last platform click' : 'no attribution rows in this window' };
  };
  const out = [
    paid('meta', 'Meta', sumKey(rows, 'meta_spend')),
    paid('google', 'Google', sumKey(rows, 'google_spend')),
    paid('tiktok', 'TikTok', sumMetric(piv, ['tiktokAdsSpend', 'tiktokSpend', 'tk_adCost'], from, to)),
    paid('pinterest', 'Pinterest', sumMetric(piv, ['pinterestAdsSpend', 'pinterestSpend', 'pi_adCost'], from, to)),
  ].filter(Boolean);
  const emailRev = sumKey(rows, 'email_rev');
  if (emailRev != null) {
    out.push({ id: 'email', label: 'Email and SMS', spend: null, revenue: emailRev, orders: null, roas: null, cpa: null,
      campaigns: sumMetric(piv, ['totalKlaviyoPlacedOrderTotalPriceCampaigns'], from, to),
      flows: sumMetric(piv, ['totalKlaviyoPlacedOrderTotalPriceFlows'], from, to), attributed: 'Klaviyo placed order' });
  }
  if (sales != null) {
    const credited = out.reduce((t, c) => t + (c.revenue || 0), 0);
    out.push({ id: 'rest', label: 'Everything else', spend: null, revenue: Math.max(0, sales - credited), orders: null,
      roas: null, cpa: null, attributed: 'store revenue not credited to a platform or email' });
  }
  return out;
}

/** Today's live row in PLACE of any stored row for the same day, never beside it (old liveReplaces, 2026-11-26).
 *  The tracker sync can store a partial today, so a series may already hold a row for it. */
export function liveReplaces(list, row) {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].date === row.date) list.splice(i, 1);
  list.push(row);
  return list;
}

/** Whole days only: the rows before today. The plan is spread over these, never over a partial today. */
export const wholeDays = (rows, today) => rows.filter(r => r.date < today);

/** The month's goals spread over the days gone by, so month to date has something to beat. */
export function planFor(acct, ym, mtdRows) {
  const g = goalsFor(acct, ym);
  if (g.sales == null && g.spend == null) return null;
  const dim = daysInMonth(ym);
  const elapsed = mtdRows.length;
  if (!elapsed) return null;
  const share = elapsed / dim;
  const sales = g.sales != null ? g.sales * share : null;
  const spend = g.spend != null ? g.spend * share : null;
  const margin = g.cm_pct ?? null;
  return {
    days: elapsed, days_in_month: dim, share,
    sales, spend,
    mer: sales != null && spend ? mer(sales, spend) : null,
    amer: g.amer ?? null,
    cm: sales != null && spend != null && margin != null ? sales * margin - spend : null,
    month: { sales: g.sales ?? null, spend: g.spend ?? null, amer: g.amer ?? null },
  };
}
