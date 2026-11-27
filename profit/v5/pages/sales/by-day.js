/* Business > Sales > By day. "What did the store sell?"
   Live, one call: GET /api/hub/store on the profit worker (Triple Whale's store numbers: sales, orders, average
   order, discounts, returns, shipping, new against returning, visits, by day, with the window before).
   Sales here are the store's total sales less tax, the same line every other page uses. */

import { put } from '../../kit.js';
import { askWhy, helpBar, dl as defl, rangeWords } from '../home/_biz.js';
import { h, em, card, delta, takeaway, button, table, legend, lineChart, skeleton, money, sourceLine } from '../../kit.js';
import { tileRow, tipRows, pageStamp, VISITS_THAT_BUY, TW } from '../month/_m.js';
import { ok, usd, move, shortDate, noteAt, css, head, barCell, split, notConnected, num, pct, showMore } from '../email/_em.js';

function shape(ctx, b) {
  const c = b.cur || {}, p = b.prev || {};
  /* gross that runs far above what the store took usually holds wholesale or draft orders: the steps would mislead */
  const bridge = c.gross && c.revenue && c.gross < (c.revenue + (c.discounts || 0)) * 1.6 && c.gross < c.revenue * 2;
  return {
    connected: (ok(c.revenue) && c.revenue > 0) || c.orders > 0, range: { from: ctx.range.from, to: ctx.range.to },
    totals: { sales: c.revenue, sales_prev: p.revenue, orders: c.orders, orders_prev: p.orders, aov: c.aov, aov_prev: p.aov, visits: c.sessions,
      conversion: c.sessions ? c.orders / c.sessions : null, conversion_prev: p.sessions ? p.orders / p.sessions : null, units: c.units,
      gross: bridge ? c.gross : null, discounts: c.discounts, returns: c.returns, shipping: c.shipping,
      new_sales: c.new_revenue, returning_sales: c.returning_revenue, new_orders: c.new_orders, returning_orders: c.returning_orders },
    days: (b.series || []).map(r => ({ date: r.date, sales: r.revenue, orders: r.orders, aov: r.aov, new_share: r.new_share, discounts: r.discounts, visits: r.sessions })),
    prev_days: (b.prev_series || []).map(r => ({ date: r.date, sales: r.revenue })), note: null,
  };
}

function figures(d, ctx) {
  const t = d.totals || {}, dS = move(t.sales, t.sales_prev), dO = move(t.orders, t.orders_prev), dA = move(t.aov, t.aov_prev), dC = move(t.conversion, t.conversion_prev);
  const dl = v => (ok(v) && Math.abs(v) >= 0.005 ? delta(v, { bad: v < 0 }) : null);
  const days = d.days || [];
  return tileRow([
    { label: 'Sales', value: usd(t.sales), unit: 'money', delta: dl(dS), sub: ok(t.sales_prev) ? 'vs ' + usd(t.sales_prev) + ' before' : null, spark: days.map(r => r.sales) },
    { label: 'Orders', value: ok(t.orders) ? num(t.orders) : 'no data', delta: dl(dO), sub: ok(t.units) ? num(t.units) + ' units' : null, spark: days.map(r => r.orders) },
    { label: 'Average order', value: ok(t.aov) ? money(t.aov, { cents: true }) : 'no data', delta: dl(dA), sub: ok(t.aov_prev) ? 'vs ' + money(t.aov_prev, { cents: true }) + ' before' : null, spark: days.map(r => r.aov), sparkFormat: v => money(v, { cents: true }) },
    { label: defl('Visits that buy', VISITS_THAT_BUY), value: ok(t.conversion) ? pct(t.conversion, { digits: 2 }) : 'no data', delta: dl(dC), source: TW + ' pixel visits, ' + TW + ' orders',
      sub: ok(t.visits) ? `${num(t.orders)} orders from ${num(t.visits)} visits` : 'needs the Triple Whale pixel', spark: days.map(r => (r.visits ? r.orders / r.visits : null)), sparkFormat: v => pct(v, { digits: 2 }) },
  ], { cols: 4, window: rangeWords(ctx, d.range), source: TW, labels: days.map(r => shortDate(r.date)) });
}

function verdict(d, ctx) {
  const t = d.totals || {}, days = (d.days || []).filter(r => ok(r.sales));
  if (!ok(t.sales) || !days.length) return null;
  const b = v => h('b', null, v), best = days.reduce((m, r) => (r.sales > m.sales ? r : m), days[0]);
  /* the tiles carry the total and the change: the sentence adds only the best day */
  const parts = ['The best day was ', b(shortDate(best.date)), ' at ', b(usd(best.sales)), ok(best.orders) ? ` from ${num(best.orders)} orders` : '', '.'];
  return takeaway(parts, { action: ctx.isClient ? null : askWhy(ctx, 'What did the store sell') });
}

function chartCard(d, ctx) {
  const days = d.days || [], prev = d.prev_days || [];
  if (days.length < 2) return null;
  const b = v => h('b', null, v), hasPrev = prev.length === days.length && prev.some(r => ok(r.sales));
  return card({ class: 'em-chart' },
    head('Sales by day', 'Store sales, less tax · ' + TW, legend([{ name: 'Sales', lead: true }, hasPrev && { name: `The ${days.length} days before`, dashed: true }])),
    lineChart({
      series: [{ name: 'Sales', lead: true, values: days.map(r => r.sales) }, hasPrev && { name: 'Before', dashed: true, values: prev.map(r => r.sales) }],
      labels: days.map(r => shortDate(r.date)), note: noteAt(days, d.note), format: v => money(v, { compact: true }), height: 360, phoneHeight: 300,
      windowLabel: 'Daily, ' + rangeWords(ctx, { from: days[0].date, to: days[days.length - 1].date }),
      label: 'Store sales by day' + (hasPrev ? ', against the days before' : ''),
      hover: i => tipRows(shortDate(days[i].date), [['Sales', usd(days[i].sales), 'lead'], ok(days[i].orders) ? ['Orders', num(days[i].orders)] : null,
        hasPrev && ok(prev[i].sales) ? [shortDate(prev[i].date || days[i].date) === shortDate(days[i].date) ? 'The same day before' : 'Before, ' + shortDate(prev[i].date), usd(prev[i].sales), 'dash'] : null]),
    }));
}

function stepsCard(d) {
  const t = d.totals || {};
  if (!ok(t.gross) || !ok(t.sales)) return null;
  const steps = [['Gross sales', t.gross, 'base'], ['Discounts', -(t.discounts || 0), 'cut'], ['Returns', -(t.returns || 0), 'cut'], ['Shipping charged', t.shipping || 0, 'add'], ['Sales', t.sales, 'tot']];
  const max = Math.max(t.gross, t.sales) * 1.02;
  let run = 0;
  const rows = steps.map(([name, v, kind]) => {
    let l, w;
    if (kind === 'base' || kind === 'tot') { l = 0; w = v / max * 100; run = v; }
    else if (v < 0) { l = (run + v) / max * 100; w = -v / max * 100; run += v; }
    else { l = run / max * 100; w = v / max * 100; run += v; }
    return h('div', { class: kind === 'tot' ? 'tot' : '' }, h('span', null, name),
      h('span', { class: 'trk' }, h('i', { class: kind === 'cut' ? 'cut' : '', style: { '--l': l.toFixed(1) + '%', '--w': Math.max(0.6, w).toFixed(1) + '%' } })),
      h('span', { class: 'n' }, (v < 0 ? '-' : '') + usd(Math.abs(v)), kind === 'cut' && t.gross ? h('small', null, pct(-v / t.gross, { digits: 1 })) : null));
  });
  return card({ title: 'From gross sales to sales', action: sourceLine(null, TW), note: ok(t.discounts) ? `discounts took ${pct(t.discounts / t.gross, { digits: 1 })} of gross` : null }, h('div', { class: 'em-steps' }, rows));
}

function newCard(d) {
  const t = d.totals || {};
  if (!ok(t.new_sales) || !ok(t.returning_sales) || !(t.new_sales + t.returning_sales > 0)) return null;
  const all = t.new_sales + t.returning_sales, share = t.new_sales / all;
  const side = (name, color, sales, orders) => h('div', null, h('h4', null, h('em', { style: { '--c': color } }), name),
    h('p', null, h('span', null, 'Sales'), h('b', null, usd(sales))),
    h('p', null, h('span', null, 'Orders'), h('b', null, ok(orders) ? num(orders) : 'no data')),
    h('p', null, h('span', null, 'Average order'), h('b', null, ok(orders) && orders > 0 ? money(sales / orders, { cents: true }) : 'no data')),
    h('p', null, h('span', null, 'Share of sales'), h('b', null, pct(sales / all))));
  return card({ title: 'New against returning', action: sourceLine(null, TW), note: `${pct(share)} of sales came from first orders` },
    split([
      { name: 'New customers', value: t.new_sales, text: '', color: 'var(--ink)' },
      { name: 'Returning', value: t.returning_sales, text: '', color: 'var(--icon)' },
    ], 'Sales from new customers against returning customers')[0],
    h('div', { class: 'em-sides' }, side('New customers', 'var(--ink)', t.new_sales, t.new_orders), side('Returning', 'var(--icon)', t.returning_sales, t.returning_orders)));
}

function daysCard(d) {
  const rows = (d.days || []).slice().sort((a, b) => b.date.localeCompare(a.date)), max = Math.max(...rows.map(r => r.sales || 0), 1);
  const cv = r => (r.visits ? r.orders / r.visits : null);
  const build = list => table({ rows: list, sort: { key: 'date', dir: 'desc' }, cols: [
      { key: 'date', label: 'Day', sortable: true, render: r => new Date(r.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) },
      { key: 'orders', label: 'Orders', num: true, sortable: true, render: r => (ok(r.orders) ? num(r.orders) : '') },
      { key: 'aov', label: 'Average order', num: true, sortable: true, class: 'hide-sm', render: r => (ok(r.aov) ? money(r.aov, { cents: true }) : '') },
      { key: 'new_share', label: defl('From new customers', 'from_new'), num: true, sortable: true, class: 'hide-md', render: r => (ok(r.new_share) ? pct(r.new_share) : '') },
      { key: 'discounts', label: 'Discounts', num: true, sortable: true, class: 'hide-md', render: r => (ok(r.discounts) ? usd(r.discounts) : '') },
      { key: 'cv', label: defl('Visits that buy', VISITS_THAT_BUY), num: true, sortable: true, class: 'hide-sm', value: cv, render: r => (ok(cv(r)) ? pct(cv(r), { digits: 2 }) : '') },
      { key: 'sales', label: 'Sales', num: true, sortable: true, render: r => barCell(h('span', { class: 'strong' }, usd(r.sales)), (r.sales || 0) / max) },
    ] });
  return card({ title: 'Every day', note: (rows.length > 7 ? 'the latest 7 first · ' : '') + TW, flush: true, class: 'em-flush' }, showMore(rows, 7, build, 'days'));
}

export default {
  title: ['What did the store ', em('sell?')],
  eyebrow: 'Sales',
  stamp: false,                     /* Home's stamp with a refresh button sits in the help bar */

  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    const r = await ctx.api(`/api/hub/store?act=${encodeURIComponent(ctx.brand.id)}&from=${ctx.range.from}&to=${ctx.range.to}`, { signal: ctx.signal });
    return shape(ctx, (r.brands || [])[0] || {});
  },

  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('chart'), skeleton('row', 6)); },

  render(el, d, ctx) {
    css();
    d = d || {};
    if (d.connected === false) {
      put(el, notConnected(ctx, { title: 'No sales source connected',
        text: 'Sales show here once the store is connected.',
        teamText: 'Sales come from the store through Triple Whale. Set the brand\'s Triple Whale shop in Brand settings, Integrations, and they show here.' }));
      return;
    }
    const two = [stepsCard(d), newCard(d)].filter(Boolean), t = d.totals || {};
    ctx.askWindow = rangeWords(ctx, d.range);
    ctx.askContext = `${ctx.brand.name} store sales, ${ctx.askWindow} (${TW}): sales ${usd(t.sales)}${ok(t.sales_prev) ? ' against ' + usd(t.sales_prev) + ' the days before' : ''}, ${num(t.orders)} orders, average order ${money(t.aov, { cents: true })}.`;
    put(el, ...[
      helpBar([
        { title: 'What it is for', text: 'What the store sold on the dates at the top: sales, orders, the average order and how many visits bought, day by day.' },
        { title: 'Where the numbers come from', text: 'Triple Whale. Sales are the store\'s total sales less tax. Visits are counted by the Triple Whale pixel; Full funnel counts them with Google Analytics, so its Visits that buy can differ a little.The change on each figure is against the same number of days just before.' },
      ], h('span', { class: 'bz-chip' }, rangeWords(ctx, d.range)), pageStamp(ctx)),
      figures(d, ctx),
      verdict(d, ctx),
      chartCard(d, ctx),
      two.length === 2 ? h('div', { class: 'em-two' }, two) : two[0],
      daysCard(d),
    ].filter(Boolean));
  },
};
