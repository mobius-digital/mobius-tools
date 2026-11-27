/* Email & SMS > Flows. "Are the always-on emails earning?"
   Live: flow sales by day against campaigns (Triple Whale, GET /api/hub/email on the profit worker) and every flow
   with its status and results over the last 90 days (Klaviyo, GET /api/klaviyo?what=flows_report on the
   account-health worker). The table is always the last 90 days: Klaviyo reports flows on that window. */

import { put } from '../../kit.js';
import { h, tiles, em, card, kpi, kpis, table, legend, lineChart, statusDot, skeleton, money } from '../../kit.js';
import { ok, usd, rate, sum, shortDate, css, head, barCell, flowStatus, kl, hubEmail, soft, notConnected, num, pct, openFlow, goCell } from './_em.js';
import { dl, rangeWords } from '../home/_biz.js';
import { headRow } from '../platforms/_ads.js';

/* the five flows most stores should have live, and how to spot each by name */
const BASICS = [['Welcome', /welcome/i], ['Abandoned cart', /cart|checkout/i], ['Browse abandonment', /browse/i], ['Post purchase', /post.?purchase|thank|fit check|review/i], ['Win back', /win.?back|winback|lapsed/i]];

function shape(ctx, hub, r) {
  const klOk = !r.error;
  return {
    connected: klOk || ((hub && hub.cur && hub.cur.flows) || 0) > 0, klaviyo: klOk, klaviyo_error: klOk ? null : r.error,
    range: { from: ctx.range.from, to: ctx.range.to },
    days: ((hub && hub.series) || []).map(d => ({ date: d.date, flows: d.flows, campaigns: d.campaigns })),
    flows: klOk ? (r.flows || []).map(f => ({ id: f.id, name: f.name, status: f.status, channels: f.channels || [], recipients: f.recipients, open_rate: f.open_rate, click_rate: f.click_rate,
      sales: f.revenue, orders: f.conversions, order_rate: f.conversion_rate, per_recipient: f.revenue_per_recipient })) : [],
    example: [],
  };
}

function figures(d, W) {
  const flows = d.flows || [], live = flows.filter(f => f.status === 'live'), off = flows.filter(f => f.status && f.status !== 'live');
  const fs = sum(d.days, 'flows'), cs = sum(d.days, 'campaigns'), rec = sum(flows, 'recipients'), sales90 = sum(flows, 'sales');
  const split = fs + cs > 0;
  const el = tiles([
    /* 'no data' only when there is no flow and campaign split at all (as snapshot.js splitOk); a real $0 in flows shows $0 */
    kpi({ label: 'Flow sales', value: split ? usd(fs) : 'no data', window: W, source: 'Triple Whale', sub: split ? 'always-on emails and texts' : 'not split by flow for these dates' }),
    kpi({ label: 'Share of email sales', value: split ? pct(fs / (fs + cs)) : 'no data', window: W, source: 'Triple Whale', sub: 'campaigns made the rest' }),
    kpi({ label: 'Live flows', value: d.klaviyo ? num(live.length) : 'no data', window: 'Right now', source: 'Klaviyo',
      delta: off.length ? statusDot('warn', off.length + ' not live') : null, sub: off.length ? null : d.klaviyo ? 'none switched off' : 'needs the Klaviyo key' }),
    kpi({ label: dl('Sales per message', 'sales_per_message'), value: rec ? money(sales90 / rec, { cents: true }) : 'no data', window: 'Last 90 days', source: "Klaviyo's count", sub: num(rec) + ' messages' }),
  ], { cols: 4 });
  el.classList.add('em-kpis');
  return el;
}

function chartCard(d) {
  const days = d.days || [];
  if (days.length < 2 || !days.some(r => (r.flows || 0) > 0)) return null;
  const b = v => h('b', null, v);
  return card({ class: 'em-chart' },
    head('Sales by day, flows and campaigns', 'Triple Whale\'s count', legend([{ name: 'Flows', lead: true }, { name: 'Campaigns' }])),
    lineChart({
      series: [{ name: 'Flows', lead: true, values: days.map(r => r.flows || 0) }, { name: 'Campaigns', values: days.map(r => r.campaigns || 0) }],
      labels: days.map(r => shortDate(r.date)), format: v => money(v, { compact: true }), height: 340, phoneHeight: 290,
      label: 'Flow sales and campaign sales by day', windowLabel: 'Daily, ' + (d.range ? rangeWords(null, d.range) : ''), name: 'Email',
      hover: i => [b(shortDate(days[i].date)), h('span', null, 'Flows ', b(usd(days[i].flows))), h('span', null, 'Campaigns ', b(usd(days[i].campaigns)))],
    }));
}

function basics(d) {
  const live = (d.flows || []).filter(f => f.status === 'live');
  const all = d.flows || [];
  const dots = BASICS.map(([name, re]) => {
    if (live.some(f => re.test(f.name || ''))) return statusDot('good', name);
    return all.some(f => re.test(f.name || '')) ? statusDot('warn', name + ': built, not live') : statusDot('bad', name + ': missing');
  });
  return card({ title: 'The five every store needs', note: 'matched by flow name' }, h('div', { class: 'em-checks' }, dots));
}

function listCard(d) {
  const rows = d.flows || [], max = Math.max(...rows.map(r => r.sales || 0), 1);
  const ch = r => (r.channels || []).map(c => (c === 'sms' ? 'Text' : 'Email')).join(' and ') || '';
  /* a flow that is off or a draft has no results: one quiet "not running" in the first result column, the rest blank */
  const run = r => r.status === 'live' || (r.recipients || 0) > 0;
  return card({ title: 'Every flow', note: h('span', { class: 'bz-chip' }, 'Last 90 days'), action: h('span', { class: 'em-none' }, 'Klaviyo\'s count, tap one to open it'), flush: true, class: 'em-flush' },
    table({ roomy: true, rows, sort: { key: 'sales', dir: 'desc' }, onRow: r => openFlow(r), empty: 'No flows in this Klaviyo account', cols: [
      { key: 'name', label: 'Flow', class: 'name', render: r => h('span', { class: 'em-name' }, r.name) },
      { key: 'status', label: 'Status', render: r => flowStatus(r.status) },
      { key: 'channels', label: 'Channel', class: 'dim hide-md', render: ch },
      { key: 'recipients', label: 'Messages', num: true, sortable: true, class: 'hide-sm', render: r => (run(r) ? num(r.recipients || 0) : h('span', { class: 'em-none' }, 'not running')) },
      { key: 'open_rate', label: dl('Open rate', 'open_rate'), num: true, sortable: true, class: 'hide-md', render: r => (run(r) ? rate(r.open_rate) : '') },
      { key: 'click_rate', label: dl('Click rate', 'click_rate'), num: true, sortable: true, class: 'hide-md', render: r => (run(r) ? rate(r.click_rate) : '') },
      { key: 'per_recipient', label: dl('Per message', 'sales_per_message'), num: true, sortable: true, class: 'hide-sm', render: r => (run(r) && ok(r.per_recipient) ? money(r.per_recipient, { cents: true }) : '') },
      { key: 'sales', label: 'Sales', num: true, sortable: true, render: r => (run(r) ? barCell(h('span', { class: 'strong' }, usd(r.sales || 0)), (r.sales || 0) / max) : '') },
      { key: 'go', label: '', class: 'em-go', render: goCell },
    ] }));
}

export default {
  title: 'Email flows',
  eyebrow: 'Email & SMS',

  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    const [hub, r] = await Promise.all([soft(ctx, hubEmail(ctx)), kl(ctx, 'flows_report')]);
    return shape(ctx, hub, r);
  },

  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('chart'), skeleton('row', 6)); },

  render(el, d, ctx) {
    css();
    d = d || {};
    if (d.connected === false) {
      put(el, notConnected(ctx, { title: 'Klaviyo is not connected',
        text: 'Flows and their results show here once the brand\'s Klaviyo is connected.',
        teamText: (d.klaviyo_error ? d.klaviyo_error + ' ' : '') + 'Flows are read with the brand\'s own Klaviyo key.' }));
      return;
    }
    put(el, ...[
      headRow({ help: [
        { title: 'What it is for', text: 'Are the always-on emails and texts (welcome, abandoned cart, post purchase and the rest) earning? Tap a flow to open it.' },
        { title: 'Two periods on this page', text: 'Flow sales by day and the share of email sales follow the dates at the top (Triple Whale). Each flow\'s results are Klaviyo\'s own count over the last 90 days, whatever dates are picked.' },
      ] }),
      figures(d, rangeWords(ctx, d.range)),
      chartCard(d),
      d.klaviyo ? basics(d) : null,
      d.klaviyo ? listCard(d) : card({ title: 'Every flow' }, notConnected(ctx, { title: 'Klaviyo is not connected',
        text: 'The list of flows shows here once the brand\'s Klaviyo is connected.', teamText: 'Paste the brand\'s Klaviyo private key in Brand settings, Integrations, to see each flow.' })),
    ].filter(Boolean));
  },
};
