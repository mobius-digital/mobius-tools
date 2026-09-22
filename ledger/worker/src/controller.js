/**
 * Mobius Ledger: the Controller.
 *
 * The agency's finance controller, on the shared Ask engine (../../../ask/
 * engine.js). Everything here is what makes it THIS app's assistant: who it
 * is, the tables and the rules, the views the screens draw, the checks it runs
 * at night, and the two Slack-only tools (the PDF, the confirm button).
 *
 * worker.js owns the computations and the plumbing and hands them in as
 * `deps`, so this file imports nothing from the worker and the worker keeps
 * one owner for every function.
 */

import { createAssistant, makeAppView, makeSecretKey } from '../../../ask/engine.js';

const WHO = `
You are the Controller, the finance controller for Mobius Digital, a marketing
agency run by Cole. You answer questions about the company books, which live
in a SQLite (Cloudflare D1) database, and you look after them: what each
client pays and whether they have paid, what the agency spends and on whom,
whether the month is profitable, and what still needs doing before a month
can close.
`;

const SCHEMA = `
## Tables

transactions - one row per movement of money. The main table.
  id          INTEGER
  date        TEXT  'YYYY-MM-DD'
  month       TEXT  'YYYY-MM'  (denormalized; use this for month filters, it is indexed)
  type        TEXT  'in' = revenue | 'out' = expense | 'fee' = merchant fee | 'transfer' = money moved between our own accounts
  vendor      TEXT  who was paid; for type='in' this is the CLIENT name
  amount      REAL  always positive (a refund is a negative 'in' row)
  bucket      TEXT  Cole's layer: 'Software' | 'Contractors' | 'Payroll' | 'Ads/Marketing' | 'Other' | 'Revenue' | 'Merchant fee' | 'Transfer'
  tax_cat     TEXT  the CPA's layer, a finer category (see the live list below)
  note        TEXT
  one_time    INTEGER  1 = excluded from the recurring baseline and the forecast
  expected    INTEGER  1 = PRE-CREATED, not real yet. ALWAYS filter expected = 0 for actuals.
  status      TEXT  'ok' | 'review' (sitting in the Review inbox, uncategorized)
  receipt_key TEXT  NULL when no receipt is attached
  receipt_skip INTEGER 1 = "no receipt exists, that's fine", acknowledged
  source      TEXT  manual | recurring | import | backfill | stripe | plaid
  fee         REAL  the Stripe fee on this charge, when there was one

vendors - one row per known vendor; the rule that categorizes them.
  name, bucket, tax_cat, recurring (1 = billed every cycle), expected_amount,
  active, cadence ('monthly' | 'yearly'), renew_month (1-12), billing_url

clients - one row per client.
  name, retainer (fixed monthly $, or the ESTIMATE when billing='percent'),
  active, billing ('retainer' | 'percent'), pct (agreed % of ad spend)

months - month close state.
  month ('YYYY-MM'), status ('open' | 'closed'), closed_at
  (there is also a report_json column - NEVER select it, it is a huge blob)

ledger_close_history - every close and reopen, who and when.
ledger_jobs - background work and anything that failed (status 'pending' = an exception waiting on a person).
receipt_allocations, receipt_versions, bank_provenance - the audit trail behind receipts and bank lines.
`;

const RULES = `
## Rules that make the numbers right
- ALWAYS add "expected = 0" when totalling actuals. Expected rows are forecasts:
  a retainer pre-created for the month before the client has paid it.
- An expected 'in' row whose date has passed and that is still expected = 1 is
  a client who has NOT paid yet. That is how "who owes us" is answered.
- type='transfer' is money MOVING, not money made or spent. Exclude it from
  revenue, expenses and spend rankings unless asked about transfers directly.
- Revenue = SUM(amount) WHERE type='in'. Expenses = SUM(amount) WHERE type='out'.
  Merchant fees are type='fee' and are counted separately from expenses.
- Two expense kinds are real payments but are NOT business costs, and the P&L
  leaves them out: tax_cat starting with 'Personal' (an owner draw) and tax_cat
  starting with 'Income tax'. Exclude both when asked about spending or costs.
- Net = revenue - expenses - fees. Margin = net / revenue * 100.
- A KIND of spending is a category, not a name. "Software", "contractors",
  "ads" mean GROUP BY tax_cat or bucket. Only match on vendor when the question
  names a company.
- Vendor names are not perfectly consistent ("Anthropic", "Anthropic PBC",
  "Claude"). For "how much did we spend on X" use  WHERE vendor LIKE '%x%'
  rather than an exact match; LIKE already ignores case here. When a name has
  well-known variants, match them all with OR, and say which names you totalled.
- Money is in US dollars. Round to cents. Use SQL to do the arithmetic.
`;

const TABLES = ['transactions', 'vendors', 'clients', 'months', 'ledger_close_history', 'ledger_jobs',
                'receipt_allocations', 'receipt_versions', 'bank_provenance'];

const DEFAULT_BRIEF = `Mobius Digital is a marketing agency run by Cole. Clients pay a monthly retainer, or a percentage of ad spend, by Stripe; a client's retainer row is pre-created each month as expected revenue and becomes real when the payment lands. The big costs are contractors (Ahsan, Noma, Robbo and other 1099 strategists), software, and the ads the agency runs. Personal spending and income tax go through the books but are not business costs. Months are closed once receipts are in and everything is categorized; a closed month's report is frozen.`;

const VIEW_BLURBS = {
  overview: 'the Home screen for a month: the report card, the year so far month by month, what needs attention (uncategorized, missing receipts, unconfirmed retainers), and the recurring renewals. Use it for "how are we doing".',
  month_report: 'the full P&L report card for one month exactly as the Reports screen computes it (revenue, expenses by category, fees, net, margin, per-client revenue). Use it rather than rebuilding a P&L in SQL.',
  period_report: 'the same report card for a quarter or a year (period = quarter | year, anchor = any month inside it).',
  series: 'revenue, expenses, fees and net by month over a range, plus the top vendors and the contractors paid in it. Use it for trends and "how does this month compare".',
  balances: 'cash in the bank and what is on the cards right now, per account, from the bank feed.',
  clients: 'every client with retainer, billing type, whether this month has been paid, and their average monthly revenue lately. Use it for who pays what and who owes us.',
  recurring: 'every recurring vendor with the expected amount, cadence, the last charge and whether it has billed this month. Use it for subscriptions, renewals, "what did we stop paying".',
  close_state: 'which months are open or closed, and what still needs attention in each (uncategorized rows, missing receipts, unconfirmed expected revenue).',
  exceptions: 'background jobs that failed and are waiting on a person: a sync that did not finish, a receipt that could not be filed.',
  findings: 'everything the nightly checks currently have open.',
  config: 'how the books are set up: the category list, the money settings, notifications.',
};

/* ------------------------------------------------------------------ */
/*  the views: the same functions the screens call                     */
/* ------------------------------------------------------------------ */

function buildViews(d) {
  const nowM = () => d.monthOf(d.centralDate(Date.now() / 1000));
  const okM = (m, f) => (d.validMonth(m) ? m : f);
  return {
    overview: async (env, a) => ({ ...(await d.dashSummary(env, okM(a.month, nowM()))), how_to_read: VIEW_BLURBS.overview }),
    month_report: async (env, a) => { const { transactions, ...r } = await d.resolveReport(env, okM(a.month, nowM())); return { ...r, how_to_read: 'The frozen report if the month is closed, the live one if it is open. Per-client revenue is in clients or byClient where present.' }; },
    period_report: async (env, a) => {
      const period = ['quarter', 'year'].includes(a.period) ? a.period : 'quarter';
      const { transactions, ...r } = await d.periodReport(env, period, okM(a.anchor || a.month, nowM()));
      return { ...r, how_to_read: `A ${period} rolled up from its months.` };
    },
    series: async (env, a) => {
      const to = okM(a.to, nowM()), from = okM(a.from, d.monthOf(d.addMonthsYmd(to + '-01', -11)));
      return from <= to ? { ...(await d.seriesSummary(env, from, to)), how_to_read: VIEW_BLURBS.series } : { error: 'from must not be after to' };
    },
    balances: async env => ({ ...(await d.bankBalances(env)), how_to_read: 'cash is the sum of checking accounts, cards is what is owed on credit cards (a liability, shown positive). connected=false means no bank is linked.' }),
    clients: async (env, a) => {
      const month = okM(a.month, nowM());
      const { results: clients } = await env.DB.prepare('SELECT name, retainer, active, billing, pct FROM clients ORDER BY retainer DESC').all();
      const { results: rows } = await env.DB.prepare(`SELECT vendor, expected, SUM(amount) AS amount, MIN(date) AS first, MAX(date) AS last, COUNT(*) AS n
        FROM transactions WHERE type = 'in' AND month = ?1 GROUP BY vendor, expected`).bind(month).all();
      const avg = await d.recentRevenueAvg(env);
      const byClient = {};
      for (const r of rows || []) { const c = byClient[r.vendor] ||= {}; if (r.expected) { c.expected = r.amount; c.expectedOn = r.first; } else { c.paid = r.amount; c.paidOn = r.last; } }
      return { month, clients: (clients || []).map(c => ({ ...c, recentMonthlyAvg: avg[c.name] ?? null, thisMonth: byClient[c.name] || { paid: 0 },
          status: byClient[c.name]?.paid ? 'paid' : byClient[c.name]?.expected ? 'expected, not yet paid' : 'nothing booked' })),
        how_to_read: 'thisMonth.paid is money that actually landed; thisMonth.expected is the pre-created retainer still waiting. A client with expected and no paid after their usual date owes us.' };
    },
    recurring: async env => {
      const month = nowM();
      const { results: vend } = await env.DB.prepare('SELECT name, bucket, tax_cat, expected_amount, cadence, renew_month, active FROM vendors WHERE recurring = 1 ORDER BY expected_amount DESC').all();
      const { results: last } = await env.DB.prepare(`SELECT vendor, MAX(date) AS last, SUM(CASE WHEN month = ?1 THEN amount ELSE 0 END) AS thisMonth
        FROM transactions WHERE type = 'out' AND expected = 0 GROUP BY vendor`).bind(month).all();
      const byV = Object.fromEntries((last || []).map(r => [String(r.vendor).toLowerCase(), r]));
      return { month, vendors: (vend || []).map(v => { const l = byV[String(v.name).toLowerCase()]; return { ...v, lastCharge: l?.last || null, chargedThisMonth: l?.thisMonth || 0 }; }),
        how_to_read: 'expected_amount is what the vendor usually bills. chargedThisMonth = 0 on a monthly vendor late in the month means they have not billed yet or the charge is miscategorized.' };
    },
    close_state: async env => {
      const [months, flags] = await Promise.all([
        env.DB.prepare('SELECT month, status, closed_at FROM months ORDER BY month DESC LIMIT 36').all(),
        env.DB.prepare(`SELECT month,
            SUM(CASE WHEN status = 'review' AND expected = 0 THEN 1 ELSE 0 END) AS review,
            SUM(CASE WHEN expected = 1 THEN 1 ELSE 0 END) AS expected,
            SUM(CASE WHEN type = 'out' AND expected = 0 AND receipt_key IS NULL AND receipt_skip = 0 THEN 1 ELSE 0 END) AS noReceipt
          FROM transactions GROUP BY month ORDER BY month DESC LIMIT 36`).all(),
      ]);
      return { months: months.results || [], needs_attention: flags.results || [],
        how_to_read: 'review = rows still uncategorized, noReceipt = payments with no receipt, expected = retainers not yet paid. A closed month is frozen and cannot be edited.' };
    },
    exceptions: async env => ({ exceptions: (await env.DB.prepare("SELECT id, kind, error, updated_at FROM ledger_jobs WHERE status = 'pending' ORDER BY updated_at DESC LIMIT 50").all()).results || [],
      how_to_read: 'Each row is a job that failed and is waiting on a person.' }),
    findings: async (env, a, ctx, engine) => ({ open: await engine.openFindings(env, d.h()), how_to_read: VIEW_BLURBS.findings }),
    config: async env => ({
      money: await d.getMoney(env),
      taxCats: d.safeJson(await d.getSetting(env, 'taxCats'), []),
      notify: d.getNotify ? await d.getNotify(env) : null,
      how_to_read: VIEW_BLURBS.config,
    }),
  };
}

/* ------------------------------------------------------------------ */
/*  the checks: plain SQL, no model                                    */
/* ------------------------------------------------------------------ */

const money2 = n => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);

async function runChecks(env, h, d) {
  const today = h.centralDate(Date.now() / 1000);
  const month = h.monthOf(today);
  const prev = h.monthOf(h.addMonthsYmd(month + '-01', -1));
  const out = [];
  const all = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).all()).results || [];

  /* 1. A client who has not paid. The retainer row is pre-created as
   * expected; five days past its date and still expected, that is money the
   * agency is owed. */
  for (const r of await all(`SELECT id, date, vendor, amount FROM transactions WHERE type = 'in' AND expected = 1 AND date <= date(?1, '-5 days') ORDER BY date`, today)) {
    const late = daysBetween(r.date, today);
    out.push({ key: `unpaid:${r.vendor}:${r.date.slice(0, 7)}`, kind: 'unpaid', severity: r.amount >= 3000 ? 'high' : 'med', amount: r.amount, month: r.date.slice(0, 7),
      title: `${r.vendor} has not paid ${money2(r.amount)}, ${late} days late`,
      detail: `Their retainer was expected on ${r.date} and nothing has landed. Chase it, or if it arrived under another name, match it in Transactions.`, evidence: { id: r.id } });
  }

  /* 2. The same money paid twice: same vendor, same amount, 3 to 60 days apart,
   * and NOT a vendor that bills that amount every cycle. */
  const pays = await all(`SELECT id, date, vendor, amount FROM transactions WHERE type = 'out' AND expected = 0 AND amount >= 200 AND date >= date(?1, '-6 months') ORDER BY vendor, date`, today);
  const rec = new Set((await all(`SELECT LOWER(name) AS n FROM vendors WHERE recurring = 1`)).map(r => r.n));
  for (let i = 0; i < pays.length; i++) for (let j = i + 1; j < pays.length; j++) {
    const a = pays[i], b = pays[j];
    if (a.vendor.toLowerCase() !== b.vendor.toLowerCase()) continue;
    if (Math.abs(a.amount - b.amount) > 1) continue;
    const apart = daysBetween(a.date, b.date);
    if (apart < 3 || apart > 60) continue;
    if (rec.has(a.vendor.toLowerCase()) && apart >= 25) continue;   // a monthly bill, on time
    out.push({ key: `dup:${a.vendor.toLowerCase()}:${a.amount.toFixed(2)}:${b.date}`, kind: 'duplicate', severity: a.amount >= 1000 ? 'high' : 'med', amount: a.amount, month: b.date.slice(0, 7),
      title: `${a.vendor} charged ${money2(a.amount)} twice, ${apart} days apart`,
      detail: `${a.date} and ${b.date}. If it is one bill paid twice, ask for the refund; if both are real, note why on the second.`, evidence: { ids: [a.id, b.id] } });
  }

  /* 3. Price creep: a recurring vendor whose latest charge is 15%+ over what
   * we expect them to bill. */
  for (const v of await all(`SELECT v.name, v.expected_amount, t.amount, t.date FROM vendors v
      JOIN transactions t ON LOWER(t.vendor) = LOWER(v.name) AND t.type = 'out' AND t.expected = 0
      WHERE v.recurring = 1 AND v.active = 1 AND v.expected_amount > 0 AND t.date >= date(?1, '-45 days')
        AND t.amount >= v.expected_amount * 1.15 ORDER BY t.date DESC`, today)) {
    out.push({ key: `creep:${v.name.toLowerCase()}:${v.date.slice(0, 7)}`, kind: 'price-creep', severity: 'med', amount: v.amount - v.expected_amount, month: v.date.slice(0, 7),
      title: `${v.name} billed ${money2(v.amount)}, up from the usual ${money2(v.expected_amount)}`,
      detail: `On ${v.date}. Check whether the plan changed or a seat was added; if the new price is right, update the vendor's expected amount.`, evidence: {} });
  }

  /* 4. A recurring monthly vendor that did not bill last month. */
  for (const v of await all(`SELECT v.name, v.expected_amount FROM vendors v WHERE v.recurring = 1 AND v.active = 1 AND (v.cadence IS NULL OR v.cadence = 'monthly')
      AND NOT EXISTS (SELECT 1 FROM transactions t WHERE LOWER(t.vendor) = LOWER(v.name) AND t.month = ?1 AND t.expected = 0 AND t.type = 'out')
      AND EXISTS (SELECT 1 FROM transactions t WHERE LOWER(t.vendor) = LOWER(v.name) AND t.month = ?2 AND t.expected = 0 AND t.type = 'out')`, prev, h.monthOf(h.addMonthsYmd(prev + '-01', -1)))) {
    out.push({ key: `missing:${v.name.toLowerCase()}:${prev}`, kind: 'missing-bill', severity: 'low', amount: v.expected_amount, month: prev,
      title: `${v.name} did not bill in ${prev}`,
      detail: `They billed the month before. Either it was cancelled (mark the vendor inactive) or the charge is sitting under another name.`, evidence: {} });
  }

  /* 5. Last month still open past the 10th with receipts missing or rows in review. */
  if (today.slice(8) >= '10') {
    const st = await env.DB.prepare('SELECT status FROM months WHERE month = ?1').bind(prev).first();
    if (!st || st.status !== 'closed') {
      const f = await env.DB.prepare(`SELECT
          SUM(CASE WHEN status = 'review' AND expected = 0 THEN 1 ELSE 0 END) AS review,
          SUM(CASE WHEN type = 'out' AND expected = 0 AND receipt_key IS NULL AND receipt_skip = 0 THEN 1 ELSE 0 END) AS noReceipt
        FROM transactions WHERE month = ?1`).bind(prev).first();
      if ((f?.review || 0) + (f?.noReceipt || 0) > 0)
        out.push({ key: `close:${prev}`, kind: 'close', severity: 'med', amount: null, month: prev,
          title: `${prev} is not closed: ${f.review || 0} uncategorized, ${f.noReceipt || 0} without a receipt`,
          detail: 'The CPA pack for that month waits on the close. Clear the Review inbox and the receipts, then close it from Reports.', evidence: {} });
    }
  }

  /* 6. A sync that failed and is waiting on a person. */
  const ex = await all(`SELECT kind, error, updated_at FROM ledger_jobs WHERE status = 'pending' ORDER BY updated_at DESC LIMIT 5`);
  if (ex.length)
    out.push({ key: `exceptions:${ex[0].updated_at?.slice(0, 10)}`, kind: 'bank-feed', severity: 'high', amount: null, month,
      title: `${ex.length} background job${ex.length > 1 ? 's' : ''} failed and ${ex.length > 1 ? 'are' : 'is'} waiting on you`,
      detail: ex.map(e => `${e.kind}: ${String(e.error || '').slice(0, 80)}`).join('; ') + '. The books may be missing money until these are cleared.', evidence: {} });

  return out;
}

async function snapshot(env, h, d) {
  const today = h.centralDate(Date.now() / 1000);
  const month = h.monthOf(today);
  const prevM = h.monthOf(h.addMonthsYmd(month + '-01', -1));
  const strip = r => { const { transactions, byVendor, ...rest } = r || {}; return rest; };
  const [cur, prev] = await Promise.all([d.resolveReport(env, month).catch(() => ({})), d.resolveReport(env, prevM).catch(() => ({}))]);
  let bal = null;
  try { bal = await d.bankBalances(env); } catch (e) {}
  return { today, month, this_month: strip(cur), previous_month: strip(prev), cash_today: bal?.cash ?? null, cards: bal?.cards ?? null };
}

/* ------------------------------------------------------------------ */
/*  Slack-only tools: the PDF and the confirm button                   */
/* ------------------------------------------------------------------ */

export async function buildProposal(env, input, taxCats, h) {
  const id = Number(input?.id);
  if (!Number.isInteger(id)) return { error: 'A numeric transaction id is required.' };
  const row = await env.DB.prepare('SELECT id, date, month, vendor, amount, bucket, tax_cat, note, one_time, status FROM transactions WHERE id = ?1').bind(id).first();
  if (!row) return { error: `No transaction with id ${id}.` };
  if ((await h.monthStatus(env, row.month)) === 'closed')
    return { error: `${row.month} is closed and its report is frozen. Reopen the month in the app first.` };
  const patch = {};
  if (input.tax_cat !== undefined) {
    if (!taxCats.includes(input.tax_cat)) return { error: `"${input.tax_cat}" is not a tax category. Use one of: ${JSON.stringify(taxCats)}` };
    patch.tax_cat = input.tax_cat;
  }
  if (input.note !== undefined) patch.note = String(input.note).slice(0, 500);
  if (input.one_time !== undefined) patch.one_time = input.one_time ? 1 : 0;
  if (input.status !== undefined && ['ok', 'review'].includes(input.status)) patch.status = input.status;
  if (!Object.keys(patch).length) return { error: 'Nothing to change. Give at least one of tax_cat, note, one_time, status.' };
  const money = '$' + Number(row.amount).toFixed(2);
  const summary = String(input.summary || 'Update this transaction').slice(0, 140);
  const detail = [
    patch.tax_cat !== undefined ? `category → *${patch.tax_cat}*` : null,
    patch.note !== undefined ? `note → _${patch.note}_` : null,
    patch.one_time !== undefined ? `one-off → *${patch.one_time ? 'yes' : 'no'}*` : null,
    patch.status !== undefined ? `status → *${patch.status}*` : null,
  ].filter(Boolean).join(' · ');
  const text = `${summary}\n${row.date} · ${row.vendor} · ${money}\n${detail}`;
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: `*${summary}*\n${row.date} · ${row.vendor} · ${money}\ncurrently *${row.tax_cat || 'uncategorized'}*\n${detail}` } },
    { type: 'actions', elements: [
      { type: 'button', action_id: 'ask_apply', style: 'primary', text: { type: 'plain_text', text: 'Apply' }, value: JSON.stringify({ ask: { id, patch } }) },
      { type: 'button', action_id: 'ask_cancel', text: { type: 'plain_text', text: 'No thanks' }, value: JSON.stringify({ ask: { cancel: true } }) },
    ] },
  ];
  return { text, blocks };
}

/* The tap. Re-checks the close state, because minutes can pass between the
 * proposal and the tap and the month may have been closed in between. */
export async function applyAskEdit(env, ask, h) {
  const id = Number(ask?.id);
  const patch = ask?.patch || {};
  const row = await env.DB.prepare('SELECT id, month, vendor, amount, type FROM transactions WHERE id = ?1').bind(id).first();
  if (!row) return { error: `That transaction (id ${id}) is gone.` };
  if ((await h.monthStatus(env, row.month)) === 'closed') return { error: `${row.month} has been closed since this was proposed. Reopen it first.` };
  const sets = [], binds = [];
  if (patch.tax_cat !== undefined) {
    sets.push(`tax_cat = ?${binds.push(patch.tax_cat) + 1}`);
    if (row.type === 'out') sets.push(`bucket = ?${binds.push(h.bucketFor(patch.tax_cat)) + 1}`);
  }
  if (patch.note !== undefined) sets.push(`note = ?${binds.push(patch.note) + 1}`);
  if (patch.one_time !== undefined) sets.push(`one_time = ?${binds.push(patch.one_time) + 1}`);
  if (patch.status !== undefined) sets.push(`status = ?${binds.push(patch.status) + 1}`);
  if (patch.tax_cat !== undefined && patch.status === undefined) sets.push("status = 'ok'");
  if (!sets.length) return { error: 'Nothing to apply.' };
  await env.DB.prepare(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ?1`).bind(id, ...binds).run();
  if (patch.tax_cat !== undefined && row.type === 'out') await h.learnDefault(env, row.vendor, h.bucketFor(patch.tax_cat), patch.tax_cat);
  return { ok: true, vendor: row.vendor, amount: row.amount };
}

const SLACK_TOOLS = (d) => [
  { def: { name: 'send_report',
      description: 'Post the finished Profit & Loss PDF statement into this Slack channel, with the standard summary. Use this when asked for "the report", "the P&L", a statement, or a PDF. Do NOT use it for figures in the chat or a written summary; answer those yourself.',
      input_schema: { type: 'object', properties: { period: { type: 'string', enum: ['month', 'quarter', 'year'] }, anchor: { type: 'string', description: "Any month inside the period, 'YYYY-MM'." } }, required: ['period', 'anchor'] } },
    run: async (env, input, ctx) => {
      const period = ['month', 'quarter', 'year'].includes(input?.period) ? input.period : 'month';
      const anchor = /^\d{4}-\d{2}$/.test(input?.anchor || '') ? input.anchor : d.monthOf(d.centralDate(Date.now() / 1000));
      const res = await d.sendStatement(env, period, anchor).catch(e => ({ error: String(e.message || e) }));
      return res?.sent ? { text: 'Sent. The PDF and its summary are now in the channel. Reply with at most one short sentence and do not repeat the figures.', flags: { sentPdf: true } }
        : { is_error: true, text: 'Could not send the statement: ' + (res?.error || res?.skipped || 'unknown') };
    } },
  { def: { name: 'propose_update',
      description: 'Propose a change to ONE transaction. This does NOT apply the change: it posts a confirmation button in Slack and Cole taps it to apply. Use it when asked to recategorize, re-note, or flag something. Look the row up first so you have its id. Amounts, dates and deletions cannot be changed this way; say so and point at the app.',
      input_schema: { type: 'object', properties: {
        id: { type: 'integer', description: 'transactions.id' },
        tax_cat: { type: 'string', description: 'New tax category, from the live list. The bucket follows automatically.' },
        note: { type: 'string' }, one_time: { type: 'boolean' },
        status: { type: 'string', enum: ['ok', 'review'] },
        summary: { type: 'string', description: 'One short line describing the change for the button, e.g. "Recategorize Anthropic $340 to Software".' } }, required: ['id', 'summary'] } },
    run: async (env, input, ctx) => {
      const taxCats = d.safeJson(await d.getSetting(env, 'taxCats'), []) || [];
      const p = await buildProposal(env, input, taxCats, d.h());
      if (p.error) return { is_error: true, text: p.error };
      await ctx.say(p.text, p.blocks);
      return { text: 'Proposed. The confirmation button is posted; Cole applies it with a tap. Reply with at most one short sentence.', flags: { proposed: true } };
    } },
];

/* ------------------------------------------------------------------ */
/*  assembly                                                           */
/* ------------------------------------------------------------------ */

/**
 * @param d  the worker's functions: getSetting, putSetting, safeJson, centralDate,
 *           monthOf, addMonthsYmd, validMonth, slack, sendStatement, monthStatus,
 *           bucketFor, learnDefault, resolveReport, periodReport, seriesSummary,
 *           bankBalances, dashSummary, recentRevenueAvg, getMoney, getNotify
 */
export function buildController(d) {
  const secretKey = makeSecretKey(['plaidItems', 'driveAuth', 'driveOauthState', 'passwordHash', 'allowedEmails', 'ownerEmail', 'ownerUserId', 'stripeMap']);
  let engine;
  const rawViews = buildViews(d);
  /* the findings view needs the engine, which needs the views: close the loop lazily */
  const views = Object.fromEntries(Object.entries(rawViews).map(([k, fn]) => [k, (env, a, ctx) => fn(env, a, ctx, engine)]));
  const app = makeAppView({ views, blurbs: VIEW_BLURBS, secretKey, getSetting: d.getSetting, safeJson: d.safeJson, fallbackTables: TABLES });

  const h = () => ({
    getSetting: d.getSetting, putSetting: d.putSetting, safeJson: d.safeJson, centralDate: d.centralDate, monthOf: d.monthOf,
    addMonthsYmd: d.addMonthsYmd, slack: d.slack, monthStatus: d.monthStatus, bucketFor: d.bucketFor, learnDefault: d.learnDefault,
    ...app,
  });
  d.h = h;

  engine = createAssistant({
    name: 'Controller', app: 'Mobius Ledger', memoryPrefix: 'controller', owner: 'Cole',
    who: WHO, schema: SCHEMA, rules: RULES, tables: TABLES, blobColumns: ['report_json'],
    brief: DEFAULT_BRIEF,
    liveContext: async (env) => '## The live tax category list (use these values verbatim)\n' + JSON.stringify(d.safeJson(await d.getSetting(env, 'taxCats'), []) || []),
    checkKinds: ['unpaid', 'duplicate', 'price-creep', 'missing-bill', 'close', 'bank-feed'],
    checks: (env, hh) => runChecks(env, hh, d),
    snapshot: (env, hh) => snapshot(env, hh, d),
    slackTools: SLACK_TOOLS(d),
  });
  return { engine, h, views: app };
}
