/* The data door. The only file that talks to the database.
   A group lists its statements by name in queries.js. This file fills in the brand filter from the
   access result (the scope), never from what the caller sent. See CONTRACT.md section 6. */
import { fail } from './errors.js';

const REG = new Map();            // '<domain>.<query>' -> entry
const BUDGET = 40;                // statements per request
const MAX_VALUES = 100;           // the database refuses more bound values in one statement
const TOKEN = /'(?:[^']|'')*'|\{\{([a-z_]+)(?::([A-Za-z0-9_.]+))?\}\}|(?<![:\w]):([A-Za-z_][A-Za-z0-9_]*)/g;
const BRAND_MACROS = new Set(['brand', 'brands', 'brand_id']);
const KNOWN_MACROS = new Set(['brand', 'brands', 'brand_id', 'pick']);
const WRITE_WORD = /^\s*(insert|update|delete|replace)\b/i;
const SHAPE_WORD = /^\s*(create|alter|drop|pragma|attach|vacuum)\b/i;

function macrosOf(sql) {
  const found = [];
  for (const m of sql.matchAll(TOKEN)) if (m[1]) found.push({ kind: m[1], arg: m[2] || '' });
  return found;
}

function checkEntry(name, q) {
  const bad = why => { throw new Error(`query ${name}: ${why}`); };
  if (!q || typeof q.sql !== 'string' || !q.sql.trim()) bad('needs sql');
  if (!['brand', 'brands', 'none'].includes(q.scope)) bad('scope must be brand, brands or none');
  if (SHAPE_WORD.test(q.sql)) bad('the engine never changes a table');
  const isWrite = WRITE_WORD.test(q.sql);
  if (isWrite && q.write !== true) bad('a write must be marked write: true');
  if (!isWrite && q.write === true) bad('marked write but it does not write');
  const macros = macrosOf(q.sql);
  for (const m of macros) {
    if (!KNOWN_MACROS.has(m.kind)) bad(`unknown macro ${m.kind}`);
    if (m.kind === 'pick' && !(q.pick && q.pick[m.arg] && Object.keys(q.pick[m.arg]).length)) bad(`pick map ${m.arg} is missing`);
    if ((m.kind === 'brand' || m.kind === 'brands') && !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(m.arg)) bad('the brand macro needs a column');
  }
  const scoped = macros.some(m => BRAND_MACROS.has(m.kind));
  if (q.scope === 'none' && !q.why) bad('scope none needs a why');
  if (q.scope !== 'none' && !scoped) bad('no brand macro. Add one, or say scope none with a why');
}

/** Called by domains.js for each group, and by the kernel for its own statements. */
export function register(domain, queries) {
  if (!/^[a-z]+$/.test(domain)) throw new Error(`bad domain name ${domain}`);
  for (const [key, q] of Object.entries(queries || {})) {
    const name = `${domain}.${key}`;
    checkEntry(name, q);
    REG.set(name, { ...q, name, domain, binds_email: /(?<![:\w]):email\b/.test(q.sql) });
  }
}

/** Every registered statement, for the generated list. */
export function registered() {
  return [...REG.values()].map(q => ({ name: q.name, domain: q.domain, scope: q.scope, write: q.write === true,
    why: q.why || '', sql: q.sql.replace(/\s+/g, ' ').trim() }));
}

function marks(list, values) {
  if (!list.length) return 'NULL';
  for (const v of list) values.push(v);
  return list.map(() => '?').join(', ');
}

function brandSql(kind, col, scope, values) {
  const ids = scope.ids || [];
  if (kind === 'brand') {
    if (!scope.brand) fail(400, 'Pick a brand first.', 'brand_needed');
    return `${col} IN (${marks(ids.length ? ids : [scope.brand], values)})`;
  }
  if (scope.brand) return `${col} IN (${marks(ids.length ? ids : [scope.brand], values)})`;
  if (scope.all === true) return '1=1';
  return ids.length ? `${col} IN (${marks(ids, values)})` : '1=0';
}

function plain(v) {
  if (v === null || typeof v === 'string' || typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  throw new Error('a statement value must be text, a number, true, false or null');
}

function valueOf(q, key, params, values) {
  if (!params || !(key in params) || params[key] === undefined) throw new Error(`query ${q.name}: no value for :${key}`);
  const v = params[key];
  if (Array.isArray(v)) return marks(v.map(plain), values);
  values.push(plain(v));
  return '?';
}

/** Turn a named entry into SQL text and its values. Exported for tests. */
export function compile(q, scope, params) {
  const values = [];
  const sql = q.sql.replace(TOKEN, (all, macro, arg, key) => {
    if (key) return valueOf(q, key, params, values);
    if (!macro) return all;                               // a quoted string, left alone
    if (macro === 'brand_id') {
      if (!scope.brand) fail(400, 'Pick a brand first.', 'brand_needed');
      values.push(scope.brand);
      return '?';
    }
    if (macro === 'pick') {
      const map = q.pick[arg];
      const want = params && params[arg] != null ? String(params[arg]) : Object.keys(map)[0];
      if (!Object.prototype.hasOwnProperty.call(map, want)) fail(400, `unknown ${arg}`, 'bad_pick');
      return map[want];
    }
    return brandSql(macro, arg, scope, values);
  });
  if (values.length > MAX_VALUES) fail(400, 'That asks for too many things at once.', 'too_many_values');
  return { sql, values };
}

function allowed(q, who, params) {
  if (q.domain !== 'platform' && q.domain !== who.domain) throw new Error(`${who.domain} may not run ${q.name}`);
  if (who.system === true) {
    if (who.domain !== 'platform') throw new Error('only the kernel has a system door');
    return;
  }
  const caller = who.caller;
  if (!caller || caller.kind === 'nobody') {
    if (q.write === true || q.scope !== 'none' || who.open !== true) fail(401, 'unauthorized');
    return;
  }
  /* A statement held to the caller's own row by :email (their prefs, their bell, their delivery). */
  const mine = q.scope === 'none' && q.binds_email && params && typeof params.email === 'string' && !!caller.email && params.email === caller.email;
  /* View only writes nothing but its own rows, which the route check already limited to the old allow list. */
  if (q.write === true && caller.view_only === true && !mine) fail(403, 'Your account has view only access, so this cannot be changed.', 'view_only');
  if (q.scope === 'none' && caller.kind === 'client' && !mine) fail(403, 'That is not open to your login.', 'client_scope_none');
}

/** The door for one request. `who` = { domain, caller } for a handler, SYSTEM for the kernel's own
 *  reads before a caller is known. A handler never calls this: it gets ctx.db. */
export function door(env, scope, counters, which = 'DB', who = {}) {
  const base = env[which];
  const prep = (name, params) => {
    const q = REG.get(name);
    if (!q) throw new Error(`unknown query ${name}`);
    if (!base) throw new Error(`no database bound as ${which}`);
    allowed(q, who, params);
    counters.db = (counters.db || 0) + 1;
    if (counters.db > BUDGET) fail(500, 'This request asked the database too many times.', 'db_budget');
    const { sql, values } = compile(q, scope, params || {});
    return { q, stmt: base.prepare(sql).bind(...values) };
  };
  const wrote = r => ({ changes: r?.meta?.changes ?? 0, last_row_id: r?.meta?.last_row_id ?? null });
  return {
    async all(name, params) { return (await prep(name, params).stmt.all()).results || []; },
    async one(name, params) { return (await prep(name, params).stmt.first()) || null; },
    async run(name, params) { return wrote(await prep(name, params).stmt.run()); },
    async batch(list) {
      if (!list.length) return [];
      const made = list.map(([name, params]) => prep(name, params));
      const out = await base.batch(made.map(m => m.stmt));
      return out.map((r, i) => (made[i].q.write === true ? wrote(r) : r.results || []));
    },
  };
}

/** A scope that covers every brand the caller has, with no brand named. Kernel use. */
export function scopeOfCaller(caller) {
  const ids = caller && caller.ids ? [...caller.ids] : [];
  return { all: !!caller && caller.brand_ids === null, brand: null, ids, brand_ids: caller ? caller.brand_ids : [] };
}

export const SYSTEM = { domain: 'platform', system: true };
export const SYSTEM_SCOPE = { all: true, brand: null, ids: [], brand_ids: null };
