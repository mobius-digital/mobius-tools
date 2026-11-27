/* ALARMS THAT COST THE MOST (round 21 research, 2026-11-26: "the missing alarms are the open lane"). Each one is an
 * urgent Locus row first (urgent.js raiseAlert: one row per person per thing, a refresh never pings again, it clears
 * itself when the thing is fixed) for the brand's buyer and the owner. Slack and email copies follow each person's
 * preset once settings notifyCopies is 'on' (Dec 5). Until then three of them also DM in Slack (urgent.js DM_TONIGHT),
 * because a bell row nobody sees on a sale night is no alarm.
 *
 *   account_blocked   the Meta ad account is disabled, unpaid, in review or closed, or its spending limit is reached
 *                     (or cannot cover one more day of today's budgets), or its daily spending limit (adtrust_dsl) is
 *                     used up today or sits under today's budgets
 *   ad_rejected       an ad (or ad set) rejected or with issues while its campaign is live: the first one of the day
 *                     opens the row, later ones only raise the count. One row per brand per day, refreshed every hour
 *                     its ads stay rejected. The first look at a brand only remembers what is already rejected.
 *   campaign_stalled  a live campaign with a budget spends far under its pace (paced from the later of the brand's
 *                     midnight and its first running set's start, sets started 6+ hours ago only), its spend did not
 *                     move since the last hourly look, and a live read of its ad sets agrees one is running
 *   over_budget       today's spend far over today's daily budgets (past what Meta itself may overspend)
 *   no_orders         ads spending and no store order for N waking hours (8am to 11pm brand time; N from the
 *                     median day of the last 14): the store, the checkout or a discount code is down
 *   tracking_lost     yesterday the store had orders but the Meta pixel or Triple Whale recorded far fewer than usual
 *   sold_out          a whole product is sold out and a live ad links to its product page (per brand, OFF by default)
 *
 * WHERE THEY RUN. No new cron: alarmsPass rides the existing hourly tick, after the client dailies and reports and
 * behind the tick's budget (worker.js scheduled). Each Meta read has a 15 second timeout, and only a real rate limit
 * from one parks the other Meta callers. Reads are light and
 * one at a time (never parallel D1 reads): a handful of SELECTs for all brands, then per brand at most one Meta call for
 * each of: the account's status and limits (hourly), its rejected ads (hourly, up to 3 pages), its live campaigns with
 * today's spend (hourly from 10am to 9pm brand time, only when D1 shows a running set; plus one live ad set read only
 * when a campaign looks stalled), and the sold out read (once a day, only when
 * switched on). Every Meta read stops while Meta is backing off or the tick's budget is low.
 *
 * PER BRAND SETTINGS, settings `alarms:<brand id>` (JSON, owner only through PUT /api/settings { alarms }):
 *   twUndercounts  true = Triple Whale's per ad count is known to run under for this brand: tracking_lost judges the
 *                  pixel only
 *   noOrdersHours  hours without an order before no_orders fires (default: from the brand's last 14 days)
 *   soldOut        true = run the sold out check (default false: see soldOutHits for why)
 *   off            a list of alarm types this brand never raises
 * settings alarmDm = 'off' stops the Slack DMs that bridge until Dec 5. Nothing here writes to Meta or a client. */
import { metaOf } from './brands.js';

export const ALARM_TYPES = ['account_blocked', 'ad_rejected', 'campaign_stalled', 'over_budget', 'no_orders', 'tracking_lost', 'sold_out'];
/** The v5 page each alarm opens (a brand page, opened on that brand). */
export const ALARM_PAGE = { account_blocked: 'meta/live-now', ad_rejected: 'meta/live-now', campaign_stalled: 'meta/live-now', over_budget: 'meta/live-now',
  no_orders: 'sales/by-day', tracking_lost: 'meta/overview', sold_out: 'sales/inventory' };

const safe = (s, fb) => { if (s == null || s === '') return fb; if (typeof s !== 'string') return s; try { const v = JSON.parse(s); return v == null ? fb : v; } catch { return fb; } };
const num = v => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
const cents = v => (num(v) == null ? null : num(v) / 100);
const plural = (n, w, many) => `${n} ${n === 1 ? w : (many || w + 's')}`;
export function money(v, cur = 'USD') {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(Math.round(v || 0)); }
  catch { return '$' + Math.round(v || 0).toLocaleString('en-US'); }
}
const list = (names, n = 3) => { const s = names.filter(Boolean); return s.slice(0, n).map(x => `"${String(x).slice(0, 60)}"`).join(', ') + (s.length > n ? ` and ${s.length - n} more` : ''); };

/** A brand's alarm settings, cleaned. */
export function alarmCfg(raw) {
  const o = safe(raw, {}) || {};
  const h = num(o.noOrdersHours);
  return { twUndercounts: o.twUndercounts === true, soldOut: o.soldOut === true, noOrdersHours: h && h >= 1 && h <= 72 ? Math.round(h) : null,
    off: Array.isArray(o.off) ? o.off.filter(t => ALARM_TYPES.includes(t)) : [] };
}
/** The alarms part of a PUT /api/settings body: { [brand id]: settings } -> the cleaned objects to save. */
export function cleanAlarmCfg(body) {
  const out = {};
  for (const [k, v] of Object.entries(body && typeof body === 'object' ? body : {})) if (/^brand_[a-z0-9_]+$/.test(k) && v && typeof v === 'object') out[k] = alarmCfg(v);
  return out;
}

/* ================= a. the ad account ================= */
const ACCOUNT_STATUS = { 2: ['disabled', 'is disabled'], 3: ['unpaid', 'has an unpaid balance'], 7: ['review', 'is under a Meta risk review'],
  8: ['unpaid', 'is waiting on a payment to settle'], 9: ['unpaid', 'is in a payment grace period (a payment failed)'], 100: ['closed', 'is being closed'], 101: ['closed', 'is closed'] };
/** What is wrong with a Meta ad account, from its stored fields (spend_cap and amount_spent in cents, as Meta sends
 *  them; adtrust_dsl, the daily spending limit, in money, -1 = none), or null. budget = today's daily budgets in money,
 *  spentToday = today's spend so far in money. */
export function accountProblem(a, budget = null, spentToday = null) {
  if (!a) return null;
  const st = ACCOUNT_STATUS[+a.account_status];
  if (st) return { kind: st[0], said: st[1] };
  const cap = cents(a.spend_cap), spent = cents(a.amount_spent);
  if (cap > 0 && spent != null) {
    const left = cap - spent;
    if (left <= 0) return { kind: 'limit_reached', cap, spent, left: 0 };
    if (budget > 0 && left < budget) return { kind: 'limit_near', cap, spent, left };
  }
  const dsl = num(a.adtrust_dsl);
  if (dsl > 0) {
    if (spentToday != null && spentToday >= dsl * 0.98) return { kind: 'dsl_reached', dsl, spent: spentToday };
    if (budget > 0 && budget > dsl * 1.02) return { kind: 'dsl_over', dsl, budget };
  }
  return null;
}
/** The kinds that stop every campaign now (the stalled check stays quiet behind them). A near limit does not. */
export const STOPS_ALL = new Set(['disabled', 'unpaid', 'review', 'closed', 'limit_reached', 'dsl_reached']);
export function accountText(brand, p, cur) {
  const word = { disabled: 'Meta ad account disabled', unpaid: 'Meta ad account has a payment problem', review: 'Meta ad account under review',
    closed: 'Meta ad account closed', limit_reached: 'Meta ad account hit its spending limit', limit_near: 'Meta ad account about to hit its spending limit',
    dsl_reached: 'Meta ad account hit its daily spending limit', dsl_over: "today's budgets are over the Meta daily spending limit" }[p.kind];
  const body = p.kind === 'limit_reached'
    ? `The account spending limit of ${money(p.cap, cur)} is used up, so every campaign has stopped. Raise or reset it in Meta Billing.`
    : p.kind === 'limit_near'
      ? `Only ${money(p.left, cur)} is left of the ${money(p.cap, cur)} account spending limit, less than one day of today's budgets. Raise or reset it in Meta Billing before ads stop.`
      : p.kind === 'dsl_reached'
        ? `Spent ${money(p.spent, cur)} today against Meta's daily spending limit of ${money(p.dsl, cur)}, so delivery stops until tomorrow. Ask Meta to raise the limit (Account quality or Billing) if the budgets need more.`
        : p.kind === 'dsl_over'
          ? `Today's budgets add up to ${money(p.budget, cur)} but Meta lets this account spend only ${money(p.dsl, cur)} a day, so delivery will stop at the limit. Ask Meta to raise it, or trim the budgets.`
          : `The Meta ad account ${p.said}. Every campaign in it is stopped until it is fixed in Meta (Account quality or Billing).`;
  return { title: `${brand}: ${word}`, body };
}

/* ================= b. rejected ads ================= */
/** One check of the problem ads. prevIds = { ad id: the day it was first seen }, or null on the first look at a brand:
 *  that look only remembers what is already rejected (day 'seed') and raises nothing, so a deploy never calls old
 *  rejections "today". The ads first seen on a day keep that day's row open (today's counts up); a day whose ads are
 *  all fixed clears. */
export const SEED = 'seed';
export function rejectedStep(prevIds, problems, today) {
  const cur = new Map((problems || []).map(p => [String(p.id), p]));
  const ids = {};
  for (const id of cur.keys()) ids[id] = prevIds ? (prevIds[id] || today) : SEED;
  const byDay = {};
  for (const [id, day] of Object.entries(ids)) (byDay[day] = byDay[day] || []).push(cur.get(id));
  const before = new Set(Object.values(prevIds || {}));
  const clearDays = [...before].filter(day => !byDay[day] && day !== SEED);
  if (!byDay[today]) clearDays.push(today);
  const open = Object.fromEntries(Object.entries(byDay).filter(([day]) => day !== SEED));
  return { ids, todays: byDay[today] || [], open, clearDays: [...new Set(clearDays)] };
}
const shortDay = ymd => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
/** day = the day they were first seen, when it is not today. */
export function rejectedText(brand, todays, day = null) {
  const issues = todays.some(p => p.status === 'WITH_ISSUES');
  const sets = todays.filter(p => p.level === 'adset').length, ads = todays.length - sets;
  const what = [ads ? plural(ads, 'ad') : null, sets ? plural(sets, 'ad set') : null].filter(Boolean).join(' and ');
  return { title: `${brand}: ${what} ${issues ? 'rejected or with issues' : 'rejected'} ${day ? `since ${shortDay(day)}` : 'today'}`,
    body: `In live campaigns: ${list(todays.map(p => p.name || p.id))}. Fix or appeal them in Ads Manager (Account quality).` };
}

/* ================= c. tracking ================= */
export const TRACK_MIN_ORDERS = 10, TRACK_MIN_SPEND = 50, TRACK_DROP = 0.25;
/** Yesterday's tracked purchases against the store's orders, each source against its own normal share of orders over
 *  the days before. day = { orders, pixel, tw, spend }; prior = the same per earlier day. A source fires only on a wide
 *  gap: a quarter of its normal share or less, on a day with real orders and spend. */
export function trackingGap(day, prior) {
  if (!day || !(day.orders >= TRACK_MIN_ORDERS) || !(day.spend >= TRACK_MIN_SPEND)) return { ran: false, broken: [] };
  const broken = [];
  for (const k of ['pixel', 'tw']) {
    if (day[k] == null) continue;
    const p = (prior || []).filter(x => x && x.orders > 0 && x[k] != null);
    const po = p.reduce((s, x) => s + x.orders, 0), pk = p.reduce((s, x) => s + x[k], 0);
    if (p.length < 4 || po < 20) continue;
    const normal = pk / po;
    if (normal < 0.1) continue;
    const now = day[k] / day.orders;
    if (now <= normal * TRACK_DROP) broken.push({ source: k, got: day[k], now, normal });
  }
  return { ran: true, broken };
}
export function trackingText(brand, day, broken) {
  const name = { pixel: 'the Meta pixel', tw: 'Triple Whale' };
  const parts = broken.map(b => `${name[b.source]} recorded ${Math.round(b.got)} (usually about ${Math.round(b.normal * 100)}% of orders)`);
  return { title: `${brand}: purchases are not being tracked`,
    body: `Yesterday the store had ${day.orders} orders but ${parts.join(' and ')}. Check the pixel, the checkout tracking and the Triple Whale connection.` };
}

/* ================= d. no store orders ================= */
/** Hours without an order that are not normal for a store with this many orders a day: about 8 orders' worth of
 *  time, 4 to 24 hours. A store under 8 orders a day is too quiet to judge (null). perDay is the MEDIAN day (see
 *  medianOf), so a sale week does not shrink the window for the quiet weeks after it. */
export function noOrdersHours(perDay) {
  if (!(perDay >= 8)) return null;
  return Math.min(24, Math.max(4, Math.ceil(8 * 24 / perDay)));
}
/** The middle of a list of numbers (null for none). */
export function medianOf(xs) {
  const v = (xs || []).filter(x => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
export const WAKE_FROM = 8, WAKE_TO = 23;
const hourFmt = {};
function localHour(ms, tz) {
  const f = hourFmt[tz] || (hourFmt[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit' }));
  return +f.format(new Date(ms)) % 24;
}
/** The waking hours (8am to 11pm in tz) between two instants, in 15 minute steps, over at most 3 days. A store is
 *  quiet overnight, so only these hours count toward "no order for N hours". */
export function wakingHours(fromMs, toMs, tz = 'America/Chicago') {
  if (!(toMs > fromMs)) return 0;
  const step = 15 * 60e3, start = Math.max(fromMs, toMs - 72 * 36e5);
  let n = 0;
  try { for (let t = start; t < toMs; t += step) { const h = localHour(t, tz); if (h >= WAKE_FROM && h < WAKE_TO) n += Math.min(step, toMs - t); } }
  catch { return (toMs - fromMs) / 36e5; }
  return n / 36e5;
}
/** One look at the store. prev: what the last look saw; obs: { day, orders, syncedMs, spendDay } (today in the brand's
 *  time, the order count as Triple Whale last synced it, Meta spend today so far). An order "happened" at the first
 *  look that saw the count go up (late on purpose: fewer false alarms). Spend is summed across looks so a quiet stretch
 *  across midnight still counts. */
export function storeStep(prev, obs, { nowMs, hours, minSpend = 50, tz = null }) {
  if (!obs || !Number.isFinite(obs.syncedMs)) return { next: prev || null, judged: false };
  if (!prev || !prev.day) return { next: { day: obs.day, orders: obs.orders, spendDay: obs.spendDay, cum: 0, orderAt: obs.syncedMs, cumAt: 0 }, judged: false };
  const same = prev.day === obs.day;
  const delta = same ? Math.max(0, (obs.spendDay || 0) - (prev.spendDay || 0)) : (obs.spendDay || 0);
  const cum = (prev.cum || 0) + delta;
  const ordered = same ? obs.orders > prev.orders : obs.orders > 0;
  const next = { day: obs.day, orders: obs.orders, spendDay: obs.spendDay, cum, orderAt: ordered ? obs.syncedMs : prev.orderAt, cumAt: ordered ? cum : prev.cumAt };
  const fresh = nowMs - obs.syncedMs <= 2 * 36e5;
  if (!fresh) return { next, judged: false };
  const silentH = (obs.syncedMs - next.orderAt) / 36e5, spendSince = cum - (next.cumAt || 0);
  /* Judged on waking hours only when the brand's zone is known: a midnight to 8am gap is a normal night. */
  const awakeH = tz ? wakingHours(next.orderAt, obs.syncedMs, tz) : silentH;
  const down = !!hours && !ordered && awakeH >= hours && spendSince >= minSpend;
  return { next, judged: true, ordered, down: down ? { hours: Math.floor(silentH), spend: spendSince } : null };
}
export function noOrdersText(brand, d, cur) {
  return { title: `${brand}: no store orders in ${d.hours} hours`,
    body: `Ads spent ${money(d.spend, cur)} since the last order Locus saw (Triple Whale's store orders). Check that the store loads, the checkout works and the sale codes apply.` };
}

/* ================= e. live campaigns: stopped, or far over today's budgets ================= */
export const STALL_SHARE = 0.15, STALL_MIN_EXPECTED = 25, OVER_FACTOR = 1.75, OVER_MIN = 100, YOUNG_SET_H = 6;
/** A Meta time ("2026-12-01T00:00:00-0600", offset with or without a colon) in ms, or null. Never compare these as
 *  strings: the offset makes a string test hours off. */
export function metaMs(s) {
  if (!s) return null;
  const t = Date.parse(String(s).trim().replace(' ', 'T').replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
  return Number.isFinite(t) ? t : null;
}
/** The ad sets running now, by campaign: { campaign id: { running, budget, since } }. rows = { c (campaign id), b (set
 *  daily budget in money), st, et (Meta start and end times) }; since = the earliest running set's start (0 = no start
 *  time, long running). */
export function runningSets(rows, nowMs) {
  const out = {};
  for (const r of rows || []) {
    const st = metaMs(r.st), et = metaMs(r.et);
    if ((st != null && st > nowMs) || (et != null && et <= nowMs)) continue;
    const k = String(r.c), o = out[k] = out[k] || { running: 0, budget: 0, since: Infinity };
    o.running++; if (+r.b > 0) o.budget += +r.b; o.since = Math.min(o.since, st == null ? 0 : st);
  }
  return out;
}
/** camps: live campaigns from Meta { id, name, daily_budget (cents), lifetime_budget, created_time, spend } and
 *  sets: runningSets() (ABO budgets, whether a set runs now and since when). Pace runs from the later of the brand's
 *  midnight (midnightMs) and the campaign's first running set's start; without midnightMs it is budget x frac. A
 *  campaign with no running set, a lifetime budget, under a day old, or whose running sets all started under 6 hours
 *  ago is never called stalled. prev = { campaign id: spend } at the last hourly look today: when given, a campaign is
 *  stalled only if its spend did not move since then. Over budget counts only campaigns whose daily budget is known,
 *  past what Meta may overspend on its own (75%), against the larger of today's budgets now and earlier today
 *  (dayBudget), so a mid-day cut does not read as overspend. */
export function campaignChecks(camps, sets, { frac, nowMs, midnightMs = null, prev = undefined, dayBudget = 0 }) {
  const stalled = [], spends = {};
  let spent = 0, budget = 0;
  for (const c of camps || []) {
    const s = (sets || {})[c.id];
    const own = cents(c.daily_budget);
    const b = own > 0 ? own : (s && s.budget > 0 && !(cents(c.lifetime_budget) > 0) ? s.budget : null);
    if (!b) continue;
    const sp = num(c.spend) || 0;
    spends[c.id] = sp;
    spent += sp; budget += b;
    const young = c.created_time && nowMs - Date.parse(c.created_time) < 24 * 36e5;
    if (!s || !s.running || young) continue;
    const since = Number.isFinite(s.since) ? s.since : 0;
    if (since && nowMs - since < YOUNG_SET_H * 36e5) continue;
    const expected = midnightMs != null ? b * Math.max(0, nowMs - Math.max(midnightMs, since)) / 864e5 : b * frac;
    if (!(expected >= STALL_MIN_EXPECTED && sp < expected * STALL_SHARE)) continue;
    if (prev !== undefined && !(prev && prev[c.id] != null && sp <= prev[c.id] + 0.5)) continue;
    stalled.push({ id: c.id, name: c.name, spend: sp, budget: b, expected });
  }
  const bar = Math.max(budget, +dayBudget || 0);
  const over = bar >= 25 && spent >= bar * OVER_FACTOR && spent - bar >= OVER_MIN ? { spent, budget: bar } : null;
  return { stalled, over, spends, budget };
}
export function stalledText(brand, stalled, cur) {
  const top = stalled[0];
  return { title: `${brand}: ${plural(stalled.length, 'live campaign')} stopped spending`,
    body: `${list(stalled.map(c => c.name))}. ${stalled.length === 1 ? `It spent ${money(top.spend, cur)} of a ${money(top.budget, cur)} budget so far today (about ${money(top.expected, cur)} by now is normal).` : 'Each spent under a sixth of its pace today.'} Check billing, rejected ads, ad set dates and the delivery column in Ads Manager.` };
}
export function overText(brand, o, cur) {
  return { title: `${brand} spent far over today's budgets`,
    body: `Spent ${money(o.spent, cur)} today against ${money(o.budget, cur)} of daily budgets. Check for a budget typo, a doubled campaign or a budget lowered after it spent.` };
}

/* ================= f. sold out ================= */
/* OFF BY DEFAULT, per brand (settings alarms:<brand>.soldOut). Why: Locus reads stock only through Supply, which only
   some brands connect; Supply has no Shopify handle, so a product is matched to an ad's /products/<handle> link by its
   title made into a handle; and ad links are not stored, so the check reads each live ad's link from Meta once a day.
   Most of our ads link to a sale or collection page, which this never matches. Alert only: nothing is paused. */
export const slugOf = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/['\u2019]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export function adLink(ad) {
  const c = (ad && ad.creative) || {}, ld = c.object_story_spec?.link_data, vd = c.object_story_spec?.video_data, afs = c.asset_feed_spec || {};
  return ld?.link || vd?.call_to_action?.value?.link || afs.link_urls?.[0]?.website_url || null;
}
export function handleOf(url) {
  const m = /\/products\/([^/?#]+)/i.exec(String(url || ''));
  return m ? decodeURIComponent(m[1]).toLowerCase() : null;
}
/** Whole products sold out (nothing on hand in any variant) that a live ad links to. */
export function soldOutHits(products, ads) {
  const out = [];
  const byHandle = new Map();
  for (const a of ads || []) { const h = handleOf(adLink(a)); if (h) (byHandle.get(h) || byHandle.set(h, []).get(h)).push(a); }
  for (const p of products || []) {
    if (!(num(p.onHand) <= 0) || ['off'].includes(p.status)) continue;
    const h = String(p.handle || slugOf(p.title)).toLowerCase();
    const hit = h && byHandle.get(h);
    if (hit && hit.length) out.push({ product: p.title || h, ads: hit.map(a => a.name || a.id) });
  }
  return out;
}
export function soldOutText(brand, hits) {
  const first = hits[0];
  return { title: `${brand}: ${plural(hits.length, 'advertised product')} sold out`,
    body: `${hits.map(h => `"${h.product}"`).slice(0, 3).join(', ')}${hits.length > 3 ? ` and ${hits.length - 3} more` : ''} ${hits.length === 1 ? 'is' : 'are'} sold out and live ads link to ${hits.length === 1 ? 'it' : 'them'} (${list(first.ads)}). Pause or swap those ads if they still spend.` };
}

/* ================= the hourly pass ================= */
/** d = { getSetting, putSetting, listAccounts, localDate, localHourFrac, addDays, meta, metaBackedOff, can, raise,
 *        clear, liveDailyBudget, alertsMuted?, supplyBrandOf?, supplyFetch?, now? }. raise/clear are urgent.js through
 *        worker.js. alarmState per brand keeps what each check needs between looks, and `up`, the rows this pass
 *        raised, so a check clears only a row it raised (no table scan per check per brand every hour). */
export async function alarmsPass(env, d) {
  const nowMs = d.now ? +d.now() : Date.now();
  const brands = [];
  for (const b of (await d.listAccounts(env, true).catch(() => [])).filter(b => b && b.act_id && !b.demo)) {
    /* A muted brand (test brands, brands we do not run) never raises, so it is not even read. */
    if (d.alertsMuted && (await d.alertsMuted(env, b.act_id).catch(() => false))) continue;
    brands.push(b);
  }
  if (!brands.length) return { skipped: 'no active brands' };
  const state = safe(await d.getSetting(env, 'alarmState'), {}) || {};
  const out = { raised: [], cleared: [], errors: [] };
  const metaOk = !(d.metaBackedOff && (await d.metaBackedOff(env).catch(() => false)));
  const canMeta = n => metaOk && (!d.can || d.can(n));
  const brandIds = brands.map(b => b.act_id);
  const cfgs = {};
  for (const b of brands) cfgs[b.act_id] = alarmCfg(await d.getSetting(env, `alarms:${b.act_id}`).catch(() => null));
  const offFor = (b, type) => cfgs[b.act_id].off.includes(type);

  /* The store's orders and Meta spend for the last few days, every brand at once: two light reads. */
  const since = d.addDays(new Date(nowMs).toISOString().slice(0, 10), -16);
  const orders = {}, spend = {};
  for (const r of (await env.DB.prepare(`SELECT act_id, date, value, synced_at FROM tw_daily WHERE metric = 'totalOrders' AND date >= ?1`).bind(since).all().catch(() => ({ results: [] }))).results || [])
    (orders[r.act_id] = orders[r.act_id] || {})[r.date] = { v: +r.value || 0, at: Date.parse(String(r.synced_at || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(r.synced_at || '')) ? '' : 'Z')) };
  for (const r of (await env.DB.prepare(`SELECT c.brand_id AS b, d.date AS date, SUM(d.spend) AS s, SUM(d.purchases) AS p FROM daily_insights d JOIN connections c ON c.kind = 'meta' AND c.external_id = d.act_id
      WHERE d.date >= ?1 GROUP BY c.brand_id, d.date`).bind(since).all().catch(() => ({ results: [] }))).results || [])
    (spend[r.b] = spend[r.b] || {})[r.date] = { s: +r.s || 0, p: +r.p || 0 };

  for (const b of brands) {
    const st = state[b.act_id] = state[b.act_id] || {};
    const up = st.up = st.up && typeof st.up === 'object' ? st.up : {};
    const raise = async (type, thing, text) => { await d.raise({ type, thing, brand_id: b.act_id, page: ALARM_PAGE[type], ...text }); up[`${type}:${thing}`] = 1; out.raised.push(`${type}:${thing}`); };
    const clear = async (type, thing) => { const k = `${type}:${thing}`; if (!up[k]) return; await d.clear(type, thing); delete up[k]; out.cleared.push(k); };
    const cfg = cfgs[b.act_id], cur = b.currency || 'USD';
    const today = d.localDate(b.tz), hour = d.localHourFrac(b.tz);
    const midnightMs = nowMs - hour * 36e5;
    const meta = b.meta_act || null;
    let blocked = false;
    try {
      /* a. the ad account, hourly (its status, the lifetime limit and the daily limit in one read) */
      if (meta && !offFor(b, 'account_blocked')) {
        let acct = null;
        if (canMeta(10) && !(st.acctAt > nowMs - 50 * 60e3)) {
          acct = await d.meta(env, meta, { fields: 'account_status,disable_reason,spend_cap,amount_spent' }).catch(() => null);
          if (acct) { st.acctAt = nowMs; await saveAccount(env, meta, acct); }
        }
        if (!acct) acct = await storedAccount(env, meta);
        if (acct) {
          const budget = d.liveDailyBudget ? await d.liveDailyBudget(env, b).catch(() => null) : null;
          const spentToday = ((spend[b.act_id] || {})[today] || {}).s;
          const p = accountProblem(acct, budget, spentToday == null ? null : spentToday);
          if (p) { blocked = STOPS_ALL.has(p.kind); await raise('account_blocked', b.act_id, accountText(b.name, p, cur)); }
          else { await clear('account_blocked', b.act_id); }
        }
      }
      /* b. rejected ads, hourly. Up to 3 pages of 100, so an account with many old problem ads still sees a new one. */
      if (meta && !offFor(b, 'ad_rejected') && canMeta(10) && !(st.rejAt > nowMs - 50 * 60e3)) {
        let r = null, data = [], after = null;
        for (let page = 0; page < 3; page++) {
          r = await d.meta(env, `${meta}/ads`, { effective_status: ['DISAPPROVED', 'WITH_ISSUES'], fields: 'id,name,effective_status,campaign{id,name,effective_status}', limit: 100, ...(after ? { after } : {}) }).catch(() => null);
          if (!r) break;
          data = data.concat(r.data || []);
          after = r.paging && r.paging.next && r.paging.cursors && r.paging.cursors.after;
          if (!after || !canMeta(10)) break;
        }
        if (r) {
          st.rejAt = nowMs;
          const ads = data.filter(a => String(a.campaign?.effective_status || '').toUpperCase() === 'ACTIVE')
            .map(a => ({ id: a.id, name: a.name, status: a.effective_status, level: 'ad' }));
          const sets = ((await env.DB.prepare(`SELECT s.adset_id, s.name FROM meta_adsets s JOIN meta_campaigns c ON c.campaign_id = s.campaign_id
              WHERE s.act_id IN ${metaOf(1)} AND s.status = 'WITH_ISSUES' AND c.status = 'ACTIVE'`).bind(b.act_id).all().catch(() => ({ results: [] }))).results || [])
            .map(s => ({ id: 'set:' + s.adset_id, name: s.name, status: 'WITH_ISSUES', level: 'adset' }));
          /* st.rej undefined = the first look at this brand: remember, raise nothing. */
          const step = rejectedStep(st.rej && typeof st.rej === 'object' ? st.rej : null, [...ads, ...sets], today);
          st.rej = Object.fromEntries(Object.entries(step.ids).slice(0, 300));
          /* Every day still holding rejected ads keeps its row (refreshed, never a second ping), so it stays up until fixed. */
          for (const [day, list] of Object.entries(step.open).sort()) await raise('ad_rejected', `${b.act_id}:${day}`, rejectedText(b.name, list, day === today ? null : day));
          for (const day of step.clearDays) await clear('ad_rejected', `${b.act_id}:${day}`);
        }
      }
      /* e. live campaigns, hourly from 10am to 9pm brand time */
      if (meta && hour >= 10 && hour < 21 && !(st.campAt > nowMs - 50 * 60e3) && (!offFor(b, 'campaign_stalled') || !offFor(b, 'over_budget'))) {
        /* The stored sets with their Meta start and end times, compared as times in JS (never as strings). */
        const setRows = (await env.DB.prepare(`SELECT s.campaign_id AS c, s.daily_budget AS b, s.start_time AS st, s.end_time AS et FROM meta_adsets s
            WHERE s.act_id IN ${metaOf(1)} AND s.status = 'ACTIVE'`).bind(b.act_id).all().catch(() => ({ results: [] }))).results || [];
        const running = runningSets(setRows, nowMs);
        if (!Object.keys(running).length) {
          /* Nothing runs now: a stalled row from earlier cannot be true any more. */
          if (!offFor(b, 'campaign_stalled')) await clear('campaign_stalled', b.act_id);
        } else if (canMeta(10)) {
          const r = await d.meta(env, `${meta}/campaigns`, { effective_status: ['ACTIVE'], fields: 'id,name,daily_budget,lifetime_budget,created_time,insights.date_preset(today){spend}', limit: 200 }).catch(() => null);
          if (r) {
            st.campAt = nowMs;
            const look = st.camp && st.camp.day === today ? st.camp : { day: today, spend: null, budMax: 0 };
            const camps = (r.data || []).map(c => ({ id: String(c.id), name: c.name, daily_budget: c.daily_budget, lifetime_budget: c.lifetime_budget, created_time: c.created_time, spend: c.insights?.data?.[0]?.spend ?? 0 }));
            const res = campaignChecks(camps, running, { frac: hour / 24, nowMs, midnightMs, prev: look.spend || null, dayBudget: look.budMax });
            st.camp = { day: today, spend: res.spends, budMax: Math.max(look.budMax || 0, res.budget || 0) };
            if (!offFor(b, 'campaign_stalled')) {
              let stalled = res.stalled;
              /* The stored sets are up to 6 hours old (a hand pause in Ads Manager): one live read of the running sets
                 confirms before anyone hears "stopped". A failed read raises nothing. */
              if (stalled.length && !blocked) {
                const live = canMeta(10) ? await d.meta(env, `${meta}/adsets`, { effective_status: ['ACTIVE'], fields: 'id,campaign_id,start_time,end_time,daily_budget', limit: 200 }).catch(() => null) : null;
                if (!live) stalled = null;
                else {
                  const now = runningSets((live.data || []).map(s => ({ c: s.campaign_id, b: cents(s.daily_budget), st: s.start_time, et: s.end_time })), nowMs);
                  const ok = new Set(campaignChecks(camps.filter(c => stalled.some(x => x.id === c.id)), now, { frac: hour / 24, nowMs, midnightMs, prev: look.spend || null }).stalled.map(c => c.id));
                  stalled = stalled.filter(c => ok.has(c.id));
                }
              }
              if (stalled && stalled.length && !blocked) await raise('campaign_stalled', b.act_id, stalledText(b.name, stalled, cur));
              else if (stalled && !stalled.length) await clear('campaign_stalled', b.act_id);
            }
            if (!offFor(b, 'over_budget')) {
              if (res.over) await raise('over_budget', b.act_id, overText(b.name, res.over, cur));
              else await clear('over_budget', b.act_id);
            }
          }
        }
      }
      /* d. ads spending, no store order for N waking hours: every hour, from stored numbers only */
      const ob = (orders[b.act_id] || {})[today];
      if (b.tw_shop && !offFor(b, 'no_orders') && ob) {
        const days = Object.entries(orders[b.act_id] || {}).filter(([dt]) => dt < today && dt >= d.addDays(today, -14));
        /* The median day, not the mean: five sale days at 8x a normal day must not shrink the window after them. */
        const perDay = days.length >= 7 ? medianOf(days.map(([, x]) => x.v)) : null;
        const hours = cfg.noOrdersHours || noOrdersHours(perDay);
        const step = storeStep(st.store || null, { day: today, orders: ob.v, syncedMs: ob.at, spendDay: ((spend[b.act_id] || {})[today] || {}).s || 0 }, { nowMs, hours, tz: b.tz || 'America/Chicago' });
        st.store = step.next;
        if (step.judged) {
          if (step.down && hour >= 10) await raise('no_orders', b.act_id, noOrdersText(b.name, step.down, cur));
          else if (step.ordered || !step.down) await clear('no_orders', b.act_id);
        }
      }
      /* c. tracking, once a brand day from 1pm, judging yesterday once Triple Whale has synced it after midnight. A
         source with no row for a day is not judged that day (an unsynced day is not zero). */
      if (b.tw_shop && !offFor(b, 'tracking_lost') && hour >= 13 && st.trackDay !== today) {
        const y = d.addDays(today, -1);
        const yo = (orders[b.act_id] || {})[y];
        if (yo && yo.at >= midnightMs) {
          const tw = {};
          if (!cfg.twUndercounts) for (const r of (await env.DB.prepare(`SELECT date, SUM(orders) AS o FROM tw_ad_attr WHERE act_id = ?1 AND model = 'lastPlatformClick' AND date >= ?2 AND date <= ?3 GROUP BY date`)
            .bind(b.act_id, d.addDays(y, -7), y).all().catch(() => ({ results: [] }))).results || []) tw[r.date] = +r.o || 0;
          /* Triple Whale's per ad numbers for yesterday land with the morning brief or the nightly sync: until they do,
             wait (try next hour), and judge the pixel alone from 11pm. A brand with no per ad numbers at all does not wait. */
          const twWait = Object.keys(tw).length > 0 && !(y in tw) && hour < 23;
          if (!twWait) {
            st.trackDay = today;
            const sp = dt => (spend[b.act_id] || {})[dt];
            const dayOf = dt => ({ orders: ((orders[b.act_id] || {})[dt] || {}).v || 0, pixel: meta && sp(dt) ? sp(dt).p : null,
              tw: dt in tw ? tw[dt] : null, spend: (sp(dt) || {}).s || 0 });
            const prior = []; for (let i = 1; i <= 7; i++) prior.push(dayOf(d.addDays(y, -i)));
            const g = trackingGap(dayOf(y), prior);
            if (g.broken.length) await raise('tracking_lost', b.act_id, trackingText(b.name, dayOf(y), g.broken));
            else if (g.ran) await clear('tracking_lost', b.act_id);
          }
        } else if (hour >= 23) st.trackDay = today;   /* not synced today: the report hold says so; try tomorrow */
      }
      /* f. sold out, once a brand day from 9am, only where switched on. The day is marked only after both reads worked,
         so a failed read is tried again next hour. */
      if (cfg.soldOut && meta && !offFor(b, 'sold_out') && hour >= 9 && st.soldDay !== today && d.supplyBrandOf && canMeta(30)) {
        const sb = await d.supplyBrandOf(env, b.act_id).catch(() => null);
        const stock = sb ? await d.supplyFetch(env, '/api/state', { brand: sb.id, actor: 'Locus alarms' }).catch(() => null) : null;
        if (!sb) st.soldDay = today;   // no Supply brand: nothing to read today
        if (stock) {
          const r = await d.meta(env, `${meta}/ads`, { effective_status: ['ACTIVE'], fields: 'id,name,creative{object_story_spec,asset_feed_spec}', limit: 200 }).catch(() => null);
          if (r) {
            st.soldDay = today;
            const hits = soldOutHits(stock.products || [], r.data || []);
            if (hits.length) await raise('sold_out', b.act_id, soldOutText(b.name, hits));
            else await clear('sold_out', b.act_id);
          }
        }
      }
    } catch (e) { out.errors.push(`${b.name}: ${e.message}`); }
  }
  for (const k of Object.keys(state)) if (!brandIds.includes(k)) delete state[k];
  await d.putSetting(env, 'alarmState', JSON.stringify(state)).catch(() => {});
  return out;
}

/* The account's status and limit, kept on the accounts row (columns added on first use). */
let acctCols = false;
async function ensureAccountCols(env) {
  if (acctCols) return;
  for (const c of ['spend_cap REAL', 'amount_spent REAL', 'disable_reason INTEGER', 'health_at TEXT', 'adtrust_dsl REAL']) await env.DB.prepare(`ALTER TABLE accounts ADD COLUMN ${c}`).run().catch(() => {});
  acctCols = true;
}
export function _resetAlarms() { acctCols = false; }
async function saveAccount(env, act, a) {
  await ensureAccountCols(env);
  await env.DB.prepare(`UPDATE accounts SET account_status = COALESCE(?2, account_status), spend_cap = ?3, amount_spent = ?4, disable_reason = ?5, health_at = ?6, adtrust_dsl = ?7 WHERE act_id = ?1`)
    .bind(act, num(a.account_status), num(a.spend_cap), num(a.amount_spent), num(a.disable_reason), new Date().toISOString(), num(a.adtrust_dsl)).run().catch(() => {});
}
async function storedAccount(env, act) {
  await ensureAccountCols(env);
  return env.DB.prepare(`SELECT account_status, spend_cap, amount_spent, adtrust_dsl FROM accounts WHERE act_id = ?1`).bind(act).first()
    .catch(() => env.DB.prepare(`SELECT account_status FROM accounts WHERE act_id = ?1`).bind(act).first().catch(() => null));
}
