/* Ads > TikTok > Live now. What is running today. The TikTok report is by day, not by hour, so until an
   hourly route exists the real page shows the campaigns that spent in the window and says so. */

import { put } from '../../kit.js';
import { h, card, kpi, kpis, tiles, barChart, money, num, empty } from '../../kit.js';
import { TT_TITLES, styles, loadTikTok, sampleTikTok, gate, campaignsCard, strip, ttHead } from './_tt.js';
import { def } from '../platforms/_ads.js';

export function view(d, ctx) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  const L = d.live;
  const head = ttHead(d, ctx, 'What is running on TikTok today: spend so far against a usual day, the budget, the videos running, and spend by hour.');
  if (!L) {
    return [head, strip({ title: 'No hour by hour numbers from TikTok yet', text: 'TikTok sends this connection one row a day. Today so far shows here once an hourly read is added.' }),
      campaignsCard(d, { title: 'Campaigns that spent in these dates' }) || empty({ title: 'Nothing spent on TikTok in these dates' })].filter(Boolean);
  }
  return [
    head,
    tiles([
      kpi({ label: 'Spent today', value: money(L.spend), window: 'Today so far', source: 'TikTok Ads', sub: L.normal != null ? h('span', null, def('a usual day', 'usual_day'), ' by now ' + money(L.normal)) : null }),
      kpi({ label: 'Budget today', value: money(L.budget), window: 'Today', source: 'TikTok Ads', sub: L.budget ? Math.round(100 * L.spend / L.budget) + '% used' : null }),
      kpi({ label: 'Videos running', value: num(L.videos_live), window: 'Right now', source: 'TikTok Ads', sub: L.campaigns_live != null ? 'in ' + L.campaigns_live + (L.campaigns_live === 1 ? ' campaign' : ' campaigns') : null }),
      kpi({ label: def('CPM today', 'cpm'), value: money(L.cpm, { cents: true }), window: 'Today so far', source: 'TikTok Ads', sub: L.cpm_normal != null ? h('span', null, def('a usual day', 'usual_day'), ' ' + money(L.cpm_normal, { cents: true })) : null }),
    ], { cols: 4 }),
    card({ title: 'Spend by hour', note: [L.as_of ? 'Up to ' + L.as_of : null, 'TikTok Ads'].filter(Boolean).join(' · ') },
      barChart({ values: L.hours.map(r => r.spend), labels: L.hours.map(r => r.label), dim: i => i >= L.hours_done, format: v => money(v), height: 300, windowLabel: 'Today so far, by hour', name: 'TikTok', label: 'TikTok spend by hour today' })),
    campaignsCard({ campaigns: L.campaigns }, { title: 'Running now', live: true }),
  ].filter(Boolean);
}

export default {
  title: TT_TITLES['live-now'],
  ranges: false,
  eyebrow: 'TikTok',
  load: loadTikTok,
  sample: sampleTikTok,
  render(el, d, ctx) { styles(); put(el, ...view(d, ctx)); },
};
