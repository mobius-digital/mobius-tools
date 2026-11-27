/* Where a brand's store numbers come from (2026-11-26, Cole): sales, orders, refunds and new against
   returning customers from Shopify through Locus's own Shopify app (p_shop_daily); the tracker (Triple
   Whale) stays for ad credit, spend, costs, email and the new against returning money split.
   The switch works on the tracker rows a window already holds: when the brand's Shopify days cover the
   window, its store metrics are replaced by Shopify's, so the day model keeps its one formula. When they
   do not cover it, the rows are left exactly as they were, plus a source label.
   Covered: every day from `from` to the earlier of `to` and yesterday (the brand's time zone) has a
   Shopify row with money, paid orders read order by order, and both the money (synced_at) and the orders
   (orders_at) stamped after that day ended.
   Setting `storeSource:<brand>`: auto (default), tw (always the tracker), shopify (always Shopify).
   Nothing here reads the database. */
// from profit/worker/src/storesource.js (decideStore, overlayShopify, storeLabel, storeTag, shopCoverage)
import { addDays, dayIn } from '../platform/time.js';

export const STORE_MODES = ['auto', 'tw', 'shopify'];
export const storeMode = v => (STORE_MODES.includes(v) ? v : 'auto');

/* The tracker metrics Shopify replaces. */
export const SHOP_METRICS = ['netSales', 'totalSales', 'totalNetTaxes', 'totalTaxes', 'totalShippingPrice',
  'totalNewGrossSales', 'totalRefunds', 'totalOrders', 'newCustomersOrders'];

const pad = n => String(n).padStart(2, '0');

/* Wall clock of an instant in a time zone, read back as if it were UTC (ms). */
function wallMs(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

/** When store day `day` ended, in UTC, as a database stamp: the next local midnight. */
export function dayEndStamp(day, tz) {
  const guess = Date.parse(`${addDays(day, 1)}T00:00:00Z`);
  let ms = guess;
  try {
    ms = guess - (wallMs(guess, tz || 'UTC') - guess);
    ms = guess - (wallMs(ms, tz || 'UTC') - ms);
  } catch { ms = guess; }
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

const hasMoney = r => !!r && (r.sales != null || (r.orders_source === 'orders' && !(+r.orders > 0)));
const stampOf = v => String(v || '').replace('T', ' ');
const dayComplete = (r, day, tz) => hasMoney(r) && r.orders_source === 'orders' && r.orders != null
  && stampOf(r.synced_at) >= dayEndStamp(day, tz) && stampOf(r.orders_at) >= dayEndStamp(day, tz);

function localToday(tz, now) {
  try { return dayIn(tz || 'UTC', new Date(now)); } catch { return new Date(now).toISOString().slice(0, 10); }
}

/** Does Shopify cover [from, to] for one brand? */
export function shopCoverage(rows, from, to, { tz = 'UTC', now = Date.now() } = {}) {
  const by = Object.fromEntries((rows || []).map(r => [r.day, r]));
  const today = localToday(tz, now);
  const last = to < today ? to : addDays(today, -1);
  let need = 0, first = null, gaps = 0;
  for (let d = from; d <= last; d = addDays(d, 1)) {
    need++;
    if (!dayComplete(by[d], d, tz)) { gaps++; first ??= d; }
  }
  const todayRow = to >= today && from <= today && hasMoney(by[today]);
  return { ok: gaps === 0 && (need > 0 || todayRow), first_missing: first, rows: (rows || []).length };
}

/** The plain line every screen shows. */
export function storeLabel(source, reason) {
  if (source === 'shopify') return reason === 'set' ? 'Store numbers: Shopify (set in brand settings; days Shopify has not synced are missing)' : 'Store numbers: Shopify';
  if (reason === 'set') return 'Store numbers: Triple Whale (set in brand settings)';
  if (reason === 'partial') return 'Store numbers: Triple Whale (Shopify not synced for every day yet)';
  return 'Store numbers: Triple Whale (Shopify not synced yet)';
}

/** Which source a window reads. */
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

/** The two keys a payload carries. */
export const storeTag = d => ({ store_source: d ? d.source : 'triple_whale', store_label: d ? d.label : storeLabel('triple_whale', 'not_synced') });

/** Put Shopify's store figures into tracker rows { metric: { date: value } } for [from, to]. Every store
 *  metric of every day in the window is replaced: a day Shopify has no row for reads as missing. */
export function overlayShopify(piv, rows, from, to) {
  const by = Object.fromEntries((rows || []).map(r => [r.day, r]));
  const set = (m, d, v) => { (piv[m] ??= {})[d] = v; };
  const z = v => (v == null ? 0 : +v);
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const m of SHOP_METRICS) if (piv[m]) delete piv[m][d];
    const r = by[d];
    if (!hasMoney(r)) continue;
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

/** The switch for one brand's rows of one window. shop = { rows: { brand: [...] }, modes: { brand: mode } }
 *  as load.js reads it. Returns the decision; `piv` is changed only when Shopify wins. */
export function switchStore(piv, shop, acct, from, to, now) {
  const id = acct.act_id;
  const rows = (shop && shop.rows && shop.rows[id]) || [];
  const d = decideStore(shop && shop.modes ? shop.modes[id] : null, rows, from, to, { tz: acct.tz || 'UTC', now });
  if (d.source === 'shopify') overlayShopify(piv, rows, from, to);
  return d;
}
