/* Email & SMS > Snapshot. "What are email and texts bringing in?"
   Live: sales, share of store sales, campaigns against flows by day (Triple Whale, GET /api/hub/email and
   /api/hub/store on the profit worker); orders, list size, list change and the top campaigns (Klaviyo, read with
   the brand's own key: GET /api/klaviyo?what=daily | campaigns | overview on the account-health worker).
   No route yet: the share of email sales that came from returning buyers and first-time buyers per campaign. Both
   show in sample mode only; a real brand never sees an example number. When campaigns and flows are not split for
   these dates, the split shows "no data", never $0. */

import { put } from '../../kit.js';
import { h, em, card, kpi, kpis, delta, takeaway, button, table, legend, lineChart, skeleton, money } from '../../kit.js';
import { ok, usd, rate, sum, move, shortDate, inRange, noteAt, css, head, barCell, channelTag, kl, hubEmail, soft, notConnected, num, pct } from './_em.js';

/* ---------- real mode: five reads, shaped like the fixture ---------- */
function shape(ctx, hub, store, daily, camps, ov, ex) {
  const c = hub.cur || {}, p = hub.prev || {};
  const klOk = !daily.error, inWin = klOk ? (daily.days || []).filter(r => inRange(r.date, ctx.range)) : [];
  const storeBy = Object.fromEntries(((store && store.series) || []).map(r => [r.date, r.revenue]));
  const net = klOk ? sum(inWin, 'gained') - sum(inWin, 'lost') : null;
  const size = !ov.error && ov.biggest_lists && ov.biggest_lists[0] ? ov.biggest_lists[0].profiles : null;
  const sent = camps.error ? [] : (camps.campaigns || []).filter(x => inRange(x.sent, ctx.range));
  let run = ok(size) && ok(net) ? size - net : 0;
  return {
    connected: (ok(c.email) && c.email > 0) || klOk, klaviyo: klOk, klaviyo_error: klOk ? null : daily.error,
    range: { from: ctx.range.from, to: ctx.range.to },
    totals: {
      sales: ok(c.email) ? c.email : null, sales_prev: ok(p.email) ? p.email : null,
      orders: klOk ? sum(inWin, 'orders_email') + sum(inWin, 'orders_sms') : null,
      share: c.share, share_prev: p.share, campaigns: c.campaigns, flows: c.flows,
      returning_share: ex && ex.totals ? ex.totals.returning_share : null, returning_move: null,
      list_size: size, list_net: net, sms_size: null,
    },
    days: (hub.series || []).map(r => ({ date: r.date, campaigns: r.campaigns, flows: r.flows, store: ok(storeBy[r.date]) ? storeBy[r.date] : null })),
    list_spark: klOk && ok(size) ? inWin.map(r => (run += (r.gained || 0) - (r.lost || 0))) : [],
    note: null,
    campaigns: sent.sort((a, b) => (b.conversion_value || 0) - (a.conversion_value || 0)).slice(0, 5)
      .map(x => ({ id: x.id, name: x.subject || x.name, sent: x.sent, channel: x.channel, sales: x.conversion_value, recipients: x.recipients, open_rate: x.open_rate, click_rate: x.click_rate, first_time: null })),
    campaigns_error: camps.error || null, campaign_count: sent.length, flow_count: ov.error ? null : ov.flows_live,
    example: ex && ex.totals ? ['returning'] : [],
  };
}

/* ---------- parts ---------- */
function figures(d) {
  const t = d.totals || {}, isEx = (d.example || []).includes('returning');
  const dSales = move(t.sales, t.sales_prev), dShare = ok(t.share) && ok(t.share_prev) ? t.share - t.share_prev : null;
  const pts = v => Math.abs(Math.round(v * 100)) + ' pts';
  const splitOk = ok(t.campaigns) && ok(t.flows) && t.campaigns + t.flows > 0;
  const daily = splitOk ? (d.days || []).map(r => (r.campaigns || 0) + (r.flows || 0)) : null;
  const el = kpis([
    kpi({ label: 'Email & SMS sales', size: 'lg', value: ok(t.sales) ? usd(t.sales) : 'no data',
      delta: ok(dSales) ? delta(dSales, { bad: dSales < 0 }) : null, sub: ok(t.orders) ? num(t.orders) + ' orders' : ok(t.sales_prev) ? 'was ' + usd(t.sales_prev) : null, spark: daily }),
    kpi({ label: 'Share of store sales', size: 'lg', value: ok(t.share) ? pct(t.share) : 'no data',
      delta: ok(dShare) && Math.abs(dShare) >= 0.005 ? delta(dShare, { bad: dShare < 0, text: pts(dShare) }) : null, sub: 'of all store sales',
      spark: splitOk ? (d.days || []).filter(r => r.store > 0).map(r => ((r.campaigns || 0) + (r.flows || 0)) / r.store) : null }),
    ok(t.returning_share) ? kpi({ label: 'From returning buyers', size: 'lg', src: isEx ? 'Example' : null, value: pct(t.returning_share),
      delta: ok(t.returning_move) ? delta(t.returning_move, { text: pts(t.returning_move) }) : null, sub: 'of email and SMS sales' }) : null,
    kpi({ label: 'List size', size: 'lg', value: ok(t.list_size) ? num(t.list_size) : 'no data',
      delta: ok(t.list_net) && t.list_net !== 0 ? delta(t.list_net, { bad: t.list_net < 0, text: num(Math.abs(t.list_net)) }) : null,
      sub: ok(t.sms_size) ? num(t.sms_size) + ' on SMS' : ok(t.list_size) ? 'largest list' : 'needs the Klaviyo key', spark: d.list_spark }),
  ].filter(Boolean), { cols: 4 });
  el.classList.add('em-kpis');
  return el;
}

function verdict(d, ctx) {
  const t = d.totals || {};
  if (!ok(t.sales) || !(t.sales > 0)) return null;
  const b = v => h('b', null, v), parts = ['Email and texts brought in ', b(usd(t.sales))];
  if (ok(t.share)) parts.push(', ', b(pct(t.share)), ' of store sales');
  if (ok(t.campaigns) && ok(t.flows) && t.campaigns + t.flows > 0) {
    const cs = t.campaigns / (t.campaigns + t.flows);
    parts.push(', and ', cs >= 0.5 ? 'campaigns' : 'flows', ' made ', b(pct(cs >= 0.5 ? cs : 1 - cs)), ' of it');
  }
  parts.push('.');
  return takeaway(parts, { action: ctx.isClient ? null : button('Ask why', { href: ctx.href('ask', 'index') }) });
}

function chartCard(d) {
  const days = d.days || [], t = d.totals || {};
  if (days.length < 2 || !days.some(r => (r.campaigns || 0) + (r.flows || 0) > 0)) return null;
  const total = days.map(r => (r.campaigns || 0) + (r.flows || 0));
  const share = days.map(r => (r.store > 0 ? ((r.campaigns || 0) + (r.flows || 0)) / r.store : null));
  const hasShare = share.filter(ok).length > 1;
  const top = hasShare ? Math.min(1, Math.max(0.25, Math.ceil(Math.max(...share.filter(ok)) * 4) / 4)) : null;
  const b = v => h('b', null, v);
  return card({ class: 'em-chart' },
    head('Flows or campaigns: what brought the sales?', 'Sales by day',
      legend([{ name: 'Campaigns ' + (t.campaigns > 0 ? usd(t.campaigns) : 'no data'), square: true, color: 'var(--ink)' }, { name: 'Flows ' + (t.flows > 0 ? usd(t.flows) : 'no data'), square: true, color: '#D9DDE6' }, hasShare && { name: 'Share of store sales', lead: true }])),
    lineChart({
      series: [
        { type: 'bar', name: 'Campaigns', values: total },
        { type: 'bar', tone: 'dim', name: 'Flows', values: days.map(r => r.flows || 0) },
        hasShare && { name: 'Share of store sales', lead: true, axis: 'right', values: share, end: false },
      ],
      labels: days.map(r => shortDate(r.date)), fill: false,
      y2: hasShare ? { max: top, format: v => pct(v) } : null,
      note: noteAt(days, d.note), format: v => money(v, { compact: true }), height: 360, phoneHeight: 300,
      label: 'Email and SMS sales by day, campaigns and flows' + (hasShare ? ', with their share of store sales' : ''),
      hover: i => [b(shortDate(days[i].date)), h('span', null, 'Campaigns ', b(usd(days[i].campaigns))), h('span', null, 'Flows ', b(usd(days[i].flows))), ok(share[i]) && h('span', null, 'Share ', b(pct(share[i])))],
    }));
}

function topCampaigns(d, ctx) {
  const rows = d.campaigns || [];
  const title = 'Top campaigns', all = h('a', { href: ctx.href('email', 'campaigns') }, d.campaign_count ? 'All ' + d.campaign_count : 'All campaigns');
  if (!rows.length) {
    return card({ title }, notConnected(ctx, d.klaviyo === false
      ? { title: 'Klaviyo is not connected', text: 'Campaigns show here once the brand\'s Klaviyo is connected.', teamText: 'Paste the brand\'s Klaviyo private key in Brand settings, Integrations, and campaigns show here.' }
      : { title: 'No campaigns went out in these dates', text: d.campaigns_error || 'Pick a longer range to see earlier sends.' }));
  }
  const max = Math.max(...rows.map(r => r.sales || 0), 1), first = rows.some(r => ok(r.first_time));
  return card({ title, note: 'sorted by sales, Klaviyo\'s count', flush: true, class: 'em-flush', action: all },
    table({ roomy: true, rows, cols: [
      { key: 'name', label: 'Campaign', class: 'name', render: r => h('span', { class: 'em-name' }, r.name, channelTag(r.channel)) },
      { key: 'sent', label: 'Sent', class: 'dim hide-sm', render: r => (r.sent ? shortDate(r.sent) : '') },
      { key: 'sales', label: 'Sales', num: true, render: r => barCell(h('span', { class: 'strong' }, ok(r.sales) ? usd(r.sales) : 'no data'), (r.sales || 0) / max) },
      first && { key: 'first_time', label: 'First-time buyers', num: true, class: 'hide-md', render: r => rate(r.first_time, 0) },
      { key: 'open_rate', label: 'Open rate', num: true, class: 'hide-sm', render: r => (r.channel === 'sms' ? h('span', { class: 'em-none' }, 'text') : rate(r.open_rate)) },
      { key: 'click_rate', label: 'Click rate', num: true, render: r => rate(r.click_rate, 2) },
    ].filter(Boolean) }));
}

export default {
  title: ['What are email and texts ', em('bringing in?')],
  eyebrow: 'Email & SMS',

  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    const q = `act=${encodeURIComponent(ctx.brand.id)}&from=${ctx.range.from}&to=${ctx.range.to}`;
    const [hub, store, daily, camps, ov] = await Promise.all([
      hubEmail(ctx),
      soft(ctx, ctx.api('/api/hub/store?' + q, { signal: ctx.signal }).then(r => (r.brands || [])[0] || null)),
      kl(ctx, 'daily'), kl(ctx, 'campaigns'), kl(ctx, 'overview'),
    ]);
    return shape(ctx, hub, store, daily, camps, ov, null);   /* load() is real mode only: no example numbers on a real brand */
  },

  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('chart'), skeleton('row', 5)); },

  render(el, d, ctx) {
    css();
    d = d || {};
    if (d.connected === false) {
      put(el, notConnected(ctx, { title: 'No email source connected',
        text: 'Email and SMS numbers show here once the brand\'s Klaviyo is connected.',
        teamText: 'No email or SMS sales came through Triple Whale for these dates and there is no Klaviyo key. Paste the brand\'s Klaviyo private key in Brand settings, Integrations.' }));
      return;
    }
    const isEx = (d.example || []).length > 0;
    put(el, ...[
      h('section', { class: 'lx-hero line' }, figures(d)),
      verdict(d, ctx),
      chartCard(d),
      topCampaigns(d, ctx),
      h('p', { class: 'lx-foot' }, 'Sales by day and the share of store sales are from Triple Whale. Orders, list size and campaign results are Klaviyo\'s own count.'
        + (isEx ? ' "From returning buyers" is an example until its data feed is built.' : '')),
    ].filter(Boolean));
  },
};
