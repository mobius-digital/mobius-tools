/* Mobius Ledger v6: Books (Transactions, Receipts, Close), Clients (Retainers,
   Invoices and Stripe, Contractors) and Reports (Statements, CPA pack,
   Controller reports). Transactions and Receipts are the engine's own
   screens; the Close keeps the engine's checks in the v6 layout; the
   statement is the engine's tab, hosted. */
'use strict';

/* ---- Books ---- */
SCREENS.txns = () => renderTxns();
SCREENS.receipts = () => renderReceipts();

async function renderCloseV6() {
  const m = $('#main'), my = S.rt, mo = S.month, closeWord = word('close');
  m.innerHTML = pageHead(`${closeWord}: ${moName(mo)}`, 'The month-end checklist, checking itself.') + skPage({ tiles: 0, chart: false, rows: 8 });
  let rep; try { await loadTxns(); rep = await api('/api/report?month=' + mo); } catch (e) { if (!stale(my)) m.innerHTML = errorCard(e, 'renderCloseV6()'); return; }
  if (stale(my)) return;
  const closed = moState(mo) === 'closed', t = S.txns || [], service = ED.id === 'service';
  const expected = t.filter(x => x.expected === 1);
  const review = t.filter(x => x.status === 'review' && !x.expected);
  const noRcpt = t.filter(x => x.type === 'out' && !x.expected && !x.receipt_key && !x.receipt_skip);
  const sales = t.filter(x => x.type === 'in' && !x.expected), hasFee = t.some(x => x.type === 'fee');
  /* the same spend counted twice: one row typed in, another for the same amount from the bank */
  const dupes = t.filter(a => !a.plaid_id && !a.expected && a.type !== 'transfer' && t.some(b => b.plaid_id && !b.expected && b.type === a.type && Math.abs(b.amount - a.amount) < 0.01));
  const mm = +mo.slice(5, 7);
  const rec = (S.boot.vendors || []).filter(v => v.recurring && v.active && (v.cadence !== 'yearly' || v.renew_month === mm));
  const seen = t.map(x => String(x.vendor || '').toLowerCase());
  const unbilled = rec.filter(v => { const f = v.name.toLowerCase().split(' ')[0]; return !seen.some(n => n.includes(f) || v.name.toLowerCase().includes(n.split(' ')[0])); });
  const item = (state, title, sub, go) => `<div class="cli ${state}"><div class="ic">${state === 'ok' ? icon('check', 13) : state === 'warn' ? '!' : 'i'}</div><div><b>${title}</b><p>${sub}</p></div>${go && state !== 'ok' ? `<span class="go" onclick="${go}">Fix ›</span>` : ''}</div>`;
  const checks = [
    item(sales.length ? 'ok' : 'warn', `${word('revenue')} is in`, sales.length ? `${fmt$(rep.report.revenue)} across ${plural(sales.length, 'payment')}.` : `No confirmed money-in rows yet. ${service ? 'Add the client payments for this month.' : 'Add what came in this month.'}`, `S.filter='in';show('txns')`),
    service ? item(expected.length ? 'warn' : 'ok', 'Client payments confirmed', expected.length ? `${plural(expected.length, 'expected payment')} still waiting. Confirm each landed, or remove the ones that did not.` : 'Every expected payment was confirmed.', `S.filter='expected';show('txns')`) : '',
    item(unbilled.length ? 'info' : 'ok', 'Recurring bills all arrived', unbilled.length ? `${unbilled.length} did not bill this month: ${unbilled.slice(0, 5).map(v => esc(v.name)).join(', ')}${unbilled.length > 5 ? '...' : ''}. Fine if cancelled, or the bank may name it differently. Nothing is counted either way.` : 'Every recurring vendor billed as usual.'),
    item(review.length ? 'warn' : 'ok', 'Everything categorized', review.length ? `${plural(review.length, 'row')} still ${review.length === 1 ? 'needs' : 'need'} a category.` : 'Every row has a category.', `S.filter='review';show('txns')`),
    service ? item(hasFee ? 'ok' : 'info', 'Stripe fees in', hasFee ? `${fmt$(rep.report.fees)}, the exact figure from Stripe.` : 'No Stripe fees recorded for this month yet. They arrive with the nightly sync.', `SET.sec='banks';show('settings')`) : '',
    item(dupes.length ? 'warn' : 'ok', 'Nothing counted twice', dupes.length ? `${plural(dupes.length, 'typed-in row')} ${dupes.length === 1 ? 'matches' : 'match'} a bank line for the same amount: ${dupes.slice(0, 3).map(d => esc(d.vendor)).join(', ')}${dupes.length > 3 ? '...' : ''}. Delete the one that is not from the bank.` : 'No row appears twice; every bank line is counted once.', `S.q='';S.filter='all';show('txns')`),
    item(noRcpt.length ? 'info' : 'ok', 'Receipts attached', noRcpt.length ? `${plural(noRcpt.length, 'expense')} missing a receipt. Fine to close; the ${word('pack')} lists them.` : 'Every expense carries its receipt.', `show('receipts')`),
  ].join('');
  const warn = (review.length ? 1 : 0) + (dupes.length ? 1 : 0) + (!sales.length ? 1 : 0) + (service && expected.length ? 1 : 0);
  const lead = closed ? `<b>Closed.</b> Amounts and dates are frozen; categories, notes and receipts can still change.`
    : warn ? `<b>${plural(warn, 'thing')} to clear</b> before this month is ready. Closing takes a photo of the numbers so a late bank line or a re-dated receipt can never move a statement you already sent.`
    : `<b>Ready to close.</b> Closing takes a photo of the numbers so a late bank line or a re-dated receipt can never move a statement you already sent.`;
  m.innerHTML = pageHead(`${closeWord}: ${moName(mo)}`, lead,
    closed ? `<button class="btn" onclick="reopenMonth()">Reopen ${moShort(mo)}</button><button class="btn primary" onclick="S.reportMonth='${mo}';show('statements')">${icon('file-text')} ${word('statement')}</button>` : `<button class="btn primary big" onclick="doClose()">Close ${moName(mo)} ›</button>`) + `
    <div class="v2">
      <div class="two">
        <div class="clx">${checks}</div>
        <div class="stack">
          ${card('This month so far', '', lnRow(word('revenue'), '', money0(rep.report.revenue || 0)) + (service ? lnRow('Stripe fees', 'taken automatically', money0(rep.report.fees || 0)) : '') + lnRow(word('spend'), '', money0(rep.report.expenses || 0)) + lnRow(word('net'), '', money0(rep.report.net || 0), rep.report.net < 0 ? 'bad' : 'good') + lnRow('Rows', `${t.filter(x => !x.expected).length} in the month`, '') + `<p class="note">Closing freezes amounts and dates. A late receipt for a closed month can still be attached; only new or re-dated money rows are refused.</p>`)}
          ${card('When', '', `<div class="steps"><div><b>Around the 5th</b>Once the bank feed for the month is complete.</div><div><b>Receipts are not required</b>Missing ones are just listed in the ${word('pack')}.</div><div><b>Changed your mind</b>Reopen from this page; the month unlocks until you close it again.</div></div>`)}
        </div>
      </div>
      <div class="msg" id="clMsg"></div>
    </div>`;
}
SCREENS.close = renderCloseV6;
renderClose = renderCloseV6;

/* ---- Clients ---- */
async function renderRetainers() {
  const m = $('#main'), my = S.rt, cur = nowMonth(), range = presetRange(RP.preset, RP);
  m.innerHTML = pageHead('Retainers', 'Who pays the bills, and how much the business leans on each one.') + skPage({ tiles: 4, chart: false });
  let ser, txns; try { [ser, txns] = await Promise.all([getSeries(range[0], range[1]), api('/api/transactions?month=' + cur).then(r => r.transactions || []).catch(() => [])]); } catch (e) { if (!stale(my)) m.innerHTML = errorCard(e, 'renderRetainers()'); return; }
  if (stale(my)) return;
  const months = ser.months.filter(x => x.month >= firstMonth()), n = Math.max(1, months.length), T = addUp(months), total = T.revenue || 1;
  const ranked = Object.entries(T.byClient).filter(([, v]) => Math.abs(v) >= 0.5).sort((p, q) => q[1] - p[1]);
  const top = ranked[0], topShare = top ? top[1] / total * 100 : 0, top3 = sumOf(ranked.slice(0, 3), x => x[1]) / total * 100;
  const book = S.boot.clients || [], activeN = book.filter(x => x.active).length, bookTotal = sumOf(book.filter(x => x.active), clientMonthly);
  const paidMonths = name => months.filter(x => (x.byClient?.[name] || 0) > 0);
  const board = retainerBoard(txns);
  const lead = !top ? `No revenue in ${esc(rangeLabel(range))} yet. The retainer book expects <b>${money0(bookTotal)}</b> a month from ${plural(activeN, 'active client')}.`
    : topShare > 40 ? `<b class="bad">${esc(top[0])} is ${Math.round(topShare)}% of revenue.</b> Losing them would cut revenue by that much overnight; lenders read anything over about a quarter as concentration risk. ${plural(ranked.length, 'client')} paid <b>${money0(T.revenue)}</b> in ${esc(rangeLabel(range))}.`
    : topShare > 25 ? `<b>${esc(top[0])} is ${Math.round(topShare)}% of revenue.</b> Worth watching: past about a quarter, one client leaving is a real hit. ${plural(ranked.length, 'client')} paid <b>${money0(T.revenue)}</b> in ${esc(rangeLabel(range))}.`
    : `<b class="good">No client is more than ${Math.ceil(topShare)}% of revenue.</b> Revenue is spread out, which is what a lender wants to see. ${plural(ranked.length, 'client')} paid <b>${money0(T.revenue)}</b> in ${esc(rangeLabel(range))}.`;
  m.innerHTML = pageHead('Retainers', lead, `<button class="btn" onclick="SET.sec='clients';show('settings')">${icon('settings')} The client list</button><button class="btn primary" onclick="addClientModal()">${icon('plus')} Add client</button>`) + `
    <div class="v2">
      <div class="tiles">
        ${tile({ label: 'Revenue', value: money0(T.revenue), sub: `from ${plural(ranked.length, 'client')} · ${esc(rangeLabel(range))}` })}
        ${tile({ label: 'Biggest client', value: `${Math.round(topShare)}%`, tone: topShare > 40 ? 'bad' : topShare > 25 ? 'warn' : 'good', sub: top ? `<b>${esc(top[0])}</b> · the top three are ${Math.round(top3)}%` : 'nobody yet' })}
        ${tile({ label: 'Per client, per month', value: ranked.length ? money0(T.revenue / n / ranked.length) : '·', sub: 'average across paying clients' })}
        ${tile({ label: 'Retainer book', value: money0(bookTotal), sub: `a month from ${plural(activeN, 'active client')}`, go: "SET.sec='clients';show('settings')", goTitle: 'Edit the list' })}
      </div>
      <div class="two">
        ${card('Every client', 'Totals, consistency and what the book expects. A client with a % of ad spend is variable: its expectation is the last three months\' average.', `<div class="tbl-wrap"><table class="st rt"><thead><tr><th>Client</th><th>Revenue</th><th>Share</th><th>Months paid</th><th>Average paid month</th><th>Last paid</th><th>Retainer on file</th></tr></thead><tbody>
          ${ranked.map(([k, v]) => { const pm = paidMonths(k); const bk = book.find(x => x.name === k); return `<tr><td><b>${esc(k)}</b>${bk && !bk.active ? ' <span class="pill">paused</span>' : ''}</td><td>${money0(v)}</td><td>${pctOf(v, total)}</td><td>${pm.length} of ${n}</td><td>${pm.length ? money0(v / pm.length) : '·'}</td><td>${pm.length ? moName(pm[pm.length - 1].month) : '·'}</td><td class="pc">${bk ? money0(clientMonthly(bk)) + (bk.pct ? ` + ${bk.pct}%` : '') : 'not in the book'}</td></tr>`; }).join('') || '<tr><td colspan="7" class="hint">No revenue in this period.</td></tr>'}
        </tbody></table></div>`)}
        <div class="stack">
          ${card(`This month, ${moName(cur)}`, `${board.paidCount} of ${board.active.length} paid · ${money0(board.expTotal)} expected. Green is a confirmed payment this month.`, `<div class="rboard">${board.tiles || '<p class="hint">No clients yet.</p>'}</div>`, `<button class="btn sm ghost" onclick="setMonth('${cur}','invoices')">Invoices ›</button>`)}
          ${card('How concentrated', 'Share of revenue in the period. The bigger one slice, the more the business depends on one relationship.', rankList(ranked.slice(0, 8), total, 'in'))}
        </div>
      </div>
    </div>`;
}
SCREENS.retainers = renderRetainers;

async function renderInvoices() {
  const m = $('#main'), my = S.rt, mo = S.month;
  m.innerHTML = pageHead('Invoices and Stripe', `What landed in ${moName(mo)}, what is still expected, and the Stripe feed.`) + skPage({ tiles: 4, chart: false });
  try { await loadTxns(); } catch (e) { if (!stale(my)) m.innerHTML = errorCard(e, 'renderInvoices()'); return; }
  if (stale(my)) return;
  const t = S.txns || [], inTx = t.filter(x => x.type === 'in' && !x.expected), expected = t.filter(x => x.expected === 1), fees = t.filter(x => x.type === 'fee');
  const byClient = {}; for (const x of inTx) (byClient[x.vendor] ||= []).push(x);
  const groups = Object.entries(byClient).map(([k, rows]) => ({ k, rows, sum: sumOf(rows, 'amount'), stripe: rows.some(r => r.source === 'stripe') })).sort((a, b) => b.sum - a.sum);
  const got = sumOf(inTx, 'amount'), waiting = sumOf(expected, 'amount'), feeTotal = sumOf(fees, 'amount');
  const stripeN = inTx.filter(x => x.source === 'stripe').length;
  const lead = `<b>${money0(got)}</b> came in from ${plural(groups.length, 'client')} in ${moName(mo)}${stripeN ? `, ${stripeN} of ${inTx.length} payments through Stripe` : ''}.${expected.length ? ` <b>${money0(waiting)}</b> is still expected from ${plural(expected.length, 'client')}.` : ' Nothing is still expected.'}${feeTotal ? ` Stripe kept <b>${money0(feeTotal)}</b> in fees.` : ''}`;
  m.innerHTML = pageHead('Invoices and Stripe', lead, `<button class="btn primary" onclick="addModal({type:'in'})" ${moState(mo) === 'closed' ? 'disabled' : ''}>${icon('plus')} Record a payment</button>`) + `
    <div class="v2">
      <div class="tiles">
        ${tile({ label: `Collected, ${moShort(mo)}`, value: money0(got), sub: `${plural(inTx.length, 'payment')} from ${plural(groups.length, 'client')}` })}
        ${tile({ label: 'Still expected', value: money0(waiting), tone: expected.length ? 'warn' : '', sub: expected.length ? `${plural(expected.length, 'payment')} not landed yet` : 'every expected payment landed', go: "S.filter='expected';show('txns')", goTitle: 'Open in Transactions' })}
        ${tile({ label: 'Stripe fees', value: money0(feeTotal), sub: fees.length ? `${plural(fees.length, 'fee row')}, the exact figures from Stripe` : 'none recorded yet this month' })}
        ${tile({ label: 'Stripe', value: `<span style="font-size:17px">${S.boot.stripeConfigured ? 'Connected' : 'Not connected'}</span>`, sub: S.boot.stripeConfigured ? 'charges, refunds and fees sync every night' : 'the key goes on the worker' })}
      </div>
      <div class="two">
        ${card(`Paid in ${moName(mo)}`, 'Every money-in row this month, grouped by client. Click a client to see the rows.', groups.length ? groups.map(g => lnRow(esc(g.k) + (g.stripe ? ' <span class="src">stripe</span>' : ''), g.rows.map(r => `${fmtDate(r.date)} ${fmt$(r.amount)}`).join(', '), money0(g.sum)).replace('class="ln"', `class="ln click" onclick="S.q=${JSON.stringify(g.k).replace(/"/g, '&quot;')};S.filter='in';show('txns')"`)).join('') : empty('inbox', `Nothing has landed in ${moName(mo)} yet.`))}
        <div class="stack">
          ${card('Still expected', 'Pre-created from the client list. Confirm each when it lands, or remove the ones that will not.', expected.length ? expected.map(r => lnRow(esc(r.vendor), `expected ${fmtDate(r.date)}`, money0(r.amount), 'warn')).join('') + `<div class="row" style="margin-top:12px"><button class="btn" onclick="S.filter='expected';show('txns')">Confirm in Transactions</button></div>` : '<p class="hint">Nothing waiting.</p>')}
          ${card('Stripe', S.boot.stripeConfigured ? 'Charges, refunds and exact fees sync every night, re-pulling the last 10 days so late data corrects itself. A payment from a new Stripe customer lands in review once; name the client and it matches forever.' : 'Not connected. Paste a restricted key into the worker and push it.', S.boot.stripeConfigured ? `<div class="row"><button class="btn" onclick="stripeSyncNow(this)">${icon('refresh')} Sync the last 60 days</button><span class="msg" id="ssMsg"></span></div>` : '')}
        </div>
      </div>
    </div>`;
}
SCREENS.invoices = renderInvoices;

async function renderContractors() {
  const m = $('#main'), my = S.rt, cur = nowMonth(), y = RP.taxYear || cur.slice(0, 4);
  const to = y === cur.slice(0, 4) ? cur : `${y}-12`;
  m.innerHTML = pageHead('Contractors', 'Who was paid, and who needs a 1099.') + skPage({ tiles: 4, chart: false });
  let ser; try { ser = await getSeries(`${y}-01`, to); } catch (e) { if (!stale(my)) m.innerHTML = errorCard(e, 'renderContractors()'); return; }
  if (stale(my)) return;
  const T = addUp(ser.months), con = (ser.contractors || []).slice().sort((a, b) => b.amount - a.amount), total = sumOf(con, 'amount');
  const need = con.filter(v => v.amount >= 600), labor = T.revenue ? total / T.revenue * 100 : 0;
  const years = [...new Set(monthList(firstMonth(), cur).map(x => x.slice(0, 4)))].reverse();
  const lead = `<b>${money0(total)}</b> went to ${plural(con.length, 'contractor')} in ${y}, ${Math.round(labor)}% of revenue. <b>${need.length}</b> ${need.length === 1 ? 'was' : 'were'} paid $600 or more and ${need.length === 1 ? 'needs' : 'need'} a 1099-NEC by January 31, ${+y + 1}. Overseas contractors need a W-8BEN on file instead.`;
  m.innerHTML = pageHead('Contractors', lead, `<label class="hint">Year <select onchange="rtSet(this.value)">${years.map(v => `<option ${v === y ? 'selected' : ''}>${v}</option>`).join('')}</select></label><button class="btn" onclick="RP.preset='${y}';show('pack')">${icon('download')} 1099 summary in the CPA pack</button>`) + `
    <div class="v2">
      <div class="tiles">
        ${tile({ label: `Contract labor, ${y}`, value: money0(total), sub: `${plural(con.length, 'contractor')} paid` })}
        ${tile({ label: 'Share of revenue', value: `${Math.round(labor)}%`, tone: labor <= 45 ? 'good' : labor <= 60 ? 'warn' : 'bad', sub: 'agencies usually keep delivery labor under about half' })}
        ${tile({ label: 'Need a 1099', value: String(need.length), tone: need.length ? 'warn' : '', sub: `paid $600 or more in ${y}` })}
        ${tile({ label: 'Due', value: `<span style="font-size:17px">Jan 31, ${+y + 1}</span>`, sub: 'the 1099-NEC deadline' })}
      </div>
      ${card('Every contractor', 'Payments booked as Contract labor (1099). The amount is what left the bank; the CPA pack carries the same totals as a CSV.', con.length ? `<div class="tbl-wrap"><table class="st rt"><thead><tr><th>Contractor</th><th>Payments</th><th>Paid</th><th>Share</th><th>1099</th></tr></thead><tbody>${con.map(v => `<tr><td><b>${esc(v.vendor)}</b></td><td>${v.n}</td><td>${money0(v.amount)}</td><td class="pc">${pctOf(v.amount, total)}</td><td>${v.amount >= 600 ? '<span class="pill warn">needed</span>' : '<span class="pill">under $600</span>'}</td></tr>`).join('')}<tr class="tot"><td>Total</td><td></td><td>${money0(total)}</td><td></td><td></td></tr></tbody></table></div>` : empty('users', `No contract labor booked in ${y}.`))}
    </div>`;
}
SCREENS.contractors = renderContractors;

/* ---- Reports ---- */
async function renderStatements() {
  const my = S.rt; S.reportMonth = S.month;
  await hostReport(`${word('statement')}, ${moName(S.month)}`, 'One month, line by line, down to each charge. Open any line to see every row behind it. The PDF is what the CPA gets.', reportStatement, my);
}
SCREENS.statements = renderStatements;

function renderPack() {
  const m = $('#main'), range = presetRange(RP.preset, RP), [a, b] = range;
  const pdf = pdfPeriod(range), cmp = compareRange(range, RP.compare), cmpOk = cmp && cmp[0] >= firstMonth(), lab = esc(rangeLabel(range));
  m.innerHTML = pageHead(word('pack'), `Everything the CPA asks for, for <b>${lab}</b>: the P&amp;L by tax category, the full ledger as CSV, contractor totals for 1099s, the open questions, and the receipts as a ZIP. Change the period in the top bar.`) + `
    <div class="v2">
      <div class="two even">
        ${card('Profit and loss PDF', 'The formatted statement, ready to send.', `<div class="row">
          <button class="btn primary" onclick="downloadPdf({from:'${a}',to:'${b}'},this)">${icon('download')} Summary</button>
          ${a !== b ? `<button class="btn" onclick="downloadPdf({from:'${a}',to:'${b}',layout:'month'},this)">${icon('download')} By month</button><button class="btn" onclick="downloadPdf({from:'${a}',to:'${b}',layout:'quarter'},this)">${icon('download')} By quarter</button>` : ''}
          ${cmpOk ? `<button class="btn" onclick="downloadPdf({from:'${a}',to:'${b}',cmpFrom:'${cmp[0]}',cmpTo:'${cmp[1]}'},this)">${icon('download')} vs ${esc(rangeLabel(cmp))}</button>` : ''}</div>
          ${pdf && S.boot.slackConfigured ? `<div class="row" style="margin-top:12px"><button class="btn ghost" onclick="S.reportMonth='${pdf.month}';reportToSlack(this,'${pdf.period}')">${icon('send')} Post it to the finance channel</button></div>` : ''}`)}
        ${card('Receipt archive', 'Every stored receipt for the period as one ZIP, foldered by month and category, named so a person can read it.', `<div class="row"><button class="btn primary" onclick="downloadReceipts('${a}','${b}',this)">${icon('download')} Receipts ZIP</button></div><p class="note">Once a year at tax time, keep it next to that year's return.</p>`)}
      </div>
      ${card(word('pack'), 'The PDF to read (profit and loss by month, 1099 totals, open questions) and the ledger CSV to pull into their software.', `<div class="row"><button class="btn primary" onclick="downloadPdf({from:'${a}',to:'${b}'},this,'/api/pack.pdf')">${icon('download')} ${word('pack')} PDF</button><button class="btn" onclick="loadPack('${a}','${b}')">Preview it here, with the CSV files</button></div><div id="packOut"></div>`)}
      ${card('How the books are kept', 'The notes the CPA needs before reading a number.', `<div class="steps"><div><b>${word('revenue')}</b>Counts in the month the invoice was paid${ED.id === 'service' ? '; Stripe payments carry their exact fee as a separate row' : ''}.</div><div><b>Expenses</b>Booked when the bank or card line lands, categorized to the CPA layer in Settings › Categories.</div><div><b>Kept out</b>Personal purchases, income tax and transfers between your own accounts are listed and never subtracted.</div><div><b>Closed months</b>Frozen with their statement; a late bank line for a closed month is refused, a late receipt is not.</div></div>`)}
    </div>`;
}
SCREENS.pack = renderPack;

async function renderCreports() {
  const m = $('#main'), my = S.rt, name = ED.assistant;
  m.innerHTML = pageHead(`${name} reports`, `The reports the ${name} built in chat, and the chats themselves. Ask for a new report any time.`, `<button class="btn primary" onclick="AskUI.open('Build me a report: ')">${icon('sparkles')} Ask for a report</button>`) + skCard(6);
  let reports = []; try { reports = (await api('/api/ask/reports')).reports || []; } catch (e) { if (!stale(my)) m.innerHTML = errorCard(e, 'renderCreports()'); return; }
  if (stale(my)) return;
  AskUI.state.reports = reports;
  let chats = []; try { chats = JSON.parse(localStorage.getItem('ask_chat_' + name.toLowerCase() + 's') || '[]'); } catch (e) {}
  const reportsCard = reports.length ? card('Every report', 'Newest first. Open shows it on screen; print makes the PDF.', `<div class="tbl-wrap"><table class="st"><thead><tr><th>Report</th><th>Built</th><th></th></tr></thead><tbody>${reports.map(r => `<tr><td>${esc(r.title)}<small>${esc(r.subtitle || '')}</small></td><td>${esc(new Date(r.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</td><td><button class="btn sm" onclick="AskUI.openReport('${esc(r.id)}')">Open</button> <button class="btn sm ghost" onclick="AskUI.openReport('${esc(r.id)}', true)">Print</button></td></tr>`).join('')}</tbody></table></div>`)
    : `<section class="card">${empty('file-text', 'No reports yet. Try "build me a cash forecast report for the next six months".', `<button class="btn" onclick="AskUI.open('Build me a cash forecast report for the next six months')">Ask for one</button>`)}</section>`;
  const chatsCard = card('Earlier chats', 'Kept in this browser. Open one to carry on where you left off.', chats.length ? chats.slice(0, 12).map(c => `<button class="chatrow2" onclick="AskUI.open();AskUI.openChat('${esc(c.id)}')"><span>${esc(c.title)}</span><small>${esc(new Date(c.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))} · ${plural(c.messages.length, 'message')}</small></button>`).join('') : '<p class="hint">No chats yet. Try "why was last month a loss?"</p>');
  const sk = m.querySelector('.sk-card'); if (sk) sk.outerHTML = `<div class="two">${reportsCard}${chatsCard}</div>`;
}
SCREENS.creports = renderCreports;
