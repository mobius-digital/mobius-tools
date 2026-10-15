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

/* ---------- Ask on a phone (2026-10-15, second go). ask-ui.js builds #ask the same way for Locus, Ledger and Supply,
   so this adds its phone pieces inside it rather than changing its markup: a grab handle, a header (the helper, "Ask
   Locus", who it is about, new chat / More / close), the empty state (a greeting and four questions for the page,
   from index.html's askList()), a round send arrow, swipe down to close, the sheet's height kept to the visual
   viewport so the box sits above the keyboard, and the Ask tab lit while the chat is open. phone.css draws it all
   under 720 and hides these pieces above it. */
(() => {
  const PHONE = () => matchMedia('(max-width:720px)').matches;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const IC = {
    new: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    send: '<svg class="lxa-send-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
    go: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
    chats: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z"/></svg>',
    reports: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  };
  const scopeName = () => { const l = $('#pfPickLbl'); const t = l && l.textContent.trim(); return t || 'All clients'; };
  const sugs = () => { try { return (typeof askList === 'function' ? askList() : []).slice(0, 4); } catch (e) { return []; } };
  const pageName = () => { try { return (typeof TAB_TITLE !== 'undefined' && typeof S !== 'undefined' && TAB_TITLE[S.tab]) || ''; } catch (e) { return ''; } };

  function build(a) {
    if (a.dataset.lxa) return; a.dataset.lxa = '1';
    a.insertAdjacentHTML('afterbegin', '<div class="lxa-grab" aria-hidden="true"><i></i></div>');
    const h = a.querySelector('.ch2');
    h.insertAdjacentHTML('afterbegin', `<div class="lxa-hd"><span class="lx-face" data-state="clear"></span><span class="lxa-tt"><b>Ask Locus</b><small class="lxa-scope"></small></span></div>`
      + `<button type="button" class="lxa-ib" data-lxa="new" aria-label="New chat">${IC.new}</button>`
      + `<button type="button" class="lxa-ib" data-lxa="menu" aria-label="Past chats and reports">${IC.more}</button>`
      + `<button type="button" class="lxa-ib" data-lxa="close" aria-label="Close">${IC.close}</button>`);
    $('#askLog', a).insertAdjacentHTML('beforebegin', '<div class="lxa-empty"></div>');
    const f = $('#askForm', a), ta = $('#askIn', a), b = f && f.querySelector('button[type="submit"]');
    if (ta) { ta.setAttribute('enterkeyhint', 'send'); ta.dataset.ph = ta.placeholder; }
    if (b) { b.classList.add('lxa-send'); b.setAttribute('aria-label', 'Send'); b.innerHTML = `<span class="lxa-send-t">${esc(b.textContent)}</span>${IC.send}`; }
    const has = () => f && f.classList.toggle('lxa-has', !!(ta && ta.value.trim()));
    if (ta) { ta.addEventListener('input', has); ta.addEventListener('focus', () => { setTimeout(() => { const l = $('#askLog'); if (l) l.scrollTop = l.scrollHeight; }, 300); }); }
    if (f) f.addEventListener('submit', () => setTimeout(has, 0));
    a.addEventListener('click', e => {
      const x = e.target.closest('[data-lxa]'); if (!x) {
        const s = e.target.closest('.lxa-sug'); if (s && window.AskUI) AskUI.ask(s.dataset.q);
        return;
      }
      const k = x.dataset.lxa;
      if (k === 'close') AskUI.close();
      else if (k === 'new') AskUI.fresh();
      else if (k === 'menu' && window.LxPhone) LxPhone.open('Ask Locus', `<button type="button" class="lxs-row" data-m="chats"><span class="lxs-ic">${IC.chats}</span><span class="lxs-t"><span>Past chats</span><small>About ${esc(scopeName())}</small></span></button>`
        + `<button type="button" class="lxs-row" data-m="reports"><span class="lxs-ic">${IC.reports}</span><span class="lxs-t"><span>Reports</span><small>Pages it built for you</small></span></button>`
        + `<button type="button" class="lxs-row" data-m="new"><span class="lxs-ic">${IC.new}</span><span class="lxs-t"><span>New chat</span></span></button>`, body => {
          body.addEventListener('click', ev => { const r = ev.target.closest('[data-m]'); if (!r) return; LxPhone.close(); const m = r.dataset.m; setTimeout(() => { if (m === 'chats') AskUI.history(); else if (m === 'reports') AskUI.reports(); else AskUI.fresh(); }, 60); });
        });
    });
    /* swipe the handle or the header down to close */
    let y0 = null, dy = 0;
    const start = e => { if (!PHONE() || e.target.closest('button')) return; y0 = e.clientY; dy = 0; a.classList.add('lxa-drag'); };
    const move = e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); a.style.transform = `translateY(${dy}px)`; };
    const end = () => { if (y0 == null) return; a.classList.remove('lxa-drag'); a.style.transform = ''; if (dy > 90) AskUI.close(); y0 = null; };
    [a.querySelector('.lxa-grab'), h].forEach(el => { el.addEventListener('pointerdown', start); el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); });
    new MutationObserver(sync).observe($('#askLog', a), { childList: true });
    new MutationObserver(sync).observe(a, { attributes: true, attributeFilter: ['class'] });
  }

  let lastEmpty = '';
  function sync() {
    const a = $('#ask'); if (!a) return;
    const open = a.classList.contains('on');
    const tb = $('#tbAsk'); if (tb) tb.classList.toggle('on', open && PHONE());
    if (!PHONE()) return;
    const ta = $('#askIn', a); if (ta && ta.placeholder !== 'Ask Locus anything') { ta.placeholder = 'Ask Locus anything'; if (ta._grow) ta._grow(); }
    const fm = $('#askForm', a); if (fm && ta) fm.classList.toggle('lxa-has', !!ta.value.trim());   // Enter sends without a submit event
    const sc = $('.lxa-scope', a); if (sc) sc.textContent = 'About ' + scopeName();
    const log = $('#askLog', a);
    const busy = !!(log && log.querySelector('.working'));
    a.querySelectorAll('.lxa-hd .lx-face').forEach(f => { const s = busy ? 'thinking' : 'clear'; if (f.dataset.state !== s) f.dataset.state = s; });
    if (tb) { const f = tb.querySelector('.lx-face'); const s = busy ? 'thinking' : 'clear'; if (f && f.dataset.state !== s) f.dataset.state = s; }
    const empty = !!log && !log.querySelector('.m:not(.intro)');
    a.classList.toggle('lxa-isempty', empty);
    if (empty) {
      const qs = sugs(), key = scopeName() + '|' + pageName() + '|' + qs.join('|');
      if (key !== lastEmpty) {
        lastEmpty = key;
        const pg = pageName();
        $('.lxa-empty', a).innerHTML = `<div class="lxa-hello"><span class="lx-face" data-state="clear"></span><h2>What do you want to know?</h2><p>Ask about ${esc(scopeName())}${pg ? `, or anything on ${esc(pg)}` : ''}. Locus reads the numbers and answers in plain words.</p></div>`
          + (qs.length ? `<div class="lxa-sugs"><span>Try asking</span>${qs.map(q => `<button type="button" class="lxa-sug" data-q="${esc(q)}"><span>${esc(q)}</span>${IC.go}</button>`).join('')}</div>` : '');
      }
    }
    if (open) fit();
  }
  /* keep the sheet inside the visual viewport, so the box sits above the keyboard */
  function fit() {
    const a = $('#ask'), vv = window.visualViewport; if (!a || !vv || !PHONE()) return;
    a.style.setProperty('--vvh', vv.height + 'px');
    a.style.setProperty('--vvt', vv.offsetTop + 'px');
    a.classList.toggle('lxa-kb', vv.height < window.innerHeight - 120);
  }
  if (window.visualViewport) { visualViewport.addEventListener('resize', fit); visualViewport.addEventListener('scroll', fit); }
  function watch() {
    const a = $('#ask'); if (a) { build(a); sync(); return true; }
    return false;
  }
  if (!watch()) {
    const mo = new MutationObserver(() => { if (watch()) mo.disconnect(); });
    mo.observe(document.body, { childList: true });
  }
})();
