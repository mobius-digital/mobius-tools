/* Agency > To send: every client message drafted and waiting for a person to read it and press Send, and what
   already went out. Daily updates (the day before, by brand) and weekly and monthly reports.
   Each waiting row has Send, Edit and Do not send, done here (_send.js holds the sheets and the exact routes, the
   same ones old Locus calls). Send shows the brand, where it goes and the exact words, and only the second tap sends.
   A brand with no client channel says so on the row instead of offering a Send that cannot work.
   Every row opens: a sent one shows what the client got (reads only), a waiting one the same preview with Send and Edit.

   How long items stay listed (the owner, 2026-11-26 pass): Waiting shows drafts from the last 14 days; older drafts fold
   into one "Older drafts, not sent" line that opens on a tap (nothing is marked or written). Sent shows the last
   30 days with "Show older". Nothing is ever deleted.

   Live data (account-health):
     GET /api/briefs?act=all    the latest briefs for every brand (status draft | sent | skipped | handled | error)
     GET /api/reports?act=all   the latest weekly and monthly reports (status draft | sent | handled | skipped),
                                and can_skip once the server can mark one report skipped
                                and read_status per row (How we read it: none | points | drafted | approved, null
                                when none was started). Send is offered only on an approved one; otherwise the row
                                says "Needs how we read it" and opens the brand's Reports page.
     GET /api/report-read?act=&period=&start=   only when the list has no read_status (an older server): one at a
                                time, for the newest waiting report of each brand (the rest show "Needs how we read it")
   The preview sheet reads (never writes):
     GET /api/brief-client-post?act=&date=      a daily update's client post (the sent text once it went out)
     GET /api/report?act=&period=&start=        a report's frozen numbers, drawn with the Reports page's own body()
   Writes: see _send.js. Sample mode simulates every write and reads the fixtures. */

import { put } from '../../kit.js';
import { h, addStyles, statusDot, button, segmented, em, empty, sheet } from '../../kit.js';
import { fixture } from '../../data.js';
import { span, short, dayOf, between, addDays, todayYmd, row, list, brandTag, colorOf, dateOf, css, helpBar, searchBox, selectBox, filterNote } from '../calendar/_cr.js';
import { actions, noChannel, sampleChannels, readStatusOf, readApproved, readBrief, slackText, whereOf, sendSheet, editSheet, openReports, readHolds, holdOf, holdLine } from './_send.js';
import { canWrite } from '../production/_act.js';
import { adm, countTiles } from '../a-settings/_look.js';
import { body as reportBody, reportStyles, slim } from '../reports/index.js';
import { platformRows, amazonOf, bestAds, marginOf, linesOf } from '../reports/_report.js';

const KEEP_WAITING = 14, KEEP_SENT = 30;   /* days a row stays in the list before it folds away (never deleted) */
const view = { show: 'waiting', q: '', brand: '', type: '', date: 'any', older: false, sentAll: false };

const TYPE = { daily: 'Daily update', weekly: 'Weekly report', monthly: 'Monthly report' };
const typeOf = i => i.kind === 'brief' ? 'daily' : i.period === 'monthly' ? 'monthly' : 'weekly';
const titleOf = i => i.kind === 'brief' ? 'Daily update, ' + short(i.day) : TYPE[typeOf(i)] + ', ' + span(i.day, i.end);
const isWaiting = i => i.status === 'draft' || i.status === 'error';
const didNotGo = i => i.status === 'error' || i.status === 'handled';
/** The day a row is dated by: when it went out, else when it was drafted. */
const dateKey = (i, today) => String(i.status === 'sent' ? i.sent_at || i.drafted_at || i.day : i.drafted_at || i.day || today).slice(0, 10);

/** After a write: change the one row in place and draw again. */
function changed(i, d, redraw) {
  return (what, text) => {
    if (what === 'sent') { i.src.status = 'sent'; i.src.sent_at = new Date().toISOString(); }
    else if (what === 'skipped') d.items = d.items.filter(x => x !== i.src);
    else if (what === 'edited' && i.kind === 'brief' && typeof text === 'string') { i.src.preview = text.replace(/\s+/g, ' ').trim().slice(0, 140); i.src.client = true; }
    redraw();
  };
}
const canSkip = (i, d) => i.kind === 'brief' ? (i.status === 'draft' || i.status === 'error') : i.status === 'draft' && d.can_skip === true;

/** The one status a row shows. A report that waits on its read says so here, not beside the buttons. */
function statusOf(i, none) {
  if (i.status === 'sent') return statusDot('good', 'Sent ' + dayOf(i.sent_at));
  if (i.status === 'error') return statusDot('bad', 'Send failed');
  if (i.status === 'handled') return statusDot('off', 'Team channel only');
  if (i.kind === 'report' && !readApproved(i.read)) return statusDot('warn', i.read && i.read.status === 'drafted' ? 'Read needs approval' : 'Needs how we read it');
  if (none) return statusDot('off', 'No client channel');
  return statusDot('warn', 'Waiting');
}

/* ---------- the preview sheet ---------- */
let sampleReports = null;
async function readReportFor(i, ctx) {
  if (ctx.sample) {
    if (!sampleReports) sampleReports = fixture('reports/_sample/index.json').catch(() => ({}));
    const f = await sampleReports, r = f.latest;
    if (!r) return null;
    return { ...r, period: i.period, period_start: i.day, period_end: i.end, status: i.status, sent_at: i.sent_at,
      platforms: platformRows(r), amazon: amazonOf(r), ads: bestAds(r, 3), cm: marginOf(r), this_week: linesOf(r.this_week), need_from_you: linesOf(r.need_from_you) };
  }
  return slim(await ctx.api(`/api/report?act=${encodeURIComponent(i.act_id)}&period=${encodeURIComponent(i.period)}&start=${encodeURIComponent(i.day)}`, { worker: 'ah' }));
}

/** One row opened: what the client got (sent), or what they would get (waiting, with Send and Edit). Reads only. */
async function viewSheet(i, d, ctx, redraw) {
  css(); reportStyles(); addStyles('lx-ts-css', TS_CSS);
  const box = h('div', { class: 'ts-view' }, h('p', { class: 'sd-note' }, 'Reading it...'));
  const sh = sheet({ title: titleOf(i), body: box });
  const where = await whereOf(i, ctx);
  const when = i.status === 'sent' ? 'Sent ' + dayOf(i.sent_at) + (where ? ' to ' + where : '')
    : i.status === 'handled' ? 'Posted in the team channel only. The client did not get it.'
      : i.status === 'error' ? 'The last send failed. It has not reached the client.'
        : 'Waiting since ' + dayOf(i.drafted_at || i.day) + (where ? '. Goes to ' + where : '');
  const head = h('div', { class: 'ts-head' }, brandTag(i.brand, i.color), h('span', { class: 'ts-chip' }, TYPE[typeOf(i)]), isWaiting(i) ? statusOf(i, i.none) : null, h('span', { class: 'ts-when' }, when));
  const acts = isWaiting(i) && canWrite(ctx) ? h('div', { class: 'sd-acts ts-acts' },
    i.kind === 'report' && !readApproved(i.read)
      ? button('Open Reports', { primary: true, large: true, onclick: () => { sh.close(); openReports(i, ctx); } })
      : button(i.none ? 'Team post' : 'Send', { primary: !i.none, large: true, onclick: () => { sh.close(); sendSheet(i, ctx, changed(i, d, redraw)); } }),
    i.kind === 'brief' ? button('Edit', { large: true, onclick: () => { sh.close(); editSheet(i, ctx, changed(i, d, redraw)); } }) : null,
    button('Close', { ghost: true, large: true, onclick: () => sh.close() })) : null;
  try {
    if (i.kind === 'brief') {
      const t = await readBrief(i, ctx);
      const text = String((t && t.text) || '').trim();
      put(box, head, isWaiting(i) ? holdLine(i.hold) : null, h('p', { class: 'sd-lab' }, i.status === 'sent' ? 'What the client got' : 'What the client gets'),
        text ? slackText(text) : h('p', { class: 'sd-note' }, 'There is no client post for this day.'), acts);
    } else {
      const rep = await readReportFor(i, ctx);
      if (!rep) throw new Error('The report has no numbers yet.');
      put(box, head, isWaiting(i) ? holdLine(i.hold) : null, ...reportBody(rep, { ...ctx, isClient: false }), acts);
    }
  } catch (e) {
    put(box, head, h('p', { class: 'sd-err' }, 'Could not read it: ' + ((e && e.message) || 'No answer from the server.')), acts);
  }
}

/* ---------- the page ---------- */
function draw(el, d, ctx) {
  css(); addStyles('lx-ts-css', TS_CSS);
  if (!d || !Array.isArray(d.items)) return put(el, empty({ title: 'Nothing was read', text: 'The briefs and reports did not answer. Try again in a minute.' }));
  const today = d.today || todayYmd();
  const redraw = () => draw(el, d, ctx);
  const items = d.items.map(i => ({ ...i, src: i, color: colorOf(ctx, i.act_id), none: noChannel(i, ctx, d.channels) }));
  const waiting = items.filter(isWaiting);
  const sentToday = items.filter(i => i.status === 'sent' && String(i.sent_at || '').slice(0, 10) === today);
  const old = waiting.filter(i => between(String(i.drafted_at || today).slice(0, 10), today) >= 1);
  const briefs = waiting.filter(i => i.kind === 'brief'), reports = waiting.filter(i => i.kind === 'report');

  /* the counts as batch 1 tiles: each says what it covers and where it comes from */
  const head = countTiles([
    { label: 'Waiting to send', value: String(waiting.length),
      sub: waiting.length ? statusDot(old.length ? 'bad' : 'warn', old.length ? old.length + ' drafted before today' : 'all drafted today') : 'nothing waiting',
      window: 'Right now', source: 'Briefs and reports' },
    { label: 'Daily updates waiting', value: String(briefs.length), sub: briefs.length ? 'read, then Send' : 'all sent', window: 'Last ' + KEEP_WAITING + ' days', source: 'Daily briefs' },
    { label: 'Reports waiting', value: String(reports.length), sub: reports.length ? 'weekly and monthly' : 'all sent', window: 'Last ' + KEEP_WAITING + ' days', source: 'Reports' },
    { label: 'Sent today', value: String(sentToday.length), sub: sentToday.length ? 'to clients' : 'none yet', window: 'Today', source: 'Send log' },
  ], { cols: 4 });
  ctx.askContext = `To send: ${waiting.length} client messages wait (${briefs.length} daily updates, ${reports.length} reports), ${old.length} drafted before today, ${sentToday.length} sent today.`;

  /* the filter row: built once, only the list redraws */
  const brands = new Map();
  for (const b of ctx.brands || []) brands.set(b.id, b.name);
  for (const i of items) if (!brands.has(i.act_id)) brands.set(i.act_id, i.brand);
  const listBox = h('div');
  const noteBox = h('span', { class: 'cr-fnote-slot' });
  const clear = () => { Object.assign(view, { q: '', brand: '', type: '', date: 'any' }); redraw(); };
  const tools = h('div', { class: 'cr-tools' },
    searchBox(view.q, v => { view.q = v; paint(); }, 'Search brand, title or text'),
    selectBox('Brand', [{ id: '', label: 'All brands' }, ...[...brands].sort((a, b) => String(a[1]).localeCompare(String(b[1]))).map(([id, name]) => ({ id, label: name }))], view.brand, v => { view.brand = v; paint(); }),
    selectBox('Type', [{ id: '', label: 'All types' }, { id: 'daily', label: 'Daily update' }, { id: 'weekly', label: 'Weekly report' }, { id: 'monthly', label: 'Monthly report' }], view.type, v => { view.type = v; paint(); }),
    selectBox('Date', [{ id: 'any', label: 'Any date' }, { id: '7', label: 'Last 7 days' }, { id: '30', label: 'Last 30 days' }, { id: 'month', label: 'This month' }], view.date, v => { view.date = v; paint(); }),
    noteBox);
  const status = segmented([
    { id: 'waiting', label: 'Waiting ' + waiting.length }, { id: 'sent', label: 'Sent' }, { id: 'failed', label: 'Did not go out' }, { id: 'all', label: 'Everything' },
  ], view.show, id => { view.show = id; view.older = false; view.sentAll = false; paint(); });

  const filtered = () => {
    const q = view.q.trim().toLowerCase();
    return items.filter(i => {
      if (view.brand && i.act_id !== view.brand) return false;
      if (view.type && typeOf(i) !== view.type) return false;
      const dk = dateKey(i, today);
      if (view.date === 'month' && dk.slice(0, 7) !== today.slice(0, 7)) return false;
      if ((view.date === '7' || view.date === '30') && between(dk, today) > +view.date) return false;
      if (q && ![i.brand, titleOf(i), i.preview, TYPE[typeOf(i)]].some(t => String(t || '').toLowerCase().includes(q))) return false;
      return true;
    });
  };
  const rowOf = i => row({
    lead: dateOf(i.day, today),
    title: titleOf(i),
    sub: i.hold && isWaiting(i) ? i.hold + '. Check the numbers before sending.'
      : i.status === 'error' ? 'The last send failed. Send it again, or edit it first.'
      : i.preview ? i.preview.replace(/^team brief:\s*/i, '')
        : i.status === 'sent' ? 'Sent ' + dayOf(i.sent_at) : 'Drafted ' + dayOf(i.drafted_at || i.day),
    one: true, late: i.status === 'error' || (!!i.hold && isWaiting(i)),
    cells: [
      { w: 150, label: 'Brand', node: brandTag(i.brand, i.color) },
      { w: 110, label: 'Type', node: TYPE[typeOf(i)], class: 'hide-md' },
      { w: 150, label: 'Status', node: statusOf(i, i.none) },
    ],
    action: isWaiting(i) ? actions(i, ctx, changed(i, d, redraw), { canSkip: canSkip(i, d), noChannel: i.none, read: i.read, dots: false }) : null,
    onclick: () => viewSheet(i, d, ctx, redraw),
  });
  const HEAD = [{ label: 'Brand', w: 150 }, { label: 'Type', w: 110, class: 'hide-md' }, { label: 'Status', w: 150 }];
  const GO = 236;

  function paint() {
    const all = filtered();
    const on = !!(view.q.trim() || view.brand || view.type || view.date !== 'any');
    let pick = view.show === 'waiting' ? all.filter(isWaiting) : view.show === 'sent' ? all.filter(i => i.status === 'sent') : view.show === 'failed' ? all.filter(didNotGo) : all;
    const total = view.show === 'waiting' ? waiting.length : view.show === 'sent' ? items.filter(i => i.status === 'sent').length : view.show === 'failed' ? items.filter(didNotGo).length : items.length;
    pick = pick.slice().sort((a, b) => dateKey(b, today).localeCompare(dateKey(a, today)) || String(b.day).localeCompare(String(a.day)));
    let older = [], fold = null;
    if (view.show === 'waiting') {
      older = pick.filter(i => between(dateKey(i, today), today) > KEEP_WAITING);
      pick = pick.filter(i => !older.includes(i));
      if (older.length) fold = h('button', { type: 'button', class: 'cr-fold', 'aria-expanded': String(view.older), onclick: () => { view.older = !view.older; paint(); } },
        (view.older ? 'Hide older drafts' : 'Older drafts (' + older.length + '), not sent'), h('small', null, 'drafted more than ' + KEEP_WAITING + ' days ago. Nothing is marked or deleted.'));
    } else if (view.show === 'sent' && !view.sentAll) {
      older = pick.filter(i => between(dateKey(i, today), today) > KEEP_SENT);
      pick = pick.filter(i => !older.includes(i));
      if (older.length) fold = h('button', { type: 'button', class: 'cr-fold', onclick: () => { view.sentAll = true; paint(); } },
        'Show older (' + older.length + ')', h('small', null, 'sent more than ' + KEEP_SENT + ' days ago'));
    }
    const shown = pick.length + (view.show === 'waiting' && view.older ? older.length : 0);
    put(noteBox, filterNote(shown, total, on, clear));
    const none = on ? h('span', null, 'Nothing matches. ', h('button', { type: 'button', class: 'cr-clear', onclick: clear }, 'Clear the filters.'))
      : view.show === 'waiting' ? (older.length ? 'Nothing from the last ' + KEEP_WAITING + ' days is waiting.' : 'Nothing is waiting. Every update and report is sent.')
        : view.show === 'failed' ? 'Nothing failed. Every update went out.' : 'Nothing here.';
    put(listBox,
      list(pick.map(rowOf), none, { head: HEAD, first: 'Message', go: GO }),
      fold,
      view.show === 'waiting' && view.older && older.length ? list(older.map(rowOf), null, { go: GO }) : null);
  }
  paint();
  put(el, adm(helpBar([
    { title: 'What it is for', text: 'Every daily update and weekly or monthly report drafted for a client. Read it, then Send, Edit or Do not send. Open any row to see exactly what the client gets, or got.' },
    { title: 'How long items stay listed', text: `Waiting: drafts from the last ${KEEP_WAITING} days. Older drafts fold into one line at the bottom. Sent: the last ${KEEP_SENT} days, with Show older for the rest. Nothing is ever deleted.` },
    { title: 'The statuses', text: 'Waiting: drafted, not sent. Needs how we read it: a report goes out only after its read is approved on the brand\'s Reports page. Did not go out: the send failed, or the brand has no client channel and it was posted in the team channel only.' },
  ]), head, h('section', { class: 'cr-sect' }, h('div', { class: 'cr-bar-top', style: { paddingBottom: '10px' } }, status), tools, listBox)));
}

const TS_CSS = `.ts-view{display:grid;gap:20px}
.ts-head{display:flex;gap:8px 14px;align-items:center;flex-wrap:wrap}
.ts-chip{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;background:var(--bg-sunk);font-size:12.5px;font-weight:600;color:var(--ink-2)}
.ts-when{flex-basis:100%;font-size:13.5px;color:var(--muted)}
.ts-acts{position:sticky;bottom:-1px;padding:12px 0 2px;background:var(--surface,#fff)}`;

export default {
  async sample(ctx) {
    const [d, channels] = await Promise.all([ctx.fixture('index.json'), sampleChannels()]);
    const items = await Promise.all((d.items || []).map(async i => i.kind === 'report' && i.status === 'draft' ? { ...i, read: await readStatusOf(i, ctx) } : i));
    return { ...d, items, can_skip: true, channels };
  },
  title: ['What is waiting ', em('to go to clients?')],
  eyebrow: 'To send',
  ranges: false,                 /* today's queue */
  async load(ctx) {
    const [b, r] = await Promise.all([
      ctx.api('/api/briefs?act=all', { worker: 'ah', signal: ctx.signal }),
      ctx.api('/api/reports?act=all', { worker: 'ah', signal: ctx.signal }),
    ]);
    const first = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    const items = [
      ...(b.rows || []).map(x => ({ kind: 'brief', act_id: x.act_id, brand: x.account_name, day: x.date, status: x.status, drafted_at: addDays(x.date, 1), sent_at: x.posted_at || null, preview: first(x.text) })),
      ...(r.rows || []).map(x => ({ kind: 'report', act_id: x.act_id, brand: x.account_name, day: x.period_start, end: x.period_end, period: x.period, status: x.status, drafted_at: x.generated_at, sent_at: x.sent_at || null })),
    ].filter(i => i.status !== 'skipped');
    /* Each waiting report's read, so Send is offered only on an approved one. The list carries read_status; only an
       older server without it costs a read per report, and then one at a time and only the newest per brand (the
       shared database is busy on sale weekends). */
    const fallback = new Set();
    for (const i of items) {
      if (i.kind !== 'report' || (i.status !== 'draft' && i.status !== 'error')) continue;
      const src = (r.rows || []).find(x => x.act_id === i.act_id && x.period === i.period && x.period_start === i.day) || {};
      if ('read_status' in src) { i.read = { status: src.read_status || 'none', read_text: src.read_status === 'approved' ? 'approved' : '' }; continue; }
      i.read = null;
      const newest = [...fallback].find(x => x.act_id === i.act_id);
      if (!newest) fallback.add(i);
      else if (String(i.day) > String(newest.day)) { fallback.delete(newest); fallback.add(i); }
    }
    for (const i of fallback) {
      try { const rd = await readStatusOf(i, ctx, ctx.signal); i.read = { status: rd.status || 'none', read_text: String(rd.read_text || '').trim() ? 'yes' : '' }; }
      catch (e) { if (e && e.name === 'AbortError') throw e; i.read = null; }
    }
    /* Numbers that look incomplete (team only, one read after the lists): the warning line, and Send asks twice. */
    const holds = await readHolds(ctx, 'all', ctx.signal);
    for (const i of items) if (i.status === 'draft' || i.status === 'error') i.hold = holdOf(holds, i);
    return { items, can_skip: r.can_skip === true };
  },
  render: draw,
  skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:150px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>'; },
};
