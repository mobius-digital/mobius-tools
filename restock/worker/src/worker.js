/**
 * Mobius Restock — inventory forecasting worker (Cloudflare Workers)
 *
 * Snapshots Shopify inventory + sales daily, computes a weighted
 * sell-through velocity per variant, projects days-of-stock remaining,
 * compares that to each product's manufacturer lead time, and alerts
 * Slack: a morning digest plus an instant ping the moment anything
 * crosses into "reorder now".
 *
 * Bindings (see wrangler.toml):
 *   KV                     — KV namespace: history, catalog, settings, state
 * Secrets (wrangler secret put <NAME>):
 *   ADMIN_TOKEN            — long random string; guards the API
 *   SLACK_BOT_TOKEN        — xoxb- token (same Slack app as Mobius Pulse)
 *   SHOPIFY_CLIENT_ID_LUCKY + SHOPIFY_CLIENT_SECRET_LUCKY
 *                          — Dev Dashboard app credentials for Lucky Golf
 *                            (one pair per store; worker exchanges them for
 *                            24h access tokens via client_credentials grant).
 *                            Legacy alternative: SHOPIFY_TOKEN_<STOREID>.
 */

/* ------------------------------------------------------------------ */
/*  Stores — add a store: append here + set its SHOPIFY_TOKEN_ secret  */
/* ------------------------------------------------------------------ */

const STORES = [
  {
    id: 'lucky',
    name: 'Lucky Golf',
    domain: 'lucky-wedges.myshopify.com',
    tz: 'America/Chicago',
  },
];

const API_VERSION = '2026-01';
const HISTORY_DAYS = 200;          // rolling window of daily history kept in KV
const DASHBOARD_URL = 'https://tools.go-mobius-digital.com/restock/';

/* Velocity blend: three windows, recency-weighted. */
const WINDOWS = [
  { days: 14, weight: 0.45 },
  { days: 30, weight: 0.35 },
  { days: 90, weight: 0.20 },
];
/* If the 14-day rate exceeds SPIKE_CAP × the 90-day rate (promo, viral
 * moment), the 14-day input is capped at that multiple for projection —
 * the spike is flagged, not blindly extrapolated. */
const SPIKE_CAP = 2.0;
const SPIKE_FLAG = 2.0;   // v14/v90 above this ⇒ trend "spiking"
const RISE_FLAG = 1.35;
const FALL_FLAG = 0.65;

/* ------------------------------------------------------------------ */
/*  Small date helpers (all bucketing is in the store's local zone)    */
/* ------------------------------------------------------------------ */

function localDate(tz, d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d); // → YYYY-MM-DD
}

function tzOffsetStr(tz, d = new Date()) {
  try {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(d).find(p => p.type === 'timeZoneName')?.value || '';
    const m = s.match(/GMT([+-]\d{2}):?(\d{2})?/);
    if (m) return `${m[1]}:${m[2] || '00'}`;
  } catch (e) { /* fall through */ }
  return '-06:00';
}

function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO instant of local midnight `daysAgo` days before today (store tz). */
function localMidnightISO(tz, daysAgo) {
  const day = addDays(localDate(tz), -daysAgo);
  return `${day}T00:00:00${tzOffsetStr(tz)}`;
}

const gidTail = gid => String(gid || '').split('/').pop();

/* ------------------------------------------------------------------ */
/*  Shopify Admin GraphQL                                              */
/* ------------------------------------------------------------------ */

/* Auth: either a static token (legacy custom app / offline token) via
 * SHOPIFY_TOKEN_<ID>, or — the post-2026 Dev Dashboard flow — a client
 * credentials grant via SHOPIFY_CLIENT_ID_<ID> + SHOPIFY_CLIENT_SECRET_<ID>.
 * Client-credentials tokens expire every 24h; we exchange + cache in KV. */

const staticToken = (env, store) => env[`SHOPIFY_TOKEN_${store.id.toUpperCase()}`];
function clientCreds(env, store) {
  const u = store.id.toUpperCase();
  const id = env[`SHOPIFY_CLIENT_ID_${u}`], secret = env[`SHOPIFY_CLIENT_SECRET_${u}`];
  return id && secret ? { id, secret } : null;
}
const hasShopifyAuth = (env, store) => !!(staticToken(env, store) || clientCreds(env, store));

async function getAccessToken(env, store, { force = false } = {}) {
  const st = staticToken(env, store);
  if (st) return st;
  const creds = clientCreds(env, store);
  if (!creds) {
    const u = store.id.toUpperCase();
    throw new Error(`missing Shopify credentials: set SHOPIFY_CLIENT_ID_${u} + SHOPIFY_CLIENT_SECRET_${u} (Dev Dashboard app) or SHOPIFY_TOKEN_${u}`);
  }
  const key = `shoptoken:${store.id}`;
  if (!force) {
    const cached = await env.KV.get(key, 'json');
    if (cached && cached.expiresAt > Date.now() + 10 * 60 * 1000) return cached.token;
  }
  const res = await fetch(`https://${store.domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: creds.id, client_secret: creds.secret,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    throw new Error(`Shopify token exchange failed (HTTP ${res.status}): ${JSON.stringify(j).slice(0, 200)}`);
  }
  const ttl = j.expires_in || 86399;
  await env.KV.put(key, JSON.stringify({
    token: j.access_token, expiresAt: Date.now() + ttl * 1000,
  }), { expirationTtl: ttl });
  return j.access_token;
}

async function shopify(env, store, query, variables = {}) {
  let token = await getAccessToken(env, store);
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://${store.domain}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429) { await new Promise(r => setTimeout(r, 1500)); continue; }
    if (res.status === 401 && !staticToken(env, store)) {
      // cached client-credentials token expired or the secret was rotated
      token = await getAccessToken(env, store, { force: true });
      continue;
    }
    const json = await res.json();
    if (json.errors?.some(e => e.extensions?.code === 'THROTTLED')) {
      await new Promise(r => setTimeout(r, 1500)); continue;
    }
    if (json.errors) throw new Error(`Shopify: ${JSON.stringify(json.errors).slice(0, 300)}`);
    return json.data;
  }
  throw new Error('Shopify: throttled after retries');
}

const CATALOG_QUERY = `
query($after: String) {
  products(first: 8, query: "status:active", after: $after) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id title productType vendor
      featuredMedia { preview { image { url(transform: {maxWidth: 160, maxHeight: 160}) } } }
      leadMeta: metafield(namespace: "custom", key: "lead_time_days") { value }
      moqMeta: metafield(namespace: "custom", key: "moq") { value }
      variants(first: 100) { edges { node {
        id title sku inventoryQuantity createdAt
        inventoryItem { tracked }
      } } }
    } }
  }
}`;

async function fetchCatalog(env, store) {
  const products = [];
  let after = null;
  do {
    const data = await shopify(env, store, CATALOG_QUERY, { after });
    const page = data.products;
    for (const { node: p } of page.edges) {
      const override = parseInt(p.leadMeta?.value, 10);
      const moq = parseInt(p.moqMeta?.value, 10);
      products.push({
        moq: Number.isFinite(moq) && moq > 0 ? moq : null,
        id: gidTail(p.id),
        title: p.title,
        type: p.productType || '',
        vendor: p.vendor || '',
        image: p.featuredMedia?.preview?.image?.url || null,
        leadOverride: Number.isFinite(override) && override > 0 ? override : null,
        variants: p.variants.edges.map(({ node: v }) => ({
          id: gidTail(v.id),
          title: v.title === 'Default Title' ? '' : v.title,
          sku: v.sku || '',
          inv: v.inventoryQuantity ?? 0,
          createdAt: v.createdAt || null,
          tracked: !!v.inventoryItem?.tracked,
        })),
      });
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return { fetchedAt: new Date().toISOString(), products };
}

const ORDERS_QUERY = `
query($q: String!, $after: String) {
  orders(first: 25, query: $q, after: $after, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      createdAt cancelledAt
      lineItems(first: 25) { edges { node { quantity variant { id } } } }
    } }
  }
}`;

/**
 * Fetch orders since `sinceISO`, bucketing unit sales by store-local day.
 * Stops after `maxPages` (Workers cap subrequests per invocation) and
 * returns a cursor so the caller can resume.
 */
async function fetchSales(env, store, sinceISO, { after = null, maxPages = 30 } = {}) {
  const salesByDate = {};   // { 'YYYY-MM-DD': { [variantId]: qty } }
  let pages = 0, orders = 0, done = false;
  const q = `created_at:>='${sinceISO}'`;
  do {
    const data = await shopify(env, store, ORDERS_QUERY, { q, after });
    const page = data.orders;
    for (const { node: o } of page.edges) {
      if (o.cancelledAt) continue;
      orders++;
      const day = localDate(store.tz, new Date(o.createdAt));
      const bucket = (salesByDate[day] ||= {});
      for (const { node: li } of o.lineItems.edges) {
        const vid = gidTail(li.variant?.id);
        if (!vid) continue; // deleted variant / custom line item
        bucket[vid] = (bucket[vid] || 0) + (li.quantity || 0);
      }
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    done = !after;
    pages++;
  } while (after && pages < maxPages);
  return { salesByDate, orders, cursor: after, done };
}

/* ------------------------------------------------------------------ */
/*  History (KV)                                                       */
/* ------------------------------------------------------------------ */

async function getHistory(env, store) {
  return (await env.KV.get(`history:${store.id}`, 'json'))
    || { startDate: null, days: {}, inventory: {} };
}

function mergeSales(history, salesByDate, { overwriteDates = null } = {}) {
  if (overwriteDates) for (const d of overwriteDates) delete history.days[d];
  for (const [day, byVariant] of Object.entries(salesByDate)) {
    const bucket = (history.days[day] ||= {});
    for (const [vid, qty] of Object.entries(byVariant)) {
      bucket[vid] = (bucket[vid] || 0) + qty;
    }
  }
  if (!history.startDate || Object.keys(salesByDate).some(d => d < history.startDate)) {
    const all = Object.keys(history.days).sort();
    history.startDate = all[0] || history.startDate;
  }
}

function pruneHistory(history, tz) {
  const cutoff = addDays(localDate(tz), -HISTORY_DAYS);
  for (const key of ['days', 'inventory']) {
    for (const d of Object.keys(history[key])) if (d < cutoff) delete history[key][d];
  }
  if (history.startDate && history.startDate < cutoff) history.startDate = cutoff;
}

/* ------------------------------------------------------------------ */
/*  Settings                                                           */
/* ------------------------------------------------------------------ */

/* Seeded with example profiles so day one isn't a wall of "unmapped" —
 * the dashboard flags these as defaults to review. */
const DEFAULT_SETTINGS = {
  bufferDays: 10,          // customs / anything-goes-wrong padding
  watchWindow: 30,         // days ahead of the reorder point to start watching
  targetCoverDays: 180,    // reorder suggestions aim for this much coverage
  digestHourLocal: 6,      // store-local hour the morning digest sends
  digestMode: 'always',    // 'always' | 'issues'
  reviewedDefaults: false, // dashboard shows a "review lead times" banner until true
  profiles: [
    { id: 'clubs', name: 'Clubs', productionDays: 60, shippingDays: 30 },
    { id: 'softgoods', name: 'Soft Goods', productionDays: 45, shippingDays: 30 },
    { id: 'accessories', name: 'Accessories', productionDays: 30, shippingDays: 30 },
  ],
  typeMap: {
    'Wedges': 'clubs', 'Putter': 'clubs', 'Driver': 'clubs',
    'Hybrids': 'clubs', 'Shaft': 'clubs',
    'Apparel': 'softgoods', 'HAT': 'softgoods', 'Glove': 'softgoods',
    'Head Cover': 'softgoods',
    'Grip': 'accessories', 'Grips': 'accessories', 'Tees': 'accessories',
  },
  muted: [],               // variant or product ids to silence ("v123", "p456")
  stores: { lucky: { channel: '' } },
};

async function getSettings(env) {
  const s = await env.KV.get('settings', 'json');
  if (!s) return structuredClone(DEFAULT_SETTINGS);
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (s[k] === undefined) s[k] = structuredClone(v);
  }
  for (const store of STORES) if (!s.stores[store.id]) s.stores[store.id] = { channel: '' };
  return s;
}

/* ------------------------------------------------------------------ */
/*  Forecast math                                                      */
/* ------------------------------------------------------------------ */

/**
 * Sales rate for one variant over a trailing window ending yesterday.
 * Days where the variant sat at zero stock with zero sales are excluded
 * from the denominator — being sold out must not read as selling slowly.
 * Days before the variant existed (`sinceDay` = its Shopify createdAt)
 * are excluded entirely — a 10-day-old product is judged on its 10 real
 * days, not diluted across a 90-day window of pre-launch zeros.
 * (Inventory snapshots only exist from tracking start, so backfilled
 * days always count.)
 */
function windowRate(history, vid, endDay, days, sinceDay) {
  let sold = 0, eff = 0, have = 0;
  for (let i = 0; i < days; i++) {
    const day = addDays(endDay, -i);
    if (history.startDate && day < history.startDate) break;
    if (sinceDay && day < sinceDay) break;
    have++;
    const qty = history.days[day]?.[vid] || 0;
    const inv = history.inventory[day]?.[vid];
    const oosDay = inv !== undefined && inv <= 0 && qty === 0;
    if (!oosDay) eff++;
    sold += qty;
  }
  return { sold, days: have, eff: Math.max(eff, 1), rate: have ? sold / Math.max(eff, 1) : 0 };
}

function blendVelocity(rates, { isNew = false } = {}) {
  const [r14, r30, r90] = rates;
  // promo damper: cap the short window's contribution when it's spiking.
  // Skipped for new products — their windows are launch-truncated, so a
  // strong launch is the baseline, not a spike to damp away.
  const ratio = r90.rate > 0.02 ? r14.rate / r90.rate : (r14.rate > 0 ? 99 : 1);
  const spike = !isNew && ratio > SPIKE_CAP && r90.rate > 0.02;
  const damped14 = spike ? r90.rate * SPIKE_CAP : r14.rate;

  let vel = 0, velRaw = 0, wSum = 0;
  WINDOWS.forEach((w, i) => {
    if (rates[i].days < Math.min(7, w.days)) return; // window has no real data yet
    const rate = i === 0 ? damped14 : rates[i].rate;
    vel += rate * w.weight;
    velRaw += rates[i].rate * w.weight;
    wSum += w.weight;
  });
  if (wSum > 0) { vel /= wSum; velRaw /= wSum; }
  else if (rates[0].days > 0) { vel = velRaw = rates[0].rate; } // <7d old: use what exists

  const trend = isNew ? 'new'
    : ratio >= SPIKE_FLAG ? 'spiking'
    : ratio >= RISE_FLAG ? 'rising'
    : ratio <= FALL_FLAG ? 'falling' : 'steady';
  return { velocity: vel, velocityRaw: velRaw, trend, damped: vel !== velRaw };
}

const STATUS_RANK = { stockout: 5, reorder: 4, watch: 3, unmapped: 2, healthy: 1, slow: 1, dormant: 0, muted: 0 };

function computeReport(store, catalog, history, settings) {
  const endDay = addDays(localDate(store.tz), -1); // windows end yesterday (today is partial)
  const historyDays = history.startDate
    ? Math.max(0, Math.round((Date.parse(endDay) - Date.parse(history.startDate)) / 86400000) + 1)
    : 0;
  const profileById = Object.fromEntries(settings.profiles.map(p => [p.id, p]));
  const unmappedTypes = new Set();
  const products = [];

  for (const p of catalog.products) {
    const tracked = p.variants.filter(v => v.tracked);
    if (!tracked.length) continue; // gift cards, checkout add-ons

    const profile = profileById[settings.typeMap[p.type]] || null;
    const leadBase = p.leadOverride ?? (profile ? profile.productionDays + profile.shippingDays : null);
    const leadDays = leadBase != null ? leadBase + settings.bufferDays : null;
    const leadSource = p.leadOverride != null ? 'metafield' : profile ? 'profile' : null;
    if (!leadSource) unmappedTypes.add(p.type || '(no type)');
    const productMuted = settings.muted.includes(`p${p.id}`);

    const variants = tracked.map(v => {
      const launchDay = v.createdAt ? localDate(store.tz, new Date(v.createdAt)) : null;
      const ageDays = launchDay
        ? Math.max(0, Math.round((Date.parse(endDay) - Date.parse(launchDay)) / 86400000) + 1)
        : null;
      const isNew = ageDays != null && ageDays < 14;
      const rates = WINDOWS.map(w => windowRate(history, v.id, endDay, w.days, launchDay));
      const { velocity, velocityRaw, trend, damped } = blendVelocity(rates, { isNew });
      const daysLeft = velocity > 0.001 ? v.inv / velocity : null;
      const muted = productMuted || settings.muted.includes(`v${v.id}`);
      const noSales90 = rates[2].sold === 0;
      const series = [];
      for (let i = 89; i >= 0; i--) series.push(history.days[addDays(endDay, -i)]?.[v.id] || 0);

      let status;
      if (muted) status = 'muted';
      else if (v.inv <= 0) status = noSales90 ? 'dormant' : 'stockout';
      else if (!leadSource) status = 'unmapped';
      else if (velocity <= 0.001) status = 'slow';
      else if (daysLeft <= leadDays) status = 'reorder';
      else if (daysLeft <= leadDays + settings.watchWindow) status = 'watch';
      else status = 'healthy';

      const suggestedQty = velocity > 0.001 && leadDays != null
        ? Math.max(0, Math.ceil(velocity * (settings.targetCoverDays + leadDays) - Math.max(v.inv, 0)))
        : null;

      return {
        id: v.id, sku: v.sku, title: v.title, inv: v.inv,
        windows: rates.map((r, i) => ({ days: WINDOWS[i].days, sold: r.sold, rate: +r.rate.toFixed(4), covered: r.days })),
        velocity: +velocity.toFixed(4), velocityRaw: +velocityRaw.toFixed(4),
        trend, damped, isNew, ageDays,
        daysLeft: daysLeft != null ? Math.round(daysLeft) : null,
        status, muted, suggestedQty, series,
      };
    });

    // product-level series = sum of variant series
    const series = Array.from({ length: 90 },
      (_, i) => variants.reduce((s, v) => s + v.series[i], 0));

    const statusCounts = {};
    for (const v of variants) statusCounts[v.status] = (statusCounts[v.status] || 0) + 1;

    const totalInv = tracked.reduce((s, v) => s + v.inv, 0);
    const velocity = variants.reduce((s, v) => s + v.velocity, 0);
    const worst = variants.reduce((w, v) => STATUS_RANK[v.status] > STATUS_RANK[w] ? v.status : w, 'dormant');
    const alertable = variants.filter(v => v.status === 'reorder' || v.status === 'stockout');

    const combinedNeed = variants.reduce((s, v) => s + (v.suggestedQty || 0), 0);
    products.push({
      id: p.id, title: p.title, type: p.type, vendor: p.vendor, image: p.image,
      moq: p.moq ?? null, combinedNeed,
      moqMet: p.moq ? combinedNeed >= p.moq : null,
      leadDays, leadSource, profileName: profile?.name || null,
      leadBreakdown: leadSource === 'profile'
        ? { production: profile.productionDays, shipping: profile.shippingDays, buffer: settings.bufferDays }
        : leadSource === 'metafield'
          ? { override: p.leadOverride, buffer: settings.bufferDays } : null,
      totalInv, velocity: +velocity.toFixed(4),
      daysLeft: velocity > 0.001 ? Math.round(totalInv / velocity) : null,
      status: worst, statusCounts, muted: productMuted,
      alertCount: alertable.length,
      seriesEnd: endDay, series,
      variants,
    });
  }

  products.sort((a, b) => (STATUS_RANK[b.status] - STATUS_RANK[a.status])
    || ((a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9)));

  const counts = { stockout: 0, reorder: 0, watch: 0, unmapped: 0, healthy: 0, slow: 0, dormant: 0, muted: 0 };
  for (const p of products) for (const v of p.variants) counts[v.status]++;

  return {
    store: store.id, storeName: store.name, generatedAt: new Date().toISOString(),
    catalogFetchedAt: catalog.fetchedAt, historyDays, historyStart: history.startDate,
    counts, unmappedTypes: [...unmappedTypes], products,
  };
}

/* ------------------------------------------------------------------ */
/*  Slack                                                              */
/* ------------------------------------------------------------------ */

async function slackApi(env, method, body) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) console.log(`Slack ${method} error: ${json.error}`);
  return json;
}

const fmtDays = d => d == null ? '—' : d >= 9000 ? '∞' : `${d}d`;
const skuOr = v => v.sku || v.title || 'variant';

/** One status line for a variant: "~34d left · lead 85d · need ~402 ⚡" —
 *  "need" is demand for the coverage target, not an order instruction. */
function lineBody(p, v) {
  const lead = p.leadDays != null ? ` · lead ${p.leadDays}d` : '';
  const need = v.suggestedQty ? ` · need ~${v.suggestedQty}` : '';
  const flag = v.trend === 'spiking' ? ' ⚡' : v.isNew ? ' 🆕' : '';
  const left = v.status === 'stockout' ? '*OUT OF STOCK*' : `~${fmtDays(v.daysLeft)} left`;
  return `${left}${lead}${need}${flag}`;
}

/** MOQ context for a product: compares combined demand across ALL variants
 *  (that's the number a product-level MOQ is judged against). */
function moqNote(p) {
  if (!p.moq) return '';
  return p.combinedNeed >= p.moq
    ? ` · MOQ ${p.moq} met ✓`
    : ` · combined need ${p.combinedNeed} of MOQ ${p.moq} — consider waiting`;
}

/** Product-grouped lines: single-variant products on one line, multi-variant
 *  products as a bold product name with indented variant bullets. */
function productLines(p, statuses, maxVariants = 8) {
  const hits = p.variants.filter(v => statuses.includes(v.status));
  if (!hits.length) return null;
  if (p.variants.length === 1) return `*${p.title}* — ${lineBody(p, hits[0])}${moqNote(p)}`;
  const combined = p.combinedNeed ? ` · need ~${p.combinedNeed} total` : '';
  const rows = hits.slice(0, maxVariants).map(v => `        •  \`${skuOr(v)}\` — ${lineBody(p, v)}`);
  if (hits.length > maxVariants) rows.push(`        _…and ${hits.length - maxVariants} more variants_`);
  return `*${p.title}*  (${hits.length}/${p.variants.length} variants${combined}${moqNote(p)})\n${rows.join('\n')}`;
}

function digestMessage(store, report, settings) {
  const c = report.counts;
  const issues = c.stockout + c.reorder;
  const color = issues ? '#D0342C' : c.watch ? '#ECB22E' : '#2EB67D';
  const date = new Date().toLocaleDateString('en-US',
    { month: 'short', day: 'numeric', year: 'numeric', timeZone: store.tz });

  const reds = [], yellows = [];
  for (const p of report.products) {
    const r = productLines(p, ['stockout', 'reorder']);
    if (r) reds.push(r);
    const y = productLines(p, ['watch']);
    if (y) yellows.push(y);
  }
  const cap = (arr, n) => arr.length > n
    ? [...arr.slice(0, n), `_…and ${arr.length - n} more products — see the dashboard_`] : arr;

  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: `📦  *${store.name} — Inventory digest* · ${date}` } },
    { type: 'section', text: { type: 'mrkdwn',
      text: `🔴 ${c.stockout + c.reorder} reorder now · 🟡 ${c.watch} watch · 🟢 ${c.healthy + c.slow} healthy` +
            (c.unmapped ? ` · ⚠️ ${c.unmapped} unmapped` : '') } },
    { type: 'divider' },
  ];
  if (reds.length) blocks.push({ type: 'section', text: { type: 'mrkdwn',
    text: `*🔴 Reorder now*\n${cap(reds, 8).join('\n')}`.slice(0, 2900) } });
  if (yellows.length) blocks.push({ type: 'section', text: { type: 'mrkdwn',
    text: `*🟡 Watch — order window approaching*\n${cap(yellows, 8).join('\n')}`.slice(0, 2900) } });
  if (!reds.length && !yellows.length) blocks.push({ type: 'section',
    text: { type: 'mrkdwn', text: '✅ All clear — nothing needs reordering today.' } });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn',
    text: `"need" = demand to hit the coverage target, not an order instruction · ⚡ spiking (damped) · 🆕 new product   ·   <${DASHBOARD_URL}|Open Restock dashboard →>` }] });

  return {
    attachments: [{ color, fallback: `${store.name} inventory: ${issues} reorder, ${c.watch} watch`, blocks }],
  };
}

function redAlertMessage(store, items) {
  // items: [{p: product, v: variant}] — group under product names
  const byProduct = new Map();
  for (const { p, v } of items) {
    if (!byProduct.has(p.id)) byProduct.set(p.id, { p, vs: [] });
    byProduct.get(p.id).vs.push(v);
  }
  const lines = [...byProduct.values()].map(({ p, vs }) =>
    p.variants.length === 1
      ? `*${p.title}* — ${lineBody(p, vs[0])}${moqNote(p)}`
      : `*${p.title}*${moqNote(p)}\n${vs.slice(0, 8).map(v => `        •  \`${skuOr(v)}\` — ${lineBody(p, v)}`).join('\n')}`);
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn',
      text: `🔴  *${store.name} — Reorder point crossed*` } },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn',
      text: lines.slice(0, 12).join('\n').slice(0, 2900) } },
    { type: 'context', elements: [{ type: 'mrkdwn',
      text: `At current sell-through these run out inside their manufacturer lead time.   ·   <${DASHBOARD_URL}|Open dashboard →>` }] },
  ];
  return {
    attachments: [{ color: '#D0342C',
      fallback: `${store.name}: ${items.length} item(s) crossed the reorder point`, blocks }],
  };
}

/* ------------------------------------------------------------------ */
/*  Snapshot run                                                       */
/* ------------------------------------------------------------------ */

async function runSnapshot(env, store, { digest = false, forceDigest = false } = {}) {
  const settings = await getSettings(env);
  const [history, prevState] = await Promise.all([
    getHistory(env, store),
    env.KV.get(`state:${store.id}`, 'json').then(v => v || { variants: {} }),
  ]);

  // 1. catalog + inventory snapshot
  const catalog = await fetchCatalog(env, store);
  const today = localDate(store.tz);
  const invToday = {};
  for (const p of catalog.products) for (const v of p.variants) {
    if (v.tracked) invToday[v.id] = v.inv;
  }
  history.inventory[today] = invToday;

  // 2. re-pull sales for the last 3 local days (idempotent overwrite)
  const overwrite = [addDays(today, -2), addDays(today, -1), today];
  const { salesByDate } = await fetchSales(env, store, localMidnightISO(store.tz, 2), { maxPages: 8 });
  mergeSales(history, salesByDate, { overwriteDates: overwrite });
  if (!history.startDate) history.startDate = overwrite[0];
  pruneHistory(history, store.tz);

  // 3. compute + detect transitions
  const report = computeReport(store, catalog, history, settings);
  const newState = { variants: {}, lastDigestDate: prevState.lastDigestDate || null };
  const newReds = [];
  for (const p of report.products) {
    for (const v of p.variants) {
      newState.variants[v.id] = v.status;
      const before = prevState.variants[v.id];
      const isRed = v.status === 'reorder' || v.status === 'stockout';
      const wasRed = before === 'reorder' || before === 'stockout';
      if (isRed && before && !wasRed) newReds.push({ p, v });
    }
  }

  // 4. persist
  await Promise.all([
    env.KV.put(`history:${store.id}`, JSON.stringify(history)),
    env.KV.put(`catalog:${store.id}`, JSON.stringify(catalog)),
    env.KV.put('lastRun', new Date().toISOString()),
  ]);

  // 5. Slack
  const channel = settings.stores[store.id]?.channel;
  let alerted = 0, digested = false;
  if (channel && env.SLACK_BOT_TOKEN) {
    if (newReds.length) {
      await slackApi(env, 'chat.postMessage',
        { channel, ...redAlertMessage(store, newReds), unfurl_links: false });
      alerted = newReds.length;
    }
    const issues = report.counts.stockout + report.counts.reorder + report.counts.watch;
    const wantDigest = forceDigest ||
      (digest && newState.lastDigestDate !== today &&
        (settings.digestMode === 'always' || issues > 0));
    if (wantDigest) {
      await slackApi(env, 'chat.postMessage',
        { channel, ...digestMessage(store, report, settings), unfurl_links: false });
      newState.lastDigestDate = today;
      digested = true;
    }
  }
  await env.KV.put(`state:${store.id}`, JSON.stringify(newState));

  return { store: store.id, products: report.products.length, counts: report.counts,
           newReds: alerted, digested, at: report.generatedAt };
}

/* ------------------------------------------------------------------ */
/*  Backfill (resumable — Workers cap subrequests per invocation)      */
/* ------------------------------------------------------------------ */

async function runBackfill(env, store, days) {
  const key = `backfill:${store.id}`;
  const job = (await env.KV.get(key, 'json'))
    || { since: localMidnightISO(store.tz, days), cursor: null, orders: 0 };

  const { salesByDate, orders, cursor, done } =
    await fetchSales(env, store, job.since, { after: job.cursor, maxPages: 35 });

  const history = await getHistory(env, store);
  // first chunk of a fresh job: clear the range so re-runs don't double-count
  if (!job.cursor) {
    const startDay = job.since.slice(0, 10);
    for (const d of Object.keys(history.days)) if (d >= startDay) delete history.days[d];
  }
  mergeSales(history, salesByDate);
  pruneHistory(history, store.tz);
  await env.KV.put(`history:${store.id}`, JSON.stringify(history));

  job.orders += orders;
  if (done) {
    await env.KV.delete(key);
  } else {
    job.cursor = cursor;
    await env.KV.put(key, JSON.stringify(job), { expirationTtl: 3600 });
  }
  return { done, ordersProcessed: job.orders, historyStart: history.startDate };
}

/* ------------------------------------------------------------------ */
/*  HTTP routes                                                        */
/* ------------------------------------------------------------------ */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', ...CORS },
});

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Valid credentials: the dashboard-set password (hash in KV) or the
 *  ADMIN_TOKEN secret, which stays valid as a master/recovery key. */
async function isAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const tok = auth.slice(7);
  if (env.ADMIN_TOKEN && tok === env.ADMIN_TOKEN) return true;
  const stored = await env.KV.get('passwordHash');
  return !!stored && (await sha256hex(tok)) === stored;
}

const storeFrom = url => STORES.find(s => s.id === (url.searchParams.get('store') || STORES[0].id));

export default {
  async scheduled(event, env, ctx) {
    const settings = await getSettings(env);
    const digestHour = settings.digestHourLocal ?? 6;
    ctx.waitUntil(Promise.allSettled(STORES.map(s => {
      const localHour = (+new Intl.DateTimeFormat('en-US',
        { timeZone: s.tz, hour: 'numeric', hour12: false }).format(new Date())) % 24;
      return runSnapshot(env, s, { digest: localHour === digestHour });
    })));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (path === '/health') {
      return json({ ok: true, lastRun: await env.KV.get('lastRun') });
    }

    if (!path.startsWith('/api/')) return json({ error: 'not found' }, 404);
    if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
    const store = storeFrom(url);
    if (!store) return json({ error: 'unknown store' }, 400);

    try {
      if (path === '/api/stores') {
        const out = [];
        for (const s of STORES) {
          const history = await getHistory(env, s);
          out.push({
            id: s.id, name: s.name, domain: s.domain, tz: s.tz,
            hasToken: hasShopifyAuth(env, s),
            historyStart: history.startDate,
            historyDays: Object.keys(history.days).length,
          });
        }
        return json({ stores: out, slackConfigured: !!env.SLACK_BOT_TOKEN });
      }

      if (path === '/api/report') {
        // computed live from the latest snapshot data, so settings changes
        // (mutes, lead times, thresholds) apply immediately — no re-snapshot
        const [catalog, history, settings] = await Promise.all([
          env.KV.get(`catalog:${store.id}`, 'json'),
          getHistory(env, store),
          getSettings(env),
        ]);
        if (!catalog) return json({ error: 'no snapshot yet — run one from Settings' }, 404);
        return json(computeReport(store, catalog, history, settings));
      }

      if (path === '/api/settings' && request.method === 'GET') {
        return json(await getSettings(env));
      }

      if (path === '/api/settings' && request.method === 'PUT') {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') return json({ error: 'bad body' }, 400);
        const cur = await getSettings(env);
        const num = (v, fb, lo, hi) => {
          const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fb;
        };
        const next = {
          bufferDays: num(body.bufferDays, cur.bufferDays, 0, 120),
          watchWindow: num(body.watchWindow, cur.watchWindow, 0, 180),
          targetCoverDays: num(body.targetCoverDays, cur.targetCoverDays, 30, 720),
          digestHourLocal: num(body.digestHourLocal, cur.digestHourLocal ?? 6, 0, 23),
          digestMode: body.digestMode === 'issues' ? 'issues' : 'always',
          reviewedDefaults: body.reviewedDefaults === undefined
            ? cur.reviewedDefaults : !!body.reviewedDefaults,
          profiles: Array.isArray(body.profiles)
            ? body.profiles.filter(p => p && p.id && p.name).map(p => ({
                id: String(p.id).slice(0, 40), name: String(p.name).slice(0, 60),
                productionDays: num(p.productionDays, 30, 0, 365),
                shippingDays: num(p.shippingDays, 30, 0, 365),
              }))
            : cur.profiles,
          typeMap: body.typeMap && typeof body.typeMap === 'object'
            ? Object.fromEntries(Object.entries(body.typeMap)
                .filter(([, v]) => typeof v === 'string')
                .map(([k, v]) => [String(k).slice(0, 80), v.slice(0, 40)]))
            : cur.typeMap,
          muted: Array.isArray(body.muted)
            ? body.muted.map(String).filter(m => /^[pv]\d+$/.test(m)).slice(0, 500)
            : cur.muted,
          stores: { ...cur.stores },
        };
        if (body.stores && typeof body.stores === 'object') {
          for (const s of STORES) {
            if (body.stores[s.id]?.channel !== undefined) {
              next.stores[s.id] = { channel: String(body.stores[s.id].channel) };
            }
          }
        }
        await env.KV.put('settings', JSON.stringify(next));
        return json(next);
      }

      if (path === '/api/channels') {
        const chans = [];
        let cursor = '';
        do {
          const qs = new URLSearchParams({
            types: 'public_channel,private_channel',
            exclude_archived: 'true', limit: '200',
            ...(cursor ? { cursor } : {}),
          });
          const res = await fetch(`https://slack.com/api/conversations.list?${qs}`, {
            headers: { 'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}` },
          });
          const r = await res.json();
          if (!r.ok) return json({ error: r.error || 'slack error' }, 502);
          for (const c of r.channels || []) {
            chans.push({ id: c.id, name: c.name, is_member: !!c.is_member, is_private: !!c.is_private });
          }
          cursor = r.response_metadata?.next_cursor || '';
        } while (cursor);
        chans.sort((a, b) => a.name.localeCompare(b.name));
        return json({ channels: chans });
      }

      if (path === '/api/snapshot' && request.method === 'POST') {
        return json(await runSnapshot(env, store));
      }

      if (path === '/api/digest' && request.method === 'POST') {
        return json(await runSnapshot(env, store, { forceDigest: true }));
      }

      if (path === '/api/set-type' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const pid = String(body.productId || '').replace(/\D/g, '');
        const type = String(body.type || '').trim().slice(0, 80);
        if (!pid || !type) return json({ error: 'productId and type required' }, 400);
        const MUT = `
          mutation($product: ProductUpdateInput!) {
            productUpdate(product: $product) {
              product { id productType }
              userErrors { field message }
            }
          }`;
        const vars = { product: { id: `gid://shopify/Product/${pid}`, productType: type } };
        let data;
        for (let attempt = 0; ; attempt++) {
          try {
            data = await shopify(env, store, MUT, vars);
            break;
          } catch (err) {
            const m = String(err.message || err);
            if (/ACCESS_DENIED|write_products/i.test(m)) {
              // scopes may have been widened after the current token was cached —
              // force a fresh token once before concluding the scope is missing
              if (attempt === 0 && clientCreds(env, store)) {
                await getAccessToken(env, store, { force: true });
                continue;
              }
              return json({ error: 'Shopify app lacks the write_products scope — add it in the Dev Dashboard (Apps → Mobius Restock → scopes), release + reinstall, then retry.' }, 403);
            }
            throw err;
          }
        }
        const errs = data.productUpdate?.userErrors;
        if (errs?.length) return json({ error: errs.map(e => e.message).join('; ') }, 400);
        // patch the cached catalog so the dashboard reflects it immediately
        const catalog = await env.KV.get(`catalog:${store.id}`, 'json');
        if (catalog) {
          const p = catalog.products.find(p => p.id === pid);
          if (p) { p.type = type; await env.KV.put(`catalog:${store.id}`, JSON.stringify(catalog)); }
        }
        return json({ ok: true, productId: pid, type });
      }

      if (path === '/api/set-moq' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const pid = String(body.productId || '').replace(/\D/g, '');
        const moq = Math.max(0, Math.floor(Number(body.moq) || 0)); // 0 = no MOQ
        if (!pid) return json({ error: 'productId required' }, 400);
        try {
          const data = await shopify(env, store, `
            mutation($m: [MetafieldsSetInput!]!) {
              metafieldsSet(metafields: $m) {
                metafields { id }
                userErrors { field message }
              }
            }`, { m: [{ ownerId: `gid://shopify/Product/${pid}`, namespace: 'custom',
                        key: 'moq', type: 'number_integer', value: String(moq) }] });
          const errs = data.metafieldsSet?.userErrors;
          if (errs?.length) return json({ error: errs.map(e => e.message).join('; ') }, 400);
        } catch (err) {
          const m = String(err.message || err);
          if (/ACCESS_DENIED|write_products/i.test(m)) {
            return json({ error: 'Shopify app lacks the write_products scope — add it in the Dev Dashboard, then retry.' }, 403);
          }
          throw err;
        }
        const catalog = await env.KV.get(`catalog:${store.id}`, 'json');
        if (catalog) {
          const p = catalog.products.find(p => p.id === pid);
          if (p) { p.moq = moq > 0 ? moq : null; await env.KV.put(`catalog:${store.id}`, JSON.stringify(catalog)); }
        }
        return json({ ok: true, productId: pid, moq: moq > 0 ? moq : null });
      }

      if (path === '/api/password' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const pw = String(body.password || '');
        if (pw.length < 8) return json({ error: 'password must be at least 8 characters' }, 400);
        await env.KV.put('passwordHash', await sha256hex(pw));
        return json({ ok: true });
      }

      if (path === '/api/backfill' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const days = Math.min(180, Math.max(7, Number(body.days) || 90));
        return json(await runBackfill(env, store, days));
      }

      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: String(err && err.message || err) }, 500);
    }
  },
};
