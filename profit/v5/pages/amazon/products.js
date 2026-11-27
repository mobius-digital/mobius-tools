/* Ads > Amazon > Products. "Which products lean on ads?"
   Per product: sales, units, ad spend, how much of its sales came through an ad, and stock where it is known.

   Live: Amazon sales, ad spend and ad sales for the dates (Triple Whale, see loadTotals in _ui.js), so the
   lead figure, "how much of Amazon sales came through an ad", is real.
   No route yet: anything per product. Amazon's product report and its warehouse stock sit behind the owner's
   Amazon login and no worker reads them. Until that feed exists the team sees the product list from the sample
   file under the "Example until its data feed is built" chip; a client sees a plain note instead.
   Sample mode draws the whole page from the fixture.

   Read only. A row opens a sheet with that product's numbers. Nothing here changes a bid, a budget or a listing.
   A product with no stock count says "Not tracked". It never shows a zero for something it cannot read. */

import { put } from '../../kit.js';
import { h, em, card, kpi, kpis, tiles, delta, takeaway, button, table, statusDot, sheet, exampleChip, empty, skeleton, addStyles, pct, num } from '../../kit.js';
import { css, usd, roas, change, say, splitBar, lockBox, loadTotals, winLabel, wasText } from './_ui.js';
import { def, headRow } from '../platforms/_ads.js';
import { askWhy } from '../home/_biz.js';

const ok = n => n != null && isFinite(n);
const div = (a, b) => (ok(a) && ok(b) && b > 0 ? a / b : null);
const sum = (rows, k) => { let t = 0, any = false; for (const r of rows) if (ok(r[k])) { t += r[k]; any = true; } return any ? t : null; };
const share1 = v => (ok(v) ? Math.min(1, Math.max(0, v)) : null);
const LOW_DAYS = 21;          // under three weeks of stock reads as low (not a setting yet)

const CSS = `
.azp-name{display:block;min-width:0;white-space:normal;line-height:1.3}
.azp-name small{display:block;font-size:12.5px;font-weight:400;color:var(--muted)}
.azp-share{display:inline-flex;align-items:center;gap:10px;justify-content:flex-end}
.azp-share i{display:block;width:64px;height:6px;border-radius:999px;background:#E4E2DC;overflow:hidden;flex:none}
.azp-share i b{display:block;height:100%;border-radius:999px;background:var(--ink);width:var(--v,0%)}
.azp-q{color:var(--muted);font-weight:400}
.azp-tbl .lx-table td{white-space:normal}
.azp-tbl .lx-table td.num{white-space:nowrap}
.azp-sheet{display:grid;gap:22px}
.azp-figs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px 14px}
.azp-figs span{display:grid;gap:2px;min-width:0}
.azp-figs small{font-size:12px;color:var(--muted)}
.azp-figs b{font-size:20px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.2}
.azp-figs b.q{font-size:13.5px;font-weight:400;letter-spacing:0;color:var(--muted);line-height:1.6}
.azp-bar{display:grid;gap:10px}
.azp-bar p{margin:0;font-size:13px;color:var(--muted)}
.azp-bar p b{color:var(--ink);font-weight:600}
.azp-stock{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding-top:16px;border-top:1px solid var(--line);font-size:13.5px;color:var(--ink-2)}
.azp-note{margin:0;font-size:12.5px;color:var(--muted)}
@media (max-width:759px){
  .azp-tbl .lx-table th,.azp-tbl .lx-table td{padding-left:8px;padding-right:8px}
  .azp-tbl .lx-table th:first-child,.azp-tbl .lx-table td:first-child{padding-left:18px}
  .azp-share i{display:none}
  .azp-figs{grid-template-columns:repeat(2,minmax(0,1fr))}
}`;

/* ---------- one product's numbers, worked out once ---------- */
function shape(p) {
  const adShare = share1(div(p.ad_sales, p.sales));
  return { ...p, ad_share: adShare, tacos: div(p.ad_spend, p.sales), roas: div(p.ad_sales, p.ad_spend),
    no_ads: !(p.ad_spend > 0), stock: p.stock && ok(p.stock.units) ? p.stock : null };
}
const weeks = days => (days >= 14 ? Math.round(days / 7) + ' weeks' : days + (days === 1 ? ' day' : ' days'));
function stockCell(r) {
  if (!r.stock) return h('span', { class: 'azp-q' }, 'Not tracked');
  const low = ok(r.stock.days) && r.stock.days < LOW_DAYS;
  const text = num(r.stock.units) + (ok(r.stock.days) ? ', ' + weeks(r.stock.days) : '');
  return low ? statusDot('warn', text) : text;
}
const shareCell = r => (r.no_ads ? h('span', { class: 'azp-q' }, 'No ads ran')
  : !ok(r.ad_share) ? h('span', { class: 'azp-q' }, 'No data')
  : h('span', { class: 'azp-share' }, pct(r.ad_share), h('i', null, h('b', { style: { '--v': (r.ad_share * 100).toFixed(1) + '%' } }))));

/* ---------- the lead: how much of Amazon sales came through an ad (live in real mode) ---------- */
function lead(k, w) {
  const wl = winLabel(w);
  const adShare = share1(div(k.ad_sales, k.sales)), tacos = div(k.spend, k.sales);
  const r = div(k.ad_sales, k.spend), dSales = change(k.sales, k.sales_prev), dSpend = change(k.spend, k.spend_prev);
  const na = text => h('span', { class: 'az-na' }, text);
  const rest = ok(k.sales) && ok(k.ad_sales) ? Math.max(0, k.sales - k.ad_sales) : null;
  return h('section', { class: 'az-ret' },
    tiles([
      ok(k.sales) ? kpi({ label: 'Amazon sales', value: usd(k.sales), window: wl, source: 'Triple Whale', delta: dSales != null && delta(dSales, { bad: dSales < 0 }), sub: ok(k.sales_prev) && wasText(k.sales_prev, w, usd) })
        : kpi({ label: 'Amazon sales', value: na('Not connected'), sub: 'No sales source connected' }),
      ok(k.spend) ? kpi({ label: 'Amazon ad spend', value: usd(k.spend), window: wl, source: 'Triple Whale', delta: dSpend != null && delta(dSpend, { plain: true }), sub: ok(k.spend_prev) && wasText(k.spend_prev, w, usd) })
        : kpi({ label: 'Ad spend', value: na('No ads ran'), sub: 'no Amazon ad spend in these dates', window: wl }),
      kpi({ label: def('Sales that came through an ad', { title: 'Through an ad', body: "Ad sales (Amazon Ads' own count) as a share of all Amazon sales." }), value: ok(adShare) ? pct(adShare) : na('No data'), window: wl, source: "Amazon Ads' own count",
        sub: ok(k.ad_sales) ? usd(k.ad_sales) + ' of ad sales' : 'needs both sales and ad sales' }),
      kpi({ label: def('TACOS', 'tacos'), value: ok(tacos) ? pct(tacos, { digits: 1 }) : na('No data'), sub: ok(r) ? 'ROAS ' + roas(r) : '', window: wl, source: 'Triple Whale' }),
    ], { cols: 4 }),
    ok(rest) && k.sales > 0 ? card({ title: 'Sales through an ad, and without one', note: wl + " · sales Triple Whale, ad sales Amazon Ads' own count" },
      splitBar([{ value: k.ad_sales, color: 'var(--brand)' }, { value: rest, color: 'var(--line-strong)' }],
        { thin: true, label: `Amazon sales split: ${usd(k.ad_sales)} through an ad, ${usd(rest)} without one` }),
      h('div', { class: 'az-ends' }, h('span', null, h('b', null, usd(k.ad_sales)), ' through an ad'), h('span', null, h('b', null, usd(rest)), ' without one'))) : null);
}

/* ---------- the sheet for one product ---------- */
function openProduct(r, d) {
  const f = (label, value, quiet) => h('span', null, h('small', null, label), h('b', { class: quiet ? 'q' : '' }, value));
  const rest = ok(r.sales) && ok(r.ad_sales) ? Math.max(0, r.sales - r.ad_sales) : null;
  const low = r.stock && ok(r.stock.days) && r.stock.days < LOW_DAYS;
  sheet({ title: r.name, body: h('div', { class: 'azp-sheet' },
    d.example ? h('div', null, exampleChip()) : null,
    r.variant ? h('p', { class: 'azp-note' }, r.variant) : null,
    h('div', { class: 'azp-figs' },
      f('Sales', usd(r.sales)), f('Units', ok(r.units) ? num(r.units) : 'No data', !ok(r.units)), f('Orders', ok(r.orders) ? num(r.orders) : 'No data', !ok(r.orders)),
      f('Ad spend', r.no_ads ? 'No ads ran' : usd(r.ad_spend), r.no_ads), f('Ad sales', r.no_ads ? 'No ads ran' : usd(r.ad_sales), r.no_ads),
      f('ROAS', r.no_ads ? 'No ads ran' : roas(r.roas), r.no_ads),
      f('TACOS', ok(r.tacos) && !r.no_ads ? pct(r.tacos, { digits: 1 }) : r.no_ads ? 'No ads ran' : 'No data', r.no_ads || !ok(r.tacos)),
      f('Share of Amazon sales', ok(r.of_all) ? pct(r.of_all) : 'No data', !ok(r.of_all))),
    !r.no_ads && ok(rest) && r.sales > 0 ? h('div', { class: 'azp-bar' },
      splitBar([{ value: r.ad_sales, color: 'var(--ink)' }, { value: rest, color: 'var(--line-strong)' }], { thin: true, label: `${pct(r.ad_share)} of this product's sales came through an ad` }),
      h('p', null, h('b', null, pct(r.ad_share)), ' of its sales came through an ad, ', h('b', null, usd(rest)), ' sold without one.')) : null,
    h('div', { class: 'azp-stock' },
      r.stock ? [low ? statusDot('warn', 'Running low') : statusDot('good', 'In stock'),
        h('span', null, num(r.stock.units) + ' units at Amazon' + (ok(r.stock.days) ? ', about ' + weeks(r.stock.days) + ' at this pace' : ''))]
        : [statusDot('off', 'Stock not tracked'), h('span', null, "Amazon's warehouse count needs the owner's Amazon login.")]),
    null) });
}

function productsCard(d, rows) {
  const total = { total: true, name: 'All products listed', sales: sum(rows, 'sales'), units: sum(rows, 'units'), ad_spend: sum(rows, 'ad_spend'), ad_sales: sum(rows, 'ad_sales') };
  const t = shape(total);
  const tbl = table({
    roomy: true, rowHeight: 60,
    cols: [
      { key: 'name', label: 'Product', class: 'name', render: r => (r.total ? r.name : h('span', { class: 'azp-name' }, r.name, r.variant && h('small', null, r.variant))) },
      { key: 'sales', label: 'Sales', num: true, sortable: true, class: 'strong', render: r => usd(r.sales) },
      { key: 'units', label: 'Units', num: true, sortable: true, class: 'hide-sm', render: r => (ok(r.units) ? num(r.units) : h('span', { class: 'azp-q' }, 'No data')) },
      { key: 'ad_spend', label: 'Ad spend', num: true, sortable: true, class: 'hide-sm', value: r => r.ad_spend ?? 0, render: r => (r.no_ads ? h('span', { class: 'azp-q' }, 'None') : usd(r.ad_spend)) },
      { key: 'ad_share', label: 'Through an ad', num: true, sortable: true, value: r => (r.no_ads ? 0 : r.ad_share), render: shareCell },
      { key: 'tacos', label: def('TACOS', 'tacos'), num: true, sortable: true, class: 'hide-md', value: r => (r.no_ads ? 0 : r.tacos), render: r => (r.no_ads ? '' : ok(r.tacos) ? pct(r.tacos, { digits: 1 }) : '') },
      { key: 'stock', label: 'Stock', num: true, class: 'hide-sm', render: r => (r.total ? '' : stockCell(r)) },
    ],
    rows, sort: { key: 'sales', dir: 'desc' }, total: { ...t, total: true },
    onRow: r => openProduct(r, d), empty: 'No products sold on Amazon in these dates',
  });
  return card({ title: 'Product by product', note: winLabel(d.window) + " · sales Triple Whale, ad sales Amazon Ads' own count · tap a product", flush: true, class: 'azp-tbl', action: d.example ? exampleChip() : null }, tbl);
}

export default {
  /* the plain question, drawn by the shell above the tabs */
  title: 'Amazon products',
  eyebrow: 'Amazon',

  async load(ctx) {
    const t = await loadTotals(ctx);
    /* no route reads Amazon's product report yet: the team sees the example list under the chip, a client does not */
    const ex = ctx.isClient ? null : await ctx.fixture('products.json').catch(() => null);
    return { ...t, take: null, products: ex ? ex.products : null, example: !!ex };
  },

  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('row', 6)); },

  render(el, d, ctx) {
    css(); addStyles('azp-css', CSS);
    d = d || {};
    const k = d.kpi || {};
    if (!ok(k.sales) && !ok(k.spend)) {
      put(el, empty({
        title: 'No sales source connected',
        text: 'Amazon is not connected in Triple Whale for ' + (ctx.brand ? ctx.brand.name : 'this brand') + ', so there are no Amazon sales or ad spend to show yet.',
      }));
      return;
    }
    const kids = [headRow({ help: [
      { title: 'What it is for', text: 'Which Amazon products sell on their own and which lean on ads, for the dates in the page head. Tap a product for its numbers.' },
      { title: 'Where the numbers come from', text: "The figures at the top are Triple Whale. Ad sales are Amazon Ads' own count. Stock is Amazon's warehouse count where it is known." + (d.example ? " The product list is an example until Amazon's product report is read." : '') },
    ] }), lead(k, d.window)];
    const all = sum(d.products || [], 'sales');
    const rows = (d.products || []).map(shape).map(r => ({ ...r, of_all: div(r.sales, all) }));
    /* the one line read: only from real per product numbers or the fixture's own, never worked out of example rows */
    if (d.take && !d.example) kids.push(takeaway(say(d.take), { action: !ctx.isClient ? askWhy(ctx, 'Which Amazon products are working, and why?') : null }));
    kids.push(rows.length ? productsCard(d, rows)
      : card({ title: 'Product by product' }, lockBox("Not connected: needs the owner's Amazon login", 'Sales, ad spend and stock for each product are in Amazon itself. One sign in from the owner brings them here.')));
    put(el, ...kids);
  },
};
