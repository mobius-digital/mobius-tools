/* Ads > TikTok > Top videos. Every video with spend: cards for the top few, then the whole list.
   TikTok sends no per video rows on this connection yet, so real mode shows that state plainly. */

import { put } from '../../kit.js';
import { h, card, table, pill, money, pct, x } from '../../kit.js';
import { TT_TITLE, styles, loadTikTok, sampleTikTok, gate, videoCard, noVideoNumbers, campaignsCard, foot } from './_tt.js';

export function view(d, ctx) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  const vids = d.videos;
  if (!vids || !vids.length) return [noVideoNumbers(), campaignsCard(d), foot(d)].filter(Boolean);
  const rows = [...vids].sort((a, b) => (b.spend || 0) - (a.spend || 0));
  const p = v => (v == null ? 'no data' : pct(v, { digits: v < 0.1 ? 1 : 0 }));
  return [
    h('section', { style: { display: 'grid', gap: '20px' } },
      h('div', { class: 'lx-sec' }, h('h3', null, 'Top videos'), h('span', { class: 'note' }, 'sorted by spend'), d.source === 'sample' ? h('span', { class: 'lx-pill' }, 'Sample videos') : null),
      h('div', { class: 'tt-vids' }, rows.slice(0, 4).map(videoCard))),
    card({ title: 'Every video', note: rows.length + ' with spend', flush: true, class: 'tt-top' },
      table({ roomy: true, rows, sort: { key: 'spend', dir: 'desc' }, cols: [
        { key: 'name', label: 'Video', render: r => h('span', { class: 'name' }, r.name, h('span', { class: 'sub' }, r.by)) },
        { key: 'spark', label: 'Type', class: 'hide-sm', render: r => (r.spark ? pill('', 'Spark ad') : h('span', { class: 'dim' }, 'Brand video')) },
        { key: 'spend', label: 'Spent', num: true, sortable: true, render: r => money(r.spend) },
        { key: 'roas', label: 'ROAS', num: true, sortable: true, class: 'strong', render: r => (r.roas != null ? x(r.roas) : 'n/a') },
        { key: 'sales', label: 'Sales, Triple Whale', num: true, sortable: true, render: r => (r.sales != null ? money(r.sales) : 'n/a') },
        { key: 'v2', class: 'hide-sm', label: '2 second views', num: true, sortable: true, render: r => p(r.v2) },
        { key: 'v6', class: 'hide-sm', label: '6 second views', num: true, sortable: true, render: r => p(r.v6) },
        { key: 'end', class: 'hide-sm', label: 'To the end', num: true, sortable: true, render: r => p(r.end) },
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
