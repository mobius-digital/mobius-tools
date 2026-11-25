/* Agency > Meta > Suggestions. Every brand's Meta calls for today, grouped by brand, most money first. Read only:
   each brand card opens that brand's Suggestions tab, where Yes or No is given.
   Real: account-health GET /api/buyer-list?act=all&ads=0 (rows not yet decided today). */
import { em } from '../../kit.js';
import { world } from '../a-today/_ag.js';
import { renderSuggestions } from '../a-today/_more.js';

async function load(ctx) {
  const d = await ctx.api('/api/buyer-list?act=all&ads=0', { worker: 'ah', signal: ctx.signal });
  const all = (d.rows || []).filter(r => !r.decided);
  const rows = all.filter(r => r.kind !== 'launch').map(r => {
    const c = r.card || {};
    return { id: `${r.act_id}|${c.object || r.name}|${r.kind}`, brand_id: r.act_id, brand: r.brand, kind: c.kind || r.kind,
      action: c.do || r.action || '', name: c.object || r.name || '', why: c.because || r.why || '', stake: r.stake ?? null };
  });
  return { as_of: d.as_of, rows, load: all.filter(r => r.kind === 'launch').length };
}
async function sample() {
  const w = await world();
  return { as_of: w.suggestions.as_of, rows: w.suggestions.meta.filter(r => r.kind !== 'launch'), load: w.suggestions.meta.filter(r => r.kind === 'launch').length };
}

export default {
  title: ['What should we change ', em('in Meta today?')],
  eyebrow: 'Meta, all brands',
  ranges: false,
  asOf: d => d && d.as_of,
  load, sample,
  render: (el, d, ctx) => renderSuggestions(el, d, ctx, 'meta'),
};
