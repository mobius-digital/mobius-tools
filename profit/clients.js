/* CLIENT LOGINS (2026-10-09). The screens for the client role: the Client logins card (Agency settings > Clients,
 * Brand settings > Client access), the invite (form, then the email text shown for approval, then Send from Cole's
 * Gmail), and what a signed-in client sees that the team does not: the welcome card on Home, their profile (their
 * "Settings"), Reports (sent only) and their creator link. Engine: account-health src/clients.js; who may open
 * what: brandguard.js (both workers). Classic script with its own closure; it uses the host's globals at call
 * time (esc, S, apiAH, api, show, confirmModal, noteModal, pageHead, reportBodyHTML...).
 */
(function () {
'use strict';
/* 2026-10-09 (Cole: a client sees EVERYTHING about their own business): every switch is ON by default on the server
   (brandguard CLIENT_SWITCHES); a switch here only turns one thing off for a brand. On = they see it. */
const SW = [
  ['pl', 'P&L', 'Costs, margins and contribution margin. Off: they see sales, spend and results, never what is left after costs.'],
  ['changes', 'Change history', 'The Meta and Google change logs: budgets, launches and pauses, with who made them.'],
  ['strategist', 'Ask the Strategist', 'A client-safe Strategist that answers questions about their own numbers only. No internal notes, no Slack, no changes. Up to 20 questions a day.'],
  ['creators', 'Creator link', 'Their creator link page under Creative.'],
];
const DEFAULT_ON = { pl: true, changes: true, strategist: true, creators: true };
const accOf = a => ({ ...DEFAULT_ON, ...(a || {}) });
/* The one line, then the overrides folded away. `on` = {key: bool}, `editable` = the toggles answer clicks. */
const everythingBlock = (on, brandName, editable, applies) => {
  const off = SW.filter(([k]) => on[k] === false);
  return `<div class="cl-all"><p class="cl-all-h"><b>Clients see everything about their own business.</b> Sales, ads, email and SMS, the store, the calendar, P&L, change history, their creator link and a Strategist that answers about their own numbers. Never another brand, a draft, settings or the team's notes.</p>
    <details class="cl-off"${off.length ? ' open' : ''}><summary>Turn something off for this client${off.length ? ` <span class="cl-offn">${off.length} off: ${esc(off.map(x => x[1]).join(', '))}</span>` : ''}</summary>
      <p class="hint" style="margin:6px 0 2px">${esc(applies || `Applies to every client login on ${brandName || 'this brand'}.`)} On means they see it.</p>
      <div class="cl-sw">${SW.map(([k, l, h]) => `<label>${toggle(k, on[k] !== false, editable ? '' : ' aria-disabled="true"')}<b>${l}</b><small>${h}</small></label>`).join('')}</div></details></div>`;
};
const ago = iso => { if (!iso) return 'never'; const d = (Date.now() - Date.parse(iso)) / 864e5; return d < 1 / 24 ? 'just now' : d < 1 ? `${Math.round(d * 24)}h ago` : d < 30 ? `${Math.round(d)}d ago` : String(iso).slice(0, 10); };
function css() {
  if (document.getElementById('clCss')) return;
  const s = document.createElement('style'); s.id = 'clCss';
  s.textContent = `
  .cl-tbl td{vertical-align:top}
  .cl-tbl .tiny{display:block;color:var(--muted)}
  .cl-sw{display:grid;gap:10px;margin:6px 0 0}
  .cl-sw label{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;align-items:start;cursor:pointer}
  .cl-sw label .toggle{margin-top:2px}
  .cl-sw small{grid-column:2;color:var(--muted);font-size:12.5px;line-height:1.45}
  .cl-chips{display:flex;flex-wrap:wrap;gap:6px}
  .cl-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line-strong);background:transparent;color:inherit;border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;cursor:pointer}
  .cl-chip .cl-ck{display:none;width:13px;height:13px;flex:none}
  .cl-chip[aria-pressed="true"] .cl-ck{display:block}
  .cl-chip[aria-pressed="true"]{background:var(--brand-soft);color:var(--brand-ink,var(--ink));border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand);font-weight:600}
  .cl-all{margin:18px 0 0;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2)}
  .cl-all-h{margin:0;font-size:13.5px;line-height:1.55;color:var(--ink-2)}
  .cl-all-h b{color:var(--ink)}
  .cl-off{margin:10px 0 0}
  .cl-off summary{cursor:pointer;font-size:13px;font-weight:600;color:var(--ink);list-style-position:inside}
  .cl-offn{font-weight:500;color:var(--warn);margin-left:6px}
  .cl-m label.set-lbl{display:block;margin:14px 0 4px;font-weight:600;font-size:13px}
  .cl-m input[type=text],.cl-m textarea{width:100%;border:1px solid var(--line-strong);border-radius:8px;padding:9px 10px;font:inherit;font-size:13.5px;line-height:1.5;background:transparent;color:inherit}
  .cl-m .hint{margin:2px 0 0}
  .cl-wel{border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:0 0 16px;background:var(--surface)}
  .cl-wel h3{margin:0 0 6px}
  .cl-wel ul{margin:10px 0 12px;padding-left:18px;line-height:1.6}
  .cl-prof{max-width:640px}
  .cl-prof .kv{display:grid;grid-template-columns:140px 1fr;gap:8px 16px;margin:8px 0 0;font-size:14px}
  .cl-prof .kv span{color:var(--muted)}
  body.is-client [hidden], body.is-client .cal-team{display:none !important}
  /* A client login: the team's buttons are not drawn (the server refuses them anyway). */
  body.is-client .v2gos, body.is-client [data-studio], body.is-client [data-more], body.is-client [data-ask], body.is-client .v2read,
  body.is-client [data-go="settings"], body.is-client [data-go="yesterday"], body.is-client [data-go="mtoday"], body.is-client [data-go="mbrowser"], body.is-client [data-go="gterms"],
  body.is-client [data-go="season"], body.is-client [data-go="drops"], body.is-client [data-go="plan"], body.is-client [data-go="today"], body.is-client [data-go="tiktok"],
  body.is-client:not(.cl-changes) [data-go="changes"], body.is-client:not(.cl-changes) [data-go="gchanges"]{display:none !important}`;
  document.head.appendChild(s);
}
/** Keeps "N off: ..." beside the fold in step after a switch flips (no redraw, the fold stays as it is). */
function offLine(root, on) {
  const s = root.querySelector('.cl-off summary'); if (!s) return;
  const off = SW.filter(([k]) => on[k] === false);
  s.innerHTML = `Turn something off for this client${off.length ? ` <span class="cl-offn">${off.length} off: ${esc(off.map(x => x[1]).join(', '))}</span>` : ''}`;
}
const toggle = (k, on, extra = '') => `<span class="toggle${on ? ' on' : ''}" data-sw="${k}" role="switch" aria-checked="${on}" tabindex="0"${extra}></span>`;
function wireToggles(root, onFlip) {
  root.querySelectorAll('[data-sw]').forEach(t => {
    const flip = async () => { const on = !t.classList.contains('on'); t.classList.toggle('on', on); t.setAttribute('aria-checked', on); if (onFlip) { const ok = await onFlip(t.dataset.sw, on); if (ok === false) { t.classList.toggle('on', !on); t.setAttribute('aria-checked', !on); } } };
    t.onclick = flip; t.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } };
  });
}

/* ---------------- the card (team) ---------------- */
async function card(host, opts = {}) {
  css();
  if (!host) return;
  const act = opts.act && opts.act !== 'all' ? opts.act : null;
  const one = act ? S.accounts.find(a => a.act_id === act) : null;
  host.innerHTML = '<div class="card set-card"><span class="hint">Loading client logins…</span></div>';
  let d;
  try { d = await apiAH('/api/clients' + (act ? `?act=${encodeURIComponent(act)}` : ''), { fresh: true }); }
  catch (e) { host.innerHTML = `<div class="card set-card"><h3>Client logins</h3><p style="color:var(--bad)">${esc(e.message)}</p></div>`; return; }
  const acc = act ? accOf(d.access[act]) : null;
  const rows = d.clients.map(c => `<tr data-e="${esc(c.email)}"><td><b>${esc(c.name || c.email)}</b>${c.name ? `<span class="tiny">${esc(c.email)}</span>` : ''}</td>
      <td>${c.brands.map(b => esc(b.name)).join(', ')}</td>
      <td>${c.last_sign_in ? ago(c.last_sign_in) : '<span class="faint">not yet</span>'}${c.last_seen && c.last_seen !== c.last_sign_in ? `<span class="tiny">last open ${ago(c.last_seen)}</span>` : ''}</td>
      <td>${c.last_invite ? `emailed ${ago(c.last_invite)}` : c.invited_at ? `added ${ago(c.invited_at)}` : ''}</td>
      <td style="white-space:nowrap">${d.can_edit ? `<button class="btn" data-k="resend">Resend invite</button> <button class="btn" data-k="remove" style="color:var(--bad)">Remove</button>` : ''}</td></tr>`).join('');
  host.innerHTML = `<div class="card set-card"><h3>${act ? `Client logins for ${esc(one?.name || '')}` : 'Client logins'}</h3>
    <p class="hint set-why">A client signs in with Google, using the email you invite, at <b>tools.go-mobius-digital.com/profit</b>. They see everything about their own brand and change nothing except the Calendar (they can add a date and leave a note, and the team hears about it in Slack). Never drafts, settings, research, Studio, the Library, other brands or the team's Strategist.</p>
    <div class="tbl-wrap"><table class="cl-tbl"><thead><tr><th>Person</th><th>Brands</th><th>Last sign-in</th><th>Invite</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" class="tiny">No client logins${act ? ' for this brand' : ''} yet.</td></tr>`}</tbody></table></div>
    ${d.can_edit ? `<div class="row" style="margin:12px 0 0;gap:8px"><button class="btn primary" data-k="invite">Invite a client</button></div>` : '<p class="tiny" style="margin-top:10px">Only Cole invites or removes clients.</p>'}
    ${act ? everythingBlock(acc, one?.name, d.can_edit) : ''}
  </div>`;
  const reload = () => card(host, opts);
  const q = s => host.querySelector(s);
  if (q('[data-k="invite"]')) q('[data-k="invite"]').onclick = () => invite({ brands: act ? [act] : [], onDone: reload });
  host.querySelectorAll('[data-k="resend"]').forEach(b => b.onclick = () => { const e = b.closest('tr').dataset.e; const c = d.clients.find(x => x.email === e); invite({ emails: e, name: c.name, brands: c.brands.map(x => x.id), resend: true, onDone: reload }); });
  host.querySelectorAll('[data-k="remove"]').forEach(b => b.onclick = async () => {
    const e = b.closest('tr').dataset.e; const c = d.clients.find(x => x.email === e);
    const which = act && c.brands.length > 1 ? `${one?.name || 'this brand'} is taken off their login; they keep their other brands.` : 'They can no longer sign in to Locus. Nothing they added to the calendar is removed.';
    if (!(await confirmModal(`Remove ${e}?`, which, 'Remove'))) return;
    try { await apiAH('/api/clients/remove', { method: 'POST', body: JSON.stringify({ email: e, ...(act && c.brands.length > 1 ? { brand: act } : {}) }) }); reload(); }
    catch (err) { noteModal('Could not remove', `<p>${esc(err.message)}</p>`); }
  });
  if (act && d.can_edit) wireToggles(host, async (k, on) => {
    try { await apiAH('/api/clients/access', { method: 'PUT', body: JSON.stringify({ act, [k]: on }) }); acc[k] = on; offLine(host, acc); return true; }
    catch (err) { noteModal('Could not save', `<p>${esc(err.message)}</p>`); return false; }
  });
}

/* ---------------- the invite: form, then the email for approval ---------------- */
async function invite(o = {}) {
  css();
  const w = document.createElement('div'); w.className = 'modal-wrap';
  w.innerHTML = '<div class="modal cl-m" style="max-width:620px;width:100%"></div>';
  document.body.appendChild(w);
  const m = w.querySelector('.modal');
  const close = () => { w.remove(); document.removeEventListener('keydown', esc_); };
  const esc_ = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc_);
  const st = { emails: o.emails || '', name: o.name || '', brands: new Set(o.brands || (S.act && S.act !== 'all' ? [S.act] : [])), on: { ...DEFAULT_ON }, subject: '', body: '', touched: false };
  /* Everything is on; with one brand picked the switches start from what that brand has turned off. */
  if (st.brands.size === 1) { try { const a = (await apiAH(`/api/clients?act=${encodeURIComponent([...st.brands][0])}`, { fresh: true })).access || {}; st.on = accOf(a[[...st.brands][0]]); } catch {} }
  const brandList = S.accounts.slice().sort((a, b) => a.name.localeCompare(b.name));
  const form = () => {
    m.innerHTML = `<h3>${o.resend ? 'Resend the Locus invite' : 'Invite a client to Locus'}</h3>
      <p class="hint">They sign in with Google using this email and see only the brands you tick, read-only. Nothing is sent until you press Send on the next screen.</p>
      <label class="set-lbl" for="clEm">Their email</label>
      <input type="text" id="clEm" placeholder="name@theirbrand.com, another@theirbrand.com" value="${esc(st.emails)}"${o.resend ? ' readonly' : ''}>
      <p class="hint">Any email works, Gmail or not. Several people: separate them with commas.</p>
      <label class="set-lbl" for="clNm">First name, for the greeting</label>
      <input type="text" id="clNm" placeholder="Nick" value="${esc(st.name)}">
      <label class="set-lbl">Brands they see</label>
      <div class="cl-chips">${brandList.map(a => `<button type="button" class="cl-chip" data-b="${esc(a.act_id)}" aria-pressed="${st.brands.has(a.act_id)}"><svg class="cl-ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>${esc(a.name)}</button>`).join('')}</div>
      ${everythingBlock(st.on, '', true, 'Applies to the ticked brands and every client login on them; change it later in Brand settings > Client access.')}
      <p class="tiny" id="clErr" style="color:var(--bad);margin-top:10px"></p>
      <div class="row" style="justify-content:flex-end;gap:8px;margin:14px 0 0"><button class="btn" data-x>Cancel</button><button class="btn primary" data-next>Next: the email</button></div>`;
    m.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { const id = b.dataset.b; st.brands.has(id) ? st.brands.delete(id) : st.brands.add(id); b.setAttribute('aria-pressed', st.brands.has(id)); });
    wireToggles(m, (k, on) => { st.on[k] = on; offLine(m, st.on); });
    m.querySelector('[data-x]').onclick = close;
    m.querySelector('[data-next]').onclick = async () => {
      st.emails = m.querySelector('#clEm').value.trim(); st.name = m.querySelector('#clNm').value.trim();
      const err = m.querySelector('#clErr');
      const list = st.emails.split(/[\s,;]+/).filter(Boolean);
      if (!list.length) return err.textContent = 'Add their email.';
      const bad = list.find(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)); if (bad) return err.textContent = `${bad} does not look like an email address.`;
      if (list.some(e => /@go-mobius-digital\.com$/i.test(e))) return err.textContent = 'Mobius people go in Team and access, not here.';
      if (!st.brands.size) return err.textContent = 'Tick at least one brand.';
      if (!st.touched) {
        try { const dr = await apiAH(`/api/clients/draft?brands=${encodeURIComponent([...st.brands].join(','))}&name=${encodeURIComponent(st.name)}&email=${encodeURIComponent(list.length === 1 ? list[0] : '')}`, { fresh: true }); st.subject = dr.subject; st.body = dr.body; }
        catch (e) { return err.textContent = e.message; }
      }
      mail();
    };
  };
  const mail = () => {
    const list = st.emails.split(/[\s,;]+/).filter(Boolean);
    m.innerHTML = `<h3>The invite email</h3>
      <p class="hint">Goes to <b>${esc(list.join(', '))}</b> from your Gmail with your signature, exactly as written here. Edit anything.</p>
      <label class="set-lbl" for="clSub">Subject</label><input type="text" id="clSub" value="${esc(st.subject)}">
      <label class="set-lbl" for="clMsg">Message</label><textarea id="clMsg" rows="14">${esc(st.body)}</textarea>
      <p class="tiny" id="clErr" style="margin-top:10px"></p>
      <div class="row" style="justify-content:space-between;gap:8px;margin:12px 0 0;flex-wrap:wrap">
        <button class="btn" data-back>Back</button>
        <span class="row" style="gap:8px;margin:0;flex-wrap:wrap"><button class="btn" data-copy title="Copy the text and send it yourself">Copy</button>
        <button class="btn" data-only title="They can sign in now; you tell them yourself">Give access, no email</button>
        <button class="btn primary" data-send>Send invite</button></span></div>`;
    const read = () => { st.subject = m.querySelector('#clSub').value; st.body = m.querySelector('#clMsg').value; st.touched = true; };
    m.querySelector('#clSub').oninput = read; m.querySelector('#clMsg').oninput = read;
    m.querySelector('[data-back]').onclick = () => { read(); form(); };
    m.querySelector('[data-copy]').onclick = async () => { read(); try { await navigator.clipboard.writeText(`${st.subject}\n\n${st.body}`); m.querySelector('#clErr').textContent = 'Copied.'; } catch { m.querySelector('#clErr').textContent = 'Copy did not work in this browser; select the text instead.'; } };
    const go = async send => {
      read();
      const btns = m.querySelectorAll('button'); btns.forEach(b => b.disabled = true);
      const msg = m.querySelector('#clErr'); msg.style.color = ''; msg.textContent = send ? 'Sending…' : 'Saving…';
      try {
        const r = await apiAH('/api/clients/invite', { method: 'POST', body: JSON.stringify({ emails: list, name: st.name, brands: [...st.brands], access: { ...st.on }, send, approved: send, subject: st.subject, body: st.body }) });
        if (r.failed && r.failed.length) { msg.style.color = 'var(--bad)'; msg.textContent = r.failed.map(f => `${f.email}: ${f.error}`).join(' '); btns.forEach(b => b.disabled = false); if (o.onDone) o.onDone(); return; }
        close();
        noteModal(send ? 'Invite sent' : 'Access given', `<p>${esc((send ? r.sent : r.added).join(', '))} ${send ? 'got the email and' : ''} can sign in now with Google at tools.go-mobius-digital.com/profit.</p>`);
        if (o.onDone) o.onDone();
      } catch (e) { msg.style.color = 'var(--bad)'; msg.textContent = e.message; btns.forEach(b => b.disabled = false); }
    };
    m.querySelector('[data-only]').onclick = () => go(false);
    m.querySelector('[data-send]').onclick = async () => { if (await confirmModal('Send the invite?', `It goes to ${list.join(', ')} from your Gmail, exactly as written.`, 'Send it')) go(true); };
  };
  form();
}

/* ---------------- what a signed-in client sees ---------------- */
const brandOf = (act = S.act) => (S.client && S.client.brands || []).find(b => b.id === act) || null;

/** "N waiting for you" on a client's Home (2026-10-10, requests.js): approvals the team sent that are still open. */
async function waitingLine(main) {
  if (!main || !window.RequestsTab || !S.act || S.act === 'all') return;
  const act = S.act, n = await window.RequestsTab.waiting(act, apiAH);
  if (!n || S.tab !== 'overview' || S.act !== act || main.querySelector('.cl-wait')) return;
  const el = document.createElement('div'); el.className = 'cl-wel cl-wait';
  el.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;box-shadow:inset 0 0 0 1px var(--brand)';
  el.innerHTML = `<div style="flex:1;min-width:200px"><b>${n} waiting for you</b><div class="hint" style="margin:2px 0 0">${n === 1 ? 'Something the team needs you to approve.' : 'Things the team needs you to approve.'} It takes a tap: Approve, or Ask for changes.</div></div>
    <button class="btn primary" type="button">Open Requests</button>`;
  el.querySelector('button').onclick = () => show('requests');
  const head = main.querySelector('.ph'); if (head && head.parentElement) head.parentElement.insertBefore(el, head.nextSibling); else main.prepend(el);
}

/** The first-sign-in card on Home, until they press Got it. */
function welcome(main) {
  css();
  if (S.client && main) waitingLine(main).catch(() => {});
  if (!S.client || S.client.welcomed || !main) return;
  const b = brandOf(); const name = (S.client.name || '').split(/\s+/)[0];
  const el = document.createElement('div'); el.className = 'cl-wel';
  const A = accOf(b && b.access), pl = A.pl;
  el.innerHTML = `<h3>Welcome to Locus${name ? `, ${esc(name)}` : ''}</h3>
    <p class="hint" style="margin:0">This is ${esc(b ? b.name : 'your brand')}'s dashboard: the same numbers Mobius works from every day, updated every morning.</p>
    <ul><li><b>Home</b>: sales, orders, ad spend and what the ads brought back${pl ? ', and the P&L' : ''}.</li>
      <li><b>Ads</b>: every channel side by side, then Meta and Google campaign by campaign. Click an ad to see it.${A.changes ? ' Changes shows every budget, launch and pause we made.' : ''}</li>
      <li><b>Email and SMS</b>: what your emails and texts sold.</li>
      <li><b>Store</b>: sales, customers, your website and search.</li>
      <li><b>Calendar</b>: your launches and sales. Add a date or leave a note and the team hears about it right away.</li>
      <li><b>Requests</b> (under Home): approve the ads, offers and dates we send you, and ask us for anything.</li>
      <li><b>Reports</b>: every weekly and monthly report we sent you.</li>
      ${A.creators ? '<li><b>Creative</b>: your creator link, the page your creators film from.</li>' : ''}
      ${A.strategist ? '<li><b>Ask</b>: type a question about your numbers in the bar at the top and the Strategist answers from your own data.</li>' : ''}</ul>
    <p class="hint" style="margin:0 0 12px">Change the dates and what they compare to in the top bar. Everything is read-only except the calendar and Requests, so there is nothing you can break.</p>
    <button class="btn primary" type="button">Got it</button>`;
  const head = main.querySelector('.ph'); if (head && head.parentElement) head.parentElement.insertBefore(el, head.nextSibling); else main.prepend(el);
  el.querySelector('button').onclick = async () => { el.remove(); S.client.welcomed = true; try { await apiAH('/api/clients/me', { method: 'PUT', body: JSON.stringify({ welcomed: true }) }); } catch {} };
}

/** A client's Settings: their own profile only. */
function profile() {
  css();
  const me = S.client || { brands: [] };
  const sw = b => SW.filter(([k]) => accOf(b.access)[k] === false).map(x => x[1]);
  $('#main').innerHTML = `<div class="v2 lx">${pageHead('cl_profile', 'Your profile')}<div class="card cl-prof">
    <h3>You</h3>
    <div class="kv"><span>Signed in as</span><b>${esc(S.meEmail || '')}</b>
      <span>Brands</span><b>${me.brands.map(b => esc(b.name)).join(', ') || 'none'}</b></div>
    <label class="set-lbl" for="clMyName" style="display:block;margin:16px 0 4px;font-weight:600">Your name</label>
    <div class="row" style="gap:8px;margin:0"><input type="text" id="clMyName" value="${esc(me.name || '')}" placeholder="How the team sees you on the calendar" style="max-width:320px"><button class="btn" id="clMySave">Save</button><span class="tiny" id="clMyMsg"></span></div>
    <p class="hint" style="margin-top:14px">Your login is read-only: you can add dates and notes on the calendar, nothing else changes anything. You see everything about your own business${me.brands.some(b => sw(b).length) ? `, except: ${me.brands.filter(b => sw(b).length).map(b => `${esc(sw(b).join(', '))} on ${esc(b.name)}`).join('; ')}` : ''}.</p>
    <p class="hint">Need a teammate added, or something you cannot find? Ask us in Slack.</p>
    <div class="row" style="margin:16px 0 0"><button class="btn" id="clOut">Sign out</button></div></div></div>`;
  $('#clMySave').onclick = async () => { const v = $('#clMyName').value.trim(); try { const r = await apiAH('/api/clients/me', { method: 'PUT', body: JSON.stringify({ name: v }) }); S.client.name = r.name; $('#clMyMsg').textContent = 'Saved.'; } catch (e) { $('#clMyMsg').textContent = e.message; } };
  $('#clOut').onclick = () => $('#btnOut').click();
}

/** Reports for a client: what was sent to them, nothing else (the server returns sent rows only). */
const RPC = { act: null, period: null, start: null };
async function reports(first) {
  const run = ++RUN;
  const a = S.accounts.find(x => x.act_id === S.act);
  const shell = body => `<div class="v2 lx">${pageHead('cl_reports', `Reports: ${esc(a ? a.name : '')}`)}${body}</div>`;
  if (first) $('#main').innerHTML = shell('<div class="card"><span class="hint">Loading…</span></div>');
  if (RPC.act !== S.act) { RPC.act = S.act; RPC.period = RPC.start = null; }
  let list, rep = null;
  try {
    list = (await api('/api/reports?act=' + encodeURIComponent(S.act))).rows || [];
    if (!RPC.start && list.length) { RPC.period = list[0].period; RPC.start = list[0].period_start; }
    if (RPC.start) rep = await api(`/api/report?act=${encodeURIComponent(S.act)}&period=${RPC.period}&start=${RPC.start}`);
  } catch (e) { if (run === RUN) $('#main').innerHTML = shell(`<div class="card"><p style="color:var(--bad)">${esc(e.message)}</p></div>`); return; }
  if (run !== RUN) return;
  if (!rep) { $('#main').innerHTML = shell('<div class="card"><h3>No reports yet</h3><p class="hint">Your weekly and monthly reports show here once Mobius sends them.</p></div>'); return; }
  const isCur = x => x.period === RPC.period && x.period_start === RPC.start;
  const picker = list.length > 1 ? `<div class="lx-bar"><span class="lx-msg">${list.length} reports</span><details class="rp-menu"><summary>${rep.period === 'weekly' ? 'Weekly' : 'Monthly'} · ${esc(repRangeLabel({ period: rep.period, start: rep.period_start, end: rep.period_end }))}</summary><div class="rp-pop">
      ${list.map(x => `<button type="button" data-rc="${x.period}|${x.period_start}" class="${isCur(x) ? 'on' : ''}"><span>${x.period === 'weekly' ? 'Weekly' : 'Monthly'} · ${esc(repRangeLabel({ period: x.period, start: x.period_start, end: x.period_end }))}</span></button>`).join('')}
    </div></details></div>` : '';
  const cur = a ? a.currency : 'USD';
  $('#main').innerHTML = shell(`<div class="rp-arch"><h2>${rep.period === 'weekly' ? 'Weekly report' : 'Monthly report'}: ${repRangeLabel({ period: rep.period, start: rep.period_start, end: rep.period_end })}</h2>
    <p class="sub">Prepared by Mobius Digital${rep.sent_at ? ` · sent ${String(rep.sent_at).slice(0, 10)}` : ''}.</p></div>${picker}
    ${reportBodyHTML({ ...(rep.data || {}), account: { currency: cur } }, rep.summary, { attr: attrOf(rep.data && rep.data.attr ? { attr: rep.data.attr } : null), client: true })}`);
  try { wireReportChart(rep.data || {}, cur, false); wireReportJump(); wireAdCards(rep.data && rep.data.ads, cur, rep.period === 'weekly' ? 'week' : 'month'); } catch (e) { console.warn('[Locus] report wiring', e); }
  document.querySelectorAll('#main [data-rc]').forEach(b => b.onclick = () => { const [p, s] = b.dataset.rc.split('|'); RPC.period = p; RPC.start = s; reports(false); });
}

/** Creative > Creators for a client: their public creator link, when Cole switched it on. */
async function creators() {
  const b = brandOf();
  let link = b && b.creator_link;
  if (!link) { try { const me = await apiAH('/api/clients/me', { fresh: true }); const x = (me.brands || []).find(y => y.id === S.act); link = x && x.creator_link; } catch {} }
  $('#main').innerHTML = `<div class="v2 lx">${pageHead('cl_creators', 'Creator link')}<div class="card"><h3>Your creator link</h3>
    ${link ? `<p class="hint">The page your creators film from: the ideas, the examples and how to film them. It updates as we add ideas.</p><p><a class="btn primary" href="${esc(link)}" target="_blank" rel="noopener">Open the creator link</a></p><p class="tiny">${esc(link)}</p>`
      : '<p class="hint">Your creator link is not live yet. Ask us in Slack.</p>'}</div></div>`;
}

css();
window.ClientsTab = { card, invite, welcome, profile, reports, creators, SWITCHES: SW };
})();
