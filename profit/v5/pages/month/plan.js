/* Business > This month > Plan: the agreed numbers for the month, what they rest on, and whether they can be reached.
   Pick this month or next. Three goals and the profit they should leave, the plan beside past months as one
   full width chart, the test "can it be reached", the other ways it could have been set, and past months.

   This page reads the plan. It does not change it: the plan is agreed with the client, and changing it still
   happens in old Locus (the button, team only). Sales = MER x ad spend, so two are set and the third follows.
   Where the live numbers come from (read only, profit worker):
     /api/plan?act&month=YYYY-MM   once for this month and once for next: goals, whether that month has its own
                                   plan, the agreement, what it is based on, the growth choices, past months
     /api/overview?days=7&cmp=none&series=0   the cost check (profit figures are held back when it fails) */

import { helpBar, dl } from '../home/_biz.js';
import { put } from '../../kit.js';
import { h, money, pct, x, card, em, button, statusDot, pill, gauge, legend, lineChart, table, segmented, empty, sourceLine } from '../../kit.js';
import { ok, iso, dayLabel, monthName, monthShort, nextMonth, b, soft, pickBrand, styles, tileRow, tipRows, pageStamp, TW } from './_m.js';

/* ---------- live data ---------- */
function shapeMonth(p, costsBroken) {
  const g = p.goals || {}, c = p.ctx || {}, src = c.sources || {}, saved = p.plan || null, basis = p.basis || null;
  const has = ok(g.sales) || ok(g.spend);
  const sales = g.sales ?? null, spend = g.spend ?? null;
  const basisSales = saved && ok(saved.basis_sales) ? saved.basis_sales : basis ? basis.sales : null;
  const ret = ok(c.returning_per_day) && c.days_in_month ? c.returning_per_day * c.days_in_month : null;
  const cmOf = (s, a) => (costsBroken ? null : ok(c.margin) && ok(s) && ok(a) ? s * c.margin - a : null);
  const a = p.actual || null;
  return {
    month: p.month, status: p.status, planned: !!p.planned, days_in_month: c.days_in_month || null,
    goals: has ? { sales, spend, mer: ok(sales) && spend > 0 ? sales / spend : null } : null,
    agreed_at: saved && saved.agreed_at ? String(saved.agreed_at).slice(0, 10) : null,
    basis: basis ? { month: basis.month || null, sales: basisSales, run_rate: /run-rate/.test(basis.label || '') } : null,
    growth: ok(sales) && basisSales > 0 ? sales / basisSales - 1 : null,
    expected_profit: costsBroken ? null : saved && ok(saved.expected_cm) ? saved.expected_cm : cmOf(sales, spend),
    actual: a ? { sales: a.sales ?? null, spend: a.spend ?? null, mer: a.mer ?? null, days: a.days ?? null } : null,
    yard: ok(ret) && ok(c.amer) && ok(sales) && spend > 0 ? {
      returning: ret, new_needed: Math.max(0, sales - ret), needs: Math.max(0, sales - ret) / spend, recent: c.amer,
      from: src.trailing_from || null, to: src.trailing_to || null,
    } : null,
    options: (p.options || []).filter(o => ok(o.sales)).map(o => ({ growth: o.input, sales: o.sales, spend: o.required_spend ?? null, mer: o.implied_mer ?? null, profit: costsBroken ? null : o.expected_cm ?? null })),
  };
}

async function load(ctx) {
  if (!ctx.brand) return null;
  const id = encodeURIComponent(ctx.brand.id), sig = { signal: ctx.signal };
  const ym = iso(new Date()).slice(0, 7), nx = nextMonth(ym);
  const [cur, nxt, ov] = await Promise.all([
    ctx.api(`/api/plan?act=${id}&month=${ym}`, sig),
    soft(ctx.api(`/api/plan?act=${id}&month=${nx}`, sig)),
    soft(ctx.api('/api/overview?days=7&cmp=none&series=0', sig)),
  ]);
  const acct = ((ov && (ov.accounts || ov.brands)) || []).find(r => r.act_id === (cur.account && cur.account.act_id)) || {};
  const broken = !!(acct.cost_health && acct.cost_health.verdict === 'broken');
  const history = (cur.history || []).filter(m => !m.empty).map(m => ({ month: m.month, sales: m.sales ?? null, spend: m.spend ?? null, mer: m.mer ?? null, profit: broken ? null : m.cm ?? null, partial: !!m.partial, days: m.days ?? null }));
  return {
    current: ym, source: !!(cur.account && cur.account.tw_shop) || history.length > 0,
    months: [shapeMonth(cur, broken), nxt ? shapeMonth(nxt, broken) : null].filter(Boolean),
    history, profit_withheld: broken,
  };
}

/* ---------- pieces ---------- */
const whole = v => (ok(v) ? money(Math.round(v)) : 'no data');

function heroBlock(m, data) {
  const g = m.goals, a = m.status === 'current' ? m.actual : null, name = monthName(m.month);
  if (!g) return card({}, empty({ title: `No plan set for ${name}`, text: 'Once a sales goal and an ad budget are agreed they show here, and every other page reports against them.' }));
  const share = a && a.days && m.days_in_month ? a.days / m.days_in_month : null;
  const soFar = (actual, goal, cost) => {
    if (!ok(actual) || !ok(goal) || share == null) return null;
    const d = actual - goal * share, over = d >= 0;
    return statusDot(cost ? (over ? 'warn' : 'good') : (over ? 'good' : 'warn'), `${whole(Math.abs(d))} ${cost ? (over ? 'over' : 'under') : (over ? 'ahead' : 'behind')} so far`);
  };
  const list = [
    { label: 'Sales goal', value: whole(g.sales), source: a ? 'so far: ' + TW : null, sub: soFar(a && a.sales, g.sales) || (ok(m.growth) && m.basis && m.basis.month ? `${pct(m.growth, { signed: true })} on ${monthName(m.basis.month)}` : null) },
    { label: 'Ad budget', value: whole(g.spend), source: a ? 'so far: the ad platforms' : null, sub: soFar(a && a.spend, g.spend, true) || (ok(g.spend) && m.days_in_month ? whole(g.spend / m.days_in_month) + ' a day' : null) },
    { label: h('span', null, dl('MER', 'mer'), ' the plan needs'), value: x(g.mer), sub: a && ok(a.mer) && ok(g.mer) ? statusDot(a.mer >= g.mer ? 'good' : a.mer >= g.mer * 0.8 ? 'warn' : 'bad', x(a.mer) + ' so far') : 'sales over ad spend' },
    data.profit_withheld ? { label: 'Profit it should leave', value: 'held back', sub: 'the cost numbers need a check first' }
      : { label: dl('Profit it should leave', { name: 'Profit it should leave', definition: 'Profit after ads the plan should leave: the sales goal times the margin before ads, less the ad budget. Fixed costs come off after this.', source: TW + ' costs' }), value: whole(m.expected_profit), sub: ok(m.expected_profit) && g.sales > 0 ? pct(m.expected_profit / g.sales) + ' of sales, after ads' : null },
  ];
  return tileRow(list, { cols: 4, window: monthName(m.month) + ' plan' });
}

function stateOf(m, ctx) {
  const who = ctx.isClient ? '' : ' with the client';
  if (!m.goals) return pill('', 'No plan set');
  if (m.agreed_at) return pill('good', 'Agreed' + who + ' ' + dayLabel(m.agreed_at));
  if (!m.planned) return pill('warn', 'Carried over from the month before');
  return pill('warn', 'Not agreed' + who + ' yet');
}

function chartCard(m, data) {
  const hist = (data.history || []).filter(r => r.month < m.month), g = m.goals;
  const head = h('div', { class: 'lx-chart-h' },
    h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, g ? `How does ${monthName(m.month)} compare with past months?` : 'What have past months done?')), h('p', null, 'Sales and ad spend by month, whole store · ' + TW)),
    legend([{ name: 'Sales', square: true, color: 'var(--slate)' }, g && { name: 'The plan', lead: true, square: true, color: 'var(--e2)' }, { name: 'Ad spend' }]));
  if (hist.length + (g ? 1 : 0) < 2) return card({ class: 'mo-chart' }, head, empty({ title: 'Not enough months yet', text: 'The chart draws once there is a finished month to compare with.' }));
  const cols = hist.map(r => ({ label: monthShort(r.month) + (r.partial ? ' so far' : ''), sales: r.sales, spend: r.spend, partial: r.partial }));
  if (g) cols.push({ label: monthShort(m.month) + ' plan', sales: g.sales, spend: g.spend, plan: true });
  const short = v => money(v, { compact: true });
  return card({ class: 'mo-chart' }, head, lineChart({
    series: [
      { name: 'Sales', type: 'bar', tone: 'slate', values: cols.map(c => c.sales), labels: short, leadAt: g ? cols.length - 1 : null, dimAt: i => cols[i].partial },
      { name: 'Ad spend', values: cols.map(c => c.spend), points: true, end: short },
    ],
    labels: cols.map(c => c.label), height: 340, barWidth: 54, format: short,
    windowLabel: 'Monthly, ' + cols[0].label + ' to ' + cols[cols.length - 1].label,
    label: 'Sales and ad spend by month, with the plan as the last column',
    hover: i => { const c = cols[i]; return tipRows(c.label, [[c.plan ? 'Sales goal' : 'Sales', whole(c.sales), 'ink'], [c.plan ? 'Ad budget' : 'Ad spend', whole(c.spend), 'slate'],
      ok(c.sales) && c.spend > 0 ? ['MER', x(c.sales / c.spend)] : null]); },
  }));
}

/* Can it be reached? Returning customers arrive on their own; the rest has to be won with the ad budget. */
function reachCard(m) {
  const y = m.yard;
  if (!y) return null;
  const r = y.recent > 0 ? y.needs / y.recent : null;
  const verdict = r == null ? null : r <= 1.05 ? ['good', 'Within reach'] : r <= 1.25 ? ['warn', 'A stretch'] : ['bad', 'Out of reach at this rate'];
  const win = y.from && y.to ? `${dayLabel(y.from)} to ${dayLabel(y.to)}` : 'the last 28 days';
  return card({ title: 'Can it be reached?', note: `against ${win}`, flush: true, action: verdict ? statusDot(verdict[0], verdict[1]) : null },
    h('div', { class: 'mo-src' }, sourceLine(win, TW + ', new customers')),
    h('div', { class: 'mo-yard' },
      h('span', { class: 'need' }, h('small', null, dl('New customer ROAS the plan needs', 'new_customer_roas_plan')), h('span', { class: 'lx-big' }, x(y.needs))),
      h('span', { class: 'need' }, h('small', null, dl('Recent new customer ROAS', 'new_customer_roas')), h('span', { class: 'lx-big' }, x(y.recent))),
      gauge({ value: y.recent, max: Math.max(y.needs, y.recent) * 1.25, goal: y.needs, tone: verdict ? verdict[0] : '',
        ticks: [{ side: 'l', text: '0' }, { at: y.needs, text: 'plan needs ' + x(y.needs), on: true }] })),
    h('div', { class: 'mo-facts' },
      h('div', null, h('span', null, 'Returning customers should bring, on their own'), b(whole(y.returning))),
      h('div', null, h('span', null, 'That leaves, to win from new customers'), b(whole(y.new_needed)))));
}

function optionsCard(m, data) {
  if (!m.options.length || !m.basis || !ok(m.basis.sales)) return null;
  const g = m.goals, near = g && ok(m.growth) ? m.options.reduce((best, o) => (Math.abs(o.growth - m.growth) < Math.abs(best.growth - m.growth) ? o : best), m.options[0]) : null;
  const chosen = o => near === o && Math.abs(o.growth - m.growth) < 0.03;
  const base = m.basis.run_rate ? `${monthName(m.basis.month)} at its current pace` : m.basis.month ? `${monthName(m.basis.month)}` : 'the last full month';
  return card({ title: 'Other ways to set it', note: `${base} sales were ${whole(m.basis.sales)}`, flush: true, class: 'mo-opts' },
    h('div', { class: 'mo-src' }, sourceLine(monthName(m.month) + ' options, grown on ' + base, 'sales ' + TW + ', spend and profit worked out from that month')),
    table({
      cols: [
        { key: 'growth', label: dl('Growth on ' + (m.basis.month ? monthName(m.basis.month) : 'last month') + ' sales', { name: 'Growth', definition: `How much higher than ${base} sales this option sets the goal. Pick one with Change the plan.` }), class: 'name', render: o => h('span', { class: chosen(o) ? 'mo-chosen' : '' }, o.growth ? pct(o.growth, { signed: true }) : 'Hold level', chosen(o) ? ', closest to the plan' : '') },
        { key: 'sales', label: 'Sales goal', num: true, sortable: true, render: o => whole(o.sales) },
        { key: 'spend', label: 'Ad spend it takes', num: true, sortable: true, render: o => whole(o.spend) },
        { key: 'mer', label: 'MER', num: true, class: 'hide-sm', render: o => x(o.mer) },
        !data.profit_withheld && { key: 'profit', label: 'Profit after ads', num: true, class: 'hide-sm', render: o => whole(o.profit) },
      ].filter(Boolean),
      rows: m.options,
    }));
}

function historyCard(data) {
  const rows = [...(data.history || [])].reverse();
  if (!rows.length) return null;
  return card({ title: 'Past months', note: 'the same numbers as the chart above · ' + TW, flush: true },
    h('details', { class: 'mo-hist' }, h('summary', null, 'Show the table'), table({
      cols: [
        { key: 'month', label: 'Month', class: 'name', sortable: true, render: r => monthName(r.month) + (r.partial ? ', so far' : '') },
        { key: 'sales', label: 'Sales', num: true, sortable: true, render: r => whole(r.sales) },
        { key: 'spend', label: 'Ad spend', num: true, sortable: true, render: r => whole(r.spend) },
        { key: 'mer', label: dl('MER', 'mer'), num: true, class: 'strong', sortable: true, render: r => x(r.mer) },
        !data.profit_withheld && { key: 'profit', label: 'Profit after ads', num: true, class: 'hide-sm', render: r => whole(r.profit) },
      ].filter(Boolean),
      rows, sort: { key: 'month', dir: 'desc' },
    })));
}

function basedOn(m, ctx) {
  const parts = [];
  if (m.basis && m.basis.month && ok(m.basis.sales)) parts.push(`Growth is measured on ${monthName(m.basis.month)}${m.basis.run_rate ? ' at its current pace' : ''}, ${whole(m.basis.sales)} in sales.`);
  if (m.yard && m.yard.from && m.yard.to) parts.push(`Returning customers and the return on ads come from ${dayLabel(m.yard.from)} to ${dayLabel(m.yard.to)}.`);
  parts.push('The plan splits evenly across the days of the month. MER is whole store sales over all ad spend.');
  return helpBar([
    { title: 'What it is for', text: 'The plan agreed for the month: the sales goal, the ad budget, the MER that takes, and whether it can be reached.' },
    { title: 'What it rests on', text: parts.join(' ') },
  ], pageStamp(ctx));
}

/* ---------- the page ---------- */
const KEY = 'month.planMonth';

function draw(el, data, ctx) {
  const saved = ctx.settingNow(KEY, null);
  const m = data.months.find(r => r.month === saved) || data.months[0];
  ctx.setTitle(['What is the plan for ', em(monthName(m.month) + '?')], { eyebrow: 'This month' });
  ctx.askWindow = monthName(m.month);
  ctx.askContext = m.goals ? `${ctx.brand.name} plan for ${monthName(m.month)}: sales goal ${whole(m.goals.sales)}, ad budget ${whole(m.goals.spend)}, MER needed ${x(m.goals.mer)}${m.agreed_at ? ', agreed ' + dayLabel(m.agreed_at) : m.planned ? ', not agreed yet' : ', carried over'}.` + (m.yard ? ` New customer ROAS needed ${x(m.yard.needs)} against a recent ${x(m.yard.recent)}.` : '') : `${ctx.brand.name} has no plan set for ${monthName(m.month)}.`;
  const pick = data.months.length > 1
    ? segmented(data.months.map(r => ({ id: r.month, label: monthName(r.month) + (r.month === data.current ? ', in progress' : '') })), m.month, id => { ctx.saveSetting(KEY, id); draw(el, data, ctx); })
    : null;
  put(el, h('div', { class: 'mo' }, [
    basedOn(m, ctx),
    h('div', { class: 'mo-pick' }, pick, stateOf(m, ctx),
      ctx.isClient || !ctx.legacy ? null : button(m.goals ? 'Change the plan' : 'Set the plan', { href: ctx.legacy, icon: 'arrow', primary: !m.goals, title: 'Opens the plan editor in old Locus' })),
    heroBlock(m, data),
    chartCard(m, data),
    m.goals ? reachCard(m) : null,
    optionsCard(m, data),
    historyCard(data),
  ].filter(Boolean)));
}

export default {
  title: ['What is ', em('the plan?')],
  eyebrow: 'This month',
  stamp: false,                     /* Home's stamp with a refresh button sits in the help bar */
  ranges: false,                    // a plan is agreed per month; the month is picked inside the page

  load,

  render(el, data, ctx) {
    styles();
    if (!ctx.brand) return put(el, pickBrand('Plan'));
    if (!data || !data.months || !data.months.length) return put(el, empty({ title: 'No plan to show yet', text: 'This brand has no months to plan against yet.' }));
    draw(el, data, ctx);
  },
};
