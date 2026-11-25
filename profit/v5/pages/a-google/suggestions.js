/* Agency > Google > Suggestions. Every brand's Google money leaks (wasted search terms, campaigns over the goal cost),
   grouped by brand, most money first. Read only.
   Real: account-health GET /api/leaks?act=<brand id>&days=30 for each brand (one call per brand; no all-brands route
   yet), Google areas only. A brand with Google not linked is left out. */
import { em } from '../../kit.js';
import { world, soft } from '../a-today/_ag.js';
import { renderSuggestions } from '../a-today/_more.js';

const kindOf = l => /search|pmax/.test(l.area) && /:negatives|:categories/.test(l.id) ? 'negative' : /no sale/.test(l.title || '') ? 'cut' : 'trim';

async function load(ctx) {
  const brands = (ctx.brands || []).filter(b => b.id);
  const got = await Promise.all(brands.map(b => soft(ctx.api(`/api/leaks?act=${encodeURIComponent(b.id)}&days=30`, { worker: 'ah', signal: ctx.signal })).then(d => ({ b, d }))));
  const rows = [];
  let asOf = null;
  for (const { b, d } of got) {
    if (!d || d.error) continue;
    if (d.as_of && (!asOf || d.as_of > asOf)) asOf = d.as_of;
    for (const l of d.leaks || []) if (/^google/.test(l.area || '')) rows.push({ id: `${b.id}|${l.id}`, brand_id: b.id, brand: b.name, kind: kindOf(l),
      action: l.title || '', name: '', why: l.number || l.fix || '', stake: l.cost ?? null });
  }
  return { as_of: asOf, rows };
}
async function sample() { const w = await world(); return { as_of: w.suggestions.as_of, rows: w.suggestions.google }; }

export default {
  title: ['Where is Google ', em('wasting money?')],
  eyebrow: 'Google, all brands, last 30 days',
  ranges: false,
  asOf: d => d && d.as_of,
  load, sample,
  render: (el, d, ctx) => renderSuggestions(el, d, ctx, 'google'),
};
