/* REQUESTS AND APPROVALS (2026-10-10). Home > Requests, for the team and for a client login.
 *   Approvals   the team sends the client something to sign off: ads from Studio, a calendar date, an offer, a link
 *               or file. The client sees the preview and taps Approve or Ask for changes (with a note).
 *               Approving ads marks them approved in Studio; approving a date confirms it on the calendar.
 *   Requests    the client asks the team for something (title, text, optional link); both sides reply in the
 *               thread; the team marks it done.
 * Engine: account-health src/requests.js (GET /api/requests, POST /api/requests, /reply, /decide, /done). Who may
 * call what: brandguard.js. Client decisions, requests and replies post one line to the brand's internal Slack
 * channel. Classic script, own closure; the host hands in S, api, apiAH, show, pageHead, RUN.
 * Exports window.RequestsTab = { render(host, first), waiting(act, apiAH) }.
 */
(() => {
  let H = null;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isClient = () => H && H.S.role === 'client';
  const ago = iso => { if (!iso) return ''; const m = (Date.now() - Date.parse(iso)) / 6e4; return m < 2 ? 'just now' : m < 60 ? `${Math.round(m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : m < 43200 ? `${Math.round(m / 1440)}d ago` : String(iso).slice(0, 10); };
  const md = s => s ? new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const WHAT = { studio: 'Ads', date: 'Calendar date', offer: 'Offer', link: 'Link or file' };
  /* The items last drawn, by id: a reply or decision on All clients names the item's own brand. */
  const ITEMS = new Map();
  const STATUS = { open: ['Waiting', 'warn'], approved: ['Approved', 'good'], changes: ['Changes asked', 'bad'], done: ['Done', ''] };

  function css() {
    if (document.getElementById('rqcss')) return;
    const st = document.createElement('style'); st.id = 'rqcss';
    st.textContent = `
      .rq .rq-sec{margin:0 0 22px}
      .rq .rq-lbl{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 8px;display:flex;align-items:center;gap:8px}
      .rq .rq-top{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 18px}
      .rq .rq-item{border:1px solid var(--line);border-radius:var(--r-lg,14px);background:var(--surface);padding:18px 20px;margin:0 0 12px;min-width:0}
      .rq .rq-item.key{box-shadow:inset 0 0 0 1px var(--brand)}
      .rq .rq-h{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}
      .rq .rq-h h3{margin:0;font-size:15px;font-weight:600;flex:1;min-width:200px}
      .rq .rq-meta{font-size:12px;color:var(--muted);margin:3px 0 0}
      .rq .rq-body{font-size:14px;line-height:1.55;color:var(--ink-2);margin:10px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
      .rq .rq-link{display:inline-block;margin:8px 0 0;font-size:13.5px;color:var(--brand);overflow-wrap:anywhere}
      .rq .rq-ads{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:12px 0 0}
      .rq .rq-ads figure{margin:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--surface-2)}
      .rq .rq-ads img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;cursor:zoom-in}
      .rq .rq-ads figcaption{font-size:12px;padding:6px 8px;color:var(--ink-2)}
      .rq .rq-date{margin:12px 0 0;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);font-size:13.5px;line-height:1.5}
      .rq .rq-date b{font-weight:600}
      .rq .rq-act{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 0;align-items:center}
      .rq .rq-act .hint{font-size:12.5px;color:var(--muted)}
      .rq details.rq-th{margin:12px 0 0}
      .rq details.rq-th summary{cursor:pointer;font-size:13px;font-weight:600;color:var(--ink-2)}
      .rq .rq-msg{margin:8px 0 0;padding:9px 12px;border-radius:10px;background:var(--surface-2);font-size:13.5px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
      .rq .rq-msg.client{background:var(--brand-soft)}
      .rq .rq-msg small{display:block;font-size:11.5px;color:var(--muted);margin:0 0 2px;white-space:normal}
      .rq .rq-reply{display:flex;gap:8px;margin:10px 0 0;align-items:flex-end}
      .rq .rq-reply textarea{flex:1;min-height:38px;resize:vertical}
      .rq textarea,.rq-m textarea,.rq-m input[type=text],.rq-m input[type=url]{width:100%;border:1px solid var(--line-strong);border-radius:8px;padding:8px 10px;font:inherit;font-size:13.5px;line-height:1.5;background:var(--surface);color:var(--ink)}
      .rq .rq-empty{padding:28px 20px;text-align:center;color:var(--muted);font-size:14px;border:1px dashed var(--line-strong);border-radius:var(--r-lg,14px)}
      .rq .rq-done summary{cursor:pointer;font-size:13px;font-weight:600;color:var(--ink-2);margin:0 0 10px}
      .rq-m .modal{max-width:640px;width:calc(100vw - 32px);display:block;padding:20px 22px;max-height:calc(100vh - 48px);overflow:auto}
      .rq-m h3{margin:0 0 4px;font-size:16px}
      .rq-m label.f{display:block;margin:12px 0 0;font-size:13px;font-weight:600}
      .rq-m label.f > span{display:block;font-weight:400;color:var(--muted);font-size:12.5px;margin:2px 0 6px}
      .rq-m .seg{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0}
      .rq-m .seg button{border:1px solid var(--line-strong);background:transparent;color:var(--ink);border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;cursor:pointer}
      .rq-m .seg button.on{background:var(--brand-soft);border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand);font-weight:600}
      .rq-m .pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin:6px 0 0;max-height:320px;overflow:auto}
      .rq-m .pick button{position:relative;border:1px solid var(--line);border-radius:8px;padding:0;background:var(--surface-2);cursor:pointer;overflow:hidden}
      .rq-m .pick img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover}
      .rq-m .pick button.on{border-color:var(--brand);box-shadow:0 0 0 2px var(--brand)}
      .rq-m .pick button .v2pill{position:absolute;left:6px;top:6px}
      .rq-m .dl{display:grid;gap:6px;margin:6px 0 0;max-height:280px;overflow:auto}
      .rq-m .dl button{display:flex;justify-content:space-between;gap:10px;text-align:left;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:var(--surface);color:var(--ink);font:inherit;font-size:13.5px;cursor:pointer}
      .rq-m .dl button.on{border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand);background:var(--brand-soft)}
      .rq-m .dl small{color:var(--muted);white-space:nowrap}
      .rq-m .err{color:var(--bad);font-size:13px;min-height:18px;margin:10px 0 0}
      .rq-m .foot{display:flex;justify-content:flex-end;gap:8px;margin:12px 0 0}
      .rq-zoom .modal{max-width:min(720px,calc(100vw - 32px));padding:12px;display:block}
      .rq-zoom img{display:block;width:100%;border-radius:10px}
    `;
    document.head.appendChild(st);
  }

  /* ---------- in-app modals ---------- */
  function modal(html, cls = 'rq-m') {
    const w = document.createElement('div'); w.className = `modal-wrap ${cls}`;
    w.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(w);
    const done = () => { w.remove(); document.removeEventListener('keydown', k); };
    const k = e => { if (e.key === 'Escape') done(); };
    document.addEventListener('keydown', k);
    w.addEventListener('mousedown', e => { if (e.target === w) done(); });
    w.querySelectorAll('[data-x]').forEach(b => b.onclick = done);
    return { w, done };
  }
  const busy = async (btn, fn, errEl) => {
    if (btn.disabled) return; const was = btn.textContent; btn.disabled = true; btn.textContent = 'Saving…';
    try { await fn(); } catch (e) { if (errEl) errEl.textContent = e.message; btn.disabled = false; btn.textContent = was; }
  };
  const post = (path, body) => H.apiAH(path, { method: 'POST', body: JSON.stringify(body) });
  const imgUrl = a => `${String(H.S.url || '').replace(/\/+$/, '')}/api/studio/img/${a.id}/${a.img || 'full'}?v=${a.v || ''}`;

  /* ---------- one item ---------- */
  function itemHTML(it, showBrand) {
    ITEMS.set(it.id, it);
    const [sl, sc] = STATUS[it.status] || [it.status, ''];
    const kindL = it.kind === 'approval' ? `Approval: ${WHAT[it.what] || 'item'}` : 'Request';
    const waitingOnMe = isClient() ? (it.kind === 'approval' && it.status === 'open') : ((it.kind === 'request' && it.status === 'open') || (it.kind === 'approval' && it.status === 'changes'));
    let prev = '';
    if (it.what === 'studio') prev = it.ads && it.ads.length
      ? `<div class="rq-ads">${it.ads.map(a => `<figure><img loading="lazy" src="${esc(imgUrl(a))}" alt="${esc(a.headline || 'Ad')}" data-zoom="${esc(imgUrl(a))}">${a.headline || a.approved ? `<figcaption>${a.approved ? '<span class="v2pill good">Approved</span> ' : ''}${esc(a.headline || '')}</figcaption>` : ''}</figure>`).join('')}</div>`
      : '<p class="rq-meta">These ads were removed from Studio.</p>';
    if (it.what === 'date') prev = it.date
      ? `<div class="rq-date"><b>${esc(it.date.name)}</b><br>Goes live ${esc(md(it.date.start))}${it.date.end && it.date.end !== it.date.start ? `, ends ${esc(md(it.date.end))}` : ''}${it.date.offer ? `<br>Offer: ${esc(it.date.offer)}` : ''}<br><span class="v2pill ${it.date.confirmed ? 'good' : it.date.cancelled ? 'bad' : ''}">${it.date.confirmed ? 'Confirmed on the calendar' : it.date.cancelled ? 'Removed from the calendar' : 'Pencilled on the calendar'}</span></div>`
      : '<p class="rq-meta">This date is no longer on the calendar.</p>';
    const thread = it.thread || [];
    const acts = [];
    if (isClient() && it.kind === 'approval' && it.status !== 'done') {
      if (it.status !== 'approved') acts.push(`<button class="btn primary" data-dec="approved" data-id="${esc(it.id)}">Approve</button>`);
      acts.push(`<button class="btn" data-dec="changes" data-id="${esc(it.id)}">Ask for changes</button>`);
      if (it.status === 'approved') acts.push(`<span class="hint">You approved this ${esc(ago(it.decided_at))}.</span>`);
    }
    if (!isClient()) acts.push(it.status === 'done' ? `<button class="btn quiet" data-done="0" data-id="${esc(it.id)}">Open it again</button>` : `<button class="btn" data-done="1" data-id="${esc(it.id)}">Mark done</button>`);
    if (!isClient() && it.kind === 'approval' && it.status === 'approved') acts.push(`<span class="hint">${esc(it.decided_by || 'The client')} approved it ${esc(ago(it.decided_at))}.</span>`);
    return `<div class="rq-item${waitingOnMe ? ' key' : ''}" data-item="${esc(it.id)}">
      <div class="rq-h"><div style="flex:1;min-width:200px"><h3>${esc(it.title)}</h3>
        <div class="rq-meta">${showBrand ? `${esc(it.brand)} · ` : ''}${esc(kindL)} · from ${esc(it.by)} · ${esc(ago(it.created_at))}</div></div>
        <span class="v2pill ${sc}">${esc(sl)}</span></div>
      ${it.body ? `<div class="rq-body">${esc(it.body)}</div>` : ''}
      ${it.link ? `<a class="rq-link" href="${esc(it.link)}" target="_blank" rel="noopener">${esc(it.link)}</a>` : ''}
      ${prev}
      ${acts.length ? `<div class="rq-act">${acts.join('')}</div>` : ''}
      <details class="rq-th"${thread.length && waitingOnMe ? ' open' : ''}><summary>${thread.length ? `${thread.length} message${thread.length === 1 ? '' : 's'}` : 'Reply'}</summary>
        ${thread.map(m => `<div class="rq-msg ${m.role === 'client' ? 'client' : ''}"><small>${esc(m.by)}${m.role === 'client' && !isClient() ? ' (client)' : ''} · ${esc(ago(m.at))}</small>${esc(m.text)}</div>`).join('')}
        <div class="rq-reply"><textarea rows="2" placeholder="Write a reply" aria-label="Reply" data-rt="${esc(it.id)}"></textarea><button class="btn" data-reply="${esc(it.id)}">Send</button></div>
      </details>
    </div>`;
  }

  /* ---------- the page ---------- */
  async function render(host, first) {
    H = host; css();
    const t = H.RUN();
    const act = H.S.act || 'all';
    const all = act === 'all';
    const brand = (H.S.accounts || []).find(a => a.act_id === act);
    const title = all ? 'Requests' : `Requests: ${esc(brand ? brand.name : '')}`;
    const sub = isClient() ? 'Things we need you to approve, and anything you would like from us. Every message reaches the team straight away.'
      : all ? 'What clients asked us for and what we are waiting on them to approve, across every brand.' : 'Send the client something to approve, and answer what they ask for.';
    const head = H.pageHead('requests', title, sub);
    if (first) $('#main').innerHTML = `<div class="v2 rq">${head}<div class="v2card"><p class="v2hint">Loading…</p></div></div>`;
    let d;
    try { d = await H.apiAH(`/api/requests?act=${encodeURIComponent(act)}`); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = `<div class="v2 rq">${head}<div class="v2card"><p class="v2bad">${esc(e.message)}</p></div></div>`; return; }
    if (t !== H.RUN()) return;
    const items = d.items || [];
    const open = items.filter(i => i.status !== 'done'), done = items.filter(i => i.status === 'done');
    let secs;
    if (isClient()) {
      const forYou = open.filter(i => i.kind === 'approval' && i.status === 'open');
      const rest = open.filter(i => !forYou.includes(i));
      secs = [[`Waiting for you${forYou.length ? ` (${forYou.length})` : ''}`, forYou, 'Nothing to approve right now.'], ['Your requests and earlier approvals', rest, 'Nothing open. Ask the team for anything with the button above.']];
    } else {
      const us = open.filter(i => (i.kind === 'request' && i.status === 'open') || (i.kind === 'approval' && i.status === 'changes'));
      const them = open.filter(i => i.kind === 'approval' && i.status === 'open');
      const ok = open.filter(i => !us.includes(i) && !them.includes(i));
      secs = [[`Waiting for us${us.length ? ` (${us.length})` : ''}`, us, 'Nothing waiting for the team.'], [`Waiting for the client${them.length ? ` (${them.length})` : ''}`, them, 'Nothing sent for approval right now.'], ['Approved, not closed yet', ok, null]];
    }
    const top = all ? '' : `<div class="rq-top">${isClient() ? '<button class="btn primary" id="rqNew">Ask the team for something</button>' : '<button class="btn primary" id="rqSend">Send for approval</button><button class="btn" id="rqNew">Add a request</button>'}</div>`;
    $('#main').innerHTML = `<div class="v2 rq">${head}${top}
      ${secs.filter(([, list, empty]) => list.length || empty).map(([lbl, list, empty]) => `<div class="rq-sec"><div class="rq-lbl">${esc(lbl)}</div>${list.length ? list.map(i => itemHTML(i, all)).join('') : `<div class="rq-empty">${esc(empty)}</div>`}</div>`).join('')}
      ${done.length ? `<details class="rq-sec rq-done"><summary>Done in the last 60 days (${done.length})</summary>${done.map(i => itemHTML(i, all)).join('')}</details>` : ''}
    </div>`;
    wire(act);
  }

  function wire(act) {
    const again = () => render(H, false);
    const m = $('#main');
    const n = m.querySelector('#rqNew'); if (n) n.onclick = () => requestModal(act, again);
    const s = m.querySelector('#rqSend'); if (s) s.onclick = () => sendModal(act, again);
    m.querySelectorAll('[data-zoom]').forEach(img => img.onclick = () => modal(`<img src="${esc(img.dataset.zoom)}" alt=""><div class="foot"><button class="btn" data-x="1">Close</button></div>`, 'rq-m rq-zoom'));
    const itemAct = id => (ITEMS.get(id) || {}).act_id || act;
    m.querySelectorAll('[data-reply]').forEach(b => b.onclick = () => {
      const ta = m.querySelector(`[data-rt="${CSS.escape(b.dataset.reply)}"]`); const text = (ta && ta.value || '').trim(); if (!text) { ta && ta.focus(); return; }
      busy(b, async () => { await post('/api/requests/reply', { act: itemAct(b.dataset.reply), id: b.dataset.reply, text }); again(); }, null);
    });
    m.querySelectorAll('[data-done]').forEach(b => b.onclick = () => busy(b, async () => { await post('/api/requests/done', { act: itemAct(b.dataset.id), id: b.dataset.id, done: b.dataset.done === '1' }); again(); }));
    m.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => decideModal(b.dataset.id, b.dataset.dec, itemAct(b.dataset.id), again));
  }

  function decideModal(id, dec, act, again) {
    const it = ITEMS.get(id) || {};
    const ok = dec === 'approved';
    const what = it.what === 'studio' ? 'The ads are marked approved and the team can run them.' : it.what === 'date' ? 'The date is confirmed on your calendar.' : 'The team hears about it straight away.';
    const { w, done } = modal(`<h3>${ok ? 'Approve' : 'Ask for changes'}: ${esc(it.title || '')}</h3>
      <p class="v2hint" style="margin:0">${ok ? esc(what) : 'Say what you would like changed. The team sees it in Slack and here.'}</p>
      <label class="f">${ok ? 'A note for the team' : 'What should change?'}<span>${ok ? 'Optional.' : 'Required.'}</span><textarea id="rqNote" rows="4"></textarea></label>
      <div class="err" id="rqErr"></div>
      <div class="foot"><button class="btn" data-x="1">Cancel</button><button class="btn primary" id="rqGo">${ok ? 'Approve' : 'Send'}</button></div>`);
    const go = w.querySelector('#rqGo'), err = w.querySelector('#rqErr');
    go.onclick = () => {
      const note = w.querySelector('#rqNote').value.trim();
      if (!ok && !note) { err.textContent = 'Say what you would like changed.'; return; }
      busy(go, async () => { await post('/api/requests/decide', { act, id, decision: dec, note }); done(); again(); }, err);
    };
    setTimeout(() => w.querySelector('#rqNote').focus(), 30);
  }

  function requestModal(act, again) {
    const { w, done } = modal(`<h3>${isClient() ? 'Ask the team for something' : 'Add a request'}</h3>
      <p class="v2hint" style="margin:0">${isClient() ? 'A new product, a change to the ads, a question. The team sees it in Slack straight away and answers here.' : 'Something the client asked for on a call or by email, so it is tracked here with the rest.'}</p>
      <label class="f">Title<span>A few words.</span><input type="text" id="rqT" maxlength="140" placeholder="Pause the hoodie ads"></label>
      <label class="f">What do you need?<textarea id="rqB" rows="5"></textarea></label>
      <label class="f">Link<span>Optional: a Drive folder, a product page, a file.</span><input type="url" id="rqL" placeholder="https://"></label>
      <div class="err" id="rqErr"></div>
      <div class="foot"><button class="btn" data-x="1">Cancel</button><button class="btn primary" id="rqGo">Send</button></div>`);
    const go = w.querySelector('#rqGo'), err = w.querySelector('#rqErr');
    go.onclick = () => {
      const title = w.querySelector('#rqT').value.trim(), text = w.querySelector('#rqB').value.trim(), link = w.querySelector('#rqL').value.trim();
      if (!title) { err.textContent = 'Give it a short title.'; return; }
      if (!text) { err.textContent = 'Say what you need.'; return; }
      busy(go, async () => { await post('/api/requests', { act, kind: 'request', title, text, link }); done(); again(); }, err);
    };
    setTimeout(() => w.querySelector('#rqT').focus(), 30);
  }

  /* The team: send the client something to approve. Ads come from this brand's Studio, dates from its calendar. */
  function sendModal(act, again) {
    const st = { what: 'studio', ads: new Set(), date: null, studio: null, cal: null };
    const { w, done } = modal(`<h3>Send for approval</h3>
      <p class="v2hint" style="margin:0">The client sees it on their Home and under Requests, taps Approve or Ask for changes, and you hear about it in the brand's internal channel. Nothing is emailed.</p>
      <label class="f">What are they approving?<div class="seg" id="rqW">${Object.entries(WHAT).map(([k, l]) => `<button type="button" data-w="${k}" class="${k === st.what ? 'on' : ''}">${l}</button>`).join('')}</div></label>
      <label class="f">Title<span>What the client reads first.</span><input type="text" id="rqT" maxlength="140"></label>
      <div id="rqPick"></div>
      <label class="f" id="rqBL">Note for the client<span id="rqBH">Optional.</span><textarea id="rqB" rows="3"></textarea></label>
      <label class="f" id="rqLL" hidden>Link<span>A Drive file, a Frame review link, a page on the site.</span><input type="url" id="rqL" placeholder="https://"></label>
      <div class="err" id="rqErr"></div>
      <div class="foot"><button class="btn" data-x="1">Cancel</button><button class="btn primary" id="rqGo">Send to the client</button></div>`);
    const err = w.querySelector('#rqErr'), pick = w.querySelector('#rqPick'), tIn = w.querySelector('#rqT');
    const draw = async () => {
      w.querySelectorAll('#rqW button').forEach(b => b.classList.toggle('on', b.dataset.w === st.what));
      w.querySelector('#rqLL').hidden = st.what !== 'link';
      w.querySelector('#rqBH').textContent = st.what === 'offer' ? 'Required: the offer, written the way customers will see it.' : 'Optional.';
      w.querySelector('#rqBL').firstChild.textContent = st.what === 'offer' ? 'The offer' : 'Note for the client';
      err.textContent = '';
      if (st.what === 'studio') {
        pick.innerHTML = '<label class="f">Pick the ads<span>From this brand\'s AI ads, newest first.</span></label><p class="v2hint">Loading…</p>';
        if (!st.studio) { try { st.studio = await H.api(`/api/studio?act=${encodeURIComponent(act)}`); } catch (e) { pick.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; return; } }
        if (st.what !== 'studio') return;
        const ads = (st.studio.ads || []).filter(a => a.status !== 'deleted' && a.status !== 'gone').slice(0, 80);
        const bn = new Map((st.studio.batches || []).map(b => [b.id, `${b.num ? b.num + ' · ' : ''}${b.name || ''}`]));
        pick.innerHTML = `<label class="f">Pick the ads<span>${ads.length ? `${st.ads.size} picked. Click to pick or unpick.` : 'This brand has no AI ads yet (Creative > AI ads).'}</span></label>
          <div class="pick">${ads.map(a => `<button type="button" data-ad="${esc(a.id)}" class="${st.ads.has(a.id) ? 'on' : ''}" title="${esc(bn.get(a.batch_id) || (a.spec && a.spec.headline) || '')}">${a.status === 'approved' ? '<span class="v2pill good">Approved</span>' : ''}<img loading="lazy" alt="" src="${esc(`${String(H.S.url || '').replace(/\/+$/, '')}/api/studio/img/${a.id}/${a.has_final ? 'final' : 'full'}?v=${a.v || ''}`)}"></button>`).join('')}</div>`;
        pick.querySelectorAll('[data-ad]').forEach(b => b.onclick = () => {
          const id = b.dataset.ad; st.ads.has(id) ? st.ads.delete(id) : st.ads.add(id); b.classList.toggle('on', st.ads.has(id));
          pick.querySelector('label span').textContent = `${st.ads.size} picked. Click to pick or unpick.`;
          if (!tIn.value.trim() && st.ads.size) { const a = ads.find(x => x.id === id); const n = a && bn.get(a.batch_id); if (n) tIn.value = n; }
        });
      } else if (st.what === 'date') {
        pick.innerHTML = '<label class="f">Pick the date<span>This brand\'s calendar, from this week on.</span></label><p class="v2hint">Loading…</p>';
        if (!st.cal) { try { st.cal = await H.apiAH(`/api/calendar?act=${encodeURIComponent(act)}`); } catch (e) { pick.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; return; } }
        if (st.what !== 'date') return;
        const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
        const evs = (st.cal.items || []).filter(e => e.src === 'cal' && (e.end || e.start) >= from).sort((a, b) => a.start.localeCompare(b.start));
        pick.innerHTML = `<label class="f">Pick the date<span>${evs.length ? 'Approving it confirms it on the calendar.' : 'No dates on this brand\'s calendar yet. Add one on Calendar first.'}</span></label>
          <div class="dl">${evs.map(e => `<button type="button" data-ev="${esc(e.id)}" class="${st.date === e.id ? 'on' : ''}"><span>${esc(e.name)}</span><small>${esc(md(e.start))}${e.status === 'conf' ? ' · confirmed' : ' · pencilled'}</small></button>`).join('')}</div>`;
        pick.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => {
          st.date = b.dataset.ev; pick.querySelectorAll('[data-ev]').forEach(x => x.classList.toggle('on', x === b));
          const e = evs.find(x => x.id === st.date); if (e && !tIn.value.trim()) tIn.value = `Confirm ${e.name} on ${md(e.start)}`;
        });
      } else pick.innerHTML = '';
    };
    w.querySelectorAll('#rqW button').forEach(b => b.onclick = () => { st.what = b.dataset.w; draw(); });
    draw();
    const go = w.querySelector('#rqGo');
    go.onclick = () => {
      const title = tIn.value.trim(), text = w.querySelector('#rqB').value.trim(), link = w.querySelector('#rqL').value.trim();
      if (!title) { err.textContent = 'Give it a title.'; return; }
      if (st.what === 'studio' && !st.ads.size) { err.textContent = 'Pick at least one ad.'; return; }
      if (st.what === 'date' && !st.date) { err.textContent = 'Pick the date.'; return; }
      if (st.what === 'offer' && !text) { err.textContent = 'Write the offer.'; return; }
      if (st.what === 'link' && !link) { err.textContent = 'Paste the link.'; return; }
      const ref = st.what === 'studio' ? [...st.ads] : st.what === 'date' ? st.date : null;
      busy(go, async () => { await post('/api/requests', { act, kind: 'approval', what: st.what, ref, title, text, link }); done(); again(); }, err);
    };
  }

  /** How many approvals wait for a client on one brand (clients.js draws the line on Home). */
  async function waiting(act, apiAH) {
    if (!act || act === 'all') return 0;
    try { return (await apiAH(`/api/requests?act=${encodeURIComponent(act)}`)).waiting_client || 0; } catch { return 0; }
  }

  window.RequestsTab = { render, waiting };
})();
