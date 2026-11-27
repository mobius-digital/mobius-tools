/* Creative > Creators > Videos. "Which creator videos are earning their spend?"
   The last 30 days of every approved creator video that ran in Meta, most spend first, and (team only) the approved
   videos that have not run yet. Spend is Meta's; sales and cost per sale are Triple Whale's (last platform click).
   Data: GET /api/trybe?act=<brand id> on the account-health worker. Its window is a fixed 30 days, so the date range is off. */

import { APP_NAME } from '../../config.js';
import { h, kpi, em, money, num, x, pct, statusDot, skeleton, card, platformChip } from '../../kit.js';
import { tileRow, secHead, sortMenu } from '../what-works/_ww.js';
import { defLabel } from '../../defs.js';
import { SAMPLE } from '../../data.js';
import { put, css, oldLocus, sect, pageTop, teamTag } from '../production/_ui.js';
import { crCss, clip, play, openVideo, loadCreators, notConnected, cpaDot, day, plural, CR_DEF } from './_cr.js';

const ST = { sort: 'spend', dir: 'desc' };
const SORTS = [{ id: 'spend', label: 'Spend', of: v => v.spend }, { id: 'orders', label: 'Sales', of: v => v.orders }, { id: 'cpa', label: 'Cost per sale', of: v => v.cpa, low: true }, { id: 'roas', label: 'ROAS', of: v => v.roas }];

const STATE = {
  not_launched: ['bad', 'Not loaded'], scheduled: ['info', 'Scheduled'], review: ['warn', 'In Meta review'],
  rejected: ['bad', 'Meta said no'], off: ['off', 'Ads paused'], no_spend: ['warn', 'On, no spend yet'],
};

/* whole dollars on a tile and in tables ($1,284, $942, $61); compact ($1.3k) only on a phone, so three figures fit side by side */
const whole = v => (v == null ? 'none' : v >= 1000 ? h('span', { class: 'cr-w' }, h('span', { class: 'cr-full' }, money(Math.round(v))), h('span', { class: 'cr-cmp' }, money(v, { compact: true }))) : money(Math.round(v)));

function liveTile(ctx, v, acct) {
  return h('article', { class: 'cr-tile' },
    h('button', { type: 'button', 'aria-label': 'Open the video by ' + v.creator + ' and its numbers', onclick: () => openVideo(ctx, v, { acct }) }, clip(v)),
    h('div', null, h('b', null, v.creator), h('small', null, [v.product, v.angle].filter(Boolean).join(', '))),
    h('div', { class: 'cr-nums' },
      h('span', null, h('em', null, 'Spend'), h('b', null, whole(v.spend))),
      h('span', null, h('em', null, 'Sales'), h('b', null, num(v.orders))),
      h('span', null, h('em', null, 'Per sale'), h('b', { title: 'Cost per sale' }, v.cpa == null ? 'none' : whole(v.cpa)))),
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
    const roas = a.trybe_spend > 0 && a.trybe_orders > 0 ? live.reduce((s, v) => s + (v.revenue || 0), 0) / a.trybe_spend : null;
    const grid = h('div', { class: 'cr-grid' });
    const pick = sortMenu({ items: SORTS, sort: ST.sort, dir: ST.dir, onChange: (id, d2) => { ST.sort = id; ST.dir = d2; paint(); } });
    const paint = () => { const S = SORTS.find(o => o.id === ST.sort) || SORTS[0];
      const list = [...live].sort((p, q) => { const u = S.of(p), w = S.of(q); if (u == null || w == null) return u == null ? (w == null ? 0 : 1) : -1; return ST.dir === 'asc' ? u - w : w - u; });
      put(grid, ...list.map(v => liveTile(ctx, v, a.cpa))); };
    paint();
    const old = queue.length ? oldLocus(ctx, { label: 'Load in old ' + APP_NAME }) : null;
    ctx.askWindow = 'Last ' + (a.days || 30) + ' days';
    ctx.askContext = `Creators, Videos, last ${a.days || 30} days: ${num(live.length)} creator videos ran as Meta ads, spend ${money(Math.round(a.trybe_spend || 0))}${a.share != null ? ' (' + pct(a.share) + ' of the account)' : ''}, ${num(a.trybe_orders || 0)} Triple Whale sales, cost per sale ${a.trybe_cpa == null ? 'none yet' : money(a.trybe_cpa)} against the account's ${a.cpa == null ? 'none' : money(a.cpa)}. ${num(waiting.length)} approved videos not loaded yet.`;
    put(el,
      pageTop([
        { title: 'What it is for', text: 'Every approved creator video that ran as a Meta ad in the last 30 days, and whether it earns its spend. Tap a video to watch it with all its numbers.' },
        { title: 'The figures', text: 'Spend is Meta. Sales and cost per sale are Triple Whale, last platform click, last 30 days. Under or over the account compares a video\'s cost per sale with the whole account\'s. A video is matched to its ads by the creator video id in the ad name.' },
      ], platformChip('meta'), h('span', { class: 'cr-quiet' }, 'Meta ads, last 30 days')),
      tileRow([
          kpi({ label: 'Spend on creator videos', value: money(Math.round(a.trybe_spend || 0)), sub: a.share != null ? pct(a.share) + ' of the account' : null, window: 'Last ' + (a.days || 30) + ' days', source: 'Meta' }),
          kpi({ label: 'Sales from them', value: num(a.trybe_orders), sub: plural(live.length, 'video') + ' running', window: 'Last ' + (a.days || 30) + ' days', source: 'Triple Whale, last click' }),
          kpi({ label: defLabel('ROAS', CR_DEF.roas), value: roas == null ? h('small', null, 'None yet') : x(roas), window: 'Last ' + (a.days || 30) + ' days', source: 'Triple Whale, last click' }),
          kpi({ label: defLabel('Cost per sale', CR_DEF.cpa), value: a.trybe_cpa == null ? h('small', null, 'None yet') : money(a.trybe_cpa),
            sub: a.cpa == null ? null : better ? statusDot('good', 'Under the account ' + money(Math.round(a.cpa))) : statusDot('bad', 'Over the account ' + money(Math.round(a.cpa))), window: 'Last ' + (a.days || 30) + ' days', source: 'Meta spend, Triple Whale sales' }),
        ], 4),
      secHead('Running in Meta', live.length ? plural(live.length, 'video') + ' · last 30 days · spend Meta, sales Triple Whale, last click' : '', live.length > 1 ? pick : null),
      live.length ? grid
        : card({}, h('p', { class: 'cr-quiet' }, 'No creator video spent in the last 30 days.')),
      queue.length ? secHead('Approved, not running yet', plural(waiting.length, 'video') + ' not loaded' + (waiting.length ? ', oldest ' + plural(c.oldest || 0, 'day') : '') + ' · ' + plural(queue.length, 'video') + ' in all', old ? h('span', { class: 'lx-row' }, teamTag(), old) : null) : null,
      queue.length ? card({ flush: true }, h('div', { class: 'pd-list cr-q' }, queue.map(q => {
        const st = STATE[q.state] || ['off', q.state || 'Waiting'];
        return h('button', { type: 'button', class: 'pd-line', onclick: () => play(ctx, q) },
          h('span', { class: 'n' }, h('span', { class: 'cr-mini' }, clip(q))),
          h('span', { class: 't' }, h('b', null, q.creator + (q.product ? ', ' + q.product : '')), h('small', null, q.line || q.angle || '')),
          h('span', { class: 'w' }, statusDot(st[0], st[1])),
          h('span', { class: 'd' + (q.state === 'not_launched' && q.days >= (data.stale_days || 3) ? ' late' : '') },
            q.state === 'scheduled' && q.starts ? 'Starts ' + day(q.starts) : plural(q.days || 0, 'day') + ' since approved'));
      }))) : null);
  },
};
