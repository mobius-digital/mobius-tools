/* Small helpers every store handler shares: the caller's brands, the window, and the day tables. */
// from profit/worker/src/hub.js (handleHub win, twPivotMany, sumM, dates) and worker.js (windowFor, pubAccount)
import { fail, isEngineError } from '../platform/errors.js';
import { swallowed } from '../platform/log.js';
import { dayIn, addDays, windowFor } from '../platform/time.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** 0 for a value that is not a number. The old code's `num`. */
export const num = v => (v == null || !Number.isFinite(+v) ? 0 : +v);

/** A handler throws this when one request needs the old worker. The service turns it into a forward. */
export class NeedsOld extends Error {}

/** The old code went on with a fallback when a read failed (a table not made yet). Same here, and logged. */
export async function soft(promise, fallback, reason) {
  try {
    return await promise;
  } catch (e) {
    if (isEngineError(e) || e instanceof NeedsOld) throw e;
    swallowed(reason, e);
    return fallback;
  }
}

/* Where the store numbers came from (profit storesource.js, 2026-11-26). The engine answers these reads only
   for a brand with no Shopify store totals and no store source setting (shopifyInPlay sends the rest on), and
   for such a brand the old route says exactly this. Same words as storeLabel there. */
export const TRACKER_STORE = { store_source: 'triple_whale', store_label: 'Store numbers: Triple Whale (Shopify not synced yet)' };

/** Do any of these brands have Shopify store totals or a store source setting? Then the old worker answers,
 *  where the switch (storesource.js) lives. A missing table reads as none. */
export async function shopifyInPlay(ctx, acts) {
  const why = 'the Shopify table is not there yet, which the old route reads as none';
  const rows = await soft(ctx.db.all('store.shopAny', { acts }), [], why);
  const set = await soft(ctx.db.all('store.storeModeAny', { acts }), [], why);
  return rows.length > 0 || set.length > 0;
}

/** The brand as the old answers show it. */
export const pubAccount = a => ({ act_id: a.act_id, name: a.name, currency: a.currency, tz: a.tz, tw_shop: a.tw_shop });

/** The brands a hub read covers: the one named, or every active brand the caller has. */
export async function hubBrands(ctx) {
  const all = await ctx.brands.list({ active: true });
  const accts = ctx.scope.brand ? all.filter(a => a.act_id === ctx.scope.brand) : all;
  if (!accts.length) fail(404, 'unknown account');
  return accts;
}

/** One brand by the id the request named, active or not. */
export async function oneBrand(ctx) {
  const all = await ctx.brands.list({ active: false });
  const acct = ctx.scope.brand ? all.find(a => a.act_id === ctx.scope.brand) : null;
  if (!acct) fail(404, 'unknown account');
  return acct;
}

/** The dates a request asked for. A value that is not a day is left out, as the old code did. */
export function askedRange(query) {
  const from = DAY.test(query.from || '') ? query.from : null;
  const to = DAY.test(query.to || '') ? query.to : null;
  return { from, to, days: Math.min(+query.days || 30, 180) };
}

/** The window of one brand with the days before it (cmp: prev, yoy or none). */
export function hubWindow(ctx, acct, asked, cmp) {
  const { from, to } = windowFor(acct.tz, asked, ctx.now);
  const span = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
  let pf = null, pt = null;
  if (cmp === 'prev') {
    pt = addDays(from, -1);
    pf = addDays(pt, -(span - 1));
  } else if (cmp === 'yoy') {
    pf = `${+from.slice(0, 4) - 1}${from.slice(4)}`;
    pt = `${+to.slice(0, 4) - 1}${to.slice(4)}`;
  }
  return { from, to, pf, pt, span, today: dayIn(acct.tz, ctx.now) };
}

/** One window for every brand on the screen: the one that ends first. */
export function sharedWindow(ctx, accts, asked, cmp) {
  return accts.map(a => hubWindow(ctx, a, asked, cmp)).sort((x, y) => (x.to < y.to ? -1 : 1))[0];
}

/** Rows of (date, metric, value) as { metric: { date: value } }. */
export function pivotOf(rows) {
  const piv = {};
  for (const r of rows || []) (piv[r.metric] ??= {})[r.date] = r.value;
  return piv;
}

/** Rows of (act_id, date, metric, value) as { act_id: { metric: { date: value } } }. */
export function pivotsOf(rows, acts) {
  const out = Object.fromEntries(acts.map(a => [a, {}]));
  for (const r of rows || []) ((out[r.act_id] ??= {})[r.metric] ??= {})[r.date] = r.value;
  return out;
}

/** The total of one metric over the days from..to. null when no day has it. */
export function sumMetric(piv, id, from, to) {
  let total = 0, any = false;
  for (const d in piv[id] || {}) {
    if (d >= from && d <= to && piv[id][d] != null) { total += piv[id][d]; any = true; }
  }
  return any ? total : null;
}

/** Every day from..to, both ends in. */
export function daysBetween(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
