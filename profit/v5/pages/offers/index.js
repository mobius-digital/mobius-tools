/* Offers: what the brand is selling and when, in order. The Black Friday offer leads.
   Live data: GET /api/season?act=<brand id> (profit worker): the season's phases (each one an offer with dates and a
   status), the results of any phase that has started, the tasks that fall out of the dates, and the dates to know.
   Read only. Writing an offer, locking it and ticking tasks stay in old Locus (ctx.legacy). */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, hero, kpis, kpi, statusDot, button, em, empty, money, x } from '../../kit.js';
import { fixture } from '../../data.js';
import { css, span, away, between, short, todayYmd, heading, row, list, dateOf, exampleChip } from '../calendar/_cr.js';

const STATUS = { locked: ['good', 'Locked'], draft: ['warn', 'Draft, not locked'], proposed: ['warn', 'Proposed, not locked'], missing: ['bad', 'Not written yet'] };
const KNOW = [['cutoffs', 'Order by'], ['gift_cards', 'Gift cards'], ['returns', 'Returns']];

/** A phase that has started: sales and MER so far. A brand with no sales source never reads 0 sales. */
function results(p, ctx) {
  const r = p.results;
  if (!r || !r.days) return null;
  if (!(r.sales > 0)) return h('div', { class: 'res' }, r.spend > 0 ? ['Ad spend ', h('b', null, money(r.spend)), ctx.isClient ? '. Sales are not connected yet.' : '. No sales source is connected, so there is no sales figure.'] : 'No sales read for these days yet.');
  return h('div', { class: 'res' },
    h('span', null, 'Sales so far ', h('b', null, money(r.sales)), r.goal ? ' of ' + money(r.goal) : ''),
    r.mer != null ? h('span', null, 'MER ', h('b', null, x(r.mer))) : null,
    h('span', null, short(r.from) + ' to ' + short(r.to)));
}

function draw(el, d, ctx) {
  css();
  const a = d && d.accounts && d.accounts[0];
  const today = (d && d.today) || todayYmd();
  const phases = a ? (a.phases || []).filter(p => p.status !== 'skip' && (p.start || p.offer)) : [];
  if (!a || a.in_season === false || !phases.length) {
    return put(el, empty({ title: 'No offers written yet', text: ctx.isClient ? 'Your team has not put this season\'s offers in yet. They will show here as soon as they do.' : 'This brand has no offers dated for the season. Write them on the season plan in old ' + APP_NAME + '.',
      action: !ctx.isClient && ctx.legacy ? button('Open the season plan in old ' + APP_NAME, { href: ctx.legacy }) : null }));
  }
  phases.sort((p, q) => (p.start || '9999').localeCompare(q.start || '9999'));
  const bf = phases.find(p => p.key === 'bf') || phases.find(p => (p.end || p.start) >= today) || phases[0];
  const locked = phases.filter(p => p.status === 'locked').length;
  const missing = phases.filter(p => p.status === 'missing' && (p.end || p.start || '9999') >= today);
  const st = p => STATUS[p.status] || STATUS.missing;
  const bfDay = d.bf || null;

  const head = hero({ line: true }, h('div', { class: 'cr-herogrid' },
    h('div', { class: 'cr-heroline' },
      h('span', { class: 'lab' }, bf.name),
      h('span', { class: 'big' }, bf.offer || 'Not written yet'),
      h('span', { class: 'of' }, bf.start ? span(bf.start, bf.end) + ', ' + (bf.start <= today && (bf.end || bf.start) >= today ? 'on now' : away(today, bf.start)) : 'no dates yet'),
      h('span', null, statusDot(st(bf)[0], st(bf)[1]))),
    kpis([
      kpi({ label: 'Offers locked', value: String(locked), small: 'of ' + phases.length, size: 'lg', sub: locked === phases.length ? 'all of them' : (phases.length - locked) + ' still open' }),
      bfDay ? kpi({ label: 'Days to Black Friday', value: between(today, bfDay) > 0 ? String(between(today, bfDay)) : between(today, bfDay) === 0 ? 'Today' : 'Done', size: 'lg', sub: short(bfDay) }) : null,
      kpi({ label: 'Still to write', value: String(missing.length), size: 'lg', sub: missing.length ? statusDot('bad', missing[0].name) : 'nothing missing' }),
    ].filter(Boolean), { cols: bfDay ? 3 : 2 })));

  const offers = h('section', { class: 'cr-sect' }, heading('The offers, in order', phases.length, d.example ? exampleChip() : null),
    phases.map((p, i) => h('div', { class: 'cr-offer' + (p === bf ? ' lead' : '') },
      h('span', { class: 'n' }, i + 1),
      h('div', null,
        h('div', { class: 'nm' }, p.name),
        h('div', { class: 'deal' + (p.offer ? '' : ' none') }, p.offer || 'No offer written yet'),
        p.detail ? h('div', { class: 'detail' }, p.detail) : null,
        results(p, ctx)),
      h('div', { class: 'when wh' }, p.start ? span(p.start, p.end) : 'No dates yet',
        p.start ? h('small', null, (p.end || p.start) < today ? 'finished' : p.start <= today ? 'on now' : away(today, p.start)) : null),
      h('div', { class: 'st' }, (p.end || p.start || '9999') < today && p.status === 'locked' ? statusDot('off', 'Ran') : statusDot(st(p)[0], st(p)[1])))));

  /* what the dates ask of the team (team only) */
  const open = ctx.isClient ? [] : (a.tasks || []).filter(t => !t.done && t.due).sort((p, q) => p.due.localeCompare(q.due));
  const late = open.filter(t => t.due < today).length;
  const due = open.length ? h('section', { class: 'cr-sect' }, heading('Due next', open.length, late ? statusDot('bad', late + ' late') : null),
    list(open.slice(0, 8).map(t => row({
      lead: dateOf(t.due, today), title: t.name, sub: t.phase || '', late: false,
      cells: [{ w: 150, node: t.owner || '' }, { w: 120, class: 'strong', node: t.due < today ? statusDot('bad', between(t.due, today) + (between(t.due, today) === 1 ? ' day late' : ' days late')) : away(today, t.due) }],
    })))) : null;

  const know = KNOW.map(([k, label]) => a.answers && a.answers[k] ? [h('dt', null, label), h('dd', null, a.answers[k])] : null).filter(Boolean);
  const dates = know.length ? h('section', { class: 'cr-sect' }, heading('Dates to know'), h('dl', { class: 'cr-kv', style: { borderTop: '1px solid var(--line)', paddingTop: '16px' } }, know)) : null;

  put(el, head, offers, due, dates,
    !ctx.isClient && ctx.legacy ? h('div', null, button('Write or lock an offer in old ' + APP_NAME, { href: ctx.legacy, icon: 'arrow' })) : null);
}

/* Sample mode: Northlake Golf has its own file; any other brand's offers are read off the sample calendar. */
async function sample(ctx) {
  const own = await ctx.fixture('index.json');
  const id = ctx.brand && ctx.brand.id;
  if (!id || id === own.accounts[0].act_id) return own;
  const cal = await fixture('a-calendar/_sample/index.json');
  const KEY = { 'Black Friday weekend': 'bf' };
  const phases = cal.items.filter(e => e.act === id && e.src === 'season').map((e, i) => ({ key: KEY[e.name] || 'p' + i, name: e.name, start: e.start, end: e.end, offer: e.offer, detail: '', status: e.status === 'conf' ? 'locked' : e.status === 'miss' ? 'missing' : 'draft' }));
  return { ...own, accounts: [{ act_id: id, name: ctx.brand.name, in_season: true, answers: {}, goals: {}, phases, tasks: [] }] };
}

export default {
  title: ['What are ', em('the offers?')],
  eyebrow: 'Offers',
  ranges: false,                 /* a season's offers have their own dates */
  async load(ctx) {
    return ctx.api('/api/season?act=' + encodeURIComponent(ctx.brand.id), { signal: ctx.signal });
  },
  sample,
  render: draw,
  skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:200px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>'; },
};
