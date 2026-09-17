/* The creator link (Ambassadors). One brand's living brief, read by creators.
 * Data: GET {API}/api/angles/<slug>. No sign-in, no money on the page.
 * Built by angles/build.py, which inlines the Lucide icons into app.js.
 *
 * Three layouts from one page, because creators open this on a phone first:
 *   phone  (<700px)   thumb-first: sticky section bar, bottom dock, bottom
 *                     sheets for sections and formats, proof as a swipe row,
 *                     swipe left/right between angles
 *   tablet (700-1099) two-up cards, the same dock, detail in one column
 *   desktop (1100+)   three-up cards, sticky side panel on an angle
 */
(function () {
'use strict';
const API = 'https://mobius-profit.mobius-digital.workers.dev';
const ICONS = {"copy": "<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\"/><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\"/>", "external-link": "<path d=\"M15 3h6v6\"/><path d=\"M10 14 21 3\"/><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"/>", "play": "<path d=\"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z\"/>", "arrow-left": "<path d=\"m12 19-7-7 7-7\"/><path d=\"M19 12H5\"/>", "arrow-right": "<path d=\"M5 12h14\"/><path d=\"m12 5 7 7-7 7\"/>", "chevron-right": "<path d=\"m9 18 6-6-6-6\"/>", "chevron-down": "<path d=\"m6 9 6 6 6-6\"/>", "x": "<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>", "sparkles": "<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\"/><path d=\"M20 2v4\"/><path d=\"M22 4h-4\"/><circle cx=\"4\" cy=\"20\" r=\"2\"/>", "ban": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M4.929 4.929 19.07 19.071\"/>", "shield-check": "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/><path d=\"m9 12 2 2 4-4\"/>", "calendar-days": "<path d=\"M8 2v3\"/><path d=\"M16 2v3\"/><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18\"/><path d=\"M8 13h.01\"/><path d=\"M12 13h.01\"/><path d=\"M16 13h.01\"/><path d=\"M8 17h.01\"/><path d=\"M12 17h.01\"/><path d=\"M16 17h.01\"/>", "clapperboard": "<path d=\"m12.296 3.464 3.02 3.956\"/><path d=\"M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z\"/><path d=\"M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/><path d=\"m6.18 5.276 3.1 3.899\"/>", "eye": "<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>", "type": "<path d=\"M12 4v16\"/><path d=\"M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2\"/><path d=\"M9 20h6\"/>", "music": "<path d=\"M9 18V5l12-2v13\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><circle cx=\"18\" cy=\"16\" r=\"3\"/>", "flame": "<path d=\"M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4\"/>", "leaf": "<path d=\"M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20\"/><path d=\"M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13\"/>", "check": "<path d=\"M20 6 9 17l-5-5\"/>", "lightbulb": "<path d=\"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5\"/><path d=\"M9 18h6\"/><path d=\"M10 22h4\"/>", "video": "<path d=\"m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5\"/><rect x=\"2\" y=\"6\" width=\"14\" height=\"12\" rx=\"2\"/>", "image": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/><circle cx=\"9\" cy=\"9\" r=\"2\"/><path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\"/>", "link": "<path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\"/><path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"/>", "upload": "<path d=\"M12 3v12\"/><path d=\"m17 8-5-5-5 5\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/>", "pencil": "<path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/><path d=\"m15 5 4 4\"/>", "plus": "<path d=\"M5 12h14\"/><path d=\"M12 5v14\"/>", "grip-vertical": "<circle cx=\"9\" cy=\"12\" r=\"1\"/><circle cx=\"9\" cy=\"5\" r=\"1\"/><circle cx=\"9\" cy=\"19\" r=\"1\"/><circle cx=\"15\" cy=\"12\" r=\"1\"/><circle cx=\"15\" cy=\"5\" r=\"1\"/><circle cx=\"15\" cy=\"19\" r=\"1\"/>", "search": "<path d=\"m21 21-4.34-4.34\"/><circle cx=\"11\" cy=\"11\" r=\"8\"/>", "eye-off": "<path d=\"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49\"/><path d=\"M14.084 14.158a3 3 0 0 1-4.242-4.242\"/><path d=\"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143\"/><path d=\"m2 2 20 20\"/>", "download": "<path d=\"M12 15V3\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m7 10 5 5 5-5\"/>", "qr-code": "<rect width=\"5\" height=\"5\" x=\"3\" y=\"3\" rx=\"1\"/><rect width=\"5\" height=\"5\" x=\"16\" y=\"3\" rx=\"1\"/><rect width=\"5\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\"/><path d=\"M21 16h-3a2 2 0 0 0-2 2v3\"/><path d=\"M21 21v.01\"/><path d=\"M12 7v3a2 2 0 0 1-2 2H7\"/><path d=\"M3 12h.01\"/><path d=\"M12 3h.01\"/><path d=\"M12 16v.01\"/><path d=\"M16 12h1\"/><path d=\"M21 12v.01\"/><path d=\"M12 21v-1\"/>", "users": "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><path d=\"M16 3.128a4 4 0 0 1 0 7.744\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/>", "file-text": "<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 9H8\"/><path d=\"M16 13H8\"/><path d=\"M16 17H8\"/>", "lock": "<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/>", "rocket": "<path d=\"M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5\"/><path d=\"M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09\"/><path d=\"M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z\"/><path d=\"M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05\"/>", "star": "<path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\"/>", "target": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><circle cx=\"12\" cy=\"12\" r=\"6\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/>", "ghost": "<path d=\"M15 10v1\"/><path d=\"M7.528 20.472a1.6 1.6 0 012.277 0l1.057 1.056a1.6 1.6 0 002.276 0l1.057-1.056a1.6 1.6 0 012.277 0l1.114 1.114a1.4 1.4 0 002.414-1V10a8 8 0 00-16 0v10.586a1.4 1.4 0 002.414 1z\"/><path d=\"M9 10v1\"/>", "gift": "<path d=\"M12 7v14\"/><path d=\"M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8\"/><path d=\"M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5\"/><rect x=\"3\" y=\"7\" width=\"18\" height=\"4\" rx=\"1\"/>"};
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const svgI = (svg, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${svg || ICONS.sparkles}</svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);
const app = $('#app');
const isPhone = () => matchMedia('(max-width: 699px)').matches;

function slugFromUrl() {
  const q = new URLSearchParams(location.search).get('b');
  if (q) return q.toLowerCase();
  const m = location.pathname.match(/\/angles\/([a-z0-9-]+)\/?$/i);
  return m ? m[1].toLowerCase() : '';
}
const SLUG = slugFromUrl();
let D = null;
const FILTER = { fmt: 'all' };
let SPY = null;

function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/* ---------- colour ---------- */
function hexToRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
const mix = (rgb, w, t) => rgb.map((c, i) => Math.round(c * (1 - t) + w[i] * t));
const toHex = rgb => '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('');
function lum(rgb) { const a = rgb.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * a[0] + .7152 * a[1] + .0722 * a[2]; }
function darkenTo(rgb, ratio) { let c = rgb; for (let i = 0; i < 16 && (1.05 / (lum(c) + .05)) < ratio; i++) c = mix(c, [0, 0, 0], .08); return c; }
function applyAccent(hex) {
  const rgb = hexToRgb(hex); if (!rgb) return;
  const r = document.documentElement.style;
  r.setProperty('--acc', toHex(darkenTo(rgb, 4.6)));
  r.setProperty('--acc-ink', toHex(darkenTo(rgb, 5.5)));
  r.setProperty('--acc-soft', toHex(mix(rgb, [255, 255, 255], .88)));
  r.setProperty('--acc-bar', toHex(rgb));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#FFFFFF');
}
/** A section's palette: badge, chip, panel ground and panel edge, all from one hex. */
const tone = hex => {
  const rgb = hexToRgb(hex) || [71, 85, 105];
  return { fg: toHex(darkenTo(rgb, 5.2)), bg: toHex(mix(rgb, [255, 255, 255], .86)), panel: toHex(mix(rgb, [255, 255, 255], .955)), edge: toHex(mix(rgb, [255, 255, 255], .78)), solid: toHex(darkenTo(rgb, 3.2)) };
};
const toneVars = hex => { const t = tone(hex); return `--s-fg:${t.fg};--s-bg:${t.bg};--s-panel:${t.panel};--s-edge:${t.edge};--s-solid:${t.solid}`; };

/* ---------- data helpers ---------- */
const allSecs = () => [D.hot, ...D.sections].filter(s => s && s.angles.length);
const uniqAngles = () => { const seen = new Set(); return allSecs().flatMap(s => s.angles).filter(a => !seen.has(a.id) && seen.add(a.id)); };
const findAngle = id => uniqAngles().find(a => a.id === id);
const sectionOf = a => D.sections.find(s => s.id === a.section_id);
const fmtViews = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n);
const platformOf = u => /tiktok/i.test(u) ? 'TikTok' : /instagram/i.test(u) ? 'Instagram' : /facebook|fb\.watch/i.test(u) ? 'Facebook' : /youtu/i.test(u) ? 'YouTube' : 'the web';
const plat = () => D.brand.submit_platform || 'TRYBE';
function addDays(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function fmtDay(ymd) { return new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
const fmtMonth = ymd => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

/* ---------- submit ---------- */
function submitBtn(a, cls = 'btn acc') {
  if (!D.brand.submit_url) return `<button class="${cls}" data-howto>${ic('video')}<span>How to submit</span></button>`;
  const label = a ? (D.brand.submit_label || `Film this on ${plat()}`) : `Open our ${plat()} campaign`;
  return `<a class="${cls}" href="${esc(D.brand.submit_url)}" target="_blank" rel="noopener" data-film="${esc(a ? a.title : '')}">${ic('video')}<span>${esc(label)}</span></a>`;
}
function wireSubmit(root = document) {
  root.querySelectorAll('[data-film]').forEach(el => el.addEventListener('click', () => {
    const t = el.dataset.film;
    if (t) copy(`Angle: ${t}`).then(ok => ok && toast('Angle name copied. Paste it in your submission note.'));
  }));
  root.querySelectorAll('[data-howto]').forEach(el => el.onclick = () => sheet('How to submit', `<p class="sheet-p">Film your video, then submit it on <b>${esc(plat())}</b> in the ${esc(D.brand.display_name)} campaign like always. Put the angle name in your note so we know which one you filmed.</p>`));
}

/* ---------- bottom sheet (phone and tablet) ---------- */
function sheet(title, inner, onOpen) {
  document.querySelectorAll('.sheet-wrap').forEach(x => x.remove());
  const w = document.createElement('div');
  w.className = 'sheet-wrap';
  w.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="grab" aria-hidden="true"></div>
    <div class="sheet-h"><b>${esc(title)}</b><button class="btn icon ghost" data-x aria-label="Close">${ic('x')}</button></div>
    <div class="sheet-b">${inner}</div></div>`;
  document.body.appendChild(w);
  document.body.classList.add('locked');
  requestAnimationFrame(() => w.classList.add('on'));
  const done = () => { w.classList.remove('on'); document.body.classList.remove('locked'); setTimeout(() => w.remove(), 200); document.removeEventListener('keydown', k); };
  const k = e => { if (e.key === 'Escape') done(); };
  document.addEventListener('keydown', k);
  w.addEventListener('click', e => { if (e.target === w || e.target.closest('[data-x]')) done(); });
  // Drag the handle down to dismiss.
  const sh = w.querySelector('.sheet');
  let y0 = null;
  sh.addEventListener('touchstart', e => { if (sh.querySelector('.sheet-b').scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
  sh.addEventListener('touchmove', e => { if (y0 == null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
  sh.addEventListener('touchend', e => { if (y0 == null) return; const dy = e.changedTouches[0].clientY - y0; sh.style.transform = ''; y0 = null; if (dy > 90) done(); });
  setTimeout(() => w.querySelector('[data-x]').focus(), 50);
  if (onOpen) onOpen(w, done);
  return done;
}

/* ---------- season ---------- */
function seasonCard() {
  const se = D.brand.season;
  if (!se || !se.title) return '';
  const ch = D.season_chart;
  let chart = '';
  if (ch && se.show_chart !== false) {
    const xs = ch.weeks.map(w => w.x).filter(x => x != null);
    const max = Math.max(...xs, 1.3) * 1.08;
    const [h0, h1] = (se.highlight || []).map(x => (x || '').trim());
    const inHi = w => { if (!h0 || !h1) return false; const d = w.week_of.slice(5), e = addDays(w.week_of, 6).slice(5); return h0 <= h1 ? (e >= h0 && d <= h1) : (e >= h0 || d <= h1); };
    const peakI = ch.weeks.reduce((bi, w, i, a) => (w.x ?? -1) > (a[bi].x ?? -1) ? i : bi, 0);
    const peak = ch.weeks[peakI];
    const normalPct = (1 / max) * 100;
    let lastM = '';
    const cols = ch.weeks.map((w, i) => {
      const h = w.x == null ? 4 : Math.max(3, (w.x / max) * 100);
      const m = fmtMonth(w.week_of);
      const tick = m !== lastM ? m : ''; lastM = m;
      const cls = ['bar', w.x == null ? 'none' : '', inHi(w) ? 'hi' : '', i === 0 ? 'now' : '', i === peakI ? 'peak' : ''].join(' ');
      const words = w.x == null ? 'no sales data for this week' : `${w.x.toFixed(1)}x a normal week`;
      return `<div class="col"><div class="ba"><button class="${cls}" style="height:${h}%" data-bar="${i}" aria-label="Week of ${fmtDay(w.week_of)}: ${words}"></button></div><span class="tick">${tick}</span></div>`;
    }).join('');
    chart = `<div class="chart" data-chart>
      <div class="chart-top">
        <p class="lbl">Last year, the weeks ahead</p>
        <div class="legend">${h0 ? '<span><i class="sw hi"></i>The season</span>' : ''}<span><i class="sw ln"></i>A normal week</span></div>
      </div>
      <div class="tip" data-tip aria-live="polite"></div>
      <div class="plot">
        <div class="normal" style="--n:${(normalPct / 100).toFixed(3)}"><span>normal</span></div>
        <div class="bars">${cols}</div>
      </div>
      <p class="chart-note">${ic('sparkles')}<span>Busiest week last year: <b>week of ${fmtDay(peak.week_of)}</b>, ${peak.x.toFixed(1)}x a normal week. <span class="hint-t">Tap a bar to see any week.</span></span></p>
    </div>`;
  }
  return `<section class="card season" style="${chart ? '' : 'grid-template-columns:1fr'}">
    <div class="season-t">
      <span class="chip acc">${ic('calendar-days')}In season now</span>
      <h2 class="disp">${esc(se.title)}${se.until ? `<span class="until">until ${esc(se.until)}</span>` : ''}</h2>
      ${se.line ? `<p>${esc(se.line)}</p>` : ''}
      ${se.next ? `<p class="next">${ic('arrow-right')}<span>Next up: ${esc(se.next)}</span></p>` : ''}
    </div>
    ${chart}
  </section>`;
}
function wireChart() {
  const c = app.querySelector('[data-chart]');
  if (!c) return;
  const tip = c.querySelector('[data-tip]');
  const weeks = D.season_chart.weeks;
  const show = (i, el) => {
    const w = weeks[i];
    c.querySelectorAll('.bar.sel').forEach(b => b.classList.remove('sel'));
    el.classList.add('sel');
    const vs = w.x == null ? 'No sales data' : w.x >= 1.05 ? `${w.x.toFixed(1)}x a normal week` : w.x <= .95 ? `${w.x.toFixed(1)}x, a quieter week` : 'About a normal week';
    tip.innerHTML = `<b>${i === 0 ? 'This week' : 'Week of ' + fmtDay(w.week_of)}</b><span>${esc(vs)}</span>`;
    const pr = c.getBoundingClientRect(), br = el.getBoundingClientRect();
    const x = br.left + br.width / 2 - pr.left;
    tip.style.left = Math.min(Math.max(x, 74), pr.width - 74) + 'px';
    const plot = c.querySelector('.plot');
    tip.style.top = Math.max(0, plot.offsetTop - tip.offsetHeight - 8) + 'px';
    tip.classList.add('on');
  };
  c.querySelectorAll('[data-bar]').forEach(b => {
    b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') show(+b.dataset.bar, b); });
    b.addEventListener('focus', () => show(+b.dataset.bar, b));
    b.addEventListener('click', () => show(+b.dataset.bar, b));
  });
  c.querySelector('.plot').addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') tip.classList.remove('on'); });
  show(0, c.querySelector('[data-bar="0"]'));
}

/* ---------- avoid + rules ---------- */
function avoidCard() {
  const av = D.brand.avoid || [];
  if (!av.length) return '';
  const cut = isPhone() ? 2 : 99;
  return `<section class="card avoid" id="avoid">
    <div class="avoid-h"><span class="badge bad">${ic('ban')}</span><div><h2 class="disp">Please stop filming these</h2><p>We have plenty. Videos like these will not be picked for ads.</p></div></div>
    <ul>${av.map((x, i) => `<li ${i >= cut ? 'hidden' : ''}><b>${esc(x.title)}</b>${x.why ? `<span>${esc(x.why)}</span>` : ''}</li>`).join('')}</ul>
    ${av.length > cut ? `<button class="btn ghost more" data-avoidall>Show all ${av.length} ${ic('chevron-down')}</button>` : ''}
  </section>`;
}
function rulesCard() {
  const r = D.brand.rules || [];
  if (!r.length) return '';
  return `<details class="card fold" ${isPhone() ? '' : 'open'}><summary><span class="badge good">${ic('shield-check')}</span><b>Say it right</b><small>${r.length} rules</small>${ic('chevron-down', 'car')}</summary>
    <ul class="rules">${r.map(x => `<li>${ic('check')}<span>${esc(x)}</span></li>`).join('')}</ul></details>`;
}
function aboutCards() {
  const b = D.brand;
  if (!b.about && !b.audience) return '';
  if (isPhone()) {
    return `<details class="card fold"><summary><span class="badge acc">${ic('lightbulb')}</span><b>About ${esc(b.display_name)}</b><small>What it is, who it is for</small>${ic('chevron-down', 'car')}</summary>
      <div class="fold-b">${b.about ? `<p class="lbl">What it is</p><p>${esc(b.about)}</p>` : ''}${b.audience ? `<p class="lbl" style="margin-top:14px">Who we are talking to</p><p>${esc(b.audience)}</p>` : ''}</div></details>`;
  }
  return `<div class="two">
    ${b.about ? `<div class="card about"><p class="lbl">What it is</p><p>${esc(b.about)}</p></div>` : ''}
    ${b.audience ? `<div class="card about"><p class="lbl">Who we are talking to</p><p>${esc(b.audience)}</p></div>` : ''}
  </div>`;
}

/* ---------- cards + sections ---------- */
function angleCard(a, inSec) {
  const own = sectionOf(a);
  const showOwn = own && (!inSec || inSec.id !== own.id);
  const proven = a.ads > 0;
  const n = a.proof.length;
  const tags = [
    showOwn ? `<span class="chip" style="${toneVars(own.color)}" data-tone>${svgI(own.icon_svg)}${esc(own.name)}</span>` : '',
    a.format ? `<span class="chip">${esc(a.format)}</span>` : '',
    proven ? `<span class="chip proven">${ic('check')}Ran as an ad</span>` : (n ? '' : `<span class="chip new">${ic('lightbulb')}New idea</span>`),
  ].join('');
  const opener = (a.openers || [])[0];
  return `<article class="ang">
    <div class="tags">${tags}</div>
    <h3><a href="#a=${esc(a.id)}" class="stretch">${esc(a.title)}</a></h3>
    ${opener ? `<p class="hook">&ldquo;${esc(opener)}&rdquo;</p>` : ''}
    ${a.argument ? `<p class="line">${esc(a.argument)}</p>` : ''}
    <div class="foot">
      <span class="stat">${n ? `${ic('play')}${n} example${n === 1 ? '' : 's'}` : `${ic('sparkles')}Be the first to film it`}</span>
      <span class="go">Open${ic('chevron-right')}</span>
    </div>
  </article>`;
}

function sectionBlock(s, isHot) {
  const list = s.angles.filter(a => FILTER.fmt === 'all' || a.format === FILTER.fmt);
  if (!list.length) return '';
  const cut = isPhone() ? 4 : 6;
  const many = !isHot && list.length > cut;
  return `<section class="sec ${isHot ? 'hot' : ''}" id="s-${esc(s.id)}" data-sec="${esc(s.id)}" style="${toneVars(s.color)}">
    <header class="sec-h">
      <span class="badge" data-tone>${svgI(s.icon_svg)}</span>
      <div class="sec-t"><h2 class="disp">${esc(s.name)}</h2>${s.line ? `<p>${esc(s.line)}</p>` : ''}</div>
      <span class="count">${list.length}<small>angle${list.length === 1 ? '' : 's'}</small></span>
    </header>
    <div class="grid" data-grid="${esc(s.id)}">${list.map((a, i) => (many && i >= cut ? angleCard(a, isHot ? null : s).replace('<article class="ang"', '<article class="ang" hidden') : angleCard(a, isHot ? null : s))).join('')}</div>
    ${many ? `<button class="btn more" data-more="${esc(s.id)}">Show ${list.length - cut} more in ${esc(s.name)} ${ic('chevron-down')}</button>` : ''}
  </section>`;
}

function secNav() {
  const secs = allSecs();
  const fmts = [...new Set(uniqAngles().map(a => a.format).filter(Boolean))];
  const fOn = FILTER.fmt !== 'all';
  return `<nav class="secnav" aria-label="Sections">
    <div class="secnav-in wrap">
      <span class="secnav-l">Jump to</span>
      <div class="chips-x" data-chips>${secs.map(s => `<a class="snav" href="#s-${esc(s.id)}" data-jump="${esc(s.id)}" style="${toneVars(s.color)}"><i></i>${esc(s.name)}</a>`).join('')}</div>
      ${fmts.length > 1 ? `<button class="btn fbtn ${fOn ? 'on' : ''}" data-fmts aria-label="Filter by format">${ic('clapperboard')}<span><small>Format</small>${fOn ? esc(FILTER.fmt) : 'Any'}</span>${ic('chevron-down')}</button>` : ''}
    </div>
  </nav>`;
}

function header() {
  const b = D.brand;
  const upd = b.updated_at ? `Updated ${fmtDay(b.updated_at.slice(0, 10))}` : '';
  return `<header class="hd"><div class="wrap">
    <a class="brand" href="#" aria-label="${esc(b.display_name)} creator angles, top">
      ${b.logo_url ? `<img src="${esc(b.logo_url)}" alt="${esc(b.display_name)}">` : `<span class="nm">${esc(b.display_name)}</span>`}
      <span class="lbl">Creator angles</span>
    </a>
    <div class="hd-r">${upd ? `<span class="upd">${ic('check')}${upd}</span>` : ''}${b.submit_url ? `<a class="btn acc hd-btn" href="${esc(b.submit_url)}" target="_blank" rel="noopener">${ic('external-link')}<span>Open our ${esc(plat())} campaign</span></a>` : ''}</div>
  </div></header>`;
}
function footer() {
  return `<footer><div class="wrap"><span>Questions about an angle? Message ${esc(D.brand.display_name)} on ${esc(plat())}.</span><span>Powered by Mobius Digital</span></div></footer>`;
}

function renderList() {
  const b = D.brand;
  document.title = `${b.display_name} · Creator angles`;
  const body = [D.hot && D.hot.angles.length ? sectionBlock(D.hot, true) : '', ...D.sections.map(s => sectionBlock(s, false))].join('');
  const total = uniqAngles().length;
  app.innerHTML = `${header()}
  <main>
    <div class="wrap stack">
      <section class="hero">
        <p class="lbl acc-t">${esc(b.display_name)} creator program</p>
        <h1 class="serif">What to film for ${esc(b.display_name)}</h1>
        <p>${esc(b.intro || 'Pick an angle, film it, and submit it like always. This page updates on its own, so check back before you film.')}</p>
        <div class="hero-stats"><span>${ic('target')}<b>${total}</b> angles</span><span>${ic('star')}<b>${allSecs().length}</b> sections</span><span>${ic('check')}Updated by the brand</span></div>
      </section>
      ${aboutCards()}
      ${seasonCard()}
      ${avoidCard()}
      ${rulesCard()}
    </div>
    ${secNav()}
    <div class="wrap stack secs">
      <div class="list-h"><h2 class="disp">The angles</h2><p>Pick one, open it, and follow the opener and shot plan.</p></div>
      ${body || `<div class="card empty">Nothing matches that format. <button class="btn" data-clear>Show every format</button></div>`}
    </div>
  </main>
  <div class="dock list-dock">
    <button class="btn dock-sec" data-sections>${ic('target')}<span>Sections</span></button>
    ${submitBtn(null, 'btn acc')}
  </div>
  ${footer()}`;

  app.querySelectorAll('[data-jump]').forEach(el => el.onclick = e => { e.preventDefault(); jumpTo(el.dataset.jump); });
  app.querySelectorAll('[data-more]').forEach(el => el.onclick = () => {
    app.querySelectorAll(`[data-grid="${CSS.escape(el.dataset.more)}"] [hidden]`).forEach(x => x.hidden = false);
    el.remove();
  });
  app.querySelector('[data-avoidall]')?.addEventListener('click', e => { app.querySelectorAll('#avoid li[hidden]').forEach(x => x.hidden = false); e.currentTarget.remove(); });
  app.querySelector('[data-fmts]')?.addEventListener('click', openFormats);
  app.querySelector('[data-clear]')?.addEventListener('click', () => setFormat('all'));
  app.querySelector('[data-sections]').onclick = openSections;
  wireSubmit(app);
  wireChart();
  spy();
}

function jumpTo(id) {
  const el = document.getElementById('s-' + id);
  if (!el) return;
  const nav = app.querySelector('.secnav');
  const hd = app.querySelector('.hd');
  const off = (nav?.offsetHeight || 0) + (getComputedStyle(hd).position === 'sticky' ? hd.offsetHeight : 0) + 8;
  scrollTo({ top: el.getBoundingClientRect().top + scrollY - off, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function setFormat(f) {
  FILTER.fmt = f;
  const top = app.querySelector('.secs')?.getBoundingClientRect().top + scrollY;
  renderList();
  if (top) scrollTo({ top: Math.max(0, top - 120) });
}
function openFormats() {
  const fmts = [...new Set(uniqAngles().map(a => a.format).filter(Boolean))];
  const count = f => uniqAngles().filter(a => f === 'all' || a.format === f).length;
  sheet('Filter by format', `<div class="opts">${['all', ...fmts].map(f => `<button class="opt ${FILTER.fmt === f ? 'on' : ''}" data-f="${esc(f)}"><span>${f === 'all' ? 'Every format' : esc(f)}</span><small>${count(f)}</small>${FILTER.fmt === f ? ic('check') : ''}</button>`).join('')}</div>`,
    (w, done) => w.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { done(); setFormat(b.dataset.f); }));
}
function openSections() {
  sheet('Jump to a section', `<div class="opts">${allSecs().map(s => `<button class="opt" data-s="${esc(s.id)}" style="${toneVars(s.color)}"><span class="badge sm" data-tone>${svgI(s.icon_svg)}</span><span><b>${esc(s.name)}</b>${s.line ? `<em>${esc(s.line)}</em>` : ''}</span><small>${s.angles.length}</small></button>`).join('')}
    <button class="opt" data-top><span class="badge sm">${ic('arrow-left')}</span><span><b>Back to the top</b><em>Season, stop list and rules</em></span></button></div>`,
    (w, done) => {
      w.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { done(); setTimeout(() => jumpTo(b.dataset.s), 220); });
      w.querySelector('[data-top]').onclick = () => { done(); scrollTo({ top: 0, behavior: 'smooth' }); };
    });
}

/* Highlight the section on screen in the sticky bar, and keep its chip in view. */
function spy() {
  if (SPY) SPY.disconnect();
  const chips = app.querySelector('[data-chips]');
  if (!chips || !('IntersectionObserver' in window)) return;
  const set = id => {
    chips.querySelectorAll('.snav').forEach(c => c.classList.toggle('on', c.dataset.jump === id));
    const on = chips.querySelector('.snav.on');
    if (on) chips.scrollTo({ left: on.offsetLeft - 16, behavior: 'smooth' });
  };
  SPY = new IntersectionObserver(es => {
    const vis = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (vis) set(vis.target.dataset.sec);
  }, { rootMargin: '-35% 0px -55% 0px' });
  app.querySelectorAll('[data-sec]').forEach(s => SPY.observe(s));
}

/* ---------- one angle ---------- */
function proofTile(p) {
  const labels = {
    meta: ['ad', 'Ran as an ad'],
    post: ['post', `Creator post · ${p.url ? platformOf(p.url) : ''}`],
    typed: ['typed', 'Example · views typed by us'],
    upload: ['upload', 'Clip from the team'],
    inspo: ['inspo', 'Inspiration · another brand'],
  };
  const [cls, label] = labels[p.kind] || ['post', 'Example'];
  const sub = p.kind === 'meta' ? 'Tap to play'
    : p.kind === 'inspo' ? 'Steal the shape, not the brand'
    : p.views ? `${fmtViews(p.views)} views${p.kind === 'typed' ? ' (typed)' : ''}` : (p.kind === 'upload' ? 'Tap to play' : `Opens on ${platformOf(p.url || '')}`);
  const who = p.who || (p.kind === 'meta' ? D.brand.display_name : '');
  const opensOut = p.kind === 'post' || p.kind === 'typed' || p.kind === 'inspo';
  const inner = `<span class="media" ${p.kind === 'meta' ? `data-cover="${esc(p.ad_id)}"` : ''}>${p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy">` : ''}<span class="play">${ic(opensOut ? 'external-link' : 'play')}</span></span>
    <span class="src ${cls}">${esc(label)}</span>
    <span class="meta"><b>${esc(who || sub)}</b><span>${esc(who ? sub : '')}</span>${p.note ? `<span class="note">${esc(p.note)}</span>` : ''}</span>`;
  if (p.kind === 'meta') return `<button class="tile" data-play-ad="${esc(p.ad_id)}" aria-label="Play this ad">${inner}</button>`;
  if (p.kind === 'upload') return `<button class="tile" data-play-file="${esc(p.file)}" aria-label="Play this clip">${inner}</button>`;
  return `<a class="tile" href="${esc(p.url)}" target="_blank" rel="noopener" aria-label="Open this video on ${esc(platformOf(p.url || ''))}">${inner}</a>`;
}

function renderAngle(id) {
  const a = findAngle(id);
  if (!a) { history.replaceState(null, '', location.pathname + location.search); return renderList(); }
  const s = sectionOf(a);
  const list = uniqAngles();
  const idx = list.indexOf(a);
  const prev = list[(idx - 1 + list.length) % list.length];
  const next = list[(idx + 1) % list.length];
  document.title = `${a.title} · ${D.brand.display_name}`;
  const shots = a.shots || [];
  const proof = a.proof.length
    ? `<div class="proof">${a.proof.map(proofTile).join('')}</div>`
    : `<div class="noproof">${ic('lightbulb')}<div><b>No video on this one yet.</b><p>It is a fresh idea, so there is nothing to copy. Follow the openers and the shot plan, and yours could be the example everyone sees here.</p></div></div>`;
  const tone0 = s ? toneVars(s.color) : '';
  app.innerHTML = `${header()}
  <main class="detail" style="${tone0}">
    <div class="wrap">
      <div class="det-top">
        <a class="back" href="#" data-back>${ic('arrow-left')}All angles</a>
        <span class="pos">${idx + 1} of ${list.length}</span>
      </div>
      <div class="det">
        <div class="det-main">
          <div class="det-head">
            <div class="tags">
              ${a.hot && D.hot ? `<span class="chip" style="${toneVars(D.hot.color)}" data-tone>${svgI(D.hot.icon_svg)}${esc(D.hot.name)}</span>` : ''}
              ${s ? `<span class="chip" data-tone>${svgI(s.icon_svg)}${esc(s.name)}</span>` : ''}
              ${a.format ? `<span class="chip">${esc(a.format)}</span>` : ''}
              ${a.products ? `<span class="chip">${esc(a.products)}</span>` : ''}
            </div>
            <h1 class="serif">${esc(a.title)}</h1>
            ${a.argument ? `<p class="idea">${esc(a.argument)}</p>` : ''}
            ${a.who ? `<p class="who">${ic('users')}<span><b>Who it is for.</b> ${esc(a.who)}</span></p>` : ''}
            ${a.trend ? `<p class="who">${ic('music')}<span><b>Trend to ride.</b> ${esc(a.trend)}</span></p>` : ''}
          </div>

          ${(a.openers || []).length ? `<section class="blk"><h2>${ic('type')}Openers you can steal</h2><p class="sub">The first line decides everything. Tap to copy.</p>
          <ul class="openers">${a.openers.map((o, i) => `<li><button class="opener" data-copy="${i}"><span class="hook">&ldquo;${esc(o)}&rdquo;</span><span class="cp">${ic('copy')}<em>Copy</em></span></button></li>`).join('')}</ul></section>` : ''}

          ${shots.length ? `<section class="blk"><h2>${ic('clapperboard')}What to film</h2><p class="sub">Shot by shot.</p>
          <ol class="shots">${shots.map((x, i) => `<li><span class="n">${i + 1}</span><div><p class="lbl">${esc(x.label)}</p><p>${esc(x.text)}</p></div></li>`).join('')}</ol></section>` : ''}
          ${a.on_screen ? `<div class="overlay">${ic('type')}<div><p class="lbl">Text on screen</p><p>${esc(a.on_screen)}</p></div><button class="btn icon ghost" data-copytext aria-label="Copy the text">${ic('copy')}</button></div>` : ''}

          <section class="blk"><h2>${ic('play')}Proof it works</h2><p class="sub">Videos made on this angle. The label says where each came from.${a.proof.length > 1 ? ' <span class="swipe-t">Swipe for more.</span>' : ''}</p>
          ${proof}</section>

          ${(a.do_text || a.dont_text) ? `<div class="dd">
            ${a.do_text ? `<div class="do"><p class="lbl">${ic('check')}Do</p><p>${esc(a.do_text)}</p></div>` : ''}
            ${a.dont_text ? `<div class="dont"><p class="lbl">${ic('ban')}Don't</p><p>${esc(a.dont_text)}</p></div>` : ''}
          </div>` : ''}
        </div>
        <aside class="side">
          <div class="card side-c">
            ${submitBtn(a, 'btn acc big')}
            <p class="stat">${D.brand.submit_url ? `Opens the ${esc(D.brand.display_name)} campaign on ${esc(plat())} and copies the angle name for your submission note.` : `Submit on ${esc(plat())} like always, with the angle name in your note.`}</p>
          </div>
          <div class="card side-c"><p class="lbl">This angle so far</p><p class="so-far">${a.proof.length ? `<b>${a.proof.length}</b> example${a.proof.length === 1 ? '' : 's'}${a.ads ? `, <b>${a.ads}</b> ran as paid ads` : ''}` : 'Nobody has filmed it yet'}</p></div>
          <div class="pn">
            <a class="card pn-a" href="#a=${esc(prev.id)}">${ic('arrow-left')}<span><small>Previous</small>${esc(prev.title)}</span></a>
            <a class="card pn-a r" href="#a=${esc(next.id)}"><span><small>Next</small>${esc(next.title)}</span>${ic('arrow-right')}</a>
          </div>
        </aside>
      </div>
    </div>
  </main>
  <div class="dock">
    <a class="btn icon big" href="#a=${esc(prev.id)}" aria-label="Previous angle">${ic('arrow-left')}</a>
    ${submitBtn(a, 'btn acc big')}
    <a class="btn icon big" href="#a=${esc(next.id)}" aria-label="Next angle">${ic('arrow-right')}</a>
  </div>
  ${footer()}`;

  app.querySelectorAll('[data-copy]').forEach(el => el.onclick = async () => {
    if (await copy(a.openers[+el.dataset.copy])) {
      toast('Opener copied');
      el.classList.add('done'); setTimeout(() => el.classList.remove('done'), 1400);
    }
  });
  app.querySelector('[data-copytext]')?.addEventListener('click', async () => { if (await copy(a.on_screen)) toast('Text copied'); });
  app.querySelector('[data-back]').onclick = e => { e.preventDefault(); goList(); };
  app.querySelectorAll('[data-play-ad]').forEach(el => el.onclick = () => playAd(el.dataset.playAd));
  app.querySelectorAll('[data-play-file]').forEach(el => el.onclick = () => playFile(API + el.dataset.playFile));
  wireSubmit(app);
  loadCovers(a);
  swipeNav(app.querySelector('.det-main'), prev.id, next.id);
  scrollTo(0, 0);
}

/* Swipe left or right on an angle to move to the next or previous one. Ignored
   inside the proof row, which scrolls sideways on its own. */
function swipeNav(el, prevId, nextId) {
  if (!el) return;
  let x0 = null, y0 = null;
  el.addEventListener('touchstart', e => { if (e.target.closest('.proof')) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45) location.hash = 'a=' + (dx < 0 ? nextId : prevId);
  }, { passive: true });
}

function goList() {
  history.pushState(null, '', location.pathname + location.search);
  route();
}

async function loadCovers(a) {
  const ids = a.proof.filter(p => p.kind === 'meta' && !p.thumb).map(p => p.ad_id);
  if (!ids.length) return;
  try {
    const r = await fetch(`${API}/api/ad-creatives?angles=${encodeURIComponent(SLUG)}&ads=${encodeURIComponent(ids.join(','))}`).then(x => x.json());
    for (const [id, v] of Object.entries(r.assets || {})) {
      if (!v.thumb) continue;
      document.querySelectorAll(`[data-cover="${CSS.escape(id)}"]`).forEach(m => { if (!m.querySelector('img')) m.insertAdjacentHTML('afterbegin', `<img src="${esc(v.thumb)}" alt="" loading="lazy">`); });
    }
  } catch { /* the placeholder stays */ }
}

function player(inner) {
  const w = document.createElement('div');
  w.className = 'player-wrap';
  w.innerHTML = `<div class="player" role="dialog" aria-modal="true" aria-label="Video">${inner}<button class="btn big" data-close>${ic('x')}Close</button></div>`;
  document.body.appendChild(w);
  document.body.classList.add('locked');
  const done = () => { w.querySelectorAll('video').forEach(v => v.pause()); w.remove(); document.body.classList.remove('locked'); document.removeEventListener('keydown', k); };
  const k = e => { if (e.key === 'Escape') done(); };
  document.addEventListener('keydown', k);
  w.addEventListener('click', e => { if (e.target === w) done(); });
  w.querySelector('[data-close]').onclick = done;
  w.querySelector('[data-close]').focus();
  return w;
}
async function playAd(adId) {
  const w = player(`<div class="empty">Loading the ad…</div>`);
  try {
    const res = await fetch(`${API}/api/ad-video?ad=${encodeURIComponent(adId)}&angles=${encodeURIComponent(SLUG)}`);
    const v = await res.json();
    if (!res.ok) throw new Error(v.error || 'This ad cannot be played right now.');
    const box = w.querySelector('.empty');
    if (v.src) box.outerHTML = `<video src="${esc(v.src)}" controls autoplay playsinline></video>`;
    else if (v.preview) box.outerHTML = `<iframe class="frame" src="${esc(v.preview)}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen title="The ad, as Meta shows it"></iframe>`;
    else throw new Error('This ad has no video to play.');
    w.querySelector('video')?.play().catch(() => {});
  } catch (e) {
    const box = w.querySelector('.empty');
    if (box) box.textContent = e.message;
  }
}
function playFile(src) {
  const w = player(`<video src="${esc(src)}" controls autoplay playsinline></video>`);
  w.querySelector('video').play().catch(() => {});
}

/* ---------- boot ---------- */
let LIST_Y = 0;
function route() {
  if (!D) return;
  const m = location.hash.match(/^#a=([a-f0-9]+)/);
  document.body.classList.toggle('on-detail', !!m);
  if (m) renderAngle(m[1]);
  else { renderList(); if (LIST_Y) { scrollTo(0, LIST_Y); LIST_Y = 0; } }
}
window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#a="]');
  if (a && !location.hash.startsWith('#a=')) LIST_Y = scrollY;
});
// A layout that changes between phone and tablet re-renders once, so the
// phone-only folds and cut-offs are right after rotating an iPad.
let lastPhone = null;
addEventListener('resize', () => {
  const p = isPhone();
  if (lastPhone !== null && p !== lastPhone && D && !location.hash.startsWith('#a=')) { const y = scrollY; renderList(); scrollTo(0, y); }
  lastPhone = p;
});

async function boot() {
  lastPhone = isPhone();
  if (!SLUG) { app.innerHTML = `<div class="center"><div><h1 class="serif">Creator angles</h1><p class="muted">This link is missing the brand. Check the link you were sent.</p></div></div>`; return; }
  app.innerHTML = `<div class="wrap" style="padding-top:48px;display:flex;flex-direction:column;gap:14px;max-width:720px"><div class="skel" style="height:44px;width:70%"></div><div class="skel"></div><div class="skel" style="width:85%"></div><div class="skel" style="height:180px;margin-top:20px"></div></div>`;
  try {
    const res = await fetch(`${API}/api/angles/${encodeURIComponent(SLUG)}`);
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'This page could not be loaded.');
    if (!j.live) {
      applyAccent(j.brand?.accent);
      app.innerHTML = `<div class="center"><div><h1 class="serif">${esc(j.brand?.display_name || '')} creator angles</h1><p class="muted">This page is being set up. Check back soon.</p></div></div>`;
      return;
    }
    D = j;
    applyAccent(j.brand.accent);
    route();
  } catch (e) {
    app.innerHTML = `<div class="center"><div><h1 class="serif">Page not found</h1><p class="muted">${esc(e.message)}</p></div></div>`;
  }
}
boot();
})();
