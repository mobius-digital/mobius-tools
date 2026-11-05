/* SITE REVIEW KIT (2026-11-05). Loaded by every review document under profit/reviews/<brand>/<slug>/index.html.
 * The document stays as it was designed; this adds, to every <section class="ba">, Approve / Needs changes and a
 * notes box, a progress bar fixed to the bottom, and at the end an overall note with "Send my review".
 * The page names its review on <body data-review-act="brand_x" data-review-slug="site-rebuild" data-review-title="...">.
 * Two ways in: ?t=<token> (no login, the link Cole sends), or a Locus sign-in on this browser (pf_token), which
 * the worker accepts only for that brand's client login or the team. Engine: account-health src/sitereview.js.
 * Uses the document's own colour tokens (--paper, --ink, --line, --gold, --ok, --bad...) so it matches any review. */
(() => {
  const B = document.body.dataset;
  const ACT = B.reviewAct || '', SLUG = B.reviewSlug || '', TITLE = B.reviewTitle || document.title;
  const AH = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (() => { try { return localStorage.getItem('pf_ah'); } catch { return null; } })()) || 'https://mobius-account-health.mobius-digital.workers.dev';
  const TOK = new URLSearchParams(location.search).get('t') || '';
  let SESSION = ''; try { SESSION = localStorage.getItem('pf_token') || ''; } catch {}
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SECS = [...document.querySelectorAll('section.ba[id]')].map(el => ({ el, id: el.id, title: ((el.querySelector('h2') || {}).textContent || el.id).trim() }));
  const sections = SECS.map(s => ({ id: s.id, title: s.title }));
  let NAME = ''; try { NAME = localStorage.getItem('rv_name') || ''; } catch {}
  const A = new Map();   // section -> { status, note }
  let SENT = null, OVERALL = '';

  const css = document.createElement('style');
  css.textContent = `
  .rk{margin-top:4px;border:1px solid var(--line);border-left:4px solid var(--line);background:var(--paper);border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
  .rk[data-st="approved"]{border-left-color:var(--ok)} .rk[data-st="changes"]{border-left-color:var(--bad)}
  .rk-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .rk-q{font:700 11px/1 var(--body,system-ui);letter-spacing:1.4px;text-transform:uppercase;color:var(--muted);flex:1;min-width:140px}
  .rk-b{font:600 14px/1 var(--body,system-ui);min-height:44px;padding:0 18px;border-radius:999px;border:1.5px solid var(--line);background:var(--paper);color:var(--ink);cursor:pointer;display:inline-flex;align-items:center;gap:8px}
  .rk-b:hover{border-color:var(--ink)} .rk-b:disabled{opacity:.5;cursor:default}
  .rk-b[aria-pressed="true"].ok{background:var(--ok);border-color:var(--ok);color:#fff} .rk-b[aria-pressed="true"].no{background:var(--bad);border-color:var(--bad);color:#fff}
  .rk-b.pri{background:var(--ink);border-color:var(--ink);color:var(--paper)}
  .rk textarea,.rk-end textarea,.rk-sheet input{width:100%;font:15px/1.5 var(--body,system-ui);color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px 12px;resize:vertical}
  .rk textarea{min-height:64px} .rk textarea:focus,.rk-end textarea:focus,.rk-sheet input:focus{outline:2px solid var(--gold);outline-offset:1px}
  .rk-s{font-size:12px;color:var(--muted);min-height:16px}
  .rk-bar{position:fixed;left:0;right:0;bottom:0;z-index:50;background:var(--paper);border-top:1px solid var(--line);box-shadow:0 -6px 24px rgba(0,0,0,.08);
    padding:10px max(16px,env(safe-area-inset-right,0px)) calc(10px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))}
  .rk-bar .in{max-width:1240px;margin:0 auto;display:flex;align-items:center;gap:12px}
  .rk-bar .p{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
  .rk-bar .p b{font-size:14px} .rk-bar .dots{display:flex;gap:3px} .rk-bar .dots i{flex:1;height:5px;border-radius:3px;background:var(--line)}
  .rk-bar .dots i.ok{background:var(--ok)} .rk-bar .dots i.no{background:var(--bad)}
  body.rk-on{padding-bottom:84px}
  .rk-end{border:1px solid var(--line);background:var(--paper);border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:12px}
  .rk-end h2{margin:0}
  .rk-sent{border:1px solid var(--ok);background:var(--okbg);color:var(--ink);border-radius:10px;padding:12px 16px;font-size:14px}
  .rk-veil{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}
  .rk-sheet{background:var(--paper);color:var(--ink);border-radius:14px;padding:20px;width:min(460px,100%);display:flex;flex-direction:column;gap:12px;max-height:85vh;overflow:auto}
  .rk-sheet h3{margin:0;font-size:24px} .rk-sheet p{margin:0;color:var(--muted)} .rk-sheet .row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
  .rk-sheet ul{margin:0;padding-left:18px;font-size:13.5px}
  .rk-err{color:var(--bad);font-size:13px}
  @media (max-width:640px){
    .rk-veil{align-items:flex-end;padding:0}
    .rk-sheet{width:100%;border-radius:16px 16px 0 0;padding-bottom:calc(20px + env(safe-area-inset-bottom,0px));animation:rkup .22s ease-out}
    .rk-sheet .row .rk-b{flex:1;justify-content:center}
    .rk-h .rk-b{flex:1;justify-content:center}
  }
  .rk[hidden],.rk-end[hidden],.rk-b[hidden]{display:none!important}
  @keyframes rkup{from{transform:translateY(100%)}to{transform:none}}`;
  document.head.appendChild(css);

  const call = async (sub, method = 'GET', body) => {
    let url, headers = {};
    if (TOK) url = `${AH}/api/site-review/t/${TOK}${sub}`;
    else { url = `${AH}/api/site-review${sub}${method === 'GET' ? `?act=${encodeURIComponent(ACT)}&slug=${encodeURIComponent(SLUG)}` : ''}`; headers.Authorization = 'Bearer ' + SESSION; }
    if (body) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(TOK ? { ...body, who: NAME } : { ...body, act: ACT, slug: SLUG }); }
    const r = await fetch(url, { method, headers, body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || `Something went wrong (${r.status}). Try again.`);
    return j;
  };

  /* a sheet: centred on a computer, up from the bottom on a phone. Resolves with the pressed button's value. */
  const sheet = (html, onOpen) => new Promise(done => {
    const v = document.createElement('div'); v.className = 'rk-veil';
    v.innerHTML = `<div class="rk-sheet" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(v);
    const close = val => { v.remove(); done(val); };
    v.addEventListener('click', e => { if (e.target === v) close(null); const b = e.target.closest('[data-v]'); if (b) close(b.dataset.v === 'go' ? (v.querySelector('input') || {}).value ?? 'go' : null); });
    v.addEventListener('keydown', e => { if (e.key === 'Escape') close(null); if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); close(e.target.value); } });
    if (onOpen) onOpen(v);
    (v.querySelector('input') || v.querySelector('[data-v="go"]')).focus();
  });
  const askName = async () => {
    if (!TOK || NAME) return true;
    const v = await sheet(`<h3>Who's reviewing?</h3><p>So the team knows who signed off. Asked once on this device.</p><input autocomplete="name" maxlength="60" placeholder="Your name"><div class="row"><button class="rk-b" data-v="x" type="button">Cancel</button><button class="rk-b pri" data-v="go" type="button">Start</button></div>`);
    const n = String(v || '').trim(); if (!n) return false;
    NAME = n; try { localStorage.setItem('rv_name', NAME); } catch {}
    return true;
  };

  const reviewed = () => SECS.filter(s => (A.get(s.id) || {}).status).length;
  const paintBar = () => {
    const n = reviewed(), all = SECS.length, ch = SECS.filter(s => (A.get(s.id) || {}).status === 'changes').length;
    bar.querySelector('.p b').textContent = SENT ? `Sent. ${n} of ${all} reviewed` : `${n} of ${all} reviewed${ch ? `, ${ch} need${ch === 1 ? 's' : ''} changes` : ''}`;
    bar.querySelector('.dots').innerHTML = SECS.map(s => { const st = (A.get(s.id) || {}).status; return `<i class="${st === 'approved' ? 'ok' : st === 'changes' ? 'no' : ''}" title="${esc(s.title)}"></i>`; }).join('');
    const nx = bar.querySelector('[data-next]');
    nx.textContent = SENT ? 'See summary' : n < all ? 'Next page' : 'Send my review';
  };
  const paintSec = s => {
    const a = A.get(s.id) || { status: '', note: '' }, box = s.box;
    box.dataset.st = a.status || '';
    box.querySelectorAll('[data-st]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.st === a.status)); b.disabled = !!SENT; });
    const ta = box.querySelector('textarea'); if (document.activeElement !== ta) ta.value = a.note || ''; ta.disabled = !!SENT;
    ta.placeholder = a.status === 'changes' ? 'What should change on this page?' : 'Notes for this page (optional)';
  };
  const paintEnd = () => {
    const sentBox = end.querySelector('.rk-sent');
    if (SENT) { sentBox.hidden = false; sentBox.innerHTML = `<b>Sent${SENT.by ? ` by ${esc(SENT.by)}` : ''}, ${esc(new Date(SENT.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}.</b> Thank you. The team has it. Need to change something? Message your Mobius contact and we'll reopen it.`; }
    else sentBox.hidden = true;
    const ta = end.querySelector('textarea'); if (document.activeElement !== ta) ta.value = OVERALL; ta.disabled = !!SENT;
    end.querySelector('[data-send]').hidden = !!SENT;
  };
  const paintAll = () => { SECS.forEach(paintSec); paintBar(); paintEnd(); };

  const save = async (s, patch) => {
    const a = { ...(A.get(s.id) || { status: '', note: '' }), ...patch };
    const st = s.box.querySelector('.rk-s');
    if (!(await askName())) return;
    A.set(s.id, a); paintSec(s); paintBar();
    st.textContent = 'Saving…'; st.style.color = '';
    try { await call('/answer', 'PUT', { section: s.id, status: a.status, note: a.note, sections }); st.textContent = 'Saved'; }
    catch (e) { st.textContent = e.message; st.style.color = 'var(--bad)'; }
  };

  /* the controls under each page */
  SECS.forEach(s => {
    const box = document.createElement('div'); box.className = 'rk'; s.box = box;
    box.innerHTML = `<div class="rk-h"><span class="rk-q">Your call on this page</span><button type="button" class="rk-b ok" data-st="approved" aria-pressed="false">✓ Approve</button><button type="button" class="rk-b no" data-st="changes" aria-pressed="false">Needs changes</button></div>
      <textarea rows="2" maxlength="2000" aria-label="Notes for ${esc(s.title)}"></textarea><span class="rk-s" aria-live="polite"></span>`;
    s.el.appendChild(box);
    box.querySelectorAll('[data-st]').forEach(b => b.onclick = async () => {
      const cur = (A.get(s.id) || {}).status, st = cur === b.dataset.st ? '' : b.dataset.st;
      await save(s, { status: st, note: box.querySelector('textarea').value });
      if (st === 'changes' && !box.querySelector('textarea').value.trim()) box.querySelector('textarea').focus();
    });
    let t = null; const ta = box.querySelector('textarea');
    const flush = () => { clearTimeout(t); t = null; const a = A.get(s.id) || { status: '', note: '' }; if (ta.value !== (a.note || '')) save(s, { note: ta.value }); };
    ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(flush, 1000); box.querySelector('.rk-s').textContent = ''; });
    ta.addEventListener('blur', flush);
  });

  /* the end: overall note and Send */
  const end = document.createElement('section'); end.className = 'rk-end'; end.id = 'send-review';
  end.innerHTML = `<span class="eyebrow">Your review</span><h2>Anything else?</h2><div class="rk-sent" hidden></div>
    <textarea rows="4" maxlength="3000" placeholder="Overall thoughts, questions, anything we missed (optional)" aria-label="Overall note"></textarea>
    <div><button type="button" class="rk-b pri" data-send>Send my review</button></div><span class="rk-err" aria-live="polite"></span>`;
  const host = SECS.length ? SECS[SECS.length - 1].el : null;
  if (host) host.after(end);
  end.querySelector('textarea').addEventListener('input', e => { OVERALL = e.target.value; });

  const doSend = async () => {
    if (!(await askName())) return;
    const ok = SECS.filter(s => (A.get(s.id) || {}).status === 'approved'), ch = SECS.filter(s => (A.get(s.id) || {}).status === 'changes'), open = SECS.filter(s => !(A.get(s.id) || {}).status);
    const v = await sheet(`<h3>Send your review?</h3><p><b style="color:var(--ink)">${ok.length} approved, ${ch.length} need${ch.length === 1 ? 's' : ''} changes${open.length ? `, ${open.length} not reviewed` : ''}.</b> Mobius gets it right away. After this it's locked.</p>
      ${open.length ? `<p>Not reviewed yet:</p><ul>${open.map(s => `<li>${esc(s.title)}</li>`).join('')}</ul>` : ''}
      <div class="row"><button class="rk-b" data-v="x" type="button">${open.length ? 'Keep reviewing' : 'Back'}</button><button class="rk-b pri" data-v="go" type="button">Send</button></div>`);
    if (!v) return;
    const err = end.querySelector('.rk-err'); err.textContent = '';
    const btn = end.querySelector('[data-send]'); btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const r = await call('/send', 'POST', { overall: end.querySelector('textarea').value, sections, title: TITLE, path: location.pathname.replace(/^.*?\/profit\//, '') });
      SENT = { at: r.sent_at, by: NAME || '' }; OVERALL = end.querySelector('textarea').value; paintAll();
      end.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) { err.textContent = e.message; }
    btn.disabled = false; btn.textContent = 'Send my review'; btn.hidden = !!SENT;
  };
  end.querySelector('[data-send]').onclick = doSend;

  /* the bar */
  const bar = document.createElement('div'); bar.className = 'rk-bar';
  bar.innerHTML = `<div class="in"><div class="p"><b>Loading your review…</b><div class="dots"></div></div><button type="button" class="rk-b pri" data-next>Next page</button></div>`;
  document.body.appendChild(bar); document.body.classList.add('rk-on');
  bar.querySelector('[data-next]').onclick = () => {
    const next = SECS.find(s => !(A.get(s.id) || {}).status);
    if (SENT || !next) { end.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (!SENT) end.querySelector('textarea').focus({ preventScroll: true }); return; }
    next.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const fail = msg => { bar.querySelector('.p b').textContent = msg; bar.querySelector('[data-next]').hidden = true; SECS.forEach(s => s.box.hidden = true); end.hidden = true; };
  if (!TOK && !SESSION) { fail('Open this page from the link Mobius sent you, or sign in to Locus first.'); return; }
  if (TOK && !/^[a-f0-9]{32}$/.test(TOK)) { fail('This link is not complete. Copy the whole link from the message.'); return; }
  call('').then(d => {
    for (const a of d.answers || []) A.set(a.section, { status: a.status || '', note: a.note || '' });
    if (d.sent_at) SENT = { at: d.sent_at, by: d.sent_by || '' };
    OVERALL = d.overall || '';
    paintAll();
  }).catch(e => fail(/unauthorized/i.test(e.message) ? 'Sign in to Locus again, or open the link Mobius sent you.' : e.message));
})();
