/* MEETING NOTES (2026-10-13). Reports > Meeting notes, the team's page (never a client's).
 *   Open action items   what is still open per brand (the "Action items" section of each Asana project),
 *                       read at the top of the Monday call.
 *   Meetings            every Fireflies transcript Locus read in the last 60 days. Open one: the summary and,
 *                       per brand, decisions, the items as tick boxes you can edit (text, owner, due, kind),
 *                       what the client will hear and what we need from them. Confirm writes it all out.
 * Engine: account-health src/meetings.js (GET /api/meetings, POST /api/meetings/confirm | skip | ingest | poll).
 * Classic script, own closure; the host hands in S, api, apiAH, show, pageHead, RUN.
 * Exports window.MeetingsTab = { render(host, first) }.
 */
(() => {
  let H = null;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TEAM = ['', 'Cole', 'Ahsan', 'Noma', 'William', 'Ravo', 'Radhesh', 'Hamza'];
  const KIND = { team: 'Team task', client: 'Tell the client', client_owes: 'Client owes us' };
  const ST = { new: ['Reading', ''], extracted: ['Ready to confirm', 'warn'], confirmed: ['Confirmed', 'good'], skipped: ['Skipped', ''], error: ['Failed', 'bad'] };
  const md = iso => iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  let DATA = null, OPEN = null;

  function css() {
    if (document.getElementById('mtcss')) return;
    const st = document.createElement('style'); st.id = 'mtcss';
    st.textContent = `
      .mt .mt-lbl{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
      .mt .mt-grid{display:grid;grid-template-columns:minmax(260px,320px) minmax(0,1fr);gap:16px;align-items:start}
      @media (max-width:980px){.mt .mt-grid{grid-template-columns:1fr}}
      .mt .mt-row{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface);cursor:pointer;margin:0 0 8px;text-align:left;width:100%;font:inherit;color:var(--ink)}
      .mt .mt-row.on{box-shadow:inset 0 0 0 1px var(--brand);background:var(--brand-soft)}
      .mt .mt-row b{display:block;font-size:14px}
      .mt .mt-row small{display:block;color:var(--muted);font-size:12px;margin:2px 0 0}
      .mt .mt-brand{border:1px solid var(--line);border-radius:14px;background:var(--surface);padding:16px 18px;margin:0 0 12px}
      .mt .mt-brand h3{margin:0 0 8px;font-size:15px}
      .mt .mt-dec{margin:0 0 10px;padding:0 0 0 18px;font-size:13.5px;line-height:1.5}
      .mt .mt-item{display:grid;grid-template-columns:22px minmax(0,1fr) 120px 140px 150px;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--line)}
      .mt .mt-item:first-of-type{border-top:0}
      .mt .mt-item input[type=text],.mt .mt-item input[type=date],.mt .mt-item select{width:100%;font:inherit;font-size:13px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--surface-2);color:var(--ink)}
      .mt .mt-item.off input,.mt .mt-item.off select{opacity:.45}
      @media (max-width:860px){.mt .mt-item{grid-template-columns:22px minmax(0,1fr)}.mt .mt-item > *:nth-child(n+3){grid-column:2}}
      .mt textarea{width:100%;min-height:72px;font:inherit;font-size:13.5px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);color:var(--ink);resize:vertical}
      .mt .mt-lines{margin:0;padding:0;list-style:none}
      .mt .mt-lines li{display:flex;gap:8px;align-items:center;margin:0 0 6px}
      .mt .mt-lines input{flex:1}
      .mt .mt-foot{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:14px 0 0}
      .mt .mt-open li{margin:0 0 4px;font-size:13.5px}
      .mt .mt-open small{color:var(--muted)}
      .mt .mt-res li{margin:0 0 4px;font-size:13.5px}
      .mt .mt-warn{color:var(--warn);font-size:13px;margin:6px 0 0}
      .mt .mt-err{color:var(--bad);font-size:13px;min-height:18px}
      .mt .mt-add{font:inherit;font-size:13px;background:transparent;border:1px dashed var(--line-strong);border-radius:8px;padding:6px 10px;color:var(--ink);cursor:pointer;margin:6px 0 0}
    `;
    document.head.appendChild(st);
  }

  const post = (path, body) => H.apiAH(path, { method: 'POST', body: JSON.stringify(body) });
  const busy = async (btn, fn, errEl, label = 'Working…') => {
    if (btn.disabled) return; const was = btn.textContent; btn.disabled = true; btn.textContent = label;
    try { await fn(); } catch (e) { if (errEl) errEl.textContent = e.message; btn.disabled = false; btn.textContent = was; }
  };

  /* ---------- the list ---------- */
  function listHtml(d) {
    if (!d.meetings.length) return `<p class="v2hint">No calls read yet. ${d.connected ? 'Locus checks Fireflies every hour; the first read looks back two days.' : 'Set FIREFLIES_API_KEY on the worker first.'}</p>`;
    return d.meetings.map(m => { const [sl, sc] = ST[m.status] || [m.status, '']; return `<button class="mt-row${OPEN && OPEN.id === m.id ? ' on' : ''}" data-open="${esc(m.id)}">
      <div style="flex:1;min-width:0"><b>${esc(m.title || 'Untitled call')}</b><small>${esc(md(m.date))}${m.duration ? ` · ${Math.round(m.duration)} min` : ''}${m.kind && m.kind !== 'other' ? ` · ${esc(m.kind.replace('_', ' '))}` : ''}</small></div>
      <span class="v2pill ${sc}">${esc(sl)}</span></button>`; }).join('');
  }

  function openHtml(d) {
    const act = H.S.act || 'all';
    const list = (d.open || []).filter(b => act === 'all' || b.brand_id === act);
    if (!list.length) return `<p class="v2hint">Nothing open${act === 'all' ? '' : ' for this brand'}. Confirmed team items show here until they are completed in Asana.</p>`;
    return list.map(b => `<div style="margin:0 0 10px"><b>${esc(b.name)}</b><ul class="mt-open" style="margin:4px 0 0;padding:0 0 0 18px">${b.items.map(i => `<li>${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.name)}</a>` : esc(i.name)} <small>${esc(i.owner || 'nobody')}${i.due ? ` · due ${esc(md(i.due))}` : ''}</small></li>`).join('')}</ul></div>`).join('');
  }

  /* ---------- one meeting, editable ---------- */
  const nameOf = id => (DATA.brands.find(b => b.act_id === id) || {}).name || (id ? id : 'Agency-wide');
  function itemRow(it, bi, ii) {
    return `<div class="mt-item${it.on === false ? ' off' : ''}" data-b="${bi}" data-i="${ii}">
      <input type="checkbox" data-f="on" ${it.on === false ? '' : 'checked'} aria-label="Keep this item">
      <input type="text" data-f="text" value="${esc(it.text)}" aria-label="The item">
      <select data-f="owner" aria-label="Owner">${TEAM.map(n => `<option value="${n}" ${n === (it.owner || '') ? 'selected' : ''}>${n || 'Nobody yet'}</option>`).join('')}</select>
      <input type="date" data-f="due" value="${esc(it.due || '')}" aria-label="Due date">
      <select data-f="kind" aria-label="What kind of item">${Object.entries(KIND).map(([k, l]) => `<option value="${k}" ${k === it.kind ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>`;
  }
  function linesHtml(arr, bi, f, add) {
    return `<ul class="mt-lines" data-b="${bi}" data-f="${f}">${(arr || []).map((x, i) => `<li><input type="text" value="${esc(x)}" data-li="${i}"><button class="btn quiet" data-rm="${i}" title="Remove">×</button></li>`).join('')}</ul><button class="mt-add" data-add="${f}" data-b="${bi}">+ ${add}</button>`;
  }
  function meetingHtml(m) {
    const n = m.notes;
    if (m.status === 'error') return `<div class="v2card"><h3>${esc(m.title)}</h3><p class="v2bad">${esc(m.error || 'The read failed.')}</p><div class="mt-foot"><button class="btn" data-retry="${esc(m.id)}">Read it again</button></div></div>`;
    if (!n) return `<div class="v2card"><h3>${esc(m.title)}</h3><p class="v2hint">${m.status === 'skipped' ? 'Skipped: ' + esc(m.error || 'nothing to act on.') : 'Still reading. Give it a minute and open it again.'}</p>${m.status === 'skipped' ? `<div class="mt-foot"><button class="btn" data-retry="${esc(m.id)}">Read it anyway</button></div>` : ''}</div>`;
    const done = m.status === 'confirmed';
    const r = m.result;
    const brandsSorted = [...n.brands].sort((a, b) => (a.brand_id ? 1 : 0) - (b.brand_id ? 1 : 0));
    const brands = brandsSorted.map((b, bi) => `<div class="mt-brand" data-bi="${bi}" data-brand="${esc(b.brand_id)}">
      <h3>${esc(nameOf(b.brand_id))}</h3>
      ${b.decisions.length ? `<div class="mt-lbl">Decided</div><ul class="mt-dec">${b.decisions.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <div class="mt-lbl">Action items</div>
      ${done ? `<ul class="mt-res">${b.items.map(it => `<li>${esc(it.text)} <small class="v2hint">${esc(KIND[it.kind] || it.kind)}${it.owner ? ` · ${esc(it.owner)}` : ''}${it.due ? ` · due ${esc(md(it.due))}` : ''}</small></li>`).join('') || '<li class="v2hint">None.</li>'}</ul>`
        : `<div class="mt-items">${b.items.map((it, ii) => itemRow(it, bi, ii)).join('')}</div><button class="mt-add" data-additem="${bi}">+ Add an item</button>`}
      ${b.brand_id ? `<div class="mt-lbl" style="margin-top:14px">The client reads, under "This week"</div>${done ? `<ul class="mt-res">${b.this_week.map(x => `<li>${esc(x)}</li>`).join('') || '<li class="v2hint">Nothing.</li>'}</ul>` : linesHtml(b.this_week, bi, 'this_week', 'Add a line')}
      <div class="mt-lbl" style="margin-top:14px">What we need from the client</div>${done ? `<ul class="mt-res">${b.need_from_client.map(x => `<li>${esc(x)}</li>`).join('') || '<li class="v2hint">Nothing.</li>'}</ul>` : linesHtml(b.need_from_client, bi, 'need_from_client', 'Add one')}` : ''}
    </div>`).join('');
    const resHtml = r ? `<div class="v2card"><h3>What happened</h3>${[...(r.brands || []), ...(r.agency ? [r.agency] : [])].map(b => `<div style="margin:0 0 8px"><b>${esc(b.name)}</b><ul class="mt-res" style="margin:4px 0 0;padding:0 0 0 18px">${b.tasks.map(t => `<li>${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.text)}</a>` : esc(t.text)} ${t.error ? `<small class="v2bad">${esc(t.error)}</small>` : t.assigned ? '' : '<small class="v2hint">(nobody assigned)</small>'}</li>`).join('')}${b.asks.map(a => `<li>Ask: ${esc(a.text)} ${a.error ? `<small class="v2bad">${esc(a.error)}</small>` : '<small class="v2hint">in Requests</small>'}</li>`).join('')}${b.report ? `<li><small class="v2hint">"This week" added to the weekly report draft of ${esc(md(b.report.period_start))}.</small></li>` : ''}${b.slack ? '' : '<li><small class="v2hint">No Slack note (no channel).</small></li>'}</ul></div>`).join('')}${(r.warnings || []).map(w => `<p class="mt-warn">${esc(w)}</p>`).join('')}</div>` : '';
    return `<div class="v2card"><h3 style="margin:0 0 2px">${esc(m.title)}</h3><p class="v2hint" style="margin:0 0 10px">${esc(md(m.date))}${m.duration ? ` · ${Math.round(m.duration)} min` : ''} · ${(m.attendees || []).map(a => a.displayName || a.email).filter(Boolean).slice(0, 8).join(', ') || 'attendees unknown'}${m.cost ? ` · read for $${(+m.cost).toFixed(2)}` : ''}${done ? ` · confirmed by ${esc(m.confirmed_by || 'the team')}` : ''}</p>
      <div class="mt-lbl">Summary</div>${done ? `<p style="margin:0;font-size:14px;line-height:1.55">${esc(n.summary)}</p>` : `<textarea id="mtSummary">${esc(n.summary)}</textarea>`}</div>
      ${brands || '<div class="v2card"><p class="v2hint">The call did not land on any brand.</p></div>'}
      ${done ? resHtml : `<div class="v2card"><p class="v2hint" style="margin:0 0 10px">Confirm writes the ticked team items to Asana (an "Action items" section in each brand's project), puts "This week" and "What we need from you" on the brand's open weekly report draft, files what the client owes under Requests, and posts one note per brand in its internal channel. Nothing goes to a client channel.</p>
        <div class="mt-foot"><button class="btn primary" id="mtConfirm">Confirm and send</button><button class="btn" id="mtSkip">Skip this call</button><span class="mt-err" id="mtErr"></span></div></div>`}`;
  }

  /* read the edited notes back out of the DOM */
  function collect() {
    const m = OPEN, n = m.notes;
    const brandsSorted = [...n.brands].sort((a, b) => (a.brand_id ? 1 : 0) - (b.brand_id ? 1 : 0));
    const out = brandsSorted.map((b, bi) => {
      const box = document.querySelector(`.mt-brand[data-bi="${bi}"]`);
      const items = [...box.querySelectorAll('.mt-item')].map(row => ({
        on: row.querySelector('[data-f=on]').checked, text: row.querySelector('[data-f=text]').value.trim(),
        owner: row.querySelector('[data-f=owner]').value, due: row.querySelector('[data-f=due]').value, kind: row.querySelector('[data-f=kind]').value,
      })).filter(i => i.text);
      const lines = f => [...box.querySelectorAll(`.mt-lines[data-f=${f}] input`)].map(i => i.value.trim()).filter(Boolean);
      return { brand_id: b.brand_id, decisions: b.decisions, items, this_week: b.brand_id ? lines('this_week') : [], need_from_client: b.brand_id ? lines('need_from_client') : [] };
    });
    return { id: m.id, summary: ($('#mtSummary') || {}).value || n.summary, brands: out };
  }

  function wire(root) {
    root.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openMeeting(b.dataset.open));
    root.querySelectorAll('[data-retry]').forEach(b => b.onclick = () => busy(b, async () => { await post('/api/meetings/ingest', { id: b.dataset.retry }); await reload(b.dataset.retry); }, $('#mtErr'), 'Reading…'));
    const poll = $('#mtPoll'); if (poll) poll.onclick = () => busy(poll, async () => { const r = await post('/api/meetings/poll', {}); await reload(OPEN && OPEN.id); if (!r.read?.length) H.pageHead && toast(r.errors?.length ? `Fireflies: ${r.errors[0].error}` : 'Nothing new on Fireflies.'); }, null, 'Checking…');
    root.querySelectorAll('.mt-item [data-f=on]').forEach(c => c.onchange = () => c.closest('.mt-item').classList.toggle('off', !c.checked));
    root.querySelectorAll('[data-additem]').forEach(b => b.onclick = () => { const bi = b.dataset.additem; const box = b.previousElementSibling; box.insertAdjacentHTML('beforeend', itemRow({ text: '', owner: '', due: '', kind: 'team' }, bi, box.children.length)); const row = box.lastElementChild; row.querySelector('[data-f=on]').onchange = e => row.classList.toggle('off', !e.target.checked); row.querySelector('[data-f=text]').focus(); });
    root.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { const ul = b.previousElementSibling; ul.insertAdjacentHTML('beforeend', `<li><input type="text" value=""><button class="btn quiet" data-rm title="Remove">×</button></li>`); ul.lastElementChild.querySelector('[data-rm]').onclick = e => e.target.closest('li').remove(); ul.lastElementChild.querySelector('input').focus(); });
    root.querySelectorAll('.mt-lines [data-rm]').forEach(b => b.onclick = () => b.closest('li').remove());
    const c = $('#mtConfirm'); if (c) c.onclick = () => busy(c, async () => { const body = collect(); const r = await post('/api/meetings/confirm', body); await reload(body.id); toast(`Confirmed. ${(r.result.warnings || []).length ? r.result.warnings[0] : 'Asana, the report and Slack are updated.'}`); }, $('#mtErr'), 'Sending…');
    const s = $('#mtSkip'); if (s) s.onclick = () => busy(s, async () => { await post('/api/meetings/skip', { id: OPEN.id }); await reload(null); }, $('#mtErr'));
  }
  const toast = msg => { const t = document.createElement('div'); t.setAttribute('role', 'status'); t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));background:var(--ink);color:var(--on-ink,#fff);padding:10px 16px;border-radius:12px;font-size:13.5px;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,.25)'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 6000); };

  async function openMeeting(id) {
    const t = H.RUN();
    const m = await H.apiAH(`/api/meetings?id=${encodeURIComponent(id)}`).catch(e => ({ error: e.message }));
    if (t !== H.RUN()) return;
    OPEN = m.error ? { id, title: 'Could not open', status: 'error', error: m.error } : m;
    paint();
  }
  async function reload(openId) {
    DATA = await H.apiAH('/api/meetings');
    if (openId) OPEN = await H.apiAH(`/api/meetings?id=${encodeURIComponent(openId)}`).catch(() => null); else OPEN = null;
    paint();
  }
  function paint() {
    const d = DATA;
    const head = H.pageHead('meetings', 'Meeting notes', 'Every call read by Locus: what was decided, who does what, and what the client hears. Confirm once; it goes everywhere.');
    const setup = d.connected ? `<p class="v2hint" style="margin:8px 0 0">Fireflies is connected. New transcripts arrive within the hour (or at once if Fireflies posts to <code>${esc(d.webhook)}</code>, set in Fireflies > Settings > Developer settings).</p>` : `<p class="v2bad" style="margin:8px 0 0">FIREFLIES_API_KEY is not set on the worker.</p>`;
    $('#main').innerHTML = `<div class="v2 mt">${head}
      <div class="v2card"><div class="v2h"><h3>Open action items</h3><span class="find">From every brand's Asana "Action items" section. Read these first on the Monday call.</span></div>${openHtml(d)}</div>
      <div class="mt-grid">
        <div><div class="v2card"><div class="v2h"><h3>Calls</h3><button class="btn quiet" id="mtPoll" title="Ask Fireflies for anything new">Check now</button></div>${listHtml(d)}${setup}</div></div>
        <div id="mtOpen">${OPEN ? meetingHtml(OPEN) : '<div class="v2card"><p class="v2hint">Pick a call on the left.</p></div>'}</div>
      </div></div>`;
    wire($('#main'));
  }

  async function render(host, first) {
    H = host; css();
    const t = H.RUN();
    const head = H.pageHead('meetings', 'Meeting notes', 'Every call read by Locus: what was decided, who does what, and what the client hears.');
    if (first) $('#main').innerHTML = `<div class="v2 mt">${head}<div class="v2card"><p class="v2hint">Loading…</p></div></div>`;
    try { DATA = await H.apiAH('/api/meetings'); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = `<div class="v2 mt">${head}<div class="v2card"><p class="v2bad">${esc(e.message)}</p></div></div>`; return; }
    if (t !== H.RUN()) return;
    const want = new URLSearchParams(location.search).get('meeting');
    if (want && (!OPEN || OPEN.id !== want)) { OPEN = await H.apiAH(`/api/meetings?id=${encodeURIComponent(want)}`).catch(() => null); }
    else if (!OPEN) { const firstReady = DATA.meetings.find(m => m.status === 'extracted'); if (firstReady) OPEN = await H.apiAH(`/api/meetings?id=${encodeURIComponent(firstReady.id)}`).catch(() => null); }
    if (t !== H.RUN()) return;
    paint();
  }

  window.MeetingsTab = { render };
})();
