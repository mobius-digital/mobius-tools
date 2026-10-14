/* Mobius Ledger v6: Money (Profit and loss, Balance sheet, Costs, Taxes) and
   (Business health was cut 2026-10-14: every one of its numbers already sits on Home, Profit and loss or Retainers; the old id routes to Profit and loss). The period and compare live in the top bar (the
   engine's RP). The P&L keeps the engine's arithmetic (getSeries, addUp,
   groupRows, compareRange, exportPnl, downloadPdf); Taxes hosts the engine's
   own tab. */
'use strict';

/* ---- Profit and loss, for any period ---- */
async function renderPnl() {
  const m = $('#main'), my = S.rt;
  const range = presetRange(RP.preset, RP);
  const summary = RP.layout === 'summary' || RP.layout == null;
  const wanted = summary ? compareRange(range, RP.compare) : null;
  const cmp = wanted && wanted[0] >= firstMonth() ? wanted : null;
  const title = ED.id === 'household' ? 'Year' : 'Profit and loss';
  m.innerHTML = pageHead(title, `${esc(rangeLabel(range))}${cmp ? ` against ${esc(rangeLabel(cmp))}` : ''}.`) + skPage({ tiles: 4 });
  let a, b;
  try { [a, b] = await Promise.all([getSeries(range[0], range[1]), cmp ? getSeries(cmp[0], cmp[1]).catch(() => null) : null]); }
  catch (e) { if (!stale(my)) m.innerHTML = errorCard(e, 'renderPnl()'); return; }
  if (stale(my)) return;
  const A = addUp(a.months);
  const hasB = b && b.months.some(x => x.revenue || x.expenses);
  const B = hasB ? addUp(b.months) : null;
  const cols = summary ? null : groupRows(a.months, RP.layout);
  const keysOf = f => [...new Set([...Object.keys(A[f]), ...(B ? Object.keys(B[f]) : [])])]
    .filter(k => Math.abs(A[f][k] || 0) >= 0.005 || Math.abs(B?.[f]?.[k] || 0) >= 0.005)
    .sort((p, q) => (A[f][q] || 0) - (A[f][p] || 0));
  const clientsK = keysOf('byClient'), catsK = keysOf('byTax');
  const money = v => v == null ? '<span class="pc">·</span>' : money0(v);
  const chg = (v, p) => p == null ? '<td></td>' : `<td class="${v - p < 0 ? 'neg' : ''}">${Math.abs(v - p) < 0.5 ? '<span class="pc">·</span>' : (v - p > 0 ? '+' : '−') + money0(Math.abs(v - p))}</td>`;
  const row = (name, getA, getB, cls = '', ofRev = true) => {
    if (cols) {
      const m0 = v => Math.abs(v || 0) < 0.5 ? '<span class="pc">·</span>' : money0(v);
      return `<tr class="${cls}"><td>${esc(name)}</td>${cols.map(c => `<td>${m0(getA(c))}</td>`).join('')}<td><b>${m0(getA(A))}</b></td></tr>`;
    }
    const va = getA(A), vb = B ? getB(B) : null;
    return `<tr class="${cls}"><td>${esc(name)}</td><td>${money(va)}</td>${B ? `<td>${money(vb)}</td>${chg(va, vb)}` : ''}<td class="pc">${ofRev && A.revenue ? pctOf(va, A.revenue) : ''}</td></tr>`;
  };
  const span = cols ? cols.length + 2 : (B ? 5 : 3);
  const sec = t => `<tr class="sec"><td colspan="${span}">${t}</td></tr>`;
  const head = cols
    ? `<th>Line</th>${cols.map(c => `<th>${c.label}</th>`).join('')}<th>Total</th>`
    : `<th>Line</th><th>${esc(rangeLabel(range))}</th>${B ? `<th>${esc(rangeLabel(cmp))}</th><th>Change</th>` : ''}<th>% of ${word('revenueLow')}</th>`;
  window.__pnl = { range, cols, A, clientsK, catsK, pdfq: { from: range[0], to: range[1], layout: cols ? RP.layout : '', cmpFrom: B ? cmp[0] : '', cmpTo: B ? cmp[1] : '' } };
  const costs = [...catsK.map(k => [k, A.byTax[k] || 0]), ...(A.fees ? [[word('fees'), A.fees]] : [])].filter(x => x[1] > 0).sort((x, z) => z[1] - x[1]);
  const ms = a.months, mrows = ms.map(x => ({ x: moShort(x.month) + (ms.length > 12 ? ' ' + x.month.slice(2, 4) : ''), v: x.revenue, v2: x.net, m: x.month }));
  const kept = ED.id === 'household' ? 'kept' : 'of every dollar';
  const verdict = A.net >= 0 ? `${ED.id === 'household' ? 'You kept' : 'The business made'} <b class="good">${money0(A.net)}</b> on ${money0(A.revenue)} of ${word('revenueLow')}, ${pctOf(A.net, A.revenue)} ${kept}.` : `${ED.id === 'household' ? 'You spent' : 'The business lost'} <b class="bad">${money0(Math.abs(A.net))}</b> ${ED.id === 'household' ? 'more than came in' : ''} on ${money0(A.revenue)} of ${word('revenueLow')}.`;
  const biggest = costs[0] ? ` The biggest cost was <b>${esc(costs[0][0])}</b> at ${money0(costs[0][1])}.` : '';
  const basis = `${word('revenue')} counts in the month the invoice was paid. Personal purchases, income tax and transfers are real money but not business costs, so they are listed and not subtracted. ${a.months.filter(x => x.status === 'closed').length} of ${a.months.length} months are closed and frozen.`;
  const layoutSeg = `<div class="seg">${[['summary', 'Summary'], ['month', 'By month'], ['quarter', 'By quarter']].map(([k, l]) => `<button class="${(RP.layout || 'summary') === k ? 'on' : ''}" onclick="setRP('layout','${k}')">${l}</button>`).join('')}</div>`;
  m.innerHTML = pageHead(title, verdict + biggest, `${layoutSeg}<button class="btn" onclick="exportPnl()">${icon('download')} CSV</button><button class="btn" onclick="downloadPdf(window.__pnl.pdfq,this)">${icon('file-text')} PDF</button>`) + `
    <div class="v2">
      <div class="tiles">
        ${tile({ label: word('revenue'), value: money0(A.revenue), sub: B ? delta(A.revenue, B.revenue, 'vs ' + rangeLabel(cmp)) : `${clientsK.length} ${word('payers')} paid in ${esc(rangeLabel(range))}` })}
        ${tile({ label: word('spend'), value: money0(A.spend), sub: B ? delta(A.spend, B.spend, 'vs ' + rangeLabel(cmp), true) : `${pctOf(A.spend, A.revenue)} of ${word('revenueLow')}${A.fees ? `, including ${money0(A.fees)} of ${word('fees').toLowerCase()}` : ''}` })}
        ${tile({ label: word('net'), value: money0(A.net), tone: A.net >= 0 ? 'good' : 'bad', sub: B ? delta(A.net, B.net, 'vs ' + rangeLabel(cmp)) : `${pctOf(A.net, A.revenue)} of ${word('revenueLow')} kept` })}
        ${ED.id === 'household' ? tile({ label: 'Average month', value: money0(ms.length ? A.net / ms.length : 0), sub: `${word('netLow')} across ${ms.length} month${ms.length === 1 ? '' : 's'}` })
          : tile({ label: 'Set aside for tax', value: money0(A.taxes), sub: `${S.boot.money.taxPct}% of ${word('netLow')}, the rate in Settings › Money rules`, go: "show('taxes')", goTitle: 'Open Taxes' })}
      </div>
      <div class="two">
        ${card(`${esc(rangeLabel(range))}${B ? ` vs ${esc(rangeLabel(cmp))}` : ''}`, `Read top to bottom: ${word('revenueLow')}, minus every expense, line by line.`,
          `<div class="tbl-wrap"><table class="st ${cols ? 'cols' : 'rt'}"><thead><tr>${head}</tr></thead><tbody>
            ${sec(word('revenue'))}
            ${clientsK.map(k => row(k, x => x.byClient?.[k] || 0, x => x.byClient?.[k] || 0, 'sub')).join('')}
            ${row(`Total ${word('revenueLow')}`, x => x.revenue, x => x.revenue, 'tot')}
            ${sec(word('spend'))}
            ${catsK.map(k => row(k, x => x.byTax?.[k] || 0, x => x.byTax?.[k] || 0, 'sub')).join('')}
            ${A.fees || B?.fees ? row(word('fees'), x => x.fees || 0, x => x.fees || 0, 'sub') : ''}
            ${row(`Total ${word('spendLow')}`, x => (x.expenses || 0) + (x.fees || 0), x => (x.expenses || 0) + (x.fees || 0), 'tot')}
            ${row(word('net'), x => x.net, x => x.net, 'net')}
            ${ED.id === 'household' ? '' : `${sec(`After ${word('netLow')}`)}
            ${row(`Set aside for tax (${S.boot.money.taxPct}%)`, x => x.taxes || 0, x => x.taxes || 0, 'sub dim')}
            ${A.distributions ? row('Distributions', x => x.distributions || 0, x => x.distributions || 0, 'sub dim') : ''}`}
            ${sec('Kept out on purpose')}
            ${row('Personal purchases', x => x.personal || 0, x => x.personal || 0, 'sub dim', false)}
            ${row('Income tax paid', x => x.incomeTax || 0, x => x.incomeTax || 0, 'sub dim', false)}
            ${row('Transfers between your accounts', x => x.transfers || 0, x => x.transfers || 0, 'sub dim', false)}
          </tbody></table></div>
          <p class="note">${esc(basis)} The PDF matches the screen: period, layout and comparison.</p>`)}
        <div class="stack">
          ${card('Where the money went', `Every expense line in the period as a share of the total. The biggest slice is the first thing to question.`, rankList(costs.slice(0, 10), costs.reduce((s, x) => s + x[1], 0)))}
          ${card('Month by month', `${word('revenue')} in green, ${word('netLow')} in gold. Hover for the numbers; click a month to open its statement.`, `<div class="lg"><span><i></i>${word('revenue')}</span><span><i class="gold"></i>${word('net')}</span></div>` + lineChart('cMo', mrows, { key2: true, h: 200 }))}
        </div>
      </div>
    </div>`;
  wireLine('cMo', mrows, { key2: true, tip: r => `<b>${esc(r.x)}</b><br>${word('revenue')} ${money0(r.v)}<br>${word('net')} ${money0(r.v2)}` });
  const svg = document.getElementById('cMo'); if (svg && mrows.length > 1) svg.onclick = e => { const r = svg.getBoundingClientRect(); const i = Math.max(0, Math.min(mrows.length - 1, Math.round(((e.clientX - r.left) / r.width * CHART.w - CHART.pl) / (CHART.w - CHART.pl - CHART.pr) * (mrows.length - 1)))); S.reportMonth = mrows[i].m; setMonth(mrows[i].m, 'statements'); };
}
SCREENS.pnl = renderPnl;

/* ---- Balance sheet: a photo of today ---- */
async function renderBalance() {
  const m = $('#main'), my = S.rt, cur = nowMonth(), y = cur.slice(0, 4);
  m.innerHTML = pageHead('Balance sheet', 'A photo of today, not a period.') + skPage({ tiles: 4, chart: false });
  let bal, ser; try { [bal, ser] = await Promise.all([getBalances(), getSeries(`${y}-01`, cur).catch(() => null)]); } catch (e) { if (!stale(my)) m.innerHTML = errorCard(e, 'renderBalance()'); return; }
  if (stale(my)) return;
  const accts = (bal.accounts || []).filter(a => !a.error);
  const cashAccts = accts.filter(a => a.type === 'depository'), cards = accts.filter(a => a.type === 'credit');
  const ytd = ser ? addUp(ser.months.filter(x => x.month >= firstMonth())) : null;
  const taxAside = ytd ? Math.max(0, ytd.taxes - (ytd.incomeTax || 0)) : 0;
  const ta = cashAccts.reduce((s, a) => s + (a.current || 0), 0), tl = cards.reduce((s, a) => s + (a.current || 0), 0);
  const net = ta - tl;
  const lead = bal.connected
    ? `${ED.id === 'household' ? 'You have' : 'The business has'} <b>${money0(ta)}</b> in the bank and owes <b>${money0(tl)}</b> on cards, so what is really yours is <b class="${net >= 0 ? 'good' : 'bad'}">${money0(net)}</b>${taxAside ? `, of which <b>${money0(taxAside)}</b> is set aside for tax and not yours to spend` : ''}. Bank balances as of ${bal.at ? new Date(bal.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'the last sync'}.`
    : 'No bank is connected yet, so there is nothing to photograph. Connect one in Settings › Banks and cards.';
  m.innerHTML = pageHead('Balance sheet', lead, bal.connected ? `<button class="btn" onclick="refreshBalances(this)">${icon('refresh')} Ask the bank again</button>` : '') + `
    <div class="v2">
      <div class="tiles">
        ${tile({ label: 'In the bank', value: money0(ta), sub: cashAccts.length ? cashAccts.map(a => esc(a.name)).join(', ') : 'no checking or savings connected' })}
        ${tile({ label: 'Owed on cards', value: money0(tl), sub: cards.length ? cards.map(a => esc(a.name)).join(', ') : 'no card connected' })}
        ${tile({ label: ED.id === 'household' ? 'Really yours' : 'Net worth of the business', value: money0(net), tone: net >= 0 ? 'good' : 'bad', sub: 'cash minus what the cards owe' })}
        ${tile({ label: 'Set aside for tax', value: money0(taxAside), sub: ytd ? `${S.boot.money.taxPct}% of this year's ${word('netLow')}, less income tax already paid` : 'needs the year\'s months', go: "show('taxes')", goTitle: 'Open Taxes' })}
      </div>
      <div class="two even">
        ${card(ED.id === 'household' ? 'What you have' : 'What the business has', 'Cash straight from the bank, one line per account.', cashAccts.map(a => lnRow(esc(a.name) + (a.mask ? ` <small style="display:inline">··${esc(a.mask)}</small>` : ''), a.available != null && a.available !== a.current ? `${money0(a.available)} available` : 'in the bank', money0(a.current || 0))).join('') + lnRow('Total', '', money0(ta)).replace('class="ln"', 'class="ln tot"') || '<p class="hint">Nothing connected.</p>')}
        ${card('What it owes', 'Every balance that has to be paid back. Cards clear when the statement is paid.', (cards.map(a => lnRow(esc(a.name), a.limit ? `of a ${money0(a.limit)} limit` : 'card balance', money0(a.current || 0))).join('') || '<p class="hint">No card balance.</p>') + (taxAside ? lnRow('Tax set-aside', 'owed to the government, not a bank', money0(taxAside)) : '') + lnRow('Total owed', '', money0(tl + taxAside)).replace('class="ln"', 'class="ln tot"'))}
      </div>
      ${(bal.accounts || []).some(a => a.error) ? `<div class="notice warn">The bank did not answer for ${(bal.accounts || []).filter(a => a.error).map(a => esc(a.item)).join(', ')}: ${esc((bal.accounts || []).find(a => a.error).error)}</div>` : ''}
      <p class="foot">Not on this sheet: money clients owe that has not landed, and deposits already paid for work not delivered. The P&L can say profitable while this falls, if spending runs ahead of collections: watch it month to month.</p>
    </div>`;
}
SCREENS.balance = renderBalance;

/* ---- Costs: what repeats every month, and where the money goes ---- */
async function renderCosts() {
  const m = $('#main'), my = S.rt;
  const range = presetRange(RP.preset, RP);
  m.innerHTML = pageHead('Costs', 'What you pay every month, no matter what.') + skPage({ tiles: 4, chart: false });
  let ser; try { ser = await getSeries(range[0], range[1]); } catch (e) { if (!stale(my)) m.innerHTML = errorCard(e, 'renderCosts()'); return; }
  if (stale(my)) return;
  const months = ser.months.filter(x => x.month >= firstMonth()), n = Math.max(1, months.length), T = addUp(months);
  const cats = { ...T.byTax }; if (T.fees) cats[word('fees')] = (cats[word('fees')] || 0) + T.fees;
  const ranked = Object.entries(cats).filter(([, v]) => v >= 0.5).sort((p, q) => q[1] - p[1]);
  const vend = (ser.topVendors || []).slice(0, 10);
  const rec = (S.boot.vendors || []).filter(v => v.recurring && v.active).map(v => ({ ...v, perMonth: (v.expected_amount || 0) / (v.cadence === 'yearly' ? 12 : 1) })).sort((p, q) => q.perMonth - p.perMonth);
  const recur = rec.reduce((s, v) => s + v.perMonth, 0);
  const top = ranked[0];
  const lead = `<b>${money0(recur)}</b> a month repeats on a rhythm across ${plural(rec.length, 'subscription')}, <b>${money0(recur * 12)}</b> a year if nothing changes. In ${esc(rangeLabel(range))} spending was <b>${money0(T.spend)}</b>, about ${money0(T.spend / n)} a month${top ? `, and the biggest line was <b>${esc(top[0])}</b> at ${money0(top[1])}` : ''}.`;
  m.innerHTML = pageHead('Costs', lead, `<button class="btn" onclick="SET.sec='vendors';show('settings')">${icon('settings')} Manage subscriptions</button>`) + `
    <div class="v2">
      <div class="tiles">
        ${tile({ label: 'Every month, no matter what', value: money0(recur), sub: `${plural(rec.length, 'thing')} that repeat on a rhythm` })}
        ${tile({ label: 'A year of it', value: money0(recur * 12), sub: 'if nothing changes' })}
        ${tile({ label: `Spent, ${esc(rangeLabel(range))}`, value: money0(T.spend), sub: `about ${money0(T.spend / n)} a month · ${pctOf(T.spend, T.revenue)} of ${word('revenueLow')}` })}
        ${tile({ label: 'Biggest line', value: `<span style="font-size:17px">${esc(top ? top[0] : '-')}</span>`, sub: top ? `${money0(top[1])} · ${pctOf(top[1], T.spend)} of spending` : 'nothing in this period' })}
      </div>
      <div class="two">
        ${card('Subscriptions', 'Every recurring charge in Settings, yearly ones spread across twelve months. The first place to look when costs creep.', rec.length ? `<div class="tbl-wrap"><table class="st"><thead><tr><th>What</th><th>How often</th><th>A month</th><th>A year</th></tr></thead><tbody>${rec.map(v => `<tr><td>${esc(v.name)}<small>${esc(v.tax_cat || v.bucket || '')}${v.cadence === 'yearly' ? `, renews ${MONTHS[(v.renew_month || 1) - 1]}` : ''}</small></td><td>${v.cadence === 'yearly' ? 'once a year' : 'every month'}</td><td><b>${money0(v.perMonth)}</b></td><td>${money0(v.perMonth * 12)}</td></tr>`).join('')}<tr class="tot"><td>Total</td><td></td><td>${money0(recur)}</td><td>${money0(recur * 12)}</td></tr></tbody></table></div>` : empty('store', 'No recurring charges set up yet. Promote a vendor in Settings › Vendors.'))}
        <div class="stack">
          ${card('By category', `Every expense line in ${esc(rangeLabel(range))} as a share of the total.`, rankList(ranked.slice(0, 10), T.spend))}
          ${card('Biggest vendors', 'Who the money is paid to in the period.', vend.length ? rankList(vend.map(v => [v.vendor, v.amount]), T.spend) : '<p class="hint">No spending in this period.</p>')}
        </div>
      </div>
      ${months.length > 1 ? card(`${word('spend')} by month`, 'Every expense in each month of the period. A rising line with flat revenue means costs are creeping.', barChart('cSpend', months.map(x => ({ x: moShort(x.month) + (months.length > 12 ? ' ' + x.month.slice(2, 4) : ''), v: expOf(x), tip: `${moName(x.month)}: ${money0(expOf(x))}` })), { h: 200 })) : ''}
    </div>`;
}
SCREENS.costs = renderCosts;

/* ---- Taxes: the engine's own tab, hosted ---- */
async function renderTaxes() {
  const my = S.rt;
  await hostReport('Taxes', `What to set aside, what was paid toward the year, and what is due next. The set-aside is ${S.boot.money.taxPct}% of ${word('netLow')}, a planning number the CPA replaces with the real one.`, reportTaxes, my);
}
SCREENS.taxes = renderTaxes;
