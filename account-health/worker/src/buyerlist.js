/* THE BUYER LIST (2026-10-26, Cole approved in chat). Ahsan stepped back to creative strategy; Cole runs media buying
 * until he hires a buyer. Ad changes kept falling through the cracks, and the brand internal channels were full of ad
 * call posts nobody read (~45 calls a day). So: ONE list across every brand, one shared memory of what was done, and
 * ONE Slack post a day instead of a calls line and a thread on every brand's morning card.
 *
 * Rows, sorted by money at stake (biggest first):
 *   ad calls        profit /api/hub/today (hub.js buyerList, read as the owner over the PROFIT binding, todaypost.js
 *                   readToday): Scale / Cut / Trim / Refresh / Mixed. Mixed has no Do (the buyer decides).
 *   test minimums   due off today (minoff.js state for today when it ran, else asana-brand.js testMinimumsDue live,
 *                   cached in settings `buyerMin:<date>` for 6 hours). Do = /api/meta/write kind min_spend, min 0.
 *   launches        Production cards in Ready with approved ads not on Meta yet (production.js listBoard + prodwork.js
 *                   adsOf, minus p_launch). Do = the existing Launch to Meta window (ads created paused).
 *                   LAUNCH DAYS (2026-10-26, Cole): a card is a to-do only on a launch day (settings.launchDays, default
 *                   "mon,thu", Central) or, when it has its own launch_on date, on or after that date (any weekday).
 *                   Any other day it waits: list.next_launch {date, day, n} = the quiet "Next launch: Thursday, N cards".
 *
 * Launched and scheduled (the page section and two lines of the daily post):
 *   scheduled       Ready / Review cards with a future launch_on, plus Ready cards with approved ads waiting for the next
 *                   launch day (date = that day). Sorted by date.
 *   launched        p_launch rows of the last 30 days, newest first (date, brand, ad, ad set, who, Meta status as last
 *                   read; GET /api/buyer-list/launched?refresh=1 reads it live from Meta, one ads read per account).
 *
 * Shared state, never localStorage (table p_buyer_state, one row per brand + object + action):
 *   Done  = quiet 3 days on that object.   Skip = quiet until tomorrow (Central).   Clear = back on the list.
 *   Watch: any p_meta_write on the object in the last 3 days (not undone) also hides its calls, so a change is given
 *   3 days before it is judged again. Ads > Today's calls reads the same state (GET /api/buyer-list/state).
 *
 * Slack: buyerPostTick posts ONE message a day from the morning hour (settings.morningHour) to settings.buyerChannel
 * (default #daily-briefs): "Buyer list: N to do across B brands, $X at stake", the owner, the top 5 lines, Open in
 * Locus. Switch: settings.buyerPost ('off' stops it, and then the morning cards carry the calls again).
 * Owner: settings.buyerOwner (default Cole), shown on the page and tagged in the post.
 *
 * Routes (team only; a client login is refused by brandguard, these are not on its allowlist):
 *   GET  /api/buyer-list?act=all|<brand>         the list, the owner and the settings
 *   GET  /api/buyer-list/state?act=all|<brand>   the quiet rows and the watched objects (Today's calls)
 *   POST /api/buyer-list/state {act, object, action, status: done|skipped|clear, name}
 *   PUT  /api/buyer-list/settings {buyerOwner?, buyerChannel?, buyerPost?}
 *   GET  /api/buyer-list/preview                 the Slack post as it would go out now (nothing posted)
 *   POST /api/buyer-list/post {channel}          post it now to that channel (a test; the daily post is untouched) */
import { readToday } from './todaypost.js';
import { locksFor, lockedBy } from './drops.js';
import { eligible, morningHour } from './morningcard.js';
import { adsOf, isCarousel } from './prodwork.js';
import { gall } from './metawrite.js';
import { trybeBanners } from './trybe.js';
import { readAI, applyAI, aiPassDone, buyerAIOn, adNumbers, withCovers, metaActsOf, disagree, decide, lessonsFor, buyerAITick, spentToday, trackingCheck, DAY_CAP, POST_WAIT_HOURS, noDash, CARD_KINDS } from './buyerai.js';
import { laneBlocks } from './lane.js';

export const DEFAULT_BUYER_CHANNEL = 'C0C8UA53U3W';   // #daily-briefs
export const DEFAULT_OWNER = 'Cole';
export const DONE_DAYS = 3, WATCH_DAYS = 3;
export const TOP_N = 5;
export const DEFAULT_LAUNCH_DAYS = 'mon,thu';
export const LAUNCHED_DAYS = 30;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LAST_HOUR = 12;
const MIN_CACHE_MS = 6 * 3600e3;
const LOCUS = 'https://locus.go-mobius-digital.com/profit/';
const CALL_KINDS = ['scale', 'cut', 'trim', 'refresh', 'mixed'];
export const KINDS = [...CALL_KINDS, 'minoff', 'stalled', 'launch', 'ai'];

const safe = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const clean = (s, n = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = ymd => new Date(ymd + 'T12:00:00Z').getUTCDay();
const centralDay = iso => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(iso)); } catch { return String(iso || '').slice(0, 10); } };
const centralToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
const sym = c => (!c || c === 'USD' ? '$' : c === 'GBP' ? '£' : c === 'EUR' ? '€' : c === 'CAD' ? 'CA$' : c === 'AUD' ? 'A$' : c + ' ');
const money = (n, c) => sym(c) + Math.round(+n || 0).toLocaleString('en-US');
const moneyK = (n, c) => Math.abs(n) >= 1000 ? `${sym(c)}${(n / 1000).toFixed(1)}K` : money(n, c);
const mk = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dollars = n => '$' + (+n || 0).toLocaleString('en-US', { minimumFractionDigits: +n % 1 ? 2 : 0, maximumFractionDigits: 2 });

async function getSetting(env, k) { const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(k).first().catch(() => null); return r?.value ?? null; }
async function putSetting(env, k, v) { await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, String(v)).run(); }

/* ---------- settings ---------- */
export async function buyerPostOn(env) { return (await getSetting(env, 'buyerPost')) !== 'off'; }
export async function buyerSettings(env) {
  const ch = await getSetting(env, 'buyerChannel'), ow = await getSetting(env, 'buyerOwner');
  return { buyerOwner: clean(ow, 40) || DEFAULT_OWNER, buyerChannel: /^[CGU][A-Z0-9]{6,}$/.test(ch || '') ? ch : DEFAULT_BUYER_CHANNEL, buyerPost: await buyerPostOn(env),
    launchDays: normDays(await getSetting(env, 'launchDays')) || DEFAULT_LAUNCH_DAYS, buyerAI: await buyerAIOn(env) };
}
/** "mon, Thu" -> "mon,thu" (week order); null when no day is named. */
export function normDays(v) {
  const want = new Set(String(v || '').toLowerCase().split(/[\s,]+/).map(x => x.slice(0, 3)).filter(x => DAY_KEYS.includes(x)));
  return want.size ? DAY_KEYS.filter(k => want.has(k)).join(',') : null;
}
export const isLaunchDay = (ymd, days) => String(days || DEFAULT_LAUNCH_DAYS).split(',').includes(DAY_KEYS[weekday(ymd)]);
/** The first launch day after today (never today). */
export function nextLaunchDay(ymd, days) {
  for (let i = 1; i <= 7; i++) { const x = addDays(ymd, i); if (isLaunchDay(x, days)) return x; }
  return addDays(ymd, 7);
}
export const dayName = ymd => DAY_NAMES[weekday(ymd)];
export async function saveBuyerSettings(env, b) {
  if ('buyerOwner' in b) { const o = clean(b.buyerOwner, 40); if (!o) throw Object.assign(new Error('Pick who owns the list.'), { status: 400 }); await putSetting(env, 'buyerOwner', o); }
  if ('buyerChannel' in b) {
    const c = String(b.buyerChannel || '').trim();
    if (c && !/^[CGU][A-Z0-9]{6,}$/.test(c)) throw Object.assign(new Error('A Slack channel id (C0C8UA53U3W) or a person id for a DM (U06C37MDWD7).'), { status: 400 });
    await putSetting(env, 'buyerChannel', c);
  }
  if ('buyerPost' in b) await putSetting(env, 'buyerPost', b.buyerPost ? 'on' : 'off');
  if ('buyerAI' in b) await putSetting(env, 'buyerAI', b.buyerAI ? 'on' : 'off');
  if ('launchDays' in b) {
    const v = normDays(Array.isArray(b.launchDays) ? b.launchDays.join(',') : b.launchDays);
    if (!v) throw Object.assign(new Error('Pick at least one launch day.'), { status: 400 });
    await putSetting(env, 'launchDays', v);
  }
  return buyerSettings(env);
}

/* ---------- the shared state ---------- */
const STATE_SQL = `CREATE TABLE IF NOT EXISTS p_buyer_state (brand TEXT NOT NULL, object TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL,
  name TEXT, by TEXT, at TEXT NOT NULL, quiet_until TEXT NOT NULL, PRIMARY KEY (brand, object, action))`;
let tabled = false;
export async function ensureBuyer(env) {
  if (tabled) return;
  await env.DB.prepare(STATE_SQL).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_buyer_state_quiet ON p_buyer_state (quiet_until)`).run().catch(() => {});
  tabled = true;
}
/** done = quiet DONE_DAYS days; skipped = quiet until tomorrow; clear = back on the list. Dates are Central days. */
export async function setState(env, { act, object, action, status, name }, who, today = centralToday()) {
  await ensureBuyer(env);
  const brand = String(act || ''), obj = String(object || '').slice(0, 120), kind = String(action || '').slice(0, 40);
  if (!brand || !obj || !kind) throw Object.assign(new Error('Which call? (brand, object and action are needed)'), { status: 400 });
  if (status === 'clear') {
    await env.DB.prepare(`DELETE FROM p_buyer_state WHERE brand = ?1 AND object = ?2 AND action = ?3`).bind(brand, obj, kind).run();
    return { ok: true, cleared: true };
  }
  if (status !== 'done' && status !== 'skipped') throw Object.assign(new Error('Done, skipped or clear.'), { status: 400 });
  const until = addDays(today, status === 'done' ? DONE_DAYS : 1);
  const at = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO p_buyer_state (brand, object, action, status, name, by, at, quiet_until) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    ON CONFLICT(brand, object, action) DO UPDATE SET status = excluded.status, name = excluded.name, by = excluded.by, at = excluded.at, quiet_until = excluded.quiet_until`)
    .bind(brand, obj, kind, status, clean(name, 200) || null, clean(who, 120) || null, at, until).run();
  return { ok: true, status, quiet_until: until, by: who, at };
}
/** The quiet rows (quiet_until after today) and the objects Meta was changed on in the last WATCH_DAYS days. */
export async function readState(env, acts, today = centralToday()) {
  await ensureBuyer(env);
  const states = ((await env.DB.prepare(`SELECT brand, object, action, status, name, by, at, quiet_until FROM p_buyer_state WHERE quiet_until > ?1`).bind(today).all().catch(() => ({ results: [] }))).results || [])
    .filter(r => !acts || acts.has(r.brand));
  const since = new Date(Date.now() - WATCH_DAYS * 864e5).toISOString();
  const watched = ((await env.DB.prepare(`SELECT brand, object, action, summary, by, at FROM p_meta_write WHERE at >= ?1 AND undone IS NULL AND action != 'meta_undo' ORDER BY at DESC`).bind(since).all().catch(() => ({ results: [] }))).results || [])
    .filter(r => r.brand && (!acts || acts.has(r.brand)));
  return { today, states, watched };
}
/** Why a row is hidden: its own done / skip, or a Meta change on its object in the last 3 days. Null = shown. */
export function hiddenBy(row, st) {
  const s = st.states.find(x => x.brand === row.act_id && x.object === row.object && x.action === row.kind);
  if (s) return { why: s.status, by: s.by, at: s.at, until: s.quiet_until };
  if (row.kind !== 'launch') {
    const w = st.watched.find(x => x.brand === row.act_id && String(x.object) === String(row.object));
    if (w) return { why: 'watched', by: w.by, at: w.at, summary: w.summary };
  }
  return null;
}

/* ---------- the rows ---------- */
/* ONE-LINE ACTION, ONE-LINE WHY (2026-10-27, Cole: "what to do and why talks too much"). The action is a few words; the
   why is ONE line with at most 3 numbers ("$561 in 7 days, 0 sales, goal ROAS 2.2x"). The full reason (every number,
   the funnel role) stays in why_full, shown only under "Show ads". */
const ACTION = {
  scale: r => { const b = +(r && r.budget) || 0; return b > 0 ? `Raise budget ${dollars0(b)} to ${dollars0(Math.round(b * 1.2))}/day` : 'Raise budget 20%'; },
  cut: () => 'Pause this ad set', trim: () => 'Pause this ad', refresh: () => 'Brief a new version of the main ad',
  mixed: r => (r && (r.kept_by === 'opener' || r.kept_by === 'best_set') ? 'Keep it on' : r && r.kept_by === 'tracking_gap' ? 'Keep it on for now' : 'Your call'),
  minoff: () => 'Take the test minimum off', stalled: () => 'Pause this ad set', launch: n => `Launch ${n} approved ad${n === 1 ? '' : 's'}`,
};
const dollars0 = n => '$' + Math.round(+n || 0).toLocaleString('en-US');
const x1 = v => `${(+v || 0).toFixed(1).replace(/\.0$/, '')}x`;
const count = (n, w) => `${Number.isInteger(+n) ? +n : (+n).toFixed(1)} ${w}${Math.round(+n) === 1 ? '' : 's'}`;
/** The one-line why: at most 3 numbers, plain words. Falls back to the first sentence of the rule's reason. */
export function shortWhy(r) {
  const cur = r.currency || 'USD', m = r.judged_on || r.metric, sp = +r.spend || 0, days = r.days || 7, res = +(r.results ?? r.orders ?? 0) || 0;
  const unit = m === 'cpl' ? 'lead' : m === 'ncpa' ? 'new customer' : 'sale';
  const goal = m === 'roas' ? (r.goal_roas ? `goal ROAS ${x1(r.goal_roas)}` : '') : r.goal ? `goal ${money(r.goal, cur)}` : '';
  const join = (...xs) => xs.filter(Boolean).join(', ');
  const kind = r.kind === 'mixed' && r.kept_by === 'tracking_gap' ? r.was || 'cut' : r.kind;
  if (kind === 'scale' && res) return m === 'roas' ? join(`${count(res, unit)} at ROAS ${x1(r.roas)} in ${days} days`, goal) : join(`${count(res, unit)} at ${money(r.cpa, cur)} each in ${days} days`, goal);
  if ((kind === 'cut' || kind === 'trim') && sp > 0) {
    if (!res) return join(`${money(sp, cur)} in ${days} days`, `0 ${unit}s`, goal);
    return m === 'roas' ? join(`${money(sp, cur)} in ${days} days`, `ROAS ${x1(r.roas)}`, goal) : join(`${money(sp, cur)} in ${days} days`, `${money(r.cpa, cur)} a ${unit}`, goal);
  }
  if (r.kind === 'mixed' && r.kept_by === 'opener' && r.fc_results) return `It starts ${count(r.fc_results, unit)} other ads finish, on ${money(sp, cur)} in ${days} days`;
  if (r.kind === 'mixed' && r.kept_by === 'best_set') return join(`Your best set: ${count(res, unit)} on ${money(sp, cur)} in ${days} days`, goal);
  if (r.kind === 'refresh' && r.ctr && r.prev_ctr) return `The main ad gets ${Math.round((1 - r.ctr / r.prev_ctr) * 100)}% fewer clicks than last week`;
  return oneLine(r.why, 140);
}
/** One line of why: the first sentence of the call's reason, cut at a word. */
export function oneLine(s, n = 170) {
  const t = clean(s, 1000);
  const first = (t.match(/^.*?[.!?](?=\s|$)/) || [t])[0];
  const x = first.length >= 30 ? first : t;
  if (x.length <= n) return x;
  const cut = x.slice(0, n - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(n * 0.6))).replace(/[ ,;:.]+$/, '') + '…';
}
export function callRow(r) {
  const object = String(r.ad_id || r.adset_id || '');
  return { key: `${r.act_id}|${object}|${r.kind}`, kind: r.kind, act_id: r.act_id, brand: r.brand, currency: r.currency || 'USD', object,
    level: r.ad_id ? 'ad' : 'adset', name: r.ad || r.adset || '', set: r.ad ? r.adset || null : null, action: ACTION[r.kind](r),
    why: shortWhy(r), why_full: clean(r.why, 600), stake: Math.max(0, +r.stake || 0), do: r.kind === 'mixed' ? null : r.kind === 'scale' ? 'budget' : r.kind === 'refresh' ? 'brief' : 'pause',
    kept_by: r.kept_by || null, was: r.was || null, budget: r.set && r.set.budget != null ? +r.set.budget : null, fc_results: r.first_click ? r.first_click.fc_results ?? null : null,
    ctr: r.ctr ?? null, prev_ctr: r.prev_ctr ?? null,
    meta_act: r.meta_act || null, adset_id: r.adset_id || null, adset: r.adset || null, ad_id: r.ad_id || null, ad: r.ad || null, campaign_id: r.campaign_id || null,
    suggested_budget: r.suggested_budget || null, n_ads: r.n_ads || null, spend: r.spend ?? null, results: r.results ?? r.orders ?? null,
    /* the numbers the review flow shows and the AI reads (hub.js buyerList fields) */
    goal: r.goal ?? null, goal_roas: r.goal_roas ?? null, metric: r.judged_on || r.metric || null, cpa: r.cpa ?? null, roas: r.roas ?? null, revenue: r.revenue ?? null,
    days: r.days ?? null, role: r.role ?? null, top_ad: r.top_ad || null, anchor_ad: r.anchor && r.anchor.ad_id ? String(r.anchor.ad_id) : null };
}
/* THE NUDGE (2026-10-27): a minimum judged on how Meta spent past it (asana-brand.js nudgeCall) carries `nudge`:
   winner = minimum off and keep it, campaign = minimum off and let the campaign decide, not_picked = minimum off and
   pause (`then: 'pause'`, the page makes both writes). */
const NUDGE_ACTION = { winner: 'Take the minimum off, keep it', campaign: 'Take the minimum off', not_picked: 'Take the minimum off and pause' };
export function minRow(a, it) {
  const nudge = NUDGE_ACTION[it.nudge] ? it.nudge : null;
  const why = nudge ? oneLine(it.why, 140) : `Meta must spend ${dollars(it.min)} a day on it${it.day ? `, day ${it.day}` : ''}`;
  return { key: `${a.act_id}|${it.id}|minoff`, kind: 'minoff', act_id: a.act_id, brand: a.name, currency: a.currency || 'USD', object: String(it.id), level: 'adset',
    name: it.name, set: null, action: nudge ? NUDGE_ACTION[nudge] : ACTION.minoff(), why, why_full: clean(`Meta has to spend ${dollars(it.min)} a day on it; day ${it.day || '?'}, ${it.why}.`, 600),
    stake: Math.max(0, nudge === 'not_picked' || nudge === 'campaign' ? +it.spend || (+it.min || 0) * 7 : (+it.min || 0) * 7), do: 'minoff', adset_id: String(it.id), adset: it.name, min: +it.min || 0,
    nudge, then: nudge === 'not_picked' ? 'pause' : null };
}
/* NOT SPENDING (2026-11-03, Cole: "set it and forget it"): a live ad set in a live campaign that Meta stopped spending on
   (under STALL_SPEND in STALL_DAYS, no test minimum, on for STALL_DAYS+) is paused so the account stays clean. Read from the
   synced tables (meta_adsets, meta_campaigns, ads, ad_daily), no Meta call. Left alone: sets that start later or already
   ended (BFCM sets go up scheduled), lead and giveaway campaigns, sets started in the last STALL_DAYS days. */
export const STALL_DAYS = 7, STALL_SPEND = 20;
const LEADISH = /\b(lead|leads|giveaway|sweepstakes?|contest)\b/i;
const LEAD_GOALS = new Set(['LEAD_GENERATION', 'QUALITY_LEAD']);
export function stalledRow(a, s) {
  const cur = a.currency || 'USD', sp = +s.spend || 0;
  return { key: `${a.act_id}|${s.adset_id}|stalled`, kind: 'stalled', act_id: a.act_id, brand: a.name, currency: cur, object: String(s.adset_id), level: 'adset',
    name: s.name || '', set: null, action: ACTION.stalled(),
    why: `Meta stopped spending on it: ${sym(cur)}${dollars(sp).slice(1)} in ${STALL_DAYS} days. Pause it so the account stays clean.`,
    why_full: clean(`Live in "${s.campaign || 'its campaign'}" with no test minimum, on since ${String(s.start_time || s.created_time || '').slice(0, 10)}, and Meta spent ${dollars(sp)} on it in the last ${STALL_DAYS} days. Pause it so the account stays clean.`, 600),
    stake: 0, do: 'pause', meta_act: s.act_id || null, adset_id: String(s.adset_id), adset: s.name || '', campaign_id: s.campaign_id || null, spend: sp, days: STALL_DAYS };
}
/** The verdict on one synced ad set: true = it belongs on the list as "not spending". */
export function isStalled(s, now = Date.now()) {
  const t = iso => Date.parse(iso || '') || 0, cutoff = now - STALL_DAYS * 864e5;
  if (+s.spend >= STALL_SPEND) return false;
  if (!t(s.start_time) || t(s.start_time) > cutoff || (s.created_time && t(s.created_time) > cutoff)) return false;
  if (s.end_time && t(s.end_time) && t(s.end_time) < now) return false;
  return !(/LEAD/i.test(s.objective || '') || LEAD_GOALS.has(s.optimization_goal) || LEADISH.test(`${s.campaign || ''} ${s.name || ''}`));
}
/** Live ad sets Meta stopped spending on, per brand (see NOT SPENDING above). */
async function stalled(env, brands, today, now = Date.now()) {
  const out = [];
  const fresh = new Date(now - 864e5).toISOString().replace('T', ' ').slice(0, 19), from = addDays(today, -(STALL_DAYS - 1));
  for (const a of brands) {
    const acts = [...new Set([a.act_id, ...(await metaActsOf(env, a.act_id, null).catch(() => []))].filter(Boolean))];
    const ph = acts.map((_, i) => `?${i + 3}`).join(', ');
    const sets = (await env.DB.prepare(`SELECT s.act_id, s.adset_id, s.campaign_id, s.name, s.optimization_goal, s.created_time, s.start_time, s.end_time,
        c.name AS campaign, c.objective, (SELECT COALESCE(SUM(d.spend), 0) FROM ads x JOIN ad_daily d ON d.act_id = x.act_id AND d.ad_id = x.ad_id
          WHERE x.adset_id = s.adset_id AND d.date >= ?1) AS spend
      FROM meta_adsets s JOIN meta_campaigns c ON c.campaign_id = s.campaign_id
      WHERE s.act_id IN (${ph}) AND s.status = 'ACTIVE' AND c.status = 'ACTIVE' AND COALESCE(s.min_spend, 0) = 0 AND s.synced_at >= ?2 AND s.start_time IS NOT NULL`)
      .bind(from, fresh, ...acts).all()).results || [];
    for (const s of sets) if (isStalled(s, now)) out.push(stalledRow(a, s));
  }
  return out;
}
export function launchRow(c, n, { studio = null, work = 0 } = {}) {
  return { key: `${c.act_id}|${c.id}|launch`, kind: 'launch', act_id: c.act_id, brand: c.brand, currency: 'USD', object: String(c.id), level: 'card',
    name: `${c.num ? `#${c.num} ` : ''}${c.title || 'Untitled card'}`, set: null, action: ACTION.launch(n),
    why: oneLine(`Ready on Production with ${n} approved ad${n === 1 ? '' : 's'} not on Meta yet. They go up paused.`), stake: 0, do: 'launch',
    card_id: c.id, num: c.num || null, n_ads: n, studio_ad: work ? null : studio, work };
}

/** Test minimums due off per brand: today's minoff.js result when it ran, else a live read (cached 6 hours). */
async function minimums(env, d, brands, today, { live = true } = {}) {
  const st = safe(await getSetting(env, 'minOffDone'), {}) || {};
  const ran = st.date === today ? st.acts || {} : {};
  const cache = safe(await getSetting(env, `buyerMin:${today}`), {}) || {};
  let dirty = false;
  const out = [], notes = [];
  for (const a of brands) {
    let items = null;
    const s = String(ran[a.act_id] || '');
    if (/^posted/.test(s)) items = ((safe(await getSetting(env, `minOff:${a.act_id}:${today}`), null) || {}).items || []).filter(i => !i.done);
    else if (/^nothing due/.test(s)) items = [];
    else if (cache[a.act_id] && Date.now() - Date.parse(cache[a.act_id].at) < MIN_CACHE_MS) { items = cache[a.act_id].items || []; if (cache[a.act_id].err) notes.push(`${a.name}: ${cache[a.act_id].err}`); }
    else if (live && d.dueOff && (!d.canAfford || d.canAfford(40))) {
      try {
        const r = await d.dueOff(env, a.act_id);
        if (r && r.error) throw new Error(r.error);
        items = ((r && r.due) || []).map(x => ({ id: String(x.id), name: x.name, min: x.min, day: x.day, why: x.why, ...(x.nudge ? { nudge: x.nudge, spend: x.spend, orders: x.orders, then: x.then || null } : {}) }));
        cache[a.act_id] = { at: new Date().toISOString(), items }; dirty = true;
      } catch (e) { notes.push(`${a.name}: ${e.message}`); cache[a.act_id] = { at: new Date().toISOString(), items: [], err: e.message }; dirty = true; }
    }
    for (const it of items || []) out.push(minRow(a, it));
  }
  if (dirty) await putSetting(env, `buyerMin:${today}`, JSON.stringify(cache)).catch(() => {});
  return { rows: out, notes };
}
/** Production cards in Ready with approved ads that are not on Meta yet: due today (a launch day, or its own date has
 *  come) = a row; else waiting for its date. Review cards with a future launch_on are scheduled too. */
async function launches(env, d, brandIds, act, { today = centralToday(), days = DEFAULT_LAUNCH_DAYS } = {}) {
  if (!d.listBoard) return { rows: [], scheduled: [] };
  const board = await d.listBoard(env, { act: act === 'all' ? 'all' : act });
  const cardsAll = ((board && board.cards) || []).filter(c => brandIds.has(c.act_id));
  const dated = c => /^\d{4}-\d{2}-\d{2}$/.test(c.launch_on || '') ? c.launch_on : '';
  const scheduled = cardsAll.filter(c => c.board === 'review' && dated(c) > today).map(c => schedRow(c, null, dated(c), true));
  const ready = cardsAll.filter(c => c.board === 'ready').slice(0, 90);
  if (!ready.length) return { rows: [], scheduled: sortSched(scheduled) };
  const ids = ready.map(c => String(c.id)), ph = ids.map((_, i) => `?${i + 1}`).join(', ');
  const q = (sql) => env.DB.prepare(sql).bind(...ids).all().then(r => r.results || []).catch(() => []);
  const [files, comments, cards, launched, studio] = await Promise.all([
    q(`SELECT id, batch_id, ad, version, mime, name, created_at, kind FROM p_work_file WHERE kind = 'version' AND deleted_at IS NULL AND batch_id IN (${ph})`),
    q(`SELECT batch_id, file_id, kind, parent_id, fixed_at, author_name AS who, created_at FROM p_work_comment WHERE batch_id IN (${ph}) ORDER BY created_at`),
    q(`SELECT id, brief_json FROM p_br_batch WHERE id IN (${ph})`),
    q(`SELECT batch_id, work_file, studio_ad, cards FROM p_launch WHERE batch_id IN (${ph}) AND COALESCE(eff_status, '') NOT IN ('ARCHIVED', 'DELETED')`),
    q(`SELECT b.br_batch_id AS card, a.id FROM p_studio_ad a JOIN p_studio_batch b ON b.id = a.batch_id WHERE a.status = 'approved' AND b.br_batch_id IN (${ph}) ORDER BY a.created_at DESC`),
  ]);
  const studioLaunched = new Set((await env.DB.prepare(`SELECT studio_ad FROM p_launch WHERE studio_ad IS NOT NULL AND COALESCE(eff_status, '') NOT IN ('ARCHIVED', 'DELETED')`).all().catch(() => ({ results: [] }))).results?.map(r => r.studio_ad) || []);
  const out = [];
  for (const c of ready) {
    const id = String(c.id);
    const mine = launched.filter(l => String(l.batch_id) === id);
    const done = new Set(mine.flatMap(l => [l.work_file, ...((safe(l.cards, []) || []).map(x => (x && (x.file_id || x.work_file)) || x))].filter(Boolean).map(String)));
    const fs = files.filter(f => String(f.batch_id) === id), cs = comments.filter(x => String(x.batch_id) === id).map(x => ({ ...x, fixed: !!x.fixed_at }));
    const car = isCarousel((cards.find(x => String(x.id) === id) || {}).brief_json);
    const ok = fs.length ? adsOf(fs, cs, { carousel: car }).filter(a => a.status === 'approved') : [];
    const work = car ? (ok.length && !mine.length ? ok.length : 0) : ok.filter(a => !done.has(String(a.file_id))).length;
    const sa = studio.filter(s => String(s.card) === id && !studioLaunched.has(s.id));
    const n = work + (work ? 0 : sa.length);
    const on = dated(c);
    if (on > today) { if (n > 0 || !mine.length) scheduled.push(schedRow(c, n, on, true)); continue; }
    if (n <= 0) continue;
    const row = launchRow(c, n, { studio: sa[0] ? sa[0].id : null, work });
    if (on || isLaunchDay(today, days)) out.push(on ? { ...row, launch_on: on } : row);
    else scheduled.push(schedRow(c, n, nextLaunchDay(today, days), false));
  }
  return { rows: out, scheduled: sortSched(scheduled) };
}
export function schedRow(c, n, date, isDated) {
  return { key: `${c.act_id}|${c.id}|sched`, act_id: c.act_id, brand: c.brand, card_id: c.id, num: c.num || null,
    name: `${c.num ? `#${c.num} ` : ''}${c.title || 'Untitled card'}`, board: c.board, date, dated: !!isDated, n_ads: n };
}
const sortSched = a => a.sort((p, q) => String(p.date).localeCompare(String(q.date)) || String(p.brand).localeCompare(String(q.brand)));

/* ---------- READY AGAINST META (2026-11-05, the structure review; what /launch did by hand in chat) ----------
   Locus only knows an ad is on Meta when Locus launched it (p_launch). Batches loaded another way (the Graph loader, Ads
   Manager) stay "Ready, not on Meta" here. So for every Ready card, and every Review card with a date, ask Meta for ads and
   ad sets NAMED with the card's number (ad.name / adset.name CONTAIN, then a strict "starts with the number" test), and say
   in one line what Meta has: live, starts on a date, paused (and at which level), ended, or nothing by that name.
   Two Graph reads per card and Meta account, one brand per request (the page asks brand by brand), 20 cards at most. */
export const CHECK_CARDS = 20;
/* Card numbers get reused over the years (Ice & Gold's #15 matched a batch 15 from the spring): only ads made in the last CHECK_DAYS count. */
export const CHECK_DAYS = 120;
/** Does this ad or ad set name start with the card's number? "408 | Still", "#408 A", "332-27 ebf-35" yes; "4081", "v408" no. */
export function numHit(num, name) {
  const n = String(num == null ? '' : num).trim().replace(/^#/, '');
  if (!n || !/^[\w.-]+$/.test(n)) return false;
  return new RegExp(`^\\s*#?\\s*${n.replace(/[.\-]/g, '\\$&')}(?![0-9])`, 'i').test(String(name || ''));
}
const dayCT = iso => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
/** One ad's place: live, scheduled, review, ad_off, set_off, camp_off, problem, ended. */
export function adPlace(a, now = Date.now()) {
  const t = iso => Date.parse(iso || '') || 0, s = a.set || {};
  if (t(s.end) && t(s.end) <= now) return 'ended';
  const e = String(a.eff || '').toUpperCase();
  if (e === 'ACTIVE') return t(s.start) > now ? 'scheduled' : 'live';
  if (['PENDING_REVIEW', 'IN_PROCESS', 'PREAPPROVED'].includes(e)) return 'review';
  if (e === 'ADSET_PAUSED') return 'set_off';
  if (e === 'CAMPAIGN_PAUSED') return 'camp_off';
  if (['DISAPPROVED', 'WITH_ISSUES'].includes(e)) return 'problem';
  return 'ad_off';
}
/** What Meta has for one card, from the ads named with its number: { state, n, line, sets }. */
export function metaVerdict(ads, now = Date.now()) {
  if (!ads.length) return { state: 'none', n: 0, line: 'Nothing in Meta is named with this number.', sets: [] };
  const by = {}; for (const a of ads) { const p = adPlace(a, now); (by[p] = by[p] || []).push(a); }
  const n = ads.length, c = k => (by[k] || []).length, pl = (k, w) => `${k} ad${k === 1 ? '' : 's'}${w ? ` ${w}` : ''}`;
  const setMap = new Map();
  for (const a of ads) { const s = a.set || {}, k = s.id || s.name || '?'; const x = setMap.get(k) || { name: s.name || '', campaign: (a.camp || {}).name || '', start: s.start || null, end: s.end || null, n: 0 }; x.n++; setMap.set(k, x); }
  const sets = [...setMap.values()].sort((p, q) => q.n - p.n).slice(0, 4);
  const where = sets[0] && sets[0].name ? ` in "${sets[0].name}"${sets.length > 1 ? ` and ${sets.length - 1} more ad set${sets.length === 2 ? '' : 's'}` : ''}` : '';
  const rest = k => { const o = n - c(k); return o > 0 ? ` ${o} more cannot run yet.` : ''; };
  if (c('live')) return { state: 'live', n, sets, line: `${pl(c('live'), 'live')}${where}.${c('scheduled') ? ` ${pl(c('scheduled'), 'scheduled')}.` : ''}${n - c('live') - c('scheduled') > 0 ? ` ${n - c('live') - c('scheduled')} off or ended.` : ''}` };
  if (c('scheduled')) { const first = by.scheduled.map(a => a.set.start).sort()[0]; return { state: 'scheduled', n, sets, start: first, line: `${pl(c('scheduled'))} start ${dayCT(first)}${where}, by themselves.${rest('scheduled')}` }; }
  if (c('review')) return { state: 'review', n, sets, line: `${pl(c('review'))} in Meta's review${where}.${rest('review')}` };
  if (c('camp_off')) return { state: 'paused', n, sets, line: `${pl(n)} in Meta${where}, but the campaign is off. Turn the campaign on when it should run.` };
  if (c('set_off')) return { state: 'paused', n, sets, line: `${pl(n)} in Meta${where}, but the ad set is off.` };
  if (c('ad_off')) return { state: 'paused', n, sets, line: `${pl(n)} in Meta${where}, all paused.` };
  if (c('problem')) return { state: 'problem', n, sets, line: `${pl(c('problem'))} rejected or with issues in Meta${where}.` };
  const end = by.ended.map(a => a.set.end).sort().pop();
  return { state: 'ended', n, sets, line: `${pl(n)} in Meta${where}, the ad set ended ${dayCT(end)}.` };
}
/** Ready cards (and Review cards with a date) for one brand, each with what Meta has under its number. */
export async function readyCheck(env, d, a, { now = Date.now(), today = centralToday() } = {}) {
  if (!d.listBoard) return { act: a.act_id, brand: a.name, cards: [], n_cards: 0 };
  const board = await d.listBoard(env, { act: a.act_id });
  const dated = c => /^\d{4}-\d{2}-\d{2}$/.test(c.launch_on || '') ? c.launch_on : '';
  const all = ((board && board.cards) || []).filter(c => c.act_id === a.act_id && (c.board === 'ready' || (c.board === 'review' && dated(c))));
  const cards = all.slice(0, CHECK_CARDS);
  const acts = (await metaActsOf(env, a.act_id, null).catch(() => [])).filter(x => /^act_/.test(String(x)));
  const AD_F = 'id,name,effective_status,created_time,adset{id,name,start_time,end_time},campaign{id,name}';
  const young = x => !x.created_time || Date.parse(x.created_time) >= now - CHECK_DAYS * 864e5;
  const SET_F = 'id,name,start_time,end_time,campaign{id,name},ads.limit(200){id,name,effective_status,created_time}';
  const out = [];
  for (const c of cards) {
    const base = { card_id: c.id, act_id: c.act_id, brand: a.name, num: c.num || null, name: `${c.num ? `#${c.num} ` : ''}${c.title || 'Untitled card'}`, board: c.board, launch_on: dated(c) || null };
    if (!c.num) { out.push({ ...base, state: 'nonum', n: 0, line: 'The card has no number, so it cannot be matched to Meta by name.', sets: [] }); continue; }
    if (!acts.length) { out.push({ ...base, state: 'error', n: 0, line: 'This brand has no Meta ad account connected in Locus.', sets: [] }); continue; }
    try {
      const ads = new Map(), near = [];   // near = names that contain the number without starting with it (shown, never counted)
      for (const act of acts) {
        const [byAd, bySet] = await Promise.all([
          gall(d, env, `${act}/ads`, { fields: AD_F, filtering: [{ field: 'ad.name', operator: 'CONTAIN', value: String(c.num) }], limit: '200' }, 1),
          gall(d, env, `${act}/adsets`, { fields: SET_F, filtering: [{ field: 'adset.name', operator: 'CONTAIN', value: String(c.num) }], limit: '50' }, 1),
        ]);
        for (const x of byAd) if (!numHit(c.num, x.name)) near.push(x.name);
        for (const s of bySet) if (!numHit(c.num, s.name)) near.push(s.name);
        for (const x of byAd) if (numHit(c.num, x.name) && young(x)) ads.set(String(x.id), { id: String(x.id), name: x.name, eff: x.effective_status, set: x.adset ? { id: x.adset.id, name: x.adset.name, start: x.adset.start_time || null, end: x.adset.end_time || null } : null, camp: x.campaign ? { name: x.campaign.name } : null });
        for (const s of bySet) if (numHit(c.num, s.name)) for (const x of ((s.ads && s.ads.data) || [])) if (!ads.has(String(x.id)) && young(x))
          ads.set(String(x.id), { id: String(x.id), name: x.name, eff: x.effective_status, set: { id: s.id, name: s.name, start: s.start_time || null, end: s.end_time || null }, camp: s.campaign ? { name: s.campaign.name } : null });
      }
      const v = metaVerdict([...ads.values()], now);
      if (v.state === 'none' && near.length && (String(c.num).length >= 3 || near.length <= 5)) v.line = `Nothing in Meta starts with this number. ${near.length} name${near.length === 1 ? ' contains' : 's contain'} it, for example "${clean(near[0], 70)}".`;
      out.push({ ...base, ...v, near: near.length });
    } catch (e) { out.push({ ...base, state: 'error', n: 0, line: `Could not read Meta: ${clean(e.message, 160)}`, sets: [] }); }
  }
  const inMeta = out.filter(x => ['live', 'scheduled', 'review', 'paused', 'problem', 'ended'].includes(x.state)).length;
  return { act: a.act_id, brand: a.name, as_of: new Date(now).toISOString(), today, cards: out, n_cards: out.length, n_in_meta: inMeta, n_missing: out.filter(x => x.state === 'none').length, more: Math.max(0, all.length - cards.length) };
}

/** p_launch rows of the last LAUNCHED_DAYS days for these brands, newest first, with the card's number and title. */
export async function launchedRows(env, accts, { days = LAUNCHED_DAYS, limit = 400 } = {}) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const names = new Map(accts.map(a => [a.act_id, a.name]));
  const rows = ((await env.DB.prepare(`SELECT l.id, l.act, l.meta_act, l.batch_id, l.num, l.ad_id, l.ad_name, l.adset_id, l.adset_name, l.status, l.eff_status, l.checked_at, l.by, l.at,
      b.title AS card_title, b.num AS card_num FROM p_launch l LEFT JOIN p_br_batch b ON b.id = l.batch_id WHERE l.at >= ?1 ORDER BY l.at DESC LIMIT ${limit}`).bind(since).all()
    .catch(() => ({ results: [] }))).results || []);
  return rows.filter(r => names.has(r.act)).map(r => ({ id: r.id, act_id: r.act, brand: names.get(r.act), at: r.at, day: centralDay(r.at),
    ad_id: r.ad_id || null, ad_name: r.ad_name || '', adset_id: r.adset_id || null, adset: r.adset_name || '', by: r.by || '',
    status: r.status || null, eff_status: r.eff_status || null, checked_at: r.checked_at || null, checked: !!r.checked_at && r.checked_at !== r.at,
    card_id: r.batch_id || null, card: r.batch_id ? `${(r.card_num || r.num) ? `#${r.card_num || r.num} ` : ''}${r.card_title || ''}`.trim() : null,
    ads_manager: r.ad_id && r.meta_act ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${String(r.meta_act).replace('act_', '')}&selected_ad_ids=${r.ad_id}` : null }));
}

/** A row Agree to all can make without Cole: a Meta change the page writes (pause, turn back on, budget, test minimum). */
export const DO_KINDS = ['pause', 'resume', 'budget', 'minoff'];
export const canDo = r => DO_KINDS.includes(r.do);

/* ---------- THE CARD (2026-11-05): the shape Cole approved on the Media Buying Calls page, now on the Buyer list ----------
   Each row carries `card` = {kind, level, object, do, facts[], because, decide, fyi, ad_ids}. The morning read writes it
   (buyerai.js PASS_SCHEMA); where the read has not run, or left a field out, the rule row fills it in from its own numbers.
   Rows are drawn per brand in CARD_ORDER. `decide` rows get Yes / No; the rest a label. */
export const CARD_ORDER = ['raise', 'cut', 'trim', 'refresh', 'keep', 'note', 'launch', 'tidy'];
const KIND_CARD = { scale: 'raise', cut: 'cut', trim: 'trim', refresh: 'refresh', mixed: 'keep', minoff: 'trim', stalled: 'tidy', launch: 'launch' };
const AI_CARD = { budget: 'raise', scale: 'raise', relaunch: 'note', leads: 'raise', tracking: 'note', cut: 'cut', other: 'note' };
const fact = (l, v, good, bad) => (v == null || v === '' ? null : { l, v: String(v), good: !!good, bad: !!bad && !good });
/** The card for one list row: the read's card where it exists, the rule's numbers for anything missing. */
export function cardOf(r) {
  const c = r.card || {};
  const cur = r.currency || 'USD', m = r.metric, goalRoas = +r.goal_roas || 0, goal = +r.goal || 0;
  const kind = CARD_KINDS.includes(c.kind) ? c.kind : r.kind === 'ai' ? (AI_CARD[r.ai_type] || 'note') : r.kind === 'minoff' && r.nudge === 'not_picked' ? 'cut' : KIND_CARD[r.kind] || 'note';
  const level = c.level || (r.kind === 'launch' ? 'card' : r.level || 'adset');
  const unit = m === 'cpl' ? 'lead' : 'sale';
  const facts = c.facts && c.facts.length ? c.facts : [
    r.spend != null ? fact(r.days ? `Spend ${r.days}d` : 'Spend', money(r.spend, cur)) : null,
    r.results != null ? fact(unit === 'lead' ? 'Leads' : 'Sales', Number.isInteger(+r.results) ? +r.results : (+r.results).toFixed(1), false, +r.results === 0 && +r.spend > 0) : null,
    m === 'roas' && r.roas != null ? fact('ROAS', `${x1(r.roas)}${goalRoas ? ` vs ${x1(goalRoas)}` : ''}`, goalRoas && r.roas >= goalRoas, goalRoas && r.roas < goalRoas)
      : r.cpa != null ? fact(unit === 'lead' ? 'Cost per lead' : 'Cost per sale', `${money(r.cpa, cur)}${goal ? ` vs ${money(goal, cur)}` : ''}`, goal && r.cpa <= goal, goal && r.cpa > goal) : null,
    r.fc_results ? fact('First click', count(r.fc_results, unit)) : null,
    r.budget > 0 ? fact('Budget', `${money(r.budget, cur)}/day`) : null,
    r.min > 0 ? fact('Minimum', `${money(r.min, cur)}/day`) : null,
    r.kind === 'launch' && r.n_ads ? fact('Approved ads', r.n_ads) : null,
  ].filter(Boolean).slice(0, 6);
  const decide = typeof c.decide === 'boolean' ? c.decide : !!r.do || ['raise', 'cut', 'trim', 'refresh', 'tidy', 'launch'].includes(kind);
  const ids = [...new Set([...(c.ad_ids || []), r.ad_id, r.top_ad, r.anchor_ad].filter(Boolean).map(String))];
  return { kind, level, object: c.object || (r.set ? `${r.name} in ${r.set}` : r.name || ''), do: noDash(c.do || r.action || ''), facts, because: noDash(c.because || r.why_full || r.why || ''),
    decide, fyi: decide ? null : (c.fyi || (r.kind === 'launch' ? 'Starts by itself' : 'Nothing to do')), ad_ids: ids };
}
/** Every ad behind each row (the set's ads over 7 days, biggest spend first; the row's own ad first; Triple Whale sales),
 *  with covers from R2 for the first `COVER_CAP` ads. One adNumbers read per 5 sets per brand, never per row. */
export const ADS_PER_ROW = 8, COVER_CAP = 160;
export async function rowAds(env, rows, { days = 7 } = {}) {
  const byAct = new Map();
  for (const r of rows) { if (r.kind === 'launch') continue; const g = byAct.get(r.act_id) || []; g.push(r); byAct.set(r.act_id, g); }
  const out = new Map();
  for (const [act, list] of byAct) {
    const metaActs = await metaActsOf(env, act, null).catch(() => []);
    if (!metaActs.length) continue;
    const sets = [...new Set(list.map(r => r.adset_id).filter(Boolean).map(String))];
    const ids = [...new Set(list.flatMap(r => cardOf(r).ad_ids))].filter(id => /^\d{6,25}$/.test(id));
    const ads = [];
    for (let i = 0; i < sets.length; i += 5) ads.push(...(await adNumbers(env, { act, metaActs, adsetIds: sets.slice(i, i + 5), days }).catch(() => ({ ads: [] }))).ads);
    const have = new Set(ads.map(a => a.ad_id));
    const lone = ids.filter(id => !have.has(id));
    for (let i = 0; i < lone.length; i += 40) ads.push(...(await adNumbers(env, { act, metaActs, adIds: lone.slice(i, i + 40), days }).catch(() => ({ ads: [] }))).ads.filter(a => !have.has(a.ad_id)));
    const byId = new Map(ads.map(a => [a.ad_id, a]));
    for (const r of list) {
      const c = cardOf(r), own = new Set(c.ad_ids);
      let mine = r.adset_id && r.level !== 'ad' ? ads.filter(a => a.adset_id === String(r.adset_id)) : [];
      if (!mine.length) mine = c.ad_ids.map(id => byId.get(id)).filter(Boolean);
      else for (const id of c.ad_ids) if (!mine.some(a => a.ad_id === id) && byId.get(id)) mine.push(byId.get(id));
      mine.sort((p, q) => (own.has(q.ad_id) - own.has(p.ad_id)) || (q.spend || 0) - (p.spend || 0));
      const focus = String(r.ad_id || c.ad_ids[0] || '');
      out.set(r.key, { n: mine.length, days, ads: mine.slice(0, ADS_PER_ROW).map(a => ({ ad_id: a.ad_id, name: a.name, cover: null, spend: a.spend, sales: a.sales, revenue: a.revenue, cpa: a.cpa, roas: a.roas, leads: a.leads,
        ctr: a.ctr, cpm: a.cpm, freq: a.freq, hook: a.hook, video: a.video, fc_sales: a.fc_sales, role: a.role, status: a.status, focus: a.ad_id === focus, off: !!a.status && a.status !== 'ACTIVE' })) });
    }
  }
  /* covers: the first COVER_CAP shown ads; the page fills the rest from /api/ad-creatives like every other screen */
  const shown = []; const seen = new Set();
  for (const v of out.values()) for (const a of v.ads) if (!seen.has(a.ad_id) && shown.length < COVER_CAP) { seen.add(a.ad_id); shown.push(a); }
  const cov = new Map((await withCovers(env, shown).catch(() => [])).map(a => [a.ad_id, a.cover]));
  for (const v of out.values()) for (const a of v.ads) a.cover = cov.get(a.ad_id) || null;
  return out;
}
/* ---------- decisions (Yes / No per row, per day) ---------- */
const DEC_SQL = `CREATE TABLE IF NOT EXISTS p_buyer_decision (brand TEXT NOT NULL, object TEXT NOT NULL, action TEXT NOT NULL, day TEXT NOT NULL, decision TEXT NOT NULL,
  note TEXT, line TEXT, name TEXT, write_id TEXT, by TEXT, at TEXT NOT NULL, PRIMARY KEY (brand, object, action, day))`;
let decTabled = false;
async function ensureDecisions(env) { if (decTabled) return; await env.DB.prepare(DEC_SQL).run(); decTabled = true; }
const dkey = r => `${r.act_id}|${r.object}|${r.kind}`;
/** Yes = the change was made (or will be; `write_id` when Locus wrote it), No = left alone, with his one-line why. Both
 *  set the shared state Done (quiet 3 days from tomorrow); today the row stays on the card, marked. */
export async function setDecision(env, { act, object, action, decision, note, line, name, write_id }, who, today = centralToday()) {
  await ensureDecisions(env);
  if (!['yes', 'no', 'clear'].includes(decision)) throw Object.assign(new Error('Yes, no or clear.'), { status: 400 });
  const brand = String(act || ''), obj = String(object || '').slice(0, 120), kind = String(action || '').slice(0, 40);
  if (!brand || !obj || !kind) throw Object.assign(new Error('Which row? (brand, object and action are needed)'), { status: 400 });
  if (decision === 'clear') {
    await env.DB.prepare(`DELETE FROM p_buyer_decision WHERE brand = ?1 AND object = ?2 AND action = ?3 AND day = ?4`).bind(brand, obj, kind, today).run();
    await setState(env, { act: brand, object: obj, action: kind, status: 'clear' }, who, today).catch(() => {});
    return { ok: true, cleared: true };
  }
  const at = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO p_buyer_decision (brand, object, action, day, decision, note, line, name, write_id, by, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
    ON CONFLICT(brand, object, action, day) DO UPDATE SET decision = excluded.decision, note = COALESCE(excluded.note, p_buyer_decision.note), line = COALESCE(excluded.line, p_buyer_decision.line),
      name = COALESCE(excluded.name, p_buyer_decision.name), write_id = COALESCE(excluded.write_id, p_buyer_decision.write_id), by = excluded.by, at = excluded.at`)
    .bind(brand, obj, kind, today, decision, clean(note, 600) || null, clean(line, 300) || null, clean(name, 200) || null, write_id ? String(write_id).slice(0, 80) : null, clean(who, 120) || null, at).run();
  await setState(env, { act: brand, object: obj, action: kind, status: 'done', name }, who, today).catch(() => {});
  return { ok: true, decision, at, by: who };
}
export async function readDecisions(env, acts, today = centralToday()) {
  await ensureDecisions(env);
  const rows = ((await env.DB.prepare(`SELECT brand, object, action, decision, note, line, name, write_id, by, at FROM p_buyer_decision WHERE day = ?1`).bind(today).all().catch(() => ({ results: [] }))).results) || [];
  return new Map(rows.filter(r => !acts || acts.has(r.brand)).map(r => [`${r.brand}|${r.object}|${r.action}`, r]));
}
/** The directive as a thing that happened: "Turn off ad set 368" -> "Turned off ad set 368". */
const PAST = { turn: 'Turned', switch: 'Switched', raise: 'Raised', lower: 'Lowered', cut: 'Cut', pause: 'Paused', take: 'Took', keep: 'Kept', launch: 'Launched', add: 'Added', move: 'Moved',
  set: 'Set', put: 'Put', leave: 'Left', brief: 'Briefed', drop: 'Dropped', stop: 'Stopped', start: 'Started', resume: 'Resumed', split: 'Split', load: 'Loaded', reload: 'Reloaded', trim: 'Trimmed' };
export function pastTense(s) {
  const t = noDash(clean(s, 300)).replace(/\s*\([^)]*\)\s*/g, ' ').replace(/[.!]+$/, '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^([A-Za-z]+)\b(.*)$/); if (!m) return t;
  const verb = m[1].toLowerCase(), rest = m[2];
  if (!PAST[verb]) return t;
  return `${PAST[verb]}${rest.replace(/^ (it|them|this|that) (back )?(on|off)\b/i, ' $3')}`;
}
/** The plain client update for one brand from today's Yes rows: one line per change, nothing else (Cole 2026-10-28). */
export function whatWeDidText(brand, decs) {
  const yes = decs.filter(d => d.decision === 'yes' && (d.line || d.name));
  if (!yes.length) return '';
  const lines = yes.map(d => `• ${pastTense(d.line || d.name)}`);
  return `Quick update on the ${brand} ads today:\n${lines.join('\n')}`;
}
/** Grouped by brand, the brand with the most money at stake first, then each brand's rows by money at stake. */
export function byBrand(rows) {
  const g = new Map();
  for (const r of rows) { const x = g.get(r.act_id) || { act_id: r.act_id, brand: r.brand, currency: r.currency || 'USD', n: 0, n_do: 0, stake: 0, rows: [] }; x.n++; x.n_do += canDo(r) ? 1 : 0; x.stake += r.stake || 0; x.rows.push(r); g.set(r.act_id, x); }
  const brands = [...g.values()].sort((p, q) => q.stake - p.stake || String(p.brand).localeCompare(String(q.brand)));
  for (const b of brands) b.rows.sort((p, q) => (q.stake || 0) - (p.stake || 0));
  return { rows: brands.flatMap(b => b.rows), brands: brands.map(({ rows: _r, ...b }) => ({ ...b, stake: Math.round(b.stake) })) };
}
/** A call the rules held for a tracking gap, checked: fine = the cut stands (with the fact); ads with no tag = that is the
 *  call; a real gap with tags on = keep it on for now, with the counts. */
async function gapChecked(env, d, r) {
  const metaActs = await metaActsOf(env, r.act_id, r.meta_act);
  const nums = await adNumbers(env, { act: r.act_id, metaActs, adsetIds: r.ad_id ? [] : [r.adset_id].filter(Boolean), adIds: r.ad_id ? [r.ad_id] : [] });
  const ads = r.ad_id ? nums.ads.filter(a => a.ad_id === String(r.ad_id)).map(a => ({ ...a, adset_id: null })) : nums.ads;
  if (!ads.length) return r;
  const t = (await trackingCheck(env, d, ads)).get(String(r.ad_id || r.adset_id));
  if (!t) return r;
  if (t.fine) { const was = r.was || 'cut'; const back = { ...r, kind: was, kept_by: null }; return { ...back, action: ACTION[was](back), why: shortWhy(back), do: 'pause', stake: Math.max(r.stake || 0, +r.spend || 0), checked: t.fact }; }
  return { ...r, action: t.action || ACTION.mixed(r), why: t.fact, checked: t.fact, do: null };
}

/** The whole list. act = 'all' or one brand; only = the brands this person may see (null = every brand). */
export async function buildBuyerList(env, d, { act = 'all', only = null, live = true, noAI = false, ads = false } = {}) {
  const today = d.centralDate ? d.centralDate() : centralToday();
  const accts = (await d.listAccounts(env, true)).filter(a => eligible(a) && (act === 'all' || a.act_id === act) && (!only || only.has(a.act_id)));
  const ids = new Set(accts.map(a => a.act_id));
  const notes = [];
  let banners = [];
  const set = await buyerSettings(env);
  const [calls, mins, launch, st, launched, stall] = await Promise.all([
    readToday(env, d, act === 'all' ? 'all' : act).then(r => { banners = ((r && r.banners) || []).filter(b => ids.has(b.act_id)).map(b => ({ act_id: b.act_id, brand: b.brand, kind: b.kind, text: clean(b.text, 300) })); return ((r && r.rows) || []).filter(x => CALL_KINDS.includes(x.kind) && ids.has(x.act_id)).map(callRow); })
      .catch(e => { notes.push(`Ad calls: ${e.message}`); return []; }),
    minimums(env, d, accts, today, { live }).catch(e => { notes.push(`Test minimums: ${e.message}`); return { rows: [], notes: [] }; }),
    launches(env, d, ids, act, { today, days: set.launchDays }).catch(e => { notes.push(`Launches: ${e.message}`); return { rows: [], scheduled: [] }; }),
    readState(env, ids, today),
    launchedRows(env, accts).catch(e => { notes.push(`Launched: ${e.message}`); return []; }),
    stalled(env, accts, today).catch(e => { notes.push(`Not spending: ${e.message}`); return []; }),
  ]);
  notes.push(...(mins.notes || []));
  /* Ads > Trybe: approved creator videos that sat 3 days without running, one line per brand (the team's, never a client's). */
  try { const names = new Map(accts.map(a => [a.act_id, a.name])); banners.push(...(await trybeBanners(env, ids, today)).map(t => ({ ...t, brand: names.get(t.act_id) || '' }))); } catch { /* no Trybe tables yet */ }
  /* The morning read (buyerai.js): a verdict on each rule row, and the calls the rules missed as rows of kind 'ai'. */
  /* a set already on the list (a call or its minimum) keeps that row, not a second one */
  const onList = new Set([...calls, ...mins.rows].map(r => String(r.adset_id || '')).filter(Boolean));
  let all = [...calls, ...mins.rows, ...stall.filter(r => !onList.has(r.adset_id)), ...launch.rows], ai = new Map();
  if (!noAI) { try { ai = await readAI(env, ids, today); all = applyAI(all, ai, accts); } catch (e) { notes.push(`Morning read: ${e.message}`); } }
  /* Locus checks before it asks (2026-10-27): a call held for a tracking gap is checked here (Meta's own count vs Triple
     Whale on that set, the tags when they disagree) and says what it found instead of "fix tracking". */
  if (!noAI && d.checkTracking !== false) all = await Promise.all(all.map(r => (r.kept_by === 'tracking_gap' && !r.changed ? gapChecked(env, d, r).catch(() => r) : r)));
  const rows = [], quiet = [];
  /* Drops and sales (2026-10-31, drops.js): a sale that ended or a product that sold out locks its ads; a row that would
     turn one back on leaves the list (quiet, with the reason), whoever suggested it. */
  const locks = await locksFor(env, ids).catch(() => new Map());
  const turnsOn = r => r.do === 'resume' || r.ai_type === 'relaunch' || /\b(turn (it |them )?(back )?on|relaunch|resume|unpause)\b/i.test(r.action || '');
  /* Decided today (Yes / No on the card): the row stays on its brand's card, marked, until tomorrow. */
  const decs = await readDecisions(env, ids, today).catch(() => new Map());
  for (const r of all) {
    const dc = decs.get(dkey(r));
    if (dc) { rows.push({ ...r, decided: { decision: dc.decision, note: dc.note || '', by: dc.by, at: dc.at, write_id: dc.write_id || null } }); continue; }
    const h = hiddenBy(r, st);
    const lk = !h && turnsOn(r) ? lockedBy(locks.get(r.act_id), r.ad_id || r.adset_id || r.object, r.name || r.set) : null;
    if (h) quiet.push({ ...r, hidden: h });
    else if (lk) quiet.push({ ...r, hidden: { why: 'locked', by: 'Locus', summary: `Off for good: ${lk.name} ${lk.status === 'sold_out' ? 'sold out' : 'ended'} (${lk.tag})` } });
    /* The morning read says drop it: ONE final call, so it leaves the list (quiet, with the reason). */
    else if (r.ai && r.ai.verdict === 'drop') quiet.push({ ...r, hidden: { why: 'dropped', by: 'Locus', summary: r.ai.why || r.ai.reason || '' } });
    else rows.push(r);
  }
  /* The card on every row, and the ads behind it when the page asks (`ads`); the post and the tick do not. */
  for (const r of rows) r.card = cardOf(r);
  if (ads) { try { const m = await rowAds(env, rows); for (const r of rows) r.ads = m.get(r.key) || null; } catch (e) { notes.push(`Ads: ${e.message}`); } }
  const { rows: sorted, brands: groups } = byBrand(rows);
  const stake = rows.reduce((s, r) => s + (r.stake || 0), 0);
  const brands = groups.map(g => g.act_id);
  const cur = [...new Set(rows.filter(r => r.stake > 0).map(r => r.currency || 'USD'))];
  const toDecide = rows.filter(r => r.card.decide);
  return { as_of: new Date().toISOString(), today, act, owner: set.buyerOwner, settings: set,
    n: rows.filter(r => !r.decided).length, n_brands: brands.length, stake, currency: cur.length === 1 ? cur[0] : 'USD', mixed_currency: cur.length > 1,
    n_do: rows.filter(r => canDo(r) && !r.decided).length, groups, decided: { n: toDecide.filter(r => r.decided).length, of: toDecide.length },
    counts: Object.fromEntries(KINDS.map(k => [k, rows.filter(r => r.kind === k).length])),
    hidden: { done: quiet.filter(r => r.hidden.why === 'done').length, skipped: quiet.filter(r => r.hidden.why === 'skipped').length, watched: quiet.filter(r => r.hidden.why === 'watched').length,
      dropped: quiet.filter(r => r.hidden.why === 'dropped').length, locked: quiet.filter(r => r.hidden.why === 'locked').length },
    rows: sorted, quiet, notes, banners, ...launchView(today, set.launchDays, launch.scheduled, launched),
    ai: { on: set.buyerAI, n_read: [...ai.values()].filter(x => x.status === 'done').length, n_brands: accts.length,
      brands: [...ai.entries()].filter(([, x]) => x.status === 'done' && (x.summary || x.headline)).map(([k, x]) => ({ act_id: k, brand: (accts.find(a => a.act_id === k) || {}).name || k, summary: x.summary, headline: x.headline || x.summary || '', week: x.week || [], at: x.at })) } };
}
/** The launch fields of the list: today a launch day?, the next one with its waiting cards, scheduled, launched. */
export function launchView(today, days, scheduled, launched) {
  const nx = nextLaunchDay(today, days);
  const waiting = scheduled.filter(s => !s.dated && s.date === nx);
  const y = addDays(today, -1), yest = launched.filter(l => l.day === y);
  return { launch_days: days, launch_today: isLaunchDay(today, days),
    next_launch: { date: nx, day: dayName(nx), n: waiting.length, n_ads: waiting.reduce((s, x) => s + (x.n_ads || 0), 0) },
    scheduled, launched, launched_yesterday: { n: yest.length, brands: [...new Set(yest.map(l => l.brand))] } };
}

/* ---------- the Slack post ---------- */
/* THE SHORT DM (2026-10-27, Cole): the head ("N changes ready across B brands, $X at stake"), the top 5 one-liners
   (brand: action, "name") and Open. Nothing else: the page has the rest. */
const lineOf = r => `• *${mk(r.brand)}*: ${mk(r.action)}, ${mk(r.kind === 'launch' ? r.name : `"${r.name}"`)}`;
export function headOf(list) {
  if (!list.n) return 'Buyer list: nothing to do today';
  return `${list.n} change${list.n === 1 ? '' : 's'} ready across ${list.n_brands} brand${list.n_brands === 1 ? '' : 's'}${list.stake > 0 ? `, ${moneyK(list.stake, list.currency)} at stake` : ''}`;
}
/** The one daily message (2026-11-09, the lane format, lane.js): "*MEDIA BUYING · Agency*" (or the one brand), the buyer
 *  owner tagged with the ask and the head, the top 5 one-liners under it, Open. */
export function buyerMessage(list, ownerTag) {
  const top = list.rows.filter(r => !r.decided).slice(0, TOP_N).map(lineOf).map(l => l.replace(/^• /, ''));
  const one = list.n_brands === 1 && (list.groups || [])[0] ? (list.groups[0].brand || list.groups[0].name || '') : '';
  const m = laneBlocks({ lane: 'MEDIA BUYING', brand: one || 'Agency', who: ownerTag || list.owner || 'Cole',
    ask: list.n ? `Go through the Buyer list: ${mk(headOf(list))}` : mk(headOf(list)), lines: top,
    buttons: [{ type: 'button', action_id: 'noop_open', text: { type: 'plain_text', text: 'Open' }, url: `${LOCUS}?open=buyer&act=all` }] });
  return { text: [m.text, ...top.map(l => `• ${l}`)].join('\n'), blocks: m.blocks };
}
/** The plain words of the post, for the preview on the page. */
export function buyerPlain(list) {
  return buyerMessage(list, null).text.replace(/\*([^*\n]+)\*/g, '$1').replace(/(^|\s)_([^_\n]+)_/g, '$1$2').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
async function ownerTag(env, d, owner) { return d.tagOf ? await d.tagOf(env, owner).catch(() => null) : null; }
export async function postBuyerList(env, d, channel, list) {
  const tag = await ownerTag(env, d, list.owner);
  const m = buyerMessage(list, tag);
  const p = await d.slackPost(env, channel, m.text, m.blocks, { username: 'Locus' });
  if (p && p.ok === false) throw new Error(p.error || 'Slack refused the post');
  return { ok: true, channel, ts: (p && (p.ts || p.message?.ts)) || null, text: m.text };
}

/** The hourly tick: ONE post a day, from the morning hour to noon Central, in the buyer channel. */
export async function buyerPostTick(env, d) {
  if (!(await buyerPostOn(env))) return { skipped: 'off' };
  const hour = d.centralHour(), from = await morningHour(env);
  if (hour < from) return { skipped: `before ${from}am Central` };
  if (hour > LAST_HOUR) return { skipped: 'after noon Central' };
  const today = d.centralDate();
  let st = safe(await getSetting(env, 'buyerPostDone'), {}) || {};
  if (st.date !== today) st = { date: today, tries: 0 };
  if (st.done) return { skipped: `done today: ${st.done}` };
  if (d.canAfford && !d.canAfford(80)) return { deferred: 'budget' };
  /* The morning read goes first (buyerai.js, from an hour before); the post waits for it up to an hour past the post hour. */
  if (hour < from + POST_WAIT_HOURS && !(await aiPassDone(env, d, today).catch(() => true))) return { deferred: 'morning read not finished' };
  try {
    const list = await buildBuyerList(env, d, { act: 'all' });
    if (!list.n) { st.done = 'nothing to do'; await putSetting(env, 'buyerPostDone', JSON.stringify(st)); return { date: today, quiet: true, notes: list.notes }; }
    const set = await buyerSettings(env);
    const r = await postBuyerList(env, d, set.buyerChannel, list);
    st.done = 'posted'; st.n = list.n; st.ts = r.ts; st.channel = set.buyerChannel; st.at = new Date().toISOString();
    await putSetting(env, 'buyerPostDone', JSON.stringify(st));
    return { date: today, posted: list.n, brands: list.n_brands, channel: set.buyerChannel, notes: list.notes };
  } catch (e) {
    st.tries = (st.tries || 0) + 1;
    if (st.tries >= 2) st.done = `failed: ${e.message}`;
    await putSetting(env, 'buyerPostDone', JSON.stringify(st));
    return { error: e.message };
  }
}

/* ---------- routes ---------- */
/** worker.js: `const r = await handleBuyer(request, env, url, path, json, h); if (r) return r;`
 *  h = { isAdmin, sessionEmail, brandsFor, resolveBrandId, deps } (deps: listAccounts, centralDate, centralHour, mintSession,
 *  slackPost, tagOf, listBoard, dueOff, canAfford). */
export async function handleBuyer(request, env, url, path, json, h) {
  if (!/^\/api\/buyer-list(\/|$)/.test(path)) return null;
  if (!(await h.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  const email = await h.sessionEmail(env, request).catch(() => null);
  const only = await h.brandsFor(env, email).catch(() => null);
  const d = h.deps;
  const actOf = async raw => { raw = String(raw || 'all'); if (raw === 'all') return 'all'; const a = await h.resolveBrandId(env, raw).catch(() => ''); return a; };
  try {
    if (path === '/api/buyer-list' && request.method === 'GET') {
      const act = await actOf(url.searchParams.get('act'));
      if (!act) return json({ error: 'No such brand.' }, 404);
      if (act !== 'all' && only && !only.has(act)) return json({ error: 'You do not have access to this brand.' }, 403);
      const out = await buildBuyerList(env, d, { act, only, ads: url.searchParams.get('ads') !== '0' });
      /* A client login (brandguard lets it read its own brand only): the calls, never the launch queue, the owner or the team's settings. */
      if (h.isClient && h.isClient(request)) { out.rows = (out.rows || []).filter(r => r.kind !== 'launch'); out.banners = (out.banners || []).filter(x => x.kind !== 'trybe'); out.launched = []; out.next_launch = null; out.launch_today = false; delete out.owner; delete out.settings; if (out.counts) out.counts.launch = 0; }
      if (h.isHq && h.isHq(request)) { delete out.owner; delete out.settings; }   // Lucky HQ: the team's page for Lucky, without the team's own settings
      return json(out);
    }
    /* Yes / No on a card row (2026-11-05). Yes after the write (write_id) or on its own; No with his one-line why. */
    if (path === '/api/buyer-list/decision' && request.method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const act = await actOf(b.act);
      if (!act || act === 'all') return json({ error: 'Pick a brand first.' }, 400);
      if (only && !only.has(act)) return json({ error: 'You do not have access to this brand.' }, 403);
      return json(await setDecision(env, { ...b, act }, email || 'someone in Locus', d.centralDate ? d.centralDate() : centralToday()));
    }
    /* "What we did": the plain client update per brand from today's Yes rows; post=1 sends it to the client channel as Cole. */
    if (path === '/api/buyer-list/what-we-did' && (request.method === 'GET' || request.method === 'POST')) {
      const b = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
      const act = await actOf(request.method === 'POST' ? b.act : url.searchParams.get('act'));
      if (!act || act === 'all') return json({ error: 'Pick a brand first.' }, 400);
      if (only && !only.has(act)) return json({ error: 'You do not have access to this brand.' }, 403);
      const today = d.centralDate ? d.centralDate() : centralToday();
      const a = (await d.listAccounts(env, true)).find(x => x.act_id === act) || { name: act };
      const decs = [...(await readDecisions(env, new Set([act]), today)).values()];
      const text = clean(b.text, 2000) || whatWeDidText(a.name, decs);
      const ch = (await env.DB.prepare(`SELECT brief_channel FROM brand_accounts WHERE act_id = ?1`).bind(act).first().catch(() => null) || {}).brief_channel || null;
      if (request.method === 'GET') return json({ act, brand: a.name, text, n_yes: decs.filter(x => x.decision === 'yes').length, n_no: decs.filter(x => x.decision === 'no').length, channel: ch });
      if (!text) return json({ error: 'Nothing to say yet: no Yes on this brand today.' }, 400);
      if (!ch) return json({ error: `${a.name} has no client channel in Locus. Copy the text and post it yourself.` }, 400);
      const p = await d.slackPost(env, ch, noDash(text), null, { asUser: true });
      return json({ ok: true, channel: ch, ts: (p && p.ts) || null, text });
    }
    /* Launched in the last 30 days; refresh=1 reads each ad's status from Meta first (one ads read per account, rows not
       read in the last 30 minutes, the newest 50 per account). */
    if (path === '/api/buyer-list/launched' && request.method === 'GET') {
      const act = await actOf(url.searchParams.get('act'));
      if (!act) return json({ error: 'No such brand.' }, 404);
      if (act !== 'all' && only && !only.has(act)) return json({ error: 'You do not have access to this brand.' }, 403);
      const accts = (await d.listAccounts(env, true)).filter(a => (act === 'all' || a.act_id === act) && (!only || only.has(a.act_id)));
      let rows = await launchedRows(env, accts), refreshed = false, error = null;
      if (url.searchParams.get('refresh') === '1' && d.launchStatus) {
        const stale = Date.now() - 30 * 60e3;
        const ids = new Set(rows.filter(r => r.ad_id && !['ARCHIVED', 'DELETED'].includes(r.eff_status) && !(r.checked && Date.parse(r.checked_at) > stale)).map(r => r.id));
        if (ids.size) {
          const full = ((await env.DB.prepare(`SELECT id, ad_id, meta_act, status, eff_status FROM p_launch WHERE at >= ?1`).bind(new Date(Date.now() - LAUNCHED_DAYS * 864e5).toISOString()).all()
            .catch(() => ({ results: [] }))).results || []).filter(r => ids.has(r.id));
          try { await d.launchStatus(env, full); refreshed = true; } catch (e) { error = e.message; }
          rows = await launchedRows(env, accts);
        }
      }
      return json({ launched: rows, refreshed, error });
    }
    /* Ready against Meta (readyCheck): one brand per call, read live from Meta by the card's number in ad and ad set names. */
    if (path === '/api/buyer-list/ready-check' && request.method === 'GET') {
      const act = await actOf(url.searchParams.get('act'));
      if (!act || act === 'all') return json({ error: 'Pick a brand first.' }, 400);
      if (only && !only.has(act)) return json({ error: 'You do not have access to this brand.' }, 403);
      const a = (await d.listAccounts(env, true)).find(x => x.act_id === act);
      if (!a) return json({ error: 'No such brand.' }, 404);
      return json(await readyCheck(env, d, a, { today: d.centralDate ? d.centralDate() : centralToday() }));
    }
    if (path === '/api/buyer-list/state' && request.method === 'GET') {
      const act = await actOf(url.searchParams.get('act'));
      const ids = act === 'all' ? (only || null) : new Set([act].filter(x => !only || only.has(x)));
      return json(await readState(env, ids, d.centralDate ? d.centralDate() : centralToday()));
    }
    if (path === '/api/buyer-list/state' && request.method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const act = await actOf(b.act);
      if (!act || act === 'all') return json({ error: 'Pick a brand first.' }, 400);
      if (only && !only.has(act)) return json({ error: 'You do not have access to this brand.' }, 403);
      const who = email || 'someone in Locus';
      return json(await setState(env, { ...b, act }, who, d.centralDate ? d.centralDate() : centralToday()));
    }
    if (path === '/api/buyer-list/settings' && request.method === 'PUT') {
      const b = await request.json().catch(() => ({}));
      return json({ ok: true, settings: await saveBuyerSettings(env, b) });
    }
    if (path === '/api/buyer-list/preview' && request.method === 'GET') {
      const list = await buildBuyerList(env, d, { act: 'all', only });
      const set = await buyerSettings(env);
      const st = safe(await getSetting(env, 'buyerPostDone'), {}) || {};
      return json({ text: buyerPlain(list), blocks: buyerMessage(list, null).blocks, channel: set.buyerChannel, on: set.buyerPost, hour: await morningHour(env), last: st });
    }
    if (path === '/api/buyer-list/post' && request.method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const ch = String(b.channel || '').trim();
      if (!/^[CGU][A-Z0-9]{6,}$/.test(ch)) return json({ error: 'Which channel? A Slack channel id, like C0C8B4ZCGKT.' }, 400);
      const list = await buildBuyerList(env, d, { act: 'all', only });
      return json(await postBuyerList(env, d, ch, list));
    }
    /* ---- the review flow (buyerai.js) ---- */
    const oneBrand = async raw => {
      const act = await actOf(raw);
      if (!act || act === 'all') throw Object.assign(new Error('Pick a brand first.'), { status: 400 });
      if (only && !only.has(act)) throw Object.assign(new Error('You do not have access to this brand.'), { status: 403 });
      return act;
    };
    /* The row's ads: cover, name and 7-day numbers each. */
    if (path === '/api/buyer-list/ads' && request.method === 'GET') {
      const act = await oneBrand(url.searchParams.get('act'));
      const adset = String(url.searchParams.get('adset') || ''), ad = String(url.searchParams.get('ad') || '');
      if (!/^\d{6,25}$/.test(adset) && !/^\d{6,25}$/.test(ad)) return json({ error: 'Which ad set?' }, 400);
      const days = Math.min(30, Math.max(3, +url.searchParams.get('days') || 7));
      const metaActs = await metaActsOf(env, act, url.searchParams.get('meta_act') || null);
      const r = await adNumbers(env, { act, metaActs, adsetIds: /^\d{6,25}$/.test(adset) ? [adset] : [], adIds: /^\d{6,25}$/.test(ad) ? [ad] : [], days });
      return json({ ...r, days, ads: await withCovers(env, r.ads) });
    }
    if (path === '/api/buyer-list/disagree' && request.method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const act = await oneBrand(b.act);
      const a = (await d.listAccounts(env, true)).find(x => x.act_id === act);
      return json(await disagree(env, d, { act, brand: a ? a.name : act, row: b.row, why: b.why, author: email || 'Cole', today: d.centralDate ? d.centralDate() : centralToday() }));
    }
    if (path === '/api/buyer-list/decide' && request.method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const act = await oneBrand(b.act);
      return json(await decide(env, { act, id: String(b.id || ''), decision: b.decision, who: email || 'Cole', today: d.centralDate ? d.centralDate() : centralToday() }));
    }
    if (path === '/api/buyer-list/lessons' && request.method === 'GET') {
      const act = await oneBrand(url.searchParams.get('act'));
      return json({ lessons: (await lessonsFor(env, act, 60)).map(l => ({ id: l.id, at: l.created_at, kind: l.kind, name: l.name, text: l.text, author: l.author, stance: l.stance, answer: l.answer, decision: l.decision })) });
    }
    /* Run the morning read now (one brand, or every brand); force re-reads a brand already read today. */
    if (path === '/api/buyer-list/ai/run' && request.method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const acts = b.act && b.act !== 'all' ? [await oneBrand(b.act)] : (only ? [...only] : null);
      return json(await buyerAITick(env, d, { force: true, acts }));
    }
    if (path === '/api/buyer-list/ai/spend' && request.method === 'GET') {
      const day = d.centralDate ? d.centralDate() : centralToday();
      const month = safe(await getSetting(env, `aiSpend:buyer:${day.slice(0, 7)}`), {}) || {};
      return json({ day, today: await spentToday(env, day), cap: DAY_CAP, month, state: safe(await getSetting(env, 'buyerAIDone'), {}) });
    }
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, e.status || 502); }
}
