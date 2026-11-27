/* Where the month lands, built bottom up from two layers that add up: returning customers (the steady
   base, with a day of the week shape) and new customers (bought with ad spend at the recent rate).
   Email revenue cuts across both, so it is shown beside them and never added in.
   Nothing here reads the database: `raw` is what load.js returns. */
// from profit/worker/src/worker.js (forecastFor, weekBuckets, monthHistory, planMath, dowOf, prevMonth)
import { mer, pct, safeDiv } from '../numbers/defs.js';
import { addDays, monthOf } from '../platform/time.js';
import { totals } from './money.js';
import { buildSeries, goalsFor, daysInMonth } from './series.js';
import { storeTag } from './storesource.js';

const dowOf = d => new Date(`${d}T12:00:00Z`).getUTCDay();
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pad = n => String(n).padStart(2, '0');

export const prevMonth = ym => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
};

/** The first day and the last day the forecast and the plan need loaded for a month. */
export function forecastWindow(ym, today) {
  const dim = daysInMonth(ym);
  const monthEnd = `${ym}-${pad(dim)}`;
  const lastActual = today > monthEnd ? monthEnd : addDays(today, -1);
  return { dim, monthStart: `${ym}-01`, monthEnd, lastActual, tFrom: addDays(lastActual, -27) };
}

/** The month cut into weeks. Weeks follow the month, not Sundays, so the first and last are often short. */
export function weekBuckets(rows, ym, dim, goals) {
  const byDate = Object.fromEntries(rows.map(r => [r.date, r]));
  const dayTarget = goals.sales != null ? goals.sales / dim : null;
  const out = [];
  for (let start = 1; start <= dim; start += 7) {
    const end = Math.min(start + 6, dim);
    const days = [];
    for (let d = start; d <= end; d++) days.push(`${ym}-${pad(d)}`);
    const actualDays = days.filter(d => byDate[d]?.sales != null);
    const sales = actualDays.reduce((a, d) => a + byDate[d].sales, 0);
    const spend = actualDays.reduce((a, d) => a + (byDate[d].spend ?? 0), 0);
    out.push({
      from: days[0], to: days[days.length - 1], days: days.length,
      days_done: actualDays.length,
      complete: actualDays.length === days.length,
      target: dayTarget != null ? dayTarget * days.length : null,
      // A week in progress is compared with the days gone by, or it always looks like a miss.
      target_to_date: dayTarget != null ? dayTarget * actualDays.length : null,
      sales: actualDays.length ? sales : null,
      spend: actualDays.length ? spend : null,
    });
  }
  return out;
}

/* The last 28 whole days: what returning customers bring per day of the week, and what a dollar of
   spend brings in new customer revenue. */
function trailingBasis(trailing, piv) {
  const retByDow = Array.from({ length: 7 }, () => []);
  let tNew = 0, tSpend = 0, tEmail = 0, tSales = 0;
  for (const r of trailing) {
    if (r.ret_rev != null) retByDow[dowOf(r.date)].push(r.ret_rev);
    tNew += r.new_rev ?? 0;
    tSpend += r.spend ?? 0;
    tSales += r.sales ?? 0;
    tEmail += piv.klaviyoPlacedOrderSales?.[r.date] ?? 0;
  }
  const retAll = mean(retByDow.flat()) ?? 0;
  return { retAll, retFor: d => mean(retByDow[dowOf(d)]) ?? retAll,
    amer: tSpend > 0 ? mer(tNew, tSpend) : null, spendPerDay: tSpend / trailing.length, tEmail, tSales };
}

/* What it takes from here to hit the goal. Returning revenue arrives on its own, so the shortfall has to
   be bought with new customers. */
function toHitOf(goal, mtdSales, daysLeft, b) {
  if (goal == null || !daysLeft) return null;
  const shortfall = goal - mtdSales;
  const perDay = shortfall / daysLeft;
  const newPerDay = perDay - (b.retAll || 0);
  const spendNeeded = b.amer && newPerDay > 0 ? newPerDay / b.amer : null;
  return {
    revenue_per_day: perDay,
    new_per_day: newPerDay,
    spend_per_day: spendNeeded,
    spend_ramp: spendNeeded != null && b.spendPerDay > 0 ? safeDiv(spendNeeded, b.spendPerDay) : null,
    already_there: shortfall <= 0,
    covered_by_returning: newPerDay <= 0,
  };
}

const sumOf = (rows, key) => rows.reduce((a, r) => a + (r[key] ?? 0), 0);

/** The forecast of one month, or null when there is no recent history to build on. */
export function forecastFor(raw, acct, ym, today) {
  const w = forecastWindow(ym, today);
  // The same day model as everywhere else, so revenue means here what it means on every screen.
  const { rows, piv, store } = buildSeries(raw, acct, w.tFrom, w.monthEnd);
  const trailing = rows.filter(r => r.date >= w.tFrom && r.date <= w.lastActual);
  if (!trailing.length) return null;
  const b = trailingBasis(trailing, piv);
  const mtdRows = rows.filter(r => r.date >= w.monthStart && r.date <= w.lastActual);
  const mtd = { sales: sumOf(mtdRows, 'sales'), new_rev: sumOf(mtdRows, 'new_rev'), returning: sumOf(mtdRows, 'ret_rev'),
    spend: sumOf(mtdRows, 'spend') };
  // Forward: returning from its own pattern, new from the spend that is planned.
  const goals = goalsFor(acct, ym);
  const remaining = [];
  for (let d = addDays(w.lastActual, 1); d <= w.monthEnd; d = addDays(d, 1)) remaining.push(d);
  const spendLeft = goals.spend != null ? Math.max(0, goals.spend - mtd.spend) : null;
  const plannedPerDay = spendLeft != null && remaining.length ? spendLeft / remaining.length : b.spendPerDay;
  // Two cases, because the gap between them is the point: spending the rest of the budget, or carrying on as now.
  let expRet = 0, expNew = 0, paceNew = 0;
  for (const d of remaining) {
    expRet += b.retFor(d);
    expNew += b.amer != null ? plannedPerDay * b.amer : 0;
    paceNew += b.amer != null ? b.spendPerDay * b.amer : 0;
  }
  const projected = mtd.sales + expRet + expNew;
  const projectedAtPace = mtd.sales + expRet + paceNew;
  const goal = goals.sales ?? null;
  return {
    month: ym, days_in_month: w.dim, days_elapsed: mtdRows.length, days_remaining: remaining.length,
    basis: {
      days: trailing.length, from: w.tFrom, to: w.lastActual,
      amer: b.amer, spend_per_day: b.spendPerDay, returning_per_day: b.retAll,
      email_share: b.tSales > 0 ? pct(b.tEmail, b.tSales) : null, email_connected: b.tEmail > 0,
    },
    mtd,
    expected: { returning: expRet, new_rev: expNew, spend: plannedPerDay * remaining.length, sales: expRet + expNew },
    projected, goal,
    gap: goal != null ? projected - goal : null,
    at_current_pace: {
      sales: projectedAtPace,
      spend: mtd.spend + b.spendPerDay * remaining.length,
      gap: goal != null ? projectedAtPace - goal : null,
    },
    planned_spend_per_day: plannedPerDay,
    spend_ramp: b.spendPerDay > 0 ? safeDiv(plannedPerDay, b.spendPerDay) : null,
    to_hit: toHitOf(goal, mtd.sales, remaining.length, b),
    weeks: weekBuckets(rows, ym, w.dim, goals),
    ...storeTag(store),
  };
}

/** The months a history of `n` months ending at `upToYm` covers, oldest first. */
export function historyMonths(upToYm, n) {
  const months = [];
  let m = upToYm;
  for (let i = 0; i < n; i++) { months.unshift(m); m = prevMonth(m); }
  return months;
}

/** The last `n` months of real numbers: the table to look at before agreeing next month's goal. */
export function monthHistory(raw, acct, upToYm, n, today) {
  const months = historyMonths(upToYm, n);
  const { rows, store } = buildSeries(raw, acct, `${months[0]}-01`, `${upToYm}-${pad(daysInMonth(upToYm))}`);
  const out = months.map(ym => {
    const mr = rows.filter(r => r.date.startsWith(ym));
    if (!mr.length) return { month: ym, empty: true };
    const t = totals(mr);
    return {
      month: ym, days: mr.length, days_in_month: daysInMonth(ym),
      partial: ym === monthOf(today),
      sales: t.sales, spend: t.spend, new_rev: t.new_rev, returning: t.ret_rev,
      cm: t.cm, margin: t.margin, mer: t.mer, amer: t.amer, new_share: t.new_share,
    };
  });
  // Where the store numbers came from, on the array itself: JSON leaves it out, the plan reads it.
  out.store = store;
  return out;
}

/* The sales goal and the spend it takes, entered from one of three ends. */
function goalAndSpend(mode, value, expectedReturning, amer, basisSales) {
  if (mode === 'spend') {
    const requiredSpend = Math.max(0, value);
    return { goalSales: expectedReturning + (amer ? requiredSpend * amer : 0), requiredSpend, unreachable: null };
  }
  if (mode === 'mer') {
    if (amer == null || value <= amer) {
      return { goalSales: null, requiredSpend: null, unreachable: amer != null
        ? `A ${value.toFixed(2)}x MER is not reachable while acquisition runs at ${amer.toFixed(2)}x: blended MER can only exceed aMER by whatever returning customers add on top.`
        : 'No acquisition efficiency measured yet, so a MER target cannot be costed.' };
    }
    const requiredSpend = expectedReturning / (value - amer);
    return { goalSales: value * requiredSpend, requiredSpend, unreachable: null };
  }
  const goalSales = basisSales * (1 + value);
  const newNeeded = Math.max(0, goalSales - expectedReturning);
  return { goalSales, requiredSpend: amer ? newNeeded / amer : null, unreachable: null };
}

/** One plan, said three ways. Returning revenue is expected to arrive on its own. Everything above it is
 *  bought at the recent rate: growth ("up 10 percent"), spend ("we have this much") or mer ("we need 2.5"). */
export function planMath(mode, value, ctx, basisSales) {
  const expectedReturning = (ctx.returning_per_day ?? 0) * ctx.days_in_month;
  const { goalSales, requiredSpend, unreachable } = goalAndSpend(mode, value, expectedReturning, ctx.amer ?? null, basisSales);
  const margin = ctx.margin ?? null;
  const expectedCm = margin != null && requiredSpend != null && goalSales != null ? goalSales * margin - requiredSpend : null;
  const growth = goalSales != null && basisSales ? safeDiv(goalSales, basisSales) : null;
  return {
    mode, input: value, unreachable,
    sales: goalSales, expected_returning: expectedReturning,
    new_needed: goalSales != null ? Math.max(0, goalSales - expectedReturning) : null,
    required_spend: requiredSpend,
    growth_pct: growth != null ? growth - 1 : null,
    implied_mer: requiredSpend && goalSales != null ? mer(goalSales, requiredSpend) : null,
    expected_cm: expectedCm,
    expected_cm_margin: expectedCm != null && goalSales ? pct(expectedCm, goalSales) : null,
  };
}
