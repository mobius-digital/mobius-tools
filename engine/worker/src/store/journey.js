/* The customer journey, from the tracker's order rows (one row per order: customer, day, money, the
   cart's products, the last click source).
   Rules kept from the old code: a customer counts for a horizon only when that many days have passed
   since the first order. Customers first seen in the first 60 days of history may have bought before
   the data starts, so they stay out of the averages. Orders with no customer id count as orders but
   join no cohort. */
// from profit/worker/src/worker.js (customerJourney, LTV_HORIZONS, median, dayDiff)
import { cpa, pct, safeDiv } from '../numbers/defs.js';
import { safeJson } from '../platform/text.js';
import { dayIn, addDays, monthOf, dayDiff } from '../platform/time.js';
import { soft, pivotOf } from './shared.js';
import { productTitles } from './titles.js';

const HORIZONS = [30, 60, 90, 180, 365];
const NO_ORDERS = 'No order history from Triple Whale yet. It fills in overnight once the brand has a Triple Whale shop.';

const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);

function median(a) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* Rows of orders -> one record per customer, with what they were worth at each horizon. */
function peopleOf(rows, histFrom, histTo) {
  const byId = new Map();
  let guestOrders = 0, guestRev = 0;
  for (const r of rows) {
    if (!r.customer_id) { guestOrders++; guestRev += r.total || 0; continue; }
    let c = byId.get(r.customer_id);
    if (!c) { c = { id: r.customer_id, orders: [] }; byId.set(r.customer_id, c); }
    c.orders.push({ date: r.date, total: r.total || 0, products: r.products_json ? JSON.parse(r.products_json) : [], source: r.source || 'organic' });
  }
  const reliableFrom = addDays(histFrom, 60);
  const people = [...byId.values()];
  for (const c of people) {
    c.first = c.orders[0].date;
    c.n = c.orders.length;
    c.rev = c.orders.reduce((a, o) => a + o.total, 0);
    c.certain = c.first >= reliableFrom;
    c.age = dayDiff(c.first, histTo);
    c.gap = c.n > 1 ? dayDiff(c.first, c.orders[1].date) : null;
    c.at = {};
    c.repeatAt = {};
    for (const h of HORIZONS) {
      const old = c.age >= h;
      c.at[h] = old ? c.orders.filter(o => dayDiff(c.first, o.date) <= h).reduce((a, o) => a + o.total, 0) : null;
      c.repeatAt[h] = old ? c.orders.some((o, i) => i > 0 && dayDiff(c.first, o.date) <= h) : null;
    }
  }
  return { people, guestOrders, guestRev, reliableFrom };
}

/* Spend over new customer orders for each month, the same figure as on every other screen. */
async function cacByMonth(ctx, acct, histFrom) {
  const today = dayIn(acct.tz, ctx.now);
  const piv = pivotOf(await ctx.db.all('store.cacDays', { act: acct.act_id, from: `${monthOf(histFrom)}-01`, to: today }));
  const monthly = {};
  for (const [metric, key] of [['blendedAds', 'spend'], ['newCustomersOrders', 'newOrders']]) {
    for (const [d, v] of Object.entries(piv[metric] || {})) (monthly[monthOf(d)] ??= { spend: 0, newOrders: 0 })[key] += v || 0;
  }
  return ym => {
    const mm = monthly[ym];
    return mm && mm.newOrders > 0 ? cpa(mm.spend, mm.newOrders) : null;
  };
}

/* One row per first order month. */
function cohortsOf(people, cacOf, histTo) {
  const byMonth = {};
  for (const c of people) (byMonth[monthOf(c.first)] ??= []).push(c);
  return Object.keys(byMonth).sort().map(ym => {
    const cs = byMonth[ym], sure = cs.filter(c => c.certain);
    const at = h => {
      const m = sure.filter(c => c.at[h] != null);
      return m.length ? avg(m.map(c => c.at[h])) : null;
    };
    const cac = cacOf(ym), ltv365 = at(365), ltv90 = at(90);
    const rev = cs.reduce((a, c) => a + c.rev, 0);
    const back = cs.filter(c => c.n > 1).length;
    return { month: ym, customers: cs.length, uncertain: sure.length < cs.length, repeat_customers: back,
      repeat_rate: cs.length ? pct(back, cs.length) : null, orders: cs.reduce((a, c) => a + c.n, 0), revenue: rev,
      ltv_now: cs.length ? safeDiv(rev, cs.length) : null, ltv_90: ltv90, ltv_365: ltv365, cac,
      ltv_cac_90: ltv90 != null && cac ? safeDiv(ltv90, cac) : null, ltv_cac_365: ltv365 != null && cac ? safeDiv(ltv365, cac) : null,
      age_days: dayDiff(`${ym}-01`, histTo) };
  });
}

/* Lifetime value against cost, weighted over the months that have a read at this horizon. */
function weighted(cohorts, certain, key, horizon) {
  let lv = 0, cc = 0, n = 0;
  for (const co of cohorts) {
    if (co[key] == null || co.cac == null || co.uncertain) continue;
    const m = certain.filter(c => monthOf(c.first) === co.month && c.at[horizon] != null).length;
    lv += co[key] * m;
    cc += co.cac * m;
    n += m;
  }
  return n ? { ltv: lv / n, cac: cc / n, ratio: cc ? lv / cc : null, customers: n } : null;
}

/* What they buy first, and what the same people put in the cart next. */
async function productsOf(ctx, acct, certain) {
  const firstCount = {}, nextCount = {}, nextBy = {};
  for (const c of certain) {
    for (const p of c.orders[0].products) firstCount[p] = (firstCount[p] || 0) + 1;
    if (c.n < 2) continue;
    for (const p of c.orders[1].products) {
      nextCount[p] = (nextCount[p] || 0) + 1;
      for (const f of c.orders[0].products) {
        if (f === p) continue;
        (nextBy[f] ??= {})[p] = (nextBy[f]?.[p] || 0) + 1;
      }
    }
  }
  const firstTop = top(firstCount, 8), nextTop = top(nextCount, 8);
  const ids = [...new Set([...firstTop.map(x => x[0]), ...nextTop.map(x => x[0]),
    ...firstTop.flatMap(([f]) => top(nextBy[f] || {}, 3).map(x => x[0]))])];
  const titles = await soft(productTitles(ctx, acct, ids), {}, 'product names could not be read, ids are shown instead');
  const name = id => titles[id] || `Retired product (${id})`;
  const withProducts = certain.filter(c => c.orders[0].products.length).length;
  const backIn90 = id => {
    const m = certain.filter(c => c.orders[0].products.includes(id) && c.at[90] != null);
    return m.length >= 10 ? m.filter(c => c.repeatAt[90]).length / m.length : null;
  };
  return { coverage: certain.length ? pct(withProducts, certain.length) : null,
    first: firstTop.map(([id, n]) => ({ id, name: name(id), customers: n, share: withProducts ? pct(n, withProducts) : null,
      then: top(nextBy[id] || {}, 3).map(([id2, n2]) => ({ id: id2, name: name(id2), customers: n2 })),
      repeat_rate: backIn90(id) })),
    next: nextTop.map(([id, n]) => ({ id, name: name(id), customers: n })) };
}

/* The tracker's many source names, grouped into what a strategist decides on. */
function sourceGroup(raw) {
  const x = String(raw || 'organic').toLowerCase();
  if (/^(meta|facebook|instagram)/.test(x)) return 'meta';
  if (/google|youtube/.test(x)) return 'google';
  if (/tiktok/.test(x)) return 'tiktok';
  if (/pinterest|snapchat|reddit|microsoft|bing|applovin|taboola|outbrain|criteo/.test(x)) return 'other_ads';
  if (/klaviyo|attentive|postscript|sms|email|notify|mailchimp|omnisend|yotpo/.test(x)) return 'email';
  return 'own';
}

function sourceMix(orders) {
  const count = {};
  for (const o of orders) { const g = sourceGroup(o.source); count[g] = (count[g] || 0) + 1; }
  const n = orders.length || 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1]).map(([source, k]) => ({ source, orders: k, share: k / n }));
}

/* The window, by people: of its orders, how many came from someone who had bought before it opened. */
function windowOf(people, from, to) {
  let orders = 0, back = 0, revenue = 0, backRev = 0;
  for (const c of people) {
    for (let i = 0; i < c.orders.length; i++) {
      const o = c.orders[i];
      if (o.date < from || o.date > to) continue;
      orders++;
      revenue += o.total;
      if (i > 0 && c.orders[0].date < from) { back++; backRev += o.total; }
    }
  }
  return { from, to, orders, returning_orders: back, returning_share: orders ? pct(back, orders) : null, revenue, returning_revenue: backRev };
}

/** The journey of one brand's customers. { have: false, reason } when there are no order rows. */
export async function customerJourney(ctx, acct, winFrom, winTo) {
  const rows = await soft(ctx.db.all('store.ordersAll', { act: acct.act_id }), [], 'the order rows could not be read');
  if (!rows.length) return { have: false, reason: NO_ORDERS };
  const histFrom = rows[0].date, histTo = rows[rows.length - 1].date;
  const histDays = dayDiff(histFrom, histTo) + 1;
  const { people, guestOrders, guestRev, reliableFrom } = peopleOf(rows, histFrom, histTo);
  const certain = people.filter(c => c.certain);
  const curve = HORIZONS.map(h => {
    const m = certain.filter(c => c.at[h] != null);
    return { days: h, customers: m.length, ltv: avg(m.map(c => c.at[h])), repeat_rate: m.length ? m.filter(c => c.repeatAt[h]).length / m.length : null };
  });
  const repeatOrders = certain.flatMap(c => c.orders.slice(1));
  const repeaters = certain.filter(c => c.n > 1);
  const year = certain.filter(c => c.at[365] != null);
  const cohorts = cohortsOf(people, await cacByMonth(ctx, acct, histFrom), histTo);
  const lc365 = weighted(cohorts, certain, 'ltv_365', 365), lc90 = weighted(cohorts, certain, 'ltv_90', 90);
  return { have: true,
    history: { from: histFrom, to: histTo, days: histDays, reliable_from: reliableFrom, complete: histDays >= 390 },
    customers: people.length, certain_customers: certain.length, guest_orders: guestOrders, guest_revenue: guestRev, orders: rows.length,
    first_aov: avg(certain.map(c => c.orders[0].total)), returning_aov: avg(repeatOrders.map(o => o.total)),
    repeat_rate_ever: certain.length ? pct(repeaters.length, certain.length) : null,
    days_to_second: median(repeaters.map(c => c.gap)),
    orders_per_customer_365: year.length ? avg(year.map(c => c.orders.filter(o => dayDiff(c.first, o.date) <= 365).length)) : null,
    curve, ltv_cac: lc365 ? { horizon: 365, ...lc365 } : lc90 ? { horizon: 90, ...lc90 } : null,
    cohorts: cohorts.slice(-14), products: await productsOf(ctx, acct, certain),
    sources: { first: sourceMix(certain.map(c => c.orders[0])), repeat: sourceMix(repeatOrders) },
    window: windowOf(people, winFrom, winTo) };
}
