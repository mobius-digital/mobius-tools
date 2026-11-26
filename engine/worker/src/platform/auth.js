/* Who is this. Worked out again on every request, so a login that was removed or narrowed loses its
   access on the next call. Nothing about a person is kept here.
   The old sessions are signed with a key that lives on the old side, so the old account-health worker
   is asked (legacy.who): on every request for its own paths and the engine's, and at most once a
   minute for the profit worker's paths, which is what the old profit worker did. It says owner, team
   or client. View only, a teammate's brand list and a client's brands are read from the shared
   settings table on every request, the same three rows the old workers read. */
// from account-health/worker/src/worker.js (roleFor, isAdmin, /api/me) and brandguard.js (brandsFor, clientOf)
import { who } from './legacy.js';
import { systemJson } from './settings.js';
import { expandIds, brandIdsIn } from './brands.js';
import { lower, isBrandId, isPlainObject } from './text.js';

export const NOBODY = Object.freeze({ kind: 'nobody', email: null, name: '', view_only: false, brand_ids: [],
  ids: new Set(), client: null, via: 'session', me: null });

export function tokenOf(request) {
  const auth = request.headers.get('Authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

/* A client's brands are the ones the old side named that the client list still holds for that email.
   A login taken off the list, or one whose pass ran out (hq_until), is nobody. A login the old side
   pins to one brand (hq) keeps that brand while its row is there, and its read only switch is read now. */
async function clientCaller(env, me, counters) {
  const c = isPlainObject(me.client) ? me.client : {};
  const email = lower(me.email);
  const users = email ? await systemJson(env, 'clientUsers', {}, counters) : {};
  const row = isPlainObject(users) ? users[email] : null;
  if (!isPlainObject(row)) return NOBODY;
  const hq = c.hq === true && row.hq === true;
  if (hq && row.hq_until && !(Number(row.hq_until) > Date.now())) return NOBODY;
  const listed = new Set((Array.isArray(row.brands) ? row.brands : []).map(String));
  const brand_ids = (Array.isArray(c.brands) ? c.brands : []).map(b => String((b && b.id) || '')).filter(isBrandId)
    .filter(id => hq || listed.has(id));
  if (!brand_ids.length) return NOBODY;
  /* Look and approve (the old clients.js readOnly): any login can have it now, not only a pinned one.
     A pinned (hq) login reads only; any other one may still approve, comment and use its own bell. */
  const read_only = row.readOnly === true || (hq && c.readOnly === true);
  return { kind: 'client', email, name: c.name || '', view_only: read_only, brand_ids,
    ids: await expandIds(env, brand_ids, counters),
    client: { name: c.name || null, hq, read_only }, via: 'session', me };
}

async function teamCaller(env, me, counters) {
  const email = lower(me.email);
  const owner = me.role === 'owner';
  /* Taken off on the Team screen (settings.removedEmails): nobody from the next request on, even on the
     agency's own domain, as the old emailAllowed now says. The owner is never on it. */
  if (email && !owner) {
    const removed = await systemJson(env, 'removedEmails', [], counters);
    if (Array.isArray(removed) && removed.some(x => lower(x) === email)) return NOBODY;
  }
  const roles = email ? await systemJson(env, 'userRoles', {}, counters) : {};
  /* The owner is never view only, so a bad role on his row can never lock him out of every write. */
  const view_only = !owner && lower(isPlainObject(roles) ? roles[email] : '') === 'viewer';
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
  const fresh = !new URL(request.url).pathname.startsWith('/pw/');
  const me = await who(env, token, { fresh });
  if (!me) return NOBODY;
  return me.role === 'client' ? clientCaller(env, me, counters) : teamCaller(env, me, counters);
}
