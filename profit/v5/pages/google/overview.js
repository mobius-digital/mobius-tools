/* Ads > Google > Overview for one brand.
   The question: is Google finding new customers at our cost, or only collecting brand searches?
   Four figures, the daily chart, the campaigns, then this week's test and what Google is waiting on.
   Sales, ROAS and new customers are Triple Whale's (last click). "Google says" is Google's own count,
   always second. Spend, clicks and budgets are Google's.

   Real mode: campaigns come from Google Ads, the total and the days from Triple Whale. Triple Whale sales
   per campaign, new customers per campaign, brand against the rest and lost searches have no route yet,
   so those columns and figures are left out (never a zero). The test and the waiting list have no route
   either: they show as examples for the team. */

import { put } from '../../kit.js';
import { h, em, card, button, statusDot, pill, legend, lineChart, table, gauge, money, num, pct, x, sheet, put as putIn } from '../../kit.js';
import { def, defOn, info, headRow, warnLine } from '../platforms/_ads.js';
import { styles, gate, loadOverview, sampleGoogle, fig, figs, TWS, GADS, GSAYS, none, say, ok, div, usd, usd2, shortDate, roasText, roasRead, costRead, goalGauge, exampleChip, isEx, askButton, strip } from './_g.js';

/* ---------- the status line: is Google's count close to Triple Whale's ---------- */
function statusLine(d) {
  const t = d.overview.totals;
  if (!d.sales_source || !ok(t.google_sales) || !ok(t.sales) || !(t.sales > 0)) return null;
  const gap = Math.abs(t.google_sales / t.sales - 1), tone = gap <= 0.1 ? 'good' : gap <= 0.3 ? 'warn' : 'bad';
  const words = h('span', null, def("Google's own count", 'google_says'), ` is ${pct(gap)} ${t.google_sales > t.sales ? 'over' : 'under'} Triple Whale: ${usd(t.google_sales, d.currency)} against ${usd(t.sales, d.currency)}, ${d.window.label}`);
  return h('div', { class: 'gg-status' }, statusDot(tone, words));
}

/* ---------- the four figures ---------- */
function figures(d, ctx) {
  const cur = d.currency, o = d.overview, t = o.totals, g = d.goals || {}, sp = o.split, noSales = !d.sales_source;
  const out = [], W = d.window.label;
  const days = o.series || [], dl = days.length > 1 ? days.map(r => shortDate(r.date)) : null;
  out.push(fig({ label: 'Google spend', value: usd(t.spend, cur), win: W, source: GADS, spark: dl ? days.map(r => +r.spend || 0) : null, sparkLabels: dl, sparkFormat: v => usd(v, cur),
    sub: ok(t.share_of_ads) ? pct(t.share_of_ads) + ' of all ad spend' : '',
    more: ok(t.cpc) ? 'Cost per click ' + usd2(t.cpc, cur) + (ok(t.cpc_prev) ? ', was ' + usd2(t.cpc_prev, cur) + ' the dates before' : '') : null }));
  if (sp) {
    /* the full design: the non-brand side is the one that finds new people */
    const rr = roasRead(sp.other.roas, g.roas), cr = costRead(sp.other.cost_new, g.ncpa);
    out.push(fig({ label: h('span', null, def('ROAS', 'roas'), ', all except brand search'), value: noSales ? none() : x(sp.other.roas), win: W, source: noSales ? null : TWS,
      sub: noSales ? '' : [rr && statusDot(rr[0], rr[1])], more: noSales ? null : usd(sp.other.sales, cur) + ' in sales on ' + usd(sp.other.spend, cur) + ' of spend',
      says: !noSales && ok(sp.other.google_roas) ? 'Google says ' + x(sp.other.google_roas) : null,
      extra: noSales ? null : goalGauge(sp.other.roas, g.roas, 'goal ' + x(g.roas)) }));
    out.push(fig({ label: h('span', null, def('New customer cost', 'ncpa'), ', same campaigns'), value: noSales ? none() : usd(sp.other.cost_new, cur), win: W, source: noSales ? null : TWS,
      sub: noSales ? '' : [cr && statusDot(cr[0], cr[1]), ' ', num(sp.other.new_customers) + ' new customers'],
      extra: noSales ? null : goalGauge(sp.other.cost_new, g.ncpa, 'goal ' + usd(g.ncpa, cur), usd(0, cur)) }));
    const share = div(sp.brand.sales, sp.brand.sales + sp.other.sales), spendShare = div(sp.brand.spend, sp.brand.spend + sp.other.spend);
    out.push(fig({ label: h('span', null, def('Brand search', 'brand_share'), ' share of Google sales'), value: noSales ? none() : pct(share), win: W, source: noSales ? null : TWS,
      sub: noSales ? '' : 'on ' + pct(spendShare) + ' of the spend',
      more: !noSales && ok(sp.brand.new_customers) ? `${num(sp.brand.new_customers)} of brand search's ${num(sp.brand.orders)} orders were new customers` : null,
      extra: noSales ? null : gauge({ value: share * 100, max: 100, goal: spendShare * 100, ticks: [{ at: spendShare * 100, text: pct(spendShare) + ' of spend', on: true }] }) }));
  } else {
    /* real mode today: the whole of Google, on Triple Whale */
    const rr = roasRead(t.roas, g.roas), cr = costRead(t.cost_sale, g.cpa);
    out.push(fig({ label: h('span', null, 'Google ', def('ROAS', 'roas')), value: noSales ? none() : x(t.roas), win: W, source: noSales ? null : TWS,
      sub: noSales ? '' : [rr && statusDot(rr[0], rr[1]), !g.roas ? 'no goal set' : ''],
      says: ok(t.google_roas) ? 'Google says ' + x(t.google_roas) : null,
      extra: noSales ? null : goalGauge(t.roas, g.roas, 'goal ' + x(g.roas)) }));
    out.push(fig({ label: 'Sales from Google ads', value: noSales ? none() : usd(t.sales, cur), win: W, source: noSales ? null : TWS,
      sub: noSales ? '' : ok(t.orders) ? num(t.orders) + ' orders' : '',
      says: ok(t.google_sales) ? 'Google says ' + usd(t.google_sales, cur) : null }));
    out.push(fig({ label: def('Cost per sale', 'cpa'), value: noSales ? none() : usd(t.cost_sale, cur), win: W, source: noSales ? null : TWS,
      sub: noSales ? '' : [cr && statusDot(cr[0], cr[1]), !g.cpa ? 'no goal set' : ''],
      extra: noSales ? null : goalGauge(t.cost_sale, g.cpa, 'goal ' + usd(g.cpa, cur), usd(0, cur)) }));
  }
  return h('section', { class: 'gg-ret' }, h('div', { class: 'lx-sec' }, h('h2', null, 'Return on Google ads'), h('span', { class: 'note' }, W + ' · sales ' + TWS + ', spend Google Ads')), figs(out));
}

/* ---------- the daily chart: spend columns (brand search in gray on top when known), sales as the lead line ---------- */
function chartCard(d) {
  const cur = d.currency, rows = d.overview.series || [], hasSales = !!d.sales_source && rows.some(r => ok(r.sales));
  if (!rows.length) return null;
  const spend = rows.map(r => +r.spend || 0), hasSplit = rows.some(r => ok(r.brand)), other = rows.map(r => (+r.spend || 0) - (+r.brand || 0));
  const sales = rows.map(r => (ok(r.sales) ? r.sales : null)), prev = rows.map(r => (ok(r.prev_spend) ? r.prev_spend : null)), hasPrev = prev.some(ok);
  const b = v => h('b', null, v);
  const notes = (d.overview.notes || []).map(n => ({ index: rows.findIndex(r => r.date === n.date), text: n.text })).filter(n => n.index >= 0);
  const narrow = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
  const plot = lineChart({
    slots: false,
    series: [
      { type: 'bar', tone: 'dim', name: 'Spend', values: spend },
      hasSplit && { type: 'bar', tone: 'slate', name: 'All except brand search', values: other },
      hasPrev && { name: 'Spend, the days before', dashed: true, values: prev },
      hasSales && { name: 'Sales from Google ads', lead: true, values: sales, end: v => usd(v, cur) },
    ],
    labels: rows.map(r => shortDate(r.date)),
    notes: narrow ? notes.map((n, k) => ({ index: n.index, text: String(k + 1) })) : notes,
    format: v => money(v, { cur, compact: true }),
    height: 360, empty: 'No spend on these dates', windowLabel: 'Daily, ' + d.window.label, name: 'Google',
    label: `Google spend${hasSales ? ' and sales from Google ads' : ''} by day, ${d.window.label}`,
    hover: i => [b(shortDate(rows[i].date)), h('span', null, 'Spend ', b(usd(spend[i], cur))),
      hasSplit ? h('span', null, 'Brand search ', b(usd(rows[i].brand, cur))) : null,
      hasSales && ok(sales[i]) ? h('span', null, 'Sales ', b(usd(sales[i], cur))) : null,
      hasSales && spend[i] > 0 && ok(sales[i]) ? h('span', null, 'ROAS ', b(x(sales[i] / spend[i]))) : null],
  });
  return card({ class: 'gg-chart' },
    h('div', { class: 'lx-chart-h' },
      h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, hasSales ? 'Sales and spend by day' : 'Spend by day')),
        h('p', null, hasSales ? 'Sales Triple Whale, last click, spend Google Ads' : 'No sales source connected, so this is spend only')),
      legend([hasSales && { name: 'Sales from Google ads', lead: true },
        hasSplit ? { name: 'Spend, all except brand search', square: true, color: 'var(--slate)' } : { name: 'Spend', square: true, color: 'var(--line-strong)' },
        hasSplit && { name: 'Spend, brand search', square: true, color: 'var(--line-strong)' },
        hasPrev && { name: 'Spend, the days before', dashed: true }])),
    plot,
    narrow && notes.length ? h('p', { class: 'gg-legend' }, notes.map((n, k) => h('span', null, h('b', null, String(k + 1)), shortDate(rows[n.index].date) + ': ' + n.text))) : null);
}

/* ---------- campaigns ---------- */
function campaignsCard(d, ctx) {
  const cur = d.currency, o = d.overview, g = d.goals || {}, rows = (o.campaigns || []).filter(c => c.spend > 0 || c.status === 'on');
  if (!rows.length) return null;
  const tw = rows.some(c => ok(c.sales)), nc = rows.some(c => ok(c.new_customers)), lost = rows.some(c => ok(c.lost_budget) || ok(c.lost_rank));
  const says = c => (ok(c.google_roas) ? x(c.google_roas) : 'no data');
  const few = c => ok(c.orders) && c.orders < 2;
  let more = !!ctx.settingNow('google.campaigns.more', false);
  const nameCell = c => c.sub === false ? h('span', { class: 'gg-cn' }, h('b', null, c.name))
    : h('span', null, h('span', { class: 'gg-cn' }, h('b', { title: c.name }, c.name), c.first_touch ? info({ title: 'Opens journeys', body: 'This campaign starts more journeys than it finishes, so its last click sales read low. Its first click sales are higher.' }) : null),
      h('span', { class: 'gg-ctype' }, c.type ? h('span', { class: 'lx-chip', style: { height: '20px', fontSize: '11px' } }, c.type) : null, c.status ? statusDot(c.status === 'on' ? 'good' : 'off', c.status === 'on' ? 'On' : 'Paused') : null));
  const cols = () => [
    { key: 'name', label: 'Campaign', class: 'name', render: nameCell },
    more && { key: 'budget', label: def('Budget a day', 'budget_a_day'), num: true, class: 'hide-sm', render: c => (ok(c.budget) ? usd(c.budget, cur) : '') },
    { key: 'spend', label: 'Spend', num: true, sortable: true, render: c => usd(c.spend, cur) },
    tw && { key: 'sales', label: 'Sales', num: true, sortable: true, class: 'hide-sm', render: c => (ok(c.sales) ? usd(c.sales, cur) : 'no data') },
    tw && { key: 'roas', label: def('ROAS', 'roas'), num: true, sortable: true, class: 'strong', render: c => h('span', { class: !few(c) && !c.total && g.roas && ok(c.roas) && c.roas < g.roas ? 'neg' : few(c) ? 'dim' : '' }, roasText(c.roas, c.orders)) },
    nc && { key: 'new_customers', label: 'New customers', num: true, sortable: true, class: 'hide-md', render: c => (ok(c.new_customers) ? num(c.new_customers) : '') },
    nc && { key: 'cost_new', label: def('New customer cost', 'ncpa'), num: true, sortable: true, class: 'hide-sm', render: c => (few(c) ? h('span', { class: 'dim' }, 'too few') : ok(c.cost_new) ? h('span', { class: g.ncpa && c.cost_new > g.ncpa ? 'neg' : '' }, usd(c.cost_new, cur)) : '') },
    { key: 'google_roas', label: def('Google says', 'google_says'), num: true, sortable: true, class: tw ? 'gg-says hide-sm' : 'gg-says', render: says },
    !tw && { key: 'google_sales', label: def('Sales, Google says', 'google_says'), num: true, sortable: true, class: 'gg-says hide-sm', render: c => (ok(c.google_sales) ? usd(c.google_sales, cur) : 'no data') },
    more && lost && { key: 'lost_budget', label: def('Lost to budget', 'lost_to_budget'), num: true, class: 'hide-md', render: c => (ok(c.lost_budget) ? pct(c.lost_budget) : c.total ? '' : 'n/a') },
    more && lost && { key: 'lost_rank', label: def('Lost to rank', 'lost_to_rank'), num: true, class: 'hide-md', render: c => (ok(c.lost_rank) ? pct(c.lost_rank) : c.total ? '' : 'n/a') },
  ].filter(Boolean);
  const t = o.totals, sp = o.split;
  const all = [...rows];
  if (false) all.push({ total: true, sub: false, name: 'All except brand search', budget: sp.other.budget, spend: sp.other.spend, sales: sp.other.sales, roas: sp.other.roas, orders: sp.other.orders, new_customers: sp.other.new_customers, cost_new: sp.other.cost_new, google_roas: sp.other.google_roas });
  const total = { total: true, sub: false, name: 'All of Google', budget: o.budget_total, spend: t.spend, sales: t.sales, roas: t.roas, orders: t.orders, new_customers: t.new_customers, cost_new: t.cost_new, google_roas: t.google_roas, google_sales: t.google_sales };
  const goalWords = [g.roas ? 'Goal ' + x(g.roas) : null, g.ncpa ? usd(g.ncpa, cur) + ' a new customer' : null].filter(Boolean).join(', ');
  const box = h('div');
  const paint = () => putIn(box, table({ roomy: true, rows: all, cols: cols(), total, sort: { key: 'spend', dir: 'desc' }, onRow: c => campaignSheet(c, d) }),
    h('div', { class: 'gg-more-cols' }, button(more ? 'Fewer columns' : 'More columns: budget, lost to budget and rank', { onclick: () => { more = !more; ctx.saveSetting('google.campaigns.more', more); paint(); } })));
  paint();
  return card({ title: 'Campaigns', note: d.window.label + ' · ' + (tw ? 'sales and ROAS Triple Whale, last click' : 'sales are Google’s own count'), flush: true, class: 'gg-camps',
    action: goalWords ? h('span', { class: 'gg-says' }, goalWords) : null },
    box,
    !tw ? h('p', { class: 'gg-quiet', style: { paddingTop: '14px' } }, 'Triple Whale sales, new customers and lost searches per campaign are not read yet, so they are left out here.') : null,
    o.paused ? h('p', { class: 'gg-quiet', style: { paddingTop: '14px' } }, `${o.paused} paused campaigns with no spend on these dates are not listed.`) : null);
}

/* one campaign, every figure */
function campaignSheet(c, d) {
  const cur = d.currency, kv = (label, key, value) => value == null || value === '' ? null : h('div', null, h('span', { class: 'l' }, key ? def(label, key) : label), h('b', null, value));
  sheet({ title: c.name, body: h('div', { class: 'gg-sh' },
    h('p', { class: 'gg-says' }, [c.type, c.status === 'on' ? 'on' : c.status ? 'paused' : null, 'Google, ' + d.window.label].filter(Boolean).join(', ')),
    h('div', { class: 'g' },
      kv('Budget a day', null, ok(c.budget) ? usd(c.budget, cur) : null), kv('Spend', null, usd(c.spend, cur)),
      kv('Sales, Triple Whale', null, ok(c.sales) ? usd(c.sales, cur) : null), kv('ROAS', 'roas', ok(c.roas) ? x(c.roas) : null),
      kv('Orders', null, ok(c.orders) ? num(c.orders) : null), kv('New customers', null, ok(c.new_customers) ? num(c.new_customers) : null),
      kv('New customer cost', 'ncpa', ok(c.cost_new) ? usd(c.cost_new, cur) : null), kv("ROAS, Google's own count", 'google_says', ok(c.google_roas) ? x(c.google_roas) : null),
      kv('Lost to budget', 'lost_to_budget', ok(c.lost_budget) ? pct(c.lost_budget) : null), kv('Lost to rank', 'lost_to_rank', ok(c.lost_rank) ? pct(c.lost_rank) : null)),
    c.first_touch ? h('p', { class: 'gg-says' }, 'This campaign starts more journeys than it finishes, so its last click sales read low.') : null) });
}

/* ---------- this week's test, and what Google is waiting on (team only) ---------- */
function testCard(d) {
  const t = d.overview.test; if (!t) return null;
  const p = v => pct(v, { digits: 2 });
  return card({ title: 'This week’s test', note: t.by ? 'from ' + t.by + '’s Monday plan' : null, action: isEx(d, 'test') ? exampleChip() : statusDot('info', t.status || 'Running') },
    h('div', { class: 'gg-test' },
      h('h4', null, t.title),
      h('div', { class: 'gg-says' }, 'Measured on ' + String(t.number || '').toLowerCase() + '.'),
      h('div', { class: 'gg-test-n' },
        h('span', null, h('span', { class: 'gg-tl' }, 'Started'), h('b', null, p(t.from))),
        h('span', null, h('span', { class: 'gg-tl' }, 'Now'), h('b', null, p(t.now))),
        h('span', null, h('span', { class: 'gg-tl' }, 'Goal'), h('b', null, p(t.to))),
        h('span', null, h('span', { class: 'gg-tl' }, 'Result on'), h('b', null, t.read_on))),
      gauge({ value: t.now, max: t.to, goal: t.from, ticks: [{ at: t.from, text: 'start ' + p(t.from), on: true }, { side: 'r', text: 'goal ' + p(t.to) }] })));
}
function waitingCard(d, ctx) {
  const w = d.overview.waiting; if (!w || !w.length) return null;
  return card({ title: 'Waiting on', note: 'open asks that hold Google back', action: isEx(d, 'waiting') ? exampleChip() : h('a', { href: ctx.href('requests', 'index') }, 'Requests') },
    w.map(r => h('a', { class: 'gg-wait', href: ctx.href('requests', 'index'), title: 'Open the request' }, h('span', { class: 'tx' }, h('b', null, r.title), h('span', null, r.who)), statusDot(r.tone || 'warn', r.state))));
}

export default {
  title: 'Google ads',
  eyebrow: 'Google',
  load: loadOverview,
  sample: sampleGoogle,
  render(el, d, ctx) {
    styles();
    const stop = gate(d, ctx);
    if (stop) return put(el, stop);
    const o = d.overview, t = o.totals, cur = d.currency, g = d.goals || {}, team = !ctx.isClient;
    if (!(t.spend > 0) && !(o.campaigns || []).length) return put(el, strip({ title: 'No Google spend on these dates', text: 'Nothing spent on Google Ads for ' + d.window.label + '. Pick other dates in the page head.' }));
    ctx.askWindow = d.window.label;
    ctx.askContext = `Google for ${ctx.brand.name || 'this brand'}, ${d.window.label}: spend ${usd(t.spend, cur)}` + (d.sales_source ? `, sales from Google ads ${usd(t.sales, cur)} (Triple Whale last click), ROAS ${x(t.roas)}${g.roas ? ' against a ' + x(g.roas) + ' goal' : ''}` : ', no sales source connected') + (ok(t.google_sales) ? `. Google's own count says ${usd(t.google_sales, cur)}.` : '.') + ` ${(o.campaigns || []).length} campaigns.`;
    const help = [
      { title: 'What it is for', text: 'Whether Google finds new customers at the brand\'s cost, or only collects people who searched for the brand anyway. Tap a campaign for all of its numbers.' },
      { title: 'Where the numbers come from', text: 'Sales, ROAS and new customers are Triple Whale, last click per platform. Spend, clicks and budgets are Google Ads. "Google says" is Google\'s own count, always second.' },
    ];
    put(el, ...[
      headRow({ help, ask: team ? (o.suggestions ? button(`See ${o.suggestions} suggestions`, { href: ctx.href('google', 'suggestions') }) : askButton(ctx)) : null }),
      d.totals_only ? strip({ title: 'Google Ads is not connected', text: 'These are Triple Whale totals only. Campaigns, search terms and changes show once the account is connected.',
        action: team ? button('Open integrations', { href: ctx.href('brand-settings', 'integrations'), icon: 'arrow' }) : null }) : null,
      statusLine(d),
      figures(d, ctx),
      chartCard(d),
      campaignsCard(d, ctx),
      team && (o.test || o.waiting) ? h('div', { class: 'gg-two' }, testCard(d), waitingCard(d, ctx)) : null,
    ].filter(Boolean));
  },
};
