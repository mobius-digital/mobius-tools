/* The creator link (Ambassadors). One brand's living brief, read by creators.
 * Data: GET {API}/api/angles/<slug>. No sign-in, no money on the page.
 * Built by angles/build.py, which inlines the Lucide icons into app.js.
 *
 * The look is the Lucky Golf creator hub's: lanes per section, pill rows for
 * sections and formats, flat cards with a quoted opener, black primary buttons.
 * Phone first: the pill rows scroll sideways, cards stack, and one submit
 * button sits in a bottom bar under the thumb.
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
const ICONS = __ICONS__;
const ic = (n, s = 16, st = '') => `<svg class="i" viewBox="0 0 24 24" style="width:${s}px;height:${s}px;${st}" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const svgI = (svg, s = 16) => `<svg class="i" viewBox="0 0 24 24" style="width:${s}px;height:${s}px" aria-hidden="true">${svg || ICONS.sparkles}</svg>`;
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
const F = { sec: 'all', fmt: 'all' };

function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}
async function copy(text) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }

/* ---------- colour ---------- */
function hexToRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
const mix = (rgb, w, t) => rgb.map((c, i) => Math.round(c * (1 - t) + w[i] * t));
const toHex = rgb => '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('');
function lum(rgb) { const a = rgb.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * a[0] + .7152 * a[1] + .0722 * a[2]; }
function darkenTo(rgb, ratio) { let c = rgb; for (let i = 0; i < 16 && (1.05 / (lum(c) + .05)) < ratio; i++) c = mix(c, [0, 0, 0], .08); return c; }
function applyAccent(hex) {
  const rgb = hexToRgb(hex); if (!rgb) return;
  const r = document.documentElement.style;
  r.setProperty('--acc', toHex(rgb));
  r.setProperty('--acc-ink', toHex(darkenTo(rgb, 5)));
  r.setProperty('--acc-soft', `rgba(${rgb.join(',')},.12)`);
  r.setProperty('--acc-line', `rgba(${rgb.join(',')},.45)`);
  r.setProperty('--glow', `rgba(${rgb.join(',')},.14)`);
}
/** One section colour becomes a tag, a badge and a lane edge. */
const toneVars = hex => {
  const rgb = hexToRgb(hex) || [95, 100, 114];
  return `--t:${toHex(rgb)};--t-ink:${toHex(darkenTo(rgb, 5))};--t-soft:rgba(${rgb.join(',')},.17);--t-soft2:rgba(${rgb.join(',')},.05);--t-line:rgba(${rgb.join(',')},.32)`;
};

/* ---------- data ---------- */
const lanes = () => [D.hot, ...D.sections].filter(s => s && s.angles.length);
const uniq = () => { const seen = new Set(); return lanes().flatMap(s => s.angles).filter(a => !seen.has(a.id) && seen.add(a.id)); };
const findAngle = id => uniq().find(a => a.id === id);
const sectionOf = a => D.sections.find(s => s.id === a.section_id);
/* `products` is free text the team types, so the card has to tidy it:
   "Muni belts (The Last Loop, Beach Club, ...)"        -> "Muni belts"
   "Koozies, ball markers, divot tools, towels"         -> "Koozies +3"
   The angle's own page still shows the full string, untouched. */
function shortProd(p) {
  const t = String(p || '').split('(')[0].trim().replace(/[,;]\s*$/, '');
  if (t.length <= 20) return t;
  // A list, however it was punctuated: "a, b and c" / "a or b" / "a + b" -> "a +2".
  const parts = t.split(/\s*[,+]\s*|\s+and\s+|\s+or\s+/i).map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return t;
  // "Fall drops: Brown Chunkman, Espresso Martini, ..." -> "Fall drops +3":
  // when the list already carries its own label, that label IS the short name.
  const head = parts[0].includes(':') ? parts[0].split(':')[0].trim() : parts[0];
  return `${head} +${parts.length - 1}`;
}
/* The value the team put on MOST of this brand's angles is its default - "Any
   Dartee belt", "Party Patch", "Grunk Dolfer polos" - which is another way of
   saying "our product". On every card it is noise, so only the ones that name
   something specific get a chip. */
/* "The Muni" the group and "Muni belts" the product are the same fact twice.
   Compare them stripped down to letters and drop the chip if either swallows
   the other, so a product chip only ever ADDS something. */
const bare = t => String(t || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
function sameThing(p, name) {
  const a = bare(p), b = bare(name);
  return !!a && !!b && (a.includes(b) || b.includes(a));
}
/* Words the team types when the answer is "no particular product". They are
   not products, so they never become a chip. */
const VAGUE = new Set(['everything', 'all', 'any', 'anything', 'allproducts', 'various', 'na', 'none']);
let _defProd = null;
function defaultProd() {
  if (_defProd === null) {
    const c = {};
    for (const a of uniq()) { const p = shortProd(a.products); if (p) c[p] = (c[p] || 0) + 1; }
    _defProd = Object.entries(c).sort((x, y) => y[1] - x[1])[0]?.[0] || '';
  }
  return _defProd;
}
const fmtViews = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n);
const platformOf = u => /tiktok/i.test(u) ? 'TikTok' : /instagram/i.test(u) ? 'Instagram' : /facebook|fb\.watch/i.test(u) ? 'Facebook' : /youtu/i.test(u) ? 'YouTube' : 'the web';
const plat = () => D.brand.submit_platform || 'TRYBE';
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmtDay = ymd => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtMon = ymd => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

/* ---------- submit ---------- */
function filmBtn(a, cls) {
  const b = D.brand;
  if (!b.submit_url) return `<span class="btn ${cls} is-off" aria-disabled="true">Submit on ${esc(plat())}</span>`;
  const label = a ? (b.submit_label || `Film this on ${plat()}`) : `Open our ${plat()} campaign`;
  return `<a class="btn ${cls}" href="${esc(b.submit_url)}" target="_blank" rel="noopener" data-film="${esc(a ? a.title : '')}">${esc(label)}${ic('arrow-right', 15)}</a>`;
}
function wireFilm() {
  app.querySelectorAll('[data-film]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    const t = el.dataset.film;
    if (t) copy(`Angle: ${t}`).then(ok => ok && toast('Angle name copied. Paste it in your submission note.'));
  }));
}

/* ---------- top bar + footer ---------- */
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

function topbar() {
  const b = D.brand;
  // Stored in UTC ("2026-09-17 01:10"); shown in the viewer's own time zone.
  const upd = b.updated_at ? `Updated ${new Date(b.updated_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '';
  const pv = D.preview ? `<div class="pv-bar" role="status"><div class="wrap"><b>Preview.</b> This link is switched off, so creators see "being set up". Only signed-in Mobius staff can see this page.</div></div>` : '';
  return `${pv}<header class="topbar"><div class="wrap">
    <a class="brand" href="#" data-home aria-label="${esc(b.display_name)} creator angles">
      ${b.logo_url ? `<img src="${esc(LOGO_TRIM[b.logo_url] || b.logo_url)}" alt="${esc(b.display_name)}" crossorigin="anonymous" data-logo="${esc(b.logo_url)}">` : `<span class="nm">${esc(b.display_name)}</span>`}
      <span class="lbl">Creators</span>
    </a>
    <div class="tb-r">${upd ? `<span class="upd"><i></i>${upd}</span>` : ''}${b.submit_url ? filmBtn(null, 'btn-hero tb-film') : ''}</div>
  </div></header>`;
}
const footer = () => `<footer><div class="wrap"><span>Questions about an angle? Message ${esc(D.brand.display_name)} on ${esc(plat())}.</span><span>Powered by Mobius Digital</span></div></footer>`;

/* ---------- season ---------- */
function seasonCard() {
  const se = D.brand.season;
  if (!se || !se.title) return '';
  const ch = D.season_chart;
  const color = se.color || '#7C3AED';
  let chart = '';
  if (ch && se.show_chart !== false) {
    const n = ch.weeks.length;
    const xs = ch.weeks.map(w => w.x).filter(x => x != null);
    const peak = Math.max(...xs);
    const peakWeek = ch.weeks.find(w => w.x === peak);
    const drawn = !!ch.custom;
    const top = drawn ? 4 : Math.max(se.cap ? Math.min(se.cap, peak) : peak, 1.2);
    const [h0, h1] = (se.highlight || []).map(x => (x || '').trim());
    const inHi = w => { if (!h0 || !h1) return false; const d = w.week_of.slice(5), e = addDays(w.week_of, 6).slice(5); return h0 <= h1 ? (e >= h0 && d <= h1) : (e >= h0 || d <= h1); };
    const now = ch.now_index ?? 0;
    const W = n * 10, H = 132, base = 132;
    let bars = '', hits = '', ticks = '', lastM = '', lastTick = -99;
    ch.weeks.forEach((w, i) => {
      const x = i * 10;
      const clipped = w.x != null && w.x > top;
      const h = w.x == null ? 3 : Math.max(3, (Math.min(w.x, top) / top) * (base - 24));
      const busy = drawn && w.level >= 55;
      const fill = w.x == null ? '#E6E9EE' : inHi(w) ? color : busy ? color : '#CBD2DC';
      const alpha = drawn && !inHi(w) && busy ? ' fill-opacity=".5"' : '';
      bars += `<rect x="${x + 1.5}" y="${base - h}" width="7" height="${h}" rx="1.5" fill="${fill}"${alpha}/>`;
      if (clipped) bars += `<rect x="${x + 1.5}" y="${base - h}" width="7" height="3" rx="1" fill="#0a0b0d" opacity=".5"/>`;
      hits += `<rect class="hit" x="${x}" y="0" width="10" height="${base}" data-w="${i}"/>`;
      const m = fmtMon(w.week_of);
      if (m !== lastM) { if (i - lastTick >= (isPhone() ? 7 : 3)) { ticks += `<span style="left:${(i / n) * 100}%">${m}</span>`; lastTick = i; } lastM = m; }
    });
    const nx = now * 10 + 5;
    const nowMark = `<line x1="${nx}" y1="20" x2="${nx}" y2="${base}" stroke="#0a0b0d" stroke-width="1.4" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>`;
    chart = `<div class="chart" data-chart>
      <div class="chart-h"><p class="lbl">${drawn ? 'When to film' : 'Last year, week by week'}</p>
        <div class="legend">${h0 ? `<span><i style="background:${esc(color)}"></i>${esc(se.title)}</span>` : ''}${drawn ? `<span><i style="background:${esc(color)};opacity:.5"></i>Busy weeks</span>` : ''}<span><i></i>${drawn ? 'Quieter' : 'Other weeks'}</span></div></div>
      <div class="svgbox">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Last year's sales week by week, with ${esc(se.title)} highlighted and this week marked.">${bars}${nowMark}${hits}</svg>
        <span class="nowpill" style="left:${(nx / W) * 100}%">This week</span>
        <div class="tip" data-tip></div>
      </div>
      <div class="ticks">${ticks}</div>
      <p class="chart-note">${drawn
        ? `Peak: <b>week of ${peakWeek ? fmtDay(peakWeek.week_of) : ''}</b>. Film two to three weeks before a spike so your video is live in time. <span class="muted">Tap a bar for any week.</span>`
        : `Busiest week last year: <b>${peakWeek ? fmtDay(peakWeek.week_of) : ''}</b>, ${peak.toFixed(1)}x a normal week.${se.cap && peak > top ? ' Tall spikes are trimmed.' : ''} <span class="muted">Tap a bar for any week.</span>`}</p>
    </div>`;
  }
  return `<section class="card season">
    <div class="season-top">
      <span class="tag" style="${toneVars(color)}">${ic('calendar-days', 13)}${esc(se.title)}${se.until ? ` · until ${esc(se.until)}` : ''}</span>
      <span class="from">From the team</span>
    </div>
    ${se.line ? `<p class="season-line">${esc(se.line)}</p>` : ''}
    ${chart}
    ${se.next ? `<p class="next">${ic('arrow-right', 14)}Next up: ${esc(se.next)}</p>` : ''}
  </section>`;
}
function wireChart() {
  const c = app.querySelector('[data-chart]');
  if (!c) return;
  const tip = c.querySelector('[data-tip]');
  const box = c.querySelector('.svgbox');
  const weeks = D.season_chart.weeks;
  const now = D.season_chart.now_index ?? 0;
  const show = (i, el) => {
    const w = weeks[i];
    const vs = D.season_chart.custom ? (w.level >= 80 ? 'Peak week, film for this' : w.level >= 55 ? 'Busy week' : w.level >= 30 ? 'Normal week' : 'Quiet week') : w.x == null ? 'No sales data' : w.x >= 1.05 ? `${w.x.toFixed(1)}x a normal week` : w.x <= .95 ? `${w.x.toFixed(1)}x, a quieter week` : 'About a normal week';
    tip.innerHTML = `<b>${i === now ? 'This week' : 'Week of ' + fmtDay(w.week_of)}</b><span>${esc(vs)}</span>`;
    const br = box.getBoundingClientRect(), r = el.getBoundingClientRect();
    tip.style.left = Math.min(Math.max(r.left + r.width / 2 - br.left, 70), br.width - 70) + 'px';
    tip.classList.add('on');
    c.querySelectorAll('.hit.sel').forEach(x => x.classList.remove('sel'));
    el.classList.add('sel');
  };
  c.querySelectorAll('.hit').forEach(h => {
    h.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') show(+h.dataset.w, h); });
    h.addEventListener('click', () => show(+h.dataset.w, h));
  });
  box.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { tip.classList.remove('on'); c.querySelectorAll('.hit.sel').forEach(x => x.classList.remove('sel')); } });
}

/* ---------- stop list, rules, about ---------- */
function avoidCard() {
  const av = D.brand.avoid || [];
  if (!av.length) return '';
  return `<section class="card avoid">
    <div class="lane-h"><div class="lane-t"><span class="badge warn">${ic('ban', 16)}</span><h2 class="disp">Please stop filming these</h2></div><span class="lane-s">We have plenty. They will not be picked for ads.</span></div>
    <ul>${av.map(x => `<li>${ic('x', 15)}<div><b>${esc(x.title)}</b>${x.why ? `<span>${esc(x.why)}</span>` : ''}</div></li>`).join('')}</ul>
  </section>`;
}
function rulesCard() {
  const r = D.brand.rules || [];
  if (!r.length) return '';
  return `<section class="card rules"><p class="lbl">Say it right</p><ul>${r.map(x => `<li>${ic('check', 15)}<span>${esc(x)}</span></li>`).join('')}</ul></section>`;
}
function aboutCard() {
  const b = D.brand;
  if (!b.about && !b.audience) return '';
  return `<section class="card about">
    ${b.about ? `<div><p class="lbl">What it is</p><p>${esc(b.about)}</p></div>` : ''}
    ${b.audience ? `<div><p class="lbl">Who we are talking to</p><p>${esc(b.audience)}</p></div>` : ''}
  </section>`;
}

/* ---------- list ---------- */
function card(a, lane) {
  /* The colour chip is ALWAYS the angle's own group, never the lane it is being
     shown in: inside Hot right now the lane header already says Hot, so
     repeating it there costs a chip and tells the creator nothing. */
  const own = sectionOf(a) || (lane && !lane.pinned ? lane : null);
  const p = shortProd(a.products);
  const chips = [
    own ? `<span class="tag" style="${toneVars(own.color)}">${svgI(own.icon_svg, 12)}${esc(own.name)}</span>` : '',
    a.format ? `<button class="tag tag-chip tap" data-fmt="${esc(a.format)}" title="Show only ${esc(a.format)}">${esc(a.format)}</button>` : '',
    p && p !== defaultProd() && !VAGUE.has(bare(p)) && !(own && sameThing(p, own.name))
      ? `<span class="tag tag-chip" title="${esc(a.products)}">${esc(p)}</span>` : '',
  ].filter(Boolean).join('');
  const n = a.proof.length;
  const score = [
    n ? `<span><b>${n}</b> example${n === 1 ? '' : 's'}</span>` : `<span class="fresh">${ic('sparkles', 13)}New idea, be the first</span>`,
    a.ads ? `<span><b>${a.ads}</b> ran as ads</span>` : '',
  ].join('');
  return `<article class="card ang" data-open="${esc(a.id)}">
    <div class="ang-top">${chips}</div>
    <a class="disp ang-title" href="#a=${esc(a.id)}">${esc(a.title)}</a>
    ${a.openers?.[0] ? `<p class="hook">&ldquo;${esc(a.openers[0])}&rdquo;</p>` : ''}
    ${a.argument ? `<p class="ang-line">${esc(a.argument)}</p>` : ''}
    <div class="score">${score}</div>
    <div class="ang-foot"><a class="open" href="#a=${esc(a.id)}">Open</a>${filmBtn(a, 'btn-line btn-sm')}</div>
  </article>`;
}

function lane(s) {
  const list = s.angles.filter(a => F.fmt === 'all' || a.format === F.fmt);
  if (!list.length) return '';
  const cut = isPhone() ? 3 : 6;
  const extra = list.length > cut ? list.length - cut : 0;
  return `<section class="lane ${s.pinned ? 'lane-hot' : ''}" id="s-${esc(s.id)}" style="${toneVars(s.color)}">
    <div class="lane-h">
      <div class="lane-t"><span class="badge">${svgI(s.icon_svg, 16)}</span><h2 class="disp">${esc(s.name)}</h2><span class="num">${list.length}</span></div>
      ${s.line ? `<span class="lane-s">${esc(s.line)}</span>` : ''}
    </div>
    <div class="grid">${list.map((a, i) => i >= cut ? card(a, s).replace('<article class="card ang"', '<article hidden class="card ang"') : card(a, s)).join('')}</div>
    ${extra ? `<button class="btn btn-line btn-full more" data-more>${extra} more ${ic('chevron-down', 15)}</button>` : ''}
  </section>`;
}

function filters() {
  const ls = lanes();
  const fmts = [...new Set(uniq().map(a => a.format).filter(Boolean))];
  const secPills = `<button class="pill ${F.sec === 'all' ? 'on' : ''}" data-sec="all">All angles</button>` + ls.map(s => `<button class="pill ${F.sec === s.id ? 'on' : ''}" data-sec="${esc(s.id)}" style="${toneVars(s.color)}"><i class="dot"></i>${esc(s.name)}</button>`).join('');
  const fmtPills = `<button class="pill ${F.fmt === 'all' ? 'on' : ''}" data-fmt="all">Any format</button>` + fmts.map(f => `<button class="pill ${F.fmt === f ? 'on' : ''}" data-fmt="${esc(f)}">${esc(f)}</button>`).join('');
  return `<div class="filters"><div class="wrap">
    <div class="frow"><span class="flbl">Section</span><div class="prow" role="group" aria-label="Sections">${secPills}</div></div>
    ${fmts.length > 1 ? `<div class="frow"><span class="flbl">Format</span><div class="prow" role="group" aria-label="Formats">${fmtPills}</div></div>` : ''}
  </div></div>`;
}

function renderList() {
  const b = D.brand;
  document.title = `${b.display_name} · What to film`;
  const shown = lanes().filter(s => F.sec === 'all' || s.id === F.sec);
  const body = shown.map(lane).join('');
  app.innerHTML = `${topbar()}
  <main>
    <div class="wrap">
      <div class="page-h">
        <p class="lbl acc">${esc(b.display_name)} · creator angles</p>
        <h1 class="disp">Pick one. Film it. Submit it.</h1>
        <p class="intro">${esc(b.intro || 'Every angle here is what we want filmed right now. Steal the opener word for word or bend it.')}</p>
      </div>
      <div class="top-grid">
        ${seasonCard()}
        ${aboutCard()}
      </div>
      ${avoidCard()}
      ${rulesCard()}
    </div>
    ${filters()}
    <div class="wrap lanes">
      ${body || `<div class="card empty">Nothing matches. <button class="btn btn-line btn-sm" data-reset>Show everything</button></div>`}
    </div>
  </main>
  <div class="dock">${filmBtn(null, 'btn-hero btn-full')}</div>
  ${footer()}`;

  app.querySelectorAll('[data-sec]').forEach(p => p.onclick = () => { F.sec = p.dataset.sec; rerender(); });
  app.querySelectorAll('[data-fmt]').forEach(p => p.onclick = () => { F.fmt = F.fmt === p.dataset.fmt ? 'all' : p.dataset.fmt; rerender(); });
  app.querySelector('[data-reset]')?.addEventListener('click', () => { F.sec = 'all'; F.fmt = 'all'; rerender(); });
  app.querySelectorAll('[data-more]').forEach(btn => btn.onclick = () => { btn.closest('.lane').querySelectorAll('[hidden]').forEach(x => x.hidden = false); btn.remove(); });
  app.querySelectorAll('[data-open]').forEach(c => c.addEventListener('click', e => { if (!e.target.closest('a,button')) location.hash = 'a=' + c.dataset.open; }));
  app.querySelector('[data-home]').onclick = e => { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); };
  wireFilm();
  wireChart();
}
/* Re-render in place: the filter bar stays where the thumb is. */
function rerender() {
  const bar = app.querySelector('.filters');
  const before = bar ? bar.getBoundingClientRect().top : 0;
  const rows = [...app.querySelectorAll('.prow')].map(r => r.scrollLeft);
  renderList();
  const nb = app.querySelector('.filters');
  if (nb) scrollTo(0, scrollY + nb.getBoundingClientRect().top - before);
  app.querySelectorAll('.prow').forEach((r, i) => { r.scrollLeft = rows[i] || 0; });
}

/* ---------- one angle ---------- */
function proofItem(p) {
  const kinds = {
    meta: ['green', 'Ran as an ad'],
    post: ['chip', `Creator post · ${p.url ? platformOf(p.url) : ''}`],
    typed: ['acc', 'Example · views typed by us'],
    upload: ['chip', 'Clip from the team'],
    inspo: ['chip', 'Inspiration · another brand'],
  };
  const [tone, label] = kinds[p.kind] || ['chip', 'Example'];
  const headline = p.kind === 'meta' ? (p.who || D.brand.display_name) : p.kind === 'inspo' ? 'Steal the shape, not the brand' : p.views ? `${fmtViews(p.views)} views` : (p.who || 'Example');
  const sub = [p.kind === 'inspo' || p.views ? p.who : '', p.note].filter(Boolean).join(' · ');
  const out = p.kind === 'post' || p.kind === 'typed' || p.kind === 'inspo';
  const media = `<span class="well" ${p.kind === 'meta' ? `data-cover="${esc(p.ad_id)}"` : ''}>${p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy">` : ''}<span class="pbtn">${ic(out ? 'external-link' : 'play', 16)}</span></span>`;
  const inner = `${media}<span class="pt">
      <span class="tag tag-${tone}">${esc(label)}</span>
      <span class="pt-h">${esc(headline)}</span>
      ${sub ? `<span class="pt-s">${esc(sub)}</span>` : ''}
    </span>`;
  const attrs = p.kind === 'meta' ? `data-play-ad="${esc(p.ad_id)}"` : p.kind === 'upload' ? `data-play-file="${esc(p.file)}"` : '';
  return out
    ? `<a class="proof-i" href="${esc(p.url)}" target="_blank" rel="noopener">${inner}</a>`
    : `<button class="proof-i" ${attrs}>${inner}</button>`;
}

function renderAngle(id) {
  const a = findAngle(id);
  if (!a) { history.replaceState(null, '', location.pathname + location.search); return renderList(); }
  const s = sectionOf(a);
  const list = uniq();
  const i = list.indexOf(a);
  const next = list[(i + 1) % list.length];
  const prev = list[(i - 1 + list.length) % list.length];
  document.title = `${a.title} · ${D.brand.display_name}`;
  const n = a.proof.length;
  const stats = `<div class="money">
    <div><p class="big">${n}</p><p class="cap">example${n === 1 ? '' : 's'}</p></div>
    <div><p class="big">${a.ads}</p><p class="cap">ran as ads</p></div>
    <div><p class="big sm">${esc(a.format || 'Any')}</p><p class="cap">format</p></div>
  </div>`;
  const film = `<div class="card filmcard">
      ${filmBtn(a, 'btn-hero btn-full')}
      <p>${D.brand.submit_url ? `Opens the ${esc(D.brand.display_name)} campaign on ${esc(plat())} and copies the angle name for your submission note.` : `Submit on ${esc(plat())} like always, with the angle name in your note.`}</p>
    </div>`;
  app.innerHTML = `${topbar()}
  <main class="detail">
    <div class="wrap det">
      <div class="det-main" style="${s ? toneVars(s.color) : ''}">
        <a class="back" href="#" data-back>${ic('arrow-left', 15)}What to film</a>
        <div class="tags">
          ${a.hot && D.hot ? `<span class="tag" style="${toneVars(D.hot.color)}">${svgI(D.hot.icon_svg, 12)}${esc(D.hot.name)}</span>` : ''}
          ${s ? `<span class="tag" style="${toneVars(s.color)}">${svgI(s.icon_svg, 12)}${esc(s.name)}</span>` : ''}
          ${a.format ? `<span class="tag tag-chip">${esc(a.format)}</span>` : ''}
          ${a.products ? `<span class="tag tag-chip">${esc(a.products)}</span>` : ''}
        </div>
        <h1 class="disp">${esc(a.title)}</h1>
        ${a.openers?.[0] ? `<p class="hook lead">&ldquo;${esc(a.openers[0])}&rdquo;</p>` : ''}
        <div class="only-narrow">${stats}${film}</div>
        ${a.argument ? `<p class="para"><b>The idea.</b> ${esc(a.argument)}</p>` : ''}
        ${a.who ? `<p class="para"><b>Who it is for.</b> ${esc(a.who)}</p>` : ''}
        ${a.trend ? `<p class="para"><b>Trend to ride.</b> ${esc(a.trend)}</p>` : ''}

        ${(a.openers || []).length ? `<h2 class="disp sec-t">Openers you can steal</h2><p class="sec-s">The first line decides everything. Word for word or bend them, they are yours.</p>
        <ul class="openers">${a.openers.map((o, k) => `<li class="card"><span class="hook">&ldquo;${esc(o)}&rdquo;</span><button class="iconbtn" data-copy="${k}" aria-label="Copy this opener">${ic('copy', 16)}</button></li>`).join('')}</ul>` : ''}

        ${(a.shots || []).length ? `<h2 class="disp sec-t">What to film</h2>
        <div class="shots">${a.shots.map(x => `<div class="card"><p class="lbl">${esc(x.label)}</p><p>${esc(x.text)}</p></div>`).join('')}</div>` : ''}
        ${a.on_screen ? `<div class="card overlay"><div><p class="lbl">Text on screen</p><p>${esc(a.on_screen)}</p></div><button class="iconbtn" data-copytext aria-label="Copy the text">${ic('copy', 16)}</button></div>` : ''}

        <h2 class="disp sec-t">Proof it works</h2><p class="sec-s">Videos made on this angle. The label on each one says where it came from.</p>
        ${n ? `<div class="proof">${a.proof.map(proofItem).join('')}</div>`
            : `<div class="card empty-proof">${ic('sparkles', 18)}<div><b>No video on this one yet.</b><p>It is a fresh idea. Follow the openers and the shot plan and yours could be the example everyone sees here.</p></div></div>`}

        ${(a.do_text || a.dont_text) ? `<div class="dd">
          ${a.do_text ? `<div class="card do"><p class="lbl">Do</p><p>${esc(a.do_text)}</p></div>` : ''}
          ${a.dont_text ? `<div class="card dont"><p class="lbl">Don't</p><p>${esc(a.dont_text)}</p></div>` : ''}
        </div>` : ''}

        <div class="pn">
          <a class="card pn-a" href="#a=${esc(prev.id)}">${ic('arrow-left', 16)}<span><span class="lbl">Previous</span><b>${esc(prev.title)}</b></span></a>
          <a class="card pn-a r" href="#a=${esc(next.id)}"><span><span class="lbl">Next angle</span><b>${esc(next.title)}</b></span>${ic('arrow-right', 16)}</a>
        </div>
      </div>
      <aside class="det-side">
        <div class="side-stats"><p class="lbl">This angle so far</p>${stats}</div>
        ${film}
        <a class="card pn-a" href="#a=${esc(next.id)}"><span><span class="lbl">Next angle</span><b>${esc(next.title)}</b></span>${ic('chevron-right', 16)}</a>
      </aside>
    </div>
  </main>
  <div class="dock">${filmBtn(a, 'btn-hero btn-full')}<a class="btn btn-line dock-next" href="#a=${esc(next.id)}" aria-label="Next angle">${ic('arrow-right', 18)}</a></div>
  ${footer()}`;

  app.querySelectorAll('[data-copy]').forEach(el => el.onclick = async () => {
    if (await copy(a.openers[+el.dataset.copy])) { toast('Opener copied'); el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 1400); }
  });
  app.querySelector('[data-copytext]')?.addEventListener('click', async () => { if (await copy(a.on_screen)) toast('Text copied'); });
  const toList = e => { e.preventDefault(); history.pushState(null, '', location.pathname + location.search); route(); };
  app.querySelector('[data-back]').onclick = toList;
  app.querySelector('[data-home]').onclick = toList;
  app.querySelectorAll('[data-play-ad]').forEach(el => el.onclick = () => playAd(el.dataset.playAd));
  app.querySelectorAll('[data-play-file]').forEach(el => el.onclick = () => playFile(API + el.dataset.playFile));
  wireFilm();
  loadCovers(a);
  swipe(app.querySelector('.det-main'), prev.id, next.id);
  scrollTo(0, 0);
}

function swipe(el, prevId, nextId) {
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

async function loadCovers(a) {
  const ids = a.proof.filter(p => p.kind === 'meta' && !p.thumb).map(p => p.ad_id);
  if (!ids.length) return;
  try {
    // A preview page is not live, so the slug does not authorise its ads yet: use the staff session.
    const r = await (D.preview
      ? fetch(`${API}/api/ad-creatives?ads=${encodeURIComponent(ids.join(','))}`, authed())
      : fetch(`${API}/api/ad-creatives?angles=${encodeURIComponent(SLUG)}&ads=${encodeURIComponent(ids.join(','))}`)).then(x => x.json());
    for (const [id, v] of Object.entries(r.assets || {})) {
      if (!v.thumb) continue;
      document.querySelectorAll(`[data-cover="${CSS.escape(id)}"]`).forEach(m => { if (!m.querySelector('img')) m.insertAdjacentHTML('afterbegin', `<img src="${esc(v.thumb)}" alt="" loading="lazy">`); });
    }
  } catch { /* the placeholder stays */ }
}

function player(inner) {
  const w = document.createElement('div');
  w.className = 'player-wrap';
  w.innerHTML = `<div class="player" role="dialog" aria-modal="true" aria-label="Video">${inner}<button class="btn btn-line btn-full" data-close>Close</button></div>`;
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
  const w = player(`<div class="loading">Loading the ad…</div>`);
  try {
    const res = D.preview
      ? await fetch(`${API}/api/ad-video?ad=${encodeURIComponent(adId)}`, authed())
      : await fetch(`${API}/api/ad-video?ad=${encodeURIComponent(adId)}&angles=${encodeURIComponent(SLUG)}`);
    const v = await res.json();
    if (!res.ok) throw new Error(v.error || 'This ad cannot be played right now.');
    const box = w.querySelector('.loading');
    if (v.src) box.outerHTML = `<video src="${esc(v.src)}" controls autoplay playsinline></video>`;
    else if (v.preview) box.outerHTML = `<iframe class="frame" src="${esc(v.preview)}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen title="The ad, as Meta shows it"></iframe>`;
    else throw new Error('This ad has no video to play.');
    w.querySelector('video')?.play().catch(() => {});
  } catch (e) { const box = w.querySelector('.loading'); if (box) box.textContent = e.message; }
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
  if (m) renderAngle(m[1]);
  else { renderList(); if (LIST_Y) { scrollTo(0, LIST_Y); LIST_Y = 0; } }
}
addEventListener('hashchange', route);
addEventListener('popstate', route);
document.addEventListener('click', e => { if (e.target.closest('a[href^="#a="]') && !location.hash.startsWith('#a=')) LIST_Y = scrollY; }, true);
let wasPhone = null;
addEventListener('resize', () => {
  const p = isPhone();
  if (wasPhone !== null && p !== wasPhone && D && !location.hash.startsWith('#a=')) rerender();
  wasPhone = p;
});

async function boot() {
  wasPhone = isPhone();
  if (!SLUG) { app.innerHTML = `<div class="center"><div><h1 class="disp">Creator angles</h1><p class="muted">This link is missing the brand. Check the link you were sent.</p></div></div>`; return; }
  app.innerHTML = `<div class="wrap" style="padding-top:56px;display:flex;flex-direction:column;gap:14px;max-width:720px"><div class="skel" style="height:40px;width:70%"></div><div class="skel"></div><div class="skel" style="width:85%"></div><div class="skel" style="height:180px;margin-top:20px"></div></div>`;
  try {
    const res = await fetch(`${API}/api/angles/${encodeURIComponent(SLUG)}`, authed());
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'This page could not be loaded.');
    if (!j.live) {
      applyAccent(j.brand?.accent);
      app.innerHTML = `<div class="center"><div><h1 class="disp">${esc(j.brand?.display_name || '')} creator angles</h1><p class="muted">This page is being set up. Check back soon.</p></div></div>`;
      return;
    }
    D = j;
    if (D.hot) D.hot.pinned = true;
    applyAccent(j.brand.accent);
    route();
  } catch (e) {
    app.innerHTML = `<div class="center"><div><h1 class="disp">Page not found</h1><p class="muted">${esc(e.message)}</p></div></div>`;
  }
}
boot();
})();
