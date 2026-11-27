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
 *
 * Owner route (worker.js): POST /api/shopify/orders-sync?act=<brand>&days=90 backfills one store.
 * Incremental: account-health's hourly tick calls shopDailyTick (days=3, the stalest stores first, no new cron).
 *
 * Rate limits: one ShopifyQL call per run, then orders pages of 250 read one after another; when the GraphQL bucket
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
    orders_source TEXT, currency TEXT, synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (act_id, day))`,
  `CREATE INDEX IF NOT EXISTS p_shop_daily_shop_idx ON p_shop_daily (shop, day)`,
];
const SHOPIFY_COLS = ['orders_sync_at TEXT', 'orders_days INTEGER', 'orders_error TEXT'];

/** Make the table and the p_shopify sync columns if they are missing. Each statement fails on its own when done. */
export async function ensureShopDaily(env) {
  for (const s of SHOP_DAILY_DDL) await env.DB.prepare(s).run().catch(() => {});
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

const ORDERS_Q = `query($q: String!, $after: String) { orders(first: 250, after: $after, query: $q, sortKey: CREATED_AT) {
  pageInfo { hasNextPage endCursor }
  nodes { createdAt test cancelledAt displayFinancialStatus totalPriceSet { shopMoney { amount } }
    customerJourneySummary { customerOrderIndex } } } }`;

/** A small GraphQL client with the throttle handled. `F` = fetch. Throws on HTTP or GraphQL errors. */
export function shopGql(F, shop, token, { wait = sleep } = {}) {
  return async (query, variables = {}) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await F(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status === 429) { await wait(2000 * (attempt + 1)); continue; }
      if (!res.ok) throw new Error(`Shopify returned ${res.status}`);
      const b = await res.json().catch(() => ({}));
      if (b.errors?.some(e => e.extensions?.code === 'THROTTLED')) { await wait(2000 * (attempt + 1)); continue; }
      if (b.errors?.length) throw new Error(b.errors.map(e => e.message).join('; '));
      /* Leave room in the bucket: when under 300 points are left, wait for it to refill before the next call. */
      const t = b.extensions?.cost?.throttleStatus;
      if (t && t.currentlyAvailable < 300 && t.restoreRate > 0) await wait(Math.ceil((300 - t.currentlyAvailable) / t.restoreRate) * 1000);
      return b.data;
    }
    throw new Error('Shopify kept saying slow down; try again in a minute');
  };
}

/**
 * Sync one connected store. row = { shop, act_id, scopes }. opts: days (default 3, max 400), token, F, wait,
 * maxPages (default 40), now (ms), from (YYYY-MM-DD: resume the orders pass here).
 * Returns { shop, act_id, days, money_days, order_days, orders_from, resume_from?, error? }.
 */
export async function syncShopDaily(env, row, opts = {}) {
  const { token, F = fetch, wait = sleep, maxPages = 40, now = Date.now } = opts;
  const days = Math.min(400, Math.max(1, Math.floor(Number(opts.days) || 3)));
  if (!token) throw new Error('the store has to open the Mobius Digital app in Shopify once to reconnect');
  await ensureShopDaily(env);
  const gql = shopGql(F, row.shop, token, { wait });
  const stamp = new Date(now()).toISOString().slice(0, 19).replace('T', ' ');

  const info = await gql(`{ shop { ianaTimezone currencyCode } }`);
  const tz = info?.shop?.ianaTimezone || 'UTC', currency = info?.shop?.currencyCode || null;
  const today = dayIn(new Date(now()).toISOString(), tz);

  /* 1. Money per day (ShopifyQL fails soft: parseErrors with HTTP 200, so check both). */
  const q = await gql(`query($q: String!) { shopifyqlQuery(query: $q) { tableData { columns { name } rows } parseErrors } }`, { q: salesQuery(days) });
  const r = q?.shopifyqlQuery;
  if (r?.parseErrors?.length) throw new Error('ShopifyQL: ' + r.parseErrors.join('; '));
  if (!r?.tableData) throw new Error('ShopifyQL returned no data');
  const money = moneyRows(r.tableData.rows);
  if (money.length) {
    await env.DB.batch(money.map(m => env.DB.prepare(
      `INSERT INTO p_shop_daily (act_id, day, shop, gross_sales, discounts, returns, net_sales, shipping, taxes, total_sales,
         sales, refunds, orders_all, orders_source, currency, synced_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'shopifyql',?14,?15)
       ON CONFLICT(act_id, day) DO UPDATE SET shop = excluded.shop, gross_sales = excluded.gross_sales,
         discounts = excluded.discounts, returns = excluded.returns, net_sales = excluded.net_sales,
         shipping = excluded.shipping, taxes = excluded.taxes, total_sales = excluded.total_sales, sales = excluded.sales,
         refunds = excluded.refunds, orders_all = excluded.orders_all, currency = excluded.currency, synced_at = excluded.synced_at`,
    ).bind(row.act_id, m.day, row.shop, m.gross_sales, m.discounts, m.returns, m.net_sales, m.shipping, m.taxes,
      m.total_sales, m.sales, m.refunds, m.orders_all, currency, stamp)));
  }

  /* 2. Paid orders per day, read order by order inside the read_orders window. */
  let start = ordersStart(today, days, row.scopes);
  if (opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) && opts.from > start) start = opts.from;
  const byDay = {};
  let after = null, pages = 0, more = false, lastDay = null;
  /* created_at with the store's offset is not known here, so read from a day early in UTC and drop what is outside. */
  const since = new Date(start + 'T00:00:00Z'); since.setUTCDate(since.getUTCDate() - 1);
  const filter = `created_at:>='${since.toISOString()}'`;
  do {
    const d = await gql(ORDERS_Q, { q: filter, after });
    const page = d?.orders;
    for (const o of page?.nodes || []) {
      const day = dayIn(o.createdAt, tz);
      if (day < start) continue;
      lastDay = day;
      countOrder(byDay, o, tz);
    }
    pages++;
    more = !!page?.pageInfo?.hasNextPage;
    after = page?.pageInfo?.endCursor || null;
  } while (more && after && pages < maxPages);

  /* Every day from start to today gets a row (a day with no orders is a real zero). When the page cap stopped the
     read early, the last day seen may be half counted: leave it and everything after for the next call. */
  const doneUntil = more ? lastDay : today;
  const orderDays = [];
  for (let d = start; d <= today && (!more || d < doneUntil); d = nextDay(d)) orderDays.push(d);
  if (orderDays.length) {
    await env.DB.batch(orderDays.map(day => {
      const c = byDay[day] || { orders: 0, zero_orders: 0, new_orders: 0, returning_orders: 0, paid_sales: 0 };
      return env.DB.prepare(
        `INSERT INTO p_shop_daily (act_id, day, shop, orders, zero_orders, new_orders, returning_orders, paid_sales, orders_source, currency, synced_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'orders',?9,?10)
         ON CONFLICT(act_id, day) DO UPDATE SET orders = excluded.orders, zero_orders = excluded.zero_orders,
           new_orders = excluded.new_orders, returning_orders = excluded.returning_orders, paid_sales = excluded.paid_sales,
           orders_source = 'orders', synced_at = excluded.synced_at`,
      ).bind(row.act_id, day, row.shop, c.orders, c.zero_orders, c.new_orders, c.returning_orders, c.paid_sales, currency, stamp);
    }));
  }

  const { results: cnt } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM p_shop_daily WHERE act_id = ?1`).bind(row.act_id).all().catch(() => ({ results: [{ n: null }] }));
  await env.DB.prepare(`UPDATE p_shopify SET orders_sync_at = ?2, orders_days = ?3, orders_error = NULL WHERE shop = ?1`)
    .bind(row.shop, stamp, cnt?.[0]?.n ?? null).run().catch(() => {});
  return { shop: row.shop, act_id: row.act_id, days, tz, money_days: money.length, order_days: orderDays.length,
    orders_from: start, pages, ...(more ? { resume_from: doneUntil } : {}), rows: cnt?.[0]?.n ?? null, as_of: stamp };
}

function nextDay(d) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); }

/** Note a failed run on the store so the Connections screen can say why its numbers stopped. */
export async function noteSyncError(env, shop, message) {
  await ensureShopDaily(env);
  await env.DB.prepare(`UPDATE p_shopify SET orders_error = ?2 WHERE shop = ?1`).bind(shop, String(message || '').slice(0, 300)).run().catch(() => {});
}

/**
 * The hourly incremental (account-health's '0 * * * *' tick, no new cron): the `limit` stores synced longest ago,
 * last 3 days each, one at a time. `tokenFor(shop)` returns a working token or null. `canAfford(n)` guards the
 * tick's subrequest budget. A store is skipped when it synced in the last `minMinutes`.
 */
export async function shopDailyTick(env, { tokenFor, F = fetch, canAfford = () => true, limit = 3, minMinutes = 50, now = Date.now } = {}) {
  await ensureShopDaily(env);
  const cutoff = new Date(now() - minMinutes * 60000).toISOString().slice(0, 19).replace('T', ' ');
  const { results } = await env.DB.prepare(
    `SELECT shop, act_id, scopes FROM p_shopify WHERE act_id IS NOT NULL AND uninstalled_at IS NULL AND access_token <> ''
       AND (orders_sync_at IS NULL OR orders_sync_at < ?1) ORDER BY COALESCE(orders_sync_at, '') ASC LIMIT ?2`,
  ).bind(cutoff, limit).all().catch(() => ({ results: [] }));
  const out = [];
  for (const row of results) {
    if (!canAfford(12)) { out.push({ shop: row.shop, deferred: 'out of subrequest budget' }); break; }
    try {
      const token = await tokenFor(row.shop);
      if (!token) { await noteSyncError(env, row.shop, 'not connected: the store has to open the app once'); out.push({ shop: row.shop, error: 'not connected' }); continue; }
      const r = await syncShopDaily(env, row, { token, F, days: 3, maxPages: 20, now });
      out.push({ shop: r.shop, money_days: r.money_days, order_days: r.order_days });
    } catch (e) {
      await noteSyncError(env, row.shop, e.message);
      out.push({ shop: row.shop, error: e.message });
    }
  }
  return out.length ? { stores: out } : { skipped: 'every store is fresh' };
}
