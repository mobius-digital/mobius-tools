/* The calendar, for one brand or for every brand. Read only: a month of dates, then what is coming up.
   Live data: GET /api/calendar?act=<brand id | all>&from=&to= (account-health). The same answer old Locus draws.
   That full answer is slow for every brand at once: for each brand the worker also reads its email sends, its new
   ads by day and its task ticks, to work out the "getting it ready" steps. So the page asks twice at the same
   moment: &lite=1 (the dates only, quick) paints the month and the list, and the full answer adds the steps and
   the scheduled emails when it lands (pages/_parts.js).
   Adding, moving and ticking dates stays in old Locus for now (ctx.legacy). */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, hero, kpis, kpi, statusDot, button, segmented, sheet, em, empty, svgNode } from '../../kit.js';
import { icon } from '../../icons.js';
import { fixture } from '../../data.js';
import { loadParts, follow, dots, reading } from '../_parts.js';
import { css, at, ymd, addDays, between, span, away, short, monthName, todayYmd, heading, row, list, monthGrid, statusLegend, dateOf, brandTag, colorOf } from './_cr.js';

const STATUS = { conf: ['good', 'Confirmed'], pen: ['warn', 'Pencilled in'], miss: ['bad', 'No offer written'] };
const CHANNEL = { paid: 'Ads', email: 'Email', sms: 'Text', organic: 'Social' };
const view = { month: null, mode: 'month', key: '' };     // survives a refresh behind

const monthOf = d => d.slice(0, 7);
const shiftMonth = (m, n) => ymd(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1, 12)).slice(0, 7);
const toneOf = (e, today) => (e.end || e.start) < today ? '' : (STATUS[e.status] || [''])[0];

function detail(e, d, ctx, agency) {
  const st = STATUS[e.status] || ['', ''];
  const steps = ctx.isClient ? [] : (e.steps || []);
  const body = h('div', { class: 'cr-sheet' },
    e.offer ? h('p', { class: 'offer' }, e.offer) : h('p', { class: 'cr-none', style: { border: 0, padding: 0 } }, 'No offer written yet.'),
    h('dl', { class: 'cr-kv' },
      agency ? [h('dt', null, 'Brand'), h('dd', null, e.brand || '')] : null,
      h('dt', null, 'When'), h('dd', null, span(e.start, e.end) + (e.end === null ? ', no end date' : ''), ' ', h('span', { style: { fontWeight: 400, color: 'var(--muted)' } }, '(' + away(d.today, e.start) + ')')),
      h('dt', null, 'What'), h('dd', null, e.kind_label || 'Date'),
      h('dt', null, 'Status'), h('dd', null, (e.end || e.start) < d.today ? 'Happened' : statusDot(st[0], st[1])),
      e.channels && e.channels.length ? [h('dt', null, 'Where'), h('dd', null, e.channels.map(c => CHANNEL[c] || c).join(', '))] : null,
      e.teaser ? [h('dt', null, 'Teaser starts'), h('dd', null, short(e.teaser))] : null,
      e.by && !ctx.isClient ? [h('dt', null, 'From'), h('dd', null, e.by)] : null),
    steps.length ? h('div', null, heading('Getting it ready', null, steps.filter(s => s.state === 'done').length + ' of ' + steps.length + ' done'),
      h('div', { class: 'cr-steps' }, steps.map(s => h('div', { class: 'cr-step' },
        h('b', null, s.label), statusDot(s.state === 'done' ? 'good' : s.state === 'late' ? 'bad' : 'off', s.state === 'done' ? 'Done' : s.state === 'late' ? 'Late, was due ' + short(s.due) : 'Due ' + short(s.due)),
        h('small', null, [s.who, s.note].filter(Boolean).join('. ')))))) : null,
    !ctx.isClient && ctx.legacy ? button('Change it in old ' + APP_NAME, { href: ctx.legacy, icon: 'arrow' }) : null);
  sheet({ title: e.name, body });
}

function draw(el, d, ctx, agency) {
  css();
  if (!d || !Array.isArray(d.items)) return put(el, empty({ title: 'The calendar did not answer', text: 'Nothing was read. Try again in a minute.' }));
  const today = d.today || todayYmd();
  const names = Object.fromEntries((d.brands || []).map(b => [b.id, b.name]));
  const items = d.items.map(e => ({ ...e, brand: names[e.act] || '', color: agency ? colorOf(ctx, e.act) : null }));
  const mails = agency ? [] : (d.emails || []).map((m, i) => ({ id: 'mail' + i, mail: true, name: m.name || (m.channel === 'sms' ? 'Text' : 'Email'), start: m.date, end: m.date, kind_label: m.channel === 'sms' ? 'Text send' : 'Email send' }));
  if (!items.length && !mails.length) {
    return put(el, empty({ title: 'Nothing on the calendar yet', text: agency ? 'No brand has a sale, a drop or an ad push dated in the next four months.' : 'No sale, drop or ad push is dated in the next four months.',
      action: !ctx.isClient && ctx.legacy ? button('Add a date in old ' + APP_NAME, { href: ctx.legacy }) : null }));
  }

  /* the month on screen: stays inside what was loaded */
  const key = (agency ? 'all' : ctx.brand && ctx.brand.id) + '|' + d.from;
  const lo = monthOf(d.from || addDays(today, -30)), hi = monthOf(d.to || addDays(today, 120));
  if (view.key !== key || !view.month) { view.key = key; view.month = monthOf(today); }
  if (view.month < lo) view.month = lo; if (view.month > hi) view.month = hi;

  const coming = items.filter(e => (e.end || e.start) >= today).sort((a, b) => a.start.localeCompare(b.start));
  const next = coming.find(e => e.start >= today) || coming[0];
  const soon = coming.filter(e => between(today, e.start) <= 60);
  const lateSteps = coming.reduce((n, e) => n + (e.steps || []).filter(s => s.state === 'late').length, 0);
  const open = coming.filter(e => e.status !== 'conf');

  const head = hero({ line: true }, kpis([
    kpi({ label: 'Next date', value: next ? (next.start <= today ? 'On now' : String(between(today, next.start))) : 'none', small: next && next.start > today ? (between(today, next.start) === 1 ? 'day' : 'days') : null, size: 'lg',
      sub: next ? (agency ? next.brand + ': ' : '') + next.name + ', ' + short(next.start) : 'nothing dated' }),
    kpi({ label: 'In the next 60 days', value: String(soon.length), size: 'lg', sub: soon.filter(e => e.status === 'conf').length + ' confirmed' }),
    kpi({ label: 'Not confirmed yet', value: String(open.length), size: 'lg', sub: open.length ? statusDot(open.some(e => e.status === 'miss') ? 'bad' : 'warn', open.filter(e => e.status === 'miss').length ? open.filter(e => e.status === 'miss').length + ' with no offer written' : 'pencilled in') : 'all confirmed' }),
    ctx.isClient ? null : kpi({ label: 'Steps running late', value: d.waiting ? dots() : d.no_steps ? 'not read' : String(lateSteps), size: 'lg', sub: d.waiting ? 'reading what is ready' : d.no_steps ? 'the steps did not load' : lateSteps ? statusDot('bad', 'open the date to see which') : 'everything on time' }),
  ].filter(Boolean), { cols: ctx.isClient ? 3 : 4 }));

  /* month grid */
  const gridBox = h('div', { class: 'cr-sect' });
  const paintMonth = () => {
    const evs = [...items.map(e => ({ ...e, name: (agency && e.brand ? e.brand + ': ' : '') + e.name, end: e.end || (e.kind === 'sale' ? addDays(e.start, 0) : e.start), tone: toneOf(e, today), _e: e })),
      ...mails.map(m => ({ ...m, tone: 'mail', _e: m }))];
    const nav = h('div', { class: 'cr-bar-top', style: { paddingBottom: '14px' } },
      h('div', { class: 'cr-nav' }, h('h2', null, monthName(view.month + '-01')),
        h('button', { class: 'lx-btn icon', type: 'button', 'aria-label': 'Month before', disabled: view.month <= lo, onclick: () => { view.month = shiftMonth(view.month, -1); paintMonth(); } }, h('span', { style: { display: 'grid', transform: 'rotate(90deg)' } }, svgNode(icon('chevron')))),
        h('button', { class: 'lx-btn icon', type: 'button', 'aria-label': 'Month after', disabled: view.month >= hi, onclick: () => { view.month = shiftMonth(view.month, 1); paintMonth(); } }, h('span', { style: { display: 'grid', transform: 'rotate(-90deg)' } }, svgNode(icon('chevron')))),
        view.month !== monthOf(today) ? button('Today', { ghost: true, onclick: () => { view.month = monthOf(today); paintMonth(); } }) : null),
      h('span', { class: 'sp' }),
      !ctx.isClient && ctx.legacy ? button('Add or move a date in old ' + APP_NAME, { href: ctx.legacy }) : null);
    put(gridBox, nav, monthGrid({ month: view.month, today, events: evs, onPick: e => e._e.mail ? null : detail(e._e, d, ctx, agency) }), statusLegend());
  };
  paintMonth();

  /* coming up */
  const rows = coming.slice(0, 40).map(e => {
    const st = STATUS[e.status] || ['', ''], steps = e.steps || [], late = steps.filter(s => s.state === 'late').length, ready = steps.filter(s => s.state === 'done').length;
    return row({
      lead: dateOf(e.start, today), title: e.name, sub: [e.kind_label, e.offer].filter(Boolean).join('. '),
      cells: [
        agency ? { w: 150, node: brandTag(e.brand, e.color) } : null,
        { w: 128, class: 'strong', node: span(e.start, e.end) + (e.end === null ? ' on' : '') },
        { w: 92, class: 'hide-sm', node: e.start <= today ? 'on now' : away(today, e.start) },
        ctx.isClient || !steps.length ? (ctx.isClient ? null : { w: 118, class: 'hide-md', node: '' }) : { w: 118, class: 'hide-md', node: late ? statusDot('bad', late + ' late') : ready + ' of ' + steps.length + ' ready' },
        { w: 132, node: statusDot(st[0], st[1]) },
      ],
      onclick: () => detail(e, d, ctx, agency),
    });
  });
  const up = mails.filter(m => m.start >= today).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 12);

  put(el, head, gridBox,
    h('section', { class: 'cr-sect' }, heading('Coming up', coming.length), list(rows, 'Nothing is coming up.')),
    up.length ? h('section', { class: 'cr-sect' }, heading('Emails and texts scheduled', up.length), list(up.map(m => row({ lead: dateOf(m.start, today), title: m.name, sub: m.kind_label, cells: [{ w: 128, class: 'strong', node: short(m.start) }, { w: 92, node: away(today, m.start) }] })))) : null,
    d.waiting ? reading(ctx.isClient ? 'Still reading the scheduled emails and texts.' : 'Still reading what is ready for each date' + (agency ? '.' : ', and the scheduled emails and texts.')) : null);
}

/** The two answers as one. The full one wins. While it is on its way, the fresh dates are drawn with the steps
    and emails from last time's full answer when there is one, and `waiting` says more is coming. */
function whole(d) {
  if (!d || !d.parts) return d;
  const full = d.parts.full, dates = d.parts.dates;
  if (full && !(d.late || []).includes('full')) return full;
  if (!dates) return full ? { ...full, waiting: (d.late || []).includes('full') } : null;
  if (full && (d.late || []).includes('dates')) return { ...full, waiting: true };          // last time's, until anything fresh lands
  const steps = new Map(((full && full.items) || []).map(e => [e.id, e.steps || []]));
  return { ...dates, items: dates.items.map(e => ({ ...e, steps: steps.get(e.id) || [] })), emails: (full && full.emails) || [],
    waiting: (d.late || []).includes('full'), no_steps: !full && !(d.late || []).includes('full') };
}

/** calendarPage({ agency }) : the page module for pages/calendar/index.js and pages/a-calendar/index.js */
export function calendarPage({ agency = false } = {}) {
  return {
    title: agency ? ['What is coming up ', em('across every brand?')] : ['What is ', em('coming up?')],
    eyebrow: 'Calendar',
    ranges: false,                 /* the calendar has its own months */
    async load(ctx) {
      const t = todayYmd();
      const from = ymd(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 2, 1, 12)), to = addDays(t, 150);
      const act = agency ? 'all' : encodeURIComponent(ctx.brand.id);
      const q = `/api/calendar?act=${act}&from=${from}&to=${to}`, opt = { worker: 'ah', signal: ctx.signal };
      /* keep what the page draws: the send plan, the social posts and each brand's team and channels are not shown here */
      const keep = d => ({ today: d.today, from: d.from, to: d.to, brands: (d.brands || []).map(b => ({ id: b.id, name: b.name })), items: d.items || [], emails: d.emails || [] });
      return loadParts(ctx, { dates: () => ctx.api(q + '&lite=1', opt).then(keep), full: () => ctx.api(q, opt).then(keep) });
    },
    /* one fixture for both views: the brand page keeps its own brand's rows */
    async sample(ctx) {
      const all = await fixture('a-calendar/_sample/index.json');
      if (agency) return all;
      const id = ctx.brand && ctx.brand.id;
      return { ...all, brands: all.brands.filter(b => b.id === id), items: all.items.filter(e => e.act === id), emails: (all.emails || []).filter(e => e.act === id) };
    },
    render: (el, d, ctx) => follow(ctx, d, now => draw(el, whole(now), ctx, agency)),
    skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:150px"></div><div class="lx-skel chart" style="height:520px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>'; },
  };
}
export { at };
