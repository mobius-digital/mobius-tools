/* Ads > TikTok > Overview. Spend, sales and ROAS for TikTok only, the weekly chart, and the top videos.
   Real numbers: account-health /api/tiktok/report (see _tt.js). */

import { put } from '../../kit.js';
import { h, card, money, x } from '../../kit.js';
import { TT_TITLES, styles, loadTikTok, sampleTikTok, gate, heroBand, weeksChart, campaignsCard, noVideoNumbers, ttHead, videoSheet } from './_tt.js';
import { def } from '../platforms/_ads.js';

/** The nodes of this tab. openTab(id) moves to another TikTok tab. */
export function view(d, ctx, openTab) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  const t = d.totals || {};
  ctx.askWindow = d.range ? d.range.label : null;
  ctx.askContext = `TikTok for ${ctx.brand ? ctx.brand.name : 'this brand'}, ${d.range ? d.range.label : 'these dates'}: spend ${money(t.spend)}` + (t.sales != null ? `, sales ${money(t.sales)} (Triple Whale), ROAS ${x(t.roas)}` : t.tiktok_roas != null ? `, TikTok's own count ROAS ${x(t.tiktok_roas)} (no Triple Whale figure for TikTok)` : '') + '.';
  const out = [ttHead(d, ctx, 'Whether TikTok ads pay for themselves on the dates in the page head: spend, sales, ROAS and cost per purchase, by week, and the four biggest videos.'), heroBand(d), weeksChart(d)];
  const vids = d.videos;
  if (vids && vids.length) {
    const top = [...vids].sort((a, b) => (b.spend || 0) - (a.spend || 0)).slice(0, 4);
    out.push(card({ title: 'Top 4 videos by spend', note: d.range ? d.range.label : null, flush: true, action: h('a', { href: '#', onclick: e => { e.preventDefault(); openTab('top-videos'); } }, 'Open Best videos') },
      h('div', { class: 'tt-mini' }, h('div', { class: 'hd' }, h('span', null, 'Video'), h('span', null, 'Spend'), h('span', null, def('ROAS', 'roas')), h('span', null, 'Sales')),
        top.map(v => h('a', { href: '#', onclick: e => { e.preventDefault(); videoSheet(v, d); } }, h('span', null, v.name), h('span', null, money(v.spend)), h('span', null, v.roas != null ? x(v.roas) : 'n/a'), h('span', null, v.sales != null ? money(v.sales) : 'n/a'))))));
  } else {
    out.push(campaignsCard(d), noVideoNumbers());
  }
  return out.filter(Boolean);
}

export default {
  title: TT_TITLES.overview,
  eyebrow: 'TikTok',
  load: loadTikTok,
  sample: sampleTikTok,
  render(el, d, ctx) {
    styles();
    put(el, ...view(d, ctx, id => ctx.go({ line: 'tiktok', tab: id })));
  },
};
