/* My day. One person's list: Needs you today, This week, Waiting on someone else; one button per row.
   Right column: today's meetings and what is done.
   Live data: GET /api/mywork (account-health, the same list old Locus "My work" reads) and GET /api/requests?act=all.
   What those two cannot fill yet (meetings, times on done rows, the assistant's line) comes only from the fixture.
   Waiting across the agency (team only): what needs any person today on every brand, the same list the bell shows
   (loadWaiting in bell.js: ad calls, client updates to send, the War Room check-in, creative to review or load,
   client requests). It is read after the page draws, so a slow read never holds the page; a source that fails is named.
   Today's plan (2026-11-26, a10, _plan.js): GET /api/mywork/plans; for someone on the daily check-in list the plan
   box and "I'm out today" write the check-in itself (POST /api/mywork/plan), and the "no plan yet" line opens the box. */

import { put } from '../../kit.js';
import { h, button, takeaway, tiles, kpi, statusDot, segmented, toast, sheet, field, em } from '../../kit.js';
import { OLD_LOCUS, APP_NAME } from '../../config.js';
import { css, face, ic, heading, store } from './_ui.js';
import { lineButtons, css as gsCss } from '../get-started/_ui.js';
import { loadWaiting, primeRead, LINE_SOURCES } from '../../bell.js';
import { agencyRows, liveNote, liveHelp, brandWord } from './_waiting.js';
import { pageHelp } from '../../defs.js';
import { planBand, openPlan, postOut, mine } from './_plan.js';

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
  /* a move line (movelines.js) says what is waiting in its own detail line */
  if (LINE_SOURCES.includes(it.source)) return it.detail || it.from || '';
  if (it.source === 'onboard') return ['New client setup', it.when].filter(Boolean).join(', ');
  if (it.source === 'slack') return [it.from ? it.from + ' asked in Slack' : 'You were tagged in Slack', it.when].filter(Boolean).join(', ');
  if (it.source === 'card') return ['Card ' + (it.num || '').trim(), cap(it.column) + ' column'].filter(s => s.trim() && s !== 'Card').join(', ');
  if (it.source === 'call') return it.changes ? 'Changes asked on the Monday call' : (it.from || 'Plan') + ', approved on the Monday call';
  return it.from || 'Your task';
}
function btnOf(it) {
  if (it.source === 'onboard') return { onboard: true };
  /* the "no plan yet" line opens the plan box here (the Slack link stays on the line for the old My work page) */
  if (it.source === 'checkin') return { label: it.btn_label || 'Post my plan', plan: true };
  /* a move line: a page in this app (v5), else its own link (Slack, a card in old Locus) in a new tab */
  if (it.v5) return { label: it.btn_label || 'Open', href: it.v5 };
  if (LINE_SOURCES.includes(it.source) && it.link) return { label: it.btn_label || 'Open', href: it.link, out: true };
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
    /* a top line (the "no plan yet" nudge) first, then late, then today */
    today_rows: open.filter(i => i.bucket === 'late' || i.bucket === 'today').sort((a, b) => (a.top ? 0 : a.bucket === 'late' ? 1 : 2) - (b.top ? 0 : b.bucket === 'late' ? 1 : 2)).map(i => rowOf(i, today)),
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
    /* Every setup line can be ticked off like any other row (PUT /api/mywork/done with its onb: key), so a line with
       no action of its own (budget, a check, a key to make, a goal) never sits on the list for good. */
    const tick = button('Mark done', { ghost: true, aria: 'Mark this line done', onclick: async e => {
      if (ctx.sample) return toast('Sample numbers: nothing is saved.');
      const btn = e.currentTarget; btn.disabled = true;
      try { await ctx.api('/api/mywork/done', { worker: 'ah', method: 'PUT', body: { key: r.id, done: true } }); onDone(r, null, true); toast('Done.'); }
      catch (err) { btn.disabled = false; toast('Could not mark it done: ' + err.message, { tone: 'bad', ms: 5000 }); }
    } });
    const acts = lineButtons(ctx, r, { primary, onDone: (line, what) => {
      /* a remind keeps the line (it comes back after the next day band); a tick, a yes or no and a release finish it */
      if (what !== 'remind' && what !== 'Remind them') onDone(r, null, true);
    } });
    /* one button at the right edge like every other row; Open and Mark done as small links under it.
       A line whose own action is already Done never shows a second Done. */
    const ownDone = acts.some(b => /^Done$/.test(b.textContent.trim()));
    const [main, ...rest] = acts;
    const links = [...rest, ownDone ? null : tick].filter(Boolean);
    links.forEach(b => { b.classList.remove('primary'); b.classList.add('lx-md-link'); });
    return h('div', { class: 'lx-md-row', dataset: { id: r.id } },
      h('div', { class: 'what' }, h('b', null, r.text), h('span', { class: 'why' }, h('span', null, r.detail || r.why))),
      h('span', { class: 'brand' }, brandWord(r.brand)), h('span', { class: 'due' + (r.late ? ' late' : '') }, r.due),
      h('span', { class: 'go lx-md-go2' }, main || null, links.length ? h('span', { class: 'lx-md-more' }, links) : null));
  }
  const go = b.plan ? button(b.label, { primary, onclick: () => onDone(r, null, false, 'plan') })
    : b.done ? button(b.label, { primary, onclick: e => onDone(r, e.currentTarget) })
    : b.nudge ? button(b.label, { onclick: () => toast(ctx.sample ? 'Sample numbers: no nudge was sent.' : 'Nudges come with the notifications release.') })
    : button(b.label || 'Open', { primary, icon: primary ? 'arrow' : null, href: hrefOf(b, ctx) || '#', target: b.out ? '_blank' : null });
  return h('div', { class: 'lx-md-row', dataset: { id: r.id } },
    h('div', { class: 'what' }, h('b', null, r.text), h('span', { class: 'why' }, r.kind ? h('span', { class: 'lx-md-k' }, r.kind) : null, r.who && face({ name: r.who }, 22), r.why ? h('span', null, r.why) : null)),
    h('span', { class: 'brand' }, brandWord(r.brand)), h('span', { class: 'due' + (r.late ? ' late' : '') }, r.due), h('span', { class: 'go' + (primary ? ' main' : '') }, go));
}

function group(title, rows, ctx, opts, emptyText) {
  return h('section', { class: 'lx-card lx-md-grp' }, heading(title, rows ? rows.length : null),
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
  const meRow = mine(d.checkin);
  const isOut = !ctx.sample && (meRow ? meRow.state === 'out' : store.get(outKey, false));

  /* the greeting is the page title (drawn by the shell). The hero: who, the actions, four counts */
  ctx.setTitle([(d.greeting || greet()) + (person.name ? ', ' : ''), person.name ? em(person.name + '.') : null], { eyebrow: d.today ? eyebrow(d.today) : 'My day' });
  const outBtn = button(isOut ? "You're out today" : "I'm out today", { ghost: true, onclick: () => {
    if (ctx.sample) return toast('Sample numbers: nothing is saved.');
    /* on the daily check-in list: the real "out today" on the check-in, after a yes. Posting a plan takes it back. */
    if (meRow) { if (meRow.state === 'out') return toast('You are marked out today. Post your plan if you are working after all.'); return postOut(ctx, row => { if (row) Object.assign(meRow, row); draw(el, d, ctx); }); }
    const next = !store.get(outKey, false); store.set(outKey, next);
    outBtn.firstChild.textContent = next ? "You're out today" : "I'm out today";
    toast(next ? 'Marked out today on this device. Telling the team comes with the notifications release.' : 'You are back in.');
  } });
  /* the greeting already names the person: no avatar here. The two actions sit in the bar above the counts. */
  const bar = h('div', { class: 'lx-md-top' },
    pageHelp({ body: [
      { title: 'What it is for', text: 'Your own list for today: what needs you today, what is due this week, and what waits on someone else. One button per row opens the place where it is done.' },
      ctx.isClient || ctx.role === 'client' ? null : { title: 'Waiting across the agency', text: 'What needs any person on the team today, on every brand: the same rows the bell shows.' },
      ctx.isClient || ctx.role === 'client' ? null : liveHelp(),
    ] }),
    h('span', { class: 'lx-sp' }),
    h('div', { class: 'lx-md-acts' }, outBtn, h('button', { class: 'lx-btn', type: 'button', onclick: () => addTask(el, d, ctx) }, ic('plus'), 'Task')));
  const hero = h('div', { class: 'lx-md-hero' },
    tiles([
      kpi({ label: 'Needs you today', value: String(T.length), sub: lateN ? statusDot('bad', lateN + (lateN === 1 ? ' is late' : ' are late')) : T.length ? 'none late' : 'all clear' }),
      kpi({ label: 'Clients waiting', value: d.clients_waiting ? String(d.clients_waiting.n) : 'not connected', sub: d.clients_waiting ? d.clients_waiting.sub : 'Requests did not answer' }),
      kpi({ label: 'Due this week', value: String(W.length), sub: W.length ? 'next one ' + W[0].due : 'nothing else this week' }),
      kpi({ label: 'Waiting on someone else', value: X ? String(X.length) : 'not connected', sub: X && X.length ? statusDot(oldest >= 7 ? 'warn' : '', 'oldest ' + oldest + (oldest === 1 ? ' day' : ' days')) : X ? 'nothing is stuck' : '' }),
    ], { cols: 4 }));

  /* the lists, filtered by brand */
  const team = !ctx.isClient && ctx.role !== 'client';
  const lists = h('div', { class: 'lx-md-main' });
  const onDone = async (r, btn, gone, what) => {
    if (what === 'plan') return openPlan(ctx, meRow, row => {
      if (row && meRow) Object.assign(meRow, row);
      for (const k of ['today_rows', 'week_rows']) d[k] = (d[k] || []).filter(x => x.source !== 'checkin');
      draw(el, d, ctx);
    });
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
    const A = d.agency ? d.agency.rows : null;
    const brands = [...new Set([...T, ...W, ...(X || []), ...(A || [])].map(r => r.brand).filter(Boolean))];
    if (brandPick !== 'all' && !brands.includes(brandPick)) brandPick = 'all';
    const f = rows => rows && (brandPick === 'all' ? rows : rows.filter(r => r.brand === brandPick));
    const opts = [{ id: 'all', label: 'All brands' }, ...brands.map(b => ({ id: b, label: brandWord(b) }))];
    const pickEl = brands.length > 4
      ? h('label', { class: 'lx-md-pick' }, h('span', null, 'Brand'), h('select', { class: 'lx-input', 'aria-label': 'Show one brand', onchange: e => { brandPick = e.target.value; paintLists(); } },
          opts.map(o => h('option', { value: o.id, selected: o.id === brandPick || null }, o.label))))
      : brands.length > 1 ? segmented(opts, brandPick, id => { brandPick = id; paintLists(); }) : null;
    put(lists,
      h('div', { class: 'lx-md-bar' }, pickEl),
      planBand(ctx, d.checkin, () => draw(el, d, ctx), T.some(r => r.source === 'checkin')),
      group('Needs you today', f(T), ctx, { lead: true, onDone }, 'Nothing needs you today.'),
      team ? agencyGroup(d.agency, f, ctx) : null,
      group('This week', f(W), ctx, { onDone }, 'Nothing else is due this week.'),
      group('Waiting on someone else', f(X), ctx, { onDone }, 'Nothing is waiting on anyone.'));
  };
  paintLists();
  /* the agency list, read after the page is up (kept 5 minutes by bell.js, so a redraw does not read again) */
  if (team && !d.agency) {
    d.agency = { rows: null, failed: [] };
    loadWaiting({ brands: ctx.brands, role: ctx.role }).then(w => {
      d.agency = { rows: agencyRows(w), failed: w.failed || [] };
      if (lists.isConnected) paintLists();
    });
  }

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
  const done = h('section', { class: 'lx-card lx-md-doneb' }, heading(d.done_title || 'Done today', D.length),
    D.length ? D.map(x => h('div', { class: 'lx-md-done' }, ic('check'), h('span', null, x.text, x.at && h('span', { class: 'lx-md-sub' }, x.at))))
      : h('p', { class: 'lx-md-quiet' }, 'Nothing ticked off yet.'));

  const t = d.take;
  ctx.askContext = 'My day for ' + (person.name || 'this person') + ': ' + T.length + ' need them today (' + lateN + ' late), ' + W.length + ' due this week, ' + (X ? X.length : 0) + ' waiting on someone else' + (d.clients_waiting ? ', ' + d.clients_waiting.n + ' clients waiting' : '') + '.' + (T[0] ? ' First: ' + T[0].text + '.' : '');
  put(el, bar, hero,
    team ? liveNote(ctx) : null,
    t ? takeaway(say(t.say), { action: t.action ? button(t.action.label, { href: hrefOf(t.action, ctx) || '#' }) : null }) : '',
    h('div', { class: 'lx-md-cols' }, lists, h('aside', { class: 'lx-md-side' }, meet, done)));
}

/* Waiting across the agency: the same rows the bell shows, each with one button to the page where it is done. */
function agencyGroup(a, f, ctx) {
  const rows = a && a.rows;
  const note = a && a.failed && a.failed.length ? 'Could not read: ' + a.failed.join(', ') : null;
  return h('section', { class: 'lx-card lx-md-grp' }, heading('Waiting across the agency', rows ? rows.length : null, note || 'every brand, the same rows as the bell'),
    rows == null ? h('p', { class: 'lx-md-none' }, 'Reading every brand.')
      : f(rows).length ? f(rows).map(r => row(r, ctx, { primary: false, onDone: () => {} }))
      : h('p', { class: 'lx-md-none' }, note ? 'Nothing found in what could be read.' : 'Nothing is waiting on the team.'));
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
    const [mw, rq, ci] = await Promise.all([
      ctx.api('/api/mywork', { worker: 'ah', signal: ctx.signal }),
      ctx.api('/api/requests?act=all', { worker: 'ah', signal: ctx.signal }).catch(() => null),   // the list still draws without it
      ctx.api('/api/mywork/plans', { worker: 'ah', signal: ctx.signal }).catch(() => null),        // today's check-in (a10)
    ]);
    primeRead('/api/requests?act=all', rq);       // the agency list reads the same route: hand it over, not twice
    return { ...fromLive(mw, rq, ctx.me), checkin: ci };
  },
  render: draw,
  skeleton(el) {
    el.innerHTML = '<div class="lx-skel chart" style="height:230px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>';
  },
};

import { addStyles } from '../../kit.js';
addStyles('lx-md-page-css', `
.lx-md-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:var(--sp-4)}
.lx-md-go2{flex-direction:column;align-items:flex-end;gap:4px}
.lx-md-more{display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap}
.lx-md-row .go .lx-btn.lx-md-link{height:auto;padding:0;border:0;background:none;box-shadow:none;font-size:12.5px;font-weight:500;color:var(--muted)}
.lx-md-row .go .lx-btn.lx-md-link:hover{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
/* the lists sit in cards (batch 1 look): card title size, warm gray row hover */
.lx-md-main{gap:var(--gap-5,24px)}
.lx-card.lx-md-grp .lx-md-h h2,.lx-card.lx-md-doneb .lx-md-h h2,.lx-md-band .lx-md-h h2{font-size:var(--fs-card,14px);letter-spacing:-.01em}
.lx-card.lx-md-grp .lx-md-h .note{margin-left:0;color:var(--muted);font-size:var(--fs-small,12.5px)}
.lx-card.lx-md-grp .lx-md-row{position:relative}
.lx-card.lx-md-grp .lx-md-row:hover{background:var(--row-hover);box-shadow:-12px 0 0 var(--row-hover),12px 0 0 var(--row-hover)}
.lx-card.lx-md-doneb{padding:18px 22px}
.lx-md-done:first-of-type{padding-top:4px}
.lx-md-hero{margin-bottom:0}
.lx-md-pick{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
.lx-md-pick select{height:34px;width:auto;min-width:200px;font-size:13.5px}
@media (max-width:759px){
  .lx-card.lx-md-grp .lx-md-h .note{display:none}
  .lx-card.lx-md-grp .lx-md-row:hover{box-shadow:none}
  .lx-md-go2{align-items:stretch}
  .lx-md-more{justify-content:flex-start}
  .lx-md-row .go .lx-btn.lx-md-link{width:auto;height:auto}
}`);
