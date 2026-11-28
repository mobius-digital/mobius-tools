/* HANDS OFF (Cole 2026-11-28): one per-brand flag that every call surface honors. A hands-off brand gets no Yes,
   Approve or pause rows anywhere (the rule-engine buyer list, the morning AI read, Meta Suggestions, the War Room);
   at most a read-only line. Saved where brand settings live: brands.goals_json.hands_off (true or false). When a brand
   has never saved it, the default below applies, so the three brands are hands off with no manual step:
   Dental Fresh and Veterinary Formula (Synergy, not ours yet) and Ice & Gold (Fela runs her own buying).
   One file for both workers: account-health imports it from here (as atria.js imports season.js). */
export const HANDS_OFF_DEFAULT = Object.freeze(['brand_dental_fresh', 'brand_veterinary_formula', 'brand_ice_and_gold']);
export const HANDS_OFF_WHY = 'Hands off: Locus makes no calls on this brand.';

const goalsOf = a => {
  if (!a) return {};
  if (a.goals && typeof a.goals === 'object') return a.goals;
  try { const g = JSON.parse(a.goals_json || '{}'); return g && typeof g === 'object' ? g : {}; } catch { return {}; }
};
/** True when no call may be made on this brand. a: a brand row ({act_id, goals | goals_json}) or a brand id. */
export function handsOff(a) {
  const id = typeof a === 'string' ? a : a && (a.act_id || a.brand_id || a.id);
  const v = typeof a === 'string' ? undefined : goalsOf(a).hands_off;
  if (v === true || v === 1 || v === 'true') return true;
  if (v === false || v === 0 || v === 'false') return false;
  return HANDS_OFF_DEFAULT.includes(String(id || ''));
}
