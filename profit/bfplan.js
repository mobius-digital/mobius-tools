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
  .bfp-load{padding:20px;text-align:center;color:var(--muted);font-size:14px}
  `;
  document.head.appendChild(st);
}

const thumbOf = a => a.thumb || (P.yours ? `${AH}/api/your-ads/${P.yours}/thumb?ad=${a.id}` : '');
const tabsOf = () => [...new Set((P.groups || []).map(g => g.tab || 'Ads'))];

function top() {
  return `<div class="bfp-top"><h1>${esc(P.title || 'Black Friday: the plan and the ads')}</h1>${P.lede ? `<p>${esc(P.lede)}</p>` : ''}</div>
    <nav class="bfp-jump">${P.asks?.length ? '<button type="button" data-jump="#bfpAsk">What we need</button>' : ''}${P.meta ? (P.meta.sections || []).map((x, i) => `<button type="button" data-jump="#bfpS${i}">${esc(x.nav || x.title)}</button>`).join('') + '<button type="button" data-jump="#bfpKpi">Budget + MER</button>' : `<button type="button" data-jump="#bfpCal">Calendar</button><button type="button" data-jump="#bfpCamp">Campaigns</button><button type="button" data-jump="#bfpKpi">Budget + MER</button><button type="button" data-jump="#bfpAds">The ads</button>`}</nav>`;
}

function asks() {
  if (!P.asks?.length) return '';
  return `<section id="bfpAsk"><h2>What we need from you</h2>${P.asks.map(a => `<div class="bfp-ask"><p class="q">${esc(a.q)}</p>
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
    ${on.length || cmAds.length ? `<div class="bfp-cap"><div class="bar"><i style="width:${pct(on.length)}%;background:var(--g)"></i>${cmAds.length ? `<i style="width:${Math.max(0, pct(after) - pct(on.length))}%;background:var(--p-cm)"></i>` : ''}</div>
      <span>${setOn ? `${on.length} ${on.length === 1 ? 'ad' : 'ads'} on` : `Box is off. ${on.length} ${on.length === 1 ? 'ad' : 'ads'} ready inside`}${cmAds.length && setOn ? `, ${after} from Nov 30` : ''} · Meta allows ${cap} per box${setOn && after > cap ? ` · <span class="over">${after - cap} over on Nov 30</span>` : ''}</span></div>` : ''}
    ${on.length ? `<div class="bfp-grp">${setOn ? `<h4>On (${on.length})</h4>${adTiles(on, 'on' + set.id)}` : `<details><summary>Ready, box is off (${on.length})</summary>${adTiles(on, 'on' + set.id)}</details>`}</div>` : ''}
    ${cmAds.length ? `<div class="bfp-grp"><details><summary>Paused: switches on Nov 30 for Cyber Monday (${cmAds.length})</summary>${adTiles(cmAds, 'w' + set.id)}</details></div>` : ''}
    ${unused.length ? `<div class="bfp-grp"><details><summary>Paused: not used (${unused.length})</summary>${adTiles(unused, 'u' + set.id)}</details></div>` : ''}</div>`;
}
function campBox(c, sec) {
  const confs = sec.sets || [];
  const byId = Object.fromEntries(confs.map(x => [x.id, x]));
  let sets = confs.length ? confs.map(x => c.sets.find(s => s.id === x.id)).filter(Boolean) : c.sets.slice();
  if (sec.active_only) sets = sets.filter(s => isOn(s.status));
  const hidden = sec.active_only ? c.sets.length - sets.length : 0;
  const mode = sec.mode || 'full';
  const boxes = sets.map(s => setBox(c, s, byId[s.id] || { label: (sec.labels || {})[s.id] || cleanName(s.name), who: (sec.who || {})[s.id] }, mode)).join('');
  if (mode === 'cm') return boxes;
  const nm = (sec.camp_labels || {})[c.id] || c.name;
  return `<div class="bfp-camp"><h3>${esc(nm)}</h3>
    <div class="meta"><span>${isOn(c.status) ? 'On' : 'Off'}</span>${c.budget ? `<span>${money0(c.budget)}/day now</span>` : ''}${(sec.notes || {})[c.id] ? `<span>${esc(sec.notes[c.id])}</span>` : ''}</div>
    ${boxes}${hidden ? `<p class="sm" style="margin:0">${hidden} older boxes in this campaign are off and not shown.</p>` : ''}</div>`;
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
  const ids = [...new Set((P.meta.sections || []).flatMap(s => s.campaigns || [s.campaign]).filter(Boolean))];
  try {
    const r = await fetch(`${AH}/api/season-meta/${encodeURIComponent(P.yours || '')}?c=${ids.join(',')}`);
    const j = await r.json();
    M = r.ok ? j : { error: j.error || 'Could not load the live setup. Refresh in a minute.' };
  } catch { M = { error: 'Could not load the live setup. Check your connection and refresh.' }; }
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
  if (P.meta) return `<div class="bfp" id="bfp">${top()}${asks()}<div id="bfpMeta" style="display:grid;gap:12px">${metaHtml()}</div>${kpi()}</div>`;
  return `<div class="bfp" id="bfp">${top()}${asks()}${calendar()}${campaigns()}${kpi()}${ads()}</div>`;
}
function mount() { const r = document.getElementById('bfp'); if (!r) return; bind(r); if (P.meta) loadMeta(r); }
window.BfPlan = { html, mount };
})();
