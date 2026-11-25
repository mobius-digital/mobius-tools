/* Agency > This month > Profit. Which brands made money after ads? One row per brand: sales, what was left after
   product and delivery costs (gross profit), ad spend, and what was left after the ads (contribution).
   Real: profit worker GET /api/overview (window gross_profit and cm, gated by the brand's cost check). */

import { put } from '../../kit.js';
import { h, em, money, pct, x, statusDot, pill, legend, lineChart, empty } from '../../kit.js';
import { style, world, readBrands, ok, sumOf, figures, brandRows, brandName, brandHref, quiet, shortDay } from '../a-today/_ag.js';

const load = ctx => readBrands(ctx, ctx.range, { cmp: 'none' });
const sample = async () => { const w = await world(); return { window: w.window, rules: w.rules, brands: w.brands, daily: w.daily }; };

function render(el, d, ctx) {
  style();
  if (!d || !d.brands || !d.brands.length) return put(el, empty({ title: 'No brands for these dates', text: 'Pick other dates, or add a brand in Agency settings.' }));
  const rows = d.brands.map(b => ({ ...b, margin: ok(b.profit) && b.sales > 0 ? b.profit / b.sales : null, href: brandHref(b.id, 'month', 'profit') }));
  const known = rows.filter(b => ok(b.profit));
  const sales = sumOf(known, b => b.sales), gross = sumOf(known, b => b.gross_profit), spend = sumOf(known, b => b.spend), profit = sumOf(known, b => b.profit);
  const losing = known.filter(b => b.profit < 0), thin = known.filter(b => b.profit >= 0 && b.margin < 0.08);
  const left = rows.filter(b => !ok(b.profit));

  const hero = figures([
    { label: 'Left after ads, all brands', value: money(profit), lead: true, sub: ok(profit) && sales > 0 ? `${pct(profit / sales)} of ${money(sales)} in sales` : 'no brand with trusted costs' },
    { label: 'After product costs', value: money(gross), sub: ok(gross) && sales > 0 ? `${pct(gross / sales)} of sales` : '' },
    { label: 'Ad spend', value: money(spend), sub: `brands with trusted costs, MER ${spend > 0 && ok(sales) ? x(sales / spend) : 'no data'}` },
    { label: 'Brands losing money', value: String(losing.length), sub: losing.length ? losing.map(b => b.name).join(', ') : thin.length ? `${thin.length} close to zero` : `of ${known.length} with trusted costs` },
  ]);

  /* one column per brand: what was left after ads, biggest first */
  const order = [...known].sort((a, b) => b.profit - a.profit);
  const chart = order.length > 1 ? h('section', { class: 'lx-card ag-chart' },
    h('div', { class: 'lx-chart-h' }, h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'Who brought in the most after ads?')), h('p', null, `${shortDay(d.window.from)} to ${shortDay(d.window.to)}, sales less product, delivery and ad costs`)),
      legend([{ name: 'Left after ads', square: true }])),
    lineChart({ series: [{ type: 'bar', values: order.map(b => Math.max(0, b.profit)), dimAt: i => order[i].profit < 0, labels: (v, i) => money(order[i].profit, { compact: true }) }],
      labels: order.map(b => b.name.split(' ')[0]), height: 320, endLabels: false, yTicks: 3, label: 'What each brand kept after ads',
      hover: i => [h('b', null, order[i].name), h('span', null, 'Left after ads ', h('b', null, money(order[i].profit))), h('span', null, 'Sales ', h('b', null, money(order[i].sales)))] })) : null;

  const tone = r => !ok(r.profit) ? '' : r.profit < 0 ? 'bad' : r.margin < 0.08 ? 'warn' : 'good';
  const why = r => !r.store ? 'No sales source' : !r.costs_ok ? 'Costs not trusted yet' : 'No cost data';
  const state = r => !ok(r.profit) ? quiet(why(r)) : r.profit < 0 ? pill('bad', 'Losing money') : statusDot(tone(r), r.margin < 0.08 ? 'Close to zero' : 'Making money');
  const total = { total: true, store: true, name: 'All brands', sales, gross_profit: gross, spend, profit, margin: sales > 0 && ok(profit) ? profit / sales : null };
  const tbl = brandRows({
    title: 'Brand by brand', note: `${shortDay(d.window.from)} to ${shortDay(d.window.to)}`, sort: { key: 'profit', dir: 'asc' }, rows, total,
    cols: [
      { key: 'name', label: 'Brand', class: 'name', render: r => r.total ? r.name : brandName(r, ctx, r.href) },
      { key: 'sales', label: 'Sales', num: true, sortable: true, value: r => r.sales ?? -1, render: r => r.store ? money(r.sales) : quiet('no data') },
      { key: 'gross', label: 'After product and delivery', num: true, class: 'hide-md', render: r => ok(r.gross_profit) ? money(r.gross_profit) : quiet('no data') },
      { key: 'spend', label: 'Ad spend', num: true, class: 'hide-sm', render: r => money(r.spend) },
      { key: 'profit', label: 'Left after ads', num: true, sortable: true, class: 'strong', value: r => r.profit ?? 1e12, render: r => ok(r.profit) ? money(r.profit) : quiet('no data') },
      { key: 'margin', label: 'Of sales', num: true, class: 'hide-sm', render: r => ok(r.margin) ? pct(r.margin) : '' },
      { key: 'st', label: 'Status', render: r => r.total ? '' : state(r) },
    ],
    item: (r, isTotal) => ({ href: r.href, head: isTotal ? h('b', null, r.name) : brandName(r, ctx), tail: isTotal ? null : state(r),
      figs: [['Sales', r.store || isTotal ? money(r.sales) : quiet('no data')], ['Ad spend', money(r.spend)], ['Left after ads', ok(r.profit) ? money(r.profit) : quiet('no data')]] }),
  });
  const foot = h('p', { class: 'lx-foot' }, `Sales are store sales less tax. Left after ads is sales less product, delivery, handling, fees and ad spend, before fixed costs.${left.length ? ` ${left.map(b => b.name).join(', ')} ${left.length === 1 ? 'is' : 'are'} left out of the totals: no sales source or costs not trusted yet.` : ''}`);
  put(el, h('div', { class: 'ag' }, hero, chart, tbl, foot));
}

export default {
  title: ['Which brands ', em('made money?')],
  eyebrow: 'This month, all brands',
  load, sample, render,
};
