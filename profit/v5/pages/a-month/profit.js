/* Agency > This month > Profit. Which brands made money after ads? One row per brand: sales, what was left after
   product and delivery costs (gross profit), ad spend, and what was left after the ads (contribution).
   Real: profit worker GET /api/overview (window gross_profit and cm, gated by the brand's cost check). */

import { put } from '../../kit.js';
import { helpBar, dl, rangeWords } from '../home/_biz.js';
import { tileRow, tipRows, pageStamp, TW } from '../month/_m.js';
import { h, em, money, pct, x, statusDot, pill, legend, lineChart, empty } from '../../kit.js';
import { style, world, readBrands, ok, sumOf, figures, brandRows, brandName, brandHref, quiet, shortDay } from '../a-today/_ag.js';

const load = ctx => readBrands(ctx, ctx.range, { cmp: 'none' });
const sample = async () => { const w = await world(); return { window: w.window, rules: w.rules, brands: w.brands, daily: w.daily }; };

function render(el, d, ctx) {
  style();
  if (!d || !d.brands || !d.brands.length) return put(el, empty({ title: 'No brands for these dates', text: 'Pick other dates, or add a brand in Agency settings.' }));
  const rows = d.brands.map(b => ({ ...b, margin: ok(b.profit) && b.sales > 0 ? b.profit / b.sales : null, href: brandHref(b.id, 'month', 'profit'), goTitle: 'Open ' + b.name + ' profit this month' }));
  const known = rows.filter(b => ok(b.profit));
  const sales = sumOf(known, b => b.sales), gross = sumOf(known, b => b.gross_profit), spend = sumOf(known, b => b.spend), profit = sumOf(known, b => b.profit);
  const losing = known.filter(b => b.profit < 0), thin = known.filter(b => b.profit >= 0 && b.margin < 0.08);
  const left = rows.filter(b => !ok(b.profit));

  const win = rangeWords(ctx, d.window);
  ctx.askWindow = win;
  const hero = tileRow([
    { label: h('span', null, dl('Left after ads', 'profit_after_ads'), ', all brands'), value: money(profit), sub: ok(profit) && sales > 0 ? `${pct(profit / sales)} of ${money(sales)} in sales` : 'no brand with trusted costs' },
    { label: dl('Left before ads', 'left_before_ads'), value: money(gross), sub: ok(gross) && sales > 0 ? `${pct(gross / sales)} of sales` : '' },
    { label: 'Ad spend', value: money(spend), source: 'All ad platforms', sub: `brands with trusted costs, MER ${spend > 0 && ok(sales) ? x(sales / spend) : 'no data'}` },
    { label: 'Brands losing money', value: String(losing.length), sub: losing.length ? losing.map(b => b.name).join(', ') : thin.length ? `${thin.length} close to zero` : `of ${known.length} with trusted costs`, source: TW + ' costs' },
  ], { window: win, source: TW + ' costs' });
  ctx.askContext = `Which brands made money after ads, ${win}: left after ads ${money(profit)} on ${money(sales)} sales across ${known.length} brands with trusted costs. ${losing.length ? 'Losing money: ' + losing.map(b => b.name).join(', ') + '.' : 'No brand losing money.'}`;

  /* one column per brand: what was left after ads, biggest first */
  const order = [...known].sort((a, b) => b.profit - a.profit);
  const chart = order.length > 1 ? h('section', { class: 'lx-card ag-chart' },
    h('div', { class: 'lx-chart-h' }, h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'Who brought in the most after ads?')), h('p', null, `Sales less product, delivery and ad costs · ${TW} costs`))),
    lineChart({ series: [{ type: 'bar', tone: 'brand', values: order.map(b => Math.max(0, b.profit)), dimAt: i => order[i].profit < 0, labels: (v, i) => money(order[i].profit, { compact: true }) }],
      labels: order.map(b => b.name.split(' ')[0]), height: 320, endLabels: false, yTicks: 3, format: v => money(v, { compact: true }), windowLabel: 'By brand, ' + win, label: 'What each brand kept after ads',
      hover: i => tipRows(order[i].name, [['Left after ads', money(order[i].profit), 'ink'], ['Sales', money(order[i].sales)], ['Ad spend', money(order[i].spend)]]) })) : null;

  const tone = r => !ok(r.profit) ? '' : r.profit < 0 ? 'bad' : r.margin < 0.08 ? 'warn' : 'good';
  const why = r => !r.store ? 'No sales source' : !r.costs_ok ? 'Costs not trusted yet' : 'No cost data';
  const state = r => !ok(r.profit) ? quiet(why(r)) : r.profit < 0 ? statusDot('bad', 'Losing money') : statusDot(tone(r), r.margin < 0.08 ? 'Close to zero' : 'Making money');
  const total = { total: true, store: true, name: 'All brands', sales, gross_profit: gross, spend, profit, margin: sales > 0 && ok(profit) ? profit / sales : null };
  const tbl = brandRows({
    title: 'Brand by brand', note: `${shortDay(d.window.from)} to ${shortDay(d.window.to)}`, sort: { key: 'profit', dir: 'asc' }, rows, total,
    cols: [
      { key: 'name', label: 'Brand', class: 'name', render: r => r.total ? r.name : brandName(r, ctx, r.href) },
      { key: 'sales', label: 'Sales', num: true, sortable: true, value: r => r.sales ?? -1, render: r => r.store ? money(r.sales) : quiet('no data') },
      { key: 'gross', label: dl('Left before ads', 'left_before_ads'), num: true, class: 'hide-md', render: r => ok(r.gross_profit) ? money(r.gross_profit) : quiet('no data') },
      { key: 'spend', label: 'Ad spend', num: true, class: 'hide-sm', render: r => money(r.spend) },
      { key: 'profit', label: dl('Left after ads', 'profit_after_ads'), num: true, sortable: true, class: 'strong', value: r => r.profit ?? 1e12, render: r => ok(r.profit) ? money(r.profit) : quiet('no data') },
      { key: 'margin', label: 'Of sales', num: true, class: 'hide-sm', render: r => ok(r.margin) ? pct(r.margin) : '' },
      { key: 'st', label: 'Status', render: r => r.total ? '' : state(r) },
    ],
    item: (r, isTotal) => ({ href: r.href, head: isTotal ? h('b', null, r.name) : brandName(r, ctx), tail: isTotal ? null : state(r),
      figs: [['Sales', r.store || isTotal ? money(r.sales) : quiet('no data')], ['Ad spend', money(r.spend)], ['Left after ads', ok(r.profit) ? money(r.profit) : quiet('no data')]] }),
  });
  const help = helpBar([
    { title: 'What it is for', text: 'Which brands made money after ads on these dates.' },
    { title: 'How it is counted', text: `Sales are store sales less tax (Triple Whale). Left before ads is sales less product, delivery, handling and payment fees. Left after ads also takes off all ad spend, before fixed costs.${left.length ? ` ${left.map(b => b.name).join(', ')} ${left.length === 1 ? 'is' : 'are'} left out of the totals: no sales source or costs not trusted yet.` : ''}` },
  ], pageStamp(ctx));
  put(el, h('div', { class: 'ag' }, help, hero, chart, tbl));
}

export default {
  title: ['Which brands ', em('made money?')],
  eyebrow: 'This month, all brands',
  stamp: false,                     /* Home's stamp with a refresh button sits in the help bar */
  load, sample, render,
};
