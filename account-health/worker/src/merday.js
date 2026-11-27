/* SALES THAT COUNT TOWARD MER, for the readers that skip storeSwitch (2026-11-27).
 *
 * MER = sales from the channels a brand counts / all ad spend (profit merchannels.js). Readers that build their pivot
 * through storeSwitch get `merExcluded` in it for free. The ones that read tw_daily or a live Triple Whale summary on
 * their own (alerts, automations, the live check, the Day check post, the War Room) ask here for the sales left out of
 * MER per day, and subtract them from sales before dividing by spend. Store sales, orders and AOV stay whole.
 *
 * A day with no channel rows (never synced, or the sync has not reached it) leaves nothing out, so MER reads on
 * whole-store sales there, exactly as before. Any read failure does the same: MER never breaks a check. */
import { readMer, excludedByDay, merSalesFor } from '../../../profit/worker/src/merchannels.js';

/** { date: sales left out of MER } for one brand over [from, to]. Empty on any failure. */
export async function merExcluded(env, act, from, to) {
  if (!act || !env?.DB || !from || !to) return {};
  try {
    const mer = await readMer(env, [act], from, to);
    const out = {};
    for (const [d, v] of Object.entries(excludedByDay(mer.rows[act] || [], mer.cfg[act]))) if (d >= from && d <= to) out[d] = v.sales;
    return out;
  } catch { return {}; }
}

/** The same for several brands at once: { act: { date: sales } }. */
export async function merExcludedMany(env, acts, from, to) {
  const list = [...new Set((acts || []).filter(Boolean))];
  const out = {};
  for (const a of list) out[a] = {};
  if (!list.length || !env?.DB || !from || !to) return out;
  try {
    const mer = await readMer(env, list, from, to);
    for (const a of list) for (const [d, v] of Object.entries(excludedByDay(mer.rows[a] || [], mer.cfg[a]))) if (d >= from && d <= to) out[a][d] = v.sales;
  } catch { /* whole-store MER */ }
  return out;
}

/** Left-out sales summed over [from, to] from a { date: sales } map. */
export const excludedSum = (ex, from, to) => { let s = 0; for (const [d, v] of Object.entries(ex || {})) if (d >= from && d <= to) s += +v || 0; return s; };

export { merSalesFor };
