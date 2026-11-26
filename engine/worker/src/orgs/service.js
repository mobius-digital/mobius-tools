/* Who you are and the people of the agency: the signed in person, their own preferences, the team list
   and the client logins. All of it lives in the old settings table. */
// from account-health/worker/src/worker.js (/api/me, /api/team), prefs.js and clients.js (GET /api/clients)
import { fail } from '../platform/errors.js';
import { safeJson, isPlainObject } from '../platform/text.js';

const KEEP_MS = 7 * 86400e3;      // a snooze or a done is dropped a week after it ran out
const MONTH_MS = 30 * 86400e3;
const DAY_MS = 86400e3;
const NUDGE_STATES = ['snoozed', 'done'];
/* The four old client switches. Always on. Kept in the answer for screens that still read them. */
// from account-health/worker/src/brandguard.js (CLIENT_SWITCHES)
const CLIENT_SWITCHES = { pl: true, strategist: true, changes: true, creators: true };

/** Several settings rows in one statement: { key: value text }. A missing key is left out. */
export async function settingsOf(ctx, keys) {
  const rows = await ctx.db.all('orgs.settingsMany', { keys });
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

const objectOf = text => { const v = safeJson(text, {}); return isPlainObject(v) ? v : {}; };
const listOf = text => { const v = safeJson(text, []); return Array.isArray(v) ? v : []; };

/** GET /api/me. The old answer, already asked once by the sign in check. */
export async function me(ctx) {
  return { ...ctx.caller.me };
}

/* ---- the person's own preferences ---- */

/* The settings row of this person. A sign in with the agency key has no email and uses the old name for it. */
function person(ctx) {
  const key = ctx.caller.email || (ctx.caller.via === 'master' ? 'admin' : '');
  if (!key) fail(401, 'sign in first');
  return { key, shown: (ctx.caller.me && ctx.caller.me.email) || key };
}

function cleanPrefs(p, now) {
  const out = { morning_dm: !!(p && p.morning_dm), nudge: {}, home_tiles: Array.isArray(p && p.home_tiles) ? [...new Set(p.home_tiles.filter(id => typeof id === 'string' && /^[a-z0-9_.:-]{1,40}$/i.test(id)))].slice(0, 16) : [] };
  for (const [k, v] of Object.entries((isPlainObject(p) && isPlainObject(p.nudge) && p.nudge) || {})) {
    if (!v || !NUDGE_STATES.includes(v.state) || !(+v.until > now - KEEP_MS)) continue;
    out.nudge[k] = { state: v.state, until: +v.until };
  }
  return out;
}

async function prefsFor(ctx, key, now) {
  const row = await ctx.db.one('orgs.prefsGet', { email: key });
  return cleanPrefs(safeJson(row && row.value, null), now);
}

/** GET /api/me/prefs -> { email, prefs }. */
export async function readPrefs(ctx) {
  const who = person(ctx);
  return { email: who.shown, prefs: await prefsFor(ctx, who.key, Date.now()) };
}

/* One nudge entry of the patch, merged into the stored ones. A state of null takes the entry away. */
function mergeNudge(nudge, k, v, now) {
  if (k.length > 200) return;
  if (!v || v.state == null) { delete nudge[k]; return; }
  if (!NUDGE_STATES.includes(v.state)) return;
  const until = +v.until > now ? Math.min(+v.until, now + MONTH_MS) : now + (v.state === 'snoozed' ? DAY_MS : KEEP_MS);
  nudge[k] = { state: v.state, until };
}

/** PUT /api/me/prefs { morning_dm?, nudge? } -> { ok, email, prefs }. Writes the person's one row. */
export async function savePrefs(ctx, input) {
  const who = person(ctx);
  const patch = input.body;
  if (patch === null || patch === undefined) fail(400, 'bad json');
  const now = Date.now();
  const cur = await prefsFor(ctx, who.key, now);
  if (isPlainObject(patch) && 'morning_dm' in patch) cur.morning_dm = !!patch.morning_dm;
  if (isPlainObject(patch) && Array.isArray(patch.home_tiles)) cur.home_tiles = patch.home_tiles;
  if (isPlainObject(patch) && isPlainObject(patch.nudge)) {
    for (const [k, v] of Object.entries(patch.nudge)) mergeNudge(cur.nudge, k, v, now);
  }
  const prefs = cleanPrefs(cur, now);
  await ctx.db.run('orgs.prefsPut', { email: who.key, value: JSON.stringify(prefs) });
  return { ok: true, email: who.shown, prefs };
}

/* ---- the team ---- */

/** GET /api/team -> { domain, you, owner, can_set_brands, safe_remove, needs_brands_for_guests, members }.
 *  The agency's own domain and the owner's email are fixed on the old side, so those two fields are borrowed
 *  from it. A person taken off (settings.removedEmails) stays on the list marked removed, never the owner. */
export async function team(ctx) {
  const set = await settingsOf(ctx, ['allowedEmails', 'userRoles', 'userBrands', 'removedEmails']);
  const extra = listOf(set.allowedEmails).map(e => String(e).toLowerCase());
  const roles = objectOf(set.userRoles);
  const brands = objectOf(set.userBrands);
  const removed = listOf(set.removedEmails).map(e => String(e).toLowerCase());
  const emails = [...new Set([...extra, ...Object.keys(roles).map(e => e.toLowerCase()),
    ...Object.keys(brands).map(e => e.toLowerCase()), ...removed])].sort();
  const old = (await ctx.legacy.get('ah', '/api/team', { cache_s: 300 })) || {};
  const owner = old.owner ?? null;
  return {
    domain: old.domain ?? null, you: (ctx.caller.me && ctx.caller.me.email) || null, owner,
    can_set_brands: ctx.caller.kind === 'owner',
    /* Tells the Team screen this server removes safely and asks brands for a new guest (the old side does too). */
    safe_remove: true, needs_brands_for_guests: true,
    members: emails.map(e => ({ email: e, role: roles[e] === 'viewer' ? 'viewer' : 'admin', guest: extra.includes(e),
      brands: Array.isArray(brands[e]) ? brands[e] : [],
      ...(removed.includes(e) && e !== String(owner || '').toLowerCase() ? { removed: true } : {}) })),
  };
}

/* ---- the client logins ---- */

async function namesOf(ctx, ids) {
  const names = {};
  for (let i = 0; i < ids.length; i += 90) {
    for (const r of await ctx.db.all('orgs.brandNames', { ids: ids.slice(i, i + 90) })) names[r.id] = r.name;
  }
  return names;
}

const loginRow = (email, u, shown, names) => ({ email, name: u.name || null,
  brands: shown.map(b => ({ id: b, name: names[b] || b })),
  invited_at: u.invited_at || null, invited_by: u.invited_by || null, last_invite: u.last_invite || null,
  last_sign_in: u.last_sign_in || null, last_seen: u.last_seen || null, invited_as: u.invited_as || null,
  read_only: u.readOnly === true });

/** GET /api/clients?act= -> { clients, access, switches, can_edit, locus }. A teammate with a brand list
 *  sees only the logins of those brands, and only those brands on each login. The app's own address is
 *  fixed on the old side, so `locus` is borrowed from it. */
export async function clients(ctx, input) {
  const act = input.query.act || '';
  const only = ctx.caller.ids || null;
  const users = objectOf((await settingsOf(ctx, ['clientUsers'])).clientUsers);
  const seen = Object.entries(users).filter(([, u]) => isPlainObject(u))
    .map(([email, u]) => [email, u, (Array.isArray(u.brands) ? u.brands : []).filter(b => typeof b === 'string' && (!only || only.has(b)))]);
  const names = await namesOf(ctx, [...new Set(seen.flatMap(([, , shown]) => shown))]);
  const rows = seen.map(([email, u, shown]) => loginRow(email, u, shown, names))
    .filter(r => r.brands.length && (!act || act === 'all' || r.brands.some(b => b.id === act)))
    .sort((a, b) => a.email.localeCompare(b.email));
  const old = (await ctx.legacy.get('ah', '/api/clients', { cache_s: 300 })) || {};
  return { clients: rows, access: act && act !== 'all' ? { [act]: { ...CLIENT_SWITCHES } } : {}, switches: [],
    can_edit: ctx.caller.kind === 'owner', locus: old.locus ?? null };
}
