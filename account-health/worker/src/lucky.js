/* LUCKY CREATOR APP IN LOCUS (2026-11-05). Lucky's creators live only in the Lucky creator app (creators.luckygolf.com).
 * Locus keeps no copy: it reads the app live and sends actions through the app's own staff code, so the two cannot drift.
 * Key: the LUCKY_PROGRAM_KEY secret (the app's PROGRAM_SUMMARY_KEY), sent as a Bearer header, never in a URL.
 *
 * Routes (staff only; a client login never reaches them):
 *   GET  /api/lucky/summary         the program numbers (same feed as the scorecard)
 *   GET  /api/lucky/review-queue    videos waiting for review
 *   POST /api/lucky/review {id, decision: approve|reject|changes, note}   the app's review buttons (push, ad name, level)
 *   GET  /api/lucky/creators        creators with level and results (first name and level only)
 *   POST /api/lucky/announce {text, title?, discord: none|announcements|wins, notify?}   the app's announcement form
 *   GET  /api/lucky/discord-recap   the Clubhouse: counts, unanswered questions, next posts and call
 *   GET  /api/lucky/this-week       what creators are asked to film
 * Every write is also kept in the Locus Change Log (the app has no audit table yet). No em dashes. */
const APP = 'https://creators.luckygolf.com';
const READS = { summary: '/api/stats/program-summary', 'review-queue': '/api/locus/review-queue', creators: '/api/locus/creators', 'discord-recap': '/api/locus/discord-recap', 'this-week': '/api/locus/this-week' };
const WRITES = { review: '/api/locus/review', announce: '/api/locus/announce' };

async function call(env, path, body) {
  if (!env.LUCKY_PROGRAM_KEY) throw new Error('The Lucky app key is not set in Locus.');
  const r = await fetch(APP + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${env.LUCKY_PROGRAM_KEY}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `The Lucky app answered ${r.status}.`);
  return j;
}
async function logChange(env, who, summary, objectId) {
  const b = await env.DB.prepare(`SELECT meta_act FROM brand_accounts WHERE act_id = 'brand_lucky_golf'`).first().catch(() => null);
  await env.DB.prepare(`INSERT INTO activities (id, act_id, event_time, event_type, category, summary, reason, note, confirmed, manual, actor, object_type, object_id, object_name)
    VALUES (?1, ?2, ?3, 'lucky_app_write', 'creators', ?4, NULL, 'Changed in the Lucky creator app from Locus.', 1, 1, ?5, 'lucky_app', ?6, NULL)`)
    .bind(`manual:${crypto.randomUUID()}`, b?.meta_act || 'brand_lucky_golf', new Date().toISOString(), summary, `${who || 'someone'} in Locus`, objectId || null).run().catch(() => {});
}
const clip = (s, n) => String(s || '').replace(/\s*[—–]\s*/g, ', ').trim().slice(0, n);

export async function handleLucky(request, env, url, path, json, h) {
  if (!/^\/api\/lucky(\/|$)/.test(path)) return null;
  if (!(await h.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  if (h.isClient && h.isClient(request)) return json({ error: 'That part is the Mobius team' + "'" + 's.' }, 403);
  const email = await h.sessionEmail(env, request).catch(() => null);
  const only = await h.brandsFor(env, email).catch(() => null);
  if (only && !only.has('brand_lucky_golf')) return json({ error: 'You do not have access to Lucky Golf.' }, 403);
  const name = path.replace(/^\/api\/lucky\/?/, '');
  try {
    if (request.method === 'GET' && READS[name]) return json(await call(env, READS[name]));
    if (request.method === 'POST' && name === 'review') {
      const b = await request.json().catch(() => ({}));
      if (!b.id || !['approve', 'reject', 'changes'].includes(b.decision)) return json({ error: 'Give the video id and approve, reject or changes.' }, 400);
      const r = await call(env, WRITES.review, { id: String(b.id), decision: b.decision, note: clip(b.note, 1000) });
      await logChange(env, email, `Lucky creator video ${b.decision === 'approve' ? 'approved' : b.decision === 'reject' ? 'rejected' : 'sent back for changes'}${b.note ? `: ${clip(b.note, 120)}` : ''}`, String(b.id));
      return json(r);
    }
    if (request.method === 'POST' && name === 'announce') {
      const b = await request.json().catch(() => ({}));
      const text = clip(b.text, 2000);
      if (!text) return json({ error: 'Write the announcement first.' }, 400);
      const discord = ['none', 'announcements', 'wins'].includes(b.discord) ? b.discord : 'none';
      const r = await call(env, WRITES.announce, { text, title: clip(b.title, 120) || undefined, discord, notify: b.notify !== false });
      await logChange(env, email, `Lucky announcement posted${discord !== 'none' ? ` (and in Discord #${discord})` : ''}: ${clip(b.title || text, 120)}`, r.id ? String(r.id) : null);
      return json(r);
    }
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, 400); }
}
