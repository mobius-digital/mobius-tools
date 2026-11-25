/* Ending a sign-in before it runs out (2026-11-25). The same file sits in both workers (account-health and
 * profit); test-clients.mjs checks they match.
 *
 * One settings row, `accessCuts` = { after: { email: ms }, removed: [email] }:
 *   - after: a session that started before this time no longer counts (set on sign out and on removal);
 *   - removed: people the owner took off the team; checked before the email-domain rule.
 * Read at most once per 30 seconds per worker instance. If the read fails, nothing is cut, which is how
 * sign-in behaved before this existed: a storage hiccup must never lock the team out. */

export const SESSION_DAYS = 7;
/* Sessions made before 2026-11-25 carry no start time and lasted 30 days, so their start is exp - 30 days. */
export const OLD_SESSION_DAYS = 30;
const KEY = 'accessCuts';
const TTL = 30e3;
const EMPTY = Object.freeze({ after: Object.freeze({}), removed: Object.freeze([]) });
let CACHE = new WeakMap();   // per database binding; a write empties it, so a wrapped binding never keeps an old answer

const lc = e => String(e || '').trim().toLowerCase();
function norm(raw) {
  let v = null;
  try { v = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { v = null; }
  if (!v || typeof v !== 'object') return { after: {}, removed: [] };
  const after = {};
  for (const [k, t] of Object.entries(v.after && typeof v.after === 'object' ? v.after : {})) if (Number.isFinite(+t)) after[lc(k)] = +t;
  return { after, removed: Array.isArray(v.removed) ? v.removed.map(lc).filter(Boolean) : [] };
}

/** When a session began: its own start time when it has one, else its expiry less the old 30-day life. */
export function sessionStart(exp, iat) {
  return Number.isFinite(+iat) && +iat > 0 ? +iat : +exp - OLD_SESSION_DAYS * 86400e3;
}

/** The current cuts (cached). Never throws: on a read error it answers "nothing cut". */
export async function accessCuts(env) {
  const db = env && env.DB;
  if (!db) return EMPTY;
  const hit = CACHE.get(db);
  if (hit && hit.until > Date.now()) return hit.v;
  try {
    const row = await db.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(KEY).first();
    const v = norm(row?.value);
    CACHE.set(db, { v, until: Date.now() + TTL });
    return v;
  } catch { return EMPTY; }
}

/** True when this person's sessions that began at `start` were ended (signed out or removed since). */
export async function sessionEnded(env, email, start) {
  const t = (await accessCuts(env)).after[lc(email)];
  return !!t && !(+start > t);   // a session from the same millisecond as the sign out is ended too
}

/** True when the owner removed this person from the team. */
export async function isRemoved(env, email) {
  return (await accessCuts(env)).removed.includes(lc(email));
}

/** End every session this person has right now. remove: true = also take them off the team, false = put them
 *  back, undefined = leave as is. Reads the row fresh and throws when it cannot (never writes over a list it
 *  could not read). */
export async function endSessions(env, email, { remove } = {}) {
  const e = lc(email);
  if (!e || !env?.DB) return null;
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(KEY).first();
  const v = norm(row?.value);
  const now = Date.now();
  /* A stamp older than the longest session life can no longer stop anything. */
  for (const [k, t] of Object.entries(v.after)) if (t < now - OLD_SESSION_DAYS * 86400e3) delete v.after[k];
  if (remove !== false) v.after[e] = now;
  if (remove === true && !v.removed.includes(e)) v.removed.push(e);
  if (remove === false) v.removed = v.removed.filter(x => x !== e);
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(KEY, JSON.stringify(v)).run();
  CACHE = new WeakMap();
  return v;
}
