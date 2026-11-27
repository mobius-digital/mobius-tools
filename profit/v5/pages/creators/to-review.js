/* Creative > Creators > To review. "Which creator videos need a yes?"
   The videos waiting in the creator platform for this brand, oldest first, each with what the creator says.
   Read only: approve, ask for changes or turn down in old Locus (it writes to the creator platform and pays the creator).
   Data: GET /api/trybe/review?act=<brand id> on the account-health worker (team only; a client never calls it).
   That route needs the brand's creator platform key and answers 400 without one, so the page first checks which
   brands have a program (keyedBrands in _cr.js) and does not ask for a brand that has none. A 400 that still comes
   back reads as "no creator program", never as an error. */

import { APP_NAME } from '../../config.js';
import { h, kpi, em, button, statusDot, empty, skeleton } from '../../kit.js';
import { tileRow, secHead } from '../what-works/_ww.js';
import { SAMPLE } from '../../data.js';
import { put, css, oldLocus, pageTop, teamTag } from '../production/_ui.js';
import { crCss, clip, play, ago, todayOf, plural, keyedBrands, approveOld } from './_cr.js';

export default {
  title: ['Which creator videos ', em('need a yes?')],
  eyebrow: 'Creators',
  ranges: false,                     // what is waiting now, not a span of days

  async load(ctx) {
    if (ctx.isClient) return { client: true };
    if (!ctx.brand) return { has_key: false };
    const keyed = await keyedBrands(ctx, ctx.brand.id);
    if (keyed && !keyed.has(ctx.brand.id)) return { has_key: false };
    try { return await ctx.api('/api/trybe/review?act=' + encodeURIComponent(ctx.brand.id), { worker: 'ah', signal: ctx.signal }); }
    catch (e) { if (e && e.name === 'AbortError') throw e; if (e && (e.status === 400 || e.status === 404)) return { has_key: false, error: e.message }; throw e; }
  },
  skeleton(el) { put(el, skeleton('kpi', 3), skeleton('chart')); },

  render(el, data, ctx) {
    css(); crCss();
    if (ctx.isClient || (data && data.client)) {
      put(el, empty({ title: 'Your team reviews creator videos', text: 'Videos you have approved and that are running show under Videos.', action: button('Open Videos', { href: ctx.href('creators', 'videos'), icon: 'arrow' }) }));
      return;
    }
    if (!data || data.has_key === false) {
      put(el, empty({ title: 'No creator program for this brand', text: 'This brand has no creator platform connected, so there is nothing to review. To start one, add the brand\'s creator platform key in Brand settings > Integrations.',
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
    const kpiRow = tileRow([
          kpi({ label: 'Waiting for a yes', value: String(items.length), sub: plural(people, 'creator'), window: 'Now', source: 'Creator platform' }),
          kpi({ label: 'Oldest', value: plural(oldest, 'day'), sub: oldest >= 3 ? statusDot('bad', 'Over the 3 day line') : statusDot('good', 'Inside the 3 day line'), window: 'Now', source: 'Creator platform' }),
          kpi({ label: 'Videos', value: String(videos), sub: plural(items.length - videos, 'photo'), window: 'Now', source: 'Creator platform' }),
        ], 3);
    const old = oldLocus(ctx, { label: 'Review in old ' + APP_NAME });
    ctx.askWindow = 'Now';
    ctx.askContext = `Creators, To review: ${items.length} creator ${items.length === 1 ? 'video' : 'videos'} waiting for a yes from ${plural(people, 'creator')}, oldest ${plural(oldest, 'day')} (the line is 3 days). ${videos} videos, ${items.length - videos} photos.`;
    put(el,
      pageTop([
        { title: 'What it is for', text: 'The creator videos waiting for a yes for this brand, oldest first, each with what the creator says. A video waiting 3 days or more is over the line.' },
        { title: 'Why approving is not here', text: 'Approving pays the creator and tells them, so it is done in old ' + APP_NAME + ' or the creator platform. Tap a video to watch it; the sheet has the button.' },
      ], old ? teamTag() : null, old),
      kpiRow,
      secHead('Waiting, oldest first', 'Tap a video to watch it and see what the creator says'),
      h('div', { class: 'cr-grid' }, items.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map(it => h('article', { class: 'cr-tile' },
        h('button', { type: 'button', 'aria-label': 'Watch the video by ' + it.creator, onclick: () => play(ctx, it, { primary: approveOld(ctx) }) }, clip(it, ago(it.created_at, today))),
        h('div', null, h('b', null, it.creator), it.product ? h('small', null, it.product) : null),
        it.angle ? h('span', { class: 'lx-chip cr-tag' }, 'Angle: ' + it.angle) : null,
        it.line ? h('q', null, it.line) : null))));
  },
};
