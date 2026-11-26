/* The route table. Every route is one row (CONTRACT.md section 3). A row that is not complete stops
   the build: it must say who may use it, what it takes, who answers and what it is for. */
import { parseType } from './input.js';
import { OWN_TABLES } from './queries.js';
import { routeKey } from './flags.js';

const METHODS = new Set(['GET', 'PUT', 'POST', 'PATCH', 'DELETE']);
const BRAND_NEEDS = new Set(['need', 'opt', 'none', 'path']);
const ACCESS_DEFAULTS = { team: true, client: false, owner_only: false, public: false, brand: 'opt', fields: null, own: null, scrub: true, filter: true, look_may: false };

function checkAccess(key, access) {
  const bad = why => { throw new Error(`route ${key}: ${why}`); };
  if (!access || typeof access !== 'object') bad('needs access');
  const a = { ...ACCESS_DEFAULTS, ...access };
  if (!BRAND_NEEDS.has(a.brand)) bad('access.brand is need, opt, none or path');
  if (a.fields && !(Array.isArray(a.fields) && a.fields.every(f => typeof f === 'string'))) bad('access.fields is a list of body keys');
  for (const s of a.own || []) {
    const known = OWN_TABLES[s.table];
    if (!known || known[0] !== (s.col || 'act_id') || known[1] !== (s.idcol || 'id')) bad(`access.own names ${s.table}, which is not in platform/queries.js OWN_TABLES`);
    if (!['query', 'body', 'path'].includes(s.in)) bad('access.own needs in: query, body or path');
  }
  if (a.public === true && a.client !== true) a.client = true;   // a public row is open to everyone
  return a;
}

function checkInput(key, input) {
  if (input == null) return null;
  for (const part of ['query', 'body']) {
    for (const spec of Object.values(input[part] || {})) {
      try { parseType(spec); } catch (e) { throw new Error(`route ${key}: ${e.message}`); }
    }
  }
  return { query: input.query || null, body: input.body || null, loose: input.loose === true };
}

function checkSource(key, row, prefix) {
  const bad = why => { throw new Error(`route ${key}: ${why}`); };
  const s = { old: prefix === 'v1' ? null : prefix, file: '', engine: row.handler === 'forward' ? 'forward' : 'new', why: '',
    borrows: [], ...(row.source || {}) };
  s.compare = { ignore: [], ...((row.source && row.source.compare) || {}) };
  if (prefix !== 'v1' && s.old !== prefix) bad(`source.old must be ${prefix}, the path says so`);
  if (!['new', 'forward'].includes(s.engine)) bad('source.engine is new or forward');
  if ((row.handler === 'forward') !== (s.engine === 'forward')) bad('handler forward and source.engine forward go together');
  if (s.engine === 'forward' && !s.why) bad('a forwarded row needs source.why');
  if (prefix !== 'v1' && !s.file) bad('source.file names the old file');
  return s;
}

function makeRow(domain, row) {
  const method = String(row.method || '').toUpperCase();
  const path = String(row.path || '').replace(/\/+$/, '');
  const key = routeKey(method, path);
  const bad = why => { throw new Error(`route ${key}: ${why}`); };
  if (!METHODS.has(method)) bad('unknown method');
  const m = /^\/(pw|ah|v1)\/[^?#]+$/.exec(path);
  if (!m) bad('the path starts with /pw/, /ah/ or /v1/');
  if (m[1] === 'v1' && domain !== 'platform') bad('only the kernel has /v1 routes');
  if (typeof row.doc !== 'string' || row.doc.trim().length < 8) bad('needs a doc line');
  if (row.handler !== 'forward' && typeof row.handler !== 'function') bad('handler is a function or the word forward');
  const parts = path.split('/').slice(1);
  return { method, path, key, domain, doc: row.doc.trim(), handler: row.handler, access: checkAccess(key, row.access),
    input: checkInput(key, row.input), source: checkSource(key, row, m[1]),
    parts: parts.some(p => p.startsWith(':')) ? parts : null };
}

/** domains = [{ name, routes, queries }]. Returns the table the router matches against. */
export function buildTable(domains) {
  const rows = [], exact = new Map(), patterns = [];
  for (const d of domains) {
    for (const raw of d.routes || []) {
      const row = makeRow(d.name, raw);
      if (exact.has(row.key) || patterns.some(p => p.key === row.key)) throw new Error(`route ${row.key}: listed twice`);
      rows.push(row);
      if (row.parts) patterns.push(row); else exact.set(row.key, row);
    }
  }
  const match = (method, pathname) => {
    const path = pathname.replace(/\/+$/, '') || '/';
    const hit = exact.get(routeKey(method, path));
    if (hit) return { row: hit, params: {} };
    const have = path.split('/').slice(1);
    for (const row of patterns) {
      if (row.method !== method || row.parts.length !== have.length) continue;
      const params = {};
      const ok = row.parts.every((p, i) => {
        if (!p.startsWith(':')) return p === have[i];
        try { params[p.slice(1)] = decodeURIComponent(have[i]); } catch { return false; }   // a broken %xx is no match
        return have[i] !== '';
      });
      if (ok) return { row, params };
    }
    return null;
  };
  return { rows, match };
}

/** The row as the generated list and GET /v1/routes show it. No functions. */
export function describe(row) {
  const a = row.access;
  const who = a.public ? 'anyone' : a.owner_only ? 'owner' : [a.team !== false ? 'team' : '', a.client ? 'client' : ''].filter(Boolean).join(', ');
  return { method: row.method, path: row.path, domain: row.domain, doc: row.doc, who, brand: a.brand,
    client_fields: a.fields || null, engine: row.source.engine, why: row.source.why || '', old: row.source.old,
    old_file: row.source.file || '', borrows: row.source.borrows || [], ignore: row.source.compare.ignore || [], input: row.input };
}
