/* Locus - the Black Friday plan on the client's season link (?season=<token>).
 * 2026-11-19, Ice & Gold first. v2 the same day: Cole found v1 "too much going on" and wants it shaped
 * like Dartee's plan page. Order, and nothing else:
 *   jump nav · What we need from you · Calendar (phases only, no budgets; tap one = jump to its campaign)
 *   · Campaigns, in order (#, campaign + its groups, when, goal, starts at, ads; tap = its ads)
 *   · Budget and when we check (MER ladder + check-time table) · The ads (tabs, sub-tabs, full-size viewer).
 * Budgets live ONLY in the campaigns table and the check-time table.
 * The plan is DATA (season answer `bf_plan`, served by seasonPublic with each ad's cover and the brand's
 * Your ads token); this file only draws it. Videos play through account-health /api/ad-video?yours=, one
 * at a time, in a sheet that rises from the bottom. Client words only: no internal names.
 */
(function () {
'use strict';
const AH = 'https://mobius-account-health.mobius-digital.workers.dev';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let P = null, flat = [], cur = -1, tab = null, sub = null;

function css() {
  if (document.getElementById('bfpCss')) return;
  const st = document.createElement('style');
  st.id = 'bfpCss';
  st.textContent = `
  .bfp,.bfp-scrim{--p-eb:#B7791F;--p-bf:#1F2937;--p-cm:#2563EB;--p-norm:#64748B;--p-gift:#B4232C;--g:#1C7A46;--g-soft:#E4F2E9;--a:#8F6412;--a-soft:#F8EED6;--r:#9C3A2E;--r-soft:#F7E7E4}
  @media (prefers-color-scheme:dark){.bfp,.bfp-scrim{--p-eb:#E0A43A;--p-bf:#E5E7EB;--p-cm:#6EA8FF;--p-norm:#94A3B8;--p-gift:#F07A82;--g:#5FD292;--g-soft:#15301F;--a:#EBBF63;--a-soft:#3A2E12;--r:#F09182;--r-soft:#3A1C18}}
  .bfp{display:flex;flex-direction:column;gap:22px;margin:4px 0 8px}
  .bfp *{box-sizing:border-box}
  .bfp,.bfp>*,.bfp section{min-width:0;max-width:100%}
  .bfp h2{font-size:20px;margin:0 0 4px}
  .bfp .sm{font-size:13.5px;color:var(--muted);margin:0 0 10px}
  .bfp-top h1{font-family:var(--serif);font-weight:400;font-size:clamp(28px,7vw,38px);line-height:1.08;margin:0 0 6px}
  .bfp-top p{margin:0;color:var(--ink-2);font-size:15px}
  .bfp-jump{display:flex;gap:6px;overflow-x:auto;position:sticky;top:0;z-index:5;background:var(--bg);padding:8px 0;margin:-8px 0;scrollbar-width:none}
  .bfp-jump button{font-family:inherit;cursor:pointer;flex:none;font-size:13px;font-weight:600;color:var(--ink);text-decoration:none;border:1px solid var(--line-strong);background:var(--surface);border-radius:999px;padding:6px 12px}
  .bfp section{scroll-margin-top:56px}
  .bfp-ask{background:var(--brand-soft);border-radius:14px;padding:16px}
  .bfp-ask .q{font-size:15.5px;font-weight:600;margin:0 0 12px}
  .bfp-opts{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .bfp-opts div{background:var(--surface);border:1px solid var(--line-strong);border-radius:12px;padding:10px 12px;font-size:14px}
  .bfp-opts b{display:block;font-size:15px}
  .bfp-tl{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x proximity;padding-bottom:6px;scrollbar-width:thin}
  .bfp-ph{flex:0 0 auto;min-width:150px;scroll-snap-align:start;text-align:left;font:inherit;color:inherit;cursor:pointer;background:var(--surface);border:1px solid var(--line);border-top:5px solid var(--c);border-radius:12px;padding:10px 12px;display:grid;gap:2px}
  .bfp-ph b{font-size:15px}
  .bfp-ph span{font-size:13px;color:var(--ink-2)}
  .bfp-ph small{font-size:12px;color:var(--muted)}
  .bfp-tbl{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:12px}
  .bfp table{border-collapse:collapse;width:100%;font-size:14px;font-variant-numeric:tabular-nums}
  .bfp th,.bfp td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
  .bfp th{font-size:11.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);font-weight:600;white-space:nowrap}
  .bfp tr:last-child td{border-bottom:none}
  .bfp td.t{font-weight:600;min-width:130px}
  .bfp td.t small{display:block;font-weight:500;color:var(--muted);font-size:12.5px;margin-top:2px}
  .bfp td.n{white-space:nowrap}
  .bfp td .m{display:none}
  @media (max-width:640px){.bfp .w{display:none}.bfp td .m{display:block;color:var(--ink-2)}.bfp td.t{min-width:0}.bfp td.n{white-space:normal}.bfp .bfp-tbl{overflow-x:visible}.bfp table{table-layout:fixed}.bfp th.c0{width:28px}.bfp th.c3,.bfp th.c4{width:30%}.bfp th.c5{width:56px}.bfp td,.bfp td small{white-space:normal;overflow-wrap:break-word}}
  .bfp tr[data-bfgo]{cursor:pointer}
  .bfp tr[data-bfgo] td.t{color:var(--brand-ink)}
  .bfp tr.hl td{background:var(--brand-soft)}
  .bfp-rules{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:10px 0}
  @media (min-width:640px){.bfp-rules{grid-template-columns:repeat(3,minmax(0,1fr))}}
  .bfp-rule{border-radius:10px;padding:11px 12px;display:grid;gap:2px;font-size:13.5px}
  .bfp-rule b{font-size:16px}
  .bfp-rule.up2{background:var(--g);color:var(--surface)} .bfp-rule.up{background:var(--g-soft)} .bfp-rule.hold{background:var(--a-soft)}
  .bfp-rule.down{background:var(--r-soft)} .bfp-rule.down2{background:var(--r);color:var(--surface)}
  .bfp-tabs,.bfp-subs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin-bottom:10px}
  .bfp-tabs button,.bfp-subs button{flex:none;font:inherit;font-size:13.5px;font-weight:600;color:var(--ink);background:var(--surface);border:1px solid var(--line-strong);border-radius:999px;padding:7px 14px;cursor:pointer}
  .bfp-tabs button[aria-selected="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
  .bfp-subs button{font-size:12.5px;padding:5px 11px}
  .bfp-subs button[aria-selected="true"]{background:var(--g);color:var(--surface);border-color:var(--g)}
  .bfp-panel{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px}
  .bfp-panel p{font-size:13.5px;color:var(--muted);margin:0 0 10px}
  .bfp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
  @media (min-width:640px){.bfp-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}}
  .bfp-ad{position:relative;aspect-ratio:4/5;border:0;padding:0;border-radius:8px;overflow:hidden;background:var(--brand-soft);cursor:pointer;display:block;width:100%}
  .bfp-ad img{width:100%;height:100%;object-fit:cover;display:block;position:relative;z-index:1}
  .bfp-ad .lab{position:absolute;z-index:2;left:0;right:0;bottom:0;padding:16px 6px 5px;font-size:11px;line-height:1.2;color:#fff;text-align:left;background:linear-gradient(transparent,rgba(0,0,0,.72));font-weight:600}
  .bfp-ad .pl{position:absolute;z-index:2;right:6px;top:6px;width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center}
  .bfp-ad .pl::after{content:"";border-left:9px solid #fff;border-top:6px solid transparent;border-bottom:6px solid transparent;margin-left:2px}
  .bfp-ad .none{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted)}
  .bfp-scrim{position:fixed;inset:0;background:rgba(8,12,16,.86);z-index:200;display:flex;align-items:flex-end;justify-content:center}
  .bfp-scrim[hidden]{display:none}
  .bfp-sheet{background:var(--surface);color:var(--ink);width:100%;max-width:560px;max-height:94vh;border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden;animation:bfpUp .2s ease-out;padding-bottom:env(safe-area-inset-bottom,0px)}
  @media (min-width:700px){.bfp-scrim{align-items:center}.bfp-sheet{border-radius:18px}}
  @keyframes bfpUp{from{transform:translateY(40px)}to{transform:none}}
  .bfp-media{background:#000;display:flex;align-items:center;justify-content:center;min-height:200px;flex:1 1 auto;overflow:hidden;position:relative}
  .bfp-media video,.bfp-media img{display:block;max-width:100%;max-height:74vh;width:100%;object-fit:contain}
  .bfp-media iframe{width:100%;height:74vh;border:0;background:#fff}
  .bfp-media .msg{color:#cbd5e1;font-size:13.5px;padding:30px 16px;text-align:center}
  .bfp-row{display:flex;gap:8px;align-items:center;padding:10px 12px}
  .bfp-row .nm{flex:1;min-width:0;font-weight:600;font-size:14px}
  .bfp-row .nm small{display:block;color:var(--muted);font-weight:500;font-size:12px}
  .bfp-btn{font:inherit;font-size:13.5px;font-weight:600;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);border-radius:10px;padding:8px 12px;cursor:pointer;min-width:42px}
  .bfp-sec{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden}
  .bfp-sec>summary{list-style:none;cursor:pointer;padding:14px 16px;display:grid;gap:2px}
  .bfp-sec>summary::-webkit-details-marker{display:none}
  .bfp-sec>summary b{font-size:19px}
  .bfp-sec>summary span{font-size:13.5px;color:var(--ink-2)}
  .bfp-sec>summary::after{content:"Show";justify-self:start;font-size:12.5px;font-weight:700;color:var(--brand-ink);margin-top:4px}
  .bfp-sec[open]>summary::after{content:"Hide"}
  .bfp-secb{padding:0 12px 14px;display:grid;gap:12px}
  .bfp-camp{border:1px solid var(--line-strong);border-radius:14px;padding:12px;display:grid;gap:10px}
  .bfp-camp h3{margin:0;font-size:16px}
  .bfp-camp .meta{font-size:13px;color:var(--ink-2);display:flex;flex-wrap:wrap;gap:4px 12px}
  .bfp-set{border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--bg);display:grid;gap:8px;min-width:0}
  .bfp-set .hd{display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap}
  .bfp-set .hd b{font-size:15px}
  .bfp-pill2{font-size:11.5px;font-weight:700;border-radius:999px;padding:2px 9px;white-space:nowrap}
  .bfp-pill2.on{background:var(--g-soft);color:var(--g)} .bfp-pill2.offp{background:var(--line);color:var(--ink-2)}
  .bfp-set .who{font-size:13.5px;margin:0}
  .bfp-set .dt{font-size:12.5px;color:var(--muted)}
  .bfp-cap{display:grid;gap:4px;font-size:12.5px;color:var(--ink-2)}
  .bfp-cap .bar{height:8px;border-radius:4px;background:var(--line);overflow:hidden;display:flex}
  .bfp-cap .bar i{display:block;height:100%}
  .bfp-cap .over{color:var(--r);font-weight:700}
  .bfp-grp{display:grid;gap:6px}
  .bfp-grp h4{margin:4px 0 0;font-size:13px;font-weight:700}
  .bfp-grp details summary{cursor:pointer;font-size:13px;font-weight:700;color:var(--ink-2);padding:4px 0}
  .bfp-ad .by{position:absolute;z-index:2;left:6px;top:6px;font-size:10px;font-weight:700;border-radius:4px;padding:1px 5px;background:rgba(0,0,0,.6);color:#fff;max-width:calc(100% - 40px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bfp-mom{list-style:none;margin:0;padding:0;display:grid;gap:0;background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden}
  .bfp-mom li{display:grid;grid-template-columns:118px minmax(0,1fr);gap:10px;padding:11px 14px;border-bottom:1px solid var(--line);font-size:14.5px}
  .bfp-mom li:last-child{border-bottom:0}
  .bfp-mom li b{font-size:13.5px}
  .bfp-mom li.hot{background:var(--brand-soft)}
  .bfp-goal{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px}
  .bfp-goal .big{font-size:30px;font-weight:700;line-height:1.1}
  .bfp-goal p{margin:6px 0 0;font-size:15px}
  .bfp-lad{list-style:none;margin:0;padding:0;display:grid;gap:8px}
  .bfp-lad li{display:grid;grid-template-columns:110px minmax(0,1fr);gap:10px;align-items:center;border-radius:12px;padding:10px 12px;font-size:14.5px}
  .bfp-lad li b{font-size:15px}
  .bfp-lad li.up2{background:var(--g);color:var(--surface)} .bfp-lad li.up{background:var(--g-soft)} .bfp-lad li.hold{background:var(--a-soft)}
  .bfp-lad li.down{background:var(--r-soft)} .bfp-lad li.down2{background:var(--r);color:var(--surface)}
  .bfp-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}
  .bfp-cal .dh{font-size:11px;font-weight:700;color:var(--muted);text-align:center;padding:2px 0}
  .bfp-day{min-height:64px;border:1px solid var(--line);border-radius:7px;background:var(--surface);padding:3px;display:flex;flex-direction:column;gap:2px;min-width:0;text-align:left;font:inherit;color:inherit}
  .bfp-day.pad{background:transparent;border-color:transparent}
  .bfp-day.has{cursor:pointer}
  .bfp-day.r-bf{background:color-mix(in srgb,var(--p-bf) 12%,var(--surface))}
  .bfp-day.r-xmas{background:color-mix(in srgb,var(--p-gift) 10%,var(--surface))}
  .bfp-day.today{outline:2px solid var(--brand);outline-offset:-1px}
  .bfp-day .n{font-size:12px;font-weight:700;line-height:1}
  .bfp-day .n small{font-weight:600;color:var(--muted);font-size:10px;margin-left:2px}
  .bfp-ev{display:block;font-size:9.5px;line-height:1.15;font-weight:700;border-radius:4px;padding:2px 3px;overflow-wrap:break-word;hyphens:none}
  .bfp-ev.bf{background:var(--p-bf);color:var(--surface)} .bfp-ev.cm{background:var(--p-cm);color:#fff} .bfp-ev.xmas{background:var(--p-gift);color:#fff}
  .bfp-ev.budget{background:var(--g-soft);color:var(--g)} .bfp-ev.end{background:var(--line);color:var(--ink-2)} .bfp-ev.ask{border:1.5px dashed var(--brand-ink);color:var(--brand-ink)}
  @media (min-width:700px){.bfp-day{min-height:92px;padding:5px}.bfp-ev{font-size:11px}.bfp-day .n{font-size:13px}}
  .bfp-sheetb{padding:16px 18px 18px;overflow:auto}
  .bfp-sheetb h4{margin:0 0 10px;font-size:18px}
  .bfp-sheetb ul{list-style:none;margin:0 0 14px;padding:0;display:grid;gap:8px}
  .bfp-sheetb li{display:grid;grid-template-columns:62px minmax(0,1fr);gap:8px;font-size:14.5px}
  .bfp-sheetb li b{font-size:13px;color:var(--brand-ink)}
  .bfp-camp2{border:1px solid var(--line-strong);border-radius:14px;padding:14px;background:var(--surface);display:grid;gap:10px}
  .bfp-camp2 h3{margin:0;font-size:17px}
  .bfp-camp2 .meta{font-size:13.5px;color:var(--ink-2);display:grid;gap:2px}
  .bfp-set2{border-left:4px solid var(--brand);background:var(--bg);border-radius:10px;padding:10px 12px;display:grid;gap:4px}
  .bfp-set2 b{font-size:15.5px}
  .bfp-set2 p{margin:0;font-size:14px}
  .bfp-set2 .dt{font-size:12.5px;color:var(--muted)}
  .bfp-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 0 8px}
  .bfp-chips button{flex:none;font:inherit;font-size:13px;font-weight:600;color:var(--ink);background:var(--surface);border:1px solid var(--line-strong);border-radius:999px;padding:6px 12px;cursor:pointer}
  .bfp-chips button[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
  .bfp-counts{font-size:14px;margin:0 0 10px;display:grid;gap:2px}
  .bfp-ad .st{position:absolute;z-index:2;right:6px;bottom:24px;font-size:10px;font-weight:700;border-radius:4px;padding:1px 5px}
  .bfp-ad .st.on{background:var(--g);color:#fff} .bfp-ad .st.wait{background:#fff;color:#111}
  .bfp-planbox{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
  .bfp-planbox ol{margin:0;padding:0;list-style:none;display:grid;gap:10px;counter-reset:pb}
  .bfp-planbox li{display:grid;grid-template-columns:26px minmax(0,1fr);gap:8px;font-size:14.5px;counter-increment:pb}
  .bfp-planbox li::before{content:counter(pb);width:24px;height:24px;border-radius:50%;background:var(--ink);color:var(--bg);font-weight:700;font-size:12.5px;display:flex;align-items:center;justify-content:center}
  .bfp-planbox li b{display:block}
  .bfp-grpbox{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px;display:grid;gap:8px}
  .bfp-grpbox h3{margin:0;font-size:17px}
  .bfp-grpbox .ct{font-size:13px;color:var(--ink-2);margin:0}
  .bfp-grpbox details{border-top:1px solid var(--line);padding-top:8px}
  .bfp-grpbox summary{cursor:pointer;font-size:14px;font-weight:700;padding:2px 0 8px}
  .bfp-su{display:grid;gap:10px}
  .bfp-su-camp{background:var(--ink);color:var(--bg);border-radius:14px;padding:14px 16px;display:grid;gap:4px;font-size:14.5px}
  .bfp-su-camp b{font-size:18px}
  .bfp-su-grp{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:grid;gap:8px}
  .bfp-su-grp h3{margin:0;font-size:17px;text-transform:none;letter-spacing:0;color:var(--ink)}
  .bfp-su-who{margin:-4px 0 0;font-size:14px;color:var(--ink-2);text-transform:none;letter-spacing:0}
  .bfp-su-ln{display:grid;grid-template-columns:58px 60px minmax(0,1fr);gap:8px;align-items:baseline;position:static}
  .bfp-su-when{font-size:13px;font-weight:700;color:var(--muted)}
  .bfp-su-big{font-size:26px;font-weight:800;line-height:1}
  .bfp-su-txt{font-size:14px}
  .bfp-su-note{font-size:13.5px;color:var(--ink-2);margin:0;text-transform:none;letter-spacing:0}
  .bfp-su-rule{border:2px solid var(--r);border-radius:14px;padding:12px 16px;font-size:15px}
  .bfp-load{padding:20px;text-align:center;color:var(--muted);font-size:14px}
  `;
  document.head.appendChild(st);
}

const thumbOf = a => a.thumb || (P.yours ? `${AH}/api/your-ads/${P.yours}/thumb?ad=${a.id}` : '');
const tabsOf = () => [...new Set((P.groups || []).map(g => g.tab || 'Ads'))];

function top() {
  return `<div class="bfp-top"><h1>${esc(P.title || 'Black Friday: the plan and the ads')}</h1>${P.lede ? `<p>${esc(P.lede)}</p>` : ''}</div>
    <nav class="bfp-jump">${P.asks?.length && !P.meta ? '<button type="button" data-jump="#bfpAsk">What we need</button>' : ''}${P.layout === 'v5' ? (P.planbox ? '<button type="button" data-jump="#bfpPlan">Plan</button>' : '') + '<button type="button" data-jump="#bfpCal">Calendar</button><button type="button" data-jump="#bfpStructS">Setup</button><button type="button" data-jump="#bfpAdsS">Ads</button><button type="button" data-jump="#bfpGoal">Goal</button><button type="button" data-jump="#bfpAsk">Questions</button>' : P.meta ? '<button type="button" data-jump="#bfpCal">Calendar</button><button type="button" data-jump="#bfpSetup">The ads</button><button type="button" data-jump="#bfpGoal">Goal</button><button type="button" data-jump="#bfpKpi">Budget rules</button><button type="button" data-jump="#bfpAsk">Questions</button>' : `<button type="button" data-jump="#bfpCal">Calendar</button><button type="button" data-jump="#bfpCamp">Campaigns</button><button type="button" data-jump="#bfpKpi">Budget + MER</button><button type="button" data-jump="#bfpAds">The ads</button>`}</nav>`;
}

function asks() {
  if (!P.asks?.length) return '';
  return `<section id="bfpAsk" style="display:grid;gap:10px"><h2>${esc(P.asks_title || 'What we need from you')}</h2>${P.asks.map(a => `<div class="bfp-ask"><p class="q">${esc(a.q)}</p>
    ${a.options?.length ? `<div class="bfp-opts">${a.options.map(o => `<div><b>${esc(o.label)}</b>${esc(o.note || '')}</div>`).join('')}</div>` : ''}</div>`).join('')}
    ${P.asks_note ? `<p class="sm" style="margin-top:8px">${esc(P.asks_note)}</p>` : ''}</section>`;
}

function calendar() {
  return `<section id="bfpCal"><h2>Calendar</h2><p class="sm">Tap a phase to see its campaign.</p>
    <div class="bfp-tl">${(P.timeline || []).map(t => `<button class="bfp-ph" style="--c:${t.color}" data-camp="${esc(t.camp || '')}"><b>${esc(t.name)}</b><span>${esc(t.when)}</span>${t.note ? `<small>${esc(t.note)}</small>` : ''}</button>`).join('')}</div></section>`;
}

function campaigns() {
  return `<section id="bfpCamp"><h2>Campaigns, in order</h2><p class="sm">Tap a row to see its ads.</p>
    <div class="bfp-tbl"><table><tr><th class="c0">#</th><th>Campaign</th><th class="w">When</th><th class="w">Goal</th><th class="c3">Starts at</th><th class="c5">Ads</th></tr>
    ${(P.campaigns || []).map((c, i) => `<tr id="bfpC-${esc(c.key)}" ${c.tab ? `data-bfgo="${esc(c.tab)}"` : ''}><td>${i + 1}</td><td class="t">${esc(c.name)}${c.sets ? `<small>${esc(c.sets)}</small>` : ''}<small class="m">${esc(c.when)}</small></td><td class="w">${esc(c.when)}</td><td class="w">${esc(c.goal || 'Sales')}</td><td>${esc(c.starts)}</td><td class="n">${esc(c.ads || '')}</td></tr>`).join('')}
    </table></div>${P.campaigns_note ? `<p class="sm" style="margin-top:8px">${esc(P.campaigns_note)}</p>` : ''}</section>`;
}

function kpi() {
  const L = P.ladder || {};
  return `<section id="bfpKpi"><h2>Budget and when we check</h2>${L.intro ? `<p style="margin:0;font-size:14.5px">${esc(L.intro)}</p>` : ''}
    <div class="bfp-rules">${(L.rungs || []).map(r => `<div class="bfp-rule ${esc(r.tone)}"><b>${esc(r.line)}</b><span>${esc(r.action)}</span></div>`).join('')}</div>
    ${L.note ? `<p class="sm">${esc(L.note)}</p>` : ''}
    ${L.checks?.length ? `<div class="bfp-tbl"><table><tr><th>When</th><th class="c4">Budget</th><th class="w">What happens</th></tr>${L.checks.map(c => `<tr><td class="t">${esc(c.when)}<small class="m">${esc(c.what)}</small></td><td class="n">${esc(c.budget)}</td><td class="w">${esc(c.what)}</td></tr>`).join('')}</table></div>` : ''}</section>`;
}

function ads() {
  const tabs = tabsOf();
  if (!tabs.length) return '';
  if (!tabs.includes(tab)) tab = tabs[0];
  const gs = (P.groups || []).filter(g => (g.tab || 'Ads') === tab);
  if (!gs.some(g => g.title === sub)) sub = gs[0]?.title;
  const g = gs.find(x => x.title === sub) || gs[0];
  flat = (g?.ads || []).map(a => ({ ...a, grp: g }));
  const n = t => (P.groups || []).filter(x => (x.tab || 'Ads') === t).reduce((s, x) => s + x.ads.length, 0);
  return `<section id="bfpAds"><h2>The ads</h2><p class="sm">Tap any ad to see it full size. Videos play with sound.</p>
    <div class="bfp-tabs" role="tablist">${tabs.map(t => `<button data-tab="${esc(t)}" aria-selected="${t === tab}">${esc(t)} (${n(t)})</button>`).join('')}</div>
    <div class="bfp-panel">${gs.length > 1 ? `<div class="bfp-subs">${gs.map(x => `<button data-sub="${esc(x.title)}" aria-selected="${x.title === sub}">${esc(x.title)} ${x.ads.length}</button>`).join('')}</div>` : ''}
    ${g?.sub ? `<p>${esc(g.sub)}</p>` : ''}
    <div class="bfp-grid">${flat.map((a, k) => `<button class="bfp-ad" data-ad="${k}" aria-label="Open ${esc(a.label || 'ad')}"><span class="none">${a.kind === 'video' ? 'Video' : 'Photo'}</span>
      <img loading="lazy" alt="" src="${esc(thumbOf(a))}">${a.kind === 'video' ? '<span class="pl"></span>' : ''}${a.label ? `<span class="lab">${esc(a.label)}</span>` : ''}</button>`).join('')}</div></div></section>`;
}

/* ---- v4 (2026-11-19): calendar as one line per moment, the goal, the ladder as a when/then list ---- */
function moments() {
  if (!P.moments?.length) return '';
  return `<section id="bfpCal"><h2>Calendar</h2>${P.moments_note ? `<p class="sm">${esc(P.moments_note)}</p>` : ''}
    <ol class="bfp-mom">${P.moments.map(m => `<li class="${m.hot ? 'hot' : ''}"><b>${esc(m.when)}</b><span>${esc(m.what)}</span></li>`).join('')}</ol></section>`;
}
function goalBox() {
  if (!P.goal) return '';
  return `<section id="bfpGoal"><h2>The goal</h2><div class="bfp-goal"><div class="big">${esc(P.goal.big)}</div><p>${esc(P.goal.line)}</p></div></section>`;
}
function ladderList() {
  const L = P.ladder || {};
  return `<section id="bfpKpi"><h2>${esc(L.title || 'When we raise or lower the budget')}</h2>${L.intro ? `<p class="sm">${esc(L.intro)}</p>` : ''}
    <ul class="bfp-lad">${(L.rungs || []).map(r => `<li class="${esc(r.tone)}"><b>${esc(r.line)}</b><span>${esc(r.action)}</span></li>`).join('')}</ul>
    ${L.note ? `<p style="margin:10px 0 0;font-size:14.5px">${esc(L.note)}</p>` : ''}</section>`;
}

/* ---- v5 (2026-11-20, Cole: "still confusing"): three sections. Calendar = a month grid, Structure = the
   recommended campaign and its two boxes only, Ads = every live ad with filter chips. Then goal, ladder, questions. ---- */
let chip = 'all', ADS = [];
const iso = d => d.toISOString().slice(0, 10);
function calGrid() {
  const C = P.calendar || {};
  const from = new Date((C.from || '2026-11-23') + 'T12:00:00Z'), to = new Date((C.to || '2026-12-31') + 'T12:00:00Z');
  const start = new Date(from); start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));   // Monday
  const ev = {}; (C.events || []).forEach(e => (ev[e.d] = ev[e.d] || []).push(e));
  const inRange = (d, r) => d >= r.from && d <= r.to;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  let cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => `<div class="dh">${x}</div>`).join('');
  for (let d = new Date(start); d <= to || (d.getUTCDay() + 6) % 7 !== 0; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = iso(d);
    if (d < from || d > to) { cells += '<div class="bfp-day pad"></div>'; continue; }
    const es = ev[k] || [];
    const r = (C.ranges || []).find(x => inRange(k, x));
    const first = k === iso(from) || d.getUTCDate() === 1;
    cells += `<${es.length ? 'button type="button"' : 'div'} class="bfp-day ${es.length ? 'has' : ''} ${r ? 'r-' + r.kind : ''} ${k === today ? 'today' : ''}" ${es.length ? `data-day="${k}"` : ''}>
      <span class="n">${d.getUTCDate()}${first ? `<small>${d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</small>` : ''}</span>
      ${es.map(e => `<span class="bfp-ev ${esc(e.kind)}">${esc(e.short)}</span>`).join('')}</${es.length ? 'button' : 'div'}>`;
  }
  return `<section id="bfpCal"><h2>1. Calendar</h2><p class="sm">${esc(C.note || 'All times Eastern. Tap a day for the details.')}</p>
    <div class="bfp-cal">${cells}</div>${(C.asks || []).map(a => `<div class="bfp-ask" style="margin-top:12px"><p class="q">${esc(a.q)}</p><div class="bfp-opts">${a.options.map(o => `<div><b>${esc(o.label)}</b>${esc(o.note || '')}</div>`).join('')}</div></div>`).join('')}</section>`;
}
function openDay(k) {
  const es = (P.calendar.events || []).filter(e => e.d === k);
  const d = new Date(k + 'T12:00:00Z');
  const sh = show(`<div class="bfp-sheetb"><h4>${esc(d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }))}</h4>
    <ul>${es.map(e => `<li><b>${esc(e.t || '')}</b><span>${esc(e.text)}</span></li>`).join('')}</ul><button class="bfp-btn" data-x style="width:100%">Close</button></div>`);
  sh.querySelector('[data-x]').onclick = close;
}
function structV5() {
  const S = P.structure || {};
  if (!M) return '<div class="bfp-load">Loading the live setup from Meta…</div>';
  if (M.error) return `<div class="bfp-load">${esc(M.error)}</div>`;
  const c = M.campaigns.find(x => x.id === S.campaign);
  if (!c) return '';
  const set = id => c.sets.find(x => x.id === id) || {};
  return `<div class="bfp-camp2"><h3>${esc(S.label || c.name)}</h3><div class="meta">${(S.lines || []).map(l => `<span>${esc(l)}</span>`).join('')}<span>Budget now: ${money0(c.budget)} a day</span></div>
    ${(S.sets || []).map(x => { const m = set(x.id); return `<div class="bfp-set2"><b>${esc(x.label)}</b><p>${esc(x.who)}</p>
      <div class="dt">${!m.id ? 'Being set up in Meta now.' : `${c.ads.filter(a => a.set === x.id && adOn(a)).length} ads on · starts ${esc(dshort(m.start))}${m.end ? `, ends ${esc(dshort(m.end))}` : ''}`}${x.note ? ` · ${esc(x.note)}` : ''}</div></div>`; }).join('')}</div>`;
}
function collectAds() {
  const A = P.ads || {}, cm = new RegExp(P.meta.cm || '^$', 'i'), out = [];
  for (const src of A.sources || []) {
    const c = M.campaigns.find(x => x.id === src.campaign); if (!c) continue;
    const sets = c.sets.filter(s => (src.sets ? src.sets.includes(s.id) : isOn(s.status)));
    for (const a of c.ads) {
      const st = sets.find(s => s.id === a.set); if (!st) continue;
      const on = adOn(a), isCm = !on && cm.test(a.name || '');
      if (!on && !isCm) continue;                       // paused and not waiting for Cyber Monday: not used, not shown
      const startsLater = st.start && new Date(st.start) > new Date();
      out.push({ ...a, cat: src.cat, test: src.test_set === a.set, cm: isCm,
        wait: isCm ? 'Waiting: Nov 30' : startsLater ? `Waiting: ${dshort(st.start)}` : '', maker: makerOf(a.name) });
    }
  }
  return out;
}
const CHIPS = [['all', 'All'], ['video', 'Videos'], ['photo', 'Photos'], ['test', 'Tests (AI model)'], ['cm', 'Cyber Monday'], ['xmas', 'Christmas']];
const chipOk = (a, k) => k === 'all' || (k === 'video' && a.video) || (k === 'photo' && !a.video) || (k === 'test' && a.test) || (k === 'cm' && a.cm) || (k === 'xmas' && a.cat === 'xmas');
function adsV5() {
  if (!M) return '<div class="bfp-load">Loading the ads from Meta…</div>';
  if (M.error) return `<div class="bfp-load">${esc(M.error)}</div>`;
  ADS = collectAds();
  const list = ADS.filter(a => chipOk(a, chip));
  const grp = P.ads.groups || {};
  const by = arr => { const m = {}; arr.forEach(a => { const g = grp[a.maker] || a.maker; m[g] = (m[g] || 0) + 1; }); return Object.entries(m).sort((x, y) => y[1] - x[1]).map(([g, n]) => `${n} ${g}`).join(', '); };
  const vids = list.filter(a => a.video), pics = list.filter(a => !a.video);
  groups = { v5: list };
  return `<div class="bfp-chips">${CHIPS.map(([k, l]) => `<button type="button" data-chip="${k}" aria-pressed="${chip === k}">${esc(l)} (${ADS.filter(a => chipOk(a, k)).length})</button>`).join('')}</div>
    <div class="bfp-counts">${pics.length ? `<span><b>Photos: ${pics.length}</b> (${esc(by(pics))})</span>` : ''}${vids.length ? `<span><b>Videos: ${vids.length}</b> (${esc(by(vids))})</span>` : ''}</div>
    <div class="bfp-grid">${list.map((a, k) => `<button class="bfp-ad" data-g="v5" data-k="${k}" aria-label="Open ${esc(cleanName(a.name))}"><span class="none">${a.video ? 'Video' : 'Photo'}</span>
      <img loading="lazy" alt="" src="${esc(thumbOf(a))}"><span class="by">${esc(a.maker)}</span>${a.video ? '<span class="pl"></span>' : ''}
      <span class="st ${a.wait ? 'wait' : 'on'}">${esc(a.wait || 'On')}</span><span class="lab">${esc(cleanName(a.name))}</span></button>`).join('')}</div>`;
}
/* ---- v6 (2026-11-20, Cole's approved setup): plan box on top; ads grouped by ad group in three rows
   (On Nov 26 / Backups / Cyber Monday), read live; only the listed ad groups, no Christmas ---- */
function planBox() {
  if (!P.planbox?.length) return '';
  return `<section id="bfpPlan"><h2>${esc(P.planbox_title || 'The plan')}</h2><div class="bfp-planbox"><ol>${P.planbox.map(x => `<li><span><b>${esc(x.when)}</b>${esc(x.text)}</span></li>`).join('')}</ol></div></section>`;
}
function adsBySet() {
  if (!M) return '<div class="bfp-load">Loading the ads from Meta…</div>';
  if (M.error) return `<div class="bfp-load">${esc(M.error)}</div>`;
  const A = P.ads, cm = new RegExp(P.meta.cm || '^$', 'i');
  const c = M.campaigns.find(x => x.id === A.campaign); if (!c) return '';
  groups = {};
  const tile = (list, key) => { groups[key] = list; return `<div class="bfp-grid">${list.map((a, k) => `<button class="bfp-ad" data-g="${esc(key)}" data-k="${k}" aria-label="Open ${esc(cleanName(a.name))}"><span class="none">${a.video ? 'Video' : 'Photo'}</span>
      <img loading="lazy" alt="" src="${esc(thumbOf(a))}"><span class="by">${esc(makerOf(a.name))}</span>${a.video ? '<span class="pl"></span>' : ''}<span class="lab">${esc(cleanName(a.name))}</span></button>`).join('')}</div>`; };
  return (A.sets || []).map(x => {
    const ads = c.ads.filter(a => a.set === x.id);
    const on = ads.filter(adOn), off = ads.filter(a => !adOn(a));
    const cms = off.filter(a => cm.test(a.name || '')), backups = off.filter(a => !cm.test(a.name || ''));
    const rows = [['On Nov 26', on, 'on', true], [A.backup_label || 'Backups (paused, one goes on when an ad is turned off)', backups, 'bk', false], [A.cm_label || 'Cyber Monday (goes on Nov 30 at 12am)', cms, 'cm', false]];
    return `<div class="bfp-grpbox"><h3>${esc(x.label)}</h3><p class="ct">${ads.length ? `${on.length} on · ${backups.length} backups · ${cms.length} Cyber Monday` : 'Being set up in Meta now.'}</p>
      ${rows.map(([lab, list, k, open]) => list.length ? `<details ${open ? 'open' : ''}><summary>${esc(lab)} (${list.length})</summary>${tile(list, k + x.id)}</details>` : '').join('')}</div>`;
  }).join('') + (A.footnote ? `<p class="sm" style="margin:0">${esc(A.footnote)}</p>` : '');
}
/* ---- v7 (2026-11-20): a PROPOSAL, not the live account. Setup and ads come from the plan as written
   (P.ads.mode = 'fixed'); Meta is used only for each ad's picture and video. ---- */
function structFixed() {
  const S = P.structure || {};
  if (S.groups) return `<div class="bfp-su"><div class="bfp-su-camp"><b>${esc(S.campaign_title || 'Campaign')}</b>${(S.campaign_lines || []).map(l => `<span>${esc(l)}</span>`).join('')}</div>
    ${S.groups.map(g => `<div class="bfp-su-grp"><h3>${esc(g.title)}</h3>${g.who ? `<p class="bfp-su-who">${esc(g.who)}</p>` : ''}
      ${(g.lines || []).map(l => `<div class="bfp-su-ln"><span class="bfp-su-when">${esc(l.when)}</span><span class="bfp-su-big">${esc(l.big)}</span><span class="bfp-su-txt">${esc(l.text)}</span></div>`).join('')}
      ${g.note ? `<p class="bfp-su-note">${esc(g.note)}</p>` : ''}</div>`).join('')}
    ${S.rule ? `<div class="bfp-su-rule"><b>Rule:</b> ${esc(S.rule)}</div>` : ''}</div>`;
  return `<div class="bfp-camp2"><h3>${esc(S.label)}</h3><div class="meta">${(S.lines || []).map(l => `<span>${esc(l)}</span>`).join('')}</div>
    ${(S.sets || []).map(x => `<div class="bfp-set2"><b>${esc(x.label)}</b><p>${esc(x.who)}</p>${x.dt ? `<div class="dt">${esc(x.dt)}</div>` : ''}</div>`).join('')}</div>`;
}
function adsFixed() {
  const A = P.ads; groups = {};
  const tile = (list, key, video) => { groups[key] = list.map(a => ({ ...a, video })); return `<div class="bfp-grid">${list.map((a, k) => `<button class="bfp-ad" data-g="${esc(key)}" data-k="${k}" aria-label="Open ${esc(a.label)}"><span class="none">${video ? 'Video' : 'Photo'}</span>
      <img loading="lazy" alt="" src="${esc(thumbOf(a))}">${a.by ? `<span class="by">${esc(a.by)}</span>` : ''}${video ? '<span class="pl"></span>' : ''}<span class="lab">${esc(a.label)}</span></button>`).join('')}</div>`; };
  return (A.summary ? `<p class="bfp-counts" style="margin:0">${esc(A.summary)}</p>` : '') + (A.groups || []).map((g, gi) => `<div class="bfp-grpbox"><h3>${esc(g.label)}</h3><p class="ct">${g.rows.map(r => `${r.ads.length} ${esc(r.count_word || r.label)}`).join(' · ')}</p>
    ${g.rows.map((r, ri) => r.ads.length ? `<details ${ri === 0 ? 'open' : ''}><summary>${esc(r.label)} (${r.ads.length})</summary>${tile(r.ads, `f${gi}_${ri}`, !!g.video)}</details>` : '').join('')}</div>`).join('')
    + (A.footnote ? `<p class="sm" style="margin:0">${esc(A.footnote)}</p>` : '');
}
function wireV5(root) {
  if (P.ads?.mode === 'fixed') {
    const ad0 = root.querySelector('#bfpAdsV5');
    ad0.querySelectorAll('.bfp-ad img').forEach(im => { im.onerror = () => im.remove(); });
    ad0.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { flat = (groups[b.dataset.g] || []).map(a => ({ id: a.id, label: a.label, kind: a.video ? 'video' : 'still', thumb: null, grp: { title: a.by || '' } })); openAd(+b.dataset.k); });
    return;
  }
  const st = root.querySelector('#bfpStruct'); if (st) st.innerHTML = structV5();
  const ad = root.querySelector('#bfpAdsV5'); if (!ad) return;
  ad.innerHTML = P.ads?.mode === 'by_set' ? adsBySet() : adsV5();
  ad.querySelectorAll('.bfp-ad img').forEach(im => { im.onerror = () => im.remove(); });
  ad.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => { chip = b.dataset.chip; wireV5(root); });
  ad.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { flat = (groups[b.dataset.g] || []).map(a => ({ id: a.id, label: cleanName(a.name), kind: a.video ? 'video' : 'still', thumb: a.thumb, grp: { title: `${a.maker}${a.wait ? ' · ' + a.wait : ' · On'}` } })); openAd(+b.dataset.k); });
}

/* ---- the live Meta view (v3, 2026-11-19): campaigns, their ad sets as boxes, every ad, read live ---- */
let M = null, groups = {};
const money0 = n => n == null ? '' : '$' + Math.round(n).toLocaleString('en-US');
const dshort = iso => { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }); };
const isOn = st => !/PAUSED|ARCHIVED|DELETED|DISAPPROVED/.test(st || '');
function makerOf(name) {
  for (const [re, who] of (P.meta.makers || [])) if (new RegExp(re, 'i').test(name || '')) return who;
  return P.meta.maker_default || 'Mobius team';
}
function cleanName(name) {
  return String(name || '').replace(/\s*\|\s*(Still|Video|AI model|UGC)\b/gi, '').replace(/^LY\s*\|?\s*/i, '').replace(/\s*-\s*Copy( \d+)?/gi, '').replace(/^Trybe\s+/i, '').replace(/\s*\|\s*/g, ' · ').trim();
}
function adTiles(list, key) {
  groups[key] = list;
  return `<div class="bfp-grid">${list.map((a, k) => `<button class="bfp-ad" data-g="${esc(key)}" data-k="${k}" aria-label="Open ${esc(cleanName(a.name))}"><span class="none">${a.video ? 'Video' : 'Photo'}</span>
    <img loading="lazy" alt="" src="${esc(thumbOf(a))}"><span class="by">${esc(makerOf(a.name))}</span>${a.video ? '<span class="pl"></span>' : ''}<span class="lab">${esc(cleanName(a.name))}</span></button>`).join('')}</div>`;
}
/* An ad counts as ON when its own switch is on, even if its box or campaign is off; Meta's PAUSED means the ad itself is off. */
const adOn = a => a.status !== 'PAUSED' && !/ARCHIVED|DELETED|DISAPPROVED/.test(a.status || '');
function setBox(c, set, conf, mode) {
  const cm = new RegExp(P.meta.cm || '^$', 'i');
  const ads = c.ads.filter(a => a.set === set.id);
  const on = ads.filter(adOn);
  const paused = ads.filter(a => !adOn(a));
  const cmAds = mode === 'plain' ? [] : paused.filter(a => cm.test(a.name || ''));
  const unused = paused.filter(a => !cmAds.includes(a));
  if (mode === 'cm') {
    if (!cmAds.length) return '';
    return `<div class="bfp-set"><div class="hd"><b>${esc(conf.label || cleanName(set.name))}</b><span class="bfp-pill2 offp">On Mon Nov 30, 12am</span></div>${adTiles(cmAds, 'cm' + set.id)}</div>`;
  }
  const setOn = isOn(set.status);
  const cap = P.meta.cap || 50, after = on.length + cmAds.length;
  const pct = n => Math.min(100, Math.round(n / cap * 100));
  return `<div class="bfp-set"><div class="hd"><b>${esc(conf.label || cleanName(set.name))}</b><span class="bfp-pill2 ${setOn ? 'on' : 'offp'}">${setOn ? 'On' : 'Off'}</span></div>
    ${conf.who ? `<p class="who">${esc(conf.who)}</p>` : ''}
    <div class="dt">${set.start ? `Starts ${esc(dshort(set.start))}` : ''}${set.end ? ` · ends ${esc(dshort(set.end))}` : ''}${set.budget ? ` · ${money0(set.budget)}/day` : ''}</div>
    ${on.length || cmAds.length ? `<div class="bfp-cap"><div class="bar"><i style="width:${pct(on.length)}%;background:var(--g)"></i>${cmAds.length ? `<i style="width:${Math.max(0, pct(Math.min(after, cap)) - pct(on.length))}%;background:var(--p-cm)"></i>` : ''}</div>
      <span>${setOn ? `${on.length} ${on.length === 1 ? 'ad' : 'ads'} on` : `Box is off. ${on.length} ${on.length === 1 ? 'ad' : 'ads'} ready inside`} · Meta allows ${cap} per box${cmAds.length && setOn ? (after > cap ? `. ${esc(P.meta.over_note || `On Nov 30 we swap in Cyber Monday ads and keep it to Meta's ${cap}.`)}` : `. ${after} from Nov 30.`) : ''}</span></div>` : ''}
    ${on.length ? `<div class="bfp-grp">${setOn ? `<h4>On (${on.length})</h4>${adTiles(on, 'on' + set.id)}` : `<details><summary>Ready, box is off (${on.length})</summary>${adTiles(on, 'on' + set.id)}</details>`}</div>` : ''}
    ${cmAds.length ? `<div class="bfp-grp"><details><summary>Paused: switches on Nov 30 for Cyber Monday (${cmAds.length})</summary>${adTiles(cmAds, 'w' + set.id)}</details></div>` : ''}
    ${unused.length && !P.meta.hide_unused ? `<div class="bfp-grp"><details><summary>Paused: not used (${unused.length})</summary>${adTiles(unused, 'u' + set.id)}</details></div>` : ''}</div>`;
}
function campBox(c, sec) {
  const confs = sec.sets || [];
  const byId = Object.fromEntries(confs.map(x => [x.id, x]));
  let sets = confs.length ? confs.map(x => c.sets.find(s => s.id === x.id)).filter(Boolean) : c.sets.slice();
  if (sec.active_only) sets = sets.filter(s => isOn(s.status));
  const hidden = sec.active_only ? c.sets.length - sets.length : 0;
  const mode = sec.mode || 'full';
  if (P.meta.hide_unused && mode === 'plain') sets = sets.filter(s => c.ads.some(a => a.set === s.id && adOn(a)));
  const boxes = sets.map(s => setBox(c, s, byId[s.id] || { label: (sec.labels || {})[s.id] || cleanName(s.name), who: (sec.who || {})[s.id] }, mode)).join('');
  if (mode === 'cm') return boxes;
  if (!sets.length && P.meta.hide_unused) return '';
  const nm = (sec.camp_labels || {})[c.id] || c.name;
  return `<div class="bfp-camp"><h3>${esc(nm)}</h3>
    <div class="meta"><span>${isOn(c.status) ? 'On' : 'Off'}</span>${c.budget ? `<span>${money0(c.budget)}/day now</span>` : ''}${(sec.notes || {})[c.id] ? `<span>${esc(sec.notes[c.id])}</span>` : ''}</div>
    ${boxes}</div>`;
}
function metaHtml() {
  if (!M) return '<div class="bfp-load">Loading the live setup from Meta…</div>';
  if (M.error) return `<div class="bfp-load">${esc(M.error)}</div>`;
  groups = {};
  const camp = id => M.campaigns.find(c => c.id === id);
  return (P.meta.sections || []).map((sec, i) => {
    const cs = (sec.campaigns || [sec.campaign]).map(camp).filter(Boolean);
    if (!cs.length) return '';
    const body = cs.map(c => campBox(c, sec)).join('');
    return `<details class="bfp-sec" id="bfpS${i}" ${sec.open ? 'open' : ''}><summary><b>${esc(sec.title)}</b>${sec.sub ? `<span>${esc(sec.sub)}</span>` : ''}</summary><div class="bfp-secb">${body}</div></details>`;
  }).join('') + `<p class="sm" style="margin:0">Read live from Meta ${esc(new Date(M.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}. Tap any ad to see it full size.</p>`;
}
async function loadMeta(root) {
  const ids = P.layout === 'v5' ? [...new Set([P.structure?.campaign, ...((P.ads?.sources || []).map(x => x.campaign))].filter(Boolean))] : [...new Set((P.meta.sections || []).flatMap(s => s.campaigns || [s.campaign]).filter(Boolean))];
  try {
    const r = await fetch(`${AH}/api/season-meta/${encodeURIComponent(P.yours || '')}?c=${ids.join(',')}`);
    const j = await r.json();
    M = r.ok ? j : { error: j.error || 'Could not load the live setup. Refresh in a minute.' };
  } catch { M = { error: 'Could not load the live setup. Check your connection and refresh.' }; }
  if (P.layout === 'v5') return wireV5(root);
  const el = root.querySelector('#bfpMeta'); if (!el) return;
  el.innerHTML = metaHtml();
  el.querySelectorAll('.bfp-ad img').forEach(im => { im.onerror = () => im.remove(); });
  el.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { flat = (groups[b.dataset.g] || []).map(a => ({ id: a.id, label: cleanName(a.name), kind: a.video ? 'video' : 'still', thumb: a.thumb, grp: { title: makerOf(a.name) } })); openAd(+b.dataset.k); });
}

/* ---- the full-size viewer: one scrim, a sheet from the bottom, one video at a time ---- */
function scrim() {
  let s = document.getElementById('bfpScrim');
  if (!s) {
    s = document.createElement('div'); s.id = 'bfpScrim'; s.className = 'bfp-scrim'; s.hidden = true;
    s.innerHTML = '<div class="bfp-sheet" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(s);
    s.addEventListener('click', e => { if (e.target === s) close(); });
    document.addEventListener('keydown', e => {
      if (s.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') openAd(cur + 1);
      if (e.key === 'ArrowLeft') openAd(cur - 1);
    });
  }
  return s;
}
function close() { const s = scrim(); s.hidden = true; s.firstElementChild.innerHTML = ''; cur = -1; document.body.style.overflow = ''; }
function show(html) { const s = scrim(); s.firstElementChild.innerHTML = html; s.hidden = false; document.body.style.overflow = 'hidden'; return s.firstElementChild; }

async function openAd(i) {
  if (i < 0 || i >= flat.length) return;
  cur = i;
  const a = flat[i], thumb = thumbOf(a);
  const row = `<div class="bfp-row"><button class="bfp-btn" data-mv="-1" ${i ? '' : 'disabled'} aria-label="Previous ad">&#8249;</button>
    <div class="nm">${esc(a.label || (a.kind === 'video' ? 'Video' : 'Photo'))}<small>${esc(a.grp.title)} · ${i + 1} of ${flat.length}</small></div>
    <button class="bfp-btn" data-mv="1" ${i < flat.length - 1 ? '' : 'disabled'} aria-label="Next ad">&#8250;</button><button class="bfp-btn" data-x>Close</button></div>`;
  const wire = sh => {
    sh.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => openAd(cur + +b.dataset.mv));
    sh.querySelector('[data-x]').onclick = close;
    let x0 = null; const m = sh.querySelector('.bfp-media');
    m.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    m.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 60) openAd(cur + (dx < 0 ? 1 : -1)); x0 = null; });
  };
  if (a.kind !== 'video') { wire(show(`<div class="bfp-media">${thumb ? `<img src="${esc(thumb)}" alt="">` : '<div class="msg">No picture yet.</div>'}</div>${row}`)); return; }
  wire(show(`<div class="bfp-media">${thumb ? `<img src="${esc(thumb)}" alt="" style="opacity:.45">` : ''}<div class="msg" style="position:absolute">Loading the video…</div></div>${row}`));
  let html;
  try {
    const r = await fetch(`${AH}/api/ad-video?ad=${encodeURIComponent(a.id)}&yours=${encodeURIComponent(P.yours || '')}`);
    const j = await r.json();
    if (j.src) html = `<video src="${esc(j.src)}" controls autoplay playsinline ${thumb ? `poster="${esc(thumb)}"` : ''}></video>`;
    else if (j.preview) html = `<iframe src="${esc(j.preview)}" title="Ad preview" allow="autoplay; encrypted-media"></iframe>`;
    else html = `${thumb ? `<img src="${esc(thumb)}" alt="">` : ''}<div class="msg">This one cannot play here yet. Ask us and we will send the file.</div>`;
  } catch { html = `<div class="msg">Could not load this video. Check your connection and tap it again.</div>`; }
  if (cur !== i) return;
  wire(show(`<div class="bfp-media">${html}</div>${row}`));
}

function redrawAds(root) {
  const s = root.querySelector('#bfpAds'); s.outerHTML = ads(); bindAds(root);
}
function bindAds(root) {
  const s = root.querySelector('#bfpAds'); if (!s) return;
  s.querySelectorAll('.bfp-ad img').forEach(im => { im.onerror = () => im.remove(); });
  s.querySelectorAll('[data-ad]').forEach(b => b.onclick = () => openAd(+b.dataset.ad));
  s.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; sub = null; redrawAds(root); });
  s.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { sub = b.dataset.sub; redrawAds(root); });
}
function goAds(root, t) {
  if (t) { tab = t; sub = null; redrawAds(root); }
  root.querySelector('#bfpAds').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function bind(root) {
  root.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => { const t = root.querySelector(b.dataset.jump); if (!t) return; if (t.tagName === 'DETAILS') t.open = true; t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  if (P.layout === 'v5') root.querySelectorAll('[data-day]').forEach(b => b.onclick = () => openDay(b.dataset.day));
  root.querySelectorAll('tr[data-bfgo]').forEach(r => r.onclick = () => goAds(root, r.dataset.bfgo));
  root.querySelectorAll('[data-camp]').forEach(b => b.onclick = () => {
    const r = b.dataset.camp && root.querySelector('#bfpC-' + b.dataset.camp);
    if (!r) return;
    root.querySelectorAll('tr.hl').forEach(x => x.classList.remove('hl'));
    r.classList.add('hl');
    r.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  bindAds(root);
}

/** The block's HTML; call mount() after it is in the page. */
function html(plan) {
  if (!plan) return '';
  P = plan; css();
  if (P.layout === 'v5') return `<div class="bfp" id="bfp">${top()}${planBox()}${calGrid()}<section id="bfpStructS"><h2>2. How it is set up</h2>${P.structure?.sub ? `<p class="sm">${esc(P.structure.sub)}</p>` : ''}<div id="bfpStruct">${P.ads?.mode === 'fixed' ? structFixed() : structV5()}</div></section><section id="bfpAdsS"><h2>3. The ads</h2><p class="sm">${esc(P.ads?.intro || 'Read live from Meta. Tap any ad to see it full size; videos play.')}</p><div id="bfpAdsV5" style="display:grid;gap:12px">${P.ads?.mode === 'fixed' ? adsFixed() : P.ads?.mode === 'by_set' ? adsBySet() : adsV5()}</div></section>${goalBox()}${ladderList()}${asks()}</div>`;
  if (P.meta) return `<div class="bfp" id="bfp">${top()}${moments()}<section id="bfpSetup" style="display:grid;gap:12px"><h2>How the ads are set up</h2><div id="bfpMeta" style="display:grid;gap:12px">${metaHtml()}</div></section>${goalBox()}${ladderList()}${asks()}</div>`;
  return `<div class="bfp" id="bfp">${top()}${asks()}${calendar()}${campaigns()}${kpi()}${ads()}</div>`;
}
function mount() { const r = document.getElementById('bfp'); if (!r) return; bind(r); if (P.ads?.mode === 'fixed') return wireV5(r); if (P.meta) loadMeta(r); }
window.BfPlan = { html, mount };
})();
