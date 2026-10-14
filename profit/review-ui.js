/* REVIEW VIEWER (rebuilt 2026-10-14 from the approved "Review redesign" mock, artboard B). Full screen, like Frame.io:
 * every ad of the test in a strip at the bottom (arrow keys move between them), the ad in the middle with the drawing
 * tools floating over it (Note = click to drop a pin, Box, Arrow, Pen, Highlight, four colours), notes on the right that
 * thread, resolve and filter (Open / Resolved / All), versions and Compare in the top bar, and the call per ad:
 * Approve vN / Ask for changes, then the call shown with Change (reopen). Used by Locus (prodsheet.js) and by the public
 * review link (review.html); it only talks through the callbacks it is given.
 *   ReviewUI.open({ title, num, format, formatColor, mode: 'team'|'client'|'guest', needsName,
 *     ads: [{ ad, label, status: 'review'|'changes'|'approved', by, files: [versions, oldest first] }],
 *     startAd, start: a version id | 'compare', comments, canDecide: bool | (ad) => bool,
 *     api: { note(fileId, body, shape, at, name, parentId), decide(ok, body, fileId, name, reset), fixed(id, on), share(), reload() } })
 *   reload() returns { ads, comments, canDecide }.
 * Drawings are stored in 0..1 of the picture, so they land on the same spot at any size. Own closure, CSS #rv-css,
 * classes .rv-*, tokens only. */
(() => {
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COLOR = { coral: 'var(--bad)', yellow: 'var(--warn)', blue: 'var(--brand)', green: 'var(--good)' };
const TOOLS = [['pin', 'Note (click the ad)', 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z'], ['box', 'Box', 'M4 5h16v14H4z'],
  ['arrow', 'Arrow', 'M5 19 19 5M9 5h10v10'], ['pen', 'Pen', 'M3 17c3-6 6 2 9-4s6-2 9-6'], ['mark', 'Highlight', 'M4 15h16']];
const ic = (d, w = 18, sw = 1.8) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const I = { left: 'm15 6-6 6 6 6', right: 'm9 6 6 6-6 6', x: 'M6 6l12 12M18 6 6 18', undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3', play: 'M8 5v14l11-7z', pause: 'M7 5h3v14H7zM14 5h3v14h-3z' };
const mmss = s => s == null || !isFinite(s) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const when = iso => { if (!iso) return ''; const t = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : String(iso).replace(' ', 'T') + 'Z'); return t ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; };
const STATUS = { review: ['Needs review', 'var(--warn)'], changes: ['Changes asked', 'var(--bad)'], approved: ['Approved', 'var(--good)'] };

function css() {
  if (document.getElementById('rv-css')) return;
  const s = document.createElement('style'); s.id = 'rv-css';
  s.textContent = `
.rv-scrim{position:fixed;inset:0;z-index:9600;background:var(--bg);color:var(--ink);display:flex;flex-direction:column;font-size:13px}
.rv-h{height:60px;flex:0 0 60px;display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid var(--line);background:var(--surface);min-width:0}
.rv-h .sp{flex:1;min-width:8px}
.rv-who{display:flex;flex-direction:column;min-width:0;padding:0 6px}
.rv-who b{font-size:15px;font-weight:700;color:var(--ink);white-space:nowrap}
.rv-who span{font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px}
.rv-btn{height:34px;padding:0 14px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--ink);font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.rv-btn:hover{border-color:var(--muted)}
.rv-btn.ic{width:34px;padding:0}
.rv-btn.on{background:var(--ink);color:var(--surface);border-color:var(--ink)}
.rv-btn.pri{background:var(--brand);border-color:var(--brand);color:var(--surface)}
.rv-btn.ok{background:var(--good);border-color:var(--good);color:var(--surface)}
.rv-btn:disabled{opacity:.5;cursor:default}
.rv-btn:focus-visible,.rv-tool:focus-visible,.rv-thumb:focus-visible,.rv-chip:focus-visible,.rv-link:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.rv-st{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:999px;font-size:12px;font-weight:700;color:var(--sc);background:color-mix(in srgb,var(--sc) 14%,transparent);white-space:nowrap}
.rv-st i{width:7px;height:7px;border-radius:50%;background:currentColor}
.rv-tag{font-size:11px;padding:2px 7px;border-radius:4px;font-weight:600;white-space:nowrap;color:var(--tc,var(--muted));background:color-mix(in srgb,var(--tc,var(--muted)) 14%,transparent)}
.rv-b{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 380px}
.rv-main{display:flex;flex-direction:column;min-width:0;min-height:0}
.rv-stage{flex:1;min-height:0;position:relative;display:flex;align-items:center;justify-content:center;gap:24px;padding:24px 24px 84px;overflow:hidden}
.rv-media{position:relative;display:inline-block;line-height:0;box-shadow:0 18px 50px rgba(0,0,0,.35);border-radius:6px;overflow:hidden;background:var(--surface-2)}
.rv-media img,.rv-media video{display:block;max-width:100%;max-height:calc(100vh - 290px);object-fit:contain}
.rv-cmpcol{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:0;flex:1}
.rv-cmpcol .lab{font-size:12px;font-weight:700;color:var(--ink-2)}
.rv-cmpcol .rv-media img,.rv-cmpcol .rv-media video{max-height:calc(100vh - 260px)}
.rv-ov{position:absolute;inset:0;touch-action:none}
.rv-ov.draw{cursor:crosshair}
.rv-ov svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.rv-pin{position:absolute;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50% 50% 50% 4px;color:var(--surface);background:var(--pc);font-size:11px;font-weight:800;line-height:24px;text-align:center;pointer-events:auto;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35)}
.rv-pin.hi{box-shadow:0 0 0 3px var(--ink)}
.rv-bar{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:5px;border-radius:12px;background:var(--surface);border:1px solid var(--line-strong);box-shadow:0 10px 30px rgba(0,0,0,.3)}
.rv-tool{width:38px;height:38px;border-radius:8px;border:0;background:transparent;color:var(--ink-2);cursor:pointer;display:flex;align-items:center;justify-content:center}
.rv-tool:hover{background:var(--surface-2)}
.rv-tool.on{background:var(--ink);color:var(--surface)}
.rv-sw{width:20px;height:20px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0;background:var(--sc)}
.rv-sw.on{border-color:var(--ink)}
.rv-sep{width:1px;height:22px;background:var(--line-strong);margin:0 6px}
.rv-play{display:flex;align-items:center;gap:12px;padding:0 24px 14px}
.rv-track{flex:1;height:6px;background:var(--line-strong);border-radius:3px;position:relative;cursor:pointer}
.rv-track b{position:absolute;top:0;left:0;height:6px;border-radius:3px;background:var(--brand)}
.rv-track i{position:absolute;top:-5px;width:16px;height:16px;margin-left:-8px;border-radius:50% 50% 50% 4px;background:var(--pc,var(--warn));color:var(--surface);font-size:9px;font-weight:800;font-style:normal;display:flex;align-items:center;justify-content:center;cursor:pointer}
.rv-time{font-size:12px;color:var(--ink);font-variant-numeric:tabular-nums;min-width:86px}
.rv-strip{flex:0 0 108px;border-top:1px solid var(--line);background:var(--surface);display:flex;align-items:center;gap:10px;padding:0 16px;overflow-x:auto}
.rv-thumb{width:64px;height:80px;flex:0 0 64px;border-radius:6px;border:2px solid transparent;cursor:pointer;padding:0;position:relative;overflow:hidden;background:var(--surface-2)}
.rv-thumb.on{border-color:var(--ink)}
.rv-thumb img,.rv-thumb video{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
.rv-thumb .l{position:absolute;top:3px;left:4px;font-size:9.5px;font-weight:800;color:var(--ink);background:var(--surface);border-radius:3px;padding:0 3px}
.rv-thumb i{position:absolute;bottom:4px;right:4px;width:9px;height:9px;border-radius:50%;background:var(--sc);box-shadow:0 0 0 2px var(--surface)}
.rv-keys{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted);white-space:nowrap;margin-left:auto}
.rv-kbd{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 4px;border-radius:4px;border:1px solid var(--line-strong);font-size:10.5px;font-weight:600;color:var(--ink-2)}
.rv-side{border-left:1px solid var(--line);background:var(--surface);display:flex;flex-direction:column;min-height:0}
.rv-tabs{display:flex;gap:20px;padding:0 18px;border-bottom:1px solid var(--line)}
.rv-tab{height:44px;border:0;background:transparent;color:var(--muted);font:inherit;font-size:13px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;display:inline-flex;align-items:center;gap:6px}
.rv-tab.on{color:var(--ink);border-bottom-color:var(--brand)}
.rv-chips{display:flex;gap:6px;padding:12px 18px 4px}
.rv-chip{height:26px;padding:0 10px;border-radius:999px;border:1px solid var(--line-strong);background:transparent;color:var(--ink-2);font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.rv-chip.on{background:var(--ink);color:var(--surface);border-color:var(--ink)}
.rv-list{flex:1;min-height:0;overflow:auto;padding:10px 18px;display:flex;flex-direction:column;gap:10px}
.rv-note{border:1px solid var(--line);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;background:var(--bg);cursor:pointer}
.rv-note.hi{border-color:var(--brand)}
.rv-note.res{opacity:.7}
.rv-note .hd{display:flex;align-items:center;gap:8px;min-width:0}
.rv-note .hd b{color:var(--ink);font-weight:600}
.rv-note .hd .w{font-size:12px;color:var(--muted)}
.rv-note .n{width:20px;height:20px;flex:0 0 20px;border-radius:50% 50% 50% 4px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:var(--surface);background:var(--pc)}
.rv-note .tx{color:var(--ink);line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.rv-note .acts{display:flex;gap:14px}
.rv-rep{display:flex;gap:8px;padding-left:12px;border-left:2px solid var(--line-strong);flex-direction:column}
.rv-rep .hd{font-size:12px}
.rv-rep .tx{font-size:12.5px;color:var(--ink-2)}
.rv-link{font:inherit;font-size:12px;font-weight:600;color:var(--muted);background:none;border:0;padding:0;cursor:pointer}
.rv-link:hover{color:var(--ink)}
.rv-at{font-size:11px;font-weight:700;color:var(--warn);margin-left:auto;cursor:pointer;background:none;border:0;padding:0;font-family:inherit}
.rv-sys{font-size:12px;color:var(--muted);font-style:italic;padding:2px 2px}
.rv-empty{color:var(--muted);text-align:center;line-height:1.55;padding:28px 8px}
.rv-ver{display:flex;gap:10px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:8px;background:var(--bg);cursor:pointer;text-align:left;font:inherit;color:inherit}
.rv-ver.on{border-color:var(--brand)}
.rv-ver .th{width:44px;height:55px;border-radius:4px;overflow:hidden;background:var(--surface-2);flex:0 0 44px}
.rv-ver .th img{width:100%;height:100%;object-fit:cover;display:block}
.rv-box{padding:14px 18px 16px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:8px}
.rv-box label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--muted)}
.rv-box textarea,.rv-box input,.rv-rbox textarea{font:inherit;font-size:13px;color:var(--ink);background:var(--bg);border:1px solid var(--line-strong);border-radius:8px;padding:9px 10px;width:100%;box-sizing:border-box;resize:none;line-height:1.45}
.rv-box textarea{min-height:72px;field-sizing:content;max-height:30vh}
.rv-box .row{display:flex;align-items:center;gap:8px}
.rv-pend{font-size:11.5px;font-weight:600;color:var(--pc);background:color-mix(in srgb,var(--pc) 14%,transparent);border-radius:999px;padding:3px 9px;display:inline-flex;gap:6px;align-items:center}
.rv-pend button{font:inherit;font-size:11.5px;color:inherit;background:none;border:0;padding:0;cursor:pointer;text-decoration:underline}
.rv-hint{font-size:11.5px;color:var(--muted)}
.rv-err{color:var(--bad);font-size:12.5px}
.rv-rbox{display:flex;flex-direction:column;gap:6px}
.rv-rbox .row{display:flex;gap:8px;justify-content:flex-end}
@media (max-width:900px){
  .rv-b{display:flex;flex-direction:column;overflow:auto}
  .rv-main,.rv-side{flex:none}
  .rv-tool{width:32px;height:34px}.rv-sw{width:18px;height:18px}.rv-sep{margin:0 3px}.rv-bar{max-width:calc(100vw - 16px);gap:2px}
  .rv-side{border-left:0;border-top:1px solid var(--line)}
  .rv-stage{min-height:62vh;padding:16px 12px 76px}
  .rv-media img,.rv-media video{max-height:56vh}
  .rv-keys,.rv-who span{display:none}
  .rv-h{height:auto;flex-wrap:wrap;padding:8px 10px;gap:8px}
  .rv-list{overflow:visible}
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
  const S = { ads: o.ads || [], comments: o.comments || [], i: 0, v: null, cmp: false, tool: 'pin', color: 'coral', pending: null, pendingAt: null,
    asking: false, hi: null, busy: false, err: '', filter: 'open', tab: 'notes', reply: null, draft: '', name: o.name || '', canDecide: o.canDecide };
  try { if (o.needsName && !S.name) S.name = localStorage.getItem('rv_name') || ''; } catch {}
  const team = o.mode === 'team';
  const AD = () => S.ads[S.i] || null;
  const vers = () => (AD() ? AD().files : []).slice().sort((a, b) => (a.version || 0) - (b.version || 0));
  const latest = () => vers().slice(-1)[0] || null;
  const fileOf = id => vers().find(f => f.id === id) || null;
  const cur = () => fileOf(S.v) || latest();
  const canDecide = () => typeof S.canDecide === 'function' ? !!S.canDecide(AD()) : !!S.canDecide;
  const goAd = (i, start) => {
    if (!S.ads.length) return;
    S.i = (i + S.ads.length) % S.ads.length; S.cmp = false; S.pending = null; S.pendingAt = null; S.asking = false; S.hi = null; S.reply = null; S.err = '';
    const f = start && start !== 'compare' && vers().find(x => x.id === start);
    S.v = f ? f.id : (latest() || {}).id || null;
    S.cmp = start === 'compare' && vers().length > 1;
  };
  const si = Math.max(0, S.ads.findIndex(a => a.ad === o.startAd || (o.start && a.files.some(f => f.id === o.start))));
  goAd(si, o.start);

  const w = document.createElement('div'); w.className = 'rv-scrim'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true'); w.setAttribute('aria-label', `Review ${o.title || ''}`);
  document.body.appendChild(w);
  const prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
  const close = () => { w.remove(); document.removeEventListener('keydown', key); document.body.style.overflow = prevOverflow; o.onClose && o.onClose(); };
  const typing = e => e.target.closest && e.target.closest('textarea,input,[contenteditable]');
  const key = e => {
    if (e.key === 'Escape') { if (typing(e)) { e.target.blur(); return; } close(); return; }
    if (typing(e)) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { const b = w.querySelector(e.target.closest('.rv-rbox') ? '[data-rsend]' : '[data-post]'); if (b) { e.preventDefault(); b.click(); } } return; }
    if (e.key === 'ArrowRight' && S.ads.length > 1) { e.preventDefault(); goAd(S.i + 1); paint(); }
    else if (e.key === 'ArrowLeft' && S.ads.length > 1) { e.preventDefault(); goAd(S.i - 1); paint(); }
    else if (e.key === 'n' || e.key === 'N') { const t = w.querySelector('[data-body]'); if (t) { e.preventDefault(); t.focus(); } }
    else if (e.key === ' ') { const v = w.querySelector('video[data-v]'); if (v) { e.preventDefault(); v.paused ? v.play() : v.pause(); } }
  };
  document.addEventListener('keydown', key);

  const isNote = c => !c.parent_id && ['note', 'change_request'].includes(c.kind);
  const notesOf = fid => S.comments.filter(c => c.file_id === fid && isNote(c));
  const repliesOf = id => S.comments.filter(c => c.parent_id === id);
  const callsOf = fid => S.comments.filter(c => c.file_id === fid && ['approval', 'reopen'].includes(c.kind));

  const media = (f, notes, draw) => {
    if (!f) return `<div class="rv-empty">No version yet. ${team ? 'Upload it on the card\'s Files tab.' : 'Mobius has not uploaded this ad yet.'}</div>`;
    const el = f.video ? `<video src="${esc(f.url)}" preload="metadata" playsinline data-v></video>` : `<img src="${esc(f.url)}" alt="${esc(f.name || 'The ad')}" draggable="false">`;
    const pins = notes.map((c, k) => { const a = anchorOf(c.shape); return a && !c.fixed ? `<span class="rv-pin${S.hi === c.id ? ' hi' : ''}" data-pin="${esc(c.id)}" data-at="${c.at ?? ''}" style="left:${a.x * 100}%;top:${a.y * 100}%;--pc:${COLOR[c.shape.color] || COLOR.coral}">${k + 1}</span>` : ''; }).join('');
    const svgs = notes.filter(c => !c.fixed).map(c => `<g data-sh="${esc(c.id)}" data-at="${c.at ?? ''}">${shapeSvg(c.shape, 0, true)}</g>`).join('');
    return `<div class="rv-media" data-file="${esc(f.id)}">${el}<div class="rv-ov${draw ? ' draw' : ''}"><svg viewBox="0 0 1 1" preserveAspectRatio="none">${svgs}<g data-pending></g></svg>${pins}</div></div>`;
  };

  const headHtml = () => {
    const a = AD(), f = cur(), vs = vers(), L = latest();
    const st = STATUS[(a && a.status) || 'review'];
    const seg = vs.map(x => `<button type="button" class="rv-btn${!S.cmp && f && x.id === f.id ? ' on' : ''}" data-ver="${esc(x.id)}">v${x.version}${x === L ? ' (latest)' : ''}</button>`).join('')
      + (vs.length > 1 ? `<button type="button" class="rv-btn${S.cmp ? ' on' : ''}" data-cmp>Compare</button>` : '');
    const oldVersion = f && L && f.id !== L.id;
    const call = !a || !L ? '' : a.status === 'review'
      ? (canDecide() && !S.cmp && !oldVersion ? `<button type="button" class="rv-btn" data-ask${S.busy ? ' disabled' : ''}>Ask for changes</button><button type="button" class="rv-btn ok" data-approve${S.busy ? ' disabled' : ''}>Approve v${L.version}</button>` : `<span class="rv-st" style="--sc:${st[1]}"><i></i>${st[0]}</span>`)
      : `<span class="rv-st" style="--sc:${st[1]}" title="${esc(a.by ? `${st[0]} by ${a.by}` : st[0])}"><i></i>${st[0]}${a.by ? ` · ${esc(a.by)}` : ''}</span>${canDecide() || team ? `<button type="button" class="rv-btn" data-reopen${S.busy ? ' disabled' : ''}>Change</button>` : ''}`;
    return `<div class="rv-h">
      <button type="button" class="rv-btn" data-close aria-label="Close the review">${ic(I.left, 15, 2.2)}${esc(o.num || 'Back')}</button>
      ${S.ads.length > 1 ? `<button type="button" class="rv-btn ic" data-prev aria-label="Previous ad">${ic(I.left, 15, 2.2)}</button>` : ''}
      <div class="rv-who"><b>${esc(a ? a.label : 'The ad')}</b><span>${S.ads.length > 1 ? `${S.i + 1} of ${S.ads.length} · ` : ''}${esc(o.title || '')}</span></div>
      ${S.ads.length > 1 ? `<button type="button" class="rv-btn ic" data-next aria-label="Next ad">${ic(I.right, 15, 2.2)}</button>` : ''}
      ${o.format ? `<span class="rv-tag" style="--tc:${o.formatColor || 'var(--brand)'}">${esc(o.format)}</span>` : ''}
      ${vs.length ? `<div role="group" aria-label="Version" style="display:flex;gap:4px;margin-left:6px">${seg}</div>` : ''}
      <span class="sp"></span>
      ${team && o.api.share ? '<button type="button" class="rv-btn" data-share>Copy client link</button>' : ''}
      ${call}
      <button type="button" class="rv-btn ic" data-close aria-label="Close">${ic(I.x, 15, 2.2)}</button>
    </div>`;
  };

  const stageHtml = () => {
    const f = cur(), vs = vers();
    if (S.cmp && vs.length > 1) {
      const a = vs[vs.length - 2], b = vs[vs.length - 1];
      return `<div class="rv-stage"><div class="rv-cmpcol"><span class="lab">v${a.version} with its notes</span>${media(a, notesOf(a.id), false)}</div><div class="rv-cmpcol"><span class="lab">v${b.version} (latest)</span>${media(b, [], false)}</div></div>`;
    }
    const notes = f ? notesOf(f.id) : [];
    return `<div class="rv-stage">${media(f, notes, true)}
      ${f ? `<div class="rv-bar" role="toolbar" aria-label="Mark up">${TOOLS.map(([k, l, d]) => `<button type="button" class="rv-tool${S.tool === k ? ' on' : ''}" data-tool="${k}" aria-label="${l}" title="${l}" aria-pressed="${S.tool === k}">${ic(d)}</button>`).join('')}
        <span class="rv-sep"></span>${Object.keys(COLOR).map(k => `<button type="button" class="rv-sw${S.color === k ? ' on' : ''}" style="--sc:${COLOR[k]}" data-color="${k}" aria-label="${k}" aria-pressed="${S.color === k}"></button>`).join('')}
        <span class="rv-sep"></span><button type="button" class="rv-tool" data-clear aria-label="Remove the drawing"${S.pending ? '' : ' disabled'}>${ic(I.undo)}</button></div>` : ''}
    </div>
    ${f && f.video ? `<div class="rv-play"><button type="button" class="rv-btn ic" data-play aria-label="Play or pause">${ic(I.play, 14, 2)}</button><span class="rv-time" data-time>0:00 / 0:00</span>
      <div class="rv-track" data-track><b data-prog></b>${notes.filter(c => c.at != null && !c.fixed).map((c, k) => `<i data-tick="${c.at}" data-seek="${c.at}" style="--pc:${c.shape ? COLOR[c.shape.color] : 'var(--warn)'}" title="Note ${k + 1} at ${mmss(c.at)}">${k + 1}</i>`).join('')}</div></div>` : ''}`;
  };

  const stripHtml = () => `<div class="rv-strip" role="group" aria-label="Every ad in this test">
    ${S.ads.map((a, k) => { const L = a.files.slice().sort((x, y) => (x.version || 0) - (y.version || 0)).slice(-1)[0]; const st = STATUS[a.status] || STATUS.review;
      return `<button type="button" class="rv-thumb${k === S.i ? ' on' : ''}" data-ad="${k}" aria-label="${esc(a.label)}, ${st[0].toLowerCase()}" title="${esc(a.label)}: ${st[0]}">${L ? (L.video ? `<video src="${esc(L.url)}#t=0.5" muted preload="metadata"></video>` : `<img src="${esc(L.url)}" alt="" loading="lazy">`) : ''}<span class="l">${esc(a.ad || 'Ad')}</span><i style="--sc:${st[1]}"></i></button>`; }).join('')}
    <div class="rv-keys">${S.ads.length > 1 ? '<span class="rv-kbd">&#8592;</span><span class="rv-kbd">&#8594;</span> ads' : ''}<span class="rv-kbd" style="margin-left:8px">N</span> note${vers().some(f => f.video) ? '<span class="rv-kbd" style="margin-left:8px">Space</span> play' : ''}<span class="rv-kbd" style="margin-left:8px">Esc</span> close</div>
  </div>`;

  const sideHtml = () => {
    const f = cur(), a = AD();
    const all = f ? notesOf(f.id) : [];
    const open = all.filter(c => !c.fixed), res = all.filter(c => c.fixed);
    const shown = S.filter === 'open' ? open : S.filter === 'resolved' ? res : all;
    const noteHtml = c => {
      const k = all.indexOf(c) + 1;
      const reps = repliesOf(c.id);
      return `<div class="rv-note${S.hi === c.id ? ' hi' : ''}${c.fixed ? ' res' : ''}" data-note="${esc(c.id)}">
        <div class="hd"><span class="n" style="--pc:${c.shape ? COLOR[c.shape.color] || COLOR.coral : 'var(--muted)'}">${k}</span><b>${esc(c.who)}</b><span class="w">${esc(when(c.created_at))}</span>${c.kind === 'change_request' ? '<span class="rv-tag" style="--tc:var(--bad)">Changes asked</span>' : ''}${c.at != null ? `<button type="button" class="rv-at" data-seek="${c.at}">${mmss(c.at)}</button>` : ''}</div>
        <div class="tx">${esc(c.body)}</div>
        ${reps.map(r => `<div class="rv-rep"><div class="hd"><b>${esc(r.who)}</b> <span class="w">${esc(when(r.created_at))}</span></div><div class="tx">${esc(r.body)}</div></div>`).join('')}
        ${S.reply === c.id ? `<div class="rv-rbox"><textarea rows="2" data-rbody aria-label="Reply" placeholder="Reply to ${esc(c.who)}"></textarea><div class="row"><button type="button" class="rv-btn" data-rcancel>Cancel</button><button type="button" class="rv-btn pri" data-rsend="${esc(c.id)}">Reply</button></div></div>`
          : `<div class="acts"><button type="button" class="rv-link" data-reply="${esc(c.id)}">Reply</button>${team ? `<button type="button" class="rv-link" data-fix="${esc(c.id)}" data-on="${c.fixed ? '0' : '1'}">${c.fixed ? 'Open again' : 'Resolve'}</button>` : c.fixed ? '<span class="rv-hint">Resolved</span>' : ''}</div>`}
      </div>`;
    };
    const calls = f ? callsOf(f.id).map(c => `<div class="rv-sys">${esc(c.body)} ${esc(c.who)}, ${esc(when(c.created_at))}</div>`).join('') : '';
    const notesTab = `<div class="rv-chips" role="group" aria-label="Show">${[['open', `Open ${open.length}`], ['resolved', `Resolved ${res.length}`], ['all', 'All']].map(([k, l]) => `<button type="button" class="rv-chip${S.filter === k ? ' on' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
      <div class="rv-list">${S.cmp ? '<div class="rv-empty">Comparing the last two versions. Pick a version to read or add notes.</div>' : shown.map(noteHtml).join('') || `<div class="rv-empty">${all.length ? 'Nothing here with this filter.' : f ? 'No notes on this version yet. Pick a tool and draw on the ad, or click it to drop a note.' : ''}</div>`}${S.cmp ? '' : calls}</div>`;
    const versTab = `<div class="rv-list">${vers().slice().reverse().map(x => `<button type="button" class="rv-ver${f && x.id === f.id && !S.cmp ? ' on' : ''}" data-ver="${esc(x.id)}"><span class="th">${x.video ? '' : `<img src="${esc(x.url)}" alt="" loading="lazy">`}</span><span style="display:flex;flex-direction:column;gap:2px;min-width:0"><b style="font-weight:600">v${x.version}${x === latest() ? ' (latest)' : ''}</b><span class="rv-hint">${esc([x.by, when(x.created_at)].filter(Boolean).join(', '))}</span><span class="rv-hint">${notesOf(x.id).length} note${notesOf(x.id).length === 1 ? '' : 's'}</span></span></button>`).join('')}</div>`;
    const box = S.cmp || !f ? '' : `<div class="rv-box">
      ${o.needsName ? `<label>Your name<input data-name maxlength="60" value="${esc(S.name)}" autocomplete="name"></label>` : ''}
      <label>${S.asking ? `What needs to change on ${esc(a ? a.label : 'the ad')} (required)` : `Note on ${esc(a ? a.ad || 'the ad' : 'the ad')} v${f.version}${S.pendingAt != null ? ` at ${mmss(S.pendingAt)}` : ''}`}<textarea data-body rows="3" placeholder="${S.pending ? 'Say what to change here.' : 'Click the ad to place a note, or just type'}"></textarea></label>
      ${S.err ? `<div class="rv-err">${esc(S.err)}</div>` : ''}
      <div class="row">${S.pending ? `<span class="rv-pend" style="--pc:${COLOR[S.pending.color]}">${S.pending.tool === 'pin' ? 'Pin' : S.pending.tool === 'mark' ? 'Highlight' : S.pending.tool[0].toUpperCase() + S.pending.tool.slice(1)} attached <button type="button" data-clear>Remove</button></span>` : ''}
        <span style="flex:1"></span><span class="rv-hint">Ctrl+Enter</span>
        ${S.asking ? '<button type="button" class="rv-btn" data-cancel>Cancel</button>' : ''}<button type="button" class="rv-btn pri" data-post${S.busy ? ' disabled' : ''}>${S.asking ? 'Send back' : 'Post'}</button></div></div>`;
    return `<aside class="rv-side" aria-label="Notes">
      <div class="rv-tabs" role="tablist"><button type="button" role="tab" class="rv-tab${S.tab === 'notes' ? ' on' : ''}" aria-selected="${S.tab === 'notes'}" data-tab="notes">Notes <span class="rv-hint">${open.length}</span></button><button type="button" role="tab" class="rv-tab${S.tab === 'versions' ? ' on' : ''}" aria-selected="${S.tab === 'versions'}" data-tab="versions">Versions <span class="rv-hint">${vers().length}</span></button></div>
      ${S.tab === 'notes' ? notesTab : versTab}${box}</aside>`;
  };

  const paint = () => {
    const keepList = (w.querySelector('.rv-list') || {}).scrollTop || 0;
    w.innerHTML = `${headHtml()}<div class="rv-b"><div class="rv-main">${stageHtml()}${S.ads.length ? stripHtml() : ''}</div>${sideHtml()}</div>`;
    const l = w.querySelector('.rv-list'); if (l) l.scrollTop = keepList;
    wire();
  };

  const reload = async () => {
    if (!o.api.reload) return;
    const r = await o.api.reload();
    if (!r) return;
    const keepAd = (AD() || {}).ad, keepV = S.v;
    if (r.ads) S.ads = r.ads;
    if (r.comments) S.comments = r.comments;
    if (r.canDecide != null) S.canDecide = r.canDecide;
    const k = S.ads.findIndex(a => a.ad === keepAd);
    if (k >= 0) S.i = k;
    if (!fileOf(keepV)) S.v = (latest() || {}).id || null;
  };
  const act = async (fn, after) => {
    S.busy = true; S.err = ''; paint();
    try { await fn(); S.pending = null; S.pendingAt = null; S.asking = false; S.reply = null; S.draft = ''; await reload(); if (after) after(); }
    catch (e) { S.err = e.message || 'That did not save. Try again.'; }
    S.busy = false; paint();
  };
  const needName = () => { if (o.needsName && !String(S.name || '').trim()) { S.err = 'Add your name so the team knows who wrote it.'; paint(); const n = w.querySelector('[data-name]'); if (n) n.focus(); return true; } return false; };

  function wire() {
    const q = s => w.querySelector(s), qa = s => [...w.querySelectorAll(s)];
    qa('[data-close]').forEach(b => b.onclick = close);
    const pv = q('[data-prev]'); if (pv) pv.onclick = () => { goAd(S.i - 1); paint(); };
    const nx = q('[data-next]'); if (nx) nx.onclick = () => { goAd(S.i + 1); paint(); };
    qa('[data-ad]').forEach(b => b.onclick = () => { goAd(+b.dataset.ad); paint(); });
    qa('[data-ver]').forEach(b => b.onclick = () => { S.v = b.dataset.ver; S.cmp = false; S.pending = null; S.hi = null; paint(); });
    const cm = q('[data-cmp]'); if (cm) cm.onclick = () => { S.cmp = !S.cmp; S.pending = null; paint(); };
    qa('[data-tool]').forEach(b => b.onclick = () => { S.tool = b.dataset.tool; paint(); });
    qa('[data-color]').forEach(b => b.onclick = () => { S.color = b.dataset.color; paint(); });
    qa('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; paint(); });
    qa('[data-filter]').forEach(b => b.onclick = () => { S.filter = b.dataset.filter; paint(); });
    const share = q('[data-share]'); if (share) share.onclick = async () => { try { const u = await o.api.share(); await navigator.clipboard.writeText(u).catch(() => {}); share.textContent = 'Link copied'; setTimeout(() => { share.textContent = 'Copy client link'; }, 2500); } catch (e) { share.textContent = e.message || 'Could not make the link'; } };
    const nameIn = q('[data-name]'); if (nameIn) nameIn.oninput = () => { S.name = nameIn.value; try { localStorage.setItem('rv_name', S.name); } catch {} };
    const body = q('[data-body]');
    if (body) { body.value = S.draft || ''; body.oninput = () => { S.draft = body.value; }; }
    const post = q('[data-post]');
    if (post) post.onclick = () => {
      const text = (body.value || '').trim(), f = cur();
      if (needName()) return;
      if (S.asking) {
        if (!text) { S.err = 'Say what needs to change.'; paint(); return; }
        return act(async () => { if (S.pending) await o.api.note(f.id, text, S.pending, S.pendingAt, S.name); await o.api.decide(false, S.pending ? 'See the note on the ad: ' + text : text, (latest() || {}).id, S.name); }, () => { if (o.onDecide) o.onDecide(false); });
      }
      if (!text && !S.pending) { S.err = 'Write the note first.'; paint(); return; }
      act(() => o.api.note(f.id, text, S.pending, S.pendingAt, S.name));
    };
    const cancel = q('[data-cancel]'); if (cancel) cancel.onclick = () => { S.asking = false; S.err = ''; paint(); };
    qa('[data-clear]').forEach(b => b.onclick = () => { S.pending = null; S.pendingAt = null; paint(); });
    const ap = q('[data-approve]'); if (ap) ap.onclick = () => { if (needName()) return; act(() => o.api.decide(true, '', (latest() || {}).id, S.name), () => { if (o.onDecide) o.onDecide(true); const nxt = S.ads.findIndex((a, k) => k !== S.i && a.status === 'review'); if (nxt >= 0) goAd(nxt); }); };
    const ask = q('[data-ask]'); if (ask) ask.onclick = () => { S.asking = true; S.tab = 'notes'; paint(); const t = q('[data-body]'); if (t) t.focus(); };
    const ro = q('[data-reopen]'); if (ro) ro.onclick = () => { if (needName()) return; act(() => o.api.decide(null, '', (latest() || {}).id, S.name, true)); };
    qa('[data-fix]').forEach(b => b.onclick = e => { e.stopPropagation(); act(() => o.api.fixed(b.dataset.fix, b.dataset.on === '1')); });
    qa('[data-reply]').forEach(b => b.onclick = e => { e.stopPropagation(); S.reply = b.dataset.reply; paint(); const t = q('[data-rbody]'); if (t) t.focus(); });
    const rc = q('[data-rcancel]'); if (rc) rc.onclick = e => { e.stopPropagation(); S.reply = null; paint(); };
    const rs = q('[data-rsend]'); if (rs) rs.onclick = e => { e.stopPropagation(); const t = (q('[data-rbody]') || {}).value || ''; if (!t.trim()) return; if (needName()) return; const pid = rs.dataset.rsend; act(() => o.api.note(cur().id, t.trim(), null, null, S.name, pid)); };
    qa('[data-note]').forEach(n => n.onclick = e => { if (e.target.closest('button,textarea,input')) return; S.hi = S.hi === n.dataset.note ? null : n.dataset.note; const c = S.comments.find(x => x.id === S.hi); paint(); if (c && c.at != null) seek(c.at); });
    qa('[data-pin]').forEach(p => p.onclick = () => { S.hi = p.dataset.pin; S.tab = 'notes'; const c = S.comments.find(x => x.id === S.hi); if (c && c.fixed) S.filter = 'all'; paint(); const n = q(`[data-note="${CSS.escape(S.hi)}"]`); if (n) n.scrollIntoView({ block: 'nearest' }); });
    qa('[data-seek]').forEach(b => b.onclick = e => { e.stopPropagation(); seek(+b.dataset.seek); });
    /* Video: play / pause, the timeline with a numbered mark per note, and only the drawings near the current second. */
    const v = q('video[data-v]');
    function seek(t) { if (!v) return; v.pause(); v.currentTime = t; }
    if (v) {
      const play = q('[data-play]'), prog = q('[data-prog]'), time = q('[data-time]'), track = q('[data-track]');
      const near = () => { const t = v.currentTime; qa('[data-sh],[data-pin]').forEach(g => { const at = g.dataset.at; g.style.display = at === '' || Math.abs(+at - t) < 1.2 ? '' : 'none'; }); };
      v.ontimeupdate = () => { if (v.duration) prog.style.width = `${(v.currentTime / v.duration) * 100}%`; time.textContent = `${mmss(v.currentTime)} / ${mmss(v.duration)}`; near(); };
      v.onloadedmetadata = () => { qa('[data-tick]').forEach(i => { i.style.left = `${Math.min(100, (+i.dataset.tick / (v.duration || 1)) * 100)}%`; }); v.ontimeupdate(); };
      v.onplay = () => { play.innerHTML = ic(I.pause, 14, 2); }; v.onpause = () => { play.innerHTML = ic(I.play, 14, 2); };
      play.onclick = () => (v.paused ? v.play() : v.pause());
      track.onclick = e => { if (e.target.closest('[data-tick]')) return; const r = track.getBoundingClientRect(); if (v.duration) seek(((e.clientX - r.left) / r.width) * v.duration); };
      v.onerror = () => { const t = q('.rv-play'); if (t) t.insertAdjacentHTML('beforeend', `<span class="rv-err">This video does not play in a browser. <a href="${esc((cur() || {}).url || '')}" download>Download it</a>, or upload an MP4.</span>`); };
      near();
    }
    /* Drawing: pointer events on the overlay; the shape is kept in 0..1 of the picture. */
    const ov = q('.rv-stage .rv-ov.draw');
    if (ov) {
      const g = ov.querySelector('[data-pending]');
      if (S.pending) g.innerHTML = shapeSvg(S.pending, 0, true);
      if (S.pending && anchorOf(S.pending)) ov.insertAdjacentHTML('beforeend', `<span class="rv-pin" style="left:${anchorOf(S.pending).x * 100}%;top:${anchorOf(S.pending).y * 100}%;--pc:${COLOR[S.pending.color]}">+</span>`);
      let d = null;
      const pt = e => { const r = ov.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))].map(n => Math.round(n * 10000) / 10000); };
      ov.onpointerdown = e => {
        if (e.target.closest('[data-pin]')) return;
        e.preventDefault(); ov.setPointerCapture(e.pointerId);
        if (v) { v.pause(); S.pendingAt = Math.round(v.currentTime * 10) / 10; } else S.pendingAt = null;
        const [x, y] = pt(e);
        d = S.tool === 'pin' ? { tool: 'pin', color: S.color, x, y } : S.tool === 'box' ? { tool: 'box', color: S.color, x, y, w: 0, h: 0, x0: x, y0: y } : S.tool === 'arrow' ? { tool: 'arrow', color: S.color, x, y, x2: x, y2: y } : { tool: S.tool, color: S.color, pts: [[x, y]] };
        g.innerHTML = shapeSvg(d, 0, true);
      };
      ov.onpointermove = e => {
        if (!d) return;
        const [x, y] = pt(e);
        if (d.tool === 'box') { d.x = Math.min(d.x0, x); d.y = Math.min(d.y0, y); d.w = Math.abs(x - d.x0); d.h = Math.abs(y - d.y0); }
        else if (d.tool === 'arrow') { d.x2 = x; d.y2 = y; }
        else if (d.pts) { const l = d.pts[d.pts.length - 1]; if (Math.hypot(x - l[0], y - l[1]) > .004) d.pts.push([x, y]); }
        g.innerHTML = shapeSvg(d, 0, true);
      };
      ov.onpointerup = () => {
        if (!d) return;
        const done = d; d = null;
        if (done.tool === 'box') { delete done.x0; delete done.y0; if (done.w < .01 || done.h < .01) { g.innerHTML = ''; return; } }
        if (done.tool === 'arrow' && Math.hypot(done.x2 - done.x, done.y2 - done.y) < .02) { g.innerHTML = ''; return; }
        if (done.pts && done.pts.length < 2) { g.innerHTML = ''; return; }
        S.pending = done; S.draft = (q('[data-body]') || {}).value || S.draft || ''; S.tab = 'notes'; paint();
        const t = q('[data-body]'); if (t) t.focus();
      };
    }
  }
  paint();
  return { close, refresh: async () => { await reload(); paint(); } };
}

window.ReviewUI = { open, shapeSvg, anchorOf, COLOR, STATUS };
})();
