/* Creative > Library > Reference ads. "Which ads are we learning from?"
   Everything the team (or the client) saved for this brand as inspiration: a link or a picture, with the note on why.
   Newest first, filter by who saved it. A tile opens the saved link. Saving stays in old Locus (the Save to Locus window).
   Data: GET /api/inspo?act=<brand id> on the profit worker -> { items: [{ id, kind, url, image, title, site, note, by, at }] }. */

import { APP_NAME } from '../../config.js';
import { h, kpi, tiles, em, num, button, skeleton, empty, relativeTime } from '../../kit.js';
import { secHead } from '../what-works/_ww.js';
import { SAMPLE } from '../../data.js';
import { put, css, oldLocus, plural, daysFrom } from '../production/_ui.js';
import { lbCss, chips, search, openItem, picture, assetsButton, withAssets, pageTop, teamTag } from './_lib.js';

const SAMPLE_TODAY = '2026-11-24';
const whoOf = x => x.by_name || (x.by ? String(x.by).split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Someone');

export default {
  title: ['Which ads ', em('are we learning from?')],
  eyebrow: 'Library',
  ranges: false,
  load: ctx => withAssets(ctx, ctx.api('/api/inspo?act=' + encodeURIComponent(ctx.brand.id), { worker: 'profit', signal: ctx.signal })),
  skeleton(el) { put(el, skeleton('kpi', 3), skeleton('chart')); },

  render(el, data, ctx) {
    css(); lbCss();
    const items = (data && data.items) || [];
    if (!items.length) {
      put(el, empty({ title: 'Nothing saved for this brand yet', text: 'Save an ad from anywhere with Save to ' + APP_NAME + ': paste the link in the Ask bar, share it from your phone, or use the bookmark button.',
        action: oldLocus(ctx, { label: 'Save one in old ' + APP_NAME }) }));
      return;
    }
    const today = SAMPLE ? SAMPLE_TODAY : new Date().toLocaleDateString('en-CA');
    const week = items.filter(x => { const d = daysFrom(String(x.at || '').slice(0, 10), today); return d != null && d <= 7; }).length;
    const people = [...new Set(items.map(whoOf))];
    let by = '', q = '';
    const grid = h('div', { class: 'lb-grid' }), pick = h('div');
    const draw = () => {
      const shown = items.filter(x => (!by || whoOf(x) === by) && (!q || [x.title, x.note, x.site].join(' ').toLowerCase().includes(q)));
      put(grid, ...(shown.length ? shown.map(x => {
        const pic = () => picture({ src: x.image, art: x.art, ratio: '4/5', alt: x.title || '' });
        const meta = [whoOf(x), x.at ? relativeTime(x.at) : ''].filter(Boolean).join(', ');
        return h('button', { type: 'button', class: 'lb-tile', onclick: () => openItem({
          title: x.title || x.site || 'Saved ad', pic: pic(), text: x.note,
          facts: [['From', x.site || (x.kind === 'image' ? 'A picture' : '')], ['Saved by', meta]],
          actions: [x.url ? button('Open the ad', { href: x.url, target: '_blank', icon: 'arrow', primary: false }) : null] }) },
          pic(), h('b', null, x.title || x.site || 'Saved ad'), x.note ? h('q', null, x.note) : null, h('small', null, meta));
      }) : [h('p', { class: 'lb-quiet' }, 'Nothing matches.')]));
      put(pick, chips([{ id: '', label: 'Everyone' }, ...people.map(p => ({ id: p, label: p, n: items.filter(x => whoOf(x) === p).length }))], by, id => { by = id; draw(); }, 'Saved by'));
    };
    draw();
    const old = oldLocus(ctx, { label: 'Save one in old ' + APP_NAME });
    ctx.askWindow = 'All time';
    ctx.askContext = `Library, Reference ads: ${plural(items.length, 'saved ad')} for this brand as inspiration, ${week} saved in the last 7 days, by ${plural(people.length, 'person', 'people')}.`;
    put(el,
      pageTop([
        { title: 'What it is for', text: 'Every ad the team or the client saved for this brand as inspiration, with the note on why. Newest first; tap one to see it large and open the saved link.' },
        { title: 'How things get here', text: 'Saved with Save to ' + APP_NAME + ': paste the link in the Ask bar, share it from your phone, or use the bookmark button. A link keeps the page\'s own title and picture from the day it was saved.' },
      ], old ? teamTag() : null, old),
      tiles([
          kpi({ label: 'Saved for this brand', value: num(items.length), sub: plural(items.filter(x => x.kind === 'image').length, 'picture') + ', the rest links', window: 'All time', source: 'Save to ' + APP_NAME }),
          kpi({ label: 'Saved this week', value: num(week), sub: 'New references', window: 'Last 7 days', source: 'Save to ' + APP_NAME }),
          kpi({ label: 'People saving', value: num(people.length), sub: people.slice(0, 3).join(', '), window: 'All time', source: 'Save to ' + APP_NAME }),
        ], { cols: 3 }),
      secHead('Every saved ad', 'Newest first · tap one to see it large and open the link'),
      h('div', { class: 'lb-tools' }, search('Search the titles and notes', '', v => { q = v; draw(); }), h('span', { class: 'lx-sp' }), assetsButton(ctx, data && data.assets_link)),
      pick, grid);
  },
};
