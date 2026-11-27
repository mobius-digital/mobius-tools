/* Agency > Google > Overview. Is Google paying for itself, brand by brand? Read only.
   Spend is Google Ads'; sales and ROAS are Triple Whale, last platform click (never Google's own conversions).
   Same data as before (the shared platform loader in a-today/_more.js), drawn the batch 1 way like the agency
   Meta overview: kit tiles with window and source, the daily chart with its window label, the brand table. */
import { put, h, money, x, kpi, kpis, tiles, delta, legend, lineChart, empty, addStyles, gauge } from '../../kit.js';
import { loadPlatform, samplePlatform } from '../a-today/_more.js';
import { def, headRow } from '../platforms/_ads.js';
import { style as agStyle, ok, sumOf, brandRows, brandName, brandHref, quiet, shortDay, roasTone, against, statusDot } from '../a-today/_ag.js';

const TW = 'Triple Whale, last click';
const CSS = `
.am{display:grid;gap:var(--gap-5,24px);min-width:0}
.am .lx-kpis{min-width:0}
.am .lx-kpi>.lx-gauge{margin-top:auto;padding-top:12px}
@media (max-width:759px){
  .am .lx-spark-ax{flex-wrap:wrap;row-gap:2px}
  .am .lx-spark-ax .m{order:3;flex-basis:100%;margin:0;text-align:left;overflow:visible;white-space:normal}
}`;

/* "Nov 1 to 22" in one month, "Oct 28 to Nov 3" across two */
const day = d => new Date(String(d).slice(0, 10) + 'T12:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
const addDays = (date, n) => { const d = day(date); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
function rangeLabel(from, to) {
  if (!from || !to) return '';
  if (from === to) return shortDay(from);
  const a = day(from), b = day(to);
  return a.getUTCMonth() === b.getUTCMonth() ? `${shortDay(from)} to ${b.getUTCDate()}` : `${shortDay(from)} to ${shortDay(to)}`;
}
/* the period of the same length just before */
function prevWindow(from, to) {
  if (!from || !to) return null;
  const n = Math.round((day(to) - day(from)) / 864e5) + 1;
  const pto = addDays(from, -1);
  return { from: addDays(pto, -(n - 1)), to: pto };
}

function render(el, d, ctx) {
  agStyle(); addStyles('am-css', CSS);
  if (!d || !d.brands || !d.brands.length) return put(el, empty({ title: 'No Google spend on these dates', text: 'Pick other dates, or connect the ad account on a brand.' }));
  const w = d.window || {}, wl = rangeLabel(w.from, w.to), pw = prevWindow(w.from, w.to), pl = pw ? rangeLabel(pw.from, pw.to) : 'the days before';
  const rows = d.brands.map(b => ({ ...b, tone: roasTone(b.roas, b.goal_roas), href: brandHref(b.id, 'google', 'overview') }));
  const withSales = rows.filter(b => ok(b.sales));
  const spend = sumOf(rows, b => b.spend), before = sumOf(rows, b => b.before), spendS = sumOf(withSales, b => b.spend), sales = sumOf(withSales, b => b.sales);
  const roas = spendS > 0 && ok(sales) ? sales / spendS : null;
  const under = rows.filter(b => b.tone === 'bad' || b.tone === 'warn'), noSrc = rows.filter(b => b.spend > 0 && !ok(b.sales));
  const change = before > 0 && ok(spend) ? spend / before - 1 : null;
  const dl = d.daily, dates = dl ? dl.dates.map(shortDay) : null;

  ctx.askWindow = wl || null;
  ctx.askContext = `Google across every brand, ${wl}: spend ${money(spend)}`
    + (ok(sales) ? `, sales ${money(sales)} (Triple Whale last click), ROAS ${x(roas)}` : '')
    + `. ${under.length} of ${withSales.length} brands with a sales source are under their goal ROAS.`;

  const tileRow = tiles([
    kpi({ label: 'Google spend, all brands', value: money(spend), window: wl, source: 'Google Ads',
      sub: change == null ? `${rows.length} brands` : [delta(change, { plain: true }), ' vs ' + pl],
      /* every tile carries its daily line, or none does: with no daily sales only the spend tile could, and one lone line stretches the row */
      spark: dl && dl.has_sales ? dl.spend : null, sparkLabels: dates, sparkFormat: v => money(v) }),
    kpi({ label: 'Sales from Google ads', value: ok(sales) ? money(sales) : quiet('no data'), window: wl, source: 'Triple Whale',
      sub: noSrc.length ? `${noSrc.length} brand${noSrc.length === 1 ? '' : 's'} with no sales source left out` : '',
      spark: dl && dl.has_sales ? dl.sales : null, sparkLabels: dates, sparkFormat: v => money(v) }),
    kpi({ label: def('ROAS', 'roas'), value: ok(roas) ? x(roas) : quiet('no data'), window: wl, source: 'Triple Whale', sub: 'brands with a sales source',
      spark: dl && dl.has_sales ? dl.sales.map((v, i) => (dl.spend[i] > 0 && v != null ? v / dl.spend[i] : null)) : null, sparkLabels: dates, sparkFormat: v => x(v) }),
    kpi({ label: 'Brands under goal ROAS', value: String(under.length), window: wl, source: 'Triple Whale',
      sub: under.length ? under.map(b => b.name).slice(0, 2).join(', ') + (under.length > 2 ? ` and ${under.length - 2} more` : '') : `of ${withSales.length} with a goal` }),
  ], { cols: 4 });
  /* the fourth tile has no daily line: a bar of how many brands are under goal fills it, so the row reads as one */
  const last = tileRow.lastElementChild;
  if (last && withSales.length && dl && dl.has_sales) last.append(gauge({ value: under.length, max: withSales.length, tone: under.length ? 'bad' : 'good', thin: true, ticks: [{ side: 'l', text: '0' }, { side: 'r', text: `${withSales.length} brands` }] }));

  let chart = null;
  if (dl && dl.dates.length > 1) {
    const both = dl.has_sales, bb = v => h('b', null, v);
    chart = h('section', { class: 'lx-card ag-chart' },
      h('div', { class: 'lx-chart-h' }, h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, both ? 'Sales and spend by day' : 'Spend by day')),
        h('p', null, both ? `Every brand added up · sales ${TW}, spend Google Ads` : 'Every brand added up · spend Google Ads')),
        both ? legend([{ name: 'Sales', lead: true }, { name: 'Spend' }]) : null),
      lineChart({ series: [both && { name: 'Sales', lead: true, values: dl.sales }, { name: 'Spend', lead: !both, values: dl.spend }].filter(Boolean),
        labels: dates, format: v => money(v, { compact: true }), endFormat: v => money(v), height: 340, windowLabel: 'Daily, ' + wl, name: 'Google',
        label: `Google by day for every brand, ${wl}`,
        hover: i => [bb(dates[i]), both && h('span', null, 'Sales ', bb(money(dl.sales[i]))), h('span', null, 'Spend ', bb(money(dl.spend[i])))].filter(Boolean) }));
  }

  const state = r => !ok(r.sales) ? quiet('No sales source') : !ok(r.goal_roas) ? statusDot('off', 'No goal set') : statusDot(r.tone, r.roas >= r.goal_roas ? 'At goal' : 'Under goal');
  const chg = r => r.before > 0 && ok(r.spend) ? r.spend / r.before - 1 : null;
  const total = { total: true, name: 'All brands', spend, sales, before, roas };
  const tbl = brandRows({
    title: 'Brand by brand', note: `${wl} · sales and ROAS ${TW}`, sort: { key: 'spend', dir: 'desc' }, rows, total,
    cols: [
      { key: 'name', label: 'Brand', class: 'name', render: r => r.total ? r.name : brandName(r, ctx, r.href) },
      { key: 'spend', label: 'Spend', num: true, sortable: true, class: 'strong', value: r => r.spend ?? -1, render: r => [money(r.spend), chg(r) != null ? h('span', { class: 'sub' }, Math.abs(chg(r)) < 0.005 ? 'same' : delta(chg(r), { plain: true })) : null] },
      { key: 'sales', label: 'Sales', num: true, sortable: true, class: 'hide-sm', value: r => r.sales ?? -1, render: r => ok(r.sales) ? money(r.sales) : quiet('no data') },
      { key: 'roas', label: def('ROAS, Triple Whale last click', 'roas'), num: true, sortable: true, value: r => r.roas ?? -1, render: r => ok(r.roas) ? [x(r.roas), ok(r.goal_roas) && !r.total ? h('span', { class: 'sub' }, `goal ${x(r.goal_roas)}`) : null] : quiet('no data') },
      { key: 'g', label: 'Against goal', width: 170, class: 'g hide-md', render: r => r.total ? '' : ok(r.roas) && ok(r.goal_roas) ? against(r.roas, r.goal_roas, r.tone) : '' },
      { key: 'cost', label: def('Cost per sale', 'cpa'), num: true, class: 'hide-md', render: r => r.total ? '' : ok(r.cost) ? [money(r.cost), ok(r.goal_cost) ? h('span', { class: 'sub' }, `goal ${money(r.goal_cost)}`) : null] : quiet('no data') },
      { key: 'st', label: 'Status', render: r => r.total ? '' : state(r) },
    ],
    item: (r, isTotal) => ({ href: r.href, head: isTotal ? h('b', null, r.name) : brandName(r, ctx), tail: isTotal ? null : state(r),
      figs: [['Spend', money(r.spend)], ['Sales', ok(r.sales) ? money(r.sales) : quiet('no data')], ['ROAS', ok(r.roas) ? x(r.roas) + (ok(r.goal_roas) && !isTotal ? ` of ${x(r.goal_roas)}` : '') : quiet('no data')]],
      gauge: !isTotal && ok(r.roas) && ok(r.goal_roas) ? against(r.roas, r.goal_roas, r.tone) : null }),
  });
  const help = headRow({ help: [
    { title: 'What it is for', text: 'Google across every brand: spend, the sales it brought in and its ROAS against each brand\'s goal.' },
    { title: 'How it is counted', text: `Spend is Google Ads' own. Sales and ROAS are Triple Whale, last platform click, so they will not match Google's own conversions. A brand with no sales source shows no sales figure.${d.days_missing ? ` ${d.days_missing} brand${d.days_missing === 1 ? '' : 's'} did not answer for the day by day chart.` : ''}` },
  ] });
  put(el, h('div', { class: 'ag am' }, help, tileRow, chart, tbl));
}

export default {
  title: 'Google, all brands',
  eyebrow: 'Google',
  load: ctx => loadPlatform(ctx, 'google'),
  sample: () => samplePlatform('google'),
  render,
};
