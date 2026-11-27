/* The two Customers charts, as options for the kit's one chart (lineChart). Nothing is drawn here:
   this file only turns the page's data into series, labels and marks, plus two small sums. */

import { h, lineChart, money, num, pct } from '../../kit.js';
import { tipRows, isPhone } from '../month/_m.js';

const ok = n => n != null && isFinite(n);
const dollars = v => money(Math.round(v));
const b = v => h('b', null, v);

/** ltvChart({ days, values, cac })
    LTV per customer from the first order (day 0) to the last horizon, at the real day positions,
    against a dashed line for the cost per new customer. The LTV line is the lead. */
export function ltvChart({ days = [], values = [], cac, windowLabel } = {}) {
  const pts = days.map((d, i) => ({ d, v: values[i] })).filter(p => ok(p.d) && ok(p.v));
  const last = pts[pts.length - 1];
  const cross = crossing(pts, cac);
  /* on a phone only the first and last points keep their figure, so they never sit on the payback words */
  const phone = isPhone();
  return lineChart({
    xs: pts.map(p => p.d),
    series: [{ name: 'LTV per customer', lead: true, points: true, values: pts.map(p => p.v), labels: (v, i) => (!phone || i === 0 || i === pts.length - 1 ? dollars(v) : '') }],
    labels: pts.map((p, i) => (i === 0 || p === last ? 'Day ' + p.d : String(p.d))),
    goal: ok(cac) ? { value: cac, label: 'Cost per new customer ' + dollars(cac), at: 'end' } : null,
    marks: cross ? [{ at: cross.d, value: cac, text: cross.text }] : [],
    format: dollars, yTicks: 3, height: 300, phoneHeight: 270, empty: 'No order history yet',
    windowLabel: windowLabel || (pts.length ? `By day after the first order, day 0 to ${last.d}` : null),
    label: pts.length > 1
      ? `LTV per customer from the first order to day ${last.d}, on an axis that starts at 0 dollars` + (ok(cac) ? `, against the cost per new customer of ${dollars(cac)}` : '') + `. LTV reaches ${dollars(last.v)} at day ${last.d}.`
      : 'LTV per customer',
    hover: i => tipRows(i ? 'Day ' + pts[i].d : 'First order', [['LTV per customer', dollars(pts[i].v), 'lead'], ok(cac) ? ['Cost per new customer', dollars(cac), 'dash'] : null]),
  });
}

/** Where LTV meets the cost of the customer: the first order, a later day, or never. */
export function crossing(pts, cac) {
  if (!ok(cac) || !pts.length) return null;
  const first = pts[0];
  if (Math.abs(first.v - cac) <= cac * 0.02) return { d: 0, text: 'They cross on the first order: ' + dollars(cac) };
  if (first.v > cac) return { d: 0, text: 'Paid back on the first order: ' + dollars(first.v) };
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].v >= cac) {
      const a = pts[i - 1], c = pts[i];
      const day = Math.round(a.d + (c.d - a.d) * (cac - a.v) / ((c.v - a.v) || 1));
      return { d: day, text: 'Paid back around day ' + day };
    }
  }
  return null;
}

/** againChart({ weeks, sameDay, repeaters, halfDay })
    Second orders in each week after the first order (columns, the busiest in ink), with the running
    share of repeat buyers as a slate line against the right axis and a mark where half are back. */
export function againChart({ weeks = [], sameDay = 0, repeaters, halfDay } = {}) {
  const n = weeks.length, peak = Math.max(0, ...weeks.filter(ok)), peakAt = weeks.indexOf(peak);
  const total = ok(repeaters) && repeaters > 0 ? repeaters : null;
  /* on a phone the columns are too narrow for a figure each: only the busiest week keeps its number */
  const phone = isPhone();
  let cum = sameDay || 0;
  const share = total ? weeks.map(v => { cum += v || 0; return Math.min(1, cum / total); }) : null;
  return lineChart({
    series: [
      { type: 'bar', tone: 'brand', name: 'Second orders that week', values: weeks, dimAt: i => i !== peakAt, labels: (v, i) => (!phone || i === peakAt ? num(v) : '') },
      share && { name: 'Running share of repeat buyers', axis: 'right', values: share, end: false },
    ],
    labels: weeks.map((_, i) => (i === 0 || i === n - 1 ? 'Week ' + (i + 1) : String(i + 1))),
    y2: { max: 1, format: v => pct(v) },
    marks: share && ok(halfDay) && halfDay <= n * 7 ? [{ at: halfDay / 7, value: 0.5, axis: 'right', text: 'Half by day ' + halfDay, line: true }] : [],
    format: v => num(v), endLabels: false, fill: false, height: 360, phoneHeight: 300, min: 1, empty: 'No second orders yet',
    windowLabel: n ? `Weekly, week 1 to ${n} after the first order` : null,
    label: `Customers placing a second order in each week after the first order, week 1 to week ${n}` + (total ? ', with the running share of repeat buyers' : '')
      + (peak ? `. Week ${peakAt + 1} is the busiest with ${num(peak)}.` : '') + (ok(halfDay) ? ` Half of repeat buyers are back by day ${halfDay}.` : ''),
    hover: i => tipRows('Week ' + (i + 1), [['Second orders', num(weeks[i]), 'ink'], share ? ['Repeat buyers back by day ' + ((i + 1) * 7 - 1), pct(share[i], { digits: 1 }), 'slate'] : null]),
  });
}

/** The day half of the repeat buyers have placed their second order, from the weekly counts. */
export function halfDayOf(weeks, sameDay, repeaters) {
  if (!ok(repeaters) || repeaters <= 0) return null;
  let cum = sameDay || 0;
  if (cum >= repeaters / 2) return 0;
  for (let i = 0; i < weeks.length; i++) {
    const next = cum + (weeks[i] || 0);
    if (next >= repeaters / 2) return Math.round((i + (repeaters / 2 - cum) / ((weeks[i] || 0) || 1)) * 7);
    cum = next;
  }
  return null;
}
