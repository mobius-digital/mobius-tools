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
import { splitPath } from './legacy.js';
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
  client_look: 'Your login can look and approve. Changing ads, costs or goals is switched off for it. Ask your team.',
  team_brand: 'You do not have access to that brand. Ask the owner to add it to your brands (Settings > Team).',
  viewer: 'Your account has view-only access, so this cannot be changed. Ask an admin on your team.',
  owner: 'Only the owner can do that.',
  team_no: 'That is not open to the team.',
  gated: 'Finish setting up first.',
  one_job: 'Your login is for one setup job. Open your link to finish it.',
};
/** The code a held brand's refusal carries; router.js errorAnswer adds `gated: true` to the answer for it. */
export const GATED_CODE = 'onboarding_gated';

/* The Get started hold, the old brand guard's (account-health brandguard.js heldBrands). While a brand of a client
   login is still being set up, only these open for it: the routes a one-job colleague may use (CLIENT_RULES onb: true)
   and SETUP_MAY (its brand list, Message the team, its own prefs and delivery). Keep both lists in step with that file. */
const ONB_MAY = new Set([
  'GET /api/me', 'GET /api/clients/me', 'PUT /api/clients/me', 'GET /api/onboard', 'PUT /api/onboard/brief', 'PUT /api/onboard/connect',
  'POST /api/onboard/handoff', 'GET /api/brand/assets-link', 'PUT /api/brand/assets-link', 'GET /api/notices',
]);
const SETUP_MAY = new Set([
  'GET /api/brands', 'GET /api/requests', 'POST /api/requests', 'POST /api/requests/reply',
  'GET /api/me/prefs', 'PUT /api/me/prefs', 'GET /api/me/delivery', 'PUT /api/me/delivery', 'POST /api/notices/done',
]);

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

/* A brand id as the request wrote it (a brand id, a slug, an old id, an ad account id) is turned into the
   brand it means FIRST, and only that brand is checked against the caller's brands, the way the old workers
   do it (resolve, then guard). Checking the raw id against every id the caller's brands answer to let an
   ad account that moved from one brand to another open the brand it came from. '' when no brand answers. */
async function brandOfId(req, v) {
  if (typeof v !== 'string' || !v) return '';
  if (v === 'all') return 'all';
  return resolveBrandId(req.env, v, req.counters);
}

/* The one brand a request may name. Every copy of it must resolve to one of `mine` (brand ids). */
async function mayName(req, values, mine, words) {
  let first = null;
  for (const v of values) {
    const b = await brandOfId(req, v);
    if (b === 'all' && words.all_ok) { first = first || 'all'; continue; }
    if (b && words.held && words.held.has(b)) fail(403, WORDS.gated, GATED_CODE);
    if (!b || b === 'all' || !mine.has(b)) fail(403, words.no);
    first = first || b;
  }
  return first;
}

/* The brand a client request names. Every copy of it must be one of the client's brands. */
async function clientBrand(row, caller, req, held) {
  const mine = new Set(caller.brand_ids);
  const q = req.url.searchParams;
  const words = { no: WORDS.client_brand, held };
  const fromQuery = ['act', 'act_id'].flatMap(k => q.getAll(k)).filter(v => v !== '');
  let act = await mayName(req, fromQuery, mine, words);
  if (!READS.has(req.method)) {
    if (req.body_kind === 'other' && row.access.upload !== true) fail(403, WORDS.client_json);
    const vals = bodyBrands(req.body);
    for (const v of vals) if (typeof v !== 'string') fail(403, WORDS.client_brand);
    const fromBody = await mayName(req, vals, mine, words);   // every copy is checked, even when the query named one
    act = act || fromBody;
  }
  if (row.access.brand === 'path') {
    const named = await mayName(req, [req.params.id || ''].filter(Boolean), mine, words);
    if (act && named && act !== named) fail(403, WORDS.client_no);
    act = named;
  }
  if ((row.access.brand === 'need' || row.access.brand === 'path') && !act) fail(403, WORDS.client_pick);
  return act;
}

/* What a look and approve client login (not a pinned one) may still send: approve or ask for changes,
   comment, its own requests, its own prefs and bell, and reading. Same list as the old brand guard. */
const READONLY_CLIENT_MAY = new Set([
  'POST /api/production/decide', 'POST /api/production/comment', 'POST /api/production/comment/delete',
  'POST /api/requests', 'POST /api/requests/reply', 'POST /api/requests/decide', 'POST /api/requests/done',
  'PUT /api/me/prefs', 'POST /api/me/morning', 'PUT /api/me/delivery', 'POST /api/notices/done', 'PUT /api/clients/me',
  'POST /api/read', 'POST /api/daycheck', 'POST /api/summarise',
]);

/* The only writes a view only teammate may make on the account-health side: its own prefs and bell,
   reading and summing up, and signing in. The old door check (VIEWER_MAY). The profit side has none. */
const VIEWER_MAY = new Set([
  '/api/me/prefs', '/api/me/morning', '/api/me/delivery', '/api/notices/done',
  '/api/read', '/api/daycheck', '/api/summarise',
  '/api/google-login', '/api/hq-signin', '/api/clients/signin', '/api/clients/login-link',
]);

const oldPath = req => splitPath(req.url.pathname) || { worker: '', path: req.url.pathname };

/* A row with access.look_may: true writes only the caller's own rows (each statement binds :email), so a view
   only teammate and a look and approve client may send it too. The old door for it sat above both checks. */
const lookMay = (row, req) => !READS.has(req.method) && !!row && row.access.look_may === true;

function clientMayWrite(caller, req, row) {
  if (READS.has(req.method) || !caller.client.read_only || lookMay(row, req)) return true;
  if (caller.client.hq) return false;
  return READONLY_CLIENT_MAY.has(`${req.method} ${oldPath(req).path}`);
}

/** True when a view only teammate may send this write (method aside): the old door's allow list. */
export function viewerMay(pathname) {
  const at = splitPath(pathname);
  return !!at && at.worker === 'ah' && VIEWER_MAY.has(at.path);
}

const viewerMayWrite = req => viewerMay(req.url.pathname);

/* On a route that is not part of setting up, a held brand is taken out of what this request may name, own and see: the
   request's own caller is narrowed (it is built fresh for each request), so the last filter drops the held brand too.
   Every brand held = refused outright. Returns the held brands and the ids before narrowing, or null. */
async function setupHold(caller, req) {
  const said = `${req.method} ${oldPath(req).path}`;
  if (caller.client.one_job && !ONB_MAY.has(said)) fail(403, WORDS.one_job);
  const held = caller.client.held || [];
  if (!held.length || ONB_MAY.has(said) || SETUP_MAY.has(said)) return null;
  const open = caller.brand_ids.filter(b => !held.includes(b));
  if (!open.length) fail(403, WORDS.gated, GATED_CODE);
  const full = caller.ids;
  caller.brand_ids = open;
  caller.ids = await expandIds(req.env, open, req.counters);
  return { brands: new Set(held), full };
}

async function checkClient(row, caller, req) {
  const a = row.access;
  if (a.client !== true || (a.hq === true && !caller.client.hq)) fail(403, WORDS.client_no);
  if (!clientMayWrite(caller, req, row)) fail(403, caller.client.hq ? WORDS.client_read : WORDS.client_look);
  if (!caller.brand_ids.length) fail(401, WORDS.nobody);
  const hold = await setupHold(caller, req);
  const act = await clientBrand(row, caller, req, hold && hold.brands);
  if (a.own && !(await recordsOwned(a.own, req, caller.ids))) {
    if (hold && (await recordsOwned(a.own, req, hold.full))) fail(403, WORDS.gated, GATED_CODE);
    fail(403, WORDS.client_own);
  }
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
async function checkTeam(row, caller, req) {
  const a = row.access;
  if (a.owner_only === true && caller.kind !== 'owner') fail(403, WORDS.owner);
  if (a.team === false && caller.kind !== 'owner') fail(403, WORDS.team_no);
  if (caller.view_only && !READS.has(req.method) && !viewerMayWrite(req) && !lookMay(row, req)) fail(403, WORDS.viewer);
  const q = req.url.searchParams.get('act');
  const fromBody = READS.has(req.method) || !isPlainObject(req.body) ? [] : [req.body.act, req.body.act_id].filter(present);
  const fromPath = a.brand === 'path' ? req.params.id || '' : '';
  if (caller.ids) {
    const mine = new Set(caller.brand_ids || []);
    const words = { no: WORDS.team_brand, all_ok: true };
    for (const v of fromBody) if (typeof v !== 'string') fail(403, WORDS.team_brand);
    await mayName(req, [q, ...fromBody, fromPath].filter(present), mine, words);
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
  const named = caller.kind === 'client' ? await checkClient(row, caller, req) : await checkTeam(row, caller, req);
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
  if (caller.ids && row.access.filter !== false && out && typeof out === 'object') out = filterBrands(out, caller.ids);
  if (caller.kind === 'client' && row.access.scrub !== false) out = scrub(out);
  return out;
}
