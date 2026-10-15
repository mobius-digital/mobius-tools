/* The creator link (Ambassadors). One brand's video board, read by its TRYBE creators.
 * Data: GET {API}/api/angles/<slug>. No sign-in, no money on the page.
 * Built by angles/build.py, which inlines the Lucide icons into app.js.
 *
 * v19 (2026-10-14, Cole after walking Frost Buddy's hub): ONE page, a video board.
 *   "Watch these. Make your version." -> category chips (the brand's sections, only when
 *   there are two or more) -> a grid of videos (tap plays; ours and other brands', the
 *   other brands' ones carry who made it and the team's one-line "steal this" note) ->
 *   the 4 steps (the TRYBE link lives in step 4 only) -> the checklist (stop filming these,
 *   before you film, always say, skip these).
 * Every idea field (steps, openers, hooks bank, season, about) is still stored and edited
 * in Locus; the page just does not show it. Look = Locus v2: Inter, graphite dark by
 * default, a true light theme, one brand accent.
 */
(function () {
'use strict';
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
// Local testing only: ?api=http://127.0.0.1:8799 points the page at a dev worker.
const API = (LOCAL && new URLSearchParams(location.search).get('api')) || 'https://mobius-profit.mobius-digital.workers.dev';
/* A signed-in Mobius team member (same origin as Locus) sees a switched-off page in
   full, flagged as a preview. Creators have no session and never send one. */
function staffToken() {
  try {
    const own = localStorage.getItem('pf_token');
    if (own) return own;
    const t = localStorage.getItem('mobius_session');
    const exp = +localStorage.getItem('mobius_session_exp') || 0;
    return t && (exp === 0 || exp > Date.now() + 60e3) ? t : '';
  } catch { return ''; }
}
const TOK = staffToken();
const authed = () => (TOK ? { headers: { Authorization: 'Bearer ' + TOK } } : undefined);
const ICONS = {"copy": "<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\"/><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\"/>", "external-link": "<path d=\"M15 3h6v6\"/><path d=\"M10 14 21 3\"/><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"/>", "play": "<path d=\"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z\"/>", "arrow-left": "<path d=\"m12 19-7-7 7-7\"/><path d=\"M19 12H5\"/>", "arrow-right": "<path d=\"M5 12h14\"/><path d=\"m12 5 7 7-7 7\"/>", "chevron-right": "<path d=\"m9 18 6-6-6-6\"/>", "chevron-down": "<path d=\"m6 9 6 6 6-6\"/>", "x": "<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>", "sparkles": "<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\"/><path d=\"M20 2v4\"/><path d=\"M22 4h-4\"/><circle cx=\"4\" cy=\"20\" r=\"2\"/>", "ban": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M4.929 4.929 19.07 19.071\"/>", "shield-check": "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/><path d=\"m9 12 2 2 4-4\"/>", "calendar-days": "<path d=\"M8 2v3\"/><path d=\"M16 2v3\"/><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18\"/><path d=\"M8 13h.01\"/><path d=\"M12 13h.01\"/><path d=\"M16 13h.01\"/><path d=\"M8 17h.01\"/><path d=\"M12 17h.01\"/><path d=\"M16 17h.01\"/>", "clapperboard": "<path d=\"m12.296 3.464 3.02 3.956\"/><path d=\"M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z\"/><path d=\"M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/><path d=\"m6.18 5.276 3.1 3.899\"/>", "eye": "<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>", "type": "<path d=\"M12 4v16\"/><path d=\"M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2\"/><path d=\"M9 20h6\"/>", "music": "<path d=\"M9 18V5l12-2v13\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><circle cx=\"18\" cy=\"16\" r=\"3\"/>", "flame": "<path d=\"M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4\"/>", "leaf": "<path d=\"M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20\"/><path d=\"M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13\"/>", "check": "<path d=\"M20 6 9 17l-5-5\"/>", "lightbulb": "<path d=\"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5\"/><path d=\"M9 18h6\"/><path d=\"M10 22h4\"/>", "video": "<path d=\"m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5\"/><rect x=\"2\" y=\"6\" width=\"14\" height=\"12\" rx=\"2\"/>", "image": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/><circle cx=\"9\" cy=\"9\" r=\"2\"/><path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\"/>", "link": "<path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\"/><path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"/>", "upload": "<path d=\"M12 3v12\"/><path d=\"m17 8-5-5-5 5\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/>", "pencil": "<path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/><path d=\"m15 5 4 4\"/>", "plus": "<path d=\"M5 12h14\"/><path d=\"M12 5v14\"/>", "grip-vertical": "<circle cx=\"9\" cy=\"12\" r=\"1\"/><circle cx=\"9\" cy=\"5\" r=\"1\"/><circle cx=\"9\" cy=\"19\" r=\"1\"/><circle cx=\"15\" cy=\"12\" r=\"1\"/><circle cx=\"15\" cy=\"5\" r=\"1\"/><circle cx=\"15\" cy=\"19\" r=\"1\"/>", "search": "<path d=\"m21 21-4.34-4.34\"/><circle cx=\"11\" cy=\"11\" r=\"8\"/>", "eye-off": "<path d=\"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49\"/><path d=\"M14.084 14.158a3 3 0 0 1-4.242-4.242\"/><path d=\"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143\"/><path d=\"m2 2 20 20\"/>", "download": "<path d=\"M12 15V3\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m7 10 5 5 5-5\"/>", "qr-code": "<rect width=\"5\" height=\"5\" x=\"3\" y=\"3\" rx=\"1\"/><rect width=\"5\" height=\"5\" x=\"16\" y=\"3\" rx=\"1\"/><rect width=\"5\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\"/><path d=\"M21 16h-3a2 2 0 0 0-2 2v3\"/><path d=\"M21 21v.01\"/><path d=\"M12 7v3a2 2 0 0 1-2 2H7\"/><path d=\"M3 12h.01\"/><path d=\"M12 3h.01\"/><path d=\"M12 16v.01\"/><path d=\"M16 12h1\"/><path d=\"M21 12v.01\"/><path d=\"M12 21v-1\"/>", "users": "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><path d=\"M16 3.128a4 4 0 0 1 0 7.744\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/>", "file-text": "<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 9H8\"/><path d=\"M16 13H8\"/><path d=\"M16 17H8\"/>", "lock": "<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/>", "rocket": "<path d=\"M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5\"/><path d=\"M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09\"/><path d=\"M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z\"/><path d=\"M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05\"/>", "star": "<path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\"/>", "target": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><circle cx=\"12\" cy=\"12\" r=\"6\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/>", "ghost": "<path d=\"M15 10v1\"/><path d=\"M7.528 20.472a1.6 1.6 0 012.277 0l1.057 1.056a1.6 1.6 0 002.276 0l1.057-1.056a1.6 1.6 0 012.277 0l1.114 1.114a1.4 1.4 0 002.414-1V10a8 8 0 00-16 0v10.586a1.4 1.4 0 002.414 1z\"/><path d=\"M9 10v1\"/>", "gift": "<path d=\"M12 7v14\"/><path d=\"M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8\"/><path d=\"M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5\"/><rect x=\"3\" y=\"7\" width=\"18\" height=\"4\" rx=\"1\"/>", "shuffle": "<path d=\"m18 14 4 4-4 4\"/><path d=\"m18 2 4 4-4 4\"/><path d=\"M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22\"/><path d=\"M2 6h1.972a4 4 0 0 1 3.6 2.2\"/><path d=\"M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45\"/>", "refresh-cw": "<path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\"/><path d=\"M21 3v5h-5\"/><path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\"/><path d=\"M8 16H3v5\"/>", "list": "<path d=\"M3 5h.01\"/><path d=\"M3 12h.01\"/><path d=\"M3 19h.01\"/><path d=\"M8 5h13\"/><path d=\"M8 12h13\"/><path d=\"M8 19h13\"/>", "zap": "<path d=\"M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z\"/>", "chevron-up": "<path d=\"m18 15-6-6-6 6\"/>", "list-checks": "<path d=\"M13 5h8\"/> <path d=\"M13 12h8\"/> <path d=\"M13 19h8\"/> <path d=\"m3 17 2 2 4-4\"/> <path d=\"m3 7 2 2 4-4\"/>", "megaphone": "<path d=\"M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z\"/> <path d=\"M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14\"/> <path d=\"M8 6v8\"/>"};
const ic = (n, s = 16) => `<svg class="i" viewBox="0 0 24 24" style="width:${s}px;height:${s}px" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = document.getElementById('app');
const canHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

function slugFromUrl() {
  const q = new URLSearchParams(location.search).get('b');
  if (q) return q.toLowerCase();
  const m = location.pathname.match(/\/angles\/([a-z0-9-]+)\/?$/i);
  return m ? m[1].toLowerCase() : '';
}
const SLUG = slugFromUrl();
let D = null;
let CAT = 'all';
let TILES = [];

function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

/* ---------- colour: one brand accent, readable on both themes ---------- */
function hexToRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
const mix = (rgb, w, t) => rgb.map((c, i) => Math.round(c * (1 - t) + w[i] * t));
const toHex = rgb => '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('');
function lum(rgb) { const a = rgb.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * a[0] + .7152 * a[1] + .0722 * a[2]; }
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
function toward(rgb, target, bg, ratio) { let c = rgb; for (let i = 0; i < 20 && contrast(c, bg) < ratio; i++) c = mix(c, target, .1); return c; }
function applyAccent(hex) {
  const rgb = hexToRgb(hex) || [143, 179, 255];
  const r = document.documentElement.style;
  r.setProperty('--acc-d', toHex(toward(rgb, [255, 255, 255], [19, 19, 22], 4.5)));
  r.setProperty('--acc-l', toHex(toward(rgb, [0, 0, 0], [255, 255, 255], 4.5)));
  r.setProperty('--acc-rgb', rgb.join(','));
}

/* ---------- the tiles ---------- */
const isTheirs = p => p.kind === 'inspo' || (p.kind === 'upload' && /inspiration|another brand/i.test(p.who || ''));
const whoOf = p => String(p.who || '').replace(/\s*\(inspiration\)\s*$/i, '').replace(/^another brand$/i, '').trim();
const plat = () => D.brand.submit_platform || 'TRYBE';
const SHOW_FIRST = 24;   // Frost Buddy shows 30 of 50, then "See more"
let SHOW_ALL = false;
function ideas() {
  const seen = new Set();
  return [D.hot, ...D.sections].filter(s => s && s.angles.length).flatMap(s => s.angles).filter(a => !seen.has(a.id) && seen.add(a.id));
}
const secName = id => D.sections.find(s => s.id === id)?.name || '';
const playableProof = p => p.kind === 'meta' || p.kind === 'upload' || ((p.kind === 'post' || p.kind === 'typed') && p.url && p.thumb);
/* Deal round-robin so one idea never shows twice in a row: every idea's lead video, then every
   idea's second video, and so on. Inside an idea our own videos lead and other brands' follow. */
function dealt(list) {
  const out = [];
  const seen = new Set();
  list.forEach(([a, pr], ai) => {
    let r = 0;
    for (const p of pr) {
      const key = p.ad_id || p.file || p.url;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ p, a, theirs: isTheirs(p), hot: !!a.hot, r: r++, ai });
    }
  });
  return out.sort((x, y) => (y.hot && y.r === 0) - (x.hot && x.r === 0) || (x.r - y.r) || (x.ai - y.ai));
}
/* Two ways to fill the board, set per brand on the Ambassadors tab (board_mode):
     picked  the proof videos attached to the ideas, as the team chose them.
     auto    the brand's own Meta video ads ranked by Triple Whale orders (D.board, ids and rank
             only), then other brands' clips from the ideas.
   ONE "Start here" star, on the very first video, like Frost Buddy. */
function buildTiles() {
  const all = ideas();
  let out;
  if (D.board && D.board.length) {
    const ideaOf = {};
    for (const a of all) for (const p of a.proof || []) if (p.kind === 'meta' && p.ad_id && !ideaOf[p.ad_id]) ideaOf[p.ad_id] = a;
    const ours = D.board.map(x => ({ p: { kind: 'meta', ad_id: x.ad_id }, a: ideaOf[x.ad_id] || null, theirs: false, rank: x.rank }));
    const theirs = dealt(all.map(a => [a, (a.proof || []).filter(p => playableProof(p) && isTheirs(p))]));
    out = [...ours, ...theirs];
  } else {
    out = dealt(all.map(a => [a, (a.proof || []).filter(playableProof).sort((x, y) => isTheirs(x) - isTheirs(y))]));
  }
  return out.map((t, i) => ({ ...t, star: i === 0, sec: t.a?.section_id || '', i }));
}
function cats() {
  const n = {};
  for (const t of TILES) if (t.sec) n[t.sec] = (n[t.sec] || 0) + 1;
  return D.sections.filter(s => n[s.id]).map(s => ({ id: s.id, name: s.name, n: n[s.id] }));
}
const shown = () => TILES.filter(t => CAT === 'all' || t.sec === CAT);
/* What a tile says, Frost Buddy's card: the caption in bold, one small line under it, the category
   top right. Our video: the idea's title (or, on the auto board, the ad's own headline once the
   covers call brings it). Another brand's: the team's "steal this" note, and whose it is. */
function words(t) {
  const p = t.p;
  if (t.theirs) return { cap: p.note || t.a?.title || '', sub: `${whoOf(p) || 'Another brand'}, not us`, chip: secName(t.sec) };
  if (t.rank) return { cap: t.a?.title || '', sub: `#${t.rank} right now`, chip: secName(t.sec) || 'Our ad', capAd: t.a ? '' : p.ad_id };
  return { cap: t.a?.title || '', sub: p.kind === 'meta' ? 'Ran as our ad' : 'Our video', chip: secName(t.sec) };
}

function tile(t) {
  const p = t.p;
  const w = words(t);
  const cover = p.kind === 'meta' ? `data-cover="${esc(p.ad_id)}"` : '';
  const media = p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy">`
    : p.kind === 'upload' ? `<video class="pv" data-src="${esc(API + p.file)}#t=0.8" preload="none" muted playsinline loop tabindex="-1" aria-hidden="true"></video>` : '';
  return `<button class="tile${t.theirs ? ' them' : ''}" data-t="${t.i}" ${cover} aria-label="Play: ${esc(w.cap || 'video')}">
    ${media}
    ${t.star ? `<span class="tl-star">${ic('star', 11)}Start here</span>` : ''}
    ${w.chip ? `<span class="tl-chip">${esc(w.chip)}</span>` : ''}
    <span class="tl-play">${ic('play', 18)}</span>
    <span class="tl-cap"><b ${w.capAd ? `data-cap-ad="${esc(w.capAd)}"` : ''}>${esc(w.cap || 'One of our top ads')}</b><small>${esc(w.sub)}</small></span>
  </button>`;
}

/* ---------- the page ---------- */
const SKIP_RE = /^\s*(never|don'?t|do not|avoid|skip|no\b)/i;
function checklist() {
  const b = D.brand;
  const av = b.avoid || [], g = b.guide || [], r = b.rules || [];
  const say = r.filter(x => !SKIP_RE.test(x)), skip = r.filter(x => SKIP_RE.test(x));
  if (!av.length && !g.length && !r.length) return '';
  const list = (cls, title, items) => items.length ? `<div class="ck-list ${cls}"><p class="ck-h">${esc(title)}</p><ul>${items.map(x => `<li>${typeof x === 'string' ? esc(x) : `<b>${esc(x.title)}</b>${x.why ? ` <span>${esc(x.why)}</span>` : ''}`}</li>`).join('')}</ul></div>` : '';
  return `<section class="card checklist" id="checklist">
    <div class="ck-top"><h2>${ic('list-checks', 18)}Before you film</h2><p>Two minutes. Saves you a video we cannot run.</p></div>
    ${list('ck-stop', 'Please stop filming these', av)}
    ${g.length ? `<div class="ck-boxes">${g.map(x => `<div class="ck-box">${ic('check', 15)}<div><b>${esc(x.title)}</b>${x.text ? `<span>${esc(x.text)}</span>` : ''}</div></div>`).join('')}</div>` : ''}
    ${list('ck-say', 'Always say', say)}
    ${list('ck-skip', 'Skip these', skip)}
  </section>`;
}
function steps() {
  const b = D.brand;
  const S = [
    ['Pick one', 'Tap any video. Watch how they filmed it.'],
    ['Copy it', 'Same idea, your place, your voice, our product.'],
    ['Film it right', 'Run the checklist below.'],
    [`Submit on ${plat()}`, 'Send it in so it can run as an ad.'],
  ];
  return `<section class="card steps">
    <div class="st-row">${S.map(([t, d], k) => `<div class="st"><b><span>${k + 1}</span>${esc(t)}</b><p>${esc(d)}</p></div>`).join('')}</div>
    ${b.submit_url ? `<a class="btn btn-acc st-go" href="${esc(b.submit_url)}" target="_blank" rel="noopener">${esc(b.submit_label || `Open our ${plat()} campaign`)}${ic('arrow-right', 15)}</a>` : ''}
  </section>`;
}
function render() {
  const b = D.brand;
  document.title = `${b.display_name} · Watch these, make your version`;
  const cs = cats();
  const list = shown();
  const cut = SHOW_ALL ? list.length : Math.min(list.length, SHOW_FIRST);
  const pv = D.preview ? `<div class="pv-bar" role="status"><b>Preview.</b> This link is switched off, so creators see "being set up". Only signed-in Mobius staff can see this page.</div>` : '';
  app.innerHTML = `${pv}
  <header class="top"><div class="col">
    <a class="brand" href="#" aria-label="${esc(b.display_name)} creators">${b.logo_url ? `<img src="${esc(LOGO_TRIM[b.logo_url] || b.logo_url)}" alt="${esc(b.display_name)}" crossorigin="anonymous" data-logo="${esc(b.logo_url)}">` : `<span class="nm">${esc(b.display_name)}</span>`}<span class="tag-c">Creators</span></a>
    <a class="top-link" href="#checklist">${ic('list-checks', 16)}<span>Before you film</span></a>
  </div></header>
  <main class="col">
    <section class="hero">
      <h1>Watch these. Make your version.</h1>
      <p class="lede">${D.board ? `Our best videos right now, and other brands doing it well.` : `Videos that worked, ours and other brands'.`} Pick one, film yours today. That's the whole job.</p>
      <a class="lede-link" href="#checklist">${ic('check', 14)}Read "Before you film" first</a>
    </section>
    ${cs.length > 1 ? `<div class="cats" role="group" aria-label="Show"><button class="cat ${CAT === 'all' ? 'on' : ''}" data-cat="all">All<span>${TILES.length}</span></button>${cs.map(c => `<button class="cat ${CAT === c.id ? 'on' : ''}" data-cat="${esc(c.id)}">${esc(c.name)}<span>${c.n}</span></button>`).join('')}</div>` : ''}
    <div class="grid">${list.slice(0, cut).map(tile).join('') || '<p class="empty">No videos here yet.</p>'}</div>
    ${cut < list.length ? `<button class="more" data-more>See all ${list.length} videos${ic('chevron-down', 15)}</button>` : ''}
    ${steps()}
    ${checklist()}
  </main>
  <footer><div class="col"><span>Questions? Message ${esc(b.display_name)} on ${esc(plat())}.</span><span>Powered by Mobius Digital</span></div></footer>`;
  wire();
}
function wire() {
  app.querySelectorAll('[data-cat]').forEach(c => c.onclick = () => {
    CAT = c.dataset.cat; SHOW_ALL = false;
    const y = app.querySelector('.cats').getBoundingClientRect().top;
    const x = app.querySelector('.cats').scrollLeft;
    render();
    const n = app.querySelector('.cats'); n.scrollLeft = x;
    scrollBy(0, n.getBoundingClientRect().top - y);
  });
  app.querySelector('[data-more]')?.addEventListener('click', () => { const y = scrollY; SHOW_ALL = true; render(); scrollTo(0, y); });
  app.querySelectorAll('[data-t]').forEach(el => {
    el.onclick = () => openPlayer(TILES[+el.dataset.t]);
    if (!canHover()) return;
    const v = el.querySelector('video');
    if (!v) return;
    el.addEventListener('mouseenter', () => { if (v.dataset.src) loadPreview(v); v.play().catch(() => {}); });
    el.addEventListener('mouseleave', () => { v.pause(); try { v.currentTime = .8; } catch {} });
  });
  app.querySelectorAll('a[href="#checklist"]').forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById('checklist')?.scrollIntoView({ behavior: 'smooth' }); });
  app.querySelector('.brand').onclick = e => { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); };
  wirePreviews();
  loadCovers(shown().map(t => t.p));
}

/* First frames: a clip's <video> gets its src only when it is near the screen. */
function loadPreview(v) { if (v.dataset.src) { v.src = v.dataset.src; v.preload = 'metadata'; delete v.dataset.src; } }
const previewIO = 'IntersectionObserver' in window ? new IntersectionObserver(es => {
  for (const e of es) if (e.isIntersecting) { loadPreview(e.target); previewIO.unobserve(e.target); }
}, { rootMargin: '400px 0px' }) : null;
function wirePreviews() {
  app.querySelectorAll('video.pv[data-src]').forEach(v => previewIO ? previewIO.observe(v) : loadPreview(v));
}

/* ---------- the player: a sheet from the bottom on a phone, a card on a desktop ---------- */
function openPlayer(t) {
  closePlayer();
  const p = t.p, a = t.a;
  const wd = words(t);
  const cap = wd.capAd ? (document.querySelector(`[data-cap-ad="${CSS.escape(wd.capAd)}"]`)?.textContent || wd.cap) : wd.cap;
  const info = t.theirs
    ? `<span class="chip chip-them">${esc(whoOf(p) || 'Another brand')}</span>
       <b class="pl-t">${esc(cap)}</b>
       <p class="pl-s">Not our brand, but they did it well. Take the idea, film it with ${esc(D.brand.display_name)}.</p>`
    : `<span class="chip chip-ours">${esc(wd.sub)}</span>
       <b class="pl-t">${esc(cap || 'One of our top ads')}</b>
       ${a?.argument ? `<p class="pl-s">${esc(a.argument)}</p>` : ''}`;
  const w = document.createElement('div');
  w.className = 'pl-wrap'; w.id = 'player';
  w.innerHTML = `<div class="pl" role="dialog" aria-modal="true" aria-label="Video">
    <span class="grab" data-grab></span>
    <button class="pl-x" data-close aria-label="Close">${ic('x', 18)}</button>
    <div class="pl-v"><div class="loading">Loading the video…</div></div>
    <div class="pl-info">${info}
      <div class="pl-nav"><button class="btn btn-line" data-step="-1" aria-label="Previous video">${ic('arrow-left', 16)}</button><button class="btn btn-line pl-next" data-step="1">Next video${ic('arrow-right', 16)}</button></div>
    </div>
  </div>`;
  document.body.appendChild(w);
  document.body.classList.add('locked');
  requestAnimationFrame(() => w.classList.add('on'));
  const list = shown();
  const k = list.indexOf(t);
  w.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { const n = list[(k + +b.dataset.step + list.length) % list.length]; if (n) openPlayer(n); });
  w.querySelector('[data-close]').onclick = closePlayer;
  w.addEventListener('click', e => { if (e.target === w) closePlayer(); });
  let y0 = null;
  const g = w.querySelector('.pl');
  g.addEventListener('touchstart', e => { if (e.target.closest('video,iframe')) return; y0 = e.touches[0].clientY; }, { passive: true });
  g.addEventListener('touchend', e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 70) closePlayer(); y0 = null; }, { passive: true });
  loadMedia(w.querySelector('.pl-v'), p);
}
function closePlayer() {
  const w = document.getElementById('player');
  if (!w) return;
  w.querySelectorAll('video').forEach(v => v.pause());
  w.remove();
  document.body.classList.remove('locked');
}
document.addEventListener('keydown', e => {
  if (!document.getElementById('player')) return;
  if (e.key === 'Escape') closePlayer();
  if (e.key === 'ArrowRight') document.querySelector('#player [data-step="1"]')?.click();
  if (e.key === 'ArrowLeft') document.querySelector('#player [data-step="-1"]')?.click();
});
async function loadMedia(box, p) {
  const put = html => { box.innerHTML = html; box.querySelector('video')?.play().catch(() => {}); };
  if (p.kind === 'upload') return put(`<video src="${esc(API + p.file)}" controls autoplay playsinline></video>`);
  if (p.kind !== 'meta') { put(`<a class="btn btn-acc pl-out" href="${esc(p.url)}" target="_blank" rel="noopener">Watch it on ${/tiktok/i.test(p.url) ? 'TikTok' : /instagram/i.test(p.url) ? 'Instagram' : 'the web'}${ic('external-link', 15)}</a>`); return; }
  try {
    const res = D.preview
      ? await fetch(`${API}/api/ad-video?ad=${encodeURIComponent(p.ad_id)}`, authed())
      : await fetch(`${API}/api/ad-video?ad=${encodeURIComponent(p.ad_id)}&angles=${encodeURIComponent(SLUG)}`);
    const v = await res.json();
    if (!res.ok) throw new Error(v.error || 'This video cannot be played right now.');
    if (v.src) put(`<video src="${esc(v.src)}" controls autoplay playsinline></video>`);
    else if (v.preview) put(`<iframe class="frame" src="${esc(v.preview)}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen title="The ad, as Meta shows it"></iframe>`);
    else throw new Error('This ad has no video to play.');
  } catch (e) { box.innerHTML = `<div class="loading">${esc(e.message)}</div>`; }
}

/* ---------- logo ---------- */
// Store logos often carry wide clear margins, which make the mark tiny at header height.
// Trim them once per URL (Shopify's CDN allows the cross-origin read); on any failure the
// original image stays as it is.
const LOGO_TRIM = {};
document.addEventListener('load', e => {
  const im = e.target;
  if (!(im instanceof HTMLImageElement) || !im.dataset.logo || LOGO_TRIM[im.dataset.logo]) return;
  try {
    const w = im.naturalWidth, h = im.naturalHeight;
    if (!w || !h) return;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const px = g.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0 || (x1 - x0 + 1 > w * 0.95 && y1 - y0 + 1 > h * 0.95)) { LOGO_TRIM[im.dataset.logo] = im.dataset.logo; return; }
    const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
    o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
    LOGO_TRIM[im.dataset.logo] = o.toDataURL('image/png');
    document.querySelectorAll('img[data-logo]').forEach(n => { if (n.dataset.logo === im.dataset.logo) n.src = LOGO_TRIM[im.dataset.logo]; });
  } catch { LOGO_TRIM[im.dataset.logo] = im.dataset.logo; }
}, true);

/* ---------- Meta ad covers ---------- */
async function loadCovers(proof) {
  const ids = [...new Set((proof || []).filter(p => p.kind === 'meta' && !p.thumb).map(p => p.ad_id))].filter(id => !document.querySelector(`[data-cover="${CSS.escape(id)}"] img`));
  if (!ids.length) return;
  try {
    // A preview page is not live, so the slug does not authorise its ads yet: use the staff session.
    const q = encodeURIComponent(ids.slice(0, 80).join(','));
    const r = await (D.preview
      ? fetch(`${API}/api/ad-creatives?ads=${q}`, authed())
      : fetch(`${API}/api/ad-creatives?angles=${encodeURIComponent(SLUG)}&ads=${q}`)).then(x => x.json());
    for (const [id, v] of Object.entries(r.assets || {})) {
      // The auto board's ads with no idea of their own take the first line of their copy (the hook) as the caption; the headline is usually an offer.
      const line = String(v.body || v.headline || '').split(/\n|(?<=[.!?])\s/)[0].trim().slice(0, 90);
      if (line) document.querySelectorAll(`[data-cap-ad="${CSS.escape(id)}"]`).forEach(c => { c.textContent = line; });
      if (!v.thumb) continue;
      document.querySelectorAll(`[data-cover="${CSS.escape(id)}"]`).forEach(m => { if (!m.querySelector('img')) m.insertAdjacentHTML('afterbegin', `<img src="${esc(v.thumb)}" alt="" loading="lazy">`); });
    }
  } catch { /* the placeholder stays */ }
}

/* ---------- boot ---------- */
async function boot() {
  if (!SLUG) { app.innerHTML = `<div class="center"><div><h1>Creator videos</h1><p class="sub">This link is missing the brand. Check the link you were sent.</p></div></div>`; return; }
  app.innerHTML = `<div class="wrap" style="padding-top:64px;display:grid;gap:14px;max-width:720px"><div class="skel" style="height:44px;width:70%"></div><div class="skel"></div><div class="skel" style="height:260px;margin-top:20px"></div></div>`;
  try {
    const res = await fetch(`${API}/api/angles/${encodeURIComponent(SLUG)}`, authed());
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'This page could not be loaded.');
    applyAccent(j.brand?.accent);
    if (!j.live) {
      app.innerHTML = `<div class="center"><div><h1>${esc(j.brand?.display_name || '')} creators</h1><p class="sub">This page is being set up. Check back soon.</p></div></div>`;
      return;
    }
    D = j;
    TILES = buildTiles();
    render();
    // Old links (#rules from the PDF and Slack) land on the checklist.
    if (/^#(rules|checklist)/.test(location.hash)) setTimeout(() => document.getElementById('checklist')?.scrollIntoView(), 50);
  } catch (e) {
    app.innerHTML = `<div class="center"><div><h1>Page not found</h1><p class="sub">${esc(e.message)}</p></div></div>`;
  }
}
boot();
})();
