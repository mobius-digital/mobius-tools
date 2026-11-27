/* Email & SMS > Campaigns. "Which sends made the money?"
   Live: every email and text campaign sent in the dates with its results, and what is scheduled next
   (Klaviyo, GET /api/klaviyo?what=campaigns on the account-health worker; Klaviyo's placed order count).
   No route yet: first-time buyers per campaign (the column shows in sample mode only). */

import { put } from '../../kit.js';
import { dl, rangeWords } from '../home/_biz.js';
import { headRow } from '../platforms/_ads.js';
import { h, tiles, em, card, kpi, kpis, table, barChart, statusDot, skeleton, money } from '../../kit.js';
import { ok, usd, rate, sum, shortDate, inRange, css, head, barCell, channelTag, kl, hubEmail, soft, notConnected, num, pct, openCampaign, goCell } from './_em.js';
import { legend } from '../../kit.js';

function shape(ctx, r, hub) {
  if (r.error) return { connected: true, klaviyo: false, klaviyo_error: r.error, campaigns: [], upcoming: [] };
  return {
    connected: true, klaviyo: true, range: { from: ctx.range.from, to: ctx.range.to },
    /* Triple Whale's campaign sales for the same dates (the number Email > Snapshot shows): the lead figure */
    tw_campaigns: hub && hub.cur && ok(hub.cur.campaigns) ? hub.cur.campaigns : null,
    campaigns: (r.campaigns || []).filter(x => inRange(x.sent, ctx.range)).map(x => ({
      id: x.id, name: x.name, subject: x.subject, preview_text: x.preview_text || null, thumbnail: x.thumbnail || null, html_url: x.html_url || null, sent: x.sent, channel: x.channel, recipients: x.recipients,
      open_rate: x.open_rate, click_rate: x.click_rate, sales: x.conversion_value, orders: x.conversions,
      order_rate: x.conversion_rate, unsub_rate: x.unsubscribe_rate, first_time: null })),
    upcoming: (r.upcoming || []).map(x => ({ id: x.id, name: x.name, channel: x.channel, status: x.status, send_at: x.send_at })),
    example: [],
  };
}

function figures(rows, W, tw) {
  const email = rows.filter(r => r.channel !== 'sms'), texts = rows.length - email.length;
  const sales = sum(rows, 'sales'), rec = sum(rows, 'recipients'), erec = sum(email, 'recipients');
  const open = erec ? email.reduce((t, r) => t + (r.open_rate || 0) * (r.recipients || 0), 0) / erec : null;
  const el = tiles([
    ok(tw)
      ? kpi({ label: 'Campaign sales', value: usd(tw), window: W, source: 'Triple Whale', sub: h('span', null, dl("Klaviyo's count", 'campaign_sales_klaviyo'), ' ' + usd(sales) + ', ' + num(sum(rows, 'orders')) + ' orders') })
      : kpi({ label: dl('Campaign sales', 'campaign_sales_klaviyo'), value: usd(sales), window: W, source: "Klaviyo's count", sub: num(sum(rows, 'orders')) + ' orders' }),
    kpi({ label: 'Campaigns sent', value: num(rows.length), window: W, source: 'Klaviyo', sub: `${email.length} email, ${texts} text` }),
    kpi({ label: dl('Sales per message', 'sales_per_message'), value: rec ? money(sales / rec, { cents: true }) : 'no data', window: W, source: "Klaviyo's count", sub: rec ? num(rec) + ' messages delivered' : null }),
    kpi({ label: dl('Open rate', 'open_rate'), value: ok(open) ? pct(open, { digits: 1 }) : 'no data', window: W, source: "Klaviyo's count", sub: 'email only, weighted by size' }),
  ], { cols: 4 });
  el.classList.add('em-kpis');
  return el;
}

/* the short name on a bar: the first words of the campaign name, so two sends on one day read apart */
const shortName = n => { const w = String(n || '').replace(/\s*\(text\)\s*$/i, '').split(/[:,]?\s+/); const s = w.slice(0, 3).join(' '); return s.length > 18 ? s.slice(0, 17).trim() + '.' : s; };

function chartCard(rows, W) {
  const by = rows.slice().sort((a, b) => String(a.sent).localeCompare(String(b.sent)));
  if (by.length < 2) return null;
  const best = by.reduce((m, r, i) => ((r.sales || 0) > (by[m].sales || 0) ? i : m), 0), b = v => h('b', null, v);
  /* on a phone the bar names run past the card edge: the send date is the label there (the name is in the hover) */
  const narrow = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
  return card({ class: 'em-chart' },
    head('Sales from each send', `${W} · in the order they went out · Klaviyo's count`, legend([{ name: 'Best send', square: true, color: 'var(--brand)' }, { name: 'Email', square: true, color: 'var(--slate)' }, { name: 'Text', square: true, color: 'var(--line-strong)' }])),
    h('div', { class: 'em-big' }, h('span', { class: 'em-lab' }, 'Best send'), h('b', { class: 'em-num' }, usd(by[best].sales)), h('span', null, `${by[best].name}, ${shortDate(by[best].sent)}`), h('span', { class: 'em-best' }, "sales, Klaviyo's count")),
    barChart({ values: by.map(r => r.sales || 0), labels: by.map(r => (narrow ? shortDate(r.sent) : shortName(r.name))), lead: best, dim: i => by[i].channel === 'sms',
      format: v => money(v, { compact: true }), height: 300, phoneHeight: 260, windowLabel: `Each send, ${W} · Klaviyo's count`, name: 'Sales', label: 'Sales from each campaign sent in these dates',
      hover: i => [b(by[i].name), h('span', null, (by[i].channel === 'sms' ? 'Text, ' : 'Email, ') + shortDate(by[i].sent)), h('span', null, 'Sales ', b(usd(by[i].sales))), ok(by[i].recipients) && h('span', null, 'Sent to ', b(num(by[i].recipients)))] }));
}

/* Every campaign: fits the card at 1280 with no sideways scroll (orders and first-time buyers share one cell,
   the per message column folds away on narrower screens) and every row opens the campaign. */
function listCard(rows) {
  const first = rows.some(r => ok(r.first_time));
  const per = r => (r.recipients ? (r.sales || 0) / r.recipients : null);
  return card({ title: 'Every campaign', note: `${rows.length} sent · Klaviyo's count · tap one to open it`, flush: true, class: 'em-flush em-camps' },
    table({ roomy: true, rows, sort: { key: 'sales', dir: 'desc' }, onRow: r => openCampaign(r), cols: [
      { key: 'name', label: 'Campaign', class: 'name', render: r => h('span', { class: 'em-name' }, r.name, channelTag(r.channel), r.subject && r.subject !== r.name ? h('small', null, r.subject) : null) },
      { key: 'sent', label: 'Sent', class: 'dim hide-sm', sortable: true, render: r => (r.sent ? shortDate(r.sent) : '') },
      { key: 'recipients', label: 'Sent to', num: true, sortable: true, class: 'hide-md', render: r => (ok(r.recipients) ? num(r.recipients) : '') },
      { key: 'open_rate', label: dl('Opened', 'open_rate'), num: true, sortable: true, class: 'hide-sm', render: r => (r.channel === 'sms' ? h('span', { class: 'em-none' }, 'text') : rate(r.open_rate)) },
      { key: 'click_rate', label: dl('Clicked', 'click_rate'), num: true, sortable: true, class: 'hide-sm', render: r => rate(r.click_rate, 2) },
      { key: 'orders', label: 'Orders', num: true, sortable: true, class: 'hide-sm', render: r => (ok(r.orders) ? [num(r.orders), first && ok(r.first_time) ? h('span', { class: 'sub' }, pct(r.first_time) + ' first-time') : null] : '') },
      { key: 'per', label: dl('Per message', 'sales_per_message'), num: true, sortable: true, class: 'hide-md', value: per, render: r => (ok(per(r)) ? money(per(r), { cents: true }) : '') },
      { key: 'sales', label: 'Sales', num: true, sortable: true, render: r => h('span', { class: 'strong' }, ok(r.sales) ? usd(r.sales) : 'no data') },
      { key: 'go', label: '', class: 'em-go', render: goCell },
    ].filter(Boolean) }));
}

function nextCard(up) {
  if (!up || !up.length) return null;
  /* long on a wide screen ("Thu, Nov 26, 6:00 PM"), short on a phone ("Thu 6:00pm") so the table fits with no sideways scroll */
  const when = r => {
    if (!r.send_at) return 'No time set';
    const t = new Date(r.send_at), clock = t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?(AM|PM)$/i, m => m.trim().toLowerCase());
    return [h('span', { class: 'em-when-l' }, t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + clock),
      h('span', { class: 'em-when-s' }, t.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + clock)];
  };
  const dot = r => (/schedul|queued|sending/i.test(r.status || '') ? statusDot('good', 'Scheduled') : statusDot('off', 'Draft'));
  return card({ title: 'Going out next', note: 'scheduled and drafts, tap one to open it', flush: true, class: 'em-flush' },
    table({ roomy: true, rows: up, onRow: r => openCampaign({ ...r, sent: null }), cols: [
      { key: 'name', label: 'Campaign', class: 'name', render: r => h('span', { class: 'em-name' }, r.name, channelTag(r.channel)) },
      { key: 'send_at', label: 'Goes out', class: 'dim', render: when },
      { key: 'status', label: 'Status', class: 'hide-sm', render: dot },
      { key: 'go', label: '', class: 'em-go', render: goCell },
    ] }));
}

export default {
  title: 'Email campaigns',
  eyebrow: 'Email & SMS',

  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    const [r, hub] = await Promise.all([kl(ctx, 'campaigns'), soft(ctx, hubEmail(ctx))]);
    return shape(ctx, r, hub);
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
      headRow({ help: [
        { title: 'What it is for', text: 'Which email and text campaigns made the money on the dates at the top. Tap any campaign to see what was sent and what it made.' },
        { title: 'Where the numbers come from', text: 'Campaign sales at the top is Triple Whale\'s count, the same number as Campaigns on Snapshot. Each send\'s sales and orders are Klaviyo\'s placed order count (an order within 5 days of an open or a click), so they add up to a little more or less than Triple Whale\'s total.' },
      ] }),
      figures(rows, rangeWords(ctx, d.range), d.tw_campaigns),
      chartCard(rows, rangeWords(ctx, d.range)),
      listCard(rows),
      nextCard(d.upcoming),
    ].filter(Boolean));
  },
};
