/* Locus inside Lucky HQ (2026-11-11). Loaded BEFORE the main script; LocusHQ.wire() runs right before boot().
   Lucky HQ (hq.luckygolf.com) opens Locus in a frame with ?hq=1&s=<section>&mode=<light|dark>. In that frame Locus:
     - is Lucky Golf and nothing else: no brand picker, no Agency view, only the ad pages below;
     - hides its own rail, tabs and sign-out (HQ draws those);
     - follows {type:'hq:go', section} and {type:'hq:theme', mode} from HQ, and answers {type:'locus:at', section} on
       every page change and {type:'locus:signin'} when it has no session.
   SIGN-IN. Locus is on another site than HQ, so the browser gives the frame its own empty storage: the person's normal
   Locus sign-in is not there and is never used here. HQ answers locus:signin with {type:'hq:pass', pass}, a one-minute
   pass it signed; account-health POST /api/hq-signin swaps it for a session that can only ever be Lucky Golf (a client
   login marked hq, see clients.js hqSignin and brandguard.js). The session lives in this frame's sessionStorage only.
   Any session here that is not that Lucky-only login is thrown away. Opened any other way, nothing in this file runs. */
(function () {
  'use strict';
  const ORIGINS = ['https://hq.luckygolf.com', 'http://localhost:8787', 'http://127.0.0.1:8787'];
  const BRAND = 'brand_lucky_golf';
  /* HQ's tab -> the Locus page, and every Locus page that may open here -> the HQ tab it belongs to. */
  const PAGE = { calls: 'buyer', launch: 'launch', campaigns: 'campaigns', ads: 'adcreative', changes: 'changes', updates: 'adupdates' };
  const SECTION = { buyer: 'calls', today: 'calls', launch: 'launch', meta: 'campaigns', mtoday: 'campaigns', campaigns: 'campaigns', adcreative: 'ads', mbrowser: 'ads', changes: 'changes', adupdates: 'updates' };
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} }, del: k => { try { sessionStorage.removeItem(k); } catch (e) {} } };

  const Q = new URLSearchParams(location.search);
  let framed = false; try { framed = window.parent !== window; } catch (e) { framed = true; }
  let hq = null;
  if (framed) {
    try { const a = location.ancestorOrigins && location.ancestorOrigins[0]; if (ORIGINS.includes(a)) hq = a; } catch (e) {}
    if (!hq) { try { const r = document.referrer ? new URL(document.referrer).origin : ''; if (ORIGINS.includes(r)) hq = r; } catch (e) {} }
    if (!hq && ORIGINS.includes(ss.get('locus_hq_from'))) hq = ss.get('locus_hq_from');   // a reload inside the frame
  }
  const on = !!hq && (Q.get('hq') === '1' || ss.get('locus_hq') === '1');
  if (!on) { window.LocusHQ = { on: false }; return; }
  ss.set('locus_hq', '1'); ss.set('locus_hq_from', hq);

  const tell = msg => { try { window.parent.postMessage(msg, hq); } catch (e) {} };
  const mode = m => { if (m === 'light' || m === 'dark') { ss.set('locus_hq_mode', m); document.documentElement.dataset.theme = m; } };
  mode(Q.get('mode') || ss.get('locus_hq_mode') || 'light');

  document.documentElement.classList.add('in-hq');
  const css = document.createElement('style');
  css.textContent = `
    html.in-hq .side, html.in-hq #tabbar, html.in-hq #navToggle, html.in-hq #navScrim, html.in-hq .hd-title, html.in-hq #foot,
    html.in-hq #clientPick, html.in-hq #pfPick, html.in-hq #pfMe, html.in-hq #btnOut, html.in-hq #roleSeg, html.in-hq #btnGuide,
    html.in-hq #hdMake, html.in-hq #v2seg, html.in-hq #tbAsk,
    html.in-hq #byWwd, html.in-hq #byDrops, html.in-hq #bySlack, html.in-hq #byDays { display: none !important; }
    html.in-hq .app { grid-template-columns: minmax(0, 1fr) !important; }
    html.in-hq body { padding-bottom: 0 !important; }
    html.in-hq .hq-wait { max-width: 360px; margin: 18vh auto 0; text-align: center; color: var(--muted, #6b7280); font-size: 14px; }
    html.in-hq .hq-wait b { display: block; color: var(--ink, #111); font-size: 17px; margin-bottom: 6px; }`;
  document.head.appendChild(css);

  let asks = 0, booted = false, wanted = null;
  const start = PAGE[Q.get('s')] || 'buyer';

  window.LocusHQ = {
    on: true, brand: BRAND, start,
    tok: () => ss.get('locus_hq_tok') || '',
    /* Runs once, right before boot(): the main script's functions exist by then. */
    wire() {
      const wait = (title, text) => { chrome(false); document.body.classList.remove('lx-gate-on'); $('#main').innerHTML = `<div class="hq-wait"><b>${esc(title)}</b>${esc(text || '')}</div>`; };
      /* No session, or one Locus refused: ask HQ for a pass. Never draws the Locus sign-in page. */
      renderGate = function () {
        booted = false; S.tok = ''; ss.del('locus_hq_tok');
        if (asks >= 3) return wait('Locus could not sign in', 'Reload Lucky HQ and open Ads again.');
        asks++; wait('Opening Locus', 'Signing in through Lucky HQ.');
        tell({ type: 'locus:signin' });
      };
      /* The only login allowed in here is the Lucky-only HQ login. Anything else is dropped and asked for again. */
      const _client = applyClientMode;
      applyClientMode = function () {
        const ok = S.role === 'client' && S.client && S.client.hq === true && S.accounts.length > 0 && S.accounts.every(a => a.act_id === BRAND);
        if (!ok) throw new Error('unauthorized');
        S.act = BRAND; booted = true;
        return _client.apply(this, arguments);
      };
      /* The team's Launch page is open to this login (the server holds it to Lucky). */
      const _ok = clientTabOk;
      clientTabOk = t => t === 'launch' || _ok(t);
      const _show = show;
      show = function (tab, opt) {
        if (!SECTION[tab]) tab = SECTION[S.tab] ? S.tab : 'buyer';
        if (S.act !== BRAND) S.act = BRAND;
        const out = _show.call(this, tab, opt);
        tell({ type: 'locus:at', section: SECTION[S.tab] || 'calls' });
        if (wanted) { const w = wanted; wanted = null; if (PAGE[w] && PAGE[w] !== S.tab) show(PAGE[w]); }
        return out;
      };
      addEventListener('message', async e => {
        if (e.origin !== hq || e.source !== window.parent || !e.data || typeof e.data !== 'object') return;
        const d = e.data;
        if (d.type === 'hq:theme') { mode(d.mode); if (typeof paintTheme === 'function') paintTheme(); if (booted) show(S.tab); }
        if (d.type === 'hq:go') { const s = String(d.section || ''); if (!PAGE[s]) return; if (!booted) { wanted = s; return; } if (PAGE[s] !== S.tab) show(PAGE[s]); else tell({ type: 'locus:at', section: s }); }
        if (d.type === 'hq:pass' && !booted && typeof d.pass === 'string') {
          try {
            const r = await fetch(AH_URL + '/api/hq-signin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass: d.pass }) });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j.token || j.hq !== true) throw new Error(j.error || 'no session');
            ss.set('locus_hq_tok', j.token); S.tok = j.token; S.tab = SECTION[S.tab] ? S.tab : start;
            boot();
          } catch (err) { wait('Locus could not sign in', 'Reload Lucky HQ and open Ads again.'); }
        }
      });
    },
  };
})();
