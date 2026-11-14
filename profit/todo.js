/* YOU NEED TO DO (2026-11-13): every onboarding step that is on Mobius, per brand, with the button to do it. Read live
 * from account-health GET /api/ask/todo (todo.js there), so a step leaves the list the moment Locus sees it done.
 * Team only: never mounted for a client login. Mounted on a brand's Morning page (#v4todo, one brand) and on the
 * agency Morning board (#v4todo, every brand). Draws nothing when there is nothing to do.
 *   window.MobiusTodo.mount(el, act|'all')
 */
(function () {
'use strict';
const AH = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (() => { try { return localStorage.getItem('pf_ah'); } catch { return null; } })()) || 'https://mobius-account-health.mobius-digital.workers.dev';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tok = () => { try { return (typeof S !== 'undefined' && S.tok) || localStorage.getItem('mobius_session') || ''; } catch { return ''; } };
const isClient = () => { try { return (typeof S !== 'undefined' && S.role === 'client') || localStorage.getItem('mobius_session_role') === 'client'; } catch { return false; } };
async function ah(path, body) {
  const res = await fetch(AH + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + tok(), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'HTTP ' + res.status);
  return j;
}
function css() {
  if (document.getElementById('todoCss')) return;
  const s = document.createElement('style'); s.id = 'todoCss';
  s.textContent = `.td-card{margin:0 0 14px}.td-card h3{margin:0;font-size:15px}
  .td-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;align-items:start;padding:10px 0;border-top:1px solid var(--line)}
  .td-row:first-of-type{border-top:0}.td-row b{font-size:13.5px;font-weight:600}.td-row .td-why{display:block;font-size:12.5px;color:var(--muted);margin-top:2px;overflow-wrap:anywhere}
  .td-brand{font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);font-weight:600;margin:12px 0 2px}
  .td-acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.td-key{display:flex;gap:6px;grid-column:1/-1}.td-key input{flex:1 1 200px;min-width:0}
  .td-msg{grid-column:1/-1;font-size:12.5px;color:var(--muted)}
  @media (max-width:640px){.td-row{grid-template-columns:minmax(0,1fr)}.td-acts{justify-content:flex-start}}`;
  document.head.appendChild(s);
}
const btn = (label, attrs, pri) => `<button type="button" class="v2btn${pri ? '' : ' ghost'}" ${attrs}>${esc(label)}</button>`;
const link = (label, url) => `<a class="v2btn ghost" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
function rowHtml(b, it, i) {
  const id = `${b.id}|${i}`;
  let acts = '';
  if (it.kind === 'setup') acts = btn('Open setup', `data-tdsetup="${esc(it.run)}"`, true);
  else if (it.kind === 'slack') acts = link('Open the channel', it.url);
  else if (it.kind === 'shopify') acts = link('Open Shopify Partners', it.url) + btn('I sent it', `data-tdshop="${esc(it.run)}" data-tdid="${esc(id)}"`, true);
  else if (it.kind === 'link') acts = link('Open', it.url);
  else if (it.kind === 'key') acts = link('Open', it.url);
  if (it.skippable) acts += btn('Not needed', `data-tdskip="${esc(it.run)}|${esc(it.key)}" data-tdid="${esc(id)}"`);
  const key = it.kind === 'key' ? `<div class="td-key"><input type="password" autocomplete="off" placeholder="Paste it here" data-tdkey="${esc(id)}"><button type="button" class="v2btn" data-tdsave="${esc(b.id)}|${esc(it.field)}" data-tdid="${esc(id)}">Save</button></div>` : '';
  return `<div class="td-row" data-tdrow="${esc(id)}"><div><b>${esc(it.text)}</b><span class="td-why">${esc(it.why || '')}</span></div><div class="td-acts">${acts}</div>${key}<div class="td-msg" data-tdmsg="${esc(id)}"></div></div>`;
}
async function mount(el, act) {
  if (!el || isClient()) return;
  css();
  let d; try { d = await ah(`/api/ask/todo?act=${encodeURIComponent(act || 'all')}`); } catch { el.innerHTML = ''; return; }
  const brands = (d.brands || []).filter(b => b.items && b.items.length);
  const n = brands.reduce((s, b) => s + b.items.length, 0);
  if (!n) { el.innerHTML = ''; return; }
  const many = brands.length > 1 || (act === 'all');
  el.innerHTML = `<section class="v2card td-card"><div class="v2h"><h3>You need to do</h3><span class="cap">${n} onboarding step${n === 1 ? '' : 's'} on Mobius</span></div>
    ${brands.map(b => `${many ? `<div class="td-brand">${esc(b.name)}</div>` : ''}${b.items.map((it, i) => rowHtml(b, it, i)).join('')}`).join('')}</section>`;
  const msg = (id, t) => { const m = el.querySelector(`[data-tdmsg="${id}"]`); if (m) m.textContent = t; };
  const done = (id, t) => { const r = el.querySelector(`[data-tdrow="${id}"]`); if (r) r.style.opacity = '.45'; msg(id, t); };
  el.onclick = async e => {
    const s = e.target.closest('[data-tdsetup]');
    if (s) { if (window.NewClient && window.NewClient.status) window.NewClient.status(s.dataset.tdsetup, false); return; }
    const sh = e.target.closest('[data-tdshop]');
    if (sh) { sh.disabled = true; try { const o = await ah('/api/ask/todo/shopify-sent', { run: sh.dataset.tdshop }); done(sh.dataset.tdid, o.how ? `Done. ${o.name} was asked to approve it ${o.how}.` : 'Marked as sent. Locus could not reach them: tell them to approve it in Shopify > Settings > Users.'); } catch (er) { msg(sh.dataset.tdid, er.message); sh.disabled = false; } return; }
    const sk = e.target.closest('[data-tdskip]');
    if (sk) { const [run, key] = sk.dataset.tdskip.split('|'); sk.disabled = true; try { await ah('/api/ask/todo/skip', { run, key }); done(sk.dataset.tdid, 'Taken off the list.'); } catch (er) { msg(sk.dataset.tdid, er.message); sk.disabled = false; } return; }
    const sv = e.target.closest('[data-tdsave]');
    if (sv) { const [a, field] = sv.dataset.tdsave.split('|'); const inp = el.querySelector(`[data-tdkey="${sv.dataset.tdid}"]`); const v = (inp && inp.value || '').trim(); if (!v) return msg(sv.dataset.tdid, 'Paste it first.');
      sv.disabled = true; sv.textContent = 'Checking…';
      try { const res = await fetch(AH + '/api/brand-links', { method: 'PUT', headers: { Authorization: 'Bearer ' + tok(), 'Content-Type': 'application/json' }, body: JSON.stringify({ act: a, [field]: v }) }); const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'That did not work.'); inp.value = ''; done(sv.dataset.tdid, 'Connected.'); }
      catch (er) { msg(sv.dataset.tdid, er.message); }
      sv.disabled = false; sv.textContent = 'Save'; }
  };
}
window.MobiusTodo = { mount };
})();
