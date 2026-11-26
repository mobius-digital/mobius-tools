/* Agency > To send: every client message drafted and waiting for a person to read it and press Send.
   Daily updates (the day before, by brand) and weekly and monthly reports. Each waiting row has Send, Edit and
   Do not send, done here (_send.js holds the sheets and the exact routes, the same ones old Locus calls).
   Send shows the brand, where it goes and the exact words, and only the second tap sends.
   A brand with no client channel says so on the row instead of offering a Send that cannot work.
   Live data (account-health):
     GET /api/briefs?act=all    the latest briefs for every brand (status draft | sent | skipped | handled | error)
     GET /api/reports?act=all   the latest weekly and monthly reports (status draft | sent | handled | skipped),
                                and can_skip once the server can mark one report skipped
     GET /api/report-read?act=&period=&start=   for each waiting report: is "How we read it" approved? Send is
                                offered only then; otherwise the row says "Needs how we read it" and opens the
                                brand's Reports page (a row may also carry read_status from the list itself)
   Writes: see _send.js. Sample mode simulates every write. */

import { put } from '../../kit.js';
import { h, hero, kpis, kpi, statusDot, button, segmented, em, empty } from '../../kit.js';
import { span, short, dayOf, away, between, addDays, todayYmd, row, list, brandTag, colorOf, dateOf, css } from '../calendar/_cr.js';
import { actions, noChannel, sampleChannels, readStatusOf, readApproved } from './_send.js';

const view = { show: 'waiting' };

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

function draw(el, d, ctx) {
  css();
  if (!d || !Array.isArray(d.items)) return put(el, empty({ title: 'Nothing was read', text: 'The briefs and reports did not answer. Try again in a minute.' }));
  const today = d.today || todayYmd();
  const items = d.items.map(i => ({ ...i, src: i, color: colorOf(ctx, i.act_id) }));
  const waiting = items.filter(i => i.status === 'draft' || i.status === 'error');
  const sentToday = items.filter(i => i.status === 'sent' && String(i.sent_at || '').slice(0, 10) === today);
  const old = waiting.filter(i => between(String(i.drafted_at || today).slice(0, 10), today) >= 1);
  const briefs = waiting.filter(i => i.kind === 'brief'), reports = waiting.filter(i => i.kind === 'report');

  const head = hero({ line: true }, kpis([
    kpi({ label: 'Waiting to send', value: String(waiting.length), size: 'lg', lead: false,
      sub: waiting.length ? statusDot(old.length ? 'bad' : 'warn', old.length ? old.length + ' drafted before today' : 'all drafted today') : 'nothing waiting' }),
    kpi({ label: 'Daily updates', value: String(briefs.length), size: 'lg', sub: briefs.length ? 'to read and send' : 'all sent' }),
    kpi({ label: 'Reports', value: String(reports.length), size: 'lg', sub: reports.length ? 'weekly and monthly' : 'all sent' }),
    kpi({ label: 'Sent today', value: String(sentToday.length), size: 'lg', sub: sentToday.length ? 'to clients' : 'none yet' }),
  ], { cols: 4 }));

  const box = h('section', { class: 'cr-sect' });
  const paint = () => {
    const pick = view.show === 'waiting' ? waiting : view.show === 'sent' ? items.filter(i => i.status === 'sent').slice(0, 40) : items.slice(0, 60);
    pick.sort((a, b) => view.show === 'waiting' ? String(a.drafted_at).localeCompare(String(b.drafted_at)) : String(b.sent_at || b.drafted_at).localeCompare(String(a.sent_at || a.drafted_at)));
    const rows = pick.map(i => row({
      lead: dateOf(i.day, today),
      title: i.kind === 'brief' ? 'Daily brief for ' + short(i.day) : (i.period === 'monthly' ? 'Monthly report, ' : 'Weekly report, ') + span(i.day, i.end),
      sub: i.kind === 'report' && (i.status === 'draft' || i.status === 'error') && !readApproved(i.read)
        ? (i.read && i.read.status === 'drafted' ? 'How we read it is written. Approve it to send.' : i.read && i.read.status === 'points' ? 'Needs how we read it: the talking points wait for the call.' : 'Needs how we read it.')
        : i.status === 'error' ? 'The last send failed. Send it again, or edit it first.'
        : i.preview ? (i.kind === 'brief' && !i.client && i.status !== 'sent' ? 'Team brief: ' : '') + i.preview
        : (i.status === 'sent' ? 'Sent ' + dayOf(i.sent_at) : 'Drafted ' + away(today, String(i.drafted_at || today).slice(0, 10))),
      late: i.status === 'error',
      cells: [
        { w: 170, node: brandTag(i.brand, i.color) },
        { w: 150, node: i.status === 'sent' ? statusDot('good', 'Sent ' + dayOf(i.sent_at)) : i.status === 'error' ? statusDot('bad', 'Draft failed') : i.status === 'handled' ? statusDot('off', 'Team only') : statusDot('warn', 'Waiting') },
      ],
      action: i.status === 'draft' || i.status === 'error'
        ? actions(i, ctx, changed(i, d, () => draw(el, d, ctx)), { canSkip: canSkip(i, d), noChannel: noChannel(i, ctx, d.channels), read: i.read }) : null,
    }));
    put(box, 
      h('div', { class: 'cr-bar-top', style: { paddingBottom: '6px' } },
        segmented([{ id: 'waiting', label: 'Waiting ' + waiting.length }, { id: 'sent', label: 'Sent' }, { id: 'all', label: 'Everything' }], view.show, id => { view.show = id; paint(); })),
      list(rows, view.show === 'waiting' ? 'Nothing is waiting. Every brief and report is sent.' : 'Nothing here.'));
  };
  paint();
  put(el, head, box);
}

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
    /* Each waiting report's read, so Send is offered only on an approved one. A few drafts at most, read at once. */
    await Promise.all(items.map(async i => {
      if (i.kind !== 'report' || (i.status !== 'draft' && i.status !== 'error')) return;
      const src = (r.rows || []).find(x => x.act_id === i.act_id && x.period === i.period && x.period_start === i.day) || {};
      if (src.read_status) { i.read = { status: src.read_status, read_text: src.read_status === 'approved' ? 'approved' : '' }; return; }
      try { const rd = await readStatusOf(i, ctx, ctx.signal); i.read = { status: rd.status || 'none', read_text: String(rd.read_text || '').trim() ? 'yes' : '' }; }
      catch (e) { if (e && e.name === 'AbortError') throw e; i.read = null; }
    }));
    return { items, can_skip: r.can_skip === true };
  },
  render: draw,
  skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:150px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>'; },
};
