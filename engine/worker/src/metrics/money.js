/* The money model: one day of a store's numbers, and the totals of many days.
   Moved from the old profit worker, not rewritten. Every ratio is worked out by numbers/defs.js.
   Every figure is for the whole store:
     sales = the store's total sales minus sales tax (shipping charged to customers is already inside it)
     spend = ad spend on every platform
   The tracker's `netSales` already holds shipping and tax, so shipping is never added again. */
// from profit/worker/src/worker.js (SALES_IDS, pick, dayEconomics, sum, totals)
import { mer, cpa, aov, pct, sum as sumKey } from '../numbers/defs.js';
import { ruleCosts } from './costs.js';

export const SALES_IDS = ['netSales', 'totalSales'];

/* Every tracker metric the money model, the platform split and the forecast read. Nothing else is loaded. */
export const TW_METRICS = ['netSales', 'totalSales', 'totalNetTaxes', 'totalShippingPrice', 'totalShippingCosts',
  'totalHandlingFees', 'totalOrders', 'ga_adCost', 'blendedAds', 'newCustomerSales', 'rcRevenue', 'totalProductCosts',
  'totalPaymentGatewayCosts', 'newCustomersOrders', 'klaviyoPlacedOrderSales', 'tiktokAdsSpend', 'tiktokSpend',
  'tk_adCost', 'pinterestAdsSpend', 'pinterestSpend', 'pi_adCost', 'totalKlaviyoPlacedOrderTotalPriceCampaigns',
  'totalKlaviyoPlacedOrderTotalPriceFlows'];

export const pick = (piv, date, ids) => {
  for (const id of ids) { const v = piv[id]?.[date]; if (v != null) return v; }
  return null;
};

/* The costs of one day: the brand's own cost rules first, the tracker's figures where no rule applies. */
function dayCosts(piv, date, sales, orders, rules) {
  const ov = rules && rules.length ? ruleCosts(rules, date, { sales, orders }) : null;
  const shipCost = ov && ov.shipping != null ? ov.shipping : (piv.totalShippingCosts?.[date] ?? 0);
  const handling = piv.totalHandlingFees?.[date] ?? 0;
  const cogs = ov && ov.product != null ? ov.product : (piv.totalProductCosts?.[date] ?? null);
  const fees = piv.totalPaymentGatewayCosts?.[date] ?? null;
  // Everything variable except ad spend. Ad spend comes off separately so gross profit is its own step.
  const variableCosts = cogs != null ? cogs + shipCost + handling + (fees ?? 0) : null;
  return { ov, shipCost, handling, cogs, fees, variableCosts };
}

/** One day of store numbers, or null when the tracker has no sales figure for the day.
 *  Contribution margin = sales minus every variable cost (product, delivery, handling, payment fees, ad spend). */
export function dayEconomics(piv, meta, date, marginPct, rules) {
  const totalSales = pick(piv, date, SALES_IDS);
  if (totalSales == null) return null;
  // Tax is collected for the state, not earned, so it comes off the top.
  const tax = piv.totalNetTaxes?.[date] ?? 0;
  const shipRev = piv.totalShippingPrice?.[date] ?? 0;
  const sales = totalSales - tax;
  const netSales = sales - shipRev;
  const orders = piv.totalOrders?.[date] ?? null;
  const c = dayCosts(piv, date, sales, orders, rules);
  const mrow = meta[date];
  const gSpend = piv.ga_adCost?.[date] ?? null;
  const spend = piv.blendedAds?.[date] ?? (mrow || gSpend != null ? (mrow?.spend ?? 0) + (gSpend ?? 0) : null);
  const rawNew = piv.newCustomerSales?.[date] ?? null;
  const rawRet = piv.rcRevenue?.[date] ?? null;
  const rawSplit = (rawNew ?? 0) + (rawRet ?? 0);
  // The tracker reports the new and returning split against order revenue, so it is rebased onto sales.
  const newShare = rawSplit > 0 && rawNew != null ? pct(rawNew, rawSplit) : null;
  const newRev = newShare != null ? sales * newShare : rawNew;
  const grossProfit = marginPct != null ? sales * marginPct : c.variableCosts != null ? sales - c.variableCosts : null;
  const row = {
    date, sales, total_sales: totalSales, tax, net_sales: netSales, ship_rev: shipRev, spend,
    orders, new_orders: piv.newCustomersOrders?.[date] ?? null, email_rev: piv.klaviyoPlacedOrderSales?.[date] ?? null,
    new_rev: newRev,
    ret_rev: newShare != null ? sales * (1 - newShare) : rawRet,
    new_share: newShare,
    cogs: c.cogs, ship_cost: c.shipCost, handling: c.handling, fees: c.fees, gross_profit: grossProfit,
    meta_spend: mrow?.spend ?? null, google_spend: gSpend,
    mer: spend ? mer(sales, spend) : null,
    amer: newRev != null && spend ? mer(newRev, spend) : null,
    cm: grossProfit != null && spend != null ? grossProfit - spend : null,
    margin: sales > 0 && grossProfit != null ? pct(grossProfit, sales) : null,
  };
  if (c.ov) row.cost_src = c.ov.src;
  return row;
}

/** The totals of a list of day rows. A total with no known day is null, never 0. */
export function totals(rows) {
  const t = key => sumKey(rows, key);
  const sales = t('sales'), spend = t('spend'), newRev = t('new_rev'), gp = t('gross_profit');
  const orders = t('orders'), newOrders = t('new_orders'), emailRev = t('email_rev');
  return {
    days: rows.length, sales, spend, new_rev: newRev, ret_rev: t('ret_rev'),
    orders, new_orders: newOrders, aov: orders ? aov(sales, orders) : null,
    new_aov: newOrders ? aov(newRev ?? 0, newOrders) : null,
    cac: spend != null && newOrders ? cpa(spend, newOrders) : null,
    email_rev: emailRev, email_share: emailRev != null && sales > 0 ? pct(emailRev, sales) : null,
    total_sales: t('total_sales'), tax: t('tax'), net_sales: t('net_sales'), ship_rev: t('ship_rev'),
    cogs: t('cogs'), ship_cost: t('ship_cost'),
    /* the part of spend that is extra costs marked "counts as ad spend", and the platforms alone */
    ad_expense: t('ad_expense'), base_spend: sumKey(rows.map(r => ({ v: r.base_spend ?? r.spend })), 'v'),
    handling: t('handling'), fees: t('fees'), gross_profit: gp,
    meta_spend: t('meta_spend'), google_spend: t('google_spend'),
    mer: spend ? mer(sales, spend) : null,
    amer: newRev != null && spend ? mer(newRev, spend) : null,
    cm: gp != null && spend != null ? gp - spend : null,
    margin: sales > 0 && gp != null ? pct(gp, sales) : null,
    new_share: sales > 0 && newRev != null ? pct(newRev, sales) : null,
  };
}
