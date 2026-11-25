/* Email & SMS > Flows. "Are the always-on emails earning?"
   Live: flow sales by day against campaigns (Triple Whale, GET /api/hub/email on the profit worker) and every flow
   with its status and results over the last 90 days (Klaviyo, GET /api/klaviyo?what=flows_report on the
   account-health worker). The table is always the last 90 days: Klaviyo reports flows on that window. */

import { put } from '../../kit.js';
import { h, em, card, kpi, kpis, table, legend, lineChart, statusDot, skeleton, money } from '../../kit.js';
import { ok, usd, rate, sum, shortDate, css, head, barCell, flowStatus, kl, hubEmail, soft, notConnected, num, pct } from './_em.js';

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

function figures(d) {
  const flows = d.flows || [], live = flows.filter(f => f.status === 'live'), off = flows.filter(f => f.status && f.status !== 'live');
  const fs = sum(d.days, 'flows'), cs = sum(d.days, 'campaigns'), rec = sum(flows, 'recipients'), sales90 = sum(flows, 'sales');
  const el = kpis([
    kpi({ label: 'Flow sales', size: 'lg', value: d.days && d.days.length ? usd(fs) : 'no data', sub: 'in these dates', spark: (d.days || []).map(r => r.flows || 0) }),
    kpi({ label: 'Share of email sales', size: 'lg', value: fs + cs > 0 ? pct(fs / (fs + cs)) : 'no data', sub: 'campaigns made the rest' }),
    kpi({ label: 'Live flows', size: 'lg', value: d.klaviyo ? num(live.length) : 'no data',
      delta: off.length ? statusDot('warn', off.length + ' not live') : null, sub: off.length ? null : d.klaviyo ? 'none switched off' : 'needs the Klaviyo key' }),
    kpi({ label: 'Sales per message', size: 'lg', value: rec ? money(sales90 / rec, { cents: true }) : 'no data', sub: 'last 90 days' }),
  ], { cols: 4 });
  el.classList.add('em-kpis');
  return el;
}

function chartCard(d) {
  const days = d.days || [];
  if (days.length < 2 || !days.some(r => (r.flows || 0) > 0)) return null;
  const b = v => h('b', null, v);
  return card({ class: 'em-chart' },
    head('Flows are the base, campaigns are the spikes', 'Sales by day', legend([{ name: 'Flows', lead: true }, { name: 'Campaigns' }])),
    lineChart({
      series: [{ name: 'Flows', lead: true, values: days.map(r => r.flows || 0) }, { name: 'Campaigns', values: days.map(r => r.campaigns || 0) }],
      labels: days.map(r => shortDate(r.date)), format: v => money(v, { compact: true }), height: 340, phoneHeight: 290,
      label: 'Flow sales and campaign sales by day',
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
  return card({ title: 'Every flow', note: 'last 90 days, Klaviyo\'s count', flush: true, class: 'em-flush' },
    table({ roomy: true, rows, sort: { key: 'sales', dir: 'desc' }, empty: 'No flows in this Klaviyo account', cols: [
      { key: 'name', label: 'Flow', class: 'name', render: r => h('span', { class: 'em-name' }, r.name) },
      { key: 'status', label: 'Status', render: r => flowStatus(r.status) },
      { key: 'channels', label: 'Sends', class: 'dim hide-md', render: ch },
      { key: 'recipients', label: 'Messages', num: true, sortable: true, class: 'hide-sm', render: r => (r.recipients ? num(r.recipients) : h('span', { class: 'em-none' }, 'none')) },
      { key: 'open_rate', label: 'Open rate', num: true, sortable: true, class: 'hide-md', render: r => rate(r.open_rate) },
      { key: 'click_rate', label: 'Click rate', num: true, sortable: true, class: 'hide-md', render: r => rate(r.click_rate) },
      { key: 'per_recipient', label: 'Per message', num: true, sortable: true, class: 'hide-sm', render: r => (ok(r.per_recipient) ? money(r.per_recipient, { cents: true }) : h('span', { class: 'em-none' }, 'none')) },
      { key: 'sales', label: 'Sales', num: true, sortable: true, render: r => barCell(h('span', { class: 'strong' }, usd(r.sales || 0)), (r.sales || 0) / max) },
    ] }));
}

export default {
  title: ['Are the always-on emails ', em('earning?')],
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
      h('section', { class: 'lx-hero line' }, figures(d)),
      chartCard(d),
      d.klaviyo ? basics(d) : null,
      d.klaviyo ? listCard(d) : card({ title: 'Every flow' }, notConnected(ctx, { title: 'Klaviyo is not connected',
        text: 'The list of flows shows here once the brand\'s Klaviyo is connected.', teamText: 'Paste the brand\'s Klaviyo private key in Brand settings, Integrations, to see each flow.' })),
      h('p', { class: 'lx-foot' }, 'Sales by day are from Triple Whale. Each flow\'s results are Klaviyo\'s own count over the last 90 days, whatever dates are picked.'),
    ].filter(Boolean));
  },
};
