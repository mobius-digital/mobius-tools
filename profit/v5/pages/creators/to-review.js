/* Creative > Creators > To review. "Which creator videos need a yes?"
   The videos waiting in the creator platform for this brand, oldest first, each with what the creator says.
   Read only: approve, ask for changes or turn down in old Locus (it writes to the creator platform and pays the creator).
   Data: GET /api/trybe/review?act=<brand id> on the account-health worker (team only; a client never calls it). */

import { APP_NAME } from '../../config.js';
import { h, hero, kpi, kpis, em, button, statusDot, empty, skeleton } from '../../kit.js';
import { SAMPLE } from '../../data.js';
import { put, css, oldLocus } from '../production/_ui.js';
import { crCss, clip, play, ago, todayOf, plural } from './_cr.js';

export default {
  title: ['Which creator videos ', em('need a yes?')],
  eyebrow: 'Creators',
  ranges: false,                     // what is waiting now, not a span of days

  async load(ctx) {
    if (ctx.isClient) return { client: true };
    try { return await ctx.api('/api/trybe/review?act=' + encodeURIComponent(ctx.brand.id), { worker: 'ah', signal: ctx.signal }); }
    catch (e) { if (e && e.name === 'AbortError') throw e; if (e && e.status === 400) return { has_key: false, error: e.message }; throw e; }
  },
  skeleton(el) { put(el, skeleton('kpi', 3), skeleton('chart')); },

  render(el, data, ctx) {
    css(); crCss();
    if (ctx.isClient || (data && data.client)) {
      put(el, empty({ title: 'Your team reviews creator videos', text: 'Videos you have approved and that are running show under Videos.', action: button('Open Videos', { href: ctx.href('creators', 'videos'), icon: 'arrow' }) }));
      return;
    }
    if (!data || data.has_key === false) {
      put(el, empty({ title: 'Creators are not connected for this brand', text: 'Add the brand\'s creator platform key in Brand settings > Integrations. Then every video waiting for a yes shows here.',
        action: button('Open Integrations', { href: ctx.href('brand-settings', 'integrations'), icon: 'arrow' }) }));
      return;
    }
    const items = (data.items || []).slice();
    const today = SAMPLE ? '2026-11-24' : todayOf(data);
    if (!items.length) {
      put(el, empty({ title: 'Nothing waiting for a yes', text: 'When a creator sends a video, it shows here.' }));
      return;
    }
    const age = it => { const d = String(it.created_at || '').slice(0, 10); return d ? Math.max(0, Math.round((new Date(today + 'T12:00:00') - new Date(d + 'T12:00:00')) / 864e5)) : 0; };
    const oldest = Math.max(...items.map(age));
    const videos = items.filter(i => i.media !== 'image').length;
    const people = new Set(items.map(i => i.creator)).size;
    put(el,
      hero({ line: true },
        kpis([
          kpi({ label: 'Waiting for a yes', value: String(items.length), sub: plural(people, 'creator') }),
          kpi({ label: 'Oldest', value: plural(oldest, 'day'), sub: oldest >= 3 ? statusDot('bad', '3 days or more') : statusDot('good', 'under 3 days') }),
          kpi({ label: 'Videos', value: String(videos), sub: plural(items.length - videos, 'photo') }),
        ], { cols: 3 })),
      h('div', { class: 'pd-tools' }, h('span', { class: 'cr-quiet' }, 'Oldest first. Tap a video to watch it.'), h('span', { class: 'lx-sp' }), oldLocus(ctx, { label: 'Review in old ' + APP_NAME })),
      h('div', { class: 'cr-grid' }, items.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map(it => h('article', { class: 'cr-tile' },
        h('button', { type: 'button', 'aria-label': 'Watch the video by ' + it.creator, onclick: () => play(ctx, it) }, clip(it)),
        h('div', null, h('b', null, it.creator), h('small', null, [it.product, ago(it.created_at, today)].filter(Boolean).join(', '))),
        it.angle ? h('span', { class: 'lx-chip cr-tag' }, it.angle) : null,
        it.line ? h('q', null, it.line) : null))),
      h('p', { class: 'lx-foot' }, 'Read only here. Approving pays the creator and tells them, so it is done in old ' + APP_NAME + ' or the creator platform.'));
  },
};
