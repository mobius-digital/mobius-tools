/* Creative > Production > Board. "Are the ads we need getting made on time?"
   One brand's cards from brief to live, five columns. A card opens as a sheet (_sheet.js).
   The card sheet moves, assigns, approves, takes notes, sends to the client and loads into Meta (see _sheet.js).
   After a change the board redraws at once and reads itself again (real mode).
   Data: GET /api/production?act=<brand id> on the account-health worker, saved as is.
   A client (or "See as client") gets the review page instead: what waits on them, Approve always in reach. */

import { APP_NAME } from '../../config.js';
import { h, kpi, tiles, gauge, statusDot, empty, em, skeleton, segmented, card } from '../../kit.js';
import { put, css, COLS, OPEN, day, daysFrom, dueText, todayOf, weekOf, picture, who, oldLocus, plural, pageTop, dotDef, teamTag } from './_ui.js';
import { openCard } from './_sheet.js';
import review from './review.js';
import { SAMPLE } from '../../data.js';
import { refresh } from '../../router.js';
import { canWrite } from './_act.js';

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

function tile(c, data, ctx, today, changed) {
  const photos = data.photos || {};
  const waited = c.needs_client && c.client_sent_at ? daysFrom(c.client_sent_at, today) : null;
  const mark = c.needs_client ? dotDef(statusDot('warn', waited != null ? 'Client, ' + plural(waited, 'day') : 'Client'), 'Waiting on the client', 'Sent to the client for a yes or changes' + (waited != null ? ', ' + plural(waited, 'day') + ' ago' : '') + '.')
    : c.late ? dotDef(statusDot('bad', 'Late'), 'Late', 'Past its due date and not approved yet.')
    : c.board === 'scheduled' ? dotDef(statusDot('info', 'Scheduled'), 'Scheduled', 'Loaded into Meta and set to start on its date.')
    : c.board === 'off' ? dotDef(statusDot('off', 'Ended'), 'Ended', 'Its ads ran and are off in Meta now.') : null;
  const sub = c.board === 'review' && c.versions ? plural(c.versions, 'file') : dueText(c, today);
  return h('button', { type: 'button', class: 'pd-card', onclick: () => openCard(ctx, c, { photos, today, team: data.team || [], onChange: changed }) },
    picture({ src: c.thumb, art: c.art, video: c.format === 'Video' || c.format === 'UGC' }),
    h('div', { class: 'pd-body' },
      h('div', { class: 'pd-meta' }, h('b', null, c.num), h('span', null, c.format || ''), mark),
      h('div', { class: 'pd-t' }, c.title || 'Untitled card'),
      h('div', { class: 'pd-foot' }, h('span', { class: c.late ? 'late' : '' }, sub),
        c.board === 'live' || c.board === 'off' ? null : who(c.assignee, photos))));
}

function board(cards, data, ctx, today, changed) {
  return h('div', { class: 'pd-board' }, COLS.map(col => {
    const mine = cards.filter(c => col.has.includes(c.board))
      .sort((a, b) => (a.board === 'off') - (b.board === 'off') || String(a.due || a.launch_on || '9').localeCompare(String(b.due || b.launch_on || '9')) || (+b.num || 0) - (+a.num || 0));
    const more = col.id === 'live' && data.live && data.live.total > data.live.shown ? data.live.total - data.live.shown : 0;
    return h('section', { class: 'pd-col' },
      h('div', { class: 'pd-col-h' }, col.label, h('span', { title: more ? `${mine.length} shown here, ${mine.length + more} in all` : null }, more ? `${mine.length} of ${mine.length + more}` : mine.length)),
      mine.length ? mine.map(c => tile(c, data, ctx, today, changed)) : h('div', { class: 'pd-col-none' }, 'Nothing here'),
      more ? h('div', { class: 'pd-col-more' }, more + ' more live in Meta') : null);
  }));
}

function top(cards, today, pickFilter) {
  const n = f => cards.filter(f).length;
  const wk = weekOf(today);
  const due = cards.filter(c => { const d = c.due || c.launch_on; return d && d >= wk[0] && d <= wk[1] && c.board !== 'off'; });
  const done = due.filter(c => ['ready', 'scheduled', 'live'].includes(c.board)).length;
  const late = cards.filter(c => c.late);
  const worst = Math.max(0, ...late.map(c => daysFrom(c.due, today) || 0));
  const client = n(c => c.needs_client);
  /* a tile that has a matching filter chip sets it on click */
  const tap = (node, id, words) => { if (!id) return node; node.classList.add('pd-kpi-go'); node.tabIndex = 0; node.setAttribute('role', 'button'); node.title = 'Show ' + words;
    node.addEventListener('click', () => pickFilter(id)); node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFilter(id); } }); return node; };
  const SRC = 'Production board';
  return [tiles([
      kpi({ label: 'Being made', value: String(n(c => c.board === 'brief' || c.board === 'making')), sub: plural(n(c => c.board === 'brief'), 'brief') + ' not started', window: 'Now', source: SRC }),
      tap(kpi({ label: 'In review', value: String(n(c => c.board === 'review')), sub: client ? statusDot('warn', client + ' with the client') : 'None with the client', window: 'Now', source: SRC }), client ? 'client' : null, 'the cards waiting on the client'),
      kpi({ label: 'Ready to load', value: String(n(c => c.board === 'ready' || c.board === 'scheduled')), sub: plural(n(c => c.board === 'scheduled'), 'card') + ' scheduled in Meta', window: 'Now', source: SRC }),
      tap(kpi({ label: 'Late', value: String(late.length), sub: late.length ? statusDot('bad', 'Oldest ' + plural(worst, 'day')) : statusDot('good', 'Nothing overdue'), window: 'Now', source: SRC }), 'late', 'the late cards'),
    ], { cols: 4 }),
    due.length ? card({ class: 'pb-weekc' }, h('div', { class: 'pb-week' },
      h('div', null, h('span', null, `Due this week, ${day(wk[0])} to ${day(wk[1])}`), h('b', null, `${done} of ${due.length} ready`)),
      gauge({ value: done, max: due.length, thin: true, tone: done === due.length ? 'good' : '' }))) : null];
}

const page = {
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
    const chips = h('div', { class: 'pd-filt' });
    const draw = () => {
      const f = FILTERS.find(x => x.id === pick);
      put(chips, segmented(FILTERS.map(x => { const count = x.id === 'all' ? null : cards.filter(c => x.test(c, today, wk)).length; return { id: x.id, label: count == null ? x.label : x.label + ' ' + count }; }),
        pick, id => { pick = id; ctx.saveSetting('production.filter', pick); draw(); }));
      const shown = cards.filter(c => f.test(c, today, wk));
      put(slot, shown.length ? board(shown, data, ctx, today, changed) : empty({ title: 'No cards match', text: 'Nothing is ' + f.label.toLowerCase() + ' right now.' }));
    };
    /* a write landed in the sheet: draw the card where it now is, then read the board again (real mode) */
    const changed = () => { page.render(el, data, ctx); if (!SAMPLE) refresh({ fresh: true }); };
    draw();
    const pickFilter = id => { pick = id; ctx.saveSetting('production.filter', pick); draw(); chips.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    const old = oldLocus(ctx, { label: 'New card in old ' + APP_NAME });
    ctx.askWindow = 'Now';
    ctx.askContext = `Production board for ${(ctx.brand && ctx.brand.name) || 'this brand'}: ${plural(cards.length, 'ad card')}, ${cards.filter(c => OPEN.includes(c.board)).length} not approved yet, ${cards.filter(c => c.late).length} late, ${cards.filter(c => c.needs_client).length} waiting on the client, ${cards.filter(c => c.board === 'live').length} live.`;
    put(el,
      pageTop([
        { title: 'What it is for', text: 'Every ad card for this brand, from brief to live, in five columns. Tap a card to see it large with its brief, files and notes.' },
        { title: 'What you can do here', text: canWrite(ctx) ? 'Open a card to move it, give it to someone, approve it, add a note, send it to the client or load it into Meta. New cards and uploads are still made in old ' + APP_NAME + '. Scheduled, Live and Off follow Meta by themselves.' : 'You can look here. Changes are made by the team.' },
        { title: 'The marks', text: 'Late: past its date and not approved. Client: waiting on the client for a yes. Scheduled: loaded into Meta with a start date. Ended: its ads are off. Nobody: no one has the card yet. Hover or tap any mark for its meaning.' },
      ], old ? teamTag() : null, old),
      ...top(cards, today, pickFilter),
      h('div', { class: 'pd-tools' }, h('div', { class: 'pd-th' }, h('h2', null, 'The board'), h('p', null, 'Brief to live, now · tap a card to open it')), chips),
      slot);
  },
};
export default page;
