/* Ads > TikTok > Changes made. Who changed what on TikTok and why. No route carries TikTok changes yet
   (the change list holds Meta and Google), so real mode shows the plain state. */

import { put } from '../../kit.js';
import { h, card, table, empty, button } from '../../kit.js';
import { TT_TITLE, styles, loadTikTok, sampleTikTok, gate, foot } from './_tt.js';

export function view(d, ctx) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  const rows = d.changes;
  if (!rows || !rows.length) {
    return [empty({ title: 'No TikTok changes on record', text: 'Changes made in TikTok Ads Manager do not come through this connection yet. Changes on Meta and Google are under All platforms.',
      action: button('Open all changes', { href: ctx.href('platforms', 'changes'), icon: 'arrow' }) }), foot(d)].filter(Boolean);
  }
  return [
    card({ title: 'Changes made', note: 'newest first', flush: true, class: 'tt-chg' },
      table({ roomy: true, rows, cols: [
        { key: 'date', label: 'When', width: 110, class: 'dim', render: r => r.date },
        { key: 'who', label: 'Who', width: 130, class: 'hide-sm', render: r => r.who },
        { key: 'what', label: 'What changed', render: r => h('span', { class: 'name' }, r.what, r.why && h('span', { class: 'sub' }, r.why)) },
      ] })),
    foot(d),
  ].filter(Boolean);
}

export default {
  title: TT_TITLE,
  eyebrow: 'TikTok',
  load: loadTikTok,
  sample: sampleTikTok,
  render(el, d, ctx) { styles(); put(el, ...view(d, ctx)); },
};
