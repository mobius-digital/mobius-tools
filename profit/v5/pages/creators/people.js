/* Creative > Creators > People. "Which creators should we book again?"
   Every creator with a video that ran in the last 30 days: what they made, what it sold, how long since their last
   video. Rebook = their ads beat the account's cost per sale (2 sales or more) and they have been quiet 14 days.
   Data: GET /api/trybe?act=<brand id> on the account-health worker (the `creators` list). Read only. */

import { APP_NAME } from '../../config.js';
import { h, kpi, em, money, num, x, statusDot, skeleton, card, table, avatar, sheet, platformChip, sourceLine } from '../../kit.js';
import { tileRow } from '../what-works/_ww.js';
import { defined, defLabel } from '../../defs.js';
import { SAMPLE } from '../../data.js';
import { put, css, oldLocus, pageTop, teamTag } from '../production/_ui.js';
import { crCss, loadCreators, notConnected, day, plural, clip, play, openVideo, crFigs, cpaDot, CR_DEF } from './_cr.js';

const verdict = (c, data) => {
  const acct = data.account && data.account.cpa != null ? money(data.account.cpa) : 'the account\'s';
  const days = data.rebook_days || 14;
  return c.rebook ? defined(statusDot('good', 'Book again'), { name: 'Book again', definition: `Their ads cost less per sale than the account (${acct}) on 2 sales or more, and their last video was ${days} days ago or more.` })
    : c.beats ? defined(statusDot('good', 'Beats the account'), { name: 'Beats the account', definition: `Their cost per sale is under the account's ${acct}, last 30 days, on 2 sales or more.` })
    : c.orders > 0 ? defined(statusDot('warn', 'Over the account'), { name: 'Over the account', definition: `Their cost per sale is over the account's ${acct}, last 30 days.` })
    : statusDot('off', 'No sales yet');
};
/** One creator, opened: their figures, then each of their videos running now. No new request. */
function openCreator(ctx, c, data) {
  const vids = (data.live || []).filter(v => (v.creator_id && v.creator_id === c.creator_id) || v.creator === c.name);
  sheet({ title: c.name, body: h('div', { class: 'cr-one' },
    h('div', { class: 'cr-hd' }, platformChip('meta'), h('span', { class: 'cr-quiet' }, 'Meta ads, last 30 days'), verdict(c, data)),
    crFigs(c),
    h('p', { class: 'cr-quiet' }, plural(c.videos || 0, 'video') + ' running, ' + (c.approved || c.videos || 0) + ' approved' + (c.last_video ? ', last video ' + day(c.last_video) : '')),
    vids.length ? h('div', { class: 'cr-vids' }, vids.map(v => h('button', { type: 'button', class: 'cr-vid', onclick: () => openVideo(ctx, v, { acct: (data.account || {}).cpa }) },
      h('span', { class: 'cr-mini' }, clip(v)), h('span', null, h('b', null, v.product || 'Video'), h('small', null, [money(Math.round(v.spend || 0)) + ' spend', num(v.orders || 0) + ' sales', v.cpa != null ? money(Math.round(v.cpa)) + ' a sale' : null].filter(Boolean).join(', '))), cpaDot(v.cpa, (data.account || {}).cpa))))
      : h('p', { class: 'cr-quiet' }, 'None of their videos spent in the last 30 days.')) });
}

export default {
  title: ['Which creators ', em('should we book again?')],
  eyebrow: 'Creators',
  ranges: false,
  asOf: d => (!SAMPLE && d && d.synced_at) || null,
  load: loadCreators,
  sample: ctx => ctx.fixture('creators.json'),
  skeleton(el) { put(el, skeleton('kpi', 3), skeleton('row', 6)); },

  render(el, data, ctx) {
    css(); crCss();
    if (!data || data.has_key === false) { put(el, notConnected(ctx, data)); return; }
    const a = data.account || {}, list = data.creators || [];
    const rebook = list.filter(c => c.rebook), beats = list.filter(c => c.beats);
    const top = list.slice().sort((p, q) => (q.revenue || 0) - (p.revenue || 0))[0];
    const old = oldLocus(ctx, { label: 'Message in old ' + APP_NAME });
    ctx.askWindow = 'Last 30 days';
    ctx.askContext = `Creators, People, last 30 days: ${num(list.length)} creators with videos running as Meta ads; ${num(beats.length)} beat the account's cost per sale${a.cpa != null ? ' of ' + money(a.cpa) : ''}, ${num(rebook.length)} worth booking again.` + (top ? ` Top seller ${top.name}, ${money(Math.round(top.revenue || 0))} Triple Whale revenue.` : '');
    put(el,
      pageTop([
        { title: 'What it is for', text: 'Every creator with a video that ran as a Meta ad in the last 30 days: what they made, what it sold, how long since their last video. Tap a creator for their videos.' },
        { title: 'Book again', text: `Their ads cost less per sale than the account (${a.cpa != null ? money(a.cpa) : 'no figure yet'}) on 2 sales or more, and their last video was ${data.rebook_days || 14} days ago or more.` },
        { title: 'Where the numbers come from', text: 'Spend is Meta. Orders, revenue and cost per sale are Triple Whale, last platform click, last 30 days.' },
      ], platformChip('meta'), h('span', { class: 'cr-quiet' }, 'Meta ads, last 30 days'), old ? teamTag() : null, old),
      tileRow([
          kpi({ label: 'Creators with videos running', value: String(list.length), sub: plural(list.reduce((s, c) => s + (c.videos || 0), 0), 'video'), window: 'Last 30 days', source: 'Meta' }),
          kpi({ label: defLabel('Beat the account', { name: 'Beat the account', definition: 'Creators whose cost per sale is under the whole account\'s, last 30 days, on 2 sales or more.' }), value: String(beats.length), sub: a.cpa != null ? 'Cost per sale under ' + money(a.cpa) : 'No account cost per sale yet', window: 'Last 30 days', source: 'Triple Whale, last click' }),
          kpi({ label: defLabel('Book again', { name: 'Book again', definition: 'Beat the account and quiet ' + (data.rebook_days || 14) + ' days or more: worth booking for new videos.' }), value: String(rebook.length), sub: rebook.length ? statusDot('good', rebook.map(c => c.name.split(' ')[0]).join(', ')) : 'Nobody quiet ' + (data.rebook_days || 14) + '+ days', window: 'Last 30 days', source: 'Triple Whale, last click' }),
          kpi({ label: 'Top seller', value: top ? money(Math.round(top.revenue || 0)) : h('small', null, 'Nobody yet'), sub: top ? top.name + (top.roas != null ? ', ' + x(top.roas) + ' ROAS' : '') : null, window: 'Last 30 days', source: 'Triple Whale, last click' }),
        ], 4),
      list.length ? card({ title: 'Everyone, most revenue first', note: sourceLine('Last 30 days', 'spend Meta, sales Triple Whale, last click'), flush: true },
        table({
          rows: list, sort: { key: 'revenue', dir: 'desc' }, roomy: true, onRow: c => openCreator(ctx, c, data),
          cols: [
            { key: 'name', label: 'Creator', sortable: true, render: c => h('div', { class: 'cr-who' }, avatar({ name: c.name, photo: c.avatar }, { size: 32 }),
              h('div', null, h('b', null, c.name), h('small', null, plural(c.videos || 0, 'video') + ' running, ' + (c.approved || c.videos || 0) + ' approved'))) },
            { key: 'spend', label: defLabel('Spend', CR_DEF.spend), num: true, sortable: true, class: 'hide-sm', render: c => money(Math.round(c.spend || 0)) },
            { key: 'orders', label: defLabel('Orders', CR_DEF.orders), num: true, sortable: true, render: c => num(c.orders) },
            { key: 'cpa', label: defLabel('Cost per sale', CR_DEF.cpa), num: true, sortable: true, class: 'hide-sm', render: c => c.cpa == null ? 'none' : money(Math.round(c.cpa)) },
            { key: 'revenue', label: defLabel('Revenue', CR_DEF.revenue), num: true, sortable: true, class: 'hide-md', render: c => money(Math.round(c.revenue || 0)) },
            { key: 'quiet_days', label: 'Last video', num: true, sortable: true, class: 'hide-sm', render: c => c.last_video ? day(c.last_video) + (c.quiet_days != null ? ', ' + plural(c.quiet_days, 'day') + ' ago' : '') : 'none' },
            { key: 'verdict', label: 'Verdict', sortable: true, value: c => (c.rebook ? 3 : c.beats ? 2 : c.orders ? 1 : 0), render: c => verdict(c, data) },
          ],
        })) : card({}, h('p', { class: 'cr-quiet' }, 'No creator video ran in the last 30 days, so nobody is listed yet.')));
  },
};
