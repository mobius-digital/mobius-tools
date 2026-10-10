/* COSTS LIKE TRIPLE WHALE (2026-10-10). Replaces fixed.js (2026-10-09 fixed expenses).
 *
 * Two kinds of cost, the way Triple Whale's Cost Settings splits them:
 *   1. Per-order costs (product cost, shipping, handling, payment fees). Triple Whale stays the source: the brand
 *      sets them there and Locus reads them through tw_daily. Locus only REPORTS where each comes from (the
 *      "Where each cost comes from" list, `sources` in GET /api/expenses). There is no second COGS editor here.
 *   2. CUSTOM EXPENSES, kept here per brand (table p_expense). Each one:
 *        name, category (team, software, rent, agency, marketing, other),
 *        kind  monthly      an amount each month, spread evenly over that month's days
 *              once         an amount on one date
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
 *   - briefs and reports (account-health worker) do not read this table.
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

export const CATEGORIES = [
  { id: 'team', label: 'Team', hint: 'Salaries, contractors, freelancers' },
  { id: 'software', label: 'Software', hint: 'Shopify plan, apps, Klaviyo, Triple Whale' },
  { id: 'rent', label: 'Rent and premises', hint: 'Office, warehouse, storage' },
  { id: 'agency', label: 'Agency fees', hint: 'Retainers and performance fees' },
  { id: 'marketing', label: 'Marketing, other', hint: 'Influencers, sponsorships, PR, channels with no ad account' },
  { id: 'other', label: 'Other', hint: 'Anything else' },
];
export const KINDS = [
  { id: 'monthly', label: 'Fixed, every month', unit: 'money', hint: 'The same amount each month, spread evenly over the month’s days.' },
  { id: 'once', label: 'One time, on a date', unit: 'money', hint: 'Counted once, on the day it happened.' },
  { id: 'pct_revenue', label: '% of revenue', unit: 'pct', hint: 'Worked out from each day’s revenue (total sales minus tax).' },
  { id: 'pct_spend', label: '% of ad spend', unit: 'pct', hint: 'Worked out from each day’s ad spend, like an agency’s % fee.' },
  { id: 'per_order', label: 'Per order', unit: 'money', hint: 'Times each day’s paid orders, like a packaging insert.' },
];
const CAT_IDS = new Set(CATEGORIES.map(c => c.id)), KIND_IDS = new Set(KINDS.map(k => k.id));

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const dim = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
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
const view = r => ({ id: r.id, name: r.name, category: r.category || 'other', kind: r.kind, amount: r.amount, start_date: r.start_date, end_date: r.end_date || null,
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
  return [null, { name, kind, amount, start_date: start, end_date: end, category: CAT_IDS.has(x.category) ? x.category : 'other',
    is_ad_spend: x.is_ad_spend ? 1 : 0, notes: String(x.notes || '').trim().slice(0, 300) || null, id: Number.isInteger(+x.id) && +x.id > 0 ? +x.id : null }];
}

/** ctx: { path, url, request, env, json, accountsFor, email, client (clientScope or null), sources(acct) } */
export async function handleExpenses({ path, url, request, env, json, accountsFor, email, client, sources }) {
  if (path !== '/api/expenses') return null;
  await ensure(env);
  const brandOk = async act => {
    if (!act || act === 'all') return null;
    const acct = (await accountsFor()).find(a => a.act_id === act);
    if (!acct) return null;
    if (client && !(client.ids && client.ids.has(act))) return null;   // brandguard already refused; belt and braces
    return acct;
  };
  if (request.method === 'GET') {
    const acct = await brandOk(url.searchParams.get('act') || '');
    if (!acct) return json({ error: 'unknown brand' }, 404);
    const { results } = await env.DB.prepare(`SELECT * FROM p_expense WHERE act_id = ?1 ORDER BY start_date DESC, id`).bind(acct.act_id).all();
    const src = sources ? await sources(acct).catch(e => ({ error: e.message })) : null;
    return json({ act: acct.act_id, name: acct.name, currency: acct.currency || 'USD', items: (results || []).map(view), categories: CATEGORIES, kinds: KINDS, sources: src });
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
    return json({ ok: true, count: items.length, items: (results || []).map(view) });
  }
  return json({ error: 'method not allowed' }, 405);
}
