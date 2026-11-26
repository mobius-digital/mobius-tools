/* My day. One person's list: Needs you today, This week, Waiting on someone else; one button per row.
   Right column: today's meetings and what is done.
   Live data: GET /api/mywork (account-health, the same list old Locus "My work" reads) and GET /api/requests?act=all.
   What those two cannot fill yet (meetings, times on done rows, the assistant's line) comes only from the fixture. */

import { put } from '../../kit.js';
import { h, button, takeaway, kpis, kpi, statusDot, segmented, toast, sheet, field, em } from '../../kit.js';
import { OLD_LOCUS, APP_NAME } from '../../config.js';
import { css, face, ic, heading, store } from './_ui.js';
import { lineButtons, css as gsCss } from '../get-started/_ui.js';

let brandPick = 'all';     // the brand filter survives a refresh behind

/* ---------- live answers into the page's shape ---------- */
const DAY = 864e5;
const at = ymd => Date.parse(ymd + 'T12:00:00Z');
const wd = ymd => new Date(at(ymd)).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';

function dueOf(it, today) {
  if (it.bucket === 'late' && it.due) { const n = Math.max(1, Math.round((at(today) - at(it.due)) / DAY)); return { due: n + (n === 1 ? ' day late' : ' days late'), late: true }; }
  if (it.bucket === 'today') return { due: 'Today' };
  return { due: it.due ? wd(it.due) : 'This week' };
}
function whyOf(it) {
  if (it.source === 'onboard') return ['New client setup', it.when].filter(Boolean).join(', ');
  if (it.source === 'slack') return [it.from ? it.from + ' asked in Slack' : 'You were tagged in Slack', it.when].filter(Boolean).join(', ');
  if (it.source === 'card') return ['Card ' + (it.num || '').trim(), cap(it.column) + ' column'].filter(s => s.trim() && s !== 'Card').join(', ');
  if (it.source === 'call') return it.changes ? 'Changes asked on the Monday call' : (it.from || 'Plan') + ', approved on the Monday call';
  return it.from || 'Your task';
}
function btnOf(it) {
  if (it.source === 'onboard') return { onboard: true };
  if (it.source === 'slack') return { label: 'Reply', href: it.link, out: true };
  if (it.source === 'card') return { label: 'Open card', href: it.link, out: true };
  if (it.source === 'call') return { label: 'Open the plan', href: OLD_LOCUS + '?open=calls&call=monday' };
  return it.link ? { label: 'Open', href: it.link, out: true } : { label: 'Mark done', done: true };
}
const rowOf = (it, today) => ({ id: it.id, ref: it.ref || null, source: it.source, text: it.text, why: whyOf(it), brand: it.brand || '', ...dueOf(it, today), btn: btnOf(it),
  ...(it.source === 'onboard' ? { onboard: it.onboard, slug: it.slug, act_id: it.act_id, link: it.link, detail: it.detail || '' } : {}) });

/** mywork + requests, as the page's shape (the same shape as _sample/index.json). */
export function fromLive(mw, rq, me) {
  const today = mw.today;
  const open = (mw.items || []).filter(i => !i.done);
  const ago = iso => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / DAY));
  const reqs = rq && Array.isArray(rq.items) ? rq.items : null;
  const sitsClient = (reqs || []).filter(r => (r.kind === 'approval' || r.kind === 'ask') && r.status === 'open');
  const sitsTeam = (reqs || []).filter(r => (r.kind === 'request' && r.status === 'open') || (r.kind === 'approval' && r.status === 'changes'));
  const oldest = sitsTeam.slice().sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0];
  return {
    today,
    person: { name: (mw.person && mw.person.name) || (me && me.name) || '', role: (mw.person && mw.person.role) || '', email: me && me.email, photo: me && me.photo },
    take: null,
    clients_waiting: reqs ? { n: sitsTeam.length, sub: oldest ? `${oldest.by || oldest.brand}, ${ago(oldest.created_at) ? ago(oldest.created_at) + ' days' : 'today'}` : 'no one is waiting' } : null,
    today_rows: open.filter(i => i.bucket === 'late' || i.bucket === 'today').sort((a, b) => (a.bucket === 'late' ? 0 : 1) - (b.bucket === 'late' ? 0 : 1)).map(i => rowOf(i, today)),
    week_rows: open.filter(i => i.bucket === 'week').map(i => rowOf(i, today)),
    waiting_rows: reqs ? sitsClient.map(r => { const n = ago(r.created_at); return { id: 'req:' + r.id, source: 'request', text: r.title, who: 'Client', why: 'Sits with the client', brand: r.brand || '', due: n ? n + (n === 1 ? ' day' : ' days') : 'Today', days: n,
      btn: { label: 'Open request', href: OLD_LOCUS + '?open=requests&act=' + encodeURIComponent(r.act_id || 'all') } }; }) : null,
    meetings: null, meeting_btn: null,
    done_title: 'Ticked off',
    done: (mw.items || []).filter(i => i.done).slice(0, 8).map(i => ({ text: i.text, at: i.brand || '' })),
  };
}

/* ---------- the page ---------- */
const hrefOf = (b, ctx) => b.href || (b.line ? ctx.href(b.line, b.tab) : null);
const greet = () => { const hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; };
const eyebrow = ymd => 'My day, ' + new Date(at(ymd)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '');
const say = parts => (parts || []).map(p => typeof p === 'string' ? p : h('b', null, p.b));

function row(r, ctx, { primary, onDone }) {
  const b = r.btn || {};
  /* a new client setup line (source onboard): its own button (Remind them, Done, Yes / No, Send it anyway) and Open */
  if (b.onboard) {
    gsCss();
    return h('div', { class: 'lx-md-row', dataset: { id: r.id } },
      h('div', { class: 'what' }, h('b', null, r.text), h('span', { class: 'why' }, h('span', null, r.detail || r.why))),
      h('span', { class: 'brand' }, r.brand), h('span', { class: 'due' + (r.late ? ' late' : '') }, r.due),
      h('span', { class: 'go gs-acts' }, lineButtons(ctx, r, { primary, onDone: (line, what) => {
        /* a remind keeps the line (it comes back after the next day band); a tick, a yes or no and a release finish it */
        if (what !== 'remind' && what !== 'Remind them') onDone(r, null, true);
      } })));
  }
  const go = b.done ? button(b.label, { primary, onclick: e => onDone(r, e.currentTarget) })
    : b.nudge ? button(b.label, { onclick: () => toast(ctx.sample ? 'Sample numbers: no nudge was sent.' : 'Nudges come with the notifications release.') })
    : button(b.label || 'Open', { primary, icon: primary ? 'arrow' : null, href: hrefOf(b, ctx) || '#', target: b.out ? '_blank' : null });
  return h('div', { class: 'lx-md-row', dataset: { id: r.id } },
    h('div', { class: 'what' }, h('b', null, r.text), h('span', { class: 'why' }, r.who && face({ name: r.who }, 22), h('span', null, r.why))),
    h('span', { class: 'brand' }, r.brand), h('span', { class: 'due' + (r.late ? ' late' : '') }, r.due), h('span', { class: 'go' }, go));
}

function group(title, rows, ctx, opts, emptyText) {
  return h('section', { class: 'lx-md-grp' }, heading(title, rows ? rows.length : null),
    rows == null ? h('p', { class: 'lx-md-none' }, 'Not connected yet. Open requests and cards waiting on others will list here.')
      : rows.length ? rows.map((r, i) => row(r, ctx, { ...opts, primary: !!opts.lead && i === 0 }))
      : h('p', { class: 'lx-md-none' }, emptyText));
}

function draw(el, data, ctx) {
  css();
  const d = data || {};
  const person = d.person && d.person.name ? d.person : { name: (ctx.me && ctx.me.name) || '', email: ctx.me && ctx.me.email };
  const T = d.today_rows || [], W = d.week_rows || [], X = d.waiting_rows;
  const lateN = T.filter(r => r.late).length;
  const oldest = X && X.length ? Math.max(...X.map(r => r.days || 0)) : 0;
  const outKey = 'lx5_out_' + (d.today || '');
  const isOut = !ctx.sample && store.get(outKey, false);

  /* the greeting is the page title (drawn by the shell). The hero: who, the actions, four counts */
  ctx.setTitle([(d.greeting || greet()) + (person.name ? ', ' : ''), person.name ? em(person.name + '.') : null], { eyebrow: d.today ? eyebrow(d.today) : 'My day' });
  const outBtn = button(isOut ? "You're out today" : "I'm out today", { ghost: true, onclick: () => {
    if (ctx.sample) return toast('Sample numbers: nothing is saved.');
    const next = !store.get(outKey, false); store.set(outKey, next);
    outBtn.firstChild.textContent = next ? "You're out today" : "I'm out today";
    toast(next ? 'Marked out today on this device. Telling the team comes with the notifications release.' : 'You are back in.');
  } });
  const hero = h('section', { class: 'lx-hero line lx-md-hero' },
    h('div', { class: 'lx-hero-h' }, face(person, 76, true),
      h('span', { class: 'lx-sp' }),
      h('div', { class: 'lx-md-acts' }, outBtn, h('button', { class: 'lx-btn', type: 'button', onclick: () => addTask(el, d, ctx) }, ic('plus'), 'Task'))),
    kpis([
      kpi({ label: 'Need you today', value: String(T.length), size: 'lg', sub: lateN ? statusDot('bad', lateN + (lateN === 1 ? ' is late' : ' are late')) : T.length ? 'none late' : 'all clear' }),
      kpi({ label: 'Clients waiting', value: d.clients_waiting ? String(d.clients_waiting.n) : 'not connected', size: d.clients_waiting ? 'lg' : null, sub: d.clients_waiting ? d.clients_waiting.sub : 'Requests did not answer' }),
      kpi({ label: 'Due this week', value: String(W.length), size: 'lg', sub: W.length ? 'next one ' + W[0].due : 'nothing else this week' }),
      kpi({ label: 'Waiting on someone else', value: X ? String(X.length) : 'not connected', size: X ? 'lg' : null, sub: X && X.length ? statusDot(oldest >= 7 ? 'warn' : '', 'oldest ' + oldest + (oldest === 1 ? ' day' : ' days')) : X ? 'nothing is stuck' : '' }),
    ], { cols: 4 }));

  /* the lists, filtered by brand */
  const brands = [...new Set([...T, ...W, ...(X || [])].map(r => r.brand).filter(Boolean))];
  if (brandPick !== 'all' && !brands.includes(brandPick)) brandPick = 'all';
  const lists = h('div', { class: 'lx-md-main' });
  const onDone = async (r, btn, gone) => {
    if (gone) {               // an onboarding line answered by its own button: off the list here, the server drops it on the next read
      for (const k of ['today_rows', 'week_rows']) d[k] = (d[k] || []).filter(x => x.id !== r.id);
      (d.done = d.done || []).unshift({ text: r.text, at: 'just now' });
      return draw(el, d, ctx);
    }
    if (ctx.sample) return toast('Sample numbers: nothing is saved.');
    btn.disabled = true;
    try {
      await ctx.api('/api/actions/done', { worker: 'ah', method: 'POST', body: { id: r.ref, done: true } });
      for (const k of ['today_rows', 'week_rows']) d[k] = (d[k] || []).filter(x => x.id !== r.id);
      (d.done = d.done || []).unshift({ text: r.text, at: 'just now' });
      draw(el, d, ctx); toast('Done.');
    } catch (e) { btn.disabled = false; toast('Could not mark it done: ' + e.message, { tone: 'bad', ms: 5000 }); }
  };
  const paintLists = () => {
    const f = rows => rows && (brandPick === 'all' ? rows : rows.filter(r => r.brand === brandPick));
    put(lists, 
      h('div', { class: 'lx-md-bar' },
        brands.length > 1 ? segmented([{ id: 'all', label: 'All brands' }, ...brands.map(b => ({ id: b, label: b }))], brandPick, id => { brandPick = id; paintLists(); }) : null),
      group('Needs you today', f(T), ctx, { lead: true, onDone }, 'Nothing needs you today.'),
      group('This week', f(W), ctx, { onDone }, 'Nothing else is due this week.'),
      group('Waiting on someone else', f(X), ctx, { onDone }, 'Nothing is waiting on anyone.'));
  };
  paintLists();

  /* right column */
  const M = d.meetings, mb = d.meeting_btn;
  const meet = h('section', { class: 'lx-band lx-md-band' }, heading("Today's meetings", M ? M.length : null),
    M == null ? h('p', { class: 'lx-md-quiet' }, 'No calendar connected. Your meetings will list here once one is.')
      : M.length ? M.map(m => h('div', { class: 'lx-md-meet' },
          h('span', { class: 'lx-date' + (m.now ? ' now' : '') }, h('span', null, h('b', null, m.time), h('small', null, m.ap))),
          h('span', null, h('b', { class: 't' }, m.title), h('span', { class: 'lx-md-sub' }, m.sub))))
      : h('p', { class: 'lx-md-quiet' }, 'No meetings today.'),
    mb ? button(mb.label, { href: hrefOf(mb, ctx) || '#', class: 'wide' }) : null);
  const D = d.done || [];
  const done = h('section', { class: 'lx-md-doneb' }, heading(d.done_title || 'Done today', D.length),
    D.length ? D.map(x => h('div', { class: 'lx-md-done' }, ic('check'), h('span', null, x.text, x.at && h('span', { class: 'lx-md-sub' }, x.at))))
      : h('p', { class: 'lx-md-quiet' }, 'Nothing ticked off yet.'));

  const t = d.take;
  put(el, hero,
    t ? takeaway(say(t.say), { action: t.action ? button(t.action.label, { href: hrefOf(t.action, ctx) || '#' }) : null }) : '',
    h('div', { class: 'lx-md-cols' }, lists, h('aside', { class: 'lx-md-side' }, meet, done)));
}

/* "+ Task": one line, due today, owned by you (the same write old Locus My work makes). */
function addTask(el, d, ctx) {
  const f = field({ label: 'What needs doing?', placeholder: 'Send the recut brief', maxlength: 200 });
  const add = button('Add to today', { primary: true, onclick: async () => {
    const text = f.input.value.trim();
    if (!text) return f.input.focus();
    if (ctx.sample) { s.close(); return toast('Sample numbers: nothing is saved.'); }
    add.disabled = true;
    try {
      const r = await ctx.api('/api/actions', { worker: 'ah', method: 'POST', body: { text, owner: d.person && d.person.name, due: d.today, act: ctx.brand ? ctx.brand.id : '', kind: 'team', source: 'manual' } });
      const id = (r && (r.id || (r.action && r.action.id))) || null;
      (d.today_rows = d.today_rows || []).push({ id: 'task:' + (id || Date.now()), ref: id, source: 'task', text, why: 'Added in ' + APP_NAME, brand: ctx.brand ? ctx.brand.name : 'Agency', due: 'Today', btn: id ? { label: 'Mark done', done: true } : { label: 'Open', href: OLD_LOCUS + '?open=mywork' } });
      s.close(); draw(el, d, ctx); toast('Added to today.');
    } catch (e) { add.disabled = false; toast('Could not add it: ' + e.message, { tone: 'bad', ms: 5000 }); }
  } });
  const s = sheet({ title: 'Add a task', side: 'center', body: h('div', { class: 'lx-md-form' }, f, add) });
  f.input.addEventListener('keydown', e => { if (e.key === 'Enter') add.click(); });
  setTimeout(() => f.input.focus(), 30);
}

export default {
  title: 'My day',
  ranges: false,          /* today and this week: there are no dates to pick */
  async load(ctx) {
    const [mw, rq] = await Promise.all([
      ctx.api('/api/mywork', { worker: 'ah', signal: ctx.signal }),
      ctx.api('/api/requests?act=all', { worker: 'ah', signal: ctx.signal }).catch(() => null),   // the list still draws without it
    ]);
    return fromLive(mw, rq, ctx.me);
  },
  render: draw,
  skeleton(el) {
    el.innerHTML = '<div class="lx-skel chart" style="height:230px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>';
  },
};
