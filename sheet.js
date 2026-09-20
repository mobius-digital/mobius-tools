/* ==========================================================================
   sheet.js - makes every Mobius modal behave like a phone sheet
   --------------------------------------------------------------------------
   Loaded by Locus and by Ledger. Pairs with sheet.css.

   THE ONE IDEA THAT MAKES THIS SAFE
   ---------------------------------
   This file never closes a modal itself. Both apps already dismiss on a tap
   whose target is the backdrop, and both hang real work off that path -
   Locus's confirmModal RESOLVES A PROMISE there, Ledger's ask() calls
   window.__askCancel. If this file just removed the node, every `await
   confirmModal(...)` behind it would hang forever and the bug would be far
   worse than the one being fixed.

   So the close gesture here - the X, a flick down, the back button - ends by
   dispatching the app's OWN dismiss event on the app's OWN element. The app
   closes itself, through the code path it already had, and nothing about
   cancellation, promise resolution or cleanup has to be duplicated or kept in
   sync. Adding a modal to either app needs no change here.

   WHAT IT DOES, ON PHONES ONLY
   ---------------------------
     · slides the sheet up, fades a backdrop in
     · pins a grabber + close button to the top of the sheet, and the sheet's
       own action row to the bottom
     · drag down to dismiss, with a spring-back under the threshold
     · locks the page behind it so nothing scrolls but the sheet
     · pushes a history entry, so Back / the Android back gesture / the iOS
       back swipe closes the sheet instead of leaving the app
     · tracks the visual viewport, so an open keyboard shortens the sheet
       rather than burying its buttons

   Above the breakpoint it does nothing at all: no classes, no listeners, no
   history entries. Desktop is untouched.
   ========================================================================== */
(() => {
  'use strict';

  /* ---------- page lock ----------
     Reference counted. Locus can stack a glossary over a help modal, and the
     inner one closing must not unlock the page under the outer one. */
  let locks = 0;
  const lock = () => { if (locks++ === 0) document.documentElement.classList.add('ms-locked'); };
  const unlock = () => { if (locks > 0 && --locks === 0) document.documentElement.classList.remove('ms-locked'); };

  /* ---------- visual viewport ----------
     The layout viewport does not change when the keyboard opens; the visual
     one does. Publishing it as --ms-vv lets the sheet sit ON the keyboard
     instead of half behind it, which is the difference between "the Save
     button disappeared" and a normal phone form. */
  const vv = window.visualViewport;
  const paintVV = () => {
    document.documentElement.style.setProperty('--ms-vv', (vv ? vv.height : window.innerHeight) + 'px');
  };
  if (vv) { vv.addEventListener('resize', paintVV); vv.addEventListener('scroll', paintVV); }
  addEventListener('orientationchange', () => setTimeout(paintVV, 120));
  paintVV();

  /* ---------- history ----------
     One entry per open sheet, so the phone's back gesture closes the sheet
     rather than leaving the app. Neither app pushes history of its own, so a
     pushed entry is unambiguously ours.

     The counter, not a timer, is what makes this safe. A sheet closed any
     other way has to take its entry back off or Back would need pressing
     twice; that back() fires a popstate this handler must ignore, and the
     handler must ignore EXACTLY as many as were fired. A boolean cleared on
     setTimeout(0) loses that race the moment two sheets close in the same
     tick - which Locus does every time the glossary replaces a help modal.
     popstate events arrive in order, so one decrement per back() is exact. */
  const stack = [];
  let suppress = 0;
  const pushEntry = entry => {
    stack.push(entry);
    try { history.pushState({ msheet: stack.length }, ''); } catch { /* file:// and the like */ }
  };
  /* Remove an entry the browser has NOT already popped. */
  const dropEntry = entry => {
    const i = stack.lastIndexOf(entry);
    if (i < 0) return;
    stack.splice(i, 1);
    suppress++;
    try { history.back(); } catch { suppress--; }
  };
  addEventListener('popstate', () => {
    if (suppress > 0) { suppress--; return; }
    if (!stack.length) return;
    const top = stack.pop();
    top.dismiss({ fromHistory: true });
  });

  /* ---------- chrome injected into a sheet ---------- */
  const clearInline = box => {
    box.style.paddingBottom = '';
    box.style.removeProperty('--ms-pad');
    box.style.removeProperty('--ms-padb');
  };

  const X_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

  function addChrome(ctl) {
    const { box } = ctl;
    /* Ledger reuses one .mbox for every modal, so anything left inline from
       the last one has to go before the next is measured - otherwise a sheet
       with no action row inherits the zeroed bottom padding of the one
       before it and sits flush against the edge of the screen. */
    clearInline(box);
    const cs = getComputedStyle(box);
    // The pinned bars are full-bleed INSIDE the sheet, so they need the
    // sheet's own padding to cancel with a negative margin. Measured rather
    // than assumed: Locus modals pad 18px, Ledger's 18px, .modal.wide 14px.
    box.style.setProperty('--ms-pad', cs.paddingLeft);

    const head = document.createElement('div');
    head.className = 'ms-head';
    const title = box.querySelector('h1,h2,h3')?.textContent?.trim() || '';
    head.innerHTML = '<div class="ms-grab"></div>' +
      '<div class="ms-title"></div>' +
      '<button type="button" class="ms-x" aria-label="Close">' + X_SVG + '</button>';
    head.querySelector('.ms-title').textContent = title;
    box.prepend(head);
    ctl.head = head;
    head.querySelector('.ms-x').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      ctl.dismiss();
    });

    /* The action row is whatever the sheet already ends with, provided it
       holds buttons. Nothing is moved or rebuilt - it is tagged in place, so
       every handler the app bound to those buttons still points at them. */
    const last = box.lastElementChild;
    if (last && last !== head && last.querySelector('button,.btn') && !last.matches('button,.btn')) {
      last.classList.add('ms-foot');
      ctl.foot = last;
      /* A sticky footer sticks to the CONTENT box, not the padding box, so
         the sheet's own bottom padding left a dead strip under the buttons -
         20px of nothing between Save and the edge of the screen. The footer
         takes that padding over, safe-area and all. */
      box.style.setProperty('--ms-padb', '0px');
      box.style.paddingBottom = '0px';
    } else {
      box.style.setProperty('--ms-padb', cs.paddingBottom);
    }

    /* ONE SCROLLER.
       Locus's help modal caps .help-body at 60vh and scrolls it; the ad modal
       does the same with .ad-modal-body. On a desktop that is a sensible
       inner pane. On a phone it is exactly the fault Cole described as
       "stuck": drag on the pane and the pane moves, drag a centimetre lower
       and nothing moves at all, and no single gesture reaches the bottom of
       the sheet. So any inner VERTICAL scroller is flattened and the sheet
       itself becomes the only thing that scrolls.

       The scrollWidth guard is what keeps a sideways-scrolling table alive:
       setting overflow-y to visible would drag overflow-x visible with it
       (the two cannot disagree when one is not visible) and a wide table
       would burst out of the sheet instead of sliding inside it. */
    box.querySelectorAll('*').forEach(el => {
      if (el === head || head.contains(el)) return;
      if (el.matches('textarea,input,select,.pk-list,.msel-panel,[data-ms-scroll]')) return;
      if (el.scrollHeight <= el.clientHeight + 4) return;      // not actually scrolling
      if (el.scrollWidth > el.clientWidth + 4) return;         // slides sideways; leave it
      const s = getComputedStyle(el);
      if (s.overflowY !== 'auto' && s.overflowY !== 'scroll') return;
      el.style.maxHeight = 'none';
      el.style.overflowY = 'visible';
    });

    /* The title in the bar fades in exactly when the real heading leaves.
       A sentinel is cheaper and smoother than a scroll listener. */
    const heading = box.querySelector('h1,h2,h3');
    if (heading && 'IntersectionObserver' in window) {
      ctl.io = new IntersectionObserver(
        ([e]) => head.classList.toggle('ms-stuck', !e.isIntersecting),
        { root: box, threshold: 1, rootMargin: '-52px 0px 0px 0px' }
      );
      ctl.io.observe(heading);
    }
  }

  /* ---------- drag to dismiss ---------- */
  function addDrag(ctl) {
    const { wrap, box } = ctl;
    let y0 = 0, x0 = 0, dy = 0, active = false, decided = false, onHead = false;
    // Previous sample, for a flick velocity measured over the last few
    // milliseconds of the gesture rather than averaged across all of it - a
    // slow drag that ends in a flick reads as a flick, which is what the
    // hand meant.
    let pY = 0, pT = 0, v = 0;

    const start = e => {
      if (e.touches.length !== 1 || ctl.closing) return;
      const t = e.touches[0];
      y0 = t.clientY; x0 = t.clientX; dy = 0;
      pY = t.clientY; pT = e.timeStamp; v = 0;
      onHead = !!e.target.closest('.ms-head');
      // A drag that starts on a control is that control's business: a
      // textarea scrolls, a range slides, a select opens.
      const onControl = !onHead && !!e.target.closest('textarea,input,select,[contenteditable],.pk-list,.msel-panel');
      active = !onControl && (onHead || box.scrollTop <= 0);
      decided = false;
    };

    const move = e => {
      if (!active || e.touches.length !== 1) return;
      const t = e.touches[0];
      const d = t.clientY - y0, dx = t.clientX - x0;
      if (!decided) {
        if (Math.abs(d) < 6 && Math.abs(dx) < 6) return;      // still ambiguous
        // A sideways gesture belongs to whatever is under it - a chip strip,
        // a scrolling table - and must not be stolen as a dismiss.
        if (Math.abs(dx) > Math.abs(d)) { active = false; return; }
        // Pulling UP from the top of the sheet is a scroll, not a dismiss.
        if (d < 0 && !onHead) { active = false; return; }
        decided = true;
        wrap.classList.add('ms-drag');
      }
      // Past the top of the sheet the drag goes rubbery rather than just
      // stopping, so it reads as a limit instead of a dead control.
      const dt = e.timeStamp - pT;
      if (dt > 0) v = (t.clientY - pY) / dt;
      pY = t.clientY; pT = e.timeStamp;
      dy = d >= 0 ? d : -Math.sqrt(-d) * 3;
      if (d > 0) e.preventDefault();
      box.style.transform = 'translateY(' + dy.toFixed(1) + 'px)';
      if (ctl.bd) ctl.bd.style.opacity = String(Math.max(0, 1 - dy / (box.offsetHeight || 600)));
    };

    const end = e => {
      if (!active) return;
      active = false;
      if (!decided) return;
      wrap.classList.remove('ms-drag');
      box.style.transform = '';
      if (ctl.bd) ctl.bd.style.opacity = '';
      /* Two ways out, and a floor under both. A long drag closes on distance
         alone; a short one only if it was thrown, and never under 44px -
         without that floor a fast twitch on the grabber dismisses a sheet
         nobody meant to dismiss, which is its own kind of clunky. The
         distance threshold scales with the sheet but never drops below 72px,
         so a small confirm box is not hair-trigger either. */
      const far = dy > Math.max(72, Math.min(140, box.offsetHeight * 0.3));
      const flick = dy > 44 && v > 0.6;
      if (far || flick) ctl.dismiss();
      dy = 0; v = 0;
    };

    box.addEventListener('touchstart', start, { passive: true });
    box.addEventListener('touchmove', move, { passive: false });
    box.addEventListener('touchend', end, { passive: true });
    box.addEventListener('touchcancel', end, { passive: true });
  }

  /* ---------- keyboard ----------
     Focusing a field near the bottom of a tall sheet leaves it under the
     keyboard on iOS. The sheet is already sized to the visual viewport by
     then, so all that is left is to bring the field into it. */
  function addKeyboard(ctl) {
    ctl.box.addEventListener('focusin', e => {
      const f = e.target.closest('input,textarea,select,[contenteditable]');
      if (!f) return;
      // Only if the keyboard actually took the field. Scrolling a field that
      // is already comfortably in view just yanks the sheet under the thumb.
      setTimeout(() => {
        const h = (window.visualViewport || window).height || window.innerHeight;
        const r = f.getBoundingClientRect();
        if (r.bottom > h - 12 || r.top < 60) f.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 300);
    });
  }

  /* ---------- one sheet ---------- */
  function makeController(wrap, box, opts) {
    const ctl = {
      wrap, box, opts, closing: false, hist: false,
      /* Hand the close back to the app: dispatch the app's OWN dismiss event
         on the app's OWN element. Both apps check `target === the wrap`, and
         dispatching on the element directly is what makes it the target.
         All three events go out because Locus listens on mousedown for five
         of its modals and on click for the sixth, and Ledger on click. */
      dismiss({ fromHistory = false } = {}) {
        if (ctl.closing) return;
        ctl.closing = true;
        // The browser has already popped our entry in the fromHistory case.
        if (fromHistory) ctl.hist = false;
        wrap.classList.remove('ms-in');
        wrap.classList.add('ms-out');
        box.style.transform = '';
        /* `open` rather than isConnected, because Ledger's wrap is a
           permanent element that is merely un-classed when it shuts - by
           isConnected it is open forever, and the fallback would fire on
           every single close on top of a dismiss that already worked. */
        const open = opts.isOpen || (w => w.isConnected);
        const fire = () => {
          if (!open(wrap)) return;
          const ev = t => wrap.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
          ev('mousedown');
          if (open(wrap)) ev('mouseup');
          if (open(wrap)) ev('click');
          // Nothing listened. Better a sheet that shuts than one that cannot.
          if (open(wrap) && opts.fallbackClose) opts.fallbackClose(wrap);
        };
        setTimeout(fire, 240);
      },
      /* Ledger reuses ONE .mbox: opening a second modal from inside the
         first replaces its innerHTML without touching the class that opens
         it, so nothing signals a new sheet and the new content arrived with
         no grabber, no close button and no pinned actions. Re-dress it. */
      refresh() {
        if (ctl.closing || box.querySelector('.ms-head')) return;
        ctl.io?.disconnect();
        ctl.io = null;
        addChrome(ctl);
      },
      /* Runs when the sheet actually leaves - whether this file asked for it,
         the app's own Save did, or the user tapped the backdrop. The single
         place the lock and the history entry are given back, so no close
         path can leak either. */
      teardown() {
        ctl.io?.disconnect();
        unlock();
        if (ctl.hist) { ctl.hist = false; dropEntry(ctl); }
        wrap.classList.remove('ms-wrap', 'ms-in', 'ms-out', 'ms-drag');
        box.classList.remove('ms-box');
        ctl.bd?.remove();                                   // #modal is reused
        wrap.style.background = ctl.paint || '';
        clearInline(box);
      }
    };

    wrap.classList.add('ms-wrap');
    box.classList.add('ms-box');

    /* The backdrop becomes its own inert layer so it can fade in with the
       sheet and fade out under the drag. In Locus it is the wrap's own
       background colour, moved onto the child so the wrap itself stays the
       transparent tap target the app listens on. Ledger's wrap has no colour
       of its own - it dims with a separate #scrim - so it passes one in, and
       hides that scrim for as long as the lock is on. */
    ctl.paint = wrap.style.background;
    const bd = document.createElement('div');
    bd.className = 'ms-backdrop';
    bd.style.background = opts.backdropColor || getComputedStyle(wrap).backgroundColor;
    wrap.style.background = 'transparent';
    wrap.prepend(bd);
    ctl.bd = bd;

    addChrome(ctl);
    addDrag(ctl);
    addKeyboard(ctl);
    lock();
    ctl.hist = true;
    pushEntry(ctl);
    paintVV();
    /* Force the start state to be computed before the end state is set, so
       the transition has two values to run between. requestAnimationFrame is
       deliberately NOT used: it does not fire in a hidden tab, and a modal
       raised while the tab is backgrounded - a failed background refresh,
       say - would then sit off screen behind a locked page until you
       switched away and back. Caught in testing, where the preview pane is
       hidden and every sheet stayed at translateY(100%). */
    void getComputedStyle(box).transform;
    wrap.classList.add('ms-in');
    return ctl;
  }

  /* ---------- public surface ---------- */
  const phone = q => matchMedia(q);

  /* Locus: modals are built and appended to <body> one at a time, so the only
     way to catch every one - including the two in amb.js and meta.js, and any
     written later - is to watch the body for them. */
  function watch({ wrap: wrapSel, box: boxSel, media, backdropColor, fallbackClose }) {
    const mq = phone(media);
    const live = new Map();
    const upgrade = el => {
      if (!mq.matches || live.has(el)) return;
      const box = el.querySelector(boxSel);
      if (!box) return;
      live.set(el, makeController(el, box, { backdropColor, fallbackClose }));
    };
    new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes.forEach(n => { if (n.nodeType === 1 && n.matches?.(wrapSel)) upgrade(n); });
        m.removedNodes.forEach(n => {
          if (n.nodeType !== 1) return;
          const c = live.get(n);
          if (c) { live.delete(n); c.teardown(); }
        });
      }
    }).observe(document.body, { childList: true });
    // Anything already on the page when this runs.
    document.querySelectorAll(wrapSel).forEach(upgrade);
    // Rotating a phone into landscape on a tablet-sized viewport must not
    // leave a half-upgraded sheet behind.
    mq.addEventListener('change', e => {
      if (e.matches) return;
      live.forEach(c => c.teardown());
      live.clear();
    });
  }

  /* Ledger: one persistent element toggled with a class, so the signal is an
     attribute change rather than an insertion. */
  function bindToggle({ wrap: wrapSel, box: boxSel, openClass, media, backdropColor, fallbackClose }) {
    const wrap = document.querySelector(wrapSel);
    if (!wrap) return;
    const mq = phone(media);
    let ctl = null;
    const sync = () => {
      const open = wrap.classList.contains(openClass);
      if (open && !ctl && mq.matches) {
        const box = wrap.querySelector(boxSel);
        if (box) ctl = makeController(wrap, box, {
          backdropColor, fallbackClose,
          isOpen: w => w.classList.contains(openClass)
        });
      } else if (!open && ctl) {
        ctl.teardown(); ctl = null;
      }
    };
    new MutationObserver(sync).observe(wrap, { attributes: true, attributeFilter: ['class'] });
    // Content swapped under an already-open sheet - see refresh().
    new MutationObserver(() => ctl?.refresh()).observe(wrap, { childList: true, subtree: true });
    sync();
  }

  /* A drawer and a menu sheet are the same sheet on different axes: the same
     two faults (no way back out, no gesture) and the same two fixes. Neither
     is a modal, so neither gets chrome or a lock - just the back gesture and
     a swipe in the direction it came from.

       axis 'x'  the Locus rail: swipe it back off the left edge
       axis 'y'  the Ledger add/more sheet: flick it down

     `close` calls the app's own close path rather than re-implementing it,
     for the same reason dismiss() does. */
  function bindPanel({ panel, watchOn = 'self', openClass = 'on', media, close, axis = 'y', dragClass = 'ms-panel-drag' }) {
    const el = document.querySelector(panel);
    if (!el) return;
    const host = watchOn === 'body' ? document.body : el;
    const mq = phone(media);
    let entry = null;

    const sync = () => {
      const on = host.classList.contains(openClass) && mq.matches;
      if (on && !entry) {
        /* dismiss() is what popstate calls; the browser has already taken the
           entry off by then, so the close path must not ask for it again. */
        entry = { dismiss: () => { entry = null; close(); } };
        pushEntry(entry);
      } else if (!on && entry) {
        const e = entry; entry = null; dropEntry(e);
      }
    };
    new MutationObserver(sync).observe(host, { attributes: true, attributeFilter: ['class'] });
    sync();

    const vertical = axis === 'y';
    let a0 = 0, b0 = 0, live = false, decided = false;
    el.addEventListener('touchstart', e => {
      if (!mq.matches || e.touches.length !== 1 || !host.classList.contains(openClass)) return;
      const t = e.touches[0];
      a0 = vertical ? t.clientY : t.clientX;
      b0 = vertical ? t.clientX : t.clientY;
      live = true; decided = false;
    }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (!live || e.touches.length !== 1) return;
      const t = e.touches[0];
      const da = (vertical ? t.clientY : t.clientX) - a0;
      const db = (vertical ? t.clientX : t.clientY) - b0;
      if (!decided) {
        if (Math.abs(da) < 8 && Math.abs(db) < 8) return;
        // Wrong axis, or the wrong way along the right one, and the gesture
        // belongs to whatever is under it.
        if (Math.abs(db) >= Math.abs(da) || (vertical ? da < 0 : da > 0)) { live = false; return; }
        decided = true; document.body.classList.add(dragClass);
      }
      el.style.transform = vertical
        ? 'translateY(' + Math.max(0, da).toFixed(1) + 'px)'
        : 'translateX(' + Math.min(0, da).toFixed(1) + 'px)';
    }, { passive: true });
    const end = () => {
      if (!live) return;
      live = false;
      const moved = Math.abs(parseFloat((el.style.transform.match(/-?[\d.]+/) || [0])[0]) || 0);
      document.body.classList.remove(dragClass);
      el.style.transform = '';
      if (decided && moved > (vertical ? el.offsetHeight : el.offsetWidth) * 0.3) close();
    };
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', end, { passive: true });
  }

  window.MobiusSheet = { watch, bindToggle, bindPanel };
})();
