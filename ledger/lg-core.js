/* Mobius Ledger v6 core (2026-10-11). Loaded after the engine (index.html's
   inline script), ../ask/ask-ui.js and lg-edition.js. Owns the shell: the
   rail, the top bar, the page tabs, the period control, the theme; plus the
   helpers every screen uses (tiles, SVG charts, skeletons). Screens live in
   lg-home.js, lg-money.js, lg-cash.js, lg-books.js, lg-settings.js.

   The engine is untouched and overridden by name: show, paintNav, setChip,
   monthNav, renderGate, boot, toggleTheme, draw, chartOpts, loadChart,
   renderReports, renderDashboards. Never declare a top-level const or let the
   engine already declares (check: grep -oE "^(const|let|function) +\w+" index.html).
   Engine names reused on purpose: money0, fmt$, fmtDate, rangeLabel, presetRange(p, RP),
   RP, PRESETS, DB, SET, CF, cardH, esc, stale, addMonths, moName, moShort, nowMonth.
   Spec: docs/one-ledger.md section 6 (Step A) and Lucky's docs/redesign-2026-10-10.md. */
'use strict';

/* ================= the map (from the edition) ================= */
let NAV = ED.nav, PAGE_TITLE = edTitles();
/* Every page title any edition knows, so a page outside the current rail still has a name. */
const ALL_TITLES = (() => { const t = {}; for (const e of Object.values(EDITIONS)) for (const g of e.nav) for (const p of g.pages) t[p[0]] = t[p[0]] || p[1]; t.settings = 'Settings'; return t; })();
/* Old ids still route. The engine's Reports and Dashboards tabs map onto pages of their own. */
const LEGACY = { dash: 'overview', caddie: 'overview', forecast: 'forecast', cashflow: 'forecast', exports: 'pack', statement: 'statements', performance: 'pnl', spending: 'costs', clients: 'retainers' };
const REPORT_TAB_PAGE = { pnl: 'pnl', statement: 'statements', cash: 'forecast', taxes: 'taxes', exports: 'pack' };
const DASH_TAB_PAGE = { performance: 'pnl', clients: 'retainers', spending: 'costs', health: 'health' };
function rebuildNav() { NAV = ED.nav; PAGE_TITLE = edTitles(); }
function navOf(view) { return NAV.find(g => g.pages.some(p => p[0] === view)) || null; }
const NAV_LAST = (() => { try { return JSON.parse(localStorage.getItem('ledger_navlast') || '{}'); } catch (e) { return {}; } })();
/* The pages whose numbers follow the period control, and the ones that follow the month stepper. */
const PERIOD_PAGES = new Set(['pnl', 'costs', 'pack', 'retainers']);
const MONTH_PAGES = new Set(['txns', 'receipts', 'close', 'invoices', 'statements']);
const SCREENS = {};

/* ================= formatting ================= */
const kfmt = n => Math.abs(n) >= 1e6 ? (n < 0 ? '−' : '') + '$' + (Math.abs(n) / 1e6).toFixed(1) + 'M' : Math.abs(n) >= 1e4 ? (n < 0 ? '−' : '') + '$' + (Math.abs(n) / 1e3).toFixed(0) + 'K' : money0(n);
const dLong = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const icon = (n, s = 16) => window.icon ? window.icon(n, { size: s }) : '';
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;

/* ================= components ================= */
/** Delta pill: arrow, money and percent, coloured by whether up is good (lower=true for costs). */
function delta(cur, prev, label, lower) {
  if (prev == null || !isFinite(prev) || !prev) return label ? `<span class="s">${esc(label)}</span>` : '';
  const d = cur - prev, up = d >= 0, small = Math.abs(d) / Math.abs(prev) < 0.015;
  const good = up !== !!lower;
  const tone = small || lower === 'n' ? 'flat' : good ? 'up' : 'down';
  const p = Math.round(Math.abs(d) / Math.abs(prev) * 100);
  return `<span class="d ${tone}" title="${esc(label || '')}: ${money0(prev)} then">${up ? '▲' : '▼'} ${money0(Math.abs(d))}${p ? ` (${p}%)` : ''}</span>${label ? ` <span class="s">${esc(label)}</span>` : ''}`;
}
/** One tile everywhere: label, value, delta, a line of meaning, a sparkline. `go` is an onclick. */
function tile(o) {
  const cls = `tile${o.hero ? ' hero' : ''}${o.go ? ' go' : ''}`;
  const go = o.go ? `onclick="${o.go}" role="link" tabindex="0" title="${esc(o.goTitle || 'Open')}"` : '';
  return `<div class="${cls}" ${go}>
    <div class="l"><span>${esc(o.label)}</span>${o.em ? `<em>${esc(o.em)}</em>` : ''}</div>
    <div class="v ${o.tone || ''}">${o.value}${o.small ? `<small>${o.small}</small>` : ''}</div>
    ${o.sub ? `<div class="s">${o.sub}</div>` : ''}${o.extra || ''}${o.spark || ''}</div>`;
}
const card = (title, find, body, right = '', cls = '') => `<section class="card ${cls}">${title || find || right ? `<div class="ch"><div class="cht"><h3>${title}</h3>${find ? `<span class="find">${find}</span>` : ''}</div>${right ? `<div class="chr">${right}</div>` : ''}</div>` : ''}${body}</section>`;
const empty = (ic, text, btn = '') => `<div class="empty"><i>${icon(ic || 'inbox', 20)}</i><span>${text}</span>${btn}</div>`;
const errorCard = (e, retry) => `<section class="card"><div class="empty bad"><i>${icon('circle-alert', 20)}</i><span><b>This did not load.</b><br>${esc(e.message || e)}</span>${retry ? `<button class="btn" onclick="${retry}">Try again</button>` : ''}</div></section>`;
const skTiles = (n = 4) => `<div class="sk-tiles tiles">${Array.from({ length: n }, () => '<div class="tile"><i class="a"></i><i class="b"></i><i class="c"></i></div>').join('')}</div>`;
const skCard = (rows = 5, chart) => `<section class="card sk-card"><i class="h"></i>${chart ? '<i class="ch"></i>' : Array.from({ length: rows }, () => '<i></i>').join('')}</section>`;
const skPage = (o = {}) => `<div class="v2">${o.tiles === 0 ? '' : skTiles(o.tiles || 4)}${o.chart === false ? '' : skCard(0, true)}${skCard(o.rows || 6)}</div>`;
const ibar = (v, max, k, label) => `<span class="ib"><i class="${k ? 'k-' + k : ''}" style="width:${max ? Math.max(2, Math.min(100, Math.abs(v) / max * 100)).toFixed(0) : 0}%"></i><span>${label}</span></span>`;
const progress = (paid, total) => `<div class="bar"><i style="width:${total > 0 ? Math.min(100, Math.max(0, paid / total * 100)).toFixed(0) : 0}%"></i></div>`;
const lnRow = (name, sub, amt, cls = '', extra = '') => `<div class="ln"><span class="n">${name}${sub ? `<small>${sub}</small>` : ''}${extra}</span><span class="a ${cls}">${amt}</span></div>`;
/** Ranked bars: [[name, value, onclick?]] biggest first, as a share of the total. */
function rankList(rows, total, kind = 'out') {
  if (!rows.length) return '<p class="hint">Nothing in this period.</p>';
  const mx = Math.max(...rows.map(r => Math.abs(r[1])), 1);
  return `<div class="dls">${rows.map(([n, v, go]) => `<div class="dl ${go ? 'go' : ''}" ${go ? `onclick="${go}"` : ''}><span class="n">${esc(n)}</span><span class="bar"><i class="k-${kind}" style="width:${(Math.abs(v) / mx * 100).toFixed(1)}%"></i></span><span class="p">${total ? pctOf(v, total) : ''}</span><span class="a">${money0(v)}</span><span class="go">${go ? '›' : ''}</span></div>`).join('')}</div>`;
}
function pageHead(title, lead, acts = '', crumb = '') {
  return `<div class="ph"><div>${crumb ? `<div class="crumb">${esc(crumb)}</div>` : ''}<h2>${title}</h2>${lead ? `<div class="lead">${lead}</div>` : ''}</div>${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
}
/* A page whose data is not in this engine: a clear card, never a crash. */
function renderStub(view) {
  const title = PAGE_TITLE[view] || ALL_TITLES[view] || view;
  $('#main').innerHTML = pageHead(title, `Not connected in the ${ED.label} edition yet.`) + `<div class="v2">${notConnectedCard(view, title)}</div>`;
}

/* ================= SVG charts (no library) ================= */
const CHART = { w: 760, h: 240, pl: 54, pr: 16, pt: 16, pb: 26 };
function chartScale(vals, h, pt, pb, o = {}) {
  const v = vals.filter(x => x != null && isFinite(x));
  let mn = Math.min(0, ...v), mx = Math.max(0, ...v);
  if (o.zeroFloor === false) { mn = Math.min(...v); }
  if (mx === mn) { mx = mn + 1; }
  const pad = (mx - mn) * 0.08; mx += pad; if (mn < 0) mn -= pad;
  const Y = y => pt + (1 - (y - mn) / (mx - mn)) * (h - pt - pb);
  return { mn, mx, Y };
}
function niceTicks(mn, mx, n = 4) {
  const span = mx - mn, raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  const out = []; for (let t = Math.ceil(mn / step) * step; t <= mx; t += step) out.push(t); return out;
}
const smoothPath = pts => { if (pts.length < 2) return ''; let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2, t = 0.16;
    const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]), cl = y => Math.max(lo, Math.min(hi, y));
    d += ` C${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)},${cl(p1[1] + (p2[1] - p0[1]) * t).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)},${cl(p2[1] - (p3[1] - p1[1]) * t).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`; }
  return d; };
/** A sparkline for a tile. Negative values get a dashed zero line. */
function spark(vals, o = {}) {
  const v = (vals || []).map(x => x == null ? null : +x); if (v.filter(x => x != null).length < 2) return '';
  const w = o.w || 300, h = o.h || 36, { mn, Y } = chartScale(v.concat(o.ghost || []), h, 3, 3);
  const X = (i, n) => (i / Math.max(1, n - 1) * (w - 6) + 3);
  const pts = a => a.map((y, i) => y == null ? null : [X(i, a.length), Y(y)]).filter(Boolean);
  const main = pts(v), last = v[v.length - 1] ?? 0;
  const zero = mn < 0 ? `<line x1="0" x2="${w}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="var(--bad)" stroke-dasharray="3 3" stroke-width="1" opacity=".7"/>` : '';
  const area = main.length > 1 ? `<path d="${smoothPath(main)} L${main[main.length - 1][0].toFixed(1)},${Y(Math.max(mn, 0)).toFixed(1)} L${main[0][0].toFixed(1)},${Y(Math.max(mn, 0)).toFixed(1)}Z" fill="url(#lx-area)" stroke="none"/>` : '';
  const ghost = o.ghost && o.ghost.length > 1 ? `<path d="${smoothPath(pts(o.ghost))}" fill="none" stroke="var(--cmp)" stroke-width="1.2" stroke-dasharray="3 3"/>` : '';
  const tips = o.tips && o.tips.length === v.length ? ` data-spk="${esc(JSON.stringify(o.tips))}"` : '';
  const stroke = o.color || 'var(--brand)';
  return `<svg class="spark${o.tall ? ' tall' : ''}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"${tips}>${zero}${area}${ghost}<path d="${smoothPath(main)}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><circle cx="${(w - 3).toFixed(1)}" cy="${Y(last).toFixed(1)}" r="2.6" fill="${stroke}"/></svg>`;
}
/** Line chart: rows [{x, v, v2?, lo?, hi?, notes?}]. Main line in the accent, v2 gold, ghost dashed, a zero line in red. */
function lineChart(id, rows, o = {}) {
  const w = CHART.w, h = o.h || CHART.h, pl = CHART.pl, pr = CHART.pr, pt = CHART.pt, pb = CHART.pb, n = rows.length;
  if (n < 2) return `<p class="hint">${n === 1 ? 'One point only, so there is no line yet.' : 'Nothing to draw yet.'}</p>`;
  const prev = o.ghost || [];
  const vals = rows.flatMap(r => [r.v, o.key2 ? r.v2 : null, r.lo, r.hi]).concat(prev.map(r => r.v)).concat(o.plan != null ? [o.plan] : []);
  const { mn, mx, Y } = chartScale(vals, h, pt, pb, o);
  const X = i => pl + i / (n - 1) * (w - pl - pr);
  const fmt = o.fmt || kfmt;
  const grid = niceTicks(mn, mx).map(t => `<line x1="${pl}" x2="${w - pr}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke="${t === 0 && mn < 0 ? 'var(--bad)' : 'var(--grid)'}" stroke-dasharray="${t === 0 && mn < 0 ? '4 3' : '2 4'}"/><text x="${pl - 8}" y="${(Y(t) + 4).toFixed(1)}" font-size="10.5" text-anchor="end" fill="var(--faint)">${fmt(t)}</text>`).join('');
  const pts = (a, k) => a.map((r, i) => r[k] == null ? null : [X(i), Y(r[k])]).filter(Boolean);
  const main = pts(rows, 'v'), base = Y(Math.max(mn, 0)).toFixed(1);
  const band = rows.some(r => r.lo != null && r.hi != null) ? `<path d="${rows.map((r, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(r.hi ?? r.v).toFixed(1)}`).join(' ')} ${rows.slice().reverse().map((r, j) => `L${X(n - 1 - j).toFixed(1)},${Y(r.lo ?? r.v).toFixed(1)}`).join(' ')}Z" fill="rgba(var(--brand-rgb),.12)" stroke="none"/>` : '';
  const area = main.length > 1 && o.area !== false ? `<path d="${smoothPath(main)} L${main[main.length - 1][0].toFixed(1)},${base} L${main[0][0].toFixed(1)},${base}Z" fill="url(#lx-area)" stroke="none"/>` : '';
  const ghost = prev.length > 1 ? `<path d="${smoothPath(pts(prev, 'v'))}" fill="none" stroke="var(--cmp)" stroke-width="1.5" stroke-dasharray="4 4" stroke-linecap="round"/>` : '';
  const line2 = o.key2 ? `<path d="${smoothPath(pts(rows, 'v2'))}" fill="none" stroke="var(--gold)" stroke-width="1.8" stroke-linecap="round"/>` : '';
  const idx = n <= 10 ? rows.map((_, i) => i) : [...new Set(Array.from({ length: 6 }, (_, k) => Math.round(k * (n - 1) / 5)))];
  const ticks = idx.map(i => `<text x="${X(i).toFixed(1)}" y="${h - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${esc(rows[i].x)}</text>`).join('');
  const marks = rows.map((r, i) => r.notes && r.notes.length && r.v != null ? `<circle cx="${X(i).toFixed(1)}" cy="${Y(r.v).toFixed(1)}" r="3.4" fill="var(--surface)" stroke="var(--brand)" stroke-width="1.6"/>` : '').join('');
  const planLine = o.plan != null ? `<line x1="${pl}" x2="${w - pr}" y1="${Y(o.plan).toFixed(1)}" y2="${Y(o.plan).toFixed(1)}" stroke="var(--warn)" stroke-width="1.2" stroke-dasharray="2 4"/>` : '';
  const lastV = rows[n - 1].v;
  const lastDot = lastV != null ? `<circle cx="${X(n - 1).toFixed(1)}" cy="${Y(lastV).toFixed(1)}" r="4" fill="var(--surface)" stroke="var(--brand)" stroke-width="2"/>` : '';
  return `<div class="chart" data-chart="${id}"><svg id="${id}" viewBox="0 0 ${w} ${h}">${grid}${ticks}${planLine}${band}${area}${ghost}${line2}<path d="${smoothPath(main)}" fill="none" stroke="var(--brand)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>${marks}${lastDot}<line class="gl" x1="0" x2="0" y1="${pt}" y2="${h - pb}" stroke="var(--ink)" stroke-width="1" stroke-dasharray="3 3" opacity="0"/><g class="gdots"></g></svg><div class="ctip"></div></div>`;
}
/** Hover for a lineChart: a guide line, dots on each series, one tooltip built by o.tip(row, i, ghostRow). */
function wireLine(id, rows, o = {}) {
  const el = document.getElementById(id); if (!el || el.tagName !== 'svg') return;
  const w = CHART.w, pl = CHART.pl, pr = CHART.pr, pt = CHART.pt, pb = CHART.pb, n = rows.length, h = +el.getAttribute('viewBox').split(' ')[3];
  const wrap = el.parentNode, tip = wrap.querySelector('.ctip'), gl = el.querySelector('.gl'), dots = el.querySelector('.gdots');
  if (!tip || !gl || n < 2) return;
  const vals = rows.flatMap(r => [r.v, o.key2 ? r.v2 : null, r.lo, r.hi]).concat((o.ghost || []).map(r => r.v)).concat(o.plan != null ? [o.plan] : []);
  const { Y } = chartScale(vals, h, pt, pb, o);
  const move = e => {
    const r = el.getBoundingClientRect(); const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width * w - pl) / (w - pl - pr) * (n - 1))));
    const x = pl + i / (n - 1) * (w - pl - pr); gl.setAttribute('x1', x); gl.setAttribute('x2', x); gl.setAttribute('opacity', '.5');
    const row = rows[i], g = o.ghost && o.ghost[i];
    dots.innerHTML = [[row.v, 'var(--brand)'], [o.key2 ? row.v2 : null, 'var(--gold)'], [g ? g.v : null, 'var(--cmp)']].filter(d => d[0] != null).map(d => `<circle cx="${x.toFixed(1)}" cy="${Y(d[0]).toFixed(1)}" r="4.5" fill="var(--surface)" stroke="${d[1]}" stroke-width="2"/>`).join('');
    tip.style.display = 'block'; tip.innerHTML = o.tip ? o.tip(row, i, g) : `<b>${esc(row.x)}</b> · ${money0(row.v)}`;
    const tw = tip.offsetWidth; let left = (e.clientX - r.left) + 14; if (left + tw > r.width) left = (e.clientX - r.left) - tw - 14; tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px';
  };
  el.onpointermove = move; el.onpointerdown = move;
  el.onpointerleave = () => { tip.style.display = 'none'; gl.setAttribute('opacity', '0'); dots.innerHTML = ''; };
}
/** Bars by period, negatives below a zero line. rows [{x, v, tip?, color?}]; o.onClick(i). */
function barChart(id, rows, o = {}) {
  const w = CHART.w, h = o.h || 220, pl = CHART.pl, pr = CHART.pr, pt = CHART.pt, pb = CHART.pb, n = rows.length; if (!n) return '<p class="hint">Nothing to draw yet.</p>';
  const { mn, mx, Y } = chartScale(rows.map(r => r.v), h, pt, pb);
  const bw = (w - pl - pr) / n, fmt = o.fmt || kfmt;
  const grid = niceTicks(mn, mx).map(t => `<line x1="${pl}" x2="${w - pr}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke="${t === 0 && mn < 0 ? 'var(--bad)' : 'var(--grid)'}" stroke-dasharray="${t === 0 && mn < 0 ? '4 3' : '2 4'}"/><text x="${pl - 8}" y="${(Y(t) + 4).toFixed(1)}" font-size="10.5" text-anchor="end" fill="var(--faint)">${fmt(t)}</text>`).join('');
  const z = Y(0);
  const bars = rows.map((r, i) => { const y = Y(r.v || 0), x = pl + i * bw + bw * 0.2, bwid = bw * 0.6; const top = Math.min(y, z), hh = Math.max(1.5, Math.abs(z - y));
    return `<rect data-i="${i}" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bwid.toFixed(1)}" height="${hh.toFixed(1)}" rx="3" fill="${(r.v || 0) < 0 ? 'var(--bad)' : (r.color || 'var(--brand)')}" opacity="${o.fadeOld && i < n - 1 ? '.55' : r.faded ? '.5' : '1'}" style="${o.onClick ? 'cursor:pointer' : ''}"><title>${esc(r.tip || `${r.x}: ${money0(r.v)}`)}</title></rect>`; }).join('');
  const idx = n <= 14 ? rows.map((_, i) => i) : [...new Set(Array.from({ length: 7 }, (_, k) => Math.round(k * (n - 1) / 6)))];
  const ticks = idx.map(i => `<text x="${(pl + i * bw + bw / 2).toFixed(1)}" y="${h - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${esc(rows[i].x)}</text>`).join('');
  setTimeout(() => { const el = document.getElementById(id); if (el && o.onClick) el.querySelectorAll('rect[data-i]').forEach(r => r.onclick = () => o.onClick(+r.dataset.i)); }, 0);
  return `<div class="chart"><svg id="${id}" viewBox="0 0 ${w} ${h}">${grid}${bars}${ticks}</svg></div>`;
}
/* sparkline hover: the point under the pointer, from data-spk */
(() => {
  let tip;
  document.addEventListener('pointermove', e => {
    const s = e.target.closest && e.target.closest('svg[data-spk]');
    if (!s) { if (tip) tip.style.display = 'none'; return; }
    if (!tip) { tip = document.createElement('div'); tip.className = 'ctip'; tip.style.position = 'fixed'; tip.style.zIndex = 80; document.body.appendChild(tip); }
    let tips; try { tips = JSON.parse(s.dataset.spk); } catch (err) { return; }
    const r = s.getBoundingClientRect(), i = Math.max(0, Math.min(tips.length - 1, Math.round((e.clientX - r.left) / r.width * (tips.length - 1))));
    tip.style.display = 'block'; tip.innerHTML = tips[i]; tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 12) + 'px'; tip.style.top = (e.clientY - tip.offsetHeight - 12) + 'px';
  });
})();

/* ---- the engine's charts, drawn in SVG ----
   The engine still describes its charts the Chart.js way (draw(key, id, cfg))
   and the cash forecast repaints through CH[key].update(). Chart.js is gone:
   draw() turns the config into the same SVG every other page uses, and the
   object it keeps in CH redraws on update(). chartOpts() and loadChart() no
   longer reach for a library that is not there. */
loadChart = function () { return Promise.resolve(); };
chartOpts = function (o = {}) { return { ...o }; };
draw = function (key, id, cfg) {
  const el = document.getElementById(id); if (!el) return;
  const box = el.closest('.chart') || el.parentNode;
  const d = cfg.data || {}, labels = d.labels || [], ds = d.datasets || [];
  let html = '';
  if (cfg.type === 'doughnut') {
    const vals = (ds[0] && ds[0].data) || [], tot = vals.reduce((s, v) => s + (+v || 0), 0);
    html = rankList(labels.map((l, i) => [l, +vals[i] || 0]), tot);
  } else if (cfg.type === 'line' || (ds[0] && ds[0].type === 'line')) {
    const rows = labels.map((l, i) => ({ x: String(l), v: ds[0] ? ds[0].data[i] : null }));
    const ghost = ds[1] ? labels.map((l, i) => ({ v: ds[1].data[i] })) : null;
    html = lineChart(id, rows, { ghost, h: 240 });
    box.outerHTML = html;
    wireLine(id, rows, { ghost, tip: (r, i, g) => `<b>${esc(r.x)}</b> · ${money0(r.v)}${g ? `<br><span class="faint">${esc(ds[1].label || '')} ${money0(g.v)}</span>` : ''}` });
  } else {
    const rows = labels.map((l, i) => ({ x: String(l), v: ds[0] ? ds[0].data[i] : 0, tip: `${l}: ${money0(ds[0] ? ds[0].data[i] : 0)}` }));
    html = barChart(id, rows, { h: 240 });
  }
  if (cfg.type !== 'line' && !(ds[0] && ds[0].type === 'line')) box.outerHTML = html;
  CH[key] = { data: d, update() { draw(key, id, cfg); }, destroy() {} };
};

/* ================= the period control (the engine's RP, in a pill menu) ================= */
function setRP(k, v) {
  RP[k] = v;
  const keys = { preset: 'ledger_rp_preset', compare: 'ledger_rp_cmp', layout: 'ledger_rp_layout' };
  if (keys[k]) lsSet(keys[k], v);
  closeMenus(); drawTopbar(); show(S.view);
}
const COMPARES = [['prev', 'The period before'], ['year', 'Same period last year'], ['none', 'Nothing']];
function presetLabel() { if (/^\d{4}$/.test(RP.preset)) return RP.preset; if (RP.preset === 'custom') return rangeLabel(presetRange('custom', RP)); const p = PRESETS.find(x => x[0] === RP.preset); return p ? p[1] : 'This year to date'; }
function pillMenu(id, label, items, cur, onPick, extra = '') {
  return `<div class="pm" id="${id}"><button type="button" class="pm-btn" onclick="toggleMenu('${id}')">${esc(label)}<svg viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg></button>
    <div class="pm-menu" hidden role="menu">${items.map(([v, l]) => `<button type="button" class="${v === cur ? 'on' : ''}" onclick="${onPick.replace('%v', v)}">${esc(l)}</button>`).join('')}${extra}</div></div>`;
}
function toggleMenu(id) { const m = document.querySelector(`#${id} .pm-menu`); if (!m) return; const open = m.hidden; closeMenus(); m.hidden = !open; }
function closeMenus() { document.querySelectorAll('.pm-menu').forEach(m => m.hidden = true); const p = $('#askPop'); if (p) p.hidden = true; }
document.addEventListener('click', e => { if (!e.target.closest('.pm') && !e.target.closest('.askbar')) closeMenus(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
function periodHTML() {
  const y = +nowMonth().slice(0, 4), first = +firstMonth().slice(0, 4);
  const years = Array.from({ length: Math.max(0, y - first + 1) }, (_, i) => [String(y - i), String(y - i)]).slice(0, 8);
  const r = presetRange('custom', RP);
  const cust = `<div class="lb">Custom</div><div class="cust"><input type="month" value="${esc(RP.from || r[0])}" onchange="RP.from=this.value"><span class="tiny">to</span><input type="month" value="${esc(RP.to || r[1])}" max="${nowMonth()}" onchange="RP.to=this.value"><button class="btn sm" onclick="setRP('preset','custom')">Go</button></div>`;
  return pillMenu('pmPeriod', presetLabel(), [...PRESETS.filter(p => p[0] !== 'custom'), ...years], RP.preset, "setRP('preset','%v')", cust)
    + pillMenu('pmCmp', 'vs ' + (COMPARES.find(c => c[0] === RP.compare) || COMPARES[0])[1].toLowerCase(), COMPARES, RP.compare, "setRP('compare','%v')");
}

/* ================= theme, shell, routing ================= */
function applyTheme(t) { t = t || localStorage.getItem('ledger_theme') || 'light'; document.documentElement.setAttribute('data-theme', t); document.querySelectorAll('.theme button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); }
function setTheme(t) { try { localStorage.setItem('ledger_theme', t); } catch (e) {} applyTheme(t); }
toggleTheme = function () { setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); if (S.view === 'settings') renderSettings(); };
const booksGroup = () => (NAV.find(g => g.pages.some(p => p[0] === 'txns')) || {}).id;
function railHTML() {
  const rv = needsCount(), g = navOf(S.view), hi = (S.view === 'settings') ? null : g && g.id, bg = booksGroup();
  return NAV.map(x => `<button data-g="${x.id}" class="${hi === x.id ? 'on' : ''}" onclick="go('${x.id}')" title="${esc(x.pages.map(p => p[1]).join(', '))}">${icon(x.icon)}<span>${x.label}</span>${x.id === bg && rv ? `<span class="bdg">${rv}</span>` : ''}</button>`).join('');
}
function tabbarHTMLv6() {
  const rv = needsCount(), g = navOf(S.view), hi = g && g.id, bg = booksGroup();
  return ED.phone.map(id => NAV.find(x => x.id === id)).filter(Boolean).map(x => `<button class="${hi === x.id ? 'on' : ''}" onclick="go('${x.id}')">${icon(x.icon, 20)}<span>${x.label}</span>${x.id === bg && rv ? `<span class="tbdg">${rv}</span>` : ''}</button>`).join('')
    + `<button onclick="navToggle()">${icon('more-horizontal', 20)}<span>More</span></button>`;
}
function go(groupId) {
  const g = NAV.find(x => x.id === groupId); if (!g) return;
  const last = NAV_LAST[groupId]; show(g.pages.some(p => p[0] === last) ? last : g.pages[0][0]);
}
function segHTML() {
  const g = navOf(S.view); const el = $('#seg'); if (!el) return;
  if (!g || g.pages.length < 2) { el.hidden = true; el.innerHTML = ''; return; }
  const rv = needsCount(), closedM = moState(S.month) === 'closed';
  el.hidden = false;
  el.innerHTML = g.pages.map(([id, l]) => `<button class="${S.view === id ? 'on' : ''}" onclick="show('${id}')">${l}${id === 'txns' && rv ? `<span class="bdg">${rv}</span>` : ''}${id === 'close' && closedM ? `<span class="pill good" style="margin-left:4px">closed</span>` : ''}</button>`).join('');
}
function drawTopbar() {
  const g = navOf(S.view), title = PAGE_TITLE[S.view] || ALL_TITLES[S.view] || '';
  const t = $('#hdTitle'); if (t) t.innerHTML = g ? `${esc(g.label)}<i>›</i><b>${esc(title)}</b>` : `<b>${esc(title)}</b>`;
  document.title = `${title ? title + ' · ' : ''}Cashew`;
  const r = $('#hdRight'); if (!r) return;
  if (PERIOD_PAGES.has(S.view)) r.innerHTML = periodHTML();
  else if (MONTH_PAGES.has(S.view)) r.innerHTML = `<div class="mo-nav">${monthPicker(S.month, 'setMonth')}<span class="mo-lock ${moState(S.month)}">${moState(S.month) === 'closed' ? 'Closed' : 'Open'}</span></div>`;
  else r.innerHTML = '';
}
/* The top bar carries the month stepper, so the engine's own copy draws nothing. */
monthNav = function () { return ''; };
/* The rail, the phone bar and the foot. The engine calls this after every refresh. */
paintNav = function () {
  const nav = $('#nav'); if (nav) nav.innerHTML = railHTML();
  const tb = $('#tabbar'); if (tb) tb.innerHTML = tabbarHTMLv6();
  const rs = $('#railSettings'); if (rs) rs.classList.toggle('on', S.view === 'settings');
  const nm = $('#meName'); if (nm) nm.textContent = whoName();
  const av = $('#meAv'); if (av) av.textContent = whoName().slice(0, 1).toUpperCase();
  const by = $('#brandBy'); if (by) by.textContent = ED.by;
  const ab = $('#askIn2'); if (ab) ab.placeholder = `Ask the ${ED.assistant}, or jump to a page`;
};
setChip = function (t, s) {
  const c = $('#connChip'); if (c) { c.dataset.s = s; const x = $('#connText'); if (x) x.textContent = t; }
  document.body.classList.toggle('signed-out', t === 'Signed out');
};
/* The worker says which edition the books are; the browser remembers it between loads. */
function syncEdition() {
  const e = S.boot && S.boot.edition;
  if (e && EDITIONS[e] && e !== ED.id) { pickEdition(e); rebuildNav(); AskUI.state.name = ED.assistant; }
}
/* ONE show() for the whole app. Every old id still routes. */
show = function (view) {
  view = LEGACY[view] || view;
  if (view === 'reports') view = REPORT_TAB_PAGE[RP.tab] || 'pnl';
  if (view === 'dashboards') view = DASH_TAB_PAGE[DB.tab] || 'pnl';
  syncEdition();
  if (!SCREENS[view] && !ED.stub[view]) view = 'overview';
  closeMenus(); closeSheet(); killCharts();
  if (document.body.classList.contains('nav-open')) { document.body.classList.remove('nav-open'); const sc = $('#navScrim'); if (sc) sc.hidden = true; }
  document.body.classList.remove('gated');
  S.view = view; S.rt = (S.rt || 0) + 1; const my = S.rt;
  document.body.dataset.view = view;
  const g = navOf(view); if (g) { NAV_LAST[g.id] = view; try { localStorage.setItem('ledger_navlast', JSON.stringify(NAV_LAST)); } catch (e) {} }
  try { const u = new URL(location.href); if (u.searchParams.get('open') !== view) { u.searchParams.set('open', view); history.replaceState(null, '', u); } } catch (e) {}
  paintNav(); segHTML(); drawTopbar(); helperTick();
  $('#main').className = '';
  window.scrollTo({ top: 0 });
  const fn = SCREENS[view] || (() => renderStub(view));
  Promise.resolve().then(() => fn()).catch(e => { console.error(e); if (!stale(my)) $('#main').innerHTML = errorCard(e, `show('${view}')`); });
};
/* The engine's own tab routers: anything that still calls them lands on the page the tab became. */
renderReports = function () { show('reports'); };
renderDashboards = function () { show('dashboards'); };

/* the gate: full screen, no rail */
renderGate = function (err) {
  document.body.classList.add('gated');
  setChip('Signed out', 'off');
  setHelper('asleep');
  $('#main').innerHTML = `<div class="gate-field">
    <div class="lockup"><img class="chr" src="../logo/cashew/character/rest.png" alt=""><img class="wm" src="../logo/cashew/wordmark.svg" alt="Cashew"></div>
    <p class="tag">Mobius Digital's books. Know what you kept.</p>
    <div class="gate">
    <p>Money in, money out, the month closed, and the pack the CPA needs. Sign in once at Mobius HQ and every internal tool opens.</p>
    <a class="cta" href="../hq/?next=/ledger/">Continue with Google</a>
    ${err ? `<div class="err">${esc(err)}</div>` : ''}
    <details><summary>Use an administrator token</summary>
      <label>Administrator token</label><input id="gTok" type="password" placeholder="administrator token">
      <label>Worker URL</label><input id="gUrl" value="${esc(S.url)}">
      <button class="cta" id="gGo">Sign in</button></details></div>
    <p class="foot">The app never moves money. <a href="privacy/">Privacy</a> · <a href="security/">Security</a></p></div>`;
  const goIn = () => {
    S.url = ($('#gUrl').value || '').trim() || DEFAULT_WORKER_URL;
    S.tok = $('#gTok').value.trim();
    localStorage.setItem(LS.url, S.url); localStorage.setItem(LS.tok, S.tok);
    boot();
  };
  $('#gGo').onclick = goIn;
  $('#gTok').addEventListener('keydown', e => { if (e.key === 'Enter') goIn(); });
};
const _boot = boot;
boot = async function () {
  await _boot();
  if (S.tok && S.boot) { document.body.classList.remove('gated'); syncEdition(); paintNav(); }
};
/* ---- the helper in the ask bar ----
   The Cashew character (logo/cashew/character/<state>.png, a rendered
   image, 200px cut-outs), one picture per state:
   asleep when signed out, thinking while the Controller works, found when it
   has open findings, clear when the checks ran clean, rest while it has not
   looked yet. The Controller's own state (AskUI.state) drives it. */
const HELPER_STATES = new Set(['rest', 'asleep', 'thinking', 'found', 'clear']);
function setHelper(state) {
  if (!HELPER_STATES.has(state)) state = 'rest';
  const el = $('#askMark'); if (!el || el.dataset.state === state) return;
  el.dataset.state = state; el.src = `../logo/cashew/character/${state}.png`;
}
function helperTick() {
  const A = window.AskUI && AskUI.state;
  if (!S.tok || document.body.classList.contains('gated') || !A) return setHelper('asleep');
  if (A.busy) return setHelper('thinking');
  if (!A.data) return setHelper('rest');
  setHelper((A.data.findings || []).length ? 'found' : 'clear');
}
setInterval(helperTick, 1000);
/* scroll shadow + drawer */
document.addEventListener('scroll', () => document.documentElement.classList.toggle('scrolled', window.scrollY > 4), { passive: true });
function navToggle() { const on = !document.body.classList.contains('nav-open'); document.body.classList.toggle('nav-open', on); const sc = $('#navScrim'); if (sc) sc.hidden = !on; }

/* ================= the ask bar ================= */
function pageJumps() { return NAV.flatMap(g => g.pages.map(([id, l]) => [id, `${g.label} › ${l}`])).concat([['settings', 'Settings']]); }
function askPop(q) {
  const pop = $('#askPop'); if (!pop) return;
  q = (q || '').trim().toLowerCase();
  const jumps = pageJumps().filter(([id, l]) => !q || l.toLowerCase().includes(q)).slice(0, q ? 5 : 0);
  const sug = ((ED.ask || {})[S.view] || (ED.ask || {}).overview || []).filter(s => !q || s.toLowerCase().includes(q));
  pop.innerHTML = (jumps.length ? `<div class="lb">Jump to</div>${jumps.map(([id, l]) => `<button onmousedown="event.preventDefault();show('${id}');closeMenus();$('#askIn2').value=''">${icon('arrow-right', 14)}${esc(l)}</button>`).join('')}` : '')
    + (sug.length ? `<div class="lb">Ask the ${esc(ED.assistant)}</div>${sug.map(s => `<button onmousedown="event.preventDefault();askSend(${JSON.stringify(s).replace(/"/g, '&quot;')})">${icon('message', 14)}${esc(s)}</button>`).join('')}` : '')
    + (q ? `<button onmousedown="event.preventDefault();askSend($('#askIn2').value)">${icon('sparkles', 14)}Ask: "${esc(q)}"<small>Enter</small></button>` : '');
  pop.hidden = !pop.innerHTML;
}
function askSend(q) {
  q = (q || '').trim(); closeMenus(); const i = $('#askIn2'); if (i) { i.value = ''; i.blur(); }
  if (!q) { AskUI.open(); return; }
  const jump = pageJumps().find(([id, l]) => l.toLowerCase() === q.toLowerCase() || id === q.toLowerCase()); if (jump) { show(jump[0]); return; }
  AskUI.ask(q);
}
function wireAskbar() {
  const i = $('#askIn2'); if (!i) return;
  i.addEventListener('focus', () => askPop(i.value)); i.addEventListener('input', () => askPop(i.value));
  i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); askSend(i.value); } if (e.key === 'Escape') { closeMenus(); i.blur(); } });
  i.addEventListener('blur', () => setTimeout(closeMenus, 120));
}

/* ================= hosting an engine report ================= */
/* The engine's Taxes and Statement tabs write into #rctl and #rbody. A page
   that keeps them draws the head with those two slots and hands the engine
   its render ticket. */
function hostReport(title, lead, fn, my) {
  $('#main').innerHTML = pageHead(title, lead, '<span id="rctl" class="rctl"></span>') + `<div id="rbody">${skPage({ tiles: 4, chart: false })}</div>`;
  return Promise.resolve(fn(my)).catch(e => { if (!stale(my)) $('#rbody').innerHTML = errorCard(e, `show('${S.view}')`); });
}
