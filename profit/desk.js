/* THE DAILY DESK (2026-10-09, docs/handoffs/locus-structure-audit-step1.md, signed off by Cole).
 * Four screens in their own closure, drawn with the v2 building blocks (window.V2UI):
 *   Home > Yesterday   "was yesterday a bad day, for every brand, and why"   GET /api/hub/yesterday + account-health /api/market
 *   Ads > Today        the media buyer's list (ad set first)                 GET /api/hub/today + /api/brand/tests-overview
 *   Season > The Plan  warplan: the sale planned step by step               GET /api/season/war (2026-10-09 rebuild)
 *   Season > Live      warlive: today against the plan, hour by hour        GET /api/season/war&live=1
 *                      (`war` still renders for old links: the mode comes from window.WAR_MODE or the in-page switch)
 *   Tools > Platform status   Pulse, the ad-platform outage monitor          mobius-ad-status worker /api/status (public)
 * The host (index.html) passes the same helpers it gives v2.js: window.DeskTab.render(tab, host, first).
 * Today (2026-10-13) can change an ad account: "Do it" runs the shared Meta write (nudge.js window.LxMetaWrite, dry run,
 * modal, write with expect, Undo). "Done" writes a manual line to the Change Log (which the Daily Brief's "What we did"
 * reads); "Not now" hides a row until tomorrow. 2026-10-26: Done and Not now are shared on the server with Ads > Buyer list
 * (account-health buyerlist.js, p_buyer_state); a Meta change on the object in the last 3 days hides the call too. */
(() => {
  let H = null;
  const $ = s => document.querySelector(s);
  const U = () => window.V2UI;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PULSE = 'https://mobius-ad-status.mobius-digital.workers.dev/api/status';
  const CACHE = new Map();
  const get = path => { const hit = CACHE.get(path); if (hit && Date.now() - hit.at < 5 * 60e3) return hit.p; const p = H.api(path); CACHE.set(path, { at: Date.now(), p }); p.catch(() => CACHE.delete(path)); return p; };
  const head = (tab, title) => H.pageHead(tab, title).replace(/<p class="ph-sub">[\s\S]*?<\/p>/, '');
  const shell = (tab, title, body) => `<div class="v2 dk">${head(tab, title)}${body}</div>`;
  const ymdL = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const wd = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
  const wdl = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
  const md = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const VNAME = { good: 'Good', normal: 'Normal', bad: 'Bad', vbad: 'Very bad', none: 'No data' };
  const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || '{}') || {}; localStorage.setItem(k, JSON.stringify(v)); } catch { return {}; } };
  const pickAct = (id, tab) => { H.S.act = id; try { localStorage.setItem('pf_act', id); } catch {} const cp = document.getElementById('clientPick'); if (cp) cp.value = id; H.show(tab || H.S.tab); };

  function css() {
    if (document.getElementById('dkcss')) return;
    const st = document.createElement('style'); st.id = 'dkcss';
    st.textContent = `
      .dk .dk-strip{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:11px 14px;border:1px solid var(--line);border-radius:10px;background:var(--surface);margin:0 0 14px}
      .dk .dk-dot,.dk-dot{width:12px;height:12px;border-radius:3px;display:inline-block;background:var(--surface-2);border:1px solid var(--line);vertical-align:-1px}
      .dk-dot.good{background:var(--good-bg);border-color:var(--good)}.dk-dot.bad{background:var(--bad-bg);border-color:var(--bad)}.dk-dot.vbad{background:var(--bad);border-color:var(--bad)}.dk-dot.none{background:transparent;border-style:dashed}
      .dk .dk-grid{display:grid;gap:5px;align-items:center;min-width:620px}
      .dk .dk-grid .h{font-size:10.5px;color:var(--muted);text-align:center;line-height:1.2}
      .dk .dk-grid .nm{font-weight:550;cursor:pointer}.dk .dk-grid .nm.on{color:var(--brand)}
      .dk .dk-cell{height:26px;border-radius:5px;border:1px solid var(--line);background:var(--surface-2);padding:0;cursor:pointer}
      .dk .dk-cell.good{background:var(--good-bg);border-color:var(--good)}.dk .dk-cell.bad{background:var(--bad-bg);border-color:var(--bad)}.dk .dk-cell.vbad{background:var(--bad);border-color:var(--bad)}.dk .dk-cell.none{background:transparent;border-style:dashed;cursor:default}
      .dk .dk-cell.sel{outline:2px solid var(--brand);outline-offset:1px}
      .dk .dk-links{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}
      .dk .dk-lk{border:1px solid var(--line);border-radius:8px;padding:9px 11px;display:flex;flex-direction:column;gap:2px}
      .dk .dk-lk .l{font-size:11.5px;color:var(--muted)}.dk .dk-lk .v{font-weight:600}
      .dk .dk-lk.worse{border-color:var(--bad)}.dk .dk-lk.better{border-color:var(--good)}
      .dk .dk-counts{margin:0 0 14px}
      /* REVIEW PASS B (2026-10-21): one row grid. Thumb slot (the verdict chip sits on it), name, reason, then a FIXED action
         column: primary, Done and "..." in the same x positions and widths on every row. Name and reason clamp to two lines,
         the anchor to one (full text on hover), so every row follows one height rule. */
      .dk .dk-row{display:grid;grid-template-columns:72px minmax(140px,1.2fr) minmax(0,1.6fr) 308px;gap:12px;align-items:start;padding:11px 0;border-top:1px solid var(--line)}
      @media (max-width:820px){.dk .dk-row{grid-template-columns:1fr}}
      .dk .dk-row .nm,.dk .dk-row .why{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
      .dk .dk-row .meta{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
      .dk .dk-rs{min-width:0;display:flex;flex-direction:column;gap:3px}
      .dk .dk-anc{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      /* THE KIT (2026-10-20): one primary button, Done, and a "..." menu for the rest (Ads Manager, Open in Locus, Something else, Not now). */
      .dk .dk-more{position:relative;display:inline-flex}
      .dk .dk-more-b{width:30px;padding:0!important;font-size:15px!important;letter-spacing:.5px}
      .dk .dk-menu{display:none;position:absolute;right:0;top:calc(100% + 4px);min-width:190px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg,10px);box-shadow:var(--sh-pop);padding:4px;z-index:30;flex-direction:column}
      .dk .dk-more.open .dk-menu{display:flex}
      .dk .dk-menu button,.dk .dk-menu a{display:block;width:100%;text-align:left;font:inherit;font-size:13px;color:var(--ink);background:none;border:0;border-radius:var(--r-sm,6px);padding:8px 10px;cursor:pointer;text-decoration:none}
      .dk .dk-menu button:hover,.dk .dk-menu a:hover{background:var(--line)}
      .dk .dk-k{font-size:10.5px;font-weight:700;letter-spacing:.05em;padding:3px 7px;border-radius:5px;text-align:center}
      .dk .dk-k.scale{background:var(--good-bg);color:var(--good)}.dk .dk-k.cut{background:var(--bad-bg);color:var(--bad)}.dk .dk-k.trim{background:var(--warn-bg);color:var(--warn)}.dk .dk-k.fix{background:var(--surface-2);color:var(--ink)}.dk .dk-k.refresh,.dk .dk-k.call{background:var(--brand-soft);color:var(--brand)}
      .dk .dk-row .nm{font-weight:600;word-break:break-word}.dk .dk-row .meta{font-size:12px;color:var(--muted)}.dk .dk-row .why{font-size:12.5px;color:var(--ink-2)}
      .dk .dk-acts{display:grid;grid-template-columns:156px 110px 30px;gap:6px;justify-content:end;align-items:center}
      .dk .dk-acts>.v2btn,.dk .dk-acts>.dk-gap{width:100%;min-width:0;justify-content:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
      .dk .dk-acts>.dk-gap{display:block;height:30px}
      @media (max-width:820px){.dk .dk-acts{justify-content:start;grid-template-columns:minmax(0,156px) minmax(0,110px) 30px}}
      .dk .dk-row.done{opacity:.45}
      .dk .dk-c1{display:flex;flex-direction:column;gap:8px;align-items:flex-start}
      .dk .dk-th{position:relative;width:72px;aspect-ratio:4/5;border-radius:8px;border:1px solid var(--line);background:var(--surface-2) center/cover no-repeat;padding:0;cursor:pointer;display:grid;place-items:center}
      .dk .dk-th.dk-th0{cursor:default;border-style:dashed;background:transparent}
      .dk .dk-th .dk-k{position:absolute;top:4px;left:4px;font-size:9px;line-height:1;padding:3px 5px;border-radius:4px;letter-spacing:.04em;box-shadow:0 0 0 1px var(--line)}
      .dk .dk-th .dk-k.scale{background:linear-gradient(var(--good-bg),var(--good-bg)),var(--surface)}.dk .dk-th .dk-k.cut{background:linear-gradient(var(--bad-bg),var(--bad-bg)),var(--surface)}.dk .dk-th .dk-k.trim{background:linear-gradient(var(--warn-bg),var(--warn-bg)),var(--surface)}
      .dk .dk-th .dk-k.fix,.dk .dk-th .dk-k.neg{background:var(--surface);color:var(--ink)}.dk .dk-th .dk-k.refresh,.dk .dk-th .dk-k.call{background:linear-gradient(var(--brand-soft),var(--brand-soft)),var(--surface)}
      .dk .dk-th:hover{border-color:var(--line-strong)}.dk .dk-th:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
      .dk .dk-th i{width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;display:grid;place-items:center;font-style:normal;font-size:11px}
      .dk .dk-th i svg{fill:#fff;stroke:#fff}
      @media (max-width:820px){.dk .dk-c1{flex-direction:row;align-items:center}.dk .dk-th{width:56px}}
      .dk .dk-c1 .dk-th0{width:72px}@media (max-width:820px){.dk .dk-c1 .dk-th0{width:56px;aspect-ratio:auto;height:28px;border:0}}
      .dk .dk-doall{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:0 0 14px}
      .dk .dk-doall .v2hint{margin:0}
      @media (min-width:721px){.dk-all.modal{max-width:580px}}
      .dk-all .dk-all-l{max-height:min(55vh,520px);overflow:auto;margin:10px 0 0;overscroll-behavior:contain}
      .dk-all .dk-all-g{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600;padding:10px 0 2px}
      .dk-all .dk-all-i{display:grid;grid-template-columns:auto 52px minmax(0,1fr);gap:4px 10px;align-items:start;padding:9px 0;border-top:1px solid var(--line);font-size:13px}
      .dk-all .dk-all-i input{margin:2px 0 0;width:18px;height:18px}
      .dk-all .dk-all-i .t{word-break:break-word}.dk-all .dk-all-i.off .t{color:var(--muted)}
      .dk-all .dk-all-i .st{grid-column:3;font-size:12px;color:var(--muted);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .dk-all .dk-all-i .st:empty{display:none}
      .dk-all .dk-all-i .st.ok{color:var(--good)}.dk-all .dk-all-i .st.bad{color:var(--bad)}
      .dk-all .dk-k{font-size:10.5px;font-weight:700;letter-spacing:.05em;padding:3px 7px;border-radius:5px;text-align:center}
      .dk-all .dk-k.scale{background:var(--good-bg);color:var(--good)}.dk-all .dk-k.cut{background:var(--bad-bg);color:var(--bad)}.dk-all .dk-k.trim{background:var(--warn-bg);color:var(--warn)}
      .dk-all .lx-nudge-ma{align-items:center}.dk-all [data-sum]{margin-right:auto}
      .dk .v2btn,.dk-form .v2btn{margin-top:0;text-decoration:none;display:inline-flex;align-items:center}
      .dk .v2btn.ghost,.dk-form .v2btn.ghost{background:var(--surface);color:var(--ink);border:1px solid var(--line-strong);font-weight:500}
      .dk .dk-gh{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
      .dk .dk-mk{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}
      .dk .dk-mk>div{border:1px solid var(--line);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:4px}
      .dk .dk-mk .l{font-size:11.5px;color:var(--muted)}
      .dk .dk-mk>div{border-left-width:4px}.dk .dk-mk>.green{border-left-color:var(--good)}.dk .dk-mk>.amber{border-left-color:var(--warn)}.dk .dk-mk>.red{border-left-color:var(--bad)}.dk .dk-mk>.grey{border-left-color:var(--line-strong)}
      .dk .dk-verdict{border-left:4px solid var(--line-strong);padding-left:12px}.dk .dk-verdict.green{border-left-color:var(--good)}.dk .dk-verdict.amber{border-left-color:var(--warn)}.dk .dk-verdict.red{border-left-color:var(--bad)}
      .dk .dk-key{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:10px;font-size:12px;color:var(--ink-2)}.dk .dk-key span{display:inline-flex;gap:6px;align-items:center}
      .dk .dk-cell:disabled{cursor:default}
      .dk .dk-answer{display:flex;gap:14px;align-items:baseline;flex-wrap:wrap;padding:16px 18px;border-radius:12px;border:1px solid var(--line);border-left:6px solid var(--line-strong);background:var(--surface);margin:0 0 12px}
      .dk .dk-answer b{font-size:22px;letter-spacing:-.01em}.dk .dk-answer .d,.dk .dk-answer .n{color:var(--muted);font-size:13px}
      .dk .dk-answer.green{border-left-color:var(--good)}.dk .dk-answer.amber{border-left-color:var(--warn)}.dk .dk-answer.red{border-left-color:var(--bad)}
      .dk .dk-days{display:grid;grid-template-columns:repeat(30,minmax(18px,1fr));gap:4px;overflow-x:auto}
      .dk .dk-day{height:34px;border-radius:6px;border:1px solid var(--line);background:var(--surface-2);cursor:pointer;padding:0;display:flex;align-items:flex-end;justify-content:center}
      .dk .dk-day i{font-style:normal;font-size:9.5px;color:var(--muted);padding-bottom:2px}
      .dk .dk-day.green{background:var(--good-bg);border-color:transparent}.dk .dk-day.amber{background:var(--warn-bg);border-color:var(--warn)}.dk .dk-day.red{background:var(--bad);border-color:var(--bad)}.dk .dk-day.red i{color:#fff}
      .dk .dk-day.sel{outline:0;border-color:var(--brand);box-shadow:inset 0 0 0 1.5px var(--brand),inset 0 0 0 3px var(--surface)}.dk .dk-day.sel i{color:var(--ink);font-weight:650}.dk .dk-day.red.sel i{color:#fff}.dk .dk-day:focus-visible{outline:2px solid var(--brand);outline-offset:2px}.dk .dk-day:hover:not(.sel){border-color:var(--line-strong)}
      .dk-dot.mixed{background:var(--warn-bg);border-color:var(--warn)}
      .dk .dk-pl{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
      .dk .dk-pl>div{border:1px solid var(--line);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:4px}
      .dk-needs{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 14px}.dk-needs .lbl{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-right:4px}
      .dk-need{display:inline-flex;gap:6px;align-items:baseline;border:1px solid var(--line);border-radius:999px;padding:5px 12px;background:var(--surface);color:var(--ink);cursor:pointer;font:inherit;font-size:12.5px}
      .dk-need b{font-size:13.5px}.dk-need:hover{border-color:var(--brand)}
      .dk-form{display:flex;flex-direction:column;gap:12px}.dk-form label{display:flex;flex-direction:column;gap:4px;font-weight:550}
      .dk-form input[type=text]{padding:8px 10px;border:1px solid var(--line-strong);border-radius:7px;background:var(--surface-2);color:var(--ink)}
      .dk-form .opt{display:flex;gap:8px;align-items:flex-start;font-weight:400}.dk-form .opt small{display:block;color:var(--muted)}
      .dk-form select,.dk-form textarea,.dk-form input[type=date]{padding:8px 10px;border:1px solid var(--line-strong);border-radius:7px;background:var(--surface-2);color:var(--ink);font:inherit}
      .dk-form label small{font-weight:400;color:var(--muted);font-size:11.5px}
      .lx-toast.dk-t a{color:inherit;font-weight:600;margin-left:10px;text-decoration:underline}
      .dk .dk-acts .v2btn{height:30px;font-size:12.5px;padding:0 11px}
      /* REVIEW PASS B (2026-10-21): The Plan = one line per step, the full section in the side panel. */
      .wr .wr-plan1{display:flex;flex-direction:column;gap:8px;min-width:0}
      .wr .wr-plan1 .wr-next{margin:0 0 4px}
      [data-ui="v2"] .wr .wr-line{padding:0;overflow:hidden;gap:0}
      .wr .wr-lb{appearance:none;border:0;background:none;width:100%;box-sizing:border-box;display:grid;grid-template-columns:22px minmax(150px,max-content) minmax(0,1fr) auto 12px;gap:12px;align-items:center;padding:12px 16px;cursor:pointer;font:inherit;color:var(--ink);text-align:left;border-radius:inherit}
      .wr .wr-lb:hover{background:var(--surface-2)}
      .wr .wr-lb:focus-visible{outline:2px solid var(--brand);outline-offset:-2px}
      .wr .wr-lb .t{font-weight:600;font-size:14px;white-space:nowrap}
      .wr .wr-lb .v{color:var(--muted);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
      .wr .wr-chev{color:var(--muted);font-size:16px;line-height:1}
      .wr .wr-als{border-top:1px solid var(--line);padding:2px 16px 4px 50px}
      .wr .wr-alr{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:center;padding:8px 0;font-size:13px}
      .wr .wr-alr+.wr-alr{border-top:1px solid var(--line)}
      .wr .wr-alr .nm{font-weight:550}
      .wr .wr-alr input.lx-sw:disabled{opacity:.5;cursor:default}
      @media (max-width:600px){.wr .wr-lb{grid-template-columns:22px minmax(0,1fr) auto 12px;row-gap:2px}.wr .wr-lb .t{white-space:normal}.wr .wr-lb .v{grid-column:2/-1;grid-row:2}.wr .wr-als{padding-left:16px}}
      .wr-pn{gap:14px}
      .wr-pn .wr-psec{display:flex;flex-direction:column;gap:12px;min-width:0}
      .wr-pn .wr-psub p{margin:0;color:var(--muted);font-size:13px;line-height:1.5}
      .wr-pn .wr-psec h4{margin:8px 0 2px}
      .wr-pn .wr-thr{display:flex;flex-direction:column;gap:6px;padding:10px 0;border-top:1px solid var(--line)}
      .wr-pn .wr-thr:first-child{border-top:0;padding-top:0}
      .wr-pn .wr-thr .q{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:13px;padding-left:44px}
      .wr-pn .wr-thr .q input[type=text]{width:90px}
      .wr-pn .wr-thr small{padding-left:44px;color:var(--muted);font-size:11.5px}
      .wr-pn .wr-thr > b{font-size:13.5px}
      .wr-pn .wr-thr > b ~ .q,.wr-pn .wr-thr > b ~ small{padding-left:0}`;
    document.head.appendChild(st);
  }

  /* =========================================================================================
   * HOME > DAY CHECK (page id `yesterday`): WAS IT A BAD DAY ON META? Rebuilt 2026-10-09 after Cole: "the goal is
   * Breezeway's: was it a bad day on Meta, open to everybody", not a report card per brand. One answer per day from
   * four signs (account-health /api/metaday, market.js metaDay): bad when two or more agree, mixed when one does.
   * Layout: the answer, the last 30 days as squares, the four signs for the chosen day, then our brands that day.
   * ======================================================================================= */
  let MDSEL = null;
  const MDV = { normal: ['Normal day on Meta', 'green'], mixed: ['Mixed signals', 'amber'], bad: ['Bad day on Meta', 'red'], vbad: ['Very bad day on Meta', 'red'] };
  async function yesterday(first) {
    css();
    const t = H.RUN(), title = 'Day check';
    if (first) $('#main').innerHTML = shell('yesterday', title, U().card('', '', '<p class="v2hint">Loading…</p>'));
    let m; try { m = await getAH('/api/metaday?days=30'); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('yesterday', title, U().card('Could not load', '', `<p class="v2bad">${esc(e.message)}</p>`)); return; }
    if (t !== H.RUN()) return;
    const days = m.days || [];
    if (!days.length) { $('#main').innerHTML = shell('yesterday', title, U().card('Nothing yet', '', '<p class="v2hint">Not enough Meta data yet.</p>')); return; }
    if (!MDSEL || !days.some(d => d.date === MDSEL)) MDSEL = days[days.length - 1].date;
    const sel = days.find(d => d.date === MDSEL), latest = days[days.length - 1], isLatest = sel.date === latest.date;
    const agency = (H.S.accounts || []).length > 1;
    const [vt, tone] = MDV[sel.verdict] || MDV.normal;
    const answer = `<div class="dk-answer ${tone}"><span class="d">${wdl(sel.date)} ${md(sel.date)}</span><b>${vt}</b><span class="n">${sel.hits} of 4 signs</span></div>`;
    const strip = `<div class="dk-days">${days.map(d => `<button type="button" class="dk-day ${(MDV[d.verdict] || MDV.normal)[1]}${d.date === MDSEL ? ' sel' : ''}" data-d="${d.date}"${U().tipAttr(`<b>${wdl(d.date)}, ${md(d.date)}</b><br>${(MDV[d.verdict] || MDV.normal)[0]} · ${d.hits ? `${d.hits} of 4 signs` : 'no signs'}`)}><i>${md(d.date).split(' ')[1]}</i></button>`).join('')}</div>
      <div class="dk-key"><span><i class="dk-dot good"></i>Normal</span><span><i class="dk-dot mixed"></i>Mixed: one sign</span><span><i class="dk-dot vbad"></i>Bad: two or more signs</span><span class="faint">Click a day to see its signs.</span></div>`;
    const s = sel.signs || {};
    const sign = (on, label, big, small, tip) => `<div class="${on == null ? 'grey' : on ? 'red' : 'green'}"><span class="l">${label}</span><b>${big}</b><span class="v2hint" style="margin:0"${tip ? U().tipAttr(tip) : ''}>${small || ''}</span></div>`;
    const ours = s.ours, bwS = s.breezeway, ch = s.chatter;
    const signs = `<div class="dk-mk">
      ${sign(ours ? ours.high : null, agency ? 'Our brands' : 'The brands we manage', !ours ? 'Not enough data' : ours.high ? 'Paid more per sale than usual' : 'Normal cost per sale',
        ours ? `${agency ? `${ours.worse} of ${ours.brands} clearly worse. ` : ''}${ours.cpm_change != null ? `Meta's price per 1,000 views ${ours.cpm_change >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(ours.cpm_change * 100))}%.` : ''}` : '', 'Meta cost per sale on our accounts against each brand\'s last 28 days, averaged. Counts as a sign when it is in the worst 15% of days.')}
      ${sign(bwS ? bwS !== 'NORMAL' : null, 'Other advertisers', !bwS ? 'No reading' : bwS === 'VERY BAD' ? 'A very bad Meta day' : bwS === 'BAD' ? 'A bad Meta day' : 'A normal Meta day', 'Meta cost per sale across other brands.', 'Breezeway\'s public panel of other advertisers. It calls many days bad on its own, so it only counts as one sign.')}
      ${sign(s.outage ? s.outage.length > 0 : null, 'Meta\'s status page', s.outage && s.outage.length ? 'Meta posted a problem' : 'No problem posted', s.outage && s.outage.length ? esc(s.outage.slice(0, 2).join('; ')) : 'Meta only posts real outages there.', 'Read every 5 minutes by Pulse. Expensive or slow days never show here, only outages.')}
      ${sign(ch ? ch.issues : null, 'Advertisers online', !ch ? 'Not checked' : ch.issues ? 'People reported problems' : 'Nothing unusual', ch ? `${esc(ch.summary || '')}${(ch.sources || []).length ? '<br>' + ch.sources.slice(0, 2).map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc((x.title || x.url).slice(0, 50))}</a>`).join('<br>') : ''}` : 'Checked for the latest days only.', 'A daily search of X and Reddit, reading the media buyers Cole follows first.')}
    </div>`;
    const brands = isLatest && (m.brands || []).length ? U().card(agency ? 'Our brands that day' : 'Your brand that day', 'Meta cost per sale against each brand\'s last 28 days',
      `<div class="v2tbl"><table><thead><tr><th>Brand</th><th>Meta spend</th><th>Cost per sale</th><th>Its normal</th><th></th></tr></thead><tbody>${m.brands.map(b => `<tr><td><b>${esc(b.name)}</b></td><td>${U().money(b.spend)}</td><td>${b.cpa != null ? U().money(b.cpa) : 'no sale'}</td><td>${b.cpa_normal != null ? U().money(b.cpa_normal) : '–'}</td><td>${b.change == null ? '' : `<span class="v2pill ${b.change >= 0.15 ? 'bad' : b.change <= -0.15 ? 'good' : ''}">${b.change >= 0 ? '+' : ''}${Math.round(b.change * 100)}%</span>`}</td></tr>`).join('')}</tbody></table></div>`) : '';
    $('#main').innerHTML = shell('yesterday', title, `<div id="dkNow"></div><p class="v2say lead" style="margin:0 0 12px">Was it a bad day on Meta? Bad when two or more of four signs agree.</p>
      ${answer}${isLatest ? `<div id="dkVerdict"></div>` : ''}${U().card('The last 30 days', '', strip)}${U().card(`The four signs, ${wdl(sel.date)} ${md(sel.date)}`, '', signs)}${brands}`);
    const root = $('#main');
    root.querySelectorAll('.dk-day').forEach(el => el.onclick = () => { MDSEL = el.dataset.d; yesterday(false); });
    if (isLatest) fillVerdict(m, t, agency);
    fillNow(t);
    /* The leak finder's full list moved to Home > Overview on 2026-10-14 (Cole: "it's not on the overview?"). */
  }

  /* RIGHT NOW (2026-10-09, account-health checknow.js): today so far against a normal day by this hour, the signs,
   * the market now. Cached 10 minutes on the server; Refresh skips that, "What are advertisers saying?" adds a
   * web search (a few cents). Kept in the page so clicking a day below does not ask again. */
  let NOWC = null;
  async function fillNow(t, opt = {}) {
    const el = document.getElementById('dkNow'); if (!el) return;
    const act = H.S.act || 'all', key = act;
    /* PHASE 7: title, the time as the caption, the two buttons on the right, the method in the card's "..." */
    const draw = (body, sub, how) => { const e2 = document.getElementById('dkNow'); if (e2 && t === H.RUN()) e2.innerHTML = `<section class="v2card"><div class="v2h"><h3>Right now</h3>${sub ? `<span class="find">${sub}</span>` : ''}<span class="cap"><button type="button" class="v2btn ghost" id="dkNowRef">Refresh</button><button type="button" class="v2btn ghost" id="dkNowWeb">What are advertisers saying?</button></span>${window.LxKit && LxKit.cardMenu ? LxKit.cardMenu([how ? esc(how) : '', 'Want a ping when this happens? Ask Locus: "tell me if revenue is under half of normal by noon". Alerts live on Reports > Dashboards.']) : ''}</div>${body}</section>`; wireNow(t); };
    if (!opt.fresh && !opt.web && NOWC && NOWC.key === key && Date.now() - NOWC.at < 5 * 60e3) { draw(nowBody(NOWC.data), nowSub(NOWC.data), NOWC.data.how); return; }
    if (!NOWC || NOWC.key !== key) draw('<p class="v2hint" style="margin:0">Checking today so far against a normal day&hellip;</p>');
    let r; try { r = await H.apiAH(`/api/daycheck/now?act=${encodeURIComponent(act)}${opt.fresh ? '&fresh=1' : ''}${opt.web ? '&web=1' : ''}`); }
    catch (e) { draw(`<p class="v2bad" style="margin:0">Could not check: ${esc(e.message)}</p>`); return; }
    if (opt.web === false && NOWC?.data?.chatter && !r.chatter) r.chatter = NOWC.data.chatter;
    NOWC = { key, at: Date.now(), data: r };
    draw(nowBody(r), nowSub(r), r.how);
  }
  function wireNow(t) {
    const a = document.getElementById('dkNowRef'), b = document.getElementById('dkNowWeb');
    if (a) a.onclick = () => { a.disabled = true; a.textContent = 'Checking…'; fillNow(t, { fresh: true }); };
    if (b) b.onclick = () => { b.disabled = true; b.textContent = 'Searching…'; fillNow(t, { web: true }); };
  }
  const nowSub = r => `As of ${new Date(r.as_of).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })} Central · today so far against a normal day by this hour`;
  function nowBody(r) {
    const u = U(), list = r.brands || [], one = list.length === 1;
    const vsPill = v => v == null ? '' : `<span class="v2pill ${v < 0.75 ? 'bad' : v > 1.25 ? 'good' : ''}">${Math.round(v * 100)}% of normal</span>`;
    const tone = r.weird ? 'red' : 'green';
    let out = `<div class="dk-answer ${tone}" style="margin:0 0 12px"><b style="font-size:17px">${esc(r.headline || '')}</b></div>`;
    if (one) {
      const b = list[0], cur = b.currency, t = b.today_so_far || {}, n = b.normal_by_now || {}, v = b.vs || {};
      const row = (label, a, nb, vv, f, lower) => `<div class="${vv == null ? 'grey' : (lower ? vv > 1.25 : vv < 0.75) ? 'red' : (lower ? vv < 0.9 : vv > 1.1) ? 'green' : 'grey'}"><span class="l">${label}</span><b>${f(a)}</b><span class="v2hint" style="margin:0">normal by now ${f(nb)} ${vv == null ? '' : `(${Math.round(vv * 100)}%)`}</span></div>`;
      out += `<div class="dk-mk">${[
        row('Revenue so far', t.revenue, n.revenue, v.revenue, x => u.money(x, cur)),
        row('Paid orders', t.orders, n.orders, v.orders, u.int),
        row('New customers', t.new_customers, n.new_customers, v.new_customers, u.int),
        row('Ad spend (all)', t.spend, n.spend, v.spend, x => u.money(x, cur)),
        row('MER', t.mer, n.mer, v.mer, u.x2),
        row('Meta spend', t.meta_spend, n.meta_spend, v.meta_spend, x => u.money(x, cur)),
        row('Meta price per 1,000 views', t.meta_cpm, n.meta_cpm, v.meta_cpm, x => u.money2(x, cur), true),
      ].join('')}</div>`;
      if (b.last3h) out += `<p class="v2hint" style="margin:10px 0 0">Orders in the last 3 finished hours: <b>${b.last3h.orders}</b> (a normal day has about ${Math.round(b.last3h.normal)}).</p>`;
      if ((b.notes || []).length) out += `<p class="v2hint" style="margin:6px 0 0">${b.notes.map(esc).join(' ')}</p>`;
      if (b.curve) out += `<p class="v2hint" style="margin:6px 0 0">Normal by now uses ${esc(b.curve)}.</p>`;
    } else if (list.length) {
      out += `<div class="v2tbl"><table><thead><tr><th>Brand</th><th>Revenue so far</th><th>vs normal</th><th>Paid orders</th><th>Meta spend</th><th>What looks off</th></tr></thead><tbody>${list.map(b => {
        const t = b.today_so_far || {}, v = b.vs || {}, bad = (b.signs || []).filter(s => s.level !== 'good');
        return `<tr><td><b>${esc(b.name)}</b></td><td>${u.money(t.revenue, b.currency)}</td><td>${vsPill(v.revenue)}</td><td>${u.int(t.orders)} ${vsPill(v.orders)}</td><td>${u.money(t.meta_spend, b.currency)} ${vsPill(v.meta_spend)}</td><td class="tiny">${bad.length ? bad.map(s => esc(s.text)).join('<br>') : esc((b.notes || [])[0] || (b.error ? 'Could not check: ' + b.error : 'Nothing unusual'))}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    }
    if (one && (list[0].signs || []).length) out += `<ul style="margin:10px 0 0;padding-left:18px">${list[0].signs.map(s => `<li class="${s.level === 'high' ? 'v2bad' : ''}">${esc(s.text)}</li>`).join('')}</ul>`;
    const m = r.market || {}, mk = [];
    mk.push((m.platforms_now || []).length ? `<b>Not fully up now:</b> ${m.platforms_now.map(p => `${esc(p.platform)} (${esc(p.state)}${(p.services || []).length ? ': ' + esc(p.services.slice(0, 2).join(', ')) : ''})`).join(', ')}` : 'Meta and Google show no problem on their status pages right now.');
    if ((m.incidents_today || []).length) mk.push(`Earlier today: ${m.incidents_today.slice(0, 3).map(x => esc(x.title)).join('; ')}`);
    if (m.breezeway?.status) mk.push(`Breezeway's latest day (${esc(m.breezeway.date || '')}): ${esc(m.breezeway.status.toLowerCase())}, a hint, not a verdict.`);
    const ch = r.chatter;
    if (ch) mk.push(ch.status === 'ok' ? `<b>Advertisers online, last few hours:</b> ${esc(ch.summary || (ch.meta === 'issues' ? 'people are reporting Meta problems' : 'nothing unusual'))}${(ch.sources || []).length ? ' ' + ch.sources.slice(0, 3).map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc((x.title || x.url).slice(0, 50))}</a>`).join(' · ') : ''}` : `Could not search what advertisers are saying: ${esc(ch.error || '')}`);
    out += `<div class="dk-key" style="display:block;margin-top:12px">${mk.map(x => `<p class="v2say" style="margin:0 0 4px">${x}</p>`).join('')}</div>`;
    return out;
  }
  const AHC = new Map();
  const getAH = path => { const hit = AHC.get(path); if (hit && Date.now() - hit.at < 5 * 60e3) return hit.p; const p = H.apiAH(path); AHC.set(path, { at: Date.now(), p }); p.catch(() => AHC.delete(path)); return p; };
  async function fillVerdict(m, t, agency) {
    const L = m.latest, facts = { verdict: L.verdict, signs_agreeing: L.hits, signs: L.signs, last_14_days: (m.days || []).slice(-14).map(d => `${d.date}: ${d.verdict}`),
      our_brands: agency ? (m.brands || []).map(b => ({ name: b.name, cost_per_sale_vs_normal: b.change })) : null };
    let v = null; try { v = await H.apiAH('/api/daycheck', { method: 'POST', body: JSON.stringify({ date: L.date, facts }) }); } catch (e) { v = { error: e.message }; }
    const vh = document.getElementById('dkVerdict'); if (t !== H.RUN() || !vh) return;
    vh.innerHTML = v && v.headline ? `<div class="v2card dk-verdict ${(MDV[L.verdict] || MDV.normal)[1]}"><p class="v2say" style="margin:0 0 6px"><b>${esc(v.headline)}</b></p>${v.why ? `<p class="v2say" style="margin:0 0 6px">${esc(v.why)}</p>` : ''}${v.todo ? `<p class="v2say" style="margin:0"><b>Today:</b> ${esc(v.todo)}</p>` : ''}</div>` : '';
  }

  /* =========================================================================================
   * ADS > TODAY (rebuilt 2026-10-13, Cole: "if something's there, we can make a call right then and there, or go into
   * Ads Manager, or link to another part of Locus for more detail"). Every row can be decided on the page:
   *   Do it          Scale / Cut / Trim: the SAME dry-run, modal, write-with-expect, Undo flow the nudge card and Ads >
   *                  Meta use (window.LxMetaWrite in nudge.js -> account-health /api/meta/write). Scale = the budget up
   *                  20% (the modal shows the number first), Cut = pause the ad set, Trim = pause the one ad.
   *   Open in Locus  the ad set opened on Ads > Meta > Campaigns (window.V2PENDING {campaign, adset}) or the ad's
   *                  preview on Ads > Meta > Ads ({ad}); Fix rows open the Meta overview.
   *   Something else an in-app modal (one line, owner, due date) -> account-health POST /api/actions, a Locus action item (Work > Action items)
   *                  in the brand project's "Action items" section; the toast carries the link.
   *   Done / Not now unchanged: a manual Change Log line (the Daily Brief's "What we did") / hidden until tomorrow.
   *   Call rows      ONE ROW PER TEST that needs a call (/api/brand/tests-overview `calls`): Winner / Keep running /
   *                  Loser -> profit POST /api/brand/verdict (a one-line learning, or a reason and a check-again date),
   *                  mirrored to the Asana task through account-health POST /api/brand-asana/result so the hourly sync
   *                  does not undo it. The row disappears after the call. Today never opens a Meta job page.
   * The 8am Slack post with the same rows is account-health todaypost.js.
   * 2026-10-15 (Cole approved): THE AD ON EVERY CALL. Scale / Cut / Refresh rows show the set's main ad (the anchor, else
   *                  the top-spend ad, hub.js `top_ad`), Trim the trimmed ad: the same covers as the Ads page (V2.thumbs,
   *                  account-health /api/ad-creatives), and a tap plays it (V2.playAd: Meta's preview in the side panel,
   *                  a bottom sheet on a phone). DO ALL N: one button over the list for every Scale / Cut / Trim still
   *                  open; one sheet lists every change, ticked, and runs the ticked ones one by one through the same
   *                  dry-run-then-write path as Do it (LxMetaWrite.run), each with its own result and Undo. One failing
   *                  never stops the rest. ?open=today&act=<brand>&doall=1 (the morning card's "Make the calls") opens
   *                  the sheet ready, never run: Cole confirms.
   * ======================================================================================= */
  let KIND = 'all';
  const OPEN = {};
  /* The shared Done / Not now (2026-10-26): what a call is about (the ad, else the ad set, else the test or the row) and
     the server write. LOCAL keeps this session's clicks so the page answers at once. */
  const LOCAL = {};
  const objOf = r => String(r.ad_id || r.adset_id || (r.kind === 'call' && r.test ? `test:${r.test.id}` : r.key));
  const putState = (r, status) => { if (!r || !H.apiAH) return; H.apiAH('/api/buyer-list/state', { method: 'POST', body: JSON.stringify({ act: r.act_id, object: objOf(r), action: r.kind, status, name: r.ad || r.adset || '' }) }).catch(() => {}); };
  const CALLED = {};
  const OWNERS = ['Cole', 'Ahsan', 'Noma', 'William', 'Ravo', 'Radhesh', 'Hamza'];
  const KEEP_WHY = [['tof', 'Top of funnel doing its job'], ['data', 'Not enough data yet'], ['scaling', 'Scaling'], ['waiting', 'Waiting on offer or landing page'], ['other', 'Other']];
  const READ = { winner: 'Locus reads it as a winner', keep: 'Locus reads it as mixed: over the goal, under the account average', loser: 'Locus reads it as a loser', too_early: 'Past its judging days and Meta will not spend on it' };
  const plusDays = n => { const x = new Date(); x.setDate(x.getDate() + n); return ymdL(x); };
  const dtoast = (msg, bad, link) => {
    document.querySelectorAll('.lx-toast.dk-t').forEach(x => x.remove());
    const t = document.createElement('div'); t.className = `lx-toast dk-t${bad ? ' bad' : ''}`; t.setAttribute('role', 'status');
    t.innerHTML = `<span>${esc(msg)}</span>${link ? `<a href="${esc(link.href)}" target="_blank" rel="noopener">${esc(link.label)}</a>` : ''}`;
    document.body.appendChild(t); setTimeout(() => t.remove(), link ? 12000 : bad ? 6000 : 3000);
  };
  /* A small in-app form modal: fields = HTML, onYes(form) returns a promise; an error shows in the modal. */
  function formModal(title, hint, fields, cta, onYes) {
    const w = document.createElement('div'); w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal lx-nudge-m" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>${hint ? `<p class="hint">${hint}</p>` : ''}<form class="dk-form lx-nudge-mb">${fields}</form><p class="lx-nudge-err" data-err hidden></p>
      <div class="row lx-nudge-ma"><button class="btn" data-m="no" type="button">Cancel</button><button class="btn primary" data-m="yes" type="button">${esc(cta)}</button></div></div>`;
    document.body.appendChild(w);
    const form = w.querySelector('form'), yes = w.querySelector('[data-m="yes"]'), err = w.querySelector('[data-err]');
    const close = () => { w.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    w.querySelector('[data-m="no"]').onclick = close;
    form.onsubmit = e => { e.preventDefault(); yes.click(); };
    yes.onclick = async () => {
      if (!form.reportValidity()) return;
      yes.disabled = true; const was = yes.textContent; yes.textContent = 'Saving…'; err.hidden = true;
      try { await onYes(form); close(); }
      catch (e) { err.textContent = e.message || 'Could not save it.'; err.hidden = false; yes.disabled = false; yes.textContent = was; }
    };
    setTimeout(() => { const f = form.querySelector('input,select,textarea'); if (f) f.focus(); }, 30);
    return { w, close };
  }
  async function today(first) {
    css();
    const t = H.RUN(), one = H.S.act !== 'all' ? H.S.accounts.find(a => a.act_id === H.S.act) : null;
    const title = one ? `Today's calls: ${esc(one.name)}` : `Today's calls`;
    if (first) $('#main').innerHTML = shell('today', title, U().card('', '', '<p class="v2hint">Loading…</p>'));
    let d, tests = null;
    try { [d, tests] = await Promise.all([get(`/api/hub/today?act=${encodeURIComponent(H.S.act)}`), get('/api/brand/tests-overview').catch(() => null)]); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('today', title, U().card('Could not load', '', `<p class="v2bad">${esc(e.message)}</p>`)); return; }
    if (t !== H.RUN()) return;
    const todayKey = ymdL(new Date());
    /* Done / Not now are shared on the server since 2026-10-26 (the Buyer list's state), never this computer's storage. */
    const srv = await H.apiAH(`/api/buyer-list/state?act=${encodeURIComponent(H.S.act)}`).catch(() => null);
    if (t !== H.RUN()) return;
    const dn = {}, sn = {};
    const rows = (d.rows || []).map(r => ({ ...r, key: `${r.kind}:${r.adset_id || ''}:${r.ad_id || ''}:${r.act_id}` }));
    /* Test calls: one row per test that has spent enough to judge (brand.js testsOverview `calls`). */
    for (const b of (tests?.brands || [])) {
      if (one && b.act_id !== one.act_id) continue;
      const acc = H.S.accounts.find(a => a.act_id === b.act_id); if (!acc) continue;
      for (const c of (b.calls || [])) {
        const key = `call:${b.act_id}:${c.id}`; if (CALLED[key]) continue;
        const $ = v => U().money(v, acc.currency || 'USD');
        const cpaLine = c.cpa != null ? `${$(c.cpa)} a sale${c.goal ? ` against the ${$(c.goal)} goal` : ''}` : `no sale${c.goal ? ` against a ${$(c.goal)} goal` : ''}`;
        rows.push({ kind: 'call', act_id: b.act_id, brand: b.name, currency: acc.currency, test: c, key, stake: c.spend || 0,
          adset: `Test ${c.num}: ${c.title || 'untitled'}`, why: `${READ[c.suggest] || 'Spent enough to judge'}: ${cpaLine} on ${$(c.spend)}.` });
      }
    }
    /* Locus v4 (phase 2): Google search-term negatives join the queue as one call per leak (v4.js extraCalls). */
    if (window.V4 && window.V4.on && window.V4.extraCalls) { try { rows.push(...await window.V4.extraCalls(H, one)); } catch {} if (t !== H.RUN()) return; }
    /* THE BUYER LIST STATE (2026-10-26, account-health buyerlist.js, p_buyer_state): the same memory as Ads > Buyer list.
       Done today = greyed with Undo; done earlier (quiet 3 days) or skipped (until tomorrow) = hidden for everyone; a change
       written to Meta on the object in the last 3 days hides the call too (watch 3 days). LOCAL = this session's clicks. */
    for (const r of rows) {
      const o = objOf(r), lk = LOCAL[r.key];
      if (lk === 'clear') continue;
      const s = srv && (srv.states || []).find(x => x.brand === r.act_id && x.object === o && x.action === r.kind);
      if (lk === 'done' || (s && s.status === 'done' && ymdL(new Date(s.at)) === todayKey)) { dn[r.key] = 1; continue; }
      if (lk === 'skipped' || s) { sn[r.key] = 1; continue; }
      if (srv && (srv.watched || []).some(w => w.brand === r.act_id && String(w.object) === o)) sn[r.key] = 1;
    }
    const vis = rows.filter(r => !sn[r.key]);
    const kinds = [['all', 'All'], ['fix', 'Fix'], ['scale', 'Scale'], ['cut', 'Cut'], ['mixed', 'Mixed'], ['trim', 'Trim'], ['refresh', 'Refresh'], ['call', 'Call'], ...(window.V4 && window.V4.on ? [['neg', 'Google']] : [])];
    const cnt = k => vis.filter(r => k === 'all' || r.kind === k).length;
    const DO_TIP = { scale: 'Raise this ad set\'s budget 20%. You see the number and confirm before anything is written.', cut: 'Pause this ad set. You confirm before anything is written.', trim: 'Pause this one ad, not the set. You confirm before anything is written.' };
    const doList = vis.filter(r => DO_TIP[r.kind] && !dn[r.key]).sort((a, b) => (b.stake || 0) - (a.stake || 0));
    const doBar = doList.length ? `<span class="lx-tohead"><button type="button" class="v2btn dk-p" id="dkDoAll">${doList.length === 1 ? 'Do the 1 call' : `Do all ${doList.length} calls`}</button></span>` : '';
    /* Tracking gap (hub.js buyerList banners): one line per brand whose cuts are on hold. */
    const gapBan = (d.banners || []).filter(b => !one || b.act_id === one.act_id).map(b => `<p class="v2say dk-gap-ban" role="note">${esc(b.text)}</p>`).join('');
    const counts = `<div class="v2jobs dk-counts" role="group" aria-label="Kind of call">${kinds.map(([k, l]) => `<button type="button" class="dk-cnt${KIND === k ? ' on' : ''}" data-k="${k}"><b>${cnt(k)}</b>${l}</button>`).join('')}</div>`;
    const shown = vis.filter(r => KIND === 'all' || r.kind === KIND);
    const by = {}; for (const r of shown) (by[r.act_id] ??= []).push(r);
    const order = Object.entries(by).sort((a, b) => b[1].reduce((s, r) => s + (r.stake || 0), 0) - a[1].reduce((s, r) => s + (r.stake || 0), 0));
    const amLink = r => { const n = String(r.meta_act || '').replace(/^act_/, ''); return n ? `https://adsmanager.facebook.com/adsmanager/manage/${r.ad_id ? 'ads' : 'adsets'}?act=${n}${r.adset_id ? `&selected_adset_ids=${r.adset_id}` : ''}${r.ad_id ? `&selected_ad_ids=${r.ad_id}` : ''}` : null; };
    const gb = (attr, label, extra = '') => `<button type="button" class="v2btn ghost" ${attr}${extra}>${label}</button>`;
    const row = r => { const cur = r.currency || 'USD', am = amLink(r), k = esc(r.key);
      if (r.kind === 'call') { const c = r.test, $ = v => U().money(v, cur);
        const meta = `${$(c.spend)} spent · ${U().int(c.orders)} purchase${Math.round(c.orders) === 1 ? '' : 's'} · ${c.cpa != null ? `${$(c.cpa)} per sale` : 'no sale'}${c.goal ? ` · goal ${$(c.goal)}` : ''}${c.roas ? ` · ${U().x2(c.roas)} ROAS` : ''}${c.ads ? ` · ${c.ads} ad${c.ads === 1 ? '' : 's'}` : ''}`;
        return `<div class="dk-row"><div class="dk-c1"><span class="dk-th dk-th0"><span class="dk-k call">CALL</span></span></div>
          <div><div class="nm" title="${esc(r.adset)}">${esc(r.adset)}</div><div class="meta">${meta}</div></div>
          <div class="dk-rs"><div class="why" title="${esc(r.why || '')}">${esc(r.why || '')}</div></div>
          <div class="dk-acts"><button type="button" class="v2btn dk-p" data-verdict="winner" data-key="${k}" title="Close the test as a winner. One line on what it taught us.">Winner</button><button type="button" class="v2btn ghost" data-verdict="keep" data-key="${k}" title="Leave it running with a reason and a date to check again.">Keep running</button><span class="dk-more"><button type="button" class="v2btn ghost dk-more-b" aria-haspopup="true" aria-expanded="false" title="More">&middot;&middot;&middot;</button><div class="dk-menu" role="menu"><button type="button" data-verdict="loser" data-key="${k}">Loser</button><button type="button" data-go="act:${esc(r.act_id)}:tests">Open the test</button>${c.ads_manager ? `<a href="${esc(c.ads_manager)}" target="_blank" rel="noopener">Open in Ads Manager</a>` : ''}<button type="button" data-snooze="${k}">Not now</button></div></span></div></div>`; }
      const meta = r.spend != null ? `${U().money(r.spend, cur)} spent · ${U().int(r.orders)} sale${Math.round(r.orders) === 1 ? '' : 's'} · ${r.cpa ? U().money(r.cpa, cur) + ' per sale' : 'no sale'}${r.goal ? ` · goal ${U().money(r.goal, cur)}` : ''}${r.n_ads ? ` · ${r.n_ads} ad${r.n_ads === 1 ? '' : 's'}` : ''}` : '';
      const ancT = (r.kind === 'cut' || r.kind === 'scale' || r.kind === 'mixed') && r.anchor && r.n_ads > 1 ? `Anchor: "${r.anchor.name}" (${Math.round((r.anchor.share || 0) * 100)}% of the set's spend).` : '';
      const anchor = ancT ? `<div class="dk-anc" title="${esc(ancT)}">${esc(ancT)}</div>` : '';
      const primary = DO_TIP[r.kind] ? `<button type="button" class="v2btn dk-p" data-do="${k}" title="${esc(DO_TIP[r.kind])}">Do it</button>`
        : r.kind === 'neg' ? `<button type="button" class="v2btn dk-p" data-neg="${k}" title="Each search becomes an exact negative keyword on its own campaign. Google checks each one before it is written.">Add ${r.leak && r.leak.items ? r.leak.items.length : ''} negatives</button>`
        : r.kind === 'mixed' ? '<span class="dk-gap" aria-hidden="true"></span>'
        : r.kind === 'refresh' ? `<button type="button" class="v2btn dk-p" data-brief="${k}" title="Ask Locus to brief three iterations of this ad as an Asana brief.">Brief the iteration</button>`
        : am ? `<a class="v2btn dk-p" href="${esc(am)}" target="_blank" rel="noopener">Open in Ads Manager</a>` : '<span class="dk-gap" aria-hidden="true"></span>';
      const ad = adOf(r);
      const chip = `<span class="dk-k ${r.kind}">${r.kind === 'neg' ? 'GOOGLE' : r.kind.toUpperCase()}</span>`;
      /* GOALS AND AD CALLS (2026-10-21): a Cut or Mixed set that brings mostly new customers with a good click rate carries
         a "Feeds the funnel" tag (hub.js buyerList `funnel`), never a call of its own. */
      const fu = r.funnel, fnl = fu ? `<span class="dk-fnl" title="${esc(`${Math.round(fu.new_share * 100)}% new customers${fu.acct_new_share != null ? ` against ${Math.round(fu.acct_new_share * 100)}% for the account` : ''}; click rate ${(fu.ctr * 100).toFixed(1)}% against the account median ${(fu.acct_ctr * 100).toFixed(1)}%.`)}">Feeds the funnel</span>` : '';
      /* Funnel role (2026-10-26): a Cut or Trim that first click shows opens journeys at goal is kept as Mixed (hub.js
         buyerList kept_by 'opener'); the tag says so and the why carries the numbers. */
      const opn = r.kept_by === 'tracking_gap' ? `<span class="dk-fnl" title="${esc('Meta counts more sales than Triple Whale credits. Fix tracking before cutting.')}">Tracking gap</span>` : r.kept_by === 'opener' ? `<span class="dk-fnl" title="${esc('Last click says cut; Triple Whale first click credits it with sales at goal. Judge it on first click.')}">Opens journeys</span>` : '';
      const th = ad ? `<button type="button" class="dk-th" data-thumb="${esc(ad.id)}" data-play="${k}" aria-label="Play the ad ${esc(ad.name || '')}" title="${esc(r.kind === 'trim' ? 'The ad to turn off' : r.kind === 'refresh' ? 'The main ad' : `The set's main ad${ad.name ? `: ${ad.name}` : ''}`)}. Tap to play.">${chip}<i>${window.icon ? window.icon('play', { size: 12 }) : '&#9654;'}</i></button>` : `<span class="dk-th dk-th0">${chip}</span>`;
      return `<div class="dk-row${dn[r.key] ? ' done' : ''}"><div class="dk-c1">${th}${fnl}${opn}</div>
        <div><div class="nm"${window.V4 && window.V4.on && r.adset_id ? ` data-set="${k}" role="button" tabindex="0" title="${esc(r.ad ? r.ad : r.adset || '')}. Open the ad set: the reason, the numbers and the ads in it"` : ` title="${esc(r.ad ? r.ad : r.adset || '')}"`}>${esc(r.ad ? r.ad : r.adset || '')}</div><div class="meta">${r.ad && r.adset ? `in ${esc(r.adset)} · ` : ''}${meta}</div></div>
        <div class="dk-rs"><div class="why" title="${esc(r.why || '')}">${esc(r.why || '')}</div>${anchor}</div>
        <div class="dk-acts">${primary}${gb(`data-done="${k}"`, dn[r.key] ? 'Undo' : 'Done')}<span class="dk-more"><button type="button" class="v2btn ghost dk-more-b" aria-haspopup="true" aria-expanded="false" title="More">&middot;&middot;&middot;</button><div class="dk-menu" role="menu">${am && r.kind !== 'fix' ? `<a href="${esc(am)}" target="_blank" rel="noopener">Open in Ads Manager</a>` : ''}<button type="button" data-locus="${k}">Open in Locus</button><button type="button" data-else="${k}">Something else</button><button type="button" data-snooze="${k}">Not now</button></div></span></div></div>`; };
    const groups = order.map(([id, rs]) => { rs.sort((a, b) => (b.stake || 0) - (a.stake || 0)); const name = rs[0].brand; const all = OPEN[id] || one; const list = all ? rs : rs.slice(0, 3);
      return `<section class="v2card"><div class="v2h"><h3>${esc(name)}</h3><span class="cap">${rs.length} to do</span>${window.LxKit && LxKit.cardMenu ? LxKit.cardMenu([esc(d.rules_note || ''), 'Do it writes the change to Meta after you confirm it: a dry run shows before and after first, the write is logged in the Change Log, and Undo is on the toast for 24 hours. Winner, Keep running and Loser close or park a test here and in Asana. Something else puts an action item on Work > Tasks. Done writes a line to the Change Log, which the Daily Brief reads for "What we did", and keeps the call quiet 3 days for everyone. Not now hides it for everyone until tomorrow. The same memory as Ads > Buyer list.']) : ''}</div>${list.map(row).join('')}${rs.length > 3 && !one ? `<button type="button" class="v2link" data-more="${esc(id)}" style="margin-top:8px">${OPEN[id] ? 'Show fewer' : `Show ${rs.length - 3} more`}</button>` : ''}</section>`; }).join('');
    const win = (d.brands || [])[0];
    const nAll = vis.length;
    const sub = `<b>${nAll} call${nAll === 1 ? '' : 's'} today, ad set first</b>, ranked by money at stake.${win ? ` Judged on last platform click, ${md(win.from)} to ${md(win.to)}.` : ''}`;
    $('#main').innerHTML = shell('today', title, `<p class="v2say lead">${sub}</p>${gapBan}${doBar}${counts}
      ${groups || U().card('Nothing to do', '', `<p class="v2hint">${KIND === 'all' ? 'No ad set crossed a rule, nothing needs fixing and no test needs a call.' : 'Nothing of this kind today.'}</p>`)}
      ${one ? `<p class="v2hint"><button type="button" class="v2link" data-go="act:${esc(one.act_id)}:mtoday">Spend today, hour by hour, against a normal day ›</button></p>` : ''}`);
    const root = $('#main');
    /* the one page action lives in the header and presses the hidden original (its handler is wired below) */
    if (doList.length && typeof H.pageActions === 'function') { H.pageActions(`<button type="button" class="btn primary" data-press="dkDoAll" title="Every Scale, Cut and Trim on this list. You see each change and confirm once; nothing is written before that.">${doList.length === 1 ? 'Do the 1 call' : `Do all ${doList.length} calls`}</button>`); root.querySelectorAll('.ph-acts [data-press]').forEach(b => b.onclick = () => { const o = document.getElementById(b.dataset.press); if (o) o.click(); }); }
    else if (typeof H.pageActions === 'function') H.pageActions('');
    const find = k => rows.find(x => x.key === k);
    /* THE LOOP (2026-10-21): a call acted on is a task done. One row in p_action per call key per day, source 'today',
       ticked at once with done_how auto:call, so the report's Done list, the Monday runner's last-week list and the brief all
       say what was changed. Fire and forget: the call itself never waits on it. */
    const logCallTask = (r, verb) => {
      if (!r || !H.apiAH) return;
      const text = `${verb} ${r.ad ? `"${r.ad}"` : r.adset ? `ad set "${r.adset}"` : 'an ad set'}`;
      H.apiAH('/api/actions', { method: 'POST', body: JSON.stringify({ act: r.act_id, text, detail: r.why ? `${r.why} From Today's calls.` : "From Today's calls.", owner: '', due: '', area: 'ads', kind: 'team', source: 'today', source_id: `${todayKey}:${r.key}` }) })
        .then(res => { const id = res && res.item ? res.item.id : res && res.id; if (id) return H.apiAH('/api/actions/done', { method: 'POST', body: JSON.stringify({ id, done: true }) }); })
        .catch(() => {});
    };
    const markDone = k => { LOCAL[k] = 'done'; putState(find(k), 'done'); };
    const unDone = k => { LOCAL[k] = 'clear'; putState(find(k), 'clear'); };
    root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { KIND = b.dataset.k; today(false); });
    const closeMore = () => root.querySelectorAll('.dk-more.open').forEach(m => { m.classList.remove('open'); const b = m.querySelector('.dk-more-b'); if (b) b.setAttribute('aria-expanded', 'false'); });
    root.querySelectorAll('.dk-more-b').forEach(b => b.onclick = e => {
      e.stopPropagation(); const w = b.closest('.dk-more'), menu = w.querySelector('.dk-menu');
      if (window.LxPhone && LxPhone.isPhone && LxPhone.isPhone()) {
        const name = (b.closest('.dk-row')?.querySelector('.nm') || {}).textContent || 'This call';
        LxPhone.open(name.trim(), `<div class="dk-menu" style="display:flex;position:static;box-shadow:none;border:0">${menu.innerHTML}</div>`, box => box.addEventListener('click', ev => {
          const t = ev.target.closest('button,a'); if (!t) return;
          if (t.tagName === 'BUTTON') { ev.preventDefault(); const sel = [...t.attributes].filter(a => a.name.startsWith('data-')).map(a => `[${a.name}="${a.value.replace(/"/g, '\\"')}"]`).join(''); const orig = sel && menu.querySelector(sel); if (orig) orig.click(); }
          setTimeout(() => LxPhone.close(), 0);
        }));
        return;
      }
      const open = w.classList.contains('open'); closeMore(); if (!open) { w.classList.add('open'); b.setAttribute('aria-expanded', 'true'); }
    });
    root.querySelectorAll('.dk-menu button').forEach(b => b.addEventListener('click', closeMore));
    document.addEventListener('click', closeMore, { once: true });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMore(); }, { once: true });
    root.querySelectorAll('[data-more]').forEach(b => b.onclick = () => { OPEN[b.dataset.more] = !OPEN[b.dataset.more]; today(false); });
    root.querySelectorAll('[data-go]').forEach(el => el.onclick = () => { const [, id, tab] = el.dataset.go.split(':'); pickAct(id, tab); });
    root.querySelectorAll('[data-snooze]').forEach(b => b.onclick = () => { const k = b.dataset.snooze; LOCAL[k] = 'skipped'; putState(find(k), 'skipped'); today(false); });
    root.querySelectorAll('[data-done]').forEach(b => b.onclick = async () => {
      const k = b.dataset.done, r = find(k); if (!r) return;
      if (dn[k]) { unDone(k); return today(false); }
      b.disabled = true; b.textContent = 'Logging…';
      const verb = { scale: 'Scaled', cut: 'Cut', trim: 'Switched off', fix: 'Fixed', refresh: 'Briefed an iteration of', mixed: 'Decided on' }[r.kind] || 'Acted on';
      try {
        await H.apiAH('/api/activities', { method: 'POST', body: JSON.stringify({ act_id: r.act_id, category: 'manual', summary: `${verb} ${r.ad ? `"${r.ad}"` : `ad set "${r.adset}"`} (from Today)`, reason: r.why || null, actor: 'Locus Today' }) });
        logCallTask(r, verb); markDone(k); today(false);
      } catch (e) { b.disabled = false; b.textContent = 'Done'; H.confirmModal && H.confirmModal('Could not log it', esc(e.message), 'OK'); }
    });
    root.querySelectorAll('[data-brief]').forEach(b => b.onclick = () => { const r = find(b.dataset.brief); if (r && H.AskUI) H.AskUI.ask(`For ${r.brand}: the anchor ad "${r.ad}" in ad set "${r.adset}" is tiring (${r.why}). Brief three iterations of it as an Asana brief: same angle, new hooks.`); });
    /* Do it: the shared Meta write (nudge.js). The write logs itself in the Change Log, so Done here only greys the row. */
    root.querySelectorAll('[data-do]').forEach(b => b.onclick = () => {
      const r = find(b.dataset.do); if (!r) return;
      const W = window.LxMetaWrite; if (!W) { dtoast('The Meta write helper did not load. Hard-refresh (Ctrl+Shift+R).', true); return; }
      const opts = { reason: 'From Today', onDone: () => { logCallTask(r, { scale: 'Scaled', cut: 'Cut', trim: 'Switched off', fix: 'Fixed', refresh: 'Refreshed' }[r.kind] || 'Changed'); markDone(r.key); CACHE.delete(`/api/hub/today?act=${encodeURIComponent(H.S.act)}`); if (window.LxNudge) window.LxNudge.state.at = 0; today(false); }, onUndo: () => { unDone(r.key); today(false); },
        onCampaign: () => openInLocus(r) };
      if (r.kind === 'scale') W.budget(H, r, { ...opts, pct: 0.2, amount: r.suggested_budget > 0 ? r.suggested_budget : undefined });
      else W.pause(H, r, opts);
    });
    root.querySelectorAll('[data-locus]').forEach(b => b.onclick = () => { const r = find(b.dataset.locus); if (r) openInLocus(r); });
    root.querySelectorAll('[data-neg]').forEach(b => b.onclick = () => { const r = find(b.dataset.neg); if (r && window.V4) window.V4.negatives(H, r, () => { logCallTask(r, 'Blocked wasted searches on'); markDone(r.key); today(false); }); });
    root.querySelectorAll('[data-set]').forEach(el => { const open = () => { const r = find(el.dataset.set); if (!r || !window.V4) return; const row = el.closest('.dk-row'); window.V4.setPanel(H, r, { am: amLink(r), doIt: DO_TIP[r.kind] ? () => row.querySelector('[data-do]')?.click() : null, locus: () => openInLocus(r) }); }; el.onclick = open; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }; });
    root.querySelectorAll('[data-else]').forEach(b => b.onclick = () => { const r = find(b.dataset.else); if (r) somethingElse(r); });
    root.querySelectorAll('[data-verdict]').forEach(b => b.onclick = () => { const r = find(b.dataset.key); if (r) callTest(r, b.dataset.verdict, () => { CALLED[r.key] = 1; CACHE.delete('/api/brand/tests-overview'); today(false); }); });
    /* The ad on the call: covers per brand (the cover cache is per ad account), a tap plays it. */
    const byAct = {}; root.querySelectorAll('.dk-th[data-thumb]').forEach(el => { const r = find(el.dataset.play); if (r) (byAct[r.act_id] ??= []).push(el.dataset.thumb); });
    if (window.V2 && window.V2.thumbs) for (const [act, ids] of Object.entries(byAct)) window.V2.thumbs(root, ids, act, H);
    root.querySelectorAll('[data-play]').forEach(b => b.onclick = () => { const r = find(b.dataset.play), ad = r && adOf(r); if (!ad) return;
      if (!window.V2 || !window.V2.playAd) { openInLocus({ ...r, ad_id: ad.id }); return; }
      window.V2.playAd({ id: ad.id, name: ad.name, act: r.act_id, note: `${r.kind === 'trim' ? 'The ad this call turns off' : 'The main ad'} in "${r.adset || ''}", ${r.brand}.` }, H, () => openInLocus({ act_id: r.act_id, ad_id: ad.id })); });
    /* Do all N: one sheet, every change ticked, run one by one after Cole confirms. */
    const afterAll = () => { CACHE.delete(`/api/hub/today?act=${encodeURIComponent(H.S.act)}`); if (window.LxNudge) window.LxNudge.state.at = 0; if (t === H.RUN()) today(false); };
    const da = root.querySelector('#dkDoAll'); if (da) da.onclick = () => doAll(doList, { markDone, unDone, logCallTask, after: afterAll });
    if (window.TODAY_DOALL) { window.TODAY_DOALL = 0; if (doList.length) doAll(doList, { markDone, unDone, logCallTask, after: afterAll }); }
  }
  /* The ad a call is about: Trim = the ad it turns off; Scale / Cut / Refresh = the set's main ad (the anchor, else the
     top-spend ad, hub.js top_ad). Fix and test calls have none. */
  function adOf(r) {
    if (r.kind === 'trim' || r.kind === 'refresh') return r.ad_id ? { id: r.ad_id, name: r.ad } : null;
    if (r.kind === 'scale' || r.kind === 'cut' || r.kind === 'mixed') { const a = (r.anchor && r.anchor.ad_id ? r.anchor : null) || (r.top_ad && r.top_ad.ad_id ? r.top_ad : null); return a ? { id: a.ad_id, name: a.name } : null; }
    return null;
  }
  /* DO ALL N (2026-10-15). One sheet (a .modal-wrap: centred on a computer, rising from the bottom on a phone) lists every
     change in plain words, all ticked: "Pause the ad set X", "Raise the budget on X 20%, from $a to $b a day" (the live
     budget read from Meta first, the same rise Do it uses), "Turn off the ad Z in X". The ticked ones run in order through
     LxMetaWrite.run (dry run, then the write with expect), each line shows its own result and an Undo; one failure never
     stops the rest. A set on its campaign's budget cannot be raised here and says so, unticked. */
  async function doAll(list, fx) {
    const W = window.LxMetaWrite; if (!W || !W.run) { dtoast('The Meta write helper did not load. Hard-refresh (Ctrl+Shift+R).', true); return; }
    if (document.querySelector('.dk-all-w')) return;
    const ord = [...new Set(list.map(r => r.act_id))], brands = ord.length > 1;
    list = list.slice().sort((a, b) => ord.indexOf(a.act_id) - ord.indexOf(b.act_id));   // one block per brand, biggest call first inside it
    const plan = list.map(r => ({ r, on: true, amount: null, text: r.kind === 'cut' ? `Pause the ad set "${r.adset}"` : r.kind === 'trim' ? `Turn off the ad "${r.ad}" in "${r.adset}"` : `Raise the budget on "${r.adset}" 20% (reading it from Meta…)` }));
    let lastB = null;
    const items = plan.map((p, i) => { const g = brands && p.r.brand !== lastB ? `<div class="dk-all-g">${esc(p.r.brand)}</div>` : ''; lastB = p.r.brand;
      return `${g}<div class="dk-all-i" data-i="${i}"><input type="checkbox" checked aria-label="Include this change" data-c="${i}"><span class="dk-k ${p.r.kind}">${p.r.kind.toUpperCase()}</span><span class="t">${esc(p.text)}</span><span class="st" data-st></span></div>`; }).join('');
    const w = document.createElement('div'); w.className = 'modal-wrap dk-all-w';
    w.innerHTML = `<div class="modal lx-nudge-m dk-all" role="dialog" aria-modal="true" aria-labelledby="dkAllH"><h3 id="dkAllH">${list.length === 1 ? 'Make this call?' : `Make all ${list.length} calls?`}</h3>
      <p class="hint">Untick anything you want to leave. Nothing is written until you press the button; then each change goes to Meta one at a time, is logged in the Change Log, and has its own Undo.</p>
      <div class="dk-all-l">${items}</div><p class="lx-nudge-err" data-err hidden></p>
      <div class="row lx-nudge-ma"><span class="faint" data-sum></span><button class="btn" data-m="no" type="button">Cancel</button><button class="btn primary" data-m="yes" type="button" disabled>Reading budgets…</button></div></div>`;
    document.body.appendChild(w);
    const yes = w.querySelector('[data-m="yes"]'), no = w.querySelector('[data-m="no"]'), sum = w.querySelector('[data-sum]');
    let running = false, ran = false;
    const close = () => { if (running) return; w.remove(); document.removeEventListener('keydown', key); if (ran) fx.after(); };
    const key = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    no.onclick = close;
    const line = i => w.querySelector(`.dk-all-i[data-i="${i}"]`);
    const count = () => plan.filter(p => p.on).length;
    const label = () => { if (ran || running) return; const n = count(); yes.disabled = !n; yes.textContent = n === 1 ? 'Make 1 change' : `Make ${n} changes`; };
    w.querySelectorAll('[data-c]').forEach(c => c.onchange = () => { const p = plan[+c.dataset.c]; p.on = c.checked; line(+c.dataset.c).classList.toggle('off', !c.checked); label(); });
    const skip = (i, why) => { const p = plan[i], el = line(i); p.on = false; const c = el.querySelector('input'); c.checked = false; c.disabled = true; el.classList.add('off'); el.querySelector('.st').textContent = why; };
    /* The live budgets, one Meta read per brand (metaLive keeps the last one for 5 minutes). */
    const acts = [...new Set(plan.filter(p => p.r.kind === 'scale').map(p => p.r.act_id))];
    for (const act of acts) {
      let live = null, err = null; try { live = await W.metaLive(H, act); } catch (e) { err = e.message; }
      if (!w.isConnected) return;
      plan.forEach((p, i) => { if (p.r.kind !== 'scale' || p.r.act_id !== act) return;
        const o = live && live.adsets && live.adsets[p.r.adset_id], t = line(i).querySelector('.t');
        if (!o) { t.textContent = `Raise the budget on "${p.r.adset}"`; return skip(i, err ? `Could not read the budget: ${err}` : 'Meta did not return this ad set; it may have been removed.'); }
        if (!o.daily && !o.lifetime) { t.textContent = `Raise the budget on "${p.r.adset}"`; return skip(i, 'It runs on its campaign\'s budget, so raise it on Ads > Meta > Campaigns.'); }
        const from = o.daily || o.lifetime, to = p.r.suggested_budget > 0 ? Math.round(p.r.suggested_budget) : Math.round(from * 1.2), per = o.daily ? ' a day' : ' in total', cur = p.r.currency || 'USD';
        p.amount = to;
        t.textContent = `Raise the budget on "${p.r.adset}" ${Math.round((to - from) / from * 100)}%, from ${U().money(from, cur)} to ${U().money(to, cur)}${per}`;
      });
    }
    label();
    yes.onclick = async () => {
      if (ran) return close();
      running = true; yes.disabled = true; no.disabled = true; yes.textContent = 'Writing to Meta…';
      w.querySelectorAll('[data-c]').forEach(c => { c.disabled = true; });
      let ok = 0, bad = 0;
      for (const [i, p] of plan.entries()) {
        if (!p.on) continue;
        const st = line(i).querySelector('.st'); st.className = 'st'; st.textContent = 'Writing…';
        let res; try { res = await W.run(H, p.r, { kind: p.r.kind === 'scale' ? 'budget' : 'pause', amount: p.amount, reason: 'From Today (Do all)' }); } catch (e) { res = { ok: false, error: e.message }; }
        if (res && res.ok) {
          ok++; try { fx.logCallTask && fx.logCallTask(p.r, { scale: 'Scaled', cut: 'Cut', trim: 'Switched off', fix: 'Fixed', refresh: 'Refreshed' }[p.r.kind] || 'Changed'); fx.markDone(p.r.key); } catch {}
          st.className = 'st ok'; st.innerHTML = `<span>Done${res.summary ? `: ${esc(res.summary)}` : ''}</span>${res.write && res.write.write ? '<button type="button" class="v2link" data-undo="1">Undo</button>' : ''}`;
          const u = st.querySelector('[data-undo]');
          if (u) u.onclick = () => { u.disabled = true; u.textContent = 'Undoing…'; W.undo(H, [res.write], p.r, async () => { try { fx.unDone(p.r.key); } catch {} st.className = 'st'; st.textContent = 'Undone. Meta has the old value back.'; }).then(() => { if (u.isConnected) { u.disabled = false; u.textContent = 'Undo'; } }); };
        } else { bad++; st.className = 'st bad'; st.textContent = `Not made: ${(res && res.error) || 'Meta did not answer.'}`; }
      }
      running = false; ran = true; no.hidden = true;
      sum.textContent = `${ok} made${bad ? `, ${bad} not made` : ''}. Undo is on each line.`;
      yes.disabled = false; yes.textContent = 'Close';
    };
  }
  /* The ad set on Campaigns (the campaign opened, the ad set row lit), the ad's preview on Ads, the overview for a Fix. */
  function openInLocus(r) {
    if (r.ad_id) { window.V2PENDING = { ad: r.ad_id }; return pickAct(r.act_id, 'adcreative'); }
    if (r.adset_id) { window.V2PENDING = { ...(r.campaign_id ? { campaign: r.campaign_id } : {}), adset: r.adset_id }; return pickAct(r.act_id, 'campaigns'); }
    pickAct(r.act_id, 'meta');
  }
  /* Something else: one line, an owner, a due date -> a Locus action item (account-health actions.js, Work > Action items). */
  function somethingElse(r) {
    const what = r.ad ? `the ad "${r.ad}" in "${r.adset}"` : r.adset ? `ad set "${r.adset}"` : r.brand;
    formModal(`Something else for ${r.brand}`, `About ${esc(what)}. This puts an action item on the list; Slack reminds the owner the morning it is due.`,
      `<label>What needs doing<input type="text" name="text" required maxlength="300" placeholder="e.g. Rebuild it with the new hook and a fresh audience"></label>
       <label>Who does it<select name="owner">${OWNERS.map(o => `<option value="${o}">${o}</option>`).join('')}<option value="">Nobody yet</option></select><small>By first name. Slack reminds them when it is due.</small></label>
       <label>Due<input type="date" name="due" value="${plusDays(2)}"></label>`, 'Add to the list', async form => {
        const f = new FormData(form);
        const text = String(f.get('text') || '').trim(), owner = String(f.get('owner') || ''), due = String(f.get('due') || '');
        const j = await H.apiAH('/api/actions', { method: 'POST', body: JSON.stringify({ act: r.act_id, text, detail: `${what}. From Today's ad calls: ${String(r.why || r.kind).slice(0, 300)}`, owner: owner || null, due: due || null, kind: 'team', source: 'today', source_id: r.key }) });
        if (!j || j.error) throw new Error(j && j.error || 'Locus did not answer.');
        dtoast(`On the list${owner ? ` for ${owner}` : ''}.`, false, j.item && j.item.url ? { href: j.item.url, label: 'Open the list' } : null);
      });
  }
  /* Winner / Loser close the test with a one-line learning; Keep running parks it with a reason and a date. Both go to
     the profit worker (/api/brand/verdict) and to the Asana task (/api/brand-asana/result) so the hourly sync keeps it. */
  function callTest(r, verdict, after) {
    const c = r.test, who = H.S.meEmail || 'Locus Today', name = `Test ${c.num}`;
    const fields = verdict === 'keep'
      ? `<label>Why keep it running<select name="reason">${KEEP_WHY.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
         <label>Check again on<input type="date" name="check" required value="${plusDays(7)}"><small>Locus brings it back here on that day.</small></label>`
      : `<label>What this test taught us<input type="text" name="learning" required maxlength="300" placeholder="One line the next strategist should know"></label>`;
    const title = verdict === 'winner' ? `${name}: call it a winner?` : verdict === 'loser' ? `${name}: call it a loser?` : `${name}: keep it running?`;
    formModal(title, `${esc(c.title || '')}. ${esc(r.why || '')}${verdict === 'keep' ? '' : ' The test closes in Locus and the Asana task is completed with the result set.'}`, fields, verdict === 'keep' ? 'Keep it running' : verdict === 'winner' ? 'Winner' : 'Loser', async form => {
      const f = new FormData(form);
      const learning = String(f.get('learning') || '').trim(), reasonKey = String(f.get('reason') || 'other'), check = String(f.get('check') || '');
      const reason = (KEEP_WHY.find(x => x[0] === reasonKey) || [])[1] || reasonKey;
      const body = verdict === 'keep' ? { act: r.act_id, id: c.id, verdict: 'keep', keep_reason: reason, check_again: check, who, light: true }
        : { act: r.act_id, id: c.id, verdict, learning, who, light: true };
      const j = await H.api('/api/brand/verdict', { method: 'POST', body: JSON.stringify(body) });
      if (!j || j.error) throw new Error(j && j.error || 'Could not save the call.');
      let asana = null;
      try { asana = document.body.classList.contains('is-client') ? null : await H.apiAH('/api/brand-asana/result', { method: 'POST', body: JSON.stringify({ act: r.act_id, id: c.id, result: verdict, learning, keep_reason: reasonKey, check_again: check, who }) }); }
      catch (e) { asana = { error: e.message }; }
      after();
      if (asana && asana.error) dtoast(`Saved in Locus. Asana was not updated: ${asana.error}`, true, c.asana_url ? { href: c.asana_url, label: 'Open the task' } : null);
      else dtoast(verdict === 'keep' ? `${name} keeps running. Back here on ${check}.` : `${name} closed as a ${verdict}${asana && asana.asana ? ', Asana updated' : ''}.`, false, c.asana_url ? { href: c.asana_url, label: 'Open the task' } : null);
    });
  }

  /* =========================================================================================
   * SEASON > WAR ROOM (rebuilt 2026-10-09: Triple Whale's BFCM Command Center, done in Locus).
   * Cole: "the war room should be like Triple Whale's war room, full on plans and everything, the actual war room."
   * 2026-10-13, after "the war room is super confusing, not sure if you did the plan or the live": the season item is
   * THREE PAGES, each one job. `warplan` = The Plan (six steps: last year, goals and the ladder, the budget, the offers
   * with the same editor as Offers and dates, the Slack alert thresholds, stock on the heroes). `warlive` = Live (today
   * against the plan hour by hour, the desk, spend by channel, alerts fired, one stock line). `season` (season.js) =
   * Offers and dates. The in-page Plan / Live switch opens the other page through the host's show(), so the rail follows.
   * All clients: every brand in the season, riskiest first, on both pages. Data: GET /api/season/war (season.js).
   * Writes: PUT /api/season/war (the plan, merged server side), PUT /api/season/answer key goals (the ladder, one place),
   * account-health /api/alerts (thresholds as real Slack alerts, source 'war', only inside the sale dates),
   * PUT /api/season/checkin (the desk). Stock from the Supply worker; the read from account-health /api/read.
   * A client login sees its own brand read only (`ro` = isCl(): no edits, no stock, no alerts, no read).
   * ======================================================================================= */
  const SUP = 'https://mobius-supply.mobius-digital.workers.dev';
  const WR = { mode: {}, page: 'war', tv: false, timer: null, data: null, stock: {}, supBrands: null, goals: null, bud: null, alerts: null };
  const ANCHOR = { baseline: 'wrBase', goals: 'wrGoals', ladder: 'wrGoals', budget: 'wrBudget', offers: 'wrOffers', alerts: 'wrAlerts', stock: 'wrStock' };
  const isCl = () => H.S.role === 'client';
  const seasonLabel = () => (window.SEASON_TAB && window.SEASON_TAB().label) || 'Black Friday';
  const warTitle = m => `${esc(seasonLabel())}: ${m === 'live' ? 'Live' : 'The Plan'}`;
  /* The host's page ids (2026-10-13): `warplan` and `warlive` are the rail tabs; `war` still renders for old links and
     Slack buttons. index.html sets window.WAR_MODE ('plan' | 'live' | null) from the page id before render; when it is
     undefined the host is older than this file, and the Plan / Live switch re-renders in place instead of show(). */
  const PAGE_OF = m => m === 'live' ? 'warlive' : 'warplan';
  const hostKnowsPages = () => typeof window.WAR_MODE !== 'undefined';
  const isWarTab = t => t === 'war' || t === 'warplan' || t === 'warlive';
  /* One step per section (2026-10-13): the server lists goals and the ladder as two steps, the page shows them in one
     section, so they are one step here. Numbers run 1..N with no gap; sections take their number from this list. */
  function planSteps(steps) {
    const out = [];
    for (const s of steps || []) {
      if (s.key === 'ladder') { const g = out.find(x => x.key === 'goals'); if (g) { g.done = g.done && s.done; g.label = 'Set the goals and the ladder'; g.why = [g.why, s.why].filter(Boolean).join(' '); continue; } }
      out.push({ ...s });
    }
    return out;
  }
  const stepNo = (d, k) => (d.psteps || []).findIndex(s => s.key === k) + 1;
  const wcur = () => (WR.data && WR.data.currency) || 'USD';
  const Mo = n => U().money(n, wcur()), Ko = n => U().kmoney(n, wcur()), Xo = n => U().x2(n), In = n => U().int(n);
  const addD = (s, n) => { const x = new Date(s + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const dBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
  const numIn = v => { const n = parseFloat(String(v ?? '').replace(/[$,%x\s]/gi, '')); return Number.isFinite(n) ? n : null; };
  const fmtG = (metric, v) => v == null ? '–' : metric === 'mer' ? Xo(v) : metric === 'aov' ? Mo(v) : metric === 'orders' || metric === 'new_customers' ? In(v) : Ko(v);
  const lyOf = (d, metric) => { const t = d.baseline && d.baseline.totals; if (!t) return null; return { revenue: t.sales, orders: t.orders, aov: t.aov, mer: t.mer, new_customers: t.new_orders, spend: t.spend }[metric] ?? null; };
  const hourWord = h => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
  const centralHour = () => +new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(new Date());
  const STAT = { locked: 'Locked', draft: 'Draft', proposed: 'Proposed', missing: 'Missing', skip: 'Skipped' };
  const toast = (msg, bad) => { let el = document.getElementById('wrToast'); if (!el) { el = document.createElement('div'); el.id = 'wrToast'; el.className = 'wr-toast'; document.body.appendChild(el); } el.textContent = msg; el.className = `wr-toast on${bad ? ' bad' : ''}`; clearTimeout(toast.t); toast.t = setTimeout(() => { el.className = 'wr-toast'; }, bad ? 5000 : 2400); };
  /* The scaling ladder (copy of season.js ladderOf: keep in step). Grades the last 3 hours of blended MER. */
  function ladderOf(g, mer, spent) {
    if (!g || g.be == null || g.target == null) return { text: 'No ladder set', cls: '' };
    if (mer == null) return { text: 'No spend yet', cls: '' };
    const floor = Math.max(100, ((g.start) || 0) * 3 / 24 * 0.5);
    if (spent != null && spent < floor) return { text: `Too early to grade: ${Mo(spent)} spent in 3 hours`, cls: '' };
    if (g.s100 != null && mer >= g.s100) return { text: 'Scale by 100%', cls: 'good', ok: 1 };
    if (g.s50 != null && mer >= g.s50) return { text: 'Scale by 50%', cls: 'good', ok: 1 };
    if (mer >= g.target) return { text: 'Hold', cls: '', ok: 1 };
    if (mer >= g.be) return { text: 'Pull back', cls: 'warn', ok: 1 };
    return { text: 'Rework the offer, consider turning ads off', cls: 'bad', ok: 1 };
  }
  const kpi = (label, value, sub, tone, tip) => `<div class="wr-k${tone ? ' ' + tone : ''}"${tip ? U().tipAttr(tip) : ''}><span class="l">${label}</span><b>${value}</b>${sub ? `<span class="s">${sub}</span>` : ''}</div>`;
  /* PHASE 7 (2026-10-20): the first sentence of a step's note is its one caption under the title; the rest waits in the
     card's "..." so no step opens with a paragraph. */
  /* REVIEW PASS B (2026-10-21, Cole: "Season has walls of text"): The Plan's page shows ONE line per step (`planLine`);
     the full section is drawn only inside the shared side panel (`openSec` -> window.V2.panel), with its whole note on top.
     n, done and title stay in the signature so the six section functions are unchanged. */
  const sec = (id, n, done, title, sub, body, cap) => `<section class="wr-sec wr-psec" id="${id}">${sub || cap ? `<div class="wr-psub">${sub ? `<p>${sub}</p>` : ''}${cap ? `<span class="cap">${cap}</span>` : ''}</div>` : ''}${body}</section>`;

  function warStop() { if (WR.timer && !WR.tv) { clearInterval(WR.timer); WR.timer = null; } }
  /** page = 'warplan' | 'warlive' | 'war' (old id: the mode comes from window.WAR_MODE, then the switch, then the date). */
  async function war(first, page) {
    css(); warStop();
    const t = H.RUN(), act = H.S.act || 'all';
    WR.page = page || 'war';
    const forced = page === 'warplan' ? 'plan' : page === 'warlive' ? 'live' : (window.WAR_MODE === 'plan' || window.WAR_MODE === 'live' ? window.WAR_MODE : null);
    const mode = forced || WR.mode[act] || null;
    if (first || !WR.data || (WR.data.act_id || 'all') !== act) $('#main').innerHTML = shell(WR.page, warTitle(mode || 'plan'), U().card('', '', `<p class="v2hint">Loading ${mode === 'live' ? 'today' : 'the plan'}&hellip;</p>`));
    if (act === 'all') return warGrid(t, mode);
    let d; try { d = await H.api(`/api/season/war?act=${encodeURIComponent(act)}${mode === 'live' ? '&live=1' : ''}`); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell(WR.page, warTitle(mode || 'plan'), U().card('Could not load the season', '', `<p class="v2bad">${esc(e.message)}</p>`)); return; }
    if (t !== H.RUN()) return;
    if (!WR.data || WR.data.act_id !== d.act_id) { WR.goals = null; WR.bud = null; }
    d.psteps = planSteps(d.steps);
    WR.data = d;
    const m = mode || (d.mode === 'live' ? 'live' : 'plan');
    WR.mode[act] = m;
    paintWar(t, d, m);
  }
  /** The Plan / Live switch: the other page through the host (the rail follows), or in place on an older host. */
  function goMode(act, m) {
    WR.mode[act] = m;
    if (m === 'plan' && WR.tv) tvMode(false, true);
    if (hostKnowsPages()) H.show(PAGE_OF(m)); else war(false, WR.page);
  }
  function paintWar(t, d, m) {
    const done = d.psteps.filter(s => s.done).length;
    $('#main').innerHTML = shell(WR.page, warTitle(m), `<div class="wr${WR.tv ? ' tv' : ''}" id="wrRoot">${warStrip(d, m, done)}${m === 'live' ? liveBody(d) : planBody(d, done)}</div>`);
    const root = $('#wrRoot');
    root.querySelectorAll('[data-wrm]').forEach(b => b.onclick = () => goMode(d.act_id, b.dataset.wrm));
    const cfg = root.querySelector('#dkSeasonCfg'); if (cfg) cfg.onclick = seasonCfg;
    const rf = root.querySelector('#wrRefresh'); if (rf) rf.onclick = () => war(false, WR.page);
    const tv = root.querySelector('#wrTv'); if (tv) tv.onclick = () => tvMode(!WR.tv);
    if (m === 'live') wireLive(t, d); else wirePlan(t, d);
    /* A save inside a step's panel re-reads the plan: draw the same panel again from the new data, at the same scroll. */
    const open = document.querySelector('#v2panel.on .wr-pn'), re = WR.reopen || (open && open.dataset.wrsec);
    WR.reopen = null;
    if (m === 'plan' && re) openSec(d, re, true);
  }
  function warStrip(d, m, done) {
    const days = d.sale_days_to, N = d.psteps.length;
    const when = d.mode === 'live' ? '<b class="wr-dot">Live now</b>' : d.mode === 'after' ? 'The sale is over' : days === 1 ? 'Starts tomorrow' : `<b>${days}</b> days to go`;
    const nxt = d.psteps.find(s => !s.done);
    return `<div class="wr-strip">
      <div class="wr-seg" role="tablist" aria-label="The Plan or Live"><button type="button" role="tab" data-wrm="plan" class="${m === 'plan' ? 'on' : ''}" aria-selected="${m === 'plan'}">The Plan</button><button type="button" role="tab" data-wrm="live" class="${m === 'live' ? 'on' : ''}" aria-selected="${m === 'live'}">Live</button></div>
      <div class="wr-prog"${U().tipAttr(nxt ? `Next: ${esc(nxt.label)}. ${esc(nxt.why || '')}` : 'Every step is done.')}><span><b>${done} of ${N}</b> steps</span><i><em style="width:${(done / N * 100).toFixed(0)}%"></em></i></div>
      <div class="wr-when"><b>${esc(d.name)}</b><span>${when} · sale ${wd(d.sale.start)} ${md(d.sale.start)} to ${wd(d.sale.end)} ${md(d.sale.end)}</span></div>
      <div class="wr-acts">${m === 'live' ? `<span class="faint" id="wrAsOf">${d.live && d.live.as_of ? `as of ${new Date(d.live.as_of).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })} Central` : ''}</span><button type="button" class="v2btn ghost" id="wrRefresh">Refresh</button><button type="button" class="v2btn ghost" id="wrTv">${WR.tv ? 'Leave TV mode' : 'TV mode'}</button>` : ''}${!isCl() && !WR.tv ? '<button type="button" class="v2btn ghost" id="dkSeasonCfg">Name and when it shows</button>' : ''}</div>
    </div>`;
  }

  /* ---------------- PLAN ---------------- */
  function planBody(d, done) {
    const nxt = d.psteps.find(s => !s.done);
    return `<div class="wr-plan1"><p class="v2hint wr-next">${!nxt ? 'Every step is done. Live takes over on the first sale day.' : `<button type="button" class="v2link" data-wropen="${ANCHOR[nxt.key] || ''}"${nxt.why ? ` title="${esc(nxt.why)}"` : ''}>Next: ${esc(nxt.label)} ›</button>`}</p>
      ${baseLine(d)}${goalsLine(d)}${budgetLine(d)}${offersLine(d)}${alertsLine(d)}${stockLine(d)}</div>`;
  }
  /* ---- The Plan, one line per step (review pass B). A line = number, title, one short value, a status chip; a click
     opens the step's full section in the side panel. ---- */
  const SEC = {
    wrBase: ['Last year, the same days', d => baseSec(d)], wrGoals: ['Goals and the ladder', d => goalsSec(d)],
    wrBudget: ['Paid budget by channel', d => budgetSec(d)], wrOffers: ['Offers and key dates', d => offersSec(d)],
    wrAlerts: [null, d => alertsSec(d)], wrStock: ['Stock on the heroes', d => stockSec(d)],
  };
  const lchip = (tone, text) => !text ? '' : window.LxKit && LxKit.chip ? LxKit.chip(tone, text) : `<span class="v2pill ${tone}">${esc(text)}</span>`;
  function planLine(d, id, key, title, val, tone, status, extra = '') {
    const n = stepNo(d, key), done = stepDone(d, key);
    return `<section class="v2card wr-line" id="${id}L"><button type="button" class="wr-lb" data-wropen="${id}" aria-haspopup="dialog" title="Open: ${esc(title)}"><span class="wr-n${done ? ' done' : ''}">${done ? '✓' : n}</span><b class="t">${esc(title)}</b><span class="v">${val}</span>${lchip(tone, status)}<span class="wr-chev" aria-hidden="true">›</span></button>${extra}</section>`;
  }
  function baseLine(d) {
    const b = d.baseline || {}, T = b.totals, ok = d.war && d.war.baseline_ok;
    return planLine(d, 'wrBase', 'baseline', 'Last year, the same days', T ? `${Ko(T.sales)} revenue · ${Xo(T.mer)} MER · ${md(b.from)} to ${md(b.to)}` : `No days stored for ${md(b.from)} to ${md(b.to)}`, ok ? 'good' : 'warn', ok ? 'In use' : 'Not confirmed');
  }
  function goalsLine(d) {
    const list = (WR.goals && WR.goals.act === d.act_id ? WR.goals.list : d.goals_list) || [], rev = list.find(g => g.metric === 'revenue'), L = d.ladder || {};
    const val = `${rev && rev.target ? `${Ko(rev.target)} revenue goal` : `${list.length} goal${list.length === 1 ? '' : 's'}`} · ladder ${L.be != null && L.target != null ? 'set' : 'not set'}`;
    return planLine(d, 'wrGoals', 'goals', 'Goals and the ladder', esc(val), d.goals_saved ? 'good' : 'warn', d.goals_saved ? 'Saved' : 'Not saved');
  }
  function budgetLine(d) {
    const B = budDraft(d), left = (B.total || 0) - B.channels.reduce((s, c) => s + amountOf(B, c), 0);
    const st = !B.total ? ['warn', 'Not set'] : Math.abs(left) < 1 ? ['good', 'Fully split'] : ['warn', `${Ko(Math.abs(left))} ${left > 0 ? 'not split' : 'over'}`];
    return planLine(d, 'wrBudget', 'budget', 'Paid budget by channel', B.total ? `${Ko(B.total)} for the sale · ${B.channels.length} channel${B.channels.length === 1 ? '' : 's'}` : 'No budget yet', st[0], st[1]);
  }
  function offersLine(d) {
    const bfp = (d.phases || []).find(p => p.key === 'bf'), n = (d.phases || []).filter(p => p.status !== 'skip').length;
    const val = bfp ? `${esc(bfp.name)}: ${esc(bfp.offer || 'nothing written yet')}` : `${n} offer${n === 1 ? '' : 's'}`;
    const tone = !bfp ? 'bad' : bfp.status === 'locked' ? 'good' : bfp.status === 'draft' || bfp.status === 'proposed' ? 'warn' : 'bad';
    return planLine(d, 'wrOffers', 'offers', 'Offers and key dates', val, tone, bfp ? (STAT[bfp.status] || bfp.status) : `No ${seasonLabel()} weekend`);
  }
  /* The Slack alerts card is a short list: one row per alert with a switch that saves through saveAlerts (the same rules
     the panel's Save writes). The numbers stay editable in the panel. */
  const alertOn = (d, k) => ((d.war && d.war.alerts) || []).some(a => a.kind === k || (k === 'overspend' && a.kind === 'overspend_meta'));
  const thShort = (k, v) => v == null ? 'No number set' : k === 'overspend' ? `Over ${v}% of the day's budget` : k === 'mer' ? `Under ${Xo(v)}` : k === 'aov' ? `Under ${Mo(v)}` : `Under ${In(v)} days`;
  function alertsLine(d) {
    if (isCl()) return planLine(d, 'wrAlerts', 'alerts', 'Alerts', 'The Mobius team watches spend, MER, AOV and stock in Slack', '', '');
    const v = thDefaults(d), on = THRESH.filter(([k]) => alertOn(d, k)).length;
    const rows = THRESH.map(([k, l]) => { const o = alertOn(d, k);
      return `<div class="wr-alr"><span class="nm">${esc(l)}</span><span class="faint">${o ? esc(thShort(k, v[k])) : 'Off'}</span><input type="checkbox" class="lx-sw" data-alsw="${k}" aria-label="${esc(l)}"${o ? ' checked' : ''}></div>`; }).join('');
    return planLine(d, 'wrAlerts', 'alerts', 'Alerts in Slack', `${on} of ${THRESH.length} on · ${md(d.sale.start)} to ${md(d.sale.end)}`, on ? 'good' : 'quiet', on ? 'On' : 'Off', `<div class="wr-als">${rows}</div>`);
  }
  function stockLine(d) {
    const ok = d.war && d.war.stock_ok;
    if (isCl()) return planLine(d, 'wrStock', 'stock', 'Stock on the heroes', 'The Mobius team checks stock on your best sellers', '', '');
    return planLine(d, 'wrStock', 'stock', 'Stock on the heroes', `Against the sale's last day, ${md(d.sale.end)}`, ok ? 'good' : 'warn', ok ? 'Checked' : 'Not checked yet');
  }
  /** Open one step's full section in the shared side panel (wide), then wire it. keep = a repaint: hold the scroll. */
  function openSec(d, id, keep) {
    const S2 = SEC[id], P = window.V2 && window.V2.panel; if (!S2 || !P) return;
    const was = keep ? ((document.querySelector('#v2panel .pb') || {}).scrollTop || 0) : 0;
    const title = S2[0] || (isCl() ? 'Alerts' : 'Alerts in Slack');
    const pb = P(title, `<div class="wr wr-pn" data-wrsec="${id}">${S2[1](d)}</div>`);
    const pn = document.getElementById('v2panel'); if (pn) pn.classList.add('wide');
    if (!pb) return;
    if (was) pb.scrollTop = was;
    wireSec(H.RUN(), d, id, pb);
  }
  const stepDone = (d, k) => !!(d.psteps.find(s => s.key === k) || {}).done;

  function baseSec(d) {
    const b = d.baseline || {}, T = b.totals, ro = false;   // a client edits its own plan (the brand edition, 2026-10-10); only notes, alerts and the stock check stay the team's
    const tiles = T ? `<div class="wr-ks">${kpi('Revenue', Ko(T.sales), `${T.days} days`)}${kpi('Orders', In(T.orders))}${kpi('AOV', Mo(T.aov))}${kpi('Ad spend', Ko(T.spend))}${kpi('MER', Xo(T.mer), 'revenue over ad spend')}${kpi('New customers', In(T.new_orders))}</div>`
      : `<p class="v2hint">No Triple Whale days are stored for ${md(b.from)} to ${md(b.to)}, ${String(b.from || '').slice(0, 4)}. Pick other dates, or set the goals by hand.</p>`;
    const mx = Math.max(1, ...(b.days || []).map(x => x.sales || 0));
    const days = (b.days || []).map(x => `<tr${x.date === d.ly_bf ? ' class="bf"' : ''}><td>${wd(x.date)} ${md(x.date)}${x.date === d.ly_bf ? ' <span class="v2pill good">Black Friday</span>' : ''}</td>
      <td class="num wr-bc"><span class="wr-bar"><i style="width:${((x.sales || 0) / mx * 100).toFixed(1)}%"></i></span>${Ko(x.sales)}</td><td class="num">${In(x.orders)}</td><td class="num">${Mo(x.aov)}</td><td class="num">${Ko(x.spend)}</td><td class="num">${Xo(x.mer)}</td></tr>`).join('');
    const chs = (b.channels || []).filter(c => (c.revenue || 0) > 0 || (c.spend || 0) > 0);
    const cmx = Math.max(1, ...chs.map(c => c.revenue || 0));
    const chans = chs.map(c => `<div class="wr-ch"${U().tipAttr(`<b>${esc(c.label)}</b><br>${esc(c.attributed || '')}`)}><span class="n"><i style="background:var(--c-${['meta', 'google', 'tiktok', 'email'].includes(c.id) ? c.id : 'else'})"></i>${esc(c.label)}</span><span class="wr-bar"><i style="width:${((c.revenue || 0) / cmx * 100).toFixed(1)}%"></i></span><b>${Ko(c.revenue)}</b><span class="faint">${c.spend ? `${Ko(c.spend)} spent${c.roas ? `, ${Xo(c.roas)}` : ''}` : ''}</span></div>`).join('');
    const prods = (b.products || []).slice(0, 6).map(p => `<li><span>${esc(p.title)}</span><b>${Ko(p.revenue)}</b><span class="faint">${In(p.orders)} orders</span></li>`).join('');
    const ok = d.war && d.war.baseline_ok;
    const ctl = ro ? '' : `<div class="wr-win"><label>From<input type="date" id="wrBFrom" value="${esc(b.from)}"></label><label>Through<input type="date" id="wrBTo" value="${esc(b.to)}"></label><button type="button" class="v2btn ghost" id="wrBLoad">Load these days</button>
      ${ok ? '<span class="v2pill good">Using this baseline</span> <button type="button" class="v2link" id="wrBUndo">Not right</button>' : '<button type="button" class="v2btn dk-p" id="wrBOk">Use this baseline</button>'}</div>`;
    return sec('wrBase', stepNo(d, 'baseline'), stepDone(d, 'baseline'), 'Last year, the same days', `The same days around last year's Black Friday (${wdl(d.ly_bf)}, ${md(d.ly_bf)} ${d.ly_bf.slice(0, 4)}). Revenue is the P&amp;L line (sales less tax), orders are paid orders, channels are Triple Whale last platform click, products are the orders that carried them.`,
      `${ctl}${tiles}<h4>Revenue by day</h4><div class="v2tbl"><table class="wr-tbl"><thead><tr><th>Day</th><th>Revenue</th><th>Orders</th><th>AOV</th><th>Ad spend</th><th>MER</th></tr></thead><tbody>${days || '<tr><td colspan="6" class="faint">No days stored.</td></tr>'}</tbody></table></div>
        <div class="wr-2 wr-mt"><div><h4>Revenue by channel</h4>${chans || '<p class="v2hint">No channel rows for those days.</p>'}</div><div><h4>What sold</h4>${prods ? `<ol class="wr-prods">${prods}</ol>` : '<p class="v2hint">No stored orders for those days.</p>'}</div></div>`);
  }

  function goalsSec(d) {
    const ro = false;   // clients edit their own plan (brand edition)
    if (!WR.goals || WR.goals.act !== d.act_id) WR.goals = { act: d.act_id, list: d.goals_list.map(g => ({ ...g })) };
    const list = WR.goals.list;
    const opts = sel => Object.entries(d.metrics).map(([k, l]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(l)}</option>`).join('');
    const rows = list.map((g, i) => { const ly = lyOf(d, g.metric), ch = ly && g.target ? g.target / ly - 1 : null;
      return `<div class="wr-goal" data-gi="${i}">${ro ? `<b>${esc(d.metrics[g.metric])}</b>` : `<select data-gm aria-label="Metric">${opts(g.metric)}</select>`}
        ${ro ? `<b class="v">${fmtG(g.metric, g.target)}</b>` : `<input type="text" inputmode="decimal" data-gt value="${g.target ?? ''}" placeholder="Target for the sale" aria-label="Target">`}
        <span class="faint">Last year ${fmtG(g.metric, ly)}${ch != null ? ` · <b class="${ch >= 0 ? 'wr-up' : 'wr-dn'}">${ch >= 0 ? '+' : ''}${Math.round(ch * 100)}%</b>` : ''}</span>
        ${ro ? '' : `<button type="button" class="v2link" data-gx="${i}">Remove</button>`}</div>`; }).join('');
    const L = d.ladder || {};
    const box = (k, l, s, ph, fmt) => `<label>${l}${ro ? `<b class="v">${L[k] != null ? fmt(L[k]) : '–'}</b>` : `<input type="text" inputmode="decimal" data-lad="${k}" value="${L[k] ?? ''}" placeholder="${ph}">`}${s ? `<small>${s}</small>` : ''}</label>`;
    const lad = `<div class="wr-lad"><h4>The scaling ladder</h4><p class="v2hint">The desk on Live grades the last 3 hours of blended MER against these lines at 8am, 4pm and midnight.</p>
      <div class="wr-lrow">${[['be', 'Breakeven', 'Under it: rework the offer'], ['target', 'Target', 'Between: hold'], ['s50', 'Scale 50% at', ''], ['s100', 'Scale 100% at', '']].map(([k, l, s]) => box(k, l, s, 'MER, e.g. 2.0', Xo)).join('')}</div>
      <div class="wr-lrow wr-mt2">${[['start', 'Starting daily budget', 'The first sale day, all channels'], ['cap', 'Meta daily limit', 'What Meta lets the account spend']].map(([k, l, s]) => box(k, l, s, '$', Ko)).join('')}</div></div>
      <div class="wr-parts"><h4>Goals by part of the season</h4><p class="v2hint">What each phase on Offers and dates is graded against. The sale weekend's own goal is the revenue line above.</p>
      <div class="wr-lrow">${[['early', 'November', ''], ['dec', 'December', ''], ['total', 'Whole season', 'November and December together']].map(([k, l, s]) => box(k, l, s, '$', Ko)).join('')}</div></div>`;
    return sec('wrGoals', stepNo(d, 'goals'), stepDone(d, 'goals'), 'Goals and the ladder', `Up to five numbers to beat over the whole sale, ${md(d.sale.start)} to ${md(d.sale.end)}. Live tracks every one of them.${d.goals_saved ? '' : ' Filled from the season goals until you save.'}`,
      `<div class="wr-goals">${rows || '<p class="v2hint">No goals yet.</p>'}</div>${ro ? '' : `<div class="wr-row"><button type="button" class="v2link" id="wrGAdd"${list.length >= 5 ? ' disabled' : ''}>+ Add a goal</button><span class="faint">${list.length} of 5</span></div>`}${lad}
      ${ro ? '' : '<div class="wr-row"><button type="button" class="v2btn dk-p" id="wrGSave">Save goals and ladder</button><span class="v2hint" id="wrGMsg"></span></div>'}`);
  }

  function budDraft(d) {
    if (!WR.bud || WR.bud.act !== d.act_id) { const b = d.budget || {}; WR.bud = { act: d.act_id, total: b.total || null, channels: (b.channels || []).map(c => ({ id: c.id, unit: c.unit, value: c.value, metric: c.metric, target: c.target })) }; }
    return WR.bud;
  }
  const amountOf = (B, c) => c.unit === '%' ? (B.total || 0) * (c.value || 0) / 100 : (c.value || 0);
  /** The day split, from the server's shares of last year's same days (recomputed here so edits show at once). */
  function dayPlanC(d) {
    const rev = (WR.goals && WR.goals.act === d.act_id ? WR.goals.list : d.goals_list).find(g => g.metric === 'revenue');
    const goal = rev && rev.target ? rev.target : (d.ladder && d.ladder.bf) || null, B = budDraft(d);
    return (d.plan || []).map(x => ({ ...x, revenue: goal ? goal * x.share : null, spend: B.total ? B.total * x.spend_share : null }));
  }
  function budgetSec(d) {
    const ro = false, B = budDraft(d), ch = d.channel_names || {};
    const alloc = B.channels.reduce((s, c) => s + amountOf(B, c), 0), left = (B.total || 0) - alloc;
    const warn = !B.total ? '<div class="wr-warn amber"><b>No budget yet</b><span>Set the paid budget for the whole sale to start splitting it.</span></div>'
      : Math.abs(left) < 1 ? `<div class="wr-warn green"><b>${Ko(B.total)} fully allocated</b><span>Every dollar has a channel.</span></div>`
      : `<div class="wr-warn amber"><b>${Ko(Math.abs(left))} ${left > 0 ? 'not allocated' : 'over the total'}</b><span>${Ko(alloc)} of ${Ko(B.total)} is split across channels.</span></div>`;
    const rows = B.channels.map((c, i) => ro ? `<tr><td><b>${esc(ch[c.id] || c.id)}</b></td><td class="num">${Ko(amountOf(B, c))}</td><td>${c.metric ? `${c.metric.toUpperCase()} ${c.metric === 'cpa' ? Mo(c.target) : Xo(c.target)}` : ''}</td></tr>`
      : `<tr data-ci="${i}"><td><select data-cid aria-label="Channel">${Object.entries(ch).map(([k, l]) => `<option value="${k}"${k === c.id ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></td>
        <td><span class="wr-unit"><button type="button" data-cu="$" class="${c.unit !== '%' ? 'on' : ''}">$</button><button type="button" data-cu="%" class="${c.unit === '%' ? 'on' : ''}">%</button></span><input type="text" inputmode="decimal" data-cv value="${c.value ?? ''}" placeholder="0" aria-label="Amount"></td>
        <td class="num">${Ko(amountOf(B, c))}</td>
        <td><select data-cm aria-label="Key metric"><option value="">No key metric</option><option value="roas"${c.metric === 'roas' ? ' selected' : ''}>ROAS</option><option value="cpa"${c.metric === 'cpa' ? ' selected' : ''}>CPA</option></select><input type="text" inputmode="decimal" data-ct value="${c.target ?? ''}" placeholder="target" aria-label="Target" class="sm"></td>
        <td><button type="button" class="v2link" data-cx="${i}">Remove</button></td></tr>`).join('');
    const lyS = d.baseline && d.baseline.totals ? d.baseline.totals.spend : null;
    const dp = dayPlanC(d);
    const split = dp.length ? `<h4>Day by day</h4><div class="v2tbl"><table class="wr-tbl"><thead><tr><th>Day</th><th>Revenue goal</th><th>Budget</th><th>Last year that day</th></tr></thead><tbody>${dp.map(x => `<tr${x.date === d.bf ? ' class="bf"' : ''}><td>${wd(x.date)} ${md(x.date)}</td><td class="num">${Ko(x.revenue)}</td><td class="num">${Ko(x.spend)}</td><td class="num faint">${Ko(x.ly_sales)} (${wd(x.ly)} ${md(x.ly)})</td></tr>`).join('')}</tbody></table></div><p class="v2hint">Split by last year's shape of the same days${(d.plan || []).some(x => x.ly_sales) ? '' : ' (no history, so evenly)'}. Live paces each day against its row.</p>` : '';
    return sec('wrBudget', stepNo(d, 'budget'), stepDone(d, 'budget'), 'Paid budget by channel', `The paid budget for ${md(d.sale.start)} to ${md(d.sale.end)}, split by channel in dollars or percent.${lyS ? ` Last year's same days spent ${Ko(lyS)}.` : ''}`,
      `${ro ? '' : `<div class="wr-row"><label class="wr-tot">Paid budget for the sale<input type="text" inputmode="decimal" id="wrBTotal" value="${B.total ?? ''}" placeholder="$"></label>${lyS ? `<button type="button" class="v2link" id="wrBLike">Split like last year</button>` : ''}</div>`}
      ${warn}<div class="v2tbl"><table class="wr-tbl wr-btbl"><thead><tr><th>Channel</th><th>Budget</th><th>Dollars</th><th>Key metric</th>${ro ? '' : '<th></th>'}</tr></thead><tbody>${rows || `<tr><td colspan="5" class="faint">No channels yet.</td></tr>`}</tbody></table></div>
      ${ro ? '' : '<div class="wr-row"><button type="button" class="v2link" id="wrCAdd">+ Add a channel</button><button type="button" class="v2btn dk-p" id="wrBSave">Save the budget</button><span class="v2hint" id="wrBMsg"></span></div>'}${split}`);
  }

  function offersSec(d) {
    const from = addD(d.bf, -26), to = addD(d.bf, 10), span = dBetween(from, to) + 1;
    const pos = s => Math.max(0, Math.min(100, dBetween(from, s) / span * 100));
    const ph = (d.phases || []).filter(p => p.start && p.start <= to && (p.end || p.start) >= from);
    const ticks = []; for (let x = from; x <= to; x = addD(x, 1)) if (new Date(x + 'T12:00:00Z').getUTCDay() === 1) ticks.push(`<span class="tk" style="left:${pos(x)}%">${md(x)}</span>`);
    const mark = (s, l, c) => s >= from && s <= to ? `<i class="wr-mk ${c}" style="left:${(pos(s) + 50 / span).toFixed(2)}%"><b>${l}</b></i>` : '';
    const rows = ph.map(p => { const a = p.start < from ? from : p.start, b = (p.end || p.start) > to ? to : (p.end || p.start);
      return `<div class="wr-tlr"><span class="l" title="${esc(p.name)}">${esc(p.name)}</span><div class="tr"><i class="wr-tlb ${p.status}" style="left:${pos(a).toFixed(2)}%;width:${Math.max(1.6, (dBetween(a, b) + 1) / span * 100).toFixed(2)}%"${U().tipAttr(`<b>${esc(p.name)}</b> · ${md(p.start)}${p.end && p.end !== p.start ? ` to ${md(p.end)}` : ''}<br>${esc(p.offer || 'No offer written yet')}<br>${STAT[p.status] || ''}${p.who ? ` · ${esc(p.who)}` : ''}`)}><span>${esc((p.offer || STAT[p.status] || '').slice(0, 70))}</span></i></div></div>`; }).join('');
    const bfp = (d.phases || []).find(p => p.key === 'bf'), ro = false;
    const line = !bfp ? `<span class="v2pill bad">No ${esc(seasonLabel())} weekend phase</span>` : `<span class="v2pill ${bfp.status === 'locked' ? 'good' : bfp.status === 'draft' || bfp.status === 'proposed' ? 'warn' : 'bad'}">${esc(bfp.name)}: ${STAT[bfp.status] || bfp.status}</span> <span>${esc(bfp.offer || 'Nothing written yet.')}</span>`;
    /* The deal list and its editor are season.js's (one list, one modal, two pages). */
    const ST = window.SeasonTab;
    if (ST && ST.injectCss) ST.injectCss();
    const deals = ST && ST.dealsHtml ? `<div class="se wr-deals">${ST.dealsHtml({ phases: d.phases || [], goals: d.ladder || {} }, { ro, results: false })}</div>`
      : `<ul class="wr-evs">${(d.phases || []).map(p => `<li><b>${md(p.start)}</b><span>${esc(p.name)}: ${esc(p.offer || 'no offer written')}</span></li>`).join('')}</ul>`;
    return sec('wrOffers', stepNo(d, 'offers'), stepDone(d, 'offers'), 'Offers and key dates', `Every offer in order, the same list as Offers and dates: edit here or there, it is one plan. The step is done when the ${esc(seasonLabel())} weekend is locked with the client. Under it, the weeks around the sale with every other date from the Calendar (drops, launches, emails).`,
      `<div class="wr-offer">${line}${ro ? '' : ' <button type="button" class="v2link" id="wrAddPhase">+ Add a phase</button>'} <button type="button" class="v2link" data-go="season">Offers and dates ›</button></div>
      ${deals}
      <h4 class="wr-mt">The weeks around the sale</h4>
      <div class="wr-tl"><div class="wr-tlh"><span class="l"></span><div class="tr">${ticks.join('')}${mark(d.today, 'Today', 'today')}${mark(d.bf, 'Black Friday', 'bf')}</div></div>${rows || '<p class="v2hint">No phases in these weeks.</p>'}<div id="wrCal"><p class="v2hint">Reading the Calendar&hellip;</p></div></div>`);
  }
  async function editOffer(d, key) {
    const ST = window.SeasonTab; if (!ST || !ST.editPhase) return toast('The offer editor did not load. Open Offers and dates.', true);
    if (window.V2 && window.V2.closePanel) window.V2.closePanel();   // the editor is a modal that sits under the side panel
    const saved = await ST.editPhase({ tok: H.S.tok, url: H.S.url, act: d.act_id, phases: d.phases, name: d.name }, key);
    if (saved) { toast('Offer saved.'); WR.reopen = 'wrOffers'; war(false, WR.page); } else openSec(d, 'wrOffers');
  }
  async function fillCal(t, d) {
    const el = document.getElementById('wrCal'); if (!el) return;
    const from = addD(d.bf, -26), to = addD(d.bf, 10), span = dBetween(from, to) + 1;
    const pos = s => Math.max(0, Math.min(100, dBetween(from, s) / span * 100));
    let r; try { r = await H.apiAH(`/api/calendar?act=${encodeURIComponent(d.act_id)}&from=${from}&to=${to}&lite=1`); }
    catch (e) { if (t === H.RUN() && el.isConnected) el.innerHTML = `<p class="v2hint">The Calendar did not answer: ${esc(e.message)}</p>`; return; }
    if (t !== H.RUN() || !el.isConnected) return;
    const items = (r.items || []).filter(e => e.src !== 'season' && e.start && e.start <= to && (e.end || e.start) >= from && (!e.act || e.act === d.act_id));
    if (!items.length) { el.innerHTML = '<p class="v2hint">Nothing else on the Calendar in these weeks.</p>'; return; }
    const pins = items.map(e => `<i class="wr-pin ${esc(e.kind || '')}" style="left:${pos(e.start).toFixed(2)}%"${U().tipAttr(`<b>${esc(e.name)}</b><br>${md(e.start)}${e.end && e.end !== e.start ? ` to ${md(e.end)}` : ''} · ${esc(e.kind || e.src || '')}`)}></i>`).join('');
    el.innerHTML = `<div class="wr-tlr"><span class="l">Calendar</span><div class="tr pins">${pins}</div></div>
      <ul class="wr-evs">${items.sort((a, b) => a.start.localeCompare(b.start)).slice(0, 12).map(e => `<li><b>${wd(e.start)} ${md(e.start)}</b><span>${esc(e.name)}</span><span class="faint">${esc(e.kind || e.src || '')}</span></li>`).join('')}</ul>`;
  }

  /* Thresholds become real p_alert rules (account-health alerts.js fires them in Slack, the brand's internal channel),
     only between the sale's first and last day. */
  const THRESH = [
    ['overspend', 'Ad spend over budget', 'Alert when today\'s ad spend passes', '% of the day\'s budget', 'Checked every hour from 9am to 9pm Central. Uses the biggest sale day\'s budget, so it fires on real overspend only.'],
    ['mer', 'MER floor', 'Alert when today\'s MER is under', 'x', 'Checked once a day at the hour below.'],
    ['aov', 'AOV floor', 'Alert when today\'s AOV is under', '$', 'Checked once a day at the hour below. Catches a discount stacking too deep.'],
    ['stock', 'Stock cover', 'Alert when a best seller has under', 'days of stock', 'Checked at 9am. Needs a stock feed (Products).'],
  ];
  function thDefaults(d) {
    const th = (d.war && d.war.thresholds) || {}, T = d.baseline && d.baseline.totals;
    return { overspend: th.overspend ?? 120, mer: th.mer ?? (d.ladder && d.ladder.be) ?? null, aov: th.aov ?? (T && T.aov ? Math.round(T.aov * 0.85) : null), stock: th.stock ?? 14, hour: th.hour ?? 14 };
  }
  function alertsSec(d) {
    if (isCl()) return sec('wrAlerts', stepNo(d, 'alerts'), stepDone(d, 'alerts'), 'Alerts', '', '<p class="v2hint">The Mobius team gets a Slack alert when spend runs over budget, MER or AOV drops under the floor, or a best seller runs low during the sale.</p>');
    const v = thDefaults(d);
    const rows = THRESH.map(([k, l, pre, post, note]) => `<div class="wr-thr"><label class="lx-sw-l"><input type="checkbox" class="lx-sw" data-thon="${k}"${alertOn(d, k) ? ' checked' : ''}><b>${l}</b></label>
      <div class="q"><span>${pre}</span>${k === 'aov' ? '<span>$</span>' : ''}<input type="text" inputmode="decimal" data-th="${k}" value="${v[k] ?? ''}" placeholder="off" aria-label="${l}: the number"><span>${post === '$' ? '' : post}</span></div><small>${note}</small></div>`).join('');
    const hours = Array.from({ length: 13 }, (_, i) => i + 9).map(h => `<option value="${h}"${h === v.hour ? ' selected' : ''}>${hourWord(h)}</option>`).join('');
    return sec('wrAlerts', stepNo(d, 'alerts'), stepDone(d, 'alerts'), 'Alerts in Slack', `Real alerts: they post to ${esc(d.name)}'s internal Slack channel, at most once a day each, and only from ${md(d.sale.start)} to ${md(d.sale.end)}. A switch turns one on or off; an empty box turns it off too. What fired today shows on Live.`,
      `<div class="wr-ths">${rows}<div class="wr-thr"><b>Check MER and AOV at</b><div class="q"><select id="wrTHour">${hours}</select><span>Central</span></div><small>2pm matches the Plan B call.</small></div></div>
      <div class="wr-row"><button type="button" class="v2btn dk-p" id="wrASave">Save the Slack alerts</button><span class="v2hint" id="wrAMsg"></span></div>
      <div id="wrAList"></div>`);
  }
  async function fillAlerts(t, d) {
    const el = document.getElementById('wrAList'); if (!el || isCl()) return;
    const ids = (d.war.alerts || []).map(a => a.id);
    if (!ids.length) { el.innerHTML = '<p class="v2hint">No alerts saved yet.</p>'; return; }
    let r; try { r = await H.apiAH('/api/alerts'); WR.alerts = r.alerts || []; } catch (e) { el.innerHTML = `<p class="v2hint">Could not read the alerts: ${esc(e.message)}</p>`; return; }
    if (t !== H.RUN() || !el.isConnected) return;
    const mine = (r.alerts || []).filter(a => ids.includes(a.id));
    el.innerHTML = `<h4>Saved</h4><ul class="wr-al">${mine.map(a => `<li><span>${esc(a.rule)}</span><span class="faint">${a.last_status ? esc(a.last_status) : 'Not checked yet'}${a.last_fired ? ` · last fired ${new Date(a.last_fired).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span><button type="button" class="v2link" data-atest="${esc(a.id)}">Check now</button></li>`).join('') || '<li class="faint">The saved alerts were deleted elsewhere. Save again.</li>'}</ul><div id="wrATest"></div>`;
    el.querySelectorAll('[data-atest]').forEach(b => b.onclick = async () => {
      const out = el.querySelector('#wrATest'); out.innerHTML = '<p class="v2hint">Checking&hellip;</p>';
      try { const x = await H.apiAH('/api/alerts/test', { method: 'POST', body: JSON.stringify({ id: b.dataset.atest }) });
        out.innerHTML = `<p class="v2hint">${x.fires ? `<b>It would fire now:</b> ${esc(x.fired.map(f => f.text).join(' '))}` : x.checked ? 'Checked: it would not fire right now.' : esc([...(x.skipped || []), ...(x.waiting || [])][0] || 'Nothing to check yet.')} Nothing was posted.</p>`; }
      catch (e) { out.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; }
    });
  }
  /** The panel's thresholds: one box per alert; its switch off = that alert off. */
  function readTh(root) {
    const th = {}; root.querySelectorAll('[data-th]').forEach(i => { th[i.dataset.th] = numIn(i.value); });
    root.querySelectorAll('[data-thon]').forEach(c => { if (!c.checked) th[c.dataset.thon] = null; });
    const h = root.querySelector('#wrTHour'); th.hour = h ? +h.value : 14; return th;
  }
  /** A switch on The Plan's alert list: the saved numbers, with this alert on (its saved number, else the default) or off,
      every other alert left as it is. Saves through saveAlerts, like the panel. */
  async function toggleAlert(d, k, on, sw) {
    const v = thDefaults(d), th = { hour: v.hour };
    THRESH.forEach(([kk]) => { th[kk] = (kk === k ? on : alertOn(d, kk)) ? (v[kk] ?? null) : null; });
    if (on && th[k] == null) { sw.checked = false; return toast('Set a number for it first: open Alerts in Slack.', true); }
    document.querySelectorAll('[data-alsw]').forEach(x => { x.disabled = true; });
    await saveAlerts(d, th, null);
    document.querySelectorAll('[data-alsw]').forEach(x => { x.disabled = false; });
  }
  async function saveAlerts(d, th, msg) {
    if (msg) msg.textContent = 'Saving…';
    const dp = dayPlanC(d), maxDay = Math.max(0, ...dp.map(x => x.spend || 0));
    const B = budDraft(d), meta = B.channels.find(c => c.id === 'meta'), maxShare = Math.max(0, ...dp.map(x => x.spend_share || 0));
    const rules = [];
    if (th.overspend && maxDay > 0) rules.push({ kind: 'overspend', metric: 'spend', comparison: 'above', threshold: Math.round(maxDay * th.overspend / 100), at_hour_central: null });
    if (th.overspend && meta && amountOf(B, meta) > 0 && maxShare > 0) rules.push({ kind: 'overspend_meta', metric: 'meta_spend', comparison: 'above', threshold: Math.round(amountOf(B, meta) * maxShare * th.overspend / 100), at_hour_central: null });
    if (th.mer) rules.push({ kind: 'mer', metric: 'mer', comparison: 'below', threshold: th.mer, at_hour_central: th.hour });
    if (th.aov) rules.push({ kind: 'aov', metric: 'aov', comparison: 'below', threshold: th.aov, at_hour_central: th.hour });
    const sv = WR.stock[d.act_id] && WR.stock[d.act_id].v;
    if (th.stock && sv && sv.connected) rules.push({ kind: 'stock', metric: 'stock_cover', comparison: 'below', threshold: th.stock, at_hour_central: 9 });
    const notes = [];
    if (th.overspend && !(maxDay > 0)) notes.push(`Overspend needs a budget first (step ${stepNo(d, 'budget')}).`);
    if (th.stock && !(sv && sv.connected)) notes.push('Stock cover needs a stock feed.');
    const old = (d.war && d.war.alerts) || [], out = [];
    try {
      for (const r of rules) {
        const prev = old.find(a => a.kind === r.kind);
        const res = await H.apiAH('/api/alerts', { method: 'PUT', body: JSON.stringify({ id: prev && prev.id, act: d.act_id, metric: r.metric, comparison: r.comparison, threshold: r.threshold, window: 'today', baseline: 'fixed', at_hour_central: r.at_hour_central, starts: d.sale.start, ends: d.sale.end, source: 'war' }) });
        out.push({ kind: r.kind, id: res.alert.id });
      }
      for (const a of old) if (!out.some(o => o.kind === a.kind)) await H.apiAH(`/api/alerts?id=${encodeURIComponent(a.id)}`, { method: 'DELETE' }).catch(() => {});
      const w = await H.api('/api/season/war', { method: 'PUT', body: JSON.stringify({ act: d.act_id, patch: { thresholds: th, alerts: out } }) });
      d.war = w.war; toast(`${out.length} Slack alert${out.length === 1 ? '' : 's'} on for the sale.${notes.length ? ' ' + notes.join(' ') : ''}`); war(false, WR.page);
    } catch (e) { if (msg) msg.textContent = e.message; else { toast(e.message, true); war(false, WR.page); } }
  }

  function stockSec(d) {
    const ok = d.war && d.war.stock_ok;
    return sec('wrStock', stepNo(d, 'stock'), stepDone(d, 'stock'), 'Stock on the heroes', `Days of stock on last year's best sellers and this year's, against the sale's last day (${md(d.sale.end)}). From Products (Supply's own dates). Live repeats this as one line.`,
      `<div id="wrStockBody">${isCl() ? '<p class="v2hint">The Mobius team checks stock on your best sellers before the sale.</p>' : '<p class="v2hint">Reading stock&hellip;</p>'}</div>
      ${isCl() ? '' : `<div class="wr-row">${ok ? '<span class="v2pill good">Stock checked</span> <button type="button" class="v2link" id="wrSUndo">Undo</button>' : '<button type="button" class="v2btn dk-p" id="wrSOk">Stock checked</button>'}</div>`}`);
  }
  const supTok = () => { try { const t = localStorage.getItem('mobius_session'), e = +localStorage.getItem('mobius_session_exp') || 0; return t && (e === 0 || e > Date.now()) ? t : H.S.tok; } catch { return H.S.tok; } };
  async function sup(path, brand) {
    const r = await fetch(`${SUP}${path}?brand=${encodeURIComponent(brand)}`, { headers: { Authorization: `Bearer ${supTok()}` } });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error('Stock needs the Google sign-in.');
    if (!r.ok) throw new Error(j.error || `Stock answered ${r.status}`);
    return j;
  }
  async function stockFor(act) {
    const hit = WR.stock[act]; if (hit && Date.now() - hit.at < 120e3) return hit.v;
    let v;
    try {
      if (!WR.supBrands) WR.supBrands = sup('/api/brands', 'lucky').catch(e => { WR.supBrands = null; throw e; });
      const bl = await WR.supBrands;
      const res = id => { try { return (window.resolveAct && window.resolveAct(id, H.S.accounts)) || id; } catch { return id; } };
      const b = (bl.brands || []).find(x => x.active && x.act_id && (x.act_id === act || res(x.act_id) === act));
      if (!b) v = { connected: false };
      else { const st = await sup('/api/state', b.id); v = { connected: true, products: st.products || [], today: st.today }; }
    } catch (e) { v = { error: e.message }; }
    WR.stock[act] = { at: Date.now(), v };
    return v;
  }
  /** The heroes: last year's best sellers that still sell, topped up with this year's, each graded against the sale's last day. */
  function heroList(d, v, n) {
    const ids = ((d.baseline && d.baseline.products) || []).map(p => String(p.id));
    let list = ids.map(id => v.products.find(p => String(p.id) === id)).filter(p => p && p.status !== 'off').slice(0, n);
    if (list.length < n) list = list.concat(v.products.filter(p => !list.includes(p) && p.status !== 'off' && (p.sold90 || 0) > 0).sort((a, b) => (b.sold90 || 0) - (a.sold90 || 0)).slice(0, n - list.length));
    const verdict = p => p.status === 'out' ? ['bad', 'Out now'] : p.runOutDate && p.runOutDate <= d.sale.end ? ['bad', `Runs out ${md(p.runOutDate)}, before the sale ends`] : p.weeksOfCover != null && p.weeksOfCover * 7 < 30 ? ['warn', 'Under 30 days left'] : ['good', 'Covers the sale'];
    return { ids, rows: list.map(p => ({ p, tone: verdict(p)[0], txt: verdict(p)[1], ly: ids.includes(String(p.id)) })) };
  }
  const stockGate = v => !v ? '<p class="v2hint">Reading stock&hellip;</p>' : v.error ? `<p class="v2hint">Stock did not load: ${esc(v.error)}</p>`
    : !v.connected ? '<p class="v2hint">No stock feed for this brand. Stock reads from Shopify once the brand installs the Mobius Digital app. Check the best sellers by hand, then press Stock checked.</p>' : '';
  /* The Plan: the full table. */
  function heroRows(d, v, n = 6) {
    const gate = stockGate(v); if (gate) return { html: gate, low: [] };
    const { rows } = heroList(d, v, n);
    const low = rows.filter(r => r.tone === 'bad').map(r => r.p);
    const html = rows.length ? `<div class="v2tbl"><table class="wr-tbl"><thead><tr><th>Product</th><th>On hand</th><th>A week</th><th>Days left</th><th></th></tr></thead><tbody>${rows.map(({ p, tone, txt, ly }) =>
      `<tr><td>${esc(p.title)}${ly ? ' <span class="faint">sold last BFCM</span>' : ''}</td><td class="num">${In(p.onHand)}</td><td class="num">${p.perWeek != null ? (Math.round(p.perWeek * 10) / 10) : '–'}</td><td class="num">${p.weeksOfCover != null ? In(p.weeksOfCover * 7) : '–'}</td><td><span class="v2pill ${tone}">${esc(txt)}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="v2hint">No product with sales to judge.</p>';
    return { html, low };
  }
  /* Live: the same heroes as ONE line under the tiles (the table stays on The Plan). */
  function heroLine(d, v, n = 5) {
    const gate = stockGate(v);
    if (gate) return { html: `<span class="l">Stock</span><span class="faint">${v && !v.connected && !v.error ? 'No stock feed for this brand; the heroes were checked by hand on The Plan.' : gate.replace(/<[^>]+>/g, '')}</span>`, low: [] };
    const { rows } = heroList(d, v, n);
    const low = rows.filter(r => r.tone === 'bad').map(r => r.p);
    const chip = ({ p, tone, txt }) => `<span class="h ${tone}"${U().tipAttr(`<b>${esc(p.title)}</b><br>${In(p.onHand)} on hand · ${p.perWeek != null ? Math.round(p.perWeek * 10) / 10 : '–'} a week<br>${esc(txt)}`)}>${esc(p.title)} <b>${p.status === 'out' ? 'out' : p.weeksOfCover != null ? `${In(p.weeksOfCover * 7)}d` : '–'}</b></span>`;
    const html = `<span class="l">Stock</span>${rows.length ? rows.map(chip).join('') : '<span class="faint">No product with sales to judge.</span>'}<button type="button" class="v2link" data-go="warplan">Full table on The Plan ›</button>`;
    return { html, low };
  }
  async function fillStock(t, d, id) {
    const el = document.getElementById(id); if (!el || isCl()) return;
    const v = await stockFor(d.act_id);
    if (t !== H.RUN() || !el.isConnected) return;
    el.innerHTML = heroRows(d, v).html;
  }

  function wirePlan(t, d) {
    const root = $('#wrRoot');
    root.querySelectorAll('[data-wropen]').forEach(b => b.onclick = () => openSec(d, b.dataset.wropen));
    root.querySelectorAll('[data-alsw]').forEach(sw => sw.onchange = () => toggleAlert(d, sw.dataset.alsw, sw.checked, sw));
  }
  /** Wire one step's section inside the side panel (pb). Clients get the reads and the links, never the edits (as before). */
  function wireSec(t, d, id, root) {
    root.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { if (window.V2 && window.V2.closePanel) window.V2.closePanel(); H.show(b.dataset.go); });
    if (id === 'wrOffers') fillCal(t, d);
    if (id === 'wrAlerts') fillAlerts(t, d);
    if (id === 'wrStock') fillStock(t, d, 'wrStockBody');
    if (isCl()) return;
    root.querySelectorAll('[data-edit-phase]').forEach(b => b.onclick = () => editOffer(d, b.dataset.editPhase));
    const ap = root.querySelector('#wrAddPhase'); if (ap) ap.onclick = () => editOffer(d, null);
    const patch = (p, okMsg) => warPatch(d, p, okMsg);
    /* 1. baseline */
    const bl = root.querySelector('#wrBLoad'); if (bl) bl.onclick = async () => { const f = root.querySelector('#wrBFrom').value, to = root.querySelector('#wrBTo').value; if (!f || !to || to < f) return toast('Pick a from and a through date.', true); try { await patch({ baseline: { from: f, to }, baseline_ok: false }); war(false, WR.page); } catch (e) { toast(e.message, true); } };
    const bo = root.querySelector('#wrBOk'); if (bo) bo.onclick = async () => { try { await patch({ baseline_ok: true }, 'Baseline set.'); war(false, WR.page); } catch (e) { toast(e.message, true); } };
    const bu = root.querySelector('#wrBUndo'); if (bu) bu.onclick = async () => { try { await patch({ baseline_ok: false }); war(false, WR.page); } catch (e) { toast(e.message, true); } };
    if (id === 'wrGoals') wireGoals(t, d);
    if (id === 'wrBudget') wireBudget(t, d);
    /* alerts, stock */
    const as = root.querySelector('#wrASave'); if (as) as.onclick = () => saveAlerts(d, readTh(root), root.querySelector('#wrAMsg'));
    const so = root.querySelector('#wrSOk'); if (so) so.onclick = async () => { try { await patch({ stock_ok: true }, 'Stock checked.'); war(false, WR.page); } catch (e) { toast(e.message, true); } };
    const su = root.querySelector('#wrSUndo'); if (su) su.onclick = async () => { try { await patch({ stock_ok: false }); war(false, WR.page); } catch (e) { toast(e.message, true); } };
  }
  async function warPatch(d, p, okMsg) { const w = await H.api('/api/season/war', { method: 'PUT', body: JSON.stringify({ act: d.act_id, patch: p }) }); d.war = w.war; if (okMsg) toast(okMsg); return w; }
  function repaintSec(t, d, id, fn) {
    const el = document.getElementById(id); if (!el) return;
    const y = window.scrollY; el.outerHTML = fn(d); window.scrollTo(0, y);
    if (id === 'wrBudget') wireBudget(t, d); else wireGoals(t, d);
  }
  function wireGoals(t, d) {
    const sec = document.getElementById('wrGoals'), G = WR.goals; if (!sec || isCl() || !G) return;
    sec.querySelectorAll('.wr-goal').forEach(r => { const i = +r.dataset.gi;
      const m = r.querySelector('[data-gm]'); if (m) m.onchange = () => { G.list[i].metric = m.value; repaintSec(t, d, 'wrGoals', goalsSec); };
      const v = r.querySelector('[data-gt]'); if (v) v.onchange = () => { G.list[i].target = numIn(v.value); repaintSec(t, d, 'wrGoals', goalsSec); repaintSec(t, d, 'wrBudget', budgetSec); }; });
    sec.querySelectorAll('[data-gx]').forEach(b => b.onclick = () => { G.list.splice(+b.dataset.gx, 1); repaintSec(t, d, 'wrGoals', goalsSec); });
    const ga = sec.querySelector('#wrGAdd'); if (ga) ga.onclick = () => { if (G.list.length >= 5) return; const used = new Set(G.list.map(g => g.metric)); G.list.push({ metric: Object.keys(d.metrics).find(k => !used.has(k)) || 'revenue', target: null }); repaintSec(t, d, 'wrGoals', goalsSec); };
    const gs = sec.querySelector('#wrGSave'); if (gs) gs.onclick = async () => {
      const msg = sec.querySelector('#wrGMsg'); msg.textContent = 'Saving…';
      sec.querySelectorAll('.wr-goal').forEach(r => { const i = +r.dataset.gi, inp = r.querySelector('[data-gt]'); if (inp) G.list[i].target = numIn(inp.value); });
      const lad = { ...(d.ladder || {}) }; sec.querySelectorAll('[data-lad]').forEach(i => { lad[i.dataset.lad] = numIn(i.value); });
      const rev = G.list.find(g => g.metric === 'revenue'); if (rev && rev.target) lad.bf = rev.target;
      try {
        await warPatch(d, { goals: G.list.filter(g => g.metric) });
        const keep = Object.fromEntries(Object.entries(lad).filter(([, v]) => v != null && v !== ''));
        await H.api('/api/season/answer', { method: 'PUT', body: JSON.stringify({ act: d.act_id, key: 'goals', value: keep }) });
        toast('Goals and ladder saved.'); WR.goals = null; war(false, WR.page);
      } catch (e) { msg.textContent = e.message; }
    };
  }
  function wireBudget(t, d) {
    const sec = document.getElementById('wrBudget'); if (!sec || isCl()) return;
    const B = budDraft(d), re = () => repaintSec(t, d, 'wrBudget', budgetSec);
    const tot = sec.querySelector('#wrBTotal'); if (tot) tot.onchange = () => { B.total = numIn(tot.value); re(); };
    sec.querySelectorAll('tr[data-ci]').forEach(r => { const c = B.channels[+r.dataset.ci];
      r.querySelector('[data-cid]').onchange = e => { c.id = e.target.value; re(); };
      r.querySelectorAll('[data-cu]').forEach(b => b.onclick = () => { c.unit = b.dataset.cu; re(); });
      r.querySelector('[data-cv]').onchange = e => { c.value = numIn(e.target.value); re(); };
      r.querySelector('[data-cm]').onchange = e => { c.metric = e.target.value || null; };
      r.querySelector('[data-ct]').onchange = e => { c.target = numIn(e.target.value); }; });
    sec.querySelectorAll('[data-cx]').forEach(b => b.onclick = () => { B.channels.splice(+b.dataset.cx, 1); re(); });
    const add = sec.querySelector('#wrCAdd'); if (add) add.onclick = () => { const used = new Set(B.channels.map(c => c.id)); B.channels.push({ id: Object.keys(d.channel_names).find(k => !used.has(k)) || 'other', unit: '$', value: null, metric: null, target: null }); re(); };
    const like = sec.querySelector('#wrBLike'); if (like) like.onclick = () => {
      const chs = (d.baseline.channels || []).filter(c => ['meta', 'google', 'tiktok', 'pinterest'].includes(c.id) && c.spend > 0), tot2 = chs.reduce((s, c) => s + c.spend, 0);
      if (!tot2) return toast('Last year has no channel spend to copy.', true);
      B.channels = chs.map(c => ({ id: c.id === 'pinterest' ? 'other' : c.id, unit: '%', value: Math.round(c.spend / tot2 * 100), metric: 'roas', target: c.roas ? Math.round(c.roas * 100) / 100 : null }));
      const sum = B.channels.reduce((s, c) => s + c.value, 0); if (B.channels.length) B.channels[0].value += 100 - sum;
      if (!B.total) B.total = Math.round(d.baseline.totals.spend);
      re();
    };
    const sv = sec.querySelector('#wrBSave'); if (sv) sv.onclick = async () => {
      const msg = sec.querySelector('#wrBMsg'); msg.textContent = 'Saving…';
      try { const w = await H.api('/api/season/war', { method: 'PUT', body: JSON.stringify({ act: d.act_id, patch: { budget: { total: B.total, channels: B.channels } } }) }); d.war = w.war; WR.bud = null; toast('Budget saved.'); war(false, WR.page); }
      catch (e) { msg.textContent = e.message; }
    };
  }

  /* ---------------- LIVE ---------------- */
  function liveBody(d) {
    const L = d.live;
    if (!L) return U().card('Live', '', '<p class="v2hint">Reading Triple Whale&hellip;</p>');
    if (L.error) return U().card('Live numbers did not load', '', `<p class="v2bad">${esc(L.error)}</p><p class="v2hint">Triple Whale answers the live call. Try Refresh in a minute.</p>`);
    const T = L.today || {}, D = L.day || {}, g = d.ladder || {};
    const th = thDefaults(d);
    const pace = D.pace, ptone = pace == null ? '' : pace >= 1 ? 'good' : pace >= 0.85 ? 'warn' : 'bad';
    const lad = ladderOf(g, L.last3 && L.last3.mer, L.last3 && L.last3.spend);
    const merTone = T.mer == null ? '' : th.mer && T.mer < th.mer ? 'bad' : g.target && T.mer >= g.target ? 'good' : g.be && T.mer < g.be ? 'warn' : '';
    const aovTone = T.aov == null || !th.aov ? '' : T.aov < th.aov ? 'bad' : 'good';
    const sp = D.spend_budget, spTone = sp && T.spend != null ? (T.spend > sp * 1.15 ? 'bad' : '') : '';
    const goals = (d.goals_list || []);
    const saleGoal = (goals.find(x => x.metric === 'revenue') || {}).target || (d.ladder && d.ladder.bf) || null;
    const SS = L.sale_so_far;
    const dry = !L.in_sale ? `<div class="wr-dry"><b>Dry run.</b> Today is not a sale day, so the plan for today is a normal day (the brand's own last 28 days). On ${md(d.sale.start)} it switches to the sale plan.</div>` : '';
    const hero = `<div class="wr-hero">
      ${kpi('Revenue today', Ko(T.sales), D.plan_now != null ? `<b>${pace != null ? Math.round(pace * 100) + '%' : '–'}</b> of plan by now (${Ko(D.plan_now)})` : 'No plan for today', ptone, `Plan by now = the day's goal x the share of a normal day done by this hour (${esc(L.curve || '')}).`)}
      ${kpi('Heading for', Ko(D.projected), D.goal ? `day goal ${Ko(D.goal)}` : '', D.projected != null && D.goal ? (D.projected >= D.goal ? 'good' : D.projected >= D.goal * 0.85 ? 'warn' : 'bad') : '', 'Today so far, scaled by how much of a normal day is done.')}
      ${kpi('Orders', In(T.orders), T.aov != null ? `AOV ${Mo(T.aov)}${th.aov ? ` · floor ${Mo(th.aov)}` : ''}` : '', aovTone)}
      ${kpi('MER today', Xo(T.mer), `${g.target ? `target ${Xo(g.target)}` : ''}${th.mer ? ` · floor ${Xo(th.mer)}` : ''}`, merTone, 'Revenue over all ad spend, today so far (Triple Whale).')}
      ${kpi('Ad spend', Ko(T.spend), sp ? `of ${Ko(sp)} for the day` : '', spTone)}
      ${kpi('Last 3 hours', Xo(L.last3 && L.last3.mer), esc(lad.text), lad.cls, 'The ladder grades the blended MER of the last three hours that have data.')}
    </div>`;
    const sale = SS && saleGoal ? `<div class="wr-sale"${U().tipAttr('Finished sale days from the P&amp;L line, plus today so far.')}><span><b>The sale so far</b> ${Ko(SS.sales)} of ${Ko(saleGoal)} · ${In(SS.orders)} orders · MER ${Xo(SS.spend ? SS.sales / SS.spend : null)}</span><i><em style="width:${Math.min(100, SS.sales / saleGoal * 100).toFixed(1)}%"></em></i></div>` : '';
    const stock = `<div class="wr-stockline" id="wrStock2">${isCl() ? '<span class="l">Stock</span><span class="faint">The Mobius team watches stock on the heroes during the sale.</span>' : '<span class="l">Stock</span><span class="faint">Reading stock on the heroes&hellip;</span>'}</div>`;
    return `${dry}${hero}${sale}${stock}
      <div class="wr-lg"><section class="v2card wr-pace"><div class="v2h"><h3>Today, hour by hour</h3><span class="find">Revenue so far against the plan for today. Bars are each hour's revenue. Times are ${esc(d.tz || 'the store\'s')}.</span></div>${paceChart(L)}</section>
        <section class="v2card" id="wrDesk">${deskBox(d)}</section></div>
      <div class="wr-l2"><section class="v2card"><div class="v2h"><h3>Spend by channel</h3><span class="find">Against the day's budget for each channel, and where it should be by now.</span></div>${chanBox(L)}</section>
        <section class="v2card"><div class="v2h"><h3>Alerts today</h3><span class="find">What fired in Slack today. The thresholds are set on The Plan, step ${stepNo(d, 'alerts')}.</span></div><div id="wrFired">${isCl() ? '<p class="v2hint">The Mobius team gets these in Slack.</p>' : '<p class="v2hint">Reading&hellip;</p>'}</div></section></div>
      ${isCl() ? '' : '<div class="wr-l2"><div id="wrRead"></div><div id="dkNow"></div></div>'}`;
  }
  function paceChart(L) {
    const hrs = L.hours || [], plan = L.plan_curve || null;
    const w = 760, h = 270, pl = 52, pr = 14, pt = 14, pb = 26;
    const mx = Math.max(1, ...(plan || [0]), ...hrs.map(x => x.cum_sales || 0)) * 1.08;
    const hmx = Math.max(1, ...hrs.map(x => x.sales || 0));
    const X = i => pl + (i + 0.5) / 24 * (w - pl - pr), Y = v => pt + (1 - v / mx) * (h - pt - pb), bw = (w - pl - pr) / 24;
    const grid = [0.25, 0.5, 0.75, 1].map(f => `<line x1="${pl}" x2="${w - pr}" y1="${Y(mx * f).toFixed(1)}" y2="${Y(mx * f).toFixed(1)}" stroke="var(--v2-grid)" stroke-dasharray="2 4"/><text x="${pl - 6}" y="${(Y(mx * f) + 3).toFixed(1)}" font-size="10" text-anchor="end" fill="var(--muted)">${Ko(mx * f)}</text>`).join('');
    const bars = hrs.map((x, i) => { const bh = (x.sales || 0) / hmx * (h - pt - pb) * 0.32; return `<rect x="${(X(i) - bw * 0.32).toFixed(1)}" y="${(h - pb - bh).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="var(--brand)" opacity=".22"/>`; }).join('');
    const pline = plan ? `<polyline points="${plan.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--warn)" stroke-width="1.6" stroke-dasharray="5 4"/>` : '';
    const apts = hrs.map((x, i) => `${X(i).toFixed(1)},${Y(x.cum_sales || 0).toFixed(1)}`).join(' ');
    const area = hrs.length > 1 ? `<polygon points="${X(0).toFixed(1)},${h - pb} ${apts} ${X(hrs.length - 1).toFixed(1)},${h - pb}" fill="var(--brand)" opacity=".10"/>` : '';
    const last = hrs[hrs.length - 1];
    const dot = last ? `<circle cx="${X(hrs.length - 1).toFixed(1)}" cy="${Y(last.cum_sales || 0).toFixed(1)}" r="4.5" fill="var(--surface)" stroke="var(--brand)" stroke-width="2.2"/>` : '';
    const ticks = [0, 3, 6, 9, 12, 15, 18, 21, 23].map(i => `<text x="${X(i).toFixed(1)}" y="${h - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${hourWord(i)}</text>`).join('');
    const hot = Array.from({ length: 24 }, (_, i) => { const x = hrs[i], p = plan ? plan[i] : null;
      const tip = `<b>${hourWord(i)} to ${hourWord((i + 1) % 24)}</b><br>${x ? `So far ${Ko(x.cum_sales)}${p ? ` · plan ${Ko(p)} (${Math.round(x.cum_sales / p * 100)}%)` : ''}<br>This hour ${Ko(x.sales)} · ${In(x.orders)} orders · ${Ko(x.spend)} spent` : p ? `Plan by then ${Ko(p)}` : 'No data yet'}`;
      return `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${pt}" width="${bw.toFixed(1)}" height="${h - pt - pb}" fill="transparent"${U().tipAttr(tip)}/>`; }).join('');
    return `<div class="wr-chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Revenue so far against the plan, by hour">${grid}${bars}${pline}${area}<polyline points="${apts}" fill="none" stroke="var(--brand)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>${dot}${ticks}${hot}</svg>
      <div class="wr-key"><span><i class="ln"></i>Revenue so far</span>${plan ? '<span><i class="ln plan"></i>Plan for today</span>' : ''}<span><i class="bx"></i>Each hour</span><span class="faint">Plan curve: ${esc(L.curve || '')}</span></div></div>`;
  }
  const SLOTS = [['8am', '8:00 AM'], ['4pm', '4:00 PM'], ['12am', 'Midnight']];
  function deskBox(d) {
    const L = d.live || {}, date = L.date || d.today, g = d.ladder || {};
    const lad = ladderOf(g, L.last3 && L.last3.mer, L.last3 && L.last3.spend);
    const ch = centralHour(), now = ch < 12 ? '8am' : ch < 20 ? '4pm' : '12am';
    const lines = g.be != null ? `Breakeven ${Xo(g.be)} · target ${Xo(g.target)} · scale 50% at ${Xo(g.s50)} · scale 100% at ${Xo(g.s100)}` : 'No ladder set on The Plan.';
    const slots = SLOTS.map(([k, l]) => { const c = (d.checkins || []).find(x => x.date === date && x.slot === k);
      return `<div class="wr-slot${k === now ? ' now' : ''}" data-slot="${k}"><span class="s">${l}${k === now ? ' <em>now</em>' : ''}</span>${c && c.action ? `<div class="did">${esc(c.action)}<small>${c.verdict ? `ladder said ${esc(c.verdict)} · ` : ''}${esc(c.by || '')}</small></div>${isCl() ? '' : '<button type="button" class="v2link" data-redo="1">Change</button>'}`
        : isCl() ? '<span class="faint">No check-in yet</span>' : '<input type="text" placeholder="What you did, one line" aria-label="What you did"><button type="button" class="v2btn dk-p" data-save="1">Save</button>'}</div>`; }).join('');
    return `<div class="v2h"><h3>The desk</h3><span class="find">Three check-ins a day, Central. Whoever acts writes one line.</span></div>
      ${isCl() ? '' : `<div class="wr-call ${lad.cls}"${U().tipAttr(esc(lines))}><span>The ladder says</span><b>${esc(lad.text)}</b><small>last 3 hours ${Xo(L.last3 && L.last3.mer)} on ${Ko(L.last3 && L.last3.spend)}</small></div>`}
      <div class="wr-slots">${slots}</div>`;
  }
  function wireDesk(t, d) {
    const box = document.getElementById('wrDesk'); if (!box || isCl()) return;
    const L = d.live || {}, date = L.date || d.today;
    box.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
      const row = b.closest('.wr-slot'), inp = row.querySelector('input'), text = inp.value.trim(); if (!text) return toast('Write what you did first.', true);
      const lad = ladderOf(d.ladder, L.last3 && L.last3.mer, L.last3 && L.last3.spend);
      b.disabled = true;
      try { const r = await H.api('/api/season/checkin', { method: 'PUT', body: JSON.stringify({ act: d.act_id, date, slot: row.dataset.slot, action: text, roas: L.last3 ? L.last3.mer : null, mer_day: L.today ? L.today.mer : null, revenue: L.today ? L.today.sales : null, spend: L.today ? L.today.spend : null, verdict: lad.ok ? lad.text : null }) });
        d.checkins = (d.checkins || []).filter(c => !(c.date === date && c.slot === row.dataset.slot)).concat([{ date, slot: row.dataset.slot, action: text, verdict: lad.ok ? lad.text : null, by: r.by, at: r.at }]);
        box.innerHTML = deskBox(d); wireDesk(t, d); toast('Check-in saved.'); }
      catch (e) { b.disabled = false; toast(e.message, true); }
    });
    box.querySelectorAll('input').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') i.closest('.wr-slot').querySelector('[data-save]').click(); });
    box.querySelectorAll('[data-redo]').forEach(b => b.onclick = () => { const row = b.closest('.wr-slot'), c = (d.checkins || []).find(x => x.date === date && x.slot === row.dataset.slot);
      row.innerHTML = `<span class="s">${SLOTS.find(s => s[0] === row.dataset.slot)[1]}</span><input type="text" value="${esc(c ? c.action : '')}"><button type="button" class="v2btn dk-p" data-save="1">Save</button>`; wireDesk(t, d); });
  }
  function chanBox(L) {
    const ch = (L.channels || []);
    if (!ch.length) return '<p class="v2hint">No paid spend today yet.</p>';
    return ch.map(c => { const b = c.budget, now = c.budget_now, ratio = now ? c.spend / now : null;
      const tone = ratio == null ? '' : ratio > 1.2 ? 'bad' : ratio < 0.7 ? 'warn' : 'good';
      const word = ratio == null ? (b ? '' : 'no budget set') : ratio > 1.2 ? 'running hot' : ratio < 0.7 ? 'running behind' : 'on pace';
      return `<div class="wr-cb"${U().tipAttr(`<b>${esc(c.label)}</b><br>Spent ${Ko(c.spend)}${b ? `<br>Day budget ${Ko(b)}, by now about ${Ko(now)}` : ''}`)}><span class="n"><i style="background:var(--c-${['meta', 'google', 'tiktok', 'email'].includes(c.id) ? c.id : 'else'})"></i>${esc(c.label)}</span>
        <span class="wr-bar wide">${b ? `<i class="${tone}" style="width:${Math.min(100, (c.spend || 0) / b * 100).toFixed(1)}%"></i><u style="left:${Math.min(100, (now || 0) / b * 100).toFixed(1)}%"></u>` : `<i style="width:100%;opacity:.25"></i>`}</span>
        <b>${Ko(c.spend)}</b><span class="faint">${b ? `of ${Ko(b)}` : ''} <span class="${tone ? 'wr-' + tone : ''}">${word}</span></span></div>`; }).join('') + '<p class="v2hint">The tick is where spend should be by now on the brand\'s hourly curve.</p>';
  }
  async function fillFired(t, d) {
    const el = document.getElementById('wrFired'); if (!el || isCl()) return;
    let r; try { r = await H.apiAH('/api/alerts'); } catch (e) { el.innerHTML = `<p class="v2hint">${esc(e.message)}</p>`; return; }
    if (t !== H.RUN() || !el.isConnected) return;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
    const cDay = s => s ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(s)) : null;
    const mine = (r.alerts || []).filter(a => a.act === d.act_id || a.act === 'all');
    const fired = mine.filter(a => cDay(a.last_fired) === today);
    WR.firedToday = fired.map(a => a.rule);
    const ours = mine.filter(a => ((d.war && d.war.alerts) || []).some(x => x.id === a.id));
    el.innerHTML = `${fired.length ? `<ul class="wr-al fired">${fired.map(a => `<li><b>${new Date(a.last_fired).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })}</b><span>${esc(a.rule)}</span>${a.last_value != null ? `<span class="faint">at ${esc(String(Math.round(a.last_value * 100) / 100))}</span>` : ''}</li>`).join('')}</ul>` : '<p class="v2hint">Nothing has fired today.</p>'}
      <p class="v2hint">${ours.length ? `${ours.length} sale alert${ours.length === 1 ? '' : 's'} watching.` : `No sale alerts saved. Turn them on from The Plan, step ${stepNo(d, 'alerts')}.`}</p>`;
    warRead(t, d);
  }
  async function fillStockLive(t, d) {
    const el = document.getElementById('wrStock2'); if (!el || isCl()) return;
    const v = await stockFor(d.act_id); if (t !== H.RUN() || !el.isConnected) return;
    const r = heroLine(d, v, 5); WR.lowStock = r.low.map(p => p.title);
    el.innerHTML = r.html;
    el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => H.show(b.dataset.go));
  }
  /* Locus's read: what to do now. account-health /api/read (Sonnet), cached there per facts; the 15-minute
     slot in the facts makes it a fresh read at most every 15 minutes, and Refresh adds a nonce to force one. */
  async function warRead(t, d, fresh) {
    const el = document.getElementById('wrRead'); if (!el || isCl()) return;
    const L = d.live || {}, lad = ladderOf(d.ladder, L.last3 && L.last3.mer, L.last3 && L.last3.spend);
    const facts = { brand: d.name, what: `${seasonLabel()} war room, live`, date: L.date, in_sale: !!L.in_sale, sale: d.sale, today_so_far: L.today, plan_today: L.day, plan_source: L.plan_src,
      last_3_hours: L.last3, ladder: d.ladder ? { breakeven: d.ladder.be, target: d.ladder.target, scale_50: d.ladder.s50, scale_100: d.ladder.s100, says: lad.text } : null,
      channels: (L.channels || []).map(c => ({ channel: c.label, spent: c.spend, day_budget: c.budget, by_now: c.budget_now })), sale_so_far: L.sale_so_far || null,
      goals: d.goals_list, alerts_fired_today: WR.firedToday || [], stock_running_out: WR.lowStock || [], slot: Math.floor(Date.now() / 9e5), ...(fresh ? { nonce: Date.now() } : {}) };
    el.innerHTML = `<section class="v2card wr-read"><div class="v2h"><h3>What to do now</h3><span class="cap"><button type="button" class="v2btn ghost" id="wrReadRef">Refresh</button></span></div><p class="v2hint">Locus is reading the numbers&hellip;</p></section>`;
    try {
      const r = await H.apiAH('/api/read', { method: 'POST', body: JSON.stringify({ screen: 'war room', scope: d.name, range: `Today, ${L.date}`, compare: 'the plan for today', facts }) });
      if (t !== H.RUN() || !el.isConnected) return;
      el.innerHTML = `<section class="v2card wr-read"><div class="v2h"><h3>What to do now</h3><span class="cap"><span class="faint">${r.at ? `read at ${new Date(r.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })}` : ''}</span><button type="button" class="v2btn ghost" id="wrReadRef">Refresh</button></span></div>
        ${r.error ? `<p class="v2hint">${esc(r.error)}</p>` : `${r.focus ? `<p class="wr-focus">${esc(r.focus)}</p>` : ''}<p class="v2say">${esc((r.lines || []).join(' '))}</p>${(r.leaks || []).length ? `<ul class="wr-leaks">${r.leaks.map(l => `<li><b>${esc(l.where || '')}</b> ${esc(l.what)}</li>`).join('')}</ul>` : ''}<button type="button" class="v2link" id="wrAsk">Ask about this ›</button>`}</section>`;
    } catch (e) { if (el.isConnected) el.innerHTML = `<section class="v2card wr-read"><div class="v2h"><h3>What to do now</h3><span class="cap"><button type="button" class="v2btn ghost" id="wrReadRef">Refresh</button></span></div><p class="v2hint">The read could not run: ${esc(e.message)}</p></section>`; }
    const rb = el.querySelector('#wrReadRef'); if (rb) rb.onclick = () => warRead(t, d, true);
    const ab = el.querySelector('#wrAsk'); if (ab && H.AskUI) ab.onclick = () => H.AskUI.open(`About ${d.name}'s war room right now: `);
  }
  function wireLive(t, d) {
    wireDesk(t, d);
    $('#wrRoot').querySelectorAll('[data-go]').forEach(b => b.onclick = () => H.show(b.dataset.go));
    if (isCl()) return;
    fillStockLive(t, d).then(() => fillFired(t, d));
    fillNow(t);
  }
  function tvMode(on, quiet) {
    WR.tv = on;
    document.documentElement.classList.toggle('wr-tvmode', on);
    try { if (on && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch {}
    if (WR.timer) { clearInterval(WR.timer); WR.timer = null; }
    if (on) WR.timer = setInterval(() => { if (!isWarTab(H.S.tab)) { tvMode(false); return; } NOWC = null; war(false, WR.page); }, 5 * 60e3);
    if (!quiet) war(false, WR.page);
  }
  if (!window.__wrFs) { window.__wrFs = 1; document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && WR.tv) tvMode(false); }); }

  /* ---------------- ALL CLIENTS ---------------- */
  /** Every brand in the season (riskiest first, the server's order). The Plan page shows each brand's step progress;
      Live shows today against the plan for the brands in their sale, and the countdown for the rest. */
  async function warGrid(t, mode) {
    const m = mode || 'plan';
    let d; try { d = await H.api('/api/season/war?act=all'); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell(WR.page, warTitle(m), U().card('Could not load the season', '', `<p class="v2bad">${esc(e.message)}</p>`)); return; }
    if (t !== H.RUN()) return;
    WR.data = { act_id: 'all' };
    const B = (d.brands || []).map(b => { const ps = planSteps(b.steps); return { ...b, psteps: ps, pdone: ps.filter(s => s.done).length, N: ps.length }; });
    const live = B.filter(b => b.mode === 'live'), steps = B.reduce((s, b) => s + b.pdone, 0), stepsN = B.reduce((s, b) => s + b.N, 0);
    const bfIn = Math.max(0, dBetween(d.today, d.bf));
    const progress = b => { const miss = b.psteps.filter(s => !s.done);
      return `<div class="wr-prog sm"><span><b>${b.pdone} of ${b.N}</b> steps</span><i><em style="width:${(b.pdone / b.N * 100).toFixed(0)}%"></em></i></div>
        <div class="wr-miss">${miss.length ? `Still to do: ${miss.slice(0, 3).map(s => esc(s.label.charAt(0).toLowerCase() + s.label.slice(1))).join(', ')}${miss.length > 3 ? ` and ${miss.length - 3} more` : ''}` : 'Ready for the sale.'}</div>`; };
    const pace = b => { const L = b.live, p = L && L.day ? L.day.pace : null, tone = p == null ? '' : p >= 1 ? 'good' : p >= 0.85 ? 'warn' : 'bad';
      return L && !L.error ? `<div class="wr-gp ${tone}"><b>${p != null ? Math.round(p * 100) + '%' : '–'}</b><span>of today's plan by now</span></div><div class="wr-gl">${U().kmoney(L.today && L.today.sales, b.currency)} today · plan by now ${U().kmoney(L.day && L.day.plan_now, b.currency)} · MER ${U().x2(L.today && L.today.mer)}</div>`
        : `<p class="v2hint">${esc((L && L.error) || 'No live numbers yet.')}</p>`; };
    const card = b => {
      const body = m === 'live' ? (b.mode === 'live' ? pace(b) : `<div class="wr-gl">${b.mode === 'after' ? 'The sale is over.' : `${b.days_to === 1 ? 'Starts tomorrow' : `${b.days_to} days to go`} · ${b.pdone} of ${b.N} plan steps done`}</div>`) : progress(b);
      return `<button type="button" class="wr-bcard${b.mode === 'live' ? ' live' : ''}" data-act="${esc(b.act_id)}">
        <div class="h"><b>${esc(b.name)}</b>${b.mode === 'live' ? '<span class="v2pill good">Live</span>' : b.mode === 'after' ? '<span class="v2pill">Over</span>' : `<span class="faint">${b.days_to} days</span>`}</div>
        ${body}<div class="wr-off">${b.bf_offer ? esc(b.bf_offer.slice(0, 110)) : `<span class="faint">No ${esc(seasonLabel())} offer written</span>`}</div>
        <div class="f"><span>Goal ${b.goal ? U().kmoney(b.goal, b.currency) : 'not set'}</span><span>${md(b.sale.start)} to ${md(b.sale.end)}</span></div></button>`;
    };
    const line = m === 'live' ? `${live.length ? `<b class="wr-dot">${live.length} live now</b>` : 'No brand is in its sale yet'} · ${bfIn ? `${bfIn} days to Black Friday` : 'Black Friday is today'} · riskiest first`
      : `${steps} of ${stepsN} plan steps done · ${bfIn ? `${bfIn} days to Black Friday` : 'Black Friday is today'} · least ready first`;
    $('#main').innerHTML = shell(WR.page, warTitle(m), `<div class="wr" id="wrRoot">
      <div class="wr-strip"><div class="wr-seg" role="tablist" aria-label="The Plan or Live"><button type="button" role="tab" data-wrm="plan" class="${m === 'plan' ? 'on' : ''}" aria-selected="${m === 'plan'}">The Plan</button><button type="button" role="tab" data-wrm="live" class="${m === 'live' ? 'on' : ''}" aria-selected="${m === 'live'}">Live</button></div>
        <div class="wr-when"><b>Every brand in the season</b><span>${line}</span></div>
        <div class="wr-acts"><button type="button" class="v2btn ghost" id="dkSeasonCfg">Name and when it shows</button></div></div>
      ${B.length ? `<div class="wr-grid">${B.map(card).join('')}</div>` : U().card('No brand is in the season', '', '<p class="v2hint">Start one on Offers and dates.</p>')}
      ${U().foot(m === 'live' ? 'During its sale a card shows today against the plan by this hour; before it, the countdown. Click a brand for its Live page.' : 'Each card shows how much of the plan is done and what is still to do. Click a brand for its plan.')}</div>`);
    const root = $('#wrRoot');
    root.querySelectorAll('[data-act]').forEach(el => el.onclick = () => pickAct(el.dataset.act, WR.page));
    root.querySelectorAll('[data-wrm]').forEach(b => b.onclick = () => goMode('all', b.dataset.wrm));
    const cfg = root.querySelector('#dkSeasonCfg'); if (cfg) cfg.onclick = seasonCfg;
  }
  function seasonCfg() {
    const cur = (window.SEASON_TAB && window.SEASON_TAB()) || { label: 'Black Friday', mode: 'auto' };
    const opt = (v, l, s) => `<label class="opt"><input type="radio" name="dkMode" value="${v}"${cur.mode === v ? ' checked' : ''}><span>${l}<small>${s}</small></span></label>`;
    const pb = U().panel('The season tab', `<div class="dk-form">
      <label>Name in the menu<input type="text" id="dkSLabel" maxlength="40" value="${esc(cur.label || 'Black Friday')}" placeholder="Black Friday"></label>
      <p class="v2hint" style="margin:0">Rename it as the season moves: BFCM War Room, then Q5 War Room after Cyber Monday.</p>
      <div><b>When it shows</b>${opt('auto', 'Automatically', 'From six weeks before the first phase of the season plan to a week after the last.')}${opt('on', 'Always', 'Stays in the menu until you hide it.')}${opt('off', 'Hidden', 'Gone from the menu. The plan still opens from links.')}</div>
      <div><button type="button" class="v2btn dk-p" id="dkSSave">Save</button> <span class="v2hint" id="dkSMsg"></span></div></div>`);
    pb.querySelector('#dkSSave').onclick = async () => {
      const label = pb.querySelector('#dkSLabel').value.trim().slice(0, 40) || 'Black Friday', mode = (pb.querySelector('input[name=dkMode]:checked') || {}).value || 'auto';
      const msg = pb.querySelector('#dkSMsg'); msg.textContent = 'Saving…';
      try { await H.apiAH('/api/settings', { method: 'PUT', body: JSON.stringify({ seasonTab: { label, mode } }) }); window.SET_SEASON_TAB && window.SET_SEASON_TAB({ label, mode }); msg.textContent = 'Saved. The menu uses it now.'; }
      catch (e) { msg.textContent = e.message; }
    };
  }

  /* =========================================================================================
   * TOOLS > PLATFORM STATUS (Pulse). v2 pass 2026-10-09 (Cole: "looks bland, not updated for the new UI"):
   * the answer first, four tiles, every platform as a card with its logo and a status chip (problems first),
   * the last 14 days as bars you can hover, and the change log as a table you can filter by platform, with how
   * long each problem lasted. Same public Pulse feed, read every time the page opens or "Check again" is pressed.
   * ======================================================================================= */
  const PULSE_LOGO = { meta: 'meta', 'google-ads': 'google-ads', shopify: 'shopify', openai: 'openai', anthropic: 'anthropic', 'tiktok-ads': 'tiktok' };
  const PULSE_ST = { operational: ['good', 'Working'], degraded: ['warn', 'Degraded'], partial: ['warn', 'Partial outage'], outage: ['bad', 'Outage'], major: ['bad', 'Major outage'], maintenance: ['warn', 'Maintenance'] };
  let PULSE_F = '';
  async function pulse(first) {
    css(); pulseCss();
    const t = H.RUN();
    const chrono = iso => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
    if (first) $('#main').innerHTML = shell('pulse', 'Platform status', `<div class="pu-sk"><i></i><span><i></i><i></i><i></i><i></i></span><i style="height:260px"></i></div>`);
    let d; try { const r = await fetch(PULSE, { cache: 'no-store' }); if (!r.ok) throw new Error('Pulse answered ' + r.status); d = await r.json(); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('pulse', 'Platform status', U().card('Pulse did not answer', '', `<p class="v2bad">${esc(e.message)}</p>`)); return; }
    if (t !== H.RUN()) return;
    const plats = d.platforms || [], incs = d.incidents || [];
    const stOf = s => PULSE_ST[s] || (s ? ['bad', s.charAt(0).toUpperCase() + s.slice(1)] : ['', 'No feed']);
    const fed = plats.filter(p => p.state), dark = plats.filter(p => !p.state);
    const down = fed.filter(p => p.state.worst && p.state.worst !== 'operational');
    const week = Date.now() - 7 * 864e5, inWeek = incs.filter(i => i.kind !== 'resolved' && Date.parse(i.ts) >= week);
    /* How long each problem lasted: a "resolved" row closes the latest earlier "incident" on the same service. */
    const open = new Map(), lasted = new Map();
    incs.slice().sort((a, b) => a.ts.localeCompare(b.ts)).forEach((i, k) => { const key = i.platformId + '|' + i.service; if (i.kind === 'resolved') { const st = open.get(key); if (st) { lasted.set(i.ts + key, Date.parse(i.ts) - Date.parse(st)); open.delete(key); } } else open.set(key, i.ts); });
    const dur = ms => ms < 36e5 ? `${Math.max(1, Math.round(ms / 6e4))} min` : ms < 864e5 ? `${(ms / 36e5).toFixed(ms < 36e6 ? 1 : 0)} h` : `${(ms / 864e5).toFixed(1)} days`;
    const say = down.length
      ? `<b class="bad">${down.length === 1 ? esc(down[0].name) + ' has a problem' : down.length + ' platforms have a problem'}</b> right now${down.length > 1 ? ': ' + down.map(p => esc(p.name)).join(', ') : ''}. ${down.some(p => ['meta', 'google-ads', 'shopify'].includes(p.id)) ? 'Hold changes on that platform until it clears.' : 'None of them is an ad platform or the store, so the ads are not affected.'}`
      : `<b class="good">Meta, Google Ads and Shopify are all working.</b> Nothing posted a problem.`;
    const tiles = [
      U().tile({ label: 'Problems right now', value: String(down.length), sub: down.length ? down.map(p => esc(p.name)).join(', ') : 'Every feed reads working' }),
      U().tile({ label: 'Working', value: `${fed.length - down.length}<span class="pu-of"> of ${fed.length}</span>`, sub: 'Platforms with a status feed' }),
      U().tile({ label: 'Problems started, 7 days', value: String(inWeek.length), sub: inWeek.length ? `Most on ${esc(Object.entries(inWeek.reduce((m, i) => (m[i.platform] = (m[i.platform] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1])[0][0])}` : 'A quiet week' }),
      U().tile({ label: 'Last checked', value: d.lastRun ? new Date(d.lastRun).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) : '–', sub: 'Central. Pulse reads every 5 minutes' }),
    ].join('');
    const card = p => {
      const st = p.state, [tone, word] = stOf(st && st.worst);
      const svc = Object.values(st.services || {}), bad = svc.filter(x => x.state !== 'operational');
      return `<div class="pu-p${tone && tone !== 'good' ? ' pu-' + tone : ''}">
        <div class="pu-ph">${window.logo ? window.logo(PULSE_LOGO[p.id] || '', 32, p.name) : ''}<span class="pu-pn"><b>${esc(p.name)}</b><em>${svc.length} service${svc.length === 1 ? '' : 's'} checked</em></span><span class="ds-chip ${tone}"><span class="ds-dot ${tone}"></span>${esc(word)}</span></div>
        ${bad.length ? `<ul class="pu-issues">${bad.slice(0, 4).map(x => `<li><b>${esc(x.name)}</b> ${esc(x.note || x.state)}</li>`).join('')}${bad.length > 4 ? `<li class="faint">and ${bad.length - 4} more</li>` : ''}</ul>` : '<p class="pu-ok">No known issues</p>'}
        ${p.link ? `<a class="pu-link" href="${esc(p.link)}" target="_blank" rel="noopener">Status page<svg class="ic" aria-hidden="true"><use href="#i-external-link"/></svg></a>` : ''}</div>`;
    };
    const fedSorted = fed.slice().sort((a, b) => (a.state.worst === 'operational') - (b.state.worst === 'operational'));
    /* The last 14 days: problems started per day, hover for which. */
    const days = Array.from({ length: 14 }, (_, k) => { const x = new Date(); x.setDate(x.getDate() - 13 + k); return x.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); });
    const per = days.map(dd => incs.filter(i => i.kind !== 'resolved' && new Date(i.ts).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) === dd));
    const mx = Math.max(1, ...per.map(a => a.length));
    const bars = `<div class="pu-bars" role="img" aria-label="Problems started per day, last 14 days">${per.map((a, k) => {
      const by = a.reduce((m, i) => (m[i.platform] = (m[i.platform] || 0) + 1, m), {});
      const tip = `<b>${esc(new Date(days[k] + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))}</b><br>${a.length ? Object.entries(by).map(([n, c]) => `${esc(n)}: ${c}`).join('<br>') : 'No problems'}`;
      return `<div class="pu-bar"${U().tipAttr(tip)}><i style="height:${a.length ? Math.max(6, a.length / mx * 100) : 0}%"></i><span>${k % 2 === 1 || k === 13 ? esc(new Date(days[k] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : ''}</span></div>`;
    }).join('')}</div><div class="pu-axis"><span>${mx}</span><span>0</span></div>`;
    const withInc = [...new Set(incs.map(i => i.platform))];
    if (PULSE_F && !withInc.includes(PULSE_F)) PULSE_F = '';
    const rows = incs.filter(i => !PULSE_F || i.platform === PULSE_F).slice(0, 25).map(i => {
      const L = i.kind === 'resolved' ? lasted.get(i.ts + i.platformId + '|' + i.service) : null;
      return `<tr><td class="pu-when">${chrono(i.ts)}</td><td><span class="pu-pl">${window.logo ? window.logo(PULSE_LOGO[i.platformId] || '', 20, i.platform) : ''}<b>${esc(i.platform)}</b></span></td><td>${esc(i.service || '')}</td>
        <td>${i.kind === 'resolved' ? '<span class="ds-chip good">Fixed</span>' : `<span class="ds-chip ${i.to === 'outage' || i.to === 'major' ? 'bad' : 'warn'}">Started</span>`}</td><td class="pu-note">${esc(i.note || '')}</td><td class="pu-dur">${L ? 'lasted ' + dur(L) : ''}</td></tr>`;
    }).join('');
    $('#main').innerHTML = shell('pulse', 'Platform status', `<p class="v2say lead">${say}</p>
      <div class="v2tiles pu-tiles">${tiles}</div>
      <div id="puSmoke"></div>
      ${U().card('Right now', 'Problems first. Times in Central.', `<div class="pu-grid">${fedSorted.map(card).join('')}</div>
        ${dark.length ? `<div class="pu-dark"><span class="ds-label">No public feed: check their page</span><div>${dark.map(p => `<a class="ds-chip" href="${esc(p.link || '#')}" target="_blank" rel="noopener">${window.logo ? window.logo(PULSE_LOGO[p.id] || '', 14, p.name) : ''}${esc(p.name)}<svg class="ic" aria-hidden="true"><use href="#i-external-link"/></svg></a>`).join('')}</div></div>` : ''}`, `<button type="button" class="ds-btn" id="puAgain"><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg>Check again</button>`)}
      ${U().card('The last 14 days', `${per.reduce((s, a) => s + a.length, 0)} problems started. Hover a day for which platform.`, bars)}
      ${U().card('Recent changes', 'Every change a feed posted, newest first.', `${withInc.length > 1 ? `<div class="ds-seg pu-f" role="radiogroup" aria-label="Show changes for">${['', ...withInc].map(n => `<button type="button" role="radio" data-pf="${esc(n)}" class="${n === PULSE_F ? 'on' : ''}" aria-checked="${n === PULSE_F}">${esc(n || 'All')}</button>`).join('')}</div>` : ''}
        ${rows ? `<div class="v2tbl pu-t"><table><thead><tr><th>When</th><th>Platform</th><th>Service</th><th>What</th><th>Detail</th><th>How long</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="v2hint">Nothing recorded.</p>'}`)}
      ${U().foot('Pulse reads the public status feeds of Meta, Google Ads, Shopify, Pinterest, OpenAI and Anthropic. TikTok, Microsoft, LinkedIn, Snap, X, Amazon and Apple publish no machine feed, so they show their status page link. An outage also shows on Home &gt; Day check. Slack alerts and client fan-out stay on the Pulse page.')}`);
    const again = $('#puAgain'); if (again) again.onclick = () => H.show('pulse');
    document.querySelectorAll('#main [data-pf]').forEach(b => b.onclick = () => { PULSE_F = b.dataset.pf; pulse(false); });
    smokeCard(t);
  }
  /* LOCUS ITSELF (2026-10-10): the daily smoke check (account-health smoke.js). Every page's data routes for All
     clients and each active brand, the connections and data freshness, every morning at 6am Central; failures
     go to Locus channel. Run now is a dry run unless "Post failures to Slack" is ticked. */
  async function smokeCard(t, fresh) {
    const el = $('#puSmoke'); if (!el) return;
    const chrono = iso => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
    let d = fresh;
    if (!d) { try { d = await H.apiAH(`/api/smoke?t=${Date.now()}`); } catch (e) { if (t === H.RUN() && el.isConnected) el.innerHTML = U().card('Locus itself', '', `<p class="v2bad">The check did not answer: ${esc(e.message)}</p>`); return; } }
    if (t !== H.RUN() || !el.isConnected) return;
    const L = d.last, st = d.settings || {};
    const fails = (L && L.failed) || [];
    const say = !L ? 'Not run yet. The first check runs at 6am Central, or press Run now.'
      : fails.length ? `<b class="bad">${fails.length} of ${L.total} checks failed</b> ${L.manual ? 'on a run by hand' : 'this morning'}, ${esc(chrono(L.at))} Central.`
      : `<b class="good">All ${L.total} checks passed</b>, ${esc(chrono(L.at))} Central.`;
    const run = d.running ? `<p class="v2hint">This morning's check is part way: ${d.running.done} of ${d.running.of} pages read. It finishes on the next hourly run.</p>` : '';
    const rows = fails.slice(0, 40).map(f => `<tr><td>${esc(f.brand)}</td><td>${esc(f.page)}</td><td class="pu-note">${esc(f.error)}</td><td><button type="button" class="ds-btn pu-open" data-sa="${esc(f.act || 'all')}" data-so="${esc((/[?&]open=([a-z]+)/.exec(f.link || '') || [])[1] || 'overview')}">Open</button></td></tr>`).join('');
    const facts = L ? [
      `${L.checked} page reads${L.brands != null ? ` across ${L.brands} brands and All clients` : ''}, plus connections and freshness`,
      L.not_checked ? `${L.not_checked} reads did not fit in the budget` : '',
      L.cost != null ? `about ${L.cost} subrequests` : '',
      L.slowest && L.slowest[0] ? `slowest: ${esc(L.slowest[0].page)} for ${esc(L.slowest[0].brand)}, ${(L.slowest[0].ms / 1000).toFixed(1)}s` : '',
      L.dry ? 'dry run, nothing posted' : L.posted ? 'posted to Locus channel' : L.post_error ? esc(L.post_error) : fails.length ? '' : 'nothing to post',
    ].filter(Boolean).join('. ') + '.' : '';
    el.innerHTML = U().card('Locus itself', 'Every page, every brand, the connections and data freshness, read every morning at 6am Central. Only failures are posted, to Locus channel.',
      `<p class="v2say">${say}</p>${run}
      ${rows ? `<div class="v2tbl pu-t"><table><thead><tr><th>Brand</th><th>What</th><th>Error</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
      ${facts ? `<p class="v2hint">${facts}</p>` : ''}
      <div class="pu-sm">
        <label><input type="checkbox" id="smOn" ${st.check !== 'off' ? 'checked' : ''}> Check every morning <span class="faint">(off stops the daily check)</span></label>
        <label><input type="checkbox" id="smLoud" ${st.quiet === 'off' ? 'checked' : ''}> Post when everything passes too <span class="faint">(default: failures only)</span></label>
        <label><input type="checkbox" id="smPost"> Post this run's failures to Slack <span class="faint">(unticked = a dry run: results show here only)</span></label>
        ${st.channel ? '' : '<p class="v2hint">No Locus channel is set, so nothing is posted. Set it in Agency settings, Locus.</p>'}
      </div>`,
      `<button type="button" class="ds-btn" id="smRun"><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg>Run now</button>`);
    el.querySelectorAll('.pu-open').forEach(b => b.onclick = () => pickAct(b.dataset.sa, b.dataset.so));
    const save = body => H.apiAH('/api/smoke', { method: 'PUT', body: JSON.stringify(body) }).catch(e => alertBox(e.message));
    const alertBox = msg => { const p = el.querySelector('.pu-sm'); if (p) p.insertAdjacentHTML('beforeend', `<p class="v2bad">${esc(msg)}</p>`); };
    el.querySelector('#smOn').onchange = e => save({ check: e.target.checked ? 'on' : 'off' });
    el.querySelector('#smLoud').onchange = e => save({ quiet: e.target.checked ? 'off' : 'on' });
    el.querySelector('#smRun').onclick = async e => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Reading every page, about a minute…';
      try { const r = await H.apiAH('/api/smoke/run', { method: 'POST', body: JSON.stringify({ dry: !el.querySelector('#smPost').checked }) }); if (t === H.RUN()) smokeCard(t, { ...d, last: r.last }); }
      catch (err) { b.disabled = false; b.textContent = 'Run now'; alertBox(`Run now failed: ${err.message}`); }
    };
  }
  function pulseCss() {
    if (document.getElementById('pucss')) return;
    const st = document.createElement('style'); st.id = 'pucss';
    st.textContent = `
      .dk .pu-tiles{margin:0 0 16px}
      .dk .pu-of{font-size:15px;font-weight:500;color:var(--muted);letter-spacing:0}
      .dk .pu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
      .dk .pu-p{border:1px solid var(--line);border-radius:var(--r-md);padding:14px 16px;display:flex;flex-direction:column;gap:10px;min-width:0;background:var(--surface)}
      .dk .pu-p.pu-warn{border-color:color-mix(in srgb,var(--warn) 45%,var(--line))}
      .dk .pu-p.pu-bad{border-color:color-mix(in srgb,var(--bad) 45%,var(--line))}
      .dk .pu-t th,.dk .pu-t td{text-align:left}.dk .pu-t th:last-child,.dk .pu-t td:last-child{text-align:right}
      .dk .pu-ph{display:flex;align-items:center;gap:10px}
      .dk .pu-pn{flex:1;min-width:0;display:flex;flex-direction:column}
      .dk .pu-pn b{font-weight:600;color:var(--ink);line-height:1.3}
      .dk .pu-pn em{font-style:normal;font-size:12px;color:var(--muted)}
      .dk .pu-ph .ds-chip{flex:none}
      .dk .pu-ok{margin:0;font-size:13px;color:var(--muted)}
      .dk .pu-issues{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--ink-2)}
      .dk .pu-issues b{font-weight:600;color:var(--ink)}
      .dk .pu-link{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;font-weight:550;color:var(--brand);text-decoration:none;margin-top:auto}
      .dk .pu-link:hover{text-decoration:underline}
      .dk .pu-link svg,.dk .pu-dark .ds-chip svg.ic{width:12px;height:12px}
      .dk .pu-dark{margin-top:20px;padding-top:16px;border-top:1px solid var(--line)}
      .dk .pu-dark > div{display:flex;flex-wrap:wrap;gap:8px}
      .dk .pu-dark .ds-logo{border:0;background:transparent}
      .dk .pu-bars{display:grid;grid-template-columns:repeat(14,minmax(0,1fr));gap:6px;height:150px;align-items:end;padding:0 0 22px;position:relative;background-image:linear-gradient(var(--line) 1px,transparent 1px);background-size:100% 25%;background-position:0 0}
      .dk .pu-bar{height:100%;display:flex;flex-direction:column;justify-content:flex-end;position:relative;cursor:default;border-radius:var(--r-xs)}
      .dk .pu-bar:hover{background:var(--surface-2)}
      .dk .pu-bar i{display:block;background:var(--warn);border-radius:4px 4px 0 0;opacity:.85}
      .dk .pu-bar span{position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);font-size:11px;color:var(--faint);white-space:nowrap}
      .dk .pu-axis{display:none}
      .dk .pu-f{margin:0 0 12px;flex-wrap:wrap}
      .dk .pu-when{white-space:nowrap;color:var(--muted)}
      .dk .pu-pl{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
      .dk .pu-note{color:var(--muted)}
      .dk .pu-dur{white-space:nowrap;color:var(--ink-2);text-align:right}
      .dk .pu-sm{display:flex;flex-direction:column;gap:6px;margin-top:12px;font-size:13px}
      .dk .pu-sm label{display:flex;gap:8px;align-items:center;cursor:pointer}
      .dk .pu-open{padding:4px 10px}
      .dk .pu-sk{display:grid;gap:16px}.dk .pu-sk>span{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
      .dk .pu-sk i{display:block;height:116px;border-radius:var(--r-lg);background:var(--surface-2);animation:pu-sk 1.4s ease-in-out infinite}
      .dk .pu-sk>i:first-child{height:22px;width:60%;border-radius:6px}
      @keyframes pu-sk{50%{opacity:.55}}
      @media (max-width:720px){.dk .pu-sk>span{grid-template-columns:repeat(2,minmax(0,1fr))}.dk .pu-bar span{display:none}}
      @media (prefers-reduced-motion:reduce){.dk .pu-sk i{animation:none}}
    `;
    document.head.appendChild(st);
  }

  /* =========================================================================================
   * HOME: NEEDS YOU TODAY (2026-10-09). Home is the one place to see everything at a glance, so it carries one strip
   * of what is waiting, each a number that opens the page where it gets done. Hidden counts are zero.
   * ======================================================================================= */
  async function needs(el, all) {
    if (!el) return; css();
    const t = H.RUN(), q = encodeURIComponent(H.S.act);
    const [ov, td, se] = await Promise.allSettled([window.ovTodayLoad ? window.ovTodayLoad(all) : Promise.resolve(null), get(`/api/hub/today?act=${q}`), H.api(`/api/season?act=${q}`)]);
    if (t !== H.RUN() || !el.isConnected) return;
    const o = ov.status === 'fulfilled' ? ov.value : null, d = td.status === 'fulfilled' ? td.value : null, sd = se.status === 'fulfilled' ? se.value : null;
    const rows = (d?.rows || []), c = k => rows.filter(r => r.kind === k).length;
    const chips = [];
    const chip = (n, label, go, tip) => { if (n > 0) chips.push(`<button type="button" class="dk-need" data-go="${go}"${tip ? U().tipAttr(esc(tip)) : ''}><b>${n}</b>${esc(label)}</button>`); };
    chip(c('fix'), c('fix') === 1 ? 'ad account to fix' : 'ad accounts to fix', 'today', 'Delivery stopped, a sync failing or a missing goal.');
    chip(c('scale') + c('cut') + c('trim') + c('refresh'), 'ad sets to change', 'today', `${c('scale')} to scale, ${c('cut')} to cut, ${c('trim')} to trim, ${c('refresh')} to refresh. Ad set first.`);
    chip(o?.calls?.n || 0, 'tests to call', 'today', (o?.calls?.who || []).join(', '));
    chip(o?.briefs?.n || 0, 'daily briefs to send', 'brief', (o?.briefs?.who || []).join(', '));
    chip(o?.reports?.n || 0, 'reports to send', 'reports', (o?.reports?.who || []).join(', '));
    chip(o?.drafts?.n || 0, 'research drafts to approve', 'research', (o?.drafts?.who || []).join(', '));
    /* The season: what is live today, or the next change within two weeks. */
    const today = sd?.today || ymdL(new Date()), soon = (() => { const x = new Date(today + 'T12:00:00'); x.setDate(x.getDate() + 14); return ymdL(x); })();
    const ph = (sd?.accounts || []).flatMap(a => (a.phases || []).filter(p => p.status !== 'skip' && p.start).map(p => ({ ...p, brand: a.name })));
    const liveNow = ph.filter(p => p.start <= today && (p.end || p.start) >= today), next = ph.filter(p => p.start > today && p.start <= soon).sort((x, y) => x.start.localeCompare(y.start))[0];
    const label = (window.SEASON_TAB && window.SEASON_TAB().label) || 'Season';
    if (liveNow.length) chips.push(`<button type="button" class="dk-need" data-go="warlive"${U().tipAttr(esc(liveNow.map(p => `${p.brand}: ${p.name}`).join(', ')))}><b>${liveNow.length}</b>${esc(label)} offers live now</button>`);
    if (next) chips.push(`<button type="button" class="dk-need" data-go="season"><b>${md(next.start)}</b>${esc(next.brand)}: ${esc(next.name)} starts</button>`);
    el.innerHTML = `<div class="dk-needs"><span class="lbl">Needs you today</span>${chips.length ? chips.join('') : '<span class="v2hint" style="margin:0">Nothing waiting.</span>'}</div>`;
    el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => H.show(b.dataset.go));
  }

  window.DeskTab = {
    needs(el, host, all) { H = host; return needs(el, all); },
    render(tab, host, first) {
      H = host;
      if (tab === 'yesterday') return yesterday(first);
      if (tab === 'today') return today(first);
      if (isWarTab(tab)) return war(first, tab);
      if (tab === 'pulse') return pulse(first);
    },
    /* The season tab's name and when it shows, from anywhere (Agency settings > Clients uses it). */
    seasonCfg(host) { if (host && !H) H = host; else if (host) H = { ...H, ...host }; seasonCfg(); },
  };
})();
