/* THE DAILY DESK (2026-10-09, docs/handoffs/locus-structure-audit-step1.md, signed off by Cole).
 * Four screens in their own closure, drawn with the v2 building blocks (window.V2UI):
 *   Home > Yesterday   "was yesterday a bad day, for every brand, and why"   GET /api/hub/yesterday + account-health /api/market
 *   Ads > Today        the media buyer's list (ad set first)                 GET /api/hub/today + /api/brand/tests-overview
 *   Season > War Room  plan (7 steps) before the sale, live during it       GET /api/season/war (2026-10-09 rebuild)
 *   Tools > Platform status   Pulse, the ad-platform outage monitor          mobius-ad-status worker /api/status (public)
 * The host (index.html) passes the same helpers it gives v2.js: window.DeskTab.render(tab, host, first).
 * Nothing here changes an ad account: "Done" writes a manual line to the Change Log (which the Daily Brief's
 * "What we did" reads); "Not now" hides a row on this computer until tomorrow. */
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
      .dk .dk-counts{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
      .dk .dk-cnt{border:1px solid var(--line);border-radius:8px;padding:7px 12px;background:var(--surface);display:flex;gap:8px;align-items:baseline;cursor:pointer;color:var(--ink)}
      .dk .dk-cnt b{font-size:17px}.dk .dk-cnt.on{border-color:var(--brand)}
      .dk .dk-row{display:grid;grid-template-columns:72px minmax(0,1.2fr) minmax(0,1.6fr) auto;gap:12px;align-items:start;padding:11px 0;border-top:1px solid var(--line)}
      @media (max-width:820px){.dk .dk-row{grid-template-columns:1fr}}
      .dk .dk-k{font-size:10.5px;font-weight:700;letter-spacing:.05em;padding:3px 7px;border-radius:5px;text-align:center}
      .dk .dk-k.scale{background:var(--good-bg);color:var(--good)}.dk .dk-k.cut{background:var(--bad-bg);color:var(--bad)}.dk .dk-k.trim{background:var(--warn-bg);color:var(--warn)}.dk .dk-k.fix{background:var(--surface-2);color:var(--ink)}.dk .dk-k.refresh,.dk .dk-k.call{background:var(--brand-soft);color:var(--brand)}
      .dk .dk-row .nm{font-weight:600;word-break:break-word}.dk .dk-row .meta{font-size:12px;color:var(--muted)}.dk .dk-row .why{font-size:12.5px;color:var(--ink-2)}
      .dk .dk-acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      .dk .dk-row.done{opacity:.45}
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
      .dk-form .opt{display:flex;gap:8px;align-items:flex-start;font-weight:400}.dk-form .opt small{display:block;color:var(--muted)}`;
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
    const brands = isLatest && (m.brands || []).length ? U().card(agency ? 'Our brands that day' : 'Your brand that day', 'Meta cost per sale against each brand\'s own last 28 days (Meta\'s count).',
      `<div class="v2tbl"><table><thead><tr><th>Brand</th><th>Meta spend</th><th>Cost per sale</th><th>Its normal</th><th></th></tr></thead><tbody>${m.brands.map(b => `<tr><td><b>${esc(b.name)}</b></td><td>${U().money(b.spend)}</td><td>${b.cpa != null ? U().money(b.cpa) : 'no sale'}</td><td>${b.cpa_normal != null ? U().money(b.cpa_normal) : '–'}</td><td>${b.change == null ? '' : `<span class="v2pill ${b.change >= 0.15 ? 'bad' : b.change <= -0.15 ? 'good' : ''}">${b.change >= 0 ? '+' : ''}${Math.round(b.change * 100)}%</span>`}</td></tr>`).join('')}</tbody></table></div>`) : '';
    $('#main').innerHTML = shell('yesterday', title, `<div id="dkNow"></div><p class="v2say lead" style="margin:0 0 12px">Was it a bad day on Meta? A bad day when two or more of four signs agree.</p>
      ${answer}${isLatest ? `<div id="dkVerdict"></div>` : ''}${U().card('The last 30 days', '', strip)}${U().card(`The four signs, ${wdl(sel.date)} ${md(sel.date)}`, '', signs)}${brands}`);
    const root = $('#main');
    root.querySelectorAll('.dk-day').forEach(el => el.onclick = () => { MDSEL = el.dataset.d; yesterday(false); });
    if (isLatest) fillVerdict(m, t, agency);
    fillNow(t);
  }

  /* RIGHT NOW (2026-10-09, account-health checknow.js): today so far against a normal day by this hour, the signs,
   * the market now. Cached 10 minutes on the server; Refresh skips that, "What are advertisers saying?" adds a
   * web search (a few cents). Kept in the page so clicking a day below does not ask again. */
  let NOWC = null;
  async function fillNow(t, opt = {}) {
    const el = document.getElementById('dkNow'); if (!el) return;
    const act = H.S.act || 'all', key = act;
    const draw = (body, sub) => { const e2 = document.getElementById('dkNow'); if (e2 && t === H.RUN()) e2.innerHTML = U().card('Right now', `<span class="dk-acts"><button type="button" class="v2btn ghost" id="dkNowRef">Refresh</button><button type="button" class="v2btn ghost" id="dkNowWeb">What are advertisers saying?</button></span>`, `${sub ? `<p class="v2hint" style="margin:0 0 10px">${sub}</p>` : ''}${body}`); wireNow(t); };
    if (!opt.fresh && !opt.web && NOWC && NOWC.key === key && Date.now() - NOWC.at < 5 * 60e3) { draw(nowBody(NOWC.data), nowSub(NOWC.data)); return; }
    if (!NOWC || NOWC.key !== key) draw('<p class="v2hint" style="margin:0">Checking today so far against a normal day&hellip;</p>');
    let r; try { r = await H.apiAH(`/api/daycheck/now?act=${encodeURIComponent(act)}${opt.fresh ? '&fresh=1' : ''}${opt.web ? '&web=1' : ''}`); }
    catch (e) { draw(`<p class="v2bad" style="margin:0">Could not check: ${esc(e.message)}</p>`); return; }
    if (opt.web === false && NOWC?.data?.chatter && !r.chatter) r.chatter = NOWC.data.chatter;
    NOWC = { key, at: Date.now(), data: r };
    draw(nowBody(r), nowSub(r));
  }
  function wireNow(t) {
    const a = document.getElementById('dkNowRef'), b = document.getElementById('dkNowWeb');
    if (a) a.onclick = () => { a.disabled = true; a.textContent = 'Checking…'; fillNow(t, { fresh: true }); };
    if (b) b.onclick = () => { b.disabled = true; b.textContent = 'Searching…'; fillNow(t, { web: true }); };
  }
  const nowSub = r => `${esc(r.how || '')} As of ${new Date(r.as_of).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })} Central.`;
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
    out += `<p class="v2hint" style="margin:8px 0 0">Want a ping when this happens? Ask Locus: "tell me if revenue is under half of normal by noon". Alerts live on Reports > Dashboards.</p>`;
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
   * ADS > TODAY
   * ======================================================================================= */
  let KIND = 'all';
  const OPEN = {};
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
    const done = store('pf_today_done'), snooze = store('pf_today_snooze');
    const dn = done[todayKey] || {}, sn = snooze[todayKey] || {};
    const rows = (d.rows || []).map(r => ({ ...r, key: `${r.kind}:${r.adset_id || ''}:${r.ad_id || ''}:${r.act_id}` }));
    /* Test calls: one row per brand with tests ready for a call (the Make a call box on the Test calls page). */
    for (const b of (tests?.brands || [])) {
      if (!b.call || (one && b.act_id !== one.act_id)) continue;
      const acc = H.S.accounts.find(a => a.act_id === b.act_id); if (!acc) continue;
      rows.push({ kind: 'call', act_id: b.act_id, brand: b.name, adset: `${b.call} test${b.call === 1 ? '' : 's'} ready for a call`, why: 'Spent enough to judge, or ran long enough. Keep, kill or give another week; the call posts to Asana.', stake: 5e5, key: `call:${b.act_id}` });
    }
    const vis = rows.filter(r => !sn[r.key]);
    const kinds = [['all', 'All'], ['fix', 'Fix'], ['scale', 'Scale'], ['cut', 'Cut'], ['trim', 'Trim'], ['refresh', 'Refresh'], ['call', 'Call']];
    const cnt = k => vis.filter(r => k === 'all' || r.kind === k).length;
    const counts = `<div class="dk-counts">${kinds.map(([k, l]) => `<button type="button" class="dk-cnt${KIND === k ? ' on' : ''}" data-k="${k}"><b>${cnt(k)}</b>${l}</button>`).join('')}</div>`;
    const shown = vis.filter(r => KIND === 'all' || r.kind === KIND);
    const by = {}; for (const r of shown) (by[r.act_id] ??= []).push(r);
    const order = Object.entries(by).sort((a, b) => b[1].reduce((s, r) => s + (r.stake || 0), 0) - a[1].reduce((s, r) => s + (r.stake || 0), 0));
    const yv = () => '';
    const amLink = r => { const n = String(r.meta_act || '').replace(/^act_/, ''); return n ? `https://adsmanager.facebook.com/adsmanager/manage/${r.ad_id ? 'ads' : 'adsets'}?act=${n}${r.adset_id ? `&selected_adset_ids=${r.adset_id}` : ''}${r.ad_id ? `&selected_ad_ids=${r.ad_id}` : ''}` : null; };
    const row = r => { const cur = r.currency || 'USD', am = amLink(r);
      const meta = r.kind === 'call' ? 'From Asana' : r.spend != null ? `${U().money(r.spend, cur)} spent · ${U().int(r.orders)} sale${Math.round(r.orders) === 1 ? '' : 's'} · ${r.cpa ? U().money(r.cpa, cur) + ' per sale' : 'no sale'}${r.goal ? ` · goal ${U().money(r.goal, cur)}` : ''}${r.n_ads ? ` · ${r.n_ads} ad${r.n_ads === 1 ? '' : 's'}` : ''}` : '';
      const anchor = (r.kind === 'cut' || r.kind === 'scale') && r.anchor && r.n_ads > 1 ? ` <span class="faint">Anchor: "${esc(r.anchor.name)}" (${Math.round((r.anchor.share || 0) * 100)}% of the set's spend).</span>` : '';
      const btn = r.kind === 'call' ? `<button type="button" class="v2btn dk-p" data-go="act:${esc(r.act_id)}:tests">Make the calls</button>`
        : r.kind === 'refresh' ? `<button type="button" class="v2btn dk-p" data-brief="${esc(r.key)}">Brief the iteration</button>`
        : am ? `<a class="v2btn ghost" href="${esc(am)}" target="_blank" rel="noopener">Open in Ads Manager</a>` : '';
      return `<div class="dk-row${dn[r.key] ? ' done' : ''}"><span class="dk-k ${r.kind}">${r.kind.toUpperCase()}</span>
        <div><div class="nm">${esc(r.ad ? r.ad : r.adset || '')}</div><div class="meta">${r.ad && r.adset ? `in ${esc(r.adset)} · ` : ''}${meta}</div></div>
        <div class="why">${esc(r.why || '')}${anchor}</div>
        <div class="dk-acts">${btn}${r.kind === 'call' ? '' : `<button type="button" class="v2btn ghost" data-done="${esc(r.key)}">${dn[r.key] ? 'Undo' : 'Done'}</button>`}<button type="button" class="v2btn ghost" data-snooze="${esc(r.key)}">Not now</button></div></div>`; };
    const groups = order.map(([id, rs]) => { rs.sort((a, b) => (b.stake || 0) - (a.stake || 0)); const name = rs[0].brand; const all = OPEN[id] || one; const list = all ? rs : rs.slice(0, 3);
      return `<section class="v2card"><div class="dk-gh"><span><b style="font-size:14px">${esc(name)}</b> &nbsp;${yv(id)}</span><span class="v2hint" style="margin:0">${rs.length} to do</span></div>${list.map(row).join('')}${rs.length > 3 && !one ? `<button type="button" class="v2link" data-more="${esc(id)}" style="margin-top:8px">${OPEN[id] ? 'Show fewer' : `Show ${rs.length - 3} more`}</button>` : ''}</section>`; }).join('');
    const win = (d.brands || [])[0];
    const sub = win ? `<b>What the media buyer changes today, ad set first.</b> Ranked by money at stake. Judged on Triple Whale last platform click, ${md(win.from)} to ${md(win.to)}, with each brand's Ads rules.` : '<b>What the media buyer changes today, ad set first.</b>';
    $('#main').innerHTML = shell('today', title, `<p class="v2say lead">${sub}</p>${counts}
      ${groups || U().card('Nothing to do', '', `<p class="v2hint">${KIND === 'all' ? 'No ad set crossed a rule and nothing needs fixing.' : 'Nothing of this kind today.'}</p>`)}
      ${one ? `<p class="v2hint"><button type="button" class="v2link" data-go="act:${esc(one.act_id)}:mtoday">Spend today, hour by hour, against a normal day</button></p>` : ''}
      ${U().foot(`${esc(d.rules_note || '')} Nothing here changes an ad account. Done writes a line to the Change Log, which the Daily Brief reads for "What we did". Not now hides a row on this computer until tomorrow.`)}`);
    const root = $('#main');
    root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { KIND = b.dataset.k; today(false); });
    root.querySelectorAll('[data-more]').forEach(b => b.onclick = () => { OPEN[b.dataset.more] = !OPEN[b.dataset.more]; today(false); });
    root.querySelectorAll('[data-go]').forEach(el => el.onclick = () => { const [, id, tab] = el.dataset.go.split(':'); pickAct(id, tab); });
    root.querySelectorAll('[data-snooze]').forEach(b => b.onclick = () => { const s2 = store('pf_today_snooze'); s2[todayKey] = { ...(s2[todayKey] || {}), [b.dataset.snooze]: 1 }; Object.keys(s2).forEach(k => { if (k !== todayKey) delete s2[k]; }); store('pf_today_snooze', s2); today(false); });
    root.querySelectorAll('[data-done]').forEach(b => b.onclick = async () => {
      const k = b.dataset.done, r = rows.find(x => x.key === k); if (!r) return;
      const d2 = store('pf_today_done'); const day = d2[todayKey] || {};
      if (day[k]) { delete day[k]; d2[todayKey] = day; store('pf_today_done', d2); return today(false); }
      b.disabled = true; b.textContent = 'Logging…';
      const verb = { scale: 'Scaled', cut: 'Cut', trim: 'Switched off', fix: 'Fixed', refresh: 'Briefed an iteration of' }[r.kind] || 'Acted on';
      try {
        await H.apiAH('/api/activities', { method: 'POST', body: JSON.stringify({ act_id: r.act_id, category: 'manual', summary: `${verb} ${r.ad ? `"${r.ad}"` : `ad set "${r.adset}"`} (from Today)`, reason: r.why || null, actor: 'Locus Today' }) });
        day[k] = 1; d2[todayKey] = day; Object.keys(d2).forEach(x => { if (x !== todayKey) delete d2[x]; }); store('pf_today_done', d2); today(false);
      } catch (e) { b.disabled = false; b.textContent = 'Done'; H.confirmModal && H.confirmModal('Could not log it', esc(e.message), 'OK'); }
    });
    root.querySelectorAll('[data-brief]').forEach(b => b.onclick = () => { const r = rows.find(x => x.key === b.dataset.brief); if (r && H.AskUI) H.AskUI.ask(`For ${r.brand}: the anchor ad "${r.ad}" in ad set "${r.adset}" is tiring (${r.why}). Brief three iterations of it as an Asana brief: same angle, new hooks.`); });
  }

  /* =========================================================================================
   * SEASON > WAR ROOM (rebuilt 2026-10-09: Triple Whale's BFCM Command Center, done in Locus).
   * Cole: "the war room should be like Triple Whale's war room, full on plans and everything, the actual war room."
   * One brand: PLAN (seven steps with progress) before the sale, LIVE (today against the plan, hour by hour) during it.
   * All clients: every brand in the season, riskiest first. Data: GET /api/season/war (profit worker season.js).
   * Writes: PUT /api/season/war (the plan, merged server side), PUT /api/season/answer key goals (the ladder, one place),
   * account-health /api/alerts (thresholds as real Slack alerts, source 'war', only inside the sale dates),
   * PUT /api/season/checkin (the desk). Stock from the Supply worker; the read from account-health /api/read.
   * A client login sees its own brand read only (no edits, no stock, no alerts, no read).
   * ======================================================================================= */
  const SUP = 'https://mobius-supply.mobius-digital.workers.dev';
  const WR = { mode: {}, tv: false, timer: null, data: null, stock: {}, supBrands: null, goals: null, bud: null, alerts: null };
  const ANCHOR = { baseline: 'wrBase', goals: 'wrGoals', ladder: 'wrGoals', budget: 'wrBudget', offers: 'wrOffers', alerts: 'wrAlerts', stock: 'wrStock' };
  const isCl = () => H.S.role === 'client';
  const seasonLabel = () => (window.SEASON_TAB && window.SEASON_TAB().label) || 'Black Friday';
  const warTitle = () => `${esc(seasonLabel())}: War Room`;
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
  const sec = (id, n, done, title, sub, body, cap) => `<section class="v2card wr-sec" id="${id}"><div class="v2h"><h3><span class="wr-n${done ? ' done' : ''}">${done ? '✓' : n}</span>${esc(title)}</h3>${cap ? `<span class="cap">${cap}</span>` : ''}</div>${sub ? `<p class="v2hint wr-sub">${sub}</p>` : ''}${body}</section>`;

  function warStop() { if (WR.timer && !WR.tv) { clearInterval(WR.timer); WR.timer = null; } }
  async function war(first) {
    css(); warStop();
    const t = H.RUN(), act = H.S.act || 'all';
    if (first || !WR.data || (WR.data.act_id || 'all') !== act) $('#main').innerHTML = shell('war', warTitle(), U().card('', '', '<p class="v2hint">Loading the war room&hellip;</p>'));
    if (act === 'all') return warGrid(t);
    const mode = WR.mode[act] || null;
    let d; try { d = await H.api(`/api/season/war?act=${encodeURIComponent(act)}${mode === 'live' ? '&live=1' : ''}`); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('war', warTitle(), U().card('Could not load the war room', '', `<p class="v2bad">${esc(e.message)}</p>`)); return; }
    if (t !== H.RUN()) return;
    if (!WR.data || WR.data.act_id !== d.act_id) { WR.goals = null; WR.bud = null; }
    WR.data = d;
    paintWar(t, d, mode || (d.mode === 'live' ? 'live' : 'plan'));
  }
  function paintWar(t, d, m) {
    const done = d.steps.filter(s => s.done).length;
    $('#main').innerHTML = shell('war', warTitle(), `<div class="wr${WR.tv ? ' tv' : ''}" id="wrRoot">${warStrip(d, m, done)}${m === 'live' ? liveBody(d) : planBody(d, done)}</div>`);
    const root = $('#wrRoot');
    root.querySelectorAll('[data-wrm]').forEach(b => b.onclick = () => { WR.mode[d.act_id] = b.dataset.wrm; if (b.dataset.wrm === 'plan' && WR.tv) tvMode(false); war(false); });
    const cfg = root.querySelector('#dkSeasonCfg'); if (cfg) cfg.onclick = seasonCfg;
    const rf = root.querySelector('#wrRefresh'); if (rf) rf.onclick = () => war(false);
    const tv = root.querySelector('#wrTv'); if (tv) tv.onclick = () => tvMode(!WR.tv);
    if (m === 'live') wireLive(t, d); else wirePlan(t, d);
  }
  function warStrip(d, m, done) {
    const days = d.sale_days_to;
    const when = d.mode === 'live' ? '<b class="wr-dot">Live now</b>' : d.mode === 'after' ? 'The sale is over' : days === 1 ? 'Starts tomorrow' : `<b>${days}</b> days to go`;
    const nxt = d.steps.find(s => !s.done);
    return `<div class="wr-strip">
      <div class="wr-seg" role="tablist" aria-label="Plan or live"><button type="button" role="tab" data-wrm="plan" class="${m === 'plan' ? 'on' : ''}">Plan</button><button type="button" role="tab" data-wrm="live" class="${m === 'live' ? 'on' : ''}">Live</button></div>
      <div class="wr-prog"${U().tipAttr(nxt ? `Next: ${esc(nxt.label)}. ${esc(nxt.why || '')}` : 'Every step is done.')}><span><b>${done} of 7</b> steps</span><i><em style="width:${(done / 7 * 100).toFixed(0)}%"></em></i></div>
      <div class="wr-when"><b>${esc(d.name)}</b><span>${when} · sale ${wd(d.sale.start)} ${md(d.sale.start)} to ${wd(d.sale.end)} ${md(d.sale.end)}</span></div>
      <div class="wr-acts">${m === 'live' ? `<span class="faint" id="wrAsOf">${d.live && d.live.as_of ? `as of ${new Date(d.live.as_of).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })} Central` : ''}</span><button type="button" class="v2btn ghost" id="wrRefresh">Refresh</button><button type="button" class="v2btn ghost" id="wrTv">${WR.tv ? 'Leave TV mode' : 'TV mode'}</button>` : ''}${!isCl() && !WR.tv ? '<button type="button" class="v2btn ghost" id="dkSeasonCfg">Name and when it shows</button>' : ''}</div>
    </div>`;
  }

  /* ---------------- PLAN ---------------- */
  function planBody(d, done) {
    const st = d.steps.map((s, i) => `<button type="button" class="wr-st${s.done ? ' done' : ''}" data-jump="${ANCHOR[s.key]}"${s.why ? U().tipAttr(esc(s.why)) : ''}><i>${s.done ? '✓' : i + 1}</i><span>${esc(s.label)}</span></button>`).join('');
    const nxt = d.steps.find(s => !s.done);
    return `<div class="wr-plan"><nav class="wr-steps" aria-label="Plan steps"><div class="h">Build the ${esc(seasonLabel())} plan</div>${st}
        <p class="v2hint">${done === 7 ? 'Every step is done. Live takes over on the first sale day.' : `Next: ${esc(nxt.label)}. ${esc(nxt.why || '')}`}</p></nav>
      <div class="wr-body">${baseSec(d)}${goalsSec(d)}${budgetSec(d)}${offersSec(d)}${alertsSec(d)}${stockSec(d)}</div></div>`;
  }
  const stepDone = (d, k) => !!(d.steps.find(s => s.key === k) || {}).done;

  function baseSec(d) {
    const b = d.baseline || {}, T = b.totals, ro = isCl();
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
    return sec('wrBase', 1, stepDone(d, 'baseline'), 'Last year\'s Black Friday', `The same days around last year's Black Friday (${wdl(d.ly_bf)}, ${md(d.ly_bf)} ${d.ly_bf.slice(0, 4)}). Revenue is the P&amp;L line (sales less tax), orders are paid orders, channels are Triple Whale last platform click, products are the orders that carried them.`,
      `${ctl}${tiles}<h4>Revenue by day</h4><div class="v2tbl"><table class="wr-tbl"><thead><tr><th>Day</th><th>Revenue</th><th>Orders</th><th>AOV</th><th>Ad spend</th><th>MER</th></tr></thead><tbody>${days || '<tr><td colspan="6" class="faint">No days stored.</td></tr>'}</tbody></table></div>
        <div class="wr-2 wr-mt"><div><h4>Revenue by channel</h4>${chans || '<p class="v2hint">No channel rows for those days.</p>'}</div><div><h4>What sold</h4>${prods ? `<ol class="wr-prods">${prods}</ol>` : '<p class="v2hint">No stored orders for those days.</p>'}</div></div>`);
  }

  function goalsSec(d) {
    const ro = isCl();
    if (!WR.goals || WR.goals.act !== d.act_id) WR.goals = { act: d.act_id, list: d.goals_list.map(g => ({ ...g })) };
    const list = WR.goals.list;
    const opts = sel => Object.entries(d.metrics).map(([k, l]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(l)}</option>`).join('');
    const rows = list.map((g, i) => { const ly = lyOf(d, g.metric), ch = ly && g.target ? g.target / ly - 1 : null;
      return `<div class="wr-goal" data-gi="${i}">${ro ? `<b>${esc(d.metrics[g.metric])}</b>` : `<select data-gm aria-label="Metric">${opts(g.metric)}</select>`}
        ${ro ? `<b class="v">${fmtG(g.metric, g.target)}</b>` : `<input type="text" inputmode="decimal" data-gt value="${g.target ?? ''}" placeholder="Target for the sale" aria-label="Target">`}
        <span class="faint">Last year ${fmtG(g.metric, ly)}${ch != null ? ` · <b class="${ch >= 0 ? 'wr-up' : 'wr-dn'}">${ch >= 0 ? '+' : ''}${Math.round(ch * 100)}%</b>` : ''}</span>
        ${ro ? '' : `<button type="button" class="v2link" data-gx="${i}">Remove</button>`}</div>`; }).join('');
    const L = d.ladder || {};
    const lad = ro ? '' : `<div class="wr-lad"><h4>The scaling ladder</h4><p class="v2hint">The desk grades the last 3 hours of blended MER against these lines at 8am, 4pm and midnight. Same lines as The plan's Goals.</p>
      <div class="wr-lrow">${[['be', 'Breakeven', 'Under it: rework the offer'], ['target', 'Target', 'Between: hold'], ['s50', 'Scale 50% at', ''], ['s100', 'Scale 100% at', '']].map(([k, l, s]) => `<label>${l}<input type="text" inputmode="decimal" data-lad="${k}" value="${L[k] ?? ''}" placeholder="MER, e.g. 2.0"><small>${s}</small></label>`).join('')}</div></div>`;
    return sec('wrGoals', 2, stepDone(d, 'goals') && stepDone(d, 'ladder'), 'Goals and the ladder', `Up to five numbers to beat over the whole sale, ${md(d.sale.start)} to ${md(d.sale.end)}. Live tracks every one of them.${d.goals_saved ? '' : ' Filled from the season goals until you save.'}`,
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
    const ro = isCl(), B = budDraft(d), ch = d.channel_names || {};
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
    return sec('wrBudget', 4, stepDone(d, 'budget'), 'Paid budget by channel', `The paid budget for ${md(d.sale.start)} to ${md(d.sale.end)}, split by channel in dollars or percent.${lyS ? ` Last year's same days spent ${Ko(lyS)}.` : ''}`,
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
    const bfp = (d.phases || []).find(p => p.key === 'bf');
    const line = !bfp ? '<span class="v2pill bad">No Black Friday phase</span>' : `<span class="v2pill ${bfp.status === 'locked' ? 'good' : bfp.status === 'draft' || bfp.status === 'proposed' ? 'warn' : 'bad'}">Black Friday offer: ${STAT[bfp.status]}</span> <span>${esc(bfp.offer || 'Nothing written yet.')}</span>`;
    return sec('wrOffers', 5, stepDone(d, 'offers'), 'Offers and key dates', 'What runs when, from The plan, and every other date around the sale from the Calendar (drops, launches, emails). Hover a bar for the deal.',
      `<div class="wr-offer">${line}${isCl() ? '' : ' <button type="button" class="v2link" data-go="season">Edit on The plan</button>'}</div>
      <div class="wr-tl"><div class="wr-tlh"><span class="l"></span><div class="tr">${ticks.join('')}${mark(d.today, 'Today', 'today')}${mark(d.bf, 'Black Friday', 'bf')}</div></div>${rows || '<p class="v2hint">No phases in these weeks.</p>'}<div id="wrCal"><p class="v2hint">Reading the Calendar&hellip;</p></div></div>`);
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
    if (isCl()) return sec('wrAlerts', 6, stepDone(d, 'alerts'), 'Alerts', '', '<p class="v2hint">The Mobius team gets a Slack alert when spend runs over budget, MER or AOV drops under the floor, or a best seller runs low during the sale.</p>');
    const v = thDefaults(d);
    const rows = THRESH.map(([k, l, pre, post, note]) => `<div class="wr-th"><b>${l}</b><span>${pre}</span>${k === 'aov' ? '<span>$</span>' : ''}<input type="text" inputmode="decimal" data-th="${k}" value="${v[k] ?? ''}" placeholder="off" aria-label="${l}"><span>${post === '$' ? '' : post}</span><small>${note}</small></div>`).join('');
    const hours = Array.from({ length: 13 }, (_, i) => i + 9).map(h => `<option value="${h}"${h === v.hour ? ' selected' : ''}>${hourWord(h)}</option>`).join('');
    return sec('wrAlerts', 6, stepDone(d, 'alerts'), 'Alerts in Slack', `Real alerts: they post to ${esc(d.name)}'s internal Slack channel, at most once a day each, and only from ${md(d.sale.start)} to ${md(d.sale.end)}. Leave a box empty to turn that one off.`,
      `<div class="wr-ths">${rows}<div class="wr-th"><b>Check MER and AOV at</b><select id="wrTHour">${hours}</select><span>Central</span><small>2pm matches the Plan B call.</small></div></div>
      <div class="wr-row"><button type="button" class="v2btn dk-p" id="wrASave">${(d.war.alerts || []).length ? 'Update the Slack alerts' : 'Turn on the Slack alerts'}</button><span class="v2hint" id="wrAMsg"></span></div>
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
  async function saveAlerts(d, root) {
    const msg = root.querySelector('#wrAMsg'); msg.textContent = 'Saving…';
    const th = {}; root.querySelectorAll('[data-th]').forEach(i => { th[i.dataset.th] = numIn(i.value); });
    th.hour = +root.querySelector('#wrTHour').value;
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
    if (th.overspend && !(maxDay > 0)) notes.push('Overspend needs a budget first (step 4).');
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
      d.war = w.war; toast(`${out.length} Slack alert${out.length === 1 ? '' : 's'} on for the sale.${notes.length ? ' ' + notes.join(' ') : ''}`); war(false);
    } catch (e) { msg.textContent = e.message; }
  }

  function stockSec(d) {
    const ok = d.war && d.war.stock_ok;
    return sec('wrStock', 7, stepDone(d, 'stock'), 'Stock on the heroes', `Days of stock on last year's best sellers and this year's, against the sale's last day (${md(d.sale.end)}). From Products (Supply's own dates).`,
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
  function heroRows(d, v, n = 6) {
    if (!v) return { html: '<p class="v2hint">Reading stock&hellip;</p>', low: [] };
    if (v.error) return { html: `<p class="v2hint">Stock did not load: ${esc(v.error)}</p>`, low: [] };
    if (!v.connected) return { html: '<p class="v2hint">No stock feed for this brand. Stock reads from Shopify once the brand installs the Mobius Digital app (Lucky Golf is connected). Check the best sellers by hand, then press Stock checked.</p>', low: [] };
    const ids = (d.baseline.products || []).map(p => String(p.id));
    let list = ids.map(id => v.products.find(p => String(p.id) === id)).filter(p => p && p.status !== 'off').slice(0, n);
    if (list.length < n) list = list.concat(v.products.filter(p => !list.includes(p) && p.status !== 'off' && (p.sold90 || 0) > 0).sort((a, b) => (b.sold90 || 0) - (a.sold90 || 0)).slice(0, n - list.length));
    const verdict = p => p.status === 'out' ? ['bad', 'Out now'] : p.runOutDate && p.runOutDate <= d.sale.end ? ['bad', `Runs out ${md(p.runOutDate)}, before the sale ends`] : p.weeksOfCover != null && p.weeksOfCover * 7 < 30 ? ['warn', 'Under 30 days left'] : ['good', 'Covers the sale'];
    const low = list.filter(p => verdict(p)[0] === 'bad');
    const html = list.length ? `<div class="v2tbl"><table class="wr-tbl"><thead><tr><th>Product</th><th>On hand</th><th>A week</th><th>Days left</th><th></th></tr></thead><tbody>${list.map(p => { const [c, txt] = verdict(p);
      return `<tr><td>${esc(p.title)}${ids.includes(String(p.id)) ? ' <span class="faint">sold last BFCM</span>' : ''}</td><td class="num">${In(p.onHand)}</td><td class="num">${p.perWeek != null ? (Math.round(p.perWeek * 10) / 10) : '–'}</td><td class="num">${p.weeksOfCover != null ? In(p.weeksOfCover * 7) : '–'}</td><td><span class="v2pill ${c}">${esc(txt)}</span></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="v2hint">No product with sales to judge.</p>';
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
    root.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => { const s = document.getElementById(b.dataset.jump); if (s) { s.scrollIntoView({ behavior: 'smooth', block: 'start' }); s.classList.add('wr-ring'); setTimeout(() => s.classList.remove('wr-ring'), 1600); } });
    root.querySelectorAll('[data-go]').forEach(b => b.onclick = () => H.show(b.dataset.go));
    fillCal(t, d); fillAlerts(t, d); fillStock(t, d, 'wrStockBody');
    if (isCl()) return;
    const patch = (p, okMsg) => warPatch(d, p, okMsg);
    /* 1. baseline */
    const bl = root.querySelector('#wrBLoad'); if (bl) bl.onclick = async () => { const f = root.querySelector('#wrBFrom').value, to = root.querySelector('#wrBTo').value; if (!f || !to || to < f) return toast('Pick a from and a through date.', true); try { await patch({ baseline: { from: f, to }, baseline_ok: false }); war(false); } catch (e) { toast(e.message, true); } };
    const bo = root.querySelector('#wrBOk'); if (bo) bo.onclick = async () => { try { await patch({ baseline_ok: true }, 'Baseline set.'); war(false); } catch (e) { toast(e.message, true); } };
    const bu = root.querySelector('#wrBUndo'); if (bu) bu.onclick = async () => { try { await patch({ baseline_ok: false }); war(false); } catch (e) { toast(e.message, true); } };
    wireGoals(t, d);
    wireBudget(t, d);
    /* 6. alerts, 7. stock */
    const as = root.querySelector('#wrASave'); if (as) as.onclick = () => saveAlerts(d, root);
    const so = root.querySelector('#wrSOk'); if (so) so.onclick = async () => { try { await patch({ stock_ok: true }, 'Stock checked.'); war(false); } catch (e) { toast(e.message, true); } };
    const su = root.querySelector('#wrSUndo'); if (su) su.onclick = async () => { try { await patch({ stock_ok: false }); war(false); } catch (e) { toast(e.message, true); } };
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
        toast('Goals and ladder saved.'); WR.goals = null; war(false);
      } catch (e) { msg.textContent = e.message; }
    };
  }
  function wireBudget(t, d) {
    const root = $('#wrRoot'), sec = root && root.querySelector('#wrBudget'); if (!sec || isCl()) return;
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
      try { const w = await H.api('/api/season/war', { method: 'PUT', body: JSON.stringify({ act: d.act_id, patch: { budget: { total: B.total, channels: B.channels } } }) }); d.war = w.war; WR.bud = null; toast('Budget saved.'); war(false); }
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
    return `${dry}${hero}${sale}
      <div class="wr-lg"><section class="v2card wr-pace"><div class="v2h"><h3>Today, hour by hour</h3><span class="find">Revenue so far against the plan for today. Bars are each hour's revenue. Times are ${esc(d.tz || 'the store\'s')}.</span></div>${paceChart(L)}</section>
        <section class="v2card" id="wrDesk">${deskBox(d)}</section></div>
      <div class="wr-l3"><section class="v2card"><div class="v2h"><h3>Spend by channel</h3><span class="find">Against the day's budget for each channel, and where it should be by now.</span></div>${chanBox(L)}</section>
        <section class="v2card"><div class="v2h"><h3>Alerts today</h3></div><div id="wrFired">${isCl() ? '<p class="v2hint">The Mobius team gets these in Slack.</p>' : '<p class="v2hint">Reading&hellip;</p>'}</div></section>
        <section class="v2card"><div class="v2h"><h3>Stock on the heroes</h3></div><div id="wrStock2">${isCl() ? '<p class="v2hint">The Mobius team watches stock during the sale.</p>' : '<p class="v2hint">Reading stock&hellip;</p>'}</div></section></div>
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
    const lines = g.be != null ? `Breakeven ${Xo(g.be)} · target ${Xo(g.target)} · scale 50% at ${Xo(g.s50)} · scale 100% at ${Xo(g.s100)}` : 'No ladder set on the Plan tab.';
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
      <p class="v2hint">${ours.length ? `${ours.length} sale alert${ours.length === 1 ? '' : 's'} watching.` : 'No sale alerts saved. Turn them on in the Plan, step 6.'}</p>`;
    warRead(t, d);
  }
  async function fillStockLive(t, d) {
    const el = document.getElementById('wrStock2'); if (!el || isCl()) return;
    const v = await stockFor(d.act_id); if (t !== H.RUN() || !el.isConnected) return;
    const r = heroRows(d, v, 5); WR.lowStock = r.low.map(p => p.title);
    el.innerHTML = r.html;
  }
  /* Locus's read: what to do now. account-health /api/read (Sonnet), cached there per facts; the 15-minute
     slot in the facts makes it a fresh read at most every 15 minutes, and Refresh adds a nonce to force one. */
  async function warRead(t, d, fresh) {
    const el = document.getElementById('wrRead'); if (!el || isCl()) return;
    const L = d.live || {}, lad = ladderOf(d.ladder, L.last3 && L.last3.mer, L.last3 && L.last3.spend);
    const facts = { brand: d.name, what: 'Black Friday war room, live', date: L.date, in_sale: !!L.in_sale, sale: d.sale, today_so_far: L.today, plan_today: L.day, plan_source: L.plan_src,
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
    if (isCl()) return;
    fillStockLive(t, d).then(() => fillFired(t, d));
    fillNow(t);
  }
  function tvMode(on) {
    WR.tv = on;
    document.documentElement.classList.toggle('wr-tvmode', on);
    try { if (on && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch {}
    if (WR.timer) { clearInterval(WR.timer); WR.timer = null; }
    if (on) WR.timer = setInterval(() => { if (H.S.tab !== 'war') { tvMode(false); return; } NOWC = null; war(false); }, 5 * 60e3);
    war(false);
  }
  if (!window.__wrFs) { window.__wrFs = 1; document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && WR.tv) tvMode(false); }); }

  /* ---------------- ALL CLIENTS ---------------- */
  async function warGrid(t) {
    let d; try { d = await H.api('/api/season/war?act=all'); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('war', warTitle(), U().card('Could not load the war room', '', `<p class="v2bad">${esc(e.message)}</p>`)); return; }
    if (t !== H.RUN()) return;
    WR.data = { act_id: 'all' };
    const B = d.brands || [];
    const live = B.filter(b => b.mode === 'live'), steps = B.reduce((s, b) => s + b.done, 0);
    const bfIn = Math.max(0, dBetween(d.today, d.bf));
    const card = b => {
      const miss = b.steps.filter(s => !s.done);
      const L = b.live, pace = L && L.day ? L.day.pace : null, tone = pace == null ? '' : pace >= 1 ? 'good' : pace >= 0.85 ? 'warn' : 'bad';
      const body = b.mode === 'live' ? (L && !L.error ? `<div class="wr-gp ${tone}"><b>${pace != null ? Math.round(pace * 100) + '%' : '–'}</b><span>of today's plan by now</span></div><div class="wr-gl">${U().kmoney(L.today && L.today.sales, b.currency)} today · plan by now ${U().kmoney(L.day && L.day.plan_now, b.currency)} · MER ${U().x2(L.today && L.today.mer)}</div>`
        : `<p class="v2hint">${esc((L && L.error) || 'No live numbers yet.')}</p>`)
        : `<div class="wr-prog sm"><span><b>${b.done} of 7</b> steps</span><i><em style="width:${(b.done / 7 * 100).toFixed(0)}%"></em></i></div>
          <div class="wr-miss">${miss.length ? `Still to do: ${miss.slice(0, 3).map(s => esc(s.label.charAt(0).toLowerCase() + s.label.slice(1))).join(', ')}${miss.length > 3 ? ` and ${miss.length - 3} more` : ''}` : 'Ready for the sale.'}</div>`;
      return `<button type="button" class="wr-bcard${b.mode === 'live' ? ' live' : ''}" data-act="${esc(b.act_id)}">
        <div class="h"><b>${esc(b.name)}</b>${b.mode === 'live' ? '<span class="v2pill good">Live</span>' : b.mode === 'after' ? '<span class="v2pill">Over</span>' : `<span class="faint">${b.days_to} days</span>`}</div>
        ${body}<div class="wr-off">${b.bf_offer ? esc(b.bf_offer.slice(0, 110)) : '<span class="faint">No Black Friday offer written</span>'}</div>
        <div class="f"><span>Goal ${b.goal ? U().kmoney(b.goal, b.currency) : 'not set'}</span><span>${md(b.sale.start)} to ${md(b.sale.end)}</span></div></button>`;
    };
    $('#main').innerHTML = shell('war', warTitle(), `<div class="wr" id="wrRoot">
      <div class="wr-strip"><div class="wr-when"><b>Every brand in the season</b><span>${live.length ? `<b class="wr-dot">${live.length} live now</b> · ` : ''}${bfIn ? `${bfIn} days to Black Friday` : 'Black Friday is today'} · ${steps} of ${B.length * 7} plan steps done · riskiest first</span></div>
        <div class="wr-acts"><button type="button" class="v2btn ghost" id="dkSeasonCfg">Name and when it shows</button></div></div>
      ${B.length ? `<div class="wr-grid">${B.map(card).join('')}</div>` : U().card('No brand is in the season', '', '<p class="v2hint">Start one on The plan.</p>')}
      ${U().foot('Before the sale a card shows how much of the seven-step plan is done; during it, today against the plan by this hour. Click a brand for its war room.')}</div>`);
    const root = $('#wrRoot');
    root.querySelectorAll('[data-act]').forEach(el => el.onclick = () => pickAct(el.dataset.act, 'war'));
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
    if (liveNow.length) chips.push(`<button type="button" class="dk-need" data-go="war"${U().tipAttr(esc(liveNow.map(p => `${p.brand}: ${p.name}`).join(', ')))}><b>${liveNow.length}</b>${esc(label)} offers live now</button>`);
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
      if (tab === 'war') return war(first);
      if (tab === 'pulse') return pulse(first);
    },
    /* The season tab's name and when it shows, from anywhere (Agency settings > Clients uses it). */
    seasonCfg(host) { if (host && !H) H = host; else if (host) H = { ...H, ...host }; seasonCfg(); },
  };
})();
