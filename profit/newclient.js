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
  summary: 'Summary for the team', ledger: 'Ledger', prefill: 'Form pre-filled from their website', email: 'Welcome email', stripe: 'First invoice', contract: 'Agreement', frame: 'Frame project',
};
const WHAT = {
  asana: 'Made from the 2026 template, your team added, the client invited by email.',
  onboard: 'The one link the client fills in. Posted on their "Start here" task.',
  drive: 'Branding and Assets folders, shared with the team and the client.',
  slack: 'Two private channels: one with the client, one for the team only.',
  summary: 'One post in the internal channel with every link.',
  frame: 'A Frame project for asset review, the team added.',
  ledger: 'The client and their retainer, for your books.',
  prefill: 'Locus reads their website and fills in what it can, so they only check it. Takes a few minutes.',
};
const AUTO = ['asana', 'onboard', 'drive', 'slack', 'frame', 'summary', 'ledger', 'prefill'];
const BY_HAND = [
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

  const frameRow = opts.frame
    ? ''
    : `<div class="notice warn" style="margin:0 0 14px">⚠️<div><b>Frame is not connected</b>, so new clients get no Frame project until it is. <a href="#" id="ncFrame">Connect Frame</a> (one time: an Adobe Developer Console app).</div></div>`;
  const w = shell(`<h3>New client</h3>
    <p class="hint" style="margin-bottom:14px">Fill this in once. Locus then makes their Asana project, onboarding link, Drive folder and Slack channels, and invites the client. You see every step as it happens.</p>
    ${frameRow}
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
  const fr = $$('#ncFrame'); if (fr) fr.onclick = e => { e.preventDefault(); close(); connectFrame(); };

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
  let run, welcome, contract = null, busy = '', mail = null, cv = null;
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
  /* The agreement: the blanks are editable until it is sent; after that it is frozen. */
  const readCv = () => { const g = k => body.querySelector('#cv_' + k)?.value; cv = { ...(cv || {}), client_name: g('client_name') ?? cv?.client_name, start_date: g('start_date') ?? cv?.start_date, term: g('term') ?? cv?.term, payment: g('payment') ?? cv?.payment, ...(cv?.html ? { html: cv.html } : {}) }; };
  const contractBlock = () => {
    const c = contract || {}; const st = run.steps.contract;
    if (!cv) cv = { ...(c.defaults || {}), ...(c.vars || {}) };
    if (c.status === 'signed') return `<div style="margin-top:16px"><b style="font-size:14px">✅ Agreement signed</b><span class="tiny" style="display:block">Signed by ${esc(c.signed_by || '')} on ${esc((c.signed_at || '').slice(0, 10))}. <a href="${esc(c.url)}" target="_blank" rel="noopener">Open the signed copy</a></span></div>`;
    if (c.status === 'sent') return `<div style="margin-top:16px"><b style="font-size:14px">📨 Agreement sent, waiting for their signature</b><span class="tiny" style="display:block">Sent ${esc((c.sent_at || '').slice(0, 10))} to ${esc(run.contact_email || '')}. <a href="${esc(c.url)}" target="_blank" rel="noopener">Open the signing page</a></span></div>`;
    const f = (k, label, help, ta) => `<div class="ab-f" style="margin-top:8px"><label style="font-size:13px">${label}</label><p class="hint" style="margin:0 0 4px">${help}</p>${ta ? `<textarea id="cv_${k}" rows="3" style="width:100%;border:1px solid var(--line-strong);border-radius:8px;padding:8px 10px;font:inherit;font-size:13.5px;background:transparent;color:inherit">${esc(cv[k] || '')}</textarea>` : `<input type="text" id="cv_${k}" value="${esc(cv[k] || '')}" style="width:100%">`}</div>`;
    return `<div style="margin-top:16px"><b style="font-size:14px">${busy === 'contract' ? '⏳' : '○'} Agreement</b>
      <span class="tiny${st?.status === 'failed' ? ' nc-bad' : ''}" style="display:block;margin-top:2px">${busy === 'contract' ? 'Sending…' : esc(st?.status === 'failed' ? st.text : 'Your standard services agreement with the blanks filled in. Check them, preview, then send. The client signs on a page inside their onboarding, no DocuSign.')}</span>
      ${f('client_name', 'Who signs for the client', 'Their full name, as it appears on the agreement.')}
      <div class="nc-two">${f('start_date', 'Start date', 'YYYY-MM-DD.')}${f('term', 'Term', 'How long the agreement runs before it renews.')}</div>
      ${cv.html ? `<p class="tiny" style="margin-top:8px">✎ This agreement has custom text from your edits. The fields above no longer apply to it. <a href="#" id="ncCvReset">Back to the standard text</a></p>` : f('payment', 'Payment terms', 'The one paragraph that changes per client.', true)}
      <div class="ab-f" style="margin-top:10px"><label style="font-size:13px">Anything different for this client?</label><p class="hint" style="margin:0 0 4px">Say it in plain words and the AI rewrites the agreement, changing only that. About a cent each time. For example: retainer is $3,000 plus 10% of ad spend, six-month term, add a clause that we can pause for non-payment.</p>
        <textarea id="ncCvAsk" rows="2" placeholder="What should be different?" style="width:100%;border:1px solid var(--line-strong);border-radius:8px;padding:8px 10px;font:inherit;font-size:13.5px;background:transparent;color:inherit"></textarea>
        <div class="row" style="gap:8px;margin-top:6px"><button class="btn" id="ncCvAi">Apply with AI</button><span class="tiny" id="ncCvAiMsg"></span></div></div>
      <p class="tiny nc-bad" id="ncCvErr" style="min-height:16px;margin:4px 0 0"></p>
      <div class="row" style="gap:8px;margin-top:4px"><button class="btn" id="ncContractPreview">Preview</button><button class="btn primary" id="ncContractSend"${busy || !run.onboard_url ? ' disabled' : ''}>Send for signature</button>${run.onboard_url ? '' : '<span class="tiny">Needs the onboarding link first.</span>'}</div></div>`;
  };
  /* The invoice is money, so it never runs by itself: one button, one confirm. */
  const invoiceBlock = () => {
    const st = run.steps.stripe;
    const amt = run.retainer ? `$${Number(run.retainer).toLocaleString('en-US')} a month` : '';
    if (!run.retainer) return `<div style="margin-top:16px"><b style="font-size:14px">○ First invoice</b><span class="tiny" style="display:block">Skipped: no retainer was entered. Send it from Stripe if you need one.</span></div>`;
    const sent = st?.status === 'done';
    return `<div style="margin-top:16px"><b style="font-size:14px">${sent ? (st.paid ? '✅' : '📨') : busy === 'stripe' ? '⏳' : '○'} First invoice, ${amt}</b>
      <span class="tiny${st?.status === 'failed' ? ' nc-bad' : ''}" style="display:block;margin-top:2px">${busy === 'stripe' ? 'Sending…' : esc(st?.text || `Stripe emails ${run.contact_email} the first invoice. When they pay it, their card is saved and the retainer bills itself every month from then on.`)}${st?.url ? ` <a href="${esc(st.url)}" target="_blank" rel="noopener">Open the invoice</a>` : ''}</span>
      ${sent || busy ? (sent && !st.paid ? `<button class="btn" data-go="stripe" style="margin-top:6px">Check if paid</button>` : '') : `<button class="btn primary" id="ncInvoice" style="margin-top:6px">${st?.status === 'failed' ? 'Try again' : 'Send the invoice'}</button>`}</div>`;
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
      ${invoiceBlock()}
      ${contractBlock()}
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
      <div class="row" style="justify-content:space-between;gap:8px;margin:14px 0 0"><button class="btn" id="ncRemove" style="color:var(--bad)">Remove this client</button><button class="btn" id="ncClose">Close</button></div>`;
    body.querySelector('#ncClose').onclick = close;
    body.querySelector('#ncRemove').onclick = async () => {
      if (!(await confirmModal(`Remove ${run.name} from this list?`, 'Locus forgets this setup. Anything already made in Asana, Drive, Slack or Frame stays and is yours to delete there. An unpaid invoice is voided and its subscription cancelled.', 'Remove'))) return;
      try { await post('/api/new-client/remove', { id }); close(); } catch (e) { noteModal('Could not remove', `<p>${esc(e.message)}</p>`); }
    };
    const cs = body.querySelector('#ncContractSend');
    if (cs) cs.onclick = async () => {
      readCv();
      if (!cv.client_name || cv.client_name.trim().split(/\s+/).length < 2) return body.querySelector('#ncCvErr').textContent = 'The agreement needs the client\'s full name, first and last.';
      if (!(await confirmModal('Send the agreement for signature?', `You sign it now; ${run.contact_email} gets an email with the signing page. The text cannot change after this.`, 'Send for signature'))) return;
      await go('contract');
    };
    const ai = body.querySelector('#ncCvAi');
    if (ai) ai.onclick = async () => {
      readCv();
      const ask = body.querySelector('#ncCvAsk').value.trim(); const msg = body.querySelector('#ncCvAiMsg');
      if (!ask) return msg.textContent = 'Say what should change first.';
      ai.disabled = true; msg.textContent = 'Rewriting…';
      try { const j = await post('/api/new-client/contract-ai', { id, vars: cv, instruction: ask }); cv.html = j.html; msg.textContent = `Done ($${j.cost}). Preview to read it.`; paint(); body.querySelector('#ncCvAiMsg').textContent = `Done ($${j.cost}). Press Preview to read it.`; }
      catch (e) { msg.textContent = e.message; ai.disabled = false; }
    };
    const rs = body.querySelector('#ncCvReset');
    if (rs) rs.onclick = e => { e.preventDefault(); delete cv.html; paint(); };
    const cp = body.querySelector('#ncContractPreview');
    if (cp) cp.onclick = async () => {
      readCv();
      try { const j = await post('/api/new-client/contract-preview', { id, vars: cv }); previewAgreement(j.html, cv); }
      catch (e) { noteModal('Could not build the preview', `<p>${esc(e.message)}</p>`); }
    };
    const inv = body.querySelector('#ncInvoice');
    if (inv) inv.onclick = async () => {
      if (!(await confirmModal(`Send the first invoice?`, `Stripe emails ${run.contact_email} an invoice for $${Number(run.retainer).toLocaleString('en-US')}. When they pay it, their card is saved and the retainer bills itself every month. Nothing is charged until they pay.`, 'Send the invoice'))) return;
      await go('stripe');
    };
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
        const j = await post('/api/new-client/step', { id, step: key, ...(key === 'email' ? { subject: mail.subject, body: mail.body, approved: true } : {}), ...(key === 'stripe' ? { approved: true } : {}), ...(key === 'contract' ? { approved: true, vars: cv } : {}) });
        run = j.run; welcome = j.welcome || welcome; contract = j.contract || contract; ok = j.ok;
      }
    } catch (e) { run.steps[key] = { status: 'failed', text: e.message }; }
    busy = ''; paint();
    return ok;
  }

  try { const j = await ah('/api/new-client/run?id=' + encodeURIComponent(id)); run = j.run; welcome = j.welcome; contract = j.contract; }
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

/* The preview IS the signing page: same sheet, same letterhead, same signature block. */
function previewAgreement(html, v) {
  const today = new Date().toLocaleDateString('en-US', { dateStyle: 'long' });
  const doc = `<!doctype html><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet"><link rel="stylesheet" href="https://tools.go-mobius-digital.com/onboard/agreement.css?v=1">
    <body style="margin:0;padding:18px;background:#F3F1FA"><div class="paper"><div class="letterhead"><div class="mark"><img src="https://tools.go-mobius-digital.com/favicon.png" alt=""><div><b>Mobius Digital</b><small>Services agreement</small></div></div><div class="meta"><b>${esc(v.company || '')}</b>Prepared ${esc(today)}<br>Awaiting signature</div></div>
    ${html}
    <div class="sig"><div class="party"><b>Provider</b><div class="name">Cole Wetzler</div><div class="meta"><span>Mobius Digital, LLC</span><br>Signed electronically when sent</div></div><div class="party"><b>Client</b><div class="name empty">Signature</div><div class="meta"><span>${esc(v.client_name || '')}</span><br>${esc(v.company || '')}</div></div></div></div></body>`;
  const w = shell(`<h3>Agreement, as the client sees it</h3><p class="hint" style="margin-bottom:10px">This is the page they open from the email. They type their name and press Sign at the bottom of it.</p>
    <iframe id="ncPrev" style="width:100%;height:70vh;border:1px solid var(--line);border-radius:10px;background:#F3F1FA" sandbox="allow-same-origin"></iframe>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="ncPrevClose">Close</button></div>`, 860);
  w.querySelector('#ncPrev').srcdoc = doc;
  w.querySelector('#ncPrevClose').onclick = () => w.remove();
}

/* ---------------- Connect Frame (Adobe) ---------------- */
async function connectFrame() {
  css();
  const w = shell(`<h3>Connect Frame</h3>
    <p class="hint">Your Frame is the new version (next.frame.io), which only talks to apps registered with Adobe. One time, about three minutes:</p>
    <ol style="font-size:13.5px;line-height:1.6;padding-left:18px;margin:8px 0 12px">
      <li>Go to <a href="https://developer.adobe.com/console" target="_blank" rel="noopener">developer.adobe.com/console</a> and sign in with the login you use for Frame.</li>
      <li>Create project &gt; Add API &gt; <b>Frame.io API</b> &gt; <b>OAuth Web App</b>.</li>
      <li>Default redirect URI: <code style="font-size:12px">https://mobius-account-health.mobius-digital.workers.dev/frame/callback</code> <button class="btn" id="ncCopyRedirect" style="padding:2px 8px;font-size:12px">Copy</button></li>
      <li>Save, then copy the <b>Client ID</b> and <b>Client Secret</b> here and press Connect. Adobe asks you to sign in once.</li>
    </ol>
    <div class="ab-form">
      <div class="ab-f"><label>Client ID</label><input type="text" id="ncFcid" autocomplete="off"></div>
      <div class="ab-f"><label>Client Secret</label><input type="password" id="ncFsec" autocomplete="off"></div>
    </div>
    <p class="tiny nc-bad" id="ncFerr" style="min-height:16px;margin:8px 0 0"></p>
    <div class="row" style="justify-content:flex-end;gap:8px;margin:6px 0 0"><button class="btn" data-m="no">Cancel</button><button class="btn primary" data-m="yes">Connect</button></div>`, 560);
  const $$ = s => w.querySelector(s);
  const close = () => w.remove();
  $$('[data-m="no"]').onclick = close;
  $$('#ncCopyRedirect').onclick = async () => { try { await navigator.clipboard.writeText('https://mobius-account-health.mobius-digital.workers.dev/frame/callback'); $$('#ncCopyRedirect').textContent = 'Copied'; } catch {} };
  $$('[data-m="yes"]').onclick = async () => {
    const err = $$('#ncFerr'); err.textContent = '';
    try {
      const r = await post('/api/frame/start', { client_id: $$('#ncFcid').value.trim(), client_secret: $$('#ncFsec').value.trim() });
      window.open(r.url, '_blank', 'noopener');
      close();
      noteModal('Finish in the Adobe tab', '<p>Sign in with your Frame login and allow it. The tab then says "Frame is connected" and lists your workspaces. Come back and open New client again.</p>');
    } catch (e) { err.textContent = e.message; }
  };
}

window.NewClient = { open, status, connectFrame };
})();
