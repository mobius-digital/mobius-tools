/* Requests: one list of everything between the team and the client. Approvals we sent, things we asked them for,
   and things they asked us for, with the thread under each one. A client signed in answers an open approval here in
   one tap: Approve, or Ask for changes with a note (account-health POST /api/requests/decide { act, id, decision, note }).
   Replying and the team's own actions stay in old Locus (ctx.legacy) until this page gets those buttons.
   Live data: GET /api/requests?act=<brand id | all> (account-health). A client can read it for their own brand. */

import { APP_NAME } from '../../config.js';
import { put, safeHref } from '../../kit.js';
import { h, tiles, kpi, statusDot, pill, button, segmented, sheet, em, empty, toast, addStyles } from '../../kit.js';
import { fixture } from '../../data.js';
import { css, short, dayOf, away, between, todayYmd, heading, row, list, box, sortRows, flipSort, brandTag, colorOf, helpBar, searchBox, selectBox, filterNote } from '../calendar/_cr.js';

const RQ_CSS = `.rq-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.rq-facts{margin:0;font-size:13px;color:var(--muted)}
.rq-ads{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin}
.rq-ad{flex:none;position:relative;width:96px;aspect-ratio:4/5;border-radius:12px;overflow:hidden;background:linear-gradient(160deg,var(--bg-sunk),var(--line-strong));display:grid;place-items:center;font-size:12px;font-weight:600;color:var(--muted)}
.rq-ad img{width:100%;height:100%;object-fit:cover;display:block}
.rq-ad .ok{position:absolute;left:6px;bottom:6px;padding:1px 7px;border-radius:999px;background:rgba(255,255,255,.92);font-size:11px;font-weight:600;color:var(--good)}
.rq-ad .ok.no{color:var(--muted)}
.rq-chat{display:grid;gap:10px}
.rq-msg{max-width:80%;justify-self:start;display:grid;gap:3px}
.rq-msg .b{padding:10px 14px;border-radius:16px 16px 16px 4px;background:var(--bg-sunk);font-size:14px;line-height:1.45;overflow-wrap:anywhere;white-space:pre-line}
.rq-msg small{font-size:11.5px;color:var(--muted);padding:0 4px}
.rq-msg.team{justify-self:end;text-align:right}
.rq-msg.team .b{border-radius:16px 16px 4px 16px;background:var(--ink);color:#fff;text-align:left}
.rq-old{font-size:13px;color:var(--muted)}`;
const safeImg = u => typeof u === 'string' && /^(https:\/\/|data:image\/)/i.test(u) ? u : null;

/* who asked, from the reader's side: a client reads "You asked" on their own request */
const KIND_TEAM = { approval: 'For approval', ask: 'We asked', request: 'They asked' };
const KIND_CLIENT = { approval: 'For approval', ask: 'The team asked', request: 'You asked' };
let KIND = KIND_TEAM;
const WHAT = { studio: 'Ads', link: 'Link or file', offer: 'Offer', date: 'Calendar date' };
const view = { filter: 'open', q: '', brand: '', sort: null };

/** Who the item waits on, from the team's side or the client's. */
function waitsOn(it) {
  if (it.status === 'done' || it.status === 'approved') return 'done';
  if (it.kind === 'request' && it.status === 'open') return 'us';
  if (it.kind === 'approval' && it.status === 'changes') return 'us';
  return 'client';
}
function statusOf(it, client) {
  const w = waitsOn(it);
  if (it.status === 'approved') return statusDot('good', 'Approved');
  if (w === 'done') return statusDot('good', 'Done');
  if (it.status === 'changes') return statusDot('bad', 'Changes asked');
  if (w === 'us') return statusDot('warn', client ? 'With the team' : 'Waiting for us');
  return statusDot('warn', client ? 'Waiting for you' : 'Waiting for the client');
}
const lastAt = it => (it.thread && it.thread.length ? it.thread[it.thread.length - 1].at : null) || it.updated_at || it.created_at;

/** Approve or Ask for changes, for a client on an open approval. Returns the buttons, or null. */
function answerButtons(it, ctx, close, redraw) {
  const real = ctx.isClient && (ctx.sample || !ctx.asClient);
  if (!real || it.kind !== 'approval' || it.status !== 'open') return null;
  const note = h('textarea', { class: 'lx-input', rows: 4, placeholder: 'What would you like changed?', 'aria-label': 'What would you like changed', hidden: true });
  let asking = false;
  const save = async (decision, text) => {
    yes.disabled = ch.disabled = true;
    try {
      if (ctx.sample) toast('Sample: nothing saved');
      else {
        await ctx.api('/api/requests/decide', { worker: 'ah', method: 'POST', body: { act: it.act_id || (ctx.brand && ctx.brand.id), id: it.id, decision, ...(text ? { note: text } : {}) } });
        toast(decision === 'approved' ? 'Approved' : 'Sent to the team');
      }
      const patch = { status: decision, decided_at: new Date().toISOString(), decided_by: 'You', ...(text ? { decision_note: text } : {}) };
      Object.assign(it, patch);
      close(); redraw(patch);
    } catch (e) {
      yes.disabled = ch.disabled = false;
      toast('Not saved: ' + ((e && e.message) || 'no answer from the server.'), { tone: 'bad', ms: 6000 });
    }
  };
  const yes = button('Approve', { primary: true, large: true, iconLeft: 'check', onclick: () => save('approved', '') });
  const ch = button('Ask for changes', { large: true, onclick: () => {
    if (!asking) { asking = true; note.hidden = false; note.focus(); ch.textContent = 'Send changes'; return; }
    const text = note.value.trim();
    if (!text) { note.focus(); return; }
    save('changes', text);
  } });
  return h('div', { class: 'cr-answer', style: { display: 'grid', gap: '10px' } }, note, h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, yes, ch));
}

function detail(it, ctx, agency, redraw) {
  addStyles('lx-rq-css', RQ_CSS);
  const thread = [{ by: it.by, role: it.by_role, text: it.body, at: it.created_at }, ...(it.thread || [])].filter(m => m.text);
  const ads = it.ads || [];
  const what = [KIND[it.kind] || 'Request', it.what ? (WHAT[it.what] || it.what).toLowerCase() : null].filter(Boolean).join(', ');
  const facts = ['Opened ' + dayOf(it.created_at) + ' by ' + (it.by || 'the team'), it.decided_at ? 'answered ' + dayOf(it.decided_at) + (it.decided_by ? ' by ' + it.decided_by : '') : null].filter(Boolean).join(', ');
  const body = h('div', { class: 'cr-sheet' },
    /* the head: the state as one pill, the brand, what it is */
    h('div', { class: 'rq-head' }, statusOf(it, ctx.isClient), agency && it.brand ? brandTag(it.brand, it.color) : null, h('span', { class: 'rq-facts' }, what)),
    h('p', { class: 'rq-facts' }, facts),
    ads.length ? h('div', null, heading('The ads', null, ads.filter(a => a.approved).length + ' of ' + ads.length + ' approved'),
      h('div', { class: 'rq-ads' }, ads.map((a, i) => h('div', { class: 'rq-ad', title: (a.name || 'Ad ' + (i + 1)) + (a.approved ? ', approved' : ', not approved yet') },
        safeImg(a.thumb || a.image) ? h('img', { src: safeImg(a.thumb || a.image), alt: a.name || 'Ad ' + (i + 1), loading: 'lazy' }) : 'Ad ' + (i + 1),
        h('span', { class: 'ok' + (a.approved ? '' : ' no') }, a.approved ? 'Approved' : 'Not yet'))))) : null,
    it.date ? h('p', { class: 'rq-facts' }, 'Date: ' + it.date.name + ', ' + short(it.date.start) + (it.date.end ? ' to ' + short(it.date.end) : '')) : null,
    safeHref(it.link) ? h('p', { class: 'rq-facts' }, h('a', { href: safeHref(it.link), target: '_blank', rel: 'noopener' }, 'Open the link')) : null,
    thread.length || it.decision_note ? h('div', null, heading('The conversation', thread.length + (it.decision_note ? 1 : 0)),
      h('div', { class: 'rq-chat' },
        thread.map(m => h('div', { class: 'rq-msg' + (m.role === 'team' ? ' team' : '') }, h('span', { class: 'b' }, m.text), h('small', null, (m.by || (m.role === 'team' ? 'The team' : 'The client')) + (m.at ? ', ' + dayOf(m.at) : '')))),
        it.decision_note ? h('div', { class: 'rq-msg' }, h('span', { class: 'b' }, it.decision_note), h('small', null, (it.decided_by || 'The client') + (it.decided_at ? ', ' + dayOf(it.decided_at) : '') + ', asking for changes')) : null)) : null,
    h('div', { class: 'cr-answer-slot' }),
    ctx.legacy ? h('a', { class: 'rq-old', href: ctx.legacy }, ctx.isClient ? 'Reply (opens the full ' + APP_NAME + ' page)' : 'Reply (opens old ' + APP_NAME + ')') : null);
  const sh = sheet({ title: it.title, body });
  const acts = answerButtons(it, ctx, () => sh.close(), redraw || (() => {}));
  const slot = body.querySelector('.cr-answer-slot');
  if (acts) slot.replaceWith(acts); else slot.remove();
}

function draw(el, d, ctx, agency) {
  KIND = ctx.isClient ? KIND_CLIENT : KIND_TEAM;
  css();
  if (!d || !Array.isArray(d.items)) return put(el, empty({ title: 'Requests did not answer', text: 'Nothing was read. Try again in a minute.' }));
  const today = todayYmd();
  const items = d.items.map(it => ({ ...it, color: agency ? colorOf(ctx, it.act_id) : null, wait: waitsOn(it) }));
  if (!items.length) {
    return put(el, empty({ title: 'No requests', text: ctx.isClient ? 'Nothing is waiting between you and the team.' : 'Nothing is open with ' + (agency ? 'any client' : 'this client') + ', and nothing closed in the last 60 days.' }));
  }
  const us = items.filter(i => i.wait === 'us'), them = items.filter(i => i.wait === 'client'), done = items.filter(i => i.wait === 'done');
  const oldest = [...us].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];

  const head = tiles([
    kpi({ label: ctx.isClient ? 'With the team' : 'Waiting for us', value: String(us.length), size: 'lg',
      sub: us.length ? statusDot(between(String(oldest.created_at).slice(0, 10), today) > 2 ? 'bad' : 'warn', 'oldest opened ' + away(today, String(oldest.created_at).slice(0, 10))) : 'nothing open' }),
    kpi({ label: ctx.isClient ? 'Waiting for you' : 'Waiting for the client', value: String(them.length), sub: them.filter(i => i.kind === 'approval').length + ' to approve' }),
    kpi({ label: 'Done in the last 60 days', value: String(done.length), sub: done.filter(i => i.status === 'approved').length + ' approved' }),
  ], { cols: 3 });

  const listBox = h('div'), noteBox = h('span');
  const redrawAll = () => draw(el, d, ctx, agency);
  const clear = () => { view.q = ''; view.brand = ''; redrawAll(); };
  const brandsIn = [...new Map(items.filter(i => i.act_id).map(i => [i.act_id, i.brand || i.act_id])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  const tools = h('div', { class: 'cr-tools' },
    segmented([{ id: 'open', label: 'Open ' + (us.length + them.length) }, { id: 'done', label: 'Done ' + done.length }, { id: 'all', label: 'All ' + items.length }], view.filter, id => { view.filter = id; redrawAll(); }),
    agency ? searchBox(view.q, v => { view.q = v; paint(); }, 'Search title, brand or person') : null,
    agency ? selectBox('Brand', [{ id: '', label: 'All brands' }, ...brandsIn.map(([id, name]) => ({ id, label: name }))], view.brand, v => { view.brand = v; paint(); }) : null,
    noteBox, h('span', { class: 'sp', style: { flex: '1' } }),
    !ctx.isClient && ctx.legacy ? button('Send for approval', { ghost: true, href: ctx.legacy, icon: 'arrow', title: 'Opens old ' + APP_NAME }) : null);
  const paint = () => {
    const q = view.q.trim().toLowerCase();
    const base = view.filter === 'open' ? [...us, ...them] : view.filter === 'done' ? done : items;
    const pick = base.filter(it => (!view.brand || it.act_id === view.brand) && (!q || [it.title, it.brand, it.by, it.body].some(t => String(t || '').toLowerCase().includes(q))));
    const on = !!(q || view.brand);
    put(noteBox, filterNote(pick.length, base.length, on, clear));
    /* the page's own order (waiting for us first, then the newest reply) until a column is picked */
    pick.sort((a, b) => (a.wait === b.wait ? 0 : a.wait === 'us' ? -1 : b.wait === 'us' ? 1 : 0) || String(lastAt(b)).localeCompare(String(lastAt(a))));
    const W = { us: 0, client: 1, done: 2 };
    const sorted = sortRows(pick, view.sort, (it, k) => k === 'title' ? it.title : k === 'brand' ? it.brand : k === 'by' ? it.by : k === 'last' ? String(lastAt(it) || '') : k === 'status' ? W[it.wait] * 10 + (it.status === 'changes' ? 0 : 1) : null);
    const rows = sorted.map(it => row({
      title: it.title,
      sub: [KIND[it.kind], it.what ? WHAT[it.what] : null, it.ads && it.ads.length ? it.ads.length + ' ads' : null, (it.thread || []).length ? it.thread.length + (it.thread.length === 1 ? ' reply' : ' replies') : null].filter(Boolean).join('. '),
      cells: [
        agency ? { w: 160, label: 'Brand', node: brandTag(it.brand, it.color) } : null,
        { w: 120, class: 'hide-sm', label: 'Opened by', node: it.by || '' },
        { w: 96, class: 'hide-md', label: 'Last reply', node: dayOf(lastAt(it)) },
        { w: 170, label: 'Status', node: statusOf(it, ctx.isClient) },
      ],
      onclick: () => detail(it, ctx, agency, patch => { Object.assign(d.items.find(x => x.id === it.id) || {}, patch); draw(el, d, ctx, agency); }),
    }));
    put(listBox, list(rows, on ? h('span', null, 'Nothing matches. ', h('button', { type: 'button', class: 'cr-clear', onclick: clear }, 'Clear the filters.')) : view.filter === 'open' ? 'Nothing open. Everything is answered.' : 'Nothing here.',
      { head: [agency ? { label: 'Brand', w: 160, sort: 'brand' } : null, { label: 'Opened by', w: 120, class: 'hide-sm', sort: 'by' }, { label: 'Last reply', w: 96, class: 'hide-md', sort: 'last' }, { label: 'Status', w: 170, sort: 'status' }],
        first: 'Request', firstSort: 'title', sort: view.sort, onSort: k => { view.sort = flipSort(view.sort, k, k === 'last' ? 'desc' : 'asc'); paint(); } }));
  };
  paint();
  put(el, helpBar(ctx.isClient ? [
    { title: 'What it is for', text: 'Everything between you and the team: ads and offers sent for your approval, things we asked you for, and things you asked us for.' },
    { title: 'Approving', text: 'Open an approval to Approve it, or Ask for changes with a note. The team sees your answer at once.' },
  ] : [
    { title: 'What it is for', text: 'Everything between the team and ' + (agency ? 'every client' : 'this client') + ': approvals we sent, things we asked them for, and things they asked us for, with the conversation under each one.' },
    { title: 'Waiting for us and for them', text: 'Waiting for us: they asked for something, or sent ads back with changes. Waiting for the client: an approval or a question we sent that they have not answered. Done lists the last 60 days.' },
    { title: 'Replying', text: 'Replies and sending something new for approval still open old ' + APP_NAME + '.' },
  ]), head, box({ title: view.filter === 'open' ? 'Open requests' : view.filter === 'done' ? 'Done in the last 60 days' : 'Every request', note: 'Tap one for the conversation' + (ctx.isClient ? ' and to answer it' : '') }, tools, listBox));
  ctx.askContext = (agency ? 'Requests between the team and every client. ' : 'Requests between the team and ' + ((ctx.brand && ctx.brand.name) || 'this client') + '. ') + us.length + ' waiting for the team, ' + them.length + ' waiting for the client, ' + done.length + ' done in the last 60 days.';
}

/** requestsPage({ agency }) : the page module for pages/requests/index.js and pages/a-requests/index.js */
export function requestsPage({ agency = false } = {}) {
  return {
    title: agency ? ['What is waiting ', em('between us and clients?')] : ['What is waiting ', em('on whom?')],
    eyebrow: 'Requests',
    ranges: false,                /* open items plus the last 60 days, set by the route */
    async load(ctx) {
      const act = agency ? 'all' : encodeURIComponent(ctx.brand.id);
      return ctx.api('/api/requests?act=' + act, { worker: 'ah', signal: ctx.signal });
    },
    async sample(ctx) {
      const all = await fixture('a-requests/_sample/index.json');
      if (agency) return all;
      const id = ctx.brand && ctx.brand.id;
      return { ...all, items: all.items.filter(i => i.act_id === id) };
    },
    render: (el, d, ctx) => draw(el, d, ctx, agency),
    skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:150px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>'; },
  };
}
