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
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
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
    fields: 'ad_id,ad_name,adset_id,campaign_id,spend,impressions,actions,action_values',
    limit: 500,
  }, 25);
  const daily = rows.filter(r => r.ad_id).map(r => [acct.act_id, r.ad_id, r.date_start, +r.spend || 0, +r.impressions || 0,
    pickAction(r.actions, PURCHASE_TYPES), pickAction(r.action_values, PURCHASE_TYPES)]);
  const stmts = [];
  for (let i = 0; i < daily.length; i += 14) {
    const chunk = daily.slice(i, i + 14);
    stmts.push(env.DB.prepare(
      `INSERT INTO ad_daily (act_id, ad_id, date, spend, impressions, purchases, revenue) VALUES ` +
      chunk.map(() => '(?,?,?,?,?,?,?)').join(',') +
      ` ON CONFLICT(act_id, ad_id, date) DO UPDATE SET spend = excluded.spend, impressions = excluded.impressions,
        purchases = excluded.purchases, revenue = excluded.revenue`,
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
  for (let i = 0; i < stmts.length; i += 30) await env.DB.batch(stmts.slice(i, i + 30));
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
  for (let i = 0; i < stmts.length; i += 30) await env.DB.batch(stmts.slice(i, i + 30));
  return vals.length;
}

/** Resumable ad-level sync. Backfill walks backwards 14 days at a time until 90 days are
 *  in; once done, each call is a cheap 3-day resync. Errors land in accounts.last_error. */
async function syncAdDaily(env, acct, { maxSlices = 2 } = {}) {
  const today = localDate(acct.tz);
  try {
    if (acct.ads_backfill_done) {
      const n = await syncAdSlice(env, acct, addDays(today, -RESYNC_DAYS), today);
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
    if (done) await env.DB.prepare(`UPDATE accounts SET ads_backfill_done = 1 WHERE act_id = ?1`).bind(acct.act_id).run();
    await updFirstSpend(env, acct.act_id);
    await syncAdMeta(env, acct);
    return { rows: total, done, daysDone: Math.min(BACKFILL_DAYS, Math.max(0, ymdDiff(today, cursor))), daysTotal: BACKFILL_DAYS };
  } catch (e) {
    await env.DB.prepare(`UPDATE accounts SET last_error = ?2 WHERE act_id = ?1`).bind(acct.act_id, `ad sync: ${e.message}`).run().catch(() => {});
    return { error: e.message };
  }
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
    out.ad = await syncAdDaily(env, acct, { maxSlices: 8 });
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

async function twSummary(env, shopDomain, start, end) {
  const res = await fetch('https://api.triplewhale.com/api/v2/summary-page/get-data', {
    method: 'POST',
    headers: { 'x-api-key': env.TW_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ shopDomain, period: { start, end }, todayHour: 24 }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Triple Whale: ${body.message || body.error || `HTTP ${res.status}`}`);
  // Normalise to {name: value} — TW's response shape has varied across versions.
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
const TW_KEEP = /sales|revenue|spend|adcost|cost|profit|cogs|orders|\bmer\b|roas|refund|shipping|fees|ads/i;
const TW_SALES = ['netSales', 'totalSales'];   // "Net Sales" line: Total Sales first, Order Revenue fallback

/** Per-day series out of a summary-page response: {metricId: {date: value}}.
 *  charts.current x = zero-based day-of-year in the shop's timezone (verified 2026-08-20). */
function twDailySeries(raw, start, end) {
  const out = {};
  if (!Array.isArray(raw?.metrics)) return out;
  const startY = +start.slice(0, 4), endY = +end.slice(0, 4);
  const doyToDate = x => {
    for (const y of startY === endY ? [startY] : [startY, endY]) {
      const d = new Date(Date.UTC(y, 0, 1) + x * 86400e3).toISOString().slice(0, 10);
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
  const start = addDays(today, -Math.min(days, 120));
  const res = await twSummary(env, acct.tw_shop, start, today);
  const daily = twDailySeries(res.raw, start, today);
  const stmts = [];
  for (const [id, byDate] of Object.entries(daily))
    for (const [date, v] of Object.entries(byDate))
      stmts.push(env.DB.prepare(
        `INSERT INTO tw_daily (act_id, date, metric, value, synced_at) VALUES (?1,?2,?3,?4,datetime('now'))
         ON CONFLICT(act_id, date, metric) DO UPDATE SET value = excluded.value, synced_at = excluded.synced_at`,
      ).bind(acct.act_id, date, id, v));
  for (let i = 0; i < stmts.length; i += 40) await env.DB.batch(stmts.slice(i, i + 40));
  if (Array.isArray(res.raw?.metrics)) {
    await putSetting(env, `twCatalog:${acct.act_id}`,
      JSON.stringify(res.raw.metrics.map(m => ({ id: m.metricId ?? m.id, title: m.title })).slice(0, 400))).catch(() => {});
  }
  return { name: acct.name, ok: true, metrics: Object.keys(daily).length, from: start, to: today, rows: stmts.length };
}

/** Suggested monthly goals from the trailing 28 full days: run-rate sales/spend, trailing aMER. */
async function suggestGoals(env, acct) {
  const today = localDate(acct.tz);
  const from = addDays(today, -28);
  const { results } = await env.DB.prepare(
    `SELECT date, metric, value FROM tw_daily WHERE act_id = ?1 AND date >= ?2 AND date < ?3
     AND metric IN ('netSales','totalSales','newCustomerSales','blendedAds','ga_adCost','grossProfit','totalProductCosts','totalPaymentGatewayCosts')`,
  ).bind(acct.act_id, from, today).all();
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
    const s = piv.netSales?.[d] ?? piv.totalSales?.[d] ?? 0;
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
  const negatives = dayMargins.filter(m => m < 0).length;
  const spread = hi - lo;
  const out = { verdict: 'good', days: n, blended, spread, negatives, p10: lo, p90: hi };
  if (negatives > 0 || blended <= 0.15 || spread > 0.6) {
    out.verdict = 'broken';
    out.reason = negatives > 0
      ? `${negatives} of the last ${n} days show costs above revenue — some products are missing or mis-set COGS in Triple Whale`
      : blended <= 0.15
      ? `trailing margin of ${Math.round(blended * 100)}% is implausibly thin — COGS in Triple Whale looks wrong`
      : `daily margin swings ${Math.round(lo * 100)}%–${Math.round(hi * 100)}%, which means only some products have COGS set`;
  } else if (spread > 0.4) {
    out.verdict = 'noisy';
    out.reason = `daily margin ranges ${Math.round(lo * 100)}%–${Math.round(hi * 100)}% — likely a few products missing COGS`;
  }
  return out;
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

  // Day-of-week weights from the 28 days before the month started — fixed all month,
  // so the plan doesn't shift under the client's feet mid-month.
  const dow = d => new Date(d + 'T12:00:00Z').getUTCDay();
  const wSum = Array(7).fill(0), wN = Array(7).fill(0);
  let newRevSum = 0, salesSum = 0, marginNum = 0, marginDen = 0;
  const dayMargins = [];                     // per-day pre-ad-spend margin, for the COGS sanity check
  for (let i = 1; i <= 28; i++) {
    const d = addDays(monthStart, -i);
    const s = twDay(piv, d, TW_SALES) ?? meta[d]?.revenue ?? null;
    if (s == null) continue;
    wSum[dow(d)] += s; wN[dow(d)]++;
    salesSum += s;
    newRevSum += piv.newCustomerSales?.[d] ?? 0;
    const gp = piv.grossProfit?.[d] ?? (piv.totalProductCosts?.[d] != null ? s - piv.totalProductCosts[d] - (piv.totalPaymentGatewayCosts?.[d] ?? 0) : null);
    if (gp != null && s > 0) { marginNum += gp; marginDen += s; dayMargins.push(gp / s); }
  }
  const haveW = wN.filter(Boolean).length === 7 && wN.reduce((a, b) => a + b, 0) >= 14;
  const wAvg = wSum.map((s, i) => wN[i] ? s / wN[i] : 1);
  const newShare = salesSum > 0 && newRevSum > 0 ? newRevSum / salesSum : null;
  const margin28 = marginDen > 0 ? marginNum / marginDen : null;   // trailing pre-ad-spend margin
  const cogsQuality = judgeCogs(dayMargins, margin28);

  let wTotal = 0;
  const dayW = {};
  for (let d = 1; d <= dim; d++) {
    const date = `${ym}-${String(d).padStart(2, '0')}`;
    const w = haveW ? wAvg[dow(date)] : 1;
    dayW[date] = w; wTotal += w;
  }

  const cmPct = goals?.cm_pct ?? null;
  const fcMargin = cmPct ?? margin28;            // forecast-side margin: explicit % beats trailing actuals
  const days = [];
  for (let d = 1; d <= dim; d++) {
    const date = `${ym}-${String(d).padStart(2, '0')}`;
    const f = {};
    if (goals?.sales != null) f.sales = goals.sales * dayW[date] / wTotal;
    if (goals?.spend != null) f.spend = goals.spend / dim;
    if (f.sales != null && f.spend != null && fcMargin != null) f.cm = f.sales * fcMargin - f.spend;
    f.amer = goals?.amer ?? (newShare != null && f.sales != null && f.spend ? newShare * f.sales / f.spend : null);
    if (date > upTo) { days.push({ date, f, a: null }); continue; }
    const sales = twDay(piv, date, TW_SALES);
    const mrow = meta[date];
    const gSpend = piv.ga_adCost?.[date] ?? null;
    const blended = piv.blendedAds?.[date] ?? null;
    const a = {
      sales,
      new_rev: piv.newCustomerSales?.[date] ?? null,
      ret_rev: piv.rcRevenue?.[date] ?? (sales != null && piv.newCustomerSales?.[date] != null ? sales - piv.newCustomerSales[date] : null),
      spend: blended ?? (mrow || gSpend != null ? (mrow?.spend ?? 0) + (gSpend ?? 0) : null),
      meta_spend: mrow?.spend ?? null,
      google_spend: gSpend,
      meta_roas: mrow && mrow.spend ? mrow.revenue / mrow.spend : null,
      meta_purchases: mrow?.purchases ?? null,
      google_roas: piv.ga_ROAS?.[date] ?? null,
      blended_roas: piv.totalRoas?.[date] ?? null,
      gross_profit: piv.grossProfit?.[date] ?? null,
      cogs: piv.totalProductCosts?.[date] ?? null,
      fees: piv.totalPaymentGatewayCosts?.[date] ?? null,
    };
    a.amer = a.new_rev != null && a.spend ? a.new_rev / a.spend : null;
    // CM basis, most explicit first: margin% override → TW gross profit → TW COGS.
    a.cm = cmPct != null && sales != null && a.spend != null ? sales * cmPct - a.spend
      : a.gross_profit != null && a.spend != null ? a.gross_profit - (a.fees ?? 0) - a.spend
      : a.cogs != null && sales != null && a.spend != null ? sales - a.cogs - (a.fees ?? 0) - a.spend : null;
    a.cm_basis = cmPct != null ? 'margin' : a.gross_profit != null ? 'tw' : a.cogs != null ? 'cogs' : null;
    days.push({ date, f, a });
  }

  const done = days.filter(x => x.date <= upTo && x.a);
  const sum = (list, get) => { let s = 0, any = false; for (const x of list) { const v = get(x); if (v != null) { s += v; any = true; } } return any ? s : null; };
  const mtd = {
    sales: sum(done, x => x.a.sales), sales_f: sum(done, x => x.f.sales ?? null),
    spend: sum(done, x => x.a.spend), spend_f: sum(done, x => x.f.spend ?? null),
    cm: sum(done, x => x.a.cm), cm_f: sum(done, x => x.f.cm ?? null),
  };
  const lastSync = (await env.DB.prepare(`SELECT MAX(synced_at) AS t FROM tw_daily WHERE act_id = ?1`).bind(acct.act_id).first())?.t ?? null;
  return {
    account: { act_id: acct.act_id, name: acct.name, currency: acct.currency, tz: acct.tz },
    month: ym, up_to: upTo, goals, cm_pct: cmPct, margin_28d: margin28,
    cogs_quality: cmPct != null ? { verdict: 'override', reason: `using your ${Math.round(cmPct * 100)}% margin override` } : cogsQuality,
    weights: haveW ? 'day-of-week (trailing 28d)' : 'uniform (not enough history yet)',
    new_share_28d: newShare, days, mtd, tw_last_sync: lastSync,
    brief_enabled: !!acct.brief_enabled,
  };
}

/** The deterministic numbers block of the Slack brief (CTC's Forecasted/Actual shape). */
function buildBriefText(data, date, narrative) {
  const cur = data.account.currency;
  const day = data.days.find(x => x.date === date);
  const f = day?.f || {}, a = day?.a || {};
  const fm = n => n == null ? '—' : money(n, cur);
  const fx = n => n == null ? '—' : `${n.toFixed(2)}x`;
  const pct = (aV, fV) => aV != null && fV ? ` (${aV >= fV ? '+' : ''}${Math.round((aV / fV - 1) * 100)}% vs plan)` : '';
  const L = [`*Daily Brief — ${data.account.name} — ${date}*`];
  // A wrong contribution-margin number in front of a client is worse than no number:
  // when Triple Whale's cost data is unreliable we leave CM out entirely.
  const cmOk = data.cogs_quality?.verdict !== 'broken' && data.cogs_quality?.verdict !== 'none';
  if (cmOk) L.push(`Forecasted Contribution Margin: ${fm(f.cm)} · Actual: ${fm(a.cm)}${pct(a.cm, f.cm)}`);
  L.push(`Forecasted Net Sales: ${fm(f.sales)} · Actual: ${fm(a.sales)}${pct(a.sales, f.sales)}`);
  L.push(`Forecasted Total Spend: ${fm(f.spend)} · Actual: ${fm(a.spend)}${pct(a.spend, f.spend)}`);
  L.push(`Forecasted aMER: ${fx(f.amer)} · Actual: ${fx(a.amer)}`);
  const bits = [];
  if (a.new_rev != null) bits.push(`new ${fm(a.new_rev)}`);
  if (a.ret_rev != null) bits.push(`returning ${fm(a.ret_rev)}`);
  if (bits.length) L.push(`Revenue split: ${bits.join(' · ')}`);
  const ch = [];
  if (a.meta_spend != null) ch.push(`Meta ${fm(a.meta_spend)}${a.meta_roas != null ? ` at ${fx(a.meta_roas)} (Meta-attributed)` : ''}`);
  if (a.google_spend != null) ch.push(`Google ${fm(a.google_spend)}${a.google_roas != null ? ` at ${fx(a.google_roas)}` : ''}`);
  if (ch.length) L.push(`Channels: ${ch.join(' · ')}`);
  const m = data.mtd;
  if (m.sales != null && m.sales_f) {
    L.push(`MTD: Net Sales ${fm(m.sales)} vs ${fm(m.sales_f)} plan (${m.sales >= m.sales_f ? '+' : ''}${Math.round((m.sales / m.sales_f - 1) * 100)}%)` +
      (m.spend != null && m.spend_f ? ` · Spend ${fm(m.spend)} vs ${fm(m.spend_f)}` : ''));
  }
  if (m.sales != null && data.goals?.sales) {
    // Plan-share projection: how the month lands if we keep hitting the same % of plan.
    const daysDone = data.days.filter(x => x.date <= date && x.a?.sales != null).length;
    const proj = m.sales_f ? m.sales / m.sales_f * data.goals.sales : daysDone ? m.sales / daysDone * data.days.length : null;
    if (proj != null) L.push(`Projected month: Net Sales ${fm(proj)} vs ${fm(data.goals.sales)} goal (${proj >= data.goals.sales ? '+' : ''}${Math.round((proj / data.goals.sales - 1) * 100)}%)`);
  }
  const wk = data.week;
  if (wk) {
    L.push('', `*Week in review — ${wk.from} → ${wk.to}*`);
    L.push(`Net Sales ${fm(wk.a.sales)} vs ${fm(wk.f.sales)} plan${pct(wk.a.sales, wk.f.sales)} · Spend ${fm(wk.a.spend)} vs ${fm(wk.f.spend)}${cmOk ? ` · CM ${fm(wk.a.cm)} vs ${fm(wk.f.cm)}` : ''} · aMER ${fx(wk.a.amer)}`);
    if (wk.best) L.push(`Best day ${wk.best.date} (${fm(wk.best.sales)}) · slowest ${wk.worst.date} (${fm(wk.worst.sales)})`);
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
• 3–5 bullets: the facts that matter — beats/misses vs plan with the %, streaks across recent days, new vs returning revenue, per-channel reads. Conclusion first in every bullet.
So What?
2–4 sentences: the single interpretation that best explains the day — tie performance moves to the changes we made when the change log supports it, and say whether this reads as a demand problem, a platform problem, or our own levers.
What's Next?
• 1–3 bullets: concrete actions or watch-items with a trigger ("if X doesn't improve today, we do Y").
Rules: use ONLY the numbers provided — never invent or extrapolate figures. Money in the account's own currency. Meta-attributed conversions keep settling for ~72h — hedge recent Meta ROAS reads accordingly. aMER = new-customer revenue ÷ total ad spend. Keep the whole narrative under 160 words — short, punchy bullets, not paragraphs disguised as bullets. Slack bold is *single asterisks*; never use ** double asterisks or markdown headers. No greeting, no sign-off, no preamble.`;

async function writeBriefNarrative(env, acct, data, date) {
  const f2 = n => n == null ? '—' : String(Math.round(n * 100) / 100);
  const lines = data.days.filter(x => x.date <= date).slice(-14).map(x =>
    `${x.date}: forecast sales ${f2(x.f.sales)} spend ${f2(x.f.spend)} CM ${f2(x.f.cm)} aMER ${f2(x.f.amer)} | actual sales ${f2(x.a?.sales)} new ${f2(x.a?.new_rev)} returning ${f2(x.a?.ret_rev)} spend ${f2(x.a?.spend)} (Meta ${f2(x.a?.meta_spend)}, Google ${f2(x.a?.google_spend)}) CM ${f2(x.a?.cm)} aMER ${f2(x.a?.amer)} MetaROAS ${f2(x.a?.meta_roas)} GoogleROAS ${f2(x.a?.google_roas)}`);
  const { results: evs } = await env.DB.prepare(
    `SELECT event_time, category, summary, reason, note FROM activities
     WHERE act_id = ?1 AND event_time >= ?2 AND confirmed != -1 ORDER BY event_time DESC LIMIT 40`,
  ).bind(acct.act_id, addDays(date, -7)).all();
  const evLines = evs.map(e => `- ${String(e.event_time).slice(0, 16).replace('T', ' ')} [${e.category}] ${e.summary}${e.reason ? ` {reason: ${e.reason}}` : ''}${e.note ? ` {note: ${e.note}}` : ''}`);
  return claude(env, {
    system: BRIEF_SYSTEM,
    maxTokens: 6000,   // opus-5 spends thinking tokens inside max_tokens; leave real headroom for the text
    user: `Client: ${data.account.name} (currency ${data.account.currency}). The brief covers ${date}.\n` +
      `Goals this month: ${JSON.stringify(data.goals)}. Meta ROAS floor: ${acct.target_roas ?? 'none'}. Forecast weighting: ${data.weights}.\n` +
      `Contribution margin basis: ${data.cm_pct != null ? `net sales × ${Math.round(data.cm_pct * 100)}% margin − ad spend` : 'Triple Whale cost data (gross profit, or net sales − COGS − payment fees) − ad spend'}.\n\n` +
      (data.cogs_quality && (data.cogs_quality.verdict === 'broken' || data.cogs_quality.verdict === 'none')
        ? `IMPORTANT: this client's cost data is unreliable (${data.cogs_quality.reason}). Contribution margin has been REMOVED from the numbers block - do NOT mention contribution margin, CM, profit or margin anywhere in your narrative. Build the story from net sales, spend, aMER and the channel reads instead.

`
        : data.cogs_quality?.verdict === 'noisy'
        ? `Note: this client's cost data is somewhat noisy (${data.cogs_quality.reason}) - treat contribution margin as directional, not exact.

`
        : '') +
      `Last ${lines.length} days (forecast | actual):\n${lines.join('\n')}\n\nMonth-to-date: ${JSON.stringify(data.mtd)}\n\n` +
      (data.week ? `This brief also carries a week-in-review block (${data.week.from} → ${data.week.to}): ${JSON.stringify(data.week)} — weigh the weekly picture in So What?/What's Next?, not just the single day.\n\n` : '') +
      `Changes we made in the last 7 days (from the Change Log):\n${evLines.length ? evLines.join('\n') : '- (none logged)'}`,
  });
}

/** Build the full brief for one account+day. Returns {data, text} or {data, error}.
 *  When `date` is a Sunday the Monday-morning send adds a week-in-review block. */
async function makeBrief(env, acct, date) {
  const data = await briefData(env, acct, date);
  const day = data.days.find(x => x.date === date);
  if (!data.goals) return { data, error: 'no goals set for this month — set them on the Daily Brief page' };
  if (!day?.a || day.a.sales == null) return { data, error: `no Triple Whale sales data for ${date} yet — try “Refresh Triple Whale data”` };
  if (new Date(date + 'T12:00:00Z').getUTCDay() === 0) {
    data.week = await weeklyBlock(env, acct, data, date).catch(() => null);
  }
  let narrative = null, narrative_error = null;
  try { narrative = await writeBriefNarrative(env, acct, data, date); } catch (e) { narrative_error = e.message; }
  return { data, text: buildBriefText(data, date, narrative), narrative_error };
}

/** Generate + post one brief to the brand's Slack channel; log it in `briefs`. */
async function sendBrief(env, acct, date) {
  const r = await makeBrief(env, acct, date);
  const upsert = (status, channel, text) => env.DB.prepare(
    `INSERT INTO briefs (act_id, date, posted_at, channel, status, text, data_json) VALUES (?1,?2,?3,?4,?5,?6,?7)
     ON CONFLICT(act_id, date) DO UPDATE SET posted_at = excluded.posted_at, channel = excluded.channel,
       status = excluded.status, text = excluded.text, data_json = excluded.data_json`,
  ).bind(acct.act_id, date, new Date().toISOString(), channel ?? null, status, text ?? null,
    JSON.stringify({ mtd: r.data?.mtd ?? null, day: r.data?.days?.find(x => x.date === date) ?? null })).run();
  if (r.error) { await upsert('skipped', null, r.error); return { name: acct.name, skipped: r.error }; }
  const channel = acct.slack_channel || await getSetting(env, 'slackChannel');
  if (!channel) { await upsert('skipped', null, 'no Slack channel configured for this brand'); return { name: acct.name, skipped: 'no Slack channel' }; }
  try {
    await slackPost(env, channel, r.text);
    await upsert('sent', channel, r.text);
    return { name: acct.name, ok: true, channel, date };
  } catch (e) {
    await upsert('error', channel, `${e.message}\n\n${r.text}`);
    return { name: acct.name, error: e.message };
  }
}

/** Morning cron: refresh TW data, then post yesterday's brief for every enabled brand. */
async function dailyBriefs(env) {
  const accounts = (await listAccounts(env, true)).filter(a => a.brief_enabled);
  const results = [];
  for (const a of accounts) {
    try {
      await syncTwDaily(env, a, 45).catch(() => {});
      results.push(await sendBrief(env, a, addDays(localDate(a.tz), -1)));
    } catch (e) { results.push({ name: a.name, error: e.message }); }
  }
  await putSetting(env, 'lastBriefRun', JSON.stringify({ at: new Date().toISOString(), results })).catch(() => {});
  return results;
}

/* ------------------------------------------------------------------ */
/*  Intraday pacing (Chat 4) — today's hourly curve vs the L7 shape    */
/* ------------------------------------------------------------------ */

/** Pull today + last 7 days of hourly spend live from Meta, cache in hourly_insights,
 *  and build today's cumulative curve vs the average last-7-days curve. */
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
  for (let i = 0; i < stmts.length; i += 40) await env.DB.batch(stmts.slice(i, i + 40));

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
/*  Creative rotation maths (Chat 3)                                   */
/* ------------------------------------------------------------------ */

/** Per-ad rollup for the selected window: who's carrying spend, who's earning it.
 *  Verdicts are relative to the account's own window CPA, never absolute benchmarks. */
async function adBreakdown(env, acct, windowDays, freshDays) {
  const today = localDate(acct.tz);
  const from = addDays(today, -windowDays);
  const { results } = await env.DB.prepare(
    `SELECT d.ad_id, a.name, a.first_spend_date, a.created_time,
            SUM(d.spend) AS spend, SUM(d.purchases) AS purchases, SUM(d.revenue) AS revenue, SUM(d.impressions) AS impressions
     FROM ad_daily d JOIN ads a ON a.act_id = d.act_id AND a.ad_id = d.ad_id
     WHERE d.act_id = ?1 AND d.date >= ?2 AND d.date < ?3
     GROUP BY d.ad_id HAVING SUM(d.spend) > 0
     ORDER BY spend DESC LIMIT 40`,
  ).bind(acct.act_id, from, today).all();
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
  return { window: windowDays, acct_cpa: acctCpa, total_spend: tot.spend, ads };
}

async function creative(env, acct, freshDays, windowDays) {
  const today = localDate(acct.tz);
  const from = addDays(today, -97);
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

  const winFrom = addDays(today, -windowDays), prevFrom = addDays(today, -2 * windowDays);
  const split = list => {
    const s = { freshSpend: 0, freshPurch: 0, staleSpend: 0, stalePurch: 0, ageSpend: 0, total: 0 };
    for (const r of list) {
      s.total += r.spend; s.ageSpend += r.age * r.spend;
      if (r.age <= freshDays) { s.freshSpend += r.spend; s.freshPurch += r.purchases; }
      else { s.staleSpend += r.spend; s.stalePurch += r.purchases; }
    }
    return s;
  };
  const cur = split(rows.filter(r => r.date >= winFrom));
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
    ads: await adBreakdown(env, acct, Math.max(windowDays, 7), freshDays),
    insight: half >= 3 ? {
      n: half,
      topShare: avgShare(ranked.slice(0, half)), topCpa: median(ranked.slice(0, half)),
      botShare: avgShare(ranked.slice(-half)), botCpa: median(ranked.slice(-half)),
    } : null,
  };
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

async function slackPost(env, channel, text, blocks) {
  // Post as "Mobius Account Health" (needs the chat:write.customize scope on the shared
  // bot); if that scope is missing, fall back to posting under the bot's default name.
  const send = payload => fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json().catch(() => ({})));
  const base = { channel, text, ...(blocks ? { blocks } : {}) };
  let j = await send({ ...base, username: 'Mobius Account Health', icon_emoji: ':bar_chart:' });
  if (!j.ok && /missing_scope|invalid_arg/i.test(j.error || '')) j = await send(base);
  if (!j.ok) throw new Error(`Slack: ${j.error || 'unknown error'}`);
}

/** Did an account stop delivering? Compares yesterday's spend to its own L7 median.
 *  Catches paused campaigns, billing failures and policy blocks the morning after. */
async function deliveryAlerts(env) {
  const out = [];
  for (const a of await listAccounts(env, true)) {
    const today = localDate(a.tz), y = addDays(today, -1);
    const { results } = await env.DB.prepare(
      `SELECT date, spend FROM daily_insights WHERE act_id = ?1 AND date >= ?2 AND date < ?3 ORDER BY date`,
    ).bind(a.act_id, addDays(today, -8), today).all();
    const yRow = results.find(r => r.date === y);
    const prior = results.filter(r => r.date !== y).map(r => r.spend).sort((x, z) => x - z);
    if (prior.length < 4) continue;                       // not enough history to judge
    const med = prior[Math.floor(prior.length / 2)];
    if (med < 50) continue;                               // tiny spender: skip, too noisy
    const spend = yRow?.spend ?? 0;
    if (spend <= med * 0.4) {
      out.push({ act: a, line: spend === 0
        ? `🚨 *${a.name}* spent *nothing* yesterday (normal day ≈ ${money(med, a.currency)}). Check billing, campaign status and policy.`
        : `⚠️ *${a.name}* spent ${money(spend, a.currency)} yesterday — ${Math.round((1 - spend / med) * 100)}% below its normal ${money(med, a.currency)}. Delivery may be throttled or something got paused.` });
    }
  }
  return out;
}

/** Nightly Slack alerts: pace drift + KPI breaches + delivery drops. Each brand posts to its own
 *  channel when one is set; brands without one share the default channel. */
async function paceAlerts(env) {
  if (!env.SLACK_BOT_TOKEN) return { skipped: 'no SLACK_BOT_TOKEN secret' };
  const def = await getSetting(env, 'slackChannel');
  const thr = +(await getSetting(env, 'paceAlertPct')) || 0.15;
  const data = await overview(env);
  const drops = await deliveryAlerts(env).catch(() => []);
  const byChannel = new Map();
  for (const a of data) {
    const parts = [];
    if (a.mtd.pace_pct != null && Math.abs(a.mtd.pace_pct) >= thr) {
      const m = a.mtd, dir = m.pace_pct > 0 ? 'over' : 'under';
      parts.push(`⏱ ${money(m.spend, a.currency)} MTD vs ${money(m.expected, a.currency)} expected (*${Math.round(Math.abs(m.pace_pct) * 100)}% ${dir}*) · projected ${money(m.projected, a.currency)} of ${money(m.budget, a.currency)} target`);
    }
    if (a.target_cpa && a.l7.cpa != null && a.l7.cpa > a.target_cpa * 1.05) {
      parts.push(`🎯 7d CPA ${money(a.l7.cpa, a.currency)} vs ${money(a.target_cpa, a.currency)} cap (*${Math.round((a.l7.cpa / a.target_cpa - 1) * 100)}% over*)`);
    }
    if (a.target_roas && a.l7.roas != null && a.l7.roas < a.target_roas * 0.95) {
      parts.push(`🎯 7d ROAS ${a.l7.roas.toFixed(2)}x vs ${a.target_roas}x floor`);
    }
    const drop = drops.find(d => d.act.act_id === a.act_id);
    if (drop) parts.unshift(drop.line);
    if (!parts.length) continue;
    const ch = a.slack_channel || def;
    if (!ch) continue;
    if (!byChannel.has(ch)) byChannel.set(ch, []);
    byChannel.get(ch).push(`*${a.name}*\n${parts.map(p => `  ${p}`).join('\n')}`);
  }
  if (!byChannel.size) return { ok: true, alerts: 0 };
  let alerts = 0;
  const results = [];
  for (const [ch, blocks] of byChannel) {
    alerts += blocks.length;
    try {
      await slackPost(env, ch, `Account Health: ${blocks.length} account${blocks.length > 1 ? 's' : ''} need attention`, [
        { type: 'section', text: { type: 'mrkdwn', text: blocks.join('\n\n') } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `<${DASHBOARD_URL}|Account Health> · ⏱ pace = MTD spend vs monthly target × month elapsed · 🎯 KPI = 7-day CPA/ROAS vs guardrails · checked nightly` }] },
      ]);
      results.push({ channel: ch, sent: blocks.length });
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
  const tw = [];
  for (const a of accounts) tw.push(await syncTwDaily(env, a, 10).catch(e => ({ name: a.name, error: e.message })));
  const pace = await paceAlerts(env).catch(e => ({ error: e.message }));
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('lastRun', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(JSON.stringify({ at: new Date().toISOString(), results, tw, pace })).run();
  return results;
}

export default {
  async scheduled(event, env, ctx) {
    // 03:30 UTC = nightly Meta/TW sync + pace alerts · 14:00 UTC (7am PT / 10am ET) = Daily Briefs
    if (event.cron === '0 14 * * *') ctx.waitUntil(dailyBriefs(env));
    else ctx.waitUntil(nightly(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (path === '/health') {
      const last = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'lastRun'`).first().catch(() => null);
      return json({ ok: true, lastRun: safeJson(last?.value, null), hasMetaToken: !!env.META_TOKEN, hasAnthropicKey: !!env.ANTHROPIC_API_KEY, hasSlackToken: !!env.SLACK_BOT_TOKEN, hasTwKey: !!env.TW_API_KEY });
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
        const numOrKeep = (v, keep) => v === '' ? null : (v ?? keep);
        await env.DB.prepare(
          `UPDATE accounts SET active = ?2, name = ?3, monthly_budget = ?4, budgets_json = ?5, tz = ?6,
             target_cpa = ?7, target_roas = ?8, slack_channel = ?9, tw_shop = ?10, goals_json = ?11, brief_enabled = ?12 WHERE act_id = ?1`,
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

      if (path === '/api/creative') {
        const act = url.searchParams.get('act');
        const freshDays = Math.min(+url.searchParams.get('fresh') || 14, 60);
        const windowDays = Math.min(+url.searchParams.get('window') || 14, 30);
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(act).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        let backfill = null;
        if (!acct.ads_backfill_done) backfill = await syncAdDaily(env, acct, { maxSlices: 3 });
        else {
          const missing = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ads WHERE act_id = ?1 AND created_time IS NULL`).bind(act).first();
          if (missing?.n > 0) ctx.waitUntil(syncAdMeta(env, acct).catch(() => {}));  // heal ages for pre-history ads
        }
        const r = await creative(env, acct, freshDays, windowDays);
        if (backfill && !backfill.done) r.backfill = backfill;   // progress or error for the banner
        return json(r);
      }

      if (path === '/api/share' && request.method === 'POST') {
        const { act_id } = await request.json().catch(() => ({}));
        const acct = await env.DB.prepare(`SELECT act_id FROM accounts WHERE act_id = ?1`).bind(act_id).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        const tokens = safeJson(await getSetting(env, 'shareTokens'), {});
        let token = Object.keys(tokens).find(k => tokens[k].act_id === act_id);   // one stable link per client
        if (!token) {
          token = crypto.randomUUID().replace(/-/g, '');
          tokens[token] = { act_id, created: new Date().toISOString() };
          await putSetting(env, 'shareTokens', JSON.stringify(tokens));
        }
        return json({ ok: true, url: `${DASHBOARD_URL}?share=${token}` });
      }
      if (path === '/api/share' && request.method === 'DELETE') {
        const { act_id } = await request.json().catch(() => ({}));
        const tokens = safeJson(await getSetting(env, 'shareTokens'), {});
        for (const k of Object.keys(tokens)) if (tokens[k].act_id === act_id) delete tokens[k];
        await putSetting(env, 'shareTokens', JSON.stringify(tokens));
        return json({ ok: true });
      }

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
          const r = await fetch(u, { headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } });
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
        const days = Math.min(+url.searchParams.get('days') || 70, 120);
        const accounts = (await listAccounts(env, true)).filter(a => !act || act === 'all' || a.act_id === act);
        const results = [];
        for (const a of accounts) results.push(await syncTwDaily(env, a, days).catch(e => ({ name: a.name, error: e.message })));
        return json({ ok: true, results });
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
        const r = await sendBrief(env, acct, date);
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
