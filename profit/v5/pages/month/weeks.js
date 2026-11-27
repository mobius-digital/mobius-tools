/* Business > This month > Week by week: one row per week, so a bad day does not cause a panic and a bad week does.
   Four figures, one sentence, the average day in each week as one full width chart, then a row per week with
   sales, ad spend and MER against the goal.

   Weeks are seven day blocks counted from the first day of the dates in the page head (Nov 1 to 7, 8 to 14...),
   the same cut the old month screen used. The last block is often a part week, so the chart draws the average
   day in each week and a part week compares fairly. The plan is only compared on "This month".
   Where the live numbers come from (read only, profit worker):
     /api/client?act&from&to                     the store by day, the month's goals
     /api/overview?days=7&cmp=none&series=0      the cost check (the goal ROAS comes from the brand's own goal, _m.js brandGoals) */

import { put } from '../../kit.js';
import { askWhy, helpBar, dl, rangeWords } from '../home/_biz.js';
import { h, money, x, card, em, takeaway, delta, gauge, legend, lineChart, table, empty } from '../../kit.js';
import { ok, addDays, dayLabel, span, sum, soft, brandFacts, brandGoals, hasSource, grade, gradeDot, pickBrand, noSource, noDays, styles, tileRow, tipRows, pageStamp, TW } from './_m.js';
const b = v => h('b', null, v);

/* ---------- live data ---------- */
async function load(ctx) {
  if (!ctx.brand) return null;
  const id = encodeURIComponent(ctx.brand.id), w = ctx.range, sig = { signal: ctx.signal };
  const [cl, ov, goals] = await Promise.all([
    ctx.api(`/api/client?act=${id}&from=${w.from}&to=${w.to}`, sig),
    soft(ctx.api('/api/overview?days=7&cmp=none&series=0', sig)),
    brandGoals(ctx),
  ]);
  const rows = (cl.rows || []).filter(r => r.date >= w.from && r.date <= w.to);
  const facts = brandFacts(ov, cl, goals), g = cl.goals || {}, p = cl.plan || {};
  const dim = p.days_in_month || null;
  const planMer = ok(g.sales) && g.spend > 0 ? g.sales / g.spend : null;
  return {
    range: { from: w.from, to: w.to, preset: w.preset }, source: hasSource(cl),
    days: rows.map(r => ({ date: r.date, sales: r.sales ?? null, spend: r.spend ?? null })),
    /* a plan is agreed per month and splits evenly across its days, so it is only compared on "This month" */
    plan_day: w.preset === 'month' && dim && (ok(g.sales) || ok(g.spend)) ? { sales: ok(g.sales) ? g.sales / dim : null, spend: ok(g.spend) ? g.spend / dim : null } : null,
    goal_mer: facts.goalRoas || planMer,
  };
}

/* ---------- the weeks ---------- */
function weeksOf(data) {
  const days = data.days || [], out = [];
  if (!days.length) return out;
  const start = data.range && data.range.from && data.range.from <= days[0].date ? data.range.from : days[0].date;
  const by = Object.fromEntries(days.map(d => [d.date, d])), last = days[days.length - 1].date;
  for (let from = start; from <= last; from = addDays(from, 7)) {
    const got = [];
    for (let i = 0; i < 7; i++) { const r = by[addDays(from, i)]; if (r && (ok(r.sales) || ok(r.spend))) got.push(r); }
    if (!got.length) continue;
    const sales = sum(got, 'sales'), spend = sum(got, 'spend'), n = got.length, to = got[n - 1].date;
    const p = data.plan_day;
    out.push({
      from, to, n, full: n === 7, name: span(from, to), sales, spend,
      mer: spend > 0 && ok(sales) ? sales / spend : null,
      plan_sales: p && ok(p.sales) ? p.sales * n : null,
      sales_day: ok(sales) ? sales / n : null, spend_day: ok(spend) ? spend / n : null,
    });
  }
  return out;
}

function heroBlock(weeks, data, ctx) {
  const gm = data.goal_mer, full = weeks.filter(w => w.full);
  const best = [...weeks].filter(w => ok(w.sales_day)).sort((p, q) => q.sales_day - p.sales_day)[0];
  const cur = weeks[weeks.length - 1], prev = weeks[weeks.length - 2];
  const judged = weeks.filter(w => ok(w.mer)), at = judged.filter(w => gm && w.mer >= gm).length;
  const change = cur && prev && prev.sales_day > 0 && ok(cur.sales_day) ? cur.sales_day / prev.sales_day - 1 : null;
  const list = [
    /* goals and day counts ride in the label: beside a hero size figure they run into the next column on a phone */
    gm ? { label: h('span', null, 'Weeks at the ', dl('MER', 'mer'), ' goal ' + x(gm)), value: String(at), small: 'of ' + judged.length }
       : { label: 'Weeks', value: String(weeks.length), small: full.length + ' full', sub: 'no MER goal set' },
    best ? { label: 'Best week, sales a day', value: money(Math.round(best.sales_day)), sub: ok(best.mer) ? 'MER ' + x(best.mer) : null, window: best.name } : null,
    cur ? { label: cur.full ? 'Latest week, sales' : `This week so far, sales`, value: money(cur.sales),
      delta: change != null ? delta(change, change >= 0 ? {} : { bad: true }) : null, sub: change != null ? 'a day, on the week before' : null, window: cur.name + (cur.full ? '' : `, ${cur.n} of 7 days`) } : null,
    cur ? { label: h('span', null, dl('MER', 'mer'), gm ? ' this week, goal ' + x(gm) : ' this week'), value: x(cur.mer), sub: gradeDot(cur.mer, gm), window: cur.name } : null,
  ];
  return tileRow(list, { window: rangeWords(ctx, data.range), source: TW, cols: 4 });
}

/* One sentence, by rule: the two latest full weeks, sales against ad spend. */
function sentence(weeks) {
  const full = weeks.filter(w => w.full);
  if (full.length < 2) return null;
  const p = full[full.length - 2], q = full[full.length - 1];
  if (!(p.sales > 0) || !(p.spend > 0) || !ok(q.sales) || !ok(q.spend)) return null;
  const ds = q.sales / p.sales - 1, dc = q.spend / p.spend - 1;
  const word = (v, up, down) => (Math.abs(v) < 0.005 ? 'held level' : (v > 0 ? up : down) + ' ' + Math.round(Math.abs(v) * 100) + '%');
  return [`In the week of ${q.name}, sales `, b(word(ds, 'rose', 'fell')), ' on the week before', (ds >= 0) === (dc >= 0) ? ', and ad spend ' : ', while ad spend ', b(word(dc, 'rose', 'fell')), '.'];
}

function chartCard(weeks, data) {
  const p = data.plan_day;
  const head = h('div', { class: 'lx-chart-h' },
    h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'Is each week better than the last?')), h('p', null, 'Average day in each week, so a part week compares fairly · ' + TW)),
    legend([{ name: 'Sales a day', lead: true }, { name: 'Ad spend a day' }]));
  if (weeks.length < 2) return card({ class: 'mo-chart' }, head, empty({ title: 'One week so far', text: 'The chart draws once these dates hold two weeks. Pick a longer range to compare more.' }));
  const whole = v => money(Math.round(v));
  return card({ class: 'mo-chart' }, head, lineChart({
    series: [
      { name: 'Sales a day', values: weeks.map(w => w.sales_day), lead: true, points: true, labels: whole },
      { name: 'Ad spend a day', values: weeks.map(w => w.spend_day), points: true, end: whole },
    ],
    labels: weeks.map(w => w.name + (w.full ? '' : ` (${w.n} ${w.n === 1 ? 'day' : 'days'})`)),
    goal: p && ok(p.sales) ? { value: p.sales, label: 'plan ' + whole(p.sales) + ' a day', at: 'start' } : null,
    pad: 56, fill: true, height: 360, format: v => money(v, { compact: true }),
    windowLabel: 'Weekly, ' + span(weeks[0].from, weeks[weeks.length - 1].to),
    label: 'Average sales and ad spend a day, week by week',
    hover: i => { const w = weeks[i]; return tipRows(w.name + (w.full ? '' : ` (${w.n} of 7 days)`), [['Sales a day', money(Math.round(w.sales_day)), 'lead'], ['Ad spend a day', money(Math.round(w.spend_day)), 'slate'], ['Sales, week', money(w.sales)], ok(w.mer) ? ['MER', x(w.mer)] : null]); },
  }));
}

function weeksCard(weeks, data) {
  const gm = data.goal_mer, hasPlan = weeks.some(w => ok(w.plan_sales));
  const tSales = sum(weeks, 'sales'), tSpend = sum(weeks, 'spend'), tPlan = hasPlan ? sum(weeks, 'plan_sales') : null;
  const total = { total: true, name: 'All these dates', n: weeks.reduce((n, w) => n + w.n, 0), sales: tSales, spend: tSpend, plan_sales: tPlan, mer: tSpend > 0 && ok(tSales) ? tSales / tSpend : null };
  const tone = r => (r.total ? '' : (grade(r.mer, gm) || [])[0]);
  const bar = r => (ok(r.mer) && gm ? gauge({ value: r.mer, max: Math.max(gm * 1.2, ...weeks.map(w => w.mer || 0)), goal: gm, tone: tone(r), thin: true }) : null);
  const vsPlan = r => { if (!ok(r.plan_sales) || !(r.plan_sales > 0) || !ok(r.sales)) return ''; const d = r.sales / r.plan_sales - 1; return h('span', null, delta(d, d >= 0 ? {} : { bad: true }), ' vs plan'); };
  const daysText = r => (r.total ? r.n + ' days' : r.full ? '7 days' : `${r.n} of 7 days`);
  const stat = r => gradeDot(r.mer, gm) || '';
  const wide = h('div', { class: 'mo-wide' }, table({
    roomy: true, total,
    cols: [
      { key: 'name', label: 'Week', class: 'name', sortable: true, value: r => r.from, render: r => h('span', { class: 'mo-wk' }, h('b', null, r.name), h('small', null, daysText(r))) },
      { key: 'sales', label: 'Sales', num: true, sortable: true, render: r => money(r.sales) },
      hasPlan && { key: 'plan', label: 'Against plan', num: true, class: 'hide-md', render: vsPlan },
      { key: 'spend', label: 'Ad spend', num: true, sortable: true, render: r => money(r.spend) },
      { key: 'mer', label: dl('MER', 'mer'), num: true, class: 'strong', sortable: true, render: r => x(r.mer) },
      { key: 'bar', label: gm ? 'Against the MER goal ' + x(gm) : '', width: 240, render: r => { const g = bar(r); return g ? h('span', { class: 'mo-g' }, g) : ''; } },
      { key: 'st', label: 'Status', width: 110, render: stat },
    ].filter(Boolean),
    rows: weeks, sort: { key: 'name', dir: 'asc' },
  }));
  const cell = (label, v) => h('span', null, h('small', null, label), h('b', null, v));
  const narrow = h('div', { class: 'mo-list' }, [...weeks, total].map(r => h('div', { class: 'mo-item' + (r.total ? ' total' : '') },
    h('div', { class: 'mo-item-h' }, h('b', null, r.name), h('small', null, daysText(r)), stat(r) || null),
    h('div', { class: 'mo-figs' }, cell('Sales', money(r.sales)), cell('Ad spend', money(r.spend)), cell('MER', x(r.mer))),
    bar(r))));
  return card({ title: 'Every week', note: (hasPlan ? 'against the plan and the MER goal' : gm ? 'against the MER goal' : '') + (hasPlan || gm ? ' · ' : '') + 'sales ' + TW + ', spend from the ad platforms', flush: true }, wide, narrow);
}

const WORDS = { month: 'carried the month?', 'last-month': 'carried last month?', '7d': 'made the last 7 days?', '30d': 'carried the last 30 days?', custom: 'carried these dates?' };

export default {
  title: ctx => ['Which weeks ', em(WORDS[ctx.range.preset] || WORDS.month)],
  eyebrow: 'This month',
  stamp: false,                     /* Home's stamp with a refresh button sits in the help bar */

  load,

  render(el, data, ctx) {
    styles();
    if (!ctx.brand) return put(el, pickBrand('Week by week'));
    if (!data) return put(el, noDays());
    if (!data.source) return put(el, noSource(ctx, 'sales, ad spend and MER for every week'));
    const weeks = weeksOf(data);
    if (!weeks.length) return put(el, noDays());
    const say = sentence(weeks);
    const tS = sum(weeks, 'sales'), tC = sum(weeks, 'spend');
    ctx.askWindow = rangeWords(ctx, data.range);
    ctx.askContext = `${ctx.brand.name} week by week, ${ctx.askWindow}: ${weeks.length} weeks, sales ${money(tS)}, ad spend ${money(tC)}, MER ${x(tC > 0 ? tS / tC : null)}${data.goal_mer ? ' against a ' + x(data.goal_mer) + ' goal' : ''}. ` + weeks.map(w => `${w.name}: ${money(w.sales)} sales, MER ${x(w.mer)}`).join('; ') + '.';
    put(el, h('div', { class: 'mo' }, [
      helpBar([
        { title: 'What it is for', text: 'Which weeks carried these dates: sales and ad spend for each week, against the plan and the MER goal.' },
        { title: 'How it is counted', text: `Weeks are seven day blocks from ${dayLabel(weeks[0].from)}; a part week is compared on its average day. Sales are store sales less tax (Triple Whale). MER is whole store sales over all ad spend.` },
      ], pageStamp(ctx)),
      heroBlock(weeks, data, ctx),
      say ? takeaway(say, { action: ctx.isClient ? null : askWhy(ctx, 'Which weeks carried the month') }) : null,
      chartCard(weeks, data),
      weeksCard(weeks, data),
    ].filter(Boolean)));
  },
};
