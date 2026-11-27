/**
 * SALES THAT COUNT TOWARD MER (2026-11-27, Cole; default narrowed to the website the same day).
 *
 * A brand's Shopify holds every order its warehouse ships, so marketplace and live-selling orders (Amazon, Whatnot,
 * eBay, wholesale) sit inside the store's total sales at their real prices. Ads do not drive those sales, so counting
 * them made MER read high (Bonk: about a third of its Shopify sales are Amazon orders synced in).
 *
 *   MER  = sales from the channels that count / all ad spend
 *   aMER = new-customer sales from those channels / all ad spend (the new-customer share applied to counted sales)
 *
 * Store sales, orders, AOV, profit and the P&L stay WHOLE-STORE: that money is real. Only the MER and aMER ratios
 * (and anything judged on them: the War Room ladder, MER goals, the brief, reports) use counted sales. Per-platform
 * ROAS is untouched: each platform as Triple Whale attributes it.
 *
 * THE DEFAULT RULE (every brand, every agency, Cole 2026-11-27): the brand's own website only (Shopify online store,
 * and subscription renewals bought there). Shops on other platforms (TikTok Shop, Shop app, Facebook and Instagram
 * shop) are judged on that platform's own ROAS, not MER; marketplaces, live selling (Whatnot, Showroom), wholesale,
 * in-person sales, orders typed in by staff and any app Locus does not know are left out too. Any of them can be
 * ticked in per brand (the Shop app is the usual one).
 *
 * PER BRAND: Brand settings > Goals > "Sales that count toward MER" ticks channels in or out, setting
 * `merChannels:<brand>` = { counts: { <channel key>: true|false }, tags: [order tags left out] }. A channel the brand
 * never touched follows the default rule. Orders carrying one of the tags (default: wholesale) are their own channel
 * ("tag:<tag>"), left out by default.
 *
 * THE DATA: p_sales_channel, one row per brand per store day per channel, Shopify orders only (marketplace orders
 * Triple Whale reads straight from Amazon or TikTok, platform != 'shopify', were never in store sales). Synced by
 * account-health's hourly tick from Triple Whale's orders_table (salesChannelTick). Sales per order = gross product
 * sales - product discounts + shipping + buyer fees + additional revenue - refunds: the store's sales line, tax out.
 *
 * WHERE IT IS APPLIED: storesource.js storeSwitchMany puts the left-out sales per day into the tracker pivot as
 * `merExcluded`, so every pivot reader (profit pivot(), hub, account-health briefs, reports, War Room) carries it, and
 * dayEconomics turns it into `mer_sales` / `mer_new_rev` on every day row and total. Screens compute MER from
 * `mer_sales ?? sales`. The engine has a copy of the pure part (engine/worker/src/metrics/merchannels.js).
 * Tests: node test-merchannels.mjs.
 */

/* What each kind of channel is, and whether it counts by default. */
export const KINDS = {
  storefront: { label: 'Your website', counts: true },
  subscription: { label: 'Subscriptions on your website', counts: true },
  social: { label: 'Shops on other platforms', counts: false },
  staff: { label: 'Typed in by your team', counts: false },
  other: { label: 'Other apps', counts: false },
  marketplace: { label: 'Marketplaces', counts: false },
  live: { label: 'Live selling', counts: false },
  wholesale: { label: 'Wholesale', counts: false },
  pos: { label: 'In person', counts: false },
};

/* Shopify order sources (source_name, lower case). Numbers are Shopify sales channel app ids. */
const KNOWN = {
  web: ['Online store', 'storefront'],
  '580111': ['Online store', 'storefront'],
  '3890849': ['Shop app', 'social'],
  '2329312': ['Facebook and Instagram shop', 'social'],
  tiktok: ['TikTok Shop', 'social'],
  '4383523': ['TikTok Shop', 'social'],
  subscription_contract: ['Subscription renewals', 'subscription'],
  subscription_contract_checkout_one: ['Subscription renewals', 'subscription'],
  shopify_draft_order: ['Draft orders (typed in by your team)', 'staff'],
  iphone: ['Orders made in the Shopify app', 'staff'],
  android: ['Orders made in the Shopify app', 'staff'],
  amazon: ['Amazon', 'marketplace'],
  ebay: ['eBay', 'marketplace'],
  walmart: ['Walmart', 'marketplace'],
  etsy: ['Etsy', 'marketplace'],
  '420755537921': ['Whatnot (Showroom app)', 'live'],
  '292572659713': ['Whatnot', 'live'],
  whatnot: ['Whatnot', 'live'],
  faire: ['Faire', 'wholesale'],
  'shopify-collective-automatic-payments': ['Shopify Collective (retailers)', 'wholesale'],
  wholesale: ['Wholesale', 'wholesale'],
  b2b: ['Wholesale', 'wholesale'],
  pos: ['Point of sale (in person)', 'pos'],
};

export const DEFAULT_TAGS = ['wholesale'];
export const merSettingKey = act => `merChannels:${act}`;

const cleanTag = t => String(t || '').toLowerCase().trim().replace(/[^a-z0-9 _-]/g, '').slice(0, 40);

/** The channel key of one order source (and the matching left-out tag, when the order carried one). */
export function channelKey(source, tag) {
  const t = cleanTag(tag);
  if (t) return 'tag:' + t;
  const s = String(source ?? '').toLowerCase().trim();
  return s || 'unknown';
}

/** What a channel key is: { key, label, kind, default (counts by the default rule), unnamed }. */
export function describe(key) {
  const k = String(key || '');
  if (k.startsWith('tag:')) return { key: k, label: `Orders tagged "${k.slice(4)}"`, kind: 'wholesale', default: false, unnamed: false };
  const known = KNOWN[k];
  if (known) return { key: k, label: known[0], kind: known[1], default: KINDS[known[1]].counts, unnamed: false };
  if (k === 'unknown') return { key: k, label: 'No source recorded', kind: 'other', default: false, unnamed: true };
  if (/^\d+$/.test(k)) return { key: k, label: `An app Locus does not know (Shopify app ${k})`, kind: 'other', default: false, unnamed: true };
  return { key: k, label: k.replace(/[_-]+/g, ' '), kind: 'other', default: false, unnamed: true };
}

/** The brand's setting, parsed. Missing or broken = the default rule. */
export function merConfig(raw) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  const counts = {};
  if (v && v.counts && typeof v.counts === 'object') for (const [k, b] of Object.entries(v.counts)) if (typeof b === 'boolean') counts[String(k)] = b;
  const tags = Array.isArray(v?.tags) ? [...new Set(v.tags.map(cleanTag).filter(Boolean))].slice(0, 10) : DEFAULT_TAGS.slice();
  return { counts, tags };
}

/** Does this channel count toward MER for this brand? */
export function counts(key, cfg) {
  const c = cfg?.counts?.[key];
  return typeof c === 'boolean' ? c : describe(key).default;
}

/** The left-out sales per day: rows = [{ day, channel, sales, orders }] for one brand. Returns { day: { sales, orders } }. */
export function excludedByDay(rows, cfg) {
  const out = {};
  for (const r of rows || []) {
    if (counts(r.channel, cfg)) continue;
    const o = (out[r.day] ??= { sales: 0, orders: 0 });
    o.sales += +r.sales || 0;
    o.orders += +r.orders || 0;
  }
  return out;
}

/** Put the left-out sales into a tracker pivot as `merExcluded` for [from, to] (mutates and returns piv).
 *  Only days with channel rows get a value; a day without rows leaves MER on whole-store sales. */
export function applyMerChannels(piv, rows, cfg, from, to) {
  if (!piv) return piv;
  const ex = excludedByDay(rows, cfg);
  for (const [d, v] of Object.entries(ex)) {
    if (d < from || d > to) continue;
    (piv.merExcluded ??= {})[d] = v.sales;
  }
  return piv;
}

/** Sales that count toward MER for one day: whole-store sales minus the left-out channels, never below 0. */
export const merSalesFor = (sales, excluded) => (sales == null ? null : +excluded ? Math.max(0, sales - excluded) : sales);

/** What a screen divides by for MER: counted sales when the row has them, else whole-store sales. */
export const merSalesOf = o => (o == null ? null : o.mer_sales ?? o.sales ?? null);

/** Cut a day row (from dayEconomics) down to counted sales after the fact: the live row, which is built from Triple
 *  Whale's live day and never went through the switch. Mutates and returns the row. */
export function merRow(row, excluded) {
  if (!row || row.sales == null) return row;
  row.mer_sales = merSalesFor(row.sales, excluded);
  row.mer_new_rev = row.new_rev == null ? null : row.sales > 0 ? row.new_rev * (row.mer_sales / row.sales) : row.new_rev;
  row.mer = row.spend ? row.mer_sales / row.spend : null;
  row.amer = row.mer_new_rev != null && row.spend ? row.mer_new_rev / row.spend : null;
  return row;
}

/** merRow for today's live row, reading today's channel rows (as far as the last sync read them). Returns the row. */
export async function merLive(env, act, row, date) {
  if (!row || row.sales == null) return row;
  const m = await readMer(env, [act], date, date).catch(() => null);
  if (!m?.rows[act]?.length) return row;
  return merRow(row, excludedByDay(m.rows[act], m.cfg[act])[date]?.sales);
}

/** The share of sales that counts (0 to 1) over some channel rows, or 1 when there are none. For live hourly numbers
 *  (the War Room ladder), where sales come by the hour with no channel split: the brand's recent mix stands in. */
export function countedShare(rows, cfg) {
  let all = 0, out = 0;
  for (const r of rows || []) { const s = +r.sales || 0; all += s; if (!counts(r.channel, cfg)) out += s; }
  return all > 0 ? Math.max(0, Math.min(1, 1 - out / all)) : 1;
}

/** countedShare for one brand over [from, to], read from the database. */
export async function merShare(env, act, from, to) {
  const m = await readMer(env, [act], from, to).catch(() => null);
  return m ? countedShare(m.rows[act], m.cfg[act]) : 1;
}

/** Per channel totals for the settings page: [{ key, label, kind, default, counts, sales, orders, unnamed }],
 *  biggest first. Same label from two keys (two Whatnot app ids) stays two rows: each is ticked on its own. */
export function channelSummary(rows, cfg) {
  const by = {};
  for (const r of rows || []) {
    const o = (by[r.channel] ??= { sales: 0, orders: 0 });
    o.sales += +r.sales || 0;
    o.orders += +r.orders || 0;
  }
  return Object.entries(by).map(([key, v]) => ({ ...describe(key), counts: counts(key, cfg), sales: Math.round(v.sales * 100) / 100, orders: v.orders }))
    .sort((a, b) => b.sales - a.sales);
}

/* ---------- Database ---------- */

export const CHANNEL_TABLE = `CREATE TABLE IF NOT EXISTS p_sales_channel (
  act_id TEXT NOT NULL, day TEXT NOT NULL, channel TEXT NOT NULL, sales REAL NOT NULL DEFAULT 0, orders INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (act_id, day, channel))`;

const inList = (n, start) => Array.from({ length: n }, (_, i) => `?${i + start}`).join(',');

/** Channel rows and settings for some brands over [from, to]: { rows: { brand: [...] }, cfg: { brand: cfg } }.
 *  A missing table (before the first sync) reads as no rows. */
export async function readMer(env, acts, from, to) {
  const list = [...new Set((acts || []).filter(Boolean))];
  const out = { rows: {}, cfg: {} };
  for (const a of list) out.cfg[a] = merConfig(null);
  if (!list.length || !env?.DB) return out;
  const { results } = await env.DB.prepare(
    `SELECT act_id, day, channel, sales, orders FROM p_sales_channel WHERE act_id IN (${inList(list.length, 3)}) AND day BETWEEN ?1 AND ?2`,
  ).bind(from, to, ...list).all().catch(() => ({ results: [] }));
  for (const r of results || []) (out.rows[r.act_id] ??= []).push(r);
  const { results: sets } = await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (${inList(list.length, 1)})`)
    .bind(...list.map(merSettingKey)).all().catch(() => ({ results: [] }));
  for (const s of sets || []) out.cfg[s.key.slice('merChannels:'.length)] = merConfig(s.value);
  return out;
}

/** The Triple Whale query for one brand's channel rows (Shopify orders only). tags = the brand's left-out tags. */
export function channelSql(tags) {
  const list = (tags || []).map(cleanTag).filter(Boolean).map(t => `'${t}'`);
  const tg = list.length ? `arrayFirst(t -> has([${list.join(',')}], lower(t)), tags)` : `''`;
  return `SELECT toString(event_date) AS d, lower(source_name) AS s, ${tg} AS tg, uniq(order_id) AS orders,
    SUM(gross_product_sales - discount_amount_for_product + shipping_price + fees + additional_revenue - refund_money) AS sales
    FROM orders_table WHERE event_date BETWEEN @startDate AND @endDate AND platform = 'shopify' AND cancelled_at IS NULL
    GROUP BY d, s, tg`;
}

/** Turn the query's answer into table rows: [{ day, channel, sales, orders }] (two sources that land on one key add up). */
export function rowsFromSql(rows) {
  const by = {};
  for (const r of rows || []) {
    const day = String(r.d || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const k = `${day}|${channelKey(r.s, r.tg)}`;
    const o = (by[k] ??= { day, channel: k.slice(11), sales: 0, orders: 0 });
    o.sales += Number(r.sales) || 0;
    o.orders += Number(r.orders) || 0;
  }
  return Object.values(by);
}

/**
 * Sync one brand's channel rows for [from, to] from Triple Whale. deps.sql({ shop, sql, from, to }) -> { rows } | { error }
 * (account-health's twSql). Every day in the window is replaced, so a channel that went away is cleared.
 * Returns { days, rows, channels } or { error }.
 */
export async function syncSalesChannels(env, deps, { act, shop, from, to }) {
  if (!shop) return { error: 'no Triple Whale shop' };
  const cfg = (await readMer(env, [act], from, from)).cfg[act];
  const r = await deps.sql({ shop, sql: channelSql(cfg.tags), from, to });
  if (!r || r.error || !Array.isArray(r.rows)) return { error: r?.error || 'no answer from Triple Whale' };
  const rows = rowsFromSql(r.rows);
  await env.DB.prepare(CHANNEL_TABLE).run();
  const stmts = [env.DB.prepare(`DELETE FROM p_sales_channel WHERE act_id = ?1 AND day BETWEEN ?2 AND ?3`).bind(act, from, to)];
  for (const x of rows) {
    stmts.push(env.DB.prepare(`INSERT INTO p_sales_channel (act_id, day, channel, sales, orders, synced_at) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))`)
      .bind(act, x.day, x.channel, Math.round(x.sales * 100) / 100, x.orders));
  }
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  return { days: new Set(rows.map(x => x.day)).size, rows: rows.length, channels: [...new Set(rows.map(x => x.channel))] };
}
