/* Locus - the Season tab's API (2026-10-05, desk + goals + results 2026-10-06).
 *
 * The BFCM plan, per brand: phases (what runs when, for whom, the deal), the call
 * sheet (goal, last year, cutoffs, gift cards), the goals and the scaling ladder,
 * what is due each week, results per phase once it has started, and the weekend
 * desk (three check-ins a day against the ladder, with what was done).
 *
 * Dates of every deliverable are DERIVED from the phase dates, so changing a
 * launch date moves its briefs, build and load dates with it; a p_season_task row
 * only exists once someone ticks, renames or re-dates a task, or adds a custom one.
 *
 * Why here and not the Q4 Playbook: that app was a sixth place to look and died
 * (last edit Aug 25, nothing launched). Locus is open all day. See CLAUDE.md.
 */
import { handsOff, HANDS_OFF_WHY } from './handsoff.js';

export const SEASON = '2026';
export const BF = '2026-11-27';

const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' },
});

/* The season shape every brand follows. `early` depends on the brand's shape
   (standard sale, Black November, or Early Access list building). */
const EARLY = {
  standard: { name: 'Early Black Friday', start: '2026-11-01', end: '2026-11-25', who: 'Everyone', hint: 'A warm-up offer weaker than the weekend. The weekend must beat it.' },
  blacknov: { name: 'Black November', start: '2026-11-01', end: '2026-11-25', who: 'Everyone', hint: 'Four weekly offers, each stronger than the last. Lock all four before Nov 1.' },
  access:   { name: 'List building', start: '2026-10-26', end: '2026-11-25', who: 'Anyone', hint: 'Giveaway or waitlist. No sale in November; the list is what pays on Thursday.' },
};
const TPL = [
  { key: 'early', grp: 'nov' },
  { key: 'access', name: 'Early access (Thursday)', start: '2026-11-26', end: '2026-11-26', grp: 'bf', who: 'List or members only', hint: 'Store locked to everyone else, or a 24-hour list-only deal.', optional: 1 },
  { key: 'bf', name: 'Black Friday weekend', start: '2026-11-27', end: '2026-11-30', grp: 'bf', who: 'Everyone', hint: 'The biggest offer of the year. Two sticker versions: Fri to Sun, and Monday last day.' },
  { key: 'planb', name: 'Plan B', start: '2026-11-27', end: '2026-11-30', grp: 'bf', who: 'Everyone', hint: 'Only if Friday 2pm is under target. Built ahead and paused.', optional: 1, status: 'skip' },
  { key: 'drop', name: 'Post-BFCM drop', start: '2026-12-04', end: '2026-12-06', grp: 'dec', who: 'BFCM buyers get the discount', hint: 'New product on the Friday after. Full price to cold traffic.' },
  { key: 'xmas', name: 'Order by Christmas', start: '2026-12-07', end: '2026-12-16', grp: 'dec', who: 'Everyone', hint: 'The date is the offer. The end date is the standard shipping cutoff.' },
  { key: 'gift', name: 'Gift cards', start: '2026-12-17', end: '2026-12-24', grp: 'dec', who: 'Everyone', hint: 'The only thing that arrives in time after the cutoff.' },
  { key: 'boxing', name: 'Boxing Day + run-back', start: '2026-12-26', end: '2026-12-31', grp: 'late', who: 'Non-buyers first', hint: 'One-day hit, then the best BFCM offer again through New Year\'s Eve.' },
  { key: 'ny', name: 'New Year\'s drop', start: '2026-12-29', end: '2027-01-05', grp: 'late', who: 'Everyone', hint: 'New product, resolution angles.' },
  { key: 'vday', name: 'Valentine\'s', start: '2027-01-14', end: '2027-02-07', grp: 'vday', who: 'Everyone', hint: 'Gifting angles return. Winning offer rebranded.' },
];
/* Atria swipe boards per phase (workspace "BFCM / ..." boards, made 2026-10-06) and per brand. */
const SWIPE = {
  early: { id: '013513c8-f480-4306-9e9f-241e68196211', name: 'BFCM / Early BFCM' },
  access: { id: '1ed93bd0-c08f-497d-b76b-631e97bf8f5e', name: 'BFCM / BFCM Sign Up' },
  bf: { id: '721dfca4-8f55-40e4-b5ff-5f39c3c194a0', name: 'BFCM / Black Friday weekend' },
  planb: { id: '721dfca4-8f55-40e4-b5ff-5f39c3c194a0', name: 'BFCM / Black Friday weekend' },
  cm: { id: '721dfca4-8f55-40e4-b5ff-5f39c3c194a0', name: 'BFCM / Black Friday weekend' },
  drop: { id: '7318a6e1-072c-44cd-8319-e382b4222e68', name: 'BFCM / Post-BFCM drop' },
  xmas: { id: '919960a2-de0d-4f04-8774-1d15cf70d3c4', name: 'BFCM / Order by Christmas' },
  gift: { id: 'bf3f3b28-8e05-4da2-84d3-c5ecd5e678ac', name: 'BFCM / Gift cards' },
  boxing: { id: '76718d38-5555-4e13-8813-85e07997fd02', name: 'BFCM / Boxing Day and New Year' },
  ny: { id: '76718d38-5555-4e13-8813-85e07997fd02', name: 'BFCM / Boxing Day and New Year' },
  vday: { id: 'd815b344-cbbf-4658-9b0b-2291e59e47b7', name: 'BFCM / Valentine\'s' },
};
/* Keyed by BRAND id (brand-first phase 3, 2026-10-08; these were Meta act ids before). */
const SWIPE_BRAND = {
  brand_lucky_golf: { id: 'bb63a25a-fe40-4975-9bd9-ce49a311d0e9', name: 'BFCM / Brands / Lucky Golf' },
  brand_grunk_dolfer: { id: 'e9acb63d-d0c8-4b65-9267-b2124bbb93e2', name: 'BFCM / Brands / Grunk Dolfer' },
  brand_dartee_golf: { id: 'd3b9921b-1717-442d-834a-0ea768184b05', name: 'BFCM / Brands / Dartee Golf' },
  brand_bonk_golf: { id: '68eb0441-1fc0-4a0e-9411-333dd65d6490', name: 'BFCM / Brands / Bonk Golf' },
  brand_party_patch: { id: '08230143-3516-4a00-a433-e21e1dbab220', name: 'BFCM / Brands / Party Patch' },
  brand_yak_sports: { id: 'a86f41d2-ab13-404e-bb48-1d978f8010a1', name: 'BFCM / Brands / Yak Sports' },
  brand_ice_and_gold: { id: '6f02d605-7d5d-46ad-a8bc-d233483cdcf9', name: 'BFCM / Brands / Ice & Gold' },
  brand_the_golf_sock: { id: '7e7bd0be-7ca4-49be-8be4-9d66b5ad94ff', name: 'BFCM / Brands / The Golf Sock' },
};
/** The Atria boards a brand's pages show (its own board and the shared season boards). A client login may read only these
    (account-health atria.js, 2026-10-10). */
export function swipeBoardsFor(brandId) {
  return [...new Set([...Object.values(SWIPE).map(b => b.id), ...(SWIPE_BRAND[brandId] ? [SWIPE_BRAND[brandId].id] : [])])];
}
export function templatePhases(shape) {
  const e = EARLY[shape] || EARLY.standard;
  return TPL.map((p, i) => ({ ...(p.key === 'early' ? { ...e } : {}), ...p, status: p.status || 'missing', sort: i * 10, tpl: 1 }))
    .map(p => ({ key: p.key, name: p.name, start: p.start, end: p.end, grp: p.grp, who: p.who, offer: '', detail: '', hint: p.hint || '', status: p.status, optional: p.optional || 0, sort: p.sort, tpl: 1 }));
}

/* What has to happen before a phase goes live, as days before its start date.
   Owner is a ROLE here; names come from the brand's answers (strategist, buyer, email). */
const STD = [['offer', 'Offer locked', -30, 'cole'], ['briefs', 'Briefs due', -23, 'strat'], ['built', 'Ads built', -9, 'strat'], ['loaded', 'Ads loaded', -4, 'buyer'], ['live', 'Live', 0, 'buyer']];
const KINDS = {
  planb: [['offer', 'Plan B decided', -30, 'cole'], ['briefs', 'Briefs due', -23, 'strat'], ['built', 'Built and paused', -14, 'strat'], ['go', 'Friday 2pm call: on or off', 0, 'cole']],
};
const EXTRA = {
  early: [['page', 'Signup or sale page live', 0, 'cole']],
  access: [['lock', 'Password page or list-only link tested', -3, 'cole']],
  bf: [['ops', 'Inventory vs goal, 3PL told the forecast, support covered', -17, 'cole'], ['limit', 'Meta spend limit raised, backup card on', -14, 'buyer'], ['ladder', 'Goals and ladder set on the Season page', -10, 'buyer'], ['emails', 'Every email and text scheduled', -7, 'email'], ['site', 'Gift cards live, cutoffs on the site, sale page tested', -7, 'cole']],
  drop: [['segment', 'BFCM buyer segment built', -7, 'email']],
  xmas: [['bar', 'Countdown bar on', -1, 'cole']],
};
const DEFAULT_OWNER = { cole: 'Cole', buyer: 'Ahsan', strat: 'Ahsan', email: 'Nick' };
/* How many ads each phase needs (the 90-per-brand season plan, 2026-10-06). Shows in the
   briefs/built task names so "This week" reads as a quota, not a vague to-do. */
const ADS = { giveaway: 8, early: 15, putters: 10, list: 3, access: 3, bf: 25, planb: 5, cm: 5, drop: 10, xmas: 10, gift: 5, boxing: 10, ny: 5, vday: 10 };
function ownerName(role, answers) {
  if (role === 'strat') return answers.strategist || DEFAULT_OWNER.strat;
  if (role === 'buyer') return answers.buyer || DEFAULT_OWNER.buyer;
  if (role === 'email') return answers.email_owner || DEFAULT_OWNER.email;
  return DEFAULT_OWNER[role] || role;
}

/** Derived tasks + stored overrides + custom tasks, for one brand. */
export function tasksFor(phases, answers, stored, today, goals) {
  const byId = Object.fromEntries((stored || []).map(r => [r.id, r]));
  const out = [];
  for (const p of phases) {
    if (p.status === 'skip' || !p.start) continue;
    const kinds = (KINDS[p.key] || STD).concat(EXTRA[p.key] || []);
    for (const [kind, label, off, role] of kinds) {
      /* 2026-11-21 (War Room rebuild): "briefs due", "ads built" and "ads loaded" are gone. Nobody ticks them (the work
         lives in Production and Launch), so every brand showed them late: noise, not a signal. */
      if (kind === 'briefs' || kind === 'built' || kind === 'loaded') continue;
      const id = `${p.key}:${kind}`;
      const s = byId[id];
      const due = s?.due || addDays(p.start, off);
      let done = !!s?.done, auto = 0;
      if (kind === 'offer') { done = p.status === 'locked'; auto = 1; }
      // The ladder row ticks itself once the four ladder numbers exist.
      if (kind === 'ladder' && goals && goals.be && goals.target && goals.s50 && goals.s100) { done = true; auto = 1; }
      // A launch three days gone is not "overdue", it happened. Only the live row
      // auto-closes; everything else waits for a tick, because "built" that nobody
      // confirmed is exactly the thing this screen exists to catch.
      if (kind === 'live' && !s && today > addDays(due, 3)) { done = true; auto = 1; }
      const n = ADS[p.key];
      const named = n && kind === 'briefs' ? `Briefs due: ${n} ads` : n && kind === 'built' ? `${n} ads built` : label;
      out.push({ id, phase_key: p.key, phase: p.name, kind, name: s?.name || named, due, owner: s?.owner || ownerName(role, answers), done, done_by: s?.done_by || null, done_at: s?.done_at || null, note: s?.note || null, custom: 0, auto });
    }
  }
  for (const s of stored || []) {
    if (!s.custom) continue;
    const p = phases.find(x => x.key === s.phase_key);
    out.push({ id: s.id, phase_key: s.phase_key || null, phase: p?.name || null, kind: 'custom', name: s.name || 'Task', due: s.due || null, owner: s.owner || 'Cole', done: !!s.done, done_by: s.done_by, done_at: s.done_at, note: s.note || null, custom: 1, auto: 0 });
  }
  out.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.phase_key?.localeCompare(b.phase_key || '') || 0);
  return out;
}

export function todayCentral() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/* Which revenue goal a phase is judged against. */
const GOAL_OF = { early: 'early', access: 'bf', bf: 'bf', planb: 'bf', cm: 'bf', drop: 'dec', xmas: 'dec', gift: 'dec', boxing: 'dec' };
const num = v => { const n = parseFloat(String(v ?? '').replace(/[$,%\s]/g, '')); return Number.isFinite(n) ? n : null; };
export function goalsOf(answers, acct) {
  const g = safeJson(answers.goals, {}) || {};
  const out = {};
  for (const k of ['early', 'bf', 'dec', 'total', 'be', 'hold', 'target', 's50', 's100', 'start', 'cap']) out[k] = num(g[k]);
  if (out.target == null && acct?.target_roas) out.target = num(acct.target_roas);
  out.note = g.note || '';
  return out;
}

/** Everything the tab needs for a set of accounts. `series(acct, from, to)` is the
 *  host's revenue series (same numbers as Profit), used for results per phase. */
export async function seasonData(env, accounts, { series } = {}) {
  const ids = accounts.map(a => a.act_id);
  const today = todayCentral();
  if (!ids.length) return { season: SEASON, bf: BF, today, accounts: [] };
  const q = ids.map(() => '?').join(',');
  const [ph, an, tk, ck] = await Promise.all([
    env.DB.prepare(`SELECT * FROM p_season_phase WHERE season = ?1 AND act_id IN (${q}) ORDER BY sort, key`).bind(SEASON, ...ids).all(),
    env.DB.prepare(`SELECT * FROM p_season_answer WHERE season = ?1 AND act_id IN (${q})`).bind(SEASON, ...ids).all(),
    env.DB.prepare(`SELECT * FROM p_season_task WHERE season = ?1 AND act_id IN (${q})`).bind(SEASON, ...ids).all(),
    env.DB.prepare(`SELECT * FROM p_season_checkin WHERE season = ?1 AND act_id IN (${q}) ORDER BY date, slot`).bind(SEASON, ...ids).all().catch(() => ({ results: [] })),
  ]);
  const yday = addDays(today, -1);
  const out = [];
  for (const a of accounts) {
    const answers = Object.fromEntries(an.results.filter(r => r.act_id === a.act_id).map(r => [r.key, r.value]));
    const shape = ['standard', 'blacknov', 'access'].includes(answers.shape) ? answers.shape : 'standard';
    const stored = ph.results.filter(r => r.act_id === a.act_id);
    const tpl = templatePhases(shape);
    const phases = tpl.map(t => {
      const s = stored.find(r => r.key === t.key);
      return s ? { ...t, name: s.name, start: s.start, end: s.end, grp: s.grp || t.grp, who: s.who, offer: s.offer || '', detail: s.detail || '', status: s.status, sort: s.sort ?? t.sort, tpl: 0 } : t;
    }).concat(stored.filter(r => !tpl.some(t => t.key === r.key)).map(s => ({ key: s.key, name: s.name, start: s.start, end: s.end, grp: s.grp || 'bf', who: s.who, offer: s.offer || '', detail: s.detail || '', hint: '', status: s.status, optional: 1, sort: s.sort ?? 999, tpl: 0 })));
    phases.sort((x, y) => (x.start || '9999').localeCompare(y.start || '9999') || x.sort - y.sort);
    const goals = goalsOf(answers, a);
    for (const p of phases) { p.swipe = SWIPE[p.key] || null; p.goal_key = GOAL_OF[p.key] || null; }
    /* Results for any phase that has started: the same revenue line as Profit, summed over
       the phase's days to date. Not for skipped phases, and never including today. */
    if (series) {
      for (const p of phases) {
        if (p.status === 'skip' || !p.start || p.start > yday) continue;
        const to = (p.end && p.end < yday) ? p.end : yday;
        try {
          const { rows } = await series(a, p.start, to);
          const sum = k => rows.reduce((s, r) => s + (+r[k] || 0), 0);
          const sales = sum('sales'), spend = sum('spend'), orders = sum('orders');
          p.results = { from: p.start, to, days: rows.length, sales, spend, orders, mer: spend > 0 ? sales / spend : null, goal: p.goal_key ? goals[p.goal_key] : null };
        } catch { p.results = null; }
      }
    }
    const tasks = tasksFor(phases, answers, tk.results.filter(r => r.act_id === a.act_id), today, goals);
    const checkins = ck.results.filter(r => r.act_id === a.act_id).map(r => ({ date: r.date, slot: r.slot, roas: r.roas, mer_day: r.mer_day, revenue: r.revenue, spend: r.spend, verdict: r.verdict, action: r.action, by: r.by, at: r.at }));
    out.push({ act_id: a.act_id, name: a.name, tz: a.tz || null, in_season: answers.in_season !== 'no', shape, answers, goals, phases, tasks, checkins, swipe_brand: SWIPE_BRAND[a.act_id] || null });
  }
  return { season: SEASON, bf: BF, today, accounts: out };
}

/* ---------- live numbers for the desk ---------- */
/** From one day's hourly shape (blended revenue and spend by hour), today so far and the
 *  trailing three hours with data. That is what the ladder grades, the way the 2025 sheet did. */
export function liveFrom(hours, asOf) {
  const h = (hours || []).map(x => ({ sales: +x.sales || 0, spend: +x.spend || 0 }));
  const sum = arr => arr.reduce((o, x) => ({ sales: o.sales + x.sales, spend: o.spend + x.spend }), { sales: 0, spend: 0 });
  let last = -1;
  for (let i = h.length - 1; i >= 0; i--) if (h[i].sales > 0 || h[i].spend > 0) { last = i; break; }
  const day = sum(h);
  const l3 = last >= 0 ? sum(h.slice(Math.max(0, last - 2), last + 1)) : { sales: 0, spend: 0 };
  const mer = x => x.spend > 0 ? x.sales / x.spend : null;
  return { today: { ...day, mer: mer(day) }, last3: { ...l3, mer: mer(l3), from: Math.max(0, last - 2), to: last }, as_of: asOf || null, hours_with_data: last + 1 };
}

/* ---------- THE WAR ROOM (2026-10-09, Triple Whale's BFCM Command Center done in Locus) ----------
 * Cole: "the war room should be like Triple Whale's war room, full on plans and everything, the actual war room."
 * PLAN (before the sale): a seven-step checklist per brand. Last year's same BFCM window (revenue by day, orders,
 * AOV, spend, MER, by channel, top products), goals (up to 5 metrics), the season ladder, the paid budget split by
 * channel, the offers and dates (Season phases + the Calendar), alert thresholds saved as real p_alert rules
 * (account-health alerts.js fires them in Slack), and stock cover on the hero products (Supply, in the browser).
 * LIVE (during the sale): today against the day's plan hour by hour, the weekend so far against the goal, spend by
 * channel against the day's budget, the ladder on the last three hours. The plan lives in p_season_answer key `war`
 * (JSON); the ladder stays in key `goals` (one place). Everything here is grouped reads on tables we already sync. */
export const LY_BF = '2025-11-28';   // last year's Black Friday
const between = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
/* 2026-11-21 (Cole: "I want to live in that war room and make decisions there"): three steps, not seven. The paid
   budget split by channel (Cole: it does not make sense; budgets are set in Meta by the ladder), "review last year",
   the Slack alert setup and the stock tick were done on no brand and only made every card look unfinished. */
export const WAR_STEPS = [['goals', 'Set the goals'], ['ladder', 'Set the scaling ladder'], ['offers', 'Lock the offers and dates']];

/** TODAY'S CALL (2026-11-21): today's blended store MER (Triple Whale) against the brand's own ladder. Cole's Bonk
 *  ladder (2026-11-20) is the shape: s100+ double, s50+ +50%, target+ +25%, hold line to target hold, breakeven to hold
 *  cut 25%, under breakeven back to the starting budget. Without a hold line, breakeven to target holds and under
 *  breakeven cuts 25%. No ladder = the goal ROAS (target_roas, else 2.5) as the one line. Too little spend = wait. */
export function callOf(g, today, acct) {
  g = g || {};
  const mer = today && today.mer != null ? +today.mer : null, spend = today ? +today.spend || 0 : 0;
  const goal = g.target ?? num(acct && acct.target_roas) ?? 2.5;
  const has = g.be != null && g.target != null;
  const L = { be: g.be ?? null, hold: g.hold ?? null, target: goal, s50: g.s50 ?? null, s100: g.s100 ?? null, start: g.start ?? null, own: has ? 1 : 0 };
  const floor = 150;   // a day under $150 of ads is too thin to grade (one order swings it)
  /* No Triple Whale store (VetriPaws): Locus sees Meta spend only, so there is no MER to grade. Never call it a $0 day. */
  if (today && today.no_sales) return { call: 'wait', pct: 0, mer: null, ladder: L, why: 'No Triple Whale store for this brand, so Locus sees ad spend only and cannot grade the day.' };
  if (mer == null || spend < floor) return { call: 'wait', pct: 0, mer, ladder: L, why: `Too early to call: $${Math.round(spend)} spent so far today.` };
  const x = v => `${(Math.round(v * 100) / 100).toFixed(2)}x`;
  if (L.s100 != null && mer >= L.s100) return { call: 'raise', pct: 1, mer, ladder: L, why: `${x(mer)} today, at or over ${x(L.s100)}: double it.` };
  if (L.s50 != null && mer >= L.s50) return { call: 'raise', pct: 0.5, mer, ladder: L, why: `${x(mer)} today, at or over ${x(L.s50)}: raise 50%.` };
  if (mer >= goal) return { call: 'raise', pct: 0.25, mer, ladder: L, why: `${x(mer)} today, at or over the ${x(goal)} goal: raise 25%.` };
  const hold = L.hold ?? L.be;
  if (hold != null && mer >= hold) return { call: 'hold', pct: 0, mer, ladder: L, why: `${x(mer)} today, under the ${x(goal)} goal but over ${x(hold)}: hold.` };
  if (L.hold != null && L.be != null && mer >= L.be) return { call: 'cut', pct: -0.25, mer, ladder: L, why: `${x(mer)} today, under the ${x(L.hold)} hold line: cut 25%.` };
  if (L.be != null && L.start) return { call: 'reset', pct: null, to: L.start, mer, ladder: L, why: `${x(mer)} today, under breakeven ${x(L.be)}: back to the $${Math.round(L.start).toLocaleString('en-US')} start (cut 25% if already under it).` };
  return { call: 'cut', pct: -0.25, mer, ladder: L, why: `${x(mer)} today, under ${x(hold ?? goal)}: cut 25%.` };
}
/** What a scheduled task will still change on this brand (answer key `scheduled`), next first. Past items drop off an
 *  hour after they ran, so the list never needs cleaning. Locus does not run them: the tasks live on Cole's machine. */
export function scheduledOf(answers, now = Date.now()) {
  const list = safeJson(answers && answers.scheduled, []);
  return (Array.isArray(list) ? list : []).filter(x => x && Date.parse(x.at) > now - 3600e3).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
export const WAR_METRICS = { revenue: 'Revenue', orders: 'Orders', aov: 'AOV', mer: 'MER', new_customers: 'New customers', spend: 'Ad spend' };
export const WAR_CHANNELS = { meta: 'Meta', google: 'Google', tiktok: 'TikTok', other: 'Other paid' };
const SALE_KEYS = ['access', 'bf', 'planb', 'cm'];
export function warOf(answers) { const w = safeJson(answers && answers.war, {}) || {}; return typeof w === 'object' ? w : {}; }
/** The sale window: what the plan says, else the Thursday-to-Cyber-Monday phases, else Nov 26 to Nov 30. */
export function saleOf(phases, war) {
  if (war.sale && isoOk(war.sale.start) && isoOk(war.sale.end) && war.sale.start && war.sale.end) return { start: war.sale.start, end: war.sale.end, set: 1 };
  const ps = (phases || []).filter(p => SALE_KEYS.includes(p.key) && p.status !== 'skip' && p.start);
  if (!ps.length) return { start: addDays(BF, -1), end: addDays(BF, 3) };
  const start = ps.map(p => p.start).sort()[0], end = ps.map(p => p.end || p.start).sort().pop();
  return { start: start < addDays(BF, -7) ? addDays(BF, -1) : start, end: end > addDays(BF, 10) ? addDays(BF, 3) : end };
}
/** Last year's window: the same days around last year's Black Friday, one day either side. */
export function baselineWindow(sale, war) {
  if (war.baseline && isoOk(war.baseline.from) && isoOk(war.baseline.to) && war.baseline.from && war.baseline.to) return { from: war.baseline.from, to: war.baseline.to };
  return { from: addDays(LY_BF, between(BF, sale.start) - 1), to: addDays(LY_BF, between(BF, sale.end) + 1) };
}
/** The goals the war room tracks: the saved list, else the season goals (weekend revenue, the ladder's target). */
export function warGoals(war, g) {
  const saved = Array.isArray(war.goals) ? war.goals.filter(x => x && WAR_METRICS[x.metric]).slice(0, 5).map(x => ({ metric: x.metric, target: num(x.target) })) : null;
  if (saved && saved.length) return { list: saved, saved: 1 };
  const out = [];
  if (g.bf) out.push({ metric: 'revenue', target: g.bf });
  if (g.target) out.push({ metric: 'mer', target: g.target });
  return { list: out, saved: 0 };
}
const budgetOf = war => {
  const b = war.budget || {}, total = num(b.total) || 0;
  const ch = (Array.isArray(b.channels) ? b.channels : []).filter(c => c && WAR_CHANNELS[c.id]).map(c => {
    const v = num(c.value) || 0, unit = c.unit === '%' ? '%' : '$';
    return { id: c.id, label: WAR_CHANNELS[c.id], unit, value: v, amount: unit === '%' ? total * v / 100 : v, metric: ['roas', 'cpa'].includes(c.metric) ? c.metric : null, target: num(c.target) };
  });
  const allocated = ch.reduce((s, c) => s + c.amount, 0);
  return { total, channels: ch, allocated, unallocated: total - allocated };
};
/** The seven steps, each done or not, from what is stored. Stock and alerts are ticked by the page when they are saved. */
export function warSteps(a, war) {
  const g = a.goals || {}, bud = budgetOf(war), goals = warGoals(war, g);
  const bfp = (a.phases || []).find(p => p.key === 'bf');
  const done = {
    goals: goals.list.some(x => x.target > 0),
    ladder: g.be != null && g.target != null && g.s50 != null && g.s100 != null,
    offers: !!bfp && bfp.status === 'locked',
  };
  void bud;
  const why = {
    baseline: 'Look over last year\'s numbers and press "Use this baseline".',
    goals: 'Give at least one goal a target.',
    ladder: 'Breakeven, target and the two scale lines.',
    budget: !bud.total ? 'Set the paid budget for the sale.' : !bud.channels.length ? 'Split it by channel.' : `${Math.round(Math.abs(bud.unallocated)).toLocaleString('en-US')} ${bud.unallocated > 0 ? 'not allocated' : 'over-allocated'}.`,
    offers: !bfp ? 'No Black Friday phase.' : bfp.status === 'locked' ? '' : `The Black Friday offer is ${bfp.status === 'draft' || bfp.status === 'proposed' ? 'still a proposal, not locked' : 'missing'}.`,
    alerts: 'Save the thresholds as Slack alerts.',
    stock: 'Look at stock cover on the hero products and press "Stock checked".',
  };
  return WAR_STEPS.map(([key, label]) => ({ key, label, done: !!done[key], why: done[key] ? '' : why[key] }));
}
/** Last year's BFCM per day (the P&L revenue line), by channel and the top products. */
async function warBaseline(env, a, win, { series, channels, titles }) {
  const out = { from: win.from, to: win.to, days: [], totals: null, channels: [], products: [] };
  if (!series) return out;
  let s; try { s = await series(a, win.from, win.to); } catch (e) { out.error = e.message; return out; }
  const rows = s.rows || [];
  out.days = rows.map(r => ({ date: r.date, sales: r.sales, orders: r.orders, aov: r.orders > 0 && r.sales != null ? r.sales / r.orders : null, spend: r.spend,
    mer: r.mer, meta_spend: r.meta_spend, google_spend: r.google_spend, email_rev: r.email_rev, new_orders: r.new_orders }));
  const sum = k => rows.reduce((t, r) => t + (+r[k] || 0), 0);
  const sales = sum('sales'), orders = sum('orders'), spend = sum('spend');
  out.totals = rows.length ? { sales, orders, aov: orders > 0 ? sales / orders : null, spend, mer: spend > 0 ? sales / spend : null, new_orders: sum('new_orders'), days: rows.length } : null;
  if (channels && rows.length) out.channels = await channels(a, rows, s.piv || {}, win.from, win.to).catch(() => []);
  /* Top products: orders that carried each product (Triple Whale orders), revenue split evenly across an order's products. */
  const { results } = await env.DB.prepare(`SELECT products_json, total FROM tw_orders WHERE act_id = ?1 AND date >= ?2 AND date <= ?3`).bind(a.act_id, win.from, win.to).all().catch(() => ({ results: [] }));
  const by = {};
  for (const o of results || []) {
    let ps = []; try { ps = [...new Set(JSON.parse(o.products_json || '[]').map(String))]; } catch {}
    if (!ps.length) continue;
    for (const p of ps) { const x = (by[p] ??= { id: p, orders: 0, revenue: 0 }); x.orders++; x.revenue += (+o.total || 0) / ps.length; }
  }
  const top = Object.values(by).sort((x, y) => y.revenue - x.revenue).slice(0, 8);
  const names = titles && top.length ? await titles(a, top.map(p => p.id)).catch(() => ({})) : {};
  /* Add-ons that ride on orders (package protection, free returns) are not products anyone sells. */
  out.products = top.map(p => ({ ...p, title: names[p.id] || `Product ${p.id}` })).filter(p => !/protection|free returns|shipping insurance|route\b|gift wrap/i.test(p.title)).slice(0, 6);
  out.orders_seen = (results || []).length;
  return out;
}
/** The plan for each sale day: the revenue goal and the budget split by last year's shape of the same days. */
export function dayPlan(sale, revGoal, spendTotal, baseDays) {
  const byLy = Object.fromEntries((baseDays || []).map(d => [d.date, d]));
  const days = [];
  for (let d = sale.start; d <= sale.end; d = addDays(d, 1)) { const ly = addDays(LY_BF, between(BF, d)); days.push({ date: d, ly, ly_sales: byLy[ly]?.sales ?? null, ly_spend: byLy[ly]?.spend ?? null }); }
  const sS = days.reduce((t, x) => t + (x.ly_sales || 0), 0), sP = days.reduce((t, x) => t + (x.ly_spend || 0), 0);
  for (const x of days) {
    x.share = sS > 0 ? (x.ly_sales || 0) / sS : 1 / days.length;
    x.spend_share = sP > 0 ? (x.ly_spend || 0) / sP : x.share;
    x.revenue = revGoal ? revGoal * x.share : null;
    x.spend = spendTotal ? spendTotal * x.spend_share : null;
  }
  return days;
}
/** The brand's hourly curve (checknow.js keeps it in settings as cnshape:<brand>): share of a day done by each hour. */
async function curveOf(env, act) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(`cnshape:${act}`).first().catch(() => null);
  const c = safeJson(row?.value, null);
  return c && Array.isArray(c.rev) && c.rev.length === 24 ? { cum: c.rev, src: `the brand's own hourly curve (last ${c.days || 5} days)` } : { cum: null, src: 'a straight line through the day (no hourly curve stored yet)' };
}
/** Live today against the plan: hour by hour, by channel, the ladder's 3 hours. */
async function warLive(env, a, { live, series }, plan, today, sale, bud) {
  const out = {};
  let d; try { d = await live(a); } catch (e) { return { error: e.message || 'Triple Whale did not answer' }; }
  const hours = d.hours || [];
  const lf = liveFrom(hours, d.as_of);
  const row = d.row || {};
  const sales = lf.today.sales, spend = lf.today.spend, orders = row.orders ?? hours.reduce((t, h) => t + (+h.orders || 0), 0);
  const inSale = today >= sale.start && today <= sale.end;
  let dayGoal = null, daySpend = null, src = '';
  const pd = plan.find(x => x.date === today);
  if (inSale && pd && pd.revenue) { dayGoal = pd.revenue; daySpend = pd.spend; src = 'the sale plan for today'; }
  else if (series) {
    /* Not a sale day (a dry run): a normal day is the plan, the brand's own last 28 days. */
    try { const s = await series(a, addDays(today, -28), addDays(today, -1)); const r = s.rows || [];
      if (r.length) { dayGoal = r.reduce((t, x) => t + (+x.sales || 0), 0) / r.length; daySpend = r.reduce((t, x) => t + (+x.spend || 0), 0) / r.length; src = 'a normal day (the last 28 days), because today is not a sale day'; } } catch {}
  }
  const curve = await curveOf(env, a.act_id);
  const cumAt = h => curve.cum ? curve.cum[Math.min(23, h)] : (h + 1) / 24;
  let cS = 0, cP = 0, cO = 0;
  out.hours = hours.map((h, i) => { cS += h.sales || 0; cP += h.spend || 0; cO += +h.orders || 0;
    return { hour: i, sales: h.sales || 0, spend: h.spend || 0, orders: +h.orders || 0, cum_sales: cS, cum_spend: cP, cum_orders: cO, plan_cum: dayGoal ? dayGoal * cumAt(i) : null }; });
  out.plan_curve = dayGoal ? Array.from({ length: 24 }, (_, i) => dayGoal * cumAt(i)) : null;
  const last = lf.hours_with_data - 1;
  const planNow = dayGoal && last >= 0 ? dayGoal * cumAt(last) : null;
  out.date = d.date; out.as_of = d.as_of; out.curve = curve.src; out.plan_src = src; out.in_sale = inSale;
  out.day = { goal: dayGoal, spend_budget: daySpend, plan_now: planNow, pace: planNow ? sales / planNow : null, projected: dayGoal && planNow ? sales / planNow * dayGoal : null };
  out.today = d.no_sales ? { sales: null, orders: null, aov: null, spend, mer: null, new_orders: null, email_rev: null, no_sales: 1, spend_src: d.spend_src || null }
    : { sales, orders, aov: orders > 0 ? sales / orders : null, spend, mer: lf.today.mer, new_orders: row.new_orders ?? null, email_rev: row.email_rev ?? null, spend_src: d.spend_src || null };
  if (d.no_sales) out.last3 = { ...lf.last3, sales: null, mer: null };
  out.last3 = lf.last3;
  /* Spend by channel today against the day's share of each channel's budget. */
  const meta = row.meta_spend ?? hours.reduce((t, h) => t + (+h.meta || 0), 0), google = row.google_spend ?? hours.reduce((t, h) => t + (+h.google || 0), 0);
  const dayShare = inSale && pd ? pd.spend_share : null;
  const spendOf = { meta, google, tiktok: null, other: Math.max(0, (spend || 0) - (meta || 0) - (google || 0)) };
  const ids = new Set(['meta', 'google', ...bud.channels.map(c => c.id)]);
  out.channels = [...ids].map(id => { const c = bud.channels.find(x => x.id === id);
    const budget = c && dayShare != null ? c.amount * dayShare : null, so = spendOf[id];
    return { id, label: WAR_CHANNELS[id], spend: so, budget, budget_now: budget != null && curve.cum && last >= 0 ? budget * (curve.cum[last]) : budget != null && last >= 0 ? budget * (last + 1) / 24 : null };
  }).filter(c => c.spend > 0 || c.budget);
  /* The weekend so far: finished sale days (the P&L line) plus today. */
  if (series && today > sale.start) {
    try { const to = addDays(today, -1) < sale.end ? addDays(today, -1) : sale.end; const s = await series(a, sale.start, to);
      const r = s.rows || [], sum = k => r.reduce((t, x) => t + (+x[k] || 0), 0);
      out.sale_so_far = { days: r.length, sales: sum('sales') + (inSale ? sales : 0), spend: sum('spend') + (inSale ? spend : 0), orders: sum('orders') + (inSale ? orders : 0) }; } catch {}
  } else if (inSale) out.sale_so_far = { days: 0, sales, spend, orders };
  return out;
}
/** One brand's war room. */
async function warBrand(env, a, today, deps, { withLive, client }) {
  const war = warOf(a.answers);
  const sale = saleOf(a.phases, war), win = baselineWindow(sale, war);
  const base = await warBaseline(env, a, win, deps);
  const goals = warGoals(war, a.goals || {});
  const bud = budgetOf(war);
  const revGoal = goals.list.find(x => x.metric === 'revenue')?.target || a.goals?.bf || null;
  const plan = dayPlan(sale, revGoal, bud.total, base.days);
  const mode = today >= sale.start && today <= sale.end ? 'live' : today > sale.end ? 'after' : 'plan';
  const out = {
    act_id: a.act_id, name: a.name, currency: a.currency || 'USD', tz: a.tz || null, today, bf: BF, ly_bf: LY_BF, mode, sale, sale_days_to: between(today, sale.start),
    /* The brand edition (2026-10-10): a client sees the whole plan, its ladder and every check-in; only the team's notes stay out. */
    war: client ? Object.fromEntries(Object.entries(war).filter(([k]) => k !== 'notes')) : war, goals_list: goals.list, goals_saved: goals.saved, ladder: a.goals,
    budget: bud, baseline: base, plan, steps: warSteps(a, war),
    phases: (a.phases || []).filter(p => p.status !== 'skip').map(p => ({ key: p.key, name: p.name, start: p.start, end: p.end, grp: p.grp, offer: p.offer, detail: p.detail, status: p.status, who: p.who, tpl: p.tpl, hint: p.hint, swipe: p.swipe })),
    checkins: a.checkins || [],
    metrics: WAR_METRICS, channel_names: WAR_CHANNELS,
  };
  out.ro = (a.answers && a.answers.buying) === 'client' ? 1 : 0;
  if (!client) out.scheduled = scheduledOf(a.answers);   // the client buys its own media (I&G since 2026-11-20): numbers only
  if (withLive && deps.live) {
    out.live = await warLive(env, a, deps, plan, today, sale, bud).catch(e => ({ error: e.message }));
    if (out.live && !out.live.error) out.call = callOf(a.goals, out.live.today, a);
  }
  return out;
}
/** Every brand in the season: plan progress before the sale, pacing during it, riskiest first. */
async function warAll(env, accounts, today, deps) {
  const d = await seasonData(env, accounts, {});
  const rows = await Promise.all(d.accounts.filter(a => a.in_season && a.phases.some(p => p.status !== 'skip')).map(async a => {
    const acct = accounts.find(x => x.act_id === a.act_id) || a;
    const war = warOf(a.answers), sale = saleOf(a.phases, war), steps = warSteps(a, war);
    const goals = warGoals(war, a.goals || {}), revGoal = goals.list.find(x => x.metric === 'revenue')?.target || a.goals?.bf || null;
    const mode = today >= sale.start && today <= sale.end ? 'live' : today > sale.end ? 'after' : 'plan';
    const r = { act_id: a.act_id, name: a.name, currency: acct.currency || 'USD', tz: acct.tz || a.tz || null, mode, sale, days_to: between(today, sale.start), steps, done: steps.filter(s => s.done).length, goal: revGoal,
      bf_offer: (a.phases.find(p => p.key === 'bf') || {}).offer || '', ro: a.answers.buying === 'client' ? 1 : 0, ladder: a.goals, scheduled: scheduledOf(a.answers),
      /* The offers on the calendar, for the phase line when Meta has no dated ad sets. */
      phases: a.phases.filter(p => p.status !== 'skip' && p.start).map(p => ({ key: p.key, name: p.name, start: p.start, end: p.end, offer: p.offer })) };
    /* 2026-11-21: every brand reads TODAY live (Triple Whale), sale or not, because the decision is made every day. */
    if (deps.live) {
      try {
        const d = await deps.live({ ...acct, ...a });
        const lf = liveFrom(d.hours, d.as_of), row = d.row || {};
        const orders = row.orders ?? (d.hours || []).reduce((t, h) => t + (+h.orders || 0), 0);
        const today = d.no_sales
          /* No TW shop: spend from Meta, sales unknown (null, never 0). */
          ? { sales: null, spend: lf.today.spend, mer: null, orders: null, aov: null, meta_spend: row.meta_spend ?? lf.today.spend, google_spend: null, no_sales: 1, spend_src: 'meta' }
          : { ...lf.today, orders, aov: orders > 0 ? lf.today.sales / orders : null, meta_spend: row.meta_spend ?? null, google_spend: row.google_spend ?? null, spend_src: d.spend_src || null };
        r.live = { date: d.date, as_of: d.as_of, today, last3: d.no_sales ? { ...lf.last3, sales: null, mer: null } : lf.last3 };
        r.call = callOf(a.goals, r.live.today, acct);
      } catch (e) { r.live = { error: e.message || 'Triple Whale did not answer' }; }
    }
    /* Order: a call to make first (cut, then raise), then hold, then wait; the client-run brands last. */
    const rank = { reset: 0, cut: 1, raise: 2, hold: 3, wait: 4 };
    r.risk = r.ro ? -50 : r.call ? 10 - (rank[r.call.call] ?? 5) : 0;
    return r;
  }));
  rows.sort((x, y) => y.risk - x.risk || x.name.localeCompare(y.name));
  return { today, bf: BF, brands: rows, steps: WAR_STEPS.map(([key, label]) => ({ key, label })) };
}

/* ---------- WHERE WE STAND (2026-11-22) ----------
 * Cole: "I don't want it to automatically raise the scaling thing. I just want it to check it... it tells me, and then
 * we can talk about it and I can approve it or not. Real-time updates, especially during Black Friday Cyber Monday
 * weekend: here's where we stand so far." Every 3 hours Thu Nov 26 to Mon Nov 30 (account-health standing.js runs it,
 * DMs Cole, and applies a budget change only when he taps Approve). This is the Triple Whale half: weekend revenue
 * against the weekend goal, MER to date and over the last 6 hours against the KPI, and the suggestion.
 * I&G is left out (Fela runs its media). Goals and KPIs are Cole's numbers from 2026-11-22. */
/* Fallback only: each brand's window is its own sale (saleOf), see standingAll. */
export const STAND = { from: '2026-11-26', to: '2026-11-30' };
/* be_new = break-even NEW-CUSTOMER MER: the first order pays back what it cost to get the customer, after product
   costs (1 / first-order margin). From the break-even CACs and goal CPAs set 2026-10-15 (break-even CAC / new AOV):
   Lucky 100/154, Dartee 80/118, Bonk 35/63; Grunk from its real break-even MER (~2.05, COGS 35% + postage + fees);
   Yak assumed 60% margin (no cost data yet). Cole set the rule 2026-11-22; change a number here, nowhere else. */
export const STAND_BRANDS = {
  brand_lucky_golf: { goal: 150000, kpi: 2.5, be_new: 1.55 }, brand_dartee_golf: { goal: 78000, kpi: 2.5, be_new: 1.5 }, brand_bonk_golf: { goal: 130000, kpi: 2.5, be_new: 1.8 },
  brand_grunk_dolfer: { goal: 51000, kpi: 3.0, be_new: 2.0 },
  /* Cole 2026-11-24: Yak and VetriPaws Black Friday started Mon Nov 23 (Meta sets), not the plan's Thursday. */
  /* client_approve (Cole 2026-11-25, Rob at Yak): the client update carries our suggestion with an Approve button the
     client taps; the change goes live only on their tap. */
  brand_yak_sports: { goal: 25000, kpi: 2.5, be_new: 1.65, start: '2026-11-23', client_approve: true }, brand_vetripaws: { goal: 4500, kpi: 2.5, be_new: 1.65, start: '2026-11-23' },
  /* Ice & Gold: Fela runs the budgets, so updates only (no raise or cut call); its sale is live this week. */
  brand_ice_and_gold: { goal: null, kpi: 2.5, be_new: null, start: '2026-11-23', watch: 'Fela runs Ice & Gold budgets, so this is updates only.' },
};
/* Any first order whose last click was email or SMS is left out of new-customer revenue: giveaway entrants and list
   sign-ups buying from the sale emails are not what the ads bought. Same grouping as Customers (srcGroup). */
export const EMAIL_SRC = /klaviyo|attentive|postscript|sms|email|notify|mailchimp|omnisend|yotpo/i;
/** THE LADDER: see the rule inside standCall (whole-store return vs goal and break-even, Cole 2026-11-24). */
export function standCall({ soFar, last6, kpi, hold, noSales, beNew }) {
  const x = v => `${(Math.round(v * 100) / 100).toFixed(2)}x`;
  if (noSales) return { call: 'hold', pct: 0, why: 'No Triple Whale store, so Locus sees spend only. Hold.' };
  if (!soFar || !(soFar.spend >= 150) || soFar.mer == null) return { call: 'hold', pct: 0, why: `Too early: $${Math.round(soFar ? soFar.spend : 0)} of ads so far.` };
  const l6 = last6 && last6.spend >= 50 && last6.mer != null ? last6.mer : null, line = hold ?? kpi * 0.8;
  /* THE RULE since Cole 2026-11-24 ("the 2.5 overall is the one thing"): whole-store return = store sales / all ad
     spend, against the brand's goal (kpi) and break-even (the hold line). 1.5x the goal raise 50%, the goal raise 25%,
     between the lines hold, under break-even cut 25%. The last 6 hours under break-even hold a raise back. New-customer
     return is shown, never decides. Whether a raise would get spent is checked on the Meta side (standing.js). */
    const nm = soFar.new_mer, info = beNew && nm != null ? ` New customers ${x(nm)} (break-even ${x(beNew)}).` : '';
    const head = `Store return ${x(soFar.mer)} so far${l6 == null ? '' : `, ${x(l6)} last 6 hours`}. Goal ${x(kpi)}, break-even ${x(line)}.`;
    const l6Ok = l6 == null || l6 >= line;
    if (soFar.mer >= kpi * 1.5 && l6Ok) return { call: 'scale', pct: 0.5, why: `${head} Well over the goal. Raise 50%.${info}` };
    if (soFar.mer >= kpi && l6Ok) return { call: 'raise', pct: 0.25, why: `${head} Over the goal. Raise 25%.${info}` };
    if (soFar.mer >= kpi) return { call: 'hold', pct: 0, why: `${head} Over the goal, but the last 6 hours fell under break-even. Hold for now.${info}` };
    if (soFar.mer < line && (l6 == null || l6 < line)) return { call: 'cut', pct: -0.25, why: `${head} Under break-even. Cut 25%.${info}` };
    return { call: 'hold', pct: 0, why: `${head} Between break-even and the goal. Hold.${info}` };
}
/** Share of new-customer revenue whose first order came from email or SMS, from tw_orders (synced nightly), over
 *  finished days. A customer's first order = their earliest order in tw_orders (400 days of history). */
async function emailShareNew(env, actId, from, to) {
  if (!env.DB || from > to) return null;
  const { results } = await env.DB.prepare(
    `WITH f AS (SELECT customer_id, MIN(date) d FROM tw_orders WHERE act_id = ?1 AND customer_id IS NOT NULL AND customer_id != '' GROUP BY customer_id HAVING MIN(date) BETWEEN ?2 AND ?3)
     SELECT o.source AS source, SUM(o.total) AS rev, COUNT(*) AS n FROM tw_orders o JOIN f ON f.customer_id = o.customer_id AND o.date = f.d
     WHERE o.act_id = ?1 AND o.total > 0 GROUP BY o.source`).bind(actId, from, to).all();
  let all = 0, em = 0, n = 0;
  for (const r of results || []) { all += +r.rev || 0; n += +r.n || 0; if (EMAIL_SRC.test(String(r.source || ''))) em += +r.rev || 0; }
  return n >= 10 && all > 0 ? { share: em / all, orders: n, from, to } : null;
}
async function standingAll(env, accounts, today, deps) {
  const d = await seasonData(env, accounts, {});
  /* Each brand counts from its OWN sale start (Cole, 2026-11-22: Lucky from the VIP Tuesday, Grunk's BOGO from Monday,
   * Bonk Thursday), not one Thursday for all: the window is saleOf() (the War Room plan, else its sale phases).
   * Before a brand's sale starts it is a dry run on today; after it ends the total stops at its last day. */
  const rows = await Promise.all(d.accounts.filter(a => STAND_BRANDS[a.act_id]).map(async a => {
    const acct = accounts.find(x => x.act_id === a.act_id) || a, cfg = STAND_BRANDS[a.act_id], g = a.goals || {};
    const sale = saleOf(a.phases, warOf(a.answers));
    if (cfg.start && cfg.start < sale.start) sale.start = cfg.start;
    const mode = today < sale.start ? 'plan' : today > sale.end ? 'after' : 'live';
    const r = { act_id: a.act_id, name: a.name, currency: acct.currency || 'USD', goal: cfg.goal, kpi: cfg.kpi, hold: g.hold ?? g.be ?? null, sale: { start: sale.start, end: sale.end }, mode };
    let lv = null;
    try { lv = await deps.live({ ...acct, ...a }); } catch (e) { r.error = e.message || 'Triple Whale did not answer'; }
    const noSales = !!(lv && lv.no_sales);
    const hours = ((lv && lv.hours) || []).map(h => ({ sales: +h.sales || 0, spend: +h.spend || 0 }));
    const lf = liveFrom(hours, lv && lv.as_of), last = lf.hours_with_data - 1;
    const six = last >= 0 ? hours.slice(Math.max(0, last - 5), last + 1) : [];
    const sum = (arr, k) => arr.reduce((t, h) => t + (+h[k] || 0), 0);
    r.today = { sales: noSales ? null : lf.today.sales, spend: lf.today.spend, mer: noSales ? null : lf.today.mer };
    r.last6 = { hours: six.length, sales: noSales ? null : sum(six, 'sales'), spend: sum(six, 'spend') };
    r.last6.mer = !noSales && r.last6.spend > 0 ? r.last6.sales / r.last6.spend : null;
    /* The sale so far: finished sale days from the P&L line (Triple Whale), plus today live while the sale runs. */
    let prev = { sales: 0, spend: 0, days: 0, new_rev: 0, new_orders: 0, new_ok: true };
    const to = mode === 'after' ? sale.end : addDays(today, -1);
    if (mode !== 'plan' && to >= sale.start && deps.series) {
      try { const s = await deps.series({ ...acct, ...a }, sale.start, to); const rr = s.rows || [];
        prev = { sales: rr.reduce((t, x) => t + (+x.sales || 0), 0), spend: rr.reduce((t, x) => t + (+x.spend || 0), 0), days: rr.length,
          new_rev: rr.reduce((t, x) => t + (+x.new_rev || 0), 0), new_orders: rr.reduce((t, x) => t + (+x.new_orders || 0), 0), new_ok: rr.every(x => x.new_rev != null) }; } catch (e) { r.series_error = e.message; }
    }
    const withToday = mode !== 'after', tS = withToday ? (r.today.sales || 0) : 0, tP = withToday ? (r.today.spend || 0) : 0;
    const sales = noSales ? null : prev.sales + tS, spend = prev.spend + tP;
    /* New customers: Triple Whale's new-customer revenue (paid orders), less the share whose first order came from email
       or SMS (finished sale days, else the last 14 days, from tw_orders). */
    const lr = withToday ? (lv && lv.row) || {} : { new_rev: 0, new_orders: 0 };
    let newRev = !noSales && prev.new_ok && lr.new_rev != null ? prev.new_rev + +lr.new_rev : null;
    const newOrders = newRev != null && lr.new_orders != null ? prev.new_orders + +lr.new_orders : null;
    let es = null;
    if (newRev != null) {
      const started = mode !== 'plan' && to >= sale.start;
      try { es = await emailShareNew(env, a.act_id, started ? sale.start : addDays(today, -14), started ? to : addDays(today, -1)); } catch (e) { r.email_error = e.message; }
    }
    const adj = newRev != null ? newRev * (1 - (es ? es.share : 0)) : null;
    r.so_far = { from: mode === 'plan' ? today : sale.start, days: prev.days + (withToday ? 1 : 0), sales, spend, mer: sales != null && spend > 0 ? sales / spend : null, pct_goal: sales != null && cfg.goal ? sales / cfg.goal : null,
      new_rev_all: newRev, new_rev: adj, new_orders: newOrders, email_share_new: es ? es.share : null, new_mer: adj != null && spend > 0 ? adj / spend : null };
    /* Week so far (Monday to now) for the client update (Cole 2026-11-24: "week so far, day so far, last 6 hours"). */
    if (!noSales && deps.series) {
      const dow = new Date(today + 'T12:00:00Z').getUTCDay(), mon = addDays(today, -((dow + 6) % 7));
      let ws = 0, wp = 0;
      if (mon < today) { try { const s = await deps.series({ ...acct, ...a }, mon, addDays(today, -1)); for (const x of s.rows || []) { ws += +x.sales || 0; wp += +x.spend || 0; } } catch (e) { r.week_error = e.message; } }
      ws += r.today.sales || 0; wp += r.today.spend || 0;
      r.week = { from: mon, sales: ws, spend: wp, mer: wp > 0 ? ws / wp : null };
    }
    r.be_new = cfg.be_new || null;
    r.no_sales = noSales ? 1 : 0; r.as_of = (lv && lv.as_of) || null;
    r.suggest = r.error ? { call: 'hold', pct: 0, why: `No live numbers: ${r.error}` } : standCall({ soFar: r.so_far, last6: r.last6, kpi: cfg.kpi, hold: r.hold, noSales, beNew: cfg.be_new });
    /* hands off (handsoff.js, the brand's own flag): updates only, no raise or cut call, like a client-run brand */
    if (cfg.watch || handsOff({ act_id: a.act_id, goals: acct.goals || {} })) { r.watch = 1; r.suggest = { call: 'hold', pct: 0, why: cfg.watch || HANDS_OFF_WHY }; }
    if (cfg.client_approve) r.client_approve = 1;
    return r;
  }));
  rows.sort((p, q) => (q.goal || 0) - (p.goal || 0));
  const starts = rows.map(r => r.sale.start).sort(), ends = rows.map(r => r.sale.end).sort();
  const window = rows.length ? { from: starts[0], to: ends[ends.length - 1] } : STAND;
  /* A dry run only while no brand's sale has started: then every row is today's numbers. */
  return { today, dry: rows.every(r => r.mode === 'plan') ? 1 : 0, window, brands: rows };
}

/* ---------- Routes ---------- */
const clean = (v, n = 4000) => v == null ? null : String(v).slice(0, n);
const isoOk = v => v == null || v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Authenticated routes. Returns null when the path is not ours.
 *  `series(acct, from, to)` and `live(acct)` come from the host worker. */
export async function handleSeason({ path, request, env, accountsFor, email, series, live, channels, titles, client }) {
  if (!path.startsWith('/api/season')) return null;
  const m = request.method;
  const b = m === 'GET' ? {} : await request.json().catch(() => ({}));
  const url = new URL(request.url);
  const actOf = async (act) => (await accountsFor()).find(a => a.act_id === act) || null;
  const who = () => { const w = (email || '').split('@')[0] || 'Mobius'; return w.charAt(0).toUpperCase() + w.slice(1); };

  if (path === '/api/season' && m === 'GET') {
    const act = url.searchParams.get('act') || 'all';
    const accounts = (await accountsFor()).filter(a => act === 'all' || a.act_id === act);
    // Results need one series call per started phase per brand; only worth it on a brand page,
    // or when the board asks for it (the desk's past-day totals).
    const withResults = act !== 'all' || url.searchParams.get('results') === '1';
    return json(await seasonData(env, accounts, { series: withResults ? series : null }));
  }
  if (path === '/api/season/live' && m === 'GET') {
    const acct = await actOf(url.searchParams.get('act'));
    if (!acct) return json({ error: 'unknown account' }, 404);
    if (!live) return json({ error: 'live numbers are not wired' }, 500);
    try {
      const d = await live(acct);
      const lf = liveFrom(d.hours, d.as_of);
      /* No TW shop: sales unknown, so no MER (a $0 sales day must never grade as a cut). */
      if (d.no_sales) { lf.today = { ...lf.today, sales: null, mer: null }; lf.last3 = { ...lf.last3, sales: null, mer: null }; lf.no_sales = 1; }
      return json({ ok: true, act: acct.act_id, date: d.date, spend_src: d.spend_src || null, ...lf });
    } catch (e) { return json({ error: e.message || 'Triple Whale did not answer' }, 502); }
  }
  /* The War Room (2026-10-09). act=all = the grid; act=<brand> = plan + baseline (+ live when the sale is on or ?live=1). */
  if (path === '/api/season/war' && m === 'GET') {
    const act = url.searchParams.get('act') || 'all';
    const today = todayCentral();
    const deps = { series, live, channels, titles };
    if (act === 'all') {
      if (client) return json({ error: 'Pick your brand first.' }, 403);
      return json(await warAll(env, await accountsFor(), today, deps));
    }
    const acct = await actOf(act);
    if (!acct) return json({ error: 'unknown account' }, 404);
    const d = await seasonData(env, [acct], {});
    const a = d.accounts[0];
    const sale = saleOf(a.phases, warOf(a.answers));
    const withLive = url.searchParams.get('live') === '1' || (today >= sale.start && today <= sale.end);
    return json(await warBrand(env, { ...acct, ...a, currency: acct.currency }, today, deps, { withLive, client: !!client }));
  }
  /* Where we stand (2026-11-22): the 3-hourly BFCM check-in, Triple Whale half. Team only. */
  if (path === '/api/season/standing' && m === 'GET') {
    if (client) return json({ error: 'Team only.' }, 403);
    if (!live) return json({ error: 'live numbers are not wired' }, 500);
    /* ?acts=a,b: only the brands whose check-in is due (account-health standing.js, per-brand cadence). */
    const only = new Set(String(url.searchParams.get('acts') || '').split(',').filter(Boolean));
    return json(await standingAll(env, (await accountsFor()).filter(a => !only.size || only.has(a.act_id)), todayCentral(), { series, live }));
  }
  /* Save part of the plan: the patch is merged into p_season_answer key `war`, so two people editing two steps never
     overwrite each other. Only known keys are kept. */
  if (path === '/api/season/war' && m === 'PUT') {
    if (!b.act || !(await actOf(b.act))) return json({ error: 'unknown account' }, 404);
    const row = await env.DB.prepare(`SELECT value FROM p_season_answer WHERE act_id = ?1 AND season = ?2 AND key = 'war'`).bind(b.act, SEASON).first();
    const cur = safeJson(row?.value, {}) || {};
    const p = b.patch && typeof b.patch === 'object' ? b.patch : {};
    /* A client edits its own plan; the team's notes and the Slack alert setup stay the team's (2026-10-10). */
    const KEYS = ['goals', 'budget', 'sale', 'baseline', 'baseline_ok', 'thresholds', 'alerts', 'stock_ok', 'heroes', 'notes'].filter(k => !client || (k !== 'notes' && k !== 'alerts'));
    for (const k of KEYS) if (k in p) { if (p[k] === null) delete cur[k]; else cur[k] = p[k]; }
    if (cur.sale && (!isoOk(cur.sale.start) || !isoOk(cur.sale.end))) return json({ error: 'sale dates must be YYYY-MM-DD' }, 400);
    if (Array.isArray(cur.goals)) cur.goals = cur.goals.filter(g => g && WAR_METRICS[g.metric]).slice(0, 5).map(g => ({ metric: g.metric, target: num(g.target) }));
    cur.updated_by = who(); cur.updated_at = new Date().toISOString();
    const value = JSON.stringify(cur);
    if (value.length > 20000) return json({ error: 'plan too large' }, 400);
    await env.DB.prepare(
      `INSERT INTO p_season_answer (act_id, season, key, value, updated_at) VALUES (?1,?2,'war',?3,datetime('now'))
       ON CONFLICT(act_id, season, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    ).bind(b.act, SEASON, value).run();
    return json({ ok: true, war: cur });
  }
  if (path === '/api/season/checkin' && m === 'PUT') {
    if (!b.act || !b.date || !b.slot || !(await actOf(b.act))) return json({ error: 'unknown account' }, 404);
    if (!isoOk(b.date)) return json({ error: 'date must be YYYY-MM-DD' }, 400);
    const at = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO p_season_checkin (act_id, season, date, slot, roas, mer_day, revenue, spend, verdict, action, by, at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
       ON CONFLICT(act_id, season, date, slot) DO UPDATE SET roas=excluded.roas, mer_day=excluded.mer_day, revenue=excluded.revenue, spend=excluded.spend,
         verdict=excluded.verdict, action=excluded.action, by=excluded.by, at=excluded.at`,
    ).bind(b.act, SEASON, b.date, clean(b.slot, 12), num(b.roas), num(b.mer_day), num(b.revenue), num(b.spend), clean(b.verdict, 40), clean(b.action, 600), who(), at).run();
    return json({ ok: true, by: who(), at });
  }
  if (path === '/api/season/phase' && m === 'PUT') {
    if (!b.act || !b.key || !(await actOf(b.act))) return json({ error: 'unknown account' }, 404);
    if (!isoOk(b.start) || !isoOk(b.end)) return json({ error: 'dates must be YYYY-MM-DD' }, 400);
    const status = ['missing', 'draft', 'locked', 'skip'].includes(b.status) ? b.status : 'missing';
    const key = String(b.key).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || ('p' + Date.now().toString(36));
    await env.DB.prepare(
      `INSERT INTO p_season_phase (act_id, season, key, name, start, end, grp, who, offer, detail, status, sort, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,datetime('now'))
       ON CONFLICT(act_id, season, key) DO UPDATE SET name=excluded.name, start=excluded.start, end=excluded.end, grp=excluded.grp,
         who=excluded.who, offer=excluded.offer, detail=excluded.detail, status=excluded.status, sort=excluded.sort, updated_at=datetime('now')`,
    ).bind(b.act, SEASON, key, clean(b.name, 120) || key, b.start || null, b.end || null, ['nov', 'bf', 'dec', 'late', 'vday'].includes(b.grp) ? b.grp : 'bf',
      clean(b.who, 200), clean(b.offer, 600), clean(b.detail), status, Number.isFinite(+b.sort) ? +b.sort : 500).run();
    return json({ ok: true, key });
  }
  if (path === '/api/season/phase' && m === 'DELETE') {
    if (!b.act || !b.key) return json({ error: 'missing' }, 400);
    if (TPL.some(t => t.key === b.key)) return json({ error: 'Template phases cannot be deleted. Set its status to Skip instead.' }, 400);
    await env.DB.prepare(`DELETE FROM p_season_phase WHERE act_id = ?1 AND season = ?2 AND key = ?3`).bind(b.act, SEASON, b.key).run();
    return json({ ok: true });
  }
  if (path === '/api/season/answer' && m === 'PUT') {
    if (!b.act || !b.key || !(await actOf(b.act))) return json({ error: 'unknown account' }, 404);
    const key = String(b.key).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40);
    /* bf_plan = the client's Black Friday ads block (calendar, ladder, boxes, ad groups): JSON, up to 120KB. */
    /* scheduled (2026-11-22) = what a scheduled task will change on this brand, for the War Room: [{at ISO, what, task}]. */
    if (key === 'scheduled' && b.value != null && !Array.isArray(b.value)) return json({ error: 'scheduled is a list of {at, what}' }, 400);
    const value = key === 'scheduled' ? JSON.stringify(b.value.filter(x => x && !isNaN(Date.parse(x.at)) && x.what).slice(0, 30).map(x => ({ at: new Date(x.at).toISOString(), what: clean(x.what, 200), task: clean(x.task, 80) })))
      : (key === 'goals' || key === 'bf_plan') && b.value && typeof b.value === 'object' ? JSON.stringify(b.value).slice(0, 120000)
      : key === 'bf_plan' ? clean(b.value, 120000) : clean(b.value);
    await env.DB.prepare(
      `INSERT INTO p_season_answer (act_id, season, key, value, updated_at) VALUES (?1,?2,?3,?4,datetime('now'))
       ON CONFLICT(act_id, season, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    ).bind(b.act, SEASON, key, value).run();
    return json({ ok: true });
  }
  if (path === '/api/season/task' && m === 'PUT') {
    if (!b.act || !b.id || !(await actOf(b.act))) return json({ error: 'unknown account' }, 404);
    if (!isoOk(b.due)) return json({ error: 'date must be YYYY-MM-DD' }, 400);
    const name = who();
    const row = await env.DB.prepare(`SELECT * FROM p_season_task WHERE act_id = ?1 AND season = ?2 AND id = ?3`).bind(b.act, SEASON, b.id).first();
    const done = b.done == null ? !!row?.done : !!b.done;
    const custom = b.custom != null ? (b.custom ? 1 : 0) : (row?.custom || (String(b.id).startsWith('c:') ? 1 : 0));
    await env.DB.prepare(
      `INSERT INTO p_season_task (act_id, season, id, phase_key, kind, name, due, owner, done, done_by, done_at, custom, note, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,datetime('now'))
       ON CONFLICT(act_id, season, id) DO UPDATE SET phase_key=excluded.phase_key, kind=excluded.kind, name=excluded.name, due=excluded.due,
         owner=excluded.owner, done=excluded.done, done_by=excluded.done_by, done_at=excluded.done_at, custom=excluded.custom, note=excluded.note, updated_at=datetime('now')`,
    ).bind(b.act, SEASON, String(b.id).slice(0, 80), clean(b.phase_key ?? row?.phase_key, 40), clean(b.kind ?? row?.kind, 20), clean(b.name ?? row?.name, 200),
      (b.due === undefined ? row?.due : b.due) || null, clean(b.owner ?? row?.owner, 60), done ? 1 : 0,
      done ? (row?.done && b.done == null ? row.done_by : name) : null, done ? (row?.done && b.done == null ? row.done_at : new Date().toISOString()) : null,
      custom, clean(b.note ?? row?.note, 600)).run();
    return json({ ok: true, done, done_by: done ? name : null });
  }
  if (path === '/api/season/task' && m === 'DELETE') {
    if (!b.act || !b.id) return json({ error: 'missing' }, 400);
    await env.DB.prepare(`DELETE FROM p_season_task WHERE act_id = ?1 AND season = ?2 AND id = ?3 AND custom = 1`).bind(b.act, SEASON, b.id).run();
    return json({ ok: true });
  }
  if (path === '/api/season-share' && m === 'POST') {
    const acct = await actOf(b.act);
    if (!acct) return json({ error: 'unknown account' }, 404);
    let row = await env.DB.prepare(`SELECT token FROM p_season_share WHERE act_id = ?1 AND season = ?2`).bind(b.act, SEASON).first();
    let token = row?.token;
    if (!token || b.regenerate) {
      token = crypto.randomUUID().replace(/-/g, '');
      await env.DB.prepare(
        `INSERT INTO p_season_share (act_id, season, token, created_at) VALUES (?1,?2,?3,datetime('now'))
         ON CONFLICT(act_id, season) DO UPDATE SET token = excluded.token, created_at = datetime('now')`,
      ).bind(b.act, SEASON, token).run();
    }
    return json({ ok: true, token, url: `https://locus.go-mobius-digital.com/profit/?season=${token}` });
  }
  return json({ error: 'not found' }, 404);
}

/** The client's read-only season page. The token is the auth: one brand, offers, dates,
 *  and over the weekend what we did (never the ladder, never another brand). */
export async function seasonPublic(env, token, series) {
  const row = await env.DB.prepare(`SELECT * FROM p_season_share WHERE token = ?1`).bind(token).first();
  if (!row) return json({ error: 'This link is no longer valid.' }, 404);
  const acct = await env.DB.prepare(`SELECT * FROM brand_accounts WHERE act_id = ?1`).bind(row.act_id).first();
  if (!acct) return json({ error: 'unknown account' }, 404);
  const d = await seasonData(env, [acct], { series });
  const a = d.accounts[0];
  const pick = ['cutoffs', 'returns', 'gift_cards'];
  return json({
    share: true, bf: BF, today: d.today,
    account: { name: a.name },
    phases: a.phases.filter(p => p.status !== 'skip').map(p => ({ key: p.key, name: p.name, start: p.start, end: p.end, grp: p.grp, who: p.who, offer: p.offer, detail: p.detail, status: p.status,
      results: p.results ? { from: p.results.from, to: p.results.to, sales: p.results.sales, orders: p.results.orders } : null })),
    dates: Object.fromEntries(pick.filter(k => a.answers[k]).map(k => [k, a.answers[k]])),
    asks: a.tasks.filter(t => /client|^you\b/i.test(t.owner || '') && !t.done).map(t => ({ name: t.name, due: t.due, phase: t.phase })),
    checkins: a.checkins.filter(c => c.action).map(c => ({ date: c.date, slot: c.slot, action: c.action, by: c.by })),
    bfplan: await bfPlanPublic(env, a),
  });
}

/* THE BLACK FRIDAY ADS BLOCK (2026-11-19, Ice & Gold first). The plan is DATA, one answer per brand
   (`bf_plan`, JSON): days (date, phase, budgets, switches), phases, ladder, structure boxes with a one-line
   why, and ad groups listing ad ids with a client label. Nothing internal is stored there on purpose.
   Here each ad gets its cover from the creative cache (ad_creative, the same rows the Creative tab uses),
   and the page gets the brand's Your ads token so videos play through account-health /api/ad-video
   (?yours=, which only plays that brand's own ads). */
async function bfPlanPublic(env, a) {
  const plan = safeJson(a.answers.bf_plan, null);
  if (!plan || typeof plan !== 'object' || plan.hidden) return null;
  const ids = [...new Set((plan.groups || []).flatMap(g => (g.ads || []).map(x => String(x.id))))].filter(id => /^\d{6,25}$/.test(id));
  const cache = {};
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const { results } = await env.DB.prepare(`SELECT ad_id, json FROM ad_creative WHERE ad_id IN (${part.map((_, k) => `?${k + 1}`).join(',')})`)
      .bind(...part).all().catch(() => ({ results: [] }));
    for (const r of results || []) {
      const v = safeJson(r.json, {}) || {};
      cache[r.ad_id] = { thumb: /^https:\/\//.test(v.thumb || '') ? v.thumb : null, video: !!v.video || v.media_type === 'video' };
    }
  }
  const tokens = safeJson((await env.DB.prepare(`SELECT value FROM settings WHERE key = 'reportTokens'`).first().catch(() => null))?.value, {}) || {};
  const yours = Object.keys(tokens).find(k => tokens[k]?.act_id === a.act_id) || null;
  return {
    ...plan, yours,
    groups: (plan.groups || []).map(g => ({ ...g, ads: (g.ads || []).filter(x => /^\d{6,25}$/.test(String(x.id))).map(x => ({
      id: String(x.id), label: x.label || '', kind: x.kind || (cache[x.id]?.video ? 'video' : 'still'), thumb: cache[x.id]?.thumb || null })) })),
  };
}
