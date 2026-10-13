/* ACTION ITEMS (2026-10-13). Work > Action items, the team's page (never a client's).
 * Every team item Locus holds: from a confirmed call (Calls), the Monday agenda's add box, Today's "Something else",
 * the Strategist, or typed here. Per brand (agency-wide first), open first: tick, edit, add. Slack reminds the owner
 * the morning an item is due (account-health actions.js actionTick); Done there or a check-mark reaction ticks it here.
 * Engine: account-health src/actions.js (GET /api/actions, POST /api/actions | /done | /edit).
 * Classic script, own closure; the host hands in S, api, apiAH, show, pageHead, RUN.
 * Exports window.ActionsTab = { render(host, first) }.
 */
(() => {
  let H = null;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KIND = { team: 'Team task', client: 'Tell the client', client_owes: 'Client owes us' };
  const md = iso => iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const plusDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  let DATA = null, DONE = null, MEET = {}, OWNER = 'all', SHOW_DONE = false;

  function css() {
    if (document.getElementById('accss')) return;
    const st = document.createElement('style'); st.id = 'accss';
    st.textContent = `
      .ac .ac-add{display:grid;grid-template-columns:minmax(0,1fr) 150px 130px 140px auto;gap:8px;align-items:center}
      .ac .ac-add input,.ac .ac-add select{font:inherit;font-size:13px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface-2);color:var(--ink);width:100%}
      @media (max-width:860px){.ac .ac-add{grid-template-columns:1fr 1fr}.ac .ac-add input[type=text]{grid-column:1/-1}}
      .ac .ac-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 14px}
      .ac .ac-chip{font:inherit;font-size:12.5px;padding:5px 11px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer}
      .ac .ac-chip.on{background:var(--brand-soft);box-shadow:inset 0 0 0 1px var(--brand)}
      .ac .ac-brand{border:1px solid var(--line);border-radius:14px;background:var(--surface);padding:16px 18px;margin:0 0 12px}
      .ac .ac-brand h3{margin:0 0 6px;font-size:15px;display:flex;gap:10px;align-items:baseline}
      .ac .ac-brand h3 small{font-weight:400;color:var(--muted);font-size:12.5px}
      .ac .ac-item{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:10px;align-items:start;padding:9px 0;border-top:1px solid var(--line)}
      .ac .ac-item:first-of-type{border-top:0}
      .ac .ac-item input[type=checkbox]{margin:3px 0 0;width:16px;height:16px}
      .ac .ac-item.done .ac-t{text-decoration:line-through;color:var(--muted)}
      .ac .ac-item.hi{background:var(--brand-soft);border-radius:10px;padding-left:8px;padding-right:8px;margin:0 -8px}
      .ac .ac-t{font-size:14px;line-height:1.45}
      .ac .ac-meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:4px 0 0;font-size:12.5px;color:var(--muted)}
      .ac .ac-who{display:inline-block;padding:1px 8px;border-radius:999px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font-size:12px}
      .ac .ac-due{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;background:var(--surface-2);color:var(--ink)}
      .ac .ac-due.late{background:var(--bad-soft,rgba(220,80,80,.15));color:var(--bad)}
      .ac .ac-due.now{background:var(--warn-soft,rgba(220,160,40,.18));color:var(--warn)}
      .ac .ac-meta a{color:inherit}
      .ac .ac-acts{display:flex;gap:6px;align-items:center}
      .ac .ac-acts .btn{padding:4px 9px;font-size:12px}
      .ac .ac-err{color:var(--bad);font-size:13px;min-height:18px}
      .ac details.ac-done{margin:4px 0 0}
      .ac details.ac-done summary{cursor:pointer;color:var(--muted);font-size:13px;margin:0 0 8px}
      .ac-form{display:flex;flex-direction:column;gap:12px}.ac-form label{display:flex;flex-direction:column;gap:4px;font-weight:550;font-size:13px}
      .ac-form input,.ac-form select{font:inherit;font-size:13px;padding:8px 10px;border:1px solid var(--line-strong);border-radius:7px;background:var(--surface-2);color:var(--ink)}
    `;
    document.head.appendChild(st);
  }

  const post = (path, body) => H.apiAH(path, { method: 'POST', body: JSON.stringify(body) });
  const toast = msg => { const t = document.createElement('div'); t.setAttribute('role', 'status'); t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));background:var(--ink);color:var(--on-ink,#fff);padding:10px 16px;border-radius:12px;font-size:13.5px;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,.25)'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 5000); };
  /* In-app modal with a small form (never prompt / alert). */
  function formModal(title, hint, fields, cta, onYes) {
    const w = document.createElement('div'); w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal lx-nudge-m" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>${hint ? `<p class="hint">${hint}</p>` : ''}<form class="ac-form lx-nudge-mb">${fields}</form><p class="lx-nudge-err" data-err hidden></p>
      <div class="row lx-nudge-ma"><button class="btn" data-m="no" type="button">Cancel</button><button class="btn primary" data-m="yes" type="button">${esc(cta)}</button></div></div>`;
    document.body.appendChild(w);
    const form = w.querySelector('form'), yes = w.querySelector('[data-m="yes"]'), err = w.querySelector('[data-err]');
    const close = () => { w.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    w.querySelector('[data-m="no"]').onclick = close;
    form.onsubmit = e => { e.preventDefault(); yes.click(); };
    yes.onclick = async () => {
      if (!form.reportValidity()) return;
      yes.disabled = true; const was = yes.textContent; yes.textContent = 'Saving…'; err.hidden = true;
      try { await onYes(form); close(); }
      catch (e) { err.textContent = e.message || 'Could not save it.'; err.hidden = false; yes.disabled = false; yes.textContent = was; }
    };
    setTimeout(() => { const f = form.querySelector('input,select,textarea'); if (f) f.focus(); }, 30);
    return { w, close };
  }

  const nameOf = id => id ? ((DATA.brands.find(b => b.act_id === id) || {}).name || id) : 'Agency-wide';
  const owners = () => { const set = new Set(DATA.team); for (const i of DATA.items) if (i.owner) set.add(i.owner); return [...set]; };
  const ownerSel = (name, v, extra = '') => `<select name="${name}" aria-label="Owner"${extra}><option value="">Nobody yet</option>${owners().map(o => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  const brandSel = (name, v) => `<select name="${name}" aria-label="Brand"><option value="">Agency-wide</option>${DATA.brands.map(b => `<option value="${esc(b.act_id)}" ${b.act_id === v ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`;
  function sourceLine(i) {
    if (i.source === 'meeting') { const m = MEET[i.source_id]; return m ? `From the <a href="#" data-meeting="${esc(i.source_id)}">${esc(m.title || 'call')}</a> call, ${esc(md(m.date))}` : `From a call <a href="#" data-meeting="${esc(i.source_id || '')}">(open it)</a>`; }
    if (i.source === 'monday') return 'Added on the Monday call';
    if (i.source === 'today') return 'From Today’s calls';
    if (i.source === 'strategist') return 'From the Strategist';
    return i.created_by ? `Added by ${esc(String(i.created_by).split('@')[0])}` : 'Added by hand';
  }
  function dueHtml(i) {
    if (!i.due) return '<span class="ac-due">no date</span>';
    const t = todayYmd();
    const cls = i.status !== 'open' ? '' : i.due < t ? ' late' : i.due === t ? ' now' : '';
    return `<span class="ac-due${cls}">${i.status === 'open' && i.due < t ? 'was due ' : i.due === t && i.status === 'open' ? 'due today, ' : 'due '}${esc(md(i.due))}</span>`;
  }
  function itemHtml(i) {
    const done = i.status !== 'open';
    return `<div class="ac-item${done ? ' done' : ''}${window.ACT_OPEN === i.id ? ' hi' : ''}" data-id="${esc(i.id)}">
      <input type="checkbox" data-tick="${esc(i.id)}" ${done ? 'checked' : ''} aria-label="Done">
      <div><div class="ac-t">${esc(i.text)}</div>
        <div class="ac-meta"><span class="ac-who">${esc(i.owner || 'nobody yet')}</span>${dueHtml(i)}${i.kind !== 'team' ? `<span>${esc(KIND[i.kind] || i.kind)}</span>` : ''}<span>${sourceLine(i)}</span>${done ? `<span>done${i.done_by ? ` by ${esc(String(i.done_by).split('@')[0])}` : ''}${i.done_how === 'slack' ? ' in Slack' : ''}${i.done_at ? `, ${esc(md(i.done_at))}` : ''}</span>` : ''}</div></div>
      <div class="ac-acts">${done ? '' : `<button class="btn quiet" data-edit="${esc(i.id)}">Edit</button>`}</div>
    </div>`;
  }
  function groups(items) {
    const act = H.S.act || 'all';
    const list = items.filter(i => (act === 'all' || i.act_id === act) && (OWNER === 'all' || (i.owner || '') === OWNER));
    const by = new Map();
    for (const i of list) { if (!by.has(i.act_id)) by.set(i.act_id, []); by.get(i.act_id).push(i); }
    return [...by.entries()].sort((a, b) => (a[0] ? 1 : 0) - (b[0] ? 1 : 0) || nameOf(a[0]).localeCompare(nameOf(b[0])));
  }
  function paint() {
    const act = H.S.act || 'all';
    const head = H.pageHead('actions', 'Action items', 'Everything the team owes, per brand. Tick it here, press Done in Slack, or react with a check mark on the reminder.');
    const open = groups(DATA.items);
    const late = DATA.items.filter(i => i.due && i.due < todayYmd() && (act === 'all' || i.act_id === act)).length;
    const count = DATA.items.filter(i => act === 'all' || i.act_id === act).length;
    const chips = ['all', ...owners()].map(o => `<button class="ac-chip${OWNER === o ? ' on' : ''}" data-owner="${esc(o)}">${o === 'all' ? 'Everyone' : esc(o)}</button>`).join('');
    const doneGroups = DONE ? groups(DONE) : null;
    $('#main').innerHTML = `<div class="v2 ac">${head}
      <div class="v2card"><div class="v2h"><h3>Add an item</h3><span class="find">Owner by first name, a due date if it has one. Slack reminds the owner that morning.</span></div>
        <div class="ac-add"><input type="text" id="acText" placeholder="What has to happen" aria-label="The item" maxlength="300">${act === 'all' ? brandSel('act', '') : `<input type="hidden" name="act" value="${esc(act)}"><span class="v2hint" style="padding:0 4px">${esc(nameOf(act))}</span>`}${ownerSel('owner', '')}<input type="date" name="due" aria-label="Due date" value="${plusDays(2)}"><button class="btn primary" id="acAdd">Add</button></div>
        <div class="ac-err" id="acErr"></div></div>
      <div class="ac-chips"><span class="v2hint">${count} open${late ? `, <b style="color:var(--bad)">${late} overdue</b>` : ''}${DATA.remind ? '' : ' · reminders are off (Agency settings > Slack and sending)'}</span><span style="flex:1"></span>${chips}</div>
      ${open.length ? open.map(([bid, items]) => `<div class="ac-brand" data-brand="${esc(bid)}"><h3>${esc(nameOf(bid))}<small>${items.length} open</small></h3>${items.map(itemHtml).join('')}</div>`).join('') : `<div class="v2card"><p class="v2hint">Nothing open${act === 'all' ? '' : ' for this brand'}${OWNER === 'all' ? '' : ` for ${esc(OWNER)}`}. Items arrive from confirmed calls (Work > Calls), Today’s calls, the Monday agenda, or the box above.</p></div>`}
      <details class="ac-done"${SHOW_DONE ? ' open' : ''}><summary>Done in the last 60 days${DONE ? ` (${DONE.filter(i => act === 'all' || i.act_id === act).length})` : ''}</summary>
        <div id="acDone">${doneGroups ? (doneGroups.length ? doneGroups.map(([bid, items]) => `<div class="ac-brand" data-brand="${esc(bid)}"><h3>${esc(nameOf(bid))}<small>${items.length} done</small></h3>${items.map(itemHtml).join('')}</div>`).join('') : '<p class="v2hint">Nothing done yet.</p>') : '<p class="v2hint">Loading…</p>'}</div></details>
    </div>`;
    wire($('#main'));
    if (window.ACT_OPEN) { const el = $(`.ac-item[data-id="${window.ACT_OPEN}"]`); if (el) el.scrollIntoView({ block: 'center' }); window.ACT_OPEN = null; }
  }
  function wire(root) {
    root.querySelectorAll('[data-owner]').forEach(b => b.onclick = () => { OWNER = b.dataset.owner; paint(); });
    root.querySelectorAll('[data-meeting]').forEach(a => a.onclick = e => { e.preventDefault(); if (a.dataset.meeting) { try { history.replaceState(null, '', `${location.pathname}?open=calls&meeting=${encodeURIComponent(a.dataset.meeting)}`); } catch {} } H.show('calls'); });
    root.querySelectorAll('[data-tick]').forEach(c => c.onchange = async () => {
      c.disabled = true;
      try { await post('/api/actions/done', { id: c.dataset.tick, done: c.checked }); await reload(true); toast(c.checked ? 'Done.' : 'Put back on the list.'); }
      catch (e) { toast(e.message); c.checked = !c.checked; c.disabled = false; }
    });
    root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const i = DATA.items.find(x => x.id === b.dataset.edit); if (!i) return;
      formModal('Edit this item', '', `<label>What has to happen<input type="text" name="text" required maxlength="300" value="${esc(i.text)}"></label>
        <label>Who does it${ownerSel('owner', i.owner)}</label><label>Due<input type="date" name="due" value="${esc(i.due || '')}"></label>
        <label>Kind<select name="kind">${Object.entries(KIND).map(([k, l]) => `<option value="${k}" ${k === i.kind ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Brand${brandSel('act', i.act_id)}</label>
        <label class="opt" style="flex-direction:row;align-items:center;gap:8px;font-weight:400"><input type="checkbox" name="drop" style="width:auto"> Drop it (not done, just not happening)</label>`, 'Save', async form => {
          const f = new FormData(form);
          await post('/api/actions/edit', { id: i.id, text: f.get('text'), owner: f.get('owner'), due: f.get('due'), kind: f.get('kind'), act: f.get('act'), ...(f.get('drop') ? { status: 'dropped' } : {}) });
          await reload(true); toast('Saved.');
        });
    });
    const add = $('#acAdd'); if (add) add.onclick = async () => {
      const row = add.closest('.ac-add'), err = $('#acErr'); err.textContent = '';
      const text = $('#acText').value.trim(); if (!text) { err.textContent = 'Write the item first.'; return; }
      const actEl = row.querySelector('[name=act]'); const actV = actEl ? actEl.value : (H.S.act || '');
      add.disabled = true;
      try { await post('/api/actions', { act: actV, text, owner: row.querySelector('[name=owner]').value, due: row.querySelector('[name=due]').value, kind: 'team', source: 'manual' }); await reload(true); toast('Added.'); }
      catch (e) { err.textContent = e.message; add.disabled = false; }
    };
    const det = root.querySelector('details.ac-done'); if (det) det.ontoggle = () => { SHOW_DONE = det.open; if (det.open && !DONE) reload(true); };
  }
  async function reload(keep) {
    const t = H.RUN();
    const [d, dn] = await Promise.all([H.apiAH('/api/actions?act=all&status=open'), SHOW_DONE || DONE ? H.apiAH('/api/actions?act=all&status=done').catch(() => null) : Promise.resolve(DONE)]);
    if (t !== H.RUN()) return;
    DATA = d; DONE = dn ? dn.items : DONE;
    if (!keep) OWNER = 'all';
    paint();
  }
  async function render(host, first) {
    H = host; css();
    const t = H.RUN();
    const head = H.pageHead('actions', 'Action items', 'Everything the team owes, per brand.');
    if (first) $('#main').innerHTML = `<div class="v2 ac">${head}<div class="v2card"><p class="v2hint">Loading…</p></div></div>`;
    try {
      const qs = new URLSearchParams(location.search); if (qs.get('item')) window.ACT_OPEN = qs.get('item');
      const [d, m] = await Promise.all([H.apiAH('/api/actions?act=all&status=open'), H.apiAH('/api/meetings?open=0').catch(() => null)]);
      if (t !== H.RUN()) return;
      DATA = d; MEET = {}; for (const x of (m && m.meetings) || []) MEET[x.id] = x;
      if (window.ACT_OPEN && !DATA.items.some(i => i.id === window.ACT_OPEN)) { SHOW_DONE = true; DONE = (await H.apiAH('/api/actions?act=all&status=done').catch(() => ({ items: [] }))).items; }
      if (t !== H.RUN()) return;
    } catch (e) { if (t === H.RUN()) $('#main').innerHTML = `<div class="v2 ac">${head}<div class="v2card"><p class="v2bad">${esc(e.message)}</p></div></div>`; return; }
    paint();
  }
  window.ActionsTab = { render };
})();
