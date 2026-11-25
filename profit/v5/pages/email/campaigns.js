/* Email & SMS > Campaigns. "Which sends made the money?"
   Live: every email and text campaign sent in the dates with its results, and what is scheduled next
   (Klaviyo, GET /api/klaviyo?what=campaigns on the account-health worker; Klaviyo's placed order count).
   No route yet: first-time buyers per campaign (the column shows in sample mode only). */

import { put } from '../../kit.js';
import { h, em, card, kpi, kpis, table, barChart, statusDot, skeleton, money } from '../../kit.js';
import { ok, usd, rate, sum, shortDate, inRange, css, head, barCell, channelTag, kl, notConnected, num, pct } from './_em.js';

function shape(ctx, r) {
  if (r.error) return { connected: true, klaviyo: false, klaviyo_error: r.error, campaigns: [], upcoming: [] };
  return {
    connected: true, klaviyo: true, range: { from: ctx.range.from, to: ctx.range.to },
    campaigns: (r.campaigns || []).filter(x => inRange(x.sent, ctx.range)).map(x => ({
      id: x.id, name: x.name, subject: x.subject, sent: x.sent, channel: x.channel, recipients: x.recipients,
      open_rate: x.open_rate, click_rate: x.click_rate, sales: x.conversion_value, orders: x.conversions,
      order_rate: x.conversion_rate, unsub_rate: x.unsubscribe_rate, first_time: null })),
    upcoming: (r.upcoming || []).map(x => ({ id: x.id, name: x.name, channel: x.channel, status: x.status, send_at: x.send_at })),
    example: [],
  };
}

function figures(rows) {
  const email = rows.filter(r => r.channel !== 'sms'), texts = rows.length - email.length;
  const sales = sum(rows, 'sales'), rec = sum(rows, 'recipients'), erec = sum(email, 'recipients');
  const open = erec ? email.reduce((t, r) => t + (r.open_rate || 0) * (r.recipients || 0), 0) / erec : null;
  const el = kpis([
    kpi({ label: 'Campaign sales', size: 'lg', value: usd(sales), sub: num(sum(rows, 'orders')) + ' orders' }),
    kpi({ label: 'Campaigns sent', size: 'lg', value: num(rows.length), sub: `${email.length} email, ${texts} text` }),
    kpi({ label: 'Sales per message', size: 'lg', value: rec ? money(sales / rec, { cents: true }) : 'no data', sub: rec ? num(rec) + ' messages delivered' : null }),
    kpi({ label: 'Open rate', size: 'lg', value: ok(open) ? pct(open, { digits: 1 }) : 'no data', sub: 'email only, weighted by size' }),
  ], { cols: 4 });
  el.classList.add('em-kpis');
  return el;
}

function chartCard(rows) {
  const by = rows.slice().sort((a, b) => String(a.sent).localeCompare(String(b.sent)));
  if (by.length < 2) return null;
  const best = by.reduce((m, r, i) => ((r.sales || 0) > (by[m].sales || 0) ? i : m), 0), b = v => h('b', null, v);
  return card({ class: 'em-chart' },
    head('Sales from each send', 'In the order they went out'),
    h('div', { class: 'em-big' }, h('span', { class: 'lx-hero-num' }, usd(by[best].sales)), h('span', null, `${by[best].name}, ${shortDate(by[best].sent)}`)),
    barChart({ values: by.map(r => r.sales || 0), labels: by.map(r => shortDate(r.sent)), lead: best, dim: i => by[i].channel === 'sms',
      format: v => money(v, { compact: true }), height: 300, phoneHeight: 260, label: 'Sales from each campaign sent in these dates',
      hover: i => [b(by[i].name), h('span', null, shortDate(by[i].sent)), h('span', null, 'Sales ', b(usd(by[i].sales))), ok(by[i].recipients) && h('span', null, 'Sent to ', b(num(by[i].recipients)))] }));
}

function listCard(rows) {
  const max = Math.max(...rows.map(r => r.sales || 0), 1), first = rows.some(r => ok(r.first_time));
  const per = r => (r.recipients ? (r.sales || 0) / r.recipients : null);
  return card({ title: 'Every campaign', note: `${rows.length} sent in these dates, Klaviyo's count`, flush: true, class: 'em-flush' },
    table({ roomy: true, rows, sort: { key: 'sales', dir: 'desc' }, cols: [
      { key: 'name', label: 'Campaign', class: 'name', render: r => h('span', { class: 'em-name' }, r.name, channelTag(r.channel), r.subject && r.subject !== r.name ? h('small', null, r.subject) : null) },
      { key: 'sent', label: 'Sent', class: 'dim', sortable: true, render: r => (r.sent ? shortDate(r.sent) : '') },
      { key: 'recipients', label: 'Sent to', num: true, sortable: true, class: 'hide-md', render: r => (ok(r.recipients) ? num(r.recipients) : '') },
      { key: 'open_rate', label: 'Open rate', num: true, sortable: true, class: 'hide-sm', render: r => (r.channel === 'sms' ? h('span', { class: 'em-none' }, 'text') : rate(r.open_rate)) },
      { key: 'click_rate', label: 'Click rate', num: true, sortable: true, class: 'hide-sm', render: r => rate(r.click_rate, 2) },
      { key: 'orders', label: 'Orders', num: true, sortable: true, class: 'hide-md', render: r => (ok(r.orders) ? num(r.orders) : '') },
      first && { key: 'first_time', label: 'First-time buyers', num: true, sortable: true, class: 'hide-md', render: r => rate(r.first_time, 0) },
      { key: 'per', label: 'Per message', num: true, sortable: true, class: 'hide-md', value: per, render: r => (ok(per(r)) ? money(per(r), { cents: true }) : '') },
      { key: 'sales', label: 'Sales', num: true, sortable: true, render: r => barCell(h('span', { class: 'strong' }, ok(r.sales) ? usd(r.sales) : 'no data'), (r.sales || 0) / max) },
    ].filter(Boolean) }));
}

function nextCard(up) {
  if (!up || !up.length) return null;
  const when = r => (r.send_at ? new Date(r.send_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No time set');
  const dot = r => (/schedul|queued|sending/i.test(r.status || '') ? statusDot('good', 'Scheduled') : statusDot('off', 'Draft'));
  return card({ title: 'Going out next', note: 'scheduled and drafts', flush: true, class: 'em-flush' },
    table({ roomy: true, rows: up, cols: [
      { key: 'name', label: 'Campaign', class: 'name', render: r => h('span', { class: 'em-name' }, r.name, channelTag(r.channel)) },
      { key: 'send_at', label: 'Goes out', class: 'dim', render: when },
      { key: 'status', label: '', render: dot },
    ] }));
}

export default {
  title: ['Which sends ', em('made the money?')],
  eyebrow: 'Email & SMS',

  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    return shape(ctx, await kl(ctx, 'campaigns'));
  },

  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('chart'), skeleton('row', 6)); },

  render(el, d, ctx) {
    css();
    d = d || {};
    if (d.connected === false || d.klaviyo === false) {
      put(el, notConnected(ctx, { title: 'Klaviyo is not connected',
        text: 'Campaigns and their results show here once the brand\'s Klaviyo is connected.',
        teamText: (d.klaviyo_error ? d.klaviyo_error + ' ' : '') + 'Campaigns are read with the brand\'s own Klaviyo key.' }));
      return;
    }
    const rows = d.campaigns || [];
    if (!rows.length) {
      put(el, ...[notConnected({ ...ctx, isClient: true }, { title: 'No campaigns went out in these dates', text: 'Pick a longer range to see earlier sends.' }), nextCard(d.upcoming)].filter(Boolean));
      return;
    }
    put(el, ...[
      h('section', { class: 'lx-hero line' }, figures(rows)),
      chartCard(rows),
      listCard(rows),
      nextCard(d.upcoming),
      h('p', { class: 'lx-foot' }, 'Sales and orders are Klaviyo\'s placed order count for each campaign, not Triple Whale\'s. Grey columns are texts.'),
    ].filter(Boolean));
  },
};
