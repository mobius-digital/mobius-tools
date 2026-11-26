/* PER-BRAND ACCESS (2026-10-08) + CLIENT LOGINS (2026-10-09) + THE BRAND EDITION (2026-10-10). The SAME file lives in
 * account-health/worker/src/brandguard.js and profit/worker/src/brandguard.js; change both together
 * (test-clients.mjs checks they are identical). docs/locus-hub/editions.md is the rule in plain words.
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
 * CLIENT = THE BRAND EDITION (Cole, 2026-10-10: "Locus is literally everything now. A client should have access to
 * absolutely everything"). settings.clientUsers = { "person@brand.com": { brands: ["brand_x"], name, ... } }. A client
 * gets every page, number and action a single brand has, for its own brands, through the SAME routes the team's
 * screens call. The agency edition adds only what runs many brands at once (the AGENCY-ONLY list in
 * docs/locus-hub/editions.md). The rule is still an ALLOWLIST (CLIENT_RULES below): a route not on it is refused
 * with 403 before any handler runs, so a new agency route is closed to clients until someone adds it here.
 * On an allowed route:
 *   - `act` (query, JSON body act / act_id / screen.act_id, or the path for act:'path') must be one of the
 *     client's brands; "all" is always refused; a route marked need refuses no act;
 *   - ad ids in the query must belong to the client's brands (looked up in `ads`);
 *   - a record named by id (`own`) must belong to the client's brands (a dashboard, a scenario, a Studio ad...);
 *   - a write with `fields` may only carry those body keys (brand settings: never Slack channels or connections);
 *   - a route with `cap` costs Mobius money (Studio images, the assistant): each client has a daily dollar cap,
 *     settings clientStudio:<day>:<email> ($3) and clientAsk:<day>:<email> ($2), refused with 429 when spent;
 *   - the answer is filtered like a team member's, then scrubbed: Slack channel ids, report config, the sending
 *     setup and team-internal notes always go. Costs, margins and change logs are NOT scrubbed any more (the four
 *     access switches are gone; CLIENT_SWITCHES stays, always true, only so old callers keep working).
 * A request that passed is remembered (clientScope) so the worker's own isAdmin lets it through and a handler can
 * check ownership of a record it loads by id (the calendar and the requests do).
 * `sessionEmail(env, request)` is passed in because each worker verifies its own session. */
const OWNER = 'cole@go-mobius-digital.com';
const DOMAIN = 'go-mobius-digital.com';
const lower = s => String(s || '').trim().toLowerCase();
export const HQ_BRAND = 'brand_lucky_golf', HQ_DOMAIN = 'hq.luckygolf.com';
/* The four Get started steps (onboard.js). */
const ONB_STEPS = ['sign_pay', 'connect', 'brief', 'assets'];

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

/* The four access switches (P&L, Strategist, Changes, Creators) are gone (2026-10-10: everything is on for a client).
   Kept, always true, only so /api/me, the invite and older screens that read `access` keep working. */
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
  /* The Lucky HQ login (2026-11-11, POST /api/hq-signin): Locus opened inside hq.luckygolf.com. It is a client login
     that is ALWAYS Lucky Golf and nothing else, whatever the stored row says, and the only one the `hq` rules open to. */
  const hq = c.hq === true && e.endsWith('@' + HQ_DOMAIN);
  /* Lucky HQ's People list decides who may open Ads and whether they may act (2026-11-11). HQ renews the login with a
     fresh pass; past hq_until the login is nobody, so a person taken off HQ's list is out of Locus within half an hour.
     readOnly (the pass said can: 'read') = may look, may not press Yes / No, launch or change an ad. */
  if (hq && c.hq_until && !(Number(c.hq_until) > Date.now())) return null;
  const brands = hq ? [HQ_BRAND] : (Array.isArray(c.brands) ? c.brands : []).map(String).filter(b => /^brand_[a-z0-9_]+$/.test(b));
  const access = Object.fromEntries(brands.map(b => [b, { ...CLIENT_SWITCHES }]));
  /* Onboarding (2026-11-26): a colleague handed one setup step ("Someone else does this") only ever opens Get started. */
  const only = Array.isArray(c.onboard_only) ? [...new Set(c.onboard_only.filter(x => ONB_STEPS.includes(x)))] : [];
  return { email: e, name: c.name || null, brands, access, ...(hq ? { hq: true } : {}), ...(c.readOnly === true ? { readOnly: true } : {}), ...(only.length ? { onlyOnboard: only } : {}) };
}

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

/* ---------------- what a client may spend of Mobius's money, per day ---------------- */
export const CLIENT_CAPS = {
  clientStudio: { max: 3, word: 'Studio' },   // images and videos on Mobius's OpenAI / Google keys, Claude for the copy desk
  clientAsk: { max: 2, word: 'the assistant' },   // the Locus chat, the AI reads on screens
};
const today = () => new Date().toISOString().slice(0, 10);
export async function capUse(env, key, email) {
  return (await settingJson(env, `${key}:${today()}:${lower(email)}`, null)) || { n: 0, cost: 0 };
}
export async function capAdd(env, key, email, cost) {
  const k = `${key}:${today()}:${lower(email)}`;
  const cur = await capUse(env, key, email);
  const next = { n: (cur.n || 0) + 1, cost: Math.round(((cur.cost || 0) + (+cost || 0)) * 10000) / 10000 };
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, JSON.stringify(next)).run().catch(() => {});
  return next;
}
export function capMessage(key) {
  const c = CLIENT_CAPS[key] || { max: 0, word: 'that' };
  return `That is today's limit for ${c.word} on your login ($${c.max} a day of AI work on Mobius's account). It resets tomorrow, or ask your Mobius team in Slack.`;
}

/* ---------------- the rules ---------------- */
/* THE ALLOWLIST. m = method, p = exact path (or re = an anchored pattern for a path with an id in it; never a prefix).
   act: 'need' (one of theirs, required), 'opt' (theirs when given; the answer is filtered either way), 'none' (no brand
   in the request; the handler, `own` or `ads` checks), 'path' (the brand id is the pattern's first group).
   ads = the query param holding Meta ad ids to check. own = records named by id that must be the client's:
   [{ in: 'body'|'query'|'path', key, table, col }] (col = the brand column, default act_id; a missing row passes,
   a row with no brand is refused). fields = the only body keys a write may carry. deny(body, url) = a refusal
   reason or null. cap = [key, dollars or (body, url) => dollars] charged before the handler runs. prep(env, body)
   = the body the handler gets instead (async). post(answer) = a last pass over the answer. cal = calendar route. */
/* read_status (How we read it, on the reports list) is team only: a client row never carries it. */
const sentOnlyList = b => { if (b && Array.isArray(b.rows)) b.rows = b.rows.filter(r => r && r.status === 'sent').map(r => { if (r && 'read_status' in r) delete r.read_status; return r; }); if (b) delete b.lastRun; return b; };
const sentOnlyOne = b => (b && b.status === 'sent' ? b : { __deny: 404, error: 'no report for that period' });
/* The Daily Brief page for a client: sent briefs only, and fixed costs under the same rule as every client page
   (2026-11-25). Never a category name or amount (they are the team's free text). With settings costsNetInPosts off
   (fixed.in_posts is not true) nothing about fixed costs or net profit leaves: not the month block, not a day's
   fixed / ad_expense / net. With it on, the one total and net stay. */
export const briefSent = b => {
  if (!b || typeof b !== 'object') return b;
  if (Array.isArray(b.history)) b.history = b.history.filter(r => r && r.status === 'sent');
  const on = !!b.fixed && typeof b.fixed === 'object' && b.fixed.in_posts === true;
  if (on) delete b.fixed.by_category; else delete b.fixed;
  if (!on && Array.isArray(b.days)) for (const d of b.days) if (d && d.a && typeof d.a === 'object') { delete d.a.fixed; delete d.a.ad_expense; delete d.a.net; }
  return b;
};
const ownDash = (ids) => b => { if (b && Array.isArray(b.dashboards)) b.dashboards = b.dashboards.filter(d => d && d.act && ids.has(d.act)); return b; };
const noAgency = b => { if (b && typeof b === 'object') b.agency = []; return b; };
/* Integrations for a client (2026-10-14, Cole saw other clients' Google Ads accounts in the pick list): no agency card,
   no pick lists (they hold every account Mobius's logins reach, with the brand each is linked to), and no paste box for
   an id the client may not save (LINK_FIELDS below decides; the PUT refuses the rest anyway). */
const clientIntegrations = b => {
  noAgency(b);
  for (const br of (b && Array.isArray(b.brands) ? b.brands : [])) for (const it of (Array.isArray(br.items) ? br.items : [])) {
    if (!it || typeof it !== 'object') continue;
    it.options = [];
    if (Array.isArray(it.levels)) it.levels = it.levels.map(l => ({ name: l.name, on: l.on }));
    if (it.input && !LINK_FIELDS.includes(it.input.key)) it.input = null;
  }
  return b;
};
const studioCost = { make: b => 0.32 * Math.max(1, Math.min(4, +b?.n || 1)), 'make-exact': 0.55, vary: 0.3, change: 0.3, dress: 0.35, story: 0.45, art: 0.3, lift: 0.05, read: 0.02, extend: 0.1, harmonize: 0.1, finalize: 0.05, dna: 0.03 };
const AD = { table: 'p_studio_ad' }, BATCH = { table: 'p_studio_batch' };
/* Brand settings (PUT /api/accounts/<brand>): what the brand's own people may change. Never the status, the Slack
   channels, the brief switch or a connection (a Triple Whale shop could point the brand at another store). */
const BRAND_FIELDS = ['name', 'monthly_budget', 'budgets', 'tz', 'target_cpa', 'target_roas', 'goals'];
/* Integrations (PUT /api/brand-links): the brand's OWN keys and links. Never an id that Mobius's access reaches
   (Meta account, Triple Whale shop, GA4, Search Console, Google Ads): pasting another brand's id would read its data. */
const LINK_FIELDS = ['drive', 'frame', 'klaviyo_key', 'clarity_token', 'survey_key', 'fairing_key', 'kno_key'];
/* Brand docs a client may not write (2026-10-14 audit): `asana` and `assets` point the hourly sync at a project or
   Drive folder (another brand's, if the id is known); the rest hold keys that only Integrations sets, checked. */
/* `assets_link` (onboarding) has one door, PUT /api/brand/assets-link, which checks it is a plain https link. */
const DOC_TEAM = /^(asana|assets|assets_link|google|tiktok|klaviyo|clarity|survey_.*|voice_skill|rules)$/;
const docDeny = b => (b && DOC_TEAM.test(String(b.key || '')) ? 'That part is set from Integrations or by the Mobius team.' : null);
/* GET /api/brand for a client: never the stored keys (Klaviyo, Clarity, survey) or the Asana webhook. */
const noDocSecrets = b => { const d = b && b.docs; if (d && typeof d === 'object') for (const line of Object.values(d)) if (line && typeof line === 'object') for (const k of Object.keys(line)) if (/^(klaviyo|clarity|survey_.*|asana|google|tiktok)$/.test(k)) delete line[k]; return b; };
/* Leak finder lessons for a client: its own brand's only, no team emails. */
const ownLessons = ids => b => { const L = b && (b.lessons || b.rows); if (Array.isArray(L)) { const kept = L.filter(x => x && x.act_id && ids.has(x.act_id)).map(x => { const { added_by, decided_by, ...rest } = x; return rest; }); if (b.lessons) b.lessons = kept; else b.rows = kept; } return b; };
/* /api/accounts for a client: no count of the Meta accounts Mobius reaches. */
/* Day check for a client (Cole 2026-11-05: "remove that entirely, that should just be for us internally"): the
   accounts-we-run sign is dropped, and each day's count and verdict are worked out again from the three outside signs
   (Breezeway's panel, Meta's status page, advertisers online): 3 = very bad, 2 = bad, 1 = mixed. */
const VERDICT3 = h => h >= 3 ? 'vbad' : h >= 2 ? 'bad' : h === 1 ? 'mixed' : 'normal';
const noOurs = b => { if (!b || typeof b !== 'object') return b; const fix = d => { if (!d || !d.signs) return; const s = d.signs; delete s.ours;
  d.hits = [s.breezeway && s.breezeway !== 'NORMAL', (s.outage || []).length > 0, s.chatter && s.chatter.issues].filter(Boolean).length; d.verdict = VERDICT3(d.hits); };
  (b.days || []).forEach(fix); if (b.latest) fix(b.latest); delete b.thresholds;
  b.how = 'A bad day on Meta when two or more of three outside signs agree: other advertisers (a public panel) calling it bad, Meta posting a problem, and advertisers reporting problems online. One sign = mixed.'; return b; };
/* The verdict's headline and reasons are written for the team; a client gets only the line written to be safe for them. */
const verdictForClient = b => { if (b && typeof b === 'object' && 'headline' in b) { b.headline = b.client_line || ''; b.why = ''; delete b.todo; delete b.scope; } return b; };
const noDiscover = b => { if (b && typeof b === 'object') delete b.lastDiscover; return b; };

const R = (m, p, act = 'need', more = {}) => ({ m, p, act, ...more });
const RX = (m, re, act, more = {}) => ({ m, re, act, ...more });
const S_ = (p, more = {}) => R('POST', '/api/studio/' + p, 'opt', { own: [{ in: 'body', key: 'id', ...AD }, { in: 'body', key: 'parent_id', ...AD }, { in: 'body', key: 'base_id', ...AD }, { in: 'body', key: 'batch_id', ...BATCH }], ...(studioCost[p] ? { cap: ['clientStudio', studioCost[p]] } : {}), ...more });

export const CLIENT_RULES = [
  /* ---- who am I, my own profile ---- */
  /* onb: true = open to a colleague handed one setup step (onboard_only); every other route is shut to them. */
  R('GET', '/api/me', 'none', { onb: true }),
  R('GET', '/api/clients/me', 'none', { onb: true }),
  R('PUT', '/api/clients/me', 'none', { onb: true }),
  /* ---- GET STARTED (onboard.js, 2026-11-26): the brand's own setup. The handler checks the brand and a colleague's
     handed steps again (the second lock). ---- */
  R('GET', '/api/onboard', 'need', { onb: true }),
  R('PUT', '/api/onboard/brief', 'need', { onb: true, fields: ['answers'] }),
  R('PUT', '/api/onboard/connect', 'need', { onb: true, fields: ['platform', 'said', 'skip', 'inputs'] }),
  R('POST', '/api/onboard/handoff', 'need', { onb: true, fields: ['step', 'email', 'name', 'role'] }),
  R('GET', '/api/brand/assets-link', 'need', { onb: true }),
  R('PUT', '/api/brand/assets-link', 'need', { onb: true, fields: ['url', 'label'] }),
  /* The goals page reads the brand list: a client gets its own brands only. */
  R('GET', '/api/brands', 'none', { postIds: ids => b => { if (b && Array.isArray(b.brands)) b.brands = b.brands.filter(x => x && ids.has(x.id)); return b; } }),
  /* Per-person preferences (prefs.js, 2026-10-11): the morning DM switch, the nudge card's Not now and Done. */
  R('GET', '/api/me/prefs', 'none'),
  R('PUT', '/api/me/prefs', 'none', { fields: ['morning_dm', 'nudge', 'home_tiles'] }),
  R('GET', '/api/me/morning', 'none'),
  R('POST', '/api/me/morning', 'none'),
  /* Automations (automations.js, 2026-11-25): a client's own bell and its own delivery choices. The handler holds a
     client to its own rows on its own brands; setting up an automation stays the team's. */
  R('GET', '/api/notices', 'none', { onb: true }),
  R('POST', '/api/notices/done', 'none', { fields: ['id', 'done', 'answer'] }),
  R('GET', '/api/me/delivery', 'none'),
  R('PUT', '/api/me/delivery', 'none', { fields: ['delivery', 'per', 'notify'] }),

  /* ---- HOME: Overview, Day check, P&L, Goals, Requests ---- */
  R('GET', '/api/overview', 'opt'),
  R('GET', '/api/hub/live', 'opt'),
  /* The hero number and the morning line on Home (2026-10-11, hero.js): what the brand kept yesterday. */
  R('GET', '/api/hub/kept'),
  R('GET', '/api/hub/find'),
  R('GET', '/api/client'),
  R('GET', '/api/forecast'),
  R('GET', '/api/costs'),
  /* Brand costs (2026-11-25, costs.js): a brand's own shipping and product cost rules and its cost sheet. */
  R('PUT', '/api/costs'),
  R('DELETE', '/api/costs'),
  R('POST', '/api/costs/sheet'),
  R('PUT', '/api/margin'),
  R('GET', '/api/expenses'),
  R('PUT', '/api/expenses'),
  R('POST', '/api/profit-share'),
  R('GET', '/api/data-health'),
  R('POST', '/api/tw-sync', 'need', { deny: (b, url) => (+url.searchParams.get('days') > 70 ? 'Your login re-reads up to 70 days; ask us for a longer re-pull.' : null) }),
  /* Day check: a market-level answer ("was it a bad day on Meta"); its brand rows are filtered to theirs. */
  R('GET', '/api/metaday', 'none', { post: noOurs }),
  R('GET', '/api/daycheck/now', 'need', { strip: ['fresh', 'web'] }),   // a client never triggers the paid re-read or web search (2026-10-27)
  R('POST', '/api/daycheck', 'opt', { cap: ['clientAsk', 0.02], post: verdictForClient }),
  /* The AI read at the top of a screen (never the command center's). */
  R('POST', '/api/read', 'opt', { deny: b => (b && b.screen === 'command' ? 'The command center is the agency view.' : null), cap: ['clientAsk', 0.02] }),
  R('GET', '/api/plan'),
  R('PUT', '/api/plan'),
  R('POST', '/api/plan-agree'),
  R('POST', '/api/plan-share'),
  R('PUT', '/api/goals', 'need', { audit: 'goals' }),
  R('GET', '/api/quarter'),
  R('GET', '/api/rhythm'),
  R('GET', '/api/goal-suggest'),
  /* Requests and approvals (requests.js): the handler checks every item id against the brand. */
  R('GET', '/api/requests'),
  R('POST', '/api/requests'),
  R('POST', '/api/requests/reply'),
  R('POST', '/api/requests/decide'),
  /* Production (2026-10-14, prodwork.js): the brand's own Needs you + Coming up, a card's sheet, a comment or a note on
     a file, and Approve / Ask for changes on what the team sent them (the handler checks needs_client). Never the team
     board, a drag, a new brief, an upload, the review link, the mirror or Asana. */
  R('GET', '/api/production'),
  R('GET', '/api/production/card', 'none', { own: [{ in: 'query', key: 'id', table: 'p_br_batch' }] }),
  R('POST', '/api/production/comment', 'none', { own: [{ in: 'body', key: 'id', table: 'p_br_batch' }] }),
  R('POST', '/api/production/comment/delete', 'none', { own: [{ in: 'body', key: 'comment_id', table: 'p_work_comment' }] }),
  R('POST', '/api/production/decide', 'none', { own: [{ in: 'body', key: 'id', table: 'p_br_batch' }] }),

  /* ---- ADS: Today, All channels, Meta (every job), Google (every job), TikTok, Tests and angles ---- */
  R('GET', '/api/hub/today'),
  R('GET', '/api/hub/paid'),
  R('GET', '/api/hub/moved'),   // the "moved" nudge items (2026-10-27)
  /* Today's calls: Done / Not now are the Buyer list's shared state; the handler holds a client to its brands (2026-10-27) */
  R('GET', '/api/buyer-list'),   // Ads > Calls, read only, the client's own brand (2026-11-05); every other buyer-list route is the team's
  R('GET', '/api/buyer-list/state'),
  R('GET', '/api/trybe/video'),   // press play on one of the client's own creator videos (a 20 minute link from Trybe)
  R('GET', '/api/trybe'),   // Ads > Trybe: Live and Creators for the client's own brand; the handler trims the rest (2026-11-05)
  R('POST', '/api/buyer-list/state', 'need', { fields: ['object', 'action', 'status', 'name'] }),
  /* The Lucky HQ login only (hq: true): the team's Calls page for Lucky. Yes / No, why not, the ads behind a row,
     what launched. Each handler holds the caller to its brands (buyerlist.js `only`). Settings, the Slack post, the
     morning read and "What we did" to the client channel stay the team's. */
  R('POST', '/api/buyer-list/decision', 'need', { hq: true }),
  R('POST', '/api/buyer-list/decide', 'need', { hq: true }),
  R('POST', '/api/buyer-list/disagree', 'need', { hq: true }),
  R('GET', '/api/buyer-list/ads', 'need', { hq: true }),
  R('GET', '/api/buyer-list/launched', 'need', { hq: true }),
  R('GET', '/api/buyer-list/ready-check', 'need', { hq: true }),
  R('GET', '/api/buyer-list/lessons', 'need', { hq: true }),
  R('GET', '/api/hub/drill'),
  R('GET', '/api/hub/orders'),
  R('GET', '/api/hub/customer'),
  R('GET', '/api/hub/creative'),
  R('GET', '/api/hub/ad-days'),
  R('GET', '/api/meta/live'),
  /* Meta, Google and Klaviyo changes go through the SAME propose / confirm path the team uses (metawrite.js,
     google.js, klaviyowrite.js); the handler re-checks the brand with brandsFor, which answers the client's brands. */
  R('GET', '/api/meta/write'),
  R('POST', '/api/meta/write'),
  R('POST', '/api/meta/undo'),
  R('GET', '/api/launch/list'),
  R('POST', '/api/launch/prep'),
  R('POST', '/api/launch/preview'),
  R('POST', '/api/launch/create'),
  R('GET', '/api/series'),
  R('GET', '/api/pacing'),
  R('GET', '/api/creative'),
  R('GET', '/api/ads'),
  R('GET', '/api/activities'),
  R('GET', '/api/ad-updates'),
  R('POST', '/api/activities'),
  RX('PATCH', /^\/api\/activities\/([^/]+)$/, 'none', { own: [{ in: 'path', table: 'activities' }] }),
  R('POST', '/api/summarise', 'need', { cap: ['clientAsk', 0.05], deny: b => (!b || typeof b.act !== 'string' || !b.act ? 'Pick your brand first.' : null) }),
  R('GET', '/api/ad-creatives', 'need', { ads: 'ads' }),
  R('GET', '/api/ad-video', 'none', { ads: 'ad' }),
  R('GET', '/api/ad-breakdown', 'none', { ads: 'ad' }),
  R('POST', '/api/ad-share'),
  R('GET', '/api/your-ads-link'),
  /* Site reviews (sitereview.js): read, answer and send their own brand's review. The list, the link and reopen stay team only. */
  R('GET', '/api/site-review'),
  R('PUT', '/api/site-review/answer'),
  R('POST', '/api/site-review/send'),
  R('GET', '/api/google/ads'),
  R('GET', '/api/google/ads-ads'),
  R('GET', '/api/google/ads-terms'),
  R('GET', '/api/google/ads-changes'),
  R('POST', '/api/google/write'),
  /* The leak finder (2026-10-13, leaks.js): the brand's own ranked list, and the negative keyword Apply / Undo (a Google
     write, the same reach as /api/google/write). A client's ?fresh=1 is ignored, so the hourly judge is never re-bought. */
  R('GET', '/api/leaks'),
  R('POST', '/api/leaks/apply'),
  R('POST', '/api/leaks/undo'),
  /* Push back on a leak (leakctx.js lessons): a client's is always its own brand's, never every brand's. */
  R('GET', '/api/leaks/lessons', 'need', { postIds: ownLessons }),
  R('POST', '/api/leaks/lesson'),
  R('DELETE', '/api/leaks/lesson', 'need'),
  R('POST', '/api/leaks/decide'),
  R('GET', '/api/tiktok/report'),
  R('GET', '/api/brand/tests-overview', 'none'),
  R('POST', '/api/brand-asana/mins'),
  R('POST', '/api/brand-asana/tested', 'need', { cap: ['clientAsk', 0.02] }),

  /* ---- EMAIL AND SMS ---- */
  R('GET', '/api/hub/email'),
  R('GET', '/api/klaviyo'),
  R('POST', '/api/klaviyo/write'),

  /* ---- STORE: Sales, Customers, Website, Search ---- */
  R('GET', '/api/hub/store'),
  R('GET', '/api/customers'),
  R('GET', '/api/cohorts'),
  R('POST', '/api/cohort-sync'),
  R('GET', '/api/survey'),
  R('PUT', '/api/survey'),
  R('DELETE', '/api/survey'),
  R('GET', '/api/google/website'),
  R('GET', '/api/google/website-drill'),
  R('GET', '/api/google/search'),
  R('GET', '/api/clarity'),
  R('PUT', '/api/clarity'),
  R('DELETE', '/api/clarity'),
  R('GET', '/api/store-view'),

  /* ---- PRODUCTS: Stock, Buying and Drops (2026-10-12, Cole: "the brand itself is the owner of the brand; buying and
     stock changes is literally a brand thing"). The brand reads its whole stock state through /api/supply/client
     (stock.js supplyClient: its own factories, costs and notes included; only the agency's Slack and Asana wiring is
     left out) and makes every Supply change the team can, through the account-health proxy (stock.js
     handleSupplyProxy), which resolves the Supply brand from the client's OWN Locus brand and ignores any `brand` it
     sends, forwards with SUPPLY_TOKEN and names the client in X-Actor. The proxy also holds /settings to the stock
     rules and /brand to buys and makes (never the Slack channel, the Asana project or the brand's act_id). ---- */
  R('GET', '/api/supply/client'),
  R('GET', '/api/hub/stockads'),
  R('POST', '/api/supply/orders'),
  RX('PUT', /^\/api\/supply\/orders\/[\w%.:-]+$/, 'need'),
  RX('DELETE', /^\/api\/supply\/orders\/[\w%.:-]+$/, 'need'),
  RX('PUT', /^\/api\/supply\/products\/\d+$/, 'need'),
  R('POST', '/api/supply/slots'),
  R('PUT', '/api/supply/slots'),
  RX('DELETE', /^\/api\/supply\/slots\/[\w%.:-]+$/, 'need'),
  RX('GET', /^\/api\/supply\/slots\/[\w%.:-]+\/asana$/, 'need'),
  RX('POST', /^\/api\/supply\/slots\/[\w%.:-]+\/asana$/, 'need'),
  R('POST', '/api/supply/collections'),
  R('PUT', '/api/supply/collections'),
  RX('DELETE', /^\/api\/supply\/collections\/[\w%.:-]+$/, 'need'),
  R('POST', '/api/supply/shopify/snapshot'),
  R('POST', '/api/supply/shopify/backfill', 'need', { deny: (b, url) => (+(url.searchParams.get('days') || (b && b.days)) > 400 ? 'Your login re-reads up to 400 days; ask us for a longer re-pull.' : null) }),
  R('PUT', '/api/supply/settings', 'need', { fields: ['buffer_days', 'cover_days', 'site_prep_days', 'dead_days', 'design_days', 'sample_make_days', 'slack_days'] }),
  R('PUT', '/api/supply/brand', 'need', { fields: ['buys', 'makes'] }),
  R('PUT', '/api/supply/factories'),
  RX('DELETE', /^\/api\/supply\/factories\/[\w%.:-]+$/, 'need'),
  R('PUT', '/api/supply/lines'),
  RX('DELETE', /^\/api\/supply\/lines\/[\w%.:-]+$/, 'need'),
  R('PUT', '/api/supply/type-map'),
  R('PUT', '/api/supply/categories'),
  RX('DELETE', /^\/api\/supply\/categories\/[\w%.:-]+$/, 'need'),

  /* ---- CREATIVE: AI ads (Studio + Words), Creators, Library, Inspiration ---- */
  R('GET', '/api/studio'),
  R('GET', '/api/studio/products'),
  R('GET', '/api/studio/asana'),
  R('POST', '/api/studio/upload', 'none'),
  S_('status'), S_('save'), S_('revert'), S_('make', { act: 'need' }), S_('make-exact', { act: 'need' }), S_('dress', { act: 'need' }), S_('read'), S_('lift'), S_('art'),
  S_('vary'), S_('change'), S_('extend'), S_('story'), S_('finalize'), S_('harmonize'), S_('dna', { act: 'need' }),
  R('POST', '/api/studio/batch/save', 'need', { own: [{ in: 'body', key: 'batch.id', ...BATCH }, { in: 'body', key: 'batch.br_batch_id', table: 'p_br_batch' }] }),
  R('POST', '/api/studio-ai/plan', 'need', { cap: ['clientStudio', 0.3] }),
  R('POST', '/api/studio-ai/brief', 'need', { cap: ['clientStudio', 0.2] }),
  R('POST', '/api/studio-ai/video-shot', 'need', { cap: ['clientStudio', 0.05] }),
  R('POST', '/api/studio-ai/video-estimate'),
  R('POST', '/api/studio-ai/video-create', 'need', { cap: ['clientStudio', 1.5] }),
  R('POST', '/api/studio-ai/animate', 'need', { cap: ['clientStudio', 1.5] }),
  R('POST', '/api/studio-ai/videos'),
  R('POST', '/api/studio-ai/video-delete'),
  R('POST', '/api/studio-ai/upload'),
  /* Words (the copy desk, voice.js): write, keep or reject lines, edit the brand's speaker and skill files. Building a
     whole skill or speaker from scratch stays the team's (a long Opus job). */
  R('POST', '/api/voice/staff/desk', 'need', { cap: ['clientStudio', 0.15] }),
  R('POST', '/api/voice/staff/split', 'need', { cap: ['clientStudio', 0.2] }),
  R('POST', '/api/voice/staff/guide', 'need', { cap: ['clientStudio', 0.3] }),
  R('POST', '/api/voice/staff/bank'),
  R('POST', '/api/voice/staff/speaker'),
  R('POST', '/api/voice/staff/skill-file'),
  R('POST', '/api/voice/staff/ask-gaps'),
  /* Creators (the creator link, amb.js): every handler is scoped to the act it is given. */
  R('GET', '/api/amb'),
  R('GET', '/api/amb/ads'),
  R('GET', '/api/amb/board-ads'),   // the "From our ads" picker on the Creators page (2026-10-27)
  /* the creator link itself, read by the Creators page: the slug must be the brand's own board (2026-10-27) */
  RX('GET', /^\/api\/angles\/([a-z0-9-]{1,50})$/, 'none', { own: [{ in: 'path', table: 'p_amb_brand', idcol: 'slug' }] }),
  R('GET', '/api/amb/season'),
  R('POST', '/api/amb/setup'),
  R('PUT', '/api/amb/brand'),
  R('POST', '/api/amb/section'),
  R('DELETE', '/api/amb/section'),
  R('POST', '/api/amb/order'),
  R('POST', '/api/amb/angle'),
  R('DELETE', '/api/amb/angle'),
  R('POST', '/api/amb/proof'),
  R('DELETE', '/api/amb/proof'),
  R('POST', '/api/amb/upload'),
  RX('GET', /^\/api\/amb\/file\/([a-f0-9]{16})$/, 'none', { own: [{ in: 'path', table: 'p_amb_proof' }] }),
  /* Inspiration: the brand's Atria board and the shared season boards (atria.js checks the board is one of those). */
  R('GET', '/api/atria/board'),
  R('GET', '/api/assets'),
  R('GET', '/api/assets/file'),
  R('POST', '/api/assets/remove'),

  /* ---- BRAND: Client answers, Research, Voice (research runs and skill builds stay the team's: long AI jobs) ---- */
  R('GET', '/api/brand', 'need', { post: noDocSecrets }),
  R('GET', '/api/brand/ads'),
  R('GET', '/api/brand/rules'),
  R('PUT', '/api/brand/rules', 'need', { audit: 'ad rules' }),
  R('POST', '/api/brand/save'),
  R('POST', '/api/brand/save-many'),
  R('POST', '/api/brand/del'),
  R('POST', '/api/brand/merge'),
  R('POST', '/api/brand/tag', 'need', { bodyAds: ['ad_ids', 'ad_id'] }),   // only the brand's own ads (2026-11-05 audit)
  R('POST', '/api/brand/verdict'),
  R('PUT', '/api/brand/doc', 'need', { deny: docDeny }),
  R('POST', '/api/brand/onboard'),
  R('PUT', '/api/brand/onboard'),

  /* ---- SOCIAL (2026-10-19, social.js): the brand's own Watch feed, its follows and saved posts, switched on for its
     own brand. Make ours and sending a draft on stay the team's (the handler refuses them for a client). ---- */
  R('GET', '/api/social/brands', 'none'),
  R('PUT', '/api/social/brand', 'need', { fields: ['on'] }),
  R('GET', '/api/social'),
  R('POST', '/api/social/follow', 'need', { fields: ['kind', 'text', 'name', 'ig', 'tt', 'yt'], cap: ['clientAsk', 0.05] }),   // each follow pulls posts (scraper credits); 40 a brand in social.js, ~40 a day here
  R('PUT', '/api/social/follow', 'none', { own: [{ in: 'body', key: 'id', table: 'social_follow' }] }),
  R('DELETE', '/api/social/follow', 'none', { own: [{ in: 'query', key: 'id', table: 'social_follow' }] }),
  R('POST', '/api/social/save', 'none', { own: [{ in: 'body', key: 'id', table: 'social_post' }] }),
  R('POST', '/api/social/transcript', 'none', { own: [{ in: 'body', key: 'id', table: 'social_post' }] }),
  R('POST', '/api/social/video', 'none', { own: [{ in: 'body', key: 'id', table: 'social_post' }] }),
  R('GET', '/api/social/idea', 'none', { own: [{ in: 'query', key: 'id', table: 'social_post' }] }),
  /* Phase 2 (socialpost.js, 2026-10-19): the brand's own Week, tray, posts and captions. Connecting an account, its mode
     and the Pages list stay the team's (the handler refuses them for a client). */
  R('GET', '/api/social/accounts'),
  R('GET', '/api/social/week'),
  R('GET', '/api/social/tray'),
  R('POST', '/api/social/upload'),
  R('GET', '/api/social/post', 'none', { own: [{ in: 'query', key: 'id', table: 'social_post_out' }] }),
  R('POST', '/api/social/post', 'need', { fields: ['id', 'at', 'now', 'caption', 'media', 'targets', 'status', 'auto'] }),
  R('DELETE', '/api/social/post', 'none', { own: [{ in: 'query', key: 'id', table: 'social_post_out' }] }),
  R('POST', '/api/social/post/byhand', 'none', { own: [{ in: 'body', key: 'id', table: 'social_post_out' }] }),
  R('POST', '/api/social/post/retry', 'none', { own: [{ in: 'body', key: 'id', table: 'social_post_out' }] }),
  R('GET', '/api/social/captions'),
  R('POST', '/api/social/captions', 'need', { fields: ['text'] }),
  R('DELETE', '/api/social/captions', 'none', { own: [{ in: 'query', key: 'id', table: 'social_caption' }] }),
  R('POST', '/api/social/rephrase', 'need', { fields: ['text', 'note'], cap: ['clientAsk', 0.01] }),
  R('GET', '/api/social/results'),
  R('GET', '/api/social/grid'),   // the Week's Instagram preview (2026-10-27)
  R('POST', '/api/social/slides', 'none', { own: [{ in: 'body', key: 'id', table: 'social_post' }] }),
  R('POST', '/api/social/post/now', 'none', { own: [{ in: 'body', key: 'id', table: 'social_post_out' }] }),

  /* ---- CALENDAR: read, add, edit, move, set the end, note, remove and put back. Never tick the team's work steps
     or make Asana tasks (Mobius's Asana). The handler checks each date's own brand. ---- */
  R('GET', '/api/calendar'),
  R('GET', '/api/calendar/history', 'none', { cal: true }),
  R('POST', '/api/calendar/event', 'need', { cal: true }),
  R('DELETE', '/api/calendar/event', 'none', { cal: true }),
  R('POST', '/api/calendar/restore', 'none', { cal: true }),
  R('POST', '/api/calendar/move', 'none', { cal: true }),
  R('POST', '/api/calendar/end', 'none', { cal: true }),
  R('POST', '/api/calendar/comment', 'none', { cal: true }),

  /* ---- REPORTS: the Daily Brief and the weekly and monthly reports as SENT (never a draft, the review or the send),
     Dashboards of their own brand ---- */
  R('GET', '/api/briefs', 'need', { post: sentOnlyList }),
  R('GET', '/api/brief', 'need', { post: briefSent }),
  R('GET', '/api/reports', 'need', { post: sentOnlyList }),
  R('GET', '/api/report', 'need', { post: sentOnlyOne }),
  R('POST', '/api/report-link'),
  /* Save to Locus (2026-10-21): a client saves and reads inspiration for its own brand. */
  R('GET', '/api/inspo', 'need'),
  R('POST', '/api/inspo', 'need'),
  R('PATCH', '/api/inspo', 'none', { own: [{ in: 'body', key: 'id', table: 'p_inspo' }] }),
  R('DELETE', '/api/inspo', 'none', { own: [{ in: 'query', key: 'id', table: 'p_inspo' }] }),
  R('GET', '/api/dashboards', 'need', { postIds: ownDash }),
  R('GET', '/api/dashboard', 'none', { own: [{ in: 'query', key: 'id', table: 'p_dashboard' }] }),
  R('PUT', '/api/dashboard', 'need', { own: [{ in: 'body', key: 'id', table: 'p_dashboard' }], prep: keepDashPosting }),
  R('DELETE', '/api/dashboard', 'none', { own: [{ in: 'query', key: 'id', table: 'p_dashboard' }] }),
  /* Public snapshot links (share.js Export): the handler checks the brand with brandsFor. */
  R('POST', '/api/snapshot'),
  R('GET', '/api/snapshots', 'none'),
  R('POST', '/api/snapshot/revoke', 'none'),

  /* ---- SEASON: War Room and The Plan ---- */
  R('GET', '/api/season'),
  R('GET', '/api/season/war'),
  R('PUT', '/api/season/war'),
  R('GET', '/api/season/live'),
  R('PUT', '/api/season/answer', 'need', { deny: b => (String(b && b.key || '').toLowerCase() === 'war' ? 'Edit the plan on The Plan page.' : null) }),
  R('PUT', '/api/season/checkin'),
  R('PUT', '/api/season/phase'),
  R('DELETE', '/api/season/phase'),
  R('PUT', '/api/season/task'),
  R('DELETE', '/api/season/task'),
  R('POST', '/api/season-share'),
  R('GET', '/api/tw-day'),

  /* ---- TOOLS: Scenarios (Platform status reads the public Pulse feed) ---- */
  R('GET', '/api/scenario'),
  R('PUT', '/api/scenario', 'need', { own: [{ in: 'body', key: 'id', table: 'p_scenario' }] }),
  R('DELETE', '/api/scenario', 'none', { own: [{ in: 'query', key: 'id', table: 'p_scenario' }] }),
  R('POST', '/api/scenario-parse', 'none', { cap: ['clientAsk', 0.01] }),

  /* ---- BRAND SETTINGS for their own brand: About, Ads rules, Data and costs, Integrations (their own keys) ---- */
  R('GET', '/api/accounts', 'none', { post: noDiscover }),
  RX('PUT', /^\/api\/accounts\/(brand_[a-z0-9_]+|act_\d+)$/, 'path', { fields: BRAND_FIELDS, audit: 'brand settings' }),
  R('GET', '/api/integrations', 'none', { post: clientIntegrations }),
  R('PUT', '/api/brand-links', 'need', { fields: LINK_FIELDS }),

  /* ---- the assistant: the SAME engine as the team (clients.js clientAsk), pinned to the brand, $2 a day ---- */
  R('POST', '/api/ask'),
  R('GET', '/api/ask/progress', 'none'),
  R('POST', '/api/ask/stop', 'none'),
];

/* A dashboard a client edits keeps the Slack posting the team set on it (channel and schedule are the team's). */
async function keepDashPosting(env, body) {
  const id = String(body?.id || '');
  const row = /^db_[0-9a-f]{10}$/.test(id) ? await env.DB.prepare(`SELECT schedule, channel FROM p_dashboard WHERE id = ?1`).bind(id).first().catch(() => null) : null;
  return { ...body, schedule: row?.schedule || '', channel: row?.channel || '' };
}

/* Keys a client never sees: the sending setup, Slack, team-internal notes and Mobius's own wiring. */
const ALWAYS_OUT = new Set(['by', 'created_by', 'agreed_by', 'slack_channel', 'brief_channel', 'client_channel', 'internal_channel', 'report_config', 'report_config_json', 'review_first', 'brief_enabled', 'slack_ts', 'sent_channel', 'steer',
  'lastRun', 'team', 'storage_prefix', 'tw_shop_token', 'shopify_token', 'access_token', 'notes_internal', 'internal_notes', 'team_notes']);
/* A Slack channel id under any key that names a channel ("channel", "posts_to"...), wherever it sits. */
const SLACK_ID = /^[CGD][A-Z0-9]{8,12}$/;
export function scrub(v, parent = '') {
  if (Array.isArray(v)) return v.map(x => scrub(x, parent));
  if (!v || typeof v !== 'object') return v;
  const o = {};
  for (const [k, x] of Object.entries(v)) {
    /* Get started's connect list (onboard.js) has two layers per platform, `layers.team` (give us access) and
       `layers.app`: that `team` is the client's own to-do, not team-internal data, so it stays. */
    if (ALWAYS_OUT.has(k) && !(k === 'team' && parent === 'layers')) continue;
    if (typeof x === 'string' && SLACK_ID.test(x) && /channel|post|slack/i.test(k)) continue;
    o[k] = scrub(x, k);
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

const dig = (o, key) => String(key || 'id').split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);
/** Every record the request names by id belongs to one of the client's brands (or does not exist yet). */
async function recordsOwned(env, specs, { body, url, match }, allowed) {
  for (const s of specs) {
    const raw = s.in === 'path' ? (match && match[1] ? decodeURIComponent(match[1]) : '') : s.in === 'query' ? url.searchParams.get(s.key || 'id') : dig(body, s.key);
    if (raw == null || raw === '') continue;
    if (typeof raw !== 'string' || raw.length > 200) return false;
    const col = s.col || 'act_id', idcol = s.idcol || 'id';
    const row = await env.DB.prepare(`SELECT ${col} AS b FROM ${s.table} WHERE ${idcol} = ?1`).bind(raw).first().catch(() => null);
    if (!row) continue;
    if (!row.b || !allowed.has(String(row.b))) return false;
  }
  return true;
}

/* The only routes a client may send a non-JSON body to (multipart or raw media). */
const UPLOAD_ROUTES = new Set(['/api/studio/upload', '/api/studio-ai/upload', '/api/amb/upload', '/api/social/upload']);

const CLIENT_NO = 'Your Locus login has everything about your own brand. That part runs the agency itself, so it is for the Mobius team; ask us in Slack if you need it.';

/* What a read-only client login (not Lucky HQ) may still send: approve or ask for changes, comment,
   its own requests, its own prefs and bell, and reading. Every other write is refused. */
const READONLY_CLIENT_MAY = new Set([
  'POST /api/production/decide', 'POST /api/production/comment', 'POST /api/production/comment/delete',
  'POST /api/requests', 'POST /api/requests/reply', 'POST /api/requests/decide', 'POST /api/requests/done',
  'PUT /api/me/prefs', 'POST /api/me/morning', 'PUT /api/me/delivery', 'POST /api/notices/done', 'PUT /api/clients/me',
  'POST /api/read', 'POST /api/daycheck', 'POST /api/summarise',
]);

/* ---------------- the Get started hold (2026-11-26, Cole: a new client finishes setting up before the rest opens) ----------------
   onboard.js onboardGate is the answer /api/me gives the screens (profit/v5 gate.js); this is the same rule on the
   server, so a held brand's data never leaves even when a screen asks for it. Held = a p_onboard row with the gate on,
   not finished, and a step it shows still open (onbSteps + onbHeld, which onboard.js uses too). Never held: an old client
   (no row), a finished row, the team and the owner (they are not clients). Per brand: a client with a running brand keeps
   it while the new one is set up. While a brand is held its client may still open every onb route (Get started, the
   profile, the bell) and SETUP_MAY below (its own brand list, Message the team, its own prefs and delivery). A one-job
   colleague (onlyOnboard) is already held to the onb routes above all this. Refused: 403 {error, gated: true}.
   Cost: one D1 read per client request on a route that is not part of setting up. "Nothing held" is kept 30 seconds per
   brand list; a held answer is never kept, so finishing opens the app on the very next request. */
export const onbSteps = row => (!row.extras ? ['connect'] : ONB_STEPS.filter(k => k !== 'sign_pay' || row.sign_pay));
/** Is this p_onboard row holding its brand? `steps` = its steps_json, read. */
export const onbHeld = (row, steps) => !!row && !!row.gate && !row.finished_at && onbSteps(row).some(k => !((steps || {})[k] || {}).done_at);
export const SETUP_MAY = new Set([
  'GET /api/brands', 'GET /api/requests', 'POST /api/requests', 'POST /api/requests/reply',
  'GET /api/me/prefs', 'PUT /api/me/prefs', 'GET /api/me/delivery', 'PUT /api/me/delivery', 'POST /api/notices/done',
]);
export const GATED = 'Finish setting up first.';
const NOT_HELD = new Map();   // sorted brand list -> kept until (ms); per isolate
const NOT_HELD_MS = 30e3;
/** Drop the kept "nothing held" answers (a row was made or reopened); only this isolate's, the rest lapse in 30 seconds. */
export function forgetHeld() { NOT_HELD.clear(); }
/** The client's brands held on Get started (a Set of brand ids; empty = none). */
export async function heldBrands(env, brands) {
  const list = [...new Set((brands || []).filter(b => /^brand_[a-z0-9_]+$/.test(b)))];
  if (!list.length || !env || !env.DB) return new Set();
  const key = [...list].sort().join(',');
  const until = NOT_HELD.get(key);
  if (until && until > Date.now()) return new Set();
  const ph = list.map((_, i) => `?${i + 1}`).join(',');
  /* No p_onboard table (no client was ever set up here) or a failed read = nothing held, the same as /api/me. A failed
     read is not kept: the next request asks again, so one bad read opens a held brand for that request only. */
  const got = await env.DB.prepare(`SELECT act_id, extras, sign_pay, gate, steps_json, finished_at FROM p_onboard WHERE act_id IN (${ph}) AND gate = 1 AND finished_at IS NULL`).bind(...list).all().catch(() => null);
  const rows = (got || {}).results || [];
  const held = new Set();
  for (const r of rows) { let st = {}; try { st = JSON.parse(r.steps_json || '{}') || {}; } catch {} if (onbHeld(r, st)) held.add(String(r.act_id)); }
  if (got && !held.size) { if (NOT_HELD.size > 500) NOT_HELD.clear(); NOT_HELD.set(key, Date.now() + NOT_HELD_MS); }
  return held;
}
/** Every id a person may see right now with the Get started hold applied: a client's held brands are left out (a
 *  one-job colleague sees none); anyone else is brandsFor (null = every brand). For senders with no request, such as
 *  the morning DM, which the guard never sees. */
export async function openIdsFor(env, email) {
  const client = await clientOf(env, email).catch(() => null);
  if (!client) return brandsFor(env, email);
  if (client.onlyOnboard) return new Set();
  const ids = await clientIds(env, client);
  const held = await heldBrands(env, client.brands);
  if (!held.size) return ids.all;
  const all = new Set();
  for (const [b, s] of ids.of) if (!held.has(b)) for (const x of s) all.add(x);
  return all;
}

/* ---------------- a client's own change, logged (2026-11-26, Cole: clients change their goals and ad rules) ----------------
   One manual activities row (filed under the brand's primary Meta account, else the brand id) and one bell note per team
   person (p_notice): the owner and the team on the brand's latest New client run. Only the NEW values are named (the
   guard never reads the before value). Never throws: the change itself already happened. */
const AUDIT_WORDS = { target_roas: 'the goal ROAS', target_cpa: 'the goal cost', monthly_budget: 'the monthly ad budget', budgets: 'the monthly budgets', name: 'the brand name', tz: 'the time zone', goals: 'the monthly goals',
  sales: 'the sales goal', spend: 'the spend goal', amer: 'the new customer MER goal', judge_spend: 'the spend before an ad is judged', judge_days: 'the days before an ad is judged', goal_metric: 'the goal measure',
  /* The ad call rules (profit brand.js TEST_KEYS), in plain words. */
  cr_judge_x: 'how many goals an ad set spends before it is judged', cr_min_days: 'the days an ad set runs before it is judged',
  cr_scale_buys: 'the sales on goal before an ad set is scaled', cr_cut_zero_x: 'how many goals an ad set spends with no sale before it is cut',
  cr_cut_spend_x: 'how many goals an ad set spends over the line before it is cut', cr_cut_cpa_x: 'how far over the goal cost an ad set is cut',
  cr_anchor_pct: 'the spend share that makes an ad the anchor of its set', goal_ncpa: 'the goal cost per new customer', goal_cpl: 'the goal cost per lead',
  goal_meta: 'the Meta goal', goal_google: 'the Google goal', goal_tiktok: 'the TikTok goal', min_days: 'the days a test runs at least',
  yellow_pct: 'the warning line', min_cap_pct: 'the smallest spend cap', win_roas: 'the winning ROAS', lose_roas: 'the losing ROAS' };
const auditMoney = new Set(['target_cpa', 'monthly_budget', 'sales', 'spend', 'judge_spend', 'goal_ncpa', 'goal_cpl']);
function auditValue(k, v) {
  if (v === null || v === '') return 'nothing';
  if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v))) return auditMoney.has(k) ? `$${Number(v).toLocaleString('en-US')}` : String(Number(v));
  if (typeof v === 'object') return 'new values';
  return String(v).replace(/[\r\n]+/g, ' ').slice(0, 40);
}
export function auditSummary(who, what, body) {
  const src = body && typeof body === 'object' ? (body.rules && typeof body.rules === 'object' ? body.rules : body) : {};
  const parts = Object.entries(src).filter(([k]) => !['act', 'act_id', 'month', 'rules_v'].includes(k)).slice(0, 5)
    .map(([k, v]) => `${AUDIT_WORDS[k] || k.replace(/_/g, ' ')} to ${auditValue(k, v)}`);
  return `${who} changed ${parts.length ? parts.join(', ') : `the ${what}`}`.slice(0, 300);
}
export async function clientAudit(env, client, what, act, path, body) {
  try {
    const who = client.name || client.email;
    const summary = auditSummary(who, what, body);
    const at = new Date().toISOString();
    const meta = await env.DB.prepare(`SELECT external_id FROM connections WHERE brand_id = ?1 AND kind = 'meta' ORDER BY is_primary DESC LIMIT 1`).bind(act || '').first().catch(() => null);
    await env.DB.prepare(`INSERT INTO activities (id, act_id, event_time, event_type, category, summary, note, confirmed, manual, actor, object_type, object_id, extra_json)
      VALUES (?1, ?2, ?3, 'client_change', 'goal', ?4, ?5, 1, 1, ?6, 'BRAND', ?7, ?8)`)
      .bind(`manual:${crypto.randomUUID()}`, meta?.external_id || act || '', at, summary, 'Changed by the brand in Locus.', `${who} (client)`, act || '', JSON.stringify({ path, what, body: body || null }).slice(0, 4000)).run().catch(() => {});
    const team = new Set([lower(env.OWNER_EMAIL || OWNER)]);
    const run = await env.DB.prepare(`SELECT team_json FROM p_newclient WHERE act_id = ?1 ORDER BY created_at DESC LIMIT 1`).bind(act || '').first().catch(() => null);
    let tj = {}; try { tj = JSON.parse(run?.team_json || '{}') || {}; } catch {}
    for (const v of Object.values(tj)) for (const e of String(v || '').split(/[,\s]+/)) if (/@/.test(e)) team.add(lower(e));
    /* Every existing client has no New client run: the brand's team is then whoever settings.userBrands gives the
       brand to (its old ids count too), so the buyer on the brand hears about it, not only the owner. */
    if (team.size === 1 && act) {
      const ids = new Set([act]);
      const al = (await env.DB.prepare(`SELECT alias AS id FROM brand_alias WHERE brand_id = ?1 UNION SELECT legacy_key FROM brands WHERE id = ?1 AND legacy_key IS NOT NULL UNION SELECT slug FROM brands WHERE id = ?1`).bind(act).all().catch(() => ({ results: [] }))).results || [];
      for (const r of al) if (r.id) ids.add(String(r.id));
      const ub = await settingJson(env, 'userBrands', {});
      for (const [e, list] of Object.entries(ub || {})) if (Array.isArray(list) && list.some(x => ids.has(String(x))) && /@/.test(e)) team.add(lower(e));
    }
    for (const person of team) {
      await env.DB.prepare(`INSERT INTO p_notice (id, org_id, person_id, brand_id, kind, title, state, home, sent_json, created_at) VALUES (?1, 'default', ?2, ?3, 'tell', ?4, 'open', 1, ?5, ?6)`)
        .bind('nt_' + crypto.randomUUID().replace(/-/g, '').slice(0, 14), person, act || null, summary, JSON.stringify({ bell: at }), at).run().catch(() => {});
    }
    return { summary };
  } catch { return null; }
}

async function guardClient(request, env, client, handle, CORS) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const m = request.method;
  const out = (status, error) => new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
  let match = null;
  const rule = CLIENT_RULES.find(r => r.m === m && (!r.hq || client.hq === true) && (r.p ? r.p === path : (match = path.match(r.re))));
  if (!rule) return out(403, CLIENT_NO);
  if (client.onlyOnboard && !rule.onb) return out(403, 'Your login is for one setup job. Open your link to finish it.');
  if (client.readOnly === true && m !== 'GET' && m !== 'HEAD') {
    if (client.hq === true) return out(403, 'You can read Ads here. Pressing calls, launching and changing ads is switched off for you in Lucky HQ (Settings, People).');
    /* A read-only client login (clients.js, users[e].readOnly): it may look and approve, nothing else. */
    if (!READONLY_CLIENT_MAY.has(m + ' ' + path)) return out(403, 'Your login can look and approve. Changing ads, costs or goals is switched off for it. Ask your team.');
  }
  if (rule.p) match = null;
  /* A login with no brand left (Cole removed the last one) opens nothing at all. */
  if (!client.brands.length) return out(401, 'unauthorized');
  let ids = await clientIds(env, client);
  /* The Get started hold (heldBrands above): on a route that is not part of setting up, a held brand is taken out of
     what this request may name, own and see. Every brand held = refused outright; another brand of theirs still opens. */
  const gated = () => new Response(JSON.stringify({ error: GATED, gated: true }), { status: 403, headers: { 'Content-Type': 'application/json', ...CORS } });
  const full = ids.all;
  let heldIds = null;
  if (!rule.onb && !SETUP_MAY.has(m + ' ' + path) && !client.onlyOnboard) {
    const held = await heldBrands(env, client.brands);
    if (held.size) {
      if (client.brands.every(b => held.has(b))) return gated();
      const of = new Map([...ids.of].filter(([b]) => !held.has(b)));
      const all = new Set(); for (const s of of.values()) for (const x of s) all.add(x);
      heldIds = new Set([...full].filter(x => !all.has(x)));
      ids = { of, all };
    }
  }
  /* A brand that is theirs but held answers "finish setting up"; anything else is not theirs. */
  const noBrand = v => (heldIds && heldIds.has(v) ? gated() : out(403, 'You do not have access to that brand.'));
  /* The brand named by the request: the query's act, the JSON body's act / act_id / screen.act_id, or the path. */
  /* EVERY brand field the request carries must be one of the client's brands (2026-10-14 audit): a body act sent as
     an array slipped past a string-only check and resolveBrandId turned it into another brand; a body act_id beside
     a matching act was never checked; a JSON body sent as text/plain was never read. So: the query's act / act_id
     (every copy; `brand` is the Supply proxy's own slug, overridden there), and the body's act / act_id /
     screen.act_id whatever the Content-Type, each a string
     that is theirs, or the request is refused. */
  const deniedAct = 'You do not have access to that brand.';
  const qActs = ['act', 'act_id'].flatMap(k => url.searchParams.getAll(k)).filter(v => v !== '');
  for (const v of qActs) if (v === 'all' || !ids.all.has(v)) return v === 'all' ? out(403, deniedAct) : noBrand(v);
  let act = url.searchParams.get('act') || url.searchParams.get('act_id') || null;
  let body = null;
  if (m !== 'GET' && m !== 'HEAD') {
    const ct = request.headers.get('Content-Type') || '';
    if (!/multipart\/form-data|octet-stream|^image\/|^video\/|^audio\//i.test(ct)) {
      try { const t = await request.clone().text(); body = t && /^\s*[{[]/.test(t) ? JSON.parse(t) : null; } catch { body = null; }
    } else {
      /* 2026-10-27 audit: an upload Content-Type used to skip every body check (act, own, fields), and a sniff of the
         first 64 bytes was beaten by padding. Only the upload routes take a non-JSON body; everywhere else it is refused. */
      if (!UPLOAD_ROUTES.has(rule.p)) return out(403, 'Send that as JSON.');
    }
    if (body && typeof body === 'object') {
      const vals = [body.act, body.act_id, body.screen && body.screen.act_id].filter(v => v !== undefined && v !== null && v !== '');
      for (const v of vals) if (typeof v !== 'string' || v === 'all' || !ids.all.has(v)) return typeof v !== 'string' || v === 'all' ? out(403, deniedAct) : noBrand(v);
      const bAct = vals[0] || null;
      if (bAct) { if (act && !ids.all.has(bAct)) return out(403, CLIENT_NO); act = act || bAct; }
    }
  }
  if (rule.act === 'path') { const pa = match && match[1]; if (act && act !== pa) return out(403, CLIENT_NO); act = pa; }
  if (act === 'all') return out(403, 'You do not have access to that brand.');
  if (act && !ids.all.has(act)) return noBrand(act);
  if ((rule.act === 'need' || rule.act === 'path') && !act) return out(403, 'Pick your brand first.');
  const brandOf = id => { for (const [b, s] of ids.of) if (s.has(id)) return b; return null; };
  if (rule.ads) {
    const raw = url.searchParams.get(rule.ads) || '';
    const list = raw.split(',').map(x => x.trim()).filter(Boolean);
    if (rule.act === 'none' && !list.length) return out(403, CLIENT_NO);
    if (!(await adsOwned(env, list, ids.all))) return heldIds && (await adsOwned(env, list, full)) ? gated() : out(403, 'You do not have access to that ad.');
  }
  if (rule.bodyAds) {
    const list = rule.bodyAds.flatMap(k => { const v = body && body[k]; return v == null ? [] : Array.isArray(v) ? v : [v]; }).map(String).filter(Boolean);
    if (!(await adsOwned(env, list, ids.all))) return heldIds && (await adsOwned(env, list, full)) ? gated() : out(403, 'You do not have access to that ad.');
  }
  if (rule.own && !(await recordsOwned(env, rule.own, { body, url, match }, ids.all))) return heldIds && (await recordsOwned(env, rule.own, { body, url, match }, full)) ? gated() : out(403, 'That belongs to another brand.');
  if (rule.fields && body) {
    const extra = Object.keys(body).filter(k => !['act', 'act_id'].includes(k) && !rule.fields.includes(k));
    if (extra.length) return out(403, `Your login can change ${rule.fields.join(', ').replace(/_/g, ' ')} here. ${extra.join(', ').replace(/_/g, ' ')} ${extra.length === 1 ? 'is' : 'are'} set by the Mobius team.`);
  }
  if (rule.deny) { const why = rule.deny(body, url); if (why) return out(403, why); }
  let charge = 0;
  if (rule.cap) {
    const [key, c] = rule.cap;
    charge = typeof c === 'function' ? +c(body, url) || 0 : c;
    const used = await capUse(env, key, client.email);
    if ((used.cost || 0) + charge > CLIENT_CAPS[key].max + 1e-9) return out(429, capMessage(key));
  }
  let req = request;
  /* 2026-10-27 audit: the handlers read `act`; a request that named the brand only as act_id (query or body) passed
     the check above and then ran for every brand. The brand the guard checked is written back as `act` wherever it
     was missing, and `strip` drops query switches that are the team's (paid refreshes). */
  const u2 = new URL(request.url);
  let urlChanged = false;
  if (act && !u2.searchParams.get('act')) { u2.searchParams.set('act', act); urlChanged = true; }
  for (const k of rule.strip || []) if (u2.searchParams.has(k)) { u2.searchParams.delete(k); urlChanged = true; }
  const bodyObj = body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  if (rule.prep && body) {
    const next = await rule.prep(env, body);
    if (act && next && typeof next === 'object' && !Array.isArray(next) && !next.act) next.act = act;
    const h = new Headers(request.headers); h.delete('Content-Length');
    req = new Request(u2.toString(), { method: m, headers: h, body: JSON.stringify(next) });
  } else if (act && bodyObj && !bodyObj.act) {
    const h = new Headers(request.headers); h.delete('Content-Length');
    req = new Request(u2.toString(), { method: m, headers: h, body: JSON.stringify({ ...bodyObj, act }) });
  } else if (urlChanged) {
    req = new Request(u2.toString(), request);
  }
  /* A held brand is left out of the scope the handler sees too (its brands, ids and access). */
  const open = heldIds ? client.brands.filter(b => ids.of.has(b)) : client.brands;
  const access = heldIds ? Object.fromEntries(Object.entries(client.access || {}).filter(([b]) => ids.of.has(b))) : client.access;
  CLEARED.set(req, { email: client.email, name: client.name, brands: open, access, ids: ids.all, brandOf, hq: client.hq === true, onlyOnboard: client.onlyOnboard || null });
  const res = await handle(req);
  if (charge && res.status < 400) await capAdd(env, rule.cap[0], client.email, charge);
  /* A client's change to its own goals or ad rules is logged with who made it, and the team is told (2026-11-26). */
  if (rule.audit && m !== 'GET' && res.status < 400) await clientAudit(env, client, rule.audit, brandOf(act) || act, path, bodyObj);
  const type = res.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) return res;
  let data; try { data = await res.clone().json(); } catch { return res; }
  data = scrub(filterActs(data, ids.all));
  if (rule.post) data = rule.post(data);
  if (rule.postIds) data = rule.postIds(ids.all)(data);
  if (data && data.__deny) return out(data.__deny, data.error);
  const h = new Headers(res.headers); h.delete('Content-Length');
  return new Response(JSON.stringify(data), { status: res.status, headers: h });
}

/** `handle(req)` runs the worker's own handler on `req` (a client write may hand it a rebuilt request). */
export async function guardBrands(request, env, sessionEmail, handle, CORS = {}) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ') || request.method === 'OPTIONS') return handle(request);
  const email = await sessionEmail(env, request).catch(() => null);
  /* A client is judged by the allowlist and nothing else. */
  const client = email ? await clientOf(env, email).catch(() => null) : null;
  if (client) return guardClient(request, env, client, handle, CORS);
  const only = await brandsFor(env, email).catch(() => null);
  if (!only) return handle(request);
  const url = new URL(request.url);
  const deny = () => new Response(JSON.stringify({ error: 'You do not have access to that brand. Ask Cole to add it to your brands (Settings > Team).' }), { status: 403, headers: { 'Content-Type': 'application/json', ...CORS } });
  const q = url.searchParams.get('act');
  if (q && q !== 'all' && !only.has(q)) return deny();
  if (request.method !== 'GET' && (request.headers.get('Content-Type') || '').includes('json')) {
    try { const b = await request.clone().json(); if (b && typeof b === 'object') for (const v of [b.act, b.act_id]) if (v !== undefined && v !== null && v !== '' && v !== 'all' && (typeof v !== 'string' || !only.has(v))) return deny(); } catch {}
  }
  const res = await handle(request);
  if (!(res.headers.get('Content-Type') || '').includes('application/json')) return res;
  let body; try { body = await res.clone().json(); } catch { return res; }
  const h = new Headers(res.headers); h.delete('Content-Length');
  return new Response(JSON.stringify(filterActs(body, only)), { status: res.status, headers: h });
}
