/* Locus extras around the Strategist (2026-10-08). Loaded after v2.js; uses the host's globals
 * (S, api, apiAH, esc, confirmModal, show, DS) at call time, like the other screen files.
 *
 *  - Pin to a dashboard: every chart in a Strategist answer (ask-ui.js) gets a button; this file is
 *    the modal behind it. It saves a `chart` block {title, spec, question, act, pinned_at} on an
 *    existing dashboard or a new one (PUT /api/dashboard on the profit worker, cleanSpec in
 *    worker/src/dashboard.js). Pinning the same question again on the same dashboard replaces it.
 *  - chartBlock(b): how a dashboard draws that block (renderDash -> dashBlockHtml): the chart the
 *    way the chat drew it, "as of <date>", and Refresh (asks the stored question again).
 *  - schedules(slot): Settings > The Strategist > Scheduled questions (account-health
 *    /api/ask/schedules, askschedule.js).
 *  - movedSetting(): Settings > Briefs and Slack > the What moved switch (settings movedPost). */
(() => {
  const E = s => (typeof esc === 'function' ? esc(s) : String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const MAX_BLOCKS = 10;
  const brandName = act => (act && act !== 'all' ? ((S.accounts || []).find(a => a.act_id === act) || {}).name : '') || '';
  const dayText = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
  const field = 'width:100%;margin-top:4px';

  /* A modal shell above the Strategist panel (z 63). Resolves when closed. */
  function shell(html, wide) {
    const w = document.createElement('div');
    w.className = 'modal-wrap'; w.style.zIndex = '80';
    w.innerHTML = `<div class="modal" style="max-width:${wide ? 620 : 520}px;width:100%">${html}</div>`;
    document.body.appendChild(w);
    const close = () => { w.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    return { w, close, q: s => w.querySelector(s) };
  }

  /* ---------------- Pin to a dashboard ---------------- */
  async function pinModal(info) {
    const act = S.act || 'all', bn = brandName(act);
    const m = shell(`<h3>Pin this chart to a dashboard</h3>
      <p class="hint">The chart stays as it is now, dated, with a Refresh that asks the same question again. Pin the new answer to replace this one.</p>
      <div style="margin:10px 0">${AskUI.chartHTML(info.spec)}</div>
      <label class="set-lbl" for="pnTitle" style="margin-top:6px">Title <span class="tiny" style="font-weight:400">What the dashboard calls it.</span></label>
      <input type="text" id="pnTitle" style="${field}" value="${E(info.title || '')}" placeholder="Cost per purchase by campaign">
      <label class="set-lbl">Which dashboard <span class="tiny" style="font-weight:400">One you have, or a new one.</span></label>
      <div id="pnList" class="hint" style="margin-top:6px">Loading your dashboards&hellip;</div>
      <p class="tiny" id="pnMsg" style="min-height:16px;margin:10px 0 0"></p>
      <div class="row" style="justify-content:flex-end;gap:8px;margin-top:6px"><button class="btn" type="button" id="pnCancel">Cancel</button><button class="btn primary" type="button" id="pnSave">Pin it</button></div>`, true);
    m.q('#pnCancel').onclick = m.close;
    let list = [];
    try { list = (await api('/api/dashboards?act=all')).dashboards || []; } catch (e) { m.q('#pnList').textContent = 'Could not load the dashboards: ' + e.message; }
    /* The open brand's dashboards first, then the agency-wide ones, then the rest. */
    const rank = d => (act !== 'all' && d.act === act ? 0 : !d.act ? 1 : 2);
    list.sort((x, y) => rank(x) - rank(y));
    const newName = `${bn || 'Agency'}: pinned answers`;
    m.q('#pnList').innerHTML = `<div style="display:grid;gap:6px;max-height:220px;overflow:auto">${list.map((d, i) => `<label style="display:flex;gap:8px;align-items:flex-start;font-weight:400"><input type="radio" name="pnDash" value="${E(d.id)}" ${i === 0 && rank(d) === 0 ? 'checked' : ''}><span><b>${E(d.name)}</b><br><span class="tiny">${E(d.act ? brandName(d.act) || 'a brand' : 'All brands')} &middot; ${(d.spec?.blocks || []).length} block${(d.spec?.blocks || []).length === 1 ? '' : 's'}</span></span></label>`).join('')}
      <label style="display:flex;gap:8px;align-items:flex-start;font-weight:400"><input type="radio" name="pnDash" value="" ${list.length && rank(list[0]) === 0 ? '' : 'checked'}><span><b>A new dashboard</b><br><input type="text" id="pnNew" style="${field}" value="${E(newName)}"></span></label></div>`;
    const msg = t => { m.q('#pnMsg').textContent = t; };
    m.q('#pnSave').onclick = async () => {
      const pick = (m.q('input[name="pnDash"]:checked') || {}).value ?? '';
      const title = m.q('#pnTitle').value.trim() || info.spec.title || 'Pinned answer';
      const block = { type: 'chart', title, spec: info.spec, question: info.question || '', act, pinned_at: new Date().toISOString() };
      const btn = m.q('#pnSave'); btn.disabled = true; msg('Pinning…');
      try {
        let saved;
        if (pick) {
          const d = await api(`/api/dashboard?id=${encodeURIComponent(pick)}`);
          const spec = d.spec || {}; spec.blocks = spec.blocks || [];
          const same = spec.blocks.findIndex(b => b.type === 'chart' && b.question && b.question === block.question && (b.act || 'all') === act);
          if (same >= 0) spec.blocks[same] = block;
          else if (spec.blocks.length >= MAX_BLOCKS) { msg(`That dashboard already has ${MAX_BLOCKS} blocks, the most it can hold. Remove one, or pin to a new dashboard.`); btn.disabled = false; return; }
          else spec.blocks.push(block);
          saved = await api('/api/dashboard', { method: 'PUT', body: JSON.stringify({ id: d.id, name: d.name, act: d.act || 'all', for_who: d.for_who, spec, schedule: d.schedule || '', channel: d.channel || '', pinned: d.pinned !== false }) });
          saved.replaced = same >= 0;
        } else {
          const name = (m.q('#pnNew').value || '').trim();
          if (!name) { msg('Give the new dashboard a name.'); btn.disabled = false; return; }
          saved = await api('/api/dashboard', { method: 'PUT', body: JSON.stringify({ name, act, spec: { scope: act, range: '30', compare: 'prev', blocks: [block] }, schedule: '', channel: '', pinned: true }) });
        }
        if (!(saved.spec?.blocks || []).some(b => b.type === 'chart' && b.pinned_at === block.pinned_at)) throw new Error('The dashboard did not keep the chart (it may be too big).');
        m.q('.modal').innerHTML = `<h3>Pinned</h3><p class="hint">${saved.replaced ? 'Replaced the earlier answer to the same question on' : 'Added to'} <b>${E(saved.name)}</b>.</p>
          <div class="row" style="justify-content:flex-end;gap:8px;margin-top:14px"><button class="btn" type="button" id="pnDone">Done</button><button class="btn primary" type="button" id="pnOpen">Open the dashboard</button></div>`;
        m.q('#pnDone').onclick = m.close;
        m.q('#pnOpen').onclick = () => { m.close(); try { AskUI.close(); } catch (e) {} DS.id = saved.id; try { localStorage.setItem('pf_dash', saved.id); } catch (e) {} show('dash'); };
      } catch (e) { msg(e.message); btn.disabled = false; }
    };
  }

  /* ---------------- a pinned chart on a dashboard ---------------- */
  function chartBlock(b) {
    if (!b || !b.spec || !window.AskUI || !AskUI.chartHTML) return '';
    const spec = b.title && b.spec.title === b.title ? { ...b.spec, title: '' } : b.spec;
    let chart = ''; try { chart = AskUI.chartHTML(spec); } catch (e) {}
    const who = b.act && b.act !== 'all' ? brandName(b.act) : '';
    return `<section class="v2card ds-pin"><div class="v2h"><h3>${E(b.title || b.spec.title || 'Pinned answer')}</h3></div>
      ${chart ? `<div style="max-width:640px">${chart}</div>` : '<p class="hint">This chart could not be drawn.</p>'}
      <p class="tiny" style="margin:8px 0 0">As of ${E(dayText(b.pinned_at))}${who ? ` &middot; ${E(who)}` : ''}${b.question ? ` &middot; asked: &ldquo;${E(b.question.slice(0, 160))}&rdquo; <button type="button" class="btn" style="padding:2px 9px;font-size:12px;margin-left:4px" data-q="${E(b.question)}" onclick="AskX.refresh(this)" title="Ask the Strategist the same question now; pin the new answer to replace this one">Refresh</button>` : ''}</p></section>`;
  }
  function refresh(btn) { const q = btn && btn.dataset.q; if (q && window.AskUI) AskUI.ask(q); }

  /* ---------------- Scheduled questions (Settings > The Strategist) ---------------- */
  const CAD = [['daily', 'Every morning'], ['weekdays', 'Every weekday'], ['monday', 'Every Monday'], ['first', 'On the 1st of the month']];
  /* What a schedule does (2026-10-09, account-health askschedule.js KINDS). */
  const KIND = [['question', 'Answer a question'], ['task', 'Do a task (any change comes as an Apply card)'], ['report', 'Build a report'], ['check', 'Run the live check (is anything weird right now?)'], ['dashboard', 'Post a dashboard']];
  const hourL = h => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'am' : 'pm'}`;
  async function schedules(slot) {
    if (!slot) return;
    slot.insertAdjacentHTML('beforeend', `<div class="card set-card" id="sqCard"><h3>Scheduled</h3>
      <p class="hint set-why">Things the Strategist does on its own and posts to an internal Slack channel: answer a question, do a task (any change it suggests comes as an Apply card a person presses, never on its own), build a report, run the live check or post a dashboard. Never a client channel. At most 10 Strategist runs a day; checks and dashboards do not count.</p>
      <div class="set-body"><div id="sqList"><span class="hint">Loading&hellip;</span></div>
        <div class="row" style="margin:12px 0 0;gap:8px;flex-wrap:wrap"><button class="btn primary" type="button" id="sqAdd">Add a question</button><span class="tiny" id="sqMsg"></span></div>
        <p class="tiny" style="margin:8px 0 0;opacity:.8">You can also say it in the chat: "ask how Lucky did last week every Monday at 8 in #lucky-internal".</p></div></div>`);
    const $q = s => document.querySelector(s);
    let data = { schedules: [], channels: [] };
    const msg = t => { const el = $q('#sqMsg'); if (el) el.textContent = t; };
    const paint = () => {
      const host = $q('#sqList'); if (!host) return;
      const rows = data.schedules || [];
      host.innerHTML = rows.length ? `<div style="display:grid;gap:10px">${rows.map(r => `<div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px">
          <div style="font-weight:600">${E(r.question)}</div>
          <div class="tiny" style="margin-top:3px">${E(r.kind_label || 'Answer a question')} &middot; ${E(r.brand)} &middot; ${E(r.when)} &middot; posts to ${E(r.channel_name)}</div>
          <div class="tiny" style="margin-top:3px;${r.last_status && r.last_status !== 'ok' ? 'color:var(--bad)' : ''}">${r.last_run ? `Last run ${E(new Date(r.last_run).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }))} Central: ${E(r.last_status === 'ok' ? 'posted' : r.last_status || '')}` : 'Not run yet.'}</div>
          <div class="row" style="margin:8px 0 0;gap:6px;flex-wrap:wrap"><button class="btn" type="button" data-run="${E(r.id)}">Run now</button><button class="btn" type="button" data-edit="${E(r.id)}">Edit</button><button class="btn" type="button" data-del="${E(r.id)}" style="color:var(--bad)">Delete</button></div></div>`).join('')}</div>
          <p class="tiny" style="margin:8px 0 0">${data.runs_today || 0} of ${data.max_per_day || 10} runs used today.</p>`
        : '<p class="hint" style="margin:0">None yet. Add one, or ask the Strategist to set one up.</p>';
      host.querySelectorAll('[data-run]').forEach(b => b.onclick = () => runNow(rows.find(r => r.id === b.dataset.run), b));
      host.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editModal(rows.find(r => r.id === b.dataset.edit)));
      host.querySelectorAll('[data-del]').forEach(b => b.onclick = () => del(rows.find(r => r.id === b.dataset.del)));
    };
    const load = async () => {
      try { data = await apiAH('/api/ask/schedules'); paint(); }
      catch (e) { const h = $q('#sqList'); if (h) h.innerHTML = `<span style="color:var(--bad)">Could not load: ${E(e.message)}</span>`; }
    };
    const runNow = async (r, b) => {
      if (!r) return;
      if (!(await confirmModal('Run this question now?', `The Strategist answers "${r.question.slice(0, 120)}" now and posts it to ${r.channel_name}. It counts toward today's 10.`, 'Run it now'))) return;
      b.disabled = true; b.textContent = 'Asking…'; msg('');
      try { await apiAH('/api/ask/schedules/run', { method: 'POST', body: JSON.stringify({ id: r.id }) }); msg(`Posted to ${r.channel_name}.`); }
      catch (e) { msg(e.message); }
      await load();
    };
    const del = async r => {
      if (!r) return;
      if (!(await confirmModal('Delete this scheduled question?', `"${r.question.slice(0, 140)}" stops posting to ${r.channel_name}. Nothing already posted is touched.`, 'Delete'))) return;
      try { await apiAH(`/api/ask/schedules?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' }); msg('Deleted.'); await load(); }
      catch (e) { msg(e.message); }
    };
    const editModal = r => {
      const chans = data.channels || [];
      const internalOf = act => ((S.accounts || []).find(a => a.act_id === act) || {}).slack_channel || '';
      const startAct = r ? r.act : (S.act || 'all');
      const m = shell(`<h3>${r ? 'Change the scheduled question' : 'Schedule a question'}</h3>
        <p class="hint">The Strategist asks this on its own and posts the answer in Slack, written fresh from the data each time.</p>
        <label class="set-lbl" for="sqKind" style="margin-top:8px">What it does</label>
        <select id="sqKind" style="${field}">${KIND.map(([k, l]) => `<option value="${k}" ${(r ? r.kind || 'question' : 'question') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <div id="sqDashW" style="display:none"><label class="set-lbl" for="sqDash">Which dashboard</label><select id="sqDash" style="${field}"><option value="">Loading&hellip;</option></select></div>
        <label class="set-lbl" for="sqQ" id="sqQL">The question <span class="tiny" style="font-weight:400">Name the period, as you would ask it in the chat.</span></label>
        <textarea id="sqQ" rows="3" style="${field}" placeholder="How did last week go against plan, and what moved?">${E(r ? r.question : '')}</textarea>
        <label class="set-lbl" for="sqBrand">Brand <span class="tiny" style="font-weight:400">The answer stays about this brand.</span></label>
        <select id="sqBrand" style="${field}"><option value="all">All brands</option>${(S.accounts || []).map(a => `<option value="${E(a.act_id)}" ${startAct === a.act_id ? 'selected' : ''}>${E(a.name)}</option>`).join('')}</select>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="set-lbl" for="sqCad">How often</label><select id="sqCad" style="${field}">${CAD.map(([k, l]) => `<option value="${k}" ${(r ? r.cadence : 'monday') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div><label class="set-lbl" for="sqHour">At <span class="tiny" style="font-weight:400">Central time</span></label><select id="sqHour" style="${field}">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${(r ? +r.hour_central : 8) === h ? 'selected' : ''}>${hourL(h)}</option>`).join('')}</select></div>
        </div>
        <label class="set-lbl" for="sqChan">Post it to <span class="tiny" style="font-weight:400">Internal channels only.</span></label>
        <select id="sqChan" style="${field}">${chans.map(c => `<option value="${E(c.id)}">${E(c.name)}</option>`).join('')}</select>
        <p class="tiny" id="sqMMsg" style="min-height:16px;margin:10px 0 0"></p>
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:6px"><button class="btn" type="button" id="sqCancel">Cancel</button><button class="btn primary" type="button" id="sqSave">${r ? 'Save' : 'Schedule it'}</button></div>`);
      const ch = m.q('#sqChan');
      ch.value = r ? r.channel : (internalOf(startAct) || (chans[0] || {}).id || '');
      m.q('#sqBrand').onchange = e => { const c = internalOf(e.target.value); if (c && chans.some(x => x.id === c)) ch.value = c; };
      m.q('#sqCancel').onclick = m.close;
      const QL = { question: 'The question <span class="tiny" style="font-weight:400">Name the period, as you would ask it in the chat.</span>', task: 'What to do each time <span class="tiny" style="font-weight:400">Name the brand and the period. Changes come as Apply cards.</span>',
        report: 'The report to build <span class="tiny" style="font-weight:400">What it should show.</span>', check: 'A note (optional) <span class="tiny" style="font-weight:400">The check itself needs no words.</span>', dashboard: 'A note (optional)' };
      let dashLoaded = false;
      const onKind = async () => {
        const k = m.q('#sqKind').value;
        m.q('#sqQL').innerHTML = QL[k] || QL.question;
        m.q('#sqDashW').style.display = k === 'dashboard' ? '' : 'none';
        if (k === 'dashboard' && !dashLoaded) {
          dashLoaded = true;
          try { const l = (await api('/api/dashboards?act=all')).dashboards || []; m.q('#sqDash').innerHTML = l.length ? l.map(x => `<option value="${E(x.id)}" ${r && r.ref === x.id ? 'selected' : ''}>${E(x.name)}</option>`).join('') : '<option value="">No dashboards yet</option>'; }
          catch (e) { m.q('#sqDash').innerHTML = `<option value="">Could not load: ${E(e.message)}</option>`; }
        }
      };
      m.q('#sqKind').onchange = onKind; onKind();
      m.q('#sqSave').onclick = async () => {
        const b = m.q('#sqSave'), mm = m.q('#sqMMsg');
        const kind = m.q('#sqKind').value;
        const body = { id: r ? r.id : undefined, kind, ref: kind === 'dashboard' ? m.q('#sqDash').value : null, question: m.q('#sqQ').value.trim(), act: m.q('#sqBrand').value, cadence: m.q('#sqCad').value, hour_central: +m.q('#sqHour').value, channel: ch.value };
        if (kind === 'dashboard' && !body.ref) { mm.textContent = 'Pick the dashboard to post.'; return; }
        if (body.question.length < 8 && !['check', 'dashboard'].includes(kind)) { mm.textContent = kind === 'task' ? 'Write what it should do each time.' : 'Write the question you want asked.'; return; }
        if (!body.channel) { mm.textContent = 'Pick a channel.'; return; }
        b.disabled = true; mm.textContent = 'Saving…';
        try { const s = await apiAH('/api/ask/schedules', { method: 'PUT', body: JSON.stringify(body) }); m.close(); msg(`Saved. It runs ${s.schedule.when}.`); await load(); }
        catch (e) { mm.textContent = e.message; b.disabled = false; }
      };
      setTimeout(() => m.q('#sqQ').focus(), 30);
    };
    $q('#sqAdd').onclick = () => editModal(null);
    await load();
  }

  /* ---------------- Alerts (Reports > Dashboards, 2026-10-09; account-health alerts.js /api/alerts) ---------------- */
  const WIN = [['today', 'Today so far'], ['yesterday', 'Yesterday'], ['last7', 'The last 7 days']];
  const BASE = [['normal', 'A normal day (its last 28 days)'], ['goal', 'The goal'], ['fixed', 'A fixed number']];
  async function alerts(slot) {
    if (!slot) return;
    slot.insertAdjacentHTML('beforeend', `<div class="card set-card" id="alCard"><h3>Alerts</h3>
      <p class="hint set-why">Rules checked every hour that post to Slack when they trip, at most once a day, with the number and the normal. Example: revenue under 50% of a normal day by 12pm Central. Internal channels or a teammate's DM only.</p>
      <div class="set-body"><div id="alList"><span class="hint">Loading&hellip;</span></div>
        <div class="row" style="margin:12px 0 0;gap:8px;flex-wrap:wrap"><button class="btn primary" type="button" id="alAdd">Add an alert</button><span class="tiny" id="alMsg"></span></div>
        <p class="tiny" style="margin:8px 0 0;opacity:.8">Or say it in the chat: "tell me if Lucky's revenue is under half of normal by noon".</p></div></div>`);
    const $q = s => document.querySelector(s);
    let data = { alerts: [], channels: [], metrics: [] };
    const msg = t => { const el = $q('#alMsg'); if (el) el.textContent = t; };
    const when = r => r.last_fired ? `Last fired ${new Date(r.last_fired).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })} Central` : 'Not fired yet';
    const paint = () => {
      const host = $q('#alList'); if (!host) return;
      const rows = data.alerts || [];
      host.innerHTML = rows.length ? `<div style="display:grid;gap:10px">${rows.map(r => `<div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;${r.active ? '' : 'opacity:.6'}">
          <div style="font-weight:600">${E(r.rule)}</div>
          <div class="tiny" style="margin-top:3px">${r.active ? 'On' : 'Paused'} &middot; posts to ${E(r.channel_name)} &middot; ${E(when(r))}${r.last_status ? ` &middot; last check: ${E(r.last_status)}` : ''}</div>
          <div class="row" style="margin:8px 0 0;gap:6px;flex-wrap:wrap"><button class="btn" type="button" data-test="${E(r.id)}">Test now</button><button class="btn" type="button" data-edit="${E(r.id)}">Edit</button><button class="btn" type="button" data-pause="${E(r.id)}">${r.active ? 'Pause' : 'Turn on'}</button><button class="btn" type="button" data-del="${E(r.id)}" style="color:var(--bad)">Delete</button></div>
          <div class="tiny" data-out="${E(r.id)}" style="margin-top:6px"></div></div>`).join('')}</div>`
        : '<p class="hint" style="margin:0">None yet. Add one, or ask the Strategist to set one up.</p>';
      const find = id => rows.find(r => r.id === id);
      host.querySelectorAll('[data-test]').forEach(b => b.onclick = () => test(find(b.dataset.test), b));
      host.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editModal(find(b.dataset.edit)));
      host.querySelectorAll('[data-pause]').forEach(b => b.onclick = async () => { const r = find(b.dataset.pause); try { await apiAH('/api/alerts/pause', { method: 'POST', body: JSON.stringify({ id: r.id, active: !r.active }) }); msg(r.active ? 'Paused.' : 'Turned on.'); await load(); } catch (e) { msg(e.message); } });
      host.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        const r = find(b.dataset.del);
        if (!(await confirmModal('Delete this alert?', `"${r.rule}" stops being checked. Nothing already posted is touched.`, 'Delete'))) return;
        try { await apiAH(`/api/alerts?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' }); msg('Deleted.'); await load(); } catch (e) { msg(e.message); }
      });
    };
    const load = async () => {
      try { data = await apiAH('/api/alerts'); paint(); }
      catch (e) { const h = $q('#alList'); if (h) h.innerHTML = `<span style="color:var(--bad)">Could not load: ${E(e.message)}</span>`; }
    };
    const test = async (r, b) => {
      const out = document.querySelector(`[data-out="${r.id}"]`);
      b.disabled = true; b.textContent = 'Checking…';
      try {
        const t = await apiAH('/api/alerts/test', { method: 'POST', body: JSON.stringify({ id: r.id }) });
        const lines = t.fires ? t.fired.map(f => E(f.text)) : [`It would not fire right now (${t.checked} brand${t.checked === 1 ? '' : 's'} checked).`];
        for (const s of [...(t.waiting || []), ...(t.skipped || [])]) lines.push(E(s));
        out.innerHTML = lines.join('<br>') + (t.fires ? ` <button class="btn" type="button" style="padding:2px 9px;font-size:12px" data-post>Post this test to Slack</button>` : '');
        const pb = out.querySelector('[data-post]');
        if (pb) pb.onclick = async () => { pb.disabled = true; try { const p = await apiAH('/api/alerts/test', { method: 'POST', body: JSON.stringify({ id: r.id, post: true }) }); pb.textContent = p.posted ? 'Posted' : (p.error || 'Not posted'); } catch (e) { pb.textContent = e.message; } };
      } catch (e) { out.textContent = e.message; }
      b.disabled = false; b.textContent = 'Test now';
    };
    const editModal = r => {
      const chans = data.channels || [], mets = data.metrics || [];
      const startAct = r ? r.act : (S.act || 'all');
      const opt = (list, cur) => list.map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${l}</option>`).join('');
      const m = shell(`<h3>${r ? 'Change the alert' : 'Add an alert'}</h3>
        <p class="hint">Checked every hour (or at the hour you pick). Posts at most once a day.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="set-lbl" for="alBrand">Brand</label><select id="alBrand" style="${field}"><option value="all">Every brand (each on its own)</option>${(S.accounts || []).map(a => `<option value="${E(a.act_id)}" ${startAct === a.act_id ? 'selected' : ''}>${E(a.name)}</option>`).join('')}</select></div>
          <div><label class="set-lbl" for="alMet">Number</label><select id="alMet" style="${field}">${mets.map(x => `<option value="${E(x.id)}" ${(r ? r.metric : 'revenue') === x.id ? 'selected' : ''}>${E(x.label)}</option>`).join('')}</select></div>
          <div><label class="set-lbl" for="alWin">Over</label><select id="alWin" style="${field}">${opt(WIN, r ? r.window : 'today')}</select></div>
          <div><label class="set-lbl" for="alHour">Check at <span class="tiny" style="font-weight:400">Central</span></label><select id="alHour" style="${field}"><option value="">Every hour from 9am</option>${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${r && r.at_hour_central === h ? 'selected' : ''}>${hourL(h)}</option>`).join('')}</select></div>
          <div><label class="set-lbl" for="alCmp">When it is</label><select id="alCmp" style="${field}">${opt([['below', 'Under'], ['above', 'Over']], r ? r.comparison : 'below')}</select></div>
          <div><label class="set-lbl" for="alThr" id="alThrL">Percent of the baseline</label><input type="text" id="alThr" style="${field}" value="${E(r ? r.threshold : 50)}"></div>
        </div>
        <label class="set-lbl" for="alBase">Compared with</label><select id="alBase" style="${field}">${opt(BASE, r ? r.baseline : 'normal')}</select>
        <label class="set-lbl" for="alChan">Post it to <span class="tiny" style="font-weight:400">Internal channels only. Empty = the brand's internal channel.</span></label>
        <select id="alChan" style="${field}"><option value="">The brand's internal channel</option>${chans.map(c => `<option value="${E(c.id)}" ${r && r.channel === c.id ? 'selected' : ''}>${E(c.name)}</option>`).join('')}${r && r.channel && /^U/.test(r.channel) ? `<option value="${E(r.channel)}" selected>A direct message (as set up)</option>` : ''}</select>
        <p class="tiny" id="alRead" style="margin:10px 0 0"></p>
        <p class="tiny" id="alMMsg" style="min-height:16px;margin:6px 0 0;color:var(--bad)"></p>
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:6px"><button class="btn" type="button" id="alCancel">Cancel</button><button class="btn primary" type="button" id="alSave">${r ? 'Save' : 'Add it'}</button></div>`, true);
      const read = () => {
        const base = m.q('#alBase').value, thr = m.q('#alThr').value, met = (mets.find(x => x.id === m.q('#alMet').value) || {}).label || '';
        m.q('#alThrL').textContent = base === 'fixed' ? 'The number (dollars, x or a count)' : 'Percent of the baseline';
        const h = m.q('#alHour').value;
        m.q('#alRead').textContent = `Reads as: tell us when ${m.q('#alBrand').selectedOptions[0].text}'s ${met} ${m.q('#alWin').selectedOptions[0].text.toLowerCase()}${h !== '' && m.q('#alWin').value === 'today' ? ` by ${hourL(+h)} Central` : ''} is ${m.q('#alCmp').value === 'below' ? 'under' : 'over'} ${base === 'fixed' ? thr : `${thr}% of ${base === 'goal' ? 'the goal' : 'normal'}`}.`;
      };
      m.w.querySelectorAll('select,input').forEach(x => { x.oninput = read; x.onchange = read; }); read();
      m.q('#alCancel').onclick = m.close;
      m.q('#alSave').onclick = async () => {
        const b = m.q('#alSave'), mm = m.q('#alMMsg');
        const h = m.q('#alHour').value;
        const body = { id: r ? r.id : undefined, act: m.q('#alBrand').value, metric: m.q('#alMet').value, window: m.q('#alWin').value, at_hour_central: h === '' ? null : +h,
          comparison: m.q('#alCmp').value, threshold: parseFloat(String(m.q('#alThr').value).replace(/[$,%x\s]/g, '')), baseline: m.q('#alBase').value, channel: m.q('#alChan').value, mention: r ? r.mention : null, active: r ? r.active : true };
        if (!isFinite(body.threshold)) { mm.textContent = 'Write a number.'; return; }
        b.disabled = true; mm.textContent = '';
        try { await apiAH('/api/alerts', { method: 'PUT', body: JSON.stringify(body) }); m.close(); msg('Saved.'); await load(); }
        catch (e) { mm.textContent = e.message; b.disabled = false; }
      };
    };
    $q('#alAdd').onclick = () => editModal(null);
    await load();
  }

  /* ---------------- What moved, posted to Slack (Settings > Briefs and Slack) ---------------- */
  async function movedSetting() {
    const sec = document.querySelector('.setpane > section[data-sec="sending"]');
    if (!sec || sec.querySelector('#mvCard')) return;
    sec.insertAdjacentHTML('beforeend', `<div class="card set-card" id="mvCard"><h3>What moved yesterday, in Slack</h3>
      <p class="hint set-why">At 8am Central each brand gets one message in its <b>internal</b> channel when yesterday was 25% or more off a normal day for that weekday (and unusual for the brand), with the reason. A quiet day posts nothing.</p>
      <div class="set-body"><label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="mvOn" disabled> Post it every morning</label><span class="tiny" id="mvMsg"></span></div></div>`);
    const box = document.getElementById('mvOn'), msg = document.getElementById('mvMsg');
    try { const s = await apiAH('/api/settings'); box.checked = s.movedPost !== false; box.disabled = false; }
    catch (e) { msg.textContent = 'Could not check: ' + e.message; return; }
    box.onchange = async () => {
      msg.textContent = 'Saving…';
      try { await apiAH('/api/settings', { method: 'PUT', body: JSON.stringify({ movedPost: box.checked }) }); msg.textContent = box.checked ? 'Saved. It posts tomorrow at 8am Central.' : 'Saved. Nothing will post.'; }
      catch (e) { msg.textContent = e.message; box.checked = !box.checked; }
    };
  }

  if (window.AskUI) AskUI.state.onPin = pinModal;
  window.AskX = { pinModal, chartBlock, refresh, schedules, alerts, movedSetting };
})();
