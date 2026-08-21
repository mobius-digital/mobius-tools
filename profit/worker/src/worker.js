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

async function isAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const tok = auth.slice(7);
  if (env.ADMIN_TOKEN && tok === env.ADMIN_TOKEN) return true;
  const sess = await verifySession(env, tok);
  if (sess && (await emailAllowed(env, sess.email))) return true;
  // Dashboard password lives in the SHARED settings table, so one password
  // opens both tools with nothing to configure here.
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'passwordHash'`).first();
  if (row?.value && (await sha256hex(tok)) === row.value) return true;
  return delegateSession(env, tok);
}

/* ---------------- accounts ---------------- */
async function listAccounts(env, activeOnly = true) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM accounts ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY name`,
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
 *   revenue = Triple Whale netSales (Shopify, after discounts/refunds, ex-tax)
 *   spend   = Triple Whale blendedAds (every ad platform), Meta+Google fallback
 *   MER     = revenue / spend        aMER = new-customer revenue / spend
 * Platform ROAS is deliberately absent — that is Account Health's job.
 */
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
 *  `shipMode` is decided per window: 'include' when the client has real fulfilment
 *  cost data, 'exclude' when they bill shipping but record no cost for it (crediting
 *  that revenue with no cost against it would overstate profit). */
function dayEconomics(piv, meta, date, marginPct, shipMode = 'include') {
  const netSales = pick(piv, date, SALES_IDS);
  if (netSales == null) return null;
  const shipRev = shipMode === 'include' ? (piv.totalShippingPrice?.[date] ?? 0) : 0;
  const shipCost = shipMode === 'include' ? (piv.totalShippingCosts?.[date] ?? 0) : 0;
  const handling = shipMode === 'include' ? (piv.totalHandlingFees?.[date] ?? 0) : 0;
  const sales = netSales + shipRev;          // CTC's "Net Sales + Shipping"
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
    date, sales, net_sales: netSales, ship_rev: shipRev, spend,
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
  const ship = shippingMode(piv);
  const rows = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const row = dayEconomics(piv, meta, d, marginPct, ship.mode);
    if (row) rows.push(row);
  }
  return { rows, margin_pct: marginPct, shipping: ship };
}

/** Does this client actually record what fulfilment costs them? If they bill
 *  customers for shipping but book no cost against it, counting that revenue
 *  would overstate profit — so we leave shipping out of both sides and say so. */
function shippingMode(piv) {
  const total = m => Object.values(piv[m] || {}).reduce((a, b) => a + (b || 0), 0);
  const rev = total('totalShippingPrice'), cost = total('totalShippingCosts');
  if (rev <= 0 && cost <= 0) return { mode: 'include', rev, cost, note: 'no shipping billed or costed' };
  if (rev > 0 && cost <= 0) {
    return { mode: 'exclude', rev, cost, note: 'shipping is billed to customers but no fulfilment cost is recorded in Triple Whale — shipping is left out of both revenue and costs so profit is not overstated' };
  }
  if (Math.abs(rev - cost) < 0.01 && rev > 0) {
    return { mode: 'include', rev, cost, note: 'shipping cost exactly equals shipping revenue — Triple Whale is treating it as a pass-through, so it nets to zero' };
  }
  return { mode: 'include', rev, cost, note: rev >= cost ? `shipping makes ${Math.round(rev - cost)} over the window` : `shipping loses ${Math.round(cost - rev)} over the window` };
}

/** The same daily series with the flat-margin override deliberately ignored,
 *  so the Costs page can diagnose the real underlying cost data. */
async function seriesRaw(env, acct, from, to) {
  const piv = await pivot(env, acct.act_id, from, to);
  const { results: metaRows } = await env.DB.prepare(
    `SELECT date, spend FROM daily_insights WHERE act_id = ?1 AND date BETWEEN ?2 AND ?3`,
  ).bind(acct.act_id, from, to).all();
  const meta = Object.fromEntries(metaRows.map(r => [r.date, r]));
  const ship = shippingMode(piv);
  const rows = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const row = dayEconomics(piv, meta, d, null, ship.mode);
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
  const negatives = margins.filter(m => m < 0).length;
  const gp = sum(rows, r => r.gross_profit), sales = sum(rows, r => r.sales);
  const blended = sales > 0 && gp != null ? gp / sales : null;
  const spread = p90 - p10;
  const out = { verdict: 'good', days: n, blended, p10, p90, spread, negatives };
  if (negatives > 0 || (blended != null && blended <= 0.15) || spread > 0.6) {
    out.verdict = 'broken';
    out.reason = negatives > 0
      ? `${negatives} of ${n} days record costs above revenue — products are missing or mis-set COGS`
      : blended != null && blended <= 0.15
      ? `trailing margin of ${Math.round(blended * 100)}% is implausibly thin — COGS looks wrong`
      : `daily margin swings ${Math.round(p10 * 100)}% to ${Math.round(p90 * 100)}% — only some products have COGS set`;
  } else if (spread > 0.4) {
    out.verdict = 'noisy';
    out.reason = `daily margin ranges ${Math.round(p10 * 100)}% to ${Math.round(p90 * 100)}% — likely a few products missing COGS`;
  }
  return out;
}

/** Worst offending days, so the Costs page can name names. */
const worstDays = (rows, k = 8) =>
  rows.filter(r => r.margin != null).slice().sort((a, b) => a.margin - b.margin).slice(0, k)
    .map(r => ({ date: r.date, sales: r.sales, cogs: r.cogs, fees: r.fees, margin: r.margin }));

async function costHealth(env, acct, days = 60) {
  const today = localDate(acct.tz);
  const from = addDays(today, -days), to = addDays(today, -1);
  const { rows, margin_pct } = await seriesFor(env, acct, from, to);
  // The diagnosis must always describe the REAL Triple Whale cost data, never the
  // override — otherwise the page grades its own override and reports a perfect
  // flat line, hiding whether the underlying data has actually been fixed yet.
  const rawRows = margin_pct == null ? rows : await seriesRaw(env, acct, from, to);
  const raw = judgeCosts(rawRows);
  const health = margin_pct != null
    ? { verdict: 'override', reason: `using a flat ${Math.round(margin_pct * 100)}% margin override`, days: rows.length, blended: margin_pct, underlying: raw }
    : raw;
  return { account: pubAccount(acct), margin_pct, health, worst: worstDays(rawRows), rows: rawRows };
}

async function refreshCostHealth(env) {
  const accounts = await listAccounts(env);
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
      }
      return json(out);
    }
    if (path === '/') return Response.redirect(DASHBOARD_URL, 302);
    if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);

    try {
      const days = Math.min(+url.searchParams.get('days') || 30, 180);

      /* All clients, store-level. The blended view Account Health deliberately lacks. */
      if (path === '/api/overview') {
        const accounts = await listAccounts(env);
        const { results: healthRows } = await env.DB.prepare(`SELECT * FROM p_cost_health`).all();
        const byAct = Object.fromEntries(healthRows.map(r => [r.act_id, r]));
        const out = [];
        for (const a of accounts) {
          const today = localDate(a.tz);
          const { rows, margin_pct, shipping } = await seriesFor(env, a, addDays(today, -days), addDays(today, -1));
          const ym = monthOf(today);
          const g = goalsFor(a, ym);
          // First load (or a new client) has no snapshot yet — judge inline so the
          // page is never blank, and let refreshIfStale persist it in the background.
          const health = byAct[a.act_id] || (margin_pct != null
            ? { verdict: 'override', reason: `using a flat ${Math.round(margin_pct * 100)}% margin override`, blended: margin_pct }
            : judgeCosts(rows));
          const mtdRows = rows.filter(r => r.date.startsWith(ym));
          out.push({
            ...pubAccount(a),
            window: totals(rows),
            mtd: totals(mtdRows),
            goals: g.sales != null || g.spend != null ? g : null,
            plan: planFor(a, ym, mtdRows),
            margin_pct, cost_health: health, shipping,
          });
        }
        await refreshIfStale(env, ctx);
        return json({ days, accounts: out });
      }

      /* One client: the daily series and totals behind it. */
      if (path === '/api/client') {
        const act = url.searchParams.get('act');
        const acct = (await listAccounts(env, false)).find(a => a.act_id === act);
        if (!acct) return json({ error: 'unknown account' }, 404);
        const today = localDate(acct.tz);
        const { rows, margin_pct, shipping } = await seriesFor(env, acct, addDays(today, -days), addDays(today, -1));
        const ym = monthOf(today);
        return json({
          account: pubAccount(acct), days, margin_pct, rows, shipping,
          totals: totals(rows), mtd: totals(rows.filter(r => r.date.startsWith(ym))),
          goals: goalsFor(acct, ym), plan: planFor(acct, ym, rows),
        });
      }

      /* Costs page: is this client's cost data trustworthy, and if not, why? */
      if (path === '/api/costs') {
        const act = url.searchParams.get('act');
        const acct = (await listAccounts(env, false)).find(a => a.act_id === act);
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
        const acct = (await listAccounts(env, false)).find(a => a.act_id === b.act);
        if (!acct) return json({ error: 'unknown account' }, 404);
        const goals = safeJson(acct.goals_json, {});
        const ym = b.month || monthOf(localDate(acct.tz));
        const pct = b.margin_pct === '' || b.margin_pct == null ? null : +b.margin_pct;
        if (pct != null && (!isFinite(pct) || pct <= 0 || pct >= 1)) {
          return json({ error: 'margin must be between 0 and 100%' }, 400);
        }
        for (const key of [ym, 'default']) {
          goals[key] = goals[key] || {};
          if (pct == null) delete goals[key].cm_pct; else goals[key].cm_pct = pct;
        }
        await env.DB.prepare(`UPDATE accounts SET goals_json = ?2 WHERE act_id = ?1`)
          .bind(acct.act_id, JSON.stringify(goals)).run();
        return json({ ok: true, margin_pct: pct });
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
