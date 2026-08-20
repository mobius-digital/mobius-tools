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
const ACTIVITY_BACKFILL_DAYS = 90;
const DASHBOARD_URL = 'https://tools.go-mobius-digital.com/account-health/';

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

async function meta(env, path, params = {}) {
  if (!env.META_TOKEN) throw new MetaError('META_TOKEN secret is not set', 0);
  const url = new URL(`${GRAPH}/${path.replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  url.searchParams.set('access_token', env.META_TOKEN);
  const res = await fetch(url.toString());
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
    const res = await fetch(next);
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

async function discoverAccounts(env) {
  const rows = await metaAll(env, 'me/adaccounts', {
    fields: 'id,account_id,name,currency,timezone_name,account_status',
    limit: 200,
  });
  const stmts = rows.map(a => env.DB.prepare(
    `INSERT INTO accounts (act_id, name, currency, tz, account_status)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(act_id) DO UPDATE SET currency = excluded.currency, tz = excluded.tz,
       account_status = excluded.account_status`,
  ).bind(a.id, a.name || a.id, a.currency || 'USD', a.timezone_name || 'America/Chicago', a.account_status ?? null));
  if (stmts.length) await env.DB.batch(stmts);
  return rows.length;
}

async function listAccounts(env, activeOnly = false) {
  const q = `SELECT * FROM accounts ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY active DESC, name`;
  const { results } = await env.DB.prepare(q).all();
  return results.map(a => ({ ...a, budgets: safeJson(a.budgets_json, {}) }));
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
 *  additional_value:'Per day'|...}. Normalise both to {oldCents, newCents, cur, perStr}. */
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
  if (x.old_value != null && x.new_value != null && typeof x.old_value !== 'object') {
    return `${ev.translated_event_type || ev.event_type}: ${x.old_value} → ${x.new_value}${obj}`;
  }
  return `${ev.translated_event_type || ev.event_type}${obj}`;
}

async function syncActivities(env, acct, sinceISO) {
  const since = Math.floor(new Date(sinceISO).getTime() / 1000);
  const until = Math.floor(Date.now() / 1000);
  const rows = await metaAll(env, `${acct.act_id}/activities`, {
    fields: 'event_time,event_type,translated_event_type,actor_name,object_type,object_id,object_name,extra_data',
    since, until, limit: 500,
  }, 40);
  const stmts = rows.map(ev => {
    const cat = classify(ev);
    const id = ev.id || `${acct.act_id}:${ev.event_time}:${ev.event_type}:${ev.object_id || ''}`;
    return env.DB.prepare(
      `INSERT OR IGNORE INTO activities (id, act_id, event_time, event_type, translated, actor, object_type, object_id, object_name, extra_json, category, summary)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
    ).bind(id, acct.act_id, ev.event_time, ev.event_type || null, ev.translated_event_type || null,
      ev.actor_name || null, ev.object_type || null, ev.object_id || null, ev.object_name || null,
      typeof ev.extra_data === 'string' ? ev.extra_data : JSON.stringify(ev.extra_data ?? null),
      cat, summarise(ev, cat, acct.currency));
  });
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  await env.DB.prepare(`UPDATE accounts SET last_sync_activities = datetime('now') WHERE act_id = ?1`).bind(acct.act_id).run();
  return rows.length;
}

/** Full sync for one account. `days` overrides the insights window. */
async function syncAccount(env, acct, days) {
  const out = { act_id: acct.act_id, name: acct.name };
  try {
    const insightDays = days ?? (acct.last_sync_insights ? RESYNC_DAYS : BACKFILL_DAYS);
    out.insights = await syncInsights(env, acct, insightDays);
    const since = acct.last_sync_activities
      ? new Date(new Date(acct.last_sync_activities).getTime() - 6 * 3600e3).toISOString()  // 6h overlap
      : new Date(Date.now() - ACTIVITY_BACKFILL_DAYS * 86400e3).toISOString();
    out.activities = await syncActivities(env, acct, since);
  } catch (e) {
    out.error = e.message;
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
  const res = await fetch('https://api.anthropic.com/v1/messages', {
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
    const tags = [ev.reason && `reason: ${ev.reason}`, ev.note && `note: ${ev.note}`,
      ev.confirmed ? 'confirmed' : null, ev.manual ? 'manual entry' : null].filter(Boolean);
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
      `SELECT event_time, category, summary, actor, reason, note, confirmed, manual FROM activities
       WHERE act_id = ?1 AND event_time >= ?2 AND event_time <= ?3 AND confirmed != -1 ORDER BY event_time`,
    ).bind(a.act_id, from, to + 'T23:59:59').all();
    const cur = agg((await env.DB.prepare(`SELECT * FROM daily_insights WHERE act_id = ?1 AND date BETWEEN ?2 AND ?3`).bind(a.act_id, from, to).all()).results);
    const prev = agg((await env.DB.prepare(`SELECT * FROM daily_insights WHERE act_id = ?1 AND date BETWEEN ?2 AND ?3`).bind(a.act_id, prevFrom, prevTo).all()).results);
    packs.push(packAccount(a, cur, prev, evs, from, to));
  }
  const text = await claude(env, {
    system: tpl.system,
    user: `Window: ${from} to ${to} (previous window ${prevFrom}..${prevTo} for comparison).\n\n${packs.join('\n\n')}`,
  });
  return { text, template: template || 'daily', model: ANTHROPIC_MODEL, from, to, accounts: accounts.map(a => a.name) };
}

/* ------------------------------------------------------------------ */
/*  Overview maths (all clients in one table)                          */
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

async function overview(env) {
  const accounts = await listAccounts(env, true);
  const out = [];
  for (const a of accounts) {
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
    out.push({
      act_id: a.act_id, name: a.name, currency: a.currency, tz: a.tz, today,
      last_sync_insights: a.last_sync_insights, last_sync_activities: a.last_sync_activities, last_error: a.last_error,
      today_spend: byDate[today]?.spend ?? null,
      mtd: { spend: mtd, budget, expected, pace_pct: expected ? mtd / expected - 1 : null,
        projected: elapsed > 0.02 ? mtd / elapsed : null, elapsed,
        last_month_same_day: lastMonthSameDay, last_month_total: lastMonthTotal,
        vs_last_month_pct: lastMonthSameDay ? mtd / lastMonthSameDay - 1 : null },
      l7: agg(range(7)), l30: agg(range(30)), prev7: agg(range(7, 8)), prev30: agg(range(30, 31)),
      days_of_data: rows.length,
      changes_24h: (await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM activities WHERE act_id = ?1 AND event_time >= ?2`,
      ).bind(a.act_id, new Date(Date.now() - 86400e3).toISOString()).first())?.n ?? 0,
    });
  }
  return out;
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
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  const info = await res.json().catch(() => ({}));
  if (!res.ok || info.aud !== env.GOOGLE_CLIENT_ID) return { error: 'Invalid Google token', status: 401 };
  if (info.email_verified !== 'true' && info.email_verified !== true) return { error: 'Email not verified', status: 401 };
  if (!(await emailAllowed(env, info.email))) return { error: `${info.email} is not a Mobius account`, status: 403 };
  const s = await mintSession(env, info.email);
  return { ...s, name: info.name || '', picture: info.picture || '' };
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

async function nightly(env) {
  const accounts = await listAccounts(env, true);
  const results = [];
  for (const a of accounts) results.push(await syncAccount(env, a));
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('lastRun', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(JSON.stringify({ at: new Date().toISOString(), results })).run();
  return results;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(nightly(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (path === '/health') {
      const last = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'lastRun'`).first().catch(() => null);
      return json({ ok: true, lastRun: safeJson(last?.value, null), hasMetaToken: !!env.META_TOKEN, hasAnthropicKey: !!env.ANTHROPIC_API_KEY });
    }
    if (path === '/' ) return Response.redirect(DASHBOARD_URL, 302);

    if (path === '/api/google-login' && request.method === 'POST') {
      const { credential } = await request.json().catch(() => ({}));
      const r = await googleLogin(env, credential);
      return r.error ? json({ error: r.error }, r.status) : json(r);
    }

    if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);

    if (path === '/api/me') {
      const sess = await verifySession(env, (request.headers.get('Authorization') || '').slice(7));
      return json({ email: sess?.email || null, exp: sess?.exp || null, master: !sess });
    }

    try {
      /* ---- accounts ---- */
      if (path === '/api/accounts' && request.method === 'GET') {
        return json({ accounts: await listAccounts(env) });
      }
      let m;
      if ((m = path.match(/^\/api\/accounts\/(act_\d+)$/)) && request.method === 'PUT') {
        const body = await request.json();
        const cur = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(m[1]).first();
        if (!cur) return json({ error: 'unknown account' }, 404);
        await env.DB.prepare(
          `UPDATE accounts SET active = ?2, name = ?3, monthly_budget = ?4, budgets_json = ?5, tz = ?6 WHERE act_id = ?1`,
        ).bind(m[1],
          body.active != null ? (body.active ? 1 : 0) : cur.active,
          body.name ?? cur.name,
          body.monthly_budget === '' ? null : (body.monthly_budget ?? cur.monthly_budget),
          body.budgets ? JSON.stringify(body.budgets) : cur.budgets_json,
          body.tz ?? cur.tz,
        ).run();
        // First activation → kick off a backfill in the background.
        if (body.active && !cur.active && !cur.last_sync_insights) {
          const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(m[1]).first();
          ctx.waitUntil(syncAccount(env, acct));
        }
        return json({ ok: true });
      }
      if (path === '/api/discover' && request.method === 'POST') {
        const n = await discoverAccounts(env);
        return json({ ok: true, found: n, accounts: await listAccounts(env) });
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
