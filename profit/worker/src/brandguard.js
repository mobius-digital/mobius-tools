/* PER-BRAND ACCESS (2026-10-08) + CLIENT LOGINS (2026-10-09). The SAME file lives in
 * account-health/worker/src/brandguard.js and profit/worker/src/brandguard.js; change both together
 * (test-clients.mjs checks they are identical).
 *
 * THREE ROLES. owner (Cole, or the admin token), team (a @go-mobius-digital.com account or an invited
 * guest in settings.allowedEmails), client (an email in settings.clientUsers, any domain, Google sign-in).
 *
 * TEAM. settings.userBrands = { "person@domain": ["brand_...", ...] } (old act_ ids still count). A person
 * listed there sees ONLY those brands; anyone not listed (and the owner, always) sees every brand.
 *   - a request naming another brand (?act= or "act" in a JSON body) is refused with 403;
 *   - every JSON answer is filtered: any object carrying an act_id outside the list is dropped from
 *     its array, so "All clients" quietly means "your brands".
 *
 * CLIENT. settings.clientUsers = { "person@brand.com": { brands: ["brand_x"], name, invited_at, ... } } and
 * settings.clientAccess = { "brand_x": { pl, strategist, changes, creators } } (all ON by default since 2026-10-09; a stored false turns one off). A client
 * is READ-ONLY and sees one brand at a time. The rule is an ALLOWLIST (CLIENT_RULES below): any route not
 * on it is refused with 403, whatever the route's own check would have said. On an allowed route:
 *   - `act` must be one of the client's brands ("all" is refused); a route marked need refuses no act;
 *   - a route behind a switch (P&L, Changes, the Strategist) is refused while the brand has it off;
 *   - ad ids in the query must belong to the client's brands (looked up in `ads`);
 *   - the answer is filtered like a team member's, and then scrubbed: internal keys (Slack channels,
 *     report config) always go, costs and margins go unless P&L is on, change logs unless Changes is on.
 * Only the calendar routes, the Strategist question (when switched on) and the client's own profile take a
 * non-GET. A request that passed is remembered (clientScope) so the worker's own isAdmin lets it through
 * and a handler can check ownership of a record it loads by id (the calendar does).
 * `sessionEmail(env, request)` is passed in because each worker verifies its own session. */
const OWNER = 'cole@go-mobius-digital.com';
const DOMAIN = 'go-mobius-digital.com';
const lower = s => String(s || '').trim().toLowerCase();

async function settingJson(env, key, dflt) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first().catch(() => null);
  try { const v = JSON.parse(row?.value || ''); return v == null ? dflt : v; } catch { return dflt; }
}

export async function brandsFor(env, email) {
  if (!email) return null;
  const e = lower(email);
  if (e === lower(env.OWNER_EMAIL || OWNER)) return null;
  const client = await clientOf(env, e).catch(() => null);
  if (client) return (await clientIds(env, client)).all;
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'userBrands'`).first().catch(() => null);
  let map = {}; try { map = JSON.parse(row?.value || '{}') || {}; } catch {}
  const list = map[e];
  return Array.isArray(list) && list.length ? expandIds(env, list.map(String)) : null;
}

/* Brand-first (2026-10-08): a brand is known by its brand id (brand_x) and by every id it ever had
 * (old act_ id, asana_ id, its Meta ad accounts). The allowed set holds all of them, so old links,
 * old saved lists and rows from Meta's own tables are judged the same way as brand ids. */
async function expandIds(env, list) {
  const ids = new Set(list);
  if (!list.length) return ids;
  try {
    const ph = list.map((_, i) => `?${i + 1}`).join(',');
    const bids = ((await env.DB.prepare(`SELECT brand_id AS id FROM brand_alias WHERE alias IN (${ph}) UNION SELECT id FROM brands WHERE id IN (${ph}) OR legacy_key IN (${ph}) OR slug IN (${ph})`).bind(...list).all()).results || []).map(r => r.id);
    for (const b of bids) ids.add(b);
    if (bids.length) {
      const bp = bids.map((_, i) => `?${i + 1}`).join(',');
      const more = (await env.DB.prepare(`SELECT alias AS id FROM brand_alias WHERE brand_id IN (${bp}) UNION SELECT legacy_key FROM brands WHERE id IN (${bp}) AND legacy_key IS NOT NULL UNION SELECT external_id FROM connections WHERE brand_id IN (${bp}) AND kind = 'meta'`).bind(...bids).all()).results || [];
      for (const r of more) if (r.id) ids.add(r.id);
    }
  } catch {}
  return ids;
}

function filterActs(v, only) {
  if (Array.isArray(v)) return v.filter(x => !(x && typeof x === 'object' && typeof x.act_id === 'string' && /^(act_|asana_|brand_)/.test(x.act_id) && !only.has(x.act_id))).map(x => filterActs(x, only));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) { if (/^(act_\d+|brand_[a-z0-9_]+)$/.test(k) && !only.has(k)) continue; o[k] = filterActs(x, only); } return o; }
  return v;
}

/* ------------------------------------------------------------------------------------------ */
/*  CLIENTS                                                                                    */
/* ------------------------------------------------------------------------------------------ */

/* What a client may see beyond the base pages, per brand. ON by default (2026-10-09, Cole: a client sees everything
   about their own business); settings.clientAccess holds only the overrides, a false turns one off for that brand. */
export const CLIENT_SWITCHES = { pl: true, strategist: true, changes: true, creators: true };

/** The client record for an email, or null when the email is not a client (the owner, anyone on the
 *  Mobius domain and an invited team guest are never clients, whatever clientUsers says). */
export async function clientOf(env, email) {
  const e = lower(email);
  if (!e || e === lower(env.OWNER_EMAIL || OWNER) || e.endsWith('@' + DOMAIN)) return null;
  const users = await settingJson(env, 'clientUsers', {});
  const c = users && users[e];
  if (!c || typeof c !== 'object') return null;
  const guests = (await settingJson(env, 'allowedEmails', [])) || [];
  if (Array.isArray(guests) && guests.map(lower).includes(e)) return null;
  const brands = (Array.isArray(c.brands) ? c.brands : []).map(String).filter(b => /^brand_[a-z0-9_]+$/.test(b));
  const accessAll = (await settingJson(env, 'clientAccess', {})) || {};
  const access = Object.fromEntries(brands.map(b => [b, { ...CLIENT_SWITCHES, ...pick(accessAll[b]) }]));
  return { email: e, name: c.name || null, brands, access };
}
const pick = o => Object.fromEntries(Object.keys(CLIENT_SWITCHES).filter(k => o && typeof o[k] === 'boolean').map(k => [k, o[k]]));

/** True when this email may sign in as a client (googleLogin uses it next to emailAllowed). */
export async function isClientEmail(env, email) { return !!(await clientOf(env, email).catch(() => null)); }

/** Every id each of the client's brands answers to, and the union. */
async function clientIds(env, client) {
  const of = new Map(), all = new Set();
  for (const b of client.brands) { const s = await expandIds(env, [b]); of.set(b, s); for (const x of s) all.add(x); }
  return { of, all };
}

/* Requests that passed the client rules: the worker's isAdmin answers true for exactly these, and a
   handler that loads a record by id asks clientScope(request) whose brands it may touch. */
const CLEARED = new WeakMap();
export function clientScope(request) { return (request && CLEARED.get(request)) || null; }

/* THE ALLOWLIST. m = method, p = exact path. act: 'need' (one of theirs, required), 'opt' (theirs when
   given; the answer is filtered either way), 'none' (no brand in the query; a handler or `ads` checks).
   opt = the brand switch that must be on. ads = the query param holding Meta ad ids to check.
   post = a last pass over the answer. cal = calendar write (the handler checks the date's brand). */
const sentOnlyList = b => { if (b && Array.isArray(b.rows)) b.rows = b.rows.filter(r => r && r.status === 'sent'); if (b) delete b.lastRun; return b; };
const sentOnlyOne = b => (b && b.status === 'sent' ? b : { __deny: 404, error: 'no report for that period' });
export const CLIENT_RULES = [
  // Who am I, and my own profile.
  { m: 'GET', p: '/api/me', act: 'none' },
  { m: 'GET', p: '/api/clients/me', act: 'none' },
  { m: 'PUT', p: '/api/clients/me', act: 'none' },
  // Home (profit worker): the brand snapshot, today so far, P&L when switched on.
  { m: 'GET', p: '/api/overview', act: 'opt' },
  { m: 'GET', p: '/api/hub/live', act: 'opt' },
  { m: 'GET', p: '/api/client', act: 'need', opt: 'pl' },
  { m: 'GET', p: '/api/forecast', act: 'need', opt: 'pl' },
  // Ads: All channels, Meta, Google (overview + campaigns), the orders behind a number.
  { m: 'GET', p: '/api/hub/paid', act: 'need' },
  { m: 'GET', p: '/api/hub/orders', act: 'need' },
  { m: 'GET', p: '/api/hub/customer', act: 'need' },
  { m: 'GET', p: '/api/google/ads', act: 'need' },
  { m: 'GET', p: '/api/google/ads-changes', act: 'need', opt: 'changes' },
  { m: 'GET', p: '/api/activities', act: 'need', opt: 'changes' },
  { m: 'GET', p: '/api/ad-creatives', act: 'need', ads: 'ads' },
  { m: 'GET', p: '/api/ad-video', act: 'none', ads: 'ad' },
  { m: 'GET', p: '/api/ad-breakdown', act: 'none', ads: 'ad' },
  // Email and SMS, Store.
  { m: 'GET', p: '/api/hub/email', act: 'need' },
  { m: 'GET', p: '/api/klaviyo', act: 'need' },
  { m: 'GET', p: '/api/hub/store', act: 'need' },
  { m: 'GET', p: '/api/customers', act: 'need' },
  { m: 'GET', p: '/api/google/website', act: 'need' },
  { m: 'GET', p: '/api/google/search', act: 'need' },
  // Reports: sent only, never a draft.
  { m: 'GET', p: '/api/reports', act: 'need', post: sentOnlyList },
  { m: 'GET', p: '/api/report', act: 'need', post: sentOnlyOne },
  // Calendar: read, add, edit, move, set the end, comment. Never remove, tick work steps or make Asana tasks.
  { m: 'GET', p: '/api/calendar', act: 'need' },
  { m: 'GET', p: '/api/calendar/history', act: 'none', cal: true },
  { m: 'POST', p: '/api/calendar/event', act: 'need', cal: true },
  { m: 'POST', p: '/api/calendar/move', act: 'none', cal: true },
  { m: 'POST', p: '/api/calendar/end', act: 'none', cal: true },
  { m: 'POST', p: '/api/calendar/comment', act: 'none', cal: true },
  // The client-safe Strategist (clientask.js): on by default, refused where the brand has it turned off.
  { m: 'POST', p: '/api/ask', act: 'need', opt: 'strategist' },
];

/* Keys a client never sees, and the ones that wait for a switch. */
const ALWAYS_OUT = new Set(['slack_channel', 'brief_channel', 'client_channel', 'internal_channel', 'report_config', 'review_first', 'brief_enabled', 'slack_ts', 'sent_channel', 'steer', 'lastRun', 'team', 'storage_prefix', 'tw_shop', 'shopify_token', 'notes_internal']);
const PL_OUT = new Set(['cogs', 'ship_cost', 'handling', 'fees', 'gross_profit', 'cm', 'cm_pct', 'cmPct', 'margin', 'margin_pct', 'cost_health', 'shipping', 'cm_ok', 'cogs_quality', 'contribution', 'profit', 'net_profit', 'piv']);
const CHANGES_OUT = new Set(['changes', 'change_log', 'changelog', 'activities']);
export function scrub(v, offFor, ctx = null) {
  if (Array.isArray(v)) return v.map(x => scrub(x, offFor, ctx));
  if (!v || typeof v !== 'object') return v;
  const here = typeof v.act_id === 'string' ? v.act_id : ctx;
  const off = offFor(here);
  const o = {};
  for (const [k, x] of Object.entries(v)) {
    if (ALWAYS_OUT.has(k) || (off.pl && PL_OUT.has(k)) || (off.changes && CHANGES_OUT.has(k))) continue;
    o[k] = scrub(x, offFor, here);
  }
  return o;
}

async function adsOwned(env, ids, allowed) {
  if (!ids.length) return true;
  if (ids.length > 60 || ids.some(x => !/^\d{3,25}$/.test(x))) return false;
  const ph = ids.map((_, i) => `?${i + 1}`).join(',');
  const rows = (await env.DB.prepare(`SELECT ad_id, act_id FROM ads WHERE ad_id IN (${ph})`).bind(...ids).all().catch(() => ({ results: [] }))).results || [];
  const seen = new Map(rows.map(r => [String(r.ad_id), r.act_id]));
  return ids.every(id => seen.has(id) && allowed.has(seen.get(id)));
}

const CLIENT_NO = 'Your Locus login shows your own brand. That part is for the Mobius team; ask us in Slack if you need it.';

async function guardClient(request, env, client, handle, CORS) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const m = request.method;
  const out = (status, error) => new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
  const rule = CLIENT_RULES.find(r => r.m === m && r.p === path);
  if (!rule) return out(403, CLIENT_NO);
  /* A login with no brand left (Cole removed the last one) opens nothing at all. */
  if (!client.brands.length) return out(401, 'unauthorized');
  const ids = await clientIds(env, client);
  /* The brand named by the request: the query's act, or the JSON body's act (the Strategist's screen too). */
  let act = url.searchParams.get('act');
  let body = null;
  if (m !== 'GET') {
    try { body = await request.clone().json(); } catch { body = null; }
    const bAct = body && (typeof body.act === 'string' ? body.act : typeof body.screen?.act_id === 'string' ? body.screen.act_id : null);
    if (bAct) { if (act && act !== bAct) return out(403, CLIENT_NO); act = bAct; }
  }
  if (act === 'all' || (act && !ids.all.has(act))) return out(403, 'You do not have access to that brand.');
  if (rule.act === 'need' && !act) return out(403, 'Pick your brand first.');
  const brandOf = id => { for (const [b, s] of ids.of) if (s.has(id)) return b; return null; };
  const b = act ? brandOf(act) : null;
  if (rule.opt) {
    const on = b ? !!client.access[b]?.[rule.opt] : false;
    if (!on) return out(403, 'That is switched off for your login. Ask Mobius if you would like it.');
  }
  if (rule.ads) {
    const raw = url.searchParams.get(rule.ads) || '';
    const list = raw.split(',').map(x => x.trim()).filter(Boolean);
    if (rule.act === 'none' && !list.length) return out(403, CLIENT_NO);
    if (!(await adsOwned(env, list, ids.all))) return out(403, 'You do not have access to that ad.');
  }
  CLEARED.set(request, { email: client.email, name: client.name, brands: client.brands, access: client.access, ids: ids.all, brandOf });
  const res = await handle();
  const type = res.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) return res;
  let data; try { data = await res.clone().json(); } catch { return res; }
  /* P&L and Changes: judged by the brand of each object (act_id), else the request's brand; with no brand
     at all (Home with no act), the strictest of the client's brands. */
  const strict = { pl: client.brands.some(x => !client.access[x]?.pl), changes: client.brands.some(x => !client.access[x]?.changes) };
  const offFor = id => { const bb = (id && brandOf(id)) || b; if (!bb) return strict; const a = client.access[bb] || {}; return { pl: !a.pl, changes: !a.changes }; };
  data = scrub(filterActs(data, ids.all), offFor, act || null);
  if (rule.post) data = rule.post(data);
  if (data && data.__deny) return out(data.__deny, data.error);
  const h = new Headers(res.headers); h.delete('Content-Length');
  return new Response(JSON.stringify(data), { status: res.status, headers: h });
}

export async function guardBrands(request, env, sessionEmail, handle, CORS = {}) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ') || request.method === 'OPTIONS') return handle();
  const email = await sessionEmail(env, request).catch(() => null);
  /* A client is judged by the allowlist and nothing else. */
  const client = email ? await clientOf(env, email).catch(() => null) : null;
  if (client) return guardClient(request, env, client, handle, CORS);
  const only = await brandsFor(env, email).catch(() => null);
  if (!only) return handle();
  const url = new URL(request.url);
  const deny = () => new Response(JSON.stringify({ error: 'You do not have access to that brand. Ask Cole to add it to your brands (Settings > Team).' }), { status: 403, headers: { 'Content-Type': 'application/json', ...CORS } });
  const q = url.searchParams.get('act');
  if (q && q !== 'all' && !only.has(q)) return deny();
  if (request.method !== 'GET' && (request.headers.get('Content-Type') || '').includes('json')) {
    try { const b = await request.clone().json(); if (b && typeof b.act === 'string' && b.act !== 'all' && !only.has(b.act)) return deny(); } catch {}
  }
  const res = await handle();
  if (!(res.headers.get('Content-Type') || '').includes('application/json')) return res;
  let body; try { body = await res.clone().json(); } catch { return res; }
  const h = new Headers(res.headers); h.delete('Content-Length');
  return new Response(JSON.stringify(filterActs(body, only)), { status: res.status, headers: h });
}
