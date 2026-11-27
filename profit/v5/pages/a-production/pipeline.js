/* Agency > Production > Pipeline. "Is every brand's work on time?"
   One row per brand: how many cards sit in each stage (a bar and the counts), what is late and what waits on the
   client, then the late cards and the client waits as lists. A row opens that brand's board; a card opens its sheet.
   A card opens its sheet, where the team moves, assigns and approves it (see production/_sheet.js). Data: GET /api/production?act=all on the account-health worker (see _ap.js). */

import { APP_NAME } from '../../config.js';
import { h, kpi, tiles, em, card, table, statusDot, empty, skeleton, sourceLine } from '../../kit.js';
import { SAMPLE } from '../../data.js';
import { refresh } from '../../router.js';
import { canWrite } from '../production/_act.js';
import { put, css, day, plural, dueText, pageTop, dotDef } from '../production/_ui.js';
import { defLabel } from '../../defs.js';
import { openCard } from '../production/_sheet.js';
import { apCss, loadAll, brandName, boardOf, lateBy, todayOf, weekOf, daysFrom } from './_ap.js';

const STAGES = [
  { id: 'brief', label: 'Brief', has: ['brief'] }, { id: 'making', label: 'Making', has: ['making'] },
  { id: 'review', label: 'Review', has: ['review'] }, { id: 'ready', label: 'Ready', has: ['ready', 'scheduled'] },
  { id: 'live', label: 'Live', has: ['live'] },
];

function rowsOf(cards, today) {
  const by = new Map();
  for (const c of cards) {
    if (c.board === 'off') continue;
    const r = by.get(c.act_id) || { act_id: c.act_id, brand: c.brand, brief: 0, making: 0, review: 0, ready: 0, live: 0, client: 0, late: 0, oldest: 0, next: null };
    const st = STAGES.find(s => s.has.includes(c.board)); if (st) r[st.id]++;
    if (c.needs_client) r.client++;
    if (c.late) { r.late++; r.oldest = Math.max(r.oldest, lateBy(c, today)); }
    const d = c.board === 'ready' || c.board === 'scheduled' ? c.launch_on : ['brief', 'making', 'review'].includes(c.board) ? c.due : '';
    if (d && d >= today && (!r.next || d < r.next.d)) r.next = { d, t: c.title, live: !!c.launch_on && (c.board === 'ready' || c.board === 'scheduled') };
    by.set(c.act_id, r);
  }
  return [...by.values()].map(r => ({ ...r, work: r.brief + r.making + r.review })).sort((a, b) => b.late - a.late || b.work - a.work);
}

const bar = r => {
  const total = STAGES.reduce((s, st) => s + r[st.id], 0) || 1;
  return h('div', { class: 'ap-bar', role: 'img', 'aria-label': STAGES.map(st => `${r[st.id]} ${st.label.toLowerCase()}`).join(', ') },
    STAGES.map(st => r[st.id] ? h('span', { class: 's-' + st.id, title: `${st.label}: ${plural(r[st.id], 'card')}`, style: { width: (r[st.id] / total * 100) + '%' } }) : null));
};
const n = v => h('span', { class: 'ap-n' + (v ? '' : ' zero') }, String(v));

function line(ctx, c, data, today, right) {
  return h('button', { type: 'button', class: 'pd-line', onclick: () => openCard(ctx, c, { photos: data.photos || {}, today, team: data.team || [], onChange: () => { if (!SAMPLE) refresh({ fresh: true }); } }) },
    h('span', { class: 'n' }, c.num),
    h('span', { class: 't' }, h('b', null, c.title || 'Untitled card'), h('small', null, brandName(ctx, c.act_id, c.brand), ', ' + (c.format || ''))),
    h('span', { class: 'w' }, c.assignee ? h('span', { title: c.assignee }, c.assignee.split(' ')[0]) : dotDef(statusDot('warn', 'Nobody'), 'Nobody', 'No one has this card yet. Open it and pick who has it.')),
    right);
}

export default {
  title: ['Is every brand\'s work ', em('on time?')],
  eyebrow: 'Production',
  ranges: false,
  asOf: d => (!SAMPLE && d && d.synced_at) || null,
  load: loadAll,
  sample: ctx => ctx.fixture('pipeline.json'),
  skeleton(el) { put(el, skeleton('kpi', 4), skeleton('row', 7)); },

  render(el, data, ctx) {
    css(); apCss();
    const cards = (data && data.cards) || [];
    if (!cards.length) { put(el, empty({ title: 'No cards on any board yet', text: 'A card appears here when a brief is written for a brand.' })); return; }
    const today = todayOf(data), wk = weekOf(today);
    const rows = rowsOf(cards, today);
    const late = cards.filter(c => c.late).sort((a, b) => lateBy(b, today) - lateBy(a, today));
    const client = cards.filter(c => c.needs_client).sort((a, b) => String(a.client_sent_at || a.due || '').localeCompare(String(b.client_sent_at || b.due || '')));
    const work = cards.filter(c => ['brief', 'making', 'review'].includes(c.board));
    const goingLive = cards.filter(c => (c.board === 'ready' || c.board === 'scheduled') && c.launch_on && c.launch_on >= wk[0] && c.launch_on <= wk[1]);
    const worst = late[0];
    ctx.askWindow = 'Now';
    ctx.askContext = `Production, every brand: ${work.length} cards in work (brief, making, review) across ${plural(rows.filter(r => r.work).length, 'brand')}, ${late.length} late, ${client.length} waiting on clients, ${goingLive.length} going live this week.` + (worst ? ` Most late: ${worst.title || 'a card'}, ${plural(lateBy(worst, today), 'day')}.` : '');
    put(el,
      pageTop([
        { title: 'What it is for', text: 'Every brand\'s ad cards in one place: how many sit in each stage, what is late and what waits on the client. Most late first.' },
        { title: 'What you can do here', text: (canWrite(ctx) ? 'A brand opens its board; a card opens its sheet, where you can move it, assign it and approve it.' : 'A brand opens its board; a card opens its sheet.') + ' Tap a column header to sort.' },
        { title: 'The words', text: 'In work: Brief, Making and Review together. Late: past its date and not approved yet. The bar shows where a brand\'s cards are; hover a part for its count.' },
      ]),
      tiles([
          kpi({ label: 'In work', value: String(work.length), sub: 'Brief, making, review · ' + plural(rows.filter(r => r.work).length, 'brand'), window: 'Now', source: 'Production boards' }),
          kpi({ label: 'Late', value: String(late.length), sub: late.length ? statusDot('bad', 'Oldest ' + plural(lateBy(worst, today), 'day')) : statusDot('good', 'Nothing overdue'), window: 'Now', source: 'Production boards' }),
          kpi({ label: 'Waiting on clients', value: String(client.length), sub: client.length ? statusDot('warn', plural(new Set(client.map(c => c.act_id)).size, 'brand')) : 'None', window: 'Now', source: 'Production boards' }),
          kpi({ label: 'Going live this week', value: String(goingLive.length), sub: 'Loaded with a start date', window: `${day(wk[0])} to ${day(wk[1])}`, source: 'Production boards' }),
        ], { cols: 4 }),
      card({ title: 'Every brand', note: sourceLine('Now', 'most late first, tap a brand for its board'), flush: true,
        action: h('div', { class: 'ap-key' }, STAGES.map(st => h('span', null, h('i', { class: 's-' + st.id }), st.label))) },
        table({
          rows, roomy: true,
          onRow: r => { const to = boardOf(ctx, r.act_id); if (to) location.hash = to; },
          cols: [
            { key: 'brand', label: 'Brand', sortable: true, render: r => brandName(ctx, r.act_id, r.brand) },
            { key: 'bar', label: 'Where the cards are', class: 'hide-sm', width: '24%', render: bar },
            { key: 'brief', label: 'Brief', num: true, sortable: true, class: 'hide-md', render: r => n(r.brief) },
            { key: 'making', label: 'Making', num: true, sortable: true, class: 'hide-md', render: r => n(r.making) },
            { key: 'review', label: 'Review', num: true, sortable: true, class: 'hide-sm', render: r => h('span', null, n(r.review), r.client ? h('small', { class: 'ap-old' }, ', ' + r.client + ' with client') : null) },
            { key: 'ready', label: 'Ready', num: true, sortable: true, class: 'hide-md', render: r => n(r.ready) },
            { key: 'work', label: 'In work', num: true, sortable: true, render: r => n(r.work) },
            { key: 'late', label: 'Late', num: true, sortable: true, render: r => r.late ? h('span', null, h('span', { class: 'ap-late' }, r.late + ' late'), r.oldest ? h('small', { class: 'ap-old' }, ', oldest ' + plural(r.oldest, 'day')) : null) : n(0) },
            { key: 'next', label: 'Next date', sortable: true, value: r => (r.next ? r.next.d : null), class: 'hide-sm', render: r => r.next ? (r.next.live ? 'Live ' : 'Due ') + day(r.next.d) : 'none' },
          ],
        })),
      late.length ? card({ title: 'Late', note: plural(late.length, 'card') + ', most late first', flush: true },
        h('div', { class: 'pd-list ap-list' }, late.map(c => line(ctx, c, data, today, h('span', { class: 'd late' }, plural(lateBy(c, today), 'day') + ' late'))))) : null,
      client.length ? card({ title: 'Waiting on clients', note: plural(client.length, 'card'), flush: true },
        h('div', { class: 'pd-list ap-list' }, client.map(c => {
          const waited = c.client_sent_at ? daysFrom(c.client_sent_at, today) : null;
          return line(ctx, c, data, today, h('span', { class: 'd' }, waited != null ? (waited <= 0 ? 'sent today' : 'sent ' + plural(waited, 'day') + ' ago') : dueText(c, today)));
        }))) : null);
  },
};
