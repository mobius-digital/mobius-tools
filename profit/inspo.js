/* SAVE TO LOCUS (2026-10-21, window.LocusSave). Inspiration saved for a brand from anywhere:
 *   - the Ask bar: paste or type a link (or paste a picture) and pick "Save to Locus";
 *   - the phone: Share > Locus (manifest share_target -> /profit/?title=&text=&url=);
 *   - the desktop: the bookmarklet on Make > Inspiration (opens ?save=<url>&title=).
 * One save window (link or picture, brand, note), then the item lands on Make > Inspiration for that brand,
 * every angle, above the Atria boards. Worker: profit /api/inspo (worker/src/inspo.js). Studio's /api/studio/upload
 * stores a pasted picture. Tokens only; the modal and toast are Locus's own (.modal-wrap, .lx-toast). */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const host = () => (window.S || S);
  async function call(path, opts = {}) {
    const st = host(), body = opts.body;
    const r = await fetch(st.url.replace(/\/+$/, '') + path, { method: opts.method || 'GET', body,
      headers: { Authorization: 'Bearer ' + st.tok, ...(body && typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }
  function toast(msg, bad, go) {
    const t = document.createElement('div'); t.className = 'lx-toast' + (bad ? ' bad' : ''); t.setAttribute('role', 'status');
    t.innerHTML = `<span>${esc(msg)}</span>${go ? '<button type="button" class="ds-btn ds-btn-sm" style="margin-left:6px">Open Inspiration</button>' : ''}`;
    if (go) t.querySelector('button').onclick = () => { t.remove(); go(); };
    document.body.appendChild(t); setTimeout(() => t.remove(), 5200);
  }
  const firstUrl = s => { const m = String(s || '').match(/https?:\/\/[^\s<>"']+/i); return m ? m[0].replace(/[).,;]+$/, '') : ''; };
  const isLink = s => /^https?:\/\/\S+$/i.test(String(s || '').trim());
  const CSS = `.isv-pv{display:flex;gap:12px;align-items:center;border:1px solid var(--line);border-radius:var(--r-lg,8px);padding:10px;margin:0 0 12px;background:var(--surface-2)}
    .isv-pv img{width:64px;height:80px;object-fit:cover;border-radius:6px;flex:none;background:var(--surface)} .isv-pv b{display:block;font-size:13px;overflow-wrap:anywhere} .isv-pv small{color:var(--muted);font-size:12px;overflow-wrap:anywhere}
    .isv-f{display:grid;gap:4px;margin:0 0 12px;font-size:12.5px;color:var(--muted)} .isv-f select,.isv-f textarea{font:inherit;font-size:13px;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:7px 9px}
    .isv-f textarea{min-height:64px;resize:vertical} .isv-err{color:var(--bad);font-size:12.5px;min-height:1em}
    .isv-sec .isv-add{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px} .isv-sec .isv-add input{flex:1;min-width:220px;font:inherit;font-size:13px;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:7px 10px}
    .isv-sec .isv-how{display:flex;gap:6px 18px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin:12px 0 0} .isv-sec .isv-how a.isv-bm{color:var(--brand);font-weight:600;text-decoration:none;border:1px dashed var(--line-strong);border-radius:6px;padding:1px 8px;cursor:grab}
    .isv-sec .g .th.none{display:grid;place-items:center;font-size:28px;font-weight:600;color:var(--muted)} .isv-sec .g .note{font-size:12px;color:var(--ink-2);margin:4px 0 0;white-space:pre-line}`;
  const css = () => { if (!document.getElementById('isvcss')) document.head.insertAdjacentHTML('beforeend', `<style id="isvcss">${CSS}</style>`); };

  /** The save window. it = { url?, image?, file?, title?, note? }. Resolves with the saved item or null. */
  function save(it = {}) {
    css();
    const st = host(), brands = (st.accounts || []).filter(a => a.act_id && a.act_id !== 'all');
    if (!brands.length) { toast('Sign in to Locus first, then save it again.', true); return Promise.resolve(null); }
    const pick = st.act && st.act !== 'all' && brands.some(a => a.act_id === st.act) ? st.act : (localStorage.getItem('pf_lastclient') || brands[0].act_id);
    const url = it.url ? firstUrl(it.url) || '' : '';
    let preview = it.file ? URL.createObjectURL(it.file) : it.image || '';
    return new Promise(resolve => {
      const w = document.createElement('div'); w.className = 'modal-wrap';
      w.innerHTML = `<div class="modal"><h3>Save to Locus</h3><p class="hint">It lands on Make &gt; Inspiration for the brand you pick.</p>
        <div class="isv-pv">${preview ? `<img src="${esc(preview)}" alt="">` : ''}<div><b>${esc(it.title || (url ? new URL(url).hostname.replace(/^www\./, '') : 'A picture'))}</b><small>${esc(url || (it.file ? it.file.name : ''))}</small></div></div>
        <label class="isv-f">Brand<select id="isvAct">${brands.slice().sort((a, b) => a.name.localeCompare(b.name)).map(a => `<option value="${esc(a.act_id)}" ${a.act_id === pick ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
        <label class="isv-f">Why it is worth keeping (optional)<textarea id="isvNote" placeholder="The hook, the format, the offer, what to steal">${esc(it.note || '')}</textarea></label>
        <div class="isv-err" id="isvErr"></div>
        <div class="row" style="justify-content:flex-end;gap:8px;margin:6px 0 0"><button class="btn" data-m="no">Cancel</button><button class="btn primary" data-m="yes">Save</button></div></div>`;
      document.body.appendChild(w);
      const done = v => { w.remove(); document.removeEventListener('keydown', k); resolve(v); };
      const k = e => { if (e.key === 'Escape') done(null); };
      document.addEventListener('keydown', k);
      w.addEventListener('mousedown', e => { if (e.target === w) done(null); });
      w.querySelector('[data-m="no"]').onclick = () => done(null);
      const go = w.querySelector('[data-m="yes"]'), err = w.querySelector('#isvErr');
      go.focus();
      go.onclick = async () => {
        const act = w.querySelector('#isvAct').value, note = w.querySelector('#isvNote').value.trim();
        go.disabled = true; go.textContent = 'Saving…'; err.textContent = '';
        try {
          let image = it.image || '';
          if (it.file) {
            const type = it.file.type;
            if (!/^image\/(png|jpeg|webp)$/.test(type)) throw new Error('Paste a PNG, JPG or WebP picture.');
            image = (await call('/api/studio/upload', { method: 'POST', body: it.file, headers: { 'Content-Type': type } })).url;
          }
          const r = await call('/api/inspo', { method: 'POST', body: JSON.stringify({ act, url, image, note, title: it.title || '' }) });
          const name = (brands.find(a => a.act_id === act) || {}).name || 'the brand';
          toast(r.already ? `Already saved for ${name}.` : `Saved for ${name}.`, false, () => openPage(act));
          done(r.item);
          if (st.tab === 'inspo' && st.act === act && window.LocusSave.repaint) window.LocusSave.repaint();
        } catch (e) { err.textContent = e.message; go.disabled = false; go.textContent = 'Save'; }
      };
    });
  }
  function openPage(act) {
    const st = host();
    if (act && st.act !== act) { st.act = act; try { localStorage.setItem('pf_act', act); } catch {} const cp = document.getElementById('clientPick'); if (cp) cp.value = act; }
    if (typeof window.show === 'function') window.show('inspo'); else if (typeof show === 'function') show('inspo');
  }

  /** The bookmarklet: opens Locus on the page you are reading, with the save window up. */
  const bookmarklet = () => {
    const base = location.origin + location.pathname.replace(/[^/]*$/, '');
    return `javascript:(()=>{window.open('${base}?save='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank')})()`;
  };

  /** Make > Inspiration's first card: everything saved for this brand, from any angle. */
  async function section(el, act, opts = {}) {
    css();
    const V = window.V2UI || {}, brief = opts.brief || (() => {});
    el.innerHTML = `<section class="v2card isv-sec"><div class="v2h"><h3>Saved to Locus</h3><p class="find">links and pictures the team saved · every angle</p></div><p class="v2hint">Reading…</p></section>`;
    let items = [];
    try { items = (await call(`/api/inspo?act=${encodeURIComponent(act)}`)).items || []; } catch (e) { el.querySelector('.v2hint').textContent = e.message; return; }
    const sec = el.querySelector('.isv-sec');
    const card = (x, i) => `<div class="g"><a class="th${x.image ? '' : ' none'}" href="${esc(x.url || x.image)}" target="_blank" rel="noopener"${x.image ? ` style="background-image:url('${esc(x.image)}');background-size:cover"` : ''}>${x.image ? '' : esc((x.site || '?').slice(0, 1).toUpperCase())}${x.site ? `<em>${esc(x.site)}</em>` : ''}</a>
      <div class="b"><b title="${esc(x.title)}">${esc(x.title || x.site || 'Saved')}</b>${x.note ? `<p class="note">${esc(x.note)}</p>` : ''}<span class="v2hint" style="font-size:12px">${esc([String(x.by || '').split('@')[0], (x.at || '').slice(0, 10)].filter(Boolean).join(' · '))}</span>
      <div class="v2links"><a class="v2link" href="${esc(x.url || x.image)}" target="_blank" rel="noopener">Open ↗</a><button type="button" class="v2link" data-isb="${i}">Brief one like it</button><button type="button" class="v2link" data-isd="${i}">Remove</button></div></div></div>`;
    sec.innerHTML = `<div class="v2h"><h3>Saved to Locus</h3><p class="find">${items.length ? `${items.length} saved` : 'nothing saved yet'} · links and pictures from any angle</p></div>
      <div class="isv-add"><input id="isvUrl" type="url" placeholder="Paste a link to an ad, a post or a page" aria-label="Link to save"><button type="button" class="ds-btn" id="isvGo">Save</button></div>
      ${items.length ? `<div class="v2gal">${items.map(card).join('')}</div>` : '<p class="lx-empty">Paste a link above, paste one into the Ask bar, or share it from your phone.</p>'}
      <div class="isv-how"><span>Desktop: drag <a class="isv-bm" href="${esc(bookmarklet())}" title="Drag me to your bookmarks bar" onclick="return false">Save to Locus</a> to your bookmarks bar, then press it on any page.</span><span>Phone: add Locus to your home screen, then Share &gt; Locus.</span></div>`;
    const inp = sec.querySelector('#isvUrl');
    const add = () => { const u = firstUrl(inp.value); if (!u) { inp.focus(); return; } save({ url: u }).then(x => { if (x) section(el, act, opts); }); };
    sec.querySelector('#isvGo').onclick = add;
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
    sec.querySelectorAll('[data-isb]').forEach(b => b.onclick = () => brief(items[+b.dataset.isb]));
    sec.querySelectorAll('[data-isd]').forEach(b => b.onclick = async () => {
      const x = items[+b.dataset.isd];
      if (window.confirmModal && !(await window.confirmModal('Remove this from Inspiration?', x.title || x.url || '', 'Remove'))) return;
      try { await call(`/api/inspo?id=${encodeURIComponent(x.id)}`, { method: 'DELETE' }); section(el, act, opts); } catch (e) { toast(e.message, true); }
    });
    window.LocusSave.repaint = () => section(el, act, opts);
    void V;
  }

  /** ?share=1 (phone) or ?save= (bookmarklet): kept until Locus is signed in, then the save window opens once. */
  function readURL(qs) {
    /* The share sheet replaces the action's query with title, text and url, so their presence is the marker. */
    const share = qs.get('share') === '1' || qs.has('url') || qs.has('text'), saveU = qs.get('save');
    if (!share && !saveU) return;
    const url = firstUrl(saveU || qs.get('url') || qs.get('text') || '');
    const title = (qs.get('title') || '').slice(0, 200);
    if (url) { try { sessionStorage.setItem('pf_save_pending', JSON.stringify({ url, title })); } catch {} }
    ['share', 'save', 'url', 'text', 'title'].forEach(k => qs.delete(k));
    const rest = qs.toString();
    history.replaceState(null, '', location.pathname + (rest ? '?' + rest : ''));
  }
  function pending() {
    let p = null; try { p = JSON.parse(sessionStorage.getItem('pf_save_pending') || 'null'); sessionStorage.removeItem('pf_save_pending'); } catch {}
    if (p && p.url) setTimeout(() => save(p), 300);
  }

  window.LocusSave = { save, section, readURL, pending, isLink, firstUrl, bookmarklet };
})();
