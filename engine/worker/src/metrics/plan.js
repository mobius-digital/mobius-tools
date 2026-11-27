/* Where the month lands (the forecast) and the month plan: what the last months did, what the month looks
   like at each growth choice, and what was agreed. Read only. Saving a plan stays on the old engine. */
// from profit/worker/src/worker.js (/api/forecast near 2348, GET /api/plan near 2360)
import { fail } from '../platform/errors.js';
import { dayIn, monthOf } from '../platform/time.js';
import { safeJson } from '../platform/text.js';
import { goalsFor, goalsPlanned, pubAccount, daysInMonth } from './series.js';
import { forecastFor, forecastWindow, monthHistory, historyMonths, planMath } from './forecast.js';
import { oneAccount, loadRaw } from './load.js';
import { storeTag } from './storesource.js';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const HISTORY_MONTHS = 8;
const pad = n => String(n).padStart(2, '0');
const isNumber = v => v != null && v !== '' && isFinite(+v);

/** GET /pw/api/forecast: where the month lands, spending the budget and at today's pace. */
export async function forecast(ctx, input) {
  const acct = await oneAccount(ctx);
  if (!acct) fail(404, 'unknown account');
  const today = dayIn(acct.tz, ctx.now);
  const ym = input.query.month || monthOf(today);
  if (!MONTH.test(ym)) return ctx.forward('the month asked for is not a month, so the old engine answers as it always did');
  const w = forecastWindow(ym, today);
  const raw = await loadRaw(ctx, [acct.act_id], w.tFrom, w.monthEnd);
  const f = forecastFor(raw, acct, ym, today);
  if (!f) fail(400, 'not enough Triple Whale history to forecast yet');
  return { data: { account: pubAccount(acct), ...f }, meta: { window: { from: w.tFrom, to: w.monthEnd, tz: acct.tz } } };
}

/* The sales figure next month is agreed against: the last complete month when there is one, else the
   current month at its run rate. A half finished month would set the goal too low. */
function basisOf(history, ym, curMonth) {
  const complete = history.filter(h => !h.empty && !h.partial && h.days >= h.days_in_month - 2 && h.month < ym);
  const lastComplete = complete[complete.length - 1] || null;
  const current = history.find(h => h.month === curMonth && !h.empty && h.month < ym) || null;
  const basis = lastComplete
    ? { sales: lastComplete.sales, label: `${lastComplete.month} actual`, month: lastComplete.month }
    : current
      ? { sales: current.sales / current.days * current.days_in_month, label: `${current.month} run-rate`, month: current.month }
      : null;
  return { basis, marginSrc: lastComplete || current };
}

/* What the plan rests on. The measured values are the defaults. The planner may overrule any of them,
   and the answer says which ones were set by hand. */
function planContext(ym, fc, marginSrc, basis, ov) {
  const measured = {
    returning_per_day: fc?.basis?.returning_per_day ?? null,
    amer: fc?.basis?.amer ?? null,
    margin: marginSrc?.margin ?? null,
  };
  // An override only counts when it is a real number. null and '' mean "back to measured".
  const pick = k => (isNumber(ov[k]) ? +ov[k] : measured[k]);
  return {
    days_in_month: daysInMonth(ym),
    returning_per_day: pick('returning_per_day'),
    amer: pick('amer'),
    margin: pick('margin'),
    measured,
    overrides: Object.fromEntries(['returning_per_day', 'amer', 'margin'].filter(k => pick(k) !== measured[k]).map(k => [k, pick(k)])),
    // The least that is spent per day whatever the month does. A floor, not part of the sums.
    spend_floor_per_day: isNumber(ov.spend_floor_per_day) ? +ov.spend_floor_per_day : null,
    sources: {
      trailing_days: fc?.basis?.days ?? null,
      trailing_from: fc?.basis?.from ?? null,
      trailing_to: fc?.basis?.to ?? null,
      margin_month: marginSrc?.month ?? null,
      basis_month: basis?.month ?? null,
      trailing_spend_per_day: fc?.basis?.spend_per_day ?? null,
    },
  };
}

/* A month that has run, or is running, shows what really happened beside the plan. */
function actualOf(history, ym, status) {
  if (status === 'future') return null;
  const h = history.find(x => x.month === ym && !x.empty);
  if (!h) return null;
  return { sales: h.sales, spend: h.spend, cm: h.cm, mer: h.mer, amer: h.amer, days: h.days, days_in_month: h.days_in_month,
    partial: !!h.partial };
}

const paceOf = fc => ({
  days_elapsed: fc.days_elapsed, days_remaining: fc.days_remaining,
  days_in_month: fc.days_in_month, mtd_sales: fc.mtd?.sales ?? null,
  mtd_spend: fc.mtd?.spend ?? null, spend_per_day: fc.basis?.spend_per_day ?? null,
  projected: fc.projected, at_pace: fc.at_current_pace?.sales ?? null,
  store_source: fc.store_source,
});

/** GET /pw/api/plan: the plan of one month for one brand. */
export async function plan(ctx, input) {
  const acct = await oneAccount(ctx);
  if (!acct) fail(404, 'unknown account');
  const today = dayIn(acct.tz, ctx.now);
  const curMonth = monthOf(today);
  const ym = input.query.month || curMonth;
  if (!MONTH.test(ym)) return ctx.forward('the month asked for is not a month, so the old engine answers as it always did');
  const upTo = curMonth > ym ? curMonth : ym;
  const months = historyMonths(upTo, HISTORY_MONTHS);
  const fw = forecastWindow(curMonth, today);
  const from = [`${months[0]}-01`, fw.tFrom].sort()[0];
  const raw = await loadRaw(ctx, [acct.act_id], from, `${upTo}-${pad(daysInMonth(upTo))}`);
  const history = monthHistory(raw, acct, upTo, HISTORY_MONTHS, today);
  const { basis, marginSrc } = basisOf(history, ym, curMonth);
  const fc = forecastFor(raw, acct, curMonth, today);
  const saved = await ctx.db.one('metrics.planRow', { act: acct.act_id, month: ym });
  const pctx = planContext(ym, fc, marginSrc, basis, safeJson(saved?.assumptions_json, {}) || {});
  const status = ym < curMonth ? 'past' : ym === curMonth ? 'current' : 'future';
  const live = status === 'current' && fc;
  return {
    account: pubAccount(acct), month: ym, status, actual: actualOf(history, ym, status), history, basis, ctx: pctx,
    options: basis ? [0, 0.1, 0.2, 0.3].map(g => planMath('growth', g, pctx, basis.sales)) : [],
    // What it takes from here. Only the month in flight has one.
    to_hit: live ? fc.to_hit : null,
    pace: live ? paceOf(fc) : null,
    goals: goalsFor(acct, ym), plan: saved || null,
    // A month counts as planned only when somebody typed a sales goal for that month (goalsPlanned).
    planned: goalsPlanned(acct, ym),
    current_month: curMonth,
    at_current_pace: fc ? { projected: fc.at_current_pace?.sales ?? null, month: fc.month } : null,
    // Where the history's store numbers came from (storesource.js); the pace has its own store_source.
    ...storeTag(history.store),
  };
}
