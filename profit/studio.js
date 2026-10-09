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
const TESTING = [['concepts', 'Concepts', 'different ideas'], ['headlines', 'Headlines', 'same ad, new words'], ['visuals', 'Looks', 'same words, new looks'], ['offer', 'Offer', 'same ad, offer framing'], ['reviews', 'Reviews', 'same ad, review quote'], ['hooks', 'Hooks', 'the opening line'], ['copy', 'Copy', 'the body words'], ['format', 'Format', 'one idea, different layouts']];
const STYLES = [['auto', 'AI picks'], ['bold', 'Bold condensed'], ['clean', 'Clean modern'], ['serif', 'Elegant serif'], ['hand', 'Handwritten'], ['luxe', 'Thin luxe'], ['native', 'Native social']];
const PER_AD = 0.33;   // one 4:5 picture + the product and word-position checks (2026-10-08)
const STORY_COST = 0.43;   // the 9:16 re-layout, made only when someone asks for it

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
async function streamCallJson(base, path, body) {
  const res = await fetch(base.replace(/\/+$/, '') + path, { method: 'POST', headers: { Authorization: 'Bearer ' + S.tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ act: S.act, ...body }) });
  const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status)); return j;
}
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
  if (document.getElementById('st-css3')) return;
  document.getElementById('st-css')?.remove(); document.getElementById('st-css2')?.remove();
  const st = document.createElement('style');
  st.id = 'st-css3';
  /* 2026-10-08: the v2 look. Tokens only (v2.css), so dark and light both read; every rule is scoped
     to Studio's own classes (st-*) or Studio's own modals (.st-modal). Class names the code wires are kept. */
  st.textContent = `
.st{display:flex;flex-direction:column;gap:16px}
.st .card{margin-bottom:0}
.st .hint,.st-modal .hint{color:var(--muted);font-size:13px;line-height:1.5}
.st .tiny,.st-modal .tiny{font-size:11.5px;color:var(--muted)}
.st .v2card{margin:0}
.st .v2h{align-items:center}
.st .v2h .cap{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.st-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px 16px;flex-wrap:wrap}
.st-head h2{margin:2px 0 4px;font-size:22px;font-weight:650;letter-spacing:-.01em;color:var(--ink)}
.st-head .v2say{max-width:80ch}
.st-head .acts{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.st-h{font-size:13.5px;font-weight:650;margin:0;color:var(--ink)}
.st-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.st-bar > div{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.st-lbl{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 6px}
.st-f{display:block;font-size:12px;font-weight:600;color:var(--ink-2);min-width:0}
.st-f small{font-weight:500;color:var(--muted);margin-left:4px}
.st-in{display:block;width:100%;margin-top:5px;border:1px solid var(--line-strong);border-radius:8px;padding:8px 10px;font:inherit;font-size:13.5px;font-weight:500;color:var(--ink);background:var(--surface);max-width:none}
.st-in:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}
.st-in:disabled{opacity:.55}
textarea.st-in{min-height:44px;resize:vertical;line-height:1.45}
.st-g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
@media (max-width:760px){.st-g2{grid-template-columns:1fr}}
.st-chips{display:flex;gap:6px;flex-wrap:wrap}
.st-chip{font:inherit;font-size:12.5px;font-weight:600;padding:6px 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink-2);cursor:pointer;text-align:left;transition:border-color .12s}
.st-chip:hover{border-color:var(--line-strong);color:var(--ink)}
.st-chip small{display:block;font-weight:500;color:var(--muted);font-size:11px}
.st-chip.on{border-color:var(--brand);background:var(--brand-soft);color:var(--ink)}
.st-msg{font-size:12.5px;color:var(--muted);margin:0}
.st-msg:empty{display:none}
.st-msg.ok{color:var(--good)}.st-msg.bad{color:var(--bad)}
.st-layout{display:grid;grid-template-columns:270px minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:980px){.st-layout{grid-template-columns:1fr}.st-list{max-height:240px}}
.st-side{position:sticky;top:12px}
@media (max-width:980px){.st-side{position:static}}
.st-list{display:flex;flex-direction:column;gap:2px;max-height:72vh;overflow:auto;margin:0 -6px;padding:0 6px}
.st-li{font:inherit;text-align:left;border:1px solid transparent;border-radius:8px;background:transparent;padding:9px 10px;cursor:pointer;color:var(--ink);display:grid;gap:4px;width:100%;transition:background .12s}
.st-li:hover{background:var(--surface-2)}
.st-li.on{border-color:var(--line-strong);background:var(--surface-2);box-shadow:inset 3px 0 0 var(--brand)}
.st-li b{font-size:13px;font-weight:600;line-height:1.3}
.st-li > span{font-size:11.5px;color:var(--muted)}
.st-li .st-lt{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.st-li .dup{color:var(--warn)}
.st-lw{display:grid;gap:2px}
.st-lw .btn{justify-self:start;padding:3px 10px;font-size:12px;margin:0 0 4px 10px}
/* the stepper: five steps in words, a line that fills as the batch moves */
.st-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0;list-style:none;margin:0;padding:0;font-size:12px;font-weight:550;color:var(--muted)}
.st-steps li{position:relative;display:grid;justify-items:start;gap:6px;padding-right:8px;min-width:0}
.st-steps li::before{content:'';position:absolute;left:28px;right:4px;top:10px;height:2px;border-radius:1px;background:var(--line)}
.st-steps li:last-child::before{display:none}
.st-steps li.done::before{background:var(--good)}
.st-steps .n{position:relative;z-index:1;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;background:var(--surface-2);color:var(--muted);border:1px solid var(--line-strong);flex:none;box-sizing:border-box}
.st-steps li.done{color:var(--ink-2)}
.st-steps li.done .n{background:var(--good-bg);color:var(--good);border-color:transparent}
.st-steps li.now{color:var(--ink);font-weight:650}
.st-steps li.now .n{background:var(--brand);color:var(--on-brand);border-color:var(--brand);box-shadow:0 0 0 4px var(--brand-soft)}
@media (max-width:620px){.st-steps{grid-template-columns:1fr;gap:8px}.st-steps li{grid-template-columns:22px 1fr;align-items:center;gap:8px}.st-steps li::before{display:none}}
.st-now{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin:14px 0 0;padding-top:12px;border-top:1px solid var(--line)}
.st-crow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}
.st-crow:first-child{border-top:0}
.st-crow b{font-size:13.5px;font-weight:600;color:var(--ink);margin-right:6px}
.st-crow .tiny{display:block;margin-top:3px}
@media (max-width:520px){.st-crow{grid-template-columns:1fr}.st-crow .btn{justify-self:start}}
.st-how summary{cursor:pointer;font-size:12.5px;font-weight:600;color:var(--muted)}
.st-how summary:hover{color:var(--ink)}
.st-how p{margin:6px 0 0}
.st-step{display:flex;gap:10px;align-items:center}
.st-step .n{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;background:var(--brand-soft);color:var(--brand);flex:none}
.st .v2h .n{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;background:var(--brand-soft);color:var(--brand);flex:none;align-self:center}
.st-sub{font-size:13px;font-weight:650;color:var(--ink);margin:0 0 2px}
.st-bl{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:8px;align-items:start;padding:10px 0;border-top:1px solid var(--line)}
.st-bl:first-child{border-top:0}
.st-bl .k{font-weight:650;color:var(--muted);padding-top:9px;text-align:right;font-variant-numeric:tabular-nums}
.st-thumbs{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.st-thumbs button.t{padding:0;border:2px solid var(--line);border-radius:8px;background:var(--surface-2);cursor:pointer;line-height:0;position:relative;transition:border-color .12s}
.st-thumbs button.t:hover{border-color:var(--line-strong)}
.st-thumbs button.t.on{border-color:var(--brand)}
.st-thumbs img{width:52px;height:52px;object-fit:cover;border-radius:6px}
.st-x{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:var(--ink);color:var(--bg);font-size:11px;line-height:18px;text-align:center;cursor:pointer}
.st-add{font:inherit;width:52px;height:52px;border:1.5px dashed var(--line-strong);border-radius:8px;display:grid;place-items:center;font-size:10.5px;color:var(--muted);cursor:pointer;background:transparent;text-align:center;line-height:1.2;padding:2px;transition:border-color .12s,color .12s}
.st-add:hover{border-color:var(--brand);color:var(--ink)}
.st-plan{display:grid;gap:10px}
.st-prow{border:1px solid var(--line);border-radius:10px;padding:12px;display:grid;gap:10px;background:var(--surface)}
.st-prow .top{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}
.st-prow .top b{font-size:13px;font-weight:650;color:var(--ink)}
.st-g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
@media (max-width:760px){.st-g3{grid-template-columns:1fr}}
.st-pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;max-height:56vh;overflow:auto;padding:2px}
.st-pgrid button{font:inherit;text-align:left;border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:0;cursor:pointer;overflow:hidden;color:var(--ink);transition:border-color .12s}
.st-pgrid button:hover{border-color:var(--brand)}
.st-pgrid img{width:100%;aspect-ratio:1;object-fit:contain;background:var(--surface-2);display:block}
.st-pgrid span{display:block;padding:6px 8px;font-size:12px;font-weight:600;line-height:1.3}
/* the review grid: each ad large, one clear first action */
.st-board{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:16px}
.st-ad{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--surface);display:flex;flex-direction:column;transition:border-color .12s}
.st-ad:hover{border-color:var(--line-strong)}
.st-ad.ok,.st-ad.ok:hover{border-color:var(--good);box-shadow:inset 0 0 0 1px var(--good)}
.st-ad .pic{position:relative;aspect-ratio:4/5;background:var(--surface-2);cursor:zoom-in}
.st-ad .pic img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.st-ad .tags{position:absolute;left:10px;top:10px;right:10px;display:flex;gap:5px;flex-wrap:wrap}
.st-ad .meta{padding:12px;display:grid;gap:10px}
.st-ad .meta > b{font-size:13.5px;font-weight:600;line-height:1.35;color:var(--ink)}
.st-ad .pills{display:flex;gap:5px;flex-wrap:wrap}
.st-ad .act1{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1.25fr) minmax(0,.8fr);gap:6px}
.st-ad .act1 .btn{padding:8px 6px;font-size:12.5px;justify-content:center;text-align:center;margin:0;white-space:nowrap}
.st-ad .act2{display:flex;gap:4px 16px;flex-wrap:wrap;align-items:center;padding-top:9px;border-top:1px solid var(--line)}
.st-ad .act2 .v2link{font-size:12px;color:var(--ink-2)}
.st-ad .act2 .v2link:hover{color:var(--ink)}
.st-ad .act2 .v2link.del{color:var(--bad);margin-left:auto}
.st-tag{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:3px 8px;border-radius:99px;background:var(--surface);color:var(--ink);border:1px solid var(--line-strong);box-shadow:0 2px 8px -4px rgba(0,0,0,.45)}
.st-tag.ok{color:var(--good)} .st-tag.warn{color:var(--warn)}
.st-tag i{width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block}
.st-empty{padding:28px 20px;text-align:center;color:var(--muted);font-size:13.5px;border:1px dashed var(--line-strong);border-radius:10px;line-height:1.5}
.st-empty b{display:block;color:var(--ink);font-weight:600;margin-bottom:4px}
.st-busy{display:inline-flex;gap:8px;align-items:center;font-size:13px;color:var(--ink-2)}
.st-spin{width:15px;height:15px;border-radius:50%;border:2px solid var(--line-strong);border-top-color:var(--brand);animation:stspin .8s linear infinite;flex:none}
@keyframes stspin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.st-spin{animation:none}}
.st-prog{display:inline-block;height:6px;border-radius:3px;background:var(--surface-2);overflow:hidden;width:90px;vertical-align:middle}
.st-prog i{display:block;height:100%;background:var(--good);border-radius:3px}
.st-fold{border:1px solid var(--line);border-radius:10px;background:var(--surface)}
.st-fold > summary{cursor:pointer;list-style:none;padding:13px 18px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13.5px;font-weight:650;color:var(--ink)}
.st-fold > summary::-webkit-details-marker{display:none}
.st-fold > summary::before{content:'';width:7px;height:7px;border-right:1.6px solid var(--muted);border-bottom:1.6px solid var(--muted);transform:rotate(-45deg);transition:transform .12s;margin-right:2px}
.st-fold[open] > summary::before{transform:rotate(45deg)}
.st-fold > summary span{font-weight:400;font-size:13px;color:var(--muted)}
.st-fold > .st{padding:0 14px 14px}
.st-fold > .st > .v2card{border-color:var(--line);background:var(--bg)}
.st-zoom{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.82);display:grid;place-items:center;padding:20px;cursor:zoom-out}
.st-zoom img{max-height:92vh;max-width:92vw;object-fit:contain;border-radius:6px}
.st-zoom video{max-height:92vh;max-width:92vw;border-radius:8px;background:var(--bg);cursor:auto}
.st-vid{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;padding:6px 8px;border-radius:8px;background:var(--brand-soft);font-size:12px;color:var(--ink-2)}
.st-vid b{color:var(--ink)}
.st-vid.bad{background:var(--bad-bg);color:var(--bad)}
.st-vid .btn{padding:4px 8px;font-size:11.5px}
.st-vid .bs{display:flex;gap:4px;flex-wrap:wrap}
.st-vgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin-top:4px}
.st-vt{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--surface);display:flex;flex-direction:column}
.st-vt .pv{aspect-ratio:9/16;background:var(--surface-2);display:grid;place-items:center;color:var(--muted);font-size:12px;text-align:center;padding:10px;position:relative}
.st-vt .pv video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.st-vt .mt{padding:8px 9px;display:grid;gap:6px;font-size:12px}
.st-vt .mt b{font-size:12.5px;line-height:1.3;color:var(--ink)}
.st-vt .acts{display:flex;gap:5px;flex-wrap:wrap}.st-vt .acts .btn{padding:4px 8px;font-size:11.5px}
.st-pick{max-height:52vh;overflow:auto;display:grid;gap:6px;padding:2px}
.st-pick label{display:grid;grid-template-columns:20px 48px minmax(0,1fr) auto;gap:10px;align-items:center;font-size:13.5px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;cursor:pointer;text-align:left;margin:0;width:auto;font-weight:500;color:var(--ink)}
.st-pick label:hover{border-color:var(--line-strong);background:var(--surface-2)}
.st-pick label:has(input:checked){border-color:var(--brand);background:var(--brand-soft)}
.st-pick input[type=checkbox]{width:18px;height:18px;margin:0;padding:0;flex:none;accent-color:var(--brand)}
.st-pick .num{font-weight:650;color:var(--brand);font-variant-numeric:tabular-nums}
.st-pick .ttl{font-weight:600;line-height:1.3}
.st-pick .tiny{white-space:nowrap}
@media (max-width:520px){.st-pick label{grid-template-columns:20px 42px minmax(0,1fr)}.st-pick .tiny{display:none}}
.st-ol{margin:6px 0 0;padding-left:20px;display:grid;gap:6px;font-size:13.5px;color:var(--ink-2)}
.st-code{font-family:ui-monospace,Consolas,monospace;font-size:12px;background:var(--surface-2);color:var(--ink);padding:2px 6px;border-radius:5px;word-break:break-all}
.st-modal .modal h3{font-size:15px;font-weight:650;margin:0 0 10px;color:var(--ink)}
.st-modal .modal a:not(.btn){color:var(--brand)}
.st-key{border-left:3px solid var(--warn)}
.st-start{display:grid;gap:14px}
.st-start .alt{display:flex;gap:4px 8px;align-items:center;flex-wrap:wrap}
.st-brands .v2go{min-height:64px}
/* the photo library picker and the Dress window (2026-10-08) */
.st-lgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px;max-height:48vh;overflow:auto;margin-top:10px;padding:2px}
.st-lgrid button{position:relative;aspect-ratio:1;border:2px solid var(--line);border-radius:9px;overflow:hidden;padding:0;background:var(--surface-2);cursor:pointer;display:grid;place-items:center;color:var(--muted);font:inherit;font-size:11px}
.st-lgrid button:hover{border-color:var(--line-strong)}
.st-lgrid button.on{border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}
.st-lgrid img{width:100%;height:100%;object-fit:cover;display:block}
.st-lgrid em,.st-dthumb em{position:absolute;left:5px;bottom:5px;font-style:normal;font-size:10px;font-weight:650;padding:1px 6px;border-radius:99px;background:var(--brand);color:var(--on-brand)}
.st-lgrid .ck{position:absolute;right:5px;top:5px;width:20px;height:20px;border-radius:50%;background:var(--brand);color:var(--on-brand);display:none;place-items:center;font-size:12px;font-weight:700}
.st-lgrid button.on .ck{display:grid}
.st-lmode{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}
.st-dress{display:grid;gap:14px}
.st-dthumb{position:relative;width:120px;aspect-ratio:4/5;border-radius:10px;overflow:hidden;border:1px solid var(--line);background:var(--surface-2);cursor:zoom-in;padding:0;display:block}
.st-dthumb img{width:100%;height:100%;object-fit:cover;display:block}
.st-drow{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px}
.st-dgo{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding-top:12px;border-top:1px solid var(--line)}
.st-dres{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.st-dres figure{margin:0;display:grid;gap:6px}
.st-dres img{width:100%;max-height:52vh;object-fit:contain;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);cursor:zoom-in}
.st-dres figcaption{font-size:11.5px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.st-ulines{display:grid;gap:6px;max-height:40vh;overflow:auto;margin-top:8px}
.st-ulines label{display:grid;grid-template-columns:18px minmax(0,1fr);gap:10px;align-items:start;padding:9px 11px;border:1px solid var(--line);border-radius:9px;cursor:pointer;font-size:13px;font-weight:500;color:var(--ink);margin:0}
.st-ulines label:has(input:checked){border-color:var(--brand);background:var(--brand-soft)}
.st-ulines input{margin:2px 0 0;accent-color:var(--brand)}
.st-ulines small{display:block;color:var(--muted);font-size:11.5px;margin-top:2px}
`;
  document.head.appendChild(st);
}
/* hover text through the v2 tooltip when the shell has it, a plain title otherwise */
const tip = t => window.V2UI?.tipAttr ? window.V2UI.tipAttr(esc(t)) : ` title="${esc(t)}"`;

/* ---------------- small modal ---------------- */
function modal(title, inner, { cta = 'Save', wide = false, onOpen } = {}) {
  return new Promise(resolve => {
    const w = document.createElement('div');
    w.className = 'modal-wrap st-modal';
    w.style.zIndex = 80;
    w.innerHTML = `<div class="modal" style="max-width:${wide ? 880 : 560}px" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>
      <div>${inner}</div><p class="st-msg" data-m="msg" style="margin-top:10px"></p>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button class="btn" data-m="no">${cta ? 'Cancel' : 'Close'}</button>${cta ? `<button class="btn primary" data-m="yes">${esc(cta)}</button>` : ''}</div></div>`;
    document.body.appendChild(w);
    const done = v => { w.remove(); document.removeEventListener('keydown', k); resolve(v); };
    /* Escape closes only the window on top (the library picker opens over Dress, Use as the ad over both). */
    const k = e => { if (e.key === 'Escape' && w === [...document.querySelectorAll('.st-modal')].pop()) done(null); };
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
    const brands = S.accounts.filter(a => a.act_id !== 'all');
    main.innerHTML = `<div class="st">${head('Studio', 'Studio makes a brand’s static ads from the brief, one ad per line. Pick the brand whose ads you are making this week.')}
      ${V2card('Pick a brand', `${brands.length} brand${brands.length === 1 ? '' : 's'}. Batches, products and the Canva folder are kept per brand.`,
        brands.length ? `<div class="v2gos st-brands">${brands.map(a => `<button class="v2go" data-act="${esc(a.act_id)}"><b>${esc(a.name)}</b><span>Open its batches</span><i>›</i></button>`).join('')}</div>`
          : '<div class="st-empty"><b>No brands yet</b>Add a brand in Settings, then come back to make its ads.</div>')}</div>`;
    main.querySelectorAll('[data-act]').forEach(b => b.onclick = () => S.pick && S.pick(b.dataset.act));
    return;
  }
  main.innerHTML = `<div class="st"><div class="v2card"><span class="st-busy"><span class="st-spin"></span>Loading the batches…</span></div></div>`;
  if (S.lastAct !== act) { S.cur = null; S.products = null; S.lastAct = act; }
  await reload();
}
async function reload() {
  const [d, at, v] = await Promise.all([api(`/api/studio?act=${encodeURIComponent(S.act)}`), atriaCall('/api/atria/status').catch(() => null), loadVids()]);
  S.d = d; S.atria = at; S.vids = v;
  watchVids();
  if (S.cur && S.cur.id !== 'loose') S.cur = S.d.batches.find(b => b.id === S.cur.id) || null;
  paint();
}
const adsOf = b => (S.d.ads || []).filter(a => b ? a.batch_id === b.id : !a.batch_id);
const live = ads => ads.filter(a => a.status !== 'deleted');

/* Where a batch stands, in the words the list and the lead sentence use. */
function batchState(b) {
  const ads = live(adsOf(b)), ok = ads.filter(a => a.status === 'approved').length;
  if (S.makingAll && S.cur?.id === b.id) return { tone: 'warn', label: 'Being made', ads, ok };
  if (!ads.length) return b.plan ? { tone: 'warn', label: 'Planned, not made', ads, ok } : { tone: '', label: 'Brief only', ads, ok };
  if (ok === ads.length) return { tone: 'good', label: 'Ready for Canva', ads, ok };
  return { tone: 'warn', label: `${ads.length - ok} to review`, ads, ok, review: ads.length - ok };
}
/* The one sentence at the top: what is waiting on the designer right now. */
function leadLine(batches) {
  if (!batches.length) return 'No batches yet. Press <b>New batch</b> and pick this week’s brief from Asana.';
  const st = batches.map(batchState);
  const rev = st.filter(s => s.review), ads = rev.reduce((t, s) => t + s.review, 0);
  const ready = st.filter(s => s.label === 'Ready for Canva').length, planned = st.filter(s => s.label === 'Planned, not made').length;
  const bits = [];
  if (ads) bits.push(`<b>${ads} ad${ads === 1 ? '' : 's'} to review</b> in ${rev.length} batch${rev.length === 1 ? '' : 'es'}`);
  if (ready) bits.push(`<b>${ready} batch${ready === 1 ? '' : 'es'} ready for Canva</b>`);
  if (planned) bits.push(`${planned} batch${planned === 1 ? '' : 'es'} planned but not made`);
  if (!bits.length) return 'Nothing is waiting on you. Start a new batch from this week’s brief.';
  return (bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}` : bits[0]) + '.';
}
const crumb = () => typeof window.crumbFor === 'function' ? `<div class="ph-crumb">${window.crumbFor('studio')}</div>` : '';
const head = (title, say, acts = '') => `<div class="st-head"><div>${crumb()}<h2>${title}</h2>${say ? `<p class="v2say lead">${say}</p>` : ''}</div>${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
/* A v2 card: h3, the one-line finding, a cap on the right (buttons or a note). Title and find arrive escaped. */
function V2card(title, find, body, cap = '', { n = '', cls = '', id = '' } = {}) {
  return `<section class="v2card ${cls}"${id ? ` id="${id}"` : ''}><div class="v2h">${n !== '' ? `<span class="n">${n}</span>` : ''}<h3>${title}</h3>${find ? `<span class="find">${find}</span>` : ''}${cap ? `<span class="cap">${cap}</span>` : ''}</div>${body}</section>`;
}

function paint() {
  const main = $('#main'), d = S.d, y = window.scrollY;
  const loose = live(adsOf(null));
  /* Newest first, and two batches read from the same brief are told apart by when they were made
     and how many ads they hold. An empty copy gets a quiet Archive button; nothing is removed for you. */
  const batches = (d.batches || []).slice().sort((p, q) => String(q.created_at || '').localeCompare(String(p.created_at || '')));
  const dupKey = b => `${b.num || ''}|${(b.name || b.brief?.angle || '').trim().toLowerCase()}`;
  const seen = {}; batches.forEach(b => { seen[dupKey(b)] = (seen[dupKey(b)] || 0) + 1; });
  const li = b => {
    const s = batchState(b), n = s.ads.length, dup = seen[dupKey(b)] > 1, lines = (b.brief?.lines || []).length;
    return `<div class="st-lw"><button class="st-li ${S.cur?.id === b.id ? 'on' : ''}" data-b="${b.id}"><b>${batchTitle(b)}</b>
      <span class="st-lt"><span class="v2pill ${s.tone}">${esc(s.label)}</span><span>${n ? `${n} ad${n === 1 ? '' : 's'}` : `${lines} line${lines === 1 ? '' : 's'}`}${madeOn(b) ? ` · ${esc(madeOn(b))}` : ''}</span></span>
      ${dup ? `<span class="dup">${n ? 'Same brief as another batch' : 'Empty copy of another batch'}</span>` : ''}</button>${dup && !n ? `<button class="btn quiet" data-barch="${b.id}">Archive this empty copy</button>` : ''}</div>`;
  };
  const spend = d.has_key ? `<span class="v2pill"${tip('What the image AI has cost for this brand since the 1st of the month: every ad made, redone, changed and fitted to 4:5.')}>This month $${(d.spent_month || 0).toFixed(2)}</span>` : '';
  main.innerHTML = `<div class="st">
    ${head(`Studio: ${esc(d.account?.name || '')}`, leadLine(batches), `${spend}<button class="btn" id="stConn">Connections</button>`)}
    ${d.has_key ? '' : keyCard()}
    <div class="st-layout">
      <div class="st-side">${V2card('Batches', '', `<div class="st-list">${batches.map(li).join('') || '<div class="st-empty"><b>No batches yet</b>Press New batch to read this week’s brief from Asana.</div>'}
          ${loose.length ? `<button class="st-li ${S.cur?.id === 'loose' ? 'on' : ''}" data-b="loose"><b>Earlier ads</b><span>${loose.length} made before batches</span></button>` : ''}</div>`,
        `<button class="btn" id="stNew">New batch</button>`)}</div>
      <div id="stMain" class="st">${S.cur?.id === 'loose' ? looseView(loose) : S.cur ? batchView(S.cur) : startView()}</div>
    </div></div>`;
  window.scrollTo(0, y);
  wireTop();
  if (S.cur?.id === 'loose') wireAds();
  else if (S.cur) wireBatch();
  else wireStart();
}
const batchTitle = b => `${b.num ? `#${esc(b.num)} · ` : ''}${esc(b.name || b.brief?.angle || 'Untitled batch')}`;
/* created_at comes from the database as UTC "YYYY-MM-DD HH:MM:SS". */
const madeOn = b => { const s = String(b.created_at || ''); if (!s) return ''; const t = new Date(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z'); return isNaN(t) ? '' : t.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };

/* ---------------- the five steps, in words ---------------- */
const STEPS = ['Pick the brief', 'Check the plan', 'Make the ads', 'Review', 'Send to Canva'];
const STEP_NOW = ['', 'Check the brief and choose the product, then press Plan the ads.', 'Read the plan and fix anything you like, then press Make.', 'The ads are being made. Keep this page open.', 'Approve the ads you want, change or redo the rest, then send them to Canva.', 'Every ad is approved. Send them to Canva.'];
function stepsBar(now) {
  return `<ol class="st-steps" aria-label="The steps">${STEPS.map((t, i) => `<li class="${i + 1 < now ? 'done' : i + 1 === now ? 'now' : ''}"${i + 1 === now ? ' aria-current="step"' : ''}><span class="n">${i + 1 < now ? '✓' : i + 1}</span>${t}</li>`).join('')}</ol>`;
}
function stepNow(b) {
  const ads = live(adsOf(b));
  if (S.makingAll) return 3;
  if (!ads.length) return b.plan ? 2 : 1;
  return ads.every(a => a.status === 'approved') ? 5 : 4;
}

/* ---------------- key + canva ---------------- */
function keyCard() {
  return V2card('Studio cannot make ads yet', 'The image AI is not connected.', `<p class="hint" style="margin:0 0 10px">Paste an OpenAI API key (platform.openai.com/api-keys, with billing on). Locus keeps it on the server and never shows it again.</p>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap"><label class="st-f" style="flex:1;min-width:200px">OpenAI API key<input class="st-in" id="stKeyIn" type="password" autocomplete="off" placeholder="sk-..."></label><button class="btn primary" id="stKeySave">Connect</button></div>
    <p class="st-msg" id="stKeyMsg" style="margin-top:8px"></p>`, '', { cls: 'st-key' });
}
function wireTop() {
  $('#stConn').onclick = connections;
  const save = $('#stKeySave');
  if (save) save.onclick = async () => {
    const m = $('#stKeyMsg'); m.textContent = 'Checking the key with OpenAI…'; m.className = 'st-msg';
    try { await post('/api/studio/key', { key: $('#stKeyIn').value }); await reload(); }
    catch (e) { m.textContent = e.message; m.className = 'st-msg bad'; }
  };
  $('#stNew').onclick = () => newBatch();
  document.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { S.cur = b.dataset.b === 'loose' ? { id: 'loose' } : S.d.batches.find(x => x.id === b.dataset.b); S.err = ''; S.setupOpen = false; paint(); });
  document.querySelectorAll('[data-barch]').forEach(x => x.onclick = () => archiveEmpty(S.d.batches.find(b => b.id === x.dataset.barch)));
}
/* Connections (2026-10-05): the four connect buttons left the top of the page for one panel.
   Each row opens the same setup window as before; only the image AI key is needed to make ads,
   and the page itself warns when that one is missing (keyCard). */
function connections() {
  const d = S.d, c = d.canva || {};
  const rows = [
    ['key', 'Image AI (OpenAI)', 'Needed to make ads.', !!d.has_key, d.has_key ? 'Connected' : 'Not connected. Studio cannot make ads.', d.has_key ? 'Change the key' : 'Connect', true],
    ['canva', 'Canva', 'Send to Canva puts a batch in a Canva folder. Without it the ads download instead.', !!c.connected, c.connected ? 'Connected' : c.configured ? 'App saved, not signed in yet' : 'Not connected', c.connected ? 'Manage' : 'Connect'],
    ['hf', 'Higgsfield', 'The video AI. Needed only for Make a video.', !!S.hf?.connected, S.hf?.connected ? 'Connected' : 'Not connected', S.hf?.connected ? 'Manage' : 'Connect'],
    ['atria', 'Atria', 'Lets the Slack ideas bot open Atria ad links. One connection for every brand.', !!S.atria?.connected, S.atria?.connected ? 'Connected' : 'Not connected', S.atria?.connected ? 'Manage' : 'Connect'],
  ];
  const nOn = rows.filter(r => r[3]).length;
  modal('Connections', `<p class="hint" style="margin:0 0 4px">${d.has_key ? `${nOn} of ${rows.length} connected. Only the image AI is needed to make ads. The others add the steps after it: Canva, video and the Slack ideas bot.` : 'Connect the image AI first: Studio cannot make ads without it.'}</p>
    <div>${rows.map(([k, name, what, on, state, cta, need]) => `<div class="st-crow"><div><b>${name}</b><span class="v2pill ${on ? 'good' : need ? 'warn' : ''}">${state}</span><span class="tiny">${what}</span></div><button class="btn ${!on && need ? 'primary' : ''}" data-conn="${k}">${cta}</button></div>`).join('')}</div>`,
  { cta: null, onOpen: (w, ctl) => {
    const open = { key: keySetup, canva: canvaSetup, hf: hfSetup, atria: atriaSetup };
    w.querySelectorAll('[data-conn]').forEach(x => x.onclick = () => { ctl.close(); open[x.dataset.conn](); });
  } });
}
function keySetup() {
  const on = !!S.d.has_key;
  modal('Image AI key', `<p class="hint" style="margin:0 0 10px">${on ? 'A key is connected. Paste a new one to replace it, or leave it empty and save to disconnect.' : 'Paste an OpenAI API key (platform.openai.com/api-keys, with billing on). Locus keeps it on the server and never shows it again.'}</p><label class="st-f">${on ? 'New OpenAI API key' : 'OpenAI API key'}<input class="st-in" id="k2" type="password" autocomplete="off" placeholder="sk-..."></label>`,
  { cta: on ? 'Save' : 'Connect', onOpen: (w, ctl) => w.onSubmit(async () => { await post('/api/studio/key', { key: w.querySelector('#k2').value }); ctl.close(true); reload(); }) });
}
/* An empty copy of a batch (same number and name as another, no ads) can be archived from the list.
   Same save as the Archive button on the batch, asked first because the list is one click away. */
function archiveEmpty(b) {
  if (!b) return;
  modal('Archive this empty batch?', `<p class="hint" style="margin:0">${batchTitle(b)}${madeOn(b) ? `, made ${esc(madeOn(b))}` : ''}, has no ads. It leaves this list. The other batch with the same name is not touched.</p>`,
  { cta: 'Archive it', onOpen: (w, ctl) => w.onSubmit(async () => {
    if (S.cur?.id === b.id) { clearTimeout(saveT); S.cur = null; }
    await post('/api/studio/batch/save', { batch: { ...b, status: 'archived' } });
    ctl.close(true); reload();
  }) });
}
/* Atria (2026-09-29): one workspace-wide sign-in so the Slack ideas bot can open Atria ad links.
   The whole OAuth dance lives on the account-health worker (atria.js); nothing secret comes here. */
async function atriaCall(path, method = 'GET') {
  const res = await fetch(AH_URL + path, { method, headers: { Authorization: 'Bearer ' + S.tok } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
  return j;
}
function atriaSetup() {
  const on = !!S.atria?.connected;
  modal('Connect Atria', `
    <p class="hint" style="margin:0 0 8px">Lets the Slack ideas bot open Atria ad links and draft a brief from them.</p>
    <details class="st-how" style="margin-bottom:8px"><summary>How this works</summary><p class="hint">Paste an Atria ad link (or a Meta Ad Library link) in a brand's internal Slack channel and tag @Mobius Digital. The ideas bot opens the ad in Atria, watches the video, reads the copy, the landing page and how long it has been running, and drafts the brief from it.</p></details>
    ${on ? `<p class="st-msg ok" style="margin-bottom:8px">Connected${S.atria.since ? ` since ${esc(new Date(S.atria.since).toLocaleDateString())}` : ''}. One connection covers every brand.</p>`
      : `<ol class="st-ol"><li>Click <b>Connect Atria</b>. Atria's sign-in opens in a new tab.</li><li>Sign in with the Atria account the team uses and allow <b>read</b> access.</li><li>Come back here and refresh the page.</li></ol>`}
    <p class="hint" style="margin:8px 0 0">Locus only reads from Atria. It never saves, follows or changes anything there.</p>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">${on ? '<button class="btn" id="atGo">Sign in again</button><button class="btn" id="atOff">Disconnect</button>' : '<button class="btn primary" id="atGo">Connect Atria</button>'}</div>`,
  { cta: null, onOpen: (w, ctl) => {
    w.querySelector('#atGo').onclick = async () => {
      try { const r = await atriaCall('/api/atria/start', 'POST'); window.open(r.url, '_blank', 'noopener'); ctl.msg('Finish signing in to Atria in the new tab, then refresh this page.', true); }
      catch (e) { ctl.msg(e.message); }
    };
    const off = w.querySelector('#atOff');
    if (off) off.onclick = async () => { try { await atriaCall('/api/atria/disconnect', 'POST'); ctl.close(); reload(); } catch (e) { ctl.msg(e.message); } };
  } });
}
function hfSetup() {
  const on = !!S.hf?.connected;
  modal('Connect Higgsfield', `
    <p class="hint" style="margin:0 0 8px">Higgsfield is the video AI. Connect it once for the whole team; the key stays on our server and is never shown again.</p>
    ${on ? `<p class="st-msg ok" style="margin-bottom:8px">Connected${S.hf.since ? ` since ${esc(String(S.hf.since).slice(0, 10))}` : ''}. Paste a new key below only to replace it.</p>` : ''}
    <ol class="st-ol">
      <li>Open <a href="https://cloud.higgsfield.ai" target="_blank" rel="noopener">cloud.higgsfield.ai</a> and sign in with the team's Higgsfield account.</li>
      <li>Create an API key named <b>Locus Studio</b>. Keep that window open.</li>
      <li>Click <b>Copy API key</b>, paste it in the first box, and click <b>Connect</b>. Leave Secret empty unless Higgsfield gave you one.</li>
    </ol>
    <div class="st-g2" style="margin-top:10px"><label class="st-f">API key<input class="st-in" id="hfKey" type="password" autocomplete="off"></label><label class="st-f">Secret<small>only if Higgsfield showed one</small><input class="st-in" id="hfSecret" type="password" autocomplete="off"></label></div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn primary" id="hfGo">Connect</button>${on ? '<button class="btn" id="hfOff">Disconnect</button>' : ''}</div>`,
  { cta: null, onOpen: (w, ctl) => {
    w.querySelector('#hfGo').onclick = async () => {
      ctl.msg('Checking the key with Higgsfield…', true);
      try {
        const r = await streamCallJson(AH_URL, '/api/studio-ai/higgsfield', { key: w.querySelector('#hfKey').value, secret: w.querySelector('#hfSecret').value });
        S.hf = { connected: true, since: new Date().toISOString() };
        ctl.msg(r.credits_note || 'Connected. Higgsfield is ready.', !r.credits_note);
        setTimeout(() => { ctl.close(); paint(); }, r.credits_note ? 4000 : 1200);
      } catch (e) { ctl.msg(e.message); }
    };
    const off = w.querySelector('#hfOff');
    if (off) off.onclick = async () => { try { await streamCallJson(AH_URL, '/api/studio-ai/higgsfield', { clear: true }); S.hf = { connected: false }; ctl.close(); paint(); } catch (e) { ctl.msg(e.message); } };
  } });
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
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn" id="cvSave">Save the app</button><button class="btn primary" id="cvGo">Connect Canva</button>${c.configured ? '<button class="btn" id="cvOff">Disconnect</button>' : ''}</div>`,
  { cta: null, onOpen: (w, ctl) => {
    w.querySelector('#cvSave').onclick = async () => {
      try { await post('/api/studio/canva/setup', { client_id: w.querySelector('#cvId').value, client_secret: w.querySelector('#cvSecret').value }); S.d.canva = { configured: true, connected: false }; w.querySelector('#cvGo').disabled = false; ctl.msg('Saved. Now click Connect Canva.', true); }
      catch (e) { ctl.msg(e.message); }
    };
    w.querySelector('#cvGo').onclick = async () => {
      try {
        /* One button: if the ID and secret are typed in, save them first. */
        const id = w.querySelector('#cvId').value.trim(), sec = w.querySelector('#cvSecret').value.trim();
        if (id && sec) { await post('/api/studio/canva/setup', { client_id: id, client_secret: sec }); S.d.canva = { configured: true, connected: false }; }
        else if (!S.d.canva?.configured) throw new Error('Paste the Client ID and the Client secret first.');
        const r = await api(`/api/studio/canva/start?act=${encodeURIComponent(S.act)}`); window.open(r.url, '_blank', 'noopener'); ctl.msg('Finish signing in to Canva in the new tab, then refresh this page.', true); }
      catch (e) { ctl.msg(e.message); }
    };
    const off = w.querySelector('#cvOff');
    if (off) off.onclick = async () => { await post('/api/studio/canva/setup', { client_id: '' }); ctl.close(); reload(); };
  } });
}

/* ---------------- start / new batch ---------------- */
function startView() {
  return `${V2card('Make a batch of ads', 'Start with the brief your team wrote in Asana. Studio makes one ad per line of it.', `<div class="st-start">
    ${stepsBar(1)}
    <div><button class="btn primary" data-start="asana">Pick the brief from Asana</button></div>
    <div class="alt"><span class="tiny">No Asana brief?</span><button class="btn quiet" data-start="paste" title="One brief, or a whole plan that becomes many batches">Paste a brief or a plan</button><button class="btn quiet" data-start="blank" title="Type the angle and the lines yourself">Start blank</button></div>
    <p class="tiny" style="margin:0">Or open a batch on the left to keep going where you left off.</p></div>`)}
    ${videosCard(null)}`;
}
function wireStart() { document.querySelectorAll('[data-start]').forEach(b => b.onclick = () => newBatch(b.dataset.start)); wireVideos(); }
async function newBatch(mode = null) {
  if (mode === 'blank') return saveNew([{ name: 'New batch', angle: '', why: '', concept: '', testing: 'concepts', lines: [{ text: '' }, { text: '' }, { text: '' }] }]);
  const asana = mode === 'paste' ? [] : (await api(`/api/studio/asana?act=${encodeURIComponent(S.act)}`).catch(() => ({ briefs: [] }))).briefs;
  const paste = mode === 'paste' || !asana.length;
  modal('New batch', `
    <div class="st-chips" style="margin-bottom:10px"><button class="st-chip ${paste ? '' : 'on'}" data-tab="asana">From Asana</button><button class="st-chip ${paste ? 'on' : ''}" data-tab="paste">Paste</button></div>
    <div data-pane="asana" ${paste ? 'hidden' : ''}>${asana.length ? `<p class="hint" style="margin:0 0 8px">Open tests in Asana. Tick one or more; Locus opens each brief doc and lays it out.</p>
      <div class="st-pick">${asana.map(a => `<label><input type="checkbox" value="${esc(a.id)}"><span class="num">#${esc(a.num)}</span><span class="ttl">${esc(a.title || '')}</span><span class="tiny">${a.has_brief ? (a.stage === 'production' ? 'In Studio' : 'Brief') : 'No brief yet'}</span></label>`).join('')}</div>`
      : '<div class="st-empty"><b>No open Asana tests for this brand yet</b>Add the test in Asana’s Creative Brief section, or switch to Paste and drop the brief in here.</div>'}</div>
    <div data-pane="paste" ${paste ? '' : 'hidden'}><p class="hint" style="margin:0 0 8px">Paste one brief (Angle, Testing, 1-2-3) or a whole plan in any format, text or CSV. A plan with many angles becomes many batches.</p>
      <textarea class="st-in" id="nbText" rows="12" placeholder="ANGLE: The gift that actually fixes their game&#10;TESTING: concepts&#10;1. Unboxing the Carver on Christmas morning&#10;2. Before and after: chunked chip vs clean chip&#10;3. 'Stop buying him socks' in bold type"></textarea></div>`,
  { cta: 'Read the brief', wide: true, onOpen: (w, ctl) => {
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
  const now = stepNow(b), ok = ads.filter(a => a.status === 'approved').length;
  const off = ads.filter(a => a.check?.ok === false).length;

  /* 1. where the batch stands: the steps and the one thing to do now */
  const top = V2card(batchTitle(b), madeOn(b) ? `Made ${esc(madeOn(b))}` : '', `${stepsBar(now)}<p class="st-now v2say"><b>Now:</b> ${STEP_NOW[now]}</p>`,
    ads.length ? `<span class="tiny">${ok} of ${ads.length} approved</span><span class="st-prog"${tip(`${ok} of ${ads.length} ads approved. Send to Canva sends the approved ones, or all of them when none is approved.`)}><i style="width:${(ok / ads.length * 100).toFixed(0)}%"></i></span>` : '');

  const brief = V2card('The brief', 'Angle, why, and one line per ad.', `
    <div class="st-g2">
      <label class="st-f">Angle<small>the argument, one sentence</small><textarea class="st-in" data-bf="angle" rows="2">${esc(br.angle)}</textarea></label>
      <label class="st-f">Why<small>what we believe about the customer</small><textarea class="st-in" data-bf="why" rows="2">${esc(br.why)}</textarea></label>
      <label class="st-f" style="grid-column:1/-1">Concept<small>only when every line is inside one proven concept</small><input class="st-in" data-bf="concept" value="${esc(br.concept)}"></label>
      ${br.post_copy ? `<label class="st-f" style="grid-column:1/-1">Post copy<small>goes with the ads in Meta, not on the images</small><textarea class="st-in" data-bf="post_copy" rows="2">${esc(br.post_copy)}</textarea></label>` : ''}
    </div>
    <p class="st-lbl" style="margin-top:16px">What we're testing</p>
    <div class="st-chips">${TESTING.map(([k, l, h]) => `<button class="st-chip ${br.testing === k ? 'on' : ''}" data-test="${k}">${l}<small>${h}</small></button>`).join('')}</div>
    <p class="st-lbl" style="margin-top:16px">Lines · one ad each</p>
    <div>${lines.map((l, i) => `<div class="st-bl"><span class="k">${i + 1}</span>
      <div style="display:grid;gap:6px"><textarea class="st-in" style="margin:0" data-line="${i}" rows="2" placeholder="The concept or piece for this ad, in the team's words">${esc(l.text)}</textarea>
        <div class="st-thumbs">${l.photo
          ? `<span class="tiny">This photo is the ad (kept as shot, words added):</span><button class="t on" data-zu="${esc(l.photo)}"><img src="${esc(thumb(l.photo))}" alt=""><span class="st-x" data-rmph="${i}" role="button" aria-label="Not the ad" title="Back to inspiration">×</span></button>`
          : `<span class="tiny">Make it look like this:</span>${(l.inspo || []).map((u, k) => `<button class="t" data-zu="${esc(u)}"><img src="${esc(thumb(u))}" alt=""><span class="st-x" data-rmli="${i}:${k}" role="button" aria-label="Remove" title="Remove">×</span></button><button class="st-add" data-useph="${i}:${k}" title="A real photo of our product: keep it exactly as shot and only add the words">Use as the ad</button>`).join('')}${(l.inspo || []).length < 2 ? `<button class="st-add" data-addli="${i}">Add image</button><button class="st-add" data-libli="${i}" title="Pick from the brand’s photo library: as inspiration, or as the ad itself">From the library</button>` : ''}`}</div></div>
      <button class="btn quiet" data-rmline="${i}" title="Remove this line" aria-label="Remove line ${i + 1}">Remove</button></div>`).join('') || '<div class="st-empty"><b>No lines yet</b>Add a line for each ad you want. Studio makes one ad per line.</div>'}</div>
    <button class="btn" id="bAddLine" style="margin-top:10px">Add a line</button>`,
    `<label class="st-f" style="display:flex;gap:6px;align-items:center">Batch #<input class="st-in" data-bf="num" value="${esc(b.num)}" style="width:80px;margin:0"></label><button class="btn quiet" id="bDel">Archive this batch</button>`, { n: 1 });

  const prods = su.products || [];
  const product = V2card('Product and inspiration', 'Still step 1. The AI draws the product from these photos and checks every ad against them.', `
    <div class="st-g2">
      <div><p class="st-sub">Product</p><div class="hint">Tick 5 or 6 clean studio photos. The AI draws from them and checks every ad against them.</div>
        ${prods.map((p, pi) => `<div style="margin-top:12px"><div class="st-bar"><b style="font-size:13px;color:var(--ink)">${esc(p.title)}</b><button class="btn quiet" data-rmprod="${pi}">Remove</button></div>
          <div class="st-thumbs" style="margin-top:6px">${(p.all || []).map(u => `<button class="t ${(su.images || []).includes(u) ? 'on' : ''}" data-img="${esc(u)}" title="${(su.images || []).includes(u) ? 'Used: click to stop using it' : 'Not used: click to use it'}"><img src="${esc(thumb(u))}" alt=""></button>`).join('')}</div>
          <label class="st-f" style="margin-top:10px">Product fingerprint<small>what makes it ours; the AI must match every line. Fix anything wrong.</small>${p.dna == null ? '<span class="st-busy" style="display:flex;margin-top:6px"><span class="st-spin"></span>Reading the product photos…</span>' : `<textarea class="st-in" data-dna="${pi}" rows="5">${esc(p.dna)}</textarea>`}</label>
          <button class="btn quiet" data-redna="${pi}" style="margin-top:6px">Read the photos again</button></div>`).join('') || '<div class="st-empty" style="margin-top:10px;padding:18px"><b>No product yet</b>Choose it from the store, or add photos from a shoot.</div>'}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="btn" id="bProd" ${prods.length >= 4 ? 'disabled' : ''}>${prods.length ? 'Add another product' : 'Choose the product'}</button>
        <button class="btn quiet" id="bPhotos" title="Photos from a shoot that are not on Shopify yet. The AI draws from them and checks against them like Shopify photos.">Add your own photos</button>
        <button class="btn quiet" id="bLib" title="Product photos from the brand’s photo library (its Drive), used like your own photos.">From the library</button></div>
        <div class="st-crow" style="margin-top:12px"><div><b>Dress a photo</b><span class="tiny">Put this product on a real photo of a person: their face, pose and light stay as shot. Saved to the library as a look you can use as the ad.</span></div><button class="btn" id="bDress">Dress a photo</button></div>
      </div>
      <div><p class="st-sub">Swipe file</p><div class="hint">Ads you like, for style ideas. Nothing is copied. Up to 12: drop, click or paste.</div>
        <div class="st-thumbs" style="margin-top:10px">${(su.swipe || []).map((u, k) => `<button class="t" data-zu="${esc(u)}"><img src="${esc(u)}" alt=""><span class="st-x" data-rmsw="${k}" role="button" aria-label="Remove" title="Remove">×</span></button>`).join('')}${(su.swipe || []).length < 12 ? '<button class="st-add" id="bSwipe">Add images</button>' : ''}</div></div>
    </div>
    <input type="file" id="bFile" accept="image/png,image/jpeg,image/webp" multiple hidden>`, '', { n: 1 });

  const planC = V2card('The plan', plan ? (plan.variation ? `Testing ${esc(br.testing)} inside one concept: ad 1 is made, and the others change only the words.` : 'Each ad is its own idea. Change anything before you make them.') : 'The art director writes each ad from the brief and the product. Nothing is spent until Make.',
    plan ? `<div class="st-plan">${plan.ads.map((a, i) => planRow(a, i, plan)).join('')}</div>`
      : `<details class="st-how"><summary>How this works</summary><p class="hint">It reads the brief, the product and any inspiration, then writes each ad: the words (in the brand's voice, keeping yours where you gave them), the look, the type style, and which inspiration it follows.</p></details>`,
    `${S.busy === 'plan' ? '<span class="st-busy"><span class="st-spin"></span>The art director is planning. About a minute.</span>' : ''}<button class="btn ${plan ? 'quiet' : 'primary'}" id="bPlan" ${S.busy || S.making ? 'disabled' : ''}>${plan ? 'Plan again' : 'Plan the ads'}</button>`, { n: 2 });

  /* review: the approved count, then each ad large */
  const sum = ads.length ? `<div class="st-chips" style="margin-bottom:12px;gap:6px">
      <span class="v2pill ${ok ? 'good' : ''}">${ok} approved</span>${ads.length - ok ? `<span class="v2pill warn">${ads.length - ok} to review</span>` : ''}
      ${off ? `<span class="v2pill bad"${tip('The check model scored the product on these ads as not matching the photos. Look closely, then Redo or Change with AI.')}>${off} with the product maybe off</span>` : ''}</div>` : '';
  const reviewFind = ads.length ? (ok === ads.length ? 'Every ad is approved. Send them to Canva.' : 'Approve the ones to keep. Change with AI fixes one thing; Redo makes the ad again.')
    : plan ? `The plan is ready. Make spends about $${(n * PER_AD).toFixed(2)} on the image AI.` : 'Nothing to make until the plan is written.';
  const review = V2card(ads.length ? 'Review the ads' : 'Make the ads', reviewFind, `
    <p class="st-msg bad" style="margin:0 0 10px">${esc(S.err || '')}</p>
    ${sum}
    ${ads.length ? `<div class="st-board">${ads.slice().sort((p, q) => (p.line ?? 99) - (q.line ?? 99)).map(a => adCard(a)).join('')}</div>`
      : plan ? `<div class="st-empty"><b>Nothing made yet</b>Read the plan, fix anything you like, then press Make. Two ads are made at a time; keep this page open.</div>`
      : `<div class="st-empty"><b>Nothing to make yet</b>Fill in the brief, choose the product, then press Plan the ads (step 2).</div>`}`,
    `${S.making ? `<span class="st-busy"><span class="st-spin"></span>${esc(S.making)}</span>` : ''}
      ${plan ? `<button class="btn ${ads.length ? 'quiet' : 'primary'}" id="bMake" ${S.making || S.busy ? 'disabled' : ''}>${ads.length ? `Make all ${n} again` : `Make ${n} ad${n === 1 ? '' : 's'}`} · about $${(n * PER_AD).toFixed(2)}</button>` : ''}
      ${ads.length ? `<button class="btn quiet" id="bDl" ${S.making ? 'disabled' : ''}>Download all</button><button class="btn ${now === 5 ? 'primary' : ''}" id="bCanva" ${S.making ? 'disabled' : ''}>${ok ? `Send ${ok} approved to Canva` : `Send all ${ads.length} to Canva`}</button>` : ''}`, { n: ads.length ? 4 : 3 });

  const setup = brief + product + planC;
  /* Once ads exist the reader came to review them: the review comes first and the brief, product and
     plan fold underneath (still all there, still editable, the same buttons). */
  if (ads.length) return `${top}${review}
    <details class="st-fold" id="stSetup" ${S.setupOpen ? 'open' : ''}><summary>The brief, product and plan<span>Steps 1 and 2. Open to change them, then make the batch again.</span></summary><div class="st">${setup}</div></details>
    ${videosCard(b)}`;
  return `${top}${setup}${review}${videosCard(b)}`;
}
function planRow(a, i, plan) {
  const lock = plan.variation && i > 0;
  const ref = a.photo_url ? `<div class="st-thumbs"><span class="tiny">This photo is the ad</span><button class="t on" data-zu="${esc(a.photo_url)}"><img src="${esc(thumb(a.photo_url))}" alt=""></button></div>` : a.ref_url ? `<div class="st-thumbs"><button class="t" data-zu="${esc(a.ref_url)}"><img src="${esc(thumb(a.ref_url))}" alt=""></button><select class="st-in" style="width:auto;margin:0" data-pf="${i}:ref_use" ${lock ? 'disabled' : ''}><option value="copy" ${a.ref_use === 'copy' ? 'selected' : ''}>Look like this</option><option value="vibe" ${a.ref_use === 'vibe' ? 'selected' : ''}>Just the vibe</option><option value="none" ${a.ref_use === 'none' ? 'selected' : ''}>Ignore it</option></select></div>` : '<span class="tiny">No inspiration</span>';
  return `<div class="st-prow"><div class="top"><b>Ad ${i + 1}${plan.variation && i === 0 ? ' · the base' : ''}</b><span class="tiny">${esc(a.note || '')}</span></div>
    <div class="st-g3"><label class="st-f">Headline<input class="st-in" data-pf="${i}:headline" value="${esc(a.headline)}"></label>
      <label class="st-f">Smaller line<input class="st-in" data-pf="${i}:subline" value="${esc(a.subline)}"></label>
      <label class="st-f">Button<input class="st-in" data-pf="${i}:cta" value="${esc(a.cta)}"></label></div>
    <div class="st-g2"><label class="st-f">Callouts<small>one per line</small><textarea class="st-in" data-pf="${i}:callouts" rows="2">${esc((a.callouts || []).join('\n'))}</textarea></label>
      <label class="st-f">${a.photo_url ? 'What to add or change on the photo' : 'The look'}${lock ? '<small>same as ad 1 in this test</small>' : ''}<textarea class="st-in" data-pf="${i}:look" rows="2" ${lock ? 'disabled' : ''}>${esc(a.look)}</textarea></label></div>
    ${plan.exact ? `<div class="st-bar"><div class="st-thumbs"><span class="tiny">Product</span><select class="st-in" style="width:auto;margin:0" data-pf="${i}:photo" ${lock ? 'disabled' : ''}><option value="0" ${!a.photo ? 'selected' : ''}>AI-drawn (check the details)</option>${(S.cur.setup.cutouts || []).map((c, k) => `<option value="${k + 1}" ${+a.photo === k + 1 ? 'selected' : ''}>Real photo ${k + 1}</option>`).join('')}</select>${a.photo ? `<button class="t" data-zu="${esc((S.cur.setup.cutouts || [])[a.photo - 1]?.url || '')}"><img src="${esc((S.cur.setup.cutouts || [])[a.photo - 1]?.url || '')}" alt="" style="object-fit:contain;background:var(--surface-2)"></button>` : ''}</div>
      <div><select class="st-in" style="width:auto;margin:0" data-pf="${i}:place" ${lock ? 'disabled' : ''}>${['center', 'left', 'right', 'lower', 'upper'].map(v => `<option ${a.place === v ? 'selected' : ''}>${v}</option>`).join('')}</select><select class="st-in" style="width:auto;margin:0" data-pf="${i}:size" ${lock ? 'disabled' : ''}>${['small', 'medium', 'large'].map(v => `<option ${a.size === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>` : ''}
    <div class="st-bar"><div><span class="tiny">Type</span><select class="st-in" style="width:auto;margin:0" data-pf="${i}:style" ${lock ? 'disabled' : ''}>${STYLES.map(([k, l]) => `<option value="${k}" ${a.style === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>${ref}</div></div>`;
}
/* One ad, large. The actions are ranked: Approve first, then Change with AI and Redo (they spend),
   then the quiet ones (video, download, delete) under a line. */
function adCard(a) {
  const s = a.spec || {}, ck = a.check, appr = a.status === 'approved';
  const chk = ck?.exact ? `<span class="v2pill good"${tip('Built on a real photo of the product, kept as shot. Nothing about the product was drawn.')}>Real product photo</span>`
    : ck ? (ck.ok === false ? `<span class="v2pill warn"${tip(`The check model thinks the product may not match the photos${ck.issue ? `: ${ck.issue}` : ''}. Look closely before approving.`)}>Product may be off</span>`
      : ck.ok ? `<span class="v2pill good"${tip(`The check model compared the product in this ad with the product photos${ck.score != null ? ` and scored it ${ck.score} out of 10` : ''}${ck.tries ? `. This is the best of ${ck.tries} tries` : ''}. A net, not a guarantee: still look at it.`)}>Product ${ck.score != null ? ck.score + '/10' : 'checked'}${ck.tries ? ` · best of ${ck.tries}` : ''}</span>` : '') : '';
  const zn = ck?.zone, zone = !zn ? '' : zn.ok ? `<span class="v2pill good"${tip('Every word sits inside the centre square, so nothing is cut where Meta shows the ad square.')}>Words inside the square</span>`
    : `<span class="v2pill warn"${tip(`${zn.issue || 'Some words are outside the centre square'}. Meta cuts them where it shows the ad square. Change with AI or Redo.`)}>Words outside the square</span>`;
  const sz = ck?.story_zone, szp = !s.story || !sz ? '' : sz.ok ? `<span class="v2pill good"${tip('The 9:16 version keeps every word clear of the Stories and Reels buttons.')}>9:16 safe</span>`
    : `<span class="v2pill warn"${tip(`${sz.issue}. The Stories or Reels buttons may cover them.`)}>9:16 words near the buttons</span>`;
  const pills = chk + zone + szp;
  const tags = [a.line != null ? `<span class="st-tag">Ad ${a.line + 1}</span>` : '', appr ? '<span class="st-tag ok"><i></i>Approved</span>' : ''].join('');
  return `<div class="st-ad ${appr ? 'ok' : ''}"><div class="pic" data-zoom="${a.id}" title="Open it large"><img src="${esc(shown(a))}" alt="${esc(s.headline || 'Ad')}" loading="lazy"><div class="tags">${tags}</div></div>
    <div class="meta"><b>${esc(s.headline || s.product || '')}</b>${pills ? `<div class="pills">${pills}</div>` : ''}${ck?.ok === false && ck.issue ? `<span class="st-msg bad">${esc(ck.issue)}</span>` : ''}
      <div class="act1">${appr ? `<button class="btn" data-unapprove="${a.id}">Unapprove</button>` : `<button class="btn primary" data-approve="${a.id}">Approve</button>`}<button class="btn" data-change="${a.id}" title="Say what to change and only that changes. About 25 cents.">Change with AI</button><button class="btn" data-redo="${a.id}" title="Make this one again from the plan. The old one goes to Deleted.">Redo</button></div>
      ${vidStrip(a)}
      <div class="act2"><button class="v2link" data-vid="${a.id}" title="Turn this ad into an 8-second vertical video">Make video</button><button class="v2link" data-dl="${a.id}">Download</button>${s.story || s.tall ? `<button class="v2link" data-dl9="${a.id}" title="The tall version for Stories and Reels">Download 9:16</button><button class="v2link" data-st9="${a.id}" title="Make the 9:16 again. About ${Math.round(STORY_COST * 100)} cents.">Redo 9:16</button>` : `<button class="v2link" data-st9="${a.id}" title="The same ad laid out tall for Stories and Reels, words kept clear of their buttons. About ${Math.round(STORY_COST * 100)} cents.">Make 9:16</button>`}<button class="v2link del" data-del="${a.id}" title="Take it out of the batch">Delete</button></div></div></div>`;
}
/* ---- Videos: "Make a video" (any video, Higgsfield) and the brand's / batch's videos ---- */
const LOOKS = [['auto', 'Let the AI decide', 'it picks the format'], ['ugc', 'UGC', 'a real-looking person on a phone'], ['cinematic', 'Product cinematic', 'premium B-roll shots'],
  ['animated', 'Animated 3D', 'Pixar-style characters'], ['clay', 'Claymation', 'stop-motion clay'], ['motion', 'Motion graphics', 'moving text and shapes'], ['recreate', 'Recreate a reference', 'copy a video you upload']];
function videosCard(b) {
  const list = (S.vids || []).filter(v => v.kind === 'create' && (b ? v.batch_id === b.id : !v.batch_id));
  return V2card('Videos', b ? 'Optional. An AI video from this batch\u2019s brief and product.' : 'Optional. Any AI video: UGC, product shots, animation or a copy of a reference.',
    list.length ? `<div class="st-vgrid">${list.map(vidTile).join('')}</div>` : '<p class="tiny" style="margin:0">None yet. Make a video writes the shot with AI and shows the price before anything is spent.</p>',
    `<button class="btn" data-vnew="${b ? b.id : ''}">Make a video</button>`);
}
function vidTile(v) {
  const pv = v.status === 'ready' ? `<video src="${esc(v.url)}" muted loop playsinline preload="metadata"></video>` : v.status === 'failed' ? esc(v.error || 'It failed.') : '<span class="st-busy"><span class="st-spin"></span>Making it. 2 to 6 minutes.</span>';
  return `<div class="st-vt"><div class="pv" ${v.status === 'ready' ? `data-vplay="${v.id}" style="cursor:pointer"` : ''}>${pv}</div>
    <div class="mt"><b>${esc(v.title || 'Video')}</b><span class="tiny">${v.seconds || ''}s${v.cost ? ` \u00b7 $${(+v.cost).toFixed(2)}` : ''}</span>
      <div class="acts">${v.status === 'ready' ? `<button class="btn" data-vplay="${v.id}">Play</button><button class="btn" data-vdl="${v.id}">Download</button>` : ''}${v.status !== 'working' ? `<button class="btn" data-vagain="${v.id}">${v.status === 'failed' ? 'Try again' : 'Make another'}</button>` : ''}<button class="btn" data-vrm="${v.id}">Delete</button></div></div></div>`;
}
function wireVideos() {
  document.querySelectorAll('[data-vnew]').forEach(x => x.onclick = () => makeAnyVideo(x.dataset.vnew ? S.d.batches.find(b => b.id === x.dataset.vnew) : null));
  document.querySelectorAll('[data-vagain]').forEach(x => x.onclick = () => { const v = S.vids.find(y => y.id === x.dataset.vagain); makeAnyVideo(v.batch_id ? S.d.batches.find(b => b.id === v.batch_id) : null, v); });
  document.querySelectorAll('.st-vt video').forEach(el => { el.onmouseenter = () => el.play().catch(() => {}); el.onmouseleave = () => el.pause(); });
  if (!S.cur || S.cur.id === 'loose') wireVidButtons();
}
function wireVidButtons() {
  document.querySelectorAll('[data-vplay]').forEach(x => x.onclick = () => playVid(S.vids.find(v => v.id === x.dataset.vplay)));
  document.querySelectorAll('[data-vdl]').forEach(x => x.onclick = () => downloadVid(S.vids.find(v => v.id === x.dataset.vdl)));
  document.querySelectorAll('[data-vrm]').forEach(x => x.onclick = async () => { await streamCallJson(AH_URL, '/api/studio-ai/video-delete', { id: x.dataset.vrm }).catch(e => { S.err = e.message; }); S.vids = S.vids.filter(v => v.id !== x.dataset.vrm); paint(); });
}
async function upAh(file) {
  const res = await fetch(`${AH_URL}/api/studio-ai/upload?act=${encodeURIComponent(S.act)}`, { method: 'POST', headers: { Authorization: 'Bearer ' + S.tok, 'Content-Type': file.type }, body: file });
  const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'Upload failed'); return j.url;
}
async function makeAnyVideo(b, again = null) {
  if (!S.hf?.connected) { hfSetup(); return; }
  if (!S.products) { const r = await api(`/api/studio/products?act=${encodeURIComponent(S.act)}`).catch(() => ({ products: [] })); S.products = r.products || []; }
  const su = b?.setup || {}, refs = again ? safeRefs(again) : null;
  const st = { look: 'auto', seconds: 8, aspect: '9:16', quality: 'draft', images: refs ? refs.images : (su.images || []).slice(0, 4), videos: refs ? refs.videos : [], prompt: again?.prompt || '', title: again?.title || '', why: '', usd: null, prodTitles: (su.products || []).map(p => p.title) };
  const chips = (list, cur, attr) => list.map(([k, l, h]) => `<button class="st-chip ${String(k) === String(cur) ? 'on' : ''}" data-${attr}="${k}">${esc(l)}${h ? `<small>${esc(h)}</small>` : ''}</button>`).join('');
  const body = () => `
    <label class="st-f">What's the video?<small>plain words. For example: "A golfer pulls a ball marker off his belt mid-round and says why he'll never go back to pockets" or "Claymation: a sock monster eats tees until our belt saves the day"</small><textarea class="st-in" id="vIdea" rows="3">${esc(st.idea || '')}</textarea></label>
    <p class="st-lbl" style="margin-top:8px">Look</p><div class="st-chips" data-grp="look">${chips(LOOKS, st.look, 'lk')}</div>
    <p class="st-lbl" style="margin-top:10px">Product and references</p>
    <div class="st-thumbs">${st.images.map((u, k) => `<button class="t" data-zu="${esc(u)}"><img src="${esc(thumb(u))}" alt=""><span class="st-x" data-rmimg="${k}" role="button" aria-label="Remove" title="Remove">\u00d7</span></button>`).join('')}
      ${st.videos.map((u, k) => `<span class="st-chip on" style="cursor:default">Reference video ${k + 1} <span data-rmvid="${k}" role="button" style="cursor:pointer;margin-left:6px;text-decoration:underline">Remove</span></span>`).join('')}
      <select class="st-in" id="vProd" style="width:auto;margin:0"><option value="">Add a product\u2019s photos\u2026</option>${(S.products || []).map((p, i) => `<option value="${i}">${esc(p.title)}</option>`).join('')}</select>
      <button class="st-add" id="vAddImg">Add image</button><button class="st-add" id="vAddVid">Add video</button></div>
    <input type="file" id="vFile" hidden>
    <div class="st-g2" style="margin-top:10px">
      <div><p class="st-lbl">Length</p><div class="st-chips" data-grp="len">${chips([[5, '5s'], [8, '8s'], [10, '10s'], [15, '15s'], [20, '20s']], st.seconds, 'sec')}</div></div>
      <div><p class="st-lbl">Shape</p><div class="st-chips" data-grp="shape">${chips([['9:16', '9:16', 'Reels, Stories'], ['1:1', '1:1', 'feed'], ['3:4', '3:4', 'close to 4:5']], st.aspect, 'asp')}</div></div></div>
    <p class="st-lbl" style="margin-top:10px">Quality</p><div class="st-chips" data-grp="q">${chips([['draft', 'Draft', '720p, cheaper'], ['best', 'Best', '1080p']], st.quality, 'vq')}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px"><p class="st-lbl" style="margin:0">The shot</p><button class="btn" id="vWrite">${st.prompt ? 'Write it again' : 'Write the shot with AI'}</button></div>
    ${st.why ? `<p class="hint" style="margin:4px 0">${esc(st.why)}</p>` : ''}
    <textarea class="st-in" id="vPrompt" rows="7" placeholder="Press Write the shot, or type exactly what the camera should see. Edit anything before you make it.">${esc(st.prompt)}</textarea>
    <p class="hint" id="vCost" style="margin-top:6px">${st.usd != null ? `About $${st.usd.toFixed(2)} for this video.` : 'The price shows here once the shot is written.'}</p>`;
  modal(b ? `Make a video \u00b7 ${b.name || 'batch'}` : 'Make a video', `<div id="vBody">${body()}</div>`, { cta: 'Make the video', wide: true, onOpen: (w, ctl) => {
    const keep = () => { st.idea = w.querySelector('#vIdea').value; st.prompt = w.querySelector('#vPrompt').value; };
    const redraw = (k = true) => { if (k) keep(); w.querySelector('#vBody').innerHTML = body(); wire(); };
    const price = async () => {
      const el = w.querySelector('#vCost'); if (!st.prompt.trim()) return;
      el.textContent = 'Checking the price\u2026';
      try { const r = await streamCallJson(AH_URL, '/api/studio-ai/video-estimate', payload()); st.usd = r.usd; el.textContent = `About $${r.usd.toFixed(2)} for this video.`; }
      catch (e) { el.textContent = e.message; }
    };
    const payload = () => ({ prompt: st.prompt, image_urls: st.images, video_urls: st.videos, seconds: st.seconds, aspect: st.aspect, quality: st.quality, look: st.look, title: st.title, batch_id: b?.id || null });
    const wire = () => {
      w.querySelectorAll('[data-lk]').forEach(x => x.onclick = () => { st.look = x.dataset.lk; redraw(); });
      w.querySelectorAll('[data-sec]').forEach(x => x.onclick = () => { st.seconds = +x.dataset.sec; redraw(); price(); });
      w.querySelectorAll('[data-asp]').forEach(x => x.onclick = () => { st.aspect = x.dataset.asp; redraw(); price(); });
      w.querySelectorAll('[data-vq]').forEach(x => x.onclick = () => { st.quality = x.dataset.vq; redraw(); price(); });
      w.querySelectorAll('[data-rmimg]').forEach(x => x.onclick = e => { e.stopPropagation(); st.images.splice(+x.dataset.rmimg, 1); redraw(); });
      w.querySelectorAll('[data-rmvid]').forEach(x => x.onclick = () => { st.videos.splice(+x.dataset.rmvid, 1); redraw(); });
      w.querySelectorAll('[data-zu]').forEach(x => x.onclick = e => { if (!e.target.closest('.st-x')) zoom(x.dataset.zu); });
      w.querySelector('#vProd').onchange = e => { const p = S.products[+e.target.value]; if (!p) return; st.images = [...st.images, ...p.images.slice(0, 3)].slice(0, 8); if (!st.prodTitles.includes(p.title)) st.prodTitles.push(p.title); redraw(); };
      const file = w.querySelector('#vFile');
      w.querySelector('#vAddImg').onclick = () => { file.accept = 'image/png,image/jpeg,image/webp'; file.click(); };
      w.querySelector('#vAddVid').onclick = () => { file.accept = 'video/mp4,video/quicktime'; file.click(); };
      file.onchange = async () => {
        const f = file.files[0]; file.value = ''; if (!f) return;
        ctl.msg(`Uploading ${f.name}\u2026`, true);
        keep(); try { const u = await upAh(f); if (/^video\//.test(f.type)) { st.videos = [...st.videos, u].slice(0, 3); if (st.look === 'auto') st.look = 'recreate'; } else st.images = [...st.images, u].slice(0, 8); ctl.msg('Added.', true); redraw(false); }
        catch (e) { ctl.msg(e.message); }
      };
      w.querySelector('#vPrompt').oninput = e => { st.prompt = e.target.value; };
      w.querySelector('#vWrite').onclick = async () => {
        keep(); ctl.msg('Writing the shot. About 20 seconds.', true);
        try {
          const r = await streamCallJson(AH_URL, '/api/studio-ai/video-shot', { idea: st.idea, look: st.look, seconds: st.seconds, aspect: st.aspect, products: st.prodTitles, n_images: st.images.length, n_videos: st.videos.length, brief: b?.brief || null });
          st.prompt = r.prompt; st.title = r.title; st.why = r.why; ctl.msg('', true); redraw(false); price();
        } catch (e) { ctl.msg(e.message); }
      };
    };
    wire(); if (st.prompt) price();
    w.onSubmit(async () => {
      keep(); if (!st.prompt.trim()) throw new Error('Write the shot first (or type it).');
      ctl.msg('Sending it to Higgsfield\u2026', true);
      const r = await streamCallJson(AH_URL, '/api/studio-ai/video-create', payload());
      S.vids = [r.video, ...(S.vids || [])]; ctl.close(true); paint(); watchVids();
    });
  } });
}
const safeRefs = v => { try { const r = JSON.parse(v.refs_json || '{}'); return { images: r.images || [], videos: r.videos || [] }; } catch { return { images: [], videos: [] }; } };

/* ---- Make video (Veo, on the account-health worker; studio-video.js there) ---- */
const VID_MOTIONS = [['push', 'Slow push-in', 'the camera eases toward the product'], ['light', 'Light sweep', 'a glint of light moves across it'],
  ['alive', 'Background comes alive', 'the scene moves, the product stays still'], ['orbit', 'Slow turn', 'a slight arc around the product']];
const vidQ = () => S.hf?.connected ? [['fast', 'Best', '1080p'], ['lite', 'Draft', '720p, cheaper']] : [['fast', 'Best', '$1.20'], ['lite', 'Draft', '40¢']];
async function loadVids() { try { const r = await streamCallJson(AH_URL, '/api/studio-ai/videos', {}); S.hf = r.higgsfield || S.hf; return r.videos || []; } catch { return S.vids || []; } }
const vidOf = a => (S.vids || []).find(v => v.ad_id === a.id);
function vidStrip(a) {
  const v = vidOf(a); if (!v) return '';
  if (v.status === 'working') return `<div class="st-vid"><span class="st-busy"><span class="st-spin"></span>Making the video. About 2 minutes.</span></div>`;
  if (v.status === 'failed') return `<div class="st-vid bad"><span>${esc(v.error || 'The video failed.')}</span><button class="btn" data-vid="${a.id}">Try again</button></div>`;
  return `<div class="st-vid"><b>Video ready</b><span class="bs"><button class="btn" data-vplay="${v.id}">Play</button><button class="btn" data-vdl="${v.id}">Download</button><button class="btn" data-vrm="${v.id}" title="Delete the video">Delete</button></span></div>`;
}
let vidT = null;
function watchVids() {
  clearTimeout(vidT);
  if (!(S.vids || []).some(v => v.status === 'working')) return;
  vidT = setTimeout(async () => {
    const before = JSON.stringify((S.vids || []).map(v => v.status));
    S.vids = await loadVids();
    if (JSON.stringify(S.vids.map(v => v.status)) !== before && !document.querySelector('.modal-wrap')) paint();
    watchVids();
  }, 15000);
}
/* The ad is 4:5; Veo makes 9:16. The frame is the ad centred on a blurred, darkened copy of itself. */
async function frame916(a) {
  const im = await loadImg(shown(a));
  const W = 720, H = 1280, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const cover = Math.max(W / im.width, H / im.height);
  x.filter = 'blur(28px) brightness(0.8)';
  x.drawImage(im, (W - im.width * cover) / 2, (H - im.height * cover) / 2, im.width * cover, im.height * cover);
  x.filter = 'none';
  const h = im.height * (W / im.width);
  x.drawImage(im, 0, (H - h) / 2, W, h);
  return c.toDataURL('image/jpeg', 0.92);
}
function makeVideo(a) {
  let motion = 'push', quality = 'fast';
  const chips = (list, cur, attr) => list.map(([k, l, h]) => `<button class="st-chip ${k === cur ? 'on' : ''}" data-${attr}="${k}">${esc(l)}<small>${esc(h)}</small></button>`).join('');
  modal('Make a video from this ad', `<p class="hint" style="margin:0 0 10px">An 8-second vertical video of this ad. Only motion is added. About 2 minutes; check the words and the product before you use it.</p>
    <p class="st-lbl">How it moves</p><div class="st-chips" id="vMo">${chips(VID_MOTIONS, motion, 'mo')}</div>
    <label class="st-f" style="margin-top:10px">Anything else?<small>optional, for example "the grass sways" or "steam rises from the cup"</small><input class="st-in" id="vNote" maxlength="300"></label>
    <p class="st-lbl" style="margin-top:10px">Quality</p><div class="st-chips" id="vQ">${chips(vidQ(), quality, 'q')}</div>`,
  { cta: 'Make the video', onOpen: (w, ctl) => {
    const wire = () => {
      w.querySelectorAll('[data-mo]').forEach(b => b.onclick = () => { motion = b.dataset.mo; w.querySelector('#vMo').innerHTML = chips(VID_MOTIONS, motion, 'mo'); wire(); });
      w.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { quality = b.dataset.q; w.querySelector('#vQ').innerHTML = chips(vidQ(), quality, 'q'); wire(); });
    };
    wire();
    w.onSubmit(async () => {
      ctl.msg('Sending the ad to the video model…', true);
      const image = await frame916(a);
      const r = await streamCallJson(AH_URL, '/api/studio-ai/animate', { ad_id: a.id, image, motion, quality, note: w.querySelector('#vNote').value.trim() });
      S.vids = [r.video, ...(S.vids || [])];
      ctl.close(true); paint(); watchVids();
    });
  } });
}
function playVid(v) { const z = document.createElement('div'); z.className = 'st-zoom'; z.innerHTML = `<video src="${esc(v.url)}" controls autoplay playsinline loop></video>`; z.onclick = e => { if (e.target === z) z.remove(); }; document.body.appendChild(z); }
async function downloadVid(v) {
  try {
    const a = S.d.ads.find(x => x.id === v.ad_id), blob = await (await fetch(v.url)).blob();
    const o = URL.createObjectURL(blob), l = document.createElement('a');
    l.href = o; l.download = fileName(a || {}, S.cur?.id === 'loose' ? null : S.cur).replace(/\.png$/, '') + ' 9x16.mp4';
    document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(o), 4000);
  } catch (e) { S.err = e.message; paint(); }
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
  /* Archiving has no undo in the UI, so it asks first (2026-10-05). */
  $('#bDel').onclick = () => modal('Archive this batch?', `<p class="hint" style="margin:0">${batchTitle(b)} leaves the Batches list, with its ads. Nothing is deleted from Canva or Meta.</p>`,
    { cta: 'Archive it', onOpen: (w, ctl) => w.onSubmit(async () => { b.status = 'archived'; await saveCur(); S.cur = null; ctl.close(true); reload(); }) });
  const file = $('#bFile'); let target = null;
  document.querySelectorAll('[data-addli]').forEach(el => el.onclick = () => { target = { line: +el.dataset.addli }; file.click(); });
  const sw = $('#bSwipe'); if (sw) sw.onclick = () => { target = { swipe: true }; file.click(); };
  const ph = $('#bPhotos'); if (ph) ph.onclick = () => { target = { product: true }; file.click(); };
  file.onchange = () => { upload([...file.files], target); file.value = ''; };
  /* From the library (2026-10-08): the same targets as an upload; a line can take the pick as inspiration or as the ad itself. */
  document.querySelectorAll('[data-libli]').forEach(el => el.onclick = () => {
    const i = +el.dataset.libli, room = Math.max(1, 2 - (br.lines[i].inspo || []).length);
    libPick({ title: `Line ${i + 1}: from the library`, max: room, people: '',
      modes: [['inspo', 'Make it look like this', 'Inspiration for the AI, up to 2 a line'], ['photo', 'Use as the ad', 'One photo, kept as shot; only the words go on']],
      onPick: async (items, mode, ctl) => upload((await libToUrls(items, t => ctl.msg(t, true))).map(url => ({ url })), mode === 'photo' ? { photo: i } : { line: i }) });
  });
  const bl = $('#bLib'); if (bl) bl.onclick = () => {
    const own = su.products.find(p => p.handle === 'upload');
    libPick({ title: 'Product photos from the library', max: Math.max(1, 8 - ((own || {}).all || []).length), people: 'no',
      onPick: async (items, _m, ctl) => upload((await libToUrls(items, t => ctl.msg(t, true))).map(url => ({ url })), { product: true }) });
  };
  const bd = $('#bDress'); if (bd) bd.onclick = () => dress({ batch: b });
  document.querySelectorAll('[data-rmli]').forEach(el => el.onclick = e => { e.stopPropagation(); const [i, k] = el.dataset.rmli.split(':').map(Number); br.lines[i].inspo.splice(k, 1); queueSave(); paint(); });
  /* A real photo of our product can BE the ad: the image maker keeps it as shot and adds the words. */
  document.querySelectorAll('[data-useph]').forEach(el => el.onclick = e => { e.stopPropagation(); const [i, k] = el.dataset.useph.split(':').map(Number); br.lines[i].photo = br.lines[i].inspo.splice(k, 1)[0]; if (b.plan) b.plan = null; queueSave(); paint(); });
  document.querySelectorAll('[data-rmph]').forEach(el => el.onclick = e => { e.stopPropagation(); const l = br.lines[+el.dataset.rmph]; l.inspo = [...(l.inspo || []), l.photo].slice(0, 2); l.photo = ''; if (b.plan) b.plan = null; queueSave(); paint(); });
  /* A product that arrived with photos but no fingerprint yet (pushed from Slack, or just uploaded) reads them now. */
  su.products.forEach(p => { if (p.dna == null && (p.all || []).length && !FP_RUNNING.has(p.handle)) { FP_RUNNING.add(p.handle); fingerprint(p).finally(() => FP_RUNNING.delete(p.handle)); } });
  document.querySelectorAll('[data-rmsw]').forEach(el => el.onclick = e => { e.stopPropagation(); su.swipe.splice(+el.dataset.rmsw, 1); queueSave(); paint(); });
  const main = $('#stMain');
  main.ondragover = e => e.preventDefault();
  main.ondrop = e => { e.preventDefault(); const f = [...e.dataTransfer.files]; if (f.length) upload(f, { swipe: true }); };
  $('#bProd').onclick = pickProduct;
  document.querySelectorAll('[data-img]').forEach(el => el.onclick = () => { const u = el.dataset.img; su.images = su.images.includes(u) ? su.images.filter(x => x !== u) : [...su.images, u].slice(-8); queueSave(); paint(); });
  document.querySelectorAll('[data-dna]').forEach(el => el.oninput = () => {
    const p = su.products[+el.dataset.dna]; p.dna = el.value;
    clearTimeout(el._t); el._t = setTimeout(() => post('/api/studio/dna', { handle: p.handle, text: p.dna }).catch(() => {}), 800); queueSave();
  });
  document.querySelectorAll('[data-redna]').forEach(el => el.onclick = () => fingerprint(su.products[+el.dataset.redna], true));
  document.querySelectorAll('[data-rmprod]').forEach(el => el.onclick = () => { const p = su.products.splice(+el.dataset.rmprod, 1)[0]; su.images = su.images.filter(u => !(p.all || []).includes(u)); queueSave(); paint(); });
  const ex = $('#bExact'); if (ex) ex.onchange = async () => { su.exact = ex.checked; if (b.plan) b.plan = null; await saveCur(); paint(); if (su.exact && !(su.cutouts || []).length) cutAll(); };
  const rc = $('#bRecut'); if (rc) rc.onclick = () => cutAll();
  $('#bPlan').onclick = planAds;
  document.querySelectorAll('[data-pf]').forEach(el => { const h = () => {
    const [i, k] = el.dataset.pf.split(':'); const a = b.plan.ads[+i];
    a[k] = k === 'callouts' ? el.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 4) : k === 'photo' ? +el.value : el.value;
    if (b.plan.variation && +i === 0 && ['look', 'style', 'ref_use', 'photo', 'place', 'size'].includes(k)) b.plan.ads.forEach(x => { x[k] = a[k]; });
    if (k === 'photo') { queueSave(); return paint(); }
    queueSave();
  }; el.oninput = h; el.onchange = h; });
  const fold = $('#stSetup'); if (fold) fold.ontoggle = () => { S.setupOpen = fold.open; };
  const mk = $('#bMake'); if (mk) mk.onclick = makeBatch;
  const dl = $('#bDl'); if (dl) dl.onclick = () => downloadAll(b);
  const cv = $('#bCanva'); if (cv) cv.onclick = () => sendCanva(b);
  wireAds(); wireVideos();
}
/* Paste a screenshot anywhere on a batch (outside a text box) to add it to the swipe file. */
document.addEventListener('paste', e => {
  if (!S.cur || S.cur.id === 'loose' || !$('#bSwipe') || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  const f = [...(e.clipboardData?.files || [])].filter(x => x.type.startsWith('image/'));
  if (f.length) { e.preventDefault(); upload(f, { swipe: true }); }
});
/* Reference images are shrunk in the browser before they go anywhere. The art director (Claude) reads
   at most 2000px a side once a request carries many images and charges by the pixel, and GPT Image
   never needs more than this; 1568px is Anthropic's own "nothing gained past here" size. A full-size
   camera photo in a swipe file killed a whole plan on 2026-10-06. JPEG stays JPEG; PNG and WebP
   become WebP so a cut-out keeps its transparency. */
const REF_MAX = 1568;
async function shrinkImage(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const big = Math.max(bmp.width, bmp.height);
  if (big <= REF_MAX && file.size <= 2.5e6) { bmp.close?.(); return file; }
  const k = Math.min(1, REF_MAX / big), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
  const blob = await new Promise(r => c.toBlob(r, type, 0.9));
  return blob && blob.size ? blob : file;
}
async function putRef(blob) {
  const res = await fetch(S.url.replace(/\/+$/, '') + '/api/studio/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + S.tok, 'Content-Type': blob.type }, body: blob });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.url) throw new Error(j.error || 'Upload failed');
  return j.url;
}
const FP_RUNNING = new Set();
async function upload(files, target) {
  const b = S.cur, su = b.setup, br = b.brief;
  let own = null;
  /* Items are Files from the picker or { url } already stored as a ref (library picks, looks). */
  for (const file of files.filter(f => f.url || /^image\/(png|jpeg|webp)$/.test(f.type))) {
    if (target?.product) { own = own || su.products.find(p => p.handle === 'upload'); if (((own || {}).all || []).length >= 8) break; }
    else if (target?.line != null) { if ((br.lines[target.line].inspo || []).length >= 2) break; }
    else if (target?.photo != null) { if (br.lines[target.photo].photo === file.url) break; }
    else if (su.swipe.length >= 12) break;
    try {
      const url = file.url || await putRef(await shrinkImage(file));
      refChecked.add(url);
      if (target?.photo != null) {
        /* The ad IS this photo (same as "Use as the ad"); one per line, so stop after it. */
        br.lines[target.photo].photo = url; if (b.plan) b.plan = null; break;
      } else if (target?.product) {
        /* Your own photos (a shoot not on Shopify yet) become a product like any Shopify one: drawn from, checked against, fingerprinted. */
        if (!own) { own = { title: 'Your photos', handle: 'upload', all: [], dna: null }; su.products.push(own); }
        own.all.push(url); su.images = [...su.images, url].slice(-8);
      } else if (target?.line != null) (br.lines[target.line].inspo = br.lines[target.line].inspo || []).push(url);
      else su.swipe.push(url);
    } catch (e) { S.err = e.message; }
  }
  await saveCur(); paint();
  if (own && !FP_RUNNING.has(own.handle)) { FP_RUNNING.add(own.handle); fingerprint(own, true).finally(() => FP_RUNNING.delete(own.handle)); }
}
/* Images already on a batch (older uploads, the copies the Slack ideas bot drops in) get the same
   treatment the first time the batch is planned: anything over REF_MAX is shrunk, re-uploaded, and
   the batch points at the small copy. Each URL is checked once per page load. */
const refChecked = new Set();
async function repairRefs(b) {
  const su = b.setup, br = b.brief;
  const fix = async u => {
    if (!u || refChecked.has(u) || !/\/api\/studio\/ref\//.test(u)) return u;
    refChecked.add(u);
    try {
      const blob = await (await fetch(u)).blob();
      const small = await shrinkImage(blob);
      if (small === blob) return u;
      const url = await putRef(small); refChecked.add(url); return url;
    } catch { return u; }
  };
  su.swipe = await Promise.all((su.swipe || []).map(fix));
  for (const l of br.lines || []) if ((l.inspo || []).length) l.inspo = await Promise.all(l.inspo.map(fix));
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
        const prod = { title: p.title, handle: p.handle, type: p.type || '', all: p.images, dna: null };
        su.products.push(prod);
        su.exact = false;
        su.images = [...su.images, ...p.images.slice(0, su.products.length > 1 ? 2 : 6)].slice(0, 8);
        ctl.close(true); await saveCur(); paint();
        fingerprint(prod);
      });
    };
    w.querySelector('#pq').oninput = e => { S.prodQ = e.target.value; draw(); };
    draw();
  } });
}
/* The product fingerprint: made once per product from its photos, editable, reused by every batch. */
async function fingerprint(p, refresh = false) {
  p.dna = null; paint();
  try { const r = await post('/api/studio/dna', { handle: p.handle, title: p.title, images: p.all.slice(0, 8), refresh }); p.dna = r.dna || ''; }
  catch (e) { p.dna = ''; S.err = `Product fingerprint: ${e.message}`; }
  await saveCur(); paint();
}
async function planAds() {
  const b = S.cur, br = b.brief, su = b.setup;
  if (!br.lines.some(l => (l.text || '').trim())) { S.err = 'Write at least one line first.'; return paint(); }
  S.busy = 'plan'; S.err = ''; paint();
  try {
    br.lines = br.lines.filter(l => (l.text || '').trim());
    await repairRefs(b);
    await saveCur();
    const r = await streamCall(AH_URL, '/api/studio-ai/plan', { batch: { angle: br.angle, why: br.why, concept: br.concept, testing: br.testing, lines: br.lines }, products: su.products.map(p => p.title), handles: su.products.map(p => p.handle), swipe: su.swipe, exact: false, cutouts: [] });
    b.plan = { ads: r.ads, variation: r.variation, exact: !!r.exact }; b.status = 'planned';
    await saveCur();
  } catch (e) { S.err = `Planning: ${e.message}`; }
  S.busy = ''; paint();
}
/* ---- exact product: real photos cut out in the browser ----
   Precise hard goods (golf clubs first) drift when AI draws them, so their ads use the real photo:
   plain white studio shots are cut out here (flood fill of the white background from the edges,
   so white highlights inside the product survive), uploaded, and placed on the canvas the model
   builds the scene around. The product pixels are put back on top afterwards. */
const HARD = /wedge|putter|hybrid|driver|iron|fairway|club|wood\b/i;
async function cutoutOf(src) {
  const im = await loadImg(src + (/cdn\.shopify\.com/.test(src) ? (src.includes('?') ? '&' : '?') + 'width=1400' : ''));
  const k = Math.min(1, 1400 / Math.max(im.naturalWidth, im.naturalHeight));
  const W = Math.round(im.naturalWidth * k), H = Math.round(im.naturalHeight * k);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H), px = d.data;
  const white = i => px[i] > 222 && px[i + 1] > 222 && px[i + 2] > 222 && Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]) < 22;
  let edge = 0, edgeN = 0;
  for (let xx = 0; xx < W; xx += 4) { edgeN += 2; edge += white((0 * W + xx) * 4) + white(((H - 1) * W + xx) * 4); }
  for (let yy = 0; yy < H; yy += 4) { edgeN += 2; edge += white((yy * W) * 4) + white((yy * W + W - 1) * 4); }
  if (edge / edgeN < 0.9) return null;
  const bg = new Uint8Array(W * H), stack = [];
  const push = p => { if (!bg[p] && white(p * 4)) { bg[p] = 1; stack.push(p); } };
  for (let xx = 0; xx < W; xx++) { push(xx); push((H - 1) * W + xx); }
  for (let yy = 0; yy < H; yy++) { push(yy * W); push(yy * W + W - 1); }
  while (stack.length) { const p = stack.pop(), xx = p % W, yy = (p / W) | 0; if (xx > 0) push(p - 1); if (xx < W - 1) push(p + 1); if (yy > 0) push(p - W); if (yy < H - 1) push(p + W); }
  /* Keep the product: drop small islands (soft studio shadows, dust) not joined to the main shape. */
  const lab = new Int32Array(W * H), sizes = [0]; let id = 0;
  for (let p0 = 0; p0 < W * H; p0++) {
    if (bg[p0] || lab[p0]) continue;
    id++; let sz = 0; const st = [p0]; lab[p0] = id;
    while (st.length) { const p = st.pop(), xx = p % W; sz++; for (const q of [xx > 0 ? p - 1 : -1, xx < W - 1 ? p + 1 : -1, p - W, p + W]) if (q >= 0 && q < W * H && !bg[q] && !lab[q]) { lab[q] = id; st.push(q); } }
    sizes.push(sz);
  }
  const big = Math.max(...sizes);
  for (let p = 0; p < W * H; p++) if (!bg[p] && sizes[lab[p]] < big * 0.06) bg[p] = 1;
  let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
  for (let p = 0; p < W * H; p++) {
    let a = bg[p] ? 0 : 255;
    if (!bg[p]) { const xx = p % W, yy = (p / W) | 0; const nb = (xx > 0 && bg[p - 1]) + (xx < W - 1 && bg[p + 1]) + (yy > 0 && bg[p - W]) + (yy < H - 1 && bg[p + W]); if (nb) a = 150; n++; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
    px[p * 4 + 3] = a;
  }
  if (n < W * H * 0.01 || n > W * H * 0.92) return null;
  x.putImageData(d, 0, 0);
  const pad = 4; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return { blob: await new Promise(r => o.toBlob(r, 'image/png')), w: o.width, h: o.height };
}
async function cutAll() {
  const b = S.cur, su = b.setup;
  S.cutting = true; paint();
  const out = [];
  for (const p of su.products) for (const u of (p.all || []).slice(0, 12)) {
    if (out.length >= 8) break;
    try {
      const c = await cutoutOf(u); if (!c) continue;
      const res = await fetch(S.url.replace(/\/+$/, '') + '/api/studio/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + S.tok, 'Content-Type': 'image/png' }, body: c.blob });
      const j = await res.json(); if (j.url) out.push({ src: u, url: j.url, w: c.w, h: c.h });
    } catch {}
  }
  su.cutouts = out; S.cutting = false;
  await saveCur(); paint();
}
const SIZE = { small: 0.42, medium: 0.58, large: 0.74 };
const PLACE = { center: [0.5, 0.56], left: [0.32, 0.56], right: [0.68, 0.56], lower: [0.5, 0.66], upper: [0.5, 0.44] };
function rectFor(cut, a) {
  const f = SIZE[a.size] || SIZE.medium, [cx, cy] = PLACE[a.place] || PLACE.center;
  const s = Math.min(f * 1024 / cut.w, f * 1024 / cut.h), w = cut.w * s, h = cut.h * s, m = 56;
  const x = Math.min(1024 - m - w, Math.max(m, cx * 1024 - w / 2)), y = Math.min(1024 - m - h, Math.max(m, cy * 1024 - h / 2));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}
/* Put the real product pixels back on top of a square ad (after make, vary, redo or change). */
async function relock(ad) {
  const cut = ad?.spec?.cut; if (!cut?.url || ad.full_w !== ad.full_h) return ad;
  const [base, pic] = await Promise.all([loadImg(img(ad, 'full')), loadImg(cut.url)]);
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
  const x = c.getContext('2d'); x.drawImage(base, 0, 0, 1024, 1024); x.drawImage(pic, cut.x, cut.y, cut.w, cut.h);
  const fin = await post('/api/studio/finalize', { id: ad.id, png: c.toDataURL('image/png') });
  const i = S.d.ads.findIndex(a => a.id === ad.id); if (i >= 0) S.d.ads[i] = fin.ad;
  return fin.ad;
}
async function makeExact(b, a, i, extra = {}) {
  const cut = (b.setup.cutouts || [])[a.photo - 1];
  const r = rectFor(cut, a);
  const spec = { ...specOf(b, a), exact: true, cut: { url: cut.url, ...r } };
  /* 1. the scene and words, with the product's spot left empty */
  const res = await streamCall(S.url, '/api/studio/make-exact', { spec, batch_id: b.id, line: i, ...extra });
  let ad = res.ads?.[0]; if (!ad) return null;
  S.d.ads.unshift(ad);
  /* 2. the real product into the spot */
  const [scene, pic] = await Promise.all([loadImg(img(ad, 'full')), loadImg(cut.url)]);
  const comp = document.createElement('canvas'); comp.width = 1024; comp.height = 1024;
  const cx = comp.getContext('2d'); cx.drawImage(scene, 0, 0, 1024, 1024); cx.drawImage(pic, r.x, r.y, r.w, r.h);
  /* 3. shadow only: the model may touch a ring around the product, never the product */
  const mask = document.createElement('canvas'); mask.width = 1024; mask.height = 1024;
  const mx = mask.getContext('2d'); mx.fillStyle = '#000'; mx.fillRect(0, 0, 1024, 1024);
  mx.clearRect(Math.max(0, r.x - r.w * 0.18), Math.max(0, r.y + r.h * 0.35), r.w * 1.36, Math.min(1024, r.h * 0.9));
  mx.drawImage(pic, r.x, r.y, r.w, r.h);
  try {
    const h = await streamCall(S.url, '/api/studio/harmonize', { id: ad.id, png: comp.toDataURL('image/png'), mask: mask.toDataURL('image/png') });
    /* Take only the shadow ring from the model's pass (it redraws everything, words included);
       the rest stays the original scene, pixel for pixel. */
    const shaded = await loadImg(img(h.ad, 'plate'));
    const ring = [Math.max(0, r.x - r.w * 0.18), Math.max(0, r.y + r.h * 0.35), r.w * 1.36, Math.min(1024, r.h * 0.9)];
    const t = document.createElement('canvas'); t.width = 1024; t.height = 1024;
    const tx = t.getContext('2d'); tx.drawImage(shaded, 0, 0, 1024, 1024);
    tx.globalCompositeOperation = 'destination-in'; tx.filter = 'blur(14px)'; tx.fillStyle = '#000'; tx.fillRect(ring[0] + 14, ring[1] + 14, ring[2] - 28, ring[3] - 28);
    cx.clearRect(0, 0, 1024, 1024); cx.drawImage(scene, 0, 0, 1024, 1024); cx.drawImage(t, 0, 0); cx.drawImage(pic, r.x, r.y, r.w, r.h);
  } catch { /* no shadow is better than no ad: keep the plain composite */ }
  const fin = await post('/api/studio/finalize', { id: ad.id, png: comp.toDataURL('image/png') });
  const k = S.d.ads.findIndex(x => x.id === ad.id); if (k >= 0) S.d.ads[k] = fin.ad;
  return fin.ad;
}
/* 4:5 with a guaranteed 1:1 safe area: every ad is made square, then placed in a 4:5 canvas with
   transparent bands that the model fills with background only, and the original square goes back
   on top, feathered. See /api/studio/extend. */
/* 2026-10-08 TALL: the worker now makes one 9:16 picture (words kept in the band every placement shows).
   The 4:5 feed ad is cut from its middle here, no AI involved; finalize keeps the tall one as 'story'. */
async function cropFeed(ad) {
  const tall = await loadImg(img(ad, 'full'));
  const W = tall.naturalWidth, H = tall.naturalHeight, ch = Math.round(W * 1.25);
  const out = document.createElement('canvas'); out.width = 1024; out.height = 1280;
  out.getContext('2d').drawImage(tall, 0, Math.round((H - ch) / 2), W, ch, 0, 0, 1024, 1280);
  const fin = await post('/api/studio/finalize', { id: ad.id, png: out.toDataURL('image/png') });
  const i = S.d.ads.findIndex(a => a.id === ad.id); if (i >= 0) S.d.ads[i] = fin.ad; else S.d.ads.unshift(fin.ad);
  return fin.ad;
}
async function extend(ad) {
  if (!ad) return ad;
  if (ad.full_h > ad.full_w * 1.3) return cropFeed(ad);
  if (ad.full_w !== ad.full_h) return ad;
  const sq = await loadImg(img(ad, 'full'));
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1280;
  c.getContext('2d').drawImage(sq, 0, 128, 1024, 1024);
  const r = await streamCall(S.url, '/api/studio/extend', { id: ad.id, png: c.toDataURL('image/png') });
  const ext = await loadImg(img(r.ad, 'ext'));
  const out = document.createElement('canvas'); out.width = 1024; out.height = 1280;
  const x = out.getContext('2d'); x.drawImage(ext, 0, 0, 1024, 1280);
  const t = document.createElement('canvas'); t.width = 1024; t.height = 1280;
  const tx = t.getContext('2d'); tx.drawImage(sq, 0, 128, 1024, 1024);
  const g = tx.createLinearGradient(0, 128, 0, 1152), f = 24 / 1024;
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(f, '#000'); g.addColorStop(1 - f, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
  tx.globalCompositeOperation = 'destination-in'; tx.fillStyle = g; tx.fillRect(0, 128, 1024, 1024);
  x.drawImage(t, 0, 0);
  const fin = await post('/api/studio/finalize', { id: ad.id, png: out.toDataURL('image/png') });
  const i = S.d.ads.findIndex(a => a.id === ad.id); if (i >= 0) S.d.ads[i] = fin.ad; else S.d.ads.unshift(fin.ad);
  return fin.ad;
}
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('Could not load the image.')); i.src = src; });
/* 2026-10-08: a batch with several products used to hand EVERY product to EVERY ad, so the AI crammed
   all of them into each picture (Grunk Burgundy: hoodie, polo and headcover in a weather-report ad).
   Each ad now gets only the products its line (or its plan) names; longest titles match first so
   "Burgundy Drinko Hoodie" is not read as "Burgundy Drinko", and "<title> Collection" is not a product.
   A line that names none of them keeps them all, as before. */
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function lineProducts(b, a) {
  const all = b.setup.products || [];
  if (all.length < 2) return all;
  const i = (b.plan?.ads || []).indexOf(a);
  const named = src => {
    let txt = ' ' + src.filter(Boolean).join(' ').toLowerCase() + ' ';
    const hit = new Set();
    for (const p of [...all].sort((x, y) => y.title.length - x.title.length)) {
      const re = new RegExp(reEsc(p.title.toLowerCase()) + '(?! collection)', 'g');
      if (re.test(txt)) { hit.add(p); txt = txt.replace(re, ' '); }
    }
    return hit;
  };
  /* The team's line wins; the art director's plan text is only a fallback (it tends to list everything). */
  let hit = named([b.brief?.lines?.[i]?.text]);
  if (!hit.size) hit = named([a.look, a.headline, a.subline, ...(a.callouts || [])]);
  return hit.size ? all.filter(p => hit.has(p)) : all;
}
function specOf(b, a) {
  const su = b.setup, ref = a.ref_url && a.ref_use !== 'none' ? [a.ref_url] : [];
  const prods = lineProducts(b, a), own = prods.length < (su.products || []).length ? new Set(prods.flatMap(p => p.all || [])) : null;
  const images = own && su.images.some(u => own.has(u)) ? su.images.filter(u => own.has(u)) : su.images.slice();
  return { products: prods.map(p => ({ title: p.title, handle: p.handle })), images, inspo: ref, ref_use: a.ref_use, base: a.photo_url || '',
    headline: a.headline, subline: a.subline, callouts: a.callouts || [], cta: a.cta, art: a.art || '', look: a.look, style: a.style || 'auto', note: a.note,
    who: b.brief.why || '', dna: prods.map(p => p.dna ? `${p.title}:\n${p.dna}` : '').filter(Boolean).join('\n\n') };
}
async function makeBatch() {
  const b = S.cur, plan = b.plan;
  if (!plan?.ads?.length) return;
  if (!b.setup.images.length && !plan.ads.some(a => a.ref_url || a.photo_url)) { S.err = 'Choose the product first (under the brief).'; return paint(); }
  S.err = '';
  const total = plan.ads.length; let done = 0, failed = 0;
  const tick = () => { S.making = `Made ${done} of ${total}${failed ? `, ${failed} failed` : ''}. Keep this page open.`; paint(); };
  const one = async i => {
    try {
      let ad;
      if (plan.exact && plan.ads[i].photo > 0 && (b.setup.cutouts || [])[plan.ads[i].photo - 1]) ad = await makeExact(b, plan.ads[i], i);
      else { const r = await streamCall(S.url, '/api/studio/make', { spec: specOf(b, plan.ads[i]), n: 1, batch_id: b.id, line: i }, o => { if (o.type === 'ad') S.d.ads.unshift(o.ad); }); ad = r.ads?.[0]; }
      await extend(ad).catch(e => { S.err = `4:5: ${e.message}`; });
      done++; tick(); return ad;
    } catch (e) { failed++; S.err = e.message; tick(); return null; }
  };
  S.makingAll = true; tick();
  if (plan.variation) {
    const base = await one(0);
    if (base) for (let i = 1; i < total; i++) {
      try { const r = await streamCall(S.url, '/api/studio/vary', { base_id: base.id, spec: { ...specOf(b, plan.ads[i]), cut: base.spec?.cut || null, exact: !!base.spec?.exact }, batch_id: b.id, line: i }); S.d.ads.unshift(r.ad); const locked = await relock(r.ad).catch(() => r.ad); await extend(locked).catch(e => { S.err = `4:5: ${e.message}`; }); done++; }
      catch (e) { failed++; S.err = e.message; }
      tick();
    }
  } else {
    let next = 0;
    const lane = async () => { while (next < total) { const i = next++; await one(i); } };
    await Promise.all([lane(), lane()]);
  }
  b.status = 'made'; await saveCur();
  S.making = ''; S.makingAll = false; await reload();
}
window.addEventListener('beforeunload', e => { if (S.making) { e.preventDefault(); e.returnValue = ''; } });
function wireAds() {
  const setStatus = async (id, status) => { const r = await post('/api/studio/status', { id, status }); Object.assign(S.d.ads.find(a => a.id === id), r.ad); paint(); };
  document.querySelectorAll('[data-approve]').forEach(x => x.onclick = () => setStatus(x.dataset.approve, 'approved'));
  document.querySelectorAll('[data-unapprove]').forEach(x => x.onclick = () => setStatus(x.dataset.unapprove, 'review'));
  document.querySelectorAll('[data-del]').forEach(x => x.onclick = () => setStatus(x.dataset.del, 'deleted'));
  document.querySelectorAll('[data-dl]').forEach(x => x.onclick = () => download(S.d.ads.find(a => a.id === x.dataset.dl)));
  document.querySelectorAll('[data-dl9]').forEach(x => x.onclick = () => download(S.d.ads.find(a => a.id === x.dataset.dl9), S.cur, 'story'));
  document.querySelectorAll('[data-st9]').forEach(x => x.onclick = async () => {
    x.disabled = true; x.textContent = 'Making the 9:16…';
    try {
      const r = await streamCall(S.url, '/api/studio/story', { id: x.dataset.st9 });
      const i = S.d.ads.findIndex(a => a.id === r.ad.id); if (i >= 0) S.d.ads[i] = r.ad;
    } catch (e) { S.err = `9:16: ${e.message}`; }
    paint();
  });
  document.querySelectorAll('[data-redo]').forEach(x => x.onclick = () => redo(S.d.ads.find(a => a.id === x.dataset.redo)));
  document.querySelectorAll('[data-change]').forEach(x => x.onclick = () => change(S.d.ads.find(a => a.id === x.dataset.change)));
  document.querySelectorAll('[data-vid]').forEach(x => x.onclick = () => makeVideo(S.d.ads.find(a => a.id === x.dataset.vid)));
  document.querySelectorAll('[data-vplay]').forEach(x => x.onclick = () => playVid(S.vids.find(v => v.id === x.dataset.vplay)));
  document.querySelectorAll('[data-vdl]').forEach(x => x.onclick = () => downloadVid(S.vids.find(v => v.id === x.dataset.vdl)));
  document.querySelectorAll('[data-vrm]').forEach(x => x.onclick = async () => { await streamCallJson(AH_URL, '/api/studio-ai/video-delete', { id: x.dataset.vrm }).catch(e => { S.err = e.message; }); S.vids = S.vids.filter(v => v.id !== x.dataset.vrm); paint(); });
  document.querySelectorAll('[data-zoom]').forEach(p => p.onclick = () => zoom(shown(S.d.ads.find(a => a.id === p.dataset.zoom))));
  document.querySelectorAll('[data-zu]').forEach(p => p.onclick = e => { if (e.target.closest('.st-x')) return; zoom(p.dataset.zu); });
}
function zoom(src) { const z = document.createElement('div'); z.className = 'st-zoom'; z.innerHTML = `<img src="${esc(src)}" alt="">`; z.onclick = () => z.remove(); document.body.appendChild(z); }
async function redo(a) {
  S.making = 'Making that one again…'; S.err = ''; paint();
  try {
    if (a.spec?.varied_from) {
      const r = await streamCall(S.url, '/api/studio/vary', { base_id: a.spec.varied_from, spec: a.spec, batch_id: a.batch_id, line: a.line });
      S.d.ads.unshift(r.ad); await extend(await relock(r.ad));
    } else if (a.spec?.exact && a.spec?.cut && S.cur?.plan?.ads?.[a.line]) {
      await extend(await makeExact(S.cur, S.cur.plan.ads[a.line], a.line, { parent_id: a.id }));
    } else {
      const r = await streamCall(S.url, '/api/studio/make', { spec: a.spec, n: 1, parent_id: a.id, batch_id: a.batch_id, line: a.line }, o => { if (o.type === 'ad') S.d.ads.unshift(o.ad); });
      await extend(r.ads?.[0]);
    }
    await post('/api/studio/status', { id: a.id, status: 'deleted' });
  } catch (e) { S.err = e.message; }
  S.making = ''; await reload();
}
function change(a) {
  modal('Change with AI', `<p class="hint" style="margin:0 0 8px">Say what to change. Only that changes. About 25¢ and 40 seconds; the old version goes to Deleted.</p>
    <textarea class="st-in" id="chIn" rows="3" placeholder="Move the headline to the top · Remove the 25% off label · Change the headline to Stop buying him socks · Make the background darker"></textarea>`,
  { cta: 'Make the change', onOpen: (w, ctl) => w.onSubmit(async () => {
    const t = w.querySelector('#chIn').value.trim(); if (!t) throw new Error('Say what to change.');
    ctl.msg('Making the change. About 40 seconds.', true);
    const r = await streamCall(S.url, '/api/studio/change', { id: a.id, instruction: t });
    S.d.ads.unshift(r.ad); ctl.msg('Fitting it to 4:5…', true); await extend(await relock(r.ad).catch(() => r.ad)).catch(() => {}); const old = S.d.ads.find(x => x.id === a.id); if (old) old.status = 'deleted';
    ctl.close(true); paint();
  }) });
}
const fileName = (a, b) => `${b?.num ? `${b.num}-${(a.line ?? 0) + 1}` : (S.d.account?.name || 'ad').replace(/\W+/g, '-')} ${(a.spec?.headline || '').replace(/[^\w ]+/g, '').slice(0, 40)}`.trim() + '.png';
async function download(a, b = S.cur, kind = '') {
  try {
    const blob = await (await fetch(kind ? img(a, kind) : shown(a))).blob();
    const o = URL.createObjectURL(blob), l = document.createElement('a');
    l.href = o; l.download = fileName(a, b?.id === 'loose' ? null : b).replace(/\.png$/, kind === 'story' ? ' 9x16.png' : '.png');
    document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(o), 4000);
  } catch (e) { S.err = e.message; paint(); }
}
async function downloadAll(b) { for (const a of live(adsOf(b))) { await download(a, b); await new Promise(r => setTimeout(r, 400)); } }
async function sendCanva(b) {
  /* No Canva app connected (Canva requires two-factor login for that): download the batch and open
     Canva, where the files are dragged into Uploads in one go. Works with zero setup. */
  if (!S.d.canva?.connected) {
    const ads = live(adsOf(b)), approved = ads.filter(a => a.status === 'approved');
    const list = approved.length ? approved : ads;
    S.making = `Downloading ${list.length} ad${list.length === 1 ? '' : 's'} for Canva…`; paint();
    for (const a of list) { await download(a, b); await new Promise(r => setTimeout(r, 400)); }
    S.making = ''; paint();
    window.open('https://www.canva.com/design?create&width=1080&height=1350&units=px', '_blank', 'noopener');
    modal('Into Canva', `<p class="hint" style="margin:0">The ${list.length} ad${list.length === 1 ? ' is' : 's are'} in your Downloads, and a blank 4:5 Canva design just opened in a new tab.</p>
      <ol class="st-ol"><li>Drag the downloaded files onto the Canva page (or into <b>Uploads</b>).</li><li>Click an ad, then <b>Edit photo, Grab Text</b> to turn its words into text boxes, or <b>Magic Grab</b> to move the product.</li></ol>`, { cta: null });
    return;
  }
  const ads = live(adsOf(b));
  const approved = ads.filter(a => a.status === 'approved');
  const list = (approved.length ? approved : ads).sort((p, q) => (p.line ?? 0) - (q.line ?? 0));
  S.making = `Sending ${list.length} ad${list.length === 1 ? '' : 's'} to Canva…`; paint();
  try {
    const r = await streamCall(S.url, '/api/studio/canva/send', { ids: list.map(a => a.id), batch_id: b.id, folder: `${S.d.account?.name || ''} · ${b.num ? `Batch ${b.num} · ` : ''}${b.name || 'Studio'}` }, o => { if (o.type === 'status') { S.making = o.text; paint(); } });
    S.making = ''; paint();
    /* Close the loop: the batch's Asana task gets the Canva links (only batches made from Asana). */
    let asanaNote = '';
    if (b.br_batch_id) {
      const names = list.map(x => `${b.num ? `${b.num}-${(x.line ?? 0) + 1}` : 'Ad'} · ${x.spec?.headline || ''}`);
      const n = await streamCallJson(AH_URL, '/api/studio-ai/asana-note', { br_batch_id: b.br_batch_id, folder_url: r.folder_url, designs: r.designs.map((d, i) => ({ edit_url: d.edit_url, name: names[i] })) }).catch(() => null);
      asanaNote = n?.ok ? ' The links are posted on its Asana task.' : '';
    }
    modal('Sent to Canva', `<p class="hint" style="margin:0 0 8px">${r.designs.length} design${r.designs.length === 1 ? '' : 's'} in Canva under Locus Studio, ${esc(S.d.account?.name || '')}, ${esc(b.num ? b.num + ' · ' : '')}${esc(b.name || '')}.${asanaNote}${approved.length ? ' (the approved ones)' : ''}. In Canva, use <b>Edit photo, Grab Text</b> to turn the words into text boxes, or <b>Magic Grab</b> to move the product.</p>
      ${r.folder_url ? `<p><a class="btn primary" href="${esc(r.folder_url)}" target="_blank" rel="noopener">Open the folder in Canva</a></p>` : ''}
      <div style="display:grid;gap:4px">${r.designs.map((d, i) => `<a href="${esc(d.edit_url)}" target="_blank" rel="noopener">Design ${i + 1}</a>`).join('')}</div>`, { cta: null });
  } catch (e) { S.making = ''; S.err = e.message; paint(); }
}

/* ---------------- the photo library, inside Studio (2026-10-08) ----------------
   The same search and filters as Creative > Library (account-health assets.js, called directly with the
   session token like the other account-health calls here). A pick comes back at Studio size through
   /api/assets/file, is shrunk by the same rule as an upload (shrinkImage) and stored as a Studio ref, so
   everything after the pick is the upload path. A look (Made by Locus) is already a ref and is used as is. */
const LIBQ = { q: '', setting: '' };
const DRESS_COST = 0.12;  // measured 2026-10-08: $0.105 (image call from its usage + the check), gpt-image-2.5 on the key
const libImg = x => `${AH_URL}/assets-img/${encodeURIComponent(S.act)}/${encodeURIComponent(x.file_id)}`;
function libPick({ title = 'From the library', max = 8, people = '', modes = null, onPick }) {
  const sel = new Map(); let ppl = people, mode = modes ? modes[0][0] : '', items = [], settings = [], looks = 0, seq = 0;
  const cap = () => mode === 'photo' ? 1 : max;
  const chips = () => [['', 'Everything'], ['yes', 'With people'], ['no', 'No people'], ...(looks ? [['locus', 'Made by Locus']] : [])]
    .map(([k, l]) => `<button type="button" class="st-chip ${ppl === k ? 'on' : ''}" data-lp="${k}">${l}</button>`).join('');
  const setChips = () => [{ setting: '' }, ...settings].map(s => `<button type="button" class="st-chip ${LIBQ.setting === s.setting ? 'on' : ''}" data-ls="${esc(s.setting)}">${esc(s.setting || 'Any setting')}${s.n ? ` <small style="display:inline;margin-left:3px">${s.n}</small>` : ''}</button>`).join('');
  return modal(title, `${modes ? `<div class="st-lmode">${modes.map(([k, l, h]) => `<button type="button" class="st-chip ${mode === k ? 'on' : ''}" data-lm="${k}">${esc(l)}<small>${esc(h)}</small></button>`).join('')}</div>` : ''}
    <input class="st-in" id="lq" type="search" placeholder="Search: man in a polo on a white background, wedge close-up, golf course…" value="${esc(LIBQ.q)}" style="margin-top:${modes ? 10 : 0}px">
    <div class="st-chips" id="lpp" style="margin-top:8px"></div><div class="st-chips" id="lst" style="margin-top:6px"></div>
    <div class="st-lgrid" id="lg"><span class="st-busy"><span class="st-spin"></span>Reading the library…</span></div>
    <p class="tiny" id="lnote" style="margin:8px 0 0"></p>`,
  { cta: 'Add', wide: true, onOpen: (w, ctl) => {
    const yes = w.querySelector('[data-m="yes"]');
    const count = () => { const n = sel.size; yes.textContent = n ? `Add ${n} photo${n === 1 ? '' : 's'}` : 'Add'; yes.disabled = !n; };
    const draw = () => {
      w.querySelector('#lpp').innerHTML = chips(); w.querySelector('#lst').innerHTML = setChips();
      w.querySelector('#lg').innerHTML = items.map((x, i) => `<button type="button" class="${sel.has(x.file_id) ? 'on' : ''}" data-li="${i}"${tip(x.descr || x.name || '')}>${x.thumb_key ? `<img loading="lazy" src="${esc(libImg(x))}" alt="">` : 'Tagging…'}${x.source === 'locus' ? '<em>Made by Locus</em>' : ''}<span class="ck">✓</span></button>`).join('')
        || `<div class="st-empty" style="grid-column:1/-1"><b>${LIBQ.q || ppl || LIBQ.setting ? 'Nothing matches' : 'No photos in the library yet'}</b>${LIBQ.q || ppl || LIBQ.setting ? 'Try fewer words or another filter.' : 'Creative, Library reads the brand’s Drive folder. Press Check Drive now there.'}</div>`;
      w.querySelector('#lnote').textContent = `${cap() === 1 ? 'Pick one photo.' : `Pick up to ${cap()}.`} Photos stay where they are in Drive; Studio takes a copy at 1568px.`;
      w.querySelectorAll('[data-lp]').forEach(b => b.onclick = () => { ppl = b.dataset.lp; load(); });
      w.querySelectorAll('[data-ls]').forEach(b => b.onclick = () => { LIBQ.setting = b.dataset.ls; load(); });
      w.querySelectorAll('[data-li]').forEach(b => b.onclick = () => {
        const x = items[+b.dataset.li];
        if (sel.has(x.file_id)) sel.delete(x.file_id);
        else { if (cap() === 1) sel.clear(); if (sel.size >= cap()) return ctl.msg(`Up to ${cap()} here. Untick one first.`); sel.set(x.file_id, x); }
        ctl.msg('', true); draw(); count();
      });
    };
    const load = async () => {
      const t = ++seq;
      const qs = new URLSearchParams({ act: S.act, q: LIBQ.q, people: ppl === 'locus' ? '' : ppl, source: ppl === 'locus' ? 'locus' : '', setting: LIBQ.setting, limit: '120' });
      try { const d = await atriaCall(`/api/assets?${qs}`); if (t !== seq) return; items = d.items || []; settings = (d.settings || []).filter(s => s.setting); looks = d.looks || 0; }
      catch (e) { if (t !== seq) return; items = []; ctl.msg(e.message); }
      draw();
    };
    w.querySelectorAll('[data-lm]').forEach(b => b.onclick = () => { mode = b.dataset.lm; w.querySelectorAll('[data-lm]').forEach(x => x.classList.toggle('on', x === b)); if (sel.size > cap()) sel.clear(); draw(); count(); });
    let tm = null; w.querySelector('#lq').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { LIBQ.q = e.target.value; load(); }, 350); };
    count(); load();
    w.onSubmit(async () => {
      if (!sel.size) throw new Error('Pick at least one photo.');
      ctl.msg('Bringing the photos in…', true);
      await onPick([...sel.values()], mode, ctl);
      ctl.close(true);
    });
  } });
}
/* Library picks into Studio refs. Drive photos arrive as a 1600px JPEG and go through shrinkImage like an
   upload; anything the upload route cannot take is redrawn as a JPEG first. */
async function libToUrls(items, msg = () => {}) {
  const out = [];
  for (const [i, x] of items.entries()) {
    if (x.look?.url) { out.push(x.look.url); continue; }
    msg(`Bringing in photo ${i + 1} of ${items.length}…`);
    const res = await fetch(`${AH_URL}/api/assets/file?act=${encodeURIComponent(S.act)}&id=${encodeURIComponent(x.file_id)}`, { headers: { Authorization: 'Bearer ' + S.tok } });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `Could not open ${x.name || 'that photo'}.`); }
    let blob = await shrinkImage(await res.blob());
    if (!/^image\/(png|jpeg|webp)$/.test(blob.type)) blob = await asJpeg(blob);
    const url = await putRef(blob); refChecked.add(url); out.push(url);
  }
  return out;
}
async function asJpeg(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.();
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
}

/* ---------------- Dress a photo (2026-10-08, Nick's method) ----------------
   A REAL photo of a person + 1 to 4 product photos -> one edit call that swaps only the clothing
   (/api/studio/dress). The result is a look in the photo library; "Use as the ad" puts it on a batch line
   as line.photo, and the existing real-photo flow makes the ad from it. One window, one primary button:
   Dress the photo, then Use as the ad. A re-dress in the same window replaces the look it made (the library
   keeps only what you keep). */
async function dress({ batch = null, base = null } = {}) {
  if (!S.products) { const r = await api(`/api/studio/products?act=${encodeURIComponent(S.act)}`).catch(() => ({ products: [] })); S.products = r.products || []; }
  const su = batch?.setup || {}, p0 = (su.products || [])[0];
  const st = { base, title: p0?.title || '', handle: p0 && p0.handle !== 'upload' ? p0.handle : '', all: (p0?.all || []).slice(0, 8), imgs: [], note: '', look: null, used: false, busy: '' };
  st.imgs = st.all.filter(u => (su.images || []).includes(u)).slice(0, 4);
  if (p0 && !st.imgs.length) st.imgs = st.all.slice(0, 3);
  const cents = `about ${Math.round(DRESS_COST * 100)}¢`;
  const form = () => `<div class="st-dress">
    <p class="hint" style="margin:0">Puts one of the brand’s products on a real photo of a person. Their face, pose, light and background stay as shot; only the clothing changes. The result is saved to the photo library as a look you can use as the ad.</p>
    <div class="st-g2">
      <div><p class="st-lbl">1. The photo of the person</p>
        ${st.base ? `<button class="st-dthumb" data-zu="${esc(st.base.thumb)}"><img src="${esc(st.base.thumb)}" alt="">${st.base.made ? '<em>Made by Locus</em>' : ''}</button><span class="tiny" style="display:block;margin-top:4px">${esc(st.base.name || '')}</span>`
          : '<div class="st-empty" style="padding:16px"><b>No photo yet</b>A real person, ideally wearing something like the product.</div>'}
        <div class="st-drow"><button class="btn quiet" data-db="lib">${st.base ? 'Pick another' : 'From the library'}</button><button class="btn quiet" data-db="up">Upload a photo</button></div></div>
      <div><p class="st-lbl">2. The product to put on them</p>
        <select class="st-in" id="dProd" style="margin:0"><option value="">${st.title ? 'Pick another product from the store…' : 'Pick a product from the store…'}</option>${(S.products || []).map((p, i) => `<option value="${i}">${esc(p.title)}</option>`).join('')}</select>
        <div class="st-thumbs" style="margin-top:8px">${st.all.map(u => `<button class="t ${st.imgs.includes(u) ? 'on' : ''}" data-dimg="${esc(u)}" title="${st.imgs.includes(u) ? 'Used: click to stop using it' : 'Not used: click to use it'}"><img src="${esc(thumb(u))}" alt=""></button>`).join('')}<button class="st-add" data-db="plib" title="Product photos from the brand’s library">From the library</button></div>
        <p class="tiny" style="margin:6px 0 0">${st.imgs.length} of 4 photos used. Clean shots of the product work best.</p>
        <label class="st-f" style="margin-top:8px">Product name<small>so the AI and the library know what it is</small><input class="st-in" id="dTitle" value="${esc(st.title)}" placeholder="Classic Polo, navy"></label></div>
    </div>
    <label class="st-f">Anything to know?<small>optional, for example “tuck the shirt in” or “keep the hat brim straight”</small><input class="st-in" id="dNote" maxlength="400" value="${esc(st.note)}"></label>
    <input type="file" id="dFile" accept="image/png,image/jpeg,image/webp" hidden>
    <div class="st-dgo">${st.busy ? `<span class="st-busy"><span class="st-spin"></span>${esc(st.busy)}</span>` : `<button class="btn primary" id="dGo" ${st.base && st.imgs.length ? '' : 'disabled'}>Dress the photo · ${cents}</button>${st.look ? '<button class="btn quiet" id="dBack">Back to the result</button>' : ''}`}</div></div>`;
  const result = () => {
    const L = st.look, ck = L.check;
    const score = ck ? `<span class="v2pill ${ck.score >= 7 ? 'good' : 'warn'}"${tip(`The check model compared the garment with the product photos and scored it ${ck.score} out of 10${ck.issue ? `: ${ck.issue}` : ''}. A net, not a guarantee: still look at it.`)}>Product ${ck.score}/10</span>${ck.person_kept === false ? `<span class="v2pill warn"${tip(ck.person_issue || 'The person or scene changed more than the clothing.')}>Person may have changed</span>` : `<span class="v2pill good">Person kept</span>`}` : '<span class="v2pill">Not checked</span>';
    return `<div class="st-dress"><div class="st-dres"><figure><img src="${esc(st.base.thumb)}" data-zu="${esc(st.base.thumb)}" alt=""><figcaption>Before</figcaption></figure><figure><img src="${esc(L.url)}" data-zu="${esc(L.url)}" alt=""><figcaption>Dressed</figcaption></figure></div>
      <div class="st-chips" style="gap:6px">${score}<span class="v2pill">Cost $${(+L.cost || 0).toFixed(2)}</span></div>
      ${ck?.issue && ck.score < 7 ? `<p class="st-msg bad">${esc(ck.issue)}</p>` : ''}
      <p class="hint" style="margin:0">Saved to the photo library as a look (Creative, Library, Made by Locus). Use it as the photo for an ad: the words go on, the photo stays as it is.</p>
      <div class="st-dgo">${st.busy ? `<span class="st-busy"><span class="st-spin"></span>${esc(st.busy)}</span>` : `<button class="btn primary" id="dUse">Use as the ad</button><button class="btn" id="dRedo" title="Dress it again with the same photos. This one leaves the library.">Redo · ${cents}</button><button class="btn quiet" id="dEdit">Change the inputs</button><button class="btn quiet" id="dDl">Download</button>`}</div></div>`;
  };
  return modal(batch ? `Dress a photo · ${batch.name || 'batch'}` : 'Dress a photo', '<div id="dBody"></div>', { cta: null, wide: true, onOpen: (w, ctl) => {
    let view = 'form';
    const keep = () => { const t = w.querySelector('#dTitle'), n = w.querySelector('#dNote'); if (t) st.title = t.value.trim(); if (n) st.note = n.value.trim(); };
    const draw = () => { w.querySelector('#dBody').innerHTML = view === 'result' && st.look ? result() : form(); wire(); };
    const run = async () => {
      keep();
      if (!st.base) return ctl.msg('Pick the photo of the person first.');
      if (!st.imgs.length) return ctl.msg('Pick at least one photo of the product.');
      ctl.msg('', true); st.busy = 'Getting the photo ready…'; draw();
      try {
        if (!st.base.url) st.base.url = (await libToUrls([st.base.item]))[0];
        st.busy = `Dressing the photo. About a minute; keep this window open.`; draw();
        const r = await streamCall(S.url, '/api/studio/dress', { base: st.base.url, base_asset: st.base.asset || null, base_name: st.base.name || '', products: st.imgs, product: st.title, handle: st.handle, note: st.note, replace: st.look && !st.used ? st.look.file_id : null },
          o => { if (o.type === 'status') { st.busy = o.text; const s = w.querySelector('.st-dgo .st-busy'); if (s) s.lastChild.textContent = o.text; } });
        st.look = r.look; st.used = false; view = 'result';
      } catch (e) { ctl.msg(e.message); }
      st.busy = ''; draw();
    };
    const wire = () => {
      w.querySelectorAll('[data-zu]').forEach(x => x.onclick = () => zoom(x.dataset.zu));
      const file = w.querySelector('#dFile');
      w.querySelectorAll('[data-db]').forEach(x => x.onclick = () => {
        keep();
        if (x.dataset.db === 'up') return file.click();
        if (x.dataset.db === 'lib') return libPick({ title: 'The photo of the person', max: 1, people: 'yes', onPick: async items => { const it = items[0]; st.base = { item: it, url: it.look?.url || '', name: it.name, thumb: it.look?.url || libImg(it), asset: it.file_id, made: it.source === 'locus' }; draw(); } });
        libPick({ title: 'Product photos from the library', max: Math.max(1, 4 - st.imgs.length), people: 'no', onPick: async (items, _m, c2) => {
          const urls = await libToUrls(items, t => c2.msg(t, true));
          st.all = [...new Set([...st.all, ...urls])]; st.imgs = [...new Set([...st.imgs, ...urls])].slice(0, 4);
          if (!st.title) st.title = items[0]?.products || ''; draw();
        } });
      });
      if (file) file.onchange = async () => {
        const f = file.files[0]; file.value = ''; if (!f) return;
        ctl.msg(`Uploading ${f.name}…`, true);
        try { const url = await putRef(await shrinkImage(f)); refChecked.add(url); st.base = { url, name: f.name, thumb: url, asset: null }; ctl.msg('', true); draw(); }
        catch (e) { ctl.msg(e.message); }
      };
      const sel = w.querySelector('#dProd'); if (sel) sel.onchange = e => {
        const p = S.products[+e.target.value]; if (!p) return; keep();
        st.title = p.title; st.handle = p.handle; st.all = p.images.slice(0, 8); st.imgs = p.images.slice(0, 3); draw();
      };
      w.querySelectorAll('[data-dimg]').forEach(x => x.onclick = () => {
        keep(); const u = x.dataset.dimg;
        if (st.imgs.includes(u)) st.imgs = st.imgs.filter(y => y !== u); else if (st.imgs.length < 4) st.imgs.push(u); else return ctl.msg('Up to 4 product photos. Untick one first.');
        ctl.msg('', true); draw();
      });
      const go = w.querySelector('#dGo'); if (go) go.onclick = run;
      const back = w.querySelector('#dBack'); if (back) back.onclick = () => { keep(); view = 'result'; draw(); };
      const redo = w.querySelector('#dRedo'); if (redo) redo.onclick = run;
      const ed = w.querySelector('#dEdit'); if (ed) ed.onclick = () => { view = 'form'; ctl.msg('', true); draw(); };
      const dl = w.querySelector('#dDl'); if (dl) dl.onclick = async () => {
        try { const blob = await (await fetch(st.look.url)).blob(); const o = URL.createObjectURL(blob), l = document.createElement('a'); l.href = o; l.download = `${(st.look.name || 'look').replace(/[^\w -]+/g, '').slice(0, 60)}.${blob.type === 'image/png' ? 'png' : 'jpg'}`; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(o), 4000); }
        catch (e) { ctl.msg(e.message); }
      };
      const use = w.querySelector('#dUse'); if (use) use.onclick = async () => { const ok = await useAsAd(st.look.url, batch); if (ok) { st.used = true; ctl.close(true); } };
    };
    draw();
  } });
}

/* Put a photo (a look, or any ref) on a batch line as the ad itself: line.photo, the real-photo flow.
   Like "Use as the ad" under a line, the batch's plan is cleared so the line is planned with the photo. */
async function useAsAd(image, batch = null) {
  let list = S.d?.account?.act_id === S.act ? S.d.batches : null;
  if (!list) { try { list = (await api(`/api/studio?act=${encodeURIComponent(S.act)}`)).batches; } catch { list = []; } }
  list = (list || []).filter(b => b.status !== 'archived').sort((p, q) => String(q.updated_at || '').localeCompare(String(p.updated_at || '')));
  if (!list.length) { await modal('Use as the ad', '<p class="hint" style="margin:0">This brand has no batches yet. Start one in Studio; the look is in the photo library, so any line can pick it with From the library.</p>', { cta: null }); return false; }
  let bid = batch?.id && list.some(b => b.id === batch.id) ? batch.id : list[0].id;
  const linesOf = b => (b.brief?.lines || []);
  const firstFree = b => { const i = linesOf(b).findIndex(l => !l.photo); return i >= 0 ? String(i) : 'new'; };
  let li = firstFree(list.find(b => b.id === bid));
  const body = () => { const b = list.find(x => x.id === bid);
    return `<div style="display:grid;grid-template-columns:96px minmax(0,1fr);gap:14px;align-items:start"><button class="st-dthumb" style="width:96px" data-zu="${esc(image)}"><img src="${esc(image)}" alt=""></button>
      <div><label class="st-f">Batch<select class="st-in" id="uaB">${list.map(x => `<option value="${x.id}" ${x.id === bid ? 'selected' : ''}>${batchTitle(x)}</option>`).join('')}</select></label>
      <p class="st-lbl" style="margin:12px 0 0">Which line</p>
      <div class="st-ulines">${linesOf(b).map((l, i) => `<label><input type="radio" name="uaL" value="${i}" ${li === String(i) ? 'checked' : ''}><span>Ad ${i + 1}: ${esc((l.text || 'No words yet').slice(0, 120))}${l.photo ? '<small>Already has a photo: this replaces it</small>' : ''}</span></label>`).join('')}
        <label><input type="radio" name="uaL" value="new" ${li === 'new' ? 'checked' : ''}><span>A new line<small>Added at the end, words written when the batch is planned</small></span></label></div>
      ${b?.plan ? '<p class="tiny" style="margin:8px 0 0">This batch has a plan. It is cleared so the line is planned with the photo; press Plan the ads again.</p>' : ''}</div></div>`; };
  return modal('Use as the ad', '<div id="uaBody"></div>', { cta: 'Use as the ad', wide: true, onOpen: (w, ctl) => {
    const draw = () => { w.querySelector('#uaBody').innerHTML = body(); w.querySelector('#uaB').onchange = e => { bid = e.target.value; li = firstFree(list.find(b => b.id === bid)); draw(); };
      w.querySelectorAll('[name="uaL"]').forEach(r => r.onchange = () => { li = r.value; }); w.querySelectorAll('[data-zu]').forEach(x => x.onclick = () => zoom(x.dataset.zu)); };
    draw();
    w.onSubmit(async () => {
      const b = list.find(x => x.id === bid); b.brief = b.brief || {}; b.brief.lines = b.brief.lines || [];
      if (li === 'new') { if (b.brief.lines.length >= 12) throw new Error('That batch already has 12 lines.'); b.brief.lines.push({ text: 'The ad on this photo', inspo: [], photo: image }); }
      else b.brief.lines[+li].photo = image;
      if (b.plan) b.plan = null;
      if (S.cur?.id === b.id) clearTimeout(saveT);
      const r = await post('/api/studio/batch/save', { batch: b });
      const saved = r.batch || b;
      if (S.d?.account?.act_id === S.act) { const k = S.d.batches.findIndex(x => x.id === saved.id); if (k >= 0) S.d.batches[k] = saved; }
      if (S.cur?.id === saved.id) { S.cur = saved; if ($('#stMain')) paint(); }
      ctl.close(true);
    });
  } });
}

/* Entry points for other screens (Creative > Library). They bring their own session and brand. A different
   brand than Studio last showed resets Studio's per-brand state, so Studio reloads cleanly next time. */
function boot({ tok, url, act }) {
  Object.assign(S, { tok, url });
  if (act && act !== S.act) { S.act = act; S.products = null; S.cur = null; S.lastAct = null; }
  injectCss();
}

/* ---------------- ads made before batches ---------------- */
function looseView(ads) {
  const ok = ads.filter(a => a.status === 'approved').length;
  return V2card('Earlier ads', 'Made before batches existed. Review them the same way.', `<p class="st-msg bad" style="margin:0 0 10px">${esc(S.err || '')}</p>
    ${ads.length ? `<div class="st-board">${ads.map(a => adCard(a)).join('')}</div>` : '<div class="st-empty"><b>Nothing left here</b>Every earlier ad was deleted. New ads live in batches.</div>'}`,
    ads.length ? `<span class="tiny">${ok} of ${ads.length} approved</span>` : '');
}

window.StudioTab = {
  render,
  /* Creative > Library: "Dress with a product" on a person photo, and "Use as the ad" on a look. Both resolve when the window closes. */
  dress: o => { boot(o); return dress({ base: o.base || null }); },
  useAsAd: o => { boot(o); return useAsAd(o.image); },
  /* Ads > Creative, "Make iterations in Studio" (2026-10-09): the winning ad's own image (account-health
     /api/ad-original, full size) becomes a Studio reference, then goes on a batch line like any photo. */
  fromAd: async o => {
    boot(o);
    const res = await fetch(`${AH_URL}/api/ad-original?ad=${encodeURIComponent(o.ad)}`, { headers: { Authorization: 'Bearer ' + S.tok } });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Could not open that ad.'); }
    let blob = await shrinkImage(await res.blob());
    if (!/^image\/(png|jpeg|webp)$/.test(blob.type)) blob = await asJpeg(blob);
    const url = await putRef(blob); refChecked.add(url);
    return useAsAd(url);
  },
};
})();
