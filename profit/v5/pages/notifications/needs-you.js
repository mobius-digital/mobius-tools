/* Notifications > Needs you: what is waiting on this person, most urgent first.
   This file also holds the shared page for the three notification tabs (Watching and Done today import page() from here),
   so the three read the same rows the bell shows and draw them the same way.

   The rows come from bell.js (loadBell), so the page and the bell panel always agree:
     sample mode    pages/_sample/notifications.json (the bell's fixture), plus this tab's own file in
                    pages/notifications/_sample/ for what only the page shows (the group, the detail in the sheet, the one line on top)
     team, real     GET /api/mywork (account-health, read only). late or due today -> Needs you, this week -> Watching, ticked -> Done today.
                    The same answer is read once more from the bell's saved copy to add what the bell leaves out:
                    how many days late, the full message, where it was asked.
     client, real   GET /api/requests?act=<brand id> (account-health, read only): open approvals and questions -> Needs you,
                    open requests -> Watching, closed in the last day -> Done today.
     every mode     rows an automation left for this person (GET /api/notices, through bell.js). They carry .notice and are
                    answered in the row's sheet with the buttons from automations/_auto.js (POST /api/notices/done).
                    With automations off, or when that read fails, there are none and the page is as it was.
   Nothing here writes. A row's button is a link to the page where the thing is handled. A tap on the row opens a read-only sheet.

   Row shape (the bell's, plus the page's own fields):
     { text, brand, by, when, who, btn, group, late, days, detail, where } */

import { put, h, svgNode, avatar, button, count, kpis, kpi, hero, card, statusDot, segmented, sheet, takeaway, empty, em, addStyles } from '../../kit.js';
import { mark } from '../../icons.js';
import { APP_NAME } from '../../config.js';
import { storedClient } from '../../data.js';
import { lineOf } from '../../menu.js';
import { loadBell, readNotices, noticeRows, forgetNotices } from '../../bell.js';

/* ---------- small helpers (exported for the other two tabs) ---------- */
export const DAY = 864e5;
export const plain = t => [].concat(t || '').map(p => (p && typeof p === 'object' ? p.b : p)).join('');
export const daysWord = n => n + (n === 1 ? ' day' : ' days');
/** Meta writes "+0000"; some browsers only read "+00:00". */
export const stamp = s => Date.parse(String(s || '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
export const clock = ms => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase();
export const ymdLocal = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const noon = ymd => Date.parse(ymd + 'T12:00:00Z');
const shortDay = ymd => new Date(noon(ymd)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '');
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : '');
const ago = isoStr => { const t = Date.parse(isoStr); return t ? Math.max(0, Math.round((Date.now() - t) / DAY)) : 0; };

const KINDS = {
  needs: { key: 'needs', tab: 'needs-you', label: 'Needs you', title: () => ['What ', em('needs you?')],
    none: ['Nothing needs you', 'When something is waiting on a yes, a no or a look from you, it shows here.'] },
  watching: { key: 'watching', tab: 'watching', label: 'Watching', title: () => ['What is ', em('in flight?')],
    none: ['Nothing to watch', 'Things that are moving without you show here until they are done.'] },
  done: { key: 'done', tab: 'done-today', label: 'Done today', title: () => ['What got ', em('done today?')],
    none: ['Nothing ticked off yet today', 'What gets finished today is listed here, with who did it.'] },
};
/* what waits on the team across every brand (bell.js loadWaiting): ad calls, client updates, the War Room, creative, requests */
const AGENCY_GROUP = { id: 'agency', title: 'Waiting across the agency', note: 'Every brand, today' };
/* an alert (bell.js: kind 'alert' from GET /api/notices): money at risk or something broken. Always on top. */
const ALERT_GROUP = { id: 'alert', title: 'Urgent', note: 'Each one clears itself when it is fixed' };
const TEAM_GROUPS = {
  needs: [ALERT_GROUP, { id: 'late', title: 'Late' }, { id: 'today', title: 'Due today' }, AGENCY_GROUP],
  watching: [{ id: 'week', title: 'Coming up this week', note: 'Yours, not due yet' }],
  done: [{ id: 'you', title: 'By you' }],
};
const CLIENT_GROUPS = {
  needs: [{ id: 'main', title: 'Waiting on your answer', note: 'Oldest first' }],
  watching: [{ id: 'main', title: 'With the team', note: 'Nothing for you to do' }],
  done: [{ id: 'main', title: 'Closed in the last day' }],
};

/* ---------- loading ---------- */
/** The row the bell made, plus what the My work answer knows about the same item. */
function enrich(r, it, today) {
  if (!it) return { ...r, group: r.when === 'late' ? 'late' : 'today', late: r.when === 'late' };
  const o = { ...r, detail: it.detail && it.detail !== it.text ? it.detail : '', where: it.where || '' };
  if (it.bucket === 'late') {
    const n = it.due && today ? Math.max(1, Math.round((noon(today) - noon(it.due)) / DAY)) : 0;
    Object.assign(o, { group: 'late', late: true, days: n, when: n ? daysWord(n) + ' late' : 'late' });
  } else {
    o.group = it.bucket === 'week' ? 'week' : 'today';
    o.when = it.source === 'slack' ? (it.when || '') : it.due ? (it.due === today ? 'due today' : 'due ' + shortDay(it.due)) : (it.when || '');
  }
  return o;
}

async function loadTeam(ctx, K, more) {
  const me = ctx.me || {};
  /* the same key and the same call as bell.js, so this is one request, not two */
  const raw = ctx.cached('bell', () => ctx.api('/api/mywork' + (me.email ? '?who=' + encodeURIComponent(me.email) : ''), { worker: 'ah' }), null, { maxAge: 60e3 }).then(r => r.data, () => null);
  const [bell, mw, extra] = await Promise.all([loadBell({ me, role: ctx.role, asClient: false, brand: ctx.brand, brands: ctx.brands }), raw, more ? more(ctx) : null]);
  const byLink = new Map(((mw && mw.items) || []).filter(i => i.link).map(i => [i.link, i]));
  let rows = (bell[K.key] || []).map(r => (r.urgent ? { ...r, group: 'alert' } : r.agency ? { ...r, group: 'agency', when: '' } : enrich(r, r.btn && r.btn.href ? byLink.get(r.btn.href) : null, mw && mw.today)));
  if (K.key === 'needs') rows.sort((a, b) => (a.urgent ? 0 : 1) - (b.urgent ? 0 : 1) || (a.late ? 0 : 1) - (b.late ? 0 : 1) || (b.days || 0) - (a.days || 0));
  if (K.key === 'watching') rows = rows.map(r => ({ ...r, group: 'week' }));
  /* a ticked row has no time on it yet, so none is shown */
  if (K.key === 'done') rows = rows.map(r => (r.notice ? { ...r, group: 'you', when: '', late: false } : { ...r, group: 'you', by: 'You', when: '', late: false, btn: { label: 'Open My day', line: 'my-day', tab: 'index' } }));
  const x = extra || {};
  return {
    kind: K.key, mode: 'team', lateKnown: K.key === 'needs',
    groups: [...TEAM_GROUPS[K.key], ...(x.groups || [])], rows: [...rows, ...(x.rows || [])],
    read: x.read || {}, notes: x.notes || [],
    foot: K.key === 'needs' ? 'Your My day list (what is late and what is due today), then what waits on the team across every brand: ad calls, client updates to send, the War Room check-in, creative to review or load, and client requests.' : (x.foot || ''),
  };
}

async function loadClient(ctx, K) {
  if (!ctx.brand) return { kind: K.key, mode: 'client', groups: CLIENT_GROUPS[K.key], rows: [] };
  const rq = await ctx.api('/api/requests?act=' + encodeURIComponent(ctx.brand.id), { worker: 'ah', signal: ctx.signal });
  const items = (rq && rq.items) || [];
  const row = r => { const n = ago(r.created_at); return { text: r.title, brand: ctx.brand.name || r.brand || '', by: cap(r.kind || 'request'), when: n ? daysWord(n) : 'today', days: n, who: null, group: 'main',
    detail: r.body || '', btn: { label: K.key === 'needs' ? 'Review' : 'Open', line: 'requests', tab: 'index' } }; };
  const pick = {
    needs: () => items.filter(r => (r.kind === 'approval' || r.kind === 'ask') && r.status === 'open').map(row).sort((a, b) => b.days - a.days),
    watching: () => items.filter(r => r.kind === 'request' && r.status === 'open').map(row),
    done: () => items.filter(r => r.status === 'done' && Date.now() - Date.parse(r.updated_at || r.created_at) < DAY).map(r => ({ ...row(r), when: '', by: r.decided_by || cap(r.kind || 'request') })),
  };
  /* what an automation told this client (GET /api/notices): never throws, empty when there is nothing */
  const told = noticeRows(await readNotices(), { brands: ctx.brands, brand: ctx.brand, client: true })[K.key].map(r => ({ ...r, group: 'main' }));
  return { kind: K.key, mode: 'client', groups: CLIENT_GROUPS[K.key], rows: [...told, ...pick[K.key]()] };
}

async function loadSample(ctx, K) {
  const [bell, x] = await Promise.all([loadBell({ me: ctx.me, role: ctx.role, brand: ctx.brand, brands: ctx.brands }), ctx.fixture(K.tab + '.json')]);
  const extra = x.rows || {};
  const rows = (bell[K.key] || []).map(r => (r.urgent ? { ...r, group: 'alert' } : r.agency ? { ...r, group: 'agency', when: '' } : { ...r, ...(extra[plain(r.text)] || {}) }));
  const base = x.groups || [{ id: 'main', title: K.label }];
  const groups = rows.some(r => r.group === 'alert') && !base.some(g => g.id === 'alert') ? [ALERT_GROUP, ...base] : base;
  return {
    kind: K.key, mode: ctx.isClient ? 'client' : 'team', lateKnown: !!x.late_known, read: x.read || {},
    groups: rows.some(r => r.group === 'agency') ? [...groups, AGENCY_GROUP] : groups,
    rows,
    take: ctx.isClient ? x.take_client || null : x.take || null,
  };
}

/* ---------- drawing ---------- */
const CSS = `
.nt-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-width:0}
.nt-bar .lx-seg{max-width:100%;overflow-x:auto;scrollbar-width:none}
.nt-bar .lx-seg button{flex:none;white-space:nowrap}
.nt-list{display:grid;gap:24px;min-width:0}
.nt-card .lx-bell-row{padding:14px 28px}
.nt-card .lx-sec+.lx-bell-row{border-top:0}
.nt-row button.t{appearance:none;border:0;background:none;padding:0;margin:0;font:inherit;color:inherit;text-align:left;cursor:pointer;display:block;border-radius:8px}
.nt-row button.t:hover p{color:var(--ink)}
.nt-row button.t:focus-visible{outline:2px solid var(--ink);outline-offset:4px}
.nt-row .m .late{color:var(--bad);font-weight:600}
.nt-sh{display:grid;gap:16px}
.nt-sh .say{font-size:17px;font-weight:600;letter-spacing:-.015em;line-height:1.35;overflow-wrap:anywhere}
.nt-sh .more{font-size:14px;line-height:1.5;color:var(--ink-2);overflow-wrap:anywhere;white-space:pre-line}
.nt-sh dl{display:grid;grid-template-columns:132px minmax(0,1fr);margin:0}
.nt-sh dt,.nt-sh dd{margin:0;padding:11px 0;border-top:1px solid var(--line);font-size:13.5px}
.nt-sh dt{color:var(--muted)}
.nt-sh dd{font-weight:600;overflow-wrap:anywhere}
.nt-sh dd.late{color:var(--bad)}
.nt-notes{display:grid;gap:4px}
.nt-acts{display:flex;gap:8px;flex-wrap:wrap}
@media (max-width:759px){
  .nt-card .lx-bell-row{padding:14px 16px}
  .nt-card.lx-card.flush>.lx-sec{padding:18px 16px 8px}
  .nt-sh dl{grid-template-columns:108px minmax(0,1fr)}
}`;

const pick = { needs: 'all', watching: 'all', done: 'all' };     // the brand filter survives a refresh behind

const linkOf = (b, ctx) => (b ? b.href || (b.line ? ctx.href(b.line, b.tab) : null) : null);
function placeOf(b) {
  if (!b) return '';
  if (b.href) return /slack\.com/.test(b.href) ? 'Slack' : /open=production/.test(b.href) ? 'The card in old ' + APP_NAME : 'Old ' + APP_NAME;
  const l = lineOf(b.line); if (!l) return '';
  const t = l.tabs.find(x => x.id === b.tab);
  return t && t.label && l.tabs.filter(x => !x.hidden).length > 1 ? l.label + ', ' + t.label : l.label;
}
const say = parts => [].concat(parts || '').map(p => (p && typeof p === 'object' ? h('b', null, p.b) : p));
const go = (b, ctx, o = {}) => { const link = linkOf(b, ctx); return link ? button(b.label || 'Open', { ...o, href: link, target: b.href && /^https?:/.test(b.href) ? '_blank' : null }) : null; };

/* What the answer buttons on an automation row mean, in one line. */
function noticeFoot(n) {
  if (n.kind === 'alert') return n.state === 'open' ? 'It clears itself when it is fixed. Hide for today puts it away until tomorrow, and it comes back if it is still true.' : n.answer === 'hidden' ? 'Hidden for today. It comes back tomorrow if it is still true.' : 'This one cleared itself.';
  if (n.state !== 'open') return 'This one is answered.';
  if (n.kind === 'proposal') return 'This is a suggestion. ' + APP_NAME + ' changes nothing. Make the change in Ads and tap I did it, or tap No.';
  if (n.kind === 'release') return 'Until you tap Send to the client, the client sees nothing.';
  return 'Tap Done when you have seen it.';
}

/** The sheet for one row: the whole message, who and when, and the way to the page where it is handled.
    A row an automation left (r.notice) is answered here: its buttons come from automations/_auto.js. */
function openRow(r, ctx, K, node) {
  const place = r.notice ? '' : placeOf(r.btn);
  const acts = r.notice ? h('div', { class: 'nt-acts' }) : null;
  const pairs = [['Brand', r.brand], [K.key === 'done' ? 'Done by' : 'From', r.who && r.who.name ? r.who.name : r.by], ['Asked in', r.where],
    [K.key === 'done' ? 'When' : r.late ? 'Late by' : 'Waiting', r.when, r.late], ['Handled in', place]].filter(p => p[1]);
  const sh = sheet({ title: K.label, body: h('div', { class: 'nt-sh' },
    h('p', { class: 'say' }, say(r.text)),
    r.detail ? h('p', { class: 'more' }, r.detail) : null,
    h('dl', null, pairs.flatMap(([k, v, bad]) => [h('dt', null, k), h('dd', { class: bad ? 'late' : '' }, v)])),
    acts || go(r.btn, ctx, { primary: true, large: true, icon: 'arrow' }),
    h('p', { class: 'lx-foot' }, r.notice ? noticeFoot(r.notice) : 'Nothing changes from this panel. The button opens the page where this is handled.')) });
  if (acts) import('../automations/_auto.js')
    .then(m => put(acts, ...m.noticeActions(r.notice, ctx, () => { forgetNotices(); sh.close(); if (node) node.remove(); })))
    .catch(() => put(acts, h('p', { class: 'lx-foot' }, 'The buttons could not be loaded. Close this and try again.')));
}

function rowNode(r, ctx, K, lead) {
  const meta = [r.brand && h('b', null, r.brand), r.by, r.when && h('span', { class: r.late ? 'late' : '' }, r.when)].filter(Boolean).flatMap((x, i) => (i ? [h('i'), x] : [x]));
  const node = h('div', { class: 'lx-bell-row nt-row' + (r.urgent ? ' urgent' : '') },
    r.who ? avatar(r.who, { size: 38 }) : h('span', { class: 'lx-bell-mark', role: 'img', 'aria-label': APP_NAME }, svgNode(mark(18))),
    h('button', { class: 't', type: 'button', 'aria-label': 'Details: ' + plain(r.text), onclick: () => openRow(r, ctx, K, node) }, h('p', null, say(r.text)), h('span', { class: 'm' }, meta)),
    /* a row an automation left is answered in its own sheet, on this page */
    r.notice ? (r.btn ? button(r.btn.label, { primary: lead && !!r.btn.primary, onclick: () => openRow(r, ctx, K, node) }) : null) : go(r.btn, ctx, { primary: lead }));
  return node;
}

function figures(d, rows, K) {
  const client = d.mode === 'client', read = d.read || {};
  const brands = [...new Set(rows.map(r => r.brand).filter(Boolean))];
  const n = g => rows.filter(r => r.group === g).length;
  const out = [];
  if (K.key === 'needs') {
    const late = rows.filter(r => r.late), worst = late.reduce((m, r) => Math.max(m, r.days || 0), 0);
    out.push(kpi({ label: client ? 'Waiting on your answer' : 'Need you', value: String(rows.length), size: 'lg', sub: !rows.length ? 'all clear' : d.lateKnown ? (late.length ? statusDot('bad', late.length + ' late') : 'none late') : 'most urgent first' }));
    if (d.lateKnown) out.push(kpi({ label: 'Late', value: String(late.length), size: 'lg', sub: worst ? 'oldest is ' + daysWord(worst) + ' late' : late.length ? 'see the top of the list' : 'nothing is late' }));
    if (client) { const old = rows.reduce((m, r) => Math.max(m, r.days || 0), 0); if (old) out.push(kpi({ label: 'Oldest', value: daysWord(old), size: 'lg', sub: 'waiting on a yes or a no' })); }
    else if (brands.length) { const top = brands.map(b => [b, rows.filter(r => r.brand === b).length]).sort((a, b) => b[1] - a[1])[0]; out.push(kpi({ label: 'Brands', value: String(brands.length), size: 'lg', sub: 'most from ' + top[0] + ', ' + top[1] })); }
  } else if (K.key === 'watching') {
    out.push(kpi({ label: 'In flight', value: String(rows.length), size: 'lg', sub: rows.length ? 'nothing here needs you' : 'nothing is moving' }));
    if (read.client) { const cl = rows.filter(r => r.group === 'client'), old = cl.reduce((m, r) => Math.max(m, r.days || 0), 0);
      out.push(kpi({ label: 'Waiting on the client', value: String(cl.length), size: 'lg', sub: cl.length ? statusDot(old >= 7 ? 'warn' : '', 'oldest ' + daysWord(old)) : 'no one owes an answer' })); }
    const wk = d.groups.find(g => g.id === 'week');
    if (!client && wk) out.push(kpi({ label: wk.title, value: String(n('week')), size: 'lg', sub: wk.note ? wk.note[0].toLowerCase() + wk.note.slice(1) : '' }));
  } else {
    out.push(kpi({ label: 'Done today', value: String(rows.length), size: 'lg', sub: rows.length ? (brands.length > 1 ? 'across ' + brands.length + ' brands' : brands[0] || '') : 'nothing yet' }));
    if (!client) out.push(kpi({ label: 'By you', value: String(n('you')), size: 'lg' }));
    if (!client && read.team) { const t = rows.filter(r => r.group === 'team'), ppl = new Set(t.map(r => (r.who && r.who.name) || r.by)).size;
      out.push(kpi({ label: 'By the team', value: String(t.length), size: 'lg', sub: t.length ? ppl + (ppl === 1 ? ' person' : ' people') : 'nothing logged yet' })); }
  }
  return out;
}

function draw(el, data, ctx, K) {
  addStyles('lx-notif-css', CSS);
  const d = data || {}, all = d.rows || [], groups = d.groups || [];
  const ids = new Set(groups.map(g => g.id)), last = groups.length ? groups[groups.length - 1].id : 'main';
  const rows = all.map(r => (ids.has(r.group) ? r : { ...r, group: last }));
  const figs = figures({ ...d, groups }, rows, K);
  const brands = [...new Set(rows.map(r => r.brand).filter(Boolean))];
  if (pick[K.key] !== 'all' && !brands.includes(pick[K.key])) pick[K.key] = 'all';

  const list = h('div', { class: 'nt-list' });
  const paint = () => {
    const shown = pick[K.key] === 'all' ? rows : rows.filter(r => r.brand === pick[K.key]);
    let lead = K.key === 'needs';
    const cards = groups.map(g => {
      const mine = shown.filter(r => r.group === g.id);
      if (!mine.length) return null;
      const c = card({ title: g.title, note: g.note, action: count(mine.length), flush: true, class: 'nt-card' }, mine.map(r => { const n = rowNode(r, ctx, K, lead); lead = false; return n; }));
      return c;
    }).filter(Boolean);
    put(list,
      brands.length > 1 ? h('div', { class: 'nt-bar' }, segmented([{ id: 'all', label: 'All brands' }, ...brands.map(b => ({ id: b, label: b }))], pick[K.key], id => { pick[K.key] = id; paint(); })) : null,
      cards.length ? cards : empty({ title: K.none[0], text: d.error || K.none[1],
        action: K.key === 'needs' && d.mode === 'team' && !d.error ? button('Open My day', { href: ctx.href('my-day', 'index') }) : null }));
  };
  paint();

  const t = d.take;
  const notes = [...(d.notes || []), d.foot].filter(Boolean);
  put(el,
    d.error ? null : hero({ line: true }, kpis(figs, { cols: figs.length })),
    t ? takeaway(say(t.say), { action: t.action ? go(t.action, ctx) : null }) : null,
    list,
    notes.length ? h('div', { class: 'nt-notes' }, notes.map(n => h('p', { class: 'lx-foot' }, n))) : null);
}

/** One notification tab as a page module. more(ctx) may add team rows the My work list does not hold:
    it resolves to { groups: [{ id, title, note }], rows: [...], read: { name: true }, notes: ['...'], foot } and must never throw. */
export function page(kind, { more } = {}) {
  const K = KINDS[kind];
  return {
    title: K.title,
    ranges: false,          /* now and today: there are no dates to pick */
    sample: ctx => loadSample(ctx, K),
    async load(ctx) {
      /* the team looking as a client: the client's own list is not theirs to read */
      if (ctx.isClient && !storedClient()) return { kind: K.key, mode: 'client', groups: CLIENT_GROUPS[K.key], rows: [], error: 'This is the client\'s own list. It shows when the client is signed in.' };
      return ctx.isClient ? loadClient(ctx, K) : loadTeam(ctx, K, more);
    },
    render: (el, data, ctx) => draw(el, data, ctx, K),
    skeleton(el) {
      el.innerHTML = '<div class="lx-skel chart" style="height:150px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>';
    },
  };
}

export default page('needs');
