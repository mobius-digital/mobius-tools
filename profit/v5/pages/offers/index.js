/* Offers: what the brand is selling and when, in order. The Black Friday offer leads.
   Live data: GET /api/season?act=<brand id> (profit worker): the season's phases (each one an offer with dates and a
   status), the results of any phase that has started, the tasks that fall out of the dates, and the dates to know.
   Read only. Writing an offer, locking it and ticking tasks stay in old Locus (ctx.legacy). */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, tiles, kpi, statusDot, button, em, empty, money, x, addStyles, sourceLine } from '../../kit.js';
import { defLabel } from '../../defs.js';
import { fixture } from '../../data.js';
import { css, span, away, between, short, todayYmd, row, list, box, dateOf, exampleChip, helpBar } from '../calendar/_cr.js';

const OF_CSS = `.cr-offer.of-head{padding:0 0 8px;border-top:0;min-height:0;font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted)}
.of-lead{display:grid;gap:6px;min-width:0}
.of-lead .deal{font-size:var(--num-l,26px);font-weight:600;letter-spacing:-.03em;line-height:1.2;overflow-wrap:anywhere}
.of-lead .deal.none{color:var(--muted)}
.of-lead .meta{display:flex;gap:8px 16px;flex-wrap:wrap;align-items:center;font-size:var(--fs-small,12.5px);color:var(--muted)}
.of-lead .detail{font-size:var(--fs-body,14px);color:var(--ink-2);line-height:1.5;max-width:80ch}
.cr-box .cr-offer:first-of-type{border-top:0}
.cr-offer .res .lx-srcline{flex-basis:100%;margin-top:-4px}
.cr-offer .res{gap:8px 22px}
.cr-offer .res span{display:inline-flex;gap:6px;align-items:baseline}
@media (max-width:759px){.cr-offer.of-head{display:none}}`;

const STATUS = { locked: ['good', 'Locked'], draft: ['warn', 'Draft, not locked'], proposed: ['warn', 'Proposed, not locked'], missing: ['bad', 'Not written yet'] };
const KNOW = [['cutoffs', 'Order by'], ['gift_cards', 'Gift cards'], ['returns', 'Returns']];

/** A phase that has started: sales, the goal and Store MER, each with its label. A brand with no sales source never
    reads 0 sales. A finished offer says "Sales", one still running "Sales so far". */
function results(p, ctx, today) {
  const r = p.results;
  if (!r || !r.days) return null;
  if (!(r.sales > 0)) return h('div', { class: 'res' }, r.spend > 0 ? ['Ad spend ', h('b', null, money(r.spend)), ctx.isClient ? '. Sales are not connected yet.' : '. No sales source is connected, so there is no sales figure.'] : 'No sales read for these days yet.');
  const over = (p.end || p.start) < today;
  /* plain words stay plain (no definition mark on Sales); the window and source say where the figures come from */
  return h('div', { class: 'res' },
    h('span', null, over ? 'Sales' : 'Sales so far', h('b', null, money(r.sales))),
    r.goal ? h('span', null, 'Goal', h('b', null, money(r.goal))) : null,
    r.mer != null ? h('span', null, defLabel('Store MER', 'mer'), h('b', null, x(r.mer))) : null,
    r.spend > 0 ? h('span', null, 'Ad spend', h('b', null, money(r.spend))) : null,
    sourceLine(span(r.from, r.to), 'Triple Whale'));
}

function draw(el, d, ctx) {
  css(); addStyles('lx-of-css', OF_CSS);
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
  /* a locked offer that has ended shows "Ran" in the list: the tile says so too, so the two agree */
  const ran = phases.filter(p => p.status === 'locked' && (p.end || p.start || '9999') < today).length;
  const missing = phases.filter(p => p.status === 'missing' && (p.end || p.start || '9999') >= today);
  const st = p => STATUS[p.status] || STATUS.missing;
  const bfDay = d.bf || null;

  const bfDow = bfDay ? new Date(bfDay + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' }) + ' ' + short(bfDay) : '';
  const lead = box({ title: 'The offer that leads: ' + bf.name, action: statusDot(st(bf)[0], st(bf)[1]) },
    h('div', { class: 'of-lead' },
      h('span', { class: 'deal' + (bf.offer ? '' : ' none') }, bf.offer || 'Not written yet'),
      h('span', { class: 'meta' }, bf.start ? span(bf.start, bf.end) + ', ' + (bf.start <= today && (bf.end || bf.start) >= today ? 'on now' : (bf.end || bf.start) < today ? 'finished' : 'starts ' + away(today, bf.start)) : 'No dates yet'),
      bf.detail ? h('span', { class: 'detail' }, bf.detail) : null));
  const head = tiles([
    kpi({ label: 'Offers locked', value: String(locked), small: 'of ' + phases.length, sub: [ran ? ran + ' already ran' : null, locked === phases.length ? 'all of them agreed' : (phases.length - locked) + ' can still change'].filter(Boolean).join(', ') }),
    /* Black Friday is the Friday; a sale can start before it (the lead offer's own dates say when) */
    bfDay ? kpi({ label: 'Days until Black Friday', value: between(today, bfDay) > 0 ? String(between(today, bfDay)) : between(today, bfDay) === 0 ? 'Today' : 'Done', sub: bfDow + (bf.start && bf.start < bfDay ? ', the sale starts ' + short(bf.start) : '') }) : null,
    kpi({ label: 'Still to write', value: String(missing.length), sub: missing.length ? statusDot('bad', missing.map(p => p.name).join(', ')) : 'nothing missing' }),
  ].filter(Boolean), { cols: bfDay ? 3 : 2 });

  const offers = box({ title: 'The offers, in order', n: phases.length, note: d.example ? exampleChip() : 'Sales under an offer that has started' },
    h('div', { class: 'cr-offer of-head', 'aria-hidden': 'true' }, h('span'), h('span', null, 'Offer'), h('span', { class: 'wh' }, 'Dates'), h('span', { class: 'st' }, 'Status')),
    phases.map((p, i) => h('div', { class: 'cr-offer' + (p === bf ? ' lead' : '') },
      h('span', { class: 'n' }, i + 1),
      h('div', null,
        h('div', { class: 'nm' }, p.name),
        h('div', { class: 'deal' + (p.offer ? '' : ' none') }, p.offer || 'No offer written yet'),
        p.detail ? h('div', { class: 'detail' }, p.detail) : null,
        results(p, ctx, today)),
      h('div', { class: 'when wh' }, p.start ? span(p.start, p.end) : 'No dates yet',
        p.start ? h('small', null, (p.end || p.start) < today ? 'finished' : p.start <= today ? 'on now' : away(today, p.start)) : null),
      h('div', { class: 'st' }, (p.end || p.start || '9999') < today && p.status === 'locked' ? statusDot('off', 'Ran') : statusDot(st(p)[0], st(p)[1])))));

  /* what the dates ask of the team (team only) */
  const open = ctx.isClient ? [] : (a.tasks || []).filter(t => !t.done && t.due).sort((p, q) => p.due.localeCompare(q.due));
  const late = open.filter(t => t.due < today).length;
  const due = open.length ? box({ title: 'Due next', n: open.length, note: late ? statusDot('bad', late + ' late') : 'Steps that fall out of the dates' },
    list(open.slice(0, 8).map(t => row({
      lead: dateOf(t.due, today), title: t.name, sub: t.phase || '', late: false,
      cells: [{ w: 150, label: 'Owner', node: t.owner || '' }, { w: 120, class: 'strong', label: 'Due', node: t.due < today ? statusDot('bad', between(t.due, today) + (between(t.due, today) === 1 ? ' day late' : ' days late')) : away(today, t.due) }],
    })), null, { head: [{ label: 'Owner', w: 150 }, { label: 'Due', w: 120 }], first: 'Task' })) : null;

  const know = KNOW.map(([k, label]) => a.answers && a.answers[k] ? [h('dt', null, label), h('dd', null, a.answers[k])] : null).filter(Boolean);
  const dates = know.length ? box({ title: 'Dates to know' }, h('dl', { class: 'cr-kv' }, know)) : null;

  put(el, helpBar([
    { title: 'What it is for', text: 'What the brand is selling and when, in order, with the Black Friday offer first.' },
    { title: 'Locked, draft and not written', text: 'Locked means the offer is agreed with the client and is what the ads and emails say. A draft can still change. Not written yet means nobody has put the offer in.' },
    { title: 'Results', text: 'Once an offer has started, its sales for those days and the store MER show under it, against the sales goal when one was set.' },
  ]), lead, head, offers, due, dates,
    !ctx.isClient && ctx.legacy ? h('div', null, button('Write or lock an offer in old ' + APP_NAME, { href: ctx.legacy, icon: 'arrow' })) : null);
  ctx.askContext = 'Season offers for ' + (a.name || (ctx.brand && ctx.brand.name) || 'this brand') + ': ' + phases.length + ' offers, ' + locked + ' locked, ' + missing.length + ' still to write. Leading offer: ' + bf.name + ', ' + (bf.offer || 'not written') + (bf.start ? ', ' + span(bf.start, bf.end) : '') + '.';
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
