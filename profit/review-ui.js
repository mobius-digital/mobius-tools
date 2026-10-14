/* REVIEW (Production v2, 2026-10-14; approved mock board 2). One ad's versions, full screen: the picture or the video,
 * drawing tools (Pin, Box, Arrow, Pen, Mark in four colours) tied to each note, notes per version with the second they
 * were made on a video, Compare (two versions side by side), Approve / Ask for changes. Used by Locus Production
 * (production.js) and by the public review link (review.html), so it only talks through the callbacks it is given.
 *   ReviewUI.open({ title, num, brand, format, files, comments, mode: 'team'|'client'|'guest', canDecide, needsName,
 *                   api: { note(fileId, body, shape, at), decide(ok, body), fixed(id, on), share(), reload() } })
 * Drawings are stored in 0..1 coordinates of the picture, so they land on the same spot at any size. Own closure, CSS
 * #rv-css, classes .rv-*, tokens only. */
(() => {
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COLOR = { coral: 'var(--bad)', yellow: 'var(--warn)', blue: 'var(--brand)', green: 'var(--good)' };
const TOOLS = [['pin', 'Pin', '<circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/>'], ['box', 'Box', '<rect x="4" y="5" width="16" height="14" rx="1"/>'],
  ['arrow', 'Arrow', '<path d="M5 19 19 5"/><path d="M9 5h10v10"/>'], ['pen', 'Pen', '<path d="M3 17c3-6 6 2 9-4s6-2 9-6"/>'], ['mark', 'Mark', '<path d="M4 15h16" stroke-width="6" opacity=".5"/>']];
const svgIc = p => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const mmss = s => s == null ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const when = iso => { if (!iso) return ''; const t = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : String(iso).replace(' ', 'T') + 'Z'); return t ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; };

function css() {
  if (document.getElementById('rv-css')) return;
  const s = document.createElement('style'); s.id = 'rv-css';
  s.textContent = `
.rv-scrim{position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.6);display:flex;align-items:stretch;justify-content:center;padding:24px}
.rv{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:12px;width:100%;max-width:1400px;display:flex;flex-direction:column;overflow:hidden;min-height:0}
.rv-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--line)}
.rv-h .num{font-size:12px;font-weight:700;color:var(--muted)}
.rv-h .t{font-size:16px;font-weight:700;color:var(--ink);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:420px}
.rv-h .sp{flex:1}
.rv-tag{font-size:11px;padding:2px 7px;border-radius:4px;font-weight:600;white-space:nowrap;color:var(--tc,var(--muted));background:color-mix(in srgb,var(--tc,var(--muted)) 14%,transparent)}
.rv-seg{display:flex}
.rv-seg button{height:30px;padding:0 12px;border:1px solid var(--line-strong);background:transparent;color:var(--ink-2);font:inherit;font-size:12px;font-weight:600;cursor:pointer;margin-left:-1px}
.rv-seg button:first-child{border-radius:6px 0 0 6px;margin-left:0}.rv-seg button:last-child{border-radius:0 6px 6px 0}
.rv-seg button.on{background:var(--ink);color:var(--surface);border-color:var(--ink)}
.rv-btn{height:34px;padding:0 14px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--ink);font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.rv-btn.pri{background:var(--brand);border-color:var(--brand);color:var(--surface)}
.rv-btn.ok{background:var(--good);border-color:var(--good);color:var(--surface)}
.rv-btn:disabled{opacity:.5;cursor:default}
.rv-b{flex:1;min-height:0;display:grid;grid-template-columns:56px minmax(0,1fr) 380px}
.rv-tools{padding:14px 8px;border-right:1px solid var(--line);display:flex;flex-direction:column;align-items:center;gap:8px}
.rv-tool{width:42px;height:44px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--ink-2);font:inherit;font-size:10px;font-weight:600;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.rv-tool.on{border-color:var(--brand);color:var(--ink);background:var(--brand-soft)}
.rv-sw{width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0;background:var(--sc)}
.rv-sw.on{border-color:var(--ink)}
.rv-sep{height:1px;width:32px;background:var(--line);margin:4px 0}
.rv-stagecol{padding:16px;display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0;border-right:1px solid var(--line)}
.rv-stage{flex:1;min-height:320px;background:var(--bg);border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative}
.rv-cmp{flex:1;min-height:320px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.rv-cmp .rv-stage{min-height:280px}
.rv-cmp .lab{font-size:12px;color:var(--muted);font-weight:600;margin:0 0 6px}
.rv-media{position:relative;display:inline-block;max-width:100%;max-height:100%;line-height:0}
.rv-media img,.rv-media video{display:block;max-width:100%;max-height:calc(100vh - 260px);object-fit:contain}
.rv-ov{position:absolute;inset:0;touch-action:none}
.rv-ov.draw{cursor:crosshair}
.rv-ov svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.rv-pin{position:absolute;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;color:var(--surface);background:var(--pc);font-size:11px;font-weight:700;line-height:24px;text-align:center;pointer-events:auto;cursor:pointer;box-shadow:0 0 0 2px var(--surface)}
.rv-pin.dim{opacity:.35}
.rv-pin.hi{box-shadow:0 0 0 3px var(--ink)}
.rv-line{display:flex;align-items:center;gap:10px}
.rv-track{flex:1;height:6px;background:var(--line-strong);border-radius:3px;position:relative;cursor:pointer}
.rv-track i{position:absolute;top:-4px;width:4px;height:14px;border-radius:2px;background:var(--warn);margin-left:-2px}
.rv-track b{position:absolute;top:0;left:0;height:6px;border-radius:3px;background:var(--brand)}
.rv-hint{font-size:12px;color:var(--muted)}
.rv-side{display:flex;flex-direction:column;min-height:0}
.rv-call{padding:14px 16px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:8px}
.rv-call .row{display:flex;gap:8px}.rv-call .row .rv-btn{flex:1}
.rv-lab{font-size:12px;color:var(--muted);font-weight:500}
.rv-notes{flex:1;overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px;min-height:120px}
.rv-note{display:flex;gap:10px;border-radius:8px;padding:6px;margin:-6px}
.rv-note.hi{background:var(--surface-2)}
.rv-note .n{position:static;margin:0;flex:0 0 24px}
.rv-note .bd{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.rv-note .hd{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--muted)}
.rv-note .hd b{color:var(--ink);font-weight:600;font-size:13px}
.rv-note .tx{color:var(--ink-2);line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
.rv-note .fx{font-size:12px;color:var(--good);font-weight:600}
.rv-note label{font-size:12px;color:var(--muted);display:inline-flex;gap:5px;align-items:center;cursor:pointer}
.rv-at{font:inherit;font-size:12px;font-weight:600;color:var(--brand);background:none;border:0;padding:0;cursor:pointer}
.rv-sys{font-size:12px;color:var(--muted);font-style:italic}
.rv-box{padding:14px 16px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:8px}
.rv-box textarea,.rv-box input{font:inherit;font-size:13px;color:var(--ink);background:var(--surface-2);border:1px solid var(--line-strong);border-radius:8px;padding:8px 10px;width:100%;box-sizing:border-box;resize:vertical}
.rv-box .row{display:flex;gap:8px;align-items:center}.rv-box .row .rv-hint{flex:1}
.rv-err{color:var(--bad);font-size:12.5px}
.rv-empty{color:var(--muted);font-size:13px;padding:30px;text-align:center;line-height:1.5}
@media (max-width:900px){
  .rv-scrim{padding:0}.rv{border-radius:0;border:0}
  .rv-b{grid-template-columns:minmax(0,1fr);overflow:auto;display:flex;flex-direction:column}
  .rv-tools{flex-direction:row;border-right:0;border-bottom:1px solid var(--line);overflow-x:auto;padding:8px 12px}
  .rv-sep{width:1px;height:28px;margin:0 4px}
  .rv-stagecol{border-right:0}
  .rv-media img,.rv-media video{max-height:60vh}
  .rv-notes{overflow:visible}
  .rv-h .t{max-width:60vw}
}`;
  document.head.appendChild(s);
}

/** The drawing of one note, as SVG in 0..1 (pins are HTML so they stay round). */
function shapeSvg(sh, n, on) {
  if (!sh) return '';
  const c = COLOR[sh.color] || COLOR.coral, op = on ? 1 : .35;
  const st = `stroke="${c}" fill="none" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"`;
  if (sh.tool === 'box') return `<rect x="${sh.x}" y="${sh.y}" width="${sh.w}" height="${sh.h}" ${st} stroke-width="3"/>`;
  if (sh.tool === 'arrow') {
    const ang = Math.atan2(sh.y2 - sh.y, sh.x2 - sh.x);
    return `<line x1="${sh.x}" y1="${sh.y}" x2="${sh.x2}" y2="${sh.y2}" ${st} stroke-width="3"/>`
      + `<line x1="${sh.x2}" y1="${sh.y2}" x2="${sh.x2 - .035 * Math.cos(ang - .5)}" y2="${sh.y2 - .035 * Math.sin(ang - .5)}" ${st} stroke-width="3"/>`
      + `<line x1="${sh.x2}" y1="${sh.y2}" x2="${sh.x2 - .035 * Math.cos(ang + .5)}" y2="${sh.y2 - .035 * Math.sin(ang + .5)}" ${st} stroke-width="3"/>`;
  }
  if (sh.tool === 'pen' || sh.tool === 'mark') {
    const pts = (sh.pts || []).map(p => p.join(',')).join(' ');
    return `<polyline points="${pts}" ${st} stroke-width="${sh.tool === 'mark' ? 18 : 3}" ${sh.tool === 'mark' ? 'stroke-opacity=".38"' : ''}/>`;
  }
  return '';
}
/** Where a note's number sits on the picture. */
function anchorOf(sh) {
  if (!sh) return null;
  if (sh.tool === 'pin' || sh.tool === 'box' || sh.tool === 'arrow') return { x: sh.x, y: sh.y };
  const p = (sh.pts || [])[0]; return p ? { x: p[0], y: p[1] } : null;
}

function open(o) {
  css();
  const S = { v: null, tool: 'pin', color: 'coral', pending: null, asking: false, hi: null, busy: false, err: '', files: o.files || [], comments: o.comments || [], canDecide: !!o.canDecide, name: o.name || '' };
  const versions = () => S.files.filter(f => f.kind !== 'insp').sort((a, b) => a.version - b.version);
  S.v = (versions().slice(-1)[0] || {}).id || null;
  const w = document.createElement('div'); w.className = 'rv-scrim';
  document.body.appendChild(w);
  const close = () => { w.remove(); document.removeEventListener('keydown', key); o.onClose && o.onClose(); };
  const key = e => { if (e.key === 'Escape' && !e.target.closest('textarea,input')) close(); };
  document.addEventListener('keydown', key);
  const fileOf = id => S.files.find(f => f.id === id);
  const notesOf = fid => S.comments.filter(c => c.file_id === fid && ['note', 'change_request', 'approval'].includes(c.kind));
  const team = o.mode === 'team';
  const later = (a, b) => (b.version || 0) > (a.version || 0);

  const media = (f, notes, opts = {}) => {
    if (!f) return `<div class="rv-empty">No version yet. ${team ? 'Upload the ad on the card\'s Files tab.' : 'Mobius has not uploaded this ad yet.'}</div>`;
    const el = f.video
      ? `<video src="${esc(f.url)}" preload="metadata" playsinline ${f.plays === false ? '' : ''} data-v></video>`
      : `<img src="${esc(f.url)}" alt="${esc(f.name || 'The ad')}" draggable="false">`;
    const pins = notes.map((c, i) => { const a = anchorOf(c.shape); return a ? `<span class="rv-pin${S.hi === c.id ? ' hi' : ''}" data-pin="${esc(c.id)}" data-at="${c.at ?? ''}" style="left:${a.x * 100}%;top:${a.y * 100}%;--pc:${COLOR[c.shape.color] || COLOR.coral}">${i + 1}</span>` : ''; }).join('');
    const svgs = notes.map(c => `<g data-sh="${esc(c.id)}" data-at="${c.at ?? ''}">${shapeSvg(c.shape, 0, true)}</g>`).join('');
    return `<div class="rv-media" data-file="${esc(f.id)}">${el}<div class="rv-ov${opts.draw ? ' draw' : ''}"><svg viewBox="0 0 1 1" preserveAspectRatio="none">${svgs}<g data-pending></g></svg>${pins}</div></div>`;
  };

  const paint = () => {
    const vs = versions();
    const f = fileOf(S.v);
    const cmp = S.v === 'compare';
    const notes = cmp ? [] : notesOf(S.v);
    const prev = cmp && vs.length > 1 ? vs[vs.length - 2] : null, last = vs[vs.length - 1];
    const fixedLater = c => c.fixed ? `Fixed${vs.some(x => later(fileOf(c.file_id) || {}, x)) ? ` in v${vs[vs.length - 1].version}` : ''}` : '';
    const noteHtml = (c, i) => c.kind === 'approval' ? `<div class="rv-sys">${esc(c.who)} approved this version. ${esc(when(c.created_at))}</div>`
      : `<div class="rv-note${S.hi === c.id ? ' hi' : ''}" data-note="${esc(c.id)}">
        <span class="rv-pin n" style="--pc:${c.shape ? COLOR[c.shape.color] || COLOR.coral : 'var(--muted)'}">${i + 1}</span>
        <div class="bd"><div class="hd"><b>${esc(c.who)}</b>${c.at != null ? `<button class="rv-at" data-seek="${c.at}">${mmss(c.at)}</button>` : ''}${c.shape ? `<span>${esc(c.shape.tool)}</span>` : ''}<span>${esc(when(c.created_at))}</span>${c.kind === 'change_request' ? '<span class="rv-tag" style="--tc:var(--bad)">Changes asked</span>' : ''}</div>
          <div class="tx">${esc(c.body)}</div>
          ${team ? `<label><input type="checkbox" data-fix="${esc(c.id)}"${c.fixed ? ' checked' : ''}> ${c.fixed ? esc(fixedLater(c) || 'Fixed') : 'Mark fixed'}</label>` : c.fixed ? `<span class="fx">${esc(fixedLater(c))}</span>` : ''}</div></div>`;
    const seg = vs.map(x => `<button type="button" data-ver="${esc(x.id)}" class="${S.v === x.id ? 'on' : ''}">v${x.version}${x === last ? ' (latest)' : ''}</button>`).join('') + (vs.length > 1 ? `<button type="button" data-ver="compare" class="${cmp ? 'on' : ''}">Compare</button>` : '');
    const decide = S.canDecide && !cmp && f ? `<div class="rv-call"><span class="rv-lab">Your call on v${f.version}</span>
        <div class="row"><button class="rv-btn ok" data-approve${S.busy ? ' disabled' : ''}>Approve</button><button class="rv-btn" data-ask${S.busy ? ' disabled' : ''}>Ask for changes</button></div>
        <span class="rv-hint">${o.decideHint || 'Approve moves it to Ready and records you. Ask for changes needs a note and sends it back to be fixed.'}</span></div>`
      : (!team && !cmp ? `<div class="rv-call"><span class="rv-hint">${o.waitHint || 'Leave notes on the ad. Mobius will ask for your OK here when it is ready.'}</span></div>` : '');
    w.innerHTML = `<div class="rv" role="dialog" aria-modal="true" aria-label="Review ${esc(o.title || '')}">
      <div class="rv-h"><span class="num">${esc(o.num || '')}</span><span class="t">${esc(o.title || 'Review')}</span>${o.format ? `<span class="rv-tag" style="--tc:${o.formatColor || 'var(--brand)'}">${esc(o.format)}</span>` : ''}
        ${vs.length ? `<div class="rv-seg" role="group" aria-label="Version">${seg}</div>` : ''}<span class="sp"></span>
        ${team && o.api.share ? '<button class="rv-btn" data-share>Copy client link</button>' : ''}<button class="rv-btn" data-close>Close</button></div>
      <div class="rv-b">
        <div class="rv-tools" role="group" aria-label="Drawing tools">${TOOLS.map(([k, l, p]) => `<button type="button" class="rv-tool${S.tool === k ? ' on' : ''}" data-tool="${k}" aria-label="${l}" aria-pressed="${S.tool === k}">${svgIc(p)}${l}</button>`).join('')}
          <div class="rv-sep"></div>${Object.keys(COLOR).map(k => `<button type="button" class="rv-sw${S.color === k ? ' on' : ''}" style="--sc:${COLOR[k]}" data-color="${k}" aria-label="${k}" aria-pressed="${S.color === k}"></button>`).join('')}</div>
        <div class="rv-stagecol">
          ${cmp ? `<div class="rv-cmp"><div style="display:flex;flex-direction:column;min-width:0"><p class="lab">v${prev.version} with its notes</p><div class="rv-stage">${media(prev, notesOf(prev.id))}</div></div>
              <div style="display:flex;flex-direction:column;min-width:0"><p class="lab">v${last.version} (latest)</p><div class="rv-stage">${media(last, [])}</div></div></div>
              <span class="rv-hint">Check every note on v${prev.version} was fixed in v${last.version}.</span>`
            : `<div class="rv-stage">${media(f, notes, { draw: true })}</div>
              ${f && f.video ? `<div class="rv-line"><button class="rv-btn" data-play aria-label="Play or pause">Play</button><div class="rv-track" data-track><b data-prog></b>${notes.filter(c => c.at != null).map(c => `<i data-tick="${c.at}" title="${mmss(c.at)}"></i>`).join('')}</div><span class="rv-hint" data-time>0:00</span></div>` : ''}
              ${f && f.video && f.plays === false ? `<span class="rv-err">This file may not play in a browser. <a href="${esc(f.url)}" download>Download it</a>, or export an MP4.</span>` : ''}
              <span class="rv-hint">${f ? (f.video ? 'Pause, pick a tool, draw on the ad, then write the note. The note keeps the time.' : 'Pick a tool, draw on the ad, then write the note.') : ''}</span>`}
        </div>
        <aside class="rv-side">${decide}
          <div class="rv-notes"><span class="rv-lab">${cmp ? 'Notes' : f ? `Notes on v${f.version}` : 'Notes'}</span>${cmp ? `<span class="rv-hint">Pick a version to add notes.</span>` : (notes.map(noteHtml).join('') || '<span class="rv-hint">No notes yet.</span>')}</div>
          ${cmp || !f ? '' : `<div class="rv-box">
            ${o.needsName ? `<label class="rv-lab">Your name<input data-name maxlength="60" value="${esc(S.name)}" autocomplete="name"></label>` : ''}
            <label class="rv-lab">${S.asking ? 'What needs to change (required)' : 'Add a note'}<textarea data-body rows="3" placeholder="${S.pending ? 'Say what to change here.' : 'Draw on the ad, then say what to change.'}"></textarea></label>
            ${S.err ? `<div class="rv-err">${esc(S.err)}</div>` : ''}
            <div class="row"><span class="rv-hint">${S.pending ? `Your ${esc(S.pending.tool)} is attached${S.pendingAt != null ? ` at ${mmss(S.pendingAt)}` : ''}. <button class="rv-at" data-clear>Remove it</button>` : 'Your drawing is saved with the note.'}</span>
              ${S.asking ? '<button class="rv-btn" data-cancel>Cancel</button>' : ''}<button class="rv-btn pri" data-post${S.busy ? ' disabled' : ''}>${S.asking ? 'Send back to be fixed' : 'Post'}</button></div></div>`}
        </aside>
      </div></div>`;
    wire();
  };

  const reload = async () => { if (!o.api.reload) return; const r = await o.api.reload(); if (r) { S.files = r.files || S.files; S.comments = r.comments || S.comments; if (r.canDecide != null) S.canDecide = r.canDecide; } };
  const act = async fn => { S.busy = true; S.err = ''; paint(); try { await fn(); S.pending = null; S.pendingAt = null; S.asking = false; await reload(); } catch (e) { S.err = e.message || 'That did not save. Try again.'; } S.busy = false; const body = S.draft; paint(); if (S.err && body) { const t = w.querySelector('[data-body]'); if (t) t.value = body; } };

  function wire() {
    const q = s => w.querySelector(s), qa = s => [...w.querySelectorAll(s)];
    q('[data-close]').onclick = close;
    w.onmousedown = e => { if (e.target === w) close(); };
    qa('[data-ver]').forEach(b => b.onclick = () => { S.v = b.dataset.ver; S.pending = null; S.hi = null; paint(); });
    qa('[data-tool]').forEach(b => b.onclick = () => { S.tool = b.dataset.tool; paint(); });
    qa('[data-color]').forEach(b => b.onclick = () => { S.color = b.dataset.color; paint(); });
    const share = q('[data-share]'); if (share) share.onclick = async () => { try { const u = await o.api.share(); await navigator.clipboard.writeText(u).catch(() => {}); share.textContent = 'Link copied'; setTimeout(() => { share.textContent = 'Copy client link'; }, 2500); } catch (e) { share.textContent = e.message || 'Could not make the link'; } };
    const nameIn = q('[data-name]'); if (nameIn) nameIn.oninput = () => { S.name = nameIn.value; try { localStorage.setItem('rv_name', S.name); } catch {} };
    const body = q('[data-body]');
    if (body) body.oninput = () => { S.draft = body.value; };
    if (body && S.draft) body.value = S.draft;
    const post = q('[data-post]');
    if (post) post.onclick = () => {
      const text = (body.value || '').trim();
      if (o.needsName && !S.name.trim()) { S.err = 'Add your name so the team knows who wrote it.'; paint(); return; }
      if (S.asking) { if (!text) { S.err = 'Say what needs to change.'; paint(); return; } return act(async () => { if (S.pending) await o.api.note(S.v, text, S.pending, S.pendingAt, S.name); await o.api.decide(false, S.pending ? 'See the note on the ad: ' + text : text, S.name); S.draft = ''; }); }
      if (!text && !S.pending) { S.err = 'Write the note first.'; paint(); return; }
      act(async () => { await o.api.note(S.v, text, S.pending, S.pendingAt, S.name); S.draft = ''; });
    };
    const cancel = q('[data-cancel]'); if (cancel) cancel.onclick = () => { S.asking = false; paint(); };
    const clear = q('[data-clear]'); if (clear) clear.onclick = () => { S.pending = null; S.pendingAt = null; paint(); };
    const ap = q('[data-approve]'); if (ap) ap.onclick = () => { if (o.needsName && !S.name.trim()) { S.err = 'Add your name so the team knows who approved it.'; paint(); return; } act(() => o.api.decide(true, '', S.name)); };
    const ask = q('[data-ask]'); if (ask) ask.onclick = () => { S.asking = true; paint(); const t = q('[data-body]'); if (t) t.focus(); };
    qa('[data-fix]').forEach(c => c.onchange = () => act(() => o.api.fixed(c.dataset.fix, c.checked)));
    qa('[data-note]').forEach(n => n.onclick = e => { if (e.target.closest('input,button,label')) return; S.hi = S.hi === n.dataset.note ? null : n.dataset.note; paint(); const c = S.comments.find(x => x.id === S.hi); if (c && c.at != null) seek(c.at); });
    qa('[data-pin]').forEach(p => p.onclick = () => { S.hi = p.dataset.pin; paint(); const n = q(`[data-note="${CSS.escape(S.hi)}"]`); if (n) n.scrollIntoView({ block: 'nearest' }); });
    qa('[data-seek]').forEach(b => b.onclick = e => { e.stopPropagation(); seek(+b.dataset.seek); });
    /* Video: play / pause, the progress line with a tick per note, and only the drawings near the current second. */
    const v = q('video[data-v]');
    function seek(t) { if (!v) return; v.pause(); v.currentTime = t; }
    if (v) {
      const play = q('[data-play]'), prog = q('[data-prog]'), time = q('[data-time]'), track = q('[data-track]');
      const near = () => { const t = v.currentTime; qa('[data-sh],[data-pin]').forEach(g => { const at = g.dataset.at; const on = at === '' || Math.abs(+at - t) < 1.2; g.style.display = on ? '' : 'none'; }); };
      v.ontimeupdate = () => { if (v.duration) prog.style.width = `${(v.currentTime / v.duration) * 100}%`; time.textContent = `${mmss(v.currentTime)} / ${mmss(v.duration || 0)}`; near(); };
      v.onloadedmetadata = () => { qa('[data-tick]').forEach(i => { i.style.left = `${Math.min(100, (+i.dataset.tick / (v.duration || 1)) * 100)}%`; }); v.ontimeupdate(); };
      v.onplay = () => { play.textContent = 'Pause'; }; v.onpause = () => { play.textContent = 'Play'; };
      play.onclick = () => (v.paused ? v.play() : v.pause());
      track.onclick = e => { const r = track.getBoundingClientRect(); if (v.duration) seek(((e.clientX - r.left) / r.width) * v.duration); };
      v.onerror = () => { const h = q('.rv-stagecol .rv-hint'); if (h) h.innerHTML = `This video does not play in a browser. <a href="${esc(fileOf(S.v)?.url || '')}" download>Download it</a>, or upload an MP4.`; };
      near();
    }
    /* Drawing. Pointer events on the overlay; the shape is kept in 0..1 of the picture. */
    const ov = q('.rv-stage .rv-ov.draw');
    if (ov) {
      const g = ov.querySelector('[data-pending]');
      if (S.pending) g.innerHTML = shapeSvg(S.pending, 0, true);
      if (S.pending && anchorOf(S.pending)) ov.insertAdjacentHTML('beforeend', `<span class="rv-pin" style="left:${anchorOf(S.pending).x * 100}%;top:${anchorOf(S.pending).y * 100}%;--pc:${COLOR[S.pending.color]}">+</span>`);
      let cur = null;
      const pt = e => { const r = ov.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))].map(n => Math.round(n * 10000) / 10000); };
      ov.onpointerdown = e => {
        if (e.target.closest('[data-pin]')) return;
        e.preventDefault(); ov.setPointerCapture(e.pointerId);
        if (v) { v.pause(); S.pendingAt = Math.round(v.currentTime * 10) / 10; } else S.pendingAt = null;
        const [x, y] = pt(e);
        cur = S.tool === 'pin' ? { tool: 'pin', color: S.color, x, y } : S.tool === 'box' ? { tool: 'box', color: S.color, x, y, w: 0, h: 0, x0: x, y0: y } : S.tool === 'arrow' ? { tool: 'arrow', color: S.color, x, y, x2: x, y2: y } : { tool: S.tool, color: S.color, pts: [[x, y]] };
        g.innerHTML = shapeSvg(cur, 0, true);
      };
      ov.onpointermove = e => {
        if (!cur) return;
        const [x, y] = pt(e);
        if (cur.tool === 'box') { cur.x = Math.min(cur.x0, x); cur.y = Math.min(cur.y0, y); cur.w = Math.abs(x - cur.x0); cur.h = Math.abs(y - cur.y0); }
        else if (cur.tool === 'arrow') { cur.x2 = x; cur.y2 = y; }
        else if (cur.pts) { const l = cur.pts[cur.pts.length - 1]; if (Math.hypot(x - l[0], y - l[1]) > .004) cur.pts.push([x, y]); }
        g.innerHTML = shapeSvg(cur, 0, true);
      };
      ov.onpointerup = () => {
        if (!cur) return;
        const done = cur; cur = null;
        if (done.tool === 'box') { delete done.x0; delete done.y0; if (done.w < .01 || done.h < .01) { g.innerHTML = ''; return; } }
        if (done.tool === 'arrow' && Math.hypot(done.x2 - done.x, done.y2 - done.y) < .02) { g.innerHTML = ''; return; }
        if (done.pts && done.pts.length < 2) { g.innerHTML = ''; return; }
        S.pending = done; S.draft = (q('[data-body]') || {}).value || S.draft || ''; paint();
        const t = q('[data-body]'); if (t) t.focus();
      };
    }
  }
  try { if (o.needsName && !S.name) S.name = localStorage.getItem('rv_name') || ''; } catch {}
  paint();
  return { close, refresh: async () => { await reload(); paint(); } };
}

window.ReviewUI = { open, shapeSvg, anchorOf, COLOR };
})();
