/* The calendar, for one brand or for every brand. Read only: a month of dates, then what is coming up.
   Live data: GET /api/calendar?act=<brand id | all>&from=&to= (account-health). The same answer old Locus draws.
   That full answer is slow for every brand at once: for each brand the worker also reads its email sends, its new
   ads by day and its task ticks, to work out the "getting it ready" steps. So the page asks twice at the same
   moment: &lite=1 (the dates only, quick) paints the month and the list, and the full answer adds the steps and
   the scheduled emails when it lands (pages/_parts.js).
   Adding, moving and ticking dates stays in old Locus for now (ctx.legacy). */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, tiles, kpi, statusDot, pill, button, sheet, em, empty, svgNode } from '../../kit.js';
import { pageHelp } from '../../defs.js';
import { icon } from '../../icons.js';
import { fixture } from '../../data.js';
import { loadParts, follow, dots, reading } from '../_parts.js';
import { css, at, ymd, addDays, between, span, away, short, monthName, todayYmd, heading, row, list, box, sortRows, flipSort, monthGrid, statusLegend, dateOf, brandTag, colorOf, selectBox, filterNote } from './_cr.js';

const STATUS = { conf: ['good', 'Confirmed'], pen: ['warn', 'Pencilled in'], miss: ['bad', 'No offer written'] };
const CHANNEL = { paid: 'Ads', email: 'Email', sms: 'Text', organic: 'Social' };
const view = { month: null, mode: 'month', key: '', late: false, brand: '', sort: { key: 'start', dir: 'asc' } };     // survives a refresh behind

const monthOf = d => d.slice(0, 7);
const shiftMonth = (m, n) => ymd(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1, 12)).slice(0, 7);
const toneOf = (e, today) => (e.end || e.start) < today ? '' : (STATUS[e.status] || [''])[0];

function detail(e, d, ctx, agency) {
  const st = STATUS[e.status] || ['', ''];
  const steps = ctx.isClient ? [] : (e.steps || []);
  const past = (e.end || e.start) < d.today, done = steps.filter(s => s.state === 'done').length;
  const body = h('div', { class: 'cr-sheet' },
    /* the head: the state as one pill and the dates */
    h('div', { class: 'cr-shead' }, past ? pill('', 'Happened') : pill(st[0], st[1]),
      h('span', { class: 'when' }, span(e.start, e.end) + (e.end === null ? ', no end date' : '')), h('span', { class: 'away' }, away(d.today, e.start))),
    e.offer ? h('p', { class: 'offer' }, e.offer) : h('p', { class: 'cr-none', style: { border: 0, padding: 0 } }, 'No offer written yet.'),
    h('dl', { class: 'cr-kv' },
      agency ? [h('dt', null, 'Brand'), h('dd', null, e.brand || '')] : null,
      h('dt', null, 'What'), h('dd', null, e.kind_label || 'Date'),
      e.channels && e.channels.length ? [h('dt', null, 'Where'), h('dd', null, e.channels.map(c => CHANNEL[c] || c).join(', '))] : null,
      e.teaser ? [h('dt', null, 'Teaser starts'), h('dd', null, short(e.teaser))] : null,
      e.by && !ctx.isClient ? [h('dt', null, 'From'), h('dd', null, e.by)] : null),
    steps.length ? h('div', null, heading('Getting it ready'),
      h('div', { class: 'cr-prog', role: 'img', 'aria-label': done + ' of ' + steps.length + ' steps done' },
        h('span', { class: 'bar' }, h('i', { style: { width: Math.round(100 * done / steps.length) + '%' } })), h('small', null, done + ' of ' + steps.length + ' done')),
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

  const lateRows = coming.filter(e => (e.steps || []).some(s => s.state === 'late'));
  const running = next && next.start <= today;
  const head = tiles([
    kpi({ label: 'Next or running now', value: next ? (running ? 'Running now' : String(between(today, next.start))) : 'none', small: next && !running ? (between(today, next.start) === 1 ? 'day away' : 'days away') : null, size: next && !running ? 'lg' : null,
      sub: next ? (agency ? next.brand + ': ' : '') + next.name + ', ' + span(next.start, next.end) : 'nothing dated' }),
    kpi({ label: 'In the next 60 days', value: String(soon.length), sub: soon.filter(e => e.status === 'conf').length + ' confirmed' }),
    kpi({ label: 'Not confirmed yet', value: String(open.length), sub: open.length ? statusDot(open.some(e => e.status === 'miss') ? 'bad' : 'warn', open.filter(e => e.status === 'miss').length ? open.filter(e => e.status === 'miss').length + ' with no offer written' : 'pencilled in') : 'all confirmed' }),
    ctx.isClient ? null : kpi({ label: 'Steps running late', value: d.waiting ? dots() : d.no_steps ? 'not read' : String(lateSteps), sub: d.waiting ? 'reading what is ready' : d.no_steps ? 'the steps did not load' : lateSteps ? statusDot('bad', (view.late ? 'showing ' : 'show ') + lateRows.length + (lateRows.length === 1 ? ' date' : ' dates') + ' with late steps') : 'everything on time' }),
  ].filter(Boolean), { cols: ctx.isClient ? 3 : 4 });
  const k0 = head.querySelector('.lx-kpi .v'); if (k0 && running) k0.classList.add('words');
  /* "Steps running late" filters Coming up to those dates */
  const lateTile = !ctx.isClient && lateSteps && !d.waiting ? head.querySelectorAll('.lx-kpi')[3] : null;
  if (lateTile) {
    const flip = () => { view.late = !view.late; draw(el, d, ctx, agency); };
    lateTile.classList.add('cr-tile-click'); if (view.late) lateTile.classList.add('on');
    Object.assign(lateTile, { tabIndex: 0, title: view.late ? 'Show every date again' : 'Show only the dates with late steps' });
    lateTile.setAttribute('role', 'button');
    lateTile.addEventListener('click', flip);
    lateTile.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); flip(); } });
  }

  /* month grid, in its card: the month name and arrows sit where the card title goes */
  const gridBox = h('div', { class: 'cr-sect' });
  const paintMonth = () => {
    const evs = [...items.map(e => ({ ...e, name: (agency && e.brand ? e.brand + ': ' : '') + e.name, end: e.end || (e.kind === 'sale' ? addDays(e.start, 0) : e.start), tone: toneOf(e, today), _e: e })),
      ...mails.map(m => ({ ...m, tone: 'mail', _e: m }))];
    const nav = h('div', { class: 'cr-nav' }, h('h2', null, monthName(view.month + '-01')),
      h('button', { class: 'lx-btn icon', type: 'button', 'aria-label': 'Month before', disabled: view.month <= lo, onclick: () => { view.month = shiftMonth(view.month, -1); paintMonth(); } }, h('span', { style: { display: 'grid', transform: 'rotate(90deg)' } }, svgNode(icon('chevron')))),
      h('button', { class: 'lx-btn icon', type: 'button', 'aria-label': 'Month after', disabled: view.month >= hi, onclick: () => { view.month = shiftMonth(view.month, 1); paintMonth(); } }, h('span', { style: { display: 'grid', transform: 'rotate(-90deg)' } }, svgNode(icon('chevron')))),
      view.month !== monthOf(today) ? button('Today', { ghost: true, onclick: () => { view.month = monthOf(today); paintMonth(); } }) : null);
    const card = box({ class: 'cr-monthbox', action: !ctx.isClient && ctx.legacy ? button('Add or move a date in old ' + APP_NAME, { ghost: true, href: ctx.legacy, icon: 'arrow' }) : h('span') },
      monthGrid({ month: view.month, today, events: evs, onPick: e => e._e.mail ? null : detail(e._e, d, ctx, agency) }), statusLegend({ brand: agency }));
    card.querySelector('.cr-box-h').prepend(nav);
    put(gridBox, card);
  };
  paintMonth();

  /* coming up: sortable by name, date, brand, readiness and status */
  const shownAll = view.late && lateRows.length ? lateRows : coming;
  /* every brand: one brand at a time from the select above the list (the Requests agency page has the same) */
  const brandsIn = agency ? [...new Map(coming.map(e => [e.act, e.brand || e.act])).entries()].sort((p, q) => String(p[1]).localeCompare(String(q[1]))) : [];
  if (view.brand && !brandsIn.some(([id]) => id === view.brand)) view.brand = '';
  const shown0 = view.brand ? shownAll.filter(e => e.act === view.brand) : shownAll;
  const readyOf = e => { const st = e.steps || []; return st.length ? st.filter(s => s.state === 'done').length / st.length - st.filter(s => s.state === 'late').length : null; };
  const RANK = { miss: 0, pen: 1, conf: 2 };
  const valOf = (e, k) => k === 'start' ? e.start : k === 'brand' ? e.brand : k === 'ready' ? readyOf(e) : k === 'status' ? RANK[e.status] : k === 'name' ? e.name : null;
  const listBox = h('div');
  const paintList = () => {
    const rows = sortRows(shown0, view.sort, valOf).slice(0, 40).map(e => {
      const st = STATUS[e.status] || ['', ''], steps = e.steps || [], late = steps.filter(s => s.state === 'late').length, ready = steps.filter(s => s.state === 'done').length;
      return row({
        lead: dateOf(e.start, today), title: e.name, sub: [e.kind_label, e.offer].filter(Boolean).join('. '),
        cells: [
          agency ? { w: 150, label: 'Brand', node: brandTag(e.brand, e.color) } : null,
          { w: 128, class: 'strong', label: 'Dates', node: span(e.start, e.end) + (e.end === null ? ' on' : '') },
          { w: 92, class: agency ? 'hide-lg hide-sm' : 'hide-sm', label: 'Starts', node: e.start <= today ? 'on now' : away(today, e.start) },
          ctx.isClient ? null : { w: 118, class: 'hide-tab', label: 'Getting ready', node: !steps.length ? (d.waiting ? dots() : 'no steps') : late ? statusDot('bad', late + ' late') : ready + ' of ' + steps.length + ' ready' },
          { w: 132, label: 'Status', node: statusDot(st[0], st[1]) },
        ],
        onclick: () => detail(e, d, ctx, agency),
      });
    });
    const listHead = [agency ? { label: 'Brand', w: 150, sort: 'brand' } : null, { label: 'Dates', w: 128 }, { label: 'Starts', w: 92, class: agency ? 'hide-lg hide-sm' : 'hide-sm' }, ctx.isClient ? null : { label: 'Getting ready', w: 118, class: 'hide-tab', sort: 'ready' }, { label: 'Status', w: 132, sort: 'status' }];
    put(listBox, list(rows, 'Nothing is coming up.', { head: listHead, first: 'Date', firstSort: 'start', sort: view.sort, onSort: k => { view.sort = flipSort(view.sort, k); paintList(); } }));
  };
  paintList();
  /* the list tools: the brand select (every brand) and, on a phone where the column heads are hidden, a sort select */
  const sorts = [{ id: 'start', label: 'Sort by date' }, agency ? { id: 'brand', label: 'Sort by brand' } : null, ctx.isClient ? null : { id: 'ready', label: 'Sort by getting ready' }, { id: 'status', label: 'Sort by status' }].filter(Boolean);
  const tools = h('div', { class: 'cr-tools' },
    agency && brandsIn.length > 1 ? selectBox('Brand', [{ id: '', label: 'All brands' }, ...brandsIn.map(([id, name]) => ({ id, label: name }))], view.brand, v => { view.brand = v; draw(el, d, ctx, agency); }) : null,
    h('span', { class: 'cr-phonesort' }, selectBox('Sort the list', sorts, view.sort && view.sort.key || 'start', v => { view.sort = { key: v, dir: 'asc' }; paintList(); })),
    filterNote(shown0.length, shownAll.length, !!view.brand, () => { view.brand = ''; draw(el, d, ctx, agency); }));
  const up = mails.filter(m => m.start >= today).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 12);

  const help = h('div', { class: 'cr-bar-top' }, pageHelp({ body: [
    { title: 'What it is for', text: agency ? 'Every sale, drop and ad push dated for every brand, as a month and as a list of what is coming up.' : 'Every sale, drop and ad push dated for this brand, as a month and as a list of what is coming up.' },
    { title: 'Reading the month', text: 'Each bar is one date. Its left edge is its status: green confirmed, yellow pencilled in, red no offer written yet.' + (agency ? ' The small square is the brand color.' : ' Outlined bars are scheduled emails and texts.') },
    ctx.isClient ? null : { title: 'Getting it ready', text: 'Each date carries the steps that must be done before it (photos, briefs, ads built, emails, ads loaded). A step past its due date is late. Tap "Steps running late" to see only those dates.' },
    { title: 'Opening and sorting', text: 'Tap a bar or a row to see the offer, where it runs and each step. Tap a column name in the list to sort by it.' },
  ].filter(Boolean) }));
  ctx.askContext = (agency ? 'Calendar for every brand. ' : 'Calendar for ' + ((ctx.brand && ctx.brand.name) || 'this brand') + '. ') + coming.length + ' dates coming up, ' + soon.length + ' in the next 60 days, ' + open.length + ' not confirmed' + (ctx.isClient ? '.' : ', ' + lateSteps + ' steps running late.') + (next ? ' Next: ' + (agency ? next.brand + ' ' : '') + next.name + ', ' + span(next.start, next.end) + '.' : '');
  put(el, help, head, gridBox,
    box({ title: view.late && lateRows.length ? 'Coming up, with late steps' : 'Coming up', n: shown0.length,
      note: 'Tap a date for its offer and steps',
      action: view.late && lateRows.length ? h('button', { type: 'button', class: 'cr-clear', onclick: () => { view.late = false; draw(el, d, ctx, agency); } }, 'Show every date') : null }, tools, listBox),
    up.length ? box({ title: 'Emails and texts scheduled', n: up.length }, list(up.map(m => row({ lead: dateOf(m.start, today), title: m.name, cells: [{ w: 110, label: 'Kind', node: m.kind_label }, { w: 110, class: 'strong', label: 'When', node: away(today, m.start) }] })), null, { head: [{ label: 'Kind', w: 110 }, { label: 'When', w: 110 }], first: 'Send' })) : null,
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
    asOf: d => (d && d.at) || null,   // the oldest part on screen
    skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:150px"></div><div class="lx-skel chart" style="height:520px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>'; },
  };
}
export { at };
