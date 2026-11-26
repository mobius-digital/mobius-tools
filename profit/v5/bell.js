/* The bell's rows: Needs you, Watching, Done today.
   Loaded only when the bell is first opened (or by app.js after boot, for the count), so it costs the first paint nothing.

   Sample mode: pages/_sample/notifications.json.
   Real mode, team: the My work list old Locus already keeps (GET /api/mywork, account-health, read only).
     late or due today  -> Needs you      this week -> Watching      ticked -> Done today
   Real mode, client: open approvals and questions on each of the client's brands (GET /api/requests?act=<brand id>, account-health).
   Every mode, when automations have left rows for this person: GET /api/notices (account-health, read only), added
   to the same three lists. That read can fail or come back empty and the bell is unchanged.
   Real mode, team, also: what waits on the team across every brand (ad calls, client updates to send, the War Room
   check-in, creative to review or load, client requests). See loadWaiting below. Each source is a quiet read: one
   failing read leaves that source out and never breaks the bell.
   Nothing here writes. A row's button is a link to the page where the thing is done.

   Row shape (what the shell draws):
     { text: 'words' | ['words ', { b: 'bold' }], brand, by, when, who: { name, photo } | null,
       btn: { label, line, tab, primary } | { label, href } }
   In the fixture a row with client: true is one the client sees; every other row is the team's. */

import { SAMPLE, api, fixture, cached } from './data.js';
import { workers, token } from './config.js';
import { lineOf } from './menu.js';

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : '');
const ago = iso => { const t = Date.parse(iso); if (!t) return ''; const d = Math.max(0, Math.round((Date.now() - t) / 864e5)); return d === 0 ? 'today' : d === 1 ? '1 day' : d + ' days'; };

/* The move lines (account-health movelines.js, 2026-11-26): one grouped row each, worked out live, gone once done.
   `v5` is a page in this app (#/...); `nudge` is a self nudge ("Your plan for today is not in") that sits at the top of
   My day and is never a bell row (nobody else waits on it). */
export const LINE_SOURCES = ['checkin', 'weekplan', 'dates', 'comments', 'newmeta', 'connect', 'creators'];
/** Late and due tasks as ONE row with a count ("3 tasks late, 2 due today"), opening My day. One task stays its own row. */
export function groupTasks(rows) {
  const tasks = rows.filter(i => i.source === 'task' && (i.bucket === 'late' || i.bucket === 'today'));
  if (tasks.length < 2) return rows;
  const late = tasks.filter(i => i.bucket === 'late').length, due = tasks.length - late;
  const text = [late ? late + (late === 1 ? ' task late' : ' tasks late') : '', due ? (late ? due + ' due today' : due + (due === 1 ? ' task due today' : ' tasks due today')) : ''].filter(Boolean).join(', ');
  const one = { id: 'tasks', source: 'tasks', bucket: late ? 'late' : 'today', text, from: 'Tasks', brand: '', n: tasks.length };
  const at = rows.indexOf(tasks[0]);
  const rest = rows.filter(i => !tasks.includes(i));
  rest.splice(Math.min(at, rest.length), 0, one);
  return rest;
}
export function fromMyWork(mw) {
  const items = (mw && mw.items) || [];
  const row = it => ({
    text: it.text, brand: it.brand || '',
    by: it.source === 'onboard' ? 'New client setup' : it.source === 'slack' ? (it.from || 'Slack') : it.source === 'card' ? 'Card ' + String(it.num || '').trim() : it.source === 'call' ? 'Monday call' : (it.from || 'Task'),
    when: it.bucket === 'late' ? 'late' : it.when || (it.due ? 'due ' + it.due : ''),
    who: it.source === 'slack' && it.from ? { name: it.from, photo: it.from_photo || null } : null,
    ...(it.n ? { n: it.n, kind: it.source } : {}),
    ...(LINE_SOURCES.includes(it.source) ? { kind: it.source, detail: it.detail || '' } : {}),
    /* a new client setup line opens that client's Get started page in this app; its own button lives on My day */
    btn: it.source === 'onboard' && it.slug ? { label: 'Open', href: '#/brand/' + encodeURIComponent(it.slug) + '/get-started/index' }
      : it.source === 'tasks' ? { label: 'Open My day', line: 'my-day', tab: 'index' }
      : it.v5 ? { label: it.btn_label || 'Open', href: it.v5 }
      : it.link ? { label: it.btn_label || (it.source === 'slack' ? 'Reply' : it.source === 'card' ? 'Open card' : 'Open'), href: it.link } : { label: 'Open My day', line: 'my-day', tab: 'index' },
  });
  const open = items.filter(i => !i.done && !i.nudge);
  return {
    needs: groupTasks(open.filter(i => i.bucket === 'late' || i.bucket === 'today').sort((a, b) => (a.bucket === 'late' ? 0 : 1) - (b.bucket === 'late' ? 0 : 1))).map(row),
    watching: open.filter(i => i.bucket === 'week').map(row),
    done: items.filter(i => i.done).slice(0, 12).map(i => ({ ...row(i), when: 'done', btn: null })),
  };
}
function fromRequests(rq, brand) {
  const items = (rq && rq.items) || [];
  const row = r => ({ text: r.title, brand: (brand && brand.name) || r.brand || '', by: cap(r.kind || 'request'), when: ago(r.created_at), who: null, btn: { label: 'Open', line: 'requests', tab: 'index' } });
  return {
    needs: items.filter(r => (r.kind === 'approval' || r.kind === 'ask') && r.status === 'open').map(row),
    watching: items.filter(r => r.kind === 'request' && r.status === 'open').map(row),
    done: items.filter(r => r.status === 'done' && Date.now() - Date.parse(r.updated_at || r.created_at) < 864e5).map(r => ({ ...row(r), btn: null })),
  };
}

/* ---------- rows an automation left for this person (GET /api/notices, account-health) ----------
   The route answers for any signed in person and carries no on or off flag: with automations off nothing makes
   rows, so its lists come back empty. It is read with its own quiet fetch, so a refusal, an older worker or a
   dropped connection leaves the bell exactly as it was and never opens the sign in page.
   Sample mode: pages/_sample/notices.json, the same shape as the route's answer. */
let NOTE = null;
/** Read again on the next call (after a row was answered). */
export function forgetNotices() { NOTE = null; }
/** The answer of GET /api/notices ({ home, bell, morning, counts, alerts, features }), or null. Never throws. */
export async function readNotices() {
  try {
    if (SAMPLE) return await fixture('_sample/notices.json');
    if (!token()) return null;
    if (!NOTE || Date.now() - NOTE.at > 60e3) {
      NOTE = { at: Date.now(), p: fetch(workers().ah + '/api/notices', { headers: { Authorization: 'Bearer ' + token() } })
        .then(res => (res.ok ? res.json() : null)).then(j => (j && Array.isArray(j.bell) ? j : null)).catch(() => null) };
    }
    return await NOTE.p;
  } catch { return null; }
}
/** Where an alert's Open goes. button.page is a v5 page: 'meta/live-now' (a brand page, opened on that brand) or
    'a-status/index' (an agency page). A brand page for a brand not in the list opens Agency > Platform status. */
export function alertHref(btn, brands = []) {
  const page = String((btn && btn.page) || 'a-status/index').replace(/^\/+|\/+$/g, '');
  const [line, tab] = page.split('/');
  if (/^a-/.test(line)) return '#/agency/all/' + encodeURIComponent(line) + '/' + encodeURIComponent(tab || 'index');
  const b = (brands || []).find(x => x.id === (btn && btn.brand_id));
  return b && b.slug ? '#/brand/' + encodeURIComponent(b.slug) + '/' + encodeURIComponent(line) + '/' + encodeURIComponent(tab || 'index') : '#/agency/all/a-status/index';
}
/** The open alerts, in the order the server sent them (outage first). An older answer with no `alerts` list: the
    open alert rows of the bell, in its order. */
function alertList(n) {
  if (Array.isArray(n.alerts)) return n.alerts.filter(r => r && r.title && r.state !== 'done');
  return (n.bell || []).filter(r => r && r.title && r.kind === 'alert' && r.state === 'open');
}
/** Notices as bell rows. A row keeps the notice itself in .notice, so a page can draw its answer buttons.
    An open alert (kind 'alert': spend far off normal, a client daily that did not go out, the AI key, a Meta sync,
    a platform down) goes to Needs you before every other row, marked urgent, with a button to the page that fixes it.
    Open and waiting for an answer, or on the home list -> Needs you. Open and held for the morning read, or
    only for the record -> Watching. Answered in the last day -> Done today (an alert hidden for today too).
    A client's open rows all need a look. A client never sees an alert. */
export function noticeRows(n, { brands = [], brand = null, client = false } = {}) {
  const out = { needs: [], watching: [], done: [] };
  if (!n || !Array.isArray(n.bell)) return out;
  const name = id => ((brands || []).find(b => b.id === id) || (brand && brand.id === id ? brand : {})).name || '';
  const now = Date.now();
  if (!client) {
    for (const r of alertList(n)) {
      out.needs.push({ text: r.title, brand: name(r.brand_id), by: 'Alert', tone: 'bad', urgent: true, when: 'since ' + ago(r.created_at), who: null, detail: r.body || '', notice: r,
        btn: { label: (r.button && r.button.label) || 'Open', href: alertHref({ brand_id: r.brand_id, ...(r.button || {}) }, brands), primary: true } });
    }
  }
  for (const r of n.bell) {
    if (!r || !r.title) continue;
    /* open alerts were drawn above; a client never gets one */
    if (r.kind === 'alert' && (client || r.state === 'open')) continue;
    if (SAMPLE && client && !r.client) continue;
    if (client && brand && r.brand_id && r.brand_id !== brand.id) continue;
    const waits = r.kind === 'proposal' || r.kind === 'release';
    const held = !SAMPLE && !!r.held_until && Date.parse(r.held_until) > now;
    const row = { text: r.title, brand: name(r.brand_id), by: client ? 'From your team' : r.kind === 'alert' ? 'Alert' : 'Automation', when: r.when || ago(r.created_at), who: null, detail: r.body || '', notice: r };
    if (r.state === 'done') { if (SAMPLE || now - Date.parse(r.done_at || r.created_at) < 864e5) out.done.push({ ...row, when: r.kind === 'alert' ? (r.answer === 'hidden' ? 'hidden for today' : 'fixed') : 'done', btn: null }); }
    else if (r.state === 'open') {
      const top = !held && (waits || r.home || client);
      /* A hand off about a card (team rows only: a client's row carries no button) opens the board. */
      const toCard = !client && r.button && r.button.kind === 'card';
      (top ? out.needs : out.watching).push({ ...row, when: held ? 'waits for your morning read' : row.when,
        btn: toCard ? { label: 'Open card', line: 'production', tab: 'board' } : { label: waits ? 'Answer' : 'Open', line: 'notifications', tab: top ? 'needs-you' : 'watching', primary: waits } });
    }
  }
  return out;
}
/** The switches every signed in person learns from GET /api/notices:
    { creatorProgram, socialPosting, siteReviewsOpen }, or null when the answer has none (an older worker). */
export function featuresFrom(n) { return (n && n.features) || null; }
/** Add the automation rows to a bell answer. Alerts go first, in front of the person's own list and the agency
    rows; the other notices keep their place right after them. Anything that goes wrong leaves the answer as it was. */
async function withNotices(base, opts) {
  try {
    const x = noticeRows(await readNotices(), opts);
    const alerts = x.needs.filter(r => r.urgent), rest = x.needs.filter(r => !r.urgent);
    return { ...base, needs: [...alerts, ...rest, ...base.needs], watching: [...base.watching, ...x.watching], done: [...base.done, ...x.done] };
  } catch { return base; }
}

/** loadBell({ me, role, asClient, brand, brands }) -> { needs: [], watching: [], done: [] } */
export async function loadBell({ me = {}, role = 'team', asClient = false, brand = null, brands = [] } = {}) {
  const client = role === 'client';
  const opts = { brands, brand, client };
  if (SAMPLE) {
    const f = await fixture('_sample/notifications.json');
    const keep = list => (list || []).filter(r => (client ? r.client : !r.client_only));
    const agency = client ? [] : waitingRows(await loadWaiting({ brands, role }));
    return withNotices({ needs: [...keep(f.needs), ...agency], watching: keep(f.watching), done: keep(f.done) }, opts);
  }
  if (asClient) return { needs: [], watching: [], done: [], error: 'This is the client\'s own list. It shows when the client is signed in.' };
  if (client) {
    if (!brand && !(brands || []).length) return withNotices({ needs: [], watching: [], done: [] }, opts);
    /* Requests live on account-health only. A client with more than one brand reads each of them. */
    const list = (brands || []).length ? brands : [brand];
    const parts = await Promise.all(list.map(b => cached('bell-rq|' + b.id, () => api('/api/requests?act=' + encodeURIComponent(b.id), { worker: 'ah' }), null, { maxAge: 60e3 })
      .then(rec => fromRequests(rec.data, b)).catch(() => ({ needs: [], watching: [], done: [] }))));
    const merged = { needs: [], watching: [], done: [] };
    for (const x of parts) for (const k of Object.keys(merged)) merged[k].push(...x[k]);
    return withNotices(merged, opts);
  }
  /* the person's own list first; a refusal (a new teammate not on the roster yet) leaves it empty, not the whole bell */
  let mine = null, err = '';
  try { mine = fromMyWork((await cached('bell', () => api('/api/mywork' + (me.email ? '?who=' + encodeURIComponent(me.email) : ''), { worker: 'ah' }), null, { maxAge: 60e3 })).data); }
  catch (e) { mine = { needs: [], watching: [], done: [] }; err = 'Your own list could not be read just now' + (e && e.message ? ': ' + e.message : '.'); }
  const agency = waitingRows(await loadWaiting({ brands, role }));
  const out = await withNotices({ ...mine, needs: [...mine.needs, ...agency] }, opts);
  return err ? { ...out, error: err } : out;
}

/* ---------- what is waiting on the team, across every brand (team only) ----------
   The bell, My day and the agency pages show the same list, read from the same routes the pages behind each link read:
     ad calls not decided today     GET /api/buyer-list?act=all&ads=0     one row per brand, opens that brand's Meta Suggestions
     client updates to send         GET /api/briefs?act=all and GET /api/reports?act=all   one row, opens Agency > To send
     War Room check-in to approve   GET /api/standing                      one row, opens Agency > Black Friday
     creative to review or load     GET /api/production?act=all            one row per brand and kind
     client requests on the team    GET /api/requests?act=all              one row, opens Agency > Requests
   All on the account-health worker. Every read is quiet: a refusal, a slow worker or a dropped line leaves that one
   source out and never opens the sign in page. Reads go two at a time, and the answer is kept for 5 minutes (in
   memory and for this tab), so opening the bell, My day and Today in a row reads each route once. Nothing here writes.
   Sample mode: pages/my-day/_sample/waiting.json, the same shape as what loadWaiting returns. */
const WAIT_TTL = 5 * 60e3;   // a write made here clears it at once (forgetWaiting)
const WAIT_KEY = 'lx5_waiting_v1';
const QUIET = new Map();          // worker|path -> { at, p }
let WAIT = null;                  // { at, p }

/** One read with the stored session, kept 5 minutes. Never throws: null when anything goes wrong. */
export function quietRead(path, which = 'ah') {
  const k = which + '|' + path, hit = QUIET.get(k);
  if (hit && Date.now() - hit.at < WAIT_TTL) return hit.p;
  if (SAMPLE || !token()) return Promise.resolve(null);
  const p = fetch(workers()[which === 'profit' ? 'profit' : 'ah'] + path, { headers: { Authorization: 'Bearer ' + token() } })
    .then(res => (res.ok ? res.json() : null)).catch(() => null);
  QUIET.set(k, { at: Date.now(), p });
  return p;
}
/** A page that already read one of these routes can hand its answer over, so it is not read twice. */
export function primeRead(path, data, which = 'ah') {
  if (data != null && !SAMPLE) QUIET.set(which + '|' + path, { at: Date.now(), p: Promise.resolve(data) });
}
/** Read again on the next call (after a write that changes the list). */
export function forgetWaiting() { WAIT = null; QUIET.clear(); try { sessionStorage.removeItem(WAIT_KEY); } catch {} }

const many = (n, one, more) => n + ' ' + (n === 1 ? one : more || one + 's');
const brandOf = (brands, id) => (brands || []).find(x => x.id === id) || null;
const nameOf = (brands, id, fallback) => { const b = brandOf(brands, id); return (b && b.name) || fallback || ''; };
const brandLink = (brands, id, line, tab, agencyLine, agencyTab) => {
  const b = brandOf(brands, id);
  return b && b.slug ? '#/brand/' + encodeURIComponent(b.slug) + '/' + line + '/' + tab : '#/agency/all/' + agencyLine + '/' + (agencyTab || 'index');
};
const KIND_LINK = { calls: ['meta', 'suggestions', 'a-meta', 'suggestions'], review: ['production', 'board', 'a-production', 'pipeline'], load: ['meta', 'load-ads', 'a-meta', 'load-ads'] };
/** The Black Friday War Room tab, read from the menu: 'war-room' (or 'live'), else the first tab there is. */
function warTab() {
  try { const l = lineOf('a-black-friday'); const ids = ((l && l.tabs) || []).filter(t => !t.hidden).map(t => t.id); return ['war-room', 'live'].find(x => ids.includes(x)) || ids[0] || 'pace'; } catch { return 'pace'; }
}

/** The answers, folded into rows. Exported so a page that holds the answers can build the same rows. */
export function waitingFrom({ calls, standing, briefs, reports, board, requests }, brands = []) {
  const items = [], failed = [];
  /* ad calls: Meta rows not decided today, per brand (the same filter as the brand's Suggestions tab) */
  if (calls && Array.isArray(calls.rows)) {
    const by = new Map();
    for (const r of calls.rows) {
      if (!r || r.decided || r.kind === 'launch' || /google|tiktok/i.test(r.platform || '') || !r.act_id) continue;
      const o = by.get(r.act_id) || { n: 0, min: 0, brand: r.brand || '' }; o.n++; if (r.kind === 'minoff') o.min++; by.set(r.act_id, o);
    }
    /* Test minimums due off are rows of the ad calls (a3, kind minoff): the row says how many, so the Slack line can go. */
    for (const [id, o] of [...by.entries()].sort((a, b) => b[1].n - a[1].n)) {
      items.push({ id: 'calls|' + id, kind: 'calls', n: o.n, min: o.min, act_id: id, brand: nameOf(brands, id, o.brand), text: many(o.n, 'ad call') + ' waiting on Yes or No',
        by: o.min ? 'Ad calls, ' + many(o.min, 'test minimum') + ' due off' : 'Ad calls', btn: { label: 'Make the calls', href: brandLink(brands, id, ...KIND_LINK.calls), primary: true } });
    }
  } else failed.push('ad calls');
  /* client updates: daily briefs and reports drafted and not sent (the same rule as Agency > To send) */
  const bOk = briefs && Array.isArray(briefs.rows), rOk = reports && Array.isArray(reports.rows);
  if (bOk || rOk) {
    const wait = r => r && (r.status === 'draft' || r.status === 'error');
    const b = bOk ? briefs.rows.filter(wait) : [], r = rOk ? reports.rows.filter(wait) : [];
    const n = b.length + r.length;
    if (n) {
      const names = [...new Set([...b, ...r].map(x => nameOf(brands, x.act_id, x.account_name)).filter(Boolean))];
      items.push({ id: 'send', kind: 'send', n, act_id: null, brand: names.length === 1 ? names[0] : names.length ? many(names.length, 'brand') : '',
        text: many(n, 'client update') + ' waiting to send', by: [b.length && many(b.length, 'daily brief'), r.length && many(r.length, 'report')].filter(Boolean).join(', '),
        btn: { label: 'Review and send', href: '#/agency/all/a-to-send/index', primary: true } });
    }
    if (!bOk) failed.push('daily briefs');
    if (!rOk) failed.push('reports');
  } else failed.push('client updates');
  /* War Room: brands with a budget change suggested at this check-in and not approved yet (the same rule as the check-in post) */
  if (standing) {
    const rec = standing.standing || null;
    if (rec && Array.isArray(rec.brands)) {
      const ap = rec.approved || {};
      const need = rec.brands.filter(x => x && x.suggest && x.suggest.to && x.meta && x.meta.camp && !ap[x.act_id]);
      if (need.length) items.push({ id: 'war', kind: 'war', n: need.length, act_id: null,
        brand: need.length === 1 ? nameOf(brands, need[0].act_id, need[0].name) : many(need.length, 'brand'),
        text: 'War Room check-in: ' + many(need.length, 'brand') + ' waiting on Approve', by: rec.label || 'Check-in',
        btn: { label: 'Open the War Room', href: '#/agency/all/a-black-friday/' + warTab(), primary: true } });
    }
  } else failed.push('War Room');
  /* creative: cards in Review that wait on the team, and cards Ready to load */
  if (board && Array.isArray(board.cards)) {
    const rev = new Map(), ready = new Map();
    for (const c of board.cards) {
      const m = !c || !c.act_id ? null : c.board === 'review' && !c.needs_client ? rev : c.board === 'ready' ? ready : null;
      if (!m) continue;
      const o = m.get(c.act_id) || { n: 0, brand: c.brand || '' }; o.n++; m.set(c.act_id, o);
    }
    for (const [id, o] of rev) items.push({ id: 'review|' + id, kind: 'review', n: o.n, act_id: id, brand: nameOf(brands, id, o.brand),
      text: many(o.n, 'creative card') + ' waiting on review', by: 'Production', btn: { label: 'Review', href: brandLink(brands, id, ...KIND_LINK.review) } });
    for (const [id, o] of ready) items.push({ id: 'load|' + id, kind: 'load', n: o.n, act_id: id, brand: nameOf(brands, id, o.brand),
      text: many(o.n, 'approved card') + ' ready to load into Meta', by: 'Load ads', btn: { label: 'Load ads', href: brandLink(brands, id, ...KIND_LINK.load) } });
  } else failed.push('creative');
  /* client requests that sit with the team (the same rule as My day) */
  if (requests && Array.isArray(requests.items)) {
    const team = requests.items.filter(r => r && ((r.kind === 'request' && r.status === 'open') || (r.kind === 'approval' && r.status === 'changes')));
    if (team.length) {
      const names = [...new Set(team.map(r => nameOf(brands, r.act_id, r.brand)).filter(Boolean))];
      items.push({ id: 'requests', kind: 'requests', n: team.length, act_id: null, brand: names.length === 1 ? names[0] : names.length ? many(names.length, 'brand') : '',
        text: many(team.length, 'client request') + ' waiting on the team', by: 'Requests', btn: { label: 'Open requests', href: '#/agency/all/a-requests/index' } });
    }
  } else failed.push('client requests');
  return { at: Date.now(), items, failed };
}

/** loadWaiting({ brands, role, asClient }) -> { at, items: [...], failed: [names] }. Team only: a client gets an empty list. Never throws. */
export async function loadWaiting({ brands = [], role = 'team', asClient = false } = {}) {
  const none = { at: Date.now(), items: [], failed: [] };
  if (role === 'client' || asClient) return none;
  try {
    if (SAMPLE) {
      /* the fixture's links are pointed at the sample brands here, so a tap lands on the right sample page */
      const f = await fixture('my-day/_sample/waiting.json');
      const link = it => { const k = KIND_LINK[it.kind]; return k && it.act_id ? brandLink(brands, it.act_id, ...k) : it.kind === 'war' ? '#/agency/all/a-black-friday/' + warTab() : it.btn && it.btn.href; };
      return { at: Date.now(), items: ((f && f.items) || []).map(it => ({ ...it, btn: { ...(it.btn || {}), href: link(it) } })), failed: (f && f.failed) || [] };
    }
    if (!token()) return none;
    if (WAIT && Date.now() - WAIT.at < WAIT_TTL) return await WAIT.p;
    try {
      const s = JSON.parse(sessionStorage.getItem(WAIT_KEY) || 'null');
      if (s && s.at && Date.now() - s.at < WAIT_TTL && Array.isArray(s.items)) { WAIT = { at: s.at, p: Promise.resolve(s) }; return s; }
    } catch { /* no tab storage: read again */ }
    const p = (async () => {
      /* two at a time, so a busy database never gets a burst from one person */
      const [calls, standing] = await Promise.all([quietRead('/api/buyer-list?act=all&ads=0'), quietRead('/api/standing')]);
      const [briefs, reports] = await Promise.all([quietRead('/api/briefs?act=all'), quietRead('/api/reports?act=all')]);
      const [board, requests] = await Promise.all([quietRead('/api/production?act=all'), quietRead('/api/requests?act=all')]);
      const out = waitingFrom({ calls, standing, briefs, reports, board, requests }, brands);
      try { sessionStorage.setItem(WAIT_KEY, JSON.stringify(out)); } catch { /* full or off: memory only */ }
      return out;
    })().catch(() => none);
    WAIT = { at: Date.now(), p };
    return await p;
  } catch { return none; }
}

/** The waiting list as bell rows (Needs you). They carry agency: true so a page can group them. */
export function waitingRows(w) {
  return ((w && w.items) || []).map(it => ({ text: it.text, brand: it.brand || '', by: it.by || '', when: 'today', who: null, agency: true, kind: it.kind, n: it.n, btn: it.btn }));
}
