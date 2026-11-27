/* Agency > This month > Pace. Is every brand on pace: sales against the plan to date, ad spend against its plan, MER against goal.
   One chart (all brands' sales and ad spend a day), then one equal row per brand.
   A plan is agreed per month, so the plan columns only show on "This month". */

import { put } from '../../kit.js';
import { helpBar, dl, rangeWords } from '../home/_biz.js';
import { tileRow, tipRows, pageStamp, TW } from '../month/_m.js';
import { h, em, money, pct, x, statusDot, pill, delta, legend, lineChart, empty } from '../../kit.js';
import { style, world, readBrands, paceOf, against, ok, sumOf, figures, brandRows, brandName, brandHref, quiet, shortDay } from '../a-today/_ag.js';

const load = ctx => readBrands(ctx, ctx.range, { cmp: 'none' });
const sample = async () => { const w = await world(); return { window: w.window, rules: w.rules, brands: w.brands, daily: w.daily }; };

function render(el, d, ctx) {
  style();
  if (!d || !d.brands || !d.brands.length) return put(el, empty({ title: 'No brands for these dates', text: 'Pick other dates, or add a brand in Agency settings.' }));
  const planned = ctx.sample || ctx.range.preset === 'month';
  const rows = d.brands.map(b => ({ ...b, st: paceOf(b, d.rules.behind_pct), href: brandHref(b.id, 'month', 'pace'), goTitle: 'Open ' + b.name + ' pace this month' }));
  const stores = rows.filter(b => b.store), withPlan = stores.filter(b => ok(b.plan_sales));
  const sales = sumOf(stores, b => b.sales), spend = sumOf(rows, b => b.spend), storeSpend = sumOf(stores, b => b.spend);
  const planSales = sumOf(withPlan, b => b.plan_sales), salesOnPlan = sumOf(withPlan, b => b.sales);
  const planSpend = sumOf(rows, b => b.plan_spend), spendOnPlan = sumOf(rows.filter(b => ok(b.plan_spend)), b => b.spend);
  const behind = rows.filter(b => b.st.tone === 'bad');
  const gap = planned && planSales > 0 ? salesOnPlan / planSales - 1 : null, over = planned && planSpend > 0 ? spendOnPlan / planSpend - 1 : null;

  const win = rangeWords(ctx, d.window);
  ctx.askWindow = win;
  const hero = tileRow([
    { label: 'Sales, all brands', value: money(sales), sub: gap == null ? `${stores.length} brands with a store` : [delta(gap), `${gap >= 0 ? 'ahead of' : 'behind'} plan ${money(planSales)}`] },
    { label: 'Ad spend, all brands', value: money(spend), source: 'All ad platforms', sub: over == null ? 'every platform' : [delta(over, { bad: over > 0, plain: over <= 0 }), `${over > 0 ? 'over' : 'under'} plan ${money(planSpend)}`] },
    { label: h('span', null, dl('Store MER', 'mer'), ', all stores'), value: storeSpend > 0 && ok(sales) ? x(sales / storeSpend) : 'no data', sub: 'sales over ad spend, brands with a store' },
    planned && { label: 'Brands behind plan', value: String(behind.length), sub: behind.length ? behind.map(b => b.name).slice(0, 2).join(', ') + (behind.length > 2 ? ` and ${behind.length - 2} more` : '') : `of ${withPlan.length} with a plan`, source: 'against the plan to date' },
  ], { window: win, source: TW });
  ctx.askContext = `Every brand's pace, ${win}: sales ${money(sales)}, ad spend ${money(spend)}${gap != null ? `, ${gap >= 0 ? 'ahead of' : 'behind'} plan by ${pct(Math.abs(gap))}` : ''}. ${behind.length ? 'Behind plan: ' + behind.map(b => b.name).join(', ') + '.' : 'No brand behind plan.'}`;

  let chart = null;
  const daily = d.daily;
  if (daily && daily.dates.length > 1) {
    const bb = v => h('b', null, v);
    chart = h('section', { class: 'lx-card ag-chart' },
      h('div', { class: 'lx-chart-h' }, h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'Are sales keeping up with ad spend?')), h('p', null, 'By day, every brand added up · sales ' + TW + ', spend from the ad platforms')),
        legend([{ name: 'Sales', lead: true }, { name: 'Ad spend' }])),
      lineChart({ series: [{ name: 'Sales', lead: true, values: daily.sales }, { name: 'Ad spend', values: daily.spend }], labels: daily.dates.map(shortDay),
        endFormat: v => money(v), format: v => money(v, { compact: true }), windowLabel: 'Daily, ' + rangeWords(ctx, { from: daily.dates[0], to: daily.dates[daily.dates.length - 1] }), height: 340, label: `Sales and ad spend by day for every brand, ${shortDay(daily.dates[0])} to ${shortDay(daily.dates[daily.dates.length - 1])}`,
        hover: i => tipRows(shortDay(daily.dates[i]), [['Sales', money(daily.sales[i]), 'lead'], ['Ad spend', money(daily.spend[i]), 'slate'], daily.spend[i] > 0 ? ['MER', x(daily.sales[i] / daily.spend[i])] : null]) }));
  }

  const noStore = () => quiet('No sales source connected');
  /* one look for every state in the column: a dot */
  const state = r => statusDot(r.st.tone === 'off' ? '' : r.st.tone, r.st.text);
  const merTone = r => !ok(r.mer) || !ok(r.goal_mer) ? '' : r.mer >= r.goal_mer ? 'good' : r.mer >= r.goal_mer * 0.8 ? 'warn' : 'bad';
  const total = { total: true, name: 'All brands', store: true, sales, spend, plan_sales: planSales, plan_spend: planSpend, mer: storeSpend > 0 ? sales / storeSpend : null, st: { pace: gap == null ? null : 1 + gap, tone: '' } };
  const table = brandRows({
    title: 'Brand by brand', note: `${shortDay(d.window.from)} to ${shortDay(d.window.to)}${planned ? ', against the plan to date' : ''}`,
    sort: { key: 'pace', dir: 'asc' }, rows, total,
    cols: [
      { key: 'name', label: 'Brand', class: 'name', render: r => r.total ? r.name : brandName(r, ctx, r.href) },
      { key: 'sales', label: 'Sales', num: true, sortable: true, class: 'strong', value: r => r.sales ?? -1, render: r => !r.store ? noStore() : [money(r.sales), planned && !r.total ? h('span', { class: 'sub' }, ok(r.plan_sales) ? `plan to date ${money(r.plan_sales)}` : r.no_goal ? `No goal set for ${r.no_goal}` : 'no plan') : null] },
      planned && { key: 'pace', label: dl('Of plan', 'plan_to_date'), num: true, sortable: true, value: r => r.st.pace ?? 9, render: r => ok(r.st.pace) ? pct(r.st.pace) : '' },
      planned && { key: 'g', label: 'Against plan', width: 170, class: 'g hide-md', render: r => r.store && ok(r.plan_sales) ? against(r.sales, r.plan_sales, r.st.tone === 'off' ? '' : r.st.tone) : '' },
      { key: 'spend', label: 'Ad spend', num: true, sortable: true, value: r => r.spend ?? -1, render: r => [money(r.spend), planned && ok(r.plan_spend) && !r.total ? h('span', { class: 'sub' }, `plan ${money(r.plan_spend)}`) : null] },
      { key: 'mer', label: dl('MER', 'mer'), num: true, sortable: true, value: r => r.mer ?? -1, render: r => !r.store ? quiet('no data') : [x(r.mer), ok(r.goal_mer) && !r.total ? h('span', { class: 'sub' }, `goal ${x(r.goal_mer)}`) : null] },
      { key: 'st', label: 'Status', render: r => r.total ? '' : planned ? state(r) : ok(r.goal_mer) && r.store ? statusDot(merTone(r), r.mer >= r.goal_mer ? 'At goal MER' : 'Under goal MER') : r.store ? '' : state(r) },
    ].filter(Boolean),
    item: (r, isTotal) => ({ href: r.href, head: isTotal ? h('b', null, r.name) : brandName(r, ctx), tail: isTotal || !planned ? null : state(r),
      figs: [['Sales', r.store ? money(r.sales) : noStore()], [planned ? 'Of plan' : 'Ad spend', planned ? (ok(r.st.pace) ? pct(r.st.pace) : quiet(r.store ? (r.no_goal ? 'no goal' : 'no plan') : '')) : money(r.spend)], ['MER', r.store ? x(r.mer) : quiet('no data')]],
      gauge: planned && r.store && ok(r.plan_sales) && !isTotal ? against(r.sales, r.plan_sales, r.st.tone === 'off' ? '' : r.st.tone) : null }),
  });

  const help = helpBar([
    { title: 'What it is for', text: 'Is every brand on pace: sales against the plan to date, ad spend against its plan, store MER against goal.' },
    { title: 'How it is counted', text: `Sales are store sales less tax (Triple Whale). MER is whole store sales over all ad spend. ${planned ? `Plan to date is the month plan split evenly over the days so far. Behind plan means more than ${d.rules.behind_pct}% under it.` : 'The plan is agreed per month, so it shows on This month only.'} Click a brand to open its own Pace page.` },
  ], pageStamp(ctx));
  put(el, h('div', { class: 'ag' }, help, hero, chart, table));
}

export default {
  title: ['Is every brand ', em('on pace?')],
  eyebrow: 'This month, all brands',
  stamp: false,                     /* Home's stamp with a refresh button sits in the help bar */
  load, sample, render,
};
