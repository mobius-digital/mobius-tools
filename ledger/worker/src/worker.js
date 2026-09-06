/**
 * Mobius Ledger — money in / money out for Mobius Digital (Cloudflare Workers)
 *
 * Phase 1, manual mode: the ledger, vendor rules, the recurring engine,
 * receipts (KV), month close with frozen report cards, and the CPA pack.
 * No external connectors yet — Stripe/bank sync is Phase 3, by design.
 *
 * Bindings (wrangler.toml): DB (D1), RECEIPTS (KV)
 * Secrets: ADMIN_TOKEN (master key), ANTHROPIC_API_KEY (optional receipt reading)
 *
 * Auth: Mobius Google sessions are verified by DELEGATING to the
 * mobius-account-health worker's /api/me (it owns SESSION_SECRET; this worker
 * deliberately has no copy — one secret, one owner). ADMIN_TOKEN and the
 * dashboard-set password work as fallbacks, same shape as Pulse/Restock.
 */

const AUTH_WORKER = 'https://mobius-account-health.mobius-digital.workers.dev';
const RECEIPT_MAX = 4 * 1024 * 1024; // 4MB post-downscale ceiling per file

const BUCKETS_OUT = ['Software', 'Contractors', 'Payroll', 'Ads/Marketing', 'Other'];

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', ...CORS },
});

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* Session check goes over the AUTH service binding — a Worker cannot fetch
 * another Worker's *.workers.dev URL on the same account (the public-URL
 * version of this failed closed and locked everyone out on day one).
 * Verdicts cache per isolate: passes 10 min, failures 60s so a transient
 * error can't lock the door for long. */
const sessCache = new Map();
async function validSession(env, tok) {
  if (!/^mds\./.test(tok || '')) return false;
  const hit = sessCache.get(tok);
  if (hit && hit.until > Date.now()) return hit.ok;
  let ok = false;
  try {
    const req = new Request(AUTH_WORKER + '/api/me', { headers: { Authorization: 'Bearer ' + tok } });
    const r = env.AUTH ? await env.AUTH.fetch(req) : await fetch(req);
    const j = await r.json();
    ok = !!j.email;
  } catch (e) { /* auth worker unreachable — fail closed */ }
  sessCache.set(tok, { ok, until: Date.now() + (ok ? 10 * 60e3 : 60e3) });
  return ok;
}

async function isAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const tok = auth.slice(7);
  if (env.ADMIN_TOKEN && tok === env.ADMIN_TOKEN) return true;
  if (await validSession(env, tok)) return true;
  const stored = await getSetting(env, 'passwordHash');
  return !!stored && (await sha256hex(tok)) === stored;
}

async function getSetting(env, key) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?1').bind(key).first();
  return row ? row.value : null;
}
const putSetting = (env, key, value) =>
  env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)').bind(key, value).run();

const safeJson = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

const DEFAULT_MONEY = { taxPct: 30, distPct: 0, split: { personal: 50, tax: 30, ads: 10, savings: 5, other: 5 }, feePct: 2.93 };
async function getMoney(env) {
  return { ...DEFAULT_MONEY, ...safeJson(await getSetting(env, 'money'), {}) };
}

/* Trailing average of each client's last 3 confirmed months of revenue —
 * what a "retainer + % of ad spend" client's next invoice most plausibly is. */
async function recentRevenueAvg(env) {
  const { results } = await env.DB.prepare(
    `SELECT vendor, month, SUM(amount) AS amt FROM transactions
     WHERE type = 'in' AND expected = 0 GROUP BY vendor, month ORDER BY month DESC`).all();
  const by = {};
  for (const r of results) { const a = (by[r.vendor] ||= []); if (a.length < 3) a.push(r.amt); }
  return Object.fromEntries(Object.entries(by).map(([k, a]) =>
    [k, Math.round(a.reduce((s, v) => s + v, 0) / a.length * 100) / 100]));
}

const monthOf = date => String(date).slice(0, 7);
const validMonth = m => /^\d{4}-\d{2}$/.test(m || '');
const round2 = n => Math.round(n * 100) / 100;

async function monthStatus(env, month) {
  const row = await env.DB.prepare('SELECT status FROM months WHERE month = ?1').bind(month).first();
  return row?.status || 'open';
}

/* ------------------------------------------------------------------ */
/*  report math (the sheet's own formulas, verified against Jan–Jul)   */
/* ------------------------------------------------------------------ */

async function computeReport(env, month) {
  const money = await getMoney(env);
  const { results: txns } = await env.DB.prepare(
    'SELECT * FROM transactions WHERE month = ?1 AND expected = 0 ORDER BY date, id'
  ).bind(month).all();

  let revenue = 0, fees = 0, expenses = 0, transfers = 0;
  const byBucket = {}, byTax = {}, byClient = {};
  for (const t of txns) {
    // transfers are money MOVING, not money made or spent: the Amex payment
    // from Novo, Stripe payouts landing, the 50/30/10/5/5 moves — counting
    // them would double every dollar that already counted as a charge
    if (t.type === 'transfer') { transfers += t.amount; continue; }
    if (t.type === 'in') { revenue += t.amount; byClient[t.vendor] = (byClient[t.vendor] || 0) + t.amount; }
    else if (t.type === 'fee') fees += t.amount;
    else {
      expenses += t.amount;
      byBucket[t.bucket || 'Other'] = (byBucket[t.bucket || 'Other'] || 0) + t.amount;
      byTax[t.tax_cat || 'Uncategorized'] = (byTax[t.tax_cat || 'Uncategorized'] || 0) + t.amount;
    }
  }
  let feeEstimated = false;
  if (!fees && revenue > 0) { fees = round2(revenue * money.feePct / 100); feeEstimated = true; }

  const net = round2(revenue - expenses - fees);
  const taxes = round2(net * money.taxPct / 100);
  const dist = round2(net * money.distPct / 100);
  const profit = round2(net - taxes - dist);
  const split = {};
  for (const [k, pct] of Object.entries(money.split)) split[k] = round2(net * pct / 100);
  const opCost = round2((byBucket['Software'] || 0) + (byBucket['Contractors'] || 0) + (byBucket['Payroll'] || 0));

  return {
    month, generatedAt: new Date().toISOString(),
    revenue: round2(revenue), expenses: round2(expenses), fees: round2(fees), feeEstimated,
    net, taxes, distributions: dist, profit,
    margin: revenue > 0 ? round2(net / revenue * 100) : null,
    transfers: round2(transfers),
    opCost, split, splitPct: money.split, taxPct: money.taxPct, distPct: money.distPct,
    byBucket: mapRound(byBucket), byTax: mapRound(byTax), byClient: mapRound(byClient),
    txnCount: txns.length,
  };
}
const mapRound = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round2(v)]).sort((a, b) => b[1] - a[1]));

/* Applies the vendor rule to a row missing categories; unknown vendors land
 * in the Review inbox instead of being silently guessed. */
async function applyRule(env, row) {
  if (row.type === 'in') { row.bucket = 'Revenue'; row.tax_cat = 'Client revenue'; return row; }
  if (row.type === 'fee') { row.bucket = 'Merchant fee'; row.tax_cat = 'Bank & merchant fees'; return row; }
  if (row.type === 'transfer') { row.bucket = 'Transfer'; row.tax_cat = 'Transfer — not P&L'; return row; }
  if (row.bucket && row.tax_cat) return row;
  const rule = await env.DB.prepare('SELECT * FROM vendors WHERE name = ?1 COLLATE NOCASE').bind(row.vendor).first();
  if (rule) { row.bucket = row.bucket || rule.bucket; row.tax_cat = row.tax_cat || rule.tax_cat; }
  else row.status = 'review';
  return row;
}

/* Claude reads a receipt: vendor, total, date, short note — or null. */
async function claudeExtract(env, b64, mediaType) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const block = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 300,
      messages: [{ role: 'user', content: [block, { type: 'text', text:
        'This is a receipt or invoice. Reply with ONLY a JSON object: {"vendor": string, "amount": number (the total), "date": "YYYY-MM-DD" or null, "note": short string or null}. No other text.' }] }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  const m = (j?.content?.[0]?.text || '').match(/\{[\s\S]*\}/);
  return m ? safeJson(m[0], null) : null;
}

/* ------------------------------------------------------------------ */
/*  Slack #receipts intake (Phase 3)                                   */
/* ------------------------------------------------------------------ */

async function slack(env, method, params = {}, post = false) {
  const r = post
    ? await fetch(`https://slack.com/api/${method}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(params) })
    : await fetch(`https://slack.com/api/${method}?${new URLSearchParams(params)}`, {
        headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } });
  return r.json();
}

async function findReceiptsChannel(env) {
  let cursor = '';
  do {
    const r = await slack(env, 'conversations.list',
      { types: 'public_channel,private_channel', exclude_archived: 'true', limit: '200', ...(cursor ? { cursor } : {}) });
    if (!r.ok) return { error: r.error };
    const hit = (r.channels || []).find(c => c.name === 'receipts');
    if (hit) return { id: hit.id, is_member: !!hit.is_member };
    cursor = r.response_metadata?.next_cursor || '';
  } while (cursor);
  return { error: 'no #receipts channel found' };
}

const SEEN_CAP = 300;

/**
 * Poll #receipts: each new image/PDF is downloaded, read by Claude, then
 * matched to an unreceipted expense (this month or last, amount to the cent)
 * or filed as a new transaction — and the thread gets a reply saying which.
 * Dedupe: Slack file ids in settings.slackReceipts.seen; cursor on lastTs.
 */
async function processSlackReceipts(env) {
  if (!env.SLACK_BOT_TOKEN) return { skipped: 'no SLACK_BOT_TOKEN' };
  const cfg = safeJson(await getSetting(env, 'slackReceipts'), {}) || {};
  cfg.seen = cfg.seen || [];
  if (!cfg.channelId) {
    const ch = await findReceiptsChannel(env);
    if (ch.error) { cfg.lastError = ch.error; await putSetting(env, 'slackReceipts', JSON.stringify(cfg)); return { error: ch.error }; }
    cfg.channelId = ch.id;
  }
  const hist = await slack(env, 'conversations.history',
    { channel: cfg.channelId, limit: '30', ...(cfg.lastTs ? { oldest: cfg.lastTs } : {}) });
  if (!hist.ok) { cfg.lastError = hist.error; await putSetting(env, 'slackReceipts', JSON.stringify(cfg)); return { error: hist.error }; }
  cfg.lastError = null;

  const msgs = (hist.messages || []).slice().reverse();   // oldest first
  let handled = 0;
  for (const msg of msgs) {
    if (+msg.ts > +(cfg.lastTs || 0)) cfg.lastTs = msg.ts;
    for (const f of msg.files || []) {
      const isPdf = f.mimetype === 'application/pdf';
      if (!isPdf && !/^image\//.test(f.mimetype || '')) continue;
      if (cfg.seen.includes(f.id)) continue;
      cfg.seen.push(f.id); if (cfg.seen.length > SEEN_CAP) cfg.seen = cfg.seen.slice(-SEEN_CAP);
      const reply = text => slack(env, 'chat.postMessage',
        { channel: cfg.channelId, thread_ts: msg.ts, text, unfurl_links: false }, true);
      try {
        if ((f.size || 0) > 8 * 1024 * 1024) { await reply('⚠️ That file is over 8MB — attach it from the app instead.'); continue; }
        const dl = await fetch(f.url_private_download || f.url_private,
          { headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } });
        const buf = await dl.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let b64 = '';
        for (let i = 0; i < bytes.length; i += 0x8000)
          b64 += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        b64 = btoa(b64);
        // Claude's image ceiling is ~5MB of data; oversize files still get stored
        const ext = bytes.length < 4.5 * 1024 * 1024 ? await claudeExtract(env, b64, f.mimetype) : null;
        const today = centralDate(Date.now() / 1000);

        // 1) best case: it pays off an expense already in the ledger
        let target = null;
        if (ext?.amount) {
          const { results } = await env.DB.prepare(
            `SELECT * FROM transactions WHERE type = 'out' AND expected = 0 AND receipt_key IS NULL
             AND month >= ?1 AND ABS(amount - ?2) < 0.01 ORDER BY date DESC LIMIT 5`)
            .bind(addMonthsYmd(today, -1).slice(0, 7), ext.amount).all();
          target = results.find(t => ext.vendor && t.vendor.toLowerCase().includes(String(ext.vendor).toLowerCase().split(' ')[0])) || results[0] || null;
        }
        // 2) otherwise a readable receipt files itself as a new expense
        if (!target && ext?.vendor && ext?.amount) {
          const date = /^\d{4}-\d{2}-\d{2}$/.test(ext.date || '') && ext.date <= today && monthOf(ext.date) >= addMonthsYmd(today, -1).slice(0, 7)
            ? ext.date : today;
          const month = monthOf(date);
          if ((await monthStatus(env, month)) !== 'closed') {
            const row = await applyRule(env, {
              date, month, type: 'out', vendor: String(ext.vendor).slice(0, 120),
              amount: round2(Number(ext.amount)), bucket: null, tax_cat: null,
              note: ext.note ? String(ext.note).slice(0, 300) : null, status: 'ok',
            });
            const res = await env.DB.prepare(`INSERT INTO transactions
              (date, month, type, vendor, amount, bucket, tax_cat, note, status, source)
              VALUES (?1,?2,'out',?3,?4,?5,?6,?7,?8,'manual')`)
              .bind(row.date, row.month, row.vendor, row.amount, row.bucket, row.tax_cat, row.note, row.status).run();
            target = { id: res.meta.last_row_id, vendor: row.vendor, amount: row.amount, date: row.date,
                       __new: true, __review: row.status === 'review' };
          }
        }
        if (target) {
          const key = `rcpt:${target.id}:${Date.now()}`;
          await env.RECEIPTS.put(key, buf);
          await env.DB.prepare('UPDATE transactions SET receipt_key=?2, receipt_name=?3, receipt_type=?4 WHERE id=?1')
            .bind(target.id, key, (f.name || 'receipt').slice(0, 120), f.mimetype).run();
          await reply(target.__new
            ? `🧾 Filed: *${target.vendor}* $${target.amount.toFixed(2)} — receipt attached.${target.__review ? ' New vendor, so it\'s waiting in Review for a category (one tap in the app).' : ' Categorized automatically.'}`
            : `✅ Matched to *${target.vendor}* $${target.amount.toFixed(2)} (${target.date}) — receipt attached.`);
        } else {
          await reply(`⚠️ Couldn't read a vendor + total off this one — add it from the app's Receipts tab instead.`);
        }
        handled++;
      } catch (e) {
        await reply(`⚠️ Something went wrong handling this file: ${String(e.message || e).slice(0, 140)}`).catch(() => {});
      }
    }
  }
  await putSetting(env, 'slackReceipts', JSON.stringify(cfg));
  return { handled, channel: cfg.channelId };
}

const addMonthsYmd = (ymd, n) => {
  const d = new Date(ymd + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

/* ------------------------------------------------------------------ */
/*  Stripe sync (Phase 3)                                              */
/* ------------------------------------------------------------------ */

async function stripeGet(env, path, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) for (const x of v) qs.append(k, x); else qs.append(k, v);
  }
  const r = await fetch('https://api.stripe.com/v1/' + path + '?' + qs, {
    headers: { Authorization: 'Bearer ' + env.STRIPE_KEY },
  });
  const j = await r.json();
  if (j.error) throw new Error('Stripe: ' + j.error.message);
  return j;
}

/* Money lands on the day it landed in Cole's timezone, matching the sheet. */
const centralDate = ts => new Intl.DateTimeFormat('en-CA',
  { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts * 1000));

/* Which client is this charge from? Order: the learned customer→client map,
 * then a conservative name/email match against the client list (which also
 * LEARNS the mapping). No match → Review inbox, never a silent guess. */
function resolveClient(clients, map, cusId, texts) {
  if (cusId && map[cusId]) return { client: map[cusId], learned: false };
  const hay = texts.filter(Boolean).map(s => String(s).toLowerCase());
  for (const c of clients) {
    const name = c.name.toLowerCase();
    const first = name.split(' ')[0];
    const hit = hay.some(h => h.includes(name) || (first.length >= 4 && h.includes(first)));
    if (hit) return { client: c.name, learned: !!cusId };
  }
  return { client: null, learned: false };
}

/**
 * Pull charges + refunds for [fromYmd..toYmd] (Central dates) into the ledger.
 * Idempotent: rows key on stripe_id; the monthly Stripe-fee row is recomputed
 * from SUM(fee) after every run. Closed months are never written into.
 */
async function syncStripe(env, fromYmd, toYmd) {
  if (!env.STRIPE_KEY) throw new Error('STRIPE_KEY is not set on the worker');
  const [clientsQ, mapRaw, monthsQ] = await Promise.all([
    env.DB.prepare('SELECT name FROM clients').all(),
    getSetting(env, 'stripeMap'),
    env.DB.prepare('SELECT month, status FROM months').all(),
  ]);
  const clients = clientsQ.results;
  // JSON.parse(null) is null, not a throw — the fallback alone doesn't save us
  const map = safeJson(mapRaw, {}) || {};
  const closed = new Set(monthsQ.results.filter(m => m.status === 'closed').map(m => m.month));
  // coarse window (±1 day) — precise bucketing happens on the Central date
  const gte = Math.floor(Date.parse(fromYmd + 'T00:00:00Z') / 1000) - 86400;
  const lte = Math.floor(Date.parse(toYmd + 'T23:59:59Z') / 1000) + 86400;

  let mapDirty = false, added = 0, review = 0, skippedClosed = 0;
  const touched = new Set();

  const walk = async (path, expand, handler) => {
    let after = null;
    do {
      const page = await stripeGet(env, path, {
        limit: 100, 'created[gte]': gte, 'created[lte]': lte,
        'expand[]': expand, ...(after ? { starting_after: after } : {}),
      });
      for (const item of page.data) await handler(item);
      after = page.has_more ? page.data[page.data.length - 1].id : null;
    } while (after);
  };

  await walk('charges', ['data.balance_transaction', 'data.customer'], async c => {
    if (!c.paid || c.status !== 'succeeded') return;
    const date = centralDate(c.created), month = monthOf(date);
    if (date < fromYmd || date > toYmd) return;
    if (closed.has(month)) { skippedClosed++; return; }
    const cus = typeof c.customer === 'object' && c.customer ? c.customer : null;
    const cusId = cus?.id || (typeof c.customer === 'string' ? c.customer : null);
    const { client, learned } = resolveClient(clients, map, cusId,
      [cus?.name, cus?.email, cus?.description, c.description, c.calculated_statement_descriptor, c.billing_details?.name, c.billing_details?.email]);
    if (learned && cusId) { map[cusId] = client; mapDirty = true; }
    const vendor = client || (cus?.name || cus?.email || c.billing_details?.name || c.description || 'Stripe customer');
    const fee = c.balance_transaction && typeof c.balance_transaction === 'object' ? c.balance_transaction.fee / 100 : null;
    const res = await env.DB.prepare(`INSERT OR IGNORE INTO transactions
      (date, month, type, vendor, amount, bucket, tax_cat, note, status, source, stripe_id, stripe_cus, fee)
      VALUES (?1, ?2, 'in', ?3, ?4, 'Revenue', 'Client revenue', ?5, ?6, 'stripe', ?7, ?8, ?9)`)
      .bind(date, month, vendor, round2(c.amount / 100),
            client ? null : 'New Stripe customer — pick the client and Ledger remembers it',
            client ? 'ok' : 'review', c.id, cusId, fee).run();
    if (res.meta.changes) { added++; touched.add(month); if (!client) review++; }
  });

  await walk('refunds', ['data.charge'], async r => {
    if (r.status && r.status !== 'succeeded') return;
    const date = centralDate(r.created), month = monthOf(date);
    if (date < fromYmd || date > toYmd) return;
    if (closed.has(month)) { skippedClosed++; return; }
    const ch = typeof r.charge === 'object' && r.charge ? r.charge : null;
    const cusId = ch ? (typeof ch.customer === 'string' ? ch.customer : ch.customer?.id) : null;
    const client = cusId && map[cusId] ? map[cusId] : null;
    const res = await env.DB.prepare(`INSERT OR IGNORE INTO transactions
      (date, month, type, vendor, amount, bucket, tax_cat, note, status, source, stripe_id, stripe_cus)
      VALUES (?1, ?2, 'in', ?3, ?4, 'Revenue', 'Client revenue', 'Refund', ?5, 'stripe', ?6, ?7)`)
      .bind(date, month, client || ch?.description || 'Stripe refund', -round2(r.amount / 100),
            client ? 'ok' : 'review', r.id, cusId).run();
    if (res.meta.changes) { added++; touched.add(month); if (!client) review++; }
  });

  if (mapDirty) await putSetting(env, 'stripeMap', JSON.stringify(map));

  // fee rows + expected-row cleanup run for every stripe month in the window,
  // not just fresh inserts — so a rerun after a mid-sync failure still finishes
  const { results: mrows } = await env.DB.prepare(
    `SELECT DISTINCT month FROM transactions WHERE source = 'stripe' AND month >= ?1 AND month <= ?2`)
    .bind(monthOf(fromYmd), monthOf(toYmd)).all();
  for (const r of mrows) if (!closed.has(r.month)) touched.add(r.month);

  for (const month of touched) {
    // one aggregated fee row per month, recomputed from the stored per-charge fees
    const f = await env.DB.prepare(`SELECT SUM(fee) AS fees FROM transactions WHERE month = ?1 AND source = 'stripe'`).bind(month).first();
    const fees = round2(f?.fees || 0);
    if (fees > 0) {
      await env.DB.prepare(`INSERT INTO transactions (date, month, type, vendor, amount, bucket, tax_cat, note, source, stripe_id)
        VALUES (?1, ?2, 'fee', 'Stripe', ?3, 'Merchant fee', 'Bank & merchant fees', 'Exact fees from Stripe, per charge', 'stripe', ?4)
        ON CONFLICT(stripe_id) WHERE stripe_id IS NOT NULL DO UPDATE SET amount = ?3`)
        .bind(month + '-01', month, fees, 'stripefees:' + month).run();
    }
    // a real Stripe payment satisfies that client's pre-created expected row
    await env.DB.prepare(`DELETE FROM transactions WHERE month = ?1 AND expected = 1 AND type = 'in'
      AND vendor IN (SELECT vendor FROM transactions WHERE month = ?1 AND source = 'stripe' AND type = 'in')`).bind(month).run();
  }
  return { added, review, skippedClosed, months: [...touched].sort() };
}

/* ------------------------------------------------------------------ */
/*  Plaid bank feeds (Novo + Amex)                                     */
/* ------------------------------------------------------------------ */

async function plaid(env, path, body = {}) {
  const r = await fetch(`https://${env.PLAID_ENV || 'sandbox'}.plaid.com${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.PLAID_CLIENT_ID, secret: env.PLAID_SECRET, ...body }),
  });
  const j = await r.json();
  if (j.error_code) throw new Error(`Plaid: ${j.error_code} — ${j.error_message || ''}`);
  return j;
}

const plaidReady = env => !!(env.PLAID_CLIENT_ID && env.PLAID_SECRET);
const getPlaidItems = async env => safeJson(await getSetting(env, 'plaidItems'), []) || [];

/* Money moving between Cole's own accounts — the double-count guard.
 * The Amex payment out of Novo, Stripe payouts landing, savings/tax moves. */
function looksLikeTransfer(name, pfc) {
  const n = (name || '').toLowerCase();
  if (/(amex|american express)/.test(n) && /(pay|epay|autopay|pmt)/.test(n)) return true;
  if (/stripe/.test(n)) return true;
  if (/^(transfer|xfer|online transfer|withdrawal to|deposit from)/.test(n)) return true;
  const p = pfc?.primary || '';
  return p === 'TRANSFER_IN' || p === 'TRANSFER_OUT' || p === 'LOAN_PAYMENTS';
}

/**
 * One Plaid transaction → the ledger, reconcile-first:
 *   1. an EXPECTED row for the same vendor/amount confirms itself (the engine's
 *      guess meets the real bank line);
 *   2. an existing manual/receipt row with the same amount adopts the plaid_id
 *      instead of duplicating;
 *   3. otherwise it inserts through the vendor rules (unknown → Review).
 */
async function processPlaidTxn(env, item, t) {
  if (t.pending) return 'pending';
  const date = t.date, month = monthOf(date);
  const start = await getSetting(env, 'plaidStart');
  if (start && date < start) return 'before-start';
  if ((await monthStatus(env, month)) === 'closed') return 'closed';

  const acctType = item.accounts?.[t.account_id]?.type || 'depository';
  const rawName = t.merchant_name || t.name || 'Unknown';
  const vendor = String(rawName).replace(/\s+/g, ' ').trim().slice(0, 120);
  const amt = round2(t.amount); // Plaid: positive = money OUT, negative = money IN

  let type, amount, status = 'ok', note = null;
  if (looksLikeTransfer(rawName, t.personal_finance_category)) {
    type = 'transfer'; amount = Math.abs(amt);
  } else if (amt > 0) {
    type = 'out'; amount = amt;
  } else if (acctType === 'credit') {
    type = 'out'; amount = amt; note = 'Card refund / return';   // negative out shrinks the category
  } else {
    type = 'in'; amount = Math.abs(amt); status = 'review';
    note = 'Deposit that isn\'t a Stripe payout — what is it? (Revenue outside Stripe, or mark it a transfer.)';
  }

  const first = vendor.toLowerCase().split(' ')[0];
  if (type === 'out' && amount > 0) {
    // 1) confirm the recurring engine's expected row
    const { results: exp } = await env.DB.prepare(
      `SELECT * FROM transactions WHERE month = ?1 AND expected = 1 AND type = 'out' AND plaid_id IS NULL`).bind(month).all();
    const eHit = exp.find(x => x.vendor.toLowerCase().split(' ')[0] === first
        || x.vendor.toLowerCase().includes(first) || first.includes(x.vendor.toLowerCase().split(' ')[0]))
      || exp.find(x => Math.abs(x.amount - amount) < 0.01);
    if (eHit) {
      await env.DB.prepare(`UPDATE transactions SET amount=?2, date=?3, expected=0, status='ok', plaid_id=?4 WHERE id=?1`)
        .bind(eHit.id, amount, date, t.transaction_id).run();
      return 'confirmed-expected';
    }
    // 2) adopt an existing manual row (same month, amount to the cent)
    const { results: cand } = await env.DB.prepare(
      `SELECT * FROM transactions WHERE month = ?1 AND type = 'out' AND expected = 0 AND plaid_id IS NULL
       AND ABS(amount - ?2) < 0.01`).bind(month, amount).all();
    const mHit = cand.find(x => x.vendor.toLowerCase().split(' ')[0] === first) || (cand.length === 1 ? cand[0] : null);
    if (mHit) {
      await env.DB.prepare(`UPDATE transactions SET plaid_id=?2 WHERE id=?1`).bind(mHit.id, t.transaction_id).run();
      return 'matched-existing';
    }
  }

  // 3) new row through the rules
  const row = await applyRule(env, { date, month, type, vendor, amount, bucket: null, tax_cat: null, note, status });
  const res = await env.DB.prepare(`INSERT OR IGNORE INTO transactions
    (date, month, type, vendor, amount, bucket, tax_cat, note, status, source, plaid_id)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'plaid',?10)`)
    .bind(row.date, row.month, row.type, row.vendor, row.amount, row.bucket, row.tax_cat,
          row.note, row.status, t.transaction_id).run();
  return res.meta.changes ? (row.status === 'review' ? 'added-review' : 'added') : 'duplicate';
}

async function syncPlaid(env) {
  if (!plaidReady(env)) return { skipped: 'no Plaid keys' };
  const items = await getPlaidItems(env);
  if (!items.length) return { skipped: 'no connected accounts' };
  const totals = {};
  for (const item of items) {
    let hasMore = true;
    while (hasMore) {
      const page = await plaid(env, '/transactions/sync',
        { access_token: item.access_token, cursor: item.cursor || undefined, count: 250 });
      for (const t of page.added) {
        const out = await processPlaidTxn(env, item, t);
        totals[out] = (totals[out] || 0) + 1;
      }
      for (const t of page.modified) {
        const cur = await env.DB.prepare('SELECT id, month, type FROM transactions WHERE plaid_id = ?1').bind(t.transaction_id).first();
        if (cur && (await monthStatus(env, cur.month)) !== 'closed' && !t.pending) {
          // keep the row's own sign convention: out-rows carry Plaid's sign
          // (negative = card refund), everything else stores the magnitude
          const amount = cur.type === 'out' ? round2(t.amount) : round2(Math.abs(t.amount));
          await env.DB.prepare('UPDATE transactions SET amount = ?2, date = ?3, month = ?4 WHERE id = ?1')
            .bind(cur.id, amount, t.date, monthOf(t.date)).run();
          totals.modified = (totals.modified || 0) + 1;
        }
      }
      for (const r of page.removed) {
        const cur = await env.DB.prepare('SELECT id, month FROM transactions WHERE plaid_id = ?1').bind(r.transaction_id).first();
        if (cur && (await monthStatus(env, cur.month)) !== 'closed') {
          await env.DB.prepare('DELETE FROM transactions WHERE id = ?1').bind(cur.id).run();
          totals.removed = (totals.removed || 0) + 1;
        }
      }
      item.cursor = page.next_cursor;
      hasMore = page.has_more;
      await putSetting(env, 'plaidItems', JSON.stringify(items)); // persist cursor per page
    }
  }
  return { ok: true, ...totals };
}

/* ------------------------------------------------------------------ */
/*  worker                                                             */
/* ------------------------------------------------------------------ */

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === '17 8 * * *') {
      // nightly: re-pull the last 10 days — Stripe data settles late sometimes,
      // and stripe_id dedupe makes the overlap free
      const to = centralDate(Date.now() / 1000);
      const from = centralDate(Date.now() / 1000 - 10 * 86400);
      if (env.STRIPE_KEY)
        ctx.waitUntil(syncStripe(env, from, to).catch(e => console.log('stripe sync failed: ' + e.message)));
      ctx.waitUntil(syncPlaid(env).catch(e => console.log('plaid sync failed: ' + e.message)));
    } else {
      // every 10 minutes: anything new dropped in Slack #receipts
      ctx.waitUntil(processSlackReceipts(env).catch(e => console.log('slack receipts failed: ' + e.message)));
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (path === '/health') return json({ ok: true });
    if (!path.startsWith('/api/')) return json({ error: 'not found' }, 404);
    if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);

    try {
      /* ---- boot: everything the dashboard needs in one call ---- */
      if (path === '/api/boot') {
        const [money, taxCatsRaw, clients, vendors, months] = await Promise.all([
          getMoney(env),
          getSetting(env, 'taxCats'),
          env.DB.prepare('SELECT * FROM clients ORDER BY retainer DESC').all(),
          env.DB.prepare('SELECT * FROM vendors ORDER BY bucket, name').all(),
          env.DB.prepare('SELECT month, status, closed_at FROM months ORDER BY month').all(),
        ]);
        const flags = await env.DB.prepare(`
          SELECT month,
            SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) AS review,
            SUM(CASE WHEN expected = 1 THEN 1 ELSE 0 END) AS expected,
            SUM(CASE WHEN type = 'out' AND expected = 0 AND receipt_key IS NULL THEN 1 ELSE 0 END) AS noReceipt
          FROM transactions GROUP BY month`).all();
        const avg = await recentRevenueAvg(env);
        return json({
          money, taxCats: safeJson(taxCatsRaw, []),
          clients: clients.results.map(c => ({ ...c, recent_avg: avg[c.name] ?? null })),
          vendors: vendors.results, months: months.results,
          flags: Object.fromEntries(flags.results.map(f => [f.month, f])),
          extractAvailable: !!env.ANTHROPIC_API_KEY,
          stripeConfigured: !!env.STRIPE_KEY,
          slackConfigured: !!env.SLACK_BOT_TOKEN,
          plaidConfigured: plaidReady(env),
          plaidEnv: env.PLAID_ENV || 'sandbox',
          plaidItems: (await getPlaidItems(env)).map(i => ({
            item_id: i.item_id, name: i.name,
            accounts: Object.values(i.accounts || {}).map(a => `${a.name} (${a.type})`),
          })),
          buckets: BUCKETS_OUT,
        });
      }

      /* ---- transactions ---- */
      if (path === '/api/transactions' && request.method === 'GET') {
        const month = url.searchParams.get('month');
        const year = url.searchParams.get('year');
        let q, bind;
        if (validMonth(month)) { q = 'month = ?1'; bind = [month]; }
        else if (/^\d{4}$/.test(year || '')) { q = "month LIKE ?1"; bind = [year + '-%']; }
        else if (url.searchParams.get('review') === '1') { q = "status = 'review'"; bind = []; }
        else return json({ error: 'pass month=YYYY-MM, year=YYYY or review=1' }, 400);
        const { results } = await env.DB.prepare(
          `SELECT * FROM transactions WHERE ${q} ORDER BY date DESC, id DESC`).bind(...bind).all();
        return json({ transactions: results });
      }

      if (path === '/api/transactions' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const rows = Array.isArray(body.rows) ? body.rows : [body];
        if (!rows.length || rows.length > 500) return json({ error: '1–500 rows' }, 400);
        const inserted = [];
        for (const r of rows) {
          const date = /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : null;
          const amount = Number(r.amount);
          const type = ['in', 'out', 'fee', 'transfer'].includes(r.type) ? r.type : null;
          const vendor = String(r.vendor || '').trim().slice(0, 120);
          if (!date || !vendor || !type || !Number.isFinite(amount) || amount === 0) continue;
          const month = monthOf(date);
          if ((await monthStatus(env, month)) === 'closed') continue; // closed months are frozen
          const row = await applyRule(env, {
            date, month, type, vendor, amount: round2(amount),
            bucket: r.bucket || null, tax_cat: r.tax_cat || null,
            note: r.note ? String(r.note).slice(0, 300) : null,
            one_time: r.one_time ? 1 : 0, expected: 0,
            status: r.status === 'review' ? 'review' : 'ok',
            source: ['manual', 'import'].includes(r.source) ? r.source : 'manual',
          });
          // learning: categorizing a new vendor at entry creates the rule
          if (r.saveRule && row.bucket && row.tax_cat && type === 'out') {
            await env.DB.prepare(`INSERT OR REPLACE INTO vendors (name, bucket, tax_cat, recurring, expected_amount, active)
              VALUES (?1, ?2, ?3, COALESCE((SELECT recurring FROM vendors WHERE name = ?1), ?4), ?5, 1)`)
              .bind(row.vendor, row.bucket, row.tax_cat, r.recurring ? 1 : 0, row.amount).run();
          }
          const res = await env.DB.prepare(`INSERT INTO transactions
            (date, month, type, vendor, amount, bucket, tax_cat, note, one_time, expected, status, source)
            VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`)
            .bind(row.date, row.month, row.type, row.vendor, row.amount, row.bucket, row.tax_cat,
                  row.note, row.one_time, row.expected, row.status, row.source).run();
          inserted.push({ id: res.meta.last_row_id, ...row });
        }
        return json({ ok: true, inserted });
      }

      if (path === '/api/transaction' && request.method === 'PUT') {
        const b = await request.json().catch(() => ({}));
        const id = Number(b.id);
        const cur = await env.DB.prepare('SELECT * FROM transactions WHERE id = ?1').bind(id).first();
        if (!cur) return json({ error: 'unknown transaction' }, 404);
        const closed = (await monthStatus(env, cur.month)) === 'closed';
        // On a closed month only receipt attach + categorization survive —
        // amounts/dates are frozen with the report the month produced.
        const next = { ...cur };
        for (const k of ['bucket', 'tax_cat', 'note', 'status', 'vendor']) {
          if (b[k] !== undefined) next[k] = b[k] === null ? null : String(b[k]).slice(0, 300);
        }
        if (b.one_time !== undefined) next.one_time = b.one_time ? 1 : 0;
        if (b.confirm) { next.expected = 0; next.status = 'ok'; }
        if (!closed) {
          if (b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) { next.date = b.date; next.month = monthOf(b.date); }
          if (b.amount !== undefined && Number.isFinite(Number(b.amount))) next.amount = round2(Number(b.amount));
        } else if (b.date !== undefined || b.amount !== undefined) {
          return json({ error: `${cur.month} is closed — reopen it to change amounts or dates.` }, 400);
        }
        // learning: naming a Stripe customer's client once teaches the sync forever
        if (b.mapStripe && cur.stripe_cus && next.vendor && next.vendor !== cur.vendor) {
          const map = safeJson(await getSetting(env, 'stripeMap'), {}) || {};
          map[cur.stripe_cus] = next.vendor;
          await putSetting(env, 'stripeMap', JSON.stringify(map));
          next.status = 'ok'; next.note = null;
        }
        if (next.status === 'ok' && cur.status === 'review' && next.bucket && next.tax_cat && b.saveRule && cur.type === 'out') {
          await env.DB.prepare(`INSERT OR REPLACE INTO vendors (name, bucket, tax_cat, recurring, expected_amount, active)
            VALUES (?1, ?2, ?3, ?4, ?5, 1)`)
            .bind(next.vendor, next.bucket, next.tax_cat, b.recurring ? 1 : 0, next.amount).run();
        }
        await env.DB.prepare(`UPDATE transactions SET date=?2, month=?3, vendor=?4, amount=?5, bucket=?6,
          tax_cat=?7, note=?8, one_time=?9, expected=?10, status=?11 WHERE id=?1`)
          .bind(id, next.date, next.month, next.vendor, next.amount, next.bucket,
                next.tax_cat, next.note, next.one_time, next.expected, next.status).run();
        return json({ ok: true, transaction: next });
      }

      if (path === '/api/transaction' && request.method === 'DELETE') {
        const id = Number(url.searchParams.get('id'));
        const cur = await env.DB.prepare('SELECT * FROM transactions WHERE id = ?1').bind(id).first();
        if (!cur) return json({ error: 'unknown transaction' }, 404);
        if ((await monthStatus(env, cur.month)) === 'closed')
          return json({ error: `${cur.month} is closed — reopen it first.` }, 400);
        if (cur.receipt_key) await env.RECEIPTS.delete(cur.receipt_key);
        await env.DB.prepare('DELETE FROM transactions WHERE id = ?1').bind(id).run();
        return json({ ok: true });
      }

      /* ---- Stripe ---- */
      if (path === '/api/stripe-check') {
        if (!env.STRIPE_KEY) return json({ configured: false });
        const bal = await stripeGet(env, 'balance_transactions', { limit: 3 });
        return json({ configured: true, ok: true,
          sample: bal.data.map(b => ({ type: b.type, amount: b.amount / 100, fee: b.fee / 100, when: centralDate(b.created) })) });
      }

      if (path === '/api/stripe-sync' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        let from = b.from, to = b.to;
        if (validMonth(b.month)) { from = b.month + '-01'; to = b.month + '-31'; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || ''))
          return json({ error: 'pass month=YYYY-MM or from/to=YYYY-MM-DD' }, 400);
        return json({ ok: true, ...(await syncStripe(env, from, to)) });
      }

      /* ---- Plaid ---- */
      if (path === '/api/plaid-link-token' && request.method === 'POST') {
        if (!plaidReady(env)) return json({ error: 'Plaid keys are not set on the worker yet' }, 400);
        const r = await plaid(env, '/link/token/create', {
          user: { client_user_id: 'cole' }, client_name: 'Mobius Ledger',
          products: ['transactions'], country_codes: ['US'], language: 'en',
        });
        return json({ link_token: r.link_token });
      }

      if (path === '/api/plaid-exchange' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        if (!b.public_token) return json({ error: 'public_token required' }, 400);
        const ex = await plaid(env, '/item/public_token/exchange', { public_token: b.public_token });
        const acc = await plaid(env, '/accounts/get', { access_token: ex.access_token });
        const items = await getPlaidItems(env);
        items.push({
          item_id: ex.item_id, access_token: ex.access_token, cursor: null,
          name: acc.item?.institution_name || b.institution || 'Bank',
          accounts: Object.fromEntries(acc.accounts.map(a => [a.account_id, { name: a.name, type: a.type }])),
        });
        await putSetting(env, 'plaidItems', JSON.stringify(items));
        if (!(await getSetting(env, 'plaidStart'))) {
          // never import history older than the earliest OPEN month — the sheet
          // backfill and closed report cards already own everything before it
          const open = await env.DB.prepare(`SELECT MIN(month) AS m FROM months WHERE status = 'open'`).first();
          await putSetting(env, 'plaidStart', (open?.m || new Date().toISOString().slice(0, 7)) + '-01');
        }
        return json({ ok: true, name: acc.item?.institution_name, accounts: acc.accounts.length });
      }

      if (path === '/api/plaid-sync' && request.method === 'POST') {
        return json(await syncPlaid(env));
      }

      if (path === '/api/plaid-item' && request.method === 'DELETE') {
        const itemId = url.searchParams.get('item_id');
        const items = await getPlaidItems(env);
        const it = items.find(x => x.item_id === itemId);
        if (it) await plaid(env, '/item/remove', { access_token: it.access_token }).catch(() => {});
        await putSetting(env, 'plaidItems', JSON.stringify(items.filter(x => x.item_id !== itemId)));
        return json({ ok: true });
      }

      /* ---- recurring engine: pre-create this month's expected rows ---- */
      if (path === '/api/recurring' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const month = validMonth(b.month) ? b.month : null;
        if (!month) return json({ error: 'month=YYYY-MM' }, 400);
        if ((await monthStatus(env, month)) === 'closed') return json({ error: 'month is closed' }, 400);
        await env.DB.prepare('INSERT OR IGNORE INTO months (month, status) VALUES (?1, \'open\')').bind(month).run();
        const [vendors, clients, existing] = await Promise.all([
          env.DB.prepare('SELECT * FROM vendors WHERE recurring = 1 AND active = 1').all(),
          env.DB.prepare(`SELECT * FROM clients WHERE active = 1 AND (retainer > 0 OR billing = 'percent')`).all(),
          env.DB.prepare('SELECT vendor FROM transactions WHERE month = ?1').bind(month).all(),
        ]);
        const have = new Set(existing.results.map(r => r.vendor.toLowerCase()));
        const mm = +month.slice(5, 7);
        let created = 0;
        for (const v of vendors.results) {
          if (have.has(v.name.toLowerCase())) continue;
          // yearly renewals (domains, Amex, annual plans) only land in their month
          if (v.cadence === 'yearly' && v.renew_month !== mm) continue;
          const note = v.cadence === 'yearly' ? 'Yearly renewal' : null;
          await env.DB.prepare(`INSERT INTO transactions (date, month, type, vendor, amount, bucket, tax_cat, note, expected, source)
            VALUES (?1, ?2, 'out', ?3, ?4, ?5, ?6, ?7, 1, 'recurring')`)
            .bind(month + '-01', month, v.name, v.expected_amount || 0, v.bucket, v.tax_cat, note).run();
          created++;
        }
        const avg = await recentRevenueAvg(env);
        for (const c of clients.results) {
          if (have.has(c.name.toLowerCase())) continue;
          // retainer + % of ad spend clients vary month to month: prefill with
          // their recent average and say so — the actual is typed at confirm.
          const variable = c.billing === 'percent' || (c.pct || 0) > 0;
          const amount = variable ? (avg[c.name] ?? c.retainer ?? 0) : (c.retainer || 0);
          const note = variable
            ? `Variable — retainer${c.pct ? ' + ' + c.pct + '% of ad spend' : ' + % of ad spend'}. Prefilled with the recent average: enter the invoice total, then confirm.` : null;
          await env.DB.prepare(`INSERT INTO transactions (date, month, type, vendor, amount, bucket, tax_cat, note, expected, source)
            VALUES (?1, ?2, 'in', ?3, ?4, 'Revenue', 'Client revenue', ?5, 1, 'recurring')`)
            .bind(month + '-01', month, c.name, amount, note).run();
          created++;
        }
        return json({ ok: true, created });
      }

      /* ---- month close / reopen / report ---- */
      if (path === '/api/close' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const month = validMonth(b.month) ? b.month : null;
        if (!month) return json({ error: 'month=YYYY-MM' }, 400);
        if ((await monthStatus(env, month)) === 'closed') return json({ error: 'already closed' }, 400);
        const open = await env.DB.prepare(`SELECT
            SUM(CASE WHEN expected = 1 THEN 1 ELSE 0 END) AS expected,
            SUM(CASE WHEN status = 'review' AND expected = 0 THEN 1 ELSE 0 END) AS review
          FROM transactions WHERE month = ?1`).bind(month).first();
        if (open.review > 0 && !b.force)
          return json({ error: `${open.review} transaction(s) still in Review — categorize them first.`, review: open.review }, 400);
        if (open.expected > 0) {
          if (!b.dropExpected)
            return json({ error: `${open.expected} expected row(s) never confirmed.`, expected: open.expected }, 400);
          await env.DB.prepare('DELETE FROM transactions WHERE month = ?1 AND expected = 1').bind(month).run();
        }
        const report = await computeReport(env, month);
        await env.DB.prepare(`INSERT OR REPLACE INTO months (month, status, closed_at, report_json)
          VALUES (?1, 'closed', ?2, ?3)`).bind(month, new Date().toISOString(), JSON.stringify(report)).run();
        return json({ ok: true, report });
      }

      if (path === '/api/reopen' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        if (!validMonth(b.month)) return json({ error: 'month=YYYY-MM' }, 400);
        // the frozen report stays in report_json until the next close overwrites it
        await env.DB.prepare(`UPDATE months SET status = 'open' WHERE month = ?1`).bind(b.month).run();
        return json({ ok: true });
      }

      if (path === '/api/report') {
        const month = url.searchParams.get('month');
        if (!validMonth(month)) return json({ error: 'month=YYYY-MM' }, 400);
        const row = await env.DB.prepare('SELECT status, closed_at, report_json FROM months WHERE month = ?1').bind(month).first();
        if (row?.report_json) return json({ frozen: true, closedAt: row.closed_at, report: safeJson(row.report_json, null) });
        return json({ frozen: false, status: row?.status || 'open', report: await computeReport(env, month) });
      }

      /* ---- dashboard summary ---- */
      if (path === '/api/summary') {
        const month = validMonth(url.searchParams.get('month'))
          ? url.searchParams.get('month') : new Date().toISOString().slice(0, 7);
        const year = month.slice(0, 4);
        const [report, yearRows, renewals] = await Promise.all([
          computeReport(env, month),
          env.DB.prepare(`SELECT month,
              SUM(CASE WHEN type='in' AND expected=0 THEN amount ELSE 0 END) AS revenue,
              SUM(CASE WHEN type='out' AND expected=0 THEN amount ELSE 0 END) AS expenses,
              SUM(CASE WHEN type='fee' AND expected=0 THEN amount ELSE 0 END) AS fees
            FROM transactions WHERE month LIKE ?1 GROUP BY month ORDER BY month`).bind(year + '-%').all(),
          env.DB.prepare('SELECT name, expected_amount FROM vendors WHERE recurring = 1 AND active = 1 ORDER BY expected_amount DESC').all(),
        ]);
        const attn = await env.DB.prepare(`SELECT
            SUM(CASE WHEN status='review' AND expected=0 THEN 1 ELSE 0 END) AS review,
            SUM(CASE WHEN expected=1 THEN 1 ELSE 0 END) AS expected,
            SUM(CASE WHEN type='out' AND expected=0 AND receipt_key IS NULL THEN 1 ELSE 0 END) AS noReceipt
          FROM transactions WHERE month = ?1`).bind(month).first();
        return json({ month, report, year: yearRows.results, renewals: renewals.results, attention: attn });
      }

      /* ---- CPA pack ---- */
      if (path === '/api/pack') {
        const from = url.searchParams.get('from'), to = url.searchParams.get('to');
        if (!validMonth(from) || !validMonth(to) || from > to) return json({ error: 'from/to = YYYY-MM' }, 400);
        const { results: txns } = await env.DB.prepare(
          `SELECT * FROM transactions WHERE month >= ?1 AND month <= ?2 AND expected = 0 ORDER BY date, id`)
          .bind(from, to).all();
        const money = await getMoney(env);
        const months = [...new Set(txns.map(t => t.month))].sort();
        const reports = [];
        for (const m of months) reports.push(await computeReport(env, m));
        const contractors = {};
        for (const t of txns) if (t.tax_cat === 'Contract labor (1099)')
          contractors[t.vendor] = round2((contractors[t.vendor] || 0) + t.amount);
        const openQuestions = txns.filter(t =>
          /Ask CPA|Personal — review/.test(t.tax_cat || '') || t.status === 'review' || !t.tax_cat);
        return json({ from, to, money, transactions: txns, monthReports: reports,
          contractors, openQuestions });
      }

      /* ---- receipts (KV) ---- */
      if (path === '/api/receipt' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const id = Number(b.id);
        const cur = await env.DB.prepare('SELECT id, receipt_key FROM transactions WHERE id = ?1').bind(id).first();
        if (!cur) return json({ error: 'unknown transaction' }, 404);
        const data = String(b.data || '');                       // base64, no data: prefix
        const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
        if (!bytes.length) return json({ error: 'empty file' }, 400);
        if (bytes.length > RECEIPT_MAX) return json({ error: 'file too large (4MB max after downscale)' }, 400);
        const key = `rcpt:${id}:${Date.now()}`;
        await env.RECEIPTS.put(key, bytes.buffer);
        if (cur.receipt_key) await env.RECEIPTS.delete(cur.receipt_key);
        const name = String(b.name || 'receipt').slice(0, 120);
        const type = String(b.type || 'application/octet-stream').slice(0, 80);
        await env.DB.prepare('UPDATE transactions SET receipt_key=?2, receipt_name=?3, receipt_type=?4 WHERE id=?1')
          .bind(id, key, name, type).run();
        return json({ ok: true, key });
      }

      if (path === '/api/receipt' && request.method === 'GET') {
        const id = Number(url.searchParams.get('id'));
        const cur = await env.DB.prepare('SELECT receipt_key, receipt_name, receipt_type FROM transactions WHERE id = ?1').bind(id).first();
        if (!cur?.receipt_key) return json({ error: 'no receipt' }, 404);
        const body = await env.RECEIPTS.get(cur.receipt_key, 'arrayBuffer');
        if (!body) return json({ error: 'file missing from store' }, 404);
        return new Response(body, { headers: { 'Content-Type': cur.receipt_type || 'application/octet-stream',
          'Content-Disposition': `inline; filename="${(cur.receipt_name || 'receipt').replace(/[^\w.\- ]/g, '')}"`, ...CORS } });
      }

      if (path === '/api/receipt' && request.method === 'DELETE') {
        const id = Number(url.searchParams.get('id'));
        const cur = await env.DB.prepare('SELECT receipt_key FROM transactions WHERE id = ?1').bind(id).first();
        if (cur?.receipt_key) await env.RECEIPTS.delete(cur.receipt_key);
        await env.DB.prepare('UPDATE transactions SET receipt_key=NULL, receipt_name=NULL, receipt_type=NULL WHERE id=?1').bind(id).run();
        return json({ ok: true });
      }

      /* ---- receipt reading (Claude) — degrades to manual entry without a key ---- */
      if (path === '/api/extract' && request.method === 'POST') {
        if (!env.ANTHROPIC_API_KEY) return json({ available: false });
        const b = await request.json().catch(() => ({}));
        return json({ available: true, extracted: await claudeExtract(env, b.data, String(b.media_type || 'image/jpeg')) });
      }

      /* ---- Slack receipts ---- */
      if (path === '/api/slack-check') {
        if (!env.SLACK_BOT_TOKEN) return json({ configured: false });
        const auth = await slack(env, 'auth.test', {});
        if (!auth.ok) return json({ configured: true, ok: false, error: auth.error });
        const ch = await findReceiptsChannel(env);
        return json({ configured: true, ok: !ch.error, bot: auth.user, team: auth.team,
          channel: ch.id || null, isMember: ch.is_member ?? null, error: ch.error || null });
      }

      if (path === '/api/slack-poll' && request.method === 'POST') {
        return json(await processSlackReceipts(env));
      }

      /* ---- vendors / clients / settings ---- */
      if (path === '/api/vendor' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const name = String(b.name || '').trim().slice(0, 120);
        if (!name || !b.bucket || !b.tax_cat) return json({ error: 'name, bucket, tax_cat required' }, 400);
        const cadence = b.cadence === 'yearly' ? 'yearly' : 'monthly';
        const rmn = Number(b.renew_month);
        await env.DB.prepare(`INSERT OR REPLACE INTO vendors (name, bucket, tax_cat, recurring, expected_amount, active, cadence, renew_month)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`)
          .bind(name, String(b.bucket), String(b.tax_cat), b.recurring ? 1 : 0,
                Number.isFinite(Number(b.expected_amount)) ? Number(b.expected_amount) : null,
                b.active === false ? 0 : 1, cadence,
                cadence === 'yearly' && rmn >= 1 && rmn <= 12 ? rmn : null).run();
        if (b.applyToExisting) {
          await env.DB.prepare(`UPDATE transactions SET bucket = ?2, tax_cat = ?3
            WHERE vendor = ?1 COLLATE NOCASE AND type = 'out'`).bind(name, String(b.bucket), String(b.tax_cat)).run();
        }
        return json({ ok: true });
      }

      if (path === '/api/vendor' && request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM vendors WHERE name = ?1').bind(url.searchParams.get('name') || '').run();
        return json({ ok: true });
      }

      if (path === '/api/client' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const name = String(b.name || '').trim().slice(0, 120);
        if (!name) return json({ error: 'name required' }, 400);
        await env.DB.prepare('INSERT OR REPLACE INTO clients (name, retainer, active, billing, pct) VALUES (?1, ?2, ?3, ?4, ?5)')
          .bind(name, Number(b.retainer) || 0, b.active === false ? 0 : 1,
                b.billing === 'percent' ? 'percent' : 'retainer',
                Number.isFinite(Number(b.pct)) && Number(b.pct) > 0 ? Number(b.pct) : null).run();
        return json({ ok: true });
      }

      if (path === '/api/client' && request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM clients WHERE name = ?1').bind(url.searchParams.get('name') || '').run();
        return json({ ok: true });
      }

      if (path === '/api/settings' && request.method === 'PUT') {
        const b = await request.json().catch(() => ({}));
        if (b.money) {
          const cur = await getMoney(env);
          const num = (v, fb, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fb; };
          const split = {};
          for (const k of ['personal', 'tax', 'ads', 'savings', 'other'])
            split[k] = num(b.money.split?.[k], cur.split[k], 0, 100);
          await putSetting(env, 'money', JSON.stringify({
            taxPct: num(b.money.taxPct, cur.taxPct, 0, 60),
            distPct: num(b.money.distPct, cur.distPct, 0, 100),
            feePct: num(b.money.feePct, cur.feePct, 0, 15),
            split,
          }));
        }
        if (Array.isArray(b.taxCats)) {
          const cats = [...new Set(b.taxCats.map(c => String(c).trim().slice(0, 60)).filter(Boolean))].slice(0, 40);
          if (cats.length) await putSetting(env, 'taxCats', JSON.stringify(cats));
        }
        return json({ money: await getMoney(env), taxCats: safeJson(await getSetting(env, 'taxCats'), []) });
      }

      if (path === '/api/password' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const pw = String(b.password || '');
        if (pw.length < 8) return json({ error: 'password must be at least 8 characters' }, 400);
        await putSetting(env, 'passwordHash', await sha256hex(pw));
        return json({ ok: true });
      }

      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: String(err && err.message || err) }, 500);
    }
  },
};
