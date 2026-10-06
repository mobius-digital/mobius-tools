/* Locus - Scenarios (2026-10-06). Two calculators that used to live elsewhere, now inside
 * Locus with the brand's own numbers filled in and the what-ifs saved per brand:
 *   Leads  "If we buy leads at $X and Y% of them buy, what comes back?" The giveaway /
 *          early-access math. Replaces the Q4 Playbook's Lead Gen Value Calculator.
 *   ROAS   The public /roas-calculator model (breakeven ROAS and CPA, profit at a plan),
 *          same math, prefilled from the brand.
 * The math runs in the browser as you type. Saved scenarios go through /api/scenario.
 * "Describe it in words" sends plain English to account-health /api/scenario-parse (Haiku)
 * which returns numbers for the columns; the person still decides.
 * Own closure like season.js. Entry: window.CalcTab.render({tok,url,act,accounts}).
 */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const AH = 'https://mobius-account-health.mobius-digital.workers.dev';
const S = { tok: '', url: '', act: 'all', accounts: [], kind: 'leads', pre: null, preErr: '', saved: [], cols: [], focus: 0, target: 3, roas: null, busy: false };
const LS_KIND = 'calc_kind';

async function api(path, opts = {}, base) {
  const res = await fetch((base || S.url).replace(/\/+$/, '') + path, { ...opts, headers: { Authorization: 'Bearer ' + S.tok, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
  return j;
}
const put = (p, b, m = 'PUT') => api(p, { method: m, body: JSON.stringify(b) });
const money = n => n == null || !isFinite(n) ? ' - ' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const money2 = n => n == null || !isFinite(n) ? ' - ' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
const k = n => n == null || !isFinite(n) ? ' - ' : (Math.abs(n) >= 10000 ? (n < 0 ? '-' : '') + '$' + (Math.abs(n) / 1000).toFixed(Math.abs(n) >= 100000 ? 0 : 1) + 'k' : money(n));
const num = n => n == null || !isFinite(n) ? ' - ' : Math.round(n).toLocaleString('en-US');
const x2 = n => n == null || !isFinite(n) ? ' - ' : n.toFixed(2) + 'x';
const pct = n => n == null || !isFinite(n) ? ' - ' : Math.round(n) + '%';
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const brand = () => S.accounts.find(a => a.act_id === S.act);

/* ---------- css ---------- */
function injectCss() {
  if (document.getElementById('calcCss')) return;
  const st = document.createElement('style'); st.id = 'calcCss';
  st.textContent = `
  .cc{--cc-line:var(--line,#E3E8EC);--cc-muted:var(--muted,#5F6F7B);--cc-surface:var(--surface,#fff);--cc-wash:var(--wash,#F3F6F8);--cc-good:var(--good,#1E7A45);--cc-warn:var(--warn,#A8801F);--cc-bad:var(--bad,#B03A2E)}
  .cc .card{margin-bottom:16px}
  .cc-seg{display:inline-flex;gap:4px;border:1px solid var(--cc-line);border-radius:99px;padding:3px;margin:0 0 14px;background:var(--bg,#fff)}
  .cc-seg button{border:0;background:transparent;border-radius:99px;padding:7px 15px;font:600 13px var(--sans,system-ui);color:var(--cc-muted);cursor:pointer}
  .cc-seg button.on{background:var(--ink,#111);color:var(--on-ink,#fff)}
  .cc-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:5px;margin-bottom:16px}
  .cc-strip .ru{background:var(--ink-panel,#1b2a36);border-radius:12px;padding:14px 18px;color:var(--on-ink,#fff);min-width:0}
  .cc-strip .ru-l{font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;opacity:.75}
  .cc-strip .ru-v{font-family:var(--display,var(--sans,system-ui));font-weight:700;font-size:26px;line-height:1.1;margin-top:4px;font-variant-numeric:tabular-nums}
  .cc-strip .ru-d{font-size:11px;opacity:.8;margin-top:5px;line-height:1.4}
  .cc-strip .ru-v.bad{color:#F2A197}.cc-strip .ru-v.warn{color:#E9CC7A}.cc-strip .ru-v.good{color:#8FD8A8}
  .cc-verdict{font-family:var(--serif,Georgia,serif);font-size:19px;line-height:1.35;margin:0 0 14px;max-width:70ch}
  .cc-pre{display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:13px}
  .cc-pre b{font-family:var(--display,var(--sans,system-ui));font-size:15px}
  .cc-pre .chip{border:1px solid var(--cc-line);border-radius:10px;padding:8px 12px;background:var(--cc-surface);display:flex;flex-direction:column;gap:2px;min-width:120px}
  .cc-pre .chip span{font-size:11px;color:var(--cc-muted);letter-spacing:.04em;text-transform:uppercase}
  .cc-words{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:start}
  .cc-words textarea{width:100%;min-height:64px;border:1px solid var(--cc-line);border-radius:10px;padding:10px 12px;font:14px/1.45 var(--sans,system-ui);background:var(--cc-surface);color:inherit;resize:vertical;box-sizing:border-box}
  .cc-words .ex{font-size:12px;color:var(--cc-muted);margin-top:6px;line-height:1.45}
  .cc-words .ex button{background:none;border:0;padding:0;font:inherit;color:var(--brand,#1F6F8B);cursor:pointer;text-decoration:underline}
  .cc-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13.5px;table-layout:fixed}
  .cc-tbl th,.cc-tbl td{padding:8px 10px;border-bottom:1px solid var(--cc-line);text-align:right;vertical-align:middle;font-variant-numeric:tabular-nums}
  .cc-tbl th:first-child,.cc-tbl td:first-child{text-align:left;width:190px;color:var(--cc-muted);font-weight:500;font-size:12.5px}
  .cc-tbl thead th{text-align:right;font:600 12px var(--sans,system-ui);border-bottom:2px solid var(--cc-line);vertical-align:bottom}
  .cc-tbl thead th .nm{width:100%;border:0;border-bottom:1px dashed var(--cc-line);background:transparent;font:600 14px var(--sans,system-ui);color:inherit;text-align:right;padding:2px 0}
  .cc-tbl thead th .nm:focus{outline:0;border-bottom-color:var(--brand,#1F6F8B)}
  .cc-tbl th.best,.cc-tbl td.best{background:color-mix(in srgb,var(--cc-good) 9%,transparent)}
  .cc-tbl th.focus,.cc-tbl td.focus{box-shadow:inset 3px 0 0 var(--brand,#1F6F8B)}
  .cc-tbl td.sec{border-bottom:0;padding-top:14px;font:600 11px var(--sans,system-ui);letter-spacing:.08em;text-transform:uppercase;color:var(--cc-muted)}
  .cc-tbl input.in{width:92px;max-width:100%;border:1px solid var(--cc-line);border-radius:7px;padding:5px 8px;font:500 13.5px var(--mono,ui-monospace,monospace);background:var(--cc-wash);color:inherit;text-align:right}
  .cc-tbl input.in:focus{outline:2px solid var(--brand,#1F6F8B);outline-offset:1px}
  .cc-tbl td.out{font-weight:600}
  .cc-tbl td.out.big{font-family:var(--display,var(--sans,system-ui));font-size:17px}
  .cc-tbl td .pos{color:var(--cc-good)}.cc-tbl td .neg{color:var(--cc-bad)}
  .cc-tbl .colact{display:flex;gap:4px;justify-content:flex-end;flex-wrap:wrap;margin-top:6px}
  .cc-mini{font-size:12px;padding:4px 9px}
  .cc-link{background:none;border:0;padding:0;font:inherit;color:var(--brand,#1F6F8B);cursor:pointer;text-decoration:underline}
  .cc-chart{width:100%;height:auto;display:block;margin-top:6px}
  .cc-chart text{font:11px var(--sans,system-ui);fill:var(--cc-muted)}
  .cc-chart .ax{stroke:var(--cc-line)}
  .cc-chart .band{fill:var(--cc-good);opacity:.1}
  .cc-chart .l0{stroke:var(--cc-muted);stroke-width:1.5;fill:none;stroke-dasharray:4 4}
  .cc-chart .l1{stroke:var(--brand,#1F6F8B);stroke-width:2.5;fill:none}
  .cc-chart .l2{stroke:var(--cc-muted);stroke-width:1.5;fill:none;stroke-dasharray:1 4}
  .cc-chart .tgt{stroke:var(--cc-good);stroke-width:1.5;stroke-dasharray:6 4}
  .cc-chart .be{stroke:var(--cc-bad);stroke-width:1.5;stroke-dasharray:6 4}
  .cc-chart .dot{fill:var(--brand,#1F6F8B);stroke:var(--cc-surface);stroke-width:2}
  .cc-chart .lab{font-weight:600;fill:var(--ink,#111)}
  .cc-bars{display:flex;flex-direction:column;gap:8px;margin-top:8px}
  .cc-bar{display:grid;grid-template-columns:150px 1fr 90px;gap:10px;align-items:center;font-size:13px}
  .cc-bar .trk{height:16px;border-radius:5px;background:var(--cc-wash);position:relative;overflow:hidden}
  .cc-bar .fill{position:absolute;top:0;bottom:0;border-radius:5px;background:var(--cc-good)}
  .cc-bar .fill.neg{background:var(--cc-bad)}
  .cc-bar .v{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
  .cc-saved{display:flex;gap:6px;flex-wrap:wrap}
  .cc-saved .sv{border:1px solid var(--cc-line);border-radius:10px;padding:6px 10px;font-size:12.5px;background:var(--cc-surface);display:flex;gap:8px;align-items:center}
  .cc-saved .sv b{font-weight:600}
  .cc-saved .sv .m{color:var(--cc-muted)}
  .cc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
  .cc-f{display:flex;flex-direction:column;gap:4px}
  .cc-f label{font-size:12px;color:var(--cc-muted)}
  .cc-f input,.cc-f select{border:1px solid var(--cc-line);border-radius:8px;padding:8px 10px;font:500 14px var(--mono,ui-monospace,monospace);background:var(--cc-surface);color:inherit;width:100%;box-sizing:border-box}
  .cc-f input:focus{outline:2px solid var(--brand,#1F6F8B);outline-offset:1px}
  .cc-f.off{opacity:.5}
  .cc-tog{display:flex;gap:8px;align-items:center;font-size:13px;margin-top:2px}
  .cc-two{display:grid;grid-template-columns:1.2fr 1fr;gap:16px}
  .cc-kv{display:grid;grid-template-columns:1fr auto;gap:6px 14px;font-size:13.5px}
  .cc-kv b{font-variant-numeric:tabular-nums;text-align:right}
  .cc-kv .tot{border-top:1px solid var(--cc-line);padding-top:6px;margin-top:2px;font-weight:700}
  .cc-mode{display:inline-flex;gap:4px;border:1px solid var(--cc-line);border-radius:8px;padding:2px}
  .cc-mode button{border:0;background:transparent;border-radius:6px;padding:5px 10px;font:600 12.5px var(--sans,system-ui);color:var(--cc-muted);cursor:pointer}
  .cc-mode button.on{background:var(--ink,#111);color:var(--on-ink,#fff)}
  @media (max-width:980px){.cc-two{grid-template-columns:1fr}.cc-words{grid-template-columns:1fr}.cc-bar{grid-template-columns:110px 1fr 80px}.cc-tbl th:first-child,.cc-tbl td:first-child{width:130px}}
  `;
  document.head.appendChild(st);
}
function toast(msg, bad) {
  const t = document.createElement('div'); t.textContent = msg;
  t.style.cssText = `position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:${bad ? 'var(--bad,#B03A2E)' : 'var(--ink,#111)'};color:#fff;padding:9px 16px;border-radius:99px;font:600 13px var(--sans,system-ui);z-index:90;box-shadow:0 6px 20px rgba(0,0,0,.2)`;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
}
function ask(title, hint, value, cta) {
  return new Promise(resolve => {
    const w = document.createElement('div'); w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal" style="max-width:480px"><h3>${esc(title)}</h3>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}<input id="ccAsk" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 10px;font:14px var(--sans,system-ui);background:var(--surface);color:inherit;box-sizing:border-box;margin-top:10px" value="${esc(value || '')}"><div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn" data-m="no">Cancel</button><button class="btn primary" data-m="yes">${esc(cta || 'Save')}</button></div></div>`;
    document.body.appendChild(w);
    const done = v => { w.remove(); resolve(v); };
    w.querySelector('[data-m="no"]').onclick = () => done(null);
    w.querySelector('[data-m="yes"]').onclick = () => done(w.querySelector('#ccAsk').value.trim());
    w.addEventListener('mousedown', e => { if (e.target === w) done(null); });
    setTimeout(() => w.querySelector('#ccAsk').focus(), 30);
  });
}

/* ---------- the lead math ---------- */
/* leads = spend / cpl; buyers = leads x cvr; revenue = buyers x aov; contribution before the
   lead spend = revenue x margin; profit = contribution - spend. Two numbers that do NOT depend on
   the spend: the breakeven CPL (cvr x aov x margin) and the CPL that hits the target ROAS
   (cvr x aov / target). Those are the KPI. */
function leadMath(c, target) {
  const spend = +c.spend || 0, cpl = +c.cpl || 0, cvr = (+c.cvr || 0) / 100, aov = +c.aov || 0, margin = (+c.margin || 0) / 100;
  const leads = cpl > 0 ? spend / cpl : 0;
  const buyers = leads * cvr;
  const revenue = buyers * aov;
  const roas = spend > 0 ? revenue / spend : 0;
  const contrib = revenue * margin;
  const profit = contrib - spend;
  const cpb = buyers > 0 ? spend / buyers : null;
  const beCpl = cvr * aov * margin;
  const tgtCpl = target > 0 ? cvr * aov / target : null;
  const beRoas = margin > 0 ? 1 / margin : null;
  return { leads, buyers, revenue, roas, contrib, profit, cpb, beCpl, tgtCpl, beRoas, cvr, aov, margin, spend, cpl };
}
function defaultCols() {
  const aov = Math.round(S.pre?.new_aov || 150);
  const margin = Math.round((S.pre?.margin ?? 0.55) * 100);
  return [
    { name: 'Base', spend: 20000, cpl: 3, cvr: 10, aov, margin },
    { name: 'Cheaper leads', spend: 20000, cpl: 2, cvr: 10, aov, margin },
    { name: 'Pricier leads', spend: 20000, cpl: 5, cvr: 10, aov, margin },
  ];
}
function verdictText(c, m) {
  if (!(m.spend > 0 && m.cpl > 0)) return 'Give the first column a spend and a cost per lead.';
  const good = m.roas >= S.target, ok = m.profit > 0;
  const head = `At ${money2(m.cpl)} a lead and ${pct(m.cvr * 100)} buying, ${k(m.spend)} buys ${num(m.leads)} leads, about ${num(m.buyers)} orders and ${k(m.revenue)} back: ${x2(m.roas)}.`;
  const tail = good ? ` That clears the ${x2(S.target)} target and leaves ${k(m.profit)} after the lead spend.`
    : ok ? ` Under the ${x2(S.target)} target but still ${k(m.profit)} ahead after the lead spend; pay no more than ${money2(m.tgtCpl)} a lead to hit target.`
    : ` That loses ${k(-m.profit)} after margin. Leads have to come in under ${money2(m.beCpl)} just to break even, under ${money2(m.tgtCpl)} to hit ${x2(S.target)}.`;
  return head + tail;
}

/* ROAS on the lead spend as a function of CPL, for three conversion rates. The spend cancels
   out, which is why the chart can say "pay up to $X a lead" for any budget. */
function leadChart(m) {
  const W = 720, H = 250, L = 46, R = 16, T = 18, B = 30;
  const xmax = Math.max(8, Math.ceil((m.cpl || 3) * 2));
  const curves = [m.cvr / 2, m.cvr, m.cvr * 2].map(cv => ({ cv, f: cpl => cv * m.aov / cpl }));
  const ymax = Math.max(6, Math.ceil(Math.min(curves[2].f(xmax / 6), 20)), S.target + 1, (m.beRoas || 0) + 1);
  const X = cpl => L + (cpl / xmax) * (W - L - R), Y = v => T + (1 - clamp(v, 0, ymax) / ymax) * (H - T - B);
  const path = f => { let d = ''; for (let i = 0; i <= 120; i++) { const cpl = 0.25 + (xmax - 0.25) * i / 120; const v = f(cpl); d += (i ? 'L' : 'M') + X(cpl).toFixed(1) + ',' + Y(v).toFixed(1); } return d; };
  const xt = []; for (let v = 1; v <= xmax; v += xmax > 12 ? 2 : 1) xt.push(v);
  const yt = []; for (let v = 1; v <= ymax; v += ymax > 10 ? 2 : 1) yt.push(v);
  const band = m.tgtCpl ? `<rect class="band" x="${L}" y="${T}" width="${(X(Math.min(m.tgtCpl, xmax)) - L).toFixed(1)}" height="${H - T - B}"/>` : '';
  const dot = m.cpl > 0 ? `<circle class="dot" cx="${X(Math.min(m.cpl, xmax)).toFixed(1)}" cy="${Y(m.roas).toFixed(1)}" r="5"/><text class="lab" x="${(X(Math.min(m.cpl, xmax)) + 8).toFixed(1)}" y="${(Y(m.roas) - 8).toFixed(1)}">this scenario</text>` : '';
  return `<svg class="cc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="ROAS on lead spend by cost per lead">
    ${band}
    ${yt.map(v => `<line class="ax" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v}x</text>`).join('')}
    ${xt.map(v => `<text x="${X(v)}" y="${H - 8}" text-anchor="middle">$${v}</text>`).join('')}
    <line class="ax" x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}"/>
    ${m.beRoas ? `<line class="be" x1="${L}" x2="${W - R}" y1="${Y(m.beRoas)}" y2="${Y(m.beRoas)}"/><text x="${W - R}" y="${Y(m.beRoas) - 5}" text-anchor="end" style="fill:var(--cc-bad)">breakeven ${x2(m.beRoas)}</text>` : ''}
    <line class="tgt" x1="${L}" x2="${W - R}" y1="${Y(S.target)}" y2="${Y(S.target)}"/><text x="${W - R}" y="${Y(S.target) - 5}" text-anchor="end" style="fill:var(--cc-good)">target ${x2(S.target)}</text>
    <path class="l0" d="${path(curves[0].f)}"/><path class="l1" d="${path(curves[1].f)}"/><path class="l2" d="${path(curves[2].f)}"/>
    <text x="${L + 4}" y="${T + 12}" class="lab">${pct(m.cvr * 100)} buy (solid) · ${pct(m.cvr * 50)} (dashed) · ${pct(m.cvr * 200)} (dotted)</text>
    ${m.tgtCpl ? `<text x="${L + 4}" y="${H - B - 6}" style="fill:var(--cc-good);font-weight:600">pay up to ${money2(m.tgtCpl)} a lead</text>` : ''}
    ${dot}
    <text x="${W / 2}" y="${H - 20}" text-anchor="middle" style="font-size:10px">cost per lead</text>
  </svg>`;
}

/* ---------- the ROAS model (the public calculator's math, verbatim in spirit) ---------- */
function defaultRoas() {
  return { aov: Math.round(S.pre?.new_aov || 100), margin: Math.round((S.pre?.margin ?? 0.6) * 100), mode: 'roas', spend: 10000, roas: 2.5, orders: 100, revenue: 25000,
    proc_on: 1, proc_pct: 2.9, proc_fixed: 0.3, ful_on: 1, ful: 8, fixed_on: 0, fixed: 5000, share_on: 0, share_pct: 15, fee_on: 0, fee_pct: 12 };
}
function roasMath(r) {
  const aov = +r.aov || 0, mf = (+r.margin || 0) / 100;
  const procPct = r.proc_on ? (+r.proc_pct || 0) / 100 : 0, procFixed = r.proc_on ? (+r.proc_fixed || 0) : 0;
  const ful = r.ful_on ? (+r.ful || 0) : 0, shareF = r.share_on ? (+r.share_pct || 0) / 100 : 0, feeF = r.fee_on ? (+r.fee_pct || 0) / 100 : 0;
  let revenue, orders, spend;
  if (r.mode === 'orders') { spend = +r.spend || 0; orders = +r.orders || 0; revenue = orders * aov; }
  else if (r.mode === 'revenue') { revenue = +r.revenue || 0; spend = (+r.roas || 0) > 0 ? revenue / +r.roas : 0; orders = aov > 0 ? revenue / aov : 0; }
  else { spend = +r.spend || 0; revenue = spend * (+r.roas || 0); orders = aov > 0 ? revenue / aov : 0; }
  const roas = spend > 0 ? revenue / spend : 0, cpa = orders > 0 ? spend / orders : 0;
  const cogs = orders * aov * (1 - mf), proc = orders * (aov * procPct + procFixed), fulT = orders * ful, share = revenue * shareF, fee = spend * feeF, fixed = r.fixed_on ? (+r.fixed || 0) : 0;
  const gross = revenue - cogs, contrib = gross - proc - fulT - spend - share - fee, net = contrib - fixed;
  const effM = aov > 0 ? mf - procPct - (procFixed + ful) / aov - shareF : 0;
  const impossible = effM <= 0;
  const beRoas = impossible ? null : (1 + feeF) / effM;
  const beRoasFull = impossible || spend <= 0 ? null : (1 + feeF + fixed / spend) / effM;
  const avail = aov * mf - (aov * procPct + procFixed) - ful - aov * shareF;
  const beCpa = avail > 0 ? avail / (1 + feeF) : 0;
  const perOrder = orders > 0 ? net / orders : 0;
  return { revenue, orders, spend, roas, cpa, cogs, proc, ful: fulT, share, fee, fixed, gross, contrib, net, beRoas, beRoasFull, beCpa, impossible, perOrder, netPct: revenue > 0 ? net / revenue * 100 : 0, effM };
}
function roasChart(r, m) {
  const W = 720, H = 230, L = 50, R = 16, T = 18, B = 30;
  const xs = []; for (let v = 0.5; v <= 6.0001; v += 0.1) xs.push(+v.toFixed(2));
  const prof = v => { const t = roasMath({ ...r, mode: 'roas', roas: v, spend: m.spend || +r.spend || 0 }); return r.fixed_on ? t.net : t.contrib; };
  const vals = xs.map(prof); const lo = Math.min(...vals, 0), hi = Math.max(...vals, 1);
  const X = v => L + (v - 0.5) / 5.5 * (W - L - R), Y = p => T + (1 - (p - lo) / (hi - lo || 1)) * (H - T - B);
  const d = xs.map((v, i) => (i ? 'L' : 'M') + X(v).toFixed(1) + ',' + Y(vals[i]).toFixed(1)).join('');
  const be = r.fixed_on ? m.beRoasFull : m.beRoas;
  const cur = m.roas;
  return `<svg class="cc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Profit by ROAS at this spend">
    <line class="ax" x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}"/>
    ${[1, 2, 3, 4, 5, 6].map(v => `<text x="${X(v)}" y="${H - 8}" text-anchor="middle">${v}x</text>`).join('')}
    <text x="${L - 6}" y="${Y(hi) + 4}" text-anchor="end">${k(hi)}</text><text x="${L - 6}" y="${Y(lo) + 4}" text-anchor="end">${k(lo)}</text><text x="${L - 6}" y="${Y(0) + 4}" text-anchor="end">$0</text>
    ${be && be >= 0.5 && be <= 6 ? `<line class="be" x1="${X(be)}" x2="${X(be)}" y1="${T}" y2="${H - B}"/><text x="${X(be) + 4}" y="${T + 12}" style="fill:var(--cc-bad)">breakeven ${x2(be)}</text>` : ''}
    <path class="l1" d="${d}"/>
    ${cur >= 0.5 && cur <= 6 ? `<circle class="dot" cx="${X(cur)}" cy="${Y(prof(cur))}" r="5"/><text class="lab" x="${X(cur) + 8}" y="${Y(prof(cur)) - 8}">${x2(cur)}: ${k(prof(cur))}</text>` : ''}
    <text x="${W / 2}" y="${H - 20}" text-anchor="middle" style="font-size:10px">ROAS at ${k(m.spend)} of spend · ${r.fixed_on ? 'net of fixed costs' : 'contribution after ads'}</text>
  </svg>`;
}

/* ---------- data ---------- */
async function loadPre() {
  S.pre = null; S.preErr = '';
  if (S.act === 'all') return;
  try {
    const r = await api(`/api/customers?act=${encodeURIComponent(S.act)}&days=90&journey=0`);
    const h = r.headline || {};
    S.pre = { new_aov: h.new_aov, returning_aov: h.returning_aov, margin: h.margin, cac: h.cac, new_orders: h.new_orders, from: r.window?.from, to: r.window?.to, cm_ok: r.cm_ok };
  } catch (e) { S.preErr = e.message; }
  const b = brand(); if (b && +b.target_roas > 0) S.target = +b.target_roas;
}
async function loadSaved() {
  try { S.saved = (await api(`/api/scenario?act=${encodeURIComponent(S.act)}`)).scenarios || []; } catch { S.saved = []; }
}

/* ---------- paint ---------- */
function crumb() { return typeof window.crumbFor === 'function' ? `<div class="ph-crumb">${window.crumbFor('calc')}</div>` : ''; }
function preCard() {
  const b = brand();
  if (S.act === 'all') return `<div class="card"><h3 style="margin:0 0 4px">Pick a brand up top</h3><p class="hint" style="margin:0">With a brand chosen the calculators start from its real last 90 days: new-customer order value, margin after product and shipping, and what a new customer costs today. Scenarios save to that brand.</p></div>`;
  if (S.preErr) return `<div class="card"><p class="hint" style="margin:0">Could not read ${esc(b?.name || 'the brand')}'s numbers (${esc(S.preErr)}). The columns start from defaults.</p></div>`;
  if (!S.pre) return '';
  const p = S.pre;
  return `<div class="card"><div class="row" style="justify-content:space-between;align-items:baseline;margin-bottom:8px"><h3 style="margin:0">${esc(b?.name || '')}, the last 90 days</h3><span class="tiny">${esc(p.from || '')} to ${esc(p.to || '')} · same lines as Profit and Customers</span></div>
    <div class="cc-pre">
      <div class="chip"><span>New-customer order</span><b>${money(p.new_aov)}</b></div>
      <div class="chip"><span>Returning order</span><b>${money(p.returning_aov)}</b></div>
      <div class="chip"><span>Margin before ads</span><b>${p.margin != null ? pct(p.margin * 100) : ' - '}</b></div>
      <div class="chip"><span>Cost per new customer</span><b>${money(p.cac)}</b></div>
      <div class="chip"><span>Goal ROAS</span><b>${x2(S.target)}</b></div>
      <button class="btn cc-mini" id="ccUsePre">Put these in every column</button>
    </div>
    ${p.cm_ok === false ? `<p class="tiny" style="margin:8px 0 0;color:var(--bad)">This brand's cost data is flagged on the Costs page, so the margin here is a guess. Type the real one.</p>` : ''}
  </div>`;
}
function wordsCard() {
  const ex = S.kind === 'leads'
    ? ['Spend $20k on the giveaway at $2, $3 and $4 a lead, 10% buy', 'What if only 5% buy at $3 a lead and the order is $150', 'I want $80k back from the list at 4x, what can a lead cost']
    : ['Spend $30k in November at 3x with a $140 order and 60% margin', 'What ROAS do we need to clear $10k a month of fixed costs on $25k of spend', '400 orders at $99 with $8 shipping and 2.9% fees, on $15k of ads'];
  return `<div class="card"><h3 style="margin:0 0 4px">Say it in words</h3><p class="hint" style="margin:0 0 10px">Describe the what-if the way you would say it on a call. It becomes numbers in the columns; nothing is saved until you press Save.</p>
    <div class="cc-words"><div><textarea id="ccWords" placeholder="${esc(ex[0])}"></textarea><div class="ex">Try: ${ex.map(e => `<button data-ex="${esc(e)}">${esc(e)}</button>`).join(' · ')}</div></div><button class="btn primary" id="ccBuild">Build the scenarios</button></div>
    <p class="tiny" id="ccReading" style="margin:8px 0 0"></p></div>`;
}
function savedCard() {
  const list = S.saved.filter(s => s.kind === S.kind);
  if (!list.length) return '';
  return `<div class="card"><h3 style="margin:0 0 8px">Saved for ${esc(brand()?.name || 'all brands')}</h3><div class="cc-saved">${list.map(s => `<div class="sv"><b>${esc(s.name)}</b><span class="m">${S.kind === 'leads' ? `${money2(s.inputs.cpl)} a lead · ${esc(String(s.inputs.cvr))}% buy · ${k(s.inputs.spend)}` : `${k(s.inputs.spend)} at ${x2(+s.inputs.roas)}`}</span><button class="cc-link" data-load="${esc(s.id)}">Load</button><button class="cc-link" data-del="${esc(s.id)}" style="color:var(--bad)">Delete</button></div>`).join('')}</div></div>`;
}

function paintLeads() {
  const main = $('#main');
  if (!S.cols.length) S.cols = defaultCols();
  if (S.focus >= S.cols.length) S.focus = 0;
  const ms = S.cols.map(c => leadMath(c, S.target));
  const best = ms.reduce((b, m, i) => m.profit > ms[b].profit ? i : b, 0);
  const f = ms[S.focus];
  const strip = `<div class="cc-strip">
    <div class="ru"><div class="ru-l">Leads</div><div class="ru-v">${num(f.leads)}</div><div class="ru-d">${k(f.spend)} at ${money2(f.cpl)} each</div></div>
    <div class="ru"><div class="ru-l">Orders from them</div><div class="ru-v">${num(f.buyers)}</div><div class="ru-d">${pct(f.cvr * 100)} of the leads buy</div></div>
    <div class="ru"><div class="ru-l">Revenue back</div><div class="ru-v">${k(f.revenue)}</div><div class="ru-d">${x2(f.roas)} on the lead spend</div></div>
    <div class="ru"><div class="ru-l">After the lead spend</div><div class="ru-v ${f.profit > 0 ? 'good' : 'bad'}">${k(f.profit)}</div><div class="ru-d">margin ${pct(f.margin * 100)} on the orders, minus ${k(f.spend)}</div></div>
    <div class="ru"><div class="ru-l">Pay up to</div><div class="ru-v ${f.tgtCpl && f.cpl <= f.tgtCpl ? 'good' : 'warn'}">${money2(f.tgtCpl)}</div><div class="ru-d">a lead, to hit ${x2(S.target)}. Breakeven ${money2(f.beCpl)}.</div></div>
  </div>`;
  const row = (label, key, fmtIn, step) => `<tr><td>${label}</td>${S.cols.map((c, i) => `<td class="${i === best ? 'best' : ''} ${i === S.focus ? 'focus' : ''}"><input class="in" data-i="${i}" data-k="${key}" type="number" step="${step}" value="${c[key] ?? ''}"></td>`).join('')}</tr>`;
  const out = (label, fn, cls = '') => `<tr><td>${label}</td>${ms.map((m, i) => `<td class="out ${cls} ${i === best ? 'best' : ''} ${i === S.focus ? 'focus' : ''}">${fn(m)}</td>`).join('')}</tr>`;
  const sec = label => `<tr><td class="sec" colspan="${S.cols.length + 1}">${label}</td></tr>`;
  const table = `<div class="card"><div class="row" style="justify-content:space-between;align-items:baseline;margin-bottom:6px"><h3 style="margin:0">The scenarios, side by side</h3><div style="display:flex;gap:8px;align-items:center"><label class="tiny">Target ROAS <input id="ccTarget" type="number" step="0.1" value="${S.target}" style="width:62px;border:1px solid var(--line);border-radius:6px;padding:3px 6px;font:500 13px var(--mono,monospace);background:var(--wash);color:inherit;text-align:right"></label>${S.cols.length < 4 ? '<button class="btn cc-mini" id="ccAddCol">+ Column</button>' : ''}</div></div>
    <p class="hint" style="margin:0 0 10px">Type in the grey boxes. The green column makes the most money after the lead spend; the marked column is the one the tiles and the chart read. Click a column name to make it the one they read.</p>
    <div style="overflow-x:auto"><table class="cc-tbl"><thead><tr><th></th>${S.cols.map((c, i) => `<th class="${i === best ? 'best' : ''} ${i === S.focus ? 'focus' : ''}"><input class="nm" data-name="${i}" value="${esc(c.name)}" title="Click to rename">${i === best ? '<div class="tiny" style="color:var(--good)">most money</div>' : ''}<div class="colact"><button class="cc-link cc-mini" data-focus="${i}">${i === S.focus ? 'reading this' : 'read this'}</button><button class="cc-link cc-mini" data-save="${i}">Save</button>${S.cols.length > 1 ? `<button class="cc-link cc-mini" data-rm="${i}" style="color:var(--bad)">Remove</button>` : ''}</div></th>`).join('')}</tr></thead><tbody>
      ${sec('What we put in')}
      ${row('Lead-gen spend, $', 'spend', 1, 500)}
      ${row('Cost per lead, $', 'cpl', 1, 0.25)}
      ${row('Of the leads who buy, %', 'cvr', 1, 1)}
      ${row('Average order, $', 'aov', 1, 5)}
      ${row('Margin before ads, %', 'margin', 1, 1)}
      ${sec('What comes back')}
      ${out('Leads', m => num(m.leads))}
      ${out('Orders', m => num(m.buyers))}
      ${out('Revenue', m => k(m.revenue), 'big')}
      ${out('ROAS on the lead spend', m => `<span class="${m.roas >= S.target ? 'pos' : m.roas >= (m.beRoas || 0) ? '' : 'neg'}">${x2(m.roas)}</span>`)}
      ${out('Contribution before the lead spend', m => k(m.contrib))}
      ${out('Left after the lead spend', m => `<span class="${m.profit >= 0 ? 'pos' : 'neg'}">${k(m.profit)}</span>`, 'big')}
      ${out('Cost per order won', m => money2(m.cpb))}
      ${sec('The KPI, whatever the budget')}
      ${out('Pay up to, per lead, for target', m => money2(m.tgtCpl))}
      ${out('Breakeven cost per lead', m => money2(m.beCpl))}
    </tbody></table></div>
    ${S.act !== 'all' ? `<div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn primary" id="ccKpi">Set "${esc(S.cols[S.focus].name)}" as this brand's lead KPI</button></div>` : ''}
  </div>`;
  const chart = `<div class="card"><h3 style="margin:0 0 2px">What a lead can cost</h3><p class="hint" style="margin:0 0 4px">ROAS on the lead spend against the cost per lead, for ${pct(f.cvr * 100)} of leads buying (and half and double that). The shaded zone is where a lead still hits the target. The spend does not change this curve; it only changes how many leads you get.</p>${leadChart(f)}</div>`;
  const bars = `<div class="card"><h3 style="margin:0 0 2px">Money left after the lead spend, each scenario</h3><div class="cc-bars">${(() => { const mx = Math.max(...ms.map(m => Math.abs(m.profit)), 1); return ms.map((m, i) => `<div class="cc-bar"><span>${esc(S.cols[i].name)}</span><div class="trk"><div class="fill ${m.profit < 0 ? 'neg' : ''}" style="left:${m.profit < 0 ? 50 - Math.abs(m.profit) / mx * 50 : 50}%;width:${Math.abs(m.profit) / mx * 50}%"></div></div><span class="v ${m.profit < 0 ? 'neg' : ''}">${k(m.profit)}</span></div>`).join(''); })()}</div></div>`;
  main.innerHTML = `<div class="cc">${crumb()}<h2>Scenarios</h2><p class="sub">The lead math and the ROAS math, with ${esc(brand()?.name || 'the brand')}'s own numbers in the boxes. Change anything; everything else moves.</p>
    ${seg()}${strip}<p class="cc-verdict">${esc(verdictText(S.cols[S.focus], f))}</p>${preCard()}${wordsCard()}${table}${chart}${bars}${savedCard()}</div>`;
  wireCommon();
  main.querySelectorAll('.cc-tbl input.in').forEach(inp => inp.addEventListener('input', () => { S.cols[+inp.dataset.i][inp.dataset.k] = parseFloat(inp.value); inPlace(paintLeads); }));
  main.querySelectorAll('.cc-tbl input.nm').forEach(inp => inp.addEventListener('change', () => { S.cols[+inp.dataset.name].name = inp.value.trim() || 'Scenario'; inPlace(paintLeads); }));
  main.querySelectorAll('[data-focus]').forEach(b => b.onclick = () => { S.focus = +b.dataset.focus; inPlace(paintLeads); });
  main.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { S.cols.splice(+b.dataset.rm, 1); S.focus = 0; inPlace(paintLeads); });
  main.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
    const c = S.cols[+b.dataset.save];
    const name = await ask('Save this scenario', 'A name the team will recognise next week.', c.name, 'Save'); if (!name) return;
    try { await put('/api/scenario', { act: S.act, kind: 'leads', name, inputs: { spend: c.spend, cpl: c.cpl, cvr: c.cvr, aov: c.aov, margin: c.margin, target: S.target }, note: '' }); c.name = name; await loadSaved(); inPlace(paintLeads); toast('Saved'); } catch (e) { toast(e.message, true); }
  });
  const add = $('#ccAddCol'); if (add) add.onclick = () => { const c = { ...S.cols[S.focus], name: 'Scenario ' + (S.cols.length + 1) }; S.cols.push(c); inPlace(paintLeads); };
  const tg = $('#ccTarget'); if (tg) tg.addEventListener('input', () => { S.target = parseFloat(tg.value) || 3; inPlace(paintLeads); });
  const kp = $('#ccKpi'); if (kp) kp.onclick = async () => {
    const c = S.cols[S.focus], m = f;
    try {
      await put('/api/season/answer', { act: S.act, key: 'lead_kpi', value: { name: c.name, cpl_target: +m.tgtCpl.toFixed(2), cpl_breakeven: +m.beCpl.toFixed(2), cvr: c.cvr, aov: c.aov, margin: c.margin, spend: c.spend, leads: Math.round(m.leads), revenue: Math.round(m.revenue), target: S.target, set_at: new Date().toISOString().slice(0, 10) } });
      toast(`Lead KPI set: pay up to ${money2(m.tgtCpl)} a lead`);
    } catch (e) { toast(e.message, true); }
  };
}

function paintRoas() {
  const main = $('#main');
  if (!S.roas) S.roas = defaultRoas();
  const r = S.roas, m = roasMath(r);
  const be = r.fixed_on ? m.beRoasFull : m.beRoas;
  const tone = m.impossible ? 'bad' : be && m.roas >= be * 1.15 ? 'good' : be && m.roas >= be ? 'warn' : 'bad';
  const strip = `<div class="cc-strip">
    <div class="ru"><div class="ru-l">Revenue</div><div class="ru-v">${k(m.revenue)}</div><div class="ru-d">${num(m.orders)} orders at ${money(+r.aov)}</div></div>
    <div class="ru"><div class="ru-l">Ad spend</div><div class="ru-v">${k(m.spend)}</div><div class="ru-d">${x2(m.roas)} · ${money2(m.cpa)} per order</div></div>
    <div class="ru"><div class="ru-l">Breakeven ROAS</div><div class="ru-v ${tone}">${m.impossible ? 'none' : x2(be)}</div><div class="ru-d">${m.impossible ? 'costs eat the whole margin' : r.fixed_on ? 'including fixed costs' : 'on contribution'}</div></div>
    <div class="ru"><div class="ru-l">Breakeven cost per order</div><div class="ru-v">${money2(m.beCpa)}</div><div class="ru-d">the most an order can cost to win</div></div>
    <div class="ru"><div class="ru-l">${r.fixed_on ? 'Net profit' : 'Contribution after ads'}</div><div class="ru-v ${(r.fixed_on ? m.net : m.contrib) >= 0 ? 'good' : 'bad'}">${k(r.fixed_on ? m.net : m.contrib)}</div><div class="ru-d">${pct(m.netPct)} of revenue · ${money2(m.perOrder)} an order</div></div>
  </div>`;
  const verdict = m.impossible ? 'With these costs there is no ROAS that makes money: product cost, fees and shipping take more than the order is worth. Fix the margin or the shipping before planning spend.'
    : `${k(m.spend)} at ${x2(m.roas)} brings ${k(m.revenue)} and ${num(m.orders)} orders. Breakeven is ${x2(be)}; ${m.roas >= be ? `you are ${((m.roas / be - 1) * 100).toFixed(0)}% above it and keep ${k(r.fixed_on ? m.net : m.contrib)}.` : `you are under it by ${((1 - m.roas / be) * 100).toFixed(0)}% and lose ${k(-(r.fixed_on ? m.net : m.contrib))}.`} Every order can cost up to ${money2(m.beCpa)} before it loses money.`;
  const F = (label, key, step, extra = '') => `<div class="cc-f ${extra}"><label>${label}</label><input data-r="${key}" type="number" step="${step}" value="${r[key] ?? ''}"></div>`;
  const T = (label, onKey, fields) => `<div class="cc-f ${r[onKey] ? '' : 'off'}"><div class="cc-tog"><input type="checkbox" id="cc_${onKey}" data-rt="${onKey}" ${r[onKey] ? 'checked' : ''}><label for="cc_${onKey}" style="font-size:13px;color:inherit">${label}</label></div>${fields}</div>`;
  const inputs = `<div class="card"><div class="row" style="justify-content:space-between;align-items:baseline;margin-bottom:8px"><h3 style="margin:0">What we put in</h3><div class="cc-mode">${[['roas', 'Spend + ROAS'], ['orders', 'Spend + orders'], ['revenue', 'Revenue goal + ROAS']].map(([v, l]) => `<button data-mode="${v}" class="${r.mode === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="cc-grid">
      ${F('Average order, $', 'aov', 1)}
      ${F('Gross margin, %', 'margin', 1)}
      ${r.mode !== 'revenue' ? F('Ad spend, $', 'spend', 500) : F('Revenue goal, $', 'revenue', 1000)}
      ${r.mode === 'orders' ? F('Orders', 'orders', 10) : F('ROAS', 'roas', 0.1)}
    </div>
    <div class="cc-grid" style="margin-top:12px">
      ${T('Payment processing', 'proc_on', `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><input data-r="proc_pct" type="number" step="0.1" value="${r.proc_pct}" title="%"><input data-r="proc_fixed" type="number" step="0.05" value="${r.proc_fixed}" title="$ per order"></div><span class="tiny">% + $ per order</span>`)}
      ${T('Pick, pack and ship', 'ful_on', `<input data-r="ful" type="number" step="0.5" value="${r.ful}"><span class="tiny">$ per order</span>`)}
      ${T('Fixed costs', 'fixed_on', `<input data-r="fixed" type="number" step="100" value="${r.fixed}"><span class="tiny">$ for the period</span>`)}
      ${T('Revenue share (affiliates, creators)', 'share_on', `<input data-r="share_pct" type="number" step="0.5" value="${r.share_pct}"><span class="tiny">% of revenue</span>`)}
      ${T('Agency fee on ad spend', 'fee_on', `<input data-r="fee_pct" type="number" step="0.5" value="${r.fee_pct}"><span class="tiny">% of spend</span>`)}
    </div>
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px"><a class="btn cc-mini" href="/roas-calculator/" target="_blank" rel="noopener">Open the public calculator</a><button class="btn primary cc-mini" id="ccSaveRoas">Save this scenario</button></div></div>`;
  const water = `<div class="card"><h3 style="margin:0 0 8px">Where the money goes</h3><div class="cc-kv">
    <span>Revenue</span><b>${money(m.revenue)}</b>
    <span>Product cost</span><b>-${money(m.cogs)}</b>
    ${r.proc_on ? `<span>Payment processing</span><b>-${money(m.proc)}</b>` : ''}
    ${r.ful_on ? `<span>Pick, pack and ship</span><b>-${money(m.ful)}</b>` : ''}
    ${r.share_on ? `<span>Revenue share</span><b>-${money(m.share)}</b>` : ''}
    <span>Ad spend</span><b>-${money(m.spend)}</b>
    ${r.fee_on ? `<span>Agency fee on spend</span><b>-${money(m.fee)}</b>` : ''}
    <span class="tot">Contribution after ads</span><b class="tot ${m.contrib >= 0 ? '' : 'neg'}" style="color:${m.contrib >= 0 ? 'var(--cc-good)' : 'var(--cc-bad)'}">${money(m.contrib)}</b>
    ${r.fixed_on ? `<span>Fixed costs</span><b>-${money(m.fixed)}</b><span class="tot">Net profit</span><b class="tot" style="color:${m.net >= 0 ? 'var(--cc-good)' : 'var(--cc-bad)'}">${money(m.net)}</b>` : ''}
  </div></div>`;
  const chart = `<div class="card"><h3 style="margin:0 0 2px">Profit at every ROAS, same spend</h3><p class="hint" style="margin:0 0 4px">Slide the plan along the curve: where it crosses zero is the breakeven, and the dot is the ROAS in the boxes.</p>${roasChart(r, m)}</div>`;
  main.innerHTML = `<div class="cc">${crumb()}<h2>Scenarios</h2><p class="sub">The lead math and the ROAS math, with ${esc(brand()?.name || 'the brand')}'s own numbers in the boxes. Change anything; everything else moves.</p>
    ${seg()}${strip}<p class="cc-verdict">${esc(verdict)}</p>${preCard()}${wordsCard()}<div class="cc-two">${inputs}${water}</div>${chart}${savedCard()}</div>`;
  wireCommon();
  main.querySelectorAll('[data-r]').forEach(inp => inp.addEventListener('input', () => { r[inp.dataset.r] = parseFloat(inp.value); inPlace(paintRoas); }));
  main.querySelectorAll('[data-rt]').forEach(cb => cb.addEventListener('change', () => { r[cb.dataset.rt] = cb.checked ? 1 : 0; inPlace(paintRoas); }));
  main.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
    const cur = roasMath(r);
    if (b.dataset.mode === 'roas') { r.spend = Math.round(cur.spend) || r.spend; r.roas = +cur.roas.toFixed(2) || r.roas; }
    if (b.dataset.mode === 'orders') { r.spend = Math.round(cur.spend) || r.spend; r.orders = Math.round(cur.orders) || r.orders; }
    if (b.dataset.mode === 'revenue') { r.revenue = Math.round(cur.revenue) || r.revenue; r.roas = +cur.roas.toFixed(2) || r.roas; }
    r.mode = b.dataset.mode; inPlace(paintRoas);
  });
  const sv = $('#ccSaveRoas'); if (sv) sv.onclick = async () => {
    const name = await ask('Save this scenario', 'A name the team will recognise next week.', `${k(m.spend)} at ${x2(m.roas)}`, 'Save'); if (!name) return;
    try { await put('/api/scenario', { act: S.act, kind: 'roas', name, inputs: { ...r }, note: '' }); await loadSaved(); inPlace(paintRoas); toast('Saved'); } catch (e) { toast(e.message, true); }
  };
}

function seg() { return `<div class="cc-seg" role="tablist"><button data-kind="leads" class="${S.kind === 'leads' ? 'on' : ''}">Leads: what can a lead cost</button><button data-kind="roas" class="${S.kind === 'roas' ? 'on' : ''}">ROAS: breakeven and profit</button></div>`; }
function inPlace(fn) { const el = document.activeElement; const id = el && el.dataset ? (el.dataset.i != null ? `in:${el.dataset.i}:${el.dataset.k}` : el.dataset.r ? `r:${el.dataset.r}` : el.id ? `id:${el.id}` : null) : null; const y = window.scrollY; const selEnd = el && el.selectionEnd; fn(); window.scrollTo(0, y);
  if (id) { let n = null; if (id.startsWith('in:')) { const [, i, k2] = id.split(':'); n = document.querySelector(`.cc-tbl input.in[data-i="${i}"][data-k="${k2}"]`); } else if (id.startsWith('r:')) n = document.querySelector(`[data-r="${id.slice(2)}"]`); else n = document.getElementById(id.slice(3)); if (n) { n.focus(); try { if (selEnd != null && n.type !== 'number') n.setSelectionRange(selEnd, selEnd); } catch {} } } }
function wireCommon() {
  const main = $('#main');
  main.querySelectorAll('.cc-seg button').forEach(b => b.onclick = () => { S.kind = b.dataset.kind; try { localStorage.setItem(LS_KIND, S.kind); } catch {} paint(); window.scrollTo(0, 0); });
  const up = $('#ccUsePre'); if (up) up.onclick = () => { const p = S.pre; if (!p) return; if (S.kind === 'leads') S.cols.forEach(c => { if (p.new_aov) c.aov = Math.round(p.new_aov); if (p.margin != null) c.margin = Math.round(p.margin * 100); }); else { if (p.new_aov) S.roas.aov = Math.round(p.new_aov); if (p.margin != null) S.roas.margin = Math.round(p.margin * 100); } inPlace(paint); toast('Filled from the last 90 days'); };
  main.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { $('#ccWords').value = b.dataset.ex; });
  const bld = $('#ccBuild'); if (bld) bld.onclick = buildFromWords;
  main.querySelectorAll('[data-load]').forEach(b => b.onclick = () => { const s = S.saved.find(x => x.id === b.dataset.load); if (!s) return; if (S.kind === 'leads') { const c = { name: s.name, spend: s.inputs.spend, cpl: s.inputs.cpl, cvr: s.inputs.cvr, aov: s.inputs.aov, margin: s.inputs.margin }; if (s.inputs.target) S.target = +s.inputs.target; if (S.cols.length >= 4) S.cols[S.cols.length - 1] = c; else S.cols.push(c); S.focus = S.cols.length - 1; } else { S.roas = { ...defaultRoas(), ...s.inputs }; } inPlace(paint); });
  main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { const ok = typeof window.confirmModal === 'function' ? await window.confirmModal('Delete this saved scenario?', 'The columns on screen stay as they are.', 'Delete') : true; if (!ok) return; try { await api(`/api/scenario?id=${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' }); await loadSaved(); inPlace(paint); } catch (e) { toast(e.message, true); } });
}
async function buildFromWords() {
  const text = ($('#ccWords')?.value || '').trim(); if (!text) return toast('Describe the scenario first', true);
  const btn = $('#ccBuild'); btn.disabled = true; btn.textContent = 'Reading…';
  try {
    const ctx = { brand: brand()?.name || null, new_customer_aov: S.pre?.new_aov ? Math.round(S.pre.new_aov) : null, margin_pct_before_ads: S.pre?.margin != null ? Math.round(S.pre.margin * 100) : null, cac: S.pre?.cac ? Math.round(S.pre.cac) : null, target_roas: S.target };
    const r = await api('/api/scenario-parse', { method: 'POST', body: JSON.stringify({ text, kind: S.kind, context: ctx }) }, AH);
    if (S.kind === 'leads') {
      const base = S.cols[S.focus] || defaultCols()[0];
      S.cols = r.scenarios.map((s, i) => ({ name: s.name || `Scenario ${i + 1}`, spend: +s.spend || base.spend, cpl: +s.cpl || base.cpl, cvr: +s.cvr || base.cvr, aov: +s.aov || base.aov, margin: +s.margin || base.margin }));
      if (r.scenarios[0]?.target_roas > 0) S.target = +r.scenarios[0].target_roas;
      S.focus = 0;
    } else {
      const s = r.scenarios[0] || {}; const d = S.roas || defaultRoas();
      S.roas = { ...d, aov: +s.aov || d.aov, margin: +s.margin || d.margin, mode: ['roas', 'orders', 'revenue'].includes(s.mode) ? s.mode : d.mode, spend: +s.spend || d.spend, roas: +s.roas || d.roas, orders: +s.orders || d.orders, revenue: +s.revenue || d.revenue, ful: s.fulfillment != null ? +s.fulfillment : d.ful, ful_on: s.fulfillment != null ? (+s.fulfillment > 0 ? 1 : 0) : d.ful_on, proc_pct: s.processing_pct != null ? +s.processing_pct : d.proc_pct, fixed: s.fixed != null ? +s.fixed : d.fixed, fixed_on: s.fixed > 0 ? 1 : d.fixed_on };
    }
    paint(); const rd = $('#ccReading'); if (rd) rd.textContent = r.reading || ''; const w = $('#ccWords'); if (w) w.value = text;
  } catch (e) { toast(e.message, true); }
  finally { const b2 = $('#ccBuild'); if (b2) { b2.disabled = false; b2.textContent = 'Build the scenarios'; } }
}
function paint() { if (S.kind === 'roas') paintRoas(); else paintLeads(); if (typeof window.pageActions === 'function') window.pageActions(''); }

async function render({ tok, url, act, accounts }) {
  const switched = S.act !== act;
  Object.assign(S, { tok, url, act, accounts: accounts || [] });
  injectCss();
  try { S.kind = localStorage.getItem(LS_KIND) || S.kind; } catch {}
  if (switched) { S.cols = []; S.roas = null; S.focus = 0; S.target = 3; }
  $('#main').innerHTML = `<div class="cc"><div class="card"><span class="hint">Loading…</span></div></div>`;
  await Promise.all([loadPre(), loadSaved()]);
  if (!S.cols.length) S.cols = defaultCols();
  if (!S.roas) S.roas = defaultRoas();
  paint();
}
window.CalcTab = { render };
})();
