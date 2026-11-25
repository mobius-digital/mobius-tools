/* Creative > Production > Board. "Are the ads we need getting made on time?"
   One brand's cards from brief to live, five columns. A card opens as a sheet (_sheet.js).
   Read only in this batch: every change is made in old Locus.
   Data: GET /api/production?act=<brand id> on the account-health worker, saved as is.
   A client (or "See as client") gets the review page instead: what waits on them, Approve always in reach. */

import { APP_NAME } from '../../config.js';
import { h, hero, kpi, kpis, gauge, statusDot, empty, em, skeleton } from '../../kit.js';
import { put, css, COLS, OPEN, day, daysFrom, dueText, todayOf, weekOf, picture, who, oldLocus, plural } from './_ui.js';
import { openCard } from './_sheet.js';
import review from './review.js';
import { SAMPLE } from '../../data.js';

/** The board for one brand or 'all', with the team's photos beside it (names to picture addresses; none is fine). */
export async function loadBoard(ctx, act) {
  const [b, p] = await Promise.all([
    ctx.api('/api/production?act=' + encodeURIComponent(act), { worker: 'ah', signal: ctx.signal }),
    ctx.api('/api/production/photos', { worker: 'ah', signal: ctx.signal }).catch(() => null),
  ]);
  return { ...b, photos: (p && p.photos) || {} };
}

const FILTERS = [
  { id: 'all', label: 'All cards', test: () => true },
  { id: 'client', label: 'Waiting on client', test: c => !!c.needs_client },
  { id: 'nobody', label: 'Needs someone', test: c => !c.assignee && OPEN.includes(c.board) },
  { id: 'week', label: 'Due this week', test: (c, t, wk) => { const d = c.due || c.launch_on; return !!d && d >= wk[0] && d <= wk[1] && c.board !== 'live' && c.board !== 'off'; } },
  { id: 'late', label: 'Late', test: c => !!c.late },
];

function tile(c, data, ctx, today) {
  const photos = data.photos || {};
  const waited = c.needs_client && c.client_sent_at ? daysFrom(c.client_sent_at, today) : null;
  const mark = c.needs_client ? statusDot('warn', waited != null ? 'Client, ' + plural(waited, 'day') : 'Client')
    : c.late ? statusDot('bad', 'Late')
    : c.board === 'scheduled' ? statusDot('info', 'Scheduled')
    : c.board === 'off' ? statusDot('off', 'Ended') : null;
  const sub = c.board === 'review' && c.versions ? plural(c.versions, 'file') : dueText(c, today);
  return h('button', { type: 'button', class: 'pd-card', onclick: () => openCard(ctx, c, { photos, today }) },
    picture({ src: c.thumb, art: c.art, video: c.format === 'Video' || c.format === 'UGC' }),
    h('div', { class: 'pd-body' },
      h('div', { class: 'pd-meta' }, h('b', null, c.num), h('span', null, c.format || ''), mark),
      h('div', { class: 'pd-t' }, c.title || 'Untitled card'),
      h('div', { class: 'pd-foot' }, h('span', { class: c.late ? 'late' : '' }, sub),
        c.board === 'live' || c.board === 'off' ? null : who(c.assignee, photos))));
}

function board(cards, data, ctx, today) {
  return h('div', { class: 'pd-board' }, COLS.map(col => {
    const mine = cards.filter(c => col.has.includes(c.board))
      .sort((a, b) => (a.board === 'off') - (b.board === 'off') || String(a.due || a.launch_on || '9').localeCompare(String(b.due || b.launch_on || '9')) || (+b.num || 0) - (+a.num || 0));
    const more = col.id === 'live' && data.live && data.live.total > data.live.shown ? data.live.total - data.live.shown : 0;
    return h('section', { class: 'pd-col' },
      h('div', { class: 'pd-col-h' }, col.label, h('span', null, mine.length)),
      mine.length ? mine.map(c => tile(c, data, ctx, today)) : h('div', { class: 'pd-col-none' }, 'Nothing here'),
      more ? h('div', { class: 'pd-col-more' }, more + ' more live in Meta') : null);
  }));
}

function top(cards, today) {
  const n = f => cards.filter(f).length;
  const wk = weekOf(today);
  const due = cards.filter(c => { const d = c.due || c.launch_on; return d && d >= wk[0] && d <= wk[1] && c.board !== 'off'; });
  const done = due.filter(c => ['ready', 'scheduled', 'live'].includes(c.board)).length;
  const late = cards.filter(c => c.late);
  const worst = Math.max(0, ...late.map(c => daysFrom(c.due, today) || 0));
  const client = n(c => c.needs_client);
  return hero({ line: true },
    kpis([
      kpi({ label: 'Being made', value: String(n(c => c.board === 'brief' || c.board === 'making')), sub: plural(n(c => c.board === 'brief'), 'brief') + ' not started' }),
      kpi({ label: 'In review', value: String(n(c => c.board === 'review')), sub: client ? statusDot('warn', client + ' with the client') : 'none with the client' }),
      kpi({ label: 'Ready to load', value: String(n(c => c.board === 'ready' || c.board === 'scheduled')), sub: plural(n(c => c.board === 'scheduled'), 'card') + ' scheduled in Meta' }),
      kpi({ label: 'Late', value: String(late.length), sub: late.length ? statusDot('bad', 'oldest ' + plural(worst, 'day')) : statusDot('good', 'nothing overdue') }),
    ], { cols: 4 }),
    due.length ? h('div', { class: 'pb-week' },
      h('div', null, h('span', null, `Due this week, ${day(wk[0])} to ${day(wk[1])}`), h('b', null, `${done} of ${due.length} ready`)),
      gauge({ value: done, max: due.length, thin: true, tone: done === due.length ? 'good' : '' })) : null);
}

export default {
  title: (ctx, data) => (ctx.isClient ? review.title(ctx, data) : ['Are the ads we need ', em('getting made on time?')]),
  eyebrow: (ctx, data) => (ctx.isClient ? review.eyebrow(ctx, data) : 'Production'),
  ranges: false,                       // the board is where things stand now, not a span of days
  asOf: d => (!SAMPLE && d && d.synced_at) || null,   // a fixture reads as just fetched

  load: ctx => (ctx.isClient ? review.load(ctx) : loadBoard(ctx, ctx.brand.id)),
  sample: ctx => (ctx.isClient ? review.sample(ctx) : ctx.fixture('board.json')),
  skeleton(el) { put(el, skeleton('chart'), skeleton('row', 5)); },

  render(el, data, ctx) {
    if (ctx.isClient) return review.render(el, data, ctx);
    if (data && data.review) data = data.board || {};      // a copy saved while "See as client" was on
    css();
    const cards = (data && data.cards) || [];
    if (!cards.length) {
      put(el, empty({ title: 'No cards on this board yet', text: 'A card appears here when a brief is written for this brand.', action: oldLocus(ctx, { label: 'Write a brief in old ' + APP_NAME }) }));
      return;
    }
    const today = todayOf(data), wk = weekOf(today);
    let pick = ctx.settingNow('production.filter', 'all');
    if (!FILTERS.some(f => f.id === pick)) pick = 'all';
    const slot = h('div');
    const chips = h('div', { class: 'pd-chips', role: 'tablist' });
    const draw = () => {
      const f = FILTERS.find(x => x.id === pick);
      put(chips, ...FILTERS.map(x => {
        const count = x.id === 'all' ? null : cards.filter(c => x.test(c, today, wk)).length;
        return h('button', { type: 'button', role: 'tab', class: x.id === pick ? 'on' : '', 'aria-selected': x.id === pick,
          onclick: () => { pick = x.id; ctx.saveSetting('production.filter', pick); draw(); } }, x.label, count == null ? null : h('span', null, count));
      }));
      const shown = cards.filter(c => f.test(c, today, wk));
      put(slot, shown.length ? board(shown, data, ctx, today) : empty({ title: 'No cards match', text: 'Nothing is ' + f.label.toLowerCase() + ' right now.' }));
    };
    draw();
    put(el,
      top(cards, today),
      h('div', { class: 'pd-tools' }, chips, h('span', { class: 'lx-sp' }), oldLocus(ctx, { label: 'New card in old ' + APP_NAME })),
      slot,
      ctx.isClient ? null : h('p', { class: 'lx-foot' }, 'Read only here. Cards are moved, edited and sent to the client in old ' + APP_NAME + '. Live and Ended follow Meta.'));
  },
};
