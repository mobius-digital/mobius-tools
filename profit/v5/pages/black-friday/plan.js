/* Black Friday > Plan, read only. What was agreed for the sale: the goal, the budget, each day's share,
   the lines for raising, holding and cutting, and what is still open.
   Live data (profit worker, reads only):
     brand   GET /api/season/war?act=<brand id>    the plan, last year's same days, the steps (no live numbers asked for)
     agency  GET /api/season/war?act=all           one row per brand in the sale
   Nothing here writes. The plan is changed in old Locus (ctx.legacy). */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, hero, kpis, kpi, statusDot, button, em, empty, money, x, pct, num, lineChart, legend, table, platformChip, card } from '../../kit.js';
import { fixture } from '../../data.js';
import { css, span, away, short, wday, between, todayYmd, heading, row, list, brandTag, colorOf } from '../calendar/_cr.js';

const sum = (a, k) => a.reduce((t, r) => t + (+r[k] || 0), 0);
const central = iso => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(' AM', 'am').replace(' PM', 'pm');
const goalText = (g, cur) => g.metric === 'mer' ? x(g.target) : ['revenue', 'aov', 'spend'].includes(g.metric) ? money(g.target, { cur }) : num(g.target);
const windowText = (d, today) => span(d.sale.start, d.sale.end) + ', ' + (today > d.sale.end ? 'finished' : today >= d.sale.start ? 'on now' : 'starts ' + away(today, d.sale.start));

function draw(el, d, ctx) {
  css();
  if (!d || !d.sale) return put(el, empty({ title: 'The plan did not answer', text: 'Nothing was read. Try again in a minute.' }));
  const today = d.today || todayYmd(), cur = d.currency || 'USD';
  const goals = d.goals_list || [], rev = (goals.find(g => g.metric === 'revenue') || {}).target || null;
  const bud = d.budget || { total: 0, channels: [] }, L = d.ladder || {};
  const days = (d.plan || []).filter(p => p.date);
  const merGoal = (goals.find(g => g.metric === 'mer') || {}).target || L.target || null;
  if (!rev && !bud.total && !(d.steps || []).some(s => s.done)) {
    return put(el, empty({ title: 'No Black Friday plan yet', text: ctx.isClient ? 'Your team has not set the goal and the budget for the sale yet.' : 'No goal, budget or offer is set for this brand\'s sale. Set them in old ' + APP_NAME + '.',
      action: !ctx.isClient && ctx.legacy ? button('Open the plan in old ' + APP_NAME, { href: ctx.legacy }) : null }));
  }
  const ly = d.baseline && d.baseline.totals && d.baseline.totals.sales > 0 ? d.baseline.totals : null;
  const lyDays = sum(days, 'ly_sales');
  const steps = d.steps || [], doneN = steps.filter(s => s.done).length;

  const head = hero({ line: true }, h('div', { class: 'cr-herogrid' },
    h('div', { class: 'cr-heroline' },
      h('span', { class: 'lab' }, 'Sales goal for the sale'),
      h('span', null, h('span', { class: 'lx-hero-num' }, rev ? money(rev, { cur }) : 'not set')),
      h('span', { class: 'of' }, windowText(d, today))),
    kpis([
      kpi({ label: 'Ad budget', value: bud.total ? money(bud.total, { cur }) : 'not set', size: 'lg', sub: bud.total && days.length ? money(bud.total / days.length, { cur }) + ' a day on average' : '' }),
      kpi({ label: 'MER goal', value: merGoal ? x(merGoal) : 'not set', size: 'lg', sub: rev && bud.total ? 'the plan works out to ' + x(rev / bud.total) : 'whole store' }),
      kpi({ label: 'Same days last year', value: lyDays > 0 ? money(lyDays, { cur }) : 'no data', size: lyDays > 0 ? 'lg' : null, sub: lyDays > 0 && rev ? 'the goal is ' + pct(rev / lyDays - 1, { signed: true }) : lyDays > 0 ? '' : 'no sales source for last year' }),
    ], { cols: 3 })));

  /* the plan by day: one full width chart, then the same days as a table */
  const hasDay = days.some(p => p.revenue != null || p.spend != null);
  const labels = days.map(p => wday(p.date) + ' ' + +p.date.slice(8, 10));
  const chart = hasDay ? h('section', { class: 'cr-sect' },
    h('div', { class: 'lx-chart-h' }, h('h3', null, 'The plan, day by day'),
      legend([rev ? { name: 'Sales goal', lead: true } : null, bud.total ? { name: 'Ad budget' } : null, lyDays > 0 ? { name: 'Last year, same day', dashed: true } : null])),
    lineChart({
      series: [
        rev ? { name: 'Sales goal', values: days.map(p => p.revenue), lead: true, points: true, labels: true } : null,
        bud.total ? { name: 'Ad budget', values: days.map(p => p.spend), points: true, end: false } : null,
        lyDays > 0 ? { name: 'Last year', values: days.map(p => p.ly_sales), dashed: true } : null,
      ],
      labels, slots: true, format: v => money(v, { cur, compact: true }), height: 340, phoneHeight: 280,
      label: 'Sales goal and ad budget for each day of the sale',
      hover: i => [h('b', null, labels[i]), rev ? ' sales goal ' + money(days[i].revenue, { cur }) : '', bud.total ? ', ad budget ' + money(days[i].spend, { cur }) : '', days[i].ly_sales ? ', last year ' + money(days[i].ly_sales, { cur }) : ''],
    })) : null;
  const dayTable = hasDay ? card({ title: 'Each day', flush: true }, table({
    roomy: true,
    cols: [
      { key: 'date', label: 'Day', render: p => h('span', { class: 'name' }, wday(p.date) + ' ' + short(p.date), p.date === today ? h('span', { class: 'sub' }, 'today') : null) },
      { key: 'revenue', label: 'Sales goal', num: true, render: p => p.revenue != null ? h('span', { class: 'strong' }, money(p.revenue, { cur })) : '' },
      { key: 'spend', label: 'Ad budget', num: true, render: p => p.spend != null ? money(p.spend, { cur }) : '' },
      { key: 'mer', label: 'MER', num: true, class: 'hide-sm', render: p => p.revenue && p.spend ? x(p.revenue / p.spend) : '' },
      { key: 'ly_sales', label: 'Last year', num: true, class: 'hide-sm', render: p => p.ly_sales ? h('span', { class: 'dim' }, money(p.ly_sales, { cur })) : h('span', { class: 'dim' }, 'no data') },
    ],
    rows: days,
    total: { date: null, revenue: rev, spend: bud.total || null, ly_sales: lyDays || null, _total: true },
  })) : null;
  if (dayTable) { const t = dayTable.querySelector('tr.total td'); if (t) t.textContent = 'The whole sale'; }

  /* raise, hold, cut */
  const hasLadder = [L.be, L.target, L.s50, L.s100].some(v => v != null);
  const ladder = hasLadder ? h('section', { class: 'cr-sect' }, heading('When to raise, hold or cut', null, 'Store MER over the last few hours of the sale'),
    h('div', { class: 'cr-ladder' },
      h('div', { class: 'good' }, h('small', null, 'Raise the budget 100%'), h('b', null, L.s100 != null ? x(L.s100) : 'not set'), h('span', null, 'or better')),
      h('div', { class: 'good' }, h('small', null, 'Raise 50%'), h('b', null, L.s50 != null ? x(L.s50) : 'not set'), h('span', null, 'or better')),
      h('div', { class: 'warn' }, h('small', null, 'Hold'), h('b', null, L.target != null ? x(L.target) : 'not set'), h('span', null, L.hold != null ? 'down to ' + x(L.hold) : 'the goal')),
      h('div', { class: 'bad' }, h('small', null, 'Cut'), h('b', null, L.be != null ? x(L.be) : 'not set'), h('span', null, 'under break-even')))) : null;

  /* budget by platform */
  const ch = bud.channels || [];
  const budget = ch.length ? card({ title: 'The budget, by platform', flush: true }, table({
    roomy: true,
    cols: [
      { key: 'label', label: 'Platform', render: c => platformChip(c.id, { label: c.label }) },
      { key: 'amount', label: 'Budget', num: true, render: c => h('span', { class: 'strong' }, money(c.amount, { cur })) },
      { key: 'share', label: 'Share', num: true, render: c => bud.total ? pct(c.amount / bud.total) : '' },
      { key: 'target', label: 'Goal', num: true, class: 'hide-sm', render: c => c.target ? (c.metric === 'cpa' ? money(c.target, { cur }) + ' a sale' : 'ROAS ' + x(c.target)) : h('span', { class: 'dim' }, 'none set') },
    ],
    rows: ch,
    total: Math.abs(bud.unallocated || 0) >= 1 ? { id: '', label: '', amount: bud.unallocated, _un: true } : undefined,
  })) : null;
  if (budget && Math.abs(bud.unallocated || 0) >= 1) { const t = budget.querySelector('tr.total td'); if (t) t.textContent = bud.unallocated > 0 ? 'Not given to a platform yet' : 'Over the budget'; }

  /* other goals, the steps, the switches */
  const other = goals.filter(g => g.metric !== 'revenue' && g.metric !== 'mer' && g.target);
  const more = other.length ? h('section', { class: 'cr-sect' }, heading('Also aiming for'),
    kpis(other.map(g => kpi({ label: (d.metrics && d.metrics[g.metric]) || g.metric, value: goalText(g, cur) })), { cols: Math.min(4, other.length) })) : null;
  const check = steps.length ? h('section', { class: 'cr-sect' }, heading('Is the plan finished?', null, doneN + ' of ' + steps.length + ' done'),
    h('div', { class: 'cr-check' }, steps.map(s => h('div', null, h('span', { class: 'cr-tick' + (s.done ? ' on' : '') }), h('span', null, h('b', null, s.label), !s.done && s.why ? h('small', null, s.why) : null))))) : null;
  const sched = !ctx.isClient && d.scheduled && d.scheduled.length ? h('section', { class: 'cr-sect' }, heading('Set to switch by itself', d.scheduled.length, 'Central time'),
    list(d.scheduled.map(s => row({ title: s.what, sub: s.task || '', cells: [{ w: 190, class: 'strong', node: central(s.at) }] })))) : null;
  const offers = (d.phases || []).filter(p => p.start && p.start <= d.sale.end && (p.end || p.start) >= d.sale.start);
  const offerList = offers.length ? h('section', { class: 'cr-sect' }, heading('The offers in the sale', offers.length),
    list(offers.map(p => row({ title: p.offer || 'No offer written yet', sub: p.name, cells: [{ w: 150, class: 'strong', node: span(p.start, p.end) }, { w: 150, node: statusDot(p.status === 'locked' ? 'good' : p.status === 'missing' ? 'bad' : 'warn', p.status === 'locked' ? 'Locked' : p.status === 'missing' ? 'Not written yet' : 'Not locked') }] })))) : null;

  put(el, head, chart, dayTable, ladder, budget, more, offerList, check, sched,
    !ctx.isClient && ctx.legacy ? h('div', null, button('Change the plan in old ' + APP_NAME, { href: ctx.legacy, icon: 'arrow' })) : null);
}

/* Sample mode: Northlake Golf's plan; another brand gets the same shape scaled to its own weekend goal. */
async function sample(ctx) {
  const own = await ctx.fixture('plan.json');
  const id = ctx.brand && ctx.brand.id;
  if (!id || id === own.act_id) return own;
  const pace = await fixture('a-black-friday/_sample/pace.json').catch(() => null);
  const b = pace && (pace.brands || []).find(r => r.id === id);
  const k = b && b.weekend && b.weekend.goal ? b.weekend.goal / own.goals_list[0].target : 0.6;
  const r = v => v == null ? v : Math.round(v * k / 10) * 10;
  return { ...own, act_id: id, name: ctx.brand.name,
    goals_list: own.goals_list.map(g => g.metric === 'revenue' ? { ...g, target: r(g.target) } : g),
    budget: { ...own.budget, total: r(own.budget.total), allocated: r(own.budget.allocated), channels: own.budget.channels.map(c => ({ ...c, amount: r(c.amount) })) },
    plan: own.plan.map(p => ({ ...p, revenue: r(p.revenue), spend: r(p.spend), ly_sales: r(p.ly_sales), ly_spend: r(p.ly_spend) })),
    phases: own.phases.map(p => p.key === 'bf' ? { ...p, offer: 'The Black Friday offer' } : p) };
}

export default {
  title: ['What is the plan for ', em('Black Friday?')],
  eyebrow: 'Black Friday',
  ranges: false,                 /* the sale has its own dates */
  async load(ctx) { return ctx.api('/api/season/war?act=' + encodeURIComponent(ctx.brand.id), { signal: ctx.signal }); },
  sample,
  render: draw,
  skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:200px"></div><div class="lx-skel chart" style="height:340px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>'; },
};

/* ---------- every brand (pages/a-black-friday/plan.js) ---------- */
function drawAll(el, d, ctx) {
  css();
  const rows = (d && d.brands) || [];
  if (!rows.length) return put(el, empty({ title: 'No brand has a Black Friday plan yet', text: 'A brand shows here once its sale has dates.' }));
  const today = d.today || todayYmd();
  const withGoal = rows.filter(r => r.goal > 0);
  const ready = rows.filter(r => r.steps && r.steps.length && r.done === r.steps.length).length;
  const first = rows.map(r => r.sale && r.sale.start).filter(Boolean).sort()[0];
  const slug = id => ((ctx.brands || []).find(b => b.id === id) || {}).slug;
  const head = hero({ line: true }, h('div', { class: 'cr-herogrid' },
    h('div', { class: 'cr-heroline' },
      h('span', { class: 'lab' }, 'Sales goal, every brand'),
      h('span', null, h('span', { class: 'lx-hero-num' }, withGoal.length ? money(sum(withGoal, 'goal')) : 'not set')),
      h('span', { class: 'of' }, withGoal.length + ' of ' + rows.length + ' brands have a goal')),
    kpis([
      kpi({ label: 'Brands in the sale', value: String(rows.length), size: 'lg', sub: first ? 'first one starts ' + short(first) : '' }),
      kpi({ label: 'Plans finished', value: String(ready), small: 'of ' + rows.length, size: 'lg', sub: ready === rows.length ? 'all of them' : statusDot('warn', (rows.length - ready) + ' with a step open') }),
      kpi({ label: 'Days to Black Friday', value: d.bf ? (between(today, d.bf) > 0 ? String(between(today, d.bf)) : between(today, d.bf) === 0 ? 'Today' : 'Done') : 'no date', size: 'lg', sub: d.bf ? short(d.bf) : '' }),
    ], { cols: 3 })));
  const body = h('section', { class: 'cr-sect' }, heading('Each brand\'s plan', rows.length),
    list(rows.slice().sort((a, b) => (a.done - (a.steps || []).length) - (b.done - (b.steps || []).length) || a.name.localeCompare(b.name)).map(r => {
      const openStep = (r.steps || []).find(s => !s.done), s = slug(r.act_id);
      return row({
        title: brandTag(r.name, colorOf(ctx, r.act_id)), sub: r.bf_offer || 'No Black Friday offer written yet', late: !r.bf_offer,
        cells: [
          { w: 130, class: 'strong', label: 'Sale', node: r.sale ? span(r.sale.start, r.sale.end) : '' },
          { w: 100, class: 'num strong', label: 'Goal', node: r.goal ? money(r.goal, { cur: r.currency }) : h('span', { style: { color: 'var(--muted)', fontWeight: 400 } }, 'no goal') },
          { w: 80, class: 'num hide-sm', label: 'MER goal', node: r.ladder && r.ladder.target != null ? x(r.ladder.target) : '' },
          { w: 190, class: 'hide-md', node: openStep ? statusDot('warn', 'Open: ' + openStep.label.toLowerCase()) : statusDot('good', 'Plan finished') },
        ],
        action: s ? button('Open plan', { href: '#/brand/' + encodeURIComponent(s) + '/black-friday/plan' }) : null,
      });
    })));
  put(el, head, body);
}

export const agencyPlan = {
  title: ['Is every brand ', em('ready for Black Friday?')],
  eyebrow: 'Black Friday',
  ranges: false,
  async load(ctx) {
    const d = await ctx.api('/api/season/war?act=all', { signal: ctx.signal });
    /* keep the plan, drop today's live numbers: this page is the plan only */
    return { today: d.today, bf: d.bf, brands: (d.brands || []).map(r => ({ act_id: r.act_id, name: r.name, currency: r.currency, sale: r.sale, steps: r.steps, done: r.done, goal: r.goal, bf_offer: r.bf_offer, ladder: r.ladder ? { target: r.ladder.target } : null })) };
  },
  /* built from the two sample files that already exist: the weekend goals and the calendar */
  async sample() {
    const [pace, cal] = await Promise.all([fixture('a-black-friday/_sample/pace.json'), fixture('a-calendar/_sample/index.json')]);
    const STEPS = [['goals', 'Set the goals'], ['ladder', 'Set the scaling ladder'], ['offers', 'Lock the offers and dates']];
    return { today: cal.today, bf: '2026-11-27', brands: cal.brands.map(b => {
      const e = cal.items.find(i => i.act === b.id && i.name === 'Black Friday weekend'), p = (pace.brands || []).find(r => r.id === b.id);
      const done = { goals: !!(p && p.weekend && p.weekend.goal), ladder: !!(p && p.mer && p.mer.kpi), offers: !!e && e.status === 'conf' };
      const steps = STEPS.map(([key, label]) => ({ key, label, done: done[key] }));
      return e ? { act_id: b.id, name: b.name, currency: 'USD', sale: { start: e.start, end: e.end }, steps, done: steps.filter(s => s.done).length, goal: p && p.weekend ? p.weekend.goal : null, bf_offer: e.offer, ladder: p && p.mer ? { target: p.mer.kpi } : null } : null;
    }).filter(Boolean) };
  },
  render: drawAll,
  skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:200px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>'; },
};
