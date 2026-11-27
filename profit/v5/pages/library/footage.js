/* Creative > Library > Footage. "What footage do we have to cut ads from?"
   Raw clips and B-roll for the brand: length, setting, who is in them, and whether an ad has used them yet.
   NO READ ROUTE EXISTS YET: the photo library (p_asset) indexes images only and Frame has no list route for Locus.
   Until one is built this page draws the sample clips in real mode too, under the "Example" chip.
   The route it needs: GET /api/assets/footage?act=<brand id> -> { items: [{ id, name, secs, res, setting, people, descr,
   folder, modified, thumb, used }], total, hours, synced_at }. */

import { APP_NAME } from '../../config.js';
import { h, kpi, tiles, em, num, statusDot, skeleton } from '../../kit.js';
import { secHead } from '../what-works/_ww.js';
import { fixture, SAMPLE } from '../../data.js';
import { put, css, oldLocus, exampleChip, plural } from '../production/_ui.js';
import { lbCss, chips, search, openItem, picture, assetsButton, pageTop, teamTag } from './_lib.js';

const len = s => (s == null ? '' : s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : '0:' + String(s).padStart(2, '0'));

export default {
  title: ['What footage do we have ', em('to cut ads from?')],
  eyebrow: 'Library',
  ranges: false,
  /* no endpoint yet: the sample file, marked as an example */
  async load(ctx) { return { ...(await fixture('library/_sample/footage.json')), example: true }; },
  skeleton(el) { put(el, skeleton('kpi', 3), skeleton('chart')); },

  render(el, data, ctx) {
    css(); lbCss();
    const items = (data && data.items) || [];
    let who = 'all', q = '';
    const grid = h('div', { class: 'lb-grid lb-wide' }), count = h('span', { class: 'lb-quiet' });
    const draw = () => {
      const shown = items.filter(x => (who === 'all' || (who === 'unused' ? !x.used : who === 'people' ? x.people > 0 : !x.people))
        && (!q || q.split(/\s+/).every(w => [x.name, x.descr, x.setting, x.folder].join(' ').toLowerCase().includes(w))));
      count.textContent = `${plural(shown.length, 'clip')} shown.`;
      put(grid, ...shown.map(x => h('button', { type: 'button', class: 'lb-tile', onclick: () => openItem({
        title: x.name, pic: picture({ src: x.thumb, art: x.art, video: true, ratio: '16/9', badge: len(x.secs) }),
        text: x.descr,
        facts: [['Length', len(x.secs)], ['Quality', x.res], ['People', x.people ? plural(x.people, 'person', 'people') : 'No people'], ['Setting', x.setting], ['Folder', x.folder], ['In an ad', x.used ? 'Yes' : 'Not yet']],
        actions: [ctx.isClient ? null : oldLocus(ctx, { label: 'Open in old ' + APP_NAME })] }) },
        picture({ src: x.thumb, art: x.art, video: true, ratio: '16/9', badge: len(x.secs) }),
        h('b', null, x.name), h('div', { class: 'lb-tags' }, x.setting ? h('span', null, x.setting) : null, h('span', null, x.used ? 'Used in an ad' : 'Not used yet')))));
    };
    const pick = h('div');
    const drawChips = () => put(pick, chips([{ id: 'all', label: 'Everything' }, { id: 'unused', label: 'Not used yet', n: items.filter(x => !x.used).length },
      { id: 'people', label: 'With people', n: items.filter(x => x.people > 0).length }, { id: 'none', label: 'No people', n: items.filter(x => !x.people).length }], who, id => { who = id; drawChips(); draw(); }, 'Show'));
    drawChips(); draw();
    const old = ctx.isClient ? null : oldLocus(ctx, { label: 'Open the footage in old ' + APP_NAME });
    ctx.askWindow = 'All time';
    ctx.askContext = `Library, Footage: ${plural(data.total || items.length, 'clip')}${data.hours ? ', ' + data.hours + ' hours' : ''}; of the newest ${items.length}, ${items.filter(x => !x.used).length} not used in an ad yet and ${items.filter(x => x.people > 0).length} with people.` + (data.example && !SAMPLE ? ' An example until the footage feed is built.' : '');
    put(el,
      pageTop([
        { title: 'What it is for', text: 'Raw clips and B-roll the team can cut ads from: length, setting, who is in them, and whether an ad has used them yet. Tap one for its details.' },
        { title: 'Where it comes from', text: 'Files stay where they are; nothing here moves or changes them.' + (data && data.example ? ' The clips here are an example until the footage feed is built.' : '') },
      ], data && data.example && !SAMPLE ? exampleChip() : null, old ? teamTag() : null, old),
      tiles([
          kpi({ label: 'Clips', value: num(data.total || items.length), sub: data.hours ? data.hours + ' hours of footage' : null, window: 'All time', source: data && data.example && !SAMPLE ? 'Example' : 'Footage folders' }),
          kpi({ label: 'Not used in an ad yet', value: num(items.filter(x => !x.used).length), sub: 'Of the newest ' + items.length, window: 'Newest ' + items.length, source: data && data.example && !SAMPLE ? 'Example' : 'Footage folders' }),
          kpi({ label: 'With people', value: num(items.filter(x => x.people > 0).length), sub: 'Real people, filmed', window: 'Newest ' + items.length, source: data && data.example && !SAMPLE ? 'Example' : 'Footage folders' }),
        ], { cols: 3 }),
      secHead('Every clip', 'Newest first · tap one for its details'),
      h('div', { class: 'lb-tools' }, search('Search: swing, buckle, unboxing', '', v => { q = v; draw(); }), count, h('span', { class: 'lx-sp' }), assetsButton(ctx, null)),
      pick, grid);
  },
};
