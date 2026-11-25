/* Agency > All platforms > Side by side. Which platform earns its spend, across every brand?
   Each platform's spend is its own; sales and ROAS are Triple Whale, last platform click.
   Real: profit worker GET /api/overview (channels per brand). */

import { put } from '../../kit.js';
import { h, em, money, x, pct, statusDot, legend, lineChart, empty, platformChip } from '../../kit.js';
import { style, world, readBrands, ok, sumOf, figures, brandRows, brandName, brandHref, quiet, shortDay, plat, roasTone, platName, PAID } from '../a-today/_ag.js';

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

  const chart = h('section', { class: 'lx-card ag-chart' },
    h('div', { class: 'lx-chart-h' }, h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'Where did the ad money go, and what came back?')), h('p', null, `${shortDay(d.window.from)} to ${shortDay(d.window.to)}, every brand added up`)),
      legend([{ name: 'Spend', square: true, color: 'var(--ink)' }, { name: 'Sales from it', square: true, color: 'var(--slate)' }])),
    /* the kit has no grouped columns: each platform takes two slots, spend then sales, and the name sits under the pair */
    lineChart({ series: [{ type: 'bar', values: tot.flatMap(t => [t.spend, null]), labels: v => money(v, { compact: true }) },
      { type: 'bar', tone: 'slate', values: tot.flatMap(t => [null, t.sales]), labels: (v, i) => { const t = tot[(i - 1) / 2]; return ok(t.roas) ? x(t.roas) : money(v, { compact: true }); } }],
      labels: tot.flatMap(t => [platName(t.id), '']), height: 320, endLabels: false, barWidth: 44, label: 'Spend and sales by platform',
      hover: i => { const t = tot[Math.floor(i / 2)]; return [h('b', null, platName(t.id)), h('span', null, 'Spend ', h('b', null, money(t.spend))), h('span', null, 'Sales ', h('b', null, money(t.sales))), h('span', null, 'ROAS ', h('b', null, x(t.roas)))]; } }));

  const cell = (b, id) => { const p = plat(b, id); if (!p || !(p.spend > 0)) return quiet('off');
    return h('span', { style: { display: 'inline-grid', justifyItems: 'end', gap: '2px' } },
      ok(p.roas) ? statusDot(roasTone(p.roas, b.goal_roas), x(p.roas)) : quiet('no sales source'), h('span', { class: 'sub' }, money(p.spend))); };
  const rows = d.brands.map(b => ({ ...b, href: brandHref(b.id, 'platforms', 'side-by-side') }));
  const tbl = brandRows({
    title: 'Brand by brand', note: 'ROAS on each platform, its spend under it. The dot is against the brand\'s goal ROAS.', sort: { key: 'spend', dir: 'desc' }, rows,
    cols: [
      { key: 'name', label: 'Brand', class: 'name', render: r => brandName(r, ctx, r.href) },
      { key: 'spend', label: 'All ad spend', num: true, sortable: true, class: 'strong', value: r => r.spend ?? -1, render: r => money(r.spend) },
      ...ids.map((id, k) => ({ key: id, label: platName(id), num: true, class: k > 1 ? 'hide-md' : '', render: r => cell(r, id) })),
      { key: 'goal', label: 'Goal ROAS', num: true, class: 'hide-sm', render: r => ok(r.goal_roas) ? x(r.goal_roas) : quiet('none') },
    ],
    item: r => ({ href: r.href, head: brandName(r, ctx), tail: h('b', null, money(r.spend)),
      figs: ids.slice(0, 3).map(id => { const p = plat(r, id); return [platName(id), !p || !(p.spend > 0) ? quiet('off') : ok(p.roas) ? x(p.roas) : quiet('no sales')]; }) }),
  });
  const foot = h('p', { class: 'lx-foot' }, 'Spend is each platform\'s own. Sales and ROAS are Triple Whale, last platform click, so each platform gets credit only for the sales it was the last click on. A brand with no sales source shows no ROAS.');
  put(el, h('div', { class: 'ag' }, hero, chart, tbl, foot));
}

export default {
  title: ['Which platform ', em('earns its spend?')],
  eyebrow: 'All platforms, all brands',
  load, sample, render,
};
