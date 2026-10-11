/* Mobius Ledger v6: Home (Overview). The month at a glance: cash, what the
   month is doing, what needs you, who has paid, where the money went, and
   the Controller's findings and briefing in one card. Reads the same routes
   the engine's overview read: /api/summary, /api/balances, /api/series,
   /api/transactions. The words follow the edition (lg-edition.js). */
'use strict';

/* The month's clients: who has paid, who is expected. Service edition only. */
function retainerBoard(txns) {
  const clients = S.boot.clients || [];
  const inTx = (txns || []).filter(t => t.type === 'in' && !t.expected);
  const paidOf = n => sumOf(inTx.filter(t => t.vendor === n), 'amount');
  const paidDate = n => inTx.find(t => t.vendor === n)?.date;
  const active = clients.filter(c => c.active);
  const expTotal = sumOf(active, clientMonthly);
  const paidCount = active.filter(c => paidOf(c.name) > 0).length;
  const tiles = clients.map(c => {
    if (!c.active) return `<div class="rtile paused"><div class="rn">${esc(c.name)}</div><div class="rv">Paused</div><div class="rs">not expected</div></div>`;
    const got = paidOf(c.name);
    if (got > 0) return `<div class="rtile paid"><div class="rn">${esc(c.name)}</div><div class="rv">${money0(got)}</div><div class="rs">${icon('check', 12)} Paid ${fmtDate(paidDate(c.name))}</div></div>`;
    return `<div class="rtile"><div class="rn">${esc(c.name)}</div><div class="rv">${money0(clientMonthly(c))}</div><div class="rs"><span class="dot"></span>Expected</div></div>`;
  }).join('');
  return { tiles, active, expTotal, paidCount };
}

async function renderOverview() {
  const m = $('#main'), my = S.rt;
  const today = new Date(), dateLine = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  m.innerHTML = pageHead(dateLine, '<span class="sk" style="display:inline-block;width:46ch;height:14px"></span>') + skPage({ tiles: 4 });
  const cur = nowMonth(), prevMo = addMonths(cur, -1), y = cur.slice(0, 4);
  let sum, bal, ser, txns;
  try {
    [sum, bal, ser, txns] = await Promise.all([
      api('/api/summary?month=' + cur), getBalances(), getSeries(addMonths(cur, -11), cur).catch(() => null),
      api('/api/transactions?month=' + cur).then(r => r.transactions || []).catch(() => []),
    ]);
  } catch (e) { if (!stale(my)) m.innerHTML = errorCard(e, 'renderOverview()'); return; }
  if (stale(my)) return;
  S.summary = sum;
  const r = sum.report || {}, a = sum.attention || {};
  const months = (ser?.months || []).filter(x => x.month >= firstMonth());
  const byM = Object.fromEntries(months.map(x => [x.month, x]));
  const prevRep = byM[prevMo] || null;
  const ytdRows = months.filter(x => x.month >= y + '-01' && x.month <= cur);
  const ytd = { revenue: sumOf(ytdRows, 'revenue'), net: sumOf(ytdRows, 'net'), taxes: sumOf(ytdRows, 'taxes') };
  const last6 = months.slice(-6);
  const full = months.filter(x => x.month < cur);
  const last3 = full.slice(-3), avgSpend = last3.length ? sumOf(last3, expOf) / last3.length : 0;
  const spent = expOf(r);
  const service = ED.id === 'service', household = ED.id === 'household';

  /* cash, and where it is heading (the engine's six-month projection) */
  const accts = (bal.accounts || []).filter(x => !x.error);
  const cashAfter = (bal.cash || 0) - (bal.cards || 0);
  const runway = bal.connected && avgSpend > 0 ? cashAfter / avgSpend : null;
  const asOf = bal.at ? new Date(bal.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  let proj = null;
  if (bal.connected && ser) { try { CF.ctx = { ser, bal }; proj = cfCalc(); } catch (e) { proj = null; } }

  /* who has paid (service), what needs you, what is coming */
  const board = service ? retainerBoard(txns) : null;
  const closedSet = new Set((S.boot.months || []).filter(x => x.status === 'closed').map(x => x.month));
  const closeOpen = !closedSet.has(prevMo) && (S.boot.flags || {})[prevMo];
  const flagsC = (S.boot.flags || {})[prevMo] || {};
  const blocking = (+flagsC.review || 0) + (+flagsC.expected || 0);
  const otherMonths = Object.entries(S.boot.flags || {}).filter(([k, f]) => k !== cur && ((+f.review || 0) + (closedSet.has(k) ? 0 : (+f.noReceipt || 0))) > 0).map(([k]) => k).sort();
  const needs = [
    +a.review ? { ic: 'tag', t: 'Transactions to categorize', n: +a.review, go: `S.filter='needs';setMonth('${cur}','txns')` } : null,
    +a.noReceipt ? { ic: 'receipt', t: `Expenses missing a receipt in ${moShort(cur)}`, n: +a.noReceipt, go: `setMonth('${cur}','receipts')` } : null,
    service && +a.expected ? { ic: 'clock', t: 'Expected payments to confirm', n: +a.expected, go: `S.filter='expected';setMonth('${cur}','txns')` } : null,
    closeOpen ? { ic: 'circle-check', t: `${word('close')}: ${moName(prevMo)}`, n: blocking ? `${blocking} to clear` : 'Ready', go: `setMonth('${prevMo}','close')` } : null,
  ].filter(Boolean);
  const mm = +cur.slice(5, 7);
  const renewals = (S.boot.vendors || []).filter(v => v.recurring && v.active && v.cadence === 'yearly' && v.renew_month)
    .map(v => ({ v, gap: (v.renew_month - mm + 12) % 12 })).filter(x => x.gap <= 2).sort((p, q) => p.gap - q.gap);
  const seen = (txns || []).map(x => String(x.vendor || '').toLowerCase());
  const unbilled = (S.boot.vendors || []).filter(v => v.recurring && v.active && v.cadence !== 'yearly')
    .filter(v => { const f = v.name.toLowerCase().split(' ')[0]; return !seen.some(n => n.includes(f) || v.name.toLowerCase().includes(n.split(' ')[0])); });
  const coming = [
    ...renewals.map(({ v, gap }) => lnRow(esc(v.name), `yearly renewal, ${gap ? MONTHS[v.renew_month - 1] : 'this month'}`, v.expected_amount ? money0(v.expected_amount) : '·')),
    ...unbilled.slice(0, 5).map(v => lnRow(esc(v.name), 'monthly, not billed yet this month', v.expected_amount ? money0(v.expected_amount) : '·')),
  ].join('');

  /* the split card: what moves when last month closes (service only) */
  const splitLabels = { personal: 'Personal', tax: 'Tax reserve', ads: 'Ads', savings: 'Savings', other: 'Other' };
  const splitSrc = prevRep && prevRep.split ? prevRep : null;
  const splitRows = splitSrc ? Object.entries(splitSrc.split).map(([k, v]) => lnRow(esc(splitLabels[k] || k), `${splitSrc.splitPct?.[k] ?? ''}% of ${word('netLow')}`, fmt$(v))).join('') : '';

  /* where the money went, and the feed */
  const buckets = Object.entries(r.byBucket || {}).filter(([, v]) => v > 0);
  if (r.fees) buckets.push([word('fees'), r.fees]);
  buckets.sort((x, z) => z[1] - x[1]);
  const feed = (txns || []).filter(t => !t.expected).sort((p, q) => q.date.localeCompare(p.date) || q.id - p.id).slice(0, 7).map(t => {
    const d = `<span class="fd">${fmtDate(t.date)}</span>`;
    if (t.type === 'in') return `<div><span class="fi in">+</span><span>${esc(t.vendor)} paid ${fmt$(t.amount)}${t.source === 'stripe' ? ' via Stripe' : ''}</span>${d}</div>`;
    if (t.type === 'transfer') return `<div><span class="fi">⇄</span><span>${esc(t.vendor)} ${fmt$(t.amount)}, a transfer, not counted</span>${d}</div>`;
    return `<div><span class="fi">−</span><span>${esc(t.vendor)} ${fmt$(t.amount)}${t.receipt_key ? ', receipt in' : ''}</span>${d}</div>`;
  }).join('');

  /* the sentence: the conclusion first */
  const netWord = r.net >= 0 ? (household ? 'left over' : 'a profit') : (household ? 'short' : 'a loss');
  const cashBit = bal.connected ? `<b>${money0(bal.cash || 0)}</b> in the bank${bal.cards ? `, ${money0(bal.cards)} owed on the card` : ''}.` : 'No bank connected yet, so cash is not shown.';
  const monthBit = household ? ` This month <b>${money0(r.revenue || 0)}</b> came in and <b>${money0(spent)}</b> went out, so <b class="${r.net >= 0 ? 'good' : 'bad'}">${money0(Math.abs(r.net || 0))}</b> is ${netWord} so far.`
    : ` ${moShort(cur)} is ${netWord} of <b class="${r.net >= 0 ? 'good' : 'bad'}">${money0(Math.abs(r.net || 0))}</b> so far${service && board ? `, with ${board.paidCount} of ${board.active.length} ${word('payers')} paid` : ''}.`;
  const aheadBit = proj ? (proj.low.cashTax < 0 ? ` <b class="bad">At the current pace cash runs out by the end of ${moName(proj.low.mo)}.</b>` : ` At the current pace cash stays above <b>${money0(proj.low.cashTax)}</b> for the next six months, after tax is set aside.`)
    : runway != null ? ` That covers about <b>${runway.toFixed(1)} months</b> of spending at the last three months' pace.` : '';
  const lead = cashBit + monthBit + aheadBit;

  const projVals = proj ? [proj.start, ...proj.rows.map(x => x.cash)] : null;
  const projTips = proj ? ['<b>Today</b> · ' + money0(proj.start), ...proj.rows.map(x => `<b>End of ${moShort(x.mo)}</b> · ${money0(x.cash)}`)] : null;
  m.innerHTML = pageHead(dateLine, lead, `<button class="btn" onclick="dropPick()">${icon('upload')} Receipt</button><button class="btn primary" onclick="addModal()" ${moState(cur) === 'closed' ? 'disabled title="Month is closed"' : ''}>${icon('plus')} Transaction</button>`) + `
    <div class="v2">
      ${needs.length ? card('Needs you', 'The only upkeep the app asks for. A few minutes a week keeps every report true.', `<div class="needs">${needs.map(x => `<a onclick="${x.go}"><span class="nm"><span class="ic">${icon(x.ic, 13)}</span><span>${esc(x.t)}</span></span><b>${esc(String(x.n))}</b></a>`).join('')}${otherMonths.length ? `<div class="also">Also waiting in ${otherMonths.map(k => `<button class="btn sm" onclick="S.filter='needs';setMonth('${k}','txns')">${moShort(k)} ${k.slice(0, 4)}</button>`).join('')}</div>` : ''}</div>`)
        : `<p class="lead-say quiet">${icon('circle-check', 14)} Nothing needs you. Every row is categorized and this month's receipts are in.</p>`}
      <div class="tiles home">
        ${tile({ hero: true, label: 'Cash in the bank', em: asOf ? `as of ${asOf}` : '', value: bal.connected ? money0(bal.cash || 0) : '·',
          sub: bal.connected ? accts.map(x => `${esc(x.name)} <b>${x.type === 'credit' ? '−' : ''}${money0(x.current || 0)}</b>`).join(' · ') : 'connect a bank in Settings › Banks and cards',
          spark: projVals ? spark(projVals, { tall: true, tips: projTips }) : '',
          extra: proj ? `<div class="hrow"><span>Lowest point, next 6 months</span><b class="${proj.low.cashTax < 0 ? 'bad' : proj.low.cashTax < avgSpend ? 'warn' : ''}">${money0(proj.low.cashTax)}</b><span>end of ${moShort(proj.low.mo)}</span><a onclick="show('forecast')">Forecast ›</a></div>`
            : bal.connected ? `<div class="hrow"><span>After the card is paid</span><b>${money0(cashAfter)}</b><a onclick="show('balance')">Balance sheet ›</a></div>` : '' })}
        ${service && board
          ? tile({ label: `Collected, ${moShort(cur)}`, value: money0(r.revenue || 0), sub: `${board.paidCount} of ${board.active.length} ${word('payers')} · <b>${money0(board.expTotal)}</b> expected`, extra: progress(r.revenue || 0, board.expTotal), go: "show('retainers')", goTitle: 'Open Retainers' })
          : tile({ label: `${word('revenue')}, ${moShort(cur)}`, value: money0(r.revenue || 0), sub: delta(r.revenue || 0, prevRep?.revenue, `vs ${moShort(prevMo)}`), spark: spark(last6.map(x => x.revenue), { tips: last6.map(x => `<b>${moShort(x.month)}</b> · ${money0(x.revenue)}`) }), go: "RP.preset='month';show('pnl')" })}
        ${tile({ label: `${word('net')}, ${moShort(cur)}`, value: money0(r.net || 0), tone: r.net >= 0 ? 'good' : 'bad', sub: delta(r.net || 0, prevRep?.net, `vs ${moShort(prevMo)}`), spark: spark(last6.map(x => x.net), { tips: last6.map(x => `<b>${moShort(x.month)}</b> · ${money0(x.net)}`) }), go: "RP.preset='month';show('pnl')" })}
        ${tile({ label: `${word('net')}, ${y} to date`, value: money0(ytd.net), tone: ytd.net >= 0 ? 'good' : 'bad', sub: `on <b>${money0(ytd.revenue)}</b> ${word('revenueLow')} · ${pctOf(ytd.net, ytd.revenue)} kept${!household && ytd.taxes ? ` · ${money0(ytd.taxes)} set aside for tax` : ''}`, spark: spark(ytdRows.map(x => x.net), { tips: ytdRows.map(x => `<b>${moShort(x.month)}</b> · ${money0(x.net)}`) }), go: "RP.preset='ytd';show('pnl')" })}
      </div>
      <div id="askAnchor" hidden></div>
      <div class="two">
        ${card(`${word('net')} by month`, `${word('revenue')} minus every expense${service ? ' and Stripe fee' : ''}, each of the last twelve months. Red is a loss; this month is lighter because it is not finished. Click a bar to open that month's statement.`,
          barChart('cNet', months.map(x => ({ x: moShort(x.month) + (x.month.slice(5) === '01' ? ' ' + x.month.slice(2, 4) : ''), v: x.net, faded: x.month === cur, tip: `${moName(x.month)}: ${money0(x.net)}` })), { onClick: i => { S.reportMonth = months[i].month; setMonth(months[i].month, 'statements'); } }))}
        <div class="stack">
          ${service && board ? card(`Retainers, ${moName(cur)}`, 'Green is a confirmed payment from that client this month. Paused clients are not expected.', `<div class="rboard">${board.tiles || '<p class="hint">Add clients in Settings › Clients.</p>'}</div>`, `<button class="btn sm ghost" onclick="show('retainers')">Retainers ›</button>`) : ''}
          ${service ? card(`When ${moShort(prevMo)} closes, move`, 'The account split in Settings › Money rules, applied to last month\'s net income. Copy these into the bank.', splitRows || '<p class="hint">No report for last month yet.</p>', `<button class="btn sm ghost" onclick="S.reportMonth='${prevMo}';setMonth('${prevMo}','statements')">Statement ›</button>`) : ''}
          ${card('Coming up', 'Yearly renewals in the next two months, and monthly bills not seen yet this month.', coming || '<p class="hint">Nothing due in the next two months.</p>')}
        </div>
      </div>
      <div class="two">
        ${card(`Where ${moShort(cur)}'s money went`, `<b>${money0(spent)}</b> so far, biggest first. The top line is the first thing to question.`, rankList(buckets.map(([k, v]) => [k, v, `S.q='';S.filter='out';setMonth('${cur}','txns')`]), spent), `<button class="btn sm ghost" onclick="S.reportMonth='${cur}';setMonth('${cur}','statements')">Statement ›</button>`)}
        ${card('Happening on its own', 'The bank, Stripe and Slack, working. The newest rows this month.', `<div class="feed">${feed || '<p class="hint">Nothing yet this month.</p>'}</div>`, `<button class="btn sm ghost" onclick="setMonth('${cur}','txns')">Transactions ›</button>`)}
      </div>
    </div>`;
  /* The Controller's findings and briefing, one card, after the numbers. */
  AskUI.mount($('#askAnchor'));
}
SCREENS.overview = renderOverview;
