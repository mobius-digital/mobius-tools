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

  let revenue = 0, fees = 0, expenses = 0;
  const byBucket = {}, byTax = {}, byClient = {};
  for (const t of txns) {
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
  if (row.bucket && row.tax_cat) return row;
  const rule = await env.DB.prepare('SELECT * FROM vendors WHERE name = ?1 COLLATE NOCASE').bind(row.vendor).first();
  if (rule) { row.bucket = row.bucket || rule.bucket; row.tax_cat = row.tax_cat || rule.tax_cat; }
  else row.status = 'review';
  return row;
}

/* ------------------------------------------------------------------ */
/*  worker                                                             */
/* ------------------------------------------------------------------ */

export default {
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
            SUM(CASE WHEN type != 'in' AND type != 'fee' AND expected = 0 AND receipt_key IS NULL THEN 1 ELSE 0 END) AS noReceipt
          FROM transactions GROUP BY month`).all();
        const avg = await recentRevenueAvg(env);
        return json({
          money, taxCats: safeJson(taxCatsRaw, []),
          clients: clients.results.map(c => ({ ...c, recent_avg: avg[c.name] ?? null })),
          vendors: vendors.results, months: months.results,
          flags: Object.fromEntries(flags.results.map(f => [f.month, f])),
          extractAvailable: !!env.ANTHROPIC_API_KEY,
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
          const type = ['in', 'out', 'fee'].includes(r.type) ? r.type : null;
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
        const mt = String(b.media_type || 'image/jpeg');
        const block = mt === 'application/pdf'
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b.data } }
          : { type: 'image', source: { type: 'base64', media_type: mt, data: b.data } };
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
        const text = j?.content?.[0]?.text || '';
        const m = text.match(/\{[\s\S]*\}/);
        return json({ available: true, extracted: m ? safeJson(m[0], null) : null });
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
