/* Agency > Meta > Load ads. "Which brands have ads waiting to go into Meta?"
   One row per brand: cards ready to load, cards loaded and waiting for their date, the next go live date, and
   what was loaded in the last 7 days. A row opens that brand's own Load ads page, where each card shows
   where it would go. Under it, every card in Ready across the brands, each with a Load button that runs the real
   load for that card's brand (production/_load.js: batch-prep, batch-preview, batch-create, made paused).
   Sample mode never loads. Viewers see the list with no Load button.

   Real mode reads (GET only, two calls for every brand at once):
     GET /api/production?act=all   account-health: every brand's board; the cards in Ready and Scheduled
     GET /api/launch/list          account-health: the ads loaded through Locus (newest 500), with their last known state
   This page does not read Meta itself (that is one call per brand; the brand page does it). So "loaded" here means
   loaded through Locus. Nothing is example data. If the launch read fails, its columns are left out. */

import { h, card, hero, kpi, kpis, table, statusDot, empty, skeleton, put, num } from '../../kit.js';
import { APP_NAME } from '../../config.js';
import { plural, day, todayOf, weekOf, isDay } from '../production/_ui.js';
import { soft, styles } from '../meta/_rest.js';
import { picture } from '../production/_ui.js';
import { openLoad } from '../production/_load.js';
import { canWrite } from '../production/_act.js';
import { refresh } from '../../router.js';
import { SAMPLE } from '../../data.js';
import { button } from '../../kit.js';

const CSS = `
.al-brand{display:inline-flex;align-items:center;gap:8px;min-width:0;font-weight:600}
.al-brand i{width:9px;height:9px;border-radius:3px;flex:none}
.al-n{font-variant-numeric:tabular-nums}
.al-n.zero{color:var(--faint)}
.al-n small{color:var(--muted);font-size:12px;font-weight:400}
.al-next{display:grid}
.al-next>a{display:grid;grid-template-columns:88px minmax(0,1fr) auto;gap:14px;align-items:center;padding:12px 28px;border-top:1px solid var(--line);color:inherit;text-decoration:none;font-size:13.5px;min-width:0}
.al-next>a:first-child{border-top:0}
.al-next>a:hover b{text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:3px}
.al-next .d{color:var(--muted);white-space:nowrap}
.al-next .t{min-width:0}
.al-next .t b{display:block;font-weight:600;overflow-wrap:anywhere}
.al-next .t small{display:block;color:var(--muted);font-size:12.5px}
.al-ready{display:grid}
.al-ready>div{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:14px;align-items:center;padding:12px 28px;border-top:1px solid var(--line);min-width:0}
.al-ready>div:first-child{border-top:0}
.al-ready .pd-pic{width:48px;border-radius:var(--r-chip,6px)}
.al-ready .t{min-width:0}
.al-ready .t b{display:block;font-weight:600;overflow-wrap:anywhere}
.al-ready .t small{display:block;color:var(--muted);font-size:12.5px}
@media (max-width:759px){
  .al-ready>div{grid-template-columns:44px minmax(0,1fr);gap:8px 12px;padding:12px 16px}
  .al-ready>div>.lx-btn{grid-column:1/-1;width:100%;min-height:44px}
  .al-n small{display:block;white-space:nowrap}
  .al-next>a{grid-template-columns:72px minmax(0,1fr);gap:4px 12px;padding:12px 16px}
  .al-next>a>.lx-stat{grid-column:2}
}`;

const ON = 'ACTIVE';
const daysBack = (at, today) => { const d = String(at || '').slice(0, 10); return isDay(d) ? Math.round((new Date(today + 'T12:00:00') - new Date(d + 'T12:00:00')) / 864e5) : null; };

/** The page's data from the two answers. Sample mode runs the same code on the fixture. */
export function build({ board, launches }) {
  const today = todayOf(board);
  const cards = ((board && board.cards) || []).filter(c => c.board === 'ready' || c.board === 'scheduled');
  const log = Array.isArray(launches) ? launches : null;
  const names = new Map(((board && board.brands) || []).map(b => [b.act_id || b.id, b.name]));
  const by = new Map();
  const rowOf = (id, name) => {
    if (!by.has(id)) by.set(id, { act_id: id, brand: name || names.get(id) || '', ready: 0, files: 0, waiting: 0, next: '', next_title: '', passed: 0, loaded7: log ? 0 : null, on7: log ? 0 : null, last: '' });
    const r = by.get(id); if (!r.brand && name) r.brand = name;
    return r;
  };
  for (const c of cards) {
    const r = rowOf(c.act_id, c.brand);
    if (c.board === 'ready') { r.ready++; r.files += +c.versions || 0; if (isDay(c.launch_on) && c.launch_on < today) r.passed++; } else r.waiting++;
    if (isDay(c.launch_on) && c.launch_on >= today && (!r.next || c.launch_on < r.next)) { r.next = c.launch_on; r.next_title = (c.num ? c.num + ' ' : '') + (c.title || ''); }
  }
  for (const l of log || []) {
    const n = daysBack(l.at, today);
    if (n == null || n > 7 || !l.act) continue;
    const r = rowOf(l.act, '');
    r.loaded7++; if ((l.eff_status || l.status) === ON) r.on7++;
    if (String(l.at) > r.last) r.last = String(l.at);
  }
  const rows = [...by.values()].sort((a, b) => b.ready - a.ready || b.waiting - a.waiting || (b.loaded7 || 0) - (a.loaded7 || 0));
  const dated = cards.filter(c => isDay(c.launch_on) && c.launch_on >= today).sort((a, b) => a.launch_on.localeCompare(b.launch_on) || String(a.brand).localeCompare(String(b.brand)))
    .slice(0, 10).map(c => ({ act_id: c.act_id, brand: c.brand || names.get(c.act_id) || '', num: c.num || '', title: c.title || '', format: c.format || '', date: c.launch_on, loaded: c.board === 'scheduled' }));
  const readyCards = cards.filter(c => c.board === 'ready').map(c => ({ id: c.id, act_id: c.act_id, brand: c.brand || names.get(c.act_id) || '', num: c.num ? String(parseInt(c.num, 10) || c.num) : '',
    title: c.title || '', format: c.format || '', files: +c.versions || 0, thumb: c.thumb || null, art: c.art || null, launch_on: isDay(c.launch_on) ? c.launch_on : '' }))
    .sort((a, b) => String(a.launch_on || '9').localeCompare(String(b.launch_on || '9')) || String(a.brand).localeCompare(String(b.brand)));
  return { today, log_ok: !!log, rows, dated, ready_cards: readyCards };
}

async function load(ctx) {
  const ah = path => ctx.api(path, { worker: 'ah', signal: ctx.signal });
  const [board, list] = await Promise.all([ah('/api/production?act=all'), soft(ah('/api/launch/list'))]);
  return build({ board, launches: list && Array.isArray(list.launches) ? list.launches : null });
}

/* ---------- the parts ---------- */
const brandOf = (ctx, id) => (ctx.brands || []).find(b => b.id === id) || null;
const pageOf = (ctx, id) => { const b = brandOf(ctx, id); return b ? '#/brand/' + encodeURIComponent(b.slug) + '/meta/load-ads' : null; };
const brandName = (ctx, id, name) => { const b = brandOf(ctx, id); return h('span', { class: 'al-brand' }, h('i', { style: { background: (b && b.color) || 'var(--slate)' } }), name || (b && b.name) || 'Brand'); };
const n = v => h('span', { class: 'al-n' + (v ? '' : ' zero') }, String(v));

export default {
  title: 'Ads waiting to load, all brands',
  eyebrow: 'Meta, all brands',
  ranges: false,
  load,
  sample: async ctx => build(await ctx.fixture('load-ads.json')),
  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('row', 7)); },

  render(el, d, ctx) {
    styles('al-css', CSS);
    const rows = (d && d.rows) || [];
    if (!rows.length) return put(el, empty({ title: 'Nothing is waiting to be loaded', text: 'A brand shows here when a card on its board is in Ready, or when ads were loaded in the last 7 days.' }));
    const wk = weekOf(d.today);
    const sum = k => rows.reduce((t, r) => t + (r[k] || 0), 0);
    const ready = sum('ready'), waiting = sum('waiting'), passed = sum('passed');
    const thisWeek = d.dated.filter(c => c.date >= wk[0] && c.date <= wk[1]);
    put(el, ...[
      hero({ line: true }, kpis([
        kpi({ label: 'Ready to load', value: String(ready), small: ready === 1 ? 'card' : 'cards',
          sub: !ready ? 'nothing waiting' : passed ? statusDot('bad', plural(passed, 'card') + ' past its date') : plural(rows.filter(r => r.ready).length, 'brand') }),
        kpi({ label: 'Loaded, waiting for its date', value: String(waiting), small: waiting === 1 ? 'card' : 'cards', sub: plural(rows.filter(r => r.waiting).length, 'brand') }),
        kpi({ label: 'Going live this week', value: String(thisWeek.length), small: thisWeek.length === 1 ? 'card' : 'cards', sub: `${day(wk[0])} to ${day(wk[1])}` }),
        d.log_ok ? kpi({ label: 'Loaded in the last 7 days', value: num(sum('loaded7')), small: sum('loaded7') === 1 ? 'ad' : 'ads', sub: sum('loaded7') ? `${num(sum('on7'))} on now` : `through ${APP_NAME}` }) : null,
      ].filter(Boolean), { cols: 4 })),
      card({ title: 'Every brand', note: 'most ready first', flush: true },
        table({
          rows, roomy: true,
          onRow: r => { const to = pageOf(ctx, r.act_id); if (to) location.hash = to; },
          cols: [
            { key: 'brand', label: 'Brand', render: r => brandName(ctx, r.act_id, r.brand) },
            { key: 'ready', label: 'Ready', num: true, sortable: true, render: r => h('span', { class: 'al-n' + (r.ready ? '' : ' zero') }, String(r.ready), r.ready && r.files ? h('small', null, ' ' + plural(r.files, 'file')) : null) },
            { key: 'waiting', label: 'Loaded, waiting', num: true, sortable: true, class: 'hide-sm', render: r => n(r.waiting) },
            { key: 'next', label: 'Next go live', class: 'hide-sm', render: r => r.next ? day(r.next) : r.passed ? statusDot('bad', plural(r.passed, 'card') + ' past its date') : 'No date set' },
            d.log_ok ? { key: 'loaded7', label: 'Loaded, 7 days', num: true, sortable: true, render: r => h('span', { class: 'al-n' + (r.loaded7 ? '' : ' zero') }, String(r.loaded7), r.loaded7 ? h('small', null, ` ${r.on7} on`) : null) } : null,
            d.log_ok ? { key: 'last', label: 'Last load', class: 'hide-md', render: r => r.last ? day(r.last.slice(0, 10)) : 'None this week' } : null,
          ].filter(Boolean),
        })),
      (d.ready_cards || []).length ? card({ title: 'Ready to load, every brand', note: 'soonest go live first', flush: true },
        h('div', { class: 'al-ready' }, d.ready_cards.map(c => h('div', null,
          picture({ src: c.thumb, art: c.art, video: c.format === 'Video' || c.format === 'UGC', ratio: '1/1' }),
          h('span', { class: 't' }, h('b', null, (c.num ? c.num + '  ' : '') + (c.title || 'Untitled card')),
            h('small', null, [c.brand, c.format, c.files ? plural(c.files, 'file') : null, c.launch_on ? 'goes live ' + day(c.launch_on) : null].filter(Boolean).join(', '))),
          canWrite(ctx) ? button('Load', { primary: true, large: true, aria: 'Load card ' + (c.num || c.title), onclick: () => openLoad(ctx, { act: c.act_id, card: c, onDone: () => { if (!SAMPLE) refresh({ fresh: true }); } }) })
            : (pageOf(ctx, c.act_id) ? button('See', { href: pageOf(ctx, c.act_id) }) : null))))) : null,
      d.dated.length ? card({ title: 'Going live next', note: 'cards with a go live date', flush: true },
        h('div', { class: 'al-next' }, d.dated.map(c => h('a', { href: pageOf(ctx, c.act_id) || '#' },
          h('span', { class: 'd' }, day(c.date, true)),
          h('span', { class: 't' }, h('b', null, (c.num ? c.num + '  ' : '') + (c.title || 'Untitled card')), h('small', null, [c.brand, c.format].filter(Boolean).join(', '))),
          c.loaded ? statusDot('good', 'Loaded') : statusDot('warn', 'Not loaded yet'))))) : null,
      null,
    ].filter(Boolean));
  },
};
