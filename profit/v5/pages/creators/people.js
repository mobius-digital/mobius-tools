/* Creative > Creators > People. "Which creators should we book again?"
   Every creator with a video that ran in the last 30 days: what they made, what it sold, how long since their last
   video. Rebook = their ads beat the account's cost per sale (2 sales or more) and they have been quiet 14 days.
   Data: GET /api/trybe?act=<brand id> on the account-health worker (the `creators` list). Read only. */

import { APP_NAME } from '../../config.js';
import { h, hero, kpi, kpis, em, money, num, x, statusDot, skeleton, card, table, avatar } from '../../kit.js';
import { SAMPLE } from '../../data.js';
import { put, css, oldLocus } from '../production/_ui.js';
import { crCss, loadCreators, notConnected, day, plural } from './_cr.js';

const verdict = (c, data) => c.rebook ? statusDot('good', 'Book again')
  : c.beats ? statusDot('good', 'Beats the account')
  : c.orders > 0 ? statusDot('warn', 'Over the account')
  : statusDot('off', 'No sales yet');

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
    put(el,
      hero({ line: true },
        kpis([
          kpi({ label: 'Creators with videos running', value: String(list.length), sub: plural(list.reduce((s, c) => s + (c.videos || 0), 0), 'video') + ', last 30 days' }),
          kpi({ label: 'Beat the account', value: String(beats.length), sub: a.cpa != null ? 'cost per sale under ' + money(a.cpa) : 'no account cost per sale yet' }),
          kpi({ label: 'Book again', value: String(rebook.length), sub: rebook.length ? statusDot('good', rebook.map(c => c.name.split(' ')[0]).join(', ')) : 'nobody quiet ' + (data.rebook_days || 14) + '+ days' }),
          kpi({ label: 'Top seller', value: top ? money(top.revenue, { compact: true }) : 'nobody yet', sub: top ? top.name + (top.roas != null ? ', ' + x(top.roas) + ' ROAS' : '') : null }),
        ], { cols: 4 })),
      list.length ? card({ title: 'Everyone, most sales first', note: 'Triple Whale sales, Meta spend', action: oldLocus(ctx, { label: 'Message in old ' + APP_NAME }), flush: true },
        table({
          rows: list, sort: { key: 'revenue', dir: 'desc' }, roomy: true,
          cols: [
            { key: 'name', label: 'Creator', sortable: true, render: c => h('div', { class: 'cr-who' }, avatar({ name: c.name, photo: c.avatar }, { size: 32 }),
              h('div', null, h('b', null, c.name), h('small', null, plural(c.videos || 0, 'video') + ' running, ' + (c.approved || c.videos || 0) + ' approved'))) },
            { key: 'spend', label: 'Spend', num: true, sortable: true, class: 'hide-sm', render: c => money(c.spend) },
            { key: 'orders', label: 'Sales', num: true, sortable: true, render: c => num(c.orders) },
            { key: 'cpa', label: 'Per sale', num: true, sortable: true, class: 'hide-sm', render: c => c.cpa == null ? 'none' : money(c.cpa) },
            { key: 'revenue', label: 'Sales $', num: true, sortable: true, class: 'hide-md', render: c => money(c.revenue) },
            { key: 'quiet_days', label: 'Last video', num: true, sortable: true, class: 'hide-sm', render: c => c.last_video ? day(c.last_video) + (c.quiet_days != null ? ', ' + plural(c.quiet_days, 'day') + ' ago' : '') : 'none' },
            { key: 'verdict', label: '', value: c => (c.rebook ? 3 : c.beats ? 2 : c.orders ? 1 : 0), render: c => verdict(c, data) },
          ],
        })) : card({}, h('p', { class: 'cr-quiet' }, 'No creator video ran in the last 30 days, so nobody is listed yet.')),
      h('p', { class: 'lx-foot' }, `Book again: their ads cost less per sale than the account (${a.cpa != null ? money(a.cpa) : 'no figure yet'}) on 2 sales or more, and their last video was ${data.rebook_days || 14} days ago or more.`));
  },
};
