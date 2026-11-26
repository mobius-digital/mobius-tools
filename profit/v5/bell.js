/* The bell's rows: Needs you, Watching, Done today.
   Loaded only when the bell is first opened (or by app.js after boot, for the count), so it costs the first paint nothing.

   Sample mode: pages/_sample/notifications.json.
   Real mode, team: the My work list old Locus already keeps (GET /api/mywork, account-health, read only).
     late or due today  -> Needs you      this week -> Watching      ticked -> Done today
   Real mode, client: open approvals and questions on each of the client's brands (GET /api/requests?act=<brand id>, account-health).
   Every mode, when automations have left rows for this person: GET /api/notices (account-health, read only), added
   to the same three lists. That read can fail or come back empty and the bell is unchanged.
   Nothing here writes. A row's button is a link to the page where the thing is done.

   Row shape (what the shell draws):
     { text: 'words' | ['words ', { b: 'bold' }], brand, by, when, who: { name, photo } | null,
       btn: { label, line, tab, primary } | { label, href } }
   In the fixture a row with client: true is one the client sees; every other row is the team's. */

import { SAMPLE, api, fixture, cached } from './data.js';
import { workers, token } from './config.js';

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : '');
const ago = iso => { const t = Date.parse(iso); if (!t) return ''; const d = Math.max(0, Math.round((Date.now() - t) / 864e5)); return d === 0 ? 'today' : d === 1 ? '1 day' : d + ' days'; };

function fromMyWork(mw) {
  const items = (mw && mw.items) || [];
  const row = it => ({
    text: it.text, brand: it.brand || '',
    by: it.source === 'onboard' ? 'New client setup' : it.source === 'slack' ? (it.from || 'Slack') : it.source === 'card' ? 'Card ' + String(it.num || '').trim() : it.source === 'call' ? 'Monday call' : (it.from || 'Task'),
    when: it.bucket === 'late' ? 'late' : it.when || (it.due ? 'due ' + it.due : ''),
    who: it.source === 'slack' && it.from ? { name: it.from, photo: it.from_photo || null } : null,
    /* a new client setup line opens that client's Get started page in this app; its own button lives on My day */
    btn: it.source === 'onboard' && it.slug ? { label: 'Open', href: '#/brand/' + encodeURIComponent(it.slug) + '/get-started/index' }
      : it.link ? { label: it.source === 'slack' ? 'Reply' : it.source === 'card' ? 'Open card' : 'Open', href: it.link } : { label: 'Open My day', line: 'my-day', tab: 'index' },
  });
  const open = items.filter(i => !i.done);
  return {
    needs: open.filter(i => i.bucket === 'late' || i.bucket === 'today').sort((a, b) => (a.bucket === 'late' ? 0 : 1) - (b.bucket === 'late' ? 0 : 1)).map(row),
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
/** The answer of GET /api/notices ({ home, bell, morning, counts }), or null. Never throws. */
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
/** Notices as bell rows. A row keeps the notice itself in .notice, so a page can draw its answer buttons.
    Open and waiting for an answer, or on the home list -> Needs you. Open and held for the morning read, or
    only for the record -> Watching. Answered in the last day -> Done today. A client's open rows all need a look. */
export function noticeRows(n, { brands = [], brand = null, client = false } = {}) {
  const out = { needs: [], watching: [], done: [] };
  if (!n || !Array.isArray(n.bell)) return out;
  const name = id => ((brands || []).find(b => b.id === id) || (brand && brand.id === id ? brand : {})).name || '';
  const now = Date.now();
  for (const r of n.bell) {
    if (!r || !r.title) continue;
    if (SAMPLE && client && !r.client) continue;
    if (client && brand && r.brand_id && r.brand_id !== brand.id) continue;
    const waits = r.kind === 'proposal' || r.kind === 'release';
    const held = !SAMPLE && !!r.held_until && Date.parse(r.held_until) > now;
    const row = { text: r.title, brand: name(r.brand_id), by: client ? 'From your team' : 'Automation', when: r.when || ago(r.created_at), who: null, detail: r.body || '', notice: r };
    if (r.state === 'done') { if (SAMPLE || now - Date.parse(r.done_at || r.created_at) < 864e5) out.done.push({ ...row, when: 'done', btn: null }); }
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
/** Add the automation rows to a bell answer. Anything that goes wrong leaves the answer as it was. */
async function withNotices(base, opts) {
  try {
    const x = noticeRows(await readNotices(), opts);
    return { ...base, needs: [...x.needs, ...base.needs], watching: [...base.watching, ...x.watching], done: [...base.done, ...x.done] };
  } catch { return base; }
}

/** loadBell({ me, role, asClient, brand, brands }) -> { needs: [], watching: [], done: [] } */
export async function loadBell({ me = {}, role = 'team', asClient = false, brand = null, brands = [] } = {}) {
  const client = role === 'client';
  const opts = { brands, brand, client };
  if (SAMPLE) {
    const f = await fixture('_sample/notifications.json');
    const keep = list => (list || []).filter(r => (client ? r.client : !r.client_only));
    return withNotices({ needs: keep(f.needs), watching: keep(f.watching), done: keep(f.done) }, opts);
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
  const rec = await cached('bell', () => api('/api/mywork' + (me.email ? '?who=' + encodeURIComponent(me.email) : ''), { worker: 'ah' }), null, { maxAge: 60e3 });
  return withNotices(fromMyWork(rec.data), opts);
}
