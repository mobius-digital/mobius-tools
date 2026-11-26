/* Which engine answers. The old engine is the two workers the app has always called. The new engine is
   one worker (engine/worker in the repo) that reads the same database.
     engineMode()      'old' | 'new' | 'compare', kept per browser (config.js ENGINE_DEFAULT when not set)
     tryEngine()       data.js api() asks the new engine first, only in mode 'new' and only for a ported path
     shadow()          mode 'compare': the old answer is shown, the new one is asked behind and checked
     misses()          every call the new engine failed or answered differently, for Agency > Engine
     differences()     where two answers differ (key order and meta do not count)
     engineApi()       one call to the engine's own /v1 routes
   A failed READ on the new engine never reaches a page: data.js asks the old engine and the miss is noted here.
   A WRITE is sent to the old engine only when it is certain the new one did not run it. If it may have run
   (a 5xx, no answer in time, or the old engine already answered through the new one) the page gets that
   failure as it is, so nothing is ever saved twice. */

import { workers, token, SAMPLE, LS5, ENGINE_DEFAULT } from './config.js';
import { PORTED, IGNORE } from './engine-paths.js';

export const MODES = ['old', 'new', 'compare'];
const READ_MS = 12e3, WRITE_MS = 25e3, MISS_MAX = 150;
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

export function engineMode() {
  if (SAMPLE) return 'old';
  const own = ls.get(LS5.engine);
  return MODES.includes(own) ? own : MODES.includes(ENGINE_DEFAULT) ? ENGINE_DEFAULT : 'old';
}
/** Set this browser's choice. null goes back to the default in config.js. */
export function setEngineMode(mode) {
  try { if (MODES.includes(mode)) localStorage.setItem(LS5.engine, mode); else localStorage.removeItem(LS5.engine); } catch {}
}

/* ---------- the ported list ---------- */
/* Routes held back from the engine by hand (engine-paths.js is made by a tool). Empty: the engine forwards
   /ah/api/me/delivery, /ah/api/notices and /ah/api/settings to account-health since 2026-11-26. */
export const HELD = new Set([]);
const LIVE = PORTED.filter(k => !HELD.has(k));
const EXACT = new Set(LIVE.filter(k => !k.includes(':')));
const SHAPES = LIVE.filter(k => k.includes(':')).map(k => {
  const [method, path] = k.split(' ');
  return { key: k, method, re: new RegExp('^' + path.split('/').map(p => (p.startsWith(':') ? '[^/]+' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/') + '$') };
});
const prefix = which => (which === 'ah' ? '/ah' : '/pw');
/** The route key ('GET /pw/api/overview') when the engine answers this call itself, else null. */
export function portedKey(method, which, path) {
  const m = String(method || 'GET').toUpperCase();
  const p = prefix(which) + String(path).split('?')[0].replace(/\/+$/, '');
  if (EXACT.has(m + ' ' + p)) return m + ' ' + p;
  const hit = SHAPES.find(s => s.method === m && s.re.test(p));
  return hit ? hit.key : null;
}
export const portedList = () => LIVE.slice();
export const engineUrl = (which, path) => workers().engine + prefix(which) + path;

/* ---------- misses ---------- */
export function misses() { try { const v = JSON.parse(ls.get(LS5.engineMiss) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
export function clearMisses() { ls.set(LS5.engineMiss, '[]'); }
function recordMiss(m) {
  const all = misses();
  all.unshift({ at: Date.now(), ...m });
  ls.set(LS5.engineMiss, JSON.stringify(all.slice(0, MISS_MAX)));
}

/* ---------- where two answers differ ---------- */
const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'list' : typeof v);
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const short = v => { const t = JSON.stringify(v); return t === undefined ? 'missing' : t.length > 120 ? t.slice(0, 117) + '...' : t; };
/** differences(old, now, ['as_of']) -> [{ at: 'accounts[0].window.sales', old: '12', new: '13' }]. The same rule as
    the engine's own POST /v1/compare: numbers equal to nine places, top level meta left out. */
export function differences(old, now, ignore = [], at = '', out = []) {
  if (out.length > 300) return out;
  const skip = ignore instanceof Set ? ignore : new Set(ignore);
  const diff = () => { out.push({ at: at || '(top)', old: short(old), new: short(now) }); return out; };
  if (typeof old === 'number' && typeof now === 'number') return close(old, now) ? out : diff();
  if (kindOf(old) !== kindOf(now)) return diff();
  if (Array.isArray(old)) {
    if (old.length !== now.length) out.push({ at: at + '.length', old: String(old.length), new: String(now.length) });
    for (let i = 0; i < Math.min(old.length, now.length); i++) differences(old[i], now[i], skip, `${at}[${i}]`, out);
    return out;
  }
  if (isObj(old)) {
    for (const k of new Set([...Object.keys(old), ...Object.keys(now)])) {
      if (skip.has(k) || (at === '' && k === 'meta')) continue;
      const here = at ? at + '.' + k : k;
      if (!(k in old)) out.push({ at: here, old: 'missing', new: short(now[k]) });
      else if (!(k in now)) out.push({ at: here, old: short(old[k]), new: 'missing' });
      else differences(old[k], now[k], skip, here, out);
    }
    return out;
  }
  return old === now ? out : diff();
}
export const ignoreFor = key => IGNORE[key] || [];

/* ---------- asking the new engine ---------- */
/* One fetch with a time limit. The page's own cancel (init.signal) still cancels it. */
async function timed(url, init, ms) {
  const ctl = new AbortController();
  const outer = init.signal;
  const stop = () => ctl.abort();
  if (outer) { if (outer.aborted) ctl.abort(); else outer.addEventListener('abort', stop, { once: true }); }
  const timer = setTimeout(stop, ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); }
  finally { clearTimeout(timer); if (outer) outer.removeEventListener('abort', stop); }
}
const good = j => j !== null && typeof j === 'object';

/* When the new engine is down (three calls in a row not reached, out of time or a 5xx) it is left alone
   for a minute, so a page does not wait on it call after call. One good answer clears the count. */
const REST_MS = 60e3, REST_AFTER = 3;
let downs = 0, restUntil = 0;
const resting = () => Date.now() < restUntil;
function health(up) {
  if (up) { downs = 0; return; }
  if (++downs >= REST_AFTER) { downs = 0; restUntil = Date.now() + REST_MS; }
}

const SAVE_LATE = 'The save did not answer in time. Reload and check before saving again.';

/** For data.js api() only. null: the old engine answers as always. { ok: true, json }: the new engine answered.
    { ok: false, note(oldStatus) }: it failed, ask the old engine, then say how that went so the miss is noted.
    { ok: false, final: true, status, error }: a write that may already have run. Do not ask the old engine.
    A refusal (401, 403) the old engine gives too is not a miss. A page that cancels is thrown on, as fetch does. */
export async function tryEngine(which, path, init) {
  if (engineMode() !== 'new' || resting()) return null;
  const method = String(init.method || 'GET').toUpperCase();
  const key = portedKey(method, which, path);
  if (!key) return null;
  let status = 0, why = '';
  const miss = () => recordMiss({ key, path: prefix(which) + path, kind: 'failed', status, note: why });
  try {
    const res = await timed(engineUrl(which, path), init, method === 'GET' ? READ_MS : WRITE_MS);
    status = res.status;
    health(status < 500);
    const how = res.headers.get('X-Engine') || '';
    const j = await res.json().catch(() => undefined);
    if (res.ok && good(j)) {
      /* The new engine's own handler broke and the old engine answered through it: use the answer, note the miss. */
      if (how === 'fallback') recordMiss({ key, path: prefix(which) + path, kind: 'failed', status, note: 'the new engine handler broke, the old engine answered' });
      /* The engine adds its own meta (who answered, when). The pages were built on the old answers, and a
         stamp that changes every call would make every saved copy look new, so it is left off here. */
      if (j.meta && j.meta.engine && !Array.isArray(j)) delete j.meta;
      return { ok: true, json: j };
    }
    why = res.ok ? 'not a JSON answer' : (j && j.error) || 'HTTP ' + status;
    /* A write is asked of the old engine only after a refusal (4xx) that is not the old engine's own.
       A 5xx or an answer that is not JSON may have written already, and a forwarded or piped answer was
       the old engine speaking: asking it again would run the write a second time. */
    if (method !== 'GET' && (status < 400 || status >= 500 || ['forward', 'pipe', 'fallback'].includes(how))) {
      if (status >= 500 || res.ok) miss();
      return { ok: false, final: true, status, error: (j && j.error) || (res.ok ? 'The save did not answer as expected. Reload and check before saving again.' : 'HTTP ' + status) };
    }
  } catch (e) {
    if (init.signal && init.signal.aborted) throw e;
    health(false);
    const late = !!e && e.name === 'AbortError';
    why = late ? 'no answer in time' : 'could not be reached';
    if (method !== 'GET' && late) { miss(); return { ok: false, final: true, status: 0, error: SAVE_LATE }; }
  }
  return { ok: false, note: oldStatus => {
    if ((status === 401 || status === 403) && oldStatus === status) return;
    miss();
  } };
}

/** For data.js api() only, mode 'compare': the page already has the old answer. Ask the new engine the same
    read behind it and note where the two differ. Never throws, never holds the page. */
export function shadow(which, path, init, oldJson) {
  if (engineMode() !== 'compare') return;
  const method = String(init.method || 'GET').toUpperCase();
  const key = method === 'GET' ? portedKey(method, which, path) : null;
  if (!key) return;
  timed(engineUrl(which, path), { headers: init.headers }, READ_MS).then(async res => {
    const j = await res.json().catch(() => undefined);
    if (!res.ok || !good(j)) return recordMiss({ key, path: prefix(which) + path, kind: 'failed', status: res.status, note: (j && j.error) || 'not a JSON answer' });
    const how = res.headers.get('X-Engine') || '';
    if (how === 'fallback') return recordMiss({ key, path: prefix(which) + path, kind: 'failed', status: res.status, note: 'the new engine handler broke, the old engine answered' });
    if (how === 'forward' || how === 'pipe') return;                // the old engine answered through the new one, as meant
    const d = differences(oldJson, j, ignoreFor(key));
    if (d.length) recordMiss({ key, path: prefix(which) + path, kind: 'differs', status: 200, note: d.length + ' fields', fields: d.slice(0, 8).map(x => x.at) });
  }).catch(() => recordMiss({ key, path: prefix(which) + path, kind: 'failed', status: 0, note: 'could not be reached' }));
}

/** One call to the engine's own routes: engineApi('/v1/health'), engineApi('/v1/engine', { method: 'PUT', body }).
    Throws an Error with .status when the engine says no or cannot be reached. */
export async function engineApi(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await timed(workers().engine + path, { method, signal, body: body == null ? undefined : JSON.stringify(body),
      headers: { Authorization: 'Bearer ' + token(), ...(body != null ? { 'Content-Type': 'application/json' } : {}) } }, READ_MS);
  } catch (e) {
    if (signal && signal.aborted) throw e;
    throw Object.assign(new Error('The new engine could not be reached.'), { status: 0 });
  }
  const j = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error((j && j.error) || 'HTTP ' + res.status), { status: res.status });
  return j;
}
