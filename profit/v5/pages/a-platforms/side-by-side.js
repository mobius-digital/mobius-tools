/* Agency > All platforms > Side by side. Which platform earns its spend, across every brand?
   Each platform's spend is its own; sales and ROAS are Triple Whale, last platform click.
   Real: profit worker GET /api/overview (channels per brand). */

import { put } from '../../kit.js';
import { h, em, money, x, pct, statusDot, legend, lineChart, empty, platformChip } from '../../kit.js';
import { style, world, readBrands, ok, sumOf, figures, brandRows, brandName, brandHref, quiet, shortDay, plat, roasTone, platName, PAID } from '../a-today/_ag.js';
import { def, defOn, headRow } from '../platforms/_ads.js';
import { table, card, gauge } from '../../kit.js';

const load = ctx => readBrands(ctx, ctx.range, { cmp: 'none' });
const sample = async () => { const w = await world(); return { window: w.window, rules: w.rules, brands: w.brands }; };

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

  const hero = figures(tot.slice(0, 4).map((t, i) => ({ label: `${platName(t.id)} spend`, value: money(t.spend), lead: i === 0,
    sub: `${pct(t.spend / all)} of all ad spend, ROAS ${ok(t.roas) ? x(t.roas) : 'no data'}` })));

  /* one row per platform, a bar each for spend and sales on one shared scale: a small platform stays readable, and the
     ROAS has its own labeled column (the old chart wrote ROAS on a dollar bar) */
  const top = Math.max(1, ...tot.map(t => Math.max(t.spend || 0, t.sales || 0)));
  const bar = (v, cls) => h('span', { class: 'aps-bar ' + cls }, h('i', { style: { width: (100 * (v || 0) / top).toFixed(1) + '%' } }), h('b', null, money(v, { compact: true })));
  const chart = card({ title: 'Where did the ad money go, and what came back?', note: `${shortDay(d.window.from)} to ${shortDay(d.window.to)}, every brand added up`, flush: true, class: 'aps' },
    table({ roomy: true, rows: tot, cols: [
      { key: 'id', label: 'Platform', render: t => platformChip(t.id, { chip: true }) },
      { key: 'spend', label: def('Spend', 'ad_spend'), render: t => bar(t.spend, 'sp') },
      { key: 'sales', label: def('Sales from its ads', 'roas'), render: t => bar(t.sales, 'sa') },
      { key: 'roas', label: def('ROAS', 'roas'), num: true, class: 'strong', render: t => ok(t.roas) ? x(t.roas) : quiet('no data') },
      { key: 'brands', label: 'Brands spending', num: true, class: 'hide-sm', render: t => String(t.brands) },
    ] }));
  if (!document.getElementById('aps-css')) document.head.append(h('style', { id: 'aps-css' }, `.aps-bar{display:grid;grid-template-columns:minmax(60px,1fr) 64px;align-items:center;gap:10px;min-width:160px}
.aps-bar i{display:block;height:8px;border-radius:999px;background:var(--ink)}.aps-bar.sa i{background:var(--slate)}
.aps-bar b{font-weight:550;font-variant-numeric:tabular-nums;text-align:right}`));

  const goalWord = { title: 'The dot', body: "Green: at or over the brand's goal ROAS. Amber: close under it. Red: well under it." };
  const cell = (b, id) => { const p = plat(b, id); if (!p || !(p.spend > 0)) return quiet('off');
    return h('a', { href: brandHref(b.id, id, 'overview'), style: { display: 'inline-grid', justifyItems: 'end', gap: '2px', color: 'inherit', textDecoration: 'none' }, title: 'Open ' + platName(id) + ' for this brand' },
      ok(p.roas) ? statusDot(roasTone(p.roas, b.goal_roas), x(p.roas)) : quiet('no sales source'), h('span', { class: 'sub' }, money(p.spend))); };
  const rows = d.brands.map(b => ({ ...b, href: brandHref(b.id, 'platforms', 'side-by-side') }));
  const tbl = brandRows({
    title: 'Brand by brand', note: defOn(h('span', null, 'each cell: ROAS, then spend'), goalWord), sort: { key: 'spend', dir: 'desc' }, rows,
    cols: [
      { key: 'name', label: 'Brand', class: 'name', render: r => brandName(r, ctx, r.href) },
      { key: 'spend', label: 'All ad spend', num: true, sortable: true, class: 'strong', value: r => r.spend ?? -1, render: r => money(r.spend) },
      ...ids.map((id, k) => ({ key: id, label: h('span', null, platName(id), h('small', { style: { display: 'block', fontWeight: 400, letterSpacing: 0, textTransform: 'none' } }, 'ROAS / spend')), num: true, class: k > 1 ? 'hide-md' : '', render: r => cell(r, id) })),
      { key: 'goal', label: 'Goal ROAS', num: true, class: 'hide-sm', render: r => ok(r.goal_roas) ? x(r.goal_roas) : quiet('none') },
    ],
    item: r => ({ href: r.href, head: brandName(r, ctx), tail: h('b', null, money(r.spend)),
      figs: ids.slice(0, 3).map(id => { const p = plat(r, id); return [platName(id), !p || !(p.spend > 0) ? quiet('off') : ok(p.roas) ? x(p.roas) : quiet('no sales')]; }) }),
  });
  const help = headRow({ help: [
    { title: 'What it is for', text: 'Which ad platform earns its spend across every brand, then each brand platform by platform. Tap a cell to open that brand\'s platform page.' },
    { title: 'Where the numbers come from', text: "Spend is each platform's own. Sales and ROAS are Triple Whale, last platform click, so each platform gets credit only for the sales it was the last click on. A brand with no sales source shows no ROAS." },
  ] });
  put(el, h('div', { class: 'ag' }, help, hero, chart, tbl));
}

export default {
  title: ['Which platform ', em('earns its spend?')],
  eyebrow: 'All platforms, all brands',
  load, sample, render,
};
