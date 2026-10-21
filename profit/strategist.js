/**
 * Agency settings > Locus (2026-10-09, the Viktor-grade pass): the controls Viktor puts in its
 * settings, for ours. Model (Smart / Quick / Deep), standing instructions, what it remembers (per brand,
 * editable, with history), its skills, what it reads in Slack, and what it costs.
 * Data: account-health /api/ask/settings | memory | skills | index | usage | review (admin), through apiAH.
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
      ${card('ssWho', 'Who can use Locus in Slack', 'Locus answers you and the team anywhere it is tagged: DMs, brand channels, and shared channels like the email agency\'s. Anyone else gets no answer, only a note that only they can see, unless you add them here.', '<div class="hint">Loading…</div>')}
      ${card('ssModel', 'How it thinks', 'The model every question uses. Anyone can add !fast or !deep to one message for that answer only (like Viktor).', '<div class="hint">Loading…</div>')}
      ${card('ssMem', 'What it remembers', 'Short facts it has been told: decisions, offers, dates, preferences, rules a client set. A new fact on the same topic replaces the old one, dated facts stop on their day, and each brand keeps 40 at most. Every night it reads the day\'s brand channels and keeps what matters. Edit or forget anything here.', '<div class="hint">Loading…</div>')}
      ${card('ssSkills', 'Skills', 'How this team does a job, written down once so it is done the same way every time. It reads the matching skill before the job. Teach it in chat ("from now on, do it like this") or add one here.', '<div class="hint">Loading…</div>')}
      ${card('ssSlack', 'What it reads in Slack', 'Every message in each brand\'s internal and client channel is kept as it arrives and searched when a question needs it. It never posts in a client channel.', '<div class="hint">Loading…</div>')}
      ${card('ssReview', 'Monday account review', 'Every Monday after the briefs and weekly reports, it reviews each active brand: the command center and Day check, goals against the plan, tired ads, budgets, stock and the next 14 days of the calendar. It posts one message to the brand\'s internal channel with its read, and each change it would make as an Apply card under it. Nothing changes until someone presses Apply. It never posts to a client channel.', '<div class="hint">Loading…</div>')}
      ${card('ssUse', 'What it costs', 'Every answer, last 30 days. Each answer in Slack and Locus also shows its own cost underneath.', '<div class="hint">Loading…</div>')}
    </div>`);
    await Promise.all([who(), model(), memory(), skills(), slack(), review(), usage()]);
  }

  /* ---- who can use Locus in Slack (2026-10-21, account-health slackaccess.js) ---- */
  const LEVEL = { owner: 'Always', team: 'The team', guest: 'Added, read only', off: 'Blocked', none: 'No access' };
  async function who() {
    const el = $('#ssWho .set-body');
    try {
      const a = await api('/api/ask/slack-access');
      const bname = id => (a.brands.find(b => b.id === id) || {}).name || id;
      const people = Object.entries(a.people || {});
      const chans = Object.entries(a.channels || {});
      const tiers = [['Cole', 'Always, everywhere, can change anything.'],
        ['The team', 'Anyone with a Mobius email, or on Team and access. Each sees the brands Team and access gives them.'],
        ['People you add', 'Someone outside Mobius (a client, the email agency). Read only: Locus answers them but never changes anything, and only about the brands you pick.'],
        ['Everyone else', 'No answer. If they tag Locus, they get a private note saying to ask you.']];
      el.innerHTML = `<table class="settings" style="width:100%;margin:0 0 14px"><tbody>${tiers.map(([t, d], i) => `<tr><td style="width:150px"><b>${i + 1}. ${E(t)}</b></td><td class="tiny">${E(d)}</td></tr>`).join('')}</tbody></table>
        <div class="row" style="gap:8px;margin:0 0 6px;align-items:center"><b style="flex:1">People you added</b>${a.owner ? '<button class="btn" id="ssWhoAdd">Add a person</button>' : ''}</div>
        ${people.length ? `<table class="settings" style="width:100%"><thead><tr><th>Person</th><th>Access</th><th>Brands</th><th></th></tr></thead><tbody>${people.map(([id, p]) => `
          <tr><td>${E(p.name || id)}</td><td>${E(LEVEL[p.level] || p.level)}</td><td class="tiny">${p.level === 'off' ? '' : p.brands.length ? E(p.brands.map(bname).join(', ')) : 'Every brand'}</td>
          <td style="white-space:nowrap">${a.owner ? `<button class="btn" data-wp="${E(id)}">Edit</button> <button class="btn" data-wpx="${E(id)}">Remove</button>` : ''}</td></tr>`).join('')}</tbody></table>`
          : '<div class="hint">Nobody added. Only you and the team can use Locus.</div>'}
        <div class="row" style="gap:8px;margin:16px 0 6px;align-items:center"><b style="flex:1">Other channels</b>${a.owner ? '<button class="btn" id="ssChAdd">Set a channel</button>' : ''}</div>
        <p class="tiny" style="margin:0 0 8px;opacity:.75">Locus works in any channel it is in. Set a channel here to tell it which brand the channel is about (it guesses from the name, so #lucky-email is Lucky Golf), or to keep it quiet there.</p>
        ${chans.length ? `<table class="settings" style="width:100%"><thead><tr><th>Channel</th><th>Brand</th><th>Locus</th><th></th></tr></thead><tbody>${chans.map(([id, c]) => `
          <tr><td>#${E(c.name || id)}</td><td>${c.brand ? E(bname(c.brand)) : '<span class="tiny">From the name</span>'}</td><td>${c.off ? 'Quiet here' : 'On'}</td>
          <td style="white-space:nowrap">${a.owner ? `<button class="btn" data-wc="${E(id)}">Edit</button> <button class="btn" data-wcx="${E(id)}">Remove</button>` : ''}</td></tr>`).join('')}</tbody></table>` : ''}
        ${a.owner ? '' : '<p class="tiny" style="margin:10px 0 0;opacity:.7">Only Cole changes this.</p>'}`;
      if (!a.owner) return;
      const put = async b => { await api('/api/ask/slack-access', { method: 'PUT', body: JSON.stringify(b) }); who(); };
      $('#ssWhoAdd').onclick = () => personModal(a, null, put);
      el.querySelectorAll('[data-wp]').forEach(b => b.onclick = () => personModal(a, b.dataset.wp, put));
      el.querySelectorAll('[data-wpx]').forEach(b => b.onclick = async () => {
        if (await window.confirmModal('Remove this person?', 'They go back to the normal rule: the team can use Locus, anyone else cannot.', 'Remove')) put({ person: { id: b.dataset.wpx, remove: true } });
      });
      $('#ssChAdd').onclick = () => channelModal(a, null, put);
      el.querySelectorAll('[data-wc]').forEach(b => b.onclick = () => channelModal(a, b.dataset.wc, put));
      el.querySelectorAll('[data-wcx]').forEach(b => b.onclick = () => put({ channel: { id: b.dataset.wcx, remove: true } }));
    } catch (e) { el.innerHTML = `<div class="hint">${E(e.message)}</div>`; }
  }

  /* A modal shell with a body the caller fills and wires. Resolves with whatever done() gets. */
  function shell(title, html, wire) {
    return new Promise(resolve => {
      const w = document.createElement('div');
      w.className = 'modal-wrap';
      w.innerHTML = `<div class="modal" style="max-width:560px"><h3>${E(title)}</h3>${html}
        <div class="row" style="justify-content:flex-end;gap:8px;margin:16px 0 0"><button class="btn" data-m="no">Cancel</button><button class="btn primary" data-m="yes">Save</button></div></div>`;
      document.body.appendChild(w);
      const done = v => { w.remove(); document.removeEventListener('keydown', k); resolve(v); };
      const k = e => { if (e.key === 'Escape') done(null); };
      document.addEventListener('keydown', k);
      w.addEventListener('mousedown', e => { if (e.target === w) done(null); });
      w.querySelector('[data-m="no"]').onclick = () => done(null);
      wire(w, done);
    });
  }
  const brandChecks = (a, picked) => `<div style="display:flex;flex-wrap:wrap;gap:6px 14px;margin:6px 0 0">${a.brands.map(b => `
    <label class="tiny" style="display:flex;align-items:center;gap:6px"><input type="checkbox" data-br="${E(b.id)}" style="width:auto" ${picked.includes(b.id) ? 'checked' : ''}> ${E(b.name)}</label>`).join('')}</div>`;

  async function personModal(a, id, put) {
    const cur = id ? a.people[id] : null;
    let chans = [];
    if (!id) chans = (await api('/api/ask/slack-channels').catch(() => ({ channels: [] }))).channels || [];
    const v = await shell(cur ? `Edit ${cur.name || id}` : 'Add a person', `
      ${id ? '' : `<label class="tiny" style="display:block;margin:4px 0 5px;font-weight:600">Find them</label>
        <div class="row" style="gap:8px;margin:0"><input type="text" id="wpQ" placeholder="Type a name" style="flex:1">
        <select id="wpCh"><option value="">or pick a channel they are in</option>${chans.map(c => `<option value="${E(c.id)}">#${E(c.name)}${c.shared ? ' (shared)' : ''}</option>`).join('')}</select></div>
        <p class="tiny" style="margin:5px 0 0;opacity:.7">People from another company (Slack Connect) only show up by picking a channel they are in.</p>
        <div id="wpList" style="max-height:220px;overflow:auto;margin:10px 0 0"></div>`}
      <label class="tiny" style="display:block;margin:14px 0 5px;font-weight:600">Access</label>
      <select id="wpLevel"><option value="guest" ${cur?.level !== 'off' ? 'selected' : ''}>Can use Locus, read only</option><option value="off" ${cur?.level === 'off' ? 'selected' : ''}>Blocked (even if they are on the team)</option></select>
      <label class="tiny" style="display:block;margin:14px 0 0;font-weight:600">Brands they can ask about (none ticked = every brand)</label>
      ${brandChecks(a, cur?.brands || [])}`, (w, done) => {
      let pick = id ? { id, name: cur?.name || id } : null;
      const list = w.querySelector('#wpList');
      const draw = people => {
        list.innerHTML = people.length ? people.map(p => `<button class="btn" data-pid="${E(p.id)}" data-pn="${E(p.name)}" style="display:flex;width:100%;justify-content:space-between;margin:0 0 4px;text-align:left">
          <span>${E(p.name)}</span><span class="tiny">${E(LEVEL[p.role] || p.role)}</span></button>`).join('') : '<div class="hint">Nobody found.</div>';
        list.querySelectorAll('[data-pid]').forEach(b => b.onclick = () => {
          pick = { id: b.dataset.pid, name: b.dataset.pn };
          list.querySelectorAll('[data-pid]').forEach(x => x.classList.toggle('primary', x === b));
        });
      };
      const load = async qs => { list.innerHTML = '<div class="hint">Looking…</div>'; try { draw((await api('/api/ask/slack-people?' + qs)).people || []); } catch (e) { list.innerHTML = `<div class="hint">${E(e.message)}</div>`; } };
      if (!id) {
        let t;
        w.querySelector('#wpQ').oninput = e => { clearTimeout(t); const q = e.target.value.trim(); if (q.length >= 2) t = setTimeout(() => load('q=' + encodeURIComponent(q)), 300); };
        w.querySelector('#wpCh').onchange = e => { if (e.target.value) load('channel=' + encodeURIComponent(e.target.value)); };
        setTimeout(() => w.querySelector('#wpQ').focus(), 30);
      }
      w.querySelector('[data-m="yes"]').onclick = () => {
        if (!pick) { list.insertAdjacentHTML('afterbegin', '<div class="hint" style="color:var(--bad)">Pick a person first.</div>'); return; }
        done({ ...pick, level: w.querySelector('#wpLevel').value, brands: [...w.querySelectorAll('[data-br]:checked')].map(x => x.dataset.br) });
      };
    });
    if (v) await put({ person: v });
  }

  async function channelModal(a, id, put) {
    const cur = id ? a.channels[id] : null;
    const chans = id ? [] : ((await api('/api/ask/slack-channels').catch(() => ({ channels: [] }))).channels || []);
    const v = await shell(cur ? `#${cur.name || id}` : 'Set a channel', `
      ${id ? '' : `<label class="tiny" style="display:block;margin:4px 0 5px;font-weight:600">Channel (ones the Mobius Digital app is in)</label>
        <select id="wcId" style="width:100%">${chans.map(c => `<option value="${E(c.id)}" data-n="${E(c.name)}">#${E(c.name)}${c.shared ? ' (shared with another company)' : ''}</option>`).join('')}</select>`}
      <label class="tiny" style="display:block;margin:14px 0 5px;font-weight:600">Which brand is it about</label>
      <select id="wcBrand" style="width:100%"><option value="">Work it out from the channel name</option>${a.brands.map(b => `<option value="${E(b.id)}" ${cur?.brand === b.id ? 'selected' : ''}>${E(b.name)}</option>`).join('')}</select>
      <label class="tiny" style="display:flex;align-items:center;gap:8px;margin:14px 0 0"><input type="checkbox" id="wcOff" style="width:auto" ${cur?.off ? 'checked' : ''}> Keep Locus quiet in this channel</label>`, (w, done) => {
      w.querySelector('[data-m="yes"]').onclick = () => {
        const sel = w.querySelector('#wcId');
        const cid = id || sel?.value;
        if (!cid) return;
        done({ id: cid, name: cur?.name || sel?.selectedOptions[0]?.dataset.n || '', brand: w.querySelector('#wcBrand').value || null, off: w.querySelector('#wcOff').checked });
      };
    });
    if (v) await put({ channel: v });
  }

  /* ---- model + instructions ---- */
  async function model() {
    const el = $('#ssModel .set-body');
    try {
      const s = await api('/api/ask/settings');
      el.innerHTML = `<div class="seg" style="display:flex;gap:8px;flex-wrap:wrap">${['smart', 'quick', 'deep'].map(k => `
          <button class="btn ${s.model === k ? 'primary' : ''}" data-mp="${k}" style="text-align:left;flex:1;min-width:180px;padding:10px 12px">
            <b style="display:block">${k === 'smart' ? 'Smart' : k === 'quick' ? 'Quick' : 'Deep'}</b>
            <span class="tiny" style="display:block;opacity:.85;color:inherit">${E(WHAT[k])}</span><span class="tiny" style="display:block;opacity:.7;color:inherit">${E(COST[k])}</span></button>`).join('')}</div>
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

  /* ---- Monday account review (2026-10-10, account-health review.js) ---- */
  const REV_STATE = { ok: 'Posted', skipped: 'Skipped', error: 'Failed', running: 'Running' };
  function showModal(title, html) {
    const w = document.createElement('div');
    w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal" style="max-width:720px;max-height:86vh;overflow:auto"><h3>${E(title)}</h3>${html}
      <div class="row" style="justify-content:flex-end;margin:16px 0 0"><button class="btn primary" data-m="ok">Close</button></div></div>`;
    document.body.appendChild(w);
    const done = () => { w.remove(); document.removeEventListener('keydown', k); };
    const k = e => { if (e.key === 'Escape') done(); };
    document.addEventListener('keydown', k);
    w.addEventListener('mousedown', e => { if (e.target === w) done(); });
    w.querySelector('[data-m="ok"]').onclick = done;
  }
  async function review() {
    const el = $('#ssReview .set-body');
    try {
      const r = await api('/api/ask/review');
      const brands = r.brands || [];
      const ready = brands.filter(b => !b.skip);
      el.innerHTML = `<div class="row" style="gap:10px;margin:0 0 10px;flex-wrap:wrap;align-items:center">
          <label style="display:flex;align-items:center;gap:8px;font-weight:600"><input type="checkbox" id="ssRevOn" ${r.on ? 'checked' : ''}> Run the review every Monday</label>
          <span class="tiny" id="ssRevMsg"></span></div>
        <p class="tiny" style="margin:0 0 4px">${E(r.when || '')}. ${E(r.cost || '')} At most ${r.max_cards || 4} suggested changes per brand.</p>
        <table class="settings" style="width:100%;margin:10px 0 0"><thead><tr><th>Brand</th><th>Posts to</th><th>This Monday</th></tr></thead><tbody>${brands.map(b => {
          const t = b.today;
          const st = b.skip ? `<span class="tiny">Skipped: ${E(b.skip)}</span>`
            : t ? `<span class="tiny" style="${t.status === 'error' ? 'color:var(--bad)' : ''}">${E(REV_STATE[t.status] || t.status)}${t.status === 'ok' ? ` · ${t.cards || 0} card${t.cards === 1 ? '' : 's'} · ${usd(t.cost)}` : ''}${t.error ? ` · ${E(t.error)}` : ''}</span>`
            : '<span class="tiny" style="opacity:.6">Not run yet</span>';
          return `<tr><td>${E(b.name)}</td><td class="tiny">${b.channel ? 'Internal channel' : '<span style="opacity:.6">None</span>'}</td><td>${st}</td></tr>`;
        }).join('')}</tbody></table>
        <label class="tiny" style="display:block;margin:16px 0 5px;font-weight:600">Preview this week's review for one brand</label>
        <div class="row" style="gap:8px;margin:0;flex-wrap:wrap;align-items:center">
          <select id="ssRevBrand">${ready.map(b => `<option value="${E(b.act_id)}">${E(b.name)}</option>`).join('')}</select>
          <button class="btn" id="ssRevPrev" ${ready.length ? '' : 'disabled'}>Preview this week's review</button><span class="tiny" id="ssRevPrevMsg"></span></div>
        <p class="tiny" style="margin:5px 0 0;opacity:.7">Runs the real review now and shows it here. Nothing is posted to Slack and nothing changes. Costs one answer (about $0.40 to $1.00) and takes a minute or two.</p>`;
      $('#ssRevOn').onchange = async e => {
        const m = $('#ssRevMsg'); m.textContent = 'Saving…';
        try { const x = await api('/api/ask/review', { method: 'PUT', body: JSON.stringify({ on: e.target.checked }) }); m.textContent = x.on ? 'On. The next one runs on Monday.' : 'Off.'; }
        catch (err) { m.textContent = err.message; e.target.checked = !e.target.checked; }
      };
      $('#ssRevPrev').onclick = async () => {
        const sel = $('#ssRevBrand'), name = sel.options[sel.selectedIndex]?.text || '';
        if (!(await window.confirmModal(`Preview the review for ${name}?`, 'Locus reads the brand and writes its Monday review now. Nothing is posted or changed. It costs one answer (about $0.40 to $1.00) and takes a minute or two.', 'Run the preview'))) return;
        const b = $('#ssRevPrev'), m = $('#ssRevPrevMsg');
        b.disabled = true; m.textContent = 'Reading the account. This takes a minute or two.';
        try {
          const x = await api('/api/ask/review/preview', { method: 'POST', body: JSON.stringify({ act: sel.value }) });
          m.textContent = '';
          const ps = x.proposals || [];
          showModal(`Monday review: ${x.brand}`, `<div style="white-space:pre-wrap;font-size:13.5px;line-height:1.55">${E(x.text || '')}</div>
            <h4 style="margin:18px 0 6px">Changes it would post as Apply cards (${ps.length})</h4>
            ${ps.length ? ps.map(p => `<div style="padding:8px 0;border-top:1px solid var(--line)"><b>${E(p.summary)}</b>${p.detail ? `<div class="tiny" style="white-space:pre-wrap;opacity:.85">${E(p.detail)}</div>` : ''}</div>`).join('') : '<div class="hint">None. It would say nothing needs to change.</div>'}
            <p class="tiny" style="margin:12px 0 0;opacity:.7">${E(x.costLine || usd(x.cost))}. A preview only: nothing was posted or changed.</p>`);
        } catch (e) { m.textContent = e.message; }
        b.disabled = false;
      };
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
