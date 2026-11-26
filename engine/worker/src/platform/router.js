/* The request path. Always the same eight steps (README.md):
   1 request id, timer, CORS   2 the flag   3 the route table   4 who is this   5 may they do this
   6 check the input   7 run the handler (or forward)   8 filter the answer, add meta, one log line */
import { domains } from '../domains.js';
import { buildTable } from './table.js';
import { identify } from './auth.js';
import { check, filterAnswer, GATED_CODE } from './access.js';
import { door } from './db.js';
import { readInput } from './input.js';
import { read as readFlags } from './flags.js';
import { forward, get as legacyGet, pipe, splitPath } from './legacy.js';
import { json, preflight, passOn, ENGINE_HEADER } from './respond.js';
import { EngineError, isEngineError } from './errors.js';
import { line } from './log.js';
import { stash } from './inner.js';
import { brandsFor } from './brands.js';
import { settingsFor } from './settings.js';
import { isPlainObject } from './text.js';

export { buildTable };

const FORWARD = Symbol('forward');
const FELL_BACK = 'X-Engine-Fell-Back';
const BINARY = /multipart\/form-data|octet-stream|^image\/|^video\/|^audio\//i;
const DATABASES = new Set(['DB', 'CAL']);
let TABLE = null;

/** The one table, built on first use from every group in domains.js. */
export function table() {
  if (!TABLE) TABLE = buildTable(domains);
  return TABLE;
}

/** Tests only: the table plus one more group. null goes back to the real table. */
export function tableWith(extra) {
  TABLE = extra ? buildTable([...domains, extra]) : null;
}

async function readBody(request) {
  if (['GET', 'HEAD'].includes(request.method)) return { raw: null, body: null, body_kind: 'none' };
  const raw = await request.arrayBuffer();
  if (BINARY.test(request.headers.get('Content-Type') || '')) return { raw, body: null, body_kind: 'other' };
  const text = new TextDecoder().decode(raw);
  if (!/^\s*[{[]/.test(text)) return { raw, body: null, body_kind: 'none' };
  try {
    return { raw, body: JSON.parse(text), body_kind: 'json' };
  } catch {
    return { raw, body: null, body_kind: 'none' };   // not JSON after all: treated as no body, as the old guard did
  }
}

function makeCtx(base, row, caller, scope, counters, log, parts) {
  const { request, env, url } = base;
  const who = { domain: row.domain, caller, open: row.access.public === true };
  const ctx = { caller, scope, db: door(env, scope, counters, 'DB', who), log, now: new Date(), request_id: log.id,
    route: row, url, method: request.method,
    other: name => {
      if (!DATABASES.has(name)) throw new Error(`no database called ${name}`);
      return door(env, scope, counters, name, who);
    },
    forward: why => ({ [FORWARD]: why || 'the handler asked' }) };
  ctx.brands = brandsFor(ctx);
  ctx.settings = settingsFor(ctx);
  ctx.legacy = { get: (worker, pathAndQuery, opts) => legacyGet(ctx, worker, pathAndQuery, opts) };
  stash(ctx, { ...parts, request, env, table: table(),
    doorFor: s => door(env, s, counters, 'DB', { domain: 'platform', caller }),
    again: pathAndQuery => again(base, pathAndQuery) });
  return ctx;
}

/* Run one GET again inside the engine as the same person, whatever the flag says. For the compare page. */
async function again(base, pathAndQuery) {
  const url = new URL(pathAndQuery, base.url.origin);
  const request = new Request(url.toString(), { headers: { Authorization: base.request.headers.get('Authorization') || '' } });
  const log = { id: crypto.randomUUID(), method: 'GET', path: url.pathname, inner: true };
  let res;
  try {
    res = await route({ request, env: base.env, exec: base.exec, url }, log, { ignoreFlag: true });
  } catch (e) {
    res = errorAnswer(e, log);
  }
  if (log.fell_back) res.headers.set(FELL_BACK, log.fell_back);   // read by compare, never sent to a browser
  return res;
}

function withMeta(row, out) {
  const wrapped = isPlainObject(out) && 'data' in out && 'meta' in out && Object.keys(out).every(k => k === 'data' || k === 'meta');
  const data = wrapped ? out.data : out;
  const given = wrapped && isPlainObject(out.meta) ? out.meta : {};
  return { data, meta: { engine: 'new', source: given.source || 'database', window: given.window || null,
    as_of: given.as_of || new Date().toISOString() } };
}

async function runHandler(ctx, row, req, at) {
  if (row.handler === 'forward') return passOn(await forward(ctx, row.source.why), 'forward');
  const input = readInput(row, req);
  let out;
  try {
    out = await row.handler(ctx, input);
  } catch (e) {
    /* A ported read that breaks falls back to the old worker for this one request. The log says why and the
       answer is marked "fallback", never "forward", so the compare page counts it as a failure of the new
       code and not as a hand off that was meant. A write never falls back: it may have written already. */
    if (isEngineError(e) || req.method !== 'GET' || !at) throw e;
    ctx.log.fell_back = String(e && e.message).slice(0, 300);
    return passOn(await forward(ctx, 'the engine handler broke'), 'fallback');
  }
  if (out && out[FORWARD]) return passOn(await forward(ctx, out[FORWARD]), 'forward');
  const { data, meta } = withMeta(row, out);
  let answer = filterAnswer(row, ctx.caller, ctx.scope, data);
  if (isPlainObject(answer) && !('meta' in answer)) answer = { ...answer, meta };
  if (isPlainObject(answer) && answer.__deny) return json({ error: answer.error || 'not found' }, answer.__deny, { [ENGINE_HEADER]: 'new' });
  return json(answer, 200, { [ENGINE_HEADER]: 'new' });
}

async function route(base, log, { ignoreFlag = false } = {}) {
  const { request, env, url } = base;
  const at = splitPath(url.pathname);
  const flags = ignoreFlag ? { mode: 'new', forward: new Set() } : await readFlags(env);
  if (at && flags.mode === 'old') {
    log.engine = 'pipe'; log.why = 'mode old';
    return passOn(await pipe(request, env, at.worker), 'pipe');
  }
  const hit = table().match(request.method, url.pathname);
  if (!hit || (at && flags.forward.has(hit.row.key))) {
    if (!at) return json({ error: 'not found' }, 404);
    log.engine = 'pipe'; log.why = hit ? 'route switched back' : 'unlisted';
    return passOn(await pipe(request, env, at.worker), 'pipe');
  }
  const { row, params } = hit;
  log.route = row.key;
  const counters = { db: 0 };
  const { raw, body, body_kind } = await readBody(request);
  const caller = await identify(request, env, counters);
  log.kind = caller.kind;
  const req = { url, method: request.method, params, body, body_kind, env, counters };
  const scope = await check(row, caller, req);
  log.brand = scope.brand || (scope.all ? 'all' : 'mine');
  const ctx = makeCtx(base, row, caller, scope, counters, log, { raw, exec: base.exec });
  const res = await runHandler(ctx, row, req, at);
  log.engine = res.headers.get(ENGINE_HEADER) || 'new';
  log.db = counters.db;
  return res;
}

function errorAnswer(e, log) {
  if (isEngineError(e)) {
    log.refused = e.code || e.message.slice(0, 80);
    /* A brand still held on Get started says so, the way the old brand guard answers it. */
    return json({ error: e.message, ...(e.code === GATED_CODE ? { gated: true } : {}) }, e.status, { [ENGINE_HEADER]: 'new' });
  }
  log.level = 'error';
  log.error = String((e && e.stack) || e).slice(0, 1200);
  return json({ error: 'Something went wrong on our side.' }, 500, { [ENGINE_HEADER]: 'new' });
}

/** The entry point for every request. */
export async function handle(request, env, exec) {
  const started = Date.now();
  if (request.method === 'OPTIONS') return preflight();
  const url = new URL(request.url);
  const log = { id: crypto.randomUUID(), method: request.method, path: url.pathname };
  let res;
  try {
    res = await route({ request, env, exec, url }, log);
  } catch (e) {
    res = errorAnswer(e, log);
  }
  log.status = res.status;
  log.ms = Date.now() - started;
  line(log);
  return res;
}

export { EngineError };
