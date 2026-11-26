/* Shared by the agency platform pages (a-meta, a-google) and the suggestion lists.
   One platform across every brand: spend from the platform, sales from Triple Whale (last platform click), so ROAS.
   Read only: every button opens the brand's own page, where the change is made. */

import { put } from '../../kit.js';
import { helpBar } from '../home/_biz.js';
import { h, money, x, num, pill, statusDot, delta, button, card, legend, lineChart, empty, addStyles } from '../../kit.js';
import { style as agStyle, world, readBrands, soft, ok, sumOf, figures, brandRows, brandName, brandHref, quiet, shortDay, plat, roasTone, against, platName } from './_ag.js';

const CSS = `
.ag-sg{display:grid;gap:0}
.ag-sg-r{display:grid;grid-template-columns:112px minmax(0,1fr) auto;gap:16px;align-items:start;padding:16px 28px;border-top:1px solid var(--line)}
.ag-sg-r .k{padding-top:1px}
.ag-sg-r .t{display:grid;gap:4px;min-width:0}
.ag-sg-r .t b{font-size:14.5px;font-weight:600;letter-spacing:-.01em}
.ag-sg-r .t .n{font-size:13px;color:var(--ink-2);overflow-wrap:anywhere}
.ag-sg-r .t .w{font-size:13px;color:var(--muted)}
.ag-sg-r .m{text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:14.5px;white-space:nowrap}
.ag-sg-r .m small{display:block;font-size:12px;font-weight:400;color:var(--muted)}
.ag-ch-h{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:2px}
.ag-ch .k{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums;padding-top:2px}
.ag-sg-h{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:20px 28px 16px}
.ag-sg-h .lx-sp{flex:1}
@media (max-width:759px){
  .ag-sg-r{grid-template-columns:minmax(0,1fr) auto;padding:14px 18px;gap:8px 12px}
  .ag-sg-r .k{grid-column:1/-1}
  .ag-sg-h{padding:16px 18px 12px}
}`;
export const style = () => { agStyle(); addStyles('ag2-css', CSS); };

/* ---------- one platform across every brand ---------- */
const PREV = { meta: 'meta_spend', google: 'google_spend' };
const dayList = (from, to) => { const out = []; for (let d = new Date(from + 'T12:00:00'); d <= new Date(to + 'T12:00:00'); d.setDate(d.getDate() + 1)) out.push(d.toLocaleDateString('en-CA')); return out; };

function brandOf(b, id) {
  const p = plat(b, id);
  return { id: b.id, name: b.name, store: b.store, spend: p ? p.spend : null, sales: p && b.store ? p.sales : null, roas: p && b.store ? p.roas : null,
    cost: p && b.store ? p.cost : null, goal_roas: b.goal_roas, goal_cost: b.goal_cost, before: b.prev ? b.prev[PREV[id]] ?? null : null };
}

/** Real mode. Totals per brand from the profit worker; the days from the platform:
    Meta = account-health /api/series (Meta spend, Triple Whale sales a day); Google = account-health /api/google/ads (spend a day). */
export async function loadPlatform(ctx, id) {
  const base = await readBrands(ctx, ctx.range, { cmp: 'prev' });
  const brands = base.brands.map(b => brandOf(b, id)).filter(b => b.spend > 0 || b.before > 0);
  const { from, to } = base.window, dates = dayList(from, to);
  const back = Math.ceil((Date.now() - new Date(from + 'T12:00:00')) / 864e5) + 1;
  const per = await Promise.all(brands.filter(b => b.spend > 0).map(b => soft(id === 'meta'
    ? ctx.api(`/api/series?act=${encodeURIComponent(b.id)}&days=${back}`, { worker: 'ah', signal: ctx.signal }).then(r => ({ b, rows: (r.rows || []).map(x => ({ date: x.date, spend: x.spend, sales: b.store ? x.revenue : null })) }))
    : ctx.api(`/api/google/ads?act=${encodeURIComponent(b.id)}&from=${from}&to=${to}`, { worker: 'ah', signal: ctx.signal }).then(r => ({ b, rows: (r.days || []).map(x => ({ date: x.date, spend: x.spend, sales: null })) })))));
  const got = per.filter(Boolean);
  const daily = { dates, spend: dates.map(() => null), sales: dates.map(() => null), has_sales: id === 'meta' && got.length > 0 };
  for (const { rows } of got) for (const r of rows) { const i = dates.indexOf(r.date); if (i < 0) continue;
    if (ok(r.spend)) daily.spend[i] = (daily.spend[i] || 0) + r.spend; if (ok(r.sales)) daily.sales[i] = (daily.sales[i] || 0) + r.sales; }
  return { window: base.window, brands, daily: got.length ? daily : null, days_missing: brands.filter(b => b.spend > 0).length - got.length };
}
/** Sample mode: the same shape from the sample world, each brand's days split by its share of spend on this platform. */
export async function samplePlatform(id) {
  const w = await world();
  const brands = w.brands.map(b => brandOf(b, id)).filter(b => b.spend > 0 || b.before > 0);
  const dates = w.daily.dates, spend = dates.map(() => 0), sales = dates.map(() => 0);
  for (const b of w.brands) { const p = plat(b, id); if (!p || !(b.spend > 0)) continue; const share = p.spend / b.spend;
    (b.days || []).forEach(r => { const i = dates.indexOf(r.date); if (i < 0) return; spend[i] += r.spend * share; if (b.store && ok(p.roas)) sales[i] += r.spend * share * p.roas * (0.8 + 0.4 * ((i * 7 + b.name.length) % 5) / 4); }); }
  return { window: w.window, brands, daily: { dates, spend: spend.map(Math.round), sales: sales.map(Math.round), has_sales: id === 'meta' }, days_missing: 0 };
}

export function renderPlatform(el, d, ctx, id) {
  style();
  const name = platName(id);
  if (!d || !d.brands || !d.brands.length) return put(el, empty({ title: `No ${name} spend on these dates`, text: 'Pick other dates, or connect the ad account on a brand.' }));
  const rows = d.brands.map(b => ({ ...b, tone: roasTone(b.roas, b.goal_roas), href: brandHref(b.id, id, 'overview') }));
  const withSales = rows.filter(b => ok(b.sales));
  const spend = sumOf(rows, b => b.spend), before = sumOf(rows, b => b.before), spendS = sumOf(withSales, b => b.spend), sales = sumOf(withSales, b => b.sales);
  const under = rows.filter(b => b.tone === 'bad' || b.tone === 'warn'), noSrc = rows.filter(b => b.spend > 0 && !ok(b.sales));
  const change = before > 0 && ok(spend) ? spend / before - 1 : null;

  const hero = figures([
    { label: `${name} spend, all brands`, value: money(spend), lead: true, sub: change == null ? `${rows.length} brands` : [delta(change, { plain: true }), ' against the days before'] },
    { label: 'Sales from it', value: ok(sales) ? money(sales) : 'no data', sub: noSrc.length ? `${noSrc.length} brand${noSrc.length === 1 ? '' : 's'} with no sales source left out` : 'Triple Whale, last platform click' },
    { label: 'ROAS', value: spendS > 0 && ok(sales) ? x(sales / spendS) : 'no data', sub: 'sales over spend, brands with a sales source' },
    { label: 'Brands under goal ROAS', value: String(under.length), sub: under.length ? under.map(b => b.name).slice(0, 2).join(', ') + (under.length > 2 ? ` and ${under.length - 2} more` : '') : `of ${withSales.length} with a goal` },
  ]);

  let chart = null;
  const dl = d.daily;
  if (dl && dl.dates.length > 1) {
    const both = dl.has_sales, bb = v => h('b', null, v);
    chart = h('section', { class: 'lx-card ag-chart' },
      h('div', { class: 'lx-chart-h' }, h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, both ? `Is ${name} bringing back more than it costs?` : `How much went into ${name} each day?`)),
        h('p', null, both ? 'by day, every brand added up' : 'by day, every brand added up. Sales by day for this platform have no feed yet.')),
        legend([both && { name: 'Sales', lead: true }, { name: 'Spend', lead: !both }])),
      lineChart({ series: [both && { name: 'Sales', lead: true, values: dl.sales }, { name: 'Spend', lead: !both, values: dl.spend }].filter(Boolean),
        labels: dl.dates.map(shortDay), endFormat: v => money(v), height: 340, label: `${name} by day for every brand`,
        hover: i => [bb(shortDay(dl.dates[i])), both && h('span', null, 'Sales ', bb(money(dl.sales[i]))), h('span', null, 'Spend ', bb(money(dl.spend[i])))].filter(Boolean) }));
  }

  const state = r => !ok(r.sales) ? quiet('No sales source') : !ok(r.goal_roas) ? statusDot('off', 'No goal set') : statusDot(r.tone, r.roas >= r.goal_roas ? 'At goal' : 'Under goal');
  const chg = r => r.before > 0 && ok(r.spend) ? r.spend / r.before - 1 : null;
  const total = { total: true, name: 'All brands', spend, sales, before, roas: spendS > 0 && ok(sales) ? sales / spendS : null };
  const tbl = brandRows({
    title: 'Brand by brand', note: `${shortDay(d.window.from)} to ${shortDay(d.window.to)}`, sort: { key: 'spend', dir: 'desc' }, rows, total,
    cols: [
      { key: 'name', label: 'Brand', class: 'name', render: r => r.total ? r.name : brandName(r, ctx, r.href) },
      { key: 'spend', label: 'Spend', num: true, sortable: true, class: 'strong', value: r => r.spend ?? -1, render: r => [money(r.spend), chg(r) != null ? h('span', { class: 'sub' }, Math.abs(chg(r)) < 0.005 ? 'same' : delta(chg(r), { plain: true })) : null] },
      { key: 'sales', label: 'Sales', num: true, sortable: true, class: 'hide-sm', value: r => r.sales ?? -1, render: r => ok(r.sales) ? money(r.sales) : quiet('no data') },
      { key: 'roas', label: 'ROAS', num: true, sortable: true, value: r => r.roas ?? -1, render: r => ok(r.roas) ? [x(r.roas), ok(r.goal_roas) && !r.total ? h('span', { class: 'sub' }, `goal ${x(r.goal_roas)}`) : null] : quiet('no data') },
      { key: 'g', label: 'Against goal', width: 170, class: 'g hide-md', render: r => r.total ? '' : ok(r.roas) && ok(r.goal_roas) ? against(r.roas, r.goal_roas, r.tone) : '' },
      { key: 'cost', label: 'Cost per sale', num: true, class: 'hide-md', render: r => r.total ? '' : ok(r.cost) ? [money(r.cost), ok(r.goal_cost) ? h('span', { class: 'sub' }, `goal ${money(r.goal_cost)}`) : null] : quiet('no data') },
      { key: 'st', label: 'Status', render: r => r.total ? '' : state(r) },
    ],
    item: (r, isTotal) => ({ href: r.href, head: isTotal ? h('b', null, r.name) : brandName(r, ctx), tail: isTotal ? null : state(r),
      figs: [['Spend', money(r.spend)], ['Sales', ok(r.sales) ? money(r.sales) : quiet('no data')], ['ROAS', ok(r.roas) ? x(r.roas) + (ok(r.goal_roas) && !isTotal ? ` of ${x(r.goal_roas)}` : '') : quiet('no data')]],
      gauge: !isTotal && ok(r.roas) && ok(r.goal_roas) ? against(r.roas, r.goal_roas, r.tone) : null }),
  });
  const help = helpBar([
    { title: 'What it is for', text: `${name} across every brand: spend, the sales it brought in and its ROAS against each brand's goal.` },
    { title: 'How it is counted', text: `Spend is ${name}'s own. Sales and ROAS are Triple Whale, last platform click, so they will not match ${name}'s own reporting. A brand with no sales source shows no sales figure.${d.days_missing ? ` ${d.days_missing} brand${d.days_missing === 1 ? '' : 's'} did not answer for the day by day chart.` : ''}` },
  ]);
  put(el, h('div', { class: 'ag' }, help, hero, chart, tbl));
}

/* ---------- suggestions across brands ---------- */
const KIND = { cut: ['bad', 'Turn off'], trim: ['warn', 'Trim'], refresh: ['warn', 'New ads'], scale: ['good', 'Scale'], launch: ['', 'Load'], negative: ['warn', 'Negatives'], note: ['', 'Note'] };
export const kindPill = k => { const [tone, text] = KIND[k] || KIND.note; return pill(tone, text); };

/** d = { as_of, rows: [{ id, brand_id, brand, kind, action, name, why, stake }], load, example } */
export function renderSuggestions(el, d, ctx, id) {
  style();
  const name = platName(id);
  const rows = (d && d.rows) || [];
  if (!rows.length) return put(el, empty({ title: `Nothing to decide in ${name} today`, text: 'Every brand is inside its rules. New suggestions land here each morning.' }));
  const groups = new Map();
  for (const r of rows) { const g = groups.get(r.brand_id) || { id: r.brand_id, name: r.brand, rows: [], stake: 0 }; g.rows.push(r); g.stake += r.stake || 0; groups.set(r.brand_id, g); }
  const list = [...groups.values()].sort((a, b) => b.stake - a.stake);
  for (const g of list) g.rows.sort((a, b) => (b.stake || 0) - (a.stake || 0));
  const stake = sumOf(rows, r => r.stake), cuts = rows.filter(r => r.kind === 'cut').length, scales = rows.filter(r => r.kind === 'scale').length;
  const hero = figures([
    { label: 'Suggestions to decide', value: String(rows.length), lead: true, sub: `across ${list.length} brand${list.length === 1 ? '' : 's'}` },
    { label: 'Money behind them', value: money(stake), sub: 'spend on the ads and sets named' },
    { label: 'To turn off or trim', value: String(cuts + rows.filter(r => r.kind === 'trim' || r.kind === 'negative').length), sub: 'money that is not coming back' },
    ok(d.load) ? { label: 'Batches of ads to load', value: String(d.load), sub: 'approved and ready' } : { label: 'To scale', value: String(scales), sub: 'beating goal ROAS' },
  ]);
  let primary = false;
  const cards = list.map(g => {
    const first = !primary; primary = true;
    return h('section', { class: 'lx-card flush' },
      h('div', { class: 'ag-sg-h' }, brandName(g, ctx, brandHref(g.id, 'home', 'index')), h('span', { class: 'lx-chip' }, `${g.rows.length} to decide`),
        h('span', { class: 'lx-sp' }), button(`Decide on ${g.name}`, { primary: first, href: brandHref(g.id, id, 'suggestions'), icon: 'arrow' })),
      h('div', { class: 'ag-sg' }, g.rows.map(r => h('div', { class: 'ag-sg-r', 'data-id': r.id != null ? String(r.id) : null },
        h('span', { class: 'k' }, kindPill(r.kind)),
        h('span', { class: 't' }, h('b', null, r.action), r.name ? h('span', { class: 'n' }, r.name) : null, r.why ? h('span', { class: 'w' }, r.why) : null),
        h('span', { class: 'm' }, r.stake > 0 ? money(r.stake) : '', r.stake > 0 ? h('small', null, 'at stake') : null)))));
  });
  const help = helpBar([
    { title: 'What it is for', text: `Every ${name} suggestion waiting across the brands, the biggest money first.` },
    { title: 'Where you decide', text: `This list is read only. Each brand's suggestions are decided on that brand's ${name} page, where Yes makes the change and records it.` },
  ]);
  put(el, h('div', { class: 'ag' }, help, hero, h('div', { class: 'ag', style: { gap: '20px' } }, cards)));
}
export { num };
