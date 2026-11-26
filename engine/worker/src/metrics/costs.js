/* A brand's own cost rules, read side only: which rule prices a day, and what it comes to. */
// from profit/worker/src/costs.js (APPLIED, activeRule, ruleCosts, shippingRuled)

const COSTS = ['shipping', 'product'];
/* The rule types that can be worked out from the daily numbers held today. Every other type is saved only. */
const APPLIED = new Set(['per_order', 'pct_revenue']);
const SRC_RANK = { connection: 3, sheet: 2, typed: 1 };
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** The one rule that prices `cost` on `date`: on, a type that can be worked out, started, not ended.
 *  Connection beats sheet beats typed, then the latest start, then the newest row. */
export function activeRule(rules, cost, date) {
  let best = null;
  for (const r of rules || []) {
    if (!r || r.cost !== cost || (r.status || 'on') !== 'on' || !APPLIED.has(r.rule)) continue;
    if (!YMD.test(r.start_date || '') || r.start_date > date || (r.end_date && r.end_date < date)) continue;
    if (!best) { best = r; continue; }
    const a = SRC_RANK[r.source] || 1, b = SRC_RANK[best.source] || 1;
    if (a > b || (a === b && (r.start_date > best.start_date || (r.start_date === best.start_date && (+r.id || 0) > (+best.id || 0))))) best = r;
  }
  return best;
}

/** null when nothing applies (the caller keeps the tracker's number), else { shipping?, product?, src }.
 *  day = { sales, orders }. A per order rule on a day with no order count gives nothing for that day. */
export function ruleCosts(rules, date, day) {
  if (!rules || !rules.length) return null;
  const out = {};
  let any = false;
  for (const cost of COSTS) {
    const r = activeRule(rules, cost, date);
    if (!r) continue;
    const a = +r.amount || 0;
    const v = r.rule === 'per_order' ? (day.orders != null ? Math.max(0, +day.orders) * a : null)
      : r.rule === 'pct_revenue' ? (day.sales != null ? Math.max(0, +day.sales) * a / 100 : null) : null;
    if (v != null) { out[cost] = v; (out.src ??= {})[cost] = r.source || 'typed'; any = true; }
  }
  return any ? out : null;
}

/** true when the list holds a shipping rule that applies on any day of [from, to]. */
export function shippingRuled(rules, from, to) {
  return (rules || []).some(r => r && r.cost === 'shipping' && (r.status || 'on') === 'on' && APPLIED.has(r.rule)
    && YMD.test(r.start_date || '') && r.start_date <= to && (!r.end_date || r.end_date >= from));
}
