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
  function tipAt(e, html) { const t = tipEl(); t.innerHTML = html; t.style.display = 'block'; const w = t.offsetWidth, h = t.offsetHeight; let x = e.clientX + 14, y = e.clientY + 16; if (x + w > innerWidth - 8) x = e.clientX - w - 14; if (y + h > innerHeight - 8) y = e.clientY - h - 12; t.style.left = x + 'px'; t.style.top = y + 'px'; }
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
  if (!window.__v2tiledrill) { window.__v2tiledrill = 1;
    document.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('.v2tile'); if (!t || t.dataset.go || e.target.closest('a,button,input,select,[data-go]')) return;
      const label = (t.querySelector('.l span') || t.querySelector('.l') || t).childNodes[0]?.textContent?.trim() || 'This number';
      const sp = t.querySelector('svg.v2spark,svg[data-spk]');
      const big = sp ? sp.outerHTML.replace('class="v2spark"', 'class="v2spark v2spark-big"').replace(/viewBox="0 0 (\d+) (\d+)"/, (m, w, h) => `viewBox="0 0 ${w} ${h}"`) : '';
      const L = label.toLowerCase(), GL = window.GLOSSARY || [], ALIAS = { spend: 'ad spend', 'blended ad spend': 'ad spend', 'cost per purchase': 'cpa', 'cost per new customer': 'cac', purchases: 'orders', 'average order': 'aov', 'first orders': 'new customers' };
      const want = ALIAS[L] || L; const g = GL.find(x => x.k.toLowerCase() === want) || GL.find(x => x.k.toLowerCase().includes(want) || want.includes(x.k.toLowerCase()));
      const v = t.querySelector('.v'), sub = t.querySelector('.sub'), bul = t.querySelector('.v2bul');
      panel(label, `<div class="v2drill"><div class="dv">${v ? v.innerHTML : ''}</div>${sub ? `<p class="v2hint">${sub.innerHTML}</p>` : ''}${bul ? bul.outerHTML : ''}
        ${big ? `<h4>Day by day</h4><p class="v2hint">Hover the line to read each day. The dashed line is the compare period.</p>${big}` : ''}
        ${g ? `<h4>What it means</h4><p>${g.one}</p><h4>How it is worked out</h4><p>${g.f}</p><h4>What good looks like</h4><p>${g.good}</p>${g.moves ? `<h4>When it moves</h4><p>${g.moves}</p>` : ''}` : `<p class="v2hint">Open <b>Metrics</b> at the top of the page for every number's meaning.</p>`}</div>`);
    });
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
      const close = () => { p.classList.remove('on'); document.getElementById('v2scrim').classList.remove('on'); };
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
    nav.onclick = e => { const b = e.target.closest('[data-sec-i]'); if (!b) return; const t = secs[+b.dataset.secI]; pb.scrollTo({ top: t.offsetTop - 8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
    pb.onscroll = secs.length > 1 ? () => { let k = 0; secs.forEach((x, i) => { if (x.offsetTop - 48 <= pb.scrollTop) k = i; }); nav.querySelectorAll('[data-sec-i]').forEach((b, i) => b.classList.toggle('on', i === k)); } : null;
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
      ${x.headline || x.body ? `<div class="v2copy" data-sec="Ad copy" data-ic="file-text">${x.headline ? `<b>${esc(x.headline)}</b>` : ''}${x.body ? `<p>${esc(x.body)}</p>` : ''}</div>` : ''}
      <div class="v2gos" data-sec="Next steps" data-ic="sparkles">${a.media_type !== 'video' && window.StudioTab && window.StudioTab.fromAd ? `<button type="button" class="v2go" data-studio="1"><b>Make iterations in Studio</b><span>This ad's image goes on a line of a Studio batch, so Studio makes new versions from it.</span><i>${ICN('chevron-right')}</i></button>` : ''}<button type="button" class="v2go" data-more="1"><b>Make more like this</b><span>The Strategist drafts an Asana brief for three iterations of this ad.</span><i>${ICN('chevron-right')}</i></button></div>
      <p class="v2hint">${esc(MODEL_SHORT[H.S.model] || '')} for purchases and revenue; delivery is Meta's.</p></div></div>`);
    body.querySelector('[data-more]').onclick = () => { const brand = (H.S.accounts.find(z => z.act_id === H.S.act) || {}).name || 'this brand'; H.AskUI.ask(`For ${brand}: draft an Asana brief for three iterations of the ad "${a.name}" (ad id ${a.id}). It spent ${kmoney(a.spend, cur)} at ${money(a.cpa, cur)} per purchase${g.cpa ? ` against a ${money(g.cpa, cur)} goal` : ''}, hook ${pct(a.hook, 0)}, hold ${pct(a.hold, 0)}. Keep what works, change one thing per iteration, and say which test it is.`); };
    loadThumbs(body, [a.id]).then(() => { const y = ASSETS.get(a.id) || {}; const lt = document.querySelector('#v2panel .plead-th'); if (lt && THUMBS.has(a.id)) lt.style.backgroundImage = `url('${THUMBS.get(a.id)}')`; const cp = body.querySelector('.v2copy'); if (!cp && (y.headline || y.body)) body.querySelector('.v2kv').insertAdjacentHTML('afterend', `<div class="v2copy">${y.headline ? `<b>${esc(y.headline)}</b>` : ''}${y.body ? `<p>${esc(y.body)}</p>` : ''}</div>`); });
    body.querySelector('[data-orders]').onclick = () => drillOrders(a.name, `ad=${encodeURIComponent(a.id)}`);
    const stu = body.querySelector('[data-studio]');
    if (stu) stu.onclick = async () => { const sp = stu.querySelector('span'), was = sp.textContent; sp.textContent = 'Bringing the image into Studio…'; stu.disabled = true;
      try { await window.StudioTab.fromAd({ tok: H.S.tok, url: H.S.url, act: H.S.act, ad: a.id }); sp.textContent = was; } catch (e) { sp.textContent = e.message; } stu.disabled = false; };
    const brk = body.querySelector('[data-brk]');
    if (brk) brk.onclick = async () => { const box = body.querySelector('#v2brk'); box.innerHTML = '<p class="v2hint">Asking Meta…</p>';
      try { const w = CR_WIN || {}; const r = await H.apiAH(`/api/ad-breakdown?ad=${encodeURIComponent(a.id)}&from=${w.from}&to=${w.to}`); box.innerHTML = breakdownHtml(r, cur); }
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
    panel.wide = true;
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
    const brandTable = !one && all.length > 1 ? card('Each brand', '', `<div class="v2tbl"><table><thead><tr><th>Brand</th><th>By day</th><th>Revenue</th><th>MTD vs plan</th><th>Ad spend</th><th>MER</th><th>New %</th><th>CAC</th><th>Contribution</th></tr></thead><tbody>
        ${all.slice().sort((x, y) => (y.window?.sales || 0) - (x.window?.sales || 0)).map(a => { const w = a.window || {}; const off = a.plan?.sales && a.mtd?.sales != null ? a.mtd.sales / a.plan.sales - 1 : null;
          return `<tr data-act="${esc(a.act_id)}" tabindex="0" class="link"><td><b>${esc(a.name)}</b></td><td>${sparkRow(a)}</td><td>${kmoney(w.sales, a.currency)} ${a.prev ? delta(w.sales, a.prev.sales) : ''}</td><td>${off == null ? '<span class="faint">no plan</span>' : `<span class="v2pill ${off >= 0 ? 'good' : off > -0.08 ? 'warn' : 'bad'}">${off >= 0 ? '+' : ''}${Math.round(off * 100)}%</span>`}</td>
            <td>${kmoney(w.spend, a.currency)}</td><td>${x2(w.mer)}</td><td>${pct(w.new_share, 0)}</td><td>${money(w.cac, a.currency)}</td><td class="${w.cm == null ? '' : w.cm >= 0 ? 'good' : 'bad'}">${a.cost_health?.verdict === 'broken' ? '<span class="faint">cost data</span>' : kmoney(w.cm, a.currency)}</td></tr>`; }).join('')}
      </tbody></table></div>`) : '';

    $('#main').innerHTML = shell('overview', title, `<div id="v2moved"></div><div id="v2needs"></div><div id="v2cal"></div>${readSlot('v2read')}${tiles}
      <div class="v2two">${chart}${funnel}</div>${chTable}${brandTable}
      ${foot(`Revenue, orders, AOV, first orders and the compare deltas come from Shopify through Triple Whale for ${esc(H.rangeLabel())}. Channel revenue follows the attribution switch. Click any tile to open its screen.`)}`);
    const root = $('#main');
    wireGo(root); wireRows(root, 'overview');
    movedCard(scope);
    if (window.DeskTab && window.DeskTab.needs) window.DeskTab.needs(document.getElementById('v2needs'), H, all);
    /* The calendar (2026-10-09): what is live and coming up, and each date as a shaded band on the revenue chart. */
    if (window.CalendarTab) {
      window.CalendarTab.homeCard(document.getElementById('v2cal'), H);
      if (rows.length > 1) window.CalendarTab.bandsFor(H.S.act || 'all', rows[0].date, rows[rows.length - 1].date, H).then(b => addBands('v2rev', rows, b)).catch(() => {});
    }
    if (rows.length > 1) wireLine('v2rev', rows, { tip: (r, i) => `<b>${day(r.date)}</b> · revenue ${kmoney(r.sales, cur)} · spend ${kmoney(r.spend, cur)}${r.spend ? ` · MER ${x2(r.sales / r.spend)}` : ''}${prev[i] ? `<br><span class="faint">${esc(cmpLabel())}: ${kmoney(prev[i].sales, cur)} on ${day(prev[i].date)}</span>` : ''}` });
    if (false && chSeries.length > 1) wireStack('v2pstack', chSeries, [{ key: 'meta', label: 'Meta', color: '--c-meta' }, { key: 'google', label: 'Google', color: '--c-google' }, { key: 'tiktok', label: 'TikTok', color: '--c-tiktok' }], cur);
    if (cur && c.sales != null) fillRead('v2read', 'overview', scope, { currency: cur, revenue: c.sales, revenue_compare: p.sales, orders: c.orders, aov: c.aov, ad_spend: c.spend, ad_spend_compare: p.spend, mer: c.mer, mer_goal: goalMer, cac: c.cac, cac_compare: p.cac, cac_goal: goalCac, new_customer_share: c.newShare, contribution_margin: c.cm,
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
    const pend = window.V2PENDING; if (pend && pend.campaign) { CAMP_OPEN.add(pend.campaign); window.V2PENDING = null; setTimeout(() => { const tr = document.querySelector(`#v2camptbl tr[data-campaign="${CSS.escape(pend.campaign)}"]`); if (tr) { tr.scrollIntoView({ block: 'center' }); tr.classList.add('v2flash'); } }, 50); }
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
  const CAMP_OPEN = new Set();
  function campTable(b, cur, full) {
    const camps = b.campaigns || []; const mx = Math.max(...camps.map(x => x.spend), 1); const g = b.goals || {};
    const cpaCls = v => !g.cpa || v == null ? '' : v <= g.cpa ? 'good' : v <= g.cpa * 1.3 ? 'warn' : 'bad';
    const row = (x, lvl, kind) => `<tr class="lvl${lvl}" data-${kind}="${esc(x.id)}">
      <td>${lvl < 2 ? `<button type="button" class="v2ex${CAMP_OPEN.has(x.id) ? ' open' : ''}" data-tog="${esc(x.id)}" aria-label="Show what is inside">›</button>` : `<button type="button" class="v2th" data-prev="${esc(x.id)}" data-thumb="${esc(x.id)}" aria-label="Preview this ad"${THUMBS.has(x.id) ? ` style="background-image:url('${THUMBS.get(x.id)}')"` : ''}></button>`}<span class="nm${lvl === 2 ? ' v2open' : ''}" title="${esc(x.name)}"${lvl === 2 ? ` data-prev="${esc(x.id)}"` : ''}>${esc(x.name)}</span>${x.status && !/ACTIVE/.test(x.status) ? ` <span class="v2pill">${esc(x.status.toLowerCase().replace(/_/g, ' '))}</span>` : ''}${lvl === 0 && x.objective ? `<span class="sub">${esc(x.objective.replace('OUTCOME_', '').toLowerCase())}${x.budget ? ` · ${money(x.budget, cur)}/day` : ''}</span>` : ''}${lvl === 1 && (x.budget || x.min_spend) ? `<span class="sub">${x.budget ? `${money(x.budget, cur)}/day` : ''}${x.min_spend ? ` · min ${money(x.min_spend, cur)}` : ''}</span>` : ''}</td>
      <td>${ib(x.spend, mx, null, kmoney(x.spend, cur))}</td>
      <td><button type="button" class="v2cell" data-drill="${kind}:${esc(x.id)}" title="See the orders">${int(x.purchases)}</button></td>
      ${isPlat() ? '' : `<td class="faint">${int(x.platform_purchases)}</td>`}
      <td>${kmoney(x.revenue, cur)}</td><td>${x2(x.roas)}</td><td class="${cpaCls(x.cpa)}">${money(x.cpa, cur)}${x.prev && x.prev.cpa ? delta(x.cpa, x.prev.cpa, true) : ''}</td>
      <td>${money2(x.cpm, cur)}</td><td>${pct(x.ctr, 2)}</td><td>${x.frequency ? x.frequency.toFixed(2) : '–'}</td><td>${pct(x.hook, 0)}</td><td>${pct(x.hold, 0)}</td></tr>`;
    let rows = '';
    for (const cp of camps) { rows += row(cp, 0, 'campaign'); if (CAMP_OPEN.has(cp.id)) for (const s of cp.adsets) { rows += row(s, 1, 'adset'); if (CAMP_OPEN.has(s.id)) for (const a of s.ads.slice(0, 25)) rows += row(a, 2, 'ad'); } }
    const c = b.cur;
    rows += `<tr class="tot"><td>All campaigns</td><td>${kmoney(c.spend, cur)}</td><td>${int(c.purchases)}</td>${isPlat() ? '' : `<td class="faint">${int(c.platform_purchases)}</td>`}<td>${kmoney(c.revenue, cur)}</td><td>${x2(c.roas)}</td><td>${money(c.cpa, cur)}</td><td>${money2(c.cpm, cur)}</td><td>${pct(c.ctr, 2)}</td><td>${c.frequency ? c.frequency.toFixed(2) : '–'}</td><td>${pct(c.hook, 0)}</td><td>${pct(c.hold, 0)}</td></tr>`;
    return card(full ? 'Campaigns, ad sets and ads' : 'Campaigns', `${camps.length} campaign${camps.length === 1 ? '' : 's'} spent in this window. Open one for its ad sets, an ad set for its ads.`,
      `<div class="v2tbl wide"><table id="v2camptbl"><thead><tr><th>Campaign</th><th>Spend</th><th>Purchases</th>${isPlat() ? '' : '<th>Meta says</th>'}<th>Revenue</th><th>ROAS</th><th>CPA</th><th>CPM</th><th>CTR</th><th>Freq.</th><th>Hook</th><th>Hold</th></tr></thead><tbody>${rows}</tbody></table></div>`, `Attribution: <b>${esc(MODEL_SHORT[H.S.model])}</b>`);
  }
  function wireCamp(root, b, cur) {
    const adsById = new Map(); for (const cp of b.campaigns || []) for (const st of cp.adsets || []) for (const a of st.ads || []) adsById.set(a.id, a);
    MED = medians([...adsById.values()], (b.goals || {}).cpa || 50);
    root.querySelectorAll('#v2camptbl [data-prev]').forEach(el => el.onclick = e => { e.stopPropagation(); const a = adsById.get(el.dataset.prev); if (a) previewAd(a, cur, b.goals); });
    loadThumbs(root, [...root.querySelectorAll('#v2camptbl [data-thumb]')].map(x => x.dataset.thumb));
    root.querySelectorAll('[data-tog]').forEach(btn => btn.onclick = e => { e.stopPropagation(); const id = btn.dataset.tog; CAMP_OPEN.has(id) ? CAMP_OPEN.delete(id) : CAMP_OPEN.add(id); const tb = root.querySelector('#v2camptbl'); if (!tb) return; const host = tb.closest('.v2card'); host.outerHTML = campTable(b, cur, H.S.tab === 'campaigns'); wireCamp(root, b, cur); });
    root.querySelectorAll('[data-drill]').forEach(btn => btn.onclick = e => { e.stopPropagation(); const [k, id] = btn.dataset.drill.split(':'); const name = btn.closest('tr').querySelector('.nm')?.textContent || ''; drillOrders(name, `${k === 'campaign' ? 'campaign' : k === 'adset' ? 'adset' : 'ad'}=${encodeURIComponent(id)}`); });
    /* Stock on the ad set and the ad (supply.js): "Stock runs out Nov 27", "Stock OK to scale". */
    if (window.SupplyStock && H.S.act !== 'all') window.SupplyStock.decorate(root, H.S.act);
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
    if (!a) { $('#main').innerHTML = shell('adcreative', 'Creative', `<div class="v2card"><p class="v2hint">Pick one brand in the menu to see its creative.</p></div>`); return; }
    const title = `Creative: ${esc(a.name)}`;
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
    /* Quadrant: spend (x, log) against CPA (y), bubble = purchases, goal line. */
    const quad = (() => {
      const w = 560, h = 330, pl = 58, pr = 14, pt = 14, pb = 40; const pts = top.filter(r => r.spend > 0);
      if (pts.length < 3) return '<p class="v2hint">Not enough ads with spend.</p>';
      const sx = Math.log10(Math.max(...pts.map(r => r.spend))), sx0 = Math.log10(Math.max(1, Math.min(...pts.map(r => r.spend))));
      const cpas = pts.map(r => r.cpa ?? (goal ? goal * 3 : 0)); const ymx = Math.min(Math.max(...cpas, goal || 0) * 1.1, (goal || Math.max(...cpas)) * 4);
      const X = v => pl + (Math.log10(Math.max(1, v)) - sx0) / Math.max(0.3, sx - sx0) * (w - pl - pr), Y = v => pt + (1 - Math.min(v, ymx) / ymx) * (h - pt - pb);
      const col = r => ({ scale: '--good', keep: '--c-meta', watch: '--warn', trim: '--warn', cut: '--bad', thin: '--v2-cmp', new: '--v2-cmp', nogoal: '--v2-cmp' })[verdict(r)];
      const grid = [0.25, 0.5, 0.75, 1].map(f => `<line x1="${pl}" x2="${w - pr}" y1="${Y(ymx * f)}" y2="${Y(ymx * f)}" stroke="var(--v2-grid)"/><text x="${pl - 7}" y="${Y(ymx * f) + 4}" font-size="12.5" text-anchor="end" fill="var(--muted)">${money(ymx * f, cur)}</text>`).join('');
      const xt = [10, 100, 1000, 10000, 100000].filter(v => Math.log10(v) >= sx0 && Math.log10(v) <= sx + 0.1).map(v => `<text x="${X(v)}" y="${h - 20}" font-size="12.5" text-anchor="middle" fill="var(--muted)">${kmoney(v, cur)}</text>`).join('');
      const dots = pts.map((r, i) => `<circle data-i="${i}" cx="${X(r.spend).toFixed(1)}" cy="${Y(r.cpa ?? ymx).toFixed(1)}" r="${(5 + Math.sqrt(r.purchases || 0) * 2.4).toFixed(1)}" style="cursor:pointer" fill="var(${col(r)})" fill-opacity=".55" stroke="var(${col(r)})" stroke-width="1.2"/>`).join('');
      return `<div class="v2chart"><svg id="v2quad" viewBox="0 0 ${w} ${h}">${grid}${xt}${goal ? `<line x1="${pl}" x2="${w - pr}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="var(--brand)" stroke-dasharray="4 4"/><text x="${w - pr}" y="${Y(goal) - 7}" font-size="13" font-weight="600" text-anchor="end" fill="var(--brand)">goal ${money(goal, cur)}</text>` : ''}
        <text x="${pl}" y="${h - 2}" font-size="12.5" fill="var(--muted)">Spend in the window, log scale →</text><text x="14" y="${pt + 4}" font-size="12.5" fill="var(--muted)" transform="rotate(-90 14 ${pt + 4})" text-anchor="end">Cost per purchase</text>${dots}</svg><div class="v2tip"></div></div>`;
    })();
    const hookhold = (() => {
      const w = 560, h = 330, pl = 50, pr = 14, pt = 14, pb = 40; const pts = top.filter(r => r.hook != null && r.hold != null && r.spend > 20);
      if (pts.length < 3) return '<p class="v2hint">Not enough video ads with spend.</p>';
      const hx = Math.max(...pts.map(r => r.hook)) * 1.1, hy = Math.max(...pts.map(r => r.hold)) * 1.1;
      const X = v => pl + v / hx * (w - pl - pr), Y = v => pt + (1 - v / hy) * (h - pt - pb);
      const mh = pts.reduce((s, r) => s + r.hook, 0) / pts.length, mo = pts.reduce((s, r) => s + r.hold, 0) / pts.length;
      const gx = [0.25, 0.5, 0.75, 1].map(f => `<text x="${X(hx * f / 1.1)}" y="${h - 20}" font-size="12.5" text-anchor="middle" fill="var(--muted)">${pct(hx * f / 1.1, 0)}</text>`).join('') + [0.25, 0.5, 0.75, 1].map(f => `<text x="${pl - 7}" y="${Y(hy * f / 1.1) + 4}" font-size="12.5" text-anchor="end" fill="var(--muted)">${pct(hy * f / 1.1, 0)}</text>`).join('');
      return `<div class="v2chart"><svg id="v2hh" viewBox="0 0 ${w} ${h}">${gx}<line x1="${X(mh)}" x2="${X(mh)}" y1="${pt}" y2="${h - pb}" stroke="var(--line-strong)" stroke-dasharray="3 4"/><line x1="${pl}" x2="${w - pr}" y1="${Y(mo)}" y2="${Y(mo)}" stroke="var(--line-strong)" stroke-dasharray="3 4"/>
        <text x="${w - pr}" y="${pt + 12}" font-size="12.5" font-weight="600" text-anchor="end" fill="var(--good)">stops the scroll and keeps them</text><text x="${pl + 6}" y="${h - pb - 8}" font-size="12.5" fill="var(--muted)">loses them early</text>
        <text x="${pl}" y="${h - 2}" font-size="12.5" fill="var(--muted)">Hook rate: 3-second plays per impression →</text><text x="14" y="${pt + 4}" font-size="12.5" fill="var(--muted)" transform="rotate(-90 14 ${pt + 4})" text-anchor="end">Hold rate</text>
        ${pts.map((r, i) => `<circle data-i="${i}" cx="${X(r.hook).toFixed(1)}" cy="${Y(r.hold).toFixed(1)}" r="${(5 + Math.sqrt(r.spend) / 7).toFixed(1)}" fill="var(${({ scale: '--good', keep: '--c-meta', watch: '--warn', trim: '--warn', cut: '--bad' })[verdict(r)] || '--v2-cmp'})" fill-opacity=".5" stroke="var(${({ scale: '--good', keep: '--c-meta', watch: '--warn', trim: '--warn', cut: '--bad' })[verdict(r)] || '--v2-cmp'})"/>`).join('')}</svg><div class="v2tip"></div></div>`;
    })();
    const fat = d.fatigue || []; const fmx = Math.max(...fat.map(f => f.cpa || 0), goal || 0, 1);
    const fatigue = `<div class="v2bars">${fat.map(f => `<div class="b"${tipAttr(`<b>${esc(f.label)}</b> · ${money(f.cpa, cur)} per purchase on ${kmoney(f.spend, cur)}${goal ? ` · goal ${money(goal, cur)}` : ''}`)}><div class="col"><i style="height:${f.cpa ? (f.cpa / fmx * 100).toFixed(1) : 0}%;background:${goal && f.cpa > goal * 1.3 ? 'var(--bad)' : goal && f.cpa > goal ? 'var(--warn)' : 'var(--good)'}"></i>${goal ? `<b style="bottom:${(goal / fmx * 100).toFixed(1)}%"></b>` : ''}</div><span class="v">${money(f.cpa, cur)}</span><span class="l">${esc(f.label)}</span><span class="s">${kmoney(f.spend, cur)}</span></div>`).join('')}</div>`;
    const firstFat = fat.find((f, i) => i > 0 && goal && f.cpa > goal * 1.2 && f.spend > 100);
    const wk = d.weeks || []; const wmx = Math.max(...wk.map(x => x.launched), 1);
    const cadence = `<div class="v2bars cad">${wk.map(x => `<div class="b"${tipAttr(`<b>Week of ${day(x.week)}</b> · ${x.launched} new ads · ${pct(x.fresh_share, 0)} of spend on ads under 14 days old`)}><div class="col"><i style="height:${(x.launched / wmx * 100).toFixed(1)}%;background:var(--brand)"></i></div><span class="v">${x.launched}</span><span class="l">${day(x.week)}</span><span class="s">${pct(x.fresh_share, 0)} fresh</span></div>`).join('')}</div>`;
    const roll = (list, label) => { const mx = Math.max(...list.map(x => x.spend), 1); return `<div class="v2tbl"><table><thead><tr><th>${label}</th><th>Ads</th><th>Spend</th><th>ROAS</th><th>CPA</th><th>CTR</th><th>Hook</th></tr></thead><tbody>${list.slice(0, 10).map(x => `<tr><td><b>${esc(x.key)}</b></td><td>${x.ads}</td><td>${ib(x.spend, mx, null, kmoney(x.spend, cur))}</td><td>${x2(x.roas)}</td><td class="${!goal || x.cpa == null ? '' : x.cpa <= goal ? 'good' : x.cpa <= goal * 1.3 ? 'warn' : 'bad'}">${money(x.cpa, cur)}</td><td>${pct(x.ctr, 2)}</td><td>${pct(x.hook, 0)}</td></tr>`).join('')}</tbody></table></div>`; };
    /* SORT THE GALLERY BY ANY NUMBER (Cole, 2026-10-09: "it only shows by spend"). A ratio sort only
       ranks ads that have spent the judging bar (the same bar the calls use), or one lucky sale on $12
       tops every list; hook and hold rank video ads only. */
    /* SAY WHERE THE BAR COMES FROM (Cole, 2026-10-09: "it just auto goes to $50, why?"). It is the goal
       CPA x "judge after" from Settings > Goals (the one place goals live); with no goal it is the
       account's average CPA, and with no sales either it is a $50 placeholder. */
    const basis = g.cpa ? `: ${K.jx}x the ${money(g.cpa, cur)} goal CPA.`
      : goal ? `: ${K.jx}x this account's ${money(goal, cur)} average CPA, because no goal CPA is set.`
      : `. That is a placeholder: no goal CPA is set and nothing has sold yet.`;
    const barLine = `<p class="v2sortbar">An ad is judged, and ranked on ROAS, CPA, hook, hold and CTR, once it has spent <b>${money(bar, cur)}</b>${basis} <button type="button" class="v2link" data-goals="1">${g.cpa ? 'Change it' : 'Set the goal CPA'} ›</button></p>`;
    const SORTS = SORT_DEF;
    if (!SORTS.some(s => s[0] === CR_SORT)) CR_SORT = 'spend';
    /* What the gallery shows: each ad, or one card per creative, then the tag filter. */
    const base = () => { let L = CR_GROUP ? groupAds(ads) : ads; if (CR_TAG) L = L.filter(r => r.tags && r.tags[CR_TAG.k] === CR_TAG.v); return L; };
    const sorted = () => sortAds(base(), CR_SORT, bar);
    CR_WIN = d.window || null; CR_PICK.clear(); CR_TAG = null;
    /* The brand's average drop-off, for the dashed line in the preview: mean of each judged video's curve, relative to 3-second viewers. */
    CR_MEDC = (() => { const cs = ads.filter(r => r.curve && r.curve[0] && r.spend >= bar).map(r => { const pk = Math.max(...r.curve.map(v => v || 0)) || 1; return r.curve.map(v => (v || 0) / pk); }); return cs.length >= 3 ? [0, 1, 2, 3, 4].map(i => cs.reduce((x, c) => x + c[i], 0) / cs.length) : null; })();
    const galItem = r => { const v = verdict(r); return `<div class="g${CR_PICK.has(r.id) ? ' picked' : ''}" data-ad="${esc(r.id)}"><div class="th" data-thumb="${esc(r.id)}" data-prev="${esc(r.id)}" role="button" tabindex="0" aria-label="Preview ${esc(r.name)}"><span class="v2play-s">${window.icon ? window.icon('play', { size: 16 }) : ''}</span><label class="v2pick"${tipAttr('Pick up to 4 to compare')}><input type="checkbox" data-pick="${esc(r.id)}"${CR_PICK.has(r.id) ? ' checked' : ''} aria-label="Pick to compare"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8.5l2.6 2.6L12 5.6"/></svg></label><span class="v2pill ${VL[v][1]}"${v === 'nogoal' ? tipAttr('No goal CPA is set for this brand, so no ad can be called yet. Set one in brand settings, Goals.') : whyOf(r) ? tipAttr(esc(whyOf(r))) : ''}>${VL[v][0]}</span><em>${esc(r.media_type || '')}${r.age != null ? ` · ${r.age}d` : ''}</em></div><div class="b"><b title="${esc(r.name)}">${esc(r.name)}</b>
      ${r.n_ads > 1 || r.tags ? `<div class="v2tags">${r.n_ads > 1 ? `<span class="n"${tipAttr(`The same ${r.media_type === 'video' ? 'video' : 'image'} runs in ${r.n_ads} ads; their numbers are added up here.`)}>In ${r.n_ads} ads</span>` : ''}${r.tags ? [r.tags.format, r.tags.hook].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('') : ''}</div>` : ''}
      ${role(r) !== 'solo' || funnelRole(r) || valTag(r) ? `<div class="v2roles">${role(r) !== 'solo' ? `<span${tipAttr(esc(whyOf(r)))}>${role(r) === 'anchor' ? 'Anchor' : 'Support'} · ${pct(r.set_share, 0)} of set</span>` : ''}${funnelRole(r) ? `<span class="${funnelRole(r)}"${tipAttr(FR[funnelRole(r)][1])}>${FR[funnelRole(r)][0]}</span>` : ''}${valTag(r) ? `<span class="${valTag(r) === 'more' ? 'val' : 'lowval'}"${tipAttr(esc(valNote(r)))}>${valTag(r) === 'more' ? 'Customers come back' : 'Customers don’t come back'}</span>` : ''}</div>` : ''}
      <div class="kv"><span>Spend</span><b>${kmoney(r.spend, cur)}</b><span>CPA</span><b class="${r.cpa == null ? (r.spend > 0 && goal && r.spend >= bar ? 'bad' : '') : !goal ? '' : r.cpa <= goal ? 'good' : 'bad'}">${r.cpa == null && r.spend > 0 ? 'no sales' : money(r.cpa, cur)}</b><span>ROAS</span><b>${x2(r.roas)}</b><span>Hook</span><b>${pct(r.hook, 0)}</b><span>CTR</span><b>${pct(r.ctr, 2)}</b><span>Purch.</span><b><button type="button" class="v2cell" data-drill="ad:${esc(r.id)}">${int(r.purchases)}</button></b>${r.ltv_n >= 5 ? `<span${tipAttr(`${r.ltv_n} customers this ad started (first click, first order 90+ days ago) spent ${money(r.ltv90, cur)} each in their first 90 days: ${x2(r.ltv_x)} their first order.`)}>90-day value</span><b class="${r.ltv_x >= 1.3 ? 'good' : ''}">${money(r.ltv90, cur)}</b>` : ''}</div>${r.angle ? `<span class="ang">${esc(r.angle)}</span>` : ''}</div></div>`; };
    const galleryInner = () => { const { s, list, left } = sorted();
      const note = left && CR_SORT !== 'spend' ? `<p class="v2hint">${left} ad${left === 1 ? '' : 's'} left out: ${s[4] ? `under the ${money(bar, cur)} judging bar${CR_SORT === 'hook' || CR_SORT === 'hold' ? ', or not video' : ''}` : CR_SORT === 'ltv' ? 'too few known customers yet' : 'no number for this sort'}.</p>` : '';
      return list.length ? `<div class="v2gal">${list.slice(0, 24).map(galItem).join('')}</div>${note}` : `<p class="v2hint">No ads have a ${esc(s[1].toLowerCase())} number to rank in this window${s[4] ? ` at ${money(bar, cur)} of spend or more` : ''}.</p>`; };
    const tagName = k => (TAG_DIMS.find(x => x[0] === k) || [, k])[1];
    /* SORT, SHOW AND TAG ARE MENUS (2026-10-09, Cole: "should Sort by be a pill or a dropdown like the pills at the
       top?"): the same pill and menu as the period and attribution (index.html PillMenu), one line saying what each
       choice does, closed by an outside click or Escape. */
    const SORT_SAYS = { spend: 'Biggest spenders first.', purchases: 'Most purchases first, under the attribution switch.', roas: 'Highest return first. Only ads past the judging bar.', cpa: 'Cheapest purchase first. Only ads past the judging bar.', hook: 'Most people stopping in the first 3 seconds. Video ads past the bar.', hold: 'Most people watching on after the hook. Video ads past the bar.', ctr: 'Most link clicks per impression. Ads past the bar.', ltv: 'Customers who spend the most in 90 days, as a multiple of their first order.', newest: 'Most recently launched first.' };
    const tagOpts = () => { const seen = new Map(); for (const r of ads) for (const [k] of TAG_DIMS) { const v = r.tags && r.tags[k]; if (!v) continue; const key = `${k}::${v}`; seen.set(key, (seen.get(key) || 0) + 1); }
      return [['', 'All ads', 'No tag filter.'], ...[...seen.entries()].sort((p, q) => q[1] - p[1]).slice(0, 40).map(([key, n]) => { const [k, v] = key.split('::'); return [key, `${tagName(k)}: ${v}`, `${n} ad${n === 1 ? '' : 's'} tagged this way by the AI.`]; })]; };
    const toolsRow = () => `<div class="v2tools v2menus">
      ${PM().html('crSort', 'Sort by', SORTS.map(([k, l]) => [k, l, SORT_SAYS[k] || '']), CR_SORT)}
      ${PM().html('crShow', 'Show', [['0', 'Each ad', 'Every ad on its own card.'], ['1', 'One card per creative', 'Ads running the same video or image become one card, their numbers added up.']], CR_GROUP ? '1' : '0')}
      ${tagged0 ? PM().html('crTag', 'Tag', tagOpts(), CR_TAG ? `${CR_TAG.k}::${CR_TAG.v}` : '', { cls: CR_TAG ? 'on' : '' }) : ''}
      <span class="sp"></span><button type="button" class="v2link" data-cmp="1"${CR_PICK.size < 2 ? ' disabled' : ''}>${CR_PICK.size ? `Compare the ${CR_PICK.size} picked` : 'Tick 2 to 4 ads to compare'}</button><button type="button" class="v2link" data-save="1">Save this view to a dashboard</button></div>`;
    const tagged0 = ads.some(r => r.tags);
    /* WHAT'S WORKING, BY TAG (Motion's core report): spend, CPA, ROAS and hook per tag value. A row filters the gallery. */
    const tagsCard = (() => {
      const assets = new Set(ads.map(r => r.asset_key || r.id)), tagged = new Set(ads.filter(r => r.tags).map(r => r.asset_key));
      const head = `AI tags from each creative's cover and copy. <b>${tagged.size}</b> of ${assets.size} creatives tagged${tagged.size < assets.size ? '; the rest fill in within the hour' : ''}. Click a row to show only those ads.`;
      if (!tagged.size) return card('What is working, by tag', head, '<p class="v2hint">Tags are being added now. This fills in within the hour.</p>');
      const blocks = TAG_DIMS.map(([k, label]) => {
        const by = {};
        for (const r of ads) { const v = r.tags && r.tags[k]; if (!v) continue; const b = by[v] ||= { v, keys: new Set(), spend: 0, pur: 0, rev: 0, imp: 0, v3: 0 }; b.keys.add(r.asset_key || r.id); b.spend += r.spend; b.pur += r.purchases || 0; b.rev += r.revenue || 0; if (r.hook != null) { b.imp += r.impressions || 0; b.v3 += r.hook * (r.impressions || 0); } }
        const rows = Object.values(by).filter(b => b.spend > 0).sort((p, q) => q.spend - p.spend).slice(0, 6);
        if (rows.length < 2) return '';
        const judged = rows.filter(b => b.spend >= bar && b.pur), best = judged.length >= 2 ? judged.slice().sort((p, q) => p.spend / p.pur - q.spend / q.pur)[0] : null;
        const mx = Math.max(...rows.map(b => b.spend), 1);
        return `<div class="v2tagblk"><h4>${esc(label)}</h4><div class="v2tbl"><table><thead><tr><th>Tag</th><th>Ads</th><th>Spend</th><th>CPA</th><th>ROAS</th><th>Hook</th></tr></thead><tbody>${rows.map(b => `<tr class="link${CR_TAG && CR_TAG.k === k && CR_TAG.v === b.v ? ' on' : ''}" data-tag="${esc(k)}" data-tv="${esc(b.v)}" tabindex="0"><td><b>${esc(b.v)}</b>${b === best ? ' <span class="v2pill good">best CPA</span>' : ''}</td><td>${b.keys.size}</td><td>${kmoney(b.spend, cur)}</td><td class="${!goal || !b.pur ? '' : b.spend / b.pur <= goal ? 'good' : 'bad'}">${b.pur ? money(b.spend / b.pur, cur) : 'no sales'}</td><td>${x2(b.spend ? b.rev / b.spend : null)}</td><td${tipAttr('Video ads only')}>${b.imp ? pct(b.v3 / b.imp, 0) : ' - '}</td></tr>`).join('')}</tbody></table></div></div>`;
      }).filter(Boolean).join('');
      return card('What is working, by tag', head, blocks ? `<div class="v2tagsgrid">${blocks}</div>` : '<p class="v2hint">Not enough tagged creatives with spend to compare yet.</p>');
    })();
    const gallery = `<div id="v2tools">${toolsRow()}</div>${barLine}<div id="v2galw">${galleryInner()}</div>`;
    const counts = ads.reduce((s, r) => { s[verdict(r)] = (s[verdict(r)] || 0) + 1; return s; }, {});
    const body = `<p class="v2say lead">${ads.length} ads spent in this window. <b class="good">${counts.scale || 0} to scale</b>${counts.keep ? `, <b>${counts.keep} carrying a working set</b>` : ''}, <b class="warn">${counts.watch || 0} to watch</b>${counts.trim ? `, <b class="warn">${counts.trim} to trim</b>` : ''}, <b class="bad">${counts.cut || 0} to cut</b>${counts.thin || counts.new || counts.nogoal ? `, ${(counts.thin || 0) + (counts.new || 0) + (counts.nogoal || 0)} not judged yet` : ''}, ${goal ? `against the ${money(goal, cur)} ${g.cpa ? 'goal' : 'account average'}` : 'with no goal CPA set and no sales yet, so nothing can be called'}.${firstFat ? ` Ads start costing more from <b>${esc(firstFat.label.toLowerCase())}</b>.` : ''}</p>
      <div class="v2note v2rule"><span class="v2pill">How the calls work</span><span>${RULE}</span></div>
      ${card('The ads', 'Click an ad to see it play, its copy and its numbers.', gallery, `Attribution: <b>${esc(MODEL_SHORT[H.S.model])}</b>`)}
      <div id="v2tagsc">${tagsCard}</div>
      <div class="v2two eq">${card('Where every ad sits', 'Right and low is where you want to be: big spend, cheap purchases. Bubble size is purchases. Click one to see it.', legend([{ color: '--good', label: 'Scale' }, { color: '--c-meta', label: 'Keep' }, { color: '--warn', label: 'Watch or trim' }, { color: '--bad', label: 'Cut' }, { color: '--v2-cmp', label: 'Not judged yet' }]) + quad)}
        ${card('Hook against hold', 'Top right stops the scroll and keeps people watching. Dashed lines are this account’s averages. Bubble size is spend.', hookhold)}</div>
      <div class="v2two">${card('When ads tire', firstFat ? `Cost per purchase rises past the goal from ${esc(firstFat.label.toLowerCase())}.` : 'No age bucket runs more than 20% over the goal.', fatigue, 'cost per purchase by days since an ad first spent; tick = goal')}
        ${card('Are we launching enough?', `${int(wk.reduce((s, x) => s + x.launched, 0))} ads launched in 12 weeks; ${pct(wk.length ? wk[wk.length - 1].fresh_share : null, 0)} of last week’s spend went to ads under 14 days old.`, cadence, 'new ads per week; % of that week’s spend on fresh ads')}</div>
      ${(() => { const L = ads.filter(r => r.ltv_n >= 5).sort((p, q) => (q.ltv_x || 0) - (p.ltv_x || 0)); if (L.length < 3) return card('Which ads bring customers who come back', '', '<p class="v2hint">Needs customers whose first order is at least 90 days old and traced to an ad. The order history is filling in; this card lights up as it does.</p>'); const mx = Math.max(...L.map(r => r.ltv90 || 0), 1);
        return card('Which ads bring customers who come back', `For each ad: the people whose first order it started, and what they spent in their first 90 days. A higher multiple means they came back and bought again, so the ad is worth more than its cost per purchase shows. ${esc(L[0].name)} is best: ${x2(L[0].ltv_x)} their first order.`, `<div class="v2tbl wide"><table><thead><tr><th>Ad</th><th>Customers started</th><th>First order</th><th>90-day value</th><th>Multiple</th><th>CPA now</th></tr></thead><tbody>${L.slice(0, 12).map(r => `<tr class="link" data-prev="${esc(r.id)}"><td><span class="nm" title="${esc(r.name)}">${esc(r.name)}</span></td><td>${int(r.ltv_n)}</td><td>${money(r.ltv_first, cur)}</td><td>${ib(r.ltv90, mx, '--c-email', money(r.ltv90, cur))}</td><td class="${r.ltv_x >= 1.3 ? 'good' : ''}">${x2(r.ltv_x)}</td><td>${money(r.cpa, cur)}</td></tr>`).join('')}</tbody></table></div>`, 'Triple Whale first click · Shopify orders through Triple Whale'); })()}
      ${card('By angle', 'The argument each ad makes, from the test number at the start of its name.', roll(d.by_angle || [], 'Angle'))}
      <div class="v2two">${card('By format', 'The tag after the last | in the ad name.', roll(d.by_format || [], 'Format tag'))}${card('By type', '', roll(d.by_type || [], 'Type'))}</div>
      ${foot('Format comes from the tag after the last | in the ad name; angle from the test number at the start of the name, matched to the test library. Delivery numbers are Meta’s; purchases follow the attribution switch.')}`;
    $('#main').innerHTML = shell('adcreative', title, body);
    const root = $('#main'); wireGo(root);
    const tipFor = (svgId, list, fn) => { const s = document.getElementById(svgId); if (!s) return; const tip = s.parentNode.querySelector('.v2tip'); s.querySelectorAll('circle[data-i]').forEach(cEl => { cEl.onpointerenter = cEl.onpointerdown = e => { const r = list[+cEl.dataset.i]; const box = s.getBoundingClientRect(); tip.style.display = 'block'; tip.innerHTML = fn(r); let left = e.clientX - box.left + 12; if (left + tip.offsetWidth > box.width) left = e.clientX - box.left - tip.offsetWidth - 12; tip.style.left = Math.max(0, left) + 'px'; tip.style.top = Math.max(0, e.clientY - box.top - 40) + 'px'; }; cEl.onpointerleave = () => tip.style.display = 'none'; cEl.onclick = () => previewAd(r, cur, g, { call: VL[verdict(r)], why: whyOf(r), role: role(r), fr: funnelRole(r) && FR[funnelRole(r)], set: r.adset, setCall: setCall(r.adset) }); }); };
    tipFor('v2quad', top.filter(r => r.spend > 0), r => `<b>${esc(r.name)}</b><br>${kmoney(r.spend, cur)} spend · ${int(r.purchases)} purchases · CPA ${money(r.cpa, cur)} · ROAS ${x2(r.roas)}`);
    tipFor('v2hh', top.filter(r => r.hook != null && r.hold != null && r.spend > 20), r => `<b>${esc(r.name)}</b><br>hook ${pct(r.hook, 0)} · hold ${pct(r.hold, 0)} · ${kmoney(r.spend, cur)} · CPA ${money(r.cpa, cur)}`);
    /* Covers after the paint; any card opens the preview. */
    const byId = new Map(ads.map(r => [r.id, r]));
    const ctxOf = r => ({ call: VL[verdict(r)], why: whyOf(r), role: role(r), fr: funnelRole(r) && FR[funnelRole(r)], set: r.adset, setCall: setCall(r.adset) });
    root.querySelectorAll('tr[data-prev]').forEach(el => { el.onclick = () => { const r = byId.get(el.dataset.prev); if (r) previewAd(r, cur, g, ctxOf(r)); }; });
    const gw = root.querySelector('#v2galw'), tw = root.querySelector('#v2tools');
    const curList = () => new Map(base().map(r => [r.id, r]));
    const repaint = () => { tw.innerHTML = toolsRow(); wireTools(); gw.innerHTML = galleryInner(); wireGal(); };
    const wireTools = () => {
      /* A choice repaints only the gallery, so the page never jumps. */
      PM().wire(tw.querySelector('#crSort'), v => { CR_SORT = v; try { localStorage.setItem('pf_cr_sort', CR_SORT); } catch {} repaint(); });
      PM().wire(tw.querySelector('#crShow'), v => { CR_GROUP = v === '1'; try { localStorage.setItem('pf_cr_group', CR_GROUP ? '1' : '0'); } catch {} CR_PICK.clear(); repaint(); });
      PM().wire(tw.querySelector('#crTag'), v => { const i = v.indexOf('::'); CR_TAG = v ? { k: v.slice(0, i), v: v.slice(i + 2) } : null; root.querySelectorAll('#v2tagsc tr[data-tag]').forEach(x => x.classList.toggle('on', !!CR_TAG && x.dataset.tag === CR_TAG.k && x.dataset.tv === CR_TAG.v)); repaint(); });
      tw.querySelector('[data-cmp]').onclick = () => { const m = curList(); compareAds([...CR_PICK].map(id => m.get(id)).filter(Boolean), cur, goal, r => previewAd(r, cur, g, ctxOf(r))); };
      tw.querySelector('[data-save]').onclick = () => saveView(a, { sort: CR_SORT, group: CR_GROUP, tag: CR_TAG, ids: [...CR_PICK] });
    };
    wireTools();
    root.querySelectorAll('#v2tagsc tr[data-tag]').forEach(tr => { const go = () => { CR_TAG = { k: tr.dataset.tag, v: tr.dataset.tv }; root.querySelectorAll('#v2tagsc tr.on').forEach(x => x.classList.remove('on')); tr.classList.add('on'); repaint(); root.querySelector('#v2tools').scrollIntoView({ block: 'center', behavior: 'smooth' }); }; tr.onclick = go; tr.onkeydown = e => { if (e.key === 'Enter') go(); }; });
    const wireGal = () => {
      gw.querySelectorAll('[data-pick]').forEach(cb => { cb.onclick = e => e.stopPropagation(); cb.closest('label').onclick = e => e.stopPropagation(); cb.onchange = () => { if (cb.checked) { if (CR_PICK.size >= 4) { cb.checked = false; return; } CR_PICK.add(cb.dataset.pick); } else CR_PICK.delete(cb.dataset.pick); const card0 = cb.closest('.g'); if (card0) card0.classList.toggle('picked', cb.checked); tw.innerHTML = toolsRow(); wireTools(); }; });
      gw.querySelectorAll('[data-drill]').forEach(btn => btn.onclick = e => { e.stopPropagation(); drillOrders(btn.closest('.g')?.querySelector('b')?.textContent || 'Orders', `ad=${encodeURIComponent(btn.dataset.drill.split(':')[1])}`); });
      const m = curList();
      gw.querySelectorAll('.v2gal [data-prev]').forEach(el => { const go = () => { const r = m.get(el.dataset.prev) || byId.get(el.dataset.prev); if (r) previewAd(r, cur, g, ctxOf(r)); }; el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter') go(); }; });
      loadThumbs(gw, [...gw.querySelectorAll('[data-thumb]')].map(x => x.dataset.thumb));
    };
    wireGal();
    root.querySelectorAll('[data-goals]').forEach(b => b.onclick = () => window.openGoals && window.openGoals(a.act_id));
    const pend = window.V2PENDING; if (pend && pend.ad) { window.V2PENDING = null; const r = byId.get(pend.ad); if (r) previewAd(r, cur, g, ctxOf(r)); else panel('Not in this window', `<p class="v2hint">That ad did not spend in ${esc(H.rangeLabel())}. Widen the dates at the top to see it.</p>`); }
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
      ${card('Campaigns', camps.length ? `${camps.length} campaign${camps.length === 1 ? '' : 's'} spent in this window.` : 'No campaign spent in this window.', camps.length ? `<div class="v2tbl wide"><table><thead><tr><th>Campaign</th><th>Type</th><th>Spend</th><th>Clicks</th><th>CTR</th><th>Conversions</th><th>Value</th><th>ROAS</th><th>Cost per conversion</th></tr></thead><tbody>${camps.map(x => `<tr><td><span class="nm" title="${esc(x.name)}">${esc(x.name)}</span>${x.status !== 'ENABLED' ? ` <span class="v2pill">${esc(String(x.status).toLowerCase())}</span>` : ''}</td><td>${esc(String(x.type || '').replace(/_/g, ' ').toLowerCase())}</td><td>${ib(x.spend, mx, '--c-google', kmoney(x.spend, cur))}</td><td>${int(x.clicks)}</td><td>${pct(r(x.clicks, x.impressions), 2)}</td><td>${(x.conversions || 0).toFixed(1)}</td><td>${kmoney(x.value, cur)}</td><td>${x2(r(x.value, x.spend))}</td><td>${money(r(x.spend, x.conversions), cur)}</td></tr>`).join('')}</tbody></table></div>` : '', 'Google Ads API')}
      ${foot(`Read from Google Ads directly, ${esc(w.from)} to ${esc(w.to)}, refreshed hourly. Conversions and value are Google’s own count, which runs differently from Triple Whale’s; the Overview job shows what Triple Whale credits to Google.`)}`;
    $('#main').innerHTML = shell('gcampaigns', title, body); wireGo($('#main'));
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
  const BENCH = { open: 0.38, click: 0.012, rpr: 0.1, unsub: 0.003 };
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
    return card('Subject lines and send times', `${rows.length} campaigns, average open ${pct(base, 1)}.${bestW ? ` ${esc(bestW.w)} opens best (${pct(bestW.open, 1)})` : ''}${bestS ? `, and ${esc(bestS.l.toLowerCase())} beats the rest (${pct(bestS.open, 1)}).` : '.'}`,
      `<div class="v2three">
        <div><h4 class="v2sub">By day sent</h4><div class="v2tbl"><table><tbody>${byWd.filter(x => x.n).map(x => `<tr><td>${x.w}</td><td>${bar(x.open, mxW, pct(x.open, 1), `${x.n} campaigns · ${money2(x.rpr, cur)} per recipient`)}</td></tr>`).join('')}</tbody></table></div></div>
        <div><h4 class="v2sub">By time of day</h4><div class="v2tbl"><table><tbody>${bySlot.filter(x => x.n).map(x => `<tr><td>${x.l}</td><td>${bar(x.open, mxS, pct(x.open, 1), `${x.n} campaigns · ${money2(x.rpr, cur)} per recipient`)}</td></tr>`).join('')}</tbody></table></div></div>
        <div><h4 class="v2sub">What the subject does</h4><div class="v2tbl"><table><tbody>${feats.map(f => `<tr><td>${esc(f.l)}</td><td class="${f.with > f.without ? 'good' : 'bad'}"${tipAttr(`${f.n} campaigns with it open at ${pct(f.with, 1)}; the rest at ${pct(f.without, 1)}`)}>${f.with > f.without ? '+' : ''}${((f.with - f.without) * 100).toFixed(1)} pt</td></tr>`).join('') || '<tr><td class="faint">Not enough variety yet.</td></tr>'}</tbody></table></div></div>
      </div>
      <div class="v2two" style="margin-top:12px"><div><h4 class="v2sub">Best opened</h4><div class="v2tbl"><table><tbody>${top.map(x => `<tr><td>${subj(x)}</td><td>${pct(x.open_rate, 1)}</td></tr>`).join('')}</tbody></table></div></div>
        <div><h4 class="v2sub">Most money per recipient</h4><div class="v2tbl"><table><tbody>${topR.map(x => `<tr><td>${subj(x)}</td><td>${money2((x.conversion_value || 0) / x.recipients, cur)}</td></tr>`).join('')}</tbody></table></div></div></div>`,
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
    let r; try { r = await H.apiAH(`/api/atria/board?board_id=${encodeURIComponent(pick)}`); } catch (e) { r = { error: e.message }; }
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

  async function emailBoard(bs, t) {
    const host = document.getElementById('v2klall'); if (!host) return;
    host.innerHTML = card('Klaviyo across every brand', '<span class="v2hint">Reading each brand’s Klaviyo…</span>', skCard(6).replace('<section class="v2card v2sk"><i class="h"></i>', '<div class="v2sk">').replace(/<\/section>$/, '</div>'));
    const CORE = { welcome: /welcome/i, 'abandoned cart': /cart/i, checkout: /checkout/i, browse: /browse/i, 'post purchase': /post.?purchase|thank/i, winback: /win.?back/i };
    const rows = await Promise.all(bs.map(async b => {
      const [ov, fl, cp] = await Promise.all(['overview', 'flows_report', 'campaigns'].map(w => H.apiAH(`/api/klaviyo?act=${encodeURIComponent(b.act_id)}&what=${w}`).catch(e => ({ error: e.message }))));
      if (!ov || ov.error) return /not connected/i.test(ov?.error || '') ? { b, off: true } : { b, failed: true, err: ov?.error || 'no answer' };
      const live = ov.live_flows || []; const missing = Object.keys(CORE).filter(k => !live.some(f => CORE[k].test(f)));
      const flows = (fl && fl.flows) || []; const camps = ((cp && cp.campaigns) || []).filter(x => x.recipients);
      const fRev = flows.reduce((s, x) => s + (x.revenue || 0), 0), cRev = camps.reduce((s, x) => s + (x.conversion_value || 0), 0);
      const rec = camps.reduce((s, x) => s + (x.recipients || 0), 0);
      const wavg = k => rec ? camps.reduce((s, x) => s + (x[k] || 0) * (x.recipients || 0), 0) / rec : null;
      const top = flows.slice().sort((x, y) => (y.revenue || 0) - (x.revenue || 0))[0];
      return { b, live: live.length, missing, fRev, cRev, open: wavg('open_rate'), click: wavg('click_rate'), rpr: rec ? cRev / rec : null, sends: camps.length, top };
    }));
    if (t !== H.RUN()) return;
    const on = rows.filter(r => !r.off && !r.failed), off = rows.filter(r => r.off && !/golf sock/i.test(r.b.name)), failed = rows.filter(r => r.failed);   // The Golf Sock is a paused test account: never flagged
    const mx = Math.max(...on.map(r => r.fRev + r.cRev), 1);
    const gaps = on.filter(r => r.missing.length);
    host.innerHTML = card('Klaviyo across every brand', `${on.length} brand${on.length === 1 ? '' : 's'} connected.${gaps.length ? ` ${gaps.length} ${gaps.length === 1 ? 'is' : 'are'} missing a core flow.` : ' Every connected brand runs its core flows.'}`,
      `<div class="v2tbl wide"><table><thead><tr><th>Brand</th><th>Klaviyo revenue, 90 days</th><th>Flows</th><th>Campaigns</th><th>Live flows</th><th>Missing core flows</th><th>Open</th><th>Click</th><th>Per recipient</th><th>Best flow</th></tr></thead><tbody>
      ${on.sort((x, y) => (y.fRev + y.cRev) - (x.fRev + x.cRev)).map(r => `<tr data-act="${esc(r.b.act_id)}" tabindex="0" class="link"><td><b>${esc(r.b.name)}</b></td><td>${ib(r.fRev + r.cRev, mx, '--c-email', kmoney(r.fRev + r.cRev, r.b.currency), `Flows ${kmoney(r.fRev, r.b.currency)} · campaigns ${kmoney(r.cRev, r.b.currency)} (last ${r.sends} sends)`)}</td><td>${kmoney(r.fRev, r.b.currency)}</td><td>${kmoney(r.cRev, r.b.currency)}</td><td>${r.live}</td>
        <td>${r.missing.length ? r.missing.map(m => `<span class="v2pill warn">${esc(m)}</span>`).join(' ') : '<span class="v2pill good">none</span>'}</td>
        <td class="${r.open == null ? '' : r.open >= BENCH.open ? 'good' : 'warn'}">${pct(r.open, 1)}</td><td class="${r.click == null ? '' : r.click >= BENCH.click ? 'good' : 'warn'}">${pct(r.click, 2)}</td><td>${money2(r.rpr, r.b.currency)}</td><td><span class="nm" title="${esc(r.top?.name || '')}">${esc(r.top?.name || '–')}</span></td></tr>`).join('')}
      </tbody></table></div>${off.length ? `<p class="v2hint" style="margin-top:10px">Not connected to Klaviyo directly: ${esc(off.map(r => r.b.name).join(', '))}. Brand settings > Integrations > paste each brand’s private key.</p>` : ''}${failed.length ? `<p class="v2hint" style="margin-top:6px">Klaviyo did not answer for ${esc(failed.map(r => r.b.name).join(', '))} (it limits how often reports can be read). <button type="button" class="v2link" data-klretry="1">Try again ›</button></p>` : ''}`,
      'Klaviyo’s own attribution · open and click are the last 30 campaigns, weighted by recipients');
    wireRows(host, 'email');
    const rb = host.querySelector('[data-klretry]'); if (rb) rb.onclick = () => emailBoard(bs, H.RUN());
  }   // Klaviyo published 2026 campaign averages (research-email-sms.md)
  async function email(first) {
    const t = H.RUN(); const one = H.S.act !== 'all'; const a = H.S.accounts.find(x => x.act_id === H.S.act);
    const title = one ? `Email and SMS: ${esc(a?.name || '')}` : 'Email and SMS';
    if (first) $('#main').innerHTML = shell('email', title, skPage({ tiles: 4 }));
    let d; try { d = await get(`/api/hub/email?act=${encodeURIComponent(H.S.act)}&${H.rangeQ()}`); } catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('email', title, `<div class="v2card"><p class="v2bad">${esc(e.message)}</p></div>`); return; }
    if (t !== H.RUN()) return;
    const bs = d.brands; const cur = oneCur(bs);
    if (!one) {
      const live = bs.filter(b => b.cur.email); const mx = Math.max(...live.map(b => b.cur.email), 1);
      const tot = k => live.reduce((s, b) => s + (b.cur[k] || 0), 0), ptot = k => live.reduce((s, b) => s + ((b.prev || {})[k] || 0), 0);
      const body = `${cur ? `<div class="v2tiles">${[tile({ compact: true, label: 'Email and SMS revenue', src: 'KLAVIYO', value: kmoney(tot('email'), cur), delta: delta(tot('email'), ptot('email')) }), tile({ compact: true, label: 'Campaigns', value: kmoney(tot('campaigns'), cur), delta: delta(tot('campaigns'), ptot('campaigns')) }), tile({ compact: true, label: 'Flows', value: kmoney(tot('flows'), cur), delta: delta(tot('flows'), ptot('flows')) }), tile({ compact: true, label: 'Brands with email revenue', value: `${live.length} of ${bs.length}` })].join('')}</div>` : ''}
        ${card('Each brand', `Brands with no Klaviyo revenue in Triple Whale: ${esc(bs.filter(b => !b.cur.email).map(b => b.name).join(', ') || 'none')}.`, `<div class="v2tbl"><table><thead><tr><th>Brand</th><th>Email revenue</th><th>Share of revenue</th><th>Campaigns</th><th>Flows</th><th>Flows share</th></tr></thead><tbody>${live.sort((x, y) => y.cur.email - x.cur.email).map(b => { const x = b.cur, p = b.prev || {}; return `<tr data-act="${esc(b.act_id)}" tabindex="0" class="link"><td><b>${esc(b.name)}</b></td><td>${ib(x.email, mx, '--c-email', kmoney(x.email, b.currency))} ${delta(x.email, p.email)}</td><td>${pct(x.share, 0)}</td><td>${kmoney(x.campaigns, b.currency)}</td><td>${kmoney(x.flows, b.currency)}</td><td>${x.email ? pct(x.flows / x.email, 0) : '–'}</td></tr>`; }).join('')}</tbody></table></div>`)}`;
      $('#main').innerHTML = shell('email', title, body + '<div id="v2klall"></div>'); wireRows($('#main'), 'email');
      emailBoard(bs, t); return;
    }
    const b = bs[0], c = b.cur, p = b.prev || {};
    const body0 = `<div class="v2tiles">${[
        tile({ compact: true, label: 'Email and SMS revenue', src: 'KLAVIYO', value: kmoney(c.email, cur), delta: delta(c.email, p.email), spark: spark((b.series || []).map(r => r.email)) }),
        tile({ compact: true, label: 'Share of store revenue', value: pct(c.share, 0), delta: delta(c.share, p.share, false, true), bullet: bullet(c.share, 0.3, false, 'healthy store: about 30%') }),
        tile({ compact: true, label: 'Campaigns', value: kmoney(c.campaigns, cur), delta: delta(c.campaigns, p.campaigns), sub: c.email ? `${pct(c.campaigns / c.email, 0)} of email` : '' }),
        tile({ compact: true, label: 'Flows', value: kmoney(c.flows, cur), delta: delta(c.flows, p.flows), sub: c.email ? `${pct(c.flows / c.email, 0)} of email` : '' })].join('')}</div>
      ${(b.series || []).length > 1 ? card('Campaigns and flows by day', '', legend([{ color: '--c-email', label: 'Flows' }, { color: '--brand', label: 'Campaigns' }]) + stackChart('v2em', b.series, [{ key: 'flows', label: 'Flows', color: '--c-email' }, { key: 'campaigns', label: 'Campaigns', color: '--brand' }], { cur, h: 180 })) : ''}
      <div id="v2kl"></div>`;
    $('#main').innerHTML = shell('email', title, body0 + foot('Revenue is Klaviyo’s placed-order attribution as Triple Whale carries it. Campaign and flow tables are Klaviyo’s own results for the last 90 days, refreshed every 6 hours. Benchmarks are Klaviyo’s published 2026 averages.'));
    if ((b.series || []).length > 1) wireStack('v2em', b.series, [{ key: 'flows', label: 'Flows', color: '--c-email' }, { key: 'campaigns', label: 'Campaigns', color: '--brand' }], cur);
    /* THE KLAVIYO CARD LOADS ON ITS OWN (2026-10-09, Cole: "Klaviyo felt slow and sometimes did not load"). The rest of
       the screen is already painted; the card shows its shape in shimmer while Klaviyo answers, and an error with Try
       again if it does not. Not awaited, so the page is never held dimmed behind a slow Klaviyo read. */
    klaviyoCards(a, cur, t);
  }
  async function klaviyoCards(a, cur, t) {
    const host0 = document.getElementById('v2kl'); if (!host0) return;
    host0.innerHTML = `<div class="v2two">${skCard(6)}${skCard(6)}</div>${skCard(8)}<p class="v2hint v2klwait">Reading Klaviyo… The first read of a brand can take 20 seconds; after that it is kept for 6 hours.</p>`;
    let ov, camps, flows;
    const k = what => H.apiAH(`/api/klaviyo?act=${encodeURIComponent(a.act_id)}&what=${what}`);
    try { [ov, camps, flows] = await Promise.all([k('overview'), k('campaigns').catch(() => null), k('flows_report').catch(() => null)]); } catch (e) { ov = { error: e.message, failed: true }; }
    if (t !== H.RUN()) return; const host = document.getElementById('v2kl'); if (!host) return;
    const notConnected = ov && ov.error && /not connected/i.test(ov.error);
    if (!ov || ov.error) {
      host.innerHTML = notConnected ? card(`Klaviyo is not connected for ${esc(a.name)}`, '', `<p class="v2hint">${esc(ov.error)}</p><button type="button" class="v2btn" data-go="settings">Open Integrations</button>`)
        : card('Klaviyo did not answer', '', `<p class="v2bad">${esc(ov?.error || 'No answer came back.')}</p><p class="v2hint">The numbers above are from Triple Whale and are not affected. Klaviyo limits how often its reports can be read; trying again in a minute usually works.</p><button type="button" class="v2btn" data-klretry="1">Try again</button>`);
      wireGo(host); const rb = host.querySelector('[data-klretry]'); if (rb) rb.onclick = () => klaviyoCards(a, cur, H.RUN());
      return;
    }
    const bench = (v, b, lower) => v == null ? '' : `<span class="v2pill ${(lower ? v <= b : v >= b) ? 'good' : 'warn'}" title="Klaviyo average ${pct(b, 1)}">${(lower ? v <= b : v >= b) ? 'above avg' : 'below avg'}</span>`;
    const crAll = (camps?.campaigns || []).filter(x => x.recipients != null); const cr = crAll.slice(0, 15); const fr = (flows?.flows || []).filter(x => x.recipients).slice(0, 15);
    const fmx = Math.max(...fr.map(x => x.revenue || 0), 1), cmx = Math.max(...cr.map(x => x.conversion_value || 0), 1);
    const CORE = /welcome|abandon|cart|checkout|browse|post.?purchase|thank|win.?back|sunset/i;
    const missing = ['welcome', 'abandon', 'browse', 'post', 'win'].filter(k => !(ov.live_flows || []).some(f => new RegExp(k, 'i').test(f)));
    host.innerHTML = `<div class="v2two">
        ${card('Flows', fr.length ? `${fr.length} flows sent in 90 days. Core flows are marked.` : esc(flows?.results_note || 'No flow results came back.'), fr.length ? `<div class="v2tbl"><table><thead><tr><th>Flow</th><th>Revenue</th><th>Per recipient</th><th>Conversion</th><th>Click</th></tr></thead><tbody>${fr.map(x => `<tr><td>${CORE.test(x.name) ? '<span class="v2pill good">core</span> ' : ''}${esc(x.name)}${x.status && x.status !== 'live' ? ` <span class="v2pill">${esc(x.status)}</span>` : ''}</td><td>${ib(x.revenue, fmx, '--c-email', kmoney(x.revenue, cur))}</td><td>${money2(x.revenue_per_recipient, cur)}</td><td>${pct(x.conversion_rate, 2)}</td><td>${pct(x.click_rate, 1)}</td></tr>`).join('')}</tbody></table></div>` : '')}
        ${card('What Klaviyo is running', `${int(ov.flows_live)} live flows of ${int(ov.flows_total)} · ${int(ov.lists)} lists · ${int(ov.segments)} segments.`, `${missing.length ? `<div class="v2note"><span class="v2pill warn">gap</span> No live flow named for: ${missing.map(m => ({ welcome: 'welcome', abandon: 'abandoned cart', browse: 'browse abandonment', post: 'post purchase', win: 'win-back' })[m]).join(', ')}.</div>` : '<div class="v2note"><span class="v2pill good">ok</span> Every core flow is live.</div>'}
          <div class="v2tbl"><table><tbody>${(ov.biggest_lists || []).slice(0, 4).map(l => `<tr><td>${esc(l.name)} <span class="faint">list</span></td><td>${int(l.profiles)}</td></tr>`).join('')}${(ov.biggest_segments || []).slice(0, 5).map(l => `<tr><td>${esc(l.name)} <span class="faint">segment</span></td><td>${int(l.profiles)}</td></tr>`).join('')}</tbody></table></div>`)}</div>
      ${subjectsCard(crAll, cur, a.tz)}
      ${card('Recent campaigns', cr.length ? 'Klaviyo’s own results, last 90 days, with Klaviyo’s 2026 averages as pills.' : esc(camps?.results_note || 'No campaign results came back.'), cr.length ? `<div class="v2tbl wide"><table><thead><tr><th>Campaign</th><th>Sent</th><th>Recipients</th><th>Open</th><th>Click</th><th>Placed order</th><th>Revenue</th><th>Per recipient</th><th>Unsub</th></tr></thead><tbody>${cr.map(x => `<tr><td><span class="nm" title="${esc(x.name)}">${esc(x.name)}</span></td><td>${x.sent ? day(x.sent) : '–'}</td><td>${int(x.recipients)}</td><td>${pct(x.open_rate, 1)} ${bench(x.open_rate, BENCH.open)}</td><td>${pct(x.click_rate, 2)} ${bench(x.click_rate, BENCH.click)}</td><td>${pct(x.conversion_rate, 2)}</td><td>${ib(x.conversion_value || 0, cmx, '--brand', kmoney(x.conversion_value, cur))}</td><td>${money2(x.recipients ? (x.conversion_value || 0) / x.recipients : null, cur)}</td><td>${pct(x.unsubscribe_rate, 2)} ${bench(x.unsubscribe_rate, BENCH.unsub, true)}</td></tr>`).join('')}</tbody></table></div>` : '')}`;
    wireGo(host);
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
  async function website(first) {
    const t = H.RUN(); const a = H.S.accounts.find(x => x.act_id === H.S.act);
    const title = a ? `Website: ${esc(a.name)}` : 'Website';
    if (!a) { $('#main').innerHTML = shell('website', title, card('Pick a brand', '', `<p class="v2hint">Website analytics come from each brand’s own Google Analytics, so they are read one brand at a time. Pick a brand in the menu.</p>`)); return; }
    if (first) $('#main').innerHTML = shell('website', title, skPage({ tiles: 4, lead: true }));
    const w = win(); let d;
    try { d = await H.apiAH(`/api/google/website?act=${encodeURIComponent(a.act_id)}&${w.q}`); } catch (e) { d = { error: e.message }; }
    if (t !== H.RUN()) return;
    if (d.error) { $('#main').innerHTML = shell('website', title, notLinked('ga4', a.name, d.error)); wireGo($('#main')); return; }
    const c = d.cur || {}, p = d.prev || {}, cur = a.currency;
    const cvr = x => x && x.sessions ? (x.ecommercePurchases || 0) / x.sessions : null;
    const fun = [['Sessions', c.sessions, p.sessions], ['Added to cart', c.addToCarts, p.addToCarts], ['Checkout', c.checkouts, p.checkouts], ['Purchased', c.ecommercePurchases, p.ecommercePurchases]];
    const top = Math.max(c.sessions || 1, 1);
    const chMx = Math.max(...(d.channels || []).map(x => x.sessions), 1);
    const leak = (d.landing || []).filter(x => x.sessions > (c.sessions || 0) * 0.03).map(x => ({ ...x, cvr: x.sessions ? x.ecommercePurchases / x.sessions : 0 })).sort((x, y) => x.cvr - y.cvr)[0];
    const devT = (d.devices || []).reduce((s, x) => s + x.sessions, 0) || 1;
    const DC = { mobile: '--c-meta', desktop: '--c-email', tablet: '--c-google' };
    const rows = d.days || [];
    const body = `<p class="v2say lead">${int(c.sessions)} sessions${chip(c.sessions, p.sessions)}, ${pct(c.engagementRate, 0)} engaged, ${pct(cvr(c), 2)} bought${p.sessions ? ` (against ${pct(cvr(p), 2)} before)` : ''}.${leak ? ` The weakest big landing page is <b>${esc(leak.page)}</b> at ${pct(leak.cvr, 2)}.` : ''}</p>
      <div class="v2tiles">${[
        tile({ compact: true, label: 'Sessions', src: 'GA4', value: int(c.sessions), delta: chip(c.sessions, p.sessions), sub: `${int(c.totalUsers)} people · ${pct(c.totalUsers ? c.newUsers / c.totalUsers : null, 0)} new`, spark: spark(rows.map(r => r.sessions), null, 300, 34, rows.map(r => `<b>${day(r.date)}</b> · ${int(r.sessions)} sessions`)) }),
        tile({ compact: true, label: 'Engaged sessions', src: 'GA4', hint: '10s+, 2+ pages or a conversion', value: pct(c.engagementRate, 0), sub: `avg ${c.averageSessionDuration ? Math.round(c.averageSessionDuration) + 's' : '–'} a session` }),
        tile({ compact: true, label: 'Conversion rate', src: 'GA4', value: pct(cvr(c), 2), delta: chip(cvr(c), cvr(p)), sub: `${int(c.ecommercePurchases)} purchases` }),
        tile({ compact: true, label: 'Revenue GA4 sees', src: 'GA4', hint: 'GA4 misses orders; Shopify is the truth', value: kmoney(c.purchaseRevenue, cur), delta: chip(c.purchaseRevenue, p.purchaseRevenue), sub: 'Store revenue is on Sales' })].join('')}</div>
      <div class="v2two">${rows.length > 1 ? card('Sessions by day', '', lineChart('v2web', rows.map(r => ({ ...r, v: r.sessions })), { key: 'v', fmt: v => int(v), h: 220 })) : ''}
        ${card('From visit to purchase', `${pct(c.sessions ? c.addToCarts / c.sessions : null, 1)} add to cart, ${pct(c.addToCarts ? c.ecommercePurchases / c.addToCarts : null, 1)} of carts buy.`, `<div class="v2fun four">${fun.map(([l, v, pv]) => `<div class="fs"><div class="l">${l}</div><div class="v">${int(v)}${chip(v, pv)}</div><div class="r">${pct(v / top, 1)} of sessions</div><div class="bar"${tipAttr(`${l}: ${int(v)} now${pv ? `, ${int(pv)} before` : ''}`)}><i style="width:${((v || 0) / top * 100).toFixed(1)}%"></i></div></div>`).join('')}</div>`)}</div>
      ${card('Where visitors come from', 'Google’s default channel groups. Conversion is purchases per session; green beats the site average.', `<div class="v2tbl"><table><thead><tr><th>Channel</th><th>Sessions</th><th>Engaged</th><th>Conversion</th><th>Purchases</th><th>Revenue</th></tr></thead><tbody>${(d.channels || []).map(x => `<tr><td><b>${esc(x.group)}</b></td><td>${ib(x.sessions, chMx, null, int(x.sessions), `${pct(x.sessions / (c.sessions || 1), 0)} of sessions`)}</td><td>${pct(x.engagementRate, 0)}</td><td class="${cvr(c) && x.sessions > 50 ? (x.ecommercePurchases / x.sessions >= cvr(c) ? 'good' : 'bad') : ''}">${pct(x.sessions ? x.ecommercePurchases / x.sessions : null, 2)}</td><td>${int(x.ecommercePurchases)}</td><td>${kmoney(x.purchaseRevenue, cur)}</td></tr>`).join('')}</tbody></table></div>`)}
      <div class="v2two">${card('Landing pages', 'Where sessions start. Red is below the site average on real traffic: a page to fix.', `<div class="v2tbl wide"><table><thead><tr><th>Page</th><th>Sessions</th><th>Engaged</th><th>Conversion</th><th>Revenue</th></tr></thead><tbody>${(d.landing || []).map(x => { const r = x.sessions ? x.ecommercePurchases / x.sessions : 0; return `<tr><td><span class="nm" title="${esc(x.page)}">${esc(x.page)}</span></td><td>${int(x.sessions)}</td><td>${pct(x.engagementRate, 0)}</td><td class="${x.sessions > (c.sessions || 0) * 0.03 && cvr(c) ? (r >= cvr(c) ? 'good' : 'bad') : ''}">${pct(r, 2)}</td><td>${kmoney(x.purchaseRevenue, cur)}</td></tr>`; }).join('')}</tbody></table></div>`)}
        ${card('Devices', '', `<div class="v2stackbar">${(d.devices || []).map(x => `<i style="flex:${x.sessions};background:var(${DC[x.device] || '--c-else'})"${tipAttr(`<b>${esc(x.device)}</b> · ${pct(x.sessions / devT, 0)} of sessions · converts ${pct(x.sessions ? x.ecommercePurchases / x.sessions : null, 2)}`)}></i>`).join('')}</div>
          <div class="v2tbl" style="margin-top:10px"><table><tbody>${(d.devices || []).map(x => `<tr><td><span class="sw" style="background:var(${DC[x.device] || '--c-else'})"></span>${esc(x.device)}</td><td>${pct(x.sessions / devT, 0)}</td><td>${pct(x.sessions ? x.ecommercePurchases / x.sessions : null, 2)} convert</td><td>${kmoney(x.purchaseRevenue, cur)}</td></tr>`).join('')}</tbody></table></div>`)}</div>
      ${card('Source and medium', 'The raw tags, for checking UTMs.', `<div class="v2tbl"><table><thead><tr><th>Source / medium</th><th>Sessions</th><th>Purchases</th><th>Revenue</th></tr></thead><tbody>${(d.sources || []).map(x => `<tr><td>${esc(x.source)}</td><td>${int(x.sessions)}</td><td>${int(x.ecommercePurchases)}</td><td>${kmoney(x.purchaseRevenue, cur)}</td></tr>`).join('')}</tbody></table></div>`)}
      ${foot(`Google Analytics 4, property ${esc(d.property)}, ${esc(w.from)} to ${esc(w.to)}. GA4 undercounts purchases (consent, ad blockers); store revenue and orders stay Shopify’s on Sales. Refreshed hourly.`)}`;
    $('#main').innerHTML = shell('website', title, body); const root = $('#main'); wireGo(root);
    if (rows.length > 1) wireLine('v2web', rows.map(r => ({ ...r, v: r.sessions })), { tip: r => `<b>${day(r.date)}</b> · ${int(r.sessions)} sessions · ${int(r.purchases)} purchases` });
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
    const qMx = Math.max(...(d.queries || []).map(q => q.clicks), 1); const rows = d.days || [];
    const body = `<p class="v2say lead">${int(c.clicks)} clicks from Google search${chip(c.clicks, p.clicks)}, ${pct((sp.brand.clicks || 0) / tot, 0)} of them from people already searching the brand.${opp.length ? ` ${opp.length} non-brand queries sit just off the top of page one.` : ''}</p>
      <div class="v2tiles">${[
        tile({ compact: true, label: 'Clicks', src: 'GSC', value: int(c.clicks), delta: chip(c.clicks, p.clicks), spark: spark(rows.map(r => r.clicks), null, 300, 34, rows.map(r => `<b>${day(r.date)}</b> · ${int(r.clicks)} clicks`)) }),
        tile({ compact: true, label: 'Impressions', src: 'GSC', value: int(c.impressions), delta: chip(c.impressions, p.impressions) }),
        tile({ compact: true, label: 'Click rate', value: pct(c.ctr, 1), delta: chip(c.ctr, p.ctr) }),
        tile({ compact: true, label: 'Average position', hint: 'lower is better', value: c.position ? c.position.toFixed(1) : '–', delta: chip(c.position, p.position, true) })].join('')}</div>
      <div class="v2two">${rows.length > 1 ? card('Clicks by day', '', lineChart('v2gsc', rows.map(r => ({ ...r, v: r.clicks })), { key: 'v', fmt: v => int(v), h: 220 })) : ''}
        ${card('Brand against everything else', 'Brand clicks are people who already know the brand; the rest is search finding new people.', `<div class="v2stackbar"><i style="flex:${sp.brand.clicks || 0};background:var(--brand)"${tipAttr(`Brand: ${int(sp.brand.clicks)} clicks`)}></i><i style="flex:${sp.other.clicks || 0};background:var(--c-tiktok)"${tipAttr(`Non-brand: ${int(sp.other.clicks)} clicks`)}></i></div><div class="v2stacklab"><span><i style="background:var(--brand)"></i>Brand ${int(sp.brand.clicks)} clicks</span><span><i style="background:var(--c-tiktok)"></i>Non-brand ${int(sp.other.clicks)} clicks</span></div>
          ${opp.length ? `<h4 class="v2sub">Worth a page or a push</h4><div class="v2tbl"><table><thead><tr><th>Query</th><th>Impressions</th><th>Position</th></tr></thead><tbody>${opp.map(q => `<tr><td>${esc(q.query)}</td><td>${int(q.impressions)}</td><td>${q.position.toFixed(1)}</td></tr>`).join('')}</tbody></table></div>` : ''}`)}</div>
      <div class="v2two">${card('Top queries', 'The words people typed. Brand queries are marked.', `<div class="v2tbl"><table><thead><tr><th>Query</th><th>Clicks</th><th>Impressions</th><th>Click rate</th><th>Position</th></tr></thead><tbody>${(d.queries || []).slice(0, 25).map(q => `<tr><td>${q.brand ? '<span class="v2pill">brand</span> ' : ''}${esc(q.query)}</td><td>${ib(q.clicks, qMx, q.brand ? '--brand' : '--c-tiktok', int(q.clicks))}</td><td>${int(q.impressions)}</td><td>${pct(q.ctr, 1)}</td><td>${q.position.toFixed(1)}</td></tr>`).join('')}</tbody></table></div>`)}
        ${card('Top pages', '', `<div class="v2tbl wide"><table><thead><tr><th>Page</th><th>Clicks</th><th>Position</th></tr></thead><tbody>${(d.pages || []).map(x => `<tr><td><span class="nm" title="${esc(x.page)}">${esc(x.page.replace(/^https?:\/\/[^/]+/, '') || '/')}</span></td><td>${int(x.clicks)}</td><td>${x.position.toFixed(1)}</td></tr>`).join('')}</tbody></table></div>`)}</div>
      ${foot(`Google Search Console, ${esc(d.site)}, ${esc(w.from)} to ${esc(w.to)}. Search Console lags about two days. Refreshed hourly.`)}`;
    $('#main').innerHTML = shell('search', title, body); const root = $('#main'); wireGo(root);
    if (rows.length > 1) wireLine('v2gsc', rows.map(r => ({ ...r, v: r.clicks })), { tip: r => `<b>${day(r.date)}</b> · ${int(r.clicks)} clicks · ${int(r.impressions)} impressions · position ${r.position ? r.position.toFixed(1) : '–'}` });
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
