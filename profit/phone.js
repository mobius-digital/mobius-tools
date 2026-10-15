/* THE PHONE LAYER (2026-10-15). Cole: "should everything come from the bottom of the screen, like a native app?"
   Yes. On a phone (under 720px, the tab-bar width) nothing slides in from the side any more:
   - More (the phone bar) opens a bottom sheet: the client, the destinations that are not in the bar, Tools and
     settings, the theme, and the profile items. It no longer opens the rail drawer.
   - The client picker is the same sheet, hosting the REAL #pfPick menu node (moved in, moved back on close), so
     its search box and every click handler in index.html keep working untouched.
   - Every top-bar menu (.hd-period.open .hd-per-menu: period, attribution, PillMenu, Columns, Export) is drawn as
     a bottom sheet by phone.css; this file only adds the scrim behind it and closes on a scrim tap.
   - The side panel (#v2panel, card sheets included) slides UP (phone.css); modals already sat at the bottom.
   - The review viewer's Notes panel (.rv-side, review-ui.js) is the same sheet hosting the REAL node (fourth pass):
     a "Notes · N" pill at the end of the strip opens it, a pin or number tag on the ad opens it on that note, Ask
     for changes opens it with the note box focused. review-ui.js repaints the whole viewer on every change, so
     the node is re-hosted after each paint; every handler stays review-ui.js's own.
   Loads deferred, after the boot script, so NAV, show(), drawPick(), closePops() exist. Nothing here runs on a
   desktop or an iPad: PHONE() gates every entry point, and a resize past 720 closes what is open. */
(() => {
  const PHONE = () => matchMedia('(max-width:720px)').matches;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BAR = ['home', 'ads', 'work', 'store'];   // the groups the phone bar already shows

  /* ---------- the sheet ---------- */
  let host = null, moved = null, movedFrom = null, timer = 0;
  function ensure() {
    if (host) return host;
    host = document.createElement('div');
    host.id = 'lxSheet'; host.hidden = true;
    host.innerHTML = `<div class="lxs-scrim"></div><div class="lxs-box" role="dialog" aria-modal="true" aria-labelledby="lxsTitle"><div class="lxs-grab" aria-hidden="true"><i></i></div><div class="lxs-h"><b id="lxsTitle"></b><button type="button" class="lxs-x" aria-label="Close">×</button></div><div class="lxs-b"></div></div>`;
    document.body.appendChild(host);
    host.querySelector('.lxs-scrim').addEventListener('click', close);
    host.querySelector('.lxs-x').addEventListener('click', close);
    /* swipe the handle or the header down to close */
    let y0 = null, dy = 0; const box = host.querySelector('.lxs-box');
    const start = e => { y0 = e.clientY; dy = 0; box.style.transition = 'none'; };
    const move = e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); box.style.transform = `translateY(${dy}px)`; };
    const end = () => { if (y0 == null) return; box.style.transition = ''; box.style.transform = ''; if (dy > 80) close(); y0 = null; };
    ['.lxs-grab', '.lxs-h'].forEach(s => { const el = host.querySelector(s); el.addEventListener('pointerdown', start); el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); });
    /* Escape closes the sheet and nothing under it (the review viewer also listens for Escape); a box being typed in
       is left to its own page (review-ui.js blurs it) */
    document.addEventListener('keydown', e => {
      if (!host || host.hidden) return;
      /* Enter posts a note or a reply typed in the hosted Notes panel (review-ui.js looks for the button inside the
         viewer, where the panel no longer is); Shift+Enter stays a new line, as in the viewer */
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && host.classList.contains('lxs-notes') && e.target.matches && e.target.matches('textarea') && host.contains(e.target)) {
        const b = host.querySelector(e.target.closest('.rv-rbox') ? '[data-rsend]' : '[data-post]'); if (b) { e.preventDefault(); e.stopPropagation(); b.click(); } return;
      }
      if (e.key !== 'Escape') return;
      const a = document.activeElement; if (a && host.contains(a) && a.matches('input,textarea')) return;
      e.stopPropagation(); close();
    }, true);
    return host;
  }
  function open(title, html, wire) {
    const h = ensure(); clearTimeout(timer);
    if (moved && movedFrom) { movedFrom.appendChild(moved); moved = null; movedFrom = null; }
    h.classList.remove('lxs-notes'); notesOn = false;
    h.querySelector('#lxsTitle').textContent = title || '';
    h.querySelector('.lxs-h').classList.toggle('bare', !title);
    const b = h.querySelector('.lxs-b'); b.innerHTML = html || ''; b.scrollTop = 0;
    h.hidden = false; document.body.classList.add('lxs-open');
    requestAnimationFrame(() => requestAnimationFrame(() => h.classList.add('on')));
    if (wire) wire(b);
  }
  function close() {
    if (!host || host.hidden) return;
    host.classList.remove('on', 'lxs-notes'); document.body.classList.remove('lxs-open'); notesOn = false;
    if (moved && movedFrom) { movedFrom.appendChild(moved); moved = null; movedFrom = null; }
    timer = setTimeout(() => { host.hidden = true; host.querySelector('.lxs-b').innerHTML = ''; }, 240);
  }

  /* ---------- More ---------- */
  function row(attrs, icon, label, sub, right) {
    return `<button type="button" class="lxs-row" ${attrs}>${icon ? `<span class="lxs-ic">${icon}</span>` : ''}<span class="lxs-t"><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${right || '<svg class="lxs-chev" viewBox="0 0 10 16" aria-hidden="true"><path d="M2 2l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'}</button>`;
  }
  function clientLabel() { const l = $('#pfPickLbl'); return l ? l.textContent : ''; }
  function canPick() { const p = $('#pfPick'); return p && !p.hidden; }
  function openMore() {
    const dests = [...document.querySelectorAll('#tabs button[data-t]')].filter(b => !b.hidden && !BAR.includes(b.dataset.grp));
    const tools = [$('#railTools'), $('#railSettings')].filter(b => b && !b.hidden);
    const me = [...document.querySelectorAll('#pfMe [data-me]')].filter(b => !b.hidden);
    const theme = document.documentElement.dataset.theme || 'dark';
    const cur = (window.S && S.tab) || '';
    const html = `
      ${canPick() ? `<div class="lxs-sec">Client</div>${row('data-lxs="client"', '', clientLabel(), '')}` : ''}
      <div class="lxs-sec">Go to</div>
      ${dests.map(b => row(`data-lxs-go="${esc(b.dataset.t)}" ${b.dataset.t === cur ? 'aria-current="page"' : ''}`, b.querySelector('svg') ? b.querySelector('svg').outerHTML : '', b.querySelector('span') ? b.querySelector('span').textContent : b.textContent)).join('')}
      ${tools.map(b => row(`data-lxs-go="${esc(b.dataset.t)}" data-lxs-id="${esc(b.id)}"`, b.querySelector('svg') ? b.querySelector('svg').outerHTML : '', b.querySelector('span') ? b.querySelector('span').textContent : b.textContent)).join('')}
      <div class="lxs-sec">Look</div>
      <div class="lxs-seg" role="group" aria-label="Theme"><button type="button" data-lxs-theme="dark" class="${theme === 'dark' ? 'on' : ''}">Dark</button><button type="button" data-lxs-theme="light" class="${theme === 'light' ? 'on' : ''}">Light</button></div>
      <div class="lxs-sec">You</div>
      ${me.map(b => row(`data-lxs-me="${esc(b.dataset.me)}"`, '', (b.childNodes[0] && b.childNodes[0].textContent || b.textContent).trim(), b.querySelector('small') ? b.querySelector('small').textContent : '')).join('')}`;
    open('', html, b => {
      b.addEventListener('click', e => {
        const go = e.target.closest('[data-lxs-go]'); if (go) { close(); const real = go.dataset.lxsId ? document.getElementById(go.dataset.lxsId) : document.querySelector(`#tabs button[data-t="${go.dataset.lxsGo}"]`); if (real) real.click(); else if (window.show) show(go.dataset.lxsGo); return; }
        const t = e.target.closest('[data-lxs-theme]'); if (t) { const real = document.querySelector(`[data-theme-pick="${t.dataset.lxsTheme}"]`); if (real) real.click(); b.querySelectorAll('[data-lxs-theme]').forEach(x => x.classList.toggle('on', x === t)); return; }
        const m = e.target.closest('[data-lxs-me]'); if (m) { close(); const real = document.querySelector(`#pfMe [data-me="${m.dataset.lxsMe}"]`); if (real) real.click(); return; }
        if (e.target.closest('[data-lxs="client"]')) { openClient(); }
      });
    });
  }

  /* ---------- the client picker ---------- */
  function openClient() {
    const box = $('#pfPick'); const menu = box && box.querySelector('.lc-pick-menu'); if (!menu) return;
    if (typeof drawPick === 'function') drawPick();
    const q = $('#pfPickQ'); if (q) q.value = '';
    open('Client', '', b => {
      moved = menu; movedFrom = box; b.appendChild(menu);
      b.addEventListener('click', e => { if (e.target.closest('[data-act], .lc-pick-add')) setTimeout(close, 0); });
    });
  }

  /* ---------- the phone bar's More, and the rail's own picker button ---------- */
  document.addEventListener('click', e => {
    if (!PHONE()) return;
    if (e.target.closest('#tbMore')) { e.stopPropagation(); e.preventDefault(); if (host && !host.hidden) close(); else openMore(); return; }
    if (e.target.closest('#pfPickBtn') && !e.target.closest('#lxSheet')) { e.stopPropagation(); e.preventDefault(); openClient(); return; }
  }, true);

  /* ---------- a scrim behind the top-bar menus, which phone.css draws as bottom sheets ---------- */
  let scrim = null;
  function syncScrim() {
    const openMenu = PHONE() && document.querySelector('.hd-period.open:not(#lxSheet .hd-period)');
    if (openMenu && !scrim) { scrim = document.createElement('div'); scrim.id = 'lxMenuScrim'; scrim.addEventListener('click', () => { if (typeof closePops === 'function') closePops(); syncScrim(); }); document.body.appendChild(scrim); }
    if (scrim) scrim.hidden = !openMenu;
    document.body.classList.toggle('lxm-open', !!openMenu);
  }
  document.addEventListener('click', () => setTimeout(syncScrim, 0));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setTimeout(syncScrim, 0); });
  new MutationObserver(muts => { for (const m of muts) if (m.target.classList && m.target.classList.contains('hd-period')) { syncScrim(); return; } }).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });

  /* ---------- Tasks: Group by, Only mine and Area live in a Filters sheet (five rows of chips at 375) ---------- */
  function chip(attrs, on, label, style) { return `<button type="button" class="lxs-chip${on ? ' on' : ''}" ${attrs}${style ? ` style="${esc(style)}"` : ''}>${esc(label)}</button>`; }
  function filtersHtml() {
    const tk = $('#main .tk'); if (!tk) return '';
    const grp = [...tk.querySelectorAll('.tk-bar [data-group]')].map(b => chip(`data-lxs-group="${esc(b.dataset.group)}"`, b.classList.contains('on'), b.textContent)).join('');
    const mine = tk.querySelector('#tkMine');
    const areas = [...tk.querySelectorAll('.tk-areas [data-areaf]')].map(b => chip(`data-lxs-area="${esc(b.dataset.areaf)}"`, b.classList.contains('on'), b.textContent, b.getAttribute('style') || '')).join('');
    return `<div class="lxs-sec">Group by</div><div class="lxs-chips">${grp}</div>${mine ? `<div class="lxs-sec">Show</div><div class="lxs-chips">${chip('data-lxs-mine="1"', mine.classList.contains('on'), 'Only mine', '--cc:var(--brand)')}</div>` : ''}<div class="lxs-sec">Area</div><div class="lxs-chips">${areas}</div>`;
  }
  function openFilters() {
    open('Filters', filtersHtml(), b => {
      b.addEventListener('click', e => {
        const g = e.target.closest('[data-lxs-group]'), a = e.target.closest('[data-lxs-area]'), m = e.target.closest('[data-lxs-mine]');
        const real = g ? $(`#main .tk .tk-bar [data-group="${g.dataset.lxsGroup}"]`) : a ? $(`#main .tk .tk-areas [data-areaf="${a.dataset.lxsArea}"]`) : m ? $('#tkMine') : null;
        if (!real) return; real.click();
        setTimeout(() => { b.innerHTML = filtersHtml(); filtersBtn(); }, 80);
      });
    });
  }
  function filtersBtn() {
    const bar = $('#main .tk .tk-bar'); if (!bar) return;
    let b = bar.querySelector('.lxs-filters');
    if (!PHONE()) { if (b) b.remove(); return; }
    const tk = bar.closest('.tk');
    const n = (tk.querySelector('.tk-bar [data-group].on') && tk.querySelector('.tk-bar [data-group].on').dataset.group !== 'brand' ? 1 : 0) + (tk.querySelector('#tkMine.on') ? 1 : 0) + (tk.querySelector('.tk-areas [data-areaf].on') && tk.querySelector('.tk-areas [data-areaf].on').dataset.areaf !== 'all' ? 1 : 0);
    if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'tk-chip lxs-filters'; b.addEventListener('click', openFilters); bar.appendChild(b); }
    const t = n ? `Filters · ${n}` : 'Filters'; if (b.textContent !== t) b.textContent = t;   /* a same-text write is still a mutation: guard, or the observer loops */
    b.classList.toggle('on', n > 0);
  }

  /* ---------- the review viewer: Notes are a bottom sheet hosting the real .rv-side node ---------- */
  let notesOn = false;
  const viewer = () => document.querySelector('.rv-scrim');
  function hostNotes() {   /* the viewer's CURRENT .rv-side goes in the sheet; after a repaint it is a new node and the old copy leaves */
    const w = viewer(); const side = w && w.querySelector('.rv-b > .rv-side'); if (!side) return;
    const b = host.querySelector('.lxs-b'); const old = b.querySelector('.rv-side');
    moved = side; movedFrom = side.parentElement; b.appendChild(side); if (old && old !== side) old.remove();
    const who = w.querySelector('.rv-who b'); const t = host.querySelector('#lxsTitle'); if (who && t && t.textContent !== who.textContent) t.textContent = who.textContent;
  }
  function openNotes(hi) {
    const w = viewer(); if (!w || !PHONE()) return;
    if (notesOn && host && !host.hidden) hostNotes();
    else { const who = w.querySelector('.rv-who b'); open(who ? who.textContent : 'Notes', '', () => { host.classList.add('lxs-notes'); notesOn = true; hostNotes(); }); }
    if (hi) requestAnimationFrame(() => requestAnimationFrame(() => { const n = host.querySelector('.rv-note.hi'); if (n) n.scrollIntoView({ block: 'center' }); }));
  }
  function reviewFix() {
    const w = viewer();
    if (!w) { if (notesOn) close(); return; }
    if (!PHONE()) return;
    const strip = w.querySelector('.rv-strip'); if (!strip) return;
    let btn = strip.querySelector('.lxs-notes-btn');
    if (!btn) { btn = document.createElement('button'); btn.type = 'button'; btn.className = 'rv-btn lxs-notes-btn'; btn.addEventListener('click', () => openNotes()); strip.appendChild(btn); }
    const n = document.querySelector('.rv-tab[data-tab="notes"] .rv-hint'); const c = n ? n.textContent.trim() : '';
    const t = c && c !== '0' ? `Notes · ${c}` : 'Notes'; if (btn.textContent !== t) btn.textContent = t;
    if (notesOn && host && !host.hidden) hostNotes();
  }
  /* a pin or number tag on the ad opens the sheet on that note; Ask for changes opens it with the note box ready.
     Both run after review-ui.js's own click handler has repainted (it sits on the element itself), so by the time
     the click reaches the document the element is detached: match it on its own classes, not on an ancestor. */
  document.addEventListener('click', e => {
    if (!PHONE() || !viewer()) return;
    if (e.target.closest('.rv-pin[data-pin], .rv-num[data-pin]')) { setTimeout(() => openNotes(true), 0); return; }
    if (e.target.closest('.rv-btn[data-ask]')) setTimeout(() => { openNotes(); const t = host && host.querySelector('[data-body]'); if (t) t.focus(); }, 0);
  });

  /* ---------- the page tabs: the open tab scrolls into view, and the row fades at its edge when more exist ---------- */
  function segFix() {
    const seg = $('#v2seg'); if (!seg || seg.hidden) return;
    const on = seg.querySelector('.on, [aria-current], [aria-selected="true"]'); if (!on) return;
    let row = on.parentElement; while (row && row !== seg && !(row.scrollWidth > row.clientWidth + 2)) row = row.parentElement;
    if (!row || row === seg && !(seg.scrollWidth > seg.clientWidth + 2)) { seg.querySelectorAll('.lxs-fade').forEach(r => r.classList.remove('lxs-fade')); return; }
    row.classList.add('lxs-fade');
    const want = on.getBoundingClientRect().left - row.getBoundingClientRect().left - (row.clientWidth - on.offsetWidth) / 2;
    row.scrollTo({ left: row.scrollLeft + want, behavior: 'smooth' });
  }

  let tick = 0;
  new MutationObserver(() => { clearTimeout(tick); tick = setTimeout(() => { filtersBtn(); reviewFix(); if (PHONE()) segFix(); }, 60); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });

  /* ---------- widen past a phone: nothing stays open ---------- */
  matchMedia('(max-width:720px)').addEventListener('change', e => { if (!e.matches) { close(); syncScrim(); } });

  window.LxPhone = { open, close, more: openMore, client: openClient, isPhone: PHONE };
})();
