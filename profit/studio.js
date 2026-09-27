/* Locus - the Studio tab (v2, 2026-09-27: batches).
 *
 * Studio works the way the team briefs (Cole's Mobius framework: Angle, Concept, What We're
 * Testing). One BATCH = one test with numbered lines, and Studio makes ONE AD PER LINE:
 *   1. Brief    from Asana (the brief Google Doc is opened for you), pasted, or a whole plan
 *               (BFCM) that becomes many batches. Angle, why, concept, testing, lines.
 *   2. Setup    the product (the AI copies it from the real photos, and every ad is checked
 *               against them and redone once if it looks off), a swipe file for the batch,
 *               and "make it look like this" inspiration on any line.
 *   3. Plan     the art director (account-health /api/studio-ai/plan, the brand's copy skill)
 *               writes each ad: words, look, type style, which inspiration and how closely.
 *               Editable. Nothing is spent on images until Make.
 *   4. Make     testing concepts or looks = genuinely different ads. Testing a piece inside a
 *               concept (headlines, offer...) = line 1 is made, the rest are EDITS of it that
 *               change only the words, so it is a clean test.
 *   5. Review   Approve / Change with AI (an instruction redraws only that change) / Redo /
 *               Delete / Download, then Send to Canva (a folder, one design per ad).
 * The first version's in-Studio text editor is gone on purpose (Cole: retyped text did not
 * match the AI's lettering and the erase was slow). Moving pieces by hand happens in Canva.
 */
(function () {
'use strict';

const AH_URL = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (() => { try { return localStorage.getItem('pf_ah'); } catch { return null; } })()) || 'https://mobius-account-health.mobius-digital.workers.dev';
const TESTING = [['concepts', 'Concepts', 'different ideas'], ['headlines', 'Headlines', 'same ad, new words'], ['visuals', 'Looks', 'same words, new looks'], ['offer', 'Offer', 'same ad, offer framing'], ['reviews', 'Reviews', 'same ad, review quote'], ['hooks', 'Hooks', 'the opening line'], ['copy', 'Copy', 'the body words'], ['format', 'Format', 'layout type']];
const STYLES = [['auto', 'AI picks'], ['bold', 'Bold condensed'], ['clean', 'Clean modern'], ['serif', 'Elegant serif'], ['hand', 'Handwritten'], ['luxe', 'Thin luxe'], ['native', 'Native social']];
const PER_AD = 0.27;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { url: '', tok: '', act: 'all', accounts: [], pick: null, d: null, cur: null, products: null, prodQ: '', busy: '', err: '', making: '' };

/* ---------------- api ---------------- */
async function api(path, opts = {}) {
  const res = await fetch(S.url.replace(/\/+$/, '') + path, { ...opts, headers: { Authorization: 'Bearer ' + S.tok, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
  return j;
}
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify({ act: S.act, ...b }) });
async function streamCall(base, path, body, onLine = () => {}) {
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
const thumb = u => u + (/cdn\.shopify\.com/.test(u) ? (u.includes('?') ? '&' : '?') + 'width=160' : '');

/* ---------------- styles ---------------- */
function injectCss() {
  if (document.getElementById('st-css2')) return;
  document.getElementById('st-css')?.remove();
  const st = document.createElement('style');
  st.id = 'st-css2';
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
.st-in:disabled{opacity:.55}
textarea.st-in{min-height:44px;resize:vertical;line-height:1.45}
.st-g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
@media (max-width:760px){.st-g2{grid-template-columns:1fr}}
.st-chips{display:flex;gap:6px;flex-wrap:wrap}
.st-chip{font:inherit;font-size:12.5px;font-weight:600;padding:6px 11px;border-radius:99px;border:1px solid var(--line);background:var(--surface);color:var(--ink-2);cursor:pointer;text-align:left}
.st-chip small{display:block;font-weight:500;color:var(--muted);font-size:11px}
.st-chip.on{border-color:var(--brand-line);background:var(--brand-tint);color:var(--brand-ink)}
.st-msg{font-size:12.5px;color:var(--muted);margin:0}
.st-msg.ok{color:var(--good)}.st-msg.bad{color:var(--bad)}
.st-layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:14px;align-items:start}
@media (max-width:980px){.st-layout{grid-template-columns:1fr}.st-list{max-height:190px}}
.st-list{display:flex;flex-direction:column;gap:4px;max-height:75vh;overflow:auto}
.st-li{font:inherit;text-align:left;border:1px solid transparent;border-radius:9px;background:transparent;padding:8px 10px;cursor:pointer;color:var(--ink);display:grid;gap:2px}
.st-li:hover{background:var(--brand-tint)}
.st-li.on{border-color:var(--brand-line);background:var(--brand-tint)}
.st-li b{font-size:13px;line-height:1.3}
.st-li span{font-size:11.5px;color:var(--muted)}
.st-step{display:flex;gap:10px;align-items:center}
.st-step .n{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;background:var(--brand-tint);color:var(--brand-ink);flex:none}
.st-line{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:8px;align-items:start;padding:8px 0;border-top:1px solid var(--line)}
.st-line:first-child{border-top:0}
.st-line .k{font-weight:700;color:var(--muted);padding-top:9px;text-align:right}
.st-thumbs{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.st-thumbs button.t{padding:0;border:2px solid var(--line);border-radius:8px;background:#fff;cursor:pointer;line-height:0;position:relative}
.st-thumbs button.t.on{border-color:var(--brand-ink)}
.st-thumbs img{width:52px;height:52px;object-fit:cover;border-radius:6px}
.st-x{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:var(--ink);color:var(--surface);font-size:11px;line-height:18px;text-align:center;cursor:pointer}
.st-add{font:inherit;width:52px;height:52px;border:1.5px dashed var(--line-strong);border-radius:8px;display:grid;place-items:center;font-size:10.5px;color:var(--muted);cursor:pointer;background:transparent;text-align:center;line-height:1.2;padding:2px}
.st-plan{display:grid;gap:10px}
.st-prow{border:1px solid var(--line);border-radius:10px;padding:10px;display:grid;gap:8px}
.st-prow .top{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}
.st-g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
@media (max-width:760px){.st-g3{grid-template-columns:1fr}}
.st-pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;max-height:56vh;overflow:auto;padding:2px}
.st-pgrid button{font:inherit;text-align:left;border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:0;cursor:pointer;overflow:hidden;color:var(--ink)}
.st-pgrid img{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;display:block}
.st-pgrid span{display:block;padding:6px 8px;font-size:12px;font-weight:600;line-height:1.3}
.st-board{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.st-ad{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--surface);display:flex;flex-direction:column}
.st-ad .pic{position:relative;aspect-ratio:4/5;background:var(--line);cursor:zoom-in}
.st-ad .pic img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.st-ad .tags{position:absolute;left:8px;top:8px;right:8px;display:flex;gap:5px;flex-wrap:wrap}
.st-ad .meta{padding:9px 10px;display:grid;gap:7px}
.st-ad .meta b{font-size:12.5px;line-height:1.3}
.st-ad .acts{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
.st-ad .acts .btn{padding:6px 4px;font-size:12px;justify-content:center}
.st-tag{display:inline-flex;font-size:11px;font-weight:700;padding:3px 8px;border-radius:99px;background:rgba(12,22,29,.78);color:#fff}
.st-tag.ok{background:#1C7A46;color:#fff}
.st-tag.warn{background:#8F6412;color:#fff}
.st-empty{padding:26px;text-align:center;color:var(--muted);font-size:13.5px}
.st-busy{display:inline-flex;gap:8px;align-items:center;font-size:13px;color:var(--ink-2)}
.st-spin{width:15px;height:15px;border-radius:50%;border:2px solid var(--line-strong);border-top-color:var(--brand-ink);animation:stspin .8s linear infinite;flex:none}
@keyframes stspin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.st-spin{animation:none}}
.st-zoom{position:fixed;inset:0;z-index:70;background:rgba(6,13,18,.85);display:grid;place-items:center;padding:20px;cursor:zoom-out}
.st-zoom img{max-height:92vh;max-width:92vw;object-fit:contain;border-radius:6px}
.st-pick{max-height:52vh;overflow:auto;display:grid;gap:6px;padding:2px}
.st-pick label{display:grid;grid-template-columns:20px 48px minmax(0,1fr) auto;gap:10px;align-items:center;font-size:13.5px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;cursor:pointer;text-align:left;margin:0;width:auto;font-weight:500;color:var(--ink)}
.st-pick label:hover{border-color:var(--brand-line);background:var(--brand-tint)}
.st-pick label:has(input:checked){border-color:var(--brand-ink);background:var(--brand-tint)}
.st-pick input[type=checkbox]{width:18px;height:18px;margin:0;padding:0;flex:none;accent-color:var(--brand-ink)}
.st-pick .num{font-weight:700;color:var(--brand-ink);font-variant-numeric:tabular-nums}
.st-pick .ttl{font-weight:600;line-height:1.3}
.st-pick .tiny{white-space:nowrap}
@media (max-width:520px){.st-pick label{grid-template-columns:20px 42px minmax(0,1fr)}.st-pick .tiny{display:none}}
.st-ol{margin:6px 0 0;padding-left:20px;display:grid;gap:6px;font-size:13.5px}
.st-code{font-family:ui-monospace,Consolas,monospace;font-size:12px;background:var(--brand-tint);padding:2px 6px;border-radius:5px;word-break:break-all}
`;
  document.head.appendChild(st);
}

/* ---------------- small modal ---------------- */
function modal(title, inner, { cta = 'Save', wide = false, onOpen } = {}) {
  return new Promise(resolve => {
    const w = document.createElement('div');
    w.className = 'modal-wrap';
    w.style.zIndex = 80;
    w.innerHTML = `<div class="modal" style="max-width:${wide ? 880 : 560}px" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>
      <div>${inner}</div><p class="st-msg" data-m="msg" style="margin-top:8px"></p>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" data-m="no">${cta ? 'Cancel' : 'Close'}</button>${cta ? `<button class="btn primary" data-m="yes">${esc(cta)}</button>` : ''}</div></div>`;
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
    setTimeout(() => w.querySelector('textarea,input:not([type=checkbox])')?.focus(), 30);
  });
}

/* ---------------- entry ---------------- */
async function render({ tok, url, act, accounts, pick }) {
  Object.assign(S, { tok, url, act, accounts: accounts || [], pick });
  injectCss();
  const main = $('#main');
  if (act === 'all') {
    main.innerHTML = `<div class="st"><div><h2>Studio</h2><p class="sub">Batches of ads made with AI, straight from the brief. Pick a brand.</p></div>
      <div class="card"><div class="st-chips">${S.accounts.filter(a => a.act_id !== 'all').map(a => `<button class="st-chip" data-act="${esc(a.act_id)}">${esc(a.name)}</button>`).join('')}</div></div></div>`;
    main.querySelectorAll('[data-act]').forEach(b => b.onclick = () => S.pick && S.pick(b.dataset.act));
    return;
  }
  main.innerHTML = `<div class="st"><div class="card"><span class="hint">Loading…</span></div></div>`;
  if (S.lastAct !== act) { S.cur = null; S.products = null; S.lastAct = act; }
  await reload();
}
async function reload() {
  S.d = await api(`/api/studio?act=${encodeURIComponent(S.act)}`);
  if (S.cur && S.cur.id !== 'loose') S.cur = S.d.batches.find(b => b.id === S.cur.id) || null;
  paint();
}
const adsOf = b => (S.d.ads || []).filter(a => b ? a.batch_id === b.id : !a.batch_id);
const live = ads => ads.filter(a => a.status !== 'deleted');

function paint() {
  const main = $('#main'), d = S.d, y = window.scrollY;
  const loose = live(adsOf(null));
  main.innerHTML = `<div class="st">
    <div class="st-bar"><div style="display:block"><h2>Studio · ${esc(d.account?.name || '')}</h2><p class="sub" style="margin:0">Make a batch straight from the brief: one ad per line, the product checked against the real photos, then send it to Canva.</p></div>
      <div>${d.has_key ? `<span class="tiny">This month: $${(d.spent_month || 0).toFixed(2)}</span><button class="btn" id="stKey">Image AI key</button>` : ''}<button class="btn" id="stCanva">${d.canva?.connected ? 'Canva connected' : 'Connect Canva'}</button></div></div>
    ${d.has_key ? '' : keyCard()}
    <div class="st-layout">
      <div class="card" style="padding:12px"><div class="st-bar" style="margin-bottom:8px"><h3 class="st-h">Batches</h3><button class="btn primary" id="stNew">New batch</button></div>
        <div class="st-list">${(d.batches || []).map(b => `<button class="st-li ${S.cur?.id === b.id ? 'on' : ''}" data-b="${b.id}"><b>${b.num ? `#${esc(b.num)} · ` : ''}${esc(b.name || b.brief?.angle || 'Untitled batch')}</b><span>${esc(testingLabel(b.brief?.testing))} · ${(b.brief?.lines || []).length} lines · ${live(adsOf(b)).length} ads</span></button>`).join('') || '<p class="st-msg">No batches yet.</p>'}
          ${loose.length ? `<button class="st-li ${S.cur?.id === 'loose' ? 'on' : ''}" data-b="loose"><b>Earlier ads</b><span>${loose.length} made before batches</span></button>` : ''}</div></div>
      <div id="stMain" class="st">${S.cur?.id === 'loose' ? looseView(loose) : S.cur ? batchView(S.cur) : startView()}</div>
    </div></div>`;
  window.scrollTo(0, y);
  wireTop();
  if (S.cur?.id === 'loose') wireAds();
  else if (S.cur) wireBatch();
  else wireStart();
}
const testingLabel = k => (TESTING.find(t => t[0] === k) || [0, 'Concepts'])[1] + ' test';

/* ---------------- key + canva ---------------- */
function keyCard() {
  return `<div class="card"><h3 class="st-h">Connect the image AI</h3>
    <p class="hint" style="margin:6px 0 10px">Studio uses ChatGPT's image model. Paste an OpenAI API key (platform.openai.com/api-keys, with billing on). Locus keeps it on the server and never shows it again.</p>
    <div style="display:flex;gap:8px;align-items:flex-end"><label class="st-f" style="flex:1">OpenAI API key<input class="st-in" id="stKeyIn" type="password" autocomplete="off" placeholder="sk-..."></label><button class="btn primary" id="stKeySave">Connect</button></div>
    <p class="st-msg" id="stKeyMsg"></p></div>`;
}
function wireTop() {
  const save = $('#stKeySave');
  if (save) save.onclick = async () => {
    const m = $('#stKeyMsg'); m.textContent = 'Checking the key with OpenAI…'; m.className = 'st-msg';
    try { await post('/api/studio/key', { key: $('#stKeyIn').value }); await reload(); }
    catch (e) { m.textContent = e.message; m.className = 'st-msg bad'; }
  };
  const k = $('#stKey');
  if (k) k.onclick = () => modal('Image AI key', `<p class="hint" style="margin:0 0 10px">A key is connected. Paste a new one to replace it, or leave it empty and save to disconnect.</p><label class="st-f">New OpenAI API key<input class="st-in" id="k2" type="password" autocomplete="off" placeholder="sk-..."></label>`, { onOpen: (w, ctl) => w.onSubmit(async () => { await post('/api/studio/key', { key: w.querySelector('#k2').value }); ctl.close(true); reload(); }) });
  $('#stCanva').onclick = canvaSetup;
  $('#stNew').onclick = () => newBatch();
  document.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { S.cur = b.dataset.b === 'loose' ? { id: 'loose' } : S.d.batches.find(x => x.id === b.dataset.b); S.err = ''; paint(); });
}
function canvaSetup() {
  const c = S.d.canva || {};
  const redirect = `${S.url.replace(/\/+$/, '')}/api/studio/canva/callback`;
  modal('Connect Canva', `
    <p class="hint" style="margin:0 0 8px">Once this is set up, "Send to Canva" puts a whole batch into a Canva folder, one design per ad, ready for Grab Text and Magic Grab. About 10 minutes, once.</p>
    ${c.configured ? `<p class="st-msg ok" style="margin-bottom:8px">The Canva app is saved${c.connected ? ' and connected' : '. Click Connect Canva to sign in'}.</p>` : ''}
    <ol class="st-ol">
      <li>Open <a href="https://www.canva.com/developers/integrations" target="_blank" rel="noopener">canva.com/developers/integrations</a> and click <b>Create an integration</b> (Private if Canva offers it). Name it "Locus Studio".</li>
      <li><b>Scopes</b>: tick read and write for <b>asset</b>, <b>design content</b> and <b>folder</b>, and read for <b>design meta</b>.</li>
      <li><b>Authentication</b>: add this redirect URL: <span class="st-code">${esc(redirect)}</span></li>
      <li><b>Configuration</b>: copy the <b>Client ID</b>, click <b>Generate secret</b>, and paste both here.</li>
    </ol>
    <div class="st-g2" style="margin-top:10px"><label class="st-f">Client ID<input class="st-in" id="cvId" autocomplete="off" placeholder="OC-..."></label><label class="st-f">Client secret<input class="st-in" id="cvSecret" type="password" autocomplete="off"></label></div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn" id="cvSave">Save the app</button><button class="btn primary" id="cvGo" ${c.configured ? '' : 'disabled'}>Connect Canva</button>${c.configured ? '<button class="btn" id="cvOff">Disconnect</button>' : ''}</div>`,
  { cta: null, onOpen: (w, ctl) => {
    w.querySelector('#cvSave').onclick = async () => {
      try { await post('/api/studio/canva/setup', { client_id: w.querySelector('#cvId').value, client_secret: w.querySelector('#cvSecret').value }); S.d.canva = { configured: true, connected: false }; w.querySelector('#cvGo').disabled = false; ctl.msg('Saved. Now click Connect Canva.', true); }
      catch (e) { ctl.msg(e.message); }
    };
    w.querySelector('#cvGo').onclick = async () => {
      try { const r = await api(`/api/studio/canva/start?act=${encodeURIComponent(S.act)}`); window.open(r.url, '_blank', 'noopener'); ctl.msg('Finish signing in to Canva in the new tab, then refresh this page.', true); }
      catch (e) { ctl.msg(e.message); }
    };
    const off = w.querySelector('#cvOff');
    if (off) off.onclick = async () => { await post('/api/studio/canva/setup', { client_id: '' }); ctl.close(); reload(); };
  } });
}

/* ---------------- start / new batch ---------------- */
function startView() {
  return `<div class="card"><h3 class="st-h">Start a batch</h3>
    <p class="hint" style="margin:6px 0 12px">A batch is one test: the angle, what you're testing, and numbered lines. Studio makes one ad per line.</p>
    <div class="st-chips"><button class="st-chip" data-start="asana"><b>From Asana</b><small>pick the brief your team already wrote</small></button><button class="st-chip" data-start="paste"><b>Paste a brief or a plan</b><small>one brief, or a whole BFCM doc for many batches</small></button><button class="st-chip" data-start="blank"><b>Start blank</b><small>type the angle and lines here</small></button></div></div>`;
}
function wireStart() { document.querySelectorAll('[data-start]').forEach(b => b.onclick = () => newBatch(b.dataset.start)); }
async function newBatch(mode = null) {
  if (mode === 'blank') return saveNew([{ name: 'New batch', angle: '', why: '', concept: '', testing: 'concepts', lines: [{ text: '' }, { text: '' }, { text: '' }] }]);
  const asana = mode === 'paste' ? [] : (await api(`/api/studio/asana?act=${encodeURIComponent(S.act)}`).catch(() => ({ briefs: [] }))).briefs;
  const paste = mode === 'paste' || !asana.length;
  modal('New batch', `
    <div class="st-chips" style="margin-bottom:10px"><button class="st-chip ${paste ? '' : 'on'}" data-tab="asana">From Asana</button><button class="st-chip ${paste ? 'on' : ''}" data-tab="paste">Paste</button></div>
    <div data-pane="asana" ${paste ? 'hidden' : ''}>${asana.length ? `<p class="hint" style="margin:0 0 8px">Open tests in Asana. Tick one or more; Locus opens each brief doc and lays it out.</p>
      <div class="st-pick">${asana.map(a => `<label><input type="checkbox" value="${esc(a.id)}"><span class="num">#${esc(a.num)}</span><span class="ttl">${esc(a.title || '')}</span><span class="tiny">${a.has_brief ? (a.stage === 'production' ? 'In Studio' : 'Brief') : 'No brief yet'}</span></label>`).join('')}</div>`
      : '<p class="hint">No open Asana tests for this brand yet.</p>'}</div>
    <div data-pane="paste" ${paste ? '' : 'hidden'}><p class="hint" style="margin:0 0 8px">Paste one brief (Angle, Testing, 1-2-3) or a whole plan in any format, text or CSV. A plan with many angles becomes many batches.</p>
      <textarea class="st-in" id="nbText" rows="12" placeholder="ANGLE: The gift that actually fixes their game&#10;TESTING: concepts&#10;1. Unboxing the Carver on Christmas morning&#10;2. Before and after: chunked chip vs clean chip&#10;3. 'Stop buying him socks' in bold type"></textarea></div>`,
  { cta: 'Read it', wide: true, onOpen: (w, ctl) => {
    w.querySelectorAll('[data-tab]').forEach(t => t.onclick = () => { w.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === t)); w.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== t.dataset.tab; }); });
    w.onSubmit(async () => {
      const onAsana = !w.querySelector('[data-pane="asana"]').hidden;
      const ids = onAsana ? [...w.querySelectorAll('[data-pane="asana"] input:checked')].map(i => i.value) : [];
      const text = onAsana ? '' : w.querySelector('#nbText').value.trim();
      if (!ids.length && !text) throw new Error(onAsana ? 'Tick a brief.' : 'Paste a brief first.');
      ctl.msg('Reading the brief. Under a minute.', true);
      const r = await streamCall(AH_URL, '/api/studio-ai/brief', { br_batch_ids: ids, text }, o => { if (o.type === 'status') ctl.msg(o.text + '…', true); });
      if (!r.batches?.length) throw new Error('No batches found in that.');
      const byNum = Object.fromEntries(asana.map(a => [String(a.num), a.id]));
      ctl.close(true);
      await saveNew(r.batches.map(b => ({ ...b, br_batch_id: byNum[String(b.num)] || null })));
    });
  } });
}
async function saveNew(list) {
  let first = null;
  for (const b of list) {
    const r = await post('/api/studio/batch/save', { batch: { name: b.name, num: b.num || '', br_batch_id: b.br_batch_id || null, brief: { angle: b.angle || '', why: b.why || '', concept: b.concept || '', post_copy: b.post_copy || '', testing: b.testing || 'concepts', lines: (b.lines || []).map(l => ({ text: l.text || '', inspo: [] })) }, setup: { products: [], images: [], swipe: [] }, status: 'draft' } });
    first = first || r.batch;
  }
  S.cur = first; await reload();
}

/* ---------------- batch view ---------------- */
function batchView(b) {
  const br = b.brief || {}, su = b.setup || {}, plan = b.plan;
  const lines = br.lines || [];
  const ads = live(adsOf(b));
  const n = plan?.ads?.length || 0;
  return `
  <div class="card"><div class="st-bar"><div class="st-step"><span class="n">1</span><h3 class="st-h">The brief</h3></div><div><label class="st-f" style="display:flex;gap:6px;align-items:center">Batch #<input class="st-in" data-bf="num" value="${esc(b.num)}" style="width:80px;margin:0"></label><button class="btn" id="bDel">Archive</button></div></div>
    <div class="st-g2" style="margin-top:10px">
      <label class="st-f">Angle<small>the argument, one sentence</small><textarea class="st-in" data-bf="angle" rows="2">${esc(br.angle)}</textarea></label>
      <label class="st-f">Why<small>what we believe about the customer</small><textarea class="st-in" data-bf="why" rows="2">${esc(br.why)}</textarea></label>
      <label class="st-f" style="grid-column:1/-1">Concept<small>only when every line is inside one proven concept</small><input class="st-in" data-bf="concept" value="${esc(br.concept)}"></label>
      ${br.post_copy ? `<label class="st-f" style="grid-column:1/-1">Post copy<small>goes with the ads in Meta, not on the images</small><textarea class="st-in" data-bf="post_copy" rows="2">${esc(br.post_copy)}</textarea></label>` : ''}
    </div>
    <p class="st-lbl" style="margin-top:12px">What we're testing</p>
    <div class="st-chips">${TESTING.map(([k, l, h]) => `<button class="st-chip ${br.testing === k ? 'on' : ''}" data-test="${k}">${l}<small>${h}</small></button>`).join('')}</div>
    <p class="st-lbl" style="margin-top:12px">Lines · one ad each</p>
    <div>${lines.map((l, i) => `<div class="st-line"><span class="k">${i + 1}</span>
      <div style="display:grid;gap:6px"><textarea class="st-in" style="margin:0" data-line="${i}" rows="2" placeholder="The concept or piece for this ad, in the team's words">${esc(l.text)}</textarea>
        <div class="st-thumbs"><span class="tiny">Make it look like this:</span>${(l.inspo || []).map((u, k) => `<button class="t" data-zu="${esc(u)}"><img src="${esc(thumb(u))}" alt=""><span class="st-x" data-rmli="${i}:${k}" role="button" aria-label="Remove">×</span></button>`).join('')}${(l.inspo || []).length < 2 ? `<button class="st-add" data-addli="${i}">Add image</button>` : ''}</div></div>
      <button class="btn" data-rmline="${i}" title="Remove this line" aria-label="Remove line ${i + 1}">×</button></div>`).join('')}</div>
    <button class="btn" id="bAddLine" style="margin-top:8px">Add a line</button>
  </div>

  <div class="card"><div class="st-step"><span class="n">2</span><h3 class="st-h">Product and inspiration</h3></div>
    <div class="st-g2" style="margin-top:10px">
      <div><b style="font-size:13px">Product</b><div class="hint">The AI draws it from the photos you tick, then checks every ad against them and redoes any that look off.</div>
        ${(su.products || []).map((p, pi) => `<div style="margin-top:8px"><div class="st-bar"><b style="font-size:13px">${esc(p.title)}</b><button class="btn" data-rmprod="${pi}">Remove</button></div>
          <div class="st-thumbs" style="margin-top:4px">${(p.all || []).map(u => `<button class="t ${(su.images || []).includes(u) ? 'on' : ''}" data-img="${esc(u)}" title="${(su.images || []).includes(u) ? 'Used' : 'Not used'}"><img src="${esc(thumb(u))}" alt=""></button>`).join('')}</div></div>`).join('')}
        <button class="btn" id="bProd" style="margin-top:8px" ${(su.products || []).length >= 4 ? 'disabled' : ''}>${(su.products || []).length ? 'Add another product' : 'Choose the product'}</button></div>
      <div><b style="font-size:13px">Swipe file</b><div class="hint">Ads you like, for range and ideas. Nothing gets copied; the art director picks styles from it. Up to 12. Drop, click, or paste a screenshot.</div>
        <div class="st-thumbs" style="margin-top:8px">${(su.swipe || []).map((u, k) => `<button class="t" data-zu="${esc(u)}"><img src="${esc(u)}" alt=""><span class="st-x" data-rmsw="${k}" role="button" aria-label="Remove">×</span></button>`).join('')}${(su.swipe || []).length < 12 ? '<button class="st-add" id="bSwipe">Add images</button>' : ''}</div></div>
    </div>
    <input type="file" id="bFile" accept="image/png,image/jpeg,image/webp" multiple hidden></div>

  <div class="card"><div class="st-bar"><div class="st-step"><span class="n">3</span><h3 class="st-h">The plan</h3></div><div>${S.busy === 'plan' ? '<span class="st-busy"><span class="st-spin"></span>The art director is planning. About a minute.</span>' : ''}<button class="btn ${plan ? '' : 'primary'}" id="bPlan" ${S.busy || S.making ? 'disabled' : ''}>${plan ? 'Plan again' : 'Plan the ads'}</button></div></div>
    ${plan ? `<p class="hint" style="margin:6px 0 10px">${plan.variation ? `Testing ${esc(br.testing)} inside one concept: ad 1 is made, and the others change only the words.` : 'Each ad is its own idea. Change anything before you make them.'}</p><div class="st-plan">${plan.ads.map((a, i) => planRow(a, i, plan)).join('')}</div>`
      : `<p class="hint" style="margin:6px 0 0">The art director reads the brief, the product and any inspiration, then writes each ad: the words (in the brand's voice, keeping yours where you gave them), the look, the type style, and which inspiration it follows. You check it before anything is made.</p>`}
  </div>

  <div class="card"><div class="st-bar"><div class="st-step"><span class="n">4</span><h3 class="st-h">The ads</h3></div>
    <div>${S.making ? `<span class="st-busy"><span class="st-spin"></span>${esc(S.making)}</span>` : ''}
      ${plan ? `<button class="btn ${ads.length ? '' : 'primary'}" id="bMake" ${S.making || S.busy ? 'disabled' : ''}>Make ${n} ad${n === 1 ? '' : 's'} · about $${(n * PER_AD).toFixed(2)}</button>` : ''}
      ${ads.length ? `<button class="btn" id="bDl" ${S.making ? 'disabled' : ''}>Download all</button><button class="btn primary" id="bCanva" ${S.making ? 'disabled' : ''}>Send to Canva</button>` : ''}</div></div>
    <p class="st-msg bad" style="margin-top:6px">${esc(S.err || '')}</p>
    ${ads.length ? `<div class="st-board" style="margin-top:10px">${ads.slice().sort((p, q) => (p.line ?? 99) - (q.line ?? 99)).map(a => adCard(a)).join('')}</div>` : plan ? '<div class="st-empty">Press Make when the plan looks right.</div>' : '<div class="st-empty">Plan the ads first.</div>'}
  </div>`;
}
function planRow(a, i, plan) {
  const lock = plan.variation && i > 0;
  const ref = a.ref_url ? `<div class="st-thumbs"><button class="t" data-zu="${esc(a.ref_url)}"><img src="${esc(thumb(a.ref_url))}" alt=""></button><select class="st-in" style="width:auto;margin:0" data-pf="${i}:ref_use" ${lock ? 'disabled' : ''}><option value="copy" ${a.ref_use === 'copy' ? 'selected' : ''}>Look like this</option><option value="vibe" ${a.ref_use === 'vibe' ? 'selected' : ''}>Just the vibe</option><option value="none" ${a.ref_use === 'none' ? 'selected' : ''}>Ignore it</option></select></div>` : '<span class="tiny">No inspiration</span>';
  return `<div class="st-prow"><div class="top"><b>Ad ${i + 1}${plan.variation && i === 0 ? ' · the base' : ''}</b><span class="tiny">${esc(a.note || '')}</span></div>
    <div class="st-g3"><label class="st-f">Headline<input class="st-in" data-pf="${i}:headline" value="${esc(a.headline)}"></label>
      <label class="st-f">Smaller line<input class="st-in" data-pf="${i}:subline" value="${esc(a.subline)}"></label>
      <label class="st-f">Button<input class="st-in" data-pf="${i}:cta" value="${esc(a.cta)}"></label></div>
    <div class="st-g2"><label class="st-f">Callouts<small>one per line</small><textarea class="st-in" data-pf="${i}:callouts" rows="2">${esc((a.callouts || []).join('\n'))}</textarea></label>
      <label class="st-f">The look${lock ? '<small>same as ad 1 in this test</small>' : ''}<textarea class="st-in" data-pf="${i}:look" rows="2" ${lock ? 'disabled' : ''}>${esc(a.look)}</textarea></label></div>
    <div class="st-bar"><div><span class="tiny">Type</span><select class="st-in" style="width:auto;margin:0" data-pf="${i}:style" ${lock ? 'disabled' : ''}>${STYLES.map(([k, l]) => `<option value="${k}" ${a.style === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>${ref}</div></div>`;
}
function adCard(a) {
  const s = a.spec || {}, ck = a.check;
  const tags = [a.line != null ? `<span class="st-tag">Ad ${a.line + 1}</span>` : '', a.status === 'approved' ? '<span class="st-tag ok">Approved</span>' : '',
    ck ? (ck.ok === false ? `<span class="st-tag warn" title="${esc(ck.issue || '')}">Product may be off</span>` : ck.ok ? `<span class="st-tag ok">Product checked${ck.redone ? ' (redone)' : ''}</span>` : '') : ''].join('');
  return `<div class="st-ad"><div class="pic" data-zoom="${a.id}"><img src="${esc(shown(a))}" alt="${esc(s.headline || 'Ad')}" loading="lazy"><div class="tags">${tags}</div></div>
    <div class="meta"><b>${esc(s.headline || s.product || '')}</b>${ck?.ok === false ? `<span class="st-msg bad">${esc(ck.issue)}</span>` : ''}
      <div class="acts">${a.status === 'approved' ? `<button class="btn" data-unapprove="${a.id}">Unapprove</button>` : `<button class="btn primary" data-approve="${a.id}">Approve</button>`}
        <button class="btn" data-change="${a.id}" title="Tell the AI what to change">Change</button><button class="btn" data-redo="${a.id}" title="Make this one again">Redo</button></div>
      <div class="acts" style="grid-template-columns:1fr 1fr"><button class="btn" data-dl="${a.id}">Download</button><button class="btn" data-del="${a.id}">Delete</button></div></div></div>`;
}

/* ---- wiring ---- */
let saveT = null;
function queueSave() { clearTimeout(saveT); saveT = setTimeout(saveCur, 700); }
async function saveCur() {
  clearTimeout(saveT);
  const b = S.cur; if (!b || b.id === 'loose') return;
  const r = await post('/api/studio/batch/save', { batch: b }).catch(e => { S.err = e.message; });
  if (r?.batch) { const i = S.d.batches.findIndex(x => x.id === b.id); if (i >= 0) S.d.batches[i] = S.cur; }
}
function wireBatch() {
  const b = S.cur, br = b.brief = b.brief || {}, su = b.setup = b.setup || {};
  br.lines = br.lines || []; su.products = su.products || []; su.images = su.images || []; su.swipe = su.swipe || [];
  document.querySelectorAll('[data-bf]').forEach(el => el.oninput = () => { if (el.dataset.bf === 'num') b.num = el.value.trim(); else br[el.dataset.bf] = el.value; queueSave(); });
  document.querySelectorAll('[data-test]').forEach(el => el.onclick = () => { br.testing = el.dataset.test; if (b.plan) b.plan = null; queueSave(); paint(); });
  document.querySelectorAll('[data-line]').forEach(el => el.oninput = () => { br.lines[+el.dataset.line].text = el.value; queueSave(); });
  document.querySelectorAll('[data-rmline]').forEach(el => el.onclick = () => { br.lines.splice(+el.dataset.rmline, 1); if (b.plan) b.plan = null; queueSave(); paint(); });
  $('#bAddLine').onclick = () => { if (br.lines.length >= 12) return; br.lines.push({ text: '', inspo: [] }); if (b.plan) b.plan = null; queueSave(); paint(); };
  $('#bDel').onclick = async () => { b.status = 'archived'; await saveCur(); S.cur = null; reload(); };
  const file = $('#bFile'); let target = null;
  document.querySelectorAll('[data-addli]').forEach(el => el.onclick = () => { target = { line: +el.dataset.addli }; file.click(); });
  const sw = $('#bSwipe'); if (sw) sw.onclick = () => { target = { swipe: true }; file.click(); };
  file.onchange = () => { upload([...file.files], target); file.value = ''; };
  document.querySelectorAll('[data-rmli]').forEach(el => el.onclick = e => { e.stopPropagation(); const [i, k] = el.dataset.rmli.split(':').map(Number); br.lines[i].inspo.splice(k, 1); queueSave(); paint(); });
  document.querySelectorAll('[data-rmsw]').forEach(el => el.onclick = e => { e.stopPropagation(); su.swipe.splice(+el.dataset.rmsw, 1); queueSave(); paint(); });
  const main = $('#stMain');
  main.ondragover = e => e.preventDefault();
  main.ondrop = e => { e.preventDefault(); const f = [...e.dataTransfer.files]; if (f.length) upload(f, { swipe: true }); };
  $('#bProd').onclick = pickProduct;
  document.querySelectorAll('[data-img]').forEach(el => el.onclick = () => { const u = el.dataset.img; su.images = su.images.includes(u) ? su.images.filter(x => x !== u) : [...su.images, u].slice(-8); queueSave(); paint(); });
  document.querySelectorAll('[data-rmprod]').forEach(el => el.onclick = () => { const p = su.products.splice(+el.dataset.rmprod, 1)[0]; su.images = su.images.filter(u => !(p.all || []).includes(u)); queueSave(); paint(); });
  $('#bPlan').onclick = planAds;
  document.querySelectorAll('[data-pf]').forEach(el => { const h = () => {
    const [i, k] = el.dataset.pf.split(':'); const a = b.plan.ads[+i];
    a[k] = k === 'callouts' ? el.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 4) : el.value;
    if (b.plan.variation && +i === 0 && ['look', 'style', 'ref_use'].includes(k)) b.plan.ads.forEach(x => { x[k] = a[k]; });
    queueSave();
  }; el.oninput = h; el.onchange = h; });
  const mk = $('#bMake'); if (mk) mk.onclick = makeBatch;
  const dl = $('#bDl'); if (dl) dl.onclick = () => downloadAll(b);
  const cv = $('#bCanva'); if (cv) cv.onclick = () => sendCanva(b);
  wireAds();
}
/* Paste a screenshot anywhere on a batch (outside a text box) to add it to the swipe file. */
document.addEventListener('paste', e => {
  if (!S.cur || S.cur.id === 'loose' || !$('#bSwipe') || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  const f = [...(e.clipboardData?.files || [])].filter(x => x.type.startsWith('image/'));
  if (f.length) { e.preventDefault(); upload(f, { swipe: true }); }
});
async function upload(files, target) {
  const b = S.cur, su = b.setup, br = b.brief;
  for (const file of files.filter(f => /^image\/(png|jpeg|webp)$/.test(f.type))) {
    if (target?.line == null && su.swipe.length >= 12) break;
    if (target?.line != null && (br.lines[target.line].inspo || []).length >= 2) break;
    try {
      const res = await fetch(S.url.replace(/\/+$/, '') + '/api/studio/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + S.tok, 'Content-Type': file.type }, body: file });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Upload failed');
      if (target?.line != null) (br.lines[target.line].inspo = br.lines[target.line].inspo || []).push(j.url); else su.swipe.push(j.url);
    } catch (e) { S.err = e.message; }
  }
  await saveCur(); paint();
}
async function pickProduct() {
  if (!S.products) {
    const r = await api(`/api/studio/products?act=${encodeURIComponent(S.act)}`).catch(e => ({ products: [], note: e.message }));
    S.products = r.products || []; S.prodNote = r.note || '';
  }
  const su = S.cur.setup;
  modal('Choose the product', `<input class="st-in" id="pq" placeholder="Search products" value="${esc(S.prodQ)}"><div class="st-pgrid" id="pg" style="margin-top:10px"></div>${S.prodNote ? `<p class="hint">${esc(S.prodNote)}</p>` : ''}`, { cta: null, wide: true, onOpen: (w, ctl) => {
    const draw = () => {
      const q = S.prodQ.toLowerCase(), have = new Set(su.products.map(p => p.handle));
      const list = S.products.filter(p => !have.has(p.handle) && (!q || (p.title + ' ' + p.type).toLowerCase().includes(q)));
      w.querySelector('#pg').innerHTML = list.map(p => `<button data-p="${S.products.indexOf(p)}"><img src="${esc(thumb(p.images[0]))}" alt="" loading="lazy"><span>${esc(p.title)}</span></button>`).join('') || '<p class="hint">No products match.</p>';
      w.querySelectorAll('[data-p]').forEach(bt => bt.onclick = async () => {
        const p = S.products[+bt.dataset.p];
        su.products.push({ title: p.title, handle: p.handle, all: p.images });
        su.images = [...su.images, ...p.images.slice(0, su.products.length > 1 ? 1 : 3)].slice(0, 8);
        ctl.close(true); await saveCur(); paint();
      });
    };
    w.querySelector('#pq').oninput = e => { S.prodQ = e.target.value; draw(); };
    draw();
  } });
}
async function planAds() {
  const b = S.cur, br = b.brief, su = b.setup;
  if (!br.lines.some(l => (l.text || '').trim())) { S.err = 'Write at least one line first.'; return paint(); }
  S.busy = 'plan'; S.err = ''; paint();
  try {
    await saveCur();
    br.lines = br.lines.filter(l => (l.text || '').trim());
    const r = await streamCall(AH_URL, '/api/studio-ai/plan', { batch: { angle: br.angle, why: br.why, concept: br.concept, testing: br.testing, lines: br.lines }, products: su.products.map(p => p.title), swipe: su.swipe });
    b.plan = { ads: r.ads, variation: r.variation }; b.status = 'planned';
    await saveCur();
  } catch (e) { S.err = `Planning: ${e.message}`; }
  S.busy = ''; paint();
}
function specOf(b, a) {
  const su = b.setup, ref = a.ref_url && a.ref_use !== 'none' ? [a.ref_url] : [];
  return { products: su.products.map(p => ({ title: p.title, handle: p.handle })), images: su.images.slice(), inspo: ref, ref_use: a.ref_use,
    headline: a.headline, subline: a.subline, callouts: a.callouts || [], cta: a.cta, art: a.art || '', look: a.look, style: a.style || 'auto', note: a.note,
    who: b.brief.why || '' };
}
async function makeBatch() {
  const b = S.cur, plan = b.plan;
  if (!plan?.ads?.length) return;
  if (!b.setup.images.length && !plan.ads.some(a => a.ref_url)) { S.err = 'Choose the product first (step 2).'; return paint(); }
  S.err = '';
  const total = plan.ads.length; let done = 0, failed = 0;
  const tick = () => { S.making = `Made ${done} of ${total}${failed ? `, ${failed} failed` : ''}. Keep this page open.`; paint(); };
  const one = async i => {
    try {
      const r = await streamCall(S.url, '/api/studio/make', { spec: specOf(b, plan.ads[i]), n: 1, batch_id: b.id, line: i }, o => { if (o.type === 'ad') S.d.ads.unshift(o.ad); });
      done++; tick(); return r.ads?.[0];
    } catch (e) { failed++; S.err = e.message; tick(); return null; }
  };
  tick();
  if (plan.variation) {
    const base = await one(0);
    if (base) for (let i = 1; i < total; i++) {
      try { const r = await streamCall(S.url, '/api/studio/vary', { base_id: base.id, spec: specOf(b, plan.ads[i]), batch_id: b.id, line: i }); S.d.ads.unshift(r.ad); done++; }
      catch (e) { failed++; S.err = e.message; }
      tick();
    }
  } else {
    let next = 0;
    const lane = async () => { while (next < total) { const i = next++; await one(i); } };
    await Promise.all([lane(), lane()]);
  }
  b.status = 'made'; await saveCur();
  S.making = ''; await reload();
}
window.addEventListener('beforeunload', e => { if (S.making) { e.preventDefault(); e.returnValue = ''; } });
function wireAds() {
  const setStatus = async (id, status) => { const r = await post('/api/studio/status', { id, status }); Object.assign(S.d.ads.find(a => a.id === id), r.ad); paint(); };
  document.querySelectorAll('[data-approve]').forEach(x => x.onclick = () => setStatus(x.dataset.approve, 'approved'));
  document.querySelectorAll('[data-unapprove]').forEach(x => x.onclick = () => setStatus(x.dataset.unapprove, 'review'));
  document.querySelectorAll('[data-del]').forEach(x => x.onclick = () => setStatus(x.dataset.del, 'deleted'));
  document.querySelectorAll('[data-dl]').forEach(x => x.onclick = () => download(S.d.ads.find(a => a.id === x.dataset.dl)));
  document.querySelectorAll('[data-redo]').forEach(x => x.onclick = () => redo(S.d.ads.find(a => a.id === x.dataset.redo)));
  document.querySelectorAll('[data-change]').forEach(x => x.onclick = () => change(S.d.ads.find(a => a.id === x.dataset.change)));
  document.querySelectorAll('[data-zoom]').forEach(p => p.onclick = () => zoom(shown(S.d.ads.find(a => a.id === p.dataset.zoom))));
  document.querySelectorAll('[data-zu]').forEach(p => p.onclick = e => { if (e.target.closest('.st-x')) return; zoom(p.dataset.zu); });
}
function zoom(src) { const z = document.createElement('div'); z.className = 'st-zoom'; z.innerHTML = `<img src="${esc(src)}" alt="">`; z.onclick = () => z.remove(); document.body.appendChild(z); }
async function redo(a) {
  S.making = 'Making that one again…'; S.err = ''; paint();
  try {
    if (a.spec?.varied_from) {
      const r = await streamCall(S.url, '/api/studio/vary', { base_id: a.spec.varied_from, spec: a.spec, batch_id: a.batch_id, line: a.line });
      S.d.ads.unshift(r.ad);
    } else {
      await streamCall(S.url, '/api/studio/make', { spec: a.spec, n: 1, parent_id: a.id, batch_id: a.batch_id, line: a.line }, o => { if (o.type === 'ad') S.d.ads.unshift(o.ad); });
    }
    await post('/api/studio/status', { id: a.id, status: 'deleted' });
  } catch (e) { S.err = e.message; }
  S.making = ''; await reload();
}
function change(a) {
  modal('Change with AI', `<p class="hint" style="margin:0 0 8px">Say what to change. The AI redraws this ad with only that change, and the words keep their look. About 25¢ and 40 seconds. The old version goes to Deleted.</p>
    <textarea class="st-in" id="chIn" rows="3" placeholder="Move the headline to the top · Remove the 25% off label · Change the headline to Stop buying him socks · Make the background darker"></textarea>`,
  { cta: 'Make the change', onOpen: (w, ctl) => w.onSubmit(async () => {
    const t = w.querySelector('#chIn').value.trim(); if (!t) throw new Error('Say what to change.');
    ctl.msg('Making the change. About 40 seconds.', true);
    const r = await streamCall(S.url, '/api/studio/change', { id: a.id, instruction: t });
    S.d.ads.unshift(r.ad); const old = S.d.ads.find(x => x.id === a.id); if (old) old.status = 'deleted';
    ctl.close(true); paint();
  }) });
}
const fileName = (a, b) => `${b?.num ? `${b.num}-${(a.line ?? 0) + 1}` : (S.d.account?.name || 'ad').replace(/\W+/g, '-')} ${(a.spec?.headline || '').replace(/[^\w ]+/g, '').slice(0, 40)}`.trim() + '.png';
async function download(a, b = S.cur) {
  try {
    const blob = await (await fetch(shown(a))).blob();
    const o = URL.createObjectURL(blob), l = document.createElement('a');
    l.href = o; l.download = fileName(a, b?.id === 'loose' ? null : b);
    document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(o), 4000);
  } catch (e) { S.err = e.message; paint(); }
}
async function downloadAll(b) { for (const a of live(adsOf(b))) { await download(a, b); await new Promise(r => setTimeout(r, 400)); } }
async function sendCanva(b) {
  if (!S.d.canva?.connected) return canvaSetup();
  const ads = live(adsOf(b));
  const approved = ads.filter(a => a.status === 'approved');
  const list = (approved.length ? approved : ads).sort((p, q) => (p.line ?? 0) - (q.line ?? 0));
  S.making = `Sending ${list.length} ad${list.length === 1 ? '' : 's'} to Canva…`; paint();
  try {
    const r = await streamCall(S.url, '/api/studio/canva/send', { ids: list.map(a => a.id), folder: `${S.d.account?.name || ''} · ${b.num ? `Batch ${b.num} · ` : ''}${b.name || 'Studio'}` }, o => { if (o.type === 'status') { S.making = o.text; paint(); } });
    S.making = ''; paint();
    modal('Sent to Canva', `<p class="hint" style="margin:0 0 8px">${r.designs.length} design${r.designs.length === 1 ? '' : 's'} in a new Canva folder${approved.length ? ' (the approved ones)' : ''}. In Canva, use <b>Edit photo, Grab Text</b> to turn the words into text boxes, or <b>Magic Grab</b> to move the product.</p>
      ${r.folder_url ? `<p><a class="btn primary" href="${esc(r.folder_url)}" target="_blank" rel="noopener">Open the folder in Canva</a></p>` : ''}
      <div style="display:grid;gap:4px">${r.designs.map((d, i) => `<a href="${esc(d.edit_url)}" target="_blank" rel="noopener">Design ${i + 1}</a>`).join('')}</div>`, { cta: null });
  } catch (e) { S.making = ''; S.err = e.message; paint(); }
}

/* ---------------- ads made before batches ---------------- */
function looseView(ads) {
  return `<div class="card"><h3 class="st-h">Earlier ads</h3><p class="hint" style="margin:6px 0 10px">Made before batches existed.</p>
    <p class="st-msg bad">${esc(S.err || '')}</p><div class="st-board">${ads.map(a => adCard(a)).join('')}</div></div>`;
}

window.StudioTab = { render };
})();
