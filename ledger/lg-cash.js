/* Mobius Ledger v6: Cash (Forecast, Plan). Both pages run the engine's own
   six-month projection (cfCalc, cfPaint, cfAddEvent, whatIf, cfSet), which
   writes into #cfKpis, #cCash, #cfTable, #cfWhat and #cfEvents. Each page
   draws the slots it shows and hides the rest, so the engine's repaint never
   looks for an element that is not there. The chart is SVG through the draw()
   override in lg-core.js. Debts (loans owed and lent) are the last page in
   this file, on /api/debts. */
'use strict';

async function cfLoad() {
  const cur = nowMonth();
  const [ser, bal] = await Promise.all([getSeries(addMonths(cur, -6), cur), getBalances()]);
  CF.ctx = { ser, bal };
  return cfCalc();
}
function cfLead(x) {
  const start = x.bal.connected ? `${money0(x.start)} in the bank today after the card.` : 'No bank connected, so the line starts from zero; connect one in Settings › Banks and cards.';
  if (!x.bal.connected) return start;
  return x.low.cashTax < 0
    ? `<b class="bad">At the current pace cash runs out by the end of ${moName(x.low.mo)}.</b> ${start}`
    : `<b>You stay above water.</b> The tightest month is ${moName(x.low.mo)}, with <b>${money0(x.low.cashTax)}</b> left after tax is set aside. ${start}`;
}
const cfBasisSeg = () => `<div class="seg" id="cfBasis" title="What the projection is built from"><button data-v="average" class="${CF.basis === 'average' ? 'on' : ''}" onclick="cfSet('basis','average')">Recent average</button><button data-v="book" class="${CF.basis === 'book' ? 'on' : ''}" onclick="cfSet('basis','book')">${ED.id === 'service' ? 'Retainers only' : 'Expected only'}</button></div>`;
const cfChartCard = () => card('Six months ahead', 'Cash at the end of each month. The dashed line also takes the tax set-aside out, which is money that is not yours to spend. One-offs from Plan land on both lines.',
  `<div class="lg"><span><i></i>Cash</span><span><i class="dash"></i>Cash after setting tax aside</span></div><div class="chart"><canvas id="cCash"></canvas></div>`);

async function renderForecast() {
  const m = $('#main'), my = S.rt;
  m.innerHTML = pageHead('Forecast', 'Am I going to run out?') + skPage({ tiles: 4 });
  let x; try { x = await cfLoad(); } catch (e) { if (!stale(my)) m.innerHTML = errorCard(e, 'renderForecast()'); return; }
  if (stale(my)) return;
  m.innerHTML = pageHead('Forecast', cfLead(x), cfBasisSeg() + `<button class="btn" onclick="show('plan')">Make a plan</button>`) + `
    <div class="v2">
      <div class="kpis" id="cfKpis"></div>
      <div class="two">
        ${cfChartCard()}
        <div class="stack">
          ${card('How it is worked out', '', `<div class="steps">
            <div><b>Start</b>The cash in checking today, minus what the card owes, straight from the bank.</div>
            <div><b>In</b>${CF.basis === 'book' ? `The ${ED.id === 'service' ? 'retainer book' : 'expected money in'}, every month.` : 'The last three finished months\' average, every month.'}</div>
            <div><b>Out</b>${CF.basis === 'book' ? 'Recurring bills plus the fee rate in Settings.' : 'Every expense, averaged over the same months.'}</div>
            <div><b>Tax</b>${S.boot.money.taxPct}% of what is left each month is set aside; the dashed line shows cash without it.</div></div>`)}
          ${card('Plan with it', 'Switch a client off or put a purchase on the chart on the Plan page. Nothing there is saved to the books.', `<div class="row"><button class="btn primary" onclick="show('plan')">${icon('sparkles')} Open Plan</button></div>`)}
        </div>
      </div>
      ${card('Month by month', 'The same line as a table: what comes in, what goes out, the tax to set aside, and cash at the end.', `<div class="tbl-wrap"><table class="st rt"><thead><tr><th>Month</th><th>In</th><th>Out</th><th>Net</th><th>Tax to set aside</th><th>Cash at end</th></tr></thead><tbody id="cfTable"></tbody></table></div>`)}
      <div hidden><div id="cfWhat"></div><div id="cfEvents"></div></div>
    </div>`;
  cfPaint();
}
SCREENS.forecast = renderForecast;

/* ---- Plan: what if a client left, can I afford it ---- */
async function renderPlan() {
  const m = $('#main'), my = S.rt, cur = nowMonth();
  m.innerHTML = pageHead('Plan', 'What if something changes?') + skPage({ tiles: 4 });
  let x; try { x = await cfLoad(); } catch (e) { if (!stale(my)) m.innerHTML = errorCard(e, 'renderPlan()'); return; }
  if (stale(my)) return;
  const months = [1, 2, 3, 4, 5, 6].map(i => addMonths(cur, i));
  m.innerHTML = pageHead('Plan', cfLead(x), cfBasisSeg()) + `
    <div class="v2">
      <div class="kpis" id="cfKpis"></div>
      ${cfChartCard()}
      <div class="two even">
        ${card(ED.id === 'service' ? 'What if a client left?' : 'What if a payer stopped?', 'Tap a name to switch it off in this projection only. Nothing is saved.', `<div id="cfWhat"></div>`)}
        ${card('Can I afford it?', 'Put a purchase or a payment on the chart. It stays until you leave Ledger; nothing is saved to the books.', `
          <div class="fields" style="grid-template-columns:1fr 1fr;margin-top:0">
            <div class="fld" style="grid-column:1/-1"><label>What</label><input id="evName" placeholder="New laptop, a hire, a big invoice" onkeydown="if(event.key==='Enter')cfAddEvent()"></div>
            <div class="fld"><label>Amount</label><div class="unit-in"><span>$</span><input id="evAmt" type="number" inputmode="decimal" placeholder="2500" onkeydown="if(event.key==='Enter')cfAddEvent()"></div></div>
            <div class="fld"><label>Month</label><select id="evMo">${months.map(mo => `<option value="${mo}">${moName(mo)}</option>`).join('')}</select></div>
            <div class="fld" style="grid-column:1/-1"><label>Direction</label><select id="evDir"><option value="out">Money out</option><option value="in">Money in</option></select></div>
          </div>
          <div class="row" style="margin:12px 0 0"><button class="btn primary" onclick="cfAddEvent()">Add to the forecast</button></div>
          <div id="cfEvents"></div>`)}
      </div>
      <div hidden><table><tbody id="cfTable"></tbody></table></div>
    </div>`;
  cfPaint();
}
SCREENS.plan = renderPlan;

/* ---- Debts (2026-11-24): what the business owes, and what it lent ----
   Worker: GET/PUT /api/debts (settings.debts). Every loan is a fixed monthly
   installment (principal / months + a flat monthly fee). Paid so far counts
   the payments whose date has passed, or the rows matching a bank text when
   one is set. The money moving is a transfer in the books; only the fee is a cost. */
const DEBTS = { loans: [] };
const DEBT_KEYS = ['id', 'side', 'name', 'who', 'principal', 'months', 'fee', 'paidBefore', 'taken', 'firstPay', 'match', 'note'];
const debtPlain = l => Object.fromEntries(DEBT_KEYS.map(k => [k, l[k]]));
const debtMonthYear = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
function debtRow(l) {
  const sub = [l.who && esc(l.who), `${fmt$(l.monthly)} a month`, l.fee ? `${fmt$(l.fee)} of it is the fee` : '', l.next ? `next ${fmtDate(l.next)}` : 'paid off',
    `${l.paymentsLeft} of ${l.months} payments left`, l.last ? `done ${debtMonthYear(l.last)}` : ''].filter(Boolean).join(' · ');
  return `<div class="ln click" onclick="debtModal('${l.id}')"><span class="n">${esc(l.name)}<small>${sub}</small>${progress(l.paid, l.total)}${l.note ? `<small>${esc(l.note)}</small>` : ''}</span><span class="a">${money0(l.remaining)}<small>of ${money0(l.total)}</small></span></div>`;
}
async function renderDebts() {
  const m = $('#main'), my = S.rt;
  m.innerHTML = pageHead('Debts', 'What the business owes, and what it lent.') + skPage({ tiles: 4, chart: false });
  let d; try { d = await api('/api/debts'); } catch (e) { if (!stale(my)) m.innerHTML = errorCard(e, 'renderDebts()'); return; }
  if (stale(my)) return;
  DEBTS.loans = d.loans.map(l => ({ ...l }));
  const owe = d.loans.filter(l => l.side === 'owe'), owed = d.loans.filter(l => l.side === 'owed');
  const gap = Math.round((d.owed.monthly - d.owe.monthly) * 100) / 100;
  const covers = owe.length && owed.length
    ? (Math.abs(gap) < 1 ? 'What comes back each month covers what goes out.' : gap > 0 ? `Each month <b>${money0(gap)}</b> more comes back than goes out.` : `Each month <b class="bad">${money0(-gap)}</b> more goes out than comes back.`)
    : '';
  const lead = d.loans.length
    ? `The business owes <b>${money0(d.owe.remaining)}</b> and is owed <b>${money0(d.owed.remaining)}</b>. ${covers} None of it is income or an expense; only the loan fees are a cost.`
    : 'No loans yet. Add one the business took, or one it gave.';
  m.innerHTML = pageHead('Debts', lead, `<button class="btn primary" onclick="debtModal()">${icon('plus')} Add a loan</button>`) + `
    <div class="v2">
      <div class="tiles">
        ${tile({ label: 'We owe', value: money0(d.owe.remaining), sub: `${money0(d.owe.principalLeft)} of it is the money borrowed, the rest is fees` })}
        ${tile({ label: 'Paid out each month', value: money0(d.owe.monthly), sub: owe.length ? owe.map(l => esc(l.name)).join(', ') : 'no loans' })}
        ${tile({ label: 'Owed to us', value: money0(d.owed.remaining), sub: `${money0(d.owed.principalLeft)} of it is the money lent` })}
        ${tile({ label: 'Coming back each month', value: money0(d.owed.monthly), sub: owed.length ? owed.map(l => esc(l.name)).join(', ') : 'nothing lent' })}
      </div>
      <div class="two even">
        ${card('We owe', 'Loans the business took. Tap one to change it.', owe.map(debtRow).join('') || '<p class="hint">Nothing owed.</p>')}
        ${card('Owed to us', 'Money the business lent. Tap one to change it.', owed.map(debtRow).join('') || '<p class="hint">Nothing lent.</p>')}
      </div>
      <p class="foot">Paid so far counts each payment once its date passes (autopay). If one is missed or paid early, change "Paid before this page" on the loan, or give it the bank text so the real rows are counted instead.</p>
    </div>`;
}
SCREENS.debts = renderDebts;

function debtModal(id) {
  const l = DEBTS.loans.find(x => x.id === id) || { side: 'owe', months: 12, fee: 0, paidBefore: 0, taken: new Date().toISOString().slice(0, 10) };
  const v = (k, fb = '') => esc(String(l[k] ?? fb));
  openModal(`<h3>${id ? 'Change loan' : 'Add a loan'}</h3>
    <label>Which way</label><select id="dbSide"><option value="owe" ${l.side === 'owe' ? 'selected' : ''}>The business owes it</option><option value="owed" ${l.side === 'owed' ? 'selected' : ''}>The business lent it</option></select>
    <label>Name</label><input id="dbName" value="${v('name')}" placeholder="Amex business loan" maxlength="80">
    <label>Lender or borrower</label><input id="dbWho" value="${v('who')}" placeholder="American Express" maxlength="80">
    <div class="fields" style="grid-template-columns:1fr 1fr">
      <div class="fld"><label>Amount borrowed</label><div class="unit-in"><span>$</span><input id="dbPrin" type="number" inputmode="decimal" value="${v('principal')}"></div></div>
      <div class="fld"><label>Months</label><input id="dbMonths" type="number" inputmode="numeric" value="${v('months', 12)}"></div>
      <div class="fld"><label>Fee each month</label><div class="unit-in"><span>$</span><input id="dbFee" type="number" inputmode="decimal" value="${v('fee', 0)}"></div></div>
      <div class="fld"><label>Paid before this page</label><div class="unit-in"><span>$</span><input id="dbBefore" type="number" inputmode="decimal" value="${v('paidBefore', 0)}"></div></div>
      <div class="fld"><label>Taken on</label><input id="dbTaken" type="date" value="${v('taken')}"></div>
      <div class="fld"><label>First payment</label><input id="dbFirst" type="date" value="${v('firstPay')}"></div>
    </div>
    <label>Bank text on the payments (optional)</label><input id="dbMatch" value="${v('match')}" placeholder="Leave empty to count by the schedule" maxlength="80">
    <label>Note</label><input id="dbNote" value="${v('note')}" maxlength="600">
    <div class="acts">${id ? `<button class="btn" onclick="debtRemove('${id}')">Remove</button>` : ''}<span class="spacer"></span><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="debtSave('${id || ''}')">Save</button></div><div class="msg" id="dbMsg"></div>`);
}
async function debtPut(loans) {
  await api('/api/debts', { method: 'PUT', body: JSON.stringify({ loans }) });
  closeModal(); flash('Debts saved'); renderDebts();
}
function debtSave(id) {
  const row = { id: id || undefined, side: $('#dbSide').value, name: $('#dbName').value.trim() || 'Loan', who: $('#dbWho').value.trim(), principal: $('#dbPrin').value,
    months: $('#dbMonths').value, fee: $('#dbFee').value, paidBefore: $('#dbBefore').value, taken: $('#dbTaken').value, firstPay: $('#dbFirst').value, match: $('#dbMatch').value, note: $('#dbNote').value };
  if (!(+row.principal > 0)) { $('#dbMsg').textContent = 'Put in the amount borrowed.'; return; }
  if (!row.firstPay) { $('#dbMsg').textContent = 'Put in the date of the first payment.'; return; }
  debtPut([...DEBTS.loans.filter(x => x.id !== id).map(debtPlain), row]).catch(e => { $('#dbMsg').textContent = e.message; });
}
function debtRemove(id) {
  debtPut(DEBTS.loans.filter(x => x.id !== id).map(debtPlain)).catch(e => { $('#dbMsg').textContent = e.message; });
}
