/* Make (2026-10-20): one panel that turns a link, a file or an idea into the brand's version, then sends it out one
   of four doors: Organic post (the tray + a Film task for Ravo), Creators (a card on the creator board), Ad brief (a
   Locus brief, mirrored to Asana) or Studio (a batch with the scene and copy filled in). The same engine as the Slack
   ideas bot (account-health make.js + ideas.js); Slack is an opt-in toggle, off by default.
   Opened from the header Make button, Social's Make ours, Studio's Make, and the creator board's Add videos.
   window.LocusMake.open({ act, exit, url, text, image, note, post, mode, mount, back, onDone }) */
(() => {
  const EXITS = [['organic', 'Organic post', 'Goes on the Week tray with a Film task for Ravo (due in 5 days).'], ['creators', 'Creators', 'A video card on the creator board: what to shoot, the hook, the reference.'], ['brief', 'Ad brief', 'A numbered brief on the Production board, in Asana too when the mirror is on.'], ['studio', 'Studio', 'A Studio batch with the scene and copy filled in, ready to make.']];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, l) => window.icon ? window.icon(n, { size: 15, label: l }) : '';
  const U = () => window.V2UI;
  const PHONE = () => matchMedia('(max-width: 720px)').matches;
  const S = () => window.S || {};
  const AH = () => window.AH_URL || 'https://mobius-account-health.mobius-digital.workers.dev';
  const tok = () => S().tok || (() => { try { return localStorage.getItem('pf_token') || localStorage.getItem('mobius_session'); } catch { return null; } })();
  const nameOf = act => ((S().accounts || []).find(a => a.act_id === act) || {}).name || 'the brand';
  async function api(path, opts = {}) {
    if (window.apiAH) return window.apiAH(path, { fresh: true, ...opts });
    const r = await fetch(AH().replace(/\/+$/, '') + path, { ...opts, headers: { Authorization: 'Bearer ' + tok(), 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }
  function toast(t) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:var(--surface);padding:10px 14px;border-radius:9px;font-size:13px;z-index:9999;max-width:min(560px,92vw);box-shadow:0 8px 24px -10px rgba(0,0,0,.6)';
    el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 5200);
  }
  function css() {
    if (document.getElementById('mkcss')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="mkcss">
      .mk-wrap .mk-m{width:min(600px,calc(100vw - 32px));max-width:600px;max-height:min(86vh,820px);display:flex;flex-direction:column;padding:0;overflow:hidden}
      .mk-m .mk-hd{display:flex;align-items:center;gap:10px;padding:16px 20px 12px;border-bottom:1px solid var(--line)} .mk-m .mk-hd h3{margin:0;font-size:16px;font-weight:600;flex:1;min-width:0}
      .mk-m .mk-x{background:none;border:0;color:var(--muted);font-size:20px;line-height:1;cursor:pointer;padding:4px 6px;border-radius:6px;min-height:0} .mk-m .mk-x:hover{color:var(--ink);background:var(--surface-2)}
      .mk-m .mk-bd{padding:16px 20px 20px;overflow:auto}
      .mk{font-size:13px;color:var(--ink)} .mk p{margin:0 0 8px;color:var(--muted);line-height:1.45} .mk h4{margin:14px 0 6px;font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
      .mk .bk{background:none;border:0;color:var(--muted);cursor:pointer;padding:0;margin:0 0 10px;font-size:13px} .mk .bk:hover{color:var(--ink)}
      .mk input[type=text],.mk input[type=url],.mk textarea{width:100%;box-sizing:border-box;border:1px solid var(--line);background:var(--surface-2,var(--surface));color:var(--ink);border-radius:8px;padding:9px 11px;font:inherit;font-size:13px}
      .mk textarea{min-height:72px;resize:vertical}
      .mk .fld{display:block;margin:0 0 10px} .mk .fld>span{display:block;font-size:12px;color:var(--muted);margin:0 0 4px}
      .mk .drop{border:1px dashed var(--line);border-radius:10px;padding:14px;text-align:center;color:var(--muted);cursor:pointer;margin:0 0 10px;transition:border-color var(--t,160ms)} .mk .drop.over,.mk .drop:hover{border-color:var(--brand)} .mk .drop b{color:var(--ink)}
      .mk .ref{display:flex;gap:10px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin:0 0 10px} .mk .ref .th{width:44px;height:56px;border-radius:6px;background:var(--surface-2,var(--line)) center/cover no-repeat;flex:none} .mk .ref .t{min-width:0;flex:1} .mk .ref .t b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .mk .ref .t small{color:var(--muted);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .mk .ref button{background:none;border:0;color:var(--muted);cursor:pointer;font-size:18px;line-height:1}
      .mk .mode{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 10px} .mk .mode label{border:1px solid var(--line);border-radius:10px;padding:9px 11px;cursor:pointer;display:block} .mk .mode label.on{border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand)} .mk .mode input{display:none} .mk .mode b{display:block;font-size:13px} .mk .mode small{color:var(--muted)}
      .mk .sw{display:flex;align-items:center;gap:10px;margin:4px 0 12px;color:var(--muted)} .mk .sw .v2sw{flex:none}
      .mk .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}
      .mk .btn{height:34px;padding:0 14px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px} .mk .btn:hover{border-color:var(--ink)} .mk .btn.pri{background:var(--brand);border-color:var(--brand);color:var(--on-brand,#fff)} .mk .btn:disabled{opacity:.55;cursor:default} .mk .btn.sm{height:30px;padding:0 10px;font-size:12px}
      .mk .err{color:var(--bad);font-size:12px;min-height:14px}
      .mk .stat{display:inline-flex;align-items:center;gap:7px;font-weight:600;margin:0 0 10px} .mk .stat i{width:9px;height:9px;border-radius:50%;background:var(--muted)} .mk .stat.work i{background:var(--warn);animation:mkp 1.1s infinite} .mk .stat.ok i{background:var(--good)} .mk .stat.bad i{background:var(--bad)} .mk .stat.ask i{background:var(--warn)}
      @keyframes mkp{50%{opacity:.35}}
      .mk .td{display:grid;grid-template-columns:110px 1fr;gap:4px 10px;font-size:12.5px;margin:0 0 6px} .mk .td i{font-style:normal;color:var(--muted)} .mk .td span{color:var(--ink)}
      .mk .beats{display:flex;flex-direction:column;gap:6px;margin:0 0 10px} .mk .beat{display:grid;grid-template-columns:78px 1fr;gap:10px;border:1px solid var(--line);border-radius:8px;padding:7px 10px;font-size:12.5px} .mk .beat i{font-style:normal;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding-top:2px} .mk .beat.hk{border-color:var(--brand)}
      .mk .exits{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0 4px} .mk .exits button{text-align:left;border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--surface);color:var(--ink);font:inherit;cursor:pointer} .mk .exits button b{display:block;font-size:13px} .mk .exits button small{color:var(--muted);font-size:11.5px;line-height:1.35;display:block;margin-top:2px} .mk .exits button.pri{border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand)} .mk .exits button.done{border-style:dashed;opacity:.8} .mk .exits button:disabled{cursor:default}
      .mk .sent{display:flex;gap:6px;align-items:center;color:var(--good);font-size:12.5px;margin:4px 0} .mk .sent a{color:var(--brand)}
      .mk .cost{color:var(--muted);font-size:11.5px;margin-top:10px}
      .mk .ask{border:1px solid var(--warn);border-radius:10px;padding:10px 12px;margin:0 0 10px} .mk .ask p{color:var(--ink)}
      @media (max-width:720px){.mk .exits,.mk .mode{grid-template-columns:1fr} .mk .td{grid-template-columns:90px 1fr}}
    </style>`);
  }
  const exitOf = () => { const t = S().tab || ''; return /^social/.test(t) ? 'organic' : t === 'studio' ? 'studio' : t === 'amb' ? 'creators' : null; };

  let poll = null, OPEN = null;
  function open(o = {}) {
    css();
    const act = o.act || S().act;
    if (!act || act === 'all') { toast('Pick a brand first.'); return; }
    clearTimeout(poll);
    const M = { act, exit: o.exit === undefined ? exitOf() : o.exit, url: o.url || '', text: o.text || '', image: o.image || null, file: o.file || null, note: o.note || '', post: o.post || null, mode: o.mode || 'remix', slack: false, id: o.id || null, onDone: o.onDone || null, mount: o.mount || null, back: o.back || null, title: o.title || 'Make' };
    OPEN = M;
    const host = () => {
      if (M.mount) return M.mount;
      /* Locus's standard pop-up (2026-10-21, Cole: the full-height sheet "doesn't look like our standard pop-up"): the
         .modal-wrap / .modal every confirm uses, sized to what is in it, one title, a close cross. */
      if (!M.body || !M.body.isConnected) {
        document.querySelectorAll('.modal-wrap.mk-wrap').forEach(x => x.remove());
        const w = document.createElement('div'); w.className = 'modal-wrap mk-wrap';
        w.innerHTML = `<div class="modal mk-m" role="dialog" aria-label="${esc(M.title)}"><div class="mk-hd"><h3>${esc(M.title)}${M.post ? '' : `: ${esc(nameOf(act))}`}</h3><button type="button" class="mk-x" aria-label="Close">&#215;</button></div><div class="mk-bd"><div class="mk"></div></div></div>`;
        document.body.appendChild(w);
        const shut = () => { w.remove(); document.removeEventListener('keydown', key); clearTimeout(poll); if (OPEN === M) OPEN = null; };
        const key = e => { if (e.key === 'Escape') shut(); };
        document.addEventListener('keydown', key);
        w.addEventListener('mousedown', e => { if (e.target === w) shut(); });
        w.querySelector('.mk-x').onclick = shut;
        M.shut = shut; M.body = w.querySelector('.mk-bd');
      }
      return M.body;
    };
    const paint = html => { const h = host(); if (!h) return null; const box = h.querySelector('.mk') || h; if (box === h) { h.innerHTML = `<div class="mk">${html}</div>`; return h.querySelector('.mk'); } box.innerHTML = html; if (h.scrollTop !== undefined) h.scrollTop = 0; return box; };
    const backBtn = M.back ? `<button type="button" class="bk" data-back>&#8249; ${esc(M.back.label || 'Back')}</button>` : '';
    const wireBack = el => { const b = el.querySelector('[data-back]'); if (b && M.back) b.onclick = () => { clearTimeout(poll); M.back.fn(); }; };

    /* ---- step 1: what to make it from ---- */
    const form = () => {
      const ref = M.url || M.file || M.image;
      const el = paint(`${backBtn}${M.mount ? `<h3 style="margin:0 0 6px;font-size:16px">${esc(M.title)}${M.post ? '' : `: ${esc(nameOf(act))}`}</h3>` : ''}
        <p>Claude reads the reference, breaks down why it works and writes ${esc(nameOf(act))}'s version: hook, shots, on-screen text, caption. About 20 to 30 cents.</p>
        ${ref ? `<div class="ref"><span class="th" ${M.image ? `style="background-image:url('${esc(M.image)}')"` : ''}></span><div class="t"><b>${esc(M.file ? M.file.name : M.url ? 'Link' : 'Picture')}</b><small>${esc(M.url || (M.file ? `${M.file.kind}, ${Math.round((M.file.size || 0) / 1048576 * 10) / 10} MB` : ''))}</small></div>${M.post ? '' : '<button type="button" data-clear aria-label="Remove">&#215;</button>'}</div>` : `
        <label class="fld"><span>A link</span><input type="url" id="mkUrl" placeholder="TikTok, Instagram, YouTube, Atria or Meta Ad Library link" value="${esc(M.url)}"></label>
        <div class="drop" id="mkDrop" tabindex="0"><b>Drop a video or picture</b><br><small>or click to pick one, up to 95 MB</small><input type="file" id="mkFile" hidden accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"></div>`}
        <label class="fld"><span>${ref ? 'Steer it (optional)' : 'Or describe the idea'}</span><textarea id="mkText" placeholder="${ref ? 'Use the Ice & Gold wedge, keep the POV hook, make it about the gift' : 'A customer unboxing the belt and showing the buckle swap, filmed on a phone in the car park'}">${esc(ref ? M.note : M.text)}</textarea></label>
        ${M.url || M.file ? `<div class="mode" role="radiogroup" aria-label="How close to the original">
          <label class="${M.mode !== 'recreate' ? 'on' : ''}"><input type="radio" name="mkMode" value="remix" ${M.mode !== 'recreate' ? 'checked' : ''}><b>Our own take</b><small>Keep the idea, change how it is told</small></label>
          <label class="${M.mode === 'recreate' ? 'on' : ''}"><input type="radio" name="mkMode" value="recreate" ${M.mode === 'recreate' ? 'checked' : ''}><b>Recreate it</b><small>Same hook shape, beats and pacing; only product and words change</small></label></div>` : ''}
        <div class="sw"><button type="button" class="v2sw ${M.slack ? 'on' : ''}" id="mkSlack" role="switch" aria-checked="${M.slack}" aria-label="Also post in Slack"><i></i></button><span>Also post it in the brand's Slack channel</span></div>
        <div class="row"><button type="button" class="btn pri" id="mkGo">Make it</button><span class="err" id="mkErr"></span></div>`);
      if (!el) return;
      wireBack(el);
      const clr = el.querySelector('[data-clear]'); if (clr) clr.onclick = () => { M.url = ''; M.file = null; M.image = null; form(); };
      const drop = el.querySelector('#mkDrop'), fi = el.querySelector('#mkFile');
      const take = async f => {
        if (!f) return;
        if (f.size > 95 * 1024 * 1024) { el.querySelector('#mkErr').textContent = 'Files up to 95 MB.'; return; }
        drop.innerHTML = '<b>Uploading…</b>';
        try {
          const r = await fetch(`${AH().replace(/\/+$/, '')}/api/make/upload?act=${encodeURIComponent(act)}&name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok(), 'Content-Type': f.type || 'application/octet-stream' }, body: f });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || 'The upload failed.');
          M.file = j.file; M.note = el.querySelector('#mkText').value; if (M.file.kind === 'image') M.image = M.file.url; form();
        } catch (e) { drop.innerHTML = `<b>Drop a video or picture</b><br><small>or click to pick one, up to 95 MB</small>`; drop.appendChild(fi); el.querySelector('#mkErr').textContent = e.message; }
      };
      if (drop) {
        drop.onclick = () => fi.click(); drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } };
        fi.onchange = () => take(fi.files[0]);
        drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
        drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); take(e.dataTransfer.files[0]); };
      }
      el.querySelectorAll('.mode input').forEach(r => r.onchange = () => { M.mode = r.value; el.querySelectorAll('.mode label').forEach(l => l.classList.toggle('on', l.contains(r))); });
      const sw = el.querySelector('#mkSlack'); sw.onclick = () => { M.slack = !M.slack; sw.classList.toggle('on', M.slack); sw.setAttribute('aria-checked', String(M.slack)); };
      el.querySelector('#mkGo').onclick = async () => {
        const g = el.querySelector('#mkGo'), err = el.querySelector('#mkErr');
        const url = el.querySelector('#mkUrl') ? el.querySelector('#mkUrl').value.trim() : M.url;
        const text = el.querySelector('#mkText').value.trim();
        if (!url && !M.file && !M.image && !text) { err.textContent = 'Paste a link, drop a file or describe the idea.'; return; }
        const steer = M.mode === 'recreate' ? 'RECREATE IT: keep the exact structure of this post (same hook shape, same beat order, same length and pacing, same on-screen text style); change only the product, the setting and the words to fit the brand.' : '';
        const note = [steer, (url || M.file || M.image) ? text : '', M.note && M.post ? M.note : ''].filter(Boolean).join(' ');
        g.disabled = true; g.textContent = 'Starting…';
        try {
          const r = await api('/api/make', { method: 'POST', body: JSON.stringify({ act, url: url || undefined, text: (url || M.file || M.image) ? undefined : text, file: M.file || undefined, image: M.image || undefined, note, exit: M.exit || undefined, post: M.post || undefined, slack: M.slack }) });
          M.id = r.id; if (M.onDone) M.onDone({ started: r.id });
          show(r.state, 0);
        } catch (e) { err.textContent = e.message; g.disabled = false; g.textContent = 'Make it'; }
      };
    };

    /* ---- step 2: the draft, the breakdown, Redo, the four exits ---- */
    const stat = (cls, t) => `<span class="stat ${cls}"><i></i>${esc(t)}</span>`;
    const read = tries => { clearTimeout(poll); poll = setTimeout(() => { if (OPEN !== M) return; api(`/api/make?id=${encodeURIComponent(M.id)}`).then(r => show(r.state, tries + 1)).catch(e => { const el = paint(`${backBtn}${stat('bad', 'Could not read it')}<p>${esc(e.message)}</p>`); if (el) wireBack(el); }); }, 3000); };
    const TD = { awareness: 'Awareness', sophistication: 'Sophistication', desire: 'Desire', layer: 'Problem layer', mechanism: 'Mechanism', proof: 'Proof', hook_why: 'Why the hook works', weak: 'Weak spot' };
    const show = (s, tries = 0) => {
      if (OPEN !== M) return;
      if (!s) { const el = paint(`${backBtn}${stat('', 'No draft stored')}<p>That draft is no longer stored.</p>`); if (el) wireBack(el); return; }
      if (['queued', 'working'].includes(s.status)) {
        const el = paint(`${backBtn}${stat('work', s.status === 'queued' ? 'Queued, about a minute' : 'Writing, about a minute')}<p>Claude is reading the reference and writing ${esc(nameOf(act))}'s version. This updates on its own.${s.slack && s.link ? ` It posts in <a href="${esc(s.link)}" target="_blank" rel="noopener">Slack</a> too.` : ''}</p>`);
        if (el) wireBack(el);
        if (tries < 80) read(tries); return;
      }
      if (s.status === 'failed') {
        const el = paint(`${backBtn}${stat('bad', 'Did not finish')}<p>${esc(s.error || 'The draft did not finish.')}</p><div class="row"><button type="button" class="btn pri" id="mkRetry">Try again</button><span class="err" id="mkErr"></span></div>`);
        if (!el) return; wireBack(el);
        el.querySelector('#mkRetry').onclick = async e => { e.target.disabled = true; try { await api('/api/make/redo', { method: 'POST', body: JSON.stringify({ id: M.id }) }); show({ status: 'queued', slack: s.slack, link: s.link }, 0); } catch (err) { el.querySelector('#mkErr').textContent = err.message; e.target.disabled = false; } };
        return;
      }
      const sc = s.script || {}, t = s.teardown || {};
      const beats = [...(sc.openers || []).slice(0, 2).map((x, i) => [i ? 'Or open' : 'Hook', x, true]), ...(sc.shots || []).map(x => [x.label || 'Shot', x.text || x, false])];
      const lines = s.studio && !beats.length ? s.studio.lines.map((x, i) => [`Ad ${i + 1}`, typeof x === 'string' ? x : x.text, false]) : [];
      const sent = s.sent || {};
      const asking = s.status === 'questions' && (s.questions || []).length;
      const tdRows = Object.entries(TD).filter(([k]) => t[k]).map(([k, l]) => `<i>${esc(l)}</i><span>${esc(t[k])}</span>`).join('');
      const exitDone = k => k === 'creators' ? (sent.creator_link || sent.lucky_creators) : k === 'brief' ? sent.asana_brief : sent[k];
      const el = paint(`${backBtn}${stat(asking ? 'ask' : Object.keys(sent).length ? 'ok' : 'ok', asking ? 'Needs an answer' : Object.keys(sent).length ? 'Sent on' : 'Draft ready')}
        ${asking ? `<div class="ask"><p>${esc(s.questions.join(' '))}</p><textarea id="mkAns" placeholder="Answer here, then Redo"></textarea></div>` : ''}
        ${sc.title ? `<p><b style="color:var(--ink);font-size:15px">${esc(sc.title)}</b></p>` : ''}
        ${s.take ? `<p>${esc(s.take)}</p>` : ''}
        ${tdRows ? `<h4>Why it works</h4><div class="td">${tdRows}</div>` : ''}
        ${beats.length || lines.length ? `<h4>${esc(nameOf(act))}'s version</h4><div class="beats">${[...beats, ...lines].map(([l, x, hk]) => `<div class="beat ${hk ? 'hk' : ''}"><i>${esc(l)}</i><span>${esc(x)}</span></div>`).join('')}</div>` : ''}
        ${sc.on_screen ? `<p><b style="color:var(--ink)">On screen:</b> ${esc(sc.on_screen)}</p>` : ''}
        ${s.caption ? `<p><b style="color:var(--ink)">Caption:</b> ${esc(s.caption)}</p>` : ''}
        <h4>Not quite right?</h4>
        <div class="row"><input type="text" id="mkSteer" placeholder="Steer it: shorter hook, make it about the gift, film it on the course" maxlength="400" style="flex:1 1 240px"><button type="button" class="btn" id="mkRedo">${ic('refresh-cw')} Redo</button></div>
        <h4>Send it on</h4>
        ${Object.entries(sent).map(([k, v]) => `<span class="sent">${ic('check')} ${esc(k === 'organic' ? 'On the tray, Film task made' : k === 'lucky_creators' ? 'On the Lucky creator app' : k === 'creator_link' ? 'On the creator board' : k === 'asana_brief' ? 'Brief made' : k === 'studio' ? 'In Studio' : k)}${v.name ? `: ${esc(v.name)}` : ''}${v.url ? ` · <a href="${esc(v.url)}" target="_blank" rel="noopener">open</a>` : ''}${k === 'studio' && v.id && window.StudioTab && window.StudioTab.openBatch ? ` · <a href="#" data-studio="${esc(v.id)}">open in Studio</a>` : ''}</span>`).join('')}
        <div class="exits">${EXITS.map(([k, l, why]) => `<button type="button" data-exit="${k}" class="${exitDone(k) ? 'done' : k === M.exit ? 'pri' : ''}" ${exitDone(k) ? 'disabled' : ''}><b>${esc(l)}${exitDone(k) ? ' ✓' : ''}</b><small>${esc(why)}</small></button>`).join('')}</div>
        <span class="err" id="mkErr"></span>
        <p class="cost">${s.slack && s.link ? `The same draft is in <a href="${esc(s.link)}" target="_blank" rel="noopener">Slack</a>. ` : ''}${s.cost ? `$${Number(s.cost).toFixed(2)} so far.` : ''}</p>`);
      if (!el) return; wireBack(el);
      el.querySelectorAll('[data-studio]').forEach(a => a.onclick = e => { e.preventDefault(); openStudio(a.dataset.studio); });
      const redo = async () => {
        const b = el.querySelector('#mkRedo'), err = el.querySelector('#mkErr');
        const note = [el.querySelector('#mkAns') ? el.querySelector('#mkAns').value.trim() : '', el.querySelector('#mkSteer').value.trim()].filter(Boolean).join(' ');
        if (asking && !note) { err.textContent = 'Answer the question first.'; return; }
        b.disabled = true;
        try { await api('/api/make/redo', { method: 'POST', body: JSON.stringify({ id: M.id, note }) }); show({ status: 'queued', slack: s.slack, link: s.link }, 0); }
        catch (e) { err.textContent = e.message; b.disabled = false; }
      };
      el.querySelector('#mkRedo').onclick = redo;
      el.querySelector('#mkSteer').onkeydown = e => { if (e.key === 'Enter') redo(); };
      el.querySelectorAll('[data-exit]').forEach(b => b.onclick = async () => {
        const err = el.querySelector('#mkErr'); const k = b.dataset.exit;
        el.querySelectorAll('[data-exit]').forEach(x => x.disabled = true); b.querySelector('b').textContent = 'Sending…';
        try {
          const r = await api('/api/make/exit', { method: 'POST', body: JSON.stringify({ id: M.id, exit: k }) });
          if (r.text) toast(r.text);
          if (M.onDone) M.onDone({ exit: k, result: r });
          if (k === 'studio') { const id = r.pushed?.id || r.state?.sent?.studio?.id; if (id) { openStudio(id); return; } }
          show(r.state, 0);
        } catch (e) { err.textContent = e.message; show(s, 0); }
      });
    };
    const openStudio = id => {
      clearTimeout(poll);
      if (window.StudioTab && window.StudioTab.openBatch) window.StudioTab.openBatch(id);
      if (!M.mount && M.shut) M.shut();
      if (M.back && M.mount) M.back.fn();
      if (window.show) { if (window.S && window.S.act !== act) { const sel = document.getElementById('clientPick'); if (sel) sel.value = act; window.S.act = act; } window.show('studio'); }
    };

    if (M.id) { const el = paint(`${backBtn}${stat('work', 'Reading the draft')}`); if (el) wireBack(el); api(`/api/make?id=${encodeURIComponent(M.id)}`).then(r => show(r.state, 0)).catch(e => { const el2 = paint(`${backBtn}${stat('bad', 'Could not read it')}<p>${esc(e.message)}</p>`); if (el2) wireBack(el2); }); }
    else form();
  }
  function close() { clearTimeout(poll); OPEN = null; }
  window.LocusMake = { open, close, EXITS, exitOf };
})();
