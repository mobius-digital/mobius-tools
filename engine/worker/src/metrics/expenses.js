/* A brand's extra costs, read side only: what each comes to per day, spread over a window, and the ones
   marked "counts as ad spend" added to each day's spend. */
// from profit/worker/src/expenses.js (dayValue, spread, applyAdSpend)
import { mer } from '../numbers/defs.js';
import { addDays } from '../platform/time.js';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86400000;
const utc = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const dim = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
const pad = n => String(n).padStart(2, '0');
/* Days in the calendar year and the calendar quarter that hold `d`, and the days from a to b counting both ends. */
const diy = d => { const y = +d.slice(0, 4); return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365; };
const diq = d => {
  const y = d.slice(0, 4), q = Math.floor((+d.slice(5, 7) - 1) / 3) * 3;
  return dim(`${y}-${pad(q + 1)}`) + dim(`${y}-${pad(q + 2)}`) + dim(`${y}-${pad(q + 3)}`);
};
const span = (a, b) => Math.round((utc(b) - utc(a)) / DAY) + 1;
const r2 = x => Math.round(x * 100) / 100;

/** One cost's amount on one day. `row` is that day's numbers (sales, spend, orders) or undefined. */
export function dayValue(e, d, row) {
  const a = +e.amount || 0;
  if (e.kind === 'monthly') return a / dim(d.slice(0, 7));
  if (e.kind === 'once') return d === e.start_date ? a : 0;
  if (e.kind === 'daily') return a;
  if (e.kind === 'weekly') return a / 7;
  if (e.kind === 'quarterly') return a / diq(d);
  if (e.kind === 'yearly') return a / diy(d);
  if (e.kind === 'custom') return YMD.test(e.end_date || '') && e.end_date >= e.start_date ? a / span(e.start_date, e.end_date) : 0;
  if (!row) return 0;
  if (e.kind === 'pct_revenue') return Math.max(0, +row.sales || 0) * a / 100;
  if (e.kind === 'pct_spend') return Math.max(0, +(row.base_spend ?? row.spend) || 0) * a / 100;
  if (e.kind === 'per_order') return Math.max(0, +row.orders || 0) * a;
  return 0;
}

/** Spread a brand's extra costs over [from, to].
 *  Returns { total, ad_total, items, ad_items, byDate, adByDate }. items: [{ id, name, category, kind, rate, amount }] */
export function spread(list, from, to, rows) {
  const out = { total: 0, ad_total: 0, items: [], ad_items: [], byDate: {}, adByDate: {} };
  if (!from || !to || from > to) return out;
  const R = {};
  for (const r of rows || []) if (r && r.date) R[r.date] = r;
  for (const e of list || []) {
    if (!e || !YMD.test(e.start_date || '')) continue;
    if (e.kind === 'once' && e.start_date > to) continue;   // a one time cost dated after the window has not happened yet
    const lo = e.start_date > from ? e.start_date : from;
    const end = e.kind === 'once' ? e.start_date : e.end_date && e.end_date < to ? e.end_date : to;
    const ad = !!+e.is_ad_spend, by = ad ? out.adByDate : out.byDate;
    let amt = 0;
    for (let d = lo; d <= end; d = addDays(d, 1)) {
      const v = dayValue(e, d, R[d]);
      if (v) { amt += v; by[d] = (by[d] || 0) + v; }
    }
    if (!(amt > 0)) continue;
    const it = { id: e.id ?? null, name: e.name, category: e.category || 'other', kind: e.kind, rate: +e.amount || 0, amount: r2(amt) };
    if (ad) { out.ad_items.push(it); out.ad_total += amt; } else { out.items.push(it); out.total += amt; }
  }
  out.items.sort((a, b) => b.amount - a.amount);
  out.ad_items.sort((a, b) => b.amount - a.amount);
  out.total = r2(out.total);
  out.ad_total = r2(out.ad_total);
  return out;
}

/** Add the "counts as ad spend" costs to each day's spend and work out again what rests on it. Changes the rows. */
export function applyAdSpend(rows, adByDate) {
  if (!adByDate) return rows;
  for (const r of rows || []) {
    const x = adByDate[r.date];
    if (!x || r.ad_expense != null) continue;
    r.base_spend = r.spend;
    r.ad_expense = x;
    r.spend = (r.spend || 0) + x;
    r.mer = r.spend ? mer(r.sales, r.spend) : null;
    r.amer = r.new_rev != null && r.spend ? mer(r.new_rev, r.spend) : null;
    r.cm = r.gross_profit != null ? r.gross_profit - r.spend : null;
  }
  return rows;
}
