/* Check the input against the row's input shape. See CONTRACT.md section 3, rule 4.
   Types: string, int, num, bool, day, brand, id, json, string[]. A '?' makes it optional.
   A query value that is optional and does not parse is left out (the old routes fell back to their
   default in that case). A needed value that is missing or wrong is a 400. */
import { fail } from './errors.js';
import { isDay } from './time.js';
import { safeJson, isPlainObject } from './text.js';

const ALWAYS_OK = new Set(['act', 'act_id']);
const BAD = Symbol('bad');

const READERS = {
  string: v => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : BAD),
  int: v => (/^-?\d+$/.test(String(v)) && typeof v !== 'boolean' ? parseInt(v, 10) : BAD),
  num: v => (v !== '' && typeof v !== 'boolean' && v !== null && Number.isFinite(+v) ? +v : BAD),
  bool: v => (v === true || v === 1 || v === '1' || v === 'true' ? true : v === false || v === 0 || v === '0' || v === 'false' ? false : BAD),
  day: v => (isDay(v) ? String(v) : BAD),
  brand: v => (typeof v === 'string' && v.length <= 200 ? v : BAD),
  id: v => ((typeof v === 'string' || typeof v === 'number') && /^[\w.:%-]{1,200}$/.test(String(v)) ? String(v) : BAD),
  json: v => (typeof v === 'string' ? safeJson(v, BAD) : v === undefined ? BAD : v),
  'string[]': v => {
    const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : null;
    return list && list.every(x => typeof x === 'string' || typeof x === 'number') ? list.map(x => String(x).trim()).filter(Boolean) : BAD;
  },
};

export const INPUT_TYPES = Object.keys(READERS);

/** 'int?' -> { type: 'int', optional: true }. Throws on a type nobody knows (the table build uses this). */
export function parseType(spec) {
  const text = String(spec || '');
  const optional = text.endsWith('?');
  const type = optional ? text.slice(0, -1) : text;
  if (!READERS[type]) throw new Error(`unknown input type ${spec}`);
  return { type, optional };
}

function readQuery(shape, url) {
  const out = {};
  if (!shape) {
    for (const [k, v] of url.searchParams) if (!(k in out)) out[k] = v;
    return out;
  }
  for (const [key, spec] of Object.entries(shape)) {
    const { type, optional } = parseType(spec);
    const raw = type === 'string[]' ? url.searchParams.getAll(key).join(',') : url.searchParams.get(key);
    if (raw == null || raw === '') {
      if (!optional) fail(400, `${key} is needed`, 'input');
      continue;
    }
    const v = READERS[type](raw);
    if (v === BAD) {
      if (!optional) fail(400, `${key} is not right`, 'input');
      continue;
    }
    out[key] = v;
  }
  return out;
}

function readBody(input, body) {
  if (!input || !input.body) return body == null ? null : body;
  if (!isPlainObject(body)) fail(400, 'Send that as JSON.', 'input');
  const shape = input.body;
  const out = {};
  for (const [key, value] of Object.entries(body)) {
    if (key in shape) continue;
    if (ALWAYS_OK.has(key) || input.loose === true) { out[key] = value; continue; }
    fail(400, `${key} is not part of this`, 'input');
  }
  for (const [key, spec] of Object.entries(shape)) {
    const { type, optional } = parseType(spec);
    const raw = body[key];
    if (raw === undefined || raw === null) {
      if (!optional) fail(400, `${key} is needed`, 'input');
      if (raw === null) out[key] = null;
      continue;
    }
    const v = READERS[type](raw);
    if (v === BAD) fail(400, `${key} is not right`, 'input');
    out[key] = v;
  }
  return out;
}

/** The checked input a handler gets: { query, body, params }. */
export function readInput(row, req) {
  const input = row.input || null;
  return { query: readQuery(input && input.query, req.url), body: readBody(input, req.body), params: { ...req.params } };
}
