/* What a new customer costs, what they spend, and whether the first order pays that back.
   Not cohort maths: the tracker's day rows only.
     cost of a new customer = ad spend / new customer orders
     first order size       = new customer sales / new customer orders
     first order margin     = first order size x product margin, minus the cost of the customer
   The day row below is the store day of the old money model, cut down to the five numbers this page
   reads. It covers a brand with no cost rule of its own and no extra ad cost. A brand that has either
   is handed to the old worker (see customers in service.js), so the two never disagree. */
// from profit/worker/src/worker.js (customerEconomics, seriesFor, dayEconomics, goalsFor, inheritedGoals)
import { aov, cpa, mer, pct, safeDiv } from '../numbers/defs.js';
import { safeJson } from '../platform/text.js';
import { dayIn, addDays, monthOf } from '../platform/time.js';
import { pubAccount, pivotOf, TRACKER_STORE } from './shared.js';

const prevMonth = ym => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
};

/* What a month with no plan of its own takes over: the last planned month before it. */
function inheritedGoals(g, ym) {
  const months = Object.keys(g).filter(k => /^\d{4}-\d{2}$/.test(k)).sort();
  const prior = months.filter(k => k < ym).pop();
  if (prior) return g[prior] || {};
  const d = g.default || {};
  if (months.some(k => k > ym)) return d.cm_pct != null ? { cm_pct: d.cm_pct } : {};
  return d;
}

/** The margin a brand typed for a month, or null when the tracker's costs are used. */
export function marginOverride(acct, ym) {
  const g = safeJson(acct.goals_json, {});
  return { ...inheritedGoals(g, ym), ...(g[ym] || {}) }.cm_pct ?? null;
}

/* One store day. null when the tracker has no sales row for the day. */
function dayRow(piv, meta, date, marginPct) {
  const totalSales = piv.netSales?.[date] ?? piv.totalSales?.[date] ?? null;
  if (totalSales == null) return null;
  const sales = totalSales - (piv.totalNetTaxes?.[date] ?? 0);
  const metaDay = meta[date];
  const google = piv.ga_adCost?.[date] ?? null;
  const spend = piv.blendedAds?.[date] ?? (metaDay || google != null ? (metaDay?.spend ?? 0) + (google ?? 0) : null);
  const rawNew = piv.newCustomerSales?.[date] ?? null, rawBack = piv.rcRevenue?.[date] ?? null;
  const split = (rawNew ?? 0) + (rawBack ?? 0);
  const newShare = split > 0 && rawNew != null ? rawNew / split : null;
  const cogs = piv.totalProductCosts?.[date] ?? null;
  const variable = cogs != null
    ? cogs + (piv.totalShippingCosts?.[date] ?? 0) + (piv.totalHandlingFees?.[date] ?? 0) + (piv.totalPaymentGatewayCosts?.[date] ?? 0)
    : null;
  return { date, sales, spend,
    new_rev: newShare != null ? sales * newShare : rawNew,
    ret_rev: newShare != null ? sales * (1 - newShare) : rawBack,
    gross_profit: marginPct != null ? sales * marginPct : variable != null ? sales - variable : null };
}

/* Totals of a list of day rows, with the order counts from the tracker. */
function totalsOf(rows, piv) {
  const sum = key => rows.reduce((a, r) => a + (r[key] ?? 0), 0);
  const metric = id => rows.reduce((a, r) => a + (piv[id]?.[r.date] ?? 0), 0);
  const newOrders = metric('newCustomersOrders'), totalOrders = metric('totalOrders');
  /* The tracker does not send returning orders for these shops, so they are worked out. Never below 0. */
  return { spend: sum('spend'), sales: sum('sales'), gp: sum('gross_profit'), newRev: sum('new_rev'), retRev: sum('ret_rev'),
    newOrders, totalOrders, retOrders: Math.max(0, totalOrders - newOrders) };
}

/* The numbers both a month and the headline share. */
function unit(t) {
  const margin = t.sales > 0 ? pct(t.gp, t.sales) : null;
  const cac = t.newOrders > 0 ? cpa(t.spend, t.newOrders) : null;
  const newAov = t.newOrders > 0 ? aov(t.newRev, t.newOrders) : null;
  const firstGp = newAov != null && margin != null ? newAov * margin : null;
  return { margin, cac, newAov, firstGp,
    firstCm: firstGp != null && cac != null ? firstGp - cac : null,
    payback: firstGp != null && cac > 0 ? safeDiv(firstGp, cac) : null,
    repeatShare: t.totalOrders > 0 ? pct(t.retOrders, t.totalOrders) : null,
    returningAov: t.retOrders > 0 ? aov(t.retRev, t.retOrders) : null };
}

function monthRow(ym, rows, piv, thisYm) {
  if (!rows.length) return { month: ym, empty: true };
  const t = totalsOf(rows, piv), u = unit(t);
  return { month: ym, partial: ym === thisYm, days: rows.length, spend: t.spend, sales: t.sales, margin: u.margin,
    new_orders: t.newOrders, returning_orders: t.retOrders, total_orders: t.totalOrders,
    new_rev: t.newRev, returning_rev: t.retRev, cac: u.cac, new_aov: u.newAov, returning_aov: u.returningAov,
    first_order_gp: u.firstGp, first_order_cm: u.firstCm, payback: u.payback, repeat_share: u.repeatShare };
}

function headlineOf(t) {
  const u = unit(t);
  return { cac: u.cac, new_aov: u.newAov, margin: u.margin, first_order_gp: u.firstGp, first_order_cm: u.firstCm,
    payback: u.payback, repeat_share: u.repeatShare, returning_aov: u.returningAov,
    new_orders: t.newOrders, returning_orders: t.retOrders, new_rev: t.newRev, returning_rev: t.retRev,
    new_rev_share: t.newRev + t.retRev > 0 ? pct(t.newRev, t.newRev + t.retRev) : null,
    spend: t.spend, sales: t.sales, orders: t.totalOrders,
    aov: t.totalOrders > 0 ? aov(t.sales, t.totalOrders) : null,
    cpa: t.totalOrders > 0 && t.spend > 0 ? cpa(t.spend, t.totalOrders) : null,
    mer: t.spend > 0 ? mer(t.sales, t.spend) : null,
    /* Fewer than about 50 new customers makes these numbers too jumpy to lean on. */
    thin: t.newOrders < 50 };
}

/** The unit numbers of one brand: the headline for the window and one row per month.
 *  `range` is the window the screen named, or null for "days ending yesterday". */
export async function customerEconomics(ctx, acct, months, days, range) {
  const today = dayIn(acct.tz, ctx.now);
  const thisYm = monthOf(today);
  const list = [];
  let m = thisYm;
  for (let i = 0; i < months; i++) { list.unshift(m); m = prevMonth(m); }
  const to = range?.to || addDays(today, -1);
  const winFrom = range?.from || addDays(today, -days);
  const monthsFrom = `${list[0]}-01`;
  const from = winFrom < monthsFrom ? winFrom : monthsFrom;
  const piv = pivotOf(await ctx.db.all('store.allDays', { act: acct.act_id, from, to }));
  const metaRows = await ctx.db.all('store.metaSpendDays', { act: acct.act_id, from, to });
  const meta = Object.fromEntries(metaRows.map(r => [r.date, r]));
  const margin_pct = marginOverride(acct, monthOf(to));
  const rows = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const row = dayRow(piv, meta, d, margin_pct);
    if (row) rows.push(row);
  }
  const byMonth = {};
  for (const r of rows) (byMonth[monthOf(r.date)] ??= []).push(r);
  return { account: pubAccount(acct), months: list, margin_pct, window: { days, from: winFrom, to },
    headline: headlineOf(totalsOf(rows.filter(r => r.date >= winFrom), piv)),
    series: list.map(ym => monthRow(ym, byMonth[ym] || [], piv, thisYm)), ...TRACKER_STORE };
}
