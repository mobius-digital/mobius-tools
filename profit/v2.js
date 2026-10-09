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
    return `<svg class="v2spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"${tips && tips.length === v.length ? ` data-spk="${esc(JSON.stringify(tips))}"` : ''}>${ghost && ghost.length > 1 ? `<polyline points="${pt(ghost)}" fill="none" stroke="var(--v2-cmp)" stroke-width="1.2" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>` : ''}<polyline points="${pt(v)}" fill="none" stroke="var(--brand)" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><circle cx="${w - 3}" cy="${(h - 4 - (last - mn) / r * (h - 10)).toFixed(1)}" r="2.6" fill="var(--brand)"/></svg>`;
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
  const ib = (v, max, color, label, tip) => `<span class="v2ib"${tip ? tipAttr(tip) : ''}><i style="width:${max ? Math.max(2, Math.min(100, v / max * 100)).toFixed(0) : 0}%;${color ? `background:var(${color})` : ''}"></i><span>${label}</span></span>`;

  /** Line chart, one scale, compare period ghosted, optional plan line and change markers, shared tooltip. */
  function lineChart(id, rows, opts = {}) {
    const key = opts.key || 'v', cur = opts.cur, w = 760, h = opts.h || 240, pl = 48, pr = 16, pt = 14, pb = 26;
    const n = rows.length; if (n < 2) return `<p class="v2hint">Not enough days in this window for a chart.</p>`;
    const prev = opts.prev || [];
    const vals = rows.map(r => r[key] ?? 0).concat(prev.map(r => r[key] ?? 0)).concat(opts.plan ? [opts.plan] : []).concat(opts.key2 ? rows.map(r => r[opts.key2] ?? 0) : []);
    const mx = Math.max(...vals, 1) * 1.1;
    const X = i => pl + i / (n - 1) * (w - pl - pr), Y = v => pt + (1 - v / mx) * (h - pt - pb);
    const line = (a, k) => a.slice(0, n).map((r, i) => r[k] == null ? null : `${X(i).toFixed(1)},${Y(r[k]).toFixed(1)}`).filter(Boolean).join(' ');
    const fmt = opts.fmt || (v => kmoney(v, cur));
    const grid = [0.25, 0.5, 0.75, 1].map(f => `<line x1="${pl}" x2="${w - pr}" y1="${Y(mx * f).toFixed(1)}" y2="${Y(mx * f).toFixed(1)}" stroke="var(--v2-grid)"/><text x="${pl - 6}" y="${(Y(mx * f) + 4).toFixed(1)}" font-size="10" text-anchor="end" fill="var(--muted)">${fmt(mx * f)}</text>`).join('');
    const idx = n <= 10 ? rows.map((_, i) => i) : [...new Set(Array.from({ length: 6 }, (_, k) => Math.round(k * (n - 1) / 5)))];
    const ticks = idx.map(i => `<text x="${X(i).toFixed(1)}" y="${h - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${day(rows[i].date)}</text>`).join('');
    const marks = (opts.changes || []).map(c => { const i = rows.findIndex(r => r.date === c.date); if (i < 0) return ''; return `<g class="v2mk"><line x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${pt}" y2="${h - pb}" stroke="var(--faint)" stroke-dasharray="2 3"/><polygon points="${(X(i) - 5).toFixed(1)},${h - pb + 2} ${(X(i) + 5).toFixed(1)},${h - pb + 2} ${X(i).toFixed(1)},${h - pb - 6}" fill="var(--muted)"><title>${esc(day(c.date) + ' · ' + c.text)}</title></polygon></g>`; }).join('');
    const lastV = rows[n - 1][key];
    return `<div class="v2chart" data-chart="${id}"><svg id="${id}" viewBox="0 0 ${w} ${h}">${grid}${ticks}
      ${opts.plan ? `<line x1="${pl}" x2="${w - pr}" y1="${Y(opts.plan).toFixed(1)}" y2="${Y(opts.plan).toFixed(1)}" stroke="var(--warn)" stroke-width="1.2" stroke-dasharray="2 4"/>` : ''}
      ${prev.length > 1 ? `<polyline points="${line(prev, key)}" fill="none" stroke="var(--v2-cmp)" stroke-width="1.5" stroke-dasharray="4 4"/>` : ''}
      ${opts.key2 ? `<polyline points="${line(rows, opts.key2)}" fill="none" stroke="var(--c-google)" stroke-width="1.6" stroke-linejoin="round"/>` : ''}
      <polyline points="${line(rows, key)}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round"/>
      ${lastV != null ? `<circle cx="${X(n - 1).toFixed(1)}" cy="${Y(lastV).toFixed(1)}" r="3.5" fill="var(--brand)"/>` : ''}
      ${marks}<line class="gl" x1="0" x2="0" y1="${pt}" y2="${h - pb}" stroke="var(--ink)" stroke-width="1" stroke-dasharray="3 3" opacity="0"/><g class="gdots"></g></svg><div class="v2tip"></div></div>`;
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
  function panel(title, html) {
    let p = document.getElementById('v2panel');
    if (!p) { document.body.insertAdjacentHTML('beforeend', `<div id="v2scrim"></div><aside id="v2panel" aria-label="Detail"><div class="ph"><b></b><button type="button" aria-label="Close">✕</button></div><div class="pb"></div></aside>`); p = document.getElementById('v2panel');
      const close = () => { p.classList.remove('on'); document.getElementById('v2scrim').classList.remove('on'); };
      p.querySelector('button').onclick = close; document.getElementById('v2scrim').onclick = close; document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }); }
    p.querySelector('.ph b').textContent = title; p.querySelector('.pb').innerHTML = html;
    p.classList.add('on'); document.getElementById('v2scrim').classList.add('on');
    return p.querySelector('.pb');
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
  const THUMBS = new Map(), ASSETS = new Map();
  async function loadThumbs(root, ids) {
    const want = [...new Set(ids.filter(id => id && !THUMBS.has(id)))].slice(0, 40);
    const paint = () => root.querySelectorAll('[data-thumb]').forEach(el => { const u = THUMBS.get(el.dataset.thumb); if (u) el.style.backgroundImage = `url("${u}")`; });
    paint(); if (!want.length) return;
    const act = H.S.act; const t = H.RUN();
    try { const r = await H.apiAH(`/api/ad-creatives?act=${encodeURIComponent(act)}&ads=${want.join(',')}`); for (const [id, x] of Object.entries(r.assets || {})) { ASSETS.set(id, x); const u = x.thumb || x.image || x.cover; if (u) THUMBS.set(id, u); } } catch {}
    if (t === H.RUN()) paint();
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
    const body = panel(a.name || 'Ad', `<div class="v2pv"><div class="v2pv-m" data-thumb="${esc(a.id)}"${THUMBS.has(a.id) ? ` style="background-image:url('${THUMBS.get(a.id)}')"` : ''}><button type="button" class="v2play" aria-label="Play">▶ Play</button></div>
      <div class="v2pstat"><div><b>${kmoney(a.spend, cur)}</b><span>spend</span></div><div><b class="${!g.cpa || a.cpa == null ? '' : a.cpa <= g.cpa ? 'good' : 'bad'}">${money(a.cpa, cur)}</b><span>cost per purchase${g.cpa ? ` · goal ${money(g.cpa, cur)}` : ''}</span></div><div><b>${x2(a.roas)}</b><span>ROAS</span></div></div>
      <div class="v2kv"><span>Purchases</span><b><button type="button" class="v2cell" data-orders="1">${int(a.purchases)}</button></b><span>Revenue</span><b>${kmoney(a.revenue, cur)}</b><span>Hook · hold</span><b>${pct(a.hook, 0)} · ${pct(a.hold, 0)}</b><span>CTR · CPM</span><b>${pct(a.ctr, 2)} · ${money2(a.cpm, cur)}</b>${a.frequency ? `<span>Frequency</span><b>${a.frequency.toFixed(2)}</b>` : ''}${a.age != null ? `<span>Running</span><b>${a.age} days</b>` : ''}${a.angle ? `<span>Angle</span><b>${esc(a.angle)}</b>` : ''}${a.ltv_n >= 5 ? `<span>90-day value</span><b>${money(a.ltv90, cur)} · ${x2(a.ltv_x)} first order · ${int(a.ltv_n)} customers</b>` : ''}</div>
      ${callLine}${setCard}
      ${gradeHtml(a, MED)}
      ${x.headline || x.body ? `<div class="v2copy">${x.headline ? `<b>${esc(x.headline)}</b>` : ''}${x.body ? `<p>${esc(x.body)}</p>` : ''}</div>` : ''}
      <div class="v2gos"><button type="button" class="v2go" data-more="1"><b>Make more like this</b><span>The Strategist drafts an Asana brief for three iterations of this ad.</span><i>›</i></button></div>
      <p class="v2hint">${esc(MODEL_SHORT[H.S.model] || '')} for purchases and revenue; delivery is Meta's.</p></div>`);
    body.querySelector('[data-more]').onclick = () => { const brand = (H.S.accounts.find(z => z.act_id === H.S.act) || {}).name || 'this brand'; H.AskUI.ask(`For ${brand}: draft an Asana brief for three iterations of the ad "${a.name}" (ad id ${a.id}). It spent ${kmoney(a.spend, cur)} at ${money(a.cpa, cur)} per purchase${g.cpa ? ` against a ${money(g.cpa, cur)} goal` : ''}, hook ${pct(a.hook, 0)}, hold ${pct(a.hold, 0)}. Keep what works, change one thing per iteration, and say which test it is.`); };
    loadThumbs(body, [a.id]).then(() => { const y = ASSETS.get(a.id) || {}; const cp = body.querySelector('.v2copy'); if (!cp && (y.headline || y.body)) body.querySelector('.v2kv').insertAdjacentHTML('afterend', `<div class="v2copy">${y.headline ? `<b>${esc(y.headline)}</b>` : ''}${y.body ? `<p>${esc(y.body)}</p>` : ''}</div>`); });
    body.querySelector('[data-orders]').onclick = () => drillOrders(a.name, `ad=${encodeURIComponent(a.id)}`);
    if (window.SupplyStock && H.S.act !== 'all') window.SupplyStock.previewLine(body, H.S.act, a.id);
    const m = body.querySelector('.v2pv-m');
    body.querySelector('.v2play').onclick = async () => {
      m.innerHTML = '<span class="v2hint" style="padding:14px">Loading the ad…</span>';
      try {
        const u = await H.adVideoUrl(a.id); const src = typeof u === 'string' ? u : u && u.src, link = u && u.preview;
        if (src) m.innerHTML = `<video src="${esc(src)}" controls autoplay playsinline></video>`;
        else if (link) m.innerHTML = `<iframe src="${esc(link)}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen title="Meta's preview of this ad"></iframe>`;
        else { m.innerHTML = ''; m.classList.add('still'); if (THUMBS.has(a.id)) m.style.backgroundImage = `url("${THUMBS.get(a.id)}")`; m.insertAdjacentHTML('beforeend', `<span class="v2pill">${esc((u && u.reason) || 'A still image: this is the ad')}</span>`); }
      } catch (e) { m.innerHTML = `<p class="v2bad" style="padding:14px">${esc(e.message)}</p>`; }
    };
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
    const t = H.RUN(); let d;
    try { d = await get(`/api/hub/yesterday?act=${encodeURIComponent(H.S.act)}`); } catch { return; }
    const host = document.getElementById('v2moved'); if (t !== H.RUN() || !host) return;
    const bs = d.brands || [], days = d.days || [], last = days[days.length - 1]; if (!last || !bs.length) return;
    const nice = new Date(last + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const bad = bs.filter(b => b.last && /bad/.test(b.last.verdict)), mk = d.market || {};
    const dot = v => `<i class="v2ydot ${v || 'none'}"></i>`;
    host.innerHTML = `<div class="v2note v2yline"><b>${esc(nice)}</b><span class="v2ydots">${bs.map(b => `<span${tipAttr(`${esc(b.name)}: ${({ good: 'good', normal: 'normal', bad: 'bad', vbad: 'very bad', none: 'no data' })[b.last?.verdict || 'none']}`)}>${dot(b.last?.verdict)}</span>`).join('')}</span>
      <span>${bad.length ? `${bad.length} bad day${bad.length > 1 ? 's' : ''}: ${bad.map(b => esc(b.name)).join(', ')}.` : 'No bad days.'}${mk.verdict === 'market' ? ` Meta ad costs rose 20%+ at ${mk.cpm_up} of ${mk.meta_brands} brands: looks like the market.` : ''}</span>
      <button type="button" class="v2link" data-go="yesterday" style="margin-left:auto">Open Day check ›</button></div>`;
    if (!document.getElementById('v2ycss')) { const st = document.createElement('style'); st.id = 'v2ycss'; st.textContent = '.v2yline{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.v2ydots{display:inline-flex;gap:4px}.v2ydot{width:11px;height:11px;border-radius:3px;display:inline-block;background:var(--surface-2);border:1px solid var(--line)}.v2ydot.good{background:var(--good-bg);border-color:var(--good)}.v2ydot.bad{background:var(--bad-bg);border-color:var(--bad)}.v2ydot.vbad{background:var(--bad);border-color:var(--bad)}.v2ydot.none{background:transparent;border-style:dashed}'; document.head.appendChild(st); }
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
    if (first) $('#main').innerHTML = shell('overview', title, '<div class="v2card"><p class="v2hint">Loading…</p></div>');
    let ch = null, st = null;
    try { [ch, st] = await Promise.all([get(`/api/hub/paid?platform=all&act=${encodeURIComponent(H.S.act)}&${H.rangeQ()}${modelQ()}`).catch(() => null), get(`/api/hub/store?act=${encodeURIComponent(H.S.act)}&${H.rangeQ()}`).catch(() => null)]); } catch {}
    if (t !== H.RUN()) return;
    /* Totals from the host snapshot (the same numbers every other screen uses). */
    const sum = (src, get) => { let x = 0, any = false; for (const a of all) { const w = a[src]; if (!w) continue; const v = get(w, a); if (v != null && isFinite(v)) { x += v; any = true; } } return any ? x : null; };
    const T = src => { const r = { sales: sum(src, w => w.sales), spend: sum(src, w => w.spend), orders: sum(src, w => w.orders), newRev: sum(src, w => w.new_rev), newOrd: sum(src, w => w.new_orders), cm: sum(src, (w, a) => (a.cost_health?.verdict === 'broken' ? null : w.cm)) }; r.mer = r.spend ? r.sales / r.spend : null; r.aov = r.orders ? r.sales / r.orders : null; r.cac = r.newOrd ? r.spend / r.newOrd : null; r.newShare = r.sales && r.newRev != null ? r.newRev / r.sales : null; r.cmPct = r.sales && r.cm != null ? r.cm / r.sales : null; return r; };
    const c = T('window'), p = all.some(a => a.prev) && H.S.cmp !== 'none' ? T('prev') : {};
    const merge = k => { const m = new Map(); for (const a of all) for (const r of (a[k] || [])) { const o = m.get(r.date) || { date: r.date, sales: 0, spend: 0, orders: 0 }; o.sales += r.sales || 0; o.spend += r.spend || 0; o.orders += r.orders || 0; m.set(r.date, o); } return [...m.values()].sort((x, y) => x.date < y.date ? -1 : 1); };
    const rows = merge('series'), prev = H.S.cmp !== 'none' ? merge('prev_series') : [];
    rows.forEach(r => { r.mer = r.spend ? r.sales / r.spend : null; r.aov = r.orders ? r.sales / r.orders : null; });
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

    const tiles = cur ? `<div class="v2tiles home">
      ${tile({ hero: true, label: 'Revenue', src: 'SHOPIFY', hint: 'total sales minus tax', value: kmoney(c.sales, cur), delta: delta(c.sales, p.sales), sub: `${int(c.orders)} orders · AOV ${money2(c.aov, cur)}${p.sales ? ` · ${kmoney(p.sales, cur)} ${cmpLabel()}` : ''}`, spark: spark(rows.map(r => r.sales), prev.map(r => r.sales), 300, 34, rows.map((r, i) => `<b>${day(r.date)}</b> · ${kmoney(r.sales, cur)}${prev[i] ? `<br><span class="faint">${esc(cmpLabel())}: ${kmoney(prev[i].sales, cur)}</span>` : ''}`)),
        bullet: pace ? `<div class="v2bul"${tipAttr(`Month so far ${kmoney(mtd.sales, cur)} against ${kmoney(mtd.plan, cur)} planned by now. At this pace the month lands at ${kmoney(pace.landing, cur)}; the tick is the full month plan.`)}><div class="trk"><i style="width:${Math.min(100, pace.landing / Math.max(pace.full, pace.landing) * 100 * 0.8).toFixed(1)}%;background:${pace.pct >= 0.98 ? 'var(--good)' : pace.pct >= 0.85 ? 'var(--warn)' : 'var(--bad)'}"></i><b style="left:${(pace.full / Math.max(pace.full, pace.landing) * 80).toFixed(1)}%"></b></div><div class="lb">Month so far ${kmoney(mtd.sales, cur)} of ${kmoney(mtd.plan, cur)} planned by now · pace to ${kmoney(pace.landing, cur)}</div></div>` : '', go: 'store' })}
      ${tile({ label: 'MER', src: 'BLENDED', hint: 'revenue ÷ all ad spend', value: x2(c.mer), delta: delta(c.mer, p.mer), bullet: bullet(c.mer, goalMer, false, goalMer ? `goal ${x2(goalMer)}` : ''), sub: `${kmoney(c.spend, cur)} ad spend ${delta(c.spend, p.spend, 'n')}`, spark: spark(rows.map(r => r.mer), null, 300, 34, rows.map(r => `<b>${day(r.date)}</b> · MER ${x2(r.mer)} · ${kmoney(r.sales, cur)} on ${kmoney(r.spend, cur)}`)), go: 'channels' })}
      ${tile({ label: 'Cost per new customer', src: 'TW', hint: 'lower is better', value: money(c.cac, cur), delta: delta(c.cac, p.cac, true), bullet: bullet(c.cac, goalCac, true, goalCac ? `goal ${money(goalCac, cur)}` : ''), sub: `${int(c.newOrd)} first orders`, go: 'customers' })}
      ${tile({ label: 'New customer revenue', src: 'TW', value: pct(c.newShare, 0), delta: delta(c.newShare, p.newShare, false, true), sub: `${kmoney(c.newRev, cur)} new · ${kmoney(c.sales != null && c.newRev != null ? c.sales - c.newRev : null, cur)} returning`, go: 'customers' })}
      ${tile({ label: 'Contribution margin', src: 'TW', hint: 'after every variable cost', value: kmoney(c.cm, cur), delta: delta(c.cm, p.cm), sub: c.cmPct != null ? `${pct(c.cmPct, 0)} of revenue` : 'cost data needed', go: 'profit' })}
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

    $('#main').innerHTML = shell('overview', title, `<div id="v2moved"></div><div id="v2needs"></div>${readSlot('v2read')}${tiles}
      <div class="v2two">${chart}${funnel}</div>${chTable}${brandTable}
      ${foot(`Revenue, orders, AOV, first orders and the compare deltas come from Shopify through Triple Whale for ${esc(H.rangeLabel())}. Channel revenue follows the attribution switch. Click any tile to open its screen.`)}`);
    const root = $('#main');
    wireGo(root); wireRows(root, 'overview');
    movedCard(scope);
    if (window.DeskTab && window.DeskTab.needs) window.DeskTab.needs(document.getElementById('v2needs'), H, all);
    if (rows.length > 1) wireLine('v2rev', rows, { tip: (r, i) => `<b>${day(r.date)}</b> · revenue ${kmoney(r.sales, cur)} · spend ${kmoney(r.spend, cur)}${r.spend ? ` · MER ${x2(r.sales / r.spend)}` : ''}${prev[i] ? `<br><span class="faint">${esc(cmpLabel())}: ${kmoney(prev[i].sales, cur)} on ${day(prev[i].date)}</span>` : ''}` });
    if (false && chSeries.length > 1) wireStack('v2pstack', chSeries, [{ key: 'meta', label: 'Meta', color: '--c-meta' }, { key: 'google', label: 'Google', color: '--c-google' }, { key: 'tiktok', label: 'TikTok', color: '--c-tiktok' }], cur);
    if (cur && c.sales != null) fillRead('v2read', 'overview', scope, { currency: cur, revenue: c.sales, revenue_compare: p.sales, orders: c.orders, aov: c.aov, ad_spend: c.spend, ad_spend_compare: p.spend, mer: c.mer, mer_goal: goalMer, cac: c.cac, cac_compare: p.cac, cac_goal: goalCac, new_customer_share: c.newShare, contribution_margin: c.cm,
      month_to_date: mtd.plan ? { revenue: mtd.sales, planned_by_now: mtd.plan } : null, site: fun.ses ? { sessions: fun.ses, carts: fun.cart, orders: fun.ord, sessions_before: fun.pses, orders_before: fun.pord } : null,
      channels: chRows.map(r => ({ channel: r.label, spend: r.spend, revenue: r.revenue, platform_says: r.hasP ? r.platform_revenue : null, revenue_before: r.hasPrev ? r.prev_revenue : null })),
      brands: one ? undefined : all.map(a => ({ name: a.name, revenue: a.window?.sales, revenue_before: a.prev?.sales, mer: a.window?.mer, mtd_vs_plan: a.plan?.sales && a.mtd?.sales != null ? Math.round((a.mtd.sales / a.plan.sales - 1) * 100) + '%' : null })) });
    else { const el = document.getElementById('v2read'); if (el) el.remove(); }
  }

  /* =========================================================================================
   * PAID > META (Overview and Campaigns); the segmented control is drawn by the host
   * ======================================================================================= */
  async function meta(first, view) {
    const t = H.RUN(); const one = H.S.act !== 'all';
    const title = one ? `Meta: ${esc((H.S.accounts.find(a => a.act_id === H.S.act) || {}).name || '')}` : 'Meta';
    const oneA = one ? H.S.accounts.find(a => a.act_id === H.S.act) : null;
    if (noMeta(oneA)) { $('#main').innerHTML = shell(view === 'campaigns' ? 'campaigns' : 'meta', title, noMetaCard(oneA)); return; }
    if (first) $('#main').innerHTML = shell(view === 'campaigns' ? 'campaigns' : 'meta', title, '<div class="v2card"><p class="v2hint">Loading…</p></div>');
    let d; try { d = await get(`/api/hub/paid?platform=meta&act=${encodeURIComponent(H.S.act)}&${H.rangeQ()}${modelQ()}`); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('meta', title, `<div class="v2card"><p class="v2bad">${esc(e.message)}</p></div>`); return; }
    if (t !== H.RUN()) return;
    if (!one) return metaAll(d, title);
    const b = d.brands[0], c = b.cur, p = b.prev || {}, cur = b.currency, g = b.goals || {};
    const sz = b.series || [];
    const pend = window.V2PENDING; if (pend && pend.campaign) { CAMP_OPEN.add(pend.campaign); window.V2PENDING = null; setTimeout(() => { const tr = document.querySelector(`#v2camptbl tr[data-campaign="${CSS.escape(pend.campaign)}"]`); if (tr) { tr.scrollIntoView({ block: 'center' }); tr.classList.add('v2flash'); } }, 50); }
    const pace = c.spend && d.window ? c.spend / (sz.length || 1) : null;
    const verdict = [`${kmoney(c.spend, cur)} spent${pace ? `, ${kmoney(pace, cur)} a day` : ''}.`, `${int(c.purchases)} purchases at ${money(c.cpa, cur)}${g.cpa ? ` against a ${money(g.cpa, cur)} goal` : ''}; ROAS ${x2(c.roas)}${g.roas ? ` against ${x2(g.roas)}` : ''}.`].join(' ');
    const tl = [
      tile({ compact: true, label: 'Spend', src: 'META', value: kmoney(c.spend, cur), delta: delta(c.spend, p.spend, 'n'), sub: `${int(c.impressions)} impressions` }),
      tile({ compact: true, label: 'Purchases', src: isPlat() ? 'META' : 'TW', value: int(c.purchases), delta: delta(c.purchases, p.purchases), sub: isPlat() ? '' : `Meta reports ${int(c.platform_purchases)}` }),
      tile({ compact: true, label: 'Revenue', src: isPlat() ? 'META' : 'TW', value: kmoney(c.revenue, cur), delta: delta(c.revenue, p.revenue), sub: isPlat() ? '' : `Meta reports ${kmoney(c.platform_revenue, cur)}` }),
      tile({ compact: true, label: 'ROAS', value: x2(c.roas), delta: delta(c.roas, p.roas), bullet: bullet(c.roas, g.roas, false, g.roas ? `goal ${x2(g.roas)}` : '') }),
      tile({ compact: true, label: 'Cost per purchase', hint: 'lower is better', value: money(c.cpa, cur), delta: delta(c.cpa, p.cpa, true), bullet: bullet(c.cpa, g.cpa, true, g.cpa ? `goal ${money(g.cpa, cur)}` : '') }),
      tile({ compact: true, label: 'CPM', src: 'META', value: money2(c.cpm, cur), delta: delta(c.cpm, p.cpm, true), sub: `${money2(c.cpc, cur)} per link click` }),
      tile({ compact: true, label: 'CTR', src: 'META', hint: 'link clicks', value: pct(c.ctr, 2), delta: delta(c.ctr, p.ctr, false, true), sub: `${int(c.clicks)} link clicks` }),
      tile({ compact: true, label: 'Hook · hold', src: 'META', hint: 'video', value: `${pct(c.hook, 0)} · ${pct(c.hold, 0)}`, delta: delta(c.hook, p.hook, false, true), sub: `avg daily frequency ${c.frequency ? c.frequency.toFixed(2) : '–'}` }),
    ].join('');
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
    const body = view === 'campaigns' ? `${table}` : `<p class="v2say lead">${esc(verdict)}</p><div class="v2tiles">${tl}</div>${funnel}<div class="v2two">${spendChart}${perf}</div>${table}
      <div class="v2gos"><button type="button" class="v2go" data-go="mtoday"><b>Today against a normal day</b><span>Hour by hour: is today's spend and buying running hot or cold?</span><i>›</i></button><button type="button" class="v2go" data-go="mbrowser"><b>Creative browser</b><span>Every ad with its cover and copy, and the client's own ads page link.</span><i>›</i></button><button type="button" class="v2go" data-go="changes"><b>What changed</b><span>Budgets, launches and pauses, with the reason next to each.</span><i>›</i></button></div>`;
    $('#main').innerHTML = shell(view === 'campaigns' ? 'campaigns' : 'meta', title, body + foot('Spend, impressions, clicks, CPM, CTR, frequency, hook and hold are Meta’s own. Purchases, revenue, ROAS and CPA follow the attribution switch; Meta’s own count stays beside them. Click a purchases cell for the orders behind it.'));
    const root = $('#main'); wireGo(root); wireCamp(root, b, cur);
    prefetch([`/api/hub/creative?act=${encodeURIComponent(H.S.act)}&${H.rangeQ()}${modelQ()}`]);
    if (view !== 'campaigns') { wireStack('v2camp', campSeries, ser, cur); wireLine('v2cpa', sz.map(r => ({ ...r, v: r.cpa })), { tip: (r, i) => `<b>${day(r.date)}</b> · CPA ${money(r.cpa, cur)} · ${int(r.purchases)} purchases on ${kmoney(r.spend, cur)}` }); }
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
    const body = `${cur ? `<div class="v2tiles">${[
        tile({ compact: true, label: 'Spend', src: 'META', value: kmoney(spend, cur), delta: delta(spend, pspend, 'n'), sub: `${bs.length} brands spending` }),
        tile({ compact: true, label: 'Purchases', src: isPlat() ? 'META' : 'TW', value: int(ord), delta: delta(ord, pord) }),
        tile({ compact: true, label: 'ROAS', value: x2(spend ? rev / spend : null), delta: delta(spend ? rev / spend : null, pspend ? prev / pspend : null) }),
        tile({ compact: true, label: 'Cost per purchase', hint: 'lower is better', value: money(ord ? spend / ord : null, cur), delta: delta(ord ? spend / ord : null, pord ? pspend / pord : null, true) })].join('')}</div>` : ''}
      ${card('Each brand on Meta', 'Click a brand to open its Meta screen.', `<div class="v2tbl"><table><thead><tr><th>Brand</th><th>Spend</th><th>Purchases</th><th>Revenue</th><th>ROAS</th><th>CPA</th><th>Goal CPA</th><th>CPM</th><th>CTR</th><th>Hook</th></tr></thead><tbody>
        ${bs.sort((x, y) => y.cur.spend - x.cur.spend).map(b => { const c = b.cur, p = b.prev || {}, g = b.goals || {}; return `<tr data-act="${esc(b.act_id)}" tabindex="0" class="link"><td><b>${esc(b.name)}</b></td><td>${ib(c.spend, mx, '--c-meta', kmoney(c.spend, b.currency))}</td><td>${int(c.purchases)} ${delta(c.purchases, p.purchases)}</td><td>${kmoney(c.revenue, b.currency)}</td><td>${x2(c.roas)}</td>
          <td class="${!g.cpa || c.cpa == null ? '' : c.cpa <= g.cpa ? 'good' : 'bad'}">${money(c.cpa, b.currency)} ${delta(c.cpa, p.cpa, true)}</td><td class="faint">${g.cpa ? money(g.cpa, b.currency) : '–'}</td><td>${money2(c.cpm, b.currency)}</td><td>${pct(c.ctr, 2)}</td><td>${pct(c.hook, 0)}</td></tr>`; }).join('')}
      </tbody></table></div>`, `Attribution: <b>${esc(MODEL_SHORT[H.S.model])}</b>`)}`;
    $('#main').innerHTML = shell('meta', title, body); wireRows($('#main'), 'meta');
  }

  /* =========================================================================================
   * PAID > CREATIVE: what is working, by component, and when it tires
   * ======================================================================================= */
  async function creative(first) {
    const t = H.RUN(); const a = H.S.accounts.find(x => x.act_id === H.S.act);
    if (!a) { $('#main').innerHTML = shell('adcreative', 'Creative', `<div class="v2card"><p class="v2hint">Pick one brand in the menu to see its creative.</p></div>`); return; }
    const title = `Creative: ${esc(a.name)}`;
    if (noMeta(a)) { $('#main').innerHTML = shell('adcreative', title, noMetaCard(a)); return; }
    if (first) $('#main').innerHTML = shell('adcreative', title, '<div class="v2card"><p class="v2hint">Loading…</p></div>');
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
    const own = r => { const G = goal; if (!goal) return 'thin'; if (r.age != null && r.age < K.days) return 'new'; if (r.spend < goal * K.jx) return 'thin';
      if (r.purchases >= K.buys && r.cpa <= G) return 'scale';
      if ((!r.purchases && r.spend >= G * K.zx) || (r.purchases && r.spend >= G * K.sx && r.cpa > G * K.cx)) return 'cut';
      return 'watch'; };
    const setCall = x => { const G = goal; if (!goal || !x) return null; if (x.spend < goal * K.jx) return 'thin'; if (x.purchases >= K.buys && x.cpa <= G) return 'scale';
      if ((!x.purchases && x.spend >= G * K.zx) || (x.purchases && x.spend >= G * K.sx && x.cpa > G * K.cx)) return 'cut'; return 'watch'; };
    const role = r => !r.adset || r.adset.ads <= 1 ? 'solo' : (r.set_share >= K.anchor || (r.set_rank === 1 && r.set_share >= K.anchor - 0.1)) ? 'anchor' : 'support';
    const funnelRole = r => r.fc_rev == null || r.lc_rev == null || (r.fc_rev + r.lc_rev) < (goal || 50) ? null : r.fc_rev >= r.lc_rev * 1.3 ? 'opener' : r.lc_rev >= r.fc_rev * 1.3 ? 'closer' : null;
    const verdict = r => { const o = own(r); if (o === 'new' || o === 'thin') return o; const sc = setCall(r.adset), ro = role(r);
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
    const VL = { scale: ['Scale', 'good'], keep: ['Keep: carries the set', 'good'], watch: ['Watch', 'warn'], trim: ['Trim', 'warn'], cut: ['Cut', 'bad'], thin: ['Not enough spend', ''], new: ['Too new', ''] };
    const FR = { opener: ['Opener', 'Triple Whale credits it far more on first click: it starts journeys (top of funnel).'], closer: ['Closer', 'Triple Whale credits it more on the last click: it closes people already warmed up.'] };
    MED = medians(ads, goal || 50);
    const RULE = `<b>The ad set first.</b> A set (and an ad) is judged once it has spent ${K.jx}x the goal CPA (${money(goal * K.jx, cur)}) and run ${K.days} days. <b>Scale</b>: ${K.buys}+ purchases at or under the goal. <b>Cut</b>: ${K.zx}x the goal spent with no purchase, or ${K.sx}x spent at a CPA over ${K.cx}x the goal. A set that misses means <b>Cut</b> for every ad in it. In a set that works, the ad carrying ${Math.round(K.anchor * 100)}%+ of its spend reads <b>Keep</b> (replace it, never just switch it off) and a small ad over the cut line reads <b>Trim</b>. <button type="button" class="v2link" data-go="settings">Change these ›</button>`;
    const top = ads.slice(0, 60);
    /* Quadrant: spend (x, log) against CPA (y), bubble = purchases, goal line. */
    const quad = (() => {
      const w = 560, h = 330, pl = 58, pr = 14, pt = 14, pb = 40; const pts = top.filter(r => r.spend > 0);
      if (pts.length < 3) return '<p class="v2hint">Not enough ads with spend.</p>';
      const sx = Math.log10(Math.max(...pts.map(r => r.spend))), sx0 = Math.log10(Math.max(1, Math.min(...pts.map(r => r.spend))));
      const cpas = pts.map(r => r.cpa ?? (goal ? goal * 3 : 0)); const ymx = Math.min(Math.max(...cpas, goal || 0) * 1.1, (goal || Math.max(...cpas)) * 4);
      const X = v => pl + (Math.log10(Math.max(1, v)) - sx0) / Math.max(0.3, sx - sx0) * (w - pl - pr), Y = v => pt + (1 - Math.min(v, ymx) / ymx) * (h - pt - pb);
      const col = r => ({ scale: '--good', keep: '--c-meta', watch: '--warn', trim: '--warn', cut: '--bad', thin: '--v2-cmp', new: '--v2-cmp' })[verdict(r)];
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
    const gallery = `<div class="v2gal">${ads.slice(0, 24).map(r => { const v = verdict(r); return `<div class="g" data-ad="${esc(r.id)}"><div class="th" data-thumb="${esc(r.id)}" data-prev="${esc(r.id)}" role="button" tabindex="0" aria-label="Preview ${esc(r.name)}"><span class="v2play-s">▶</span><span class="v2pill ${VL[v][1]}"${whyOf(r) ? tipAttr(esc(whyOf(r))) : ''}>${VL[v][0]}</span><em>${esc(r.media_type || '')}${r.age != null ? ` · ${r.age}d` : ''}</em></div><div class="b"><b title="${esc(r.name)}">${esc(r.name)}</b>
      ${role(r) !== 'solo' || funnelRole(r) || valTag(r) ? `<div class="v2roles">${role(r) !== 'solo' ? `<span${tipAttr(esc(whyOf(r)))}>${role(r) === 'anchor' ? 'Anchor' : 'Support'} · ${pct(r.set_share, 0)} of set</span>` : ''}${funnelRole(r) ? `<span class="${funnelRole(r)}"${tipAttr(FR[funnelRole(r)][1])}>${FR[funnelRole(r)][0]}</span>` : ''}${valTag(r) ? `<span class="${valTag(r) === 'more' ? 'val' : 'lowval'}"${tipAttr(esc(valNote(r)))}>${valTag(r) === 'more' ? 'Customers come back' : 'Customers don’t come back'}</span>` : ''}</div>` : ''}
      <div class="kv"><span>Spend</span><b>${kmoney(r.spend, cur)}</b><span>CPA</span><b class="${!goal || r.cpa == null ? '' : r.cpa <= goal ? 'good' : 'bad'}">${money(r.cpa, cur)}</b><span>ROAS</span><b>${x2(r.roas)}</b><span>Hook</span><b>${pct(r.hook, 0)}</b><span>CTR</span><b>${pct(r.ctr, 2)}</b><span>Purch.</span><b><button type="button" class="v2cell" data-drill="ad:${esc(r.id)}">${int(r.purchases)}</button></b>${r.ltv_n >= 5 ? `<span${tipAttr(`${r.ltv_n} customers this ad started (first click, first order 90+ days ago) spent ${money(r.ltv90, cur)} each in their first 90 days: ${x2(r.ltv_x)} their first order.`)}>90-day value</span><b class="${r.ltv_x >= 1.3 ? 'good' : ''}">${money(r.ltv90, cur)}</b>` : ''}</div>${r.angle ? `<span class="ang">${esc(r.angle)}</span>` : ''}</div></div>`; }).join('')}</div>`;
    const counts = ads.reduce((s, r) => { s[verdict(r)] = (s[verdict(r)] || 0) + 1; return s; }, {});
    const body = `<p class="v2say lead">${ads.length} ads spent in this window. <b class="good">${counts.scale || 0} to scale</b>${counts.keep ? `, <b>${counts.keep} carrying a working set</b>` : ''}, <b class="warn">${counts.watch || 0} to watch</b>${counts.trim ? `, <b class="warn">${counts.trim} to trim</b>` : ''}, <b class="bad">${counts.cut || 0} to cut</b>${counts.thin || counts.new ? `, ${(counts.thin || 0) + (counts.new || 0)} not judged yet` : ''}, against the ${money(goal, cur)} ${g.cpa ? 'goal' : 'account average'}.${firstFat ? ` Ads start costing more from <b>${esc(firstFat.label.toLowerCase())}</b>.` : ''}</p>
      <div class="v2note v2rule"><span class="v2pill">How the calls work</span><span>${RULE}</span></div>
      ${card('The ads, by spend', 'Click an ad to see it play, its copy and its numbers.', gallery, `Attribution: <b>${esc(MODEL_SHORT[H.S.model])}</b>`)}
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
    root.querySelectorAll('[data-drill]').forEach(btn => btn.onclick = e => { e.stopPropagation(); drillOrders(btn.closest('.g')?.querySelector('b')?.textContent || 'Orders', `ad=${encodeURIComponent(btn.dataset.drill.split(':')[1])}`); });
    /* Covers after the paint; any card opens the preview. */
    const byId = new Map(ads.map(r => [r.id, r]));
    const ctxOf = r => ({ call: VL[verdict(r)], why: whyOf(r), role: role(r), fr: funnelRole(r) && FR[funnelRole(r)], set: r.adset, setCall: setCall(r.adset) });
    root.querySelectorAll('tr[data-prev]').forEach(el => { el.onclick = () => { const r = byId.get(el.dataset.prev); if (r) previewAd(r, cur, g, ctxOf(r)); }; });
    root.querySelectorAll('.v2gal [data-prev]').forEach(el => { const go = () => previewAd(byId.get(el.dataset.prev), cur, g, ctxOf(byId.get(el.dataset.prev))); el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter') go(); }; });
    loadThumbs(root, ads.slice(0, 24).map(r => r.id));
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
    if (first) $('#main').innerHTML = shell(kind, title, '<div class="v2card"><p class="v2hint">Loading…</p></div>');
    let d; try { d = await get(`/api/hub/paid?platform=${kind}&act=${encodeURIComponent(H.S.act)}&${H.rangeQ()}${modelQ()}`); } catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell(kind, title, `<div class="v2card"><p class="v2bad">${esc(e.message)}</p></div>`); return; }
    if (t !== H.RUN()) return;
    const bs = d.brands.filter(b => (b.cur.spend || 0) > 0 || (b.cur.revenue || 0) > 0); const cur = oneCur(bs.length ? bs : d.brands);
    const sum = (k, src = 'cur') => bs.reduce((s, b) => s + ((b[src] || {})[k] || 0), 0);
    const c = { spend: sum('spend'), rev: sum('revenue'), ord: sum('purchases'), pr: sum('platform_revenue'), impr: sum('impressions'), clicks: sum('clicks') };
    const p = { spend: sum('spend', 'prev'), rev: sum('revenue', 'prev'), ord: sum('purchases', 'prev') };
    const m = new Map(); for (const b of bs) for (const r of b.series || []) { const o = m.get(r.date) || { date: r.date, spend: 0, revenue: 0, platform_revenue: 0 }; o.spend += r.spend || 0; o.revenue += r.revenue || 0; o.platform_revenue += r.platform_revenue || 0; m.set(r.date, o); }
    const rows = [...m.values()].sort((x, y) => x.date < y.date ? -1 : 1);
    const pm = new Map(); for (const b of bs) for (const r of b.prev_series || []) { const o = pm.get(r.date) || { date: r.date, revenue: 0, spend: 0 }; o.revenue += r.revenue || 0; o.spend += r.spend || 0; pm.set(r.date, o); }
    const prows = [...pm.values()].sort((x, y) => x.date < y.date ? -1 : 1);
    const g = one && bs[0] ? bs[0].goals || {} : {};
    const body = !bs.length ? `${card(`${P.label} is not connected directly`, '', `<p class="v2hint">No ${P.label} spend in this window${one ? ' for this brand' : ''}, as far as Triple Whale sees. ${esc(P.adds)}</p>${kind === 'tiktok' ? '<div id="v2ttc" style="margin-top:10px"></div>' : '<button type="button" class="v2btn" data-go="settings">Open Integrations</button>'}`)}` : `
      <div class="v2note"><span class="v2pill warn">via Triple Whale</span> <span>${P.label} is not connected to Locus directly yet, so this page shows what Triple Whale carries: ${P.label}'s daily spend, impressions and clicks, and the orders Triple Whale credits to ${P.label}. No campaigns or ads until it is connected.</span> <button type="button" class="v2link" data-go="settings">Connections ›</button></div>
      <div class="v2tiles">${[
        tile({ compact: true, label: 'Spend', src: P.label.toUpperCase(), value: kmoney(c.spend, cur), delta: delta(c.spend, p.spend, 'n'), sub: `${int(c.impr)} impressions · ${pct(c.impr ? c.clicks / c.impr : null, 2)} CTR` }),
        tile({ compact: true, label: 'Revenue', src: isPlat() ? P.label.toUpperCase() : 'TW', value: kmoney(isPlat() ? c.pr : c.rev, cur), delta: delta(c.rev, p.rev), sub: isPlat() ? '' : `${P.label} reports ${kmoney(c.pr, cur)}` }),
        tile({ compact: true, label: 'ROAS', value: x2(c.spend ? (isPlat() ? c.pr : c.rev) / c.spend : null), delta: delta(c.spend ? c.rev / c.spend : null, p.spend ? p.rev / p.spend : null), bullet: bullet(c.spend ? c.rev / c.spend : null, g.roas, false, g.roas ? `goal ${x2(g.roas)}` : '') }),
        tile({ compact: true, label: 'Cost per purchase', hint: 'lower is better', value: money(c.ord ? c.spend / c.ord : null, cur), delta: delta(c.ord ? c.spend / c.ord : null, p.ord ? p.spend / p.ord : null, true), sub: `${int(c.ord)} purchases`, bullet: bullet(c.ord ? c.spend / c.ord : null, g.cpa, true, g.cpa ? `goal ${money(g.cpa, cur)}` : '') })].join('')}</div>
      ${cur && rows.length > 1 ? card('Revenue and spend by day', `Revenue credited to ${P.label} under ${esc(MODEL_SHORT[H.S.model])}.`, legend([{ color: '--brand', label: 'Revenue' }, { color: '--c-google', label: 'Spend' }, ...(prows.length ? [{ dash: true, label: cmpLabel() }] : [])]) + lineChart('v2plat', rows.map(r => ({ ...r, v: r.revenue, s: r.spend })), { key: 'v', key2: 's', prev: prows.map(r => ({ ...r, v: r.revenue })), cur })) : ''}
      ${!one ? card(`Each brand on ${P.label}`, 'Click a brand to open it.', `<div class="v2tbl"><table><thead><tr><th>Brand</th><th>Spend</th><th>Revenue</th><th>${esc(P.label)} says</th><th>Gap</th><th>ROAS</th><th>CPA</th><th>CTR</th></tr></thead><tbody>${bs.sort((x, y) => y.cur.spend - x.cur.spend).map(b => { const x = b.cur; const gap = isPlat() || x.platform_revenue == null ? null : x.revenue - x.platform_revenue; return `<tr data-act="${esc(b.act_id)}" tabindex="0" class="link"><td><b>${esc(b.name)}</b></td><td>${ib(x.spend, Math.max(...bs.map(y => y.cur.spend), 1), P.color, kmoney(x.spend, b.currency))}</td><td>${kmoney(x.revenue, b.currency)} ${delta(x.revenue, b.prev?.revenue)}</td><td class="faint">${kmoney(x.platform_revenue, b.currency)}</td><td class="${gap == null ? '' : gap >= 0 ? 'good' : 'bad'}">${gap == null ? '–' : (gap >= 0 ? '+' : '−') + kmoney(Math.abs(gap), b.currency)}</td><td>${x2(x.roas)}</td><td>${money(x.cpa, b.currency)}</td><td>${pct(x.ctr, 2)}</td></tr>`; }).join('')}</tbody></table></div>`, `Attribution: <b>${esc(MODEL_SHORT[H.S.model])}</b>`) : ''}
      ${one ? `<div class="v2gos"><button type="button" class="v2go" data-drill="platform:${kind}"><b>The orders ${esc(P.label)} is credited with</b><span>Each order, its value, whether it was a first order, and the customer's whole journey.</span><i>›</i></button><button type="button" class="v2go" data-go="channels"><b>${esc(P.label)} next to every other channel</b><span>Spend, revenue, ROAS and new customers side by side, with each platform's own claim.</span><i>›</i></button></div>` : ''}
      ${card(`What connecting ${P.label} directly adds`, '', `<p class="v2hint">${esc(P.adds)}</p><p class="v2hint" style="margin-top:8px">${kind === 'google' ? 'What it needs from Cole: a Google Cloud project with the Google Ads API switched on, and a Google Ads developer token from the agency manager account.' : 'What it needs from Cole: a TikTok for Business developer app approved for the Marketing API (steps in Agency settings > Integrations > TikTok app), then one sign-in here with Connect TikTok.'}</p>${kind === 'tiktok' ? '<div id="v2ttc" style="margin-top:10px"></div>' : ''}`)}`;
    $('#main').innerHTML = shell(kind, title, body + foot(`Spend, impressions and clicks are ${P.label}’s own as Triple Whale carries them. Revenue and purchases follow the attribution switch; ${P.label}’s own figures sit beside them.`));
    const root = $('#main'); wireGo(root); wireRows(root, kind);
    if (rows.length > 1) wireLine('v2plat', rows, { tip: r => `<b>${day(r.date)}</b> · revenue ${kmoney(r.revenue, cur)} · spend ${kmoney(r.spend, cur)}${r.spend ? ` · ROAS ${x2(r.revenue / r.spend)}` : ''}` });
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
    /* Google Ads read directly, once the brand is linked and the developer token is set: campaigns by type. */
    if (kind === 'google' && one) {
      const w = win(); H.apiAH(`/api/google/ads?act=${encodeURIComponent(H.S.act)}&from=${w.from}&to=${w.to}`).then(g => {
        if (t !== H.RUN() || !g || g.error || !(g.campaigns || []).length) return;
        const mx = Math.max(...g.campaigns.map(x => x.spend), 1), cur2 = cur;
        const html = card('Campaigns, from Google Ads directly', 'Google’s own conversions and value; spend is exact.', `<div class="v2tbl wide"><table><thead><tr><th>Campaign</th><th>Type</th><th>Spend</th><th>Clicks</th><th>Conversions</th><th>Value</th><th>ROAS</th><th>CPA</th></tr></thead><tbody>${g.campaigns.map(x => `<tr><td><span class="nm" title="${esc(x.name)}">${esc(x.name)}</span>${x.status !== 'ENABLED' ? ` <span class="v2pill">${esc(String(x.status).toLowerCase())}</span>` : ''}</td><td>${esc(String(x.type || '').replace(/_/g, ' ').toLowerCase())}</td><td>${ib(x.spend, mx, '--c-google', kmoney(x.spend, cur2))}</td><td>${int(x.clicks)}</td><td>${x.conversions.toFixed(1)}</td><td>${kmoney(x.value, cur2)}</td><td>${x2(x.spend ? x.value / x.spend : null)}</td><td>${money(x.conversions ? x.spend / x.conversions : null, cur2)}</td></tr>`).join('')}</tbody></table></div>`, 'Google Ads API');
        const note = root.querySelector('.v2note'); if (note) note.insertAdjacentHTML('afterend', html);
      }).catch(() => {});
    }
  }

  /* =========================================================================================
   * PAID > ALL CHANNELS
   * ======================================================================================= */
  async function channels(first) {
    const t = H.RUN(); const one = H.S.act !== 'all';
    const title = one ? `All channels: ${esc((H.S.accounts.find(a => a.act_id === H.S.act) || {}).name || '')}` : 'All channels';
    if (first) $('#main').innerHTML = shell('channels', title, '<div class="v2card"><p class="v2hint">Loading…</p></div>');
    let d; try { d = await get(`/api/hub/paid?platform=all&act=${encodeURIComponent(H.S.act)}&${H.rangeQ()}${modelQ()}`); } catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('channels', title, `<div class="v2card"><p class="v2bad">${esc(e.message)}</p></div>`); return; }
    if (t !== H.RUN()) return;
    const bs = d.brands; const cur = oneCur(bs);
    const agg = {}; for (const b of bs) for (const r of b.rows) { const o = agg[r.id] ||= { id: r.id, label: r.label, spend: 0, revenue: 0, platform_revenue: 0, prev_revenue: 0, prev_spend: 0, nc: 0, hasP: false }; o.spend += r.spend || 0; o.revenue += r.revenue || 0; if (r.platform_revenue != null) { o.platform_revenue += r.platform_revenue; o.hasP = true; } o.prev_revenue += r.prev_revenue || 0; o.prev_spend += r.prev_spend || 0; o.nc += r.nc || 0; }
    const rows = Object.values(agg); const rev = bs.reduce((s, b) => s + (b.revenue || 0), 0), spend = bs.reduce((s, b) => s + (b.blended_spend || 0), 0), prev = bs.reduce((s, b) => s + (b.prev_revenue || 0), 0), pspend = bs.reduce((s, b) => s + (b.prev_blended || 0), 0);
    const paid = rows.filter(r => r.spend > 0); const best = paid.slice().sort((x, y) => (y.revenue / y.spend) - (x.revenue / x.spend))[0];
    const m = new Map(); for (const b of bs) for (const r of b.series || []) { const o = m.get(r.date) || { date: r.date, meta: 0, google: 0, tiktok: 0 }; o.meta += r.meta; o.google += r.google; o.tiktok += r.tiktok; m.set(r.date, o); }
    const series = [...m.values()].sort((x, y) => x.date < y.date ? -1 : 1); const ser = [{ key: 'meta', label: 'Meta', color: '--c-meta' }, { key: 'google', label: 'Google', color: '--c-google' }, { key: 'tiktok', label: 'TikTok', color: '--c-tiktok' }];
    const mx = Math.max(...rows.map(r => r.revenue || 0), 1);
    const body = `${cur ? `<div class="v2tiles">${[
        tile({ compact: true, label: 'Revenue', src: 'SHOPIFY', value: kmoney(rev, cur), delta: delta(rev, prev) }),
        tile({ compact: true, label: 'Blended ad spend', src: 'TW', value: kmoney(spend, cur), delta: delta(spend, pspend, 'n') }),
        tile({ compact: true, label: 'MER', src: 'BLENDED', value: x2(spend ? rev / spend : null), delta: delta(spend ? rev / spend : null, pspend ? prev / pspend : null) }),
        tile({ compact: true, label: 'Most efficient paid dollar', value: best ? esc(best.label) : '–', sub: best ? `${x2(best.revenue / best.spend)} on ${kmoney(best.spend, cur)}` : '' })].join('')}</div>` : ''}
      ${card('Every channel', isPlat() ? 'On the platforms’ own numbers.' : `Credited under ${esc(MODEL_SHORT[H.S.model])}, with each platform’s own number and the gap.`, `<div class="v2tbl"><table><thead><tr><th>Channel</th><th>Spend</th><th>Revenue</th><th>Platform says</th><th>Gap</th><th>Share</th><th>ROAS</th><th>First orders</th><th>CAC</th><th>vs before</th></tr></thead><tbody>
        ${rows.map(r => { const gap = !isPlat() && r.hasP && r.spend ? r.revenue - r.platform_revenue : null; return `<tr${['meta', 'google', 'tiktok'].includes(r.id) ? ` data-go="${r.id}" class="link"` : ''}><td><span class="sw" style="background:var(${CH[r.id] || '--c-else'})"></span>${esc(r.label)}</td><td>${r.spend ? kmoney(r.spend, cur) : '<span class="faint">–</span>'}</td><td>${ib(r.revenue, mx, CH[r.id] || '--c-else', kmoney(r.revenue, cur))}</td><td class="faint">${r.hasP && r.spend ? kmoney(r.platform_revenue, cur) : '–'}</td><td class="${gap == null ? '' : gap >= 0 ? 'good' : 'bad'}">${gap == null ? '–' : (gap >= 0 ? '+' : '−') + kmoney(Math.abs(gap), cur)}</td><td>${rev ? pct(r.revenue / rev, 0) : '–'}</td><td>${r.spend ? x2(r.revenue / r.spend) : '–'}</td><td>${int(r.nc)}</td><td>${r.spend && r.nc ? money(r.spend / r.nc, cur) : '–'}</td><td>${r.prev_revenue ? delta(r.revenue, r.prev_revenue) : ''}</td></tr>`; }).join('')}
      </tbody></table></div>`, `Attribution: <b>${esc(MODEL_SHORT[H.S.model])}</b>`)}
      ${series.length > 1 ? card('Spend by platform, by day', '', legend(ser) + stackChart('v2chs', series, ser, { cur })) : ''}
      ${!one ? card('Each brand, paid mix', '', `<div class="v2tbl"><table><thead><tr><th>Brand</th><th>Revenue</th><th>Blended spend</th><th>MER</th><th>Meta</th><th>Google</th><th>TikTok</th><th>Email</th></tr></thead><tbody>${bs.filter(b => b.revenue).sort((x, y) => y.revenue - x.revenue).map(b => { const r = id => b.rows.find(x => x.id === id); const cell = (id, k) => r(id) ? kmoney(r(id)[k], b.currency) : '<span class="faint">–</span>'; return `<tr data-act="${esc(b.act_id)}" tabindex="0" class="link"><td><b>${esc(b.name)}</b></td><td>${kmoney(b.revenue, b.currency)} ${delta(b.revenue, b.prev_revenue)}</td><td>${kmoney(b.blended_spend, b.currency)}</td><td>${x2(b.blended_spend ? b.revenue / b.blended_spend : null)}</td><td>${cell('meta', 'spend')}</td><td>${cell('google', 'spend')}</td><td>${cell('tiktok', 'spend')}</td><td>${cell('email', 'revenue')}</td></tr>`; }).join('')}</tbody></table></div>`) : ''}`;
    $('#main').innerHTML = shell('channels', title, body + foot('Revenue is the store’s (Shopify, through Triple Whale). Spend is each platform’s own. Click models let two platforms claim one order, so channel revenue can add to more than revenue.'));
    const root = $('#main'); wireGo(root); wireRows(root, 'channels'); if (series.length > 1) wireStack('v2chs', series, ser, cur);
    /* Two models side by side (2026-10-08, research-v3 3.1): the screen's model against any other, per
       channel, so "Meta gets credit for X under last click and Y under first click" is one glance. */
    const cmpHost = document.createElement('div'); const tbl = root.querySelector('.v2card'); if (tbl) tbl.after(cmpHost);
    let other = MODEL2.get(); if (!other || other === H.S.model || !MODEL_SHORT[other]) other = H.S.model === 'fullFirstClick' ? 'lastPlatformClick' : 'fullFirstClick';
    const drawCmp = async m2 => {
      cmpHost.innerHTML = card('Two models side by side', '', '<p class="v2hint">Reading…</p>');
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
    if (first) $('#main').innerHTML = shell('store', title, '<div class="v2card"><p class="v2hint">Loading…</p></div>');
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
    if (first) $('#main').innerHTML = shell('inspo', title, '<div class="v2card"><p class="v2hint">Reading the boards…</p></div>');
    let sd; try { sd = await get(`/api/season?act=${encodeURIComponent(a.act_id)}`); } catch (e) { sd = null; }
    if (t !== H.RUN()) return;
    const sa = (sd?.accounts || []).find(x => x.act_id === a.act_id) || {};
    const boards = []; if (sa.swipe_brand) boards.push({ id: sa.swipe_brand.id, name: `${a.name}’s board`, k: 'brand' });
    const seen = new Set(boards.map(b => b.id)); for (const p of sa.phases || []) if (p.swipe && !seen.has(p.swipe.id)) { seen.add(p.swipe.id); boards.push({ id: p.swipe.id, name: p.swipe.name.replace(/^BFCM \/ /, ''), k: 'season' }); }
    if (!boards.length) { $('#main').innerHTML = shell('inspo', title, card('No board yet', '', '<p class="v2hint">Make a board for this brand in Atria and save reference ads into it; they show here for the whole team.</p>')); return; }
    const pick = INSPO.get(a.act_id) || boards[0].id;
    $('#main').innerHTML = shell('inspo', title, `<p class="v2say lead">Reference ads the team saved in Atria. Long-running ads are usually the profitable ones: a signal, not proof.</p>
      <div class="v2jobs">${boards.map(b => `<button type="button" data-board="${esc(b.id)}" class="${b.id === pick ? 'on' : ''}">${esc(b.name)}</button>`).join('')}</div><div id="v2inspo"><div class="v2card"><p class="v2hint">Reading Atria…</p></div></div>`);
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
    host.innerHTML = card('Klaviyo across every brand', '', '<p class="v2hint">Reading each brand’s Klaviyo…</p>');
    const CORE = { welcome: /welcome/i, 'abandoned cart': /cart/i, checkout: /checkout/i, browse: /browse/i, 'post purchase': /post.?purchase|thank/i, winback: /win.?back/i };
    const rows = await Promise.all(bs.map(async b => {
      const [ov, fl, cp] = await Promise.all(['overview', 'flows_report', 'campaigns'].map(w => H.apiAH(`/api/klaviyo?act=${encodeURIComponent(b.act_id)}&what=${w}`).catch(e => ({ error: e.message }))));
      if (!ov || ov.error) return { b, off: true };
      const live = ov.live_flows || []; const missing = Object.keys(CORE).filter(k => !live.some(f => CORE[k].test(f)));
      const flows = (fl && fl.flows) || []; const camps = ((cp && cp.campaigns) || []).filter(x => x.recipients);
      const fRev = flows.reduce((s, x) => s + (x.revenue || 0), 0), cRev = camps.reduce((s, x) => s + (x.conversion_value || 0), 0);
      const rec = camps.reduce((s, x) => s + (x.recipients || 0), 0);
      const wavg = k => rec ? camps.reduce((s, x) => s + (x[k] || 0) * (x.recipients || 0), 0) / rec : null;
      const top = flows.slice().sort((x, y) => (y.revenue || 0) - (x.revenue || 0))[0];
      return { b, live: live.length, missing, fRev, cRev, open: wavg('open_rate'), click: wavg('click_rate'), rpr: rec ? cRev / rec : null, sends: camps.length, top };
    }));
    if (t !== H.RUN()) return;
    const on = rows.filter(r => !r.off), off = rows.filter(r => r.off && !/golf sock/i.test(r.b.name));   // The Golf Sock is a paused test account: never flagged
    const mx = Math.max(...on.map(r => r.fRev + r.cRev), 1);
    const gaps = on.filter(r => r.missing.length);
    host.innerHTML = card('Klaviyo across every brand', `${on.length} brand${on.length === 1 ? '' : 's'} connected.${gaps.length ? ` ${gaps.length} ${gaps.length === 1 ? 'is' : 'are'} missing a core flow.` : ' Every connected brand runs its core flows.'}`,
      `<div class="v2tbl wide"><table><thead><tr><th>Brand</th><th>Klaviyo revenue, 90 days</th><th>Flows</th><th>Campaigns</th><th>Live flows</th><th>Missing core flows</th><th>Open</th><th>Click</th><th>Per recipient</th><th>Best flow</th></tr></thead><tbody>
      ${on.sort((x, y) => (y.fRev + y.cRev) - (x.fRev + x.cRev)).map(r => `<tr data-act="${esc(r.b.act_id)}" tabindex="0" class="link"><td><b>${esc(r.b.name)}</b></td><td>${ib(r.fRev + r.cRev, mx, '--c-email', kmoney(r.fRev + r.cRev, r.b.currency), `Flows ${kmoney(r.fRev, r.b.currency)} · campaigns ${kmoney(r.cRev, r.b.currency)} (last ${r.sends} sends)`)}</td><td>${kmoney(r.fRev, r.b.currency)}</td><td>${kmoney(r.cRev, r.b.currency)}</td><td>${r.live}</td>
        <td>${r.missing.length ? r.missing.map(m => `<span class="v2pill warn">${esc(m)}</span>`).join(' ') : '<span class="v2pill good">none</span>'}</td>
        <td class="${r.open == null ? '' : r.open >= BENCH.open ? 'good' : 'warn'}">${pct(r.open, 1)}</td><td class="${r.click == null ? '' : r.click >= BENCH.click ? 'good' : 'warn'}">${pct(r.click, 2)}</td><td>${money2(r.rpr, r.b.currency)}</td><td><span class="nm" title="${esc(r.top?.name || '')}">${esc(r.top?.name || '–')}</span></td></tr>`).join('')}
      </tbody></table></div>${off.length ? `<p class="v2hint" style="margin-top:10px">Not connected to Klaviyo directly: ${esc(off.map(r => r.b.name).join(', '))}. Brand settings > Integrations > paste each brand’s private key.</p>` : ''}`,
      'Klaviyo’s own attribution · open and click are the last 30 campaigns, weighted by recipients');
    wireRows(host, 'email');
  }   // Klaviyo published 2026 campaign averages (research-email-sms.md)
  async function email(first) {
    const t = H.RUN(); const one = H.S.act !== 'all'; const a = H.S.accounts.find(x => x.act_id === H.S.act);
    const title = one ? `Email and SMS: ${esc(a?.name || '')}` : 'Email and SMS';
    if (first) $('#main').innerHTML = shell('email', title, '<div class="v2card"><p class="v2hint">Loading…</p></div>');
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
      <div id="v2kl"><div class="v2card"><p class="v2hint">Reading Klaviyo…</p></div></div>`;
    $('#main').innerHTML = shell('email', title, body0 + foot('Revenue is Klaviyo’s placed-order attribution as Triple Whale carries it. Campaign and flow tables are Klaviyo’s own results for the last 90 days, refreshed every 6 hours. Benchmarks are Klaviyo’s published 2026 averages.'));
    if ((b.series || []).length > 1) wireStack('v2em', b.series, [{ key: 'flows', label: 'Flows', color: '--c-email' }, { key: 'campaigns', label: 'Campaigns', color: '--brand' }], cur);
    let ov, camps, flows;
    try { [ov, camps, flows] = await Promise.all([H.apiAH(`/api/klaviyo?act=${encodeURIComponent(a.act_id)}&what=overview`), H.apiAH(`/api/klaviyo?act=${encodeURIComponent(a.act_id)}&what=campaigns`).catch(() => null), H.apiAH(`/api/klaviyo?act=${encodeURIComponent(a.act_id)}&what=flows_report`).catch(() => null)]); } catch (e) { ov = { error: e.message }; }
    if (t !== H.RUN()) return; const host = document.getElementById('v2kl'); if (!host) return;
    if (!ov || ov.error) { host.innerHTML = card(`Klaviyo is not connected for ${esc(a.name)}`, '', `<p class="v2hint">${esc(ov?.error || '')}</p><button type="button" class="v2btn" data-go="settings">Open Integrations</button>`); wireGo(host); return; }
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
    if (first) $('#main').innerHTML = shell('website', title, '<div class="v2card"><p class="v2hint">Reading Google Analytics…</p></div>');
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
    if (first) $('#main').innerHTML = shell('search', title, '<div class="v2card"><p class="v2hint">Reading Search Console…</p></div>');
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
    if (first) $('#main').innerHTML = shell('library', title, '<div class="v2card"><p class="v2hint">Reading the library…</p></div>');
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
  window.V2UI = { markDots, clearDots, tile, card, spark, bullet, ib, legend, lineChart, wireLine, stackChart, wireStack, panel, tipAttr, foot, chip, esc, kmoney, money, money2, pct, x2, int, day,
    setHost: h => { if (!H) H = h; } };

  window.V2 = {
    render(tab, host, first) {
      H = host;
      if (tab === 'overview') return home(first);
      if (tab === 'meta') return meta(first, 'overview');
      if (tab === 'campaigns') return meta(first, 'campaigns');
      if (tab === 'adcreative') return creative(first);
      if (tab === 'google' || tab === 'tiktok') return platform(tab, first);
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
