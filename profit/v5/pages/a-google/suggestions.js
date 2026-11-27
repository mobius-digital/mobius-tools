/* Agency > Google > Suggestions. Every brand's Google money leaks (wasted search terms, campaigns over the goal cost),
   grouped by brand, most money first. Read only.
   Real: account-health GET /api/leaks?act=<brand id>&days=30 for each brand (one call per brand; no all-brands route
   yet), Google areas only. A brand with Google not linked is left out.
   Every brand is asked at the same moment and the page paints each one as it answers, so one slow brand (its
   leak read is worked out fresh when the worker's kept copy has run out) no longer holds the others back. */
import { h, em, put, skeleton } from '../../kit.js';
import { loadParts, follow, reading } from '../_parts.js';
import { world, soft } from '../a-today/_ag.js';
import { renderSuggestions } from '../a-today/_more.js';
import { polishSuggestions } from '../platforms/_ads.js';

const kindOf = l => /search|pmax/.test(l.area) && /:negatives|:categories/.test(l.id) ? 'negative' : /no sale/.test(l.title || '') ? 'cut' : 'trim';

/* one part per brand: only its Google rows are kept (the full leak list is long and this page shows none of the rest) */
const one = (ctx, b) => soft(ctx.api(`/api/leaks?act=${encodeURIComponent(b.id)}&days=30`, { worker: 'ah', signal: ctx.signal })).then(d => {
  if (!d || d.error) return { as_of: null, rows: [], off: true };
  return { as_of: d.as_of || null, rows: (d.leaks || []).filter(l => /^google/.test(l.area || '')).map(l => ({ id: `${b.id}|${l.id}`, brand_id: b.id, brand: b.name, kind: kindOf(l),
    action: l.title || '', name: '', why: l.number || l.fix || '', stake: l.cost ?? null })) };
});
const brandsOf = ctx => (ctx.brands || []).filter(b => b.id);
async function load(ctx) {
  const brands = brandsOf(ctx);
  if (!brands.length) return { as_of: null, rows: [] };
  return loadParts(ctx, Object.fromEntries(brands.map(b => [b.id, () => one(ctx, b)])));
}
/** The parts that have landed, as the plain { as_of, rows } the renderer and the sample share. */
function build(d, ctx) {
  if (!d || !d.parts) return { data: d, waiting: 0 };
  const ids = brandsOf(ctx).map(b => b.id), rows = [];
  let asOf = null, waiting = 0;
  for (const id of ids) {
    const p = d.parts[id];
    if (!p) { if (d.late.includes(id)) waiting++; continue; }
    if (p.as_of && (!asOf || p.as_of > asOf)) asOf = p.as_of;
    rows.push(...(p.rows || []));
  }
  return { data: { as_of: asOf, rows }, waiting };
}
function render(el, d, ctx) {
  follow(ctx, d, now => {
    const { data, waiting } = build(now, ctx);
    if (waiting && !(data.rows || []).length) return put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('row', 5), reading(`Reading ${waiting} brand${waiting === 1 ? '' : 's'}`));
    renderSuggestions(el, data, ctx, 'google');
    polishSuggestions(el, data, { platform: 'google', days: 30 });
    if (waiting) el.append(reading(`Reading ${waiting} more brand${waiting === 1 ? '' : 's'}. Their suggestions join the list as they land.`));
  });
}
async function sample() { const w = await world(); return { as_of: w.suggestions.as_of, rows: w.suggestions.google }; }

export default {
  title: 'Suggestions for Google, all brands',
  eyebrow: 'Google · last 30 days',
  ranges: false,
  asOf: d => (d && d.parts ? Object.values(d.parts).reduce((m, p) => (p && p.as_of && (!m || p.as_of > m) ? p.as_of : m), null) : d && d.as_of),
  load, sample,
  render,
};
