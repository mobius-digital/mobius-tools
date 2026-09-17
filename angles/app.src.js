/* The creator link (Ambassadors). One brand's living brief, read by creators.
 * Data: GET {API}/api/angles/<slug>. No sign-in, no money on the page.
 * Built by angles/build.py, which inlines the Lucide icons into app.js. */
(function () {
'use strict';
const API = 'https://mobius-profit.mobius-digital.workers.dev';
const ICONS = __ICONS__;
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);
const app = $('#app');

function slugFromUrl() {
  const q = new URLSearchParams(location.search).get('b');
  if (q) return q.toLowerCase();
  const m = location.pathname.match(/\/angles\/([a-z0-9-]+)\/?$/i);
  return m ? m[1].toLowerCase() : '';
}
const SLUG = slugFromUrl();
let D = null;
let FILTER = { fmt: 'all' };

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/* ---------- colour ---------- */
function hexToRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mix(rgb, w, t) { return rgb.map((c, i) => Math.round(c * (1 - t) + w[i] * t)); }
const toHex = rgb => '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('');
function lum(rgb) { const a = rgb.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * a[0] + .7152 * a[1] + .0722 * a[2]; }
function applyAccent(hex) {
  let rgb = hexToRgb(hex); if (!rgb) return;
  // White text must read on the button: darken until it does (4.5:1).
  let btn = rgb; for (let i = 0; i < 12 && (1.05 / (lum(btn) + .05)) < 4.5; i++) btn = mix(btn, [0, 0, 0], .08);
  let ink = rgb; for (let i = 0; i < 14 && (1.05 / (lum(ink) + .05)) < 5.5; i++) ink = mix(ink, [0, 0, 0], .08);
  const r = document.documentElement.style;
  r.setProperty('--acc', toHex(btn));
  r.setProperty('--acc-ink', toHex(ink));
  r.setProperty('--acc-soft', toHex(mix(rgb, [255, 255, 255], .88)));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', toHex(btn));
}
const tint = hex => { const rgb = hexToRgb(hex) || [71, 85, 105]; let ink = rgb; for (let i = 0; i < 14 && (1.05 / (lum(ink) + .05)) < 5; i++) ink = mix(ink, [0, 0, 0], .08); return { bg: toHex(mix(rgb, [255, 255, 255], .86)), fg: toHex(ink) }; };
const svgBadge = (svg, color, cls = 'badge') => { const t = tint(color); return `<span class="${cls}" style="background:${t.bg};color:${t.fg}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true">${svg || ICONS.sparkles}</svg></span>`; };

/* ---------- helpers ---------- */
const allAngles = () => [...(D.hot?.angles || []), ...D.sections.flatMap(s => s.angles)];
const uniqAngles = () => { const seen = new Set(); return allAngles().filter(a => !seen.has(a.id) && seen.add(a.id)); };
const findAngle = id => uniqAngles().find(a => a.id === id);
const sectionOf = a => D.sections.find(s => s.id === a.section_id);
const fmtViews = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n);
const platformOf = u => /tiktok/i.test(u) ? 'TikTok' : /instagram/i.test(u) ? 'Instagram' : /facebook|fb\.watch/i.test(u) ? 'Facebook' : /youtu/i.test(u) ? 'YouTube' : 'the web';
const submitLabel = () => D.brand.submit_label || `Film this on ${D.brand.submit_platform || 'TRYBE'}`;

function submitButton(a, cls = 'btn acc') {
  if (!D.brand.submit_url) return `<span class="btn" aria-disabled="true" style="cursor:default">Submit this on ${esc(D.brand.submit_platform || 'TRYBE')}</span>`;
  return `<a class="${cls}" href="${esc(D.brand.submit_url)}" target="_blank" rel="noopener" data-film="${esc(a ? a.title : '')}">${esc(a ? submitLabel() : `Open our ${D.brand.submit_platform || 'TRYBE'} campaign`)} ${ic('external-link')}</a>`;
}
function wireFilm(root = document) {
  root.querySelectorAll('[data-film]').forEach(el => el.addEventListener('click', () => {
    const t = el.dataset.film;
    if (t) copy(`Angle: ${t}`).then(ok => ok && toast('Angle name copied. Paste it in your submission note.'));
  }));
}

/* ---------- list ---------- */
function angleCard(a, sec) {
  const s = sec || sectionOf(a) || D.hot;
  const proven = a.ads > 0;
  const tags = [
    s ? `<span class="chip" style="background:${tint(s.color).bg};color:${tint(s.color).fg}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true">${s.icon_svg || ICONS.sparkles}</svg>${esc(s.name)}</span>` : '',
    a.format ? `<span class="chip">${esc(a.format)}</span>` : '',
    proven ? `<span class="chip proven">${ic('check')}Ran as an ad</span>` : (a.proof.length ? '' : `<span class="chip new">${ic('lightbulb')}New idea</span>`),
  ].join('');
  const opener = (a.openers || [])[0];
  return `<article class="card ang">
    <div class="tags">${tags}</div>
    <h3>${esc(a.title)}</h3>
    ${a.products ? `<p class="stat">${esc(a.products)}</p>` : ''}
    ${opener ? `<p class="hook">&ldquo;${esc(opener)}&rdquo;</p>` : ''}
    ${a.argument ? `<p class="line">${esc(a.argument)}</p>` : ''}
    <div class="foot">
      <span class="stat">${a.proof.length ? `${a.proof.length} example${a.proof.length === 1 ? '' : 's'}` : 'No video yet, be the first'}</span>
      <div class="acts"><a class="btn" href="#a=${esc(a.id)}">Open</a></div>
    </div>
  </article>`;
}

function seasonCard() {
  const se = D.brand.season;
  if (!se || !se.title) return '';
  const ch = D.season_chart;
  let chart = '';
  if (ch && se.show_chart !== false) {
    const xs = ch.weeks.map(w => w.x).filter(x => x != null);
    const max = Math.max(...xs, 1.2);
    const md = s => s ? s.slice(5) : null;           // MM-DD
    const [h0, h1] = (se.highlight || []).map(x => (x || '').trim());
    const inHi = w => { if (!h0 || !h1) return false; const d = md(w.week_of); const e = md(addDays(w.week_of, 6)); return h0 <= h1 ? (e >= h0 && d <= h1) : (e >= h0 || d <= h1); };
    const peak = Math.max(...xs);
    const bars = ch.weeks.map((w, i) => {
      const h = w.x == null ? 6 : Math.max(3, (w.x / max) * 100);
      const cls = ['bar', w.x == null ? 'none' : '', inHi(w) ? 'hi' : '', i === 0 ? 'now' : ''].join(' ');
      const label = w.x == null ? 'no data' : `${w.x.toFixed(1)}x a normal week`;
      return `<div class="${cls}" style="height:${h}%" title="Week of ${fmtDay(w.week_of)}: ${label}"></div>`;
    }).join('');
    chart = `<div class="chart">
      <p class="lbl">Last year, the weeks ahead</p>
      <div class="bars" role="img" aria-label="Last year's sales for the coming weeks, compared with a normal week. The busiest week was ${peak.toFixed(1)} times a normal week.">${bars}</div>
      <div class="axis"><span>${fmtDay(ch.weeks[0].week_of)}</span><span>${fmtDay(ch.weeks[Math.floor(ch.weeks.length / 2)].week_of)}</span><span>${fmtDay(ch.weeks[ch.weeks.length - 1].week_of)}</span></div>
      <p class="chart-note">Busiest week last year: ${peak.toFixed(1)}x a normal week.${h0 ? ' Coloured bars are the season.' : ''}</p>
    </div>`;
  }
  return `<section class="card season" style="${chart ? '' : 'grid-template-columns:1fr'}">
    <div>
      <span class="chip" style="background:var(--acc-soft);color:var(--acc-ink)">${ic('calendar-days')}In season now</span>
      <h2 class="disp">${esc(se.title)}${se.until ? `, until ${esc(se.until)}` : ''}</h2>
      ${se.line ? `<p>${esc(se.line)}</p>` : ''}
      ${se.next ? `<p class="muted" style="font-size:13px">Next up: ${esc(se.next)}</p>` : ''}
    </div>
    ${chart}
  </section>`;
}
function addDays(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function fmtDay(ymd) { return new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }

function avoidCard() {
  const av = D.brand.avoid || [];
  if (!av.length) return '';
  return `<section class="card avoid" id="avoid">
    <h2 class="disp">${ic('ban')}Please stop filming these</h2>
    <p class="muted" style="font-size:14px;margin-top:4px">We have plenty of them. Videos like these will not be picked for ads.</p>
    <ul>${av.map(x => `<li><b>${esc(x.title)}</b>${x.why ? `<span>${esc(x.why)}</span>` : ''}</li>`).join('')}</ul>
  </section>`;
}
function rulesCard() {
  const r = D.brand.rules || [];
  if (!r.length) return '';
  return `<section class="card rules"><p class="lbl">Say it right</p><ul>${r.map(x => `<li>${ic('shield-check')}<span>${esc(x)}</span></li>`).join('')}</ul></section>`;
}

function renderList() {
  const b = D.brand;
  document.title = `${b.display_name} · Creator angles`;
  const fmts = [...new Set(uniqAngles().map(a => a.format).filter(Boolean))];
  const match = a => FILTER.fmt === 'all' || a.format === FILTER.fmt;
  const sec = (s, isHot) => {
    const list = s.angles.filter(match);
    if (!list.length) return '';
    const many = !isHot && list.length > 6;
    return `<section class="sec" id="s-${esc(s.id)}">
      <div class="sec-h">${svgBadge(s.icon_svg, s.color)}<div><h2 class="disp">${esc(s.name)}<small>${list.length}</small></h2>${s.line ? `<p>${esc(s.line)}</p>` : ''}</div></div>
      <div class="grid ${isHot && list.length <= 4 ? 'g2' : ''}" data-grid="${esc(s.id)}">${list.slice(0, many ? 6 : 99).map(a => angleCard(a, isHot ? null : s)).join('')}</div>
      ${many ? `<button class="btn more" data-more="${esc(s.id)}">Show ${list.length - 6} more ${ic('chevron-down')}</button>` : ''}
    </section>`;
  };
  const jump = D.sections.length > 1 ? `<div class="pills" aria-label="Jump to a section">${[D.hot, ...D.sections].filter(Boolean).filter(s => s.angles.length).map(s => `<a class="pill" href="#s-${esc(s.id)}" data-jump="${esc(s.id)}">${esc(s.name)}</a>`).join('')}</div>` : '';
  const fpills = fmts.length > 1 ? `<div class="pills" role="group" aria-label="Filter by format"><button class="pill ${FILTER.fmt === 'all' ? 'on' : ''}" data-fmt="all">Any format</button>${fmts.map(f => `<button class="pill ${FILTER.fmt === f ? 'on' : ''}" data-fmt="${esc(f)}">${esc(f)}</button>`).join('')}</div>` : '';
  const body = [D.hot ? sec(D.hot, true) : '', ...D.sections.map(s => sec(s, false))].join('');
  app.innerHTML = `${header()}
  <main class="wrap">
    <section class="hero">
      <h1 class="serif">What to film for ${esc(b.display_name)}</h1>
      <p>${esc(b.intro || 'Pick an angle, film it, and submit it like always. This page updates on its own, so check back before you film.')}</p>
    </section>
    ${(b.about || b.audience) ? `<div class="two">
      ${b.about ? `<div class="card about"><p class="lbl">What it is</p><p>${esc(b.about)}</p></div>` : ''}
      ${b.audience ? `<div class="card about"><p class="lbl">Who we are talking to</p><p>${esc(b.audience)}</p></div>` : ''}
    </div>` : ''}
    ${seasonCard()}
    ${avoidCard()}
    ${rulesCard()}
    <div style="display:flex;flex-direction:column;gap:8px">${jump}${fpills}</div>
    ${body || `<div class="card empty">Nothing matches that filter.</div>`}
  </main>
  ${footer()}`;
  app.querySelectorAll('[data-fmt]').forEach(el => el.onclick = () => { FILTER.fmt = el.dataset.fmt; const y = scrollY; renderList(); scrollTo(0, y); });
  app.querySelectorAll('[data-jump]').forEach(el => el.onclick = e => { e.preventDefault(); document.getElementById('s-' + el.dataset.jump)?.scrollIntoView({ behavior: 'smooth' }); });
  app.querySelectorAll('[data-more]').forEach(el => el.onclick = () => {
    const s = [D.hot, ...D.sections].find(x => x && x.id === el.dataset.more);
    app.querySelector(`[data-grid="${CSS.escape(s.id)}"]`).innerHTML = s.angles.filter(match).map(a => angleCard(a, s)).join('');
    el.remove();
  });
  wireFilm();
}

function header() {
  const b = D.brand;
  const upd = b.updated_at ? `Updated ${fmtDay(b.updated_at.slice(0, 10))}` : '';
  return `<header class="hd"><div class="wrap">
    <a class="brand" href="#" aria-label="${esc(b.display_name)} creator angles, home">
      ${b.logo_url ? `<img src="${esc(b.logo_url)}" alt="${esc(b.display_name)}">` : `<span class="nm">${esc(b.display_name)}</span>`}
      <span class="lbl">Creator angles</span>
    </a>
    <div class="hd-r">${upd ? `<span class="upd">${upd}</span>` : ''}${b.submit_url ? `<a class="btn acc" href="${esc(b.submit_url)}" target="_blank" rel="noopener"><span class="t">Open our ${esc(b.submit_platform || 'TRYBE')} campaign</span>${ic('external-link')}</a>` : ''}</div>
  </div></header>`;
}
function footer() {
  return `<footer><div class="wrap"><span>Questions about an angle? Message ${esc(D.brand.display_name)} on ${esc(D.brand.submit_platform || 'TRYBE')}.</span><span>Powered by Mobius Digital</span></div></footer>`;
}

/* ---------- one angle ---------- */
function proofTile(p) {
  const labels = {
    meta: ['ad', `${D.brand.display_name} ad`],
    post: ['post', `Creator post · ${p.url ? platformOf(p.url) : ''}`],
    typed: ['typed', 'Example · views typed by the team'],
    upload: ['upload', 'Clip from the team'],
    inspo: ['inspo', 'Inspiration · another brand'],
  };
  const [cls, label] = labels[p.kind] || ['post', 'Example'];
  const sub = p.kind === 'meta' ? 'Ran as a paid ad'
    : p.kind === 'inspo' ? 'Steal the shape, not the brand'
    : p.views ? `${fmtViews(p.views)} views${p.kind === 'typed' ? ' (typed)' : ''}` : (p.kind === 'upload' ? 'Plays here' : `Opens on ${platformOf(p.url || '')}`);
  const who = p.who || (p.kind === 'meta' ? D.brand.display_name : '');
  const inner = `<span class="media" ${p.kind === 'meta' ? `data-cover="${esc(p.ad_id)}"` : ''}>${p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy">` : ''}<span class="play">${ic(p.kind === 'post' || p.kind === 'typed' || p.kind === 'inspo' ? 'external-link' : 'play')}</span></span>
    <span class="src ${cls}">${esc(label)}</span>
    <span class="meta"><b>${esc(who || sub)}</b><span>${esc(who ? sub : (p.note || ''))}</span>${p.note && who ? `<span>${esc(p.note)}</span>` : ''}</span>`;
  if (p.kind === 'meta') return `<button class="card tile" data-play-ad="${esc(p.ad_id)}" aria-label="Play this ad">${inner}</button>`;
  if (p.kind === 'upload') return `<button class="card tile" data-play-file="${esc(p.file)}" aria-label="Play this clip">${inner}</button>`;
  return `<a class="card tile" href="${esc(p.url)}" target="_blank" rel="noopener" aria-label="Open this video on ${esc(platformOf(p.url || ''))}">${inner}</a>`;
}

function renderAngle(id) {
  const a = findAngle(id);
  if (!a) { location.hash = ''; return renderList(); }
  const s = sectionOf(a);
  const list = uniqAngles();
  const next = list[(list.indexOf(a) + 1) % list.length];
  document.title = `${a.title} · ${D.brand.display_name}`;
  const shots = (a.shots || []).map(x => `<div class="flat"><p class="lbl" style="font-size:10px">${esc(x.label)}</p><p>${esc(x.text)}</p></div>`).join('');
  const proof = a.proof.length
    ? `<div class="proof">${a.proof.map(proofTile).join('')}</div>`
    : `<div class="flat noproof">${svgBadge(ICONS.lightbulb, '#4F46E5')}<div><b>No video on this one yet.</b><p class="muted" style="font-size:14px;margin-top:2px">It is a fresh idea, so there is nothing to copy. Follow the openers and the shot plan above, and yours could be the example everyone else sees here.</p></div></div>`;
  app.innerHTML = `${header()}
  <main class="wrap">
    <div class="det">
      <div style="min-width:0">
        <a class="back" href="#">${ic('arrow-left')}All angles</a>
        <div class="tags" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">
          ${a.hot ? `<span class="chip" style="background:${tint(D.hot?.color).bg};color:${tint(D.hot?.color).fg}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true">${D.hot?.icon_svg || ICONS.flame}</svg>${esc(D.hot?.name || 'Hot right now')}</span>` : ''}
          ${s ? `<span class="chip" style="background:${tint(s.color).bg};color:${tint(s.color).fg}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true">${s.icon_svg || ''}</svg>${esc(s.name)}</span>` : ''}
          ${a.products ? `<span class="chip">${esc(a.products)}</span>` : ''}
          ${a.format ? `<span class="chip">${esc(a.format)}</span>` : ''}
        </div>
        <h1 class="serif">${esc(a.title)}</h1>
        ${a.argument ? `<p class="who"><b>The idea.</b> ${esc(a.argument)}</p>` : ''}
        ${a.who ? `<p class="who"><b>Who it is for.</b> ${esc(a.who)}</p>` : ''}
        ${a.trend ? `<p class="who" style="display:flex;gap:8px;align-items:flex-start">${ic('music')}<span><b>Trend to ride.</b> ${esc(a.trend)}</span></p>` : ''}

        ${(a.openers || []).length ? `<h2>Openers you can steal</h2><p class="sub">The first line decides everything. Say it word for word or bend it.</p>
        <ul class="openers">${a.openers.map((o, i) => `<li class="flat"><span class="hook">&ldquo;${esc(o)}&rdquo;</span><button class="btn icon" data-copy="${i}" aria-label="Copy this opener">${ic('copy')}</button></li>`).join('')}</ul>` : ''}

        ${shots ? `<h2>What to film</h2><div class="shots" style="${a.shots.length === 2 ? 'grid-template-columns:repeat(2,minmax(0,1fr))' : a.shots.length > 3 ? 'grid-template-columns:repeat(2,minmax(0,1fr))' : ''}">${shots}</div>` : ''}
        ${a.on_screen ? `<div class="flat overlay">${ic('type')}<div><p class="lbl" style="font-size:10px">Text on screen</p><p style="font-weight:600">${esc(a.on_screen)}</p></div></div>` : ''}

        <h2>Proof it works</h2><p class="sub">Videos made on this angle. The label says where each one came from.</p>
        ${proof}

        ${(a.do_text || a.dont_text) ? `<div class="dd">
          ${a.do_text ? `<div class="flat do"><p class="lbl" style="color:var(--good)">Do</p><p>${esc(a.do_text)}</p></div>` : ''}
          ${a.dont_text ? `<div class="flat dont"><p class="lbl" style="color:var(--bad)">Don't</p><p>${esc(a.dont_text)}</p></div>` : ''}
        </div>` : ''}
      </div>
      <aside class="side">
        <div class="card fb" style="display:flex;flex-direction:column;gap:10px">
          ${submitButton(a, 'btn acc big')}
          <p class="stat" style="font-size:13px">${D.brand.submit_url ? `Opens the ${esc(D.brand.display_name)} campaign on ${esc(D.brand.submit_platform || 'TRYBE')} and copies the angle name, so you can paste it in your submission note.` : `Submit your video on ${esc(D.brand.submit_platform || 'TRYBE')} like always, and put the angle name in your note.`}</p>
        </div>
        ${a.proof.length ? `<div class="card"><p class="lbl">This angle so far</p><p style="margin-top:8px;font-size:15px"><b>${a.proof.length}</b> example${a.proof.length === 1 ? '' : 's'}${a.ads ? `, <b>${a.ads}</b> ran as paid ads` : ''}.</p></div>` : ''}
        ${next && next.id !== a.id ? `<a class="card" href="#a=${esc(next.id)}" style="display:flex;align-items:center;gap:10px;text-decoration:none"><div style="flex:1;min-width:0"><p class="lbl" style="font-size:10px">Next angle</p><p style="font-weight:700;margin-top:2px">${esc(next.title)}</p></div>${ic('chevron-right')}</a>` : ''}
      </aside>
    </div>
  </main>
  <div class="dockbar">${submitButton(a, 'btn acc big')}${next && next.id !== a.id ? `<a class="btn big icon" href="#a=${esc(next.id)}" aria-label="Next angle" style="width:52px">${ic('arrow-right')}</a>` : ''}</div>
  ${footer()}`;
  app.querySelectorAll('[data-copy]').forEach(el => el.onclick = async () => { if (await copy(a.openers[+el.dataset.copy])) toast('Opener copied'); });
  app.querySelectorAll('[data-play-ad]').forEach(el => el.onclick = () => playAd(el.dataset.playAd));
  app.querySelectorAll('[data-play-file]').forEach(el => el.onclick = () => playFile(API + el.dataset.playFile));
  wireFilm();
  loadCovers(a);
  scrollTo(0, 0);
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

function modal(inner) {
  const w = document.createElement('div');
  w.className = 'modal-wrap';
  w.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${inner}<button class="btn" data-close>Close</button></div>`;
  document.body.appendChild(w);
  const done = () => { w.querySelectorAll('video').forEach(v => v.pause()); w.remove(); document.removeEventListener('keydown', k); };
  const k = e => { if (e.key === 'Escape') done(); };
  document.addEventListener('keydown', k);
  w.addEventListener('mousedown', e => { if (e.target === w) done(); });
  w.querySelector('[data-close]').onclick = done;
  w.querySelector('[data-close]').focus();
  return w;
}
async function playAd(adId) {
  const w = modal(`<div class="empty">Loading the ad…</div>`);
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
  const w = modal(`<video src="${esc(src)}" controls autoplay playsinline></video>`);
  w.querySelector('video').play().catch(() => {});
}

/* ---------- boot ---------- */
function route() {
  if (!D) return;
  const m = location.hash.match(/^#a=([a-f0-9]+)/);
  if (m) renderAngle(m[1]);
  else { const y = sessionStorage.getItem('amb_y'); renderList(); if (y) { scrollTo(0, +y); sessionStorage.removeItem('amb_y'); } }
}
window.addEventListener('hashchange', route);
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#a="]');
  if (a && !location.hash.startsWith('#a=')) sessionStorage.setItem('amb_y', String(scrollY));
});

async function boot() {
  if (!SLUG) { app.innerHTML = `<div class="center"><div><h1 class="serif" style="font-size:40px">Creator angles</h1><p class="muted">This link is missing the brand. Check the link you were sent.</p></div></div>`; return; }
  app.innerHTML = `<div class="wrap" style="padding-top:60px;display:flex;flex-direction:column;gap:14px;max-width:720px"><div class="skel" style="height:44px;width:70%"></div><div class="skel"></div><div class="skel" style="width:85%"></div><div class="skel" style="height:180px;margin-top:20px"></div></div>`;
  try {
    const res = await fetch(`${API}/api/angles/${encodeURIComponent(SLUG)}`);
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'This page could not be loaded.');
    if (!j.live) {
      applyAccent(j.brand?.accent);
      app.innerHTML = `<div class="center"><div><h1 class="serif" style="font-size:42px">${esc(j.brand?.display_name || '')} creator angles</h1><p class="muted" style="margin-top:8px">This page is being set up. Check back soon.</p></div></div>`;
      return;
    }
    D = j;
    applyAccent(j.brand.accent);
    route();
  } catch (e) {
    app.innerHTML = `<div class="center"><div><h1 class="serif" style="font-size:40px">Page not found</h1><p class="muted" style="margin-top:8px">${esc(e.message)}</p></div></div>`;
  }
}
boot();
})();
