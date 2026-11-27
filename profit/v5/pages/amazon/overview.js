/* Ads > Amazon > Overview. Amazon sales and ad spend: does Amazon grow without leaning on ads?
   Live: sales, ad spend, ROAS and TACOS for the dates, with the window before (see loadTotals in _ui.js).
   No route yet: the week by week chart and the campaign list. Sample mode draws both from the fixture. */

import { put } from '../../kit.js';
import { h, card, kpi, kpis, tiles, delta, takeaway, button, table, statusDot, legend, em, empty, skeleton, pct, sheet, addStyles } from '../../kit.js';
import { css, usd, roas, change, say, weekChart, lockBox, loadTotals, winLabel, wasText, AZ } from './_ui.js';
import { def, headRow } from '../platforms/_ads.js';
import { askWhy } from '../home/_biz.js';

const ok = n => n != null && isFinite(n);
const AZO_CSS = `
.azo-sheet{display:grid;gap:18px}
.azo-sheet .azp-figs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px 14px}
.azo-sheet .azp-figs span{display:grid;gap:2px;min-width:0}
.azo-sheet .azp-figs small{font-size:12px;color:var(--muted)}
.azo-sheet .azp-figs b{font-size:var(--num-m);font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.azo-sheet .azp-note{margin:0;font-size:var(--fs-small,12.5px);color:var(--muted)}
@media (max-width:759px){.azo-sheet .azp-figs{grid-template-columns:repeat(2,minmax(0,1fr))}}`;

function figures(k, w) {
  const wl = winLabel(w);
  const r = ok(k.spend) && ok(k.ad_sales) ? k.ad_sales / k.spend : null;
  const rWas = ok(k.spend_prev) && ok(k.ad_sales_prev) ? k.ad_sales_prev / k.spend_prev : null;
  const tacos = ok(k.sales) && ok(k.spend) ? k.spend / k.sales : null;
  const dSales = change(k.sales, k.sales_prev), dSpend = change(k.spend, k.spend_prev);
  const na = text => h('span', { class: 'az-na' }, text);
  const TW = 'Triple Whale', AZ = "Amazon Ads' own count";
  return tiles([
    ok(k.sales)
      ? kpi({ label: def('Amazon sales', { title: 'Amazon sales', body: 'Every Amazon order in the period, ads or not, at the order value.', source: 'Triple Whale' }), value: usd(k.sales), window: wl, source: TW, delta: dSales != null && delta(dSales, { bad: dSales < 0 }), sub: ok(k.sales_prev) && wasText(k.sales_prev, w, usd) })
      : kpi({ label: 'Amazon sales', value: na('Not connected'), sub: 'No sales source connected' }),
    ok(k.spend)
      ? kpi({ label: 'Amazon ad spend', value: usd(k.spend), window: wl, source: TW, delta: dSpend != null && delta(dSpend, { plain: !(ok(r) && ok(rWas) && r >= rWas) }), sub: ok(k.spend_prev) && wasText(k.spend_prev, w, usd) })
      : kpi({ label: 'Ad spend', value: na('No ads ran'), sub: 'no Amazon ad spend in these dates', window: wl }),
    kpi({ label: def('ROAS, Amazon ads', { title: 'ROAS, Amazon ads', body: 'The sales Amazon Ads credits to its own ads, divided by their spend.', source: 'Amazon Ads (its own count)' }), value: ok(r) ? roas(r) : na('No data'), sub: ok(rWas) ? wasText(rWas, w, roas) : '', window: wl, source: AZ }),
    kpi({ label: def('TACOS', 'tacos'), value: ok(tacos) ? pct(tacos, { digits: 1 }) : na('No data'), sub: 'ad spend over all Amazon sales', window: wl, source: TW }),
  ], { cols: 4 });
}

/* one campaign, every figure Amazon Ads gives for it */
function campaignSheet(r, wl) {
  const f = (label, value) => h('span', null, h('small', null, label), h('b', null, value));
  const ro = r.spend ? r.ad_sales / r.spend : null, acos = r.ad_sales ? r.spend / r.ad_sales : null;
  sheet({ title: r.name, body: h('div', { class: 'azo-sheet' },
    h('p', { class: 'azp-note' }, [r.type ? 'Sponsored ' + r.type : null, r.paused ? 'paused' : 'on', wl, AZ].filter(Boolean).join(' · ')),
    h('div', { class: 'azp-figs' },
      f('Spend', usd(r.spend)), f('Ad sales', usd(r.ad_sales)), f('Orders', ok(r.orders) ? String(r.orders) : 'no data'),
      f('ROAS, Amazon says', roas(ro)), f('ACOS', ok(acos) ? pct(acos, { digits: 1 }) : 'no data'), f('Per order', r.orders ? usd(r.spend / r.orders) : 'no orders')),
    r.flag === 'losing' ? statusDot('bad', 'Losing money: it spends more than its ad sales bring back') : r.flag === 'best' ? statusDot('good', 'Best: the highest return of the campaigns') : null) });
}

function campaigns(c, wl) {
  const flag = r => (r.flag === 'best' ? statusDot('good', 'Best') : r.flag === 'losing' ? statusDot('bad', 'Losing money') : null);
  const rest = c.rest || [];
  let open = false;
  const sink = key => r => (r.more ? -1 : r[key]);      // the "more" line stays at the foot when sorting
  const cell = (r, text) => (r.more ? h('span', { class: 'az-more' }, text) : text);
  const box = h('div');
  const paint = () => {
    const rows = open ? c.rows.concat(rest) : c.rows.slice();
    if (c.more && !open) rows.push({ ...c.more, more: true });
    put(box, table({
      roomy: true,
      cols: [
        { key: 'name', label: 'Campaign', class: 'name', render: r => (r.more ? h('span', { class: 'az-more' }, r.count + ' more campaigns' + (rest.length ? ', tap to show them' : ''))
          : r.total ? r.name : [r.name, r.paused && h('span', { class: 'az-paused' }, 'Paused'), flag(r) && h('span', { class: 'az-flag-s' }, flag(r))]) },
        { key: 'type', label: 'Ad type', class: 'dim hide-sm' },
        { key: 'spend', label: 'Spend', num: true, sortable: true, value: sink('spend'), render: r => cell(r, usd(r.spend)) },
        { key: 'ad_sales', label: def('Ad sales', { title: 'Ad sales', body: 'Sales Amazon Ads credits to the campaign (its own count).', source: 'Amazon Ads' }), num: true, sortable: true, value: sink('ad_sales'), render: r => cell(r, usd(r.ad_sales)) },
        { key: 'orders', label: 'Orders', num: true, class: 'hide-sm', sortable: true, value: sink('orders'), render: r => cell(r, r.orders) },
        { key: 'roas', label: def('ROAS, Amazon says', 'roas'), num: true, sortable: true, value: r => (r.more ? -1 : r.spend ? r.ad_sales / r.spend : 0),
          render: r => h('span', { class: r.more ? 'az-more' : 'strong' }, roas(r.spend ? r.ad_sales / r.spend : null)) },
        { key: 'flag', label: '', class: 'hide-sm', render: flag },
      ],
      rows, sort: { key: 'spend', dir: 'desc' },
      total: c.total && { ...c.total, total: true, name: 'All Amazon ads', type: '' },
      onRow: r => { if (r.more) { if (rest.length) { open = true; paint(); } return; } if (!r.total) campaignSheet(r, wl); },
    }));
  };
  paint();
  const shown = c.rows.length, all = c.count || shown;
  return card({ title: 'Campaigns', note: (all > shown ? `top ${shown} of ${all} by spend · ` : '') + wl + ' · ' + AZ, flush: true, class: 'az-camps' }, box);
}

export default {
  /* the plain question, drawn by the shell above the tabs */
  title: 'Amazon',
  eyebrow: 'Amazon',

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
    const kids = [headRow({ help: [
      { title: 'What it is for', text: 'Whether Amazon sales grow without leaning on ads: Amazon sales, ad spend, ROAS and TACOS for the dates in the page head, against the same number of days before.' },
      { title: 'Where the numbers come from', text: "Amazon sales and ad spend are Triple Whale. Ad sales and campaign numbers are Amazon Ads' own count. Rank research stays in Data Dive." },
    ] }), h('section', { class: 'az-ret' }, h('div', { class: 'lx-sec' }, h('h2', null, 'Amazon sales and ad spend'), h('span', { class: 'note' }, winLabel(d.window) + " · sales and spend Triple Whale, ad sales Amazon Ads' own count")), figures(k, d.window))];
    addStyles('azo-css', AZO_CSS);
    ctx.askWindow = winLabel(d.window);
    ctx.askContext = `Amazon for ${ctx.brand ? ctx.brand.name : 'this brand'}, ${winLabel(d.window)}: sales ${usd(k.sales)}, ad spend ${usd(k.spend)} (Triple Whale), ad sales ${usd(k.ad_sales)} (Amazon Ads' own count).`;
    if (d.take) kids.push(takeaway(say(d.take), { action: !ctx.isClient ? askWhy(ctx, 'How is Amazon doing, and why?') : null }));

    kids.push(card({ class: 'az-chart' },
      h('div', { class: 'lx-chart-h' },
        h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, d.weeks && d.weeks.length ? `Sales and ad spend, last ${d.weeks.length} weeks` : 'Sales and ad spend by week')),
          h('p', { class: 'az-sub' }, d.weeks && d.weeks.length ? `Weeks of ${d.weeks[0].label} to ${d.weeks[d.weeks.length - 1].label}, a fixed window · sales Triple Whale, ad spend Amazon Ads` : 'Amazon, week by week')),
        d.weeks && d.weeks.length ? legend([{ name: 'Sales', lead: true }, { name: 'Ad spend' }]) : null),
      d.weeks && d.weeks.length
        ? weekChart(d.weeks)
        : lockBox('The week by week line is not here yet', 'Triple Whale gives the totals for the dates. The weekly line comes next.', { lock: false })));

    kids.push(d.campaigns && d.campaigns.rows && d.campaigns.rows.length
      ? campaigns(d.campaigns, winLabel(d.window))
      : card({ title: 'Campaigns' }, lockBox("Not connected: needs the owner's Amazon login", 'Spend, ad sales and ROAS for each campaign')));
    put(el, ...kids);
  },
};
