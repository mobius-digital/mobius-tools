/* ALARMS THAT COST THE MOST (round 21 research, 2026-11-26: "the missing alarms are the open lane"). Each one is an
 * urgent Locus row first (urgent.js raiseAlert: one row per person per thing, a refresh never pings again, it clears
 * itself when the thing is fixed) for the brand's buyer and the owner. Slack and email copies follow each person's
 * preset once settings notifyCopies is 'on' (Dec 5). Until then three of them also DM in Slack (urgent.js DM_TONIGHT),
 * because a bell row nobody sees on a sale night is no alarm.
 *
 *   account_blocked   the Meta ad account is disabled, unpaid, in review or closed, or its spending limit is reached
 *                     (or cannot cover one more day of today's budgets)
 *   ad_rejected       an ad (or ad set) rejected or with issues while its campaign is live: the first one of the day
 *                     opens the row, later ones only raise the count. One row per brand per day.
 *   campaign_stalled  a live campaign with a budget spends far under its pace today
 *   over_budget       today's spend far over today's daily budgets (past what Meta itself may overspend)
 *   no_orders         ads spending and no store order for N hours (N from the brand's own pace): the store, the
 *                     checkout or a discount code is down
 *   tracking_lost     yesterday the store had orders but the Meta pixel or Triple Whale recorded far fewer than usual
 *   sold_out          a whole product is sold out and a live ad links to its product page (per brand, OFF by default)
 *
 * WHERE THEY RUN. No new cron: alarmsPass rides the existing hourly tick, after the War Room check-in and the urgent
 * sweep (worker.js scheduled). Reads are light and
 * one at a time (never parallel D1 reads): a handful of SELECTs for all brands, then per brand at most one Meta call for
 * each of: the account's status and limit (hourly), its rejected ads (hourly), its live campaigns with today's spend
 * (hourly from 10am to 9pm brand time, only when D1 shows a live campaign), and the sold out read (once a day, only when
 * switched on). Every Meta read stops while Meta is backing off or the tick's budget is low.
 *
 * PER BRAND SETTINGS, settings `alarms:<brand id>` (JSON, owner only through PUT /api/settings { alarms }):
 *   twUndercounts  true = Triple Whale's per ad count is known to run under for this brand: skip tracking_lost
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
 *  them), or null. budget = today's daily budgets in money. */
export function accountProblem(a, budget = null) {
  if (!a) return null;
  const st = ACCOUNT_STATUS[+a.account_status];
  if (st) return { kind: st[0], said: st[1] };
  const cap = cents(a.spend_cap), spent = cents(a.amount_spent);
  if (cap > 0 && spent != null) {
    const left = cap - spent;
    if (left <= 0) return { kind: 'limit_reached', cap, spent, left: 0 };
    if (budget > 0 && left < budget) return { kind: 'limit_near', cap, spent, left };
  }
  return null;
}
export function accountText(brand, p, cur) {
  const word = { disabled: 'Meta ad account disabled', unpaid: 'Meta ad account has a payment problem', review: 'Meta ad account under review',
    closed: 'Meta ad account closed', limit_reached: 'Meta ad account hit its spending limit', limit_near: 'Meta ad account about to hit its spending limit' }[p.kind];
  const body = p.kind === 'limit_reached'
    ? `The account spending limit of ${money(p.cap, cur)} is used up, so every campaign has stopped. Raise or reset it in Meta Billing.`
    : p.kind === 'limit_near'
      ? `Only ${money(p.left, cur)} is left of the ${money(p.cap, cur)} account spending limit, less than one day of today's budgets. Raise or reset it in Meta Billing before ads stop.`
      : `The Meta ad account ${p.said}. Every campaign in it is stopped until it is fixed in Meta (Account quality or Billing).`;
  return { title: `${brand}: ${word}`, body };
}

/* ================= b. rejected ads ================= */
/** One check of the problem ads. prevIds = { ad id: the day it was first seen }. The ads first seen today open (or
 *  count up) today's row; a day whose ads are all fixed clears. */
export function rejectedStep(prevIds, problems, today) {
  const cur = new Map((problems || []).map(p => [String(p.id), p]));
  const ids = {};
  for (const id of cur.keys()) ids[id] = (prevIds && prevIds[id]) || today;
  const byDay = {};
  for (const [id, day] of Object.entries(ids)) (byDay[day] = byDay[day] || []).push(cur.get(id));
  const before = new Set(Object.values(prevIds || {}));
  const clearDays = [...before].filter(day => !byDay[day]);
  if (!byDay[today]) clearDays.push(today);
  return { ids, todays: byDay[today] || [], clearDays: [...new Set(clearDays)] };
}
export function rejectedText(brand, todays) {
  const issues = todays.some(p => p.status === 'WITH_ISSUES');
  const sets = todays.filter(p => p.level === 'adset').length, ads = todays.length - sets;
  const what = [ads ? plural(ads, 'ad') : null, sets ? plural(sets, 'ad set') : null].filter(Boolean).join(' and ');
  return { title: `${brand}: ${what} ${issues ? 'rejected or with issues' : 'rejected'} today`,
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
 *  time, 4 to 24 hours. A store under 8 orders a day is too quiet to judge (null). */
export function noOrdersHours(perDay) {
  if (!(perDay >= 8)) return null;
  return Math.min(24, Math.max(4, Math.ceil(8 * 24 / perDay)));
}
/** One look at the store. prev: what the last look saw; obs: { day, orders, syncedMs, spendDay } (today in the brand's
 *  time, the order count as Triple Whale last synced it, Meta spend today so far). An order "happened" at the first
 *  look that saw the count go up (late on purpose: fewer false alarms). Spend is summed across looks so a quiet stretch
 *  across midnight still counts. */
export function storeStep(prev, obs, { nowMs, hours, minSpend = 50 }) {
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
  const down = !!hours && !ordered && silentH >= hours && spendSince >= minSpend;
  return { next, judged: true, ordered, down: down ? { hours: Math.floor(silentH), spend: spendSince } : null };
}
export function noOrdersText(brand, d, cur) {
  return { title: `${brand}: no store orders in ${d.hours} hours`,
    body: `Ads spent ${money(d.spend, cur)} since the last order Locus saw (Triple Whale's store orders). Check that the store loads, the checkout works and the sale codes apply.` };
}

/* ================= e. live campaigns: stopped, or far over today's budgets ================= */
export const STALL_SHARE = 0.15, STALL_MIN_EXPECTED = 25, OVER_FACTOR = 1.75, OVER_MIN = 100;
/** camps: live campaigns from Meta { id, name, daily_budget (cents), lifetime_budget, created_time, spend } and
 *  sets: { campaign id: { running, budget } } from the stored ad sets (ABO budgets, and whether a set runs now).
 *  frac = the share of the brand's day gone. A campaign with no running set, a lifetime budget or under a day old is
 *  never called stalled. Over budget counts only campaigns whose daily budget is known, past what Meta may overspend
 *  on its own (75%). */
export function campaignChecks(camps, sets, { frac, nowMs }) {
  const stalled = [];
  let spent = 0, budget = 0;
  for (const c of camps || []) {
    const s = (sets || {})[c.id];
    const own = cents(c.daily_budget);
    const b = own > 0 ? own : (s && s.budget > 0 && !(cents(c.lifetime_budget) > 0) ? s.budget : null);
    if (!b) continue;
    const sp = num(c.spend) || 0;
    spent += sp; budget += b;
    const young = c.created_time && nowMs - Date.parse(c.created_time) < 24 * 36e5;
    if (!s || !s.running || young) continue;
    const expected = b * frac;
    if (expected >= STALL_MIN_EXPECTED && sp < expected * STALL_SHARE) stalled.push({ id: c.id, name: c.name, spend: sp, budget: b, expected });
  }
  const over = budget >= 25 && spent >= budget * OVER_FACTOR && spent - budget >= OVER_MIN ? { spent, budget } : null;
  return { stalled, over };
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
 *        clear, liveDailyBudget, supplyBrandOf?, supplyFetch?, now? }. raise/clear are urgent.js through worker.js. */
export async function alarmsPass(env, d) {
  const nowMs = d.now ? +d.now() : Date.now();
  const brands = (await d.listAccounts(env, true).catch(() => [])).filter(b => b && b.act_id && !b.demo);
  if (!brands.length) return { skipped: 'no active brands' };
  const state = safe(await d.getSetting(env, 'alarmState'), {}) || {};
  const out = { raised: [], cleared: [], errors: [] };
  const metaOk = !(d.metaBackedOff && (await d.metaBackedOff(env).catch(() => false)));
  const canMeta = n => metaOk && (!d.can || d.can(n));
  const raise = async (type, b, thing, text) => { await d.raise({ type, thing, brand_id: b.act_id, page: ALARM_PAGE[type], ...text }); out.raised.push(`${type}:${thing}`); };
  const clear = async (type, thing) => { await d.clear(type, thing); };
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
    const cfg = cfgs[b.act_id], cur = b.currency || 'USD';
    const today = d.localDate(b.tz), hour = d.localHourFrac(b.tz);
    const meta = b.meta_act || null;
    let blocked = false;
    try {
      /* a. the ad account, hourly */
      if (meta && !offFor(b, 'account_blocked')) {
        let acct = null;
        if (canMeta(10) && !(st.acctAt > nowMs - 50 * 60e3)) {
          acct = await d.meta(env, meta, { fields: 'account_status,disable_reason,spend_cap,amount_spent' }).catch(() => null);
          if (acct) { st.acctAt = nowMs; await saveAccount(env, meta, acct); }
        }
        if (!acct) acct = await storedAccount(env, meta);
        if (acct) {
          const budget = d.liveDailyBudget ? await d.liveDailyBudget(env, b).catch(() => null) : null;
          const p = accountProblem(acct, budget);
          if (p) { blocked = true; await raise('account_blocked', b, b.act_id, accountText(b.name, p, cur)); }
          else { await clear('account_blocked', b.act_id); }
        }
      }
      /* b. rejected ads, hourly */
      if (meta && !offFor(b, 'ad_rejected') && canMeta(10) && !(st.rejAt > nowMs - 50 * 60e3)) {
        const r = await d.meta(env, `${meta}/ads`, { effective_status: ['DISAPPROVED', 'WITH_ISSUES'], fields: 'id,name,effective_status,campaign{id,name,effective_status}', limit: 100 }).catch(() => null);
        if (r) {
          st.rejAt = nowMs;
          const ads = (r.data || []).filter(a => String(a.campaign?.effective_status || '').toUpperCase() === 'ACTIVE')
            .map(a => ({ id: a.id, name: a.name, status: a.effective_status, level: 'ad' }));
          const sets = ((await env.DB.prepare(`SELECT s.adset_id, s.name FROM meta_adsets s JOIN meta_campaigns c ON c.campaign_id = s.campaign_id
              WHERE s.act_id IN ${metaOf(1)} AND s.status = 'WITH_ISSUES' AND c.status = 'ACTIVE'`).bind(b.act_id).all().catch(() => ({ results: [] }))).results || [])
            .map(s => ({ id: 'set:' + s.adset_id, name: s.name, status: 'WITH_ISSUES', level: 'adset' }));
          const step = rejectedStep(st.rej || {}, [...ads, ...sets], today);
          st.rej = Object.fromEntries(Object.entries(step.ids).slice(0, 300));
          if (step.todays.length) await raise('ad_rejected', b, `${b.act_id}:${today}`, rejectedText(b.name, step.todays));
          for (const day of step.clearDays) await clear('ad_rejected', `${b.act_id}:${day}`);
        }
      }
      /* e. live campaigns, hourly from 10am to 9pm brand time */
      if (meta && hour >= 10 && hour < 21 && !(st.campAt > nowMs - 50 * 60e3) && (!offFor(b, 'campaign_stalled') || !offFor(b, 'over_budget'))) {
        const nowIso = new Date(nowMs).toISOString();
        const setRows = (await env.DB.prepare(`SELECT s.campaign_id AS c, COUNT(*) AS n, SUM(CASE WHEN s.daily_budget > 0 THEN s.daily_budget ELSE 0 END) AS b FROM meta_adsets s
            WHERE s.act_id IN ${metaOf(1)} AND s.status = 'ACTIVE' AND (s.start_time IS NULL OR s.start_time <= ?2) AND (s.end_time IS NULL OR s.end_time > ?2) GROUP BY s.campaign_id`)
          .bind(b.act_id, nowIso).all().catch(() => ({ results: [] }))).results || [];
        if (setRows.length && canMeta(10)) {
          const r = await d.meta(env, `${meta}/campaigns`, { effective_status: ['ACTIVE'], fields: 'id,name,daily_budget,lifetime_budget,created_time,insights.date_preset(today){spend}', limit: 200 }).catch(() => null);
          if (r) {
            st.campAt = nowMs;
            const sets = Object.fromEntries(setRows.map(x => [String(x.c), { running: +x.n || 0, budget: +x.b || 0 }]));
            const camps = (r.data || []).map(c => ({ id: String(c.id), name: c.name, daily_budget: c.daily_budget, lifetime_budget: c.lifetime_budget, created_time: c.created_time, spend: c.insights?.data?.[0]?.spend ?? 0 }));
            const res = campaignChecks(camps, sets, { frac: hour / 24, nowMs });
            if (!offFor(b, 'campaign_stalled')) {
              if (res.stalled.length && !blocked) await raise('campaign_stalled', b, b.act_id, stalledText(b.name, res.stalled, cur));
              else if (!res.stalled.length) await clear('campaign_stalled', b.act_id);
            }
            if (!offFor(b, 'over_budget')) {
              if (res.over) await raise('over_budget', b, b.act_id, overText(b.name, res.over, cur));
              else await clear('over_budget', b.act_id);
            }
          }
        }
      }
      /* d. ads spending, no store order for N hours: every hour, from stored numbers only */
      const ob = (orders[b.act_id] || {})[today];
      if (b.tw_shop && !offFor(b, 'no_orders') && ob) {
        const days = Object.entries(orders[b.act_id] || {}).filter(([dt]) => dt < today && dt >= d.addDays(today, -14));
        const perDay = days.length >= 7 ? days.reduce((s, [, x]) => s + x.v, 0) / days.length : null;
        const hours = cfg.noOrdersHours || noOrdersHours(perDay);
        const step = storeStep(st.store || null, { day: today, orders: ob.v, syncedMs: ob.at, spendDay: ((spend[b.act_id] || {})[today] || {}).s || 0 }, { nowMs, hours });
        st.store = step.next;
        if (step.judged) {
          if (step.down && hour >= 10) await raise('no_orders', b, b.act_id, noOrdersText(b.name, step.down, cur));
          else if (step.ordered || !step.down) await clear('no_orders', b.act_id);
        }
      }
      /* c. tracking, once a brand day from 1pm, judging yesterday once Triple Whale has synced it after midnight */
      if (b.tw_shop && !cfg.twUndercounts && !offFor(b, 'tracking_lost') && hour >= 13 && st.trackDay !== today) {
        const y = d.addDays(today, -1), midnight = nowMs - hour * 36e5;
        const yo = (orders[b.act_id] || {})[y];
        if (yo && yo.at >= midnight) {
          st.trackDay = today;
          const tw = {};
          for (const r of (await env.DB.prepare(`SELECT date, SUM(orders) AS o FROM tw_ad_attr WHERE act_id = ?1 AND model = 'lastPlatformClick' AND date >= ?2 AND date <= ?3 GROUP BY date`)
            .bind(b.act_id, d.addDays(y, -7), y).all().catch(() => ({ results: [] }))).results || []) tw[r.date] = +r.o || 0;
          const hasTw = Object.keys(tw).length > 0;
          const dayOf = dt => ({ orders: ((orders[b.act_id] || {})[dt] || {}).v || 0, pixel: meta ? (((spend[b.act_id] || {})[dt] || {}).p ?? 0) : null,
            tw: hasTw ? (tw[dt] || 0) : null, spend: ((spend[b.act_id] || {})[dt] || {}).s || 0 });
          const prior = []; for (let i = 1; i <= 7; i++) prior.push(dayOf(d.addDays(y, -i)));
          const g = trackingGap(dayOf(y), prior);
          if (g.broken.length) await raise('tracking_lost', b, b.act_id, trackingText(b.name, dayOf(y), g.broken));
          else if (g.ran) await clear('tracking_lost', b.act_id);
        } else if (hour >= 23) st.trackDay = today;   // not synced today: the report hold says so; try tomorrow
      }
      /* f. sold out, once a brand day from 9am, only where switched on */
      if (cfg.soldOut && meta && !offFor(b, 'sold_out') && hour >= 9 && st.soldDay !== today && d.supplyBrandOf && canMeta(30)) {
        st.soldDay = today;
        const sb = await d.supplyBrandOf(env, b.act_id).catch(() => null);
        const stock = sb ? await d.supplyFetch(env, '/api/state', { brand: sb.id, actor: 'Locus alarms' }).catch(() => null) : null;
        if (stock) {
          const r = await d.meta(env, `${meta}/ads`, { effective_status: ['ACTIVE'], fields: 'id,name,creative{object_story_spec,asset_feed_spec}', limit: 200 }).catch(() => null);
          if (r) {
            const hits = soldOutHits(stock.products || [], r.data || []);
            if (hits.length) await raise('sold_out', b, b.act_id, soldOutText(b.name, hits));
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
  for (const c of ['spend_cap REAL', 'amount_spent REAL', 'disable_reason INTEGER', 'health_at TEXT']) await env.DB.prepare(`ALTER TABLE accounts ADD COLUMN ${c}`).run().catch(() => {});
  acctCols = true;
}
export function _resetAlarms() { acctCols = false; }
async function saveAccount(env, act, a) {
  await ensureAccountCols(env);
  await env.DB.prepare(`UPDATE accounts SET account_status = COALESCE(?2, account_status), spend_cap = ?3, amount_spent = ?4, disable_reason = ?5, health_at = ?6 WHERE act_id = ?1`)
    .bind(act, num(a.account_status), num(a.spend_cap), num(a.amount_spent), num(a.disable_reason), new Date().toISOString()).run().catch(() => {});
}
async function storedAccount(env, act) {
  await ensureAccountCols(env);
  return env.DB.prepare(`SELECT account_status, spend_cap, amount_spent FROM accounts WHERE act_id = ?1`).bind(act).first()
    .catch(() => env.DB.prepare(`SELECT account_status FROM accounts WHERE act_id = ?1`).bind(act).first().catch(() => null));
}
