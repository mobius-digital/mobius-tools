/* Meetings > Agenda: the Monday team meeting, 45 minutes, the same eight blocks every week.
   The pre-read goes out Monday 6am (Sunday's numbers are not final before then). */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, hero, em, button, gauge, avatar, statusDot } from '../../kit.js';
import { css, loadMeeting, meetingOf, SENT_LABEL, MEETING_START, longDay, lightOf, ok, x } from './_meet.js';
import { follow, reading } from '../_parts.js';

/** The plan. Minutes are fixed; only the small line under each block comes from data. */
const BLOCKS = [
  { id: 'scoreboard', name: 'Scoreboard', min: 3 },
  { id: 'promises', name: 'Promises', min: 5 },
  { id: 'green', name: 'Green brands', min: 3 },
  { id: 'decision', name: 'Decision brands', min: 21, lead: true },
  { id: 'pipeline', name: 'Pipeline', min: 5 },
  { id: 'learned', name: 'Learned', min: 4 },
  { id: 'agency', name: 'Agency', min: 2 },
  { id: 'close', name: 'Close', min: 2 },
];
const clock = (start, plus) => { const [hh, mm] = start.split(':').map(Number); const t = hh * 60 + mm + plus; return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const TOTAL = BLOCKS.reduce((n, k) => n + k.min, 0);
const step = (n, text, small) => h('div', { class: 'mt-step' }, h('span', { class: 'n' }, n), h('span', null, h('b', null, text), small && h('small', null, small)));

function draw(el, data, ctx) {
  css();
  const a = (data && data.agenda) || {}, counts = a.counts || {};
  const total = TOTAL;
  /* when the meeting starts is an agency setting; the constant is only the fallback */
  const START = ctx.settingNow('agency.meetingStart', MEETING_START);
  /* decision brands: furthest under goal first, three at most */
  const under = ((data && data.brands) || []).filter(b => { const l = lightOf(b.mer, b.goal_mer); return l && l.tone !== 'good'; })
    .sort((p, q) => p.mer / p.goal_mer - q.mer / q.goal_mer).slice(0, 3);

  let at = 0;
  const line = h('div', { class: 'mt-line', role: 'img', 'aria-label': `Timeline of the ${total} minute meeting: ` + BLOCKS.map(k => `${k.name} ${k.min}`).join(', ') },
    BLOCKS.map((k, i) => {
      const t = clock(START, at); at += k.min;
      const sub = k.id === 'decision' ? (under.length ? `${under.length} ${under.length === 1 ? 'brand' : 'brands'}, ${Math.floor(k.min / under.length)} min each` : 'no brand under goal') : counts[k.id];
      return h('div', { class: 'mt-seg' + (k.lead ? ' lead' : i % 2 ? ' alt' : ''), style: { flexGrow: String(k.min), '--min': String(k.min) } },
        h('i'), h('span', { class: 'at' }, t), h('span', { class: 'm' }, k.min, h('small', null, 'min')), h('b', null, k.name), sub && h('span', { class: 'in' }, sub));
    }));

  const head = hero({
    sub: `${data && data.monday ? longDay(data.monday) + ', ' : ''}${START}am to ${clock(START, total)}am. Same eight blocks every week.`,
    action: h('span', { class: 'mt-hero-act' }, statusDot('good', 'Sends Mon 6:00am'), button('Preview the pre-read', { primary: true, large: true, href: ctx.href('a-meetings', 'pre-read') })) }, line);
  head.classList.add('line', 'mt-hero');

  const read = a.read;
  const cols = h('section', { class: 'mt-cols' },
    h('div', { class: 'mt-col' },
      h('div', null, h('span', { class: 'lx-eyebrow' }, 'Monday 6:00am'), h('h2', null, 'Before')),
      step(1, APP_NAME + ' sends every brand pre-read', "last week's final numbers, Mon to Sun"),
      step(2, 'Everyone reads their brands'),
      step(3, 'Each owner writes their one decision'),
      read && h('div', { class: 'mt-ex' },
        h('span', { class: 'mt-faces' }, (read.people || []).map(p => p.read ? avatar(p, { size: 30 }) : h('span', { class: 'no', role: 'img', 'aria-label': p.name + ' has not read' }))),
        h('span', null, h('b', null, `${read.done} of ${read.of} have read`), h('small', null, read.nudge)))),
    h('div', { class: 'mt-col' },
      h('div', null, h('span', { class: 'lx-eyebrow' }, `Monday ${START}am`), h('h2', null, 'During')),
      step(1, 'The owner speaks first'),
      step(2, (a.closer || 'The agency lead') + ' speaks last'),
      step(3, 'Every decision gets a number and an owner'),
      a.example_decision && h('div', { class: 'mt-ex' }, avatar({ name: a.example_decision.owner }, { size: 30 }), h('span', null, h('b', null, a.example_decision.text), h('small', null, a.example_decision.note)))),
    h('div', { class: 'mt-col' },
      h('div', null, h('span', { class: 'lx-eyebrow' }, `Monday ${clock(START, total)}am`), h('h2', null, 'After')),
      step(1, APP_NAME + ' posts the decisions and tasks', 'one post, no notes to write up'),
      step(2, "They show in each person's My day"),
      a.example_myday && h('div', { class: 'mt-ex' }, avatar({ name: a.example_myday.owner }, { size: 30 }), h('span', null, h('b', null, a.example_myday.text), h('small', null, a.example_myday.note)))));

  const any = ((data && data.brands) || []).some(b => ok(b.mer) && ok(b.goal_mer));
  const db = h('section', { class: 'mt-open', style: { gap: '20px' } },
    h('div', { class: 'mt-h' }, h('h3', null, "This Monday's decision brands"), h('span', null, 'MER, whole store, last week. Furthest under goal first.')),
    under.length ? h('div', { class: 'mt-db' }, under.map(b => h('a', { href: ctx.href('a-meetings', 'pre-read'), onclick: () => { try { sessionStorage.setItem('lx5.preread.brand', b.id); } catch {} } },
      h('span', { class: 'nm' }, b.name),
      h('span', { class: 'n' }, x(b.mer), h('small', null, 'goal ' + x(b.goal_mer))),
      gauge({ value: b.mer, max: b.goal_mer * 1.2, goal: b.goal_mer, tone: lightOf(b.mer, b.goal_mer).tone, thin: true }),
      b.owner && h('span', { class: 'ow' }, b.owner + ' speaks first'))))
      : h('p', { class: 'mt-none' }, any ? 'Every brand with a goal is on goal.' : 'No brand has both a sales source and a MER goal yet.'));

  const more = data && data.waiting && (data.waiting.screen || data.waiting.goals);
  put(el, h('div', { class: 'mt-page', style: { gap: '52px' } }, head, cols, db,
    more ? reading(data.waiting.screen ? 'Still reading the promises and the pipeline.' : 'Still reading each brand\'s MER goal.') : null,
    h('p', { class: 'lx-foot' }, (data && data.note) || SENT_LABEL + '.')));
}

/* each part of the meeting is painted as it lands */
const paint = (el, d, ctx) => follow(ctx, d, now => draw(el, meetingOf(now, ctx), ctx));

export default {
  /* drawn by the shell above the tabs. The meeting is one fixed week, so there are no dates to pick. */
  title: () => ['Monday agenda, ', em(TOTAL + ' minutes')],
  eyebrow: 'Meetings, team',
  ranges: false,
  asOf: d => (d && d.parts ? (d.parts.cmd && d.parts.cmd.as_of) || d.at : d && d.as_of) || null,
  load: loadMeeting,
  render: paint,
  update: paint,
};
