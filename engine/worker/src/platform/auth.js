/* Who is this. One answer per request, used by every route.
   The old sessions are signed with a key that lives on the old side, so the old account-health worker
   is asked once per session (legacy.who, kept a minute). It says owner, team or client, and for a
   client which brands. View only and a teammate's brand list come from the shared settings table,
   the same two rows the old workers read. */
// from account-health/worker/src/worker.js (roleFor, isAdmin, /api/me) and brandguard.js (brandsFor)
import { who } from './legacy.js';
import { systemJson } from './settings.js';
import { expandIds, brandIdsIn } from './brands.js';
import { lower, isBrandId, isPlainObject } from './text.js';

const KEPT = new Map();           // token -> { caller, until }
const KEEP_MS = 30e3;

export const NOBODY = Object.freeze({ kind: 'nobody', email: null, name: '', view_only: false, brand_ids: [],
  ids: new Set(), client: null, via: 'session', me: null });

export function tokenOf(request) {
  const auth = request.headers.get('Authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

async function clientCaller(env, me, counters) {
  const c = isPlainObject(me.client) ? me.client : {};
  const brand_ids = (Array.isArray(c.brands) ? c.brands : []).map(b => String((b && b.id) || '')).filter(isBrandId);
  return { kind: 'client', email: lower(me.email), name: c.name || '', view_only: c.readOnly === true, brand_ids,
    ids: await expandIds(env, brand_ids, counters),
    client: { name: c.name || null, hq: c.hq === true, read_only: c.readOnly === true }, via: 'session', me };
}

async function teamCaller(env, me, counters) {
  const email = lower(me.email);
  const owner = me.role === 'owner';
  const roles = email ? await systemJson(env, 'userRoles', {}, counters) : {};
  const view_only = lower(isPlainObject(roles) ? roles[email] : '') === 'viewer';
  let brand_ids = null, ids = null;
  if (!owner && email) {
    const map = await systemJson(env, 'userBrands', {}, counters);
    const list = isPlainObject(map) && Array.isArray(map[email]) ? map[email].map(String).filter(Boolean) : [];
    if (list.length) {
      ids = await expandIds(env, list, counters);
      brand_ids = await brandIdsIn(env, list, counters);
    }
  }
  return { kind: owner ? 'owner' : 'team', email: email || null, name: '', view_only, brand_ids, ids, client: null,
    via: me.master === true && !email ? 'master' : 'session', me };
}

/** The caller behind a request. Never throws for a bad or missing session: that is 'nobody'. */
export async function identify(request, env, counters = {}) {
  const token = tokenOf(request);
  if (!token) return NOBODY;
  const hit = KEPT.get(token);
  if (hit && hit.until > Date.now()) return hit.caller;
  const me = await who(env, token);
  if (!me) return NOBODY;
  const caller = me.role === 'client' ? await clientCaller(env, me, counters) : await teamCaller(env, me, counters);
  if (KEPT.size > 500) KEPT.clear();
  KEPT.set(token, { caller, until: Date.now() + KEEP_MS });
  return caller;
}

/** Tests only: forget what was kept. */
export function forget() { KEPT.clear(); }
