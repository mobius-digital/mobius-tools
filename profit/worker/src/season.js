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
  for (const k of ['early', 'bf', 'dec', 'total', 'be', 'target', 's50', 's100', 'start', 'cap']) out[k] = num(g[k]);
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
export const WAR_STEPS = [
  ['baseline', 'Review last year'], ['goals', 'Set the goals'], ['ladder', 'Set the scaling ladder'], ['budget', 'Split the paid budget'],
  ['offers', 'Lock the offers and dates'], ['alerts', 'Turn on the Slack alerts'], ['stock', 'Check stock on the heroes'],
];
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
    baseline: !!war.baseline_ok,
    goals: goals.list.some(x => x.target > 0),
    ladder: g.be != null && g.target != null && g.s50 != null && g.s100 != null,
    budget: bud.total > 0 && bud.channels.length > 0 && Math.abs(bud.unallocated) < 1,
    offers: !!bfp && bfp.status === 'locked',
    alerts: Array.isArray(war.alerts) && war.alerts.length > 0,
    stock: !!war.stock_ok,
  };
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
  out.today = { sales, orders, aov: orders > 0 ? sales / orders : null, spend, mer: lf.today.mer, new_orders: row.new_orders ?? null, email_rev: row.email_rev ?? null };
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
    war: client ? { goals: war.goals || null, budget: war.budget || null } : war, goals_list: goals.list, goals_saved: goals.saved, ladder: client ? null : a.goals,
    budget: bud, baseline: base, plan, steps: warSteps(a, war),
    phases: (a.phases || []).filter(p => p.status !== 'skip').map(p => ({ key: p.key, name: p.name, start: p.start, end: p.end, grp: p.grp, offer: p.offer, status: p.status, who: p.who })),
    checkins: (a.checkins || []).map(c => client ? { date: c.date, slot: c.slot, action: c.action, by: c.by } : c),
    metrics: WAR_METRICS, channel_names: WAR_CHANNELS,
  };
  if (withLive && deps.live) out.live = await warLive(env, a, deps, plan, today, sale, bud).catch(e => ({ error: e.message }));
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
    const r = { act_id: a.act_id, name: a.name, currency: acct.currency || 'USD', mode, sale, days_to: between(today, sale.start), steps, done: steps.filter(s => s.done).length, goal: revGoal,
      bf_offer: (a.phases.find(p => p.key === 'bf') || {}).offer || '' };
    if (mode === 'live' && deps.live) {
      const win = baselineWindow(sale, war);
      const base = await warBaseline(env, acct, win, { series: deps.series }).catch(() => ({ days: [] }));
      const plan = dayPlan(sale, revGoal, budgetOf(war).total, base.days);
      r.live = await warLive(env, { ...acct, ...a }, deps, plan, today, sale, budgetOf(war)).catch(e => ({ error: e.message }));
    }
    /* Risk: live = how far behind the plan right now; before = steps missing, weighted by how close the sale is. */
    const pace = r.live?.day?.pace;
    r.risk = mode === 'live' ? (pace == null ? 50 : Math.round((1 - Math.min(pace, 1.5)) * 100)) : mode === 'after' ? -100 : Math.round((7 - r.done) * (r.days_to <= 14 ? 3 : r.days_to <= 30 ? 2 : 1) * 10) / 10;
    return r;
  }));
  rows.sort((x, y) => y.risk - x.risk || x.name.localeCompare(y.name));
  return { today, bf: BF, brands: rows, steps: WAR_STEPS.map(([key, label]) => ({ key, label })) };
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
      return json({ ok: true, act: acct.act_id, date: d.date, ...liveFrom(d.hours, d.as_of) });
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
  /* Save part of the plan: the patch is merged into p_season_answer key `war`, so two people editing two steps never
     overwrite each other. Only known keys are kept. */
  if (path === '/api/season/war' && m === 'PUT') {
    if (!b.act || !(await actOf(b.act))) return json({ error: 'unknown account' }, 404);
    const row = await env.DB.prepare(`SELECT value FROM p_season_answer WHERE act_id = ?1 AND season = ?2 AND key = 'war'`).bind(b.act, SEASON).first();
    const cur = safeJson(row?.value, {}) || {};
    const p = b.patch && typeof b.patch === 'object' ? b.patch : {};
    const KEYS = ['goals', 'budget', 'sale', 'baseline', 'baseline_ok', 'thresholds', 'alerts', 'stock_ok', 'heroes', 'notes'];
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
    const value = key === 'goals' && b.value && typeof b.value === 'object' ? JSON.stringify(b.value) : clean(b.value);
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
    return json({ ok: true, token, url: `https://tools.go-mobius-digital.com/profit/?season=${token}` });
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
  });
}
