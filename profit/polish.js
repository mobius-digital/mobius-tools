/* Locus polish (2026-10-09, profit/DESIGN.md section 10). Presentation only: nothing here routes, fetches
   or decides what a screen shows. It watches #main and the chrome and adds the small things:
     1. skeletons in place of every "Loading…" line (shaped like the page, a block or a line)
     2. a count-up on headline tile numbers, the first time each tile is seen (never on a re-render)
     3. sliding active indicators on the page tabs (#v2seg), the job pills, the rail and every segmented control
     4. the top bar's blur and hairline once the page scrolls
     5. sticky table headers where a table fits its card, and an icon on the common column headers
     6. one error pattern (icon, one line, the detail, Try again) for a bare error string
   Respects prefers-reduced-motion: no count-up, no sliding, instant swaps. Safe to remove: the app
   renders the same without it. */
(function () {
  'use strict';
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ico = (n, s = 16) => `<svg class="ic" width="${s}" height="${s}" aria-hidden="true"><use href="#i-${n}"/></svg>`;

  /* ---------- 1. skeletons ---------- */
  const sk = (w, h, extra = '') => `<span class="ds-sk" style="width:${w};height:${h}px${extra}"></span>`;
  const skTiles = n => `<div class="lx-sk-tiles">${Array.from({ length: n }, (_, i) => `<div class="lx-sk-tile">${sk('46%', 11)}${sk(i ? '58%' : '70%', 24, ';margin-top:12px')}${sk('80%', 10, ';margin-top:12px')}${sk('100%', 30, ';margin-top:auto;border-radius:6px')}</div>`).join('')}</div>`;
  const skRows = n => Array.from({ length: n }, (_, i) => `<div class="lx-sk-row">${sk(28 + (i * 7) % 22 + '%', 12)}${sk('12%', 12)}${sk('10%', 12)}${sk('9%', 12)}</div>`).join('');
  const skTable = (n = 5) => `<div class="lx-sk-card">${sk('22%', 14)}${sk('46%', 11, ';margin:10px 0 18px')}<div class="lx-sk-th">${sk('14%', 9)}${sk('8%', 9)}${sk('8%', 9)}${sk('8%', 9)}</div>${skRows(n)}</div>`;
  const skChart = () => `<div class="lx-sk-card">${sk('28%', 14)}${sk('52%', 11, ';margin:10px 0 18px')}<div class="lx-sk-chart"><svg viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 92 C40 80 60 96 100 70 S170 40 210 58 S290 30 330 44 S380 26 400 34 V120 H0Z"/></svg></div></div>`;
  const skPage = () => `${skTiles(4)}<div class="lx-sk-two">${skChart()}${skTable(4)}</div>${skTable(6)}`;
  const skLines = n => `<span class="lx-sk-lines">${Array.from({ length: n }, (_, i) => sk(i === n - 1 ? '55%' : (88 - i * 9) + '%', 11)).join('')}</span>`;

  const LOAD_RE = /^(Loading|Pulling|The .{2,30} is looking)/;
  const isCard = el => el && el.classList && (el.classList.contains('card') || el.classList.contains('v2card'));
  function skeletons(root) {
    /* a table cell still waiting for its number ("…") shimmers instead */
    root.querySelectorAll('td[data-pl], td.lx-wait').forEach(td => {
      if (td.__lxSk || td.children.length) return;
      const t = (td.textContent || '').trim(); if (t !== '…' && t !== '...') return;
      td.__lxSk = 1; td.innerHTML = `<span class="ds-sk" style="display:inline-block;width:72px;height:10px;vertical-align:middle"></span><span class="sr-only">Loading</span>`;
    });
    root.querySelectorAll('.hint, .v2hint, .tiny').forEach(h => {
      if (h.__lxSk || h.children.length) return;
      const txt = (h.textContent || '').trim();
      if (!LOAD_RE.test(txt) || txt.length > 90) return;
      h.__lxSk = 1;
      const card = h.parentElement;
      const lone = isCard(card) && card.children.length === 1;
      const pageLevel = lone && card.parentElement && (card.parentElement.id === 'main' || (card.parentElement.parentElement && card.parentElement.parentElement.id === 'main'));
      if (pageLevel && !card.id) {
        const w = document.createElement('div');
        w.className = 'lx-sk-page'; w.setAttribute('aria-busy', 'true'); w.setAttribute('role', 'status');
        w.innerHTML = `<span class="sr-only">${txt}</span>${skPage()}`;
        card.replaceWith(w);
      } else if (lone) {
        card.setAttribute('aria-busy', 'true');
        h.classList.add('lx-sk-host');
        h.innerHTML = `<span class="sr-only">${txt}</span>${skLines(3)}`;
      } else {
        h.classList.add('lx-sk-host', 'inline');
        h.innerHTML = `<span class="sr-only">${txt}</span>${sk('min(220px,80%)', 11)}`;
      }
    });
  }

  /* ---------- 2. count-up on headline tiles ---------- */
  const seenTiles = new Set();
  const NUM_RE = /^([^\d\-]*)(-?[\d,]*\.?\d+)(.*)$/;
  function countUp(root) {
    root.querySelectorAll('.v2tile .v').forEach(v => {
      if (v.__lxCu) return; v.__lxCu = 1;
      const tile = v.closest('.v2tile');
      const key = (tile.querySelector('.l')?.textContent || '').trim();
      if (!key || seenTiles.has(key)) return;
      seenTiles.add(key);
      if (RM) return;
      const tn = [...v.childNodes].find(n => n.nodeType === 3 && /\d/.test(n.nodeValue));
      if (!tn) return;
      const m = tn.nodeValue.match(NUM_RE); if (!m) return;
      const raw = m[2].replace(/,/g, ''), to = parseFloat(raw); if (!isFinite(to) || to === 0) return;
      const dec = (raw.split('.')[1] || '').length, comma = m[2].includes(',');
      const fmt = x => { let s = x.toFixed(dec); if (comma) { const [a, b] = s.split('.'); s = a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b ? '.' + b : ''); } return m[1] + s + m[3]; };
      const final = tn.nodeValue, t0 = performance.now(), D = 650;
      v.style.minWidth = v.offsetWidth + 'px';
      const step = now => {
        if (!tn.isConnected) return;
        const p = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - p, 4);
        tn.nodeValue = p < 1 ? fmt(to * e) : final;
        if (p < 1) requestAnimationFrame(step); else v.style.minWidth = '';
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------- 3. sliding indicators ---------- */
  const last = {};
  function slide(box, key, btnSel, kind) {
    if (!box || box.offsetParent === null) return;
    const on = box.querySelector(btnSel);
    let ink = box.querySelector(':scope > .lx-ink');
    if (!ink) { ink = document.createElement('i'); ink.className = 'lx-ink ' + kind; ink.setAttribute('aria-hidden', 'true'); box.prepend(ink); box.classList.add('lx-has-ink'); }
    if (!on || on.offsetParent === null) { ink.style.opacity = '0'; return; }
    const r = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
    const prev = last[key];
    const put = (q) => { ink.style.transform = `translate(${q.x}px,${kind === 'line' ? 0 : q.y}px)`; ink.style.width = q.w + 'px'; if (kind !== 'line') ink.style.height = q.h + 'px'; };
    const fresh = !ink.__placed;
    if (fresh && prev && !RM) { ink.style.transition = 'none'; put(prev); ink.getBoundingClientRect(); ink.style.transition = ''; }
    else if (fresh) { ink.style.transition = 'none'; put(r); ink.getBoundingClientRect(); ink.style.transition = ''; }
    ink.__placed = 1; ink.style.opacity = '1';
    put(r); last[key] = r;
  }
  function slideAll() {
    const seg = document.getElementById('v2seg');
    if (seg && !seg.hidden) {
      slide(seg.querySelector('.v2tabs'), 'seg', ':scope > button.on', 'line');
      slide(seg.querySelector('.v2jobs'), 'jobs', ':scope > button.on', 'pill');
    }
    document.querySelectorAll('#tabs .v2nav .grp-btns').forEach((g, i) => slide(g, 'rail' + i, ':scope > button[data-t].on, :scope > button[data-t].sec', 'pill'));
    document.querySelectorAll('.v2theme, .ds-seg, .side-role .seg').forEach((s, i) => slide(s, 'seg' + i + (s.className || ''), ':scope > button.on', 'pill'));
  }

  /* ---------- 5. tables ---------- */
  /* An icon per column header (Trendtrack's tables), only when most of a table's headers have one:
     a row where half the columns carry an icon reads as unfinished. */
  const TH_ICON = [[/^(ad )?spend\b/i, 'dollar'], [/^(kept|contribution|profit|margin)/i, 'dollar'], [/^(revenue|sales|email revenue|klaviyo revenue)\b/i, 'trending-up'], [/^(purchases|orders|new orders)\b/i, 'cart'],
    [/^(roas|mer|amer|share|flows share|share of)/i, 'percent'], [/^(cpa|cost per|goal cpa|cac)/i, 'target'], [/^(ctr|click)/i, 'mouse-pointer'], [/^(cpm|impressions|open)/i, 'eye'],
    [/^(hook|hold)\b/i, 'play-circle'], [/^(brand|client|store|shop)$/i, 'store'], [/^campaigns?\b/i, 'send'], [/^(flows?|live flows)\b/i, 'zap'], [/^aov\b/i, 'receipt'],
    [/^(new )?customers\b/i, 'users'], [/^sessions\b/i, 'activity'], [/^frequency\b/i, 'refresh'], [/^(ad|ad set|campaign|name)$/i, 'layers']];
  /* a table that fits gets a sticky head; one that scrolls sideways fades at the edge that has more */
  function fitCheck(t) {
    const fits = t.scrollWidth <= t.clientWidth + 1;
    t.classList.toggle('lx-fits', fits);
    t.classList.toggle('lx-more', !fits && t.scrollLeft + t.clientWidth < t.scrollWidth - 2);
  }
  function tables(root) {
    root.querySelectorAll('.v2tbl').forEach(t => {
      fitCheck(t);
      if (t.__lxTh) return; t.__lxTh = 1;
      t.addEventListener('scroll', () => fitCheck(t), { passive: true });
      const ths = [...t.querySelectorAll('thead th, tr:first-child > th')].filter(th => (th.textContent || '').trim());
      if (!ths.length || ths.some(th => th.querySelector('svg'))) return;
      const hits = ths.map(th => { const txt = th.textContent.trim(); return txt.length <= 26 && th.children.length <= 1 ? TH_ICON.find(([re]) => re.test(txt)) : null; });
      if (hits.filter(Boolean).length < Math.ceil(ths.length * 0.6)) return;
      ths.forEach((th, i) => { if (hits[i]) th.insertAdjacentHTML('afterbegin', `<svg class="ic lx-thi" aria-hidden="true"><use href="#i-${hits[i][1]}"/></svg>`); });
    });
  }

  /* ---------- 6. errors ---------- */
  function currentTab() {
    const s = document.querySelector('#v2seg .v2jobs button.on[data-nav]') || document.querySelector('#v2seg .v2tabs button.on[data-nav]');
    if (s) return s.dataset.nav;
    const r = document.querySelector('#tabs button[data-t].on, .v2settings.on[data-t]');
    return r ? r.dataset.t : null;
  }
  const human = m => /unauthori[sz]ed|401|403|forbidden/i.test(m) ? 'Locus is not allowed to read this yet. Sign in again, or check the connection in Settings.'
    : /failed to fetch|network|timeout|timed out/i.test(m) ? 'The server did not answer. Check the connection and try again.' : '';
  function errors(root) {
    root.querySelectorAll('.v2read > .v2say.quiet').forEach(p => {
      if (p.__lxErr) return;
      const msg = (p.textContent || '').trim(); if (!/^The read could not run/.test(msg)) return;
      p.__lxErr = 1; p.classList.add('lx-readoff'); p.title = msg;
      p.innerHTML = `${ico('info', 14)}<span>The written read is not available right now. The numbers below are live.</span>`;
    });
    root.querySelectorAll('.v2bad').forEach(p => {
      if (p.__lxErr) return; p.__lxErr = 1;
      const card = p.parentElement;
      if (!isCard(card) || card.children.length > 2 || p.children.length) return;
      const msg = (p.textContent || '').trim(); if (!msg || msg.length > 260) return;
      const h3 = card.querySelector(':scope > .v2h h3, :scope > h3');
      const title = h3 ? h3.textContent.trim() : 'This did not load';
      if (h3) h3.closest('.v2h, h3').remove();
      const box = document.createElement('div');
      box.className = 'ds-empty lx-err'; box.setAttribute('role', 'alert');
      const plain = human(msg);
      box.innerHTML = `<i>${ico('circle-alert', 20)}</i><b>${title.replace(/</g, '&lt;')}</b><span>${(plain || msg).replace(/</g, '&lt;')}</span>${plain ? `<small>${msg.replace(/</g, '&lt;')}</small>` : ''}`;
      const tab = currentTab();
      if (tab && typeof window.show === 'function' && card.closest('#main')) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = 'Try again';
        b.onclick = () => window.show(tab); box.appendChild(b);
      }
      p.replaceWith(box);
    });
  }

  /* ---------- the loop ---------- */
  let queued = false;
  function pass() {
    queued = false;
    const main = document.getElementById('main');
    if (main) { skeletons(main); countUp(main); tables(main); errors(main); }
    const panel = document.getElementById('v2panel'); if (panel) { skeletons(panel); tables(panel); }
    slideAll();
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(pass); } };

  function start() {
    const mo = new MutationObserver(queue);
    const main = document.getElementById('main'); if (main) mo.observe(main, { childList: true, subtree: true });
    const panel = document.getElementById('v2panel'); if (panel) mo.observe(panel, { childList: true, subtree: true });
    const seg = document.getElementById('v2seg'); if (seg) mo.observe(seg, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    const tabs = document.getElementById('tabs'); if (tabs) mo.observe(tabs, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    const side = document.querySelector('.side'); if (side) mo.observe(side, { subtree: true, attributes: true, attributeFilter: ['class'] });
    /* sticky table heads sit right under the sticky top bar, whatever its height */
    const tb = document.querySelector('.topbar');
    const topH = () => { if (tb && getComputedStyle(tb).position === 'sticky') document.documentElement.style.setProperty('--lx-top', tb.offsetHeight + 'px'); else document.documentElement.style.removeProperty('--lx-top'); };
    if (tb && window.ResizeObserver) new ResizeObserver(topH).observe(tb); topH();
    let rs; addEventListener('resize', () => { clearTimeout(rs); rs = setTimeout(() => { topH(); document.querySelectorAll('.v2tbl').forEach(fitCheck); slideAll(); }, 120); }, { passive: true });
    /* 4. the top bar once the page has scrolled */
    const root = document.documentElement; let up = null;
    const sc = () => { const on = scrollY > 4; if (on !== up) { up = on; root.classList.toggle('lx-scrolled', on); } };
    addEventListener('scroll', sc, { passive: true }); sc();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(slideAll);
    pass();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.lxPolish = { pass, skPage, skLines, skTable };
})();
