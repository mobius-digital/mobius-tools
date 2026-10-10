/* CLIENT LOGINS (2026-10-09), THE BRAND EDITION since 2026-10-10. Cole: "Locus is literally everything now. A client
 * should have access to absolutely everything." A client login opens the SAME screens the team sees, for its own
 * brand; only the agency edition's extras are left out (docs/locus-hub/editions.md). This file is what is particular
 * to the client role: the Client logins card (Agency settings > Clients, Brand settings > Client access), the invite
 * (form, then the email text shown for approval, then Send from Cole's Gmail), the welcome card on Home, and the
 * "Your profile" part of a client's Brand settings. Engine: account-health src/clients.js; who may open what:
 * brandguard.js (both workers). Classic script with its own closure; it uses the host's globals at call time
 * (esc, S, apiAH, api, show, confirmModal, noteModal, pageHead...).
 */
(function () {
'use strict';
/* What the agency edition adds, in the words the card and the profile use. */
const AGENCY_ONLY = 'All clients and the command center, the Clients screen and New client, Team and access, Agency settings, Agency economics, Team workload, the assistant’s settings, the brief and report review before anything is sent, Slack channel setup and the team’s internal notes';
const everythingBlock = brandName => `<div class="cl-all"><p class="cl-all-h"><b>Clients see and use everything about ${esc(brandName || 'their own brand')}.</b> Every page the team has for one brand, with the same numbers and the same buttons: P&amp;L and costs, ads and their changes, email, the store, stock, Studio, the creator link, the calendar, goals, the War Room, dashboards, sent briefs and reports, and Locus to answer questions. Live ad changes show what will happen and wait for a confirm, exactly as for the team.</p>
  <p class="hint" style="margin:8px 0 0">What only the agency sees: ${esc(AGENCY_ONLY)}. Studio and the assistant run on Mobius’s AI accounts, so each client login has a daily limit ($3 of Studio, $2 of questions).</p></div>`;
const ago = iso => { if (!iso) return 'never'; const d = (Date.now() - Date.parse(iso)) / 864e5; return d < 1 / 24 ? 'just now' : d < 1 ? `${Math.round(d * 24)}h ago` : d < 30 ? `${Math.round(d)}d ago` : String(iso).slice(0, 10); };
function css() {
  if (document.getElementById('clCss')) return;
  const s = document.createElement('style'); s.id = 'clCss';
  s.textContent = `
  .cl-tbl td{vertical-align:top}
  .cl-tbl .tiny{display:block;color:var(--muted)}
  .cl-chips{display:flex;flex-wrap:wrap;gap:6px}
  .cl-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line-strong);background:transparent;color:inherit;border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;cursor:pointer}
  .cl-chip .cl-ck{display:none;width:13px;height:13px;flex:none}
  .cl-chip[aria-pressed="true"] .cl-ck{display:block}
  .cl-chip[aria-pressed="true"]{background:var(--brand-soft);color:var(--brand-ink,var(--ink));border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand);font-weight:600}
  .cl-all{margin:18px 0 0;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2)}
  .cl-all-h{margin:0;font-size:13.5px;line-height:1.55;color:var(--ink-2)}
  .cl-all-h b{color:var(--ink)}
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
  /* A client login (the brand edition): only the agency edition's controls are not drawn: the brief and report review
     and send, the reports' sending setup, the command center, team-only data repairs. The server refuses them anyway. */
  body.is-client #bfPost, body.is-client #bfEditBtn, body.is-client #bfSave, body.is-client #bfCancel, body.is-client #bfWrite, body.is-client #bfSkip, body.is-client .bf-note,
  body.is-client #rpSend, body.is-client #rpRegen, body.is-client #rpEditTop, body.is-client #rpEditSum, body.is-client #rpGenW, body.is-client #rpGenM, body.is-client .rp-cfg,
  body.is-client [data-go="command"], body.is-client [data-go="economics"], body.is-client [data-go="workload"], body.is-client [data-agency]{display:none !important}`;
  document.head.appendChild(s);
}

/* ---------------- the card (team) ---------------- */
async function card(host, opts = {}) {
  css();
  if (!host) return;
  const act = opts.act && opts.act !== 'all' ? opts.act : null;
  const one = act ? S.accounts.find(a => a.act_id === act) : null;
  /* A client's own Brand settings > Client access: read only (inviting and removing logins is the agency's). */
  if (S.role === 'client') {
    host.innerHTML = `<div class="card set-card"><h3>Client access for ${esc(one?.name || 'your brand')}</h3>
      <p class="hint set-why">You are signed in as <b>${esc(S.meEmail || '')}</b>. Mobius adds and removes logins for your team: ask us in Slack to add someone.</p>
      ${everythingBlock(one?.name)}</div>`;
    return;
  }
  host.innerHTML = '<div class="card set-card"><span class="hint">Loading client logins…</span></div>';
  let d;
  try { d = await apiAH('/api/clients' + (act ? `?act=${encodeURIComponent(act)}` : ''), { fresh: true }); }
  catch (e) { host.innerHTML = `<div class="card set-card"><h3>Client logins</h3><p style="color:var(--bad)">${esc(e.message)}</p></div>`; return; }
  const rows = d.clients.map(c => `<tr data-e="${esc(c.email)}"><td><b>${esc(c.name || c.email)}</b>${c.name ? `<span class="tiny">${esc(c.email)}</span>` : ''}</td>
      <td>${c.brands.map(b => esc(b.name)).join(', ')}</td>
      <td>${c.last_sign_in ? ago(c.last_sign_in) : '<span class="faint">not yet</span>'}${c.last_seen && c.last_seen !== c.last_sign_in ? `<span class="tiny">last open ${ago(c.last_seen)}</span>` : ''}</td>
      <td>${c.last_invite ? `emailed ${ago(c.last_invite)}` : c.invited_at ? `added ${ago(c.invited_at)}` : ''}</td>
      <td style="white-space:nowrap">${d.can_edit ? `<button class="btn" data-k="resend">Resend invite</button> <button class="btn" data-k="remove" style="color:var(--bad)">Remove</button>` : ''}</td></tr>`).join('');
  host.innerHTML = `<div class="card set-card"><h3>${act ? `Client logins for ${esc(one?.name || '')}` : 'Client logins'}</h3>
    <p class="hint set-why">A client signs in with Google, using the email you invite, at <b>tools.go-mobius-digital.com/profit</b>, and gets the brand edition of Locus: everything this brand has, the same screens the team uses. When they add a date, ask for something or change a live ad, the team hears about it in Slack and the Change Log says who.</p>
    <div class="tbl-wrap"><table class="cl-tbl"><thead><tr><th>Person</th><th>Brands</th><th>Last sign-in</th><th>Invite</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" class="tiny">No client logins${act ? ' for this brand' : ''} yet.</td></tr>`}</tbody></table></div>
    ${d.can_edit ? `<div class="row" style="margin:12px 0 0;gap:8px"><button class="btn primary" data-k="invite">Invite a client</button></div>` : '<p class="tiny" style="margin-top:10px">Only Cole invites or removes clients.</p>'}
    ${everythingBlock(one?.name)}
  </div>`;
  const reload = () => card(host, opts);
  const q = s => host.querySelector(s);
  if (q('[data-k="invite"]')) q('[data-k="invite"]').onclick = () => invite({ brands: act ? [act] : [], onDone: reload });
  host.querySelectorAll('[data-k="resend"]').forEach(b => b.onclick = () => { const e = b.closest('tr').dataset.e; const c = d.clients.find(x => x.email === e); invite({ emails: e, name: c.name, brands: c.brands.map(x => x.id), resend: true, onDone: reload }); });
  host.querySelectorAll('[data-k="remove"]').forEach(b => b.onclick = async () => {
    const e = b.closest('tr').dataset.e; const c = d.clients.find(x => x.email === e);
    const which = act && c.brands.length > 1 ? `${one?.name || 'this brand'} is taken off their login; they keep their other brands.` : 'They can no longer sign in to Locus. Nothing they added is removed.';
    if (!(await confirmModal(`Remove ${e}?`, which, 'Remove'))) return;
    try { await apiAH('/api/clients/remove', { method: 'POST', body: JSON.stringify({ email: e, ...(act && c.brands.length > 1 ? { brand: act } : {}) }) }); reload(); }
    catch (err) { noteModal('Could not remove', `<p>${esc(err.message)}</p>`); }
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
  const st = { emails: o.emails || '', name: o.name || '', brands: new Set(o.brands || (S.act && S.act !== 'all' ? [S.act] : [])), subject: '', body: '', touched: false };
  const brandList = S.accounts.slice().sort((a, b) => a.name.localeCompare(b.name));
  const form = () => {
    m.innerHTML = `<h3>${o.resend ? 'Resend the Locus invite' : 'Invite a client to Locus'}</h3>
      <p class="hint">They sign in with Google using this email and get everything Locus has for the brands you tick. Nothing is sent until you press Send on the next screen.</p>
      <label class="set-lbl" for="clEm">Their email</label>
      <input type="text" id="clEm" placeholder="name@theirbrand.com, another@theirbrand.com" value="${esc(st.emails)}"${o.resend ? ' readonly' : ''}>
      <p class="hint">Any email works, Gmail or not. Several people: separate them with commas.</p>
      <label class="set-lbl" for="clNm">First name, for the greeting</label>
      <input type="text" id="clNm" placeholder="Nick" value="${esc(st.name)}">
      <label class="set-lbl">Their brands</label>
      <div class="cl-chips">${brandList.map(a => `<button type="button" class="cl-chip" data-b="${esc(a.act_id)}" aria-pressed="${st.brands.has(a.act_id)}"><svg class="cl-ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>${esc(a.name)}</button>`).join('')}</div>
      ${everythingBlock('')}
      <p class="tiny" id="clErr" style="color:var(--bad);margin-top:10px"></p>
      <div class="row" style="justify-content:flex-end;gap:8px;margin:14px 0 0"><button class="btn" data-x>Cancel</button><button class="btn primary" data-next>Next: the email</button></div>`;
    m.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { const id = b.dataset.b; st.brands.has(id) ? st.brands.delete(id) : st.brands.add(id); b.setAttribute('aria-pressed', st.brands.has(id)); });
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
        const r = await apiAH('/api/clients/invite', { method: 'POST', body: JSON.stringify({ emails: list, name: st.name, brands: [...st.brands], send, approved: send, subject: st.subject, body: st.body }) });
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
  el.innerHTML = `<h3>Welcome to Locus${name ? `, ${esc(name)}` : ''}</h3>
    <p class="hint" style="margin:0">This is ${esc(b ? b.name : 'your brand')} in Locus: the same system, the same screens and the same numbers Mobius works from every day.</p>
    <ul><li><b>Home</b>: sales, orders, ad spend, the P&amp;L, the day check, your goals and Requests (approve what we send you, ask us for anything).</li>
      <li><b>Ads</b>: today's calls, every channel side by side, then Meta, Google and TikTok down to each ad, with every change we made.</li>
      <li><b>Email and SMS</b> and <b>Store</b>: what your emails sold, your customers, your website and search.</li>
      <li><b>Products</b>, <b>Creative</b> and <b>Brand</b>: stock and drops, the ad studio, your creator link, the photo library, and what we know about your customers.</li>
      <li><b>Calendar</b>, <b>Reports</b> and the season: your launches, every brief and report we sent, your dashboards and the Black Friday plan.</li>
      <li><b>Ask</b>: type a question about your numbers in the bar at the top and Locus answers from your own data.</li></ul>
    <p class="hint" style="margin:0 0 12px">Change the dates and what they compare to in the top bar. A change to a live ad always shows you what will happen first and waits for you to confirm.</p>
    <button class="btn primary" type="button">Got it</button>`;
  const head = main.querySelector('.ph'); if (head && head.parentElement) head.parentElement.insertBefore(el, head.nextSibling); else main.prepend(el);
  el.querySelector('button').onclick = async () => { el.remove(); S.client.welcomed = true; try { await apiAH('/api/clients/me', { method: 'PUT', body: JSON.stringify({ welcomed: true }) }); } catch {} };
}

/** "Your profile" inside a client's Brand settings: who they are signed in as, their name, sign out. */
function profile(host) {
  css();
  if (!host) return;
  const me = S.client || { brands: [] };
  host.innerHTML = `<div class="card set-card cl-prof"><h3>You</h3>
    <div class="kv"><span>Signed in as</span><b>${esc(S.meEmail || '')}</b>
      <span>Brands</span><b>${me.brands.map(b => esc(b.name)).join(', ') || 'none'}</b></div>
    <label class="set-lbl" for="clMyName" style="display:block;margin:16px 0 4px;font-weight:600">Your name</label>
    <div class="row" style="gap:8px;margin:0"><input type="text" id="clMyName" value="${esc(me.name || '')}" placeholder="How the team sees you on the calendar and in the Change Log" style="max-width:320px"><button class="btn" id="clMySave">Save</button><span class="tiny" id="clMyMsg"></span></div>
    <p class="hint" style="margin-top:14px">Your login has everything Locus has for your brand. Studio and the assistant run on Mobius’s AI accounts, so each day your login can use up to $3 of Studio and $2 of questions; both reset at midnight UTC.</p>
    <p class="hint">Need a teammate added? Ask us in Slack.</p>
    <div class="row" style="margin:16px 0 0"><button class="btn" id="clOut">Sign out</button></div></div>`;
  host.querySelector('#clMySave').onclick = async () => { const v = host.querySelector('#clMyName').value.trim(); try { const r = await apiAH('/api/clients/me', { method: 'PUT', body: JSON.stringify({ name: v }) }); S.client.name = r.name; host.querySelector('#clMyMsg').textContent = 'Saved.'; } catch (e) { host.querySelector('#clMyMsg').textContent = e.message; } };
  host.querySelector('#clOut').onclick = () => { const b = document.getElementById('btnOut'); if (b) b.click(); };
}

css();
window.ClientsTab = { card, invite, welcome, profile, AGENCY_ONLY };
})();
