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
  const brands = (Array.isArray(c.brands) ? c.brands : []).map(String).filter(b => /^brand_[a-z0-9_]+$/.test(b));
  const access = Object.fromEntries(brands.map(b => [b, { ...CLIENT_SWITCHES }]));
  return { email: e, name: c.name || null, brands, access };
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
const sentOnlyList = b => { if (b && Array.isArray(b.rows)) b.rows = b.rows.filter(r => r && r.status === 'sent'); if (b) delete b.lastRun; return b; };
const sentOnlyOne = b => (b && b.status === 'sent' ? b : { __deny: 404, error: 'no report for that period' });
const briefSent = b => { if (b && Array.isArray(b.history)) b.history = b.history.filter(r => r && r.status === 'sent'); return b; };
const ownDash = (ids) => b => { if (b && Array.isArray(b.dashboards)) b.dashboards = b.dashboards.filter(d => d && d.act && ids.has(d.act)); return b; };
const noAgency = b => { if (b && typeof b === 'object') b.agency = []; return b; };
const studioCost = { make: b => 0.32 * Math.max(1, Math.min(4, +b?.n || 1)), 'make-exact': 0.55, vary: 0.3, change: 0.3, dress: 0.35, story: 0.45, art: 0.3, lift: 0.05, read: 0.02, extend: 0.1, harmonize: 0.1, finalize: 0.05, dna: 0.03 };
const AD = { table: 'p_studio_ad' }, BATCH = { table: 'p_studio_batch' };
/* Brand settings (PUT /api/accounts/<brand>): what the brand's own people may change. Never the status, the Slack
   channels, the brief switch or a connection (a Triple Whale shop could point the brand at another store). */
const BRAND_FIELDS = ['name', 'monthly_budget', 'budgets', 'tz', 'target_cpa', 'target_roas', 'goals'];
/* Integrations (PUT /api/brand-links): the brand's OWN keys and links. Never an id that Mobius's access reaches
   (Meta account, Triple Whale shop, GA4, Search Console, Google Ads): pasting another brand's id would read its data. */
const LINK_FIELDS = ['drive', 'frame', 'klaviyo_key', 'clarity_token', 'survey_key', 'fairing_key', 'kno_key'];

const R = (m, p, act = 'need', more = {}) => ({ m, p, act, ...more });
const RX = (m, re, act, more = {}) => ({ m, re, act, ...more });
const S_ = (p, more = {}) => R('POST', '/api/studio/' + p, 'opt', { own: [{ in: 'body', key: 'id', ...AD }, { in: 'body', key: 'parent_id', ...AD }, { in: 'body', key: 'batch_id', ...BATCH }], ...(studioCost[p] ? { cap: ['clientStudio', studioCost[p]] } : {}), ...more });

export const CLIENT_RULES = [
  /* ---- who am I, my own profile ---- */
  R('GET', '/api/me', 'none'),
  R('GET', '/api/clients/me', 'none'),
  R('PUT', '/api/clients/me', 'none'),

  /* ---- HOME: Overview, Day check, P&L, Goals, Requests ---- */
  R('GET', '/api/overview', 'opt'),
  R('GET', '/api/hub/live', 'opt'),
  R('GET', '/api/hub/find'),
  R('GET', '/api/client'),
  R('GET', '/api/forecast'),
  R('GET', '/api/costs'),
  R('PUT', '/api/margin'),
  R('GET', '/api/expenses'),
  R('PUT', '/api/expenses'),
  R('POST', '/api/profit-share'),
  R('GET', '/api/data-health'),
  R('POST', '/api/tw-sync'),
  /* Day check: a market-level answer ("was it a bad day on Meta"); its brand rows are filtered to theirs. */
  R('GET', '/api/metaday', 'none'),
  R('GET', '/api/daycheck/now'),
  R('POST', '/api/daycheck', 'opt', { cap: ['clientAsk', 0.02] }),
  /* The AI read at the top of a screen (never the command center's). */
  R('POST', '/api/read', 'opt', { deny: b => (b && b.screen === 'command' ? 'The command center is the agency view.' : null), cap: ['clientAsk', 0.02] }),
  R('GET', '/api/plan'),
  R('PUT', '/api/plan'),
  R('POST', '/api/plan-agree'),
  R('POST', '/api/plan-share'),
  R('PUT', '/api/goals'),
  R('GET', '/api/quarter'),
  R('GET', '/api/rhythm'),
  R('GET', '/api/goal-suggest'),
  /* Requests and approvals (requests.js): the handler checks every item id against the brand. */
  R('GET', '/api/requests'),
  R('POST', '/api/requests'),
  R('POST', '/api/requests/reply'),
  R('POST', '/api/requests/decide'),

  /* ---- ADS: Today, All channels, Meta (every job), Google (every job), TikTok, Tests and angles ---- */
  R('GET', '/api/hub/today'),
  R('GET', '/api/hub/paid'),
  R('GET', '/api/hub/drill'),
  R('GET', '/api/hub/orders'),
  R('GET', '/api/hub/customer'),
  R('GET', '/api/hub/creative'),
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
  R('POST', '/api/activities'),
  RX('PATCH', /^\/api\/activities\/([^/]+)$/, 'none', { own: [{ in: 'path', table: 'activities' }] }),
  R('POST', '/api/summarise', 'need', { cap: ['clientAsk', 0.05] }),
  R('GET', '/api/ad-creatives', 'need', { ads: 'ads' }),
  R('GET', '/api/ad-video', 'none', { ads: 'ad' }),
  R('GET', '/api/ad-breakdown', 'none', { ads: 'ad' }),
  R('POST', '/api/ad-share'),
  R('GET', '/api/your-ads-link'),
  R('GET', '/api/google/ads'),
  R('GET', '/api/google/ads-ads'),
  R('GET', '/api/google/ads-terms'),
  R('GET', '/api/google/ads-changes'),
  R('POST', '/api/google/write'),
  R('GET', '/api/tiktok/report'),
  R('GET', '/api/brand/tests-overview', 'none'),
  R('POST', '/api/brand-asana/mins'),
  R('POST', '/api/brand-asana/tested'),

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

  /* ---- PRODUCTS: Stock and Drops, read only through this door (stock.js supplyClient keeps an allowlist of
     fields). Buying and every Supply write stay off: the Supply worker has its own sign-in that knows no client. */
  R('GET', '/api/supply/client'),
  R('GET', '/api/hub/stockads'),

  /* ---- CREATIVE: AI ads (Studio + Words), Creators, Library, Inspiration ---- */
  R('GET', '/api/studio'),
  R('GET', '/api/studio/products'),
  R('GET', '/api/studio/asana'),
  R('POST', '/api/studio/upload', 'none'),
  S_('status'), S_('save'), S_('revert'), S_('make', { act: 'need' }), S_('make-exact', { act: 'need' }), S_('dress', { act: 'need' }), S_('read'), S_('lift'), S_('art'),
  S_('vary'), S_('change'), S_('extend'), S_('story'), S_('finalize'), S_('harmonize'), S_('dna', { act: 'need' }),
  R('POST', '/api/studio/batch/save', 'need', { own: [{ in: 'body', key: 'batch.id', ...BATCH }] }),
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
  R('GET', '/api/brand'),
  R('GET', '/api/brand/ads'),
  R('GET', '/api/brand/rules'),
  R('PUT', '/api/brand/rules'),
  R('POST', '/api/brand/save'),
  R('POST', '/api/brand/save-many'),
  R('POST', '/api/brand/del'),
  R('POST', '/api/brand/merge'),
  R('POST', '/api/brand/tag'),
  R('POST', '/api/brand/verdict'),
  R('PUT', '/api/brand/doc'),
  R('POST', '/api/brand/onboard'),
  R('PUT', '/api/brand/onboard'),

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
  R('PUT', '/api/season/answer'),
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
  R('GET', '/api/accounts', 'none'),
  RX('PUT', /^\/api\/accounts\/(brand_[a-z0-9_]+|act_\d+)$/, 'path', { fields: BRAND_FIELDS }),
  R('GET', '/api/integrations', 'none', { post: noAgency }),
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
const ALWAYS_OUT = new Set(['slack_channel', 'brief_channel', 'client_channel', 'internal_channel', 'report_config', 'report_config_json', 'review_first', 'brief_enabled', 'slack_ts', 'sent_channel', 'steer',
  'lastRun', 'team', 'storage_prefix', 'tw_shop_token', 'shopify_token', 'access_token', 'notes_internal', 'internal_notes', 'team_notes']);
/* A Slack channel id under any key that names a channel ("channel", "posts_to"...), wherever it sits. */
const SLACK_ID = /^[CGD][A-Z0-9]{8,12}$/;
export function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (!v || typeof v !== 'object') return v;
  const o = {};
  for (const [k, x] of Object.entries(v)) {
    if (ALWAYS_OUT.has(k)) continue;
    if (typeof x === 'string' && SLACK_ID.test(x) && /channel|post|slack/i.test(k)) continue;
    o[k] = scrub(x);
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

const CLIENT_NO = 'Your Locus login has everything about your own brand. That part runs the agency itself, so it is for the Mobius team; ask us in Slack if you need it.';

async function guardClient(request, env, client, handle, CORS) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const m = request.method;
  const out = (status, error) => new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
  let match = null;
  const rule = CLIENT_RULES.find(r => r.m === m && (r.p ? r.p === path : (match = path.match(r.re))));
  if (!rule) return out(403, CLIENT_NO);
  if (rule.p) match = null;
  /* A login with no brand left (Cole removed the last one) opens nothing at all. */
  if (!client.brands.length) return out(401, 'unauthorized');
  const ids = await clientIds(env, client);
  /* The brand named by the request: the query's act, the JSON body's act / act_id / screen.act_id, or the path. */
  let act = url.searchParams.get('act');
  let body = null;
  if (m !== 'GET' && (request.headers.get('Content-Type') || '').includes('json')) {
    try { body = await request.clone().json(); } catch { body = null; }
    const bAct = body && (typeof body.act === 'string' ? body.act : typeof body.act_id === 'string' ? body.act_id : typeof body.screen?.act_id === 'string' ? body.screen.act_id : null);
    if (bAct) { if (act && act !== bAct) return out(403, CLIENT_NO); act = bAct; }
  }
  if (rule.act === 'path') { const pa = match && match[1]; if (act && act !== pa) return out(403, CLIENT_NO); act = pa; }
  if (act === 'all' || (act && !ids.all.has(act))) return out(403, 'You do not have access to that brand.');
  if ((rule.act === 'need' || rule.act === 'path') && !act) return out(403, 'Pick your brand first.');
  const brandOf = id => { for (const [b, s] of ids.of) if (s.has(id)) return b; return null; };
  if (rule.ads) {
    const raw = url.searchParams.get(rule.ads) || '';
    const list = raw.split(',').map(x => x.trim()).filter(Boolean);
    if (rule.act === 'none' && !list.length) return out(403, CLIENT_NO);
    if (!(await adsOwned(env, list, ids.all))) return out(403, 'You do not have access to that ad.');
  }
  if (rule.own && !(await recordsOwned(env, rule.own, { body, url, match }, ids.all))) return out(403, 'That belongs to another brand.');
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
  if (rule.prep && body) {
    const next = await rule.prep(env, body);
    const h = new Headers(request.headers); h.delete('Content-Length');
    req = new Request(request.url, { method: m, headers: h, body: JSON.stringify(next) });
  }
  CLEARED.set(req, { email: client.email, name: client.name, brands: client.brands, access: client.access, ids: ids.all, brandOf });
  const res = await handle(req);
  if (charge && res.status < 400) await capAdd(env, rule.cap[0], client.email, charge);
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
    try { const b = await request.clone().json(); if (b && typeof b.act === 'string' && b.act !== 'all' && !only.has(b.act)) return deny(); } catch {}
  }
  const res = await handle(request);
  if (!(res.headers.get('Content-Type') || '').includes('application/json')) return res;
  let body; try { body = await res.clone().json(); } catch { return res; }
  const h = new Headers(res.headers); h.delete('Content-Length');
  return new Response(JSON.stringify(filterActs(body, only)), { status: res.status, headers: h });
}
