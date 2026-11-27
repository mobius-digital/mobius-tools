/* Email & SMS > Snapshot. "What are email and texts bringing in?"
   Live: sales, share of store sales, campaigns against flows by day (Triple Whale, GET /api/hub/email and
   /api/hub/store on the profit worker); orders, list size, list change and the top campaigns (Klaviyo, read with
   the brand's own key: GET /api/klaviyo?what=daily | campaigns | overview on the account-health worker).
   No route yet: the share of email sales that came from returning buyers and first-time buyers per campaign. Both
   show in sample mode only; a real brand never sees an example number. When campaigns and flows are not split for
   these dates, the split shows "no data", never $0. */

import { put } from '../../kit.js';
import { askWhy, dl, rangeWords } from '../home/_biz.js';
import { headRow } from '../platforms/_ads.js';
import { h, tiles, em, card, kpi, kpis, delta, takeaway, button, table, legend, lineChart, skeleton, money } from '../../kit.js';
import { ok, usd, rate, sum, move, shortDate, inRange, noteAt, css, head, barCell, channelTag, kl, hubEmail, soft, notConnected, num, pct, openCampaign, goCell } from './_em.js';

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
    list_dates: klOk && ok(size) ? inWin.map(r => r.date) : [],
    note: null,
    campaigns: sent.sort((a, b) => (b.conversion_value || 0) - (a.conversion_value || 0)).slice(0, 5)
      .map(x => ({ id: x.id, name: x.subject || x.name, subject: x.subject, preview_text: x.preview_text || null, sent: x.sent, channel: x.channel, sales: x.conversion_value, orders: x.conversions, recipients: x.recipients, open_rate: x.open_rate, click_rate: x.click_rate, unsub_rate: x.unsubscribe_rate, order_rate: x.conversion_rate, first_time: null })),
    campaigns_error: camps.error || null, campaign_count: sent.length, flow_count: ov.error ? null : ov.flows_live,
    example: ex && ex.totals ? ['returning'] : [],
  };
}

/* ---------- parts ---------- */
function figures(d, W) {
  const t = d.totals || {}, isEx = (d.example || []).includes('returning');
  const dSales = move(t.sales, t.sales_prev), dShare = ok(t.share) && ok(t.share_prev) ? t.share - t.share_prev : null;
  const pts = v => Math.abs(Math.round(v * 100)) + ' pts';
  const splitOk = ok(t.campaigns) && ok(t.flows) && t.campaigns + t.flows > 0;
  const ds = d.days || [], dd = ds.length > 1 ? ds.map(r => shortDate(r.date)) : null;
  /* list size by day: one label per value; the sample carries no dates for it, so they are the last days of the window */
  const ls = d.list_spark || [], ld = ls.length > 1 ? ((d.list_dates || []).length === ls.length ? d.list_dates.map(shortDate) : ds.length >= ls.length ? ds.slice(ds.length - ls.length).map(r => shortDate(r.date)) : null) : null;
  const daily = splitOk ? (d.days || []).map(r => (r.campaigns || 0) + (r.flows || 0)) : null;
  const el = tiles([
    kpi({ label: dl('Email & SMS sales', { name: 'Email & SMS sales', definition: 'Store sales Triple Whale credits to email and text, campaigns and flows together.', source: 'Triple Whale' }), value: ok(t.sales) ? usd(t.sales) : 'no data', window: W, source: 'Triple Whale',
      delta: ok(dSales) ? delta(dSales, { bad: dSales < 0 }) : null, sub: ok(t.orders) ? num(t.orders) + ' orders' : ok(t.sales_prev) ? 'vs ' + usd(t.sales_prev) + ' before' : null, spark: daily, sparkFormat: v => usd(v), sparkLabels: dd }),
    kpi({ label: 'Share of store sales', value: ok(t.share) ? pct(t.share) : 'no data', window: W, source: 'Triple Whale',
      delta: ok(dShare) && Math.abs(dShare) >= 0.005 ? delta(dShare, { bad: dShare < 0, text: pts(dShare) }) : null, sub: 'of all store sales',
      spark: splitOk ? ds.map(r => (r.store > 0 ? ((r.campaigns || 0) + (r.flows || 0)) / r.store : null)) : null, sparkFormat: v => pct(v), sparkLabels: dd }),
    ok(t.returning_share) ? kpi({ label: 'From returning buyers', src: isEx ? 'Example' : null, value: pct(t.returning_share), window: W, source: 'Triple Whale',
      delta: ok(t.returning_move) ? delta(t.returning_move, { text: pts(t.returning_move) }) : null, sub: 'of email and SMS sales' }) : null,
    kpi({ label: dl('List size', 'list_size'), value: ok(t.list_size) ? num(t.list_size) : 'no data', window: 'Today', source: "Klaviyo's count",
      delta: ok(t.list_net) && t.list_net !== 0 ? delta(t.list_net, { bad: t.list_net < 0, text: num(Math.abs(t.list_net)) }) : null,
      sub: ok(t.sms_size) ? num(t.sms_size) + ' on SMS' : ok(t.list_size) ? 'largest list' : 'needs the Klaviyo key', spark: d.list_spark, sparkLabels: ld, sparkFormat: v => num(v) }),
  ].filter(Boolean), { cols: 4 });
  el.classList.add('em-kpis');
  return el;
}

function verdict(d, ctx) {
  const t = d.totals || {};
  if (!ok(t.sales) || !(t.sales > 0)) return null;
  /* the tiles carry the total and the share of store sales: the sentence adds only which half made it */
  if (!(ok(t.campaigns) && ok(t.flows) && t.campaigns + t.flows > 0)) return null;
  const b = v => h('b', null, v), cs = t.campaigns / (t.campaigns + t.flows);
  return takeaway([cs >= 0.5 ? 'Campaigns' : 'Flows', ' made ', b(pct(cs >= 0.5 ? cs : 1 - cs)), ' of email and text sales; ', cs >= 0.5 ? 'flows' : 'campaigns', ' the rest.'],
    { action: ctx.isClient ? null : askWhy(ctx, 'What are email and texts bringing in') });
}

/* Campaigns and flows by day as stacked bars. The share of store sales is tile 2 (with its own line), so it is not
   drawn again here on a second axis. */
function chartCard(d) {
  const days = d.days || [], t = d.totals || {};
  if (days.length < 2 || !days.some(r => (r.campaigns || 0) + (r.flows || 0) > 0)) return null;
  const total = days.map(r => (r.campaigns || 0) + (r.flows || 0));
  const b = v => h('b', null, v);
  return card({ class: 'em-chart' },
    head('Sales by day, campaigns and flows', 'Triple Whale\'s count',
      legend([{ name: 'Campaigns ' + (t.campaigns > 0 ? usd(t.campaigns) : 'no data'), square: true, color: 'var(--brand)' }, { name: 'Flows ' + (t.flows > 0 ? usd(t.flows) : 'no data'), square: true, color: 'var(--line-strong)' }])),
    lineChart({
      series: [
        { type: 'bar', tone: 'brand', name: 'Campaigns', values: total },
        { type: 'bar', tone: 'dim', name: 'Flows', values: days.map(r => r.flows || 0) },
      ],
      labels: days.map(r => shortDate(r.date)), fill: false,
      note: noteAt(days, d.note), format: v => money(v, { compact: true }), height: 340, phoneHeight: 290,
      label: 'Email and SMS sales by day, campaigns and flows', windowLabel: 'Daily, ' + (d.range ? rangeWords(null, d.range) : ''), name: 'Email',
      hover: i => [b(shortDate(days[i].date)), h('span', null, 'Campaigns ', b(usd(days[i].campaigns))), h('span', null, 'Flows ', b(usd(days[i].flows))),
        days[i].store > 0 ? h('span', null, 'Share of store sales ', b(pct(total[i] / days[i].store))) : null],
    }));
}

function topCampaigns(d, ctx) {
  const rows = d.campaigns || [];
  const title = 'Top campaigns', all = h('a', { href: ctx.href('email', 'campaigns') }, d.campaign_count ? 'All ' + d.campaign_count + ' campaigns' : 'All campaigns');
  if (!rows.length) {
    return card({ title }, notConnected(ctx, d.klaviyo === false
      ? { title: 'Klaviyo is not connected', text: 'Campaigns show here once the brand\'s Klaviyo is connected.', teamText: 'Paste the brand\'s Klaviyo private key in Brand settings, Integrations, and campaigns show here.' }
      : { title: 'No campaigns went out in these dates', text: d.campaigns_error || 'Pick a longer range to see earlier sends.' }));
  }
  const max = Math.max(...rows.map(r => r.sales || 0), 1), first = rows.some(r => ok(r.first_time));
  return card({ title, note: (d.range ? rangeWords(null, d.range) + ' · ' : '') + 'Klaviyo\'s count, sorted by sales, tap one to open it', flush: true, class: 'em-flush', action: all },
    table({ roomy: true, rows, onRow: r => openCampaign(r), cols: [
      { key: 'name', label: 'Campaign', class: 'name', render: r => h('span', { class: 'em-name' }, r.name, channelTag(r.channel)) },
      { key: 'sent', label: 'Sent', class: 'dim hide-sm', render: r => (r.sent ? shortDate(r.sent) : '') },
      { key: 'sales', label: 'Sales', num: true, render: r => barCell(h('span', { class: 'strong' }, ok(r.sales) ? usd(r.sales) : 'no data'), (r.sales || 0) / max) },
      first && { key: 'first_time', label: 'First-time buyers', num: true, class: 'hide-md', render: r => rate(r.first_time, 0) },
      { key: 'open_rate', label: dl('Open rate', 'open_rate'), num: true, class: 'hide-sm', render: r => (r.channel === 'sms' ? h('span', { class: 'em-none' }, 'text') : rate(r.open_rate)) },
      { key: 'click_rate', label: dl('Click rate', 'click_rate'), num: true, render: r => rate(r.click_rate, 2) },
      { key: 'go', label: '', class: 'em-go', render: goCell },
    ].filter(Boolean) }));
}

export default {
  title: 'Email & SMS',
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
    const isEx = (d.example || []).length > 0, tt = d.totals || {};
    ctx.askWindow = rangeWords(ctx, d.range) || null;
    ctx.askContext = `Email and SMS for ${ctx.brand ? ctx.brand.name : 'this brand'}, ${rangeWords(ctx, d.range)}: sales ${ok(tt.sales) ? usd(tt.sales) : 'not read'} (Triple Whale)` + (ok(tt.share) ? `, ${pct(tt.share)} of store sales` : '') + (ok(tt.list_size) ? `, list size ${num(tt.list_size)} (Klaviyo)` : '') + '.';
    put(el, ...[
      headRow({ help: [
        { title: 'What it is for', text: 'What email and texts bring in on the dates at the top, flows against campaigns, and the top campaigns. Tap a campaign to open it.' },
        { title: 'Where the numbers come from', text: 'Sales by day and the share of store sales are from Triple Whale. Orders, list size and campaign results are Klaviyo\'s own count.' + (isEx ? ' "From returning buyers" is an example until its data feed is built.' : '') },
      ] }),
      figures(d, rangeWords(ctx, d.range)),
      verdict(d, ctx),
      chartCard(d),
      topCampaigns(d, ctx),
    ].filter(Boolean));
  },
};
