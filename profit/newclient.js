/* New client (2026-10-02). One screen in Locus > Settings that sets a new client up
 * everywhere: Asana project, onboarding link, Drive folder, private Slack channels,
 * Ledger, website pre-fill, welcome email. The engine is
 * account-health/worker/src/newclient.js; this file is the screen.
 *
 * Each step runs on its own request, so the list fills in as it goes and any step can
 * be retried alone. A step that cannot run yet says why and what to do by hand.
 * The welcome email is never sent until Cole presses Send on its text.
 *
 * Classic script, loaded before the inline one: it uses the host's esc, S, noteModal and
 * confirmModal at call time.
 */
(function () {
'use strict';
const LEDGER_URL = 'https://mobius-ledger.mobius-digital.workers.dev';
const LABEL = {
  asana: 'Asana project', onboard: 'Onboarding link', drive: 'Google Drive folder', slack: 'Slack channels',
  summary: 'Summary for the team', ledger: 'Ledger', prefill: 'Form pre-filled from their website', email: 'Welcome email',
};
const WHAT = {
  asana: 'Made from the 2026 template, your team added, the client invited by email.',
  onboard: 'The one link the client fills in. Posted on their "Start here" task.',
  drive: 'Branding and Assets folders, shared with the team and the client.',
  slack: 'Two private channels: one with the client, one for the team only.',
  summary: 'One post in the internal channel with every link.',
  ledger: 'The client and their retainer, for your books.',
  prefill: 'Locus reads their website and fills in what it can, so they only check it. Takes a few minutes.',
};
const AUTO = ['asana', 'onboard', 'drive', 'slack', 'summary', 'ledger', 'prefill'];
const BY_HAND = [
  'Send the invoice and set up the subscription (Stripe is not connected to Locus yet)',
  'Send the contract (DocuSign is not connected to Locus yet)',
  'Create the Frame project and add the team',
  'Send the Shopify collaborator request once they give their store address in the form',
];

function css() {
  if (document.getElementById('ncCss')) return;
  const s = document.createElement('style'); s.id = 'ncCss';
  s.textContent = `
  .nc-chips{display:flex;flex-wrap:wrap;gap:6px}
  .nc-chip{border:1px solid var(--line-strong);background:transparent;color:inherit;border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;cursor:pointer}
  .nc-chip[aria-pressed="true"]{background:var(--ink,#17202b);color:var(--on-ink,#fff);border-color:transparent}
  .nc-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media (max-width:560px){.nc-two{grid-template-columns:1fr}}
  .nc-step{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:10px;padding:10px 0;border-top:1px solid var(--line);align-items:start}
  .nc-step:first-child{border-top:0}
  .nc-ic{font-size:15px;line-height:1.3}
  .nc-step b{font-size:14px}
  .nc-step .tiny{display:block;margin-top:2px;line-height:1.45;overflow-wrap:anywhere}
  .nc-bad{color:var(--bad)}
  .nc-mail textarea,.nc-mail input{width:100%;border:1px solid var(--line-strong);border-radius:8px;padding:9px 10px;font:inherit;font-size:13.5px;line-height:1.5;background:transparent;color:inherit}
  .nc-list{margin:6px 0 0;padding-left:18px;font-size:13.5px;line-height:1.55}
  .nc-runs{display:flex;flex-direction:column;gap:6px;margin:0 0 14px}
  .nc-runs a{font-size:13.5px}`;
  document.head.appendChild(s);
}

/* Local testing: localStorage pf_ah points this at a local account-health dev worker (same as brand.js). */
const AH = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (() => { try { return localStorage.getItem('pf_ah'); } catch { return null; } })()) || 'https://mobius-account-health.mobius-digital.workers.dev';
async function ah(path, opts = {}) {
  const res = await fetch(AH + path, { ...opts, headers: { Authorization: 'Bearer ' + S.tok, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
  return j;
}
const post = (path, body) => ah(path, { method: 'POST', body: JSON.stringify(body) });

function shell(inner, width) {
  const w = document.createElement('div');
  w.className = 'modal-wrap';
  w.innerHTML = `<div class="modal" style="max-width:${width || 600}px">${inner}</div>`;
  document.body.appendChild(w);
  return w;
}

/* ---------------- the form ---------------- */
async function open() {
  css();
  let opts;
  try { opts = await ah('/api/new-client/options'); }
  catch (e) { return noteModal('Could not open New client', `<p>${esc(e.message)}</p>`); }
  const team = opts.team || [];
  const pick = { strategist: '', buyer: '', editor: '' };
  const guess = re => team.find(t => re.test(t.name) || re.test(t.email))?.email || '';
  pick.buyer = guess(/ahsan/i); pick.editor = guess(/ravo/i);
  const chips = role => team.length
    ? `<div class="nc-chips" data-role="${role}">${team.map(t => `<button type="button" class="nc-chip" data-e="${esc(t.email)}" aria-pressed="${pick[role] === t.email}">${esc(t.name.split(' ')[0])}</button>`).join('')}</div>`
    : `<span class="tiny nc-bad">Could not read the team from Asana${opts.team_error ? ': ' + esc(opts.team_error) : ''}.</span>`;
  const f = (label, help, control) => `<div class="ab-f"><label>${label}</label><p class="hint">${help}</p>${control}</div>`;
  const today = new Date().toISOString().slice(0, 10);
  const runs = (opts.runs || []);

  const w = shell(`<h3>New client</h3>
    <p class="hint" style="margin-bottom:14px">Fill this in once. Locus then makes their Asana project, onboarding link, Drive folder and Slack channels, and invites the client. You see every step as it happens.</p>
    ${runs.length ? `<div class="nc-runs"><span class="tiny">Already started:</span>${runs.map(r => `<a href="#" data-run="${esc(r.id)}">${esc(r.name)} · open its setup</a>`).join('')}</div>` : ''}
    <div class="ab-form">
      ${f('Brand name', 'What you call them everywhere. It becomes the Asana project, the Drive folder and the Slack channel names.', '<input type="text" id="ncName" placeholder="e.g. Bonk Golf">')}
      ${f('Website', 'Locus reads it to pre-fill their onboarding form.', '<input type="text" id="ncSite" placeholder="brand.com">')}
      <div class="nc-two">
        ${f('Client name', 'Your main contact.', '<input type="text" id="ncContact" placeholder="First and last name">')}
        ${f('Client email', 'Gets the Asana, Slack and Drive invites.', '<input type="text" id="ncEmail" placeholder="name@brand.com">')}
      </div>
      <div class="nc-two">
        ${f('Monthly retainer', 'Goes into Ledger. Leave empty to skip.', '<input type="text" id="ncRet" inputmode="decimal" placeholder="e.g. 4000">')}
        ${f('Start date', 'The day the project starts.', `<input type="text" id="ncStart" value="${today}" placeholder="YYYY-MM-DD">`)}
      </div>
      ${f('Creative strategist', 'Gets added to Asana, Slack and Drive, and is assigned the research review.', chips('strategist'))}
      ${f('Media buyer', 'Gets added to Asana, Slack and Drive.', chips('buyer'))}
      ${f('Editor', 'Gets added to Asana, Slack and Drive. Tap again to leave empty.', chips('editor'))}
    </div>
    <p class="tiny" id="ncErr" style="color:var(--bad);min-height:16px;margin:10px 0 0"></p>
    <div class="row" style="justify-content:flex-end;gap:8px;margin:6px 0 0">
      <button class="btn" data-m="no">Cancel</button>
      <button class="btn primary" data-m="yes">Set up this client</button></div>`, 600);

  const $$ = s => w.querySelector(s);
  const close = () => { w.remove(); document.removeEventListener('keydown', k); };
  const k = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', k);
  $$('[data-m="no"]').onclick = close;
  w.querySelectorAll('.nc-chips').forEach(g => g.onclick = e => {
    const b = e.target.closest('.nc-chip'); if (!b) return;
    const role = g.dataset.role;
    pick[role] = pick[role] === b.dataset.e ? '' : b.dataset.e;
    g.querySelectorAll('.nc-chip').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.e === pick[role])));
  });
  w.querySelectorAll('[data-run]').forEach(a => a.onclick = e => { e.preventDefault(); close(); status(a.dataset.run, false); });

  $$('[data-m="yes"]').onclick = async () => {
    const err = $$('#ncErr'); err.textContent = '';
    const body = {
      name: $$('#ncName').value.trim(), website: $$('#ncSite').value.trim(),
      contact_name: $$('#ncContact').value.trim(), contact_email: $$('#ncEmail').value.trim(),
      retainer: parseFloat($$('#ncRet').value.replace(/[^0-9.]/g, '')) || null, start_date: $$('#ncStart').value.trim(), team: pick,
    };
    if (!body.name) return err.textContent = 'Give the brand a name.';
    if (!body.contact_email) return err.textContent = 'Add the client email. It is how they get invited to everything.';
    if (!pick.strategist) return err.textContent = 'Pick the creative strategist.';
    const ok = await confirmModal(`Set up ${body.name}?`,
      `Locus will make the Asana project, Drive folder and two private Slack channels, and invite ${body.contact_email} to all three. The welcome email waits for you to press Send.`, 'Yes, set it up');
    if (!ok) return;
    const btn = $$('[data-m="yes"]'); btn.disabled = true; btn.textContent = 'Starting…';
    try { const r = await post('/api/new-client', body); close(); status(r.run.id, true); }
    catch (e) { btn.disabled = false; btn.textContent = 'Set up this client'; err.textContent = e.message; }
  };
}

/* ---------------- the checklist ---------------- */
async function status(id, autorun) {
  css();
  let run, welcome, busy = '', mail = null;
  const w = shell('<div id="ncBody"><p class="hint">Loading…</p></div>', 640);
  const body = w.querySelector('#ncBody');
  let closed = false;
  const close = () => { closed = true; w.remove(); };

  const icon = st => st?.status === 'done' ? '✅' : st?.status === 'failed' ? '⚠️' : '○';
  const row = key => {
    const st = run.steps[key];
    const running = busy === key;
    const link = st?.url ? ` <a href="${esc(st.url)}" target="_blank" rel="noopener">Open</a>` : '';
    return `<div class="nc-step"><span class="nc-ic">${running ? '⏳' : icon(st)}</span>
      <div><b>${LABEL[key]}</b>${link}
        <span class="tiny${st?.status === 'failed' ? ' nc-bad' : ''}">${running ? 'Working…' : esc(st?.text || WHAT[key])}</span>
        ${(st?.notes || []).map(n => `<span class="tiny nc-bad">${esc(n)}</span>`).join('')}</div>
      ${!running && !busy && st?.status !== 'done' ? `<button class="btn" data-go="${key}">${st ? 'Retry' : 'Run'}</button>` : '<span></span>'}</div>`;
  };
  const paint = () => {
    if (closed) return;
    const m = run.steps.email;
    if (!mail) mail = { subject: welcome.subject, body: welcome.body };
    /* The link only exists after the onboarding step: refresh an untouched draft. */
    if (!mail.touched) mail = { subject: welcome.subject, body: welcome.body };
    body.innerHTML = `<h3>${esc(run.name)}: setup</h3>
      <p class="hint" style="margin-bottom:8px">Each line is one thing Locus does. A warning says what is missing and what to do instead. You can close this and come back from Settings > New client.</p>
      <div>${AUTO.map(row).join('')}</div>
      <div class="nc-mail" style="margin-top:16px">
        <b style="font-size:14px">${m?.status === 'done' ? '✅ ' : ''}Welcome email to ${esc(run.contact_email || '')}</b>
        <p class="tiny${m?.status === 'failed' ? ' nc-bad' : ''}" style="margin:2px 0 8px">${m ? esc(m.text) : 'Read it, change anything, then Send. It goes from your Gmail. Nothing is sent until you press Send.'}</p>
        ${m?.status === 'done' ? '' : `<input type="text" id="ncSub" style="margin-bottom:6px">
        <textarea id="ncMsg" rows="12"></textarea>
        <div class="row" style="justify-content:flex-end;gap:8px;margin:8px 0 0">
          <span class="tiny" id="ncMailMsg" style="margin-right:auto"></span>
          <button class="btn" id="ncCopy">Copy</button>
          <button class="btn primary" id="ncSend"${busy || !run.onboard_url ? ' disabled' : ''}>Send</button></div>`}
      </div>
      <div style="margin-top:16px"><b style="font-size:14px">Still by hand for now</b>
        <ul class="nc-list">${BY_HAND.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="row" style="justify-content:flex-end;gap:8px;margin:14px 0 0"><button class="btn" id="ncClose">Close</button></div>`;
    body.querySelector('#ncClose').onclick = close;
    body.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    const sub = body.querySelector('#ncSub'), msg = body.querySelector('#ncMsg');
    if (sub) {
      sub.value = mail.subject; msg.value = mail.body;
      sub.oninput = () => { mail.subject = sub.value; mail.touched = true; };
      msg.oninput = () => { mail.body = msg.value; mail.touched = true; };
      body.querySelector('#ncCopy').onclick = async () => {
        const note = body.querySelector('#ncMailMsg');
        try { await navigator.clipboard.writeText(`${mail.subject}\n\n${mail.body}`); note.textContent = 'Copied.'; }
        catch { msg.select(); note.textContent = 'Select all and copy.'; }
      };
      body.querySelector('#ncSend').onclick = async () => {
        if (!(await confirmModal('Send the welcome email?', `It goes to ${run.contact_email} from your Gmail, exactly as written.`, 'Send it'))) return;
        await go('email');
      };
    }
  };

  /* Ledger lives on its own worker; the browser calls it with the same sign-in. */
  async function ledger() {
    if (!run.retainer) return { ok: true, text: 'Skipped: no retainer was entered.' };
    const res = await fetch(LEDGER_URL + '/api/client', { method: 'POST', headers: { Authorization: 'Bearer ' + S.tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: run.name, retainer: run.retainer, active: true, billing: 'retainer' }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Ledger answered ${res.status}. Add ${run.name} in Ledger > Settings by hand.`);
    return { ok: true, text: `Added to Ledger at $${Number(run.retainer).toLocaleString('en-US')} a month.` };
  }
  /* The website pre-fill is a stream (it reads pages for a few minutes). */
  async function prefill() {
    if (!run.website) return { ok: true, text: 'Skipped: no website was entered.' };
    if (!run.pending_act && !run.act_id) throw new Error('Make the onboarding link first.');
    const res = await fetch(AH + '/api/research/prefill', { method: 'POST', headers: { Authorization: 'Bearer ' + S.tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ act: run.act_id || run.pending_act }) });
    if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    const rd = res.body.getReader(), dec = new TextDecoder();
    let buf = '', out = null;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) { let o; try { o = JSON.parse(l); } catch { continue; } if (o.type === 'done') out = { ok: true, text: `${o.summary}${o.cost ? ` Cost $${o.cost}.` : ''}` }; if (o.type === 'error') throw new Error(o.text); }
    }
    if (!out) throw new Error('The website read stopped early. Press Retry.');
    return out;
  }

  async function go(key) {
    if (busy) return false;
    busy = key; paint();
    let ok = false;
    try {
      if (key === 'ledger' || key === 'prefill') {
        let r;
        try { r = await (key === 'ledger' ? ledger() : prefill()); } catch (e) { r = { ok: false, text: e.message }; }
        const j = await post('/api/new-client/mark', { id, step: key, ok: r.ok, text: r.text });
        run = j.run; ok = r.ok;
      } else {
        const j = await post('/api/new-client/step', { id, step: key, ...(key === 'email' ? { subject: mail.subject, body: mail.body, approved: true } : {}) });
        run = j.run; welcome = j.welcome || welcome; ok = j.ok;
      }
    } catch (e) { run.steps[key] = { status: 'failed', text: e.message }; }
    busy = ''; paint();
    return ok;
  }

  try { const j = await ah('/api/new-client/run?id=' + encodeURIComponent(id)); run = j.run; welcome = j.welcome; }
  catch (e) { body.innerHTML = `<h3>Could not load</h3><p class="hint">${esc(e.message)}</p>`; return; }
  paint();
  if (autorun) {
    for (const key of AUTO) {
      if (closed) return;
      if (run.steps[key]?.status === 'done') continue;
      const ok = await go(key);
      /* Without the project there is nothing to hang the rest on. */
      if (!ok && key === 'asana') break;
    }
  }
}

window.NewClient = { open, status };
})();
