/* SITE REVIEWS card (2026-11-05), on Clients > Requests (the team) and Reports > Requests (a client login).
 * Lists the brand's review documents from reviews/index.json (one line per review, added with its folder) with the
 * answers from account-health src/sitereview.js: each page's call and note, who sent it and when.
 * Team: Copy link (mints the no-login link once, then always the same), Open, Reopen after it is sent.
 * Client: Open (their Locus sign-in opens it, no token needed).
 * Shows nothing when the brand has no review. Exports window.SiteReviews = { mount(host, act, client) }. */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = iso => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  let INDEX = null;
  const index = async () => {
    if (INDEX) return INDEX;
    try { const r = await fetch('reviews/index.json', { cache: 'no-cache' }); INDEX = r.ok ? await r.json() : []; } catch { INDEX = []; }
    return INDEX;
  };
  function css() {
    if (document.getElementById('srcss')) return;
    const st = document.createElement('style'); st.id = 'srcss';
    st.textContent = `.sr-row{border-top:1px solid var(--line);padding:12px 0}
      .sr-top{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}.sr-top .t{flex:1;min-width:200px}.sr-top b{font-size:15px}
      .sr-meta{font-size:12.5px;color:var(--muted);margin-top:2px}.sr-acts{display:flex;gap:6px;flex-wrap:wrap}
      .sr-list{margin:10px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;font-size:13.5px}
      .sr-list li{display:grid;grid-template-columns:120px 1fr;gap:10px}.sr-list .n{color:var(--ink-2);white-space:pre-wrap;overflow-wrap:anywhere}
      .sr-st{font-size:12px;font-weight:600}.sr-st.ok{color:var(--good)}.sr-st.no{color:var(--bad)}.sr-st.op{color:var(--muted)}
      .sr-msg{font-size:12.5px;color:var(--good)}
      @media (max-width:640px){.sr-list li{grid-template-columns:1fr;gap:2px}.sr-acts .btn{flex:1}}`;
    document.head.appendChild(st);
  }
  async function mount(H, act, client) {
    const host = document.querySelector('#main .v2.rq'); if (!host) return;
    const all = act === 'all';
    const list = (await index()).filter(r => all ? !client : r.act === act);
    if (!list.length) return;
    css();
    const live = new Map();
    if (!client) {
      for (const a of [...new Set(list.map(r => r.act))]) {
        try { for (const v of (await H.apiAH(`/api/site-review/list?act=${encodeURIComponent(a)}`, { fresh: true })).reviews || []) live.set(`${a}|${v.slug}`, v); } catch {}
      }
    } else {
      for (const r of list) { try { live.set(`${r.act}|${r.slug}`, await H.apiAH(`/api/site-review?act=${encodeURIComponent(r.act)}&slug=${encodeURIComponent(r.slug)}`, { fresh: true })); } catch {} }
    }
    const brandName = a => ((H.S.accounts || []).find(x => x.act_id === a) || {}).name || a.replace(/^brand_/, '').replace(/_/g, ' ');
    const row = r => {
      const v = live.get(`${r.act}|${r.slug}`) || { answers: [] };
      const by = new Map((v.answers || []).map(x => [x.section, x]));
      const secs = r.sections || [];
      const ok = secs.filter(s => (by.get(s.id) || {}).status === 'approved').length, ch = secs.filter(s => (by.get(s.id) || {}).status === 'changes').length;
      const counts = `${ok} approved, ${ch} need${ch === 1 ? 's' : ''} changes, ${secs.length - ok - ch} open`;
      const meta = v.sent_at ? `Sent ${esc(when(v.sent_at))}${v.sent_by ? ` by ${esc(v.sent_by)}` : ''}. ${counts}.`
        : (v.answers || []).length ? `In progress: ${ok + ch} of ${secs.length} reviewed. Not sent yet.` : (v.link ? 'Link made. Not opened yet.' : 'No link sent yet.');
      const items = secs.map(s => { const a = by.get(s.id) || {}; const st = a.status === 'approved' ? ['Approved', 'ok'] : a.status === 'changes' ? ['Needs changes', 'no'] : ['Not reviewed', 'op'];
        return `<li><span class="sr-st ${st[1]}">${st[0]}</span><span><b>${esc(s.title)}</b>${a.note ? `<span class="n"> ${esc(a.note)}</span>` : ''}</span></li>`; }).join('');
      const overall = v.overall ? `<li><span class="sr-st op">Overall</span><span class="n">${esc(v.overall)}</span></li>` : '';
      const k = `data-act="${esc(r.act)}" data-slug="${esc(r.slug)}"`;
      const acts = client ? `<a class="btn primary" href="${esc(r.path)}" target="_blank" rel="noopener">Open</a>`
        : `<button type="button" class="btn primary" data-srcopy ${k}>Copy link</button><button type="button" class="btn" data-sropen ${k}>Open</button>${v.sent_at ? `<button type="button" class="btn" data-srreopen ${k}>Reopen</button>` : ''}`;
      return `<div class="sr-row"><div class="sr-top"><div class="t"><b>${esc(r.title)}</b>${all ? ` <span class="sr-meta">${esc(brandName(r.act))}</span>` : ''}<div class="sr-meta">${meta}</div><span class="sr-msg" data-srmsg="${esc(r.act + '|' + r.slug)}"></span></div><div class="sr-acts">${acts}</div></div>
        <details${v.sent_at ? ' open' : ''}><summary class="sr-meta" style="cursor:pointer;margin-top:8px">Each page (${secs.length})</summary><ul class="sr-list">${items}${overall}</ul></details></div>`;
    };
    const card = document.createElement('section'); card.className = 'v2card rq-sec'; card.id = 'srCard';
    card.innerHTML = `<div class="v2h"><h3>Site reviews</h3><span class="cap">${client ? 'Approve each page or leave notes' : 'The client approves each page; you get a Slack DM when they send it'}</span></div>${list.map(row).join('')}`;
    const old = host.querySelector('#srCard'); if (old) old.remove();
    const first = host.querySelector('.rq-sec'); first ? host.insertBefore(card, first) : host.appendChild(card);
    const find = b => list.find(r => r.act === b.dataset.act && r.slug === b.dataset.slug);
    const msg = (r, t, bad) => { const el = card.querySelector(`[data-srmsg="${CSS.escape(r.act + '|' + r.slug)}"]`); if (el) { el.textContent = t; el.style.color = bad ? 'var(--bad)' : ''; } };
    const linkOf = async r => (await H.apiAH('/api/site-review/link', { method: 'POST', body: JSON.stringify({ act: r.act, slug: r.slug, title: r.title, path: r.path, sections: r.sections }) })).url;
    card.querySelectorAll('[data-srcopy]').forEach(b => b.onclick = async () => {
      const r = find(b); b.disabled = true;
      try { const url = await linkOf(r); try { await navigator.clipboard.writeText(url); msg(r, 'Link copied. It opens with no login.'); } catch { msg(r, url); } }
      catch (e) { msg(r, e.message, true); }
      b.disabled = false;
    });
    card.querySelectorAll('[data-sropen]').forEach(b => b.onclick = async () => {
      const r = find(b); const w = window.open('', '_blank');
      try { const url = await linkOf(r); if (w) w.location = url; else location.href = url; } catch (e) { if (w) w.close(); msg(r, e.message, true); }
    });
    card.querySelectorAll('[data-srreopen]').forEach(b => b.onclick = async () => {
      const r = find(b); b.disabled = true;
      try { await H.apiAH('/api/site-review/reopen', { method: 'POST', body: JSON.stringify({ act: r.act, slug: r.slug }) }); mount(H, act, client); }
      catch (e) { msg(r, e.message, true); b.disabled = false; }
    });
  }
  window.SiteReviews = { mount };
})();
