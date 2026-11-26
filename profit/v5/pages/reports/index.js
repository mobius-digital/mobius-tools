/* Reports: the weekly and monthly reports for one brand.
   The focus report is drawn on the page in the client page's order (How we read it, the numbers, by platform,
   day by day, best ads, this week), every other one is a row that opens the same layout in a sheet.
   The team sees the newest draft first, with the "How we read it" card that drives the flow:
     points    talking points for the call (team only), the "What the team said" box, Write how we read it
     drafted   the draft in a box: Approve and send, Save, Write it again
     approved  the read: Send (the confirm sheet in ../a-to-send/_send.js), Edit
     sent      the read, read only
   A client, and "See as client", get exactly the client page: the read and the numbers, no points, no buttons.

   Live data (account-health, worker 'ah'):
     GET  /api/reports?act=                         the list (a client gets sent reports only)
     GET  /api/report?act=&period=&start=           one report's frozen numbers and summary (= the approved read)
   Team only (never called for a client or "See as client"):
     GET  /api/report-read?act=&period=&start=      { status: none|points|drafted|approved, points, team_view,
                                                      team_source, meeting_id, draft, read_text, approved_by, approved_at }
     POST /api/report-read/points  { act, period, start }               write the talking points again
     POST /api/report-read/draft   { act, period, start, notes? }       write how we read it (notes = the team's view)
     PUT  /api/report-read         { act, period, start, text }         save an edit (status drafted)
     POST /api/report-read/approve { act, period, start, text, send? }  approve; send:true also sends
     POST /api/report-skip         { act, period, start }               Do not send (through _send.js)
   Sample mode simulates every write and says so. */

import { APP_NAME } from '../../config.js';
import { put, h, addStyles, hero, kpis, kpi, statusDot, sheet, em, empty, money, x, num, delta, lineChart, legend, card, button, toast, pill, noDash } from '../../kit.js';
import { css, span, short, dayOf, wday, heading, row, list, dateOf, todayYmd } from '../calendar/_cr.js';
import { sendSheet, skipSheet, readStatusOf } from '../a-to-send/_send.js';
import { canWrite } from '../production/_act.js';
import { platformRows, amazonOf, bestAds, marginOf, linesOf, change } from './_report.js';

const NAME = { weekly: 'Weekly report', monthly: 'Monthly report' };
const keyOf = r => r.period + '|' + r.period_start;
const SAMPLE_NOTE = 'Sample: nothing was changed';
const errText = e => (e && e.message) || 'No answer from the server.';

/** One report row as the send sheets want it. */
const itemOf = (r, ctx) => ({ kind: 'report', act_id: ctx.brand.id, brand: ctx.brand.name, day: r.period_start, end: r.period_end, period: r.period, status: r.status });

function statusOf(r, client) {
  if (r.status === 'sent') return statusDot('good', client ? 'Sent ' + dayOf(r.sent_at) : 'Sent to the client ' + dayOf(r.sent_at));
  if (r.status === 'handled') return statusDot('off', 'Team only');
  if (r.status === 'skipped') return statusDot('off', 'Skipped');
  return statusDot('warn', 'Draft, not sent');
}
/** What a read status says on a row. */
function readDot(read) {
  const s = read && read.status;
  if (s === 'approved') return statusDot('good', 'Read approved, ready to send');
  if (s === 'drafted') return statusDot('warn', 'Read written, needs approval');
  if (s === 'points') return statusDot('warn', 'Waiting on the call');
  return statusDot('warn', 'Needs how we read it');
}

/** Only what the page draws, so the saved copy stays small. Platforms and ads are read once, here. */
const slim = rep => rep && rep.data ? {
  period: rep.period, period_start: rep.period_start, period_end: rep.period_end, status: rep.status, sent_at: rep.sent_at || null, summary: rep.summary || '',
  currency: (rep.data.account && rep.data.account.currency) || 'USD', totals: rep.data.totals || null, previous: rep.data.previous || null,
  chart: (rep.data.chart || []).map(r => ({ date: r.date, sales: r.sales, spend: r.spend })),
  platforms: platformRows(rep.data), amazon: amazonOf(rep.data), ads: bestAds(rep.data, 3), cm: marginOf(rep.data),
  this_week: linesOf(rep.data.this_week), need_from_you: linesOf(rep.data.need_from_you),
} : null;

/* ---------- the numbers, in the client page's order ---------- */

/** The four figures of one report, against the period before. A brand with no sales source never reads 0 sales. */
function figures(rep, ctx) {
  const t = rep.totals || {}, p = rep.previous || {}, cur = rep.currency;
  const hasSales = t.sales > 0;
  const vs = rep.period === 'weekly' ? 'last week' : 'last month';
  const list = [
    kpi({ label: 'Sales', value: hasSales ? money(t.sales, { cur }) : 'no data', size: 'lg', lead: true,
      sub: hasSales ? [delta(change(t.sales, p.sales)), ' on ' + vs] : (ctx.isClient ? 'sales are not connected yet' : 'no sales source is connected') }),
    kpi({ label: 'Ad spend', value: money(t.spend, { cur }), size: 'lg', sub: [delta(change(t.spend, p.spend), { plain: true }), ' on ' + vs] }),
    kpi({ label: 'MER (whole store)', value: hasSales ? x(t.mer) : 'no data', size: 'lg', sub: hasSales && p.mer ? 'was ' + x(p.mer) : 'all sales over all ad spend' }),
    kpi({ label: 'Orders', value: hasSales && t.orders != null ? num(t.orders) : 'no data', size: 'lg', sub: hasSales && t.aov ? money(t.aov, { cur }) + ' average order' : '' }),
  ];
  if (rep.cm) list.push(kpi({ label: 'Contribution margin', value: money(rep.cm.cur, { cur }), size: 'lg', sub: rep.cm.prev != null ? 'was ' + money(rep.cm.prev, { cur }) : '' }));
  return kpis(list, { cols: list.length });
}

function platformsOf(rep) {
  const rows = rep.platforms || [], cur = rep.currency;
  if (!rows.length && !rep.amazon) return null;
  const tbl = rows.length ? h('div', { class: 'lx-table-wrap' }, h('table', { class: 'lx-table rp-plat' },
    h('thead', null, h('tr', null, h('th', null, 'Platform'), h('th', { class: 'num' }, 'Spend'), h('th', { class: 'num' }, 'Sales'), h('th', { class: 'num' }, 'ROAS'))),
    h('tbody', null, rows.map(p => h('tr', null,
      h('td', null, h('b', null, p.label)), h('td', { class: 'num' }, money(p.spend, { cur })),
      p.waiting ? h('td', { class: 'num rp-q', colspan: 2 }, p.note || 'not credited yet')
        : p.low ? [h('td', { class: 'num' }, p.sales != null ? money(p.sales, { cur }) : ''), h('td', { class: 'num rp-q' }, 'too few orders to read')]
          : [h('td', { class: 'num' }, money(p.sales, { cur })), h('td', { class: 'num' }, x(p.roas))]))))) : null;
  return h('section', { class: 'cr-sect' }, heading('By platform', null, 'Triple Whale attributed'), tbl,
    rep.amazon ? h('p', { class: 'rp-note', style: { color: 'var(--ink-2)' } }, 'Amazon: ' + money(rep.amazon.sales, { cur }) + ' in sales' + (rep.amazon.orders != null ? ' from ' + num(rep.amazon.orders) + ' orders.' : '.')) : null,
    rows.length ? h('p', { class: 'rp-note' }, 'Platform sales are Triple Whale attributed and overlap, so they add up to more than the store\'s sales.') : null);
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
      labels, format: v => money(v, { cur, compact: true }), height: 300, phoneHeight: 240,
      label: 'Sales and ad spend for each day of the report',
      hover: i => [h('b', null, labels[i]), hasSales ? ' sales ' + money(days[i].sales, { cur }) + ',' : '', ' ad spend ' + money(days[i].spend, { cur })],
    }));
}

function adsOf(rep) {
  const ads = rep.ads || [];
  if (!ads.length) return null;
  return h('section', { class: 'cr-sect' }, heading('Best ads', null, 'ROAS is Triple Whale attributed'),
    h('div', { class: 'rp-ads' }, ads.map(a => h('article', { class: 'rp-ad' },
      h('div', { class: 'rp-pic' }, a.thumb ? h('img', { src: a.thumb, alt: '', loading: 'lazy' }) : 'No picture', a.video ? h('span', { class: 'rp-vid' }, 'Video') : null),
      h('div', { class: 'rp-adb' }, h('b', null, noDash(a.name)),
        h('span', null, money(a.spend, { cur: rep.currency }) + ' spent' + (a.roas != null ? ', ' + x(a.roas) + ' ROAS' : '')))))));
}

function plansOf(rep) {
  const tw = rep.this_week || [], fy = rep.need_from_you || [];
  if (!tw.length && !fy.length) return null;
  const block = (t, items) => items.length ? card({ title: t }, h('ul', { class: 'rp-ul' }, items.map(s => h('li', null, noDash(s))))) : null;
  return h('section', { class: 'rp-two' }, block(rep.period === 'monthly' ? 'This month' : 'This week', tw), block('We need from you', fy));
}

/** The client's page order, under the read: numbers, by platform, day by day, best ads, this week. */
const body = (rep, ctx) => [h('section', { class: 'cr-sect' }, heading('The numbers', null, 'compared with the ' + (rep.period === 'weekly' ? 'week' : 'month') + ' before'), figures(rep, ctx)),
  platformsOf(rep), chartOf(rep), adsOf(rep), plansOf(rep)];

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
    out.push(/^what (we saw|it means|we're doing|we are doing)$/i.test(line) ? h('h4', { class: 'rp-h' }, line) : h('p', { class: 'rp-p' }, line));
  }
  return h('div', { class: 'rp-read' }, out);
}
const readOnly = (text, note) => card({ title: 'How we read it', class: 'rp-card', note },
  String(text || '').trim() ? readText(text) : h('p', { class: 'rp-none' }, 'Our read of this period is on its way.'));

const sourceLine = (read, rep) => read.team_source === 'meeting' ? (rep.period === 'monthly' ? 'From the call notes' : 'From the Monday call notes')
  : read.team_source === 'typed' ? 'From notes you added' : 'From the talking points (no call notes yet)';

/** The team's card. st: { rep, read, row, d, ctx, redraw } */
function readCard(st) {
  const { rep, ctx } = st, read = st.read || { status: 'none' };
  if (rep.status === 'sent' || ctx.isClient) return readOnly(rep.summary);
  if (!canWrite(ctx)) return readOnly(read.read_text || read.draft || '', 'Only the team sees this until it is sent');
  if (read.status === 'error') return card({ title: 'How we read it', class: 'rp-card' },
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
  return card({ title: 'How we read it', class: 'rp-card', note: 'Waiting on the call' },
    pts.length || qs.length || P.proposed ? h('div', { class: 'rp-pts' },
      h('div', { class: 'rp-pts-h' }, h('b', null, 'Talking points for the call'), pill('', 'Only the team sees these')),
      pts.length ? h('ol', { class: 'rp-ol' }, pts.map(p => h('li', null, h('span', null, noDash(p.line)), p.why ? h('small', null, noDash(p.why)) : null))) : null,
      qs.length ? [h('p', { class: 'rp-lab' }, 'Settle on the call'), h('ul', { class: 'rp-ul' }, qs.map(q => h('li', null, noDash(typeof q === 'string' ? q : q.line || q.q || ''))))] : null,
      P.proposed ? [h('p', { class: 'rp-lab' }, 'Proposed read'), h('p', { class: 'rp-p rp-prop' }, noDash(P.proposed))] : null)
      : h('p', { class: 'rp-none' }, 'No talking points yet. They are written when the report drafts.'),
    h('p', { class: 'rp-lab' }, 'What the team said'), box,
    h('p', { class: 'rp-note' }, read.team_source === 'meeting' ? 'The Monday call notes are already in. Anything typed here replaces them.' : 'Optional. Left empty, the read leans on the talking points.'),
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
  go.addEventListener('click', () => { if (!text()) return put(err, h('p', { class: 'sd-err' }, 'The read cannot be empty.')); run(st, err, lock, 'approve', { text: text(), send: !teamOnly }, teamOnly ? 'Approving...' : 'Approving and sending...'); });
  save.addEventListener('click', () => { if (!text()) return put(err, h('p', { class: 'sd-err' }, 'The read cannot be empty.')); run(st, err, lock, 'save', { text: text() }, 'Saving...'); });
  if (again) again.addEventListener('click', () => {
    const n = notes.value.trim(), stored = String(read.team_view || '').trim();
    /* the same notes as stored keep their source (the call notes); changed notes become "notes you added"; the box
       emptied sends '' so the server clears the team view and the read is written from the talking points alone */
    run(st, err, lock, 'draft', { notes: n ? (n !== stored ? n : undefined) : (stored ? '' : undefined) }, 'Writing it again...');
  });
  return card({ title: 'How we read it', class: 'rp-card', note: approvedEdit ? 'Editing an approved read' : sourceLine(read, st.rep) },
    h('p', { class: 'rp-note' }, teamOnly ? 'Team only: this brand has no client channel, so the report is not sent.' : 'This is the first thing the client reads, word for word. Short lines, the verdict first.'),
    ta, err, h('div', { class: 'rp-acts' }, go, save, again, cancel),
    approvedEdit ? null : [h('p', { class: 'rp-lab' }, 'What the team said'), notes]);
}

/** Approved, not sent yet: the read, Send and Edit. */
function approvedCard(st) {
  const read = st.read || {};
  const by = read.approved_by ? 'Approved by ' + String(read.approved_by).split('@')[0] + (read.approved_at ? ', ' + dayOf(read.approved_at) : '') : 'Approved';
  /* A team only report (handled: no client channel) has nothing to send to. */
  const send = st.rep.status === 'handled' ? null : button('Send', { primary: true, large: true, onclick: () => sendSheet(itemOf(st.row, st.ctx), st.ctx, what => { if (what === 'sent') sentNow(st, read.read_text); }) });
  const edit = button('Edit', { large: true, onclick: () => { st.editing = true; st.redraw(); } });
  return card({ title: 'How we read it', class: 'rp-card', note: st.rep.status === 'handled' ? by + '. Team only' : by }, readText(read.read_text || ''), h('div', { class: 'rp-acts' }, send, edit));
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

/* ---------- styles ---------- */
const RP_CSS = `.rp-card .lx-sec{flex-wrap:wrap}
.rp-read{display:grid;gap:10px;max-width:72ch}
.rp-read .rp-p{font-size:18px;line-height:1.55;letter-spacing:-.008em}
.rp-h{margin:12px 0 0;font-size:12px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.rp-h:first-child{margin-top:0}
.rp-p{margin:0;font-size:15px;line-height:1.6;color:var(--ink)}
.rp-ul{margin:0;padding-left:20px;display:grid;gap:6px;font-size:15px;line-height:1.55;color:var(--ink)}
.rp-ol{margin:0;padding-left:22px;display:grid;gap:10px;font-size:15px;line-height:1.5}
.rp-ol small{display:block;margin-top:2px;font-size:13px;color:var(--muted)}
.rp-pts{display:grid;gap:10px;padding:16px;border-radius:14px;background:var(--bg-sunk);margin-bottom:18px}
.rp-pts-h{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.rp-lab{margin:6px 0 0;font-size:12px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.rp-prop{font-style:italic;color:var(--ink-2)}
.rp-none{margin:0;font-size:14.5px;color:var(--muted)}
.rp-note{margin:8px 0 0;font-size:13px;line-height:1.5;color:var(--muted)}
textarea.rp-box{min-height:110px;font-size:14.5px;margin-top:8px;width:100%}
textarea.rp-ta{min-height:200px;font-size:16px;line-height:1.55;margin-top:10px;width:100%}
.rp-acts{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:14px}
.rp-plat td.rp-q{color:var(--muted);font-size:13px}
.rp-ads{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px}
.rp-ad{border-radius:16px;background:var(--surface);box-shadow:var(--sh-1);overflow:hidden;display:grid;min-width:0}
.rp-pic{aspect-ratio:1/1;background:var(--bg-sunk);display:grid;place-items:center;color:var(--muted);font-size:13px;position:relative;overflow:hidden}
.rp-pic img{width:100%;height:100%;object-fit:cover;display:block}
.rp-vid{position:absolute;left:10px;top:10px;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font-size:11.5px;font-weight:600}
.rp-adb{display:grid;gap:3px;padding:12px 14px 14px;font-size:13.5px;color:var(--ink-2)}
.rp-adb b{font-size:14.5px;color:var(--ink);line-height:1.35;overflow-wrap:anywhere}
.rp-two{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.rp-top{display:grid;gap:var(--gap-page)}
@media (max-width:759px){.rp-acts .lx-btn{min-height:44px;flex:1 1 auto}.rp-read .rp-p{font-size:16.5px}}`;

/* ---------- the page ---------- */
const STATE = new WeakMap();

/** The read card and the numbers for one report, as one list of nodes. */
const reportNodes = st => [readCard(st), ...body(st.rep, st.ctx)];

async function open(r, d, ctx, redrawPage) {
  const box = h('div', { class: 'cr-sheet rp-top' }, h('p', { class: 'cr-none', style: { border: 0 } }, 'Reading the report...'));
  const sh = sheet({ title: NAME[r.period] + ', ' + span(r.period_start, r.period_end), body: box });
  let rep = d.latest && keyOf(d.latest) === keyOf(r) ? d.latest : (d.more || {})[keyOf(r)] || null;
  if (!rep && !ctx.sample) {
    try { rep = slim(await ctx.api(`/api/report?act=${encodeURIComponent(ctx.brand.id)}&period=${r.period}&start=${r.period_start}`, { worker: 'ah' })); }
    catch { rep = null; }
  }
  if (!rep) return put(box, h('p', { class: 'cr-none', style: { border: 0 } }, 'This report could not be read here.'),
    !ctx.isClient && ctx.legacy ? h('a', { href: ctx.legacy, style: { fontSize: '13px', color: 'var(--muted)' } }, 'Open in old ' + APP_NAME) : null);
  const st = { rep, row: r, d, ctx, read: null, editing: false };
  st.redraw = () => { put(box, h('div', null, statusOf(r, ctx.isClient)), reportNodes(st)); redrawPage && redrawPage(); };
  if (!ctx.isClient && r.status !== 'sent') {
    if (ctx.sample) st.read = ((d.reads || {})[keyOf(r)]) || { status: 'none' };
    else { try { st.read = await readStatusOf(itemOf(r, ctx), ctx); } catch (e) { st.read = { status: 'error', error: errText(e) }; } }
  }
  put(box, h('div', null, statusOf(r, ctx.isClient)), reportNodes(st));
}

function draw(el, d, ctx) {
  css(); addStyles('lx-rp-css', RP_CSS);
  if (!d || !Array.isArray(d.rows)) return put(el, empty({ title: 'Reports did not answer', text: 'Nothing was read. Try again in a minute.' }));
  const rows = d.rows.filter(r => r.status !== 'skipped' && (!ctx.isClient || r.status === 'sent'));   /* the API already does this for a client; see as client needs it too */
  if (!rows.length) return put(el, empty({ title: 'No reports yet', text: ctx.isClient ? 'Your first weekly report arrives on a Monday.' : 'Weekly reports are drafted each Monday and monthly ones on the 1st.' }));
  const today = todayYmd();
  const redraw = () => draw(el, d, ctx);

  /* The focus report: for a client the newest sent one; for the team whatever load picked (the newest draft first). */
  let rep = d.latest;
  if (ctx.isClient && rep && rep.status !== 'sent') rep = d.client_latest || null;
  const focusRow = rep ? rows.find(r => keyOf(r) === keyOf(rep)) || rep : null;
  const team = !ctx.isClient;
  /* The card's state lives beside the data (never on it: the data object is the saved copy). */
  const old = STATE.get(d);
  const st = rep ? (old && old.rep === rep ? old : { rep, row: focusRow, d, ctx, read: d.read || null, editing: false }) : null;
  if (st) { st.ctx = ctx; st.redraw = redraw; STATE.set(d, st); }
  /* Waiting to send = a draft. A team only report (handled: no client channel) is never offered a send or a skip. */
  const draft = team && rep && rep.status === 'draft';
  const teamOnly = team && rep && rep.status === 'handled';

  const top = rep ? [
    hero({ line: true },
      h('div', { class: 'cr-bar-top', style: { paddingBottom: '4px' } },
        h('div', { class: 'cr-heroline' },
          h('span', { class: 'lab' }, (draft ? 'Waiting to send: ' + NAME[rep.period].toLowerCase() + ', ' : teamOnly ? 'Team only: ' + NAME[rep.period].toLowerCase() + ', ' : rep.status === 'sent' ? 'Latest report, ' : 'Latest draft, ') + span(rep.period_start, rep.period_end)),
          h('span', { class: 'of' }, draft ? readDot(st.read) : statusOf(rep, ctx.isClient))),
        h('span', { class: 'sp' }),
        draft && canWrite(ctx) && d.can_skip !== false && focusRow
          ? button('Do not send', { ghost: true, onclick: () => skipSheet(itemOf(focusRow, ctx), ctx, what => { if (what === 'skipped') { d.rows = d.rows.filter(x => x !== focusRow); d.latest = null; STATE.delete(d); redraw(); } }) }) : null)),
    ...reportNodes(st),
  ] : [];

  const lines = rows.map(r => row({
    lead: dateOf(r.period_start, today),
    title: NAME[r.period] || 'Report',
    sub: span(r.period_start, r.period_end),
    cells: [{ w: 210, node: statusOf(r, ctx.isClient) }],
    onclick: () => open(r, d, ctx, null),
  }));
  put(el, h('div', { class: 'rp-top' }, ...top, h('section', { class: 'cr-sect' }, heading('Every report', rows.length, ctx.isClient ? 'tap one to read it' : null), list(lines))));
}

export default {
  async sample(ctx) {
    const d = await ctx.fixture('index.json');
    const pick = (k, rep) => rep ? { ...rep, platforms: platformRows(rep), amazon: amazonOf(rep), ads: bestAds(rep, 3), cm: marginOf(rep), this_week: linesOf(rep.this_week), need_from_you: linesOf(rep.need_from_you) } : null;
    const more = Object.fromEntries(Object.entries(d.more || {}).map(([k, v]) => [k, pick(k, v)]));
    const draftRow = (d.rows || []).find(r => r.status === 'draft');
    const latest = ctx.isClient || !draftRow ? pick('', d.latest) : more[keyOf(draftRow)] || pick('', d.latest);
    return { ...d, latest, client_latest: pick('', d.latest), more, read: draftRow && !ctx.isClient ? (d.reads || {})[keyOf(draftRow)] || { status: 'none' } : null, can_skip: true };
  },
  title: (ctx) => ctx.isClient ? ['How did the ', em('last report read?')] : ['How do we ', em('read this one?')],
  eyebrow: 'Reports',
  ranges: false,                 /* a report is a fixed week or month */
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
    return {
      rows: rows.map(({ act_id, period, period_start, period_end, status, generated_at, sent_at }) => ({ act_id, period, period_start, period_end, status, generated_at, sent_at })),
      latest, client_latest: client_latest || (latest && latest.status === 'sent' ? latest : null), read, can_skip: list.can_skip === true,
    };
  },
  render: draw,
  skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:220px"></div><div class="lx-skel chart" style="height:190px"></div><div class="lx-skel chart" style="height:300px"></div><div class="lx-skel row"></div>'; },
};
