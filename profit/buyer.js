/* THE BUYER LIST (2026-10-26, Cole approved in chat). Ads > Buyer list, the first page under Ads, in Agency view (every
 * brand) and for one brand. ONE list sorted by money at stake: the ad calls (hub.js buyerList: Scale, Cut, Trim,
 * Refresh, Mixed), test minimums due off, and Production cards in Ready with approved ads not on Meta yet.
 * Each row: brand, the ad set or ad, the action in plain words, one line of why, and Do / Skip / Open.
 *   Do    Scale / Cut / Trim: the shared Meta write (nudge.js window.LxMetaWrite: dry run, before and after, write, Undo).
 *         Test minimum: /api/meta/write kind min_spend, min 0 (the same dry run, then the write with expect, Undo).
 *         Launch: the existing Launch to Meta window (launch.js), the ads go up paused.
 *         Refresh: asks Locus to brief the new version. Mixed has no Do: Done marks it decided.
 *   Skip  quiet until tomorrow, for everyone. Done is quiet 3 days. A change written to Meta in the last 3 days hides
 *         the call too (watch 3 days). The state is on the server (account-health buyerlist.js, p_buyer_state), shared
 *         with Ads > Today's calls; never localStorage.
 *   Open  the ad set on Campaigns, the ad on Ads, the card on Production.
 * Server: account-health GET /api/buyer-list, POST /api/buyer-list/state, PUT /api/buyer-list/settings,
 * GET /api/buyer-list/preview (the one daily Slack post, settings buyerPost / buyerChannel / buyerOwner).
 * The host passes { S, api, apiAH, show, pageHead, pageActions, confirmModal, AskUI, RUN }. */
(() => {
  let H = null;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sym = c => (!c || c === 'USD' ? '$' : c === 'GBP' ? '£' : c === 'EUR' ? '€' : c === 'CAD' ? 'CA$' : c === 'AUD' ? 'A$' : c + ' ');
  const money = (n, c) => n == null || !isFinite(n) ? '' : sym(c) + Math.round(n).toLocaleString('en-US');
  const kmoney = (n, c) => Math.abs(n) >= 1e4 ? `${sym(c)}${(n / 1e3).toFixed(1)}K` : money(n, c);
  const OWNERS = ['Cole', 'Ahsan', 'Noma', 'William', 'Ravo', 'Radhesh', 'Hamza'];
  const KIND_LABEL = { all: 'All', cut: 'Cut', scale: 'Scale', trim: 'Trim', refresh: 'Refresh', mixed: 'Your call', minoff: 'Test minimums', launch: 'Launch' };
  const CHIP = { cut: 'CUT', scale: 'SCALE', trim: 'TRIM', refresh: 'REFRESH', mixed: 'YOUR CALL', minoff: 'MINIMUM', launch: 'LAUNCH' };
  const DO_LABEL = { budget: 'Do', pause: 'Do', minoff: 'Do', launch: 'Do', brief: 'Do' };
  const DO_TIP = { budget: 'Raise this ad set\'s budget 20%. You see the number and confirm before anything is written.', pause: 'Turn it off in Meta. You see it first and confirm.',
    minoff: 'Set the test minimum to $0 in Meta. You see it first and confirm.', launch: 'Opens Launch to Meta for this card. The ads go up paused.', brief: 'Ask Locus to brief a new version of the main ad.' };
  let KIND = 'all', SHOWQ = false, DATA = null, BUSY = false;

  function css() {
    if (document.getElementById('bycss')) return;
    const st = document.createElement('style'); st.id = 'bycss';
    st.textContent = `
      .by .by-lead{margin:0 0 12px}
      .by .by-own{display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap}
      .by .by-chips{margin:0 0 12px}
      .by .by-chips button{display:inline-flex;gap:6px;align-items:center}
      .by .by-chips button b{font-variant-numeric:tabular-nums}
      .by .by-row{display:grid;grid-template-columns:150px minmax(0,1.1fr) minmax(0,1.6fr) 96px 228px;gap:12px;align-items:center;padding:11px 0;border-top:1px solid var(--line)}
      .by .by-row:first-of-type{border-top:0}
      .by .by-row.head{font-size:11.5px;color:var(--muted);padding:2px 0 6px;border-top:0}
      .by .by-br{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .by .by-nm{min-width:0}
      .by .by-nm .n{font-weight:550;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;word-break:break-word}
      .by .by-nm .s{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .by .by-what{min-width:0;display:flex;flex-direction:column;gap:4px}
      .by .by-act{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-weight:600}
      .by .by-why{font-size:12.5px;color:var(--muted);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
      .by .by-st{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
      .by .by-st small{display:block;font-size:11px;font-weight:400;color:var(--muted)}
      .by .by-k{font-size:10px;font-weight:700;letter-spacing:.05em;padding:3px 6px;border-radius:5px;background:var(--surface-2);color:var(--ink)}
      .by .by-k.scale{background:var(--good-bg);color:var(--good)}.by .by-k.cut{background:var(--bad-bg);color:var(--bad)}.by .by-k.trim,.by .by-k.minoff{background:var(--warn-bg);color:var(--warn)}
      .by .by-k.refresh,.by .by-k.launch{background:var(--brand-soft);color:var(--brand)}
      .by .by-btns{display:flex;gap:6px;justify-content:flex-end}
      .by .by-btns .v2btn{margin:0;min-width:64px}
      .by .by-q{opacity:.75}
      .by .by-q .by-why{-webkit-line-clamp:1}
      .by .by-foot{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px;font-size:12.5px;color:var(--muted)}
      .by .by-notes{font-size:12px;color:var(--muted);margin-top:8px}
      .by-form label{display:flex;flex-direction:column;gap:4px;margin:0 0 12px;font-size:13px}
      .by-form label.row{flex-direction:row;align-items:center;gap:8px}
      .by-form label.row input{width:auto}
      .by-pre{white-space:pre-wrap;font:12.5px/1.5 var(--mono,ui-monospace,monospace);background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:10px 12px;max-height:260px;overflow:auto;margin:0 0 12px}
      @media (max-width:900px){
        .by .by-row{grid-template-columns:1fr auto;grid-template-areas:"br st" "nm nm" "what what" "btns btns";gap:6px 10px;padding:14px 0}
        .by .by-row.head{display:none}
        .by .by-br{grid-area:br}.by .by-st{grid-area:st}.by .by-nm{grid-area:nm}.by .by-what{grid-area:what}.by .by-btns{grid-area:btns;justify-content:stretch}
        .by .by-btns .v2btn{flex:1;min-height:44px}
        .by .by-st small{display:inline;margin-left:4px}
      }`;
    document.head.appendChild(st);
  }
  const toast = (msg, bad, undo) => {
    document.querySelectorAll('.lx-toast.by-t').forEach(x => x.remove());
    const t = document.createElement('div'); t.className = `lx-toast by-t${bad ? ' bad' : ''}`; t.setAttribute('role', 'status');
    t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Undo</button>' : ''}`;
    if (undo) t.querySelector('button').onclick = () => { t.remove(); undo(); };
    document.body.appendChild(t); setTimeout(() => t.remove(), undo ? 10000 : bad ? 6000 : 3000);
  };
  /* One in-app modal (a .modal-wrap: centred on a computer, a bottom sheet on a phone). onYes returns a promise; an error
     stays in the modal. */
  function modal(title, hint, body, cta, onYes) {
    const w = document.createElement('div'); w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal lx-nudge-m" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>${hint ? `<p class="hint">${hint}</p>` : ''}<div class="by-form lx-nudge-mb">${body}</div><p class="lx-nudge-err" data-err hidden></p>
      <div class="row lx-nudge-ma"><button class="btn" data-m="no" type="button">Cancel</button>${cta ? `<button class="btn primary" data-m="yes" type="button">${esc(cta)}</button>` : ''}</div></div>`;
    document.body.appendChild(w);
    const yes = w.querySelector('[data-m="yes"]'), err = w.querySelector('[data-err]');
    const close = () => { w.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    w.querySelector('[data-m="no"]').onclick = close;
    if (yes) yes.onclick = async () => {
      yes.disabled = true; const was = yes.textContent; yes.textContent = 'Working…'; err.hidden = true;
      try { await onYes(w); close(); } catch (e) { err.textContent = e.message || 'That did not work.'; err.hidden = false; yes.disabled = false; yes.textContent = was; }
    };
    return { w, close, yes, err };
  }
  const ah = (path, body, method) => H.apiAH(path, body ? { method: method || 'POST', body: JSON.stringify(body) } : undefined);
  const state = (r, status) => ah('/api/buyer-list/state', { act: r.act_id, object: r.object, action: r.kind, status, name: r.name });
  const pickAct = (id, tab) => { H.S.act = id; try { localStorage.setItem('pf_act', id); } catch {} const cp = document.getElementById('clientPick'); if (cp) cp.value = id; H.show(tab); };
  const firstName = e => { const s = String(e || ''); if (!s.includes('@')) return s; const n = s.split('@')[0].split(/[._-]/)[0]; return n ? n[0].toUpperCase() + n.slice(1) : s; };

  async function render(host, first) {
    H = host; css();
    const t = H.RUN();
    const one = H.S.act !== 'all' ? H.S.accounts.find(a => a.act_id === H.S.act) : null;
    const title = one ? `Buyer list: ${esc(one.name)}` : 'Buyer list';
    const shell = body => `<div class="v2 by">${H.pageHead('buyer', title).replace(/<p class="ph-sub">[\s\S]*?<\/p>/, '')}${body}</div>`;
    if (first || !DATA || DATA.act !== (one ? one.act_id : 'all')) $('#main').innerHTML = shell('<section class="v2card"><p class="v2hint">Reading every brand&rsquo;s calls, test minimums and cards ready to launch&hellip;</p></section>');
    let d;
    try { d = await H.apiAH(`/api/buyer-list?act=${encodeURIComponent(one ? one.act_id : 'all')}`); if (d && d.error) throw new Error(d.error); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell(`<section class="v2card"><h3>Could not load the list</h3><p class="v2bad">${esc(e.message)}</p><button type="button" class="v2btn" id="byRetry">Try again</button></section>`); const b = $('#byRetry'); if (b) b.onclick = () => render(H, true); return; }
    if (t !== H.RUN()) return;
    DATA = d; paint();
  }

  function paint() {
    const d = DATA, one = d.act !== 'all';
    const rows = d.rows || [];
    const shown = rows.filter(r => KIND === 'all' || r.kind === KIND);
    const kinds = ['all', 'cut', 'scale', 'trim', 'refresh', 'mixed', 'minoff', 'launch'].filter(k => k === 'all' || (d.counts || {})[k]);
    const chips = kinds.length > 2 ? `<div class="v2jobs by-chips" role="group" aria-label="Kind">${kinds.map(k => `<button type="button" class="${KIND === k ? 'on' : ''}" data-k="${k}" aria-pressed="${KIND === k}"><b>${k === 'all' ? rows.length : d.counts[k]}</b>${KIND_LABEL[k]}</button>`).join('')}</div>` : '';
    const stake = d.stake > 0 ? `, <b>${esc(kmoney(d.stake, d.currency))}</b> at stake` : '';
    const lead = `<p class="v2say lead by-lead"><b>${d.n} to do</b>${one ? '' : ` across ${d.n_brands} brand${d.n_brands === 1 ? '' : 's'}`}${stake}. <span class="by-own">Owner: <b>${esc(d.owner)}</b> <button type="button" class="v2link" id="byOwner">Change</button></span></p>`;
    const head = `<div class="by-row head" aria-hidden="true"><span>Brand</span><span>Ad set or ad</span><span>What to do, and why</span><span style="text-align:right">At stake</span><span></span></div>`;
    const list = shown.length ? `<section class="v2card">${head}${shown.map(row).join('')}</section>`
      : `<section class="v2card"><h3>Nothing to do</h3><p class="v2hint">${KIND === 'all' ? 'No ad set crossed a rule, no test minimum is due off and no card is waiting to launch. Done and skipped calls come back when they are due.' : 'Nothing of this kind right now.'}</p></section>`;
    const h = d.hidden || {}, nq = (h.done || 0) + (h.skipped || 0) + (h.watched || 0);
    const foot = `<div class="by-foot"><span>Sorted by money at stake. A minimum counts a week of it; launches have no money yet.</span>${nq ? `<button type="button" class="v2link" id="byQuiet">${SHOWQ ? 'Hide' : 'Show'} ${nq} quiet: ${[h.done ? `${h.done} done` : '', h.skipped ? `${h.skipped} skipped until tomorrow` : '', h.watched ? `${h.watched} changed in Meta in the last 3 days` : ''].filter(Boolean).join(', ')}</button>` : ''}</div>`;
    const quiet = SHOWQ && nq ? `<section class="v2card"><div class="v2h"><h3>Quiet for now</h3><span class="find">Done stays quiet 3 days, Skip until tomorrow, and a change made in Meta is watched 3 days before it is judged again.</span></div>${(d.quiet || []).map(qrow).join('')}</section>` : '';
    const notes = (d.notes || []).length ? `<p class="by-notes">Could not read everything: ${esc(d.notes.join(' · '))}</p>` : '';
    $('#main').innerHTML = `<div class="v2 by">${H.pageHead('buyer', one ? `Buyer list: ${esc((H.S.accounts.find(a => a.act_id === d.act) || {}).name || '')}` : 'Buyer list').replace(/<p class="ph-sub">[\s\S]*?<\/p>/, '')}${lead}${chips}${list}${foot}${quiet}${notes}</div>`;
    if (typeof H.pageActions === 'function') H.pageActions('<button type="button" class="btn" id="bySlack" title="The one Buyer list post a day in Slack: where it goes, on or off, and what it says now.">Slack post</button>');
    wire();
  }
  function row(r) {
    const k = esc(r.key), cur = r.currency || 'USD';
    const sub = r.kind === 'launch' ? 'Production, Ready' : r.set ? `in ${r.set}` : r.level === 'adset' ? 'Ad set' : '';
    const primary = r.do ? `<button type="button" class="v2btn" data-do="${k}" title="${esc(DO_TIP[r.do] || '')}">${DO_LABEL[r.do] || 'Do'}</button>`
      : `<button type="button" class="v2btn" data-done="${k}" title="Mark it decided. It stays quiet 3 days.">Done</button>`;
    return `<div class="by-row" data-key="${k}">
      <span class="by-br" title="${esc(r.brand)}">${esc(r.brand)}</span>
      <div class="by-nm"><div class="n" title="${esc(r.name)}">${esc(r.name)}</div>${sub ? `<div class="s" title="${esc(sub)}">${esc(sub)}</div>` : ''}</div>
      <div class="by-what"><div class="by-act"><span class="by-k ${esc(r.kind)}">${CHIP[r.kind] || esc(r.kind.toUpperCase())}</span>${esc(r.action)}</div><div class="by-why" title="${esc(r.why_full || r.why)}">${esc(r.why)}</div></div>
      <span class="by-st">${r.stake > 0 ? esc(money(r.stake, cur)) : '&ndash;'}<small>${r.stake > 0 ? 'at stake' : r.kind === 'launch' ? 'new ads' : ''}</small></span>
      <div class="by-btns">${primary}<button type="button" class="v2btn ghost" data-skip="${k}" title="Hide it for everyone until tomorrow.">Skip</button><button type="button" class="v2btn ghost" data-open="${k}" title="${r.kind === 'launch' ? 'Open the card on Production.' : 'Open it in Locus.'}">Open</button></div></div>`;
  }
  function qrow(r) {
    const hb = r.hidden || {}, when = hb.at ? new Date(hb.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const why = hb.why === 'done' ? `Done by ${firstName(hb.by) || 'someone'} ${when}, quiet until ${hb.until}` : hb.why === 'skipped' ? `Skipped by ${firstName(hb.by) || 'someone'}, back tomorrow` : `Changed in Meta ${when} by ${firstName(hb.by) || 'someone'}${hb.summary ? `: ${hb.summary}` : ''}. Watched 3 days.`;
    return `<div class="by-row by-q" data-key="${esc(r.key)}"><span class="by-br">${esc(r.brand)}</span><div class="by-nm"><div class="n">${esc(r.name)}</div></div>
      <div class="by-what"><div class="by-act"><span class="by-k ${esc(r.kind)}">${CHIP[r.kind] || ''}</span>${esc(r.action)}</div><div class="by-why" title="${esc(why)}">${esc(why)}</div></div>
      <span class="by-st">${r.stake > 0 ? esc(money(r.stake, r.currency)) : '&ndash;'}</span>
      <div class="by-btns">${hb.why === 'watched' ? '' : `<button type="button" class="v2btn ghost" data-back="${esc(r.key)}" title="Put it back on the list now.">Put it back</button>`}</div></div>`;
  }

  const find = k => (DATA.rows || []).find(r => r.key === k) || (DATA.quiet || []).find(r => r.key === k);
  async function reload() { if (H && H.S.tab === 'buyer') await render(H, false); }
  /* The row leaves the list at once (the server already has it) and the totals follow; no second read of every brand. */
  function drop(k, why = 'done') {
    const i = (DATA.rows || []).findIndex(r => r.key === k); if (i < 0) return;
    const [r] = DATA.rows.splice(i, 1);
    DATA.quiet = [{ ...r, hidden: { why, by: H.S.meEmail || 'you', at: new Date().toISOString(), until: why === 'done' ? 'in 3 days' : 'tomorrow' } }, ...(DATA.quiet || [])];
    DATA.n = DATA.rows.length; DATA.stake = DATA.rows.reduce((s, x) => s + (x.stake || 0), 0); DATA.n_brands = new Set(DATA.rows.map(x => x.act_id)).size;
    DATA.counts = { ...DATA.counts, [r.kind]: Math.max(0, (DATA.counts[r.kind] || 1) - 1) };
    DATA.hidden = { ...DATA.hidden, [why]: (DATA.hidden[why] || 0) + 1 };
    if (H.S.tab === 'buyer') paint();
  }

  function wire() {
    const root = $('#main');
    root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { KIND = b.dataset.k; paint(); });
    const q = $('#byQuiet'); if (q) q.onclick = () => { SHOWQ = !SHOWQ; paint(); };
    const o = $('#byOwner'); if (o) o.onclick = ownerModal;
    const sl = document.getElementById('bySlack'); if (sl) sl.onclick = slackModal;
    root.querySelectorAll('[data-skip]').forEach(b => b.onclick = async () => {
      const r = find(b.dataset.skip); if (!r || BUSY) return;
      b.disabled = true;
      try { const j = await state(r, 'skipped'); if (j && j.error) throw new Error(j.error); drop(r.key, 'skipped'); toast('Skipped until tomorrow, for everyone.', false, async () => { await state(r, 'clear').catch(() => {}); reload(); }); }
      catch (e) { b.disabled = false; toast(`Could not skip it: ${e.message}`, true); }
    });
    root.querySelectorAll('[data-done]').forEach(b => b.onclick = async () => {
      const r = find(b.dataset.done); if (!r) return;
      b.disabled = true;
      try { const j = await state(r, 'done'); if (j && j.error) throw new Error(j.error); drop(r.key, 'done'); toast('Done. Quiet for 3 days.', false, async () => { await state(r, 'clear').catch(() => {}); reload(); }); }
      catch (e) { b.disabled = false; toast(`Could not save it: ${e.message}`, true); }
    });
    root.querySelectorAll('[data-back]').forEach(b => b.onclick = async () => {
      const r = find(b.dataset.back); if (!r) return;
      b.disabled = true;
      try { await state(r, 'clear'); reload(); } catch (e) { b.disabled = false; toast(e.message, true); }
    });
    root.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { const r = find(b.dataset.open); if (r) open(r); });
    root.querySelectorAll('[data-do]').forEach(b => b.onclick = () => { const r = find(b.dataset.do); if (r) doIt(r); });
  }
  function open(r) {
    if (r.kind === 'launch') return pickAct(r.act_id, 'production');
    if (r.ad_id) { window.V2PENDING = { ad: r.ad_id }; return pickAct(r.act_id, 'adcreative'); }
    if (r.adset_id) { window.V2PENDING = { ...(r.campaign_id ? { campaign: r.campaign_id } : {}), adset: r.adset_id }; return pickAct(r.act_id, 'campaigns'); }
    pickAct(r.act_id, 'channels');
  }
  /* After a change is written: Done for everyone (the write is also in p_meta_write, which watches it 3 days). */
  const afterDo = r => async () => { await state(r, 'done').catch(() => {}); drop(r.key, 'done'); };
  const afterUndo = r => async () => { await state(r, 'clear').catch(() => {}); reload(); };
  function doIt(r) {
    const W = window.LxMetaWrite;
    const it = { act_id: r.act_id, brand: r.brand, currency: r.currency, adset_id: r.adset_id, adset: r.adset || r.name, ad_id: r.kind === 'trim' ? r.ad_id : null, ad: r.kind === 'trim' ? r.ad : null, why: r.why_full || r.why, campaign_id: r.campaign_id, meta_act: r.meta_act };
    if (r.do === 'pause' || r.do === 'budget') {
      if (!W) return toast('The Meta write helper did not load. Hard-refresh (Ctrl+Shift+R).', true);
      const opts = { reason: 'From the Buyer list', onDone: afterDo(r), onUndo: afterUndo(r), onCampaign: () => open(r) };
      return r.do === 'budget' ? W.budget(H, it, { ...opts, pct: 0.2, amount: r.suggested_budget > 0 ? r.suggested_budget : undefined }) : W.pause(H, it, opts);
    }
    if (r.do === 'minoff') return minOff(r, it);
    if (r.do === 'brief') {
      if (!H.AskUI) return toast('Locus could not open the ask bar here.', true);
      H.AskUI.ask(`For ${r.brand}: the main ad "${r.ad || ''}" in ad set "${r.adset || ''}" is tiring (${r.why_full || r.why}). Brief three iterations of it as an Asana brief: same angle, new hooks.`);
      state(r, 'done').then(() => drop(r.key, 'done')).catch(() => {});
      return;
    }
    if (r.do === 'launch') {
      const L = window.LaunchToMeta; if (!L) return toast('The Launch window did not load. Hard-refresh (Ctrl+Shift+R).', true);
      const onDone = () => { state(r, 'done').catch(() => {}); drop(r.key, 'done'); };
      if (!r.work && r.studio_ad) return L.open({ act: r.act_id, tok: H.S.tok, studioAd: r.studio_ad, onDone });
      if (!L.openBatch) return toast('The Launch window did not load. Hard-refresh (Ctrl+Shift+R).', true);
      return L.openBatch({ act: r.act_id, tok: H.S.tok, cardId: r.card_id, onDone, onBrief: () => pickAct(r.act_id, 'production') });
    }
  }
  /* Take the test minimum off: a dry run shows the minimum now and after, then the write with expect (stale = refused). */
  async function minOff(r, it) {
    const body = { act: r.act_id, kind: 'min_spend', level: 'adset', object: r.adset_id, min: 0, reason: `From the Buyer list: ${r.why_full || r.why}` };
    const m = modal(`Take the test minimum off "${r.name}"?`, `${esc(r.brand)}. Meta stops having to spend a set amount on it each day; the budget stays as it is.`, '<p class="faint" data-s>Checking with Meta…</p>', 'Take it off', async () => {
      if (!m.plan) throw new Error('Meta did not answer the check.');
      const w = await ah('/api/meta/write', { ...body, expect: m.plan });
      if (!w || w.error) throw new Error((w && w.error) || 'Meta did not answer.');
      await afterDo(r)();
      const W = window.LxMetaWrite;
      toast('Test minimum taken off.', false, w.write && W ? () => W.undo(H, [w], it, afterUndo(r)) : null);
    });
    m.yes.disabled = true;
    let dry; try { dry = await ah('/api/meta/write', { ...body, dry: true }); } catch (e) { dry = { error: e.message }; }
    const s = m.w.querySelector('[data-s]'); if (!s) return;
    if (!dry || dry.error) { s.className = 'v2bad'; s.textContent = (dry && dry.error) || 'Meta did not answer.'; return; }
    s.className = ''; s.innerHTML = (dry.step || []).map(x => `<span class="lx-ba"><span>${esc(x.from ?? 'none')}</span><i>→</i><b>${esc(x.to ?? 'none')}</b></span>`).join('') + (dry.detail ? ` <span class="faint">${esc(dry.detail)}</span>` : '');
    m.plan = dry.before && dry.before.daily_min_spend_target != null ? { daily_min_spend_target: dry.before.daily_min_spend_target } : {};
    m.yes.disabled = false;
  }
  function ownerModal() {
    const cur = DATA.owner;
    modal('Who owns the Buyer list?', 'Shown on this page and tagged on the daily Slack post.', `<label>Owner<select name="owner">${[...new Set([cur, ...OWNERS])].map(o => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`, 'Save', async w => {
      const v = w.querySelector('select').value;
      const j = await ah('/api/buyer-list/settings', { buyerOwner: v }, 'PUT');
      if (!j || j.error) throw new Error((j && j.error) || 'Locus did not answer.');
      DATA.owner = v; paint(); toast(`${v} owns the Buyer list.`);
    });
  }
  async function slackModal() {
    const s = DATA.settings || {};
    const m = modal('The daily Slack post', 'ONE post a day at the morning hour: the count, the money at stake, the owner, the top 5 and an Open in Locus button. While it is on, the brand morning cards carry no ad calls.',
      `<label class="row"><input type="checkbox" name="on"${s.buyerPost ? ' checked' : ''}> Post the Buyer list every morning</label>
       <label>Slack channel id<input type="text" name="ch" value="${esc(s.buyerChannel || '')}" placeholder="C0C8UA53U3W" maxlength="20" autocomplete="off"><small>Default #daily-briefs (C0C8UA53U3W).</small></label>
       <div><small class="faint">What it would say now</small><pre class="by-pre" data-pre>Reading…</pre></div>`, 'Save', async w => {
        const ch = w.querySelector('[name="ch"]').value.trim();
        const j = await ah('/api/buyer-list/settings', { buyerPost: w.querySelector('[name="on"]').checked, buyerChannel: ch }, 'PUT');
        if (!j || j.error) throw new Error((j && j.error) || 'Locus did not answer.');
        DATA.settings = j.settings; toast('Saved.');
      });
    try { const p = await H.apiAH('/api/buyer-list/preview'); const pre = m.w.querySelector('[data-pre]'); if (pre) pre.textContent = p.error ? p.error : `${p.text}${p.last && p.last.done ? `\n\n(Today: ${p.last.done})` : ''}`; }
    catch (e) { const pre = m.w.querySelector('[data-pre]'); if (pre) pre.textContent = e.message; }
  }

  window.BuyerTab = { render };
})();
