/* Ads > Google > Suggestions for one brand (team only): what the Google buyer should change this week.
   READ ONLY, the same rule as Meta: each row says what, why with its numbers, and opens the tab where the thing
   is seen. Nothing on this page writes to Google Ads.

   Real mode reads account-health GET /api/leaks?act=&days=30 and keeps its Google rows (search terms to block,
   Performance Max categories, campaigns over the cut line, video view rate). Those rows are judged on Google's own
   count today, because Triple Whale sales per Google campaign are not read yet, and the page says so. */

import { put } from '../../kit.js';
import { h, em, card, button, pill, empty } from '../../kit.js';
import { styles, gate, loadSuggestions, sampleGoogle, footNote, strip } from './_g.js';

const KIND = {
  block: ['bad', 'Block'], lower: ['warn', 'Lower'], raise: ['good', 'Raise'],
  watch: ['', 'Watch'], feed: ['bad', 'Feed'], fix: ['warn', 'Fix'],
};

function row(s, ctx) {
  const k = KIND[s.kind] || ['', 'Look'];
  return h('div', { class: 'gg-sug' },
    pill(k[0], k[1]),
    h('span', { class: 'tx' },
      h('b', null, s.title),
      s.why ? h('span', null, s.why) : null,
      s.fix ? h('span', null, s.fix) : null,
      s.where ? h('span', { class: 'w' }, s.where) : null),
    s.open ? button(s.open_label || 'Open', { href: ctx.href('google', s.open), icon: 'arrow' }) : null);
}

export default {
  title: ['What should the Google buyer ', em('change this week?')],
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
    if (!decide.length && !watching.length) {
      return put(el, 
        strip({ title: 'Nothing to change on Google this week', text: 'No search term, campaign or product crossed a line in the last 30 days.' }),
        footNote('Last 30 days. ' + judged + ' Nothing changes from this page.'));
    }
    put(el, ...[
      h('div', { class: 'gg-n' }, h('b', null, String(decide.length)), h('span', null, 'to decide'),watching.length ? h('span', null, '· ' + watching.length + ' watching') : null),
      !onTw ? strip({ ic: 'google', title: 'Google’s count, not Triple Whale', text: judged + (s.note ? ' ' + s.note : '') }) : null,
      decide.length ? card({ title: 'To decide', note: 'biggest money first' }, decide.map(r => row(r, ctx))) : null,
      watching.length ? card({ title: 'Watching', note: 'not a change yet' }, watching.map(r => row(r, ctx))) : null,
      (s.rules || []).length ? card({ title: 'Rules it keeps' }, h('ul', { class: 'gg-rules' }, s.rules.map(t => h('li', null, t)))) : null,
      footNote('Last 30 days. ' + judged + ' Read only: the change itself is made in Google Ads.'),
    ].filter(Boolean));
  },
};
