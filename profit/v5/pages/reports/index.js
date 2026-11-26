/* Reports: the weekly and monthly reports for one brand.
   The page says which report is on screen and lets the person pick: Daily / Weekly / Monthly, then the period
   (arrows and a list). The report is drawn in the client page's order (How we read it, the numbers as report cards
   in three groups, by platform, day by day, best ads, this week); "Every report" at the bottom picks one in place.
   Daily is not a report of its own (nothing is approved or sent per day): it shows one day of a weekly or monthly
   report's day by day numbers and says so.
   The team sees the newest draft first, with the "How we read it" card that drives the flow:
     points    talking points for the call (team only), the "What the team said" box, Write how we read it
     drafted   the draft in a box: Approve and send, Save, Write it again
     approved  the read: Send (the confirm sheet in ../a-to-send/_send.js), Edit
     sent      the read, read only
   A client, and "See as client", get exactly the client page: the read and the numbers, no points, no buttons.
   A best ad opens the shared ad detail (../_addetail.js): its picture or video and its numbers.

   Live data (account-health, worker 'ah'):
     GET  /api/reports?act=                         the list (a client gets sent reports only)
     GET  /api/report?act=&period=&start=           one report's frozen numbers and summary (= the approved read);
                                                    read for the focus report on load and for any other one when picked
   Team only (never called for a client or "See as client"):
     GET  /api/report-read?act=&period=&start=      { status: none|points|drafted|approved, points, team_view,
                                                      team_source, meeting_id, draft, read_text, approved_by, approved_at }
     POST /api/report-read/points  { act, period, start }               write the talking points again
     POST /api/report-read/draft   { act, period, start, notes? }       write how we read it (notes = the team's view)
     PUT  /api/report-read         { act, period, start, text }         save an edit (status drafted)
     POST /api/report-read/approve { act, period, start, text, send? }  approve; send:true also sends
     POST /api/report-skip         { act, period, start }               Do not send (through _send.js)
     GET  /api/draft-holds?act=                     drafts whose numbers look incomplete (team only): one warning line
                                                    on the draft, and Send (or Approve and send) asks twice
   "This week" says where its lines came from: data.this_week_from { meeting, title, at } is set when the team's call
   notes wrote them (account-health meetings.js); without it they were typed by the team.
   Sample mode simulates every write and says so. */

import { APP_NAME } from '../../config.js';
import { put, h, addStyles, kpi, statusDot, pill, sheet, em, empty, money, x, num, pct, delta, lineChart, legend, card, button, toast, noDash, platformChip, segmented, staleStamp, sourceLine as srcLine } from '../../kit.js';
import { css, span, short, dayOf, wday, heading, row, list, dateOf, todayYmd, addDays, helpBar } from '../calendar/_cr.js';
import { defLabel } from '../../defs.js';
import { refresh as reloadPage } from '../../router.js';
import { sendSheet, skipSheet, readStatusOf, readHolds, holdLine, askTwice } from '../a-to-send/_send.js';
import { canWrite } from '../production/_act.js';
import { openAdDetail } from '../_addetail.js';
import { platformRows, amazonOf, bestAds, marginOf, linesOf, change, noGoalOf, noGoalLine } from './_report.js';

const NAME = { weekly: 'Weekly report', monthly: 'Monthly report', daily: 'Daily numbers' };
const KIND = { weekly: 'week', monthly: 'month' };
const keyOf = r => r.period + '|' + r.period_start;
const SAMPLE_NOTE = 'Sample: nothing was changed';
const errText = e => (e && e.message) || 'No answer from the server.';
const TW = 'Triple Whale';
const PLATFORMS = 'the ad platforms';

/** One report row as the send sheets want it. */
const itemOf = (r, ctx) => ({ kind: 'report', act_id: ctx.brand.id, brand: ctx.brand.name, day: r.period_start, end: r.period_end, period: r.period, status: r.status, hold: r.hold || null });

function statusOf(r, client) {
  if (r.status === 'sent') return statusDot('good', client ? 'Sent ' + dayOf(r.sent_at) : 'Sent to the client ' + dayOf(r.sent_at));
  if (r.status === 'handled') return statusDot('off', 'Team only');
  if (r.status === 'skipped') return statusDot('off', 'Skipped');
  return statusDot('warn', 'Draft, not sent');
}

/** Only what the page draws, so the saved copy stays small. Platforms and ads are read once, here. */
const slim = rep => rep && rep.data ? {
  period: rep.period, period_start: rep.period_start, period_end: rep.period_end, status: rep.status, sent_at: rep.sent_at || null, summary: rep.summary || '',
  currency: (rep.data.account && rep.data.account.currency) || 'USD', totals: rep.data.totals || null, previous: rep.data.previous || null,
  chart: (rep.data.chart || []).map(r => ({ date: r.date, sales: r.sales, spend: r.spend, new_orders: r.new_orders ?? null })),
  platforms: platformRows(rep.data), amazon: amazonOf(rep.data), ads: bestAds(rep.data, 3), cm: marginOf(rep.data),
  this_week: linesOf(rep.data.this_week), need_from_you: linesOf(rep.data.need_from_you), this_week_from: rep.data.this_week_from || null,
  no_goal: noGoalOf(rep.data),
} : null;

/* ---------- the numbers: report cards in three groups ---------- */

const ok = n => n != null && isFinite(n);
const dayLabel = (rep, d) => rep.period === 'weekly' ? wday(d) + ' ' + +d.slice(8, 10) : short(d);

/** Store, Ads, Customers: one rounded card each, the same tiles in the same order. A brand with no sales source
 *  never reads 0 sales. Each tile says its window and source; sales, spend and MER carry the day by day line. */
function groups(rep, ctx) {
  const t = rep.totals || {}, p = rep.previous || {}, cur = rep.currency;
  const hasSales = t.sales > 0;
  const W = span(rep.period_start, rep.period_end);
  const vs = ' vs the ' + (KIND[rep.period] || 'period') + ' before';
  const days = rep.chart || [];
  const sl = days.length > 1 ? days.map(r => short(r.date)) : null;   /* one label per day: the scale and the hover name each day */
  const spark = f => sl ? days.map(f) : null;
  const noSales = ctx.isClient ? 'Sales are not connected yet' : 'No sales source is connected';
  const tile = (o) => kpi({ window: W, sparkLabels: sl, ...o });
  const was = (v, f) => ok(v) ? 'was ' + f(v) : null;
  /* the color says good or bad by direction: more sales is good, a higher cost is bad */
  const up = c => delta(c, { bad: c < 0 }), down = c => delta(c, { bad: c > 0 });
  const nSpark = hasSales && days.some(r => ok(r.new_orders)) ? spark(r => r.new_orders) : null;

  const store = [
    tile({ label: 'Sales', value: hasSales ? t.sales : 'no data', unit: 'money', cur, source: TW,
      sub: hasSales ? [up(change(t.sales, p.sales)), vs] : noSales, spark: hasSales ? spark(r => r.sales) : null }),
    tile({ label: 'Orders', value: hasSales && ok(t.orders) ? t.orders : 'no data', unit: 'num', source: TW,
      sub: hasSales && ok(t.orders) ? [up(change(t.orders, p.orders)), vs] : null }),
    tile({ label: defLabel('Average order', 'aov'), value: hasSales && ok(t.aov) ? t.aov : 'no data', unit: 'money', cur, source: TW,
      sub: hasSales ? was(p.aov, v => money(v, { cur })) : null }),
  ];
  const ads = [
    tile({ label: 'Ad spend', value: ok(t.spend) ? t.spend : 'no data', unit: 'money', cur, source: PLATFORMS,
      sub: [delta(change(t.spend, p.spend), { plain: true }), vs], spark: spark(r => r.spend) }),
    tile({ label: defLabel('Store MER', 'mer'), value: hasSales && ok(t.mer) ? t.mer : 'no data', unit: 'x', source: TW,
      sub: hasSales ? was(p.mer, x) : null }),
    rep.cm ? tile({ label: defLabel('Contribution margin', 'contribution'), value: rep.cm.cur, unit: 'money', cur, source: 'Locus, after costs and ad spend', sub: rep.cm.prev != null ? 'was ' + money(rep.cm.prev, { cur }) : null })
      : hasSales && ok(t.amer) ? tile({ label: defLabel('New customer MER', AMER_DEF), value: t.amer, unit: 'x', source: TW, sub: was(p.amer, x) }) : null,
  ].filter(Boolean);
  const hasNew = hasSales && ok(t.new_orders);
  const people = hasNew ? [
    tile({ label: 'New customers', value: t.new_orders, unit: 'num', source: TW, sub: [up(change(t.new_orders, p.new_orders)), vs], spark: nSpark }),
    tile({ label: defLabel('Cost per new customer', 'new_customer_cost'), value: ok(t.ncpa) ? t.ncpa : 'no data', unit: 'money', cur, source: TW + ' and ' + PLATFORMS,
      sub: ok(t.ncpa) && ok(p.ncpa) ? [down(change(t.ncpa, p.ncpa)), vs] : null }),
    tile({ label: 'Sales from new customers', value: ok(t.new_share) ? pct(t.new_share) : 'no data', source: TW,
      sub: ok(t.new_rev) ? money(t.new_rev, { cur }) + ' of ' + money(t.sales, { cur }) : null }),
  ] : null;

  const grp = (title, kids, note) => h('section', { class: 'rp-grp' },
    h('div', { class: 'rp-grp-h' }, h('h3', null, title), note ? h('span', { class: 'rp-grp-n' }, note) : null),
    h('div', { class: 'rp-tiles' }, kids));
  return h('div', { class: 'rp-grps' },
    grp('Store', store, 'What the store took in'),
    grp('Ads', ads, 'What the ads cost and returned'),
    people ? grp('Customers', people, 'Who bought for the first time')
      : h('section', { class: 'rp-grp rp-grp-none' }, h('div', { class: 'rp-grp-h' }, h('h3', null, 'Customers')),
        h('p', { class: 'rp-none' }, hasSales ? 'New customer numbers were not saved with this report.' : noSales + ', so there are no customer numbers.')));
}

function platformsOf(rep) {
  const rows = rep.platforms || [], cur = rep.currency;
  if (!rows.length && !rep.amazon) return null;
  const tbl = rows.length ? h('div', { class: 'lx-table-wrap rp-tbl' }, h('table', { class: 'lx-table rp-plat' },
    h('thead', null, h('tr', null, h('th', null, 'Platform'), h('th', { class: 'num' }, 'Spend'), h('th', { class: 'num' }, 'Sales from its ads'), h('th', { class: 'num' }, defLabel('ROAS', PLAT_ROAS_DEF)))),
    h('tbody', null, rows.map(p => h('tr', null,
      h('td', null, platformChip(p.id, { label: p.label })), h('td', { class: 'num' }, money(p.spend, { cur })),
      p.waiting ? h('td', { class: 'num rp-q', colspan: 2 }, p.note || 'not credited yet')
        : p.low ? [h('td', { class: 'num' }, p.sales != null ? money(p.sales, { cur }) : ''), h('td', { class: 'num rp-q' }, 'too few orders to read')]
          : [h('td', { class: 'num' }, money(p.sales, { cur })), h('td', { class: 'num' }, x(p.roas))]))))) : null;
  return card({ title: 'By platform', note: span(rep.period_start, rep.period_end), class: 'rp-byp' },
    h('p', { class: 'rp-src' }, 'Spend from each platform. Sales and ROAS: Triple Whale, last platform click.'), tbl,
    rep.amazon ? h('p', { class: 'rp-note' }, 'Amazon: ' + money(rep.amazon.sales, { cur }) + ' in sales' + (rep.amazon.orders != null ? ' from ' + num(rep.amazon.orders) + ' orders.' : '.')) : null);
}

function chartOf(rep, pickAt) {
  const days = rep.chart || [];
  if (days.length < 2) return null;
  const cur = rep.currency, labels = days.map(r => dayLabel(rep, r.date));
  const hasSales = days.some(r => r.sales > 0);
  return card({ class: 'rp-dbd' },
    h('div', { class: 'lx-chart-h' }, h('div', { class: 'lx-sec' }, h('h3', null, 'Day by day')), legend([hasSales ? { name: 'Sales', lead: true } : null, { name: 'Ad spend' }].filter(Boolean))),
    lineChart({
      series: [hasSales ? { name: 'Sales', values: days.map(r => r.sales), lead: true, points: rep.period === 'weekly' } : null,
        { name: 'Ad spend', values: days.map(r => r.spend), points: rep.period === 'weekly' }].filter(Boolean),
      labels, format: v => money(v, { cur, compact: true }), height: 300, phoneHeight: 240,
      windowLabel: 'Daily, ' + span(rep.period_start, rep.period_end),
      label: 'Sales and ad spend for each day of the report',
      /* Daily: a rule on the picked day */
      marks: pickAt != null && pickAt >= 0 ? [{ index: pickAt, line: true, text: 'This day' }] : undefined,
    }),
    h('p', { class: 'rp-src' }, 'Sales: Triple Whale. Ad spend: every ad platform added together.'));
}

/** Best ads: equal cards (square picture showing the whole ad, two line name, Spend, Sales, ROAS: the same core
    cells as Home and Meta), each opens the shared ad detail. */
function adsOf(rep, ctx) {
  const ads = rep.ads || [];
  if (!ads.length) return null;
  const cur = rep.currency;
  const win = { from: rep.period_start, to: rep.period_end, label: span(rep.period_start, rep.period_end) };
  /* the card's own numbers go with it, so the detail never reads a different cost per sale than the card implies */
  const open = a => openAdDetail(ctx, {
    id: a.id, name: a.name, thumb: a.thumb, media_type: a.video ? 'video' : 'image', spend: a.spend,
    roas: a.roas, revenue: a.revenue != null ? a.revenue : a.roas != null && a.spend ? a.roas * a.spend : null,
    purchases: a.purchases, cpa: a.cpa, lc_orders: a.purchases,
  }, { act: ctx.brand && ctx.brand.id, window: win, currency: cur });
  return h('section', { class: 'cr-sect' }, heading('Best ads', null, 'tap one to see it and its numbers'),
    h('div', { class: 'rp-ads' }, ads.map(a => h('article', { class: 'rp-ad', role: 'button', tabindex: '0', title: noDash(a.name), 'aria-label': 'Open the ad ' + noDash(a.name),
      onclick: () => open(a), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(a); } } },
      h('div', { class: 'rp-pic' }, a.thumb ? h('img', { src: a.thumb, alt: '', loading: 'lazy' }) : h('span', null, 'No picture yet'),
        a.video ? h('span', { class: 'rp-vid' }, 'Video') : null),
      h('div', { class: 'rp-adb' },
        platformChip(a.platform || 'meta', { chip: true }),
        h('b', { class: 'rp-adn' }, noDash(a.name)),
        h('dl', { class: 'rp-adv' },
          h('div', null, h('dt', null, 'Spend'), h('dd', null, money(Math.round(a.spend || 0), { cur }))),
          h('div', null, h('dt', null, 'Sales'), h('dd', null, a.revenue != null ? money(Math.round(a.revenue), { cur }) : 'not read')),
          h('div', null, h('dt', null, defLabel('ROAS', PLAT_ROAS_DEF)), h('dd', null, a.roas != null ? x(a.roas) : 'not read'))))))),
    h('p', { class: 'rp-src' }, 'Spend: Meta. Sales and ROAS: Triple Whale, last platform click, ' + win.label + '.'));
}

/** Where the "This week" lines came from, in plain words. */
function planSource(rep, ctx) {
  const f = rep.this_week_from;
  if (ctx.isClient) return f ? 'From our notes after the call' : 'From our team';
  if (f) return "From the team's notes after the call" + (f.title ? ': ' + noDash(f.title) : '') + (f.at ? ', ' + dayOf(f.at) : '');
  return 'Typed by the team';
}
function plansOf(rep, ctx) {
  const tw = rep.this_week || [], fy = rep.need_from_you || [];
  if (!tw.length && !fy.length) return null;
  const src = planSource(rep, ctx);
  const block = (t, items) => items.length ? card({ title: t, class: 'rp-plan' }, h('p', { class: 'rp-src rp-src-top' }, src), h('ul', { class: 'rp-ul' }, items.map(s => h('li', null, noDash(s))))) : null;
  return h('section', { class: 'rp-two' }, block(rep.period === 'monthly' ? 'This month' : 'This week', tw), block('We need from you', fy));
}

/* Platform and ad numbers: what each column counts (the overlap note lives here, not in a footer). */
const AMER_DEF = { name: 'New customer MER', definition: 'Sales from first time buyers divided by all ad spend in the period.', formula: 'New customer sales / Ad spend', source: 'Triple Whale' };
const PLAT_ROAS_DEF = { name: 'ROAS', definition: 'One platform or one ad: the sales Triple Whale credits to it (last platform click) divided by what it spent. Store-wide efficiency is Store MER, not ROAS. Platform sales overlap, so they add up to more than the store\'s sales.', formula: 'Attributed sales / Spend', source: 'Triple Whale, last platform click' };

/** The period before a report: the week before, or the month before. */
function before(rep) {
  const end = addDays(rep.period_start, -1);
  return { start: rep.period === 'monthly' ? end.slice(0, 8) + '01' : addDays(rep.period_start, -7), end };
}
/** The client's page order, under the read: numbers, by platform, day by day, best ads, this week. */
export const body = (rep, ctx) => {
  const b = before(rep);
  /* a month with no goal typed shows one plain line, never an inherited goal, forecast or pacing */
  const noGoal = noGoalLine(rep.no_goal);
  return [h('section', { class: 'cr-sect' }, heading('The numbers', null, span(rep.period_start, rep.period_end) + ', compared with ' + span(b.start, b.end)), groups(rep, ctx),
    noGoal ? h('p', { class: 'rp-note rp-nogoal' }, noGoal) : null),
    platformsOf(rep), chartOf(rep), adsOf(rep, ctx), plansOf(rep, ctx)];
};
/** The report page's styles, for another page that draws a report with body() (Agency > To send). */
export function reportStyles() { css(); addStyles('lx-rp-css', RP_CSS); }
/** A report as the page draws it (only what it needs). */
export { slim };

/* ---------- How we read it ---------- */

/** The read as the client sees it: line breaks kept, bullets as a list. Old reports keep their three headings. */
function readText(text) {
  const out = [];
  let ul = null;
  for (const raw of noDash(text).split('\n')) {
    const line = raw.trim();
    if (!line) { ul = null; continue; }
    const b = line.match(/^[-\u2022*]\s+(.*)$/);
    if (b) { if (!ul) { ul = h('ul', { class: 'rp-ul' }); out.push(ul); } ul.append(h('li', null, b[1])); continue; }
    ul = null;
    out.push(/^what (we saw|it means|we're doing|we are doing)$/i.test(line) ? h('h4', { class: 'rp-lab' }, line) : h('p', { class: 'rp-p' }, line));
  }
  return h('div', { class: 'rp-read' }, out);
}

/** The one shell of the card: title, the state chip on the right, one quiet line under the title, then the body. */
function readShell({ chip, src }, ...kids) {
  return card({ title: 'How we read it', class: 'rp-card', action: chip || null }, src ? h('p', { class: 'rp-src rp-src-top' }, src) : null, ...kids);
}
const readOnly = (text, chip, src) => readShell({ chip, src },
  String(text || '').trim() ? readText(text) : h('p', { class: 'rp-none' }, 'Our read of this period is on its way.'));

const readSource = (read, rep) => read.team_source === 'meeting' ? 'Written by Locus AI from ' + (rep.period === 'monthly' ? 'the call notes' : 'the Monday call notes')
  : read.team_source === 'typed' ? 'Written by Locus AI from notes the team added' : 'Written by Locus AI from the talking points (no call notes yet)';

/** The team's card. st: { rep, read, row, d, ctx, redraw } */
function readCard(st) {
  const { rep, ctx } = st, read = st.read || { status: 'none' };
  if (rep.status === 'sent' || ctx.isClient) return readOnly(rep.summary, rep.status === 'sent' ? pill('good', 'Sent ' + dayOf(rep.sent_at)) : null,
    ctx.isClient ? 'Written by our team after the call.' : 'What the client read, word for word. Approved by the team before it was sent.');
  if (!canWrite(ctx)) return readOnly(read.read_text || read.draft || '', pill('', 'Team only until sent'), 'Only the team sees this until it is sent.');
  if (read.status === 'loading') return readShell({ chip: pill('', 'Reading') }, h('p', { class: 'rp-none' }, 'Reading where this report stands...'));
  if (read.status === 'error') return readShell({ chip: pill('bad', 'Not loaded') },
    h('p', { class: 'sd-err' }, 'The read could not be loaded: ' + read.error), h('div', { class: 'rp-acts' }, button('Try again', { onclick: () => refresh(st) })));
  if (read.status === 'approved' && !st.editing) return approvedCard(st);
  if (read.status === 'drafted' || (read.status === 'approved' && st.editing)) return draftCard(st);
  return pointsCard(st);
}

/** Before the call: the talking points (team only) and the box for what the team said. */
function pointsCard(st) {
  const read = st.read || {}, P = read.points || {};
  const pts = Array.isArray(P.points) ? P.points : [], qs = Array.isArray(P.questions) ? P.questions : [];
  const err = h('div');
  const box = h('textarea', { class: 'lx-input rp-box', 'aria-label': 'What the team said', placeholder: 'Paste the call notes or a transcript, or type what the team agreed.' });
  box.value = read.team_source === 'typed' ? read.team_view || '' : '';
  const write = button('Write how we read it', { primary: true, large: true });
  const redo = button(pts.length ? 'Redo talking points' : 'Write talking points', { ghost: true });
  const lock = on => { write.disabled = redo.disabled = on; };
  /* An emptied box that held the team's typed notes sends '' (the server clears them); empty from the start sends nothing. */
  write.addEventListener('click', () => run(st, err, lock, 'draft', { notes: box.value.trim() || (read.team_source === 'typed' && read.team_view ? '' : undefined) }, 'Writing how we read it...'));
  redo.addEventListener('click', () => run(st, err, lock, 'points', {}, 'Writing the talking points...'));
  return readShell({ chip: pill('warn', 'Waiting on the call'), src: 'Talking points first, then the team writes the read after the call.' },
    pts.length || qs.length || P.proposed ? h('div', { class: 'rp-pts' },
      h('div', { class: 'rp-pts-h' }, h('h4', { class: 'rp-sub' }, 'Talking points for the call'), h('span', { class: 'lx-team-tag', title: 'Team only: clients do not see this' }, 'Team only')),
      pts.length ? h('ol', { class: 'rp-ol' }, pts.map(p => h('li', null, h('span', null, noDash(p.line)), p.why ? h('small', null, noDash(p.why)) : null))) : null,
      qs.length ? h('div', { class: 'rp-blk' }, h('p', { class: 'rp-lab' }, 'Settle on the call'), h('ul', { class: 'rp-ul' }, qs.map(q => h('li', null, noDash(typeof q === 'string' ? q : q.line || q.q || ''))))) : null,
      P.proposed ? h('div', { class: 'rp-blk' }, h('p', { class: 'rp-lab' }, 'Proposed read'), h('p', { class: 'rp-p rp-prop' }, noDash(P.proposed))) : null)
      : h('p', { class: 'rp-none' }, 'No talking points yet. They are written when the report drafts.'),
    h('div', { class: 'rp-blk' }, h('p', { class: 'rp-lab' }, 'What the team said'), box,
      h('p', { class: 'rp-note' }, read.team_source === 'meeting' ? 'The Monday call notes are already in. Anything typed here replaces them.' : 'Optional. Left empty, the read leans on the talking points.')),
    err, h('div', { class: 'rp-acts' }, write, redo));
}

/** A draft: the text in a box. Approve and send, Save, Write it again. A team only report (status handled: the brand
 *  has no client channel) is approved without a send. */
function draftCard(st) {
  const read = st.read || {}, approvedEdit = read.status === 'approved', teamOnly = st.rep.status === 'handled';
  const ta = h('textarea', { class: 'lx-input rp-ta', 'aria-label': 'How we read it' });
  ta.value = approvedEdit ? read.read_text || '' : read.draft || read.read_text || '';
  const notes = h('textarea', { class: 'lx-input rp-box', 'aria-label': 'What the team said', placeholder: 'Paste the call notes or type what the team agreed, then Write it again.' });
  notes.value = read.team_view || '';
  const err = h('div');
  const go = button(teamOnly ? 'Approve' : 'Approve and send', { primary: true, large: true });
  const save = button('Save', { large: true });
  const again = approvedEdit ? null : button('Write it again', { ghost: true, large: true });
  const cancel = approvedEdit ? button('Cancel', { ghost: true, large: true, onclick: () => { st.editing = false; st.redraw(); } }) : null;
  const all = [go, save, again, cancel].filter(Boolean);
  const lock = on => all.forEach(b => { b.disabled = on; });
  const text = () => ta.value.trim();
  go.addEventListener('click', () => {
    if (!text()) return put(err, h('p', { class: 'sd-err' }, 'The read cannot be empty.'));
    /* numbers that look incomplete: Approve and send asks twice (a team only approve sends nothing, so it never asks) */
    if (!teamOnly && !askTwice(go, st.row && st.row.hold, err)) return;
    run(st, err, lock, 'approve', { text: text(), send: !teamOnly }, teamOnly ? 'Approving...' : 'Approving and sending...');
  });
  save.addEventListener('click', () => { if (!text()) return put(err, h('p', { class: 'sd-err' }, 'The read cannot be empty.')); run(st, err, lock, 'save', { text: text() }, 'Saving...'); });
  if (again) again.addEventListener('click', () => {
    const n = notes.value.trim(), stored = String(read.team_view || '').trim();
    /* the same notes as stored keep their source (the call notes); changed notes become "notes you added"; the box
       emptied sends '' so the server clears the team view and the read is written from the talking points alone */
    run(st, err, lock, 'draft', { notes: n ? (n !== stored ? n : undefined) : (stored ? '' : undefined) }, 'Writing it again...');
  });
  return readShell({ chip: approvedEdit ? pill('warn', 'Editing an approved read') : pill('warn', 'Needs approval'), src: approvedEdit ? null : readSource(read, st.rep) },
    teamOnly ? null : holdLine(st.row && st.row.hold),
    h('p', { class: 'rp-note rp-note-top' }, teamOnly ? 'Team only: this brand has no client channel, so the report is not sent.' : 'This is the first thing the client reads, word for word. Short lines, the verdict first.'),
    ta, err, h('div', { class: 'rp-acts' }, go, save, again, cancel),
    approvedEdit ? null : h('div', { class: 'rp-blk' }, h('p', { class: 'rp-lab' }, 'What the team said'), notes));
}

/** Approved, not sent yet: the read, Send and Edit. */
function approvedCard(st) {
  const read = st.read || {};
  const by = read.approved_by ? 'Approved by ' + String(read.approved_by).split('@')[0] + (read.approved_at ? ', ' + dayOf(read.approved_at) : '') : 'Approved';
  const handled = st.rep.status === 'handled';
  /* A team only report (handled: no client channel) has nothing to send to. */
  const send = handled ? null : button('Send', { primary: true, large: true, onclick: () => sendSheet(itemOf(st.row, st.ctx), st.ctx, what => { if (what === 'sent') sentNow(st, read.read_text); }) });
  const edit = button('Edit', { large: true, onclick: () => { st.editing = true; st.redraw(); } });
  return readShell({ chip: pill('good', handled ? 'Approved, team only' : 'Approved, not sent'), src: by + '.' },
    handled ? null : holdLine(st.row && st.row.hold), readText(read.read_text || ''), h('div', { class: 'rp-acts' }, send, edit));
}

/** The report went out: freeze it on the page. */
function sentNow(st, text) {
  const now = new Date().toISOString();
  for (const r of [st.row, st.rep]) if (r) { r.status = 'sent'; r.sent_at = now; }
  if (text != null) st.rep.summary = text;
  st.read = { ...(st.read || {}), status: 'approved', read_text: text != null ? text : (st.read || {}).read_text };
  st.editing = false;
  st.redraw();
}

/* ---------- the writes ---------- */
const bodyOf = st => ({ act: st.ctx.brand.id, period: st.rep.period, start: st.rep.period_start });

async function refresh(st) {
  if (st.ctx.sample) return st.redraw();
  try { st.read = await readStatusOf(itemOf(st.row, st.ctx), st.ctx); }
  catch (e) { st.read = { status: 'error', error: errText(e) }; }
  st.redraw();
}

/** One write. what: points | draft | save | approve. */
async function run(st, err, lock, what, extra, busy) {
  lock(true);
  put(err, h('p', { class: 'rp-note' }, busy));
  try {
    if (st.ctx.sample) { await sampleWrite(st, what, extra); lock(false); return; }
    const { api } = st.ctx, b = { ...bodyOf(st), ...extra };
    let r;
    if (what === 'points') r = await api('/api/report-read/points', { worker: 'ah', method: 'POST', body: b });
    else if (what === 'draft') r = await api('/api/report-read/draft', { worker: 'ah', method: 'POST', body: b });
    else if (what === 'save') r = await api('/api/report-read', { worker: 'ah', method: 'PUT', body: b });
    else r = await api('/api/report-read/approve', { worker: 'ah', method: 'POST', body: b });
    if (what === 'approve' && r && r.approved && extra.send) {
      if (r.sent && r.sent.ok) {
        toast("Approved. Sent to the client's Slack channel");
        st.read = { ...(st.read || {}), status: 'approved', read_text: extra.text };
        return sentNow(st, extra.text);
      }
      toast('Approved, but not sent: ' + ((r.sent && r.sent.error) || r.error || 'the send did not go through'), { tone: 'bad', ms: 6000 });
      st.editing = false;
      return refresh(st);
    }
    if (r && r.error) throw new Error(r.error);
    if (what === 'save') { toast('Saved'); st.editing = false; }
    if (what === 'approve') { toast('Approved'); st.editing = false; }
    return refresh(st);
  } catch (e) {
    lock(false);
    put(err, h('p', { class: 'sd-err' }, (what === 'approve' ? 'Not approved: ' : what === 'save' ? 'Not saved: ' : 'Not written: ') + errText(e)));
  }
}

/* Sample mode: the flow can be clicked through, nothing leaves the page. */
async function sampleWrite(st, what, extra) {
  const read = { ...(st.read || { status: 'none' }) };
  const fx = st.d.sample_read || {};
  if (what === 'points') { read.status = 'points'; read.points = fx.points || read.points; }
  else if (what === 'draft') {
    if (extra.notes) { read.team_view = extra.notes; read.team_source = 'typed'; }
    else if (extra.notes === '') { read.team_view = null; read.team_source = null; }
    read.status = 'drafted'; read.draft = fx.draft || 'A steady week.';
  } else if (what === 'save') { read.status = 'drafted'; read.draft = extra.text; }
  else if (what === 'approve') {
    read.status = 'approved'; read.read_text = extra.text; read.approved_by = 'sam.rivera@example.com'; read.approved_at = new Date().toISOString();
    st.read = read; toast(SAMPLE_NOTE);
    if (extra.send) return sentNow(st, extra.text);
    st.editing = false; return st.redraw();
  }
  st.read = read; st.editing = false;
  toast(SAMPLE_NOTE);
  st.redraw();
}

/* ---------- styles (tokens only: type, radius, gaps, row hover) ---------- */
const RP_CSS = `.rp-top{display:grid;gap:var(--gap-5,24px);min-width:0}
.rp-head{display:grid;gap:var(--gap-4,16px);padding:var(--pad-card,20px);border-radius:var(--r-hero,20px);background:var(--surface,#fff);box-shadow:var(--sh-1);min-width:0}
.rp-head-top{display:flex;gap:var(--gap-4,16px);align-items:flex-start;justify-content:space-between;flex-wrap:wrap;min-width:0}
.rp-head-t{display:grid;gap:var(--gap-1,4px);min-width:0}
.rp-title{margin:0;font-size:var(--fs-page,26px);font-weight:600;line-height:var(--lh-head,1.25);letter-spacing:-.02em;color:var(--ink)}
.rp-title .rp-dot{color:var(--faint);font-weight:400;padding:0 .2em}
.rp-head-s{display:flex;gap:var(--gap-2,8px);align-items:center;flex-wrap:wrap;font-size:var(--fs-small,12.5px);color:var(--muted)}
.rp-head-r{display:flex;gap:var(--gap-3,12px);align-items:center;flex-wrap:wrap}
.rp-ctrl{display:flex;gap:var(--gap-3,12px);align-items:center;flex-wrap:wrap;padding-top:var(--gap-4,16px);border-top:1px solid var(--line)}
.rp-ctrl .lx-seg button{min-width:72px}
.rp-per{display:inline-flex;gap:var(--gap-1,4px);align-items:center;min-width:0}
.rp-per .lx-btn.icon{flex:none}
.rp-prev svg{transform:rotate(90deg)}.rp-next svg{transform:rotate(-90deg)}
select.rp-sel{height:36px;min-width:220px;max-width:100%;padding:0 32px 0 12px;border-radius:var(--r-btn,10px);font-size:var(--fs-body,14px);font-weight:500}
.rp-ctrl .rp-lab{margin:0}
.rp-skip{margin-left:auto}
.rp-card .lx-sec{flex-wrap:wrap}
.rp-card .lx-sec .act{margin-left:auto}
.rp-src{margin:var(--gap-2,8px) 0 0;font-size:var(--fs-small,12.5px);line-height:var(--lh-body,1.5);color:var(--muted)}
.rp-src-top{margin:var(--gap-1,4px) 0 var(--gap-4,16px)}
.rp-read{display:grid;gap:var(--gap-3,12px);max-width:72ch}
.rp-p{margin:0;font-size:var(--fs-body,14px);line-height:1.6;color:var(--ink)}
.rp-ul{margin:0;padding-left:20px;display:grid;gap:var(--gap-2,8px);font-size:var(--fs-body,14px);line-height:var(--lh-body,1.5);color:var(--ink)}
.rp-ol{margin:0;padding-left:22px;display:grid;gap:var(--gap-3,12px);font-size:var(--fs-body,14px);line-height:var(--lh-body,1.5)}
.rp-ol small{display:block;margin-top:2px;font-size:var(--fs-small,12.5px);color:var(--muted)}
.rp-pts{display:grid;gap:var(--gap-4,16px);margin-bottom:var(--gap-5,24px)}
.rp-pts-h{display:flex;gap:var(--gap-2,8px);align-items:center;flex-wrap:wrap}
.rp-sub{margin:0;font-size:var(--fs-card,14px);font-weight:600;line-height:var(--lh-head,1.25);color:var(--ink)}
.rp-blk{display:grid;gap:var(--gap-2,8px);margin-top:var(--gap-4,16px)}
.rp-pts .rp-blk{margin-top:0}
.rp-lab{margin:0;font-size:var(--fs-colhead,11.5px);font-weight:600;line-height:var(--lh-head,1.25);color:var(--muted)}
.rp-prop{color:var(--ink-2)}
.rp-none{margin:0;font-size:var(--fs-body,14px);color:var(--muted)}
.rp-note{margin:var(--gap-2,8px) 0 0;font-size:var(--fs-small,12.5px);line-height:var(--lh-body,1.5);color:var(--muted)}
.rp-note-top{margin:0 0 var(--gap-2,8px)}
.rp-blk .rp-note{margin:0}
textarea.rp-box{min-height:110px;font-size:var(--fs-body,14px);width:100%;border-radius:var(--r-btn,10px)}
textarea.rp-ta{min-height:200px;font-size:var(--fs-body,14px);line-height:1.6;width:100%;border-radius:var(--r-btn,10px)}
.rp-acts{display:flex;gap:var(--gap-2,8px);flex-wrap:wrap;align-items:center;margin-top:var(--gap-4,16px)}
.rp-grps{display:grid;column-gap:var(--gap-4,16px);row-gap:0;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:stretch}
.rp-grp{display:grid;grid-row:span 4;grid-template-rows:subgrid;gap:0;min-width:0;margin-bottom:var(--gap-4,16px);padding:var(--gap-4,16px) var(--gap-5,24px) var(--gap-2,8px);border-radius:var(--r-card,16px);background:var(--surface,#fff);box-shadow:var(--sh-1)}
.rp-tiles{display:contents}
.rp-grp-none,.rp-grp-one{grid-row:auto;grid-template-rows:auto 1fr}
.rp-grp-one{grid-template-rows:auto}.rp-grp-one .lx-kpi{border-top:0!important}
.rp-grp-h{display:flex;gap:var(--gap-2,8px);align-items:baseline;flex-wrap:wrap;padding-bottom:var(--gap-2,8px)}
.rp-grp-h h3{margin:0;font-size:var(--fs-card,14px);font-weight:600;line-height:var(--lh-head,1.25)}
.rp-grp-n{font-size:var(--fs-small,12.5px);color:var(--muted)}
.rp-tiles>.lx-kpi{padding:var(--gap-4,16px) 0;border-top:1px solid var(--line);align-content:start}
.rp-tiles>.lx-kpi .v{font-size:var(--num-l,26px)}
.rp-tiles .lx-spark,.rp-tiles svg{max-width:100%}
.rp-grp-none .rp-none{padding:var(--gap-4,16px) 0;border-top:1px solid var(--line)}
.rp-nogoal{margin-top:var(--gap-3,12px)}
.rp-tbl{border-radius:var(--r-tbl,12px);margin-top:var(--gap-3,12px)}
.rp-plat td.rp-q{color:var(--muted);font-size:var(--fs-small,12.5px)}
.rp-plat tbody tr:hover td{background:var(--row-hover)}
.rp-ads{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--gap-4,16px);align-items:stretch}
.rp-ad{display:flex;flex-direction:column;min-width:0;height:100%;border-radius:var(--r-card,16px);background:var(--surface,#fff);box-shadow:var(--sh-1);overflow:hidden;cursor:pointer;user-select:none;transition:box-shadow var(--t,.15s) var(--ease,ease),transform var(--t,.15s) var(--ease,ease)}
.rp-ad:hover{box-shadow:var(--sh-2,var(--sh-1));transform:translateY(-1px)}
.rp-ad:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
/* the same media as the Meta cards: square, the whole ad shown on the sunk background (1:1, 4:5 and 9:16 never cropped) */
.rp-pic{flex:none;aspect-ratio:1/1;background:var(--bg-sunk);display:grid;place-items:center;color:var(--muted);font-size:var(--fs-small,12.5px);position:relative;overflow:hidden}
.rp-pic img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center top;display:block}
.rp-vid{position:absolute;left:10px;top:10px;padding:2px 8px;border-radius:var(--r-chip,6px);background:rgba(0,0,0,.6);color:#fff;font-size:var(--fs-small,12.5px);font-weight:600}
.rp-adb{flex:1;display:flex;flex-direction:column;align-items:flex-start;gap:var(--gap-2,8px);padding:var(--gap-3,12px) var(--gap-4,16px) var(--gap-4,16px);min-width:0}
.rp-adn{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:calc(2 * 1.35em);font-size:var(--fs-card,14px);font-weight:600;line-height:1.35;color:var(--ink);overflow-wrap:anywhere}
.rp-adv{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--gap-3,12px);width:100%;margin:auto 0 0;padding-top:var(--gap-3,12px);border-top:1px solid var(--line)}
.rp-adv div{display:grid;gap:2px;min-width:0}
.rp-adv dt{font-size:var(--fs-small,12.5px);color:var(--muted)}
.rp-adv dd{margin:0;font-size:var(--num-s,14px);font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.rp-two{display:grid;gap:var(--gap-4,16px);grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.rp-loading{display:grid;gap:var(--gap-4,16px)}
.rp-every .cr-row.sel{box-shadow:inset 3px 0 0 var(--brand);background:var(--row-hover)}
.rp-every .cr-row.click:hover{background:var(--row-hover)}
/* phone: the selected row keeps its words and status off the orange bar */
@media (max-width:759px){.rp-every .cr-row.sel{padding-left:14px;padding-right:10px;border-radius:var(--r-chip,6px)}.rp-every .cr-row.sel .cr-cell{padding-left:0}}
.rp-day .lx-kpis{gap:var(--gap-4,16px)}

@media (max-width:759px){.rp-skip{margin-left:0;width:100%}.rp-skip .lx-btn{width:100%}.rp-acts .lx-btn{min-height:44px;flex:1 1 auto}.rp-title{font-size:var(--fs-section,17px)}.rp-ctrl{gap:var(--gap-2,8px)}.rp-ctrl .lx-seg{width:100%}.rp-ctrl .lx-seg button{flex:1;min-width:0}.rp-per{width:100%}select.rp-sel{flex:1;min-width:0}.rp-grp{padding:var(--gap-3,12px) var(--gap-4,16px) var(--gap-1,4px)}.rp-ads{grid-template-columns:minmax(0,1fr);gap:var(--gap-3,12px)}.rp-ad{display:grid;grid-template-columns:112px minmax(0,1fr)}.rp-pic{aspect-ratio:auto;min-height:112px;height:100%}.rp-pic img{object-position:center}.rp-adb{padding:var(--gap-2,8px) var(--gap-3,12px) var(--gap-3,12px)}.rp-adn{min-height:0}.rp-head{padding:var(--gap-4,16px);border-radius:var(--r-card,16px)}}`;

/* ---------- the page ---------- */
/* What the page keeps beside the data (never on it: the data object is the saved copy):
   reports read on demand, the card state per report, and what is picked (per brand, for this visit). */
const CACHE = new WeakMap();
const PICK = new Map();
const cacheOf = d => { let c = CACHE.get(d); if (!c) { c = { reps: {}, states: {}, failed: {}, busy: {} }; CACHE.set(d, c); } return c; };

/** A report's numbers, if the page has them. */
function repOf(d, key) {
  const c = cacheOf(d);
  if (d.latest && keyOf(d.latest) === key) return d.latest;
  if (d.client_latest && keyOf(d.client_latest) === key) return d.client_latest;
  return (d.more || {})[key] || c.reps[key] || null;
}

/** Read one report (and its read state for the team) that the page does not have yet, then draw again. */
async function fetchRep(d, ctx, r, redraw) {
  const c = cacheOf(d), key = keyOf(r);
  if (c.busy[key]) return;
  c.busy[key] = true;
  try {
    const rep = slim(await ctx.api(`/api/report?act=${encodeURIComponent(ctx.brand.id)}&period=${r.period}&start=${r.period_start}`, { worker: 'ah' }));
    if (rep) c.reps[key] = rep; else c.failed[key] = true;
  } catch { c.failed[key] = true; }
  c.busy[key] = false;
  redraw();
}

/** The card state for one report: its read (team, not sent) comes with the load for the focus draft, else on demand. */
function stateOf(d, ctx, key, rep, rowOf, redraw) {
  const c = cacheOf(d);
  let st = c.states[key];
  if (!st || st.rep !== rep) {
    const first = d.latest && keyOf(d.latest) === key && !ctx.isClient;
    st = { rep, row: rowOf, d, ctx, read: first ? d.read || null : null, editing: false };
    c.states[key] = st;
    if (!first && !ctx.isClient && rep.status !== 'sent') {
      if (ctx.sample) st.read = ((d.reads || {})[key]) || { status: 'none' };
      else {
        st.read = { status: 'loading' };
        readStatusOf(itemOf(rowOf, ctx), ctx).then(r => { st.read = r; }, e => { st.read = { status: 'error', error: errText(e) }; }).then(() => st.redraw && st.redraw());
      }
    }
  }
  st.ctx = ctx; st.row = rowOf; st.redraw = redraw;
  return st;
}

/** Daily: one day of a weekly or monthly report's day by day numbers. */
function dailyNodes(rep, day, ctx) {
  const days = rep.chart || [], i = days.findIndex(r => r.date === day);
  const r = days[i], prev = i > 0 ? days[i - 1] : null, cur = rep.currency;
  if (!r) return [empty({ title: 'No day picked', text: 'Pick a day above.' })];
  const W = short(r.date), hasSales = r.sales > 0;
  const vs = prev ? ' vs ' + wday(prev.date) + ' ' + short(prev.date) : null;
  const mer = r.spend > 0 && hasSales ? r.sales / r.spend : null, pmer = prev && prev.spend > 0 && prev.sales > 0 ? prev.sales / prev.spend : null;
  const tiles = [
    kpi({ label: 'Sales', value: hasSales ? r.sales : 'no data', unit: 'money', cur, window: W, source: TW, size: 'lg', sub: hasSales && prev ? [(c => delta(c, { bad: c < 0 }))(change(r.sales, prev.sales)), vs] : null }),
    kpi({ label: 'Ad spend', value: r.spend, unit: 'money', cur, window: W, source: PLATFORMS, sub: prev ? [delta(change(r.spend, prev.spend), { plain: true }), vs] : null }),
    kpi({ label: defLabel('Store MER', 'mer'), value: mer != null ? mer : 'no data', unit: 'x', window: W, source: TW, sub: pmer != null ? 'was ' + x(pmer) + vs : null }),
  ];
  return [
    card({ title: wday(r.date) + ' ' + short(r.date), class: 'rp-day' },
      h('p', { class: 'rp-src rp-src-top' }, 'There is no daily report to approve or send: the client gets each day in the daily Slack post. These numbers come from the ' + NAME[rep.period].toLowerCase() + ' for ' + span(rep.period_start, rep.period_end) + '.'),
      h('div', { class: 'rp-grps' }, tiles.map(t => h('section', { class: 'rp-grp rp-grp-one' }, h('div', { class: 'rp-tiles' }, t))))),
    chartOf(rep, i),
  ];
}

function draw(el, d, ctx) {
  css(); addStyles('lx-rp-css', RP_CSS);
  if (!d || !Array.isArray(d.rows)) return put(el, empty({ title: 'Reports did not answer', text: 'Nothing was read. Try again in a minute.' }));
  const rows = d.rows.filter(r => r.status !== 'skipped' && (!ctx.isClient || r.status === 'sent'));   /* the API already does this for a client; see as client needs it too */
  if (!rows.length) return put(el, empty({ title: 'No reports yet', text: ctx.isClient ? 'Your first weekly report arrives on a Monday.' : 'Weekly reports are drafted each Monday and monthly ones on the 1st.' }));
  const today = todayYmd();
  const redraw = () => draw(el, d, ctx);
  const team = !ctx.isClient;
  const c = cacheOf(d);

  /* The default report: for a client the newest sent one; for the team whatever load picked (the newest draft first). */
  let def = d.latest;
  if (ctx.isClient && def && def.status !== 'sent') def = d.client_latest || null;
  const defRow = (def && rows.find(r => keyOf(r) === keyOf(def))) || rows[0];
  const brandKey = (ctx.brand && ctx.brand.id) + (ctx.isClient ? '|c' : '');
  const pick = PICK.get(brandKey) || { type: defRow.period, key: keyOf(defRow) };
  const setPick = p => { PICK.set(brandKey, { ...pick, ...p }); redraw(); };

  /* Which report is on screen. Daily reads its days from the last weekly or monthly report picked. */
  const type = pick.type;
  const anchorRow = rows.find(r => keyOf(r) === pick.key) || defRow;
  const ofType = type === 'daily' ? [] : rows.filter(r => r.period === type);
  const focusRow = type === 'daily' ? anchorRow : (ofType.find(r => keyOf(r) === pick.key) || ofType[0] || null);
  const key = focusRow ? keyOf(focusRow) : null;
  let rep = key ? repOf(d, key) : null;
  if (focusRow && !rep && !ctx.sample && !c.failed[key]) fetchRep(d, ctx, focusRow, redraw);

  /* ---- the header: which report, its state, the type and period pickers, refresh ---- */
  const typeSeg = segmented([{ id: 'daily', label: 'Daily' }, { id: 'weekly', label: 'Weekly' }, { id: 'monthly', label: 'Monthly' }], type, id => {
    if (id === type) return;
    if (id === 'daily') return setPick({ type: 'daily', day: null });
    const first = rows.find(r => r.period === id);
    setPick({ type: id, key: first ? keyOf(first) : pick.key });
  });
  let periodNav = null, headline, sub = [];
  if (type === 'daily') {
    const days = rep ? (rep.chart || []).slice().reverse() : [];
    const day = days.find(r => r.date === pick.day) ? pick.day : (days[0] && days[0].date);
    const idx = days.findIndex(r => r.date === day);
    const sel = h('select', { class: 'lx-input rp-sel', 'aria-label': 'Pick a day', onchange: e => setPick({ day: e.target.value }) },
      days.map(r => h('option', { value: r.date, selected: r.date === day }, wday(r.date) + ' ' + short(r.date))));
    periodNav = days.length ? h('span', { class: 'rp-per' },
      button('', { ghost: true, icon: 'chevron', class: 'icon rp-prev', aria: 'The day before', disabled: idx >= days.length - 1, onclick: () => setPick({ day: days[idx + 1].date }) }),
      sel,
      button('', { ghost: true, icon: 'chevron', class: 'icon rp-next', aria: 'The day after', disabled: idx <= 0, onclick: () => setPick({ day: days[idx - 1].date }) })) : null;
    headline = [NAME.daily, day ? h('span', { class: 'rp-dot' }, '\u00b7') : null, day ? wday(day) + ' ' + short(day) : null];
    sub = [rep ? 'From the ' + NAME[rep.period].toLowerCase() + ', ' + span(rep.period_start, rep.period_end) : 'Reading the days...'];
    pick.day = day;
  } else if (focusRow) {
    const idx = ofType.indexOf(focusRow);
    const sel = h('select', { class: 'lx-input rp-sel', 'aria-label': 'Pick the ' + KIND[type], onchange: e => setPick({ key: e.target.value }) },
      ofType.map(r => h('option', { value: keyOf(r), selected: r === focusRow }, span(r.period_start, r.period_end) + (r.status === 'draft' && team ? ', draft' : ''))));
    periodNav = h('span', { class: 'rp-per' },
      button('', { ghost: true, icon: 'chevron', class: 'icon rp-prev', aria: 'The ' + KIND[type] + ' before', disabled: idx >= ofType.length - 1, onclick: () => setPick({ key: keyOf(ofType[idx + 1]) }) }),
      sel,
      button('', { ghost: true, icon: 'chevron', class: 'icon rp-next', aria: 'The ' + KIND[type] + ' after', disabled: idx <= 0, onclick: () => setPick({ key: keyOf(ofType[idx - 1]) }) }));
    const b = before(focusRow);
    headline = [NAME[type], h('span', { class: 'rp-dot' }, '\u00b7'), span(focusRow.period_start, focusRow.period_end)];
    sub = [statusOf(focusRow, ctx.isClient), h('span', null, 'Compared with ' + span(b.start, b.end))];
  } else {
    headline = [NAME[type]];
    sub = ['No ' + KIND[type] + 'ly reports yet'];
  }
  const draftFocus = team && focusRow && type !== 'daily' && focusRow.status === 'draft';
  const skip = draftFocus && canWrite(ctx) && d.can_skip !== false
    ? button('Do not send', { ghost: true, onclick: () => skipSheet(itemOf(focusRow, ctx), ctx, what => { if (what === 'skipped') { d.rows = d.rows.filter(r => r !== focusRow); if (d.latest && keyOf(d.latest) === key) d.latest = null; CACHE.delete(d); PICK.delete(brandKey); redraw(); } }) }) : null;
  const stamp = staleStamp({ at: d.read_at, label: 'Updated', onRefresh: async () => { reloadPage({ fresh: true }); await new Promise(r => setTimeout(r, 900)); } });
  const head = h('section', { class: 'rp-head' },
    h('div', { class: 'rp-head-top' },
      h('div', { class: 'rp-head-t' }, h('h2', { class: 'rp-title' }, headline), h('div', { class: 'rp-head-s' }, sub)),
      h('div', { class: 'rp-head-r' }, stamp)),
    h('div', { class: 'rp-ctrl' }, h('span', { class: 'rp-lab' }, 'Report'), typeSeg, periodNav, skip ? h('span', { class: 'rp-skip' }, skip) : null));

  /* ---- the report itself ---- */
  let main;
  if (!focusRow) main = [empty({ title: 'No ' + KIND[type] + 'ly reports yet', text: type === 'monthly' ? 'Monthly reports are drafted on the 1st.' : 'Weekly reports are drafted each Monday.' })];
  else if (!rep && (ctx.sample || c.failed[key])) main = [empty({ title: 'This report could not be read here', text: ctx.sample ? 'The sample has the numbers for the newest reports only.' : 'Try again in a minute.',
    action: !ctx.isClient && ctx.legacy ? h('a', { href: ctx.legacy, class: 'lx-btn ghost' }, 'Open in old ' + APP_NAME) : null })];
  else if (!rep) main = [h('div', { class: 'rp-loading' }, h('div', { class: 'lx-skel chart', style: { height: '200px' } }), h('div', { class: 'lx-skel chart', style: { height: '300px' } }))];
  else if (type === 'daily') main = dailyNodes(rep, pick.day, ctx);
  else {
    const st = stateOf(d, ctx, key, rep, focusRow, redraw);
    main = [readCard(st), ...body(st.rep, st.ctx)];
  }

  /* ---- Ask Locus AI: what is on screen ---- */
  if (rep) {
    const t = rep.totals || {};
    ctx.askContext = (type === 'daily' ? 'Daily numbers for ' + short(pick.day || rep.period_end) + ' from the ' : '') + NAME[rep.period] + ' for ' + ctx.brand.name + ', ' + span(rep.period_start, rep.period_end) + '. '
      + (t.sales > 0 ? 'Sales ' + money(t.sales, { cur: rep.currency }) + ', ad spend ' + money(t.spend, { cur: rep.currency }) + ', store MER ' + x(t.mer) + ' (Triple Whale). ' : '')
      + (rep.status === 'sent' ? 'Sent to the client ' + dayOf(rep.sent_at) + '.' : 'Not sent yet; How we read it is ' + (((c.states[key] || {}).read || {}).status || 'not started') + '.');
    ctx.askWindow = type === 'daily' ? short(pick.day || rep.period_end) : span(rep.period_start, rep.period_end);
  } else ctx.askContext = 'The Reports page for ' + ctx.brand.name + ': the weekly and monthly reports we send the client.';

  /* ---- every report: pick one in place ---- */
  const lines = rows.map(r => {
    const el = row({
      lead: dateOf(r.period_start, today),
      title: NAME[r.period] || 'Report',
      sub: team && r.hold && r.status === 'draft' ? span(r.period_start, r.period_end) + '. ' + r.hold : span(r.period_start, r.period_end),
      cells: [{ w: 210, label: 'Status', node: statusOf(r, ctx.isClient) }],
      onclick: () => { PICK.set(brandKey, { type: r.period, key: keyOf(r), day: null }); redraw(); el.closest('.rp-top') && window.scrollTo({ top: 0, behavior: 'smooth' }); },
    });
    if (focusRow && keyOf(r) === key) { el.classList.add('sel'); el.setAttribute('aria-current', 'true'); }
    return el;
  });
  put(el, h('div', { class: 'rp-top' }, helpBar(ctx.isClient ? [
      { title: 'What it is for', text: 'Every weekly and monthly report we sent you. Pick Weekly or Monthly and the period at the top; the newest is shown first.' },
      { title: 'The numbers', text: 'Sales are every store order in the period. Store MER is all sales divided by all ad spend. ROAS is one platform or one ad. Hover or tap any dotted label for its meaning.' },
    ] : [
      { title: 'What it is for', text: 'The weekly and monthly reports for this brand. The newest draft is on top with How we read it: talking points before the Monday call, then the read the team writes and approves, then Send.' },
      { title: 'Which report', text: 'The box at the top says which report is on screen. Pick Daily, Weekly or Monthly and the period with the arrows or the list. Daily shows one day from a weekly or monthly report; nothing is sent per day.' },
      { title: 'What the client gets', text: 'The approved read first, word for word, then the numbers, the platforms, the day by day chart and the best ads, exactly as drawn here. Team only parts (talking points, the notes box) never reach the client.' },
      { title: 'The numbers', text: 'Sales are every store order in the period, from Triple Whale. Store MER is all sales divided by all ad spend. Platform and ad ROAS are Triple Whale last platform click, and platform sales overlap. Hover or tap any dotted label for its meaning.' },
    ]), head, ...main,
    h('section', { class: 'cr-sect rp-every' }, heading('Every report', rows.length, 'pick one to show it above'), list(lines, null, { head: [{ label: 'Status', w: 210 }], first: 'Report' }))));
}

export default {
  async sample(ctx) {
    const d = await ctx.fixture('index.json');
    const pick = (k, rep) => rep ? { ...rep, platforms: platformRows(rep), amazon: amazonOf(rep), ads: bestAds(rep, 3), cm: marginOf(rep), this_week: linesOf(rep.this_week), need_from_you: linesOf(rep.need_from_you), this_week_from: rep.this_week_from || null, no_goal: noGoalOf(rep) } : null;
    const more = Object.fromEntries(Object.entries(d.more || {}).map(([k, v]) => [k, pick(k, v)]));
    const draftRow = (d.rows || []).find(r => r.status === 'draft');
    const latest = ctx.isClient || !draftRow ? pick('', d.latest) : more[keyOf(draftRow)] || pick('', d.latest);
    return { ...d, latest, client_latest: pick('', d.latest), more, read: draftRow && !ctx.isClient ? (d.reads || {})[keyOf(draftRow)] || { status: 'none' } : null, can_skip: true, read_at: Date.now() - 4 * 60e3 };
  },
  title: (ctx) => ctx.isClient ? ['How did the ', em('last report read?')] : ['How do we ', em('read this one?')],
  eyebrow: 'Reports',
  ranges: false,                 /* a report is a fixed week or month: the period picker on the page chooses it */
  stamp: false,                  /* the page draws its own "Updated" stamp with a refresh button beside the headline */
  async load(ctx) {
    const act = encodeURIComponent(ctx.brand.id);
    const list = await ctx.api('/api/reports?act=' + act, { worker: 'ah', signal: ctx.signal });
    const rows = (list.rows || []).filter(r => r.status !== 'skipped');
    const sent = rows.find(r => r.status === 'sent');
    /* The team works on the newest draft; a client (and See as client) reads the newest sent report. */
    const first = ctx.isClient ? sent : rows.find(r => r.status === 'draft') || sent || rows[0];
    const get = r => r ? ctx.api(`/api/report?act=${act}&period=${r.period}&start=${r.period_start}`, { worker: 'ah', signal: ctx.signal }).then(slim, () => null) : null;
    const [latest, client_latest] = await Promise.all([get(first), !ctx.isClient && sent && sent !== first ? get(sent) : null]);
    let read = null;
    if (!ctx.isClient && first && first.status !== 'sent') {
      try { read = await readStatusOf({ kind: 'report', act_id: ctx.brand.id, period: first.period, day: first.period_start }, ctx, ctx.signal); }
      catch (e) { read = { status: 'error', error: errText(e) }; }
    }
    /* Numbers that look incomplete (team only, one read): the warning line on the draft, and Send asks twice. */
    const holds = ctx.isClient ? new Map() : await readHolds(ctx, ctx.brand.id, ctx.signal);
    const holdFor = r => r.status === 'draft' ? holds.get('report|' + ctx.brand.id + '|' + r.period + '|' + r.period_start) || null : null;
    return {
      rows: rows.map(({ act_id, period, period_start, period_end, status, generated_at, sent_at }) => ({ act_id, period, period_start, period_end, status, generated_at, sent_at, hold: holdFor({ status, period, period_start }) })),
      latest, client_latest: client_latest || (latest && latest.status === 'sent' ? latest : null), read, can_skip: list.can_skip === true,
      read_at: Date.now(),
    };
  },
  render: draw,
  skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:150px"></div><div class="lx-skel chart" style="height:220px"></div><div class="lx-skel chart" style="height:300px"></div><div class="lx-skel row"></div>'; },
};
