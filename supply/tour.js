/* Supply - the guided tour. Plain words, one screen at a time, retakeable
   from Settings or the "Take the tour" button on Today. Runs on the first
   visit automatically. State lives only in localStorage (supply_tour_done). */
'use strict';

const TOUR = [
  { tab: 'today', sel: '.rollup', title: 'Four numbers, every morning', text: 'How many products need an order, how many orders are on the way, how much revenue is at risk from things selling out, and how much money is sitting in stock that has not sold in 90 days. Click any of them to go to the screen behind it.' },
  { tab: 'today', sel: '.card.sc.decision', title: 'This week, as sentences', text: 'Each card is one decision, written the way you would say it: what to order, by when, and why. Red means it is late or empty. The button takes you to the exact product or order.' },
  { tab: 'reorder', sel: '.toolbar', title: 'Reorder: filters first', text: 'Chips at the top narrow the list: overdue, out now, order now, coming up, on the way, fine. Pick a line to see only polos or only wedges. Search for anything.' },
  { tab: 'reorder', sel: '.card.group', title: 'One group per factory', text: 'Each factory gets its own block with its lead time and its next order window. Order by is the day an order has to go out so stock arrives before the shelf empties. Suggested is how many units, already split by size or loft.' },
  { tab: 'reorder', sel: '.card.group .ck', title: 'Tick, then Create order', text: 'Tick the products you want to send. A bar appears with the totals. Create order opens a drawer where you adjust quantities, hit the minimum, and copy the order text for the factory email.' },
  { tab: 'orders', sel: 'main .seg', title: 'Orders: what is on the way', text: 'Every order you have sent, where it is (sent, confirmed, in production, shipped, landed) and when it lands. Anything on the way counts as incoming stock in every forecast. When Shopify stock jumps, Supply asks you to confirm it landed.' },
  { tab: 'forecast', sel: 'main .card', title: 'Forecast: one product at a time', text: 'Click any product to open its sheet: the stock curve six months out, a try-an-order box that redraws the curve, why the sales rate is what it is, and every size or loft with its own numbers.' },
  { tab: 'performance', sel: 'main .card.flush', title: 'Performance: what sells', text: 'A category at the top, then one row per line (polos, hats, wedges), then the designs ranked inside a line. Shaded rows are the cut zone: the bottom of the line by sales. The size curve is the split a new order gets.' },
  { tab: 'lineup', sel: 'main .card.key', title: 'Lineup plan: keep or cut', text: 'Once a season, decide each design with one click. Set a target for the line and the difference becomes open slots: new designs that need a brief by a date. The design work lives in Asana; the slot keeps the dates.' },
  { tab: 'timeline', sel: 'main .card', title: 'Timeline: the next six months', text: 'Every order and every new design as a bar from send to landing. Amber is the factory making it, grey is shipping, red hatch is time with nothing to sell. The list on the right is the same thing as dates.' },
  { tab: 'settings', sel: '.hd-right .seg', title: 'Settings: how this brand buys', text: 'Categories and lines, factories and their lead times, the kind of each product (core, seasonal, one-off drop, winding down), the rules behind every number, and the Slack digest. Change a lead time here and every date in the app moves.' },
  { tab: 'today', sel: null, title: 'That is the whole app', text: 'Monday: Today, then Reorder, then Create order. When boxes arrive: Orders. Once a season: Performance, Lineup plan, Timeline. Retake this tour any time from Settings, or the button on Today.' },
];

let tourStep = -1;
function startTour(step = 0) {
  tourStep = step;
  if (!document.querySelector('#tourLayer')) { const el = document.createElement('div'); el.id = 'tourLayer'; el.innerHTML = '<div class="tour-scrim"></div>'; document.body.appendChild(el); }
  if (!document.querySelector('#tourCard')) { const c = document.createElement('div'); c.id = 'tourCard'; c.className = 'tour-card'; document.body.appendChild(c); }
  closeSheet();
  showTourStep();
}
function endTour() {
  tourStep = -1;
  for (const id of ['#tourLayer', '#tourCard']) { const el = document.querySelector(id); if (el) el.remove(); }
  document.querySelectorAll('.tour-spot').forEach(e => e.classList.remove('tour-spot'));
  try { localStorage.setItem('supply_tour_done', '1'); } catch { /* private mode */ }
}
function showTourStep() {
  const step = TOUR[tourStep]; if (!step) return endTour();
  if (S.tab !== step.tab) { S.tab = step.tab; location.hash = step.tab; if (step.tab === 'performance') S.cat = S.cat || st().categories[0]?.id; render(); }
  document.querySelectorAll('.tour-spot').forEach(e => e.classList.remove('tour-spot'));
  const target = step.sel ? document.querySelector(step.sel) : null;
  const last = tourStep === TOUR.length - 1;
  const card = document.querySelector('#tourCard');
  card.innerHTML = `
    <div class="tour-step">${tourStep + 1} of ${TOUR.length}</div>
    <h3>${esc(step.title)}</h3><p>${esc(step.text)}</p>
    <div class="tour-actions"><button class="btn quiet" onclick="endTour()">${last ? 'Close' : 'Skip'}</button><span style="flex:1"></span>${tourStep > 0 ? '<button class="btn" onclick="tourStep--;showTourStep()">Back</button>' : ''}${last ? '' : '<button class="btn primary" onclick="tourStep++;showTourStep()">Next</button>'}</div>`;
  card.style.transform = 'none'; card.style.right = ''; card.style.bottom = '';
  if (target) {
    target.classList.add('tour-spot');
    const tall = target.getBoundingClientRect().height > innerHeight * 0.55;
    target.scrollIntoView({ block: tall ? 'start' : 'center', behavior: 'smooth' });
    setTimeout(() => {
      const r = target.getBoundingClientRect(), ch = card.offsetHeight, cw = card.offsetWidth;
      if (tall) { card.style.top = ''; card.style.left = ''; card.style.right = '24px'; card.style.bottom = '24px'; return; }
      const below = r.bottom + 16 + ch < innerHeight;
      let top = below ? r.bottom + 16 : r.top - 16 - ch;
      top = Math.max(16, Math.min(innerHeight - ch - 16, top));
      card.style.top = top + 'px';
      card.style.left = Math.max(16, Math.min(innerWidth - cw - 16, r.left)) + 'px';
    }, 300);
  } else {
    card.style.top = '50%'; card.style.left = '50%'; card.style.transform = 'translate(-50%,-50%)';
  }
}
document.addEventListener('keydown', e => { if (tourStep < 0) return; if (e.key === 'Escape') endTour(); if (e.key === 'ArrowRight' && tourStep < TOUR.length - 1) { tourStep++; showTourStep(); } if (e.key === 'ArrowLeft' && tourStep > 0) { tourStep--; showTourStep(); } });
