/* Supply - the sign-in page. Loaded before app.js, which calls gateHTML() when
   nobody is signed in. The scene is one product's story: stock falls, the
   order-by point sits on the curve a lead time before the shelf would empty,
   the order lands and the curve steps back up. The dashed line is what happens
   if nobody orders. Nothing here is data; it renders before sign-in. */
'use strict';

function gateHTML() {
  document.body.classList.add('gated');
  const W = 600, H = 250, L = 34, R = W - 14, T = 22, B = H - 28;
  const x = f => L + f * (R - L), y = f => B - f * (B - T);
  const S0 = 0.80, tZero = 0.64, tLand = 0.56, lead = 0.34, tOrder = tLand - lead, tToday = 0.07, Q = 0.86;
  const v = S0 / tZero;
  const stock = t => Math.max(0, S0 - v * t);
  const pts = []; for (let t = 0; t <= tLand + 1e-9; t += 0.02) pts.push([Math.min(t, tLand), stock(Math.min(t, tLand))]);
  const after = []; for (let t = tLand; t <= 1 + 1e-9; t += 0.02) after.push([Math.min(t, 1), Math.max(0, stock(tLand) + Q - v * (Math.min(t, 1) - tLand))]);
  const d = arr => arr.map(([t, s], i) => (i ? 'L' : 'M') + x(t).toFixed(1) + ',' + y(s).toFixed(1)).join(' ');
  const solid = d(pts) + ' L' + x(tLand).toFixed(1) + ',' + y(stock(tLand) + Q).toFixed(1) + ' ' + d(after).replace(/^M/, 'L');
  const area = solid + ' L' + x(1).toFixed(1) + ',' + y(0) + ' L' + x(0).toFixed(1) + ',' + y(0) + ' Z';
  const nothing = 'M' + x(tLand).toFixed(1) + ',' + y(stock(tLand)).toFixed(1) + ' L' + x(tZero).toFixed(1) + ',' + y(0) + ' L' + x(1).toFixed(1) + ',' + y(0);
  const months = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  let svg = '<defs><linearGradient id="gfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#62BDEA" stop-opacity=".45"/><stop offset="1" stop-color="#62BDEA" stop-opacity="0"/></linearGradient><pattern id="ghatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#F09182" stroke-width="1.5" stroke-opacity=".5"/></pattern><filter id="gglow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
  months.forEach((m, i) => { const t = i / 6; svg += `<line x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${B}" stroke="rgba(255,255,255,.07)"/><text x="${x(t)}" y="${H - 8}" class="g-ax" text-anchor="${i === 6 ? 'end' : 'start'}">${m.toUpperCase()}</text>`; });
  svg += `<line x1="${L}" x2="${R}" y1="${y(0)}" y2="${y(0)}" stroke="rgba(255,255,255,.18)"/>`;
  svg += `<rect x="${x(tZero)}" y="${T}" width="${x(1) - x(tZero)}" height="${B - T}" fill="url(#ghatch)" opacity=".7"/><text x="${(x(tZero) + x(1)) / 2}" y="${y(0.55)}" class="g-note" fill="#F09182" text-anchor="middle">sold out if nobody orders</text>`;
  svg += `<path d="${area}" fill="url(#gfill)"/><path d="${nothing}" fill="none" stroke="#F09182" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round"/><path d="${solid}" fill="none" stroke="#7CCBF2" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" filter="url(#gglow)"/>`;
  svg += `<line x1="${x(tOrder)}" x2="${x(tLand)}" y1="${y(0) + 9}" y2="${y(0) + 9}" stroke="#EBBF63" stroke-width="3" stroke-linecap="round" opacity=".9"/><text x="${(x(tOrder) + x(tLand)) / 2}" y="${y(0) + 21}" class="g-note" fill="#EBBF63" text-anchor="middle">lead time 100 days</text>`;
  svg += `<line x1="${x(tToday)}" x2="${x(tToday)}" y1="${T}" y2="${B}" stroke="#F09182" stroke-width="1.5" stroke-dasharray="3 3"/><rect x="${x(tToday) - 22}" y="${T - 16}" width="44" height="16" rx="8" fill="#F09182"/><text x="${x(tToday)}" y="${T - 5}" class="g-today" text-anchor="middle">TODAY</text>`;
  const oy = y(stock(tOrder)), ox = x(tOrder);
  svg += `<line x1="${ox}" x2="${ox}" y1="${oy}" y2="${y(0)}" stroke="#EBBF63" stroke-dasharray="2 3"/><path d="M${ox},${oy - 8} l8,8 l-8,8 l-8,-8z" fill="#EBBF63" stroke="#0C161D" stroke-width="2"/><text x="${ox + 12}" y="${oy - 10}" class="g-lab2" fill="#EBBF63">Order by Sep 17</text>`;
  const lx = x(tLand), ly = y(stock(tLand) + Q);
  svg += `<circle cx="${lx}" cy="${ly}" r="6" fill="#5FD292" stroke="#0C161D" stroke-width="2"/><text x="${lx + 12}" y="${ly + 4}" class="g-lab2" fill="#5FD292">824 land Dec 26</text>`;
  svg += `<circle cx="${x(tToday)}" cy="${y(stock(tToday))}" r="5" fill="#fff" stroke="#0C161D" stroke-width="2"/><text x="${x(tToday) + 11}" y="${y(stock(tToday)) - 8}" class="g-lab2" fill="#DFEAF2">736 on hand</text>`;
  const decisions = [
    ['#F09182', 'Order the Carver 01 Black set by Sep 17.', 'Lofts 50, 54 and 58 run out inside the lead time.'],
    ['#EBBF63', 'Tour Glove order lands Oct 3.', '500 units, 23 already spoken for.'],
    ['#7CCBF2', '3 polos sit in the cut band this quarter.', 'Decide keep or cut before the spring order.'],
  ];
  const chips = [['Wedges', '63 wk'], ['Polos', '34 wk'], ['Hats', '55 wk'], ['Grips', '42 wk'], ['Gloves', 'out'], ['Putters', '9 wk']];
  const err = (typeof S !== 'undefined' && S.err && S.err !== 'Sign in to continue.') ? esc(S.err) : '';
  return `
  <div class="gate">
    <section class="gate-scene" aria-hidden="true">
      <div class="gs-in">
        <div class="gs-card gs-chartcard">
          <div class="gs-head"><div><b>Carver 01 Black</b><span>Wedges · 736 on hand · sells 39 a week</span></div><span class="gs-pill">Order now</span></div>
          <svg viewBox="0 0 ${W} ${H}" class="gs-chart">${svg}</svg>
        </div>
        <div class="gs-card gs-list">
          <div class="gs-cap-row"><span>This week</span><span>3 decisions</span></div>
          ${decisions.map(([c, t, b]) => `<div class="gs-dec"><i style="background:${c}"></i><div><b>${t}</b><span>${b}</span></div></div>`).join('')}
        </div>
        <div class="gs-chips">${chips.map(([l, w]) => `<span><b>${l}</b>${w}</span>`).join('')}</div>
      </div>
    </section>
    <section class="gate-panel">
      <div class="gate-card">
        <div class="gate-brand"><span class="mk"></span><span>Mobius Digital</span></div>
        <h1>Supply</h1>
        <p class="gate-sub">The buying brain for Lucky Golf. What to order, how much, and by when; what is on its way; what sells; what the next lineup should be.</p>
        <a class="gate-google" href="../hq/?next=/supply/"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1C3.3 21.3 7.3 24 12 24z"/><path fill="#FBBC05" d="M5.3 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C18 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>Continue with Google</a>
        <details class="gate-alt"><summary>Use the dashboard password instead</summary>
          <input id="gTok" type="password" placeholder="Dashboard password" autocomplete="current-password">
          <button class="btn primary" id="gGo" style="margin-top:10px;width:100%;justify-content:center">Sign in</button>
        </details>
        <div class="err" id="gErr">${err}</div>
      </div>
      <p class="gate-fine">Shopify is the source of truth for stock and sales. Supply decides what to buy. Every change is recorded with who made it.</p>
    </section>
  </div>`;
}
