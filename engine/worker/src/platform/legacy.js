/* The only file that knows the old workers exist.
   The engine holds no outside keys, so anything that needs one is sent on to an old worker through a
   service binding, as the same person: the caller's own session goes along, nothing is added to it,
   and the old worker checks access again itself. The day the keys move here, each forward is replaced
   in this one place. */
// from profit/worker/src/worker.js (delegateWho, the PROXY_PATHS pass through)
import { fail } from './errors.js';
import { inner } from './inner.js';
import { swallowed } from './log.js';

const WORKERS = { ah: { bind: 'OLD_AH', origin: 'OLD_AH_ORIGIN' }, pw: { bind: 'OLD_PW', origin: 'OLD_PW_ORIGIN' } };
const WHO = new Map();            // token -> { me, until }
const GOT = new Map();            // token + path -> { data, until }
const WHO_MS = 60e3;
const KEEP_MAX = 500;
const DROP = ['host', 'content-length', 'cf-connecting-ip', 'cf-ray', 'x-forwarded-for', 'x-real-ip'];

function old(env, worker) {
  const w = WORKERS[worker];
  if (!w) throw new Error(`unknown old worker ${worker}`);
  const binding = env[w.bind];
  if (!binding || typeof binding.fetch !== 'function') fail(502, 'The old engine is not connected.', 'no_old_worker');
  return { binding, origin: String(env[w.origin] || 'https://old.invalid').replace(/\/+$/, '') };
}

/** '/pw/api/x' -> { worker: 'pw', path: '/api/x' }. null when the path has no old worker. */
export function splitPath(pathname) {
  const m = /^\/(pw|ah)(\/.*)?$/.exec(pathname);
  return m ? { worker: m[1], path: m[2] || '/' } : null;
}

function headersFor(request) {
  const h = new Headers(request.headers);
  for (const k of DROP) h.delete(k);
  return h;
}

const bearer = request => {
  const auth = request.headers.get('Authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
};

/** The old /api/me answer for a session. null when the old side does not know it.
 *  fresh: ask now, whatever is kept (the old account-health worker checked on every request).
 *  Not fresh: an answer is kept one minute, never past the session's own end, as the old profit worker did.
 *  A failure is never kept, and it drops what was kept.
 *  again(me): a kept answer it says yes to is asked again now (a login held on Get started), so a miss asks once. */
export async function who(env, token, { fresh = false, again = null } = {}) {
  if (!token || token.length < 8) return null;
  const hit = WHO.get(token);
  if (!fresh && hit && hit.until > Date.now() && !(again && again(hit.me))) return hit.me;
  WHO.delete(token);
  const { binding, origin } = old(env, 'ah');
  let res;
  try {
    res = await binding.fetch(new Request(`${origin}/api/me`, { headers: { Authorization: `Bearer ${token}` } }));
  } catch (e) {
    swallowed('the old sign in check did not answer, so the caller is treated as nobody', e);
    return null;
  }
  if (!res.ok) return null;
  const me = await res.json().catch(() => null);
  if (!me || !(me.email || me.master)) return null;
  if (WHO.size > KEEP_MAX) WHO.clear();
  WHO.set(token, { me, until: Math.min(Date.now() + WHO_MS, Number(me.exp) || Infinity) });
  return me;
}

/** The same request, as the same person, to the row's old worker. The answer comes back unchanged. */
export async function forward(ctx, why) {
  const { request, env, raw } = inner(ctx);
  const at = splitPath(ctx.url.pathname);
  const worker = (ctx.route.source && ctx.route.source.old) || (at && at.worker);
  if (!at || !worker) fail(500, 'This path has no old worker to go to.', 'no_forward_target');
  const { binding, origin } = old(env, worker);
  const init = { method: request.method, headers: headersFor(request) };
  if (raw && !['GET', 'HEAD'].includes(request.method)) init.body = raw;
  ctx.log.forwarded = why || 'forwarded';
  return binding.fetch(new Request(`${origin}${at.path}${ctx.url.search}`, init));
}

/** One old GET as the caller. For a field the engine cannot know (CONTRACT section 7.4). */
export async function get(ctx, worker, pathAndQuery, { cache_s = 0 } = {}) {
  const { request, env } = inner(ctx);
  const token = bearer(request);
  const key = `${token}|${worker}|${pathAndQuery}`;
  const hit = cache_s > 0 ? GOT.get(key) : null;
  if (hit && hit.until > Date.now()) return hit.data;
  const { binding, origin } = old(env, worker);
  const path = String(pathAndQuery).startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
  const res = await binding.fetch(new Request(`${origin}${path}`, { headers: { Authorization: `Bearer ${token}` } }));
  const data = await res.json().catch(() => null);
  if (!res.ok) fail(res.status, (data && data.error) || 'The old engine could not answer.', 'old_get_failed');
  ctx.log.borrowed = (ctx.log.borrowed || 0) + 1;
  if (cache_s > 0) {
    if (GOT.size > KEEP_MAX) GOT.clear();
    GOT.set(key, { data, until: Date.now() + cache_s * 1000 });
  }
  return data;
}

/** The whole request, untouched, to an old worker. Router only: mode "old" and a path with no row. */
export async function pipe(request, env, worker, raw = null) {
  const url = new URL(request.url);
  const at = splitPath(url.pathname);
  if (!at) fail(404, 'not found');
  const { binding, origin } = old(env, worker || at.worker);
  const init = { method: request.method, headers: headersFor(request), redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = raw || request.body;
  if (init.body && !raw) init.duplex = 'half';
  return binding.fetch(new Request(`${origin}${at.path}${url.search}`, init));
}

/** Tests only: forget what was kept. */
export function forget() { WHO.clear(); GOT.clear(); }
