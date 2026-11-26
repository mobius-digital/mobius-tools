/* Stock against ad spend: which products each ad really sells, from the tracker's orders and never
   from ad names. For every ad: its last click orders in the last 30 days, the product ids in those
   orders, and the ad's 30 day spend shared across them. */
// from profit/worker/src/hub.js (stockAds)
import { dayIn, addDays } from '../platform/time.js';
import { safeJson } from '../platform/text.js';
import { num, soft } from './shared.js';

const cents = v => Math.round(v * 100) / 100;

/* ad id -> the product ids of each order that ad won. */
function ordersByAd(touches) {
  const by = new Map();
  for (const t of touches) {
    const list = safeJson(t.products_json || '[]', []);
    const ids = Array.isArray(list) ? [...new Set(list.map(String))] : [];
    if (!ids.length) continue;
    if (!by.has(t.ad_id)) by.set(t.ad_id, []);
    by.get(t.ad_id).push(ids);
  }
  return by;
}

/* Share each ad's spend across the products in its orders, and add it up per ad set. */
function shareSpend(spend, ordersOf, setName) {
  const products = {}, ads = {}, sets = {};
  let total = 0, mapped = 0;
  for (const s of spend) {
    const s30 = num(s.s30);
    total += s30;
    const orders = ordersOf.get(s.ad_id) || [];
    const count = {};
    for (const ids of orders) {
      for (const p of ids) {
        count[p] = (count[p] || 0) + 1;
        const x = products[p] || (products[p] = { spend: 0, orders: 0, ads: 0 });
        x.spend += s30 / orders.length / ids.length;
        x.orders += 1;
      }
    }
    for (const p of Object.keys(count)) products[p].ads += 1;
    if (orders.length) mapped += s30;
    const top = Object.entries(count).sort((x, y) => y[1] - x[1]);
    if (top.length) ads[s.ad_id] = top.slice(0, 2).map(([p, n]) => [p, n]);
    if (s.adset_id) {
      const g = sets[s.adset_id] || (sets[s.adset_id] = { adset_id: s.adset_id, name: setName[s.adset_id] || null, s7: 0, s30: 0, cnt: {} });
      g.s7 += num(s.s7);
      g.s30 += s30;
      for (const [p, n] of Object.entries(count)) g.cnt[p] = (g.cnt[p] || 0) + n;
    }
  }
  return { products, ads, sets, total, mapped };
}

/** The stock and ad spend row of one brand. */
export async function stockAds(ctx, a) {
  const today = dayIn(a.tz, ctx.now), from = addDays(today, -30), week = addDays(today, -7);
  const why = 'a table for this read is not there yet, the old route went on with nothing';
  const touches = await soft(ctx.db.all('store.touchOrders', { act: a.act_id, from }), [], why);
  const spend = await soft(ctx.db.all('store.adSpendMonth', { act: a.act_id, from, week }), [], why);
  const names = await soft(ctx.db.all('store.adsetNames', { act: a.act_id }), [], why);
  const setName = Object.fromEntries(names.map(s => [s.adset_id, s.name]));
  const { products, ads, sets, total, mapped } = shareSpend(spend, ordersByAd(touches), setName);
  for (const p of Object.values(products)) p.spend = cents(p.spend);
  const adsets = Object.values(sets).filter(g => g.s30 > 0)
    .map(g => ({ adset_id: g.adset_id, name: g.name, s7: cents(g.s7), s30: cents(g.s30),
      products: Object.entries(g.cnt).sort((x, y) => y[1] - x[1]).slice(0, 3) }))
    .sort((x, y) => y.s30 - x.s30);
  return { act_id: a.act_id, name: a.name, from, to: today, model: 'lastPlatformClick', spend: Math.round(total),
    mapped: Math.round(mapped), products, ads, adsets };
}
