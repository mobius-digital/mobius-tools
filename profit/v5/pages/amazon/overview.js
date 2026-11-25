/* Ads > Amazon > Overview. "Is Amazon growing without ads?"
   Live: sales, ad spend, ROAS and TACOS for the dates, with the window before (see loadTotals in _ui.js).
   No route yet: the week by week chart and the campaign list. Sample mode draws both from the fixture. */

import { put } from '../../kit.js';
import { h, card, kpi, kpis, delta, takeaway, button, table, statusDot, legend, em, empty, skeleton, pct } from '../../kit.js';
import { css, usd, roas, change, say, weekChart, lockBox, loadTotals } from './_ui.js';

const ok = n => n != null && isFinite(n);

function figures(k) {
  const r = ok(k.spend) && ok(k.ad_sales) ? k.ad_sales / k.spend : null;
  const rWas = ok(k.spend_prev) && ok(k.ad_sales_prev) ? k.ad_sales_prev / k.spend_prev : null;
  const tacos = ok(k.sales) && ok(k.spend) ? k.spend / k.sales : null;
  const dSales = change(k.sales, k.sales_prev), dSpend = change(k.spend, k.spend_prev);
  const na = text => h('span', { class: 'az-na' }, text);
  return kpis([
    ok(k.sales)
      ? kpi({ label: 'Sales', value: usd(k.sales), size: 'lg', delta: dSales != null && delta(dSales, { bad: dSales < 0 }), sub: ok(k.sales_prev) && 'was ' + usd(k.sales_prev) })
      : kpi({ label: 'Sales', value: na('Not connected'), size: 'lg', sub: 'No sales source connected' }),
    ok(k.spend)
      ? kpi({ label: 'Ad spend', value: usd(k.spend), size: 'lg', delta: dSpend != null && delta(dSpend, { plain: !(ok(r) && ok(rWas) && r >= rWas) }), sub: ok(k.spend_prev) && 'was ' + usd(k.spend_prev) })
      : kpi({ label: 'Ad spend', value: na('No ads ran'), size: 'lg', sub: 'no Amazon ad spend in these dates' }),
    kpi({ label: 'ROAS', value: ok(r) ? roas(r) : na('No data'), size: 'lg', sub: 'Amazon ads only' + (ok(rWas) ? ', was ' + roas(rWas) : '') }),
    kpi({ label: 'TACOS', value: ok(tacos) ? pct(tacos, { digits: 1 }) : na('No data'), size: 'lg', sub: 'ad spend as a share of all Amazon sales' }),
  ], { cols: 4 });
}

function campaigns(c) {
  const flag = r => (r.flag === 'best' ? statusDot('good', 'Best') : r.flag === 'losing' ? statusDot('bad', 'Losing money') : null);
  const rows = c.rows.slice();
  if (c.more) rows.push({ ...c.more, more: true });
  const sink = key => r => (r.more ? -1 : r[key]);      // the "more" line stays at the foot when sorting
  const cell = (r, text) => (r.more ? h('span', { class: 'az-more' }, text) : text);
  const tbl = table({
    roomy: true,
    cols: [
      { key: 'name', label: 'Campaign', class: 'name', render: r => (r.more ? h('span', { class: 'az-more' }, r.count + ' more campaigns')
        : r.total ? r.name : [r.name, r.paused && h('span', { class: 'az-paused' }, 'Paused'), flag(r) && h('span', { class: 'az-flag-s' }, flag(r))]) },
      { key: 'type', label: 'Ad type', class: 'dim hide-sm' },
      { key: 'spend', label: 'Spend', num: true, sortable: true, value: sink('spend'), render: r => cell(r, usd(r.spend)) },
      { key: 'ad_sales', label: 'Ad sales', num: true, sortable: true, value: sink('ad_sales'), render: r => cell(r, usd(r.ad_sales)) },
      { key: 'orders', label: 'Orders', num: true, class: 'hide-sm', sortable: true, value: sink('orders'), render: r => cell(r, r.orders) },
      { key: 'roas', label: 'ROAS', num: true, sortable: true, value: r => (r.more ? -1 : r.spend ? r.ad_sales / r.spend : 0),
        render: r => h('span', { class: r.more ? 'az-more' : 'strong' }, roas(r.spend ? r.ad_sales / r.spend : null)) },
      { key: 'flag', label: '', class: 'hide-sm', render: flag },
    ],
    rows, sort: { key: 'spend', dir: 'desc' },
    total: c.total && { ...c.total, total: true, name: 'All Amazon ads', type: '' },
  });
  const shown = c.rows.length, all = c.count || shown;
  return card({ title: 'Campaigns', note: (all > shown ? `top ${shown} of ${all} by spend, ` : '') + "Amazon's count", flush: true, class: 'az-camps' }, tbl);
}

export default {
  /* the plain question, drawn by the shell above the tabs */
  title: ['Is Amazon growing ', em('without ads?')],
  eyebrow: 'Amazon only',

  async load(ctx) {
    const t = await loadTotals(ctx);
    return { ...t, take: null, weeks: null, campaigns: null };
  },

  skeleton(el) {
    put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('chart'));
  },

  render(el, d, ctx) {
    css();
    d = d || {};
    const k = d.kpi || {};
    if (!ok(k.sales) && !ok(k.spend)) {
      put(el, empty({
        title: 'No sales source connected',
        text: 'Amazon is not connected in Triple Whale for ' + (ctx.brand ? ctx.brand.name : 'this brand') + ', so there are no Amazon sales or ad spend to show yet.',
      }));
      return;
    }
    const kids = [h('section', { class: 'lx-hero line az-kpis' }, figures(k))];
    if (d.take) kids.push(takeaway(say(d.take), { action: !ctx.isClient ? button('Ask why', { href: ctx.href('ask', 'index') }) : null }));

    kids.push(card({ class: 'az-chart' },
      h('div', { class: 'lx-chart-h' },
        h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'Sales and ad spend by week')),
          h('p', { class: 'az-sub' }, d.weeks && d.weeks.length ? `Amazon, last ${d.weeks.length} full weeks` : 'Amazon, week by week')),
        d.weeks && d.weeks.length ? legend([{ name: 'Sales', lead: true }, { name: 'Ad spend' }]) : null),
      d.weeks && d.weeks.length
        ? weekChart(d.weeks)
        : lockBox('The week by week line is not here yet', 'Triple Whale gives the totals for the dates. The weekly line comes next.', { lock: false })));

    kids.push(d.campaigns && d.campaigns.rows && d.campaigns.rows.length
      ? campaigns(d.campaigns)
      : card({ title: 'Campaigns' }, lockBox("Needs the owner's Amazon login", 'Spend, ad sales and ROAS for each campaign')));

    kids.push(h('p', { class: 'lx-foot' }, "Numbers from Triple Whale. Ad sales are Amazon Ads' own count."));
    put(el, ...kids);
  },
};
