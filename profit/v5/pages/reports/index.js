/* Reports: the weekly and monthly reports for one brand. The newest one is drawn on the page (its numbers, its days
   and what we wrote), every other one is a row that opens in a sheet.
   Live data (account-health, reads only):
     GET /api/reports?act=<brand id>                              the list (a client gets sent reports only)
     GET /api/report?act=<brand id>&period=<weekly|monthly>&start= one report's frozen numbers and summary
   A draft gets Send, Edit (the summary) and Do not send, done here through ../a-to-send/_send.js, which calls the
   same routes old Locus does (POST /api/report-send, PUT /api/report-summary, POST /api/report-skip).
   Team only: a client and "See as client" never see them. Generating a report stays in old Locus. */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, addStyles, hero, kpis, kpi, statusDot, sheet, em, empty, money, x, num, pct, delta, lineChart, legend, card } from '../../kit.js';
import { css, span, short, dayOf, wday, heading, row, list, dateOf, todayYmd } from '../calendar/_cr.js';
import { actions, noChannel, sampleChannels } from '../a-to-send/_send.js';

/** One report row as the send sheets want it. */
const itemOf = (r, ctx) => ({ kind: 'report', act_id: ctx.brand.id, brand: ctx.brand.name, day: r.period_start, end: r.period_end, period: r.period, status: r.status });
/** After a write: change the one row and draw the page again. */
const changed = (r, d, redraw) => what => {
  if (what === 'sent') { r.status = 'sent'; r.sent_at = new Date().toISOString(); }
  else if (what === 'skipped') d.rows = d.rows.filter(x => x !== r);
  else if (what === 'edited') { if (d.more) delete d.more[keyOf(r)]; }
  redraw && redraw();
};
const draftActs = (r, d, ctx, redraw) => actions(itemOf(r, ctx), ctx, changed(r, d, redraw), { canSkip: d.can_skip !== false, noChannel: noChannel(itemOf(r, ctx), ctx, d.channels) });

const NAME = { weekly: 'Weekly report', monthly: 'Monthly report' };
const keyOf = r => r.period + '|' + r.period_start;

function statusOf(r, client) {
  if (r.status === 'sent') return statusDot('good', client ? 'Sent ' + dayOf(r.sent_at) : 'Sent to the client ' + dayOf(r.sent_at));
  if (r.status === 'handled') return statusDot('off', 'Team only');
  if (r.status === 'skipped') return statusDot('off', 'Skipped');
  return statusDot('warn', 'Draft, not sent');
}
/** Only what the page draws, so the saved copy stays small. */
const slim = rep => rep && rep.data ? {
  period: rep.period, period_start: rep.period_start, period_end: rep.period_end, status: rep.status, sent_at: rep.sent_at || null, summary: rep.summary || '',
  currency: (rep.data.account && rep.data.account.currency) || 'USD', totals: rep.data.totals || null, previous: rep.data.previous || null,
  chart: (rep.data.chart || []).map(r => ({ date: r.date, sales: r.sales, spend: r.spend })),
} : null;

/** The four figures of one report, against the period before. A brand with no sales source never reads 0 sales. */
function figures(rep, ctx) {
  const t = rep.totals || {}, p = rep.previous || {}, cur = rep.currency;
  const hasSales = t.sales > 0, chg = (a, b) => a != null && b > 0 ? a / b - 1 : null;
  const vs = rep.period === 'weekly' ? 'last week' : 'last month';
  return kpis([
    kpi({ label: 'Sales', value: hasSales ? money(t.sales, { cur }) : 'no data', size: 'lg', lead: true,
      sub: hasSales ? [delta(chg(t.sales, p.sales)), ' on ' + vs] : (ctx.isClient ? 'sales are not connected yet' : 'no sales source is connected') }),
    kpi({ label: 'Ad spend', value: money(t.spend, { cur }), size: 'lg', sub: [delta(chg(t.spend, p.spend), { plain: true }), ' on ' + vs] }),
    kpi({ label: 'MER', value: hasSales ? x(t.mer) : 'no data', size: 'lg', sub: hasSales && p.mer ? 'was ' + x(p.mer) : 'whole store' }),
    kpi({ label: 'Orders', value: hasSales && t.orders != null ? num(t.orders) : 'no data', size: 'lg', sub: hasSales && t.aov ? money(t.aov, { cur }) + ' each' : '' }),
  ], { cols: 4 });
}

function chartOf(rep) {
  const days = rep.chart || [];
  if (days.length < 2) return null;
  const cur = rep.currency, labels = days.map(r => rep.period === 'weekly' ? wday(r.date) + ' ' + +r.date.slice(8, 10) : short(r.date));
  const hasSales = days.some(r => r.sales > 0);
  return h('section', { class: 'cr-sect' },
    h('div', { class: 'lx-chart-h' }, h('h3', null, 'Day by day'), legend([hasSales ? { name: 'Sales', lead: true } : null, { name: 'Ad spend' }])),
    lineChart({
      series: [hasSales ? { name: 'Sales', values: days.map(r => r.sales), lead: true, points: rep.period === 'weekly' } : null,
        { name: 'Ad spend', values: days.map(r => r.spend), points: rep.period === 'weekly' }].filter(Boolean),
      labels, format: v => money(v, { cur, compact: true }), height: 320, phoneHeight: 260,
      label: 'Sales and ad spend for each day of the report',
      hover: i => [h('b', null, labels[i]), hasSales ? ' sales ' + money(days[i].sales, { cur }) + ',' : '', ' ad spend ' + money(days[i].spend, { cur })],
    }));
}

/** The written summary: its three section names as small headings, bullets as a list, the rest as paragraphs. */
function summaryOf(rep) {
  if (!rep.summary) return null;
  const out = [];
  let ul = null;
  for (const raw of String(rep.summary).split('\n')) {
    const line = raw.trim();
    if (!line) { ul = null; continue; }
    const b = line.match(/^[-•*]\s+(.*)$/);
    if (b) { if (!ul) { ul = h('ul', { class: 'rp-ul' }); out.push(ul); } ul.append(h('li', null, b[1])); continue; }
    ul = null;
    out.push(/^what (we saw|it means|we're doing|we are doing)$/i.test(line) ? h('h4', { class: 'rp-h' }, line) : h('p', { class: 'rp-p' }, line));
  }
  return card({ title: 'What we wrote' }, h('div', { class: 'rp-sum' }, out));
}
const RP_CSS = `.rp-sum{display:grid;gap:8px;max-width:78ch}
.rp-h{margin:14px 0 0;font-size:12px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.rp-h:first-child{margin-top:0}
.rp-p{margin:0;font-size:15px;line-height:1.6;color:var(--ink)}
.rp-ul{margin:0;padding-left:20px;display:grid;gap:6px;font-size:15px;line-height:1.55;color:var(--ink)}`;

async function open(r, d, ctx, redraw) {
  const body = h('div', { class: 'cr-sheet' }, h('p', { class: 'cr-none', style: { border: 0 } }, 'Reading the report...'));
  const sh = sheet({ title: NAME[r.period] + ', ' + span(r.period_start, r.period_end), body });
  const after = () => { sh.close(); redraw && redraw(); };
  let rep = d.latest && keyOf(d.latest) === keyOf(r) ? d.latest : (d.more || {})[keyOf(r)] || null;
  if (!rep && !ctx.sample) {
    try { rep = slim(await ctx.api(`/api/report?act=${encodeURIComponent(ctx.brand.id)}&period=${r.period}&start=${r.period_start}`, { worker: 'ah' })); }
    catch { rep = null; }
  }
  if (!rep) return put(body, h('p', { class: 'cr-none', style: { border: 0 } }, 'This report could not be read here.'),
    !ctx.isClient && r.status === 'draft' ? draftActs(r, d, ctx, after) : null,
    !ctx.isClient && ctx.legacy ? h('a', { href: ctx.legacy, style: { fontSize: '13px', color: 'var(--muted)' } }, 'Open in old ' + APP_NAME) : null);
  const team = !ctx.isClient;
  put(body, h('div', null, statusOf(r, ctx.isClient)),
    team && r.status === 'draft' ? draftActs(r, d, ctx, after) : null,
    figures(rep, ctx), chartOf(rep), summaryOf(rep),
    team && ctx.legacy ? h('a', { href: ctx.legacy, style: { fontSize: '13px', color: 'var(--muted)' } }, 'Open in old ' + APP_NAME) : null);
}

function draw(el, d, ctx) {
  css(); addStyles('lx-rp-css', RP_CSS);
  if (!d || !Array.isArray(d.rows)) return put(el, empty({ title: 'Reports did not answer', text: 'Nothing was read. Try again in a minute.' }));
  const rows = d.rows.filter(r => r.status !== 'skipped' && (!ctx.isClient || r.status === 'sent'));   /* the API already does this for a client; see as client needs it too */
  if (!rows.length) return put(el, empty({ title: 'No reports yet', text: ctx.isClient ? 'Your first weekly report arrives on a Monday.' : 'Weekly reports are drafted each Monday and monthly ones on the 1st.' }));
  const rep = d.latest, today = todayYmd();
  const drafts = rows.filter(r => r.status === 'draft');
  const redraw = () => draw(el, d, ctx);
  /* The newest draft gets its own line with its own dates, so Send never sits beside a report that already went out. */
  const draft = !ctx.isClient && drafts.length ? drafts[0] : null;
  const draftLine = draft ? h('section', { class: 'cr-sect' },
    h('div', { class: 'cr-bar-top', style: { gap: '12px', flexWrap: 'wrap' } },
      h('div', { class: 'cr-heroline' }, h('span', { class: 'lab' }, 'Waiting to send: ' + NAME[draft.period].toLowerCase() + ', ' + span(draft.period_start, draft.period_end)),
        h('span', { class: 'of' }, drafts.length > 1 ? statusDot('warn', (drafts.length - 1) + ' more draft' + (drafts.length > 2 ? 's' : '') + ' in the list') : statusDot('warn', 'Draft, not sent'))),
      h('span', { class: 'sp' }),
      draftActs(draft, d, ctx, redraw))) : null;

  const top = rep ? [
    hero({ line: true },
      h('div', { class: 'cr-bar-top', style: { paddingBottom: '18px' } },
        h('div', { class: 'cr-heroline' }, h('span', { class: 'lab' }, (rep.status === 'sent' ? 'Latest report' : 'Latest draft') + ', ' + (rep.period === 'weekly' ? 'the week of ' : '') + span(rep.period_start, rep.period_end)),
          h('span', { class: 'of' }, statusOf(rep, ctx.isClient))),
        h('span', { class: 'sp' })),
      figures(rep, ctx)),
    chartOf(rep), summaryOf(rep),
  ] : [];

  const lines = rows.map(r => row({
    lead: dateOf(r.period_start, today),
    title: NAME[r.period] || 'Report',
    sub: span(r.period_start, r.period_end),
    cells: [{ w: 210, node: statusOf(r, ctx.isClient) }],
    onclick: () => open(r, d, ctx, redraw),
  }));
  put(el, draftLine, ...top, h('section', { class: 'cr-sect' }, heading('Every report', rows.length, ctx.isClient ? 'tap one to read it' : null), list(lines)));
}

export default {
  async sample(ctx) {
    const [d, channels] = await Promise.all([ctx.fixture('index.json'), sampleChannels()]);
    return { ...d, can_skip: true, channels };
  },
  title: ['How did the ', em('last report read?')],
  eyebrow: 'Reports',
  ranges: false,                 /* a report is a fixed week or month */
  async load(ctx) {
    const act = encodeURIComponent(ctx.brand.id);
    const list = await ctx.api('/api/reports?act=' + act, { worker: 'ah', signal: ctx.signal });
    const rows = (list.rows || []).filter(r => r.status !== 'skipped');
    const first = rows.find(r => r.status === 'sent') || rows[0];
    let latest = null;
    if (first) latest = slim(await ctx.api(`/api/report?act=${act}&period=${first.period}&start=${first.period_start}`, { worker: 'ah', signal: ctx.signal }).catch(() => null));
    return { rows: rows.map(({ act_id, period, period_start, period_end, status, generated_at, sent_at }) => ({ act_id, period, period_start, period_end, status, generated_at, sent_at })), latest, can_skip: list.can_skip === true };
  },
  render: draw,
  skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:190px"></div><div class="lx-skel chart" style="height:340px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>'; },
};
