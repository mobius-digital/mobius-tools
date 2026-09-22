/**
 * Ask: the in-app side of the assistant, shared by every Mobius app.
 *
 *   AskUI.init({
 *     name: 'Controller',          what it is called on screen
 *     api: (path, opts) => ...,    the host app's fetch wrapper (auth included)
 *     base: '/api/ask',            where the worker mounts the engine
 *     intro: '...',                the first line of an empty chat
 *     screen: () => ({...}),       what is on screen now, sent with every question
 *     esc, flash, confirm, cardH   the host's helpers (fallbacks are provided)
 *   })
 *
 *   AskUI.open(prefill)            the panel (also Ctrl/Cmd+K)
 *   AskUI.card()                   -> HTML: what it found, for the home screen
 *   AskUI.settingsCard()           -> HTML: what it knows + the controls
 *   AskUI.afterSettings()          wires the settings card after it is in the DOM
 *
 * Same brain as Slack, same read-only reach. Findings are marked Done / Not
 * now / Wrong on the card, and what is marked is never raised again.
 */
window.AskUI = (() => {
  const A = { name: 'Ask', base: '/api/ask', chat: [], chats: [], busy: false, data: null, id: null };
  const $ = s => document.querySelector(s);
  const escDefault = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let esc = escDefault, flash = m => console.log(m), confirm = async o => window.confirm(o.title), cardH = (t, q) => `<div class="ch"><h3>${esc(t)}</h3>${q ? `<p class="q">${esc(q)}</p>` : ''}</div>`;
  const LS = () => 'ask_chat_' + A.name.toLowerCase();

  function init(cfg) {
    Object.assign(A, cfg);
    if (cfg.esc) esc = cfg.esc;
    if (cfg.flash) flash = cfg.flash;
    if (cfg.confirm) confirm = cfg.confirm;
    if (cfg.cardH) cardH = cfg.cardH;
    try { const saved = JSON.parse(localStorage.getItem(LS()) || 'null'); if (saved?.chat) { A.chat = saved.chat; A.id = saved.id; } } catch (e) {}
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
      if (e.key === 'Escape' && $('#ask')?.classList.contains('on')) close();
    });
  }

  /* ---- what it found ---- */
  async function load(force) {
    if (A.data && !force) return A.data;
    A.data = await A.api(A.base + '/findings');
    return A.data;
  }
  const sevWord = { high: 'Worth doing today', med: 'Worth a look', low: 'When you have a minute' };
  function card(d) {
    const f = d.findings || [];
    const list = f.slice(0, 6).map(x => `
      <div class="find" data-key="${esc(x.key)}">
        <span class="dot ${esc(x.severity)}" title="${esc(sevWord[x.severity] || '')}"></span>
        <div class="ft"><b>${esc(x.title)}</b><small>${esc(x.detail || '')}</small></div>
        <div class="fa">
          <button class="btn" onclick="AskUI.open(${JSON.stringify('About this: ' + x.title + '. ' + (x.detail || '')).replace(/"/g, '&quot;')})">Ask about it</button>
          <button class="btn" onclick="AskUI.mark(this,'done')" title="Dealt with. It will not come back.">Done</button>
          <button class="btn" onclick="AskUI.mark(this,'snoozed')" title="Not now. Back in 30 days, or sooner if it gets bigger.">Not now</button>
          <button class="btn" onclick="AskUI.mark(this,'wrong')" title="This check is wrong about this one. It will never raise it again.">Wrong</button>
        </div>
      </div>`).join('');
    const b = d.briefing;
    return `<div class="card cardp askcard" id="askCard">
      ${cardH(`The ${A.name}${f.length ? ` · ${f.length} open` : ''}`, 'Checks run every night. Anything you mark Done or Wrong is never raised again.',
        `<button class="btn" onclick="AskUI.open()">Ask the ${esc(A.name)}</button>`)}
      ${b ? `<div class="brief">${esc(b.text).replace(/\n/g, '<br>').replace(/\*(.+?)\*/g, '<b>$1</b>')}<span class="when">${esc(new Date(b.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</span></div>` : ''}
      ${list || '<div class="hint" style="padding:8px 0">Nothing needs you. The checks ran and everything looks right.</div>'}
      ${f.length > 6 ? `<div class="tiny" style="margin-top:8px">and ${f.length - 6} more.</div>` : ''}
    </div>`;
  }
  /* Drop this into a home screen: a placeholder now, the card when it loads. */
  async function mount(afterEl, where = 'afterend') {
    if (!afterEl) return;
    afterEl.insertAdjacentHTML(where, `<div id="askSlot" class="card cardp askcard loading"><div class="hint">The ${esc(A.name)} is looking…</div></div>`);
    try { const d = await load(); const slot = $('#askSlot'); if (slot) slot.outerHTML = card(d); }
    catch (e) { $('#askSlot')?.remove(); }
  }
  /* The same card at the top of a container (a screen that has no header block inside it). */
  const mountIn = container => mount(container, 'afterbegin');
  async function mark(btn, state) {
    const row = btn.closest('.find'), key = row?.dataset.key;
    if (!key) return;
    row.style.opacity = '.4';
    try {
      await A.api(A.base + '/finding', { method: 'POST', body: JSON.stringify({ key, state }) });
      row.remove(); A.data = null;
      const n = document.querySelectorAll('#askCard .find').length;
      const h = document.querySelector('#askCard .ch h3');
      if (h) h.childNodes[0].nodeValue = `The ${A.name}${n ? ` · ${n} open` : ''}`;
      if (!n) $('#askCard').insertAdjacentHTML('beforeend', '<div class="hint" style="padding:8px 0">Nothing left.</div>');
    } catch (e) { row.style.opacity = '1'; flash(e.message); }
  }

  /* ---- the panel ---- */
  function panel() {
    if ($('#ask')) return $('#ask');
    document.body.insertAdjacentHTML('beforeend', `
      <div id="askScrim" onclick="AskUI.close()"></div>
      <aside id="ask" role="dialog" aria-label="Ask the ${esc(A.name)}">
        <div class="ch2"><b>The ${esc(A.name)}</b>
          <button class="ctl" onclick="AskUI.fresh()" title="Start a fresh conversation">+ New</button>
          <button class="ctl" onclick="AskUI.history()" title="Earlier conversations">Chats</button>
          <button class="ctl" onclick="AskUI.reports()" title="Reports it has built for you">Reports</button>
          <button class="x" onclick="AskUI.close()" aria-label="Close">✕</button></div>
        <div id="askList" hidden></div>
        <div id="askLog"></div>
        <form id="askForm" onsubmit="AskUI.send(event)">
          <input id="askIn" placeholder="Ask anything…" autocomplete="off">
          <button class="btn primary" type="submit">Ask</button>
        </form>
      </aside>`);
    return $('#ask');
  }
  function close() { $('#ask')?.classList.remove('on'); $('#askScrim')?.classList.remove('on'); }
  function open(prefill) {
    panel().classList.add('on'); $('#askScrim').classList.add('on');
    render(A.chat.length ? '' : (A.intro || 'Ask me anything about what is in this app.'));
    const el = $('#askIn');
    if (prefill) el.value = prefill;
    el.focus();
  }
  /* A proposal is a change the assistant described and did not make. It sits
     in the chat as a card until Apply or No thanks; either way it stays in the
     history as what happened. */
  const proposalHTML = p => `<div class="m ai prop" data-id="${esc(p.id)}">
      <b>${esc(p.summary)}</b>${p.detail ? `<div class="pd">${esc(p.detail).replace(/\n/g, '<br>')}</div>` : ''}
      ${p.preview ? `<div class="pv">${esc(p.preview).replace(/\n/g, '<br>')}</div>` : ''}
      ${p.done ? `<div class="pr ${p.done === 'applied' ? 'ok' : ''}">${esc(p.result || (p.done === 'applied' ? 'Applied.' : 'Left as it was.'))}</div>`
        : `<div class="pa"><button class="btn primary" onclick="AskUI.applyProposal('${esc(p.id)}')">Apply</button><button class="btn" onclick="AskUI.applyProposal('${esc(p.id)}', true)">No thanks</button></div>`}
    </div>`;
  /* A report the assistant built: a card in the chat, the page on Open. */
  const reportCardHTML = r => `<div class="m ai rep" data-id="${esc(r.id)}">
      <b>${esc(r.title)}</b>${r.subtitle ? `<div class="pd">${esc(r.subtitle)}</div>` : ''}
      <div class="pd">${(r.blocks || []).length} block${(r.blocks || []).length === 1 ? '' : 's'}: ${(r.blocks || []).map(b => b.type).join(', ')}</div>
      <div class="pa"><button class="btn primary" onclick="AskUI.openReport('${esc(r.id)}')">Open</button><button class="btn" onclick="AskUI.openReport('${esc(r.id)}', true)">Print / PDF</button></div>
    </div>`;
  /* A feature that needs code: the owner gets the prompt for Claude Code. */
  const handoffHTML = h => `<div class="m ai hand">
      <b>${esc(h.title)}</b><div class="pd">This needs a change to the app itself, which only you can make. Paste this into Claude Code:</div>
      <div class="pv">${esc(h.prompt)}</div>
      <div class="pa"><button class="btn primary" onclick="navigator.clipboard.writeText(this.closest('.hand').querySelector('.pv').textContent).then(()=>{this.textContent='Copied'})">Copy the prompt</button></div>
    </div>`;
  function render(intro) {
    const log = $('#askLog');
    log.innerHTML = (intro ? `<div class="m ai intro">${esc(intro).replace(/\n/g, '<br>')}</div>` : '')
      + A.chat.map(m => m.proposal ? proposalHTML(m.proposal) : m.report ? reportCardHTML(m.report) : m.handoff ? (A.isOwner ? handoffHTML(m.handoff) : '') : `<div class="m ${m.role === 'user' ? 'me' : 'ai'}">${esc(m.text).replace(/\n/g, '<br>')}</div>`).join('')
      + (A.busy ? '<div class="m ai think">Looking…</div>' : '');
    log.scrollTop = log.scrollHeight;
  }
  async function applyProposal(id, cancel = false) {
    const m = A.chat.find(x => x.proposal && x.proposal.id === id);
    if (!m) return;
    try {
      const r = await A.api(A.base + '/apply', { method: 'POST', body: JSON.stringify({ id, cancel }) });
      m.proposal.done = cancel || r.cancelled ? 'cancelled' : r.error ? 'failed' : 'applied';
      m.proposal.result = r.error ? 'Could not apply: ' + r.error : cancel ? 'Left as it was.' : (r.note || 'Applied.');
      if (!r.error && !cancel && A.onApplied) A.onApplied(r);
    } catch (e) { m.proposal.done = 'failed'; m.proposal.result = 'Could not apply: ' + e.message; }
    render(); save();
  }
  async function send(e) {
    e?.preventDefault();
    const el = $('#askIn'), q = el.value.trim();
    if (!q || A.busy) return;
    el.value = '';
    A.chat.push({ role: 'user', text: q });
    A.busy = true; render();
    try {
      const history = A.chat.slice(0, -1).filter(m => !m.proposal && !m.report && !m.handoff);
      const r = await A.api(A.base, { method: 'POST', body: JSON.stringify({ question: q, history, screen: A.screen ? A.screen() : null }) });
      if (r.isOwner !== undefined) A.isOwner = !!r.isOwner;
      for (const p of r.proposals || []) A.chat.push({ role: 'assistant', proposal: p, text: 'Proposed: ' + p.summary });
      for (const rep of r.reports || []) { A.reports = [rep, ...(A.reports || []).filter(x => x.id !== rep.id)]; A.chat.push({ role: 'assistant', report: rep, text: 'Report: ' + rep.title }); }
      for (const hd of r.handoffs || []) A.chat.push({ role: 'assistant', handoff: hd, text: 'Feature: ' + hd.title });
      A.chat.push({ role: 'assistant', text: r.error || r.answer });
      if ((r.reports || []).length) openReport(r.reports[0].id);
      if (A.onAnswer) A.onAnswer(r);
    } catch (err) { A.chat.push({ role: 'assistant', text: 'That one broke: ' + err.message }); }
    A.busy = false; render();
    save();
  }
  /* Conversations, kept apart: a question about one thing and a question
     about another are different threads, and a thread only carries its own
     history into the prompt. Kept in this browser. */
  function save() {
    if (!A.chat.length) return;
    const title = (A.chat.find(m => m.role === 'user')?.text || 'Chat').slice(0, 70);
    const cur = { id: A.id || (A.id = Math.random().toString(36).slice(2, 9)), title, at: new Date().toISOString(), messages: A.chat };
    A.chats = [cur, ...(A.chats || []).filter(c => c.id !== cur.id)].slice(0, 20);
    try { localStorage.setItem(LS(), JSON.stringify({ chat: A.chat, id: A.id })); localStorage.setItem(LS() + 's', JSON.stringify(A.chats)); } catch (e) {}
  }
  function loadChats() { try { A.chats = JSON.parse(localStorage.getItem(LS() + 's') || '[]'); } catch (e) { A.chats = []; } }
  function fresh() { A.chat = []; A.id = null; try { localStorage.removeItem(LS()); } catch (e) {} const l = $('#askList'); if (l) l.hidden = true; open(); }
  function history() {
    const el = $('#askList'); if (!el) return;
    if (!el.hidden && el.dataset.kind !== 'reports') { el.hidden = true; return; }
    loadChats(); el.hidden = false; el.dataset.kind = 'chats';
    el.innerHTML = (A.chats || []).length
      ? A.chats.map(c => `<button class="chatrow ${c.id === A.id ? 'on' : ''}" onclick="AskUI.openChat('${c.id}')"><span>${esc(c.title)}</span><small>${esc(new Date(c.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))} · ${c.messages.length} message${c.messages.length === 1 ? '' : 's'}</small></button>`).join('')
      : '<div class="hint" style="padding:10px 20px">No earlier chats yet.</div>';
  }
  function openChat(id) {
    loadChats();
    const c = (A.chats || []).find(x => x.id === id); if (!c) return;
    A.id = c.id; A.chat = c.messages.slice();
    $('#askList').hidden = true; render();
  }

  /* ---- the report page ---- */
  const fmtCell = v => v == null ? '' : typeof v === 'number' ? (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 100) / 100)) : String(v);
  /* A small chart drawn by hand: no library, prints cleanly, reads in both
     themes. Lines for series over time, bars for a few categories. */
  function chartSVG(b) {
    const W = 720, H = 260, L = 56, R = 16, T = 18, B = 40;
    const x = b.x || [], series = (b.series || []).slice(0, 4);
    const all = series.flatMap(s => (s.values || []).filter(v => v != null));
    if (!x.length || !all.length) return '<div class="hint">No data to draw.</div>';
    let lo = Math.min(0, ...all), hi = Math.max(...all); if (hi === lo) hi = lo + 1;
    const pad = (hi - lo) * 0.08; hi += pad; if (lo < 0) lo -= pad;
    const px = i => L + (x.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (x.length - 1));
    const py = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    const colors = ['var(--brand,#3b6ea5)', 'var(--good,#2e8b57)', 'var(--warn,#d99a2b)', 'var(--bad,#c9463d)'];
    const unit = b.unit || '';
    const fmtY = v => (unit === '$' ? '$' : '') + (Math.abs(v) >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v * 10) / 10) + (unit && unit !== '$' ? unit : '');
    const ticks = 4; let g = '';
    for (let t = 0; t <= ticks; t++) { const v = lo + (hi - lo) * t / ticks, y = py(v); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--line,#ddd)" stroke-width="1"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="currentColor" opacity=".7">${fmtY(v)}</text>`; }
    const step = Math.ceil(x.length / 8);
    x.forEach((lab, i) => { if (i % step === 0 || i === x.length - 1) g += `<text x="${px(i)}" y="${H - B + 18}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".7">${esc(String(lab))}</text>`; });
    if (b.kind === 'bar') {
      const n = series.length, bw = Math.max(4, ((W - L - R) / x.length) * 0.7 / n);
      series.forEach((s, si) => (s.values || []).forEach((v, i) => { if (v == null) return; const cx = px(i) - (n * bw) / 2 + si * bw; const y0 = py(Math.max(0, lo)), y1 = py(v);
        g += `<rect x="${cx}" y="${Math.min(y0, y1)}" width="${bw - 1}" height="${Math.abs(y0 - y1)}" fill="${colors[si]}" rx="2"/>`; }));
    } else {
      series.forEach((s, si) => { const pts = (s.values || []).map((v, i) => v == null ? null : `${px(i)},${py(v)}`).filter(Boolean);
        g += `<polyline points="${pts.join(' ')}" fill="none" stroke="${colors[si]}" stroke-width="2.2" stroke-linejoin="round"/>`;
        (s.values || []).forEach((v, i) => { if (v != null) g += `<circle cx="${px(i)}" cy="${py(v)}" r="2.6" fill="${colors[si]}"/>`; }); });
    }
    const legend = series.map((s, si) => `<span class="lg"><i style="background:${colors[si]}"></i>${esc(s.name)}</span>`).join('');
    return `<div class="legend">${legend}</div><svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(b.title || 'chart')}">${g}</svg>`;
  }
  function reportHTML(r) {
    const blocks = (r.blocks || []).map(b => {
      const title = b.title ? `<h3>${esc(b.title)}</h3>` : '';
      if (b.type === 'text') return `<section>${title}<p>${esc(b.text || '').replace(/\n/g, '<br>')}</p></section>`;
      if (b.type === 'kpis') return `<section>${title}<div class="kpis">${(b.items || []).map(i => `<div class="kpi ${esc(i.tone || '')}"><div class="l">${esc(i.label)}</div><div class="v">${esc(i.value)}</div>${i.note ? `<div class="n">${esc(i.note)}</div>` : ''}</div>`).join('')}</div></section>`;
      if (b.type === 'table') return `<section>${title}<div class="tw"><table><thead><tr>${(b.columns || []).map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${(b.rows || []).map(row => `<tr>${row.map((v, i) => `<td class="${typeof v === 'number' || /^[-$]?[\d,.]+%?x?$/.test(String(v || '')) ? 'num' : ''}">${esc(fmtCell(v))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
      if (b.type === 'chart') return `<section>${title}<div class="chart">${chartSVG(b)}</div></section>`;
      return '';
    }).join('');
    return `<div class="rp-head"><div><h1>${esc(r.title)}</h1>${r.subtitle ? `<div class="sub">${esc(r.subtitle)}</div>` : ''}<div class="meta">Built by the ${esc(r.by || A.name)} · ${esc(new Date(r.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</div></div>
      <div class="rp-actions no-print"><button class="btn" onclick="window.print()">Print / PDF</button><button class="btn" onclick="AskUI.closeReport()">Close</button></div></div>${blocks}`;
  }
  function openReport(id, print = false) {
    const r = (A.reports || []).find(x => x.id === id) || A.chat.map(m => m.report).find(x => x && x.id === id);
    if (!r) return;
    let el = $('#askReport');
    if (!el) { document.body.insertAdjacentHTML('beforeend', '<div id="askReport" class="askreport"><div class="rp"></div></div>'); el = $('#askReport'); }
    el.querySelector('.rp').innerHTML = reportHTML(r);
    el.classList.add('on'); document.body.classList.add('ask-printing');
    if (print) setTimeout(() => window.print(), 300);
  }
  function closeReport() { $('#askReport')?.classList.remove('on'); document.body.classList.remove('ask-printing'); }
  /* Every report it has built, newest first: the same list the worker keeps. */
  async function reports() {
    const el = $('#askList'); if (!el) return;
    if (!el.hidden && el.dataset.kind === 'reports') { el.hidden = true; return; }
    try { A.reports = (await A.api(A.base + '/reports')).reports || []; } catch (e) { A.reports = A.reports || []; }
    el.hidden = false; el.dataset.kind = 'reports';
    el.innerHTML = A.reports.length
      ? A.reports.map(r => `<button class="chatrow" onclick="AskUI.openReport('${esc(r.id)}')"><span>${esc(r.title)}</span><small>${esc(new Date(r.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}${r.subtitle ? ' · ' + esc(r.subtitle) : ''}</small></button>`).join('')
      : '<div class="hint" style="padding:10px 20px">No reports yet. Ask for one: "build me a cash forecast report for the next 8 weeks".</div>';
  }

  /* ---- settings: what it knows, and the controls ---- */
  function settingsCard() {
    return `<div class="card cardp" id="askSet">${cardH(`The ${A.name}`, 'What it knows about the company before it answers anything, and when it speaks. It reads; it never changes anything.')}
      <label class="lbl">What it knows <span class="why">Written once, read before every answer and every briefing. Add anything it should never have to ask again.</span></label>
      <textarea id="askBrief" rows="7" spellcheck="false"></textarea>
      <label class="lbl" style="margin-top:14px">How it thinks <span class="why">Its playbook: how a good person in this job reads the numbers and what they do about them. Correct it here in plain English and it changes how every answer is reasoned.</span></label>
      <textarea id="askPlaybook" rows="10" spellcheck="false"></textarea>
      <div id="askMem"></div>
      <div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px">
        <button class="btn primary" onclick="AskUI.saveBrief(this)">Save</button>
        <button class="btn" onclick="AskUI.run(this)">Run the checks now</button>
        <button class="btn" onclick="AskUI.briefing(this)">Post this week's briefing to Slack</button>
        <span class="hint">The checks run every night. The briefing posts on Monday.</span>
      </div>
    </div>`;
  }
  async function afterSettings() {
    try {
      const d = await load(true);
      const t = $('#askBrief'); if (t) t.value = d.brief || '';
      const pb = $('#askPlaybook'); if (pb) pb.value = d.playbook || '';
      const m = d.memory || { notes: [], watches: [] };
      const el = $('#askMem'); if (!el) return;
      const notes = (m.notes || []).slice().reverse().slice(0, 25);
      const watches = (m.watches || []).filter(w => w.active !== false);
      el.innerHTML = (notes.length ? `<label class="lbl" style="margin-top:14px">What it has been told <span class="why">Said in a chat, kept from then on. Remove one and it forgets it.</span></label>
        <div class="memlist">${notes.map((n, i) => `<div class="memrow"><span>${esc(n.text)}</span><small>${esc(n.at)}</small><button class="x" onclick="AskUI.forget('note',${(m.notes.length - 1 - i)})" title="Forget this">✕</button></div>`).join('')}</div>` : '')
        + (watches.length ? `<label class="lbl" style="margin-top:14px">What it watches every night <span class="why">Asked for in a chat. Stop one here or by saying "stop watching".</span></label>
        <div class="memlist">${watches.map(w => `<div class="memrow"><span>${esc(w.text)}</span><small>${esc(w.until ? 'until ' + w.until : w.once ? 'once' : 'ongoing')}</small><button class="x" onclick="AskUI.forget('watch','${esc(w.id)}')" title="Stop watching">✕</button></div>`).join('')}</div>` : '');
    } catch (e) {}
  }
  async function saveBrief(btn) {
    btn.disabled = true;
    try {
      await A.api(A.base + '/brief', { method: 'PUT', body: JSON.stringify({ text: $('#askBrief').value }) });
      if ($('#askPlaybook')) await A.api(A.base + '/playbook', { method: 'PUT', body: JSON.stringify({ text: $('#askPlaybook').value }) });
      A.data = null; flash('Saved');
    }
    catch (e) { flash(e.message); } finally { btn.disabled = false; }
  }
  async function forget(kind, ref) {
    try { await A.api(A.base + '/forget', { method: 'POST', body: JSON.stringify(kind === 'watch' ? { kind, id: ref } : { kind, index: ref }) }); A.data = null; afterSettings(); }
    catch (e) { flash(e.message); }
  }
  async function run(btn) {
    btn.disabled = true; btn.textContent = 'Checking…';
    try { const r = await A.api(A.base + '/run', { method: 'POST' }); A.data = null; flash(`Checked. ${r.fresh} new, ${r.found} open.`); }
    catch (e) { flash(e.message); } finally { btn.disabled = false; btn.textContent = 'Run the checks now'; }
  }
  async function briefing(btn) {
    if (!await confirm({ title: 'Post this week\'s briefing to Slack?', body: 'It writes the briefing from what is open right now and posts it in the channel.', ok: 'Post it' })) return;
    btn.disabled = true;
    try { const r = await A.api(A.base + '/briefing', { method: 'POST' }); A.data = null; flash(r.text ? 'Posted' : 'Nothing to say this week'); }
    catch (e) { flash(e.message); } finally { btn.disabled = false; }
  }

  return { init, open, close, send, fresh, history, openChat, card, mount, mountIn, mark, applyProposal, openReport, closeReport, reports, settingsCard, afterSettings, saveBrief, forget, run, briefing, state: A };
})();
