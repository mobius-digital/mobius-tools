/* THE PHONE LAYER (2026-10-15). Cole: "should everything come from the bottom of the screen, like a native app?"
   Yes. On a phone (under 720px, the tab-bar width) nothing slides in from the side any more:
   - More (the phone bar) opens a bottom sheet: the client, the destinations that are not in the bar, Tools and
     settings, the theme, and the profile items. It no longer opens the rail drawer.
   - The client picker is the same sheet, hosting the REAL #pfPick menu node (moved in, moved back on close), so
     its search box and every click handler in index.html keep working untouched.
   - Every top-bar menu (.hd-period.open .hd-per-menu: period, attribution, PillMenu, Columns, Export) is drawn as
     a bottom sheet by phone.css; this file only adds the scrim behind it and closes on a scrim tap.
   - The side panel (#v2panel, card sheets included) slides UP (phone.css); modals already sat at the bottom.
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
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && host && !host.hidden) close(); });
    return host;
  }
  function open(title, html, wire) {
    const h = ensure(); clearTimeout(timer);
    h.querySelector('#lxsTitle').textContent = title || '';
    h.querySelector('.lxs-h').classList.toggle('bare', !title);
    const b = h.querySelector('.lxs-b'); b.innerHTML = html || ''; b.scrollTop = 0;
    h.hidden = false; document.body.classList.add('lxs-open');
    requestAnimationFrame(() => requestAnimationFrame(() => h.classList.add('on')));
    if (wire) wire(b);
  }
  function close() {
    if (!host || host.hidden) return;
    host.classList.remove('on'); document.body.classList.remove('lxs-open');
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

  /* ---------- widen past a phone: nothing stays open ---------- */
  matchMedia('(max-width:720px)').addEventListener('change', e => { if (!e.matches) { close(); syncScrim(); } });

  window.LxPhone = { open, close, more: openMore, client: openClient, isPhone: PHONE };
})();
