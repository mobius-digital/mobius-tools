/* Business > Sales > By day. "What did the store sell?"
   Live, one call: GET /api/hub/store on the profit worker (Triple Whale's store numbers: sales, orders, average
   order, discounts, returns, shipping, new against returning, visits, by day, with the window before).
   Sales here are the store's total sales less tax, the same line every other page uses. */

import { put } from '../../kit.js';
import { h, em, card, kpi, kpis, delta, takeaway, button, table, legend, lineChart, skeleton, money } from '../../kit.js';
import { ok, usd, move, shortDate, noteAt, css, head, barCell, split, notConnected, num, pct } from '../email/_em.js';

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

function figures(d) {
  const t = d.totals || {}, dS = move(t.sales, t.sales_prev), dO = move(t.orders, t.orders_prev), dA = move(t.aov, t.aov_prev), dC = move(t.conversion, t.conversion_prev);
  const dl = v => (ok(v) && Math.abs(v) >= 0.005 ? delta(v, { bad: v < 0 }) : null);
  const el = kpis([
    kpi({ label: 'Sales', size: 'lg', value: usd(t.sales), delta: dl(dS), sub: ok(t.sales_prev) ? 'was ' + usd(t.sales_prev) : null, spark: (d.days || []).map(r => r.sales) }),
    kpi({ label: 'Orders', size: 'lg', value: ok(t.orders) ? num(t.orders) : 'no data', delta: dl(dO), sub: ok(t.units) ? num(t.units) + ' units' : null, spark: (d.days || []).map(r => r.orders) }),
    kpi({ label: 'Average order', size: 'lg', value: ok(t.aov) ? money(t.aov, { cents: true }) : 'no data', delta: dl(dA), sub: ok(t.aov_prev) ? 'was ' + money(t.aov_prev, { cents: true }) : null }),
    kpi({ label: 'Conversion rate', size: 'lg', value: ok(t.conversion) ? pct(t.conversion, { digits: 2 }) : 'no data', delta: dl(dC),
      sub: ok(t.visits) ? `${num(t.orders)} orders from ${num(t.visits)} visits` : 'needs the Triple Whale pixel' }),
  ], { cols: 4 });
  el.classList.add('em-kpis');
  return el;
}

function verdict(d, ctx) {
  const t = d.totals || {}, days = (d.days || []).filter(r => ok(r.sales));
  if (!ok(t.sales) || !days.length) return null;
  const b = v => h('b', null, v), dS = move(t.sales, t.sales_prev), best = days.reduce((m, r) => (r.sales > m.sales ? r : m), days[0]);
  const parts = ['The store sold ', b(usd(t.sales))];
  if (ok(dS) && Math.abs(dS) >= 0.005) parts.push(', ', dS > 0 ? 'up ' : 'down ', b(pct(Math.abs(dS))), ` on the ${days.length} days before`);
  parts.push('. The best day was ', b(shortDate(best.date)), ' at ', b(usd(best.sales)), '.');
  return takeaway(parts, { action: ctx.isClient ? null : button('Ask why', { href: ctx.href('ask', 'index') }) });
}

function chartCard(d) {
  const days = d.days || [], prev = d.prev_days || [];
  if (days.length < 2) return null;
  const b = v => h('b', null, v), hasPrev = prev.length === days.length && prev.some(r => ok(r.sales));
  return card({ class: 'em-chart' },
    head('Sales by day', 'Store sales, less tax', legend([{ name: 'Sales', lead: true }, hasPrev && { name: `The ${days.length} days before`, dashed: true }])),
    lineChart({
      series: [{ name: 'Sales', lead: true, values: days.map(r => r.sales) }, hasPrev && { name: 'Before', dashed: true, values: prev.map(r => r.sales) }],
      labels: days.map(r => shortDate(r.date)), note: noteAt(days, d.note), format: v => money(v, { compact: true }), height: 360, phoneHeight: 300,
      label: 'Store sales by day' + (hasPrev ? ', against the days before' : ''),
      hover: i => [b(shortDate(days[i].date)), h('span', null, 'Sales ', b(usd(days[i].sales))), ok(days[i].orders) && h('span', null, 'Orders ', b(num(days[i].orders))),
        hasPrev && ok(prev[i].sales) && h('span', null, 'Before ', b(usd(prev[i].sales)))],
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
  return card({ title: 'From gross sales to sales', note: ok(t.discounts) ? `discounts took ${pct(t.discounts / t.gross, { digits: 1 })} of gross` : null }, h('div', { class: 'em-steps' }, rows));
}

function newCard(d) {
  const t = d.totals || {};
  if (!ok(t.new_sales) || !ok(t.returning_sales) || !(t.new_sales + t.returning_sales > 0)) return null;
  const share = t.new_sales / (t.new_sales + t.returning_sales);
  return card({ title: 'New against returning', note: `${pct(share)} of sales came from first orders` },
    split([
      { name: 'New customers' + (ok(t.new_orders) ? `, ${num(t.new_orders)} orders` : ''), value: t.new_sales, text: usd(t.new_sales), color: 'var(--ink)' },
      { name: 'Returning' + (ok(t.returning_orders) ? `, ${num(t.returning_orders)} orders` : ''), value: t.returning_sales, text: usd(t.returning_sales), color: '#C9CED9' },
    ], 'Sales from new customers against returning customers'));
}

function daysCard(d) {
  const rows = d.days || [], max = Math.max(...rows.map(r => r.sales || 0), 1);
  const cv = r => (r.visits ? r.orders / r.visits : null);
  return card({ title: 'Every day', note: 'tap a column to sort', flush: true, class: 'em-flush' },
    table({ rows, sort: { key: 'date', dir: 'desc' }, cols: [
      { key: 'date', label: 'Day', sortable: true, render: r => new Date(r.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) },
      { key: 'orders', label: 'Orders', num: true, sortable: true, render: r => (ok(r.orders) ? num(r.orders) : '') },
      { key: 'aov', label: 'Average order', num: true, sortable: true, class: 'hide-sm', render: r => (ok(r.aov) ? money(r.aov, { cents: true }) : '') },
      { key: 'new_share', label: 'From new customers', num: true, sortable: true, class: 'hide-md', render: r => (ok(r.new_share) ? pct(r.new_share) : '') },
      { key: 'discounts', label: 'Discounts', num: true, sortable: true, class: 'hide-md', render: r => (ok(r.discounts) ? usd(r.discounts) : '') },
      { key: 'cv', label: 'Conversion', num: true, sortable: true, class: 'hide-sm', value: cv, render: r => (ok(cv(r)) ? pct(cv(r), { digits: 2 }) : '') },
      { key: 'sales', label: 'Sales', num: true, sortable: true, render: r => barCell(h('span', { class: 'strong' }, usd(r.sales)), (r.sales || 0) / max) },
    ] }));
}

export default {
  title: ['What did the store ', em('sell?')],
  eyebrow: 'Sales',

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
    const two = [stepsCard(d), newCard(d)].filter(Boolean);
    put(el, ...[
      h('section', { class: 'lx-hero line' }, figures(d)),
      verdict(d, ctx),
      chartCard(d),
      two.length === 2 ? h('div', { class: 'em-two' }, two) : two[0],
      daysCard(d),
      h('p', { class: 'lx-foot' }, 'Numbers from Triple Whale. Sales are the store\'s total sales less tax. Visits are counted by the Triple Whale pixel.'),
    ].filter(Boolean));
  },
};
