/* Agency > To send: every client message drafted and waiting for a person to read it and press Send.
   Daily briefs (the day before, by brand) and weekly and monthly reports. The review and the Send button stay in
   old Locus, so each row opens that brand's screen there. "Do not send" marks one row skipped, after a check:
   nothing is deleted and no other row is touched.
   Live data (account-health):
     GET /api/briefs?act=all    the latest briefs for every brand (status draft | sent | skipped | handled | error)
     GET /api/reports?act=all   the latest weekly and monthly reports (status draft | sent | handled | skipped),
                                and can_skip once the server can mark one report skipped
     POST /api/brief-skip       { act, date } marks one brief skipped
     POST /api/report-skip      { act, period, start } marks one report skipped (only when can_skip is true) */

import { put } from '../../kit.js';
import { h, hero, kpis, kpi, statusDot, button, segmented, em, empty, sheet, toast } from '../../kit.js';
import { legacyUrl } from '../../config.js';
import { css, span, short, dayOf, away, between, addDays, todayYmd, heading, row, list, brandTag, colorOf, dateOf } from '../calendar/_cr.js';

const view = { show: 'waiting' };

/** "Do not send" on one unsent row: a confirm sheet, then the one skip route for that row. Never a bulk route. */
function skipSheet(i, ctx, d, redraw) {
  const go = button('Do not send', { primary: true, large: true });
  const no = button('Keep it', { large: true });
  const what = i.kind === 'brief' ? 'The daily brief for ' + short(i.day) : (i.period === 'monthly' ? 'The monthly report, ' : 'The weekly report, ') + span(i.day, i.end);
  const sh = sheet({ title: 'Do not send this one?', side: 'center', body: h('div', { style: { display: 'grid', gap: '16px' } },
    h('p', null, h('b', null, what + ' for ' + (i.brand || 'this brand') + '. '), 'This one will not go to the client. Nothing is deleted.'),
    h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, go, no)) });
  no.addEventListener('click', () => sh.close());
  go.addEventListener('click', async () => {
    go.disabled = no.disabled = true;
    try {
      if (ctx.sample) { toast('Sample: nothing saved'); sh.close(); return; }
      if (i.kind === 'brief') await ctx.api('/api/brief-skip', { worker: 'ah', method: 'POST', body: { act: i.act_id, date: i.day } });
      else await ctx.api('/api/report-skip', { worker: 'ah', method: 'POST', body: { act: i.act_id, period: i.period, start: i.day } });
      d.items = d.items.filter(x => x !== i.src);
      sh.close(); toast('Marked Do not send'); redraw();
    } catch (e) {
      go.disabled = no.disabled = false;
      toast('Not saved: ' + ((e && e.message) || 'no answer from the server.'), { tone: 'bad', ms: 6000 });
    }
  });
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
    kpi({ label: 'Daily briefs', value: String(briefs.length), size: 'lg', sub: briefs.length ? 'to read and send' : 'all sent' }),
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
      sub: i.status === 'error' ? 'The draft failed. Open it to try again.' : i.preview || (i.status === 'sent' ? 'Sent ' + dayOf(i.sent_at) : 'Drafted ' + away(today, String(i.drafted_at || today).slice(0, 10))),
      late: i.status === 'error',
      cells: [
        { w: 170, node: brandTag(i.brand, i.color) },
        { w: 150, node: i.status === 'sent' ? statusDot('good', 'Sent ' + dayOf(i.sent_at)) : i.status === 'error' ? statusDot('bad', 'Draft failed') : i.status === 'handled' ? statusDot('off', 'Team only') : statusDot('warn', 'Waiting') },
      ],
      action: i.status === 'draft' || i.status === 'error' ? h('span', { style: { display: 'inline-flex', gap: '8px', flexWrap: 'wrap' } },
        canSkip(i, d) ? button('Do not send', { ghost: true, onclick: () => skipSheet(i, ctx, d, () => draw(el, d, ctx)) }) : null,
        button('Review', { href: legacyUrl(i.kind === 'brief' ? 'brief' : 'reports', i.act_id), icon: 'arrow' })) : null,
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
    return { items, can_skip: r.can_skip === true };
  },
  render: draw,
  skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:150px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>'; },
};
