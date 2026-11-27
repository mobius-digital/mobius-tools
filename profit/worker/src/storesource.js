/**
 * WHERE STORE NUMBERS COME FROM (2026-11-26, Cole): sales, orders, AOV, refunds, new vs returning customers and the
 * sales side of MER come from SHOPIFY, through Locus's own Shopify app (shopsync.js -> p_shop_daily). Triple Whale stays
 * for attribution only (which channel, campaign or ad gets the credit) and for what Shopify does not hold (ad spend,
 * product and shipping costs, the email tool's figures, the new vs returning REVENUE split).
 *
 * The switch works on the tracker pivot every screen already reads ({ metric: { date: value } }): when the brand's
 * Shopify days cover the window, the store metrics in the pivot are replaced by Shopify's, so dayEconomics, the hub
 * rolls, the brief and the reports keep their one formula and simply see Shopify's figures. When they do not cover it,
 * the pivot is left exactly as it was: today's numbers, byte for byte, plus a source label.
 *
 *   covered = every day from `from` to the earlier of `to` and yesterday (the brand's own time zone) has a Shopify row
 *             with money, paid orders read order by order (orders_source 'orders'), the money stamped (synced_at) AND
 *             the orders stamped (orders_at) after that day ended (so a day synced at 10pm is not taken as the whole
 *             day, and a later run that rewrote the money but whose orders pass failed does not pass a mid-day count).
 *             Today's row is used when there is one.
 *   Any gap: the whole window stays Triple Whale. Never a window half from one source and half from the other.
 *
 * Per-brand setting `storeSource:<brand>` in `settings`: 'auto' (default) | 'tw' (always Triple Whale) |
 * 'shopify' (always Shopify: a day Shopify does not have reads as missing, never as Triple Whale's).
 *
 * The same rules live in account-health (it imports this file) and in the engine (engine/worker/src/metrics/
 * storesource.js, a copy of the pure part). Tests: node test-storesource.mjs.
 */

export const STORE_MODES = ['auto', 'tw', 'shopify'];
export const storeSettingKey = act => `storeSource:${act}`;
export const storeMode = v => (STORE_MODES.includes(v) ? v : 'auto');

/* The tracker metrics Shopify replaces. Everything else in the pivot (spend, costs, email, the new vs returning revenue
   split) stays Triple Whale's. */
export const SHOP_METRICS = ['netSales', 'totalSales', 'totalNetTaxes', 'totalTaxes', 'totalShippingPrice',
  'totalNewGrossSales', 'totalRefunds', 'totalOrders', 'newCustomersOrders'];

export const SHOP_COLS = 'act_id, day, sales, total_sales, taxes, shipping, gross_sales, refunds, orders, new_orders, returning_orders, zero_orders, orders_source, synced_at, orders_at';

const pad = n => String(n).padStart(2, '0');
export function addDay(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

/** The calendar day of an instant in a time zone (YYYY-MM-DD). */
export function localDay(tz, nowMs = Date.now()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs));
  } catch { return new Date(nowMs).toISOString().slice(0, 10); }
}

/* Wall clock of an instant in a time zone, read back as if it were UTC (ms). */
function wallMs(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

/** When store day `day` ended, in UTC, as a D1 stamp ('YYYY-MM-DD HH:MM:SS'): the next local midnight. */
export function dayEndStamp(day, tz) {
  const guess = Date.parse(addDay(day, 1) + 'T00:00:00Z');
  let ms = guess;
  try {
    ms = guess - (wallMs(guess, tz || 'UTC') - guess);
    ms = guess - (wallMs(ms, tz || 'UTC') - ms);          // once more across a clock change
  } catch { ms = guess; }
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/* A row has the day's money: ShopifyQL gave it, or the orders list read the day and found no order (ShopifyQL can
   leave a day with no sales out of its answer). */
const hasMoney = r => !!r && (r.sales != null || (r.orders_source === 'orders' && !(+r.orders > 0)));
/* A whole day of store numbers: money, paid orders counted order by order, both stamped after the day ended. The
   orders have their own stamp (orders_at): synced_at moves on every money write, even when the orders pass failed. */
const stampOf = v => String(v || '').replace('T', ' ');
export function dayComplete(r, day, tz) {
  if (!hasMoney(r) || r.orders_source !== 'orders' || r.orders == null) return false;
  const end = dayEndStamp(day, tz);
  return stampOf(r.synced_at) >= end && stampOf(r.orders_at) >= end;
}

/** Does Shopify cover [from, to] for one brand? rows = that brand's p_shop_daily rows. */
export function shopCoverage(rows, from, to, { tz = 'UTC', now = Date.now() } = {}) {
  const by = Object.fromEntries((rows || []).map(r => [r.day, r]));
  const today = localDay(tz, now);
  const last = to < today ? to : addDay(today, -1);
  let need = 0, first = null, gaps = 0;
  for (let d = from; d <= last; d = addDay(d, 1)) {
    need++;
    if (!dayComplete(by[d], d, tz)) { gaps++; first ??= d; }
  }
  const todayRow = to >= today && from <= today && hasMoney(by[today]);
  return { ok: gaps === 0 && (need > 0 || todayRow), need, gaps, first_missing: first, rows: (rows || []).length, today };
}

/** Which source a window reads. mode = the brand setting. Returns { source, mode, label, reason, first_missing }. */
export function decideStore(mode, rows, from, to, opts = {}) {
  const m = storeMode(mode);
  const cov = shopCoverage(rows, from, to, opts);
  let source, reason;
  if (m === 'tw') { source = 'triple_whale'; reason = 'set'; }
  else if (m === 'shopify') { source = 'shopify'; reason = cov.ok ? 'covered' : 'set'; }
  else if (cov.ok) { source = 'shopify'; reason = 'covered'; }
  else { source = 'triple_whale'; reason = cov.rows ? 'partial' : 'not_synced'; }
  return { source, mode: m, reason, label: storeLabel(source, reason), first_missing: cov.ok ? null : cov.first_missing };
}

/** The plain line every screen shows. */
export function storeLabel(source, reason) {
  if (source === 'shopify') return reason === 'set' ? 'Store numbers: Shopify (set in brand settings; days Shopify has not synced are missing)' : 'Store numbers: Shopify';
  if (reason === 'set') return 'Store numbers: Triple Whale (set in brand settings)';
  if (reason === 'partial') return 'Store numbers: Triple Whale (Shopify not synced for every day yet)';
  return 'Store numbers: Triple Whale (Shopify not synced yet)';
}

/** The two keys a payload carries. */
export const storeTag = d => ({ store_source: d ? d.source : 'triple_whale', store_label: d ? d.label : storeLabel('triple_whale', 'not_synced') });

/**
 * Put Shopify's store figures into a tracker pivot for [from, to] (mutates and returns piv). Every store metric of every
 * day in the window is replaced: a day Shopify has no row for reads as missing, never as Triple Whale's.
 *   netSales = total_sales (Triple Whale's netSales IS Shopify total sales: shipping and tax inside, net of returns)
 *   totalSales = total_sales + refunds (Triple Whale's "order revenue", before returns)
 *   totalNetTaxes = totalTaxes = taxes, totalShippingPrice = shipping, totalNewGrossSales = gross_sales,
 *   totalRefunds = refunds, totalOrders = PAID orders, newCustomersOrders = first paid orders.
 * So sales = netSales - totalNetTaxes = Shopify total sales minus tax, the one revenue definition.
 */
export function overlayShopify(piv, rows, from, to) {
  const by = Object.fromEntries((rows || []).map(r => [r.day, r]));
  const set = (m, d, v) => { (piv[m] ??= {})[d] = v; };
  for (let d = from; d <= to; d = addDay(d, 1)) {
    for (const m of SHOP_METRICS) if (piv[m]) delete piv[m][d];
    const r = by[d];
    if (!hasMoney(r)) continue;
    const z = v => (v == null ? 0 : +v);
    set('netSales', d, z(r.total_sales));
    set('totalSales', d, z(r.total_sales) + z(r.refunds));
    set('totalNetTaxes', d, z(r.taxes));
    set('totalTaxes', d, z(r.taxes));
    set('totalShippingPrice', d, z(r.shipping));
    set('totalNewGrossSales', d, z(r.gross_sales));
    set('totalRefunds', d, z(r.refunds));
    if (r.orders_source === 'orders' && r.orders != null) {
      set('totalOrders', d, +r.orders);
      if (r.new_orders != null) set('newCustomersOrders', d, +r.new_orders);   // not read: missing, never 0
    }
  }
  return piv;
}

const inList = (n, start) => Array.from({ length: n }, (_, i) => `?${i + start}`).join(',');

/**
 * Read what the switch needs for some brands: their Shopify days in [from, to], their setting and their time zone.
 * accts = [{ act_id, tz }] or brand ids (the time zone is then read). Two or three light reads, one after another;
 * a missing table (before the first sync) reads as no rows.
 */
export async function readShop(env, accts, from, to) {
  const list = (accts || []).map(a => (typeof a === 'string' ? { act_id: a } : a)).filter(a => a && a.act_id);
  const acts = [...new Set(list.map(a => a.act_id))];
  const out = { rows: {}, modes: {}, tz: {} };
  if (!acts.length || !env?.DB) return out;
  for (const a of list) if (a.tz) out.tz[a.act_id] = a.tz;
  const { results: rows } = await env.DB.prepare(
    `SELECT ${SHOP_COLS} FROM p_shop_daily WHERE act_id IN (${inList(acts.length, 3)}) AND day BETWEEN ?1 AND ?2`,
  ).bind(from, to, ...acts).all().catch(() => ({ results: [] }));
  for (const r of rows || []) (out.rows[r.act_id] ??= []).push(r);
  const { results: sets } = await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (${inList(acts.length, 1)})`)
    .bind(...acts.map(storeSettingKey)).all().catch(() => ({ results: [] }));
  for (const s of sets || []) out.modes[s.key.slice('storeSource:'.length)] = storeMode(s.value);
  const noTz = acts.filter(a => !out.tz[a]);
  if (noTz.length && (rows || []).length) {
    const { results: tzs } = await env.DB.prepare(`SELECT act_id, tz FROM brand_accounts WHERE act_id IN (${inList(noTz.length, 1)})`)
      .bind(...noTz).all().catch(() => ({ results: [] }));
    for (const t of tzs || []) out.tz[t.act_id] = t.tz;
  }
  return out;
}

/**
 * The switch for many brands at once. pivs = { brand: pivot } (mutated where Shopify wins).
 * Returns { brand: decision }. opts.now for tests.
 */
export async function storeSwitchMany(env, accts, pivs, from, to, opts = {}) {
  const shop = opts.shop || await readShop(env, accts, from, to);
  const out = {};
  for (const a of accts || []) {
    const act = typeof a === 'string' ? a : a.act_id;
    const tz = (typeof a === 'object' && a.tz) || shop.tz[act] || 'UTC';
    const d = decideStore(shop.modes[act], shop.rows[act] || [], from, to, { tz, now: opts.now ?? Date.now() });
    if (d.source === 'shopify') overlayShopify((pivs[act] ??= {}), shop.rows[act] || [], from, to);
    out[act] = d;
  }
  return out;
}

/** The switch for one brand's pivot. acct = { act_id, tz } or a brand id. Returns the decision. */
export async function storeSwitch(env, acct, piv, from, to, opts = {}) {
  const act = typeof acct === 'string' ? acct : acct.act_id;
  return (await storeSwitchMany(env, [acct], { [act]: piv }, from, to, opts))[act];
}

/* Remember which source a pivot was built from, without adding a key anything iterates. */
const SOURCE = new WeakMap();
export const markSource = (piv, d) => { if (piv && typeof piv === 'object') SOURCE.set(piv, d); return piv; };
export const sourceOf = piv => (piv && SOURCE.get(piv)) || null;

/* What storeDaily reads from the tracker when Shopify does not cover the window. */
const TW_STORE = ['netSales', 'totalSales', 'totalNetTaxes', 'totalShippingPrice', 'totalRefunds', 'totalOrders', 'newCustomersOrders'];

/**
 * storeDaily(env, acct, from, to): the store's daily totals from the source the switch picks.
 * Returns { source, label, mode, days: [{ date, sales, total_sales, tax, shipping, refunds, orders, new_orders }] }.
 * sales = total sales minus tax. orders = paid orders when the source is Shopify, Triple Whale's count otherwise.
 */
export async function storeDaily(env, acct, from, to, opts = {}) {
  const act = typeof acct === 'string' ? acct : acct.act_id;
  const { results } = await env.DB.prepare(
    `SELECT date, metric, value FROM tw_daily WHERE act_id = ?1 AND date BETWEEN ?2 AND ?3 AND metric IN (${inList(TW_STORE.length, 4)})`,
  ).bind(act, from, to, ...TW_STORE).all().catch(() => ({ results: [] }));
  const piv = {};
  for (const r of results || []) (piv[r.metric] ??= {})[r.date] = r.value;
  const d = await storeSwitch(env, acct, piv, from, to, opts);
  const days = [];
  for (let day = from; day <= to; day = addDay(day, 1)) {
    const total = piv.netSales?.[day] ?? piv.totalSales?.[day];
    if (total == null) continue;
    const tax = piv.totalNetTaxes?.[day] ?? 0;
    days.push({ date: day, sales: total - tax, total_sales: total, tax, shipping: piv.totalShippingPrice?.[day] ?? null,
      refunds: piv.totalRefunds?.[day] ?? null, orders: piv.totalOrders?.[day] ?? null, new_orders: piv.newCustomersOrders?.[day] ?? null });
  }
  return { ...storeTag(d), mode: d.mode, days };
}
