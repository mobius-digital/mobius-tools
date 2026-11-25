/* COSTS LIKE TRIPLE WHALE (2026-10-10). Replaces fixed.js (2026-10-09 fixed expenses).
 *
 * Two kinds of cost, the way Triple Whale's Cost Settings splits them:
 *   1. Per-order costs (product cost, shipping, handling, payment fees). Triple Whale stays the source: the brand
 *      sets them there and Locus reads them through tw_daily. Locus only REPORTS where each comes from (the
 *      "Where each cost comes from" list, `sources` in GET /api/expenses). There is no second COGS editor here.
 *   2. CUSTOM EXPENSES, kept here per brand (table p_expense). Each one:
 *        name, category (FREE TEXT the brand names itself, up to 40 characters, 2026-11-25; the built-in list is only
 *                        suggestions, and an old row's id such as 'software' still reads),
 *        kind  monthly      an amount each month, spread evenly over that month's days
 *              once         an amount on one date
 *              daily        an amount every day                                            (these five: 2026-11-25)
 *              weekly       an amount each week, a seventh on each of its 7 days, weeks counted from start_date's weekday
 *              quarterly    an amount each calendar quarter, spread evenly over that quarter's days
 *              yearly       an amount each calendar year, spread evenly over that year's days
 *              custom       one amount spread evenly over every day from start_date to end_date (both needed)
 *              pct_revenue  a % of each day's revenue (Shopify total sales minus tax, Locus's one revenue)
 *              pct_spend    a % of each day's ad spend (the platforms' spend, before any expense is added)
 *              per_order    an amount per paid order (Triple Whale totalOrders)
 *        amount (money, or the percent for the % kinds), start_date, optional end_date (not for once),
 *        is_ad_spend  Triple Whale's "is ad spend": the cost is ADDED TO BLENDED AD SPEND, so MER, aMER, CAC and
 *                     contribution margin include it (an influencer fee, a podcast read, a channel with no API).
 *        notes, created_by (email), created_name (who added it, shown as "Added by").
 *
 * Where they flow:
 *   - is_ad_spend rows: applyAdSpend() adds them to each day's `spend` inside seriesFor (worker.js) and the tile
 *     drill-downs (hub.js), and recomputes mer / amer / cm. Rows keep base_spend (the platforms alone) and ad_expense.
 *   - every other row: Net profit = contribution margin minus these, on P&L and in the CM drill-down. CM is unchanged.
 *   - briefs, reports and the client profit link carry "Fixed costs" and "Net profit" (2026-11-25) through netAfter()
 *     below, only when the brand has a fixed cost in force and its contribution margin is shown. CM itself is unchanged
 *     there: the account-health worker reads p_expense with a plain SELECT (no ensure, no migration).
 *     CLIENT PAGES (the public profit link, a report) get ONE fixed costs total and net profit, never a category or a
 *     row, and only with settings costsNetInPosts on (netInPosts() below, the same switch as the Slack text). Categories
 *     stay with the team and on the brand's own Costs data.
 *
 * Old rows: p_fixed_cost (fixed.js) are copied once into p_expense as monthly fixed costs (legacy_id, INSERT OR IGNORE,
 * then settings.expensesMigrated), so nothing a brand already entered is lost and a deleted row never comes back.
 *
 *   GET  /api/expenses?act=     the brand's list, the choices, and where each per-order cost comes from
 *   PUT  /api/expenses {act, items:[...]}   replaces the list (ids keep their "Added by")
 * Clients reach both on their own brand with P&L switched on (brandguard CLIENT_RULES); the team reaches any brand. */

let ready = false;
export async function ensure(env) {
  if (ready) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_expense (id INTEGER PRIMARY KEY AUTOINCREMENT, act_id TEXT NOT NULL, name TEXT NOT NULL,
    category TEXT, kind TEXT NOT NULL DEFAULT 'monthly', amount REAL NOT NULL DEFAULT 0, start_date TEXT NOT NULL, end_date TEXT,
    is_ad_spend INTEGER NOT NULL DEFAULT 0, notes TEXT, created_by TEXT, created_name TEXT, created_at TEXT DEFAULT (datetime('now')),
    updated_by TEXT, updated_at TEXT DEFAULT (datetime('now')), legacy_id INTEGER)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_expense_act ON p_expense(act_id)`).run();
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS p_expense_legacy ON p_expense(legacy_id)`).run();
  await migrateFixed(env).catch(() => {});
  ready = true;
}
/** For tests: forget that the table was made (a fresh database). */
export function _reset() { ready = false; }

const OLD_CAT = { Software: 'software', Salaries: 'team', 'Agency fee': 'agency', Rent: 'rent', Insurance: 'other', Other: 'other' };
/** Copy the 2026-10-09 fixed expenses across once, as monthly costs. */
export async function migrateFixed(env) {
  const flag = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'expensesMigrated'`).first().catch(() => null);
  if (flag) return 0;
  let rows = [];
  try { rows = (await env.DB.prepare(`SELECT * FROM p_fixed_cost`).all()).results || []; } catch { rows = []; }
  for (const r of rows) {
    const end = r.end_month ? `${r.end_month}-${String(dim(r.end_month)).padStart(2, '0')}` : null;
    await env.DB.prepare(`INSERT OR IGNORE INTO p_expense (act_id, name, category, kind, amount, start_date, end_date, is_ad_spend, created_by, created_name, legacy_id)
      VALUES (?1, ?2, ?3, 'monthly', ?4, ?5, ?6, 0, ?7, ?8, ?9)`)
      .bind(r.act_id, r.name, OLD_CAT[r.category] || 'other', +r.monthly || 0, `${r.start_month}-01`, end, r.created_by || null, nameOf(r.created_by), r.id).run();
  }
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('expensesMigrated', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(JSON.stringify({ at: new Date().toISOString(), rows: rows.length })).run().catch(() => {});
  return rows.length;
}

/* SUGGESTIONS only (2026-11-25). A category is whatever the brand calls it: any name up to 40 characters is kept as
   typed. These ids are what older rows hold, so they still read and still show these labels. */
export const CATEGORIES = [
  { id: 'team', label: 'Team', hint: 'Salaries and wages' },
  { id: 'contractors', label: 'Contractors', hint: 'Freelancers and outside help' },
  { id: 'software', label: 'Software', hint: 'Shopify plan, apps, Klaviyo, Triple Whale' },
  { id: 'rent', label: 'Rent and premises', hint: 'Office, warehouse, storage' },
  { id: 'marketing', label: 'Marketing, other', hint: 'Influencers, sponsorships, PR, channels with no ad account' },
  { id: 'other', label: 'Other', hint: 'Anything else' },
];
export const KINDS = [
  { id: 'monthly', label: 'Fixed, every month', unit: 'money', hint: 'The same amount each month, spread evenly over the month’s days.' },
  { id: 'once', label: 'One time, on a date', unit: 'money', hint: 'Counted once, on the day it happened.' },
  { id: 'pct_revenue', label: '% of revenue', unit: 'pct', hint: 'Worked out from each day’s revenue (total sales minus tax).' },
  { id: 'pct_spend', label: '% of ad spend', unit: 'pct', hint: 'Worked out from each day’s ad spend, like a fee billed on what you spend.' },
  { id: 'per_order', label: 'Per order', unit: 'money', hint: 'Times each day’s paid orders, like a packaging insert.' },
  { id: 'daily', label: 'Every day', unit: 'money', hint: 'The same amount each day.' },
  { id: 'weekly', label: 'Every week', unit: 'money', hint: 'The same amount each week, a seventh on each day, starting on the start date.' },
  { id: 'quarterly', label: 'Every quarter', unit: 'money', hint: 'The same amount each calendar quarter, spread evenly over the quarter’s days.' },
  { id: 'yearly', label: 'Every year', unit: 'money', hint: 'The same amount each calendar year, spread evenly over the year’s days.' },
  { id: 'custom', label: 'Custom dates', unit: 'money', hint: 'One amount spread evenly over every day from the start date to the end date.' },
];
const KIND_IDS = new Set(KINDS.map(k => k.id));
export const CATEGORY_MAX = 40;

/** A typed category -> what is stored: 'other' when blank, a suggestion's id when it names one (so "Software" and
 *  "software" are one group), else the brand's own words. null when it is longer than CATEGORY_MAX. */
export function cleanCategory(v) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return 'other';
  if (s.length > CATEGORY_MAX) return null;
  const l = s.toLowerCase(), hit = CATEGORIES.find(c => c.id === l || c.label.toLowerCase() === l);
  return hit ? hit.id : s;
}
/** What a stored category reads as: a suggestion's label, else the brand's own words (a first capital when it has none). */
export function categoryLabel(c) {
  const s = String(c ?? '').trim();
  if (!s) return 'Other';
  const hit = CATEGORIES.find(x => x.id === s.toLowerCase());
  if (hit) return hit.label;
  return s === s.toLowerCase() ? s[0].toUpperCase() + s.slice(1) : s;
}
const catKey = c => String(c || 'other').trim().toLowerCase() || 'other';
/** The distinct categories a brand's rows use, by name. -> [{ id, label }] (id = the stored text of the first row) */
export function brandCategories(rows) {
  const by = new Map();
  for (const r of rows || []) { if (!r) continue; const k = catKey(r.category); if (!by.has(k)) by.set(k, { id: r.category || 'other', label: categoryLabel(r.category) }); }
  return [...by.values()].sort((a, b) => a.label.localeCompare(b.label));
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const dim = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
const DAY = 86400000, utc = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
/** Days in the calendar year / the calendar quarter that holds `d`, and the days from a to b counting both ends. */
const diy = d => { const y = +d.slice(0, 4); return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365; };
const diq = d => { const y = d.slice(0, 4), q = Math.floor((+d.slice(5, 7) - 1) / 3) * 3; return dim(`${y}-${String(q + 1).padStart(2, '0')}`) + dim(`${y}-${String(q + 2).padStart(2, '0')}`) + dim(`${y}-${String(q + 3).padStart(2, '0')}`); };
const span = (a, b) => Math.round((utc(b) - utc(a)) / DAY) + 1;
const nextDay = d => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
const r2 = x => Math.round(x * 100) / 100;
/** "cole@go-mobius-digital.com" -> "Cole". Only a name ever leaves the worker, never the email. */
export function nameOf(email) {
  if (!email) return null;
  const n = String(email).split('@')[0].split(/[.+_-]/)[0];
  return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : null;
}

/** One expense's amount on one day. `row` is that day's economics (sales, spend / base_spend, orders) or undefined. */
export function dayValue(e, d, row) {
  const a = +e.amount || 0;
  if (e.kind === 'monthly') return a / dim(d.slice(0, 7));
  if (e.kind === 'once') return d === e.start_date ? a : 0;
  /* The time kinds added 2026-11-25. None needs the day's numbers. A week is 7 days from start_date's weekday, so a
     seventh a day is the even spread whichever day the week starts on. */
  if (e.kind === 'daily') return a;
  if (e.kind === 'weekly') return a / 7;
  if (e.kind === 'quarterly') return a / diq(d);
  if (e.kind === 'yearly') return a / diy(d);
  if (e.kind === 'custom') return YMD.test(e.end_date || '') && e.end_date >= e.start_date ? a / span(e.start_date, e.end_date) : 0;
  if (!row) return 0;
  if (e.kind === 'pct_revenue') return Math.max(0, +row.sales || 0) * a / 100;
  if (e.kind === 'pct_spend') return Math.max(0, +(row.base_spend ?? row.spend) || 0) * a / 100;
  if (e.kind === 'per_order') return Math.max(0, +row.orders || 0) * a;
  return 0;
}

/** Spread a brand's expenses over [from, to]. Pure, so the tests drive it directly.
 *  -> { total, ad_total, items, ad_items, byDate, adByDate }  (items: [{id, name, category, kind, rate, amount}]) */
export function spread(list, from, to, rows) {
  const out = { total: 0, ad_total: 0, items: [], ad_items: [], byDate: {}, adByDate: {} };
  if (!from || !to || from > to) return out;
  const R = {}; for (const r of rows || []) if (r && r.date) R[r.date] = r;
  for (const e of list || []) {
    if (!e || !YMD.test(e.start_date || '')) continue;
    if (e.kind === 'once' && e.start_date > to) continue;   // a one-time cost dated after the window has not happened yet
    const lo = e.start_date > from ? e.start_date : from;
    const end = e.kind === 'once' ? e.start_date : e.end_date && e.end_date < to ? e.end_date : to;
    const ad = !!+e.is_ad_spend, by = ad ? out.adByDate : out.byDate;
    let amt = 0;
    for (let d = lo; d <= end; d = nextDay(d)) { const v = dayValue(e, d, R[d]); if (v) { amt += v; by[d] = (by[d] || 0) + v; } }
    if (!(amt > 0)) continue;
    const it = { id: e.id ?? null, name: e.name, category: e.category || 'other', kind: e.kind, rate: +e.amount || 0, amount: r2(amt) };
    if (ad) { out.ad_items.push(it); out.ad_total += amt; } else { out.items.push(it); out.total += amt; }
  }
  out.items.sort((a, b) => b.amount - a.amount); out.ad_items.sort((a, b) => b.amount - a.amount);
  out.total = r2(out.total); out.ad_total = r2(out.ad_total);
  return out;
}

/** spread() over a list of single days instead of a whole window: only those days count, except that a one-time cost
 *  dated inside [from, to] counts once whether or not its day is listed (the money was spent in the window either way).
 *  -> { total, ad_total, items }  (items: one { category, amount } per expense that cost something). */
function spreadOn(list, dates, rows, from, to) {
  const out = { total: 0, ad_total: 0, items: [] };
  const R = {}; for (const r of rows || []) if (r && r.date) R[r.date] = r;
  for (const e of list || []) {
    if (!e || !YMD.test(e.start_date || '')) continue;
    let amt = 0;
    if (e.kind === 'once') { if (e.start_date >= from && e.start_date <= to) amt = +e.amount || 0; }
    else for (const d of dates || []) {
      if (d < e.start_date || (e.end_date && d > e.end_date)) continue;
      amt += dayValue(e, d, R[d]) || 0;
    }
    if (!(amt > 0)) continue;
    if (+e.is_ad_spend) out.ad_total += amt; else { out.total += amt; out.items.push({ category: e.category || 'other', amount: r2(amt) }); }
  }
  out.total = r2(out.total); out.ad_total = r2(out.ad_total);
  return out;
}

/** Add the "counts as ad spend" expenses to each day's spend and recompute what rests on it. Mutates the rows. */
export function applyAdSpend(rows, adByDate) {
  if (!adByDate) return rows;
  for (const r of rows || []) {
    const x = adByDate[r.date];
    if (!x || r.ad_expense != null) continue;
    r.base_spend = r.spend; r.ad_expense = x;
    r.spend = (r.spend || 0) + x;
    r.mer = r.spend ? r.sales / r.spend : null;
    r.amer = r.new_rev != null && r.spend ? r.new_rev / r.spend : null;
    r.cm = r.gross_profit != null ? r.gross_profit - r.spend : null;
  }
  return rows;
}

/** Fixed-cost rows (not "counts as ad spend") in force at any point in [from, to]. */
export function activeIn(list, from, to) {
  return (list || []).filter(e => e && !+e.is_ad_spend && YMD.test(e.start_date || '') && e.start_date <= to
    && (e.kind === 'once' ? e.start_date >= from : (!e.end_date || e.end_date >= from)));
}
/** Net profit after fixed costs for one window.
 *  -> null when cm is null or no fixed row is in force; else { fixed, ad, net, by_category: [{ category, label, amount }] }.
 *  cmHasAd: true when the caller's cm already includes the "counts as ad spend" expenses (profit worker), false when
 *  it does not (account-health briefs and reports). Only category totals are returned, never a row's name or notes,
 *  and by_category is for the team: a client page gets `fixed` and `net` alone.
 *  The gate is activeIn, not the spread: a per order or % row is 0 on a day with no sales and must not make the line flicker.
 *  THE SUM ALWAYS HOLDS: net = cm - fixed - (cmHasAd ? 0 : ad), to the cent, so a screen that shows cm, fixed (and ad
 *  where cm does not hold it) and net adds up in front of the reader. */
export function netAfter(list, from, to, rows, cm, { cmHasAd = false, gpKey = null, dates = null } = {}) {
  if (cm == null || !activeIn(list, from, to).length) return null;
  /* ONE WINDOW. With gpKey (the name of the rows' gross profit field) a window that holds a day with no gross profit
     gets no net profit at all: the gross profit of some days minus the fixed costs of all of them is not a number
     anyone should read. */
  if (gpKey && (rows || []).some(r => r && r.date >= from && r.date <= to && r[gpKey] == null)) return null;
  /* THE SAME DAYS AS CM. The caller's cm is a sum over the days it has a row for (`dates` when it says so, as the Daily
     Brief does: the days that have a contribution margin; otherwise every day of `rows` inside the window). Fixed
     costs are counted on exactly those days: a calendar day with no row has nothing in cm, so it is charged no rent
     either. A one-time cost is the exception: dated inside the window it counts once, on a covered day or not. */
  const days = [...new Set((dates || (rows || []).map(r => r && r.date)).filter(d => d && d >= from && d <= to))].sort();
  const s = spreadOn(list, days, rows, from, to);
  const by = new Map();
  for (const it of s.items) { const k = catKey(it.category), g = by.get(k) || { category: it.category, label: categoryLabel(it.category), amount: 0 }; g.amount += it.amount; by.set(k, g); }
  const by_category = [...by.values()].map(g => ({ ...g, amount: r2(g.amount) })).sort((a, b) => b.amount - a.amount);
  return { fixed: s.total, ad: s.ad_total, net: r2(cm - s.total - (cmHasAd ? 0 : s.ad_total)), by_category };
}

/** settings costsNetInPosts (default off): may anything a CLIENT reads carry fixed costs and net profit? One switch for
 *  the Daily Brief, its thread, the weekly and monthly client post, a report (frozen into it when it is generated) and
 *  the public client profit link. A plain read: a missing table or row is "off". */
export async function netInPosts(env) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'costsNetInPosts'`).first().catch(() => null);
  return ['1', 'true', '"1"'].includes(String(row?.value));
}

/** Every brand's expense rows, one query. -> { act: [rows] } */
export async function loadExpenses(env, acts) {
  const out = Object.fromEntries(acts.map(a => [a, []]));
  if (!acts.length) return out;
  await ensure(env).catch(() => {});
  const ph = acts.map((_, i) => `?${i + 1}`).join(',');
  const { results } = await env.DB.prepare(`SELECT * FROM p_expense WHERE act_id IN (${ph}) ORDER BY id`).bind(...acts).all().catch(() => ({ results: [] }));
  for (const r of results || []) if (out[r.act_id]) out[r.act_id].push(r);
  return out;
}

/** Load + spread for many brands. rowsBy = { act: day rows } for the % and per-order kinds. */
export async function expensesFor(env, acts, from, to, rowsBy = {}) {
  const lists = await loadExpenses(env, acts);
  return Object.fromEntries(acts.map(a => [a, spread(lists[a], from, to, rowsBy[a])]));
}

/** What a client or teammate may see of one row: never an email. */
export const view = r => ({ id: r.id, name: r.name, category: r.category || 'other', category_label: categoryLabel(r.category), kind: r.kind, amount: r.amount, start_date: r.start_date, end_date: r.end_date || null,
  is_ad_spend: !!+r.is_ad_spend, notes: r.notes || '', added_by: r.created_name || nameOf(r.created_by) || null, added_at: r.created_at || null, updated_at: r.updated_at || null });

/** Check one incoming item; returns [error] or [null, clean]. */
export function clean(x) {
  const name = String(x?.name || '').trim().slice(0, 80);
  if (!name) return ['Every expense needs a name.'];
  const kind = KIND_IDS.has(x.kind) ? x.kind : 'monthly';
  const digits = String(x.amount ?? '').replace(/[^0-9.]/g, ''), amount = +digits;
  if (!digits || !isFinite(amount) || amount < 0) return [`${name}: the amount is not a number.`];
  if ((kind === 'pct_revenue' || kind === 'pct_spend') && amount > 100) return [`${name}: a percentage cannot be more than 100.`];
  if (amount > 1e7) return [`${name}: that amount is too large.`];
  const start = String(x.start_date || '').trim();
  if (!YMD.test(start)) return [`${name}: pick the date it starts${kind === 'once' ? ' (the day it was paid)' : ''}.`];
  let end = kind === 'once' ? null : String(x.end_date || '').trim() || null;
  if (end && (!YMD.test(end) || end < start)) return [`${name}: the end date is before the start.`];
  if (kind === 'custom' && !end) return [`${name}: pick the date it ends, so the amount can be spread from the start to the end.`];
  const category = cleanCategory(x.category);
  if (category == null) return [`${name}: a category name can be up to ${CATEGORY_MAX} characters.`];
  return [null, { name, kind, amount, start_date: start, end_date: end, category,
    is_ad_spend: x.is_ad_spend ? 1 : 0, notes: String(x.notes || '').trim().slice(0, 300) || null, id: Number.isInteger(+x.id) && +x.id > 0 ? +x.id : null }];
}

/** ctx: { path, url, request, env, json, accountsFor, email, client (clientScope or null), sources(acct) } */
export async function handleExpenses({ path, url, request, env, json, accountsFor, email, client, sources, only }) {
  if (path !== '/api/expenses') return null;
  await ensure(env);
  const brandOk = async act => {
    if (!act || act === 'all') return null;
    const acct = (await accountsFor()).find(a => a.act_id === act);
    if (!acct) return null;
    if (client && !(client.ids && client.ids.has(act))) return null;   // brandguard already refused; belt and braces
    /* `only` = the signed-in person's brands (brandguard brandsFor), null when not limited. brandguard reads a body's
       act only when the request says it is JSON; this check does not depend on the Content-Type. */
    if (only && !only.has(act)) return null;
    return acct;
  };
  if (request.method === 'GET') {
    const acct = await brandOk(url.searchParams.get('act') || '');
    if (!acct) return json({ error: 'unknown brand' }, 404);
    const { results } = await env.DB.prepare(`SELECT * FROM p_expense WHERE act_id = ?1 ORDER BY start_date DESC, id`).bind(acct.act_id).all();
    const src = sources ? await sources(acct).catch(e => ({ error: e.message })) : null;
    return json({ act: acct.act_id, name: acct.name, currency: acct.currency || 'USD', items: (results || []).map(view), categories: CATEGORIES,
      brand_categories: brandCategories(results), kinds: KINDS, sources: src });
  }
  if (request.method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    const acct = await brandOk(String(b.act || ''));
    if (!acct) return json({ error: 'unknown brand' }, 404);
    if (!Array.isArray(b.items) || b.items.length > 60) return json({ error: 'items must be a list of at most 60' }, 400);
    const items = [];
    for (const x of b.items) { const [err, c] = clean(x); if (err) return json({ error: err }, 400); items.push(c); }
    const { results: cur } = await env.DB.prepare(`SELECT id, created_by, created_name, created_at, legacy_id FROM p_expense WHERE act_id = ?1`).bind(acct.act_id).all();
    const had = new Map((cur || []).map(r => [r.id, r]));
    const me = email || null, myName = (client && client.name) || nameOf(email) || 'Mobius';
    const stmts = [env.DB.prepare(`DELETE FROM p_expense WHERE act_id = ?1`).bind(acct.act_id)];
    for (const c of items) {
      const old = c.id != null ? had.get(c.id) : null;   // an id from another brand is ignored: a new row
      stmts.push(env.DB.prepare(`INSERT INTO p_expense (id, act_id, name, category, kind, amount, start_date, end_date, is_ad_spend, notes, created_by, created_name, created_at, updated_by, updated_at, legacy_id)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, COALESCE(?13, datetime('now')), ?14, datetime('now'), ?15)`)
        .bind(old ? c.id : null, acct.act_id, c.name, c.category, c.kind, c.amount, c.start_date, c.end_date, c.is_ad_spend, c.notes,
          old ? old.created_by : me, old ? old.created_name : myName, old ? old.created_at : null, me, old ? old.legacy_id : null));
    }
    await env.DB.batch(stmts);
    const { results } = await env.DB.prepare(`SELECT * FROM p_expense WHERE act_id = ?1 ORDER BY start_date DESC, id`).bind(acct.act_id).all();
    return json({ ok: true, count: items.length, items: (results || []).map(view), brand_categories: brandCategories(results) });
  }
  return json({ error: 'method not allowed' }, 405);
}
