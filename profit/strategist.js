/**
 * Agency settings > The Strategist (2026-10-09, the Viktor-grade pass): the controls Viktor puts in its
 * settings, for ours. Model (Smart / Quick / Deep), standing instructions, what it remembers (per brand,
 * editable, with history), its skills, what it reads in Slack, and what it costs.
 * Data: account-health /api/ask/settings | memory | skills | index | usage (admin), through apiAH.
 * Mounted by index.html's renderSettings wrapper: StratSettings.mount(slot).
 */
window.StratSettings = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const E = s => (window.esc ? window.esc(s) : String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const api = (p, o) => window.apiAH(p, o);
  const ST = { scope: 'agency', history: false, brands: [] };
  const COST = { smart: 'about 10 to 40 cents a question', quick: 'about 3 to 10 cents a question', deep: 'about 30 cents to $1 a question' };
  const WHAT = { smart: 'Opus 5.5, medium thinking. What Viktor runs. The default.', quick: 'Sonnet 5.5. Faster and cheaper, for lookups.', deep: 'Opus 5.5, thinking hard. For audits, reviews, strategy.' };

  /* An in-app form modal (Cole's rule: never prompt()). fields: [{k, label, value, rows, hint}] */
  function formModal(title, fields, cta = 'Save') {
    return new Promise(resolve => {
      const w = document.createElement('div');
      w.className = 'modal-wrap';
      w.innerHTML = `<div class="modal" style="max-width:600px"><h3>${E(title)}</h3>${fields.map(f => `
        <label class="tiny" style="display:block;margin:12px 0 5px;font-weight:600">${E(f.label)}</label>
        ${f.rows ? `<textarea data-k="${f.k}" rows="${f.rows}" style="width:100%;border:1px solid var(--line-strong);border-radius:8px;padding:10px;font:inherit;font-size:13.5px;line-height:1.5">${E(f.value || '')}</textarea>`
          : `<input type="text" data-k="${f.k}" value="${E(f.value || '')}" style="width:100%">`}
        ${f.hint ? `<p class="tiny" style="margin:5px 0 0;opacity:.7">${E(f.hint)}</p>` : ''}`).join('')}
        <div class="row" style="justify-content:flex-end;gap:8px;margin:16px 0 0"><button class="btn" data-m="no">Cancel</button><button class="btn primary" data-m="yes">${E(cta)}</button></div></div>`;
      document.body.appendChild(w);
      const done = v => { w.remove(); document.removeEventListener('keydown', k); resolve(v); };
      const k = e => { if (e.key === 'Escape') done(null); };
      document.addEventListener('keydown', k);
      w.addEventListener('mousedown', e => { if (e.target === w) done(null); });
      w.querySelector('[data-m="no"]').onclick = () => done(null);
      w.querySelector('[data-m="yes"]').onclick = () => done(Object.fromEntries([...w.querySelectorAll('[data-k]')].map(x => [x.dataset.k, x.value.trim()])));
      setTimeout(() => w.querySelector('[data-k]')?.focus(), 30);
    });
  }
  const card = (id, title, why, body) => `<div class="card set-card" id="${id}"><h3>${E(title)}</h3><p class="hint set-why">${E(why)}</p><div class="set-body">${body}</div></div>`;
  const when = s => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const usd = n => '$' + (Number(n) || 0).toFixed(2);

  async function mount(slot) {
    if (!slot || !window.apiAH) return;
    slot.insertAdjacentHTML('afterbegin', `<div id="stratSet">
      ${card('ssModel', 'How it thinks', 'The model every question uses. Anyone can add !fast or !deep to one message for that answer only (like Viktor).', '<div class="hint">Loading…</div>')}
      ${card('ssMem', 'What it remembers', 'Short facts it has been told: decisions, offers, dates, preferences, rules a client set. A new fact on the same topic replaces the old one, dated facts stop on their day, and each brand keeps 40 at most. Every night it reads the day\'s brand channels and keeps what matters. Edit or forget anything here.', '<div class="hint">Loading…</div>')}
      ${card('ssSkills', 'Skills', 'How this team does a job, written down once so it is done the same way every time. It reads the matching skill before the job. Teach it in chat ("from now on, do it like this") or add one here.', '<div class="hint">Loading…</div>')}
      ${card('ssSlack', 'What it reads in Slack', 'Every message in each brand\'s internal and client channel is kept as it arrives and searched when a question needs it. It never posts in a client channel.', '<div class="hint">Loading…</div>')}
      ${card('ssUse', 'What it costs', 'Every answer, last 30 days. Each answer in Slack and Locus also shows its own cost underneath.', '<div class="hint">Loading…</div>')}
    </div>`);
    await Promise.all([model(), memory(), skills(), slack(), usage()]);
  }

  /* ---- model + instructions ---- */
  async function model() {
    const el = $('#ssModel .set-body');
    try {
      const s = await api('/api/ask/settings');
      el.innerHTML = `<div class="seg" style="display:flex;gap:8px;flex-wrap:wrap">${['smart', 'quick', 'deep'].map(k => `
          <button class="btn ${s.model === k ? 'primary' : ''}" data-mp="${k}" style="text-align:left;flex:1;min-width:180px;padding:10px 12px">
            <b style="display:block">${k === 'smart' ? 'Smart' : k === 'quick' ? 'Quick' : 'Deep'}</b>
            <span class="tiny" style="display:block;opacity:.8">${E(WHAT[k])}</span><span class="tiny" style="display:block;opacity:.6">${E(COST[k])}</span></button>`).join('')}</div>
        <label class="tiny" style="display:block;margin:16px 0 5px;font-weight:600">Standing instructions for every answer</label>
        <textarea id="ssInstr" rows="4" maxlength="4000" placeholder="e.g. Always answer the client-facing part first. Never suggest discounts over 25% for Lucky." style="width:100%;border:1px solid var(--line-strong);border-radius:8px;padding:10px;font:inherit;font-size:13.5px;line-height:1.5">${E(s.instructions || '')}</textarea>
        <div class="row" style="margin:8px 0 0;gap:8px"><button class="btn" id="ssInstrSave">Save instructions</button><span class="tiny" id="ssInstrMsg"></span></div>`;
      el.querySelectorAll('[data-mp]').forEach(b => b.onclick = async () => { await api('/api/ask/settings', { method: 'PUT', body: JSON.stringify({ model: b.dataset.mp }) }); model(); });
      $('#ssInstrSave').onclick = async () => {
        const m = $('#ssInstrMsg'); m.textContent = 'Saving…';
        try { await api('/api/ask/settings', { method: 'PUT', body: JSON.stringify({ instructions: $('#ssInstr').value }) }); m.textContent = 'Saved ✓'; } catch (e) { m.textContent = e.message; }
      };
    } catch (e) { el.innerHTML = `<div class="hint">${E(e.message)}</div>`; }
  }

  /* ---- memory ---- */
  async function memory() {
    const el = $('#ssMem .set-body');
    try {
      const d = await api('/api/ask/memory?scope=' + encodeURIComponent(ST.scope));
      ST.brands = d.brands || [];
      const facts = (d.facts || []).filter(f => ST.history || f.status === 'active');
      const name = id => id === 'agency' ? 'The agency' : (ST.brands.find(b => b.id === id)?.name || id);
      el.innerHTML = `<div class="row" style="gap:8px;flex-wrap:wrap;margin:0 0 10px">
          <select id="ssScope">${['agency', ...ST.brands.map(b => b.id)].map(id => `<option value="${E(id)}" ${id === ST.scope ? 'selected' : ''}>${E(name(id))}</option>`).join('')}</select>
          <button class="btn" id="ssAdd">Add a fact</button>
          <label class="tiny" style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="ssHist" ${ST.history ? 'checked' : ''}> Show what changed</label></div>
        ${facts.length ? `<table class="settings" style="width:100%"><thead><tr><th>Topic</th><th>What it knows</th><th>Since</th><th></th></tr></thead><tbody>${facts.map(f => `
          <tr style="${f.status !== 'active' ? 'opacity:.55' : ''}"><td><b>${E(f.topic)}</b>${f.status !== 'active' ? `<div class="tiny">${E(f.status)}</div>` : ''}</td>
          <td>${E(f.text)}${f.until ? `<div class="tiny">until ${E(f.until)}</div>` : ''}<div class="tiny" style="opacity:.6">${E(f.source || '')}${f.by_name ? ' · ' + E(f.by_name) : ''}</div></td>
          <td class="tiny">${when(f.at)}</td>
          <td style="white-space:nowrap">${f.status === 'active' ? `<button class="btn" data-ed="${E(f.id)}">Edit</button> <button class="btn" data-fg="${E(f.id)}">Forget</button>` : ''}</td></tr>`).join('')}</tbody></table>`
          : `<div class="hint">Nothing remembered for ${E(name(ST.scope))} yet. It saves facts as it is told them, and every night from the brand's Slack.</div>`}`;
      $('#ssScope').onchange = e => { ST.scope = e.target.value; memory(); };
      $('#ssHist').onchange = e => { ST.history = e.target.checked; memory(); };
      $('#ssAdd').onclick = async () => {
        const v = await formModal(`Add a fact for ${name(ST.scope)}`, [
          { k: 'topic', label: 'Topic (2 to 5 words)', hint: 'Saying something new on the same topic later replaces this.' },
          { k: 'text', label: 'The fact', rows: 3 }, { k: 'until', label: 'Ends on (optional, YYYY-MM-DD)', hint: 'For a sale or a launch: it stops being used after this day.' }]);
        if (!v || !v.text) return;
        await api('/api/ask/memory', { method: 'POST', body: JSON.stringify({ scope: ST.scope, ...v, until: v.until || null }) });
        memory();
      };
      el.querySelectorAll('[data-ed]').forEach(b => b.onclick = async () => {
        const f = facts.find(x => x.id === b.dataset.ed);
        const v = await formModal('Edit what it knows', [{ k: 'topic', label: 'Topic', value: f.topic }, { k: 'text', label: 'The fact', rows: 3, value: f.text }, { k: 'until', label: 'Ends on (optional)', value: f.until || '' }]);
        if (!v) return;
        await api('/api/ask/memory', { method: 'PUT', body: JSON.stringify({ id: f.id, ...v, until: v.until || null }) });
        memory();
      });
      el.querySelectorAll('[data-fg]').forEach(b => b.onclick = async () => {
        if (!(await window.confirmModal('Forget this?', 'It stops being used in answers. It stays in the history.', 'Forget it'))) return;
        await api('/api/ask/memory?id=' + encodeURIComponent(b.dataset.fg), { method: 'DELETE' });
        memory();
      });
    } catch (e) { el.innerHTML = `<div class="hint">${E(e.message)}</div>`; }
  }

  /* ---- skills ---- */
  async function skills() {
    const el = $('#ssSkills .set-body');
    try {
      const { skills: list } = await api('/api/ask/skills');
      const live = (list || []).filter(s => s.active);
      el.innerHTML = `<div class="row" style="margin:0 0 10px"><button class="btn" id="ssSkAdd">Add a skill</button></div>
        ${live.length ? live.map(s => `<div style="padding:10px 0;border-top:1px solid var(--line)"><div class="row" style="gap:8px;margin:0"><b style="flex:1">${E(s.name)}</b>
          <button class="btn" data-sk="${E(s.id)}">Edit</button><button class="btn" data-skd="${E(s.id)}">Remove</button></div>
          <div class="tiny" style="opacity:.8">${E(s.description)}</div></div>`).join('') : '<div class="hint">No skills yet.</div>'}`;
      const edit = async s => {
        const v = await formModal(s ? `Edit "${s.name}"` : 'Add a skill', [
          { k: 'name', label: 'Name', value: s?.name || '', hint: 'Short, e.g. launch-brief' },
          { k: 'description', label: 'When it applies', value: s?.description || '', hint: 'One sentence starting "Use when...". This is how it knows to read it.' },
          { k: 'body', label: 'How we do it (the steps, the format, the rules)', rows: 10, value: s?.body || '' }]);
        if (!v || !v.name || !v.body) return;
        await api('/api/ask/skills', { method: 'PUT', body: JSON.stringify(v) });
        skills();
      };
      $('#ssSkAdd').onclick = () => edit(null);
      el.querySelectorAll('[data-sk]').forEach(b => b.onclick = () => edit(live.find(x => x.id === b.dataset.sk)));
      el.querySelectorAll('[data-skd]').forEach(b => b.onclick = async () => {
        if (!(await window.confirmModal('Remove this skill?', 'It stops being used. You can add it again later.', 'Remove'))) return;
        await api('/api/ask/skills?id=' + encodeURIComponent(b.dataset.skd), { method: 'DELETE' });
        skills();
      });
    } catch (e) { el.innerHTML = `<div class="hint">${E(e.message)}</div>`; }
  }

  /* ---- Slack index ---- */
  async function slack() {
    const el = $('#ssSlack .set-body');
    try {
      const [s, cfg] = await Promise.all([api('/api/ask/index'), api('/api/ask/settings')]);
      const names = Object.fromEntries((ST.brands.length ? ST.brands : (await api('/api/ask/memory?scope=agency')).brands || []).map(b => [b.id, b.name]));
      const chans = s.channels || [];
      el.innerHTML = `<p style="margin:0 0 10px"><b>${(s.total || 0).toLocaleString('en-US')}</b> messages kept across ${chans.length} channel${chans.length === 1 ? '' : 's'}. New messages arrive as they are posted; the first walk goes back a year, a little every hour.</p>
        ${chans.length ? `<table class="settings" style="width:100%"><thead><tr><th>Brand</th><th>Channel</th><th>Messages</th><th>Back to</th><th>Status</th></tr></thead><tbody>${chans.map(c => `
          <tr><td>${E(names[c.brand] || (c.side === 'team' ? 'Team' : c.brand || ''))}</td><td>${c.side === 'client' ? 'Client' : c.side === 'internal' ? 'Internal' : 'Team'}</td>
          <td>${(c.msgs || 0).toLocaleString('en-US')}</td><td class="tiny">${E(c.since || '')}</td>
          <td class="tiny">${c.last_error ? `<span style="color:var(--bad)">${E(/not_in_channel|missing_scope|channel_not_found/.test(c.last_error) ? 'Add the Mobius Digital app to this channel (/invite @Mobius Digital)' : c.last_error)}</span>` : c.back_done ? 'Up to date' : 'Still reading back'}${c.via === 'user' ? ' · read as Cole' : ''}</td></tr>`).join('')}</tbody></table>` : ''}
        <div class="row" style="gap:8px;margin:12px 0 0;flex-wrap:wrap"><button class="btn" id="ssCatch">Catch up now</button><span class="tiny" id="ssCatchMsg"></span></div>
        <label class="tiny" style="display:block;margin:14px 0 5px;font-weight:600">Other channels to read (channel ids, comma separated)</label>
        <div class="row" style="gap:8px;margin:0"><input type="text" id="ssExtra" value="${E(cfg.indexChannels || '')}" placeholder="C0123ABCDEF, C0456GHIJKL" style="flex:1;max-width:420px"><button class="btn" id="ssExtraSave">Save</button></div>`;
      $('#ssCatch').onclick = async () => {
        const m = $('#ssCatchMsg'); m.textContent = 'Reading…';
        try { const r = await api('/api/ask/index', { method: 'POST' }); m.textContent = `Added ${r.channels.reduce((n, c) => n + (c.added || 0), 0)} messages.`; slack(); } catch (e) { m.textContent = e.message; }
      };
      $('#ssExtraSave').onclick = async () => { await api('/api/ask/settings', { method: 'PUT', body: JSON.stringify({ indexChannels: $('#ssExtra').value }) }); slack(); };
    } catch (e) { el.innerHTML = `<div class="hint">${E(e.message)}</div>`; }
  }

  /* ---- usage ---- */
  async function usage() {
    const el = $('#ssUse .set-body');
    try {
      const u = await api('/api/ask/usage?days=30');
      if (!u.answers) { el.innerHTML = '<div class="hint">No answers logged yet. Costs show here from the first answer.</div>'; return; }
      const mlabel = (m, e) => `${/opus/.test(m || '') ? 'Opus 5.5' : /sonnet/.test(m || '') ? 'Sonnet 5.5' : m || '?'}${e && e !== 'medium' ? ' ' + e : ''}`;
      el.innerHTML = `<div class="rollup" style="margin:0 0 12px">${[['Answers', u.answers], ['Spent', usd(u.cost)], ['Per answer', usd(u.avg_cost)], ['Average time', (u.avg_seconds || 0) + 's']].map(([k, v]) => `<div class="v2tile" style="padding:10px 12px"><div class="tiny">${k}</div><b style="font-size:18px">${v}</b></div>`).join('')}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
          <div><div class="tiny" style="font-weight:600;margin-bottom:4px">By person</div>${(u.by_person || []).map(p => `<div class="row" style="margin:0;justify-content:space-between"><span>${E(p.who)}</span><span>${p.answers} · ${usd(p.cost)}</span></div>`).join('')}</div>
          <div><div class="tiny" style="font-weight:600;margin-bottom:4px">By model</div>${(u.by_model || []).map(p => `<div class="row" style="margin:0;justify-content:space-between"><span>${E(mlabel(p.model, p.effort))}</span><span>${p.answers} · ${usd(p.cost)}</span></div>`).join('')}</div>
        </div>
        <details style="margin-top:12px"><summary class="tiny">The last answers</summary>${(u.recent || []).slice(0, 15).map(r => `<div class="tiny" style="padding:4px 0;border-top:1px solid var(--line)">${when(r.at)} · ${E(r.surface)} · ${E(r.who || '')} · ${usd(r.cost)} · ${r.steps} steps · ${Math.round((r.ms || 0) / 1000)}s${r.stopped ? ' · stopped' : ''}${r.error ? ' · <span style="color:var(--bad)">error</span>' : ''}<br><span style="opacity:.7">${E(r.question || '')}</span></div>`).join('')}</details>`;
    } catch (e) { el.innerHTML = `<div class="hint">${E(e.message)}</div>`; }
  }

  return { mount };
})();
