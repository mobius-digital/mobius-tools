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
import { buildPnlPdf } from './pdf.js';
import { zipStream, zipSafe } from './zip.js';
import { driveReady, driveAuthUrl, driveExchangeCode, driveListReceipts,
         driveDownload, driveFolderId } from './drive.js';

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

/* A receipt's fingerprint. Two dates can never prove "same receipt" - a card
 * posts days after the purchase, and a subscription bills the identical
 * amount every month - but the bytes can: the same file is the same file.
 * Stored on attach so a re-forward is recognised with certainty, not a guess. */
async function sha256bytes(buf) {
  const d = await crypto.subtle.digest('SHA-256', buf instanceof ArrayBuffer ? buf : new Uint8Array(buf).buffer);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

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

const fmtMoney = n => '$' + Math.abs(Number(n) || 0).toFixed(2);
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

  let revenue = 0, fees = 0, expenses = 0, transfers = 0, personal = 0;
  const byBucket = {}, byTax = {}, byClient = {};
  for (const t of txns) {
    // transfers are money MOVING, not money made or spent: the Amex payment
    // from Novo, Stripe payouts landing, the 50/30/10/5/5 moves — counting
    // them would double every dollar that already counted as a charge
    if (t.type === 'transfer') { transfers += t.amount; continue; }
    if (t.type === 'in') { revenue += t.amount; byClient[t.vendor] = (byClient[t.vendor] || 0) + t.amount; }
    else if (t.type === 'fee') fees += t.amount;
    // a personal purchase on a business card is an owner draw, not a business
    // expense — kept in the ledger so it still ties to the bank statement,
    // excluded from the P&L so it never inflates costs
    else if (/^Personal/i.test(t.tax_cat || '')) personal += t.amount;
    else {
      expenses += t.amount;
      byBucket[t.bucket || 'Other'] = (byBucket[t.bucket || 'Other'] || 0) + t.amount;
      byTax[t.tax_cat || 'Uncategorized'] = (byTax[t.tax_cat || 'Uncategorized'] || 0) + t.amount;
    }
  }
  /* Fees are whatever Stripe actually charged — never a percentage guess. The
   * real number varies far too much to model anyway: August ran 1.1% because
   * the two largest payments arrived by ACH at $5 flat instead of 2.9% on a
   * card. A month with no fee row reports zero, which is the truth. */
  const feeEstimated = false;

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
    transfers: round2(transfers), personal: round2(personal),
    opCost, split, splitPct: money.split, taxPct: money.taxPct, distPct: money.distPct,
    byBucket: mapRound(byBucket), byTax: mapRound(byTax), byClient: mapRound(byClient),
    txnCount: txns.length,
  };
}
const mapRound = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round2(v)]).sort((a, b) => b[1] - a[1]));

/* A quarter or a year is the months summed — same shape as one month's report,
 * plus the per-month rows the statement prints underneath. */
async function computeRange(env, fromMo, toMo) {
  const money = await getMoney(env);
  const months = [];
  for (let m = fromMo; m <= toMo; m = monthOf(addMonthsYmd(m + '-01', 1))) months.push(m);
  const parts = [];
  for (const m of months) parts.push(await computeReport(env, m));
  const add = (into, from) => { for (const [k, v] of Object.entries(from)) into[k] = round2((into[k] || 0) + v); };
  const byBucket = {}, byTax = {}, byClient = {};
  let revenue = 0, expenses = 0, fees = 0, personal = 0, transfers = 0, feeEstimated = false;
  for (const p of parts) {
    revenue += p.revenue; expenses += p.expenses; fees += p.fees;
    personal += p.personal || 0; transfers += p.transfers;
    feeEstimated = feeEstimated || p.feeEstimated;
    add(byBucket, p.byBucket); add(byTax, p.byTax); add(byClient, p.byClient);
  }
  revenue = round2(revenue); expenses = round2(expenses); fees = round2(fees);
  const net = round2(revenue - expenses - fees);
  const split = {};
  for (const [k, pct] of Object.entries(money.split)) split[k] = round2(net * pct / 100);
  return {
    from: fromMo, to: toMo, revenue, expenses, fees, feeEstimated,
    net, personal: round2(personal), transfers: round2(transfers),
    taxes: round2(net * money.taxPct / 100),
    margin: revenue > 0 ? round2(net / revenue * 100) : null,
    split, splitPct: money.split,
    byBucket: mapRound(byBucket), byTax: mapRound(byTax), byClient: mapRound(byClient),
    monthRows: parts.map(p => ({ month: p.month, label: moLabel(p.month),
      revenue: p.revenue, expenses: round2(p.expenses + p.fees), net: p.net })),
  };
}

/* Period → the report behind it, plus how the statement should be titled. */
async function periodReport(env, period, anchor) {
  if (period === 'quarter') {
    const q = Math.floor((+anchor.slice(5, 7) - 1) / 3);
    const from = `${anchor.slice(0, 4)}-${String(q * 3 + 1).padStart(2, '0')}`;
    const to = `${anchor.slice(0, 4)}-${String(q * 3 + 3).padStart(2, '0')}`;
    const r = await computeRange(env, from, to);
    return { r, title: 'Profit & Loss', label: `Q${q + 1} ${anchor.slice(0, 4)}`,
             file: `Mobius Digital P&L — Q${q + 1} ${anchor.slice(0, 4)}.pdf`, months: r.monthRows };
  }
  if (period === 'year') {
    const y = anchor.slice(0, 4);
    const r = await computeRange(env, `${y}-01`, `${y}-12`);
    return { r, title: 'Profit & Loss', label: y,
             file: `Mobius Digital P&L — ${y}.pdf`, months: r.monthRows };
  }
  const r = await computeReport(env, anchor);
  return { r, title: 'Profit & Loss', label: moLabel(anchor),
           file: `Mobius Digital P&L — ${moLabel(anchor)}.pdf`, months: null,
           frozen: (await monthStatus(env, anchor)) === 'closed' };
}

/* Slack's external-upload dance: reserve a URL, PUT the bytes, then complete
 * the upload into the channel. Needs the files:write scope. */
async function slackUploadFile(env, channel, bytes, filename, comment) {
  const res1 = await slack(env, 'files.getUploadURLExternal',
    { filename, length: String(bytes.length) });
  if (!res1.ok) return { ok: false, error: res1.error || 'getUploadURLExternal failed' };
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename);
  const up = await fetch(res1.upload_url, { method: 'POST', body: form });
  if (!up.ok) return { ok: false, error: 'upload POST ' + up.status };
  const res2 = await slack(env, 'files.completeUploadExternal', {
    files: [{ id: res1.file_id, title: filename.replace(/\.pdf$/, '') }],
    channel_id: channel, initial_comment: comment || undefined,
  }, true);
  return res2.ok ? { ok: true } : { ok: false, error: res2.error };
}

/* Applies the vendor rule to a row missing categories; unknown vendors land
 * in the Review inbox instead of being silently guessed. */
/* Banks do not send the same name twice. The card calls Squarespace
 * "SQSP* WORKSP#2186907NEW" this month and "SQSP* WORKSP#2444996NEW" next, and
 * Amazon arrives in half a dozen spellings · an exact-name rule catches none
 * of them, so the same merchant lands in Review every month and the rules table
 * never actually learns anything. A rule whose name appears anywhere in the
 * bank's description counts, longest rule first so a specific rule always beats
 * a general one. */
async function findRule(env, vendor) {
  const exact = await env.DB.prepare('SELECT * FROM vendors WHERE name = ?1 COLLATE NOCASE')
    .bind(vendor).first();
  if (exact) return exact;
  const { results: all } = await env.DB.prepare(
    'SELECT * FROM vendors WHERE active = 1 AND LENGTH(name) >= 4').all();
  const v = String(vendor || '').toUpperCase();
  return all.filter(r => v.includes(String(r.name).toUpperCase()))
            .sort((a, b) => b.name.length - a.name.length)[0] || null;
}

async function applyRule(env, row) {
  if (row.type === 'in') { row.bucket = 'Revenue'; row.tax_cat = 'Client revenue'; return row; }
  if (row.type === 'fee') { row.bucket = 'Merchant fee'; row.tax_cat = 'Bank & merchant fees'; return row; }
  if (row.type === 'transfer') { row.bucket = 'Transfer'; row.tax_cat = 'Transfer — not P&L'; return row; }
  if (row.bucket && row.tax_cat) return row;
  const rule = await findRule(env, row.vendor);
  if (rule) { row.bucket = row.bucket || rule.bucket; row.tax_cat = row.tax_cat || rule.tax_cat; }
  else row.status = 'review';
  return row;
}

/* The tax category is the choice that matters; the bucket follows from it.
 * One tap (or one guess) sets both layers. Unknown/custom categories fall to
 * Other, which is also where the sheet always put the unclassifiable. */
/* ONE choice, two audiences. The tax category is what Cole picks; the bucket is
 * the plain-English group the dashboard and report card total by, derived from
 * it. Only four categories used to map, so ten of fourteen collapsed into
 * "Other" — which is exactly why the second dropdown felt pointless: it was.
 * Every category now lands somewhere meaningful and the picker is gone. */
const TAX2BUCKET = {
  'Software & subscriptions': 'Software',
  'Contract labor (1099)': 'Contractors',
  'Advertising & marketing': 'Ads/Marketing',
  'Bank & merchant fees': 'Merchant fee',
  'Meals (50%)': 'Meals & entertainment',
  'Entertainment — Ask CPA': 'Meals & entertainment',
  'Office supplies & equipment': 'Office & equipment',
  'Product testing': 'Product testing',
  'Travel & gas': 'Travel',
  'Utilities & phone': 'Utilities & phone',
  'Dues & memberships': 'Dues & memberships',
  'Taxes & licenses': 'Taxes & licenses',
  'Personal — review': 'Personal (not a business cost)',
  'Client revenue': 'Revenue',
  'Other — Ask CPA': 'Other',
};
const bucketFor = tax => TAX2BUCKET[tax] || 'Other';

/* Every confirmed categorization becomes that vendor's default suggestion —
 * automatically, so the "remembered vendors" list maintains itself. A vendor
 * marked recurring keeps its rule: one odd Best Buy run must not rewrite how
 * the monthly Slack bill files. */
async function learnDefault(env, vendor, bucket, tax_cat) {
  if (!vendor || !bucket || !tax_cat) return;
  await env.DB.prepare(`INSERT INTO vendors (name, bucket, tax_cat, recurring, active)
    VALUES (?1, ?2, ?3, 0, 1)
    ON CONFLICT(name) DO UPDATE SET bucket = ?2, tax_cat = ?3 WHERE recurring = 0`)
    .bind(String(vendor).slice(0, 120), bucket, tax_cat).run();
}

/* Claude reads a receipt: vendor, total, date, note — and proposes the tax
 * category from the app's own list, with runner-up guesses for the buttons. */
async function claudeExtract(env, b64, mediaType, textContent = null) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const cats = safeJson(await getSetting(env, 'taxCats'), []) || [];
  const block = textContent
    ? { type: 'text', text: 'EMAIL CONTENT:\n' + String(textContent).slice(0, 12000) }
    : mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 400,
      messages: [{ role: 'user', content: [block, { type: 'text', text:
        'This is a receipt or invoice for a small marketing agency\'s bookkeeping. Reply with ONLY a JSON object:\n' +
        '{"vendor": string, "amount": number (the total), "date": "YYYY-MM-DD" or null, "note": short string or null,\n' +
        ' "tax_category": the single best fit from this exact list, or null if genuinely unclear: ' + JSON.stringify(cats) + ',\n' +
        ' "alternates": up to 2 other plausible categories from the same list (e.g. a restaurant could be "Meals (50%)" or "Entertainment — Ask CPA")}.\n' +
        'Use the list values verbatim.\n\n' +
        'EXCEPTION — several payments in one document. Some documents are not one receipt: a bank confirmation ' +
        'listing several direct deposits, or an email thread stacking separate notifications back to back. When the ' +
        'document records TWO OR MORE payments to DIFFERENT recipients, add:\n' +
        '"payments": [{"vendor": recipient name, "amount": number, "date": "YYYY-MM-DD" or null}, ...] listing every one.\n' +
        'Only use "payments" for genuinely separate payments. One receipt with several line items, or a subtotal ' +
        'plus tax plus total, is ONE payment — leave "payments" out entirely. Set the top-level fields from the ' +
        'largest payment when you do use it. No other text.' }] }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  const m = (j?.content?.[0]?.text || '').match(/\{[\s\S]*\}/);
  const out = m ? safeJson(m[0], null) : null;
  if (out) {
    if (!cats.includes(out.tax_category)) out.tax_category = null;
    out.alternates = (out.alternates || []).filter(c => cats.includes(c) && c !== out.tax_category).slice(0, 2);
    out.payments = Array.isArray(out.payments)
      ? out.payments
          .map(p => ({ vendor: p && p.vendor ? String(p.vendor).slice(0, 120) : null,
                       amount: Number(p && p.amount), date: p && p.date }))
          .filter(p => p.vendor && Number.isFinite(p.amount) && p.amount !== 0)
          .slice(0, 20)
      : [];
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Slack #receipts intake (Phase 3)                                   */
/* ------------------------------------------------------------------ */

/* Cole is notified when an email lands in the channel, which is the one ping
 * he does not want, and NOT notified of thread replies, which are the ones he
 * does. Muting the channel fixes the first; an @mention is what still pierces
 * a muted channel, so anything needing a decision addresses him by name. The
 * id is looked up once from his email and then cached in settings. */
async function ownerMention(env) {
  const cached = await getSetting(env, 'ownerUserId');
  if (cached) return `<@${cached}> `;
  const email = (await getSetting(env, 'ownerEmail')) || env.OWNER_EMAIL;
  if (!email) return '';
  const r = await slack(env, 'users.lookupByEmail', { email }).catch(() => ({}));
  if (!r?.ok || !r.user?.id) return '';
  await putSetting(env, 'ownerUserId', r.user.id);
  return `<@${r.user.id}> `;
}

async function slack(env, method, params = {}, post = false) {
  // The Slack app is the shared "Mobius Digital" one; posts should still read
  // as this tool. Needs chat:write.customize — falls back plain if not granted.
  if (method === 'chat.postMessage')
    params = { username: 'Mobius Ledger',
               icon_url: 'https://tools.go-mobius-digital.com/icons/ledger-512.png', ...params };
  const send = async p => {
    const r = post
      ? await fetch(`https://slack.com/api/${method}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify(p) })
      : await fetch(`https://slack.com/api/${method}?${new URLSearchParams(p)}`, {
          headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } });
    return r.json();
  };
  let j = await send(params);
  if (j.error === 'missing_scope' && params.username) {
    const { username, icon_url, ...rest } = params;
    j = await send(rest);
  }
  return j;
}

/* Anything the automation cannot recover from goes here: addressed to Cole
 * by name, because silence about a broken sync is indistinguishable from a
 * quiet month. */
async function alertSlack(env, text) {
  const sr = safeJson(await getSetting(env, 'slackReceipts'), {}) || {};
  if (!sr.channelId || !env.SLACK_BOT_TOKEN) return;
  const at = await ownerMention(env);
  await slack(env, 'chat.postMessage',
    { channel: sr.channelId, text: at + text, unfurl_links: false }, true);
}

async function findReceiptsChannel(env) {
  let cursor = '';
  do {
    const r = await slack(env, 'conversations.list',
      { types: 'public_channel,private_channel', exclude_archived: 'true', limit: '200', ...(cursor ? { cursor } : {}) });
    if (!r.ok) return { error: r.error };
    // #finance is the one financial channel; #receipts was its original name
    const hit = (r.channels || []).find(c => c.name === 'finance')
             || (r.channels || []).find(c => c.name === 'receipts');
    if (hit) return { id: hit.id, is_member: !!hit.is_member };
    cursor = r.response_metadata?.next_cursor || '';
  } while (cursor);
  return { error: 'no #finance (or #receipts) channel found' };
}

/* Slack signs every event: HMAC of "v0:<timestamp>:<raw body>". Verifying it is
 * what makes the events endpoint safe to leave unauthenticated — without this
 * anyone who learned the URL could make the worker file transactions. */
async function verifySlackSig(env, ts, rawBody, sig) {
  if (!env.SLACK_SIGNING_SECRET || !ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - +ts) > 300) return false;   // replay guard
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SLACK_SIGNING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${ts}:${rawBody}`));
  const mine = 'v0=' + [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (mine.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < mine.length; i++) diff |= mine.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

const SEEN_CAP = 300;

/* ------------------------------------------------------------------ */
/*  receipt files: R2 for keeps, KV for the short-lived ones           */
/* ------------------------------------------------------------------ */
/* Receipts used to live in KV because R2 was not enabled on the account. It is
 * now, so every stored receipt goes to R2 — but reads still fall back to KV so
 * the ones written before keep opening, with no migration and no flag day.
 * "pend:" blobs (an emailed receipt awaiting a yes/no) stay in KV either way:
 * they want an expiry, which KV has and R2 does not. */
const isPending = key => String(key).startsWith('pend:');

async function receiptPut(env, key, body, ttlSeconds) {
  if (isPending(key) || !env.R2)
    return void await env.RECEIPTS.put(key, body, ttlSeconds ? { expirationTtl: ttlSeconds } : undefined);
  await env.R2.put(key, body);
}
async function receiptGet(env, key) {
  if (!isPending(key) && env.R2) {
    const obj = await env.R2.get(key);
    if (obj) return await obj.arrayBuffer();
  }
  return await env.RECEIPTS.get(key, 'arrayBuffer');   // pre-R2 receipts
}
async function receiptDelete(env, key) {
  if (env.R2) await env.R2.delete(key).catch(() => {});
  await env.RECEIPTS.delete(key).catch(() => {});
}

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
  // An event and the cron can fire on the same file within seconds of each
  // other; both would read the same `seen` list and file the receipt twice.
  // A short lease makes the loser skip instead.
  if (cfg.lockUntil && cfg.lockUntil > Date.now()) return { skipped: 'another run in progress' };
  cfg.lockUntil = Date.now() + 60e3;
  await putSetting(env, 'slackReceipts', JSON.stringify(cfg));
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
  const taxCats = safeJson(await getSetting(env, 'taxCats'), []) || [];
  /* Skip OUR OWN posts only. The first version of this skipped every bot
   * message, which silently swallowed the entire email intake: Slack delivers
   * mail sent to a channel address as a post from SLACKBOT, so ten forwarded
   * receipts arrived and none was ever read. Identify ourselves properly. */
  let selfId = cfg.selfUserId;
  if (!selfId) {
    const who = await slack(env, 'auth.test');
    if (who.ok) { selfId = cfg.selfUserId = who.user_id; }
  }
  let handled = 0, needsYou = 0;
  const filed = [];
  for (const msg of msgs) {
    if (+msg.ts > +(cfg.lastTs || 0)) cfg.lastTs = msg.ts;
    if (selfId && msg.user === selfId) continue;              // our own P&L posts
    /* One forwarded email lands as TWO Slack files: the email container and
     * a copy of its text/html body. Reading both filed the same payment twice,
     * onto rows in two different months (the second copy could not use the row
     * the first had just receipted, so it went hunting in the window). When an
     * email container exists it is the only file worth reading. */
    const mails = (msg.files || []).filter(f => f.filetype === 'email'
      || f.mimetype === 'message/rfc822' || f.mimetype === 'text/html');
    const flist = mails.length ? [mails[0]] : (msg.files || []);
    for (const f of flist) {
      const isPdf = f.mimetype === 'application/pdf';
      // Slack's email-to-channel arrives as filetype 'email', and the forwarded
      // body itself comes through as a text/html file. Both are receipts.
      const isEmail = f.filetype === 'email' || f.mimetype === 'text/html'
        || f.mimetype === 'message/rfc822';
      if (!isEmail && !isPdf && !/^image\//.test(f.mimetype || '')) continue;
      if (cfg.seen.includes(f.id)) continue;
      cfg.seen.push(f.id); if (cfg.seen.length > SEEN_CAP) cfg.seen = cfg.seen.slice(-SEEN_CAP);
      const reply = (text, blocks) => slack(env, 'chat.postMessage',
        { channel: cfg.channelId, thread_ts: msg.ts, text, unfurl_links: false,
          ...(blocks ? { blocks } : {}) }, true);
      /* A reaction is the whole status report when nothing is wrong. It does
       * not notify anyone, so twenty forwarded receipts stop being twenty
       * pings: the tick just appears on each one. Anything that actually
       * needs Cole still replies in the thread, which does notify. */
      const react = name => slack(env, 'reactions.add',
        { channel: cfg.channelId, timestamp: msg.ts, name }, true).catch(() => {});
      /* Only used where a decision is genuinely waiting, so the mention keeps
       * meaning "this one needs you" rather than becoming background noise. */
      const nudge = async (text, blocks) => {
        const at = await ownerMention(env);
        const withAt = at + text;
        if (blocks && blocks[0]?.type === 'section' && blocks[0].text?.type === 'mrkdwn')
          blocks = [{ ...blocks[0], text: { ...blocks[0].text, text: at + blocks[0].text.text } }, ...blocks.slice(1)];
        return reply(withAt, blocks);
      };
      /* Filed without incident: still say exactly what happened and where it
       * went — a thread reply does not notify him, so a running record costs
       * nothing. What it does NOT do is @mention him. The mention is reserved
       * for the ones holding a decision, so a ping always means "you". */
      const quiet = async (t, text, blocks) => {
        if (t) filed.push(t);
        await react('white_check_mark');
        if (text) await reply(text, blocks);
      };
      /* The category controls live IN the thread, so a wrong guess is one tap
       * to fix and the app never has to be opened for a receipt. */
      const catControls = (txnId, current, alternates) => {
        const short = c => c.length > 24 ? c.slice(0, 23) + '…' : c;
        const els = alternates.map((c, i) => ({
          type: 'button', action_id: 'cat' + i,
          text: { type: 'plain_text', text: short(c) },
          value: JSON.stringify({ id: txnId, tax: c }) }));
        els.push({
          type: 'static_select', action_id: 'cat_sel',
          placeholder: { type: 'plain_text', text: 'Change category…' },
          options: taxCats.map(c => ({ text: { type: 'plain_text', text: short(c) },
            value: JSON.stringify({ id: txnId, tax: c }) })) });
        return { type: 'actions', elements: els.slice(0, 5) };
      };
      try {
        let dlUrl = f.url_private_download || f.url_private;
        let mimetype = f.mimetype, fname = f.name || 'receipt', emailText = null;
        if (isEmail) {
          const info = await slack(env, 'files.info', { file: f.id });
          const fi = info.file || f;
          /* Which attachment, when a vendor sends more than one? Prefer the
           * word "receipt" — it is proof of payment, which is what a deduction
           * needs; an invoice only proves it was asked for. Failing that take
           * any PDF or image, and failing THAT keep the email itself, because
           * plenty of vendors put the whole receipt in the body. */
          const atts = (fi.attachments || []).filter(a =>
            a.mimetype === 'application/pdf' || /^image\//.test(a.mimetype || ''));
          const named = re => atts.find(a => re.test(String(a.filename || a.name || '')));
          const att = named(/receipt/i) || named(/invoice|statement|bill/i) || atts[0];
          if (att && (att.url || att.url_private)) {
            dlUrl = att.url || att.url_private; mimetype = att.mimetype;
            fname = att.filename || att.name || fname;
          } else {
            // No usable attachment: read the email itself, and store it as the
            // receipt so there is still a document behind the number.
            const from = Array.isArray(fi.from) && fi.from[0] ? (fi.from[0].address || fi.from[0].original || '') : '';
            const body = fi.plain_text || fi.preview_plain_text || fi.preview || '';
            emailText = [fi.subject ? 'Subject: ' + fi.subject : '', from ? 'From: ' + from : '', body]
              .filter(Boolean).join('\n');
            fname = ((fi.subject || 'email receipt') + '.html').slice(0, 120);
            mimetype = f.mimetype || 'text/html';
          }
        }
        const dl = await fetch(dlUrl, { headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } });
        const buf = await dl.arrayBuffer();
        if (buf.byteLength > 8 * 1024 * 1024) { await react('x'); needsYou++; await nudge('⚠️ That file is over 8MB — attach it from the app instead.'); continue; }
        const bytes = new Uint8Array(buf);
        let b64 = '';
        for (let i = 0; i < bytes.length; i += 0x8000)
          b64 += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        b64 = btoa(b64);
        /* Slack hands the forwarded mail over as an HTML file, and files.info
         * often carries no plain_text for it — so the readable version has to
         * come out of the markup itself. Strip script/style, drop the tags,
         * unescape the handful of entities that matter, and let Claude read
         * what a person would see. */
        if (isEmail && (!emailText || emailText.length < 200) && /html|text\//.test(mimetype || '')) {
          const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
          const text = html
            .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;|&#8199;|&#847;|&zwnj;/gi, ' ')
            .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
            .replace(/\s+/g, ' ')
            .trim();
          if (text.length > (emailText || '').length) emailText = text.slice(0, 12000);
        }
        // Claude's image ceiling is ~5MB of data; oversize files still get stored
        const ext = emailText
          ? await claudeExtract(env, null, null, emailText)
          : bytes.length < 4.5 * 1024 * 1024 ? await claudeExtract(env, b64, mimetype) : null;
        const today = centralDate(Date.now() / 1000);
        // THE RECEIPT'S OWN DATE DECIDES THE MONTH. A receipt photographed in
        // September for an April lunch belongs to April — filing it under
        // "today" would silently move spend between months (and years).
        const rDate = /^\d{4}-\d{2}-\d{2}$/.test(ext?.date || '') && ext.date <= today ? ext.date : today;
        const rMonth = monthOf(rDate);

        /* 0) ONE DOCUMENT, SEVERAL PAYMENTS. Cole pays his contractors in a
         * single batch, so the bank sends back one confirmation covering four
         * people at once. Read as a single receipt it would attach to whoever
         * happened to be extracted first and leave the rest bare. Each payment
         * gets matched on its own and the same file is attached to every row
         * it settles. Strictly ATTACH-ONLY: the bank feed already carries these
         * charges, so inventing rows from the confirmation would double-count. */
        const many = (ext?.payments || []).length > 1 ? ext.payments : null;
        if (many) {
          const hit = [], miss = [];
          for (const p of many) {
            const pDate = /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') && p.date <= today ? p.date : rDate;
            const { results } = await env.DB.prepare(
              `SELECT * FROM transactions WHERE type = 'out' AND expected = 0 AND receipt_key IS NULL
               AND month >= ?1 AND month <= ?2 AND ABS(amount - ?3) < 0.005
               ORDER BY ABS(julianday(date) - julianday(?4)) LIMIT 5`)
              .bind(monthOf(addMonthsYmd(pDate, -1)), monthOf(addMonthsYmd(pDate, 1)), Math.abs(p.amount), pDate).all();
            const first = String(p.vendor).toLowerCase().split(' ')[0];
            const row = results.find(t => t.vendor.toLowerCase().includes(first)) || results[0] || null;
            if (!row) { miss.push(p); continue; }
            const key = `rcpt:${row.id}:${Date.now()}:${hit.length}`;
            await receiptPut(env, key, buf);
            await env.DB.prepare('UPDATE transactions SET receipt_key=?2, receipt_name=?3, receipt_type=?4, receipt_hash=?5 WHERE id=?1')
              .bind(row.id, key, fname.slice(0, 120), mimetype, await sha256bytes(buf)).run();
            hit.push(row);
          }
          if (hit.length) {
            if (miss.length) {
              const lines = hit.map(t => `• *${t.vendor}* $${t.amount.toFixed(2)} — ${moLabel(monthOf(t.date))}`).join('\n');
              const msg = `🧾 Attached to *${hit.length} payment${hit.length > 1 ? 's' : ''}*:\n${lines}\n\n` +
                `⚠️ ${miss.length} more in there matched no charge: ${miss.map(p => `${p.vendor} $${Math.abs(p.amount).toFixed(2)}`).join(', ')}. ` +
                `Either it has not posted to Novo or Amex yet, or it went on a different card.`;
              await react('warning'); needsYou++;
              await nudge(msg, [{ type: 'section', text: { type: 'mrkdwn', text: msg } },
                { type: 'actions', elements: hit.slice(0, 5).map(t => ({ type: 'button', action_id: 'unmatch',
                    text: { type: 'plain_text', text: `Not ${String(t.vendor).slice(0, 18)} ↩︎` },
                    value: JSON.stringify({ undo: t.id }) })) }]);
            } else {
              const lines = hit.map(t => `• *${t.vendor}* $${t.amount.toFixed(2)} — ${moLabel(monthOf(t.date))}`).join('\n');
              const ok = `✅ Covered *${hit.length} payment${hit.length > 1 ? 's' : ''}* — receipt attached to each:\n${lines}`;
              for (const t of hit) filed.push(t);
              await quiet(null, ok, [
                { type: 'section', text: { type: 'mrkdwn', text: ok } },
                { type: 'actions', elements: hit.slice(0, 5).map(t => ({ type: 'button', action_id: 'unmatch',
                    text: { type: 'plain_text', text: `Not ${String(t.vendor).slice(0, 18)} ↩︎` },
                    value: JSON.stringify({ undo: t.id }) })) }]);
            }
            handled++; continue;
          }
          // nothing matched: fall through and treat it as one ordinary receipt
        }

        // 1) best case: it pays off an expense already in the ledger. Search the
        // receipt's own month ±1 (a card posts a day or two after the purchase);
        // attaching to a CLOSED month is allowed — only new rows are frozen out.
        let target = null;
        if (ext?.amount) {
          const { results } = await env.DB.prepare(
            `SELECT * FROM transactions WHERE type = 'out' AND expected = 0 AND receipt_key IS NULL
             AND month >= ?1 AND month <= ?2 AND ABS(amount - ?3) < 0.005 ORDER BY ABS(julianday(date) - julianday(?4)) LIMIT 5`)
            .bind(monthOf(addMonthsYmd(rDate, -1)), monthOf(addMonthsYmd(rDate, 1)), ext.amount, rDate).all();
          target = results.find(t => ext.vendor && t.vendor.toLowerCase().includes(String(ext.vendor).toLowerCase().split(' ')[0])) || results[0] || null;
        }
        /* 2) An EMAILED receipt that matches nothing is not filed. A photo is
         * something Cole chose to take, so it is his by definition — but email
         * arrives on its own, and plenty of it is a copy of somebody else's
         * charge: Shopify billing a client's store, Triple Whale on a client's
         * card. Inventing an expense from those would quietly inflate his costs.
         * Now that the bank feed carries every real charge, "nothing matched"
         * is a strong signal, so it asks instead of guessing. */
        if (!target && isEmail && ext?.vendor && ext?.amount) {
          const pendKey = `pend:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
          await receiptPut(env, pendKey, buf, 30 * 24 * 3600);
          await putSetting(env, pendKey, JSON.stringify({
            vendor: String(ext.vendor).slice(0, 120), amount: round2(Number(ext.amount)),
            date: rDate, month: rMonth, name: fname.slice(0, 120), type: mimetype,
            note: ext.note ? String(ext.note).slice(0, 300) : null,
            tax_cat: ext.tax_category || null,
            // where it arrived · the week-later follow-up belongs in the same
            // thread as the receipt, not shouted into the channel
            ch: cfg.channelId, ts: msg.ts,
          }));
          /* "No match" is usually true, but not always: the exact-cent rule
           * misses a receipt whose total differs from what the card actually
           * took (foreign VAT, a rounded conversion, a tip added after). So
           * before shrugging, look for a charge that is CLOSE on the same
           * vendor and offer it by name. Never auto-attached — offered. */
          /* An invoice charges the exact amount, so the cent rule stays. When
           * it still finds nothing, the useful thing is not a looser guess:
           * it is saying WHICH of the filters rejected it. The same amount is
           * looked up again with each restriction dropped in turn, and the
           * first hit explains itself and offers the action that fits. */
          const amt = Number(ext.amount);
          const win = [monthOf(addMonthsYmd(rDate, -1)), monthOf(addMonthsYmd(rDate, 1))];
          const same = String(ext.vendor || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0] || '';
          const q = async (sql, binds) => (await env.DB.prepare(sql).bind(...binds).all()).results;

          /* (a) the charge is there, but something already claimed the receipt.
           * DATE-TIGHT on purpose: a subscription bills the same amount every
           * single month, so the +/-1 month window used for MATCHING would
           * call September's Canva receipt a duplicate of August's. Ten days
           * covers a receipt arriving before or after its charge posts;
           * anything a month away is next month's bill, not this one twice. */
          const fp = await sha256bytes(buf);
          const sameFile = await q(
            `SELECT * FROM transactions WHERE receipt_hash = ?1 LIMIT 3`, [fp]);
          const taken = sameFile.length ? sameFile : await q(
            `SELECT * FROM transactions WHERE type='out' AND expected=0 AND receipt_key IS NOT NULL
             AND ABS(amount - ?1) < 0.005 AND ABS(julianday(date) - julianday(?2)) <= 10
             ORDER BY ABS(julianday(date) - julianday(?2)) LIMIT 3`, [amt, rDate]);
          // (b) it is still only a prediction — the bank has not confirmed it
          const pending = await q(
            `SELECT * FROM transactions WHERE type='out' AND expected=1
             AND month >= ?1 AND month <= ?2 AND ABS(amount - ?3) < 0.005 LIMIT 3`, [...win, amt]);
          // (c) right amount, wrong month — the date on the receipt misled us
          const elsewhere = await q(
            `SELECT * FROM transactions WHERE type='out' AND expected=0 AND receipt_key IS NULL
             AND ABS(amount - ?1) < 0.005 ORDER BY date DESC LIMIT 3`, [amt]);
          // (d) the vendor is known, so what DID it charge around then?
          const byVendor = same ? await q(
            `SELECT * FROM transactions WHERE type='out' AND expected=0
             AND month >= ?1 AND month <= ?2 AND LOWER(vendor) LIKE ?3
             ORDER BY date DESC LIMIT 3`, [...win, `%${same}%`]) : [];

          /* A duplicate is CLOSED, not open: the charge is covered, so there is
           * no decision, no mention, and above all no "file as new" button —
           * that button on a duplicate is a one-tap double count. The pending
           * blob is deleted on the spot so nothing lingers to act on later. */
          if (taken.length) {
            await receiptDelete(env, pendKey).catch(() => {});
            await env.DB.prepare('DELETE FROM settings WHERE key = ?1').bind(pendKey).run();
            await react('repeat');
            await reply(sameFile.length
              ? `🔁 *${ext.vendor}* $${amt.toFixed(2)} — this is the exact same file already attached to *${taken[0].vendor}* ${fmtMoney(taken[0].amount)} (${taken[0].date}). Nothing filed, nothing needed.`
              : `🔁 *${ext.vendor}* $${amt.toFixed(2)} — that charge (${taken[0].vendor}, ${taken[0].date}) already has its receipt, dated within days of this one. Nothing filed; if this is a different charge, attach it from the app.`);
            handled++; continue;
          }
          const head = `🔍 *${ext.vendor}* $${amt.toFixed(2)} — no charge on Novo or Amex matches that amount yet.`;
          let why, btns = [], fresh = false;
          if (pending.length) {
            why = `There is a matching *expected* row (${pending[0].vendor}, ${moLabel(pending[0].month)}) that the bank has not confirmed yet. Confirm it in the app and drop this receipt again, and it will attach.`;
          } else if (elsewhere.length) {
            why = `The amount exists but in *${moLabel(elsewhere[0].month)}* (${elsewhere[0].vendor}, ${elsewhere[0].date}), outside the window around this receipt's date. Tap it to attach it there:`;
            btns = elsewhere.slice(0, 3).map(t => ({ type: 'button', action_id: 'led_attach',
              text: { type: 'plain_text', text: `${String(t.vendor).slice(0, 14)} ${t.date}` },
              value: JSON.stringify({ file: pendKey, to: t.id }) }));
          } else if (byVendor.length) {
            why = `*${byVendor[0].vendor}* did charge you in that window, but ${byVendor.map(t => '$' + t.amount.toFixed(2)).join(', ')} — not $${amt.toFixed(2)}. Either I misread the total, or this receipt covers a different card.`;
          } else if (rDate >= addMonthsYmd(today, 0) || (Date.parse(today) - Date.parse(rDate)) <= 4 * 86400e3) {
            /* Days old and unmatched is the ordinary case, not a problem: the
             * bank feed runs nightly, so a charge from today simply is not
             * here yet. Held and retried automatically after every sync. */
            fresh = true;
            why = `The charge has almost certainly not reached Novo or Amex yet · the bank feed runs overnight. I am holding this receipt and will attach it automatically as soon as the charge lands. Nothing for you to do.`;
          } else {
            why = `Nothing at that amount anywhere, and this receipt is more than a few days old. That usually means it went on a card Ledger does not see, or it is somebody else's card (a client's Shopify or ad tool).`;
          }
          const body = `${head}\n${why}`;
          await react(fresh ? 'hourglass_flowing_sand' : 'question');
          if (!fresh) needsYou++;
          await (fresh ? reply : nudge)(body, [
            { type: 'section', text: { type: 'mrkdwn', text: body } },
            { type: 'actions', elements: [...btns,
              { type: 'button', action_id: 'led_file',
                style: 'primary', text: { type: 'plain_text', text: 'File as a new expense' },
                value: JSON.stringify({ file: pendKey }) },
            ].slice(0, 5) }]);
          handled++; continue;
        }
        // 3) otherwise a readable receipt files itself as a new expense
        if (!target && ext?.vendor && ext?.amount) {
          const date = rDate, month = rMonth;
          if ((await monthStatus(env, month)) === 'closed') {
            /* Attaching to a closed month is fine and happens silently above.
             * This is the other case: no charge matched, so filing it would
             * mean CREATING a row in a month whose report is already frozen,
             * which would change a number that has been reported. */
            await react('lock'); needsYou++;
            await nudge(`🔒 *${ext.vendor}* $${Number(ext.amount).toFixed(2)} from ${date} matches no charge in ${moLabel(month)}, and that month is closed — so I can't add it without changing a report you've already filed.\n` +
              `Attaching receipts to a closed month is fine; it's only *new* rows that are frozen out. If this really belongs there, reopen ${moLabel(month)} in the app and drop it again.`);
            handled++; continue;
          }
          const row = await applyRule(env, {
            date, month, type: 'out', vendor: String(ext.vendor).slice(0, 120),
            amount: round2(Number(ext.amount)), bucket: null, tax_cat: null,
            note: ext.note ? String(ext.note).slice(0, 300) : null, status: 'ok',
          });
          // no rule for this vendor → Claude's read of the receipt decides,
          // and the choice is learned as the vendor's default for next time
          let guessed = false;
          if (row.status === 'review' && ext.tax_category) {
            row.tax_cat = ext.tax_category; row.bucket = bucketFor(ext.tax_category);
            row.status = 'ok'; guessed = true;
            await learnDefault(env, row.vendor, row.bucket, row.tax_cat);
          }
          const res = await env.DB.prepare(`INSERT INTO transactions
            (date, month, type, vendor, amount, bucket, tax_cat, note, status, source)
            VALUES (?1,?2,'out',?3,?4,?5,?6,?7,?8,'manual')`)
            .bind(row.date, row.month, row.vendor, row.amount, row.bucket, row.tax_cat, row.note, row.status).run();
          target = { id: res.meta.last_row_id, vendor: row.vendor, amount: row.amount, date: row.date,
                     __new: true, __review: row.status === 'review', __guessed: guessed,
                     __cat: row.tax_cat, __alts: ext.alternates || [] };
        }
        if (target) {
          const key = `rcpt:${target.id}:${Date.now()}`;
          await receiptPut(env, key, buf);
          await env.DB.prepare('UPDATE transactions SET receipt_key=?2, receipt_name=?3, receipt_type=?4, receipt_hash=?5 WHERE id=?1')
            .bind(target.id, key, fname.slice(0, 120), mimetype, await sha256bytes(buf)).run();
          // the month is always stated: a receipt filed into the wrong month is
          // the one mistake that would quietly move spend around behind him
          if (target.__new) {
            const base = `🧾 Filed: *${target.vendor}* $${target.amount.toFixed(2)} — dated ${target.date}, lands in *${moLabel(monthOf(target.date))}*. Receipt attached.`;
            /* A brand new row is money the bank feed did not have, so it is
             * always worth a word — but only an uncertain category is worth
             * a ping. A vendor with a known rule just gets its tick. */
            if (target.__review || target.__guessed) {
              const text = target.__review
                ? base + `\n⚠️ I couldn't tell what this was — pick a category below and I'll remember it.`
                : base + `\nCategorized as *${target.__cat}* (my read of the receipt — tap below if it was something else, like client entertainment).`;
              await react(target.__review ? 'warning' : 'eyes'); needsYou++;
              await nudge(text, [
                { type: 'section', text: { type: 'mrkdwn', text } },
                catControls(target.id, target.__cat, target.__alts),
              ]);
            } else {
              await quiet(target, base + `\nCategorized as *${target.__cat}* — your usual for this vendor.`, [
                { type: 'section', text: { type: 'mrkdwn', text: base + `\nCategorized as *${target.__cat}* — your usual for this vendor.` } },
                catControls(target.id, target.__cat, target.__alts),
              ]);
            }
          } else {
            const mt = `✅ Matched to *${target.vendor}* $${target.amount.toFixed(2)} in *${moLabel(monthOf(target.date))}* (${target.date}) — receipt attached.`;
            await quiet(target, mt, [
              { type: 'section', text: { type: 'mrkdwn', text: mt } },
              { type: 'actions', elements: [{ type: 'button', action_id: 'unmatch',
                  text: { type: 'plain_text', text: 'Not a match ↩︎' },
                  value: JSON.stringify({ undo: target.id }) }] },
            ]);
          }
        } else {
          await react('question'); needsYou++;
          await nudge(isEmail
            ? `⚠️ No amount anywhere in this email — some vendors only say "view your receipt" behind a link.\n` +
              `Open it, download the actual receipt, and drop that here instead. If it is a vendor that never emails one, ` +
              `save their billing page under Settings → Remembered vendors and month-end will hand you the link.`
            : `⚠️ Couldn't read a vendor + total off this one — add it from the app's Receipts tab instead.`);
        }
        handled++;
      } catch (e) {
        await react('x').catch(() => {});
        needsYou++;
        await nudge(`⚠️ Something went wrong handling this file: ${String(e.message || e).slice(0, 140)}`).catch(() => {});
      }
    }
  }
  /* Held receipts whose 30-day blob has already expired leave a settings row
   * behind forever if the button is never pressed; sweep them here. The key
   * embeds its own creation time, so age is a string comparison away. */
  try {
    const cutoff = Date.now() - 35 * 24 * 3600e3;
    const { results: stale } = await env.DB.prepare(
      `SELECT key FROM settings WHERE key LIKE 'pend:%'`).all();
    for (const r of stale) {
      const ts = Number(r.key.split(':')[1]);
      if (Number.isFinite(ts) && ts < cutoff)
        await env.DB.prepare('DELETE FROM settings WHERE key = ?1').bind(r.key).run();
    }
  } catch (e) { /* housekeeping only — never let it break the poll */ }

  /* No end-of-run summary: every receipt now reports in its own thread, and a
   * channel-level post is the one shape that WOULD ping him. */
  cfg.lockUntil = 0;
  await putSetting(env, 'slackReceipts', JSON.stringify(cfg));
  return { handled, filed: filed.length, needsYou, channel: cfg.channelId };
}

/* The old first-of-month ritual, delivered instead of performed: on the 1st
 * the previous month's Profit & Loss lands in the finance channel as a real
 * PDF, with the numbers and whatever still blocks the close in the message.
 * Quarters follow on the 1st of Jan/Apr/Jul/Oct, the year on Jan 1. */
async function sendStatement(env, period, anchor, opts = {}) {
  if (!env.SLACK_BOT_TOKEN) return { skipped: 'no SLACK_BOT_TOKEN' };
  const sr = safeJson(await getSetting(env, 'slackReceipts'), {}) || {};
  if (!sr.channelId) {
    const ch = await findReceiptsChannel(env);
    if (ch.error) return { skipped: ch.error };
    sr.channelId = ch.id;
    await putSetting(env, 'slackReceipts', JSON.stringify(sr));
  }
  const { r, title, label, file, months, frozen } = await periodReport(env, period, anchor);
  const $$ = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const SPLIT_LABELS = { personal: 'Personal', tax: 'Tax reserve', ads: 'Ads / Marketing', savings: 'Savings', other: 'Other' };

  let blockers = [];
  if (period === 'month') {
    const f = await env.DB.prepare(`SELECT
        SUM(CASE WHEN status='review' AND expected=0 THEN 1 ELSE 0 END) AS review,
        SUM(CASE WHEN expected=1 THEN 1 ELSE 0 END) AS expected,
        SUM(CASE WHEN type='out' AND expected=0 AND receipt_key IS NULL AND receipt_skip=0 THEN 1 ELSE 0 END) AS noRcpt
      FROM transactions WHERE month=?1`).bind(anchor).first() || {};
    blockers = [
      +f.review ? `${f.review} in Review` : null,
      +f.expected ? `${f.expected} expected row(s) unconfirmed` : null,
      +f.noRcpt ? `${f.noRcpt} missing receipt(s)` : null,
    ].filter(Boolean);
  }
  const heading = period === 'month' ? `📊 *${label} — Profit & Loss*`
    : period === 'quarter' ? `📊 *${label} — Quarterly Profit & Loss*`
    : `📊 *${label} — Annual Profit & Loss*`;
  const comment = [
    heading,
    `Revenue ${$$(r.revenue)}  ·  Expenses ${$$(round2(r.expenses + r.fees))}  ·  *Net ${$$(r.net)}*` +
      (r.margin != null ? `  ·  ${r.margin}% margin` : ''),
    '',
    '*Move the money* — from Novo:',
    Object.entries(r.split).map(([k, v]) => `• ${SPLIT_LABELS[k] || k} (${r.splitPct[k]}%) — ${$$(v)}`).join('\n'),
    '',
    frozen ? '✅ The month is closed — these figures are frozen.'
      : blockers.length ? `⚠️ Before you close ${label}: ${blockers.join(' · ')}.`
      : period === 'month' ? '✅ Nothing blocks the close — one click in the app freezes this.' : '',
    'Full statement attached · <https://tools.go-mobius-digital.com/ledger/|Open Mobius Ledger>',
    /* The one manual step in the whole system, and it only comes round once:
     * take the year's receipts somewhere that is not Cloudflare. Said here
     * because a reminder nobody sees is not a backup policy. */
    period === 'year'
      ? '\n📦 *Once-a-year housekeeping:* Reports → Receipt archive → *All of ' + label +
        '* downloads every receipt as one ZIP. Drop it in Drive beside this year\'s tax return — ' +
        'that is your off-Cloudflare copy.'
      : '',
  ].filter(x => x !== '').join('\n');

  const bytes = buildPnlPdf(r, {
    title, period: label, months,
    sub: period === 'month' ? 'Monthly statement' : period === 'quarter' ? 'Quarterly statement' : 'Annual statement',
    frozen,
  });
  const up = await slackUploadFile(env, sr.channelId, bytes, file, comment);
  return { period, anchor, label, bytes: bytes.length, sent: up.ok, error: up.error };
}

/* What the 1st of the month owes him: last month always, the quarter when one
 * just ended, and the year every January — each sent once. */
async function monthlyReportSlack(env, force = false, moOverride = null, periodOverride = null) {
  const today = centralDate(Date.now() / 1000);
  const prev = monthOf(addMonthsYmd(today, -1));
  if (force) {
    const anchor = /^\d{4}-\d{2}$/.test(moOverride || '') ? moOverride : prev;
    return await sendStatement(env, periodOverride || 'month', anchor);
  }
  if (+today.slice(8) !== 1) return { skipped: 'not the 1st' };
  const cfg = safeJson(await getSetting(env, 'monthlyReportSent'), {}) || {};
  const out = [];
  const once = async (key, period, anchor) => {
    if (cfg[key]) return;
    const res = await sendStatement(env, period, anchor);
    out.push(res);
    if (res.sent) { cfg[key] = today; await putSetting(env, 'monthlyReportSent', JSON.stringify(cfg)); }
  };
  await once(prev, 'month', prev);
  // a quarter ends in Mar/Jun/Sep/Dec — the month that just finished
  if ([3, 6, 9, 12].includes(+prev.slice(5, 7))) await once('q:' + prev, 'quarter', prev);
  if (+prev.slice(5, 7) === 12) await once('y:' + prev.slice(0, 4), 'year', prev);
  return out.length ? { sent: out } : { skipped: 'already sent' };
}

/* Month-end receipt sweep: two Slack nudges per month cycle — the 28th about
 * the closing month, the 2nd–4th about the one just ended — never daily spam.
 * Each missing expense carries a "No receipt — that's fine" button, which sets
 * receipt_skip so the item stops being counted and chased. */
async function receiptNudge(env, force = false, moOverride = null) {
  if (!env.SLACK_BOT_TOKEN) return { skipped: 'no SLACK_BOT_TOKEN' };
  const today = centralDate(Date.now() / 1000);
  const day = +today.slice(8);
  let mo = null, phase = null;
  if (day >= 28) { mo = monthOf(today); phase = 'pre'; }
  else if (day >= 2 && day <= 4) { mo = monthOf(addMonthsYmd(today, -1)); phase = 'post'; }
  if (force) { mo = /^\d{4}-\d{2}$/.test(moOverride || '') ? moOverride : (mo || monthOf(today)); phase = 'forced'; }
  if (!mo) return { skipped: 'not a nudge day' };
  if ((await monthStatus(env, mo)) === 'closed') return { skipped: mo + ' already closed' };
  const cfg = safeJson(await getSetting(env, 'receiptNudge'), {}) || {};
  if (!force && cfg[mo + ':' + phase]) return { skipped: 'already sent' };
  /* Carry each vendor's billing link along: the ones that never email an
   * invoice are the ones that cost him a hunt, so the link travels with the
   * nudge rather than living somewhere he has to go and look for it. */
  const { results } = await env.DB.prepare(`SELECT t.id, t.vendor, t.amount, t.date, v.billing_url
    FROM transactions t LEFT JOIN vendors v ON v.name = t.vendor
    WHERE t.month = ?1 AND t.type = 'out' AND t.expected = 0
      AND t.receipt_key IS NULL AND t.receipt_skip = 0
    ORDER BY (v.billing_url IS NULL), ABS(t.amount) DESC`).bind(mo).all();
  if (!results.length) return { skipped: 'nothing missing' };
  const sr = safeJson(await getSetting(env, 'slackReceipts'), {}) || {};
  if (!sr.channelId) return { skipped: 'no #receipts channel yet' };
  const withLink = results.filter(t => t.billing_url);
  const noLink = results.filter(t => !t.billing_url);
  const blocks = [{ type: 'section', text: { type: 'mrkdwn',
    text: `📎 *${moLabel(mo)}: ${results.length} expense${results.length > 1 ? 's' : ''} still missing a receipt.*\n` +
          `Drop a photo or forward the invoice email here — it attaches itself. None exists? One tap and it stops counting.` } }];
  const line = t => ({
    type: 'section',
    text: { type: 'mrkdwn', text: `*${t.vendor}* — $${Math.abs(t.amount).toFixed(2)}  ·  ${t.date}` +
      (t.billing_url ? `\n<${t.billing_url}|Open billing page →>` : '') },
    accessory: { type: 'button', action_id: 'skip' + t.id,
      text: { type: 'plain_text', text: "No receipt — that's fine" },
      value: JSON.stringify({ skip: t.id }) } });
  if (withLink.length) {
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn',
      text: `*Download these yourself* — they never email an invoice. The link goes straight to their billing page.` }] });
    for (const t of withLink.slice(0, 8)) blocks.push(line(t));
  }
  if (noLink.length) {
    blocks.push({ type: 'divider' });
    if (withLink.length) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn',
      text: `*Everything else still missing a receipt*` }] });
    for (const t of noLink.slice(0, 8)) blocks.push(line(t));
  }
  const shown = Math.min(withLink.length, 8) + Math.min(noLink.length, 8);
  if (results.length > shown) blocks.push({ type: 'context',
    elements: [{ type: 'mrkdwn', text: `…and ${results.length - shown} more — the Receipts tab in the app has the full list.` }] });
  const r = await slack(env, 'chat.postMessage',
    { channel: sr.channelId, text: `${moLabel(mo)}: missing receipts`, blocks, unfurl_links: false }, true);
  if (r.ok && !force) { cfg[mo + ':' + phase] = today; await putSetting(env, 'receiptNudge', JSON.stringify(cfg)); }
  return { month: mo, missing: results.length, sent: !!r.ok, error: r.error };
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const moLabel = m => `${MONTH_NAMES[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;

/* Plaid's end_date is INCLUSIVE, and every date range in this file is
 * half-open (to = the first day NOT wanted). Without this the last day of a
 * month is read twice, once at the end of the month and again at the start of
 * the next · which is how a $60 haircut on July 1st appeared in both June's
 * and July's statement. */
const addDaysYmd = (ymd, n) => {
  const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const plaidEnd = ymd => addDaysYmd(ymd, -1);
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

/* Money moving between Cole's OWN accounts — the double-count guard: the Amex
 * payment out of Novo, Stripe payouts landing, the personal/savings draws.
 *
 * This must stay narrow. A transfer is excluded from every report, so calling
 * something a transfer makes it VANISH — whereas mis-calling a transfer an
 * expense merely puts a visible row in Review. Fail toward visible.
 *
 * The bug this replaces: trusting Plaid's primary category TRANSFER_OUT, which
 * also covers Zelle/ACH to a person. Every contractor payment — Ahsan, Radhesh,
 * Hamza, WorldRemit — was filed as a transfer and silently dropped out of the
 * P&L: about $19K over two months, i.e. profit overstated by the same. Plaid's
 * DETAILED category is the one that separates "my other account" from
 * "somebody else". */
const SELF_TRANSFER_DETAIL = new Set([
  'TRANSFER_OUT_ACCOUNT_TRANSFER', 'TRANSFER_IN_ACCOUNT_TRANSFER',
  'TRANSFER_OUT_SAVINGS', 'TRANSFER_IN_SAVINGS',
  'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS', 'TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS',
]);
/* Services whose entire purpose is sending money to ANOTHER PERSON. Plaid
 * files them under the same TRANSFER_OUT detail as moving cash between your own
 * accounts, and the difference is the whole ball game: a self-move is invisible
 * to the P&L, a payment to a contractor is a deduction. Never self. */
const NEVER_SELF = /(worldremit|western union|remitly|moneygram|xoom|payoneer|wise\b|transferwise)/;
function looksLikeTransfer(name, pfc, selfAccounts = []) {
  const n = (name || '').toLowerCase();
  if (NEVER_SELF.test(n)) return false;
  if (/(amex|american express)/.test(n) && /(pay|epay|autopay|pmt)/.test(n)) return true;
  if (/autopay payment/.test(n)) return true;
  if (/stripe/.test(n)) return true;
  if (/^(transfer|xfer|online transfer|withdrawal to|deposit from)/.test(n)) return true;
  /* Accounts Cole has told us are his own — "Joint" is his joint account, not
   * The Joint Chiropractic, so these match the WHOLE name rather than appearing
   * anywhere in it. Maintained as a setting, not in code, so naming a new one
   * is something he can do from the app. */
  if (selfAccounts.some(a => a && n === String(a).toLowerCase().trim())) return true;
  const p = pfc?.primary || '', d = pfc?.detailed || '';
  if (p === 'LOAN_PAYMENTS') return true;          // paying a card balance
  return SELF_TRANSFER_DETAIL.has(d);
}

/**
 * One Plaid transaction → the ledger, reconcile-first:
 *   1. an EXPECTED row for the same vendor/amount confirms itself (the engine's
 *      guess meets the real bank line);
 *   2. an existing manual/receipt row with the same amount adopts the plaid_id
 *      instead of duplicating;
 *   3. otherwise it inserts through the vendor rules (unknown → Review).
 */
async function processPlaidTxn(env, item, t, opts = {}) {
  if (t.pending) return 'pending';
  /* Idempotency first. Plaid re-delivers a transaction whenever the cursor did
   * not advance — which is exactly what happens after any mid-page failure. On
   * that second delivery the reconcile steps below would match some OTHER row
   * and try to give it a plaid_id another row already holds, which violates the
   * unique index, aborts the sync, and strands the cursor again: a loop that
   * never clears itself. Seen one already: it is why nothing synced. */
  const seen = await env.DB.prepare('SELECT id FROM transactions WHERE plaid_id = ?1')
    .bind(t.transaction_id).first();
  if (seen) return 'duplicate';
  const date = t.date, month = monthOf(date);
  /* plaidStart exists so a routine sync never reaches back into the months
   * that were typed from statements. A deliberate whole-year import is the one
   * caller allowed past it, because reaching back is the entire point. */
  const start = opts.ignoreStart ? null : await getSetting(env, 'plaidStart');
  if (start && date < start) return 'before-start';
  if (!opts.allowClosed && (await monthStatus(env, month)) === 'closed')
    return { skip: 'closed', id: t.transaction_id, month, date,
             vendor: String(t.merchant_name || t.name || 'Unknown').slice(0, 60),
             amount: round2(t.amount) };

  const acctType = item.accounts?.[t.account_id]?.type || 'depository';
  const rawName = t.merchant_name || t.name || 'Unknown';
  const vendor = String(rawName).replace(/\s+/g, ' ').trim().slice(0, 120);
  const amt = round2(t.amount); // Plaid: positive = money OUT, negative = money IN

  const selfAccounts = safeJson(await getSetting(env, 'selfAccounts'), []) || [];
  /* A rule is a human saying what this merchant IS, and it outranks any guess
   * about what it looks like. Without this, Plaid tagging an ACH to a
   * contractor as TRANSFER_OUT_ACCOUNT_TRANSFER silently deletes that payment
   * from the P&L, and a rule saying "Radhesh Gowd is contract labour" cannot
   * save it, because the transfer branch decides before any rule is read. It
   * happened once at $19K and again at $46K. */
  const known = await findRule(env, vendor);
  let type, amount, status = 'ok', note = null;
  if (!known && looksLikeTransfer(rawName, t.personal_finance_category, selfAccounts)) {
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
    /* Name first. The amount-only fallback exists for bank gibberish like
     * "SQSP* WORKSP" meeting an expected "Google Workspace" — but Cole runs
     * three different $15 subscriptions, so amount alone is only trusted when
     * exactly ONE expected row carries it. Ambiguous → insert normally and
     * let the expected row wait for its real charge. */
    const amtHits = exp.filter(x => Math.abs(x.amount - amount) < 0.005);
    const eHit = exp.find(x => x.vendor.toLowerCase().split(' ')[0] === first
        || x.vendor.toLowerCase().includes(first) || first.includes(x.vendor.toLowerCase().split(' ')[0]))
      || (amtHits.length === 1 ? amtHits[0] : null);
    if (eHit) {
      await env.DB.prepare(`UPDATE transactions SET amount=?2, date=?3, expected=0, status='ok', plaid_id=?4 WHERE id=?1`)
        .bind(eHit.id, amount, date, t.transaction_id).run();
      return 'confirmed-expected';
    }
    // 2) adopt an existing manual row (same month, amount to the cent)
    const { results: cand } = await env.DB.prepare(
      `SELECT * FROM transactions WHERE month = ?1 AND type = 'out' AND expected = 0 AND plaid_id IS NULL
       AND ABS(amount - ?2) < 0.005`).bind(month, amount).all();
    const mHit = cand.find(x => x.vendor.toLowerCase().split(' ')[0] === first) || (cand.length === 1 ? cand[0] : null);
    if (mHit) {
      /* Take the bank's date too. The row being adopted was typed by hand and
       * is usually dated the 1st; the statement knows the day it really was,
       * and a CPA reads dates. Same month either way, so nothing moves out of
       * a period by doing this. */
      await env.DB.prepare(`UPDATE transactions SET plaid_id=?2, date=?3 WHERE id=?1`)
        .bind(mHit.id, t.transaction_id, date).run();
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

/* A receipt often arrives before its charge does · the bank feed runs
 * overnight, so anything bought today is filed against nothing. Rather than
 * making Cole answer a question the system will be able to answer itself
 * tomorrow, those receipts are HELD, and this sweeps them after every sync:
 * any that now match an unreceipted charge attach themselves and say so. */
async function retryHeldReceipts(env) {
  const { results: held } = await env.DB.prepare(
    `SELECT key, value FROM settings WHERE key LIKE 'pend:%'`).all();
  if (!held.length) return { held: 0 };
  const sr = safeJson(await getSetting(env, 'slackReceipts'), {}) || {};
  let attached = 0, asked = 0;
  for (const row of held) {
    const meta = safeJson(row.value, null);
    if (!meta || !meta.amount) continue;
    const hit = await env.DB.prepare(
      `SELECT * FROM transactions WHERE type='out' AND expected=0 AND receipt_key IS NULL
       AND ABS(amount - ?1) < 0.005 AND ABS(julianday(date) - julianday(?2)) <= 12
       ORDER BY ABS(julianday(date) - julianday(?2)) LIMIT 2`).bind(meta.amount, meta.date).all();
    /* THE NAME MUST AGREE. Nobody is watching this sweep, so "there is only
     * one charge at that amount" is not good enough: an Anthropic receipt for
     * $90 met an OpenAI charge for $90 and filed itself there. A held receipt
     * waits for its own vendor, however long that takes. */
    const norm = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const rv = norm(meta.vendor), first = rv.split(' ').filter(Boolean)[0] || '';
    const agrees = t => {
      const tv = norm(t.vendor); if (!first || !tv) return false;
      const tf = tv.split(' ')[0];
      return tv.includes(first) || rv.includes(tf);
    };
    const match = hit.results.find(agrees) || null;
    if (!match) {
      /* Waiting is fine for a few days; waiting forever in silence is not.
       * The key carries its own creation time, so after a week without the
       * charge appearing this stops being "the feed is behind" and becomes
       * something only Cole can answer · asked once, never on repeat. */
      const bornMs = Number(String(row.key).split(':')[1]);
      const days = Number.isFinite(bornMs) ? (Date.now() - bornMs) / 86400e3 : 0;
      if (days >= 5 && !meta.asked && (meta.ch || sr.channelId)) {
        meta.asked = 1;
        await putSetting(env, row.key, JSON.stringify(meta));
        const at = await ownerMention(env);
        const txt = `${at}\u23f3 *${meta.vendor}* $${Number(meta.amount).toFixed(2)} from ${meta.date} has been waiting ${Math.floor(days)} days and still matches no charge on Novo or Amex.\n` +
          `That usually means it went on a different card, or it is somebody else's charge. It stops waiting now · tell me which:`;
        await slack(env, 'chat.postMessage', { channel: meta.ch || sr.channelId,
          ...(meta.ts ? { thread_ts: meta.ts } : {}), text: txt, unfurl_links: false,
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: txt } },
            { type: 'actions', elements: [
              { type: 'button', action_id: 'led_file', style: 'primary',
                text: { type: 'plain_text', text: 'It is mine · file it' },
                value: JSON.stringify({ file: row.key }) },
              { type: 'button', action_id: 'led_drop',
                text: { type: 'plain_text', text: 'Not mine · discard' },
                value: JSON.stringify({ drop: row.key }) }] }] }, true).catch(() => {});
        asked++;
      }
      continue;
    }
    const blob = await receiptGet(env, row.key);
    if (!blob) {   // the 30-day blob expired · drop the orphaned note
      await env.DB.prepare('DELETE FROM settings WHERE key = ?1').bind(row.key).run();
      continue;
    }
    const k = `rcpt:${match.id}:${Date.now()}`;
    await receiptPut(env, k, blob);
    await env.DB.prepare('UPDATE transactions SET receipt_key=?2, receipt_name=?3, receipt_type=?4, receipt_hash=?5 WHERE id=?1')
      .bind(match.id, k, meta.name, meta.type, await sha256bytes(blob)).run();
    await receiptDelete(env, row.key);
    await env.DB.prepare('DELETE FROM settings WHERE key = ?1').bind(row.key).run();
    attached++;
    if (meta.ch || sr.channelId) await slack(env, 'chat.postMessage',
      { channel: meta.ch || sr.channelId, ...(meta.ts ? { thread_ts: meta.ts } : {}), unfurl_links: false,
      text: `\u2705 The ${meta.vendor} charge landed · that receipt you sent is attached to *${match.vendor}* $${Math.abs(match.amount).toFixed(2)} (${match.date}).` }, true).catch(() => {});
  }
  return { held: held.length, attached, asked };
}

/* THE SAFETY NET. /transactions/sync is a cursor: it hands over what changed
 * since last time and then moves on forever. Anything that failed mid-page,
 * or was refused while a month was closed, is never offered again · the money
 * is simply gone from the books with nothing to show it was ever there. A
 * $60 haircut on the Business Gold went missing exactly that way.
 *
 * /transactions/get takes a date range instead, so it can always be asked
 * again. This re-reads a window and inserts anything the ledger does not
 * already hold (plaid_id is the unique key, so re-running is free), which
 * makes every month auditable against the bank rather than merely hopeful. */
/* The bank is re-read every night now, so a charge that belongs to a closed
 * month would otherwise be re-announced every night until he acts · a nightly
 * repeat of the same warning is how a warning stops being read. Each one is
 * named once, and the ids already named are remembered. */
async function announceDropped(env, dropped) {
  if (!dropped.length) return 0;
  const seen = safeJson(await getSetting(env, 'droppedAnnounced'), []);
  const fresh = dropped.filter(d => d.id && !seen.includes(d.id));
  if (!fresh.length) return 0;
  const lines = fresh.slice(0, 8).map(d => `\u2022 *${d.vendor}* $${Math.abs(d.amount).toFixed(2)} \u00b7 ${d.date}`).join('\n');
  await alertSlack(env, `\u26a0\ufe0f *${fresh.length} charge${fresh.length > 1 ? 's belong' : ' belongs'} to a month that is already closed*, so ${fresh.length > 1 ? 'they were' : 'it was'} not added:\n${lines}` +
    (fresh.length > 8 ? `\n_\u2026and ${fresh.length - 8} more._` : '') +
    `\n\nReopen ${moLabel(fresh[0].month)} in the app, press Re-check the bank, then close it again.`).catch(() => {});
  await putSetting(env, 'droppedAnnounced', JSON.stringify(seen.concat(fresh.map(d => d.id)).slice(-400)));
  return fresh.length;
}

/* PROVE a range against the bank without touching it. backfillPlaid inserts
 * what is missing, which is right for the months the feed owns (August on) and
 * catastrophic for the months it does not: January to July were typed from
 * statements before the bank was connected, so those ledger rows carry no
 * plaid_id and nothing would dedupe against them · a backfill there would file
 * a second copy of the whole year. plaidStart already refuses them, but the
 * question "does the bank agree with what I typed?" still deserves an answer.
 *
 * So this reads and reports, and writes nothing at all. Matching is per MONTH
 * and per amount, never per day, because the hand-entered rows were dated the
 * 1st regardless of when the charge actually posted. Each bank charge consumes
 * one ledger row, so two identical charges need two rows to match. */
/* Read a whole range from the bank ONCE and make the books agree with it.
 *
 * The nightly sync is deliberately narrow: it never looks before plaidStart and
 * never writes into a closed month. Both rules are right for a nightly job and
 * both are wrong for the job of making a tax year true, which is what this is.
 *
 * The trap it exists to avoid: Plaid fixes an Item's history window at LINK
 * time, so widening it means linking again, and a new Item issues brand new
 * transaction ids for charges the ledger already holds. Left alone, every
 * August and September row would arrive a second time under a new id and the
 * year would double. So before anything is inserted, any row whose plaid_id
 * does NOT appear in the statement now in hand is treated as a row from the
 * retired Item and MIGRATED onto its new id · same charge, same row, new name.
 */
async function importPlaidRange(env, fromYmd, toYmd, opts = {}) {
  if (!plaidReady(env)) return { skipped: 'no Plaid keys' };
  const items = await getPlaidItems(env);
  if (!items.length) return { skipped: 'no connected accounts' };

  const statement = [];
  for (const item of items) {
    let offset = 0, total = 1;
    while (offset < total) {
      const page = await plaid(env, '/transactions/get', {
        access_token: item.access_token, start_date: fromYmd, end_date: plaidEnd(toYmd),
        options: { count: 500, offset },
      });
      total = page.total_transactions || 0;
      const got = page.transactions || [];
      for (const t of got) if (!t.pending) statement.push({ item, t });
      offset += got.length;
      if (!got.length) break;
    }
  }
  if (!statement.length) return { ok: true, from: fromYmd, to: toYmd, bankCount: 0, note: 'the bank returned nothing for this range' };

  const ids = new Set(statement.map(x => x.t.transaction_id));
  const first = v => String(v || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(' ')[0];

  /* THE SAME CHARGE TWICE, ONCE PER BANK CONNECTION. Migration renames a row
   * onto the id the bank uses now, and cannot when that id already sits on
   * another row: the unique index refuses and the pair stands as two copies of
   * one charge. That is money counted twice, which this app exists not to do.
   *
   * What identifies a copy is NOT the merchant name · one connection says
   * "Viktor" and the next says "VIKTOR.COM", one says "Noma (via WorldRemit)"
   * and the next just "WorldRemit". It is the id: a row whose plaid_id is
   * absent from the statement came from a connection the bank has retired, so
   * that charge is no longer being reported under that name. Pair each retired
   * row with one live row of the same day, amount and direction, and they are
   * the same charge. Pairing is one to one, so two genuine same-day charges of
   * the same amount survive as two.
   *
   * The survivor is the retired row · it is the one carrying the receipt and
   * the categories somebody chose · and it takes the id the bank uses now. */
  const collapsed = [];
  {
    const { results: mine } = await env.DB.prepare(
      `SELECT id, date, type, vendor, amount, plaid_id, receipt_key FROM transactions
        WHERE date >= ?1 AND date < ?2 AND plaid_id IS NOT NULL ORDER BY id`).bind(fromYmd, toYmd).all();
    const groups = new Map();
    for (const r of mine) {
      const k = `${r.date}|${r.type}|${round2(r.amount).toFixed(2)}`;
      (groups.get(k) || groups.set(k, []).get(k)).push(r);
    }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const stale = g.filter(r => !ids.has(r.plaid_id));
      const live = g.filter(r => ids.has(r.plaid_id));
      const pairs = Math.min(stale.length, live.length);
      for (let i = 0; i < pairs; i++) {
        /* Keep whichever of the two actually holds a receipt, else the retired
         * row, which is the older and better-annotated of the pair. */
        const a = stale[i], b = live[i];
        const keep = a.receipt_key ? a : (b.receipt_key ? b : a);
        const drop = keep === a ? b : a;
        const liveId = b.plaid_id;
        await env.DB.prepare('DELETE FROM transactions WHERE id = ?1').bind(drop.id).run();
        if (keep.plaid_id !== liveId)
          await env.DB.prepare('UPDATE transactions SET plaid_id = ?2 WHERE id = ?1').bind(keep.id, liveId).run();
        collapsed.push({ removed: drop.id, kept: keep.id, date: keep.date,
                         vendor: keep.vendor, amount: keep.amount });
      }
    }
  }

  /* Rows the bank once told us about under a name it no longer uses. */
  const { results: orphans } = await env.DB.prepare(
    `SELECT id, date, vendor, amount, plaid_id FROM transactions
      WHERE date >= ?1 AND date < ?2 AND plaid_id IS NOT NULL`).bind(fromYmd, toYmd).all();
  const pool = orphans.filter(r => !ids.has(r.plaid_id));

  const totals = {}, migrated = [], dropped = [];
  for (const { item, t } of statement) {
    try {
      const amt = Math.abs(round2(t.amount));
      const name = first(t.merchant_name || t.name);
      const i = pool.findIndex(r => r.date === t.date && Math.abs(Math.abs(r.amount) - amt) < 0.005
                                    && first(r.vendor) === name);
      if (i >= 0) {
        const row = pool.splice(i, 1)[0];
        await env.DB.prepare('UPDATE transactions SET plaid_id = ?2 WHERE id = ?1')
          .bind(row.id, t.transaction_id).run();
        totals.migrated = (totals.migrated || 0) + 1;
        migrated.push({ id: row.id, date: row.date, vendor: row.vendor, amount: row.amount });
        continue;
      }
      const out = await processPlaidTxn(env, item, t, opts);
      if (out && out.skip === 'closed') { dropped.push(out); totals.closed = (totals.closed || 0) + 1; continue; }
      totals[out] = (totals[out] || 0) + 1;
    } catch (e) {
      totals.failed = (totals.failed || 0) + 1;
      totals.lastError = `${t.name || t.transaction_id}: ${String(e.message || e).slice(0, 140)}`;
    }
  }
  await announceDropped(env, dropped);

  /* THE COVERAGE LINE. A bank hands over a fixed window of history, so the
   * earliest line it returned is the earliest line it HAS. A month that starts
   * before that date is only partly known, and treating a partial month as the
   * truth would delete the half the bank cannot see. Whole months only. */
  const earliest = statement.reduce((a, x) => (!a || x.t.date < a) ? x.t.date : a, null);
  const latest   = statement.reduce((a, x) => (!a || x.t.date > a) ? x.t.date : a, null);
  const replaced = [];
  if (opts.replace) {
    for (let ym = monthOf(fromYmd); ym < monthOf(toYmd); ym = monthOf(addMonthsYmd(ym + '-01', 1))) {
      if (ym + '-01' < earliest) continue;                       // starts before the bank remembers
      /* AND it has to be OVER. In a month still running, the bank's silence
       * about a charge means nothing · the charge may simply not have happened
       * yet. Replacing the current month deleted a $295 card fee and a $500
       * invoice that were perfectly real and merely still to come. */
      if (addDaysYmd(addMonthsYmd(ym + '-01', 1), -1) > latest) continue;
      if (!statement.some(x => monthOf(x.t.date) === ym)) continue; // the bank had nothing to say

      /* Only hand-typed EXPENSES go. Revenue and merchant fees are booked
       * gross per client while the bank only ever sees a net Stripe payout, so
       * deleting those would destroy the one basis a CPA can use. */
      const { results: gone } = await env.DB.prepare(
        `SELECT id, date, vendor, amount FROM transactions
          WHERE month = ?1 AND type = 'out' AND plaid_id IS NULL AND expected = 0`).bind(ym).all();
      if (!gone.length) continue;
      await env.DB.prepare(
        `DELETE FROM transactions
          WHERE month = ?1 AND type = 'out' AND plaid_id IS NULL AND expected = 0`).bind(ym).run();
      for (const g of gone) replaced.push({ month: ym, ...g });
    }
  }

  /* What the books claim and the bank never mentioned. Deleting these would be
   * overreach · cash, an unlinked card and a hand-booked payout all look the
   * same from here · so they are named and left alone. */
  const { results: leftovers } = await env.DB.prepare(
    `SELECT id, date, type, vendor, amount, COALESCE(bucket,'') AS bucket
       FROM transactions WHERE date >= ?1 AND date < ?2 AND plaid_id IS NULL AND expected = 0
       ORDER BY date, vendor`).bind(fromYmd, toYmd).all();

  return {
    ok: true, from: fromYmd, to: toYmd, bankCount: statement.length,
    bankHistoryFrom: earliest,
    collapsedDuplicates: collapsed.length, collapsedRows: collapsed.slice(0, 50),
    ...totals, migratedRows: migrated.slice(0, 50),
    replacedCount: replaced.length, replacedRows: replaced.slice(0, 200),
    notOnBank: leftovers.length, notOnBankRows: leftovers.slice(0, 200),
  };
}

async function comparePlaid(env, fromYmd, toYmd, full) {
  if (!plaidReady(env)) return { skipped: 'no Plaid keys' };
  const items = await getPlaidItems(env);
  if (!items.length) return { skipped: 'no connected accounts' };

  const bank = [];
  for (const item of items) {
    let offset = 0, total = 1;
    while (offset < total) {
      const page = await plaid(env, '/transactions/get', {
        access_token: item.access_token, start_date: fromYmd, end_date: plaidEnd(toYmd),
        options: { count: 500, offset },
      });
      total = page.total_transactions || 0;
      const got = page.transactions || [];
      for (const t of got) {
        if (t.pending) continue;
        bank.push({ id: t.transaction_id, date: t.date, month: monthOf(t.date),
                    vendor: String(t.merchant_name || t.name || 'Unknown').slice(0, 60),
                    amount: round2(t.amount),
                    account: item.accounts?.[t.account_id]?.name || item.name || '' });
      }
      offset += got.length;
      if (!got.length) break;
    }
  }

  const rows = (await env.DB.prepare(
    `SELECT id, date, month, type, vendor, amount, plaid_id
       FROM transactions WHERE date >= ?1 AND date < ?2`).bind(fromYmd, toYmd).all()).results || [];

  /* A ledger row can only answer for one bank charge. */
  const used = new Set();
  const claim = (mo, amt) => {
    const hit = rows.find(r => !used.has(r.id) && r.month === mo &&
      Math.abs(Math.abs(r.amount) - Math.abs(amt)) < 0.005);
    if (hit) { used.add(hit.id); return hit; }
    return null;
  };

  const byId = new Map(rows.filter(r => r.plaid_id).map(r => [r.plaid_id, r]));
  const missing = [], byMonth = {};
  for (const b of bank) {
    const m = byMonth[b.month] || (byMonth[b.month] = { bank: 0, matched: 0, missing: 0 });
    m.bank++;
    const exact = byId.get(b.id);
    if (exact && !used.has(exact.id)) { used.add(exact.id); m.matched++; continue; }
    if (claim(b.month, b.amount)) { m.matched++; continue; }
    m.missing++;
    missing.push(b);
  }

  /* The other direction: rows he typed that the bank never reported. Some are
   * legitimate (cash, a card that is not linked, a Stripe payout booked by
   * hand) · this names them rather than judging them. */
  const unmatchedRows = rows.filter(r => !used.has(r.id))
    .map(r => ({ id: r.id, date: r.date, vendor: r.vendor, amount: r.amount, type: r.type }));

  /* Months the bank returned nothing for are NOT months that agree · they are
   * months the bank has no data for, which is a different answer entirely. */
  const noData = [];
  for (let ym = monthOf(fromYmd); ym < monthOf(toYmd); ym = monthOf(addMonthsYmd(ym + '-01', 1)))
    if (!byMonth[ym]) noData.push(ym);

  return {
    ok: true, readOnly: true, from: fromYmd, to: toYmd,
    bankCount: bank.length, ledgerCount: rows.length,
    onBankNotInBooks: missing.length, inBooksNotOnBank: unmatchedRows.length,
    noBankData: noData, byMonth,
    missing: missing.slice(0, 100), extra: unmatchedRows.slice(0, 100),
    /* The statement itself, when the question is "what does the bank actually
     * say" rather than "where do we disagree". */
    ...(full ? { bank } : {}),
  };
}

async function backfillPlaid(env, fromYmd, toYmd) {
  if (!plaidReady(env)) return { skipped: 'no Plaid keys' };
  const items = await getPlaidItems(env);
  if (!items.length) return { skipped: 'no connected accounts' };
  const totals = {}, recovered = [], dropped = [];
  for (const item of items) {
    let offset = 0, total = 1;
    while (offset < total) {
      const page = await plaid(env, '/transactions/get', {
        access_token: item.access_token, start_date: fromYmd, end_date: plaidEnd(toYmd),
        options: { count: 500, offset },
      });
      total = page.total_transactions || 0;
      for (const t of page.transactions || []) {
        try {
          const out = await processPlaidTxn(env, item, t);
          if (out && out.skip === 'closed') { dropped.push(out); totals.closed = (totals.closed || 0) + 1; continue; }
          totals[out] = (totals[out] || 0) + 1;
          if (out === 'added' || out === 'added-review')
            recovered.push({ date: t.date, vendor: String(t.merchant_name || t.name || '?').slice(0, 60), amount: round2(t.amount) });
        } catch (e) {
          totals.failed = (totals.failed || 0) + 1;
          totals.lastError = `${t.name || t.transaction_id}: ${String(e.message || e).slice(0, 120)}`;
        }
      }
      offset += (page.transactions || []).length;
      if (!(page.transactions || []).length) break;
    }
  }
  if (recovered.length) {
    const lines = recovered.slice(0, 10).map(r => `\u2022 *${r.vendor}* $${Math.abs(r.amount).toFixed(2)} \u00b7 ${r.date}`).join('\n');
    await alertSlack(env, `\u2757 *Recovered ${recovered.length} charge${recovered.length > 1 ? 's' : ''} the bank feed had missed* (${fromYmd} to ${toYmd}):\n${lines}` +
      (recovered.length > 10 ? `\n_\u2026and ${recovered.length - 10} more._` : '') +
      `\n\nThey are in the ledger now · anything uncategorised is waiting in Needs you.`).catch(() => {});
  }
  await announceDropped(env, dropped);
  return { ok: true, from: fromYmd, to: toYmd, recovered: recovered.length, closedSkipped: dropped.length, ...totals };
}

async function syncPlaid(env) {
  if (!plaidReady(env)) return { skipped: 'no Plaid keys' };
  const items = await getPlaidItems(env);
  if (!items.length) return { skipped: 'no connected accounts' };
  const totals = {};
  /* Charges the bank reported for a month whose report is already frozen.
   * Dropping these silently is how a closed month quietly stops being true,
   * so every one of them is named and he decides. */
  const dropped = [];
  for (const item of items) {
    let hasMore = true;
    while (hasMore) {
      const page = await plaid(env, '/transactions/sync',
        { access_token: item.access_token, cursor: item.cursor || undefined, count: 250 });
      for (const t of page.added) {
        // One unhappy transaction must not cost us the whole page: throwing here
        // skips the cursor write below, so the next run re-fetches everything
        // and fails in the same place forever.
        try {
          const out = await processPlaidTxn(env, item, t);
          if (out && out.skip === 'closed') { dropped.push(out); totals.closed = (totals.closed || 0) + 1; }
          else totals[out] = (totals[out] || 0) + 1;
        } catch (e) {
          /* The cursor moves on regardless, so this transaction will never be
           * offered again · say so loudly, and name the fix. */
          totals.failed = (totals.failed || 0) + 1;
          totals.lastError = `${t.name || t.transaction_id}: ${String(e.message || e).slice(0, 120)}`;
          console.log('plaid txn failed: ' + totals.lastError);
          await alertSlack(env, `\u26a0\ufe0f *A bank transaction could not be filed and the feed has moved past it:*\n` +
            `\u2022 *${String(t.merchant_name || t.name || '?').slice(0, 60)}* $${Math.abs(round2(t.amount)).toFixed(2)} \u00b7 ${t.date}\n` +
            `${String(e.message || e).slice(0, 140)}\n\nSettings \u2192 Re-check the bank for that month will pull it back in.`).catch(() => {});
        }
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
  await announceDropped(env, dropped);
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
      // ORDER MATTERS on the 1st: the statement must be computed from a ledger
      // the syncs have already finished writing, so these run in sequence, not
      // as three concurrent waitUntils racing each other.
      ctx.waitUntil((async () => {
        /* A sync that quietly fails is the worst failure this app can have:
         * the books look finished while money is missing from them. Every
         * failure is announced in the channel, by name. */
        const failed = [];
        if (env.STRIPE_KEY)
          await syncStripe(env, from, to).catch(e => { failed.push('Stripe: ' + (e.message || e)); });
        await syncPlaid(env).catch(e => { failed.push('Bank feed: ' + (e.message || e)); });
        /* The cursor feed can lose a charge permanently (a $60 haircut went
         * that way). Re-reading the open books by date every night is the only
         * thing that catches it, and plaid_id dedupe makes the overlap free. */
        const bfFrom = addMonthsYmd(monthOf(to) + '-01', -1);
        await backfillPlaid(env, bfFrom, addDaysYmd(to, 1)).catch(e => { failed.push('Bank re-check: ' + (e.message || e)); });
        await retryHeldReceipts(env).catch(e => { failed.push('Held receipts: ' + (e.message || e)); });
        if (failed.length) await alertSlack(env,
          `\u26a0\ufe0f *Tonight's sync did not finish.* Your figures may be missing transactions until this is fixed.\n` +
          failed.map(f => '\u2022 ' + f).join('\n')).catch(() => {});
        await monthlyReportSlack(env).catch(e => console.log('monthly report failed: ' + e.message));
        await receiptNudge(env).catch(e => console.log('receipt nudge failed: ' + e.message));
      })());
    } else {
      // every 10 minutes: anything new dropped in Slack #receipts
      ctx.waitUntil(processSlackReceipts(env).catch(e => console.log('slack receipts failed: ' + e.message)));
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (path === '/health') return json({ ok: true });
    if (!path.startsWith('/api/')) return json({ error: 'not found' }, 404);

    /* Slack Events — the one route with no Bearer token: Slack calls it.
     * Its signature IS the credential (verifySlackSig), so it is checked
     * before anything else happens, including the setup handshake. */
    if (path === '/api/slack-events' && request.method === 'POST') {
      const raw = await request.text();
      const ok = await verifySlackSig(env, request.headers.get('x-slack-request-timestamp'),
        raw, request.headers.get('x-slack-signature'));
      if (!ok) return json({ error: 'bad signature' }, 401);
      const body = safeJson(raw, {}) || {};
      if (body.type === 'url_verification') return json({ challenge: body.challenge });
      // Slack retries anything it can't get an answer from in 3 seconds, so
      // acknowledge first and do the reading/filing after the response.
      const ev = body.event || {};
      if ((ev.files || []).length || ev.subtype === 'file_share')
        ctx.waitUntil(processSlackReceipts(env).catch(e => console.log('slack event: ' + e.message)));
      return json({ ok: true });
    }

    /* Google's OAuth redirect. Unauthenticated by necessity — a browser
     * redirect carries no Authorization header — so it is the `state` nonce
     * this worker issued moments earlier that proves the request is ours, and
     * it is single-use. */
    if (path === '/api/drive-callback' && request.method === 'GET') {
      const page = (title, body) => new Response(
        `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
        `<body style="font:16px/1.6 system-ui;max-width:34em;margin:16vh auto;padding:0 6vw;color:#12202b">` +
        `<h2 style="font-weight:600">${title}</h2><p style="color:#4a5b68">${body}</p></body>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      const code = url.searchParams.get('code'), state = url.searchParams.get('state');
      const want = safeJson(await getSetting(env, 'driveOauthState'), null);
      if (!want || !state || state !== want.state || Date.now() > want.expires)
        return page('That link has expired', 'Go back to Mobius Ledger and press Connect Google Drive again.');
      await env.DB.prepare('DELETE FROM settings WHERE key = ?1').bind('driveOauthState').run();
      try {
        const refresh = await driveExchangeCode(env, code, want.redirectUri);
        await putSetting(env, 'driveAuth', JSON.stringify({ refresh }));
        return page('Google Drive connected', 'You can close this tab and go back to Mobius Ledger.');
      } catch (e) {
        return page('That did not work', String(e.message || e));
      }
    }

    /* Slack interactivity — button taps and menu picks from the receipt
     * threads. Same signature check as events; the body is form-encoded with
     * the interaction JSON in `payload`. Must answer inside 3 seconds. */
    if (path === '/api/slack-interact' && request.method === 'POST') {
      const raw = await request.text();
      const ok = await verifySlackSig(env, request.headers.get('x-slack-request-timestamp'),
        raw, request.headers.get('x-slack-signature'));
      if (!ok) return json({ error: 'bad signature' }, 401);
      const payload = safeJson(new URLSearchParams(raw).get('payload'), {}) || {};
      /* One Slack app ("Mobius Digital") serves every Mobius tool, and Slack
       * allows a single interactivity URL — this worker is it. THREE tools now
       * answer behind it, so the payload has to be classified rather than
       * split in two:
       *   Ledger — a block action whose value carries {id, tax}, {skip} (the
       *            month-end "no receipt" button) or {undo} ("not a match")
       *   Locus  — the Daily Brief / Reports cards: every action_id and every
       *            modal callback_id is prefixed brief_ / report_ (plus the
       *            noop_open link buttons Slack reports anyway). Modal
       *            submissions carry NO actions array at all, which is why
       *            this cannot stay a block_actions-only test.
       *   Pulse  — everything else, which is what it was before.
       * Forwarding keeps the raw body and both signature headers, so each
       * worker verifies the signature itself against the same app secret. */
      const acts = payload.type === 'block_actions' ? (payload.actions || []) : [];
      const mine = acts.some(x => {
        // led_-prefixed ids are Ledger's link buttons — Slack reports the click
        // but nothing needs doing; claiming them keeps them off Pulse's desk
        if (/^led_/.test(x.action_id || '')) return true;
        const v = safeJson(x.selected_option?.value || x.value, null);
        return v && ((v.id !== undefined && v.tax !== undefined)
                     || v.skip !== undefined || v.undo !== undefined || v.file !== undefined);
      });
      const LOCUS_ID = /^(brief|report)_|^noop_open$/;
      const locus = !mine && (
        acts.some(x => LOCUS_ID.test(x.action_id || '')) ||
        (payload.type === 'view_submission' && LOCUS_ID.test(payload.view?.callback_id || '')));
      if (!mine) {
        const hand = (binding, target) => binding
          ? binding.fetch(new Request(target, {
            method: 'POST',
            headers: {
              'Content-Type': request.headers.get('content-type') || 'application/x-www-form-urlencoded',
              'x-slack-request-timestamp': request.headers.get('x-slack-request-timestamp') || '',
              'x-slack-signature': request.headers.get('x-slack-signature') || '',
            },
            body: raw }))
          // No binding is not an error worth showing a human: Slack renders any
          // non-200 as a red banner over the card. Stay quiet and drop it.
          : new Response('', { status: 200 });
        if (locus) return hand(env.AUTH, 'https://mobius-account-health.mobius-digital.workers.dev/slack/actions');
        return hand(env.PULSE, 'https://mobius-ad-status.mobius-digital.workers.dev/slack/interact');
      }
      if (payload.type === 'block_actions') {
        const a = (payload.actions || [])[0] || {};
        const val = safeJson(a.selected_option?.value || a.value, null);
        const respond = body => payload.response_url && ctx.waitUntil(fetch(payload.response_url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body) }).catch(() => {}));
        // month-end digest: "No receipt — that's fine" → stop counting/chasing it
        if (val?.skip) {
          const cur = await env.DB.prepare('SELECT * FROM transactions WHERE id = ?1').bind(Number(val.skip)).first();
          if (cur) {
            await env.DB.prepare('UPDATE transactions SET receipt_skip = 1 WHERE id = ?1').bind(cur.id).run();
            respond({ replace_original: false, response_type: 'in_channel',
              text: `✓ *${cur.vendor}* $${Math.abs(cur.amount).toFixed(2)} — marked "no receipt". It won't be counted or chased again.` });
          }
          return new Response('', { status: 200 });
        }
        // an emailed receipt we declined to guess at — he says it is his
        // "not mine" on a receipt that waited a week and never found its charge
        if (val?.drop) {
          await receiptDelete(env, val.drop).catch(() => {});
          await env.DB.prepare('DELETE FROM settings WHERE key = ?1').bind(val.drop).run();
          respond({ replace_original: true, text: '\u2713 Discarded · that receipt will not be asked about again.' });
          return new Response('', { status: 200 });
        }
        // an emailed receipt we declined to guess at · he says it is his
        if (val?.file) {
          const blob = await receiptGet(env, val.file);
          if (!meta || !blob) {
            respond({ replace_original: false, text: '⚠️ That one has expired — drop the receipt in again.' });
            return new Response('', { status: 200 });
          }
          /* "That one there" — the receipt's total did not match to the cent,
           * so it was offered against a near charge and he picked it. Attach
           * to that existing row; never create a second one beside it. */
          if (val.to) {
            const row = await env.DB.prepare('SELECT * FROM transactions WHERE id = ?1').bind(Number(val.to)).first();
            if (!row) {
              respond({ replace_original: false, text: '⚠️ That charge is gone — open the app and attach it there.' });
              return new Response('', { status: 200 });
            }
            const k = `rcpt:${row.id}:${Date.now()}`;
            await receiptPut(env, k, blob);
            await env.DB.prepare('UPDATE transactions SET receipt_key=?2, receipt_name=?3, receipt_type=?4, receipt_hash=?5 WHERE id=?1')
              .bind(row.id, k, meta.name, meta.type, await sha256bytes(blob)).run();
            await receiptDelete(env, val.file);
            await env.DB.prepare('DELETE FROM settings WHERE key = ?1').bind(val.file).run();
            respond({ replace_original: true,
              text: `✓ Attached to *${row.vendor}* $${row.amount.toFixed(2)} in *${moLabel(row.month)}*.` +
                    (Math.abs(row.amount - meta.amount) > 0.001
                      ? ` (Receipt said $${meta.amount.toFixed(2)} — the charge is what counts.)` : '') });
            return new Response('', { status: 200 });
          }
          if ((await monthStatus(env, meta.month)) === 'closed') {
            respond({ replace_original: false, text: `🔒 ${moLabel(meta.month)} is closed — reopen it in the app first.` });
            return new Response('', { status: 200 });
          }
          const row = await applyRule(env, {
            date: meta.date, month: meta.month, type: 'out', vendor: meta.vendor,
            amount: meta.amount, bucket: null, tax_cat: null, note: meta.note, status: 'ok',
          });
          if (row.status === 'review' && meta.tax_cat) {
            row.tax_cat = meta.tax_cat; row.bucket = bucketFor(meta.tax_cat); row.status = 'ok';
            await learnDefault(env, row.vendor, row.bucket, row.tax_cat);
          }
          const res = await env.DB.prepare(`INSERT INTO transactions
            (date, month, type, vendor, amount, bucket, tax_cat, note, status, source)
            VALUES (?1,?2,'out',?3,?4,?5,?6,?7,?8,'manual')`)
            .bind(row.date, row.month, row.vendor, row.amount, row.bucket, row.tax_cat, row.note, row.status).run();
          const key = `rcpt:${res.meta.last_row_id}:${Date.now()}`;
          await receiptPut(env, key, blob);
          await env.DB.prepare('UPDATE transactions SET receipt_key=?2, receipt_name=?3, receipt_type=?4, receipt_hash=?5 WHERE id=?1')
            .bind(res.meta.last_row_id, key, meta.name, meta.type, await sha256bytes(blob)).run();
          await receiptDelete(env, val.file);
          await env.DB.prepare('DELETE FROM settings WHERE key = ?1').bind(val.file).run();
          respond({ replace_original: true,
            text: `✓ Filed *${meta.vendor}* $${meta.amount.toFixed(2)} into *${moLabel(meta.month)}*` +
                  `${row.tax_cat ? ` as *${row.tax_cat}*` : ' — it needs a category in the app'}. Receipt attached.` });
          return new Response('', { status: 200 });
        }
        // matched-receipt reply: "Not a match ↩︎" → detach, receipt discarded
        if (val?.undo) {
          const cur = await env.DB.prepare('SELECT * FROM transactions WHERE id = ?1').bind(Number(val.undo)).first();
          if (cur) {
            if (cur.receipt_key) await receiptDelete(env, cur.receipt_key);
            await env.DB.prepare('UPDATE transactions SET receipt_key = NULL, receipt_name = NULL, receipt_type = NULL, receipt_hash = NULL WHERE id = ?1')
              .bind(cur.id).run();
            respond({ replace_original: true,
              text: `↩︎ Detached — *${cur.vendor}* $${Math.abs(cur.amount).toFixed(2)} is back to "no receipt". Fix the right row in the app first (amount/date), then drop the photo again and it'll land there.` });
          }
          return new Response('', { status: 200 });
        }
        if (val?.id && val?.tax) {
          const cur = await env.DB.prepare('SELECT * FROM transactions WHERE id = ?1').bind(Number(val.id)).first();
          if (cur) {
            const bucket = bucketFor(val.tax);
            await env.DB.prepare(`UPDATE transactions SET bucket = ?2, tax_cat = ?3, status = 'ok' WHERE id = ?1`)
              .bind(cur.id, bucket, String(val.tax)).run();
            if (cur.type === 'out') await learnDefault(env, cur.vendor, bucket, String(val.tax));
            if (payload.response_url) ctx.waitUntil(fetch(payload.response_url, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ replace_original: true,
                text: `✓ *${cur.vendor}* $${Math.abs(cur.amount).toFixed(2)} — *${val.tax}*. Remembered as this vendor's usual.` }),
            }).catch(() => {}));
          }
        }
      }
      return new Response('', { status: 200 });
    }

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
            SUM(CASE WHEN type = 'out' AND expected = 0 AND receipt_key IS NULL AND receipt_skip = 0 THEN 1 ELSE 0 END) AS noReceipt
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
          slackInstant: !!env.SLACK_SIGNING_SECRET,
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
            // the picker sends only a category; the dashboard group follows
            bucket: r.bucket || (r.tax_cat ? bucketFor(r.tax_cat) : null),
            tax_cat: r.tax_cat || null,
            note: r.note ? String(r.note).slice(0, 300) : null,
            one_time: r.one_time ? 1 : 0, expected: 0,
            status: r.status === 'review' ? 'review' : 'ok',
            source: ['manual', 'import'].includes(r.source) ? r.source : 'manual',
          });
          // every categorized purchase teaches the vendor's default — automatic,
          // so the same place never has to be categorized twice
          if (type === 'out' && row.bucket && row.tax_cat && row.status !== 'review')
            await learnDefault(env, row.vendor, row.bucket, row.tax_cat);
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
        if (b.receipt_skip !== undefined) next.receipt_skip = b.receipt_skip ? 1 : 0;
        /* "This was between my own accounts" — reclassify it, and remember the
         * name so the next one is caught by the sync instead of by Cole. */
        if (b.markSelfTransfer) {
          next.type = 'transfer'; next.bucket = 'Transfer';
          next.tax_cat = 'Transfer — not P&L'; next.status = 'ok';
          next.amount = Math.abs(next.amount);
          const self = safeJson(await getSetting(env, 'selfAccounts'), []) || [];
          if (!self.some(a => String(a).toLowerCase() === next.vendor.toLowerCase())) {
            self.push(next.vendor);
            await putSetting(env, 'selfAccounts', JSON.stringify(self.slice(0, 100)));
          }
        }
        // The row-level and Slack pickers send only a tax category — the bucket
        // that drives the dashboard is derived, so there is one thing to choose
        // rather than two that can disagree.
        if (b.tax_cat !== undefined && b.bucket === undefined && next.type === 'out')
          next.bucket = bucketFor(b.tax_cat);
        if (b.tax_cat && next.status === 'review') next.status = 'ok';
        if (b.confirm) { next.expected = 0; next.status = 'ok'; }
        if (!closed) {
          if (b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) {
            const nm = monthOf(b.date);
            // a date edit must not smuggle a row INTO a month whose report is frozen
            if (nm !== cur.month && (await monthStatus(env, nm)) === 'closed')
              return json({ error: `${nm} is closed — a transaction can't be moved into a frozen month. Reopen it first.` }, 400);
            next.date = b.date; next.month = nm;
          }
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
        if (cur.type === 'out' && next.status !== 'review' && next.bucket && next.tax_cat)
          await learnDefault(env, next.vendor, next.bucket, next.tax_cat);
        /* The app asks first and then calls the bulk route, so spreading a
         * category across a vendor's other rows is always something Cole said
         * yes to — never something that happened while he was looking away. */
        await env.DB.prepare(`UPDATE transactions SET date=?2, month=?3, vendor=?4, amount=?5, bucket=?6,
          tax_cat=?7, note=?8, one_time=?9, expected=?10, status=?11, receipt_skip=?12, type=?13 WHERE id=?1`)
          .bind(id, next.date, next.month, next.vendor, next.amount, next.bucket,
                next.tax_cat, next.note, next.one_time, next.expected, next.status,
                next.receipt_skip || 0, next.type).run();
        return json({ ok: true, transaction: next });
      }

      /* Bulk categorize. Thirty Anthropic charges in a row is one decision, not
       * thirty — and each one still teaches the vendor default, so the next
       * import of that vendor never reaches Review at all. */
      if (path === '/api/transactions/bulk' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Number.isFinite).slice(0, 500);
        if (!ids.length) return json({ error: 'no transactions selected' }, 400);
        const marks = new Array(ids.length).fill(0).map((_, i) => '?' + (i + 1)).join(',');
        const { results: rows } = await env.DB.prepare(
          `SELECT * FROM transactions WHERE id IN (${marks})`).bind(...ids).all();
        let updated = 0, skippedClosed = 0;
        const learned = new Set();
        for (const cur of rows) {
          if ((await monthStatus(env, cur.month)) === 'closed') { skippedClosed++; continue; }
          const sets = [], binds = [];
          if (b.tax_cat !== undefined || b.bucket !== undefined) {
            const tax = b.tax_cat === undefined ? cur.tax_cat
              : b.tax_cat === null ? null : String(b.tax_cat).slice(0, 300);
            // an explicit bucket wins; otherwise derive it from the tax category
            const bucket = b.bucket !== undefined ? String(b.bucket).slice(0, 300)
              : cur.type === 'out' ? bucketFor(tax) : cur.bucket;
            // push() returns the new length, which IS the 1-based placeholder
            sets.push(`tax_cat = ?${binds.push(tax)}`);
            sets.push(`bucket = ?${binds.push(bucket)}`);
            if (tax) sets.push(`status = 'ok'`);
            if (tax && cur.type === 'out' && !learned.has(cur.vendor)) {
              await learnDefault(env, cur.vendor, bucket, tax);
              learned.add(cur.vendor);
            }
          }
          if (b.receipt_skip !== undefined) sets.push(`receipt_skip = ${b.receipt_skip ? 1 : 0}`);
          if (b.one_time !== undefined) sets.push(`one_time = ${b.one_time ? 1 : 0}`);
          if (!sets.length) continue;
          await env.DB.prepare(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ?${binds.length + 1}`)
            .bind(...binds, cur.id).run();
          updated++;
        }
        return json({ ok: true, updated, skippedClosed, learned: [...learned] });
      }

      if (path === '/api/transaction' && request.method === 'DELETE') {
        const id = Number(url.searchParams.get('id'));
        const cur = await env.DB.prepare('SELECT * FROM transactions WHERE id = ?1').bind(id).first();
        if (!cur) return json({ error: 'unknown transaction' }, 404);
        if ((await monthStatus(env, cur.month)) === 'closed')
          return json({ error: `${cur.month} is closed — reopen it first.` }, 400);
        if (cur.receipt_key) await receiptDelete(env, cur.receipt_key);
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
        /* Plaid gives an Item 90 days of history unless asked otherwise, AT LINK
         * TIME and never afterwards · which is why the books could not be
         * checked before June 9th however many times the bank was re-read. The
         * window is a property of the Item, so the only way to widen it is to
         * link again. 730 is Plaid's maximum and covers any tax year. */
        const r = await plaid(env, '/link/token/create', {
          user: { client_user_id: 'cole' }, client_name: 'Mobius Ledger',
          products: ['transactions'], country_codes: ['US'], language: 'en',
          transactions: { days_requested: 730 },
        });
        return json({ link_token: r.link_token });
      }

      if (path === '/api/plaid-exchange' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        if (!b.public_token) return json({ error: 'public_token required' }, 400);
        const ex = await plaid(env, '/item/public_token/exchange', { public_token: b.public_token });
        const acc = await plaid(env, '/accounts/get', { access_token: ex.access_token });
        const items = await getPlaidItems(env);
        /* Linking the same bank again REPLACES it rather than joining it.
         * Two live Items for one bank means every charge arrives twice under
         * two different transaction ids, and the unique index cannot see that
         * they are the same charge · the books would simply double. Re-linking
         * is the only way to widen the history window, so it has to be safe. */
        const inst = acc.item?.institution_name || b.institution || 'Bank';
        const replaced = items.filter(i => i.name === inst).map(i => i.item_id);
        const kept = items.filter(i => i.name !== inst);
        kept.push({
          item_id: ex.item_id, access_token: ex.access_token, cursor: null,
          name: inst,
          accounts: Object.fromEntries(acc.accounts.map(a => [a.account_id, { name: a.name, type: a.type }])),
        });
        await putSetting(env, 'plaidItems', JSON.stringify(kept));
        if (!(await getSetting(env, 'plaidStart'))) {
          // never import history older than the earliest OPEN month — the sheet
          // backfill and closed report cards already own everything before it
          const open = await env.DB.prepare(`SELECT MIN(month) AS m FROM months WHERE status = 'open'`).first();
          await putSetting(env, 'plaidStart', (open?.m || new Date().toISOString().slice(0, 7)) + '-01');
        }
        /* RE-LINKING IS ONLY SAFE IF THIS RUNS FIRST. The replacement Item
         * issues new transaction ids for charges the ledger already holds, and
         * the next sync would happily insert every one of them again — the
         * unique index cannot tell two ids for one charge apart. So the moment
         * the new Item exists, before anything else is allowed to touch it,
         * every row it recognises is migrated onto its new id. It is a matter
         * of minutes between linking and the nightly job, so this cannot wait
         * to be asked for. */
        let migration = null;
        if (replaced.length) {
          const from = (await getSetting(env, 'plaidStart')) || (new Date().toISOString().slice(0, 7) + '-01');
          migration = await importPlaidRange(env, from, addDaysYmd(centralDate(Date.now() / 1000), 1), {})
            .catch(e => ({ error: String(e.message || e) }));
        }
        return json({ ok: true, name: inst, accounts: acc.accounts.length, replaced, migration });
      }

      /* Make a whole range agree with the bank. Reaches past plaidStart and
       * into closed months ON PURPOSE, so it says so out loud: reopen must be
       * asked for, and the months it touches are LEFT OPEN for review rather
       * than silently re-frozen around numbers nobody has looked at. */
      if (path === '/api/plaid-import' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        let from = b.from, to = b.to;
        if (validMonth(b.month)) { from = b.month + '-01'; to = monthOf(addMonthsYmd(b.month + '-01', 1)) + '-01'; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || ''))
          return json({ error: 'pass month=YYYY-MM or from/to=YYYY-MM-DD' }, 400);
        if (b.reopen !== true) return json({ error: 'this rewrites closed months \u00b7 pass reopen:true' }, 400);
        /* Unfreezing a month is the destructive half of this, so nothing is
         * unfrozen until the bank has actually answered the door. */
        if (!plaidReady(env)) return json({ error: 'Plaid keys are not set on the worker' }, 400);
        if (!(await getPlaidItems(env)).length) return json({ error: 'no connected accounts' }, 400);
        const reopened = [];
        for (let ym = monthOf(from); ym < monthOf(to); ym = monthOf(addMonthsYmd(ym + '-01', 1)))
          if ((await monthStatus(env, ym)) === 'closed') {
            await env.DB.prepare(`UPDATE months SET status = 'open' WHERE month = ?1`).bind(ym).run();
            reopened.push(ym);
          }
        const res = await importPlaidRange(env, from, to,
          { ignoreStart: true, allowClosed: true, replace: b.replace === true });
        return json({ ...res, reopened });
      }

      /* Read-only: does the bank agree with the books? Writes NOTHING, so it
       * is safe on the hand-entered months a backfill must never touch. */
      if (path === '/api/plaid-compare' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        let from = b.from, to = b.to;
        if (validMonth(b.month)) { from = b.month + '-01'; to = monthOf(addMonthsYmd(b.month + '-01', 1)) + '-01'; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || ''))
          return json({ error: 'pass month=YYYY-MM or from/to=YYYY-MM-DD' }, 400);
        return json(await comparePlaid(env, from, to, !!b.full));
      }

      /* Re-read a date range straight from the bank, independent of the sync
       * cursor · the one way to prove a month against the statement. */
      if (path === '/api/plaid-backfill' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        let from = b.from, to = b.to;
        if (validMonth(b.month)) { from = b.month + '-01'; to = monthOf(addMonthsYmd(b.month + '-01', 1)) + '-01'; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || ''))
          return json({ error: 'pass month=YYYY-MM or from/to=YYYY-MM-DD' }, 400);
        return json(await backfillPlaid(env, from, to));
      }

      if (path === '/api/plaid-sync' && request.method === 'POST') {
        const out = await syncPlaid(env);
        const retried = await retryHeldReceipts(env).catch(() => ({ attached: 0 }));
        return json({ ...out, heldAttached: retried.attached || 0 });
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
        /* EXPECTED IS FOR REVENUE ONLY (Cole's call, 2026-09-09, and he is
         * right). Expenses arrive on their own from the bank feed, so a
         * pre-created expense row is a prediction of something automatic:
         * pure noise, plus a confirm-or-drop decision at every close. What a
         * missing charge deserves is a NOTE, not a phantom row - the close
         * checklist lists recurring vendors that didn't bill. A client who
         * doesn't pay, though, is exactly what he wants shoved in his face:
         * client rows stay. Vendor rules themselves also stay - they still
         * categorize the bank lines and feed the forecast and yearly-renewal
         * reminders (the Amex membership fee just arrives as a bank line and
         * files itself under its rule). */
        const [clients, existing] = await Promise.all([
          env.DB.prepare(`SELECT * FROM clients WHERE active = 1 AND (retainer > 0 OR billing = 'percent')`).all(),
          env.DB.prepare('SELECT vendor FROM transactions WHERE month = ?1').bind(month).all(),
        ]);
        const have = new Set(existing.results.map(r => r.vendor.toLowerCase()));
        let created = 0;
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
        /* Frozen means CLOSED and frozen. A reopened month keeps its old
         * report_json around (until the next close overwrites it), and serving
         * that would show numbers the ledger no longer contains. */
        if (row?.status === 'closed' && row.report_json)
          return json({ frozen: true, closedAt: row.closed_at, report: safeJson(row.report_json, null) });
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
              -- personal purchases are owner draws, not business costs — the
              -- home chart must agree with the report card on that
              SUM(CASE WHEN type='out' AND expected=0
                   AND (tax_cat IS NULL OR tax_cat NOT LIKE 'Personal%') THEN amount ELSE 0 END) AS expenses,
              SUM(CASE WHEN type='fee' AND expected=0 THEN amount ELSE 0 END) AS fees
            FROM transactions WHERE month LIKE ?1 GROUP BY month ORDER BY month`).bind(year + '-%').all(),
          env.DB.prepare('SELECT name, expected_amount FROM vendors WHERE recurring = 1 AND active = 1 ORDER BY expected_amount DESC').all(),
        ]);
        const attn = await env.DB.prepare(`SELECT
            SUM(CASE WHEN status='review' AND expected=0 THEN 1 ELSE 0 END) AS review,
            SUM(CASE WHEN expected=1 THEN 1 ELSE 0 END) AS expected,
            SUM(CASE WHEN type='out' AND expected=0 AND receipt_key IS NULL AND receipt_skip=0 THEN 1 ELSE 0 END) AS noReceipt
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

      /* ---- Google Drive import ---- */
      if (path === '/api/drive-status') {
        const auth = safeJson(await getSetting(env, 'driveAuth'), null);
        const job = safeJson(await getSetting(env, 'driveJob'), null);
        return json({ configured: driveReady(env), connected: !!auth?.refresh,
          job: job ? { total: job.files.length, at: job.at, folder: job.folder,
                       attached: job.attached, noMatch: job.noMatch, unreadable: job.unreadable } : null });
      }

      if (path === '/api/drive-connect' && request.method === 'POST') {
        if (!driveReady(env)) return json({ error: 'Google client ID/secret are not set on the worker yet' }, 400);
        const state = crypto.randomUUID();
        const redirectUri = `${url.origin}/api/drive-callback`;
        await putSetting(env, 'driveOauthState',
          JSON.stringify({ state, redirectUri, expires: Date.now() + 15 * 60e3 }));
        return json({ url: driveAuthUrl(env, redirectUri, state) });
      }

      /* Scanning is separated from importing so the slow part happens once: a
       * few hundred files are listed, stored as a job, and then chewed through
       * in small batches that each finish well inside a request. */
      if (path === '/api/drive-scan' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const store = safeJson(await getSetting(env, 'driveAuth'), null);
        if (!store?.refresh) return json({ error: 'Google Drive is not connected yet' }, 400);
        const root = driveFolderId(b.folder);
        if (!root) return json({ error: 'That does not look like a Drive folder link' }, 400);
        const files = await driveListReceipts(env, store, root);
        await putSetting(env, 'driveAuth', JSON.stringify(store));   // keep the fresh access token
        if (!files.length) return json({ error: 'No PDFs or images found in that folder' }, 404);
        const months = [...new Set(files.map(f => f.month).filter(Boolean))].sort();
        await putSetting(env, 'driveJob', JSON.stringify({
          folder: b.folder, files, at: 0, attached: 0, noMatch: 0, unreadable: 0, log: [],
        }));
        return json({ ok: true, total: files.length, months,
          undated: files.filter(f => !f.month).length });
      }

      if (path === '/api/drive-import' && request.method === 'POST') {
        const job = safeJson(await getSetting(env, 'driveJob'), null);
        if (!job) return json({ error: 'Nothing scanned yet' }, 400);
        const store = safeJson(await getSetting(env, 'driveAuth'), null);
        if (!store?.refresh) return json({ error: 'Google Drive is not connected' }, 400);

        // Small batches: each file is a Drive download plus a Claude read, and
        // a request that tries to do two hundred of those will not finish.
        const BATCH = 6;
        const end = Math.min(job.at + BATCH, job.files.length);
        for (; job.at < end; job.at++) {
          const f = job.files[job.at];
          try {
            if (f.size > 8 * 1024 * 1024) { job.unreadable++; job.log.push(`${f.name}: over 8MB`); continue; }
            const buf = await driveDownload(env, store, f.id);
            const bytes = new Uint8Array(buf);
            let b64 = '';
            for (let i = 0; i < bytes.length; i += 0x8000)
              b64 += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            b64 = btoa(b64);
            const ext = bytes.length < 4.5 * 1024 * 1024
              ? await claudeExtract(env, b64, f.mimeType) : null;
            if (!ext?.amount) { job.unreadable++; job.log.push(`${f.name}: no amount found`); continue; }

            /* Attach only — never create. The transactions for these months
             * already came from the 2026 sheet, and those months are closed;
             * inventing rows from receipts is exactly how August got counted
             * twice. A receipt that matches nothing is reported, not filed. */
            const amt = round2(Number(ext.amount));
            const win = f.month
              ? [monthOf(addMonthsYmd(f.month + '-01', -1)), monthOf(addMonthsYmd(f.month + '-01', 1))]
              : ['2000-01', '2999-12'];
            const { results } = await env.DB.prepare(
              `SELECT id, vendor, month, date FROM transactions
               WHERE type = 'out' AND expected = 0 AND receipt_key IS NULL
                 AND month >= ?1 AND month <= ?2 AND ABS(amount - ?3) < 0.005
               ORDER BY (month = ?4) DESC, id`).bind(win[0], win[1], amt, f.month || '').all();
            const first = String(ext.vendor || '').toLowerCase().split(' ')[0];
            // dated files may fall back to the closest amount; an UNDATED file
            // searched the whole ledger, so for those the vendor name must agree
            const hit = results.find(t => first && t.vendor.toLowerCase().includes(first))
              || (f.month ? results[0] : null);
            if (!hit) {
              job.noMatch++;
              job.log.push(`${f.name}: $${amt.toFixed(2)}${f.month ? ' in ' + f.month : ''} — no unreceipted match`);
              continue;
            }
            const key = `rcpt:${hit.id}:${Date.now()}`;
            await receiptPut(env, key, buf);
            await env.DB.prepare('UPDATE transactions SET receipt_key=?2, receipt_name=?3, receipt_type=?4, receipt_hash=?5 WHERE id=?1')
              .bind(hit.id, key, f.name.slice(0, 120), f.mimeType, await sha256bytes(buf)).run();
            job.attached++;
            job.log.push(`${f.name} → ${hit.vendor} $${amt.toFixed(2)} (${hit.date})`);
          } catch (e) {
            job.unreadable++;
            job.log.push(`${f.name}: ${String(e.message || e).slice(0, 90)}`);
          }
        }
        if (job.log.length > 400) job.log = job.log.slice(-400);
        await putSetting(env, 'driveJob', JSON.stringify(job));
        await putSetting(env, 'driveAuth', JSON.stringify(store));
        return json({ done: job.at >= job.files.length, at: job.at, total: job.files.length,
          attached: job.attached, noMatch: job.noMatch, unreadable: job.unreadable,
          recent: job.log.slice(-BATCH) });
      }

      if (path === '/api/drive-job' && request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM settings WHERE key = ?1').bind('driveJob').run();
        return json({ ok: true });
      }

      if (path === '/api/drive-log') {
        const job = safeJson(await getSetting(env, 'driveJob'), null);
        return json({ log: job?.log || [] });
      }

      /* Every receipt for a period, foldered by month and category — the
       * once-a-year copy that lives somewhere other than Cloudflare. Streamed
       * rather than assembled: a year of photos is far more than a Worker can
       * hold in memory at once. */
      if (path === '/api/receipts.zip') {
        const from = url.searchParams.get('from'), to = url.searchParams.get('to');
        if (!validMonth(from) || !validMonth(to) || from > to)
          return json({ error: 'from/to = YYYY-MM' }, 400);
        const { results } = await env.DB.prepare(
          `SELECT id, date, month, vendor, amount, tax_cat, receipt_key, receipt_name, receipt_type
           FROM transactions WHERE month >= ?1 AND month <= ?2 AND receipt_key IS NOT NULL
           ORDER BY month, date, id`).bind(from, to).all();
        if (!results.length) return json({ error: `No receipts stored between ${from} and ${to}.` }, 404);
        const seen = new Set();
        async function* files() {
          for (const t of results) {
            const buf = await receiptGet(env, t.receipt_key);
            if (!buf) continue;                       // deleted underneath us
            const ext = (t.receipt_name || '').match(/\.([a-z0-9]{1,5})$/i)?.[1]
              || (t.receipt_type === 'application/pdf' ? 'pdf' : 'jpg');
            let name = `${t.month}/${zipSafe(t.tax_cat || 'Uncategorized')}/` +
              `${t.date} ${zipSafe(t.vendor)} ${Math.abs(t.amount).toFixed(2)}.${ext.toLowerCase()}`;
            // two identical charges on one day would otherwise collide
            if (seen.has(name)) name = name.replace(/\.([a-z0-9]+)$/i, ` (${t.id}).$1`);
            seen.add(name);
            yield { name, bytes: new Uint8Array(buf), date: new Date(t.date + 'T12:00:00Z') };
          }
        }
        const label = from === to ? from : `${from} to ${to}`;
        return new Response(zipStream(files()), { headers: { ...CORS,
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="Mobius Digital receipts ${label}.zip"` } });
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
        await receiptPut(env, key, bytes.buffer);
        if (cur.receipt_key) await receiptDelete(env, cur.receipt_key);
        const name = String(b.name || 'receipt').slice(0, 120);
        const type = String(b.type || 'application/octet-stream').slice(0, 80);
        await env.DB.prepare('UPDATE transactions SET receipt_key=?2, receipt_name=?3, receipt_type=?4, receipt_hash=?5 WHERE id=?1')
          .bind(id, key, name, type, await sha256bytes(bytes.buffer)).run();
        return json({ ok: true, key });
      }

      if (path === '/api/receipt' && request.method === 'GET') {
        const id = Number(url.searchParams.get('id'));
        const cur = await env.DB.prepare('SELECT receipt_key, receipt_name, receipt_type FROM transactions WHERE id = ?1').bind(id).first();
        if (!cur?.receipt_key) return json({ error: 'no receipt' }, 404);
        const body = await receiptGet(env, cur.receipt_key);
        if (!body) return json({ error: 'file missing from store' }, 404);
        return new Response(body, { headers: { 'Content-Type': cur.receipt_type || 'application/octet-stream',
          'Content-Disposition': `inline; filename="${(cur.receipt_name || 'receipt').replace(/[^\w.\- ]/g, '')}"`, ...CORS } });
      }

      if (path === '/api/receipt' && request.method === 'DELETE') {
        const id = Number(url.searchParams.get('id'));
        const cur = await env.DB.prepare('SELECT receipt_key FROM transactions WHERE id = ?1').bind(id).first();
        if (cur?.receipt_key) await receiptDelete(env, cur.receipt_key);
        await env.DB.prepare('UPDATE transactions SET receipt_key=NULL, receipt_name=NULL, receipt_type=NULL, receipt_hash=NULL WHERE id=?1').bind(id).run();
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
          channel: ch.id || null, isMember: ch.is_member ?? null, error: ch.error || null,
          instant: !!env.SLACK_SIGNING_SECRET });
      }

      if (path === '/api/report-slack' && request.method === 'POST') {
        const period = url.searchParams.get('period') || 'month';
        return json(await monthlyReportSlack(env, url.searchParams.get('force') === '1',
          url.searchParams.get('month'), period));
      }

      /* The same statement as a download, straight from the app. */
      if (path === '/api/statement.pdf') {
        const period = url.searchParams.get('period') || 'month';
        const anchor = url.searchParams.get('month');
        if (!validMonth(anchor)) return json({ error: 'month=YYYY-MM required' }, 400);
        const { r, title, label, file, months, frozen } = await periodReport(env, period, anchor);
        const bytes = buildPnlPdf(r, { title, period: label, months, frozen,
          sub: period === 'month' ? 'Monthly statement' : period === 'quarter' ? 'Quarterly statement' : 'Annual statement' });
        return new Response(bytes, { headers: { ...CORS, 'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${file}"` } });
      }

      if (path === '/api/receipt-nudge' && request.method === 'POST') {
        return json(await receiptNudge(env, url.searchParams.get('force') === '1', url.searchParams.get('month')));
      }

      if (path === '/api/slack-poll' && request.method === 'POST') {
        return json(await processSlackReceipts(env));
      }

      /* ---- vendors / clients / settings ---- */
      if (path === '/api/vendor' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const name = String(b.name || '').trim().slice(0, 120);
        if (!name || !b.tax_cat) return json({ error: 'name and tax_cat required' }, 400);
        b.bucket = b.bucket || bucketFor(b.tax_cat);   // one choice; the group follows
        const cadence = b.cadence === 'yearly' ? 'yearly' : 'monthly';
        const rmn = Number(b.renew_month);
        /* Where to go and fetch an invoice by hand. Some vendors simply never
         * email one — the answer is not to nag for a receipt that will never
         * arrive, but to keep the deep link to their billing page next to the
         * charge, so month-end is a click instead of a hunt. */
        const billingUrl = /^https?:\/\//i.test(String(b.billing_url || '').trim())
          ? String(b.billing_url).trim().slice(0, 500) : null;
        await env.DB.prepare(`INSERT OR REPLACE INTO vendors (name, bucket, tax_cat, recurring, expected_amount, active, cadence, renew_month, billing_url)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
          .bind(name, String(b.bucket), String(b.tax_cat), b.recurring ? 1 : 0,
                Number.isFinite(Number(b.expected_amount)) ? Number(b.expected_amount) : null,
                b.active === false ? 0 : 1, cadence,
                cadence === 'yearly' && rmn >= 1 && rmn <= 12 ? rmn : null,
                billingUrl).run();
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
