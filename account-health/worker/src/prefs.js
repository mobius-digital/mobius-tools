/* PER-PERSON PREFERENCES (2026-10-11, session D). One settings row per person, `userPrefs:<email>`:
 *   { morning_dm: bool,                      the morning line as a Slack DM (morning.js)
 *     nudge: { <item key>: { state: 'snoozed' | 'done', until: ms } } }   the nudge card's Not now (24h) and Done
 * Stored in the worker, never localStorage, so a snooze follows the person to every device. The client and the team
 * use the same routes; the email comes from the session (or the client scope), never from the body.
 *   GET /api/me/prefs            -> { email, prefs }
 *   PUT /api/me/prefs { morning_dm?, nudge? }   merges: nudge keys are added or replaced one at a time; a key with
 *                                  state null is removed. Entries older than 7 days past `until` are dropped. */
const KEEP_MS = 7 * 86400e3;
const keyOf = email => `userPrefs:${String(email || '').trim().toLowerCase()}`;
const clean = (p, now = Date.now()) => {
  const out = { morning_dm: !!(p && p.morning_dm), nudge: {} };
  for (const [k, v] of Object.entries((p && p.nudge) || {})) {
    if (!v || !['snoozed', 'done'].includes(v.state) || !(+v.until > now - KEEP_MS)) continue;
    out.nudge[k] = { state: v.state, until: +v.until };
  }
  return out;
};
export async function prefsFor(env, email) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(keyOf(email)).first().catch(() => null);
  let p = null; try { p = JSON.parse(row?.value || 'null'); } catch {}
  return clean(p);
}
export async function updatePrefs(env, email, patch, now = Date.now()) {
  const cur = await prefsFor(env, email);
  if (patch && 'morning_dm' in patch) cur.morning_dm = !!patch.morning_dm;
  if (patch && patch.nudge && typeof patch.nudge === 'object') {
    for (const [k, v] of Object.entries(patch.nudge)) {
      if (typeof k !== 'string' || k.length > 200) continue;
      if (!v || v.state == null) { delete cur.nudge[k]; continue; }
      if (!['snoozed', 'done'].includes(v.state)) continue;
      cur.nudge[k] = { state: v.state, until: +v.until > now ? Math.min(+v.until, now + 30 * 86400e3) : now + (v.state === 'snoozed' ? 86400e3 : KEEP_MS) };
    }
  }
  const out = clean(cur, now);
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(keyOf(email), JSON.stringify(out)).run();
  return out;
}
/** Everyone who switched the morning DM on: [{email, prefs}]. */
export async function morningPeople(env) {
  const { results } = await env.DB.prepare(`SELECT key, value FROM settings WHERE key LIKE 'userPrefs:%'`).all().catch(() => ({ results: [] }));
  const out = [];
  for (const r of results || []) { let p = null; try { p = JSON.parse(r.value || 'null'); } catch {} const c = clean(p); if (c.morning_dm) out.push({ email: r.key.slice('userPrefs:'.length), prefs: c }); }
  return out;
}
/** The routes. `who` = the signed-in email (the handler resolves it; a client's comes from its scope). */
export async function handlePrefs(request, env, path, who, json) {
  if (path !== '/api/me/prefs') return null;
  if (!who) return json({ error: 'sign in first' }, 401);
  if (request.method === 'GET') return json({ email: who, prefs: await prefsFor(env, who) });
  if (request.method === 'PUT') {
    let b = {}; try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
    return json({ ok: true, email: who, prefs: await updatePrefs(env, who, b) });
  }
  return json({ error: 'method' }, 405);
}
export const _test = { clean, keyOf };
