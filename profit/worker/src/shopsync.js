/**
 * SHOPIFY DAILY STORE TOTALS (2026-11-26). Store numbers come from Shopify; Triple Whale stays for ad attribution only,
 * so a brand with no Triple Whale store (and every brand, as a cross-check) gets real sales and orders per day.
 *
 * One row per brand per store day in `p_shop_daily` (the shop's own time zone, like Shopify's reports):
 *
 *   money, from ShopifyQL `FROM sales` (read_reports; aggregates are NOT held to the 60-day read_orders window):
 *     gross_sales, discounts, returns (Shopify's sign: zero or negative), net_sales, shipping, taxes, total_sales,
 *     sales = total_sales - taxes   <- THE revenue figure (profit/CLAUDE.md: Shopify Total Sales minus tax)
 *     refunds = -returns            <- positive money handed back that day
 *     orders_all                    <- every order Shopify counted, $0 and sample orders included
 *   orders, from the Admin GraphQL orders list (read_orders: last 60 days unless the store granted read_all_orders):
 *     orders      = PAID orders: not a test, not cancelled, total above $0, payment taken or authorized
 *     zero_orders = $0 orders (creator samples, giveaways, replacements); never counted as orders
 *     new_orders / returning_orders = the customer's first paid order or a later one (customerOrderIndex)
 *     orders_source = 'orders' for days read order by order, 'shopifyql' where only the aggregate exists
 *   two stamps: synced_at = the last time the MONEY for the day was written (every run that reached ShopifyQL);
 *     orders_at = the last time the ORDERS pass finished that day. A run whose orders pass fails or stops at the page
 *     cap still bumps synced_at, so "is this whole day counted?" (storesource.js) must read orders_at for the counts.
 *
 * ORDERS-ONLY MONEY (2026-11-26): ShopifyQL needs read_reports AND Shopify's protected customer data Level 2, which the
 * app does not have yet ("Access denied for shopifyqlQuery field"). When ShopifyQL is denied, or the brand setting
 * `shopMoney:<brand>` is 'orders', the money columns are built from the same orders list instead (orderMoney below),
 * using only order money fields (no customer name, email, address or phone), for the last 59 days only (the whole
 * range with read_all_orders). Those days carry money_source 'orders' and orders_source 'orders', so the switch
 * (storesource.js) treats them as covered; older days stay empty and the switch keeps Triple Whale for any window
 * reaching past them. The ShopifyQL path stays and takes over by itself once the access arrives.
 *   Differences from ShopifyQL total_sales, all by ORDER date where ShopifyQL books each event on its own date:
 *     refunds and order edits land on the day the order was placed (ShopifyQL: the day of the refund or edit), and
 *     a refund on an order older than the read is never seen (the tick re-reads 14 days once a day to catch most);
 *     shipping is the shipping charged (ShopifyQL nets shipping refunds out of shipping; here they sit in refunds);
 *     cancelled, test, voided and expired orders are left out (ShopifyQL books a cancelled order as a sale and a
 *     return, which nets out the same once refunded);
 *     tips are taken out (totalTipReceivedSet), like Shopify's reports;
 *     GIFT CARD PURCHASES ARE NOT TAKEN OUT: Shopify's reports leave a gift card sale out of total sales and count it
 *     when it is spent, while here the purchase order counts in full AND the later order paid with it counts again.
 *     Telling a gift card line apart needs the order's line items, which would cut the page size several times over,
 *     so a brand selling gift cards (December) reads high by its gift card sales until ShopifyQL access arrives.
 *   The access error is written once per store in orders_error ("Needs read_reports and Shopify protected customer
 *   data Level 2") and ShopifyQL is not asked again for 6 hours (orders_denied_at, only while orders_error still says
 *   that); the orders keep syncing hourly. A store that refuses the orders list too gets "Needs read_orders and ...
 *   Level 1" and the tick leaves it for 6 hours; that hold is not a ShopifyQL refusal and does not skip ShopifyQL.
 *   The seam: once ShopifyQL answers, the run reads ShopifyQL back to the oldest day still carrying orders money, so
 *   one definition covers the window (no refund booked on its order day by orders AND on its refund day by ShopifyQL).
 *
 * QUERY COST: Shopify refuses a query over 1,000 requested points before it runs (MAX_COST_EXCEEDED). An orders page
 * costs about 2 + first x (1 + 2 per money field + 1 for customerJourneySummary), so the orders-only query reads
 * PAGE_MONEY orders a page and the counts-only query PAGE_COUNTS (ordersQueryCost; the test holds both under 1,000).
 *
 * Owner route (worker.js): POST /api/shopify/orders-sync?act=<brand>&days=90 backfills one store.
 * Incremental: account-health's hourly tick calls shopDailyTick (days=3, the stalest stores first, no new cron).
 *
 * Rate limits: one ShopifyQL call per run, then orders pages (see QUERY COST) read one after another; when the GraphQL bucket
 * runs low it waits for it to refill. A run stops after `maxPages` pages and only writes days it finished, then says
 * where to resume (`resume_from`), so a very busy store is backfilled over a few calls and never half-counted.
 */

export const API_VERSION = '2026-07';
export const ORDERS_WINDOW_DAYS = 60;

export const SHOP_DAILY_DDL = [
  `CREATE TABLE IF NOT EXISTS p_shop_daily (
    act_id TEXT NOT NULL, day TEXT NOT NULL, shop TEXT NOT NULL,
    gross_sales REAL, discounts REAL, returns REAL, net_sales REAL, shipping REAL, taxes REAL, total_sales REAL,
    sales REAL, refunds REAL, orders_all INTEGER,
    orders INTEGER, zero_orders INTEGER, new_orders INTEGER, returning_orders INTEGER, paid_sales REAL,
    orders_source TEXT, currency TEXT, synced_at TEXT NOT NULL DEFAULT (datetime('now')), orders_at TEXT,
    PRIMARY KEY (act_id, day))`,
  `CREATE INDEX IF NOT EXISTS p_shop_daily_shop_idx ON p_shop_daily (shop, day)`,
];
/* Columns added after the table first shipped (each ALTER fails on its own once done). */
const SHOP_DAILY_COLS = ['orders_at TEXT', 'money_source TEXT'];
/* orders_sync_at = the last run that finished; orders_try_at = the last run the hourly tick started, failed or not, so a
   store that keeps failing goes to the back of the line instead of starving the healthy ones. */
const SHOPIFY_COLS = ['orders_sync_at TEXT', 'orders_days INTEGER', 'orders_error TEXT', 'orders_try_at TEXT',
  'orders_denied_at TEXT', 'orders_wide_at TEXT'];

/* The plain lines written to p_shopify.orders_error when Shopify refuses a field. Both start with "Needs read_". */
export const ACCESS_REPORTS = 'Needs read_reports and Shopify protected customer data Level 2';
export const ACCESS_ORDERS = 'Needs read_orders and Shopify protected customer data Level 1';
export const isAccessNote = m => /^Needs read_/.test(String(m || ''));
/** Shopify's "Access denied for <field> field" (GraphQL ACCESS_DENIED) or an HTTP 403. */
export const isAccessDenied = e => !!e && (e.status === 403 || (e.codes || []).includes('ACCESS_DENIED') || /access denied/i.test(String(e.message || '')));
/* How long a refused ShopifyQL (or a store that refused everything) is left alone. */
export const DENIED_HOLD_HOURS = 6;
/* Brand setting (settings table): where the money comes from. 'auto' (ShopifyQL, orders when refused) | 'orders'. */
export const shopMoneyKey = act => `shopMoney:${act}`;
/** ShopifyQL was refused for this store inside the hold. Only the read_reports note counts: a store held for refusing
    the orders list (ACCESS_ORDERS) was never refused ShopifyQL, so its next run asks ShopifyQL as usual. */
export const reportsHeld = (row, nowMs) => !!row?.orders_denied_at && row.orders_error === ACCESS_REPORTS
  && String(row.orders_denied_at) > stampOf(nowMs - DENIED_HOLD_HOURS * 3600000);
/* Orders per page. Shopify refuses a single query over 1,000 requested points (see QUERY COST in the header). */
export const MAX_QUERY_COST = 1000;
export const PAGE_MONEY = 45;
export const PAGE_COUNTS = 200;

/** Make the table and the p_shopify sync columns if they are missing. Each statement fails on its own when done. */
export async function ensureShopDaily(env) {
  for (const s of SHOP_DAILY_DDL) await env.DB.prepare(s).run().catch(() => {});
  for (const c of SHOP_DAILY_COLS) await env.DB.prepare(`ALTER TABLE p_shop_daily ADD COLUMN ${c}`).run().catch(() => {});
  for (const c of SHOPIFY_COLS) await env.DB.prepare(`ALTER TABLE p_shopify ADD COLUMN ${c}`).run().catch(() => {});
}

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = n => Math.round(n * 100) / 100;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** The ShopifyQL money query: one row per day for the last `days` days, today included. */
export function salesQuery(days) {
  return `FROM sales SHOW orders, gross_sales, discounts, returns, net_sales, shipping_charges, taxes, total_sales `
    + `GROUP BY day SINCE -${Math.max(1, Math.floor(days))}d UNTIL today ORDER BY day ASC`;
}

/** ShopifyQL rows (strings keyed by column) -> money per day. */
export function moneyRows(rows) {
  const out = [];
  for (const r of rows || []) {
    const day = String(r.day ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const total = num(r.total_sales), taxes = num(r.taxes), returns = num(r.returns);
    out.push({
      day, orders_all: Math.round(num(r.orders)),
      gross_sales: round2(num(r.gross_sales)), discounts: round2(num(r.discounts)), returns: round2(returns),
      net_sales: round2(num(r.net_sales)), shipping: round2(num(r.shipping_charges)), taxes: round2(taxes),
      total_sales: round2(total), sales: round2(total - taxes), refunds: round2(Math.abs(returns)),
    });
  }
  return out;
}

/** Payment states that mean the money was taken (or will be, on capture). Pending, voided and expired are not sales. */
const PAID = new Set(['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'AUTHORIZED']);

/** One order -> 'paid' | 'zero' | null (skipped: test, cancelled, unpaid). */
export function classifyOrder(o) {
  if (!o || o.test || o.cancelledAt) return null;
  const total = num(o.totalPriceSet?.shopMoney?.amount);
  if (total <= 0) return 'zero';
  return PAID.has(String(o.displayFinancialStatus || '').toUpperCase()) ? 'paid' : null;
}

const amt = m => num(m?.shopMoney?.amount);

/**
 * One order's money for the orders-only path, or null when it is not a sale (test, cancelled, voided, expired).
 * Fields used (order money only, none of them protected customer fields): totalPriceSet, totalRefundedSet,
 * currentTotalTaxSet, totalShippingPriceSet, totalDiscountsSet, subtotalPriceSet, totalTaxSet, totalTipReceivedSet,
 * taxesIncluded.
 *   total_sales = totalPrice - totalRefunded - tips   (= gross - discounts + shipping + tax - every refund)
 *   Gift card purchases stay in (see the header: they need line items).
 *   taxes = currentTotalTax (tax after returns), shipping = shipping charged, refunds = totalRefunded,
 *   gross = subtotal (after discounts) + discounts, less the tax inside it when the store's prices include tax.
 * currentTotalPriceSet is not used: a refund with no item returned (a goodwill refund) does not lower it, while
 * totalRefundedSet counts every refund. Pending (unpaid) orders are in, like ShopifyQL's sales; the paid-orders COUNT
 * stays classifyOrder's.
 */
export function orderMoney(o) {
  if (!o || o.test || o.cancelledAt) return null;
  const st = String(o.displayFinancialStatus || '').toUpperCase();
  if (st === 'VOIDED' || st === 'EXPIRED') return null;
  const total = amt(o.totalPriceSet), refunded = amt(o.totalRefundedSet), disc = amt(o.totalDiscountsSet);
  const gross = amt(o.subtotalPriceSet) + disc - (o.taxesIncluded ? amt(o.totalTaxSet) : 0);
  return { total_sales: total - refunded - amt(o.totalTipReceivedSet), taxes: amt(o.currentTotalTaxSet), shipping: amt(o.totalShippingPriceSet),
    discounts: -disc, refunds: refunded, gross_sales: gross };
}

const MONEY_KEYS = ['gross_sales', 'discounts', 'refunds', 'shipping', 'taxes', 'total_sales'];
const money0 = () => ({ gross_sales: 0, discounts: 0, refunds: 0, shipping: 0, taxes: 0, total_sales: 0, orders_all: 0 });

/** Add one order's money to the per-day sums (orders-only path). */
export function addMoney(byDay, o, tz) {
  const m = orderMoney(o);
  if (!m) return;
  const c = (byDay[dayIn(o.createdAt, tz)] ??= money0());
  c.orders_all++;
  for (const k of MONEY_KEYS) c[k] = round2(c[k] + m[k]);
}

/** Per-day sums -> the p_shop_daily money columns, derived the same way moneyRows derives ShopifyQL's. */
export function moneyFromOrders(c) {
  const m = c || money0();
  return { gross_sales: m.gross_sales, discounts: m.discounts, returns: round2(-m.refunds), refunds: m.refunds,
    shipping: m.shipping, taxes: m.taxes, total_sales: m.total_sales, sales: round2(m.total_sales - m.taxes),
    net_sales: round2(m.total_sales - m.shipping - m.taxes), orders_all: m.orders_all };
}

/** The calendar day of an ISO timestamp in the store's time zone. */
export function dayIn(iso, tz) {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch { return d.toISOString().slice(0, 10); }
}

/** Add one order to the per-day counts. */
export function countOrder(byDay, o, tz) {
  const kind = classifyOrder(o);
  if (!kind) return;
  const day = dayIn(o.createdAt, tz);
  const c = (byDay[day] ??= { orders: 0, zero_orders: 0, new_orders: 0, returning_orders: 0, paid_sales: 0 });
  if (kind === 'zero') { c.zero_orders++; return; }
  c.orders++;
  c.paid_sales = round2(c.paid_sales + num(o.totalPriceSet?.shopMoney?.amount));
  const idx = o.customerJourneySummary?.customerOrderIndex;
  if (idx === 1) c.new_orders++;
  else if (idx > 1) c.returning_orders++;
}

/** The first day (YYYY-MM-DD, store time) the orders list may read for a `days` backfill. */
export function ordersStart(today, days, scopes) {
  const all = String(scopes || '').split(',').map(s => s.trim()).includes('read_all_orders');
  const back = all ? days : Math.min(days, ORDERS_WINDOW_DAYS - 1);
  const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (back - 1));
  return d.toISOString().slice(0, 10);
}

/* The orders list. Money fields only when the money comes from orders. customerJourneySummary needs read_orders only
   (Shopify's docs give it no protected customer data level beyond the Order itself); a store that refuses it anyway
   is read again without it, and new vs returning stay empty (null) for those days. */
const M = f => `${f} { shopMoney { amount } }`;
const MONEY_FIELDS = ['totalRefundedSet', 'currentTotalTaxSet', 'totalShippingPriceSet', 'totalDiscountsSet',
  'subtotalPriceSet', 'totalTaxSet', 'totalTipReceivedSet'];
/** Requested points for one orders page, by Shopify's rule (object 1, connection sized by `first`, plus 2). */
export function ordersQueryCost({ money = false, journey = true } = {}) {
  const sets = 1 + (money ? MONEY_FIELDS.length : 0);
  return 2 + (money ? PAGE_MONEY : PAGE_COUNTS) * (1 + 2 * sets + (journey ? 1 : 0));
}
export function ordersQuery({ money = false, journey = true } = {}) {
  const moneyF = money ? ' ' + MONEY_FIELDS.map(M).join(' ') + ' taxesIncluded' : '';
  return `query($q: String!, $after: String) { orders(first: ${money ? PAGE_MONEY : PAGE_COUNTS}, after: $after, query: $q, sortKey: CREATED_AT) {
  pageInfo { hasNextPage endCursor }
  nodes { createdAt test cancelledAt displayFinancialStatus ${M('totalPriceSet')}${moneyF}${journey ? ' customerJourneySummary { customerOrderIndex }' : ''} } } }`;
}

/** A small GraphQL client with the throttle handled. `F` = fetch. Throws on HTTP or GraphQL errors. */
export function shopGql(F, shop, token, { wait = sleep } = {}) {
  return async (query, variables = {}) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await F(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status === 429) { await wait(2000 * (attempt + 1)); continue; }
      if (!res.ok) throw Object.assign(new Error(`Shopify returned ${res.status}`), { status: res.status });
      const b = await res.json().catch(() => ({}));
      if (b.errors?.some(e => e.extensions?.code === 'THROTTLED')) { await wait(2000 * (attempt + 1)); continue; }
      if (b.errors?.length) {
        throw Object.assign(new Error(b.errors.map(e => e.message).join('; ')), { codes: b.errors.map(e => e.extensions?.code).filter(Boolean) });
      }
      /* Leave room in the bucket: when under 300 points are left, wait for it to refill before the next call. */
      const t = b.extensions?.cost?.throttleStatus;
      if (t && t.currentlyAvailable < 300 && t.restoreRate > 0) await wait(Math.ceil((300 - t.currentlyAvailable) / t.restoreRate) * 1000);
      return b.data;
    }
    throw new Error('Shopify kept saying slow down; try again in a minute');
  };
}

/** The brand's money setting: 'orders' or 'auto'. A missing settings table reads as 'auto'. */
export async function moneyMode(env, act) {
  const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(shopMoneyKey(act)).first().catch(() => null);
  return r?.value === 'orders' ? 'orders' : 'auto';
}

/**
 * Sync one connected store. row = { shop, act_id, scopes, orders_denied_at?, orders_error? } (both needed for the hold). opts: days (default 3, max 400), token,
 * F, wait, maxPages (default 40), now (ms), from (YYYY-MM-DD: resume the orders pass here), money ('auto' | 'orders':
 * overrides the brand setting), reprobe (ask ShopifyQL even inside the 6-hour hold).
 * Returns { shop, act_id, days, money_source, money_days, order_days, orders_from, resume_from?, access?, seam_from? }.
 */
export async function syncShopDaily(env, row, opts = {}) {
  const { token, F = fetch, wait = sleep, maxPages = 40, now = Date.now } = opts;
  const days = Math.min(400, Math.max(1, Math.floor(Number(opts.days) || 3)));
  if (!token) throw new Error('the store has to open the Mobius Digital app in Shopify once to reconnect');
  await ensureShopDaily(env);
  const gql = shopGql(F, row.shop, token, { wait });
  const stamp = stampOf(now());

  const info = await gql(`{ shop { ianaTimezone currencyCode } }`);
  const tz = info?.shop?.ianaTimezone || 'UTC', currency = info?.shop?.currencyCode || null;
  const today = dayIn(new Date(now()).toISOString(), tz);

  /* 1. Money per day from ShopifyQL, unless the brand reads money from orders, or ShopifyQL was refused in the last
     6 hours (no asking a refused field every hour). A refusal switches this run to orders-only money. */
  const mode = opts.money === 'orders' || opts.money === 'auto' ? opts.money : await moneyMode(env, row.act_id);
  const held = !opts.reprobe && reportsHeld(row, now());
  let fromOrders = mode === 'orders' || held, access = held && mode !== 'orders' ? ACCESS_REPORTS : null;
  let money = [], qlDays = days, seamFrom = null;
  if (!fromOrders) {
    /* The seam: days still carrying orders money (booked by order day) are all re-read from ShopifyQL in this run,
       so a refund is never counted on its order day by orders and again on its refund day by ShopifyQL. */
    const old = await env.DB.prepare(`SELECT MIN(day) AS d FROM p_shop_daily WHERE act_id = ?1 AND money_source = 'orders'`)
      .bind(row.act_id).first().catch(() => null);
    if (old?.d && old.d < today) {
      seamFrom = old.d;
      qlDays = Math.min(400, Math.max(days, Math.round((Date.parse(today) - Date.parse(old.d)) / 864e5) + 1));
    }
    try {
      /* ShopifyQL fails soft: parseErrors with HTTP 200, so check both. */
      const q = await gql(`query($q: String!) { shopifyqlQuery(query: $q) { tableData { columns { name } rows } parseErrors } }`, { q: salesQuery(qlDays) });
      const r = q?.shopifyqlQuery;
      if (r?.parseErrors?.length) throw new Error('ShopifyQL: ' + r.parseErrors.join('; '));
      if (!r?.tableData) throw new Error('ShopifyQL returned no data');
      money = moneyRows(r.tableData.rows);
    } catch (e) {
      if (!isAccessDenied(e)) throw e;
      fromOrders = true; access = ACCESS_REPORTS;
      await env.DB.prepare(`UPDATE p_shopify SET orders_denied_at = ?2, orders_error = ?3 WHERE shop = ?1`)
        .bind(row.shop, stamp, ACCESS_REPORTS).run().catch(() => {});
    }
  }
  if (money.length) {
    /* Orders money left in the range ShopifyQL just covered, on a day it sent no row for, is a day ShopifyQL has no
       sales on: zero it under ShopifyQL's name first, then the rows below write the days it did send. */
    const covered = new Date(today + 'T00:00:00Z'); covered.setUTCDate(covered.getUTCDate() - (qlDays - 1));
    const clear = env.DB.prepare(
      `UPDATE p_shop_daily SET gross_sales = 0, discounts = 0, returns = 0, net_sales = 0, shipping = 0, taxes = 0,
         total_sales = 0, sales = 0, refunds = 0, orders_all = 0, money_source = 'shopifyql', synced_at = ?3
       WHERE act_id = ?1 AND money_source = 'orders' AND day >= ?2`,
    ).bind(row.act_id, covered.toISOString().slice(0, 10), stamp);
    await env.DB.batch([clear, ...money.map(m => env.DB.prepare(
      `INSERT INTO p_shop_daily (act_id, day, shop, gross_sales, discounts, returns, net_sales, shipping, taxes, total_sales,
         sales, refunds, orders_all, orders_source, money_source, currency, synced_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'shopifyql','shopifyql',?14,?15)
       ON CONFLICT(act_id, day) DO UPDATE SET shop = excluded.shop, gross_sales = excluded.gross_sales,
         discounts = excluded.discounts, returns = excluded.returns, net_sales = excluded.net_sales,
         shipping = excluded.shipping, taxes = excluded.taxes, total_sales = excluded.total_sales, sales = excluded.sales,
         refunds = excluded.refunds, orders_all = excluded.orders_all, money_source = 'shopifyql',
         currency = excluded.currency, synced_at = excluded.synced_at`,
    ).bind(row.act_id, m.day, row.shop, m.gross_sales, m.discounts, m.returns, m.net_sales, m.shipping, m.taxes,
      m.total_sales, m.sales, m.refunds, m.orders_all, currency, stamp))]);
  }

  /* 2. Paid orders per day (and, orders-only, the money), read order by order inside the read_orders window. */
  let start = ordersStart(today, days, row.scopes);
  if (opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) && opts.from > start) start = opts.from;
  /* created_at with the store's offset is not known here, so read from a day early in UTC and drop what is outside. */
  const since = new Date(start + 'T00:00:00Z'); since.setUTCDate(since.getUTCDate() - 1);
  const filter = `created_at:>='${since.toISOString()}'`;
  const read = async journey => {
    const byDay = {}, cash = {};
    let after = null, pages = 0, more = false, lastDay = null;
    const query = ordersQuery({ money: fromOrders, journey });
    do {
      const d = await gql(query, { q: filter, after });
      const page = d?.orders;
      for (const o of page?.nodes || []) {
        const day = dayIn(o.createdAt, tz);
        if (day < start) continue;
        lastDay = day;
        countOrder(byDay, o, tz);
        if (fromOrders) addMoney(cash, o, tz);
      }
      pages++;
      more = !!page?.pageInfo?.hasNextPage;
      after = page?.pageInfo?.endCursor || null;
    } while (more && after && pages < maxPages);
    return { byDay, cash, pages, more, lastDay, journey };
  };
  let got;
  try { got = await read(true); } catch (e) {
    if (!isAccessDenied(e) && !/customerJourneySummary/.test(String(e.message))) throw e;
    try { got = await read(false); } catch (e2) {
      if (isAccessDenied(e2)) throw Object.assign(new Error(ACCESS_ORDERS), { access: true, cause: e2 });
      throw e2;
    }
  }
  const { byDay, cash, pages, more, lastDay, journey } = got;

  /* Every day from start to today gets a row (a day with no orders is a real zero). When the page cap stopped the
     read early, the last day seen may be half counted: leave it and everything after for the next call. */
  const doneUntil = more ? lastDay : today;
  const orderDays = [];
  for (let d = start; d <= today && (!more || d < doneUntil); d = nextDay(d)) orderDays.push(d);
  const zero = { orders: 0, zero_orders: 0, new_orders: 0, returning_orders: 0, paid_sales: 0 };
  if (orderDays.length && !fromOrders) {
    await env.DB.batch(orderDays.map(day => {
      const c = byDay[day] || zero, nr = journey ? c.new_orders : null, rr = journey ? c.returning_orders : null;
      return env.DB.prepare(
        `INSERT INTO p_shop_daily (act_id, day, shop, orders, zero_orders, new_orders, returning_orders, paid_sales, orders_source, currency, synced_at, orders_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'orders',?9,?10,?10)
         ON CONFLICT(act_id, day) DO UPDATE SET orders = excluded.orders, zero_orders = excluded.zero_orders,
           new_orders = excluded.new_orders, returning_orders = excluded.returning_orders, paid_sales = excluded.paid_sales,
           orders_source = 'orders', synced_at = excluded.synced_at, orders_at = excluded.orders_at`,
      ).bind(row.act_id, day, row.shop, c.orders, c.zero_orders, nr, rr, c.paid_sales, currency, stamp);
    }));
  }
  if (orderDays.length && fromOrders) {
    /* Orders-only: the whole row (money and counts) comes from this read, both stamps set together. */
    await env.DB.batch(orderDays.map(day => {
      const c = byDay[day] || zero, m = moneyFromOrders(cash[day]);
      const nr = journey ? c.new_orders : null, rr = journey ? c.returning_orders : null;
      return env.DB.prepare(
        `INSERT INTO p_shop_daily (act_id, day, shop, gross_sales, discounts, returns, net_sales, shipping, taxes, total_sales,
           sales, refunds, orders_all, orders, zero_orders, new_orders, returning_orders, paid_sales, orders_source, money_source,
           currency, synced_at, orders_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,'orders','orders',?19,?20,?20)
         ON CONFLICT(act_id, day) DO UPDATE SET shop = excluded.shop, gross_sales = excluded.gross_sales,
           discounts = excluded.discounts, returns = excluded.returns, net_sales = excluded.net_sales,
           shipping = excluded.shipping, taxes = excluded.taxes, total_sales = excluded.total_sales, sales = excluded.sales,
           refunds = excluded.refunds, orders_all = excluded.orders_all, orders = excluded.orders,
           zero_orders = excluded.zero_orders, new_orders = excluded.new_orders, returning_orders = excluded.returning_orders,
           paid_sales = excluded.paid_sales, orders_source = 'orders', money_source = 'orders', currency = excluded.currency,
           synced_at = excluded.synced_at, orders_at = excluded.orders_at`,
      ).bind(row.act_id, day, row.shop, m.gross_sales, m.discounts, m.returns, m.net_sales, m.shipping, m.taxes,
        m.total_sales, m.sales, m.refunds, m.orders_all, c.orders, c.zero_orders, nr, rr, c.paid_sales, currency, stamp);
    }));
  }

  const { results: cnt } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM p_shop_daily WHERE act_id = ?1`).bind(row.act_id).all().catch(() => ({ results: [{ n: null }] }));
  /* A refused ShopifyQL stays noted (orders_error keeps the plain line); a ShopifyQL that answered clears it. */
  await env.DB.prepare(`UPDATE p_shopify SET orders_sync_at = ?2, orders_days = ?3, orders_error = ?4
      ${fromOrders ? '' : ', orders_denied_at = NULL'} WHERE shop = ?1`)
    .bind(row.shop, stamp, cnt?.[0]?.n ?? null, access).run().catch(() => {});
  return { shop: row.shop, act_id: row.act_id, days, tz, money_source: fromOrders ? 'orders' : 'shopifyql',
    ...(!fromOrders && seamFrom ? { seam_from: seamFrom } : {}),
    money_days: fromOrders ? orderDays.length : money.length, order_days: orderDays.length, orders_from: start, pages,
    ...(journey ? {} : { new_vs_returning: 'not read (Shopify refused customerJourneySummary)' }),
    ...(more ? { resume_from: doneUntil } : {}), ...(access ? { access } : {}), rows: cnt?.[0]?.n ?? null, as_of: stamp };
}

const stampOf = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
function nextDay(d) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); }

/** Note a failed run on the store so the Connections screen can say why its numbers stopped. An access refusal is
    stamped too (orders_denied_at), so the hourly tick leaves the store alone for 6 hours. */
export async function noteSyncError(env, shop, message, nowMs = Date.now()) {
  await ensureShopDaily(env);
  const msg = String(message || '').slice(0, 300);
  if (isAccessNote(msg)) {
    await env.DB.prepare(`UPDATE p_shopify SET orders_error = ?2, orders_denied_at = ?3 WHERE shop = ?1`).bind(shop, msg, stampOf(nowMs)).run().catch(() => {});
  } else {
    await env.DB.prepare(`UPDATE p_shopify SET orders_error = ?2 WHERE shop = ?1`).bind(shop, msg).run().catch(() => {});
  }
}

/**
 * The hourly incremental (account-health's '0 * * * *' tick, no new cron): the `limit` stores synced longest ago,
 * last 3 days each, one at a time. `tokenFor(shop)` returns a working token or null. `canAfford(n)` guards the
 * tick's subrequest budget. A store is skipped when the tick tried it in the last `minMinutes`. Each try is stamped
 * (orders_try_at) BEFORE it runs, so a store that keeps failing (lost token, orders refused, a ShopifyQL error) moves
 * to the back of the line like a synced one and never holds the healthy stores off the tick.
 * A store whose last run was refused outright ("Needs read_..." in orders_error, nothing synced since) is skipped for
 * 6 hours. A store whose ShopifyQL is refused but whose orders read fine keeps syncing hourly from orders (syncShopDaily
 * does not ask ShopifyQL again inside the 6 hours), and once a day reads 14 days instead of 3 so refunds on recent
 * orders reach their order day. Orders-only pages are small (PAGE_MONEY), so that path gets more pages: up to 80 on
 * the wide read (3,600 orders) and 30 on the 3-day read, as many as the tick's subrequest budget allows. A wide read
 * cut short by the page cap (resume_from) is not stamped done, so the next hour tries the 14 days again.
 */
export async function shopDailyTick(env, { tokenFor, F = fetch, canAfford = () => true, limit = 3, minMinutes = 50, now = Date.now } = {}) {
  await ensureShopDaily(env);
  const cutoff = stampOf(now() - minMinutes * 60000), hold = stampOf(now() - DENIED_HOLD_HOURS * 3600000);
  const { results } = await env.DB.prepare(
    `SELECT shop, act_id, scopes, orders_denied_at, orders_error, orders_wide_at FROM p_shopify
     WHERE act_id IS NOT NULL AND uninstalled_at IS NULL AND access_token <> ''
       AND COALESCE(orders_try_at, orders_sync_at, '') < ?1
       AND NOT (COALESCE(orders_error, '') LIKE 'Needs read_%' AND COALESCE(orders_denied_at, '') >= ?3
                AND COALESCE(orders_sync_at, '') < orders_denied_at)
     ORDER BY COALESCE(orders_try_at, orders_sync_at, '') ASC LIMIT ?2`,
  ).bind(cutoff, limit, hold).all().catch(() => ({ results: [] }));
  const out = [];
  for (const row of results) {
    /* Money from orders: the brand says so, or ShopifyQL was refused (held or not: past the hold the run asks again,
       and a refusal still lands on the orders list). */
    const fromOrders = (row.orders_error === ACCESS_REPORTS && !!row.orders_denied_at) || (await moneyMode(env, row.act_id)) === 'orders';
    const wide = fromOrders && String(row.orders_wide_at || '') < stampOf(now() - 24 * 3600000);
    /* Pages this store may read: the most the budget allows (each page is one call, plus about 4 around them). */
    const want = !fromOrders ? 20 : wide ? 80 : 30;
    const maxPages = [want, 40, 20, 8].filter(p => p <= want).find(p => canAfford(p + 4));
    if (!maxPages) { out.push({ shop: row.shop, deferred: 'out of subrequest budget' }); break; }
    await env.DB.prepare(`UPDATE p_shopify SET orders_try_at = ?2 WHERE shop = ?1`).bind(row.shop, stampOf(now())).run().catch(() => {});
    try {
      const token = await tokenFor(row.shop);
      if (!token) { await noteSyncError(env, row.shop, 'not connected: the store has to open the app once'); out.push({ shop: row.shop, error: 'not connected' }); continue; }
      const r = await syncShopDaily(env, row, { token, F, days: wide ? 14 : 3, maxPages, now });
      /* Stamp the wide read only when it covered all 14 days; a read the page cap cut short goes again next hour. */
      if (wide && r.money_source === 'orders' && !r.resume_from) {
        await env.DB.prepare(`UPDATE p_shopify SET orders_wide_at = ?2 WHERE shop = ?1`).bind(row.shop, stampOf(now())).run().catch(() => {});
      }
      out.push({ shop: r.shop, money_source: r.money_source, money_days: r.money_days, order_days: r.order_days,
        ...(r.resume_from ? { resume_from: r.resume_from } : {}), ...(r.access ? { access: r.access } : {}) });
    } catch (e) {
      await noteSyncError(env, row.shop, e.message, now());
      out.push({ shop: row.shop, error: e.message });
    }
  }
  return out.length ? { stores: out } : { skipped: 'every store is fresh' };
}
