/* The one file of formulas. A group never types one of these itself (CONTRACT.md section 8).
   A number that is not known is null, never 0. Signatures are frozen. */
// from profit/worker/src/worker.js (dayEconomics, totals, sum) and hub.js (div)

const known = v => v !== null && v !== undefined && Number.isFinite(+v);

/** a divided by b. null when a or b is not known, or b is 0. */
export function safeDiv(a, b) {
  if (!known(a) || !known(b) || +b === 0) return null;
  return +a / +b;
}

/** Revenue credited to ads on one platform, divided by that platform's spend. */
export const roas = (revenue, spend) => safeDiv(revenue, spend);

/** Revenue divided by ad spend on every platform plus extra ad costs. */
export const mer = (revenue, spend_all) => safeDiv(revenue, spend_all);

/** Spend divided by orders (or by new customers, for the cost of a new customer). */
export const cpa = (spend, orders) => safeDiv(spend, orders);

/** Revenue divided by orders. */
export const aov = (revenue, orders) => safeDiv(revenue, orders);

/** Spend for a thousand impressions. */
export function cpm(spend, impressions) {
  const v = safeDiv(spend, impressions);
  return v === null ? null : v * 1000;
}

/** Clicks divided by impressions, as a share (0.02 is 2 percent). */
export const ctr = (clicks, impressions) => safeDiv(clicks, impressions);

/** Orders divided by sessions, as a share. */
export const cvr = (orders, sessions) => safeDiv(orders, sessions);

/** A part of a whole, as a share. */
export const pct = (part, whole) => safeDiv(part, whole);

/** The total of one key over rows. null when no row has the key. */
export function sum(rows, key) {
  let total = 0, any = false;
  for (const r of rows || []) {
    const v = r ? r[key] : null;
    if (known(v)) { total += +v; any = true; }
  }
  return any ? total : null;
}

/** How far now is from before, as a share of before (0.1 is up 10 percent). */
export function change(now, before) {
  if (!known(now) || !known(before) || +before === 0) return null;
  return (+now - +before) / Math.abs(+before);
}

export { DEFINITIONS, definitionOf } from './catalog.js';
