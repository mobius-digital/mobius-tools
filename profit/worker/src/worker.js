/**
 * Mobius Profit — store-level business worker (Cloudflare Workers + D1)
 *
 * Account Health answers "are the Meta ads working?" — Meta-only, every number
 * matches Ads Manager. THIS answers "is the brand making money?" — blended,
 * store-level, all channels. Different question, different reader, so it is a
 * separate tool sharing one database.
 *
 * Reads (written by the account-health worker):
 *   accounts, tw_daily (Triple Whale per-day metrics), daily_insights (Meta)
 * Writes:
 *   p_sku_costs, p_cost_health, and accounts.goals_json.cm_pct (the margin
 *   override — deliberately the SAME field the Daily Brief reads, one source
 *   of truth rather than two that can disagree)
 *
 * Plan lives in ../PRD.md.
 */

const DASHBOARD_URL = 'https://tools.go-mobius-digital.com/profit/';
// The account-health worker is the Mobius auth server (it mints the Google sessions).
const AUTH_WORKER = 'https://mobius-account-health.mobius-digital.workers.dev';
/* Served by the account-health worker and forwarded verbatim (see the proxy block). */
const PROXY_PATHS = new Set([
  '/api/slack-channels', '/api/brief', '/api/brief-preview', '/api/brief-send',
  '/api/briefs', '/api/goal-suggest', '/api/tw-sync', '/api/brief-time',
  // Weekly/Monthly reports: same arrangement as the brief — the engine lives on
  // the account-health worker (TW/Anthropic/Slack secrets + the crons).
  '/api/reports', '/api/report', '/api/report-generate', '/api/report-summary',
  '/api/report-send', '/api/report-link', '/api/brief-text', '/api/brief-draft',
  /* The live creative browser. It reads `ad_daily` and calls Meta for the
     creative assets, both of which belong to the account-health worker, but it
     is rendered by index.html whose `api()` points HERE - so without this it
     404s. That is exactly what shipped: "Couldn't load ads: not found". */
  '/api/ads',
  // Creative assets, fetched after the cards paint so filtering feels instant.
  '/api/ad-creatives',
  // Backfill Triple Whale ad-level attribution for a window, from the UI.
  '/api/tw-attr-sync',
  // Playback for a creative card. Unauthenticated callers reach it only with
  // a report archive token, which the engine validates against that client's
  // own sent reports.
  '/api/ad-video',
]);

/* ---------------- dates ---------------- */
const localDate = (tz, d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const monthOf = ymd => ymd.slice(0, 7);
const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };

/* ---------------- http ---------------- */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', ...CORS },
});

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---- shared Mobius session (same SESSION_SECRET as the other tool workers) ---- */
const ALLOWED_DOMAIN = 'go-mobius-digital.com';
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmacKey(env) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET || env.ADMIN_TOKEN || 'dev'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function verifySession(env, token) {
  const m = /^mds\.([\w-]+)\.([\w-]+)$/.exec(token || '');
  if (!m) return null;
  const sig = b64u(await crypto.subtle.sign('HMAC', await hmacKey(env), new TextEncoder().encode(m[1])));
  if (sig !== m[2]) return null;
  let email, exp;
  try { [email, exp] = atob(m[1].replace(/-/g, '+').replace(/_/g, '/')).split('|'); } catch { return null; }
  if (+exp < Date.now()) return null;
  return { email, exp: +exp };
}
async function emailAllowed(env, email) {
  if (!email) return false;
  if (email.toLowerCase().endsWith('@' + ALLOWED_DOMAIN)) return true;
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'allowedEmails'`).first().catch(() => null);
  return safeJson(row?.value, []).map(e => String(e).toLowerCase()).includes(email.toLowerCase());
}
/** Ask the account-health worker to vouch for a session token.
 *  Lets SSO work without duplicating SESSION_SECRET onto this worker; if the
 *  secret IS set here, local verification wins and this never runs. */
async function delegateSession(env, tok) {
  if (!tok || tok.length < 8) return false;
  const req = new Request(`${AUTH_WORKER}/api/me`, { headers: { Authorization: `Bearer ${tok}` } });
  try {
    // Service binding first (direct worker-to-worker, no public round-trip).
    const res = env.AUTH ? await env.AUTH.fetch(req) : await fetch(req);
    if (!res.ok) return false;
    const j = await res.json().catch(() => ({}));
    return !!(j.email || j.master);
  } catch { return false; }
}

/** Who is asking: 'admin', 'demo', or null.
 *
 *  The demo kind exists for the Shopify App Store reviewer. Shopify requires a test
 *  login and explicitly REJECTS accounts behind Google SSO, so it cannot be the
 *  normal sign-in - and handing a reviewer the real password would show them six
 *  live brands' revenue and margins. A demo session is pinned to the fabricated
 *  account and is read-only.
 */
async function authKind(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const tok = auth.slice(7);
  if (env.ADMIN_TOKEN && tok === env.ADMIN_TOKEN) return 'admin';
  const sess = await verifySession(env, tok);
  if (sess && (await emailAllowed(env, sess.email))) return 'admin';
  // Dashboard password lives in the SHARED settings table, so one password
  // opens both tools with nothing to configure here.
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'passwordHash'`).first();
  if (row?.value && (await sha256hex(tok)) === row.value) return 'admin';
  // Checked BEFORE delegating: the demo password is local to this tool and must not
  // be forwarded to HQ, which would reject it and cost a round trip.
  const demo = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'demoPasswordHash'`).first();
  if (demo?.value && (await sha256hex(tok)) === demo.value) return 'demo';
  return (await delegateSession(env, tok)) ? 'admin' : null;
}

const isAdmin = async (request, env) => (await authKind(request, env)) === 'admin';

/* ---- Roles ----
   TWO roles and no more: admin, and viewer. `settings.userRoles` maps an email
   to its role and ANYONE NOT LISTED IS AN ADMIN, which is exactly today's
   behaviour - so adding this cannot lock anybody out, including whoever forgets
   they added themselves.
   A viewer is GET-only. That is the whole rule: they see every screen and can
   press nothing that leaves the building - no send to client, no plan save, no
   margin override, no settings, no sync. It reuses the read-only gate the demo
   account already proved, rather than inventing a second permission model. */
async function roleFor(env, email) {
  if (!email) return 'admin';
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'userRoles'`).first();
    const map = safeJson(row?.value, {}) || {};
    return String(map[String(email).toLowerCase()] || 'admin').toLowerCase() === 'viewer' ? 'viewer' : 'admin';
  } catch { return 'admin'; }
}

/** The signed-in email, or null for a password/token session that has none. */
async function sessionEmail(env, request) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const sess = await verifySession(env, auth.slice(7));
  return sess?.email || null;
}


/* ---------------- Shopify OAuth ----------------
 * ONE unlisted public app installs on every client store. Public distribution is the
 * only kind that installs across separate merchant organizations - custom distribution
 * is limited to a single store or one Plus org, and admin-created custom apps can no
 * longer be made at all. Unlisted means it never appears in App Store search, but it
 * still goes through Shopify's review, which is why the compliance webhooks below are
 * not optional: an app that fails them is rejected.
 *
 * Non-embedded, so this is the authorization code grant:
 *   /shopify/install?shop=x.myshopify.com  -> issue a nonce, redirect to Shopify
 *   /shopify/callback                      -> verify HMAC + state, swap code for token
 */
// read_reports is what grants shopifyqlQuery, and the cohort data comes from
// ShopifyQL `FROM customers`. Without it cohorts fail silently. Must stay in step
// with profit/shopify.app.toml - Shopify compares the two at install.
const SHOPIFY_SCOPES = 'read_orders,read_customers,read_products,read_reports';
const SHOP_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
// Keep in step with `api_version` in profit/shopify.app.toml.
const SHOPIFY_API_VERSION = '2026-07';

/** Subscribe THIS shop to app/uninstalled.
 *
 *  It cannot be declared in shopify.app.toml: app-specific subscriptions are
 *  rejected when use_legacy_install_flow is true, and that flag has to stay true
 *  because the worker does the standalone authorization-code grant rather than
 *  token exchange. Shop-specific registration at install is the alternative
 *  Shopify itself names. The three compliance webhooks are unaffected - those are
 *  declared with `compliance_topics` and stay in the TOML.
 *
 *  Best effort on purpose: a merchant who is otherwise connected must not see the
 *  install fail because a webhook did not take. Worst case we learn about an
 *  uninstall on the next sync's 401 instead of instantly.
 */
async function registerUninstallWebhook(env, shop, token, origin) {
  const q = `mutation($sub: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: APP_UNINSTALLED, webhookSubscription: $sub) {
      userErrors { field message }
    }
  }`;
  try {
    const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({
        query: q,
        variables: { sub: { callbackUrl: `${origin}/shopify/webhooks/app/uninstalled`, format: 'JSON' } },
      }),
    });
    const b = await res.json().catch(() => ({}));
    const errs = b?.data?.webhookSubscriptionCreate?.userErrors;
    if (!res.ok || errs?.length) console.log('uninstall webhook not registered', shop, res.status, JSON.stringify(errs || b));
  } catch (e) { console.log('uninstall webhook failed', shop, e.message); }
}

/** Constant-time-ish compare so a mismatched HMAC cannot be probed byte by byte. */
function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
}
const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));

/** Shopify signs the OAuth redirect: every query param except `hmac`, sorted, joined. */
async function validOauthHmac(env, url) {
  if (!env.SHOPIFY_API_SECRET) return false;      // unverifiable = rejected, never 500
  const params = [...url.searchParams.entries()].filter(([k]) => k !== 'hmac' && k !== 'signature');
  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const msg = params.map(([k, v]) => `${k}=${v}`).join('&');
  return safeEq(toHex(await hmacSha256(env.SHOPIFY_API_SECRET, msg)), url.searchParams.get('hmac') || '');
}
/** Webhooks are signed over the RAW body, base64. Review explicitly tests a bad HMAC. */
async function validWebhookHmac(env, rawBody, header) {
  if (!header || !env.SHOPIFY_API_SECRET) return false;   // unverifiable = rejected
  return safeEq(toB64(await hmacSha256(env.SHOPIFY_API_SECRET, rawBody)), header);
}

/** Tie a shop domain to one of our accounts. accounts.tw_shop already holds it. */
/** The client's own dashboard token, created on first use.
 *  Shared by /api/profit-share and the Shopify post-install redirect so a merchant
 *  and a share link always land on the SAME page - two mint paths would give one
 *  client two live URLs and no way to revoke both. */
async function profitShareToken(env, actId) {
  const row = await env.DB.prepare(`SELECT token FROM p_profit_share WHERE act_id = ?1`).bind(actId).first();
  if (row?.token) return row.token;
  const token = crypto.randomUUID().replace(/-/g, '');
  await env.DB.prepare(
    `INSERT INTO p_profit_share (act_id, token, created_at) VALUES (?1,?2,datetime('now'))
     ON CONFLICT(act_id) DO UPDATE SET token = excluded.token, created_at = datetime('now')`,
  ).bind(actId, token).run();
  return token;
}

async function matchAccount(env, shop) {
  const row = await env.DB.prepare(`SELECT act_id FROM accounts WHERE lower(tw_shop) = lower(?1)`).bind(shop).first().catch(() => null);
  return row?.act_id ?? null;
}

/* ---------------- accounts ---------------- */
/** @param demoMode false = real accounts only, true = the demo account only,
 *                   null = both (used by maintenance passes that should cover it).
 *
 *  The demo row is deliberately `active = 0` so Account Health's account list and the
 *  Slack brief - both of which require active = 1 - can never pick it up. That means
 *  the activeOnly filter has to be skipped for a demo session, or it would see
 *  nothing at all.
 */
async function listAccounts(env, activeOnly = true, demoMode = false) {
  const where = [];
  if (demoMode === true) where.push('demo = 1');
  else if (demoMode === false) where.push('(demo IS NULL OR demo = 0)');
  if (activeOnly && demoMode !== true) where.push('active = 1');
  const { results } = await env.DB.prepare(
    `SELECT * FROM accounts ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name`,
  ).all();
  return results.map(a => ({ ...a, goals: safeJson(a.goals_json, {}) }));
}
function goalsFor(acct, ym) {
  const g = safeJson(acct.goals_json, {});
  return { ...(g.default || {}), ...(g[ym] || {}) };
}
const marginOverride = (acct, ym) => goalsFor(acct, ym).cm_pct ?? null;
const pubAccount = a => ({ act_id: a.act_id, name: a.name, currency: a.currency, tz: a.tz, tw_shop: a.tw_shop });

/* ---------------- the money model ----------------
 * Every figure here is BLENDED and store-level:
 *   revenue = Shopify TOTAL SALES minus sales tax (shipping is already inside it)
 *   spend   = Triple Whale blendedAds (every ad platform), Meta+Google fallback
 *   MER     = revenue / spend        aMER = new-customer revenue / spend
 * Platform ROAS is deliberately absent — that is Account Health's job.
 */
/* CAREFUL - Triple Whale's field names do not mean what they say. In TW's own
 * metric catalog `netSales` is TITLED "Total Sales": it is Shopify's TOTAL SALES
 * and ALREADY contains shipping charged to customers and sales tax, net of
 * discounts and returns. `totalSales` is titled "Order Revenue" - the same figure
 * before returns. Reconciled against Shopify for Lucky Golf, July 2026:
 *     Shopify  gross 89,725.63  -disc 16,264.62  -returns 1,405.55
 *              = net_sales 72,055.46  +ship 5,287.00  +tax 624.06
 *              = total_sales 77,966.52
 *     TW       netSales 77,990.42   (0.03% from Shopify total_sales)
 * So NEVER add totalShippingPrice to this: that counts shipping twice, which is
 * exactly the bug that inflated every revenue figure here by 4-13%. */
const SALES_IDS = ['netSales', 'totalSales'];

async function pivot(env, actId, from, to) {
  const { results } = await env.DB.prepare(
    `SELECT date, metric, value FROM tw_daily WHERE act_id = ?1 AND date BETWEEN ?2 AND ?3`,
  ).bind(actId, from, to).all();
  const piv = {};
  for (const r of results) (piv[r.metric] ??= {})[r.date] = r.value;
  return piv;
}
const pick = (piv, date, ids) => { for (const id of ids) { const v = piv[id]?.[date]; if (v != null) return v; } return null; };

/** One day of store-level economics.
 *  Follows CTC's definition: contribution margin = net revenue minus ALL VARIABLE
 *  costs (product, fulfilment, handling, payment fees, ad spend). Fixed costs —
 *  rent, salaries, software, our own retainer — are excluded by definition.
 *  Revenue is Shopify's TOTAL SALES minus sales tax - which is CTC's reported
 *  "Net Sales + Shipping" line. Shipping charged to customers is already inside
 *  Triple Whale's netSales and must never be added again. */
function dayEconomics(piv, meta, date, marginPct) {
  const totalSales = pick(piv, date, SALES_IDS);   // Shopify TOTAL SALES (incl. shipping + tax)
  if (totalSales == null) return null;
  // Tax is collected for the state, not earned, so it comes off the top. Defaults
  // to 0 before the metric is backfilled, which degrades to total sales - never
  // back to the old double-counted figure.
  const tax = piv.totalNetTaxes?.[date] ?? 0;
  const shipRev = piv.totalShippingPrice?.[date] ?? 0;
  const shipCost = piv.totalShippingCosts?.[date] ?? 0;
  const handling = piv.totalHandlingFees?.[date] ?? 0;
  const sales = totalSales - tax;            // CTC's "Net Sales + Shipping"
  const netSales = sales - shipRev;          // = Shopify net_sales, for the waterfall
  const mrow = meta[date];
  const gSpend = piv.ga_adCost?.[date] ?? null;
  const spend = piv.blendedAds?.[date] ?? (mrow || gSpend != null ? (mrow?.spend ?? 0) + (gSpend ?? 0) : null);
  const rawNew = piv.newCustomerSales?.[date] ?? null;
  const rawRet = piv.rcRevenue?.[date] ?? null;
  const rawSplit = (rawNew ?? 0) + (rawRet ?? 0);
  // Rebase the new/returning split onto net sales — TW reports it against order
  // revenue (incl. tax), so the raw figures do not add up to our headline.
  const newShare = rawSplit > 0 && rawNew != null ? rawNew / rawSplit : null;
  const newRev = newShare != null ? sales * newShare : rawNew;
  const cogs = piv.totalProductCosts?.[date] ?? null;
  const fees = piv.totalPaymentGatewayCosts?.[date] ?? null;
  // Everything variable except ad spend. Ad spend is subtracted separately so the
  // page can show gross profit (the pre-marketing line) as its own step.
  const variableCosts = cogs != null ? cogs + shipCost + handling + (fees ?? 0) : null;
  const grossProfit = marginPct != null ? sales * marginPct
    : variableCosts != null ? sales - variableCosts : null;
  return {
    date, sales, total_sales: totalSales, tax, net_sales: netSales, ship_rev: shipRev, spend,
    new_rev: newRev,
    ret_rev: newShare != null ? sales * (1 - newShare) : rawRet,
    new_share: newShare,
    cogs, ship_cost: shipCost, handling, fees, gross_profit: grossProfit,
    meta_spend: mrow?.spend ?? null, google_spend: gSpend,
    mer: spend ? sales / spend : null,
    amer: newRev != null && spend ? newRev / spend : null,
    cm: grossProfit != null && spend != null ? grossProfit - spend : null,
    margin: sales > 0 && grossProfit != null ? grossProfit / sales : null,
  };
}

async function seriesFor(env, acct, from, to) {
  const piv = await pivot(env, acct.act_id, from, to);
  const { results: metaRows } = await env.DB.prepare(
    `SELECT date, spend FROM daily_insights WHERE act_id = ?1 AND date BETWEEN ?2 AND ?3`,
  ).bind(acct.act_id, from, to).all();
  const meta = Object.fromEntries(metaRows.map(r => [r.date, r]));
  const marginPct = marginOverride(acct, monthOf(to));
  const ship = shippingMode(piv);            // diagnostic only - see shippingMode()
  const rows = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const row = dayEconomics(piv, meta, d, marginPct);
    if (row) rows.push(row);
  }
  return { rows, margin_pct: marginPct, shipping: ship };
}

/** Does this client actually record what fulfilment costs them?
 *  DIAGNOSTIC ONLY. Shipping charged to customers is already inside Triple Whale's
 *  netSales, so it cannot be netted back out - a client who bills for shipping and
 *  records no cost against it genuinely has overstated profit, and the honest move
 *  is to say so rather than to quietly adjust the revenue line.
 *
 *  ONLY `uncosted` IS A PROBLEM: money charged for delivery with NOTHING booked
 *  against it. That is an absence, and an absence is unambiguous.
 *
 *  A cost that EQUALS the charge is NOT flagged, on Cole's explicit instruction
 *  (2026-08-24), and do not re-add it. There used to be a `mirrored` verdict warning
 *  that an exactly-matching cost could not be a real rate - the delivery charge swings
 *  with destination and basket (Lucky ranges $2.00 to $34.67 per order) while a rate is
 *  a rule that would not follow it. The evidence still says that. It is not our call.
 *  The brand configures its own fulfilment costs in Triple Whale; if a figure comes
 *  through, it is the brand's figure and this tool reports it rather than second-
 *  guessing it. Flag what is MISSING, never what is merely surprising.
 */
function shippingMode(piv) {
  const total = m => Object.values(piv[m] || {}).reduce((a, b) => a + (b || 0), 0);
  const rev = total('totalShippingPrice'), cost = total('totalShippingCosts');
  const orders = total('totalOrders');
  // A day counts only when the customer was actually charged for delivery; days
  // with no shipping revenue match trivially at zero and would fake a mirror.
  let billed = 0, matched = 0;
  for (const [d, r] of Object.entries(piv.totalShippingPrice || {})) {
    if (!(r > 0)) continue;
    billed++;
    if (Math.abs((piv.totalShippingCosts?.[d] ?? 0) - r) < 0.005) matched++;
  }
  // How much the delivery CHARGE moves per order, day to day. This is the evidence
  // that separates a mirror from a genuine rate: Cole pushed back that a brand could
  // simply have configured its cost to equal the charge, which would make the match
  // legitimate. It cannot. What a customer pays varies with destination and basket -
  // Lucky ranges $2.00 to $34.67 per order - while a RATE is a rule (flat per order,
  // per kilo, per item) and cannot track those swings in lockstep. State the range and
  // let it make the argument, rather than asserting a cause we cannot observe.
  const perDay = [];
  for (const [d, r] of Object.entries(piv.totalShippingPrice || {})) {
    const o = piv.totalOrders?.[d];
    if (r > 0 && o > 0) perDay.push(r / o);
  }
  perDay.sort((a, b) => a - b);
  const per = n => orders > 0 ? n / orders : null;
  const base = {
    rev, cost, orders, billed_days: billed, matched_days: matched,
    rev_per_order: per(rev), cost_per_order: per(cost),
    charge_lo: perDay.length ? perDay[0] : null,
    charge_hi: perDay.length ? perDay[perDay.length - 1] : null,
  };
  if (rev <= 0 && cost <= 0) return { ...base, mode: 'none', note: 'no shipping billed or costed' };
  if (rev > 0 && cost <= 0) {
    return { ...base, mode: 'uncosted', note: `customers were charged ${Math.round(rev)} for shipping and Triple Whale records no fulfilment cost against any of it, so contribution margin is overstated by whatever delivery actually costs - add shipping rates in Triple Whale to close the gap` };
  }
  if (billed >= 10 && matched >= billed * 0.95) {
    // Deliberately falls through to `measured`. See the note above shippingMode().
  }
  return { ...base, mode: 'measured', note: rev >= cost ? `shipping makes ${Math.round(rev - cost)} over the window` : `shipping loses ${Math.round(cost - rev)} over the window` };
}

/** The same daily series with the flat-margin override deliberately ignored,
 *  so the Costs page can diagnose the real underlying cost data. */
async function seriesRaw(env, acct, from, to) {
  const piv = await pivot(env, acct.act_id, from, to);
  const { results: metaRows } = await env.DB.prepare(
    `SELECT date, spend FROM daily_insights WHERE act_id = ?1 AND date BETWEEN ?2 AND ?3`,
  ).bind(acct.act_id, from, to).all();
  const meta = Object.fromEntries(metaRows.map(r => [r.date, r]));
  const rows = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const row = dayEconomics(piv, meta, d, null);
    if (row) rows.push(row);
  }
  return rows;
}

const sum = (rows, get) => {
  let s = 0, any = false;
  for (const r of rows) { const v = get(r); if (v != null) { s += v; any = true; } }
  return any ? s : null;
};

function totals(rows) {
  const sales = sum(rows, r => r.sales), spend = sum(rows, r => r.spend);
  const newRev = sum(rows, r => r.new_rev), gp = sum(rows, r => r.gross_profit);
  return {
    days: rows.length, sales, spend, new_rev: newRev, ret_rev: sum(rows, r => r.ret_rev),
    total_sales: sum(rows, r => r.total_sales), tax: sum(rows, r => r.tax),
    net_sales: sum(rows, r => r.net_sales), ship_rev: sum(rows, r => r.ship_rev),
    cogs: sum(rows, r => r.cogs), ship_cost: sum(rows, r => r.ship_cost),
    handling: sum(rows, r => r.handling), fees: sum(rows, r => r.fees), gross_profit: gp,
    meta_spend: sum(rows, r => r.meta_spend), google_spend: sum(rows, r => r.google_spend),
    mer: spend ? sales / spend : null,
    amer: newRev != null && spend ? newRev / spend : null,
    cm: gp != null && spend != null ? gp - spend : null,
    margin: sales > 0 && gp != null ? gp / sales : null,
    new_share: sales > 0 && newRev != null ? newRev / sales : null,
  };
}

/** CTC's whole frame is every number against a plan. Spread the month's goals
 *  across the days elapsed so month-to-date actuals have something to beat. */
function planFor(acct, ym, mtdRows) {
  const g = goalsFor(acct, ym);
  if (g.sales == null && g.spend == null) return null;
  const dim = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
  const elapsed = mtdRows.length;
  if (!elapsed) return null;
  const share = elapsed / dim;
  const sales = g.sales != null ? g.sales * share : null;
  const spend = g.spend != null ? g.spend * share : null;
  const margin = g.cm_pct ?? null;
  return {
    days: elapsed, days_in_month: dim, share,
    sales, spend,
    mer: sales != null && spend ? sales / spend : null,
    amer: g.amer ?? null,
    cm: sales != null && spend != null && margin != null ? sales * margin - spend : null,
    month: { sales: g.sales ?? null, spend: g.spend ?? null, amer: g.amer ?? null },
  };
}

/* ---------------- the forecast ("revenue cake") ----------------
 * CTC forecast bottom-up, most predictable layer first: returning customers are
 * the reliable base, paid acquisition is the volatile top, and they are explicit
 * that paid cannot be forecast precisely. We do the same with two ADDITIVE layers,
 * because those are the two our data actually decomposes into:
 *     newCustomerSales + rcRevenue = totalSales   (exactly, verified)
 * Email is NOT a third additive layer — Klaviyo-attributed revenue cuts across both
 * (for The Golf Sock it exceeds returning revenue on its own), so it is reported as
 * an overlay for context and never added in.
 */
function dowOf(d) { return new Date(d + 'T12:00:00Z').getUTCDay(); }

const prevMonth = ym => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
};
const daysInMonth = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();

/** Last N complete-ish months of real economics — the table you look at before
 *  agreeing next month's number. */
async function monthHistory(env, acct, upToYm, n = 6) {
  const months = [];
  let m = upToYm;
  for (let i = 0; i < n; i++) { months.unshift(m); m = prevMonth(m); }
  const from = `${months[0]}-01`;
  const to = `${upToYm}-${String(daysInMonth(upToYm)).padStart(2, '0')}`;
  const { rows } = await seriesFor(env, acct, from, to);
  const today = localDate(acct.tz);
  return months.map(ym => {
    const mr = rows.filter(r => r.date.startsWith(ym));
    if (!mr.length) return { month: ym, empty: true };
    const t = totals(mr);
    return {
      month: ym, days: mr.length, days_in_month: daysInMonth(ym),
      partial: ym === monthOf(today),
      sales: t.sales, spend: t.spend, new_rev: t.new_rev, returning: t.ret_rev,
      cm: t.cm, margin: t.margin, mer: t.mer, amer: t.amer, new_share: t.new_share,
    };
  });
}

/** The three ways of saying the same plan.
 *  Returning revenue is expected to arrive on its own; everything above it has to
 *  be bought at the client's trailing aMER. That single relationship lets you enter
 *  the plan from whichever end you actually think in:
 *    growth  — "up 10% on last month"      -> derives the spend it takes
 *    spend   — "we have $40k to spend"      -> derives the revenue that buys
 *    mer     — "we need to hit 2.5x"        -> derives both
 *  MER = (returning + spend x aMER) / spend, so spend = returning / (MER - aMER).
 *  A target MER at or below aMER is unreachable: returning revenue alone would have
 *  to be zero or negative. */
function planMath(mode, value, ctx, basisSales) {
  const dim = ctx.days_in_month;
  const expectedReturning = (ctx.returning_per_day ?? 0) * dim;
  const amer = ctx.amer ?? null;
  let goalSales = null, requiredSpend = null, unreachable = null;

  if (mode === 'spend') {
    requiredSpend = Math.max(0, value);
    goalSales = expectedReturning + (amer ? requiredSpend * amer : 0);
  } else if (mode === 'mer') {
    if (amer == null || value <= amer) {
      unreachable = amer != null
        ? `A ${value.toFixed(2)}x MER is not reachable while acquisition runs at ${amer.toFixed(2)}x — blended MER can only exceed aMER by whatever returning customers add on top.`
        : 'No acquisition efficiency measured yet, so a MER target cannot be costed.';
      requiredSpend = null; goalSales = null;
    } else {
      requiredSpend = expectedReturning / (value - amer);
      goalSales = value * requiredSpend;
    }
  } else {
    goalSales = basisSales * (1 + value);
    const newNeeded = Math.max(0, goalSales - expectedReturning);
    requiredSpend = amer ? newNeeded / amer : null;
  }

  const newNeeded = goalSales != null ? Math.max(0, goalSales - expectedReturning) : null;
  const margin = ctx.margin ?? null;
  const expectedCm = margin != null && requiredSpend != null && goalSales != null
    ? goalSales * margin - requiredSpend : null;
  return {
    mode, input: value, unreachable,
    sales: goalSales, expected_returning: expectedReturning, new_needed: newNeeded,
    required_spend: requiredSpend,
    growth_pct: goalSales != null && basisSales ? goalSales / basisSales - 1 : null,
    implied_mer: requiredSpend && goalSales != null ? goalSales / requiredSpend : null,
    expected_cm: expectedCm,
    expected_cm_margin: expectedCm != null && goalSales ? expectedCm / goalSales : null,
  };
}

/** The month cut into weeks. A bad Tuesday should not cause a panic; a bad week
 *  should. Weeks are calendar-aligned to the month, not to Sundays, so the first
 *  and last are usually short — the target is scaled to the days they contain. */
function weekBuckets(rows, ym, dim, goals, retPerDay, amer) {
  const byDate = Object.fromEntries(rows.map(r => [r.date, r]));
  const dayTarget = goals.sales != null ? goals.sales / dim : null;
  const out = [];
  for (let start = 1; start <= dim; start += 7) {
    const end = Math.min(start + 6, dim);
    const days = [];
    for (let d = start; d <= end; d++) days.push(`${ym}-${String(d).padStart(2, '0')}`);
    const actualDays = days.filter(d => byDate[d]?.sales != null);
    const sales = actualDays.reduce((a, d) => a + byDate[d].sales, 0);
    const spend = actualDays.reduce((a, d) => a + (byDate[d].spend ?? 0), 0);
    const target = dayTarget != null ? dayTarget * days.length : null;
    out.push({
      from: days[0], to: days[days.length - 1], days: days.length,
      days_done: actualDays.length,
      complete: actualDays.length === days.length,
      target,
      // Part-week comparison has to be against the days actually elapsed, or a week
      // in progress always looks like a miss.
      target_to_date: dayTarget != null ? dayTarget * actualDays.length : null,
      sales: actualDays.length ? sales : null,
      spend: actualDays.length ? spend : null,
    });
  }
  return out;
}

async function forecastFor(env, acct, ym) {
  const today = localDate(acct.tz);
  const dim = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
  const monthStart = `${ym}-01`;
  const monthEnd = `${ym}-${String(dim).padStart(2, '0')}`;
  const lastActual = today > monthEnd ? monthEnd : addDays(today, -1);
  const tFrom = addDays(lastActual, -27);          // trailing 28 full days

  // Reuse the same day model the rest of the tool uses, so revenue means exactly
  // what it means everywhere else (net sales + shipping, gated) and the forecast
  // can never drift onto a different basis from the numbers it is compared against.
  const { rows } = await seriesFor(env, acct, tFrom, monthEnd);
  const byDate = Object.fromEntries(rows.map(r => [r.date, r]));
  const trailing = rows.filter(r => r.date >= tFrom && r.date <= lastActual);
  if (!trailing.length) return null;

  // Returning is the predictable base, so give it a day-of-week shape.
  const retByDow = Array.from({ length: 7 }, () => []);
  let tNew = 0, tSpend = 0, tEmail = 0, tSales = 0;
  const piv = await pivot(env, acct.act_id, tFrom, lastActual);
  for (const r of trailing) {
    if (r.ret_rev != null) retByDow[dowOf(r.date)].push(r.ret_rev);
    tNew += r.new_rev ?? 0;
    tSpend += r.spend ?? 0;
    tSales += r.sales ?? 0;
    tEmail += piv.klaviyoPlacedOrderSales?.[r.date] ?? 0;
  }
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const retAll = mean(retByDow.flat()) ?? 0;
  const retFor = d => mean(retByDow[dowOf(d)]) ?? retAll;
  const amer = tSpend > 0 ? tNew / tSpend : null;       // trailing acquisition efficiency
  const spendPerDay = tSpend / trailing.length;

  // Month to date, actual.
  const mtdRows = rows.filter(r => r.date >= monthStart && r.date <= lastActual);
  const mtd = {
    sales: mtdRows.reduce((a, r) => a + (r.sales ?? 0), 0),
    new_rev: mtdRows.reduce((a, r) => a + (r.new_rev ?? 0), 0),
    returning: mtdRows.reduce((a, r) => a + (r.ret_rev ?? 0), 0),
    spend: mtdRows.reduce((a, r) => a + (r.spend ?? 0), 0),
  };

  // Forward: returning from its own pattern, new from the spend we intend to run.
  const goals = goalsFor(acct, ym);
  const remaining = [];
  for (let d = addDays(lastActual, 1); d <= monthEnd; d = addDays(d, 1)) remaining.push(d);
  const spendLeft = goals.spend != null ? Math.max(0, goals.spend - mtd.spend) : null;
  const plannedPerDay = spendLeft != null && remaining.length ? spendLeft / remaining.length : spendPerDay;
  let expRet = 0, expNew = 0;
  for (const d of remaining) {
    expRet += retFor(d);
    expNew += amer != null ? plannedPerDay * amer : 0;
  }
  const expSpend = plannedPerDay * remaining.length;

  // Two scenarios, because they can differ a lot and the difference is the point:
  // spending the rest of the budget, versus carrying on at the current pace.
  let paceRet = 0, paceNew = 0;
  for (const d of remaining) {
    paceRet += retFor(d);
    paceNew += amer != null ? spendPerDay * amer : 0;
  }
  const projected = mtd.sales + expRet + expNew;
  const projectedAtPace = mtd.sales + paceRet + paceNew;
  const goal = goals.sales ?? null;

  // Showing that you are off pace is only half the job. This is the other half:
  // what it would actually take from here. Returning revenue arrives on its own,
  // so the shortfall has to be bought with new customers, which costs spend.
  let toHit = null;
  if (goal != null && remaining.length) {
    const shortfall = goal - mtd.sales;
    const perDay = shortfall / remaining.length;
    const newPerDay = perDay - (retAll || 0);
    const spendNeeded = amer && newPerDay > 0 ? newPerDay / amer : null;
    toHit = {
      revenue_per_day: perDay,
      new_per_day: newPerDay,
      spend_per_day: spendNeeded,
      spend_ramp: spendNeeded != null && spendPerDay > 0 ? spendNeeded / spendPerDay : null,
      already_there: shortfall <= 0,
      // If returning alone covers it, no extra spend is needed at all.
      covered_by_returning: newPerDay <= 0,
    };
  }
  return {
    month: ym, days_in_month: dim, days_elapsed: mtdRows.length, days_remaining: remaining.length,
    basis: {
      days: trailing.length, from: tFrom, to: lastActual,
      amer, spend_per_day: spendPerDay, returning_per_day: retAll,
      email_share: tSales > 0 ? tEmail / tSales : null, email_connected: tEmail > 0,
    },
    mtd,
    expected: { returning: expRet, new_rev: expNew, spend: expSpend, sales: expRet + expNew },
    projected, goal,
    gap: goal != null ? projected - goal : null,
    at_current_pace: {
      sales: projectedAtPace,
      spend: mtd.spend + spendPerDay * remaining.length,
      gap: goal != null ? projectedAtPace - goal : null,
    },
    planned_spend_per_day: plannedPerDay,
    spend_ramp: spendPerDay > 0 ? plannedPerDay / spendPerDay : null,
    to_hit: toHit,
    weeks: weekBuckets(rows, ym, dim, goals, retAll, amer),
  };
}

/** Run a ShopifyQL query against one shop and return its rows as objects.
 *
 *  `shopifyqlQuery` is granted by read_reports, and it answers with
 *  `{ tableData: { columns, rows }, parseErrors }` - a bad query returns
 *  parseErrors and a NULL tableData rather than an HTTP error, so both have to be
 *  checked or a typo reads as "no data" and silently wipes a cohort table.
 */
async function shopifyql(shop, token, query) {
  const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({
      query: `query($q: String!) { shopifyqlQuery(query: $q) {
        tableData { columns { name dataType } rows } parseErrors } }`,
      variables: { q: query },
    }),
  });
  if (!res.ok) throw new Error(`Shopify returned ${res.status}`);
  const b = await res.json().catch(() => ({}));
  if (b.errors?.length) throw new Error(b.errors.map(e => e.message).join('; '));
  const r = b?.data?.shopifyqlQuery;
  if (r?.parseErrors?.length) throw new Error(r.parseErrors.join('; '));
  const td = r?.tableData;
  if (!td) throw new Error('no data returned');
  // rows come back as objects keyed by column name, values as strings.
  return { columns: td.columns.map(c => c.name), rows: td.rows || [] };
}

/** Pull cohorts for one connected shop and write them to `p_cohorts`.
 *
 *  Two queries, both VERIFIED against a live store (Lucky Golf, 2026-08-24) rather
 *  than inferred from the schema docs:
 *
 *   1. `FROM customers ... GROUP BY month` - in this dataset a row IS a customer and
 *      `month` is the month of their FIRST order, which is exactly a cohort. SINCE /
 *      UNTIL filters WHICH customers by that first-order date; it does NOT window the
 *      measures. Checked by running the same query at -400d and -30d: the 2026-08
 *      cohort returned 318 customers / $49,335.9097 / 340 orders in both, so
 *      `total_amount_spent` and `total_number_of_orders` are the customers' ALL-TIME
 *      figures. That is what `p_cohorts.lifetime_*` means, so no adjustment is needed.
 *   2. The same query filtered to `customer_number_of_orders > 1` gives how many of
 *      each cohort ever came back. There is no single metric for this.
 *
 *  Sanity of the result on real data: Lucky's July 2025 cohort repeats at 16.1% while
 *  the fresh 2026-08 one sits at 6.0% - older cohorts have had longer to return, which
 *  is the whole point of the card and a useful smell test if these ever look flat.
 */
async function syncCohorts(env, row) {
  const { shop, act_id, access_token } = row;
  if (!access_token) throw new Error('no access token');

  const WINDOW = 'SINCE -1095d UNTIL today';        // three years back
  const base = await shopifyql(shop, access_token,
    `FROM customers SHOW new_customer_records, total_amount_spent, total_number_of_orders `
    + `GROUP BY month ${WINDOW} ORDER BY month ASC`);
  const repeat = await shopifyql(shop, access_token,
    `FROM customers SHOW new_customer_records GROUP BY month `
    + `WHERE customer_number_of_orders > 1 ${WINDOW} ORDER BY month ASC`);

  const ym = v => String(v ?? '').slice(0, 7);      // "2026-08-01" -> "2026-08"
  const repeatBy = {};
  for (const r of repeat.rows) repeatBy[ym(r.month)] = +r.new_customer_records || 0;

  const out = [];
  for (const r of base.rows) {
    const m = ym(r.month);
    if (!/^\d{4}-\d{2}$/.test(m)) continue;
    const customers = +r.new_customer_records || 0;
    if (!customers) continue;
    out.push({
      month: m, customers,
      repeat_customers: repeatBy[m] ?? 0,
      lifetime_spend: +r.total_amount_spent || 0,
      lifetime_orders: +r.total_number_of_orders || 0,
    });
  }
  // Never let an empty or partial answer delete a good table. A shop with genuinely
  // no customers has nothing worth writing either way.
  if (!out.length) return { shop, act_id, months: 0, skipped: 'no cohort rows returned' };

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await env.DB.batch(out.map(c => env.DB.prepare(
    `INSERT INTO p_cohorts (act_id, cohort_month, customers, repeat_customers,
       lifetime_spend, lifetime_orders, as_of) VALUES (?1,?2,?3,?4,?5,?6,?7)
     ON CONFLICT(act_id, cohort_month) DO UPDATE SET customers = excluded.customers,
       repeat_customers = excluded.repeat_customers, lifetime_spend = excluded.lifetime_spend,
       lifetime_orders = excluded.lifetime_orders, as_of = excluded.as_of`,
  ).bind(act_id, c.month, c.customers, c.repeat_customers, c.lifetime_spend, c.lifetime_orders, now)));

  await env.DB.prepare(`UPDATE p_shopify SET last_sync_at = ?2 WHERE shop = ?1`)
    .bind(shop, now).run().catch(() => {});
  return { shop, act_id, months: out.length, as_of: now };
}

/* ---------------- real cohorts ----------------
 * Unlike the Customers tab, this IS cohort analysis: customers grouped by the month
 * of their FIRST order and followed forward. It needs per-customer history, which
 * Triple Whale does not have, so it comes from Shopify and only exists for stores
 * that have connected. Everything else on that tab keeps working without it.
 *
 * The question it answers that nothing else can: does a customer become worth more
 * over time? "We can pay more for customers because they come back" is the most
 * common justification for a higher CAC, and it is only true if the curve says so.
 */
async function cohorts(env, acct) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM p_cohorts WHERE act_id = ?1 ORDER BY cohort_month`,
  ).bind(acct.act_id).all().catch(() => ({ results: [] }));
  if (!results.length) return { account: pubAccount(acct), connected: false, rows: [] };

  const today = localDate(acct.tz);
  const thisYm = monthOf(today);
  const ageOf = ym => {
    const [ay, am] = ym.split('-').map(Number), [ty, tm] = thisYm.split('-').map(Number);
    return (ty - ay) * 12 + (tm - am);
  };

  // CAC for the month each cohort was acquired, from the ad spend and new-customer
  // orders we already sync. Pairing a Shopify LTV with a Triple Whale CAC is the
  // whole point - neither source can produce both.
  const from = `${results[0].cohort_month}-01`;
  const piv = await pivot(env, acct.act_id, from, today);
  const monthly = {};
  for (const metric of ['blendedAds', 'newCustomersOrders']) {
    for (const [d, v] of Object.entries(piv[metric] || {})) {
      const m = monthOf(d);
      (monthly[m] ??= { spend: 0, newOrders: 0 })[metric === 'blendedAds' ? 'spend' : 'newOrders'] += v || 0;
    }
  }

  const rows = results.map(r => {
    const age = ageOf(r.cohort_month);
    const mm = monthly[r.cohort_month];
    const cac = mm && mm.newOrders > 0 ? mm.spend / mm.newOrders : null;
    const ltv = r.customers > 0 ? r.lifetime_spend / r.customers : null;
    return {
      month: r.cohort_month, age_months: age,
      customers: r.customers, repeat_customers: r.repeat_customers,
      repeat_rate: r.customers > 0 ? r.repeat_customers / r.customers : null,
      ltv, orders_per_customer: r.customers > 0 ? r.lifetime_orders / r.customers : null,
      cac, ltv_cac: ltv != null && cac ? ltv / cac : null,
      // A cohort acquired last month has had no chance to come back. Comparing it
      // with a year-old cohort is the classic way to misread a retention curve.
      mature: age >= 9,
    };
  });

  const mature = rows.filter(r => r.mature && r.ltv != null);
  const fresh = rows.filter(r => r.age_months <= 1 && r.ltv != null);
  const avg = (a, k) => (a.length ? a.reduce((x, r) => x + r[k], 0) / a.length : null);
  const matureLtv = avg(mature, 'ltv'), freshLtv = avg(fresh, 'ltv');
  const matureCac = avg(mature.filter(r => r.cac != null), 'cac');

  return {
    account: pubAccount(acct), connected: true,
    as_of: results[0].as_of, rows,
    summary: {
      mature_ltv: matureLtv, fresh_ltv: freshLtv,
      mature_repeat: avg(mature, 'repeat_rate'), fresh_repeat: avg(fresh, 'repeat_rate'),
      // How much a customer gains in value by coming back. If this is small, the
      // first order IS the lifetime value and CAC has to stand on its own.
      // Kept for display, but NOT the headline - it compares different cohorts.
      ltv_vs_fresh: matureLtv != null && freshLtv ? matureLtv / freshLtv - 1 : null,
      // The robust one: share of a matured cohort's purchases that came after the
      // first order. Measured within the cohort, so cohort quality cannot skew it.
      orders_per_customer: avg(mature, 'orders_per_customer'),
      repeat_uplift: (() => { const o = avg(mature, 'orders_per_customer'); return o != null ? o - 1 : null; })(),
      cac: matureCac, ltv_cac: matureLtv != null && matureCac ? matureLtv / matureCac : null,
      mature_months: mature.length,
    },
  };
}

/* ---------------- customer unit economics ----------------
 * Triple Whale exposes no cohort table and no CAC, so this is NOT cohort analysis
 * and must never be labeled as such - we cannot follow a January cohort through
 * the year without order-level customer data. What we CAN do, from metrics already
 * synced, is answer the question that actually drives a plan: what does a new
 * customer cost, what do they spend, and does their first order pay that back?
 *
 *   CAC            = ad spend / new-customer orders
 *   first-order AOV= new-customer revenue / new-customer orders
 *   first-order CM = AOV x product margin - CAC
 *
 * When first-order CM is positive the client is profitable on day one and can afford
 * to bid harder. When it is negative the business depends on people coming back, and
 * the repeat share below is the number that has to hold up.
 */
/* `range` is the period bar's explicit window when it has one. Without it the
   window is the old "N days ending yesterday", unchanged. Needed because
   "Last month" and a custom range cannot be written as a day count. */
async function customerEconomics(env, acct, months = 6, days = 30, range = null) {
  const today = localDate(acct.tz);
  const thisYm = monthOf(today);
  const list = [];
  let m = thisYm;
  for (let i = 0; i < months; i++) { list.unshift(m); m = prevMonth(m); }
  const to = range?.to || addDays(today, -1);
  const winFrom = range?.from || addDays(today, -days);
  const monthsFrom = `${list[0]}-01`;
  const from = winFrom < monthsFrom ? winFrom : monthsFrom;
  const { rows, margin_pct } = await seriesFor(env, acct, from, to);
  const piv = await pivot(env, acct.act_id, from, to);

  const byMonth = {};
  for (const r of rows) (byMonth[monthOf(r.date)] ??= []).push(r);

  const month = ym => {
    const rs = byMonth[ym] || [];
    if (!rs.length) return { month: ym, empty: true };
    const sum = get => rs.reduce((a, r) => a + (get(r) ?? 0), 0);
    const dsum = metric => rs.reduce((a, r) => a + (piv[metric]?.[r.date] ?? 0), 0);
    const spend = sum(r => r.spend);
    const newOrders = dsum('newCustomersOrders');
    const totalOrders = dsum('totalOrders');
    // Triple Whale does not send returning-customer orders for these shops, so it is
    // derived. Guarded against a negative when the two metrics disagree slightly.
    const retOrders = Math.max(0, totalOrders - newOrders);
    const newRev = sum(r => r.new_rev);
    const retRev = sum(r => r.ret_rev);
    const sales = sum(r => r.sales);
    const gp = sum(r => r.gross_profit);
    const margin = sales > 0 ? gp / sales : null;
    const cac = newOrders > 0 ? spend / newOrders : null;
    const newAov = newOrders > 0 ? newRev / newOrders : null;
    const firstOrderGp = newAov != null && margin != null ? newAov * margin : null;
    return {
      month: ym, partial: ym === thisYm, days: rs.length,
      spend, sales, margin,
      new_orders: newOrders, returning_orders: retOrders, total_orders: totalOrders,
      new_rev: newRev, returning_rev: retRev,
      cac, new_aov: newAov,
      returning_aov: retOrders > 0 ? retRev / retOrders : null,
      // The whole point: does the first order cover what the customer cost to buy?
      first_order_gp: firstOrderGp,
      first_order_cm: firstOrderGp != null && cac != null ? firstOrderGp - cac : null,
      payback: firstOrderGp != null && cac > 0 ? firstOrderGp / cac : null,
      repeat_share: totalOrders > 0 ? retOrders / totalOrders : null,
    };
  };

  const series = list.map(month);
  // Headline follows the range picker. Repeat share counts ORDERS placed inside the
  // window - it is not cohort-based, so a shorter window does not bias it, it just
  // makes it noisier for a low-volume client. new_orders is surfaced so the UI can
  // warn when the sample is too small to lean on.
  const win = rows.filter(r => r.date >= winFrom);
  const wsum = get => win.reduce((a, r) => a + (get(r) ?? 0), 0);
  const wd = metric => win.reduce((a, r) => a + (piv[metric]?.[r.date] ?? 0), 0);
  const wNewOrders = wd('newCustomersOrders'), wTotalOrders = wd('totalOrders');
  const agg = {
    spend: wsum(r => r.spend), newOrders: wNewOrders,
    retOrders: Math.max(0, wTotalOrders - wNewOrders), totalOrders: wTotalOrders,
    newRev: wsum(r => r.new_rev), retRev: wsum(r => r.ret_rev),
    sales: wsum(r => r.sales), gp: wsum(r => r.gross_profit),
  };

  const margin = agg.sales > 0 ? agg.gp / agg.sales : null;
  const cac = agg.newOrders > 0 ? agg.spend / agg.newOrders : null;
  const newAov = agg.newOrders > 0 ? agg.newRev / agg.newOrders : null;
  const firstGp = newAov != null && margin != null ? newAov * margin : null;
  return {
    account: pubAccount(acct), months: list, margin_pct,
    window: { days, from: winFrom, to },
    headline: {
      cac, new_aov: newAov, margin,
      first_order_gp: firstGp,
      first_order_cm: firstGp != null && cac != null ? firstGp - cac : null,
      payback: firstGp != null && cac > 0 ? firstGp / cac : null,
      repeat_share: agg.totalOrders > 0 ? agg.retOrders / agg.totalOrders : null,
      returning_aov: agg.retOrders > 0 ? agg.retRev / agg.retOrders : null,
      new_orders: agg.newOrders, returning_orders: agg.retOrders,
      // The revenue split, which used to live on the Profit tab. It belongs here:
      // it is the same question as repeat share, measured in money instead of orders.
      new_rev: agg.newRev, returning_rev: agg.retRev,
      new_rev_share: agg.newRev + agg.retRev > 0 ? agg.newRev / (agg.newRev + agg.retRev) : null,
      // Fewer than ~50 new customers makes CAC and payback too noisy to act on.
      thin: agg.newOrders < 50,
    },
    series,
  };
}

/* ---------------- weekday rhythm ----------------
 * DESCRIPTIVE ONLY. This is history, never a target. The monthly plan splits
 * evenly on purpose (a day-of-week curve backtested 7.6% WORSE than an even split
 * across six clients), so nothing here may feed a forecast.
 *
 * The honest question is not "what is Monday's average?" - four Mondays a month is
 * a tiny sample and every brand will show SOME pattern by chance. It is "does the
 * same weekday land on the same side of average every month?". So we compute one
 * index per weekday per COMPLETE month and report the RANGE. A day whose whole
 * range sits above 1.0 is genuinely strong; a day whose range straddles 1.0 is
 * noise, and is labeled as such rather than dressed up.
 */
const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function weekdayRhythm(env, acct, months = 3) {
  const today = localDate(acct.tz);
  const thisYm = monthOf(today);
  // Whole months only - a part month would over-weight whichever weekdays it
  // happens to contain.
  const wanted = [];
  let m = prevMonth(thisYm);
  for (let i = 0; i < months; i++) { wanted.unshift(m); m = prevMonth(m); }
  const from = `${wanted[0]}-01`;
  const to = `${wanted[wanted.length - 1]}-${String(daysInMonth(wanted[wanted.length - 1])).padStart(2, '0')}`;
  const { rows } = await seriesFor(env, acct, from, to);   // same revenue basis as everywhere else
  const byMonth = {};
  for (const r of rows) if (r.sales != null) (byMonth[monthOf(r.date)] ??= []).push(r);

  const used = wanted.filter(ym => (byMonth[ym] || []).length >= daysInMonth(ym) - 2);
  if (used.length < 2) return { account: pubAccount(acct), months: used, enough: false };

  // index per weekday per month = that weekday's mean / the month's mean
  const perMonth = used.map(ym => {
    const list = byMonth[ym];
    const mean = list.reduce((a, r) => a + r.sales, 0) / list.length;
    const sum = Array(7).fill(0), cnt = Array(7).fill(0);
    for (const r of list) { const d = dowOf(r.date); sum[d] += r.sales; cnt[d]++; }
    return sum.map((v, i) => (cnt[i] && mean > 0 ? (v / cnt[i]) / mean : null));
  });

  // Same consistency test applied to efficiency: one MER index per weekday per
  // month, relative to that month's own MER.
  const perMonthMer = used.map(ym => {
    const list = byMonth[ym];
    const tS = list.reduce((a, r) => a + r.sales, 0);
    const tSp = list.reduce((a, r) => a + (r.spend ?? 0), 0);
    const monthMer = tSp > 0 ? tS / tSp : null;
    const s2 = Array(7).fill(0), sp2 = Array(7).fill(0);
    for (const r of list) { const d = dowOf(r.date); s2[d] += r.sales; sp2[d] += r.spend ?? 0; }
    return s2.map((v, i) => (sp2[i] > 0 && monthMer ? (v / sp2[i]) / monthMer : null));
  });

  // share of the week, and efficiency, pooled across the whole window
  const sales = Array(7).fill(0), spend = Array(7).fill(0), newRev = Array(7).fill(0), days = Array(7).fill(0);
  const cm = Array(7).fill(0), cmDays = Array(7).fill(0);
  for (const ym of used) for (const r of byMonth[ym]) {
    const d = dowOf(r.date);
    sales[d] += r.sales; spend[d] += r.spend ?? 0; newRev[d] += r.new_rev ?? 0; days[d]++;
    if (r.cm != null) { cm[d] += r.cm; cmDays[d]++; }
  }
  const totalSales = sales.reduce((a, b) => a + b, 0);

  const out = DOW_NAMES.map((name, d) => {
    const idx = perMonth.map(mm => mm[d]).filter(v => v != null);
    const lo = idx.length ? Math.min(...idx) : null;
    const hi = idx.length ? Math.max(...idx) : null;
    const avg = idx.length ? idx.reduce((a, b) => a + b, 0) / idx.length : null;
    // Consistent only when EVERY month agreed on the direction.
    const verdict = lo == null ? 'none' : lo > 1.02 ? 'strong' : hi < 0.98 ? 'soft' : 'mixed';
    const mIdx = perMonthMer.map(mm => mm[d]).filter(v => v != null);
    const mLo = mIdx.length ? Math.min(...mIdx) : null;
    const mHi = mIdx.length ? Math.max(...mIdx) : null;
    const merVerdict = mLo == null ? 'none' : mLo > 1.02 ? 'strong' : mHi < 0.98 ? 'soft' : 'mixed';
    return {
      dow: d, name,
      share: totalSales > 0 ? sales[d] / totalSales : null,
      index: avg, index_lo: lo, index_hi: hi, verdict,
      sales: sales[d], spend: spend[d], days: days[d],
      mer: spend[d] > 0 ? sales[d] / spend[d] : null,
      mer_verdict: merVerdict, mer_lo: mLo, mer_hi: mHi,
      // The money, not the ratio. A day can be less efficient and still be worth more.
      cm_per_day: cmDays[d] > 0 ? cm[d] / cmDays[d] : null,
      amer: spend[d] > 0 ? newRev[d] / spend[d] : null,
    };
  });

  const consistent = out.filter(x => x.verdict === 'strong' || x.verdict === 'soft');
  const idxs = out.map(x => x.index).filter(v => v != null);
  return {
    account: pubAccount(acct), months: used, enough: true,
    days: out,
    consistent_days: consistent.length,
    // A pattern worth acting on needs at least two weekdays that behaved the same
    // way in every month observed.
    reliable: consistent.length >= 2,
    spread: idxs.length ? Math.max(...idxs) - Math.min(...idxs) : null,
    strongest: out.slice().sort((a, b) => (b.index ?? 0) - (a.index ?? 0))[0],
    weakest: out.slice().sort((a, b) => (a.index ?? 9) - (b.index ?? 9))[0],
    // Efficiency findings only count when every month agreed, same as revenue.
    mer_consistent: out.filter(x => x.mer_verdict === 'strong' || x.mer_verdict === 'soft').length,
    mer_best: out.filter(x => x.mer_verdict === 'strong').sort((a, b) => (b.mer ?? 0) - (a.mer ?? 0))[0] || null,
    mer_worst: out.filter(x => x.mer_verdict === 'soft').sort((a, b) => (a.mer ?? 9) - (b.mer ?? 9))[0] || null,
    // The day that actually contributes the most money, which is NOT always the most
    // efficient one - the UI must say so when they differ.
    cm_best: out.filter(x => x.cm_per_day != null).sort((a, b) => b.cm_per_day - a.cm_per_day)[0] || null,
    has_cm: out.some(x => x.cm_per_day != null),
  };
}

/* ---------------- cost-data trust ----------------
 * Real cost data is stable day to day. Incomplete COGS (some SKUs costed, some
 * not) makes daily margin swing wildly or go negative — and a wrong profit
 * number in front of a client is worse than none, so we grade it and gate on it.
 */
function judgeCosts(rows) {
  const margins = rows.filter(r => r.margin != null && r.sales > 0).map(r => r.margin);
  const n = margins.length;
  if (!n) return { verdict: 'none', reason: 'no cost data in Triple Whale', days: 0 };
  const sorted = margins.slice().sort((a, b) => a - b);
  const p10 = sorted[Math.floor(n * 0.1)], p90 = sorted[Math.floor(n * 0.9)];
  // MATERIALITY FLOOR. `m < 0` counted a day that missed by three dollars on $936 of
  // revenue - Lucky, 2026-08-11, gross profit -0.3% - and that one day suppressed the
  // client's entire profit reporting. Real contamination is not marginal: a wholesale
  // order or an inventory receipt books cost that is a MULTIPLE of the day's revenue,
  // not a rounding error against it. Anything shallower than -5% is ordinary variation
  // in product mix and is not evidence of anything.
  const negatives = margins.filter(m => m < -0.05).length;
  // A negative day means total VARIABLE cost beat revenue - product, delivery,
  // handling and fees together. Only say "product cost" when product cost alone did
  // it; the old wording asserted COGS every time and was often simply wrong.
  const cogsOver = rows.filter(r => r.sales > 0 && r.cogs != null && r.cogs > r.sales).length;
  const costWord = cogsOver >= Math.max(1, negatives * 0.5) ? 'product cost' : 'variable cost';
  const gp = sum(rows, r => r.gross_profit), sales = sum(rows, r => r.sales);
  const blended = sales > 0 && gp != null ? gp / sales : null;
  const spread = p90 - p10;
  const out = { verdict: 'good', days: n, blended, p10, p90, spread, negatives, cogs_over: cogsOver };
  const retail = retailMargin(rows);
  out.retail = retail;
  // A HANDFUL of contaminated days is not broken data. A single wholesale order or
  // inventory receipt in sixty days used to flip the whole client to "cannot be
  // trusted" and suppress every profit figure - while the card underneath said the
  // other 56 days ran a clean 79% margin. Suppressing a good number because of one
  // known, explained, isolated day is worse than reporting it. Only a PATTERN of
  // them (more than a tenth of the window) means the cost data itself is untrustworthy.
  const heavilyContaminated = negatives > Math.max(1, n * 0.1);
  if (heavilyContaminated || (blended != null && blended <= 0.15) || spread > 0.6) {
    out.verdict = 'broken';
    out.reason = heavilyContaminated
      ? `${negatives} of ${n} days record more ${costWord} than the store took in — typically wholesale orders paid outside Shopify, or an inventory delivery booked as one day's cost`
      : blended != null && blended <= 0.15
      ? `trailing margin of ${Math.round(blended * 100)}% is implausibly thin for this kind of product`
      : `daily margin swings ${Math.round(p10 * 100)}% to ${Math.round(p90 * 100)}%, which no real product mix does`;
  } else if (negatives > 0) {
    // Reported, not suppressed: the figures stand and the odd day is named.
    out.verdict = 'noisy';
    out.reason = `${negatives} of ${n} days record more ${costWord} than the store took in — almost always a wholesale order paid outside Shopify or an inventory delivery booked to one day. The other ${n - negatives} days are consistent, so the profit figures still stand`;
  } else if (spread > 0.4) {
    out.verdict = 'noisy';
    out.reason = `daily margin ranges ${Math.round(p10 * 100)}% to ${Math.round(p90 * 100)}% — likely a few products missing COGS`;
  }
  return out;
}

/** Estimate the true RETAIL margin when some days carry cost with no matching
 *  store revenue — wholesale orders paid offline, or an inventory receipt booked
 *  as one day's cost. Contamination only ever ADDS cost, never removes it, so the
 *  low end of the daily cost-ratio distribution is the uncontaminated signal.
 *  We take the tight low cluster, not the median, which halves under contamination. */
function retailMargin(rows) {
  const days = rows.filter(r => r.sales > 0 && r.cogs != null)
    .map(r => ({ date: r.date, sales: r.sales, cogs: r.cogs, ratio: r.cogs / r.sales }));
  if (days.length < 10) return null;
  const ratios = days.map(d => d.ratio).sort((a, b) => a - b);
  const q = p => ratios[Math.floor((ratios.length - 1) * p)];
  const base = q(0.25);                       // representative clean-day cost ratio
  // A day is "clean" while its cost ratio stays near that base; everything above
  // is carrying cost the store's revenue can't explain.
  const cutoff = Math.max(base * 1.5, base + 0.1);
  const clean = days.filter(d => d.ratio <= cutoff);
  const flagged = days.filter(d => d.ratio > cutoff).sort((a, b) => b.cogs - a.cogs);
  if (!clean.length) return null;
  const cleanSales = clean.reduce((a, d) => a + d.sales, 0);
  const cleanCogs = clean.reduce((a, d) => a + d.cogs, 0);
  const margin = cleanSales > 0 ? 1 - cleanCogs / cleanSales : null;
  const excessCost = flagged.reduce((a, d) => a + (d.cogs - d.sales * base), 0);
  return {
    margin, clean_days: clean.length, flagged_days: flagged.length, total_days: days.length,
    cutoff, base,
    unexplained_cost: excessCost,
    top_flagged: flagged.slice(0, 5).map(d => ({ date: d.date, sales: d.sales, cogs: d.cogs, ratio: d.ratio })),
  };
}

/** Worst offending days, so the Costs page can name names. */
const worstDays = (rows, k = 8) =>
  rows.filter(r => r.margin != null).slice().sort((a, b) => a.margin - b.margin).slice(0, k)
    .map(r => ({ date: r.date, sales: r.sales, cogs: r.cogs, fees: r.fees, margin: r.margin }));

async function costHealth(env, acct, days = 60) {
  const today = localDate(acct.tz);
  const from = addDays(today, -days), to = addDays(today, -1);
  const { rows, margin_pct, shipping } = await seriesFor(env, acct, from, to);
  // The diagnosis must always describe the REAL Triple Whale cost data, never the
  // override — otherwise the page grades its own override and reports a perfect
  // flat line, hiding whether the underlying data has actually been fixed yet.
  const rawRows = margin_pct == null ? rows : await seriesRaw(env, acct, from, to);
  const raw = judgeCosts(rawRows);
  const health = margin_pct != null
    ? { verdict: 'override', reason: `using a flat ${Math.round(margin_pct * 100)}% margin override`, days: rows.length, blended: margin_pct, underlying: raw }
    : raw;
  return { account: pubAccount(acct), margin_pct, health, shipping, worst: worstDays(rawRows), rows: rawRows };
}

async function refreshCostHealth(env) {
  const accounts = await listAccounts(env, true, null);
  const out = [];
  for (const a of accounts) {
    try {
      const { health } = await costHealth(env, a);
      await env.DB.prepare(
        `INSERT INTO p_cost_health (act_id, verdict, reason, blended, p10, p90, negatives, days, checked_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,datetime('now'))
         ON CONFLICT(act_id) DO UPDATE SET verdict=excluded.verdict, reason=excluded.reason, blended=excluded.blended,
           p10=excluded.p10, p90=excluded.p90, negatives=excluded.negatives, days=excluded.days, checked_at=excluded.checked_at`,
      ).bind(a.act_id, health.verdict, health.reason ?? null, health.blended ?? null,
        health.p10 ?? null, health.p90 ?? null, health.negatives ?? 0, health.days ?? 0).run();
      out.push({ name: a.name, verdict: health.verdict });
    } catch (e) { out.push({ name: a.name, error: e.message }); }
  }
  return out;
}

/** Refresh the cost-health snapshot in the background when it is stale.
 *  No cron for this worker (account is at Cloudflare's 5-trigger free limit),
 *  so any Overview or Costs view keeps it warm. */
async function refreshIfStale(env, ctx, maxAgeHours = 12) {
  const row = await env.DB.prepare(`SELECT MIN(checked_at) AS oldest, COUNT(*) AS n FROM p_cost_health`).first().catch(() => null);
  const active = await env.DB.prepare(`SELECT COUNT(*) AS n FROM accounts WHERE active = 1`).first().catch(() => null);
  const stale = !row?.oldest || (row.n ?? 0) < (active?.n ?? 0) ||
    (Date.now() - new Date(String(row.oldest).replace(' ', 'T') + 'Z').getTime()) > maxAgeHours * 3600e3;
  if (stale) ctx.waitUntil(refreshCostHealth(env).catch(() => {}));
  return stale;
}

/* ---------------- routes ---------------- */
export default {

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (path === '/health') return json({ ok: true, tool: 'mobius-profit' });

    /* Why can't I sign in? Reports only capability booleans and the result for the
       token you supplied — no secrets, no other user's state. */
    if (path === '/api/auth-check') {
      const tok = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
      const out = {
        has_auth_binding: !!env.AUTH,
        has_session_secret: !!env.SESSION_SECRET,
        has_admin_token: !!env.ADMIN_TOKEN,
        shared_password_set: !!(await env.DB.prepare(`SELECT value FROM settings WHERE key = 'passwordHash'`).first())?.value,
        token_seen: tok ? `${tok.slice(0, 4)}…(${tok.length})` : null,
      };
      // Prove the worker-to-worker binding is actually reachable.
      try {
        const probe = env.AUTH ? await env.AUTH.fetch(new Request(`${AUTH_WORKER}/health`)) : null;
        out.auth_binding_reachable = probe ? probe.ok : null;
      } catch (e) { out.auth_binding_reachable = false; out.auth_binding_error = e.message; }
      if (tok) {
        out.local_session_verify = !!(await verifySession(env, tok));
        out.delegated_verify = await delegateSession(env, tok);
        out.authorized = await isAdmin(request, env);
        out.kind = await authKind(request, env);
      }
      return json(out);
    }
    if (path === '/') return Response.redirect(DASHBOARD_URL, 302);
    /* Read-only plan for the client. The token in the URL is the auth — this is
       the page you share on the monthly call, so it carries the plan and nothing
       else: no other client, no internal notes, no cost diagnostics. */
    let pm;
    if ((pm = path.match(/^\/api\/plan\/([a-f0-9]{16,})$/)) && request.method === 'GET') {
      try {
        const row = await env.DB.prepare(`SELECT * FROM p_plan WHERE share_token = ?1`).bind(pm[1]).first();
        if (!row) return json({ error: 'This plan link is no longer valid.' }, 404);
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(row.act_id).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        const goals = goalsFor({ ...acct, goals: safeJson(acct.goals_json, {}) }, row.month);
        const history = await monthHistory(env, acct, row.month, 6);
        return json({
          plan: true,
          account: { name: acct.name, currency: acct.currency },
          month: row.month,
          goals: { sales: goals.sales ?? null, spend: goals.spend ?? null, amer: goals.amer ?? null },
          growth_pct: row.growth_pct, basis_sales: row.basis_sales, basis_label: row.basis_label,
          required_spend: row.required_spend, expected_cm: row.expected_cm,
          agreed_at: row.agreed_at, note: row.note,
          history: history.filter(h => !h.empty).map(h => ({ month: h.month, sales: h.sales, spend: h.spend, partial: h.partial })),
        });
      } catch (e) { return json({ error: e.message }, 500); }
    }

    /* Read-only PERFORMANCE snapshot for the client. Same contract as the plan link:
       the token is the auth, and it exposes exactly one client's headline numbers.
       Never cost diagnostics, never another account, never the margin override -
       those are internal, and this URL is meant to be forwarded around. */
    let sm;
    if ((sm = path.match(/^\/api\/profit\/([a-f0-9]{16,})$/)) && request.method === 'GET') {
      try {
        const row = await env.DB.prepare(`SELECT * FROM p_profit_share WHERE token = ?1`).bind(sm[1]).first();
        if (!row) return json({ error: 'This link is no longer valid.' }, 404);
        // null: resolve real OR demo. The share token is the authorization here, so
        // letting the demo brand render its own client page is safe and gives the
        // App Store listing a screenshot that exposes no real merchant.
        const acct = (await listAccounts(env, false, null)).find(a => a.act_id === row.act_id);
        if (!acct) return json({ error: 'unknown account' }, 404);
        const today = localDate(acct.tz);
        const ym = monthOf(today);
        const monthStart = `${ym}-01`;
        const { rows, margin_pct } = await seriesFor(env, acct, monthStart, addDays(today, -1));
        const t = totals(rows);
        const g = goalsFor(acct, ym);
        const planned = !!safeJson(acct.goals_json, {})[ym];
        // Profit is shown only when we would trust it internally. A client should
        // never be the first person to see a number the Costs page calls broken.
        const snap = await env.DB.prepare(`SELECT verdict FROM p_cost_health WHERE act_id = ?1`).bind(acct.act_id).first().catch(() => null);
        const cmOk = margin_pct != null || !(snap?.verdict === 'broken' || snap?.verdict === 'none');
        const history = (await monthHistory(env, acct, ym, 6))
          .filter(h => !h.empty)
          .map(h => ({ month: h.month, sales: h.sales, spend: h.spend, mer: h.mer, partial: !!h.partial }));
        // Their weekly rhythm - the same analysis the internal Profit tab shows, and
        // the one thing here that is genuinely presentable on a call.
        const rhythm = await weekdayRhythm(env, acct, 3).catch(() => null);
        return json({
          share: true,
          account: { name: acct.name, currency: acct.currency },
          month: ym, days: rows.length, days_in_month: daysInMonth(ym),
          mtd: {
            sales: t.sales, spend: t.spend, mer: t.mer, amer: t.amer,
            new_share: t.new_share, new_rev: t.new_rev, ret_rev: t.ret_rev,
            cm: cmOk ? t.cm : null, margin: cmOk ? t.margin : null,
          },
          // Where the money went. Only when the cost data passes the same trust check
          // the internal pages use - a client must never be first to see a shaky figure.
          waterfall: cmOk ? {
            net_sales: t.net_sales, ship_rev: t.ship_rev, tax: t.tax, total_sales: t.total_sales,
            sales: t.sales, cogs: t.cogs, ship_cost: t.ship_cost, handling: t.handling,
            fees: t.fees, gross_profit: t.gross_profit, spend: t.spend, cm: t.cm,
          } : null,
          // Daily shape, for the chart. Money only - no cost diagnostics per day.
          rows: rows.map(r => ({ date: r.date, sales: r.sales, spend: r.spend })),
          rhythm: rhythm && rhythm.enough ? rhythm : null,
          cm_ok: cmOk,
          // Pro-rated to the days elapsed, exactly as the internal pages do it.
          plan: planned && (g.sales != null || g.spend != null) ? planFor(acct, ym, rows) : null,
          history,
        });
      } catch (e) { return json({ error: e.message }, 500); }
    }

    /* Read-only report ARCHIVE for the client. Same contract as the other client
       links: the token in the URL is the auth, it exposes exactly one client, and
       only reports that were deliberately SENT — a draft the team is still
       reviewing must never be visible here. Internal workings (cost diagnostics,
       the margin override, the change log) are stripped before the payload
       leaves: this URL gets forwarded around. */
    let rvm;
    if ((rvm = path.match(/^\/api\/report-view\/([a-f0-9]{16,})$/)) && request.method === 'GET') {
      try {
        const tokens = safeJson((await env.DB.prepare(
          `SELECT value FROM settings WHERE key = 'reportTokens'`).first())?.value, {});
        const t = tokens[rvm[1]];
        if (!t) return json({ error: 'This report link is no longer valid.' }, 404);
        const acct = await env.DB.prepare(`SELECT name, currency FROM accounts WHERE act_id = ?1`).bind(t.act_id).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        const { results } = await env.DB.prepare(
          `SELECT period, period_start, period_end, sent_at FROM reports
           WHERE act_id = ?1 AND status = 'sent' ORDER BY period_start DESC, period LIMIT 60`,
        ).bind(t.act_id).all();
        const wantP = url.searchParams.get('period'), wantS = url.searchParams.get('start');
        const pick = wantP && wantS
          ? results.find(r => r.period === wantP && r.period_start === wantS)
          : results[0];
        let report = null;
        if (pick) {
          const row = await env.DB.prepare(
            `SELECT * FROM reports WHERE act_id = ?1 AND period = ?2 AND period_start = ?3 AND status = 'sent'`,
          ).bind(t.act_id, pick.period, pick.period_start).first();
          if (row) {
            const data = safeJson(row.data_json, null);
            // `account` carries the Meta act_id — internal. The top-level account
            // object (name + currency) is all the page needs.
            if (data) for (const k of ['cogs_quality', 'margin_28d', 'cm_pct', 'changes', 'changes_total', 'account']) delete data[k];
            report = { period: row.period, start: row.period_start, end: row.period_end,
              sent_at: row.sent_at, summary: row.summary, data };
          }
        }
        return json({ share: true, account: { name: acct.name, currency: acct.currency }, reports: results, report });
      } catch (e) { return json({ error: e.message }, 500); }
    }

    /* ---- Shopify: install, callback, and the mandatory compliance webhooks ----
       These are called by Shopify and by merchants, never by a signed-in Mobius user,
       so they sit above the dashboard auth gate and authenticate themselves by HMAC. */
    if (path === '/shopify/install') {
      const shop = (url.searchParams.get('shop') || '').toLowerCase().trim();
      if (!SHOP_RE.test(shop)) return new Response('Invalid shop domain.', { status: 400 });
      if (!env.SHOPIFY_API_KEY) return new Response('Shopify app is not configured yet.', { status: 503 });
      // A nonce Shopify must hand back, so a callback we did not start is rejected.
      const state = crypto.randomUUID().replace(/-/g, '');
      await env.DB.prepare(`INSERT INTO p_oauth_state (state, shop) VALUES (?1, ?2)`).bind(state, shop).run();
      const redirectUri = `${url.origin}/shopify/callback`;
      const auth = new URL(`https://${shop}/admin/oauth/authorize`);
      auth.searchParams.set('client_id', env.SHOPIFY_API_KEY);
      auth.searchParams.set('scope', SHOPIFY_SCOPES);
      auth.searchParams.set('redirect_uri', redirectUri);
      auth.searchParams.set('state', state);
      return Response.redirect(auth.toString(), 302);
    }

    if (path === '/shopify/callback') {
      const shop = (url.searchParams.get('shop') || '').toLowerCase().trim();
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      if (!SHOP_RE.test(shop) || !code || !state) return new Response('Invalid request.', { status: 400 });
      if (!(await validOauthHmac(env, url))) return new Response('HMAC validation failed.', { status: 401 });
      // The nonce must be one WE issued, for THIS shop, and it is single use.
      const st = await env.DB.prepare(`SELECT shop FROM p_oauth_state WHERE state = ?1`).bind(state).first();
      await env.DB.prepare(`DELETE FROM p_oauth_state WHERE state = ?1`).bind(state).run().catch(() => {});
      if (!st || st.shop !== shop) return new Response('Invalid or expired state.', { status: 401 });

      const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: env.SHOPIFY_API_KEY, client_secret: env.SHOPIFY_API_SECRET, code }),
      });
      if (!res.ok) return new Response('Could not complete the install.', { status: 502 });
      const tok = await res.json().catch(() => ({}));
      if (!tok.access_token) return new Response('No access token returned.', { status: 502 });

      const actId = await matchAccount(env, shop);
      await env.DB.prepare(
        `INSERT INTO p_shopify (shop, act_id, access_token, scopes, installed_at, uninstalled_at)
         VALUES (?1,?2,?3,?4,datetime('now'),NULL)
         ON CONFLICT(shop) DO UPDATE SET act_id = excluded.act_id, access_token = excluded.access_token,
           scopes = excluded.scopes, installed_at = excluded.installed_at, uninstalled_at = NULL`,
      ).bind(shop, actId, tok.access_token, tok.scope ?? SHOPIFY_SCOPES).run();

      await registerUninstallWebhook(env, shop, tok.access_token, url.origin);

      // Land the merchant on their OWN dashboard, not a dead end. A static
      // "connected" page fails App Store review outright - every app must have a UI
      // merchants can interact with - and it is a worse experience regardless.
      if (actId) {
        const token = await profitShareToken(env, actId);
        return Response.redirect(`${DASHBOARD_URL}?perf=${token}`, 302);
      }

      // No client record matches this domain yet - but STILL redirect into the app.
      // "Immediately redirects to app UI after authentication" is one of Shopify's
      // automated checks, and a reviewer installs on their own test store, which by
      // definition matches no client. Returning HTML straight from the worker looked
      // like the flow ended here. The app page explains the state instead.
      return Response.redirect(`${DASHBOARD_URL}?connected=${encodeURIComponent(shop)}`, 302);
    }

    /* Mandatory compliance webhooks. Review rejects the app if these are missing, or
       if an invalid HMAC returns anything other than 401. */
    if (path.startsWith('/shopify/webhooks/')) {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      const raw = await request.text();
      if (!(await validWebhookHmac(env, raw, request.headers.get('X-Shopify-Hmac-Sha256')))) {
        return new Response('Unauthorized', { status: 401 });
      }
      const topic = request.headers.get('X-Shopify-Topic') || path.split('/').pop();
      const body = safeJson(raw, {});
      const shop = (body.shop_domain || request.headers.get('X-Shopify-Shop-Domain') || '').toLowerCase();

      if (topic === 'app/uninstalled') {
        // The token is dead the moment the merchant uninstalls - stop using it.
        await env.DB.prepare(`UPDATE p_shopify SET uninstalled_at = datetime('now'), access_token = '' WHERE shop = ?1`).bind(shop).run().catch(() => {});
      } else if (topic === 'shop/redact') {
        // 48h after uninstall. We hold no shop-level personal data beyond the token.
        await env.DB.prepare(`DELETE FROM p_shopify WHERE shop = ?1`).bind(shop).run().catch(() => {});
      }
      // customers/data_request and customers/redact: we store no customer-level personal
      // data - the sync keeps only aggregates and anonymous customer ids - so there is
      // nothing to return or erase. Acknowledged so Shopify records compliance.
      return json({ ok: true, topic });
    }

    /* A shared creative snapshot. UNAUTHENTICATED by design - it is sent to a
       client - so it lives above the auth gate with the other share links, and
       it can only ever return the one snapshot its token names. Frozen at mint
       time: the rows and the cover images are stored whole, so what the client
       opens is exactly what was on screen when it was shared. */
    let asm;
    if ((asm = path.match(/^\/api\/ad-share\/([a-f0-9]{16,})$/)) && request.method === 'GET') {
      const row = await env.DB.prepare(
        `SELECT act_id, created_at, label, data_json FROM p_ad_share WHERE token = ?1`).bind(asm[1]).first();
      if (!row) return json({ error: 'This link is no longer valid.' }, 404);
      const acct = await env.DB.prepare(`SELECT name, currency FROM accounts WHERE act_id = ?1`).bind(row.act_id).first();
      const d = safeJson(row.data_json, null);
      if (!d) return json({ error: 'This link is no longer valid.' }, 404);
      /* Strip anything that is OURS rather than theirs. The browser carries a
         materiality floor, a total-spend denominator and per-ad share figures
         that exist to keep US honest about what a ranking omits; a client
         reading "8 of 61 ads" learns only that something is being withheld. */
      delete d.floor; delete d.matched; delete d.acct_cpa; delete d.total_spend; delete d.shown_spend;
      for (const a of d.ads || []) { delete a.share; delete a.material; delete a.status; }
      return json({ share: true, account: { name: acct?.name || '', currency: acct?.currency || 'USD' },
        created_at: row.created_at, label: row.label, ...d });
    }

    /* PLAYBACK ON A CLIENT LINK, and this was broken for reports too.
       /api/ad-video is in PROXY_PATHS, but the proxy runs INSIDE the authed
       section - so an unauthenticated client clicking play hit this gate and
       got "unauthorized" long before the request reached the worker that knows
       how to validate a share token. Forward it here instead when it carries
       one; account-health checks the token against that client's own sent
       report or shared ad set, and rejects anything else. */
    if (path === '/api/ad-video' && request.method === 'GET'
        && (url.searchParams.get('report') || url.searchParams.get('ads'))) {
      const target = `${AUTH_WORKER}${path}${url.search}`;
      const init = { method: 'GET', headers: {} };
      const res = env.AUTH ? await env.AUTH.fetch(new Request(target, init)) : await fetch(target, init);
      return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    const kind = await authKind(request, env);
    if (!kind) return json({ error: 'unauthorized' }, 401);
    const isDemo = kind === 'demo';
    // A demo session is READ-ONLY. The reviewer must be able to see every screen and
    // change nothing - no goals, no margin overrides, no Triple Whale backfills.
    if (isDemo && request.method !== 'GET') {
      return json({ error: 'This is a read-only demo account.' }, 403);
    }
    // Same gate, different reason. Viewers read everything and change nothing.
    if (request.method !== 'GET' && (await roleFor(env, await sessionEmail(env, request))) === 'viewer') {
      return json({ error: 'Your account has view-only access, so this cannot be changed. Ask an admin on your team.' }, 403);
    }
    // Every account lookup below goes through this, so a demo session can only ever
    // resolve the demo brand and a real session can never see it.
    const accountsFor = (activeOnly = true) => listAccounts(env, activeOnly, isDemo);

    try {
      const days = Math.min(+url.searchParams.get('days') || 30, 180);
      /* An explicit window, for the period bar's "Last month" and "Custom range".
         Neither is expressible as "N days ending yesterday", which is all `days`
         can say. When absent every caller keeps the old behaviour exactly.
         `to` is still clamped to yesterday per account below - today is partial
         everywhere in this tool and must not leak into a window. */
      const qFrom = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('from') || '') ? url.searchParams.get('from') : null;
      const qTo = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('to') || '') ? url.searchParams.get('to') : null;
      /** The window for one account, honouring an explicit range over `days`. */
      const windowFor = (acct) => {
        const today = localDate(acct.tz), yday = addDays(today, -1);
        const to = qTo && qTo < yday ? qTo : yday;
        const from = qFrom || addDays(today, -days);
        return { today, from: from > to ? to : from, to };
      };

      /* All clients, store-level. The blended view Account Health deliberately lacks. */
      if (path === '/api/overview') {
        const accounts = await accountsFor();
        const { results: healthRows } = await env.DB.prepare(`SELECT * FROM p_cost_health`).all();
        const byAct = Object.fromEntries(healthRows.map(r => [r.act_id, r]));
        const out = [];
        for (const a of accounts) {
          const today = localDate(a.tz);
          const ym = monthOf(today);
          // Fetch back to the 1st even when the picker window is shorter, so "MTD"
          // is always genuinely month-to-date - a 7-day window used to silently
          // truncate it to the last 7 days and still label it MTD.
          const { from, to } = windowFor(a);
          const monthStart = `${ym}-01`;
          const { rows: allRows, margin_pct, shipping } = await seriesFor(env, a, from < monthStart ? from : monthStart, to);
          const rows = allRows.filter(r => r.date >= from && r.date <= to);
          const g = goalsFor(a, ym);
          // First load (or a new client) has no snapshot yet — judge inline so the
          // page is never blank, and let refreshIfStale persist it in the background.
          const health = byAct[a.act_id] || (margin_pct != null
            ? { verdict: 'override', reason: `using a flat ${Math.round(margin_pct * 100)}% margin override`, blended: margin_pct }
            : judgeCosts(rows));
          const mtdRows = allRows.filter(r => r.date >= monthStart);
          out.push({
            ...pubAccount(a),
            window: totals(rows),
            mtd: totals(mtdRows),
            goals: g.sales != null || g.spend != null ? g : null,
            plan: planFor(a, ym, mtdRows),
            margin_pct, cost_health: health, shipping,
            slack_channel: a.slack_channel || null, brief_channel: a.brief_channel || null,
            brief_enabled: !!a.brief_enabled,
            review_first: !!a.review_first,
            report_config: safeJson(a.report_config_json, {}),
          });
        }
        await refreshIfStale(env, ctx);
        // `kind` lets the frontend hide what a demo session cannot reach. The Daily
        // Brief and Settings both call PROXIED endpoints on the account-health
        // worker, which does not know the demo password and answers 401 - showing a
        // reviewer two tabs that only ever error is worse than not showing them.
        return json({ days, from: qFrom, to: qTo, accounts: out, kind });
      }

      /* One client: the daily series and totals behind it. */
      if (path === '/api/client') {
        const act = url.searchParams.get('act');
        const acct = (await accountsFor(false)).find(a => a.act_id === act);
        if (!acct) return json({ error: 'unknown account' }, 404);
        const { today, from, to } = windowFor(acct);
        const ym = monthOf(today);
        const monthStart = `${ym}-01`;
        const { rows: allRows, margin_pct, shipping } = await seriesFor(env, acct, from < monthStart ? from : monthStart, to);
        const rows = allRows.filter(r => r.date >= from && r.date <= to);
        // planFor spreads the month goal over the days ELAPSED, so it must see the
        // month-to-date rows - the whole window here once pro-rated a plan past 100%.
        const mtdRows = allRows.filter(r => r.date >= monthStart);
        return json({
          account: pubAccount(acct), days, from, to, margin_pct, rows, shipping,
          totals: totals(rows), mtd: totals(mtdRows),
          goals: goalsFor(acct, ym), plan: planFor(acct, ym, mtdRows),
        });
      }

      /* Costs page: is this client's cost data trustworthy, and if not, why? */
      /* The bottom-up forecast: where the month actually lands, and which layer
         explains the gap to the goal. */
      if (path === '/api/forecast') {
        const act = url.searchParams.get('act');
        const acct = (await accountsFor(false)).find(a => a.act_id === act);
        if (!acct) return json({ error: 'unknown account' }, 404);
        const ym = url.searchParams.get('month') || monthOf(localDate(acct.tz));
        const f = await forecastFor(env, acct, ym);
        if (!f) return json({ error: 'not enough Triple Whale history to forecast yet' }, 400);
        return json({ account: pubAccount(acct), ...f });
      }

      /* The month plan: what the last six months did, what next month looks like
         at each growth choice, and whether the client has agreed to it. */
      if (path === '/api/plan' && request.method === 'GET') {
        const act = url.searchParams.get('act');
        const acct = (await accountsFor(false)).find(a => a.act_id === act);
        if (!acct) return json({ error: 'unknown account' }, 404);
        const today = localDate(acct.tz);
        const ym = url.searchParams.get('month') || monthOf(today);
        const history = await monthHistory(env, acct, monthOf(today) > ym ? monthOf(today) : ym, 8);

        // Basis: the last COMPLETE month if we have one, else the current month's
        // run-rate. Agreeing next month against a half-finished month would lowball it.
        const complete = history.filter(h => !h.empty && !h.partial && h.days >= h.days_in_month - 2 && h.month < ym);
        const lastComplete = complete[complete.length - 1] || null;
        const current = history.find(h => h.month === monthOf(today) && !h.empty && h.month < ym) || null;
        const basis = lastComplete
          ? { sales: lastComplete.sales, label: `${lastComplete.month} actual`, month: lastComplete.month }
          : current
          ? { sales: current.sales / current.days * current.days_in_month, label: `${current.month} run-rate`, month: current.month }
          : null;

        const fc = await forecastFor(env, acct, monthOf(today));
        // Deliberately mixed windows, so both are stated rather than assumed:
        // efficiency and returning behavior come from the most RECENT 28 days
        // (they move), while the revenue basis and margin come from the last
        // COMPLETE month (a part-month would lowball the goal).
        const marginSrc = lastComplete || current;
        const ctx = {
          days_in_month: daysInMonth(ym),
          returning_per_day: fc?.basis?.returning_per_day ?? null,
          amer: fc?.basis?.amer ?? null,
          margin: marginSrc?.margin ?? null,
          sources: {
            trailing_days: fc?.basis?.days ?? null,
            trailing_from: fc?.basis?.from ?? null,
            trailing_to: fc?.basis?.to ?? null,
            margin_month: marginSrc?.month ?? null,
            basis_month: basis?.month ?? null,
          },
        };
        const options = basis ? [0, 0.1, 0.2, 0.3].map(g => planMath('growth', g, ctx, basis.sales)) : [];

        // A month that has already run is a record, not a decision: show what was
        // planned against what actually happened, and lock the controls.
        const today2 = monthOf(today);
        const status = ym < today2 ? 'past' : ym === today2 ? 'current' : 'future';
        let actual = null;
        if (status !== 'future') {
          const h = history.find(x => x.month === ym && !x.empty);
          if (h) actual = { sales: h.sales, spend: h.spend, cm: h.cm, mer: h.mer, amer: h.amer,
            days: h.days, days_in_month: h.days_in_month, partial: !!h.partial };
        }
        const saved = await env.DB.prepare(`SELECT * FROM p_plan WHERE act_id = ?1 AND month = ?2`).bind(act, ym).first();
        return json({
          account: pubAccount(acct), month: ym, status, actual, history, basis, ctx, options,
          goals: goalsFor(acct, ym), plan: saved || null,
          // A month only counts as planned if somebody planned THAT month. The
          // `default` block is an inheritance convenience and would otherwise make
          // every future month look like it already had a plan.
          planned: !!safeJson(acct.goals_json, {})[ym],
          current_month: today2,
          at_current_pace: fc ? { projected: fc.at_current_pace?.sales ?? null, month: fc.month } : null,
        });
      }

      /* Save the agreed plan. Writes the goals everything else reads, and records
         the story around them separately. */
      if (path === '/api/plan' && request.method === 'PUT') {
        const b = await request.json().catch(() => ({}));
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(b.act).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        const ym = b.month || monthOf(localDate(acct.tz));
        if (b.sales == null || !(+b.sales > 0)) return json({ error: 'a sales goal is required' }, 400);

        const goals = safeJson(acct.goals_json, {});
        const keep = goals[ym]?.cm_pct ?? goals.default?.cm_pct ?? null;
        const m = { sales: +b.sales };
        if (b.spend != null && b.spend !== '') m.spend = +b.spend;
        if (b.amer != null && b.amer !== '') m.amer = +b.amer;
        if (keep != null) m.cm_pct = keep;
        goals[ym] = m;
        goals.default = { ...m };
        await env.DB.prepare(`UPDATE accounts SET goals_json = ?2 WHERE act_id = ?1`)
          .bind(acct.act_id, JSON.stringify(goals)).run();

        const prev = await env.DB.prepare(`SELECT share_token, agreed_at, agreed_by FROM p_plan WHERE act_id = ?1 AND month = ?2`).bind(acct.act_id, ym).first();
        // Changing the numbers invalidates any previous sign-off — you cannot agree
        // to a plan and then quietly move it.
        const numbersChanged = b.reagree === true;
        await env.DB.prepare(
          `INSERT INTO p_plan (act_id, month, growth_pct, basis_sales, basis_label, required_spend, expected_cm, agreed_at, agreed_by, share_token, note, updated_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,datetime('now'))
           ON CONFLICT(act_id, month) DO UPDATE SET growth_pct=excluded.growth_pct, basis_sales=excluded.basis_sales,
             basis_label=excluded.basis_label, required_spend=excluded.required_spend, expected_cm=excluded.expected_cm,
             agreed_at=excluded.agreed_at, agreed_by=excluded.agreed_by, note=excluded.note, updated_at=datetime('now')`,
        ).bind(acct.act_id, ym, b.growth_pct ?? null, b.basis_sales ?? null, b.basis_label ?? null,
          b.spend ?? null, b.expected_cm ?? null,
          numbersChanged ? null : (prev?.agreed_at ?? null),
          numbersChanged ? null : (prev?.agreed_by ?? null),
          prev?.share_token ?? null, b.note ?? null).run();
        return json({ ok: true, goals: m });
      }

      /* Client sign-off, and the read-only link you take to the call. */
      if (path === '/api/plan-agree' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(b.act).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        const g = goalsFor({ ...acct, goals: safeJson(acct.goals_json, {}) }, b.month);
        if (g.sales == null) return json({ error: 'there is no plan for this month to agree to yet' }, 400);
        // Upsert: a plan can exist as goals without a p_plan row (goals set from the
        // Daily Brief page, say), and you should still be able to record sign-off.
        const at = b.agreed ? new Date().toISOString() : null;
        await env.DB.prepare(
          `INSERT INTO p_plan (act_id, month, agreed_at, agreed_by, updated_at)
           VALUES (?1,?2,?3,?4,datetime('now'))
           ON CONFLICT(act_id, month) DO UPDATE SET agreed_at = excluded.agreed_at,
             agreed_by = excluded.agreed_by, updated_at = datetime('now')`,
        ).bind(b.act, b.month, at, b.agreed ? (b.by || 'Mobius') : null).run();
        return json({ ok: true, agreed_at: at });
      }
      if (path === '/api/plan-share' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const acct2 = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(b.act).first();
        if (!acct2) return json({ error: 'unknown account' }, 404);
        const g2 = goalsFor({ ...acct2, goals: safeJson(acct2.goals_json, {}) }, b.month);
        if (g2.sales == null) return json({ error: 'set a revenue goal for this month first' }, 400);
        const row = await env.DB.prepare(`SELECT share_token FROM p_plan WHERE act_id = ?1 AND month = ?2`).bind(b.act, b.month).first();
        let token = row?.share_token;
        if (!token) {
          token = crypto.randomUUID().replace(/-/g, '');
          await env.DB.prepare(
            `INSERT INTO p_plan (act_id, month, share_token, updated_at) VALUES (?1,?2,?3,datetime('now'))
             ON CONFLICT(act_id, month) DO UPDATE SET share_token = excluded.share_token, updated_at = datetime('now')`,
          ).bind(b.act, b.month, token).run();
        }
        return json({ ok: true, url: `${DASHBOARD_URL}?plan=${token}` });
      }

      /* Mint (or return) this client's read-only performance link. */
      /* Freeze the creative browser exactly as it is on screen and mint a link.
         The whole payload is stored, including the baked cover images, because
         Meta's asset URLs are signed and expire - a link that renders empty
         boxes in a fortnight is worse than no link. */
      if (path === '/api/ad-share' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        if (!b.act || !b.data || !Array.isArray(b.data.ads)) return json({ error: 'nothing to share' }, 400);
        const acct = (await accountsFor(false)).find(a => a.act_id === b.act);
        if (!acct) return json({ error: 'unknown account' }, 404);
        const token = crypto.randomUUID().replace(/-/g, '');
        await env.DB.prepare(
          `INSERT INTO p_ad_share (token, act_id, label, data_json) VALUES (?1,?2,?3,?4)`,
        ).bind(token, b.act, String(b.label || '').slice(0, 120), JSON.stringify(b.data)).run();
        return json({ ok: true, token, url: `${DASHBOARD_URL}?ads=${token}` });
      }

      if (path === '/api/profit-share' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const acct = (await accountsFor(false)).find(a => a.act_id === b.act);
        if (!acct) return json({ error: 'unknown account' }, 404);
        let token;
        if (b.regenerate) {
          token = crypto.randomUUID().replace(/-/g, '');
          await env.DB.prepare(
            `INSERT INTO p_profit_share (act_id, token, created_at) VALUES (?1,?2,datetime('now'))
             ON CONFLICT(act_id) DO UPDATE SET token = excluded.token, created_at = datetime('now')`,
          ).bind(b.act, token).run();
        } else {
          token = await profitShareToken(env, b.act);
        }
        return json({ ok: true, url: `${DASHBOARD_URL}?perf=${token}`, regenerated: !!b.regenerate });
      }

      /* Every client's Shopify connection state, plus the link that connects one.
       * Cole asked where clients get added moving forward - this is that screen. */
      if (path === '/api/connections') {
        const accounts = await accountsFor(false);
        const { results: shops } = await env.DB.prepare(`SELECT * FROM p_shopify`).all()
          .catch(() => ({ results: [] }));
        const { results: coRows } = await env.DB.prepare(
          `SELECT act_id, COUNT(*) AS n, MAX(as_of) AS as_of FROM p_cohorts GROUP BY act_id`,
        ).all().catch(() => ({ results: [] }));
        const coBy = Object.fromEntries(coRows.map(r => [r.act_id, r]));

        const byAct = {};
        for (const sh of shops) if (sh.act_id) (byAct[sh.act_id] ??= []).push(sh);
        // A store only gets an install link if we actually know its domain.
        const installUrl = d => (SHOP_RE.test(d || '') ? `${url.origin}/shopify/install?shop=${encodeURIComponent(d)}` : null);

        const clients = accounts.map(a => {
          const rows = byAct[a.act_id] || [];
          const live = rows.find(r => !r.uninstalled_at && r.access_token);
          const past = rows[0];
          const co = coBy[a.act_id];
          return {
            act_id: a.act_id, name: a.name, active: !!a.active,
            shop: live?.shop ?? past?.shop ?? a.tw_shop ?? null,
            // 'uninstalled' is deliberately distinct from 'not_connected': a merchant
            // who removed the app looks identical otherwise, and that is the one case
            // where the data silently stops updating.
            status: live ? 'connected' : past ? 'uninstalled' : 'not_connected',
            installed_at: live?.installed_at ?? null,
            uninstalled_at: live ? null : (past?.uninstalled_at ?? null),
            last_sync_at: live?.last_sync_at ?? null,
            cohort_months: co?.n ?? 0, cohort_as_of: co?.as_of ?? null,
            install_url: installUrl(a.tw_shop || live?.shop || past?.shop),
          };
        });

        // Installed but matched no client. Without this list the store's data is
        // stranded and nothing on screen ever says why.
        const unmatched = shops.filter(sh => !sh.act_id && !sh.uninstalled_at)
          .map(sh => ({ shop: sh.shop, installed_at: sh.installed_at }));

        return json({ clients, unmatched, app_configured: !!env.SHOPIFY_API_KEY });
      }

      /* Pull cohorts from Shopify for one connected store, or for all of them.
       * Manual rather than cron: this account is at the free-plan trigger limit, and
       * cohorts move slowly enough that on-demand plus the nightly account-health
       * pass is sufficient. One shop at a time - each is two ShopifyQL round trips
       * plus a D1 batch, and six in one invocation would risk the subrequest cap. */
      if (path === '/api/cohort-sync' && request.method === 'POST') {
        const act = url.searchParams.get('act');
        const { results: shops } = await env.DB.prepare(
          `SELECT * FROM p_shopify WHERE uninstalled_at IS NULL AND access_token <> ''
             AND act_id IS NOT NULL ${act && act !== 'all' ? 'AND act_id = ?1' : ''}`,
        ).bind(...(act && act !== 'all' ? [act] : [])).all().catch(() => ({ results: [] }));
        if (!shops.length) return json({ error: 'no connected store for that client' }, 404);
        const out = [];
        for (const row of shops) {
          try { out.push(await syncCohorts(env, row)); }
          catch (e) { out.push({ shop: row.shop, act_id: row.act_id, error: e.message }); }
        }
        return json({ ok: out.some(r => r.months), results: out });
      }

      /* Point a connected store at a client, for a domain that did not auto-match. */
      if (path === '/api/connections/map' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        if (!SHOP_RE.test(b.shop || '')) return json({ error: 'invalid shop domain' }, 400);
        const acct = (await accountsFor(false)).find(a => a.act_id === b.act);
        if (!acct) return json({ error: 'unknown account' }, 404);
        const r = await env.DB.prepare(`UPDATE p_shopify SET act_id = ?2 WHERE shop = ?1`)
          .bind(b.shop, b.act).run();
        if (!r.meta?.changes) return json({ error: 'that store has not installed the app' }, 404);
        return json({ ok: true, shop: b.shop, act: b.act });
      }

      /* Real cohorts, for stores that have connected Shopify. */
      if (path === '/api/cohorts') {
        const act = url.searchParams.get('act');
        const acct = (await accountsFor(false)).find(a => a.act_id === act);
        if (!acct) return json({ error: 'unknown account' }, 404);
        return json(await cohorts(env, acct));
      }

      /* Quarter to date: the three monthly plans rolled up. */
      if (path === '/api/quarter') {
        const act = url.searchParams.get('act');
        const acct = (await accountsFor(false)).find(a => a.act_id === act);
        if (!acct) return json({ error: 'unknown account' }, 404);
        const today = localDate(acct.tz);
        const thisYm = monthOf(today);
        const q = url.searchParams.get('q') || `${thisYm.slice(0, 4)}-Q${Math.floor(+thisYm.slice(5, 7) / 3.001) + 1}`;
        const [qy, qn] = [+q.slice(0, 4), +q.slice(6)];
        const months = [0, 1, 2].map(i => `${qy}-${String((qn - 1) * 3 + 1 + i).padStart(2, '0')}`);
        const gjson = safeJson(acct.goals_json, {});
        const from = `${months[0]}-01`;
        const lastDay = `${months[2]}-${String(daysInMonth(months[2])).padStart(2, '0')}`;
        const to = today < lastDay ? addDays(today, -1) : lastDay;
        const { rows } = from <= to ? await seriesFor(env, acct, from, to) : { rows: [] };
        const per = months.map(ym => {
          const mr = rows.filter(r => r.date.startsWith(ym));
          const t = mr.length ? totals(mr) : null;
          // Only an EXPLICIT entry counts as planned - `default` is inheritance.
          const g = gjson[ym] || null;
          return {
            month: ym, planned: !!g,
            goal_sales: g?.sales ?? null, goal_spend: g?.spend ?? null,
            sales: t?.sales ?? null, spend: t?.spend ?? null, cm: t?.cm ?? null,
            days: mr.length, days_in_month: daysInMonth(ym),
            status: ym < thisYm ? 'past' : ym === thisYm ? 'current' : 'future',
          };
        });
        const sum = (get) => per.reduce((a, x) => a + (get(x) ?? 0), 0);
        const anyPlanned = per.some(x => x.planned);
        return json({
          account: pubAccount(acct), quarter: q, months,
          per, unplanned: per.filter(x => !x.planned).map(x => x.month),
          goal_sales: anyPlanned ? sum(x => x.goal_sales) : null,
          goal_spend: anyPlanned ? sum(x => x.goal_spend) : null,
          sales: sum(x => x.sales), spend: sum(x => x.spend), cm: sum(x => x.cm),
          days_done: sum(x => x.days),
          days_total: months.reduce((a, m) => a + daysInMonth(m), 0),
        });
      }

      /* What a new customer costs, and whether the first order pays it back. */
      if (path === '/api/customers') {
        const act = url.searchParams.get('act');
        const acct = (await accountsFor(false)).find(a => a.act_id === act);
        if (!acct) return json({ error: 'unknown account' }, 404);
        const snap = await env.DB.prepare(`SELECT verdict FROM p_cost_health WHERE act_id = ?1`).bind(act).first().catch(() => null);
        const r = await customerEconomics(env, acct, Math.min(+url.searchParams.get('months') || 6, 12),
          Math.min(+url.searchParams.get('days') || 30, 180), (qFrom || qTo) ? windowFor(acct) : null);
        // Margin drives first-order CM, so the same trust gate applies.
        return json({ ...r, cm_ok: r.margin_pct != null || !(snap?.verdict === 'broken' || snap?.verdict === 'none') });
      }

      /* Weekday rhythm: what a week actually looks like for this client. */
      if (path === '/api/rhythm') {
        const act = url.searchParams.get('act');
        const acct = (await accountsFor(false)).find(a => a.act_id === act);
        if (!acct) return json({ error: 'unknown account' }, 404);
        const r = await weekdayRhythm(env, acct, Math.min(+url.searchParams.get('months') || 3, 6));
        // The current month's plan, so a reliable rhythm can be shown as dollars.
        const ym = url.searchParams.get('month') || monthOf(localDate(acct.tz));
        const g = goalsFor(acct, ym);
        return json({ ...r, plan: (g.sales != null || g.spend != null)
          ? { month: ym, sales: g.sales ?? null, spend: g.spend ?? null, days_in_month: daysInMonth(ym) } : null });
      }

      if (path === '/api/costs') {
        const act = url.searchParams.get('act');
        const acct = (await accountsFor(false)).find(a => a.act_id === act);
        if (!acct) return json({ error: 'unknown account' }, 404);
        const r = await costHealth(env, acct, Math.min(+url.searchParams.get('days') || 60, 180));
        const { results: skus } = await env.DB.prepare(
          `SELECT * FROM p_sku_costs WHERE act_id = ?1 ORDER BY sku LIMIT 500`,
        ).bind(act).all();
        return json({ ...r, skus });
      }

      /* The margin override — deliberately the SAME field the Daily Brief reads. */
      if (path === '/api/margin' && request.method === 'PUT') {
        const b = await request.json().catch(() => ({}));
        const acct = (await accountsFor(false)).find(a => a.act_id === b.act);
        if (!acct) return json({ error: 'unknown account' }, 404);
        const goals = safeJson(acct.goals_json, {});
        const ym = b.month || monthOf(localDate(acct.tz));
        const pct = b.margin_pct === '' || b.margin_pct == null ? null : +b.margin_pct;
        if (pct != null && (!isFinite(pct) || pct <= 0 || pct >= 1)) {
          return json({ error: 'margin must be between 0 and 100%' }, 400);
        }
        // The override is CLIENT-level. Month entries each carry a copy (PUT /api/plan
        // preserves it per month), so touch every key - clearing only [ym, default]
        // used to leave a stale cm_pct on any already-saved future month.
        for (const key of new Set([ym, 'default', ...Object.keys(goals)])) {
          goals[key] = goals[key] || {};
          if (pct == null) delete goals[key].cm_pct; else goals[key].cm_pct = pct;
        }
        await env.DB.prepare(`UPDATE accounts SET goals_json = ?2 WHERE act_id = ?1`)
          .bind(acct.act_id, JSON.stringify(goals)).run();
        // Re-grade immediately: the stored snapshot decides whether the Overview
        // shows this client's profit, so a stale "broken" would keep suppressing it.
        const fresh = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(acct.act_id).first();
        const { health } = await costHealth(env, { ...fresh, goals: safeJson(fresh.goals_json, {}) });
        await env.DB.prepare(
          `INSERT INTO p_cost_health (act_id, verdict, reason, blended, p10, p90, negatives, days, checked_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,datetime('now'))
           ON CONFLICT(act_id) DO UPDATE SET verdict=excluded.verdict, reason=excluded.reason, blended=excluded.blended,
             p10=excluded.p10, p90=excluded.p90, negatives=excluded.negatives, days=excluded.days, checked_at=excluded.checked_at`,
        ).bind(acct.act_id, health.verdict, health.reason ?? null, health.blended ?? null,
          health.p10 ?? null, health.p90 ?? null, health.negatives ?? 0, health.days ?? 0).run();
        return json({ ok: true, margin_pct: pct, verdict: health.verdict });
      }

      /* Endpoints served by the account-health worker, which owns the Meta sync and
         holds the Triple Whale / Anthropic / Slack secrets. The Daily Brief lives in
         THIS tool's interface — all its numbers are store-level, which is this tool's
         job — but the engine behind it stays where the credentials already are.
         One hop over the service binding; no secret is duplicated. */
      if (PROXY_PATHS.has(path)) {
        const auth = request.headers.get('Authorization') || '';
        const target = `${AUTH_WORKER}${path}${url.search}`;
        const init = { method: request.method, headers: { Authorization: auth } };
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          init.body = await request.text();
          init.headers['Content-Type'] = 'application/json';
        }
        const res = env.AUTH ? await env.AUTH.fetch(new Request(target, init)) : await fetch(target, init);
        const body = await res.text();
        return new Response(body, { status: res.status, headers: { 'Content-Type': 'application/json', ...CORS } });
      }

      /* Monthly goals. Written here rather than proxied so the month/default merge
         lives next to the margin override that shares the same JSON blob. */
      if (path === '/api/goals' && request.method === 'PUT') {
        const b = await request.json().catch(() => ({}));
        const acct = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(b.act).first();
        if (!acct) return json({ error: 'unknown account' }, 404);
        const goals = safeJson(acct.goals_json, {});
        const ym = b.month || monthOf(localDate(acct.tz));
        const keep = goals[ym]?.cm_pct ?? goals.default?.cm_pct ?? null;   // never clobber the margin
        const m = {};
        for (const k of ['sales', 'spend', 'amer']) if (b[k] != null && b[k] !== '') m[k] = +b[k];
        if (keep != null) m.cm_pct = keep;
        goals[ym] = m;
        goals.default = { ...m };
        await env.DB.prepare(`UPDATE accounts SET goals_json = ?2 WHERE act_id = ?1`)
          .bind(acct.act_id, JSON.stringify(goals)).run();
        return json({ ok: true, goals: m });
      }

      /* Per-client delivery settings. These live on the SHARED accounts table, so
         editing them here edits them in Account Health too — one setting, two doors. */
      if (path === '/api/client-settings' && request.method === 'PUT') {
        const b = await request.json().catch(() => ({}));
        const cur = await env.DB.prepare(`SELECT * FROM accounts WHERE act_id = ?1`).bind(b.act).first();
        if (!cur) return json({ error: 'unknown account' }, 404);
        // Two channels per brand and nothing more: slack_channel is INTERNAL
        // (drafts, delivery alerts) and brief_channel is the CLIENT's. Every
        // deliverable - daily brief, weekly report, monthly report - uses that
        // pair, and `review_first` decides which one it lands in first.
        await env.DB.prepare(
          `UPDATE accounts SET slack_channel = ?2, brief_channel = ?3, brief_enabled = ?4,
             report_config_json = ?5, review_first = ?6 WHERE act_id = ?1`,
        ).bind(b.act,
          'slack_channel' in b ? (b.slack_channel || null) : cur.slack_channel,
          'brief_channel' in b ? (b.brief_channel || null) : cur.brief_channel,
          'brief_enabled' in b ? (b.brief_enabled ? 1 : 0) : cur.brief_enabled,
          'report_config' in b ? JSON.stringify(b.report_config || {}) : cur.report_config_json,
          'review_first' in b ? (b.review_first ? 1 : 0) : cur.review_first,
        ).run();
        return json({ ok: true });
      }

      if (path === '/api/cost-health-refresh' && request.method === 'POST') {
        return json({ ok: true, results: await refreshCostHealth(env) });
      }

      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
