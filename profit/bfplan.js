/* Locus - the Black Friday ads block on the client's season link (?season=<token>).
 * 2026-11-19, Ice & Gold first. Cole: "she can see the Black Friday ads and the structure... a calendar
 * view... the budgets, the scaling procedure... the campaign, the ad sets, why... very visual, not text
 * heavy... and all the ads, where she can actually view the videos and statics close up."
 *
 * Four parts, phone first: the calendar strip (tap a day, a sheet rises from the bottom), the scaling
 * ladder, the structure (one campaign, its boxes, one-line why), and the ad gallery by phase (tap an ad,
 * it opens full size; videos play). The plan is DATA (answer `bf_plan`, served by seasonPublic with each
 * ad's cover and the brand's Your ads token); this file only draws it. Client words only: boxes, not ad
 * sets; no internal names. Videos play through account-health /api/ad-video?yours=<token>, the same
 * route and rule as the client's Your ads page.
 */
(function () {
'use strict';
const AH = 'https://mobius-account-health.mobius-digital.workers.dev';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => n == null ? '' : '$' + Math.round(n).toLocaleString('en-US');
const dt = iso => new Date(iso + 'T12:00:00Z');
const dow = iso => dt(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
const md = iso => dt(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const long = iso => dt(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
let P = null, TODAY = '', flat = [], cur = -1;

function css() {
  if (document.getElementById('bfpCss')) return;
  const st = document.createElement('style');
  st.id = 'bfpCss';
  st.textContent = `
  .bfp,.bfp-scrim{--p-eb:#B7791F;--p-bf:#1F2937;--p-cm:#2563EB;--p-norm:#64748B;--p-gift:#B4232C}
  .bfp{display:flex;flex-direction:column;gap:16px;margin:4px 0 8px}
  @media (prefers-color-scheme:dark){.bfp,.bfp-scrim{--p-eb:#E0A43A;--p-bf:#E5E7EB;--p-cm:#6EA8FF;--p-norm:#94A3B8;--p-gift:#F07A82}}
  .bfp *{box-sizing:border-box}
  .bfp-hero{background:#0F1A22;color:#EEF3F6;border-radius:16px;padding:20px 18px}
  .bfp-hero h2{font-family:var(--serif);font-weight:400;font-size:clamp(28px,7vw,38px);line-height:1.05;margin:0 0 6px}
  .bfp-hero p{margin:0;color:#9AACB8;font-size:14.5px;max-width:60ch}
  .bfp-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:16px}
  .bfp-stats div{background:rgba(255,255,255,.07);border-radius:12px;padding:10px 10px 9px}
  .bfp-stats b{display:block;font-size:20px;line-height:1.15;color:#fff}
  .bfp-stats span{font-size:12px;color:#9AACB8}
  .bfp-card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px}
  .bfp-card h3{font-size:17px;margin:0 0 2px}
  .bfp-card .sub{color:var(--muted);font-size:13.5px;margin:0 0 12px}
  .bfp-legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px;color:var(--ink-2);margin:0 0 10px}
  .bfp-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
  .bfp-cal{display:flex;gap:6px;overflow-x:auto;scroll-snap-type:x proximity;padding:2px 2px 10px;margin:0 -2px;-webkit-overflow-scrolling:touch}
  .bfp-day{flex:0 0 64px;scroll-snap-align:start;border:1px solid var(--line);background:var(--surface);border-radius:12px;padding:8px 6px 7px;display:flex;flex-direction:column;align-items:center;gap:4px;font:inherit;color:inherit;cursor:pointer;position:relative}
  .bfp-day.today{outline:2px solid var(--brand);outline-offset:1px}
  .bfp-day .w{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
  .bfp-day .n{font-size:17px;font-weight:700;line-height:1}
  .bfp-day .bar{width:26px;height:74px;border-radius:6px;background:var(--line);display:flex;align-items:flex-end;overflow:hidden}
  .bfp-day .bar i{display:block;width:100%;border-radius:6px 6px 0 0}
  .bfp-day .amt{font-size:12px;font-weight:700}
  .bfp-day .band{position:absolute;left:0;right:0;top:0;height:4px;border-radius:12px 12px 0 0}
  .bfp-day .sw{width:7px;height:7px;border-radius:50%;background:var(--brand-ink,#14608C)}
  .bfp-day .sw.none{background:transparent}
  .bfp-phases{display:grid;gap:8px;margin-top:6px}
  .bfp-ph{display:grid;grid-template-columns:6px minmax(0,1fr);gap:10px;align-items:stretch}
  .bfp-ph>i{border-radius:3px}
  .bfp-ph .t{font-weight:700;font-size:14px}
  .bfp-ph .t small{font-weight:500;color:var(--muted);margin-left:6px;font-size:12.5px}
  .bfp-ph .o{font-size:13.5px;color:var(--ink-2)}
  .bfp-ladder{display:grid;gap:8px}
  .bfp-rung{display:grid;grid-template-columns:86px minmax(0,1fr);border-radius:12px;overflow:hidden;border:1px solid var(--line)}
  .bfp-rung .k{display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;padding:12px 6px;text-align:center;line-height:1.15}
  .bfp-rung .v{padding:10px 12px;font-size:14px;display:flex;flex-direction:column;justify-content:center}
  .bfp-rung .v b{font-size:15px}
  .bfp-rung.up .k{background:var(--good-bg);color:var(--good)}
  .bfp-rung.hold .k{background:var(--unk-bg,#EDF1F4);color:var(--ink-2)}
  .bfp-rung.down .k{background:var(--bad-bg);color:var(--bad)}
  .bfp-checks{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
  .bfp-checks span{font-size:12.5px;font-weight:600;border:1px solid var(--line-strong);border-radius:999px;padding:4px 10px}
  .bfp-goal{margin-top:10px;font-size:13.5px;color:var(--ink-2)}
  .bfp-tree{display:flex;flex-direction:column;align-items:stretch}
  .bfp-camp{background:#0F1A22;color:#fff;border-radius:14px;padding:14px;text-align:center}
  .bfp-camp b{font-size:16px;display:block}
  .bfp-camp span{font-size:13px;color:#9AACB8}
  .bfp-stem{width:2px;height:16px;background:var(--line-strong);margin:0 auto}
  .bfp-boxes{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;position:relative}
  .bfp-box{border:1.5px solid var(--line-strong);border-radius:14px;padding:12px 14px;background:var(--surface)}
  .bfp-box .h{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
  .bfp-box .h b{font-size:15px}
  .bfp-box .h span{font-size:12px;color:var(--muted);white-space:nowrap}
  .bfp-box .who{font-size:13px;color:var(--ink-2);margin:2px 0 8px}
  .bfp-box .cnt{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
  .bfp-box .cnt span{font-size:12px;font-weight:700;border-radius:999px;padding:3px 9px;background:var(--good-bg);color:var(--good)}
  .bfp-box .cnt span.wait{background:var(--brand-soft);color:var(--brand-ink)}
  .bfp-box .why{font-size:13.5px;border-top:1px dashed var(--line);padding-top:8px}
  .bfp-box .why::before{content:"Why: ";font-weight:700}
  .bfp-also{margin-top:12px;display:grid;gap:6px}
  .bfp-also div{display:grid;grid-template-columns:minmax(0,1fr);gap:1px;font-size:14px;border:1px solid var(--line);border-radius:10px;padding:8px 12px}
  .bfp-also span{color:var(--muted);font-size:12.5px}
  .bfp-also h5{font-size:13px;margin:0;color:var(--muted);font-weight:600}
  .bfp-why{display:grid;gap:8px;margin:0;padding:0;list-style:none}
  .bfp-why li{display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;align-items:start;font-size:14px}
  .bfp-why li i{width:28px;height:28px;border-radius:50%;background:var(--brand-soft);color:var(--brand-ink);font-style:normal;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:13px}
  .bfp-why li b{display:block}
  .bfp-tabs{display:flex;gap:6px;overflow-x:auto;margin:0 0 12px;padding-bottom:2px}
  .bfp-tabs button{flex:0 0 auto;font:inherit;font-size:13.5px;font-weight:600;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);border-radius:999px;padding:7px 14px;cursor:pointer}
  .bfp-tabs button[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
  .bfp-grp{margin:0 0 18px}
  .bfp-grp h4{font-size:14.5px;margin:0 0 2px}
  .bfp-grp p{font-size:13px;color:var(--muted);margin:0 0 8px}
  .bfp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
  @media (min-width:640px){.bfp-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}}
  .bfp-ad{position:relative;aspect-ratio:4/5;border:0;padding:0;border-radius:10px;overflow:hidden;background:var(--brand-soft);cursor:pointer;display:block;width:100%}
  .bfp-ad img{width:100%;height:100%;object-fit:cover;display:block;position:relative;z-index:1}
  .bfp-ad .lab,.bfp-ad .pl,.bfp-ad .wait{z-index:2}
  .bfp-ad .lab{position:absolute;left:0;right:0;bottom:0;padding:16px 6px 5px;font-size:11px;line-height:1.2;color:#fff;text-align:left;background:linear-gradient(transparent,rgba(0,0,0,.72));font-weight:600}
  .bfp-ad .pl{position:absolute;right:6px;top:6px;width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center}
  .bfp-ad .pl::after{content:"";border-left:9px solid #fff;border-top:6px solid transparent;border-bottom:6px solid transparent;margin-left:2px}
  .bfp-ad .wait{position:absolute;left:6px;top:6px;font-size:10.5px;font-weight:700;border-radius:999px;padding:2px 7px;background:rgba(0,0,0,.6);color:#fff}
  .bfp-ad .none{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted);padding:6px;text-align:center}
  .bfp-scrim{position:fixed;inset:0;background:rgba(8,12,16,.86);z-index:200;display:flex;align-items:flex-end;justify-content:center}
  .bfp-scrim[hidden]{display:none}
  .bfp-sheet{background:var(--surface);color:var(--ink);width:100%;max-width:560px;max-height:94vh;border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden;animation:bfpUp .22s ease-out;padding-bottom:env(safe-area-inset-bottom,0px)}
  @media (min-width:700px){.bfp-scrim{align-items:center}.bfp-sheet{border-radius:18px}}
  @keyframes bfpUp{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}
  .bfp-sheet .grab{width:40px;height:4px;border-radius:2px;background:var(--line-strong);margin:8px auto 0;flex:0 0 auto}
  .bfp-media{background:#000;display:flex;align-items:center;justify-content:center;min-height:200px;flex:1 1 auto;overflow:hidden}
  .bfp-media video,.bfp-media img{display:block;max-width:100%;max-height:72vh;width:100%;object-fit:contain}
  .bfp-media iframe{width:100%;height:72vh;border:0;background:#fff}
  .bfp-media .msg{color:#cbd5e1;font-size:13.5px;padding:30px 16px;text-align:center}
  .bfp-row{display:flex;gap:8px;align-items:center;padding:10px 12px}
  .bfp-row .nm{flex:1;min-width:0;font-weight:600;font-size:14px}
  .bfp-row .nm small{display:block;color:var(--muted);font-weight:500;font-size:12px}
  .bfp-btn{font:inherit;font-size:13.5px;font-weight:600;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);border-radius:10px;padding:8px 12px;cursor:pointer;min-width:42px}
  .bfp-dsheet{padding:6px 18px 18px;overflow:auto}
  .bfp-dsheet h4{font-size:19px;margin:6px 0 2px}
  .bfp-dsheet .bfp-pill{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:3px 10px;color:var(--surface);margin:4px 0 10px}
  .bfp-dsheet .off{font-size:15px;font-weight:600;margin:0 0 12px}
  .bfp-dsheet .bud{display:grid;gap:6px;margin:0 0 12px}
  .bfp-dsheet .bud div{display:flex;justify-content:space-between;font-size:14px;border-bottom:1px solid var(--line);padding:5px 0}
  .bfp-dsheet .bud div.tot{font-weight:800;border-bottom:0}
  .bfp-dsheet .swl{display:grid;gap:6px;margin:0;padding:0;list-style:none}
  .bfp-dsheet .swl li{font-size:14px;display:grid;grid-template-columns:70px minmax(0,1fr);gap:8px}
  .bfp-dsheet .swl li b{font-size:12.5px;color:var(--brand-ink)}
  `;
  document.head.appendChild(st);
}

const phaseOf = k => (P.phases || []).find(p => p.key === k) || { name: '', color: 'var(--p-norm)' };
const colorOf = k => phaseOf(k).color || 'var(--p-norm)';
const dayTotal = d => (d.budgets || []).reduce((s, b) => s + (+b.amount || 0), 0);

function hero() {
  const days = P.days || [];
  const top = Math.max(0, ...days.map(dayTotal));
  const nAds = (P.groups || []).reduce((s, g) => s + g.ads.length, 0);
  const st = P.stats || [];
  return `<div class="bfp-hero"><h2>${esc(P.title || 'Black Friday ads')}</h2>${P.lede ? `<p>${esc(P.lede)}</p>` : ''}
    <div class="bfp-stats">${(st.length ? st : [{ v: md(P.start || days[0]?.d), l: 'ads start' }, { v: money(top), l: 'biggest day' }, { v: String(nAds), l: 'ads ready' }])
      .map(s => `<div><b>${esc(s.v)}</b><span>${esc(s.l)}</span></div>`).join('')}</div></div>`;
}

function calendar() {
  const days = P.days || [];
  const top = Math.max(1, ...days.map(dayTotal));
  return `<section class="bfp-card"><h3>The calendar</h3><p class="sub">Daily ad budget, start to finish. Tap a day for what switches on or off.</p>
    <div class="bfp-legend">${(P.phases || []).map(p => `<span><i style="background:${p.color}"></i>${esc(p.name)}</span>`).join('')}<span><i style="background:var(--brand-ink,#14608C);border-radius:50%"></i>Something switches</span></div>
    <div class="bfp-cal" id="bfpCal">${days.map((d, i) => {
      const t = dayTotal(d);
      return `<button class="bfp-day${d.d === TODAY ? ' today' : ''}" data-day="${i}" aria-label="${esc(long(d.d))}, ${money(t)} a day">
        <span class="band" style="background:${colorOf(d.phase)}"></span>
        <span class="w">${esc(dow(d.d))}</span><span class="n">${dt(d.d).getUTCDate()}</span>
        <span class="bar"><i style="height:${Math.round(t / top * 100)}%;background:${colorOf(d.phase)}"></i></span>
        <span class="amt">${money(t)}</span><span class="sw${(d.switches || []).length ? '' : ' none'}"></span></button>`;
    }).join('')}</div>
    <div class="bfp-phases">${(P.phases || []).map(p => `<div class="bfp-ph"><i style="background:${p.color}"></i><div><div class="t">${esc(p.name)}<small>${esc(p.when || '')}</small></div>${p.offer ? `<div class="o">${esc(p.offer)}</div>` : ''}</div></div>`).join('')}</div>
  </section>`;
}

function ladder() {
  const L = P.ladder;
  if (!L) return '';
  return `<section class="bfp-card"><h3>${esc(L.title || 'When we scale, when we pull back')}</h3><p class="sub">${esc(L.sub || '')}</p>
    <div class="bfp-ladder">${(L.rungs || []).map(r => `<div class="bfp-rung ${esc(r.tone || 'hold')}"><div class="k">${esc(r.line)}</div><div class="v"><b>${esc(r.action)}</b>${r.note ? `<span>${esc(r.note)}</span>` : ''}</div></div>`).join('')}</div>
    ${L.checks?.length ? `<div class="bfp-checks">${L.checks.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
    ${L.goal ? `<div class="bfp-goal">${esc(L.goal)}</div>` : ''}</section>`;
}

function structure() {
  const S = P.structure;
  if (!S) return '';
  return `<section class="bfp-card"><h3>${esc(S.title || 'How it is built')}</h3><p class="sub">${esc(S.sub || '')}</p>
    <div class="bfp-tree"><div class="bfp-camp"><b>${esc(S.campaign)}</b><span>${esc(S.campaign_note || '')}</span></div><div class="bfp-stem"></div>
    <div class="bfp-boxes">${(S.boxes || []).map(b => `<div class="bfp-box"><div class="h"><b>${esc(b.name)}</b><span>${esc(b.when || '')}</span></div>
      <div class="who">${esc(b.who || '')}</div><div class="cnt">${(b.counts || []).map(c => `<span class="${c.wait ? 'wait' : ''}">${esc(c.text)}</span>`).join('')}</div>
      ${b.why ? `<div class="why">${esc(b.why)}</div>` : ''}</div>`).join('')}</div></div>
    ${S.also?.length ? `<div class="bfp-also"><h5>Also running</h5>${S.also.map(a => `<div><b>${esc(a.name)}</b><span>${esc(a.note)}</span></div>`).join('')}</div>` : ''}
  </section>
  ${P.why?.length ? `<section class="bfp-card"><h3>Why we built it this way</h3><ul class="bfp-why" style="margin-top:10px">${P.why.map((w, i) => `<li><i>${i + 1}</i><div><b>${esc(w.what)}</b>${esc(w.why)}</div></li>`).join('')}</ul></section>` : ''}`;
}

let tab = null;
function gallery() {
  const G = P.groups || [];
  if (!G.length) return '';
  const tabs = [...new Set(G.map(g => g.tab || 'Ads'))];
  if (!tabs.includes(tab)) tab = tabs[0];
  flat = G.filter(g => (g.tab || 'Ads') === tab).flatMap(g => g.ads.map(a => ({ ...a, grp: g })));
  let k = 0;
  return `<section class="bfp-card" id="bfpGal"><h3>Every ad</h3><p class="sub">Tap any ad to see it full size. Videos play with sound.</p>
    <div class="bfp-tabs">${tabs.map(t => `<button data-tab="${esc(t)}" aria-pressed="${t === tab}">${esc(t)} (${G.filter(g => (g.tab || 'Ads') === t).reduce((s, g) => s + g.ads.length, 0)})</button>`).join('')}</div>
    ${G.filter(g => (g.tab || 'Ads') === tab).map(g => `<div class="bfp-grp"><h4>${esc(g.title)} <span style="color:var(--muted);font-weight:500">(${g.ads.length})</span></h4>${g.sub ? `<p>${esc(g.sub)}</p>` : ''}
      <div class="bfp-grid">${g.ads.map(a => `<button class="bfp-ad" data-ad="${k++}" aria-label="Open ${esc(a.label || 'ad')}">
        <span class="none">${a.kind === 'video' ? 'Video' : 'Photo'}</span>
        <img loading="lazy" alt="" src="${esc(a.thumb || (P.yours ? `${AH}/api/your-ads/${P.yours}/thumb?ad=${a.id}` : ''))}">
        ${a.kind === 'video' ? '<span class="pl"></span>' : ''}${g.waiting ? `<span class="wait">${esc(g.waiting)}</span>` : ''}
        ${a.label ? `<span class="lab">${esc(a.label)}</span>` : ''}</button>`).join('')}</div></div>`).join('')}
  </section>`;
}

/* ---- sheets: one scrim, a sheet that rises from the bottom (centred on desktop) ---- */
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
      if (cur >= 0 && e.key === 'ArrowRight') openAd(cur + 1);
      if (cur >= 0 && e.key === 'ArrowLeft') openAd(cur - 1);
    });
  }
  return s;
}
function close() {
  const s = scrim(); s.hidden = true; s.firstElementChild.innerHTML = ''; cur = -1; document.body.style.overflow = '';
}
function show(html) {
  const s = scrim(); s.firstElementChild.innerHTML = '<div class="grab"></div>' + html; s.hidden = false; document.body.style.overflow = 'hidden';
  return s.firstElementChild;
}

function openDay(i) {
  const d = P.days[i]; if (!d) return;
  const ph = phaseOf(d.phase);
  const sh = show(`<div class="bfp-dsheet"><h4>${esc(long(d.d))}</h4><span class="bfp-pill" style="background:${ph.color}">${esc(ph.name)}</span>
    ${d.offer || ph.offer ? `<p class="off">${esc(d.offer || ph.offer)}</p>` : ''}
    <div class="bud">${(d.budgets || []).map(b => `<div><span>${esc(b.name)}</span><span>${money(b.amount)} a day</span></div>`).join('')}<div class="tot"><span>Total</span><span>${money(dayTotal(d))} a day</span></div></div>
    ${d.note ? `<p style="font-size:13.5px;color:var(--ink-2);margin:0 0 10px">${esc(d.note)}</p>` : ''}
    ${(d.switches || []).length ? `<ul class="swl">${d.switches.map(w => `<li><b>${esc(w.t || '')}</b><span>${esc(w.text)}</span></li>`).join('')}</ul>` : ''}
    <div style="display:flex;justify-content:space-between;margin-top:16px;gap:8px"><button class="bfp-btn" data-dn="${i - 1}" ${i ? '' : 'disabled'}>Earlier</button><button class="bfp-btn" data-x>Close</button><button class="bfp-btn" data-dn="${i + 1}" ${i < P.days.length - 1 ? '' : 'disabled'}>Later</button></div></div>`);
  sh.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => openDay(+b.dataset.dn));
  sh.querySelector('[data-x]').onclick = close;
}

async function openAd(i) {
  if (i < 0 || i >= flat.length) return;
  cur = i;
  const a = flat[i];
  const thumb = a.thumb || (P.yours ? `${AH}/api/your-ads/${P.yours}/thumb?ad=${a.id}` : '');
  const row = `<div class="bfp-row"><button class="bfp-btn" data-mv="-1" ${i ? '' : 'disabled'} aria-label="Previous ad">&#8249;</button>
    <div class="nm">${esc(a.label || (a.kind === 'video' ? 'Video' : 'Photo'))}<small>${esc(a.grp.title)}${a.grp.waiting ? ' · ' + esc(a.grp.waiting) : ''} · ${i + 1} of ${flat.length}</small></div>
    <button class="bfp-btn" data-mv="1" ${i < flat.length - 1 ? '' : 'disabled'} aria-label="Next ad">&#8250;</button><button class="bfp-btn" data-x>Close</button></div>`;
  const wire = sh => {
    sh.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => openAd(cur + +b.dataset.mv));
    sh.querySelector('[data-x]').onclick = close;
    let x0 = null; const m = sh.querySelector('.bfp-media');
    if (m) { m.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
      m.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 60) openAd(cur + (dx < 0 ? 1 : -1)); x0 = null; }); }
  };
  if (a.kind !== 'video') {
    wire(show(`<div class="bfp-media">${thumb ? `<img src="${esc(thumb)}" alt="">` : '<div class="msg">No picture yet.</div>'}</div>${row}`));
    return;
  }
  wire(show(`<div class="bfp-media">${thumb ? `<img src="${esc(thumb)}" alt="" style="opacity:.45">` : ''}<div class="msg" style="position:absolute">Loading the video…</div></div>${row}`));
  let html;
  try {
    const r = await fetch(`${AH}/api/ad-video?ad=${encodeURIComponent(a.id)}&yours=${encodeURIComponent(P.yours || '')}`);
    const j = await r.json();
    if (j.src) html = `<video src="${esc(j.src)}" controls autoplay playsinline ${thumb ? `poster="${esc(thumb)}"` : ''}></video>`;
    else if (j.preview) html = `<iframe src="${esc(j.preview)}" title="Ad preview" allow="autoplay; encrypted-media"></iframe>`;
    else html = `${thumb ? `<img src="${esc(thumb)}" alt="">` : ''}<div class="msg">This one cannot play here yet. Ask us and we will send the file.</div>`;
  } catch { html = `<div class="msg">Could not load this video. Check your connection and tap it again.</div>`; }
  if (cur !== i) return;   // they moved on while it loaded
  wire(show(`<div class="bfp-media">${html}</div>${row}`));
}

function bind(root) {
  root.querySelectorAll('[data-day]').forEach(b => b.onclick = () => openDay(+b.dataset.day));
  root.querySelectorAll('.bfp-ad img').forEach(im => { im.onerror = () => im.remove(); });
  root.querySelectorAll('[data-ad]').forEach(b => b.onclick = () => openAd(+b.dataset.ad));
  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
    tab = b.dataset.tab;
    const g = root.querySelector('#bfpGal'); g.outerHTML = gallery(); bind(root.querySelector('#bfpGal').parentElement);
  });
  const cal = root.querySelector('#bfpCal'), t = cal && cal.querySelector('.today');
  if (t && !cal.dataset.scrolled) { cal.dataset.scrolled = 1; cal.scrollLeft = Math.max(0, t.offsetLeft - 8); }
}

/** The block's HTML; call mount() after it is in the page. */
function html(plan, today) {
  if (!plan) return '';
  P = plan; TODAY = today || '';
  css();
  return `<div class="bfp" id="bfp">${hero()}${calendar()}${ladder()}${structure()}${gallery()}</div>`;
}
function mount() { const r = document.getElementById('bfp'); if (r) bind(r); }
window.BfPlan = { html, mount };
})();
