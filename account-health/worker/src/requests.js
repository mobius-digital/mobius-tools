/* CLIENT REQUESTS AND APPROVALS (2026-10-10). One "Requests" place per brand, two kinds of item:
 *
 *   approval  the team sends the client something to sign off: Studio ads (`what` studio, ref = ad ids),
 *             a link or file (`link`), an offer (`offer`, the text is the offer) or a calendar date
 *             (`date`, ref = Lineup event id). The client taps Approve or Ask for changes (with a note).
 *             Approving Studio ads sets p_studio_ad.status = 'approved' (the same state Studio's own Approve
 *             sets); approving a date sets the Lineup event to 'confirmed' and logs it in the date's history.
 *   request   the client asks the team for something: a short thread (title, text, optional link). Both
 *             sides reply; the team marks it done.
 *
 * Storage: `p_request` + `p_request_msg` on this worker's D1, created on first use (like p_alert).
 * Status: open -> approved | changes (approvals, by the client) -> done (the team closes anything).
 * Slack: a new client request, a client decision and a client reply post ONE line to the brand's INTERNAL
 * channel (brand_accounts.slack_channel = brands.internal_channel). Never the client channel. Nothing is
 * emailed: a new approval just shows in Locus (the client's Home says "N waiting for you").
 *
 * Security: brandguard.js lets a client reach exactly GET /api/requests and POST /api/requests,
 * /api/requests/reply, /api/requests/decide, each with act 'need' (the brand must be theirs). Here every
 * route that names an item by id also checks the item's own brand against the body's act and, for a
 * client, against clientScope(request). A client can only open a `request`, never an approval, and can
 * never mark anything done. Every other route is the team's.
 */
import { clientScope } from './brandguard.js';
import { resolveBrandId } from './brands.js';

const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
const WHAT = ['studio', 'link', 'offer', 'date'];
const clean = (s, n = 2000) => String(s ?? '').trim().slice(0, n);
const okUrl = s => { try { const u = new URL(String(s || '')); return /^https?:$/.test(u.protocol) ? u.toString().slice(0, 600) : ''; } catch { return ''; } };
const nowIso = () => new Date().toISOString();
const rid = () => 'rq_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const safe = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const slugOf = brandId => String(brandId || '').replace(/^brand_/, '').replace(/_/g, '-');
const idOfSlug = slug => 'brand_' + String(slug || '').replace(/-/g, '_');
const nameOfEmail = e => { const l = String(e || '').split('@')[0]; return l ? l.charAt(0).toUpperCase() + l.slice(1) : 'Mobius'; };

export const REQUEST_SQL = [
  `CREATE TABLE IF NOT EXISTS p_request (
    id          TEXT PRIMARY KEY,
    act_id      TEXT NOT NULL,
    kind        TEXT NOT NULL,
    what        TEXT,
    ref         TEXT,
    title       TEXT NOT NULL,
    body        TEXT,
    link        TEXT,
    status      TEXT NOT NULL DEFAULT 'open',
    by_email    TEXT,
    by_name     TEXT,
    by_role     TEXT,
    decided_by  TEXT,
    decided_at  TEXT,
    decision_note TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS p_request_act ON p_request (act_id, status, updated_at)`,
  `CREATE TABLE IF NOT EXISTS p_request_msg (
    id          TEXT PRIMARY KEY,
    request_id  TEXT NOT NULL,
    by_email    TEXT,
    by_name     TEXT,
    by_role     TEXT,
    text        TEXT NOT NULL,
    created_at  TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS p_request_msg_req ON p_request_msg (request_id, created_at)`,
];
let ensured = false;
export async function ensureRequests(env) {
  if (ensured) return;
  for (const sql of REQUEST_SQL) await env.DB.prepare(sql).run();
  ensured = true;
}

/* ---------- reading ---------- */
async function brandNames(env) {
  const { results } = await env.DB.prepare(`SELECT act_id, name, slack_channel FROM brand_accounts`).all().catch(() => ({ results: [] }));
  return new Map((results || []).map(r => [r.act_id, r]));
}

/** What the item points at, for the preview: Studio ads (ids + which image), or the calendar date. */
async function previewOf(env, it) {
  if (it.what === 'studio') {
    const ids = String(it.ref || '').split(',').filter(x => /^[a-f0-9]{24}$/.test(x)).slice(0, 40);
    if (!ids.length) return { ads: [] };
    const rows = (await env.DB.prepare(`SELECT id, status, has_final, updated_at, spec_json FROM p_studio_ad WHERE id IN (${ids.map((_, i) => `?${i + 1}`).join(',')})`).bind(...ids).all().catch(() => ({ results: [] }))).results || [];
    const by = new Map(rows.map(r => [r.id, r]));
    return { ads: ids.map(id => by.get(id)).filter(r => r && r.status !== 'deleted').map(r => { const s = safe(r.spec_json, {}); return { id: r.id, img: r.has_final ? 'final' : 'full', v: String(r.updated_at || '').replace(/\D/g, ''), approved: r.status === 'approved', headline: clean(s.headline || '', 140) }; }) };
  }
  if (it.what === 'date' && env.CAL && it.ref) {
    const e = await env.CAL.prepare(`SELECT id, name, type, status, brief, launch_date, promo_end_date FROM events WHERE id = ?1`).bind(it.ref).first().catch(() => null);
    if (!e) return { date: null };
    return { date: { id: e.id, name: e.name, start: e.launch_date, end: e.promo_end_date || null, offer: e.brief || '', confirmed: e.status === 'confirmed' || e.status === 'completed', cancelled: e.status === 'cancelled' } };
  }
  return {};
}

export async function listRequests(env, act) {
  await ensureRequests(env);
  const all = !act || act === 'all';
  const { results } = await env.DB.prepare(`SELECT * FROM p_request ${all ? `WHERE (status != 'done' OR updated_at >= ?1)` : `WHERE act_id = ?2 AND (status != 'done' OR updated_at >= ?1)`} ORDER BY updated_at DESC LIMIT 200`)
    .bind(new Date(Date.now() - 60 * 864e5).toISOString(), ...(all ? [] : [act])).all();
  const rows = results || [];
  const names = await brandNames(env);
  const msgs = new Map();
  if (rows.length) {
    const ph = rows.map((_, i) => `?${i + 1}`).join(',');
    const m = (await env.DB.prepare(`SELECT * FROM p_request_msg WHERE request_id IN (${ph}) ORDER BY created_at`).bind(...rows.map(r => r.id)).all()).results || [];
    for (const x of m) { if (!msgs.has(x.request_id)) msgs.set(x.request_id, []); msgs.get(x.request_id).push({ by: x.by_name || nameOfEmail(x.by_email), role: x.by_role, text: x.text, at: x.created_at }); }
  }
  const items = [];
  for (const r of rows) items.push({
    id: r.id, act_id: r.act_id, brand: names.get(r.act_id)?.name || r.act_id, kind: r.kind, what: r.what || null, ref: r.ref || null,
    title: r.title, body: r.body || '', link: r.link || '', status: r.status, by: r.by_name || nameOfEmail(r.by_email), by_role: r.by_role,
    decided_by: r.decided_by || null, decided_at: r.decided_at || null, decision_note: r.decision_note || '', created_at: r.created_at, updated_at: r.updated_at,
    thread: (msgs.get(r.id) || []).slice(-50), ...(await previewOf(env, r)),
  });
  /* "Waiting for you" (the client): approvals still open. "Waiting for us" (the team): client requests not done
     and approvals the client answered with changes. */
  const waiting_client = items.filter(i => i.kind === 'approval' && i.status === 'open').length;
  const waiting_team = items.filter(i => (i.kind === 'request' && i.status === 'open') || (i.kind === 'approval' && i.status === 'changes')).length;
  return { items, waiting_client, waiting_team };
}

/* ---------- Slack: one line to the brand's internal channel ---------- */
async function tellTeam(env, deps, act, text) {
  if (!deps.slackPost) return false;
  const b = await env.DB.prepare(`SELECT name, slack_channel FROM brand_accounts WHERE act_id = ?1`).bind(act).first().catch(() => null);
  if (!b || !b.slack_channel) return false;
  const line = text;
  try {
    await deps.slackPost(env, b.slack_channel, line, [{ type: 'section', text: { type: 'mrkdwn', text: line } },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Locus' }, url: `${LOCUS}?open=requests&act=${act}` }] }], { username: 'Locus' });
    return true;
  } catch { return false; }
}

/* ---------- the routes ---------- */
export async function handleRequests(request, env, url, path, json, deps) {
  if (path !== '/api/requests' && !path.startsWith('/api/requests/')) return null;
  if (!(await deps.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  await ensureRequests(env);
  const cs = clientScope(request);
  const email = cs ? cs.email : await deps.sessionEmail(env, request).catch(() => null);
  const who = cs ? (cs.name || nameOfEmail(cs.email)) : nameOfEmail(email || '');
  const role = cs ? 'client' : 'team';
  /* A client only ever touches its own brands; brandguard already checked the act, this checks it again. */
  const mineAct = a => !cs || (a && cs.ids.has(a));
  try {
    if (path === '/api/requests' && request.method === 'GET') {
      const act = await resolveBrandId(env, url.searchParams.get('act') || 'all');
      if (cs && (!act || act === 'all' || !mineAct(act))) return json({ error: 'Pick your brand first.' }, 403);
      return json(await listRequests(env, act));
    }
    if (request.method !== 'POST') return json({ error: 'not found' }, 404);
    const body = await request.json().catch(() => ({}));
    const act = await resolveBrandId(env, body.act || '');
    if (!act || !/^brand_/.test(act) || !mineAct(act)) return json({ error: 'Pick a brand first.' }, cs ? 403 : 400);
    const at = nowIso();

    /* NEW ITEM. A client opens a request; the team opens a request or sends an approval. */
    if (path === '/api/requests') {
      const kind = body.kind === 'approval' ? 'approval' : 'request';
      if (cs && kind !== 'request') return json({ error: 'Your login can ask the team for something, not send approvals.' }, 403);
      const title = clean(body.title, 140), text = clean(body.text, 4000), link = okUrl(body.link);
      if (body.link && !link) return json({ error: 'That link does not look right. Paste the full address, starting with https://' }, 400);
      let what = null, ref = null;
      if (kind === 'approval') {
        what = WHAT.includes(body.what) ? body.what : null;
        if (!what) return json({ error: 'Pick what they are approving.' }, 400);
        if (what === 'studio') {
          const ids = [...new Set((Array.isArray(body.ref) ? body.ref : String(body.ref || '').split(',')).map(String).filter(x => /^[a-f0-9]{24}$/.test(x)))].slice(0, 40);
          if (!ids.length) return json({ error: 'Pick at least one ad.' }, 400);
          const rows = (await env.DB.prepare(`SELECT id, act_id FROM p_studio_ad WHERE id IN (${ids.map((_, i) => `?${i + 1}`).join(',')}) AND status != 'deleted'`).bind(...ids).all()).results || [];
          if (rows.length !== ids.length || rows.some(r => r.act_id !== act)) return json({ error: 'Those ads are not all this brand\'s.' }, 400);
          ref = ids.join(',');
        } else if (what === 'date') {
          if (!env.CAL) return json({ error: 'The calendar database is not bound on the server (CAL).' }, 500);
          const e = await env.CAL.prepare(`SELECT id, name, locus_brand, brand_id, status FROM events WHERE id = ?1`).bind(String(body.ref || '')).first().catch(() => null);
          if (!e || e.status === 'cancelled' || (e.locus_brand || idOfSlug(e.brand_id)) !== act) return json({ error: 'Pick one of this brand\'s calendar dates.' }, 400);
          ref = e.id;
        } else if (what === 'link' && !link) return json({ error: 'Paste the link to what they are approving.' }, 400);
        else if (what === 'offer' && !text) return json({ error: 'Write the offer.' }, 400);
      }
      if (!title) return json({ error: 'Give it a short title.' }, 400);
      if (kind === 'request' && !text) return json({ error: 'Say what you need.' }, 400);
      const id = rid();
      await env.DB.prepare(`INSERT INTO p_request (id, act_id, kind, what, ref, title, body, link, status, by_email, by_name, by_role, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'open', ?9, ?10, ?11, ?12, ?12)`)
        .bind(id, act, kind, what, ref, title, text, link || null, email || null, who, role, at).run();
      const slack = cs ? await tellTeam(env, deps, act, `*${who} asked for something: ${title}.* ${clean(text, 300)}`) : null;
      return json({ ok: true, id, notified: !!slack });
    }

    /* Everything below names an existing item, which must be this act's (and so the client's). */
    const it = await env.DB.prepare(`SELECT * FROM p_request WHERE id = ?1`).bind(String(body.id || '')).first();
    if (!it || it.act_id !== act || !mineAct(it.act_id)) return json({ error: 'That item is not on your list.' }, cs ? 403 : 404);

    if (path === '/api/requests/reply') {
      const text = clean(body.text, 4000);
      if (!text) return json({ error: 'Write the reply first.' }, 400);
      await env.DB.prepare(`INSERT INTO p_request_msg (id, request_id, by_email, by_name, by_role, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
        .bind('rm_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), it.id, email || null, who, role, text, at).run();
      /* A team reply to a done request reopens nothing; a client reply to a done one reopens it (they are still waiting). */
      const reopen = cs && it.kind === 'request' && it.status === 'done';
      await env.DB.prepare(`UPDATE p_request SET updated_at = ?2${reopen ? `, status = 'open'` : ''} WHERE id = ?1`).bind(it.id, at).run();
      const slack = cs ? await tellTeam(env, deps, act, `*${who} replied on "${it.title}":* ${clean(text, 300)}`) : null;
      return json({ ok: true, notified: !!slack });
    }

    if (path === '/api/requests/decide') {
      if (it.kind !== 'approval') return json({ error: 'Only approvals take a decision.' }, 400);
      if (it.status === 'done') return json({ error: 'The team closed this one.' }, 400);
      const decision = body.decision === 'approved' ? 'approved' : body.decision === 'changes' ? 'changes' : null;
      if (!decision) return json({ error: 'Approve, or ask for changes.' }, 400);
      const note = clean(body.note, 2000);
      if (decision === 'changes' && !note) return json({ error: 'Say what you would like changed.' }, 400);
      const effect = {};
      if (decision === 'approved' && it.what === 'studio') {
        const ids = String(it.ref || '').split(',').filter(x => /^[a-f0-9]{24}$/.test(x));
        if (ids.length) {
          const r = await env.DB.prepare(`UPDATE p_studio_ad SET status = 'approved', updated_at = datetime('now') WHERE act_id = ?1 AND status != 'deleted' AND id IN (${ids.map((_, i) => `?${i + 2}`).join(',')})`).bind(act, ...ids).run();
          effect.ads_approved = r?.meta?.changes ?? ids.length;
        }
      }
      if (decision === 'approved' && it.what === 'date' && env.CAL && it.ref) {
        const e = await env.CAL.prepare(`SELECT * FROM events WHERE id = ?1`).bind(it.ref).first().catch(() => null);
        if (e && (e.locus_brand || idOfSlug(e.brand_id)) === act && e.status !== 'cancelled') {
          await env.CAL.prepare(`UPDATE events SET status = 'confirmed', updated_at = ?2, updated_by = ?3 WHERE id = ?1`).bind(e.id, at, who).run();
          /* Logged as Locus (a team name) so the calendar's own hourly client-change post does not say it twice. */
          await env.CAL.prepare(`INSERT INTO changelog (id, brand_id, event_id, event_name, change_summary, changed_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
            .bind(crypto.randomUUID(), e.brand_id || slugOf(act), e.id, e.name, `Confirmed: ${who} approved it in Requests`, 'Locus', at).run().catch(() => {});
          effect.date_confirmed = e.id;
        }
      }
      await env.DB.prepare(`UPDATE p_request SET status = ?2, decided_by = ?3, decided_at = ?4, decision_note = ?5, updated_at = ?4 WHERE id = ?1`).bind(it.id, decision, who, at, note || null).run();
      if (note) await env.DB.prepare(`INSERT INTO p_request_msg (id, request_id, by_email, by_name, by_role, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
        .bind('rm_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), it.id, email || null, who, role, (decision === 'approved' ? 'Approved: ' : 'Changes: ') + note, at).run();
      const slack = cs ? await tellTeam(env, deps, act, decision === 'approved'
        ? `*${who} approved "${it.title}".*${effect.date_confirmed ? ' The date is confirmed on the calendar.' : effect.ads_approved ? ` ${effect.ads_approved} ad${effect.ads_approved === 1 ? '' : 's'} marked approved in Studio.` : ''}${note ? ` ${clean(note, 300)}` : ''}`
        : `*${who} asked for changes on "${it.title}":* ${clean(note, 300)}`) : null;
      return json({ ok: true, status: decision, effect, notified: !!slack });
    }

    /* The team closes an item (a request handled, an approval withdrawn or finished) or opens it again. */
    if (path === '/api/requests/done') {
      if (cs) return json({ error: 'The team marks items done.' }, 403);
      const reopen = body.done === false;
      const status = reopen ? 'open' : 'done';
      await env.DB.prepare(`UPDATE p_request SET status = ?2, updated_at = ?3 WHERE id = ?1`).bind(it.id, status, at).run();
      return json({ ok: true, status });
    }
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, e.status || 500); }
}
