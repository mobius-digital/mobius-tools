/* Sales that count toward MER (2026-11-27, Cole). A brand's Shopify holds every order its warehouse ships, so
   marketplace and live-selling orders (Amazon, Whatnot, eBay, wholesale) sit inside store sales. Ads do not drive
   them, so MER and aMER count only the brand's MER channels:
     MER  = sales from the channels that count / all ad spend
     aMER = new-customer sales from those channels / all ad spend (the new-customer share applied to counted sales)
   Store sales, orders, AOV and profit stay whole-store. Per-platform ROAS is untouched.
   Default rule (Cole 2026-11-27): the brand's own website only (online store + its subscription renewals);
   marketplaces, live selling, wholesale and in-person POS do not; an unknown source counts until someone unticks it.
   Per brand setting `merChannels:<brand>` = { counts: { <channel>: true|false }, tags: [...] }.
   Data: p_sales_channel (act_id, day, channel, sales, orders), synced by account-health from Triple Whale.
   series.js puts the left-out sales per day in the pivot as `merExcluded`; dayEconomics turns it into
   `mer_sales` / `mer_new_rev`. Nothing here reads the database (queries.js metrics.salesChannels / merChannels,
   load.js loadShop). */
// from profit/worker/src/merchannels.js (KINDS, KNOWN, channelKey, describe, merConfig, counts, excludedByDay,
//      applyMerChannels, merSalesFor, merSalesOf, merRow, countedShare, channelSummary): a copy of the pure part, keep the two in step.

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
export const merSalesFor = (sales, excluded) => (sales == null ? null : Math.max(0, sales - (+excluded || 0)));

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

/** The share of sales that counts (0 to 1) over some channel rows, or 1 when there are none. For live hourly numbers
 *  (the War Room ladder), where sales come by the hour with no channel split: the brand's recent mix stands in. */
export function countedShare(rows, cfg) {
  let all = 0, out = 0;
  for (const r of rows || []) { const s = +r.sales || 0; all += s; if (!counts(r.channel, cfg)) out += s; }
  return all > 0 ? Math.max(0, Math.min(1, 1 - out / all)) : 1;
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

