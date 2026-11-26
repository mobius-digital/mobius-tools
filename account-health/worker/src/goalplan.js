/* Is a month PLANNED (somebody typed its sales goal) or only carrying an earlier month's goal? (2026-11-26)
   Planned when the month's own "YYYY-MM" key has a sales goal, or when it does not (no key at all, or a key a margin
   or spend-only save left without sales) and "default" has a sales goal: brands keep the current month's goal in
   default on purpose. Only falling back to a PREVIOUS MONTH's key (goalsFor's inheritedGoals) is unplanned.
   The same rule lives in profit/worker/src/worker.js goalsPlanned and engine/worker/src/metrics/series.js goalsPlanned.
   `g` = the parsed goals_json object (or its JSON string). Pure. */
export function monthPlanned(g, ym) {
  if (typeof g === 'string') { try { g = JSON.parse(g); } catch { g = null; } }
  if (!g || typeof g !== 'object') return false;
  const own = g[ym];
  if (own && typeof own === 'object' && own.sales != null) return true;
  const d = g.default;
  return !!(d && typeof d === 'object' && d.sales != null);
}
