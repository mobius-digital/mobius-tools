/* Locus - the Studio tab (2026-09-26).
 *
 * AI MAKES THE WHOLE AD; PEOPLE FIX ONLY WHAT THEY WANT (Cole's flow):
 *   Make    pick a product, say who it's for, the words, the look and a type style. The image
 *           model draws the finished 4:5 ad with the words in it.
 *   Review  Approve / Edit / Redo / Delete on every ad. Most ads end at Approve.
 *   Edit    the first time only, the worker erases the words (the "plate") and reads where each
 *           line sat. The words come back here as live text boxes on the clean picture: drag,
 *           retype, delete, restyle, add, all free. Anything outside the 1:1 square turns red.
 *           Title art stays part of the picture; changing its words redraws only that.
 *
 * Positions are stored in % of the 4:5 frame (cx, cy = centre) and sizes in % of its width,
 * so the stage, the export and a reopened edit all agree. Own file and closure, like brand.js.
 */
(function () {
'use strict';

const AH_URL = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (() => { try { return localStorage.getItem('pf_ah'); } catch { return null; } })()) || 'https://mobius-account-health.mobius-digital.workers.dev';
const FONTS = ['Anton', 'Bebas Neue', 'Oswald', 'Archivo Black', 'Inter', 'Montserrat', 'Josefin Sans', 'Playfair Display', 'DM Serif Display', 'Permanent Marker', 'Caveat', 'Roboto Condensed'];
const STYLES = [
  ['auto', 'Let the AI pick', 'the typeface that fits this scene'],
  ['bold', 'Bold condensed', 'loud, punchy caps'],
  ['clean', 'Clean modern', 'confident and minimal'],
  ['serif', 'Elegant serif', 'premium, editorial'],
  ['hand', 'Handwritten', 'marker, like a person wrote it'],
  ['luxe', 'Thin luxe', 'wide-spaced light caps'],
  ['native', 'Native social', 'looks like a real post'],
];
const W_OUT = 1080, H_OUT = 1350;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { url: '', tok: '', act: 'all', accounts: [], pick: null, d: null, products: null, prodQ: '', filter: 'review', busy: '', err: '', form: null };

/* ---------------- api ---------------- */
async function api(path, opts = {}) {
  const res = await fetch(S.url.replace(/\/+$/, '') + path, { ...opts, headers: { Authorization: 'Bearer ' + S.tok, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
  return j;
}
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify({ act: S.act, ...b }) });
async function streamCall(base, path, body, onLine) {
  const res = await fetch(base.replace(/\/+$/, '') + path, { method: 'POST', headers: { Authorization: 'Bearer ' + S.tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ act: S.act, ...body }) });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || ('HTTP ' + res.status)); }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; let last = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const ln = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!ln) continue;
      let o; try { o = JSON.parse(ln); } catch { continue; }
      if (o.type === 'ping') continue;
      if (o.type === 'done' || o.type === 'error') last = o;
      onLine(o);
    }
  }
  if (!last) throw new Error('The connection closed before it finished. Try again.');
  if (last.type === 'error') throw new Error(last.text);
  return last;
}
const img = (ad, kind) => `${S.url.replace(/\/+$/, '')}/api/studio/img/${ad.id}/${kind}?v=${ad.v}`;
const shown = ad => img(ad, ad.has_final ? 'final' : 'full');

/* ---------------- styles ---------------- */
function injectCss() {
  if (!document.getElementById('st-fonts')) {
    const l = document.createElement('link');
    l.id = 'st-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?' + ['Anton', 'Bebas+Neue', 'Oswald:wght@400;600;700', 'Archivo+Black', 'Inter:wght@300;400;600;700;800', 'Montserrat:wght@300;400;600;700;800', 'Josefin+Sans:wght@300;400;600;700', 'Playfair+Display:wght@400;700', 'DM+Serif+Display', 'Permanent+Marker', 'Caveat:wght@400;700', 'Roboto+Condensed:wght@300;400;700'].map(f => 'family=' + f).join('&') + '&display=swap';
    document.head.appendChild(l);
  }
  if (document.getElementById('st-css')) return;
  const st = document.createElement('style');
  st.id = 'st-css';
  st.textContent = `
.st{display:flex;flex-direction:column;gap:14px}
.st .card{margin-bottom:0}
.st-h{font-size:15px;font-weight:700;margin:0}
.st-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.st-bar > div{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.st-lbl{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 6px}
.st-f{display:block;font-size:12px;font-weight:700;color:var(--ink-2);min-width:0}
.st-f small{font-weight:500;color:var(--muted);margin-left:4px}
.st-in{display:block;width:100%;margin-top:5px;border:1px solid var(--line-strong);border-radius:8px;padding:8px 10px;font:inherit;font-size:13.5px;font-weight:500;color:var(--ink);background:var(--surface);max-width:none}
.st-in:focus{outline:none;border-color:var(--brand-ink);box-shadow:0 0 0 3px var(--brand-soft)}
textarea.st-in{min-height:60px;resize:vertical;line-height:1.5}
.st-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.st-form .full{grid-column:1/-1}
@media (max-width:700px){.st-form{grid-template-columns:1fr}}
.st-row{display:flex;gap:6px;align-items:flex-end}
.st-row .st-f{flex:1}
.st-chips{display:flex;gap:6px;flex-wrap:wrap}
.st-chip{font:inherit;font-size:12.5px;font-weight:600;padding:6px 11px;border-radius:99px;border:1px solid var(--line);background:var(--surface);color:var(--ink-2);cursor:pointer;text-align:left}
.st-chip small{display:block;font-weight:500;color:var(--muted);font-size:11px}
.st-chip.on{border-color:var(--brand-line);background:var(--brand-tint);color:var(--brand-ink)}
.st-chip .n{color:var(--muted);font-weight:500;margin-left:4px}
.st-msg{font-size:12.5px;color:var(--muted)}
.st-msg.ok{color:var(--good)}.st-msg.bad{color:var(--bad)}
.st-prod{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.st-prod img{width:64px;height:64px;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:8px}
.st-thumbs{display:flex;gap:6px;flex-wrap:wrap}
.st-thumbs button{padding:0;border:2px solid var(--line);border-radius:8px;background:#fff;cursor:pointer;line-height:0}
.st-thumbs button.on{border-color:var(--brand-ink)}
.st-thumbs img{width:52px;height:52px;object-fit:contain;border-radius:6px}
.st-pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;max-height:56vh;overflow:auto;padding:2px}
.st-pgrid button{font:inherit;text-align:left;border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:0;cursor:pointer;overflow:hidden;color:var(--ink)}
.st-pgrid button:hover{border-color:var(--brand-line)}
.st-pgrid img{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;display:block}
.st-pgrid span{display:block;padding:6px 8px;font-size:12px;font-weight:600;line-height:1.3}
.st-board{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
.st-ad{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--surface);display:flex;flex-direction:column}
.st-ad .pic{position:relative;aspect-ratio:4/5;background:var(--line);cursor:zoom-in}
.st-ad .pic img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.st-ad .pic .tag{position:absolute;left:8px;top:8px}
.st-ad .meta{padding:9px 10px;display:grid;gap:7px}
.st-ad .meta b{font-size:12.5px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st-ad .acts{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
.st-ad .acts .btn{padding:6px 4px;font-size:12px;justify-content:center}
.st-tag{display:inline-flex;font-size:11px;font-weight:700;padding:3px 8px;border-radius:99px;background:rgba(12,22,29,.78);color:#fff}
.st-tag.ok{background:var(--good);color:#fff}
.st-tag.edit{background:var(--brand-ink);color:#fff}
.st-empty{padding:26px;text-align:center;color:var(--muted);font-size:13.5px}
.st-busy{display:flex;gap:10px;align-items:center;font-size:13px;color:var(--ink-2)}
.st-spin{width:16px;height:16px;border-radius:50%;border:2px solid var(--line-strong);border-top-color:var(--brand-ink);animation:stspin .8s linear infinite;flex:none}
@keyframes stspin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.st-spin{animation:none}}
/* editor */
.st-ed{position:fixed;inset:0;z-index:60;background:var(--bg);display:flex;flex-direction:column}
.st-ed-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--line);background:var(--surface)}
.st-ed-top > div{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.st-ed-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;padding:16px;overflow:auto}
@media (max-width:860px){.st-ed-body{grid-template-columns:1fr}}
.st-stage-wrap{display:flex;flex-direction:column;align-items:center;gap:8px;min-height:0}
.st-stage{position:relative;height:min(78vh,calc((100vw - 400px) * 1.25));max-height:900px;aspect-ratio:4/5;max-width:100%;background:#111;border-radius:6px;overflow:hidden;container-type:inline-size;user-select:none;touch-action:none}
@media (max-width:860px){.st-stage{height:auto;width:100%}}
.st-stage > img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}
.st-safe{position:absolute;left:0;right:0;height:10%;background:rgba(0,0,0,.45);pointer-events:none;z-index:3}
.st-safe.t{top:0;border-bottom:1px dashed rgba(255,255,255,.7)}.st-safe.b{bottom:0;border-top:1px dashed rgba(255,255,255,.7)}
.st-safe span{position:absolute;left:8px;font-size:10px;font-weight:700;letter-spacing:.08em;color:#fff;opacity:.9}
.st-safe.t span{bottom:4px}.st-safe.b span{top:4px}
.st-box{position:absolute;white-space:pre;line-height:1.05;cursor:move;transform:translate(-50%,-50%);outline:1px dashed rgba(255,255,255,.5);outline-offset:3px;z-index:2}
.st-box.sel{outline:2px solid var(--brand);outline-offset:3px}
.st-box.out{outline:2px solid #F08A7C}
.st-box[contenteditable="true"]{cursor:text}
.st-over[hidden]{display:none}
.st-over{position:absolute;inset:0;z-index:5;display:grid;place-items:center;background:rgba(6,13,18,.55);color:#fff;text-align:center;padding:20px;font-size:14px}
.st-side{display:grid;gap:12px;align-content:start}
.st-side .card{display:grid;gap:10px}
.st-2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.st-in[type=color]{padding:2px;height:36px}
.st-cost{font-size:12.5px;color:var(--muted);display:grid;gap:3px}
.st-sugg{display:grid;gap:5px}
.st-sugg button{font:inherit;font-size:13px;text-align:left;border:1px solid var(--line);border-radius:8px;padding:7px 9px;background:var(--surface);color:var(--ink);cursor:pointer}
.st-sugg button:hover{border-color:var(--brand-line);background:var(--brand-tint)}
.st-zoom{position:fixed;inset:0;z-index:70;background:rgba(6,13,18,.85);display:grid;place-items:center;padding:20px;cursor:zoom-out}
.st-zoom img{max-height:92vh;max-width:92vw;aspect-ratio:4/5;object-fit:cover;border-radius:6px}
`;
  document.head.appendChild(st);
}

/* ---------------- small modal ---------------- */
function modal(title, inner, { cta = 'Save', wide = false, onOpen } = {}) {
  return new Promise(resolve => {
    const w = document.createElement('div');
    w.className = 'modal-wrap';
    w.style.zIndex = 80;
    w.innerHTML = `<div class="modal" style="max-width:${wide ? 860 : 520}px" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>
      <div>${inner}</div><p class="st-msg" data-m="msg" style="margin-top:8px"></p>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" data-m="no">Cancel</button>${cta ? `<button class="btn primary" data-m="yes">${esc(cta)}</button>` : ''}</div></div>`;
    document.body.appendChild(w);
    const done = v => { w.remove(); document.removeEventListener('keydown', k); resolve(v); };
    const k = e => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', k);
    w.addEventListener('mousedown', e => { if (e.target === w) done(null); });
    w.querySelector('[data-m="no"]').onclick = () => done(null);
    const ctl = { root: w, close: done, msg: (t, ok) => { const m = w.querySelector('[data-m="msg"]'); m.textContent = t; m.className = 'st-msg ' + (ok ? 'ok' : 'bad'); } };
    const yes = w.querySelector('[data-m="yes"]');
    if (yes) yes.onclick = async () => { if (!w._submit) return done(true); yes.disabled = true; try { await w._submit(ctl); } catch (e) { ctl.msg(e.message); } yes.disabled = false; };
    w.onSubmit = fn => { w._submit = fn; };
    onOpen?.(w, ctl);
    setTimeout(() => w.querySelector('input,textarea')?.focus(), 30);
  });
}

/* ---------------- entry ---------------- */
async function render({ tok, url, act, accounts, pick }) {
  Object.assign(S, { tok, url, act, accounts: accounts || [], pick });
  injectCss();
  const main = $('#main');
  if (act === 'all') {
    main.innerHTML = `<div class="st"><div><h2>Studio</h2><p class="sub">AI makes the ads, you approve them or fix only what you want. Pick a brand.</p></div>
      <div class="card"><div class="st-chips">${S.accounts.filter(a => a.act_id !== 'all').map(a => `<button class="st-chip" data-act="${esc(a.act_id)}">${esc(a.name)}</button>`).join('')}</div></div></div>`;
    main.querySelectorAll('[data-act]').forEach(b => b.onclick = () => S.pick && S.pick(b.dataset.act));
    return;
  }
  main.innerHTML = `<div class="st"><div class="card"><span class="hint">Loading…</span></div></div>`;
  if (S.form?.act !== act) { S.form = { act, spec: { style: 'auto', cta: 'Shop now', images: [] }, n: 2, sugg: null }; S.products = null; }
  S.d = await api(`/api/studio?act=${encodeURIComponent(act)}`);
  paint();
}
async function reload() { S.d = await api(`/api/studio?act=${encodeURIComponent(S.act)}`); paint(); }

function paint() {
  const main = $('#main'); const d = S.d;
  const y = window.scrollY;
  main.innerHTML = `<div class="st">
    <div class="st-bar"><div style="display:block"><h2>Studio · ${esc(d.account?.name || '')}</h2><p class="sub" style="margin:0">AI makes the whole ad. Approve it, or tap Edit to move, retype or delete any words without making the picture again.</p></div>
      <div>${d.has_key ? `<span class="tiny">This month: $${(d.spent_month || 0).toFixed(2)}</span><button class="btn" id="stKey">Image AI key</button>` : ''}</div></div>
    ${d.has_key ? '' : keyCard()}
    ${d.has_key ? makeCard() : ''}
    ${boardCard()}
  </div>`;
  window.scrollTo(0, y);
  wireKey(); if (d.has_key) wireMake(); wireBoard();
}

/* ---------------- key ---------------- */
function keyCard() {
  return `<div class="card"><h3 class="st-h">Connect the image AI</h3>
    <p class="hint" style="margin:6px 0 10px">Studio uses ChatGPT's image model. It needs an OpenAI API key, set once for every brand. Get one at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com/api-keys</a> (Create new secret key; billing has to be on under Settings, Billing). Paste it here. Locus keeps it on the server and never shows it again.</p>
    <div class="st-row"><label class="st-f">OpenAI API key<input class="st-in" id="stKeyIn" type="password" autocomplete="off" placeholder="sk-..."></label><button class="btn primary" id="stKeySave">Connect</button></div>
    <p class="st-msg" id="stKeyMsg"></p></div>`;
}
function wireKey() {
  const save = $('#stKeySave');
  if (save) save.onclick = async () => {
    const m = $('#stKeyMsg'); m.textContent = 'Checking the key with OpenAI…'; m.className = 'st-msg';
    try { const r = await post('/api/studio/key', { key: $('#stKeyIn').value }); m.textContent = `Connected. Using ${r.image_model}.`; m.className = 'st-msg ok'; setTimeout(reload, 700); }
    catch (e) { m.textContent = e.message; m.className = 'st-msg bad'; }
  };
  const ch = $('#stKey');
  if (ch) ch.onclick = () => modal('Image AI key', `<p class="hint" style="margin:0 0 10px">A key is connected. Paste a new one to replace it, or leave it empty and save to disconnect.</p><label class="st-f">New OpenAI API key<input class="st-in" id="k2" type="password" autocomplete="off" placeholder="sk-..."></label>`, { onOpen: (w, ctl) => w.onSubmit(async () => { await post('/api/studio/key', { key: w.querySelector('#k2').value }); ctl.close(true); reload(); }) });
}

/* ---------------- make ---------------- */
function makeCard() {
  const f = S.form, s = f.spec;
  const prod = s.product ? `<div class="st-prod"><div><b style="font-size:14px">${esc(s.product)}</b><div class="hint" style="margin-top:2px">Photos the AI copies the product from (click to use or skip):</div>
      <div class="st-thumbs" style="margin-top:6px">${(f.allImages || s.images).map(u => `<button data-img="${esc(u)}" class="${s.images.includes(u) ? 'on' : ''}" title="${s.images.includes(u) ? 'Used' : 'Not used'}"><img src="${esc(u)}${u.includes('?') ? '&' : '?'}width=120" alt=""></button>`).join('')}</div></div>
      <button class="btn" id="stProd">Change product</button></div>`
    : `<button class="btn" id="stProd">Choose a product</button> <span class="hint">from the brand's store</span>`;
  const writeBtn = k => `<button class="btn" data-write="${k}" title="The copy desk writes options in the brand's voice">Write for me</button>`;
  const sug = f.sugg ? `<div class="full"><p class="st-lbl">Pick one for the ${f.sugg.field === 'headline' ? 'headline' : 'smaller line'}</p><div class="st-sugg">${f.sugg.lines.map((l, i) => `<button data-sug="${i}">${esc(l)}</button>`).join('')}</div></div>` : '';
  return `<div class="card"><div class="st-bar"><h3 class="st-h">Make ads</h3><span class="tiny">About 25¢ per version</span></div>
    <div class="st-form" style="margin-top:12px">
      <div class="full">${prod}</div>
      <label class="st-f full">Who it's for<small>one real person, so the picture and words speak to them</small><input class="st-in" id="sfWho" value="${esc(s.who || '')}" placeholder="e.g. The 15-handicap who dreads the 40-yard pitch"></label>
      <div class="st-row full"><label class="st-f">Headline<input class="st-in" id="sfHead" value="${esc(s.headline || '')}" placeholder="THE SHOT YOU DREAD."></label>${writeBtn('headline')}</div>
      <div class="st-row full"><label class="st-f">Smaller line<small>optional</small><input class="st-in" id="sfSub" value="${esc(s.subline || '')}" placeholder="Meet the wedge you'll actually trust from 40 yards."></label>${writeBtn('subline')}</div>
      ${sug}
      <label class="st-f">Button<small>optional</small><input class="st-in" id="sfCta" value="${esc(s.cta || '')}" placeholder="Shop now"></label>
      <label class="st-f">Title art<small>optional, for launches: one word drawn as art</small><input class="st-in" id="sfArt" value="${esc(s.art || '')}" placeholder="NIGHTSHADE"></label>
      <label class="st-f full">The look<small>the scene, mood and camera</small><textarea class="st-in" id="sfLook" rows="2" placeholder="Early morning, dew on thick rough, low gold sun, the wedge behind a ball sitting down in the grass">${esc(s.look || '')}</textarea></label>
      <div class="full"><p class="st-lbl">Type style</p><div class="st-chips">${STYLES.map(([k, l, h]) => `<button class="st-chip ${s.style === k ? 'on' : ''}" data-style="${k}">${l}<small>${h}</small></button>`).join('')}</div></div>
      <div class="full st-bar"><div><span class="st-lbl" style="margin:0">Versions</span><div class="st-chips">${[1, 2, 3, 4].map(n => `<button class="st-chip ${f.n === n ? 'on' : ''}" data-n="${n}">${n}</button>`).join('')}</div></div>
        <div>${S.busy ? `<span class="st-busy"><span class="st-spin"></span>${esc(S.busy)}</span>` : ''}<button class="btn primary" id="stMake" ${S.busy ? 'disabled' : ''}>Make ${f.n} ad${f.n > 1 ? 's' : ''}</button></div></div>
      <p class="st-msg bad full" id="stErr">${esc(S.err || '')}</p>
    </div></div>`;
}
function readForm() {
  const s = S.form.spec, v = id => ($('#' + id)?.value || '').trim();
  Object.assign(s, { who: v('sfWho'), headline: v('sfHead'), subline: v('sfSub'), cta: v('sfCta'), art: v('sfArt'), look: v('sfLook') });
}
function wireMake() {
  const f = S.form;
  ['sfWho', 'sfHead', 'sfSub', 'sfCta', 'sfArt', 'sfLook'].forEach(id => { const el = $('#' + id); if (el) el.oninput = readForm; });
  $('#stProd').onclick = pickProduct;
  document.querySelectorAll('[data-img]').forEach(b => b.onclick = () => {
    const u = b.dataset.img, on = f.spec.images.includes(u);
    if (on && f.spec.images.length === 1) return;
    f.spec.images = on ? f.spec.images.filter(x => x !== u) : [...f.spec.images, u].slice(-4);
    readForm(); paint();
  });
  document.querySelectorAll('[data-style]').forEach(b => b.onclick = () => { readForm(); f.spec.style = b.dataset.style; paint(); });
  document.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { readForm(); f.n = +b.dataset.n; paint(); });
  document.querySelectorAll('[data-write]').forEach(b => b.onclick = () => writeFor(b.dataset.write, b));
  document.querySelectorAll('[data-sug]').forEach(b => b.onclick = () => { readForm(); f.spec[f.sugg.field] = f.sugg.lines[+b.dataset.sug]; f.sugg = null; paint(); });
  $('#stMake').onclick = make;
}
async function writeFor(field, btn) {
  readForm();
  const s = S.form.spec;
  btn.disabled = true; btn.textContent = 'Writing…';
  try {
    const brief = [s.product && `Product: ${s.product}.`, s.look && `The picture: ${s.look}.`, field === 'subline' && s.headline && `It sits under the headline "${s.headline}" and is one short supporting line.`, field === 'headline' && 'It is the big headline on a static image ad, a few words.'].filter(Boolean).join(' ');
    const r = await streamCall(AH_URL, '/api/voice/staff/desk', { format: 'Ad headline', brief, audience: s.who || '', n: 5 }, () => {});
    S.form.sugg = { field, lines: (r.lines || []).map(l => l.text).filter(Boolean) };
    S.err = S.form.sugg.lines.length ? '' : 'The copy desk sent nothing back.';
  } catch (e) { S.err = `Copy desk: ${e.message}`; }
  paint();
}
async function pickProduct() {
  readForm();
  if (!S.products) {
    const r = await api(`/api/studio/products?act=${encodeURIComponent(S.act)}`).catch(e => ({ products: [], note: e.message }));
    S.products = r.products || []; S.prodNote = r.note || '';
  }
  modal('Choose a product', `<input class="st-in" id="pq" placeholder="Search products" value="${esc(S.prodQ)}"><div class="st-pgrid" id="pg" style="margin-top:10px"></div>${S.prodNote ? `<p class="hint">${esc(S.prodNote)}</p>` : ''}`, { cta: null, wide: true, onOpen: (w, ctl) => {
    const draw = () => {
      const q = S.prodQ.toLowerCase();
      const list = S.products.filter(p => !q || (p.title + ' ' + p.type).toLowerCase().includes(q));
      w.querySelector('#pg').innerHTML = list.map((p, i) => `<button data-p="${S.products.indexOf(p)}"><img src="${esc(p.images[0])}${p.images[0].includes('?') ? '&' : '?'}width=260" alt="" loading="lazy"><span>${esc(p.title)}</span></button>`).join('') || '<p class="hint">No products match.</p>';
      w.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
        const p = S.products[+b.dataset.p];
        Object.assign(S.form.spec, { product: p.title, product_handle: p.handle, images: p.images.slice(0, 2) });
        S.form.allImages = p.images;
        ctl.close(true); paint();
      });
    };
    w.querySelector('#pq').oninput = e => { S.prodQ = e.target.value; draw(); };
    draw();
  } });
}
async function make() {
  readForm();
  const s = S.form.spec;
  if (!s.images.length) { S.err = 'Choose a product first.'; return paint(); }
  if (!s.headline && !s.art) { S.err = 'Give it a headline (or title art).'; return paint(); }
  S.err = ''; S.busy = 'Starting…'; S.filter = 'review'; paint();
  try {
    await streamCall(S.url, '/api/studio/make', { spec: s, n: S.form.n }, o => {
      if (o.type === 'status') { S.busy = o.text; paint(); }
      if (o.type === 'ad') { S.d.ads.unshift(o.ad); S.busy = `${S.d.ads.filter(a => a.status === 'review').length} ready to review, still making…`; paint(); }
    });
    S.busy = ''; await reload();
  } catch (e) { S.busy = ''; S.err = e.message; paint(); }
}

/* ---------------- board ---------------- */
function boardCard() {
  const ads = S.d.ads || [];
  const n = k => ads.filter(a => a.status === k).length;
  const list = ads.filter(a => a.status === S.filter);
  const tabs = [['review', 'To review'], ['approved', 'Approved'], ['deleted', 'Deleted']];
  return `<div class="card"><div class="st-bar"><h3 class="st-h">Ads</h3><div class="st-chips">${tabs.map(([k, l]) => `<button class="st-chip ${S.filter === k ? 'on' : ''}" data-f="${k}">${l}<span class="n">${n(k)}</span></button>`).join('')}</div></div>
    ${list.length ? `<div class="st-board" style="margin-top:12px">${list.map(adCard).join('')}</div>` : `<div class="st-empty">${S.filter === 'review' ? (S.d.has_key ? 'Nothing waiting. Make some ads above.' : 'Connect the image AI to start.') : 'Nothing here.'}</div>`}</div>`;
}
function adCard(a) {
  const s = a.spec || {};
  const tag = a.status === 'approved' ? '<span class="st-tag ok">Approved</span>' : a.has_final ? '<span class="st-tag edit">Edited</span>' : '';
  const main = a.status === 'deleted'
    ? `<button class="btn" data-restore="${a.id}">Restore</button>`
    : a.status === 'approved' ? `<button class="btn" data-unapprove="${a.id}">Unapprove</button>` : `<button class="btn primary" data-approve="${a.id}">Approve</button>`;
  return `<div class="st-ad"><div class="pic" data-zoom="${a.id}"><img src="${esc(shown(a))}" alt="${esc(s.headline || s.product || 'Ad')}" loading="lazy"><span class="tag">${tag}</span></div>
    <div class="meta"><b title="${esc(s.headline || '')}">${esc(s.headline || s.art || s.product || '')}</b>
      <div class="acts">${main}<button class="btn" data-edit="${a.id}">Edit</button><button class="btn" data-redo="${a.id}" title="A new version of the same idea">Redo</button>${a.status === 'deleted' ? `<button class="btn" data-dl="${a.id}">Save</button>` : `<button class="btn" data-del="${a.id}">Delete</button>`}</div>
      ${a.status !== 'deleted' ? `<button class="btn" data-dl="${a.id}" style="justify-content:center">Download 4:5</button>` : ''}</div></div>`;
}
const adById = id => S.d.ads.find(a => a.id === id);
function wireBoard() {
  document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { S.filter = b.dataset.f; paint(); });
  const setStatus = async (id, status) => { const r = await post('/api/studio/status', { id, status }); Object.assign(adById(id), r.ad); paint(); };
  document.querySelectorAll('[data-approve]').forEach(b => b.onclick = () => setStatus(b.dataset.approve, 'approved'));
  document.querySelectorAll('[data-unapprove]').forEach(b => b.onclick = () => setStatus(b.dataset.unapprove, 'review'));
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => setStatus(b.dataset.del, 'deleted'));
  document.querySelectorAll('[data-restore]').forEach(b => b.onclick = () => setStatus(b.dataset.restore, 'review'));
  document.querySelectorAll('[data-redo]').forEach(b => b.onclick = () => redo(adById(b.dataset.redo)));
  document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openEditor(adById(b.dataset.edit)));
  document.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => download(adById(b.dataset.dl)));
  document.querySelectorAll('[data-zoom]').forEach(p => p.onclick = () => {
    const z = document.createElement('div'); z.className = 'st-zoom';
    z.innerHTML = `<img src="${esc(shown(adById(p.dataset.zoom)))}" alt="">`;
    z.onclick = () => z.remove(); document.body.appendChild(z);
  });
}
async function redo(a) {
  S.busy = 'Making a new version…'; S.err = ''; S.filter = 'review'; paint();
  try {
    await streamCall(S.url, '/api/studio/make', { spec: a.spec, n: 1, parent_id: a.id }, o => { if (o.type === 'ad') { S.d.ads.unshift(o.ad); paint(); } });
    S.busy = ''; await reload();
  } catch (e) { S.busy = ''; S.err = e.message; paint(); }
}

/* ---------------- images ---------------- */
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('Could not load the image.')); i.src = src; });
/* The centred 4:5 window of an image, in its own pixels. */
function crop45(w, h) {
  if (w / h > 0.8) { const cw = h * 0.8; return { x: (w - cw) / 2, y: 0, w: cw, h }; }
  const ch = w / 0.8; return { x: 0, y: (h - ch) / 2, w, h: ch };
}
async function renderPng(base, boxes) {
  const c = document.createElement('canvas'); c.width = W_OUT; c.height = H_OUT;
  const x = c.getContext('2d');
  const r = crop45(base.naturalWidth, base.naturalHeight);
  x.drawImage(base, r.x, r.y, r.w, r.h, 0, 0, W_OUT, H_OUT);
  if (boxes) {
    await Promise.all(boxes.map(b => document.fonts.load(`${b.weight} 40px "${b.font}"`).catch(() => {})));
    for (const b of boxes) {
      const px = b.size / 100 * W_OUT, t = b.upper ? b.text.toUpperCase() : b.text;
      x.save();
      x.translate(b.cx / 100 * W_OUT, b.cy / 100 * H_OUT);
      if (b.rot) x.rotate(b.rot * Math.PI / 180);
      x.font = `${b.weight} ${px}px "${b.font}"`;
      if ('letterSpacing' in x) x.letterSpacing = (b.track * px) + 'px';
      const lines = t.split('\n'), lh = px * 1.05;
      const wMax = Math.max(...lines.map(l => x.measureText(l).width));
      if (b.bg) {
        const pw = wMax + px * 1.2, ph = lh * lines.length + px * 0.7;
        x.fillStyle = b.bg; x.beginPath();
        if (x.roundRect) x.roundRect(-pw / 2, -ph / 2, pw, ph, Math.min(ph / 2, px * 0.9)); else x.rect(-pw / 2, -ph / 2, pw, ph);
        x.fill();
      } else if (b.shadow) { x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = px * 0.35; x.shadowOffsetY = px * 0.05; }
      x.fillStyle = b.color; x.textAlign = 'center'; x.textBaseline = 'middle';
      lines.forEach((l, i) => x.fillText(l, 0, (i - (lines.length - 1) / 2) * lh));
      x.restore();
    }
  }
  return c.toDataURL('image/png');
}
async function download(a) {
  try {
    const src = shown(a);
    const base = await loadImg(src);
    const url = a.has_final ? src : await renderPng(base, null);
    const blob = await (await fetch(url)).blob();
    const o = URL.createObjectURL(blob), l = document.createElement('a');
    l.href = o; l.download = `${(S.d.account?.name || 'ad').replace(/\W+/g, '-')}-${(a.spec?.headline || a.id).replace(/\W+/g, '-').slice(0, 40)}.png`;
    document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(o), 4000);
  } catch (e) { S.err = e.message; paint(); }
}

/* ---------------- editor ---------------- */
const E = { ad: null, boxes: [], sel: null, plate: null, full: null, view: 'edit', sugg: null };

function openEditor(a) {
  E.ad = a; E.boxes = []; E.sel = null; E.view = 'edit'; E.sugg = null;
  const w = document.createElement('div'); w.className = 'st-ed'; w.id = 'stEd';
  w.innerHTML = `<div class="st-ed-top"><div><b>Edit</b><span class="hint">${esc(a.spec?.headline || a.spec?.product || '')}</span></div>
      <div><button class="btn" id="edView">Show the AI original</button><button class="btn" id="edRevert" title="Throw away edits and go back to what the AI made">Start over</button><button class="btn" id="edSave">Save</button><button class="btn primary" id="edApprove">Save and approve</button><button class="btn" id="edClose">Close</button></div></div>
    <div class="st-ed-body"><div class="st-stage-wrap"><div class="st-stage" id="edStage"><img id="edBase" alt=""><div id="edLayer"></div>
        <div class="st-safe t"><span>OUTSIDE 1:1 · KEEP CLEAR</span></div><div class="st-safe b"><span>OUTSIDE 1:1 · KEEP CLEAR</span></div>
        <div class="st-over" id="edOver"><div class="st-busy" style="color:#fff"><span class="st-spin"></span><span id="edOverT">Loading…</span></div></div></div>
      <p class="hint" id="edHint" style="text-align:center">Drag words to move them. Double-click to type. Anything outside the 1:1 square turns red.</p></div>
      <div class="st-side" id="edSide"></div></div>`;
  document.body.appendChild(w);
  document.body.style.overflow = 'hidden';
  const close = () => { w.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', key); paint(); };
  const key = e => {
    if (e.key === 'Escape' && !e.target.isContentEditable) close();
    const b = E.sel; if (!b || e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const step = e.shiftKey ? 2 : 0.4, m = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (m) { e.preventDefault(); b.cx += m[0]; b.cy += m[1]; place(b); check(); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeBox(b); }
  };
  document.addEventListener('keydown', key);
  $('#edClose').onclick = close;
  $('#edView').onclick = () => { E.view = E.view === 'edit' ? 'orig' : 'edit'; showView(); };
  $('#edRevert').onclick = async () => { const r = await post('/api/studio/revert', { id: E.ad.id }); Object.assign(E.ad, r.ad); await setup(); };
  $('#edSave').onclick = () => save(false, close);
  $('#edApprove').onclick = () => save(true, close);
  setup().catch(err => { $('#edOverT').textContent = err.message; });
}

async function setup() {
  const a = E.ad, over = $('#edOver'), ot = $('#edOverT');
  over.hidden = false;
  if (!a.has_plate) {
    ot.textContent = 'Lifting the words off the picture. About 30 seconds, only the first time.';
    const r = await streamCall(S.url, '/api/studio/lift', { id: a.id }, o => { if (o.type === 'status') ot.textContent = o.text; });
    Object.assign(a, r.ad);
    const i = S.d.ads.findIndex(x => x.id === a.id); if (i >= 0) S.d.ads[i] = a;
  }
  ot.textContent = 'Loading…';
  [E.full, E.plate] = await Promise.all([loadImg(img(a, 'full')), loadImg(img(a, 'plate'))]);
  const L = a.layers || {};
  /* Fonts must be loaded BEFORE fromAi measures text, or it sizes against the fallback face. */
  await Promise.all((L.lines || []).map(l => document.fonts.load(`${l.weight || 700} 40px "${FONTS.includes(l.font) ? l.font : 'Inter'}"`).catch(() => {})));
  E.boxes = L.source === 'editor' ? (L.boxes || []).map(b => ({ ...b })) : fromAi(L.lines || []);
  E.art = L.source === 'editor' ? (L.art || []) : (L.art || []);
  E.sel = null; E.view = 'edit';
  await Promise.all([...new Set(E.boxes.map(b => `${b.weight} 40px "${b.font}"`))].map(f => document.fonts.load(f).catch(() => {})));
  over.hidden = true;
  showView();
}

/* AI boxes (0-1000 of the returned image) -> 4:5 frame %, tightened against the plate. */
function fromAi(lines) {
  const W = E.full.naturalWidth, H = E.full.naturalHeight, r = crop45(W, H);
  const diff = diffMap(E.full, E.plate);
  return lines.map(l => {
    let [x0, y0, x1, y1] = l.box.map(v => v / 1000);
    x0 *= W; x1 *= W; y0 *= H; y1 *= H;
    const t = tighten(diff, x0, y0, x1, y1, W, H);
    if (t) ({ x0, y0, x1, y1 } = t);
    const hPx = (y1 - y0) / r.h * H_OUT;
    const upper = !!l.upper, text = l.text;
    const box = {
      text, font: FONTS.includes(l.font) ? l.font : 'Inter', weight: l.weight || 700, upper, track: 0,
      color: /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : '#ffffff', bg: /^#[0-9a-f]{6}$/i.test(l.bg || '') ? l.bg : '',
      shadow: !l.bg, rot: 0, role: l.role,
      cx: ((x0 + x1) / 2 - r.x) / r.w * 100, cy: ((y0 + y1) / 2 - r.y) / r.h * 100,
      size: 10,
    };
    /* Font size: fill the height the letters took (caps ~0.72em, mixed ~0.95em with descenders),
       then shrink to the width they took. */
    const em = hPx / (upper || text === text.toUpperCase() ? 0.74 : 0.95);
    box.size = em / W_OUT * 100;
    const c = document.createElement('canvas').getContext('2d');
    c.font = `${box.weight} ${em}px "${box.font}"`;
    const tw = c.measureText(upper ? text.toUpperCase() : text).width, want = (x1 - x0) / r.w * W_OUT;
    if (tw > want * 1.08) box.size *= want / tw;
    /* Text is centred on its em box, but capitals sit high in it: nudge down so the letters
       land where the AI drew them. */
    const emPx = box.size / 100 * W_OUT;
    box.cy += (upper || text === text.toUpperCase() ? 0.09 : 0.04) * emPx / H_OUT * 100;
    return box;
  });
}
function diffMap(a, b) {
  const w = 320, h = Math.round(320 * a.naturalHeight / a.naturalWidth);
  const ca = document.createElement('canvas'); ca.width = w; ca.height = h;
  const x = ca.getContext('2d', { willReadFrequently: true });
  x.drawImage(a, 0, 0, w, h); const da = x.getImageData(0, 0, w, h).data;
  x.drawImage(b, 0, 0, w, h); const db = x.getImageData(0, 0, w, h).data;
  const m = new Uint8Array(w * h);
  for (let i = 0, p = 0; p < m.length; i += 4, p++) m[p] = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) > 110 ? 1 : 0;
  return { m, w, h };
}
function tighten(d, x0, y0, x1, y1, W, H) {
  const sx = d.w / W, sy = d.h / H;
  const bw = x1 - x0, bh = y1 - y0;
  const X0 = Math.max(0, Math.floor((x0 - bw * 0.15) * sx)), X1 = Math.min(d.w - 1, Math.ceil((x1 + bw * 0.15) * sx));
  const Y0 = Math.max(0, Math.floor((y0 - bh * 0.6) * sy)), Y1 = Math.min(d.h - 1, Math.ceil((y1 + bh * 0.6) * sy));
  /* Grow a band of rows out from the AI's own box and stop at the first empty row, so a
     neighbouring line of text (often only a few pixels away) never joins this one. */
  const rows = []; for (let y = Y0; y <= Y1; y++) { let c = 0; for (let x = X0; x <= X1; x++) c += d.m[y * d.w + x]; rows[y] = c; }
  const oy0 = Math.max(Y0, Math.floor(y0 * sy)), oy1 = Math.min(Y1, Math.ceil(y1 * sy));
  let seed = -1; for (let y = oy0; y <= oy1; y++) if (rows[y] > (seed < 0 ? 0 : rows[seed])) seed = y;
  if (seed < 0) return null;
  let b = seed, e = seed;
  while (b - 1 >= Y0 && rows[b - 1] > 0) b--;
  while (e + 1 <= Y1 && rows[e + 1] > 0) e++;
  let a = 1e9, c = -1, n = 0;
  for (let y = b; y <= e; y++) for (let x = X0; x <= X1; x++) if (d.m[y * d.w + x]) { n++; if (x < a) a = x; if (x > c) c = x; }
  if (n < 12 || c < 0) return null;
  const nx0 = a / sx, nx1 = (c + 1) / sx, ny0 = b / sy, ny1 = (e + 1) / sy;
  const ratio = ((nx1 - nx0) * (ny1 - ny0)) / Math.max(1, bw * bh);
  if (ratio < 0.25 || ratio > 3) return null;
  return { x0: nx0, y0: ny0, x1: nx1, y1: ny1 };
}

function showView() {
  const base = $('#edBase'), layer = $('#edLayer');
  if (!base) return;
  const orig = E.view === 'orig';
  const src = orig ? E.full.src : E.plate.src;
  base.src = src;
  /* The stage is 4:5; object-fit:cover already shows the centred 4:5 window of any size. */
  layer.hidden = orig;
  $('#edView').textContent = orig ? 'Back to my edit' : 'Show the AI original';
  $('#edHint').textContent = orig ? 'This is exactly what the AI made.' : 'Drag words to move them. Double-click to type. Anything outside the 1:1 square turns red.';
  if (!orig) drawBoxes();
  side();
}
function drawBoxes() {
  const layer = $('#edLayer'); layer.innerHTML = '';
  E.boxes.forEach(b => { b.el = document.createElement('div'); b.el.className = 'st-box'; b.el.tabIndex = 0; layer.appendChild(b.el); place(b); bind(b); });
  check();
}
function place(b) {
  const el = b.el; if (!el) return;
  el.textContent = b.upper ? b.text.toUpperCase() : b.text;
  Object.assign(el.style, {
    left: b.cx + '%', top: b.cy + '%', fontFamily: `"${b.font}"`, fontWeight: b.weight, color: b.color, fontSize: b.size + 'cqw',
    letterSpacing: b.track + 'em', background: b.bg || 'transparent', padding: b.bg ? '.35em .6em' : '0', borderRadius: b.bg ? '.9em' : '0',
    textShadow: !b.bg && b.shadow ? '0 .05em .35em rgba(0,0,0,.45)' : 'none', transform: `translate(-50%,-50%) rotate(${b.rot || 0}deg)`,
  });
  el.classList.toggle('sel', b === E.sel);
}
function check() {
  const st = $('#edStage'); if (!st) return;
  const R = st.getBoundingClientRect(); let bad = 0;
  E.boxes.forEach(b => {
    if (!b.el) return;
    const r = b.el.getBoundingClientRect();
    const out = r.top < R.top + R.height * 0.1 - 1 || r.bottom > R.bottom - R.height * 0.1 + 1 || r.left < R.left - 1 || r.right > R.right + 1;
    b.el.classList.toggle('out', out); if (out) bad++;
  });
  E.bad = bad;
  const h = $('#edSafe'); if (h) { h.textContent = bad ? `${bad} line${bad > 1 ? 's' : ''} outside the 1:1 square. Drag back inside the dashed lines.` : 'Everything is inside the 1:1 square.'; h.className = 'st-msg ' + (bad ? 'bad' : 'ok'); }
}
function bind(b) {
  const el = b.el; let start = null;
  el.addEventListener('pointerdown', e => {
    if (E.sel !== b) { E.sel = b; E.boxes.forEach(place); side(); }
    if (el.isContentEditable) return;
    const R = $('#edStage').getBoundingClientRect();
    start = { px: e.clientX, py: e.clientY, cx: b.cx, cy: b.cy, W: R.width, H: R.height };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    if (!start) return;
    b.cx = Math.max(0, Math.min(100, start.cx + (e.clientX - start.px) / start.W * 100));
    b.cy = Math.max(0, Math.min(100, start.cy + (e.clientY - start.py) / start.H * 100));
    place(b); check();
  });
  el.addEventListener('pointerup', () => { start = null; });
  el.addEventListener('dblclick', () => { el.contentEditable = 'true'; el.textContent = b.text; el.focus(); document.getSelection()?.selectAllChildren(el); });
  el.addEventListener('blur', () => { if (!el.isContentEditable) return; el.contentEditable = 'false'; b.text = el.innerText.replace(/\n+$/, ''); place(b); check(); side(); });
  el.addEventListener('keydown', e => { if (el.isContentEditable && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); } });
}
function removeBox(b) { b.el?.remove(); E.boxes = E.boxes.filter(x => x !== b); E.sel = null; check(); side(); }

function side() {
  const el = $('#edSide'); if (!el) return;
  const b = E.sel, a = E.ad;
  const art = (a.spec?.art || '').trim();
  el.innerHTML = `
    <div class="card"><h3 class="st-h">${b ? 'Selected words' : 'Words'}</h3>
      ${b ? `
        <label class="st-f">Words<small>Shift+Enter for a new line</small><textarea class="st-in" id="ebT" rows="2">${esc(b.text)}</textarea></label>
        <div class="st-2"><label class="st-f">Font<select class="st-in" id="ebF">${FONTS.map(f => `<option ${f === b.font ? 'selected' : ''} style="font-family:'${f}'">${f}</option>`).join('')}</select></label>
          <label class="st-f">Weight<select class="st-in" id="ebW">${[300, 400, 600, 700, 800].map(w => `<option ${w === b.weight ? 'selected' : ''}>${w}</option>`).join('')}</select></label></div>
        <label class="st-f">Size<input class="st-in" id="ebS" type="range" min="1.5" max="22" step="0.1" value="${b.size.toFixed(1)}"></label>
        <div class="st-2"><label class="st-f">Color<input class="st-in" id="ebC" type="color" value="${/^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#ffffff'}"></label>
          <label class="st-f">Button color<input class="st-in" id="ebB" type="color" value="${b.bg || '#ffffff'}" ${b.bg ? '' : 'disabled'}></label></div>
        <div class="st-chips">
          <button class="st-chip ${b.upper ? 'on' : ''}" id="ebU">ALL CAPS</button>
          <button class="st-chip ${b.bg ? 'on' : ''}" id="ebP">Button shape</button>
          <button class="st-chip ${b.shadow ? 'on' : ''}" id="ebSh">Shadow</button>
          <button class="st-chip" id="ebSp">Spacing ${b.track ? '+' : ''}${Math.round(b.track * 100)}</button>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" id="ebRw">Rewrite</button><button class="btn" id="ebDup">Duplicate</button><button class="btn" id="ebDel" style="color:var(--bad)">Delete</button></div>
        ${E.sugg ? `<div class="st-sugg">${E.sugg.map((l, i) => `<button data-es="${i}">${esc(l)}</button>`).join('')}</div>` : ''}
      ` : `<p class="hint" style="margin:0">Click any words on the ad to change them.</p>`}
      <button class="btn" id="ebAdd">Add text</button>
      <p class="st-msg" id="edSafe"></p>
    </div>
    ${art ? `<div class="card"><h3 class="st-h">Title art</h3><p class="hint" style="margin:0">"${esc(art)}" is drawn into the picture, so it moves with it. To change the word, the AI redraws only the title (about 25¢).</p>
      <div class="st-row"><label class="st-f">New word<input class="st-in" id="eaTo" value="${esc(art)}"></label><button class="btn" id="eaGo">Redraw</button></div><p class="st-msg" id="eaMsg"></p></div>` : ''}
    <div class="card"><h3 class="st-h">What this ad cost</h3><div class="st-cost"><div>So far: $${(a.cost || 0).toFixed(2)}</div><div>Moving, typing, deleting and restyling here: $0</div></div></div>`;
  check();
  const on = (id, ev, fn) => { const x = el.querySelector('#' + id); if (x) x[ev] = fn; };
  on('ebAdd', 'onclick', () => {
    const nb = { text: 'New text', font: E.boxes[0]?.font || 'Inter', weight: 700, upper: false, track: 0, color: '#ffffff', bg: '', shadow: true, rot: 0, cx: 50, cy: 50, size: 6 };
    E.boxes.push(nb); E.sel = nb; drawBoxes(); side();
  });
  if (art) on('eaGo', 'onclick', async () => {
    const to = el.querySelector('#eaTo').value.trim(), m = el.querySelector('#eaMsg');
    if (!to || to === art) return;
    m.textContent = 'Redrawing the title…'; m.className = 'st-msg';
    try {
      const r = await streamCall(S.url, '/api/studio/art', { id: a.id, to }, o => { if (o.type === 'status') m.textContent = o.text; });
      const keep = E.boxes.map(x => ({ ...x, el: null }));
      Object.assign(E.ad, r.ad);
      await setup();
      if (keep.length) { E.boxes = keep; drawBoxes(); side(); }
    } catch (e) { m.textContent = e.message; m.className = 'st-msg bad'; }
  });
  if (!b) return;
  on('ebT', 'oninput', e => { b.text = e.target.value; place(b); check(); });
  on('ebF', 'onchange', async e => { b.font = e.target.value; await document.fonts.load(`${b.weight} 40px "${b.font}"`).catch(() => {}); place(b); check(); });
  on('ebW', 'onchange', e => { b.weight = +e.target.value; place(b); check(); });
  on('ebS', 'oninput', e => { b.size = +e.target.value; place(b); check(); });
  on('ebC', 'oninput', e => { b.color = e.target.value; place(b); });
  on('ebB', 'oninput', e => { b.bg = e.target.value; place(b); });
  on('ebU', 'onclick', () => { b.upper = !b.upper; place(b); check(); side(); });
  on('ebP', 'onclick', () => { b.bg = b.bg ? '' : '#ffffff'; if (b.bg && b.color.toLowerCase() === '#ffffff') b.color = '#111111'; place(b); check(); side(); });
  on('ebSh', 'onclick', () => { b.shadow = !b.shadow; place(b); side(); });
  on('ebSp', 'onclick', () => { b.track = b.track >= 0.3 ? 0 : Math.round((b.track + 0.1) * 10) / 10; place(b); check(); side(); });
  on('ebDel', 'onclick', () => removeBox(b));
  on('ebDup', 'onclick', () => { const nb = { ...b, el: null, cy: Math.min(88, b.cy + 8) }; E.boxes.push(nb); E.sel = nb; drawBoxes(); side(); });
  on('ebRw', 'onclick', async ev => {
    const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Writing…';
    const s = a.spec || {};
    try {
      const r = await streamCall(AH_URL, '/api/voice/staff/desk', { format: 'Ad headline', brief: `Rewrite this line from a static image ad: "${b.text}". Keep about the same length so it fits the same space. Product: ${s.product || ''}. The picture: ${s.look || ''}.`, audience: s.who || '', n: 5 }, () => {});
      E.sugg = (r.lines || []).map(l => l.text).filter(Boolean);
    } catch (e) { E.sugg = null; alertIn(e.message); }
    side();
  });
  el.querySelectorAll('[data-es]').forEach(x => x.onclick = () => { b.text = E.sugg[+x.dataset.es]; E.sugg = null; place(b); check(); side(); });
}
function alertIn(t) { const m = $('#edSafe'); if (m) { m.textContent = t; m.className = 'st-msg bad'; } }

async function save(approve, close) {
  const btns = document.querySelectorAll('#stEd .st-ed-top .btn'); btns.forEach(x => x.disabled = true);
  try {
    const boxes = E.boxes.map(({ el, ...rest }) => rest);
    const png = await renderPng(E.plate, boxes);
    const r = await post('/api/studio/save', { id: E.ad.id, png, approve, layers: { source: 'editor', boxes, art: E.art || [] } });
    const i = S.d.ads.findIndex(x => x.id === E.ad.id); if (i >= 0) S.d.ads[i] = r.ad;
    close();
  } catch (e) { btns.forEach(x => x.disabled = false); alertIn(e.message); }
}

window.StudioTab = { render };
})();
