/* Locus share (2026-10-09). Show a client something without "go to this tab, then that tab".
 * Research: docs/strategist-viktor-grade-plan.md section 15 (Triple Whale's per-section Export menu and its address
 * bar that holds the view; Hyros's print view). Three jobs, one file:
 *   1. THE ADDRESS IS THE VIEW. ?page=&brand=&period= (or from=&to=)&cmp=&model=&ad=&camp= is written with
 *      history.replaceState on every show() and on opening an ad or a campaign, and read on boot, so a link or a
 *      refresh restores exactly what was on screen. #card=<id> scrolls to that card and briefly rings it.
 *   2. ONE EXPORT MENU per card (and per page), drawn by the shared PillMenu helper: Copy as image (2x PNG to the
 *      clipboard, light theme on a clean frame: brand, title, dates, compare, "Locus by Mobius Digital"), Download
 *      PNG, Send to Slack (the brand's own internal or client channel, looked up on the account-health worker, never
 *      typed), Copy link to this section.
 *   3. PRINT OR SAVE AS PDF from the page menu: light theme, no rail or top bar, cards kept whole (v2.css, end).
 *   4. SHARE A PUBLIC LINK (2026-10-09, Cole approved): the card or page is FROZEN (its markup with every number baked
 *      in, plus only the CSS rules it uses, light theme), stored by the profit worker (snapshot.js, p_snapshot) and
 *      opened without a login at profit/s.html?t=<token>. One brand per link. Managed in Agency settings, Shared links.
 * Presentation only: nothing here fetches data for a screen or changes a number. */
(() => {
  let H = null;                                          // host helpers (index.html shareHost())
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICN = n => window.icon ? window.icon(n, { size: 16 }) : '';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Pages whose cards get an Export menu: the v2 screens, the Daily Brief, Reports, P&L, Customers, Dashboards. */
  const SHARE_TABS = new Set(['overview', 'meta', 'campaigns', 'adcreative', 'google', 'gcampaigns', 'tiktok', 'channels', 'store', 'email', 'website', 'search', 'brief', 'reports', 'profit', 'customers', 'dash', 'yesterday', 'today']);
  /* Pages that read the period picker (dates on the picture come from it); the rest name their own window. */
  const RANGE = new Set(['gcampaigns', 'website', 'search', 'overview', 'profit', 'customers', 'email', 'google', 'tiktok', 'store', 'meta', 'campaigns', 'adcreative', 'channels']);

  /* ---------- 1. the address ---------- */
  const EXTRA = { tab: null, ad: null, camp: null };     // the open ad / campaign, for the page it was opened on
  let CARD = null, CARD_TAB = null;                      // #card=<id> from a link, until the reader leaves that page

  function readURL(qs) {
    if (!H) return;
    const S = H.S, g = k => qs.get(k), save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
    const page = g('page');
    if (page && /^[a-z]{2,20}$/.test(page)) { S.tab = page; save(H.LS.tab, page); }
    const brand = g('brand');
    if (brand && /^[\w-]{2,80}$/.test(brand)) { S.act = brand; save(H.LS.act, brand); }
    else if (page && !brand) { S.act = 'all'; save(H.LS.act, 'all'); }   // a view link with no brand is All clients
    const from = g('from'), to = g('to'), per = g('period'), ok = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
    if (ok(from) && ok(to)) S.range = { preset: 'custom', from: from <= to ? from : to, to: from <= to ? to : from };
    else if (per && H.PB.presets.some(p => p[0] === per && per !== 'custom')) S.range = { preset: per };
    if ((ok(from) && ok(to)) || per) save(H.LS.range, JSON.stringify(S.range));
    /* A view link leaves out the defaults (compare = the period before, attribution = last platform click), so on a
       view link a missing one means the default, never whatever this browser last picked. */
    const cmp = g('cmp') || (page ? 'prev' : null); if (['prev', 'yoy', 'none'].includes(cmp)) { S.cmp = cmp; save('pf_cmp', cmp); }
    const model = g('model') || (page ? 'lastPlatformClick' : null); if (model && H.MODELS.some(m => m[0] === model)) { S.model = model; save('pf_model', model); }
    const ad = g('ad'), camp = g('camp');
    if ((ad && /^[\w-]{3,40}$/.test(ad)) || (camp && /^[\w-]{3,40}$/.test(camp))) {
      window.V2PENDING = Object.assign({}, ad ? { ad } : {}, camp ? { campaign: camp } : {});
      Object.assign(EXTRA, { tab: S.tab, ad: ad || null, camp: camp || null });
    }
    readHash(S.tab);
  }
  function readHash(tab) {
    const m = /(?:^#|&)card=([\w-]{1,80})/.exec(location.hash || '');
    if (!m) return;
    CARD = m[1]; CARD_TAB = tab; waitForCard();
  }
  addEventListener('hashchange', () => { if (H && H.S.tok) readHash(H.S.tab); });

  function params(tab, extra = true) {
    const S = H.S, p = new URLSearchParams();
    p.set('page', tab);
    if (S.act && S.act !== 'all') p.set('brand', S.act);
    const r = S.range || { preset: '30' };
    if (r.preset === 'custom') { const rr = H.resolveRange(); p.set('from', rr.from); p.set('to', rr.to); } else p.set('period', r.preset);
    if (S.cmp && S.cmp !== 'prev') p.set('cmp', S.cmp);
    if (S.model && S.model !== 'lastPlatformClick') p.set('model', S.model);
    if (extra && EXTRA.tab === tab) { if (EXTRA.camp) p.set('camp', EXTRA.camp); if (EXTRA.ad) p.set('ad', EXTRA.ad); }
    return p;
  }
  function write() {
    if (!H || !H.S.tok) return;
    const tab = H.S.tab;
    const url = `${location.pathname}?${params(tab)}${CARD && CARD_TAB === tab ? `#card=${CARD}` : ''}`;
    if (url !== location.pathname + location.search + location.hash) { try { history.replaceState(null, '', url); } catch { /* sandboxed */ } }
  }
  /** show() calls this on every page change; a period, brand, compare or attribution change all go through show(). */
  function sync(tab) {
    if (!H) return;
    if (EXTRA.tab !== tab) Object.assign(EXTRA, { tab, ad: null, camp: null });
    if (CARD && CARD_TAB !== tab) { CARD = null; CARD_TAB = null; }
    write();
    schedule();
  }
  /** v2.js: an ad preview opened or closed, a campaign row opened or closed. */
  function setExtra(o) { if (!H) return; if (EXTRA.tab !== H.S.tab) Object.assign(EXTRA, { tab: H.S.tab, ad: null, camp: null }); Object.assign(EXTRA, o); write(); }
  const linkTo = id => `${location.origin}${location.pathname}?${params(H.S.tab, !id)}${id ? `#card=${encodeURIComponent(id)}` : ''}`;

  /* A deliberate link open may scroll (the one exception to "nothing scrolls the page on update"). The card is
     waited for (skeletons first, data later), scrolled to, ringed for two seconds, and put back in place once more
     if the page grew above it while loading, unless the reader has scrolled by then. */
  function waitForCard() {
    const id = CARD, t0 = Date.now();
    let moved = false; const mark = () => { moved = true; };
    ['wheel', 'touchmove', 'keydown'].forEach(ev => addEventListener(ev, mark, { once: true, passive: true }));
    const tick = () => {
      if (!H || CARD !== id || H.S.tab !== CARD_TAB) return;
      decorate();
      const el = document.querySelector(`#main [data-card="${CSS.escape(id)}"]`);
      if (el && !document.querySelector('#main.busy')) {
        reveal(el, true);
        setTimeout(() => { if (!moved && el.isConnected) reveal(el, false); }, 1100);
        return;
      }
      if (Date.now() - t0 < 25000) setTimeout(tick, 250);
    };
    setTimeout(tick, 200);
  }
  function reveal(el, ring) {
    el.scrollIntoView({ block: 'start', behavior: ring && !reduced() ? 'smooth' : 'auto' });
    if (ring) { el.classList.remove('lx-flash'); void el.offsetWidth; el.classList.add('lx-flash'); setTimeout(() => el.classList.remove('lx-flash'), 2600); }
  }

  /* ---------- 2. the Export menu on every card ---------- */
  const slug = s => String(s || '').toLowerCase().replace(/\d+/g, ' ').replace(/[^a-z]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'card';
  /** A card's header and title: `.v2h h3` (v2 cards), `.bf-top h3` (the brief), or a first-child h3 (older cards). */
  function headOf(card) {
    const pick = h => { const t = h && (h.tagName === 'H3' ? h : h.querySelector(':scope > h3')); const s = t && t.textContent.replace(/\s+/g, ' ').trim(); return s ? { h, title: s } : null; };
    return pick(card.querySelector(':scope > .v2h')) || pick(card.querySelector(':scope > .bf-top')) || pick(card.firstElementChild && card.firstElementChild.tagName === 'H3' ? card.firstElementChild : null);
  }
  const slackImg = () => window.logoSrc && window.logoSrc('slack') ? `<img src="${esc(window.logoSrc('slack'))}" width="16" height="16" alt="">` : ICN('send');
  const CARD_ITEMS = () => [
    ['copy', 'Copy as image', 'A picture of this card, for Slack, email or a deck', '', ICN('copy')],
    ['png', 'Download PNG', 'The same picture, as a file', '', ICN('download')],
    ['slack', 'Send to Slack', 'Into this brand’s internal or client channel', '', slackImg()],
    ['link', 'Copy link to this section', 'This page, these dates, scrolled to this card', '', ICN('link')],
    ['public', 'Share a public link', 'These numbers frozen as they are now; opens without a login', '', ICN('globe')],
  ];
  const PAGE_ITEMS = tiles => [
    ['page-link', 'Copy link to this page', 'This page with this brand, these dates, compare and attribution', '', ICN('link')],
    ...(tiles ? [['tiles-copy', 'Copy the headline numbers as image', 'The row of tiles at the top, as a picture', '', ICN('copy')],
      ['tiles-slack', 'Send the headline numbers to Slack', 'Into this brand’s internal or client channel', '', slackImg()]] : []),
    ['print', 'Print or save as PDF', 'The whole page on paper: light, no menus, cards kept whole', '', ICN('printer')],
    ['page-public', 'Share a public link to this page', 'The whole page frozen as it is now; opens without a login', '', ICN('globe')],
  ];
  function menu(label, items) {
    const box = document.createElement('div');
    box.className = 'hd-period pm lx-exp';
    box.innerHTML = H.PillMenu.inner(label, items, null, { icon: 'share' });
    return box;
  }

  let queued = false;
  function schedule() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; decorate(); }); }
  function decorate() {
    if (!H || !H.S.tok || !H.PillMenu) return;
    const main = document.getElementById('main'); if (!main) return;
    const sl = main.querySelector('#snapList:not([data-on])'); if (sl) { sl.dataset.on = '1'; links(sl); }
    const on = SHARE_TABS.has(H.S.tab);
    const seen = new Map();
    main.querySelectorAll('.v2card, .card').forEach(card => {
      if (!on || card.classList.contains('v2sk') || card.closest('.modal, .v2sk, .lx-shot') || (card.parentElement && card.parentElement.closest('.v2card, .card'))) return;
      const hd = headOf(card); if (!hd) return;
      let id = slug(hd.title); const n = (seen.get(id) || 0) + 1; seen.set(id, n); if (n > 1) id += '-' + n;
      if (card.dataset.card !== id) card.dataset.card = id;
      if (card.querySelector(':scope > .lx-exp')) return;
      const box = menu('Export', CARD_ITEMS());
      card.appendChild(box); hd.h.classList.add('lx-hx');
      H.PillMenu.wire(box, v => run(v, card));
    });
    if (!on) return;
    const tiles = [...main.querySelectorAll('.v2tiles:not(.v2sk)')];
    tiles.forEach((t, i) => { const id = i ? `headline-numbers-${i + 1}` : 'headline-numbers'; if (t.dataset.card !== id) t.dataset.card = id; });
    const ph = main.querySelector('.ph .ph-r');
    if (ph && !ph.querySelector('.lx-exp')) {
      const box = menu('Export this page', PAGE_ITEMS(tiles.length > 0));
      box.classList.add('lx-exp-page');
      ph.prepend(box);
      H.PillMenu.wire(box, v => run(v, v.startsWith('tiles') ? main.querySelector('[data-card="headline-numbers"]') : null));
    }
  }
  const mo = new MutationObserver(() => schedule());
  const watch = () => { const m = document.getElementById('main'); if (m) mo.observe(m, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();

  async function run(v, el) {
    try {
      if (v === 'link' || v === 'page-link') return copyText(linkTo(v === 'link' && el ? el.dataset.card : null), 'Link copied');
      if (v === 'print') return printNow();
      if (v === 'page-public') return publicModal(document.getElementById('main'), 'page');
      if (!el) return toast('There is nothing to export here yet.', true);
      const meta = metaOf(el);
      if (v === 'copy' || v === 'tiles-copy') return copyImage(el, meta);
      if (v === 'png') { const blob = await render(el, meta); download(blob, fileName(meta)); return toast('Downloaded'); }
      if (v === 'slack' || v === 'tiles-slack') return slackModal(el, meta);
      if (v === 'public') return publicModal(el, 'card');
    } catch (e) { console.error('[Locus share]', e); toast(e && e.message ? e.message : 'That did not work.', true); }
  }

  /* What the picture says about itself. */
  function rangeWords() {
    const r = H.resolveRange(), P = H.prettyDate, sameYear = r.from.slice(0, 4) === r.to.slice(0, 4);
    const span = (a, b, y) => a === b ? P(b, true) : `${P(a, !y)} to ${P(b, true)}`;
    const dates = r.preset === 'today' ? `Today so far, ${P(r.to, true)}` : span(r.from, r.to, sameYear);
    let cmp = '';
    if (H.S.cmp === 'prev' || !H.S.cmp) {
      const n = H.daySpan(r.from, r.to), f = H.parseYmd(r.from);
      const pt = new Date(f); pt.setDate(f.getDate() - 1); const pf = new Date(f); pf.setDate(f.getDate() - n);
      const a = H.ymd(pf), b = H.ymd(pt); cmp = `compared with ${span(a, b, a.slice(0, 4) === b.slice(0, 4))}`;
    } else if (H.S.cmp === 'yoy') {
      const y = d => `${+d.slice(0, 4) - 1}${d.slice(4)}`; cmp = `compared with ${span(y(r.from), y(r.to), sameYear)}`;
    }
    return { dates, cmp };
  }
  function metaOf(el) {
    const S = H.S, tab = S.tab;
    const a = S.act !== 'all' ? S.accounts.find(x => x.act_id === S.act) : null;
    const brand = a ? a.name : 'All clients';
    const hd = el.matches('.v2tiles') ? { title: 'Headline numbers' } : (headOf(el) || { title: H.TAB_TITLE[tab] || 'Locus' });
    const page = H.TAB_TITLE[tab] || '';
    const rw = RANGE.has(tab) ? rangeWords() : { dates: '', cmp: '' };
    const m = H.MODELS.find(x => x[0] === S.model);
    const attr = ['overview', 'meta', 'campaigns', 'adcreative', 'google', 'tiktok', 'channels'].includes(tab) && m ? `Attribution: ${m[0] === 'platform' ? '' : 'Triple Whale, '}${m[1].toLowerCase()}` : '';
    const r = RANGE.has(tab) ? H.resolveRange() : null;
    const span = r ? (r.from === r.to ? r.to : `${r.from} to ${r.to}`) : new Date().toISOString().slice(0, 10);
    return { brand, title: hd.title, page, dates: rw.dates, cmp: rw.cmp, attr, tab, span };
  }
  /* brand-card-dates.png, e.g. lucky-golf-spend-and-revenue-by-day-2026-09-09-to-2026-10-08.png */
  const fslug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const fileName = m => `${[m.brand, m.title, m.span].map(fslug).filter(Boolean).join('-').slice(0, 140).replace(/-+$/, '') || 'locus'}.png`;

  /* ---------- the picture ---------- */
  /* modern-screenshot, pinned (cdn.jsdelivr.net, UMD build, global `modernScreenshot`), loaded on first use. */
  const LIB = 'https://cdn.jsdelivr.net/npm/modern-screenshot@4.6.8/dist/index.js';
  let libP = null;
  const loadLib = () => libP || (libP = new Promise((res, rej) => {
    if (window.modernScreenshot) return res(window.modernScreenshot);
    const s = document.createElement('script'); s.src = LIB; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = () => window.modernScreenshot ? res(window.modernScreenshot) : rej(new Error('The image tool did not load.'));
    s.onerror = () => { libP = null; rej(new Error('The image tool could not load. Check the connection and try again.')); };
    document.head.appendChild(s);
  }));

  /* The light theme's tokens, read once from the page's own stylesheets, so the picture is light even in dark mode
     (Slack and email read best on white) without touching the page. */
  let LIGHT = null;
  function lightTokens() {
    if (LIGHT) return LIGHT;
    const out = {}, isLight = sel => sel.split(',').some(p => /^(:root|html)(\[[^\]]+\])*$/.test(p.trim()) && /\[data-theme="?light"?\]/.test(p));
    const walk = rules => {
      for (const r of rules) {
        if (r.type === 4) { if (matchMedia(r.media.mediaText).matches) walk(r.cssRules); continue; }   // @media
        if (r.type !== 1 || !isLight(r.selectorText || '')) continue;
        for (let i = 0; i < r.style.length; i++) { const k = r.style[i]; if (k.startsWith('--')) out[k] = r.style.getPropertyValue(k).trim(); }
      }
    };
    for (const sh of document.styleSheets) { let rules = null; try { rules = sh.cssRules; } catch { /* another origin */ } if (rules) walk(rules); }
    LIGHT = out; return out;
  }

  function frame(el, meta) {
    const tables = [...el.querySelectorAll('table')].map(t => t.scrollWidth + 44);
    const w = Math.round(Math.min(1600, Math.max(360, el.getBoundingClientRect().width, ...tables)));
    const host = document.createElement('div');
    host.className = 'lx-shot-host'; host.setAttribute('aria-hidden', 'true');
    const fr = document.createElement('div');
    fr.className = 'lx-shot';
    const L = lightTokens();
    for (const [k, v] of Object.entries(L)) fr.style.setProperty(k, v);
    fr.style.colorScheme = 'light';
    fr.style.width = `${w + 64}px`;
    const mark = new URL('../brand/mobius-mark.webp', location.href).href;
    /* 2026-10-09 (Cole: "the logo is squished"): the mark is 2000 x 1294, so it is drawn 20 x 13 (its own shape), never
       in a square. Head = the page as a small label over the brand, the dates on the right (the card carries its own title); foot = a
       hairline, the mark, "Locus by Mobius Digital", and the attribution. A thin line in the mark's colours on top. */
    const crumb = meta.page || meta.title || 'Locus', big = meta.brand || meta.title;
    fr.innerHTML = `<div class="lx-shot-h"><div class="l"><small>${esc(crumb)}</small><b>${esc(big)}</b></div>
      ${meta.dates ? `<div class="r"><small>Dates</small><b>${esc(meta.dates)}</b>${meta.cmp ? `<span>${esc(meta.cmp)}</span>` : ''}</div>` : ''}</div>
      <div class="lx-shot-b"></div>
      <div class="lx-shot-f"><span class="l"><img src="${esc(mark)}" width="20" height="13" alt=""><span><b>Locus</b> <span class="by">by Mobius Digital</span></span></span>${meta.attr ? `<span class="r">${esc(meta.attr)}</span>` : ''}</div>`;
    const c = el.cloneNode(true);
    c.querySelectorAll('.lx-exp, .v2tip, .v2pick, .v2tbar, .v2rm').forEach(x => x.remove());
    c.classList.remove('lx-flash', 'lx-more', 'busy');
    c.querySelectorAll('.lx-more').forEach(x => x.classList.remove('lx-more'));
    /* Ids are made unique so a chart's gradient in the copy points at its own copy, not the dark-themed original. */
    const ids = new Map();
    c.querySelectorAll('[id]').forEach(x => { const n = `${x.id}-lxs`; ids.set(x.id, n); x.id = n; });
    if (ids.size) c.querySelectorAll('*').forEach(x => {
      for (const at of ['fill', 'stroke', 'clip-path', 'mask', 'filter', 'href', 'xlink:href', 'style']) {
        const v = x.getAttribute(at); if (!v || !v.includes('#')) continue;
        const nv = v.replace(/url\(#([^)]+)\)/g, (m, id) => ids.has(id) ? `url(#${ids.get(id)})` : m).replace(/^#(.+)$/, (m, id) => ids.has(id) && at.includes('href') ? `#${ids.get(id)}` : m);
        if (nv !== v) x.setAttribute(at, nv);
      }
    });
    c.style.width = `${w}px`; c.style.maxWidth = 'none'; c.style.margin = '0';
    fr.querySelector('.lx-shot-b').appendChild(c);
    host.appendChild(fr);
    return { host, fr };
  }
  async function render(el, meta) {
    const lib = await loadLib();
    const { host, fr } = frame(el, meta);
    document.body.appendChild(host);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await Promise.all([...fr.querySelectorAll('img')].map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })));
      const blob = await lib.domToBlob(fr, { scale: 2, type: 'image/png', backgroundColor: lightTokens()['--bg'] || '#F7F7F8', timeout: 15000 });
      if (!blob) throw new Error('The picture came out empty.');
      return blob;
    } finally { host.remove(); }
  }
  function copyImage(el, meta) {
    if (!navigator.clipboard || !window.ClipboardItem) {
      return render(el, meta).then(b => { download(b, fileName(meta)); toast('This browser cannot copy pictures, so it downloaded instead'); });
    }
    toast('Making the picture…', false, 1400);
    const p = render(el, meta);
    /* The promise goes straight into the ClipboardItem so Safari still counts it as part of the click. */
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': p })]).then(() => toast('Copied'), async e => {
      try { const b = await p; download(b, fileName(meta)); toast('Could not copy here, so it downloaded instead'); }
      catch (e2) { toast((e2 && e2.message) || (e && e.message) || 'That did not work.', true); }
    });
  }
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function copyText(t, ok) {
    try { await navigator.clipboard.writeText(t); toast(ok); }
    catch { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(ok); } catch { toast('Could not copy. The link is in the address bar.', true); } ta.remove(); }
  }
  function toast(msg, bad, ms) {
    document.querySelectorAll('.lx-toast.lx-sh').forEach(x => x.remove());
    const t = document.createElement('div'); t.className = 'lx-toast lx-sh' + (bad ? ' bad' : ''); t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), ms || (bad ? 4200 : 2400));
  }

  /* ---------- Send to Slack ---------- */
  const blobB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('Could not read the picture.')); r.readAsDataURL(b); });
  function slackModal(el, meta) {
    const S = H.S;
    const w = document.createElement('div'); w.className = 'modal-wrap';
    const closeW = () => { w.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') closeW(); };
    document.addEventListener('keydown', key);
    w.addEventListener('mousedown', e => { if (e.target === w) closeW(); });
    if (S.act === 'all') {
      w.innerHTML = `<div class="modal lx-sl"><h3>Send to Slack</h3><p class="hint">A picture goes into one brand’s own channel. Pick the brand at the top first (this view is All clients).</p><div class="row lx-sl-a"><button class="btn primary" data-m="no">OK</button></div></div>`;
      document.body.appendChild(w); w.querySelector('[data-m="no"]').onclick = closeW; return;
    }
    w.innerHTML = `<div class="modal lx-sl" role="dialog" aria-label="Send to Slack"><h3>Send to Slack</h3>
      <p class="hint">This picture goes into <b>${esc(meta.brand)}</b>’s own Slack channel, posted by the Locus app.</p>
      <div class="lx-sl-prev"><span class="hint">Making the picture…</span></div>
      <div class="lx-sl-ch" role="radiogroup" aria-label="Channel"><p class="hint">Looking up the channels…</p></div>
      <p class="lx-sl-warn" hidden>The client will see this. It posts in their channel the moment you press Send.</p>
      <label class="lx-sl-t"><span>Add a line (optional)</span><input type="text" maxlength="500" placeholder="What should they notice?"></label>
      <div class="row lx-sl-a"><span class="lx-sl-msg hint"></span><button class="btn" data-m="no">Cancel</button><button class="btn primary" data-m="yes" disabled>Send</button></div></div>`;
    document.body.appendChild(w);
    const q = s => w.querySelector(s), send = q('[data-m="yes"]'), msg = q('.lx-sl-msg');
    q('[data-m="no"]').onclick = closeW;
    let blob = null, chans = null;
    const ready = () => { send.disabled = !(blob && chans && (chans.internal || chans.client)); };
    const pick = () => { const v = (w.querySelector('input[name="lxch"]:checked') || {}).value; q('.lx-sl-warn').hidden = v !== 'client'; send.textContent = v === 'client' ? 'Send to the client' : 'Send'; send.classList.toggle('warn', v === 'client'); };
    render(el, meta).then(b => { blob = b; const u = URL.createObjectURL(b); q('.lx-sl-prev').innerHTML = `<img src="${u}" alt="The picture that will be sent">`; ready(); })
      .catch(e => { q('.lx-sl-prev').innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; });
    H.apiAH(`/api/share/slack?act=${encodeURIComponent(S.act)}`).then(d => {
      chans = d;
      const row = (k, c, label, who) => c ? `<label class="lx-opt${k === 'client' ? ' cl' : ''}"><input type="radio" name="lxch" value="${k}"${k === 'internal' ? ' checked' : ''}><span><b>${label}</b><small>${c.name ? '#' + esc(c.name) : 'channel ' + esc(c.id)} · ${who}</small></span></label>`
        : `<div class="lx-opt off"><span><b>${label}</b><small>None set for ${esc(meta.brand)}. Set it in Brand settings, Slack and sending.</small></span></div>`;
      q('.lx-sl-ch').innerHTML = row('internal', d.internal, 'Internal channel', 'only the team') + row('client', d.client, 'Client channel', 'the client will see this');
      if (!d.internal && d.client) { const c = w.querySelector('input[value="client"]'); if (c) c.checked = true; }
      w.querySelectorAll('input[name="lxch"]').forEach(r => r.onchange = pick); pick(); ready();
    }).catch(e => { q('.lx-sl-ch').innerHTML = `<p class="v2bad">${esc(e.message === 'unauthorized' ? 'Slack sends need a team sign-in.' : e.message)}</p>`; });
    send.onclick = async () => {
      const to = (w.querySelector('input[name="lxch"]:checked') || {}).value;
      if (!to || !blob) return;
      send.disabled = true; msg.textContent = 'Sending…';
      try {
        const r = await H.apiAH('/api/share/slack', { method: 'POST', body: JSON.stringify({
          act: S.act, to, text: q('.lx-sl-t input').value.trim(), title: meta.title, page: meta.page, dates: [meta.dates, meta.cmp].filter(Boolean).join(', '),
          link: linkTo(el.dataset.card), filename: fileName(meta), png: await blobB64(blob) }) });
        closeW(); toast(`Sent to ${r.name ? '#' + r.name : to === 'client' ? 'the client channel' : 'the internal channel'}`);
      } catch (e) { msg.textContent = e.message; send.disabled = false; }
    };
  }

  /* ---------- 3. print or save as PDF ---------- */
  function printHead() {
    document.querySelectorAll('.lx-print-h').forEach(x => x.remove());
    const main = document.getElementById('main'); if (!main || !H || !H.S.tok) return;
    const S = H.S, a = S.act !== 'all' ? S.accounts.find(x => x.act_id === S.act) : null;
    const rw = RANGE.has(S.tab) ? rangeWords() : { dates: '', cmp: '' };
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    main.insertAdjacentHTML('afterbegin', `<div class="lx-print-h"><div><b>${esc(H.TAB_TITLE[S.tab] || 'Locus')}</b><span>${esc(a ? a.name : 'All clients')}</span></div>
      <div class="r">${rw.dates ? `<b>${esc(rw.dates)}</b>` : ''}${rw.cmp ? `<span>${esc(rw.cmp)}</span>` : ''}<span>Printed ${esc(today)} · Locus by Mobius Digital</span></div></div>`);
  }
  let THEME = null;
  addEventListener('beforeprint', () => { const d = document.documentElement; if (d.dataset.theme !== 'light') { THEME = d.dataset.theme; d.dataset.theme = 'light'; } printHead(); });
  addEventListener('afterprint', () => { if (THEME) document.documentElement.dataset.theme = THEME; THEME = null; document.querySelectorAll('.lx-print-h').forEach(x => x.remove()); });
  function printNow() { document.querySelectorAll('.hd-period.open').forEach(p => p.classList.remove('open')); setTimeout(() => window.print(), 60); }

  /* ---------- 4. public snapshot links ---------- */
  /* What never goes on a public link: menus, controls, skeletons, scripts and anything that plays or takes input. */
  const DROP = '.lx-exp, .v2tip, .v2pick, .v2tbar, .v2rm, .v2cols, .ph-r, .v2sk, .lx-print-h, #snapList, script, noscript, template, iframe, object, embed, input, select, textarea, form, audio';
  const splitSel = s => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(' || ch === '[') d++; else if (ch === ')' || ch === ']') d--; if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur); return out.map(x => x.trim()); };
  const PSEUDO = /::?(before|after|placeholder|marker|selection|first-line|first-letter|backdrop|file-selector-button|-webkit-[\w-]+|-moz-[\w-]+)(\([^)]*\))?|:(hover|focus-visible|focus-within|focus|active|visited|link|target)\b/gi;
  /* The public page draws the snapshot inside a shadow root, where html, body and :root do not exist: they become the
     two wrapper divs the snapshot carries (.lxs-html holds data-ui / data-theme, .lxs-body the body's classes). */
  const reroot = sel => sel.replace(/:root\b/g, '.lxs-html').replace(/(^|[\s,>+~(])html(?=[\s.#[:>+~,)]|$)/g, '$1.lxs-html').replace(/(^|[\s,>+~(])body(?=[\s.#[:>+~,)]|$)/g, '$1.lxs-body');
  /** Only the CSS rules this element (or anything above it) uses, read while the page is switched to the light theme. */
  function usedCss(el) {
    const anc = []; for (let p = el.parentElement; p; p = p.parentElement) anc.push(p);
    const hit = sel => { if (!sel) return false; try { return el.matches(sel) || !!el.querySelector(sel) || anc.some(a => a.matches(sel)); } catch { return false; } };
    const keep = part => hit(part) || hit(part.replace(PSEUDO, '').trim() || '*');
    const walk = (rules, into) => {
      for (const r of rules) {
        if (r.type === 1) {
          const parts = splitSel(r.selectorText || ''); if (!parts.some(keep)) continue;
          const txt = r.cssText, st = r.selectorText;
          into.push(txt.startsWith(st) ? reroot(parts.join(', ')) + txt.slice(st.length) : txt);
        } else if (r.type === 4 || r.type === 12) {                       // @media, @supports: keep the rules inside that apply
          const inner = []; walk(r.cssRules, inner);
          if (inner.length) into.push(`@${r.type === 4 ? 'media' : 'supports'} ${r.type === 4 ? r.media.mediaText : r.conditionText}{${inner.join('\n')}}`);
        } else if (r.type === 5 || r.type === 7) into.push(r.cssText);    // @font-face, @keyframes
      }
    };
    const out = [];
    for (const sh of document.styleSheets) { let rules = null; try { rules = sh.cssRules; } catch { /* another origin (fonts) */ } if (rules) walk(rules, out); }
    return out.join('\n');
  }
  /** The card or page frozen: markup with every number in it, the CSS it uses, the icons it points at. */
  function freeze(el) {
    const d = document.documentElement;
    const chain = []; for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) chain.unshift({ t: /^[a-z][a-z0-9]*$/.test(p.tagName.toLowerCase()) ? p.tagName.toLowerCase() : 'div', id: p.id || '', c: typeof p.className === 'string' ? p.className : '' });
    const c = el.cloneNode(true);
    const lc = [...el.querySelectorAll('canvas')];
    [...c.querySelectorAll('canvas')].forEach((x, i) => { try { const img = document.createElement('img'); img.src = lc[i].toDataURL('image/png'); img.style.cssText = `width:${lc[i].clientWidth}px;max-width:100%;height:auto`; x.replaceWith(img); } catch { x.remove(); } });
    c.querySelectorAll('video').forEach(v => { if (v.poster) { const img = document.createElement('img'); img.src = v.poster; img.className = v.className; v.replaceWith(img); } else v.remove(); });
    c.querySelectorAll(DROP).forEach(x => x.remove());
    c.classList.remove('lx-flash', 'busy', 'lx-more');
    [c, ...c.querySelectorAll('*')].forEach(x => {
      for (const a of [...x.attributes]) {
        const n = a.name.toLowerCase(), v = a.value;
        if (/^on/.test(n) || n === 'contenteditable' || n === 'tabindex' || n === 'draggable' || n === 'srcdoc') x.removeAttribute(a.name);
        else if (n === 'href' && x.tagName === 'A') x.removeAttribute(a.name);       // nothing on the public page links back into Locus
        else if (['src', 'href', 'xlink:href', 'poster'].includes(n) && v && !v.startsWith('#') && !v.startsWith('data:image/')) {
          if (/^(blob:|javascript:|data:)/i.test(v)) x.removeAttribute(a.name); else { try { x.setAttribute(a.name, new URL(v, location.href).href); } catch { x.removeAttribute(a.name); } }
        }
      }
    });
    const need = new Set();
    c.querySelectorAll('use').forEach(u => { const h = u.getAttribute('href') || u.getAttribute('xlink:href') || ''; if (h.startsWith('#')) need.add(h.slice(1)); });
    const defs = [...need].map(id => { const s = document.getElementById(id); return s && !c.querySelector(`#${CSS.escape(id)}`) ? s.outerHTML : ''; }).join('');
    const prev = d.dataset.theme; d.dataset.theme = 'light';
    let css; try { css = usedCss(el); } finally { d.dataset.theme = prev; }
    const open = chain.map(w => `<${w.t}${w.id ? ` id="${esc(w.id)}"` : ''} class="${esc(w.c)} lxs-w">`).join('');
    const close = chain.slice().reverse().map(w => `</${w.t}>`).join('');
    const body = (document.body.className || '').replace(/\b(nav-open|modal-open)\b/g, '').trim();
    const html = `<div class="lxs-html" data-ui="${esc(d.dataset.ui || '')}" data-app="${esc(d.dataset.app || '')}" data-theme="light"><div class="lxs-body ${esc(body)}">`
      + (defs ? `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${defs}</defs></svg>` : '')
      + open + c.outerHTML + close + '</div></div>';
    return { html, css, root: { ui: d.dataset.ui || '', app: d.dataset.app || '', body } };
  }
  const shareUrl = t => new URL(`s.html?t=${t}`, location.href).href;
  const whenWords = iso => { if (!iso) return 'Never expires'; const dt = new Date(String(iso).replace(' ', 'T') + 'Z'); return `Expires ${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`; };

  function publicModal(el, kind) {
    const S = H.S;
    if (!el) { toast('There is nothing to share here yet.', true); return; }
    const w = document.createElement('div'); w.className = 'modal-wrap';
    const closeW = () => { w.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') closeW(); };
    document.addEventListener('keydown', key);
    w.addEventListener('mousedown', e => { if (e.target === w) closeW(); });
    if (S.act === 'all') {
      w.innerHTML = `<div class="modal lx-sl"><h3>Share a public link</h3><p class="hint">A public link shows one brand only. Pick the brand at the top first (this view is All clients).</p><div class="row lx-sl-a"><button class="btn primary" data-m="no">OK</button></div></div>`;
      document.body.appendChild(w); w.querySelector('[data-m="no"]').onclick = closeW; return;
    }
    const meta = metaOf(el); if (kind === 'page') meta.title = meta.page || meta.title;
    w.innerHTML = `<div class="modal lx-sl" role="dialog" aria-label="Share a public link"><h3>Share a public link</h3>
      <p class="hint">Freezes <b>${esc(meta.title)}</b> for <b>${esc(meta.brand)}</b> exactly as it is on screen now${meta.dates ? `, ${esc(meta.dates)}` : ''}. The link opens without signing in to Locus and never updates.</p>
      <div class="lx-sl-ch" role="radiogroup" aria-label="How long the link works">
        <label class="lx-opt"><input type="radio" name="lxexp" value="7"><span><b>7 days</b><small>For a quick look</small></span></label>
        <label class="lx-opt"><input type="radio" name="lxexp" value="30" checked><span><b>30 days</b><small>The usual</small></span></label>
        <label class="lx-opt"><input type="radio" name="lxexp" value="0"><span><b>Never expires</b><small>Until you turn it off in Agency settings, Shared links</small></span></label>
      </div>
      <p class="lx-sl-warn">Anyone with this link can see these numbers as they are now.</p>
      <div class="row lx-sl-a"><span class="lx-sl-msg hint"></span><button class="btn" data-m="no">Cancel</button><button class="btn primary" data-m="yes">Make the link</button></div></div>`;
    document.body.appendChild(w);
    const q = s => w.querySelector(s), go = q('[data-m="yes"]'), msg = q('.lx-sl-msg');
    q('[data-m="no"]').onclick = closeW;
    go.onclick = async () => {
      go.disabled = true; msg.textContent = 'Freezing the numbers…';
      try {
        const f = freeze(el);
        const r = await H.api('/api/snapshot', { method: 'POST', body: JSON.stringify({
          act: S.act, kind, title: meta.title, page: meta.page, dates: meta.dates, cmp: meta.cmp, attr: meta.attr,
          days: +((w.querySelector('input[name="lxexp"]:checked') || {}).value || 30), html: f.html, css: f.css, root: f.root }) });
        const url = shareUrl(r.token);
        q('.modal').innerHTML = `<h3>Your public link</h3>
          <p class="hint"><b>${esc(meta.title)}</b> for <b>${esc(r.brand || meta.brand)}</b>, frozen now. ${esc(whenWords(r.expires_at))}.</p>
          <div class="lx-pl"><input type="text" readonly value="${esc(url)}" aria-label="The public link"><button class="btn primary" data-m="copy">Copy</button></div>
          <p class="lx-sl-warn">Anyone with this link can see these numbers as they are now.</p>
          <p class="hint">See who opened it, or turn it off, in Agency settings, Shared links.</p>
          <div class="row lx-sl-a"><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Open it</a><button class="btn primary" data-m="no">Done</button></div>`;
        q('[data-m="no"]').onclick = closeW;
        const inp = q('.lx-pl input'); inp.onfocus = () => inp.select();
        q('[data-m="copy"]').onclick = () => copyText(url, 'Link copied');
        copyText(url, 'Link made and copied');
      } catch (e) { msg.textContent = e.message || 'That did not work.'; go.disabled = false; }
    };
  }

  /** Agency settings > Shared links: every public link, who made it, views, expiry, Copy and Turn off. */
  async function links(host) {
    host.innerHTML = '<div class="card"><span class="hint">Loading the shared links…</span></div>';
    let d; try { d = await H.api('/api/snapshots', { fresh: true }); } catch (e) { host.innerHTML = `<div class="card"><p class="v2bad">${esc(e.message)}</p></div>`; return; }
    const rows = d.links || [];
    const dt = iso => iso ? new Date(String(iso).replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const state = r => r.revoked ? '<span class="lx-st off">Turned off</span>' : !r.live ? '<span class="lx-st off">Expired</span>' : `<span class="lx-st on">Live</span><small>${esc(whenWords(r.expires_at))}</small>`;
    host.innerHTML = `<div class="card set-card lx-links"><h3>Shared links</h3>
      <p class="hint set-why">Every public link made from an Export menu. Each one shows one brand's numbers frozen on the day it was made, and opens without a login. Turn one off and it stops working at once.</p>
      ${rows.length ? `<div class="tbl-wrap"><table class="lx-lt"><thead><tr><th>What</th><th>Brand</th><th>Made by</th><th>Made</th><th class="n">Views</th><th>State</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr data-t="${esc(r.token)}"${r.live ? '' : ' class="dead"'}><td><b>${esc(r.title)}</b><small>${esc(r.kind === 'page' ? 'Whole page' : r.page ? `Card on ${r.page}` : 'Card')}</small></td><td>${esc(r.brand || '')}</td><td>${esc(String(r.created_by || '').split('@')[0])}</td><td>${esc(dt(r.created_at))}</td>
        <td class="n">${r.views || 0}${r.last_view ? `<small>last ${esc(dt(r.last_view))}</small>` : ''}</td><td>${state(r)}</td>
        <td class="a">${r.live ? `<button class="btn sm" data-a="copy">Copy</button><a class="btn sm" href="${esc(shareUrl(r.token))}" target="_blank" rel="noopener">Open</a><button class="btn sm" data-a="off">Turn off</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="hint">No public links yet. Make one from the Export menu on any card or page: Share a public link.</p>'}</div>`;
    host.querySelectorAll('tr[data-t]').forEach(tr => {
      const t = tr.dataset.t;
      const cp = tr.querySelector('[data-a="copy"]'); if (cp) cp.onclick = () => copyText(shareUrl(t), 'Link copied');
      const off = tr.querySelector('[data-a="off"]');
      if (off) off.onclick = async () => {
        if (!(await H.confirmModal('Turn off this link?', 'Anyone who opens it from now on sees "This link has expired or was turned off". This cannot be undone; make a new link to share it again.', 'Turn it off'))) return;
        try { await H.api('/api/snapshot/revoke', { method: 'POST', body: JSON.stringify({ token: t }) }); toast('Turned off'); links(host); }
        catch (e) { toast(e.message, true); }
      };
    });
  }

  window.LocusShare = {
    init(h) { H = h; },
    readURL, sync, setExtra, decorate,
    link: id => (H ? linkTo(id) : location.href),
    /* the picture of one card as a PNG blob (used to check the frame by eye) */
    picture: el => render(el, metaOf(el)),
    /* the frozen payload a public link would carry (to check it by eye) */
    freeze: el => freeze(el || document.getElementById('main')),
    links,
  };
})();
