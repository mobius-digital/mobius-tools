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
