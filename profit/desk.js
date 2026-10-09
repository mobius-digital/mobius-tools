/* THE DAILY DESK (2026-10-09, docs/handoffs/locus-structure-audit-step1.md, signed off by Cole).
 * Four screens in their own closure, drawn with the v2 building blocks (window.V2UI):
 *   Home > Yesterday   "was yesterday a bad day, for every brand, and why"   GET /api/hub/yesterday + account-health /api/market
 *   Ads > Today        the media buyer's list (ad set first)                 GET /api/hub/today + /api/brand/tests-overview
 *   Season > War room  the live board for the season (shell)                 GET /api/season (+ /api/season/live per live brand)
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
   * HOME > YESTERDAY
   * ======================================================================================= */
  let YSEL = null;
  async function yesterday(first) {
    css();
    const t = H.RUN(), title = H.S.act === 'all' ? 'Day check' : `Day check: ${esc((H.S.accounts.find(a => a.act_id === H.S.act) || {}).name || '')}`;
    if (first) $('#main').innerHTML = shell('yesterday', title, U().card('', '', '<p class="v2hint">Loading…</p>'));
    let d; try { d = await get(`/api/hub/yesterday?act=${encodeURIComponent(H.S.act)}`); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('yesterday', title, U().card('Could not load', '', `<p class="v2hint">${esc(e.message)}</p>`)); return; }
    if (t !== H.RUN()) return;
    const bs = (d.brands || []).filter(b => (b.cells || []).some(c => c.verdict !== 'none')), days = d.days || [], last = days[days.length - 1];
    if (!bs.length) { $('#main').innerHTML = shell('yesterday', title, U().card('Nothing to judge yet', '', '<p class="v2hint">No brand has eight weeks of store data yet.</p>')); return; }
    const bad = bs.filter(b => b.last && /bad/.test(b.last.verdict));
    const rank = { vbad: 0, bad: 1, good: 2, normal: 3, none: 4 };
    if (!YSEL || !bs.some(b => b.act_id === YSEL)) YSEL = bs.slice().sort((x, y) => rank[x.last?.verdict || 'none'] - rank[y.last?.verdict || 'none'])[0].act_id;
    const mk = d.market || {};
    const strip = `<div class="dk-strip"><b>${last ? `${wdl(last)} ${md(last)}` : ''}</b>
      <span>${bad.length ? `${bad.length} bad day${bad.length > 1 ? 's' : ''}: ${bad.map(b => esc(b.name)).join(', ')}.` : 'No bad days.'}</span>
      ${mk.meta_brands >= 3 ? `<span class="v2pill ${mk.verdict === 'market' ? 'warn' : ''}"${U().tipAttr('How many of our own brands saw Meta cost per 1,000 views rise 20% or more against their normal for that weekday. When half or more move together, it is the auction, not one account.')}>Meta ad costs up 20%+ at ${mk.cpm_up} of ${mk.meta_brands} brands${mk.verdict === 'market' ? ': looks like the market' : ''}</span>` : ''}
      <span id="dkMkPill"></span></div>`;
    const cols = `grid-template-columns:130px repeat(${days.length},minmax(20px,1fr)) minmax(140px,1.4fr)`;
    const grid = `<div class="v2tbl" style="overflow-x:auto"><div class="dk-grid" style="${cols}"><span></span>${days.map(x => `<span class="h">${wd(x).slice(0, 2)}<br>${md(x).split(' ')[1]}</span>`).join('')}<span class="h" style="text-align:left">${last ? md(last) : ''}</span>
      ${bs.map(b => `<span class="nm${b.act_id === YSEL ? ' on' : ''}" data-b="${esc(b.act_id)}">${esc(b.name)}</span>${(b.cells || []).map((c, i) => `<button type="button" class="dk-cell ${c.verdict}${b.act_id === YSEL && i === days.length - 1 ? ' sel' : ''}" data-b="${esc(b.act_id)}" data-i="${i}"${U().tipAttr(`${esc(b.name)}, ${wd(c.date)} ${md(c.date)}: ${VNAME[c.verdict] || c.verdict}`)} aria-label="${esc(b.name)} ${md(c.date)} ${VNAME[c.verdict] || ''}"></button>`).join('')}
        <span class="v2hint" style="margin:0">${b.last ? `${VNAME[b.last.verdict]}${(b.last.flags || []).filter(f => f.bad).length ? ': ' + esc(b.last.flags.filter(f => f.bad).map(f => f.label).join(', ')) : ''}` : ''}</span>`).join('')}
    </div></div>`;
    const g = bs.find(b => b.act_id === YSEL), y = g && g.last;
    const cur = g ? g.currency : 'USD';
    const fmt = { cpm: v => U().money2(v, cur), ctr: v => U().pct(v, 2), cvr: v => U().pct(v, 1), aov: v => U().money2(v, cur), sp: v => U().kmoney(v, cur) };
    const LN = { cpm: ['Auction', 'Meta cost per 1,000 views'], ctr: ['Creative', 'Click rate'], cvr: ['Site', 'Clicks that bought (Triple Whale)'], aov: ['Basket', 'Average order'], sp: ['Volume', 'Ad spend, every platform'] };
    const lk = y && (y.links || []).length ? `<div class="dk-links">${['cpm', 'ctr', 'cvr', 'aov', 'sp'].map(k => { const l = (y.links || []).find(z => z.k === k); if (!l) return ''; const big = l.change != null && Math.abs(l.change) >= 0.15;
        const cls = big && l.worse === true ? 'worse' : big && l.worse === false ? 'better' : '';
        return `<div class="dk-lk ${cls}"><span class="l">${LN[k][0]} · ${LN[k][1]}</span><span class="v">${l.value == null ? '–' : fmt[k](l.value)} ${l.change == null ? '' : `<span class="v2hint" style="margin:0;display:inline">${l.change >= 0 ? '+' : ''}${Math.round(l.change * 100)}% vs a normal ${wd(y.date)}${l.normal != null ? ` (${fmt[k](l.normal)})` : ''}</span>`}</span></div>`; }).join('')}</div>` : '<p class="v2hint">No Meta delivery that day.</p>';
    const ch = y && (y.changes || []).length ? `<div class="v2tbl"><table><tbody>${y.changes.map(a => `<tr><td class="faint" style="white-space:nowrap">${md(String(a.at).slice(0, 10))} ${String(a.at).slice(11, 16)}</td><td><span class="v2pill">${esc(String(a.category || '').replace(/_/g, ' '))}</span></td><td>${esc(a.summary || '')}</td><td class="faint">${a.reason ? esc(a.reason) : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="v2hint">No account changes in the three days before.</p>';
    const detail = y ? U().card(`${g.name}, ${wdl(y.date)} ${md(y.date)}: ${VNAME[y.verdict]}`, `Against the same weekday over the last 8 weeks.${y.attr_pending ? ' Triple Whale has not credited that day\'s ad orders yet, so the cost per purchase checks wait for it.' : ''}`,
      `${(y.flags || []).length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px">${y.flags.map(f => `<span class="v2pill ${f.bad ? 'bad' : 'good'}">${esc(f.label)} ${f.change >= 0 ? '+' : ''}${Math.round(f.change * 100)}%</span>`).join('')}</div>` : '<p class="v2say">Nothing was far enough from normal to call. What moved anyway is below.</p>'}
       <h4 style="margin:6px 0 8px">On Meta, which link moved</h4>${lk}
       <h4 style="margin:16px 0 8px">What changed on the account</h4>${ch}
       <p class="v2hint" style="margin-top:10px">${y.email_sent === true ? 'An email campaign sent that day.' : y.email_sent === false ? 'No email campaign sent that day.' : ''}</p>
       <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button type="button" class="v2btn ghost" data-go="act:${esc(g.act_id)}:today">Open this brand's Today list</button><button type="button" class="v2btn ghost" data-go="act:${esc(g.act_id)}:changes">Change Log</button></div>`) : '';
    const market = U().card('Is it us or the market?', 'Four checks, so a bad day on Meta itself is not read as a bad day for one brand.', `<div class="dk-mk" id="dkMk">
      <div><span class="l">Our own brands</span><b>${mk.meta_brands >= 3 ? `${mk.cpm_up} of ${mk.meta_brands} had Meta costs up 20%+` : 'Too few brands on Meta that day'}</b><span class="v2hint" style="margin:0">${mk.verdict === 'market' ? 'Moving together: looks like the auction.' : 'Not moving together.'}</span></div>
      <div><span class="l">Platform outages (Pulse)</span><b>Checking…</b></div><div><span class="l">Breezeway's Meta score</span><b>Checking…</b></div><div><span class="l">What advertisers said (X, Reddit)</span><b>Checking…</b></div></div>`);
    $('#main').innerHTML = shell('yesterday', title, `${strip}<div id="dkVerdict">${U().card('The verdict', '', '<p class="v2hint">Reading every signal for the day…</p>')}</div>${U().card('The last 14 days', 'Each square is one day against that brand\'s normal for the same weekday. Green good, red bad, solid red very bad. Click a brand to read its last day.', grid)}${detail}${market}
      ${U().foot('Money from Shopify through Triple Whale; ad costs per purchase on Triple Whale last platform click; delivery from Meta. A number is called when it is 25% or more off normal and unusual for that brand (1.5 standard deviations); very bad = two calls, or one far out. Ad spend alone never makes a bad day.')}`);
    const root = $('#main');
    root.querySelectorAll('[data-b]').forEach(el => el.onclick = () => { YSEL = el.dataset.b; yesterday(false); });
    root.querySelectorAll('[data-go]').forEach(el => el.onclick = () => { const [, id, tab] = el.dataset.go.split(':'); pickAct(id, tab); });
    if (last) fillMarket(last, t, bs, mk);
  }
  async function fillMarket(date, t, bs, mk) {
    let m = null; try { m = await H.apiAH(`/api/market?date=${date}`); } catch {}
    const host = document.getElementById('dkMk'); if (t !== H.RUN() || !host) return;
    const box = host.children;
    const pl = m?.pulse, bwR = m?.breezeway, bw = bwR ? { ...(bwR.entry || {}), hyb_status: bwR.status || bwR.entry?.hyb_status } : null, ch = m?.chatter;
    const inc = (pl?.incidents || []).filter(i => /meta|google|shopify|tiktok/i.test(i.platform || ''));
    box[1].innerHTML = `<span class="l">Platform outages (Pulse)</span><b>${!pl ? 'Could not check' : inc.length ? `${inc.length} on ${md(date)}` : 'None recorded'}</b><span class="v2hint" style="margin:0">${inc.slice(0, 3).map(i => esc(`${i.platform}: ${i.service || i.title || ''} ${i.note || ''}`.trim())).join('<br>')}</span>`;
    box[2].innerHTML = `<span class="l">Breezeway's Meta score</span><b>${!bw || !bw.hyb_status ? 'No reading for that day' : esc(String(bw.hyb_status || bw.status || '').toLowerCase().replace(/^\w/, c => c.toUpperCase()))}</b><span class="v2hint" style="margin:0"${U().tipAttr('Meta cost per purchase across about 50 of Breezeway\'s own customers, one score for the whole panel. A public file, unofficial: a hint, never the verdict.')}>${bw ? `About ${bw.n_biz || 50} brands, not ours. ${bw.incident_description ? esc(bw.incident_description) : ''}` : ''}</span>`;
    box[3].innerHTML = `<span class="l">What advertisers said (X, Reddit)</span><b>${!ch ? 'Not checked' : ch.error ? 'Search failed' : (ch.meta === 'issues' || ch.google === 'issues') ? 'People reported problems' : 'Nothing unusual'}</b><span class="v2hint" style="margin:0">${ch && ch.summary ? esc(ch.summary) : ''}${ch && (ch.sources || []).length ? '<br>' + ch.sources.slice(0, 3).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc((s.title || s.url).slice(0, 60))}</a>`).join('<br>') : ''}</span>`;
    const pill = document.getElementById('dkMkPill');
    if (pill && (inc.length || /BAD/.test(bw?.hyb_status || '') || ch?.meta === 'issues')) pill.innerHTML = `<span class="v2pill warn">Outside signs of a rough day on Meta</span>`;
    /* THE VERDICT: every signal above, read together into one call (account-health /api/daycheck, cached per day). */
    const facts = {
      brands: (bs || []).map(b => ({ name: b.name, verdict: b.last?.verdict, moved: (b.last?.flags || []).map(f => `${f.label} ${f.change >= 0 ? '+' : ''}${Math.round(f.change * 100)}%${f.bad ? ' (bad)' : ''}`),
        meta_links: (b.last?.links || []).filter(l => l.change != null && Math.abs(l.change) >= 0.15).map(l => `${l.label} ${l.change >= 0 ? '+' : ''}${Math.round(l.change * 100)}%`), changes: (b.last?.changes || []).slice(0, 3).map(c => c.summary), attribution_pending: !!b.last?.attr_pending })),
      our_brands: mk ? { on_meta: mk.meta_brands, meta_costs_up_20pct: mk.cpm_up, click_rate_down: mk.ctr_down, conversion_down: mk.cvr_down } : null,
      breezeway: bw && bw.hyb_status ? { status: bw.hyb_status, outside_brands: bw.n_biz || null, incident: bw.incident_description || null } : null,
      outages: inc.map(i => `${i.platform}: ${i.service || i.title || ''} ${i.state || i.note || ''}`.trim()),
      advertisers_online: ch && ch.summary ? { meta: ch.meta, google: ch.google, said: ch.summary } : null,
    };
    let v = null; try { v = await H.apiAH('/api/daycheck', { method: 'POST', body: JSON.stringify({ date, facts }) }); } catch (e) { v = { error: e.message }; }
    const vh = document.getElementById('dkVerdict'); if (t !== H.RUN() || !vh) return;
    vh.innerHTML = v && v.headline ? U().card('The verdict', 'Every signal on this page read together: each brand against its own normal, our brands side by side, Breezeway, outages and what advertisers said online.',
      `<p class="v2say lead" style="margin:0 0 8px"><b>${esc(v.headline)}</b></p>${v.why ? `<p class="v2say" style="margin:0 0 6px">${esc(v.why)}</p>` : ''}${v.todo ? `<p class="v2say" style="margin:0 0 6px"><b>Today:</b> ${esc(v.todo)}</p>` : ''}${v.client_line ? `<p class="v2hint" style="margin:8px 0 0"${U().tipAttr('Safe to repeat to a client: it talks about the platform and their own result, never about other brands.')}><b>If a client asks:</b> ${esc(v.client_line)}</p>` : ''}`)
      : U().card('The verdict', '', `<p class="v2hint">${esc((v && v.error) || 'No verdict yet.')}</p>`);
  }

  /* =========================================================================================
   * ADS > TODAY
   * ======================================================================================= */
  let KIND = 'all';
  const OPEN = {};
  async function today(first) {
    css();
    const t = H.RUN(), one = H.S.act !== 'all' ? H.S.accounts.find(a => a.act_id === H.S.act) : null;
    const title = one ? `Today: ${esc(one.name)}` : 'Today';
    if (first) $('#main').innerHTML = shell('today', title, U().card('', '', '<p class="v2hint">Loading…</p>'));
    let d, tests = null, yd = null;
    try { [d, tests, yd] = await Promise.all([get(`/api/hub/today?act=${encodeURIComponent(H.S.act)}`), get('/api/brand/tests-overview').catch(() => null), get(`/api/hub/yesterday?act=${encodeURIComponent(H.S.act)}`).catch(() => null)]); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('today', title, U().card('Could not load', '', `<p class="v2hint">${esc(e.message)}</p>`)); return; }
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
    const yv = id => { const b = (yd?.brands || []).find(x => x.act_id === id); return b && b.last ? `<span class="dk-dot ${b.last.verdict}"></span> <span class="v2hint" style="margin:0;display:inline">yesterday ${(VNAME[b.last.verdict] || '').toLowerCase()}</span>` : ''; };
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
    const sub = win ? `Ad set first, ranked by money at stake. Judged on Triple Whale last platform click, ${md(win.from)} to ${md(win.to)}, with each brand's Ads rules.` : '';
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
   * SEASON > WAR ROOM (shell)
   * ======================================================================================= */
  async function war(first) {
    css();
    const t = H.RUN(), label = (window.SEASON_TAB && window.SEASON_TAB().label) || 'Black Friday';
    const title = `${esc(label)}: war room`;
    if (first) $('#main').innerHTML = shell('war', title, U().card('', '', '<p class="v2hint">Loading…</p>'));
    let d; try { d = await H.api(`/api/season?act=${encodeURIComponent(H.S.act)}`); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('war', title, U().card('Could not load the season', '', `<p class="v2hint">${esc(e.message)}</p>`)); return; }
    if (t !== H.RUN()) return;
    const td = d.today || ymdL(new Date());
    const accts = (d.accounts || []).filter(a => (a.phases || []).some(p => p.status !== 'skip'));
    const live = a => (a.phases || []).filter(p => p.status !== 'skip' && p.start && p.start <= td && (p.end || p.start) >= td);
    const next = a => (a.phases || []).filter(p => p.status !== 'skip' && p.start && p.start > td).sort((x, y) => x.start.localeCompare(y.start))[0];
    const lit = accts.some(a => live(a).length) || td >= `${td.slice(0, 4)}-11-17` && td <= `${td.slice(0, 4)}-12-02`;
    const rows = accts.map(a => { const L = live(a), N = next(a);
      return `<tr data-act="${esc(a.act_id)}"><td><b>${esc(a.name)}</b></td>
        <td>${L.length ? L.map(p => `<span class="v2pill good">${esc(p.name)}</span> <span class="faint">${esc((p.offer || '').slice(0, 90))}</span>`).join('<br>') : '<span class="faint">No phase live</span>'}</td>
        <td>${N ? `${esc(N.name)} <span class="faint">${md(N.start)}${N.offer ? `: ${esc(N.offer.slice(0, 60))}` : ''}</span>` : '<span class="faint">Nothing scheduled</span>'}</td>
        <td class="dk-live" data-live="${esc(a.act_id)}">${L.length ? '<span class="faint">…</span>' : '<span class="faint">From the first live phase</span>'}</td>
        <td><button type="button" class="v2link" data-go="act:${esc(a.act_id)}:season">The plan</button></td></tr>`; }).join('');
    $('#main').innerHTML = shell('war', title, `
      <div class="dk-strip"><b>${lit ? 'Live' : 'Getting ready'}</b><span>${lit ? 'Sales today against the plan, the offer running now, and what changes next, for every brand in the season.' : `Lights up from list week (Nov 17) to Dec 2. Until then it shows what is coming per brand; the plan itself is on <b>The plan</b>.`}</span>
        <button type="button" class="v2btn ghost" id="dkSeasonCfg" style="margin-left:auto">Name and when it shows</button></div>
      ${U().card('Every brand in the season', 'One row per brand. Today so far is live from Triple Whale for brands with a phase running.', accts.length ? `<div class="v2tbl"><table><thead><tr><th>Brand</th><th>Running now</th><th>Next change</th><th>Today so far</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="v2hint">No brand has a season plan yet. Start one on The plan.</p>')}
      ${U().card('Coming to this room', '', `<ul class="v2list" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px">
        <li>Sales by the hour against the day's goal, and profit by the hour.</li><li>Last 3 hours' MER against each brand's ladder: scale, hold or pull back (today's Desk).</li>
        <li>Stock that runs out before Cyber Monday (Products).</li><li>Email and SMS sends today and what they made.</li><li>Ad spend pace per platform, platform outages, and a Do next list like Ads &gt; Today.</li></ul>`)}`);
    const root = $('#main');
    root.querySelectorAll('[data-go]').forEach(el => el.onclick = () => { const [, id, tab] = el.dataset.go.split(':'); pickAct(id, tab); });
    root.querySelector('#dkSeasonCfg').onclick = seasonCfg;
    for (const a of accts.filter(a => live(a).length)) {
      H.api(`/api/season/live?act=${encodeURIComponent(a.act_id)}`).then(r => { const c = root.querySelector(`[data-live="${CSS.escape(a.act_id)}"]`); if (!c || t !== H.RUN()) return;
        c.innerHTML = `${U().money(r.today?.sales, a.currency)} sales · MER ${U().x2(r.today?.mer)}<br><span class="faint">last 3 hours MER ${U().x2(r.last3?.mer)}</span>`; })
        .catch(e => { const c = root.querySelector(`[data-live="${CSS.escape(a.act_id)}"]`); if (c) c.innerHTML = `<span class="faint">${esc(e.message)}</span>`; });
    }
  }
  function seasonCfg() {
    const cur = (window.SEASON_TAB && window.SEASON_TAB()) || { label: 'Black Friday', mode: 'auto' };
    const opt = (v, l, s) => `<label class="opt"><input type="radio" name="dkMode" value="${v}"${cur.mode === v ? ' checked' : ''}><span>${l}<small>${s}</small></span></label>`;
    const pb = U().panel('The season tab', `<div class="dk-form">
      <label>Name in the menu<input type="text" id="dkSLabel" maxlength="40" value="${esc(cur.label || 'Black Friday')}" placeholder="Black Friday"></label>
      <p class="v2hint" style="margin:0">Rename it as the season moves: BFCM war room, then Q5 war room after Cyber Monday.</p>
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
   * TOOLS > PLATFORM STATUS (Pulse)
   * ======================================================================================= */
  async function pulse(first) {
    css();
    const t = H.RUN();
    if (first) $('#main').innerHTML = shell('pulse', 'Platform status', U().card('', '', '<p class="v2hint">Loading…</p>'));
    let d; try { const r = await fetch(PULSE, { cache: 'no-store' }); d = await r.json(); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('pulse', 'Platform status', U().card('Pulse did not answer', '', `<p class="v2hint">${esc(e.message)}</p>`)); return; }
    if (t !== H.RUN()) return;
    const pill = s => s === 'operational' ? '<span class="v2pill good">Working</span>' : s === 'degraded' || s === 'partial' ? '<span class="v2pill warn">Degraded</span>' : s ? `<span class="v2pill bad">${esc(s)}</span>` : '<span class="v2pill">No feed</span>';
    const plats = (d.platforms || []).map(p => { const st = p.state || null, bad = st ? Object.values(st.services || {}).filter(x => x.state !== 'operational') : [];
      return `<div><span style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${esc(p.name)}</b>${pill(st ? st.worst : null)}</span>
        <span class="v2hint" style="margin:0">${st ? (bad.length ? bad.slice(0, 3).map(x => esc(`${x.name}: ${x.note || x.state}`)).join('<br>') : 'No known issues') : 'No public feed: check its status page.'}</span>
        ${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener" class="v2hint" style="margin:0">Status page</a>` : ''}</div>`; }).join('');
    const inc = (d.incidents || []).slice(0, 20).map(i => `<tr><td class="faint" style="white-space:nowrap">${new Date(i.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })}</td><td><b>${esc(i.platform)}</b></td><td>${esc(i.service || '')}</td><td>${i.kind === 'resolved' ? '<span class="v2pill good">Fixed</span>' : '<span class="v2pill warn">Started</span>'} <span class="faint">${esc(i.note || '')}</span></td></tr>`).join('');
    $('#main').innerHTML = shell('pulse', 'Platform status', `<p class="v2say lead">Is Meta, Google or Shopify having a problem right now? Checked every 5 minutes by Pulse${d.lastRun ? `, last at ${new Date(d.lastRun).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })} Central` : ''}. An outage also shows on Home &gt; Yesterday.</p>
      ${U().card('Right now', '', `<div class="dk-pl">${plats}</div>`)}
      ${U().card('Recent changes', 'Times in Central.', inc ? `<div class="v2tbl"><table><tbody>${inc}</tbody></table></div>` : '<p class="v2hint">Nothing recorded.</p>')}
      ${U().foot('Pulse reads the public status feeds of Meta, Google Ads, Shopify, Pinterest, OpenAI and Anthropic. TikTok, Microsoft, LinkedIn, Snap, X, Amazon and Apple publish no machine feed, so they show their status page link. Slack alerts and client fan-out stay on the Pulse page.')}`);
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
