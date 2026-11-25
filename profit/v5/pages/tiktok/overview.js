/* Ads > TikTok > Overview. Spend, sales and ROAS for TikTok only, the weekly chart, and the top videos.
   Real numbers: account-health /api/tiktok/report (see _tt.js). */

import { put } from '../../kit.js';
import { h } from '../../kit.js';
import { TT_TITLE, styles, loadTikTok, sampleTikTok, gate, heroBand, takeLine, weeksChart, videoCard, campaignsCard, noVideoNumbers, foot } from './_tt.js';

/** The nodes of this tab. openTab(id) moves to another TikTok tab. */
export function view(d, ctx, openTab) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  const out = [heroBand(d), takeLine(d, ctx), weeksChart(d)];
  const vids = d.videos;
  if (vids && vids.length) {
    out.push(h('section', { style: { display: 'grid', gap: '20px' } },
      h('div', { class: 'lx-sec' }, h('h3', null, 'Top videos'), d.source === 'sample' ? h('span', { class: 'lx-pill' }, 'Sample videos') : null,
        h('div', { class: 'act' }, h('a', { href: '#', onclick: e => { e.preventDefault(); openTab('top-videos'); } }, 'All videos'))),
      h('div', { class: 'tt-vids' }, [...vids].sort((a, b) => (b.spend || 0) - (a.spend || 0)).slice(0, 4).map(videoCard))));
  } else {
    out.push(campaignsCard(d), noVideoNumbers());
  }
  out.push(foot(d));
  return out.filter(Boolean);
}

export default {
  title: TT_TITLE,
  eyebrow: 'TikTok',
  load: loadTikTok,
  sample: sampleTikTok,
  render(el, d, ctx) {
    styles();
    put(el, ...view(d, ctx, id => ctx.go({ line: 'tiktok', tab: id })));
  },
};
