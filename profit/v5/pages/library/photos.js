/* Creative > Library > Photos. "What photos do we have to make ads with?"
   Every image in the brand's Drive folders (and the looks Locus made), tagged once: people, setting, shot, products.
   Filter by people and setting, search the words, open one large. Read only: "Check Drive now" stays in old Locus.
   Data: GET /api/assets?act=<brand id>&limit=200 on the account-health worker. Pictures: the worker's public
   /assets-img/<brand id>/<file id> (the same address old Locus uses). */

import { h, kpi, tiles, em, num, button, statusDot, empty, skeleton, relativeTime } from '../../kit.js';
import { secHead } from '../what-works/_ww.js';
import { workers, ORG_SHORT, APP_NAME } from '../../config.js';
import { SAMPLE } from '../../data.js';
import { put, css, oldLocus, plural } from '../production/_ui.js';
import { lbCss, chips, search, openItem, picture, assetsButton, withAssets, pageTop, teamTag } from './_lib.js';
import { defLabel } from '../../defs.js';

const src = (ctx, x) => (x.thumb_key ? `${workers().ah}/assets-img/${encodeURIComponent(ctx.brand.id)}/${encodeURIComponent(x.file_id)}` : null);
const ratioOf = x => (x.w && x.h ? (x.h > x.w * 1.1 ? '4/5' : x.w > x.h * 1.1 ? '4/3' : '1/1') : '4/5');
const words = x => [x.descr, x.name, x.products, x.path, x.setting, x.shot].join(' ').toLowerCase();

function open(ctx, x) {
  const people = x.people ? plural(x.people, 'person', 'people') : 'No people';
  openItem({
    title: x.descr || x.name || 'Photo',
    pic: picture({ src: src(ctx, x), art: x.art, ratio: ratioOf(x), alt: x.descr || '' }),
    facts: [
      ['People', people], ['Setting', x.setting], ['Shot', x.shot], ['Products', x.products],
      ['Size', x.w && x.h ? `${x.w} x ${x.h}` : ''], ['Where', x.source === 'locus' ? 'Made by ' + APP_NAME + ' in Studio' : x.path], ['File', x.name],
    ],
    actions: [ctx.isClient ? null : oldLocus(ctx, { label: 'Use it in Studio in old ' + APP_NAME })],
  });
}

export default {
  title: ['What photos do we have ', em('to make ads with?')],
  eyebrow: 'Library',
  ranges: false,                 // the whole library, whatever the dates
  asOf: d => (!SAMPLE && d && d.synced_at) || null,
  load: ctx => withAssets(ctx, ctx.api(`/api/assets?act=${encodeURIComponent(ctx.brand.id)}&limit=200`, { worker: 'ah', signal: ctx.signal })),
  skeleton(el) { put(el, skeleton('kpi', 4), skeleton('chart')); },

  render(el, data, ctx) {
    css(); lbCss();
    const items = (data && data.items) || [];
    const c = (data && data.counts) || {};
    const total = (c.tagged || 0) + (c.new || 0);
    if (!total && !items.length) {
      const linked = data && data.sources && data.sources.length;
      put(el, empty({
        title: linked ? 'The library is being read' : 'No photo folder is connected',
        text: linked ? 'The brand\'s Drive folder is connected. Photos show here once they are read, a few at a time each hour.'
          : ctx.isClient ? 'Share your photo folder with your ' + ORG_SHORT + ' team and they connect it here.' : 'Add the brand\'s Drive folder in Brand settings > Integrations. Every photo in it is read and tagged once.',
        action: ctx.isClient ? null : button('Open Integrations', { href: ctx.href('brand-settings', 'integrations'), icon: 'arrow' }),
      }));
      return;
    }
    const withPeople = items.filter(x => x.people > 0).length;
    const looks = data.looks || items.filter(x => x.source === 'locus').length;
    const sets = (data.settings || []).filter(s => s.setting).slice(0, 5);
    let who = ctx.settingNow('library.people', 'all'), where = '', q = '';
    const grid = h('div', { class: 'lb-grid' }), row = h('div', { class: 'lb-row' }), count = h('span', { class: 'lb-quiet' });
    const draw = () => {
      const shown = items.filter(x => (who === 'all' || (who === 'yes' ? x.people > 0 : who === 'no' ? !x.people : x.source === 'locus'))
        && (!where || x.setting === where) && (!q || q.split(/\s+/).every(w => words(x).includes(w))));
      count.textContent = shown.length === items.length ? `Showing the newest ${items.length} of ${num(total)} in the library` : `${plural(shown.length, 'photo')} of the newest ${items.length} match`;
      put(grid, ...(shown.length ? shown.map(x => h('button', { type: 'button', class: 'lb-tile', onclick: () => open(ctx, x) },
        picture({ src: src(ctx, x), art: x.art, ratio: '4/5', alt: x.descr || '', badge: x.source === 'locus' ? 'Made by ' + APP_NAME : x.people ? plural(x.people, 'person', 'people') : null }),
        h('b', null, x.descr || x.name || 'Photo'),
        [x.setting, x.shot].filter(Boolean).length ? h('div', { class: 'lb-tags' }, [x.setting, x.shot].filter(Boolean).map(t => h('span', null, t))) : h('small', null, x.status === 'new' ? 'Being tagged' : ''))) : [h('p', { class: 'lb-quiet' }, 'No photo matches. Try fewer words.')]));
      put(row,
        chips([{ id: 'all', label: 'Everything' }, { id: 'yes', label: 'With people', n: withPeople }, { id: 'no', label: 'No people', n: items.length - withPeople },
          looks ? { id: 'locus', label: 'Made with ' + APP_NAME + ' AI', n: looks } : null].filter(Boolean), who, id => { who = id; ctx.saveSetting('library.people', id); draw(); }, 'People'),
        sets.length ? chips([{ id: '', label: 'Any setting' }, ...sets.map(s => ({ id: s.setting, label: s.setting[0].toUpperCase() + s.setting.slice(1), n: s.n }))], where, id => { where = id; draw(); }, 'Setting') : null);
    };
    draw();
    const old = ctx.isClient ? null : oldLocus(ctx, { label: 'Check Drive in old ' + APP_NAME });
    ctx.askWindow = 'All time';
    ctx.askContext = `Library, Photos: ${plural(total - (data.looks || 0), 'photo')} in the brand's Drive folders, ${looks} looks made with ${APP_NAME} AI; of the newest ${items.length}, ${withPeople} have people in them; ${c.new || 0} waiting for tags.`;
    put(el,
      pageTop([
        { title: 'What it is for', text: 'Every photo in the brand\'s Drive folders, and the looks made with ' + APP_NAME + ' AI, to pick from when making ads. Filter by people and setting, search the words, tap one to see it large.' },
        { title: 'Where the photos come from', text: 'Read from the brand\'s Drive folders. Files are never moved or changed. Tags (people, setting, shot, products) are written once by ' + APP_NAME + ' AI from a small copy of each photo; new photos are read a few each hour.' },
      ], old ? teamTag() : null, old),
      tiles([
          kpi({ label: 'Photos', value: num(total - (data.looks || 0)), sub: 'In the brand\'s Drive folders', window: 'All time', source: 'Drive' }),
          kpi({ label: 'With people in them', value: num(withPeople), sub: 'Of the newest ' + items.length, window: 'Newest ' + items.length, source: APP_NAME + ' AI tags' }),
          kpi({ label: defLabel('Waiting for tags', { name: 'Waiting for tags', definition: APP_NAME + ' AI reads a few new photos each hour and tags them. Until then they show here untagged.' }), value: num(c.new || 0), sub: c.new ? statusDot('warn', 'Tagged a few each hour') : statusDot('good', 'All tagged'), window: 'Now', source: APP_NAME + ' AI tags' }),
          kpi({ label: defLabel('Last synced from Drive', { name: 'Last synced from Drive', definition: 'When ' + APP_NAME + ' last looked in the brand\'s Drive folders for new photos.' }), value: data.synced_at ? relativeTime(data.synced_at) : h('small', null, 'Not yet'), sub: looks ? 'Made with ' + APP_NAME + ' AI: ' + num(looks) : null, source: 'Drive' }),
        ], { cols: 4 }),
      secHead('Every photo', 'Newest first · tap one to see it large'),
      h('div', { class: 'lb-tools' }, search('Search: man in a polo, buckle close up, golf course', '', v => { q = v; draw(); }), count, h('span', { class: 'lx-sp' }), assetsButton(ctx, data.assets_link)),
      row, grid,
      items.length < total ? h('div', { style: { justifySelf: 'center' } }, old ? oldLocus(ctx, { label: 'See all ' + num(total) + ' in old ' + APP_NAME }) : null) : null);
  },
};
