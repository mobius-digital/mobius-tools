/* BRAND COSTS (2026-11-25). A brand's own shipping and product cost rules, each with a start date.
 *
 * Until now every per-order cost came from Triple Whale's daily totals. Here a brand (or the team) can type a rule:
 *   cost   shipping | product
 *   rule   per_order     an amount per paid order            APPLIED (Triple Whale totalOrders per day)
 *          pct_revenue   a % of the day's revenue             APPLIED (total sales minus tax, the one revenue)
 *          per_item      an amount per item sold              saved, not applied yet (no units per day are held)
 *          weight_tier   a table by parcel weight (shipping)  saved, not applied yet (no order weight is held)
 *          zone          a table by country or zone (shipping) saved, not applied yet (no ship-to is held)
 *   A product cost sheet (CSV, one cost per SKU) is saved in p_product_cost, not applied yet (no order lines are held).
 *
 * A rule is never approximated. A saved-only rule carries applied:false and the `missing` list says so in words.
 * An applied rule replaces Triple Whale's figure for that cost from its start date (the brand typed it on purpose);
 * switching it off or removing it returns the brand to Triple Whale. The flat margin override still beats everything.
 *
 * THE SAFETY PROPERTY: a brand with no row in p_cost_rule gets the same bytes as before on every route of both
 * workers. ruleCosts() is only called with a non-empty list, returns null when nothing applies, and the callers add
 * no key and change no number then. loadCostRules() is a plain SELECT, so a missing table is simply "no rules".
 *
 *   GET    /api/costs?act=           (worker.js) the old diagnostic keys, plus costsPage() below
 *   PUT    /api/costs {act, rule}    add one rule, or change one by id
 *   DELETE /api/costs?act=&id=       remove one rule;  ?act=&sheet=<batch> removes one uploaded sheet
 *   POST   /api/costs/sheet {act, csv, start_date, filename?, dry_run?}   check a cost sheet; dry_run:false saves it
 * Clients reach all four on their own brand (brandguard CLIENT_RULES); the team reaches any brand.
 *
 * ruleCosts / activeRule / APPLIED are pure and are imported by the account-health worker too (brief and reports). */
import { CATEGORIES, KINDS, spread, activeIn, view as expenseView, nameOf, brandCategories } from './expenses.js';

let ready = false;
export async function ensure(env) {
  if (ready) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_cost_rule (id INTEGER PRIMARY KEY AUTOINCREMENT, act_id TEXT NOT NULL, cost TEXT NOT NULL,
    rule TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'typed', amount REAL, table_json TEXT, start_date TEXT NOT NULL, end_date TEXT,
    status TEXT NOT NULL DEFAULT 'on', label TEXT, notes TEXT, created_by TEXT, created_name TEXT, created_at TEXT DEFAULT (datetime('now')),
    updated_by TEXT, updated_at TEXT DEFAULT (datetime('now')))`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_cost_rule_act ON p_cost_rule(act_id, cost, start_date)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_product_cost (act_id TEXT NOT NULL, sku TEXT NOT NULL, title TEXT, unit_cost REAL NOT NULL,
    start_date TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'sheet', batch TEXT, filename TEXT, uploaded_by TEXT, uploaded_name TEXT,
    uploaded_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (act_id, sku, start_date))`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_product_cost_act ON p_product_cost(act_id, start_date)`).run();
  ready = true;
}
/** For tests: forget that the tables were made (a fresh database). */
export function _reset() { ready = false; }

export const COSTS = ['shipping', 'product'];
export const RULES = {
  shipping: [
    { id: 'per_order', label: 'Per order', unit: 'money', hint: 'The same amount for every paid order.' },
    { id: 'pct_revenue', label: '% of revenue', unit: 'pct', hint: 'Worked out from each day’s revenue (total sales minus tax).' },
    { id: 'per_item', label: 'Per item', unit: 'money', hint: 'An amount for every item in the order.' },
    { id: 'weight_tier', label: 'By weight', unit: 'table', hint: 'A table of parcel weights and what each costs to send.' },
    { id: 'zone', label: 'By country or zone', unit: 'table', hint: 'A table of places and what each costs to send to.' },
  ],
  product: [
    { id: 'pct_revenue', label: '% of revenue', unit: 'pct', hint: 'Worked out from each day’s revenue (total sales minus tax).' },
    { id: 'per_order', label: 'Per order', unit: 'money', hint: 'The same amount for every paid order.' },
    { id: 'per_item', label: 'Per item', unit: 'money', hint: 'An amount for every item sold.' },
  ],
};
/** The rule types Locus can work out from the daily numbers it holds today. Every other type is saved only. */
export const APPLIED = new Set(['per_order', 'pct_revenue']);
const SRC_RANK = { connection: 3, sheet: 2, typed: 1 };
const RULE_WORDS = { per_order: 'per order', pct_revenue: '% of revenue', per_item: 'per item', weight_tier: 'by weight', zone: 'by country or zone' };

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const shift = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const r2 = x => Math.round(x * 100) / 100;

/** The one rule that prices `cost` on `date`: on, a type Locus can work out today, started, not ended.
 *  Connection beats sheet beats typed, then the latest start, then the newest row. */
export function activeRule(rules, cost, date) {
  let best = null;
  for (const r of rules || []) {
    if (!r || r.cost !== cost || (r.status || 'on') !== 'on' || !APPLIED.has(r.rule)) continue;
    if (!YMD.test(r.start_date || '') || r.start_date > date || (r.end_date && r.end_date < date)) continue;
    if (!best) { best = r; continue; }
    const a = SRC_RANK[r.source] || 1, b = SRC_RANK[best.source] || 1;
    if (a > b || (a === b && (r.start_date > best.start_date || (r.start_date === best.start_date && (+r.id || 0) > (+best.id || 0))))) best = r;
  }
  return best;
}

/** -> null when nothing applies (the caller then keeps Triple Whale's number), else { shipping?, product?, src: { shipping?, product? } }.
 *  day = { sales, orders }. A per order rule on a day with no order count yields nothing for that day. */
export function ruleCosts(rules, date, day) {
  if (!rules || !rules.length) return null;
  const out = {}; let any = false;
  for (const cost of COSTS) {
    const r = activeRule(rules, cost, date); if (!r) continue;
    const a = +r.amount || 0;
    const v = r.rule === 'per_order' ? (day.orders != null ? Math.max(0, +day.orders) * a : null)
      : r.rule === 'pct_revenue' ? (day.sales != null ? Math.max(0, +day.sales) * a / 100 : null) : null;
    if (v != null) { out[cost] = v; (out.src ??= {})[cost] = r.source || 'typed'; any = true; }
  }
  return any ? out : null;
}

/** Read path. A plain SELECT, no ensure(): a missing table is simply "no rules". -> { act: [rows] } */
export async function loadCostRules(env, acts) {
  const out = Object.fromEntries((acts || []).map(a => [a, []]));
  if (!acts || !acts.length) return out;
  const ph = acts.map((_, i) => `?${i + 1}`).join(',');
  const { results } = await env.DB.prepare(`SELECT * FROM p_cost_rule WHERE act_id IN (${ph}) AND status = 'on' ORDER BY id`).bind(...acts).all().catch(() => ({ results: [] }));
  for (const r of results || []) if (out[r.act_id]) out[r.act_id].push(r);
  return out;
}

/** true when the list holds a shipping rule Locus applies on any day of [from, to]. */
export function shippingRuled(rules, from, to) {
  return (rules || []).some(r => r && r.cost === 'shipping' && (r.status || 'on') === 'on' && APPLIED.has(r.rule)
    && YMD.test(r.start_date || '') && r.start_date <= to && (!r.end_date || r.end_date >= from));
}

/** true when a product rule Locus applies is on AND the rows hold both a day with a gross profit and a day without
 *  (the rule starts inside the window, or a per order rule met a day with no order count). Summed, such a window
 *  gives the gross profit of some days minus the ad spend of all of them, so its contribution margin is withheld.
 *  A brand with no product rule is never touched: this is false and its numbers read as they always did.
 *  The rule must be IN FORCE INSIDE THE WINDOW (started by its last day, not ended before its first): a rule that ended
 *  last year, or starts next month, has no say over this window, whose gaps are then Triple Whale's own and read as
 *  they always did. The window is [from, to] when given, else the first and last day of `rows`. */
export function partlyCosted(rules, rows, gpKey = 'gross_profit', from = null, to = null) {
  let has = false, lacks = false, lo = from, hi = to;
  for (const r of rows || []) {
    if (!r) continue;
    if (r[gpKey] == null) lacks = true; else has = true;
    if (!from && r.date && (!lo || r.date < lo)) lo = r.date;
    if (!to && r.date && (!hi || r.date > hi)) hi = r.date;
  }
  if (!(has && lacks)) return false;
  return (rules || []).some(r => r && r.cost === 'product' && (r.status || 'on') === 'on' && APPLIED.has(r.rule)
    && YMD.test(r.start_date || '') && (!hi || r.start_date <= hi) && (!r.end_date || !lo || r.end_date >= lo));
}

/* ---------------- input checks ---------------- */

/** A typed amount -> a number, or NaN (never stored). "12.50" and "$1,234.50" are read: a comma is only ever a
 *  thousands mark, in full groups of three. "12,50", "4,5" and "1.234,56" (a decimal comma) are NOT guessed at. They
 *  are refused, because dropping the comma would store a cost 10 or 100 times too large. */
export function plainNumber(v, { sign = false } = {}) {
  const s = String(v ?? '').replace(/[\s$£€¥%]/g, '');
  const neg = sign && s.startsWith('-'), b = neg ? s.slice(1) : s;
  let n = NaN;
  if (/^\d+(\.\d+)?$/.test(b)) n = +b;
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(b)) n = +b.replace(/,/g, '');
  return neg ? -n : n;
}
/** true when the text reads as a number written with a decimal comma ("12,50", "1.234,56"). */
const decimalComma = v => /^-?(\d+|\d{1,3}(\.\d{3})+),\d+$/.test(String(v ?? '').replace(/[\s$£€¥%]/g, ''));
function num(v) {
  if (typeof v === 'number') return isFinite(v) && v >= 0 ? v : NaN;
  return plainNumber(v);
}

/** Check one incoming rule; returns [error] or [null, clean]. `fixed` = { cost, rule } of the stored row when editing. */
export function cleanRule(x, fixed) {
  const cost = fixed ? fixed.cost : String(x?.cost || '');
  if (!COSTS.includes(cost)) return ['Pick which cost this is: shipping or product.'];
  const rule = fixed ? fixed.rule : String(x?.rule || '');
  const def = RULES[cost].find(r => r.id === rule);
  if (!def) return [`That kind of rule cannot be used for ${cost} cost.`];
  let amount = null, table = null;
  if (def.unit === 'table') {
    const rows = Array.isArray(x?.table) ? x.table : null;
    const max = rule === 'zone' ? 60 : 40;
    if (!rows || !rows.length || rows.length > max) return [`The table needs between 1 and ${max} rows.`];
    if (rule === 'weight_tier') {
      const t = rows.map(r => ({ min: num(r?.min), max: num(r?.max), amount: num(r?.amount) }));
      for (const r of t) {
        if (isNaN(r.min) || isNaN(r.max) || isNaN(r.amount)) return ['Every row of the weight table needs a from, a to and a cost, as numbers.'];
        if (!(r.min < r.max)) return ['In the weight table, each row’s "from" must be below its "to".'];
        if (r.amount > 1e7) return ['A cost in the weight table is too large.'];
      }
      t.sort((a, b) => a.min - b.min);
      for (let i = 1; i < t.length; i++) if (t[i].min < t[i - 1].max) return ['Two rows of the weight table overlap.'];
      table = t;
    } else {
      const seen = new Set(); table = [];
      for (const r of rows) {
        const zone = String(r?.zone || '').trim(), a = num(r?.amount);
        if (!zone || zone.length > 40) return ['Every row of the table needs a place name of 1 to 40 characters.'];
        if (isNaN(a) || a > 1e7) return [`${zone}: the cost is not a number.`];
        if (seen.has(zone.toLowerCase())) return [`${zone} is in the table twice.`];
        seen.add(zone.toLowerCase()); table.push({ zone, amount: a });
      }
    }
  } else {
    amount = num(x?.amount);
    if (isNaN(amount)) return [typeof x?.amount === 'string' && decimalComma(x.amount) ? 'Write the amount with a point, like 4.50.' : 'The amount is not a number.'];
    if (def.unit === 'pct' && amount > 100) return ['A percentage cannot be more than 100.'];
    if (amount > 1e7) return ['That amount is too large.'];
  }
  const start = String(x?.start_date || '').trim();
  if (!YMD.test(start)) return ['Pick the date this rule starts.'];
  const end = String(x?.end_date || '').trim() || null;
  if (end && (!YMD.test(end) || end < start)) return ['The end date is before the start.'];
  return [null, { cost, rule, amount, table_json: table ? JSON.stringify(table) : null, start_date: start, end_date: end,
    status: x?.status === 'off' ? 'off' : 'on', label: String(x?.label || '').trim().slice(0, 80) || null, notes: String(x?.notes || '').trim().slice(0, 300) || null }];
}

const SKU_HEADS = new Set(['sku', 'variant sku']), COST_HEADS = new Set(['cost', 'unit cost', 'cost per item', 'cogs']), TITLE_HEADS = new Set(['title', 'name', 'product']);
const head = s => String(s || '').toLowerCase().replace(/[_\s]+/g, ' ').trim();

/** Split delimited text into records of fields, quotes and doubled quotes handled. -> [{ line, cells }] */
function records(text, sep) {
  const out = []; let cells = [], cur = '', q = false, line = 1, start = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else { if (c === '\n') line++; cur += c; }
    } else if (c === '"' && cur === '') q = true;
    else if (c === sep) { cells.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      cells.push(cur); out.push({ line: start, cells }); cells = []; cur = ''; line++; start = line;
    } else cur += c;
  }
  if (cur !== '' || cells.length) { cells.push(cur); out.push({ line: start, cells }); }
  return out.filter(r => r.cells.some(c => c.trim() !== ''));
}

/** Read a product cost sheet. Pure. -> { rows: [{line, sku, title, unit_cost}], errors: [{line, reason}], duplicates, refused? }
 *  `refused` is set (and rows is empty) when the whole sheet is turned away: too big, or a needed column is missing. */
export function parseSheet(csv) {
  const out = { rows: [], errors: [], duplicates: 0 };
  const refuse = reason => { out.rows = []; out.refused = reason; out.errors = [{ line: 1, reason }]; return out; };
  let text = String(csv ?? '');
  if (text.length > 300 * 1024) return refuse('That file is too big. A cost sheet can be up to 300 KB.');
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const first = text.split(/\r?\n/).find(l => l.trim() !== '') || '';
  const count = ch => { let n = 0, q = false; for (const c of first) { if (c === '"') q = !q; else if (c === ch && !q) n++; } return n; };
  const sep = [',', ';', '\t'].map(ch => [ch, count(ch)]).sort((a, b) => b[1] - a[1])[0][0];
  const recs = records(text, sep);
  if (!recs.length) return refuse('The sheet is empty.');
  const heads = recs[0].cells.map(head);
  const iSku = heads.findIndex(h => SKU_HEADS.has(h)), iCost = heads.findIndex(h => COST_HEADS.has(h)), iTitle = heads.findIndex(h => TITLE_HEADS.has(h));
  if (iSku < 0 || iCost < 0) return refuse(`The sheet needs a ${iSku < 0 ? 'SKU' : 'cost'} column. Name the columns "SKU" and "Cost".`);
  const data = recs.slice(1);
  if (data.length > 2000) return refuse('That sheet has more than 2,000 rows. Split it into smaller sheets.');
  const by = new Map();
  for (const r of data) {
    const sku = String(r.cells[iSku] ?? '').trim();
    if (!sku) { out.errors.push({ line: r.line, reason: 'No SKU on this row.' }); continue; }
    if (sku.length > 80) { out.errors.push({ line: r.line, reason: 'The SKU is longer than 80 characters.' }); continue; }
    const raw = String(r.cells[iCost] ?? '').replace(/[\s$£€¥]/g, '');
    if (!raw) { out.errors.push({ line: r.line, reason: `${sku}: no cost on this row.` }); continue; }
    const cost = plainNumber(raw, { sign: true });
    if (isNaN(cost)) { out.errors.push({ line: r.line, reason: decimalComma(raw) ? `${sku}: write the cost with a point, like 12.50.` : `${sku}: the cost is not a number.` }); continue; }
    if (cost < 0) { out.errors.push({ line: r.line, reason: `${sku}: the cost is below zero.` }); continue; }
    if (cost > 1e6) { out.errors.push({ line: r.line, reason: `${sku}: that cost is too large.` }); continue; }
    if (by.has(sku)) out.duplicates++;
    by.set(sku, { line: r.line, sku, title: iTitle >= 0 ? String(r.cells[iTitle] ?? '').trim().slice(0, 200) || null : null, unit_cost: cost });
  }
  out.rows = [...by.values()];
  return out;
}

/* ---------------- the page ---------------- */

/** What a client or teammate may see of one rule: never an email. */
const ruleView = r => ({ id: r.id, rule: r.rule, source: r.source || 'typed', amount: r.amount ?? null,
  ...(r.table_json ? { table: (() => { try { return JSON.parse(r.table_json); } catch { return []; } })() } : {}),
  start_date: r.start_date, end_date: r.end_date || null, status: r.status || 'on', applied: APPLIED.has(r.rule),
  label: r.label || '', notes: r.notes || '', added_by: r.created_name || nameOf(r.created_by) || null });

/** Everything the Costs page needs beyond the old diagnostic keys. `sources()` = worker.js costSources (the last 30
 *  whole days, the numbers profit actually used); `rows` = the day rows the caller already holds (cost check window). */
export async function costsPage(env, acct, { sources, rows = [] } = {}) {
  await ensure(env);
  const act = acct.act_id, currency = acct.currency || 'USD';
  const src = (sources ? await sources().catch(() => null) : null) || {};
  const to = YMD.test(src.to || '') ? src.to : shift(new Date().toISOString().slice(0, 10), -1), from = YMD.test(src.from || '') ? src.from : shift(to, -29);
  const today = shift(to, 1), monthStart = today.slice(0, 8) + '01';
  const [exp, ruleRows, sheet, skuN, tw] = await Promise.all([
    env.DB.prepare(`SELECT * FROM p_expense WHERE act_id = ?1 ORDER BY start_date DESC, id`).bind(act).all().then(r => r.results || []).catch(() => []),
    env.DB.prepare(`SELECT * FROM p_cost_rule WHERE act_id = ?1 ORDER BY start_date DESC, id DESC`).bind(act).all().then(r => r.results || []).catch(() => []),
    env.DB.prepare(`SELECT batch, COUNT(*) AS skus, MAX(start_date) AS start_date, MAX(filename) AS filename, MAX(uploaded_name) AS uploaded_name, MAX(uploaded_at) AS uploaded_at
      FROM p_product_cost WHERE act_id = ?1 GROUP BY batch ORDER BY MAX(uploaded_at) DESC, MAX(start_date) DESC LIMIT 1`).bind(act).first().catch(() => null),
    env.DB.prepare(`SELECT COUNT(DISTINCT sku) AS n FROM p_product_cost WHERE act_id = ?1`).bind(act).first().catch(() => null),
    env.DB.prepare(`SELECT metric, SUM(value) AS v FROM tw_daily WHERE act_id = ?1 AND date >= ?2 AND date <= ?3 AND metric IN ('totalShippingCosts','totalProductCosts') GROUP BY metric`)
      .bind(act, from, to).all().then(r => Object.fromEntries((r.results || []).map(x => [x.metric, x.v]))).catch(() => ({})),
  ]);
  const win = (rows || []).filter(r => r && r.date >= from && r.date <= to);
  const on = ruleRows.filter(r => (r.status || 'on') === 'on');
  const current = cost => on.filter(r => r.cost === cost && (!r.end_date || r.end_date >= today));
  const live = cost => activeRule(on, cost, today);
  const margin = src.margin_pct ?? null;
  const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n || 0);

  const fixedOn = activeIn(exp, monthStart, today);
  const mtdRows = (rows || []).filter(r => r && r.date >= monthStart && r.date <= to);
  const shipLive = live('shipping'), prodLive = live('product');
  const twShip = tw.totalShippingCosts ?? null, twCogs = tw.totalProductCosts ?? null;
  const shipUse = shipLive ? { source: 'locus', rule_id: shipLive.id } : twShip > 0 ? { source: 'triple_whale' } : { source: 'none' };
  const prodUse = margin != null ? { source: 'flat_margin' } : prodLive ? { source: 'locus', rule_id: prodLive.id } : twCogs != null ? { source: 'triple_whale' } : { source: 'none' };

  const missing = [], known = YMD.test(src.to || '');   // no last-30 read = say nothing about it
  if (!fixedOn.length) missing.push('No fixed costs entered, so net profit cannot be shown. Add rent, team, software or any fee you pay.');
  const shipRuled = shippingRuled(on, from, today);
  if (known && (src.ship_rev || 0) > 0 && !((twShip || 0) > 0) && !shipRuled)
    missing.push(`No shipping cost: customers paid ${money(src.ship_rev)} for delivery in the last 30 days and nothing is counted against it. Add what an order costs to ship.`);
  const prodRuled = on.some(r => r.cost === 'product' && APPLIED.has(r.rule) && r.start_date <= today && (!r.end_date || r.end_date >= from));
  if (known && src.cogs == null && !prodRuled && margin == null)
    missing.push('No product cost: add what your products cost, as a percent of revenue or per order, or upload a cost sheet.');
  if (known && src.fees == null) missing.push('No payment fees counted. They come from Triple Whale today; set them there.');
  for (const cost of COSTS) {
    const cur = current(cost);
    /* A saved-only rule never ends the rule in use (see the PUT below), so both can be current at once. */
    const savedOnly = cur.filter(r => !APPLIED.has(r.rule)), inUse = live(cost);
    if (savedOnly.length && inUse && (cost === 'shipping' ? shipUse.source : prodUse.source) === 'locus')
      missing.push(`Your ${cost} cost rule (${RULE_WORDS[savedOnly[0].rule] || savedOnly[0].rule}) is saved. It will be used once Locus reads each order’s items, weight and country. Until then your ${RULE_WORDS[inUse.rule] || inUse.rule} rule stays in use.`);
    if (cur.length && !cur.some(r => APPLIED.has(r.rule))) {
      const use = cost === 'shipping' ? shipUse.source : prodUse.source;
      const until = use === 'triple_whale' ? 'Triple Whale’s number is used' : use === 'flat_margin' ? 'the flat margin is used' : `no ${cost} cost is counted`;
      missing.push(`Your ${cost} cost rule (${RULE_WORDS[cur[0].rule] || cur[0].rule}) is saved. It will be used once Locus reads each order’s items, weight and country. Until then ${until}.`);
    }
    const blind = win.filter(r => r.orders == null && activeRule(on, cost, r.date)?.rule === 'per_order').length;
    if (blind > 0) missing.push(`${blind} day${blind === 1 ? '' : 's'} had no order count, so the per order ${cost} rule could not be used on ${blind === 1 ? 'it' : 'them'}.`);
  }
  if (sheet && sheet.skus > 0) missing.push(`Your cost sheet (${sheet.skus} product${sheet.skus === 1 ? '' : 's'}) is saved. It is not used in profit yet: that needs each order’s items.`);
  if (margin != null && on.length) missing.push(`A flat margin of ${Math.round(margin * 100)}% is set, so profit uses that. The rules below are shown for reference.`);

  return {
    currency,
    fixed: { items: exp.map(expenseView), active: fixedOn.length, month_total: spread(exp, monthStart, to, mtdRows).total, categories: CATEGORIES,
      brand_categories: brandCategories(exp), kinds: KINDS },
    shipping_rules: { rules: ruleRows.filter(r => r.cost === 'shipping').map(ruleView), in_use: shipUse,
      last30: { from, to, tw: twShip != null ? r2(twShip) : null, used: src.ship_cost != null ? r2(src.ship_cost) : null, charged: src.ship_rev != null ? r2(src.ship_rev) : null, orders: src.orders ?? null } },
    product_cost: { rules: ruleRows.filter(r => r.cost === 'product').map(ruleView), in_use: prodUse,
      sheet: sheet && sheet.skus > 0 ? { batch: sheet.batch, skus: sheet.skus, start_date: sheet.start_date, filename: sheet.filename || null, uploaded_by: sheet.uploaded_name || null, uploaded_at: sheet.uploaded_at || null, applied: false } : null,
      coverage: { days: win.length, days_with_cost: win.filter(r => r.cogs != null).length, skus_on_file: skuN?.n || 0 },
      last30: { tw: twCogs != null ? r2(twCogs) : null, used: src.cogs != null ? r2(src.cogs) : null } },
    payment_fees: { source: src.fees != null ? 'triple_whale' : 'none', last30: src.fees != null ? r2(src.fees) : 0, editable: false },
    handling: { source: (src.handling || 0) > 0 ? 'triple_whale' : 'none', last30: r2(src.handling || 0) },
    margin_override: margin,
    choices: { costs: COSTS, rules: RULES, applied_today: [...APPLIED] },
    missing,
  };
}

/* ---------------- the writes ---------------- */

/** ctx: { path, url, request, env, json, accountsFor, email, client (clientScope or null),
 *         rehealth(acct) -> { rows } (re-grade the cost check and store it), page(acct, rows) -> costsPage }.
 *  GET /api/costs stays in worker.js; this handles the writes. */
export async function handleCosts({ path, url, request, env, json, accountsFor, email, client, rehealth, page, only }) {
  const isSheet = path.endsWith('/costs/sheet');
  if (!isSheet && !path.endsWith('/api/costs')) return null;
  await ensure(env);
  const brandOk = async act => {
    if (!act || act === 'all') return null;
    const acct = (await accountsFor()).find(a => a.act_id === act);
    if (!acct) return null;
    if (client && !(client.ids && client.ids.has(act))) return null;   // brandguard already refused; belt and braces
    /* `only` = the signed-in person's brands (brandguard brandsFor), null when not limited. brandguard reads a body's
       act only when the request says it is JSON; these writes reprice a brand, so the check is repeated here and does
       not depend on the Content-Type. */
    if (only && !only.has(act)) return null;
    return acct;
  };
  const me = email || null, myName = (client && client.name) || nameOf(email) || 'Mobius';
  const done = async (acct, extra = {}) => {
    const r = rehealth ? await rehealth(acct).catch(() => null) : null;
    return json({ ok: true, ...extra, ...(page ? await page(acct, r?.rows || []) : {}) });
  };

  if (isSheet) {
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    const b = await request.json().catch(() => ({}));
    const acct = await brandOk(String(b.act || ''));
    if (!acct) return json({ error: 'unknown brand' }, 404);
    const dry = b.dry_run !== false;
    const start = String(b.start_date || '').trim();
    if (!YMD.test(start)) return json({ error: 'Pick the date these costs start.' }, 400);
    const p = parseSheet(b.csv);
    if (p.refused) return json({ error: p.refused }, 400);
    const note = 'Saved costs are not used in profit yet: that needs each order’s items.';
    const ans = { ok: p.rows.length > 0, dry_run: dry, rows_read: p.rows.length + p.errors.length + p.duplicates, rows_ok: p.rows.length, rows: p.rows.slice(0, 50),
      errors: p.errors.slice(0, 100), duplicates: p.duplicates, start_date: start, applied: false, note };
    if (dry) return json(ans);
    if (!p.rows.length) return json({ ...ans, error: 'No row of that sheet could be read.' }, 400);
    const batch = crypto.randomUUID(), filename = String(b.filename || '').trim().slice(0, 120) || null;
    for (let i = 0; i < p.rows.length; i += 100) {
      await env.DB.batch(p.rows.slice(i, i + 100).map(r => env.DB.prepare(`INSERT INTO p_product_cost (act_id, sku, title, unit_cost, start_date, source, batch, filename, uploaded_by, uploaded_name, uploaded_at)
        VALUES (?1, ?2, ?3, ?4, ?5, 'sheet', ?6, ?7, ?8, ?9, datetime('now'))
        ON CONFLICT(act_id, sku, start_date) DO UPDATE SET title = excluded.title, unit_cost = excluded.unit_cost, source = excluded.source, batch = excluded.batch,
          filename = excluded.filename, uploaded_by = excluded.uploaded_by, uploaded_name = excluded.uploaded_name, uploaded_at = excluded.uploaded_at`)
        .bind(acct.act_id, r.sku, r.title, r.unit_cost, start, batch, filename, me, myName)));
    }
    return json({ ...ans, batch });
  }

  if (request.method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    const acct = await brandOk(String(b.act || ''));
    if (!acct) return json({ error: 'unknown brand' }, 404);
    const x = b.rule || {};
    const id = Number.isInteger(+x.id) && +x.id > 0 ? +x.id : null;
    if (id != null) {
      const old = await env.DB.prepare(`SELECT id, cost, rule FROM p_cost_rule WHERE id = ?1 AND act_id = ?2`).bind(id, acct.act_id).first();
      if (!old) return json({ error: 'That rule was not found.' }, 404);   // an id from another brand changes nothing
      const [err, c] = cleanRule(x, old);
      if (err) return json({ error: err }, 400);
      await env.DB.prepare(`UPDATE p_cost_rule SET amount = ?3, table_json = ?4, start_date = ?5, end_date = ?6, status = ?7, label = ?8, notes = ?9, updated_by = ?10, updated_at = datetime('now')
        WHERE id = ?1 AND act_id = ?2`).bind(id, acct.act_id, c.amount, c.table_json, c.start_date, c.end_date, c.status, c.label, c.notes, me).run();
      return done(acct);
    }
    const [err, c] = cleanRule(x);
    if (err) return json({ error: err }, 400);
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM p_cost_rule WHERE act_id = ?1`).bind(acct.act_id).first();
    if ((n?.n || 0) >= 40) return json({ error: 'A brand can hold up to 40 cost rules. Remove an old one first.' }, 400);
    const stmts = [];
    if (c.status === 'on' && !c.end_date) {
      /* A new rule ends the open rule OF ITS OWN KIND only: a rule Locus applies replaces the applied one, a saved-only
         rule (per item, by weight, by zone) replaces a saved-only one. A saved-only rule must never end the rule that
         prices the brand today, or shipping and product cost would fall back to Triple Whale without anyone asking. */
      const open = await env.DB.prepare(`SELECT id, start_date, rule FROM p_cost_rule WHERE act_id = ?1 AND cost = ?2 AND end_date IS NULL AND status = 'on' ORDER BY start_date DESC, id DESC`).bind(acct.act_id, c.cost).all();
      for (const o of open.results || []) {
        if (APPLIED.has(o.rule) !== APPLIED.has(c.rule)) continue;
        if (o.start_date >= c.start_date) return json({ error: 'A rule already starts on or after that date. Edit or remove it first.' }, 400);
        stmts.push(env.DB.prepare(`UPDATE p_cost_rule SET end_date = ?3, updated_by = ?4, updated_at = datetime('now') WHERE id = ?1 AND act_id = ?2`).bind(o.id, acct.act_id, shift(c.start_date, -1), me));
      }
    }
    stmts.push(env.DB.prepare(`INSERT INTO p_cost_rule (act_id, cost, rule, source, amount, table_json, start_date, end_date, status, label, notes, created_by, created_name, updated_by)
      VALUES (?1, ?2, ?3, 'typed', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?11)`)
      .bind(acct.act_id, c.cost, c.rule, c.amount, c.table_json, c.start_date, c.end_date, c.status, c.label, c.notes, me, myName));
    await env.DB.batch(stmts);
    return done(acct);
  }

  if (request.method === 'DELETE') {
    const acct = await brandOk(url.searchParams.get('act') || '');
    if (!acct) return json({ error: 'unknown brand' }, 404);
    const sheet = url.searchParams.get('sheet'), id = +url.searchParams.get('id');
    let r;
    if (sheet) r = await env.DB.prepare(`DELETE FROM p_product_cost WHERE act_id = ?1 AND batch = ?2`).bind(acct.act_id, sheet).run();
    else if (Number.isInteger(id) && id > 0) r = await env.DB.prepare(`DELETE FROM p_cost_rule WHERE id = ?1 AND act_id = ?2`).bind(id, acct.act_id).run();
    else return json({ error: 'Say which rule to remove.' }, 400);
    if (!(r?.meta?.changes > 0)) return json({ error: 'Nothing was found to remove.' }, 404);
    return done(acct);
  }
  return json({ error: 'method not allowed' }, 405);
}
