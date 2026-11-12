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
const ICONS = __ICONS__;
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
     picked  the board picks (D.picks: ads the team chose straight from the ad account, in order),
             then the proof videos attached to the ideas.
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
    // Board picks first (ads the team picked straight from the ad account, in their order), then the
    // ideas' videos dealt round-robin. An ad that is both a pick and an idea's proof shows once, as the pick.
    const ideaOf = {};
    for (const a of all) for (const p of a.proof || []) if (p.kind === 'meta' && p.ad_id && !ideaOf[p.ad_id]) ideaOf[p.ad_id] = a;
    const picks = (D.picks || []).map(p => ({ p, a: (p.ad_id && ideaOf[p.ad_id]) || null, theirs: isTheirs(p) }));
    const taken = new Set(picks.map(t => t.p.ad_id));
    out = [...picks, ...dealt(all.map(a => [a, (a.proof || []).filter(p => playableProof(p) && !(p.ad_id && taken.has(p.ad_id))).sort((x, y) => isTheirs(x) - isTheirs(y))]))];
  }
  // The staff's order (Ambassadors > Videos, board_sort) wins; videos it has not placed keep the dealt order after them.
  if (!(D.board && D.board.length)) out = out.map((t, k) => [t, t.p.board_sort ?? 1e6 + k]).sort((x, y) => x[1] - y[1]).map(x => x[0]);
  return out.map((t, i) => ({ ...t, star: i === 0, sec: t.p.section_id || t.a?.section_id || '', i }));
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
  if (t.top) return { cap: t.top.cap, sub: t.top.sub, chip: '' };
  if (t.theirs) return { cap: p.note || t.a?.title || '', sub: `From ${whoOf(p) || 'another brand'}, not ours`, chip: secName(t.sec) };
  if (t.rank) return { cap: t.a?.title || '', sub: `Top ad #${t.rank}`, chip: secName(t.sec) || 'Our ad', capAd: t.a ? '' : p.ad_id };
  return { cap: p.note || t.a?.title || '', sub: p.kind === 'meta' ? 'Ran as our ad' : 'Our video', chip: secName(t.sec) || (t.a ? '' : 'Our ad'), capAd: !p.note && !t.a && p.kind === 'meta' ? p.ad_id : '' };
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
/* THE HUB, v2 (2026-11-05). Built on Phil Kiel's creator brief (x.com/PhilKiel/status/2113216005728325780): a creator
   should never have to work out the process, and every part says plainly what it is. Four tabs:
     Start here         how it works in four steps, the deal to say, what is selling right now (with numbers),
                        the videos to film this week, the weekly call and the Discord
     Video ideas        every idea as a card with a preview image; tap one for its brief: the example video, what to
                        show first, what to say first, the shots, and what to avoid
     Videos that sold   creator videos ranked by sales, and the creators behind them
     Product and rules  the product in a few lines, how to say the names, how to film, what not to say, the extra
                        clips we always need, how to label an upload, and the last check before sending
   The tab lives in the address (#start, #ideas, #sold, #rules). Nothing set in Locus = that part is not drawn.
   Everything here is edited in Locus under Ads > Trybe > Briefs. */
let TAB = '';
let TOP = [];
const head = (title, sub) => `<div class="sec-h"><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;
const TABS = () => [['start', 'Home'], [ideas().length ? 'ideas' : '', 'All ideas'], [D.leaders ? 'sold' : '', 'Videos that sold'], ['rules', 'Rules']].filter(x => x[0]);
const OLD_TAB = { week: 'start', top: 'sold', videos: 'ideas', how: 'rules', checklist: 'rules' };
const goTab = id => { TAB = id; SHOW_ALL = false; try { history.replaceState(null, '', '#' + TAB); } catch {} render(); scrollTo(0, 0); };
/* The idea behind a weekly line: by its id, else by its title (weeks saved before ids were kept). */
function ideaOf(x) {
  const all = ideas();
  return all.find(a => a.id === x.angle_id) || all.find(a => x.title && x.title.toLowerCase().startsWith(String(a.title || '').toLowerCase())) || null;
}
const examplesOf = a => (a ? [...TILES.filter(t => t.a && t.a.id === a.id && !t.theirs), ...TILES.filter(t => t.a && t.a.id === a.id && t.theirs)] : []);
const exampleOf = a => examplesOf(a)[0] || null;
/* A preview image for anything that plays: a stored frame, the ad's cover (filled in by loadCovers), or the clip's first frame. */
const thumbOf = t => !t ? '' : t.p.thumb ? `<img src="${esc(t.p.thumb)}" alt="" loading="lazy" onerror="this.remove()">`
  : t.p.kind === 'upload' ? `<video class="pv" data-src="${esc(API + t.p.file)}#t=0.8" preload="none" muted playsinline tabindex="-1" aria-hidden="true"></video>` : '';
const coverOf = t => (t && t.p.kind === 'meta' && !t.p.thumb ? `data-cover="${esc(t.p.ad_id)}"` : '');
const firstLine = a => (a && (a.openers || []).find(Boolean)) || '';
/* One idea as a card: the preview image on the left, then what it is and the first line to say. */
function ideaCard(a, o = {}) {
  const ex = exampleOf(a);
  const say = o.opener || firstLine(a);
  return `<button class="icard" type="button" data-idea="${esc(a.id)}">
    <span class="ic-th" ${coverOf(ex)}>${thumbOf(ex)}${ex ? `<i>${ic('play', 13)}</i>` : `<em>${ic('video', 18)}</em>`}</span>
    <span class="ic-b">${o.n ? `<span class="ic-n">Idea ${o.n}</span>` : secName(a.section_id) ? `<span class="ic-n">${esc(secName(a.section_id))}</span>` : ''}
      <b>${esc(o.title || a.title)}</b>
      ${say ? `<span class="ic-say">Say first: “${esc(say)}”</span>` : a.argument ? `<span class="ic-say">${esc(a.argument)}</span>` : ''}
      <span class="ic-go">${ex ? 'Watch and film it' : 'How to film it'}${ic('arrow-right', 14)}</span></span>
  </button>`;
}
/* 2026-11-12 trim (Cole: "too confusing in the beginning"): the four-box How it works card became one line of
   three steps under the headline, and the ideas to film come straight after the deal. The rules are a link. */
function stepsStrip() {
  const S = ['Pick an idea below', 'Film it on your phone, 30 to 45 seconds', `Upload it on ${plat()}`];
  return `<ol class="flow">${S.map((t, k) => `<li><span>${k + 1}</span>${esc(t)}</li>`).join('')}</ol>`;
}
function offerBox() {
  const w = D.brand.week || {}, br = D.brand.brief || {};
  if (!(w.offer && w.offer.head)) return '';
  return `<div class="wk-offer"><span class="wk-l">The deal. Say it exactly like this</span><b>${esc(w.offer.head)}</b>${w.offer.line ? `<p>${esc(w.offer.line)}</p>` : ''}
    <button class="of-rules" type="button" data-tab="rules">Names, rules and what not to say${ic('arrow-right', 14)}</button></div>`;
}
function sellingBox() {
  const w = D.brand.week || {}, L = D.leaders;
  const lines = (w.selling || []).slice(0, 3);
  const vids = TOP.slice(0, 3);
  const same = w.same && w.same.line;
  if (!lines.length && !vids.length && !same) return '';
  return `${head('What is selling right now')}
    <div class="sell">
      ${lines.length ? `<ul class="sell-l">${lines.map(x => `<li>${ic('trending-up', 15)}<span>${esc(x)}</span></li>`).join('')}</ul>` : ''}
      ${same ? `<div class="sell-line"><span class="wk-s">An opening line that made sales${w.same.who ? `, first said by ${esc(w.same.who)}` : ''}</span><b>“${esc(w.same.line)}”</b><button class="copy" type="button" data-copy="${esc(w.same.line)}">${ic('copy', 13)}Copy this line</button></div>` : ''}
      ${vids.length ? `<div class="sell-v">${vids.map(t => `<button class="tile" type="button" data-top="${t.i}" ${coverOf(t)} aria-label="Play: ${esc(t.top.cap)}">${thumbOf(t)}<span class="tl-star">#${t.top.rank}</span><span class="tl-play">${ic('play', 16)}</span><span class="tl-cap"><b>${esc(t.top.cap)}</b></span></button>`).join('')}</div>
        <button class="more" type="button" data-tab="sold">See every video that sold in the last ${L.days} days${ic('arrow-right', 15)}</button>` : ''}
    </div>`;
}
function weekIdeas() {
  const w = D.brand.week || {};
  const rows = (w.daily || []).map(x => ({ x, a: ideaOf(x) }));
  if (rows.length) {
    return `${head(`Film one of these ${rows.length} this week`, 'Tap one for an example and how to film it.')}
      <div class="icards">${rows.map(({ x, a }, k) => a ? ideaCard(a, { n: k + 1, title: x.title, opener: x.opener })
        : `<div class="icard flat"><span class="ic-th"><em>${ic('video', 18)}</em></span><span class="ic-b"><span class="ic-n">Idea ${k + 1}</span><b>${esc(x.title)}</b>${x.opener ? `<span class="ic-say">Say first: “${esc(x.opener)}”</span>` : ''}</span></div>`).join('')}</div>
      ${ideas().length > rows.length ? `<button class="more" type="button" data-tab="ideas">See all ${ideas().length} video ideas${ic('arrow-right', 15)}</button>` : ''}`;
  }
  // No weekly list yet: the ideas the team marked as hot, so the page never opens empty.
  const hot = (D.hot ? D.hot.angles : []).slice(0, 5);
  const list = hot.length ? hot : ideas().slice(0, 5);
  if (!list.length) return '';
  return `${head('Start with one of these', 'Tap one for an example and how to film it.')}
    <div class="icards">${list.map((a, k) => ideaCard(a, { n: k + 1 })).join('')}</div>
    ${ideas().length > list.length ? `<button class="more" type="button" data-tab="ideas">See all ${ideas().length} video ideas${ic('arrow-right', 15)}</button>` : ''}`;
}
function meetBox() {
  const w = D.brand.week || {}, c = w.call || {}, recs = c.recordings || [];
  const call = c.when || c.join || recs.length ? `<div class="wk-box"><span class="wk-l">Weekly creator call</span>${c.when ? `<p>${esc(c.when)}</p>` : ''}
    <p class="muted">15 minutes on what sold last week, 15 minutes on what to film this week.</p>
    ${c.join ? `<a class="btn btn-acc wk-join" href="${esc(c.join)}" target="_blank" rel="noopener">Join the call${ic('arrow-right', 15)}</a>` : ''}
    ${recs.length ? `<div class="wk-recs"><span class="wk-s">Missed it? Watch a past call</span>${recs.map(r => `<a href="${esc(r.url)}" target="_blank" rel="noopener">${ic('play', 13)}<span>${esc(r.title)}</span></a>`).join('')}</div>` : ''}</div>` : '';
  const disc = w.discord ? `<div class="wk-box"><span class="wk-l">Creator Discord</span><p>Ask questions, get feedback on a video before you upload it, and see the winning videos every Friday.</p>
    <a class="btn btn-line wk-join" href="${esc(w.discord)}" target="_blank" rel="noopener">Join the Discord${ic('arrow-right', 15)}</a></div>` : '';
  return call || disc ? `<div class="wk-grid">${call}${disc}</div>` : '';
}
const submitBtn = () => (D.brand.submit_url ? `<a class="btn btn-acc st-go" href="${esc(D.brand.submit_url)}" target="_blank" rel="noopener">Upload your video on ${esc(plat())}${ic('arrow-right', 15)}</a>` : '');
/* ---------- Home (2026-11-12, Cole: "the home page should be the overview... promote the Black Friday sale and the
   4 for $150 as separate sections, then the top performers... get people excited to record, and into the Discord").
   Order: the hook (what you earn) + proof, one section per live deal (its line to say, its ideas, its own upload
   button), the videos that sold, the Discord, 4 rules, more ideas. A brand with no deals set falls back to the one
   offer box + this week's ideas, so every hub keeps working. Edited in Locus: Creators > Creator link > Start here. */
const upUrl = () => D.brand.submit_url || '';
function heroHome() {
  const b = D.brand, w = b.week || {}, L = D.leaders;
  const pay = w.pay ? `You get ${esc(w.pay)} of every sale.` : 'You earn on every sale.';
  const deals = (w.deals || []).length;
  const sub = deals > 1 ? `${deals} deals are live right now. Pick one, film yourself with the product, and upload it on ${esc(plat())}.`
    : `Pick an idea, film yourself with the product, and upload it on ${esc(plat())}.`;
  const top = L && (L.videos || [])[0];
  const proof = [];
  if (L && (L.creators || []).length) proof.push([String(L.creators.length), `creator${L.creators.length === 1 ? '' : 's'} made sales in the last ${L.days} days`]);
  if (top && top.sales > 1) proof.push([String(top.sales), `sales from ${esc(String(top.name).split(' ')[0])}'s top video`]);
  if (w.discord) proof.push(['Fridays', 'we post the new winners']);
  return `<section class="hm-hero">
    ${w.title ? `<p class="wk-date">${esc(w.title)}</p>` : ''}
    <h1>Film it. We run it as an ad. <em>${pay}</em></h1>
    <p class="hm-sub">${sub}</p>
    <div class="hm-row"><a class="btn btn-acc" href="#deals" data-jump="deals">Show me what to film</a>${w.discord ? `<a class="btn btn-line" href="#discord" data-jump="discord">Join the Discord</a>` : ''}</div>
    ${proof.length ? `<div class="hm-proof">${proof.map(([n, t]) => `<div><b>${n}</b><span>${t}</span></div>`).join('')}</div>` : ''}
  </section>`;
}
function dealIdea(x) {
  const a = x.angle_id ? ideaOf(x) : null;
  const ex = exampleOf(a);
  const body = `<b class="hm-it">${esc(x.title)}</b>${x.how ? `<span class="hm-is">${esc(x.how)}</span>` : ''}`;
  if (!a) return `<div class="hm-idea"><span class="hm-th hm-new"><span>${ic('video', 20)}<small>No example yet. Be the first.</small></span></span>${body}</div>`;
  return `<button class="hm-idea" type="button" data-idea="${esc(a.id)}"><span class="hm-th" ${coverOf(ex)}>${thumbOf(ex)}${ex ? `<i>${ic('play', 13)}</i>` : `<em>${ic('video', 18)}</em>`}</span>${body}</button>`;
}
function dealSection(d, k) {
  const tiers = d.tiers || [];
  return `<section class="hm-deal${d.dark ? ' dark' : ''}" ${k === 0 ? 'id="deals"' : ''}>
    <div class="hm-dt">
      <div class="hm-row">${d.badge ? `<span class="hm-pill${d.live ? ' live' : ''}">${esc(d.badge)}</span>` : ''}${d.film_by ? `<span class="hm-pill">Film by ${esc(d.film_by)}</span>` : ''}</div>
      <h2>${esc(d.name)}</h2>
      ${d.line ? `<p class="hm-lede">${esc(d.line)}</p>` : ''}
    </div>
    ${tiers.length ? `<div class="hm-tiers">${tiers.map(t => `<div><small>${esc(t.spend)}</small><b>${esc(t.save)}</b>${t.extra ? `<span>${esc(t.extra)}</span>` : ''}</div>`).join('')}</div>` : ''}
    ${d.say ? `<div class="hm-say"><small>Say this first</small><b>“${esc(d.say)}”</b><button class="hm-copy" type="button" data-copy="${esc(d.say)}">${ic('copy', 13)}Copy line</button></div>` : ''}
    ${(d.ideas || []).length ? `<p class="hm-ih">Film one of these</p><div class="hm-ideas n${Math.min(d.ideas.length, 4)}">${d.ideas.map(dealIdea).join('')}</div>` : ''}
    <div class="hm-foot">${d.note ? `<p>${esc(d.note)}</p>` : '<span></span>'}${upUrl() ? `<a class="btn btn-acc btn-sm" href="${esc(upUrl())}" target="_blank" rel="noopener">Upload your video</a>` : ''}</div>
  </section>`;
}
function winsHome() {
  const L = D.leaders, vids = TOP.slice(0, 5);
  if (!vids.length) return '';
  return `<section class="hm-sec">
    ${head(`Videos that sold in the last ${L.days} days`, 'Real creators, real sales. Watch one, then make your own.')}
    <div class="hm-wins">${vids.map(t => { const v = L.videos[t.i] || {}; return `<button class="hm-win" type="button" data-top="${t.i}" aria-label="Play: ${esc(t.top.cap)}"><span class="hm-th" ${coverOf(t)}>${thumbOf(t)}<span class="hm-rank">#${t.top.rank}</span><i>${ic('play', 13)}</i></span><b>${esc(v.name || '')}</b><span class="hm-is">${esc(v.product || 'Creator video')}</span><em>${v.sales} sale${v.sales === 1 ? '' : 's'}</em></button>`; }).join('')}</div>
    <p class="hm-nudge">Every one of these was filmed on a phone. Yours could be up here next.${L.videos.length > vids.length ? ` <button class="hm-link" type="button" data-tab="sold">See all ${L.videos.length}</button>` : ''}</p>
  </section>`;
}
function discordHome() {
  const w = D.brand.week || {}, c = w.call || {}, recs = c.recordings || [];
  if (!w.discord && !c.when && !c.join) return '';
  return `<section class="hm-disc" id="discord">
    <h2>${w.discord ? 'Join the creator Discord' : 'Weekly creator call'}</h2>
    ${w.discord ? `<ul><li>Post your video before you upload and we'll tell you what to fix.</li><li>See the winning videos first, every Friday.</li><li>Ask anything and get an answer the same day.</li></ul>
    <a class="btn hm-dbtn" href="${esc(w.discord)}" target="_blank" rel="noopener">Join the Discord${ic('arrow-right', 15)}</a>` : ''}
    ${c.when || c.join ? `<p class="hm-call">${w.discord ? 'Weekly creator call: ' : ''}${esc(c.when || '')}${c.when ? '. ' : ''}What sold last week and what to film next.${c.join ? ` <a href="${esc(c.join)}" target="_blank" rel="noopener">Join the call</a>` : ''}</p>` : ''}
    ${recs.length ? `<p class="hm-call">Missed one? ${recs.slice(-3).map(r => `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>`).join(' · ')}</p>` : ''}
  </section>`;
}
function rulesHome() {
  const b = D.brand, w = b.week || {};
  let R = (w.top_rules || []).map(x => [x.title, x.text]);
  if (!R.length) R = ((b.checklist && b.checklist.do) || []).slice(0, 4).map(x => [x.title, x.text || '']);
  if (!R.length) return '';
  return `<section class="hm-sec">
    ${head(`${R.length} rules so your video can run`, 'Break one and we can’t use it as an ad.')}
    <div class="hm-rules">${R.map(([t, x], k) => `<div><i>${k + 1}</i><div><b>${esc(t)}</b>${x ? `<span>${esc(x)}</span>` : ''}</div></div>`).join('')}</div>
    <button class="hm-link" type="button" data-tab="rules">See every rule${ic('arrow-right', 14)}</button>
  </section>`;
}
function moreHome() {
  const n = ideas().length;
  if (!n) return '';
  return `<button class="hm-more" type="button" data-tab="ideas"><span><b>Want to film something else?</b><small>${n} more ideas, each with an example to watch.</small></span><span class="btn btn-line btn-sm">See all ideas</span></button>`;
}
function startTab() {
  const w = D.brand.week || {};
  const deals = (w.deals || []).map(dealSection).join('');
  const legacy = deals ? '' : `<div id="deals">${offerBox()}${weekIdeas()}</div>`;
  return `${heroHome()}${deals}${legacy}${winsHome()}${discordHome()}${rulesHome()}${moreHome()}`;
}
function buildTop() {
  const L = D.leaders; if (!L) return [];
  return (L.videos || []).filter(v => v.ad_id).map((v, k) => ({ p: { kind: 'meta', ad_id: v.ad_id, thumb: v.thumb || '' }, a: null, theirs: false, i: k,
    top: { cap: `${v.name}: ${v.sales} sale${v.sales === 1 ? '' : 's'}`, sub: v.product || 'Creator video', line: v.line || '', rank: k + 1 } }));
}
function soldTab() {
  const L = D.leaders; if (!L) return '';
  const tiles = TOP.map(t => `<button class="tile" data-top="${t.i}" ${coverOf(t)} aria-label="Play: ${esc(t.top.cap)}">
    ${thumbOf(t)}<span class="tl-star">#${t.top.rank}</span><span class="tl-play">${ic('play', 18)}</span>
    <span class="tl-cap"><b>${esc(t.top.cap)}</b><small>${esc(t.top.sub)}</small></span></button>`).join('');
  const who = (L.creators || []).map((c, k) => { const t = TOP.find(x => x.p.ad_id === c.ad_id); return `<button class="lb-row" type="button" ${t ? `data-top="${t.i}"` : 'disabled'}><i>${k + 1}</i><div><b>${esc(c.name)}</b><span>${c.videos} video${c.videos === 1 ? '' : 's'} with sales${t ? '. Tap to watch their best one.' : ''}</span></div><em>${c.sales} sale${c.sales === 1 ? '' : 's'}</em></button>`; }).join('');
  return `${head('Videos that sold', `Videos from creators like you that we ran as ads, ranked by sales in the last ${L.days} days. Tap one to watch it and read its first line.`)}
    <div class="grid">${tiles}</div>
    ${head('Creators with the most sales', `Sales from each creator's videos in the last ${L.days} days.`)}<div class="wk-box lb">${who}</div>`;
}
function ideasTab() {
  const all = ideas();
  const n = {};
  for (const a of all) if (a.section_id) n[a.section_id] = (n[a.section_id] || 0) + 1;
  const cs = D.sections.filter(s => n[s.id]).map(s => ({ id: s.id, name: s.name, n: n[s.id] }));
  if (CAT !== 'all' && !cs.some(c => c.id === CAT)) CAT = 'all';
  const list = all.filter(a => CAT === 'all' || a.section_id === CAT);
  const vids = shown();
  const cut = SHOW_ALL ? vids.length : Math.min(vids.length, 12);
  return `${head('Video ideas', 'Each one is a video we want more of. Tap one to watch an example and see how to film it.')}
    ${cs.length > 1 ? `<div class="cats" role="group" aria-label="Show"><button class="cat ${CAT === 'all' ? 'on' : ''}" data-cat="all">All<span>${all.length}</span></button>${cs.map(c => `<button class="cat ${CAT === c.id ? 'on' : ''}" data-cat="${esc(c.id)}">${esc(c.name)}<span>${c.n}</span></button>`).join('')}</div>` : ''}
    <div class="icards two">${list.map(a => ideaCard(a)).join('') || '<p class="empty">No ideas here yet.</p>'}</div>
    ${vids.length ? `${head('Example videos', 'Every example in one place. Tap a video to watch it.')}
      <div class="grid">${vids.slice(0, cut).map(tile).join('')}</div>
      ${cut < vids.length ? `<button class="more" data-more>Show all ${vids.length} videos${ic('chevron-down', 15)}</button>` : ''}` : ''}`;
}
const SKIP_RE = /^\s*(never|don'?t|do not|avoid|skip|no\b)/i;
/* The rules as three plain lists. The short checklist (checklist_json) when the brand has one, else its older long lists. */
function ruleLists() {
  const b = D.brand, c = b.checklist;
  let how = [], say = [], skip = [];
  if (c && ((c.do || []).length || (c.say || []).length || (c.skip || []).length)) { how = c.do || []; say = c.say || []; skip = c.skip || []; }
  else {
    const r = b.rules || [], own = Array.isArray(b.skip);
    how = (b.guide || []).map(x => ({ title: x.title, text: x.text }));
    say = own ? r : r.filter(x => !SKIP_RE.test(x));
    skip = [...(b.avoid || []).map(x => x.title + (x.why ? `. ${x.why}` : '')), ...(own ? b.skip : r.filter(x => SKIP_RE.test(x)))];
  }
  return { how, say, skip };
}
function rulesTab() {
  const b = D.brand, br = b.brief || {}, R = ruleLists();
  const li = (items, icon) => `<ul class="rl">${items.map(x => `<li>${ic(icon, 15)}<span>${esc(x)}</span></li>`).join('')}</ul>`;
  const card = (title, sub, body, cls = '') => `<section class="card rcard ${cls}"><h3>${esc(title)}</h3>${sub ? `<p class="rc-sub">${esc(sub)}</p>` : ''}${body}</section>`;
  const product = (br.features || []).length || b.about ? card('The product', (br.features || []).length ? 'Only talk about a feature you have used yourself.' : '',
    (br.features || []).length ? `<dl class="feat">${br.features.map(f => `<div><dt>${esc(f.name)}</dt><dd>${esc(f.line)}</dd></div>`).join('')}</dl>` : `<p class="rc-p">${esc(b.about)}</p>`, 'wide') : '';
  const names = (br.names || []).length ? card('Say and spell the names right', 'A video with the wrong name cannot run.', li(br.names, 'check')) : '';
  const how = R.how.length ? card('How to film it', 'What makes people stop and watch.', `<div class="ck-boxes">${R.how.map(x => `<div class="ck-box">${ic('check', 15)}<div><b>${esc(x.title)}</b>${x.text ? `<span>${esc(x.text)}</span>` : ''}</div></div>`).join('')}</div>`, 'wide') : '';
  const say = R.say.length ? card('If you mention these, say them this way', 'You do not have to say all of these. Only when it comes up.', li(R.say, 'check'), 'good') : '';
  const skipAll = [...(br.offer_dont || []), ...R.skip];   // the deal's don'ts moved here from Start here (2026-11-12)
  const skip = skipAll.length ? card('Do not film or say these', 'A video with any of these cannot run as an ad.', li(skipAll, 'x'), 'bad') : '';
  const broll = (br.broll || []).length ? card('Extra clips we always need', 'Film a few of these with no talking, 5 to 10 seconds each. We use them in the edit. Hold the phone at eye level, use light from a window, no other brand logos, no music playing.', li(br.broll, 'video')) : '';
  const label = br.label ? card(`How to label your upload on ${plat()}`, '', `<p class="rc-p">${esc(br.label)}</p>`) : '';
  const fin = (br.final || []).length ? card('Last check before you upload', 'Tick every box.', `<div class="fin">${br.final.map(x => `<label><input type="checkbox"><span>${esc(x)}</span></label>`).join('')}</div>`, 'wide') : '';
  return `${head('Product and rules', 'Two minutes to read. It keeps your video from being sent back.')}
    <div class="rgrid">${product}${names}${label}${how}${say}${skip}${broll}${fin}</div>${submitBtn()}`;
}
function render() {
  const b = D.brand;
  document.title = `${b.display_name} creator hub`;
  const tabs = TABS();
  if (!tabs.some(t => t[0] === TAB)) TAB = tabs[0][0];
  const pv = D.preview ? `<div class="pv-bar" role="status"><b>Preview.</b> This link is switched off, so creators see "being set up". Only signed-in Mobius staff can see this page.</div>` : '';
  const body = TAB === 'start' ? startTab() : TAB === 'sold' ? soldTab() : TAB === 'ideas' ? ideasTab() : rulesTab();
  app.innerHTML = `${pv}
  <header class="top"><div class="col">
    <a class="brand" href="#" aria-label="${esc(b.display_name)} creators">${b.logo_url ? `<img src="${esc(LOGO_TRIM[b.logo_url] || b.logo_url)}" alt="${esc(b.display_name)}" crossorigin="anonymous" data-logo="${esc(b.logo_url)}">` : `<span class="nm">${esc(b.display_name)}</span>`}<span class="tag-c">Creator hub</span></a>
    ${b.submit_url ? `<a class="top-link" href="${esc(b.submit_url)}" target="_blank" rel="noopener"><span>Upload a video</span><em>Upload</em>${ic('arrow-right', 15)}</a>` : ''}
  </div></header>
  <nav class="tabs" role="tablist" aria-label="Sections"><div class="col">${tabs.map(([id, l]) => `<button type="button" role="tab" data-tab="${id}" class="${TAB === id ? 'on' : ''}" aria-selected="${TAB === id}">${esc(l)}</button>`).join('')}</div></nav>
  <main class="col" id="panel">${body}</main>
  <footer><div class="col"><span>Questions? Message ${esc(b.display_name)} on ${esc(plat())}.</span><span>Powered by Mobius Digital</span></div></footer>
  ${b.submit_url ? `<div class="hm-dock"><div class="col"><a class="btn btn-acc" href="${esc(b.submit_url)}" target="_blank" rel="noopener">Upload your video on ${esc(plat())}</a></div></div>` : ''}`;
  wire();
}
function copyText(s) {
  const done = () => toast('Copied');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(done, () => toast('Press and hold the line to copy it'));
  else toast('Press and hold the line to copy it');
}
function wire() {
  app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => goTab(b.dataset.tab));
  app.querySelectorAll('[data-jump]').forEach(b => b.onclick = e => { e.preventDefault(); const el = document.getElementById(b.dataset.jump); if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); });
  app.querySelectorAll('[data-idea]').forEach(h => h.onclick = () => { const a = ideas().find(x => x.id === h.dataset.idea); if (a) openIdea(a); });
  app.querySelectorAll('[data-copy]').forEach(c => c.onclick = () => copyText(c.dataset.copy));
  app.querySelectorAll('[data-top]').forEach(el => el.onclick = () => openPlayer(TOP[+el.dataset.top]));
  app.querySelectorAll('[data-cat]').forEach(c => c.onclick = () => {
    CAT = c.dataset.cat; SHOW_ALL = false;
    if (!app.querySelector('.cats')) return;
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
  app.querySelector('.brand').onclick = e => { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); };
  wirePreviews();
  loadCovers();
}

/* ---------- one idea's brief: the example video beside what to show, say and film ---------- */
function openIdea(a) {
  closePlayer();
  const exs = examplesOf(a);
  const all = ideas();
  const shots = (a.shots || []).filter(sh => sh.text);
  const openers = (a.openers || []).filter(Boolean).slice(0, 4);
  let step = 0;
  const blk = (label, body, numbered) => (body ? `<div class="is-blk"><span class="is-l">${numbered ? `${++step}. ` : ''}${esc(label)}</span>${body}</div>` : '');
  const w = document.createElement('div');
  w.className = 'pl-wrap'; w.id = 'player';
  w.innerHTML = `<div class="pl is${exs.length ? '' : ' novid'}" role="dialog" aria-modal="true" aria-label="${esc(a.title)}">
    <span class="grab" data-grab></span>
    <button class="pl-x" data-close aria-label="Close">${ic('x', 18)}</button>
    ${exs.length ? `<div class="is-v"><div class="pl-v" id="isV"></div>
      ${exs.length > 1 ? `<div class="is-more">${exs.slice(0, 5).map((t, k) => `<button type="button" data-ex="${k}" class="${k ? '' : 'on'}" ${coverOf(t)} aria-label="Example ${k + 1}">${thumbOf(t)}</button>`).join('')}</div>` : ''}</div>` : ''}
    <div class="is-b">
      ${secName(a.section_id) ? `<span class="chip chip-ours">${esc(secName(a.section_id))}</span>` : ''}
      <b class="pl-t">${esc(a.title)}</b>
      ${a.argument ? `<p class="is-p">${esc(a.argument)}</p>` : ''}
      ${blk('Show this in the first 2 seconds', a.visual_hook ? `<p>${esc(a.visual_hook)}</p>` : '', true)}
      ${blk('Say one of these first', openers.length ? `<ul class="is-say">${openers.map(o => `<li><span>“${esc(o)}”</span><button class="copy" type="button" data-copy="${esc(o)}" aria-label="Copy this line">${ic('copy', 13)}Copy</button></li>`).join('')}</ul><p class="is-note">Change the details to fit your life. Keep the idea.</p>` : '', true)}
      ${blk('Then film these shots', shots.length ? `<ol class="is-shots">${shots.map(sh => `<li>${sh.label ? `<b>${esc(sh.label)}.</b> ` : ''}${esc(String(sh.text))}</li>`).join('')}</ol>` : '', true)}
      ${blk('Text to put on screen', a.on_screen ? `<p>${esc(a.on_screen)}</p>` : '')}
      ${a.do_text || a.dont_text ? `<div class="is-dd">${a.do_text ? `<div class="good"><span class="is-l">Do</span><p>${esc(a.do_text)}</p></div>` : ''}${a.dont_text ? `<div class="bad"><span class="is-l">Do not</span><p>${esc(a.dont_text)}</p></div>` : ''}</div>` : ''}
      ${D.brand.submit_url ? `<a class="btn btn-acc is-go" href="${esc(D.brand.submit_url)}" target="_blank" rel="noopener">Filmed it? Upload on ${esc(plat())}${ic('arrow-right', 15)}</a>` : ''}
      <div class="pl-nav"><button class="btn btn-line" data-step="-1" aria-label="Previous idea">${ic('arrow-left', 16)}</button><button class="btn btn-line pl-next" data-step="1">Next idea${ic('arrow-right', 16)}</button></div>
    </div>
  </div>`;
  document.body.appendChild(w);
  document.body.classList.add('locked');
  requestAnimationFrame(() => w.classList.add('on'));
  const box = w.querySelector('#isV');
  const poster = t => {
    box.innerHTML = `<button class="is-poster" type="button" ${coverOf(t)} aria-label="Play the example video">${thumbOf(t)}<span class="tl-play">${ic('play', 20)}</span><small>${t.theirs ? `Example from ${esc(whoOf(t.p) || 'another brand')}. Same idea, film it with ${esc(D.brand.display_name)}.` : 'Example video. Tap to play.'}</small></button>`;
    box.querySelector('.is-poster').onclick = () => { box.innerHTML = '<div class="loading">Loading the video…</div>'; loadMedia(box, t.p); };
    box.querySelectorAll('video.pv[data-src]').forEach(loadPreview);
    loadCovers();
  };
  if (exs.length) poster(exs[0]);
  w.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { w.querySelectorAll('[data-ex]').forEach(x => x.classList.toggle('on', x === b)); poster(exs[+b.dataset.ex]); });
  w.querySelectorAll('.is-more video.pv[data-src]').forEach(loadPreview);
  w.querySelectorAll('[data-copy]').forEach(c => c.onclick = () => copyText(c.dataset.copy));
  const k = all.indexOf(a);
  w.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { const n = all[(k + +b.dataset.step + all.length) % all.length]; if (n) openIdea(n); });
  w.querySelector('[data-close]').onclick = closePlayer;
  w.addEventListener('click', e => { if (e.target === w) closePlayer(); });
  loadCovers();
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
       ${t.top?.line ? `<p class="pl-s">Their first line: “${esc(t.top.line)}”</p>` : a?.argument ? `<p class="pl-s">${esc(a.argument)}</p>` : ''}`;
  const brief = a && a.id ? `<button class="btn btn-acc pl-brief" type="button" data-brief>See how to film this idea${ic('arrow-right', 15)}</button>` : '';
  const w = document.createElement('div');
  w.className = 'pl-wrap'; w.id = 'player';
  w.innerHTML = `<div class="pl" role="dialog" aria-modal="true" aria-label="Video">
    <span class="grab" data-grab></span>
    <button class="pl-x" data-close aria-label="Close">${ic('x', 18)}</button>
    <div class="pl-v"><div class="loading">Loading the video…</div></div>
    <div class="pl-info">${info}${brief}
      <div class="pl-nav"><button class="btn btn-line" data-step="-1" aria-label="Previous video">${ic('arrow-left', 16)}</button><button class="btn btn-line pl-next" data-step="1">Next video${ic('arrow-right', 16)}</button></div>
    </div>
  </div>`;
  document.body.appendChild(w);
  document.body.classList.add('locked');
  requestAnimationFrame(() => w.classList.add('on'));
  const list = t.top ? TOP : shown();
  const k = list.indexOf(t);
  w.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { const n = list[(k + +b.dataset.step + list.length) % list.length]; if (n) openPlayer(n); });
  w.querySelector('[data-close]').onclick = closePlayer;
  w.querySelector('[data-brief]')?.addEventListener('click', () => openIdea(a));
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
async function loadCovers() {
  const ids = [...new Set([...document.querySelectorAll('[data-cover]')].filter(m => !m.querySelector('img')).map(m => m.dataset.cover))].filter(Boolean);
  for (let i = 0; i < ids.length; i += 80) {
    try {
      // A preview page is not live, so the slug does not authorise its ads yet: use the staff session.
      const q = encodeURIComponent(ids.slice(i, i + 80).join(','));
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
    TOP = buildTop();
    TAB = OLD_TAB[location.hash.slice(1)] || location.hash.slice(1);   // old links (#week, #top, #videos, #how, #checklist) still open the right tab
    render();
    // Old links (#rules from the PDF and Slack) land on the checklist.
    /* #rules and #checklist open How it works (set at boot) */
  } catch (e) {
    app.innerHTML = `<div class="center"><div><h1>Page not found</h1><p class="sub">${esc(e.message)}</p></div></div>`;
  }
}
boot();
/* A link to another tab of the page that is already open (#rules from a Discord post) switches tabs. */
addEventListener('hashchange', () => { const h = OLD_TAB[location.hash.slice(1)] || location.hash.slice(1); if (D && h && h !== TAB && TABS().some(t => t[0] === h)) { TAB = h; render(); scrollTo(0, 0); } });
})();
