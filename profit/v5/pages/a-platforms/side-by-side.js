/* Agency > All platforms > Side by side. Which platform earns its spend, across every brand?
   Each platform's spend is its own; sales and ROAS are Triple Whale, last platform click.
   Real: profit worker GET /api/overview (channels per brand). */

import { put } from '../../kit.js';
import { h, em, money, x, pct, statusDot, legend, lineChart, empty, platformChip, kpi, tiles, sheet, addStyles } from '../../kit.js';
import { style, world, readBrands, ok, sumOf, brandRows, brandName, brandHref, quiet, shortDay, plat, roasTone, platName, PAID } from '../a-today/_ag.js';
import { def, defOn, headRow } from '../platforms/_ads.js';
import { table, card, gauge } from '../../kit.js';

const load = ctx => readBrands(ctx, ctx.range, { cmp: 'none' });
const sample = async () => { const w = await world(); return { window: w.window, rules: w.rules, brands: w.brands }; };

/* "Nov 1 to 22" in one month, "Oct 28 to Nov 3" across two: the one date form of every Ads page */
const rangeLabel = (from, to) => { if (!from || !to) return ''; const a = shortDay(from), b = shortDay(to); return from === to ? a : a.split(' ')[0] === b.split(' ')[0] ? a + ' to ' + b.split(' ')[1] : a + ' to ' + b; };

function render(el, d, ctx) {
  style();
  if (!d || !d.brands || !d.brands.length) return put(el, empty({ title: 'No brands for these dates', text: 'Pick other dates, or add a brand in Agency settings.' }));
  const ids = PAID.filter(id => d.brands.some(b => (plat(b, id) || {}).spend > 0));
  if (!ids.length) return put(el, empty({ title: 'No ad spend on these dates', text: 'No brand spent on a connected ad platform.' }));
  const tot = ids.map(id => {
    const ps = d.brands.map(b => ({ b, p: plat(b, id) })).filter(q => q.p && q.p.spend > 0);
    const known = ps.filter(q => ok(q.p.sales));
    const spend = sumOf(ps, q => q.p.spend), kSpend = sumOf(known, q => q.p.spend), sales = sumOf(known, q => q.p.sales);
    return { id, spend, sales, roas: kSpend > 0 && ok(sales) ? sales / kSpend : null, brands: ps.length };
  }).sort((a, b) => b.spend - a.spend);
  const all = sumOf(tot, t => t.spend);

  const W = rangeLabel(d.window.from, d.window.to);
  /* kit tiles, each saying its own window and source (spend is the platform's, ROAS Triple Whale) */
  const shown = tot.slice(0, 4);
  const hero = tiles(shown.map(t => kpi({ label: `${platName(t.id)} spend`, value: money(t.spend), window: W, source: platName(t.id) + ' spend, ROAS Triple Whale',
    sub: `${pct(t.spend / all)} of all ad spend, ROAS ${ok(t.roas) ? x(t.roas) : 'no data'}` })), { cols: shown.length === 4 ? 4 : shown.length === 2 ? 2 : 3 });

  /* one platform, brand by brand */
  const platSheet = t => sheet({ title: `${platName(t.id)}, every brand`, body: h('div', { class: 'aps-sh' },
    h('p', null, `${W} · spend ${platName(t.id)}, sales and ROAS Triple Whale, last click`),
    table({ rows: d.brands.map(b => ({ b, p: plat(b, t.id) })).filter(q => q.p && q.p.spend > 0).sort((a, b) => b.p.spend - a.p.spend), cols: [
      { key: 'n', label: 'Brand', render: q => q.b.name },
      { key: 's', label: 'Spend', num: true, render: q => money(q.p.spend) },
      { key: 'v', label: 'Sales', num: true, class: 'hide-sm', render: q => ok(q.p.sales) ? money(q.p.sales) : quiet('no data') },
      { key: 'r', label: def('ROAS', 'roas'), num: true, render: q => ok(q.p.roas) ? statusDot(roasTone(q.p.roas, q.b.goal_roas), x(q.p.roas)) : quiet('no sales source') },
    ] })) });

  /* one row per platform, a bar each for spend and sales on one shared scale: a small platform stays readable, and the
     ROAS has its own labeled column (the old chart wrote ROAS on a dollar bar) */
  const top = Math.max(1, ...tot.map(t => Math.max(t.spend || 0, t.sales || 0)));
  const bar = (v, cls) => h('span', { class: 'aps-bar ' + cls }, h('i', { style: { width: (100 * (v || 0) / top).toFixed(1) + '%' } }), h('b', null, money(v, { compact: true })));
  const chart = card({ title: 'Ad spend and sales by platform', note: `${W} · every brand added up · spend each platform, sales Triple Whale, last click · tap a platform`, flush: true, class: 'aps' },
    table({ roomy: true, rows: tot, onRow: t => platSheet(t), cols: [
      { key: 'id', label: 'Platform', render: t => platformChip(t.id, { chip: true }) },
      { key: 'spend', label: 'Spend', render: t => bar(t.spend, 'sp') },
      { key: 'sales', label: 'Sales from its ads', render: t => bar(t.sales, 'sa') },
      { key: 'roas', label: def('ROAS', 'roas'), num: true, class: 'strong', render: t => ok(t.roas) ? x(t.roas) : quiet('no data') },
      { key: 'brands', label: 'Brands spending', num: true, class: 'hide-sm', render: t => String(t.brands) },
    ] }));
  addStyles('aps-css', `.aps-bar{display:grid;grid-template-columns:minmax(60px,1fr) 64px;align-items:center;gap:10px;min-width:160px}
.aps-bar i{display:block;height:8px;border-radius:999px;background:var(--brand)}.aps-bar.sa i{background:var(--slate)}
.aps-bar b{font-weight:500;font-variant-numeric:tabular-nums;text-align:right}
.aps-sh{display:grid;gap:14px}.aps-sh p{margin:0;font-size:var(--fs-small,12.5px);color:var(--muted)}
.ag-item .aps-fig{display:inline-grid;gap:1px}.ag-item .aps-fig small{font-size:11.5px;color:var(--muted);font-weight:400}
/* on a phone the bars leave and the figures stay: the table fits the screen with no sideways scroll */
@media (max-width:759px){.aps-bar{min-width:0;grid-template-columns:auto}.aps-bar i{display:none}.aps .lx-table th,.aps .lx-table td{padding-left:10px;padding-right:10px}}`);

  const goalWord = { title: 'The dot', body: "Green: at or over the brand's goal ROAS. Amber: close under it. Red: well under it." };
  const cell = (b, id) => { const p = plat(b, id); if (!p || !(p.spend > 0)) return quiet('off');
    return h('a', { href: brandHref(b.id, id, 'overview'), style: { display: 'inline-grid', justifyItems: 'end', gap: '2px', color: 'inherit', textDecoration: 'none' }, title: 'Open ' + platName(id) + ' for this brand' },
      ok(p.roas) ? statusDot(roasTone(p.roas, b.goal_roas), x(p.roas)) : quiet('no sales source'), h('span', { class: 'sub' }, money(p.spend))); };
  const rows = d.brands.map(b => ({ ...b, href: brandHref(b.id, 'platforms', 'side-by-side') }));
  const tbl = brandRows({
    title: 'Brand by brand', note: h('span', null, `${W} · `, defOn(h('span', null, 'each cell: ROAS, then spend'), goalWord), ' · spend each platform, ROAS Triple Whale'), sort: { key: 'spend', dir: 'desc' }, rows,
    cols: [
      { key: 'name', label: 'Brand', class: 'name', render: r => brandName(r, ctx, r.href) },
      { key: 'spend', label: 'All ad spend', num: true, sortable: true, class: 'strong', value: r => r.spend ?? -1, render: r => money(r.spend) },
      ...ids.map((id, k) => ({ key: id, label: h('span', null, platName(id), h('small', { style: { display: 'block', fontWeight: 400, letterSpacing: 0, textTransform: 'none' } }, 'ROAS / spend')), num: true, class: k > 1 ? 'hide-md' : '', render: r => cell(r, id) })),
      { key: 'goal', label: 'Goal ROAS', num: true, class: 'hide-sm', render: r => ok(r.goal_roas) ? x(r.goal_roas) : quiet('none') },
    ],
    item: r => ({ href: r.href, head: brandName(r, ctx), tail: h('b', null, money(r.spend)),
      /* every platform on the phone card, ROAS with its spend under it (Amazon included) */
      figs: ids.map(id => { const p = plat(r, id); return !p || !(p.spend > 0) ? [platName(id), quiet('off')] : [platName(id), ok(p.roas) ? x(p.roas) : quiet('no sales'), money(p.spend) + ' spent']; }) }),
  });
  const help = headRow({ help: [
    { title: 'What it is for', text: 'Which ad platform earns its spend across every brand, then each brand platform by platform. Tap a cell to open that brand\'s platform page.' },
    { title: 'Where the numbers come from', text: "Spend is each platform's own. Sales and ROAS are Triple Whale, last platform click, so each platform gets credit only for the sales it was the last click on. A brand with no sales source shows no ROAS." },
  ] });
  ctx.askWindow = W;
  ctx.askContext = `Ad platforms across every brand, ${W}: ` + tot.map(t => `${platName(t.id)} spend ${money(t.spend)}, ROAS ${ok(t.roas) ? x(t.roas) : 'no data'} (Triple Whale last click)`).join('; ') + '.';
  put(el, h('div', { class: 'ag' }, help, hero, chart, tbl));
}

export default {
  title: 'All platforms, all brands',
  eyebrow: 'All platforms',
  load, sample, render,
};
