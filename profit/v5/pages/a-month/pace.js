/* Agency > This month > Pace. Is every brand on pace: sales against the plan to date, ad spend against its plan, MER against goal.
   One chart (all brands' sales and ad spend a day), then one equal row per brand.
   A plan is agreed per month, so the plan columns only show on "This month". */

import { put } from '../../kit.js';
import { h, em, money, pct, x, statusDot, pill, delta, legend, lineChart, empty } from '../../kit.js';
import { style, world, readBrands, paceOf, against, ok, sumOf, figures, brandRows, brandName, brandHref, quiet, shortDay } from '../a-today/_ag.js';

const load = ctx => readBrands(ctx, ctx.range, { cmp: 'none' });
const sample = async () => { const w = await world(); return { window: w.window, rules: w.rules, brands: w.brands, daily: w.daily }; };

function render(el, d, ctx) {
  style();
  if (!d || !d.brands || !d.brands.length) return put(el, empty({ title: 'No brands for these dates', text: 'Pick other dates, or add a brand in Agency settings.' }));
  const planned = ctx.sample || ctx.range.preset === 'month';
  const rows = d.brands.map(b => ({ ...b, st: paceOf(b, d.rules.behind_pct), href: brandHref(b.id, 'month', 'pace') }));
  const stores = rows.filter(b => b.store), withPlan = stores.filter(b => ok(b.plan_sales));
  const sales = sumOf(stores, b => b.sales), spend = sumOf(rows, b => b.spend), storeSpend = sumOf(stores, b => b.spend);
  const planSales = sumOf(withPlan, b => b.plan_sales), salesOnPlan = sumOf(withPlan, b => b.sales);
  const planSpend = sumOf(rows, b => b.plan_spend), spendOnPlan = sumOf(rows.filter(b => ok(b.plan_spend)), b => b.spend);
  const behind = rows.filter(b => b.st.tone === 'bad');
  const gap = planned && planSales > 0 ? salesOnPlan / planSales - 1 : null, over = planned && planSpend > 0 ? spendOnPlan / planSpend - 1 : null;

  const hero = figures([
    { label: 'Sales, all brands', value: money(sales), lead: true, sub: gap == null ? `${stores.length} brands with a store` : [delta(gap), `${gap >= 0 ? 'ahead of' : 'behind'} plan ${money(planSales)}`] },
    { label: 'Ad spend, all brands', value: money(spend), sub: over == null ? 'every platform' : [delta(over, { bad: over > 0, plain: over <= 0 }), `${over > 0 ? 'over' : 'under'} plan ${money(planSpend)}`] },
    { label: 'MER, all stores', value: storeSpend > 0 && ok(sales) ? x(sales / storeSpend) : 'no data', sub: 'sales over ad spend, brands with a store' },
    planned && { label: 'Brands behind plan', value: String(behind.length), sub: behind.length ? behind.map(b => b.name).slice(0, 2).join(', ') + (behind.length > 2 ? ` and ${behind.length - 2} more` : '') : `of ${withPlan.length} with a plan` },
  ]);

  let chart = null;
  const dl = d.daily;
  if (dl && dl.dates.length > 1) {
    const bb = v => h('b', null, v);
    chart = h('section', { class: 'lx-card ag-chart' },
      h('div', { class: 'lx-chart-h' }, h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'Are sales keeping up with ad spend?')), h('p', null, 'by day, every brand added up')),
        legend([{ name: 'Sales', lead: true }, { name: 'Ad spend' }])),
      lineChart({ series: [{ name: 'Sales', lead: true, values: dl.sales }, { name: 'Ad spend', values: dl.spend }], labels: dl.dates.map(shortDay),
        endFormat: v => money(v), height: 340, label: `Sales and ad spend by day for every brand, ${shortDay(dl.dates[0])} to ${shortDay(dl.dates[dl.dates.length - 1])}`,
        hover: i => [bb(shortDay(dl.dates[i])), h('span', null, 'Sales ', bb(money(dl.sales[i]))), h('span', null, 'Ad spend ', bb(money(dl.spend[i])))] }));
  }

  const noStore = () => quiet('No sales source connected');
  const state = r => r.st.act ? pill(r.st.tone, r.st.text) : statusDot(r.st.tone, r.st.text);
  const merTone = r => !ok(r.mer) || !ok(r.goal_mer) ? '' : r.mer >= r.goal_mer ? 'good' : r.mer >= r.goal_mer * 0.8 ? 'warn' : 'bad';
  const total = { total: true, name: 'All brands', store: true, sales, spend, plan_sales: planSales, plan_spend: planSpend, mer: storeSpend > 0 ? sales / storeSpend : null, st: { pace: gap == null ? null : 1 + gap, tone: '' } };
  const table = brandRows({
    title: 'Brand by brand', note: `${shortDay(d.window.from)} to ${shortDay(d.window.to)}${planned ? ', against the plan to date' : ''}`,
    sort: { key: 'pace', dir: 'asc' }, rows, total,
    cols: [
      { key: 'name', label: 'Brand', class: 'name', render: r => r.total ? r.name : brandName(r, ctx, r.href) },
      { key: 'sales', label: 'Sales', num: true, sortable: true, class: 'strong', value: r => r.sales ?? -1, render: r => r.store ? money(r.sales) : noStore() },
      planned && { key: 'plan', label: 'Plan to date', num: true, class: 'hide-md', render: r => !r.store ? '' : ok(r.plan_sales) ? money(r.plan_sales) : quiet('no plan') },
      planned && { key: 'pace', label: 'Of plan', num: true, sortable: true, value: r => r.st.pace ?? 9, render: r => ok(r.st.pace) ? pct(r.st.pace) : '' },
      planned && { key: 'g', label: 'Against plan', width: 170, class: 'g hide-md', render: r => r.store && ok(r.plan_sales) ? against(r.sales, r.plan_sales, r.st.tone === 'off' ? '' : r.st.tone) : '' },
      { key: 'spend', label: 'Ad spend', num: true, sortable: true, value: r => r.spend ?? -1, render: r => [money(r.spend), planned && ok(r.plan_spend) && !r.total ? h('span', { class: 'sub' }, `plan ${money(r.plan_spend)}`) : null] },
      { key: 'mer', label: 'MER', num: true, sortable: true, value: r => r.mer ?? -1, render: r => !r.store ? quiet('no data') : [x(r.mer), ok(r.goal_mer) && !r.total ? h('span', { class: 'sub' }, `goal ${x(r.goal_mer)}`) : null] },
      { key: 'st', label: 'Status', render: r => r.total ? '' : planned ? state(r) : ok(r.goal_mer) && r.store ? statusDot(merTone(r), r.mer >= r.goal_mer ? 'At goal MER' : 'Under goal MER') : r.store ? '' : state(r) },
    ].filter(Boolean),
    item: (r, isTotal) => ({ href: r.href, head: isTotal ? h('b', null, r.name) : brandName(r, ctx), tail: isTotal || !planned ? null : state(r),
      figs: [['Sales', r.store ? money(r.sales) : noStore()], [planned ? 'Of plan' : 'Ad spend', planned ? (ok(r.st.pace) ? pct(r.st.pace) : quiet(r.store ? 'no plan' : '')) : money(r.spend)], ['MER', r.store ? x(r.mer) : quiet('no data')]],
      gauge: planned && r.store && ok(r.plan_sales) && !isTotal ? against(r.sales, r.plan_sales, r.st.tone === 'off' ? '' : r.st.tone) : null }),
  });

  const foot = h('p', { class: 'lx-foot' }, `Sales are store sales less tax. MER is whole store sales over all ad spend. ${planned ? `Plan to date is the month plan split evenly over the days so far. Behind plan means more than ${d.rules.behind_pct}% under it.` : 'The plan is agreed per month, so it shows on This month only.'}`);
  put(el, h('div', { class: 'ag' }, hero, chart, table, foot));
}

export default {
  title: ['Is every brand ', em('on pace?')],
  eyebrow: 'This month, all brands',
  load, sample, render,
};
