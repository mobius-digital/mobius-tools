/* THE LOCUS KIT, the behaviour half (2026-10-20, docs/handoffs/locus-ux-audit.md). lx.css is the look.
 *   window.LxKit.strip({tone, lead, n, text, go, goLabel, fold})   the one-line strip HTML (lx.css .lx-strip)
 *   window.LxKit.wireStrip(host)                                   "See both" folds the body under the strip open and shut
 *   window.LxKit.panel(title, html) / .closePanel()                the shared side panel (v2.js's panel; a sheet on a phone)
 * The page header's "..." menu (Tour, Metrics, Help and the page's purpose line) is wired here with one delegated
 * listener, so a re-rendered head needs nothing. Tokens only, no em dashes. */
(function () {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ---------- the "..." menu on the page header ---------- */
  const closeMenus = except => document.querySelectorAll('.ph-menu-w.open').forEach(w => { if (w !== except) w.classList.remove('open'); });
  document.addEventListener('click', e => {
    const more = e.target.closest('.ph-more');
    if (more) {
      e.preventDefault(); e.stopPropagation();
      const w = more.closest('.ph-menu-w');
      /* on a phone the menu is the shared bottom sheet (phone.js), like every other Locus menu there */
      if (window.LxPhone && LxPhone.isPhone && LxPhone.isPhone()) {
        const menu = w.querySelector('.ph-menu'); const t = document.querySelector('main .ph .ph-t');
        closeMenus();
        LxPhone.open(t ? t.textContent.trim() : '', menu ? menu.outerHTML : '', b => {
          b.addEventListener('click', ev => { if (ev.target.closest('button')) setTimeout(() => LxPhone.close(), 0); });
        });
        return;
      }
      const open = !w.classList.contains('open');
      closeMenus(w);
      if (typeof window.closePops === 'function') { try { window.closePops(); } catch {} }
      w.classList.toggle('open', open);
      more.setAttribute('aria-expanded', String(open));
      return;
    }
    /* a choice inside the menu bubbles on to index.html's data-tour / data-gloss / data-help handlers; the menu closes */
    if (e.target.closest('.ph-menu')) { setTimeout(closeMenus, 0); return; }
    closeMenus();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });

  /* ---------- the strip ---------- */
  function strip(o) {
    const tone = o.tone || 'warn';
    return `<div class="lx-strip" data-tone="${esc(tone)}" role="status">${o.lead ? `<b>${o.lead}</b>` : ''}${o.n ? `<span class="n">${esc(o.n)}</span>` : ''}${o.text ? `<span class="d">${o.text}</span>` : ''}${o.fold ? `<button type="button" class="lx-fold" aria-expanded="false">${esc(o.fold)}</button>` : ''}${o.go ? `<button type="button" class="go" data-go="${esc(o.go)}">${esc(o.goLabel || 'Open')} ›</button>` : ''}</div>${o.fold ? '<div class="lx-strip-body" hidden></div>' : ''}`;
  }
  function wireStrip(host, onOpen) {
    const b = host.querySelector('.lx-fold'), body = host.querySelector('.lx-strip-body');
    if (!b || !body) return;
    const open = b.textContent;
    b.onclick = () => {
      const on = body.hidden;
      body.hidden = !on;
      b.setAttribute('aria-expanded', String(on));
      b.textContent = on ? 'Fold' : open;
      if (on && onOpen) onOpen(body);
    };
  }

  /* ---------- the side panel ---------- */
  const panel = (title, html) => (window.V2 && window.V2.panel) ? window.V2.panel(title, html) : null;
  const closePanel = () => { if (window.V2 && window.V2.closePanel) window.V2.closePanel(); };

  window.LxKit = { strip, wireStrip, panel, closePanel };

  /* THE ICON RAIL (2026-10-20): html.lx-irail between 721 and 1180px (lx.css draws it). The logo, the client picker and
     the account button open the wide rail (body.nav-open + the scrim, the old drawer's own state, so index.html's
     close-on-pick and Escape still work); the two menus then open inside the wide rail, nothing clips. */
  const irail = matchMedia('(min-width:721px) and (max-width:1180px)');
  const setRail = () => document.documentElement.classList.toggle('lx-irail', irail.matches);
  const openRail = open => { document.body.classList.toggle('nav-open', open); const s = document.getElementById('navScrim'); if (s) s.hidden = !open; const t = document.getElementById('navToggle'); if (t) t.setAttribute('aria-expanded', open ? 'true' : 'false'); setTimeout(() => dispatchEvent(new Event('resize')), 240); /* polish.js re-measures the rail's sliding highlight on resize */ };
  setRail(); irail.addEventListener('change', () => { setRail(); if (!irail.matches) openRail(false); });
  const sideEl = document.getElementById('side'); if (sideEl) sideEl.addEventListener('transitionend', e => { if (e.propertyName === 'width') dispatchEvent(new Event('resize')); });   /* a background tab stalls the transition; re-measure when it really ends */
  document.addEventListener('click', e => {
    if (!document.documentElement.classList.contains('lx-irail')) return;
    const open = document.body.classList.contains('nav-open');
    if (e.target.closest('.side-brand')) { e.preventDefault(); e.stopPropagation(); openRail(!open); return; }
    if (!open && e.target.closest('#pfPickBtn, #pfMeBtn')) openRail(true);
    else if (open && e.target.closest('#tabs button[data-t], .side-foot .v2settings, .lc-pick-menu button, .lc-me-menu button')) setTimeout(() => openRail(false), 0);
  }, true);
})();
