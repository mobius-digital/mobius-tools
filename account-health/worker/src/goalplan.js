/* Is a month PLANNED (somebody typed its sales goal) or only carrying an earlier month's goal? (2026-11-26)
   Planned when the month's own "YYYY-MM" key has a sales goal, or when defaultCovers says "default" holds this month's
   goal. Every save writes the month key AND default, so default alone cannot say which month it was typed for. A sales
   goal in default with no key for the month is the legacy "current month's goal" brands kept there on purpose: it
   covers months up to DEFAULT_LAST_MONTH, and only while no LATER month has a key of its own (a later save rewrote
   default). After DEFAULT_LAST_MONTH a month needs its own key. A previous month's key alone is never a plan.
   The same rule lives in profit/worker/src/worker.js and engine/worker/src/metrics/series.js; goalsFor in each worker
   takes default's numbers for a month default covers, so planned and the goal shown come from the same place.
   `g` = the parsed goals_json object (or its JSON string). Pure. */
export const DEFAULT_LAST_MONTH = '2026-11';

const parse = g => {
  if (typeof g === 'string') { try { return JSON.parse(g); } catch { return null; } }
  return g;
};

export function defaultCovers(g, ym) {
  g = parse(g);
  if (!g || typeof g !== 'object' || !(ym <= DEFAULT_LAST_MONTH)) return false;
  const d = g.default;
  if (!(d && typeof d === 'object' && d.sales != null)) return false;
  return !Object.keys(g).some(k => /^\d{4}-\d{2}$/.test(k) && k > ym);
}

export function monthPlanned(g, ym) {
  g = parse(g);
  if (!g || typeof g !== 'object') return false;
  const own = g[ym];
  if (own && typeof own === 'object' && own.sales != null) return true;
  return defaultCovers(g, ym);
}

/* Mutates `goals` before a write for `month` (a "YYYY-MM" key or "default"): when default is what plans
   DEFAULT_LAST_MONTH, that goal moves into the month's own key first, so the write cannot unplan it or change its
   number. Same as profit worker.js keepDefaultMonth. */
export function keepDefaultMonth(goals, month) {
  const L = DEFAULT_LAST_MONTH;
  if (!goals || typeof goals !== 'object' || month === L || !defaultCovers(goals, L) || goals[L]?.sales != null) return goals;
  goals[L] = { ...goals.default, ...(goals[L] || {}) };
  return goals;
}
