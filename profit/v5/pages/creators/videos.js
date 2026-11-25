/* Creative > Creators > Videos. "Which creator videos are earning their spend?"
   The last 30 days of every approved creator video that ran in Meta, most spend first, and (team only) the approved
   videos that have not run yet. Spend is Meta's; sales and cost per sale are Triple Whale's (last platform click).
   Data: GET /api/trybe?act=<brand id> on the account-health worker. Its window is a fixed 30 days, so the date range is off. */

import { APP_NAME } from '../../config.js';
import { h, hero, kpi, kpis, em, money, num, x, pct, statusDot, skeleton, card } from '../../kit.js';
import { SAMPLE } from '../../data.js';
import { put, css, oldLocus, sect } from '../production/_ui.js';
import { crCss, clip, play, loadCreators, notConnected, cpaDot, day, plural } from './_cr.js';

const STATE = {
  not_launched: ['bad', 'Not loaded'], scheduled: ['info', 'Scheduled'], review: ['warn', 'In Meta review'],
  rejected: ['bad', 'Meta said no'], off: ['off', 'Ads paused'], no_spend: ['warn', 'On, no spend yet'],
};

/* whole dollars on a tile, so three figures fit side by side on a phone ($1.3k, $942, $61) */
const whole = v => (v == null ? 'none' : v >= 1000 ? money(v, { compact: true }) : money(Math.round(v)));

function liveTile(ctx, v, acct) {
  return h('article', { class: 'cr-tile' },
    h('button', { type: 'button', 'aria-label': 'Watch the video by ' + v.creator, onclick: () => play(ctx, v) }, clip(v)),
    h('div', null, h('b', null, v.creator), h('small', null, [v.product, v.angle].filter(Boolean).join(', '))),
    h('div', { class: 'cr-nums' },
      h('span', null, h('em', null, 'Spend'), h('b', null, whole(v.spend))),
      h('span', null, h('em', null, 'Sales'), h('b', null, num(v.orders))),
      h('span', null, h('em', null, 'Each'), h('b', null, v.cpa == null ? 'none' : whole(v.cpa)))),
    cpaDot(v.cpa, acct));
}

export default {
  title: ['Which creator videos ', em('are earning their spend?')],
  eyebrow: 'Creators',
  ranges: false,
  asOf: d => (!SAMPLE && d && d.synced_at) || null,
  load: loadCreators,
  sample: ctx => ctx.fixture('creators.json'),
  skeleton(el) { put(el, skeleton('kpi', 4), skeleton('chart')); },

  render(el, data, ctx) {
    css(); crCss();
    if (!data || data.has_key === false) { put(el, notConnected(ctx, data)); return; }
    const a = data.account || {}, live = data.live || [], queue = ctx.isClient ? [] : (data.queue || []);
    const c = data.counts || {};
    const waiting = queue.filter(q => q.state === 'not_launched');
    const better = a.trybe_cpa != null && a.cpa != null ? a.trybe_cpa <= a.cpa : null;
    put(el,
      hero({ line: true },
        kpis([
          kpi({ label: 'Spend on creator videos', value: money(a.trybe_spend), sub: a.share != null ? pct(a.share) + ' of the account, last ' + (a.days || 30) + ' days' : 'last 30 days' }),
          kpi({ label: 'Sales from them', value: num(a.trybe_orders), small: a.trybe_spend > 0 && a.trybe_orders > 0 ? x(live.reduce((s, v) => s + (v.revenue || 0), 0) / a.trybe_spend) + ' ROAS' : null, sub: 'Triple Whale, last click' }),
          kpi({ label: 'Cost per sale', value: a.trybe_cpa == null ? 'none yet' : money(a.trybe_cpa),
            sub: a.cpa == null ? null : better ? statusDot('good', 'under the account ' + money(a.cpa)) : statusDot('bad', 'over the account ' + money(a.cpa)) }),
          ctx.isClient ? kpi({ label: 'Videos running', value: String(live.length), sub: plural(c.creators || 0, 'creator') })
            : kpi({ label: 'Approved, not loaded', value: String(waiting.length), sub: waiting.length ? statusDot(c.oldest >= (data.stale_days || 3) ? 'bad' : 'warn', 'oldest ' + plural(c.oldest || 0, 'day')) : statusDot('good', 'every video is loaded') }),
        ], { cols: 4 })),
      sect('Running in Meta', live.length ? plural(live.length, 'video') + ', most spend first' : ''),
      live.length ? h('div', { class: 'cr-grid' }, live.map(v => liveTile(ctx, v, a.cpa)))
        : card({}, h('p', { class: 'cr-quiet' }, 'No creator video spent in the last 30 days.')),
      queue.length ? sect('Approved, not running yet', plural(queue.length, 'video'), oldLocus(ctx, { label: 'Load in old ' + APP_NAME })) : null,
      queue.length ? card({ flush: true }, h('div', { class: 'pd-list cr-q' }, queue.map(q => {
        const st = STATE[q.state] || ['off', q.state || 'Waiting'];
        return h('button', { type: 'button', class: 'pd-line', onclick: () => play(ctx, q) },
          h('span', { class: 'n' }, h('span', { class: 'cr-mini' }, clip(q))),
          h('span', { class: 't' }, h('b', null, q.creator + (q.product ? ', ' + q.product : '')), h('small', null, q.line || q.angle || '')),
          h('span', { class: 'w' }, statusDot(st[0], st[1])),
          h('span', { class: 'd' + (q.state === 'not_launched' && q.days >= (data.stale_days || 3) ? ' late' : '') },
            q.state === 'scheduled' && q.starts ? 'Starts ' + day(q.starts) : plural(q.days || 0, 'day') + ' since approved'));
      }))) : null,
      h('p', { class: 'lx-foot' }, 'Spend is Meta. Sales and cost per sale are Triple Whale, last platform click, last 30 days. A video is matched to its ads by the creator video id in the ad name.'));
  },
};
