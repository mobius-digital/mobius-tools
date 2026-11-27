/* Sales and email, from the tracker's day rows in the shared database. */
// from profit/worker/src/hub.js (storeRoll, storeBrand, storeMany, emailFrom, emailMany)
import { aov, cvr, pct, safeDiv } from '../numbers/defs.js';
import { safeJson } from '../platform/text.js';
import { num, soft, pivotsOf, sumMetric, daysBetween, TRACKER_STORE } from './shared.js';
import { productTitles } from './titles.js';

/* Visits and carts are worked out from the tracker's daily cost per visit, cost per cart and spend. */
function visitsAndCarts(piv, from, to) {
  let sessions = 0, carts = 0, any = false;
  for (const d of daysBetween(from, to)) {
    const spend = piv.blendedAds?.[d], perVisit = piv.pixelCostPerSession?.[d], perCart = piv.pixelCostPerAtc?.[d];
    if (spend && perVisit) { sessions += spend / perVisit; any = true; }
    if (spend && perCart) carts += spend / perCart;
  }
  return { sessions, carts, any };
}

const marketplace = (s, p) => ({ sales: s(`total${p}Sales`), orders: s(`total${p}Orders`),
  net: s(p === 'Amazon' ? 'amazonNetSales' : `total${p}NetSales`), fees: s(`total${p}Fees`), refunds: s(`total${p}Refunds`) });

/** The store numbers of one brand over from..to. */
export function storeRoll(piv, from, to) {
  const s = id => sumMetric(piv, id, from, to);
  const gross = s('totalNewGrossSales'), order = s('totalSales'), net = s('netSales'), taxes = s('totalTaxes'),
    netTax = s('totalNetTaxes'), ship = s('totalShippingPrice');
  const discounts = gross != null && order != null ? Math.max(0, gross + (ship || 0) + (taxes || 0) - order) : null;
  const returns = order != null && net != null ? Math.max(0, order - net - ((taxes || 0) - (netTax || 0))) : null;
  const revenue = net != null ? net - (netTax || 0) : null;
  const orders = s('totalOrders'), newOrders = s('newCustomersOrders'), units = s('totalOrdersCombinedItemsQuantity');
  const newSales = s('newCustomerSales'), backSales = s('rcRevenue');
  const newShare = newSales != null && backSales != null && newSales + backSales > 0 ? pct(newSales, newSales + backSales) : null;
  const v = visitsAndCarts(piv, from, to);
  return { gross, discounts, returns, shipping: ship, taxes: netTax, revenue, orders, units,
    aov: aov(revenue ?? 0, orders), upo: safeDiv(units ?? 0, orders),
    new_orders: newOrders, returning_orders: orders != null && newOrders != null ? orders - newOrders : null, new_share: newShare,
    new_revenue: revenue != null && newShare != null ? revenue * newShare : null,
    returning_revenue: revenue != null && newShare != null ? revenue * (1 - newShare) : null,
    email: s('klaviyoPlacedOrderSales'), sessions: v.any ? v.sessions : null, carts: v.any ? v.carts : null,
    conversion: v.any && v.sessions ? cvr(orders ?? 0, v.sessions) : null,
    amazon: marketplace(s, 'Amazon'), tiktok_shop: marketplace(s, 'TiktokShops') };
}

/* What sells: the products in the window's orders (up to three a cart), most orders first. */
function topProducts(orders) {
  const by = {};
  for (const o of orders) {
    const list = safeJson(o.products_json, []);
    const ids = Array.isArray(list) ? list : [];
    for (const id of ids.slice(0, 3)) {
      const b = by[id] ||= { id, orders: 0, revenue: 0 };
      b.orders++;
      b.revenue += num(o.total) / Math.max(1, Math.min(3, ids.length));
    }
  }
  return Object.values(by).sort((x, y) => y.orders - x.orders).slice(0, 12);
}

async function storeBrand(ctx, a, w, piv) {
  const cur = storeRoll(piv, w.from, w.to), prev = w.pf ? storeRoll(piv, w.pf, w.pt) : null;
  const series = daysBetween(w.from, w.to).map(d => {
    const r = storeRoll(piv, d, d);
    return { date: d, revenue: r.revenue, orders: r.orders, aov: r.aov, new_share: r.new_share, discounts: r.discounts,
      sessions: r.sessions, conversion: r.conversion };
  });
  const prev_series = w.pf ? daysBetween(w.pf, w.pt).map(d => {
    const r = storeRoll(piv, d, d);
    return { date: d, revenue: r.revenue, orders: r.orders };
  }) : [];
  const orders = await soft(ctx.db.all('store.ordersWindow', { act: a.act_id, from: w.from, to: w.to }), [],
    'no order rows could be read, the products list is left empty as the old route did');
  const top = topProducts(orders);
  const titles = await soft(productTitles(ctx, a, top.map(t => t.id)), {}, 'product names could not be read, ids are shown instead');
  return { act_id: a.act_id, name: a.name, currency: a.currency, cur, prev, series, prev_series,
    products: top.map(t => ({ ...t, title: titles[t.id] || `Product ${t.id}` })), product_orders: orders.length,
    ...TRACKER_STORE };
}

/** One row per brand. One brand gets the full row with products, many brands the short row. */
export async function storeMany(ctx, accts, w) {
  const acts = accts.map(a => a.act_id);
  const lo = w.pf && w.pf < w.from ? w.pf : w.from;
  const pivs = pivotsOf(await ctx.db.all('store.storeDays', { acts, from: lo, to: w.to }), acts);
  if (accts.length === 1) return [await storeBrand(ctx, accts[0], w, pivs[acts[0]] || {})];
  return accts.map(a => {
    const piv = pivs[a.act_id] || {};
    return { act_id: a.act_id, name: a.name, currency: a.currency, cur: storeRoll(piv, w.from, w.to),
      prev: w.pf ? storeRoll(piv, w.pf, w.pt) : null,
      series: daysBetween(w.from, w.to).map(d => {
        const r = storeRoll(piv, d, d);
        return { date: d, revenue: r.revenue, orders: r.orders };
      }), ...TRACKER_STORE };
  });
}

function emailRoll(piv, from, to) {
  const s = id => sumMetric(piv, id, from, to);
  const revenue = (s('netSales') ?? 0) - (s('totalNetTaxes') ?? 0);
  return { email: s('klaviyoPlacedOrderSales'), campaigns: s('totalKlaviyoPlacedOrderTotalPriceCampaigns'),
    flows: s('totalKlaviyoPlacedOrderTotalPriceFlows'), email_clicks: s('totalKlaviyoClickedEmail'),
    sms_clicks: s('totalKlaviyoClickedSms'), revenue, share: revenue ? pct(s('klaviyoPlacedOrderSales') ?? 0, revenue) : null };
}

/** Email sales per brand: the window, the days before, and campaigns against flows by day. */
export async function emailMany(ctx, accts, w) {
  const acts = accts.map(a => a.act_id);
  const lo = w.pf && w.pf < w.from ? w.pf : w.from;
  const pivs = pivotsOf(await ctx.db.all('store.emailDays', { acts, from: lo, to: w.to }), acts);
  return accts.map(a => {
    const piv = pivs[a.act_id] || {};
    const series = daysBetween(w.from, w.to).map(d => ({ date: d, campaigns: num(piv.totalKlaviyoPlacedOrderTotalPriceCampaigns?.[d]),
      flows: num(piv.totalKlaviyoPlacedOrderTotalPriceFlows?.[d]), email: num(piv.klaviyoPlacedOrderSales?.[d]) }));
    return { act_id: a.act_id, name: a.name, currency: a.currency, cur: emailRoll(piv, w.from, w.to),
      prev: w.pf ? emailRoll(piv, w.pf, w.pt) : null, series };
  });
}
