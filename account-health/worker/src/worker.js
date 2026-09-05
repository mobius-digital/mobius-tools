/**
 * Mobius Account Health — data worker (Cloudflare Workers + D1)
 *
 * Pulls Meta Marketing API data for every active client ad account into D1:
 *   - daily account-level insights (spend, clicks, purchases, revenue, 3s views)
 *   - the ad-account activity log (every change anyone made), auto-classified
 * and serves a small JSON API for the dashboard (../index.html).
 *
 * Bindings (see wrangler.toml):
 *   DB            — D1 database (schema.sql)
 * Secrets (wrangler secret put <NAME>):
 *   META_TOKEN    — system-user token with ads_read on every client ad account
 *   ADMIN_TOKEN   — master key for the dashboard (a dashboard password can also
 *                   be set in Settings; its hash lives in the settings table)
 *   SLACK_BOT_TOKEN — (Chat 2) same Slack app as Pulse / Restock
 *   ANTHROPIC_API_KEY — (Chat 1) Claude API key for POST /api/summarise
 *
 * Build plan lives in ../PRD.md. This file is Chat 0 (foundation); Chats 1–4
 * add routes + sync jobs for Change Log, Averages/Pacing, Creative Rotation,
 * and intraday Pacing.
 */

const GRAPH = 'https://graph.facebook.com/v23.0';
const BACKFILL_DAYS = 90;       // first sync of a new account
const RESYNC_DAYS = 3;          // nightly re-pull window (conversions settle late)
// Bump when ad_daily gains columns: every account then re-walks the 90-day
// window once, filling the new fields on rows that already exist.
// 1 = hook/hold (2026-08-29)   2 = reach, clicks, outbound, p25/50/75, watch time (2026-08-30)
// 3 = video_plays — the correct denominator for the retention curve. Dividing
//     by 3-second views produced 150%, because a 25% view of a 7-second video
//     happens BEFORE 3 seconds.
const ADS_METRICS_VERSION = 3;
const ACTIVITY_BACKFILL_DAYS = 90;
// One platform: the Meta screens are now a tab inside Mobius (was the separate
// Account Health dashboard, which is kept only as a redirect). This worker is
// unchanged - it still owns the Meta sync, both crons and every secret.
const DASHBOARD_URL = 'https://tools.go-mobius-digital.com/profit/';

/* ------------------------------------------------------------------ */
/*  SUBREQUEST BUDGET — the thing this worker never had                */
/* ------------------------------------------------------------------ */
/* Cloudflare counts EVERY outbound call made during ONE invocation, and the
   part that caught us is that D1 counts: "a subrequest is any request a Worker
   makes using the Fetch API or to Cloudflare services like R2, KV, or D1."
   Free plan allows 50. Paid allows 10,000.
 *
 * Nothing here was counting, and every scheduled job looped all six brands
 * doing ~10-20 calls each. So each job ran flat into the ceiling and the
 * platform killed it mid-brand. Whatever ran first won; everything after it
 * got nothing. On 2026-08-31 that meant: the nightly synced Bonk Golf and
 * abandoned the other five, every Triple Whale sync failed, and the weekly
 * reports were generated with no narrative and never posted to Slack — while
 * `lastRun` cheerfully recorded ok:true. It also left daily_insights a day
 * stale, which is what made the delivery check shout that Dartee had spent
 * nothing. One unmetered loop, five visible symptoms.
 *
 * THE RULE NOW: a job never runs into the ceiling. It counts what it spends,
 * stops while it can still afford to record what it did, and leaves the rest
 * for the next tick. Every loop here is already idempotent — brands that are
 * done are skipped on the way back in — so stopping early is free and resuming
 * is automatic. The hourly trigger gives us 24 chances a day to finish.
 *
 * This is why the fix is not "buy the paid plan". Paid raises the ceiling 200x
 * and is well worth $5, but an uncounted loop still has no idea where the
 * ceiling is — it just moves the cliff further out and hits it at 60 clients
 * instead of 6, silently, exactly the same way. Counting is the fix. The plan
 * is headroom. */

/* D1 BATCH SIZE IS A SUBREQUEST DIAL. Each batch() call is ONE subrequest no
   matter how many statements it carries, so a small chunk size is pure waste:
   syncTwDaily was writing 45 days x ~12 metrics in chunks of 30, which is 18
   subrequests for work that fits in 4. Measured 2026-09-01: one brief cost 51
   calls, more than the whole free-plan budget, and most of it was this.
   150 is already proven in this file (the ad_daily writer has used it since
   August). Do not lower these without measuring what it costs. */
const D1_CHUNK = 150;

const SUB_LIMIT_FREE = 50;
/* Held back so a job that runs out of budget can still WRITE DOWN that it ran
   out and post the alert saying so. Every silent failure we hit came from the
   bookkeeping being the thing that got cut off. */
const SUB_RESERVE = 8;

/* Module scope is reused across invocations in a warm isolate, so this MUST be
   reset at every entry point — see `scheduled` and `fetch`. Concurrent requests
   in one isolate share it; that only ever makes a job more conservative (it
   defers work to the next tick), never less, so the race is safe by design. */
let SUB_USED = 0;
let SUB_LIMIT = SUB_LIMIT_FREE;

function subReset(env) {
  SUB_USED = 0;
  // Learned costs are per-invocation. Carrying them between ticks would let one
  // pathological brand ratchet the estimate up permanently and starve the rest.
  COST_SEEN.clear();
  // Set SUB_LIMIT in wrangler.toml [vars] after upgrading to Workers Paid and
  // every job simply does more per tick — no other change needed.
  const n = +(env?.SUBREQUEST_LIMIT ?? 0);
  SUB_LIMIT = Number.isFinite(n) && n > 0 ? n : SUB_LIMIT_FREE;
}
function subSpend(n = 1) { SUB_USED += n; }
function subUsed() { return SUB_USED; }
/** How many calls are still safe to make, after the bookkeeping reserve. */
function subLeft() { return SUB_LIMIT - SUB_USED - SUB_RESERVE; }
/** Can this invocation afford a unit of work costing roughly `n` calls? */
function subCanAfford(n) { return subLeft() >= n; }

/* Per-brand cost SEEDS. These are only the opening guess — `costOf` replaces
   them with what the work actually cost the moment one brand has been through,
   because the first real tick proved the guesses were badly low: the estimate
   for a brief was 12 and the invocation finished at 53 of a 50 budget having
   drafted one brand. Guessing a fixed number is the same mistake as not
   counting, one level up. Measure, then decide. */
const COST_SYNC_BRAND = 20;    // insights + activities + ad-level slices
const COST_BRIEF_BRAND = 22;   // TW sync + brief data + Claude + Slack + writes
const COST_REPORT_BRAND = 22;  // report data + Claude + Slack + writes
const COST_DELIVERY_BRAND = 4; // D1 reads, sometimes one Meta pacing call

/* Observed cost per unit of work, highest seen this invocation. Highest rather
   than average: the decision being made is "will the NEXT one fit", and a brand
   that needs a Triple Whale backfill costs several times one that does not. */
const COST_SEEN = new Map();
function costOf(kind, seed) { return Math.max(COST_SEEN.get(kind) || 0, seed); }
/** Wrap one unit of work, recording what it really cost. */
async function measured(kind, fn) {
  const before = subUsed();
  try { return await fn(); }
  finally {
    const spent = subUsed() - before;
    if (spent > (COST_SEEN.get(kind) || 0)) COST_SEEN.set(kind, spent);
  }
}
function costReport() { return Object.fromEntries(COST_SEEN); }

/** Wrap `env` so every D1 call counts itself. Done once at the entry point
 *  rather than at 112 call sites, so nothing can be added later that forgets.
 *  Statements keep a `__raw` handle because D1's batch() needs the real
 *  objects, not these wrappers. */
function meterEnv(env) {
  if (env.__metered) return env;
  const raw = env.DB;
  if (!raw) return env;
  const wrapStmt = st => ({
    __raw: st,
    bind: (...a) => wrapStmt(st.bind(...a)),
    first: (...a) => { subSpend(); return st.first(...a); },
    all: (...a) => { subSpend(); return st.all(...a); },
    run: (...a) => { subSpend(); return st.run(...a); },
    raw: (...a) => { subSpend(); return st.raw(...a); },
  });
  const DB = {
    prepare: q => wrapStmt(raw.prepare(q)),
    batch: list => { subSpend(); return raw.batch((list || []).map(s => (s && s.__raw) || s)); },
    exec: q => { subSpend(); return raw.exec(q); },
    dump: () => raw.dump(),
  };
  return new Proxy(env, {
    get: (t, k) => (k === 'DB' ? DB : k === '__metered' ? true : t[k]),
  });
}

/** Every outbound HTTP call in this worker goes through here so it is counted.
 *  Same signature as fetch; the only difference is the meter. */
function xfetch(...args) { subSpend(); return fetch(...args); }

/* ------------------------------------------------------------------ */
/*  Date helpers (bucketing is always in the account's own timezone)   */
/* ------------------------------------------------------------------ */

function localDate(tz, d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function localHourFrac(tz, d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(d);
  const h = +(parts.find(p => p.type === 'hour')?.value || 0) % 24;
  const m = +(parts.find(p => p.type === 'minute')?.value || 0);
  return h + m / 60;
}
function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysInMonth(ymd) {
  const [y, m] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
const monthOf = ymd => ymd.slice(0, 7);
function prevMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/* ------------------------------------------------------------------ */
/*  Meta Graph API                                                     */
/* ------------------------------------------------------------------ */

class MetaError extends Error {
  constructor(msg, code, sub) { super(msg); this.code = code; this.sub = sub; }
}

/* ------------------------------------------------------------------ */
/*  Meta rate limiting — back off, do not keep knocking                */
/* ------------------------------------------------------------------ */
/* Meta's limits are per app and per ad account, and they do not reset because
   you retried. Codes 4 and 17 are "you have used your quota"; 1 and 2 are
   transient "service temporarily unavailable" but mean the same in practice —
   stop calling for a while.
 *
 * Before this, a rate-limited account was retried on the next tick and every
 * tick after, which is the behaviour that earns a longer ban rather than
 * clearing one. Now the first limit error parks ALL Meta work for an hour.
 * Deliberately global rather than per account: the app-level quota is shared,
 * so one brand hitting it means the others are about to. */
const META_BACKOFF_CODES = new Set([1, 2, 4, 17, 32, 613]);
const META_BACKOFF_MS = 60 * 60 * 1000;

async function noteMetaError(env, e) {
  const code = e?.code;
  const rateish = META_BACKOFF_CODES.has(code) ||
    /request limit reached|temporarily unavailable|rate limit/i.test(e?.message || '');
  if (!rateish) return false;
  await putSetting(env, 'metaBackoffUntil', String(Date.now() + META_BACKOFF_MS)).catch(() => {});
  return true;
}
/** True while Meta has told us to stop. Cheap: one settings read. */
async function metaBackedOff(env) {
  const until = +(await getSetting(env, 'metaBackoffUntil') || 0);
  return Number.isFinite(until) && until > Date.now();
}

async function meta(env, path, params = {}) {
  if (!env.META_TOKEN) throw new MetaError('META_TOKEN secret is not set', 0);
  const url = new URL(`${GRAPH}/${path.replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  url.searchParams.set('access_token', env.META_TOKEN);
  const res = await xfetch(url.toString());
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = body.error || {};
    throw new MetaError(e.message || `HTTP ${res.status}`, e.code, e.error_subcode);
  }
  return body;
}

/** Follow `paging.next` up to maxPages, concatenating `data`. */
async function metaAll(env, path, params, maxPages = 30) {
  const out = [];
  let page = await meta(env, path, params);
  let n = 0;
  while (page) {
    out.push(...(page.data || []));
    const next = page.paging?.next;
    if (!next || ++n >= maxPages) break;
    const res = await xfetch(next);
    page = await res.json();
    if (page.error) throw new MetaError(page.error.message, page.error.code);
  }
  return out;
}

const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'];
function pickAction(list, types) {
  if (!Array.isArray(list)) return 0;
  for (const t of types) {
    const hit = list.find(a => a.action_type === t);
    if (hit) return +hit.value || 0;
  }
  return 0;
}

function parseInsightRow(r) {
  return {
    date: r.date_start,
    spend: +r.spend || 0,
    impressions: +r.impressions || 0,
    reach: +r.reach || 0,
    clicks: +r.clicks || 0,
    link_clicks: +r.inline_link_clicks || 0,
    purchases: pickAction(r.actions, PURCHASE_TYPES),
    revenue: pickAction(r.action_values, PURCHASE_TYPES),
    video_views: pickAction(r.actions, ['video_view']),
  };
}

/* ------------------------------------------------------------------ */
/*  Accounts                                                           */
/* ------------------------------------------------------------------ */

/* `me/adaccounts` on a SYSTEM USER token returns only the ad accounts that user
   has been individually assigned in Business Manager - not everything the
   business owns. Cole reported accounts missing from the picker; that is why,
   and it is a Meta permission fact, not a bug here.
   So we also walk the businesses the token can see and take their owned AND
   client ad accounts. Every extra call is wrapped: business_management scope may
   be absent, in which case discovery must degrade to exactly what it did before
   rather than failing outright. Returns {found, direct, viaBusiness}. */
/* WHICH BUSINESS PORTFOLIOS CAN THIS TOKEN SEE?
   `me/businesses` is the obvious call and it returns 0 for a SYSTEM USER, even
   one holding Admin business access with business_management granted - measured
   on Cole's live token, 2026-08-30. A system user is OWNED BY a business rather
   than a member of one, so the /me/businesses edge simply does not apply to it,
   and no amount of re-ticking permissions changes that. It cost a wrong
   instruction to him before the diagnostic proved it.
   So derive it instead: ask an ad account the token ALREADY has who owns it.
   `GET /act_x?fields=business` names the portfolio, and from that id the owned
   and client edges list everything the portfolio holds - now and in future.
   One assigned account is therefore enough to unlock the whole portfolio. */
async function businessesFor(env, seedAccounts) {
  const byId = new Map();
  /* OUR OWN portfolio first, and it has to be configured because nothing can
     derive it. Measured on Cole's token 2026-08-30: the six businesses derived
     from his ad accounts are the CLIENTS' portfolios (Lucky Golf, Dartee Golf,
     …) - every account is owned by the client and merely shared with Mobius
     Digital, so Mobius Digital never appears among them, and a system user
     cannot enumerate another business's assets (all twelve edges returned 0).
     The accounts we want are Mobius Digital's `client_ad_accounts`: the ones
     shared TO us, which is exactly the set that grows when a new client
     arrives. Set once in Settings, stored as settings.metaBusinessId. */
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'metaBusinessId'`).first();
    const id = String(safeJson(row?.value, row?.value) || '').trim();
    if (id) {
      let name = 'your portfolio';
      try { name = (await meta(env, id, { fields: 'name' }))?.name || name; } catch { /* id may be wrong; the edges will say so */ }
      byId.set(id, { id, name });
    }
  } catch { /* no id configured yet */ }
  try {
    for (const b of await metaAll(env, 'me/businesses', { fields: 'id,name' }, 5)) byId.set(b.id, b);
  } catch { /* expected to fail or return nothing for a system user token */ }
  // Ask a handful of known accounts who owns them. Distinct portfolios are few,
  // so a few probes find them all without a call per account.
  for (const a of (seedAccounts || []).slice(0, 8)) {
    try {
      const r = await meta(env, a.id, { fields: 'business' });
      if (r?.business?.id && !byId.has(r.business.id)) byId.set(r.business.id, r.business);
    } catch { /* an account with no business, or no permission to read it */ }
  }
  return [...byId.values()];
}

async function discoverAdAccounts(env) {
  const FIELDS = 'id,account_id,name,currency,timezone_name,account_status';
  const byId = new Map();
  const direct = await metaAll(env, 'me/adaccounts', { fields: FIELDS, limit: 200 });
  for (const a of direct) byId.set(a.id, a);
  const before = byId.size;

  const businesses = await businessesFor(env, direct);
  for (const b of businesses) {
    for (const edge of ['owned_ad_accounts', 'client_ad_accounts']) {
      try {
        for (const a of await metaAll(env, `${b.id}/${edge}`, { fields: FIELDS, limit: 200 }, 5)) {
          if (!byId.has(a.id)) byId.set(a.id, a);
        }
      } catch { /* one edge failing must not lose the other, or the direct list */ }
    }
  }
  return { rows: [...byId.values()], direct: before, viaBusiness: byId.size - before };
}

async function discoverAccounts(env) {
  const { rows, direct, viaBusiness } = await discoverAdAccounts(env);
  // Which of these we have never seen before. Cheap (one indexed column) and it
  // is the only way the UI can say "2 new since last night" rather than making
  // Cole diff a list of twelve by eye.
  const { results: existing } = await env.DB.prepare(`SELECT act_id FROM accounts`).all();
  const known = new Set(existing.map(r => r.act_id));
  const fresh = rows.filter(a => !known.has(a.id));
  const stmts = rows.map(a => env.DB.prepare(
    `INSERT INTO accounts (act_id, name, currency, tz, account_status)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(act_id) DO UPDATE SET currency = excluded.currency, tz = excluded.tz,
       account_status = excluded.account_status`,
  ).bind(a.id, a.name || a.id, a.currency || 'USD', a.timezone_name || 'America/Chicago', a.account_status ?? null));
  if (stmts.length) await env.DB.batch(stmts);
  const stamp = {
    at: new Date().toISOString(), found: rows.length, direct, viaBusiness,
    // Names, not ids - this is read straight into a sentence on screen.
    fresh: fresh.map(a => ({ act_id: a.id, name: a.name || a.id })),
  };
  await env.DB.prepare(
    `INSERT INTO settings (key, value) VALUES ('lastDiscover', ?1)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(JSON.stringify(stamp)).run();
  return { found: rows.length, direct, viaBusiness, fresh: stamp.fresh };
}

async function listAccounts(env, activeOnly = false) {
  const q = `SELECT * FROM accounts ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY active DESC, name`;
  const { results } = await env.DB.prepare(q).all();
  return results.map(a => ({ ...a, budgets: safeJson(a.budgets_json, {}), goals: safeJson(a.goals_json, {}) }));
}

const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };

/* ------------------------------------------------------------------ */
/*  Sync: daily insights                                               */
/* ------------------------------------------------------------------ */

async function syncInsights(env, acct, days) {
  const today = localDate(acct.tz);
  const since = addDays(today, -days);
  const rows = await metaAll(env, `${acct.act_id}/insights`, {
    level: 'account',
    time_increment: 1,
    time_range: { since, until: today },
    fields: 'spend,impressions,reach,clicks,inline_link_clicks,actions,action_values',
    limit: 100,
  });
  const stmts = rows.map(parseInsightRow).map(r => env.DB.prepare(
    `INSERT INTO daily_insights (act_id, date, spend, impressions, reach, clicks, link_clicks, purchases, revenue, video_views, synced_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'))
     ON CONFLICT(act_id, date) DO UPDATE SET spend = excluded.spend, impressions = excluded.impressions,
       reach = excluded.reach, clicks = excluded.clicks, link_clicks = excluded.link_clicks,
       purchases = excluded.purchases, revenue = excluded.revenue, video_views = excluded.video_views,
       synced_at = excluded.synced_at`,
  ).bind(acct.act_id, r.date, r.spend, r.impressions, r.reach, r.clicks, r.link_clicks, r.purchases, r.revenue, r.video_views));
  if (stmts.length) await env.DB.batch(stmts);
  await env.DB.prepare(`UPDATE accounts SET last_sync_insights = datetime('now'), last_error = NULL WHERE act_id = ?1`).bind(acct.act_id).run();
  return rows.length;
}

/* ------------------------------------------------------------------ */
/*  Sync: activity log                                                 */
/* ------------------------------------------------------------------ */

/* Auto-classification. Order matters: first match wins. */
const CATEGORIES = [
  ['ad_relaunched', /update_ad_run_status/, ev => statusTo(ev) === 'ACTIVE'],
  ['ad_paused', /update_ad_run_status/, ev => statusTo(ev) === 'PAUSED'],
  ['campaign_paused', /update_(campaign|ad_set)_run_status/, ev => statusTo(ev) === 'PAUSED'],
  ['campaign_relaunched', /update_(campaign|ad_set)_run_status/, ev => statusTo(ev) === 'ACTIVE'],
  ['new_creative', /^create_ad$|create_ad_creative|update_ad_creative/],
  ['new_adset', /^create_ad_set$/],
  ['new_campaign', /^create_campaign/],
  ['budget', /budget|spend_cap|spend_limit/],
  ['bid_strategy', /bid|roas_floor|cost_cap/],
  ['targeting', /target|audience|placement|geo/],
  ['optimisation', /optimization|optimisation|attribution|conversion|pixel|event|learning/],
  ['schedule', /schedule|duration|start_time|end_time/],
  ['name', /name|friendly/],
  ['review', /review|policy|disapprov|reject/],
  ['billing', /funding|billing|payment|invoice/],
];

function statusTo(ev) {
  const x = safeJson(ev.extra_data, {});
  const v = String(x.new_value ?? x.new_status ?? '').toUpperCase();
  if (/PAUS|OFF|DISABLE/.test(v)) return 'PAUSED';
  if (/ACTIVE|ON|ENABLE/.test(v)) return 'ACTIVE';
  const t = (ev.translated_event_type || '').toLowerCase();
  if (/paus|turned off|deactivat/.test(t)) return 'PAUSED';
  if (/activ|turned on|resum|relaunch/.test(t)) return 'ACTIVE';
  return null;
}

function classify(ev) {
  const type = (ev.event_type || '').toLowerCase();
  for (const [cat, re, test] of CATEGORIES) {
    if (re.test(type) && (!test || test(ev))) return cat;
  }
  return 'other';
}

const money = (n, cur) => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD' }).format(n); }
  catch { return `${cur} ${n.toFixed(2)}`; }
};

/** Budget extra_data comes in two shapes: flat {old_value, new_value} in cents, or
 *  "composite_data" where each side is {type:'payment_amount', currency, old_value|new_value,
 *  additional_value:'Per day'|...}. Normalize both to {oldCents, newCents, cur, perStr}. */
function budgetValues(x, ev) {
  let oldV = x.old_value, newV = x.new_value;
  let cur = x.currency, perStr = `${x.type || ''} ${ev.event_type || ''}`;
  if (oldV && typeof oldV === 'object') { cur = oldV.currency || cur; perStr += ` ${oldV.additional_value || ''}`; oldV = oldV.old_value ?? oldV.new_value; }
  if (newV && typeof newV === 'object') { cur = newV.currency || cur; perStr += ` ${newV.additional_value || ''}`; newV = newV.new_value ?? newV.old_value; }
  if (oldV == null || newV == null || !isFinite(+oldV) || !isFinite(+newV)) return null;
  return { oldCents: +oldV, newCents: +newV, cur, perStr };
}

/** One readable line per event: "Budget: $210.00/day → $300.00/day" etc. */
function summarise(ev, category, currency) {
  const x = safeJson(ev.extra_data, {});
  const obj = ev.object_name ? ` "${ev.object_name}"` : '';
  const kind = (ev.object_type || '').toLowerCase().replace('adset', 'ad set').replace('adgroup', 'ad');
  if (category === 'budget') {
    const b = budgetValues(x, ev);
    if (b) {
      const per = /lifetime/i.test(b.perStr) ? '/lifetime' : '/day';
      const cur = b.cur || currency;
      return `Budget: ${money(b.oldCents / 100, cur)}${per} → ${money(b.newCents / 100, cur)}${per}${obj}`;
    }
  }
  if (category === 'ad_paused') return `Paused ad${obj}`;
  if (category === 'ad_relaunched') return `Relaunched ad${obj}`;
  if (category === 'campaign_paused') return `Paused ${kind || 'campaign'}${obj}`;
  if (category === 'campaign_relaunched') return `Relaunched ${kind || 'campaign'}${obj}`;
  if (category === 'new_creative') return `New ad${obj}`;
  if (category === 'new_adset') return `New ad set${obj}`;
  if (category === 'new_campaign') return `New campaign${obj}`;
  // Only print old → new when both are short scalars — Meta stuffs whole JSON blobs in here for audience/targeting events.
  const printable = v => v != null && typeof v !== 'object' && String(v).length <= 60 && !/^[[{]/.test(String(v).trim());
  if (printable(x.old_value) && printable(x.new_value)) {
    return `${ev.translated_event_type || ev.event_type}: ${x.old_value} → ${x.new_value}${obj}`;
  }
  return `${ev.translated_event_type || ev.event_type}${obj}`;
}

/** 'good' | 'bad' | null — how the account was trending going into `day` (3d vs 30d). */
function perfSignal(insights, day) {
  const win = n => insights.filter(r => r.date < day && r.date >= addDays(day, -n));
  const stat = rows => {
    const s = rows.reduce((a, r) => ({ spend: a.spend + r.spend, pur: a.pur + r.purchases, rev: a.rev + r.revenue }), { spend: 0, pur: 0, rev: 0 });
    return { roas: s.spend ? s.rev / s.spend : null, cpa: s.pur ? s.spend / s.pur : null };
  };
  const a = stat(win(3)), b = stat(win(30));
  if (a.roas == null || b.roas == null) return null;
  const good = a.roas >= b.roas * 1.05 || (a.cpa != null && b.cpa != null && a.cpa <= b.cpa * 0.95);
  const bad = a.roas <= b.roas * 0.95 || (a.cpa != null && b.cpa != null && a.cpa >= b.cpa * 1.05);
  return good && !bad ? 'good' : bad && !good ? 'bad' : null;
}

/** Auto-suggested "why" — only where the data direction makes it defensible. */
function suggestReason(cat, ev, insights) {
  const day = String(ev.event_time || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  if (cat === 'budget') {
    const b = budgetValues(safeJson(ev.extra_data, {}), ev);
    if (!b || b.newCents === b.oldCents) return null;
    const sig = perfSignal(insights, day);
    if (b.newCents > b.oldCents && sig === 'good') return 'Positive performance';
    if (b.newCents < b.oldCents && sig === 'bad') return 'Negative performance';
    return null;
  }
  if (cat === 'ad_paused' || cat === 'campaign_paused') {
    return perfSignal(insights, day) === 'bad' ? 'Negative performance' : null;
  }
  return null;
}

async function syncActivities(env, acct, sinceISO) {
  const since = Math.floor(new Date(sinceISO).getTime() / 1000);
  const until = Math.floor(Date.now() / 1000);
  const rows = await metaAll(env, `${acct.act_id}/activities`, {
    fields: 'event_time,event_type,translated_event_type,actor_name,object_type,object_id,object_name,extra_data',
    since, until, limit: 500,
  }, 40);
  const { results: insights } = await env.DB.prepare(
    `SELECT date, spend, purchases, revenue FROM daily_insights WHERE act_id = ?1 ORDER BY date`,
  ).bind(acct.act_id).all();
  const stmts = rows.map(ev => {
    const cat = classify(ev);
    const id = ev.id || `${acct.act_id}:${ev.event_time}:${ev.event_type}:${ev.object_id || ''}`;
    return env.DB.prepare(
      `INSERT OR IGNORE INTO activities (id, act_id, event_time, event_type, translated, actor, object_type, object_id, object_name, extra_json, category, summary, confirmed, suggested_reason)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
    ).bind(id, acct.act_id, ev.event_time, ev.event_type || null, ev.translated_event_type || null,
      ev.actor_name || null, ev.object_type || null, ev.object_id || null, ev.object_name || null,
      typeof ev.extra_data === 'string' ? ev.extra_data : JSON.stringify(ev.extra_data ?? null),
      cat, summarise(ev, cat, acct.currency),
      (cat === 'name' || /^asa_auto/.test(ev.object_name || '')) ? -1 : 0,   // renames + Meta's auto-generated ASC audiences are noise; ✓/✗ can override
      suggestReason(cat, ev, insights));
  });
  for (let i = 0; i < stmts.length; i += D1_CHUNK) await env.DB.batch(stmts.slice(i, i + D1_CHUNK));
  await env.DB.prepare(`UPDATE accounts SET last_sync_activities = datetime('now') WHERE act_id = ?1`).bind(acct.act_id).run();
  return rows.length;
}

/* ------------------------------------------------------------------ */
/*  Sync: ad-level daily (Chat 3 — creative rotation)                  */
/* ------------------------------------------------------------------ */

const ymdDiff = (a, b) => Math.round((new Date(a + 'T12:00:00Z') - new Date(b + 'T12:00:00Z')) / 86400e3);

/** One 14-day slice of level=ad insights. Small on purpose — Meta rejects huge ad-level
 *  pulls, and slices keep each invocation well under Workers subrequest limits. */
async function syncAdSlice(env, acct, since, until) {
  const rows = await metaAll(env, `${acct.act_id}/insights`, {
    level: 'ad', time_increment: 1,
    time_range: { since, until },
    // NO `video_3_sec_watched_actions` — Meta REMOVED it, and asking for it
    // fails the WHOLE request with "(#100) not valid for fields param", which
    // silently broke every brand's ad sync for two nights in August 2026. The
    // 3-second view now lives in `actions` as action_type `video_view`.
    fields: 'ad_id,ad_name,adset_id,campaign_id,spend,impressions,reach,clicks,inline_link_clicks,outbound_clicks,'
      + 'actions,action_values,video_play_actions,video_thruplay_watched_actions,'
      + 'video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,'
      + 'video_avg_time_watched_actions',
    limit: 500,
  }, 25);
  // Video metrics arrive as action arrays with a single video_view entry; sum
  // defensively in case Meta ever splits them by attribution window.
  const sumActs = a => Array.isArray(a) ? a.reduce((s, x) => s + (+x.value || 0), 0) : 0;
  const daily = rows.filter(r => r.ad_id).map(r => [acct.act_id, r.ad_id, r.date_start, +r.spend || 0, +r.impressions || 0,
    pickAction(r.actions, PURCHASE_TYPES), pickAction(r.action_values, PURCHASE_TYPES),
    +r.inline_link_clicks || 0, pickAction(r.actions, ['video_view']),
    sumActs(r.video_thruplay_watched_actions), sumActs(r.video_p100_watched_actions),
    +r.reach || 0, +r.clicks || 0, sumActs(r.outbound_clicks),
    sumActs(r.video_p25_watched_actions), sumActs(r.video_p50_watched_actions), sumActs(r.video_p75_watched_actions),
    // avg watch time is SECONDS per impression-ish, not a count — never summed.
    sumActs(r.video_avg_time_watched_actions), sumActs(r.video_play_actions)]);
  const COLS = 19;
  const per = Math.floor(100 / COLS);                  // D1 caps a statement at 100 bound params
  const stmts = [];
  for (let i = 0; i < daily.length; i += per) {
    const chunk = daily.slice(i, i + per);
    stmts.push(env.DB.prepare(
      `INSERT INTO ad_daily (act_id, ad_id, date, spend, impressions, purchases, revenue, link_clicks, video_3s,
         video_thruplay, video_p100, reach, clicks_all, outbound_clicks, video_p25, video_p50, video_p75, video_avg_watch, video_plays) VALUES ` +
      chunk.map(() => `(${Array(COLS).fill('?').join(',')})`).join(',') +
      ` ON CONFLICT(act_id, ad_id, date) DO UPDATE SET spend = excluded.spend, impressions = excluded.impressions,
        purchases = excluded.purchases, revenue = excluded.revenue, link_clicks = excluded.link_clicks,
        video_3s = excluded.video_3s, video_thruplay = excluded.video_thruplay, video_p100 = excluded.video_p100,
        reach = excluded.reach, clicks_all = excluded.clicks_all, outbound_clicks = excluded.outbound_clicks,
        video_p25 = excluded.video_p25, video_p50 = excluded.video_p50, video_p75 = excluded.video_p75,
        video_avg_watch = excluded.video_avg_watch, video_plays = excluded.video_plays`,
    ).bind(...chunk.flat()));
  }
  const ads = new Map();
  for (const r of rows) if (r.ad_id && !ads.has(r.ad_id)) ads.set(r.ad_id, [acct.act_id, r.ad_id, r.ad_name || r.ad_id, r.adset_id || null, r.campaign_id || null]);
  const adRows = [...ads.values()];
  for (let i = 0; i < adRows.length; i += 20) {
    const chunk = adRows.slice(i, i + 20);
    stmts.push(env.DB.prepare(
      `INSERT INTO ads (act_id, ad_id, name, adset_id, campaign_id) VALUES ` +
      chunk.map(() => '(?,?,?,?,?)').join(',') +
      ` ON CONFLICT(act_id, ad_id) DO UPDATE SET name = excluded.name, adset_id = excluded.adset_id, campaign_id = excluded.campaign_id`,
    ).bind(...chunk.flat()));
  }
  for (let i = 0; i < stmts.length; i += D1_CHUNK) await env.DB.batch(stmts.slice(i, i + D1_CHUNK));
  return rows.length;
}

async function updFirstSpend(env, actId) {
  await env.DB.prepare(
    `UPDATE ads SET first_spend_date = (SELECT MIN(d.date) FROM ad_daily d
       WHERE d.act_id = ads.act_id AND d.ad_id = ads.ad_id AND d.spend > 0) WHERE act_id = ?1`,
  ).bind(actId).run();
}

/** True creation dates from Meta — without them, ads older than our 90-day history
 *  would all look "brand new" at the start of the window. */
async function syncAdMeta(env, acct) {
  const rows = await metaAll(env, `${acct.act_id}/ads`, { fields: 'id,created_time', limit: 500 }, 10);
  const vals = rows.filter(r => r.id && r.created_time).map(r => [acct.act_id, r.id, r.created_time]);
  const stmts = [];
  for (let i = 0; i < vals.length; i += 30) {
    const chunk = vals.slice(i, i + 30);
    stmts.push(env.DB.prepare(
      `INSERT INTO ads (act_id, ad_id, created_time) VALUES ` + chunk.map(() => '(?,?,?)').join(',') +
      ` ON CONFLICT(act_id, ad_id) DO UPDATE SET created_time = excluded.created_time`,
    ).bind(...chunk.flat()));
  }
  for (let i = 0; i < stmts.length; i += D1_CHUNK) await env.DB.batch(stmts.slice(i, i + D1_CHUNK));
  return vals.length;
}

/** Resumable ad-level sync. Backfill walks backwards 14 days at a time until 90 days are
 *  in; once done, each call is a cheap 3-day resync. Errors land in accounts.last_error. */
async function syncAdDaily(env, acct, { maxSlices = 2 } = {}) {
  const today = localDate(acct.tz);
  try {
    if (acct.ads_backfill_done) {
      let n = await syncAdSlice(env, acct, addDays(today, -RESYNC_DAYS), today);
      // Metric re-backfill. Every time ad_daily gains columns, the rows already
      // stored hold zeros for them, so the window has to be walked again in the
      // same resumable 14-day slices — the upsert fills the new columns without
      // touching anything a report already froze.
      //
      // Keyed on a VERSION rather than a per-feature boolean: the first round of
      // this (hook/hold, 2026-08-29) used `ads_video_done`, and adding a second
      // batch of columns a day later would have needed a second flag, then a
      // third. Bump ADS_METRICS_VERSION when columns are added and every account
      // re-backfills itself once.
      if ((acct.ads_metrics_version || 0) < ADS_METRICS_VERSION) {
        const target = addDays(today, -BACKFILL_DAYS);
        let cursor = acct.ads_metrics_cursor || addDays(today, -RESYNC_DAYS);   // the resync above just covered the recent days
        let slices = maxSlices;
        while (slices-- > 0 && cursor > target) {
          const since = addDays(cursor, -14) < target ? target : addDays(cursor, -14);
          n += await syncAdSlice(env, acct, since, cursor);
          cursor = since;
        }
        const done = cursor <= target;
        await env.DB.prepare(
          `UPDATE accounts SET ads_metrics_cursor = ?2, ads_metrics_version = ?3 WHERE act_id = ?1`,
        ).bind(acct.act_id, done ? null : cursor, done ? ADS_METRICS_VERSION : (acct.ads_metrics_version || 0)).run();
      }
      await updFirstSpend(env, acct.act_id);
      await syncAdMeta(env, acct);
      return { rows: n, done: true };
    }
    const target = addDays(today, -BACKFILL_DAYS);
    let cursor = (await env.DB.prepare(`SELECT MIN(date) AS d FROM ad_daily WHERE act_id = ?1`).bind(acct.act_id).first())?.d || today;
    let total = 0, slices = maxSlices;
    while (slices-- > 0 && cursor > target) {
      const since = addDays(cursor, -14) < target ? target : addDays(cursor, -14);
      total += await syncAdSlice(env, acct, since, cursor);
      cursor = since;
    }
    const done = cursor <= target;
    // A fresh backfill pulls the video columns from day one, so it settles both flags.
    if (done) await env.DB.prepare(`UPDATE accounts SET ads_backfill_done = 1, ads_metrics_version = ?2 WHERE act_id = ?1`).bind(acct.act_id, ADS_METRICS_VERSION).run();
    await updFirstSpend(env, acct.act_id);
    await syncAdMeta(env, acct);
    return { rows: total, done, daysDone: Math.min(BACKFILL_DAYS, Math.max(0, ymdDiff(today, cursor))), daysTotal: BACKFILL_DAYS };
  } catch (e) {
    await env.DB.prepare(`UPDATE accounts SET last_error = ?2 WHERE act_id = ?1`).bind(acct.act_id, `ad sync: ${e.message}`).run().catch(() => {});
    await alertSyncFailure(env, acct, e.message).catch(() => {});
    return { error: e.message };
  }
}

/** Full sync for one account. `days` overrides the insights window. */
/* `includeAds` exists because the two halves of this function have completely
   different appetites for Meta's rate limit.
 *
 * Account-level insights and the activity log are a couple of cheap calls and
 * are what everything time-critical reads — the delivery check, the brief, every
 * dashboard number. Ad-level is a 14-day-sliced walk, up to 8 slices a brand,
 * and it feeds creative cards and the report ad table: useful, never urgent.
 *
 * When per-brand syncing moved from the nightly onto the hourly tick
 * (2026-09-01) the ad-level walk came with it, and six brands x 8 slices went
 * from ~48 Meta calls a day to over a thousand. Meta answered with "Application
 * request limit reached", which is how Cole found out. The staleness fix needed
 * the cheap half hourly; it never needed the expensive half. So the hourly tick
 * takes insights and activities, and ad-level stays on the nightly where it
 * always belonged. */
async function syncAccount(env, acct, days, { includeAds = true } = {}) {
  const out = { act_id: acct.act_id, name: acct.name };
  try {
    const insightDays = days ?? (acct.last_sync_insights ? RESYNC_DAYS : BACKFILL_DAYS);
    out.insights = await syncInsights(env, acct, insightDays);
    const since = acct.last_sync_activities
      ? new Date(new Date(acct.last_sync_activities).getTime() - 6 * 3600e3).toISOString()  // 6h overlap
      : new Date(Date.now() - ACTIVITY_BACKFILL_DAYS * 86400e3).toISOString();
    out.activities = await syncActivities(env, acct, since);
    if (includeAds) out.ad = await syncAdDaily(env, acct, { maxSlices: 8 });
  } catch (e) {
    out.error = e.message;
    // A rate limit is not this brand's fault and not this brand's problem alone.
    if (await noteMetaError(env, e)) out.backoff = true;
    await env.DB.prepare(`UPDATE accounts SET last_error = ?2 WHERE act_id = ?1`).bind(acct.act_id, e.message).run();
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Summarise (Chat 1) — Claude writes the daily/weekly update         */
/* ------------------------------------------------------------------ */

const ANTHROPIC_MODEL = 'claude-opus-5';

async function claude(env, { system, user, maxTokens = 4000 }) {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY secret is not set — run `npx wrangler secret put ANTHROPIC_API_KEY` in account-health/worker/');
  }
  const res = await xfetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error?.message || `Claude API HTTP ${res.status}`);
  if (body.stop_reason === 'refusal') throw new Error('Claude declined to write this summary');
  return body.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

const SUMMARISE_TEMPLATES = {
  daily: {
    label: 'Daily standup',
    system: `You are a senior media buyer at Mobius Digital writing the internal daily Slack update.
Write a tight update from the change log + performance data you're given. Rules:
- One short section per client (bold name), bullets under it. Skip clients with nothing to say.
- Lead each bullet with what changed and why (use the reason/note tags when present), then a one-line read on performance if the data supports it.
- Ignore housekeeping noise (renames, drafts, system events) unless it's the only activity.
- Money stays in each account's own currency. The last ~3 days of conversions are still settling — hedge accordingly.
- Plain text with Slack-style *bold*, no headers, no preamble, no sign-off.`,
  },
  weekly: {
    label: 'Weekly recap',
    system: `You are a senior media buyer at Mobius Digital writing the internal weekly recap.
For each client with meaningful activity or spend, write a short block:
- *Client name* — performance vs the previous window (spend, CPA, ROAS — only metrics that actually moved),
- what we changed and why (group related changes; use reason/note tags),
- one line on what's next if the changes imply it.
Ignore housekeeping noise. Money stays in each account's own currency; the last ~3 days are still settling.
Plain text with Slack-style *bold*, no preamble, no sign-off.`,
  },
  client: {
    label: 'Client-facing update',
    system: `You are writing a client-facing update from Mobius Digital, their paid-social agency, about their Meta ads account.
Rules:
- Warm, confident, plain English — no internal jargon, no ad-account IDs, no "activity log".
- Summarise what was done and why it's good for them, then how the account is trending (only well-supported numbers, in their currency).
- Recent conversions still settle for ~72h — phrase recent performance carefully.
- 100–180 words, no subject line, no greeting or sign-off placeholders.`,
  },
};

/** Compact plain-text data pack for one account: window stats + change list. */
function packAccount(a, cur, prev, events, from, to) {
  const f = n => n == null ? '—' : (Math.round(n * 100) / 100).toString();
  const stat = s => `spend ${f(s.spend)} ${a.currency}, purchases ${f(s.purchases)}, CPA ${f(s.cpa)}, ROAS ${f(s.roas)}, CTR ${s.ctr == null ? '—' : (s.ctr * 100).toFixed(2) + '%'}`;
  const lines = [`## ${a.name} (${a.currency})`,
    `Window ${from}..${to}: ${stat(cur)}`,
    `Previous window (same length): ${stat(prev)}`,
    `Changes (${events.length}${events.length > 120 ? ', first 120 shown' : ''}):`];
  for (const ev of events.slice(0, 120)) {
    const tags = [ev.reason ? `reason: ${ev.reason}` : ev.suggested_reason ? `suggested reason (auto, unreviewed): ${ev.suggested_reason}` : null,
      ev.note && `note: ${ev.note}`,
      ev.confirmed === 1 ? 'confirmed' : null, ev.manual ? 'manual entry' : null].filter(Boolean);
    lines.push(`- ${String(ev.event_time).slice(0, 16).replace('T', ' ')} [${ev.category}] ${ev.summary}${ev.actor ? ` (by ${ev.actor})` : ''}${tags.length ? ` {${tags.join('; ')}}` : ''}`);
  }
  if (!events.length) lines.push('- (no changes logged in this window)');
  return lines.join('\n');
}

async function writeUpdate(env, { act, from, to, template }) {
  const tpl = SUMMARISE_TEMPLATES[template] || SUMMARISE_TEMPLATES.daily;
  const accounts = (await listAccounts(env, true)).filter(a => act === 'all' || !act ? true : a.act_id === act);
  if (!accounts.length) throw new Error('no matching active account');
  if (template === 'client' && accounts.length > 1) throw new Error('pick one client for a client-facing update');
  const days = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400e3) + 1);
  const prevFrom = addDays(from, -days), prevTo = addDays(from, -1);
  const packs = [];
  for (const a of accounts) {
    const { results: evs } = await env.DB.prepare(
      `SELECT event_time, category, summary, actor, reason, suggested_reason, note, confirmed, manual FROM activities
       WHERE act_id = ?1 AND event_time >= ?2 AND event_time <= ?3 AND confirmed != -1 ORDER BY event_time`,
    ).bind(a.act_id, from, to + 'T23:59:59').all();
    const cur = agg((await env.DB.prepare(`SELECT * FROM daily_insights WHERE act_id = ?1 AND date BETWEEN ?2 AND ?3`).bind(a.act_id, from, to).all()).results);
    const prev = agg((await env.DB.prepare(`SELECT * FROM daily_insights WHERE act_id = ?1 AND date BETWEEN ?2 AND ?3`).bind(a.act_id, prevFrom, prevTo).all()).results);
    packs.push(packAccount(a, cur, prev, evs, from, to));
  }
  const text = await claude(env, {
    system: tpl.system,
    user: `Window: ${from} to ${to} (previous window ${prevFrom}..${prevTo} for comparison).\nTags marked "suggested reason (auto, unreviewed)" are machine-inferred from performance direction, not stated by the team — hedge accordingly.\n\n${packs.join('\n\n')}`,
  });
  return { text, template: template || 'daily', model: ANTHROPIC_MODEL, from, to, accounts: accounts.map(a => a.name) };
}

/* ------------------------------------------------------------------ */
/*  Triple Whale client (Daily Brief only — the four Meta pages never    */
/*  touch it; spend on those pages is Meta-reported, matching Ads Mgr)   */
/* ------------------------------------------------------------------ */

/* Triple Whale's summary-page WINDOW IS SHIFTED ONE DAY EARLIER than the dates you
   ask for. Asking for 2026-08-29..2026-08-29 returns 2026-08-28's numbers; asking
   2026-08-24..2026-08-30 returns 2026-08-23..2026-08-29. Verified 2026-08-30 on
   Grunk Dolfer against tw_daily, four windows, matching to the cent.

   Which side is wrong is not a guess: tw_daily is built from charts.current (whose
   x is a one-based day-of-year and carries its own date), and its fb_ads_spend
   matches Meta's OWN dated spend to the cent for 2026-08-24 through 2026-08-27. So
   tw_daily is right and the period totals are the shifted ones.

   twWindow is therefore the ONLY way any period total should be fetched - it asks
   for [start+1, end+1] so the numbers that come back are [start, end]. twSummary
   stays raw for syncTwDaily, which reads charts.current and does not care.

   This mattered: every weekly and monthly report ran on the raw call, so a report
   billed as Mon-Sun actually covered Sun-Sat. */
/* ---------------- Triple Whale ad-level attribution ----------------
   Cole's rule: anything attribution-shaped should be Triple Whale's, and Meta
   only where TW cannot measure it. TW CAN do this - the earlier note in this
   file saying the endpoint 403s was wrong (see the 2026-08-30 section).

   `attribution/get-orders-with-journeys-v2` returns ORDERS, not aggregated ad
   metrics, so the aggregation is ours: page the orders for a window, walk each
   order's touchpoints, and credit its revenue to the ad that touchpoint names.

   ALL SIX MODELS ARE STORED, not one. They arrive in the SAME response - every
   order carries firstClick, lastClick, fullFirstClick, fullLastClick,
   lastPlatformClick, linear and linearAll side by side - so storing every one
   costs no extra call, and picking a single model in code would have forced a
   decision onto Cole that the UI can simply offer him.

   The two models named "linear" SPLIT one order across its touchpoints; the
   click models give the whole order to one. Both are handled by weighting each
   touchpoint 1/n within its own model, which is exactly what linear means and
   is a harmless no-op for a single-touchpoint click model. */
const TW_ATTR_MODELS = ['firstClick', 'lastClick', 'fullFirstClick', 'fullLastClick',
  'lastPlatformClick', 'linear', 'linearAll'];
/** The two that genuinely DIVIDE an order across its touchpoints. Everything
 *  else names a winner per platform and credits it the whole order. */
const LINEAR_MODELS = new Set(['linear', 'linearAll']);

async function twJourneys(env, shopDomain, start, end, page) {
  const res = await xfetch('https://api.triplewhale.com/api/v2/attribution/get-orders-with-journeys-v2', {
    method: 'POST',
    headers: { 'x-api-key': env.TW_API_KEY, 'content-type': 'application/json' },
    /* Send the exact key set the probe proved returns 200. `shopId` gives a
       403 Access Denied; `shopDomain` alone also 403s here, so TW evidently
       wants `shop` too. Both date spellings are sent because the probe carried
       both and it is not worth another round trip to discover which it reads. */
    body: JSON.stringify({ shopDomain, shop: shopDomain,
      startDate: start, endDate: end, start_date: start, end_date: end, page }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Triple Whale attribution: ${body.message || body.error || `HTTP ${res.status}`}`);
  return body;
}

/* How far back attribution is kept. Chosen to cover the longest window the
   period control offers (90 days) with room to spare, so a range the UI can ask
   for is never one the data cannot answer. */
const TW_ATTR_HISTORY_DAYS = 120;

/** Pull journeys for a window and roll them up to (date, ad_id, model).
 *  Pass {from,to} to pull an explicit range; otherwise the last `days`. */
async function syncTwAttribution(env, acct, days = 7, range = null) {
  if (!env.TW_API_KEY) return { name: acct.name, skipped: 'TW_API_KEY not set' };
  if (!acct.tw_shop) return { name: acct.name, skipped: 'no Triple Whale shop' };
  const today = localDate(acct.tz);
  const end = range ? range.to : addDays(today, -1);
  const start = range ? range.from : addDays(end, -(Math.min(days, 120) - 1));

  const agg = new Map();                       // `${date}|${ad}|${model}` -> {rev, ord}
  const seenModels = new Set();                // what TW ACTUALLY sends, not what we assumed
  let page = 1, orders = 0, pages = 0;
  // Capped: this runs nightly for six brands and a runaway page loop would
  // spend the whole invocation budget on one of them.
  while (page <= 40) {
    const body = await twJourneys(env, acct.tw_shop, start, end, page);
    const rows = body.ordersWithJourneys || [];
    pages++;
    for (const o of rows) {
      orders++;
      const rev = +o.total_price || 0;
      if (!rev) continue;
      // The order's OWN date, not the touchpoint's - revenue lands when the
      // money did, which is what every other figure in Locus is dated by.
      const date = String(o.created_at || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      for (const k of Object.keys(o.attribution || {})) seenModels.add(k);
      for (const model of TW_ATTR_MODELS) {
        const tps = (o.attribution?.[model] || []).filter(t => t && t.adId);
        if (!tps.length) continue;             // organic, direct, or a non-paid touch
        /* WEIGHTING FOLLOWS THE MODEL, and this was wrong at first.
           I split every order 1/n across its touchpoints, including the CLICK
           models - but a click model's array is not a split, it is one entry
           PER PLATFORM. Live example: one Lucky order carried google-ads,
           organic and facebook-ads under `lastPlatformClick`. Splitting it gave
           Facebook 50% of an order Triple Whale's own interface credits to it
           in full, so every click-model ROAS read low against the number Cole
           sees in Triple Whale.
           Linear models DO mean a split - that is their definition - so they
           keep 1/n. Click models credit each touchpoint the whole order, which
           matches Triple Whale and is why per-platform revenue can exceed the
           order total: the platforms double-count each other, exactly as their
           UI shows and as the blended MER on the other tabs exists to avoid. */
        const w = LINEAR_MODELS.has(model) ? 1 / tps.length : 1;
        for (const t of tps) {
          const k = `${date}|${t.adId}|${model}`;
          const cur = agg.get(k) || { rev: 0, ord: 0 };
          cur.rev += rev * w; cur.ord += w;
          agg.set(k, cur);
        }
      }
    }
    if (body.finishedRange || !rows.length) break;
    page++;
  }

  /* Replace the window wholesale rather than upserting: attribution RESTATES as
     journeys resolve, so an order that moved from one ad to another must not
     leave its old credit behind. Deleting the window first makes the sync
     idempotent - re-running it can only ever converge. */
  await env.DB.prepare(`DELETE FROM tw_ad_attr WHERE act_id = ?1 AND date >= ?2 AND date <= ?3`)
    .bind(acct.act_id, start, end).run();

  const rows = [...agg.entries()];
  // D1 caps a statement at 100 bound parameters; 6 columns -> 16 rows a chunk.
  for (let i = 0; i < rows.length; i += 16) {
    const chunk = rows.slice(i, i + 16);
    const sql = `INSERT INTO tw_ad_attr (act_id, date, ad_id, model, revenue, orders) VALUES `
      + chunk.map((_, n) => `(?${n * 6 + 1},?${n * 6 + 2},?${n * 6 + 3},?${n * 6 + 4},?${n * 6 + 5},?${n * 6 + 6})`).join(',');
    const binds = [];
    for (const [k, v] of chunk) {
      const [date, ad, model] = k.split('|');
      binds.push(acct.act_id, date, ad, model, v.rev, v.ord);
    }
    await env.DB.prepare(sql).bind(...binds).run();
  }
  return { name: acct.name, from: start, to: end, orders, pages, rows: rows.length,
    models_seen: [...seenModels].sort(), models_stored: TW_ATTR_MODELS };
}

async function twWindow(env, shopDomain, start, end) {
  return twSummary(env, shopDomain, addDays(start, 1), addDays(end, 1));
}

async function twSummary(env, shopDomain, start, end) {
  const res = await xfetch('https://api.triplewhale.com/api/v2/summary-page/get-data', {
    method: 'POST',
    headers: { 'x-api-key': env.TW_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ shopDomain, period: { start, end }, todayHour: 24 }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Triple Whale: ${body.message || body.error || `HTTP ${res.status}`}`);
  // Normalize to {name: value} — TW's response shape has varied across versions.
  const map = {};
  const num = v => typeof v === 'number' && isFinite(v) ? v
    : typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v
    : v && typeof v === 'object' ? num(v.value ?? v.metricValue ?? v.total) : null;
  const add = (k, v) => { const n = num(v); if (k != null && n != null) map[String(k)] = n; };
  if (Array.isArray(body.metrics)) {
    // Real observed shape: {metrics: [{id, metricId, title, values: {current, previous}, charts…}]}
    for (const it of body.metrics) {
      if (!it || typeof it !== 'object') continue;
      add(it.metricId ?? it.id ?? it.metricName ?? it.name, it.values?.current ?? it.value ?? it.metricValue ?? it.total);
    }
  } else {
    const walk = node => {
      if (Array.isArray(node)) { for (const it of node) if (it && typeof it === 'object') add(it.metricName ?? it.name ?? it.id ?? it.key, it.values?.current ?? it.value ?? it.metricValue ?? it.total ?? it); return; }
      if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) {
        if (Array.isArray(v) || (v && typeof v === 'object' && !('value' in v) && !('total' in v) && num(v) == null)) walk(v);
        else add(k, v);
      }
    };
    walk(body);
  }
  return { map, raw: body };
}

/* ------------------------------------------------------------------ */
/*  Daily Brief (Chat 5) — CTC-style forecast vs actual, per client    */
/*  Money math is Triple Whale (net sales, new/returning, blended      */
/*  spend); Meta ROAS stays Meta-attributed. aMER = new-customer       */
/*  revenue ÷ total ad spend. CM = net sales × margin% − ad spend.     */
/* ------------------------------------------------------------------ */

/** Which TW metrics are worth keeping per-day (id or title match). */
/* Which Triple Whale metrics are worth storing per day.
 *
 * ctr|cpm|impression|click|purchases|benchmark were added 2026-08-28. Without
 * them the filter silently dropped Facebook CTR, CPM, Impressions and Clicks -
 * Triple Whale has always offered those, and their absence was mistaken for TW
 * not having the data, which nearly sent the Meta section of the report to
 * Meta own API for numbers Triple Whale could answer. benchmark picks up TW PEER
 * figures (Peer Facebook CPM/CTR/ROAS), a paid feature elsewhere, being binned.
 *
 * Widening this only affects what is STORED from now on; existing rows need a
 * backfill to gain the new metrics. */
const TW_KEEP = /sales|revenue|spend|adcost|cost|profit|cogs|orders|\bmer\b|roas|refund|shipping|fees|ads|tax|ltv|cpa|ctr|cpm|impression|click|purchases|benchmark/i;
/* CAREFUL - Triple Whale's field names do not mean what they say:
 *   netSales   is titled "Total Sales"  = Shopify TOTAL SALES, i.e. it ALREADY
 *              includes shipping charged to customers AND sales tax, net of
 *              discounts and returns.
 *   totalSales is titled "Order Revenue" = the same thing BEFORE returns.
 * Verified against Shopify for Lucky Golf, July 2026: TW netSales 77,990.42 vs
 * Shopify total_sales 77,966.52 (0.03%), while Shopify net_sales was 72,055.46.
 * So never add totalShippingPrice to this - that counts shipping twice. */
const TW_SALES = ['netSales', 'totalSales'];

/** Per-day series out of a summary-page response: {metricId: {date: value}}.
 *  charts.current x = zero-based day-of-year in the shop's timezone (verified 2026-08-20). */
function twDailySeries(raw, start, end) {
  const out = {};
  if (!Array.isArray(raw?.metrics)) return out;
  const startY = +start.slice(0, 4), endY = +end.slice(0, 4);
  // TW's chart x is a ONE-BASED day of year: Jan 1 is 1, not 0. Treating it as
  // zero-based shifts every value a day into the future, which silently reported
  // yesterday's numbers as today's. Verified against Meta's own dated spend:
  // Meta booked $678.05 for Bonk on 2026-08-19 and TW returns it at x=231, which
  // is 1-based for Aug 19.
  const doyToDate = x => {
    for (const y of startY === endY ? [startY] : [startY, endY]) {
      const d = new Date(Date.UTC(y, 0, 1) + (x - 1) * 86400e3).toISOString().slice(0, 10);
      if (d >= start && d <= end) return d;
    }
    return null;
  };
  for (const m of raw.metrics) {
    const id = m.metricId ?? m.id;
    if (!id || !Array.isArray(m.charts?.current)) continue;
    if (!TW_KEEP.test(id + ' ' + (m.title || ''))) continue;
    for (const p of m.charts.current) {
      const d = doyToDate(+p.x);
      if (d != null) (out[id] ??= {})[d] = +p.y || 0;
    }
  }
  return out;
}

/** Pull the last `days` days of per-day TW metrics into tw_daily (one API call). */
async function syncTwDaily(env, acct, days = 10) {
  if (!env.TW_API_KEY) return { name: acct.name, skipped: 'TW_API_KEY secret not set' };
  if (!acct.tw_shop) return { name: acct.name, skipped: 'no Triple Whale shop set' };
  const today = localDate(acct.tz);
  // Up to ~14 months, so the Plan page can show a real six-month history and a
  // year-ago comparison. One TW call covers the whole window.
  const start = addDays(today, -Math.min(days, 430));
  const res = await twSummary(env, acct.tw_shop, start, today);
  const daily = twDailySeries(res.raw, start, today);
  const stmts = [];
  for (const [id, byDate] of Object.entries(daily))
    for (const [date, v] of Object.entries(byDate))
      stmts.push(env.DB.prepare(
        `INSERT INTO tw_daily (act_id, date, metric, value, synced_at) VALUES (?1,?2,?3,?4,datetime('now'))
         ON CONFLICT(act_id, date, metric) DO UPDATE SET value = excluded.value, synced_at = excluded.synced_at`,
      ).bind(acct.act_id, date, id, v));
  // Bigger batches: a 400-day backfill is ~25k rows, and every batch is a
  // subrequest against the Worker's per-invocation limit.
  for (let i = 0; i < stmts.length; i += D1_CHUNK) await env.DB.batch(stmts.slice(i, i + D1_CHUNK));
  if (Array.isArray(res.raw?.metrics)) {
    await putSetting(env, `twCatalog:${acct.act_id}`,
      JSON.stringify(res.raw.metrics.map(m => ({ id: m.metricId ?? m.id, title: m.title })))).catch(() => {});
  }
  return { name: acct.name, ok: true, metrics: Object.keys(daily).length, from: start, to: today, rows: stmts.length };
}

/** Suggested monthly goals from the trailing 28 full days: run-rate sales/spend, trailing aMER. */
async function suggestGoals(env, acct) {
  const today = localDate(acct.tz);
  const from = addDays(today, -28);
  const { results } = await env.DB.prepare(
    `SELECT date, metric, value FROM tw_daily WHERE act_id = ?1 AND date >= ?2 AND date < ?3
     AND metric IN ('netSales','totalSales','newCustomerSales','blendedAds','ga_adCost','grossProfit','totalProductCosts','totalPaymentGatewayCosts','totalNetTaxes')`,
  ).bind(acct.act_id, from, addDays(win ? win.to : today, 1)).all();
  const piv = {};
  for (const r of results) (piv[r.metric] ??= {})[r.date] = r.value;
  const dates = Object.keys(piv.netSales || piv.totalSales || {}).sort();
  if (dates.length < 14) return { error: 'need at least 14 days of Triple Whale history — hit “Refresh Triple Whale data” first' };
  const { results: metaRows } = await env.DB.prepare(
    `SELECT date, spend FROM daily_insights WHERE act_id = ?1 AND date >= ?2 AND date < ?3`,
  ).bind(acct.act_id, from, today).all();
  const metaBy = Object.fromEntries(metaRows.map(r => [r.date, r.spend]));
  let sales = 0, spend = 0, newRev = 0, marginNum = 0, marginDen = 0;
  for (const d of dates) {
    // Same revenue basis as everywhere else: Shopify TOTAL SALES minus sales tax.
    // Shipping is already inside netSales and must never be added. Get this wrong and
    // a goal set here is measured against a different number for the rest of the month.
    const s = (piv.netSales?.[d] ?? piv.totalSales?.[d] ?? 0) - (piv.totalNetTaxes?.[d] ?? 0);
    sales += s;
    spend += piv.blendedAds?.[d] ?? ((metaBy[d] ?? 0) + (piv.ga_adCost?.[d] ?? 0));
    newRev += piv.newCustomerSales?.[d] ?? 0;
    const gp = piv.grossProfit?.[d] ?? (piv.totalProductCosts?.[d] != null ? s - piv.totalProductCosts[d] - (piv.totalPaymentGatewayCosts?.[d] ?? 0) : null);
    if (gp != null && s > 0) { marginNum += gp; marginDen += s; }
  }
  const n = dates.length, dim = daysInMonth(today);
  const round = (v, step) => Math.round(v / step) * step;
  return {
    ok: true, days_used: n,
    sales: Math.max(500, round(sales / n * dim, 500)),
    spend: acct.monthly_budget ?? Math.max(250, round(spend / n * dim, 250)),
    spend_source: acct.monthly_budget != null ? 'the monthly target in Settings' : 'trailing 28-day run-rate',
    amer: spend > 0 && newRev > 0 ? Math.round(newRev / spend * 20) / 20 : null,
    margin_28d: marginDen > 0 ? marginNum / marginDen : null,
    daily_sales: sales / n, daily_spend: spend / n,
  };
}

/** Is the client's COGS data in Triple Whale trustworthy enough to state Contribution
 *  Margin to their face? Real cost data is stable day to day; incomplete COGS (some SKUs
 *  costed, some not) makes daily margin swing wildly or go negative. */
function judgeCogs(dayMargins, blended) {
  const n = dayMargins.length;
  if (!n || blended == null) return { verdict: 'none', reason: 'no cost data in Triple Whale' };
  const sorted = dayMargins.slice().sort((a, b) => a - b);
  const lo = sorted[Math.floor(n * 0.1)], hi = sorted[Math.floor(n * 0.9)];
  // Same semantics as Profit's judgeCosts — the two tools must not drift apart:
  //  - MATERIALITY FLOOR: a day at -0.3% is product mix, not contamination. Real
  //    contamination (wholesale paid outside Shopify, an inventory receipt booked
  //    to one day) is a MULTIPLE of the day's revenue. Anything above -5% ignores.
  //  - PATTERN, not incident: one bad day in 28 used to flip the whole client to
  //    "broken" and strip CM from the client-facing brief while 27 days ran clean.
  //    Only more than a tenth of the window means the data itself is untrustworthy.
  const negatives = dayMargins.filter(m => m < -0.05).length;
  const spread = hi - lo;
  const out = { verdict: 'good', days: n, blended, spread, negatives, p10: lo, p90: hi };
  const heavilyContaminated = negatives > Math.max(1, n * 0.1);
  if (heavilyContaminated || blended <= 0.15 || spread > 0.6) {
    out.verdict = 'broken';
    out.reason = heavilyContaminated
      ? `${negatives} of the last ${n} days record more variable cost than the store took in — typically wholesale orders paid outside Shopify or an inventory delivery booked as one day's cost`
      : blended <= 0.15
      ? `trailing margin of ${Math.round(blended * 100)}% is implausibly thin — COGS in Triple Whale looks wrong`
      : `daily margin swings ${Math.round(lo * 100)}%–${Math.round(hi * 100)}%, which means only some products have COGS set`;
  } else if (negatives > 0) {
    out.verdict = 'noisy';
    out.reason = `${negatives} of the last ${n} days record more variable cost than the store took in — almost always a wholesale order or inventory delivery; the other ${n - negatives} days are consistent, so the profit figures still stand`;
  } else if (spread > 0.4) {
    out.verdict = 'noisy';
    out.reason = `daily margin ranges ${Math.round(lo * 100)}%–${Math.round(hi * 100)}% — likely a few products missing COGS`;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Data health — can Triple Whale be trusted for this day?            */
/*                                                                     */
/*  2026-09-02: fb_ads_spend went to 0 for five of six brands and      */
/*  nothing noticed for three days. Bonk's brief reported $204 of       */
/*  spend against $769 actually spent, and its MER read 7.7x.          */
/*                                                                     */
/*  THE CHECK THAT DOES NOT WORK is adding Triple Whale's own numbers   */
/*  up. `blendedAds` IS the sum of TW's platform rows - measured over   */
/*  95 days of history it matches fb_ads_spend + ga_adCost + tiktok_    */
/*  spend + vibeSpend + … to the cent, on the broken days too, because  */
/*  a platform that drops out contributes a clean zero to both sides.   */
/*  An internal-consistency check would have passed every day of this   */
/*  outage.                                                            */
/*                                                                     */
/*  Two checks that DO work:                                           */
/*    1. AN OUTSIDE WITNESS. `daily_insights` is synced hourly from     */
/*       Meta's own API and owes Triple Whale nothing, so it can        */
/*       contradict it. This is the only platform we have a second      */
/*       source for, which is why Meta is treated specially - not       */
/*       because Meta matters more.                                     */
/*    2. CONTINUITY. A platform that has spent every day for a          */
/*       fortnight and reports nothing today has dropped out, whoever   */
/*       is at fault. It is weaker than a witness (a genuine pause      */
/*       looks identical) but it is all there is for Google, TikTok     */
/*       and the rest.                                                  */
/* ------------------------------------------------------------------ */

/** Triple Whale's per-platform ad spend ids → the name a human uses.
 *  A platform absent from this map is still counted inside blendedAds; it just
 *  gets no continuity check of its own, so adding one here only ever helps. */
const TW_PLATFORM_SPEND = {
  fb_ads_spend: 'Meta', ga_adCost: 'Google', tiktok_spend: 'TikTok',
  snapchatSpend: 'Snapchat', pinterestSpend: 'Pinterest', twitter_spend: 'X',
  redditSpend: 'Reddit', applovinSpend: 'AppLovin', adrollSpend: 'AdRoll',
  stackadaptSpend: 'StackAdapt', vibeSpend: 'Vibe', impactSpend: 'Impact',
  influencerSpend: 'Influencer', bingSpend: 'Microsoft',
};
/* Below this, a day's Meta spend is too small for the comparison to mean
   anything: TW and Meta cut the day on different clocks, so a $12 day can
   legitimately differ by half. */
const META_WITNESS_FLOOR = 25;
/* How far under Meta's own figure TW is allowed to sit before we stop
   believing it. 10% absorbs the timezone edge; a dropped connection is 100%. */
const META_WITNESS_TOL = 0.9;
/* A platform reporting less than a fifth of its own fortnight is a dropout,
   not a slow day. */
const DROPOUT_RATIO = 0.2;
/* Ignore continuity on platforms spending pocket change - an influencer line
   that runs $3 some days and $0 others is not an outage. */
const DROPOUT_FLOOR = 10;

/** The day's total ad spend, and whether Triple Whale's own total was believable.
 *  `metaApi` is Meta's own reported spend for that date (daily_insights).
 *
 *  When TW's Meta row is materially below Meta's own figure we REBUILD the
 *  total rather than dropping TW: keep every other platform TW reports
 *  (its blended total minus its own Meta row) and put Meta's real figure back
 *  in place. Verified against 2026-09-03: Lucky rebuilt to $1,277 against
 *  $1,276 actually spent across Meta, Google and Vibe. */
function spendFor(piv, date, metaApi) {
  const blended = piv.blendedAds?.[date] ?? null;
  const twMeta = piv.fb_ads_spend?.[date] ?? null;
  const google = piv.ga_adCost?.[date] ?? null;
  const witnessed = metaApi != null && metaApi > META_WITNESS_FLOOR;
  const metaMissing = witnessed && (twMeta == null || twMeta < metaApi * META_WITNESS_TOL);
  if (metaMissing) {
    const others = blended != null
      ? Math.max(0, blended - (twMeta ?? 0))     // every platform TW still reports
      : (google ?? 0);
    return { spend: metaApi + others, source: 'rebuilt', tw_blended: blended, tw_meta: twMeta, meta_api: metaApi };
  }
  if (blended != null) return { spend: blended, source: 'triple_whale', tw_blended: blended, tw_meta: twMeta, meta_api: metaApi };
  // No TW row at all — the pre-existing fallback, kept so a brand mid-backfill
  // still reports something.
  const parts = metaApi != null || google != null ? (metaApi ?? 0) + (google ?? 0) : null;
  return { spend: parts, source: parts == null ? 'none' : 'platforms', tw_blended: null, tw_meta: twMeta, meta_api: metaApi };
}

/** Median of a platform's last 14 days, as the baseline a dropout is judged against.
 *  Median not mean: one $0 day must not drag the bar down to where the next $0
 *  day looks normal. */
function platformBaseline(piv, metric, date) {
  const vals = [];
  for (let i = 1; i <= 14; i++) { const v = piv[metric]?.[addDays(date, -i)]; if (v != null) vals.push(v); }
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}

const fmtUsd = n => n == null ? '—' : `$${Math.round(n).toLocaleString('en-US')}`;

/** Everything wrong with one day, in words a person can act on.
 *  Pure — it reads the pivot both briefData and dataHealth already hold, so
 *  running it costs no queries. */
function dayIssues(piv, metaBy, date, sp) {
  const issues = [];
  const sales = twDay(piv, date, TW_SALES);
  const m = metaBy[date];
  if (sp.tw_blended == null && sales == null) {
    issues.push({ code: 'missing_day', severity: 'broken', label: 'Triple Whale has no data for these days',
      what: 'Triple Whale has no data at all for this day',
      fix: 'Re-sync Triple Whale. If it stays empty, check the shop is still connected in Triple Whale.' });
    return issues;                               // everything else is downstream of this
  }
  if (sp.source === 'rebuilt') {
    issues.push({ code: 'meta_missing', severity: 'broken', label: 'Meta spend is missing from Triple Whale',
      what: `Triple Whale reports ${fmtUsd(sp.tw_meta ?? 0)} of Meta spend, Meta itself reports ${fmtUsd(sp.meta_api)}`,
      fix: 'Reconnect Meta in Triple Whale → Settings → Integrations, then Re-sync and Rebuild here.' });
  }
  for (const [metric, label] of Object.entries(TW_PLATFORM_SPEND)) {
    if (metric === 'fb_ads_spend') continue;     // the witness above is stronger
    const base = platformBaseline(piv, metric, date);
    if (base == null || base < DROPOUT_FLOOR) continue;
    const v = piv[metric]?.[date] ?? null;
    if (v == null || v < base * DROPOUT_RATIO) {
      issues.push({ code: 'platform_dropout', severity: 'broken', label: `${label} spend has stopped arriving`,
        what: `${label} spend reads ${v == null ? 'nothing' : fmtUsd(v)} against a 14-day typical of ${fmtUsd(base)}`,
        fix: `Check the ${label} connection in Triple Whale → Settings → Integrations. If ${label} was genuinely paused, this clears itself in two weeks.` });
    }
  }
  if (sales == null) {
    issues.push({ code: 'no_sales', severity: 'broken', label: 'store revenue is missing',
      what: 'no store revenue recorded for this day',
      fix: 'Re-sync Triple Whale; if it stays empty, the Shopify connection inside Triple Whale needs attention.' });
  } else if (sales === 0 && m?.purchases > 0) {
    issues.push({ code: 'zero_sales', severity: 'warn', label: 'store revenue reads zero on a day with orders',
      what: `Triple Whale shows no revenue while Meta recorded ${m.purchases} purchase(s)`,
      fix: 'Usually a lagging Shopify sync — re-sync and check again before sending.' });
  }
  return issues;
}

/** One brand's data health over a window. Three queries, no network. */
async function dataHealth(env, acct, { days = 14, upTo = null } = {}) {
  const end = upTo || addDays(localDate(acct.tz), -1);
  const start = addDays(end, -(days - 1));
  const from = addDays(start, -14);              // continuity needs its baseline
  const { results: twRows } = await env.DB.prepare(
    `SELECT date, metric, value FROM tw_daily WHERE act_id = ?1 AND date >= ?2 AND date <= ?3`,
  ).bind(acct.act_id, from, end).all();
  const piv = {};
  for (const r of twRows) (piv[r.metric] ??= {})[r.date] = r.value;
  const { results: mRows } = await env.DB.prepare(
    `SELECT date, spend, purchases FROM daily_insights WHERE act_id = ?1 AND date >= ?2 AND date <= ?3`,
  ).bind(acct.act_id, from, end).all();
  const metaBy = Object.fromEntries(mRows.map(r => [r.date, r]));
  const lastSync = (await env.DB.prepare(
    `SELECT MAX(synced_at) AS t FROM tw_daily WHERE act_id = ?1`,
  ).bind(acct.act_id).first())?.t ?? null;
  /* Unsent drafts in the window, so a draft written from numbers that have
     since been repaired can still be rebuilt.
     THE CASE THIS EXISTS FOR: on 2026-09-05 Triple Whale was fixed and every
     brand went green — which took the Rebuild button away while six drafts
     still carried the wrong spend. Health describes the DATA; a draft is a
     copy of the data taken at a moment, and the two heal separately. */
  const { results: draftRows } = await env.DB.prepare(
    `SELECT date, status, posted_at FROM briefs
      WHERE act_id = ?1 AND date >= ?2 AND date <= ?3 AND status != 'sent'
      ORDER BY date`,
  ).bind(acct.act_id, start, end).all().catch(() => ({ results: [] }));

  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const sp = spendFor(piv, d, metaBy[d]?.spend ?? null);
    out.push({ date: d, ...sp, sales: twDay(piv, d, TW_SALES), issues: dayIssues(piv, metaBy, d, sp) });
  }
  // Account-level: is the data even fresh? A brand nobody has synced for two
  // days looks perfectly healthy day by day, because every day it holds is old.
  const issues = [];
  const staleH = lastSync ? (Date.now() - Date.parse(`${lastSync.replace(' ', 'T')}Z`)) / 36e5 : null;
  if (!acct.tw_shop) {
    issues.push({ code: 'not_connected', severity: 'warn',
      what: 'this brand has no Triple Whale shop set, so every blended figure is built from platform data alone',
      fix: 'Add the Triple Whale shop in Settings.' });
  } else if (staleH == null) {
    issues.push({ code: 'never_synced', severity: 'broken',
      what: 'Triple Whale has never synced for this brand', fix: 'Press Re-sync Triple Whale.' });
  } else if (staleH > 30) {
    issues.push({ code: 'stale', severity: 'warn',
      what: `Triple Whale data was last refreshed ${Math.round(staleH)} hours ago`,
      fix: 'Press Re-sync Triple Whale.' });
  }
  const badDays = out.filter(x => x.issues.some(i => i.severity === 'broken'));
  const warnDays = out.filter(x => x.issues.some(i => i.severity === 'warn'));
  const verdict = badDays.length || issues.some(i => i.severity === 'broken') ? 'broken'
    : warnDays.length || issues.length ? 'warn' : 'ok';
  /* The headline is the whole point of this endpoint: it must say what is wrong
     and what to do without the reader opening anything or asking anyone. */
  let headline = 'Triple Whale agrees with every platform it reports.';
  if (badDays.length) {
    /* Group by LABEL, never by the sentence: the sentence carries that day's
       figures, so two days of one broken connection read as two problems. */
    const labels = [...new Set(badDays.flatMap(x => x.issues.filter(i => i.severity === 'broken').map(i => i.label || i.code)))];
    const named = labels.length <= 2 ? labels.join(', and ') : `${labels.slice(0, 2).join(', ')} and ${labels.length - 2} more`;
    const when = badDays.length === 1 ? `on ${prettyDate(badDays[0].date)}`
      : `on ${badDays.length} of the last ${days} days (${prettyDate(badDays[0].date)} → ${prettyDate(badDays[badDays.length - 1].date)})`;
    headline = `${named[0].toUpperCase()}${named.slice(1)} — ${when}.`;
  } else if (issues.length) headline = issues[0].what;
  return {
    account: { act_id: acct.act_id, name: acct.name, currency: acct.currency },
    from: start, to: end, last_sync: lastSync, stale_hours: staleH,
    verdict, headline, issues, days: out,
    bad_dates: badDays.map(x => x.date),
    /* `written_before_last_sync` is the honest signal, not proof: Triple Whale
       re-syncs hourly, so it flags a draft older than the data rather than a
       draft that is actually wrong. The page says which it is. */
    drafts: draftRows.map(r => ({
      date: r.date, status: r.status, posted_at: r.posted_at,
      written_before_last_sync: !!(lastSync && r.posted_at && Date.parse(`${lastSync.replace(' ', 'T')}Z`) > Date.parse(r.posted_at)),
    })),
  };
}

/** Month goals for an account: month override merged over "default". Null if none set. */
function goalsFor(acct, ym) {
  const g = safeJson(acct.goals_json, {});
  const m = { ...(g.default || {}), ...(g[ym] || {}) };
  return m.sales != null || m.spend != null ? m : null;
}

function twDay(piv, date, ids) { for (const id of ids) { const v = piv[id]?.[date]; if (v != null) return v; } return null; }

/** Forecast vs actual for every day of `upTo`'s month (forecast-only rows after upTo). */
async function briefData(env, acct, upTo) {
  const ym = monthOf(upTo);
  const dim = daysInMonth(upTo);
  const monthStart = `${ym}-01`;
  const histFrom = addDays(monthStart, -35);
  const { results: twRows } = await env.DB.prepare(
    `SELECT date, metric, value FROM tw_daily WHERE act_id = ?1 AND date >= ?2 AND date <= ?3`,
  ).bind(acct.act_id, histFrom, upTo).all();
  const piv = {};
  for (const r of twRows) (piv[r.metric] ??= {})[r.date] = r.value;
  const { results: metaRows } = await env.DB.prepare(
    `SELECT date, spend, purchases, revenue FROM daily_insights WHERE act_id = ?1 AND date >= ?2 AND date <= ?3`,
  ).bind(acct.act_id, histFrom, upTo).all();
  const meta = Object.fromEntries(metaRows.map(r => [r.date, r]));
  const goals = goalsFor(acct, ym);
  // `default` is an inheritance convenience, not a plan. A month nobody planned still
  // gets numbers, and reporting them as "the plan" is how a goal silently carries
  // from one month to the next. Say which it is, and name where it came from.
  const gjson = safeJson(acct.goals_json, {});
  const planned = !!gjson[ym];
  let inheritedFrom = null;
  if (!planned && goals) {
    const months = Object.keys(gjson).filter(k => /^\d{4}-\d{2}$/.test(k)).sort();
    inheritedFrom = months.filter(k => gjson[k] && gjson[k].sales === goals.sales).pop() || null;
  }
  const shipTotal = m => Object.values(piv[m] || {}).reduce((x, y) => x + (y || 0), 0);
  // Diagnostic only now. Shipping revenue is inside netSales and cannot be removed,
  // so a client who bills shipping without recording a fulfilment cost simply has
  // overstated profit - we flag it rather than pretending to net it off.
  const shipMode = shipTotal('totalShippingPrice') > 0 && shipTotal('totalShippingCosts') <= 0 ? 'uncosted' : 'costed';

  // The trailing 28 days still feed the new/returning share and the margin, but the
  // day-of-week CURVE is deliberately not used to split the goal - see below.
  const dow = d => new Date(d + 'T12:00:00Z').getUTCDay();
  let newRevSum = 0, retRevSum = 0, salesSum = 0, marginNum = 0, marginDen = 0;
  const dayMargins = [];                     // per-day pre-ad-spend margin, for the COGS sanity check
  for (let i = 1; i <= 28; i++) {
    const d = addDays(monthStart, -i);
    const s = twDay(piv, d, TW_SALES) ?? meta[d]?.revenue ?? null;
    if (s == null) continue;
    salesSum += s;
    newRevSum += piv.newCustomerSales?.[d] ?? 0;
    retRevSum += piv.rcRevenue?.[d] ?? 0;
    const gp = piv.grossProfit?.[d] ?? (piv.totalProductCosts?.[d] != null ? s - piv.totalProductCosts[d] - (piv.totalPaymentGatewayCosts?.[d] ?? 0) : null);
    if (gp != null && s > 0) { marginNum += gp; marginDen += s; dayMargins.push(gp / s); }
  }
  const newShare = newRevSum + retRevSum > 0 ? newRevSum / (newRevSum + retRevSum) : null;
  const margin28 = marginDen > 0 ? marginNum / marginDen : null;   // trailing pre-ad-spend margin
  const cogsQuality = judgeCogs(dayMargins, margin28);

  const cmPct = goals?.cm_pct ?? null;
  const fcMargin = cmPct ?? margin28;            // forecast-side margin: explicit % beats trailing actuals
  const days = [];
  for (let d = 1; d <= dim; d++) {
    const date = `${ym}-${String(d).padStart(2, '0')}`;
    const f = {};
    if (goals?.sales != null) f.sales = goals.sales / dim;
    if (goals?.spend != null) f.spend = goals.spend / dim;
    if (f.sales != null && f.spend != null && fcMargin != null) f.cm = f.sales * fcMargin - f.spend;
    f.amer = goals?.amer ?? (newShare != null && f.sales != null && f.spend ? newShare * f.sales / f.spend : null);
    f.mer = f.sales != null && f.spend ? f.sales / f.spend : null;   // implied by the sales + spend goals
    if (date > upTo) { days.push({ date, f, a: null }); continue; }
    const netSalesDay = twDay(piv, date, TW_SALES);
    // netSalesDay is Shopify TOTAL SALES (shipping and tax already inside it).
    // CTC's reported line is "Net Sales + Shipping" = total sales minus tax, so we
    // subtract tax rather than adding shipping. Tax defaults to 0 when the metric
    // has not been backfilled yet, which degrades to total sales - never to the
    // old double-counted figure.
    const tax = piv.totalNetTaxes?.[date] ?? 0;
    const shipRev = piv.totalShippingPrice?.[date] ?? 0;   // reported only; already in netSalesDay
    const shipCost = piv.totalShippingCosts?.[date] ?? 0;
    const handling = piv.totalHandlingFees?.[date] ?? 0;
    const sales = netSalesDay == null ? null : netSalesDay - tax;
    const mrow = meta[date];
    const gSpend = piv.ga_adCost?.[date] ?? null;
    const blended = piv.blendedAds?.[date] ?? null;
    // TW reports new/returning on the Order-Revenue basis (incl. tax) while our headline
    // Net Sales excludes it, so the raw split doesn't add up to the headline. Keep the
    // measured NEW-CUSTOMER SHARE and rebase it onto Net Sales so the report reconciles.
    const rawNew = piv.newCustomerSales?.[date] ?? null;
    const rawRet = piv.rcRevenue?.[date] ?? null;
    const rawSplit = (rawNew ?? 0) + (rawRet ?? 0);
    const newShareDay = rawSplit > 0 && rawNew != null ? rawNew / rawSplit : null;
    const sp = spendFor(piv, date, mrow?.spend ?? null);
    const a = {
      sales,
      new_share: newShareDay,
      new_rev: newShareDay != null && sales != null ? sales * newShareDay : rawNew,
      ret_rev: newShareDay != null && sales != null ? sales * (1 - newShareDay) : rawRet,
      /* NOT `blended ?? meta+google` any more. That trusted any blended figure
         Triple Whale returned, and on 2026-09-02 it returned a Google-only
         total for five brands — non-null, internally consistent, and wrong by
         70%. spendFor() checks TW's Meta row against Meta's own API and
         rebuilds the total when they disagree. See the data-health block. */
      spend: sp.spend,
      spend_source: sp.source,
      tw_blended: sp.tw_blended,
      meta_spend: mrow?.spend ?? null,
      google_spend: gSpend,
      meta_roas: mrow && mrow.spend ? mrow.revenue / mrow.spend : null,
      meta_purchases: mrow?.purchases ?? null,
      // ga_ROAS is GOOGLE ADS' OWN reported figure (Triple Whale titles it "Google
      // ROAS" and pipes it straight from the Google Ads API) - it is NOT Triple
      // Whale pixel attribution, which the summary page does not break out per
      // channel. Carry the CONVERSION COUNT beside it, because the count is what
      // decides whether the ratio means anything: on a day Google recorded one
      // conversion the ROAS is just that single order's value over a whole day of
      // spend. Grunk 2026-08-29 read 0.16x off exactly one $19.95 conversion.
      // googleAllCpa is real dollars-per-conversion; googleCpa is NOT (Triple Whale
      // has the two ids swapped against their own titles).
      google_roas: piv.ga_ROAS?.[date] ?? null,
      google_purchases: (() => {
        const c = piv.googleAllCpa?.[date], s = piv.ga_adCost?.[date];
        return c > 0 && s > 0 ? Math.round(s / c) : (s > 0 ? 0 : null);
      })(),
      blended_roas: piv.totalRoas?.[date] ?? null,
      gross_profit: piv.grossProfit?.[date] ?? null,
      total_sales: netSalesDay, tax, net_sales: sales == null ? null : sales - shipRev,
      ship_rev: shipRev, ship_cost: shipCost, handling,
      cogs: piv.totalProductCosts?.[date] ?? null,
      fees: piv.totalPaymentGatewayCosts?.[date] ?? null,
    };
    a.amer = a.new_rev != null && a.spend ? a.new_rev / a.spend : null;
    a.mer = sales != null && a.spend ? sales / a.spend : null;
    // CM = revenue - every variable cost (product, fulfilment, handling, fees, ads).
    // Fixed costs are excluded by definition. Margin override wins when set.
    const variable = a.cogs != null ? a.cogs + shipCost + handling + (a.fees ?? 0) : null;
    a.cm = cmPct != null && sales != null && a.spend != null ? sales * cmPct - a.spend
      : variable != null && sales != null && a.spend != null ? sales - variable - a.spend : null;
    a.cm_basis = cmPct != null ? 'margin' : variable != null ? 'cogs' : null;
    /* Free: dayIssues reads the pivot this function already holds, so every
       brief knows whether its own numbers can be trusted without a query. */
    a.issues = dayIssues(piv, meta, date, sp);
    days.push({ date, f, a });
  }

  const done = days.filter(x => x.date <= upTo && x.a);
  const sum = (list, get) => { let s = 0, any = false; for (const x of list) { const v = get(x); if (v != null) { s += v; any = true; } } return any ? s : null; };
  const mtd = {
    sales: sum(done, x => x.a.sales), sales_f: sum(done, x => x.f.sales ?? null),
    spend: sum(done, x => x.a.spend), spend_f: sum(done, x => x.f.spend ?? null),
    cm: sum(done, x => x.a.cm), cm_f: sum(done, x => x.f.cm ?? null),
  };
  /* The catch-up: what it takes FROM HERE, not just how far behind we are.
   *
   * Every other figure in the brief describes the past. This one is the only
   * forward ask on the page, and it is the sentence a media buyer can act on the
   * same morning. Returning revenue arrives on its own, so the shortfall has to be
   * bought with new customers - priced at the rate this month's ads have actually
   * bought them at. Month-to-date basis on purpose: it is the window both sides of
   * a client call can see for themselves.
   */
  let toHit = null;
  {
    const elapsed = done.length;
    const remain = dim - elapsed;
    const goalSales = goals?.sales ?? null;
    if (goalSales != null && remain > 0 && elapsed > 0 && mtd.sales != null) {
      const retMtd = sum(done, x => x.a.ret_rev);
      const newMtd = sum(done, x => x.a.new_rev);
      const retPerDay = retMtd != null ? retMtd / elapsed : null;
      const mAmer = newMtd != null && mtd.spend > 0 ? newMtd / mtd.spend : null;
      const spendPerDay = mtd.spend != null ? mtd.spend / elapsed : null;
      const shortfall = goalSales - mtd.sales;
      const perDay = shortfall / remain;
      const newPerDay = perDay - (retPerDay || 0);
      const spendNeeded = mAmer && newPerDay > 0 ? newPerDay / mAmer : null;
      toHit = {
        days_elapsed: elapsed, days_in_month: dim, days_remaining: remain,
        goal_sales: goalSales, mtd_sales: mtd.sales,
        revenue_per_day: perDay, new_per_day: newPerDay,
        spend_per_day: spendNeeded, spend_now_per_day: spendPerDay,
        spend_ramp: spendNeeded != null && spendPerDay > 0 ? spendNeeded / spendPerDay : null,
        amer: mAmer, returning_per_day: retPerDay,
        already_there: shortfall <= 0,
        covered_by_returning: newPerDay <= 0,
      };
    }
  }
  const lastSync = (await env.DB.prepare(`SELECT MAX(synced_at) AS t FROM tw_daily WHERE act_id = ?1`).bind(acct.act_id).first())?.t ?? null;
  return {
    account: { act_id: acct.act_id, name: acct.name, currency: acct.currency, tz: acct.tz },
    month: ym, up_to: upTo, goals, goals_planned: planned, goals_inherited_from: inheritedFrom,
    cm_pct: cmPct, margin_28d: margin28,
    cogs_quality: cmPct != null ? { verdict: 'override', reason: `using your ${Math.round(cmPct * 100)}% margin override` } : cogsQuality,
    weights: 'even across the month',
    new_share_28d: newShare, days, mtd, to_hit: toHit, tw_last_sync: lastSync, shipping_mode: shipMode,
    brief_enabled: !!acct.brief_enabled,
    /* Which days of THIS month cannot be trusted. The Brief page banners it,
       and sendBrief refuses to put a flagged day in front of a client. */
    health: {
      verdict: done.some(x => x.a.issues?.some(i => i.severity === 'broken')) ? 'broken'
        : done.some(x => x.a.issues?.length) ? 'warn' : 'ok',
      bad_dates: done.filter(x => x.a.issues?.some(i => i.severity === 'broken')).map(x => x.date),
      by_date: Object.fromEntries(done.filter(x => x.a.issues?.length).map(x => [x.date, x.a.issues])),
    },
  };
}

/** The deterministic numbers block of the Slack brief (CTC's Forecasted/Actual shape). */
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
/** "August 20" — CTC head each day with a real date, not an ISO stamp. */
function prettyDate(ymd) {
  return `${MONTH_NAMES[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}`;
}
const shortDate = ymd => `${+ymd.slice(5, 7)}/${+ymd.slice(8, 10)}`;

/** The Slack message. Modelled on CTC's own daily update: a friendly opener, one
 *  block per day covered, then the narrative. Deliberately NOT a metrics dump —
 *  the revenue split, channel reads and month-to-date all live in the Notes, where
 *  Claude writes them as sentences, because that is what makes it read like a
 *  person rather than a cron job. */
const MONTH_OF = ym => `${MONTH_NAMES[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;

function buildBriefText(data, dates, narrative) {
  const cur = data.account.currency;
  const list = Array.isArray(dates) ? dates : [dates];
  // Whole currency units: CTC quote £464, not £464.23.
  const fm = n => n == null ? '—' : new Intl.NumberFormat('en-US',
    { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(n);
  const fx = n => n == null ? '—' : `${n.toFixed(2)}x`;
  const cmOk = data.cogs_quality?.verdict !== 'broken' && data.cogs_quality?.verdict !== 'none';

  const span = list.length === 1 ? prettyDate(list[0])
    : list.map(shortDate).slice(0, -1).join(', ') + ' and ' + shortDate(list[list.length - 1]);
  const L = [`Hey Team :wave: Here's the Daily Update covering ${span} →`];

  for (const d of list) {
    const day = data.days.find(x => x.date === d);
    if (!day?.a) continue;
    const f = day.f || {}, a = day.a;
    L.push('', `*${prettyDate(d)}*`);
    // CTC bold the ACTUAL line of each pair, so the eye lands on what happened and
    // the forecast sits underneath it as context. Slack bold is *single asterisks*.
    const pair = (label, fc, actual) => { L.push(`Forecasted ${label}: ${fc}`); L.push(`*Actual ${label}: ${actual}*`); };
    if (cmOk) pair('Contribution Margin', fm(f.cm), fm(a.cm));
    pair(a.ship_rev ? 'Net Sales + Shipping' : 'Net Sales', fm(f.sales), fm(a.sales));
    pair('Total Spend', fm(f.spend), fm(a.spend));
    pair('MER', fx(f.mer), fx(a.mer));
    pair('aMER', fx(f.amer), fx(a.amer));
  }

  const wk = data.week;
  if (wk) {
    L.push('', `*Week in review — ${prettyDate(wk.from)} to ${prettyDate(wk.to)}*`);
    L.push(`Net Sales ${fm(wk.a.sales)} against ${fm(wk.f.sales)} planned · Spend ${fm(wk.a.spend)} of ${fm(wk.f.spend)}${cmOk ? ` · CM ${fm(wk.a.cm)}` : ''} · aMER ${fx(wk.a.amer)}`);
    if (wk.best) L.push(`Best day ${prettyDate(wk.best.date)} at ${fm(wk.best.sales)}, slowest ${prettyDate(wk.worst.date)} at ${fm(wk.worst.sales)}`);
  }
  /* The one forward-looking line in the brief: what it takes from here.
     Everything above describes the past; this is the sentence somebody can act on
     this morning. Tone escalates with the RAMP rather than the gap, because the
     ramp is what is actually being asked of the budget - and above 1.5x the honest
     read is that the target needs revisiting, since spending at that rate late in a
     month buys colder traffic than the aMER the figure assumes. */
  const th = data.to_hit;
  if (th && !th.already_there && th.days_remaining > 0) {
    const day = `the remaining ${th.days_remaining} day${th.days_remaining === 1 ? '' : 's'}`;
    if (th.covered_by_returning) {
      L.push('', `*To finish on plan:* ${fm(th.revenue_per_day)}/day over ${day} — returning customers alone are running at ${fm(th.returning_per_day)}/day, so no extra spend is needed.`);
    } else if (th.spend_per_day != null) {
      const ramp = th.spend_ramp;
      L.push('', `*To finish on plan:* ${fm(th.revenue_per_day)}/day over ${day} — ${fm(th.new_per_day)}/day of that from new customers, which is *${fm(th.spend_per_day)}/day of spend* at the ${fx(th.amer)} aMER this month has run${ramp ? ` (${fx(ramp)} the ${fm(th.spend_now_per_day)}/day running now)` : ''}.`);
      if (ramp && ramp > 1.5) L.push(`_A step-up that size buys colder traffic than ${fx(th.amer)} assumes — worth agreeing a revised number rather than spending into it._`);
    } else {
      L.push('', `*To finish on plan:* ${fm(th.revenue_per_day)}/day over ${day}.`);
    }
  } else if (th && th.already_there) {
    L.push('', `*The month's target is already banked* with ${th.days_remaining} day${th.days_remaining === 1 ? '' : 's'} still to run.`);
  }
  // An inherited target is not a plan anyone agreed to. Say so rather than letting
  // last month's number pass as this month's.
  if (data.goals && data.goals_planned === false) {
    L.push('', data.goals_inherited_from
      ? `_Note: no target has been set for ${MONTH_OF(data.month)} yet, so these are measured against ${MONTH_OF(data.goals_inherited_from)}'s plan._`
      : `_Note: no target has been set for ${MONTH_OF(data.month)} yet, so these are measured against the last plan on file._`);
  }
  return L.join('\n') + (narrative ? `\n\n${narrative}` : '');
}

/** Aggregate the 7 days ending at `date` (crosses month boundaries when needed). */
async function weeklyBlock(env, acct, data, date) {
  const dates = [];
  for (let i = 6; i >= 0; i--) dates.push(addDays(date, -i));
  const byDate = {};
  for (const x of data.days) byDate[x.date] = x;
  for (const mo of [...new Set(dates.filter(dd => !byDate[dd]).map(monthOf))]) {
    const end = dates.filter(dd => monthOf(dd) === mo).pop();
    for (const x of (await briefData(env, acct, end)).days) if (!byDate[x.date]) byDate[x.date] = x;
  }
  const rows = dates.map(dd => byDate[dd]).filter(Boolean);
  const sum = get => { let s = 0, any = false; for (const r of rows) { const v = get(r); if (v != null) { s += v; any = true; } } return any ? s : null; };
  const a = { sales: sum(r => r.a?.sales), spend: sum(r => r.a?.spend), cm: sum(r => r.a?.cm), new_rev: sum(r => r.a?.new_rev) };
  a.amer = a.new_rev != null && a.spend ? a.new_rev / a.spend : null;
  a.mer = a.sales != null && a.spend ? a.sales / a.spend : null;
  const withSales = rows.filter(r => r.a?.sales != null);
  const best = withSales.slice().sort((x, y) => y.a.sales - x.a.sales)[0];
  const worst = withSales.slice().sort((x, y) => x.a.sales - y.a.sales)[0];
  return {
    from: dates[0], to: dates[6],
    f: { sales: sum(r => r.f.sales ?? null), spend: sum(r => r.f.spend ?? null), cm: sum(r => r.f.cm ?? null) },
    a,
    best: best ? { date: best.date, sales: best.a.sales } : null,
    worst: worst ? { date: worst.date, sales: worst.a.sales } : null,
  };
}

const BRIEF_SYSTEM = `You are a senior media buyer at Mobius Digital writing the narrative section of a client's daily performance brief. A numbers block (forecast vs actual for yesterday) is prepended by the system — do NOT repeat it as a list.
Write exactly three sections, in this order, Slack-style plain text:
Notes →
• 3–5 bullets: the facts that matter — beats/misses vs plan with the %, streaks across recent days, new vs returning revenue, per-channel reads. Conclusion first in every bullet. The numbers block above shows ONLY forecast vs actual for CM, revenue, spend, MER and aMER — so the new-vs-returning split, the per-channel reads and month-to-date reach the reader ONLY if you write them here.
So What?
2–4 sentences: the single interpretation that best explains the day — tie performance moves to the changes we made when the change log supports it, and say whether this reads as a demand problem, a platform problem, or our own levers.
What's Next?
• 1–3 bullets: concrete actions or watch-items with a trigger ("if X doesn't improve today, we do Y").
Rules: use ONLY the numbers provided — never invent or extrapolate figures. Money in the account's own currency. Meta-attributed conversions keep settling for ~72h — hedge recent Meta ROAS reads accordingly. Google's conversions settle late too, and unevenly: hedge a recent Google read the same way, and NEVER report a Google ROAS the block marks n/a — say Google's conversions have not landed yet and quote the spend instead. MER = ALL store revenue (every channel, not ad-attributed) ÷ ALL ad spend across every platform. aMER is the acquisition version: new-customer revenue ÷ that same total ad spend. Both are blended on BOTH sides - never describe either as a platform or attributed number, and never confuse them with ROAS (which IS platform-attributed). Keep the whole narrative under 160 words — short, punchy bullets, not paragraphs disguised as bullets. Slack bold is *single asterisks*; never use ** double asterisks or markdown headers. No greeting, no sign-off, no preamble.`;

async function writeBriefNarrative(env, acct, data, date) {
  const f2 = n => n == null ? '—' : String(Math.round(n * 100) / 100);
  const lines = data.days.filter(x => x.date <= date).slice(-14).map(x =>
    `${x.date}: forecast sales ${f2(x.f.sales)} spend ${f2(x.f.spend)} CM ${f2(x.f.cm)} aMER ${f2(x.f.amer)} | actual sales ${f2(x.a?.sales)} new ${f2(x.a?.new_rev)} returning ${f2(x.a?.ret_rev)} spend ${f2(x.a?.spend)} (Meta ${f2(x.a?.meta_spend)}, Google ${f2(x.a?.google_spend)}) CM ${f2(x.a?.cm)} MER ${f2(x.a?.mer)} aMER ${f2(x.a?.amer)} MetaROAS ${f2(x.a?.meta_roas)} (Meta-reported) GoogleROAS ${x.a?.google_purchases != null && x.a.google_purchases < 2 ? `n/a - Google recorded only ${x.a.google_purchases} conversion(s), too few to form a rate` : `${f2(x.a?.google_roas)} (Google-reported, off ${x.a?.google_purchases ?? '?'} conversions)`} BlendedROAS ${f2(x.a?.blended_roas)} (Triple Whale)`);
  const { results: evs } = await env.DB.prepare(
    `SELECT event_time, category, summary, reason, note FROM activities
     WHERE act_id = ?1 AND event_time >= ?2 AND confirmed != -1 ORDER BY event_time DESC LIMIT 40`,
  ).bind(acct.act_id, addDays(date, -7)).all();
  const evLines = evs.map(e => `- ${String(e.event_time).slice(0, 16).replace('T', ' ')} [${e.category}] ${e.summary}${e.reason ? ` {reason: ${e.reason}}` : ''}${e.note ? ` {note: ${e.note}}` : ''}`);
  return claude(env, {
    system: BRIEF_SYSTEM,
    maxTokens: 6000,   // opus-5 spends thinking tokens inside max_tokens; leave real headroom for the text
    user: `Client: ${data.account.name} (currency ${data.account.currency}). The brief covers ${(data.covering || [date]).join(' and ')}.\n` +
      // `target_roas` is DELIBERATELY not passed. It is a Meta-attributed ROAS
      // guardrail for the media buyer, living in Account Health, and it is set
      // to 2.5 on every brand - the same figure as the BLENDED MER goal. Meta
      // ROAS is structurally below blended MER (measured 2026-08-27 over 30d:
      // Meta 1.57-1.99 against blended 2.05-2.52 across all six brands), so
      // feeding it here made Claude report Meta as permanently failing a target
      // that was never Meta's, in a document the client reads. Party Patch was
      // the clearest case: blended 2.52 - goal met - while its Meta ROAS of
      // 1.64 was written up as a miss.
      `Goals this month: ${JSON.stringify(data.goals)}. Forecast weighting: ${data.weights}.\n` +
      `Meta and Google ROAS below are each platform's OWN attributed figure, NOT Triple Whale's. Blended ROAS is Triple Whale's, and it is the same idea as MER (it counts sales tax, so it runs a shade above our MER). Name the source whenever you quote a ROAS, because a platform figure and the Triple Whale figure for the same day differ by design and get mistaken for a contradiction. There is no ROAS target: the only agreed goals are the blended ones above (net sales, spend, MER, aMER). Never judge a platform's ROAS against the MER goal - blended MER counts every channel's revenue against total spend and is always the higher number, so doing that reports a healthy account as failing. Use platform ROAS only to say which channel moved, never to declare a target missed.\n` +
      (data.goals && data.goals_planned === false
        ? `IMPORTANT: no target was actually set for ${MONTH_OF(data.month)} - the figures above are carried over from ${data.goals_inherited_from ? MONTH_OF(data.goals_inherited_from) : 'the last plan on file'}. Do NOT call them this month's goal or say the client is ahead of/behind "plan" as though it were agreed. Refer to them as last month's pace, and put setting this month's target in What's Next?.\n`
        : '') +
      `Contribution margin basis: ${data.cm_pct != null ? `net sales × ${Math.round(data.cm_pct * 100)}% margin − ad spend` : 'Triple Whale cost data: revenue minus product costs, fulfilment, handling, payment fees and ad spend (every variable cost; fixed costs are excluded by definition)'}.\n\n` +
      (data.cogs_quality && (data.cogs_quality.verdict === 'broken' || data.cogs_quality.verdict === 'none')
        ? `IMPORTANT: this client's cost data is unreliable (${data.cogs_quality.reason}). Contribution margin has been REMOVED from the numbers block - do NOT mention contribution margin, CM, profit or margin anywhere in your narrative. Build the story from net sales, spend, aMER and the channel reads instead.

`
        : data.cogs_quality?.verdict === 'noisy'
        ? `Note: this client's cost data is somewhat noisy (${data.cogs_quality.reason}) - treat contribution margin as directional, not exact.

`
        : '') +
      `Last ${lines.length} days (forecast | actual):\n${lines.join('\n')}\n\nMonth-to-date: ${JSON.stringify(data.mtd)}\n\n` +
    (data.to_hit ? `Catch-up already stated in the numbers block above (do NOT restate the figures, but you may build on what they imply): ${JSON.stringify(data.to_hit)}\n\n` : '') +
      (data.week ? `This brief also carries a week-in-review block (${data.week.from} → ${data.week.to}): ${JSON.stringify(data.week)} — weigh the weekly picture in So What?/What's Next?, not just the single day.\n\n` : '') +
      `Changes we made in the last 7 days (from the Change Log):\n${evLines.length ? evLines.join('\n') : '- (none logged)'}`,
  });
}

/** Build the full brief for one account+day. Returns {data, text} or {data, error}.
 *  When `date` is a Sunday the Monday-morning send adds a week-in-review block. */
/** Which days should this brief cover? Normally just yesterday — but if a send was
 *  missed, pick up the days since the last one, the way CTC's own update covered
 *  "8/18 and 8/19". Capped at 4 days and never crosses out of the month. */
async function coverageDates(env, acct, date, data) {
  /* 'skipped' counts as DEALT WITH, exactly like 'sent'.
     Cole, 2026-09-01: Bonk Golf had stacked up days because catching up only
     ever looked for a SENT brief, so a day nobody wanted to send was carried
     forward for ever and every new draft opened "covering 8/28, 8/29 and 8/30".
     The catch-up is worth keeping — it is what covers a morning he forgets —
     but it needs a way to say "not this one, start fresh", and that is what
     skipping is. The days are not lost: the numbers stay on the Profit and
     Brief pages, they just stop queueing for a client message. */
  const last = await env.DB.prepare(
    `SELECT MAX(date) AS d FROM briefs WHERE act_id = ?1 AND status IN ('sent','skipped') AND date < ?2`,
  ).bind(acct.act_id, date).first().catch(() => null);
  const monthStart = `${monthOf(date)}-01`;
  let from = last?.d ? addDays(last.d, 1) : date;
  if (from < monthStart) from = monthStart;
  if (from < addDays(date, -3)) from = addDays(date, -3);
  const out = [];
  for (let d = from; d <= date; d = addDays(d, 1)) {
    if (data.days.find(x => x.date === d)?.a?.sales != null) out.push(d);
  }
  return out.length ? out : [date];
}

async function makeBrief(env, acct, date) {
  const data = await briefData(env, acct, date);
  const day = data.days.find(x => x.date === date);
  if (!data.goals) return { data, error: 'no goals set for this month — set them on the Daily Brief page' };
  if (!day?.a || day.a.sales == null) return { data, error: `no Triple Whale sales data for ${date} yet — try “Refresh Triple Whale data”` };
  const dates = await coverageDates(env, acct, date, data);
  if (new Date(date + 'T12:00:00Z').getUTCDay() === 0) {
    data.week = await weeklyBlock(env, acct, data, date).catch(() => null);
  }
  data.covering = dates;
  let narrative = null, narrative_error = null;
  try { narrative = await writeBriefNarrative(env, acct, data, date); } catch (e) { narrative_error = e.message; }
  /* Only the days this brief actually reports on can block it. A bad day
     earlier in the month is the Data Health tab's problem, not this send's. */
  const health = briefHealth(data, dates);
  return { data, dates, text: buildBriefText(data, dates, narrative), narrative_error, health };
}

/** The health of the days a brief covers: what stops it going to a client. */
function briefHealth(data, dates) {
  const list = Array.isArray(dates) ? dates : [dates];
  const flagged = list.map(d => ({ date: d, issues: (data.health?.by_date?.[d] || []) }))
    .filter(x => x.issues.length);
  const broken = flagged.filter(x => x.issues.some(i => i.severity === 'broken'));
  return {
    verdict: broken.length ? 'broken' : flagged.length ? 'warn' : 'ok',
    dates: broken.map(x => x.date),
    flagged,
    /* One sentence, written once, reused by the Slack notice, the send refusal
       and the banner on the Brief page — so all three say the same thing. */
    summary: broken.length
      ? `${broken.map(x => prettyDate(x.date)).join(' and ')}: ${broken[0].issues.find(i => i.severity === 'broken').what}`
      : null,
  };
}

/** Generate + post one brief to the brand's Slack channel; log it in `briefs`. */
/** Write a briefs row. `data` is optional so an edit or a send of stored text
 *  cannot wipe the numbers captured when the brief was first built. */
async function upsertBrief(env, actId, date, status, channel, text, data) {
  const dataJson = data === undefined ? null
    : JSON.stringify({ mtd: data?.mtd ?? null, day: data?.days?.find(x => x.date === date) ?? null });
  await env.DB.prepare(
    `INSERT INTO briefs (act_id, date, posted_at, channel, status, text, data_json) VALUES (?1,?2,?3,?4,?5,?6,?7)
     ON CONFLICT(act_id, date) DO UPDATE SET posted_at = excluded.posted_at, channel = excluded.channel,
       status = excluded.status, text = excluded.text,
       data_json = COALESCE(excluded.data_json, briefs.data_json)`,
  ).bind(actId, date, new Date().toISOString(), channel ?? null, status, text ?? null, dataJson).run();
}

/** Build the brief and park it as a DRAFT for review, notifying the internal
 *  channel — the client is not messaged.
 *
 *  Cole was already doing this by hand: letting the brief post to an internal
 *  channel, then copy-pasting it to the client so he could reword the narrative
 *  first. Copy-paste loses Slack's formatting, and nothing recorded what was
 *  actually sent. Same shape as the weekly/monthly reports: draft internally,
 *  edit the wording, then one button sends the real thing. */
async function draftBrief(env, acct, date, { skipIfExists = false } = {}) {
  if (skipIfExists) {
    const prior = await env.DB.prepare(
      `SELECT status FROM briefs WHERE act_id = ?1 AND date = ?2`,
    ).bind(acct.act_id, date).first().catch(() => null);
    // 'skipped' belongs here too — a day deliberately not sent must not be
    // rebuilt and re-announced by the next scheduled tick.
    if (prior && ['draft', 'sent', 'skipped'].includes(prior.status)) {
      return { name: acct.name, already: prior.status, date };
    }
  }
  const r = await makeBrief(env, acct, date);
  if (r.error) { await upsertBrief(env, acct.act_id, date, 'skipped', null, r.error, r.data); return { name: acct.name, skipped: r.error }; }
  await upsertBrief(env, acct.act_id, date, 'draft', null, r.text, r.data);
  // Internal only, and deliberately never brief_channel — that is the client's.
  const ch = acct.slack_channel;
  if (ch) {
    // The whole brief goes IN the message (Cole, 2026-08-28). It was a link for a
    // while, on the reasoning that review means opening it properly - but that was
    // decided while four bots were posting into these channels and length was the
    // enemy. He has since removed the others, so this is now one message per brand
    // per day, and the brief IS the thing the team needs to read. Making them open
    // a tab for it meant only whoever clicked ever saw it.
    // The link stays underneath, for ACTING on it rather than reading it. `&date=`
    // matters: this notice names one day, and without it the tab opens whatever
    // "yesterday" happens to be when the link is finally clicked.
    const body = r.text.length > 3600
      ? r.text.slice(0, 3600) + '\n…(too long for Slack — open it in Locus for the rest)'
      : r.text;
    /* The data warning goes ABOVE the brief and never inside it. The text is
       what the client receives; this notice is ours. Without it the numbers
       look ordinary — that is exactly how five brands under-reported spend by
       70% for three days in September 2026 with nobody noticing. */
    const bad = r.health?.verdict === 'broken';
    const notice = bad
      ? `:rotating_light: *Do not send — the numbers are wrong.* ${r.health.summary}\n` +
        `_${r.health.flagged[0].issues.find(i => i.severity === 'broken').fix}_\n` +
        `Spend below has been rebuilt from the platforms' own reporting where possible.\n\n`
      : '';
    await slackPost(env, ch,
      `:memo: *Draft — ${acct.name}, ${prettyDate(date)}* · _not sent to the client yet_\n\n` +
      notice +
      `${body}\n\n` +
      `<${DASHBOARD_URL}?open=${bad ? 'health' : 'brief'}&act=${encodeURIComponent(acct.act_id)}&date=${date}|${bad ? 'Fix it in Locus →' : 'Send it, or edit the wording first →'}>`,
      null, { username: 'Mobius Reports', icon: ':memo:' }).catch(() => {});
  }
  if (r.narrative_error) await alertClaudeFailure(env, `Daily Brief narrative for ${acct.name}`, r.narrative_error);
  return { name: acct.name, ok: true, drafted: true, date, channel: ch ?? null, narrative_error: r.narrative_error ?? null };
}

/** Post the brief to the CLIENT's channel.
 *  `useStored` sends the reviewed text exactly as it stands, edits included —
 *  regenerating at send time would silently discard the wording that was
 *  approved, which is the whole point of the review step. */
async function sendBrief(env, acct, date, { skipIfSent = false, useStored = false, ignoreHealth = false } = {}) {
  // The trigger fires hourly, so a brand already posted for this date must never
  // be posted again. Only a genuine 'sent' blocks a retry - a skipped or errored
  // day should still get another chance.
  const prior = await env.DB.prepare(
    `SELECT status, text FROM briefs WHERE act_id = ?1 AND date = ?2`,
  ).bind(acct.act_id, date).first().catch(() => null);
  if (skipIfSent && prior?.status === 'sent') return { name: acct.name, already_sent: true, date };
  // A skipped day is a decision, not a gap to fill. Only an explicit send from
  // the UI (skipIfSent false) may override it.
  if (skipIfSent && prior?.status === 'skipped') return { name: acct.name, skipped_by_hand: true, date };

  /* THE GATE. A day whose data contradicts the platforms does not reach a
     client, whichever route asked for the send — the cron, the button, or a
     retry. Checked even on the useStored path, because the stored text was
     built from the same bad numbers. Two D1 reads; a send is a rare click.
     `ignoreHealth` exists for the one case where a human has looked at the
     numbers and decided they are right anyway. */
  if (!ignoreHealth) {
    const hd = await briefData(env, acct, date).catch(() => null);
    const hh = hd && briefHealth(hd, await coverageDates(env, acct, date, hd).catch(() => [date]));
    if (hh?.verdict === 'broken') {
      return { name: acct.name, blocked: true, date,
        error: `Not sent — the data for ${hh.dates.map(prettyDate).join(' and ')} is wrong. ${hh.summary}. Fix it on the Data Health tab, then rebuild this brief.` };
    }
  }

  let text = null, r = null;
  // 'error' is no longer written (see the catch below), but rows from before
  // that change still exist and their text is worth sending, not regenerating.
  if (useStored && prior?.text && prior.status !== 'skipped') text = prior.text;
  if (!text) {
    r = await makeBrief(env, acct, date);
    if (r.error) { await upsertBrief(env, acct.act_id, date, 'skipped', null, r.error, r.data); return { name: acct.name, skipped: r.error }; }
    text = r.text;
  }
  // The client channel, with no fallback to the internal one — see sendReport.
  const channel = acct.brief_channel;
  if (!channel) { await upsertBrief(env, acct.act_id, date, 'skipped', null, 'no client channel set for this brand — pick one in Settings', r?.data); return { name: acct.name, skipped: 'no client channel set' }; }
  try {
    // Goes to the client, so it comes from Cole - not a bot wearing a name.
    await slackPost(env, channel, text, null, { asUser: true });
    await upsertBrief(env, acct.act_id, date, 'sent', channel, text, r?.data);
    // The brief still went out with its numbers, which is right - but a missing
    // narrative is invisible to everyone unless it is said out loud. Usually
    // means the Anthropic key is out of credit.
    if (r?.narrative_error) await alertClaudeFailure(env, `Daily Brief narrative for ${acct.name}`, r.narrative_error);
    return { name: acct.name, ok: true, channel, date, narrative_error: r?.narrative_error ?? null };
  } catch (e) {
    /* A FAILED SEND LEAVES A SENDABLE DRAFT. This used to write status 'error'
       with the error message glued onto the front of the text, which did three
       damaging things at once: the Reports/Brief UI only shows Edit and Send on
       a 'draft', so the buttons vanished and the brief dropped to the read-only
       history at the bottom of the page; the wording Cole had just spent time
       editing was overwritten; and sendBrief itself then refused to reuse the
       text, so the only way forward regenerated it from scratch.
       Cole hit all three on Dartee, 2026-08-31, because SLACK_USER_TOKEN was
       not set. The send failing is normal — an unset token, a channel he is not
       in, Slack being down. It is not a reason to destroy the draft.
       The row stays exactly as it was; the error goes to the caller (the UI
       shows it) and to the internal channel via alertBriefFailure. */
    return { name: acct.name, error: e.message, draft_intact: true };
  }
}

/** A brief that fails silently is worse than no brief - nobody notices for weeks.
 *  Posts to the brand's INTERNAL alerts channel, never the client's brief channel,
 *  and stays quiet when yesterday already reported the same fault so an ongoing
 *  problem is one message rather than a daily drip. */
async function alertBriefFailure(env, acct, date, result) {
  if (result?.already_sent) return;
  const problem = result?.error || result?.skipped;
  if (!problem) return;
  const channel = acct.slack_channel;          // internal, deliberately not brief_channel
  if (!channel) return;
  const prev = await env.DB.prepare(
    `SELECT status, text FROM briefs WHERE act_id = ?1 AND date = ?2`,
  ).bind(acct.act_id, addDays(date, -1)).first().catch(() => null);
  const same = prev && (prev.status === 'error' || prev.status === 'skipped') &&
    String(prev.text || '').slice(0, 40) === String(problem).slice(0, 40);
  if (same) return;
  await slackPost(env, channel,
    `:warning: *Daily Brief did not go out for ${acct.name}* (${date})\n${problem}\n_Internal alert - the client was not messaged. Fix it in Locus._`);
}

const BRIEF_TZ = 'America/Chicago';           // Cole's timezone; the send hour is set in it
const DEFAULT_BRIEF_HOUR = 9;                 // 9am Central
/* Reports start this many hours after the brief hour. They share a budget with
   the briefs, and a report is the biggest single unit of work in this worker —
   given the same tick it would be the thing deferred six times over while six
   briefs went first. Its own tick, its own allowance. */
const REPORT_HOUR_OFFSET = 2;

/* ------------------------------------------------------------------ */
/*  A scheduled job that fails must SAY SO                             */
/* ------------------------------------------------------------------ */
/* Every failure in this worker has been silent. `lastRun` recorded ok:true
   while six reports posted to nobody; the nightly recorded six subrequest
   errors and no human saw them for four days. A record nobody reads is not
   monitoring.
 *
 * So: any tick that errored or had to defer work posts ONE line to the internal
 * channel. Deliberately one message for the whole tick rather than one per
 * brand, and deliberately quiet about a clean deferral that resolved itself —
 * see `sameAsLast`, which keeps an ongoing fault to a single message instead of
 * a drip every hour. */
async function alertScheduleTrouble(env, label, payload) {
  const flat = JSON.stringify(payload || {});
  const errors = (flat.match(/"error":/g) || []).length;
  const deferred = (flat.match(/"deferred":/g) || []).length;
  /* DEFERRAL IS NOT A FAULT — it is how this worker is supposed to behave now,
     and on the free plan it happens on most ticks by design. Alerting on it
     would put a Slack message in front of Cole every hour for normal
     operation, which is how alerting becomes wallpaper and a real failure gets
     scrolled past. Only errors speak. Deferrals ride along as context when
     something else has already earned the message, and are always visible in
     Settings. */
  if (!errors) { await putSetting(env, 'lastTrouble', '').catch(() => {}); return; }
  const ch = await getSetting(env, 'slackChannel');
  if (!ch || !env.SLACK_BOT_TOKEN) return;
  // One message per distinct fault, not one per hour it persists.
  const sig = `${label}|${errors}`;
  if ((await getSetting(env, 'lastTrouble')) === sig) return;
  await putSetting(env, 'lastTrouble', sig).catch(() => {});
  await slackPost(env, ch,
    `:construction: *${label}* finished with *${errors}* error${errors > 1 ? 's' : ''}` +
    `${deferred ? ` (and ${deferred} item${deferred > 1 ? 's' : ''} deferred to the next run, which is normal)` : ''}.\n` +
    `Used ${subUsed()} of ${SUB_LIMIT} subrequests. _Locus → Settings → “Are the automatic jobs actually running?” has the detail._`,
  ).catch(() => {});
}

/** The hour (0-23, Central) the Daily Brief should go out. */
async function briefHour(env) {
  const raw = await getSetting(env, 'briefHour');
  const h = raw == null || raw === '' ? NaN : +raw;
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : DEFAULT_BRIEF_HOUR;
}
/** Current hour in Central, so the send lands at the same WALL-CLOCK time all year
 *  rather than shifting by one at each daylight-saving boundary. */
function centralHour(d = new Date()) {
  return +new Intl.DateTimeFormat('en-US', { timeZone: BRIEF_TZ, hour: 'numeric', hour12: false }).format(d) % 24;
}

/** Morning cron: refresh TW data, then post yesterday's brief for every enabled brand. */
async function dailyBriefs(env) {
  const accounts = (await listAccounts(env, true)).filter(a => a.brief_enabled);
  const results = [];
  let didWork = false;
  // ONE clock governs the brief: Central, the same timezone the send hour is set in.
  //
  // This used to be `localDate(a.tz)` - each brand's own yesterday - which was harmless
  // while the trigger fired exactly once a day, because by 7am Central every US zone
  // agrees on what yesterday was. Once the trigger became hourly (so a missed send can
  // recover) that stopped being true: at midnight EASTERN the three Eastern brands
  // rolled into a new day, found no brief for it, and posted - 11pm Central, to client
  // channels. The Pacific brands rolled over later and posted at 7am.
  //
  // Deriving the date from Central instead means the run at 23:00 Central still asks
  // for the 23rd (already sent, skipped) and only the 07:00 run asks for the 24th.
  const briefDate = addDays(localDate(BRIEF_TZ), -1);
  for (const a of accounts) {
    const date = briefDate;
    // Cheap check FIRST. Now that this runs every hour after the send time rather
    // than once, a brand already posted must cost a single SELECT - not a 45-day
    // Triple Whale sync. sendBrief checks again; this only avoids the work.
    const prior = await env.DB.prepare(
      `SELECT status FROM briefs WHERE act_id = ?1 AND date = ?2`,
    ).bind(a.act_id, date).first().catch(() => null);
    if (prior?.status === 'sent') { results.push({ name: a.name, already_sent: true, date }); continue; }
    /* SKIPPED IS HANDLED. "Don't send this one" means don't send it — and it
       must also mean don't rebuild it, or the hourly trigger simply drafts the
       day again and posts it to the internal channel every hour. That is
       exactly what happened on 2026-09-01: 21 days were marked skipped in one
       go and the next tick re-posted a draft for all six brands, because the
       only statuses treated as finished were 'sent' and 'draft'. */
    if (prior?.status === 'skipped') { results.push({ name: a.name, skipped_by_hand: true, date }); continue; }
    // A brand awaiting review already has its draft. Without this the hourly
    // trigger would re-sync 45 days of Triple Whale and rebuild the same draft
    // every hour until someone pressed send.
    if (a.review_first && prior?.status === 'draft') { results.push({ name: a.name, awaiting_review: true, date }); continue; }

    // Stop BEFORE starting a brand we cannot finish. Half a brief is worse than
    // none: the old behaviour ran until Cloudflare killed it, which could land
    // between the Slack post and the row that records it — a client message with
    // no record that it was sent, and a retry next hour that sends it twice.
    if (!subCanAfford(costOf('brief', COST_BRIEF_BRAND))) {
      results.push({ name: a.name, date, deferred: 'out of subrequest budget — next tick picks this up' });
      continue;
    }

    didWork = true;
    let r;
    try {
      r = await measured('brief', async () => {
        /* Only sync Triple Whale if this brand is actually missing the day.
           A blind 45-day pull per brand was the single biggest cost in this
           loop, and it is now usually redundant: syncPass refreshes TW on the
           hourly tick, so by brief time the data is normally already here. One
           cheap SELECT replaces a network call plus a batch write. */
        const have = await env.DB.prepare(
          `SELECT 1 AS x FROM tw_daily WHERE act_id = ?1 AND date = ?2 LIMIT 1`,
        ).bind(a.act_id, date).first().catch(() => null);
        if (!have) await syncTwDaily(env, a, 45).catch(() => {});
        // Two modes per brand. Review-first parks a draft internally and waits for
        // a human; auto sends straight to the client. A daily deliverable can be
        // either, and forcing every brand through a morning approval is exactly
        // the button-pushing this tool exists to avoid.
        if (a.review_first) return await draftBrief(env, a, date, { skipIfExists: true });
        const sent = await sendBrief(env, a, date, { skipIfSent: true });
        /* An auto-send brand whose data is broken still gets a morning message —
           internally, as a draft, saying why it was held. Silence is the worst
           outcome available: the client gets nothing and nobody knows. */
        if (sent.blocked) return { ...(await draftBrief(env, a, date, { skipIfExists: false })), held: sent.error };
        return sent;
      });
    } catch (e) { r = { name: a.name, error: e.message }; }
    results.push(r);
    // Never let a broken alert stop the remaining brands from getting their brief.
    await alertBriefFailure(env, a, date, r).catch(() => {});
  }
  // Only record a run that actually did something, so `lastBriefRun` stays a useful
  // record of the last real send rather than being overwritten hourly by no-ops.
  if (didWork) {
    await putSetting(env, 'lastBriefRun', JSON.stringify({ at: new Date().toISOString(), results })).catch(() => {});
  }
  return results;
}

/* ------------------------------------------------------------------ */
/*  Is a brand's Meta data current enough to judge?                    */
/* ------------------------------------------------------------------ */
/* The delivery check reads spend out of D1, not out of Meta. That is right —
 * it must be cheap enough to run every hour — but it means a sync that did not
 * happen is indistinguishable from an account that did not spend, and the old
 * code resolved that ambiguity the worst possible way: `dayRow?.spend ?? 0`.
 *
 * On 2026-08-31 Dartee Golf had spent $892.87 and the missing row said $0, so a
 * client-facing brand got a 🚨 in Slack about billing, campaign status and
 * policy. Nothing was wrong with the account. The sync had run out of
 * subrequests eight hours earlier and never written the row.
 *
 * A missing row is now a MISSING ROW. It is worth knowing about — it just is
 * not a spend story, and it must never be told as one. */
async function insightsFreshness(env, a, day) {
  const row = await env.DB.prepare(
    `SELECT date FROM daily_insights WHERE act_id = ?1 AND date <= ?2 ORDER BY date DESC LIMIT 1`,
  ).bind(a.act_id, day).first().catch(() => null);
  return { latest: row?.date || null, current: row?.date === day };
}

/* ------------------------------------------------------------------ */
/*  Intraday pacing (Chat 4) — today's hourly curve vs the L7 shape    */
/* ------------------------------------------------------------------ */

/** Pull today + last 7 days of hourly spend live from Meta, cache in hourly_insights,
 *  and build today's cumulative curve vs the average last-7-days curve. */
/* ------------------------------------------------------------------ */
/*  Weekly / Monthly client reports.                                   */
/*  Frozen snapshots: drafted by the cron (Monday = last Mon–Sun, the  */
/*  1st = last month), reviewed internally, sent to the client with a  */
/*  button. The interface is Mobius Profit's Reports tab (these routes */
/*  are proxied there); the client reads a tokenized archive link      */
/*  served by the profit worker. Engine lives HERE for the same reason */
/*  the Daily Brief's does: this worker holds the TW/Anthropic/Slack   */
/*  secrets and the crons (the account is at the 5-trigger limit).     */
/* ------------------------------------------------------------------ */

/** One day of store-level economics — the same CTC math as briefData and
 *  Profit's dayEconomics: revenue = Shopify TOTAL SALES minus sales tax
 *  (shipping already inside it, never added); CM subtracts every variable
 *  cost; the new/returning split keeps TW's measured SHARE rebased onto the
 *  headline revenue. Keep the three implementations in step. */
function econDay(piv, metaBy, date, cmPct) {
  const totalSales = twDay(piv, date, TW_SALES);
  if (totalSales == null) return null;
  const tax = piv.totalNetTaxes?.[date] ?? 0;
  const sales = totalSales - tax;
  const shipCost = piv.totalShippingCosts?.[date] ?? 0;
  const handling = piv.totalHandlingFees?.[date] ?? 0;
  const cogs = piv.totalProductCosts?.[date] ?? null;
  const fees = piv.totalPaymentGatewayCosts?.[date] ?? null;
  const mrow = metaBy[date];
  const gSpend = piv.ga_adCost?.[date] ?? null;
  // Same guard as the Daily Brief: a blended total that contradicts Meta's own
  // API is rebuilt rather than believed. The weekly report sums these days, so
  // an unchecked one understates a whole week's spend.
  const sp = spendFor(piv, date, mrow?.spend ?? null);
  const spend = sp.spend;
  const rawNew = piv.newCustomerSales?.[date] ?? null;
  const rawRet = piv.rcRevenue?.[date] ?? null;
  const split = (rawNew ?? 0) + (rawRet ?? 0);
  const newShare = split > 0 && rawNew != null ? rawNew / split : null;
  const newRev = newShare != null ? sales * newShare : rawNew;
  const variable = cogs != null ? cogs + shipCost + handling + (fees ?? 0) : null;
  const gp = cmPct != null ? sales * cmPct : variable != null ? sales - variable : null;
  return {
    date, sales, spend,
    orders: piv.totalOrders?.[date] ?? null,
    new_rev: newRev,
    ret_rev: newShare != null ? sales * (1 - newShare) : rawRet,
    new_orders: piv.newCustomersOrders?.[date] ?? null,
    meta_spend: mrow?.spend ?? null, google_spend: gSpend, spend_source: sp.source,
    gp, margin: sales > 0 && gp != null ? gp / sales : null,
    cm: gp != null && spend != null ? gp - spend : null,
  };
}

/** Aggregate a run of econDay rows. Ratios are ratio-of-sums, never averages. */
function periodTotals(rows) {
  const sum = get => { let s = 0, any = false; for (const r of rows) { const v = get(r); if (v != null) { s += v; any = true; } } return any ? s : null; };
  const sales = sum(r => r.sales), spend = sum(r => r.spend);
  const orders = sum(r => r.orders), newRev = sum(r => r.new_rev), newOrders = sum(r => r.new_orders);
  const gp = sum(r => r.gp);
  return {
    days: rows.length, sales, spend, orders,
    new_rev: newRev, ret_rev: sum(r => r.ret_rev), new_orders: newOrders,
    meta_spend: sum(r => r.meta_spend), google_spend: sum(r => r.google_spend),
    mer: spend ? sales / spend : null,
    amer: newRev != null && spend ? newRev / spend : null,
    aov: orders ? sales / orders : null,
    ncpa: spend != null && newOrders ? spend / newOrders : null,
    new_share: sales > 0 && newRev != null ? newRev / sales : null,
    gp, cm: gp != null && spend != null ? gp - spend : null,
    margin: sales > 0 && gp != null ? gp / sales : null,
  };
}

/** Per-platform sections, this period vs the prior one. A channel only appears
 *  when it has data in either window (and is not on the client's hide list) —
 *  a section full of zeros is worse than no section. Meta reads daily_insights
 *  (the Meta API is authoritative and carries delivery metrics TW does not
 *  sync); everything else reads tw_daily. Platform revenue here is ATTRIBUTED
 *  (the platform's own claim) and the UI labels it that way — the blended
 *  scorecard is the honest headline. */
/* Channel figures come from a PERIOD Triple Whale call (`tw` / `twPrev`), not
 * from summing the daily rows. Two reasons, both learned the hard way:
 *   - TW exposes Impressions, Clicks and its PEER BENCHMARKS only as period
 *     totals; they have no daily series at all, so no amount of summing
 *     tw_daily produces them.
 *   - CPM and CTR are RATIOS. Summing seven daily CPMs is meaningless and
 *     averaging them weights a $10 day like a $1,000 one. Asking TW for the
 *     window it actually is gets the arithmetic right at the source.
 * The daily rows remain the fallback when the period call fails or a shop has
 * no Triple Whale connection. */
/** Triple Whale reports 0 for peer benchmarks on a shop that has not opted into
 *  its benchmark network - not null, zero. Rendering that gives a client a
 *  "peer CPM $0.00", which is worse than showing nothing, so 0 means absent. */
const peerVal = v => (typeof v === 'number' && v > 0) ? v : null;

function channelSections(piv, metaBy, ranges, hide, tw, twPrev) {
  // Benchmark metrics are RATES, so they average across the window; the sum of
  // seven daily CPMs is not a CPM.
  const avg = (id, ds) => {
    let n = 0, t = 0;
    for (const d of ds) { const v = piv[id]?.[d]; if (v != null) { t += v; n++; } }
    return n ? t / n : null;
  };
  const S = (id, ds) => { let s = 0, any = false; for (const d of ds) { const v = piv[id]?.[d]; if (v != null) { s += v; any = true; } } return any ? s : null; };
  const compute = {
    // TRIPLE WHALE, not the Meta API. Every result and attribution figure in the
    // report comes from one source, so nothing can disagree with the blended
    // headline; Meta is used only where TW structurally cannot help, which is
    // ad-level creative. TW carries Facebook CTR, CPM, Impressions and Clicks
    // too - the metric filter was simply dropping them, which is what made this
    // look like a gap in TW. Meta API spend stays as a fallback for a day TW has
    // not synced yet, so a new account still shows something.
    // Triple Whale, so every result in this report has one source. Meta is used
    // only where TW structurally cannot help, which is ad-level creative.
    meta: (ds, m) => {
      const spend = m ? m.fb_ads_spend : null;
      if (!(spend > 0)) {
        // No TW figure for this window - fall back to Meta-reported spend so a
        // brand mid-backfill still shows something, clearly flagged.
        const daily = S('fb_ads_spend', ds);
        if (daily > 0) return { spend: daily, awaiting_tw: true };
        let ms = 0, any = false;
        for (const d of ds) { const r = metaBy[d]; if (!r) continue; any = true; ms += r.spend || 0; }
        return any && ms > 0 ? { spend: ms, awaiting_tw: true } : null;
      }
      const roas = m.fb_ads_purchase_roas ?? null;
      const pur = m.facebookPurchases ?? m.facebookMetaPurchases ?? null;
      const imp = m.facebookImpressions ?? null;
      const clicks = m.facebookClicks ?? m.facebookOutboundClicks ?? null;
      return {
        spend, roas, source: 'Meta-reported',
        revenue: roas != null ? spend * roas : null,
        purchases: pur, cpa: m.facebookCpa ?? (pur ? spend / pur : null),
        cpm: m.averageFacebookCpm ?? (imp ? spend / imp * 1000 : null),
        ctr: m.facebookCtr != null ? m.facebookCtr / 100 : (imp && clicks != null ? clicks / imp : null),
        impressions: imp, clicks,
        peer_cpm: peerVal(m.totalBenchmarksCPM),
        peer_ctr: peerVal(m.totalBenchmarksCTR) != null ? m.totalBenchmarksCTR / 100 : null,
        peer_roas: peerVal(m.benchmarksFacebookRoas),
      };
    },
    google: (ds, m) => {
      const spend = m ? m.ga_adCost : S('ga_adCost', ds);
      if (!(spend > 0)) return null;
      const roas = m ? m.ga_ROAS : null;
      const imp = m ? m.totalGoogleAdsImpressions : S('totalGoogleAdsImpressions', ds);
      const clicks = m ? m.totalGoogleAdsClicks : S('totalGoogleAdsClicks', ds);
      // googleAllCpa is real dollars-per-conversion; googleCpa is NOT (~0.18,
      // some other ratio) and dividing spend by it fabricated conversions.
      const cpa = m ? m.googleAllCpa : null;
      const purchases = cpa ? Math.round(spend / cpa) : null;
      // A ratio built on nearly no conversions is not a result. Below two, the
      // ROAS is one order's value over the window's whole spend, so it is carried
      // as low_signal and the renderers show the conversion count instead.
      const lowSignal = purchases != null && purchases < 2;
      return {
        spend, roas: roas ?? null, low_signal: lowSignal || undefined,
        source: 'Google-reported',
        revenue: roas != null ? spend * roas : null,
        purchases,
        cpa: cpa ?? null,
        cpm: (m && m.totalGoogleAdsCpm != null) ? m.totalGoogleAdsCpm : (imp ? spend / imp * 1000 : null),
        ctr: (m && m.totalGoogleAdsCtr != null) ? m.totalGoogleAdsCtr / 100 : (imp && clicks ? clicks / imp : null),
        impressions: imp ?? null, clicks: clicks ?? null,
        peer_cpm: m ? peerVal(m.totalBenchmarksCPMGoogle) : null,
        peer_ctr: m && peerVal(m.totalBenchmarksCTRGoogle) != null ? m.totalBenchmarksCTRGoogle / 100 : null,
      };
    },
    // TikTok / Pinterest: the TW ids we expect if those channels ever connect.
    // No data in the window = no section, so a wrong guess costs nothing.
    tiktok: ds => adPlatform(ds, ['tiktokAdsSpend', 'tiktokSpend', 'tk_adCost'], ['tiktokAdsRoas', 'tiktokRoas', 'tk_ROAS']),
    pinterest: ds => adPlatform(ds, ['pinterestAdsSpend', 'pinterestSpend', 'pi_adCost'], ['pinterestAdsRoas', 'pinterestRoas', 'pi_ROAS']),
    amazon: ds => {
      const sales = S('totalAmazonSales', ds);
      const orders = S('totalAmazonOrders', ds);
      // A connected-but-dormant Amazon account returns rows of zeros — a section
      // of zeros in a client report is noise, so it needs actual activity to show.
      if (!(sales > 0) && !(orders > 0)) return null;
      let through = null;
      for (const d of ds) if (piv.totalAmazonSales?.[d] != null) through = d;
      return { sales, net_sales: S('amazonNetSales', ds), orders,
        refunds: S('totalAmazonRefunds', ds), data_through: through };
    },
    email: ds => {
      const rev = S('klaviyoPlacedOrderSales', ds);
      if (rev == null || rev <= 0) return null;
      return { revenue: rev,
        campaigns: S('totalKlaviyoPlacedOrderTotalPriceCampaigns', ds),
        flows: S('totalKlaviyoPlacedOrderTotalPriceFlows', ds) };
    },
  };
  function adPlatform(ds, spendIds, roasIds) {
    let spend = 0, rev = 0, any = false;
    for (const d of ds) {
      let sp = null;
      for (const id of spendIds) { const v = piv[id]?.[d]; if (v != null) { sp = v; break; } }
      if (sp == null) continue;
      any = true; spend += sp;
      for (const id of roasIds) { const v = piv[id]?.[d]; if (v != null) { rev += v * sp; break; } }
    }
    return any && spend > 0 ? { spend, revenue: rev || null, roas: rev ? rev / spend : null } : null;
  }
  const LABELS = { meta: 'Meta', google: 'Google', tiktok: 'TikTok', amazon: 'Amazon', pinterest: 'Pinterest', email: 'Email (Klaviyo)' };
  const out = [];
  for (const id of Object.keys(LABELS)) {
    if (hide.includes(id)) continue;
    const cur = compute[id](ranges.cur, tw), prev = compute[id](ranges.prev, twPrev);
    if (cur || prev) out.push({ id, label: LABELS[id], cur, prev });
  }
  return out;
}

/** Tell someone when Claude stops answering.
 *
 *  Anthropic exposes SPEND, not remaining balance - no API can watch a credit
 *  balance drain - so the practical warning is the failure itself. Every
 *  narrative call already degrades gracefully (the brief and the report still
 *  ship their numbers), which is correct behaviour and also exactly why it would
 *  otherwise go unnoticed for weeks: a client would just quietly receive a
 *  thinner brief.
 *
 *  Deduped GLOBALLY on a 12h window, not per brand: an exhausted key fails all
 *  six brands within the same minute, and six identical Slack messages is how an
 *  alert gets muted. Posts INTERNAL-only, never to a client channel.
 */
async function alertClaudeFailure(env, context, message) {
  const channel = await getSetting(env, 'reportChannel') || await getSetting(env, 'slackChannel');
  if (!channel) return;
  const last = safeJson(await getSetting(env, 'lastClaudeAlert'), null);
  if (last?.at && Date.now() - last.at < 12 * 3600e3) return;
  // Marked before posting so a failing post cannot turn into a message storm.
  await putSetting(env, 'lastClaudeAlert', JSON.stringify({ at: Date.now(), context, message })).catch(() => {});
  const msg = String(message || '');
  const likelyCredit = /credit|balance|quota|insufficient|billing|payment|402/i.test(msg);
  await slackPost(env, channel,
    `:warning: *Claude could not write the ${context}* — the numbers went out, the written summary did not.\n` +
    '```' + msg.slice(0, 300) + '```\n' +
    (likelyCredit
      ? '*This looks like an API credit problem.* Top up at <https://platform.claude.com/settings/billing|Console → Billing>, and turn on auto-reload so it cannot happen again.'
      : 'Check <https://platform.claude.com/settings/billing|Console → Billing> for credit, and the API key on the account-health worker.') +
    '\n_One alert per 12 hours, however many brands are affected._',
    null, { username: 'Mobius Reports', icon: ':warning:' }).catch(() => {});
}

/** A sync that keeps failing must SAY SO. `syncAdDaily` writes its error to
 *  accounts.last_error and returns quietly, which is right for one bad night —
 *  but when Meta removed `video_3_sec_watched_actions` the whole ad-level pull
 *  broke for every brand and ran silently for two nights, because nothing reads
 *  last_error unless a human opens Settings. A field being retired is exactly
 *  the kind of break that never fixes itself.
 *
 *  Deduped globally on 12 hours like the Claude alert: one bad field fails all
 *  six brands within a minute, and six identical messages is how an alert gets
 *  muted. */
async function alertSyncFailure(env, acct, message) {
  const channel = await getSetting(env, 'reportChannel') || await getSetting(env, 'slackChannel');
  if (!channel) return;
  const last = safeJson(await getSetting(env, 'lastSyncAlert'), null);
  if (last?.at && Date.now() - last.at < 12 * 3600e3) return;
  await putSetting(env, 'lastSyncAlert', JSON.stringify({ at: Date.now(), act: acct.act_id, message })).catch(() => {});
  const msg = String(message || '');
  const badField = /is not valid for fields param/i.test(msg);
  await slackPost(env, channel,
    `:rotating_light: *Meta ad-level sync is failing* — first seen on ${acct.name}.\n` +
    '```' + msg.slice(0, 300) + '```\n' +
    (badField
      ? '*Meta has retired a field we ask for.* Creative stats (hook, hold, retention) will be stale or empty until the field list in `syncAdSlice` is updated.'
      : 'Ad-level spend, creative cards and the report ad table will be stale until this clears.') +
    '\n_One alert per 12 hours, however many brands are affected._',
    null, { username: 'Mobius Reports', icon: ':rotating_light:' }).catch(() => {});
}

/** Public, login-free preview links for the ads a report lists.
 *
 *  `preview_shareable_link` is Meta's own field for exactly this: a URL that
 *  someone WITHOUT access to the ad account can open to see the creative. That
 *  matters because these links go into a client-facing report - an Ads Manager
 *  deep link would just bounce the client to a permission error.
 *
 *  Fetched only for the ~10 ads actually listed, in one batched call, and stored
 *  INSIDE the frozen report so an archived report keeps the links it shipped
 *  with. Best effort throughout: a deleted ad, an expired token or a partial
 *  failure must never stop a report from generating, so this degrades to plain
 *  unlinked names rather than throwing.
 */
/* DO NOT use `preview_shareable_link` here. Meta documents it as shareable with
 * people who lack ad-account access, but tested 2026-08-27 it 302s to
 * business.facebook.com/business/loginpage - useless in a client report, and it
 * fails in a way that looks fine until a client clicks it.
 *
 * The `/previews` edge returns an <iframe src="...preview_iframe.php?d=..&t=..">
 * whose URL renders the creative with NO login, which is what an embeddable
 * preview has to do by definition. We extract that src and link to it directly. */
const PREVIEW_FORMATS = ['MOBILE_FEED_STANDARD', 'DESKTOP_FEED_STANDARD', 'INSTAGRAM_STANDARD'];

function previewSrcFrom(node) {
  const body = node?.previews?.data?.[0]?.body ?? node?.data?.[0]?.body;
  if (typeof body !== 'string') return null;
  const m = body.match(/src="([^"]+)"/);
  if (!m) return null;
  // The body is HTML, so the query string arrives entity-encoded.
  const url = m[1].replace(/&amp;/g, '&');
  if (!/^https:\/\//.test(url)) return null;
  // Meta hands these back on business.facebook.com. Both hosts serve the preview
  // without a login (verified 2026-08-27), but the business subdomain is the one
  // that runs business-login flows for anyone carrying Business Manager cookies,
  // and this link goes to clients. www is the neutral host.
  return url.replace('://business.facebook.com/', '://www.facebook.com/');
}

async function adPreviewLinks(env, adIds) {
  if (!env.META_TOKEN || !adIds.length) return {};
  const out = {};
  const ids = adIds.slice(0, 12);
  for (const fmt of PREVIEW_FORMATS) {
    const missing = ids.filter(id => !out[id]);
    if (!missing.length) break;
    try {
      const body = await meta(env, '', { ids: missing.join(','), fields: `previews.ad_format(${fmt}){body}` });
      for (const [id, v] of Object.entries(body || {})) {
        const src = previewSrcFrom(v);
        if (src) out[id] = src;
      }
    } catch {
      // A single deleted ad fails the whole batch, so ask one at a time.
      for (const id of missing) {
        try {
          const r = await meta(env, `${id}/previews`, { ad_format: fmt });
          const src = previewSrcFrom(r);
          if (src) out[id] = src;
        } catch { /* not previewable in this format - the next one may work */ }
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Real video playback                                                 */
/*                                                                      */
/*  Meta withholds a video's `source` mp4 from the USER token even with */
/*  pages_read_engagement — it needs a PAGE-scoped token. Those come    */
/*  from me/accounts and, for a system user, do not expire, so they are  */
/*  cached; a page missing from the cache (a newly assigned brand)       */
/*  triggers one refresh before giving up.                              */
/*                                                                      */
/*  The mp4 URL itself is short-lived and signed, which is exactly why   */
/*  it is resolved at PLAY time and never frozen into a report. The      */
/*  cover frame is baked in and always survives; playback is the part    */
/*  allowed to expire.                                                   */
/* ------------------------------------------------------------------ */

async function pageTokens(env, { refresh = false } = {}) {
  if (!refresh) {
    const cached = safeJson(await getSetting(env, 'pageTokens'), null);
    if (cached?.map) return cached.map;
  }
  const r = await meta(env, 'me/accounts', { fields: 'id,access_token', limit: 100 });
  const map = {};
  for (const p of r?.data || []) if (p.access_token) map[String(p.id)] = p.access_token;
  await putSetting(env, 'pageTokens', JSON.stringify({ map, at: new Date().toISOString() }));
  return map;
}

/** A fresh, playable mp4 URL for one ad, or null when it genuinely cannot be
 *  played — a creative on a page we were never granted, or an ad with no video.
 *  Never throws: the card falls back to its cover image. */
async function adVideoSource(env, adId, hint = {}) {
  if (!env.META_TOKEN) return null;
  let videoId = hint.video_id || null, pageId = hint.page_id || null;
  if (!videoId || !pageId) {
    try {
      const r = await meta(env, `${adId}/adcreatives`, { fields: 'video_id,object_story_spec,asset_feed_spec', limit: 1 });
      const c = r?.data?.[0] || {};
      videoId ||= c.video_id || c.object_story_spec?.video_data?.video_id || c.asset_feed_spec?.videos?.[0]?.video_id || null;
      pageId ||= c.object_story_spec?.page_id || null;
    } catch { return null; }
  }
  if (!videoId) return { src: null, reason: 'This ad has no single video to play (a carousel or a dynamic creative).' };
  if (!pageId) return { src: null, reason: 'Meta does not say which page this creative belongs to, so it cannot be opened.' };

  const ask = async tok => {
    const u = new URL(`${GRAPH}/${videoId}`);
    u.searchParams.set('fields', 'source');
    u.searchParams.set('access_token', tok);
    const res = await xfetch(u);
    const b = await res.json().catch(() => ({}));
    return { src: b?.source || null, err: b?.error?.message || (res.ok ? null : `Meta returned ${res.status}`) };
  };

  /* PAGE TOKENS GO STALE, AND NOTHING NOTICED. The cached map was only ever
     refetched when a page was MISSING from it — a token that was present but no
     longer accepted (the user token behind it regenerated, the page reassigned)
     failed here forever, and the card said "no playable video", which is not
     what had happened at all. Measured 2026-09-03: all six pages had tokens,
     all cached 2026-08-30, and playback was failing anyway.
     So: try the cache, and on ANY empty answer refresh once and try again.
     A genuinely unplayable ad costs one extra call; a stale token now heals. */
  let tokens = await pageTokens(env).catch(() => ({}));
  let tok = tokens[String(pageId)];
  let out = tok ? await ask(tok).catch(e => ({ src: null, err: e.message })) : { src: null, err: 'no page token' };
  if (!out.src) {
    tokens = await pageTokens(env, { refresh: true }).catch(() => ({}));
    const fresh = tokens[String(pageId)];
    if (fresh && fresh !== tok) out = await ask(fresh).catch(e => ({ src: null, err: e.message }));
    else if (!tok) out = { src: null, err: 'no page token' };
  }
  if (out.src) return { src: out.src };
  return { src: null, reason: out.err === 'no page token'
    ? 'This creative lives on a page we have not been granted access to.'
    : `Meta would not return the video file — ${out.err || 'no reason given'}.` };
}

/** Is this ad actually listed in one of that client's SENT reports?
 *  This is what stops the endpoint being an open proxy for arbitrary Meta
 *  videos: an unauthenticated caller can only ever play an ad that already
 *  appears in a report their own archive link covers. Returns the stored row
 *  so its video_id can be reused instead of asking Meta again. */
async function adInSentReport(env, token, adId) {
  const tokens = safeJson(await getSetting(env, 'reportTokens'), {});
  const actId = tokens?.[token]?.act_id;
  if (!actId || !adId) return null;
  const { results } = await env.DB.prepare(
    `SELECT data_json FROM reports WHERE act_id = ?1 AND status = 'sent'`,
  ).bind(actId).all();
  for (const r of results) {
    const row = (safeJson(r.data_json, {})?.ads?.top || []).find(a => String(a.ad_id) === String(adId));
    if (row) return row;
  }
  return null;
}

/** Creative thumbnails for the ads a report lists, BAKED INTO the report.
 *
 *  Meta's image URLs are signed and expire, so linking to them would leave a
 *  three-month-old report full of broken images - and a frozen report that
 *  rots is not frozen. Each thumbnail is fetched once at generation time and
 *  stored as a data URI inside the report itself, which is then self-contained
 *  forever with no external dependency.
 *
 *  Video ads work the same way: Meta keeps a cover frame for every video
 *  creative, so the grid is uniform and only the play badge differs. The name
 *  still links to the full preview, which actually plays the video.
 *
 *  Best effort throughout - an ad with no usable thumbnail simply shows its
 *  name and numbers rather than a broken image.
 */
/* Creative assets are CACHED, and this is why filtering used to crawl.
   Every sort or filter change re-picks the top N, and each new ad meant a
   creative fetch plus a video lookup against Meta - up to sixteen sequential
   round trips for one click on a dropdown. An ad's creative does not change,
   so it is fetched once and kept.
   Cached in `ad_creative` keyed by ad_id, refreshed after 14 days so a swapped
   asset eventually corrects itself. Only rows under 90KB are stored: a full
   resolution static can be far larger and D1 is not an image host. */
const AD_CREATIVE_TTL_DAYS = 14;
/* What the LIVE creative browser may spend on one image, and across a batch.
   Deliberately not the report's numbers: a report inlines every image into a
   single D1 row and must stay small, whereas this is a JSON response that is
   thrown away after paint. `budget` is effectively uncapped — it exists so a
   pathological account cannot build an unbounded response, not to ration. */
const LIVE_THUMBS = { maxBytes: 280_000, budget: 24_000_000 };

/* `maxBytes` / `budget` are the REPORT's constraints, and they were being
   applied to the live creative browser too, which does not share them.
   A report inlines every image into ONE D1 row, so it must stay under ~1.1MB
   in total and reject any single image over 190KB. The Creative tab just
   streams JSON to a browser and has no such ceiling — but it inherited both,
   and because the video cover deliberately picks the LARGEST frame Meta offers
   (and statics are asked for at 1080), most images were fetched, found to be
   over 190KB, and thrown away. Measured 2026-09-03: 13 of 20 cached creatives
   had `thumb: null`, and the card falls back to a glyph placeholder — which is
   what "the creative won't load" was. */
async function adThumbnails(env, adIds, { maxBytes = 190_000, budget = 1_100_000 } = {}) {
  const out = {};
  if (!env.META_TOKEN || !adIds.length) return out;
  const want = [...new Set(adIds)];
  let missing = want;
  try {
    const q = want.map((_, i) => `?${i + 1}`).join(',');
    const { results } = await env.DB.prepare(
      `SELECT ad_id, json, fetched_at FROM ad_creative WHERE ad_id IN (${q})`).bind(...want).all();
    const cutoff = new Date(Date.now() - AD_CREATIVE_TTL_DAYS * 86400e3).toISOString().slice(0, 19).replace('T', ' ');
    const fresh = new Set();
    for (const r of results || []) {
      if (String(r.fetched_at) < cutoff) continue;          // stale: refetch
      const v = safeJson(r.json, null);
      if (v) { out[r.ad_id] = v; fresh.add(r.ad_id); }
    }
    missing = want.filter(id => !fresh.has(id));
  } catch { missing = want; }                                // cache miss must never break the cards
  if (!missing.length) return out;
  adIds = missing;
  // Whatever we resolve here is written back to `ads.media_type` at the end, so
  // the creative browser can filter by type without a Meta call per ad. It
  // fills in as ads are looked at, and the video/static fallback below covers
  // anything not yet seen.

  // Ad-level facts for the detail view, in ONE batched call rather than per ad.
  let metaById = {};
  try {
    metaById = await meta(env, '', {
      ids: adIds.slice(0, 10).join(','),
      fields: 'created_time,effective_status,campaign{name},adset{name}',
    }) || {};
  } catch { /* the cards still work without status and dates */ }
  // Cards render ~255x319 CSS px, so a 2x screen wants ~640px on the long edge.
  // The SMALLEST frame that still covers that wins, and every other size is
  // kept as a fallback — picking the biggest and hard-rejecting it over the
  // ceiling is what left most cards with no image at all.
  const LONG_EDGE = 640;
  for (const id of adIds.slice(0, 10)) {
    try {
      const r = await meta(env, `${id}/adcreatives`, {
        fields: 'thumbnail_url,image_url,object_type,video_id,object_story_spec,asset_feed_spec,body,title',
        thumbnail_width: 1080, thumbnail_height: 1080, limit: 1,
      });
      const c = r?.data?.[0];
      const m = metaById[id] || {};
      // The words in the ad. Page-post ads keep them in object_story_spec (link_data
      // for a static, video_data for a video); Advantage+ ads keep several of each
      // in asset_feed_spec, where the first is the primary variant.
      const ld = c?.object_story_spec?.link_data, vd = c?.object_story_spec?.video_data;
      const afs = c?.asset_feed_spec || {};
      const copy = {
        body: vd?.message || ld?.message || afs.bodies?.[0]?.text || c?.body || null,
        headline: vd?.title || ld?.name || afs.titles?.[0]?.text || c?.title || null,
        description: ld?.description || afs.descriptions?.[0]?.text || null,
        cta: vd?.call_to_action?.type || ld?.call_to_action?.type || afs.call_to_action_types?.[0] || null,
        status: m.effective_status || null,
        created: m.created_time ? String(m.created_time).slice(0, 10) : null,
        campaign: m.campaign?.name || null,
        adset: m.adset?.name || null,
      };
      Object.assign(out[id] ??= {}, copy);
      // Video hides in several places depending on how the ad was built: a
      // top-level video_id, inside object_story_spec.video_data for a page-post
      // ad, or in asset_feed_spec.videos for a dynamic/Advantage+ creative.
      // Checking only the first two reported every UGC video ad as an image.
      const isVideo = !!(c?.video_id || c?.object_type === 'VIDEO'
        || c?.object_story_spec?.video_data
        || (Array.isArray(c?.asset_feed_spec?.videos) && c.asset_feed_spec.videos.length));
      /* MEDIA TYPE, and only the three that are real: video, carousel, image.
         Cole: "the type should only be All, Video, Static, Carousel" - the
         format tags read from ad NAMES (UGC, Still) were being offered as
         filters beside them and duplicated the same split, since UGC is video
         and Still is static.
         A carousel is a creative with child attachments, or an Advantage+ one
         Meta has flagged as such. Checked BEFORE video, because a carousel of
         videos is a carousel first - that is how it behaves in the feed. */
      const kids = c?.object_story_spec?.link_data?.child_attachments;
      const isCarousel = (Array.isArray(kids) && kids.length > 1)
        || c?.object_type === 'CAROUSEL'
        || !!c?.asset_feed_spec?.additional_data?.multi_share_end_card;
      out[id].media_type = isCarousel ? 'carousel' : isVideo ? 'video' : 'image';
      /* `video` is what puts a PLAY BADGE on the card, so it must mean "this
         ad can actually be played", not "there is video somewhere in it". A
         carousel of videos has no single video to play — `adVideoSource` finds
         no video_id and the click died on "no playable video". Set AFTER the
         carousel test for that reason; setting it beside `isVideo` above is
         what put an unusable badge on every carousel. */
      out[id].video = out[id].media_type === 'video';
      // A video creative's own thumbnail_url is the PAGE AVATAR (see the note
      // below), so the cover frame has to come from the video object itself.
      // `picture` is a real frame and is readable with the user token now that
      // it carries pages_read_engagement; `source` still needs a page-scoped
      // token, which is playback's problem, not the cover's.
      const vidId = c?.video_id || c?.object_story_spec?.video_data?.video_id
        || c?.asset_feed_spec?.videos?.[0]?.video_id || null;
      out[id].video_id = vidId;
      out[id].page_id = c?.object_story_spec?.page_id || null;
      let coverUrls = [];
      if (isVideo && vidId) {
        try {
          const v = await meta(env, vidId, { fields: 'picture,length,thumbnails{uri,width,height,is_preferred}' });
          out[id].duration = v?.length ?? null;
          /* `picture` is a small fixed-size still — it was the low-quality cover.
             `thumbnails` carries several frames at real resolution.
             ONE candidate used to come out of here: the biggest. If that one
             frame came back over the byte ceiling the ad ended up with no cover
             at all, even though Meta had offered four smaller copies of the very
             same frame. So ALL of them are kept, ordered by what we actually
             want: the smallest that still covers a 2x card first, then the
             larger ones, then the small ones, then `picture` as the floor. */
          const edge = t => Math.max(t.width || 0, t.height || 0);
          const pref = (a, b) => (b.is_preferred === true) - (a.is_preferred === true);
          const thumbs = (v?.thumbnails?.data || []).filter(t => t.uri);
          const enough = thumbs.filter(t => edge(t) >= LONG_EDGE).sort((a, b) => edge(a) - edge(b) || pref(a, b));
          const small = thumbs.filter(t => edge(t) < LONG_EDGE).sort((a, b) => edge(b) - edge(a) || pref(a, b));
          coverUrls = [...enough, ...small].map(t => t.uri);
          if (v?.picture) coverUrls.push(v.picture);
        } catch { /* a creative on a page we do not own stays coverless */ }
      }
      /* RESOLVED 2026-08-30 by granting the system user page access. Kept because
       * it explains the shape of the code above and what still cannot work.
       * WHY VIDEO ADS SHOWED A POOR COVER IMAGE (measured 2026-08-30, Lucky Golf).
       * NOT because they are page posts — the STATICS are page posts too, from
       * the SAME page (2043316342580398), and they return a perfectly good
       * image_url. The difference is that a VIDEO object requires page-level
       * permission while an image URL is served straight off the CDN.
       * Our token is the "Mobius Tools" user carrying ads_read +
       * business_management + public_profile; `me/accounts` is empty and BOTH
       * pages seen here read back as "does not exist, cannot be loaded due to
       * missing permission". So the video creative comes back as object_type
       * PRIVACY_CHECK_FAIL with no image_url, `/{video_id}` is unreadable, and
       * Meta substitutes the PAGE AVATAR as thumbnail_url — which is why three
       * of Lucky's four video ads shared one identical clover logo.
       * Two different pages appear across these ads (2043316342580398 and
       * 100526684753365), so some creatives may be partner/creator-sourced;
       * a page we are never granted stays unreadable.
       * Proof the mechanism is permission and not the field: the ad account's
       * OWN 669 videos DO return a real `source` mp4.
       * THE FIX, applied: the six brand pages were assigned to the Mobius Tools
       * system user and its token regenerated with pages_read_engagement +
       * pages_show_list. Verified after: object_type is VIDEO instead of
       * PRIVACY_CHECK_FAIL, `picture` returns a real cover frame, and all six
       * pages resolve by name. Ads insights still read exactly as before.
       * STILL IMPOSSIBLE, by design not by bug: page 100526684753365 carries one
       * of Lucky's video ads and is NOT one of our six — a creator/partner page.
       * Anything on a page we are not granted stays coverless and unplayable, so
       * this whole block must keep degrading quietly rather than throwing.
       * PLAYBACK: `source` is still withheld from the USER token; it needs a
       * PAGE-scoped token from me/accounts. Verified working. */
      // `image_url` is the ORIGINAL static creative — real resolution, real aspect
      // ratio, no square crop — so it is tried first and `thumbnail_url` is the
      // fallback. Video ads have no image_url at all (see the note below).
      const sources = [...coverUrls, c?.image_url, c?.thumbnail_url].filter(Boolean);
      let picked = null;
      for (const src of sources) {
        try {
          const img = await xfetch(src);
          if (!img.ok) continue;
          const buf = await img.arrayBuffer();
          if (buf.byteLength > maxBytes || buf.byteLength * 1.34 > budget) continue;   // too big: fall through to a smaller source
          // Chunked: spreading a 250k array into String.fromCharCode blows the stack.
          const bytes = new Uint8Array(buf);
          let bin = '';
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
          picked = { b64: btoa(bin), type: img.headers.get('content-type') || 'image/jpeg' };
          break;
        } catch { /* try the next source */ }
      }
      if (!picked) { out[id].thumb = null; continue; }
      budget -= picked.b64.length;
      // Assign the field, never the object — the ad's copy and metadata are
      // already on it, and replacing it here silently dropped all of them.
      out[id].thumb = `data:${picked.type};base64,${picked.b64}`;
    } catch { /* no creative for this ad; the card still renders its numbers */ }
  }
  /* Persist what we learned. Costs one batch, saves a Meta call per ad on every
     future filter, and means an ad only has to be LOOKED at once for its type
     to be known. Best-effort - a failure here must never break the cards. */
  try {
    const st = Object.entries(out).filter(([, v]) => v.media_type)
      .map(([id, v]) => env.DB.prepare(`UPDATE ads SET media_type = ?2 WHERE ad_id = ?1`).bind(id, v.media_type));
    if (st.length) await env.DB.batch(st);
  } catch { /* the cards do not depend on this */ }
  // Cache what we just fetched, one row at a time so a single oversized
  // creative cannot fail the whole batch and lose the others.
  for (const id of missing) {
    const v = out[id]; if (!v) continue;
    try {
      const j = JSON.stringify(v);
      /* Was 90,000, which no image that passed the 190KB fetch ceiling could
         ever satisfy — base64 is 1.34x, so a 190KB image is a 254KB string and
         every one of them was silently dropped from the cache and refetched
         from Meta forever. 400,000 covers the largest image either caller will
         now accept. D1 is still not an image host: anything above this is
         served once and not kept. */
      if (j.length > 400_000) continue;
      await env.DB.prepare(
        `INSERT INTO ad_creative (ad_id, json, fetched_at) VALUES (?1,?2,datetime('now'))
         ON CONFLICT(ad_id) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at`).bind(id, j).run();
    } catch { /* best effort */ }
  }
  return out;
}

/** Everything a weekly/monthly report shows, frozen. `start`..`end` inclusive. */
async function reportData(env, acct, period, start, end) {
  const prevStart = period === 'weekly' ? addDays(start, -7) : `${prevMonth(monthOf(start))}-01`;
  const prevEnd = addDays(start, -1);
  const ymEnd = monthOf(end);
  const monthStart = `${ymEnd}-01`;
  const histFrom = addDays(prevStart < monthStart ? prevStart : monthStart, -29);   // covers the trailing-28d margin window AND month-to-date
  const { results: twRows } = await env.DB.prepare(
    `SELECT date, metric, value FROM tw_daily WHERE act_id = ?1 AND date >= ?2 AND date <= ?3`,
  ).bind(acct.act_id, histFrom, end).all();
  const piv = {};
  for (const r of twRows) (piv[r.metric] ??= {})[r.date] = r.value;
  const { results: metaRows } = await env.DB.prepare(
    `SELECT date, spend, impressions, clicks, link_clicks, purchases, revenue FROM daily_insights
     WHERE act_id = ?1 AND date >= ?2 AND date <= ?3`,
  ).bind(acct.act_id, histFrom, end).all();
  const metaBy = Object.fromEntries(metaRows.map(r => [r.date, r]));

  const gjson = safeJson(acct.goals_json, {});
  const cmPct = goalsFor(acct, ymEnd)?.cm_pct ?? null;

  // The same COGS trust gate as the Daily Brief: a client whose cost data is
  // broken must never see a Contribution Margin in a report with their name on it.
  const dayMargins = []; let mNum = 0, mDen = 0;
  for (let i = 1; i <= 28; i++) {
    const d = addDays(start, -i);
    const r = econDay(piv, metaBy, d, null);
    if (r && r.gp != null && r.sales > 0) { dayMargins.push(r.gp / r.sales); mNum += r.gp; mDen += r.sales; }
  }
  const margin28 = mDen > 0 ? mNum / mDen : null;
  const cogsQuality = cmPct != null
    ? { verdict: 'override', reason: `using the ${Math.round(cmPct * 100)}% margin override` }
    : judgeCogs(dayMargins, margin28);
  const cmOk = cmPct != null || (cogsQuality.verdict !== 'broken' && cogsQuality.verdict !== 'none');

  const curDates = [], prevDates = [];
  for (let d = start; d <= end; d = addDays(d, 1)) curDates.push(d);
  for (let d = prevStart; d <= prevEnd; d = addDays(d, 1)) prevDates.push(d);
  const days = curDates.map(d => econDay(piv, metaBy, d, cmPct)).filter(Boolean);
  const prevDays = prevDates.map(d => econDay(piv, metaBy, d, cmPct)).filter(Boolean);
  const cur = periodTotals(days);
  const prev = periodTotals(prevDays);
  if (!cmOk) {
    for (const t of [cur, prev]) { t.cm = null; t.gp = null; t.margin = null; }
    for (const r of days) { r.cm = null; r.gp = null; r.margin = null; }
  }

  // The plan for these exact days. Each day inherits ITS OWN month's goals,
  // spread evenly — the agreed convention — so a week straddling a month
  // boundary is measured against both months' plans, pro-rated.
  const fcMargin = cmPct ?? margin28;
  let fSales = null, fSpend = null;
  const monthsSeen = {};
  for (const d of curDates) {
    const ym = monthOf(d);
    const g = goalsFor(acct, ym);
    monthsSeen[ym] ??= { planned: !!gjson[ym], has_goals: !!g };
    if (!g) continue;
    const dim = daysInMonth(d);
    if (g.sales != null) fSales = (fSales ?? 0) + g.sales / dim;
    if (g.spend != null) fSpend = (fSpend ?? 0) + g.spend / dim;
  }
  const forecast = {
    sales: fSales, spend: fSpend,
    mer: fSales != null && fSpend ? fSales / fSpend : null,
    amer: goalsFor(acct, ymEnd)?.amer ?? null,
    cm: cmOk && fSales != null && fSpend != null && fcMargin != null ? fSales * fcMargin - fSpend : null,
    months: monthsSeen,
  };

  // Weekly reports carry a forward look: where the month stands after this week.
  let pacing = null;
  if (period === 'weekly') {
    const mtdRows = [];
    for (let d = monthStart; d <= end; d = addDays(d, 1)) { const r = econDay(piv, metaBy, d, cmPct); if (r) mtdRows.push(r); }
    const mtd = periodTotals(mtdRows);
    const gEnd = goalsFor(acct, ymEnd);
    if (gEnd && (gEnd.sales != null || gEnd.spend != null)) {
      const dim = daysInMonth(end);
      const elapsed = Math.min(+end.slice(8, 10), dim);
      const share = elapsed / dim;
      const planToDate = gEnd.sales != null ? gEnd.sales * share : null;
      pacing = {
        month: ymEnd, days_elapsed: elapsed, days_in_month: dim,
        goal_sales: gEnd.sales ?? null, goal_spend: gEnd.spend ?? null,
        plan_to_date: planToDate, spend_plan_to_date: gEnd.spend != null ? gEnd.spend * share : null,
        mtd_sales: mtd.sales, mtd_spend: mtd.spend,
        // Plan-share projection when a plan exists (how the Daily Brief projects),
        // plain run-rate otherwise.
        projected: mtd.sales != null && planToDate > 0 ? mtd.sales / planToDate * gEnd.sales
          : mtd.sales != null && elapsed > 0 ? mtd.sales / elapsed * dim : null,
        planned: !!gjson[ymEnd],
      };
      // Saying a month is behind is half the job. The other half is the ask: what
      // it takes from here. Returning revenue arrives on its own, so the shortfall
      // has to be bought with new customers, which costs spend. Priced off THIS
      // MONTH's own returning rate and aMER - the report states the window, and a
      // month-to-date basis is the one both sides of the call can see.
      const remain = dim - elapsed;
      if (gEnd.sales != null && remain > 0 && mtd.sales != null) {
        const retPerDay = mtd.ret_rev != null && elapsed > 0 ? mtd.ret_rev / elapsed : null;
        const mAmer = mtd.new_rev != null && mtd.spend > 0 ? mtd.new_rev / mtd.spend : null;
        const spendPerDay = mtd.spend != null && elapsed > 0 ? mtd.spend / elapsed : null;
        const shortfall = gEnd.sales - mtd.sales;
        const perDay = shortfall / remain;
        const newPerDay = perDay - (retPerDay || 0);
        const spendNeeded = mAmer && newPerDay > 0 ? newPerDay / mAmer : null;
        pacing.to_hit = {
          days_remaining: remain,
          revenue_per_day: perDay,
          new_per_day: newPerDay,
          spend_per_day: spendNeeded,
          spend_now_per_day: spendPerDay,
          spend_ramp: spendNeeded != null && spendPerDay > 0 ? spendNeeded / spendPerDay : null,
          amer: mAmer,
          returning_per_day: retPerDay,
          already_there: shortfall <= 0,
          covered_by_returning: newPerDay <= 0,
        };
      }
    }
  }

  // Monthly reports get the month cut into weeks instead — how it actually ran.
  let weeks = null;
  if (period === 'monthly') {
    weeks = [];
    for (let ws = start; ws <= end; ws = addDays(ws, 7)) {
      const we = addDays(ws, 6) <= end ? addDays(ws, 6) : end;
      const rows = days.filter(r => r.date >= ws && r.date <= we);
      if (rows.length) {
        const t = periodTotals(rows);
        weeks.push({ from: ws, to: we, sales: t.sales, spend: t.spend, mer: t.mer });
      }
    }
  }

  const cfg = safeJson(acct.report_config_json, {});
  // One Triple Whale call per window. TW computes the period ratios itself, so
  // CPM, CTR and its peer benchmarks arrive correct rather than being
  // reconstructed from daily rows that do not carry them.
  let twCur = null, twPrev = null;
  if (acct.tw_shop && env.TW_API_KEY) {
    // twWindow, never twSummary - see the comment on twWindow. The raw call is
    // shifted a day, which silently made every report cover Sun-Sat.
    twCur = (await twWindow(env, acct.tw_shop, start, end).catch(() => null))?.map ?? null;
    twPrev = (await twWindow(env, acct.tw_shop, prevStart, prevEnd).catch(() => null))?.map ?? null;
  }
  const channels = channelSections(piv, metaBy, { cur: curDates, prev: prevDates }, Array.isArray(cfg.hide) ? cfg.hide : [], twCur, twPrev);

  // Where the Meta money went: top ads by spend behind a materiality floor, so
  // a $40 fluke can never headline. Deliberately framed as "where the budget
  // went and what it did", not "the best ad" — a single crown is unjudgeable.
  let ads = null;
  // Ads that carried real money this period. Used twice: to build the creative
  // table, and to decide which on/off changes are worth naming in the change
  // log. ONE definition of "big", so the two sections can never disagree.
  const bigAdIds = new Set();
  const adSpendById = {};
  const metaSpend = cur.meta_spend ?? 0;
  if (metaSpend > 0) {
    // No LIMIT: the long tail has to be counted, not dropped. A week can carry
    // 150+ ads, of which a handful hold most of the spend - showing only those
    // and saying nothing about the rest implies the table is the whole account.
    const { results: adRows } = await env.DB.prepare(
      `SELECT d.ad_id, SUM(d.spend) AS spend, SUM(d.purchases) AS purchases, SUM(d.revenue) AS revenue,
              SUM(d.impressions) AS impressions, SUM(d.link_clicks) AS clicks,
              SUM(d.video_3s) AS v3, SUM(d.video_thruplay) AS vtp, SUM(d.video_p100) AS vp100,
              SUM(d.reach) AS reach, SUM(d.clicks_all) AS clicks_all, SUM(d.outbound_clicks) AS outbound,
              SUM(d.video_p25) AS vp25, SUM(d.video_p50) AS vp50, SUM(d.video_p75) AS vp75, SUM(d.video_plays) AS plays,
              -- avg watch time is an average, so it is weighted by impressions
              -- rather than summed; summing would grow with the window length.
              CASE WHEN SUM(d.impressions) > 0
                   THEN SUM(d.video_avg_watch * d.impressions) / SUM(d.impressions) END AS avg_watch,
              COALESCE(a.name, d.ad_id) AS name
       FROM ad_daily d LEFT JOIN ads a ON a.act_id = d.act_id AND a.ad_id = d.ad_id
       WHERE d.act_id = ?1 AND d.date >= ?2 AND d.date <= ?3
       GROUP BY d.ad_id HAVING SUM(d.spend) > 0 ORDER BY spend DESC LIMIT 500`,
    ).bind(acct.act_id, start, end).all();
    // The SAME ads in the prior period, so each card can say whether it is being
    // scaled or wound down. A card without this reads as a snapshot with no
    // direction, which is the thing a weekly report exists to show.
    const { results: prevAdRows } = await env.DB.prepare(
      `SELECT d.ad_id, SUM(d.spend) AS spend, SUM(d.purchases) AS purchases, SUM(d.revenue) AS revenue
       FROM ad_daily d WHERE d.act_id = ?1 AND d.date >= ?2 AND d.date <= ?3
       GROUP BY d.ad_id HAVING SUM(d.spend) > 0`,
    ).bind(acct.act_id, prevStart, prevEnd).all();
    const prevById = Object.fromEntries(prevAdRows.map(r => [r.ad_id, r]));
    const floor = Math.max(50, metaSpend * 0.03);
    const TOP_N = 10;
    const qualified = adRows.filter(r => r.spend >= floor);
    for (const r of adRows) adSpendById[r.ad_id] = r.spend;
    for (const r of qualified) bigAdIds.add(r.ad_id);
    const shown = qualified.slice(0, TOP_N);
    const previews = await adPreviewLinks(env, shown.map(r => r.ad_id)).catch(() => ({}));
    const thumbs = await adThumbnails(env, shown.map(r => r.ad_id)).catch(() => ({}));
    const row = r => ({
      name: r.name, spend: r.spend, purchases: r.purchases || null, revenue: r.revenue || null,
      cpa: r.purchases ? r.spend / r.purchases : null,
      roas: r.spend && r.revenue ? r.revenue / r.spend : null,
      share: metaSpend ? r.spend / metaSpend : null,
      // Motion's scroll-stopping pair. Hook = 3-second views ÷ impressions (did
      // it stop the scroll); hold = ThruPlay ÷ 3-second views (did it earn the
      // watch). Gated on v3 > 0 so rows synced before the video columns existed
      // read as "no data", never as a 0% hook rate.
      ctr: r.impressions && r.clicks ? r.clicks / r.impressions : null,
      hook: r.impressions && r.v3 ? r.v3 / r.impressions : null,
      hold: r.v3 ? (r.vtp || 0) / r.v3 : null,
      completion: r.v3 ? (r.vp100 || 0) / r.v3 : null,   // watched to the end, of those it stopped
      // Cost and efficiency, the rest of what a creative review asks for.
      cpm: r.impressions ? r.spend / r.impressions * 1000 : null,
      cpc: r.clicks ? r.spend / r.clicks : null,
      // How many of the people it sent to the site actually bought. The clearest
      // separator of "the creative works" from "the offer works".
      cvr: r.clicks ? (r.purchases || 0) / r.clicks : null,
      aov: r.purchases ? (r.revenue || 0) / r.purchases : null,
      frequency: r.reach ? r.impressions / r.reach : null,
      reach: r.reach || null,
      // Cost to stop one thumb — spend over 3-second views. Directly comparable
      // between video ads in a way CPM is not.
      cost_per_thumbstop: r.v3 ? r.spend / r.v3 : null,
      avg_watch: r.avg_watch ?? null,
      // Retention is a share of video PLAYS, not of 3-second views. Dividing by
      // 3-second views reported 150% at the 25% mark, because on a 7-second
      // video the 25% point (1.75s) is reached before the 3-second one is.
      // Older reports have no `plays`, so they fall back and stay capped.
      retention: (r.plays || r.v3) ? (den => ({
        p25: Math.min(1, (r.vp25 || 0) / den), p50: Math.min(1, (r.vp50 || 0) / den),
        p75: Math.min(1, (r.vp75 || 0) / den), p100: Math.min(1, (r.vp100 || 0) / den),
        basis: r.plays ? 'plays' : 'three_second_views',
      }))(r.plays || r.v3) : null,
      plays: r.plays || null,
      preview: previews[r.ad_id] || null,
      thumb: thumbs[r.ad_id]?.thumb || null,
      video: !!thumbs[r.ad_id]?.video,
      ad_id: r.ad_id,
      // Kept so playback can skip a Meta round trip. The mp4 URL itself is
      // deliberately NOT stored — it is signed and expires within hours.
      video_id: thumbs[r.ad_id]?.video_id || null,
      page_id: thumbs[r.ad_id]?.page_id || null,
      duration: thumbs[r.ad_id]?.duration ?? null,
      // The ad's own words, plus where it lives — everything the detail view needs
      // is frozen with the numbers, so an archived report stays complete.
      headline: thumbs[r.ad_id]?.headline || null,
      body: thumbs[r.ad_id]?.body || null,
      description: thumbs[r.ad_id]?.description || null,
      cta: thumbs[r.ad_id]?.cta || null,
      status: thumbs[r.ad_id]?.status || null,
      created: thumbs[r.ad_id]?.created || null,
      campaign: thumbs[r.ad_id]?.campaign || null,
      adset: thumbs[r.ad_id]?.adset || null,
      impressions: r.impressions || null,
      clicks: r.clicks || null,
      prev_spend: prevById[r.ad_id]?.spend ?? null,
      prev_roas: prevById[r.ad_id]?.spend && prevById[r.ad_id]?.revenue
        ? prevById[r.ad_id].revenue / prevById[r.ad_id].spend : null,
      prev_cpa: prevById[r.ad_id]?.purchases
        ? prevById[r.ad_id].spend / prevById[r.ad_id].purchases : null,
    });
    // Format split from the account's own naming convention — "310 B | Still",
    // "Cole - 3 | UGC". The segment after the last pipe is the format, so no
    // tagging UI is needed. Computed over EVERY ad that spent, same
    // 100%-accounting rule as the cards.
    //
    // The convention is real but not clean, and the guards below come from
    // measuring it rather than assuming it. On Lucky's 2026-08-17 week the
    // tags are UGC ($2,222), Still ($1,456) and `0616` ($504) — the last a
    // shoot code, not a format — while 46 ads carrying $1,283 have no pipe at
    // all. So: a tag must contain a LETTER (a pure number is a date or a job
    // code, never a format), and a tag holding under 4% of ad spend is a
    // one-off rather than a category. Everything rejected joins Untagged,
    // which is always shown — disclosing the coverage beats gating on it.
    const UNTAGGED = 'Untagged';
    const fmtOf = n => {
      const m = /\|([^|]+)$/.exec(n || '');
      const label = m ? m[1].trim() : '';
      return label && label.length <= 24 && /[a-z]/i.test(label) ? label : null;
    };
    const totalAdSpend = adRows.reduce((a, r) => a + (r.spend || 0), 0);
    const tally = (rows, keyOf) => {
      const by = {};
      for (const r of rows) {
        const label = keyOf(r);
        const f = by[label.toLowerCase()] ??= { label, count: 0, spend: 0, purchases: 0, revenue: 0 };
        f.count++; f.spend += r.spend || 0; f.purchases += r.purchases || 0; f.revenue += r.revenue || 0;
      }
      return by;
    };
    // First pass finds which tags carry material spend; the second pass folds
    // the rest in, so their purchases and revenue land in Untagged too.
    const firstPass = tally(adRows, r => fmtOf(r.name) || UNTAGGED);
    const material = new Set(Object.values(firstPass)
      .filter(f => f.label !== UNTAGGED && totalAdSpend && f.spend / totalAdSpend >= 0.04)
      .map(f => f.label.toLowerCase()));
    const byFmt = tally(adRows, r => {
      const label = fmtOf(r.name);
      return label && material.has(label.toLowerCase()) ? label : UNTAGGED;
    });
    const fin = f => ({
      ...f,
      share: totalAdSpend ? f.spend / totalAdSpend : null,
      cpa: f.purchases ? f.spend / f.purchases : null,
      roas: f.spend && f.revenue ? f.revenue / f.spend : null,
    });
    // Untagged always sits last — it is the remainder, not a competitor.
    const named = Object.values(byFmt).filter(f => f.label !== UNTAGGED).sort((a, b) => b.spend - a.spend).map(fin);
    const untagged = byFmt[UNTAGGED.toLowerCase()] ? fin(byFmt[UNTAGGED.toLowerCase()]) : null;
    const formats = untagged ? [...named, untagged] : named;
    const taggedShare = totalAdSpend ? named.reduce((a, f) => a + f.spend, 0) / totalAdSpend : 0;
    // Everything not listed, as one line, so the table accounts for 100% of
    // ad-level spend and the tail can be compared with the headline ads.
    const shownSet = new Set(shown.map(r => r.ad_id));
    const rest = adRows.filter(r => !shownSet.has(r.ad_id));
    const restSpend = rest.reduce((a, r) => a + (r.spend || 0), 0);
    const restPur = rest.reduce((a, r) => a + (r.purchases || 0), 0);
    const restRev = rest.reduce((a, r) => a + (r.revenue || 0), 0);
    const standout = qualified.filter(r => r.purchases >= 3)
      .sort((a, b) => (a.spend / a.purchases) - (b.spend / b.purchases))[0] || null;
    if (shown.length) ads = {
      floor, top: shown.map(row),
      // Needs 2+ material formats and a majority of ad spend tagged; below that
      // the split describes the naming convention rather than the creative.
      // Lucky's flagship week runs 67% tagged, so a stricter bar would suppress
      // exactly the case this was built for.
      formats: named.length >= 2 && taggedShare >= 0.55 ? formats : null,
      formats_tagged_share: named.length >= 2 && taggedShare >= 0.55 ? taggedShare : null,
      // This account's OWN typical hook and hold, so an ad can be judged against
      // what this brand actually achieves rather than a generic e-commerce
      // benchmark. Motion's 30%/60% vary enormously by vertical, placement and
      // video length, and the decision a buyer makes is "is this better than our
      // normal", not "is this better than the internet".
      // Median, not mean — one runaway ad should not move the bar. Needs at
      // least 4 video ads or it is noise, and the UI falls back to the published
      // benchmark and says so.
      benchmarks: (() => {
        const hooks = [], holds = [];
        for (const r of qualified) {
          if (r.impressions && r.v3) hooks.push(r.v3 / r.impressions);
          if (r.v3) holds.push((r.vtp || 0) / r.v3);
        }
        const med = a => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null;
        return hooks.length >= 4 ? { hook: med(hooks), hold: med(holds), n: hooks.length } : null;
      })(),
      qualified_total: qualified.length,
      others: rest.length ? {
        count: rest.length, spend: restSpend, purchases: restPur || null, revenue: restRev || null,
        cpa: restPur ? restSpend / restPur : null,
        roas: restSpend && restRev ? restRev / restSpend : null,
        share: metaSpend ? restSpend / metaSpend : null,
        biggest: rest[0]?.spend ?? null,
      } : null,
      total_ads: adRows.length, total_spend: adRows.reduce((a, r) => a + (r.spend || 0), 0),
      standout: standout ? { name: standout.name, cpa: standout.spend / standout.purchases, spend: standout.spend } : null,
    };
  }

  // What we changed during the period — feeds the narrative and the internal
  // view. NOT sent to the client's payload (the profit worker strips it).
  //
  // Ranked by MATERIALITY, never by time. Taking the first N chronologically fed
  // the narrative fourteen rows of Meta's own review-state churn ("Pending
  // Process -> Pending Review") purely because those fire first on a launch day,
  // while the week's actual budget moves never made the list. `other` and `name`
  // are dropped outright: image-library edits and renames are not decisions.
  // Routine creative/tuning work is COUNTED rather than listed - a week with 58
  // new ads produces a report nobody reads if each one gets a line.
  const { results: evs } = await env.DB.prepare(
    `SELECT event_time, category, summary, reason, object_id FROM activities
     WHERE act_id = ?1 AND event_time >= ?2 AND event_time <= ?3 AND confirmed != -1
       AND category NOT IN ('other','name')
     ORDER BY event_time ASC LIMIT 400`,
  ).bind(acct.act_id, start, end + 'T23:59:59').all();
  // `billing` is deliberately NOT notable: "Account billed" is Meta charging the
  // card, not a decision we made, and it was crowding out real moves. `review`
  // stays — a policy rejection genuinely changes what can deliver.
  const notableCats = new Set(['budget', 'bid_strategy', 'new_campaign', 'new_adset',
    'campaign_paused', 'campaign_relaunched', 'review']);
  // Switching ONE ad on or off among 150 is routine and belongs in the count.
  // Doing it to an ad that was carrying real budget is a decision, and burying
  // that inside "64 ads relaunched" hides the most interesting thing we did.
  // Threshold is the SAME floor the creative table uses, so "big" means one
  // thing in this report rather than two.
  const AD_CATS = new Set(['ad_paused', 'ad_relaunched', 'new_creative']);
  const isBigAdMove = e => AD_CATS.has(e.category) && e.object_id && bigAdIds.has(e.object_id);
  const notableAll = evs.filter(e => notableCats.has(e.category) || isBigAdMove(e));
  const rollup = {};
  for (const e of evs) if (!notableCats.has(e.category) && !isBigAdMove(e)) rollup[e.category] = (rollup[e.category] ?? 0) + 1;
  const changes = {
    notable: notableAll.slice(0, 14).map(e => ({
      t: String(e.event_time).slice(0, 10), category: e.category, summary: e.summary, reason: e.reason,
      spend: isBigAdMove(e) ? (adSpendById[e.object_id] ?? null) : null,
    })),
    notable_total: notableAll.length,
    rollup,
    total: evs.length,
    ad_floor: bigAdIds.size ? Math.max(50, metaSpend * 0.03) : null,
  };

  return {
    account: { act_id: acct.act_id, name: acct.name, currency: acct.currency },
    period, start, end, prev_start: prevStart, prev_end: prevEnd,
    totals: cur, previous: prev, forecast, pacing, weeks, channels, ads,
    changes, changes_total: evs.length,
    chart: days.map(r => ({ date: r.date, sales: r.sales, spend: r.spend })),
    cm_ok: cmOk, cogs_quality: cogsQuality, margin_28d: margin28, cm_pct: cmPct,
    generated_at: new Date().toISOString(),
  };
}

const REPORT_SYSTEM = `You are a senior media buyer at Mobius Digital writing the executive summary of a client's WEEKLY or MONTHLY performance report. The report page already shows every number in cards and tables — do NOT restate them as a list.
Write exactly three sections, plain text, section titles on their own line exactly as written:
The period in brief
2–4 sentences: what happened and the single interpretation that best explains it. Lead with the conclusion. Name only the one or two numbers that matter most (with their % vs plan or vs the prior period).
What mattered
• 3–5 bullets: beats/misses vs plan with the %, the trend vs the prior period, the new-vs-returning read, per-channel reads, and — when the change log supports it — which of our changes drove what. Conclusion first in every bullet.
What's next
• 2–4 bullets: concrete actions or watch-items for the coming period, each with a trigger or a date where possible.
Rules: use ONLY the numbers provided — never invent or extrapolate figures. Money in the account's own currency, whole units. MER = ALL store revenue (every channel, not ad-attributed) ÷ ALL ad spend on every platform; aMER = new-customer revenue ÷ that same spend. Both are blended on BOTH sides — never call them attributed, and never confuse them with ROAS (which IS platform-attributed, double-counts across platforms, and should be treated as directional). Write for the client: confident, plain language, no hedging filler. Under 230 words total. No greeting, no sign-off, no markdown headers, no asterisks for bold.`;

async function writeReportNarrative(env, acct, data) {
  const f2 = n => n == null ? '—' : String(Math.round(n * 100) / 100);
  const label = data.period === 'weekly' ? 'week' : 'month';
  const slim = t => t ? { sales: f2(t.sales), spend: f2(t.spend), orders: t.orders, mer: f2(t.mer), amer: f2(t.amer), aov: f2(t.aov), new_customer_cpa: f2(t.ncpa), new_share: f2(t.new_share), cm: f2(t.cm) } : null;
  const chLines = (data.channels || []).map(c => `- ${c.label}: ${JSON.stringify(c.cur)} | prior ${label}: ${JSON.stringify(c.prev)}`);
  const adLines = (data.ads?.top || []).slice(0, 5).map(a => `- ${a.name}: spend ${f2(a.spend)} (${Math.round((a.share || 0) * 100)}% of Meta), CPA ${f2(a.cpa)}, ROAS ${f2(a.roas)}`
    + (a.hook != null ? `, hook rate ${Math.round(a.hook * 100)}% (3s views/impressions; 30-40% is typical)` : '')
    + (a.hold != null ? `, hold rate ${Math.round(a.hold * 100)}% (ThruPlay/3s views; 40-50% is typical)` : ''));
  const fmtLines = (data.ads?.formats || []).map(f => `- ${f.label}: ${f.count} ads, spend ${f2(f.spend)} (${Math.round((f.share || 0) * 100)}%), CPA ${f2(f.cpa)}, ROAS ${f2(f.roas)}`);
  // Notable changes individually; routine churn as counts. Feeding the model 14
  // rows of "new ad" made it write about ad names instead of about the money.
  const ch = data.changes || {};
  const evLines = (Array.isArray(ch) ? ch : ch.notable || [])
    .map(e => `- ${e.t} [${e.category}] ${e.summary}${e.reason ? ` {${e.reason}}` : ''}`);
  const rollLine = !Array.isArray(ch) && ch.rollup && Object.keys(ch.rollup).length
    ? Object.entries(ch.rollup).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(', ')
    : null;
  const unplanned = Object.entries(data.forecast?.months || {}).filter(([, m]) => !m.planned && m.has_goals);
  return claude(env, {
    system: REPORT_SYSTEM,
    maxTokens: 6000,   // opus-5 spends thinking tokens inside max_tokens; leave real headroom
    user: `Client: ${acct.name} (currency ${acct.currency}). ${data.period === 'weekly' ? 'Weekly' : 'Monthly'} report covering ${data.start} → ${data.end}.\n` +
      `This ${label}: ${JSON.stringify(slim(data.totals))}\n` +
      `Prior ${label} (${data.prev_start} → ${data.prev_end}): ${JSON.stringify(slim(data.previous))}\n` +
      `Plan for the period: ${JSON.stringify({ sales: f2(data.forecast?.sales), spend: f2(data.forecast?.spend), mer: f2(data.forecast?.mer), cm: f2(data.forecast?.cm) })}\n` +
      (unplanned.length ? `IMPORTANT: no plan was actually set for ${unplanned.map(([ym]) => ym).join(', ')} — the "plan" figures are carried over from an earlier month. Do not present them as an agreed target; refer to them as the prior pace.\n` : '') +
      (data.cm_ok ? '' : `IMPORTANT: this client's cost data is unreliable (${data.cogs_quality?.reason}). Contribution margin has been removed from the report — do NOT mention margin, CM or profit anywhere.\n`) +
      (data.pacing ? `Where the month stands after this week (${data.pacing.month}): MTD sales ${f2(data.pacing.mtd_sales)} vs ${f2(data.pacing.plan_to_date)} planned by now; projected ${f2(data.pacing.projected)} against the ${f2(data.pacing.goal_sales)} goal.\n` : '') +
      `Channels — each platform's OWN attributed revenue/ROAS, NOT Triple Whale's; a line marked low_signal recorded fewer than two conversions in the whole window, so quote its spend and say the conversions have not landed rather than repeating the ratio. There is no per-platform ROAS target: the agreed goals are the blended ones above. Never judge a platform's ROAS against the MER goal (blended MER counts every channel's revenue over total spend and is always higher, so that reports a healthy account as failing). Use these to say which channel moved, not to declare a target missed:\n${chLines.join('\n') || '- (none)'}\n` +
      `Top Meta ads by spend:\n${adLines.join('\n') || '- (none)'}\n` +
      (fmtLines.length ? `Meta spend by creative format (from the ad naming convention — covers every ad that spent):\n${fmtLines.join('\n')}\n` : '') +
      `Budget, bidding and structural changes we made during the period:\n${evLines.join('\n') || '- (none)'}\n` +
      (rollLine ? `Routine activity in the same period (counts only, do not list these individually): ${rollLine}.\n` : ''),
  });
}

const repMoney = (n, cur) => n == null ? '—' : new Intl.NumberFormat('en-US',
  { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(n);
const repPctVs = (a, b) => a != null && b ? `${a >= b ? '+' : ''}${Math.round((a / b - 1) * 100)}%` : null;

/** The one-line summary used in both Slack messages. */
function reportHeadline(data) {
  const cur = data.account.currency, t = data.totals;
  const tag = data.period === 'weekly' ? 'week' : 'month';
  const vsPlan = repPctVs(t.sales, data.forecast?.sales);
  const vsPrev = repPctVs(t.sales, data.previous?.sales);
  const rev = `Revenue ${repMoney(t.sales, cur)}${vsPlan || vsPrev
    ? ` (${[vsPlan && `${vsPlan} vs plan`, vsPrev && `${vsPrev} vs prior ${tag}`].filter(Boolean).join(', ')})` : ''}`;
  const bits = [rev, `Spend ${repMoney(t.spend, cur)}`, `MER ${t.mer != null ? t.mer.toFixed(2) + 'x' : '—'}`];
  if (t.cm != null) bits.push(`CM ${repMoney(t.cm, cur)}`);
  return bits.join(' · ');
}

/** Build (or rebuild) one report as a DRAFT. A sent report is frozen — the
 *  client already has its numbers, so regeneration refuses. */
async function makeReport(env, acct, period, start, { force = false } = {}) {
  if (period !== 'weekly' && period !== 'monthly') throw new Error('period must be weekly or monthly');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '')) throw new Error('start must be YYYY-MM-DD');
  if (period === 'monthly' && start.slice(8) !== '01') throw new Error('a monthly report starts on the 1st');
  const end = period === 'weekly' ? addDays(start, 6)
    : `${monthOf(start)}-${String(daysInMonth(start)).padStart(2, '0')}`;
  const prior = await env.DB.prepare(
    `SELECT status FROM reports WHERE act_id = ?1 AND period = ?2 AND period_start = ?3`,
  ).bind(acct.act_id, period, start).first();
  if (prior?.status === 'sent') throw new Error('this report was already sent to the client — sent reports are frozen');
  const data = await reportData(env, acct, period, start, end);
  const expected = Math.round((new Date(end + 'T12:00:00Z') - new Date(start + 'T12:00:00Z')) / 86400e3) + 1;
  const missing = expected - (data.totals.days ?? 0);
  if (data.totals.sales == null) throw new Error('no Triple Whale data for this period — refresh Triple Whale data first');
  if (missing > 0 && !force) throw new Error(`Triple Whale data is missing for ${missing} of the ${expected} days — refresh Triple Whale data and regenerate (or generate anyway)`);
  data.missing_days = missing;
  let summary = null, narrative_error = null;
  try { summary = await writeReportNarrative(env, acct, data); } catch (e) { narrative_error = e.message; }
  await env.DB.prepare(
    `INSERT INTO reports (act_id, period, period_start, period_end, status, generated_at, summary, data_json)
     VALUES (?1,?2,?3,?4,'draft',?5,?6,?7)
     ON CONFLICT(act_id, period, period_start) DO UPDATE SET period_end = excluded.period_end,
       status = 'draft', generated_at = excluded.generated_at, summary = excluded.summary,
       data_json = excluded.data_json, sent_at = NULL, sent_channel = NULL`,
  ).bind(acct.act_id, period, start, end, new Date().toISOString(), summary, JSON.stringify(data)).run();
  return { period, start, end, summary, data, narrative_error };
}

/** One stable client link per brand — opens their report archive (sent reports
 *  only, rendered by the profit dashboard). Same pattern as shareTokens. */
async function reportToken(env, actId) {
  const tokens = safeJson(await getSetting(env, 'reportTokens'), {});
  let tok = Object.keys(tokens).find(k => tokens[k].act_id === actId);
  if (!tok) {
    tok = crypto.randomUUID().replace(/-/g, '');
    tokens[tok] = { act_id: actId, created: new Date().toISOString() };
    await putSetting(env, 'reportTokens', JSON.stringify(tokens));
  }
  return tok;
}

/** Internal review post. Deliberately NEVER falls back to slack_channel or
 *  brief_channel — as of 2026-08-27 every brand's alerts channel IS its client
 *  channel, so a "fallback" would put a draft in front of the client. No
 *  internal channel and no global reportChannel setting = no post; the draft
 *  still exists in the Reports tab. */
async function postReportDraft(env, acct, r) {
  const channel = acct.slack_channel || await getSetting(env, 'reportChannel');
  if (!channel) return { skipped: 'no internal reports channel configured for this brand' };
  const label = r.period === 'weekly' ? 'Weekly' : 'Monthly';
  const link = `${DASHBOARD_URL}?open=reports&act=${encodeURIComponent(acct.act_id)}`;
  await slackPost(env, channel,
    `:clipboard: *${label} report drafted — ${acct.name}* (${prettyDate(r.start)} → ${prettyDate(r.end)})\n` +
    `${reportHeadline(r.data)}\n` +
    `_Internal draft — nothing has been sent to the client._ <${link}|Review and send it from Locus>`,
    null, { username: 'Mobius Reports', icon: ':clipboard:' });
  return { ok: true, channel };
}

/** The Send-to-client button. Posts the headline + the client's archive link to
 *  their channel and freezes the report. Nothing else ever posts to a client. */
async function sendReport(env, acct, period, start) {
  const row = await env.DB.prepare(
    `SELECT * FROM reports WHERE act_id = ?1 AND period = ?2 AND period_start = ?3`,
  ).bind(acct.act_id, period, start).first();
  if (!row) throw new Error('no report generated for that period yet');
  const data = safeJson(row.data_json, null);
  if (!data) throw new Error('this report has no data — regenerate it first');
  // ONE client destination per brand, shared by the brief and both reports.
  // Deliberately no fallback to the internal channel: "Send to client" quietly
  // posting to the team is the failure this whole flow exists to prevent, so an
  // unset client channel is an error you can see, not a silent redirect.
  const channel = acct.brief_channel;
  if (!channel) throw new Error('no client channel set for this brand — pick one in Settings');
  const url = `${DASHBOARD_URL}?reports=${await reportToken(env, acct.act_id)}`;
  const label = period === 'weekly' ? 'Weekly' : 'Monthly';
  const opener = period === 'weekly'
    ? `Hey Team :wave: Here's your Weekly Report covering ${prettyDate(start)} → ${prettyDate(row.period_end)} →`
    : `Hey Team :wave: Here's your ${MONTH_OF(monthOf(start))} report →`;
  // Client-facing, so it posts as the person, not the app.
  await slackPost(env, channel, `${opener}\n${reportHeadline(data)}\n\n<${url}|Open the full report>`,
    null, { asUser: true });
  await env.DB.prepare(
    `UPDATE reports SET status = 'sent', sent_at = ?4, sent_channel = ?5
     WHERE act_id = ?1 AND period = ?2 AND period_start = ?3`,
  ).bind(acct.act_id, period, start, new Date().toISOString(), channel).run();
  return { ok: true, channel, url };
}

/** Cron pass, inside the same hourly Central-time gate as the Daily Brief.
 *  Monday drafts last Mon–Sun for every brand; the 1st drafts last month.
 *  DRAFTS ONLY — nothing reaches a client without the Send button. A brand
 *  that failed (no row written) is retried on every later tick that day. */
async function reportsPass(env) {
  const today = localDate(BRIEF_TZ);
  const jobs = [];
  if (new Date(today + 'T12:00:00Z').getUTCDay() === 1) jobs.push({ period: 'weekly', start: addDays(today, -7) });
  if (today.slice(8) === '01') jobs.push({ period: 'monthly', start: `${prevMonth(monthOf(today))}-01` });
  if (!jobs.length) return { skipped: 'not a report day' };
  const accounts = await listAccounts(env, true);
  const results = [];
  let did = false;
  for (const a of accounts) {
    const cfg = safeJson(a.report_config_json, {});
    for (const j of jobs) {
      if (cfg[j.period] === false) continue;
      const prior = await env.DB.prepare(
        `SELECT status FROM reports WHERE act_id = ?1 AND period = ?2 AND period_start = ?3`,
      ).bind(a.act_id, j.period, j.start).first().catch(() => null);
      if (prior) { results.push({ name: a.name, period: j.period, already: prior.status }); continue; }
      /* Same rule as the brief: do not start what this tick cannot finish.
         A report half-written is a `reports` row with no narrative that then
         blocks every retry, because the check above only asks whether a row
         exists. That is exactly what happened on 2026-08-31. */
      if (!subCanAfford(costOf('report', COST_REPORT_BRAND))) {
        results.push({ name: a.name, period: j.period, deferred: 'out of subrequest budget — next tick picks this up' });
        continue;
      }
      did = true;
      try {
       await measured('report', async () => {
        // tw_daily is cumulative and dailyBriefs has usually just synced this brand
        // in the same invocation — only sync here if the period's last day is absent,
        // to stay well inside the Worker subrequest budget.
        const have = await env.DB.prepare(
          `SELECT 1 AS x FROM tw_daily WHERE act_id = ?1 AND date = ?2 LIMIT 1`,
        ).bind(a.act_id, addDays(today, -1) < j.start ? j.start : addDays(today, -1)).first().catch(() => null);
        if (!have) await syncTwDaily(env, a, j.period === 'monthly' ? 100 : 70).catch(() => {});
        const r = await makeReport(env, a, j.period, j.start);
        if (r.narrative_error) await alertClaudeFailure(env, `${j.period} report summary for ${a.name}`, r.narrative_error);
        // Same switch as the daily brief: review means it waits for a human,
        // off means it goes straight to the client. One rule for all three.
        /* `ok: true` USED TO BE HARD-CODED HERE, next to a caught error.
           On the first Monday reports ran, all six failed to reach Slack and
           all six were recorded as successes — which is why nobody knew for a
           week. The outcome is now whatever actually happened. */
        const step = a.review_first
          ? { posted: await postReportDraft(env, a, r).catch(e => ({ error: e.message })) }
          : { sent: await sendReport(env, a, j.period, j.start).catch(e => ({ error: e.message })) };
        const failure = (step.posted || step.sent)?.error || null;
        results.push({
          name: a.name, period: j.period,
          ...(failure ? { error: failure } : { ok: true }),
          ...step,
          narrative_error: r.narrative_error ?? null,
        });
       });
      } catch (e) {
        results.push({ name: a.name, period: j.period, error: e.message });
      }
    }
  }
  if (did) await putSetting(env, 'lastReportRun', JSON.stringify({ at: new Date().toISOString(), results })).catch(() => {});
  return results;
}

async function hourlyPacing(env, acct) {
  const today = localDate(acct.tz);
  const since = addDays(today, -7);
  const rows = await metaAll(env, `${acct.act_id}/insights`, {
    level: 'account', time_increment: 1,
    breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
    time_range: { since, until: today },
    fields: 'spend,impressions,actions,action_values',
    limit: 500,
  }, 10);
  const hourOf = r => Math.min(23, Math.max(0, +String(r.hourly_stats_aggregated_by_advertiser_time_zone || '').slice(0, 2) || 0));
  const stmts = rows.map(r => env.DB.prepare(
    `INSERT INTO hourly_insights (act_id, date, hour, spend, impressions, purchases, revenue, synced_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,datetime('now'))
     ON CONFLICT(act_id, date, hour) DO UPDATE SET spend = excluded.spend, impressions = excluded.impressions,
       purchases = excluded.purchases, revenue = excluded.revenue, synced_at = excluded.synced_at`,
  ).bind(acct.act_id, r.date_start, hourOf(r), +r.spend || 0, +r.impressions || 0,
    pickAction(r.actions, PURCHASE_TYPES), pickAction(r.action_values, PURCHASE_TYPES)));
  for (let i = 0; i < stmts.length; i += D1_CHUNK) await env.DB.batch(stmts.slice(i, i + D1_CHUNK));

  const byDay = {};
  for (const r of rows) (byDay[r.date_start] ??= Array(24).fill(0))[hourOf(r)] += +r.spend || 0;
  const cum = arr => { let s = 0; return arr.map(v => +(s += v).toFixed(2)); };
  const todayCum = cum(byDay[today] || Array(24).fill(0));
  const prevDays = [];
  for (let i = 1; i <= 7; i++) { const d = byDay[addDays(today, -i)]; if (d) prevDays.push(cum(d)); }
  const l7cum = Array.from({ length: 24 }, (_, h) => prevDays.length ? +(prevDays.reduce((s, d) => s + d[h], 0) / prevDays.length).toFixed(2) : null);
  const curHour = Math.floor(localHourFrac(acct.tz));
  const lastFull = Math.max(0, curHour - 1);        // compare through the last completed hour on both sides
  const spent = todayCum[lastFull] ?? 0;
  const l7ByNow = l7cum[lastFull];
  const l7Total = l7cum[23];
  return {
    account: { act_id: acct.act_id, name: acct.name, currency: acct.currency, tz: acct.tz },
    today, hour: curHour,
    today_cum: todayCum.slice(0, Math.max(1, curHour)),   // elapsed hours only
    l7_cum: l7cum,
    spent, l7_by_now: l7ByNow, l7_daily_avg: l7Total,
    vs_pace: l7ByNow ? spent / l7ByNow - 1 : null,
    projected: l7ByNow && l7Total ? +(spent / (l7ByNow / l7Total)).toFixed(2) : null,
    pulled_at: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  Creative rotation math (Chat 3)                                   */
/* ------------------------------------------------------------------ */

/** Per-ad rollup for the selected window: who's carrying spend, who's earning it.
 *  Verdicts are relative to the account's own window CPA, never absolute benchmarks. */
/* ---- Ad-level rows for the live Creative browser ----
   The weekly report already renders exactly this - big creative, stats
   underneath, playable - but only inside a FROZEN document that appears twice a
   month. Cole: "if a client asks what ads are working right now", there was no
   answer except waiting for Monday. Same data, same card, live and sortable.

   Every metric here is already synced nightly into `ad_daily` (19 columns since
   2026-08-29); nothing new is pulled from Meta except the creative asset for
   the handful of ads actually shown.

   THE MATERIALITY FLOOR IS LOAD-BEARING. Sorting by ROAS or CPA without one
   puts a $12 ad that happened to convert once at the top of every list, which
   is noise dressed as a finding. The reports already use max($50, 3% of ad
   spend) for the same reason - same floor here, and the response says how much
   spend it excluded so the omission is never silent. */
async function adRows(env, acct, from, to, opts = {}) {
  /* ATTRIBUTION SOURCE. `opts.attr` is a Triple Whale model name, or 'meta' /
     absent for Meta's own reported conversions. Only the ATTRIBUTED figures
     move - revenue, purchases and everything derived from them (ROAS, CPA, CVR,
     AOV). Spend, impressions, reach, clicks, hook, hold, CTR and CPM stay Meta's
     in every case, because Triple Whale does not measure delivery and never
     claims to. */
  let attrModel = opts.attr && opts.attr !== 'meta' ? opts.attr : null;
  let attrBy = null, attrMissing = false;
  if (attrModel) {
    const { results: ar } = await env.DB.prepare(
      `SELECT ad_id, SUM(revenue) AS revenue, SUM(orders) AS orders
       FROM tw_ad_attr WHERE act_id = ?1 AND model = ?2 AND date >= ?3 AND date <= ?4
       GROUP BY ad_id`).bind(acct.act_id, attrModel, from, to).all().catch(() => ({ results: [] }));
    /* NOTHING STORED MEANS SAY SO. NEVER SUBSTITUTE.
       I briefly made this fall back to Meta, and Cole was right to reject it:
       "how will I know if it fails - if it fails then something's wrong and I
       need to come back to you". A quiet source-swap turns a broken sync into
       plausible-looking numbers, which is the worst of both. So the flag is
       returned and NOTHING is attributed; the page refuses to draw cards and
       says what happened instead. Showing zeros would be equally dishonest -
       they read as a real result. */
    if (!(ar || []).length) attrMissing = true;
    else attrBy = Object.fromEntries(ar.map(r => [r.ad_id, r]));
  }
  const { results } = await env.DB.prepare(
    `SELECT d.ad_id, a.name, a.created_time, a.first_spend_date, a.status, a.media_type,
            SUM(d.spend) AS spend, SUM(d.revenue) AS revenue, SUM(d.purchases) AS purchases,
            SUM(d.impressions) AS impressions, SUM(d.reach) AS reach,
            SUM(d.link_clicks) AS link_clicks, SUM(d.clicks_all) AS clicks_all,
            SUM(d.outbound_clicks) AS outbound_clicks,
            SUM(d.video_3s) AS v3, SUM(d.video_thruplay) AS vtp,
            SUM(d.video_p25) AS v25, SUM(d.video_p50) AS v50, SUM(d.video_p75) AS v75,
            SUM(d.video_p100) AS v100, SUM(d.video_plays) AS vplays,
            -- avg_watch is an AVERAGE per day and must never be summed; weight
            -- it by that day's plays to get a true average across the window.
            SUM(d.video_avg_watch * d.video_plays) AS watch_weighted
     FROM ad_daily d JOIN ads a ON a.act_id = d.act_id AND a.ad_id = d.ad_id
     WHERE d.act_id = ?1 AND d.date >= ?2 AND d.date <= ?3
     GROUP BY d.ad_id HAVING SUM(d.spend) > 0
     ORDER BY spend DESC LIMIT 500`,
  ).bind(acct.act_id, from, to).all();
  if (!results.length) return { ads: [], types: [], matched: 0, total_spend: 0, shown_spend: 0,
    floor: 0, acct_cpa: null, attr: 'meta', attr_requested: null, attr_missing: false };

  const today = localDate(acct.tz);
  const totalSpend = results.reduce((n, r) => n + r.spend, 0);
  const totalPurch = results.reduce((n, r) => n + r.purchases, 0);
  const acctCpa = totalPurch ? totalSpend / totalPurch : null;
  const floor = Math.max(50, totalSpend * 0.03);

  const rows = results.map(r => {
    const imp = r.impressions || 0;
    /* An ad with no attributed row has genuinely earned nothing under this
       model - a real zero, not missing data - so it reads as 0, not null.
       Getting that wrong would quietly promote unattributed ads up a CPA sort. */
    const at = attrBy ? (attrBy[r.ad_id] || { revenue: 0, orders: 0 }) : null;
    const revenue = at ? at.revenue : r.revenue;
    const purchases = at ? at.orders : r.purchases;
    // Ads already spending when our history begins would read as brand new, so
    // fall back to Meta's own creation date for their age.
    const origin = r.created_time && r.first_spend_date && String(r.created_time).slice(0, 10) < r.first_spend_date
      ? String(r.created_time).slice(0, 10) : r.first_spend_date;
    // The format tag is the segment after the last pipe in the ad's own name -
    // "310 B | Still", "Cole - 3 | UGC". It must contain a LETTER, or shoot
    // codes like "0616" get treated as a format.
    const tag = (() => {
      const p = String(r.name || '').split('|');
      if (p.length < 2) return null;
      const t = p[p.length - 1].trim();
      return /[a-z]/i.test(t) ? t : null;
    })();
    // Gated on v3 > 0: an image ad and a video ad synced before these columns
    // existed must not look alike, and a 0% hook on a static is meaningless.
    /* `ads.media_type` is authoritative once an ad has been looked at. Until
       then fall back to the video signal we already store, so a never-seen ad
       is still correctly video or static - it just cannot be known to be a
       carousel yet, which is why the Carousel filter only appears when at
       least one ad actually is one. */
    const isVideo = (r.v3 || 0) > 0 || (r.vplays || 0) > 0;
    const media = r.media_type || (isVideo ? 'video' : 'image');
    return {
      ad_id: r.ad_id, name: r.name || r.ad_id, status: r.status || null,
      spend: r.spend, revenue, purchases,
      roas: r.spend ? revenue / r.spend : null,
      cpa: purchases ? r.spend / purchases : null,
      attr: attrModel || 'meta',
      impressions: imp, reach: r.reach || 0,
      frequency: r.reach ? imp / r.reach : null,
      cpm: imp ? (r.spend / imp) * 1000 : null,
      ctr: imp ? (r.link_clicks || 0) / imp : null,
      // Thumbstop is the 3-second view rate - the same numerator as hook. Kept
      // as its own name because that is what the creative team calls it.
      hook: isVideo && imp ? (r.v3 || 0) / imp : null,
      hold: isVideo && r.v3 ? (r.vtp || 0) / r.v3 : null,
      completion: isVideo && r.vplays ? (r.v100 || 0) / r.vplays : null,
      /* `is_video` PUTS A PLAY BADGE ON THE CARD, so it has to mean "this can
         be played", not "there is video in here somewhere". `|| isVideo`
         defeated the whole point of `media_type` being authoritative: a
         carousel of videos has v3 > 0, so it was flagged playable, and the
         click died on "no playable video" because a carousel has no single
         video id. `media` already falls back to isVideo when the type is
         unknown, so nothing is lost by dropping the alternative. */
      is_video: media === 'video', media_type: media, format: tag,
      /* Aliases and the derived metrics the detail popout shows. Named to match
         what the REPORT's adDetailModal already expects, so one modal serves
         both surfaces rather than a lookalike that drifts from it. */
      video: media === 'video',
      created: origin || null,
      clicks: r.clicks_all || 0,
      cpc: r.link_clicks ? r.spend / r.link_clicks : null,
      cvr: r.link_clicks ? purchases / r.link_clicks : null,
      aov: purchases ? revenue / purchases : null,
      cost_per_thumbstop: r.v3 ? r.spend / r.v3 : null,
      avg_watch: r.vplays ? (r.watch_weighted || 0) / r.vplays : null,
      retention: isVideo && r.vplays ? {
        p25: (r.v25 || 0) / r.vplays, p50: (r.v50 || 0) / r.vplays,
        p75: (r.v75 || 0) / r.vplays, p100: (r.v100 || 0) / r.vplays,
      } : null,
      age: origin ? Math.max(0, ymdDiff(today, origin)) : null,
      material: r.spend >= floor,
      share: totalSpend ? r.spend / totalSpend : 0,
    };
  });

  /* The TYPES actually present, so the UI never offers a filter that would
     return nothing. Only the three real media types - the pipe-suffix tags in
     ad names (UGC, Still) are a naming convention, not a type, and offering
     them beside Video/Static duplicated the same split twice over. */
  const types = ['video', 'image', 'carousel'].filter(t => rows.some(r => r.media_type === t));

  let list = rows;
  if (opts.format === 'video') list = list.filter(r => r.media_type === 'video');
  else if (opts.format === 'static') list = list.filter(r => r.media_type === 'image');
  else if (opts.format === 'carousel') list = list.filter(r => r.media_type === 'carousel');

  /* Ratio sorts see MATERIAL ads only. A sort by best ROAS that surfaces
     an ad with $12 of spend is not a ranking, it is a rounding error. Spend
     and recency have no such problem and rank everything. */
  const RATIO = new Set(['roas', 'cpa', 'ctr', 'cpm', 'hook', 'hold', 'completion', 'frequency']);
  const sort = opts.sort || 'spend';
  if (RATIO.has(sort)) list = list.filter(r => r.material);
  if (sort === 'hook' || sort === 'hold' || sort === 'completion') list = list.filter(r => r.is_video);

  const dir = sort === 'cpa' || sort === 'cpm' || sort === 'frequency' ? 1 : -1;  // lower is better
  const key = sort === 'newest' ? (r => -(r.age ?? 1e9)) : (r => r[sort]);
  list = list.slice().sort((a, b) => {
    const av = key(a), bv = key(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;                 // nulls last, whichever direction
    if (bv == null) return -1;
    return (av - bv) * dir;
  });

  const limit = Math.min(Math.max(+opts.limit || 8, 1), 40);
  const top = list.slice(0, limit);
  return {
    ads: top, types, attr: attrModel || 'meta',
    // Whether a Triple Whale model was ASKED for and had nothing behind it, so
    // the page can explain the fallback instead of quietly changing source.
    attr_requested: opts.attr && opts.attr !== 'meta' ? opts.attr : null,
    attr_missing: attrMissing,
    matched: list.length,
    total_spend: totalSpend,
    shown_spend: top.reduce((n, r) => n + r.spend, 0),
    floor, acct_cpa: acctCpa, sort,
  };
}

async function adBreakdown(env, acct, windowDays, freshDays, win = null) {
  const today = localDate(acct.tz);
  const from = win ? win.from : addDays(today, -windowDays);
  const to = win ? addDays(win.to, 1) : today;
  const { results } = await env.DB.prepare(
    `SELECT d.ad_id, a.name, a.first_spend_date, a.created_time,
            SUM(d.spend) AS spend, SUM(d.purchases) AS purchases, SUM(d.revenue) AS revenue, SUM(d.impressions) AS impressions
     FROM ad_daily d JOIN ads a ON a.act_id = d.act_id AND a.ad_id = d.ad_id
     WHERE d.act_id = ?1 AND d.date >= ?2 AND d.date < ?3
     GROUP BY d.ad_id HAVING SUM(d.spend) > 0
     ORDER BY spend DESC LIMIT 40`,
  ).bind(acct.act_id, from, to).all();
  if (!results.length) return null;
  const tot = results.reduce((a, r) => ({ spend: a.spend + r.spend, purch: a.purch + r.purchases }), { spend: 0, purch: 0 });
  const acctCpa = tot.purch ? tot.spend / tot.purch : null;
  const ads = results.map(r => {
    const cpa = r.purchases ? r.spend / r.purchases : null;
    const origin = r.created_time && r.first_spend_date && String(r.created_time).slice(0, 10) < r.first_spend_date
      ? String(r.created_time).slice(0, 10) : r.first_spend_date;
    const age = origin ? Math.max(0, ymdDiff(today, origin)) : null;
    let verdict = null;
    if (acctCpa != null) {
      if (cpa == null && r.spend >= acctCpa * 1.5) verdict = 'cut';           // spent 1.5 CPAs, zero purchases
      else if (cpa != null && cpa <= acctCpa * 0.8) verdict = 'scale';
      else if (cpa != null && cpa >= acctCpa * 1.4) verdict = 'cut';
    }
    return { ad_id: r.ad_id, name: r.name || r.ad_id, spend: r.spend, purchases: r.purchases,
      revenue: r.revenue, cpa, roas: r.spend ? r.revenue / r.spend : null,
      share: tot.spend ? r.spend / tot.spend : 0, age, fresh: age != null && age <= freshDays, verdict };
  });
  return { window: windowDays, from, acct_cpa: acctCpa, total_spend: tot.spend, ads };
}

/* `win` is {from,to} when the caller has a real date range - the shared period
   control - and null for the old "last N days" behaviour. The freshness cards
   compare the window against the SAME LENGTH immediately before it, so an
   arbitrary range works as well as a day count. The 97-day history behind the
   weekly trend chart is separate and unaffected: that chart is about the shape
   over time, not about the selected window. */
async function creative(env, acct, freshDays, windowDays, win = null) {
  const today = localDate(acct.tz);
  const histFrom = win ? addDays(win.from, -97) : addDays(today, -97);
  const from = histFrom;
  const { results: rows } = await env.DB.prepare(
    `SELECT d.date, d.spend, d.purchases, a.first_spend_date, a.created_time
     FROM ad_daily d JOIN ads a ON a.act_id = d.act_id AND a.ad_id = d.ad_id
     WHERE d.act_id = ?1 AND d.date >= ?2 AND d.date < ?3 AND d.spend > 0 AND a.first_spend_date IS NOT NULL`,
  ).bind(acct.act_id, from, today).all();
  if (!rows.length) return { empty: true };
  // Ads already spending when our history starts would look "brand new" — for those,
  // fall back to Meta's true creation date so their age is honest.
  const clipEdge = addDays(from, 2);
  for (const r of rows) {
    const created = r.created_time ? String(r.created_time).slice(0, 10) : null;
    const origin = r.first_spend_date <= clipEdge && created && created < r.first_spend_date ? created : r.first_spend_date;
    r.age = Math.max(0, ymdDiff(r.date, origin));
  }

  const span = win ? Math.max(1, ymdDiff(win.to, win.from) + 1) : windowDays;
  const winTo = win ? win.to : addDays(today, -1);
  const winFrom = win ? win.from : addDays(today, -windowDays);
  const prevFrom = addDays(winFrom, -span);
  const split = list => {
    const s = { freshSpend: 0, freshPurch: 0, staleSpend: 0, stalePurch: 0, ageSpend: 0, total: 0 };
    for (const r of list) {
      s.total += r.spend; s.ageSpend += r.age * r.spend;
      if (r.age <= freshDays) { s.freshSpend += r.spend; s.freshPurch += r.purchases; }
      else { s.staleSpend += r.spend; s.stalePurch += r.purchases; }
    }
    return s;
  };
  const cur = split(rows.filter(r => r.date >= winFrom && r.date <= winTo));
  const prev = split(rows.filter(r => r.date >= prevFrom && r.date < winFrom));

  const weekStart = d => { const dt = new Date(d + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay()); return dt.toISOString().slice(0, 10); };
  const weeks = {};
  for (const r of rows) {
    const w = weekStart(r.date);
    const o = weeks[w] ??= { week: w, spend: 0, purchases: 0, b: [0, 0, 0, 0, 0], freshSpend: 0 };
    o.spend += r.spend; o.purchases += r.purchases; o.freshSpend += r.age <= freshDays ? r.spend : 0;
    o.b[r.age <= 7 ? 0 : r.age <= 14 ? 1 : r.age <= 30 ? 2 : r.age <= 60 ? 3 : 4] += r.spend;
  }
  const weekly = Object.values(weeks).sort((a, b) => a.week < b.week ? -1 : 1).map(w => ({
    week: w.week, spend: w.spend,
    cpa: w.purchases ? w.spend / w.purchases : null,
    freshShare: w.spend ? w.freshSpend / w.spend : 0,
    shares: w.b.map(x => w.spend ? x / w.spend : 0),
  }));
  const ranked = weekly.filter(w => w.cpa != null && w.spend > 0).slice().sort((a, b) => b.freshShare - a.freshShare);
  const half = Math.min(6, Math.floor(ranked.length / 2));
  const median = l => { const s = l.map(w => w.cpa).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const avgShare = l => l.length ? l.reduce((s, w) => s + w.freshShare, 0) / l.length : 0;
  return {
    account: { act_id: acct.act_id, name: acct.name, currency: acct.currency, today },
    fresh: freshDays, window: windowDays,
    cards: {
      freshShare: cur.total ? cur.freshSpend / cur.total : null,
      freshSharePrev: prev.total ? prev.freshSpend / prev.total : null,
      swAge: cur.total ? cur.ageSpend / cur.total : null,
      freshCpa: cur.freshPurch ? cur.freshSpend / cur.freshPurch : null,
      staleCpa: cur.stalePurch ? cur.staleSpend / cur.stalePurch : null,
    },
    weekly,
    ads: await adBreakdown(env, acct, Math.max(span, 7), freshDays, win),
    insight: half >= 3 ? {
      n: half,
      topShare: avgShare(ranked.slice(0, half)), topCpa: median(ranked.slice(0, half)),
      botShare: avgShare(ranked.slice(-half)), botCpa: median(ranked.slice(-half)),
    } : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Overview math (all clients in one table)                          */
/* ------------------------------------------------------------------ */

function agg(rows) {
  const s = rows.reduce((a, r) => {
    a.spend += r.spend; a.impressions += r.impressions; a.clicks += r.link_clicks || r.clicks;
    a.purchases += r.purchases; a.revenue += r.revenue; a.video_views += r.video_views; return a;
  }, { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, video_views: 0, days: rows.length });
  return {
    ...s,
    spend_per_day: s.days ? s.spend / s.days : null,
    cpa: s.purchases ? s.spend / s.purchases : null,
    roas: s.spend ? s.revenue / s.spend : null,
    ctr: s.impressions ? s.clicks / s.impressions : null,
    cpm: s.impressions ? s.spend / s.impressions * 1000 : null,
    thumbstop: s.impressions ? s.video_views / s.impressions : null,
  };
}

async function accountOverview(env, a) {
  const today = localDate(a.tz);
  const from = addDays(today, -70);
  const { results: rows } = await env.DB.prepare(
    `SELECT * FROM daily_insights WHERE act_id = ?1 AND date >= ?2 ORDER BY date`,
  ).bind(a.act_id, from).all();
  const byDate = Object.fromEntries(rows.map(r => [r.date, r]));
  const range = (n, endOffset = 1) => {            // last n full days ending yesterday by default
    const out = [];
    for (let i = endOffset; i < n + endOffset; i++) { const d = byDate[addDays(today, -i)]; if (d) out.push(d); }
    return out;
  };
  const ym = monthOf(today), pm = prevMonth(ym);
  const dom = +today.slice(8, 10);
  const dim = daysInMonth(today);
  const mtdRows = rows.filter(r => r.date.startsWith(ym));
  const mtd = mtdRows.reduce((s, r) => s + r.spend, 0);
  const lastMonthRows = rows.filter(r => r.date.startsWith(pm));
  const lastMonthTotal = lastMonthRows.reduce((s, r) => s + r.spend, 0);
  const lastMonthSameDay = lastMonthRows.filter(r => +r.date.slice(8, 10) <= dom).reduce((s, r) => s + r.spend, 0);
  const elapsed = (dom - 1 + localHourFrac(a.tz) / 24) / dim;    // fraction of month elapsed
  const budget = a.budgets?.[ym] ?? a.monthly_budget ?? null;
  const expected = budget != null ? budget * elapsed : null;
  return {
    act_id: a.act_id, name: a.name, currency: a.currency, tz: a.tz, today,
    target_cpa: a.target_cpa ?? null, target_roas: a.target_roas ?? null, slack_channel: a.slack_channel ?? null,
    last_sync_insights: a.last_sync_insights, last_sync_activities: a.last_sync_activities, last_error: a.last_error,
    today_spend: byDate[today]?.spend ?? null,
    // Meta only, everywhere on these pages: spend here must always match Ads Manager.
    mtd: { spend: mtd, budget, expected, pace_pct: expected ? mtd / expected - 1 : null,
      projected: elapsed > 0.02 ? mtd / elapsed : null, elapsed, days_in_month: dim, day_of_month: dom,
      last_month_same_day: lastMonthSameDay, last_month_total: lastMonthTotal,
      vs_last_month_pct: lastMonthSameDay ? mtd / lastMonthSameDay - 1 : null },
    l7: agg(range(7)), l30: agg(range(30)), prev7: agg(range(7, 8)), prev30: agg(range(30, 31)),
    days_of_data: rows.length,
    changes_24h: (await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM activities WHERE act_id = ?1 AND event_time >= ?2`,
    ).bind(a.act_id, new Date(Date.now() - 86400e3).toISOString()).first())?.n ?? 0,
  };
}

async function overview(env) {
  const accounts = await listAccounts(env, true);
  const out = [];
  for (const a of accounts) out.push(await accountOverview(env, a));
  return out;
}

/* Chart-strip events: the changes worth marking under an Averages chart. */
async function seriesEvents(env, actId, fromISO) {
  const { results } = await env.DB.prepare(
    `SELECT id, event_time, category, summary, reason, suggested_reason, manual FROM activities
     WHERE act_id = ?1 AND event_time >= ?2 AND confirmed != -1
       AND (category IN ('budget','new_campaign','campaign_paused','campaign_relaunched','bid_strategy','targeting') OR manual = 1)
     ORDER BY event_time`,
  ).bind(actId, fromISO).all();
  return results;
}

/* ---- settings helpers + Slack ---- */

async function getSetting(env, key) {
  return (await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first())?.value ?? null;
}
async function putSetting(env, key, value) {
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(key, value).run();
}

/* WHO THE MESSAGE COMES FROM.
   Internal traffic - drafts awaiting review, delivery alerts, failure notices -
   posts as the BOT, which is right: it is machine output and should look like
   it. Anything reaching a CLIENT posts as a PERSON, via `asUser`.

   Cole, 2026-08-31: "whenever I send it to the client I want it to come through
   me specifically". This is not cosmetic. A bot token can set `username` and an
   avatar, but Slack still stamps an APP badge on the message, so a client can
   always tell. Only a user token (xoxp-) posts as the human - their name, their
   picture, no badge.

   Two rules follow:
   - A user token can only post where THAT PERSON is a member. There is no
     bot-style invite, and if he is not in the channel it fails, correctly.
   - `asUser` NEVER falls back to the bot. Sending as "Mobius Reports" when he
     asked for it to come from him is the wrong sender on a client message, and
     he would never know it happened. It fails loudly instead. */
async function slackPost(env, channel, text, blocks, opts = {}) {
  const asUser = !!opts.asUser;
  const token = asUser ? env.SLACK_USER_TOKEN : env.SLACK_BOT_TOKEN;
  if (asUser && !token) {
    throw new Error('No Slack user token is set, so this cannot be sent as you rather than as the bot. Add SLACK_USER_TOKEN in Cloudflare, or post it from Slack by hand.');
  }
  const send = payload => xfetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json().catch(() => ({})));
  const base = { channel, text, ...(blocks ? { blocks } : {}) };
  if (asUser) {
    // A user token posts AS that user; overriding name or avatar is neither
    // possible nor wanted, so the identity fields are bot-only.
    const j = await send(base);
    if (!j.ok) {
      const hint = j.error === 'not_in_channel' ? ' — you are not a member of that channel. Join it in Slack and send again.'
        : (j.error === 'invalid_auth' || j.error === 'token_revoked') ? ' — the Slack user token is no longer valid and needs regenerating.'
        : j.error === 'missing_scope' ? ' — the Slack user token is missing the chat:write scope.'
        : '';
      throw new Error(`Slack: ${j.error || 'unknown error'}${hint}`);
    }
    return;
  }
  let j = await send({ ...base, username: opts.username || 'Mobius Account Health', icon_emoji: opts.icon || ':bar_chart:' });
  if (!j.ok && /missing_scope|invalid_arg/i.test(j.error || '')) j = await send(base);
  if (!j.ok) throw new Error(`Slack: ${j.error || 'unknown error'}`);
}

/* ------------------------------------------------------------------ */
/*  Delivery alerts — the only scheduled Slack alert left.               */
/*                                                                      */
/*  An ad account can stop spending silently: a declined card, a         */
/*  campaign paused by mistake, ads rejected on policy. Nothing else in  */
/*  Locus notices, and every hour it goes unseen is spend that never     */
/*  happened.                                                            */
/*                                                                      */
/*  Two checks per account per day, both against the account's OWN       */
/*  recent normal — never an absolute number:                            */
/*    · mid-afternoon, on today so far (catches it while it can be fixed)*/
/*    · next morning, on the completed day (catches what broke overnight)*/
/*                                                                      */
/*  This replaced a 03:30 UTC nightly pass, which ran at 10:30pm Central */
/*  and — because the local day was not over at that hour — reported on  */
/*  the day BEFORE yesterday. A break on Monday surfaced late on Tuesday.*/
/* ------------------------------------------------------------------ */

const DELIVERY_FLOOR = 0.4;          // at or below 40% of normal = something is wrong
const DELIVERY_MIN_SPEND = 50;       // ignore accounts too small to judge
const DELIVERY_MORNING_HOUR = 8;     // local, reports on yesterday
const DELIVERY_INTRADAY_HOUR = 14;   // local, reports on today so far

/** Per-account alert bookkeeping, so one problem is one message.
 *  { act_id: { day: 'YYYY-MM-DD', intra: 'YYYY-MM-DD', alerted: 'YYYY-MM-DD' } }
 *  `day`/`intra` record that a check RAN (so a missed cron tick still recovers
 *  later the same day); `alerted` records the DATE a problem was reported about,
 *  so the morning pass stays quiet about a day the afternoon already flagged. */
async function deliveryState(env) {
  return safeJson(await getSetting(env, 'deliveryState'), {});
}

/** Yesterday against this account's own 7-day median. Pure D1, no Meta call. */
async function checkCompletedDay(env, a, day) {
  const { results } = await env.DB.prepare(
    `SELECT date, spend FROM daily_insights WHERE act_id = ?1 AND date >= ?2 AND date <= ?3 ORDER BY date`,
  ).bind(a.act_id, addDays(day, -7), day).all();
  const dayRow = results.find(r => r.date === day);
  const prior = results.filter(r => r.date !== day).map(r => r.spend).sort((x, z) => x - z);
  if (prior.length < 4) return null;                       // not enough history to judge
  const med = prior[Math.floor(prior.length / 2)];
  if (med < DELIVERY_MIN_SPEND) return null;               // tiny spender: too noisy

  /* NO ROW IS NOT ZERO SPEND. Meta has not told us about this day yet, or the
     sync did not get to this brand. Either way there is nothing to judge, and
     guessing $0 is how a brand spending $892 got a billing alarm. Say what is
     actually wrong instead — a stale sync IS a fault, just a different one. */
  if (!dayRow) {
    const f = await insightsFreshness(env, a, day);
    return `🕓 *${a.name}* — no Meta spend data for ${day} yet, so delivery could not be checked.` +
      (f.latest ? ` The last day on file is ${f.latest}.` : ' There is no spend history at all for this brand.') +
      ` _This is a sync problem, not necessarily a spend problem — check the account in Ads Manager if it persists past the next sync._`;
  }

  const spend = dayRow.spend ?? 0;
  if (spend > med * DELIVERY_FLOOR) return null;
  return spend === 0
    ? `🚨 *${a.name}* spent *nothing* yesterday (a normal day is about ${money(med, a.currency)}). Check billing, campaign status and policy.`
    : `⚠️ *${a.name}* spent ${money(spend, a.currency)} yesterday — ${Math.round((1 - spend / med) * 100)}% below its normal ${money(med, a.currency)}. Something may be paused or throttled.`;
}

/** Today so far against the shape of a normal day by this hour. One Meta call. */
async function checkToday(env, a) {
  let p;
  try { p = await hourlyPacing(env, a); } catch { return null; }
  if (!p || !(p.l7_by_now >= DELIVERY_MIN_SPEND / 2)) return null;   // too early / too small to judge
  if (p.spent > p.l7_by_now * DELIVERY_FLOOR) return null;
  return p.spent === 0
    ? `🚨 *${a.name}* has spent *nothing* so far today (normally about ${money(p.l7_by_now, a.currency)} by this hour). Check billing, campaign status and policy.`
    : `⚠️ *${a.name}* has spent ${money(p.spent, a.currency)} so far today against ${money(p.l7_by_now, a.currency)} on a normal day by now — ${Math.round((1 - p.spent / p.l7_by_now) * 100)}% down. Worth a look in Ads Manager while the day is still live.`;
}

/** Runs on every hourly tick; each account gates itself on its OWN local clock,
 *  because the brands are spread across three US timezones and "2pm" has to mean
 *  2pm where the account is. */
async function deliveryPass(env) {
  if (!env.SLACK_BOT_TOKEN) return { skipped: 'no SLACK_BOT_TOKEN secret' };
  const def = await getSetting(env, 'slackChannel');
  const state = await deliveryState(env);
  const byChannel = new Map();
  let touched = false;

  const deferred = [];
  for (const a of await listAccounts(env, true)) {
    /* A brand skipped here is NOT marked as checked (st.day / st.intra stay
       put), so the next tick re-checks it. That is the whole reason the state
       flags record "a check ran" rather than "an hour passed". */
    if (!subCanAfford(costOf('delivery', COST_DELIVERY_BRAND))) { deferred.push(a.name); continue; }
    const today = localDate(a.tz);
    const hour = Math.floor(localHourFrac(a.tz));
    const yesterday = addDays(today, -1);
    const st = state[a.act_id] || (state[a.act_id] = {});
    const queue = line => {
      const ch = a.slack_channel || def;
      if (!ch || !line) return;
      if (!byChannel.has(ch)) byChannel.set(ch, []);
      byChannel.get(ch).push(line);
    };

    // Same day, mid-afternoon — the one that can still save the day's spend.
    if (hour >= DELIVERY_INTRADAY_HOUR && st.intra !== today) {
      st.intra = today; touched = true;
      const line = await checkToday(env, a).catch(() => null);
      if (line && st.alerted !== today) { st.alerted = today; queue(line); }
    }
    // Next morning, on the completed day. Skipped when the afternoon pass
    // already reported that same day - one problem, one message.
    if (hour >= DELIVERY_MORNING_HOUR && st.day !== today) {
      st.day = today; touched = true;
      if (st.alerted !== yesterday) {
        const line = await checkCompletedDay(env, a, yesterday).catch(() => null);
        if (line) { st.alerted = yesterday; queue(line); }
      }
    }
  }

  if (touched) await putSetting(env, 'deliveryState', JSON.stringify(state)).catch(() => {});
  if (!byChannel.size) return { ok: true, alerts: 0, ...(deferred.length ? { deferred } : {}) };
  let alerts = 0;
  const results = [];
  for (const [ch, lines] of byChannel) {
    alerts += lines.length;
    try {
      await slackPost(env, ch, `Delivery check: ${lines.length} account${lines.length > 1 ? 's' : ''} spending well below normal`, [
        { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n\n') } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `<${DASHBOARD_URL}?open=meta|Open Locus → Meta> · compared with this account's own last 7 days, never a fixed target` }] },
      ]);
      results.push({ channel: ch, sent: lines.length });
    } catch (e) { results.push({ channel: ch, error: e.message }); }
  }
  return { ok: true, alerts, channels: results };
}

/* ------------------------------------------------------------------ */
/*  HTTP                                                               */
/* ------------------------------------------------------------------ */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', ...CORS },
});

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---- Google sign-in + shared sessions (used by /hq and every tool) ---- */

const ALLOWED_DOMAIN = 'go-mobius-digital.com';
const SESSION_DAYS = 30;
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmacKey(env) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET || env.ADMIN_TOKEN || 'dev'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** Session token: base64url(email|exp) + '.' + HMAC. Verified by every tool worker sharing SESSION_SECRET. */
async function mintSession(env, email) {
  const exp = Date.now() + SESSION_DAYS * 86400e3;
  const payload = btoa(`${email}|${exp}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sig = b64u(await crypto.subtle.sign('HMAC', await hmacKey(env), new TextEncoder().encode(payload)));
  return { token: `mds.${payload}.${sig}`, email, exp };
}

async function verifySession(env, token) {
  const m = /^mds\.([\w-]+)\.([\w-]+)$/.exec(token || '');
  if (!m) return null;
  const sig = b64u(await crypto.subtle.sign('HMAC', await hmacKey(env), new TextEncoder().encode(m[1])));
  if (sig !== m[2]) return null;
  let email, exp;
  try { [email, exp] = atob(m[1].replace(/-/g, '+').replace(/_/g, '/')).split('|'); } catch { return null; }
  if (+exp < Date.now()) return null;
  return { email, exp: +exp };
}

async function emailAllowed(env, email) {
  if (!email) return false;
  if (email.toLowerCase().endsWith('@' + ALLOWED_DOMAIN)) return true;
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'allowedEmails'`).first().catch(() => null);
  const extra = safeJson(row?.value, []);
  return extra.map(e => String(e).toLowerCase()).includes(email.toLowerCase());
}

/** Verify a Google ID token (from Google Identity Services) and mint a session. */
async function googleLogin(env, credential) {
  if (!env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID.startsWith('PASTE')) {
    return { error: 'Google sign-in is not configured yet', status: 501 };
  }
  const res = await xfetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  const info = await res.json().catch(() => ({}));
  if (!res.ok || info.aud !== env.GOOGLE_CLIENT_ID) return { error: 'Invalid Google token', status: 401 };
  if (info.email_verified !== 'true' && info.email_verified !== true) return { error: 'Email not verified', status: 401 };
  if (!(await emailAllowed(env, info.email))) return { error: `${info.email} is not a Mobius account`, status: 403 };
  const s = await mintSession(env, info.email);
  return { ...s, name: info.name || '', picture: info.picture || '' };
}

/* ---- Roles ----
   TWO roles and no more: admin, and viewer. `settings.userRoles` maps an email
   to its role and ANYONE NOT LISTED IS AN ADMIN, which is exactly today's
   behaviour - so adding this cannot lock anybody out, including whoever forgets
   they added themselves.
   A viewer is GET-only. That is the whole rule: they see every screen and can
   press nothing that leaves the building - no send to client, no plan save, no
   margin override, no settings, no sync. It reuses the read-only gate the demo
   account already proved, rather than inventing a second permission model. */
async function roleFor(env, email) {
  if (!email) return 'admin';
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'userRoles'`).first();
    const map = safeJson(row?.value, {}) || {};
    return String(map[String(email).toLowerCase()] || 'admin').toLowerCase() === 'viewer' ? 'viewer' : 'admin';
  } catch { return 'admin'; }
}

/** The signed-in email, or null for a password/token session that has none. */
async function sessionEmail(env, request) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const sess = await verifySession(env, auth.slice(7));
  return sess?.email || null;
}

async function isAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const tok = auth.slice(7);
  if (env.ADMIN_TOKEN && tok === env.ADMIN_TOKEN) return true;
  const sess = await verifySession(env, tok);
  if (sess && (await emailAllowed(env, sess.email))) return true;
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'passwordHash'`).first();
  return !!row?.value && (await sha256hex(tok)) === row.value;
}

/** Write down what a scheduled tick actually did, including what it could not
 *  afford. This is the only record anyone has, so it is budgeted for (see
 *  SUB_RESERVE) and it never throws. */
async function recordRun(env, key, payload) {
  const body = JSON.stringify({
    at: new Date().toISOString(),
    subrequests: { used: subUsed(), limit: SUB_LIMIT, cost_per_unit: costReport() },
    ...payload,
  });
  await env.DB.prepare(
    `INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).bind(key, body.slice(0, 60000)).run().catch(() => {});
}

/* ------------------------------------------------------------------ */
/*  Keeping the data fresh — spread across the hourly ticks            */
/* ------------------------------------------------------------------ */
/* This used to be the whole of nightly(): one 03:30 invocation looping every
 * brand. On the free plan that got through ONE brand before Cloudflare killed
 * it, so five of six sat a day stale every single day, and nothing said so —
 * the delivery check then read the missing day as "spent nothing" and shouted
 * about a brand that had spent $892.
 *
 * Now: STALEST FIRST, as many as this tick can afford, every hour. Six brands
 * over 24 ticks means each one is refreshed several times a day and no tick has
 * to be big. A brand that errors sorts to the front next hour automatically,
 * because its last_sync_insights did not move — the retry is the ordering, not
 * a separate mechanism. */
async function syncPass(env) {
  if (!subCanAfford(costOf('sync', COST_SYNC_BRAND))) {
    return { skipped: 'budget spent on higher-priority work this tick' };
  }
  const accounts = await listAccounts(env, true);
  if (!accounts.length) return { skipped: 'no active accounts' };
  // NULL (never synced) sorts first under an empty-string key, which is right:
  // a brand with no data at all is the most urgent thing on the list.
  accounts.sort((x, z) =>
    String(x.last_sync_insights || '').localeCompare(String(z.last_sync_insights || '')));

  // Meta said stop. Asking again on the next tick is how a short limit becomes
  // a long one, and the D1-backed data is only an hour stale meanwhile.
  if (await metaBackedOff(env)) return { skipped: 'Meta rate limit — backing off until it clears' };
  const done = [];
  for (const a of accounts) {
    if (!subCanAfford(costOf('sync', COST_SYNC_BRAND))) { done.push({ name: a.name, deferred: 'out of budget' }); break; }
    const r = await measured('sync', async () => {
      // Cheap half only — see syncAccount. Ad-level rides the nightly.
      const x = await syncAccount(env, a, undefined, { includeAds: false });
      // Triple Whale rides along with the same brand rather than in its own loop.
      // Doing all Meta then all TW meant TW was always the half that got cut.
      x.tw = await syncTwDaily(env, a, 10).catch(e => ({ error: e.message }));
      return x;
    });
    done.push(r);
  }
  return { synced: done, remaining: subLeft() };
}

/* ------------------------------------------------------------------ */
/*  Nightly — only the work that genuinely wants a quiet hour          */
/* ------------------------------------------------------------------ */
async function nightly(env) {
  const out = {};
  /* Cole, 2026-08-30: "I want it to include ALL things I own and future things
     too" - i.e. never press a Discover button again. New accounts land with
     active = 0, so this only ever grows the pool you can pick a brand from;
     nothing starts syncing, reporting or posting to Slack on its own.

     IT NO LONGER RUNS FIRST. Discovery walks 25 ad accounts across every
     business and is the single most expensive thing here; running it ahead of
     the syncs meant it spent most of the night's allowance before one brand had
     been touched, which is exactly how five of six ended up stale. It goes last
     now, on whatever is left, and simply waits for tomorrow if there is nothing
     left — a new ad account showing up a day later costs nothing, a brand going
     a day stale costs a false alarm in a client channel. */
  const accounts = await listAccounts(env, true);

  /* Triple Whale ad-level attribution. A 7-day window because attribution
     RESTATES as journeys resolve - yesterday's numbers keep moving for several
     days, so re-pulling a week and replacing it is what keeps the stored figures
     converging on the truth rather than freezing a first guess. */
  const twAttr = [];
  for (const a of accounts) {
    if (!subCanAfford(costOf('attr', COST_SYNC_BRAND))) { twAttr.push({ name: a.name, deferred: 'out of budget' }); break; }
    twAttr.push(await syncTwAttribution(env, a, 7).catch(e => ({ name: a.name, error: e.message })));
  }
  /* HISTORY FILLS ITSELF. The rolling 7 days above keeps recent attribution
     correcting as journeys resolve, but it never reaches backwards - so a
     90-day window would stay empty forever unless someone remembered to press
     a button, which is not a system, it is a chore. One older slice per night,
     walking back to TW_ATTR_HISTORY_DAYS and then stopping. Resumable via
     `tw_attr_cursor`, the same shape as the ad-insights backfill. */
  for (const a of accounts) {
    if (a.tw_attr_done) continue;
    if (!subCanAfford(costOf('attr', COST_SYNC_BRAND))) { twAttr.push({ name: a.name, backfill: true, deferred: 'out of budget' }); break; }
    try {
      const today = localDate(a.tz);
      const floor = addDays(today, -TW_ATTR_HISTORY_DAYS);
      const to = addDays(a.tw_attr_cursor || addDays(today, -7), -1);
      if (to <= floor) {
        await env.DB.prepare(`UPDATE accounts SET tw_attr_done = 1 WHERE act_id = ?1`).bind(a.act_id).run();
        continue;
      }
      const from = addDays(to, -14) < floor ? floor : addDays(to, -14);
      const r = await syncTwAttribution(env, a, 0, { from, to });
      await env.DB.prepare(`UPDATE accounts SET tw_attr_cursor = ?2 WHERE act_id = ?1`).bind(a.act_id, from).run();
      twAttr.push({ ...r, backfill: true });
    } catch (e) { twAttr.push({ name: a.name, backfill: true, error: e.message }); }
  }
  out.twAttr = twAttr;

  /* The ad-level walk, once a day, here and nowhere else. Rate-limited by Meta
     rather than by us, so it is also the first thing to yield when Meta is
     unhappy — `metaBackedOff` short-circuits the whole pass. */
  const ads = [];
  for (const a of accounts) {
    if (await metaBackedOff(env)) { ads.push({ name: a.name, deferred: 'Meta rate limit — backing off' }); break; }
    if (!subCanAfford(costOf('ads', COST_SYNC_BRAND))) { ads.push({ name: a.name, deferred: 'out of budget' }); break; }
    try { ads.push({ name: a.name, ...(await measured('ads', () => syncAdDaily(env, a, { maxSlices: 8 }))) }); }
    catch (e) { ads.push({ name: a.name, error: e.message }); await noteMetaError(env, e); }
  }
  out.ads = ads;

  // Whatever is left goes to the syncs, then discovery last of all.
  out.sync = await syncPass(env).catch(e => ({ error: e.message }));
  out.discover = subCanAfford(costOf('sync', COST_SYNC_BRAND))
    ? await discoverAccounts(env).catch(e => ({ error: e.message }))
    : { deferred: 'out of budget — runs tomorrow' };

  await recordRun(env, 'lastRun', out);
  await alertScheduleTrouble(env, 'nightly sync', out);
  return out;
}

export default {
  async scheduled(event, env, ctx) {
    // Cloudflare cron expressions are fixed at deploy time and always UTC, so the
    // Daily Brief trigger runs EVERY hour and the worker decides whether this is
    // the configured hour in Central. That keeps the send time editable from the
    // dashboard and stable across daylight saving, without adding a trigger (the
    // account is at the free-plan limit of 5).
    if (event.cron === '0 * * * *') {
      env = meterEnv(env); subReset(env);
      ctx.waitUntil((async () => {
        // AT OR AFTER the configured hour, never an exact match. An exact match has
        // no way to recover from a single miss, and the misses are real: changing the
        // send time from 9 to 7 between 7am and 8am lost a whole day silently,
        // because 7 had already passed and 9 never came round again. A dropped cron
        // tick or a transient failure did the same. Every later tick now retries, and
        // dailyBriefs skips brands already posted for the date, so this cannot double
        // post and costs one cheap SELECT per brand per hour once the hour is past.
        //
        // ORDER MATTERS, AND IT IS NOT THE ORDER OF IMPORTANCE.
        // Everything below shares ONE subrequest budget. Before the budget was
        // counted, this ran briefs then reports, and the briefs ate the whole
        // allowance — so on the first Monday reports existed at all, all six were
        // generated with no narrative and posted to nobody, while recording
        // ok:true. Cheapest and most time-critical first, and every job below
        // stops on its own when the budget runs low rather than being killed.
        const hour = centralHour();
        const bh = await briefHour(env);
        const ran = {};
        ran.delivery = await deliveryPass(env).catch(e => ({ error: e.message }));
        if (hour >= bh) {
          ran.briefs = await dailyBriefs(env).catch(e => ({ error: e.message }));
          // Reports wait TWO hours behind the brief. They could share a tick now
          // that both stop politely, but a weekly report is the biggest single
          // unit of work here and it should not be the thing that gets deferred
          // six times because six briefs went first. Monday drafts last Mon–Sun,
          // the 1st drafts last month. Internal drafts only — the Send-to-client
          // button is still the only path to a client channel.
          if (hour >= bh + REPORT_HOUR_OFFSET) {
            ran.reports = await reportsPass(env).catch(e => ({ error: e.message }));
          }
        }
        // Whatever budget survived goes to keeping the data fresh. This used to
        // live entirely in the 03:30 nightly, which meant one invocation tried to
        // sync every brand and got through one; daily_insights sat a day stale and
        // the delivery check read the missing day as "spent nothing". Draining it
        // an hour at a time across 24 ticks means a brand is never more than a few
        // hours old, and no single tick has to be big.
        ran.sync = await syncPass(env).catch(e => ({ error: e.message }));
        await recordRun(env, 'lastHourly', ran);
      })());
    } else {
      env = meterEnv(env); subReset(env);
      ctx.waitUntil(nightly(env));
    }
  },

  async fetch(request, env, ctx) {
    /* Metered here too. Nothing in the request path GATES on the budget — a
       dashboard call must answer or fail honestly, never half-answer — but the
       count is what makes an endpoint's real cost visible in /api/health
       instead of being discovered when a page starts failing for one client
       and not another. */
    env = meterEnv(env); subReset(env);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    /* A playable mp4 for one ad. Two ways in, and no third:
       - a signed-in team member (session/admin), for the Reports tab;
       - `?report=<archive token>`, for the client's link, which only ever
         resolves an ad that IS in one of that client's sent reports.
       Returns the URL rather than streaming it, so the browser talks straight
       to the CDN and seeking/range requests work properly. */
    if (path === '/api/ad-video') {
      const adId = url.searchParams.get('ad');
      const repTok = url.searchParams.get('report');
      if (!adId) return json({ error: 'ad is required' }, 400);
      const adsTok = url.searchParams.get('ads');
      let hint = {};
      if (repTok) {
        const row = await adInSentReport(env, repTok, adId);
        if (!row) return json({ error: 'not found in this report' }, 404);
        hint = { video_id: row.video_id, page_id: row.page_id };
      } else if (adsTok) {
        /* A shared creative snapshot authorises playback for the ads IT
           contains and nothing else - the same rule as a report archive token.
           Anything looser turns this into an open proxy for arbitrary Meta
           video ids, which is the one thing this endpoint must never be. */
        if (!/^[a-f0-9]{16,}$/.test(adsTok)) return json({ error: 'bad token' }, 400);
        const row = await env.DB.prepare(`SELECT data_json FROM p_ad_share WHERE token = ?1`).bind(adsTok).first();
        if (!row) return json({ error: 'this link is no longer valid' }, 404);
        const hit = (safeJson(row.data_json, {}).ads || []).find(a => a.ad_id === adId);
        if (!hit) return json({ error: 'not in this set of ads' }, 404);
        hint = { video_id: hit.video_id, page_id: hit.page_id };
      } else if (!(await isAdmin(request, env))) {
        return json({ error: 'unauthorized' }, 401);
      }
      /* The old message here was one flat "no playable video for this ad" for
         five different causes — no video, no page, no token, a stale token, a
         refusal from Meta — which is why a card that plainly WAS a video read
         as though the ad had none. `adVideoSource` now says which. */
      const { src, reason } = await adVideoSource(env, adId, hint);
      if (!src) return json({ error: reason || 'This ad has no video to play.' }, 404);
      // Deliberately uncached: the signed URL is short-lived, and a cached one
      // that has expired plays as a broken video rather than an honest retry.
      return json({ src });
    }


    if (path === '/api/brief-time' && (request.method === 'GET' || request.method === 'PUT')) {


    if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);

      /* Backfill attribution on demand - the nightly pass only covers 7 days,
         and a new brand or a longer look-back needs more than that. */
      /* Who will a client-facing send appear to come from? Reports the identity
       behind SLACK_USER_TOKEN without exposing the token, so the answer is a
       name rather than an assumption. Read-only and admin-gated. */
    if (path === '/api/slack-identity' && request.method === 'GET') {
      if (!env.SLACK_USER_TOKEN) return json({ configured: false });
      const r = await xfetch('https://slack.com/api/auth.test', {
        headers: { Authorization: `Bearer ${env.SLACK_USER_TOKEN}` },
      }).then(x => x.json()).catch(e => ({ ok: false, error: e.message }));
      return json({ configured: true, ok: !!r.ok, user: r.user || null, team: r.team || null, error: r.error || null });
    }

    if (path === '/api/tw-attr-sync' && request.method === 'POST') {
        const act = url.searchParams.get('act');
        const days = Math.min(+url.searchParams.get('days') || 30, TW_ATTR_HISTORY_DAYS);
        const list = act && act !== 'all'
          ? [await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(act).first()].filter(Boolean)
          : await listAccounts(env, true);
        const out = [];
        for (const a of list) out.push(await syncTwAttribution(env, a, days).catch(e => ({ name: a.name, error: e.message })));
        return json({ ok: true, results: out });
      }
      if (request.method === 'PUT') {
        const b = await request.json().catch(() => ({}));
        const h = +b.hour;
        if (!Number.isInteger(h) || h < 0 || h > 23) return json({ error: 'hour must be a whole number from 0 to 23' }, 400);
        await putSetting(env, 'briefHour', String(h));
      }
      return json({ hour: await briefHour(env), tz: BRIEF_TZ, now_hour: centralHour() });
    }

    if (path === '/health') {
      const last = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'lastRun'`).first().catch(() => null);
      return json({ ok: true, lastRun: safeJson(last?.value, null), hasMetaToken: !!env.META_TOKEN, hasAnthropicKey: !!env.ANTHROPIC_API_KEY, hasSlackToken: !!env.SLACK_BOT_TOKEN, hasTwKey: !!env.TW_API_KEY });
    }
    /* WHAT THE SCHEDULE ACTUALLY DID. Everything below already existed in the
       settings table and none of it was on screen anywhere, which is the real
       reason four days of failures went unnoticed. Admin-gated: it names
       brands and errors. */
    if (path === '/api/schedule-health' && request.method === 'GET') {
      if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
      const stale = (await env.DB.prepare(
        `SELECT a.name, a.act_id, MAX(d.date) AS latest
           FROM accounts a LEFT JOIN daily_insights d ON d.act_id = a.act_id
          WHERE a.active = 1 GROUP BY a.act_id ORDER BY latest`,
      ).all().catch(() => ({ results: [] }))).results;
      return json({
        subrequest_limit: SUB_LIMIT,
        plan: SUB_LIMIT > SUB_LIMIT_FREE ? 'paid' : 'free',
        brief_hour: await briefHour(env),
        report_hour: (await briefHour(env)) + REPORT_HOUR_OFFSET,
        central_hour: centralHour(),
        hourly: safeJson(await getSetting(env, 'lastHourly'), null),
        nightly: safeJson(await getSetting(env, 'lastRun'), null),
        briefs: safeJson(await getSetting(env, 'lastBriefRun'), null),
        reports: safeJson(await getSetting(env, 'lastReportRun'), null),
        data_freshness: stale,
      });
    }
    if (path === '/' ) return Response.redirect(DASHBOARD_URL, 302);

    if (path === '/api/google-login' && request.method === 'POST') {
      const { credential } = await request.json().catch(() => ({}));
      const r = await googleLogin(env, credential);
      return r.error ? json({ error: r.error }, r.status) : json(r);
    }

    /* Read-only client share links — token in the URL is the auth. */
    let sm;
    if ((sm = path.match(/^\/api\/share\/([A-Za-z0-9-]{16,})$/)) && request.method === 'GET') {
      try {
        const tokens = safeJson(await getSetting(env, 'shareTokens'), {});
        const t = tokens[sm[1]];
        if (!t) return json({ error: 'This share link is no longer valid.' }, 404);
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(t.act_id).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        acct.budgets = safeJson(acct.budgets_json, {});
        const ov = await accountOverview(env, acct);
        const from = addDays(localDate(acct.tz), -180);
        const { results: rows } = await env.DB.prepare(
          `SELECT date, spend, impressions, clicks, link_clicks, purchases, revenue, video_views FROM daily_insights
           WHERE act_id = ?1 AND date >= ?2 ORDER BY date`,
        ).bind(t.act_id, from).all();
        const events = await seriesEvents(env, t.act_id, addDays(localDate(acct.tz), -180));
        return json({ share: true, account: { name: acct.name, currency: acct.currency, tz: acct.tz },
          rows, events, mtd: ov.mtd, today: ov.today, today_spend: ov.today_spend,
          l7: ov.l7, target_cpa: ov.target_cpa, target_roas: ov.target_roas });
      } catch (e) { return json({ error: e.message }, 500); }
    }

      /* DIAGNOSTIC, TEMPORARY (2026-08-30) - delete with settings key twDiagKey.
       Dumps every metric Triple Whale returns for a shop: id, human title and the
       value for the window, INCLUDING the ones TW_KEEP drops on the way into
       tw_daily. Added to settle which field is the Google ROAS on the Triple Whale
       dashboard, because ga_ROAS (Google Ads' OWN reported figure) is not it.
       Gated on a random one-time key in the settings table rather than the admin
       token, so investigating this could never require rotating a live secret. */
    if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);

    /* View-only accounts read everything and change nothing. GET-only is the
       entire rule - simple enough to hold in your head and to explain to the
       person it applies to. Anyone not listed in settings.userRoles is an admin,
       so this is inert until a role is actually assigned. */
    const who = await sessionEmail(env, request);
    if (request.method !== 'GET' && (await roleFor(env, who)) === 'viewer') {
      return json({ error: 'Your account has view-only access, so this cannot be changed. Ask an admin on your team.' }, 403);
    }

    /* ---- Team: who can sign in, and at what level ----
       `allowedEmails` (who may sign in from outside the Mobius domain) and
       `userRoles` (what they can do) were both settings with NO interface at
       all - an outside collaborator meant hand-editing D1, and every person who
       could sign in was a full admin who could press Send to client. */
    if (path === '/api/team' && request.method === 'GET') {
      const [ae, ur] = await Promise.all([
        env.DB.prepare(`SELECT value FROM settings WHERE key = 'allowedEmails'`).first().catch(() => null),
        env.DB.prepare(`SELECT value FROM settings WHERE key = 'userRoles'`).first().catch(() => null),
      ]);
      const extra = (safeJson(ae?.value, []) || []).map(e => String(e).toLowerCase());
      const roles = safeJson(ur?.value, {}) || {};
      // Everyone we know about: invited guests, plus anyone given an explicit role.
      const emails = [...new Set([...extra, ...Object.keys(roles).map(e => e.toLowerCase())])].sort();
      return json({
        domain: ALLOWED_DOMAIN, you: who,
        members: emails.map(e => ({ email: e, role: roles[e] === 'viewer' ? 'viewer' : 'admin', guest: extra.includes(e) })),
      });
    }
    if (path === '/api/team' && request.method === 'PUT') {
      const b = await request.json().catch(() => ({}));
      const email = String(b.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'That does not look like an email address' }, 400);
      const role = b.role === 'viewer' ? 'viewer' : 'admin';
      const [ae, ur] = await Promise.all([
        env.DB.prepare(`SELECT value FROM settings WHERE key = 'allowedEmails'`).first().catch(() => null),
        env.DB.prepare(`SELECT value FROM settings WHERE key = 'userRoles'`).first().catch(() => null),
      ]);
      let extra = (safeJson(ae?.value, []) || []).map(e => String(e).toLowerCase());
      const roles = safeJson(ur?.value, {}) || {};
      const onDomain = email.endsWith('@' + ALLOWED_DOMAIN);
      if (b.remove) {
        // Never let someone remove their own access and lock themselves out.
        if (who && email === String(who).toLowerCase()) return json({ error: 'You cannot remove your own access.' }, 400);
        extra = extra.filter(e => e !== email);
        delete roles[email];
      } else {
        if (!onDomain && !extra.includes(email)) extra.push(email);   // domain accounts need no invite
        if (role === 'viewer') roles[email] = 'viewer'; else delete roles[email];
      }
      await putSetting(env, 'allowedEmails', JSON.stringify(extra));
      await putSetting(env, 'userRoles', JSON.stringify(roles));
      return json({ ok: true, email, role, guest: extra.includes(email) });
    }

    if (path === '/api/me') {
      const sess = await verifySession(env, (request.headers.get('Authorization') || '').slice(7));
      return json({ email: sess?.email || null, exp: sess?.exp || null, master: !sess });
    }

    try {
      /* ---- accounts ---- */
      if (path === '/api/accounts' && request.method === 'GET') {
        // lastDiscover rides along so the Clients card can say the scan is
        // automatic and when it last ran, rather than implying a manual step.
        const ld = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'lastDiscover'`).first().catch(() => null);
        return json({ accounts: await listAccounts(env), lastDiscover: safeJson(ld?.value, null) });
      }
      let m;
      if ((m = path.match(/^\/api\/accounts\/(act_\d+)$/)) && request.method === 'PUT') {
        const body = await request.json();
        const cur = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(m[1]).first();
        if (!cur) return json({ error: 'unknown account' }, 404);
        const numOrKeep = (v, keep) => v === '' ? null : (v ?? keep);
        await env.DB.prepare(
          `UPDATE accounts SET active = ?2, name = ?3, monthly_budget = ?4, budgets_json = ?5, tz = ?6,
             target_cpa = ?7, target_roas = ?8, slack_channel = ?9, tw_shop = ?10, goals_json = ?11, brief_enabled = ?12,
             brief_channel = ?13 WHERE act_id = ?1`,
        ).bind(m[1],
          body.active != null ? (body.active ? 1 : 0) : cur.active,
          body.name ?? cur.name,
          numOrKeep(body.monthly_budget, cur.monthly_budget),
          body.budgets ? JSON.stringify(body.budgets) : cur.budgets_json,
          body.tz ?? cur.tz,
          numOrKeep(body.target_cpa, cur.target_cpa),
          numOrKeep(body.target_roas, cur.target_roas),
          numOrKeep(body.slack_channel, cur.slack_channel),
          numOrKeep(body.tw_shop, cur.tw_shop),
          body.goals ? JSON.stringify(body.goals) : cur.goals_json,
          body.brief_enabled != null ? (body.brief_enabled ? 1 : 0) : cur.brief_enabled,
          numOrKeep(body.brief_channel, cur.brief_channel),
        ).run();
        // First activation → kick off a backfill in the background.
        if (body.active && !cur.active && !cur.last_sync_insights) {
          const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(m[1]).first();
          ctx.waitUntil(syncAccount(env, acct));
        }
        return json({ ok: true });
      }
      /* WHY CAN'T IT SEE MY AD ACCOUNTS? Answer it with facts instead of guesses.
         Reports what META_TOKEN actually is, which scopes it carries, which
         businesses it can see, and what each ad-account edge returned - errors
         included, verbatim. Cole hit an empty picker and no amount of UI copy
         could say whether the cause was a missing scope, a system user with no
         business role, or simply no assets granted. */
      if (path === '/api/meta-business' && request.method === 'PUT') {
        const b = await request.json().catch(() => ({}));
        const id = String(b.id || '').trim().replace(/\D/g, '');
        if (id) {
          // Prove it before storing: a wrong id would otherwise fail silently
          // inside discovery and look exactly like no id at all.
          let name;
          try { name = (await meta(env, id, { fields: 'name' }))?.name; }
          catch (e) { return json({ error: `Meta will not read business ${id}: ${e.message}` }, 400); }
          await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('metaBusinessId', ?1)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(id).run();
          return json({ ok: true, id, name });
        }
        await env.DB.prepare(`DELETE FROM settings WHERE key = 'metaBusinessId'`).run();
        return json({ ok: true, id: null });
      }

      if (path === '/api/meta-access' && request.method === 'GET') {
        const out = { token: null, scopes: [], businesses: [], edges: {}, direct: null, errors: [] };
        try {
          const d = await meta(env, 'debug_token', { input_token: env.META_TOKEN });
          const t = d.data || {};
          out.token = { type: t.type || null, app_id: t.app_id || null, expires_at: t.expires_at || 0,
            never_expires: t.expires_at === 0, valid: !!t.is_valid };
          out.scopes = t.scopes || [];
        } catch (e) { out.errors.push({ at: 'debug_token', error: e.message }); }
        let seed = [];
        try { seed = await metaAll(env, 'me/adaccounts', { fields: 'id', limit: 200 }); out.direct = seed.length; }
        catch (e) { out.errors.push({ at: 'me/adaccounts', error: e.message }); }
        let bs = [];
        try { bs = await businessesFor(env, seed); }
        catch (e) { out.errors.push({ at: 'businessesFor', error: e.message }); }
        out.businesses = bs.map(b => ({ id: b.id, name: b.name }));
        for (const b of bs) {
          for (const edge of ['owned_ad_accounts', 'client_ad_accounts']) {
            try { out.edges[`${b.name || b.id} · ${edge}`] = (await metaAll(env, `${b.id}/${edge}`, { fields: 'id' }, 5)).length; }
            catch (e) { out.edges[`${b.name || b.id} · ${edge}`] = `error: ${e.message}`; }
          }
        }
        // The one-line verdict, so the UI never has to interpret the above.
        const need = ['business_management', 'ads_read'].filter(s => !out.scopes.includes(s));
        const owned = Object.entries(out.edges).reduce((n, [, v]) => n + (typeof v === 'number' ? v : 0), 0);
        out.verdict = out.errors.length && !out.direct ? 'The Meta token is not working at all.'
          : need.length ? `The token is missing the ${need.join(' and ')} permission${need.length > 1 ? 's' : ''}, so it can only see ad accounts assigned to it one by one.`
          : !out.businesses.length ? 'No Business Manager could be reached, so only individually-assigned ad accounts are visible.'
          : owned > out.direct ? `Reading your portfolio directly — ${owned} ad accounts against ${out.direct} assigned individually, so new ones appear on their own.`
          : owned === 0 ? 'The portfolios reachable here are your CLIENTS’ own — their ad accounts are shared with you rather than owned by you, and Meta will not let a system user list another business’s assets. Set your own Business Portfolio ID below and Locus can read everything shared with you, including future clients.'
          : `Reading your portfolio (${out.businesses.map(b => b.name).join(', ')}). Every ad account in it, now and in future, is picked up automatically.`;
        out.needsBusinessId = owned === 0;
        return json(out);
      }

      if (path === '/api/discover' && request.method === 'POST') {
        const d = await discoverAccounts(env);
        return json({ ok: true, ...d, accounts: await listAccounts(env) });
      }

      /* ---- sync ---- */
      if (path === '/api/sync' && request.method === 'POST') {
        const act = url.searchParams.get('act');
        const days = url.searchParams.get('days') ? +url.searchParams.get('days') : undefined;
        if (act) {
          const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(act).first();
          if (!acct) return json({ error: 'unknown account' }, 404);
          return json({ ok: true, result: await syncAccount(env, acct, days) });
        }
        ctx.waitUntil(nightly(env));
        return json({ ok: true, queued: true }, 202);
      }

      /* ---- data ---- */
      if (path === '/api/overview') return json({ accounts: await overview(env) });

      if (path === '/api/series') {
        const act = url.searchParams.get('act');
        const days = Math.min(+url.searchParams.get('days') || 90, 400);
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(act).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        const from = addDays(localDate(acct.tz), -days);
        const { results: rows } = await env.DB.prepare(
          `SELECT * FROM daily_insights WHERE act_id = ?1 AND date >= ?2 ORDER BY date`,
        ).bind(act, from).all();
        return json({ account: { act_id: acct.act_id, name: acct.name, currency: acct.currency, tz: acct.tz, today: localDate(acct.tz) },
          rows, events: await seriesEvents(env, act, from) });
      }

      if (path === '/api/pacing') {
        const act = url.searchParams.get('act');
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(act).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        return json(await hourlyPacing(env, acct));
      }

      /* Live creative browser. Same rows the weekly report draws, but for any
         window and any sort, and it fetches the creative asset only for the
         handful of ads actually shown - one batched Meta call per view. */
      /* Creative assets for a named set of ads, fetched AFTER the cards paint.
         Splitting this out is what makes sorting and filtering feel instant:
         the numbers are one D1 query, and the images arrive when they arrive. */
      if (path === '/api/ad-creatives') {
        const ids = (url.searchParams.get('ads') || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 40);
        if (!ids.length) return json({ assets: {} });
        let assets = {};
        /* LIVE limits, not the report's. This response is JSON to a browser,
           not an image inlined into one D1 row, so the only ceiling that matters
           is what a single card is worth keeping. */
        try { assets = await adThumbnails(env, ids, LIVE_THUMBS); } catch (e) { return json({ assets: {}, error: e.message }); }
        return json({ assets });
      }

      if (path === '/api/ads') {
        const act = url.searchParams.get('act');
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(act).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        const today = localDate(acct.tz), yday = addDays(today, -1);
        const ymd = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null;
        let to = ymd(url.searchParams.get('to')) || yday;
        if (to > yday) to = yday;                        // today is never complete
        const days = Math.min(Math.max(+url.searchParams.get('days') || 30, 1), 400);
        const from = ymd(url.searchParams.get('from')) || addDays(to, -(days - 1));
        const t0 = Date.now();
        const r = await adRows(env, acct, from > to ? to : from, to, {
          sort: url.searchParams.get('sort'),
          format: url.searchParams.get('format'),
          limit: url.searchParams.get('limit'),
          attr: url.searchParams.get('attr'),
        });
        // Assets for the shown ads only. Never fatal - the numbers are the point
        // and a card with no image still answers the question.
        const t1 = Date.now();
        /* CREATIVE IS NO LONGER FETCHED HERE unless asked for. It was the whole
           reason filtering felt slow: an unseen ad costs a creative call plus a
           video-cover call against Meta, so one dropdown click could be sixteen
           sequential round trips before a single number appeared. The cards do
           not need the image to be correct - they need it to be fast - so the
           rows come back immediately and the images are fetched separately and
           patched in. `?assets=1` keeps the old one-shot behaviour for any
           caller that genuinely wants both together. */
        let assets = {};
        if (url.searchParams.get('assets') === '1') {
          try { assets = await adThumbnails(env, r.ads.map(a => a.ad_id), LIVE_THUMBS); } catch { /* numbers still stand */ }
          for (const a of r.ads) Object.assign(a, assets[a.ad_id] || {});
        } else {
          // Anything already cached is free, so send that much with the rows.
          try {
            const ids = r.ads.map(a => a.ad_id);
            const q = ids.map((_, i) => `?${i + 1}`).join(',');
            const { results } = await env.DB.prepare(
              `SELECT ad_id, json FROM ad_creative WHERE ad_id IN (${q})`).bind(...ids).all();
            for (const row of results || []) {
              const v = safeJson(row.json, null);
              const a = r.ads.find(x => x.ad_id === row.ad_id);
              if (v && a) Object.assign(a, v);
            }
          } catch { /* the numbers stand without it */ }
        }
        const t2 = Date.now();
        // Timings ride along permanently. "It feels slow" is not actionable;
        // "creative took 4.1s of 4.3s" says exactly what to fix.
        return json({ account: { act_id: acct.act_id, name: acct.name, currency: acct.currency },
          from, to, ...r, timing: { rows_ms: t1 - t0, creative_ms: t2 - t1, total_ms: t2 - t0 } });
      }

      if (path === '/api/creative') {
        // from/to come from the shared period control; `window` remains for any
        // caller that still asks in days.
        var _cvFrom = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('from') || '') ? url.searchParams.get('from') : null;
        var _cvTo = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('to') || '') ? url.searchParams.get('to') : null;
        const act = url.searchParams.get('act');
        const freshDays = Math.min(+url.searchParams.get('fresh') || 14, 60);
        const windowDays = Math.min(+url.searchParams.get('window') || 14, 30);
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(act).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        let backfill = null;
        if (!acct.ads_backfill_done) backfill = await syncAdDaily(env, acct, { maxSlices: 3 });
        else if ((acct.ads_metrics_version || 0) < ADS_METRICS_VERSION) ctx.waitUntil(syncAdDaily(env, acct, { maxSlices: 3 }).catch(() => {}));  // new metric columns still filling
        else {
          const missing = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ads WHERE act_id = ?1 AND created_time IS NULL`).bind(act).first();
          if (missing?.n > 0) ctx.waitUntil(syncAdMeta(env, acct).catch(() => {}));  // heal ages for pre-history ads
        }
        const r = await creative(env, acct, freshDays, windowDays,
          _cvFrom && _cvTo ? { from: _cvFrom, to: _cvTo } : null);
        if (backfill && !backfill.done) r.backfill = backfill;   // progress or error for the banner
        return json(r);
      }

      /* The Meta-only client share link was retired 2026-08-27. Clients get
         blended reporting - the profit worker's ?perf, ?plan and ?reports links -
         and a Meta-attributed view was the one surface that contradicted it.
         GET /api/share/:token above still answers for any link already handed
         out, but nothing mints new ones and no page renders them. */
      if (path === '/api/settings' && request.method === 'GET') {
        return json({
          slackChannel: await getSetting(env, 'slackChannel'),
          paceAlertPct: +(await getSetting(env, 'paceAlertPct')) || 0.15,
          hasSlackToken: !!env.SLACK_BOT_TOKEN,
          hasTwKey: !!env.TW_API_KEY,
        });
      }
      if (path === '/api/settings' && request.method === 'PUT') {
        const b = await request.json().catch(() => ({}));
        if ('slackChannel' in b) await putSetting(env, 'slackChannel', b.slackChannel || '');
        if ('paceAlertPct' in b) await putSetting(env, 'paceAlertPct', String(+b.paceAlertPct || 0.15));
        return json({ ok: true });
      }
      if (path === '/api/slack-channels') {
        if (!env.SLACK_BOT_TOKEN) return json({ error: 'SLACK_BOT_TOKEN secret is not set' }, 400);
        const out = [];
        let cursor;
        do {
          const u = new URL('https://slack.com/api/conversations.list');
          u.searchParams.set('limit', '200');
          u.searchParams.set('exclude_archived', 'true');
          u.searchParams.set('types', 'public_channel,private_channel');
          if (cursor) u.searchParams.set('cursor', cursor);
          const r = await xfetch(u, { headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } });
          const j = await r.json().catch(() => ({}));
          if (!j.ok) return json({ error: `Slack: ${j.error || r.status}` }, 400);
          out.push(...j.channels.map(c => ({ id: c.id, name: c.name, member: !!c.is_member })));
          cursor = j.response_metadata?.next_cursor;
        } while (cursor);
        out.sort((a, b) => (b.member - a.member) || a.name.localeCompare(b.name));
        return json({ channels: out });
      }
      if (path === '/api/slack-test' && request.method === 'POST') {
        if (!env.SLACK_BOT_TOKEN) return json({ error: 'SLACK_BOT_TOKEN secret is not set — see worker README' }, 400);
        const channel = await getSetting(env, 'slackChannel');
        if (!channel) return json({ error: 'Set a Slack channel ID first' }, 400);
        await slackPost(env, channel, 'Account Health is wired up ✓ — nightly budget-pace alerts will post here.');
        return json({ ok: true });
      }

      if (path === '/api/insights') {
        const act = url.searchParams.get('act');
        const from = url.searchParams.get('from') || '2000-01-01';
        const to = url.searchParams.get('to') || '2999-12-31';
        const { results } = await env.DB.prepare(
          `SELECT * FROM daily_insights WHERE act_id = ?1 AND date BETWEEN ?2 AND ?3 ORDER BY date`,
        ).bind(act, from, to).all();
        return json({ rows: results });
      }

      if (path === '/api/activities' && request.method === 'GET') {
        const act = url.searchParams.get('act');
        const from = url.searchParams.get('from') || '2000-01-01';
        const to = url.searchParams.get('to') || '2999-12-31T23:59:59';
        const limit = Math.min(+url.searchParams.get('limit') || 500, 2000);
        const all = !act || act === 'all';
        const { results } = await env.DB.prepare(all
          ? `SELECT a.*, acc.name AS account_name FROM activities a JOIN accounts acc ON acc.act_id = a.act_id
             WHERE acc.active = 1 AND a.event_time BETWEEN ?1 AND ?2 ORDER BY a.event_time DESC LIMIT ?3`
          : `SELECT a.*, acc.name AS account_name FROM activities a JOIN accounts acc ON acc.act_id = a.act_id
             WHERE a.act_id = ?4 AND a.event_time BETWEEN ?1 AND ?2 ORDER BY a.event_time DESC LIMIT ?3`,
        ).bind(...(all ? [from, to, limit] : [from, to, limit, act])).all();
        return json({ rows: results });
      }
      if (path === '/api/activities/bulk-confirm' && request.method === 'POST') {
        const { ids } = await request.json().catch(() => ({}));
        if (!Array.isArray(ids) || !ids.length) return json({ error: 'ids required' }, 400);
        let n = 0;
        for (let i = 0; i < ids.length && i < 4000; i += 50) {
          const chunk = ids.slice(i, i + 50);
          const r = await env.DB.prepare(
            `UPDATE activities SET confirmed = 1 WHERE confirmed = 0 AND id IN (${chunk.map(() => '?').join(',')})`,
          ).bind(...chunk).run();
          n += r.meta?.changes ?? 0;
        }
        return json({ ok: true, confirmed: n });
      }
      if ((m = path.match(/^\/api\/activities\/(.+)$/)) && request.method === 'PATCH') {
        const body = await request.json();
        // confirmed: 1 = confirmed deliberate, 0 = untouched, -1 = dismissed (noise; excluded from summaries)
        const confirmed = body.dismissed != null ? (body.dismissed ? -1 : 0)
          : body.confirmed == null ? null : (body.confirmed ? 1 : 0);
        await env.DB.prepare(
          `UPDATE activities SET reason = COALESCE(?2, reason), note = COALESCE(?3, note),
             confirmed = COALESCE(?4, confirmed), category = COALESCE(?5, category) WHERE id = ?1`,
        ).bind(decodeURIComponent(m[1]), body.reason ?? null, body.note ?? null,
          confirmed, body.category ?? null).run();
        return json({ ok: true });
      }
      if (path === '/api/activities' && request.method === 'POST') {   // manual entry
        const b = await request.json();
        const id = `manual:${crypto.randomUUID()}`;
        await env.DB.prepare(
          `INSERT INTO activities (id, act_id, event_time, category, summary, reason, note, confirmed, manual, actor)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, 1, ?8)`,
        ).bind(id, b.act_id, b.event_time || new Date().toISOString(), b.category || 'other',
          b.summary || '', b.reason ?? null, b.note ?? null, b.actor || 'manual').run();
        return json({ ok: true, id });
      }
      /* ---- Daily Brief (Chat 5) ---- */
      if (path === '/api/tw-sync' && request.method === 'POST') {
        const act = url.searchParams.get('act');
        const days = Math.min(+url.searchParams.get('days') || 70, 430);
        const accounts = (await listAccounts(env, true)).filter(a => !act || act === 'all' || a.act_id === act);
        const results = [];
        for (const a of accounts) results.push(await syncTwDaily(env, a, days).catch(e => ({ name: a.name, error: e.message })));
        return json({ ok: true, results });
      }
      /* ---- Data health (2026-09-04) ----
         Answers "can I trust this morning's numbers?" without anybody reading
         code or asking. Three D1 reads per brand and no network calls, so it
         is safe to open as often as you like. */
      if (path === '/api/data-health' && request.method === 'GET') {
        const act = url.searchParams.get('act');
        const days = Math.min(+url.searchParams.get('days') || 14, 60);
        const accounts = (await listAccounts(env, true)).filter(a => !act || act === 'all' || a.act_id === act);
        const brands = [];
        for (const a of accounts) {
          brands.push(await dataHealth(env, a, { days }).catch(e => ({
            account: { act_id: a.act_id, name: a.name }, verdict: 'unknown',
            headline: `This check could not run: ${e.message}`, issues: [], days: [], bad_dates: [],
          })));
        }
        const rank = { broken: 0, unknown: 1, warn: 2, ok: 3 };
        brands.sort((x, y) => (rank[x.verdict] ?? 9) - (rank[y.verdict] ?? 9) || x.account.name.localeCompare(y.account.name));
        return json({ ok: true, checked_at: new Date().toISOString(), brands });
      }
      /* Rebuild one day's draft from freshly-checked data. Deliberately ONE
         brand and ONE day per call: a brief is the most expensive unit of work
         in this worker (~22 subrequests of a 50 budget), so a loop over six
         brands would die halfway and leave half-written drafts. The UI walks
         the list and shows progress instead. */
      if (path === '/api/brief-rebuild' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(b.act).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        const date = b.date;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return json({ error: 'date is required (YYYY-MM-DD)' }, 400);
        const prior = await env.DB.prepare(
          `SELECT status FROM briefs WHERE act_id = ?1 AND date = ?2`,
        ).bind(acct.act_id, date).first().catch(() => null);
        // A sent brief is a record of what the client received. It does not get
        // quietly rewritten, however wrong the numbers turned out to be.
        if (prior?.status === 'sent') return json({ error: 'that day was already sent to the client, so it cannot be rebuilt — say so in the channel instead' }, 400);
        const r = await makeBrief(env, acct, date);
        if (r.error) return json({ error: r.error }, 400);
        // Silent: no Slack post. This is a repair, not a new morning notice.
        await upsertBrief(env, acct.act_id, date, 'draft', null, r.text, r.data);
        return json({ ok: true, date, health: r.health, narrative_error: r.narrative_error ?? null });
      }
      if (path === '/api/goal-suggest' && request.method === 'GET') {
        const act = url.searchParams.get('act');
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(act).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        return json(await suggestGoals(env, acct));
      }
      if (path === '/api/brief' && request.method === 'GET') {
        const act = url.searchParams.get('act');
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(act).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        const date = url.searchParams.get('date') || addDays(localDate(acct.tz), -1);
        const data = await briefData(env, acct, date);
        const hist = (await env.DB.prepare(
          `SELECT date, posted_at, channel, status, text FROM briefs WHERE act_id = ?1 ORDER BY date DESC LIMIT 15`,
        ).bind(act).all()).results;
        return json({ ...data, date, history: hist });
      }
      if (path === '/api/brief-preview' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(b.act).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        const date = b.date || addDays(localDate(acct.tz), -1);
        const r = await makeBrief(env, acct, date);
        if (r.error) return json({ error: r.error }, 400);
        return json({ ok: true, date, text: r.text, narrative_error: r.narrative_error ?? null });
      }
      if (path === '/api/brief-send' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(b.act).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        const date = b.date || addDays(localDate(acct.tz), -1);
        // Send what was reviewed. Regenerating here would discard any wording
        // edit made on the draft, which is the entire point of the review step.
        // `ignore_health` is the human override: someone has looked at the
        // flagged numbers and decided they are right. The UI asks first.
        const r = await sendBrief(env, acct, date, { useStored: b.regenerate !== true, ignoreHealth: b.ignore_health === true });
        return r.ok ? json(r) : json({ error: r.error || r.skipped, blocked: r.blocked === true }, 400);
      }
      /* Save an edited draft. Only a draft is editable — once it is sent, the
         client has that text and it must stay a record of what they received. */
      if (path === '/api/brief-text' && request.method === 'PUT') {
        const b = await request.json().catch(() => ({}));
        if (typeof b.text !== 'string' || !b.text.trim()) return json({ error: 'text is required' }, 400);
        const r = await env.DB.prepare(
          `UPDATE briefs SET text = ?3 WHERE act_id = ?1 AND date = ?2 AND status = 'draft'`,
        ).bind(b.act, b.date, b.text).run();
        if (!r.meta?.changes) return json({ error: 'no draft for that day (a sent brief cannot be edited)' }, 404);
        return json({ ok: true });
      }
      /* "Don't send this one." Marks the day handled without messaging the
         client, so the catch-up stops carrying it into every later draft.
         Reversible: pressing Write the brief again drafts the day afresh. */
      if (path === '/api/brief-skip' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(b.act).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        const date = b.date || addDays(localDate(acct.tz), -1);
        // A sent brief is a record of what the client received and is frozen —
        // the same rule the edit endpoint follows.
        const prior = await env.DB.prepare(
          `SELECT status FROM briefs WHERE act_id = ?1 AND date = ?2`,
        ).bind(acct.act_id, date).first().catch(() => null);
        if (prior?.status === 'sent') return json({ error: 'this brief was already sent to the client — it cannot be un-sent' }, 400);
        const r = await env.DB.prepare(
          `UPDATE briefs SET status = 'skipped' WHERE act_id = ?1 AND date = ?2 AND status <> 'sent'`,
        ).bind(acct.act_id, date).run();
        if (!r.meta?.changes) {
          // No draft for that day yet — record the skip anyway, so a day that
          // was never drafted still stops the catch-up carrying it forward.
          await upsertBrief(env, acct.act_id, date, 'skipped', null, 'Skipped — deliberately not sent to the client.', null);
        }
        return json({ ok: true, date, skipped: true });
      }
      /* Build (or rebuild) today's draft by hand, for a brand set to review. */
      if (path === '/api/brief-draft' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(b.act).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        const date = b.date || addDays(localDate(acct.tz), -1);
        const r = await draftBrief(env, acct, date);
        return r.ok ? json(r) : json({ error: r.error || r.skipped }, 400);
      }
      if (path === '/api/briefs' && request.method === 'GET') {
        const act = url.searchParams.get('act');
        const { results } = await env.DB.prepare(
          `SELECT b.*, acc.name AS account_name FROM briefs b JOIN accounts acc ON acc.act_id = b.act_id
           ${act && act !== 'all' ? 'WHERE b.act_id = ?1' : ''} ORDER BY b.date DESC LIMIT 60`,
        ).bind(...(act && act !== 'all' ? [act] : [])).all();
        return json({ rows: results });
      }

      /* ---- Weekly / Monthly reports (interface = Mobius Profit's Reports tab) ---- */
      if (path === '/api/reports' && request.method === 'GET') {
        const act = url.searchParams.get('act');
        const { results } = await env.DB.prepare(
          `SELECT r.act_id, r.period, r.period_start, r.period_end, r.status, r.generated_at, r.sent_at,
                  acc.name AS account_name, acc.currency
           FROM reports r JOIN accounts acc ON acc.act_id = r.act_id
           ${act && act !== 'all' ? 'WHERE r.act_id = ?1' : ''}
           ORDER BY r.period_start DESC, r.period LIMIT 80`,
        ).bind(...(act && act !== 'all' ? [act] : [])).all();
        return json({ rows: results, lastRun: safeJson(await getSetting(env, 'lastReportRun'), null) });
      }
      if (path === '/api/report' && request.method === 'GET') {
        const row = await env.DB.prepare(
          `SELECT * FROM reports WHERE act_id = ?1 AND period = ?2 AND period_start = ?3`,
        ).bind(url.searchParams.get('act'), url.searchParams.get('period'), url.searchParams.get('start')).first();
        if (!row) return json({ error: 'no report for that period' }, 404);
        const { data_json, ...rest } = row;
        return json({ ...rest, data: safeJson(data_json, null) });
      }
      if (path === '/api/report-generate' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(b.act).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        const period = b.period || 'weekly';
        let start = b.start;
        if (!start) {          // default: the last COMPLETE period, in Central time
          const today = localDate(BRIEF_TZ);
          if (period === 'weekly') {
            const dow = new Date(today + 'T12:00:00Z').getUTCDay();          // 0 = Sunday
            const mondayThisWeek = addDays(today, -((dow + 6) % 7));
            start = addDays(mondayThisWeek, -7);
          } else start = `${prevMonth(monthOf(today))}-01`;
        }
        await syncTwDaily(env, acct, period === 'monthly' ? 100 : 70).catch(() => {});
        try {
          const r = await makeReport(env, acct, period, start, { force: !!b.force });
          return json({ ok: true, period, start: r.start, end: r.end,
            narrative_error: r.narrative_error ?? null, missing_days: r.data.missing_days ?? 0 });
        } catch (e) { return json({ error: e.message }, 400); }
      }
      if (path === '/api/report-summary' && request.method === 'PUT') {
        const b = await request.json().catch(() => ({}));
        const r = await env.DB.prepare(
          `UPDATE reports SET summary = ?4 WHERE act_id = ?1 AND period = ?2 AND period_start = ?3 AND status = 'draft'`,
        ).bind(b.act, b.period, b.start, b.summary ?? '').run();
        if (!r.meta?.changes) return json({ error: 'no draft report for that period (a sent report is frozen)' }, 404);
        return json({ ok: true });
      }
      if (path === '/api/report-send' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(b.act).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        try { return json(await sendReport(env, acct, b.period, b.start)); }
        catch (e) { return json({ error: e.message }, 400); }
      }
      if (path === '/api/report-link' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const acct = await env.DB.prepare(`SELECT act_id FROM accounts WHERE act_id = ?1`).bind(b.act).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        return json({ ok: true, url: `${DASHBOARD_URL}?reports=${await reportToken(env, b.act)}` });
      }

      if (path === '/api/summarise' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(b.from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(b.to || '')) {
          return json({ error: 'from/to must be YYYY-MM-DD' }, 400);
        }
        return json(await writeUpdate(env, b));
      }

      /* ---- settings ---- */
      if (path === '/api/password' && request.method === 'PUT') {
        const { password } = await request.json();
        if (!password || password.length < 6) return json({ error: 'password too short' }, 400);
        await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('passwordHash', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
          .bind(await sha256hex(password)).run();
        return json({ ok: true });
      }

      return json({ error: 'not found' }, 404);
    } catch (e) {
      console.log('error', e.message, e.stack);
      return json({ error: e.message }, 500);
    }
  },
};
