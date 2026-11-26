/* Proof without waiting. Both engines read the same database, so the same question can be asked of
   both at the same moment. POST /v1/compare runs one read route both ways for the signed in person
   and answers match, or the list of differences. */
import { fail, isEngineError } from './errors.js';
import { inner } from './inner.js';
import { get as legacyGet, splitPath } from './legacy.js';
import { ENGINE_HEADER } from './respond.js';
import { isPlainObject } from './text.js';

const MAX_SHOWN = 50;

const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'list' : typeof v);
const short = v => {
  const text = JSON.stringify(v);
  return text === undefined ? 'missing' : text.length > 160 ? `${text.slice(0, 157)}...` : text;
};

/** Every place two answers differ. `ignore` holds key names that change by the second. */
export function differences(old, now, ignore = new Set(), at = '', out = []) {
  if (out.length > 500) return out;
  if (typeof old === 'number' && typeof now === 'number') {
    if (!close(old, now)) out.push({ at: at || '(top)', old: short(old), new: short(now) });
    return out;
  }
  if (kindOf(old) !== kindOf(now)) {
    out.push({ at: at || '(top)', old: short(old), new: short(now) });
    return out;
  }
  if (Array.isArray(old)) {
    if (old.length !== now.length) out.push({ at: `${at}.length`, old: String(old.length), new: String(now.length) });
    for (let i = 0; i < Math.min(old.length, now.length); i++) differences(old[i], now[i], ignore, `${at}[${i}]`, out);
    return out;
  }
  if (isPlainObject(old)) {
    for (const k of new Set([...Object.keys(old), ...Object.keys(now)])) {
      if (ignore.has(k) || (at === '' && k === 'meta')) continue;
      const here = at ? `${at}.${k}` : k;
      if (!(k in old)) out.push({ at: here, old: 'missing', new: short(now[k]) });
      else if (!(k in now)) out.push({ at: here, old: short(old[k]), new: 'missing' });
      else differences(old[k], now[k], ignore, here, out);
    }
    return out;
  }
  if (old !== now) out.push({ at: at || '(top)', old: short(old), new: short(now) });
  return out;
}

async function askOld(ctx, worker, pathAndQuery) {
  const started = Date.now();
  try {
    const data = await legacyGet(ctx, worker, pathAndQuery);
    return { status: 200, data, ms: Date.now() - started };
  } catch (e) {
    if (!isEngineError(e)) throw e;
    return { status: e.status, data: { error: e.message }, ms: Date.now() - started };
  }
}

/** The handler of POST /v1/compare. Body: { path: '/pw/api/costs?act=...' }. Reads only. */
export async function compare(ctx, input) {
  const target = new URL(String(input.body.path || ''), 'https://engine.invalid');
  const at = splitPath(target.pathname);
  if (!at) fail(400, 'path starts with /pw/ or /ah/', 'input');
  const hit = inner(ctx).table.match('GET', target.pathname);
  if (!hit) fail(404, 'That path is not in the route table.');
  const base = { route: hit.row.key, engine: hit.row.source.engine };
  if (hit.row.source.engine === 'forward') return { ...base, match: true, note: 'forwarded: the old engine answers this one', differences: [], more: 0 };
  const started = Date.now();
  const mine = await inner(ctx).again(target.pathname + target.search);
  const ms_new = Date.now() - started;
  const now = await mine.json().catch(() => null);
  const how = mine.headers.get(ENGINE_HEADER) || 'new';
  if (how === 'fallback') {
    return { ...base, engine: how, match: false, differences: [], more: 0,
      note: `the new engine handler broke and the old engine answered: ${mine.headers.get('X-Engine-Fell-Back') || 'no reason given'}` };
  }
  if (how !== 'new') return { ...base, engine: how, match: true, note: 'this request was forwarded by the handler', differences: [], more: 0 };
  const old = await askOld(ctx, at.worker, at.path + target.search);
  const diffs = differences(old.data, now, new Set(hit.row.source.compare.ignore || []));
  if (old.status !== mine.status) diffs.unshift({ at: '(status)', old: String(old.status), new: String(mine.status) });
  return { ...base, match: diffs.length === 0, old_status: old.status, new_status: mine.status, ms_old: old.ms, ms_new,
    differences: diffs.slice(0, MAX_SHOWN), more: Math.max(0, diffs.length - MAX_SHOWN) };
}
