/* Ads > TikTok > Best videos. Every video with spend, the Meta > Best ads way: All / Spark ads / Brand videos,
   the app's sort menu with a direction, and Cards or Table. A card is the shared ad card (_tt.js videoCard), 3 a row
   on a wide screen; every card and row opens the video's sheet. TikTok sends no per video rows on this connection
   yet, so real mode shows that state plainly. */

import { h, card, table, pill, money, pct, x, segmented, button, put } from '../../kit.js';
import { TT_TITLES, styles, loadTikTok, sampleTikTok, gate, videoCard, videoSheet, noVideoNumbers, campaignsCard, ttHead } from './_tt.js';
import { def } from '../platforms/_ads.js';

const p = v => (v == null ? 'no data' : pct(v, { digits: v < 0.1 ? 1 : 0 }));
/* sort keys: [label, value of a row, column key in the table, the words on a card when it is not one of the four shown] */
const SORTS = {
  spend: ['Spend', v => v.spend, 'spend'],
  sales: ['Sales', v => v.sales, 'sales'],
  roas: ['ROAS', v => v.roas, 'roas'],
  v2: ['2 second views', v => v.v2, 'v2'],
  v6: ['6 second views', v => v.v6, 'v6', v => '6s views ' + p(v.v6)],
  end: ['Watched to the end', v => v.end, 'end', v => 'To the end ' + p(v.end)],
};
const COL_TO_SORT = Object.fromEntries(Object.entries(SORTS).map(([id, s]) => [s[2], id]));
const PAGE = 6;

export function view(d, ctx) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  const vids = d.videos;
  const head = ttHead(d, ctx, 'Every TikTok video with spend on these dates, sorted by the number you pick, as cards or a table. Tap a video for all of its numbers.');
  if (!vids || !vids.length) return [head, noVideoNumbers(), campaignsCard(d)].filter(Boolean);
  let type = ctx.settingNow('tiktok.top.type', 'all'), sort = ctx.settingNow('tiktok.top.sort', 'spend'), view = ctx.settingNow('tiktok.top.view', 'cards'), shown = PAGE;
  if (!SORTS[sort]) sort = 'spend';
  let dir = ctx.settingNow('tiktok.top.dir', 'desc');
  const rowsNow = () => {
    const val = SORTS[sort][1];
    return vids.filter(v => type === 'all' || (type === 'spark') === !!v.spark).slice().sort((a, b) => {
      const A = val(a), B = val(b);
      if (A == null || B == null) return A != null ? -1 : B != null ? 1 : (b.spend || 0) - (a.spend || 0);
      return (dir === 'asc' ? A - B : B - A) || (b.spend || 0) - (a.spend || 0);
    });
  };
  const box = h('div'), more = h('div', { class: 'mr-more' });
  const sortLabel = h('b', null, SORTS[sort][0]);
  const dirWord = () => (dir === 'desc' ? 'High to low' : 'Low to high');
  const setSort = (id, d2) => { sort = id; dir = d2; sortLabel.textContent = SORTS[sort][0]; dirBtn.textContent = dirWord(); ctx.saveSetting('tiktok.top.sort', sort); ctx.saveSetting('tiktok.top.dir', dir); };
  const W = d.range ? d.range.label : null;
  const paint = () => {
    const rows = rowsNow();
    if (view === 'table') {
      const col = SORTS[sort][2];
      const tbl = table({ roomy: true, rows, onRow: v => videoSheet(v, d), empty: 'No videos of this kind spent on these dates.', cols: [
        { key: 'name', label: 'Video', render: r => h('span', { class: 'name' }, r.name, h('span', { class: 'sub' }, r.by)) },
        { key: 'spark', label: 'Type', class: 'hide-sm', render: r => (r.spark ? pill('', 'Spark ad') : h('span', { class: 'dim' }, 'Brand video')) },
        { key: 'spend', label: 'Spend', num: true, sortable: true, render: r => money(r.spend) },
        { key: 'roas', label: def('ROAS', 'roas'), num: true, sortable: true, class: 'strong', render: r => (r.roas != null ? x(r.roas) : 'n/a') },
        { key: 'sales', label: 'Sales', num: true, sortable: true, class: col === 'sales' ? '' : 'hide-sm', render: r => (r.sales != null ? money(r.sales) : 'n/a') },
        { key: 'v2', class: col === 'v2' ? '' : 'hide-sm', label: def('2 second views', 'hook'), num: true, sortable: true, render: r => p(r.v2) },
        { key: 'v6', class: col === 'v6' ? '' : 'hide-sm', label: def('6 second views', 'six_second'), num: true, sortable: true, render: r => p(r.v6) },
        { key: 'end', class: col === 'end' ? '' : 'hide-sm', label: def('To the end', 'watched_end'), num: true, sortable: true, render: r => p(r.end) },
      ] });
      tbl.querySelectorAll('th[data-key]').forEach(th => { const on = th.dataset.key === col; th.classList.toggle('sorted', on); th.classList.toggle('asc', on && dir === 'asc'); });
      /* a column head sorts through the same rule as the cards: caught before the kit's own sort runs */
      tbl.addEventListener('click', e => {
        const th = e.target.closest('th[data-key]'); if (!th || !COL_TO_SORT[th.dataset.key]) return;
        e.stopPropagation();
        const id = COL_TO_SORT[th.dataset.key];
        setSort(id, id === sort ? (dir === 'desc' ? 'asc' : 'desc') : 'desc');
        paint();
      }, true);
      put(box, card({ flush: true, class: 'tt-top' }, tbl));
      put(more, '');
    } else {
      const s = SORTS[sort];
      put(box, h('div', { class: 'tt-grid' }, ...(rows.length ? rows.slice(0, shown).map(v => videoCard(v, d, s[3] && s[1](v) != null ? s[3](v) : null)) : [h('p', { class: 'dim' }, 'No videos of this kind spent on these dates.')])));
      put(more, rows.length > shown ? button(`Show all ${rows.length} videos`, { onclick: () => { shown = rows.length; paint(); } }) : '');
    }
  };
  /* Sort by: the app's own menu (the same pop up as Meta > Best ads), never a native select */
  let menu = null;
  const shut = () => { if (!menu) return; menu.remove(); menu = null; document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc, true); sortBtn.setAttribute('aria-expanded', 'false'); };
  const away = e => { if (menu && !menu.contains(e.target) && !sortBtn.contains(e.target)) shut(); };
  const esc = e => { if (e.key === 'Escape') { shut(); sortBtn.focus(); } };
  const sortBtn = button([h('span', { class: 'k' }, 'Sort by'), sortLabel, h('i', { class: 'car' })], { class: 'tt-sortb', onclick: () => {
    if (menu) return shut();
    menu = h('div', { class: 'lx-pop tt-menu', role: 'menu', 'aria-label': 'Sort by' },
      Object.entries(SORTS).map(([id, s]) => h('button', { type: 'button', class: 'lx-item', role: 'menuitemradio', 'aria-checked': id === sort ? 'true' : 'false',
        onclick: () => { shut(); setSort(id, 'desc'); paint(); } }, s[0], id === sort ? h('span', { class: 'ck', 'aria-hidden': 'true' }, '✓') : null)));
    document.body.append(menu);
    const r = sortBtn.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    menu.style.top = Math.round(r.bottom + 6) + 'px';
    menu.style.left = Math.round(Math.max(8, Math.min(vw - menu.offsetWidth - 8, r.left))) + 'px';
    sortBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', esc, true); window.addEventListener('hashchange', shut, { once: true });
    (menu.querySelector('[aria-checked=true]') || menu.querySelector('button')).focus();
  } });
  sortBtn.setAttribute('aria-haspopup', 'menu'); sortBtn.setAttribute('aria-expanded', 'false');
  const dirBtn = button(dirWord(), { class: 'tt-dir', title: 'Flip the order', onclick: () => { setSort(sort, dir === 'desc' ? 'asc' : 'desc'); paint(); } });
  paint();
  const n = k => vids.filter(v => (k === 'spark') === !!v.spark).length;
  return [
    head,
    h('div', { class: 'tt-h' },
      h('div', { class: 't' }, h('h2', null, 'Every video that spent'), h('p', null, [W, 'sales and ROAS Triple Whale, spend and views TikTok Ads'].filter(Boolean).join(' · '))),
      h('div', { class: 'tt-ctl' },
        segmented([{ id: 'all', label: 'All' }, { id: 'spark', label: `Spark ${n('spark')}` }, { id: 'brand', label: `Brand ${n('brand')}` }], type, id => { type = id; shown = PAGE; ctx.saveSetting('tiktok.top.type', id); paint(); }),
        sortBtn, dirBtn,
        segmented([{ id: 'cards', label: 'Cards' }, { id: 'table', label: 'Table' }], view, id => { view = id; ctx.saveSetting('tiktok.top.view', id); paint(); }))),
    box, more,
  ].filter(Boolean);
}

export default {
  title: TT_TITLES['top-videos'],
  eyebrow: 'TikTok',
  load: loadTikTok,
  sample: sampleTikTok,
  render(el, d, ctx) {
    styles();
    if (d && d.range) { ctx.askWindow = d.range.label; ctx.askContext = `TikTok videos for ${ctx.brand ? ctx.brand.name : 'this brand'}, ${d.range.label}: ${(d.videos || []).length} videos with spend. Sales and ROAS are Triple Whale, spend and views TikTok Ads.`; }
    put(el, ...view(d, ctx));
  },
};
