/* Ads > TikTok > Suggestions (team). What the app would suggest next on TikTok. Nothing is changed from here:
   this page has no TikTok write, so each row only opens the place to act. No route feeds this yet;
   real mode says so and never invents a call. */

import { put } from '../../kit.js';
import { h, card, button, pill, empty } from '../../kit.js';
import { TT_TITLES, styles, loadTikTok, sampleTikTok, gate, ttHead } from './_tt.js';
import { defOn } from '../platforms/_ads.js';
import { APP_NAME, AI_NAME } from '../../config.js';

const TONE = { raise: 'good', pause: 'bad' };
const WORD = { raise: 'Raise', pause: 'Turn off', test: 'Test', keep: 'Keep' };

export function view(d, ctx) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  const list = d.suggestions;
  const head = ttHead(d, null, 'What the app would change next on TikTok. Suggestions only: changes are made in TikTok Ads Manager, from the button above the list.');
  if (!list || !list.length) {
    return [empty({ title: 'No suggestions for TikTok yet', text: APP_NAME + ' suggests a move once it can read each video and the sales behind it. Today TikTok sends one total per campaign, so there is nothing to judge a single video on.',
      action: button('Ask ' + AI_NAME + ' about TikTok', { href: ctx.href('ask', 'index'), icon: 'arrow' }) })].filter(Boolean);
  }
  const MEANS = { raise: 'Spend more on it: it beats the goal.', pause: 'Switch it off in TikTok Ads Manager: it spends with too little back.', test: 'Try it as a new test.', keep: 'Leave it running as it is.' };
  return [
    head,
    card({ title: 'What to do next', note: list.length + (list.length === 1 ? ' suggestion' : ' suggestions') + (d.range ? ', ' + d.range.label : ''),
      action: button('Open TikTok Ads Manager', { href: 'https://ads.tiktok.com/', target: '_blank', icon: 'arrow' }) },
      list.map(sg => h('div', { class: 'tt-sug' },
        defOn(pill(TONE[sg.kind] || '', WORD[sg.kind] || 'Look'), { title: WORD[sg.kind] || 'Look', body: MEANS[sg.kind] || 'Look closer.' }),
        h('span', { class: 'tx' }, h('b', null, sg.title), h('span', null, sg.why))))),
  ].filter(Boolean);
}

export default {
  title: TT_TITLES.suggestions,
  ranges: false,
  eyebrow: 'TikTok',
  load: loadTikTok,
  sample: sampleTikTok,
  render(el, d, ctx) { styles(); put(el, ...view(d, ctx)); },
};
