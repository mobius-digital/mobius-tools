/* Meetings > Agenda: "Week plans still to write" (2026-11-26, move lines a54). On a Monday, the brands with no week
   plan yet and the strategist who writes it, the row the Monday Slack thread line used to be. Behind the agency
   switch feature:weekPlan (missing = on). Data: GET /api/mywork/weekplan on the account-health worker (mywork.js
   weekPlanMissing: the 7am Monday list minus the weeks posted). The strategist also has it as a My day line.
   weekRows is pure (tested in test-locus-homes.mjs). */

import { h, avatar, statusDot } from '../../kit.js';

/** One row per strategist (nobody named = the owner), their brands listed. [] when off, not Monday, or all written. Pure. */
export function weekRows(r) {
  if (!r || r.on === false || !r.monday || !Array.isArray(r.brands) || !r.brands.length) return [];
  const by = new Map();
  for (const b of r.brands) { const k = b.strategist || ''; (by.get(k) || by.set(k, []).get(k)).push(b.name || b.act); }
  return [...by.entries()].map(([who, names]) => ({ who: who || 'The owner', brands: names, text: `Write this week's plan for ${names.length} ${names.length === 1 ? 'brand' : 'brands'}` }))
    .sort((a, b) => b.brands.length - a.brands.length);
}

/** The section, or null when there is nothing to write. */
export function weekSection(r) {
  const rows = weekRows(r);
  if (!rows.length) return null;
  return h('section', { class: 'mt-open', style: { gap: '14px' } },
    h('div', { class: 'mt-h' }, h('h3', null, 'Week plans still to write'), h('span', null, 'before the call; each shows on the call screen once posted')),
    rows.map(x => h('div', { class: 'mt-ex' }, avatar({ name: x.who }, { size: 30 }),
      h('span', null, h('b', null, x.who + ': ' + x.text), h('small', null, x.brands.join(', '))),
      statusDot('warn', 'not posted'))));
}
