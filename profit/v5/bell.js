/* The bell's rows: Needs you, Watching, Done today.
   Loaded only when the bell is first opened (or by app.js after boot, for the count), so it costs the first paint nothing.

   Sample mode: pages/_sample/notifications.json.
   Real mode, team: the My work list old Locus already keeps (GET /api/mywork, account-health, read only).
     late or due today  -> Needs you      this week -> Watching      ticked -> Done today
   Real mode, client: open approvals and questions on the brand's requests (GET /api/requests?act=<brand id>).
   Nothing here writes. A row's button is a link to the page where the thing is done.

   Row shape (what the shell draws):
     { text: 'words' | ['words ', { b: 'bold' }], brand, by, when, who: { name, photo } | null,
       btn: { label, line, tab, primary } | { label, href } }
   In the fixture a row with client: true is one the client sees; every other row is the team's. */

import { SAMPLE, api, fixture, cached } from './data.js';

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : '');
const ago = iso => { const t = Date.parse(iso); if (!t) return ''; const d = Math.max(0, Math.round((Date.now() - t) / 864e5)); return d === 0 ? 'today' : d === 1 ? '1 day' : d + ' days'; };

function fromMyWork(mw) {
  const items = (mw && mw.items) || [];
  const row = it => ({
    text: it.text, brand: it.brand || '',
    by: it.source === 'slack' ? (it.from || 'Slack') : it.source === 'card' ? 'Card ' + String(it.num || '').trim() : it.source === 'call' ? 'Monday call' : (it.from || 'Task'),
    when: it.bucket === 'late' ? 'late' : it.when || (it.due ? 'due ' + it.due : ''),
    who: it.source === 'slack' && it.from ? { name: it.from, photo: it.from_photo || null } : null,
    btn: it.link ? { label: it.source === 'slack' ? 'Reply' : it.source === 'card' ? 'Open card' : 'Open', href: it.link } : { label: 'Open My day', line: 'my-day', tab: 'index' },
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

/** loadBell({ me, role, asClient, brand }) -> { needs: [], watching: [], done: [] } */
export async function loadBell({ me = {}, role = 'team', asClient = false, brand = null } = {}) {
  const client = role === 'client';
  if (SAMPLE) {
    const f = await fixture('_sample/notifications.json');
    const keep = list => (list || []).filter(r => (client ? r.client : !r.client_only));
    return { needs: keep(f.needs), watching: keep(f.watching), done: keep(f.done) };
  }
  if (asClient) return { needs: [], watching: [], done: [], error: 'This is the client\'s own list. It shows when the client is signed in.' };
  if (client) {
    if (!brand) return { needs: [], watching: [], done: [] };
    const rec = await cached('bell|' + brand.id, () => api('/api/requests?act=' + encodeURIComponent(brand.id)), null, { maxAge: 60e3 });
    return fromRequests(rec.data, brand);
  }
  const rec = await cached('bell', () => api('/api/mywork' + (me.email ? '?who=' + encodeURIComponent(me.email) : ''), { worker: 'ah' }), null, { maxAge: 60e3 });
  return fromMyWork(rec.data);
}
