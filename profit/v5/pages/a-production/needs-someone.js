/* Agency > Production > Needs someone. "Which cards have nobody on them?"
   Every open card (Brief to Ready) with no owner, soonest date first, then who has room: each person's open cards,
   how many are due this week and how many are late, fewest first. A card opens its sheet, where "Who has it" assigns it
   (POST /api/production/field { id, owner }, Asana follows). Data: GET /api/production?act=all on the account-health worker (see _ap.js). */

import { APP_NAME } from '../../config.js';
import { h, hero, kpi, kpis, em, card, statusDot, empty, skeleton } from '../../kit.js';
import { SAMPLE } from '../../data.js';
import { refresh } from '../../router.js';
import { canWrite } from '../production/_act.js';
import { put, css, day, plural, who, oldLocus } from '../production/_ui.js';
import { openCard } from '../production/_sheet.js';
import { apCss, loadAll, brandName, isOpen, todayOf, weekOf, daysFrom } from './_ap.js';

const STAGE = { brief: 'Brief', making: 'Making', review: 'Review', ready: 'Ready to load' };
const dateOf = c => (c.board === 'ready' ? c.launch_on || c.due : c.due) || '';

const page = {
  title: ['Which cards ', em('have nobody on them?')],
  eyebrow: 'Production',
  ranges: false,
  asOf: d => (!SAMPLE && d && d.synced_at) || null,
  load: loadAll,
  sample: ctx => ctx.fixture('pipeline.json'),
  skeleton(el) { put(el, skeleton('kpi', 3), skeleton('row', 6)); },

  render(el, data, ctx) {
    css(); apCss();
    const cards = (data && data.cards) || [];
    const today = todayOf(data), wk = weekOf(today);
    const open = cards.filter(isOpen);
    const nobody = open.filter(c => !c.assignee).sort((a, b) => String(dateOf(a) || '9').localeCompare(String(dateOf(b) || '9')));
    const soon = nobody.filter(c => dateOf(c) && dateOf(c) <= wk[1]);
    const lateNobody = nobody.filter(c => dateOf(c) && dateOf(c) < today);

    /* who has room: the people who own cards on any board (the team list also holds people who never make ads) */
    const names = [...new Set(cards.map(c => c.assignee).filter(Boolean))];
    const people = names.map(name => {
      const mine = open.filter(c => c.assignee === name);
      return { name, open: mine.length, week: mine.filter(c => dateOf(c) && dateOf(c) >= today && dateOf(c) <= wk[1]).length, late: mine.filter(c => c.late).length };
    }).sort((a, b) => a.open - b.open || a.name.localeCompare(b.name));

    if (!cards.length) { put(el, empty({ title: 'No cards on any board yet', text: 'A card appears here when a brief is written for a brand.' })); return; }
    const changed = () => { if (SAMPLE) page.render(el, data, ctx); else refresh({ fresh: true }); };
    const row = c => {
      const d = dateOf(c), gap = d ? daysFrom(today, d) : null;
      return h('button', { type: 'button', class: 'pd-line', onclick: () => openCard(ctx, c, { photos: data.photos || {}, today, team: data.team || [], onChange: changed }) },
        h('span', { class: 'n' }, c.num),
        h('span', { class: 't' }, h('b', null, c.title || 'Untitled card'), h('small', null, brandName(ctx, c.act_id, c.brand), ', ' + [STAGE[c.board], c.format].filter(Boolean).join(', '))),
        h('span', { class: 'w' }, gap != null && gap < 0 ? statusDot('bad', 'Past its date') : gap != null && gap <= 2 ? statusDot('warn', 'Soon') : null),
        h('span', { class: 'd' + (gap != null && gap < 0 ? ' late' : '') }, !d ? 'No date' : (c.board === 'ready' ? 'Live ' : 'Due ') + day(d)));
    };
    put(el,
      hero({ line: true },
        kpis([
          kpi({ label: 'Open cards with nobody', value: String(nobody.length), sub: plural(new Set(nobody.map(c => c.act_id)).size, 'brand') }),
          kpi({ label: 'Due by Sunday', value: String(soon.length), sub: soon.length ? statusDot('warn', 'need someone this week') : statusDot('good', 'nothing this week') }),
          kpi({ label: 'Already past their date', value: String(lateNobody.length), sub: lateNobody.length ? statusDot('bad', 'oldest ' + day(dateOf(lateNobody[0]))) : statusDot('good', 'none') }),
        ], { cols: 3 })),
      nobody.length ? card({ title: 'Nobody on them', note: 'soonest first', flush: true, action: canWrite(ctx) ? null : oldLocus(ctx, { label: 'Open in old ' + APP_NAME }) },
        h('div', { class: 'pd-list ap-list' }, nobody.map(row)))
        : card({}, h('p', { class: 'ps-none' }, 'Every open card has someone on it.')),
      card({ title: 'Who has room', note: 'open cards, fewest first', flush: true },
        h('div', { class: 'ap-people' }, people.map(p => h('div', { class: 'ap-person' },
          h('div', { class: 'nm' }, who(p.name, data.photos || {}, 28), h('span', null, p.name)),
          h('div', { class: 'ap-load', role: 'img', 'aria-label': `${p.open} open, ${p.week} due this week, ${p.late} late` },
            Array.from({ length: p.open }, (_, i) => h('i', { class: i < p.late ? 'late' : i < p.late + p.week ? 'week' : '' }))),
          h('div', { class: 'nums' }, p.open ? `${p.open} open, ${p.week} this week` : 'Nothing open', p.late ? h('span', { class: 'ap-late' }, `, ${p.late} late`) : null))))),
      h('div', { class: 'ap-key ap-legend' }, h('span', null, h('i', { style: { background: 'var(--bad)' } }), 'Late'), h('span', null, h('i', { style: { background: 'var(--ink-2)' } }), 'Due this week'), h('span', null, h('i', { style: { background: 'var(--line-strong)' } }), 'Later or no date')),
      h('p', { class: 'lx-foot' }, canWrite(ctx) ? 'Open a card and pick who has it. Asana follows.' : 'You can look here. Cards are assigned by the team.'));
  },
};
export default page;
