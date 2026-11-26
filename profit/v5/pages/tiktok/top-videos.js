/* Ads > TikTok > Top videos. Every video with spend: cards for the top few, then the whole list.
   TikTok sends no per video rows on this connection yet, so real mode shows that state plainly. */

import { h, card, table, pill, money, pct, x, segmented, button } from '../../kit.js';
import { TT_TITLES, styles, loadTikTok, sampleTikTok, gate, videoCard, videoSheet, noVideoNumbers, campaignsCard, ttHead } from './_tt.js';
import { def } from '../platforms/_ads.js';
import { put } from '../../kit.js';

export function view(d, ctx) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  const vids = d.videos;
  const head = ttHead(d, ctx, 'Every TikTok video with spend on these dates, sorted by the number you pick. Tap a video for all of its numbers.');
  if (!vids || !vids.length) return [head, noVideoNumbers(), campaignsCard(d)].filter(Boolean);
  const SORT = { spend: ['Spend', v => v.spend], roas: ['ROAS', v => v.roas], sales: ['Sales', v => v.sales], v2: ['2 second views', v => v.v2], end: ['Watched to the end', v => v.end] };
  let sort = ctx.settingNow('tiktok.top.sort', 'spend'); if (!SORT[sort]) sort = 'spend';
  const sorted = () => [...vids].sort((a, b) => ((SORT[sort][1](b) ?? -1) - (SORT[sort][1](a) ?? -1)) || (b.spend || 0) - (a.spend || 0));
  const rows = sorted();
  const p = v => (v == null ? 'no data' : pct(v, { digits: v < 0.1 ? 1 : 0 }));
  const grid = h('div', { class: 'tt-vids' });
  const paint = () => put(grid, ...sorted().slice(0, 4).map(v => videoCard(v, d)));
  paint();
  const sel = h('select', { 'aria-label': 'Sort by', onchange: e => { sort = e.target.value; ctx.saveSetting('tiktok.top.sort', sort); paint(); } }, Object.entries(SORT).map(([id, s]) => h('option', { value: id, selected: id === sort || null }, s[0])));
  return [
    head,
    h('section', { style: { display: 'grid', gap: '20px' } },
      h('div', { class: 'tt-bar' }, h('h3', null, 'Best videos on TikTok, ' + (d.range ? d.range.label : 'these dates')), d.source === 'sample' ? h('span', { class: 'lx-pill' }, 'Sample videos') : null, h('label', null, 'Sort by', sel)),
      grid),
    card({ title: 'Every video', note: rows.length + ' with spend', flush: true, class: 'tt-top' },
      table({ roomy: true, rows, sort: { key: 'spend', dir: 'desc' }, onRow: v => videoSheet(v, d), cols: [
        { key: 'name', label: 'Video', render: r => h('span', { class: 'name' }, r.name, h('span', { class: 'sub' }, r.by)) },
        { key: 'spark', label: 'Type', class: 'hide-sm', render: r => (r.spark ? pill('', 'Spark ad') : h('span', { class: 'dim' }, 'Brand video')) },
        { key: 'spend', label: def('Spent', 'ad_spend'), num: true, sortable: true, render: r => money(r.spend) },
        { key: 'roas', label: def('ROAS', 'roas'), num: true, sortable: true, class: 'strong', render: r => (r.roas != null ? x(r.roas) : 'n/a') },
        { key: 'sales', label: def('Sales, Triple Whale', 'roas'), num: true, sortable: true, render: r => (r.sales != null ? money(r.sales) : 'n/a') },
        { key: 'v2', class: 'hide-sm', label: def('2 second views', 'hook'), num: true, sortable: true, render: r => p(r.v2) },
        { key: 'v6', class: 'hide-sm', label: def('6 second views', 'six_second'), num: true, sortable: true, render: r => p(r.v6) },
        { key: 'end', class: 'hide-sm', label: def('To the end', 'watched_end'), num: true, sortable: true, render: r => p(r.end) },
      ] })),
  ].filter(Boolean);
}

export default {
  title: TT_TITLES['top-videos'],
  eyebrow: 'TikTok',
  load: loadTikTok,
  sample: sampleTikTok,
  render(el, d, ctx) { styles(); put(el, ...view(d, ctx)); },
};
