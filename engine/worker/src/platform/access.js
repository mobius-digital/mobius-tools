/* May they do this. One place for every route.
   Rules, carried over from the old brand guard:
   nobody is refused unless the row is public. The owner may do everything. A teammate may do what the
   row allows the team, a view only teammate may only read, a teammate with a brand list only reaches
   those brands. A client is closed by default: the row must say client: true, the brand must be theirs,
   "all" is refused, a record named by id must be theirs, and a write may carry only the listed fields. */
// from account-health/worker/src/brandguard.js (guardClient, guardBrands, recordsOwned)
// The refusal sentences are the old ones with the agency and people names taken out.
import { fail } from './errors.js';
import { door, SYSTEM, SYSTEM_SCOPE } from './db.js';
import { OWN_TABLES, ownQueryName } from './queries.js';
import { resolveBrandId, expandIds } from './brands.js';
import { filterBrands, scrub } from './scrub.js';
import { isPlainObject } from './text.js';

export const WORDS = {
  nobody: 'unauthorized',
  client_no: 'Your login has everything about your own brand. That part runs the agency itself, so it is for the agency team. Ask us if you need it.',
  client_brand: 'You do not have access to that brand.',
  client_pick: 'Pick your brand first.',
  client_own: 'That belongs to another brand.',
  client_json: 'Send that as JSON.',
  client_read: 'You can read here. Changing things is switched off for your login.',
  team_brand: 'You do not have access to that brand. Ask the owner to add it to your brands (Settings > Team).',
  viewer: 'Your account has view-only access, so this cannot be changed. Ask an admin on your team.',
  owner: 'Only the owner can do that.',
  team_no: 'That is not open to the team.',
};

const READS = new Set(['GET', 'HEAD']);
const present = v => v !== undefined && v !== null && v !== '';
const dig = (o, key) => String(key || 'id').split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);

/** Every record the request names by id belongs to one of the caller's brands, or does not exist yet. */
async function recordsOwned(specs, req, allowed) {
  const db = door(req.env, SYSTEM_SCOPE, req.counters, 'DB', SYSTEM);
  for (const s of specs) {
    const raw = s.in === 'path' ? req.params[s.key || 'id'] : s.in === 'query' ? req.url.searchParams.get(s.key || 'id') : dig(req.body, s.key);
    if (raw == null || raw === '') continue;
    if (typeof raw !== 'string' || raw.length > 200) return false;
    const known = OWN_TABLES[s.table];
    const idcol = s.idcol || 'id';
    if (!known || known[0] !== (s.col || 'act_id') || known[1] !== idcol) return false;   // not a listed table: closed
    const row = await db.one(`platform.${ownQueryName(s.table, idcol)}`, { id: raw });
    if (!row) continue;
    if (!row.b || !allowed.has(String(row.b))) return false;
  }
  return true;
}

function bodyBrands(body) {
  if (!body || typeof body !== 'object') return [];
  return [body.act, body.act_id, body.screen && body.screen.act_id].filter(present);
}

/* The brand a client request names. Every copy of it must be one of the client's brands. */
function clientBrand(row, caller, req) {
  const ids = caller.ids;
  const q = req.url.searchParams;
  for (const v of ['act', 'act_id'].flatMap(k => q.getAll(k)).filter(v => v !== '')) {
    if (v === 'all' || !ids.has(v)) fail(403, WORDS.client_brand);
  }
  let act = q.get('act') || q.get('act_id') || null;
  if (!READS.has(req.method)) {
    if (req.body_kind === 'other' && row.access.upload !== true) fail(403, WORDS.client_json);
    const vals = bodyBrands(req.body);
    for (const v of vals) if (typeof v !== 'string' || v === 'all' || !ids.has(v)) fail(403, WORDS.client_brand);
    act = act || vals[0] || null;
  }
  if (row.access.brand === 'path') {
    const named = req.params.id || '';
    if (act && act !== named) fail(403, WORDS.client_no);
    act = named;
  }
  if (act === 'all' || (act && !ids.has(act))) fail(403, WORDS.client_brand);
  if ((row.access.brand === 'need' || row.access.brand === 'path') && !act) fail(403, WORDS.client_pick);
  return act;
}

async function checkClient(row, caller, req) {
  const a = row.access;
  if (a.client !== true || (a.hq === true && !caller.client.hq)) fail(403, WORDS.client_no);
  if (caller.client.read_only && !READS.has(req.method)) fail(403, WORDS.client_read);
  if (!caller.brand_ids.length) fail(401, WORDS.nobody);
  const act = clientBrand(row, caller, req);
  if (a.own && !(await recordsOwned(a.own, req, caller.ids))) fail(403, WORDS.client_own);
  if (a.fields && isPlainObject(req.body)) {
    const extra = Object.keys(req.body).filter(k => !['act', 'act_id'].includes(k) && !a.fields.includes(k));
    if (extra.length) {
      const say = list => list.join(', ').replace(/_/g, ' ');
      fail(403, `Your login can change ${say(a.fields)} here. ${say(extra)} ${extra.length === 1 ? 'is' : 'are'} set by the agency team.`);
    }
  }
  return act;
}

/* The brand a team request names, checked against a teammate's brand list when there is one. */
function checkTeam(row, caller, req) {
  const a = row.access;
  if (a.owner_only === true && caller.kind !== 'owner') fail(403, WORDS.owner);
  if (a.team === false && caller.kind !== 'owner') fail(403, WORDS.team_no);
  if (caller.view_only && req.method !== 'GET') fail(403, WORDS.viewer);
  const q = req.url.searchParams.get('act');
  const fromBody = READS.has(req.method) || !isPlainObject(req.body) ? [] : [req.body.act, req.body.act_id].filter(present);
  const fromPath = a.brand === 'path' ? req.params.id || '' : '';
  if (caller.ids) {
    const only = caller.ids;
    if (q && q !== 'all' && !only.has(q)) fail(403, WORDS.team_brand);
    for (const v of fromBody) if (v !== 'all' && (typeof v !== 'string' || !only.has(v))) fail(403, WORDS.team_brand);
    if (fromPath && !only.has(fromPath)) fail(403, WORDS.team_brand);
  }
  const named = fromPath || q || fromBody.find(v => typeof v === 'string') || null;
  return named === 'all' ? null : named;
}

/** Throws 401 or 403, or returns the scope every statement of this request is held to. */
export async function check(row, caller, req) {
  const a = row.access;
  if (caller.kind === 'nobody') {
    if (a.public !== true) fail(401, WORDS.nobody);
    return { all: false, brand: null, ids: [], brand_ids: [] };
  }
  const named = caller.kind === 'client' ? await checkClient(row, caller, req) : checkTeam(row, caller, req);
  const seesAll = caller.brand_ids === null;
  if (!named || a.brand === 'none') {
    return { all: seesAll, brand: null, ids: caller.ids ? [...caller.ids] : [], brand_ids: caller.brand_ids };
  }
  const brand = (await resolveBrandId(req.env, named, req.counters)) || named;
  const ids = [...(await expandIds(req.env, [brand], req.counters))];
  return { all: false, brand, ids, brand_ids: caller.brand_ids };
}

/** The answer on its way out: other brands' rows are dropped, and a client loses the team only keys. */
export function filterAnswer(row, caller, scope, data) {
  let out = data;
  if (caller.ids && out && typeof out === 'object') out = filterBrands(out, caller.ids);
  if (caller.kind === 'client' && row.access.scrub !== false) out = scrub(out);
  return out;
}
