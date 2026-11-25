/* Ads > TikTok > Suggestions (team). What the app would suggest next on TikTok. Nothing is changed from here:
   this page has no TikTok write, so each row only opens the place to act. No route feeds this yet;
   real mode says so and never invents a call. */

import { put } from '../../kit.js';
import { h, card, button, pill, empty } from '../../kit.js';
import { TT_TITLE, styles, loadTikTok, sampleTikTok, gate, foot } from './_tt.js';
import { APP_NAME, AI_NAME } from '../../config.js';

const TONE = { raise: 'good', pause: 'bad' };
const WORD = { raise: 'Raise', pause: 'Turn off', test: 'Test', keep: 'Keep' };

export function view(d, ctx) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  const list = d.suggestions;
  if (!list || !list.length) {
    return [empty({ title: 'No suggestions for TikTok yet', text: APP_NAME + ' suggests a move once it can read each video and the sales behind it. Today TikTok sends one total per campaign, so there is nothing to judge a single video on.',
      action: button('Ask ' + AI_NAME + ' about TikTok', { href: ctx.href('ask', 'index'), icon: 'arrow' }) }), foot(d)].filter(Boolean);
  }
  return [
    card({ title: 'What to do next', note: list.length + (list.length === 1 ? ' suggestion' : ' suggestions') },
      list.map(sg => h('div', { class: 'tt-sug' },
        pill(TONE[sg.kind] || '', WORD[sg.kind] || 'Look'),
        h('span', { class: 'tx' }, h('b', null, sg.title), h('span', null, sg.why)),
        button('Open in TikTok', { href: 'https://ads.tiktok.com/', target: '_blank' })))),
    h('p', { class: 'lx-foot' }, 'Suggestions only. Nothing changes in TikTok until someone makes the change there.'),
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
