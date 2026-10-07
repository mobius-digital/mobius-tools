/* Locus - Scenarios (2026-10-06, v2 the same night after Cole: "looks like Canva, no hover,
 * text over the lines, what is that bar chart, numbers over the lines"; v3 later that night after
 * the audit against /roas-calculator: per-order receipt, ad-fee "applies to", reset and the formula
 * note came back in, plus what pro tools add for clarity: a sensitivity grid you can click, a
 * per-lead receipt, and a delta against the first scenario on every card).
 * Two instruments with one answer each, big, in mono:
 *   Leads  "Pay up to $X a lead." Dial spend / cost per lead / % who buy / order / margin for the
 *          scenario you are reading; compare up to four as cards; see where a lead pays on one
 *          strip; hover the curve for the numbers at any cost per lead; see where every dollar
 *          of the plan goes.
 *   ROAS   "You keep $X." The public /roas-calculator model (modes, cost toggles, breakeven
 *          ROAS and CPA), same hero / dial / dollar bar / curve treatment.
 * Math is unchanged from v1 (leadMath / roasMath). Saved what-ifs go through /api/scenario.
 * "Say it in words" sends plain English to account-health /api/scenario-parse (Haiku).
 * Own closure like season.js. Entry: window.CalcTab.render({tok,url,act,accounts}).
 */
(function () {
'use strict';
let TARGET = null; const host = () => TARGET || document.getElementById('main');
const $ = s => (TARGET || document).querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const AH = 'https://mobius-account-health.mobius-digital.workers.dev';
const S = { tok: '', url: '', act: 'all', accounts: [], kind: 'leads', pre: null, preErr: '', saved: [], cols: [], focus: 0, target: 3, roas: null, ro: false, shared: null };
const LS_KIND = 'calc_kind';

async function api(path, opts = {}, base) {
  const res = await fetch((base || S.url).replace(/\/+$/, '') + path, { ...opts, headers: { Authorization: 'Bearer ' + S.tok, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
  return j;
}
const put = (p, b, m = 'PUT') => api(p, { method: m, body: JSON.stringify(b) });
const fin = n => n != null && isFinite(n);
const money = n => !fin(n) ? '-' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const money2 = n => !fin(n) ? '-' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
const k = n => !fin(n) ? '-' : Math.abs(n) >= 10000 ? (n < 0 ? '-' : '') + '$' + (Math.abs(n) / 1000).toFixed(Math.abs(n) >= 100000 ? 0 : 1) + 'k' : money(n);
const ka = n => !fin(n) ? '-' : Math.abs(n) >= 1000 ? (n < 0 ? '-' : '') + '$' + (Math.abs(n) / 1000).toFixed(Math.abs(n) >= 100000 ? 0 : 1) + 'k' : money(n);
const num = n => !fin(n) ? '-' : Math.round(n).toLocaleString('en-US');
const x2 = n => !fin(n) ? '-' : n.toFixed(2) + 'x';
const pct = n => !fin(n) ? '-' : (Math.round(n * 10) / 10).toLocaleString('en-US') + '%';
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const brand = () => S.accounts.find(a => a.act_id === S.act);

/* ---------- css ---------- */
function injectCss() {
  if (document.getElementById('calcCss')) return;
  const lk = document.createElement('link'); lk.rel = 'stylesheet'; lk.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap'; document.head.appendChild(lk);
  const st = document.createElement('style'); st.id = 'calcCss';
  st.textContent = `
  .cc{--cc-line:var(--line,#E3E8EC);--cc-muted:var(--muted,#5F6F7B);--cc-surface:var(--surface,#fff);--cc-wash:var(--wash,#F3F6F8);--cc-good:var(--good,#1E7A45);--cc-warn:var(--warn,#A8801F);--cc-bad:var(--bad,#B03A2E);--cc-acc:var(--brand,#1F6F8B);--cc-mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;--cc-panel:var(--ink-panel,#15212B);--cc-on:var(--on-ink,#fff)}
  .cc .card{margin-bottom:14px}
  .cc .mono{font-family:var(--cc-mono);font-variant-numeric:tabular-nums}
  .cc-seg{display:inline-flex;gap:4px;border:1px solid var(--cc-line);border-radius:99px;padding:3px;margin:0 0 14px;background:var(--bg,#fff)}
  .cc-seg button{border:0;background:transparent;border-radius:99px;padding:7px 15px;font:600 13px var(--sans,system-ui);color:var(--cc-muted);cursor:pointer}
  .cc-seg button.on{background:var(--ink,#111);color:var(--on-ink,#fff)}
  /* hero */
  .cc-hero{background:radial-gradient(120% 140% at 100% 0%,color-mix(in srgb,var(--cc-acc) 28%,var(--cc-panel)) 0%,var(--cc-panel) 55%);color:var(--cc-on);border-radius:18px;padding:22px 26px 20px;margin-bottom:14px;position:relative;overflow:hidden}
  .cc-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.04),transparent 40%);pointer-events:none}
  .cc-hero .eb{font:600 10.5px var(--sans,system-ui);letter-spacing:.14em;text-transform:uppercase;opacity:.7;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .cc-hero .big{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin:8px 0 4px}
  .cc-hero .big .n{font:600 56px/1 var(--cc-mono);letter-spacing:-.02em;font-variant-numeric:tabular-nums}
  .cc-hero .big .u{font:500 15px var(--sans,system-ui);opacity:.85;max-width:34ch;line-height:1.3}
  .cc-pill{display:inline-flex;align-items:center;gap:6px;font:600 11px var(--sans,system-ui);letter-spacing:.06em;text-transform:uppercase;border-radius:99px;padding:5px 10px;background:rgba(255,255,255,.12);color:#fff}
  .cc-pill i{width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block}
  .cc-pill.good{color:#8FD8A8}.cc-pill.warn{color:#E9CC7A}.cc-pill.bad{color:#F2A197}
  .cc-hero .read{font-size:14px;line-height:1.5;opacity:.92;max-width:78ch;margin:6px 0 14px}
  .cc-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px 0;border-top:1px solid rgba(255,255,255,.14);padding-top:14px}
  .cc-stats>div{padding:0 14px;border-left:1px solid rgba(255,255,255,.12);min-width:0}
  .cc-stats>div:first-child{border-left:0;padding-left:0}
  .cc-stats .l{font:600 10px var(--sans,system-ui);letter-spacing:.12em;text-transform:uppercase;opacity:.65}
  .cc-stats .v{font:600 20px/1.2 var(--cc-mono);margin-top:3px;font-variant-numeric:tabular-nums}
  .cc-stats .v.good{color:#8FD8A8}.cc-stats .v.bad{color:#F2A197}.cc-stats .v.warn{color:#E9CC7A}
  .cc-stats .s{font-size:11px;opacity:.7;margin-top:2px}
  /* layout */
  .cc-two{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:14px;align-items:start}
  .cc-h3{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin:0 0 4px}
  .cc-h3 h3{margin:0}
  /* dials */
  .cc-dial{display:grid;grid-template-columns:1fr;gap:14px}
  .cc-d{display:grid;grid-template-columns:1fr 118px;gap:2px 12px;align-items:center}
  .cc-d label{font:600 13px var(--sans,system-ui)}
  .cc-d .in{display:flex;align-items:center;gap:6px;border:1px solid var(--cc-line);border-radius:8px;padding:0 9px;background:var(--cc-surface);transition:border-color .12s}
  .cc-d .in span{font:500 12px var(--cc-mono);color:var(--cc-muted)}
  .cc-d .in input{width:100%;border:0;background:transparent;padding:6px 0;font:500 13.5px var(--cc-mono);color:inherit;text-align:right;font-variant-numeric:tabular-nums;min-width:0}
  .cc-d .in input:focus{outline:0}
  .cc-d .in:focus-within{border-color:var(--cc-acc);box-shadow:0 0 0 3px color-mix(in srgb,var(--cc-acc) 18%,transparent)}
  .cc-d input[type=range]{grid-column:1/-1;width:100%;-webkit-appearance:none;appearance:none;height:22px;margin:0;cursor:pointer;background:transparent}
  .cc-d input[type=range]:focus{outline:0}
  .cc-d input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(90deg,var(--cc-acc) 0,var(--cc-acc) var(--p,0%),var(--cc-line) var(--p,0%))}
  .cc-d input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--cc-surface);border:2px solid var(--cc-acc);box-shadow:0 1px 4px rgba(0,0,0,.22);margin-top:-7px;transition:transform .1s}
  .cc-d input[type=range]:hover::-webkit-slider-thumb,.cc-d input[type=range]:active::-webkit-slider-thumb{transform:scale(1.15)}
  .cc-d input[type=range]::-moz-range-track{height:4px;border-radius:2px;background:var(--cc-line)}
  .cc-d input[type=range]::-moz-range-progress{height:4px;border-radius:2px;background:var(--cc-acc)}
  .cc-d input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:var(--cc-surface);border:2px solid var(--cc-acc)}
  .cc-d small{grid-column:1/-1;font-size:11.5px;color:var(--cc-muted);line-height:1.4;margin-top:-6px}
  .cc-assume{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
  .cc-assume div{border:1px solid var(--cc-line);border-radius:10px;padding:10px 12px}
  .cc-assume .l{font:600 10px var(--sans,system-ui);letter-spacing:.12em;text-transform:uppercase;color:var(--cc-muted)}
  .cc-assume .v{font:600 18px var(--cc-mono);margin-top:3px;font-variant-numeric:tabular-nums}
  /* scenario cards */
  .cc-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
  .cc-sc{border:1px solid var(--cc-line);border-radius:14px;padding:12px 12px 10px;background:var(--cc-surface);cursor:pointer;min-width:0;position:relative;transition:border-color .12s,box-shadow .12s}
  .cc-sc:hover{border-color:var(--cc-acc)}
  .cc-sc.on{border-color:var(--cc-acc);box-shadow:0 0 0 3px color-mix(in srgb,var(--cc-acc) 18%,transparent)}
  .cc-sc .nm{width:100%;border:0;background:transparent;font:600 13px var(--sans,system-ui);color:inherit;padding:0;margin-bottom:6px;border-bottom:1px dashed transparent}
  .cc-sc .nm:focus{outline:0;border-bottom-color:var(--cc-acc)}
  .cc-sc .z{position:absolute;top:12px;right:12px;width:9px;height:9px;border-radius:50%}
  .cc-sc .z.good{background:var(--cc-good)}.cc-sc .z.warn{background:var(--cc-warn)}.cc-sc .z.bad{background:var(--cc-bad)}
  .cc-sc .r{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--cc-muted);padding:3px 0;border-top:1px solid var(--cc-line)}
  .cc-sc .r b{font:600 13px var(--cc-mono);color:var(--ink,#111);font-variant-numeric:tabular-nums}
  .cc-sc .r b.good{color:var(--cc-good)}.cc-sc .r b.bad{color:var(--cc-bad)}
  .cc-sc .act{display:flex;gap:10px;margin-top:8px}
  .cc-sc.add{display:grid;place-items:center;min-height:120px;color:var(--cc-muted);font:600 13px var(--sans,system-ui);border-style:dashed;background:transparent}
  .cc-link{background:none;border:0;padding:0;font:inherit;font-size:12px;color:var(--cc-acc);cursor:pointer;text-decoration:underline}
  .cc-link.bad{color:var(--cc-bad)}
  .cc-mini{font-size:12.5px;padding:5px 10px}
  /* zone strip */
  .cc-zone{position:relative;height:112px;margin:14px 4px 0}
  .cc-zone .trk{position:absolute;left:0;right:0;top:34px;height:14px;border-radius:7px;overflow:hidden;background:var(--cc-wash);display:flex}
  .cc-zone .trk i{display:block;height:100%}
  .cc-zone .trk .g{background:linear-gradient(90deg,color-mix(in srgb,var(--cc-good) 55%,#fff),var(--cc-good))}
  .cc-zone .trk .a{background:linear-gradient(90deg,var(--cc-warn),color-mix(in srgb,var(--cc-warn) 70%,var(--cc-bad)))}
  .cc-zone .trk .r{background:color-mix(in srgb,var(--cc-bad) 85%,#000)}
  .cc-zone .tk{position:absolute;top:50px;font:500 10.5px var(--cc-mono);color:var(--cc-muted);transform:translateX(-50%)}
  .cc-zone .zl{position:absolute;top:0;font:600 10.5px var(--sans,system-ui);letter-spacing:.06em;text-transform:uppercase;transform:translateX(-50%);white-space:nowrap}
  .cc-zone .mk{position:absolute;top:28px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:0}
  .cc-zone .mk i{width:14px;height:26px;border-radius:7px;background:var(--ink,#111);border:3px solid var(--cc-surface);box-shadow:0 2px 8px rgba(0,0,0,.25)}
  .cc-zone .mk.on i{background:var(--cc-acc)}
  .cc-zone .mk b{font:600 11px var(--sans,system-ui);white-space:nowrap;background:var(--cc-surface);padding:2px 7px;border-radius:6px;border:1px solid var(--cc-line);margin-top:14px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  .cc-zone .mk.lo b{margin-top:38px}
  /* charts */
  .cc-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--cc-muted);margin:4px 0 2px}
  .cc-leg span{display:inline-flex;align-items:center;gap:6px}
  .cc-leg i{width:18px;height:0;border-top:2.5px solid var(--cc-acc);display:inline-block}
  .cc-leg i.d{border-top-style:dashed;border-color:var(--cc-muted)}
  .cc-leg i.t{border-top-style:dotted;border-color:var(--cc-muted)}
  .cc-leg i.tg{border-color:var(--cc-good);border-top-style:dashed}
  .cc-leg i.be{border-color:var(--cc-bad);border-top-style:dashed}
  .cc-chart{width:100%;height:auto;display:block;cursor:crosshair;touch-action:none}
  .cc-chart text{font:11px var(--cc-mono);fill:var(--cc-muted)}
  .cc-chart .grid{stroke:var(--cc-line);stroke-dasharray:2 4}
  .cc-chart .ax{stroke:var(--cc-line)}
  .cc-chart .band{fill:var(--cc-good);opacity:.08}
  .cc-chart .area{fill:url(#ccGrad)}
  .cc-chart .l0{stroke:var(--cc-muted);stroke-width:1.5;fill:none;stroke-dasharray:5 4;opacity:.8}
  .cc-chart .l1{stroke:var(--cc-acc);stroke-width:2.5;fill:none;stroke-linejoin:round}
  .cc-chart .l2{stroke:var(--cc-muted);stroke-width:1.5;fill:none;stroke-dasharray:1.5 4;opacity:.8}
  .cc-chart .tgt{stroke:var(--cc-good);stroke-width:1.5;stroke-dasharray:6 4}
  .cc-chart .be{stroke:var(--cc-bad);stroke-width:1.5;stroke-dasharray:6 4}
  .cc-chart .dot{fill:var(--cc-acc);stroke:var(--cc-surface);stroke-width:2.5}
  .cc-chart .dot.halo{fill:var(--cc-acc);opacity:.18;stroke:none}
  .cc-chart .xh{stroke:var(--ink,#111);stroke-width:1;opacity:.35}
  .cc-chart .tagbox{fill:var(--cc-surface);stroke:var(--cc-line)}
  .cc-chart .tag{font:600 10px var(--sans,system-ui);fill:var(--ink,#111)}
  .cc-tip{position:fixed;z-index:95;pointer-events:none;background:var(--ink,#111);color:var(--on-ink,#fff);border-radius:10px;padding:9px 11px;font:12.5px/1.45 var(--sans,system-ui);box-shadow:0 10px 30px -8px rgba(0,0,0,.45);min-width:170px}
  .cc-tip b{font:600 13px var(--cc-mono);font-variant-numeric:tabular-nums}
  .cc-tip .h{font:600 11px var(--sans,system-ui);letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-bottom:4px}
  .cc-tip .r{display:flex;justify-content:space-between;gap:14px}
  /* dollar bar */
  .cc-dol{margin-top:8px}
  .cc-dol .bar{display:flex;height:34px;border-radius:9px;overflow:hidden;background:var(--cc-wash)}
  .cc-dol .bar i{display:block;height:100%;min-width:2px;transition:width .2s}
  .cc-dol .lg{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:10px}
  .cc-dol .lg div{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;color:var(--cc-muted);min-width:0}
  .cc-dol .lg i{width:10px;height:10px;border-radius:3px;flex:none;margin-top:4px}
  .cc-dol .lg b{display:block;font:600 15px var(--cc-mono);color:var(--ink,#111);font-variant-numeric:tabular-nums}
  .cc-dol .lg b.good{color:var(--cc-good)}.cc-dol .lg b.bad{color:var(--cc-bad)}
  /* words + saved */
  .cc-words{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:start}
  .cc-words textarea{width:100%;min-height:58px;border:1px solid var(--cc-line);border-radius:10px;padding:10px 12px;font:14px/1.45 var(--sans,system-ui);background:var(--cc-surface);color:inherit;resize:vertical;box-sizing:border-box}
  .cc-words .ex{font-size:12px;color:var(--cc-muted);margin-top:6px;line-height:1.5}
  .cc-saved{display:flex;gap:6px;flex-wrap:wrap}
  .cc-saved .sv{border:1px solid var(--cc-line);border-radius:10px;padding:6px 10px;font-size:12.5px;background:var(--cc-surface);display:flex;gap:8px;align-items:center}
  .cc-saved .sv b{font-weight:600}.cc-saved .sv .m{color:var(--cc-muted);font-family:var(--cc-mono);font-size:12px}
  /* roas extras */
  .cc-mode{display:inline-flex;gap:4px;border:1px solid var(--cc-line);border-radius:9px;padding:3px}
  .cc-mode button{border:0;background:transparent;border-radius:7px;padding:5px 10px;font:600 12px var(--sans,system-ui);color:var(--cc-muted);cursor:pointer}
  .cc-mode button.on{background:var(--ink,#111);color:var(--on-ink,#fff)}
  .cc-togs{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px;margin-top:6px}
  .cc-tg{border:1px solid var(--cc-line);border-radius:10px;padding:8px 10px;display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;font-size:12.5px}
  .cc-tg.off{opacity:.55}
  .cc-tg input[type=checkbox]{accent-color:var(--cc-acc);width:15px;height:15px;margin:0}
  .cc-tg .f{grid-column:1/-1;display:flex;gap:6px;align-items:center}
  .cc-tg .f input{width:70px;border:1px solid var(--cc-line);border-radius:6px;padding:4px 6px;font:600 12.5px var(--cc-mono);background:var(--cc-wash);color:inherit;text-align:right}
  .cc-tg .f span{color:var(--cc-muted);font-size:11.5px}
  /* sensitivity grid */
  .cc-grid{display:grid;gap:3px}
  .cc-grid .h{font:600 10.5px var(--sans,system-ui);color:var(--cc-muted);text-align:center;padding:0 2px 4px;align-self:end;letter-spacing:.02em}
  .cc-grid .h.rh{text-align:right;padding:0 8px 0 0;align-self:center;font-family:var(--cc-mono);font-weight:500}
  .cc-grid .c{border-radius:7px;padding:8px 4px 6px;text-align:center;cursor:pointer;color:var(--ink,#111);font:600 12.5px var(--cc-mono);font-variant-numeric:tabular-nums;line-height:1.15;transition:transform .08s}
  .cc-grid .c small{display:block;font:500 10.5px var(--cc-mono);opacity:.75;margin-top:2px}
  .cc-grid .c:hover{transform:translateY(-1px);box-shadow:0 4px 12px -6px rgba(0,0,0,.35)}
  .cc-grid .c.on{outline:2px solid var(--ink,#111);outline-offset:1px}
  .cc-gridnote{font-size:12px;color:var(--cc-muted);margin:10px 0 0;line-height:1.5}
  /* receipts */
  .cc-rh{font:600 10.5px var(--sans,system-ui);letter-spacing:.12em;text-transform:uppercase;color:var(--cc-muted);margin:0 0 6px}
  .cc-rcpt{font-size:13px}
  .cc-rcpt .r{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px dashed var(--cc-line)}
  .cc-rcpt .r span{color:var(--cc-muted)}
  .cc-rcpt .r b{font:600 13.5px var(--cc-mono);font-variant-numeric:tabular-nums;white-space:nowrap}
  .cc-rcpt .r.t{border-bottom:0;border-top:2px solid var(--ink,#111);margin-top:2px}
  .cc-rcpt .r.t span{color:var(--ink,#111);font-weight:600}
  .cc-rcpt b.good{color:var(--cc-good)}.cc-rcpt b.bad{color:var(--cc-bad)}
  /* delta row on compare cards */
  .cc-sc .r.dl{border-top:0;padding-top:0;font-size:11.5px}
  .cc-sc .r.dl b{font-size:12px}
  /* formula note */
  .cc-foot{font-size:12.5px;color:var(--cc-muted);line-height:1.6}
  .cc-foot summary{cursor:pointer;font:600 13px var(--sans,system-ui);color:var(--ink,#111);list-style:none;display:flex;align-items:center;gap:8px}
  .cc-foot summary::-webkit-details-marker{display:none}
  .cc-foot summary::before{content:"+";display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;border:1px solid var(--cc-line);font:600 13px var(--cc-mono);color:var(--cc-muted)}
  .cc-foot[open] summary::before{content:"\\2013"}
  .cc-foot p{margin:10px 0 0}
  .cc-foot code{font:12px var(--cc-mono);background:var(--cc-wash);padding:1px 5px;border-radius:4px;color:var(--ink,#111)}
  @media (max-width:980px){.cc-two{grid-template-columns:1fr}.cc-hero .big .n{font-size:42px}.cc-words{grid-template-columns:1fr}}
  @media (prefers-reduced-motion:reduce){.cc-sc,.cc-dol .bar i{transition:none}}
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
let TIP = null;
function tipShow(html, x, y) {
  if (!TIP) { TIP = document.createElement('div'); TIP.className = 'cc-tip'; document.body.appendChild(TIP); }
  TIP.innerHTML = html; TIP.style.display = 'block';
  const w = TIP.offsetWidth, h = TIP.offsetHeight; let left = x + 16, top = y - h - 12;
  if (left + w > innerWidth - 10) left = x - w - 16; if (top < 10) top = y + 16;
  TIP.style.left = left + 'px'; TIP.style.top = top + 'px';
}
function tipHide() { if (TIP) TIP.style.display = 'none'; }
function tipHtml(spec) {
  const parts = String(spec).split('|'); let h = `<div class="h">${esc(parts[0])}</div>`;
  for (let i = 1; i + 1 < parts.length; i += 2) h += `<div class="r"><span>${esc(parts[i])}</span><b>${esc(parts[i + 1])}</b></div>`;
  return h;
}
function wireTips(root) {
  root.querySelectorAll('[data-tip]').forEach(el => {
    el.addEventListener('mousemove', e => tipShow(tipHtml(el.dataset.tip), e.clientX, e.clientY));
    el.addEventListener('mouseleave', tipHide);
  });
}

/* ---------- the lead math (unchanged) ---------- */
function leadMath(c, target) {
  const spend = +c.spend || 0, cpl = +c.cpl || 0, cvr = (+c.cvr || 0) / 100, aov = +c.aov || 0, margin = (+c.margin || 0) / 100;
  const leads = cpl > 0 ? spend / cpl : 0, buyers = leads * cvr, revenue = buyers * aov;
  const roas = spend > 0 ? revenue / spend : 0, contrib = revenue * margin, profit = contrib - spend;
  return { leads, buyers, revenue, roas, contrib, profit, cpb: buyers > 0 ? spend / buyers : null, beCpl: cvr * aov * margin, tgtCpl: target > 0 ? cvr * aov / target : null, beRoas: margin > 0 ? 1 / margin : null, cvr, aov, margin, spend, cpl, cost: revenue - contrib };
}
const zoneOf = m => !(m.cpl > 0) ? 'warn' : m.tgtCpl && m.cpl <= m.tgtCpl ? 'good' : m.cpl <= m.beCpl ? 'warn' : 'bad';
const ZONE_WORD = { good: 'In the zone', warn: 'Makes money, misses target', bad: 'Loses money' };
function defaultCols() {
  const aov = Math.round(S.pre?.new_aov || 150), margin = Math.round((S.pre?.margin ?? 0.55) * 100);
  return [{ name: 'Base', spend: 20000, cpl: 3, cvr: 10, aov, margin }, { name: 'Cheaper leads', spend: 20000, cpl: 2, cvr: 10, aov, margin }, { name: 'Pricier leads', spend: 20000, cpl: 5, cvr: 10, aov, margin }];
}
function leadReading(c, m) {
  if (!(m.spend > 0 && m.cpl > 0)) return 'Give the scenario a spend and a cost per lead.';
  const z = zoneOf(m);
  const head = `${k(m.spend)} at ${money2(m.cpl)} a lead buys ${num(m.leads)} leads. If ${pct(m.cvr * 100)} of them buy at ${money(m.aov)}, that is ${num(m.buyers)} orders and ${k(m.revenue)} back, ${x2(m.roas)} on the lead spend.`;
  const tail = z === 'good' ? ` Above the ${x2(S.target)} target with ${k(m.profit)} left after the lead spend.`
    : z === 'warn' ? ` Still ${k(m.profit)} ahead after margin, but under the ${x2(S.target)} target: that needs leads at ${money2(m.tgtCpl)} or less.`
    : ` That is ${k(-m.profit)} short after margin. Leads have to come in under ${money2(m.beCpl)} to break even and under ${money2(m.tgtCpl)} to hit ${x2(S.target)}.`;
  return head + tail;
}

/* ---------- visuals ---------- */
/* One strip: where a lead pays. Green up to the target CPL, amber up to breakeven, red past it.
   Every scenario is a marker; the one being read is blue. */
function zoneStrip(ms) {
  const f = ms[S.focus];
  const xmax = Math.max(6, Math.ceil(Math.max(f.beCpl || 0, ...ms.map(m => m.cpl)) * 1.25));
  const X = v => clamp(v / xmax * 100, 0, 100);
  const g = X(f.tgtCpl || 0), a = X(f.beCpl || 0);
  const ticks = []; const step = xmax > 16 ? 4 : xmax > 8 ? 2 : 1; for (let v = 0; v <= xmax; v += step) ticks.push(v);
  const marks = ms.map((m, i) => { const x = X(m.cpl); const lo = ms.some((o, j) => j < i && Math.abs(X(o.cpl) - x) < 9); return `<div class="mk ${i === S.focus ? 'on' : ''} ${lo ? 'lo' : ''}" style="left:${x}%" title="${esc(S.cols[i].name)}: ${money2(m.cpl)} a lead"><i></i><b>${esc(S.cols[i].name)} ${money2(m.cpl)}</b></div>`; }).join('');
  return `<div class="cc-zone">
    <div class="zl" style="left:${g / 2}%;color:var(--cc-good)">hits ${x2(S.target)}</div>
    ${a - g > 12 ? `<div class="zl" style="left:${(g + a) / 2}%;color:var(--cc-warn)">profit, under target</div>` : ''}
    ${100 - a > 12 ? `<div class="zl" style="left:${(a + 100) / 2}%;color:var(--cc-bad)">loses money</div>` : ''}
    <div class="trk"><i class="g" style="width:${g}%"></i><i class="a" style="width:${Math.max(0, a - g)}%"></i><i class="r" style="width:${Math.max(0, 100 - a)}%"></i></div>
    ${ticks.map(v => `<span class="tk" style="left:${X(v)}%">$${v}</span>`).join('')}
    ${marks}
  </div>`;
}
/* ROAS on the lead spend against cost per lead. Hover anywhere for the numbers at that CPL. */
function leadCurve(f) {
  const W = 760, H = 270, L = 48, R = 112, T = 16, B = 34;
  const xmax = Math.max(8, Math.ceil((f.cpl || 3) * 2));
  const curves = [f.cvr / 2, f.cvr, f.cvr * 2].map(cv => cpl => cv * f.aov / cpl);
  const ymax = Math.min(16, Math.max(4, Math.ceil(Math.max(f.roas * 1.8, S.target * 1.5, (f.beRoas || 0) * 1.2))));
  const X = cpl => L + cpl / xmax * (W - L - R), Y = v => T + (1 - clamp(v, 0, ymax) / ymax) * (H - T - B);
  const path = fn => { let d = ''; for (let i = 0; i <= 140; i++) { const cpl = 0.3 + (xmax - 0.3) * i / 140; d += (i ? 'L' : 'M') + X(cpl).toFixed(1) + ',' + Y(fn(cpl)).toFixed(1); } return d; };
  const area = (() => { let d = `M${X(0.3).toFixed(1)},${Y(0).toFixed(1)}`; for (let i = 0; i <= 140; i++) { const cpl = 0.3 + (xmax - 0.3) * i / 140; d += 'L' + X(cpl).toFixed(1) + ',' + Y(curves[1](cpl)).toFixed(1); } return d + `L${X(xmax).toFixed(1)},${Y(0).toFixed(1)}Z`; })();
  const xt = []; const xs = xmax > 12 ? 2 : 1; for (let v = xs; v <= xmax; v += xs) xt.push(v);
  const yt = []; const ys = ymax > 10 ? 2 : 1; for (let v = ys; v <= ymax; v += ys) yt.push(v);
  const tagR = (y, text, cls) => `<rect class="tagbox" x="${W - R + 8}" y="${(y - 9).toFixed(1)}" width="${R - 16}" height="18" rx="5"/><text class="tag" x="${W - R + 14}" y="${(y + 3.5).toFixed(1)}" style="fill:${cls}">${text}</text>`;
  const cx = X(clamp(f.cpl || 0, 0.3, xmax)), cy = Y(f.roas);
  return `<svg class="cc-chart" id="ccCurve" viewBox="0 0 ${W} ${H}" data-xmax="${xmax}" data-ymax="${ymax}" data-l="${L}" data-r="${R}" data-t="${T}" data-b="${B}" data-w="${W}" data-h="${H}" role="img" aria-label="ROAS on the lead spend by cost per lead">
    <defs><linearGradient id="ccGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--cc-acc)" stop-opacity=".22"/><stop offset="1" stop-color="var(--cc-acc)" stop-opacity="0"/></linearGradient></defs>
    ${f.tgtCpl ? `<rect class="band" x="${L}" y="${T}" width="${(X(Math.min(f.tgtCpl, xmax)) - L).toFixed(1)}" height="${H - T - B}"/>` : ''}
    ${yt.map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${v}x</text>`).join('')}
    ${xt.map(v => `<text x="${X(v)}" y="${H - 10}" text-anchor="middle">$${v}</text>`).join('')}
    <line class="ax" x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}"/>
    <path class="area" d="${area}"/>
    ${f.beRoas && f.beRoas <= ymax ? `<line class="be" x1="${L}" x2="${W - R}" y1="${Y(f.beRoas)}" y2="${Y(f.beRoas)}"/>${tagR(Y(f.beRoas), `breakeven ${x2(f.beRoas)}`, 'var(--cc-bad)')}` : ''}
    <line class="tgt" x1="${L}" x2="${W - R}" y1="${Y(S.target)}" y2="${Y(S.target)}"/>${tagR(Y(S.target), `target ${x2(S.target)}`, 'var(--cc-good)')}
    <path class="l0" d="${path(curves[0])}"/><path class="l2" d="${path(curves[2])}"/><path class="l1" d="${path(curves[1])}"/>
    <g id="ccXh" style="display:none"><line class="xh" y1="${T}" y2="${H - B}"/><circle class="dot" r="4.5"/></g>
    <circle class="dot halo" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="11"/><circle class="dot" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5.5"/>
    <text x="${(W - R) / 2 + L / 2}" y="${H - 24}" text-anchor="middle" style="font-size:10px;letter-spacing:.1em">COST PER LEAD</text>
  </svg>`;
}
function wireLeadCurve(f) {
  const svg = $('#ccCurve'); if (!svg) return;
  const d = svg.dataset, W = +d.w, L = +d.l, R = +d.r, xmax = +d.xmax, ymax = +d.ymax, T = +d.t, B = +d.b, H = +d.h;
  const xh = svg.querySelector('#ccXh'), ln = xh.querySelector('line'), ct = xh.querySelector('circle');
  const move = e => {
    const r = svg.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width * W;
    const cpl = clamp((px - L) / (W - L - R) * xmax, 0.3, xmax);
    const roas = f.cvr * f.aov / cpl, leads = f.spend / cpl, buyers = leads * f.cvr, rev = buyers * f.aov, profit = rev * f.margin - f.spend;
    const x = L + cpl / xmax * (W - L - R), y = T + (1 - clamp(roas, 0, ymax) / ymax) * (H - T - B);
    xh.style.display = ''; ln.setAttribute('x1', x); ln.setAttribute('x2', x); ct.setAttribute('cx', x); ct.setAttribute('cy', y);
    tipShow(`<div class="h">At ${money2(cpl)} a lead</div><div class="r"><span>ROAS on lead spend</span><b>${x2(roas)}</b></div><div class="r"><span>Leads for ${k(f.spend)}</span><b>${num(leads)}</b></div><div class="r"><span>Orders</span><b>${num(buyers)}</b></div><div class="r"><span>Revenue back</span><b>${k(rev)}</b></div><div class="r"><span>Left after lead spend</span><b style="color:${profit >= 0 ? '#8FD8A8' : '#F2A197'}">${k(profit)}</b></div>`, e.clientX, e.clientY);
  };
  svg.addEventListener('mousemove', move); svg.addEventListener('mouseleave', () => { xh.style.display = 'none'; tipHide(); });
  svg.addEventListener('touchstart', e => move(e.touches[0]), { passive: true }); svg.addEventListener('touchmove', e => move(e.touches[0]), { passive: true });
}
/* What has to be true: cost per lead across, share who buy down, ROAS in the cell, what is left
   under it. Click a cell and the dials move there. */
function leadGrid(c) {
  const base = +c.cpl || 3, cv = +c.cvr || 10;
  const cpls = [...new Set([0.5, 0.67, 0.83, 1, 1.25, 1.5, 2].map(x => Math.max(0.25, Math.round(base * x * 4) / 4)))];
  const cvrs = [...new Set([0.5, 0.75, 1, 1.5, 2].map(x => Math.max(1, Math.round(cv * x))))];
  const cells = cvrs.map(v => cpls.map(p => ({ p, v, m: leadMath({ ...c, cpl: p, cvr: v }, S.target) })));
  const mx = Math.max(1, ...cells.flat().map(x => Math.abs(x.m.profit)));
  const bg = m => `color-mix(in srgb,${m.profit >= 0 ? 'var(--cc-good)' : 'var(--cc-bad)'} ${Math.round(14 + 56 * Math.min(1, Math.abs(m.profit) / mx))}%,var(--cc-surface))`;
  return `<div class="cc-grid" style="grid-template-columns:auto repeat(${cpls.length},minmax(0,1fr))">
    <div class="h rh">CVR \u2193 CPL \u2192</div>${cpls.map(p => `<div class="h">${money2(p)}</div>`).join('')}
    ${cells.map(row => `<div class="h rh">${row[0].v}%</div>` + row.map(x => `<div class="c ${Math.abs(x.p - c.cpl) < 0.13 && x.v === Math.round(c.cvr) ? 'on' : ''}" style="background:${bg(x.m)}" data-gp="${x.p}" data-gv="${x.v}" data-tip="${esc(`${money2(x.p)} a lead, ${x.v}% buy|ROAS on lead spend|${x2(x.m.roas)}|Leads|${num(x.m.leads)}|Orders|${num(x.m.buyers)}|Revenue back|${k(x.m.revenue)}|Left after lead spend|${k(x.m.profit)}`)}">${x2(x.m.roas)}<small>${k(x.m.profit)}</small></div>`).join('')).join('')}
  </div><p class="cc-gridnote">Green makes money, red loses it; the darker the cell the more. The outlined cell is the scenario in the dials. Click any cell to move the dials there.</p>`;
}
/* The receipt: one lead, and one order won. */
function leadReceipt(f) {
  const cvr = f.cvr || 0, rev = cvr * f.aov, cost = rev * (1 - f.margin), left = rev * f.margin - f.cpl;
  const perOrder = cvr > 0 ? f.cpl / cvr : null, leftOrder = perOrder == null ? null : f.aov * f.margin - perOrder;
  return `<div class="cc-two"><div><div class="cc-rh">One lead</div><div class="cc-rcpt">
      <div class="r"><span>The lead</span><b>-${money2(f.cpl)}</b></div>
      <div class="r"><span>${pct(cvr * 100)} CVR on a ${money(f.aov)} order</span><b>+${money2(rev)}</b></div>
      <div class="r"><span>Product, shipping, fees on that</span><b>-${money2(cost)}</b></div>
      <div class="r t"><span>Left per lead</span><b class="${left >= 0 ? 'good' : 'bad'}">${money2(left)}</b></div></div></div>
    <div><div class="cc-rh">One order won</div><div class="cc-rcpt">
      <div class="r"><span>The ${cvr > 0 ? num(1 / cvr) : '-'} leads it took at ${money2(f.cpl)}</span><b>-${money2(perOrder)}</b></div>
      <div class="r"><span>The order</span><b>+${money(f.aov)}</b></div>
      <div class="r"><span>Product, shipping, fees</span><b>-${money2(f.aov * (1 - f.margin))}</b></div>
      <div class="r t"><span>Left per order</span><b class="${(leftOrder || 0) >= 0 ? 'good' : 'bad'}">${money2(leftOrder)}</b></div></div></div></div>`;
}
/* Where every dollar of revenue goes: product and shipping, the lead spend, what is left. */
function dollarBar(parts, total) {
  const live = parts.filter(p => p.v > 0);
  const sum = live.reduce((a, p) => a + p.v, 0) || 1;
  return `<div class="cc-dol"><div class="bar">${live.map(p => `<i style="width:${(p.v / sum * 100).toFixed(2)}%;background:${p.c}" title="${esc(p.l)}: ${money(p.v)}"></i>`).join('')}</div>
    <div class="lg">${parts.map(p => `<div><i style="background:${p.c}"></i><span>${esc(p.l)}<b class="${p.cls || ''}">${money(p.v)}${total ? ` <span style="font:12px var(--cc-mono);color:var(--cc-muted)">${Math.round(p.v / total * 100)}%</span>` : ''}</b></span></div>`).join('')}</div></div>`;
}

/* ---------- the ROAS model (the public calculator, same math) ---------- */
function defaultRoas() {
  return { aov: Math.round(S.pre?.new_aov || 100), margin: Math.round((S.pre?.margin ?? 0.6) * 100), mode: 'roas', spend: 10000, roas: 2.5, orders: 100, revenue: 25000,
    proc_on: 1, proc_pct: 2.9, proc_fixed: 0.3, ful_on: 1, ful: 8, fixed_on: 0, fixed: 5000, share_on: 0, share_pct: 15, fee_on: 0, fee_pct: 12, fee_applies: 100 };
}
function roasMath(r) {
  const aov = +r.aov || 0, mf = (+r.margin || 0) / 100;
  const procPct = r.proc_on ? (+r.proc_pct || 0) / 100 : 0, procFixed = r.proc_on ? (+r.proc_fixed || 0) : 0;
  const ful = r.ful_on ? (+r.ful || 0) : 0, shareF = r.share_on ? (+r.share_pct || 0) / 100 : 0, feeF = r.fee_on ? (+r.fee_pct || 0) / 100 * (clamp(r.fee_applies == null ? 100 : +r.fee_applies, 0, 100) / 100) : 0;
  let revenue, orders, spend;
  if (r.mode === 'orders') { spend = +r.spend || 0; orders = +r.orders || 0; revenue = orders * aov; }
  else if (r.mode === 'revenue') { revenue = +r.revenue || 0; spend = (+r.roas || 0) > 0 ? revenue / +r.roas : 0; orders = aov > 0 ? revenue / aov : 0; }
  else { spend = +r.spend || 0; revenue = spend * (+r.roas || 0); orders = aov > 0 ? revenue / aov : 0; }
  const roas = spend > 0 ? revenue / spend : 0, cpa = orders > 0 ? spend / orders : 0;
  const cogs = orders * aov * (1 - mf), proc = orders * (aov * procPct + procFixed), fulT = orders * ful, share = revenue * shareF, fee = spend * feeF, fixed = r.fixed_on ? (+r.fixed || 0) : 0;
  const gross = revenue - cogs, contrib = gross - proc - fulT - spend - share - fee, net = contrib - fixed;
  const effM = aov > 0 ? mf - procPct - (procFixed + ful) / aov - shareF : 0, impossible = effM <= 0;
  const beRoas = impossible ? null : (1 + feeF) / effM, beRoasFull = impossible || spend <= 0 ? null : (1 + feeF + fixed / spend) / effM;
  const avail = aov * mf - (aov * procPct + procFixed) - ful - aov * shareF, beCpa = avail > 0 ? avail / (1 + feeF) : 0;
  return { revenue, orders, spend, roas, cpa, cogs, proc, ful: fulT, share, fee, fixed, gross, contrib, net, beRoas, beRoasFull, beCpa, impossible, perOrder: orders > 0 ? net / orders : 0, netPct: revenue > 0 ? net / revenue * 100 : 0, effM };
}
/* ROAS across, gross margin down, what you keep in the cell. Click to move the dials. */
function roasGrid(r, m) {
  const mg = Math.round(+r.margin || 60);
  const margins = [...new Set([mg - 15, mg - 10, mg - 5, mg, mg + 5].map(v => clamp(v, 5, 95)))];
  const roases = [1.5, 2, 2.5, 3, 3.5, 4, 5];
  const keep = (R, M) => { const t = roasMath({ ...r, mode: 'roas', roas: R, margin: M, spend: m.spend || +r.spend || 0 }); return { t, p: r.fixed_on ? t.net : t.contrib }; };
  const cells = margins.map(M => roases.map(R => ({ R, M, ...keep(R, M) })));
  const mx = Math.max(1, ...cells.flat().map(x => Math.abs(x.p)));
  const bg = p => `color-mix(in srgb,${p >= 0 ? 'var(--cc-good)' : 'var(--cc-bad)'} ${Math.round(14 + 56 * Math.min(1, Math.abs(p) / mx))}%,var(--cc-surface))`;
  return `<div class="cc-grid" style="grid-template-columns:auto repeat(${roases.length},minmax(0,1fr))">
    <div class="h rh">margin \u2193 roas \u2192</div>${roases.map(R => `<div class="h">${R}x</div>`).join('')}
    ${cells.map(row => `<div class="h rh">${row[0].M}%</div>` + row.map(x => `<div class="c ${Math.abs(x.R - m.roas) < 0.26 && x.M === mg ? 'on' : ''}" style="background:${bg(x.p)}" data-gr="${x.R}" data-gm="${x.M}" data-tip="${esc(`${x.R}x at ${x.M}% margin, ${k(m.spend)} spend|Revenue|${k(x.t.revenue)}|Orders|${num(x.t.orders)}|Cost per order|${money2(x.t.cpa)}|${r.fixed_on ? 'Net profit' : 'Contribution after ads'}|${k(x.p)}`)}">${k(x.p)}<small>${money2(x.t.cpa)}/order</small></div>`).join('')).join('')}
  </div><p class="cc-gridnote">Same spend in every cell. The outlined cell is the ROAS and margin in the dials. Click a cell to move the dials there.</p>`;
}
/* The per-order receipt from the public calculator. */
function roasReceipt(r, m) {
  const o = m.orders || 0, per = v => o > 0 ? v / o : 0, aov = +r.aov || 0;
  const rows = [
    ['The order', aov, '+'], ['Product cost', per(m.cogs), '-'],
    ...(r.proc_on ? [['Payment processing', per(m.proc), '-']] : []), ...(r.ful_on ? [['Pick, pack and ship', per(m.ful), '-']] : []),
    ['Ads to win it', m.cpa, '-'], ...(r.fee_on ? [['Agency fee', per(m.fee), '-']] : []), ...(r.share_on ? [['Revenue share', per(m.share), '-']] : []),
    ...(r.fixed_on ? [['Share of fixed costs', per(m.fixed), '-']] : []),
  ];
  const left = r.fixed_on ? per(m.net) : per(m.contrib);
  return `<div class="cc-rh">One order</div><div class="cc-rcpt">${rows.map(([l, v, sg]) => `<div class="r"><span>${l}</span><b>${sg}${money2(v)}</b></div>`).join('')}<div class="r t"><span>${r.fixed_on ? 'Net per order' : 'Left per order after ads'}</span><b class="${left >= 0 ? 'good' : 'bad'}">${money2(left)}</b></div></div>`;
}
function roasCurve(r, m) {
  const W = 760, H = 250, L = 64, R = 112, T = 16, B = 34;
  const xs = []; for (let v = 0.5; v <= 6.0001; v += 0.05) xs.push(+v.toFixed(2));
  const prof = v => { const t = roasMath({ ...r, mode: 'roas', roas: v, spend: m.spend || +r.spend || 0 }); return r.fixed_on ? t.net : t.contrib; };
  const vals = xs.map(prof); const lo = Math.min(...vals, 0), hi = Math.max(...vals, 1);
  const X = v => L + (v - 0.5) / 5.5 * (W - L - R), Y = p => T + (1 - (p - lo) / (hi - lo || 1)) * (H - T - B);
  const d = xs.map((v, i) => (i ? 'L' : 'M') + X(v).toFixed(1) + ',' + Y(vals[i]).toFixed(1)).join('');
  const area = `M${X(0.5).toFixed(1)},${Y(0).toFixed(1)}` + xs.map((v, i) => 'L' + X(v).toFixed(1) + ',' + Y(Math.max(vals[i], 0)).toFixed(1)).join('') + `L${X(6).toFixed(1)},${Y(0).toFixed(1)}Z`;
  const be = r.fixed_on ? m.beRoasFull : m.beRoas, cur = clamp(m.roas, 0.5, 6);
  const tagR = (y, text, cls) => `<rect class="tagbox" x="${W - R + 8}" y="${(y - 9).toFixed(1)}" width="${R - 16}" height="18" rx="5"/><text class="tag" x="${W - R + 14}" y="${(y + 3.5).toFixed(1)}" style="fill:${cls}">${text}</text>`;
  return `<svg class="cc-chart" id="ccRoasCurve" viewBox="0 0 ${W} ${H}" data-lo="${lo}" data-hi="${hi}" data-l="${L}" data-r="${R}" data-t="${T}" data-b="${B}" data-w="${W}" data-h="${H}" role="img" aria-label="Profit at every ROAS, same spend">
    <defs><linearGradient id="ccGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--cc-acc)" stop-opacity=".22"/><stop offset="1" stop-color="var(--cc-acc)" stop-opacity="0"/></linearGradient></defs>
    ${[lo, 0, hi].filter((v, i, a) => a.indexOf(v) === i).map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${ka(v)}</text>`).join('')}
    ${[1, 2, 3, 4, 5, 6].map(v => `<text x="${X(v)}" y="${H - 10}" text-anchor="middle">${v}x</text>`).join('')}
    <line class="ax" x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}"/>
    <path class="area" d="${area}"/>
    ${be && be >= 0.5 && be <= 6 ? `<line class="be" x1="${X(be)}" x2="${X(be)}" y1="${T}" y2="${H - B}"/><rect class="tagbox" x="${(X(be) + 6).toFixed(1)}" y="${T}" width="96" height="18" rx="5"/><text class="tag" x="${(X(be) + 12).toFixed(1)}" y="${T + 12.5}" style="fill:var(--cc-bad)">breakeven ${x2(be)}</text>` : ''}
    <path class="l1" d="${d}"/>
    <g id="ccXh2" style="display:none"><line class="xh" y1="${T}" y2="${H - B}"/><circle class="dot" r="4.5"/></g>
    <circle class="dot halo" cx="${X(cur).toFixed(1)}" cy="${Y(prof(cur)).toFixed(1)}" r="11"/><circle class="dot" cx="${X(cur).toFixed(1)}" cy="${Y(prof(cur)).toFixed(1)}" r="5.5"/>
    <text x="${(W - R) / 2 + L / 2}" y="${H - 24}" text-anchor="middle" style="font-size:10px;letter-spacing:.1em">ROAS AT ${k(m.spend).toUpperCase()} OF SPEND</text>
  </svg>`;
}
function wireRoasCurve(r, m) {
  const svg = $('#ccRoasCurve'); if (!svg) return;
  const d = svg.dataset, W = +d.w, L = +d.l, R = +d.r, lo = +d.lo, hi = +d.hi, T = +d.t, B = +d.b, H = +d.h;
  const xh = svg.querySelector('#ccXh2'), ln = xh.querySelector('line'), ct = xh.querySelector('circle');
  const move = e => {
    const rc = svg.getBoundingClientRect(); const px = (e.clientX - rc.left) / rc.width * W;
    const v = clamp(0.5 + (px - L) / (W - L - R) * 5.5, 0.5, 6);
    const t = roasMath({ ...r, mode: 'roas', roas: v, spend: m.spend || +r.spend || 0 }); const p = r.fixed_on ? t.net : t.contrib;
    const x = L + (v - 0.5) / 5.5 * (W - L - R), y = T + (1 - (p - lo) / (hi - lo || 1)) * (H - T - B);
    xh.style.display = ''; ln.setAttribute('x1', x); ln.setAttribute('x2', x); ct.setAttribute('cx', x); ct.setAttribute('cy', y);
    tipShow(`<div class="h">At ${x2(v)}</div><div class="r"><span>Revenue</span><b>${k(t.revenue)}</b></div><div class="r"><span>Orders</span><b>${num(t.orders)}</b></div><div class="r"><span>Cost per order</span><b>${money2(t.cpa)}</b></div><div class="r"><span>${r.fixed_on ? 'Net profit' : 'Contribution after ads'}</span><b style="color:${p >= 0 ? '#8FD8A8' : '#F2A197'}">${k(p)}</b></div>`, e.clientX, e.clientY);
  };
  svg.addEventListener('mousemove', move); svg.addEventListener('mouseleave', () => { xh.style.display = 'none'; tipHide(); });
  svg.addEventListener('touchstart', e => move(e.touches[0]), { passive: true }); svg.addEventListener('touchmove', e => move(e.touches[0]), { passive: true });
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
async function loadSaved() { try { S.saved = (await api(`/api/scenario?act=${encodeURIComponent(S.act)}`)).scenarios || []; } catch { S.saved = []; } }

/* ---------- shared pieces ---------- */
function crumb() { return !S.ro && typeof window.crumbFor === 'function' ? `<div class="ph-crumb">${window.crumbFor('calc')}</div>` : ''; }
function title() {
  if (S.ro) return `<h2>${esc(S.shared?.name || 'Scenario')}</h2><p class="sub">${esc(brand()?.name || '')} · a ${S.kind === 'leads' ? 'lead-gen' : 'ROAS'} scenario from Locus, shared by Mobius Digital${S.shared?.updated_at ? ' · ' + esc(String(S.shared.updated_at).slice(0, 10)) : ''}</p>`;
  return `<h2>Scenarios</h2><p class="sub">Dial the numbers. See what comes back.</p>`;
}
function assumeCard(items) { return `<div class="card"><div class="cc-h3"><h3>What this assumes</h3><span class="tiny">the numbers behind the page</span></div><div class="cc-assume">${items.map(([l, v]) => `<div><div class="l">${l}</div><div class="v">${v}</div></div>`).join('')}</div></div>`; }
function seg() { if (S.ro) return ''; return `<div class="cc-seg" role="tablist"><button data-kind="leads" class="${S.kind === 'leads' ? 'on' : ''}">Leads</button><button data-kind="roas" class="${S.kind === 'roas' ? 'on' : ''}">ROAS</button></div>`; }
function preLine() {
  if (S.ro) return '';
  if (S.act === 'all') return `<p class="hint" style="margin:0 0 12px">Pick a brand up top and the dials start from its real last 90 days. Scenarios save to that brand.</p>`;
  if (S.preErr) return `<p class="hint" style="margin:0 0 12px">Could not read the brand's numbers (${esc(S.preErr)}); the dials start from defaults.</p>`;
  if (!S.pre) return '';
  const p = S.pre;
  return `<p class="hint" style="margin:0 0 12px">${esc(brand()?.name || '')}, last 90 days: new-customer order <b class="mono">${money(p.new_aov)}</b>, margin before ads <b class="mono">${p.margin != null ? pct(p.margin * 100) : '-'}</b>, cost per new customer <b class="mono">${money(p.cac)}</b>, goal ROAS <b class="mono">${x2(S.target)}</b>. <button class="cc-link" id="ccUsePre">Put these in the dials</button>${p.cm_ok === false ? ' <span style="color:var(--bad)">Cost data is flagged on the Costs page; type the real margin.</span>' : ''}</p>`;
}
const fmtIn = v => !fin(+v) ? '' : (+v).toLocaleString('en-US', { maximumFractionDigits: 2 });
const parseIn = str => parseFloat(String(str).replace(/[^0-9.\-]/g, ''));
const pOf = (v, min, max) => ((clamp(+v || 0, +min, +max) - min) / ((max - min) || 1) * 100).toFixed(2) + '%';
const setP = rg => rg.style.setProperty('--p', pOf(rg.value, +rg.min, +rg.max));
function dial(label, key, val, { min, max, step, unit, pre, sub }) {
  return `<div class="cc-d"><label>${label}</label><div class="in">${pre ? `<span>${pre}</span>` : ''}<input type="text" inputmode="decimal" class="num" data-k="${key}" value="${fmtIn(val)}">${unit ? `<span>${unit}</span>` : ''}</div><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${clamp(+val || 0, min, max)}" style="--p:${pOf(val, min, max)}">${sub ? `<small>${sub}</small>` : ''}</div>`;
}
function wordsCard() {
  if (S.ro) return '';
  const ex = S.kind === 'leads'
    ? ['Spend $20k at $2, $3 and $4 a lead, 10% buy', 'Only 5% buy at $3 a lead and the order is $150', 'I want $80k back from the list at 4x, what can a lead cost']
    : ['$30k in November at 3x with a $140 order and 60% margin', 'What ROAS clears $10k a month of fixed costs on $25k of spend', '400 orders at $99 with $8 shipping and 2.9% fees on $15k of ads'];
  return `<div class="card"><div class="cc-h3"><h3>Say it in words</h3><span class="tiny">becomes numbers in the dials; nothing saves until you press Save</span></div>
    <div class="cc-words"><div><textarea id="ccWords" placeholder="${esc(ex[0])}"></textarea><div class="ex">Try: ${ex.map(e => `<button class="cc-link" data-ex="${esc(e)}">${esc(e)}</button>`).join(' · ')}</div></div><button class="btn primary" id="ccBuild">Build it</button></div>
    <p class="tiny" id="ccReading" style="margin:8px 0 0"></p></div>`;
}
function savedCard() {
  if (S.ro) return '';
  const list = S.saved.filter(s => s.kind === S.kind);
  if (!list.length) return '';
  return `<div class="card"><div class="cc-h3"><h3>Saved for ${esc(brand()?.name || 'all brands')}</h3><span class="tiny">Load puts it in the dials · Share link makes a read-only page for the client, no sign-in</span></div><div class="cc-saved">${list.map(s => `<div class="sv"><b>${esc(s.name)}</b><span class="m">${S.kind === 'leads' ? `${money2(s.inputs.cpl)}/lead · ${esc(String(s.inputs.cvr))}% · ${k(s.inputs.spend)}` : `${k(s.inputs.spend)} at ${x2(+s.inputs.roas)}`}</span><button class="cc-link" data-load="${esc(s.id)}">Load</button><button class="cc-link" data-share="${esc(s.id)}">Share link</button><button class="cc-link bad" data-del="${esc(s.id)}">Delete</button></div>`).join('')}</div></div>`;
}

function footNote() {
  if (S.kind === 'leads') return `<details class="card cc-foot"><summary>How this is calculated</summary>
    <p><code>leads = spend / cost per lead</code>, <code>orders = leads x % who buy</code>, <code>revenue back = orders x average order</code>, <code>ROAS on lead spend = revenue back / spend</code>.</p>
    <p><code>left after lead spend = revenue back x margin - spend</code>. The margin is before ads: product, shipping and fees already out.</p>
    <p><code>pay up to = % who buy x average order / target ROAS</code> is the cost per lead that returns exactly the target. <code>breakeven = % who buy x average order x margin</code> is where a lead stops paying for itself. <code>breakeven ROAS = 1 / margin</code>.</p>
    <p>Prefill is the brand's last 90 days on Triple Whale: new-customer order value and margin before ads from the Customers and Profit pages, goal ROAS from Settings.</p></details>`;
  return `<details class="card cc-foot"><summary>How this is calculated</summary>
    <p><code>revenue = spend x ROAS</code> (or orders x order, or the goal), <code>orders = revenue / average order</code>, <code>cost per order = spend / orders</code>.</p>
    <p><code>contribution after ads = revenue - product cost - processing - pick/pack/ship - revenue share - ad spend - agency fee</code>. Net profit also takes the fixed costs off.</p>
    <p><code>breakeven ROAS = (1 + agency fee %) / (margin % - processing % - revenue share % - (fixed per-order costs / average order))</code>. With fixed costs on, the fixed amount is added to the numerator as a share of spend.</p>
    <p><code>cost-per-order ceiling = (margin per order - processing - shipping - revenue share per order) / (1 + agency fee %)</code>: the most an order can cost in ads before it loses money.</p></details>`;
}

/* ---------- LEADS ---------- */
function paintLeads() {
  const main = host();
  if (!S.cols.length) S.cols = defaultCols();
  if (S.focus >= S.cols.length) S.focus = 0;
  const ms = S.cols.map(c => leadMath(c, S.target));
  const c = S.cols[S.focus], f = ms[S.focus], z = zoneOf(f);
  const hero = `<div class="cc-hero">
    <div class="eb"><span>Leads</span><span>·</span><span>${esc(brand()?.name || 'All brands')}</span><span>·</span><span>${esc(c.name)}</span><span class="cc-pill ${z}"><i></i>${ZONE_WORD[z]}</span></div>
    <div class="big"><span class="n">${money2(f.tgtCpl)}</span><span class="u">is the most a lead can cost and still return ${x2(S.target)}. Breakeven is ${money2(f.beCpl)}.</span></div>
    <div class="read">${esc(leadReading(c, f))}</div>
    <div class="cc-stats">
      <div><div class="l">Leads</div><div class="v">${num(f.leads)}</div><div class="s">${k(f.spend)} at ${money2(f.cpl)}</div></div>
      <div><div class="l">Orders</div><div class="v">${num(f.buyers)}</div><div class="s">${pct(f.cvr * 100)} CVR</div></div>
      <div><div class="l">Revenue back</div><div class="v">${k(f.revenue)}</div><div class="s">${num(f.buyers)} x ${money(f.aov)}</div></div>
      <div><div class="l">ROAS on lead spend</div><div class="v ${z}">${x2(f.roas)}</div><div class="s">target ${x2(S.target)}</div></div>
      <div><div class="l">Left after lead spend</div><div class="v ${f.profit >= 0 ? 'good' : 'bad'}">${k(f.profit)}</div><div class="s">${pct(f.margin * 100)} margin, minus ${k(f.spend)}</div></div>
      <div><div class="l">Per order won</div><div class="v">${money2(f.cpb)}</div><div class="s">lead spend / orders</div></div>
    </div></div>`;
  const dials = `<div class="card" id="ccDials"><div class="cc-h3"><h3>Dial in "${esc(c.name)}"</h3><span class="tiny">drag or type; the whole page follows · <button class="cc-link" id="ccReset">reset</button></span></div><div class="cc-dial">
    ${dial('Lead-gen spend', 'spend', c.spend, { min: 1000, max: 100000, step: 500, pre: '$', sub: 'What goes into the giveaway or signup ads over the whole run.' })}
    ${dial('Cost per lead (CPL)', 'cpl', c.cpl, { min: 0.5, max: 15, step: 0.25, pre: '$', sub: 'Giveaway leads usually land at $1 to $4. Dartee is planning on $2 to $3.' })}
    ${dial('Conversion rate (CVR)', 'cvr', c.cvr, { min: 1, max: 50, step: 1, unit: '%', sub: 'The share of leads that place an order in the window you care about (the weekend plus December). Giveaway lists 3 to 10%; a true early-access list up to 40%.' })}
    ${dial('Average order', 'aov', c.aov, { min: 20, max: 600, step: 5, pre: '$', sub: 'Prefilled with the new-customer order value from the last 90 days.' })}
    ${dial('Margin before ads', 'margin', c.margin, { min: 10, max: 95, step: 1, unit: '%', sub: 'After product, shipping and fees, before any ad spend. From the Profit page.' })}
    ${dial('Target ROAS on the lead spend', 'target', S.target, { min: 1, max: 8, step: 0.1, unit: 'x', sub: 'The return you want on the lead budget. Sets the green zone and the pay-up-to number.' })}
  </div></div>`;
  const cards = `<div class="card"><div class="cc-h3"><h3>Compare</h3><span class="tiny">click one to dial it; the dot is its zone</span></div><div class="cc-cards">
    ${S.cols.map((cc, i) => { const m = ms[i], zz = zoneOf(m), d = m.profit - ms[0].profit; return `<div class="cc-sc ${i === S.focus ? 'on' : ''}" data-focus="${i}"><span class="z ${zz}"></span><input class="nm" data-name="${i}" value="${esc(cc.name)}" title="Rename">
      <div class="r"><span>CPL</span><b>${money2(m.cpl)}</b></div><div class="r"><span>CVR</span><b>${pct(m.cvr * 100)}</b></div><div class="r"><span>ROAS</span><b class="${zz === 'good' ? 'good' : zz === 'bad' ? 'bad' : ''}">${x2(m.roas)}</b></div><div class="r"><span>Left</span><b class="${m.profit >= 0 ? 'good' : 'bad'}">${k(m.profit)}</b></div>${i > 0 ? `<div class="r dl"><span>vs ${esc(S.cols[0].name)}</span><b class="${d >= 0 ? 'good' : 'bad'}">${d >= 0 ? '+' : ''}${k(d)}</b></div>` : ''}
      <div class="act"><button class="cc-link" data-save="${i}">Save</button>${S.cols.length > 1 ? `<button class="cc-link bad" data-rm="${i}">Remove</button>` : ''}</div></div>`; }).join('')}
    ${S.cols.length < 8 ? `<div class="cc-sc add" id="ccAddCol">+ copy "${esc(c.name)}"</div>` : ''}
  </div>${S.act !== 'all' ? `<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary cc-mini" id="ccKpi">Set "${esc(c.name)}" as this brand's lead KPI</button></div>` : ''}</div>`;
  const zone = `<div class="card"><div class="cc-h3"><h3>Where a lead pays</h3><span class="tiny">for "${esc(c.name)}": ${pct(f.cvr * 100)} CVR at ${money(f.aov)} on ${pct(f.margin * 100)} margin</span></div>${zoneStrip(ms)}</div>`;
  const curve = `<div class="card"><div class="cc-h3"><h3>ROAS at every CPL</h3><span class="tiny">hover or touch the line for the numbers</span></div>
    <div class="cc-leg"><span><i></i>${pct(f.cvr * 100)} CVR</span><span><i class="d"></i>${pct(f.cvr * 50)} CVR</span><span><i class="t"></i>${pct(f.cvr * 200)} CVR</span><span><i class="tg"></i>target ${x2(S.target)}</span>${f.beRoas ? `<span><i class="be"></i>breakeven ${x2(f.beRoas)}</span>` : ''}</div>
    ${leadCurve(f)}</div>`;
  const dollars = `<div class="card"><div class="cc-h3"><h3>Where every dollar of the ${k(f.revenue)} goes</h3><span class="tiny">"${esc(c.name)}"</span></div>${dollarBar([
    { l: 'Product, shipping, fees', v: f.cost, c: 'color-mix(in srgb,var(--cc-muted) 55%,transparent)' },
    { l: 'The lead spend', v: f.spend, c: 'var(--cc-acc)' },
    { l: f.profit >= 0 ? 'Left over' : 'Short', v: Math.abs(f.profit), c: f.profit >= 0 ? 'var(--cc-good)' : 'var(--cc-bad)', cls: f.profit >= 0 ? 'good' : 'bad' },
  ], f.revenue || 1)}</div>`;
  const grid = `<div class="card"><div class="cc-h3"><h3>What has to be true</h3><span class="tiny">${k(f.spend)} of spend, ${money(f.aov)} orders, ${pct(f.margin * 100)} margin, target ${x2(S.target)}</span></div>${leadGrid(c)}</div>`;
  const rcpt = `<div class="card"><div class="cc-h3"><h3>The receipt</h3><span class="tiny">"${esc(c.name)}", one lead and one order</span></div>${leadReceipt(f)}</div>`;
  const roCard = S.ro ? assumeCard([['Lead-gen spend', k(f.spend)], ['CPL', money2(f.cpl)], ['CVR', pct(f.cvr * 100)], ['Average order', money(f.aov)], ['Margin before ads', pct(f.margin * 100)], ['Target ROAS', x2(S.target)]]) : '';
  main.innerHTML = `<div class="cc">${crumb()}${title()}${seg()}${preLine()}${hero}${S.ro ? roCard : `<div class="cc-two">${dials}${cards}</div>`}${zone}${grid}${curve}<div class="cc-two">${dollars}${rcpt}</div>${wordsCard()}${savedCard()}${footNote()}</div>`;
  wireCommon(); wireTips(main);
  if (S.ro) { main.querySelectorAll('.cc-grid .c').forEach(el => el.style.cursor = 'default'); const gn = main.querySelector('.cc-gridnote'); if (gn) gn.textContent = 'Green makes money, red loses it; the darker the cell the more. The outlined cell is this scenario.'; return; }
  main.querySelectorAll('.cc-d input').forEach(inp => inp.addEventListener('input', () => {
    const v = parseIn(inp.value); if (!isFinite(v)) return;
    if (inp.type === 'range') setP(inp);
    if (inp.dataset.k === 'target') S.target = v; else S.cols[S.focus][inp.dataset.k] = v;
    inPlace(paintLeads, inp);
  }));
  main.querySelectorAll('.cc-grid .c[data-gp]').forEach(el => el.onclick = () => { S.cols[S.focus].cpl = +el.dataset.gp; S.cols[S.focus].cvr = +el.dataset.gv; tipHide(); inPlace(paintLeads); });
  main.querySelectorAll('.cc-sc[data-focus]').forEach(el => el.addEventListener('click', e => { if (e.target.closest('button,input')) return; S.focus = +el.dataset.focus; inPlace(paintLeads); }));
  main.querySelectorAll('.cc-sc input.nm').forEach(inp => inp.addEventListener('change', () => { S.cols[+inp.dataset.name].name = inp.value.trim() || 'Scenario'; inPlace(paintLeads); }));
  main.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { S.cols.splice(+b.dataset.rm, 1); S.focus = 0; inPlace(paintLeads); });
  main.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
    const cc = S.cols[+b.dataset.save];
    const name = await ask('Save this scenario', 'A name the team will recognise next week.', cc.name, 'Save'); if (!name) return;
    try { await put('/api/scenario', { act: S.act, kind: 'leads', name, inputs: { spend: cc.spend, cpl: cc.cpl, cvr: cc.cvr, aov: cc.aov, margin: cc.margin, target: S.target }, note: '' }); cc.name = name; await loadSaved(); inPlace(paintLeads); toast('Saved'); } catch (e) { toast(e.message, true); }
  });
  const add = $('#ccAddCol'); if (add) add.onclick = () => { S.cols.push({ ...c, name: 'Scenario ' + (S.cols.length + 1) }); S.focus = S.cols.length - 1; inPlace(paintLeads); };
  const kp = $('#ccKpi'); if (kp) kp.onclick = async () => {
    try {
      await put('/api/season/answer', { act: S.act, key: 'lead_kpi', value: { name: c.name, cpl_target: +f.tgtCpl.toFixed(2), cpl_breakeven: +f.beCpl.toFixed(2), cvr: c.cvr, aov: c.aov, margin: c.margin, spend: c.spend, leads: Math.round(f.leads), revenue: Math.round(f.revenue), target: S.target, set_at: new Date().toISOString().slice(0, 10) } });
      toast(`Lead KPI set: pay up to ${money2(f.tgtCpl)} a lead`);
    } catch (e) { toast(e.message, true); }
  };
  wireLeadCurve(f);
}

/* ---------- ROAS ---------- */
function paintRoas() {
  const main = host();
  if (!S.roas) S.roas = defaultRoas();
  const r = S.roas, m = roasMath(r);
  const be = r.fixed_on ? m.beRoasFull : m.beRoas, keep = r.fixed_on ? m.net : m.contrib;
  const z = m.impossible ? 'bad' : be && m.roas >= be * 1.15 ? 'good' : be && m.roas >= be ? 'warn' : 'bad';
  const word = m.impossible ? 'No ROAS works' : z === 'good' ? 'Profitable' : z === 'warn' ? 'Near breakeven' : 'Losing money';
  const reading = m.impossible ? 'With these costs there is no ROAS that makes money: product cost, fees and shipping take more than the order is worth. Fix the margin or the shipping before planning spend.'
    : `${k(m.spend)} at ${x2(m.roas)} brings ${k(m.revenue)} and ${num(m.orders)} orders at ${money2(m.cpa)} each. Breakeven is ${x2(be)}, so ${m.roas >= be ? `you are ${((m.roas / be - 1) * 100).toFixed(0)}% above it` : `you are ${((1 - m.roas / be) * 100).toFixed(0)}% under it`}. An order can cost up to ${money2(m.beCpa)} before it loses money.`;
  const hero = `<div class="cc-hero">
    <div class="eb"><span>ROAS</span><span>·</span><span>${esc(brand()?.name || 'All brands')}</span><span class="cc-pill ${z}"><i></i>${word}</span></div>
    <div class="big"><span class="n">${k(keep)}</span><span class="u">${r.fixed_on ? 'net profit after fixed costs' : 'contribution after ads'} at ${x2(m.roas)} on ${k(m.spend)}</span></div>
    <div class="read">${esc(reading)}</div>
    <div class="cc-stats">
      <div><div class="l">Revenue</div><div class="v">${k(m.revenue)}</div><div class="s">${num(m.orders)} orders</div></div>
      <div><div class="l">Ad spend</div><div class="v">${k(m.spend)}</div><div class="s">${x2(m.roas)}</div></div>
      <div><div class="l">Cost per order</div><div class="v">${money2(m.cpa)}</div><div class="s">ceiling ${money2(m.beCpa)}</div></div>
      <div><div class="l">Breakeven ROAS</div><div class="v ${z}">${m.impossible ? 'none' : x2(be)}</div><div class="s">${r.fixed_on ? 'with fixed costs' : 'on contribution'}</div></div>
      <div><div class="l">Margin per order</div><div class="v">${money2(m.perOrder)}</div><div class="s">${pct(m.netPct)} of revenue</div></div>
    </div></div>`;
  const spendOrRev = r.mode === 'revenue' ? dial('Revenue goal', 'revenue', r.revenue, { min: 5000, max: 1000000, step: 1000, pre: '$', sub: 'What you want the month to do. Spend is derived from the ROAS.' }) : dial('Ad spend', 'spend', r.spend, { min: 500, max: 200000, step: 500, pre: '$', sub: 'Meta + Google for the period.' });
  const roasOrOrders = r.mode === 'orders' ? dial('Orders', 'orders', r.orders, { min: 10, max: 5000, step: 10, sub: `Orders you expect that spend to produce. That is ${x2(m.roas)} and ${money2(m.cpa)} an order.` }) : dial('ROAS', 'roas', r.roas, { min: 0.5, max: 8, step: 0.05, unit: 'x', sub: `Blended, Triple Whale revenue over total spend. At ${x2(m.roas)} an order costs ${money2(m.cpa)} in ads; the ceiling is ${money2(m.beCpa)}.` });
  const T = (label, onKey, fields) => `<div class="cc-tg ${r[onKey] ? '' : 'off'}"><input type="checkbox" id="cc_${onKey}" data-rt="${onKey}" ${r[onKey] ? 'checked' : ''}><label for="cc_${onKey}">${label}</label><div class="f">${fields}</div></div>`;
  const dials = `<div class="card" id="ccDials"><div class="cc-h3"><h3>Dial it in <button class="cc-link" id="ccReset" style="margin-left:8px;font-weight:400">reset</button></h3><div class="cc-mode">${[['roas', 'Spend + ROAS'], ['orders', 'Spend + orders'], ['revenue', 'Goal + ROAS']].map(([v, l]) => `<button data-mode="${v}" class="${r.mode === v ? 'on' : ''}">${l}</button>`).join('')}</div></div><div class="cc-dial">
    ${dial('Average order', 'aov', r.aov, { min: 20, max: 600, step: 5, pre: '$', sub: 'Before discounts and refunds. Prefilled from the last 90 days.' })}
    ${dial('Gross margin', 'margin', r.margin, { min: 10, max: 95, step: 1, unit: '%', sub: 'Of the order, after product cost only. Shipping and fees have their own switches below.' })}
    ${spendOrRev}${roasOrOrders}
  </div>
  <div class="cc-togs">
    ${T('Payment processing', 'proc_on', `<input data-r="proc_pct" type="number" step="0.1" value="${r.proc_pct}"><span>% +</span><input data-r="proc_fixed" type="number" step="0.05" value="${r.proc_fixed}"><span>$ an order</span>`)}
    ${T('Pick, pack and ship', 'ful_on', `<input data-r="ful" type="number" step="0.5" value="${r.ful}"><span>$ an order</span>`)}
    ${T('Fixed costs', 'fixed_on', `<input data-r="fixed" type="number" step="100" value="${r.fixed}"><span>$ for the period</span>`)}
    ${T('Revenue share (creators, affiliates)', 'share_on', `<input data-r="share_pct" type="number" step="0.5" value="${r.share_pct}"><span>% of revenue</span>`)}
    ${T('Agency fee on spend', 'fee_on', `<input data-r="fee_pct" type="number" step="0.5" value="${r.fee_pct}"><span>% of</span><input data-r="fee_applies" type="number" step="5" min="0" max="100" value="${r.fee_applies == null ? 100 : r.fee_applies}"><span>% of the spend</span>`)}
  </div>
  <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px"><a class="btn cc-mini" href="/roas-calculator/" target="_blank" rel="noopener">Public calculator</a><button class="btn primary cc-mini" id="ccSaveRoas">Save this scenario</button></div></div>`;
  const parts = [
    { l: 'Product cost', v: m.cogs, c: 'color-mix(in srgb,var(--cc-muted) 55%,transparent)' },
    ...(r.proc_on ? [{ l: 'Payment processing', v: m.proc, c: 'color-mix(in srgb,var(--cc-muted) 35%,transparent)' }] : []),
    ...(r.ful_on ? [{ l: 'Pick, pack and ship', v: m.ful, c: 'color-mix(in srgb,var(--cc-muted) 75%,transparent)' }] : []),
    ...(r.share_on ? [{ l: 'Revenue share', v: m.share, c: 'var(--cc-warn)' }] : []),
    { l: 'Ad spend', v: m.spend, c: 'var(--cc-acc)' },
    ...(r.fee_on ? [{ l: 'Agency fee', v: m.fee, c: 'color-mix(in srgb,var(--cc-acc) 55%,transparent)' }] : []),
    ...(r.fixed_on ? [{ l: 'Fixed costs', v: m.fixed, c: 'color-mix(in srgb,var(--cc-bad) 45%,transparent)' }] : []),
    { l: keep >= 0 ? 'You keep' : 'Short', v: Math.abs(keep), c: keep >= 0 ? 'var(--cc-good)' : 'var(--cc-bad)', cls: keep >= 0 ? 'good' : 'bad' },
  ];
  const dollars = `<div class="card"><div class="cc-h3"><h3>Where every dollar of the ${k(m.revenue)} goes</h3><span class="tiny">each segment is a share of revenue</span></div>${dollarBar(parts, m.revenue || 1)}</div>`;
  const curve = `<div class="card"><div class="cc-h3"><h3>Profit at every ROAS, same spend</h3><span class="tiny">hover the line; the dot is the ROAS in the dials</span></div>
    <div class="cc-leg"><span><i></i>${r.fixed_on ? 'net profit' : 'contribution after ads'}</span>${be ? `<span><i class="be"></i>breakeven ${x2(be)}</span>` : ''}</div>${roasCurve(r, m)}</div>`;
  const grid = `<div class="card"><div class="cc-h3"><h3>What has to be true</h3><span class="tiny">${k(m.spend)} of spend, ${money(r.aov)} orders${r.fixed_on ? `, ${k(m.fixed)} fixed` : ''}</span></div>${roasGrid(r, m)}</div>`;
  const rcpt = `<div class="card"><div class="cc-h3"><h3>The receipt</h3><span class="tiny">at ${x2(m.roas)}</span></div>${roasReceipt(r, m)}</div>`;
  const roCard = S.ro ? assumeCard([['Average order', money(r.aov)], ['Gross margin', pct(r.margin)], ['Ad spend', k(m.spend)], ['ROAS', x2(m.roas)], ...(r.proc_on ? [['Processing', `${r.proc_pct}% + ${money2(r.proc_fixed)}`]] : []), ...(r.ful_on ? [['Pick, pack, ship', money2(r.ful) + ' an order']] : []), ...(r.fixed_on ? [['Fixed costs', k(r.fixed)]] : []), ...(r.share_on ? [['Revenue share', pct(r.share_pct)]] : []), ...(r.fee_on ? [['Agency fee', pct(r.fee_pct) + ' of spend']] : [])]) : '';
  main.innerHTML = `<div class="cc">${crumb()}${title()}${seg()}${preLine()}${hero}${S.ro ? `${roCard}<div class="cc-two">${dollars}${rcpt}</div>` : `<div class="cc-two">${dials}<div>${dollars}${rcpt}</div></div>`}${grid}${curve}${wordsCard()}${savedCard()}${footNote()}</div>`;
  wireCommon(); wireTips(main);
  if (S.ro) { main.querySelectorAll('.cc-grid .c').forEach(el => el.style.cursor = 'default'); const gn = main.querySelector('.cc-gridnote'); if (gn) gn.textContent = 'Same spend in every cell. The outlined cell is this scenario.'; return; }
  main.querySelectorAll('.cc-grid .c[data-gr]').forEach(el => el.onclick = () => { r.roas = +el.dataset.gr; r.margin = +el.dataset.gm; if (r.mode === 'orders') { r.mode = 'roas'; } tipHide(); inPlace(paintRoas); });
  main.querySelectorAll('.cc-d input').forEach(inp => inp.addEventListener('input', () => { const v = parseIn(inp.value); if (!isFinite(v)) return; if (inp.type === 'range') setP(inp); r[inp.dataset.k] = v; inPlace(paintRoas, inp); }));
  main.querySelectorAll('[data-r]').forEach(inp => inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (!isFinite(v)) return; r[inp.dataset.r] = v; inPlace(paintRoas, inp); }));
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
  wireRoasCurve(r, m);
}

/* Repaint while someone is typing or dragging in the dial card. The dial card must never leave
   the document (removing a range input mid-drag ends the drag, re-creating a text box loses the
   caret), so the new page is painted into a detached tree and every live block EXCEPT the dial
   card is swapped for its new twin. The twin control for the same key is synced by hand. */
function inPlace(fn, src) {
  const old = document.getElementById('ccDials');
  const liveRoot = document.querySelector('#main .cc');
  const keep = !!(src && old && liveRoot && old.contains(src));
  if (!keep) { const y = window.scrollY; fn(); window.scrollTo(0, y); return; }
  TARGET = document.createElement('div');
  let newRoot = null;
  try { fn(); newRoot = TARGET.querySelector('.cc'); } finally { TARGET = null; }
  if (!newRoot) return;
  const nk = [...newRoot.children], lk = [...liveRoot.children];
  if (nk.length !== lk.length) { const y = window.scrollY; liveRoot.replaceWith(newRoot); window.scrollTo(0, y); return; }
  const fresh = newRoot.querySelector('#ccDials');
  nk.forEach((n, i) => {
    const l = lk[i];
    if (!l.contains(old)) { l.replaceWith(n); return; }
    const nc = [...n.children], lc = [...l.children];
    nc.forEach((c, j) => { if (c.id !== 'ccDials' && lc[j]) lc[j].replaceWith(c); });
  });
  const key = src.dataset.k;
  if (key) {
    if (src.type === 'range') { const nb = old.querySelector(`input.num[data-k="${key}"]`); if (nb) nb.value = fmtIn(src.value); }
    else { const rg = old.querySelector(`input[type=range][data-k="${key}"]`); if (rg) { rg.value = parseIn(src.value); setP(rg); } }
  }
  if (fresh) {
    const fs = fresh.querySelectorAll('.cc-d small, .cc-h3 h3'), os = old.querySelectorAll('.cc-d small, .cc-h3 h3');
    fs.forEach((el, i) => { const o = os[i]; if (o && o.innerHTML !== el.innerHTML && !o.contains(src)) o.innerHTML = el.innerHTML; });
  }
}
function wireCommon() {
  const main = host();
  main.querySelectorAll('input.num').forEach(inp => inp.addEventListener('blur', () => { const v = parseIn(inp.value); if (isFinite(v)) inp.value = fmtIn(v); }));
  main.querySelectorAll('.cc-seg button').forEach(b => b.onclick = () => { S.kind = b.dataset.kind; try { localStorage.setItem(LS_KIND, S.kind); } catch {} paint(); window.scrollTo(0, 0); });
  const rs = $('#ccReset'); if (rs) rs.onclick = () => { const b = brand(); S.target = b && +b.target_roas > 0 ? +b.target_roas : 3; if (S.kind === 'leads') { S.cols = defaultCols(); S.focus = 0; } else S.roas = defaultRoas(); paint(); toast('Back to the starting numbers'); };
  const up = $('#ccUsePre'); if (up) up.onclick = () => { const p = S.pre; if (!p) return; if (S.kind === 'leads') S.cols.forEach(c => { if (p.new_aov) c.aov = Math.round(p.new_aov); if (p.margin != null) c.margin = Math.round(p.margin * 100); }); else { if (p.new_aov) S.roas.aov = Math.round(p.new_aov); if (p.margin != null) S.roas.margin = Math.round(p.margin * 100); } inPlace(paint); toast('Filled from the last 90 days'); };
  main.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { $('#ccWords').value = b.dataset.ex; });
  const bld = $('#ccBuild'); if (bld) bld.onclick = buildFromWords;
  main.querySelectorAll('[data-load]').forEach(b => b.onclick = () => { const s = S.saved.find(x => x.id === b.dataset.load); if (!s) return; if (S.kind === 'leads') { const c = { name: s.name, spend: s.inputs.spend, cpl: s.inputs.cpl, cvr: s.inputs.cvr, aov: s.inputs.aov, margin: s.inputs.margin }; if (s.inputs.target) S.target = +s.inputs.target; if (S.cols.length >= 8) S.cols[S.cols.length - 1] = c; else S.cols.push(c); S.focus = S.cols.length - 1; } else S.roas = { ...defaultRoas(), ...s.inputs }; paint(); window.scrollTo(0, 0); });
  main.querySelectorAll('[data-share]').forEach(b => b.onclick = async () => {
    const link = location.origin + location.pathname.replace(/[^/]*$/, '') + 'share.html?s=' + encodeURIComponent(b.dataset.share);
    try { await navigator.clipboard.writeText(link); toast('Link copied. Anyone with it sees this scenario, read-only, no sign-in.'); }
    catch { await ask('Share link', 'Copy this and send it. Read-only, no sign-in needed.', link, 'Done'); }
  });
  main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { const ok = typeof window.confirmModal === 'function' ? await window.confirmModal('Delete this saved scenario?', 'The dials on screen stay as they are.', 'Delete') : true; if (!ok) return; try { await api(`/api/scenario?id=${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' }); await loadSaved(); inPlace(paint); } catch (e) { toast(e.message, true); } });
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
    paint(); window.scrollTo(0, 0); const rd = $('#ccReading'); if (rd) rd.textContent = r.reading || ''; const w = $('#ccWords'); if (w) w.value = text;
  } catch (e) { toast(e.message, true); }
  finally { const b2 = $('#ccBuild'); if (b2) { b2.disabled = false; b2.textContent = 'Build it'; } }
}
function paint() { tipHide(); if (S.kind === 'roas') paintRoas(); else paintLeads(); if (typeof window.pageActions === 'function') window.pageActions(''); }

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
/* The read-only page (profit/share.html?s=<id>): one saved scenario, no sign-in, nothing to dial. */
async function renderShared({ id, url }) {
  injectCss(); S.ro = true; S.url = url; S.tok = '';
  const main = host(); main.innerHTML = `<div class="cc"><div class="card"><span class="hint">Loading…</span></div></div>`;
  let row;
  try { const res = await fetch(url.replace(/\/+$/, '') + '/api/scenario/public?id=' + encodeURIComponent(id)); row = await res.json(); if (!res.ok) throw new Error(row.error || ('HTTP ' + res.status)); }
  catch (e) { main.innerHTML = `<div class="cc"><div class="card"><h3>This link does not work</h3><p class="hint">${esc(e.message)}. Ask whoever sent it to share it again from Locus.</p></div></div>`; return; }
  S.shared = row; S.kind = row.kind === 'roas' ? 'roas' : 'leads'; S.act = row.act; S.accounts = row.brand ? [{ act_id: row.act, name: row.brand }] : [];
  const i = row.inputs || {};
  if (S.kind === 'leads') { S.cols = [{ name: row.name, spend: +i.spend || 0, cpl: +i.cpl || 0, cvr: +i.cvr || 0, aov: +i.aov || 0, margin: +i.margin || 0 }]; S.focus = 0; S.target = +i.target > 0 ? +i.target : 3; paintLeads(); }
  else { S.roas = { ...defaultRoas(), ...i }; paintRoas(); }
  document.title = `${row.name} · ${row.brand || 'Scenario'} · Locus`;
}
window.CalcTab = { render, renderShared };
})();
