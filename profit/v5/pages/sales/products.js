/* Business > Sales > Products. "Which products carry the store?"
   Live: the products in the dates' orders with orders and sales (GET /api/hub/store on the profit worker, its
   `products` list: Triple Whale orders, the first three products in each cart, an order's money shared between them).
   No route yet: units, returns and the first-order share per product (those columns show in sample mode only) and
   what is bought together (that card is drawn from the example file with a chip). */

import { put, sheet } from '../../kit.js';
import { helpBar, dl, rangeWords } from '../home/_biz.js';
import { h, em, card, table, skeleton, money, addStyles } from '../../kit.js';
import { tileRow, pageStamp, TW } from '../month/_m.js';
import { ok, usd, sum, css, head, barCell, exampleChip, example, notConnected, num, pct, hbars, kv } from '../email/_em.js';

function shape(ctx, b, ex) {
  const rows = (b.products || []).map(p => ({ id: String(p.id), title: p.title, type: null, orders: p.orders, units: null, sales: p.revenue, returned: null, first_order: null }));
  return { connected: rows.length > 0 || ((b.cur || {}).revenue || 0) > 0, range: { from: ctx.range.from, to: ctx.range.to }, orders: b.product_orders, approx: true,
    products: rows, pairs: ex && ex.pairs ? ex.pairs : null, example: ex && ex.pairs ? ['pairs'] : [] };
}
/* A short x label that still tells two colors of one product apart: "Ridgeline Magnetic Belt, Black" -> "Ridgeline, Black". */
const short = t => {
  const [name, rest] = String(t || '').split(':')[0].split(/,\s*/), words = name.split(/\s+/);
  const s = rest ? words[0] + ', ' + rest : words.length > 2 ? words.slice(0, 2).join(' ') : name;
  return s.length > 16 ? s.slice(0, 15).trim() + '.' : s;
};

function figures(d, ctx) {
  const rows = d.products.slice().sort((a, b) => (b.sales || 0) - (a.sales || 0)), total = sum(rows, 'sales'), top = rows[0];
  const top3 = sum(rows.slice(0, 3), 'sales');
  return tileRow([
    { label: 'Best seller', value: usd(top.sales), sub: h('span', { class: 'em-clip', title: top.title }, top.title) },
    { label: 'Top three products', value: total ? pct(top3 / total) : 'no data', sub: 'of product sales' },
    { label: 'Products that sold', value: num(rows.filter(r => r.orders > 0).length), sub: d.approx ? 'the top sellers' : null },
    { label: 'Orders', value: ok(d.orders) ? num(d.orders) : 'no data', sub: 'with a product on them' },
  ], { cols: 4, window: rangeWords(ctx, d.range), source: TW + ' orders' });
}

function chartCard(d, ctx) {
  const rows = d.products.slice().sort((a, b) => (b.sales || 0) - (a.sales || 0)).slice(0, 8);
  if (rows.length < 2) return null;
  const total = sum(d.products, 'sales') || 1, b = v => h('b', null, v);
  /* a bar list, so every product is named (a column chart had to drop labels) */
  /* the lead bar orange, the rest slate: the batch 1 chart colors (the shared bar list draws the rest in ink) */
  addStyles('sl-prod', '.sl-prod .em-hbars>div:not(.lead) .tr i{background:var(--slate)}');
  return card({ class: 'em-chart sl-prod' },
    head('Sales by product', 'The top ' + rows.length + ', ' + rangeWords(ctx, d.range) + ' · ' + TW + ' orders'),
    hbars(rows.map(r => ({ name: r.title, value: r.sales || 0, text: usd(r.sales),
      tip: [b(r.title), h('span', null, 'Sales ', b(usd(r.sales))), h('span', null, 'Orders ', b(num(r.orders))), h('span', null, 'Share ', b(pct((r.sales || 0) / total, { digits: 1 })))] }))));
}

/* One product, opened from its row: what is known about it in these dates, and what it is bought with. */
function openProduct(r, d) {
  const total = sum(d.products, 'sales') || 1;
  const pairs = (d.pairs || []).filter(p => p.a === r.title || p.b === r.title).sort((a, b) => b.orders - a.orders).slice(0, 5);
  const isEx = (d.example || []).includes('pairs');
  sheet({ title: r.title, body: h('div', { class: 'em-sheet' },
    h('div', { class: 'tiles' },
      h('div', null, h('small', null, 'Sales'), h('b', null, usd(r.sales)), h('span', null, pct((r.sales || 0) / total, { digits: 1 }) + ' of product sales')),
      h('div', null, h('small', null, 'Orders'), h('b', null, num(r.orders)), h('span', null, ok(r.units) ? num(r.units) + ' units' : 'units not read')),
      h('div', null, h('small', null, dl('In first orders', 'in_first_orders')), h('b', null, ok(r.first_order) ? pct(r.first_order) : 'not read'), h('span', null, 'of its orders')),
      h('div', null, h('small', null, 'Returned'), h('b', null, ok(r.returned) ? pct(r.returned, { digits: 1 }) : 'not read'), h('span', null, 'of units'))),
    kv([r.type && ['Type', r.type], ['Average order with it', r.orders > 0 ? usd(r.sales / r.orders) : 'no data']]),
    h('div', null, h('h4', null, 'Bought with', isEx ? exampleChip() : null),
      pairs.length ? kv(pairs.map(p => [p.a === r.title ? p.b : p.a, num(p.orders) + ' orders'])) : h('p', { class: 'quiet' }, 'Nothing bought with it often enough to show.')),
    h('p', { class: 'quiet' }, 'Sales by day for one product are not read yet; the store total by day is on Sales > By day.')) });
}

function listCard(d, ctx) {
  const open = r => openProduct(r, d);
  const rows = d.products, total = sum(rows, 'sales') || 1, has = k => rows.some(r => ok(r[k]));
  return card({ title: 'Every product', note: (d.approx ? 'an order\'s money is shared between its products' : 'sorted by sales') + ' · tap a product for its detail', flush: true, class: 'em-flush' },
    table({ roomy: true, rows, sort: { key: 'sales', dir: 'desc' }, onRow: open, cols: [
      { key: 'title', label: 'Product', class: 'name', sortable: true, render: r => h('span', { class: 'em-name' }, r.title, r.type ? h('small', null, r.type) : null) },
      { key: 'orders', label: 'Orders', num: true, sortable: true, render: r => num(r.orders) },
      has('units') && { key: 'units', label: 'Units', num: true, sortable: true, class: 'hide-sm', render: r => (ok(r.units) ? num(r.units) : '') },
      has('first_order') && { key: 'first_order', label: dl('In first orders', 'in_first_orders'), num: true, sortable: true, class: 'hide-md', render: r => (ok(r.first_order) ? pct(r.first_order) : '') },
      has('returned') && { key: 'returned', label: 'Returned', num: true, sortable: true, class: 'hide-md', render: r => (ok(r.returned) ? pct(r.returned, { digits: 1 }) : '') },
      { key: 'share', label: 'Share', num: true, sortable: true, class: 'hide-sm', value: r => r.sales, render: r => pct((r.sales || 0) / total, { digits: 1 }) },
      { key: 'sales', label: 'Sales', num: true, sortable: true, render: r => barCell(h('span', { class: 'strong' }, usd(r.sales)), (r.sales || 0) / (rows.reduce((m, x) => Math.max(m, x.sales || 0), 1))) },
    ].filter(Boolean) }));
}

function pairsCard(d, ctx) {
  const rows = d.pairs || [];
  if (!rows.length) return null;
  const isEx = (d.example || []).includes('pairs'), max = Math.max(...rows.map(r => r.orders || 0), 1);
  return card({ title: 'Bought together', note: [isEx ? exampleChip() : null, ' pairs in the same order · ' + rangeWords(ctx, d.range) + ' · ' + TW + ' orders'], flush: true, class: 'em-flush em-wrap' },
    table({ roomy: true, rows, sort: { key: 'orders', dir: 'desc' }, cols: [
      { key: 'a', label: 'Pair', class: 'name wrap', render: r => [r.a, h('span', { class: 'em-none' }, ' with '), r.b] },
      { key: 'orders', label: 'Orders', num: true, sortable: true, render: r => barCell(h('span', { class: 'strong' }, num(r.orders)), r.orders / max) },
    ] }));
}

export default {
  title: ['Which products ', em('carry the store?')],
  eyebrow: 'Sales',
  stamp: false,                     /* Home's stamp with a refresh button sits in the help bar */

  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    const [r, ex] = await Promise.all([
      ctx.api(`/api/hub/store?act=${encodeURIComponent(ctx.brand.id)}&from=${ctx.range.from}&to=${ctx.range.to}`, { signal: ctx.signal }),
      example(ctx, 'products'),
    ]);
    return shape(ctx, (r.brands || [])[0] || {}, ex);
  },

  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('chart'), skeleton('row', 6)); },

  render(el, d, ctx) {
    css();
    d = d || {};
    if (d.connected === false) {
      put(el, notConnected(ctx, { title: 'No sales source connected',
        text: 'Products show here once the store is connected.',
        teamText: 'Products come from the store\'s orders through Triple Whale. Set the brand\'s Triple Whale shop in Brand settings, Integrations.' }));
      return;
    }
    if (!(d.products || []).length) {
      put(el, notConnected({ ...ctx, isClient: true }, { title: 'No orders with products in these dates', text: 'Pick a longer range, or check back once today\'s orders have synced.' }));
      return;
    }
    const isEx = (d.example || []).includes('pairs');
    const tops = d.products.slice().sort((a, b) => (b.sales || 0) - (a.sales || 0)).slice(0, 5);
    ctx.askWindow = rangeWords(ctx, d.range);
    ctx.askContext = `${ctx.brand.name} products, ${ctx.askWindow} (${TW} orders): ${d.products.length} products sold. Top: ` + tops.map(r => `${r.title} ${usd(r.sales)} from ${num(r.orders)} orders`).join('; ') + '.';
    put(el, ...[
      helpBar([
        { title: 'What it is for', text: 'Which products carry the store on the dates at the top. Tap a product for its detail.' },
        { title: 'Where the numbers come from', text: 'Orders and sales are from Triple Whale\'s orders.' + (d.approx ? ' Sales per product are close, not exact: an order\'s money is shared between the products in it.' : '') + (isEx ? ' "Bought together" is an example until its data feed is built.' : '') },
      ], h('span', { class: 'bz-chip' }, rangeWords(ctx, d.range)), pageStamp(ctx)),
      figures(d, ctx),
      chartCard(d, ctx),
      listCard(d, ctx),
      pairsCard(d, ctx),
    ].filter(Boolean));
  },
};
