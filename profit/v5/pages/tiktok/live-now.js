/* Ads > TikTok > Live now. What is running today. The TikTok report is by day, not by hour, so until an
   hourly route exists the real page shows the campaigns that spent in the window and says so. */

import { put } from '../../kit.js';
import { h, card, kpi, kpis, barChart, money, num, empty } from '../../kit.js';
import { TT_TITLE, styles, loadTikTok, sampleTikTok, gate, campaignsCard, strip, foot } from './_tt.js';

export function view(d, ctx) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  const L = d.live;
  if (!L) {
    return [strip({ title: 'No hour by hour numbers from TikTok yet', text: 'TikTok sends this connection one row a day. Today so far shows here once an hourly read is added.' }),
      campaignsCard(d, { title: 'Campaigns that spent in these dates' }) || empty({ title: 'Nothing spent on TikTok in these dates' }), foot(d)].filter(Boolean);
  }
  return [
    h('section', { class: 'lx-hero line' }, kpis([
      kpi({ label: 'Spent today', value: money(L.spend), size: 'lg', sub: L.normal != null ? 'normal by now ' + money(L.normal) : null }),
      kpi({ label: 'Budget today', value: money(L.budget), size: 'lg', sub: L.budget ? Math.round(100 * L.spend / L.budget) + '% used' : null }),
      kpi({ label: 'Videos running', value: num(L.videos_live), size: 'lg', sub: L.campaigns_live != null ? 'in ' + L.campaigns_live + (L.campaigns_live === 1 ? ' campaign' : ' campaigns') : null }),
      kpi({ label: 'CPM today', value: money(L.cpm, { cents: true }), size: 'lg', sub: L.cpm_normal != null ? 'normal ' + money(L.cpm_normal, { cents: true }) : null }),
    ], { cols: 4 })),
    card({ title: 'Spend by hour, today', note: L.as_of ? 'up to ' + L.as_of : null },
      barChart({ values: L.hours.map(r => r.spend), labels: L.hours.map(r => r.label), dim: i => i >= L.hours_done, format: v => money(v), height: 300, label: 'TikTok spend by hour today' })),
    campaignsCard({ campaigns: L.campaigns }, { title: 'Running now', live: true }),
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
