/* Mobius Ledger v6: Cash (Forecast, Plan). Both pages run the engine's own
   six-month projection (cfCalc, cfPaint, cfAddEvent, whatIf, cfSet), which
   writes into #cfKpis, #cCash, #cfTable, #cfWhat and #cfEvents. Each page
   draws the slots it shows and hides the rest, so the engine's repaint never
   looks for an element that is not there. The chart is SVG through the draw()
   override in lg-core.js. Debts belong to the Product edition and the Lucky
   engine (a "not connected" card here). */
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
