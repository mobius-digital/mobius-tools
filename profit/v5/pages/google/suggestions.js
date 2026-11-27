/* Ads > Google > Suggestions for one brand (team only): what the Google buyer should change this week.
   READ ONLY, the same rule as Meta: each row says what, why with its numbers, and opens the tab where the thing
   is seen. Nothing on this page writes to Google Ads.

   Real mode reads account-health GET /api/leaks?act=&days=30 and keeps its Google rows (search terms to block,
   Performance Max categories, campaigns over the cut line, video view rate). Those rows are judged on Google's own
   count today, because Triple Whale sales per Google campaign are not read yet, and the page says so. */

import { put } from '../../kit.js';
import { h, em, card, button, pill, empty, gauge, money, x, kpi, tiles } from '../../kit.js';
import { def, defOn, headRow, levelChip } from '../platforms/_ads.js';
import { styles, gate, loadSuggestions, sampleGoogle, strip } from './_g.js';

const KIND = {
  block: ['bad', 'Block'], lower: ['warn', 'Lower'], raise: ['good', 'Raise'],
  watch: ['', 'Watch'], feed: ['bad', 'Feed'], fix: ['warn', 'Fix'],
};

const KIND_WORDS = { block: 'Stop paying for it: block the search terms or products named.', lower: 'Spend less here: lower the budget or bid.', raise: 'Spend more here: it is beating the goal.',
  watch: 'Not a change yet: keep an eye on it this week.', feed: 'A product feed problem in Merchant Center keeps a product from showing.', fix: 'Something is set up wrong and needs fixing.' };
const LEVEL_OF = { 'Merchant Center': 'Product feed' };
/** the measure against its goal, when the row carries one: { value, goal, unit: 'cpa' | 'roas' } */
function measure(m, onTw) {
  if (!m || m.value == null) return h('div', { class: 'gg-sm' });
  const cost = m.unit === 'cpa', bad = cost ? m.value > m.goal : m.value < m.goal;
  return h('div', { class: 'gg-sm' }, h('div', { class: 'v' }, h('b', { class: bad ? 'bad' : 'good' }, cost ? money(Math.round(m.value)) : x(m.value)), h('span', null, cost ? 'a new customer' : 'ROAS')),
    m.goal ? gauge({ value: m.value, max: Math.max(m.value * 1.1, m.goal * (cost ? 2 : 1.6)), goal: m.goal, thin: true, tone: bad ? 'bad' : 'good', ticks: [{ side: 'l', text: cost ? '$0' : '0' }, { at: m.goal, text: 'goal ' + (cost ? money(m.goal) : x(m.goal)), on: true }] }) : null,
    h('span', { class: 'per' }, onTw ? 'Last 30 days · Triple Whale' : "Last 30 days · Google's own count"));
}
function row(s, ctx, onTw) {
  const k = KIND[s.kind] || ['', 'Look'];
  return h('div', { class: 'gg-sug' },
    defOn(pill(k[0], k[1]), { title: k[1], body: KIND_WORDS[s.kind] || 'Look closer.' }),
    h('span', { class: 'tx' },
      h('b', null, s.title),
      s.where ? h('span', { class: 'o' }, levelChip(LEVEL_OF[s.where] || (s.level || 'Campaign')), ' Google, ', s.where) : null,
      s.why ? h('span', null, s.why) : null,
      s.fix ? h('span', null, s.fix) : null),
    measure(s.measure, onTw),
    s.open ? button(s.open_label || 'Open', { href: ctx.href('google', s.open), icon: 'arrow' }) : null);
}

export default {
  title: 'Suggestions for Google',
  eyebrow: 'Google',
  ranges: false,
  load: loadSuggestions,
  sample: sampleGoogle,
  render(el, d, ctx) {
    styles();
    if (ctx.isClient) return put(el, empty({ title: 'This page is for the team', text: 'Suggestions are worked through by the team before anything changes.' }));
    const stop = gate(d, ctx);
    if (stop) return put(el, stop);
    const s = d.suggestions || {}, decide = s.decide || [], watching = s.watching || [];
    const onTw = s.judged === 'tw';
    const judged = onTw ? 'Judged on Triple Whale, Google’s own count beside it.'
      : 'Judged on Google’s own count for now: Triple Whale sales per Google campaign are not read yet.';
    const help = [
      { title: 'What it is for', text: 'What the Google buyer should change this week, biggest money first, from the last 30 days. Each row opens the tab where the thing is seen.' },
      { title: 'Read only', text: 'Nothing on this page writes to Google Ads: the change itself is made in Google Ads. ' + judged },
      (s.rules || []).length ? { title: 'Rules it keeps', text: s.rules.join('\n\n') } : null,
    ].filter(Boolean);
    if (!decide.length && !watching.length) {
      return put(el, headRow({ help }),
        strip({ title: 'Nothing to change on Google this week', text: 'No search term, campaign or product crossed a line in the last 30 days.' }));
    }
    put(el, ...[
      headRow({ help }),
      tiles([
        kpi({ label: 'To decide', value: String(decide.length), window: 'Last 30 days', source: onTw ? 'Triple Whale, Locus ad rules' : "Google's own count, Locus ad rules", sub: 'biggest money first' }),
        kpi({ label: 'Watching', value: String(watching.length), window: 'Last 30 days', source: 'Locus ad rules', sub: 'not a change yet' }),
      ], { cols: 2 }),
      !onTw ? strip({ ic: 'google', title: 'Google’s count, not Triple Whale', text: judged + (s.note ? ' ' + s.note : '') }) : null,
      decide.length ? card({ title: 'To decide', note: 'Google, last 30 days, biggest money first' }, decide.map(r => row(r, ctx, onTw))) : null,
      watching.length ? card({ title: 'Watching', note: 'not a change yet' }, watching.map(r => row(r, ctx, onTw))) : null,
    ].filter(Boolean));
  },
};
