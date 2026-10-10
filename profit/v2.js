/* Locus v2 screens (2026-10-07). Own closure, like meta.js; the host (index.html) owns sign-in,
 * the brand picker, the period and compare control and the attribution model, and calls
 * window.V2.render(tab, host) with its helpers. Spec: docs/locus-hub/spec-v2.md. Data:
 * profit/worker/src/hub.js (/api/hub/*) plus the host's /api/overview snapshot (S.accounts).
 *
 * Visual rules (spec Part D): graphite neutrals from tokens, one accent for chrome and the
 * current series, semantic colours with a sign, a fixed channel palette, Inter with tabular
 * numbers, one tile component (label, source chip, value, delta, sparkline, goal bullet),
 * charts with the compare period ghosted and one shared tooltip, bars beside numbers. */
(() => {
  let H = null;                                  // host helpers, set per render
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const CH = { meta: '--c-meta', google: '--c-google', tiktok: '--c-tiktok', email: '--c-email', amazon: '--c-amazon', rest: '--c-else', pinterest: '--c-amazon' };
  const SEQ = ['--c-meta', '--c-google', '--c-tiktok', '--c-email', '--c-amazon', '--c-else'];
  /* Brand-first phase 3: a.act_id is the BRAND id; a.meta_act is its main Meta ad account, null = none
     connected (a list without the field counts as connected). Meta-only screens show this instead of erroring. */
  const noMeta = a => !!a && 'meta_act' in a && !a.meta_act;
  const noMetaCard = a => `<div class="v2card"><p class="v2hint">No Meta ad account connected for ${esc(a.name)}. Connect it in Brand settings &gt; Integrations.</p></div>`;

  /* ---------- formatting ---------- */
  const sym = c => (!c || c === 'USD' ? '$' : c === 'GBP' ? '£' : c === 'EUR' ? '€' : c === 'CAD' ? 'CA$' : c === 'AUD' ? 'A$' : c + ' ');
  const money = (n, c, dp) => n == null || !isFinite(n) ? '–' : sym(c) + Math.round(n).toLocaleString('en-US', dp ? { minimumFractionDigits: dp, maximumFractionDigits: dp } : {});
  const money2 = (n, c) => n == null || !isFinite(n) ? '–' : sym(c) + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const kmoney = (n, c) => n == null || !isFinite(n) ? '–' : Math.abs(n) >= 1e6 ? sym(c) + (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e4 ? sym(c) + (n / 1e3).toFixed(1) + 'K' : money(n, c);
  const int = n => n == null || !isFinite(n) ? '–' : Math.round(n).toLocaleString('en-US');
  const pct = (n, d = 1) => n == null || !isFinite(n) ? '–' : (n * 100).toFixed(d) + '%';
  const x2 = n => n == null || !isFinite(n) ? '–' : n.toFixed(2) + 'x';
  const day = s => { const d = new Date(s + 'T12:00:00'); return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`; };

  /** Delta chip: arrow, signed percent, coloured by what is good for the store (lower = good for costs). */
  function delta(cur, prev, lower, pts) {
    if (cur == null || prev == null || !isFinite(cur) || !isFinite(prev) || (!pts && !prev) || H.S.cmp === 'none') return '';
    const d = pts ? (cur - prev) * 100 : cur / prev - 1;
    if (!isFinite(d)) return '';
    const small = pts ? Math.abs(d) < 0.15 : Math.abs(d) < 0.015;
    const good = (d > 0) !== !!lower;
    const tone = small || lower === 'n' ? 'flat' : good ? 'up' : 'down';
    const txt = pts ? `${Math.abs(d).toFixed(1)} pt` : `${Math.abs(Math.round(d * 100))}%`;
    return `<span class="v2d ${tone}" data-v2tip="${esc(`Against ${cmpLabel()}${pts ? '' : `: ${prev >= 100 ? Math.round(prev).toLocaleString('en-US') : (+prev).toFixed(2)} then`}`)}">${d >= 0 ? '▲' : '▼'} ${txt}</span>`;
  }
  const cmpLabel = () => ({ prev: 'the period before', yoy: 'the same dates last year', none: 'nothing' })[H.S.cmp] || 'the period before';
  const MODEL_SHORT = { lastPlatformClick: 'TW last platform click', fullFirstClick: 'TW first click', fullLastClick: 'TW last click', linear: 'TW linear (paid)', linearAll: 'TW linear (all)', platform: 'Platform reported' };
  const MODEL2 = { get: () => { try { return localStorage.getItem('pf_model2'); } catch { return null; } }, set: v => { try { localStorage.setItem('pf_model2', v); } catch {} } };
  const modelQ = () => `&model=${encodeURIComponent(H.S.model || 'lastPlatformClick')}`;
  const isPlat = () => H.S.model === 'platform';
  /* GET cache for /api/hub/* (2026-10-08, "switching tabs takes a long time"). Overview and
     Campaigns read the same route, so the second is instant; entries live 5 minutes and a
     failed call is never kept. prefetch() warms the next likely screen after a paint. */
  const CACHE = new Map();
  function get(path) {
    const hit = CACHE.get(path);
    if (hit && Date.now() - hit.at < 5 * 60e3) return hit.p;
    const p = H.api(path); CACHE.set(path, { at: Date.now(), p });
    p.catch(() => CACHE.delete(path));
    return p;
  }
  const prefetch = paths => setTimeout(() => paths.forEach(x => get(x).catch(() => {})), 400);

  /* ---------- one tooltip for every hover ----------
     Any element with data-tip shows it; a sparkline with data-spk shows the point under the
     pointer. One fixed element, one listener, so nothing has to wire its own hover. */
  const tipEl = () => document.getElementById('v2gtip') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'v2gtip' }));
  /* The text is only rewritten when it changes, and the box only measured then: a pointermove over the same tip
     used to rebuild and re-measure it on every move (part of "it's super laggy" on the ads gallery). */
  let TIP_H = null, TIP_W = 0, TIP_HT = 0;
  function tipAt(e, html) { const t = tipEl(); if (html !== TIP_H || t.style.display !== 'block') { t.innerHTML = html; t.style.display = 'block'; TIP_H = html; TIP_W = t.offsetWidth; TIP_HT = t.offsetHeight; } const w = TIP_W, h = TIP_HT; let x = e.clientX + 14, y = e.clientY + 16; if (x + w > innerWidth - 8) x = e.clientX - w - 14; if (y + h > innerHeight - 8) y = e.clientY - h - 12; t.style.left = x + 'px'; t.style.top = y + 'px'; }
  const tipOff = () => { const t = document.getElementById('v2gtip'); if (t) t.style.display = 'none'; spkOff(); };
  /* The sparkline marker: one fixed vertical line + dot laid over whichever sparkline is under the pointer, at the
     point being read. HTML, not SVG, because sparklines stretch (preserveAspectRatio none) and a circle would too. */
  const spkEls = () => [document.getElementById('v2spkx') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'v2spkx' })),
    document.getElementById('v2spkd') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'v2spkd' }))];
  function spkMark(svg, r, i, n) {
    const pl = [...svg.querySelectorAll('polyline')].pop(); if (!pl) return;
    const vb = svg.viewBox.baseVal; const pts = pl.getAttribute('points').trim().split(/\s+/).map(p => p.split(',').map(Number));
    const want = vb.x + (n > 1 ? i / (n - 1) : 0) * vb.width; let best = pts[0];
    for (const p of pts) if (Math.abs(p[0] - want) < Math.abs(best[0] - want)) best = p;
    const x = r.left + (best[0] - vb.x) / vb.width * r.width, y = r.top + (best[1] - vb.y) / vb.height * r.height;
    const [ln, dot] = spkEls();
    ln.style.cssText = `display:block;left:${x}px;top:${r.top}px;height:${r.height}px`;
    dot.style.cssText = `display:block;left:${x}px;top:${y}px`;
  }
  function spkOff() { const a = document.getElementById('v2spkx'), b = document.getElementById('v2spkd'); if (a) a.style.display = 'none'; if (b) b.style.display = 'none'; }
  if (!window.__v2tips) { window.__v2tips = 1;
    document.addEventListener('pointermove', e => {
      const sp = e.target.closest && e.target.closest('[data-spk]');
      if (sp) { try { const list = JSON.parse(sp.dataset.spk); const r = sp.getBoundingClientRect(); const i = Math.max(0, Math.min(list.length - 1, Math.round((e.clientX - r.left) / r.width * (list.length - 1)))); tipAt(e, list[i]); spkMark(sp, r, i, list.length); } catch {} return; }
      spkOff();
      const el = e.target.closest && e.target.closest('[data-v2tip]');
      if (el) tipAt(e, el.dataset.v2tip); else tipOff();
    }, { passive: true });
    document.addEventListener('scroll', tipOff, { passive: true, capture: true });
  }
  const tipAttr = html => ` data-v2tip="${esc(html)}"`;
  /* EVERY TILE OPENS (2026-10-08, Cole: "I'm able to click on the cards I'm supposed to"). A tile that links to a
     page keeps its data-go; any other tile opens a side panel: the number, its change, the day-by-day line drawn
     large (same hover marker), and what the number means from the Metrics glossary. Nothing per screen to wire. */
  /* THE DATA BEHIND THE NUMBER (2026-10-09, Cole: "what Triple Whale does"). On Home, Ads, Store, Email and P&L a
     headline tile opens a drill-down instead: the number large with its delta, the day line, then a BREAKDOWN for that
     metric (spend by platform, revenue by channel, new against returning, top products, CM as a waterfall down to net
     profit, email campaigns against flows), and one "What it is" line at the bottom. Data: /api/hub/drill (hub.js
     drillMany), one call for every metric, cached in the page. A tile that linked to a page now opens its drill-down and
     offers the page at the bottom. Other tiles (and other pages) keep the simple panel. Capture phase, so a tile's own
     data-go click never fires first. */
  if (!window.__v2tiledrill) { window.__v2tiledrill = 1;
    document.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('.v2tile'); if (!t || !H || t.closest('.v2sk,#v2panel') || e.target.closest('a,button,input,select')) return;
      const label = (t.querySelector('.l span') || t.querySelector('.l') || t).childNodes[0]?.textContent?.trim() || 'This number';
      const m = DRILL_TABS.has(H.S.tab) ? METRIC_OF[label.toLowerCase()] || null : null;
      if (!m && t.dataset.go) return;
      e.stopPropagation(); e.preventDefault();
      openDrill(t, label, m);
    }, true);
  }
  const DRILL_TABS = new Set(['overview', 'profit', 'store', 'channels', 'meta', 'campaigns', 'google', 'tiktok', 'email']);
  const METRIC_OF = { revenue: 'revenue', 'returning revenue': 'revenue', orders: 'orders', 'average order': 'aov', 'ad spend': 'spend', spend: 'spend', mer: 'mer', amer: 'amer', roas: 'roas',
    'new customers': 'newcust', 'first orders': 'newcust', 'cost per new customer': 'cac', 'contribution margin': 'cm', 'net profit': 'net', 'email and sms': 'email', 'email and sms revenue': 'email',
    campaigns: 'email', flows: 'email', purchases: 'purchases', 'paid purchases': 'purchases', 'cost per purchase': 'cpa' };
  const PLAT_OF = { meta: 'meta', campaigns: 'meta', google: 'google', tiktok: 'tiktok' };
  /* One sentence each: what the number IS. The long glossary stays under Metrics in the top bar. */
  const WHAT = {
    revenue: 'Everything the store sold from every source, paid, organic, email and direct: Shopify total sales minus sales tax.',
    spend: 'Every ad platform’s spend added together, as Triple Whale carries it, plus custom expenses marked “counts as ad spend” on Costs. Spend is a choice, so it has no good or bad colour.',
    mer: 'Revenue divided by all ad spend: how much the whole store took for every advertising dollar.',
    amer: 'Revenue from first-time buyers divided by all ad spend: what the ads brought in new, so repeat buyers and email cannot flatter it.',
    roas: 'Revenue credited to the ads divided by their spend, under the attribution model picked in the top bar.',
    orders: 'Paid orders from every channel, and the average order: revenue divided by orders.',
    aov: 'Revenue divided by paid orders, store-wide.',
    newcust: 'Paid orders from people buying for the first time.',
    cac: 'All ad spend divided by first orders: what one new customer cost.',
    cm: 'What is left after every variable cost (product, delivery, handling, payment fees and ad spend). Fixed costs like rent and salaries are not in it.',
    net: 'Contribution margin minus the custom expenses on Costs: monthly ones spread over each month’s days, one-time ones on their date, % and per-order ones from each day’s numbers.',
    email: 'Orders Klaviyo credits to an email or text, split into one-off campaigns and automated flows.',
    purchases: 'Orders the ad platforms are credited with under the attribution model in the top bar. Two platforms can claim one order.',
    cpa: 'Paid spend divided by the purchases credited to it.',
  };
  const PAGE_NAME = { store: 'Sales', channels: 'All channels', customers: 'Customers', profit: 'P&L', email: 'Email and SMS', meta: 'Meta', google: 'Google' };
  if (!document.getElementById('v2dcss')) document.head.appendChild(Object.assign(document.createElement('style'), { id: 'v2dcss', textContent: `
    .v2drill .v2dsec{margin-top:6px}
    .v2drill .v2dtbl{width:100%;border-collapse:collapse;font-size:12.5px}
    .v2drill .v2dtbl th{text-align:right;font-weight:500;color:var(--muted);font-size:11px;padding:4px 6px;border-bottom:1px solid var(--line)}
    .v2drill .v2dtbl th:first-child,.v2drill .v2dtbl td:first-child{text-align:left}
    .v2drill .v2dtbl td{text-align:right;padding:6px;border-bottom:1px solid var(--line);white-space:nowrap;color:var(--ink)}
    .v2drill .v2dtbl td:first-child{white-space:normal}
    .v2drill .v2dtbl tr.me td{font-weight:650}
    .v2drill .v2dtbl tr.tot td{font-weight:650;border-top:1px solid var(--line-strong,var(--line))}
    .v2drill .v2dtbl td .v2ib{min-width:120px}
    .v2drill .sw{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;vertical-align:0}
    .v2drill .pnl-fall .r{grid-template-columns:minmax(110px,1fr) minmax(48px,.7fr) 158px;gap:10px}
    .v2drill .pnl-fall .n em .v2d{margin-left:4px}
    .v2drill .pnl-fall .r.sub .l{padding-left:14px;font-size:12px}
    .v2drill .pnl-fall .r.sub .n{font-weight:500;font-size:12px}
    .v2drill .pnl-fall .r.sub{padding:2px 0}
    .v2drill .v2what{margin-top:10px;padding-top:12px;border-top:1px solid var(--line);font-size:13px;color:var(--ink-2)}
    .v2drill .v2dgo{margin-top:4px}
    .v2drill .v2dnote{font-size:12px;color:var(--muted);margin:6px 0 0}` }));
  const glossOne = label => { const L = label.toLowerCase(), GL = window.GLOSSARY || []; const g = GL.find(x => x.k.toLowerCase() === L) || GL.find(x => x.k.toLowerCase().includes(L)); return g ? g.one : ''; };
  /** Sum many brands' drill payloads into one (one currency only). Day rows are merged by date. */
  function drillSum(bs) {
    const add = (list, keys) => { if (!list.some(Boolean)) return null; const o = {}; for (const k of keys) { let s = 0, any = false; for (const x of list) if (x && x[k] != null && isFinite(x[k])) { s += +x[k]; any = true; } o[k] = any ? s : null; } return o; };
    const HK = ['sales', 'spend', 'orders', 'new_orders', 'new_rev', 'ret_rev', 'email_rev', 'campaigns', 'flows', 'ad_expense'];
    const derive = o => o && Object.assign(o, { aov: o.orders ? o.sales / o.orders : null, new_aov: o.new_orders ? (o.new_rev || 0) / o.new_orders : null, cac: o.new_orders ? o.spend / o.new_orders : null, mer: o.spend ? o.sales / o.spend : null, amer: o.spend && o.new_rev != null ? o.new_rev / o.spend : null });
    const ch = {}; for (const b of bs) for (const r of b.channels || []) { const o = ch[r.id] ||= { id: r.id, label: r.label, spend: null, prev_spend: null, revenue: null, prev_revenue: null, purchases: null, nc: 0 }; for (const k of ['spend', 'prev_spend', 'revenue', 'prev_revenue', 'purchases']) if (r[k] != null) o[k] = (o[k] || 0) + r[k]; o.nc += r.nc || 0; }
    const PK = ['sales', 'net_sales', 'ship_rev', 'tax', 'cogs', 'ship_cost', 'handling', 'fees', 'gross_profit', 'spend', 'ad_expense', 'cm', 'fixed', 'net'];
    const costed = bs.filter(b => b.profit && b.cost_verdict !== 'broken');
    const profit = bs.some(b => b.profit) ? { cur: add(costed.map(b => b.profit.cur), PK), prev: add(costed.map(b => b.profit.prev), PK),
      fixed_items: bs.length === 1 ? (bs[0].profit?.fixed_items || []) : costed.filter(b => b.profit.cur?.fixed).map(b => ({ name: b.name, amount: b.profit.cur.fixed })),
      ad_items: bs.length === 1 ? (bs[0].profit?.ad_items || []) : costed.filter(b => b.profit.cur?.ad_expense).map(b => ({ name: b.name, amount: b.profit.cur.ad_expense })),
      series: mergeDays(costed.map(b => b.profit.series), ['cm', 'fixed']), prev_series: mergeDays(costed.map(b => b.profit.prev_series), ['cm']),
      left_out: bs.filter(b => b.profit && b.cost_verdict === 'broken').map(b => b.name), margin_pct: bs.length === 1 ? bs[0].margin_pct : null } : null;
    return { cur: derive(add(bs.map(b => b.cur), HK)), prev: derive(add(bs.map(b => b.prev), HK)), channels: Object.values(ch),
      series: mergeDays(bs.map(b => b.series), ['sales', 'spend', 'orders', 'new_orders', 'new_rev', 'email_rev', 'campaigns', 'flows', 'meta', 'google', 'tiktok']),
      prev_series: mergeDays(bs.map(b => b.prev_series), ['sales', 'spend', 'orders', 'new_orders', 'new_rev', 'email_rev', 'campaigns', 'flows']),
      products: bs.length === 1 ? bs[0].products || [] : [], profit,
      ad_items: bs.length === 1 ? bs[0].ad_items || [] : bs.filter(b => b.cur?.ad_expense).map(b => ({ name: b.name, amount: b.cur.ad_expense })) };
  }
  async function openDrill(t, label, m) {
    const v = t.querySelector('.v'), sub = t.querySelector('.sub'), bul = t.querySelector('.v2bul'), go = t.dataset.go;
    const sp = t.querySelector('svg.v2spark,svg[data-spk]');
    const big = sp ? sp.outerHTML.replace('class="v2spark"', 'class="v2spark v2spark-big"') : '';
    const what = WHAT[m] || glossOne(label);
    const plat = PLAT_OF[H.S.tab] || null;
    const goBtn = go && !go.startsWith('act:') && go !== H.S.tab ? `<button type="button" class="v2link v2dgo" data-dgo="${esc(go)}">Open ${esc(PAGE_NAME[go] || 'its page')} ›</button>` : '';
    const head = `<div class="dv">${v ? v.innerHTML : ''}</div>${sub ? `<p class="v2hint">${sub.innerHTML}</p>` : ''}${bul ? bul.outerHTML : ''}`;
    const tail = `${goBtn}${what ? `<p class="v2what"><b>What it is.</b> ${what}</p>` : ''}`;
    const wireTail = body => { body.querySelectorAll('[data-dgo]').forEach(b => b.onclick = () => { document.querySelector('#v2panel .pclose')?.click(); H.show(b.dataset.dgo); });
      body.querySelectorAll('[data-dfix]').forEach(b => b.onclick = () => { document.querySelector('#v2panel .pclose')?.click(); if (window.openFixedCosts) window.openFixedCosts(H.S.act); }); };
    const simple = (extra = '') => { const body = panel(label, `<div class="v2drill">${head}${big ? `<h4>Day by day</h4>${big}` : ''}${extra}${tail}</div>`); wireTail(body); return body; };
    if (!m) return simple();
    const body = panel(label, `<div class="v2drill">${head}${skCard(4, true)}${tail}</div>`); wireTail(body);
    let d;
    try { d = await get(`/api/hub/drill?act=${encodeURIComponent(H.S.act)}&${H.rangeQ()}${modelQ()}`); }
    catch (err) { body.querySelector('.v2drill').innerHTML = `${head}<p class="v2bad">${esc(err.message)}</p>${tail}`; wireTail(body); return; }
    if (document.querySelector('#v2panel .ph b')?.textContent !== label) return;
    const bs = (d.brands || []).filter(b => b.cur || b.channels?.length);
    const curs = [...new Set(bs.map(b => b.currency || 'USD'))];
    if (!bs.length || curs.length > 1) { const el = simple(`<p class="v2dnote">${curs.length > 1 ? 'These brands report in different currencies, so there is no combined breakdown. Pick one brand.' : 'No stored days in this window yet. Today is live on the tile; its breakdown lands overnight.'}</p>`); return el; }
    const D = drillSum(bs), cur = curs[0];
    const html = drillBody(m, D, cur, plat, label, big);
    body.querySelector('.v2drill').innerHTML = `${head}${html}${tail}`; wireTail(body);
    const ch = body.querySelector('[data-dchart]'); if (ch) { const k = ch.dataset.dchart; const rows = DRILL_ROWS[k]; if (rows) (rows.stack ? wireStack('v2dchart', rows.rows, rows.stack, cur) : wireLine('v2dchart', rows.rows, { tip: rows.tip })); }
  }
  const DRILL_ROWS = {};
  /** The chart and the breakdown for one metric. */
  function drillBody(m, D, cur, plat, label, big) {
    const c = D.cur || {}, p = D.prev || {}, km = v => kmoney(v, cur), mo = v => money(v, cur), cmpOn = H.S.cmp !== 'none';
    const rr = (a, b) => (b ? a / b : null);
    /* the day line, from the drill data (blended screens) or the tile's own line (one platform) */
    const KEY = { revenue: [r => r.sales, km], spend: [r => r.spend, km], mer: [r => rr(r.sales, r.spend), x2], amer: [r => rr(r.new_rev, r.spend), x2], orders: [r => r.orders, int], aov: [r => rr(r.sales, r.orders), v => money2(v, cur)],
      newcust: [r => r.new_orders, int], cac: [r => rr(r.spend, r.new_orders), mo],
      email: [/^campaigns$/i.test(label) ? r => r.campaigns : /^flows$/i.test(label) ? r => r.flows : r => r.email_rev, km] };
    let chart = '';
    const mkLine = (rows, prev, f, fmt) => { const R = rows.map(r => ({ date: r.date, v: f(r) })), P = cmpOn ? prev.map(r => ({ date: r.date, v: f(r) })) : [];
      DRILL_ROWS.line = { rows: R, tip: (r, i) => `<b>${day(r.date)}</b> · ${esc(label)} ${r.v == null ? '–' : fmt(r.v)}${P[i] ? `<br><span class="faint">${esc(cmpLabel())}: ${P[i].v == null ? '–' : fmt(P[i].v)}</span>` : ''}` };
      return `<h4>Day by day</h4>${legend([{ color: '--brand', label: 'This period' }, ...(P.length > 1 ? [{ dash: true, label: cmpLabel() }] : [])])}<div data-dchart="line">${lineChart('v2dchart', R, { key: 'v', prev: P, cur, fmt, h: 190 })}</div>`; };
    const platMode = plat && ['spend', 'revenue', 'roas', 'purchases', 'cpa'].includes(m);
    if (platMode) chart = big ? `<h4>Day by day</h4>${big}` : '';
    else if (m === 'spend' && D.series.some(r => r.meta || r.google || r.tiktok)) {
      const ser = [{ key: 'meta', label: 'Meta', color: '--c-meta' }, { key: 'google', label: 'Google', color: '--c-google' }, { key: 'tiktok', label: 'TikTok', color: '--c-tiktok' }].filter(s => D.series.some(r => r[s.key]));
      DRILL_ROWS.stack = { rows: D.series, stack: ser };
      chart = `<h4>Day by day, by platform</h4>${legend(ser)}<div data-dchart="stack">${stackChart('v2dchart', D.series, ser, { cur, h: 170 })}</div>`;
    } else if (m === 'cm' || m === 'net') {
      const pr = D.profit; if (pr && pr.series.length > 1) chart = mkLine(pr.series, pr.prev_series || [], m === 'cm' ? r => r.cm : r => r.cm == null ? null : r.cm - (r.fixed || 0), km);
    } else if (KEY[m]) chart = mkLine(D.series, D.prev_series, KEY[m][0], KEY[m][1]);
    if (!platMode && D.series.length < 2) chart = big ? `<h4>Day by day</h4>${big}` : '';

    const sw = id => `<span class="sw" style="background:var(${CH[id] || '--c-else'})"></span>`;
    const tbl = (heads, rows) => `<div class="v2tbl"><table class="v2dtbl"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    const sec = (title, find, inner, note) => `<div class="v2dsec"><h4>${title}</h4>${find ? `<p class="v2hint">${find}</p>` : ''}${inner}${note ? `<p class="v2dnote">${note}</p>` : ''}</div>`;
    const paid = D.channels.filter(r => (r.spend || 0) > 0);
    const blended = c.spend || 0, platSum = paid.reduce((s, r) => s + (r.spend || 0), 0);
    const modelNote = isPlat() ? 'Revenue on the platforms’ own numbers.' : `Credited under ${esc(MODEL_SHORT[H.S.model] || '')}; two platforms can claim one order.`;
    const out = [];

    /* ad spend by platform: share of all spend, and each platform's change */
    /* Triple Whale's blended spend (the tile) leaves Amazon ads out on the brands measured 2026-10-09 (Bonk: Meta + Google
       = blended to the dollar, Amazon on top). When that is what the numbers say, Amazon is shown OUTSIDE the total. */
    const amz = paid.find(r => r.id === 'amazon');
    const amzOut = !!amz && blended > 0 && Math.abs(platSum - amz.spend - blended) < Math.abs(platSum - blended);
    /* custom expenses marked "counts as ad spend" (Costs, 2026-10-10) are inside the blended total: their own rows */
    const adx = c.ad_expense || 0;
    const spendTable = me => { const mx = Math.max(...paid.map(r => r.spend), adx, 1); const rest = blended - platSum - adx + (amzOut ? amz.spend : 0);
      const rows = paid.slice().sort((a, b) => b.spend - a.spend).map(r => { const out = amzOut && r.id === 'amazon';
        return `<tr class="${r.id === me ? 'me' : ''}"><td>${sw(r.id)}${esc(r.label)}${out ? '<br><span class="faint">not in the total</span>' : ''}</td><td>${ib(r.spend, mx, CH[r.id] || '--c-else', km(r.spend))}</td><td>${out ? '–' : blended ? pct(r.spend / blended, 0) : '–'}</td><td>${cmpOn && r.prev_spend ? delta(r.spend, r.prev_spend, 'n') + `<br><span class="faint">${km(r.prev_spend)}</span>` : ''}</td></tr>`; });
      if (adx) { const its = D.ad_items && D.ad_items.length ? D.ad_items : [{ name: 'Other marketing', amount: adx }];
        for (const it of its) rows.push(`<tr><td>${sw('rest')}${esc(it.name)}<br><span class="faint">custom expense, counts as ad spend</span></td><td>${ib(it.amount, mx, '--c-else', km(it.amount))}</td><td>${blended ? pct(it.amount / blended, 0) : '–'}</td><td></td></tr>`); }
      if (blended && rest > blended * 0.01) rows.push(`<tr><td>${sw('rest')}Not split by platform</td><td>${ib(rest, mx, '--c-else', km(rest))}</td><td>${pct(rest / blended, 0)}</td><td></td></tr>`);
      rows.push(`<tr class="tot"><td>All ad spend</td><td>${km(blended)}</td><td>100%</td><td>${cmpOn ? delta(c.spend, p.spend, 'n') : ''}</td></tr>`);
      return tbl(['Platform', 'Spend', 'Share', cmpOn ? 'vs before' : ''], rows) + (amzOut ? `<p class="v2dnote">Amazon ads (${km(amz.spend)}) are not in Triple Whale’s blended ad spend, so the tile, MER and contribution margin leave them out.</p>` : ''); };
    /* ROAS per platform (and the blended MER on top) */
    const roasTable = me => { const rows = [`<tr class="tot"><td>Whole store (MER)</td><td>${km(c.sales)}</td><td>${km(c.spend)}</td><td>${x2(c.mer)}</td><td>${cmpOn ? delta(c.mer, p.mer) : ''}</td></tr>`];
      for (const r of paid.slice().sort((a, b) => b.spend - a.spend)) rows.push(`<tr class="${r.id === me ? 'me' : ''}"><td>${sw(r.id)}${esc(r.label)}</td><td>${r.revenue == null ? '–' : km(r.revenue)}</td><td>${km(r.spend)}</td><td>${r.revenue == null ? '–' : x2(r.revenue / r.spend)}</td><td>${cmpOn && r.prev_spend && r.prev_revenue != null ? delta(r.revenue / r.spend, r.prev_revenue / r.prev_spend) : ''}</td></tr>`);
      return tbl(['', 'Revenue', 'Spend', 'ROAS', cmpOn ? 'vs before' : ''], rows); };
    const ncTable = () => { const rows = D.channels.filter(r => r.nc > 0 || (r.spend || 0) > 0).sort((a, b) => b.nc - a.nc); const mx = Math.max(...rows.map(r => r.nc), 1);
      return tbl(['Where the first order came from', 'First orders', 'Spend', 'Cost each'], rows.map(r => `<tr><td>${sw(r.id)}${esc(r.label)}</td><td>${ib(r.nc, mx, CH[r.id] || '--c-else', int(r.nc))}</td><td>${r.spend ? km(r.spend) : '–'}</td><td>${r.spend && r.nc ? mo(r.spend / r.nc) : '–'}</td></tr>`)); };
    const newRet = () => { const ret = c.orders != null && c.new_orders != null ? c.orders - c.new_orders : null, pret = p.orders != null && p.new_orders != null ? p.orders - p.new_orders : null;
      const row = (l, col, o, po, rev, prev) => `<tr><td><span class="sw" style="background:var(${col})"></span>${l}</td><td>${int(o)}${cmpOn ? ' ' + delta(o, po) : ''}</td><td>${km(rev)}${cmpOn ? ' ' + delta(rev, prev) : ''}</td><td>${o ? money2(rev / o, cur) : '–'}</td><td>${c.sales && rev != null ? pct(rev / c.sales, 0) : '–'}</td></tr>`;
      return `<div class="v2stackbar"><i style="flex:${Math.max(0, c.new_rev || 0)};background:var(--brand)"></i><i style="flex:${Math.max(0, c.ret_rev || 0)};background:var(--c-email)"></i></div>`
        + tbl(['', 'Orders', 'Revenue', 'AOV', 'Share'], [row('New customers', '--brand', c.new_orders, p.new_orders, c.new_rev, p.new_rev), row('Returning', '--c-email', ret, pret, c.ret_rev, p.ret_rev),
          `<tr class="tot"><td>All</td><td>${int(c.orders)}</td><td>${km(c.sales)}</td><td>${money2(c.aov, cur)}</td><td>100%</td></tr>`]); };

    if (platMode) {
      const me = plat, row = D.channels.find(r => r.id === me);
      const lead = row && blended ? `${esc(row.label)} is ${pct((row.spend || 0) / blended, 0)} of all ad spend${row.revenue != null && c.sales ? ` and is credited with ${pct(row.revenue / c.sales, 0)} of store revenue` : ''}.` : '';
      if (m === 'spend') out.push(sec('Against every platform', lead, spendTable(me)));
      else if (m === 'revenue' || m === 'roas') out.push(sec('Against every platform', `${lead} ${modelNote}`, roasTable(me)));
      else { const rows = paid.filter(r => r.purchases != null).sort((a, b) => b.spend - a.spend); const mx = Math.max(...rows.map(r => r.purchases || 0), 1);
        out.push(sec('Against every platform', `${lead} ${modelNote}`, tbl(['Platform', 'Purchases', 'Spend', 'Cost each'], rows.map(r => `<tr class="${r.id === me ? 'me' : ''}"><td>${sw(r.id)}${esc(r.label)}</td><td>${ib(r.purchases || 0, mx, CH[r.id] || '--c-else', int(r.purchases))}</td><td>${km(r.spend)}</td><td>${r.purchases ? mo(r.spend / r.purchases) : '–'}</td></tr>`)))); }
    } else if (m === 'revenue') {
      const chs = D.channels.filter(r => (r.revenue || 0) > 0).sort((a, b) => (b.revenue || 0) - (a.revenue || 0)); const mx = Math.max(...chs.map(r => r.revenue), 1);
      out.push(sec('By channel', modelNote, tbl(['Channel', 'Revenue', 'Share', cmpOn ? 'vs before' : ''], chs.map(r => `<tr><td>${sw(r.id)}${esc(r.label)}</td><td>${ib(r.revenue, mx, CH[r.id] || '--c-else', km(r.revenue))}</td><td>${c.sales ? pct(r.revenue / c.sales, 0) : '–'}</td><td>${cmpOn && r.prev_revenue ? delta(r.revenue, r.prev_revenue) : ''}</td></tr>`)), 'Everything else = organic, direct and referral: store revenue no platform or email was credited with.'));
      out.push(sec('New against returning', `${pct(c.sales ? (c.new_rev || 0) / c.sales : null, 0)} of revenue came from first orders.`, newRet()));
      if (D.products.length) { const mx = Math.max(...D.products.map(x => x.orders), 1); out.push(sec('Top products', 'Orders with the product in the cart, and the order value shared across what was in it.', tbl(['Product', 'Orders', 'Order value'], D.products.map(x => `<tr><td>${esc(x.title)}</td><td>${ib(x.orders, mx, null, int(x.orders))}</td><td>${km(x.revenue)}</td></tr>`)))); }
    } else if (m === 'spend') {
      out.push(sec('By platform', `${paid.length ? `${esc(paid.slice().sort((a, b) => b.spend - a.spend)[0].label)} takes the most.` : ''} Each platform’s spend is its own number.`, spendTable(null)));
    } else if (m === 'mer' || m === 'roas') {
      out.push(sec('By platform', `MER is the whole store on all spend; each platform’s ROAS is its credited revenue on its own spend. ${modelNote}`, roasTable(null)));
    } else if (m === 'amer') {
      out.push(sec('How it is made', '', tbl(['', 'This period', cmpOn ? 'Before' : ''], [`<tr><td>Revenue from first orders</td><td>${km(c.new_rev)}</td><td>${cmpOn ? km(p.new_rev) : ''}</td></tr>`, `<tr><td>All ad spend</td><td>${km(c.spend)}</td><td>${cmpOn ? km(p.spend) : ''}</td></tr>`, `<tr class="tot"><td>aMER</td><td>${x2(c.amer)}</td><td>${cmpOn ? x2(p.amer) : ''}</td></tr>`, `<tr><td>MER, for comparison</td><td>${x2(c.mer)}</td><td>${cmpOn ? x2(p.mer) : ''}</td></tr>`])));
      out.push(sec('Where the first orders came from', 'By the source Triple Whale gives each order.', ncTable()));
    } else if (m === 'orders' || m === 'aov') {
      out.push(sec('New against returning', `First orders average ${money2(c.new_aov, cur)}; repeat orders ${c.orders && c.new_orders != null && c.orders > c.new_orders ? money2((c.ret_rev || 0) / (c.orders - c.new_orders), cur) : '–'}.`, newRet()));
      const days = D.series.slice(-14).reverse(), mx = Math.max(...days.map(r => r.orders || 0), 1);
      if (days.length > 1) out.push(sec('By day', days.length < D.series.length ? 'The last 14 days of the window.' : '', tbl(['Day', 'Orders', 'AOV', 'First orders'], days.map(r => `<tr><td>${day(r.date)}</td><td>${ib(r.orders || 0, mx, null, int(r.orders))}</td><td>${r.orders ? money2(r.sales / r.orders, cur) : '–'}</td><td>${int(r.new_orders)}</td></tr>`))));
    } else if (m === 'newcust' || m === 'cac') {
      out.push(sec('By platform', m === 'cac' ? 'Each platform’s spend divided by the first orders that came through it. Orders with no platform cost nothing to that line.' : 'By the source Triple Whale gives each first order.', ncTable(), 'Counted from stored orders, so the platforms can add up to slightly less than the headline.'));
      out.push(sec('New against returning', '', newRet()));
    } else if (m === 'email') {
      const tot = (c.campaigns || 0) + (c.flows || 0), ptot = (p.campaigns || 0) + (p.flows || 0);
      const row = (l, col, v, pv) => `<tr><td><span class="sw" style="background:var(${col})"></span>${l}</td><td>${ib(v || 0, Math.max(c.campaigns || 0, c.flows || 0, 1), col, km(v))}</td><td>${tot ? pct((v || 0) / tot, 0) : '–'}</td><td>${cmpOn && pv ? delta(v, pv) : ''}</td></tr>`;
      out.push(sec('Campaigns against flows', `Email and SMS was ${c.sales && c.email_rev != null ? pct(c.email_rev / c.sales, 0) : '–'} of store revenue.`, tbl(['', 'Revenue', 'Share', cmpOn ? 'vs before' : ''], [row('Flows (automated)', '--c-email', c.flows, p.flows), row('Campaigns (one-off sends)', '--c-meta', c.campaigns, p.campaigns), `<tr class="tot"><td>Email and SMS</td><td>${km(c.email_rev ?? tot)}</td><td>100%</td><td>${cmpOn ? delta(c.email_rev ?? tot, p.email_rev ?? ptot) : ''}</td></tr>`])));
    } else if (m === 'cm' || m === 'net') {
      out.push(drillFall(D.profit, cur, m));
    } else if (m === 'purchases' || m === 'cpa') {
      const rows = paid.filter(r => r.purchases != null).sort((a, b) => b.spend - a.spend), mx = Math.max(...rows.map(r => r.purchases || 0), 1);
      out.push(sec('By platform', modelNote, tbl(['Platform', 'Purchases', 'Spend', 'Cost each'], rows.map(r => `<tr><td>${sw(r.id)}${esc(r.label)}</td><td>${ib(r.purchases || 0, mx, CH[r.id] || '--c-else', int(r.purchases))}</td><td>${km(r.spend)}</td><td>${r.purchases ? mo(r.spend / r.purchases) : '–'}</td></tr>`))));
    }
    return chart + out.join('');
  }
  /** Contribution margin as a waterfall, then fixed expenses down to net profit. Each line: amount, % of revenue, change. */
  function drillFall(pr, cur, m) {
    if (!pr || !pr.cur) return `<div class="v2dsec"><p class="v2dnote">${H.S.role === 'client' ? 'Costs and margin are shown on the P&L only.' : 'No cost data for this window.'}</p></div>`;
    const t = pr.cur, p = pr.prev || {}, cmpOn = H.S.cmp !== 'none', M = v => money(v, cur);
    const top = Math.max(t.sales || 0, 1), P = x => Math.max(0, Math.min(100, x / top * 100)).toFixed(2);
    const bar = (from, to, cls) => `<div class="t"><i class="${cls}" style="left:${P(Math.min(from, to))}%;width:${P(Math.abs(to - from))}%"></i></div>`;
    const of = x => (t.sales ? `${pct(x / t.sales, 0)} of revenue` : '');
    const chg = (k, lower) => (cmpOn && p[k] != null && t[k] != null ? ' ' + delta(t[k], p[k], lower) : '');
    let at = t.sales || 0; const lines = [];
    const leave = (label, note, x, k) => { if (!x) return; lines.push(`<div class="r"${tipAttr(note)}><span class="l">${label}</span>${bar(at - x, at, 'out')}<span class="n neg">−${M(x)}<em>${of(x)}${chg(k, true)}</em></span></div>`); at -= x; };
    const tot = (label, note, val, cls, k) => `<div class="r tot"${tipAttr(note)}><span class="l">${label}</span>${bar(0, Math.abs(val || 0), cls)}<span class="n">${M(val)}<em>${of(val || 0)}${chg(k)}</em></span></div>`;
    lines.push(tot('Revenue', 'Shopify total sales minus sales tax.', t.sales, 'in', 'sales'));
    if (pr.margin_pct != null) leave(`Product and delivery, at the ${Math.round(pr.margin_pct * 100)}% margin override`, 'A flat margin replaces the whole cost chain for this brand.', (t.sales || 0) - (t.gross_profit || 0), 'gross_profit');
    else {
      leave('Product cost', 'Cost of goods sold, from Triple Whale.', t.cogs, 'cogs');
      leave('Shipping and fulfilment', 'What delivery actually cost.', t.ship_cost, 'ship_cost');
      leave('Handling', 'Pick, pack and handling fees.', t.handling, 'handling');
      leave('Payment fees', 'Gateway and processing.', t.fees, 'fees');
    }
    lines.push(tot('Gross profit', 'Revenue less every variable cost, before marketing.', t.gross_profit, 'in', 'gross_profit'));
    at = t.gross_profit || 0; leave('Ad spend', t.ad_expense ? 'Every ad platform combined, plus the custom expenses that count as ad spend.' : 'Every ad platform combined.', t.spend, 'spend');
    if (t.ad_expense) { lines.push(`<div class="r sub"><span class="l">Ad platforms</span><span></span><span class="n">−${M((t.spend || 0) - t.ad_expense)}</span></div>`);
      for (const it of pr.ad_items || []) lines.push(`<div class="r sub"><span class="l">${esc(it.name)}</span><span></span><span class="n">−${M(it.amount)}</span></div>`); }
    lines.push(tot('Contribution margin', 'What the marketing made on the margin. Fixed costs are not in it.', t.cm, (t.cm || 0) >= 0 ? 'keep' : 'lose', 'cm'));
    const items = pr.fixed_items || [];
    if (t.fixed) {
      at = t.cm || 0; leave('Custom expenses', 'Set per brand on Costs (P&L, or Brand settings > Data and costs).', t.fixed, 'fixed');
      for (const it of items) lines.push(`<div class="r sub"><span class="l">${esc(it.name)}</span><span></span><span class="n">−${M(it.amount)}</span></div>`);
      lines.push(tot('Net profit', 'Contribution margin minus custom expenses.', t.net, (t.net || 0) >= 0 ? 'keep' : 'lose', 'net'));
    }
    const note = [pr.left_out && pr.left_out.length ? `Left out because their cost data is unreliable: ${esc(pr.left_out.join(', '))}.` : '',
      !t.fixed ? `No custom expenses set${H.S.act === 'all' ? ' for these brands' : ''}, so there is no net profit line. ${H.S.act === 'all' ? 'Add them per brand on Costs.' : '<button type="button" class="v2link" data-dfix="1">Add the team, software, rent or agency fees ›</button>'}` : ''].filter(Boolean).join(' ');
    return `<div class="v2dsec"><h4>${m === 'net' ? 'From revenue to net profit' : 'Where the money went'}</h4><div class="pnl-fall">${lines.join('')}</div>${note ? `<p class="v2dnote">${note}</p>` : ''}</div>`;
  }

  /* ---------- small graphics ---------- */
  function spark(vals, ghost, w = 300, h = 34, tips) {
    const v = (vals || []).map(x => x == null ? null : +x); if (v.filter(x => x != null).length < 2) return '';
    const all = v.concat(ghost || []).filter(x => x != null); const mx = Math.max(...all), mn = Math.min(...all), r = mx - mn || 1;
    const pt = a => a.map((y, i) => y == null ? null : `${(i / Math.max(1, a.length - 1) * (w - 6) + 3).toFixed(1)},${(h - 4 - (y - mn) / r * (h - 10)).toFixed(1)}`).filter(Boolean).join(' ');
    const last = v[v.length - 1] ?? 0;
    return `<svg class="v2spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"${tips && tips.length === v.length ? ` data-spk="${esc(JSON.stringify(tips))}"` : ''}>${ghost && ghost.length > 1 ? `<polyline points="${pt(ghost)}" fill="none" stroke="var(--v2-cmp)" stroke-width="1.2" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>` : ''}${(() => { const p = pt(v).split(' '); return p.length > 1 ? `<path d="M${p[0]} L${p.slice(1).join(' L')} L${p[p.length - 1].split(',')[0]},${h} L${p[0].split(',')[0]},${h}Z" fill="url(#lx-area)" stroke="none"/>` : ''; })()}<polyline points="${pt(v)}" fill="none" stroke="var(--brand)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><circle cx="${w - 3}" cy="${(h - 4 - (last - mn) / r * (h - 10)).toFixed(1)}" r="2.6" fill="var(--brand)"/></svg>`;
  }
  /** Goal bullet: actual bar, target tick. `lower` = lower is better (CPA). */
  function bullet(actual, target, lower, label) {
    if (actual == null || !target) return '';
    const max = Math.max(actual, target) * 1.25; const a = Math.min(100, actual / max * 100), t = target / max * 100;
    const ok = lower ? actual <= target : actual >= target;
    return `<div class="v2bul"${tipAttr(`${ok ? 'On goal' : 'Off goal'}: the bar is where it is now, the tick is the ${esc(label)}.${lower ? ' Lower is better.' : ''}`)}><div class="trk"><i style="width:${a.toFixed(1)}%;background:${ok ? 'var(--good)' : 'var(--bad)'}"></i><b style="left:${t.toFixed(1)}%"></b></div><div class="lb">${label}</div></div>`;
  }
  function tile(o) {
    return `<div class="v2tile${o.hero ? ' hero' : ''}${o.compact ? ' c' : ''}"${o.go ? ` data-go="${esc(o.go)}" role="link" tabindex="0"` : ''}>
      <div class="l"${o.hint ? ` title="${esc(o.hint)}"` : ''}><span>${esc(o.label)}${o.src ? ` <span class="v2src">${esc(o.src)}</span>` : ''}</span>${o.hint && o.hero ? `<em>${esc(o.hint)}</em>` : ''}</div>
      <div class="v">${o.value}${o.delta || ''}</div>
      ${o.bullet || ''}${o.sub ? `<div class="sub">${o.sub}</div>` : ''}${o.spark || ''}</div>`;
  }
  /* A TILE'S LINE (2026-10-09, Cole: "shouldn't there be a chart for everything the same way?"). Every headline tile
     carries the period day by day, the compare period dashed behind it, and answers hover like the revenue chart.
     `rows` / `prev` are day rows; `k` is a key or a function of the row. */
  function tspark(rows, prev, k, fmt, label) {
    const g = typeof k === 'function' ? k : r => r[k];
    const v = (rows || []).map(r => { const x = g(r); return x == null || !isFinite(x) ? null : x; });
    if (v.filter(x => x != null).length < 2) return '';
    const pv = (prev || []).map(r => { const x = g(r); return x == null || !isFinite(x) ? null : x; });
    return spark(v, pv.length > 1 && H.S.cmp !== 'none' ? pv : null, 300, 34, rows.map((r, i) => `<b>${day(r.date)}</b> · ${esc(label)} ${v[i] == null ? '–' : fmt(v[i])}${pv[i] != null && H.S.cmp !== 'none' ? `<br><span class="faint">${esc(cmpLabel())}: ${fmt(pv[i])}</span>` : ''}`));
  }
  /* Sum day rows across brands by date (all-brands screens), then derive the ratios per day. */
  function mergeDays(list, keys) {
    const m = new Map();
    for (const rows of list) for (const r of rows || []) { const o = m.get(r.date) || Object.fromEntries([['date', r.date], ...keys.map(k => [k, null])]); for (const k of keys) if (r[k] != null && isFinite(r[k])) o[k] = (o[k] || 0) + +r[k]; m.set(r.date, o); }
    return [...m.values()].sort((x, y) => (x.date < y.date ? -1 : 1));
  }
  const ratios = r => ({ ...r, roas: r.spend ? (r.revenue ?? 0) / r.spend : null, cpa: r.purchases ? r.spend / r.purchases : null, cpm: r.impressions ? r.spend * 1000 / r.impressions : null, ctr: r.impressions ? (r.clicks || 0) / r.impressions : null });
  /* SKELETONS (2026-10-09, Cole: "shouldn't there be something on screen to show it is loading?"). A first load paints
     the page's shape in shimmer (tiles, a chart, rows, cards); a re-render keeps the old page dimmed (show()'s
     #main.busy) with the top bar running. Never a blank screen, never a frozen one. */
  const skTiles = (n = 4) => `<div class="v2tiles${n > 4 ? ' home8' : ''} v2sk">${Array.from({ length: n }, () => '<div class="v2tile"><i class="a"></i><i class="b"></i><i class="c"></i></div>').join('')}</div>`;
  const skCard = (rows = 5, chart) => `<section class="v2card v2sk"><i class="h"></i>${chart ? '<i class="ch"></i>' : Array.from({ length: rows }, () => '<i class="r"></i>').join('')}</section>`;
  const skGal = (n = 8) => `<div class="v2gal v2sk">${Array.from({ length: n }, () => '<div class="g"><i class="th"></i><i class="r"></i><i class="r s"></i></div>').join('')}</div>`;
  const skPage = o => `${o.lead ? '<p class="v2say lead v2sk"><i class="r"></i></p>' : ''}${skTiles(o.tiles || 4)}${o.chart !== false ? skCard(0, true) : ''}${o.gal ? `<section class="v2card v2sk"><i class="h"></i>${skGal()}</section>` : ''}${skCard(o.rows || 6)}`;
  /* One menu style everywhere: the host's PillMenu (index.html), the same pill and menu as the period and attribution. */
  const PM = () => window.PillMenu || { html: () => '', wire: () => {} };
  const ib = (v, max, color, label, tip) => `<span class="v2ib"${tip ? tipAttr(tip) : ''}><i style="width:${max ? Math.max(2, Math.min(100, v / max * 100)).toFixed(0) : 0}%;${color ? `background:var(${color})` : ''}"></i><span>${label}</span></span>`;

  /** Line chart, one scale, compare period ghosted, optional plan line and change markers, shared tooltip. */
  function lineChart(id, rows, opts = {}) {
    const key = opts.key || 'v', cur = opts.cur, w = 760, h = opts.h || 240, pl = 48, pr = 16, pt = 14, pb = 26;
    const n = rows.length; if (n < 2) return `<p class="v2hint">${n === 1 ? 'One day is picked, so there is no day-by-day line. Pick Last 7 days or longer at the top to see the trend.' : 'No days with data in this window yet.'}</p>`;
    const prev = opts.prev || [];
    const vals = rows.map(r => r[key] ?? 0).concat(prev.map(r => r[key] ?? 0)).concat(opts.plan ? [opts.plan] : []).concat(opts.key2 ? rows.map(r => r[opts.key2] ?? 0) : []);
    const mx = Math.max(...vals, 1) * 1.1;
    const X = i => pl + i / (n - 1) * (w - pl - pr), Y = v => pt + (1 - v / mx) * (h - pt - pb);
    const line = (a, k) => a.slice(0, n).map((r, i) => r[k] == null ? null : `${X(i).toFixed(1)},${Y(r[k]).toFixed(1)}`).filter(Boolean).join(' ');
    const fmt = opts.fmt || (v => kmoney(v, cur));
    const grid = [0.25, 0.5, 0.75, 1].map(f => `<line x1="${pl}" x2="${w - pr}" y1="${Y(mx * f).toFixed(1)}" y2="${Y(mx * f).toFixed(1)}" stroke="var(--v2-grid)" stroke-dasharray="2 4"/><text x="${pl - 8}" y="${(Y(mx * f) + 4).toFixed(1)}" font-size="10.5" text-anchor="end" fill="var(--faint)">${fmt(mx * f)}</text>`).join('');
    /* Smooth curves (monotone-ish Catmull-Rom). The straight polylines stay in the svg, invisible, because the
       hover dots (markDots) read their points. */
    const smooth = (a, k) => { const p = a.slice(0, n).map((r, i) => r[k] == null ? null : [X(i), Y(r[k])]).filter(Boolean); if (p.length < 2) return '';
      let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
      for (let i = 0; i < p.length - 1; i++) { const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2, t = 0.16;
        const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]), cl = y => Math.max(lo, Math.min(hi, y));
        d += ` C${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)},${cl(p1[1] + (p2[1] - p0[1]) * t).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)},${cl(p2[1] - (p3[1] - p1[1]) * t).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`; }
      return d; };
    const mainD = smooth(rows, key), base = (h - pb).toFixed(1);
    const area = mainD ? `<path d="${mainD} L${X(n - 1).toFixed(1)},${base} L${X(0).toFixed(1)},${base}Z" fill="url(#lx-area)" stroke="none"/>` : '';
    const peakI = rows.reduce((b, r, i) => (r[key] != null && (b < 0 || r[key] > rows[b][key]) ? i : b), -1);
    const peak = peakI >= 0 && peakI !== n - 1 ? `<text x="${Math.min(w - pr - 30, Math.max(pl + 30, X(peakI))).toFixed(1)}" y="${(Y(rows[peakI][key]) - 9).toFixed(1)}" font-size="10.5" font-weight="600" text-anchor="middle" fill="var(--ink-2)">${fmt(rows[peakI][key])}</text>` : '';
    const idx = n <= 10 ? rows.map((_, i) => i) : [...new Set(Array.from({ length: 6 }, (_, k) => Math.round(k * (n - 1) / 5)))];
    const ticks = idx.map(i => `<text x="${X(i).toFixed(1)}" y="${h - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${day(rows[i].date)}</text>`).join('');
    const marks = (opts.changes || []).map(c => { const i = rows.findIndex(r => r.date === c.date); if (i < 0) return ''; return `<g class="v2mk"><line x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${pt}" y2="${h - pb}" stroke="var(--faint)" stroke-dasharray="2 3"/><polygon points="${(X(i) - 5).toFixed(1)},${h - pb + 2} ${(X(i) + 5).toFixed(1)},${h - pb + 2} ${X(i).toFixed(1)},${h - pb - 6}" fill="var(--muted)"><title>${esc(day(c.date) + ' · ' + c.text)}</title></polygon></g>`; }).join('');
    const lastV = rows[n - 1][key];
    return `<div class="v2chart" data-chart="${id}"><svg id="${id}" viewBox="0 0 ${w} ${h}">${grid}${ticks}
      ${opts.plan ? `<line x1="${pl}" x2="${w - pr}" y1="${Y(opts.plan).toFixed(1)}" y2="${Y(opts.plan).toFixed(1)}" stroke="var(--warn)" stroke-width="1.2" stroke-dasharray="2 4"/>` : ''}
      ${area}
      ${prev.length > 1 ? `<path d="${smooth(prev, key)}" fill="none" stroke="var(--v2-cmp)" stroke-width="1.5" stroke-dasharray="4 4" stroke-linecap="round"/><polyline points="${line(prev, key)}" fill="none" stroke="var(--v2-cmp)" stroke-opacity="0"/>` : ''}
      ${opts.key2 ? `<path d="${smooth(rows, opts.key2)}" fill="none" stroke="var(--c-google)" stroke-width="1.6" stroke-linecap="round"/><polyline points="${line(rows, opts.key2)}" fill="none" stroke="var(--c-google)" stroke-opacity="0"/>` : ''}
      <path d="${mainD}" fill="none" stroke="var(--brand)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${line(rows, key)}" fill="none" stroke="var(--brand)" stroke-opacity="0"/>
      ${lastV != null ? `<circle cx="${X(n - 1).toFixed(1)}" cy="${Y(lastV).toFixed(1)}" r="4" fill="var(--surface)" stroke="var(--brand)" stroke-width="2"/>` : ''}${peak}
      ${marks}<line class="gl" x1="0" x2="0" y1="${pt}" y2="${h - pb}" stroke="var(--ink)" stroke-width="1" stroke-dasharray="3 3" opacity="0"/><g class="gdots"></g></svg><div class="v2tip"></div></div>`;
  }
  /** Shaded date ranges on a lineChart already drawn (calendar dates: a sale or drop as a band). Same geometry as lineChart. */
  function addBands(id, rows, bands, opts = {}) {
    const svg = document.getElementById(id); if (!svg || !bands || !bands.length || rows.length < 2) return;
    const w = 760, h = opts.h || 240, pl = 48, pr = 16, pt = 14, pb = 26, n = rows.length, step = (w - pl - pr) / (n - 1);
    const X = i => pl + i * step, first = rows[0].date, last = rows[n - 1].date;
    svg.querySelectorAll('.v2band').forEach(g => g.remove());
    const anchor = svg.querySelector('polyline');
    bands.slice(0, 6).forEach((b, k) => {
      if (b.to < first || b.from > last) return;
      const i0 = Math.max(0, rows.findIndex(r => r.date >= b.from)), i1r = rows.map(r => r.date <= b.to).lastIndexOf(true), i1 = i1r < 0 ? n - 1 : i1r;
      const x0 = Math.max(pl, X(i0) - step / 2), x1 = Math.min(w - pr, X(i1) + step / 2), col = b.kind === 'drop' ? 'var(--c-meta)' : 'var(--c-email)';
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('class', 'v2band');
      g.innerHTML = `<rect x="${x0.toFixed(1)}" y="${pt}" width="${Math.max(3, x1 - x0).toFixed(1)}" height="${h - pt - pb}" fill="${col}" opacity=".13"${tipAttr(`<b>${esc(b.label)}</b><br>${esc(b.from)}${b.to !== b.from ? ' to ' + esc(b.to) : ''}<br><span class=\"faint\">From the calendar</span>`)}/><text x="${(x0 + 4).toFixed(1)}" y="${pt + 11 + (k % 2) * 12}" font-size="10" font-weight="600" fill="${col}">${esc(String(b.label).slice(0, 28))}</text>`;
      svg.insertBefore(g, anchor);
    });
  }
  /** A dot where each drawn line crosses the hovered x (viewBox units), for every line chart in Locus. */
  function markDots(svg, x, tol) {
    let g = svg.querySelector('.gdots'); if (!g) { g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('class', 'gdots'); svg.appendChild(g); }
    g.innerHTML = [...svg.querySelectorAll('polyline')].map(pl2 => {
      const raw = (pl2.getAttribute('points') || '').trim(); if (!raw) return '';
      const pts = raw.split(/\s+/).map(p => p.split(',').map(Number)); let best = null;
      for (const p of pts) if (!best || Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p;
      if (!best || Math.abs(best[0] - x) > tol) return '';
      return `<circle cx="${best[0]}" cy="${best[1]}" r="4.5" fill="var(--surface)" stroke="${pl2.getAttribute('stroke')}" stroke-width="2"/>`;
    }).join('');
  }
  const clearDots = svg => { const g = svg.querySelector('.gdots'); if (g) g.innerHTML = ''; };
  function wireLine(id, rows, opts = {}) {
    const el = document.getElementById(id); if (!el) return;
    const w = 760, pl = 48, pr = 16, n = rows.length, wrap = el.parentNode, tip = wrap.querySelector('.v2tip'), gl = el.querySelector('.gl');
    const move = e => {
      const r = el.getBoundingClientRect(); const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width * w - pl) / (w - pl - pr) * (n - 1))));
      const x = pl + i / (n - 1) * (w - pl - pr); gl.setAttribute('x1', x); gl.setAttribute('x2', x); gl.setAttribute('opacity', '.55');
      markDots(el, x, (w - pl - pr) / Math.max(1, n - 1) / 2 + 1);
      tip.style.display = 'block'; tip.innerHTML = opts.tip(rows[i], i);
      const tw = tip.offsetWidth; let left = (e.clientX - r.left) + 14; if (left + tw > r.width) left = (e.clientX - r.left) - tw - 14; tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px';
    };
    el.onpointermove = move; el.onpointerdown = move; el.onpointerleave = () => { tip.style.display = 'none'; gl.setAttribute('opacity', '0'); clearDots(el); };
  }
  /** Stacked daily bars (spend by campaign or platform), shared tooltip per day. */
  function stackChart(id, rows, series, opts = {}) {
    const w = 1000, h = opts.h || 200, pl = 48, pr = 10, pt = 10, pb = 24, n = rows.length; if (!n) return '';
    const totals = rows.map(r => series.reduce((s, k) => s + (r[k.key] || 0), 0)); const mx = Math.max(...totals, 1) * 1.12;
    const bw = (w - pl - pr) / n, Y = v => pt + (1 - v / mx) * (h - pt - pb);
    let out = [0.5, 1].map(f => `<line x1="${pl}" x2="${w - pr}" y1="${Y(mx * f).toFixed(1)}" y2="${Y(mx * f).toFixed(1)}" stroke="var(--v2-grid)"/><text x="${pl - 6}" y="${(Y(mx * f) + 4).toFixed(1)}" font-size="10" text-anchor="end" fill="var(--muted)">${kmoney(mx * f, opts.cur)}</text>`).join('');
    rows.forEach((r, i) => { let base = 0; series.forEach(sr => { const v = r[sr.key] || 0; if (v <= 0) return; const y0 = Y(base + v), y1 = Y(base); out += `<rect x="${(pl + i * bw + 1).toFixed(1)}" y="${y0.toFixed(1)}" width="${Math.max(1, bw - 3).toFixed(1)}" height="${Math.max(0, y1 - y0 - 1).toFixed(1)}" rx="2" fill="var(${sr.color})"/>`; base += v; }); });
    const idx = n <= 10 ? rows.map((_, i) => i) : [...new Set(Array.from({ length: 6 }, (_, k) => Math.round(k * (n - 1) / 5)))];
    out += idx.map(i => `<text x="${(pl + i * bw + bw / 2).toFixed(1)}" y="${h - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${day(rows[i].date)}</text>`).join('');
    out += (opts.changes || []).map(c => { const i = rows.findIndex(r => r.date === c.date); if (i < 0) return ''; const cx = pl + i * bw + bw / 2; return `<polygon points="${(cx - 5).toFixed(1)},${h - pb + 2} ${(cx + 5).toFixed(1)},${h - pb + 2} ${cx.toFixed(1)},${h - pb - 6}" fill="var(--muted)"><title>${esc(day(c.date) + ' · ' + c.text)}</title></polygon>`; }).join('');
    return `<div class="v2chart"><svg id="${id}" viewBox="0 0 ${w} ${h}">${out}<rect class="hov" x="0" y="${pt}" width="0" height="${h - pt - pb}" fill="var(--ink)" opacity="0"/></svg><div class="v2tip"></div></div>`;
  }
  function wireStack(id, rows, series, cur) {
    const el = document.getElementById(id); if (!el) return;
    const w = 1000, pl = 48, pr = 10, n = rows.length, bw = (w - pl - pr) / n, tip = el.parentNode.querySelector('.v2tip'), hov = el.querySelector('.hov');
    el.onpointermove = el.onpointerdown = e => {
      const r = el.getBoundingClientRect(); const i = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width * w - pl) / bw)));
      hov.setAttribute('x', pl + i * bw); hov.setAttribute('width', bw); hov.setAttribute('opacity', '.06');
      const row = rows[i]; const tot = series.reduce((s, k) => s + (row[k.key] || 0), 0);
      tip.style.display = 'block'; tip.innerHTML = `<b>${day(row.date)}</b> · ${kmoney(tot, cur)}<br>${series.filter(sr => row[sr.key] > 0).map(sr => `<span class="sw" style="background:var(${sr.color})"></span>${esc(sr.label)} ${kmoney(row[sr.key], cur)}`).join('<br>')}`;
      const tw = tip.offsetWidth; let left = (e.clientX - r.left) + 14; if (left + tw > r.width) left = (e.clientX - r.left) - tw - 14; tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px';
    };
    el.onpointerleave = () => { tip.style.display = 'none'; hov.setAttribute('opacity', '0'); };
  }
  const legend = items => `<div class="v2lg">${items.map(i => `<span><i style="background:${i.dash ? 'transparent' : `var(${i.color})`};${i.dash ? 'border-top:2px dashed var(--v2-cmp);height:0' : ''}"></i>${esc(i.label)}</span>`).join('')}</div>`;
  const card = (title, find, body, cap) => `<section class="v2card">${title || find || cap ? `<div class="v2h"><h3>${esc(title || '')}</h3>${find ? `<span class="find">${find}</span>` : ''}${cap ? `<span class="cap">${cap}</span>` : ''}</div>` : ''}${body}</section>`;
  const foot = t => `<p class="v2foot">${t}</p>`;

  /* ---------- side panel (drill) ---------- */
  /* Detail views (DESIGN.md "Sheet"). panel(title, html) is a floating drawer on the right; with
     panel.sheet = {lead, chip, actions} set before the call it is a FULL SHEET: header (lead art, name,
     status chip, actions, expand, close) and a left sub-nav built from the body's [data-sec] blocks. */
  function panel(title, html) {
    let p = document.getElementById('v2panel');
    const ic = (n, l) => window.icon ? window.icon(n, { size: 16, label: l }) : '';
    if (!p) { document.body.insertAdjacentHTML('beforeend', `<div id="v2scrim"></div><aside id="v2panel" aria-label="Detail" role="dialog"><div class="ph"><span class="plead"></span><div class="pt"><b></b><span class="pchip"></span></div><span class="sp"></span><span class="pacts"></span><button type="button" class="ds-iconbtn pexp" aria-label="Expand">${ic('maximize', 'Expand')}</button><button type="button" class="ds-iconbtn pclose" aria-label="Close">${ic('x', 'Close')}</button></div><div class="sbody"><nav class="snav" aria-label="Sections"></nav><div class="pb"></div></div></aside>`); p = document.getElementById('v2panel');
      /* CLOSING MUST GIVE THE PAGE BACK (2026-10-09, Cole: "when I click an ad and click out, I can't click anything
         else"). A closed sheet used to sit centred over the page at opacity 0 and swallow every click; v2.css now
         hides a closed panel from the pointer, and the close also stops any playing video or Meta preview. */
      const close = () => { if (!p.classList.contains('on')) return; p.classList.remove('on'); document.getElementById('v2scrim').classList.remove('on'); p.querySelectorAll('.pb iframe, .pb video').forEach(x => x.remove()); if (window.LocusShare) window.LocusShare.setExtra({ ad: null }); };
      panel.close = close;
      p.querySelector('.pclose').onclick = close; document.getElementById('v2scrim').onclick = close; document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
      p.querySelector('.pexp').onclick = () => p.classList.toggle('full'); }
    const sh = panel.sheet || null; panel.sheet = null;
    p.classList.toggle('wide', !!panel.wide); panel.wide = false;
    p.classList.toggle('sheet', !!sh); if (!sh) p.classList.remove('full');
    p.querySelector('.ph b').textContent = title;
    p.querySelector('.plead').innerHTML = (sh && sh.lead) || ''; p.querySelector('.pchip').innerHTML = (sh && sh.chip) || ''; p.querySelector('.pacts').innerHTML = (sh && sh.actions) || '';
    const pb = p.querySelector('.pb'); pb.innerHTML = html; pb.scrollTop = 0;
    const nav = p.querySelector('.snav'), secs = sh ? [...pb.querySelectorAll('[data-sec]')] : [];
    nav.innerHTML = secs.length > 1 ? `<span class="ds-label">${esc(sh.navLabel || 'On this page')}</span>` + secs.map((x, i) => `<button type="button" data-sec-i="${i}" class="${i ? '' : 'on'}">${x.dataset.ic ? ic(x.dataset.ic) : ''}<span>${esc(x.dataset.sec)}</span></button>`).join('') : '';
    nav.hidden = secs.length < 2;
    /* SCROLL-SPY INSIDE THE SHEET'S OWN SCROLLER (2026-10-09, Cole: "it stops on The call, doesn't go to Ad copy").
       Positions come from getBoundingClientRect against .pb (offsetTop was relative to the wrong parent), the last
       section wins once the scroller is at its end, and a spacer lets the last section reach the top. A click
       lights its row at once and holds it while the smooth scroll runs. */
    const mark = k => nav.querySelectorAll('[data-sec-i]').forEach((b, i) => { b.classList.toggle('on', i === k); if (i === k) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    const topOf = x => x.getBoundingClientRect().top - pb.getBoundingClientRect().top + pb.scrollTop;
    let hold = 0, raf = 0;
    if (secs.length > 1) {
      const end = document.createElement('div'); end.className = 'v2spy-end'; end.setAttribute('aria-hidden', 'true'); pb.appendChild(end);
      const fit = () => { if (!end.isConnected) return; const last = secs[secs.length - 1]; end.style.height = '0px'; end.style.height = Math.max(0, pb.clientHeight - (pb.scrollHeight - topOf(last)) - 12) + 'px'; };
      requestAnimationFrame(fit); setTimeout(fit, 700);   // again once covers and the copy have landed
      panel.refit = fit;
    } else panel.refit = () => {};
    nav.onclick = e => { const b = e.target.closest('[data-sec-i]'); if (!b) return; const i = +b.dataset.secI, t = secs[i]; mark(i); hold = Date.now() + 900; pb.scrollTo({ top: Math.max(0, topOf(t) - 12), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
    pb.onscroll = secs.length > 1 ? () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (Date.now() < hold) return;
      let k = 0; const line = pb.scrollTop + 64; secs.forEach((x, i) => { if (topOf(x) <= line) k = i; });
      if (pb.scrollTop + pb.clientHeight >= pb.scrollHeight - 4) k = secs.length - 1;
      mark(k); }); } : null;
    p.classList.add('on'); document.getElementById('v2scrim').classList.add('on');
    return pb;
  }
  async function drillOrders(label, q) {
    const body = panel(label, '<p class="v2hint">Reading the orders…</p>');
    try {
      const d = await get(`/api/hub/orders?act=${encodeURIComponent(H.S.act)}&${H.rangeQ()}${modelQ()}&${q}`);
      const cur = (H.S.accounts.find(a => a.act_id === H.S.act) || {}).currency;
      body.innerHTML = `<div class="v2pstat"><div><b>${int(d.orders.length)}</b><span>orders</span></div><div><b>${kmoney(d.total, cur)}</b><span>order value</span></div><div><b>${int(d.new_customers)}</b><span>first orders</span></div></div>
        ${d.note ? `<p class="v2hint">${esc(d.note)}</p>` : `<p class="v2hint">${esc(MODEL_SHORT[d.model_used] || '')}. Click a customer to see everything they bought.</p>`}
        <div class="v2olist">${d.orders.map(o => `<button type="button" class="v2orow" data-cust="${esc(o.customer_id || '')}"><span><b>${money(o.total, cur)}</b> · ${day(o.date)}${o.new ? ' <span class="v2pill good">first order</span>' : o.new === false ? ' <span class="v2pill">returning</span>' : ''}</span><span class="v2ad">${esc((o.ads || []).slice(0, 2).join(' · '))}</span></button>`).join('') || '<p class="v2hint">No orders are stored for this cell yet. Order lists are kept from the last 60 days.</p>'}</div>`;
      body.querySelectorAll('[data-cust]').forEach(b => b.onclick = () => b.dataset.cust && drillCustomer(b.dataset.cust, cur));
    } catch (e) { body.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; }
  }
  async function drillCustomer(id, cur) {
    const body = panel('One customer', '<p class="v2hint">Reading their orders…</p>');
    try {
      const d = await get(`/api/hub/customer?act=${encodeURIComponent(H.S.act)}&customer=${encodeURIComponent(id)}`);
      body.innerHTML = `<div class="v2pstat"><div><b>${int(d.orders.length)}</b><span>orders</span></div><div><b>${money(d.lifetime, cur)}</b><span>spent so far</span></div></div>
        <ol class="v2journey">${d.orders.map((o, i) => `<li><b>${day(o.date)} · ${money(o.total, cur)}</b>${i === 0 ? ' <span class="v2pill good">first</span>' : ''}<span>${esc(o.source || 'organic')}${(o.touches || []).filter(t => t.model === 'lastPlatformClick').map(t => ` · ${esc(t.ad_name || t.platform || '')}`).join('')}</span></li>`).join('')}</ol>`;
    } catch (e) { body.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; }
  }

  /* ---------- ad covers and the preview panel ----------
     Covers come from account-health /api/ad-creatives (cached there 14 days, here for the
     session). The preview plays the real video when Meta gives a file, else shows Meta's own
     preview (partnership ads), else the cover large. */
  const THUMBS = new Map(), ASSETS = new Map(), PREVIEWS = new Map();
  async function loadThumbs(root, ids, actOverride) {
    const want = [...new Set(ids.filter(id => id && !THUMBS.has(id)))].slice(0, 40);
    const paint = () => root.querySelectorAll('[data-thumb]').forEach(el => { const u = THUMBS.get(el.dataset.thumb); if (u) el.style.backgroundImage = `url("${u}")`; });
    paint(); if (!want.length) return;
    const act = actOverride || H.S.act; const t = H.RUN();
    /* ASK IN EIGHTS. The worker resolves at most 10 UNCACHED ads per call (its Meta subrequest
       budget), so one call for 24 left 14 cards blank for good: that was "no previews". Three
       small calls run side by side and each paints as it lands. */
    const chunks = []; for (let i = 0; i < want.length; i += 8) chunks.push(want.slice(i, i + 8));
    const one = async ids => {
      try { const r = await H.apiAH(`/api/ad-creatives?act=${encodeURIComponent(act)}&ads=${ids.join(',')}`); for (const [id, x] of Object.entries(r.assets || {})) { ASSETS.set(id, x); const u = x.thumb || x.image || x.cover; if (u) THUMBS.set(id, u); } } catch {}
      if (actOverride || t === H.RUN()) paint();
    };
    let next = 0; await Promise.all([0, 1, 2].map(async () => { while (next < chunks.length) await one(chunks[next++]); }));
  }
  /* Funnel grade (2026-10-08, Atria/Superads idea): each step against the brand's own median ad in
     this window. A = 25%+ better, B = 5%+, C = about the same, D = 10%+ worse, F = 25%+ worse.
     The weakest step names the iteration. */
  let MED = null;
  const cvrOf = r => { const imp = r.cpm ? r.spend / r.cpm * 1000 : null; const clicks = imp && r.ctr ? imp * r.ctr : null; return clicks ? (r.purchases || 0) / clicks : null; };
  function medians(ads, minSpend) {
    const pool = ads.filter(r => r.spend >= minSpend); const med = k => { const v = pool.map(k).filter(x => x != null && isFinite(x)).sort((p, q) => p - q); return v.length >= 5 ? v[Math.floor(v.length / 2)] : null; };
    return { hook: med(r => r.hook), hold: med(r => r.hold), ctr: med(r => r.ctr), cvr: med(cvrOf) };
  }
  const FIX = { hook: 'New first three seconds on the same body: the opening loses people.', hold: 'Keep the opening, tighten the middle: people start and leave.', ctr: 'Sharper offer or call to action: people watch but do not click.', cvr: 'Fix the landing page or the offer: people click but do not buy.' };
  function gradeHtml(a, med) {
    if (!med) return '';
    const steps = [['hook', 'Hook', a.hook], ['hold', 'Hold', a.hold], ['ctr', 'Click', a.ctr], ['cvr', 'Purchase', cvrOf(a)]].filter(([k, , v]) => v != null && med[k]);
    if (steps.length < 2) return '';
    const gr = r => r >= 1.25 ? 'A' : r >= 1.05 ? 'B' : r >= 0.9 ? 'C' : r >= 0.75 ? 'D' : 'F';
    const scored = steps.map(([k, l, v]) => ({ k, l, v, r: v / med[k] }));
    const weak = scored.slice().sort((p, q) => p.r - q.r)[0];
    return `<div class="v2grade">${scored.map(x => `<div class="gr g${gr(x.r)}"${tipAttr(`${x.l}: ${x.k === 'cvr' || x.k === 'ctr' ? pct(x.v, 2) : pct(x.v, 0)} against the brand median ${x.k === 'cvr' || x.k === 'ctr' ? pct(med[x.k], 2) : pct(med[x.k], 0)}`)}><b>${gr(x.r)}</b><span>${x.l}</span></div>`).join('')}</div>
      <p class="v2hint"><b>To iterate:</b> ${esc(FIX[weak.k])}</p>`;
  }
  function previewAd(a, cur, goals, cx) {
    const g = goals || {}; const x = ASSETS.get(a.id) || {};
    /* The ad set scorecard: an ad is never judged alone (Cole, 2026-10-08). */
    const sc = a.adset || null;
    const setCard = sc && sc.ads > 1 ? `<div class="v2setc"><div class="h"><b>Its ad set</b>${sc.name ? `<span>${esc(sc.name)}</span>` : ''}</div>
      <div class="v2kv"><span>Set spend</span><b>${kmoney(sc.spend, cur)}</b><span>Set cost per purchase</span><b class="${!g.cpa || sc.cpa == null ? '' : sc.cpa <= g.cpa ? 'good' : 'bad'}">${money(sc.cpa, cur)}</b><span>Set ROAS</span><b>${x2(sc.roas)}</b><span>This ad's share</span><b>${pct(a.set_share, 0)} · #${a.set_rank} of ${sc.ads}</b></div>
      <div class="v2bar2"${tipAttr(`This ad: ${pct(a.set_share, 0)} of the set's spend`)}><i style="width:${Math.min(100, (a.set_share || 0) * 100).toFixed(1)}%"></i></div></div>` : '';
    const callLine = cx && cx.call ? `<div class="v2call"><span class="v2pill ${cx.call[1]}">${esc(cx.call[0])}</span>${cx.fr ? `<span class="v2pill"${tipAttr(esc(cx.fr[1]))}>${esc(cx.fr[0])}</span>` : ''}${cx.why ? `<p>${esc(cx.why)}</p>` : ''}</div>` : '';
    /* A full sheet (DESIGN.md): cover and Play on the left, the sections on the right, a sub-nav to jump. */
    const ICN = (n, s = 16) => window.icon ? window.icon(n, { size: s }) : '';
    panel.sheet = { navLabel: 'This ad',
      lead: `<span class="plead-th" data-thumb="${esc(a.id)}"${THUMBS.has(a.id) ? ` style="background-image:url('${THUMBS.get(a.id)}')"` : ''}></span>`,
      chip: `${cx && cx.call ? `<span class="ds-chip ${cx.call[1]}">${esc(cx.call[0])}</span>` : ''}<span class="ds-chip">${ICN(a.media_type === 'video' ? 'play-circle' : 'image', 14)}${a.media_type === 'video' ? 'Video' : a.media_type === 'carousel' ? 'Carousel' : 'Static'}</span>${a.age != null ? `<span class="ds-chip">${ICN('clock', 14)}${a.age} days</span>` : ''}` };
    const body = panel(a.name || 'Ad', `<div class="v2pv sheet-2"><div class="v2pv-media"><div class="v2pv-m" data-thumb="${esc(a.id)}"${THUMBS.has(a.id) ? ` style="background-image:url('${THUMBS.get(a.id)}')"` : ''}><button type="button" class="v2play" aria-label="Play">${ICN('play', 14)} Play</button></div></div>
      <div class="v2pv-main"><div data-sec="Results" data-ic="chart-column" class="v2pstat"><div><b>${kmoney(a.spend, cur)}</b><span>spend</span></div><div><b class="${!g.cpa || a.cpa == null ? '' : a.cpa <= g.cpa ? 'good' : 'bad'}">${money(a.cpa, cur)}</b><span>cost per purchase${g.cpa ? ` · goal ${money(g.cpa, cur)}` : ''}</span></div><div><b>${x2(a.roas)}</b><span>ROAS</span></div></div>
      <div class="v2kv"><span>Purchases</span><b><button type="button" class="v2cell" data-orders="1">${int(a.purchases)}</button></b><span>Revenue</span><b>${kmoney(a.revenue, cur)}</b><span>Hook · hold</span><b>${pct(a.hook, 0)} · ${pct(a.hold, 0)}</b><span>CTR · CPM</span><b>${pct(a.ctr, 2)} · ${money2(a.cpm, cur)}</b>${a.frequency ? `<span>Frequency</span><b>${a.frequency.toFixed(2)}</b>` : ''}${a.age != null ? `<span>Running</span><b>${a.age} days</b>` : ''}${a.angle ? `<span>Angle</span><b>${esc(a.angle)}</b>` : ''}${a.ltv_n >= 5 ? `<span>90-day value</span><b>${money(a.ltv90, cur)} · ${x2(a.ltv_x)} first order · ${int(a.ltv_n)} customers</b>` : ''}</div>
      ${callLine || setCard ? `<div data-sec="The call" data-ic="target" class="v2pv-sec">${callLine}${setCard}</div>` : ''}
      <div data-sec="Funnel" data-ic="activity" class="v2pv-sec">${gradeHtml(a, MED)}</div>
      ${a.n_ads > 1 ? `<p class="v2hint">The same ${a.media_type === 'video' ? 'video' : 'image'} runs in <b>${a.n_ads} ads</b>; the numbers above are all of them added up. Play, the breakdown and the Studio button use the one that spent most.</p>` : ''}
      ${a.tags ? `<div class="v2tags big">${TAG_DIMS.map(([k, l]) => a.tags[k] ? `<span${tipAttr(l)}>${esc(a.tags[k])}</span>` : '').join('')}${a.tags.message ? `<span class="msg"${tipAttr('The message, in a few words')}>“${esc(a.tags.message)}”</span>` : ''}</div>${a.tags.notes ? `<p class="v2hint">${esc(a.tags.notes)}</p>` : ''}` : ''}
      ${a.curve && a.curve[0] ? `<div data-sec="Watch time" data-ic="play-circle">${curveHtml(a.curve, CR_MEDC)}</div>` : ''}
      <div class="v2brk" id="v2brk" data-sec="Where it ran" data-ic="globe"><button type="button" class="v2link" data-brk="1">Where it ran and who saw it ›</button></div>
      <div class="v2copy" data-sec="Ad copy" data-ic="file-text">${x.headline || x.body ? `${x.headline ? `<b>${esc(x.headline)}</b>` : ''}${x.body ? `<p>${esc(x.body)}</p>` : ''}` : '<p class="v2hint">Reading the ad copy from Meta…</p>'}</div>
      <div class="v2gos" data-sec="Next steps" data-ic="sparkles">${window.StudioTab && window.StudioTab.iterate ? `<button type="button" class="v2go key" data-studio="1"><b>Make iterations</b><span>Locus writes three new versions of this ad from what it learned here and the brand brain, sets up Studio, and you press Make.</span><i>${ICN('chevron-right')}</i></button>` : ''}<button type="button" class="v2go" data-more="1"><b>Brief it in Asana instead</b><span>Locus drafts an Asana brief for three iterations, for the team to make.</span><i>${ICN('chevron-right')}</i></button></div>
      <p class="v2hint">${esc(MODEL_SHORT[H.S.model] || '')} for purchases and revenue; delivery is Meta's.</p></div></div>`);
    if (window.LocusShare) window.LocusShare.setExtra({ ad: a.id });   // the open ad is part of the address (share.js)
    body.querySelector('[data-more]').onclick = () => { const brand = (H.S.accounts.find(z => z.act_id === H.S.act) || {}).name || 'this brand'; H.AskUI.ask(`For ${brand}: draft an Asana brief for three iterations of the ad "${a.name}" (ad id ${a.id}). It spent ${kmoney(a.spend, cur)} at ${money(a.cpa, cur)} per purchase${g.cpa ? ` against a ${money(g.cpa, cur)} goal` : ''}, hook ${pct(a.hook, 0)}, hold ${pct(a.hold, 0)}. Keep what works, change one thing per iteration, and say which test it is.`); };
    loadThumbs(body, [a.id]).then(() => { const y = ASSETS.get(a.id) || {}; const lt = document.querySelector('#v2panel .plead-th'); if (lt && THUMBS.has(a.id)) lt.style.backgroundImage = `url('${THUMBS.get(a.id)}')`; const cp = body.querySelector('.v2copy'); if (cp && cp.querySelector('.v2hint')) cp.innerHTML = y.headline || y.body ? `${y.headline ? `<b>${esc(y.headline)}</b>` : ''}${y.body ? `<p>${esc(y.body)}</p>` : ''}` : '<p class="v2hint">Meta gave no copy for this ad.</p>'; if (panel.refit) panel.refit(); });
    body.querySelector('[data-orders]').onclick = () => drillOrders(a.name, `ad=${encodeURIComponent(a.id)}`);
    const stu = body.querySelector('[data-studio]');
    if (stu) stu.onclick = () => iterateStep(a, cur, g, cx, x);
    const brk = body.querySelector('[data-brk]');
    if (brk) brk.onclick = async () => { const box = body.querySelector('#v2brk'); box.innerHTML = '<p class="v2hint">Asking Meta…</p>';
      try { const w = CR_WIN || {}; const r = await H.apiAH(`/api/ad-breakdown?ad=${encodeURIComponent(a.id)}&from=${w.from}&to=${w.to}`); box.innerHTML = breakdownHtml(r, cur); if (panel.refit) panel.refit(); }
      catch (e) { box.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; } };
    if (window.SupplyStock && H.S.act !== 'all') window.SupplyStock.previewLine(body, H.S.act, a.id);
    const m = body.querySelector('.v2pv-m');
    /* PLAY = META'S OWN PREVIEW (Cole, 2026-10-09: the mp4 was slow to start). The preview link is
       asked for the moment the panel opens, so Play is usually instant. The iframe is Meta's fixed
       340x620 phone layout, shown at that size (.pvf). The mp4 is only the fallback. */
    const pv = PREVIEWS.get(a.id) || H.apiAH(`/api/ad-video?ad=${encodeURIComponent(a.id)}&mode=preview`).catch(e => ({ error: e.message }));
    PREVIEWS.set(a.id, pv);
    body.querySelector('.v2play').onclick = async () => {
      m.innerHTML = '<span class="v2hint" style="padding:14px">Loading the ad…</span>';
      try {
        const u = await pv; let link = u && u.preview, src = u && u.src;
        if (!link && !src) { const f = await H.adVideoUrl(a.id); src = typeof f === 'string' ? f : f && f.src; link = f && f.preview; if (!src && !link) throw new Error((f && f.reason) || (u && u.error) || 'Meta has no preview for this ad.'); }
        if (link) {
          m.classList.add('pvf'); m.style.backgroundImage = 'none';
          m.innerHTML = `<iframe src="${esc(link)}" scrolling="no" allow="autoplay; encrypted-media; fullscreen" allowfullscreen title="Meta's preview of this ad"></iframe>`;
        } else m.innerHTML = `<video src="${esc(src)}" controls autoplay playsinline></video>`;
      } catch (e) { m.innerHTML = ''; m.classList.add('still'); if (THUMBS.has(a.id)) m.style.backgroundImage = `url("${THUMBS.get(a.id)}")`; m.insertAdjacentHTML('beforeend', `<span class="v2pill">${esc(e.message)}</span>`); }
    };
  }

  /* MAKE ITERATIONS: ONE CLEAN STEP, NO POP-UP IN A POP-UP (2026-10-09, Cole: "shouldn't it do the research and set up
     Studio for me, and I just press go?"). The sheet turns into one page: what Locus learned about the ad (its call,
     the funnel grade, the weakest step, its tags, its copy), what the batch will test (picked from the weakest step,
     changeable), an optional "What should change?" box, and one button. Studio's brief reader (account-health
     studio-ai.js with the brand brain, the same reader the Slack ideas pipeline uses) writes the batch from that, the
     ad's own image becomes the base of every line, and Studio opens on the batch, planned, with one Make button. */
  const ITER_TESTS = [['headlines', 'New words', 'Same picture, three new headlines'], ['hooks', 'New opening', 'The first thing people read or hear'], ['offer', 'The offer', 'Same ad, the offer framed three ways'], ['visuals', 'New look', 'Same words, three new looks'], ['concepts', 'New ideas', 'Three different takes on the angle']];
  function weakOf(a, med) {
    if (!med) return null;
    const steps = [['hook', 'Hook', a.hook], ['hold', 'Hold', a.hold], ['ctr', 'Click', a.ctr], ['cvr', 'Purchase', cvrOf(a)]].filter(([k, , v]) => v != null && med[k]);
    if (steps.length < 2) return null;
    const w = steps.map(([k, l, v]) => ({ k, l, r: v / med[k] })).sort((p, q) => p.r - q.r)[0];
    return { ...w, fix: FIX[w.k] };
  }
  function iterateStep(a, cur, g, cx, x0) {
    const x = ASSETS.get(a.id) || x0 || {}, weak = weakOf(a, MED), video = a.media_type === 'video';
    const brand = (H.S.accounts.find(z => z.act_id === H.S.act) || {}).name || 'the brand';
    let test = !weak ? 'headlines' : weak.k === 'hook' ? (video ? 'hooks' : 'headlines') : weak.k === 'hold' ? 'visuals' : 'offer';
    const ICN = (n, s = 16) => window.icon ? window.icon(n, { size: s }) : '';
    const th = THUMBS.has(a.id) ? ` style="background-image:url('${THUMBS.get(a.id)}')"` : '';
    panel.sheet = { lead: `<span class="plead-th" data-thumb="${esc(a.id)}"${th}></span>`, chip: '<span class="ds-chip">Make iterations</span>',
      actions: '<button type="button" class="ds-btn ghost" data-back="1">‹ Back to the ad</button>' };
    const tags = a.tags ? TAG_DIMS.map(([k, l]) => a.tags[k] && a.tags[k] !== 'none' ? `<span${tipAttr(l)}>${esc(a.tags[k])}</span>` : '').join('') + (a.tags.message ? `<span class="msg">“${esc(a.tags.message)}”</span>` : '') : '';
    const body = panel(a.name || 'Ad', `<div class="v2it">
      <p class="v2say lead">Locus writes <b>three new versions</b> of this ad with what it learned below and the ${esc(brand)} brand brain, then opens Studio on them with everything filled in. You check it and press <b>Make</b>.</p>
      <section class="v2it-c"><h4>What Locus learned about this ad</h4>
        <div class="v2it-g"><div class="v2it-th" data-thumb="${esc(a.id)}"${th}><span>${video ? 'A frame of the video is the base' : 'This image is the base'}</span></div>
        <div><dl class="v2it-kv">
          ${cx && cx.call ? `<dt>The call</dt><dd><span class="v2pill ${cx.call[1]}">${esc(cx.call[0])}</span>${cx.why ? ` ${esc(cx.why)}` : ''}</dd>` : ''}
          <dt>Results</dt><dd>${kmoney(a.spend, cur)} spent, ${a.cpa == null ? 'no purchases' : `${money(a.cpa, cur)} a purchase`}${g.cpa ? ` against a ${money(g.cpa, cur)} goal` : ''}, ROAS ${x2(a.roas)}${a.hook != null ? `, hook ${pct(a.hook, 0)}, hold ${pct(a.hold, 0)}` : ''}, CTR ${pct(a.ctr, 2)}.</dd>
          ${weak ? `<dt>Weakest step</dt><dd><b>${esc(weak.l)}</b>, ${Math.round((1 - weak.r) * 100)}% under the brand's median ad. ${esc(weak.fix)}</dd>` : '<dt>Weakest step</dt><dd class="faint">Not enough ads in these dates to grade the funnel against.</dd>'}
          ${tags ? `<dt>Tags</dt><dd><div class="v2tags big">${tags}</div></dd>` : ''}
          ${x.headline || x.body ? `<dt>The copy</dt><dd class="v2it-copy">${x.headline ? `<b>${esc(x.headline)}</b>` : ''}${x.body ? `<p>${esc(x.body)}</p>` : ''}</dd>` : ''}
        </dl>${gradeHtml(a, MED).replace(/<p class="v2hint">[\s\S]*$/, '')}</div></div></section>
      <section class="v2it-c"><h4>What the three will test</h4><p class="v2hint">Picked from the weakest step. Change it if you know better.</p>
        <div class="v2it-t" role="radiogroup" aria-label="What the three will test">${ITER_TESTS.map(([k, l, s]) => `<button type="button" role="radio" aria-checked="${k === test}" class="${k === test ? 'on' : ''}" data-t="${k}"><b>${l}</b><span>${s}</span></button>`).join('')}</div>
        <label class="v2it-f">What should change? <small>Optional. Say it like you would to the designer.</small><textarea id="itChange" rows="2" placeholder="e.g. lead with the 30-day guarantee, less text on the image"></textarea></label></section>
      <div class="v2it-go"><button type="button" class="ds-btn primary" id="itGo">Write the three and open Studio</button><span class="v2hint" id="itMsg">About 10 cents to write. Nothing is spent on images until you press Make in Studio (about $1 for three).</span></div>
    </div>`);
    const back = document.querySelector('#v2panel [data-back]'); if (back) back.onclick = () => previewAd(a, cur, g, cx);
    body.querySelectorAll('.v2it-t [data-t]').forEach(b => b.onclick = () => { test = b.dataset.t; body.querySelectorAll('.v2it-t [data-t]').forEach(z => { z.classList.toggle('on', z === b); z.setAttribute('aria-checked', String(z === b)); }); });
    loadThumbs(body, [a.id]);
    const go = body.querySelector('#itGo'), msg = body.querySelector('#itMsg');
    go.onclick = async () => {
      const change = body.querySelector('#itChange').value.trim();
      const tl = (ITER_TESTS.find(t0 => t0[0] === test) || ITER_TESTS[0]);
      const lines = [
        `ITERATIONS OF A RUNNING AD for ${brand}. Lay out ONE batch with exactly 3 numbered lines; each line is one new ad.`,
        `The original ad: "${a.name}" (${video ? 'video' : a.media_type === 'carousel' ? 'carousel' : 'static image'}${a.age != null ? `, running ${a.age} days` : ''}). Its image is the base photo of every line: each new ad keeps that picture and replaces the words on it, so write each line as the words and the one change for that ad.`,
        `Results in ${H.rangeLabel ? H.rangeLabel() : 'the window'}: spend ${kmoney(a.spend, cur)}, ${a.purchases || 0} purchases, ${a.cpa == null ? 'no purchases yet' : `cost per purchase ${money(a.cpa, cur)}`}${g.cpa ? ` against a ${money(g.cpa, cur)} goal` : ''}, ROAS ${x2(a.roas)}, CTR ${pct(a.ctr, 2)}${a.hook != null ? `, hook ${pct(a.hook, 0)}, hold ${pct(a.hold, 0)}` : ''}.`,
        cx && cx.call ? `Locus's call on it: ${cx.call[0]}.${cx.why ? ` ${cx.why}` : ''}` : '',
        weak ? `Weakest step of its funnel against the brand's median ad: ${weak.l} (${Math.round((1 - weak.r) * 100)}% under). ${weak.fix}` : '',
        a.tags ? `What is in the ad (AI tags): ${TAG_DIMS.map(([k, l]) => a.tags[k] ? `${l}: ${a.tags[k]}` : '').filter(Boolean).join('; ')}${a.tags.message ? `; the message: "${a.tags.message}"` : ''}.` : '',
        x.headline || x.body ? `The ad's own copy on Meta: ${x.headline ? `headline "${x.headline}"` : ''}${x.body ? ` body "${String(x.body).slice(0, 600)}"` : ''}. This is the post copy, not the words on the image.` : '',
        `TESTING: ${test} (${tl[2].toLowerCase()}). Only that piece changes across the 3 lines; keep what works.`,
        change ? `WHAT THE TEAM WANTS CHANGED: ${change}` : 'The team gave no extra direction: work from the weakest step.',
        'Write the angle (the argument this ad makes, to one specific person), why (what we believe about that customer, from the brand brain), and each line in the brand’s voice. Name the batch "Iterations of" plus a few words.',
      ].filter(Boolean).join('\n');
      go.disabled = true; body.querySelector('#itChange').disabled = true; msg.innerHTML = '<span class="ds-pulse"></span> Reading the brand brain and the ad…';
      try {
        await window.StudioTab.iterate({ tok: H.S.tok, url: H.S.url, act: H.S.act, ad: a.id, name: a.name, text: lines, testing: test, change, n: 3, onStatus: t0 => { msg.innerHTML = `<span class="ds-pulse"></span> ${esc(t0)}…`; } });
        msg.textContent = 'Written. Opening Studio…';
        if (panel.close) panel.close();
        H.show('studio');
      } catch (e) { msg.innerHTML = `<span class="v2bad">${esc(e.message)}</span>`; go.disabled = false; body.querySelector('#itChange').disabled = false; go.textContent = 'Try again'; }
    };
    setTimeout(() => body.querySelector('#itChange')?.focus({ preventScroll: true }), 50);
  }

  /* WHERE PEOPLE STOP WATCHING (Motion's retention curve), as a share of the people who started watching.
     Dashed: the brand's average judged video in the same window. */
  function curveHtml(c, avg) {
    /* Short videos pass 25% before 3 seconds, so the curve is a share of its own peak, not of the 3-second count. */
    const peak = Math.max(...c.map(v => v || 0)) || 1, rel = c.map(v => (v || 0) / peak), top = 1, w = 340, h = 132, pl = 38, pr = 10, pt = 10, pb = 24;
    const X = i => pl + i * (w - pl - pr) / 4, Y = v => pt + (1 - v / top) * (h - pt - pb), L = ['3 sec', '25%', '50%', '75%', 'End'];
    const path = arr => arr.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    const end = rel[4], drop = [1, 2, 3, 4].map(i => [i, rel[i - 1] - rel[i]]).sort((p, q) => q[1] - p[1])[0];
    const say = `Of the people who started watching, <b>${pct(end, 0)}</b> reached the end${avg ? ` (the brand's average video: ${pct(avg[4], 0)})` : ''}. The biggest drop is between ${L[drop[0] - 1]} and ${L[drop[0]]}.`;
    return `<div class="v2curve"><h4>Where people stop watching</h4><p class="v2hint">${say}</p><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Watch drop-off">
      ${[0.25, 0.5, 0.75, 1].map(f => `<line x1="${pl}" x2="${w - pr}" y1="${Y(top * f)}" y2="${Y(top * f)}" stroke="var(--v2-grid)"/><text x="${pl - 6}" y="${Y(top * f) + 4}" font-size="11" text-anchor="end" fill="var(--muted)">${Math.round(top * f * 100)}%</text>`).join('')}
      ${L.map((l, i) => `<text x="${X(i)}" y="${h - 6}" font-size="11" text-anchor="middle" fill="var(--muted)">${l}</text>`).join('')}
      ${avg ? `<path d="${path(avg)}" fill="none" stroke="var(--muted)" stroke-dasharray="4 4" stroke-width="1.5"/>` : ''}
      <path d="${path(rel)}L${X(4)},${Y(0)}L${X(0)},${Y(0)}Z" fill="var(--brand)" fill-opacity=".12"/><path d="${path(rel)}" fill="none" stroke="var(--brand)" stroke-width="2.2"/>
      ${rel.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="3.5" fill="var(--brand)"${tipAttr(`${L[i]}: ${pct(v, 0)} still watching`)}/>`).join('')}</svg></div>`;
  }
  function breakdownHtml(r, cur) {
    if (r.error && !(r.placements || []).length) return `<p class="v2bad">${esc(r.error)}</p>`;
    const tbl = (rows, label) => { if (!rows || !rows.length) return ''; const tot = rows.reduce((x, b) => x + b.spend, 0) || 1, mx = Math.max(...rows.map(b => b.spend), 1);
      return `<h4>${label}</h4><div class="v2tbl"><table><thead><tr><th></th><th>Spend</th><th>CTR</th><th>CPM</th><th>Hook</th><th${tipAttr("Meta's own purchase count: Triple Whale cannot split by placement or age, so this column is only for comparing rows")}>Purchases*</th></tr></thead><tbody>${rows.filter(b => b.spend >= Math.max(1, tot * 0.01)).slice(0, 8).map(b => `<tr><td><b>${esc(b.key)}</b></td><td>${ib(b.spend, mx, null, `${kmoney(b.spend, cur)} · ${pct(b.spend / tot, 0)}`)}</td><td>${pct(b.impressions ? b.clicks / b.impressions : null, 2)}</td><td>${money2(b.impressions ? b.spend * 1000 / b.impressions : null, cur)}</td><td>${b.v3 && b.impressions ? pct(b.v3 / b.impressions, 0) : ' - '}</td><td>${int(b.meta_purchases)}</td></tr>`).join('')}</tbody></table></div>`; };
    return `${tbl(r.placements, 'By placement')}${tbl(r.people, 'By age and gender')}<p class="v2hint">*Purchases here are Meta's own count, the only source that splits by placement and age. Use them to compare rows, not as the ad's result.</p>`;
  }
  function compareAds(list, cur, goal, open) {
    if (list.length < 2) return;
    const rows = [['Spend', r => kmoney(r.spend, cur), r => r.spend, 0], ['Purchases', r => int(r.purchases), r => r.purchases, 1], ['CPA', r => r.cpa == null ? 'no sales' : money(r.cpa, cur), r => r.cpa, -1], ['ROAS', r => x2(r.roas), r => r.roas, 1],
      ['Hook', r => pct(r.hook, 0), r => r.hook, 1], ['Hold', r => pct(r.hold, 0), r => r.hold, 1], ['CTR', r => pct(r.ctr, 2), r => r.ctr, 1], ['CPM', r => money2(r.cpm, cur), r => r.cpm, -1], ['Running', r => r.age != null ? `${r.age} days` : ' - ', null, 0],
      ['Format', r => esc(r.tags?.format || ' - '), null, 0], ['Hook type', r => esc(r.tags?.hook || ' - '), null, 0], ['On screen', r => esc(r.tags?.person || ' - '), null, 0], ['Message', r => esc(r.tags?.message || ' - '), null, 0]];
    const best = (get, dir) => { if (!get || !dir) return null; const v = list.map(get).filter(x => x != null && isFinite(x)); if (v.length < 2) return null; return dir > 0 ? Math.max(...v) : Math.min(...v); };
    /* 2026-10-10 (Cole: "compare doesn't scroll and the pop-up is weird"): the same centred sheet as the ad preview. */
    panel.sheet = { lead: `<span class="lx-pv-lead">${window.icon ? window.icon('layout-grid', { size: 20 }) : ''}</span>`, chip: `<span class="ds-chip">${list.length} ads side by side</span>` };
    const body = panel(`Compare ${list.length} ads`, `<div class="v2cmp" style="grid-template-columns:110px repeat(${list.length},minmax(0,1fr))">
      <span></span>${list.map(r => `<button type="button" class="hd" data-open="${esc(r.id)}"><span class="cv" data-thumb="${esc(r.id)}"${THUMBS.has(r.id) ? ` style="background-image:url('${THUMBS.get(r.id)}')"` : ''}></span><b title="${esc(r.name)}">${esc(r.name)}</b></button>`).join('')}
      ${rows.map(([l, f, get, dir]) => { const b = best(get, dir); return `<span class="l">${l}</span>${list.map(r => `<span class="${b != null && get(r) === b ? 'best' : ''}">${f(r)}</span>`).join('')}`; }).join('')}</div>
      <p class="v2hint">Green is the best of the ${list.length} on that row. CPA and ROAS follow the attribution switch; delivery is Meta's.</p>`);
    body.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { const r = list.find(x => x.id === b.dataset.open); if (r) open(r); });
    loadThumbs(body, list.map(r => r.id));
  }
  /* Save this view to a dashboard: a block the dashboard redraws live with its own dates. */
  async function saveView(a, v) {
    const label = (SORT_DEF.find(x => x[0] === v.sort) || SORT_DEF[0])[1];
    const what = `${esc(a.name)} ads${v.ids.length ? `, just the ${v.ids.length} you picked` : ''}, sorted by ${label.toLowerCase()}${v.group ? ', one card per creative' : ''}${v.tag ? `, only ${esc(v.tag.v)}` : ''}`;
    const body = panel('Save this view to a dashboard', `<p class="v2hint">Loading your dashboards…</p>`);
    let list = []; try { list = ((await H.api(`/api/dashboards?act=${encodeURIComponent(a.act_id)}`)).dashboards || []).filter(x => !x.act || x.act === a.act_id); } catch {}
    body.innerHTML = `<p class="v2say">Saves <b>${what}</b>. It redraws live every time the dashboard opens, with the dashboard's own dates.</p>
      <label class="v2hint" style="display:block;margin:10px 0">Title on the dashboard<input type="text" id="svT" value="${esc(`${a.name}: top ads by ${label.toLowerCase()}`)}" style="width:100%"></label>
      <div class="v2gos">${list.map(x => `<button type="button" class="v2go" data-dash="${esc(x.id)}"><b>${esc(x.name)}</b><span>${(x.spec?.blocks || []).length} blocks${x.schedule ? ', posts to Slack' : ''}</span><i>+</i></button>`).join('')}
        <div class="v2go" style="cursor:default"><b>A new dashboard</b><span><input type="text" id="svN" placeholder="Name, e.g. ${esc(a.name)} creative" style="width:100%;margin-top:6px"></span><button type="button" class="btn primary" id="svNew" style="margin-top:8px">Make it</button></div></div>
      <p class="v2hint" id="svMsg"></p>`;
    const block = () => ({ type: 'ads', title: body.querySelector('#svT').value.trim() || 'Ads', act: a.act_id, sort: v.sort, group: v.group, n: 8, tag: v.tag, ids: v.ids });
    const msg = t => { body.querySelector('#svMsg').textContent = t; };
    const done = id => { msg('Saved.'); body.insertAdjacentHTML('beforeend', `<button type="button" class="v2link" id="svGo">Open the dashboard ›</button>`); body.querySelector('#svGo').onclick = () => { try { localStorage.setItem('pf_dash', id); } catch {} location.href = `?open=dash&id=${encodeURIComponent(id)}`; }; };
    body.querySelectorAll('[data-dash]').forEach(b => b.onclick = async () => { msg('Saving…');
      try { const dd = await H.api(`/api/dashboard?id=${encodeURIComponent(b.dataset.dash)}`); const spec = dd.spec || {}; spec.blocks = (spec.blocks || []).concat(block()).slice(-10);
        const r = await H.api('/api/dashboard', { method: 'PUT', body: JSON.stringify({ id: dd.id, name: dd.name, act: dd.act || 'all', spec, schedule: dd.schedule || '', channel: dd.channel || '', for_who: dd.for_who || '', pinned: dd.pinned }) }); done(r.id || dd.id); }
      catch (e) { msg(e.message); } });
    body.querySelector('#svNew').onclick = async () => { const name = body.querySelector('#svN').value.trim(); if (!name) { msg('Give the new dashboard a name.'); return; } msg('Saving…');
      try { const r = await H.api('/api/dashboard', { method: 'PUT', body: JSON.stringify({ name, act: a.act_id, spec: { scope: a.act_id, range: '7', compare: 'prev', blocks: [block()] }, schedule: '', channel: '', for_who: '', pinned: true }) }); done(r.id); }
      catch (e) { msg(e.message); } };
  }
  /* A saved ads view on a dashboard (index.html calls this after paint). */
  async function adsBlock(el, b, q, host) {
    if (!H) H = host;
    try {
      const d = await H.api(`/api/hub/creative?act=${encodeURIComponent(b.act)}&${q}&model=lastPlatformClick`);
      const cur = d.currency, goal = d.goals?.cpa || null, bar = goal || 50;
      let L = b.group ? groupAds(d.ads || []) : (d.ads || []);
      if (b.tag) L = L.filter(r => r.tags && r.tags[b.tag.k] === b.tag.v);
      if (b.ids && b.ids.length) L = L.filter(r => b.ids.includes(r.id) || (r.ids || []).some(x => b.ids.includes(x)));
      const list = sortAds(L, b.sort || 'spend', bar).list.slice(0, b.n || 8);
      el.innerHTML = `<div class="v2h"><h3>${esc(b.title || 'Ads')}</h3><span class="cap"><button type="button" class="v2link" data-opencr="1">Open in Creative ›</button></span></div>
        ${list.length ? `<div class="v2gal">${list.map(r => `<div class="g"><div class="th" data-thumb="${esc(r.id)}"></div><div class="b"><b title="${esc(r.name)}">${esc(r.name)}</b>${r.n_ads > 1 ? `<div class="v2tags"><span class="n">In ${r.n_ads} ads</span></div>` : ''}<div class="kv"><span>Spend</span><b>${kmoney(r.spend, cur)}</b><span>CPA</span><b class="${r.cpa == null || !goal ? '' : r.cpa <= goal ? 'good' : 'bad'}">${r.cpa == null && r.spend > 0 ? 'no sales' : money(r.cpa, cur)}</b><span>ROAS</span><b>${x2(r.roas)}</b><span>Hook</span><b>${pct(r.hook, 0)}</b></div></div></div>`).join('')}</div>` : '<p class="v2hint">No ads match in these dates.</p>'}`;
      el.querySelector('[data-opencr]').onclick = () => { location.href = `?open=adcreative&act=${encodeURIComponent(b.act)}`; };
      loadThumbs(el, list.map(r => r.id), b.act);
    } catch (e) { el.innerHTML = `<div class="v2h"><h3>${esc(b.title || 'Ads')}</h3></div><p class="v2bad">${esc(e.message)}</p>`; }
  }

  /* ---------- the read: insight strip + one paragraph, from the numbers on screen ---------- */
  const READS = {};
  function readSlot(id) { return `<div id="${id}" class="v2read"><div class="v2strip">${[0, 1, 2].map(() => '<div class="v2ins sk"><i></i><div><b></b><span></span></div></div>').join('')}</div><p class="v2say sk"><span></span></p></div>`; }
  async function fillRead(id, screen, scope, facts, links) {
    /* Client logins see the read too (the brand edition, 2026-10-10); it counts against their daily assistant limit. */
    const key = JSON.stringify([screen, scope, facts]); const t = H.RUN();
    try {
      const r = READS[key] || (READS[key] = await H.apiAH('/api/read', { method: 'POST', body: JSON.stringify({ screen, scope, range: H.rangeLabel(), compare: cmpLabel(), facts }) }));
      if (t !== H.RUN()) return; const el = document.getElementById(id); if (!el) return;
      if (r.error) { el.innerHTML = `<p class="v2say quiet">${esc(r.error)}</p>`; return; }
      const items = (r.leaks || []).slice(0, 3);
      const tone = i => i === 0 ? 'bad' : 'warn';
      el.innerHTML = `${items.length ? `<div class="v2strip">${items.map((l, i) => `<div class="v2ins"><i style="background:var(--${tone(i)})"></i><div><b>${esc(l.where || 'Watch')}</b><span>${esc(l.what)}</span></div></div>`).join('')}</div>` : ''}
        <p class="v2say">${esc((r.lines || []).join(' '))}${r.focus ? ` <b>Today: ${esc(r.focus)}</b>` : ''} <button type="button" class="v2link" data-ask="1">Ask about this ›</button></p>`;
      el.querySelector('[data-ask]').onclick = () => H.AskUI.open(`About the ${screen} screen for ${scope} (${H.rangeLabel()}): `);
    } catch (e) { const el = document.getElementById(id); if (el && t === H.RUN()) el.innerHTML = `<p class="v2say quiet">The read could not run: ${esc(e.message)}</p>`; }
  }

  /* What moved yesterday, against the same weekday over 8 weeks (hub.js movedMany). */
  /* Clicking a moved number opens the page that explains it, for that brand. */
  const MOVED_TAB = { rev: 'store', o: 'store', aov: 'store', mer: 'channels', sp: 'channels', cac: 'customers' };
  /* THE YESTERDAY LINE (2026-10-09): replaces the What moved card. One line on Home; the full view is Home > Yesterday
     (desk.js, /api/hub/yesterday): every brand judged against its own same weekday, the reason, and whether it was the market. */
  async function movedCard(scope) {
    /* THE DAY CHECK LINE (2026-10-09): was yesterday a bad day ON META (account-health /api/metaday). */
    /* A client sees the market answer too (the brand edition, 2026-10-10); its brand rows are filtered to theirs. */
    const t = H.RUN(); let m;
    try { m = await H.apiAH('/api/metaday?days=14'); } catch { return; }
    const host = document.getElementById('v2moved'); if (t !== H.RUN() || !host) return;
    const L = m.latest; if (!L) return;
    const nice = new Date(L.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const V = { normal: ['Normal day on Meta', 'good'], mixed: ['Mixed signals on Meta', 'warn'], bad: ['Bad day on Meta', 'bad'], vbad: ['Very bad day on Meta', 'bad'] }[L.verdict] || ['Normal day on Meta', 'good'];
    host.innerHTML = `<div class="v2note v2yline"><b>${esc(nice)}</b><span class="v2pill ${V[1]}">${V[0]}</span><span>${L.hits} of 4 signs agree.</span>
      <button type="button" class="v2link" data-go="yesterday" style="margin-left:auto">Open Day check ›</button></div>`;
    if (!document.getElementById('v2ycss')) { const st = document.createElement('style'); st.id = 'v2ycss'; st.textContent = '.v2yline{display:flex;gap:10px;align-items:center;flex-wrap:wrap}'; document.head.appendChild(st); }
    wireGo(host);
  }

  /* ---------- shared: the brand list helpers ---------- */
  const scopeAccts = () => H.S.act === 'all' ? H.S.accounts.slice() : H.S.accounts.filter(a => a.act_id === H.S.act);
  const oneCur = list => { const c = [...new Set(list.map(a => a.currency))]; return c.length === 1 ? c[0] : null; };
  const head = (tab, title) => H.pageHead(tab, title).replace(/<p class="ph-sub">[\s\S]*?<\/p>/, '');
  const shell = (tab, title, body) => `<div class="v2">${head(tab, title)}${body}</div>`;
  const wireGo = root => root.querySelectorAll('[data-go]').forEach(el => { const go = () => { const g = el.dataset.go; if (g.startsWith('act:')) { const [, id, tab] = g.split(':'); pickAct(id, tab); } else H.show(g); }; el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter') go(); }; });
  function pickAct(id, tab) { H.S.act = id; try { localStorage.setItem('pf_act', id); } catch {} const cp = document.getElementById('clientPick'); if (cp) cp.value = id; H.show(tab || H.S.tab); }
  const wireRows = (root, tab) => root.querySelectorAll('tr[data-act]').forEach(tr => { tr.onclick = () => pickAct(tr.dataset.act, tab); tr.onkeydown = e => { if (e.key === 'Enter') pickAct(tr.dataset.act, tab); }; });

  /* =========================================================================================
   * HOME
   * ======================================================================================= */
  async function home(first) {
    const t = H.RUN(); const all = scopeAccts(); const one = H.S.act !== 'all' ? all[0] : null; const cur = oneCur(all);
    const scope = one ? one.name : `all ${all.length} brands`;
    const title = one ? `Overview: ${esc(one.name)}` : 'Overview';
    if (first) $('#main').innerHTML = shell('overview', title, skPage({ tiles: 8 }));
    let ch = null, st = null;
    try { [ch, st] = await Promise.all([get(`/api/hub/paid?platform=all&act=${encodeURIComponent(H.S.act)}&${H.rangeQ()}${modelQ()}`).catch(() => null), get(`/api/hub/store?act=${encodeURIComponent(H.S.act)}&${H.rangeQ()}`).catch(() => null)]); } catch {}
    if (t !== H.RUN()) return;
    /* Totals from the host snapshot (the same numbers every other screen uses). */
    const sum = (src, get) => { let x = 0, any = false; for (const a of all) { const w = a[src]; if (!w) continue; const v = get(w, a); if (v != null && isFinite(v)) { x += v; any = true; } } return any ? x : null; };
    const T = src => { const r = { sales: sum(src, w => w.sales), spend: sum(src, w => w.spend), orders: sum(src, w => w.orders), newRev: sum(src, w => w.new_rev), newOrd: sum(src, w => w.new_orders), cm: sum(src, (w, a) => (a.cost_health?.verdict === 'broken' ? null : w.cm)) }; r.mer = r.spend ? r.sales / r.spend : null; r.amer = r.spend && r.newRev != null ? r.newRev / r.spend : null; r.aov = r.orders ? r.sales / r.orders : null; r.cac = r.newOrd ? r.spend / r.newOrd : null; r.newShare = r.sales && r.newRev != null ? r.newRev / r.sales : null; r.cmPct = r.sales && r.cm != null ? r.cm / r.sales : null; return r; };
    const c = T('window'), p = all.some(a => a.prev) && H.S.cmp !== 'none' ? T('prev') : {};
    /* CM per day leaves out a brand whose cost data is broken, exactly like the CM tile's total. */
    const merge = k => mergeDays(all.map(a => (a[k] || []).map(r => (a.cost_health?.verdict === 'broken' ? { ...r, cm: null } : r))), ['sales', 'spend', 'orders', 'new_orders', 'new_rev', 'cm']);
    const rows = merge('series'), prev = H.S.cmp !== 'none' ? merge('prev_series') : [];
    for (const r of rows.concat(prev)) { r.mer = r.spend ? r.sales / r.spend : null; r.aov = r.orders ? r.sales / r.orders : null; r.amer = r.spend && r.new_rev != null ? r.new_rev / r.spend : null; r.cac = r.new_orders ? r.spend / r.new_orders : null; }
    const withPlan = all.filter(a => a.plan?.sales != null && a.mtd?.sales != null);
    const mtd = withPlan.reduce((s, a) => ({ sales: s.sales + (a.mtd.sales || 0), plan: s.plan + (a.plan.sales || 0), spend: s.spend + (a.mtd.spend || 0), pspend: s.pspend + (a.plan.spend || 0) }), { sales: 0, plan: 0, spend: 0, pspend: 0 });
    const goalMer = one ? (one.goals?.sales && one.goals?.spend ? one.goals.sales / one.goals.spend : one.target_roas) : null;
    const goalCac = one?.target_cpa || null;
    const planPerDay = one && one.goals?.sales ? one.goals.sales / new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() : null;
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(), elapsed = new Date().getDate() - 1 || 1;
    const pace = mtd.plan ? { pct: mtd.sales / mtd.plan, landing: mtd.sales / elapsed * daysInMonth, full: mtd.plan / elapsed * daysInMonth } : null;

    /* Channels under the model, plus the platform's own number and the gap. */
    const chRows = (() => { if (!ch || !ch.brands) return []; const by = {}; for (const b of ch.brands) for (const r of b.rows) { const o = by[r.id] ||= { id: r.id, label: r.label, spend: 0, revenue: 0, platform_revenue: 0, prev_revenue: 0, purchases: 0, nc: 0, hasP: false, hasPrev: false }; o.spend += r.spend || 0; o.revenue += r.revenue || 0; if (r.platform_revenue != null) { o.platform_revenue += r.platform_revenue; o.hasP = true; } if (r.prev_revenue != null) { o.prev_revenue += r.prev_revenue; o.hasPrev = true; } o.purchases += r.purchases || 0; o.nc += r.nc || 0; } return Object.values(by); })();
    const chSeries = (() => { if (!ch || !ch.brands) return []; const m = new Map(); for (const b of ch.brands) for (const r of (b.series || [])) { const o = m.get(r.date) || { date: r.date, meta: 0, google: 0, tiktok: 0 }; o.meta += r.meta || 0; o.google += r.google || 0; o.tiktok += r.tiktok || 0; m.set(r.date, o); } return [...m.values()].sort((x, y) => x.date < y.date ? -1 : 1); })();
    for (let i = chRows.length - 1; i >= 0; i--) if (chRows[i].id === 'rest' && !(chRows[i].revenue > 0)) chRows.splice(i, 1);
    const credited = chRows.reduce((s, r) => s + (r.revenue || 0), 0) || 1;
    const maxRev = Math.max(...chRows.map(r => r.revenue || 0), 1);
    const S0 = st && st.brands ? st.brands : [];
    const fun = S0.reduce((s, b) => { const x = b.cur || {}, y = b.prev || {}; s.ses += x.sessions || 0; s.cart += x.carts || 0; s.ord += x.orders || 0; s.pses += y.sessions || 0; s.pcart += y.carts || 0; s.pord += y.orders || 0; return s; }, { ses: 0, cart: 0, ord: 0, pses: 0, pcart: 0, pord: 0 });

    const km = v => kmoney(v, cur), mo = v => money(v, cur);
    const tiles = cur ? `<div class="v2tiles home8">
      ${tile({ hero: true, label: 'Revenue', src: 'SHOPIFY', hint: 'total sales minus tax', value: kmoney(c.sales, cur), delta: delta(c.sales, p.sales), sub: `${p.sales ? `${kmoney(p.sales, cur)} ${cmpLabel()}` : 'Shopify total sales minus tax'}`, spark: tspark(rows, prev, 'sales', km, 'revenue'),
        bullet: pace ? `<div class="v2bul"${tipAttr(`Month so far ${kmoney(mtd.sales, cur)} against ${kmoney(mtd.plan, cur)} planned by now. At this pace the month lands at ${kmoney(pace.landing, cur)}; the tick is the full month plan.`)}><div class="trk"><i style="width:${Math.min(100, pace.landing / Math.max(pace.full, pace.landing) * 100 * 0.8).toFixed(1)}%;background:${pace.pct >= 0.98 ? 'var(--good)' : pace.pct >= 0.85 ? 'var(--warn)' : 'var(--bad)'}"></i><b style="left:${(pace.full / Math.max(pace.full, pace.landing) * 80).toFixed(1)}%"></b></div><div class="lb">Month so far ${kmoney(mtd.sales, cur)} of ${kmoney(mtd.plan, cur)} planned by now · pace to ${kmoney(pace.landing, cur)}</div></div>` : '', go: 'store' })}
      ${tile({ label: 'Orders', src: 'SHOPIFY', hint: 'paid orders', value: int(c.orders), delta: delta(c.orders, p.orders), sub: `AOV ${money2(c.aov, cur)} ${delta(c.aov, p.aov)}`, spark: tspark(rows, prev, 'orders', int, 'orders'), go: 'store' })}
      ${tile({ label: 'Ad spend', src: 'TW', hint: 'every platform', value: kmoney(c.spend, cur), delta: delta(c.spend, p.spend, 'n'), sub: p.spend ? `${kmoney(p.spend, cur)} ${cmpLabel()}` : 'Meta, Google, TikTok and the rest', spark: tspark(rows, prev, 'spend', km, 'ad spend'), go: 'channels' })}
      ${tile({ label: 'MER', src: 'BLENDED', hint: 'revenue ÷ all ad spend', value: x2(c.mer), delta: delta(c.mer, p.mer), bullet: bullet(c.mer, goalMer, false, goalMer ? `goal ${x2(goalMer)}` : ''), sub: `${kmoney(c.sales, cur)} on ${kmoney(c.spend, cur)}`, spark: tspark(rows, prev, 'mer', x2, 'MER'), go: 'channels' })}
      ${tile({ label: 'aMER', src: 'BLENDED', hint: 'new-customer revenue ÷ ad spend', value: x2(c.amer), delta: delta(c.amer, p.amer), sub: `${kmoney(c.newRev, cur)} from first orders`, spark: tspark(rows, prev, 'amer', x2, 'aMER'), go: 'customers' })}
      ${tile({ label: 'New customers', src: 'TW', hint: 'first paid orders', value: int(c.newOrd), delta: delta(c.newOrd, p.newOrd), sub: `${pct(c.newShare, 0)} of revenue from first orders`, spark: tspark(rows, prev, 'new_orders', int, 'new customers'), go: 'customers' })}
      ${tile({ label: 'Cost per new customer', src: 'TW', hint: 'lower is better', value: money(c.cac, cur), delta: delta(c.cac, p.cac, true), bullet: bullet(c.cac, goalCac, true, goalCac ? `goal ${money(goalCac, cur)}` : ''), sub: `${int(c.newOrd)} first orders`, spark: tspark(rows, prev, 'cac', mo, 'cost per new customer'), go: 'customers' })}
      ${tile({ label: 'Contribution margin', src: 'TW', hint: 'after every variable cost', value: kmoney(c.cm, cur), delta: delta(c.cm, p.cm), sub: c.cmPct != null ? `${pct(c.cmPct, 0)} of revenue` : 'cost data needed', spark: c.cm != null ? tspark(rows, prev, 'cm', km, 'contribution margin') : '', go: 'profit' })}
    </div>` : `<div class="v2card"><p class="v2hint">These brands report in different currencies (${esc([...new Set(all.map(a => a.currency))].join(', '))}), so there is no combined total. Pick one brand, or read the table below.</p></div>`;

    const chart = cur && rows.length > 1 ? card('Revenue by day', `${rows.length} days${p.sales ? `, ${delta(c.sales, p.sales).replace(/<[^>]+>/g, '')} against ${cmpLabel()}` : ''}.`,
      legend([{ color: '--brand', label: 'This period' }, ...(prev.length ? [{ dash: true, label: cmpLabel() }] : []), ...(planPerDay ? [{ color: '--warn', label: 'Plan per day' }] : []), { color: '--c-google', label: 'Ad spend' }]) +
      lineChart('v2rev', rows.map(r => ({ ...r, v: r.sales, s: r.spend })), { key: 'v', key2: 's', prev: prev.map(r => ({ ...r, v: r.sales })), plan: planPerDay, cur })) : '';

    const funnel = fun.ses ? card('Site funnel', `${pct(fun.ord / fun.ses, 2)} of sessions became an order${fun.pses ? `, against ${pct(fun.pord / fun.pses, 2)} before` : ''}.`, `<div class="v2fun">
        ${[['Sessions', fun.ses, fun.pses, null, `${money2(c.spend / fun.ses, cur)} per session`], ['Added to cart', fun.cart, fun.pcart, fun.cart / fun.ses, `${pct(fun.cart / fun.ses)} of sessions`], ['Orders', fun.ord, fun.pord, fun.ord / fun.cart, `${pct(fun.ord / Math.max(1, fun.cart))} of carts`]]
          .map(([l, v, pv, rate, sub]) => `<div class="fs"><div class="l">${l}</div><div class="v">${int(v)}${delta(v, pv)}</div><div class="r">${sub}</div><div class="bar"${tipAttr(`${l}: ${int(v)} now, ${int(pv)} ${esc(cmpLabel())}`)}><i class="g" style="width:${(pv / Math.max(fun.ses, fun.pses) * 100).toFixed(1)}%"></i><i style="width:${(v / Math.max(fun.ses, fun.pses) * 100).toFixed(1)}%"></i></div></div>`).join('')}
      </div>`, 'Triple Whale pixel; sessions are derived from its cost per session') : '';

    const chTable = chRows.length ? card('Where revenue came from', isPlat() ? 'On the platforms’ own numbers.' : `Credited under ${esc(MODEL_SHORT[H.S.model])}; the platform’s own figure sits beside it.`,
      `<div class="v2stackbar">${chRows.filter(r => r.revenue > 0).map(r => `<i style="flex:${r.revenue};background:var(${CH[r.id] || '--c-else'})"${tipAttr(`<b>${esc(r.label)}</b> · ${kmoney(r.revenue, cur)} · ${pct(r.revenue / credited, 0)} of credited revenue${r.spend ? ` · ROAS ${x2(r.revenue / r.spend)}` : ''}`)}></i>`).join('')}</div>
       <div class="v2stacklab">${chRows.filter(r => r.revenue > 0).map(r => `<span><i style="background:var(${CH[r.id] || '--c-else'})"></i>${esc(r.label)} ${pct(r.revenue / credited, 0)}</span>`).join('')}</div>
       <div class="v2tbl"><table><thead><tr><th>Channel</th><th>Spend</th><th>Revenue</th><th>Platform says</th><th>Gap</th><th>Share of revenue</th><th>ROAS</th><th>First orders</th><th>vs before</th></tr></thead><tbody>
        ${chRows.map(r => { const gap = !isPlat() && r.hasP && r.spend ? r.revenue - r.platform_revenue : null; return `<tr${r.id === 'meta' || r.id === 'google' || r.id === 'tiktok' ? ` data-go="${r.id}" class="link"` : ''}><td><span class="sw" style="background:var(${CH[r.id] || '--c-else'})"></span>${esc(r.label)}</td>
          <td>${r.spend ? kmoney(r.spend, cur) : '<span class="faint">no spend</span>'}</td><td>${ib(r.revenue, maxRev, CH[r.id] || '--c-else', kmoney(r.revenue, cur))}</td>
          <td class="faint">${r.hasP && r.spend ? kmoney(r.platform_revenue, cur) : '–'}</td><td class="${gap == null ? '' : gap >= 0 ? 'good' : 'bad'}">${gap == null ? '–' : (gap >= 0 ? '+' : '−') + kmoney(Math.abs(gap), cur)}</td>
          <td>${c.sales ? pct(r.revenue / c.sales, 0) : '–'}</td><td>${r.spend ? x2(r.revenue / r.spend) : '–'}</td><td>${int(r.nc)}</td><td>${r.hasPrev ? delta(r.revenue, r.prev_revenue) : ''}</td></tr>`; }).join('')}
       </tbody></table></div>` + foot('Spend is each platform’s own. Revenue follows the attribution switch in the top bar. Click models let two platforms claim one order, so channels can add up to more than revenue; that is why MER exists.'), `Attribution: <b>${esc(MODEL_SHORT[H.S.model])}</b>`) : '';

    const spendStack = chSeries.length > 1 && cur ? card('Ad spend by platform, by day', '', legend([{ color: '--c-meta', label: 'Meta' }, { color: '--c-google', label: 'Google' }, { color: '--c-tiktok', label: 'TikTok' }]) + stackChart('v2pstack', chSeries, [{ key: 'meta', label: 'Meta', color: '--c-meta' }, { key: 'google', label: 'Google', color: '--c-google' }, { key: 'tiktok', label: 'TikTok', color: '--c-tiktok' }], { cur, h: 170 })) : '';

    /* Agency view: a small chart per brand on one scale, then the table. */
    const multiples = !one && all.length > 1 ? (() => { const mx = Math.max(...all.flatMap(a => (a.series || []).map(r => r.sales || 0)), 1);
      return card('Each brand, revenue by day', 'One scale, so the sizes compare. Click one to open it.', `<div class="v2mult">${all.slice().sort((x, y) => (y.window?.sales || 0) - (x.window?.sales || 0)).map(a => { const s = a.series || []; const pts = s.map((r, i) => `${(i / Math.max(1, s.length - 1) * 200).toFixed(1)},${(56 - (r.sales || 0) / mx * 50).toFixed(1)}`).join(' ');
        return `<button type="button" class="m" data-go="act:${esc(a.act_id)}"><span class="n">${esc(a.name)}</span><span class="v">${kmoney(a.window?.sales, a.currency)} ${a.prev ? delta(a.window?.sales, a.prev?.sales) : ''}</span><svg viewBox="0 0 200 60" preserveAspectRatio="none" data-spk="${esc(JSON.stringify(s.map(r => `<b>${esc(a.name)}</b> · ${day(r.date)} · ${kmoney(r.sales, a.currency)}`)))}"><polyline points="${pts}" fill="none" stroke="var(--brand)" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg></button>`; }).join('')}</div>`); })() : '';
    /* The small charts per brand became a column here (2026-10-09): one card for the brands, not two. Same scale as before: each brand's own. */
    const sparkRow = a => { const sr = a.series || []; if (sr.length < 2) return ''; const mx = Math.max(...sr.map(r => r.sales || 0), 1);
      const pts = sr.map((r, i) => `${(i / (sr.length - 1) * 90).toFixed(1)},${(22 - (r.sales || 0) / mx * 20).toFixed(1)}`).join(' ');
      return `<svg viewBox="0 0 90 24" width="90" height="24" preserveAspectRatio="none" data-spk="${esc(JSON.stringify(sr.map(r => `<b>${day(r.date)}</b> ${kmoney(r.sales, a.currency)}`)))}"><polyline points="${pts}" fill="none" stroke="var(--brand)" stroke-width="1.5"/></svg>`; };
    /* THE COMMAND CENTER (2026-10-09, command.js): for the team on All clients, one row per brand sorted by what needs
       attention, with the reasons and one AI read across brands. It replaces the brand table and the screen read here. */
    const cmdOn = !one && all.length > 1 && H.S.role !== 'client' && !!window.CommandCenter;
    const brandTable = !cmdOn && !one && all.length > 1 ? card('Each brand', '', `<div class="v2tbl"><table><thead><tr><th>Brand</th><th>By day</th><th>Revenue</th><th>MTD vs plan</th><th>Ad spend</th><th>MER</th><th>New %</th><th>CAC</th><th>Contribution</th></tr></thead><tbody>
        ${all.slice().sort((x, y) => (y.window?.sales || 0) - (x.window?.sales || 0)).map(a => { const w = a.window || {}; const off = a.plan?.sales && a.mtd?.sales != null ? a.mtd.sales / a.plan.sales - 1 : null;
          return `<tr data-act="${esc(a.act_id)}" tabindex="0" class="link"><td><b>${esc(a.name)}</b></td><td>${sparkRow(a)}</td><td>${kmoney(w.sales, a.currency)} ${a.prev ? delta(w.sales, a.prev.sales) : ''}</td><td>${off == null ? '<span class="faint">no plan</span>' : `<span class="v2pill ${off >= 0 ? 'good' : off > -0.08 ? 'warn' : 'bad'}">${off >= 0 ? '+' : ''}${Math.round(off * 100)}%</span>`}</td>
            <td>${kmoney(w.spend, a.currency)}</td><td>${x2(w.mer)}</td><td>${pct(w.new_share, 0)}</td><td>${money(w.cac, a.currency)}</td><td class="${w.cm == null ? '' : w.cm >= 0 ? 'good' : 'bad'}">${a.cost_health?.verdict === 'broken' ? '<span class="faint">cost data</span>' : kmoney(w.cm, a.currency)}</td></tr>`; }).join('')}
      </tbody></table></div>`) : '';

    $('#main').innerHTML = shell('overview', title, `<div id="v2moved"></div>${cmdOn ? '<div id="v2cmd"></div>' : ''}<div id="v2needs"></div><div id="v2cal"></div>${cmdOn ? '' : readSlot('v2read')}${tiles}
      <div class="v2two">${chart}${funnel}</div>${chTable}${brandTable}
      ${foot(`Revenue, orders, AOV, first orders and the compare deltas come from Shopify through Triple Whale for ${esc(H.rangeLabel())}. Channel revenue follows the attribution switch. Click any tile to open its screen.`)}`);
    const root = $('#main');
    wireGo(root); wireRows(root, 'overview');
    movedCard(scope);
    if (cmdOn) window.CommandCenter.render(document.getElementById('v2cmd'), H, all);
    if (window.DeskTab && window.DeskTab.needs && H.S.role !== 'client') window.DeskTab.needs(document.getElementById('v2needs'), H, all);
    /* The calendar (2026-10-09): what is live and coming up, and each date as a shaded band on the revenue chart. */
    if (window.CalendarTab) {
      window.CalendarTab.homeCard(document.getElementById('v2cal'), H);
      if (rows.length > 1) window.CalendarTab.bandsFor(H.S.act || 'all', rows[0].date, rows[rows.length - 1].date, H).then(b => addBands('v2rev', rows, b)).catch(() => {});
    }
    if (rows.length > 1) wireLine('v2rev', rows, { tip: (r, i) => `<b>${day(r.date)}</b> · revenue ${kmoney(r.sales, cur)} · spend ${kmoney(r.spend, cur)}${r.spend ? ` · MER ${x2(r.sales / r.spend)}` : ''}${prev[i] ? `<br><span class="faint">${esc(cmpLabel())}: ${kmoney(prev[i].sales, cur)} on ${day(prev[i].date)}</span>` : ''}` });
    if (false && chSeries.length > 1) wireStack('v2pstack', chSeries, [{ key: 'meta', label: 'Meta', color: '--c-meta' }, { key: 'google', label: 'Google', color: '--c-google' }, { key: 'tiktok', label: 'TikTok', color: '--c-tiktok' }], cur);
    if (!cmdOn && cur && c.sales != null) fillRead('v2read', 'overview', scope, { currency: cur, revenue: c.sales, revenue_compare: p.sales, orders: c.orders, aov: c.aov, ad_spend: c.spend, ad_spend_compare: p.spend, mer: c.mer, mer_goal: goalMer, cac: c.cac, cac_compare: p.cac, cac_goal: goalCac, new_customer_share: c.newShare, contribution_margin: c.cm,
      month_to_date: mtd.plan ? { revenue: mtd.sales, planned_by_now: mtd.plan } : null, site: fun.ses ? { sessions: fun.ses, carts: fun.cart, orders: fun.ord, sessions_before: fun.pses, orders_before: fun.pord } : null,
      channels: chRows.map(r => ({ channel: r.label, spend: r.spend, revenue: r.revenue, platform_says: r.hasP ? r.platform_revenue : null, revenue_before: r.hasPrev ? r.prev_revenue : null })),
      brands: one ? undefined : all.map(a => ({ name: a.name, revenue: a.window?.sales, revenue_before: a.prev?.sales, mer: a.window?.mer, mtd_vs_plan: a.plan?.sales && a.mtd?.sales != null ? Math.round((a.mtd.sales / a.plan.sales - 1) * 100) + '%' : null })) });
    else { const el = document.getElementById('v2read'); if (el) el.remove(); }
  }

  /* ---------- the paid tiles and chart, one way on Meta, Google, TikTok and All channels (2026-10-09) ----------
     Spend, purchases, revenue, ROAS, cost per purchase, CPM and CTR, each with its line over the period and the
     compare period dashed. Purchases and revenue follow the attribution switch; spend and delivery are the
     platform's. On Today Triple Whale's credit has not landed yet, so those read "pending", never 0. */
  function paidTiles(c, p, rows, prows, cur, g, SRC, plat) {
    const credit = isPlat() ? SRC : 'TW', pend = !!c.attr_pending;
    const R = (rows || []).map(ratios), P = (prows || []).map(ratios), km = v => kmoney(v, cur);
    const pendSub = what => `Triple Whale credits land overnight${c[`platform_${what}`] != null ? `; ${plat} reports ${what === 'revenue' ? kmoney(c.platform_revenue, cur) : int(c.platform_purchases)} so far` : ''}`;
    return [
      tile({ compact: true, label: 'Spend', src: SRC, value: kmoney(c.spend, cur), delta: delta(c.spend, p.spend, 'n'), sub: `${int(c.impressions)} impressions`, spark: tspark(R, P, 'spend', km, 'spend') }),
      tile({ compact: true, label: 'Purchases', src: credit, value: pend ? '–' : int(c.purchases), delta: pend ? '' : delta(c.purchases, p.purchases), sub: pend ? pendSub('purchases') : isPlat() || c.platform_purchases == null ? '' : `${plat} reports ${int(c.platform_purchases)}`, spark: pend ? '' : tspark(R, P, 'purchases', int, 'purchases') }),
      tile({ compact: true, label: 'Revenue', src: credit, value: pend ? '–' : kmoney(c.revenue, cur), delta: pend ? '' : delta(c.revenue, p.revenue), sub: pend ? pendSub('revenue') : isPlat() || c.platform_revenue == null ? '' : `${plat} reports ${kmoney(c.platform_revenue, cur)}`, spark: pend ? '' : tspark(R, P, 'revenue', km, 'revenue') }),
      tile({ compact: true, label: 'ROAS', src: credit, value: pend ? '–' : x2(c.roas), delta: pend ? '' : delta(c.roas, p.roas), bullet: pend ? '' : bullet(c.roas, g.roas, false, g.roas ? `goal ${x2(g.roas)}` : ''), spark: pend ? '' : tspark(R, P, 'roas', x2, 'ROAS') }),
      tile({ compact: true, label: 'Cost per purchase', src: credit, hint: 'lower is better', value: pend ? '–' : money(c.cpa, cur), delta: pend ? '' : delta(c.cpa, p.cpa, true), bullet: pend ? '' : bullet(c.cpa, g.cpa, true, g.cpa ? `goal ${money(g.cpa, cur)}` : ''), spark: pend ? '' : tspark(R, P, 'cpa', v => money(v, cur), 'cost per purchase') }),
      tile({ compact: true, label: 'CPM', src: SRC, hint: 'lower is better', value: money2(c.cpm, cur), delta: delta(c.cpm, p.cpm, true), sub: c.cpc != null ? `${money2(c.cpc, cur)} per click` : '', spark: tspark(R, P, 'cpm', v => money2(v, cur), 'CPM') }),
      tile({ compact: true, label: 'CTR', src: SRC, hint: 'link clicks', value: pct(c.ctr, 2), delta: delta(c.ctr, p.ctr, false, true), sub: `${int(c.clicks)} clicks`, spark: tspark(R, P, 'ctr', v => pct(v, 2), 'CTR') }),
    ].join('');
  }
  /** Spend against revenue by day, the compare period's revenue dashed: the same lineChart as Home. */
  function paidChart(id, rows, prows, cur, title, find, revKey = 'revenue', spendKey = 'spend') {
    if (!cur || (rows || []).length < 1) return '';
    const R = rows.map(r => ({ ...r, v: r[revKey], s: r[spendKey] })), P = (prows || []).map(r => ({ ...r, v: r[revKey] }));
    return card(title, find, legend([{ color: '--brand', label: 'Revenue' }, { color: '--c-google', label: 'Spend' }, ...(P.length > 1 && H.S.cmp !== 'none' ? [{ dash: true, label: `Revenue, ${cmpLabel()}` }] : [])]) +
      lineChart(id, R, { key: 'v', key2: 's', prev: H.S.cmp !== 'none' ? P : [], cur }));
  }
  const wirePaidChart = (id, rows, prows, cur, revKey = 'revenue', spendKey = 'spend') => { if ((rows || []).length > 1) wireLine(id, rows, { tip: (r, i) => `<b>${day(r.date)}</b> · revenue ${kmoney(r[revKey], cur)} · spend ${kmoney(r[spendKey], cur)}${r[spendKey] && r[revKey] != null ? ` · ${x2(r[revKey] / r[spendKey])}` : ''}${prows && prows[i] && H.S.cmp !== 'none' ? `<br><span class="faint">${esc(cmpLabel())}: ${kmoney(prows[i][revKey], cur)} on ${day(prows[i].date)}</span>` : ''}` }); };

  /* =========================================================================================
   * PAID > META (Overview and Campaigns); the segmented control is drawn by the host
   * ======================================================================================= */
  async function meta(first, view) {
    const t = H.RUN(); const one = H.S.act !== 'all';
    const title = one ? `Meta: ${esc((H.S.accounts.find(a => a.act_id === H.S.act) || {}).name || '')}` : 'Meta';
    const oneA = one ? H.S.accounts.find(a => a.act_id === H.S.act) : null;
    if (noMeta(oneA)) { $('#main').innerHTML = shell(view === 'campaigns' ? 'campaigns' : 'meta', title, noMetaCard(oneA)); return; }
    if (first) $('#main').innerHTML = shell(view === 'campaigns' ? 'campaigns' : 'meta', title, view === 'campaigns' ? skCard(10) : skPage({ tiles: 8, lead: true }));
    let d; try { d = await get(`/api/hub/paid?platform=meta&act=${encodeURIComponent(H.S.act)}&${H.rangeQ()}${modelQ()}`); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('meta', title, `<div class="v2card"><p class="v2bad">${esc(e.message)}</p></div>`); return; }
    if (t !== H.RUN()) return;
    if (!one) return metaAll(d, title);
    const b = d.brands[0], c = b.cur, p = b.prev || {}, cur = b.currency, g = b.goals || {};
    const sz = b.series || [];
    const pend = window.V2PENDING; if (pend && pend.campaign) { CAMP_OPEN.add(pend.campaign); window.V2PENDING = pend.ad ? { ad: pend.ad } : null; if (window.LocusShare) window.LocusShare.setExtra({ camp: pend.campaign }); setTimeout(() => { const tr = document.querySelector(`#v2camptbl tr[data-campaign="${CSS.escape(pend.campaign)}"]`); if (tr) { tr.scrollIntoView({ block: 'center' }); tr.classList.add('v2flash'); } }, 50); }
    const pace = c.spend && d.window ? c.spend / (sz.length || 1) : null;
    const verdict = [`${kmoney(c.spend, cur)} spent${pace && sz.length > 1 ? `, ${kmoney(pace, cur)} a day` : ''}.`, c.attr_pending ? `Purchases and revenue come from Triple Whale overnight; Meta reports ${int(c.platform_purchases)} purchase${c.platform_purchases === 1 ? '' : 's'} so far today.` : `${int(c.purchases)} purchases at ${money(c.cpa, cur)}${g.cpa ? ` against a ${money(g.cpa, cur)} goal` : ''}; ROAS ${x2(c.roas)}${g.roas ? ` against ${x2(g.roas)}` : ''}.`].join(' ');
    const psz = b.prev_series || [];
    const tl = paidTiles(c, p, sz, psz, cur, g, 'META', 'Meta') + tile({ compact: true, label: 'Hook · hold', src: 'META', hint: 'video', value: `${pct(c.hook, 0)} · ${pct(c.hold, 0)}`, delta: delta(c.hook, p.hook, false, true), sub: `avg daily frequency ${c.frequency ? c.frequency.toFixed(2) : '–'}` });
    const steps = [['Impressions', c.impressions, p.impressions, `${money2(c.cpm, cur)} CPM`, null], ['Link clicks', c.clicks, p.clicks, `${pct(c.ctr, 2)} CTR · ${money2(c.cpc, cur)} each`, p.ctr], ['Added to cart', c.atc, p.atc, `${pct(c.atc_rate)} of clicks · ${money2(c.cost_per_atc, cur)} each`, p.atc_rate], ['Purchases', c.purchases, p.purchases, `${pct(c.purchase_rate)} of carts · ${money(c.cpa, cur)} each`, p.purchase_rate]];
    const rates = [[c.ctr, p.ctr, 'click'], [c.atc_rate, p.atc_rate, 'cart'], [c.purchase_rate, p.purchase_rate, 'purchase']];
    const worst = rates.filter(r => r[0] != null && r[1]).map(r => [r[2], r[0] / r[1] - 1]).sort((x, y) => x[1] - y[1])[0];
    const funnel = card('Funnel', worst && worst[1] < -0.05 ? `The step that moved most is the ${worst[0]} rate: ${Math.round(worst[1] * 100)}% against ${esc(cmpLabel())}.` : 'No step moved more than 5% against the period before.',
      `<div class="v2fun four">${steps.map(([l, v, pv, sub, prate], i) => `<div class="fs"><div class="l">${l}</div><div class="v">${kmoney(v, null).replace('$', '')}${delta(v, pv)}</div><div class="r">${sub}</div><div class="bar"><i class="g" style="width:${(Math.log10(Math.max(1, pv || 0)) / Math.log10(Math.max(10, c.impressions)) * 100).toFixed(1)}%"></i><i style="width:${(Math.log10(Math.max(1, v || 0)) / Math.log10(Math.max(10, c.impressions)) * 100).toFixed(1)}%"></i></div></div>`).join('')}</div>`, 'bars on a log scale; grey is the period before');
    const campIds = (b.campaigns || []).slice(0, 6); const palette = SEQ;
    const campSeries = sz.map(r => { const o = { date: r.date }; campIds.forEach((cp, i) => { o['c' + i] = r.camps?.[cp.id] || 0; }); o.other = Object.entries(r.camps || {}).filter(([k]) => !campIds.some(cp => cp.id === k)).reduce((s, [, v]) => s + v, 0); return o; });
    const ser = campIds.map((cp, i) => ({ key: 'c' + i, label: cp.name, color: palette[i % palette.length] })).concat([{ key: 'other', label: 'Other campaigns', color: '--v2-cmp' }]);
    const changes = (b.changes || []).filter(x => ['budget', 'new_campaign', 'campaign_paused', 'campaign_relaunched', 'bid_strategy'].includes(x.category)).slice(0, 12).map(x => ({ date: x.date, text: `${x.summary || x.category}${x.actor ? ` (${x.actor})` : ''}` }));
    const spendChart = card('Spend by campaign, by day', changes.length ? `${changes.length} account change${changes.length === 1 ? '' : 's'} in this window, marked ▲ under the days.` : '', legend(ser.slice(0, 7)) + stackChart('v2camp', campSeries, ser, { cur, changes }));
    const perf = card('Cost per purchase by day', `Goal ${g.cpa ? money(g.cpa, cur) : 'not set'}${(b.prev_series || []).length ? '; dashed is the period before' : ''}.`,
      lineChart('v2cpa', sz.map(r => ({ ...r, v: r.cpa })), { key: 'v', prev: (b.prev_series || []).map(r => ({ ...r, v: r.cpa })), plan: g.cpa, cur, fmt: v => money(v, cur), h: 200 }));
    const table = campTable(b, cur, view === 'campaigns');
    const srChart = paidChart('v2msr', sz, psz, cur, 'Spend and revenue by day', `Revenue credited to Meta under ${esc(MODEL_SHORT[H.S.model])}; spend is Meta’s own.`);
    const body = view === 'campaigns' ? `${table}` : `<p class="v2say lead">${esc(verdict)}</p><div class="v2tiles">${tl}</div>${srChart}${funnel}<div class="v2two">${spendChart}${perf}</div>${table}
      <div class="v2gos"><button type="button" class="v2go" data-go="mtoday"><b>Today against a normal day</b><span>Hour by hour: is today's spend and buying running hot or cold?</span><i>›</i></button><button type="button" class="v2go" data-go="mbrowser"><b>Creative browser</b><span>Every ad with its cover and copy, and the client's own ads page link.</span><i>›</i></button><button type="button" class="v2go" data-go="changes"><b>What changed</b><span>Budgets, launches and pauses, with the reason next to each.</span><i>›</i></button></div>`;
    $('#main').innerHTML = shell(view === 'campaigns' ? 'campaigns' : 'meta', title, body + foot('Spend, impressions, clicks, CPM, CTR, frequency, hook and hold are Meta’s own. Purchases, revenue, ROAS and CPA follow the attribution switch; Meta’s own count stays beside them. Click a purchases cell for the orders behind it.'));
    const root = $('#main'); wireGo(root); wireCamp(root, b, cur);
    prefetch([`/api/hub/creative?act=${encodeURIComponent(H.S.act)}&${H.rangeQ()}${modelQ()}`]);
    if (view !== 'campaigns') { wirePaidChart('v2msr', sz, psz, cur); wireStack('v2camp', campSeries, ser, cur); wireLine('v2cpa', sz.map(r => ({ ...r, v: r.cpa })), { tip: (r, i) => `<b>${day(r.date)}</b> · CPA ${money(r.cpa, cur)} · ${int(r.purchases)} purchases on ${kmoney(r.spend, cur)}` }); }
  }
  /* =========================================================================================
   * TABLES YOU CAN SORT AND SHAPE (2026-10-09, Cole: "I can't sort by anything", "Can I add more metrics?")
   * Click a header to sort (again to flip), the Columns menu shows, hides and reorders every metric the rows carry.
   * Saved per table in localStorage `pf_tbl_<id>` {order, show, sort, dir}. A def: {k, l, v(row), cell(row), lo
   * (lower is better, so the first click sorts up), txt (sort as text), tip, hide()}. The first column (the name)
   * is fixed. In the Meta tree a sort orders campaigns, then the ad sets inside each, then the ads inside each.
   * ======================================================================================= */
  const TBL = {
    load(id, defs, def) {
      let s = null; try { s = JSON.parse(localStorage.getItem('pf_tbl_' + id) || 'null'); } catch {}
      s = s || {}; const keys = defs.map(d => d.k);
      const order = (s.order || []).filter(k => keys.includes(k)); for (const k of keys) if (!order.includes(k)) order.push(k);
      return { id, def, order, show: new Set(Array.isArray(s.show) ? s.show.filter(k => keys.includes(k)) : def), sort: s.sort || null, dir: s.dir || -1 };
    },
    save(st) { try { localStorage.setItem('pf_tbl_' + st.id, JSON.stringify({ order: st.order, show: [...st.show], sort: st.sort, dir: st.dir })); } catch {} },
    cols(st, defs) { return st.order.map(k => defs.find(d => d.k === k)).filter(d => d && st.show.has(d.k) && !(d.hide && d.hide())); },
    cmp(st, defs) {
      const d = st.sort === '_name' ? { v: r => r.name, txt: 1 } : defs.find(x => x.k === st.sort); if (!d) return null;
      return (a, b) => {
        const x = d.v(a), y = d.v(b), nx = x == null || (!d.txt && !isFinite(x)), ny = y == null || (!d.txt && !isFinite(y));
        if (nx || ny) return nx === ny ? 0 : nx ? 1 : -1;               // empty cells always last
        return (d.txt ? String(x).localeCompare(String(y)) : x - y) * st.dir;
      };
    },
    th(st, k, label, cls = '') {
      const on = st.sort === k, arrow = on ? (st.dir > 0 ? '▲' : '▼') : '';
      return `<th class="v2srt${on ? ' on' : ''}${cls ? ' ' + cls : ''}" aria-sort="${on ? (st.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-srt="${esc(k)}" data-tip="Sort by ${esc(label.toLowerCase())}">${esc(label)}<i aria-hidden="true">${arrow}</i></button></th>`;
    },
    menu(st, defs) {
      const n = TBL.cols(st, defs).length;
      const rows = st.order.map(k => defs.find(d => d.k === k)).filter(d => d && !(d.hide && d.hide())).map((d, i, a) => `<div class="v2col-r${st.show.has(d.k) ? ' on' : ''}" data-ck="${esc(d.k)}">
        <label><input type="checkbox"${st.show.has(d.k) ? ' checked' : ''}><span><b>${esc(d.l)}</b>${d.tip ? `<small>${esc(d.tip)}</small>` : ''}</span></label>
        <span class="mv"><button type="button" data-mv="-1" aria-label="Move ${esc(d.l)} earlier"${i ? '' : ' disabled'}>${ICN('chevron-up')}</button><button type="button" data-mv="1" aria-label="Move ${esc(d.l)} later"${i < a.length - 1 ? '' : ' disabled'}>${ICN('chevron-down')}</button></span></div>`).join('');
      return `<button type="button" class="hd-per-btn" aria-haspopup="true" aria-expanded="false"><span class="hd-per-l">Columns</span><span class="hd-per-d">${n} shown</span>
        <svg viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg></button>
        <div class="hd-per-menu md-menu v2cols-m" role="menu"><p class="hd-per-note">Tick what to show; the arrows move a column left or right. Saved for you on this computer.</p><div class="v2col-l">${rows}</div>
        <div class="v2col-f"><button type="button" data-creset>Back to the default</button></div></div>`;
    },
    /* Wires the header sort and the Columns menu inside `root`; `redraw()` repaints the table only. */
    wire(root, st, defs, redraw) {
      root.querySelectorAll('[data-srt]').forEach(b => b.onclick = e => {
        e.stopPropagation(); const k = b.dataset.srt, d = defs.find(x => x.k === k);
        if (st.sort === k) st.dir = -st.dir; else { st.sort = k; st.dir = k === '_name' || (d && (d.lo || d.txt)) ? 1 : -1; }
        TBL.save(st); redraw();
      });
      const box = root.querySelector(`.v2cols[data-tbl="${st.id}"]`); if (!box) return;
      const paint = () => { const open = box.classList.contains('open'); box.innerHTML = TBL.menu(st, defs); box.classList.toggle('open', open); hook(); };
      const hook = () => {
        const b = box.querySelector('.hd-per-btn');
        b.onclick = e => { e.stopPropagation(); if (typeof closePops === 'function') closePops(box); const o = !box.classList.contains('open'); box.classList.toggle('open', o); b.setAttribute('aria-expanded', String(o)); };
        box.querySelector('.hd-per-menu').onclick = e => e.stopPropagation();
        box.querySelectorAll('.v2col-r input').forEach(inp => inp.onchange = () => { const k = inp.closest('[data-ck]').dataset.ck; inp.checked ? st.show.add(k) : st.show.delete(k); TBL.save(st); paint(); redraw(); });
        box.querySelectorAll('[data-mv]').forEach(m => m.onclick = () => {
          const k = m.closest('[data-ck]').dataset.ck, vis = st.order.filter(x => { const d = defs.find(y => y.k === x); return d && !(d.hide && d.hide()); });
          const i = vis.indexOf(k), j = i + +m.dataset.mv; if (j < 0 || j >= vis.length) return;
          const a = st.order.indexOf(k), b2 = st.order.indexOf(vis[j]); [st.order[a], st.order[b2]] = [st.order[b2], st.order[a]];
          TBL.save(st); paint(); redraw();
          const again = box.querySelector(`[data-ck="${CSS.escape(k)}"] [data-mv="${m.dataset.mv}"]`); if (again && !again.disabled) again.focus();
        });
        box.querySelector('[data-creset]').onclick = () => { st.order = defs.map(d => d.k); st.show = new Set(st.def); st.sort = null; st.dir = -1; TBL.save(st); paint(); redraw(); };
      };
      hook();
    },
  };
  const ICN = n => (window.icon ? window.icon(n, { size: 14 }) : '');

  /* The Meta columns: everything metaMetrics returns, plus the live status and budget. */
  const META_COLS = () => [
    { k: 'status', l: 'Status', v: x => (x.live_status === 'ACTIVE' ? 1 : x.live_status ? 0 : null), tip: 'On or paused. Switch it here.' },
    { k: 'budget', l: 'Budget', v: x => x.live_budget ?? null, tip: 'Daily or lifetime, where it is set. Click to change.' },
    { k: 'spend', l: 'Spend', v: x => x.spend },
    { k: 'purchases', l: 'Purchases', v: x => x.purchases, tip: 'Under the attribution switch.' },
    { k: 'platform_purchases', l: 'Meta says', v: x => x.platform_purchases, tip: 'Meta’s own purchase count.', hide: () => isPlat() },
    { k: 'revenue', l: 'Revenue', v: x => x.revenue },
    { k: 'roas', l: 'ROAS', v: x => x.roas },
    { k: 'cpa', l: 'CPA', v: x => x.cpa, lo: 1 },
    { k: 'cpm', l: 'CPM', v: x => x.cpm, lo: 1 },
    { k: 'ctr', l: 'CTR', v: x => x.ctr, tip: 'Link clicks per impression.' },
    { k: 'cpc', l: 'CPC', v: x => x.cpc, lo: 1, tip: 'Cost per link click.' },
    { k: 'frequency', l: 'Freq.', v: x => x.frequency, tip: 'Impressions per person reached.' },
    { k: 'impressions', l: 'Impressions', v: x => x.impressions },
    { k: 'reach', l: 'Reach', v: x => x.reach },
    { k: 'clicks', l: 'Link clicks', v: x => x.clicks },
    { k: 'hook', l: 'Hook', v: x => x.hook, tip: '3-second views per impression (video).' },
    { k: 'hold', l: 'Hold', v: x => x.hold, tip: 'Watched to the end per 3-second view.' },
    { k: 'atc', l: 'Add to cart', v: x => x.atc },
    { k: 'cost_per_atc', l: 'Cost per ATC', v: x => x.cost_per_atc, lo: 1 },
    { k: 'atc_rate', l: 'Click to cart', v: x => x.atc_rate, tip: 'Add to carts per link click.' },
    { k: 'purchase_rate', l: 'Cart to purchase', v: x => x.purchase_rate },
    { k: 'platform_revenue', l: 'Meta revenue', v: x => x.platform_revenue, tip: 'Meta’s own purchase value.', hide: () => isPlat() },
  ];
  const META_DEF = ['status', 'budget', 'spend', 'purchases', 'platform_purchases', 'revenue', 'roas', 'cpa', 'cpm', 'ctr', 'frequency', 'hook', 'hold'];

  /* ---------- live state and edits (Meta) ---------- */
  let MLIVE = null, MLIVE_ACT = null, MLIVE_AT = 0;
  const lvWord = { campaign: 'campaign', adset: 'ad set', ad: 'ad' };
  const liveOf = (lvl, id) => !MLIVE || MLIVE_ACT !== H.S.act ? null : lvl === 0 ? MLIVE.campaigns[id] : lvl === 1 ? MLIVE.adsets[id] : MLIVE.ads[id];
  const canOf = o => { if (!MLIVE || MLIVE_ACT !== H.S.act) return { can: false, why: 'Reading the live state from Meta…' }; if (MLIVE.error) return { can: false, why: MLIVE.error }; const a = o && MLIVE.accounts.find(x => x.act === o.act); if (!o) return { can: false, why: 'Meta did not list this one (deleted or archived?).' }; return a && a.can ? { can: true } : { can: false, why: (a && a.fix) || 'Locus can only read this ad account.' }; };
  function decorate(x, lvl) {
    const o = liveOf(lvl, x.id);
    x.live_status = o ? o.status : null; x.live_eff = o ? o.eff : null;
    x.live_budget = o ? (o.daily ?? o.lifetime ?? null) : (lvl < 2 ? x.budget ?? null : null);
    x.live_kind = o ? (o.daily ? 'daily' : o.lifetime ? 'lifetime' : null) : (x.budget ? 'daily' : null);
    if (o && o.name) x.name = o.name;
    return x;
  }
  function statusCell(x, lvl) {
    const o = liveOf(lvl, x.id), c = canOf(o);
    const lv = ['campaign', 'adset', 'ad'][lvl];
    if (!o) return `<span class="faint"${tipAttr(esc(c.why))}>${x.status ? esc(String(x.status).toLowerCase().replace(/_/g, ' ')) : '–'}</span>`;
    const on = o.status === 'ACTIVE';
    const eff = o.eff && o.eff !== o.status && o.eff !== 'ACTIVE' ? String(o.eff).toLowerCase().replace(/_/g, ' ').replace('campaign paused', 'campaign off').replace('adset paused', 'ad set off') : '';
    return `<span class="v2sw-w"><button type="button" class="v2sw${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="${on ? 'Pause' : 'Turn on'} this ${lvWord[lv]}" data-sw="${lv}:${esc(x.id)}"${c.can ? '' : ' disabled'}${tipAttr(c.can ? `${on ? 'On. Click to pause' : 'Paused. Click to turn on'} this ${lvWord[lv]}.` : esc(c.why))}><i></i></button>${eff ? `<span class="sub">${esc(eff)}</span>` : ''}</span>`;
  }
  function budgetCell(x, lvl, cur) {
    if (lvl === 2) return '<span class="faint">–</span>';
    const lv = lvl === 0 ? 'campaign' : 'adset', o = liveOf(lvl, x.id), c = canOf(o);
    if (o && (o.daily || o.lifetime)) {
      const v = o.daily ? `${money(o.daily, cur)}/day` : `${money(o.lifetime, cur)} total`;
      return `<button type="button" class="v2ed-b" data-bud="${lv}:${esc(x.id)}"${c.can ? '' : ' disabled'}${tipAttr(c.can ? `Change this ${lvWord[lv]}’s ${o.daily ? 'daily' : 'lifetime'} budget` : esc(c.why))}>${v}${c.can ? ICN('pencil') : ''}</button>`;
    }
    if (lvl === 1 && o) {
      const camp = MLIVE.campaigns[o.campaign];
      if (camp && (camp.daily || camp.lifetime)) {
        const lim = [o.min ? `min ${money(o.min, cur)}` : '', o.cap ? `cap ${money(o.cap, cur)}` : ''].filter(Boolean).join(' · ');
        return `<button type="button" class="v2ed-b soft" data-min="adset:${esc(x.id)}"${c.can ? '' : ' disabled'}${tipAttr(c.can ? 'The campaign holds the budget. Set this ad set’s daily minimum or cap.' : esc(c.why))}>${lim || 'Campaign’s'}${c.can ? ICN('pencil') : ''}</button>`;
      }
    }
    if (lvl === 0 && o) return `<span class="faint"${tipAttr('The ad sets carry the budgets in this campaign.')}>Ad sets’</span>`;
    return x.budget ? `${money(x.budget, cur)}/day` : '<span class="faint">–</span>';
  }

  const CAMP_OPEN = new Set();
  function campTable(b, cur, full) {
    const defs = META_COLS(), st = TBL.load('meta-camps', defs, META_DEF);
    /* OVERVIEW SHOWS THE TOP 5, CAMPAIGNS SHOWS ALL (2026-10-09, Cole asked what the difference was). Overview is the
       read: the five campaigns that spent most. The Campaigns page is the work: every campaign, ad set and ad, edited. */
    const nC = (b.campaigns || []).length;
    if (!full) return card('Top campaigns', `The ${Math.min(5, nC)} that spent most of ${nC} campaign${nC === 1 ? '' : 's'} in these dates. Open one for its ad sets.`,
      `<div class="v2tbar"><span class="v2tbar-l faint">Click a column to sort.</span><div class="hd-period pm v2cols" data-tbl="${st.id}">${TBL.menu(st, defs)}</div></div>
      <div class="v2tbl wide" id="v2campwrap">${campRows(b, cur, full, st, defs)}</div><div class="v2seeall"><button type="button" class="v2link" data-go="campaigns">See all ${nC} campaigns, with every ad set and ad ›</button><span class="faint">Change budgets and switch things on or off there.</span></div>`, `Attribution: <b>${esc(MODEL_SHORT[H.S.model])}</b>`);
    return card('Campaigns, ad sets and ads', `${nC} campaign${nC === 1 ? '' : 's'} spent in this window. Open one for its ad sets, an ad set for its ads. Switch, budget and the ⋯ menu change it in Meta, after you confirm.`,
      `<div class="v2tbar">${full ? `<span class="v2tbar-l" id="v2mlive">${MLIVE && MLIVE_ACT === H.S.act ? liveLine() : '<span class="faint">Reading live status and budgets from Meta…</span>'}</span>` : '<span class="v2tbar-l faint">Click a column to sort.</span>'}<div class="hd-period pm v2cols" data-tbl="${st.id}">${TBL.menu(st, defs)}</div></div>
      <div class="v2tbl wide" id="v2campwrap">${campRows(b, cur, full, st, defs)}</div>`, `Attribution: <b>${esc(MODEL_SHORT[H.S.model])}</b>`);
  }
  function liveLine() {
    if (!MLIVE) return '';
    if (MLIVE.error) return `<span class="v2bad">${esc(MLIVE.error)}</span>`;
    const ro = MLIVE.accounts.filter(a => !a.can);
    const last = lastWrite();
    return `${ro.length ? `<span class="v2warn-t"${tipAttr(esc(ro.map(a => a.fix).join(' ')))}>${ICN('circle-alert')} Read only: Locus cannot change ${esc(ro.map(a => a.name).join(', '))} yet (hover for the fix).</span>` : `<span class="faint">Live from Meta at ${new Date(MLIVE_AT).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.</span>`}${last ? ` <span class="v2last">Last change: ${esc(last.summary)} <button type="button" class="v2lnk" data-undo="${esc(last.write)}">Undo</button></span>` : ''}`;
  }
  function campRows(b, cur, full, st, defs) {
    const camps = (b.campaigns || []).map(c => decorate(c, 0)); const mx = Math.max(...camps.map(x => x.spend), 1); const g = b.goals || {};
    const cols = TBL.cols(st, defs), by = TBL.cmp(st, defs);
    const cpaCls = v => !g.cpa || v == null ? '' : v <= g.cpa ? 'good' : v <= g.cpa * 1.3 ? 'warn' : 'bad';
    const cell = (x, d, lvl, kind) => {
      switch (d.k) {
        case 'status': return full ? statusCell(x, lvl) : (x.status && !/ACTIVE/.test(x.status) ? `<span class="v2pill">${esc(x.status.toLowerCase().replace(/_/g, ' '))}</span>` : '<span class="faint">on</span>');
        case 'budget': return full ? budgetCell(x, lvl, cur) : (lvl < 2 && x.budget ? `${money(x.budget, cur)}/day` : lvl === 1 && x.min_spend ? `min ${money(x.min_spend, cur)}` : '<span class="faint">–</span>');
        case 'spend': return ib(x.spend, mx, null, kmoney(x.spend, cur));
        case 'purchases': return `<button type="button" class="v2cell" data-drill="${kind}:${esc(x.id)}" title="See the orders">${int(x.purchases)}</button>`;
        case 'platform_purchases': return `<span class="faint">${int(x.platform_purchases)}</span>`;
        case 'revenue': case 'platform_revenue': return kmoney(x[d.k], cur);
        case 'roas': return x2(x.roas);
        case 'cpa': return `<span class="${cpaCls(x.cpa)}">${money(x.cpa, cur)}</span>${x.prev && x.prev.cpa ? delta(x.cpa, x.prev.cpa, true) : ''}`;
        case 'cpm': case 'cpc': case 'cost_per_atc': return money2(x[d.k], cur);
        case 'ctr': return pct(x.ctr, 2);
        case 'frequency': return x.frequency ? x.frequency.toFixed(2) : '–';
        case 'hook': case 'hold': case 'atc_rate': case 'purchase_rate': return pct(x[d.k], d.k === 'hook' || d.k === 'hold' ? 0 : 1);
        default: return int(x[d.k]);
      }
    };
    const cls = d => d.k === 'cpa' ? '' : d.k === 'status' ? 'c' : '';
    const row = (x, lvl, kind) => `<tr class="lvl${lvl}" data-${kind}="${esc(x.id)}">
      <td>${lvl < 2 ? `<button type="button" class="v2ex${CAMP_OPEN.has(x.id) ? ' open' : ''}" data-tog="${esc(x.id)}" aria-label="Show what is inside">›</button>` : `<button type="button" class="v2th" data-prev="${esc(x.id)}" data-thumb="${esc(x.id)}" aria-label="Preview this ad"${THUMBS.has(x.id) ? ` style="background-image:url('${THUMBS.get(x.id)}')"` : ''}></button>`}<span class="nm${lvl === 2 ? ' v2open' : ''}" title="${esc(x.name)}"${lvl === 2 ? ` data-prev="${esc(x.id)}"` : ''}>${esc(x.name)}</span>${full ? `<button type="button" class="v2rm" data-rm="${['campaign', 'adset', 'ad'][lvl]}:${esc(x.id)}" aria-label="More for this ${lvWord[['campaign', 'adset', 'ad'][lvl]]}">${ICN('more-horizontal')}</button>` : ''}${lvl === 0 && x.objective ? `<span class="sub">${esc(x.objective.replace('OUTCOME_', '').toLowerCase())}</span>` : ''}</td>
      ${cols.map(d => `<td class="${cls(d)}">${cell(x, d, lvl, kind)}</td>`).join('')}</tr>`;
    const sorted = list => by ? list.slice().sort(by) : list;
    let rows = '';
    const shownCamps = full ? sorted(camps) : sorted(camps.slice().sort((p, q) => q.spend - p.spend).slice(0, 5));
    for (const cp of shownCamps) {
      rows += row(cp, 0, 'campaign');
      if (CAMP_OPEN.has(cp.id)) for (const s of sorted((cp.adsets || []).map(z => decorate(z, 1)))) {
        rows += row(s, 1, 'adset');
        if (CAMP_OPEN.has(s.id)) for (const a of sorted((s.ads || []).map(z => decorate(z, 2))).slice(0, 25)) rows += row(a, 2, 'ad');
      }
    }
    const c = b.cur, tot = d => {
      if (d.k === 'status' || d.k === 'budget') return '';
      if (d.k === 'purchases') return int(c.purchases);
      if (d.k === 'spend') return kmoney(c.spend, cur);
      if (d.k === 'cpa') return money(c.cpa, cur);
      return cell({ ...c, id: 'all', prev: null }, d, 0, 'campaign');
    };
    rows += `<tr class="tot"><td>${full ? "All campaigns" : `All ${camps.length} campaigns`}</td>${cols.map(d => `<td>${tot(d)}</td>`).join('')}</tr>`;
    return `<table id="v2camptbl"><thead><tr>${TBL.th(st, '_name', 'Campaign')}${cols.map(d => TBL.th(st, d.k, d.l, cls(d))).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  }
  function wireCamp(root, b, cur) {
    const full = H.S.tab === 'campaigns';
    const adsById = new Map(); for (const cp of b.campaigns || []) for (const st of cp.adsets || []) for (const a of st.ads || []) adsById.set(a.id, a);
    MED = medians([...adsById.values()], (b.goals || {}).cpa || 50);
    const defs = META_COLS(), st = TBL.load('meta-camps', defs, META_DEF);
    const wrap = root.querySelector('#v2campwrap'); if (!wrap) return;
    const card0 = wrap.closest('.v2card');
    const redraw = () => { wrap.innerHTML = campRows(b, cur, full, st, defs); wireRowsCamp(); };
    function wireRowsCamp() {
      TBL.wire(wrap, st, defs, redraw);
      wrap.querySelectorAll('#v2camptbl [data-prev]').forEach(el => el.onclick = e => { e.stopPropagation(); const a = adsById.get(el.dataset.prev); if (a) previewAd(a, cur, b.goals); });
      loadThumbs(wrap, [...wrap.querySelectorAll('#v2camptbl [data-thumb]')].map(x => x.dataset.thumb));
      wrap.querySelectorAll('[data-tog]').forEach(btn => btn.onclick = e => { e.stopPropagation(); const id = btn.dataset.tog; CAMP_OPEN.has(id) ? CAMP_OPEN.delete(id) : CAMP_OPEN.add(id); if (window.LocusShare && btn.closest('tr[data-campaign]')) window.LocusShare.setExtra({ camp: CAMP_OPEN.has(id) ? id : null }); redraw(); });
      wrap.querySelectorAll('[data-drill]').forEach(btn => btn.onclick = e => { e.stopPropagation(); const [k, id] = btn.dataset.drill.split(':'); const name = btn.closest('tr').querySelector('.nm')?.textContent || ''; drillOrders(name, `${k === 'campaign' ? 'campaign' : k === 'adset' ? 'adset' : 'ad'}=${encodeURIComponent(id)}`); });
      if (full) {
        wrap.querySelectorAll('[data-sw]').forEach(el => el.onclick = e => { e.stopPropagation(); const [lv, id] = el.dataset.sw.split(':'); editMeta(lv, id, el.classList.contains('on') ? 'pause' : 'resume', b, cur, redraw); });
        wrap.querySelectorAll('[data-bud]').forEach(el => el.onclick = e => { e.stopPropagation(); const [lv, id] = el.dataset.bud.split(':'); editMeta(lv, id, 'budget', b, cur, redraw); });
        wrap.querySelectorAll('[data-min]').forEach(el => el.onclick = e => { e.stopPropagation(); const [lv, id] = el.dataset.min.split(':'); editMeta(lv, id, 'min_spend', b, cur, redraw); });
        wrap.querySelectorAll('[data-rm]').forEach(el => el.onclick = e => { e.stopPropagation(); const [lv, id] = el.dataset.rm.split(':'); rowMenu(el, lv, id, b, cur, redraw); });
      }
      /* Stock on the ad set and the ad (supply.js): "Stock runs out Nov 27", "Stock OK to scale". */
      if (window.SupplyStock && H.S.act !== 'all') window.SupplyStock.decorate(root, H.S.act);
    }
    wireRowsCamp();
    TBL.wire(card0.querySelector('.v2tbar'), st, defs, redraw);
    const liveEl = () => root.querySelector('#v2mlive');
    const wireLive = () => { const u = liveEl() && liveEl().querySelector('[data-undo]'); if (u) u.onclick = () => undoMeta(u.dataset.undo, b, cur, redraw); };
    if (full) {
      wireLive();
      const act = H.S.act;
      if (!(MLIVE && MLIVE_ACT === act && Date.now() - MLIVE_AT < 60e3)) {
        H.apiAH(`/api/meta/live?act=${encodeURIComponent(act)}`).then(l => { MLIVE = l; MLIVE_ACT = act; MLIVE_AT = Date.now(); }).catch(e => { MLIVE = { error: `Could not read the live state from Meta: ${e.message}`, accounts: [], campaigns: {}, adsets: {}, ads: {} }; MLIVE_ACT = act; MLIVE_AT = Date.now(); })
          .then(() => { if (H.S.act !== act || !root.contains(wrap)) return; redraw(); const le = liveEl(); if (le) { le.innerHTML = liveLine(); wireLive(); } });
      }
    }
    /* A link that names an ad (?ad=, share.js) opens its preview here too, not only on Creative. */
    const pa = window.V2PENDING; if (pa && pa.ad && !pa.campaign) { window.V2PENDING = null; const a = adsById.get(pa.ad); if (a) previewAd(a, cur, b.goals); }
    MWIRE = { b, cur, redraw, wireLive, liveEl };
  }
  let MWIRE = null;

  /* ---------- the ⋯ menu on a row: rename, copy an ad set, open in Ads Manager ---------- */
  function rowMenu(btn, lv, id, b, cur, redraw) {
    document.querySelectorAll('.v2fm').forEach(x => x.remove());
    const o = liveOf(lv === 'campaign' ? 0 : lv === 'adset' ? 1 : 2, id), c = canOf(o);
    const actNum = String((o && o.act) || ((H.S.accounts.find(a => a.act_id === H.S.act) || {}).meta_act) || '').replace('act_', '');
    const sel = lv === 'campaign' ? 'selected_campaign_ids' : lv === 'adset' ? 'selected_adset_ids' : 'selected_ad_ids';
    const items = [
      ['rename', 'Rename', c.can ? `Change this ${lvWord[lv]}’s name in Meta.` : c.why, c.can],
      ...(lv === 'adset' ? [['dup', 'Copy this ad set', c.can ? 'A copy with its ads, in the same campaign, paused until you turn it on.' : c.why, c.can]] : []),
      ['open', 'Open in Ads Manager', 'In a new tab, with this one selected.', true],
    ];
    const m = document.createElement('div'); m.className = 'v2fm md-menu hd-per-menu'; m.setAttribute('role', 'menu');
    m.innerHTML = items.map(([k, l, d, ok]) => `<button type="button" role="menuitem" data-fm="${k}"${ok ? '' : ' disabled'}><b>${esc(l)}</b><small>${esc(d)}</small></button>`).join('');
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect(); m.style.top = `${Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 6)}px`; m.style.left = `${Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left))}px`;
    const close = () => { m.remove(); document.removeEventListener('mousedown', out, true); document.removeEventListener('keydown', esc1); window.removeEventListener('scroll', close, true); };
    const out = e => { if (!m.contains(e.target)) close(); };
    const esc1 = e => { if (e.key === 'Escape') close(); };
    setTimeout(() => { document.addEventListener('mousedown', out, true); document.addEventListener('keydown', esc1); window.addEventListener('scroll', close, true); }, 0);
    m.querySelectorAll('[data-fm]').forEach(x => x.onclick = () => {
      close(); const k = x.dataset.fm;
      if (k === 'open') window.open(`https://adsmanager.facebook.com/adsmanager/manage/${lv === 'campaign' ? 'campaigns' : lv === 'adset' ? 'adsets' : 'ads'}?act=${actNum}&${sel}=${id}`, '_blank', 'noopener');
      else editMeta(lv, id, k === 'dup' ? 'duplicate' : 'rename', b, cur, redraw);
    });
    m.querySelector('[data-fm]:not([disabled])')?.focus();
  }

  /* ---------- one modal for every edit: what it is now, what it will be, then Apply ---------- */
  const moneyIn = (n, c) => n == null ? '' : (Math.round(n * 100) / 100).toString();
  function findRow(b, lv, id) {
    for (const cp of b.campaigns || []) { if (lv === 'campaign' && cp.id === id) return cp; for (const s of cp.adsets || []) { if (lv === 'adset' && s.id === id) return s; for (const a of s.ads || []) if (lv === 'ad' && a.id === id) return a; } }
    return null;
  }
  function editMeta(lv, id, kind, b, cur, redraw) {
    const L = lv === 'campaign' ? 0 : lv === 'adset' ? 1 : 2, o = liveOf(L, id), row = findRow(b, lv, id) || {};
    const c = canOf(o); if (!c.can) { wtoast(c.why, true); return; }
    const name = o.name || row.name || id, word = lvWord[lv], s = sym(cur);
    let body = '', title = '', cta = 'Apply', expect = {};
    const pc = (a, z) => a ? `${z >= a ? '+' : ''}${Math.round((z - a) / a * 100)}%` : '';
    if (kind === 'pause' || kind === 'resume') {
      title = `${kind === 'pause' ? 'Pause' : 'Turn on'} this ${word}?`; cta = kind === 'pause' ? 'Pause it' : 'Turn it on'; expect = { status: o.status };
      const parent = kind === 'resume' && /^(CAMPAIGN|ADSET)_PAUSED$/.test(o.eff || '') ? `<p class="hint v2warn-t">Its ${o.eff === 'CAMPAIGN_PAUSED' ? 'campaign' : 'ad set'} is off, so it will not deliver until that is on too.</p>` : '';
      const spend = row.spend ? `<p class="hint">It spent ${kmoney(row.spend, cur)} in this window${row.purchases != null ? ` for ${int(row.purchases)} purchase${row.purchases === 1 ? '' : 's'}` : ''}.</p>` : '';
      body = `<div class="v2ba"><span>${o.status === 'ACTIVE' ? 'On' : 'Paused'}</span><i>→</i><b>${kind === 'pause' ? 'Paused' : 'On'}</b></div>${spend}${parent}`;
    } else if (kind === 'budget') {
      const daily = !!o.daily, from = o.daily || o.lifetime; title = `Change the ${daily ? 'daily' : 'lifetime'} budget`; expect = { [daily ? 'daily_budget' : 'lifetime_budget']: String(Math.round(from * 100)) };
      body = `<label class="v2fld"><span>New ${daily ? 'daily' : 'lifetime'} budget</span><span class="v2in"><i>${esc(s)}</i><input type="number" min="1" step="1" inputmode="decimal" id="v2edv" value="${moneyIn(from)}"></span></label>
        <div class="v2ba" id="v2edba"></div><p class="hint" id="v2edw"></p>`;
    } else if (kind === 'min_spend') {
      const camp = MLIVE.campaigns[o.campaign] || {}; title = 'Daily minimum and cap'; expect = { daily_min_spend_target: String(Math.round((o.min || 0) * 100)), daily_spend_cap: String(Math.round((o.cap || 0) * 100)) };
      body = `<p class="hint">The campaign holds the budget (${camp.daily ? `${money(camp.daily, cur)}/day` : `${money(camp.lifetime, cur)} total`}). A minimum makes Meta spend at least that here each day; a cap stops it above. Empty clears it.</p>
        <div class="v2two-in"><label class="v2fld"><span>Daily minimum</span><span class="v2in"><i>${esc(s)}</i><input type="number" min="0" step="1" id="v2edmin" value="${o.min ? moneyIn(o.min) : ''}" placeholder="none"></span></label>
        <label class="v2fld"><span>Daily cap</span><span class="v2in"><i>${esc(s)}</i><input type="number" min="0" step="1" id="v2edcap" value="${o.cap ? moneyIn(o.cap) : ''}" placeholder="none"></span></label></div><div class="v2ba" id="v2edba"></div>`;
    } else if (kind === 'rename') {
      title = `Rename this ${word}`; expect = { name };
      body = `<label class="v2fld"><span>Name in Meta</span><input type="text" id="v2edv" value="${esc(name)}" maxlength="400"></label><p class="hint">Keep the team’s pattern: the number, the angle, the format after the last |.</p>`;
    } else if (kind === 'duplicate') {
      title = 'Copy this ad set'; cta = 'Make the copy';
      body = `<label class="v2fld"><span>Name of the copy</span><input type="text" id="v2edv" value="${esc(name)} | copy" maxlength="400"></label>
        ${o.daily ? `<label class="v2fld"><span>Daily budget for the copy</span><span class="v2in"><i>${esc(s)}</i><input type="number" min="1" step="1" id="v2edb" value="${moneyIn(o.daily)}"></span></label>` : ''}
        <p class="hint">Copies the ad set with all its ads into the same campaign. It stays <b>paused</b> until someone turns it on, and shows here after the next Meta sync.</p>`;
    }
    const w = document.createElement('div'); w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal v2edm" role="dialog" aria-modal="true" aria-labelledby="v2edt"><h3 id="v2edt">${esc(title)}</h3><p class="v2ed-o">${esc(word.replace(/^./, x => x.toUpperCase()))} · <b>${esc(name)}</b></p>${body}
      <p class="v2bad" id="v2ederr" hidden></p>
      <div class="row v2ed-a"><span class="faint">Written to Meta and logged in the Change Log. Undo for 24 hours.</span><button class="btn" data-m="no" type="button">Cancel</button><button class="btn primary" data-m="yes" type="button">${esc(cta)}</button></div></div>`;
    document.body.appendChild(w);
    const $w = q => w.querySelector(q), err = $w('#v2ederr'), yes = $w('[data-m="yes"]');
    const close = () => { w.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') close(); if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !yes.disabled) yes.click(); };
    document.addEventListener('keydown', key);
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    $w('[data-m="no"]').onclick = close;
    const preview = () => {
      const ba = $w('#v2edba'); if (!ba) return true;
      if (kind === 'budget') {
        const from = o.daily || o.lifetime, to = +$w('#v2edv').value, per = o.daily ? '/day' : ' total';
        const okv = to > 0 && Math.abs(to - from) >= 0.01;
        ba.innerHTML = okv ? `<span>${money(from, cur, from % 1 ? 2 : 0)}${per}</span><i>→</i><b>${money(to, cur, to % 1 ? 2 : 0)}${per}</b><em class="${to > from ? 'up' : 'down'}">${pc(from, to)}</em>` : '<span class="faint">Type the new amount.</span>';
        const step = Math.abs(to - from) / from;
        $w('#v2edw').innerHTML = okv && step > 0.5 ? `<span class="v2warn-t">${ICN('circle-alert')} Over 50% in one step. Meta may restart learning; the house rule is 20 to 50% a step.</span>` : okv && o.daily ? `About ${money(Math.abs(to - from) * 30, cur)} a month ${to > from ? 'more' : 'less'} at full delivery.` : '';
        return okv;
      }
      if (kind === 'min_spend') {
        const mn = $w('#v2edmin').value === '' ? 0 : +$w('#v2edmin').value, cp = $w('#v2edcap').value === '' ? 0 : +$w('#v2edcap').value;
        const parts = [];
        if (Math.round(mn * 100) !== Math.round((o.min || 0) * 100)) parts.push(`<span>min ${o.min ? money(o.min, cur) : 'none'}</span><i>→</i><b>${mn ? money(mn, cur) : 'none'}</b>`);
        if (Math.round(cp * 100) !== Math.round((o.cap || 0) * 100)) parts.push(`<span>cap ${o.cap ? money(o.cap, cur) : 'none'}</span><i>→</i><b>${cp ? money(cp, cur) : 'none'}</b>`);
        ba.innerHTML = parts.length ? parts.join('<span class="sep"></span>') : '<span class="faint">Nothing changed yet.</span>';
        return parts.length > 0;
      }
      return true;
    };
    w.querySelectorAll('input').forEach(i => i.oninput = () => { yes.disabled = !preview() || (kind === 'rename' && (!i.value.trim() || i.value.trim() === name)); });
    yes.disabled = !preview() || kind === 'rename';
    const first = w.querySelector('input'); if (first) { first.focus(); first.select(); } else yes.focus();
    yes.onclick = async () => {
      const body2 = { act: H.S.act, kind, level: lv, object: id, expect };
      if (kind === 'budget') body2.amount = +$w('#v2edv').value;
      if (kind === 'min_spend') { body2.min = $w('#v2edmin').value === '' ? 0 : +$w('#v2edmin').value; body2.cap = $w('#v2edcap').value === '' ? 0 : +$w('#v2edcap').value; }
      if (kind === 'rename' || kind === 'duplicate') body2.name = $w('#v2edv').value.trim();
      if (kind === 'duplicate' && $w('#v2edb')) body2.daily_budget = +$w('#v2edb').value;
      if (kind === 'duplicate') delete body2.expect;
      yes.disabled = true; yes.textContent = 'Writing to Meta…'; err.hidden = true;
      let r; try { r = await H.apiAH('/api/meta/write', { method: 'POST', body: JSON.stringify(body2) }); } catch (e) { r = { error: e.message }; }
      if (!r || r.error) { err.textContent = (r && r.error) || 'Meta did not answer.'; err.hidden = false; yes.disabled = false; yes.textContent = cta; return; }
      close(); applyLocal(lv, id, r.after, b);
      dropHubCache(); redraw();
      if (r.write) rememberWrite({ write: r.write, summary: shortSummary(r.summary), act: H.S.act, at: Date.now() });
      if (MWIRE && MWIRE.liveEl()) { MWIRE.liveEl().innerHTML = liveLine(); MWIRE.wireLive(); }
      wtoast(kind === 'duplicate' ? `Copied, paused. It shows here after the next Meta sync.` : shortSummary(r.summary), false, r.write ? () => undoMeta(r.write, b, cur, redraw) : null);
    };
  }
  const shortSummary = s => String(s || 'Done').replace(/^[^:]+:\s*/, '');
  function applyLocal(lv, id, after, b) {
    if (!after || !MLIVE) return;
    const L = lv === 'campaign' ? 0 : lv === 'adset' ? 1 : 2, o = liveOf(L, id); if (!o) return;
    if (after.status) o.status = o.eff = after.status;
    if (after.daily_budget != null) o.daily = +after.daily_budget / 100 || null;
    if (after.lifetime_budget != null) o.lifetime = +after.lifetime_budget / 100 || null;
    if (after.daily_min_spend_target != null) o.min = +after.daily_min_spend_target / 100 || null;
    if (after.daily_spend_cap != null) o.cap = +after.daily_spend_cap / 100 || null;
    if (after.name) { o.name = after.name; const r = findRow(b, lv, id); if (r) r.name = after.name; }
  }
  /* The hub caches /api/hub/* for 5 minutes; a write makes those copies stale. */
  const dropHubCache = () => { for (const k of [...CACHE.keys()]) if (k.startsWith('/api/hub/paid') || k.startsWith('/api/hub/creative')) CACHE.delete(k); };
  const LASTW = 'pf_mw_last';
  const lastWrite = () => { try { const l = JSON.parse(localStorage.getItem(LASTW) || 'null'); return l && l.act === H.S.act && Date.now() - l.at < 24 * 3600e3 ? l : null; } catch { return null; } };
  const rememberWrite = l => { try { localStorage.setItem(LASTW, JSON.stringify(l)); } catch {} };
  async function undoMeta(write, b, cur, redraw) {
    wtoast('Undoing…', false, null, 1500);
    let r; try { r = await H.apiAH('/api/meta/undo', { method: 'POST', body: JSON.stringify({ act: H.S.act, write }) }); } catch (e) { r = { error: e.message }; }
    if (!r || r.error) { wtoast((r && r.error) || 'Could not undo.', true); return; }
    if (r.before) applyLocal(r.level, r.object, r.before, b);
    try { const l = JSON.parse(localStorage.getItem(LASTW) || 'null'); if (l && l.write === write) localStorage.removeItem(LASTW); } catch {}
    dropHubCache(); redraw(); if (MWIRE && MWIRE.liveEl()) { MWIRE.liveEl().innerHTML = liveLine(); MWIRE.wireLive(); }
    wtoast(r.after && r.after.created ? 'Undone: the copy is archived.' : 'Undone. Meta has the old value back.');
  }
  /* One toast with an optional Undo, ~12 seconds when it can be undone. */
  function wtoast(msg, bad, undo, ms) {
    document.querySelectorAll('.lx-toast.v2wt').forEach(x => x.remove());
    const t = document.createElement('div'); t.className = 'lx-toast v2wt' + (bad ? ' bad' : ''); t.setAttribute('role', 'status');
    t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Undo</button>' : ''}`;
    if (undo) t.querySelector('button').onclick = () => { t.remove(); undo(); };
    document.body.appendChild(t); setTimeout(() => t.remove(), ms || (undo ? 12000 : bad ? 6000 : 3000));
  }
  function metaAll(d, title) {
    const bs = d.brands.filter(b => b.cur.spend > 0); const cur = oneCur(bs);
    const T = k => bs.reduce((s, b) => s + (b.cur[k] || 0), 0), P = k => bs.reduce((s, b) => s + ((b.prev || {})[k] || 0), 0);
    const spend = T('spend'), rev = T('revenue'), ord = T('purchases'), pspend = P('spend'), prev = P('revenue'), pord = P('purchases');
    const mx = Math.max(...bs.map(b => b.cur.spend), 1);
    /* All brands get the same tiles and chart as one brand (2026-10-09): the brands' day rows added up by date. */
    const K = ['spend', 'impressions', 'clicks', 'purchases', 'revenue'];
    const rows = mergeDays(bs.map(b => b.series || []), K).map(ratios), prows = mergeDays(bs.map(b => b.prev_series || []), K).map(ratios);
    const imp = T('impressions'), clk = T('clicks'), pimp = P('impressions'), pclk = P('clicks'), pend = bs.some(b => b.cur.attr_pending);
    const cAll = { spend, impressions: imp, clicks: clk, purchases: pend ? null : ord, revenue: pend ? null : rev, platform_purchases: T('platform_purchases'), platform_revenue: T('platform_revenue'), roas: spend && !pend ? rev / spend : null, cpa: ord && !pend ? spend / ord : null, cpm: imp ? spend * 1000 / imp : null, ctr: imp ? clk / imp : null, cpc: clk ? spend / clk : null, attr_pending: pend };
    const pAll = { spend: pspend, purchases: pord, revenue: prev, roas: pspend ? prev / pspend : null, cpa: pord ? pspend / pord : null, cpm: pimp ? pspend * 1000 / pimp : null, ctr: pimp ? pclk / pimp : null };
    const body = `${cur ? `<div class="v2tiles">${paidTiles(cAll, pAll, rows, prows, cur, {}, 'META', 'Meta')}${tile({ compact: true, label: 'Brands spending', value: int(bs.length), sub: `of ${d.brands.length} in Locus` })}</div>
      ${paidChart('v2mall', rows, prows, cur, 'Spend and revenue by day, every brand', `Revenue credited to Meta under ${esc(MODEL_SHORT[H.S.model])}; spend is Meta’s own.`)}` : ''}
      ${card('Each brand on Meta', 'Click a brand to open its Meta screen.', `<div class="v2tbl"><table><thead><tr><th>Brand</th><th>Spend</th><th>Purchases</th><th>Revenue</th><th>ROAS</th><th>CPA</th><th>Goal CPA</th><th>CPM</th><th>CTR</th><th>Hook</th></tr></thead><tbody>
        ${bs.sort((x, y) => y.cur.spend - x.cur.spend).map(b => { const c = b.cur, p = b.prev || {}, g = b.goals || {}; return `<tr data-act="${esc(b.act_id)}" tabindex="0" class="link"><td><b>${esc(b.name)}</b></td><td>${ib(c.spend, mx, '--c-meta', kmoney(c.spend, b.currency))}</td><td>${int(c.purchases)} ${delta(c.purchases, p.purchases)}</td><td>${kmoney(c.revenue, b.currency)}</td><td>${x2(c.roas)}</td>
          <td class="${!g.cpa || c.cpa == null ? '' : c.cpa <= g.cpa ? 'good' : 'bad'}">${money(c.cpa, b.currency)} ${delta(c.cpa, p.cpa, true)}</td><td class="faint">${g.cpa ? money(g.cpa, b.currency) : '–'}</td><td>${money2(c.cpm, b.currency)}</td><td>${pct(c.ctr, 2)}</td><td>${pct(c.hook, 0)}</td></tr>`; }).join('')}
      </tbody></table></div>`, `Attribution: <b>${esc(MODEL_SHORT[H.S.model])}</b>`)}`;
    $('#main').innerHTML = shell('meta', title, body); wireRows($('#main'), 'meta');
    if (cur) wirePaidChart('v2mall', rows, prows, cur);
  }

  /* =========================================================================================
   * PAID > CREATIVE: what is working, by component, and when it tires
   * ======================================================================================= */
  let CR_SORT = (() => { try { return localStorage.getItem('pf_cr_sort') || 'spend'; } catch { return 'spend'; } })();
  /* MOTION'S PIECES (2026-10-09): one card per creative, AI tags, compare, saved views. */
  let CR_GROUP = (() => { try { return localStorage.getItem('pf_cr_group') === '1'; } catch { return false; } })();
  let CR_TAG = null, CR_WIN = null, CR_MEDC = null;
  const CR_PICK = new Set();
  /* [key, label, value, direction, ratio]. A ratio sort only ranks ads past the judging bar. */
  const SORT_DEF = [
    ['spend', 'Spend', r => r.spend, -1], ['purchases', 'Purchases', r => r.purchases || 0, -1],
    ['roas', 'ROAS', r => r.roas, -1, 1], ['cpa', 'CPA', r => r.cpa, 1, 1],
    ['hook', 'Hook rate', r => r.hook, -1, 1], ['hold', 'Hold rate', r => r.hold, -1, 1],
    ['ctr', 'CTR', r => r.ctr, -1, 1], ['ltv', '90-day value', r => r.ltv_n >= 5 ? r.ltv_x : null, -1],
    ['newest', 'Newest', r => r.age, 1]];
  function sortAds(list, key, bar) {
    const s = SORT_DEF.find(x => x[0] === key) || SORT_DEF[0];
    const pool = list.filter(r => s[2](r) != null && isFinite(s[2](r)) && (!s[4] || r.spend >= bar));
    return { s, list: pool.sort((p, q) => (s[2](p) - s[2](q)) * s[3] || q.spend - p.spend), left: list.length - pool.length };
  }
  const TAG_DIMS = [['format', 'Format'], ['hook', 'Hook'], ['person', 'Who is on screen'], ['product', 'The product'], ['offer', 'Offer'], ['text_on_image', 'Words on the ad']];
  /* ONE CARD PER CREATIVE: ads running the same video or image (ads.asset_key) add up into one card,
     led by the ad that spent most. Hook, hold and the drop-off curve are weighted by impressions. */
  function groupAds(ads) {
    const by = new Map();
    for (const r of ads) { const k = r.asset_key || r.id; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
    return [...by.values()].map(list => {
      if (list.length === 1) return { ...list[0], n_ads: 1, ids: [list[0].id] };
      const top = list.slice().sort((p, q) => q.spend - p.spend)[0];
      const sum = f => list.reduce((x, r) => x + (r[f] || 0), 0);
      const spend = sum('spend'), imp = sum('impressions'), pur = sum('purchases'), rev = sum('revenue'), clk = sum('clicks');
      const w = get => { let a = 0, b = 0; for (const r of list) { const v = get(r); if (v != null && r.impressions) { a += v * r.impressions; b += r.impressions; } } return b ? a / b : null; };
      const curve = list.some(r => r.curve) ? [0, 1, 2, 3, 4].map(i => w(r => r.curve ? r.curve[i] : null)) : null;
      return { ...top, spend, impressions: imp, purchases: pur, revenue: rev, clicks: clk, cpa: pur ? spend / pur : null, roas: spend ? rev / spend : null, ctr: imp ? clk / imp : null, cpm: imp ? spend * 1000 / imp : null,
        hook: w(r => r.hook), hold: w(r => r.hold), curve, age: Math.max(...list.map(r => r.age ?? 0)), adset: null, set_share: null, set_rank: null, n_ads: list.length, ids: list.map(r => r.id) };
    }).sort((p, q) => q.spend - p.spend);
  }
  async function creative(first) {
    const t = H.RUN(); const a = H.S.accounts.find(x => x.act_id === H.S.act);
    if (!a) { $('#main').innerHTML = shell('adcreative', 'Meta ads', `<div class="v2card"><p class="v2hint">Pick one brand in the menu to see its ads.</p></div>`); return; }
    const title = `Meta ads: ${esc(a.name)}`;
    if (noMeta(a)) { $('#main').innerHTML = shell('adcreative', title, noMetaCard(a)); return; }
    if (first) $('#main').innerHTML = shell('adcreative', title, `<p class="v2say lead v2sk"><i class="r"></i></p><section class="v2card v2sk"><i class="h"></i>${skGal(8)}</section>`);
    let d, RR = {}; try { [d, RR] = await Promise.all([get(`/api/hub/creative?act=${encodeURIComponent(a.act_id)}&${H.rangeQ()}${modelQ()}`), get(`/api/brand/rules?act=${encodeURIComponent(a.act_id)}`).then(x => x.rules || {}).catch(() => ({}))]); } catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('adcreative', title, `<div class="v2card"><p class="v2bad">${esc(e.message)}</p></div>`); return; }
    if (t !== H.RUN()) return;
    const cur = d.currency, g = d.goals || {}, ads = d.ads || [];
    const goal = g.cpa || (() => { const s = ads.reduce((x, r) => x + r.spend, 0), o = ads.reduce((x, r) => x + r.purchases, 0); return o ? s / o : null; })();
    /* THE RULE (2026-10-08, shown on screen): an ad is judged once it has spent one goal CPA and
       run 3 days. Scale = 2+ purchases at or under goal. Cut = 3x the goal spent with no purchase
       (an ad truly on goal has about a 5% chance of that), or 2x spent at a CPA over 1.5x goal.
       Everything judged in between is Watch. */
    /* The numbers are the brand's own (Settings > brand > Goals > Creative calls), defaults below. */
    const K = { jx: +RR.cr_judge_x || 1, days: +RR.cr_min_days || 3, buys: +RR.cr_scale_buys || 2, zx: +RR.cr_cut_zero_x || 3, sx: +RR.cr_cut_spend_x || 2, cx: +RR.cr_cut_cpa_x || 1.5, anchor: (+RR.cr_anchor_pct || 50) / 100 };
    /* THE AD SET FIRST, THE AD BY ITS ROLE (Cole, 2026-10-08). Meta spends an ad set as one system: the
       ad taking most of the budget is usually the broad opener, and the smaller ads with prettier numbers
       often convert the people it warmed. Cutting the opener can sink the set. So:
         the SET is judged on its own totals with the same thresholds;
         a set that misses -> every ad in it reads Cut (the set goes, not one ad);
         the ANCHOR (the ad with the biggest share, cr_anchor_pct of the set or more) in a working set reads
           Keep, even when its own CPA looks worse: replace it with a better opener, never just switch it off;
         a SUPPORT ad that would be cut on its own reads Trim: low risk, it carries little of the set;
         a single-ad set is judged as the ad. */
    /* CUSTOMER VALUE IS SHOWN, NOT AUTOMATED (2026-10-08, after Cole asked whether moving the goal by rule
       was too much: it was). The calls use the brand's goal as agreed with the client. Next to them, an ad
       whose customers come back clearly more (or less) than the brand's average ad carries a plain tag, and
       the buyer decides whether that is worth a higher cost per purchase. Needs 10+ known customers. */
    const known = ads.filter(r => r.ltv_n >= 10 && r.ltv_first);
    const brandX = (() => { const f = known.reduce((s0, r) => s0 + r.ltv_first * r.ltv_n, 0), v = known.reduce((s0, r) => s0 + r.ltv90 * r.ltv_n, 0); return f ? v / f : null; })();
    const valTag = r => !brandX || !(r.ltv_n >= 10) || !r.ltv_x ? null : r.ltv_x >= brandX * 1.2 ? 'more' : r.ltv_x <= brandX * 0.85 ? 'less' : null;
    const valNote = r => { const t = valTag(r); if (!t) return ''; return t === 'more'
      ? `People this ad brought in spent ${money(r.ltv90, cur)} each in their first 90 days, ${x2(r.ltv_x)} their first order. The brand's average ad gets ${x2(brandX)}. They come back more, so this ad can afford a higher cost per purchase than the goal. The call above does not include this; it is your judgment.`
      : `People this ad brought in spent ${money(r.ltv90, cur)} each in their first 90 days, ${x2(r.ltv_x)} their first order, against ${x2(brandX)} for the brand's average ad. They come back less than usual.`; };
    const own = r => { const G = goal; if (!goal) return 'nogoal'; if (r.age != null && r.age < K.days) return 'new'; if (r.spend < goal * K.jx) return 'thin';
      if (r.purchases >= K.buys && r.cpa <= G) return 'scale';
      if ((!r.purchases && r.spend >= G * K.zx) || (r.purchases && r.spend >= G * K.sx && r.cpa > G * K.cx)) return 'cut';
      return 'watch'; };
    const setCall = x => { const G = goal; if (!goal || !x) return null; if (x.spend < goal * K.jx) return 'thin'; if (x.purchases >= K.buys && x.cpa <= G) return 'scale';
      if ((!x.purchases && x.spend >= G * K.zx) || (x.purchases && x.spend >= G * K.sx && x.cpa > G * K.cx)) return 'cut'; return 'watch'; };
    const role = r => !r.adset || r.adset.ads <= 1 ? 'solo' : (r.set_share >= K.anchor || (r.set_rank === 1 && r.set_share >= K.anchor - 0.1)) ? 'anchor' : 'support';
    const funnelRole = r => r.fc_rev == null || r.lc_rev == null || (r.fc_rev + r.lc_rev) < (goal || 50) ? null : r.fc_rev >= r.lc_rev * 1.3 ? 'opener' : r.lc_rev >= r.fc_rev * 1.3 ? 'closer' : null;
    const verdict = r => { const o = own(r); if (o === 'new' || o === 'thin' || o === 'nogoal') return o; const sc = setCall(r.adset), ro = role(r);
      if (ro === 'solo' || !sc || sc === 'thin') return o;
      if (sc === 'cut') return 'cut';
      if (ro === 'anchor') return o === 'scale' ? 'scale' : sc === 'watch' && o === 'cut' ? 'watch' : 'keep';
      return o === 'cut' ? 'trim' : o; };
    const whyOf = r => { const vn = valNote(r); return [whyBase(r), vn].filter(Boolean).join(' '); };
    const whyBase = r => { const sc = setCall(r.adset), ro = role(r), x = r.adset, o = own(r);
      const setTxt = x ? `its ad set${x.name ? ` "${x.name}"` : ''} spent ${kmoney(x.spend, cur)} at ${money(x.cpa, cur)} per purchase (${sc === 'scale' ? 'on goal' : sc === 'cut' ? 'missing the goal' : sc === 'watch' ? 'close to goal' : 'not judged yet'})` : '';
      const v = verdict(r);
      if (v === 'cut' && sc === 'cut' && ro !== 'solo') return `The whole set misses: ${setTxt}. Turn off the ad set, not one ad.`;
      if (v === 'keep') return `Carries ${pct(r.set_share, 0)} of the set, and ${setTxt}. Its own cost per purchase is ${money(r.cpa, cur)}, but the set works through it: keep it, and test a new opener beside it before switching it off.`;
      if (v === 'watch' && ro === 'anchor' && o === 'cut') return `Carries ${pct(r.set_share, 0)} of the set and looks weak on its own, but ${setTxt}. Replace it with a stronger opener rather than switching it off.`;
      if (v === 'trim') return `Takes only ${pct(r.set_share, 0)} of the set and is over the cut line on its own; ${setTxt}. Low risk to switch off.`;
      if (ro === 'support' && v === 'scale') return `Beats the goal on ${pct(r.set_share, 0)} of the set's spend. Worth its own ad set to see if it holds at more budget.`;
      return x && ro !== 'solo' ? `${ro === 'anchor' ? 'Carries' : 'Takes'} ${pct(r.set_share, 0)} of the set; ${setTxt}.` : ''; };
    const VL = { scale: ['Scale', 'good'], keep: ['Keep: carries the set', 'good'], watch: ['Watch', 'warn'], trim: ['Trim', 'warn'], cut: ['Cut', 'bad'], thin: ['Not enough spend', ''], new: ['Too new', ''], nogoal: ['No goal CPA', ''] };
    const FR = { opener: ['Opener', 'Triple Whale credits it far more on first click: it starts journeys (top of funnel).'], closer: ['Closer', 'Triple Whale credits it more on the last click: it closes people already warmed up.'] };
    MED = medians(ads, goal || 50);
    const bar = (goal || 50) * K.jx;   // the judging bar; RULE below and the sort row both use it
    const RULE = `<b>The ad set first.</b> A set (and an ad) is judged once it has spent ${K.jx}x the goal CPA (${money(bar, cur)}${g.cpa ? '' : goal ? ', from the account average: no goal CPA set' : ', a placeholder: no goal CPA set'}) and run ${K.days} days. <b>Scale</b>: ${K.buys}+ purchases at or under the goal. <b>Cut</b>: ${K.zx}x the goal spent with no purchase, or ${K.sx}x spent at a CPA over ${K.cx}x the goal. A set that misses means <b>Cut</b> for every ad in it. In a set that works, the ad carrying ${Math.round(K.anchor * 100)}%+ of its spend reads <b>Keep</b> (replace it, never just switch it off) and a small ad over the cut line reads <b>Trim</b>. <button type="button" class="v2link" data-go="settings">Change these ›</button>`;
    const top = ads.slice(0, 60);
    const VCOL = { scale: '--good', keep: '--c-meta', watch: '--warn', trim: '--warn', cut: '--bad', thin: '--v2-cmp', new: '--v2-cmp', nogoal: '--v2-cmp' };
    const ctxOf = r => ({ call: VL[verdict(r)], why: whyOf(r), role: role(r), fr: funnelRole(r) && FR[funnelRole(r)], set: r.adset, setCall: setCall(r.adset) });
    const open = r => previewAd(r, cur, g, ctxOf(r));
    /* WHERE EVERY AD SITS / HOOK AGAINST HOLD (2026-10-09, Cole: every dot opens its ad). One scatter drawer: labelled
       axes, gridlines, every dot a focusable button (hover or focus = the ad's name and numbers, click or Enter = the
       preview). Listeners are delegated on the svg, never one per dot. */
    const scatter = o => {
      const w = 600, h = 340, pl = 64, pr = 16, pt = 16, pb = 46; const pts = o.pts;
      if (pts.length < 3) return `<p class="v2hint">${o.empty}</p>`;
      const X = v => pl + o.xs(v) * (w - pl - pr), Y = v => pt + (1 - o.ys(v)) * (h - pt - pb);
      const grid = o.yt.map(v => `<line x1="${pl}" x2="${w - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--v2-grid)"/><text x="${pl - 8}" y="${(Y(v) + 4).toFixed(1)}" font-size="12" text-anchor="end" fill="var(--muted)">${o.yf(v)}</text>`).join('')
        + o.xt.map(v => `<line x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${pt}" y2="${h - pb}" stroke="var(--v2-grid)" stroke-dasharray="2 4"/><text x="${X(v).toFixed(1)}" y="${h - pb + 18}" font-size="12" text-anchor="middle" fill="var(--muted)">${o.xf(v)}</text>`).join('');
      const dots = pts.map((r, i) => { const c = `var(${VCOL[verdict(r)] || '--v2-cmp'})`; return `<circle data-i="${i}" tabindex="0" role="button" aria-label="${esc(r.name)}: open the ad" cx="${X(o.x(r)).toFixed(1)}" cy="${Y(o.y(r)).toFixed(1)}" r="${o.r(r).toFixed(1)}" fill="${c}" fill-opacity=".5" stroke="${c}" stroke-width="1.3"/>`; }).join('');
      return `<div class="v2chart v2sc"><svg id="${o.id}" viewBox="0 0 ${w} ${h}" role="group" aria-label="${esc(o.aria)}">${grid}${o.extra ? o.extra(X, Y, w, h, pl, pr, pt, pb) : ''}
        <line x1="${pl}" x2="${w - pr}" y1="${h - pb}" y2="${h - pb}" stroke="var(--line-strong)"/><line x1="${pl}" x2="${pl}" y1="${pt}" y2="${h - pb}" stroke="var(--line-strong)"/>
        <text x="${(pl + w - pr) / 2}" y="${h - 6}" font-size="12.5" font-weight="600" text-anchor="middle" fill="var(--ink-2)">${esc(o.xl)}</text>
        <text x="16" y="${(pt + h - pb) / 2}" font-size="12.5" font-weight="600" text-anchor="middle" fill="var(--ink-2)" transform="rotate(-90 16 ${(pt + h - pb) / 2})">${esc(o.yl)}</text>${dots}</svg><div class="v2tip"></div></div>`;
    };
    const wireScatter = (id, pts, tipFn) => {
      const s = document.getElementById(id); if (!s) return; const tip = s.parentNode.querySelector('.v2tip'); let on = null;
      const show = (cEl, cx, cy) => { const r = pts[+cEl.dataset.i]; if (!r) return; if (on && on !== cEl) on.classList.remove('hot'); on = cEl; cEl.classList.add('hot');
        const box = s.getBoundingClientRect(); tip.innerHTML = tipFn(r) + '<br><span class="faint">Click to open the ad</span>'; tip.style.display = 'block';
        let left = cx - box.left + 14; if (left + tip.offsetWidth > box.width) left = cx - box.left - tip.offsetWidth - 14; tip.style.left = Math.max(0, left) + 'px'; tip.style.top = Math.max(0, cy - box.top - tip.offsetHeight - 10) + 'px'; };
      const hide = () => { tip.style.display = 'none'; if (on) on.classList.remove('hot'); on = null; };
      s.addEventListener('pointerover', e => { if (e.pointerType !== 'mouse' || !matchMedia('(hover: hover)').matches) return; const c = e.target.closest('circle[data-i]'); if (c) show(c, e.clientX, e.clientY); });   // a tap opens the ad at once: no hover tip in its way
      s.addEventListener('pointerout', e => { if (e.target.closest('circle[data-i]')) hide(); });
      s.addEventListener('focusin', e => { const c = e.target.closest('circle[data-i]'); if (c) { const b = c.getBoundingClientRect(); show(c, b.left + b.width / 2, b.top); } });
      s.addEventListener('focusout', hide);
      const go = e => { const c = e.target.closest('circle[data-i]'); if (!c) return; hide(); const r = pts[+c.dataset.i]; if (r) open(r); };
      s.addEventListener('click', go);
      s.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } });
    };
    const qPts = top.filter(r => r.spend > 0);
    const quad = (() => {
      if (qPts.length < 3) return scatter({ pts: [], empty: 'Not enough ads with spend.' });
      const sMax = Math.max(...qPts.map(r => r.spend)), sMin = Math.max(1, Math.min(...qPts.map(r => r.spend)));
      const lx0 = Math.log10(sMin), lx1 = Math.max(lx0 + 0.3, Math.log10(sMax));
      const cpas = qPts.map(r => r.cpa ?? (goal ? goal * 3 : 0)); const ymx = Math.min(Math.max(...cpas, goal || 0) * 1.1, (goal || Math.max(...cpas)) * 4) || 1;
      return scatter({ id: 'v2quad', pts: qPts, aria: 'Every ad by spend and cost per purchase',
        x: r => r.spend, y: r => Math.min(r.cpa ?? ymx, ymx), r: r => 5 + Math.sqrt(r.purchases || 0) * 2.4,
        xs: v => (Math.log10(Math.max(1, v)) - lx0) / (lx1 - lx0), ys: v => v / ymx,
        xt: [10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000].filter(v => Math.log10(v) >= lx0 - 0.02 && Math.log10(v) <= lx1 + 0.02), xf: v => kmoney(v, cur),
        yt: [0, 0.25, 0.5, 0.75, 1].map(f => ymx * f), yf: v => money(v, cur),
        xl: 'Spend in these dates (log scale)', yl: 'Cost per purchase',
        extra: (X, Y, w, h, pl, pr, pt) => `<rect x="${pl}" y="${pt - 8}" width="${w - pl - pr}" height="16" fill="var(--bad)" fill-opacity=".06"/><text x="${w - pr - 4}" y="${pt - 12}" font-size="11" text-anchor="end" fill="var(--muted)">Top line: no purchases yet, or off the scale</text>` + (goal ? `<line x1="${pl}" x2="${w - pr}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}" stroke="var(--brand)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${w - pr - 4}" y="${(Y(goal) - 6).toFixed(1)}" font-size="12" font-weight="600" text-anchor="end" fill="var(--brand)">${g.cpa ? 'Goal' : 'Account average'} ${money(goal, cur)}</text>` : '') });
    })();
    const hhPts = top.filter(r => r.hook != null && r.hold != null && r.spend > 20);
    const hookhold = (() => {
      if (hhPts.length < 3) return scatter({ pts: [], empty: 'Not enough video ads with spend in these dates.' });
      const hx = Math.max(...hhPts.map(r => r.hook)) * 1.1 || 1, hy = Math.max(...hhPts.map(r => r.hold)) * 1.1 || 1;
      const mh = hhPts.reduce((s0, r) => s0 + r.hook, 0) / hhPts.length, mo = hhPts.reduce((s0, r) => s0 + r.hold, 0) / hhPts.length;
      const ticks = mx => [0, 0.25, 0.5, 0.75, 1].map(f => mx / 1.1 * f);
      return scatter({ id: 'v2hh', pts: hhPts, aria: 'Video ads by hook rate and hold rate',
        x: r => r.hook, y: r => r.hold, r: r => 5 + Math.sqrt(r.spend) / 7,
        xs: v => v / hx, ys: v => v / hy, xt: ticks(hx), xf: v => pct(v, 0), yt: ticks(hy), yf: v => pct(v, 0),
        xl: 'Hook rate: 3-second views per impression', yl: 'Hold rate: watched on after 3 seconds',
        extra: (X, Y, w, h, pl, pr, pt, pb) => `<line x1="${X(mh).toFixed(1)}" x2="${X(mh).toFixed(1)}" y1="${pt}" y2="${h - pb}" stroke="var(--ink-2)" stroke-opacity=".45" stroke-dasharray="4 4"/><line x1="${pl}" x2="${w - pr}" y1="${Y(mo).toFixed(1)}" y2="${Y(mo).toFixed(1)}" stroke="var(--ink-2)" stroke-opacity=".45" stroke-dasharray="4 4"/>
          <text x="${w - pr - 4}" y="${pt + 12}" font-size="12" font-weight="600" text-anchor="end" fill="var(--good)">Stops the scroll and keeps them</text><text x="${pl + 6}" y="${h - pb - 8}" font-size="12" fill="var(--muted)">Loses them early</text>
          <text x="${(X(mh) + 4).toFixed(1)}" y="${h - pb - 8}" font-size="11" fill="var(--muted)">avg hook ${pct(mh, 0)}</text><text x="${pl + 6}" y="${(Y(mo) - 5).toFixed(1)}" font-size="11" fill="var(--muted)">avg hold ${pct(mo, 0)}</text>` });
    })();
    const callLegend = `<p class="v2lgline"><span class="v2lgk"><i style="background:var(--good)"></i>Scale</span><span class="v2lgk"><i style="background:var(--c-meta)"></i>Keep</span><span class="v2lgk"><i style="background:var(--warn)"></i>Watch or trim</span><span class="v2lgk"><i style="background:var(--bad)"></i>Cut</span><span class="v2lgk"><i style="background:var(--v2-cmp)"></i>Not judged yet</span><span class="v2lgsep">Colour is the call;</span>`;
    /* WHEN ADS TIRE (2026-10-09): cost per purchase by how long an ad has been live, as columns with the goal as a
       dashed line and the value on each column. The conclusion sits above the chart as the card's first line. */
    const fat = d.fatigue || [];
    const firstFat = fat.find((f, i) => i > 0 && goal && f.cpa > goal * 1.2 && f.spend > 100);
    const fatigue = (() => {
      const pts = fat.filter(f => f.spend > 0); if (pts.length < 2) return '<p class="v2hint">Not enough spend across ad ages yet.</p>';
      const w = 600, h = 260, pl = 60, pr = 64, pt = 22, pb = 52, n = pts.length, slot = (w - pl - pr) / n, bw = Math.min(56, slot * 0.6);
      const ymx = Math.max(...pts.map(f => f.cpa || 0), goal || 0) * 1.15 || 1, Y = v => pt + (1 - v / ymx) * (h - pt - pb);
      const yt = [0, 0.25, 0.5, 0.75, 1].map(f => ymx * f);
      const col = f => !f.cpa ? 'var(--v2-cmp)' : goal && f.cpa > goal * 1.3 ? 'var(--bad)' : goal && f.cpa > goal ? 'var(--warn)' : 'var(--good)';
      return `<div class="v2chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Cost per purchase by days live">
        ${yt.map(v => `<line x1="${pl}" x2="${w - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--v2-grid)"/><text x="${pl - 8}" y="${(Y(v) + 4).toFixed(1)}" font-size="12" text-anchor="end" fill="var(--muted)">${money(v, cur)}</text>`).join('')}
        ${pts.map((f, i) => { const cx = pl + slot * i + slot / 2, v = f.cpa || 0; return `<g${tipAttr(`<b>${esc(f.label)}</b><br>${f.cpa ? `${money(f.cpa, cur)} per purchase` : 'no purchases'} on ${kmoney(f.spend, cur)} of spend${f.ads ? ` · ${f.ads} ads` : ''}${goal ? `<br>${g.cpa ? 'goal' : 'account average'} ${money(goal, cur)}` : ''}`)}><rect x="${(cx - bw / 2).toFixed(1)}" y="${Y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h - pb - Y(v)).toFixed(1)}" rx="4" fill="${col(f)}" fill-opacity=".85"/>
          <text x="${cx.toFixed(1)}" y="${(Y(v) - 6).toFixed(1)}" font-size="12" font-weight="600" text-anchor="middle" fill="var(--ink)">${f.cpa ? money(f.cpa, cur) : 'none'}</text>
          <text x="${cx.toFixed(1)}" y="${h - pb + 17}" font-size="12" text-anchor="middle" fill="var(--ink-2)">${esc(f.label)}</text><text x="${cx.toFixed(1)}" y="${h - pb + 32}" font-size="11" text-anchor="middle" fill="var(--muted)">${kmoney(f.spend, cur)}</text></g>`; }).join('')}
        ${goal ? `<line x1="${pl}" x2="${w - pr}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}" stroke="var(--brand)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${w - pr + 6}" y="${(Y(goal) + 4).toFixed(1)}" font-size="12" font-weight="600" text-anchor="start" fill="var(--brand)">${g.cpa ? 'Goal' : 'Avg'} ${money(goal, cur)}</text>` : ''}
        <line x1="${pl}" x2="${w - pr}" y1="${h - pb}" y2="${h - pb}" stroke="var(--line-strong)"/>
        <text x="${(pl + w - pr) / 2}" y="${h - 4}" font-size="12.5" font-weight="600" text-anchor="middle" fill="var(--ink-2)">Days since the ad first spent (spend under each)</text></svg></div>`;
    })();
    /* ARE WE LAUNCHING ENOUGH? (2026-10-09): ads launched per week as columns (left axis), spend on ads under 14
       days old as a line (right axis), the conclusion above. */
    const wk = d.weeks || [];
    const cadence = (() => {
      if (wk.length < 2) return '<p class="v2hint">Not enough weeks in the data yet.</p>';
      const w = 600, h = 260, pl = 44, pr = 60, pt = 22, pb = 46, n = wk.length, slot = (w - pl - pr) / n, bw = Math.min(34, slot * 0.6);
      const fresh = x => x.fresh != null ? x.fresh : (x.fresh_share || 0) * (x.spend || 0);
      const lmx = Math.max(...wk.map(x => x.launched), 1) * 1.15, smx = Math.max(...wk.map(fresh), 1) * 1.15;
      const Yl = v => pt + (1 - v / lmx) * (h - pt - pb), Ys = v => pt + (1 - v / smx) * (h - pt - pb);
      const cx = i => pl + slot * i + slot / 2;
      const line = wk.map((x, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${Ys(fresh(x)).toFixed(1)}`).join('');
      const lt = [0, 0.5, 1].map(f => Math.round(lmx / 1.15 * f)), st0 = [0, 0.5, 1].map(f => smx / 1.15 * f);
      return `<div class="v2chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Ads launched per week and spend on new ads">
        ${lt.map(v => `<line x1="${pl}" x2="${w - pr}" y1="${Yl(v).toFixed(1)}" y2="${Yl(v).toFixed(1)}" stroke="var(--v2-grid)"/><text x="${pl - 8}" y="${(Yl(v) + 4).toFixed(1)}" font-size="12" text-anchor="end" fill="var(--muted)">${v}</text>`).join('')}
        ${st0.map(v => `<text x="${w - pr + 8}" y="${(Ys(v) + 4).toFixed(1)}" font-size="12" fill="var(--c-email)">${kmoney(v, cur)}</text>`).join('')}
        ${wk.map((x, i) => `<g${tipAttr(`<b>Week of ${day(x.week)}</b><br>${x.launched} new ad${x.launched === 1 ? '' : 's'} launched<br>${kmoney(fresh(x), cur)} spent on ads under 14 days old (${pct(x.fresh_share, 0)} of the week)`)}><rect x="${(cx(i) - slot / 2).toFixed(1)}" y="${pt}" width="${slot.toFixed(1)}" height="${h - pt - pb}" fill="transparent"/><rect x="${(cx(i) - bw / 2).toFixed(1)}" y="${Yl(x.launched).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h - pb - Yl(x.launched)).toFixed(1)}" rx="3" fill="var(--brand)" fill-opacity=".8"/>
          ${(n - 1 - i) % Math.ceil(n / 6) === 0 ? `<text x="${cx(i).toFixed(1)}" y="${h - pb + 17}" font-size="11.5" text-anchor="middle" fill="var(--muted)">${day(x.week)}</text>` : ''}</g>`).join('')}
        <path d="${line}" fill="none" stroke="var(--c-email)" stroke-width="2.2" pointer-events="none"/>${wk.map((x, i) => `<circle cx="${cx(i).toFixed(1)}" cy="${Ys(fresh(x)).toFixed(1)}" r="3" fill="var(--c-email)" pointer-events="none"/>`).join('')}
        <line x1="${pl}" x2="${w - pr}" y1="${h - pb}" y2="${h - pb}" stroke="var(--line-strong)"/>
        <text x="${(pl + w - pr) / 2}" y="${h - 4}" font-size="12.5" font-weight="600" text-anchor="middle" fill="var(--ink-2)">Week starting</text></svg></div>
        <p class="v2lgline"><span class="v2lgk"><i style="background:var(--brand)"></i>Ads launched that week (left)</span><span class="v2lgk"><i class="ln" style="background:var(--c-email)"></i>Spend on ads under 14 days old (right)</span></p>`;
    })();
    const launchedN = wk.reduce((s0, x) => s0 + x.launched, 0), lastW = wk.length ? wk[wk.length - 1] : null;
    const cadSay = !wk.length ? 'No launches in the data yet.' : `${int(launchedN)} ads launched in ${wk.length} weeks, about ${(launchedN / wk.length).toFixed(1)} a week. Last week ${pct(lastW.fresh_share, 0)} of spend went to ads under 14 days old${lastW.fresh_share != null && lastW.fresh_share < 0.2 ? ': the account is leaning on old ads.' : '.'}`;
    const fatJ = fat.filter(f => f.cpa && f.spend > 100), fatLo = fatJ.slice().sort((p, q) => p.cpa - q.cpa)[0], fatHi = fatJ.slice().sort((p, q) => q.cpa - p.cpa)[0];
    const fatSay = !fat.length ? 'Not enough spend across ad ages yet.' : goal && fatJ.length >= 2 && fatJ.every(f => f.cpa > goal * 1.2) ? `Every age runs over the ${g.cpa ? 'goal' : 'account average'}, so this is not fatigue: purchases cost least at ${esc(fatLo.label.toLowerCase())} (${money(fatLo.cpa, cur)}) and most at ${esc(fatHi.label.toLowerCase())} (${money(fatHi.cpa, cur)}).` : firstFat ? `Cost per purchase rises past the ${g.cpa ? 'goal' : 'account average'} from ${esc(firstFat.label.toLowerCase())}: plan new ads before then.` : goal ? `No age runs more than 20% over the ${g.cpa ? 'goal' : 'account average'}: ads are not tiring yet.` : 'Set a goal CPA to see when ads tire.';
    const roll = (list, label) => { const mx = Math.max(...list.map(x => x.spend), 1); return `<div class="v2tbl"><table><thead><tr><th>${label}</th><th>Ads</th><th>Spend</th><th>ROAS</th><th>CPA</th><th>CTR</th><th>Hook</th></tr></thead><tbody>${list.slice(0, 10).map(x => `<tr><td><b>${esc(x.key)}</b></td><td>${x.ads}</td><td>${ib(x.spend, mx, null, kmoney(x.spend, cur))}</td><td>${x2(x.roas)}</td><td class="${!goal || x.cpa == null ? '' : x.cpa <= goal ? 'good' : x.cpa <= goal * 1.3 ? 'warn' : 'bad'}">${money(x.cpa, cur)}</td><td>${pct(x.ctr, 2)}</td><td>${pct(x.hook, 0)}</td></tr>`).join('')}</tbody></table></div>`; };
    /* A card whose conclusion is its own line under the title (never squeezed beside it). */
    const ccard = (title, say, body, cap, id) => `<section class="v2card v2cc"${id ? ` id="${id}"` : ''}><div class="v2h"><h3>${esc(title)}</h3>${cap ? `<span class="cap">${cap}</span>` : ''}</div>${say ? `<p class="v2concl">${say}</p>` : ''}${body}</section>`;
    const basis = g.cpa ? `: ${K.jx}x the ${money(g.cpa, cur)} goal CPA.`
      : goal ? `: ${K.jx}x this account's ${money(goal, cur)} average CPA, because no goal CPA is set.`
      : `. That is a placeholder: no goal CPA is set and nothing has sold yet.`;
    const barLine = `<p class="v2sortbar">An ad is judged, and ranked on ROAS, CPA, hook, hold and CTR, once it has spent <b>${money(bar, cur)}</b>${basis} <button type="button" class="v2link" data-goals="1">${g.cpa ? 'Change it' : 'Set the goal CPA'} ›</button></p>`;
    const SORTS = SORT_DEF;
    if (!SORTS.some(s0 => s0[0] === CR_SORT)) CR_SORT = 'spend';
    const base = () => { let L = CR_GROUP ? groupAds(ads) : ads; if (CR_TAG) L = L.filter(r => r.tags && r.tags[CR_TAG.k] === CR_TAG.v); return L; };
    const sorted = () => sortAds(base(), CR_SORT, bar);
    CR_WIN = d.window || null; CR_PICK.clear(); CR_TAG = null;
    CR_MEDC = (() => { const cs = ads.filter(r => r.curve && r.curve[0] && r.spend >= bar).map(r => { const pk = Math.max(...r.curve.map(v => v || 0)) || 1; return r.curve.map(v => (v || 0) / pk); }); return cs.length >= 3 ? [0, 1, 2, 3, 4].map(i => cs.reduce((x, c) => x + c[i], 0) / cs.length) : null; })();
    /* THE WHOLE CARD OPENS THE PREVIEW (2026-10-09, Cole: "I can only click the creative itself, not the name, the pills,
       the numbers"). The card is one button; only the Compare tick keeps its own click. One delegated listener on the
       gallery wrapper serves every card, so a repaint never re-wires 24+ cards. */
    const galItem = r => { const v = verdict(r); const wy = v === 'nogoal' ? 'No goal CPA is set for this brand, so no ad can be called yet. Set one in brand settings, Goals.' : whyOf(r);
      return `<div class="g${CR_PICK.has(r.id) ? ' picked' : ''}" data-ad="${esc(r.id)}" data-prev="${esc(r.id)}" role="button" tabindex="0" aria-label="Open ${esc(r.name)}"><div class="th" data-thumb="${esc(r.id)}"${THUMBS.has(r.id) ? ` style="background-image:url('${THUMBS.get(r.id)}')"` : ''}><span class="v2play-s">${window.icon ? window.icon('play', { size: 16 }) : ''}</span><label class="v2pick"${tipAttr('Pick up to 4 to compare')}><input type="checkbox" data-pick="${esc(r.id)}"${CR_PICK.has(r.id) ? ' checked' : ''} aria-label="Pick ${esc(r.name)} to compare"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8.5l2.6 2.6L12 5.6"/></svg></label><span class="v2pill ${VL[v][1]}"${wy ? tipAttr(esc(wy)) : ''}>${VL[v][0]}</span><em>${esc(r.media_type || '')}${r.age != null ? ` · ${r.age}d` : ''}</em></div><div class="b"><b title="${esc(r.name)}">${esc(r.name)}</b>
      ${r.n_ads > 1 || r.tags ? `<div class="v2tags">${r.n_ads > 1 ? `<span class="n"${tipAttr(`The same ${r.media_type === 'video' ? 'video' : 'image'} runs in ${r.n_ads} ads; their numbers are added up here.`)}>In ${r.n_ads} ads</span>` : ''}${r.tags ? [r.tags.format, r.tags.hook].filter(Boolean).map(t0 => `<span>${esc(t0)}</span>`).join('') : ''}</div>` : ''}
      ${role(r) !== 'solo' || funnelRole(r) || valTag(r) ? `<div class="v2roles">${role(r) !== 'solo' ? `<span${tipAttr(esc(whyOf(r)))}>${role(r) === 'anchor' ? 'Anchor' : 'Support'} · ${pct(r.set_share, 0)} of set</span>` : ''}${funnelRole(r) ? `<span class="${funnelRole(r)}"${tipAttr(FR[funnelRole(r)][1])}>${FR[funnelRole(r)][0]}</span>` : ''}${valTag(r) ? `<span class="${valTag(r) === 'more' ? 'val' : 'lowval'}"${tipAttr(esc(valNote(r)))}>${valTag(r) === 'more' ? 'Customers come back' : 'Customers don’t come back'}</span>` : ''}</div>` : ''}
      <div class="kv"><span>Spend</span><b>${kmoney(r.spend, cur)}</b><span>CPA</span><b class="${r.cpa == null ? (r.spend > 0 && goal && r.spend >= bar ? 'bad' : '') : !goal ? '' : r.cpa <= goal ? 'good' : 'bad'}">${r.cpa == null && r.spend > 0 ? 'no sales' : money(r.cpa, cur)}</b><span>ROAS</span><b>${x2(r.roas)}</b><span>Hook</span><b>${pct(r.hook, 0)}</b><span>CTR</span><b>${pct(r.ctr, 2)}</b><span>Purch.</span><b>${int(r.purchases)}</b>${r.ltv_n >= 5 ? `<span${tipAttr(`${r.ltv_n} customers this ad started (first click, first order 90+ days ago) spent ${money(r.ltv90, cur)} each in their first 90 days: ${x2(r.ltv_x)} their first order.`)}>90-day value</span><b class="${r.ltv_x >= 1.3 ? 'good' : ''}">${money(r.ltv90, cur)}</b>` : ''}</div>${r.angle ? `<span class="ang">${esc(r.angle)}</span>` : ''}</div></div>`; };
    /* PAGES OF 24 (2026-10-09, "it's super laggy"): the gallery draws 24 cards and appends the next 24 on "Show more"
       (appended, never a full redraw; adding cards while the reader scrolls was itself a jank source). Covers load
       only for cards near the screen (IntersectionObserver). Measured on Party Patch: see profit/CLAUDE.md. */
    const PAGE = 24; let shown = PAGE, LIST = [];
    const moreBtn = () => LIST.length > shown ? `<button type="button" class="v2more" data-more="1">Show ${Math.min(PAGE, LIST.length - shown)} more <span>${LIST.length - shown} left</span></button>` : (LIST.length > PAGE ? `<p class="v2hint v2end">All ${LIST.length} shown.</p>` : '');
    const galleryInner = () => { const { s, list, left } = sorted(); LIST = list; shown = PAGE;
      const note = left && CR_SORT !== 'spend' ? `<p class="v2hint">${left} ad${left === 1 ? '' : 's'} left out: ${s[4] ? `under the ${money(bar, cur)} judging bar${CR_SORT === 'hook' || CR_SORT === 'hold' ? ', or not video' : ''}` : CR_SORT === 'ltv' ? 'too few known customers yet' : 'no number for this sort'}.</p>` : '';
      const filt = CR_TAG ? `<p class="v2filt">Showing only <b>${esc(tagName(CR_TAG.k))}: ${esc(CR_TAG.v)}</b> (${list.length} ad${list.length === 1 ? '' : 's'}). <button type="button" class="v2link" data-clrtag="1">Show every ad</button></p>` : '';
      return list.length ? `${filt}<div class="v2gal">${list.slice(0, shown).map(galItem).join('')}</div><div class="v2morew">${moreBtn()}</div>${note}` : `${filt}<p class="v2hint">No ads have a ${esc(s[1].toLowerCase())} number to rank in these dates${s[4] ? ` at ${money(bar, cur)} of spend or more` : ''}.</p>`; };
    const tagName = k => (TAG_DIMS.find(x => x[0] === k) || [, k])[1];
    const SORT_SAYS = { spend: 'Biggest spenders first.', purchases: 'Most purchases first, under the attribution switch.', roas: 'Highest return first. Only ads past the judging bar.', cpa: 'Cheapest purchase first. Only ads past the judging bar.', hook: 'Most people stopping in the first 3 seconds. Video ads past the bar.', hold: 'Most people watching on after the hook. Video ads past the bar.', ctr: 'Most link clicks per impression. Ads past the bar.', ltv: 'Customers who spend the most in 90 days, as a multiple of their first order.', newest: 'Most recently launched first.' };
    const tagged0 = ads.some(r => r.tags);
    const tagOpts = () => { const seen = new Map(); for (const r of ads) for (const [k] of TAG_DIMS) { const v = r.tags && r.tags[k]; if (!v) continue; const key = `${k}::${v}`; seen.set(key, (seen.get(key) || 0) + 1); }
      return [['', 'All ads', 'No tag filter.'], ...[...seen.entries()].sort((p, q) => q[1] - p[1]).slice(0, 40).map(([key, n]) => { const [k, v] = key.split('::'); return [key, `${tagName(k)}: ${v}`, `${n} ad${n === 1 ? '' : 's'} tagged this way by the AI.`]; })]; };
    const toolsRow = () => `<div class="v2tools v2menus">
      ${PM().html('crSort', 'Sort by', SORTS.map(([k, l]) => [k, l, SORT_SAYS[k] || '']), CR_SORT)}
      ${PM().html('crShow', 'Show', [['0', 'Each ad', 'Every ad on its own card.'], ['1', 'One card per creative', 'Ads running the same video or image become one card, their numbers added up.']], CR_GROUP ? '1' : '0')}
      ${tagged0 ? PM().html('crTag', 'Tag', tagOpts(), CR_TAG ? `${CR_TAG.k}::${CR_TAG.v}` : '', { cls: CR_TAG ? 'on' : '' }) : ''}
      <span class="sp"></span><button type="button" class="v2link" data-cmp="1"${CR_PICK.size < 2 ? ' disabled' : ''}>${CR_PICK.size ? `Compare the ${CR_PICK.size} picked` : 'Tick 2 to 4 ads to compare'}</button><button type="button" class="v2link" data-save="1">Save this view to a dashboard</button></div>`;
    /* WHAT IS WORKING, BY TAG (2026-10-09 redesign, Cole: make it read at a glance). One small ranked table per tag
       group: each value's share of the group's spend as a bar, its cost per purchase and ROAS against the whole
       account, best and worst marked. The two lines on top name the best and the worst across every group. A row
       is a button: it filters the gallery and scrolls to it. */
    const acctSpend = ads.reduce((s0, r) => s0 + r.spend, 0), acctPur = ads.reduce((s0, r) => s0 + (r.purchases || 0), 0), acctRev = ads.reduce((s0, r) => s0 + (r.revenue || 0), 0);
    const acctCpa = acctPur ? acctSpend / acctPur : null, acctRoas = acctSpend ? acctRev / acctSpend : null;
    const tagsCard = (() => {
      const assets = new Set(ads.map(r => r.asset_key || r.id)), tagged = new Set(ads.filter(r => r.tags).map(r => r.asset_key || r.id));
      const cov = `${tagged.size} of ${assets.size} creatives tagged by the AI${tagged.size < assets.size ? '; the rest fill in within the hour' : ''}.`;
      if (!tagged.size) return ccard('What is working, by tag', 'Tags are being added now. This fills in within the hour.', '', cov);
      const groups = [], all = [];
      for (const [k, label] of TAG_DIMS) {
        const by = {};
        for (const r of ads) { const v = r.tags && r.tags[k]; if (!v) continue; const b0 = by[v] ||= { k, v, keys: new Set(), spend: 0, pur: 0, rev: 0 }; b0.keys.add(r.asset_key || r.id); b0.spend += r.spend; b0.pur += r.purchases || 0; b0.rev += r.revenue || 0; }
        const rows = Object.values(by).filter(b0 => b0.spend > 0).sort((p, q) => q.spend - p.spend);
        if (rows.length < 2) continue;
        const tot = rows.reduce((s0, b0) => s0 + b0.spend, 0);
        rows.forEach(b0 => { b0.share = b0.spend / tot; b0.cpa = b0.pur ? b0.spend / b0.pur : null; b0.roas = b0.spend ? b0.rev / b0.spend : null; b0.judged = b0.spend >= bar; b0.label = label; });
        const judged = rows.filter(b0 => b0.judged);
        const rank = b0 => b0.cpa == null ? Infinity : b0.cpa;
        /* Best only when clearly better than the account (10%+), worst only when clearly worse (15%+ or no sales). */
        const best = judged.filter(b0 => b0.pur && (!acctCpa || b0.cpa <= acctCpa * 0.9)).sort((p, q) => rank(p) - rank(q))[0] || null;
        const worst = judged.length >= 2 ? judged.filter(b0 => b0.cpa == null || !acctCpa || b0.cpa >= acctCpa * 1.15).sort((p, q) => rank(q) - rank(p))[0] || null : null;
        groups.push({ k, label, rows: rows.slice(0, 6), more: rows.length - 6, best, worst: worst && worst !== best ? worst : null });
        all.push(...judged);
      }
      if (!groups.length) return ccard('What is working, by tag', 'Not enough tagged creatives with spend to compare yet.', '', cov);
      const vs = (v, a, lower) => { if (v == null || !a) return ''; const dd = v / a - 1; if (Math.abs(dd) < 0.05) return '<span class="v2vs flat">about the same</span>'; const good = lower ? dd < 0 : dd > 0; return `<span class="v2vs ${good ? 'good' : 'bad'}">${Math.round(Math.abs(dd) * 100)}% ${lower ? (dd < 0 ? 'under' : 'over') : (dd > 0 ? 'above' : 'below')}</span>`; };
      const bestAll = all.filter(b0 => b0.pur).sort((p, q) => p.cpa - q.cpa)[0], worstAll = all.slice().sort((p, q) => (q.cpa ?? Infinity) - (p.cpa ?? Infinity))[0];
      const say = bestAll ? `Best: <button type="button" class="v2tagx good" data-tag="${esc(bestAll.k)}" data-tv="${esc(bestAll.v)}">${esc(bestAll.label)}: ${esc(bestAll.v)}</button> at ${money(bestAll.cpa, cur)} a purchase${acctCpa ? `, ${vs(bestAll.cpa, acctCpa, true).replace(/<[^>]+>/g, '')} the account's ${money(acctCpa, cur)}` : ''}.${worstAll && worstAll !== bestAll ? ` Worst: <button type="button" class="v2tagx bad" data-tag="${esc(worstAll.k)}" data-tv="${esc(worstAll.v)}">${esc(worstAll.label)}: ${esc(worstAll.v)}</button> at ${worstAll.cpa == null ? 'no purchases' : `${money(worstAll.cpa, cur)} a purchase`} on ${kmoney(worstAll.spend, cur)}.` : ''}` : `Nothing tagged has spent the ${money(bar, cur)} judging bar yet.`;
      const blk = gr => `<div class="v2tg"><h4>${esc(gr.label)}</h4><table><thead><tr><th>Value</th><th${tipAttr("Share of this group's tagged spend")}>Share of spend</th><th${tipAttr(`Cost per purchase, against the account's ${money(acctCpa, cur)}`)}>CPA vs account</th><th${tipAttr(`ROAS, against the account's ${x2(acctRoas)}`)}>ROAS</th></tr></thead><tbody>${gr.rows.map(b0 => {
          const mk = b0 === gr.best ? 'best' : b0 === gr.worst ? 'worst' : '';
          return `<tr class="${mk}${CR_TAG && CR_TAG.k === b0.k && CR_TAG.v === b0.v ? ' on' : ''}" data-tag="${esc(b0.k)}" data-tv="${esc(b0.v)}" tabindex="0" role="button" aria-label="Show only ${esc(gr.label)}: ${esc(b0.v)}"><td><b>${esc(b0.v)}</b>${mk ? `<span class="v2pill ${mk === 'best' ? 'good' : 'bad'}">${mk}</span>` : ''}<small>${b0.keys.size} creative${b0.keys.size === 1 ? '' : 's'}${b0.judged ? '' : ' · not judged yet'}</small></td>
            <td><span class="v2share"><i style="width:${Math.max(2, b0.share * 100).toFixed(0)}%"></i></span><span class="n">${pct(b0.share, 0)}</span></td>
            <td><b>${b0.cpa == null ? 'no sales' : money(b0.cpa, cur)}</b>${b0.judged ? vs(b0.cpa, acctCpa, true) : ''}</td>
            <td>${x2(b0.roas)}${b0.judged ? vs(b0.roas, acctRoas, false) : ''}</td></tr>`; }).join('')}</tbody></table>${gr.more > 0 ? `<p class="v2hint">${gr.more} smaller value${gr.more === 1 ? '' : 's'} not shown.</p>` : ''}</div>`;
      return ccard('What is working, by tag', say, `<div class="v2tgrid">${groups.map(blk).join('')}</div><p class="v2hint">Best and worst are judged on cost per purchase, among values that spent the ${money(bar, cur)} judging bar. Click any value to show only those ads.</p>`, cov);
    })();
    const gallery = `<div id="v2tools">${toolsRow()}</div>${barLine}<div id="v2galw">${galleryInner()}</div>`;
    const counts = ads.reduce((s0, r) => { s0[verdict(r)] = (s0[verdict(r)] || 0) + 1; return s0; }, {});
    const body = `<p class="v2say lead">${ads.length} ads spent in these dates. <b class="good">${counts.scale || 0} to scale</b>${counts.keep ? `, <b>${counts.keep} carrying a working set</b>` : ''}, <b class="warn">${counts.watch || 0} to watch</b>${counts.trim ? `, <b class="warn">${counts.trim} to trim</b>` : ''}, <b class="bad">${counts.cut || 0} to cut</b>${counts.thin || counts.new || counts.nogoal ? `, ${(counts.thin || 0) + (counts.new || 0) + (counts.nogoal || 0)} not judged yet` : ''}, ${goal ? `against the ${money(goal, cur)} ${g.cpa ? 'goal' : 'account average'}` : 'with no goal CPA set and no sales yet, so nothing can be called'}.${firstFat ? ` Ads start costing more from <b>${esc(firstFat.label.toLowerCase())}</b>.` : ''}</p>
      <div class="v2note v2rule"><span class="v2pill">How the calls work</span><span>${RULE}</span></div>
      ${card('The ads', 'Click any ad to see it play, its copy, its numbers and what to make next.', gallery, `Attribution: <b>${esc(MODEL_SHORT[H.S.model])}</b>`)}
      <div id="v2tagsc">${tagsCard}</div>
      <div class="v2two eq">${ccard('Where every ad sits', 'Low and to the right is where you want an ad: big spend at a cheap cost per purchase.', `${callLegend}<span class="v2lgsep">size is purchases. Hover a dot for the ad, click to open it.</span></p>${quad}`)}
        ${ccard('Hook against hold', 'Top right stops the scroll and keeps people watching. Dashed lines are this account’s averages.', `${callLegend}<span class="v2lgsep">size is spend. Hover a dot for the ad, click to open it.</span></p>${hookhold}`)}</div>
      <div class="v2two eq">${ccard('When ads tire', fatSay, fatigue, 'cost per purchase by days live')}
        ${ccard('Are we launching enough?', cadSay, cadence, 'last 12 weeks')}</div>
      ${(() => { const L = ads.filter(r => r.ltv_n >= 5).sort((p, q) => (q.ltv_x || 0) - (p.ltv_x || 0)); if (L.length < 3) return card('Which ads bring customers who come back', '', '<p class="v2hint">Needs customers whose first order is at least 90 days old and traced to an ad. The order history is filling in; this card lights up as it does.</p>'); const mx = Math.max(...L.map(r => r.ltv90 || 0), 1);
        return card('Which ads bring customers who come back', `For each ad: the people whose first order it started, and what they spent in their first 90 days. A higher multiple means they came back and bought again, so the ad is worth more than its cost per purchase shows. ${esc(L[0].name)} is best: ${x2(L[0].ltv_x)} their first order.`, `<div class="v2tbl wide"><table><thead><tr><th>Ad</th><th>Customers started</th><th>First order</th><th>90-day value</th><th>Multiple</th><th>CPA now</th></tr></thead><tbody>${L.slice(0, 12).map(r => `<tr class="link" data-prev="${esc(r.id)}"><td><span class="nm" title="${esc(r.name)}">${esc(r.name)}</span></td><td>${int(r.ltv_n)}</td><td>${money(r.ltv_first, cur)}</td><td>${ib(r.ltv90, mx, '--c-email', money(r.ltv90, cur))}</td><td class="${r.ltv_x >= 1.3 ? 'good' : ''}">${x2(r.ltv_x)}</td><td>${money(r.cpa, cur)}</td></tr>`).join('')}</tbody></table></div>`, 'Triple Whale first click · Shopify orders through Triple Whale'); })()}
      ${card('By angle', 'The argument each ad makes, from the test number at the start of its name.', roll(d.by_angle || [], 'Angle'))}
      <div class="v2two">${card('By format', 'The tag after the last | in the ad name.', roll(d.by_format || [], 'Format tag'))}${card('By type', '', roll(d.by_type || [], 'Type'))}</div>
      ${foot('Format comes from the tag after the last | in the ad name; angle from the test number at the start of the name, matched to the test library. Delivery numbers are Meta’s; purchases follow the attribution switch.')}`;
    $('#main').innerHTML = shell('adcreative', title, body);
    const root = $('#main'); wireGo(root);
    wireScatter('v2quad', qPts, r => `<b>${esc(r.name)}</b><br>${kmoney(r.spend, cur)} spend · ${int(r.purchases)} purchases · CPA ${r.cpa == null ? 'no sales' : money(r.cpa, cur)} · ROAS ${x2(r.roas)}<br>Call: ${esc(VL[verdict(r)][0])}`);
    wireScatter('v2hh', hhPts, r => `<b>${esc(r.name)}</b><br>hook ${pct(r.hook, 0)} · hold ${pct(r.hold, 0)} · ${kmoney(r.spend, cur)} spend · CPA ${r.cpa == null ? 'no sales' : money(r.cpa, cur)}<br>Call: ${esc(VL[verdict(r)][0])}`);
    const byId = new Map(ads.map(r => [r.id, r]));
    root.querySelectorAll('tr[data-prev]').forEach(el => { el.onclick = () => { const r = byId.get(el.dataset.prev); if (r) open(r); }; });
    const gw = root.querySelector('#v2galw'), tw = root.querySelector('#v2tools');
    let curMap = new Map(LIST.map(r => [r.id, r]));
    /* Covers only for cards near the screen (IntersectionObserver), asked for in small batches. */
    let want = new Set(), wantT = 0;
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); if (!THUMBS.has(e.target.dataset.thumb)) want.add(e.target.dataset.thumb); } if (want.size && !wantT) wantT = setTimeout(() => { const ids = [...want]; want = new Set(); wantT = 0; loadThumbs(gw, ids); }, 60); }, { rootMargin: '1200px 0px' }) : null;
    const watchCovers = (scope = gw) => { const els = [...scope.querySelectorAll('.th[data-thumb]')]; if (io) els.forEach(el => { if (!THUMBS.has(el.dataset.thumb)) io.observe(el); }); else loadThumbs(gw, els.map(x => x.dataset.thumb)); };
    const addMore = () => { const galEl = gw.querySelector('.v2gal'); if (!galEl || shown >= LIST.length) return; const from = shown; shown = Math.min(LIST.length, shown + PAGE);
      const tmp = document.createElement('div'); tmp.innerHTML = LIST.slice(from, shown).map(galItem).join(''); const added = [...tmp.children]; added.forEach(x => galEl.appendChild(x));
      gw.querySelector('.v2morew').innerHTML = moreBtn(); added.forEach(x => watchCovers(x)); };
    const repaint = () => { tw.innerHTML = toolsRow(); wireTools(); gw.innerHTML = galleryInner(); curMap = new Map(LIST.map(r => [r.id, r])); watchCovers(); };
    const wireTools = () => {
      PM().wire(tw.querySelector('#crSort'), v => { CR_SORT = v; try { localStorage.setItem('pf_cr_sort', CR_SORT); } catch {} repaint(); });
      PM().wire(tw.querySelector('#crShow'), v => { CR_GROUP = v === '1'; try { localStorage.setItem('pf_cr_group', CR_GROUP ? '1' : '0'); } catch {} CR_PICK.clear(); repaint(); });
      PM().wire(tw.querySelector('#crTag'), v => { const i = v.indexOf('::'); setTag(v ? { k: v.slice(0, i), v: v.slice(i + 2) } : null, false); });
      tw.querySelector('[data-cmp]').onclick = () => { compareAds([...CR_PICK].map(id => curMap.get(id) || byId.get(id)).filter(Boolean), cur, goal, open); };
      tw.querySelector('[data-save]').onclick = () => saveView(a, { sort: CR_SORT, group: CR_GROUP, tag: CR_TAG, ids: [...CR_PICK] });
    };
    const setTag = (tg, scroll) => { CR_TAG = tg; root.querySelectorAll('#v2tagsc tr[data-tag]').forEach(x => x.classList.toggle('on', !!CR_TAG && x.dataset.tag === CR_TAG.k && x.dataset.tv === CR_TAG.v)); repaint(); if (scroll) root.querySelector('#v2tools').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
    wireTools();
    root.querySelector('#v2tagsc').addEventListener('click', e => { const el = e.target.closest('[data-tag]'); if (!el) return; const same = CR_TAG && CR_TAG.k === el.dataset.tag && CR_TAG.v === el.dataset.tv; setTag(same ? null : { k: el.dataset.tag, v: el.dataset.tv }, !same); });
    root.querySelector('#v2tagsc').addEventListener('keydown', e => { const el = e.target.closest('tr[data-tag]'); if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); } });
    /* One set of listeners for every card, wired once (the wrapper survives repaints). */
    gw.addEventListener('click', e => {
      if (e.target.closest('[data-clrtag]')) return setTag(null, false);
      if (e.target.closest('[data-more]')) return addMore();
      if (e.target.closest('.v2pick')) return;            // the Compare tick handles itself (change below)
      const c = e.target.closest('.g[data-prev]'); if (!c) return;
      const r = curMap.get(c.dataset.prev) || byId.get(c.dataset.prev); if (r) open(r);
    });
    gw.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const c = e.target.closest('.g[data-prev]'); if (!c || e.target !== c) return; e.preventDefault(); c.click(); });
    gw.addEventListener('change', e => { const cb = e.target.closest('[data-pick]'); if (!cb) return;
      if (cb.checked) { if (CR_PICK.size >= 4) { cb.checked = false; return; } CR_PICK.add(cb.dataset.pick); } else CR_PICK.delete(cb.dataset.pick);
      const c0 = cb.closest('.g'); if (c0) c0.classList.toggle('picked', cb.checked); tw.innerHTML = toolsRow(); wireTools(); });
    watchCovers();
    root.querySelectorAll('[data-goals]').forEach(b0 => b0.onclick = () => window.openGoals && window.openGoals(a.act_id));
    const pend = window.V2PENDING; if (pend && pend.ad) { window.V2PENDING = null; const r = byId.get(pend.ad); if (r) open(r); else panel('Not in this window', `<p class="v2hint">That ad did not spend in ${esc(H.rangeLabel())}. Widen the dates at the top to see it.</p>`); }
  }

  /* =========================================================================================
   * PAID > GOOGLE / TIKTOK (through Triple Whale's platform rows until connected directly)
   * ======================================================================================= */
  const PLAT = { google: { label: 'Google', color: '--c-google', adds: 'Connecting Google directly adds campaign types (Search, Shopping, Performance Max, YouTube), search terms, brand against non-brand, product groups, and the same campaign table and creative screen as Meta.' },
    tiktok: { label: 'TikTok', color: '--c-tiktok', adds: 'Connecting TikTok directly adds campaigns and ads, video watch rates, and the same campaign table and creative screen as Meta.' } };
  async function platform(kind, first) {
    const t = H.RUN(); const P = PLAT[kind]; const one = H.S.act !== 'all';
    const title = one ? `${P.label}: ${esc((H.S.accounts.find(a => a.act_id === H.S.act) || {}).name || '')}` : P.label;
    if (first) $('#main').innerHTML = shell(kind, title, skPage({ tiles: 8 }));
    let d; try { d = await get(`/api/hub/paid?platform=${kind}&act=${encodeURIComponent(H.S.act)}&${H.rangeQ()}${modelQ()}`); } catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell(kind, title, `<div class="v2card"><p class="v2bad">${esc(e.message)}</p></div>`); return; }
    if (t !== H.RUN()) return;
    const bs = d.brands.filter(b => (b.cur.spend || 0) > 0 || (b.cur.revenue || 0) > 0); const cur = oneCur(bs.length ? bs : d.brands);
    /* Linked to Google Ads directly (2026-10-09): Overview and Campaigns jobs, like Meta. Not linked: the
       "not connected directly" card and what connecting adds. */
    const oneA = one ? H.S.accounts.find(a => a.act_id === H.S.act) : null;
    const direct = kind === 'google' && !!oneA && (oneA.conn_kinds || []).includes('google_ads');
    const sum = (k, src = 'cur') => bs.reduce((s, b) => s + ((b[src] || {})[k] || 0), 0);
    const pend = bs.some(b => b.cur.attr_pending);
    const K = ['spend', 'revenue', 'platform_revenue', 'purchases', 'impressions', 'clicks'];
    const rows = mergeDays(bs.map(b => b.series || []), K).map(ratios), prows = mergeDays(bs.map(b => b.prev_series || []), K).map(ratios);
    const cS = sum('spend'), cI = sum('impressions'), cC = sum('clicks'), cR = sum('revenue'), cO = sum('purchases'), pS = sum('spend', 'prev'), pI = sum('impressions', 'prev'), pC = sum('clicks', 'prev'), pR = sum('revenue', 'prev'), pO = sum('purchases', 'prev');
    const anyPR = bs.some(b => b.cur.platform_revenue != null), anyPO = bs.some(b => b.cur.platform_purchases != null);
    const c = { spend: cS, impressions: cI, clicks: cC, revenue: pend ? null : cR, purchases: pend ? null : cO, platform_revenue: anyPR ? sum('platform_revenue') : null, platform_purchases: anyPO ? sum('platform_purchases') : null,
      roas: !pend && cS ? cR / cS : null, cpa: !pend && cO ? cS / cO : null, cpm: cI ? cS * 1000 / cI : null, ctr: cI ? cC / cI : null, cpc: cC ? cS / cC : null, attr_pending: pend };
    const p = { spend: pS, revenue: pR, purchases: pO, roas: pS ? pR / pS : null, cpa: pO ? pS / pO : null, cpm: pI ? pS * 1000 / pI : null, ctr: pI ? pC / pI : null };
    const g = one && bs[0] ? bs[0].goals || {} : {};
    const saysRoas = c.spend && c.platform_revenue != null ? c.platform_revenue / c.spend : null;
    const saysTile = tile({ compact: true, label: `${P.label} says`, src: P.label.toUpperCase(), hint: `ROAS on ${P.label}'s own count`, value: x2(saysRoas), sub: c.platform_revenue != null ? `${kmoney(c.platform_revenue, cur)} claimed by ${P.label}` : 'no claim carried', spark: tspark(rows, prows, r => r.spend && r.platform_revenue != null ? r.platform_revenue / r.spend : null, x2, `${P.label}'s own ROAS`) });
    const note = direct ? `<div class="v2note"><span class="v2pill good">Google Ads linked</span> <span>The tiles and chart are Google's spend, impressions and clicks with the orders Triple Whale credits to Google. Read from Google Ads directly: <b>Campaigns</b>, <b>Ads</b> (headlines and descriptions), <b>Search terms</b> and <b>Changes</b>.</span> <button type="button" class="v2link" data-go="gcampaigns">Campaigns ›</button></div>`
      : `<div class="v2note"><span class="v2pill warn">via Triple Whale</span> <span>${P.label} is not connected to Locus directly yet, so this page shows what Triple Whale carries: ${P.label}'s daily spend, impressions and clicks, and the orders Triple Whale credits to ${P.label}. No campaigns or ads until it is connected.</span> <button type="button" class="v2link" data-go="settings">Connections ›</button></div>`;
    const body = !bs.length ? `${card(direct ? `No ${P.label} spend in this window` : `${P.label} is not connected directly`, '', `<p class="v2hint">No ${P.label} spend in this window${one ? ' for this brand' : ''}, as far as Triple Whale sees.${direct ? ' Widen the dates at the top, or open Campaigns for what Google Ads itself reports.' : ` ${esc(P.adds)}`}</p>${direct ? '<button type="button" class="v2btn" data-go="gcampaigns">Open Campaigns</button>' : kind === 'tiktok' ? '<div id="v2ttc" style="margin-top:10px"></div>' : '<button type="button" class="v2btn" data-go="settings">Open Integrations</button>'}`)}` : `
      ${note}
      <div class="v2tiles">${paidTiles(c, p, rows, prows, cur, g, P.label.toUpperCase(), P.label)}${saysTile}</div>
      ${paidChart('v2plat', rows, prows, cur, 'Spend and revenue by day', `Revenue credited to ${P.label} under ${esc(MODEL_SHORT[H.S.model])}; spend is ${P.label}’s own.`)}
      ${!one ? card(`Each brand on ${P.label}`, 'Click a brand to open it.', `<div class="v2tbl"><table><thead><tr><th>Brand</th><th>Spend</th><th>Revenue</th><th>${esc(P.label)} says</th><th>Gap</th><th>ROAS</th><th>CPA</th><th>CTR</th></tr></thead><tbody>${bs.sort((x, y) => y.cur.spend - x.cur.spend).map(b => { const x = b.cur; const gap = isPlat() || x.platform_revenue == null || x.revenue == null ? null : x.revenue - x.platform_revenue; return `<tr data-act="${esc(b.act_id)}" tabindex="0" class="link"><td><b>${esc(b.name)}</b></td><td>${ib(x.spend, Math.max(...bs.map(y => y.cur.spend), 1), P.color, kmoney(x.spend, b.currency))}</td><td>${kmoney(x.revenue, b.currency)} ${delta(x.revenue, b.prev?.revenue)}</td><td class="faint">${kmoney(x.platform_revenue, b.currency)}</td><td class="${gap == null ? '' : gap >= 0 ? 'good' : 'bad'}">${gap == null ? '–' : (gap >= 0 ? '+' : '−') + kmoney(Math.abs(gap), b.currency)}</td><td>${x2(x.roas)}</td><td>${money(x.cpa, b.currency)}</td><td>${pct(x.ctr, 2)}</td></tr>`; }).join('')}</tbody></table></div>`, `Attribution: <b>${esc(MODEL_SHORT[H.S.model])}</b>`) : ''}
      ${one ? `<div class="v2gos"><button type="button" class="v2go" data-drill="platform:${kind}"><b>The orders ${esc(P.label)} is credited with</b><span>Each order, its value, whether it was a first order, and the customer's whole journey.</span><i>›</i></button><button type="button" class="v2go" data-go="channels"><b>${esc(P.label)} next to every other channel</b><span>Spend, revenue, ROAS and new customers side by side, with each platform's own claim.</span><i>›</i></button></div>` : ''}
      ${direct ? '' : card(`What connecting ${P.label} directly adds`, '', `<p class="v2hint">${esc(P.adds)}</p><p class="v2hint" style="margin-top:8px">${kind === 'google' ? 'What it needs: the brand’s Google Ads customer ID pasted in Brand settings > Integrations, with the Mobius manager link accepted in Google Ads.' : 'What it needs from Cole: a TikTok for Business developer app approved for the Marketing API (steps in Agency settings > Integrations > TikTok app), then one sign-in here with Connect TikTok.'}</p>${kind === 'tiktok' ? '<div id="v2ttc" style="margin-top:10px"></div>' : ''}`)}`;
    $('#main').innerHTML = shell(kind, title, body + foot(`Spend, impressions and clicks are ${P.label}’s own as Triple Whale carries them. Revenue and purchases follow the attribution switch; ${P.label}’s own figures sit beside them.`));
    const root = $('#main'); wireGo(root); wireRows(root, kind);
    wirePaidChart('v2plat', rows, prows, cur);
    root.querySelectorAll('[data-drill]').forEach(b => b.onclick = () => drillOrders(`${P.label} orders`, `platform=${kind}`));
    /* TikTok read directly (account-health tiktok.js): the Connect button until signed in, then each linked
       brand's campaigns from TikTok's own reporting. */
    if (kind === 'tiktok') {
      H.apiAH('/api/tiktok/status').then(st => {
        if (t !== H.RUN() || !st) return;
        const host = root.querySelector('#v2ttc');
        if (host) host.innerHTML = st.connected ? `<p class="v2hint">TikTok is connected (${(st.advertisers || []).length} ad account${(st.advertisers || []).length === 1 ? '' : 's'}). Link a brand to its advertiser ID in Brand settings > Integrations.</p>`
          : st.app ? '<button type="button" class="v2btn" id="v2ttGo">Connect TikTok</button> <span class="v2hint">Opens TikTok for Business; sign in and tick every ad account.</span>'
          : '<p class="v2hint">The TikTok developer app is not set up yet. The steps are in Agency settings > Integrations > TikTok app.</p>';
        const go = root.querySelector('#v2ttGo'); if (go) go.onclick = async () => { go.disabled = true; try { const r = await H.apiAH('/api/tiktok/start', { method: 'POST', body: '{}' }); if (r.url) window.open(r.url, '_blank'); else go.textContent = r.error || 'Could not start'; } catch (e) { go.textContent = e.message; } go.disabled = false; };
        if (!st.connected || !one) return;
        const w = win(); H.apiAH(`/api/tiktok/report?act=${encodeURIComponent(H.S.act)}&from=${w.from}&to=${w.to}`).then(r => {
          if (t !== H.RUN() || !r || r.error || !(r.campaigns || []).length) return;
          const mx = Math.max(...r.campaigns.map(x => x.spend), 1);
          const html = card('Campaigns, from TikTok directly', 'TikTok’s own purchases and ROAS (they include views without a click); spend, CTR and CPM are exact.', `<div class="v2tbl wide"><table><thead><tr><th>Campaign</th><th>Spend</th><th>Impressions</th><th>CTR</th><th>CPM</th><th>Purchases</th><th>ROAS</th><th>CPA</th></tr></thead><tbody>${r.campaigns.map(x => `<tr><td><span class="nm" title="${esc(x.name || '')}">${esc(x.name || x.id)}</span></td><td>${ib(x.spend, mx, '--c-tiktok', kmoney(x.spend, cur))}</td><td>${int(x.impressions)}</td><td>${pct(x.ctr, 2)}</td><td>${money(x.cpm, cur)}</td><td>${int(x.purchases)}</td><td>${x2(x.roas || null)}</td><td>${money(x.purchases ? x.spend / x.purchases : null, cur)}</td></tr>`).join('')}</tbody></table></div>`, 'TikTok Marketing API');
          const anchor = root.querySelector('.v2note') || root.querySelector('.v2card'); if (anchor) anchor.insertAdjacentHTML(anchor.classList.contains('v2note') ? 'afterend' : 'beforebegin', html);
        }).catch(() => {});
      }).catch(() => {});
    }
  }

  /* =========================================================================================
   * PAID > GOOGLE > CAMPAIGNS (2026-10-09): read from Google Ads directly (account-health /api/google/ads), for a
   * brand with a Google Ads link. Google's own conversions and value, named as Google's on every number; the
   * Triple Whale credit for Google stays on the Overview job. Ads, Search terms and Changes are their own jobs below.
   * ======================================================================================= */
  /* ---------- Google campaigns: the same sortable table, Columns menu, status switch and budget edit (2026-10-09) ----------
     Writes go through account-health POST /api/google/write (google.js adsCampaignWrite). A shared or total budget is
     refused with the reason; if Google refuses writes for our access level, the reason shows on every control. */
  const G_COLS = () => [
    { k: 'status', l: 'Status', v: x => (x.status === 'ENABLED' ? 1 : 0), tip: 'On or paused. Switch it here.' },
    { k: 'budget', l: 'Budget', v: x => x.budget, tip: 'Daily budget. Click to change.' },
    { k: 'type', l: 'Type', v: x => String(x.type || ''), txt: 1 },
    { k: 'spend', l: 'Spend', v: x => x.spend },
    { k: 'impressions', l: 'Impressions', v: x => x.impressions },
    { k: 'clicks', l: 'Clicks', v: x => x.clicks },
    { k: 'ctr', l: 'CTR', v: x => (x.impressions ? x.clicks / x.impressions : null) },
    { k: 'cpc', l: 'CPC', v: x => (x.clicks ? x.spend / x.clicks : null), lo: 1 },
    { k: 'cpm', l: 'CPM', v: x => (x.impressions ? x.spend * 1000 / x.impressions : null), lo: 1 },
    { k: 'conversions', l: 'Conversions', v: x => x.conversions, tip: 'Google’s own count.' },
    { k: 'cvr', l: 'Conv. rate', v: x => (x.clicks ? x.conversions / x.clicks : null), tip: 'Conversions per click.' },
    { k: 'value', l: 'Value', v: x => x.value, tip: 'Google’s own conversion value.' },
    { k: 'roas', l: 'ROAS', v: x => (x.spend ? x.value / x.spend : null) },
    { k: 'cpa', l: 'Cost per conversion', v: x => (x.conversions ? x.spend / x.conversions : null), lo: 1 },
  ];
  const G_DEF = ['status', 'budget', 'type', 'spend', 'clicks', 'ctr', 'conversions', 'value', 'roas', 'cpa'];
  let G_REFUSED = null;
  function gRows(camps, cur, st, defs) {
    const cols = TBL.cols(st, defs), by = TBL.cmp(st, defs), mx = Math.max(...camps.map(x => x.spend), 1);
    const r = (x, y) => (y ? x / y : null);
    const cell = (x, d) => {
      switch (d.k) {
        case 'status': { const on = x.status === 'ENABLED'; if (!/^(ENABLED|PAUSED)$/.test(x.status)) return `<span class="v2pill">${esc(String(x.status).toLowerCase())}</span>`;
          return `<button type="button" class="v2sw${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="${on ? 'Pause' : 'Turn on'} this campaign" data-gsw="${esc(x.id)}"${G_REFUSED ? ' disabled' : ''}${tipAttr(G_REFUSED ? esc(G_REFUSED) : `${on ? 'On. Click to pause' : 'Paused. Click to turn on'} this campaign.`)}><i></i></button>`; }
        case 'budget': return x.budget == null ? `<span class="faint"${tipAttr(x.budget_total ? 'A total budget; change it in Google Ads.' : 'No budget read yet.')}>${x.budget_total ? `${money(x.budget_total, cur)} total` : '–'}</span>`
          : x.budget_shared ? `<span${tipAttr('A shared budget: changing it moves every campaign on it, so it stays in Google Ads.')}>${money(x.budget, cur)}/day <span class="faint">shared</span></span>`
          : `<button type="button" class="v2ed-b" data-gbud="${esc(x.id)}"${G_REFUSED ? ' disabled' : ''}${tipAttr(G_REFUSED ? esc(G_REFUSED) : 'Change this campaign’s daily budget')}>${money(x.budget, cur)}/day${G_REFUSED ? '' : ICN('pencil')}</button>`;
        case 'type': return esc(String(x.type || '').replace(/_/g, ' ').toLowerCase());
        case 'spend': return ib(x.spend, mx, '--c-google', kmoney(x.spend, cur));
        case 'impressions': case 'clicks': return int(x[d.k]);
        case 'ctr': return pct(r(x.clicks, x.impressions), 2);
        case 'cvr': return pct(r(x.conversions, x.clicks), 1);
        case 'cpc': case 'cpm': return money2(d.v(x), cur);
        case 'conversions': return (x.conversions || 0).toFixed(1);
        case 'value': return kmoney(x.value, cur);
        case 'roas': return x2(r(x.value, x.spend));
        case 'cpa': return money(r(x.spend, x.conversions), cur);
        default: return '';
      }
    };
    const list = by ? camps.slice().sort(by) : camps;
    return `<table id="v2gctbl"><thead><tr>${TBL.th(st, '_name', 'Campaign')}${cols.map(d => TBL.th(st, d.k, d.l, d.k === 'status' ? 'c' : '')).join('')}</tr></thead><tbody>${list.map(x => `<tr data-gc="${esc(x.id)}"><td><span class="nm" title="${esc(x.name)}">${esc(x.name)}</span></td>${cols.map(d => `<td class="${d.k === 'status' ? 'c' : ''}">${cell(x, d)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function gCampCard(camps, cur) {
    const defs = G_COLS(), st = TBL.load('google-camps', defs, G_DEF);
    return card('Campaigns', camps.length ? `${camps.length} campaign${camps.length === 1 ? '' : 's'} spent in this window. The switch and the budget change it in Google Ads, after you confirm.` : 'No campaign spent in this window.',
      camps.length ? `<div class="v2tbar"><span class="v2tbar-l" id="v2glive">${G_REFUSED ? `<span class="v2warn-t">${ICN('circle-alert')} ${esc(G_REFUSED)}</span>` : '<span class="faint">Click a column to sort.</span>'}</span><div class="hd-period pm v2cols" data-tbl="${st.id}">${TBL.menu(st, defs)}</div></div><div class="v2tbl wide" id="v2gcwrap">${gRows(camps, cur, st, defs)}</div>` : '', 'Google Ads API');
  }
  function wireGCamp(root, camps, cur, a) {
    const wrap = root.querySelector('#v2gcwrap'); if (!wrap) return;
    const defs = G_COLS(), st = TBL.load('google-camps', defs, G_DEF);
    const redraw = () => { wrap.innerHTML = gRows(camps, cur, st, defs); hook(); };
    const hook = () => {
      TBL.wire(wrap, st, defs, redraw);
      wrap.querySelectorAll('[data-gsw]').forEach(el => el.onclick = () => { const x = camps.find(c => String(c.id) === el.dataset.gsw); if (x) gEdit(x, x.status === 'ENABLED' ? 'pause' : 'resume', cur, a, redraw); });
      wrap.querySelectorAll('[data-gbud]').forEach(el => el.onclick = () => { const x = camps.find(c => String(c.id) === el.dataset.gbud); if (x) gEdit(x, 'budget', cur, a, redraw); });
    };
    hook(); TBL.wire(wrap.closest('.v2card').querySelector('.v2tbar'), st, defs, redraw);
  }
  function gEdit(x, kind, cur, a, redraw) {
    const s = sym(cur), budget = kind === 'budget';
    const title = budget ? 'Change the daily budget' : kind === 'pause' ? 'Pause this campaign?' : 'Turn this campaign on?';
    const cta = budget ? 'Apply' : kind === 'pause' ? 'Pause it' : 'Turn it on';
    const w = document.createElement('div'); w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal v2edm" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><p class="v2ed-o">Google campaign · <b>${esc(x.name)}</b></p>
      ${budget ? `<label class="v2fld"><span>New daily budget</span><span class="v2in"><i>${esc(s)}</i><input type="number" min="1" step="1" id="v2edv" value="${Math.round(x.budget * 100) / 100}"></span></label><div class="v2ba" id="v2edba"></div><p class="hint" id="v2edw"></p>`
        : `<div class="v2ba"><span>${x.status === 'ENABLED' ? 'On' : 'Paused'}</span><i>→</i><b>${kind === 'pause' ? 'Paused' : 'On'}</b></div>${x.spend ? `<p class="hint">It spent ${kmoney(x.spend, cur)} in this window for ${(x.conversions || 0).toFixed(1)} conversions.</p>` : ''}`}
      <p class="v2bad" id="v2ederr" hidden></p>
      <div class="row v2ed-a"><span class="faint">Written to Google Ads; it shows in Google’s change history. Undo from the message.</span><button class="btn" data-m="no" type="button">Cancel</button><button class="btn primary" data-m="yes" type="button">${esc(cta)}</button></div></div>`;
    document.body.appendChild(w);
    const $w = q => w.querySelector(q), yes = $w('[data-m="yes"]'), err = $w('#v2ederr');
    const close = () => { w.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') close(); if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !yes.disabled) yes.click(); };
    document.addEventListener('keydown', key); w.addEventListener('mousedown', e => { if (e.target === w) close(); }); $w('[data-m="no"]').onclick = close;
    const prev = () => {
      if (!budget) return true;
      const to = +$w('#v2edv').value, from = x.budget, ok = to > 0 && Math.abs(to - from) >= 0.01;
      $w('#v2edba').innerHTML = ok ? `<span>${money(from, cur)}/day</span><i>→</i><b>${money(to, cur)}/day</b><em class="${to > from ? 'up' : 'down'}">${to >= from ? '+' : ''}${Math.round((to - from) / from * 100)}%</em>` : '<span class="faint">Type the new amount.</span>';
      $w('#v2edw').innerHTML = ok && Math.abs(to - from) / from > 0.5 ? `<span class="v2warn-t">${ICN('circle-alert')} Over 50% in one step. Smart bidding may need a few days to settle.</span>` : ok ? `About ${money(Math.abs(to - from) * 30.4, cur)} a month ${to > from ? 'more' : 'less'} at full delivery.` : '';
      return ok;
    };
    if (budget) { const i = $w('#v2edv'); i.oninput = () => { yes.disabled = !prev(); }; yes.disabled = !prev(); i.focus(); i.select(); } else yes.focus();
    yes.onclick = async () => {
      const body = { act: a.act_id, kind, object: x.id, expect: budget ? { budget: x.budget } : { status: x.status } };
      if (budget) body.amount = +$w('#v2edv').value;
      yes.disabled = true; yes.textContent = 'Writing to Google…'; err.hidden = true;
      let r; try { r = await H.apiAH('/api/google/write', { method: 'POST', body: JSON.stringify(body) }); } catch (e) { r = { error: e.message }; }
      if (!r || r.error) {
        err.textContent = (r && r.error) || 'Google Ads did not answer.'; err.hidden = false; yes.disabled = false; yes.textContent = cta;
        if (r && r.refused) { G_REFUSED = `Google Ads refused changes from Locus: ${String(r.error).replace(/^Google Ads refused the change:\s*/, '')}`; redraw(); }
        return;
      }
      close();
      const before = { status: x.status, budget: x.budget };
      if (r.after.status) x.status = r.after.status; if (r.after.budget != null) x.budget = r.after.budget;
      redraw();
      wtoast(r.summary.replace(/^Google campaign /, ''), false, async () => {
        const back = budget ? { act: a.act_id, kind: 'budget', object: x.id, amount: before.budget } : { act: a.act_id, kind: before.status === 'ENABLED' ? 'resume' : 'pause', object: x.id };
        let u; try { u = await H.apiAH('/api/google/write', { method: 'POST', body: JSON.stringify(back) }); } catch (e) { u = { error: e.message }; }
        if (!u || u.error) { wtoast((u && u.error) || 'Could not undo.', true); return; }
        x.status = before.status; x.budget = before.budget; redraw(); wtoast('Undone. Google has the old value back.');
      });
    };
  }
  async function gcampaigns(first) {
    const t = H.RUN(); const a = H.S.accounts.find(x => x.act_id === H.S.act);
    const title = a ? `Google campaigns: ${esc(a.name)}` : 'Google campaigns';
    if (!a) { $('#main').innerHTML = shell('gcampaigns', title, card('Pick a brand', '', '<p class="v2hint">Campaigns are read from each brand’s own Google Ads account. Pick a brand in the menu.</p>')); return; }
    if (!(a.conn_kinds || []).includes('google_ads')) { $('#main').innerHTML = shell('gcampaigns', title, card(`Google Ads is not linked for ${esc(a.name)}`, '', `<p class="v2hint">${esc(PLAT.google.adds)}</p><button type="button" class="v2btn" data-go="settings">Open Integrations</button>`)); wireGo($('#main')); return; }
    if (first) $('#main').innerHTML = shell('gcampaigns', title, skPage({ tiles: 8 }));
    const w = win(), q = (f, to) => H.apiAH(`/api/google/ads?act=${encodeURIComponent(a.act_id)}&from=${f}&to=${to}`);
    let g, gp = null;
    try { [g, gp] = await Promise.all([q(w.from, w.to), w.pf ? q(w.pf, w.pt).catch(() => null) : null]); } catch (e) { g = { error: e.message }; }
    if (t !== H.RUN()) return;
    if (!g || g.error) { $('#main').innerHTML = shell('gcampaigns', title, card('Google Ads did not answer', '', `<p class="v2bad">${esc(g?.error === 'not_linked' ? 'This brand has no Google Ads customer ID yet.' : g?.error || 'No answer.')}</p><button type="button" class="v2btn" id="gcRetry">Try again</button>`)); const rb = $('#gcRetry'); if (rb) rb.onclick = () => gcampaigns(false); return; }
    const cur = a.currency, camps = g.campaigns || [];
    const day1 = x => ({ date: x.date, spend: x.spend, clicks: x.clicks, purchases: x.conversions, revenue: x.value });
    const rows = (g.days || []).map(day1).sort((x, y) => (x.date < y.date ? -1 : 1)).map(ratios), prows = ((gp && gp.days) || []).map(day1).sort((x, y) => (x.date < y.date ? -1 : 1)).map(ratios);
    const T = (list, k) => list.reduce((s, x) => s + (x[k] || 0), 0);
    const c = { spend: T(camps, 'spend'), impressions: T(camps, 'impressions'), clicks: T(camps, 'clicks'), conv: T(camps, 'conversions'), value: T(camps, 'value') };
    const pc = gp && !gp.error ? { spend: T(gp.campaigns || [], 'spend'), impressions: T(gp.campaigns || [], 'impressions'), clicks: T(gp.campaigns || [], 'clicks'), conv: T(gp.campaigns || [], 'conversions'), value: T(gp.campaigns || [], 'value') } : {};
    const r = (x, y) => (y ? x / y : null), km = v => kmoney(v, cur);
    const tl = [
      tile({ compact: true, label: 'Spend', src: 'GOOGLE', value: kmoney(c.spend, cur), delta: delta(c.spend, pc.spend, 'n'), sub: `${int(camps.length)} campaigns spent`, spark: tspark(rows, prows, 'spend', km, 'spend') }),
      tile({ compact: true, label: 'Clicks', src: 'GOOGLE', value: int(c.clicks), delta: delta(c.clicks, pc.clicks), sub: `${money2(r(c.spend, c.clicks), cur)} per click`, spark: tspark(rows, prows, 'clicks', int, 'clicks') }),
      tile({ compact: true, label: 'CTR', src: 'GOOGLE', value: pct(r(c.clicks, c.impressions), 2), delta: delta(r(c.clicks, c.impressions), r(pc.clicks, pc.impressions), false, true), sub: `${int(c.impressions)} impressions` }),
      tile({ compact: true, label: 'CPM', src: 'GOOGLE', hint: 'lower is better', value: money2(r(c.spend * 1000, c.impressions), cur), delta: delta(r(c.spend * 1000, c.impressions), r((pc.spend || 0) * 1000, pc.impressions), true) }),
      tile({ compact: true, label: 'Conversions', src: 'GOOGLE', hint: 'Google’s own count', value: (c.conv || 0).toFixed(1), delta: delta(c.conv, pc.conv), spark: tspark(rows, prows, 'purchases', v => v.toFixed(1), 'conversions') }),
      tile({ compact: true, label: 'Conversion value', src: 'GOOGLE', hint: 'Google’s own count', value: kmoney(c.value, cur), delta: delta(c.value, pc.value), spark: tspark(rows, prows, 'revenue', km, 'value') }),
      tile({ compact: true, label: 'ROAS', src: 'GOOGLE', hint: 'value ÷ spend', value: x2(r(c.value, c.spend)), delta: delta(r(c.value, c.spend), r(pc.value, pc.spend)), spark: tspark(rows, prows, 'roas', x2, 'ROAS') }),
      tile({ compact: true, label: 'Cost per conversion', src: 'GOOGLE', hint: 'lower is better', value: money(r(c.spend, c.conv), cur), delta: delta(r(c.spend, c.conv), r(pc.spend, pc.conv), true), spark: tspark(rows, prows, 'cpa', v => money(v, cur), 'cost per conversion') }),
    ].join('');
    const byType = {}; for (const x of camps) { const k = String(x.type || 'other').replace(/_/g, ' ').toLowerCase(); const o = byType[k] ||= { k, spend: 0, value: 0, conv: 0, clicks: 0, n: 0 }; o.spend += x.spend; o.value += x.value; o.conv += x.conversions; o.clicks += x.clicks; o.n++; }
    const types = Object.values(byType).sort((x, y) => y.spend - x.spend), tmx = Math.max(...types.map(x => x.spend), 1), mx = Math.max(...camps.map(x => x.spend), 1);
    const body = `<div class="v2tiles">${tl}</div>
      ${paidChart('v2gc', rows, prows, cur, 'Spend and conversion value by day', 'Google Ads’ own conversion value; spend is exact.')}
      ${types.length > 1 ? card('By campaign type', 'Search, Shopping, Performance Max and the rest, side by side.', `<div class="v2tbl"><table><thead><tr><th>Type</th><th>Campaigns</th><th>Spend</th><th>Conversions</th><th>Value</th><th>ROAS</th><th>Cost per conversion</th></tr></thead><tbody>${types.map(x => `<tr><td><b>${esc(x.k)}</b></td><td>${x.n}</td><td>${ib(x.spend, tmx, '--c-google', kmoney(x.spend, cur))}</td><td>${x.conv.toFixed(1)}</td><td>${kmoney(x.value, cur)}</td><td>${x2(r(x.value, x.spend))}</td><td>${money(r(x.spend, x.conv), cur)}</td></tr>`).join('')}</tbody></table></div>`, 'Google Ads API') : ''}
      ${gCampCard(camps, cur)}
      ${foot(`Read from Google Ads directly, ${esc(w.from)} to ${esc(w.to)}, refreshed hourly. Conversions and value are Google’s own count, which runs differently from Triple Whale’s; the Overview job shows what Triple Whale credits to Google.`)}`;
    $('#main').innerHTML = shell('gcampaigns', title, body); wireGo($('#main'));
    wireGCamp($('#main'), camps, cur, a);
    wirePaidChart('v2gc', rows, prows, cur);
  }

  /* =========================================================================================
   * PAID > GOOGLE > ADS, SEARCH TERMS, CHANGES (2026-10-09): the same depth as Meta for a brand with a direct
   * Google Ads link (account-health google.js adsAds / adsTerms / adsChanges, each cached an hour). Purchases and
   * value here are GOOGLE'S OWN count and say so on every number; Triple Whale's credit stays on Overview.
   * ======================================================================================= */
  function gStyle() {
    if (document.getElementById('v2gcss')) return;
    const st = document.createElement('style'); st.id = 'v2gcss';
    st.textContent = `.gad-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.gad{border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--surface);display:flex;flex-direction:column;gap:10px;min-width:0}
.gad .top{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--muted)}
.gad .top b{color:var(--ink);font-weight:600;font-size:13px}
.gad .chips{display:flex;flex-wrap:wrap;gap:5px}
.gad .chips span{font-size:12px;padding:3px 8px;border-radius:99px;border:1px solid var(--line);color:var(--ink);background:var(--bg,transparent);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gad .chips span i{font-style:normal;color:var(--muted);margin-left:4px;font-size:11px}
.gad .desc{margin:0;padding-left:16px;font-size:12.5px;color:var(--ink-2);line-height:1.5}
.gad .url{font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gad .url a{color:inherit}
.gad .nums{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px 10px;border-top:1px solid var(--line);padding-top:10px;margin-top:auto}
.gad .nums div{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.gad .nums div b{display:block;font-size:14px;color:var(--ink);text-transform:none;letter-spacing:0;font-weight:600;margin-top:2px}
.gch-day{display:flex;align-items:baseline;gap:10px;font-size:12.5px;font-weight:650;color:var(--ink);margin:18px 0 2px}
.gch-day:first-child{margin-top:2px}
.gch-day span{font-weight:500;color:var(--muted)}
.gch-tl{border-left:2px solid var(--line);margin-left:4px;padding-left:18px}
.gch-row{display:grid;grid-template-columns:110px minmax(0,1fr);gap:4px 16px;padding:9px 0;font-size:13px;line-height:1.5;position:relative}
.gch-row::before{content:'';position:absolute;left:-24px;top:14px;width:8px;height:8px;border-radius:50%;background:var(--line-strong);box-shadow:0 0 0 3px var(--surface)}
.gch-row.m::before{background:var(--c-google)}
.gch-row .w{font-size:12px;color:var(--muted)}
.gch-row .w b{display:block;color:var(--ink);font-weight:600}
.gch-row .f{font-size:12px;color:var(--muted);margin-top:2px}
.gch-fold summary{cursor:pointer;font-weight:600;font-size:13.5px;list-style:none;display:flex;justify-content:space-between}
.gch-fold summary::-webkit-details-marker{display:none}
.gch-fold summary span{font-weight:500;color:var(--muted);font-size:12.5px}
@media (max-width:640px){.gch-row{grid-template-columns:1fr}.gad .nums{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
    document.head.appendChild(st);
  }
  /** The brand guard every Google job shares: pick a brand, linked or not, then the skeleton. */
  function gStart(tab, label, first) {
    const a = H.S.accounts.find(x => x.act_id === H.S.act);
    const title = a ? `Google ${label.toLowerCase()}: ${esc(a.name)}` : `Google ${label.toLowerCase()}`;
    if (!a) { $('#main').innerHTML = shell(tab, title, card('Pick a brand', '', `<p class="v2hint">${esc(label)} are read from each brand’s own Google Ads account. Pick a brand in the menu.</p>`)); return null; }
    if (!(a.conn_kinds || []).includes('google_ads')) { $('#main').innerHTML = shell(tab, title, card(`Google Ads is not linked for ${esc(a.name)}`, '', `<p class="v2hint">${esc(PLAT.google.adds)}</p><button type="button" class="v2btn" data-go="settings">Open Integrations</button>`)); wireGo($('#main')); return null; }
    gStyle();
    if (first) $('#main').innerHTML = shell(tab, title, skPage({ tiles: 0, chart: false, rows: 8 }));
    return { a, title };
  }
  /** A refusal from Google Ads, in plain words, with the fix and a retry. */
  function gFail(tab, title, g, retry) {
    $('#main').innerHTML = shell(tab, title, card('Google Ads did not answer', '', `<p class="v2bad">${esc(g?.error === 'not_linked' ? 'This brand has no Google Ads customer ID yet.' : g?.error || 'No answer.')}</p>${g?.fix ? `<p class="v2hint" style="margin-top:8px"><b>What to fix:</b> ${esc(g.fix)}</p>` : ''}<button type="button" class="v2btn" id="gRetry" style="margin-top:10px">Try again</button>`));
    const rb = $('#gRetry'); if (rb) rb.onclick = () => retry(false);
  }
  const gR = (x, y) => (y ? x / y : null);
  const gNote = '<div class="v2note"><span class="v2pill warn">Google-reported</span> <span>Conversions, value and ROAS on this page are Google Ads’ own count, which runs differently from Triple Whale’s. Overview shows what Triple Whale credits to Google.</span> <button type="button" class="v2link" data-go="google">Overview ›</button></div>';

  async function gads(first) {
    const t = H.RUN(); const s = gStart('gads', 'Ads', first); if (!s) return; const { a, title } = s;
    const w = win(); let g;
    try { g = await H.apiAH(`/api/google/ads-ads?act=${encodeURIComponent(a.act_id)}&from=${w.from}&to=${w.to}`); } catch (e) { g = { error: e.message }; }
    if (t !== H.RUN()) return;
    if (!g || g.error) return gFail('gads', title, g, gads);
    const cur = a.currency, ads = g.ads || [], groups = g.asset_groups || [];
    const spend = ads.reduce((x, y) => x + y.spend, 0) + groups.reduce((x, y) => x + y.spend, 0);
    const nums = x => `<div class="nums">
        <div>Spend<b>${kmoney(x.spend, cur)}</b></div><div>Clicks<b>${int(x.clicks)}</b></div><div>CTR<b>${pct(gR(x.clicks, x.impressions), 2)}</b></div><div>CPC<b>${money2(gR(x.spend, x.clicks), cur)}</b></div>
        <div>Conv. (Google)<b>${(x.conversions || 0).toFixed(1)}</b></div><div>Value (Google)<b>${kmoney(x.value, cur)}</b></div><div>ROAS (Google)<b>${x2(gR(x.value, x.spend))}</b></div><div>Cost / conv.<b>${money(gR(x.spend, x.conversions), cur)}</b></div></div>`;
    const tone = s => (s === 'excellent' || s === 'good' ? 'good' : s === 'poor' ? 'bad' : s === 'average' ? 'warn' : '');
    const adCard = x => `<article class="gad">
        <div class="top"><b>${esc(x.ad_group || x.campaign)}</b><span>${esc(x.campaign)}</span></div>
        <div class="top"><span class="v2pill">${esc(x.type || 'ad')}</span>${x.status && x.status !== 'enabled' ? `<span class="v2pill warn">${esc(x.status)}</span>` : ''}${x.strength ? `<span class="v2pill ${tone(x.strength)}">ad strength: ${esc(x.strength)}</span>` : ''}</div>
        ${x.headlines.length ? `<div class="chips">${x.headlines.map(h => `<span title="${esc(h.text)}">${esc(h.text)}${h.pinned ? `<i>pinned ${esc(h.pinned.replace(/^headline /, 'H'))}</i>` : ''}</span>`).join('')}</div>` : `<p class="v2hint">${/dynamic search/.test(x.type) ? 'Google writes the headline from the site for each search (dynamic search ad).' : /shopping|product/.test(x.type) ? 'A Shopping ad: the product photo, title and price come from the Merchant Center feed.' : 'No headlines carried for this ad type.'}</p>`}
        ${x.descriptions.length ? `<ul class="desc">${x.descriptions.map(d => `<li>${esc(d.text)}</li>`).join('')}</ul>` : ''}
        ${x.url ? `<div class="url"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\?.*$/, ''))}</a></div>` : ''}
        ${nums(x)}</article>`;
    const gmx = Math.max(...groups.map(x => x.spend), 1);
    const body = `${gNote}
      <p class="v2say lead">The top ${ads.length} ad${ads.length === 1 ? '' : 's'}${groups.length ? ` and ${groups.length} Performance Max asset group${groups.length === 1 ? '' : 's'}` : ''} took <b>${kmoney(spend, cur)}</b> from ${esc(day(w.from))} to ${esc(day(w.to))}.</p>
      ${card('Ads, by spend', 'Each ad with its headlines and descriptions as Google shows them. Pinned headlines always show in that slot.', ads.length ? `<div class="gad-grid">${ads.map(adCard).join('')}</div>` : '<p class="v2hint">No ad spent in this window. Widen the dates at the top.</p>', 'Google Ads API')}
      ${groups.length ? card('Performance Max asset groups', 'Performance Max has no single ads: Google mixes each asset group’s headlines, images and videos itself.', `<div class="v2tbl wide"><table><thead><tr><th>Asset group</th><th>Campaign</th><th>Spend</th><th>Clicks</th><th>Conv. (Google)</th><th>Value (Google)</th><th>ROAS (Google)</th><th>Cost / conv.</th></tr></thead><tbody>${groups.map(x => `<tr><td><span class="nm" title="${esc(x.name)}">${esc(x.name)}</span>${x.strength ? ` <span class="v2pill ${tone(x.strength)}">${esc(x.strength)}</span>` : ''}${x.status !== 'enabled' ? ` <span class="v2pill">${esc(x.status)}</span>` : ''}</td><td><span class="nm" title="${esc(x.campaign)}">${esc(x.campaign)}</span></td><td>${ib(x.spend, gmx, '--c-google', kmoney(x.spend, cur))}</td><td>${int(x.clicks)}</td><td>${x.conversions.toFixed(1)}</td><td>${kmoney(x.value, cur)}</td><td>${x2(gR(x.value, x.spend))}</td><td>${money(gR(x.spend, x.conversions), cur)}</td></tr>`).join('')}</tbody></table></div>`, 'Google Ads API') : ''}
      ${g.asset_groups_error ? `<p class="v2hint">Performance Max asset groups could not be read: ${esc(g.asset_groups_error)}</p>` : ''}
      <div class="v2gos"><button type="button" class="v2go" data-go="gterms"><b>What people searched before they clicked</b><span>The top 50 search terms by spend, with the ones that never converted marked.</span><i>›</i></button></div>
      ${foot(`Read from Google Ads directly (account ${esc(g.customer)}), ${esc(w.from)} to ${esc(w.to)}, refreshed hourly. Top 20 ads by spend.`)}`;
    $('#main').innerHTML = shell('gads', title, body); wireGo($('#main'));
  }

  async function gterms(first) {
    const t = H.RUN(); const s = gStart('gterms', 'Search terms', first); if (!s) return; const { a, title } = s;
    const w = win(); let g;
    try { g = await H.apiAH(`/api/google/ads-terms?act=${encodeURIComponent(a.act_id)}&from=${w.from}&to=${w.to}`); } catch (e) { g = { error: e.message }; }
    if (t !== H.RUN()) return;
    if (!g || g.error) return gFail('gterms', title, g, gterms);
    const cur = a.currency, terms = g.terms || [];
    const words = String(a.name || '').toLowerCase().split(/[\s&-]+/).filter(x => x.length > 2 && !/^(golf|the|and|club|co)$/.test(x));
    const isBrand = q => words.some(x => q.toLowerCase().replace(/\s+/g, '').includes(x));
    const tot = terms.reduce((x, y) => x + y.spend, 0), dead = terms.filter(x => x.spend > 0 && x.conversions < 0.5), deadS = dead.reduce((x, y) => x + y.spend, 0);
    const br = terms.filter(x => isBrand(x.term)), brS = br.reduce((x, y) => x + y.spend, 0), brV = br.reduce((x, y) => x + y.value, 0), nbS = tot - brS, nbV = terms.reduce((x, y) => x + y.value, 0) - brV;
    const mx = Math.max(...terms.map(x => x.spend), 1);
    const ST = { added: 'keyword', excluded: 'negative', 'added excluded': 'keyword + negative', none: '' };
    const body = `${gNote}
      <p class="v2say lead">The top ${terms.length} search terms took <b>${kmoney(tot, cur)}</b>. ${words.length ? `Searches for the brand: <b>${kmoney(brS, cur)}</b> at ${x2(gR(brV, brS))}; everything else: <b>${kmoney(nbS, cur)}</b> at ${x2(gR(nbV, nbS))} (Google-reported). ` : ''}${dead.length ? `<b>${kmoney(deadS, cur)}</b> went on ${dead.length} term${dead.length === 1 ? '' : 's'} with no conversion.` : 'Every term here converted at least once.'}</p>
      ${card('Search terms, by spend', 'What people typed before they clicked. Keyword = it is already a keyword; Negative = it is blocked. A term with spend and no conversion is a candidate negative.', terms.length ? `<div class="v2tbl wide"><table><thead><tr><th>Search term</th><th>Campaign / ad group</th><th>Spend</th><th>Clicks</th><th>CTR</th><th>CPC</th><th>Conv. (Google)</th><th>Value (Google)</th><th>ROAS (Google)</th><th>Cost / conv.</th></tr></thead><tbody>${terms.map(x => `<tr><td><span class="nm" title="${esc(x.term)}">${esc(x.term)}</span>${isBrand(x.term) ? ' <span class="v2pill">brand</span>' : ''}${ST[x.status] ? ` <span class="v2pill">${ST[x.status]}</span>` : ''}${x.conversions < 0.5 ? ' <span class="v2pill bad">no conversion</span>' : ''}</td><td><span class="nm" title="${esc(x.campaign)} / ${esc(x.ad_group)}">${esc(x.ad_group || x.campaign)}</span></td><td>${ib(x.spend, mx, '--c-google', money2(x.spend, cur))}</td><td>${int(x.clicks)}</td><td>${pct(gR(x.clicks, x.impressions), 1)}</td><td>${money2(gR(x.spend, x.clicks), cur)}</td><td>${x.conversions.toFixed(1)}</td><td>${kmoney(x.value, cur)}</td><td>${x2(gR(x.value, x.spend))}</td><td>${money(gR(x.spend, x.conversions), cur)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="v2hint">No search term spent in this window. Performance Max and Demand Gen do not report search terms here.</p>', 'Google Ads API')}
      ${foot(`Read from Google Ads directly (account ${esc(g.customer)}), ${esc(w.from)} to ${esc(w.to)}, refreshed hourly. Top 50 terms by spend from Search and Shopping; Performance Max search terms are not included. Brand terms are matched on the brand name.`)}`;
    $('#main').innerHTML = shell('gterms', title, body); wireGo($('#main'));
  }

  async function gchanges(first) {
    const t = H.RUN(); const s = gStart('gchanges', 'Changes', first); if (!s) return; const { a, title } = s;
    const w = win(); let g;
    try { g = await H.apiAH(`/api/google/ads-changes?act=${encodeURIComponent(a.act_id)}&from=${w.from}&to=${w.to}`); } catch (e) { g = { error: e.message }; }
    if (t !== H.RUN()) return;
    if (!g || g.error) return gFail('gchanges', title, g, gchanges);
    const rows = g.changes || [], main = rows.filter(x => x.matters), rest = rows.filter(x => !x.matters);
    const CAT = { budget: ['Budget', 'warn'], bids: ['Bid strategy', 'warn'], status: ['On / off', ''], new: ['New', 'good'], keywords: ['Keywords', ''], other: ['Other', ''] };
    const when = s => { const d = new Date(String(s).replace(' ', 'T').slice(0, 19)); return isNaN(d) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
    const dkey = s => String(s).slice(0, 10);
    const row = x => { const c = CAT[x.category] || CAT.other; const extra = x.fields.length > 1 || (x.fields.length === 1 && x.category === 'other' && x.fields[0].old != null && x.fields[0].new != null && !x.summary.includes(x.fields[0].new)) ? `<div class="f">${x.fields.map(f => `${esc(f.field)}: ${esc(f.old ?? '(new)')} → ${esc(f.new ?? '(removed)')}`).join(' · ')}</div>` : '';
      return `<div class="gch-row${x.matters ? ' m' : ''}"><div class="w"><b>${esc(when(x.at))}</b>${esc(x.who ? x.who.replace(/@.*/, '') : 'Google')}${x.via ? ` ${esc(x.via)}` : ''}</div><div><span class="v2pill ${c[1]}">${esc(c[0])}</span> ${esc(x.summary)}${extra}</div></div>`; };
    const days = list => { const m = new Map(); for (const x of list) { const k = dkey(x.at); (m.get(k) || m.set(k, []).get(k)).push(x); } return [...m.entries()].map(([k, xs]) => `<div class="gch-day">${esc(new Date(k + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))}<span>${xs.length} change${xs.length === 1 ? '' : 's'}</span></div><div class="gch-tl">${xs.map(row).join('')}</div>`).join(''); };
    const who = [...new Set(rows.map(x => x.who).filter(Boolean))];
    const body = `${g.clamped && w.from < g.from && (Date.parse(g.from) - Date.parse(w.from)) > 3 * 864e5 ? `<div class="v2note"><span class="v2pill">30 days</span> <span>Google keeps change history for 30 days only, so this starts ${esc(day(g.from))} even though the period at the top starts earlier.</span></div>` : ''}
      <p class="v2say lead">${rows.length ? `<b>${rows.length}</b> change${rows.length === 1 ? '' : 's'} on the Google Ads account from ${esc(day(g.from))} to ${esc(day(g.to))}${main.length ? `, <b>${main.length}</b> that matter${main.length === 1 ? 's' : ''}` : ''}${who.length ? `, by ${esc(who.map(x => x.replace(/@.*/, '')).join(', '))}` : ''}.` : `No changes on the Google Ads account from ${esc(day(g.from))} to ${esc(day(g.to))}.`}</p>
      <section class="v2card"><div class="v2h"><h3>Changes that matter</h3><span class="find">Budgets, bid strategy and targets, campaigns and ad groups switched on or off, new campaigns, ad groups and ads, and keywords. Newest first.</span><span class="cap"><b>${main.length}</b> in this list</span></div>
        ${main.length ? days(main) : '<p class="v2hint">None in this period.</p>'}</section>
      ${rest.length ? `<section class="v2card"><details class="gch-fold"><summary>Everything else (${rest.length})<span>Open</span></summary><p class="v2hint" style="margin-top:4px">Assets, renames, URLs, audience signals and the rest. Here for reference.</p><div style="margin-top:6px">${days(rest)}</div></details></section>` : ''}
      ${foot(`Read from Google Ads’ change history (account ${esc(g.customer)}), refreshed hourly. Times are the account’s time zone.${g.truncated ? ' Showing the latest 200 changes; pick a shorter period to see everything.' : ''}`)}`;
    $('#main').innerHTML = shell('gchanges', title, body); wireGo($('#main'));
    const fd = $('#main').querySelector('.gch-fold'); if (fd) fd.addEventListener('toggle', () => { const sp = fd.querySelector('summary span'); if (sp) sp.textContent = fd.open ? 'Close' : 'Open'; });
  }

  /* =========================================================================================
   * PAID > ALL CHANNELS
   * ======================================================================================= */
  async function channels(first) {
    const t = H.RUN(); const one = H.S.act !== 'all';
    const title = one ? `All channels: ${esc((H.S.accounts.find(a => a.act_id === H.S.act) || {}).name || '')}` : 'All channels';
    if (first) $('#main').innerHTML = shell('channels', title, skPage({ tiles: 8 }));
    let d; try { d = await get(`/api/hub/paid?platform=all&act=${encodeURIComponent(H.S.act)}&${H.rangeQ()}${modelQ()}`); } catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('channels', title, `<div class="v2card"><p class="v2bad">${esc(e.message)}</p></div>`); return; }
    if (t !== H.RUN()) return;
    const bs = d.brands; const cur = oneCur(bs);
    const agg = {}; for (const b of bs) for (const r of b.rows) { const o = agg[r.id] ||= { id: r.id, label: r.label, spend: 0, revenue: 0, platform_revenue: 0, prev_revenue: 0, prev_spend: 0, nc: 0, hasP: false }; o.spend += r.spend || 0; o.revenue += r.revenue || 0; if (r.platform_revenue != null) { o.platform_revenue += r.platform_revenue; o.hasP = true; } o.prev_revenue += r.prev_revenue || 0; o.prev_spend += r.prev_spend || 0; o.nc += r.nc || 0; }
    const rows = Object.values(agg); const rev = bs.reduce((s, b) => s + (b.revenue || 0), 0), spend = bs.reduce((s, b) => s + (b.blended_spend || 0), 0), prev = bs.reduce((s, b) => s + (b.prev_revenue || 0), 0), pspend = bs.reduce((s, b) => s + (b.prev_blended || 0), 0);
    const paid = rows.filter(r => r.spend > 0); const best = paid.slice().sort((x, y) => (y.revenue / y.spend) - (x.revenue / x.spend))[0];
    const m = new Map(); for (const b of bs) for (const r of b.series || []) { const o = m.get(r.date) || { date: r.date, meta: 0, google: 0, tiktok: 0 }; o.meta += r.meta; o.google += r.google; o.tiktok += r.tiktok; m.set(r.date, o); }
    const series = [...m.values()].sort((x, y) => x.date < y.date ? -1 : 1); const ser = [{ key: 'meta', label: 'Meta', color: '--c-meta' }, { key: 'google', label: 'Google', color: '--c-google' }, { key: 'tiktok', label: 'TikTok', color: '--c-tiktok' }];
    const mx = Math.max(...rows.map(r => r.revenue || 0), 1);
    /* THE BLENDED VIEW, MATCHING HOME (2026-10-09): store revenue, all ad spend and MER, then the paid platforms
       together (credited purchases, cost per purchase, CPM, CTR), each tile with its line; spend against revenue
       by day with the compare period dashed. */
    const KD = ['revenue', 'spend', 'purchases', 'paid_spend', 'impressions', 'clicks'];
    const dd = r => ({ ...r, mer: r.spend ? (r.revenue ?? 0) / r.spend : null, cpa: r.purchases ? r.paid_spend / r.purchases : null, cpm: r.impressions ? r.paid_spend * 1000 / r.impressions : null, ctr: r.impressions ? (r.clicks || 0) / r.impressions : null });
    const drows = mergeDays(bs.map(b => b.series || []), KD).map(dd), dprev = mergeDays(bs.map(b => b.prev_series || []), KD).map(dd);
    const PT = (k, w = 'paid') => bs.reduce((s, b) => s + ((b[w] || {})[k] || 0), 0), pend = bs.some(b => b.paid && b.paid.attr_pending);
    const pd = { spend: PT('spend'), ord: pend ? null : PT('purchases'), imp: PT('impressions'), clk: PT('clicks') }, pp = { spend: PT('spend', 'prev_paid'), ord: PT('purchases', 'prev_paid'), imp: PT('impressions', 'prev_paid'), clk: PT('clicks', 'prev_paid') };
    const km = v => kmoney(v, cur), rr = (x, y) => (y ? x / y : null);
    /* Which platform tabs this brand does not show, and why (the same test show() uses to hide them). */
    const hidden = (() => { if (!one) return ''; const a = H.S.accounts.find(x => x.act_id === H.S.act); if (!a || !Array.isArray(a.conn_kinds)) return '';
      const ch = a.channels, list = Array.isArray(ch) ? ch : (ch && (ch.rows || ch.channels)) || [];
      const sp = id => list.some(r => r && r.id === id && (r.spend || 0) > 0);
      const out = [['google', 'Google', 'google_ads'], ['tiktok', 'TikTok', 'tiktok']].filter(([id, , ck]) => !a.conn_kinds.includes(ck) && !sp(id)).map(([, l]) => `<b>${l}</b>: not connected and no spend in Triple Whale`);
      return out.length ? `<p class="v2hint v2hidden">Tabs hidden for ${esc(a.name)}: ${out.join('; ')}. They show again once the platform is connected in Brand settings &gt; Integrations or spends through Triple Whale.</p>` : ''; })();
    const body = `${hidden}${cur ? `<div class="v2tiles home8">${[
        tile({ compact: true, label: 'Revenue', src: 'SHOPIFY', value: kmoney(rev, cur), delta: delta(rev, prev), sub: 'store revenue, every channel', spark: tspark(drows, dprev, 'revenue', km, 'revenue') }),
        tile({ compact: true, label: 'Ad spend', src: 'TW', hint: 'every platform', value: kmoney(spend, cur), delta: delta(spend, pspend, 'n'), sub: `${kmoney(pd.spend, cur)} on Meta, Google and TikTok`, spark: tspark(drows, dprev, 'spend', km, 'ad spend') }),
        tile({ compact: true, label: 'MER', src: 'BLENDED', hint: 'revenue ÷ all ad spend', value: x2(rr(rev, spend)), delta: delta(rr(rev, spend), rr(prev, pspend)), spark: tspark(drows, dprev, 'mer', x2, 'MER') }),
        tile({ compact: true, label: 'Paid purchases', src: isPlat() ? 'PLATFORMS' : 'TW', hint: 'credited to Meta, Google and TikTok', value: pend ? '–' : int(pd.ord), delta: pend ? '' : delta(pd.ord, pp.ord), sub: pend ? 'Triple Whale credits land overnight' : 'two platforms can claim one order', spark: pend ? '' : tspark(drows, dprev, 'purchases', int, 'paid purchases') }),
        tile({ compact: true, label: 'Cost per purchase', src: isPlat() ? 'PLATFORMS' : 'TW', hint: 'lower is better', value: pend ? '–' : money(rr(pd.spend, pd.ord), cur), delta: pend ? '' : delta(rr(pd.spend, pd.ord), rr(pp.spend, pp.ord), true), sub: 'paid spend ÷ credited purchases', spark: pend ? '' : tspark(drows, dprev, 'cpa', v => money(v, cur), 'cost per purchase') }),
        tile({ compact: true, label: 'CPM', src: 'PLATFORMS', hint: 'lower is better', value: money2(rr(pd.spend * 1000, pd.imp), cur), delta: delta(rr(pd.spend * 1000, pd.imp), rr(pp.spend * 1000, pp.imp), true), sub: `${int(pd.imp)} impressions`, spark: tspark(drows, dprev, 'cpm', v => money2(v, cur), 'CPM') }),
        tile({ compact: true, label: 'CTR', src: 'PLATFORMS', value: pct(rr(pd.clk, pd.imp), 2), delta: delta(rr(pd.clk, pd.imp), rr(pp.clk, pp.imp), false, true), sub: `${int(pd.clk)} clicks`, spark: tspark(drows, dprev, 'ctr', v => pct(v, 2), 'CTR') }),
        tile({ compact: true, label: 'Most efficient paid dollar', value: best ? esc(best.label) : '–', sub: best ? `${x2(best.revenue / best.spend)} on ${kmoney(best.spend, cur)}` : '' })].join('')}</div>
      ${paidChart('v2chsr', drows, dprev, cur, 'Revenue and ad spend by day', 'Store revenue against every platform’s spend, the same chart as Home.')}` : ''}
      ${card('Every channel', isPlat() ? 'On the platforms’ own numbers.' : `Credited under ${esc(MODEL_SHORT[H.S.model])}, with each platform’s own number and the gap.`, `<div class="v2tbl"><table><thead><tr><th>Channel</th><th>Spend</th><th>Revenue</th><th>Platform says</th><th>Gap</th><th>Share</th><th>ROAS</th><th>First orders</th><th>CAC</th><th>vs before</th></tr></thead><tbody>
        ${rows.map(r => { const gap = !isPlat() && r.hasP && r.spend ? r.revenue - r.platform_revenue : null; return `<tr${['meta', 'google', 'tiktok'].includes(r.id) ? ` data-go="${r.id}" class="link"` : ''}><td><span class="sw" style="background:var(${CH[r.id] || '--c-else'})"></span>${esc(r.label)}</td><td>${r.spend ? kmoney(r.spend, cur) : '<span class="faint">–</span>'}</td><td>${ib(r.revenue, mx, CH[r.id] || '--c-else', kmoney(r.revenue, cur))}</td><td class="faint">${r.hasP && r.spend ? kmoney(r.platform_revenue, cur) : '–'}</td><td class="${gap == null ? '' : gap >= 0 ? 'good' : 'bad'}">${gap == null ? '–' : (gap >= 0 ? '+' : '−') + kmoney(Math.abs(gap), cur)}</td><td>${rev ? pct(r.revenue / rev, 0) : '–'}</td><td>${r.spend ? x2(r.revenue / r.spend) : '–'}</td><td>${int(r.nc)}</td><td>${r.spend && r.nc ? money(r.spend / r.nc, cur) : '–'}</td><td>${r.prev_revenue ? delta(r.revenue, r.prev_revenue) : ''}</td></tr>`; }).join('')}
      </tbody></table></div>`, `Attribution: <b>${esc(MODEL_SHORT[H.S.model])}</b>`)}
      ${series.length > 1 ? card('Spend by platform, by day', '', legend(ser) + stackChart('v2chs', series, ser, { cur })) : ''}
      ${!one ? card('Each brand, paid mix', '', `<div class="v2tbl"><table><thead><tr><th>Brand</th><th>Revenue</th><th>Blended spend</th><th>MER</th><th>Meta</th><th>Google</th><th>TikTok</th><th>Email</th></tr></thead><tbody>${bs.filter(b => b.revenue).sort((x, y) => y.revenue - x.revenue).map(b => { const r = id => b.rows.find(x => x.id === id); const cell = (id, k) => r(id) ? kmoney(r(id)[k], b.currency) : '<span class="faint">–</span>'; return `<tr data-act="${esc(b.act_id)}" tabindex="0" class="link"><td><b>${esc(b.name)}</b></td><td>${kmoney(b.revenue, b.currency)} ${delta(b.revenue, b.prev_revenue)}</td><td>${kmoney(b.blended_spend, b.currency)}</td><td>${x2(b.blended_spend ? b.revenue / b.blended_spend : null)}</td><td>${cell('meta', 'spend')}</td><td>${cell('google', 'spend')}</td><td>${cell('tiktok', 'spend')}</td><td>${cell('email', 'revenue')}</td></tr>`; }).join('')}</tbody></table></div>`) : ''}`;
    $('#main').innerHTML = shell('channels', title, body + foot('Revenue is the store’s (Shopify, through Triple Whale). Spend is each platform’s own. Click models let two platforms claim one order, so channel revenue can add to more than revenue.'));
    const root = $('#main'); wireGo(root); wireRows(root, 'channels'); if (series.length > 1) wireStack('v2chs', series, ser, cur);
    if (cur) wirePaidChart('v2chsr', drows, dprev, cur);
    /* Two models side by side (2026-10-08, research-v3 3.1): the screen's model against any other, per
       channel, so "Meta gets credit for X under last click and Y under first click" is one glance. */
    const cmpHost = document.createElement('div'); const tbl = [...root.querySelectorAll('.v2card')].find(x => (x.querySelector('h3') || {}).textContent === 'Every channel') || root.querySelector('.v2card'); if (tbl) tbl.after(cmpHost);
    let other = MODEL2.get(); if (!other || other === H.S.model || !MODEL_SHORT[other]) other = H.S.model === 'fullFirstClick' ? 'lastPlatformClick' : 'fullFirstClick';
    const drawCmp = async m2 => {
      cmpHost.innerHTML = skCard(5);
      let d2; try { d2 = await get(`/api/hub/paid?platform=all&act=${encodeURIComponent(H.S.act)}&${H.rangeQ()}&model=${encodeURIComponent(m2)}`); } catch (e) { cmpHost.innerHTML = ''; return; }
      if (t !== H.RUN()) return;
      const agg2 = {}; for (const b of d2.brands) for (const r of b.rows) { const o = agg2[r.id] ||= { revenue: 0 }; o.revenue += r.revenue || 0; }
      const paidRows = rows.filter(r => r.spend > 0 || (agg2[r.id] && agg2[r.id].revenue));
      const opts = Object.entries(MODEL_SHORT).filter(([k]) => k !== H.S.model).map(([k, l]) => `<option value="${k}" ${k === m2 ? 'selected' : ''}>${esc(l)}</option>`).join('');
      const big = paidRows.map(r => ({ r, d: (agg2[r.id]?.revenue || 0) - (r.revenue || 0) })).sort((p, q) => Math.abs(q.d) - Math.abs(p.d))[0];
      cmpHost.innerHTML = card('Two models side by side', big && Math.abs(big.d) > 1 ? `${esc(big.r.label)} moves most: ${big.d >= 0 ? '+' : '−'}${kmoney(Math.abs(big.d), cur)} under ${esc(MODEL_SHORT[m2])}.` : 'The two models agree on every channel.',
        `<label class="v2sel">Compare ${esc(MODEL_SHORT[H.S.model])} with <select id="v2m2">${opts}</select></label>
        <div class="v2tbl"><table><thead><tr><th>Channel</th><th>Spend</th><th>${esc(MODEL_SHORT[H.S.model])}</th><th>${esc(MODEL_SHORT[m2])}</th><th>Difference</th><th>ROAS</th><th>ROAS</th></tr></thead><tbody>
        ${paidRows.map(r => { const v2 = agg2[r.id]?.revenue || 0, df = v2 - (r.revenue || 0); return `<tr><td><span class="sw" style="background:var(${CH[r.id] || '--c-else'})"></span>${esc(r.label)}</td><td>${r.spend ? kmoney(r.spend, cur) : '–'}</td><td>${kmoney(r.revenue, cur)}</td><td>${kmoney(v2, cur)}</td><td class="${Math.abs(df) < 1 ? '' : df > 0 ? 'good' : 'bad'}">${Math.abs(df) < 1 ? '–' : (df > 0 ? '+' : '−') + kmoney(Math.abs(df), cur)}</td><td>${r.spend ? x2(r.revenue / r.spend) : '–'}</td><td>${r.spend ? x2(v2 / r.spend) : '–'}</td></tr>`; }).join('')}
        </tbody></table></div>`, 'Spend is the same under every model; only the credit moves');
      const sel = cmpHost.querySelector('#v2m2'); if (sel) sel.onchange = () => { MODEL2.set(sel.value); drawCmp(sel.value); };
    };
    if (cur) drawCmp(other);
  }

  /* =========================================================================================
   * STORE > SALES
   * ======================================================================================= */
  async function store(first) {
    const t = H.RUN(); const one = H.S.act !== 'all';
    const title = one ? `Sales: ${esc((H.S.accounts.find(a => a.act_id === H.S.act) || {}).name || '')}` : 'Sales';
    if (first) $('#main').innerHTML = shell('store', title, skPage({ tiles: 8 }));
    let d; try { d = await get(`/api/hub/store?act=${encodeURIComponent(H.S.act)}&${H.rangeQ()}`); } catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('store', title, `<div class="v2card"><p class="v2bad">${esc(e.message)}</p></div>`); return; }
    if (t !== H.RUN()) return;
    const bs = d.brands.filter(b => b.cur && b.cur.revenue); const cur = oneCur(bs.length ? bs : d.brands);
    if (!one) {
      const mx = Math.max(...bs.map(b => b.cur.revenue), 1);
      const tot = k => bs.reduce((s, b) => s + (b.cur[k] || 0), 0), ptot = k => bs.reduce((s, b) => s + ((b.prev || {})[k] || 0), 0);
      const body = `${cur ? `<div class="v2tiles">${[tile({ compact: true, label: 'Revenue', src: 'SHOPIFY', value: kmoney(tot('revenue'), cur), delta: delta(tot('revenue'), ptot('revenue')) }), tile({ compact: true, label: 'Orders', value: int(tot('orders')), delta: delta(tot('orders'), ptot('orders')), sub: `AOV ${money2(tot('revenue') / Math.max(1, tot('orders')), cur)}` }), tile({ compact: true, label: 'First orders', value: int(tot('new_orders')), delta: delta(tot('new_orders'), ptot('new_orders')) }), tile({ compact: true, label: 'Discounts', hint: 'lower is better', value: kmoney(tot('discounts'), cur), delta: delta(tot('discounts'), ptot('discounts'), true) })].join('')}</div>` : ''}
        ${card('Each store', 'Click a store to open it.', `<div class="v2tbl"><table><thead><tr><th>Brand</th><th>Revenue</th><th>Orders</th><th>AOV</th><th>Units per order</th><th>First orders</th><th>Returning revenue</th><th>Email</th><th>Trend</th></tr></thead><tbody>${bs.sort((x, y) => y.cur.revenue - x.cur.revenue).map(b => { const x = b.cur, p = b.prev || {}; return `<tr data-act="${esc(b.act_id)}" tabindex="0" class="link"><td><b>${esc(b.name)}</b></td><td>${ib(x.revenue, mx, null, kmoney(x.revenue, b.currency))} ${delta(x.revenue, p.revenue)}</td><td>${int(x.orders)} ${delta(x.orders, p.orders)}</td><td>${money2(x.aov, b.currency)}</td><td>${x.upo ? x.upo.toFixed(2) : '–'}</td><td>${int(x.new_orders)}</td><td>${kmoney(x.returning_revenue, b.currency)}</td><td>${x.email && x.revenue ? pct(x.email / x.revenue, 0) : '–'}</td><td>${spark((b.series || []).map(r => r.revenue), null, 120, 24)}</td></tr>`; }).join('')}</tbody></table></div>`)}`;
      $('#main').innerHTML = shell('store', title, body); wireRows($('#main'), 'store'); return;
    }
    const b = d.brands[0], c = b.cur || {}, p = b.prev || {}; const bridgeOk = c.gross && c.revenue && c.gross < (c.revenue + (c.discounts || 0)) * 1.6 && c.gross < c.revenue * 2;
    const bridge = (() => { if (!bridgeOk) return `<p class="v2hint">Gross sales here (${kmoney(c.gross, cur)}) run far above what the store took (${kmoney(c.revenue, cur)}), which usually means wholesale or draft orders sit inside Shopify’s gross. The bridge is hidden so it cannot mislead.</p>`;
      const steps = [['Gross sales', c.gross, 'base'], ['Discounts', -(c.discounts || 0), 'neg'], ['Returns', -(c.returns || 0), 'neg'], ['Shipping charged', c.shipping || 0, 'pos'], ['Revenue', c.revenue, 'total']]; const mx = Math.max(c.gross, c.revenue) * 1.05; let run = 0;
      return `<div class="v2bridge">${steps.map(([l, v, k]) => { let left, width; if (k === 'base' || k === 'total') { left = 0; width = v / mx * 100; run = v; } else if (v < 0) { left = (run + v) / mx * 100; width = -v / mx * 100; run += v; } else { left = run / mx * 100; width = v / mx * 100; run += v; }
        return `<div class="r"><span class="l">${l}</span><div class="t"><i class="${k}" style="left:${left.toFixed(2)}%;width:${Math.max(0.3, width).toFixed(2)}%"></i></div><span class="n ${k === 'neg' ? 'bad' : ''}">${v < 0 ? '−' : ''}${kmoney(Math.abs(v), cur)}${k === 'neg' && c.gross ? ` <em>${pct(-v / c.gross, 1)}</em>` : ''}</span></div>`; }).join('')}</div>`; })();
    const rows = b.series || [], prows = b.prev_series || [];
    const prodMx = Math.max(...(b.products || []).map(x => x.orders), 1);
    const body = `<div class="v2tiles">${[
        tile({ compact: true, label: 'Revenue', src: 'SHOPIFY', value: kmoney(c.revenue, cur), delta: delta(c.revenue, p.revenue), spark: spark(rows.map(r => r.revenue), prows.map(r => r.revenue)) }),
        tile({ compact: true, label: 'Orders', value: int(c.orders), delta: delta(c.orders, p.orders), sub: `${int(c.units)} units · ${c.upo ? c.upo.toFixed(2) : '–'} per order` }),
        tile({ compact: true, label: 'Average order', value: money2(c.aov, cur), delta: delta(c.aov, p.aov) }),
        tile({ compact: true, label: 'Discounts', hint: 'lower is better', value: kmoney(c.discounts, cur), delta: delta(c.discounts, p.discounts, true), sub: c.gross && bridgeOk ? `${pct(c.discounts / c.gross)} of gross` : '' }),
        tile({ compact: true, label: 'First orders', src: 'TW', value: int(c.new_orders), delta: delta(c.new_orders, p.new_orders), sub: `${pct(c.new_share, 0)} of revenue` }),
        tile({ compact: true, label: 'Returning revenue', value: kmoney(c.returning_revenue, cur), delta: delta(c.returning_revenue, p.returning_revenue), sub: `${int(c.returning_orders)} repeat orders` }),
        tile({ compact: true, label: 'Returns', hint: 'lower is better', value: kmoney(c.returns, cur), delta: delta(c.returns, p.returns, true) }),
        tile({ compact: true, label: 'Email and SMS', src: 'KLAVIYO', value: kmoney(c.email, cur), delta: delta(c.email, p.email), sub: c.revenue ? `${pct(c.email / c.revenue, 0)} of revenue` : '', go: 'email' })].join('')}</div>
      <div class="v2two">${card('From gross sales to revenue', bridgeOk ? `Discounts took ${pct(c.discounts / c.gross, 1)} of gross.` : '', bridge)}
        ${card('New against returning', `${pct(c.new_share, 0)} of revenue came from first orders.`, `<div class="v2stackbar"><i style="flex:${c.new_revenue || 0};background:var(--brand)"></i><i style="flex:${c.returning_revenue || 0};background:var(--c-email)"></i></div><div class="v2stacklab"><span><i style="background:var(--brand)"></i>New ${kmoney(c.new_revenue, cur)} · ${int(c.new_orders)} orders</span><span><i style="background:var(--c-email)"></i>Returning ${kmoney(c.returning_revenue, cur)} · ${int(c.returning_orders)} orders</span></div>
          ${c.sessions ? `<div class="v2fun" style="margin-top:14px">${[['Sessions', c.sessions, p.sessions], ['Carts', c.carts, p.carts], ['Orders', c.orders, p.orders]].map(([l, v, pv]) => `<div class="fs"><div class="l">${l}</div><div class="v">${int(v)}${delta(v, pv)}</div><div class="bar"><i class="g" style="width:${(pv / Math.max(c.sessions, p.sessions || 0) * 100).toFixed(1)}%"></i><i style="width:${(v / Math.max(c.sessions, p.sessions || 0) * 100).toFixed(1)}%"></i></div></div>`).join('')}</div><p class="v2hint">${pct(c.conversion, 2)} of sessions ordered${p.conversion ? `, against ${pct(p.conversion, 2)} before` : ''}.</p>` : ''}`)}</div>
      ${rows.length > 1 ? card('Revenue by day', '', legend([{ color: '--brand', label: 'Revenue' }, ...(prows.length ? [{ dash: true, label: cmpLabel() }] : [])]) + lineChart('v2srev', rows.map(r => ({ ...r, v: r.revenue })), { key: 'v', prev: prows.map(r => ({ ...r, v: r.revenue })), cur })) : ''}
      ${(b.products || []).length ? card('What goes in the cart', `From ${int(b.product_orders)} orders with a cart on record. Exact units per product arrive with the Shopify app.`, `<div class="v2tbl"><table><thead><tr><th>Product</th><th>Orders with it</th><th>Order value, shared</th></tr></thead><tbody>${b.products.map(x => `<tr><td>${esc(x.title)}</td><td>${ib(x.orders, prodMx, null, int(x.orders))}</td><td>${kmoney(x.revenue, cur)}</td></tr>`).join('')}</tbody></table></div>`) : ''}
      ${(c.amazon && c.amazon.sales) || (c.tiktok_shop && c.tiktok_shop.sales) ? `<div class="v2two">${c.amazon && c.amazon.sales ? card('Amazon', '', `<div class="v2kv"><span>Sales</span><b>${kmoney(c.amazon.sales, cur)}</b><span>Orders</span><b>${int(c.amazon.orders)}</b><span>Fees</span><b>${kmoney(c.amazon.fees, cur)}</b><span>Refunds</span><b>${kmoney(c.amazon.refunds, cur)}</b></div>`) : ''}${c.tiktok_shop && c.tiktok_shop.sales ? card('TikTok Shop', '', `<div class="v2kv"><span>Sales</span><b>${kmoney(c.tiktok_shop.sales, cur)}</b><span>Orders</span><b>${int(c.tiktok_shop.orders)}</b><span>Fees</span><b>${kmoney(c.tiktok_shop.fees, cur)}</b><span>Refunds</span><b>${kmoney(c.tiktok_shop.refunds, cur)}</b></div>`) : ''}</div>` : ''}`;
    $('#main').innerHTML = shell('store', title, body + foot('Revenue is Shopify total sales minus tax, through Triple Whale. Sessions and carts are derived from Triple Whale’s pixel cost per session and per cart.'));
    const root = $('#main'); wireGo(root);
    if (rows.length > 1) wireLine('v2srev', rows, { tip: (r, i) => `<b>${day(r.date)}</b> · ${kmoney(r.revenue, cur)} · ${int(r.orders)} orders${r.aov ? ` · AOV ${money2(r.aov, cur)}` : ''}${prows[i] ? `<br><span class="faint">${esc(cmpLabel())}: ${kmoney(prows[i].revenue, cur)}</span>` : ''}` });
  }

  /* =========================================================================================
   * EMAIL & SMS
   * ======================================================================================= */
  /* Klaviyo's published averages: campaigns open 38%, click 1.2%, $0.10 per recipient, placed order 0.08%, unsubscribe
     0.3%; spam under 0.01% and bounces under 1% are its healthy lines (2026-10-09 added the last three). */
  const BENCH = { open: 0.38, click: 0.012, rpr: 0.1, unsub: 0.003, spam: 0.0001, bounce: 0.01, por: 0.0008 };
  /* The agency email board (Hiro Analytics' best idea, 2026-10-08): every brand's Klaviyo on one
     screen, from each brand's own key (Klaviyo caches 6 hours per brand, so this is cheap after the
     first open). Core-flow gaps first, because a missing abandoned-cart flow is money left behind. */
  /* Subject lines and send times (Hiro Analytics' Subject Lines and Message Timing, 2026-10-08): from the
     last 60 sent campaigns Klaviyo already returns, so it costs no extra call. Open rate is Klaviyo's. */
  function subjectsCard(list, cur, tz) {
    const rows = list.filter(x => x.recipients >= 100 && x.open_rate != null);
    if (rows.length < 8) return '';
    const avg = arr => { const n = arr.reduce((s, x) => s + x.recipients, 0); return n ? arr.reduce((s, x) => s + x.open_rate * x.recipients, 0) / n : null; };
    const rpr = arr => { const n = arr.reduce((s, x) => s + x.recipients, 0); return n ? arr.reduce((s, x) => s + (x.conversion_value || 0), 0) / n : null; };
    const base = avg(rows);
    const local = x => { try { const d = new Date(x.send_time || x.sent); const f = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'America/Chicago', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(d); return { wd: f.find(p => p.type === 'weekday').value, h: +f.find(p => p.type === 'hour').value % 24 }; } catch { return null; } };
    const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const byWd = WD.map(w => { const g = rows.filter(x => local(x)?.wd === w); return { w, n: g.length, open: avg(g), rpr: rpr(g) }; });
    const SLOT = [['Early morning', 5, 9], ['Morning', 9, 12], ['Midday', 12, 15], ['Afternoon', 15, 18], ['Evening', 18, 22], ['Late', 22, 29]];
    const bySlot = SLOT.map(([l, a, b]) => { const g = rows.filter(x => { const h = local(x)?.h; if (h == null) return false; const hh = h < 5 ? h + 24 : h; return hh >= a && hh < b; }); return { l, n: g.length, open: avg(g), rpr: rpr(g) }; });
    const sub = x => String(x.subject || x.name || '');
    const FEAT = [['Asks a question', x => /\?/.test(sub(x))], ['Has a number', x => /\d/.test(sub(x))], ['Has an emoji', x => /\p{Extended_Pictographic}/u.test(sub(x))], ['Short (under 35 characters)', x => sub(x).length < 35], ['Uses their name', x => /first_name|\{\{/i.test(sub(x))], ['Names a discount', x => /%|off\b|sale|save|deal/i.test(sub(x))]];
    const feats = FEAT.map(([l, f]) => { const yes = rows.filter(f), no = rows.filter(x => !f(x)); return { l, n: yes.length, with: avg(yes), without: avg(no) }; }).filter(x => x.n >= 3 && x.n <= rows.length - 3);
    const bar = (v, mx, label, tip) => `<span class="v2ib"${tipAttr(tip)}><i style="width:${mx && v != null ? Math.max(2, v / mx * 100).toFixed(0) : 0}%;background:var(--c-email)"></i><span>${label}</span></span>`;
    const mxW = Math.max(...byWd.map(x => x.open || 0), 0.01), mxS = Math.max(...bySlot.map(x => x.open || 0), 0.01);
    const bestW = byWd.filter(x => x.n >= 2).sort((p, q) => (q.open || 0) - (p.open || 0))[0], bestS = bySlot.filter(x => x.n >= 2).sort((p, q) => (q.open || 0) - (p.open || 0))[0];
    const top = rows.slice().sort((p, q) => q.open_rate - p.open_rate).slice(0, 5), topR = rows.slice().sort((p, q) => ((q.conversion_value || 0) / q.recipients) - ((p.conversion_value || 0) / p.recipients)).slice(0, 5);
    const subj = x => `<span class="nm" title="${esc(sub(x))}">${esc(sub(x))}</span>`;
    /* 2026-10-09: the conclusion is its own line under the title (it used to sit jammed beside it), the five blocks sit
       on one grid with the same gaps, and a subject opens the email itself. */
    const subjRow = (x, v) => `<tr class="link" data-klmsg="${esc(x.id)}" tabindex="0"><td>${subj(x)}</td><td>${v}</td></tr>`;
    const bestFeat = feats.slice().sort((p, q) => Math.abs(q.with - q.without) - Math.abs(p.with - p.without))[0];
    const lead = `${rows.length} emailed campaigns opened at ${pct(base, 1)} on average.${bestW ? ` <b>${esc(bestW.w)}</b> opens best (${pct(bestW.open, 1)})` : ''}${bestS ? `${bestW ? ', and' : ''} <b>${esc(bestS.l.toLowerCase())}</b> sends beat the rest (${pct(bestS.open, 1)})` : ''}${bestW || bestS ? '.' : ''}${bestFeat ? ` Subjects that ${({ 'Asks a question': 'ask a question', 'Has a number': 'carry a number', 'Has an emoji': 'carry an emoji', 'Short (under 35 characters)': 'run under 35 characters', 'Uses their name': 'use their name', 'Names a discount': 'name a discount' })[bestFeat.l] || esc(bestFeat.l.toLowerCase())} open ${Math.abs((bestFeat.with - bestFeat.without) * 100).toFixed(1)} pt ${bestFeat.with > bestFeat.without ? 'higher' : 'lower'}.` : ''}`;
    return cardL('Subject lines and send times', lead,
      `<div class="lx-subj">
        <div><p class="ds-label">By day sent</p><div class="v2tbl"><table><tbody>${byWd.filter(x => x.n).map(x => `<tr><td>${x.w}</td><td>${bar(x.open, mxW, pct(x.open, 1), `${x.n} campaigns · ${money2(x.rpr, cur)} per recipient`)}</td></tr>`).join('')}</tbody></table></div></div>
        <div><p class="ds-label">By time of day</p><div class="v2tbl"><table><tbody>${bySlot.filter(x => x.n).map(x => `<tr><td>${x.l}</td><td>${bar(x.open, mxS, pct(x.open, 1), `${x.n} campaigns · ${money2(x.rpr, cur)} per recipient`)}</td></tr>`).join('')}</tbody></table></div></div>
        <div><p class="ds-label">What the subject does</p><div class="v2tbl"><table><tbody>${feats.map(f => `<tr><td>${esc(f.l)}</td><td class="${f.with > f.without ? 'good' : 'bad'}"${tipAttr(`${f.n} campaigns with it open at ${pct(f.with, 1)}; the rest at ${pct(f.without, 1)}`)}>${f.with > f.without ? '+' : ''}${((f.with - f.without) * 100).toFixed(1)} pt</td></tr>`).join('') || '<tr><td class="faint">Not enough variety yet.</td></tr>'}</tbody></table></div></div>
        <div class="w2"><p class="ds-label">Best opened</p><div class="v2tbl"><table><tbody>${top.map(x => subjRow(x, pct(x.open_rate, 1))).join('')}</tbody></table></div></div>
        <div class="w2"><p class="ds-label">Most money per recipient</p><div class="v2tbl"><table><tbody>${topR.map(x => subjRow(x, money2((x.conversion_value || 0) / x.recipients, cur))).join('')}</tbody></table></div></div>
      </div>`,
      `send times in the brand’s own time zone`);
  }

  /* =========================================================================================
   * CREATIVE > INSPIRATION: the brand's Atria board and the season boards (read only)
   * ======================================================================================= */
  async function inspo(first) {
    const t = H.RUN(); const a = H.S.accounts.find(x => x.act_id === H.S.act);
    const title = a ? `Inspiration: ${esc(a.name)}` : 'Inspiration';
    if (!a) { $('#main').innerHTML = shell('inspo', title, card('Pick a brand', '', '<p class="v2hint">Each brand has its own board of reference ads in Atria. Pick a brand in the menu.</p>')); return; }
    if (first) $('#main').innerHTML = shell('inspo', title, `<section class="v2card v2sk"><i class="h"></i>${skGal(8)}</section>`);
    let sd; try { sd = await get(`/api/season?act=${encodeURIComponent(a.act_id)}`); } catch (e) { sd = null; }
    if (t !== H.RUN()) return;
    const sa = (sd?.accounts || []).find(x => x.act_id === a.act_id) || {};
    const boards = []; if (sa.swipe_brand) boards.push({ id: sa.swipe_brand.id, name: `${a.name}’s board`, k: 'brand' });
    const seen = new Set(boards.map(b => b.id)); for (const p of sa.phases || []) if (p.swipe && !seen.has(p.swipe.id)) { seen.add(p.swipe.id); boards.push({ id: p.swipe.id, name: p.swipe.name.replace(/^BFCM \/ /, ''), k: 'season' }); }
    if (!boards.length) { $('#main').innerHTML = shell('inspo', title, card('No board yet', '', '<p class="v2hint">Make a board for this brand in Atria and save reference ads into it; they show here for the whole team.</p>')); return; }
    const pick = INSPO.get(a.act_id) || boards[0].id;
    $('#main').innerHTML = shell('inspo', title, `<p class="v2say lead">Reference ads the team saved in Atria. Long-running ads are usually the profitable ones: a signal, not proof.</p>
      <div class="v2jobs">${boards.map(b => `<button type="button" data-board="${esc(b.id)}" class="${b.id === pick ? 'on' : ''}">${esc(b.name)}</button>`).join('')}</div><div id="v2inspo"><section class="v2card v2sk"><i class="h"></i>${skGal(8)}</section></div>`);
    const root = $('#main');
    root.querySelectorAll('[data-board]').forEach(b => b.onclick = () => { INSPO.set(a.act_id, b.dataset.board); inspo(false); });
    let r; try { r = await H.apiAH(`/api/atria/board?board_id=${encodeURIComponent(pick)}&act=${encodeURIComponent(a.act_id)}`); } catch (e) { r = { error: e.message }; }
    if (t !== H.RUN()) return; const host = document.getElementById('v2inspo'); if (!host) return;
    if (r.reason === 'not_connected') { host.innerHTML = card('Atria is not connected', '', '<p class="v2hint">Cole connects it once for the whole team: Studio > Connections > Connect Atria.</p>'); return; }
    if (r.error) { host.innerHTML = /402|credit/i.test(r.error) ? card('Atria is out of credits', '', '<p class="v2hint">Atria charges a credit per board read and the account has run out. Top up in Atria (Settings > Billing) and this fills itself.</p>') : card('Atria did not answer', '', `<p class="v2bad">${esc(r.error)}</p>`); return; }
    const ads = r.ads || [];
    host.innerHTML = ads.length ? `<div class="v2gal">${ads.map((x, i) => `<div class="g"><div class="th"${x.img ? ` style="background-image:url('${esc(x.img)}')"` : ''}>${x.days != null ? `<span class="v2pill ${x.days >= 60 ? 'good' : ''}"${tipAttr(x.days >= 60 ? 'Running 60+ days: the advertiser is likely making money on it.' : 'Still young: no signal yet.')}>${x.days} days</span>` : ''}<em>${esc(x.format || '')}</em></div>
      <div class="b"><b title="${esc(x.advertiser)}">${esc(x.advertiser || 'Unknown advertiser')}</b><span class="v2hint" style="font-size:12px">${esc((x.title || x.body || '').slice(0, 110))}</span>
      <div class="v2links"><a class="v2link" href="${esc(x.url)}" target="_blank" rel="noopener">Open in Atria ↗</a><button type="button" class="v2link" data-like="${i}">Brief one like it</button></div></div></div>`).join('')}</div>`
      : card('This board is empty', '', '<p class="v2hint">Save ads into it in Atria and they show here.</p>');
    host.querySelectorAll('[data-like]').forEach(btn => btn.onclick = () => { const x = ads[+btn.dataset.like]; H.AskUI.ask(`For ${a.name}: draft an Asana brief that borrows the shape of this reference ad, not its brand. Advertiser ${x.advertiser}, ${x.format || 'ad'}, running ${x.days ?? '?'} days, ${x.url}. Say what to keep (the structure, the hook) and how it becomes ours.`); });
  }
  const INSPO = { get: k => { try { return localStorage.getItem('pf_inspo_' + k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem('pf_inspo_' + k, v); } catch {} } };

  /* =========================================================================================
   * EMAIL AND SMS, the 2026-10-09 pass. Cole: "Am I missing stats or charts in Email and SMS? Should campaigns and
   * flows have charts the way revenue does? Should I be able to edit email stuff the same way I can edit ads?"
   * What an agency strategist reads (Klaviyo's own dashboards, Triple Whale's email/SMS view, Polar's Klaviyo
   * connector, Lifetimely and Hyros were the references): revenue by day split campaigns vs flows with the compare
   * period behind it, email vs SMS, revenue per recipient, placed order rate, the engagement and deliverability
   * rates against Klaviyo's averages, list growth, then each campaign's money after it went out and each flow's line.
   * Data: Triple Whale (hub /api/hub/email) for the headline money; Klaviyo (account-health klaviyo.js `daily`,
   * `campaigns`, `flows_report`, `flow`) for everything inside. Writes go through account-health
   * POST /api/klaviyo/write (klaviyowrite.js): preview first, an in-app modal with before -> after, then apply.
   * ======================================================================================= */
  const klGet = (act, what, extra = '') => H.apiAH(`/api/klaviyo?act=${encodeURIComponent(act)}&what=${what}${extra}`);
  const sumK = (rows, k) => rows.reduce((s, r) => s + (+r[k] || 0), 0);
  const klSlice = (days, from, to) => (days || []).filter(r => r.date >= from && r.date <= to);
  /** Period totals and rates from Klaviyo day rows. Rates are per email received. */
  function klRoll(rows) {
    const s = k => sumK(rows, k);
    const rec = s('received'), rev = s('rev_email') + s('rev_sms');
    return { rev, rev_email: s('rev_email'), rev_sms: s('rev_sms'), orders_email: s('orders_email'), orders_sms: s('orders_sms'), received: rec, sms_received: s('sms_received'), sms_clicked: s('sms_clicked'),
      open: rec ? s('opened') / rec : null, click: rec ? s('clicked') / rec : null, unsub: rec ? s('unsub') / rec : null, spam: rec ? s('spam') / rec : null, bounce: rec ? s('bounced') / rec : null,
      por: rec ? s('orders_email') / rec : null, rpr: rec ? s('rev_email') / rec : null, sms_share: rev ? s('rev_sms') / rev : null,
      gained: s('gained'), lost: s('lost'), net: s('gained') - s('lost'), flow: s('rev_flow'), camp: s('rev_campaign') };
  }
  /** Long windows read better by week: 7-day buckets, summed. */
  function klBucket(rows, weekly) {
    if (!weekly) return rows;
    const out = [];
    for (let i = 0; i < rows.length; i += 7) { const g = rows.slice(i, i + 7); const o = { date: g[0].date, days: g.length }; for (const r of g) for (const [k, v] of Object.entries(r)) if (k !== 'date' && typeof v === 'number') o[k] = (o[k] || 0) + v; out.push(o); }
    return out;
  }
  /** What is wrong with sending, in plain words, worst first. */
  function klFlags(c, p, ov, flows) {
    const f = [];
    if (c.spam != null && c.received >= 1000) { if (c.spam > 0.001) f.push(['bad', `Spam complaints ${pct(c.spam, 3)}: over 0.1%, the line where Gmail and Yahoo start sending to spam (0.3% is their hard limit).`]); else if (c.spam > 0.0003) f.push(['warn', `Spam complaints ${pct(c.spam, 3)}: Klaviyo calls under 0.01% healthy. Trim unengaged profiles from campaigns.`]); }
    if (c.bounce != null && c.received >= 1000) { if (c.bounce > 0.02) f.push(['bad', `Bounces ${pct(c.bounce, 2)}: over 2%. Clean the list (suppress hard bounces, check the signup source).`]); else if (c.bounce > 0.01) f.push(['warn', `Bounces ${pct(c.bounce, 2)}: over Klaviyo's 1% line.`]); }
    if (c.unsub != null && c.received >= 1000 && c.unsub > 0.005) f.push([c.unsub > 0.01 ? 'bad' : 'warn', `Unsubscribes ${pct(c.unsub, 2)} per email: over 0.5%, sending too often or to the wrong people.`]);
    if (c.open != null && p && p.open && c.received >= 1000 && c.open < p.open * 0.85) f.push(['warn', `Opens fell to ${pct(c.open, 1)} from ${pct(p.open, 1)} (${cmpLabel()}). Often the first sign of inbox placement slipping.`]);
    if (c.received >= 1000 && c.net < 0) f.push(['warn', `The email list shrank by ${int(-c.net)} (${int(c.gained)} joined, ${int(c.lost)} left).`]);
    for (const x of (flows || []).filter(x => x.status && x.status !== 'live' && (x.revenue || 0) > 0).slice(0, 3)) f.push(['warn', `"${x.name}" is ${x.status} but earned ${kmoney(x.revenue)} in 90 days. Check it was switched off on purpose.`]);
    const live = (ov && ov.live_flows) || [];
    const miss = [['welcome', /welcome/i], ['abandoned cart', /cart/i], ['browse abandonment', /browse/i], ['post purchase', /post.?purchase|thank/i], ['win-back', /win.?back/i]].filter(([, re]) => !live.some(n => re.test(n))).map(([n]) => n);
    if (ov && !ov.error && miss.length) f.push(['warn', `No live flow named for: ${miss.join(', ')}.`]);
    return f;
  }
  /* 2026-10-09: the same status chip as the flows (dot + label), not the old pills. */
  const flagHtml = list => list.length ? `<ul class="kl-flags">${list.map(([t, x]) => `<li><span class="ds-chip lx-chip"><i class="ds-dot ${t}"></i>${t === 'bad' ? 'Fix' : 'Check'}</span><span>${esc(x)}</span></li>`).join('')}</ul>` : '<p class="v2hint"><span class="ds-chip lx-chip"><i class="ds-dot good"></i>OK</span> Nothing off: spam, bounces and unsubscribes are inside Klaviyo\'s healthy ranges.</p>';
  const benchPill = (v, b, lower) => v == null ? '' : `<span class="ds-chip lx-chip"${tipAttr(`Klaviyo average ${pct(b, b < 0.001 ? 3 : b < 0.02 ? 2 : 1)}`)}><i class="ds-dot ${(lower ? v <= b : v >= b) ? 'good' : 'warn'}"></i>${(lower ? v <= b : v >= b) ? 'Better than average' : 'Worse than average'}</span>`;
  const isAttentive = a => a && a.email_tool === 'attentive';
  /* 2026-10-09 (Cole's pass on Email and SMS, Website and Search): a card whose conclusion sits UNDER the title as its
     own line (the v2 `card()` put it beside the title, where long sentences jammed against it). Used by these screens. */
  const cardL = (title, lead, body, cap, cls = '') => `<section class="v2card lx-cl${cls ? ' ' + cls : ''}"><div class="v2h"><h3>${esc(title)}</h3>${cap ? `<span class="cap">${cap}</span>` : ''}</div>${lead ? `<p class="lx-lead">${lead}</p>` : ''}${body}</section>`;
  /* Against Klaviyo's average in words, coloured by the sign (replaces the goal bullets under the email tiles). */
  const vsAvg = (v, b, lower, fmt) => { if (v == null || !b) return ''; const ok = lower ? v <= b : v >= b, r = v / b;
    const txt = r >= 1.1 ? `${r.toFixed(r >= 10 ? 0 : 1)}x the Klaviyo average (${fmt(b)})` : r <= 0.9 ? `${Math.round((1 - r) * 100)}% under the Klaviyo average (${fmt(b)})` : `about the Klaviyo average (${fmt(b)})`;
    return `<span class="lx-vs ${ok ? 'good' : 'warn'}">${txt}</span>`; };
  /* A rate coloured against Klaviyo's average, the average in the tooltip (replaces the "better / worse than avg" pills). */
  const rateCell = (v, b, lower, dp) => v == null ? '–' : `<span class="lx-rt ${(lower ? v <= b : v >= b) ? 'good' : 'warn'}"${tipAttr(`Klaviyo average ${pct(b, dp)}. ${(lower ? v <= b : v >= b) ? 'Better' : 'Worse'} than average.`)}>${pct(v, dp)}</span>`;
  /* THE STATUS CHIP (DESIGN.md: dot + label, one size). A flow's chip is a button when the key can write. */
  const FLOW_ST = { live: ['good', 'Live', 'Sending to everyone who triggers it'], manual: ['warn', 'Manual', 'Built but switched off: nobody new enters'], draft: ['off', 'Draft', 'Unfinished and off'] };
  const stChip = (s, btnFor) => { const [t, l] = FLOW_ST[s] || ['off', String(s || '–').replace(/^./, c => c.toUpperCase())];
    return btnFor ? `<button type="button" class="ds-chip lx-chip" data-flst="${esc(btnFor)}" aria-haspopup="menu" aria-label="Status: ${esc(l)}. Change it"><i class="ds-dot ${t}"></i>${esc(l)}<svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg></button>`
      : `<span class="ds-chip lx-chip"><i class="ds-dot ${t}"></i>${esc(l)}</span>`; };
  const campChip = s => { const k = String(s || '').toLowerCase(); const t = /schedul|queued|sending|adding|preparing/.test(k) ? 'good' : /cancel/.test(k) ? 'bad' : 'off';
    return `<span class="ds-chip lx-chip"><i class="ds-dot ${t}"></i>${esc(k ? k.replace(/^./, c => c.toUpperCase()) : '–')}</span>`; };
  /** The small status menu under a flow's chip: three choices, each with what it means. */
  function statusMenu(btn, cur, onPick) {
    document.querySelectorAll('.lx-stmenu').forEach(m => m.remove());
    const r = btn.getBoundingClientRect(), m = document.createElement('div');
    m.className = 'lx-stmenu'; m.setAttribute('role', 'menu');
    m.innerHTML = Object.entries(FLOW_ST).map(([k, [t, l, d]]) => `<button type="button" role="menuitemradio" aria-checked="${k === cur}" data-v="${k}" class="${k === cur ? 'on' : ''}"><i class="ds-dot ${t}"></i><span><b>${l}</b><small>${d}</small></span></button>`).join('');
    document.body.appendChild(m);
    const left = Math.min(innerWidth - m.offsetWidth - 8, r.left), top = r.bottom + 6 + m.offsetHeight > innerHeight ? r.top - m.offsetHeight - 6 : r.bottom + 6;
    m.style.left = Math.max(8, left) + 'px'; m.style.top = top + 'px';
    const close = () => { m.remove(); document.removeEventListener('pointerdown', out, true); document.removeEventListener('keydown', esc1); };
    const out = e => { if (!m.contains(e.target) && e.target !== btn) close(); };
    const esc1 = e => { if (e.key === 'Escape') { close(); btn.focus(); } };
    setTimeout(() => { document.addEventListener('pointerdown', out, true); document.addEventListener('keydown', esc1); }, 0);
    m.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { close(); if (b.dataset.v !== cur) onPick(b.dataset.v); });
    m.querySelector('.on, button')?.focus();
  }

  /* ---------- WHAT THE MESSAGE LOOKED LIKE (2026-10-09, Cole: "am I supposed to see what these campaigns and flows look
     like?"). Click a sent campaign or a flow message: a sheet with the email itself (Klaviyo's template HTML, rendered,
     in a sandboxed frame with no scripts and no access to Locus; desktop or phone width) or the SMS text, the inbox
     line above it, and its results beside it. Account-health GET /api/klaviyo?what=message (kept 30 days). ---------- */
  const MSG = new Map();
  async function klPreview(a, cur, o) {
    const sms = o.channel === 'sms';
    const ic = n => window.icon ? window.icon(n, { size: 20 }) : '';
    panel.sheet = { lead: `<span class="lx-pv-lead">${ic(sms ? 'message' : 'mail')}</span>`, chip: `<span class="ds-chip">${sms ? 'SMS' : 'Email'}${o.kind === 'flow' ? ' · flow' : ' · campaign'}</span>`,
      actions: o.link ? `<a class="ds-btn" href="${esc(o.link)}" target="_blank" rel="noopener">Open in Klaviyo ${window.icon ? window.icon('external-link', { size: 14 }) : ''}</a>` : '' };
    panel.wide = true;
    const pb = panel(o.name || 'Message', `<div class="lx-pv"><div class="lx-pv-main"><div class="v2sk lx-pv-sk"><i class="r"></i><i class="r"></i><i class="ch"></i></div></div><aside class="lx-pv-side">${o.stats || ''}</aside></div>`);
    const key = `${a.act_id}:${o.kind}:${o.id}`;
    let m = MSG.get(key);
    if (!m) { try { m = await klGet(a.act_id, 'message', `&kind=${o.kind}&id=${encodeURIComponent(o.id)}`); if (!m.error) MSG.set(key, m); } catch (e) { m = { error: e.message }; } }
    const main = pb.querySelector('.lx-pv-main'); if (!main || !document.getElementById('v2panel')?.classList.contains('on')) return;
    if (m.error) { main.innerHTML = `<p class="v2bad">${esc(m.error)}</p>`; return; }
    if (m.channel === 'sms' || (!m.html && m.text && !m.subject)) {
      main.innerHTML = `<div class="lx-sms"><div class="lx-sms-ph"><p class="lx-sms-from">${esc(a.name)}</p><div class="lx-sms-b">${esc(m.text || 'No text came back for this message.').replace(/(https?:\/\/[^\s<]+)/g, '<u>$1</u>')}</div>${m.media_url ? `<img src="${esc(m.media_url)}" alt="" class="lx-sms-img">` : ''}</div></div><p class="v2hint">The text exactly as Klaviyo holds it. Links are shown, not opened.</p>`;
      return;
    }
    const env = `<dl class="lx-env"><dt>From</dt><dd>${esc(m.from_label || '–')}${m.from_email ? ` <span class="faint">&lt;${esc(m.from_email)}&gt;</span>` : ''}</dd><dt>Subject</dt><dd><b>${esc(m.subject || o.subject || '–')}</b></dd>${m.preview ? `<dt>Preview</dt><dd class="faint">${esc(m.preview)}</dd>` : ''}</dl>`;
    if (!m.html) { main.innerHTML = `${env}<p class="v2hint">${esc(m.html_error || 'Klaviyo returned no design for this message.')}</p>${m.text ? `<pre class="lx-pv-txt">${esc(m.text)}</pre>` : ''}`; return; }
    /* Links open in a new tab; nothing in the frame can run (sandbox without scripts or same-origin). */
    const doc = m.html.replace(/<head([^>]*)>/i, '<head$1><base target="_blank">');
    main.innerHTML = `${env}<div class="lx-pv-bar"><div class="ds-seg" role="group" aria-label="Width"><button type="button" class="on" data-pvw="d">Desktop</button><button type="button" data-pvw="m">Phone</button></div><span class="faint">${m.rendered ? 'Personal fields filled with sample values.' : 'Shown as designed.'}${m.template?.name ? ` Template: ${esc(m.template.name)}.` : ''}</span></div>
      <div class="lx-pv-stage"><iframe title="The email as sent" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" loading="lazy"></iframe></div>`;
    const fr = main.querySelector('iframe'); fr.srcdoc = doc;
    main.querySelectorAll('[data-pvw]').forEach(b => b.onclick = () => { main.querySelectorAll('[data-pvw]').forEach(x => x.classList.toggle('on', x === b)); main.querySelector('.lx-pv-stage').classList.toggle('m', b.dataset.pvw === 'm'); });
  }
  /** The results column beside the preview: each number with Klaviyo's average where one exists. */
  function pvStats(x, cur, extra = '') {
    const row = (l, v, sub) => `<div class="lx-kv"><span>${l}</span><b>${v}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
    const sms = x.channel === 'sms', rec = x.recipients, rev = x.conversion_value ?? x.revenue, rpr = x.revenue_per_recipient ?? (rec ? (rev || 0) / rec : null);
    return `<p class="ds-label">Results${x.sent ? `, sent ${esc(day(x.sent))}` : ', last 90 days'}</p>
      ${row('Recipients', int(rec))}${sms ? '' : row('Open', rateCell(x.open_rate, BENCH.open, false, 1))}${row('Click', sms ? pct(x.click_rate, 2) : rateCell(x.click_rate, BENCH.click, false, 2))}
      ${row('Placed order', sms ? pct(x.conversion_rate, 2) : rateCell(x.conversion_rate, BENCH.por, false, 2))}${row('Revenue', kmoney(rev, cur), 'Klaviyo attribution')}${row('Per recipient', sms ? money2(rpr, cur) : `<span class="lx-rt ${rpr >= BENCH.rpr ? 'good' : 'warn'}">${money2(rpr, cur)}</span>`)}
      ${row('Unsubscribe', sms ? pct(x.unsubscribe_rate, 2) : rateCell(x.unsubscribe_rate, BENCH.unsub, true, 2))}${!sms && x.spam_complaint_rate != null ? row('Spam', rateCell(x.spam_complaint_rate, BENCH.spam, true, 3)) : ''}${!sms && x.bounce_rate != null ? row('Bounce', rateCell(x.bounce_rate, BENCH.bounce, true, 2)) : ''}
      ${extra}${sms ? '' : '<p class="v2hint lx-pv-note">Green beats Klaviyo\'s published average; amber is under it. Opens include Apple Mail\'s automatic opens.</p>'}`;
  }

  /** A rate line with Klaviyo's average as a dashed amber rule and the compare period ghosted. Hover reads each point. */
  function rateSpark(rows, prev, f, bench, fmt, label) {
    const w = 300, h = 60, pd = 4;
    const v = rows.map(f), pv = (prev || []).map(f);
    if (v.filter(x => x != null).length < 2) return '<p class="v2hint kl-none">Too few sends in this window to draw a line.</p>';
    const all = v.concat(H.S.cmp !== 'none' ? pv : [], [bench]).filter(x => x != null && isFinite(x));
    const mx = (Math.max(...all) || 1) * 1.15;
    const X = i => pd + i / Math.max(1, v.length - 1) * (w - pd * 2), Y = y => h - pd - (y / mx) * (h - pd * 2);
    const pts = a => a.slice(0, v.length).map((y, i) => y == null || !isFinite(y) ? null : `${X(i).toFixed(1)},${Y(y).toFixed(1)}`).filter(Boolean).join(' ');
    const tips = rows.map((r, i) => `<b>${r.days > 1 ? 'Week of ' : ''}${day(r.date)}</b> · ${esc(label)} ${v[i] == null ? '–' : fmt(v[i])}${pv[i] != null && H.S.cmp !== 'none' ? `<br><span class="faint">${esc(cmpLabel())}: ${fmt(pv[i])}</span>` : ''}<br><span class="faint">Klaviyo average ${fmt(bench)}</span>`);
    return `<svg class="v2spark kl-rate" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" data-spk="${esc(JSON.stringify(tips))}"><line x1="0" x2="${w}" y1="${Y(bench).toFixed(1)}" y2="${Y(bench).toFixed(1)}" stroke="var(--warn)" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>${pv.length > 1 && H.S.cmp !== 'none' ? `<polyline points="${pts(pv)}" fill="none" stroke="var(--v2-cmp)" stroke-width="1.2" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>` : ''}<polyline points="${pts(v)}" fill="none" stroke="var(--brand)" stroke-width="1.9" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
  }
  /** Stacked bars (campaigns, flows) with the compare period's total as a dashed line over them. */
  function emStack(id, rows, prev, series, cur) {
    const w = 1000, h = 210, pl = 48, pr = 10, pt = 10, pb = 24, n = rows.length; if (n < 2) return '';
    const tot = r => series.reduce((s, k) => s + (+r[k.key] || 0), 0);
    const ptot = (prev || []).map(r => r.email != null ? +r.email : tot(r));
    const mx = Math.max(...rows.map(tot), ...(H.S.cmp !== 'none' ? ptot : []), 1) * 1.12;
    const bw = (w - pl - pr) / n, Y = v => pt + (1 - v / mx) * (h - pt - pb);
    let out = [0.5, 1].map(f => `<line x1="${pl}" x2="${w - pr}" y1="${Y(mx * f).toFixed(1)}" y2="${Y(mx * f).toFixed(1)}" stroke="var(--v2-grid)"/><text x="${pl - 6}" y="${(Y(mx * f) + 4).toFixed(1)}" font-size="10" text-anchor="end" fill="var(--muted)">${kmoney(mx * f, cur)}</text>`).join('');
    rows.forEach((r, i) => { let base = 0; series.forEach(sr => { const v = +r[sr.key] || 0; if (v <= 0) return; const y0 = Y(base + v), y1 = Y(base); out += `<rect x="${(pl + i * bw + 1).toFixed(1)}" y="${y0.toFixed(1)}" width="${Math.max(1, bw - 3).toFixed(1)}" height="${Math.max(0, y1 - y0 - 1).toFixed(1)}" rx="2" fill="var(${sr.color})"/>`; base += v; }); });
    if (H.S.cmp !== 'none' && ptot.length > 1) out += `<polyline points="${ptot.slice(0, n).map((v, i) => `${(pl + i * bw + bw / 2).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--v2-cmp)" stroke-width="1.6" stroke-dasharray="5 4"/>`;
    const idx = n <= 10 ? rows.map((_, i) => i) : [...new Set(Array.from({ length: 6 }, (_, k) => Math.round(k * (n - 1) / 5)))];
    out += idx.map(i => `<text x="${(pl + i * bw + bw / 2).toFixed(1)}" y="${h - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${day(rows[i].date)}</text>`).join('');
    return `<div class="v2chart"><svg id="${id}" viewBox="0 0 ${w} ${h}">${out}<rect class="hov" x="0" y="${pt}" width="0" height="${h - pt - pb}" fill="var(--ink)" opacity="0"/></svg><div class="v2tip"></div></div>`;
  }
  function wireEmStack(id, rows, prev, series, cur) {
    const el = document.getElementById(id); if (!el) return;
    const w = 1000, pl = 48, pr = 10, n = rows.length, bw = (w - pl - pr) / n, tip = el.parentNode.querySelector('.v2tip'), hov = el.querySelector('.hov');
    el.onpointermove = el.onpointerdown = e => {
      const r = el.getBoundingClientRect(); const i = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width * w - pl) / bw)));
      hov.setAttribute('x', pl + i * bw); hov.setAttribute('width', bw); hov.setAttribute('opacity', '.06');
      const row = rows[i], tot = series.reduce((s, k) => s + (+row[k.key] || 0), 0), pr0 = prev && prev[i];
      tip.style.display = 'block';
      tip.innerHTML = `<b>${day(row.date)}</b> · ${kmoney(tot, cur)}<br>${series.map(sr => `<span class="sw" style="background:var(${sr.color})"></span>${esc(sr.label)} ${kmoney(+row[sr.key] || 0, cur)}`).join('<br>')}${pr0 && H.S.cmp !== 'none' ? `<br><span class="faint">${esc(cmpLabel())}: ${kmoney(pr0.email ?? ((+pr0.campaigns || 0) + (+pr0.flows || 0)), cur)} on ${day(pr0.date)}</span>` : ''}`;
      const tw = tip.offsetWidth; let left = (e.clientX - r.left) + 14; if (left + tw > r.width) left = (e.clientX - r.left) - tw - 14; tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px';
    };
    el.onpointerleave = () => { tip.style.display = 'none'; hov.setAttribute('opacity', '0'); };
  }
  /** Subscribers gained (up) and lost (down) per day or week, the net as a line. */
  function growthChart(id, rows, gk = 'gained', lk = 'lost') {
    const w = 560, h = 200, pl = 40, pr = 10, pt = 10, pb = 24, n = rows.length; if (n < 2) return '';
    const mx = Math.max(...rows.map(r => Math.max(+r[gk] || 0, +r[lk] || 0)), 1) * 1.1;
    const mid = pt + (h - pt - pb) / 2, sc = (h - pt - pb) / 2 / mx, bw = (w - pl - pr) / n;
    let out = `<line x1="${pl}" x2="${w - pr}" y1="${mid}" y2="${mid}" stroke="var(--line-strong)"/><text x="${pl - 6}" y="${pt + 8}" font-size="10" text-anchor="end" fill="var(--muted)">+${int(mx)}</text><text x="${pl - 6}" y="${h - pb}" font-size="10" text-anchor="end" fill="var(--muted)">-${int(mx)}</text>`;
    rows.forEach((r, i) => { const g = +r[gk] || 0, l = +r[lk] || 0, x = pl + i * bw + 1, bwi = Math.max(1, bw - 3);
      if (g) out += `<rect x="${x.toFixed(1)}" y="${(mid - g * sc).toFixed(1)}" width="${bwi.toFixed(1)}" height="${(g * sc).toFixed(1)}" rx="2" fill="var(--good)" opacity=".85"/>`;
      if (l) out += `<rect x="${x.toFixed(1)}" y="${mid.toFixed(1)}" width="${bwi.toFixed(1)}" height="${(l * sc).toFixed(1)}" rx="2" fill="var(--bad)" opacity=".75"/>`; });
    out += `<polyline points="${rows.map((r, i) => `${(pl + i * bw + bw / 2).toFixed(1)},${(mid - ((+r[gk] || 0) - (+r[lk] || 0)) * sc).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--ink-2)" stroke-width="1.6"/>`;
    const idx = n <= 10 ? rows.map((_, i) => i) : [...new Set(Array.from({ length: 6 }, (_, k) => Math.round(k * (n - 1) / 5)))];
    out += idx.map(i => `<text x="${(pl + i * bw + bw / 2).toFixed(1)}" y="${h - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${day(rows[i].date)}</text>`).join('');
    return `<div class="v2chart"><svg id="${id}" viewBox="0 0 ${w} ${h}">${out}<rect class="hov" x="0" y="${pt}" width="0" height="${h - pt - pb}" fill="var(--ink)" opacity="0"/></svg><div class="v2tip"></div></div>`;
  }
  function wireGrowth(id, rows, gk = 'gained', lk = 'lost') {
    const el = document.getElementById(id); if (!el) return;
    const w = 560, pl = 40, pr = 10, n = rows.length, bw = (w - pl - pr) / n, tip = el.parentNode.querySelector('.v2tip'), hov = el.querySelector('.hov');
    el.onpointermove = el.onpointerdown = e => {
      const r = el.getBoundingClientRect(); const i = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width * w - pl) / bw)));
      hov.setAttribute('x', pl + i * bw); hov.setAttribute('width', bw); hov.setAttribute('opacity', '.06');
      const row = rows[i], g = +row[gk] || 0, l = +row[lk] || 0;
      tip.style.display = 'block'; tip.innerHTML = `<b>${row.days > 1 ? 'Week of ' : ''}${day(row.date)}</b><br><span class="sw" style="background:var(--good)"></span>Joined ${int(g)}<br><span class="sw" style="background:var(--bad)"></span>Left ${int(l)}<br>Net ${g - l >= 0 ? '+' : ''}${int(g - l)}`;
      const tw = tip.offsetWidth; let left = (e.clientX - r.left) + 14; if (left + tw > r.width) left = (e.clientX - r.left) - tw - 14; tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px';
    };
    el.onpointerleave = () => { tip.style.display = 'none'; hov.setAttribute('opacity', '0'); };
  }
  /* REVENUE AFTER SEND (2026-10-09, Cole: the 14 tiny bars were "not good visualizations"). What a strategist reads
     here is HOW FAST the money came in, so the cell is the running total over the 14 days after the send (day 0 = send
     day) as one sparkline, plus the day by which 80% had landed. Hover reads day N: that day's revenue and the total
     so far. The money itself is in the Revenue column; this is its shape. */
  function afterSeries(x, D) {
    const series = D && (D.by_message[x.message_id] || D.by_message[x.id]); if (!series || !x.sent) return '–';
    const i0 = Math.round((Date.parse(x.sent) - Date.parse(D.attr_from)) / 864e5); if (i0 < 0) return 'older';
    const v = series.slice(i0, i0 + 14); if (!v.length) return '–';
    const tot = v.reduce((s, y) => s + y, 0); if (!tot) return 'none';
    let c = 0, d80 = null; const cum = v.map((y, i) => { c += y; if (d80 == null && c >= tot * 0.8) d80 = i; return c; });
    return { v, cum, tot, d80 };
  }
  function afterSend(x, D, w = 88, h = 22) {
    const s = afterSeries(x, D); if (typeof s === 'string') return `<span class="faint">${s}</span>`;
    const tips = s.v.map((y, i) => `<b>Day ${i}${i === 0 ? ', the send day' : ''}</b> · ${kmoney(y)}<br><span class="faint">${kmoney(s.cum[i])} so far of ${kmoney(s.tot)}</span>`);
    if (s.v.length < 3) return `<span class="faint"${tipAttr(tips.join('<br>'))}>${kmoney(s.tot)} so far, just sent</span>`;
    return `<span class="lx-aft">${spark(s.cum, null, w, h, tips)}<em>80% by day ${s.d80}</em></span>`;
  }
  /** A flow's revenue per day over the window (Klaviyo attribution). */
  function flowSpark(id, D, from, to) {
    const s = D && D.by_flow[id]; if (!s) return '<span class="faint">–</span>';
    const i0 = Math.max(0, Math.round((Date.parse(from) - Date.parse(D.attr_from)) / 864e5)), i1 = Math.round((Date.parse(to) - Date.parse(D.attr_from)) / 864e5);
    const v = s.slice(i0, i1 + 1); if (v.length < 2) return '<span class="faint">–</span>';
    const start = new Date(Date.parse(D.attr_from) + i0 * 864e5);
    const tips = v.map((y, i) => { const d = new Date(start.getTime() + i * 864e5).toISOString().slice(0, 10); return `<b>${day(d)}</b> · ${kmoney(y)}`; });
    return `<span class="kl-fspark">${spark(v, null, 120, 24, tips)}</span>`;
  }

  /* ---------- writes: preview, an in-app modal with before -> after, confirm, done ---------- */
  function klModal(title, html, ok, onOk, o = {}) {
    const w = document.createElement('div'); w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal kl-m${o.wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h3>${esc(title)}</h3><div class="kl-mb">${html}</div><p class="kl-msg" hidden></p>
      <div class="kl-ma"><button type="button" class="btn" data-m="no">${ok ? 'Cancel' : 'Close'}</button>${ok ? `<button type="button" class="btn primary${o.danger ? ' kl-danger' : ''}" data-m="yes">${esc(ok)}</button>` : ''}</div></div>`;
    document.body.appendChild(w);
    const k = e => { if (e.key === 'Escape') close(); };
    const close = () => { w.remove(); document.removeEventListener('keydown', k); };
    document.addEventListener('keydown', k);
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    w.querySelector('[data-m="no"]').onclick = close;
    const msg = (t, bad) => { const m = w.querySelector('.kl-msg'); m.hidden = !t; m.textContent = t || ''; m.className = 'kl-msg' + (bad ? ' bad' : ''); };
    const yes = w.querySelector('[data-m="yes"]');
    if (yes) yes.onclick = async () => { yes.disabled = true; try { await onOk({ w, close, msg }); } catch (e) { msg(e.message, true); } yes.disabled = false; };
    return { w, close, msg };
  }
  const OKWORD = { flow_status: 'Change it in Klaviyo', campaign_draft: 'Create the draft', campaign_schedule: 'Schedule it', campaign_unschedule: 'Unschedule it', campaign_cancel: 'Cancel the send', campaign_duplicate: 'Make the copy' };
  const BA_LABEL = { status: 'Status', send_time: 'Sends', name: 'Name', to: 'To', not_to: 'Not to', subject: 'Subject', preview: 'Preview text', from: 'From', template: 'Content' };
  function beforeAfter(b, a, tz) {
    const fmt = (k, v) => v == null ? '–' : Array.isArray(v) ? v.join(', ') : k === 'send_time' ? new Date(v).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : String(v);
    const keys = [...new Set([...Object.keys(b || {}), ...Object.keys(a || {})])];
    if (!keys.length) return '';
    return `<table class="kl-ba"><thead><tr><th></th>${b ? '<th>Now</th><th></th>' : ''}<th>${b ? 'After' : 'Will be'}</th></tr></thead><tbody>${keys.map(k => `<tr><td>${esc(BA_LABEL[k] || k)}</td>${b ? `<td class="was">${esc(fmt(k, b[k]))}</td><td class="arr">→</td>` : ''}<td class="is">${esc(fmt(k, a && a[k]))}</td></tr>`).join('')}</tbody></table>`;
  }
  async function klWrite(a, op, input, done) {
    const post = extra => H.apiAH('/api/klaviyo/write', { method: 'POST', body: JSON.stringify({ act: a.act_id, op, input, ...extra }) });
    const m0 = klModal('Checking Klaviyo', '<p class="v2hint">Reading what is there now, so you see the exact change before anything is written.</p>', null);
    let pv; try { pv = await post({}); } catch (e) { m0.close(); klModal('Klaviyo cannot do this yet', `<p class="kl-err">${esc(e.message)}</p>`, null); return; }
    m0.close();
    klModal(pv.summary, `${beforeAfter(pv.before, pv.after)}<p class="kl-detail">${esc(pv.detail || '').replace(/\n/g, '<br>')}</p><p class="v2hint">Written to ${esc(a.name)}'s Klaviyo and logged in the Change Log with your name.</p>`, OKWORD[op] || 'Confirm', async ({ close, msg }) => {
      msg('Writing to Klaviyo…');
      const r = await post({ confirm: true, expect: pv.summary });
      close();
      klModal('Done', `<p>${esc(r.note || 'Done.')}</p>${r.link ? `<p><a class="v2link" href="${esc(r.link)}" target="_blank" rel="noopener">Open it in Klaviyo ›</a></p>` : ''}`, null);
      if (done) done(r);
    }, { danger: op === 'campaign_cancel' });
  }
  /* The new-draft form: everything Klaviyo needs for a draft, labelled, with the account's sender filled in. */
  async function klNewDraft(a, done, from) {
    const m = klModal('New draft campaign', '<p class="v2hint">Reading the lists, segments and templates…</p>', null, null, { wide: true });
    let au, tp;
    try { [au, tp] = await Promise.all([klGet(a.act_id, 'audiences'), klGet(a.act_id, 'templates').catch(e => ({ error: e.message }))]); }
    catch (e) { m.w.querySelector('.kl-mb').innerHTML = `<p class="kl-err">${esc(e.message)}</p>`; return; }
    m.close();
    const aud = [...(au.lists || []).map(x => ({ ...x, kind: 'list' })), ...(au.segments || []).map(x => ({ ...x, kind: 'segment' }))];
    const pickList = (name, rows, multi) => `<div class="kl-pick" data-pick="${name}"><input type="search" placeholder="Search ${rows.length} ${name === 'tpl' ? 'templates' : 'lists and segments'}" aria-label="Search"><div class="kl-opts">${rows.map(x => `<label data-n="${esc(String(x.name || '').toLowerCase())}"><input type="${multi ? 'checkbox' : 'radio'}" name="${name}" value="${esc(x.id)}"><span>${esc(x.name)}</span><em>${esc(x.kind || x.editor || x.updated || '')}</em></label>`).join('')}</div></div>`;
    const f = from || {};
    const w = klModal('New draft campaign', `<div class="kl-form">
      <label class="kl-f"><b>Name</b><span>What the team sees in Klaviyo. Never shown to customers.</span><input name="name" value="${esc(f.name || '')}" placeholder="e.g. Burgundy drop, launch day"></label>
      <div class="kl-f"><b>Send to</b><span>One or more lists or segments. Nothing sends now: the draft waits until someone schedules it.</span>${pickList('to', aud, true)}</div>
      <div class="kl-f"><b>Leave out</b><span>Optional: people in these never get it (for example recent buyers or unengaged).</span>${pickList('not', aud, true)}</div>
      <label class="kl-f"><b>Subject line</b><span>What shows in the inbox.</span><input name="subject" value="${esc(f.subject || '')}" maxlength="200"></label>
      <label class="kl-f"><b>Preview text</b><span>The grey line after the subject.</span><input name="preview" value="${esc(f.preview || '')}" maxlength="200"></label>
      <div class="kl-row"><label class="kl-f"><b>From name</b><input name="from_label" value="${esc(au.from_label || '')}"></label><label class="kl-f"><b>From email</b><input name="from_email" value="${esc(au.from_email || '')}"></label></div>
      <div class="kl-f"><b>Content</b><span>${tp.error ? `Templates could not be read: ${esc(tp.error)}` : 'Start from an existing template, or leave empty and design it in Klaviyo.'}</span>${tp.error ? '' : pickList('tpl', [{ id: '', name: 'No template (design it in Klaviyo)' }, ...(tp.templates || [])], false)}</div>
    </div>`, 'Review the draft', async ({ w: el, close, msg }) => {
      const val = n => (el.querySelector(`[name="${n}"]`)?.value || '').trim();
      const picked = n => [...el.querySelectorAll(`[data-pick="${n}"] input[name="${n}"]:checked`)].map(x => x.value).filter(Boolean);
      const input = { name: val('name'), subject: val('subject'), preview: val('preview'), from_label: val('from_label'), from_email: val('from_email'), audiences: picked('to'), exclude: picked('not'), template: picked('tpl')[0] || undefined };
      if (!input.name || !input.subject || !input.audiences.length) { msg('Name, subject and at least one list or segment are needed.', true); return; }
      close(); klWrite(a, 'campaign_draft', input, done);
    }, { wide: true });
    w.w.querySelectorAll('.kl-pick').forEach(p => { const q = p.querySelector('input[type=search]'); q.oninput = () => { const s = q.value.trim().toLowerCase(); p.querySelectorAll('label').forEach(l => { l.hidden = !!s && !l.dataset.n.includes(s); }); }; });
    const first = w.w.querySelector('[data-pick="tpl"] input'); if (first) first.checked = true;
    setTimeout(() => w.w.querySelector('[name="name"]')?.focus(), 30);
  }
  function klSchedule(a, c, done) {
    const t = new Date(Date.now() + 864e5); t.setHours(9, 0, 0, 0);
    const local = new Date(t.getTime() - t.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
    const zone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'your time zone'; } })();
    klModal(`Schedule "${c.name}"`, `<div class="kl-form"><label class="kl-f"><b>Send at</b><span>In your time zone (${esc(zone)}). At least 15 minutes from now: Locus never sends straight away.</span><input type="datetime-local" name="at" value="${local}"></label></div>`, 'Review', ({ w, close, msg }) => {
      const v = w.querySelector('[name="at"]').value; const d = v ? new Date(v) : null;
      if (!d || isNaN(d)) { msg('Pick a date and time.', true); return; }
      close(); klWrite(a, 'campaign_schedule', { campaign: c.id, at: d.toISOString() }, done);
    });
  }

  /* ---------- all brands: the board ---------- */
  async function emailBoard(bs, t) {
    const host = document.getElementById('v2klall'); if (!host) return;
    host.innerHTML = cardL('Klaviyo across every brand', '<span class="v2hint">Reading each brand’s Klaviyo…</span>', skCard(6).replace('<section class="v2card v2sk"><i class="h"></i>', '<div class="v2sk">').replace(/<\/section>$/, '</div>'));
    const W = win();
    const CORE = { welcome: /welcome/i, 'abandoned cart': /cart/i, checkout: /checkout/i, browse: /browse/i, 'post purchase': /post.?purchase|thank/i, winback: /win.?back/i };
    const acct = id => H.S.accounts.find(x => x.act_id === id) || {};
    const rows = await Promise.all(bs.map(async b => {
      if (isAttentive(acct(b.act_id))) { const at = await klGet(b.act_id, 'attentive', `&from=${W.from}&to=${W.to}`).catch(() => null); return { b, attentive: true, at }; }
      const [ov, fl, dl] = await Promise.all(['overview', 'flows_report', 'daily'].map(w => klGet(b.act_id, w).catch(e => ({ error: e.message }))));
      if (!ov || ov.error) return /not connected/i.test(ov?.error || '') ? { b, off: true } : { b, failed: true, err: ov?.error || 'no answer' };
      const live = ov.live_flows || []; const missing = Object.keys(CORE).filter(k => !live.some(f => CORE[k].test(f)));
      const flows = (fl && fl.flows) || [];
      const cur = dl && dl.days ? klRoll(klSlice(dl.days, W.from, W.to)) : null, prev = dl && dl.days && W.pf ? klRoll(klSlice(dl.days, W.pf, W.pt)) : null;
      const top = flows.slice().sort((x, y) => (y.revenue || 0) - (x.revenue || 0))[0];
      return { b, live: live.length, missing, cur, prev, top, flags: cur ? klFlags(cur, prev, ov, flows) : [], dlErr: dl && dl.error };
    }));
    if (t !== H.RUN()) return;
    const on = rows.filter(r => !r.off && !r.failed && !r.attentive), off = rows.filter(r => r.off && !/golf sock/i.test(r.b.name)), failed = rows.filter(r => r.failed), att = rows.filter(r => r.attentive);   // The Golf Sock is a paused test account: never flagged
    const mx = Math.max(...on.map(r => r.cur ? r.cur.rev : 0), 1);
    const gaps = on.filter(r => r.missing.length), bad = on.filter(r => r.flags.some(f => f[0] === 'bad'));
    const cell = (v, b, lower, d) => { if (v == null) return '<td class="faint">–</td>'; const ok = lower ? v <= b : v >= b; return `<td class="${ok ? 'good' : 'warn'}"${tipAttr(`Klaviyo average ${pct(b, d)}`)}>${pct(v, d)}</td>`; };
    host.innerHTML = cardL('Klaviyo across every brand', `${on.length} brand${on.length === 1 ? '' : 's'} connected.${bad.length ? ` ${bad.map(r => esc(r.b.name)).join(', ')} need${bad.length === 1 ? 's' : ''} a sending fix.` : ''}${gaps.length ? ` ${gaps.length} ${gaps.length === 1 ? 'is' : 'are'} missing a core flow.` : ' Every connected brand runs its core flows.'}`,
      `<div class="v2tbl wide"><table class="kl-board"><thead><tr><th>Brand</th><th>Klaviyo revenue</th><th>Flows</th><th>Campaigns</th><th>SMS share</th><th>Per recipient</th><th>Placed order</th><th>Open</th><th>Click</th><th>Unsub</th><th>Spam</th><th>Bounce</th><th>List growth</th><th>Live flows</th><th>Missing core flows</th><th>Needs a look</th></tr></thead><tbody>
      ${on.sort((x, y) => ((y.cur || {}).rev || 0) - ((x.cur || {}).rev || 0)).map(r => { const c = r.cur || {}, p = r.prev || {}, cu = r.b.currency; return `<tr data-act="${esc(r.b.act_id)}" tabindex="0" class="link"><td><b>${esc(r.b.name)}</b>${r.top && r.top.revenue ? `<span class="sub" title="${esc(r.top.name)}">best flow: ${esc(String(r.top.name).slice(0, 28))}</span>` : ''}</td>
        <td>${r.cur ? `${ib(c.rev, mx, '--c-email', kmoney(c.rev, cu), `Email ${kmoney(c.rev_email, cu)} · SMS ${kmoney(c.rev_sms, cu)}`)} ${delta(c.rev, p.rev)}` : `<span class="faint"${tipAttr(esc(r.dlErr || ''))}>not read</span>`}</td><td>${kmoney(c.flow, cu)}</td><td>${kmoney(c.camp, cu)}</td><td>${pct(c.sms_share, 0)}</td>
        <td>${money2(c.rpr, cu)}</td>${cell(c.por, BENCH.por, false, 2)}${cell(c.open, BENCH.open, false, 1)}${cell(c.click, BENCH.click, false, 2)}${cell(c.unsub, BENCH.unsub, true, 2)}${cell(c.spam, BENCH.spam, true, 3)}${cell(c.bounce, BENCH.bounce, true, 2)}
        <td class="${c.net == null ? '' : c.net >= 0 ? 'good' : 'bad'}"${tipAttr(`${int(c.gained)} joined, ${int(c.lost)} left`)}>${c.net == null ? '–' : `${c.net >= 0 ? '+' : ''}${int(c.net)}`}</td><td>${r.live}</td>
        <td>${r.missing.length ? r.missing.map(m => `<span class="v2pill warn">${esc(m)}</span>`).join(' ') : '<span class="v2pill good">none</span>'}</td>
        <td>${r.flags.length ? `<span class="v2pill ${r.flags.some(f => f[0] === 'bad') ? 'bad' : 'warn'}"${tipAttr(r.flags.map(f => esc(f[1])).join('<br>'))}>${r.flags.length} ${r.flags.length === 1 ? 'thing' : 'things'}</span>` : '<span class="v2pill good">ok</span>'}</td></tr>`; }).join('')}
      </tbody></table></div>${att.length ? `<p class="v2hint" style="margin-top:10px">${att.map(r => `<b>${esc(r.b.name)}</b> sends with Attentive, which is not connected directly: Triple Whale credits ${kmoney(r.at?.revenue, r.b.currency)} from ${int(r.at?.orders)} orders to Attentive links in this window.`).join(' ')}</p>` : ''}${off.length ? `<p class="v2hint" style="margin-top:10px">Not connected to Klaviyo directly: ${esc(off.map(r => r.b.name).join(', '))}. Brand settings > Integrations > paste each brand’s private key.</p>` : ''}${failed.length ? `<p class="v2hint" style="margin-top:6px">Klaviyo did not answer for ${esc(failed.map(r => r.b.name).join(', '))} (it limits how often reports can be read). <button type="button" class="v2link" data-klretry="1">Try again ›</button></p>` : ''}`,
      `Klaviyo’s own attribution, ${esc(day(W.from))} to ${esc(day(W.to))} · rates per email received, against Klaviyo’s averages`);
    wireRows(host, 'email');
    const rb = host.querySelector('[data-klretry]'); if (rb) rb.onclick = () => emailBoard(bs, H.RUN());
  }

  /* ---------- one brand ---------- */
  async function email(first) {
    const t = H.RUN(); const one = H.S.act !== 'all'; const a = H.S.accounts.find(x => x.act_id === H.S.act);
    const title = one ? `Email and SMS: ${esc(a?.name || '')}` : 'Email and SMS';
    if (first) $('#main').innerHTML = shell('email', title, skPage({ tiles: 4 }));
    const W = win();
    let d, dp = null;
    try { [d, dp] = await Promise.all([get(`/api/hub/email?act=${encodeURIComponent(H.S.act)}&${H.rangeQ()}`), one && W.pf ? get(`/api/hub/email?act=${encodeURIComponent(H.S.act)}&from=${W.pf}&to=${W.pt}&cmp=none`).catch(() => null) : null]); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('email', title, `<div class="v2card"><p class="v2bad">${esc(e.message)}</p></div>`); return; }
    if (t !== H.RUN()) return;
    const bs = d.brands; const cur = oneCur(bs);
    if (!one) {
      const live = bs.filter(b => b.cur.email); const mx = Math.max(...live.map(b => b.cur.email), 1);
      const tot = k => live.reduce((s, b) => s + (b.cur[k] || 0), 0), ptot = k => live.reduce((s, b) => s + ((b.prev || {})[k] || 0), 0);
      const days = cur ? mergeDays(bs.map(b => b.series), ['email', 'campaigns', 'flows']) : [];
      const body = `${cur ? `<div class="v2tiles">${[tile({ compact: true, label: 'Email and SMS revenue', src: 'KLAVIYO', value: kmoney(tot('email'), cur), delta: delta(tot('email'), ptot('email')), spark: tspark(days, null, 'email', v => kmoney(v, cur), 'email and SMS') }), tile({ compact: true, label: 'Campaigns', value: kmoney(tot('campaigns'), cur), delta: delta(tot('campaigns'), ptot('campaigns')), spark: tspark(days, null, 'campaigns', v => kmoney(v, cur), 'campaigns') }), tile({ compact: true, label: 'Flows', value: kmoney(tot('flows'), cur), delta: delta(tot('flows'), ptot('flows')), spark: tspark(days, null, 'flows', v => kmoney(v, cur), 'flows') }), tile({ compact: true, label: 'Brands with email revenue', value: `${live.length} of ${bs.length}` })].join('')}</div>` : ''}
        ${cardL('Each brand', `Brands with no Klaviyo revenue in Triple Whale: ${esc(bs.filter(b => !b.cur.email).map(b => b.name).join(', ') || 'none')}.`, `<div class="v2tbl"><table><thead><tr><th>Brand</th><th>Email revenue</th><th>Line</th><th>Share of revenue</th><th>Campaigns</th><th>Flows</th><th>Flows share</th></tr></thead><tbody>${live.sort((x, y) => y.cur.email - x.cur.email).map(b => { const x = b.cur, p = b.prev || {}; return `<tr data-act="${esc(b.act_id)}" tabindex="0" class="link"><td><b>${esc(b.name)}</b></td><td>${ib(x.email, mx, '--c-email', kmoney(x.email, b.currency))} ${delta(x.email, p.email)}</td><td class="kl-linecell">${spark((b.series || []).map(r => r.email), null, 120, 24)}</td><td>${pct(x.share, 0)}</td><td>${kmoney(x.campaigns, b.currency)}</td><td>${kmoney(x.flows, b.currency)}</td><td>${x.email ? pct(x.flows / x.email, 0) : '–'}</td></tr>`; }).join('')}</tbody></table></div>`, 'Triple Whale carries Klaviyo’s attributed revenue')}`;
      $('#main').innerHTML = shell('email', title, body + '<div id="v2klall" class="lx-stack"></div>'); wireRows($('#main'), 'email');
      emailBoard(bs, t); return;
    }
    const b = bs[0], c = b.cur, p = b.prev || {}, rows = b.series || [], prows = (dp && dp.brands && dp.brands[0] && dp.brands[0].series) || null;
    const SER = [{ key: 'flows', label: 'Flows', color: '--c-email' }, { key: 'campaigns', label: 'Campaigns', color: '--brand' }];
    const body0 = `<div class="v2tiles">${[
        tile({ compact: true, label: 'Email and SMS revenue', src: 'KLAVIYO', value: kmoney(c.email, cur), delta: delta(c.email, p.email), spark: tspark(rows, prows, 'email', v => kmoney(v, cur), 'email and SMS') }),
        tile({ compact: true, label: 'Share of store revenue', value: pct(c.share, 0), delta: delta(c.share, p.share, false, true), sub: c.share == null ? '' : `<span class="lx-vs ${c.share >= 0.25 ? 'good' : 'warn'}">${c.share >= 0.25 ? 'In' : 'Under'} the healthy range (25 to 35%)</span>` }),
        tile({ compact: true, label: 'Campaigns', value: kmoney(c.campaigns, cur), delta: delta(c.campaigns, p.campaigns), sub: c.email ? `${pct(c.campaigns / c.email, 0)} of email` : '', spark: tspark(rows, prows, 'campaigns', v => kmoney(v, cur), 'campaigns') }),
        tile({ compact: true, label: 'Flows', value: kmoney(c.flows, cur), delta: delta(c.flows, p.flows), sub: c.email ? `${pct(c.flows / c.email, 0)} of email` : '', spark: tspark(rows, prows, 'flows', v => kmoney(v, cur), 'flows') })].join('')}</div>
      ${rows.length > 1 ? cardL('Email and SMS revenue by day', `${kmoney(c.email, cur)} in this window${p.email ? `, ${c.email >= p.email ? 'up' : 'down'} from ${kmoney(p.email, cur)}` : ''}. Flows are the base; campaigns are the spikes.`, legend([{ color: '--c-email', label: 'Flows' }, { color: '--brand', label: 'Campaigns' }, ...(H.S.cmp !== 'none' && prows ? [{ dash: true, label: `Total, ${cmpLabel()}` }] : [])]) + emStack('v2em', rows, prows, SER, cur), 'Triple Whale') : ''}
      <div id="v2kl" class="lx-stack"></div>`;
    $('#main').innerHTML = shell('email', title, body0 + foot(isAttentive(a) ? 'Revenue above is Klaviyo’s as Triple Whale carries it; this brand sends with Attentive, read below through Triple Whale.' : 'Headline revenue is Klaviyo’s placed-order attribution as Triple Whale carries it. Everything below is read from Klaviyo itself with the brand’s own key: day-by-day lines by event date (kept 6 hours), campaign and flow results for the last 90 days. Benchmarks are Klaviyo’s published averages.'));
    if (rows.length > 1) wireEmStack('v2em', rows, prows, SER, cur);
    /* THE KLAVIYO PART LOADS ON ITS OWN (2026-10-09, Cole: "Klaviyo felt slow and sometimes did not load"). The rest of
       the screen is already painted; the cards show their shape in shimmer while Klaviyo answers, and an error with Try
       again if it does not. Not awaited, so the page is never held dimmed behind a slow Klaviyo read. */
    if (isAttentive(a)) attentiveCards(a, cur, t, W); else klaviyoCards(a, cur, t);
  }
  async function attentiveCards(a, cur, t, W) {
    const host = document.getElementById('v2kl'); if (!host) return;
    host.innerHTML = skCard(0, true);
    const at = await klGet(a.act_id, 'attentive', `&from=${W.from}&to=${W.to}`).catch(e => ({ error: e.message }));
    if (t !== H.RUN() || !document.getElementById('v2kl')) return;
    const days = (at.days || []).map(x => ({ date: x.date, v: x.revenue, n: x.orders }));
    host.innerHTML = card(`Attentive, as Triple Whale sees it`, at.error ? esc(at.error) : `${kmoney(at.revenue, cur)} from ${int(at.orders)} orders credited to Attentive links (last platform click).`,
      `${days.length > 1 ? lineChart('v2att', days, { cur, h: 200 }) : '<p class="v2hint">No orders credited to Attentive links in this window.</p>'}
      <div class="v2note" style="margin-top:12px"><span class="v2pill warn">not connected</span> ${esc(a.name)} sends with Attentive, which is not connected to Locus directly. Sends, opens, journeys, list size and editing need Attentive’s beta API or its nightly data files; neither is built. Until then this card and the revenue above (Triple Whale) are what Locus can see.</div>`, 'Triple Whale');
    if (days.length > 1) wireLine('v2att', days, { tip: r => `<b>${day(r.date)}</b> · ${kmoney(r.v, cur)} · ${int(r.n)} orders` });
  }
  /* The campaigns table uses the Ads tables' own TBL helper (sort on a header, the Columns menu, saved per person as
     pf_tbl_kl-camps), so it behaves exactly like Ads > Campaigns. */
  const KL_DEFAULT = ['sent', 'channel', 'recipients', 'open', 'click', 'por', 'rev', 'rpr', 'unsub', 'after'];
  const KLS = { all: false };
  const FLOW_OPEN = new Set();
  async function klaviyoCards(a, cur, t) {
    const host0 = document.getElementById('v2kl'); if (!host0) return;
    host0.innerHTML = `${skTiles(4)}${skCard(0, true)}<div class="v2two">${skCard(6)}${skCard(6)}</div>${skCard(8)}<p class="v2hint v2klwait">Reading Klaviyo… The first read of a brand can take 20 seconds; after that it is kept for 6 hours.</p>`;
    let ov, camps, flows, dly, can;
    const k = what => klGet(a.act_id, what);
    try { [ov, camps, flows, dly, can] = await Promise.all([k('overview'), k('campaigns').catch(() => null), k('flows_report').catch(() => null), k('daily').catch(e => ({ error: e.message })), k('can').catch(() => null)]); } catch (e) { ov = { error: e.message, failed: true }; }
    if (t !== H.RUN()) return; const host = document.getElementById('v2kl'); if (!host) return;
    const notConnected = ov && ov.error && /not connected/i.test(ov.error);
    if (!ov || ov.error) {
      host.innerHTML = notConnected ? card(`Klaviyo is not connected for ${esc(a.name)}`, '', `<p class="v2hint">${esc(ov.error)}</p><button type="button" class="v2btn" data-go="settings">Open Integrations</button>`)
        : card('Klaviyo did not answer', '', `<p class="v2bad">${esc(ov?.error || 'No answer came back.')}</p><p class="v2hint">The numbers above are from Triple Whale and are not affected. Klaviyo limits how often its reports can be read; trying again in a minute usually works.</p><button type="button" class="v2btn" data-klretry="1">Try again</button>`);
      wireGo(host); const rb = host.querySelector('[data-klretry]'); if (rb) rb.onclick = () => klaviyoCards(a, cur, H.RUN());
      return;
    }
    const W = win(), D = dly && dly.days ? dly : null;
    const span = Math.round((Date.parse(W.to) - Date.parse(W.from)) / 864e5) + 1, weekly = span > 45;
    const kd = D ? klSlice(D.days, W.from, W.to) : [], kp = D && W.pf ? klSlice(D.days, W.pf, W.pt) : [];
    const K = klRoll(kd), KP = W.pf ? klRoll(kp) : null;
    const flowRows = (flows?.flows || []);
    const flags = klFlags(K, KP, ov, flowRows);
    const writeOK = can && !can.error ? { flows: can.flows !== false, campaigns: can.campaigns !== false } : { flows: true, campaigns: true };
    const lock = need => `<div class="v2note kl-lock"><span class="v2pill warn">read only</span> Changing ${need === 'flows' ? 'flows' : 'campaigns'} from Locus needs the <b>${need === 'flows' ? 'flows:write' : 'campaigns:write'}</b> scope on ${esc(a.name)}’s Klaviyo key. In Klaviyo > Settings > API keys, create a private key with ${need === 'flows' ? 'Flows' : 'Campaigns'}: Full access (keep the read scopes), then paste it in Brand settings > Integrations > Klaviyo.</div>`;
    /* tiles from Klaviyo */
    const kb = klBucket(kd, weekly), kpb = klBucket(kp, weekly);
    const rprF = r => r.received >= 200 ? (r.rev_email || 0) / r.received : null, porF = r => r.received >= 200 ? (r.orders_email || 0) / r.received : null;
    const tiles = D ? `<div class="v2tiles">${[
      tile({ compact: true, label: 'SMS share of email and SMS', src: 'KLAVIYO', value: pct(K.sms_share, 0), delta: KP ? delta(K.sms_share, KP.sms_share, 'n', true) : '', sub: `SMS ${kmoney(K.rev_sms, cur)} · email ${kmoney(K.rev_email, cur)}`, spark: tspark(kb, kpb, r => (r.rev_email || 0) + (r.rev_sms || 0) ? (r.rev_sms || 0) / ((r.rev_email || 0) + (r.rev_sms || 0)) : null, v => pct(v, 0), 'SMS share') }),
      /* No goal bullets here (2026-10-09, Cole: "not good visualizations"): the benchmark is a number in words, coloured
         by which side of it the brand sits, and the tile's line shows the trend. */
      tile({ compact: true, label: 'Revenue per email', src: 'KLAVIYO', value: money2(K.rpr, cur), delta: KP ? delta(K.rpr, KP.rpr) : '', sub: vsAvg(K.rpr, BENCH.rpr, false, v => money2(v, cur)), spark: tspark(kb, kpb, rprF, v => money2(v, cur), 'per email') }),
      tile({ compact: true, label: 'Placed order rate', src: 'KLAVIYO', value: pct(K.por, 2), delta: KP ? delta(K.por, KP.por) : '', sub: vsAvg(K.por, BENCH.por, false, v => pct(v, 2)), spark: tspark(kb, kpb, porF, v => pct(v, 3), 'placed order rate') }),
      tile({ compact: true, label: 'List growth', src: 'KLAVIYO', value: `${K.net >= 0 ? '+' : ''}${int(K.net)}`, delta: KP ? delta(K.gained, KP.gained) : '', sub: `${int(K.gained)} joined · ${int(K.lost)} left`, spark: tspark(kb, kpb, r => (r.gained || 0) - (r.lost || 0), v => `${v >= 0 ? '+' : ''}${int(v)}`, 'net') })].join('')}</div>` : `<div class="v2card"><p class="v2hint">The day-by-day Klaviyo read failed: ${esc(dly?.error || 'no answer')}. Campaign and flow tables below still work.</p></div>`;
    /* engagement and deliverability */
    const RATES = [['Open', 'opened', BENCH.open, false, 1], ['Click', 'clicked', BENCH.click, false, 2], ['Placed order', 'orders_email', BENCH.por, false, 3], ['Unsubscribe', 'unsub', BENCH.unsub, true, 2], ['Spam complaints', 'spam', BENCH.spam, true, 3], ['Bounce', 'bounced', BENCH.bounce, true, 2]];
    const rateKey = { opened: 'open', clicked: 'click', orders_email: 'por', unsub: 'unsub', spam: 'spam', bounced: 'bounce' };
    const rates = D ? cardL('Engagement and deliverability', `Per email received, ${weekly ? 'week by week' : 'day by day'}. The amber dashed line is Klaviyo’s average.${(D.metrics_missing || []).length ? ` Not in this account: ${esc(D.metrics_missing.join(', ').replace(/_/g, ' '))}.` : ''}`,
      `${flagHtml(flags)}<div class="kl-rates">${RATES.map(([l, key, bn, lower, dp]) => { const v = K[rateKey[key]], pv = KP && KP[rateKey[key]]; const f = r => r.received >= 200 ? (r[key] || 0) / r.received : null;
        return `<div class="kl-r"><div class="kl-rh"><span>${l}</span>${benchPill(v, bn, lower)}</div><div class="kl-rv">${pct(v, dp)} ${pv != null ? delta(v, pv, lower) : ''}</div>${rateSpark(kb, kpb, f, bn, x => pct(x, dp), l.toLowerCase())}</div>`; }).join('')}</div>`, 'Klaviyo · opens include Apple’s automatic opens') : '';
    /* list growth + email vs SMS */
    const growth = D ? cardL('List growth', `${int(K.gained)} joined and ${int(K.lost)} left ${weekly ? 'by week' : 'by day'} (${esc(String(D.metrics_used?.gained || 'subscribed'))} vs ${esc(String(D.metrics_used?.lost || 'unsubscribed'))}).`, growthChart('v2klg', kb) || '<p class="v2hint">Not enough days.</p>', 'Klaviyo') : '';
    const split = D ? cardL('Email vs SMS', K.rev ? `SMS is ${pct(K.sms_share, 0)} of Klaviyo-attributed revenue in this window.` : 'No Klaviyo-attributed revenue in this window.',
      `<div class="kl-split"><i style="width:${K.rev ? (K.rev_email / K.rev * 100).toFixed(1) : 0}%;background:var(--c-email)"></i><i style="width:${K.rev ? (K.rev_sms / K.rev * 100).toFixed(1) : 0}%;background:var(--brand)"></i></div>
      <div class="v2tbl"><table><thead><tr><th>Channel</th><th>Revenue</th><th>Orders</th><th>Sends</th></tr></thead><tbody>
        <tr><td><span class="sw" style="background:var(--c-email)"></span>Email</td><td>${kmoney(K.rev_email, cur)} ${KP ? delta(K.rev_email, KP.rev_email) : ''}</td><td>${int(K.orders_email)}</td><td>${int(K.received)}<span class="sub">${money2(K.rpr, cur)} each</span></td></tr>
        <tr><td><span class="sw" style="background:var(--brand)"></span>SMS</td><td>${kmoney(K.rev_sms, cur)} ${KP && KP.rev_sms ? delta(K.rev_sms, KP.rev_sms) : ''}</td><td>${int(K.orders_sms)}</td><td>${D.metrics_used?.sms_received ? `${int(K.sms_received)}<span class="sub">${K.sms_received ? money2(K.rev_sms / K.sms_received, cur) : '–'} each</span>` : '<span class="faint"' + tipAttr('This Klaviyo account has no Received SMS metric: it does not send SMS through Klaviyo, or has not yet.') + '>none</span>'}</td></tr></tbody></table></div>`, 'Klaviyo') : '';
    /* flows */
    const fmx = Math.max(...flowRows.map(x => x.revenue || 0), 1);
    const CORE = /welcome|abandon|cart|checkout|browse|post.?purchase|thank|win.?back|sunset/i;
    const STATUS = [['live', 'Live', 'Sending to everyone who triggers it'], ['manual', 'Manual', 'Built but switched off: nobody new enters'], ['draft', 'Draft', 'Unfinished and off']];
    const flowRow = x => `<tr data-flow="${esc(x.id)}"><td>${x.messages && x.messages.length ? `<button type="button" class="v2ex${FLOW_OPEN.has(x.id) ? ' open' : ''}" data-ftog="${esc(x.id)}" aria-label="Show its messages">›</button>` : '<span class="v2ex-sp"></span>'}${CORE.test(x.name) ? '<span class="v2pill good">core</span> ' : ''}<span class="nm" title="${esc(x.name)}">${esc(x.name)}</span>${x.trigger ? `<span class="sub">${esc(x.trigger)}${(x.channels || []).length ? ` · ${esc(x.channels.map(c => c === 'sms' ? 'SMS' : 'email').join(' + '))}` : ''}</span>` : ''}</td>
      <td>${stChip(x.status, writeOK.flows ? x.id : null)}</td>
      <td>${ib(x.revenue || 0, fmx, '--c-email', kmoney(x.revenue, cur))}</td><td class="kl-linecell">${flowSpark(x.id, D, W.from, W.to)}</td><td>${int(x.recipients)}</td><td>${(x.channels || []).length === 1 && x.channels[0] === 'sms' ? '–' : pct(x.open_rate, 1)}</td><td>${pct(x.click_rate, 1)}</td><td>${pct(x.conversion_rate, 2)}</td><td>${money2(x.revenue_per_recipient, cur)}</td><td>${pct(x.unsubscribe_rate, 2)}</td></tr>`;
    const flowsCard = cardL('Flows', flowRows.length ? `${flowRows.filter(x => x.status === 'live').length} live of ${flowRows.length}. Results are the last 90 days; the line is ${esc(day(W.from))} to ${esc(day(W.to))}. Open a flow for its messages, then click a message to see it.` : esc(flows?.results_note || 'No flow results came back.'),
      `${writeOK.flows ? '' : lock('flows')}${flowRows.length ? `<div class="v2tbl wide"><table id="v2klflows"><thead><tr><th>Flow</th><th>Status</th><th>Revenue, 90 days</th><th>Line</th><th>Recipients</th><th>Open</th><th>Click</th><th>Placed order</th><th>Per recipient</th><th>Unsub</th></tr></thead><tbody>${flowRows.map(x => flowRow(x) + (FLOW_OPEN.has(x.id) ? `<tr class="kl-sub" data-fsub="${esc(x.id)}"><td colspan="10"><p class="v2hint">Reading the messages…</p></td></tr>` : '')).join('')}</tbody></table></div>` : ''}`, 'Klaviyo');
    /* campaigns */
    const sentAll = (camps?.campaigns || []).filter(x => x.recipients != null);
    const up = camps?.upcoming || [];
    const cmx = Math.max(...sentAll.map(x => x.conversion_value || 0), 1);
    const sms = x => x.channel === 'sms';
    const afterTot = x => { const s0 = D && (D.by_message[x.message_id] || D.by_message[x.id]); if (!s0 || !x.sent) return null; const i0 = Math.round((Date.parse(x.sent) - Date.parse(D.attr_from)) / 864e5); return i0 < 0 ? null : s0.slice(i0, i0 + 14).reduce((t, y) => t + y, 0); };
    const defs = [
      { k: 'sent', l: 'Sent', v: x => x.send_time ? Date.parse(x.send_time) : null, cell: x => x.sent ? day(x.sent) : '–' },
      { k: 'channel', l: 'Channel', txt: 1, v: x => x.channel, cell: x => `<span class="v2pill">${sms(x) ? 'SMS' : 'Email'}</span>` },
      { k: 'recipients', l: 'Recipients', v: x => x.recipients, cell: x => int(x.recipients) },
      { k: 'open', l: 'Open', v: x => sms(x) ? null : x.open_rate, cell: x => sms(x) ? '–' : rateCell(x.open_rate, BENCH.open, false, 1), tip: 'Green beats Klaviyo’s 38% average. Includes Apple Mail’s automatic opens' },
      { k: 'click', l: 'Click', v: x => x.click_rate, cell: x => sms(x) ? pct(x.click_rate, 2) : rateCell(x.click_rate, BENCH.click, false, 2), tip: 'Green beats Klaviyo’s 1.2% average' },
      { k: 'por', l: 'Placed order', v: x => x.conversion_rate, cell: x => sms(x) ? pct(x.conversion_rate, 2) : rateCell(x.conversion_rate, BENCH.por, false, 2), tip: 'Recipients who placed an order, Klaviyo attribution. Green beats Klaviyo’s 0.08% average' },
      { k: 'rev', l: 'Revenue', v: x => x.conversion_value || 0, cell: x => ib(x.conversion_value || 0, cmx, '--brand', kmoney(x.conversion_value, cur)) },
      { k: 'rpr', l: 'Per recipient', v: x => x.recipients ? (x.conversion_value || 0) / x.recipients : null, cell: x => money2(x.recipients ? (x.conversion_value || 0) / x.recipients : null, cur) },
      { k: 'unsub', l: 'Unsub', lo: 1, v: x => x.unsubscribe_rate, cell: x => sms(x) ? pct(x.unsubscribe_rate, 2) : rateCell(x.unsubscribe_rate, BENCH.unsub, true, 2), tip: 'Green is under Klaviyo’s 0.3% average' },
      { k: 'spam', l: 'Spam', lo: 1, v: x => sms(x) ? null : x.spam_complaint_rate, cell: x => sms(x) ? '–' : rateCell(x.spam_complaint_rate, BENCH.spam, true, 3) },
      { k: 'bounce', l: 'Bounce', lo: 1, v: x => sms(x) ? null : x.bounce_rate, cell: x => sms(x) ? '–' : rateCell(x.bounce_rate, BENCH.bounce, true, 2) },
      { k: 'after', l: 'Money after send', v: afterTot, cell: x => afterSend(x, D), tip: 'How fast the money came in: the running total over the 14 days after the send. Hover a day to read it; sorts by the 14-day total' },
    ];
    const st = TBL.load('kl-camps', defs, KL_DEFAULT);
    const table = () => { const cols = TBL.cols(st, defs), by = TBL.cmp(st, defs);
      const list = by ? sentAll.slice().sort(by) : sentAll.slice().sort((x, y) => String(y.send_time || '').localeCompare(String(x.send_time || '')));
      const shown = KLS.all ? list : list.slice(0, 20);
      return `<table id="v2klcamps"><thead><tr>${TBL.th(st, '_name', 'Campaign')}${cols.map(d => TBL.th(st, d.k, d.l)).join('')}<th></th></tr></thead><tbody>${shown.map(x => `<tr class="link" data-klmsg="${esc(x.id)}" tabindex="0"><td><span class="nm" title="${esc(x.name)}">${esc(x.name)}</span>${x.subject ? `<span class="sub" title="${esc(x.subject)}">${esc(x.subject)}</span>` : ''}</td>${cols.map(d => `<td>${d.cell(x)}</td>`).join('')}<td class="kl-acts">${actBtns(x, 'sent')}</td></tr>`).join('')}</tbody></table>${list.length > 20 ? `<button type="button" class="v2link" data-klall="1" style="margin-top:8px">${KLS.all ? 'Show the first 20' : `Show all ${list.length}`} ›</button>` : ''}`; };
    const actBtns = (x, kind) => !writeOK.campaigns ? '' : kind === 'up'
      ? `${/^draft$/i.test(x.status) ? `<button type="button" class="kl-act" data-kact="schedule" data-cid="${esc(x.id)}">Schedule</button>` : ''}${/schedul|queued|adding|preparing/i.test(x.status) ? `<button type="button" class="kl-act" data-kact="unschedule" data-cid="${esc(x.id)}">Unschedule</button><button type="button" class="kl-act warn" data-kact="cancel" data-cid="${esc(x.id)}">Cancel</button>` : ''}<button type="button" class="kl-act" data-kact="duplicate" data-cid="${esc(x.id)}">Duplicate</button>`
      : `<button type="button" class="kl-act" data-kact="duplicate" data-cid="${esc(x.id)}"${tipAttr('Copy it as a new draft: same audience, content and sender')}>Duplicate</button>`;
    const upCard = cardL('Drafts and scheduled', up.length ? `${up.length} not sent yet. Schedule a draft, move or stop a scheduled send, or copy one.` : 'Nothing drafted or scheduled in Klaviyo right now.',
      `${writeOK.campaigns ? '' : lock('campaigns')}${up.length ? `<div class="v2tbl"><table><thead><tr><th>Campaign</th><th>Channel</th><th>Status</th><th>Sends</th><th></th></tr></thead><tbody>${up.map(x => `<tr><td><span class="nm" title="${esc(x.name)}">${esc(x.name)}</span>${x.subject ? `<span class="sub">${esc(x.subject)}</span>` : ''}</td><td><span class="v2pill">${x.channel === 'sms' ? 'SMS' : 'Email'}</span></td><td>${campChip(x.status)}</td><td>${x.send_at && !/^draft$/i.test(x.status) ? esc(new Date(x.send_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) : '–'}</td><td class="kl-acts">${actBtns(x, 'up')}<a class="kl-act" href="https://www.klaviyo.com/campaign/${esc(x.id)}/wizard" target="_blank" rel="noopener">Open in Klaviyo</a></td></tr>`).join('')}</tbody></table></div>` : ''}
      ${writeOK.campaigns ? '<button type="button" class="v2btn" data-klnew="1">New draft campaign</button>' : ''}`, 'Klaviyo');
    const sentCard = cardL('Campaigns sent', sentAll.length ? `${sentAll.length} sent in 90 days, Klaviyo’s own results. Click a campaign to see the email and its results; click a heading to sort. The last column shows how fast its money came in.` : esc(camps?.results_note || 'No campaign results came back.'),
      sentAll.length ? `<div class="v2tbar"><span class="v2tbar-l faint">Click a column to sort.</span><div class="hd-period pm v2cols" data-tbl="${st.id}">${TBL.menu(st, defs)}</div></div><div class="v2tbl wide" id="v2klcwrap">${table()}</div>` : '', 'Klaviyo');
    /* One column with the page's own 16px rhythm (2026-10-09, Cole: "no space between sections"): the Klaviyo part used to
       sit in a plain div, so its cards touched. A small-caps label marks where Triple Whale ends and Klaviyo begins. */
    host.classList.add('lx-stack');
    host.innerHTML = `<p class="ds-label lx-sec">From Klaviyo, read with ${esc(a.name)}’s own key${D?.cached_at ? ` · as of ${esc(new Date(D.cached_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}` : ''}</p>${tiles}${rates}<div class="v2two eq">${growth}${split}</div>${flowsCard}${upCard}${sentCard}
      ${subjectsCard(sentAll.filter(x => x.channel !== 'sms'), cur, a.tz)}
        ${cardL('What Klaviyo is running', `${int(ov.flows_live)} live flows of ${int(ov.flows_total)} · ${int(ov.lists)} lists · ${int(ov.segments)} segments.`, `<div class="v2tbl"><table><tbody>${(ov.biggest_lists || []).slice(0, 4).map(l => `<tr><td>${esc(l.name)} <span class="faint">list</span></td><td>${int(l.profiles)}</td></tr>`).join('')}${(ov.biggest_segments || []).slice(0, 5).map(l => `<tr><td>${esc(l.name)} <span class="faint">segment</span></td><td>${int(l.profiles)}</td></tr>`).join('')}</tbody></table></div>`)}`;
    if (D) wireGrowth('v2klg', kb);
    wireGo(host);
    const again = () => klaviyoCards(a, cur, H.RUN());
    /* flows: status menus and the per-message rows */
    host.querySelectorAll('[data-flst]').forEach(btn => btn.onclick = e => { e.stopPropagation(); const id = btn.dataset.flst; const x = flowRows.find(f => f.id === id); statusMenu(btn, x.status, v => klWrite(a, 'flow_status', { flow: id, status: v }, again)); });
    /* a sent campaign (table row or a subject line) opens the email itself */
    const openCamp = id => { const x = sentAll.find(c => c.id === id); if (!x) return;
      klPreview(a, cur, { kind: 'campaign', id: x.message_id || x.id, channel: x.channel, name: x.name, subject: x.subject, link: `https://www.klaviyo.com/campaign/${encodeURIComponent(x.id)}/reports`,
        stats: pvStats(x, cur, D && typeof afterSeries(x, D) === 'object' ? `<p class="ds-label" style="margin-top:14px">How fast the money came in</p><div class="lx-pv-aft">${afterSend(x, D, 280, 56)}</div><p class="v2hint">Running total over the 14 days after the send, Klaviyo attribution by order date. Hover to read each day.</p>` : '') }); };
    const wireMsgRows = root => root.querySelectorAll('tr[data-klmsg]').forEach(tr => { tr.onclick = e => { if (e.target.closest('button,a,input')) return; openCamp(tr.dataset.klmsg); }; tr.onkeydown = e => { if (e.key === 'Enter' && e.target === tr) openCamp(tr.dataset.klmsg); }; });
    wireMsgRows(host);
    const fill = async id => {
      const row = host.querySelector(`[data-fsub="${CSS.escape(id)}"] td`); if (!row) return;
      try {
        const r = await klGet(a.act_id, 'flow', `&id=${encodeURIComponent(id)}`);
        const ms = r.messages || [];
        row.innerHTML = ms.length ? `<table class="kl-msgs"><thead><tr><th>Message</th><th>Channel</th><th>Recipients</th><th>Open</th><th>Click</th><th>Placed order</th><th>Revenue</th><th>Per recipient</th><th>Unsub</th></tr></thead><tbody>${ms.map((m, i) => `<tr class="link" data-fmsg="${esc(m.id || '')}" data-fi="${i}" tabindex="0"${tipAttr('Click to see this message and its results')}><td><b>${i + 1}.</b> ${esc(m.name || m.id || 'Message')}${m.subject ? `<span class="sub">${esc(m.subject)}</span>` : ''}</td><td><span class="ds-chip lx-chip">${m.channel === 'sms' ? 'SMS' : 'Email'}</span></td><td>${int(m.recipients)}</td><td>${m.channel === 'sms' ? '–' : rateCell(m.open_rate, BENCH.open, false, 1)}</td><td>${m.channel === 'sms' ? pct(m.click_rate, 2) : rateCell(m.click_rate, BENCH.click, false, 2)}</td><td>${pct(m.conversion_rate, 2)}</td><td>${kmoney(m.revenue, cur)}</td><td>${money2(m.revenue_per_recipient, cur)}</td><td>${pct(m.unsubscribe_rate, 2)}</td></tr>`).join('')}</tbody></table>` : '<p class="v2hint">No message sent in 90 days.</p>';
        const fname = flowRows.find(f => f.id === id)?.name || 'Flow';
        row.querySelectorAll('tr[data-fmsg]').forEach(tr => { const m = ms[+tr.dataset.fi]; if (!m || !m.id) return;
          const open = () => klPreview(a, cur, { kind: 'flow', id: m.id, channel: m.channel, name: `${fname}: ${m.name || 'message ' + (+tr.dataset.fi + 1)}`, subject: m.subject, link: `https://www.klaviyo.com/flow/${encodeURIComponent(id)}/edit`, stats: pvStats(m, cur) });
          tr.onclick = open; tr.onkeydown = e => { if (e.key === 'Enter') open(); }; });
      } catch (e) { row.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; }
    };
    host.querySelectorAll('[data-ftog]').forEach(btn => btn.onclick = () => { const id = btn.dataset.ftog; FLOW_OPEN.has(id) ? FLOW_OPEN.delete(id) : FLOW_OPEN.add(id); const tr = btn.closest('tr'); const sub = host.querySelector(`[data-fsub="${CSS.escape(id)}"]`);
      if (sub) sub.remove(); else { tr.insertAdjacentHTML('afterend', `<tr class="kl-sub" data-fsub="${esc(id)}"><td colspan="10"><p class="v2hint">Reading the messages…</p></td></tr>`); fill(id); } btn.classList.toggle('open', FLOW_OPEN.has(id)); });
    FLOW_OPEN.forEach(id => fill(id));
    /* campaigns: sort, columns, actions, new draft */
    const byId = id => up.find(x => x.id === id) || sentAll.find(x => x.id === id);
    const wireActs = root => root.querySelectorAll('[data-kact]').forEach(btn => btn.onclick = () => { const c = byId(btn.dataset.cid); if (!c) return; const act = btn.dataset.kact;
      if (act === 'schedule') klSchedule(a, c, again);
      else if (act === 'unschedule') klWrite(a, 'campaign_unschedule', { campaign: c.id }, again);
      else if (act === 'cancel') klWrite(a, 'campaign_cancel', { campaign: c.id, mode: 'cancel' }, again);
      else klWrite(a, 'campaign_duplicate', { campaign: c.id }, again); });
    const cwrap = host.querySelector('#v2klcwrap');
    if (cwrap) {
      const redraw = () => { cwrap.innerHTML = table(); hookC(); };
      const hookC = () => { TBL.wire(cwrap, st, defs, redraw); wireActs(cwrap); wireMsgRows(cwrap); const ab = cwrap.querySelector('[data-klall]'); if (ab) ab.onclick = () => { KLS.all = !KLS.all; redraw(); }; };
      hookC(); TBL.wire(cwrap.closest('.v2card').querySelector('.v2tbar'), st, defs, redraw);
    }
    const upEl = [...host.querySelectorAll('.v2card')].find(c => c.querySelector('[data-klnew]') || /Drafts and scheduled/.test(c.querySelector('h3')?.textContent || '')); if (upEl) wireActs(upEl);
    const nb = host.querySelector('[data-klnew]'); if (nb) nb.onclick = () => klNewDraft(a, again);
  }

  /* =========================================================================================
   * STORE > WEBSITE (GA4) and STORE > SEARCH (Search Console), read directly (account-health google.js)
   * ======================================================================================= */
  const isoD = d => d.toISOString().slice(0, 10);
  function win() {
    const q = new URLSearchParams(H.rangeQ()); let from = q.get('from'), to = q.get('to');
    if (!from) { const n = +q.get('days') || 30; const y = new Date(); y.setDate(y.getDate() - 1); to = isoD(y); const f = new Date(y); f.setDate(f.getDate() - n + 1); from = isoD(f); }
    const n = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
    let pf, pt;
    if (H.S.cmp === 'yoy') { const a = new Date(from); a.setFullYear(a.getFullYear() - 1); const b = new Date(to); b.setFullYear(b.getFullYear() - 1); pf = isoD(a); pt = isoD(b); }
    else if (H.S.cmp !== 'none') { const b = new Date(from); b.setDate(b.getDate() - 1); const a = new Date(b); a.setDate(a.getDate() - n + 1); pf = isoD(a); pt = isoD(b); }
    return { from, to, pf, pt, q: `from=${from}&to=${to}${pf ? `&pfrom=${pf}&pto=${pt}` : ''}` };
  }
  const GSTEPS = {
    ga4: ['In Google Workspace admin, give the Locus service account the Google Analytics read scope (Brand settings > Integrations > Google Analytics 4 shows the exact client ID and scope).', 'Turn on the Google Analytics Data API and Admin API in the Google Cloud project.', 'On the brand’s GA4 property, add cole@go-mobius-digital.com as a Viewer.', 'Brand settings > Integrations: paste the brand’s GA4 property ID.'],
    gsc: ['In Google Workspace admin, give the Locus service account the Search Console read scope (Agency settings > Integrations shows the exact client ID and scope).', 'Turn on the Search Console API in the Google Cloud project.', 'On the brand’s Search Console property, add cole@go-mobius-digital.com as a user.', 'Brand settings > Integrations: paste the property (sc-domain:brand.com).'],
  };
  function notLinked(kind, brand, err) {
    const what = kind === 'ga4' ? 'Google Analytics' : 'Search Console';
    const gives = kind === 'ga4' ? 'Where visitors come from (channels and sources), which landing pages convert and which leak, mobile against desktop, and the shopping funnel from visit to purchase.' : 'What people search on Google before they find the brand, which queries and pages bring clicks, how much is people already searching the brand name, and which queries sit just off page one.';
    return card(`Connect ${what} for ${esc(brand)}`, '', `<p class="v2hint">${gives}</p>${err && err !== 'not_linked' ? `<p class="v2hint" style="margin-top:8px">Google answered: ${esc(err)}</p>` : ''}
      <ol class="v2steps">${GSTEPS[kind].map(x => `<li>${esc(x)}</li>`).join('')}</ol><button type="button" class="v2btn" data-go="settings">Open Integrations</button>`);
  }
  /* ---------- STORE > WEBSITE, Cole's pass (2026-10-09) ----------
     "The funnel is unreadable past add to cart", "make the tables sortable and let me click into a row", "the card click
     only says go to the Metrics tab", "where do heatmaps and recordings go?". So: a real funnel (count, % of the step
     before, % of sessions, the drop between steps with the biggest one called out, log-scaled bars so the small steps
     show, the compare period on every number); sortable channel / source / landing page tables whose rows open a
     drill-down (that slice's days, funnel, devices and the other side of it); every tile opens its own drill-down;
     who visits (device, new against returning); and Behaviour from Microsoft Clarity. Data: account-health
     /api/google/website (+ /website-drill) and /api/clarity. */
  const webCvr = x => x && x.sessions ? (x.ecommercePurchases || 0) / x.sessions : null;
  const secs = s => s == null || !isFinite(s) ? '–' : s >= 60 ? `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s` : `${Math.round(s)}s`;
  const ptDelta = (cur, prev, lower) => { if (cur == null || prev == null || H.S.cmp === 'none') return ''; const d = (cur - prev) * 100; if (Math.abs(d) < 0.05) return '<span class="v2d flat">same</span>'; const good = (d > 0) !== !!lower; return `<span class="v2d ${good ? 'up' : 'down'}"${tipAttr(`Against ${cmpLabel()}: ${pct(prev, 1)}`)}>${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)} pt</span>`; };
  const FSTEPS = [['Sessions', 'sessions'], ['Added to cart', 'addToCarts'], ['Started checkout', 'checkouts'], ['Purchased', 'ecommercePurchases']];
  const DROP_WORD = ['', 'left before adding to cart', 'of carts never reached checkout', 'of checkouts did not buy'];
  /** The funnel: one row per step, the drop between steps under it, bars on a log scale (so 246 purchases is still a
   *  visible bar beside 31,729 sessions); exact numbers beside every bar. */
  function webFunnel(c, p) {
    const top = c.sessions || 0; if (!top) return '<p class="v2hint">No sessions in this window.</p>';
    const L = v => v > 0 ? Math.max(1.5, Math.log10(v + 1) / Math.log10(top + 1) * 100) : 0;
    const st = FSTEPS.map(([l, k], i) => { const v = c[k] || 0, pv = p ? p[k] : null, b = i ? c[FSTEPS[i - 1][1]] || 0 : null, pb = i && p ? p[FSTEPS[i - 1][1]] || 0 : null;
      return { l, k, v, pv, of: i && b ? v / b : null, pof: i && pb ? (pv || 0) / pb : null, top: v / top, ptop: p && p.sessions ? (pv || 0) / p.sessions : null }; });
    const drops = st.slice(1).map((s, i) => ({ i: i + 1, lost: st[i].v - s.v, rate: s.of == null ? null : 1 - s.of, prate: s.pof == null ? null : 1 - s.pof }));
    const worst = drops.filter(d => d.rate != null).sort((x, y) => y.rate - x.rate)[0];
    const moved = drops.filter(d => d.rate != null && d.prate != null && H.S.cmp !== 'none').sort((x, y) => (y.rate - y.prate) - (x.rate - x.prate))[0];
    const row = s => `<div class="lx-fn-r"><span class="l">${s.l}</span><span class="n"><b>${int(s.v)}</b>${chip(s.v, s.pv, false, `${cmpLabel()}: ${int(s.pv)}`)}</span><span class="p">${s.of == null ? '<span class="faint">–</span>' : `${pct(s.of, 1)}${ptDelta(s.of, s.pof)}`}</span><span class="p">${pct(s.top, s.top < 0.1 ? 2 : 1)}</span><span class="bar"${tipAttr(`<b>${s.l}</b> · ${int(s.v)}${s.pv != null ? `<br><span class="faint">${esc(cmpLabel())}: ${int(s.pv)}</span>` : ''}`)}>${s.pv != null && H.S.cmp !== 'none' ? `<i class="g" style="width:${L(s.pv).toFixed(1)}%"></i>` : ''}<i style="width:${L(s.v).toFixed(1)}%"></i></span></div>`;
    const drop = d => `<div class="lx-fn-d${worst && d.i === worst.i ? ' worst' : ''}"><span class="arr" aria-hidden="true">↓</span><span><b>${pct(d.rate, 1)}</b> ${DROP_WORD[d.i]} <span class="faint">(${int(d.lost)})</span>${d.prate != null && H.S.cmp !== 'none' ? ` <span class="${d.rate <= d.prate ? 'good' : 'bad'}">${d.rate <= d.prate ? 'better' : 'worse'} than before (${pct(d.prate, 1)})</span>` : ''}</span>${worst && d.i === worst.i ? '<span class="ds-chip warn">Biggest drop</span>' : ''}</div>`;
    return `<div class="lx-fn"><div class="lx-fn-h"><span>Step</span><span>Count</span><span>Of the step before</span><span>Of sessions</span><span>Log scale</span></div>${st.map((s, i) => (i ? drop(drops[i - 1]) : '') + row(s)).join('')}</div>
      <p class="v2hint lx-fn-note">Bars use a log scale so the small steps stay visible; the numbers are exact.${p && H.S.cmp !== 'none' ? ' The grey bar is ' + esc(cmpLabel()) + '.' : ''}${moved && moved.rate - moved.prate > 0.005 ? ` The step that slipped most: ${['', 'sessions leaving before adding to cart', 'carts not reaching checkout', 'checkouts not buying'][moved.i]}, up ${((moved.rate - moved.prate) * 100).toFixed(1)} pt.` : ''} GA4 counts add-to-cart and checkout as events, so one shopper adding twice counts twice.</p>`;
  }
  /* The sortable columns every traffic table shares. `tot` = the site's sessions; `site` = the site's conversion rate. */
  const webDefs = (tot, site, cur) => [
    { k: 'sessions', l: 'Sessions', v: r => r.sessions, cell: r => `${int(r.sessions)} ${chip(r.sessions, r.prev?.sessions, false, `${cmpLabel()}: ${int(r.prev?.sessions)}`)}` },
    { k: 'share', l: 'Share', v: r => tot ? r.sessions / tot : null, cell: r => ib(r.sessions, tot, null, pct(tot ? r.sessions / tot : null, 0)), tip: 'Share of all sessions' },
    { k: 'eng', l: 'Engaged', v: r => r.engagementRate, cell: r => pct(r.engagementRate, 0), tip: '10 seconds or more, 2+ pages, or a conversion' },
    { k: 'time', l: 'Avg time', v: r => r.averageSessionDuration, cell: r => secs(r.averageSessionDuration) },
    { k: 'atc', l: 'Add to cart', v: r => r.sessions ? (r.addToCarts || 0) / r.sessions : null, cell: r => pct(r.sessions ? (r.addToCarts || 0) / r.sessions : null, 1), tip: 'Add-to-cart events per session' },
    { k: 'cvr', l: 'Conversion', v: webCvr, cell: r => { const v = webCvr(r), big = r.sessions > tot * 0.03 && site; return `<span class="${big ? (v >= site ? 'good' : 'bad') : ''}"${big ? tipAttr(`Site average ${pct(site, 2)}`) : ''}>${pct(v, 2)}</span>`; }, tip: 'Purchases per session; green beats the site average on real traffic' },
    { k: 'purch', l: 'Purchases', v: r => r.ecommercePurchases, cell: r => int(r.ecommercePurchases) },
    { k: 'rev', l: 'Revenue', v: r => r.purchaseRevenue, cell: r => kmoney(r.purchaseRevenue, cur), tip: 'What GA4 sees; Shopify is the truth' },
    { k: 'rps', l: 'Per session', v: r => r.sessions ? (r.purchaseRevenue || 0) / r.sessions : null, cell: r => money2(r.sessions ? (r.purchaseRevenue || 0) / r.sessions : null, cur), tip: 'Revenue per session' },
  ];
  const WEBX = {};   // 'show all' per table
  /** A sortable traffic table (the Ads tables' TBL helper). Rows open `drill(kind, name)`. */
  function webTable(id, rows, defs, def, nameLbl, kind, nameCell, cap = 15) {
    const st = TBL.load(id, defs, def);
    const html = () => { const cols = TBL.cols(st, defs), by = TBL.cmp(st, defs); const list = by ? rows.slice().sort(by) : rows; const shown = WEBX[id] ? list : list.slice(0, cap);
      return `<table><thead><tr>${TBL.th(st, '_name', nameLbl)}${cols.map(d => TBL.th(st, d.k, d.l)).join('')}</tr></thead><tbody>${shown.map(r => `<tr class="link" data-wd="${kind}" data-wv="${esc(r.name)}" tabindex="0">${nameCell(r)}${cols.map(d => `<td>${d.cell(r)}</td>`).join('')}</tr>`).join('')}</tbody></table>${list.length > cap ? `<button type="button" class="v2link" data-wx="${id}" style="margin-top:8px">${WEBX[id] ? `Show the first ${cap}` : `Show all ${list.length}`} ›</button>` : ''}`; };
    return { st, html, block: `<div class="v2tbar"><span class="v2tbar-l faint">Click a heading to sort, a row to drill in.</span><div class="hd-period pm v2cols" data-tbl="${st.id}">${TBL.menu(st, defs)}</div></div><div class="v2tbl wide" data-wt="${id}">${html()}</div>` };
  }
  function wireWebTable(root, id, t, defs, onRow) {
    const wrap = root.querySelector(`[data-wt="${id}"]`); if (!wrap) return;
    const redraw = () => { wrap.innerHTML = t.html(); hook(); };
    const hook = () => { TBL.wire(wrap, t.st, defs, redraw); const x = wrap.querySelector('[data-wx]'); if (x) x.onclick = () => { WEBX[id] = !WEBX[id]; redraw(); };
      wrap.querySelectorAll('tr[data-wd]').forEach(tr => { tr.onclick = e => { if (!e.target.closest('button,a')) onRow(tr.dataset.wd, tr.dataset.wv); }; tr.onkeydown = e => { if (e.key === 'Enter') onRow(tr.dataset.wd, tr.dataset.wv); }; }); };
    hook(); const bar = wrap.closest('.v2card')?.querySelector('.v2tbar'); if (bar) TBL.wire(bar, t.st, defs, redraw);
  }
  const pagePath = s => String(s || '').replace(/^https?:\/\/[^/]+/, '') || '/';
  const WD_LABEL = { channel: 'Channel', source: 'Source / medium', page: 'Landing page', device: 'Device', nvr: 'Visitors' };
  /** A slice of the website, drilled (row click). */
  async function webDrill(a, w, kind, value, site) {
    const cur = a.currency;
    const sheet = () => { panel.sheet = { lead: `<span class="lx-pv-lead">${window.icon ? window.icon(kind === 'page' ? 'file-text' : kind === 'device' ? 'layout-grid' : kind === 'nvr' ? 'users' : 'globe', { size: 20 }) : ''}</span>`, chip: `<span class="ds-chip">${esc(WD_LABEL[kind] || kind)}</span>`, navLabel: 'In this drill-down' }; panel.wide = true; };
    const name = kind === 'page' ? pagePath(value) : kind === 'nvr' ? (value === 'new' ? 'New visitors' : 'Returning visitors') : value;
    const tok = (webDrill.n = (webDrill.n || 0) + 1);
    sheet(); let pb = panel(name, `<div class="v2sk"><i class="r"></i><i class="ch"></i><i class="r"></i><i class="r"></i></div>`);
    let d; try { d = await H.apiAH(`/api/google/website-drill?act=${encodeURIComponent(a.act_id)}&${w.q}&kind=${kind}&value=${encodeURIComponent(value)}`); } catch (e) { d = { error: e.message }; }
    if (tok !== webDrill.n || !document.getElementById('v2panel')?.classList.contains('on')) return;
    if (d.error) { pb.innerHTML = `<p class="v2bad">${esc(d.error)}</p>`; return; }
    /* GA4 leaves out days with no sessions; fill them so the compare line lines up day for day. */
    const fill = (rows, from, to) => { if (!from) return []; const m = new Map((rows || []).map(r => [r.date, r])), out = [];
      for (let t0 = Date.parse(from + 'T12:00:00Z'); t0 <= Date.parse(to + 'T12:00:00Z'); t0 += 864e5) { const k = new Date(t0).toISOString().slice(0, 10); out.push(m.get(k) || { date: k, sessions: 0, purchases: 0, ecommercePurchases: 0, purchaseRevenue: 0 }); } return out; };
    const c = d.cur || {}, p = d.prev || null, days = fill(d.days, w.from, w.to), pd = w.pf ? fill(d.prev_days, w.pf, w.pt) : [];
    const id = 'v2wd' + Math.random().toString(36).slice(2, 7);
    const side = (title, rows, lbl, k2) => rows && rows.length ? `<section data-sec="${title}" data-ic="${k2 === 'page' ? 'file-text' : 'globe'}" class="lx-dsec"><h4>${title}</h4><div class="v2tbl"><table><thead><tr><th>${lbl}</th><th>Sessions</th><th>Engaged</th><th>Conversion</th><th>Revenue</th></tr></thead><tbody>${rows.map(r => `<tr><td><span class="nm" title="${esc(r.name)}">${esc(k2 === 'page' ? pagePath(r.name) : r.name)}</span></td><td>${int(r.sessions)} ${chip(r.sessions, r.prev?.sessions)}</td><td>${pct(r.engagementRate, 0)}</td><td>${pct(webCvr(r), 2)}</td><td>${kmoney(r.purchaseRevenue, cur)}</td></tr>`).join('')}</tbody></table></div></section>` : '';
    const dv = (d.devices || []), dT = dv.reduce((s, x) => s + x.sessions, 0) || 1;
    sheet(); pb = panel(name, `<section data-sec="Summary" data-ic="activity" class="lx-dsec"><div class="v2pstat"><div><b>${int(c.sessions)}</b><span>sessions ${chip(c.sessions, p?.sessions)}</span></div><div><b>${pct(c.engagementRate, 0)}</b><span>engaged</span></div><div><b>${pct(webCvr(c), 2)}</b><span>bought${site ? `, site ${pct(site, 2)}` : ''}</span></div><div><b>${kmoney(c.purchaseRevenue, cur)}</b><span>revenue GA4 sees ${chip(c.purchaseRevenue, p?.purchaseRevenue)}</span></div></div>
        <p class="v2hint">${pct(c.totalUsers ? c.newUsers / c.totalUsers : null, 0)} of the people were new; average session ${secs(c.averageSessionDuration)}.</p></section>
      <section data-sec="Day by day" data-ic="chart-line" class="lx-dsec"><h4>Sessions by day</h4>${legend([{ color: '--brand', label: 'Sessions' }, ...(pd.length > 1 && H.S.cmp !== 'none' ? [{ dash: true, label: cmpLabel() }] : [])])}${lineChart(id, days.map(r => ({ ...r, v: r.sessions })), { key: 'v', prev: H.S.cmp !== 'none' ? pd.map(r => ({ ...r, v: r.sessions })) : [], fmt: v => int(v), h: 200 })}</section>
      <section data-sec="Funnel" data-ic="filter" class="lx-dsec"><h4>From visit to purchase</h4>${webFunnel(c, p)}</section>
      ${side('Top landing pages', d.landing, 'Page', 'page')}${side('Channels', d.channels, 'Channel')}${side('Sources', d.sources, 'Source / medium')}
      ${dv.length ? `<section data-sec="Devices" data-ic="layout-grid" class="lx-dsec"><h4>Devices</h4><div class="v2tbl"><table><tbody>${dv.map(x => `<tr><td>${esc(x.device)}</td><td>${pct(x.sessions / dT, 0)} of sessions</td><td>${pct(webCvr(x), 2)} convert</td><td>${kmoney(x.purchaseRevenue, cur)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
      <p class="v2foot">Google Analytics 4, ${esc(w.from)} to ${esc(w.to)}${p ? `, against ${esc(w.pf)} to ${esc(w.pt)}` : ''}.</p>`);
    if (days.length > 1) wireLine(id, days, { tip: (r, i) => `<b>${day(r.date)}</b> · ${int(r.sessions)} sessions · ${int(r.purchases)} purchases${pd[i] && H.S.cmp !== 'none' ? `<br><span class="faint">${esc(cmpLabel())}: ${int(pd[i].sessions)} sessions</span>` : ''}` });
  }
  /** A headline number, drilled (tile click): its line large with the compare period, best and worst day, and the same
   *  number by channel, device and new against returning. Replaces the glossary-only panel on this screen. */
  function webMetric(a, d, w, key) {
    const cur = a.currency;
    const M = {
      sessions: { l: 'Sessions', f: r => r.sessions, fmt: v => int(v), sum: true, means: 'Visits to the site. One person can make several.' },
      engaged: { l: 'Engaged sessions', f: r => r.sessions ? (r.engagedSessions || 0) / r.sessions : null, fmt: v => pct(v, 0), means: 'Sessions that lasted 10 seconds or more, saw 2+ pages, or converted. A low share means people land and leave.' },
      cvr: { l: 'Conversion rate', f: r => r.sessions ? (r.ecommercePurchases || 0) / r.sessions : null, fmt: v => pct(v, 2), means: 'Purchases GA4 saw per session. GA4 misses some orders (consent, ad blockers), so read the trend, not the level.' },
      revenue: { l: 'Revenue GA4 sees', f: r => r.purchaseRevenue, fmt: v => kmoney(v, cur), sum: true, means: 'Purchase revenue GA4 recorded. Store revenue (Shopify) is on Sales and is the truth; this is for comparing channels and pages.' },
    }[key]; if (!M) return;
    const days = d.days || [], pd = d.prev_days || [], c = d.cur || {}, p = d.prev || null;
    const vals = days.map(M.f).filter(v => v != null);
    /* lineChart floors its scale at 1, so rates are drawn in percent units (0.78 not 0.0078). */
    const CV = r => { const v = M.f(r); return v == null ? null : M.sum ? v : v * 100; }, CF = M.sum ? M.fmt : v => v.toFixed(key === 'cvr' ? 2 : 0) + '%';
    const best = days.slice().filter(r => M.f(r) != null).sort((x, y) => M.f(y) - M.f(x)), id = 'v2wm' + Math.random().toString(36).slice(2, 7);
    const by = (rows, lbl, nm) => rows && rows.length ? `<section data-sec="${lbl}" data-ic="layout-grid" class="lx-dsec"><h4>${lbl}</h4><div class="v2tbl"><table><thead><tr><th>${lbl.replace(/^By /, '')}</th><th>${esc(M.l)}</th><th>Before</th><th>Sessions</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(nm(r))}</td><td><b>${M.fmt(M.f(r))}</b></td><td class="faint">${r.prev ? M.fmt(M.f(r.prev)) : '–'}</td><td>${int(r.sessions)}</td></tr>`).join('')}</tbody></table></div></section>` : '';
    panel.sheet = { lead: `<span class="lx-pv-lead">${window.icon ? window.icon('chart-line', { size: 20 }) : ''}</span>`, chip: '<span class="ds-chip">GA4</span>', navLabel: 'In this drill-down' };
    panel.wide = true;
    const pb = panel(M.l, `<section data-sec="The number" data-ic="activity" class="lx-dsec"><div class="lx-dv"><b>${M.fmt(M.f(c))}</b>${p ? `${M.sum ? chip(M.f(c), M.f(p)) : ptDelta(M.f(c), M.f(p))}<span class="faint">${esc(cmpLabel())}: ${M.fmt(M.f(p))}</span>` : ''}</div><p>${esc(M.means)}</p>
        ${best.length > 1 ? `<p class="v2hint">Best day ${esc(day(best[0].date))} (${M.fmt(M.f(best[0]))}); weakest ${esc(day(best[best.length - 1].date))} (${M.fmt(M.f(best[best.length - 1]))}).</p>` : ''}</section>
      <section data-sec="Day by day" data-ic="chart-line" class="lx-dsec"><h4>Day by day</h4>${vals.length > 1 ? legend([{ color: '--brand', label: M.l }, ...(pd.length > 1 && H.S.cmp !== 'none' ? [{ dash: true, label: cmpLabel() }] : [])]) + lineChart(id, days.map(r => ({ ...r, v: CV(r) })), { key: 'v', prev: H.S.cmp !== 'none' ? pd.map(r => ({ ...r, v: CV(r) })) : [], fmt: CF, h: 220 }) : '<p class="v2hint">Pick a longer window to see the line.</p>'}</section>
      ${by((d.channels || []).map(r => ({ ...r, name: r.group })), 'By channel', r => r.name)}${by(d.devices, 'By device', r => r.device)}${by(d.nvr, 'New against returning', r => r.kind === 'new' ? 'New visitors' : 'Returning visitors')}`);
    if (vals.length > 1) wireLine(id, days.map(r => ({ ...r, v: M.f(r) })), { tip: (r, i) => `<b>${day(r.date)}</b> · ${esc(M.l)} ${M.fmt(M.f(r))}${pd[i] && H.S.cmp !== 'none' ? `<br><span class="faint">${esc(cmpLabel())}: ${M.fmt(M.f(pd[i]))}</span>` : ''}` });
    return pb;
  }
  /** Device and new against returning, side by side: a share bar and rows; a row opens the drill-down. */
  function whoVisits(d, cur) {
    const DC = { mobile: '--c-meta', desktop: '--c-email', tablet: '--c-google' }, NC = { new: '--brand', returning: '--c-email' };
    const block = (rows, nm, col, kind, title) => { const T = rows.reduce((s, x) => s + x.sessions, 0) || 1;
      return `<div><p class="ds-label">${title}</p><div class="v2stackbar">${rows.map(x => `<i style="flex:${x.sessions};background:var(${col(x)})"${tipAttr(`<b>${esc(nm(x))}</b> · ${pct(x.sessions / T, 0)} of sessions · converts ${pct(webCvr(x), 2)}`)}></i>`).join('')}</div>
        <div class="v2tbl" style="margin-top:10px"><table><thead><tr><th></th><th>Share</th><th>Engaged</th><th>Conversion</th><th>Revenue</th></tr></thead><tbody>${rows.map(x => `<tr class="link" data-wd="${kind}" data-wv="${esc(kind === 'nvr' ? x.kind : x.device)}" tabindex="0"><td><span class="sw" style="background:var(${col(x)})"></span>${esc(nm(x))}</td><td>${pct(x.sessions / T, 0)} ${chip(x.sessions, x.prev?.sessions)}</td><td>${pct(x.engagementRate, 0)}</td><td>${pct(webCvr(x), 2)}</td><td>${kmoney(x.purchaseRevenue, cur)}</td></tr>`).join('')}</tbody></table></div></div>`; };
    const dv = d.devices || [], nv = d.nvr || [];
    if (!dv.length && !nv.length) return '';
    const ret = nv.find(x => x.kind === 'returning'), nw = nv.find(x => x.kind === 'new'), mob = dv.find(x => x.device === 'mobile'), desk = dv.find(x => x.device === 'desktop');
    const lead = [mob && desk && webCvr(desk) ? `Phones bring ${pct(mob.sessions / (dv.reduce((s, x) => s + x.sessions, 0) || 1), 0)} of sessions and convert ${Math.abs(webCvr(mob) / webCvr(desk) - 1) < 0.05 ? 'about as well as' : `at ${(webCvr(mob) / webCvr(desk)).toFixed(1)}x the rate of`} desktop.` : '', ret && nw && webCvr(nw) ? `Returning visitors buy at ${(webCvr(ret) / webCvr(nw)).toFixed(1)}x the rate of new ones.` : ''].filter(Boolean).join(' ');
    return cardL('Who visits', lead, `<div class="lx-who">${dv.length ? block(dv, x => x.device, x => DC[x.device] || '--c-else', 'device', 'Device') : ''}${nv.length ? block(nv, x => x.kind === 'new' ? 'New visitors' : 'Returning visitors', x => NC[x.kind] || '--c-else', 'nvr', 'New against returning') : ''}</div>`);
  }
  /* ---------- Behaviour, from Microsoft Clarity (account-health clarity.js) ----------
     Clarity's API gives the last 3 days only, 10 reads a project a day, so Locus reads it at most every 8 hours and keeps
     a daily history itself. Recordings and heatmap pictures stay in Clarity: rows link out. */
  const CLAR_COLS = [['rage', 'Rage clicks', 'Sessions with 3+ fast clicks on one spot: something looked clickable and was not, or was slow'], ['dead', 'Dead clicks', 'Sessions with a click that did nothing'], ['quickback', 'Quick backs', 'Sessions that opened a page and went straight back'], ['scroll', 'Scroll depth', 'How far down the page people got, on average'], ['script_error', 'Script errors', 'Sessions with a JavaScript error']];
  async function clarityCard(a, t) {
    const host = document.getElementById('v2clar'); if (!host) return;
    host.innerHTML = skCard(5);
    let r; try { r = await H.apiAH(`/api/clarity?act=${encodeURIComponent(a.act_id)}`); } catch (e) { r = { error: e.message }; }
    if (t !== H.RUN() || !document.getElementById('v2clar')) return;
    const again = () => clarityCard(a, H.RUN());
    if (r.error === 'not_linked') {
      host.innerHTML = cardL('Behaviour: where people get stuck', 'Connect Microsoft Clarity and this card shows, per page, how many sessions hit a rage click, a dead click or a quick back, and how far people scroll, with a link to that page\'s recordings and heatmap.',
        `<div class="lx-clc"><ol class="v2steps"><li>Clarity has to be on the store already (Shopify > Apps > Microsoft Clarity, free).</li><li>In Clarity: Settings > Data Export > <b>Generate new API token</b> (project admins only). Name it Locus-Mobius.</li><li>Paste the token here. The project ID is optional: it makes the recording and heatmap links open the right project (it is the part after /projects/view/ in Clarity's address bar).</li></ol>
        <div class="lx-clf"><label class="kl-f"><b>Clarity API token</b><input type="password" name="tok" autocomplete="off" placeholder="eyJhbGciOi..."></label><label class="kl-f"><b>Project ID <span class="faint">(optional)</span></b><input name="pid" placeholder="abc123xyz"></label><button type="button" class="ds-btn primary" data-clgo>Connect Clarity</button></div><p class="kl-msg" hidden></p>
        <p class="v2hint">What Clarity's API cannot give: the recordings and heatmap pictures themselves (they open in Clarity), and anything older than 3 days (Locus keeps a daily line from the day you connect). It allows 10 reads a day per project; Locus uses at most 4.</p></div>`, 'Microsoft Clarity');
      const b = host.querySelector('[data-clgo]'), msg = host.querySelector('.kl-msg');
      b.onclick = async () => { const tok = host.querySelector('[name="tok"]').value.trim(), pid = host.querySelector('[name="pid"]').value.trim();
        if (!tok) { msg.hidden = false; msg.className = 'kl-msg bad'; msg.textContent = 'Paste the token first.'; return; }
        b.disabled = true; msg.hidden = false; msg.className = 'kl-msg'; msg.textContent = 'Checking the token with one read…';
        try { await H.apiAH('/api/clarity', { method: 'PUT', body: JSON.stringify({ act: a.act_id, token: tok, project: pid }) }); again(); }
        catch (e) { msg.className = 'kl-msg bad'; msg.textContent = e.message; b.disabled = false; } };
      return;
    }
    if (r.error) { host.innerHTML = cardL('Behaviour, from Microsoft Clarity', '', `<p class="v2bad">${esc(r.error)}</p>`); return; }
    const pages = (r.pages || []).filter(x => x.sessions), T = pages.reduce((s, x) => s + x.sessions, 0);
    const wavg = k => { const g = pages.filter(x => x[k] != null); const n = g.reduce((s, x) => s + x.sessions, 0); return n ? g.reduce((s, x) => s + x[k] * x.sessions, 0) / n : null; };
    const big = pages.filter(x => x.sessions >= Math.max(20, T * 0.02));
    const worst = k => big.filter(x => x[k] != null).sort((p1, p2) => p2[k] - p1[k])[0];
    const wr = worst('rage'), wd = worst('dead'), wq = worst('quickback');
    const pc = v => v == null ? '–' : `${(+v).toFixed(1)}%`;
    const proj = r.project, heat = u => proj ? `https://clarity.microsoft.com/projects/view/${encodeURIComponent(proj)}/heatmaps?url=${encodeURIComponent(u)}` : 'https://clarity.microsoft.com/projects', recs = proj ? `https://clarity.microsoft.com/projects/view/${encodeURIComponent(proj)}/impressions` : 'https://clarity.microsoft.com/projects';
    const hist = (r.history || []).filter(h => h.sessions);
    const mini = (k, l, tip) => { const v = k === 'scroll' ? wavg('scroll') : wavg(k); const hs = hist.filter(h => h[k] != null);
      return `<div class="lx-mini"${tipAttr(tip)}><span>${l}</span><b>${pc(v)}</b>${hs.length > 1 ? spark(hs.map(h => h[k]), null, 120, 22, hs.map(h => `<b>${day(h.date)}</b> · ${l.toLowerCase()} ${pc(h[k])}`)) : '<em>a line builds daily</em>'}</div>`; };
    const lead = T ? `${int(T)} sessions on ${pages.length} pages in the last 3 days. ${pc(wavg('rage'))} of sessions hit a rage click, ${pc(wavg('dead'))} a dead click, ${pc(wavg('quickback'))} went straight back.${wr && wr.rage > 0 ? ` Most rage clicks: <b>${esc(pagePath(wr.url))}</b> (${pc(wr.rage)}).` : ''}${wq && wq.quickback > 0 && (!wr || wq.url !== wr.url) ? ` Most quick backs: <b>${esc(pagePath(wq.url))}</b> (${pc(wq.quickback)}).` : ''}` : 'Clarity has no sessions for the last 3 days.';
    const defs = CLAR_COLS.map(([k, l, tip]) => ({ k, l, tip, lo: k !== 'scroll' ? 1 : 0, v: x => x[k], cell: x => { const v = x[k]; if (v == null) return '–'; const avg = wavg(k); const bad = avg != null && x.sessions >= 20 && (k === 'scroll' ? v < avg * 0.75 : v > Math.max(avg * 1.5, avg + 1)); return `<span class="${bad ? 'bad' : ''}"${tipAttr(`${l}: ${pc(v)} of this page's sessions${x[k + '_n'] != null ? ` (${int(x[k + '_n'])} times)` : ''}<br><span class="faint">All pages: ${pc(avg)}</span>`)}>${pc(v)}</span>`; } }))
      .concat([{ k: 'time', l: 'Active time', v: x => x.active_time, cell: x => secs(x.active_time) }]);
    defs.unshift({ k: 'sessions', l: 'Sessions', v: x => x.sessions, cell: x => int(x.sessions) });
    const rows = pages.map(x => ({ ...x, name: x.url }));
    const st = TBL.load('clarity-pages', defs, ['sessions', 'rage', 'dead', 'quickback', 'scroll']);
    const tbl = () => { const cols = TBL.cols(st, defs), by = TBL.cmp(st, defs); const list = by ? rows.slice().sort(by) : rows; const shown = WEBX.clar ? list : list.slice(0, 15);
      return `<table><thead><tr>${TBL.th(st, '_name', 'Page')}${cols.map(d2 => TBL.th(st, d2.k, d2.l)).join('')}<th></th></tr></thead><tbody>${shown.map(x => `<tr><td><span class="nm" title="${esc(x.url)}">${esc(pagePath(x.url))}</span></td>${cols.map(d2 => `<td>${d2.cell(x)}</td>`).join('')}<td class="kl-acts"><a class="kl-act" href="${esc(heat(x.url))}" target="_blank" rel="noopener">Heatmap</a></td></tr>`).join('')}</tbody></table>${list.length > 15 ? `<button type="button" class="v2link" data-wx="clar" style="margin-top:8px">${WEBX.clar ? 'Show the first 15' : `Show all ${list.length}`} ›</button>` : ''}`; };
    host.innerHTML = cardL('Behaviour: where people get stuck', lead,
      `<div class="lx-minis">${mini('rage', 'Rage clicks', CLAR_COLS[0][2])}${mini('dead', 'Dead clicks', CLAR_COLS[1][2])}${mini('quickback', 'Quick backs', CLAR_COLS[2][2])}${mini('scroll', 'Scroll depth', CLAR_COLS[3][2])}</div>
      <div class="v2tbar"><span class="v2tbar-l faint">Red = well above the site's own rate. Heatmap opens Clarity on that page.</span><a class="ds-btn" href="${esc(recs)}" target="_blank" rel="noopener">Open recordings ${window.icon ? window.icon('external-link', { size: 14 }) : ''}</a><div class="hd-period pm v2cols" data-tbl="${st.id}">${TBL.menu(st, defs)}</div></div>
      <div class="v2tbl wide" id="v2clt">${tbl()}</div>
      <p class="v2foot">Microsoft Clarity, ${esc(r.window || 'the last 3 days')}; read ${esc(new Date(r.as_of).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}. Clarity allows 10 reads a day per project; ${int(r.calls_today)} used today.${r.refresh_error ? ` Last refresh: ${esc(r.refresh_error)}` : ''}${proj ? '' : ' <button type="button" class="v2link" data-clpid>Add the project ID for direct links</button>'}</p>`, 'Microsoft Clarity');
    const wrap = host.querySelector('#v2clt');
    const redraw = () => { wrap.innerHTML = tbl(); hook(); };
    const hook = () => { TBL.wire(wrap, st, defs, redraw); const x = wrap.querySelector('[data-wx]'); if (x) x.onclick = () => { WEBX.clar = !WEBX.clar; redraw(); }; };
    hook(); TBL.wire(host.querySelector('.v2tbar'), st, defs, redraw);
    const pb = host.querySelector('[data-clpid]'); if (pb) pb.onclick = () => klModal('Clarity project ID', '<div class="kl-form"><label class="kl-f"><b>Project ID</b><span>Open the project in Clarity and copy the part after /projects/view/ in the address bar, or paste the whole address.</span><input name="pid"></label></div>', 'Save', async ({ w: el, close, msg }) => {
      const v = el.querySelector('[name="pid"]').value.trim(); if (!v) { msg('Paste the ID or the address.', true); return; }
      await H.apiAH('/api/clarity', { method: 'PUT', body: JSON.stringify({ act: a.act_id, project: v }) }); close(); again(); });
  }
  async function website(first) {
    const t = H.RUN(); const a = H.S.accounts.find(x => x.act_id === H.S.act);
    const title = a ? `Website: ${esc(a.name)}` : 'Website';
    if (!a) { $('#main').innerHTML = shell('website', title, card('Pick a brand', '', `<p class="v2hint">Website analytics come from each brand’s own Google Analytics, so they are read one brand at a time. Pick a brand in the menu.</p>`)); return; }
    if (first) $('#main').innerHTML = shell('website', title, skPage({ tiles: 4, lead: true }));
    const w = win(); let d;
    try { d = await H.apiAH(`/api/google/website?act=${encodeURIComponent(a.act_id)}&${w.q}`); } catch (e) { d = { error: e.message }; }
    if (t !== H.RUN()) return;
    if (d.error) { $('#main').innerHTML = shell('website', title, notLinked('ga4', a.name, d.error) + '<div id="v2clar"></div>'); wireGo($('#main')); clarityCard(a, t); return; }
    const c = d.cur || {}, p = d.prev || null, cur = a.currency;
    const site = webCvr(c), rows = d.days || [], prows = d.prev_days || [];
    const big = (d.landing || []).filter(x => x.sessions > (c.sessions || 0) * 0.03);
    const leak = big.map(x => ({ ...x, r: webCvr(x) })).sort((x, y) => x.r - y.r)[0];
    const defs = webDefs(c.sessions || 0, site, cur);
    const tCh = webTable('web-ch', (d.channels || []).map(x => ({ ...x, name: x.group })), defs, ['sessions', 'share', 'eng', 'cvr', 'purch', 'rev'], 'Channel', 'channel', r => `<td><b>${esc(r.name)}</b></td>`, 15);
    const tSrc = webTable('web-src', (d.sources || []).map(x => ({ ...x, name: x.source })), defs, ['sessions', 'eng', 'cvr', 'purch', 'rev'], 'Source / medium', 'source', r => `<td><span class="nm" title="${esc(r.name)}">${esc(r.name)}</span></td>`, 10);
    const tLp = webTable('web-lp', (d.landing || []).map(x => ({ ...x, name: x.page })), defs, ['sessions', 'eng', 'atc', 'cvr', 'rev'], 'Landing page', 'page', r => `<td><span class="nm" title="${esc(r.name)}">${esc(pagePath(r.name))}</span></td>`, 15);
    const sp = (k, fmt, lbl) => tspark(rows, prows, k, fmt, lbl);
    const body = `<p class="v2say lead">${int(c.sessions)} sessions${chip(c.sessions, p?.sessions)}, ${pct(c.engagementRate, 0)} engaged, ${pct(site, 2)} bought${p ? ` (against ${pct(webCvr(p), 2)} before)` : ''}.${leak ? ` The weakest big landing page is <b>${esc(pagePath(leak.page))}</b> at ${pct(leak.r, 2)}.` : ''}</p>
      <div class="v2tiles" id="v2wtiles">${[
        tile({ compact: true, label: 'Sessions', src: 'GA4', value: int(c.sessions), delta: chip(c.sessions, p?.sessions), sub: `${int(c.totalUsers)} people · ${pct(c.totalUsers ? c.newUsers / c.totalUsers : null, 0)} new`, spark: sp('sessions', int, 'sessions') }),
        tile({ compact: true, label: 'Engaged sessions', src: 'GA4', hint: '10s+, 2+ pages or a conversion', value: pct(c.engagementRate, 0), delta: p ? ptDelta(c.engagementRate, p.engagementRate) : '', sub: `avg ${secs(c.averageSessionDuration)} a session`, spark: sp(r => r.sessions ? r.engagedSessions / r.sessions : null, v => pct(v, 0), 'engaged') }),
        tile({ compact: true, label: 'Conversion rate', src: 'GA4', value: pct(site, 2), delta: p ? ptDelta(site, webCvr(p)) : '', sub: `${int(c.ecommercePurchases)} purchases`, spark: sp(r => r.sessions ? r.ecommercePurchases / r.sessions : null, v => pct(v, 2), 'conversion') }),
        tile({ compact: true, label: 'Revenue GA4 sees', src: 'GA4', hint: 'GA4 misses orders; Shopify is the truth', value: kmoney(c.purchaseRevenue, cur), delta: chip(c.purchaseRevenue, p?.purchaseRevenue), sub: 'Store revenue is on Sales', spark: sp('purchaseRevenue', v => kmoney(v, cur), 'revenue') })].join('')}</div>
      ${cardL('From visit to purchase', `${pct(c.sessions ? c.addToCarts / c.sessions : null, 1)} of sessions add to cart, ${pct(c.addToCarts ? c.checkouts / c.addToCarts : null, 0)} of carts reach checkout, ${pct(c.checkouts ? c.ecommercePurchases / c.checkouts : null, 0)} of checkouts buy.`, webFunnel(c, p), 'click a row in the tables below to see any slice’s own funnel')}
      ${rows.length > 1 ? cardL('Sessions by day', '', legend([{ color: '--brand', label: 'Sessions' }, ...(prows.length > 1 && H.S.cmp !== 'none' ? [{ dash: true, label: cmpLabel() }] : [])]) + lineChart('v2web', rows.map(r => ({ ...r, v: r.sessions })), { key: 'v', prev: H.S.cmp !== 'none' ? prows.map(r => ({ ...r, v: r.sessions })) : [], fmt: v => int(v), h: 220 })) : ''}
      ${cardL('Where visitors come from', 'Google’s default channel groups. Conversion is purchases per session; green beats the site average on real traffic.', tCh.block)}
      ${cardL('Landing pages', 'Where sessions start (query strings folded together). Red converts below the site average on real traffic: a page to fix.', tLp.block)}
      ${whoVisits(d, cur)}
      <div id="v2clar"></div>
      ${cardL('Source and medium', 'The raw tags, for checking UTMs.', tSrc.block)}
      ${foot(`Google Analytics 4, property ${esc(d.property)}, ${esc(w.from)} to ${esc(w.to)}${p ? `, against ${esc(w.pf)} to ${esc(w.pt)}` : ''}. GA4 undercounts purchases (consent, ad blockers); store revenue and orders stay Shopify’s on Sales. Refreshed hourly.`)}`;
    $('#main').innerHTML = shell('website', title, body); const root = $('#main'); wireGo(root);
    if (rows.length > 1) wireLine('v2web', rows, { tip: (r, i) => `<b>${day(r.date)}</b> · ${int(r.sessions)} sessions · ${int(r.purchases)} purchases${prows[i] && H.S.cmp !== 'none' ? `<br><span class="faint">${esc(cmpLabel())}: ${int(prows[i].sessions)} sessions</span>` : ''}` });
    const drill = (kind, v) => webDrill(a, w, kind, v, site);
    wireWebTable(root, 'web-ch', tCh, defs, drill); wireWebTable(root, 'web-src', tSrc, defs, drill); wireWebTable(root, 'web-lp', tLp, defs, drill);
    root.querySelectorAll('.lx-who tr[data-wd]').forEach(tr => { tr.onclick = () => drill(tr.dataset.wd, tr.dataset.wv); tr.onkeydown = e => { if (e.key === 'Enter') drill(tr.dataset.wd, tr.dataset.wv); }; });
    /* Tiles open their own drill-down. The listener sits on the tile row (replaced every render) and stops the click
       before the app-wide tile handler, whose glossary panel only said "see Metrics" for these numbers. */
    const tl = root.querySelector('#v2wtiles'); const keys = ['sessions', 'engaged', 'cvr', 'revenue'];
    tl.querySelectorAll('.v2tile').forEach((el, i) => { el.dataset.wm = keys[i]; el.dataset.go = 'website'; el.setAttribute('role', 'button'); el.tabIndex = 0; });
    tl.addEventListener('click', e => { const el = e.target.closest('.v2tile[data-wm]'); if (!el) return; e.stopPropagation(); webMetric(a, d, w, el.dataset.wm); });
    tl.addEventListener('keydown', e => { const el = e.target.closest('.v2tile[data-wm]'); if (el && e.key === 'Enter') webMetric(a, d, w, el.dataset.wm); });
    clarityCard(a, t);
  }
  async function search(first) {
    const t = H.RUN(); const a = H.S.accounts.find(x => x.act_id === H.S.act);
    const title = a ? `Search: ${esc(a.name)}` : 'Search';
    if (!a) { $('#main').innerHTML = shell('search', title, card('Pick a brand', '', `<p class="v2hint">Organic search comes from each brand’s own Search Console. Pick a brand in the menu.</p>`)); return; }
    if (first) $('#main').innerHTML = shell('search', title, skPage({ tiles: 4, lead: true }));
    const w = win(); let d;
    try { d = await H.apiAH(`/api/google/search?act=${encodeURIComponent(a.act_id)}&${w.q}`); } catch (e) { d = { error: e.message }; }
    if (t !== H.RUN()) return;
    if (d.error) { $('#main').innerHTML = shell('search', title, notLinked('gsc', a.name, d.error)); wireGo($('#main')); return; }
    const c = d.cur || {}, p = d.prev || {}, sp = d.split || { brand: {}, other: {} };
    const tot = (sp.brand.clicks || 0) + (sp.other.clicks || 0) || 1;
    const opp = (d.queries || []).filter(q => !q.brand && q.position >= 4 && q.position <= 15 && q.impressions >= 100).sort((x, y) => y.impressions - x.impressions).slice(0, 8);
    const qMx = Math.max(...(d.queries || []).map(q => q.clicks), 1); const rows = (d.days || []).map(r => ({ ...r, ctr: r.impressions ? r.clicks / r.impressions : null }));
    const body = `<p class="v2say lead">${int(c.clicks)} clicks from Google search${chip(c.clicks, p.clicks)}, ${pct((sp.brand.clicks || 0) / tot, 0)} of them from people already searching the brand.${opp.length ? ` ${opp.length} non-brand queries sit just off the top of page one.` : ''}</p>
      <div class="v2tiles" id="v2stiles">${[
        tile({ compact: true, label: 'Clicks', src: 'GSC', value: int(c.clicks), delta: chip(c.clicks, p.clicks), spark: tspark(rows, null, 'clicks', int, 'clicks') }),
        tile({ compact: true, label: 'Impressions', src: 'GSC', value: int(c.impressions), delta: chip(c.impressions, p.impressions), spark: tspark(rows, null, 'impressions', int, 'impressions') }),
        tile({ compact: true, label: 'Click rate', value: pct(c.ctr, 1), delta: chip(c.ctr, p.ctr), spark: tspark(rows, null, 'ctr', v => pct(v, 1), 'click rate') }),
        tile({ compact: true, label: 'Average position', hint: 'lower is better', value: c.position ? c.position.toFixed(1) : '–', delta: chip(c.position, p.position, true), spark: tspark(rows, null, 'position', v => v.toFixed(1), 'position') })].join('')}</div>
      <div class="v2two">${rows.length > 1 ? cardL('Clicks by day', '', lineChart('v2gsc', rows.map(r => ({ ...r, v: r.clicks })), { key: 'v', fmt: v => int(v), h: 220 })) : ''}
        ${cardL('Brand against everything else', 'Brand clicks are people who already know the brand; the rest is search finding new people.', `<div class="v2stackbar"><i style="flex:${sp.brand.clicks || 0};background:var(--brand)"${tipAttr(`Brand: ${int(sp.brand.clicks)} clicks`)}></i><i style="flex:${sp.other.clicks || 0};background:var(--c-tiktok)"${tipAttr(`Non-brand: ${int(sp.other.clicks)} clicks`)}></i></div><div class="v2stacklab"><span><i style="background:var(--brand)"></i>Brand ${int(sp.brand.clicks)} clicks</span><span><i style="background:var(--c-tiktok)"></i>Non-brand ${int(sp.other.clicks)} clicks</span></div>
          ${opp.length ? `<p class="ds-label" style="margin-top:16px">Worth a page or a push</p><div class="v2tbl"><table><thead><tr><th>Query</th><th>Impressions</th><th>Position</th></tr></thead><tbody>${opp.map(q => `<tr><td>${esc(q.query)}</td><td>${int(q.impressions)}</td><td>${q.position.toFixed(1)}</td></tr>`).join('')}</tbody></table></div>` : ''}`)}</div>
      <div class="v2two">${cardL('Top queries', 'The words people typed. Brand queries are marked.', `<div class="v2tbl"><table><thead><tr><th>Query</th><th>Clicks</th><th>Impressions</th><th>Click rate</th><th>Position</th></tr></thead><tbody>${(d.queries || []).slice(0, 25).map(q => `<tr><td>${q.brand ? '<span class="ds-chip lx-chip">brand</span> ' : ''}${esc(q.query)}</td><td>${ib(q.clicks, qMx, q.brand ? '--brand' : '--c-tiktok', int(q.clicks))}</td><td>${int(q.impressions)}</td><td>${pct(q.ctr, 1)}</td><td>${q.position.toFixed(1)}</td></tr>`).join('')}</tbody></table></div>`)}
        ${cardL('Top pages', '', `<div class="v2tbl wide"><table><thead><tr><th>Page</th><th>Clicks</th><th>Position</th></tr></thead><tbody>${(d.pages || []).map(x => `<tr><td><span class="nm" title="${esc(x.page)}">${esc(pagePath(x.page))}</span></td><td>${int(x.clicks)}</td><td>${x.position.toFixed(1)}</td></tr>`).join('')}</tbody></table></div>`)}</div>
      ${foot(`Google Search Console, ${esc(d.site)}, ${esc(w.from)} to ${esc(w.to)}. Search Console lags about two days. Refreshed hourly.`)}`;
    $('#main').innerHTML = shell('search', title, body); const root = $('#main'); wireGo(root);
    if (rows.length > 1) wireLine('v2gsc', rows.map(r => ({ ...r, v: r.clicks })), { tip: r => `<b>${day(r.date)}</b> · ${int(r.clicks)} clicks · ${int(r.impressions)} impressions · position ${r.position ? r.position.toFixed(1) : '–'}` });
    /* Tiles open their own drill-down (the line large + the queries and pages behind the number), not the glossary. */
    const SM = { clicks: ['Clicks', 'clicks', int, false, 'Clicks from Google search results to the site.'], impressions: ['Impressions', 'impressions', int, false, 'Times the site showed in a Google search result.'], ctr: ['Click rate', 'ctr', v => pct(v, 1), false, 'Clicks per impression.'], position: ['Average position', 'position', v => v.toFixed(1), true, 'Where the site sat in results on average; 1 is the top. Lower is better.'] };
    const keys = ['clicks', 'impressions', 'ctr', 'position'], tl = root.querySelector('#v2stiles');
    const open = k => { const [l, f, fmt, lower, means] = SM[k]; const id = 'v2sm' + Math.random().toString(36).slice(2, 7);
      const qs = (d.queries || []).filter(q => q[f] != null).slice().sort((x, y) => lower ? x[f] - y[f] : y[f] - x[f]).filter(q => k === 'position' || k === 'ctr' ? q.impressions >= 50 : true).slice(0, 12);
      const pg = (d.pages || []).filter(x => x[f] != null).slice().sort((x, y) => lower ? x[f] - y[f] : y[f] - x[f]).slice(0, 10);
      panel.sheet = { lead: `<span class="lx-pv-lead">${window.icon ? window.icon('search', { size: 20 }) : ''}</span>`, chip: '<span class="ds-chip">Search Console</span>', navLabel: 'In this drill-down' }; panel.wide = true;
      panel(l, `<section data-sec="The number" data-ic="activity" class="lx-dsec"><div class="lx-dv"><b>${c[f] == null ? '–' : fmt(c[f])}</b>${chip(c[f], p[f], lower)}${p[f] != null ? `<span class="faint">before: ${fmt(p[f])}</span>` : ''}</div><p>${esc(means)}</p></section>
        <section data-sec="Day by day" data-ic="chart-line" class="lx-dsec"><h4>Day by day</h4>${rows.length > 1 ? lineChart(id, rows.map(r => ({ ...r, v: r[f] == null ? null : f === 'ctr' ? r[f] * 100 : r[f] })), { key: 'v', fmt: f === 'ctr' ? v => v.toFixed(1) + '%' : fmt, h: 220 }) : '<p class="v2hint">Pick a longer window.</p>'}</section>
        <section data-sec="Queries" data-ic="search" class="lx-dsec"><h4>${k === 'position' ? 'Best placed queries (50+ impressions)' : k === 'ctr' ? 'Best clicked queries (50+ impressions)' : `Queries by ${l.toLowerCase()}`}</h4><div class="v2tbl"><table><thead><tr><th>Query</th><th>${esc(l)}</th><th>Clicks</th><th>Impressions</th></tr></thead><tbody>${qs.map(q => `<tr><td>${q.brand ? '<span class="ds-chip lx-chip">brand</span> ' : ''}${esc(q.query)}</td><td><b>${fmt(q[f])}</b></td><td>${int(q.clicks)}</td><td>${int(q.impressions)}</td></tr>`).join('')}</tbody></table></div></section>
        ${pg.length ? `<section data-sec="Pages" data-ic="file-text" class="lx-dsec"><h4>Pages by ${l.toLowerCase()}</h4><div class="v2tbl"><table><tbody>${pg.map(x => `<tr><td><span class="nm" title="${esc(x.page)}">${esc(pagePath(x.page))}</span></td><td><b>${fmt(x[f])}</b></td></tr>`).join('')}</tbody></table></div></section>` : ''}`);
      if (rows.length > 1) wireLine(id, rows.map(r => ({ ...r, v: r[f] })), { tip: r => `<b>${day(r.date)}</b> · ${esc(l)} ${r[f] == null ? '–' : fmt(r[f])}` }); };
    tl.querySelectorAll('.v2tile').forEach((el, i) => { el.dataset.wm = keys[i]; el.dataset.go = 'search'; el.setAttribute('role', 'button'); el.tabIndex = 0; });
    tl.addEventListener('click', e => { const el = e.target.closest('.v2tile[data-wm]'); if (!el) return; e.stopPropagation(); open(el.dataset.wm); });
    tl.addEventListener('keydown', e => { const el = e.target.closest('.v2tile[data-wm]'); if (el && e.key === 'Enter') open(el.dataset.wm); });
  }

  /* =========================================================================================
   * CREATIVE > LIBRARY: every image in the brand's Drive, tagged once (account-health assets.js)
   * ======================================================================================= */
  const LIBF = { q: '', people: '', setting: '' };
  async function library(first) {
    const t = H.RUN(); const a = H.S.accounts.find(x => x.act_id === H.S.act);
    const title = a ? `Library: ${esc(a.name)}` : 'Library';
    if (!a) { $('#main').innerHTML = shell('library', title, card('Pick a brand', '', '<p class="v2hint">Each brand has its own photo library, read from its Drive folder. Pick a brand in the menu.</p>')); return; }
    if (first) $('#main').innerHTML = shell('library', title, `<section class="v2card v2sk"><i class="h"></i>${skGal(10)}</section>`);
    const qs = new URLSearchParams({ act: a.act_id, q: LIBF.q, people: LIBF.people === 'locus' ? '' : LIBF.people, source: LIBF.people === 'locus' ? 'locus' : '', setting: LIBF.setting, limit: '200' });
    let d; try { d = await H.apiAH(`/api/assets?${qs}`); } catch (e) { d = { error: e.message }; }
    if (t !== H.RUN()) return;
    if (d.error) { $('#main').innerHTML = shell('library', title, card('The library could not load', '', `<p class="v2bad">${esc(d.error)}</p>`)); return; }
    const c = d.counts || {}, total = (c.tagged || 0) + (c.new || 0), base = H.AH_URL || '';
    const img = x => `${base}/assets-img/${encodeURIComponent(a.act_id)}/${encodeURIComponent(x.file_id)}`;
    const SET = (d.settings || []).filter(s => s.setting);
    const body = `<p class="v2say lead">${int(total - (d.looks || 0))} images from ${esc(a.name)}’s Drive${d.looks ? ` and ${int(d.looks)} made by Locus` : ''}${c.new ? `, ${int(c.new)} still being tagged` : ''}. ${d.synced_at ? `Checked ${esc(new Date(d.synced_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}.` : 'Not read yet.'} New files anywhere in the folder are picked up within the hour.</p>
      <div class="v2libbar"><input type="search" id="libQ" placeholder="Search: man in a polo on a white background, wedge close-up, golf course…" value="${esc(LIBF.q)}">
        <div class="v2jobs">${[['', 'Everything'], ['yes', 'With people'], ['no', 'No people'], ...(d.looks ? [['locus', 'Made by Locus']] : [])].map(([k, l]) => `<button type="button" data-ppl="${k}" class="${LIBF.people === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="v2jobs">${[{ setting: '', n: total }, ...SET].map(s => `<button type="button" data-set="${esc(s.setting)}" class="${LIBF.setting === s.setting ? 'on' : ''}">${esc(s.setting || 'Any setting')}${s.setting ? ` <em>${s.n}</em>` : ''}</button>`).join('')}</div>
        <button type="button" class="v2btn" id="libSync" style="margin:0">Check Drive now</button></div>
      ${(d.items || []).length ? `<div class="v2lib">${d.items.map((x, i) => `<button type="button" class="it" data-i="${i}"${tipAttr(esc(x.descr || x.name))}>${x.thumb_key ? `<img loading="lazy" src="${img(x)}" alt="">` : `<span class="v2hint">Tagging…</span>`}${x.people ? `<em>${x.people} ${x.people === 1 ? 'person' : 'people'}</em>` : ''}${x.source === 'locus' ? '<em style="top:6px;bottom:auto;background:var(--brand);color:var(--on-brand)">Made by Locus</em>' : ''}</button>`).join('')}</div>`
        : card(total ? 'Nothing matches' : 'No images yet', '', `<p class="v2hint">${total ? 'Try fewer words or another filter.' : `Locus reads ${esc(a.name)}’s Drive folder from Brand settings > Integrations. Press Check Drive now to read it.`}</p>`)}
      ${foot('Images stay where they are in Drive; nothing is moved, renamed or copied there. Each new image is tagged once by a small AI model (about a tenth of a cent); after that, searching is free.')}`;
    $('#main').innerHTML = shell('library', title, body); const root = $('#main');
    const q = root.querySelector('#libQ'); let tm = null; q.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { LIBF.q = q.value; library(false); }, 350); };
    root.querySelectorAll('[data-ppl]').forEach(b => b.onclick = () => { LIBF.people = b.dataset.ppl; library(false); });
    root.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { LIBF.setting = b.dataset.set; library(false); });
    root.querySelector('#libSync').onclick = async e => { const b = e.target; b.disabled = true; b.textContent = 'Reading Drive and tagging…'; try { const r = await H.apiAH(`/api/assets/sync?act=${encodeURIComponent(a.act_id)}&tag=30`, { method: 'POST' }); b.textContent = r.sync?.error ? r.sync.error : `Found ${int(r.sync?.files)} images; tagged ${int(r.tag?.tagged)} more`; setTimeout(() => library(false), 1200); } catch (err) { b.textContent = err.message; } };
    /* Studio's Dress step and "Use as the ad" (studio.js, 2026-10-08). A look (made by Locus) shows how it was made instead of a Drive link. */
    const st = { tok: H.S.tok, url: H.S.url, act: a.act_id };
    root.querySelectorAll('.v2lib .it').forEach(el => el.onclick = () => { const x = d.items[+el.dataset.i], L = x.look || null, ck = L?.check;
      const go = (k, b, s) => `<button type="button" class="v2go" data-lk="${k}"><b>${b}</b><span>${s}</span><i>›</i></button>`;
      const pb = panel(x.name, `<div class="v2pv"><div class="v2pv-m" style="background-image:url('${img(x)}')"></div>
        ${L ? `<p class="v2say"><span class="v2pill good">Made by Locus</span> ${esc(L.product || 'The product')} put on ${esc(L.base_name || 'a real photo')} by the image AI. The person, pose and light are the original photo’s.</p>` : ''}
        <p class="v2say">${esc(x.descr || '')}</p>
        <div class="v2kv">${L ? `<span>Made from</span><b>${esc(L.base_name || '–')}</b><span>Product check</span><b>${ck ? `${ck.score}/10${ck.issue ? `, ${esc(ck.issue)}` : ''}${ck.person_kept === false ? '; the person may have changed' : ''}` : 'not checked'}</b><span>Cost</span><b>$${(+L.cost || 0).toFixed(2)}</b>${L.note ? `<span>Note</span><b>${esc(L.note)}</b>` : ''}` : `<span>Folder</span><b>${esc(x.path || 'top folder')}</b>`}<span>People</span><b>${int(x.people)}</b><span>Setting</span><b>${esc(x.setting || '–')}</b><span>Shot</span><b>${esc(x.shot || '–')}</b>${x.products ? `<span>Products</span><b>${esc(x.products)}</b>` : ''}${x.colors ? `<span>Colours</span><b>${esc(x.colors)}</b>` : ''}${x.w ? `<span>Size</span><b>${x.w} × ${x.h}</b>` : ''}</div>
        <div class="v2gos">${L ? `${go('use', 'Use as the ad', 'Put it on a line of a Studio batch. The words go on; the photo stays as it is.')}${go('dress', 'Dress it again', 'Start from this look with another product.')}${go('rm', 'Remove from the library', 'Only this look. Nothing in Drive is touched.')}`
          : `${x.people ? go('dress', 'Dress with a product', 'Put one of the brand’s products on this person. Their face, pose and light stay as shot. About 12¢.') : ''}<a class="v2go" href="https://drive.google.com/file/d/${esc(x.file_id)}/view" target="_blank" rel="noopener"><b>Open in Drive</b><span>The original, full size.</span><i>↗</i></a>`}</div></div>`);
      const S2 = window.StudioTab;
      pb.querySelectorAll('[data-lk]').forEach(b => b.onclick = async () => {
        const k = b.dataset.lk;
        if (!S2?.dress) { b.querySelector('span').textContent = 'Studio did not load. Refresh the page.'; return; }
        if (k === 'dress') { await S2.dress({ ...st, base: { item: x, url: L?.url || '', name: x.name, thumb: img(x), asset: x.file_id, made: !!L } }); return library(false); }
        if (k === 'use') return S2.useAsAd({ ...st, image: L.url });
        if (k === 'rm') {
          if (!b.dataset.sure) { b.dataset.sure = '1'; b.querySelector('b').textContent = 'Press again to remove it'; return; }
          b.disabled = true; try { await H.apiAH(`/api/assets/remove?act=${encodeURIComponent(a.act_id)}`, { method: 'POST', body: JSON.stringify({ id: x.file_id }) }); document.getElementById('v2scrim')?.click(); library(false); } catch (e) { b.querySelector('span').textContent = e.message; b.disabled = false; }
        }
      }); });
  }

  /* Shared building blocks for every other screen file (brand.js, studio.js, meta.js, season.js,
     amb.js, index.html renderers), so the whole app draws tiles, cards, charts and tooltips one way.
     None of these read the host state; `chip(cur, prev, lower)` is the delta pill without the
     compare-period switch (lower = true when lower is better, 'n' = neutral). */
  const chip = (cur, prev, lower, label) => { if (cur == null || prev == null || !isFinite(cur) || !isFinite(prev) || !prev) return ''; const d = cur / prev - 1; if (!isFinite(d)) return ''; const tone = Math.abs(d) < 0.015 || lower === 'n' ? 'flat' : ((d > 0) !== !!lower) ? 'up' : 'down'; return `<span class="v2d ${tone}"${label ? tipAttr(label) : ''}>${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d * 100))}%</span>`; };
  window.V2UI = { addBands, markDots, clearDots, tile, card, spark, bullet, ib, legend, lineChart, wireLine, stackChart, wireStack, panel, tipAttr, foot, chip, esc, kmoney, money, money2, pct, x2, int, day,
    setHost: h => { if (!H) H = h; } };

  window.V2 = {
    adsBlock,
    render(tab, host, first) {
      H = host;
      if (tab === 'overview') return home(first);
      if (tab === 'meta') return meta(first, 'overview');
      if (tab === 'campaigns') return meta(first, 'campaigns');
      if (tab === 'adcreative') return creative(first);
      if (tab === 'google' || tab === 'tiktok') return platform(tab, first);
      if (tab === 'gcampaigns') return gcampaigns(first);
      if (tab === 'gads') return gads(first);
      if (tab === 'gterms') return gterms(first);
      if (tab === 'gchanges') return gchanges(first);
      if (tab === 'channels') return channels(first);
      if (tab === 'store') return store(first);
      if (tab === 'email') return email(first);
      if (tab === 'website') return website(first);
      if (tab === 'inspo') return inspo(first);
      if (tab === 'library') return library(first);
      if (tab === 'search') return search(first);
    },
    MODEL_SHORT,
  };
})();
