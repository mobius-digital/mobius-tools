/* The "spending well below normal" alert (worker.js deliveryPass), in the house style (house.js, 2026-11-26).
 * Kept here, out of worker.js, so a test can build it offline. One message per brand:
 *   header   "Brand is spending well below normal" ("Brand spent nothing so far today" when it is zero)
 *   summary  the buyer tagged, "Check why." and the hint
 *   numbers  spent so far (or yesterday), normal by now (or a normal day), today's budgets when known
 *   context  "Meta · 2:10pm CT · compared with the last 7 days, capped at today's budgets"
 *   button   Open in Locus (the brand's Meta page)
 * r = { period: 'today'|'yesterday', spent, normal, budget, hint } from checkToday / checkCompletedDay. */
import { houseMessage } from './house.js';

export function deliveryMessage(a, who, r, { money, url, now, at } = {}) {
  const today = r.period === 'today';
  const fmt = v => (money ? money(v, a.currency) : `$${Math.round(v).toLocaleString('en-US')}`);
  return houseMessage({
    title: r.spent === 0 ? `${a.name} spent nothing ${today ? 'so far today' : 'yesterday'}` : `${a.name} is spending well below normal`,
    tag: who, summary: `Check why. ${r.hint || ''}`.trim(),
    numbers: [
      { label: today ? 'Today so far' : 'Yesterday', value: fmt(r.spent) },
      { label: today ? 'Normal by now' : 'Normal day', value: fmt(r.normal), note: r.normal > 0 && r.spent > 0 ? `${Math.round((1 - r.spent / r.normal) * 100)}% down` : '' },
      ...(r.budget != null ? [{ label: "Today's budgets", value: fmt(r.budget) }] : []),
    ],
    source: 'Meta', at: at || new Date(), now, context: "compared with the last 7 days, capped at today's budgets",
    buttons: [{ label: 'Open in Locus', url: `${url || 'https://locus.go-mobius-digital.com/profit/'}?open=meta&act=${encodeURIComponent(a.act_id)}` }],
  });
}

/* ---------------- the low side's arithmetic for today, pure (moved from worker.js checkToday, 2026-11-26) ---------------- */
export const DELIVERY_FLOOR = 0.4;       // at or below 40% of normal = something is wrong
export const DELIVERY_MIN_SPEND = 50;    // ignore accounts too small to judge

/** Today so far against the shape of a normal day by this hour, scaled down to today's budgets. p = hourlyPacing's
 *  answer ({ spent, l7_by_now, l7_daily_avg }), budget = liveDailyBudget (null = unknown). Returns exactly what
 *  worker.js checkToday returned before the move: null, or { period: 'today', spent, normal, budget, hint }.
 *  Does not change p. */
export function lowToday(p, budget) {
  if (!p || !(p.l7_by_now >= DELIVERY_MIN_SPEND / 2)) return null;   // too early / too small to judge
  /* Scale "normal by now" down to today's budgets: last week's giveaway spend is not today's normal. */
  let byNow = p.l7_by_now;
  if (budget != null && p.l7_daily_avg > 0 && budget < p.l7_daily_avg) byNow = byNow * budget / p.l7_daily_avg;
  if (!(byNow >= DELIVERY_MIN_SPEND / 2)) return null;
  if (p.spent > byNow * DELIVERY_FLOOR) return null;
  return { period: 'today', spent: p.spent, normal: byNow, budget,
    hint: p.spent === 0 ? 'Check billing, campaign status and policy.' : 'Worth a look in Ads Manager while the day is still live.' };
}

/* ---------------- spend far ABOVE normal (2026-11-26): a Locus alert row only, no Slack post ---------------- */
export const HIGH_FACTOR = 1.5, HIGH_MIN_OVER = 100;
/** Does this spend look far above normal? base = the bigger of the normal and today's budgets, so a budget raised on
 *  purpose (a season budget) raises the bar. Small brands (base under 25) never fire.
 *  Returns null or { spent, base, over }. */
export function spendHigh({ spent, normal, budget } = {}) {
  const s = Number(spent) || 0;
  const base = Math.max(Number(normal) || 0, Number(budget) || 0);
  if (!(base >= 25)) return null;
  if (!(s >= base * HIGH_FACTOR && s - base >= HIGH_MIN_OVER)) return null;
  return { spent: s, base, over: s - base };
}
/** The bar for a COMPLETED day (yesterday): the biggest of the prior days, not their median. The morning after a
 *  planned cut (Dec 1 after Cyber Monday) today's budgets and a median full of quieter days sit far under a day the
 *  sale paid for on purpose, so only spend above every recent day counts as far above normal. prior = spend numbers. */
export function completedDayNormal(prior) {
  const xs = (prior || []).map(Number).filter(Number.isFinite);
  return xs.length ? Math.max(...xs) : 0;
}
/** The alert row's words. a = the brand, r = spendHigh's answer, period 'today' | 'yesterday'. No dashes. */
export function highAlertText(a, r, { money, period = 'today' } = {}) {
  const fmt = v => (money ? money(v, a.currency) : `$${Math.round(v).toLocaleString('en-US')}`);
  const name = (a && a.name) || 'A brand';
  return {
    title: period === 'yesterday' ? `${name} spent far above normal yesterday` : `${name} is spending far above normal`,
    body: `Spent ${fmt(r.spent)} against a normal ${fmt(r.base)} (budgets included). Check for a budget typo, a doubled campaign or a new ad set.`,
  };
}
/** The low alert row's words (the Slack post keeps its own house message). */
export function lowAlertText(a, r, { money } = {}) {
  const fmt = v => (money ? money(v, a.currency) : `$${Math.round(v).toLocaleString('en-US')}`);
  const name = (a && a.name) || 'A brand', today = r.period === 'today';
  return {
    title: r.spent === 0 ? `${name} spent nothing ${today ? 'so far today' : 'yesterday'}` : `${name} ${today ? 'is spending' : 'spent'} far below normal${today ? '' : ' yesterday'}`,
    body: `Spent ${fmt(r.spent)} against a normal ${fmt(r.normal)}${r.budget != null ? ` (budgets today ${fmt(r.budget)})` : ''}. ${r.hint || ''}`.trim(),
  };
}
