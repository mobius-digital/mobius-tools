/* Locus - the Brand tab (2026-09-24).
 *
 * ASANA IS WHERE THE TEAM WORKS; THIS TAB IS THE MEMORY. Three views:
 *   Test library  every test, filed by angle (Mobius framework: Angle, Concept, What
 *                 We're Testing), with Triple Whale results and the media buyer's call.
 *                 It fills itself from Asana (account-health asana-brand.js); nothing is
 *                 typed here except angle renames and merges.
 *   Research      per product line: market, mechanism, personas, voice of customer,
 *                 competitors, angle ideas. The AI drafts, a person approves.
 *   Brand info    profile, voice, test rules (CPA first), the client's onboarding answers.
 *
 * Own file and own closure, like amb.js and meta.js. Questions and persona fields
 * come from ../onboard/questions.js so the client's form and this screen never drift.
 */
(function () {
'use strict';

/* Local testing: localStorage pf_ah points the AI calls at a local account-health dev worker. */
const AH_URL = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (() => { try { return localStorage.getItem('pf_ah'); } catch { return null; } })()) || 'https://mobius-account-health.mobius-digital.workers.dev';
const FORM_BASE = 'https://tools.go-mobius-digital.com/onboard/?t=';
const Q = () => window.MOBIUS_ONBOARD || { STEPS: [], PERSONA_Q: [], AWARENESS: [], STAGES: [], calc: () => null };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => n == null || isNaN(n) ? '-' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const x2 = n => n == null ? '-' : (+n).toFixed(2);
const short = (s, n = 140) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const lines = v => Array.isArray(v) ? v : String(v || '').split('\n').map(s => s.trim()).filter(Boolean);

const S = { url: '', tok: '', act: 'all', accounts: [], pick: null, d: null, view: 'library', line: null, vocKind: 'all', stage: 'all', angleFilter: '', search: '', running: null, log: [] };
const LS_VIEW = 'br_view', LS_LINE = 'br_line';

/* ---------------- api ---------------- */
async function api(path, opts = {}) {
  const res = await fetch(S.url.replace(/\/+$/, '') + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + S.tok, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
  return j;
}
const post = (p, b, m = 'POST') => api(p, { method: m, body: JSON.stringify({ act: S.act, ...b }) });
async function load() { S.d = await api(`/api/brand?act=${encodeURIComponent(S.act)}`); return S.d; }
async function saveRow(kind, row) { S.d = await post('/api/brand/save', { kind, row }); return S.d.saved; }
async function delRow(kind, id) { S.d = await post('/api/brand/del', { kind, id }); }
async function putDoc(line_id, key, data, status = 'approved') { S.d = await post('/api/brand/doc', { line_id, key, data, status }, 'PUT'); }
async function ahJson(path, body) {
  const res = await fetch(AH_URL + path, { method: 'POST', headers: { Authorization: 'Bearer ' + S.tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ act: S.act, ...body }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
  return j;
}
/* A streamed research step: one JSON object per line. */
async function ahStream(path, body, onLine, signal) {
  const res = await fetch(AH_URL + path, { method: 'POST', signal, headers: { Authorization: 'Bearer ' + S.tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ act: S.act, ...body }) });
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
  if (!last) throw new Error('The connection closed before the step finished. Run it again.');
  if (last.type === 'error') throw new Error(last.text);
  return last;
}

/* ---------------- styles ---------------- */
function injectCss() {
  if (document.getElementById('br-css')) return;
  const st = document.createElement('style');
  st.id = 'br-css';
  st.textContent = `
.br{display:flex;flex-direction:column;gap:14px}
.br .card{margin-bottom:0}
.br-sub{display:flex;gap:4px;border-bottom:1px solid var(--line);overflow-x:auto}
.br-sub button{padding:9px 14px;font-size:13.5px;font-weight:600;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap}
.br-sub button.on{color:var(--ink);border-bottom-color:var(--brand-lo)}
.br-sub button .n{font-size:11px;font-weight:700;background:var(--warn-bg);color:var(--warn);border-radius:99px;padding:1px 7px;margin-left:5px}
.br-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.br-bar > div{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.br-h{font-size:15px;font-weight:700;margin:0}
.br-lbl{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.br-chips{display:flex;gap:6px;flex-wrap:wrap}
.br-chip{font-size:12.5px;font-weight:600;padding:5px 11px;border-radius:99px;border:1px solid var(--line);background:var(--surface);color:var(--ink-2);cursor:pointer}
.br-chip.on{border-color:var(--brand-line);background:var(--brand-tint);color:var(--brand-ink)}
.br-chip .n{color:var(--muted);font-weight:500;margin-left:4px}
.br-tag{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:99px;background:var(--unk-bg);color:var(--ink-2);white-space:nowrap}
.br-tag.draft{background:var(--warn-bg);color:var(--warn)}
.br-tag.ai{background:var(--brand-tint);color:var(--brand-ink)}
.br-tag.win{background:var(--good-bg);color:var(--good)}
.br-tag.lose{background:var(--bad-bg);color:var(--bad)}
.br-tag.mid{background:var(--warn-bg);color:var(--warn)}
.br-g2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:14px}
.br-g3{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:12px}
.br-kv{display:grid;grid-template-columns:170px minmax(0,1fr);gap:6px 14px;font-size:13.5px}
.br-kv dt{color:var(--muted);font-weight:600;font-size:12.5px}
.br-kv dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
@media (max-width:640px){.br-kv{grid-template-columns:1fr}.br-kv dd{margin-bottom:6px}}
.br-f{display:block;font-size:12px;font-weight:700;color:var(--ink-2);min-width:0}
.br-f small{font-weight:500;color:var(--muted);margin-left:4px}
.br-in{display:block;width:100%;margin-top:5px;border:1px solid var(--line-strong);border-radius:8px;padding:8px 10px;font:inherit;font-size:13.5px;font-weight:500;color:var(--ink);background:var(--surface);max-width:none}
.br-in:focus{outline:none;border-color:var(--brand-ink);box-shadow:0 0 0 3px var(--brand-soft)}
textarea.br-in{min-height:64px;resize:vertical;line-height:1.5}
.br-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.br-form .full{grid-column:1/-1}
@media (max-width:640px){.br-form{grid-template-columns:1fr}}
.br-msg{font-size:12.5px;color:var(--muted)}
.br-msg.ok{color:var(--good)}.br-msg.bad{color:var(--bad)}
.br-empty{padding:22px;text-align:center;color:var(--muted);font-size:13.5px}
.br-tbl td,.br-tbl th{vertical-align:top}
.br-md{margin-top:10px;font-size:14px;line-height:1.6;max-width:78ch}
.br-md h4{font-size:14.5px;margin:16px 0 4px}.br-md p{margin:0 0 8px}.br-md ul{margin:0 0 8px;padding-left:20px}
.br-voicetx{max-height:420px;overflow:auto;font-size:13px;margin-top:8px}.br-voicetx p{margin:0 0 10px;white-space:pre-wrap}
.br-bank{max-height:420px;overflow:auto;display:flex;flex-direction:column;gap:8px;margin-top:8px}
.br-bk{border:1px solid var(--line);border-radius:8px;padding:8px 10px 8px;font-size:13px;position:relative}
.br-bk > div{margin-top:4px;white-space:pre-wrap;padding-right:56px}
.unsure-x{position:absolute;top:6px;right:8px;font-size:11.5px;color:var(--muted);background:none;border:0;text-decoration:underline;cursor:pointer}
.br-desk{border:1px solid var(--line);border-radius:10px;padding:10px}
.br-desk.done{opacity:.7}
.br-tbl tr.click{cursor:pointer}
.br-tbl tr.click:hover td{background:var(--brand-tint)}
.br-tbl .t{font-weight:700}
.br-tbl .s{font-size:12px;color:var(--muted);margin-top:2px}
.br-pcard{border:1px solid var(--line);border-radius:10px;padding:14px;background:var(--surface);display:flex;flex-direction:column;gap:8px;cursor:pointer}
.br-pcard:hover{border-color:var(--brand-line)}
.br-pcard h4{margin:0;font-size:15px}
.br-quote{border-left:3px solid var(--line-strong);padding:2px 0 2px 10px;font-size:13.5px}
.br-quote.pain{border-color:var(--bad)}.br-quote.desire{border-color:var(--good)}.br-quote.objection{border-color:var(--warn)}.br-quote.transformation{border-color:var(--brand)}.br-quote.failed{border-color:#7C3AED}.br-quote.trigger{border-color:#0F766E}
.br-log{background:var(--hd);color:#C9D6DE;border-radius:10px;padding:12px 14px;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;max-height:240px;overflow:auto;white-space:pre-wrap}
.br-log b{color:#fff}
.br-log .e{color:#F09182}.br-log .ok{color:#5FD292}
.br-warn{border:1px solid var(--warn);background:var(--warn-bg);border-radius:10px;padding:10px 12px;font-size:13px}
.br-call{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}
.br-call:first-of-type{border-top:0}
.br-call .btns{display:flex;gap:6px;flex-wrap:wrap}
.br-steps{display:flex;gap:6px;flex-wrap:wrap}
.br-modal .modal{max-width:760px}
.br-mbody{display:flex;flex-direction:column;gap:12px;margin-top:10px;max-height:68vh;overflow:auto;padding-right:4px}
.br-ans{padding:8px 0;border-top:1px solid var(--line)}
.br-ans:first-child{border-top:0}
.br-ans .l{font-size:12.5px;font-weight:700;color:var(--ink-2)}
.br-ans .v{font-size:13.5px;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:2px}
.br-ans .v.none{color:var(--muted);font-style:italic}
.br-ans .sug{font-size:12px;color:#6A4FB3;margin-top:2px}
.br-mini{border-collapse:collapse;font-size:12.5px;margin-top:4px}
.br-mini td,.br-mini th{border:1px solid var(--line);padding:3px 7px;text-align:left}
.br-mini th{background:var(--unk-bg);font-weight:600}
.br-prog{height:6px;border-radius:3px;background:var(--line);overflow:hidden}
.br-prog i{display:block;height:100%;background:var(--good)}

.lb-head{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap}
.lb-head h2{margin:0}
.lb-seg{display:inline-flex;background:var(--unk-bg);border:1px solid var(--line);border-radius:12px;padding:3px;gap:2px}
.lb-seg button{padding:7px 14px;border-radius:9px;font-weight:600;color:var(--muted);font-size:13px;display:flex;gap:6px;align-items:center}
.lb-seg button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(19,32,43,.08),0 4px 14px -8px rgba(19,32,43,.25)}
.lb-seg .n{font-size:11px;font-weight:700;background:var(--warn-bg);color:var(--warn);border-radius:99px;padding:0 7px;line-height:18px}
.lb-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.lb-search{flex:1;min-width:260px;display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--line-strong);border-radius:14px;padding:0 14px}
.lb-search:focus-within{border-color:var(--brand-ink);box-shadow:0 0 0 3px var(--brand-soft)}
.lb-search svg{width:18px;height:18px;fill:none;stroke:var(--muted);stroke-width:2;flex:none}
.lb-search input{border:0;outline:0;background:none;font:inherit;font-size:15px;padding:12px 0;width:100%;color:var(--ink)}
.lb-sync{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.lb-grid{display:grid;grid-template-columns:260px minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:860px){.lb-grid{grid-template-columns:1fr}}
.lb-angles{display:flex;flex-direction:column;gap:4px;position:sticky;top:12px;max-height:calc(100vh - 40px);overflow:auto;padding-right:2px}
@media (max-width:860px){.lb-angles{position:static;max-height:none}}
.lb-cap{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);padding:0 10px 4px;display:flex;justify-content:space-between}
.lb-ang{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 8px;text-align:left;padding:9px 10px;border-radius:10px;border:1px solid transparent;width:100%}
.lb-ang:hover{background:var(--surface)}
.lb-ang.on{background:var(--surface);border-color:var(--brand-line);box-shadow:0 1px 2px rgba(19,32,43,.06)}
.lb-ang .nm{font-weight:600;font-size:13.5px;line-height:1.3}
.lb-ang .ct{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.lb-ang .wr{grid-column:1/-1;height:3px;border-radius:2px;background:var(--line);overflow:hidden}
.lb-ang .wr i{display:block;height:100%;background:var(--good)}
.lb-ang .tiny{grid-column:1/-1}
.lb-list{display:flex;flex-direction:column;gap:8px;min-width:0}
.lb-angcard{background:var(--brand-tint);border:1px solid var(--brand-line);border-radius:14px;padding:14px 16px;font-size:13.5px;color:var(--ink-2)}
.lb-angcard b{display:block;font-size:16px;color:var(--ink);margin-bottom:2px}
.lb-row{display:grid;grid-template-columns:52px minmax(0,1fr) 120px 128px;gap:12px;align-items:center;text-align:left;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px;width:100%}
.lb-row:hover{border-color:var(--brand-line);box-shadow:0 6px 18px -12px rgba(19,32,43,.35)}
@media (max-width:640px){.lb-row{grid-template-columns:44px minmax(0,1fr)}.lb-nums,.lb-res{grid-column:2}}
.lb-num{font:600 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}
.lb-main{display:flex;flex-direction:column;gap:2px;min-width:0}
.lb-main b{font-size:14px;line-height:1.35}
.lb-main .s{font-size:12px;color:var(--muted)}
.lb-main .learn{font-size:12.5px;color:var(--ink-2);border-left:2px solid var(--good);padding-left:8px;margin-top:4px}
.lb-nums{display:flex;flex-direction:column;align-items:flex-end;font-size:12.5px;font-variant-numeric:tabular-nums}
.lb-nums b{font-size:14px}
.lb-res{display:flex;justify-content:flex-end}
.lb-scrim{position:fixed;inset:0;background:rgba(12,22,29,.35);z-index:60}
.lb-drawer{position:fixed;top:0;right:0;bottom:0;width:min(480px,100%);background:var(--surface);z-index:61;padding:24px;overflow:auto;display:flex;flex-direction:column;gap:16px;box-shadow:-24px 0 60px -30px rgba(12,22,29,.5)}
.lb-x{position:absolute;top:14px;right:14px;width:34px;height:34px;border-radius:9px;font-size:22px;color:var(--muted)}
.lb-x:hover{background:var(--unk-bg)}
.lb-title{font-family:var(--serif);font-weight:400;font-size:28px;line-height:1.1;margin:6px 0 0;padding-right:30px}
.lb-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.lb-kpis div{background:var(--unk-bg);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column}
.lb-kpis b{font-size:18px;font-variant-numeric:tabular-nums}
.lb-kpis span{font-size:11.5px;color:var(--muted)}
.lb-links{display:flex;gap:8px;flex-wrap:wrap}
.lb-links a{text-decoration:none}
@media (prefers-reduced-motion:no-preference){.lb-drawer{animation:lbIn .2s ease-out}@keyframes lbIn{from{transform:translateX(24px);opacity:.5}}}
.lb-soft{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;color:var(--muted)}
.lb-soft b{color:var(--ink);font-variant-numeric:tabular-nums}
`;
  document.head.appendChild(st);
}

/* ---------------- modal ---------------- */
function modal(title, inner, { cta = 'Save', danger = null, wide = true, onOpen } = {}) {
  return new Promise(resolve => {
    const w = document.createElement('div');
    w.className = 'modal-wrap br-modal';
    w.innerHTML = `<div class="modal" style="max-width:${wide ? 760 : 520}px" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>
      <div class="br-mbody">${inner}</div>
      <p class="br-msg" data-m="msg" style="margin-top:8px"></p>
      <div class="row" style="justify-content:space-between;gap:8px;margin:10px 0 0;display:flex;flex-wrap:wrap">
        <div>${danger ? `<button class="btn" data-m="del" style="border-color:var(--bad);color:var(--bad)">${esc(danger)}</button>` : ''}</div>
        <div style="display:flex;gap:8px"><button class="btn" data-m="no">Cancel</button>${cta ? `<button class="btn primary" data-m="yes">${esc(cta)}</button>` : ''}</div></div></div>`;
    document.body.appendChild(w);
    const done = v => { w.remove(); document.removeEventListener('keydown', k); resolve(v); };
    const k = e => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', k);
    w.addEventListener('mousedown', e => { if (e.target === w) done(null); });
    w.querySelector('[data-m="no"]').onclick = () => done(null);
    const ctl = {
      root: w, $: s => w.querySelector(s), $$: s => [...w.querySelectorAll(s)],
      msg: (t, ok = false) => { const m = w.querySelector('[data-m="msg"]'); m.textContent = t; m.className = 'br-msg ' + (ok ? 'ok' : 'bad'); },
      close: v => done(v ?? true), busy: on => w.querySelectorAll('.modal .btn').forEach(b => { b.disabled = on; }),
    };
    const yes = w.querySelector('[data-m="yes"]');
    if (yes) yes.onclick = async () => { if (w._submit) { ctl.busy(true); try { await w._submit(ctl); } catch (e) { ctl.msg(e.message); } ctl.busy(false); } else done(true); };
    const del = w.querySelector('[data-m="del"]');
    if (del) del.onclick = async () => { if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = 'Click again to delete'; return; } ctl.busy(true); try { await w._delete(ctl); } catch (e) { ctl.msg(e.message); } ctl.busy(false); };
    w.onSubmit = fn => { w._submit = fn; };
    w.onDelete = fn => { w._delete = fn; };
    onOpen?.(w, ctl);
    setTimeout(() => w.querySelector('input,textarea,select')?.focus(), 30);
  });
}
const inp = (id, label, v, { type = 'text', hint = '', full = false, rows = 0, ph = '' } = {}) => `<label class="br-f ${full ? 'full' : ''}">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}${rows
  ? `<textarea class="br-in" id="${id}" rows="${rows}" placeholder="${esc(ph)}">${esc(v ?? '')}</textarea>`
  : `<input class="br-in" id="${id}" type="${type}" value="${esc(v ?? '')}" placeholder="${esc(ph)}">`}</label>`;
const sel = (id, label, v, opts, { full = false, hint = '', blank = '' } = {}) => `<label class="br-f ${full ? 'full' : ''}">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}<select class="br-in" id="${id}">${blank !== null ? `<option value="">${esc(blank)}</option>` : ''}${opts.map(([k, l]) => `<option value="${esc(k)}" ${String(v ?? '') === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
const val = (w, id) => { const el = w.querySelector('#' + id); return el ? el.value.trim() : undefined; };

/* ---------------- labels ---------------- */
const AW = () => Object.fromEntries(Q().AWARENESS.map(([k, l]) => [k, l]));
const LEVELS = [['angle', 'New angle'], ['concept', 'New concept'], ['variation', 'Inside a concept'], ['offer', 'Offer test']];
const VARS = [['headline', 'Headline'], ['hook', 'Hook'], ['person', 'Person on screen'], ['edit', 'Edit style'], ['redesign', 'Redesign'], ['review', 'Review'], ['offer', 'Offer'], ['copy', 'Copy'], ['visual', 'Visual'], ['format', 'Format']];
const STAGE_L = { idea: 'Idea', production: 'In production', live: 'Live', done: 'Done' };
const VERDICT_L = { winner: 'Winner', loser: 'Loser', cancelled: 'Cancelled' };
const SUG_L = { winner: 'Looks like a winner', keep: 'Worth more time', loser: 'Looks like a loser', too_early: 'Too early', not_live: 'No spend yet' };
const verdictTag = v => v ? `<span class="br-tag ${v === 'winner' ? 'win' : v === 'loser' ? 'lose' : ''}">${VERDICT_L[v] || v}</span>` : '';
const statusTag = s => s === 'draft' ? '<span class="br-tag draft">Draft</span>' : s === 'proposed' ? '<span class="br-tag ai">AI idea</span>' : s === 'retired' ? '<span class="br-tag">Retired</span>' : '';
const lineName = id => S.d.lines.find(l => l.id === id)?.name || '';
const personaName = id => S.d.personas.find(p => p.id === id)?.name || '';
const angleName = id => S.d.angles.find(a => a.id === id)?.name || '';
const conceptName = id => S.d.concepts.find(c => c.id === id)?.name || '';

/* ---------------- entry ---------------- */
async function render({ tok, url, act, accounts, pick }) {
  Object.assign(S, { tok, url, act, accounts: accounts || [], pick });
  injectCss();
  const main = $('#main');
  if (act === 'all') return renderAll(main);
  main.innerHTML = `<div class="br"><div class="card"><span class="hint">Loading…</span></div></div>`;
  await load();
  S.view = localStorage.getItem(LS_VIEW) || 'library';
  const saved = localStorage.getItem(LS_LINE + ':' + act);
  S.line = S.d.lines.some(l => l.id === saved) ? saved : (S.d.lines[0]?.id || null);
  paint();
}

async function renderAll(main) {
  main.innerHTML = `<div class="br"><div class="card"><span class="hint">Loading…</span></div></div>`;
  const r = await api('/api/brand/overview');
  const ob = s => s === 'submitted' ? '<span class="pill good">Submitted</span>' : s === 'started' ? '<span class="pill warn">In progress</span>' : s === 'sent' ? '<span class="pill unk">Sent</span>' : '<span class="tiny">No link yet</span>';
  main.innerHTML = `<div class="br">
    <div><h2>Brand</h2><p class="sub">What Locus knows about each brand, and every creative test it has run. Pick a brand to open its research, angles and roadmap.</p></div>
    <div class="card" style="padding:0"><div class="tbl-wrap"><table>
      <thead><tr><th>Brand</th><th>Onboarding</th><th class="num">Product lines</th><th class="num">Personas</th><th class="num">Angles</th><th class="num">Batches</th><th class="num">Open tests</th><th></th></tr></thead>
      <tbody>${r.brands.map(b => `<tr><td><b>${esc(b.name)}</b></td><td>${ob(b.onboard)}</td><td class="num">${b.lines}</td><td class="num">${b.personas_ok}/${b.personas}</td><td class="num">${b.angles}</td><td class="num">${b.batches}</td><td class="num">${b.open}</td>
        <td style="text-align:right"><button class="btn" data-act="${esc(b.act_id)}">Open</button></td></tr>`).join('')}</tbody></table></div></div>
    ${(r.pending || []).length ? `<div class="card"><h3 class="br-h">New clients, not in Locus yet</h3>
      <p class="hint" style="margin:4px 0 10px">Made from the Asana template. Locus posted their onboarding link on the "Start here" task and moves everything onto the brand once their Meta account shows up here.</p>
      <div class="tbl-wrap"><table><thead><tr><th>Client</th><th>Onboarding</th><th>Link</th></tr></thead><tbody>${r.pending.map(p => `<tr><td><b>${esc(p.name || '')}</b></td><td>${ob(p.status)}</td>
        <td><a href="${esc(FORM_BASE + p.token)}" target="_blank" rel="noopener">Onboarding form</a> · <a href="${esc(VOICE_BASE + p.token)}" target="_blank" rel="noopener">Voice interview</a>${p.posted ? '' : ' <span class="tiny">(posting to Asana within the hour)</span>'}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
  </div>`;
  main.querySelectorAll('[data-act]').forEach(b => b.onclick = () => S.pick && S.pick(b.dataset.act));
}

function paint() {
  const main = $('#main');
  const d = S.d;
  if (!['library', 'research', 'info'].includes(S.view)) S.view = 'library';
  const drafts = d.personas.filter(p => p.status === 'draft').length + d.angles.filter(a => a.status === 'proposed').length;
  const views = [['library', 'Test library'], ['research', 'Research', drafts], ['info', 'Brand info']];
  main.innerHTML = `<div class="br">
    <div class="lb-head"><div><h2>${esc(d.account.name)}</h2><p class="sub" style="margin:0">Every test this brand has run, filed by angle, with Triple Whale results. It fills itself from Asana.</p></div>
      <nav class="lb-seg" aria-label="Brand sections">${views.map(([k, l, n]) => `<button data-v="${k}" class="${S.view === k ? 'on' : ''}">${l}${n ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</nav></div>
    <div id="brBody" class="br"></div></div>`;
  main.querySelectorAll('.lb-seg button').forEach(b => b.onclick = () => { S.view = b.dataset.v; localStorage.setItem(LS_VIEW, S.view); paint(); });
  const body = $('#brBody');
  ({ library: paintLibrary, research: paintResearch, info: paintInfo })[S.view](body);
}
/* Re-paint without moving the page. */
function repaint() { const y = window.scrollY; paint(); window.scrollTo(0, y); }

/* ======================================================================
   TEST LIBRARY
   Asana is where the work happens; this is the memory. Search it, browse it by
   angle, open a test to see what it did.
   ====================================================================== */
const RES = { winner: ['Winner', 'win'], loser: ['Loser', 'lose'], cancelled: ['Cancelled', ''] };
const resChip = b => b.verdict && RES[b.verdict] ? `<span class="br-tag ${RES[b.verdict][1]}">${RES[b.verdict][0]}</span>`
  : b.asana_result === 'keep' && b.stage !== 'done' ? `<span class="br-tag mid">Keep running${b.check_again ? ' to ' + esc(b.check_again.slice(5)) : ''}</span>`
  : b.needs_call ? '<span class="br-tag draft">Waiting on a call</span>'
  : b.stage === 'idea' ? '<span class="br-tag">Briefing</span>' : b.stage === 'production' ? '<span class="br-tag">In production</span>' : b.stage === 'live' ? '<span class="br-tag ai">Live</span>' : '';
const tone = (r, rules) => r == null ? 'var(--muted)' : r >= rules.win_roas ? 'var(--good)' : r < rules.lose_roas ? 'var(--bad)' : 'var(--warn)';
const shortNum = n => String(parseInt(n, 10) || n);
const pctf = x => x == null ? '-' : (x * 100).toFixed(1) + '%';
const cpaTone = (cpa, rules) => cpa == null || !rules.target_cpa ? 'var(--ink)' : cpa <= rules.target_cpa ? 'var(--good)' : cpa <= rules.target_cpa * 1.3 ? 'var(--warn)' : 'var(--bad)';

function paintLibrary(body) {
  const d = S.d, rules = d.rules;
  const asn = d.docs['']?.asana;
  const q = (S.q || '').toLowerCase().trim();
  const f = S.res || 'all';
  const angleOf = Object.fromEntries(d.angles.map(a => [a.id, a]));
  let rows = d.batches.slice();
  if (S.ang === 'none') rows = rows.filter(b => !b.angle_id);
  else if (S.ang) rows = rows.filter(b => b.angle_id === S.ang);
  if (f === 'winner' || f === 'loser') rows = rows.filter(b => b.verdict === f);
  if (f === 'waiting') rows = rows.filter(b => b.needs_call);
  if (f === 'open') rows = rows.filter(b => b.stage !== 'done');
  if (f === 'offer') rows = rows.filter(b => b.offer);
  if (f === 'keep') rows = rows.filter(b => !b.verdict && b.asana_result === 'keep');
  if (q) rows = rows.filter(b => `${b.num} ${b.title} ${angleOf[b.angle_id]?.name || ''} ${conceptName(b.concept_id)} ${b.offer || ''} ${b.hypothesis || ''} ${b.learning || ''}`.toLowerCase().includes(q));
  const count = k => k === 'all' ? d.batches.length : k === 'waiting' ? d.batches.filter(b => b.needs_call).length : k === 'open' ? d.batches.filter(b => b.stage !== 'done').length : k === 'offer' ? d.batches.filter(b => b.offer).length : k === 'keep' ? d.batches.filter(b => !b.verdict && b.asana_result === 'keep').length : d.batches.filter(b => b.verdict === k).length;
  const angles = d.angles.filter(a => a.status !== 'proposed').sort((x, y) => y.stats.batches - x.stats.batches || x.name.localeCompare(y.name));
  const unfiled = d.batches.filter(b => !b.angle_id).length;
  body.innerHTML = `
    <div class="lb-top">
      <div class="lb-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="lbQ" placeholder="Search every test: wife, bundle, 1 star, fit" value="${esc(S.q || '')}" aria-label="Search tests"></div>
      <div class="lb-sync">${asn?.project_gid
        ? `<span class="tiny">Asana: <a href="${esc(asn.url)}" target="_blank" rel="noopener">${esc(asn.project_name)}</a> · synced ${esc(ago(asn.last_sync))}</span><button class="btn" id="lbSync">${S.syncing ? 'Syncing…' : 'Sync now'}</button>`
        : '<button class="btn primary" id="lbConnect">Connect to Asana</button>'}</div>
    </div>
    ${!rules.target_cpa ? `<div class="br-warn">No target CPA yet, so Locus is not suggesting calls for this brand. Set it in <b>Brand info → Test rules</b>.</div>` : ''}
    <div class="br-chips">${[['all', 'All tests'], ['winner', 'Winners'], ['loser', 'Losers'], ['waiting', 'Waiting on a call'], ['keep', 'Keep running'], ['open', 'In progress'], ['offer', 'Offers']].map(([k, l]) => `<span class="br-chip ${f === k ? 'on' : ''}" data-f="${k}">${l}<span class="n">${count(k)}</span></span>`).join('')}</div>
    <div class="lb-grid">
      <aside class="lb-angles" aria-label="Angles">
        <div class="lb-cap">Angles <span>${angles.length}</span></div>
        <button class="lb-ang ${!S.ang ? 'on' : ''}" data-a=""><span class="nm">Every angle</span><span class="ct">${d.batches.length}</span></button>
        ${angles.map(a => `<button class="lb-ang ${S.ang === a.id ? 'on' : ''}" data-a="${a.id}">
          <span class="nm">${esc(a.name)}${a.status === 'retired' ? ' <span class="tiny">retired</span>' : ''}</span><span class="ct">${a.stats.batches}</span>
          <span class="wr"><i style="width:${a.stats.win_rate ?? 0}%"></i></span>
          <span class="tiny">${a.stats.judged ? `${a.stats.winners} of ${a.stats.judged} won` : 'no calls yet'}${a.stats.spend ? ` · ${money(a.stats.spend)}` : ''}</span></button>`).join('')}
        ${unfiled ? `<button class="lb-ang ${S.ang === 'none' ? 'on' : ''}" data-a="none"><span class="nm">Not filed yet</span><span class="ct">${unfiled}</span></button>` : ''}
        ${S.ang && S.ang !== 'none' ? '<button class="btn" id="lbEditAng" style="margin-top:8px;width:100%">Edit or merge this angle</button>' : ''}
        <button class="btn" id="lbTidy" style="margin-top:6px;width:100%" title="Merges angles that are the same reason to buy in different words">${S.tidying ? 'Tidying…' : 'Tidy up angles'}</button>
      </aside>
      <section class="lb-list" aria-label="Tests">
        ${S.ang && angleOf[S.ang] ? `<div class="lb-angcard"><b>${esc(angleOf[S.ang].name)}</b><div>${esc(angleOf[S.ang].argument || '')}</div></div>` : ''}
        ${rows.length ? rows.slice(0, 300).map(b => `<button class="lb-row" data-b="${b.id}">
            <span class="lb-num">${esc(shortNum(b.num))}</span>
            <span class="lb-main"><b>${esc(b.title)}</b>
              <span class="s">${b.angle_id ? esc(angleOf[b.angle_id]?.name || '') : '<i>not filed</i>'}${b.concept_id ? ' · ' + esc(conceptName(b.concept_id)) : ''}${b.offer ? ' · ' + esc(short(b.offer, 40)) : ''}</span>
              ${b.learning ? `<span class="learn">${esc(short(b.learning, 160))}</span>` : ''}</span>
            <span class="lb-nums">${b.stats.spend ? `<b>${money(b.stats.spend)}</b>${rules.target_cpa ? `<span style="color:${cpaTone(b.stats.cpa, rules)}">${b.stats.cpa != null ? money(b.stats.cpa) + ' CPA' : 'no sales'}</span>` : `<span style="color:${tone(b.stats.roas, rules)}">${b.stats.roas != null ? x2(b.stats.roas) + ' ROAS' : 'no sales'}</span>`}` : '<span class="tiny">no spend</span>'}</span>
            <span class="lb-res">${resChip(b)}</span></button>`).join('')
          : `<div class="br-empty">${q ? `Nothing matches "${esc(S.q)}". Try a shorter word.` : 'No tests here yet.'}</div>`}
      </section>
    </div>
    ${untaggedCard()}`;
  const qi = body.querySelector('#lbQ');
  qi.oninput = () => { S.q = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => { repaint(); const n = $('#lbQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); };
  body.querySelectorAll('[data-f]').forEach(c => c.onclick = () => { S.res = c.dataset.f; repaint(); });
  body.querySelectorAll('[data-a]').forEach(c => c.onclick = () => { S.ang = c.dataset.a; repaint(); });
  body.querySelectorAll('[data-b]').forEach(r => r.onclick = () => testDrawer(d.batches.find(b => b.id === r.dataset.b)));
  body.querySelector('#lbEditAng')?.addEventListener('click', () => angleModal(d.angles.find(a => a.id === S.ang)));
  body.querySelector('#lbSync')?.addEventListener('click', () => syncAsana());
  body.querySelector('#lbTidy')?.addEventListener('click', async () => {
    if (S.tidying) return;
    S.tidying = true; repaint();
    try {
      const r = await ahJson('/api/brand-asana/tidy-angles', {});
      await load();
      helpModal(r.merged ? `Merged ${r.merged} angles` : 'Nothing to merge', r.merged ? `<p>${r.before} angles became ${r.after}. Every test moved with its angle.</p><ul>${(r.log || []).map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p>Every angle is already a different reason to buy.</p>');
    } catch (e) { helpModal('Could not tidy the angles', `<p>${esc(e.message)}</p>`); }
    S.tidying = false; repaint();
  });
  body.querySelector('#lbConnect')?.addEventListener('click', () => connectAsana());
  wireUntagged(body);
}
function ago(iso) {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}
async function connectAsana() {
  try { await ahJson('/api/brand-asana/connect', {}); await syncAsana({ first: true }); }
  catch (e) { helpModal('Could not connect to Asana', `<p>${esc(e.message)}</p>`); }
}
/* Pull the latest from Asana, file anything new, post any results that are due. */
/* On a brand's FIRST connect the whole backlog is filed at once, so repeat warnings are
   off and result comments mention nobody: one catch-up, not a wall of notifications. */
async function syncAsana({ first = false } = {}) {
  if (S.syncing) return;
  S.syncing = true; repaint();
  try {
    await ahJson('/api/brand-asana/sync', first ? { full: true } : {});
    for (let i = 0; i < (first ? 40 : 6); i++) { const t = await ahJson('/api/brand-asana/tag', { limit: 12, warn: !first }); if (!t.left || !t.tagged) break; }
    await ahJson('/api/brand-asana/results', first ? { quiet: true, limit: 30 } : {});
    await load();
  } catch (e) { helpModal('Sync with Asana failed', `<p>${esc(e.message)}</p>`); }
  S.syncing = false; repaint();
}

function testDrawer(b) {
  const d = S.d, rules = d.rules;
  const angles = d.angles.filter(a => a.status !== 'proposed');
  const lg = b.legacy;
  const w = document.createElement('div');
  w.innerHTML = `<div class="lb-scrim"></div><aside class="lb-drawer" role="dialog" aria-modal="true" aria-label="Test ${esc(b.num)}">
    <button class="lb-x" aria-label="Close">×</button>
    <div><span class="lb-num">Test ${esc(shortNum(b.num))}</span> ${resChip(b)}<h2 class="lb-title">${esc(b.title)}</h2></div>
    <div class="lb-kpis"><div><b>${money(b.stats.spend)}</b><span>spent</span></div><div><b style="color:${cpaTone(b.stats.cpa, rules)}">${b.stats.cpa != null ? money(b.stats.cpa) : '-'}</b><span>CPA${rules.target_cpa ? ` · target ${money(rules.target_cpa)}` : ''}</span></div><div><b>${b.stats.orders || 0}</b><span>orders</span></div><div><b>${b.stats.roas != null && b.stats.spend ? x2(b.stats.roas) : '-'}</b><span>TW ROAS</span></div></div>
    ${b.stats.impr ? `<div class="lb-soft"><span>CTR <b>${pctf(b.stats.ctr)}</b></span>${b.stats.hook != null ? `<span>Hook <b>${pctf(b.stats.hook)}</b></span>` : ''}<span>Add to carts <b>${b.stats.atc || 0}</b>${b.stats.cpatc ? ` at ${money(b.stats.cpatc)}` : ''}</span><span>CPM <b>${b.stats.cpm != null ? money(b.stats.cpm) : '-'}</b></span></div>` : ''}
    ${b.asana_result === 'keep' && !b.verdict ? `<div class="br-warn" style="background:var(--unk-bg);border-color:var(--line)">Keep running${b.keep_reason ? `: <b>${esc(b.keep_reason)}</b>` : ''}. Locus checks in again ${b.check_again ? `on ${esc(b.check_again)}` : 'in 7 days'}.</div>` : ''}
    ${b.needs_call ? `<div class="br-warn">Spent enough to judge. Locus's read: <b>${esc(SUG_L[b.suggest])}</b>. The media buyer makes the call in Asana.</div>` : ''}
    ${b.thin ? `<div class="br-warn">Called on thin spend: under the ${money(rules.judge_spend)} this brand needs to judge a test.</div>` : ''}
    <label class="br-f">Angle<select class="br-in" id="tdA"><option value="">Not filed</option>${angles.map(a => `<option value="${a.id}" ${a.id === b.angle_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
    <dl class="br-kv">
      ${b.concept_id ? `<dt>Concept</dt><dd>${esc(conceptName(b.concept_id))}</dd>` : ''}
      ${b.level ? `<dt>Tested</dt><dd>${esc(LEVELS.find(l => l[0] === b.level)?.[1] || b.level)}${b.variable ? ` (${esc(b.variable)})` : ''}</dd>` : ''}
      ${b.offer ? `<dt>Offer</dt><dd>${esc(b.offer)}</dd>` : ''}
      ${b.hypothesis ? `<dt>What it tested</dt><dd>${esc(b.hypothesis)}</dd>` : ''}
      ${b.why ? `<dt>Why</dt><dd>${esc(b.why)}</dd>` : ''}
      ${b.learning ? `<dt>Learning</dt><dd><b>${esc(b.learning)}</b></dd>` : ''}
      ${b.verdict_note ? `<dt>Note on the call</dt><dd>${esc(b.verdict_note)}</dd>` : ''}
    </dl>
    <div class="lb-links">${b.ads_manager ? `<a class="btn primary" href="${esc(b.ads_manager)}" target="_blank" rel="noopener">Open in Ads Manager</a>` : ''}${b.asana_url ? `<a class="btn" href="${esc(b.asana_url)}" target="_blank" rel="noopener">Open in Asana</a>` : ''}${b.brief_url ? `<a class="btn" href="${esc(b.brief_url)}" target="_blank" rel="noopener">Brief</a>` : ''}${b.asset_url ? `<a class="btn" href="${esc(b.asset_url)}" target="_blank" rel="noopener">Assets</a>` : ''}</div>
    <div><div class="br-lbl">Ads named ${esc(shortNum(b.num))}</div><div id="tdAds" class="tiny">Loading…</div></div>
    ${lg ? `<details><summary class="tiny">From the old Google Sheet</summary><dl class="br-kv" style="margin-top:8px">${Object.entries(lg).filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></details>` : ''}
  </aside>`;
  document.body.appendChild(w);
  const k = e => { if (e.key === 'Escape') close(); };
  const close = () => { w.remove(); document.removeEventListener('keydown', k); };
  document.addEventListener('keydown', k);
  w.querySelector('.lb-scrim').onclick = close;
  w.querySelector('.lb-x').onclick = close;
  w.querySelector('.lb-x').focus();
  w.querySelector('#tdA').onchange = async e => { await saveRow('batch', { id: b.id, angle_id: e.target.value }); repaint(); };
  api(`/api/brand/ads?act=${encodeURIComponent(S.act)}&batch=${b.id}`).then(r => {
    const el = w.querySelector('#tdAds'); if (!el) return;
    el.innerHTML = r.ads.length ? `<table class="br-mini"><tr><th>Ad</th><th>Spend</th><th>TW ROAS</th><th>Last spend</th></tr>${r.ads.map(a => `<tr><td>${esc(short(a.name, 48))}</td><td>${money(a.spend)}</td><td>${a.roas != null ? x2(a.roas) : '-'}</td><td>${esc(a.last || '-')}</td></tr>`).join('')}</table>` : 'No ads with this number yet.';
  }).catch(() => {});
}

/* ======================================================================
   BRAND INFO: test rules, voice, onboarding, all on one page
   ====================================================================== */
function paintInfo(body) {
  body.innerHTML = '<div id="biProfile" class="br"></div><div id="biVoice" class="br"></div><div id="biOnboard" class="br"></div>';
  paintProfile(body.querySelector('#biProfile'));
  paintVoice(body.querySelector('#biVoice'));
  paintOnboarding(body.querySelector('#biOnboard'));
}

function untaggedCard() {
  const u = S.d.untagged;
  if (!u.ads.length) return '';
  const open = S.showUntagged;
  return `<div class="card"><div class="br-bar"><div><h3 class="br-h">Ads with no batch number</h3><span class="tiny">${money(u.spend30)} in the last 30 days (${u.share30}% of spend) is not linked to any test.</span></div>
    <div><button class="btn" id="brUnt">${open ? 'Hide' : 'Show and tag'}</button></div></div>
    ${open ? `<p class="hint" style="margin:8px 0">Tag an ad to a batch and its results count there. TikTok UGC and TRYBE creator ads usually land here because of how they are named.</p>
    <div class="tbl-wrap"><table class="br-tbl"><thead><tr><th>Ad</th><th class="num">30 days</th><th class="num">All time</th><th class="num">TW ROAS</th><th>Tag to batch</th></tr></thead><tbody>
    ${u.ads.map(a => `<tr><td><div class="t">${esc(short(a.name, 70))}</div>${a.trybe ? '<div class="s">TRYBE creator ad</div>' : ''}</td><td class="num">${money(a.spend30)}</td><td class="num">${money(a.spend)}</td><td class="num">${a.roas != null ? x2(a.roas) : '-'}</td>
      <td><select class="br-in" data-tag="${esc(a.ad_id)}" style="margin:0;min-width:200px"><option value="">Pick a batch</option>${S.d.batches.slice(0, 200).map(b => `<option value="${b.id}">${esc(b.num)} · ${esc(short(b.title, 40))}</option>`).join('')}</select></td></tr>`).join('')}
    </tbody></table></div>` : ''}</div>`;
}
function wireUntagged(body) {
  const t = body.querySelector('#brUnt');
  if (t) t.onclick = () => { S.showUntagged = !S.showUntagged; repaint(); };
  body.querySelectorAll('[data-tag]').forEach(s => s.onchange = async () => {
    if (!s.value) return;
    s.disabled = true;
    try { S.d = await post('/api/brand/tag', { ad_id: s.dataset.tag, batch_id: s.value }); repaint(); } catch (e) { s.disabled = false; helpModal('Could not tag the ad', `<p>${esc(e.message)}</p>`); }
  });
}

function promptText(title, label, ph = '') {
  return new Promise(res => {
    modal(title, inp('ptV', label, '', { ph }), { cta: 'Add', wide: false, onOpen: (w, ctl) => {
      w.onSubmit(async () => { const v = val(w, 'ptV'); if (!v) throw new Error('Type a name.'); ctl.close(); res(v); });
      w.querySelector('#ptV').onkeydown = e => { if (e.key === 'Enter') w.querySelector('[data-m="yes"]').click(); };
    } }).then(v => { if (!v) res(null); });
  });
}

/* ======================================================================
   ANGLES
   ====================================================================== */
/* Resolves with the saved angle id (or null). `quick` = opened from a batch. */
function angleModal(a, { quick = false } = {}) {
  const d = S.d;
  const isNew = !a;
  a = a || { status: 'active', line_id: S.line || d.lines[0]?.id || '' };
  const Qo = Q();
  const concepts = isNew ? [] : d.concepts.filter(c => c.angle_id === a.id);
  const batches = isNew ? [] : d.batches.filter(b => b.angle_id === a.id);
  return new Promise(resolve => {
    let checked = false;
    modal(isNew ? 'New angle' : a.name, `<div class="br-form">
        ${inp('aN', 'Angle', a.name, { full: true, ph: 'Bad golfer relief', hint: 'the reason to buy, in a few words' })}
        ${inp('aArg', 'The argument', a.argument, { rows: 3, full: true, ph: 'You do not have to be good at golf to have the best day out. Our polos are for people who play for the laughs.' })}
        ${sel('aLine', 'Product line', a.line_id, d.lines.map(l => [l.id, l.name]), { blank: d.lines.length ? 'Whole brand' : 'No product lines yet' })}
        ${sel('aP', 'Persona', a.persona_id, d.personas.map(p => [p.id, `${p.name}${d.lines.length > 1 ? ' · ' + lineName(p.line_id) : ''}`]), { blank: 'Any persona' })}
        ${sel('aAw', 'Awareness it speaks to', a.awareness, Qo.AWARENESS.map(([k, l, h]) => [k, `${l}: ${h}`]), { blank: 'Pick one' })}
        ${sel('aSt', 'Market stage', a.stage, Qo.STAGES.map(([k, l]) => [k, l]), { blank: 'Pick one' })}
        ${inp('aLead', 'How the ad opens', a.lead, { full: true, hint: 'the lead', ph: 'Open on the bad shot, then the polo still looks great' })}
        ${sel('aStatus', 'Status', a.status, [['active', 'In use'], ['retired', 'Retired: do not bring back'], ['proposed', 'AI idea: not approved yet']], { blank: null })}
        ${inp('aNote', 'Notes', a.note, { rows: 2, full: true })}
      </div>
      <div id="aDup"></div>
      ${!isNew ? `<div class="br-warn" style="background:var(--unk-bg);border-color:var(--line)"><b>Same reason to buy as another angle?</b> Merge it: every test moves over and this one is removed.
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><select class="br-in" id="aMerge" style="margin:0;flex:1;min-width:200px"><option value="">Merge into…</option>${d.angles.filter(x => x.id !== a.id && x.status !== 'proposed').map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select><button class="btn" id="aMergeGo">Merge</button></div></div>` : ''}
      ${!isNew ? `<div><div class="br-bar"><h3 class="br-h">Concepts</h3><button class="btn" id="aAddC">+ Concept</button></div>
        ${concepts.length ? concepts.map(c => `<div class="br-ans"><div class="l">${esc(c.name)} <button class="btn" style="padding:1px 8px;font-size:11.5px" data-delc="${c.id}">Remove</button></div>${c.about ? `<div class="v">${esc(c.about)}</div>` : ''}</div>`).join('') : '<p class="tiny">No concepts yet. A concept is one way to show this angle: wife POV, comment reply, post-it note.</p>'}</div>
        <div><h3 class="br-h">Batches on this angle</h3>${batches.length ? `<table class="br-mini">${batches.map(b => `<tr><td><b>${esc(b.num)}</b></td><td>${esc(short(b.title, 50))}</td><td>${money(b.stats.spend)}</td><td>${b.stats.roas != null ? x2(b.stats.roas) : '-'}</td><td>${VERDICT_L[b.verdict] || ''}</td><td>${esc(short(b.learning, 80))}</td></tr>`).join('')}</table>` : '<p class="tiny">None yet.</p>'}</div>` : ''}`,
    { cta: isNew ? 'Check and save' : 'Save', danger: isNew ? null : 'Delete angle', onOpen: (w, ctl) => {
      w.onSubmit(async () => {
        const row = { id: a.id, name: val(w, 'aN'), argument: val(w, 'aArg'), line_id: val(w, 'aLine'), persona_id: val(w, 'aP'), awareness: val(w, 'aAw'), stage: val(w, 'aSt'), lead: val(w, 'aLead'), status: val(w, 'aStatus'), note: val(w, 'aNote') };
        if (!row.name) throw new Error('Name the angle.');
        const changed = isNew || row.name !== a.name || row.argument !== (a.argument || '');
        if (changed && !checked && row.status !== 'retired') {
          ctl.msg('Checking the library for the same angle in other words…', true);
          let m = { matches: [] };
          try { m = await ahJson('/api/research/dedupe', { name: row.name, argument: row.argument, exclude_id: a.id }); } catch { m = { matches: localMatches(row, a.id) }; }
          checked = true;
          if (m.matches.length) {
            w.querySelector('#aDup').innerHTML = `<div class="br-warn"><b>This looks like an angle you already have.</b>${m.matches.map(x => `<div style="margin-top:6px"><b>${esc(x.name)}</b>: ${esc(x.why || '')} <button class="btn" style="padding:2px 9px;margin-left:6px" data-use="${esc(x.id)}">Use this one</button></div>`).join('')}<div class="tiny" style="margin-top:8px">If it really is a different reason to buy, press Save again.</div></div>`;
            w.querySelectorAll('[data-use]').forEach(x => x.onclick = () => { ctl.close(); resolve(x.dataset.use); if (!quick) { S.view = 'library'; S.ang = x.dataset.use; repaint(); } });
            w.querySelector('[data-m="yes"]').textContent = 'It is new, save it';
            ctl.msg('');
            return;
          }
        }
        const id = await saveRow('angle', row);
        if (!isNew && row.name !== a.name) ahJson('/api/brand-asana/refresh-angles', {}).catch(() => {});
        ctl.close(); resolve(id); if (!quick) repaint();
      });
      if (!isNew) {
        w.onDelete(async () => { await delRow('angle', a.id); ctl.close(); resolve(null); repaint(); });
        w.querySelector('#aAddC').onclick = async () => {
          const name = await promptText('New concept', 'Name the concept: how the ad shows the angle');
          if (!name) return;
          await saveRow('concept', { angle_id: a.id, name });
          ctl.close(); angleModal(S.d.angles.find(x => x.id === a.id));
        };
        w.querySelector('#aMergeGo').onclick = async () => {
          const into = w.querySelector('#aMerge').value;
          if (!into) return ctl.msg('Pick the angle to merge into.');
          S.d = await post('/api/brand/merge', { from: a.id, into });
          ahJson('/api/brand-asana/refresh-angles', {}).catch(() => {});
          S.ang = into; ctl.close(); resolve(into); repaint();
        };
        w.querySelectorAll('[data-delc]').forEach(x => x.onclick = async () => { await delRow('concept', x.dataset.delc); x.closest('.br-ans').remove(); });
      }
    } }).then(v => { if (!v) resolve(null); });
  });
}
/* Fallback if the AI check is down: plain word overlap. */
function localMatches(row, exclude) {
  const words = s => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3));
  const a = words(row.name + ' ' + row.argument);
  return S.d.angles.filter(x => x.id !== exclude && x.status !== 'proposed').map(x => {
    const b = words(x.name + ' ' + x.argument); let n = 0; a.forEach(w => { if (b.has(w)) n++; });
    return { id: x.id, name: x.name, score: n / Math.max(1, Math.min(a.size, b.size)), why: 'Shares a lot of the same words.' };
  }).filter(x => x.score >= 0.5).sort((x, y) => y.score - x.score).slice(0, 3);
}

/* ======================================================================
   RESEARCH
   ====================================================================== */
function paintResearch(body) {
  const d = S.d;
  const line = d.lines.find(l => l.id === S.line);
  const facts = d.docs['']?.brand_facts;
  body.innerHTML = `
    <div class="card">
      <div class="br-bar"><div><h3 class="br-h">Research</h3><p class="hint" style="margin:4px 0 0;max-width:760px">Research is done per product line: products bought for the same reason. The AI reads the website, finds the competitors, collects what real customers say across reviews, Reddit, YouTube and forums, then drafts personas, the market read and angle ideas. You approve each line before it counts.</p></div>
        <div>${S.running ? `<button class="btn" id="brStop">Stop</button>` : `<button class="btn primary" id="brRunAll">Research this brand</button>`}</div></div>
      ${S.log.length ? `<div class="br-log" id="brLog" style="margin-top:12px">${S.log.map(l => l).join('\n')}</div>` : ''}
      ${!S.running && d.runs.length ? `<p class="tiny" style="margin:8px 0 0">Last run: ${esc(d.runs[0].step)} ${esc(d.runs[0].status)} ${esc((d.runs[0].finished_at || d.runs[0].started_at || '').slice(0, 16))} UTC · ${d.runs.filter(r => r.status === 'done').length} steps done so far</p>` : ''}
    </div>
    <div class="br-bar"><div class="br-chips">${d.lines.map(l => `<span class="br-chip ${l.id === S.line ? 'on' : ''}" data-line="${l.id}">${esc(l.name)}</span>`).join('')}<span class="br-chip" id="brAddLine">+ Product line</span></div>
      ${line ? `<div><button class="btn" id="brEditLine">Edit line</button>${S.running ? '' : `<button class="btn" id="brRunLine">Research this line</button>`}</div>` : ''}</div>
    ${line ? `<div id="brLine" class="br"></div>` : `<div class="card br-empty">${d.lines.length ? 'Pick a product line.' : `No product lines yet. <b>Research this brand</b> reads the website and sets them up for you, or add one yourself.${facts ? '' : ''}`}</div>`}
    ${facts ? factsCard(facts) : ''}`;
  body.querySelectorAll('[data-line]').forEach(c => c.onclick = () => { S.line = c.dataset.line; localStorage.setItem(LS_LINE + ':' + S.act, S.line); repaint(); });
  body.querySelector('#brAddLine').onclick = () => lineModal(null);
  body.querySelector('#brEditLine')?.addEventListener('click', () => lineModal(line));
  body.querySelector('#brRunAll')?.addEventListener('click', () => runResearch('all'));
  body.querySelector('#brRunLine')?.addEventListener('click', () => runResearch('line'));
  body.querySelector('#brStop')?.addEventListener('click', () => { S.running?.abort(); });
  const log = body.querySelector('#brLog'); if (log) log.scrollTop = log.scrollHeight;
  if (line) paintLine(body.querySelector('#brLine'), line);
  body.querySelectorAll('[data-approve-doc]').forEach(b => b.onclick = async () => { const [ln, key] = b.dataset.approveDoc.split('|'); await putDoc(ln, key, d.docs[ln]?.[key] || {}, 'approved'); repaint(); });
}

function factsCard(f) {
  return `<div class="card"><div class="br-bar"><h3 class="br-h">What the website says ${f._status === 'draft' ? '<span class="br-tag draft">Draft</span>' : ''}</h3>${f._status === 'draft' ? `<button class="btn" data-approve-doc="|brand_facts">Approve</button>` : ''}</div>
    <dl class="br-kv" style="margin-top:10px">
      ${f.uvp ? `<dt>Value proposition</dt><dd>${esc(f.uvp)}</dd>` : ''}
      ${f.products?.length ? `<dt>Products</dt><dd>${f.products.map(p => `${esc(p.name)}${p.price ? ' · ' + esc(p.price) : ''}`).join('\n')}</dd>` : ''}
      ${f.claims?.length ? `<dt>Claims and proof</dt><dd>${f.claims.map(c => `${esc(c.claim)}${c.proof ? ` (${esc(c.proof)})` : ''}`).join('\n')}</dd>` : ''}
      ${f.offers?.length ? `<dt>Offers</dt><dd>${f.offers.map(esc).join('\n')}</dd>` : ''}
    </dl></div>`;
}

function paintLine(el, line) {
  const d = S.d, L = line.id;
  const docs = d.docs[L] || {};
  const m = docs.market || {}, mech = docs.mechanism || {};
  const personas = d.personas.filter(p => p.line_id === L);
  const voc = d.voc.filter(v => v.line_id === L);
  const comps = d.comps.filter(c => c.line_id === L);
  const ideas = d.angles.filter(a => a.status === 'proposed' && (a.line_id === L || !a.line_id));
  const Qo = Q();
  const kinds = [['all', 'All'], ['pain', 'Pains'], ['desire', 'Desires'], ['objection', 'Objections'], ['failed', 'Tried and failed'], ['trigger', 'Triggers'], ['transformation', 'Transformations']];
  const vk = S.vocKind;
  const vrows = voc.filter(v => vk === 'all' || v.kind === vk);
  const stepBtn = (step, label) => S.running ? '' : `<button class="btn" style="padding:4px 10px;font-size:12px" data-step="${step}">${label}</button>`;
  el.innerHTML = `
    <div class="br-g2">
      <div class="card"><div class="br-bar"><h3 class="br-h">The market ${m._status === 'draft' ? '<span class="br-tag draft">Draft</span>' : ''}</h3><div>${m._status === 'draft' ? `<button class="btn" data-approve-doc="${L}|market">Approve</button>` : ''}<button class="btn" id="brEditMarket">Edit</button></div></div>
        <dl class="br-kv" style="margin-top:10px">
          <dt>What they want</dt><dd>${esc(m.mass_desire || '-')}</dd>
          <dt>Awareness</dt><dd>${esc(AW()[m.awareness] || '-')}${m.awareness_why ? `\n<span class="tiny">${esc(m.awareness_why)}</span>` : ''}</dd>
          <dt>Market stage</dt><dd>${esc(Qo.STAGES.find(s => s[0] === String(m.stage))?.[1] || '-')}${m.stage_why ? `\n<span class="tiny">${esc(m.stage_why)}</span>` : ''}</dd>
          <dt>Already claimed</dt><dd>${lines(m.claims_made).map(esc).join('\n') || '-'}</dd>
          <dt>Open ground</dt><dd>${lines(m.open_ground).map(esc).join('\n') || '-'}</dd>
        </dl></div>
      <div class="card"><div class="br-bar"><h3 class="br-h">The mechanism ${mech._status === 'draft' ? '<span class="br-tag draft">Draft</span>' : ''}</h3><div>${mech._status === 'draft' ? `<button class="btn" data-approve-doc="${L}|mechanism">Approve</button>` : ''}<button class="btn" id="brEditMech">Edit</button></div></div>
        <dl class="br-kv" style="margin-top:10px"><dt>Why what they tried failed</dt><dd>${esc(mech.problem || '-')}</dd><dt>Why this works</dt><dd>${esc(mech.solution || '-')}</dd></dl></div>
    </div>

    <div class="card"><div class="br-bar"><h3 class="br-h">Personas <span class="tiny">${personas.length}</span></h3><div>${stepBtn('synthesis', 'Re-run personas and angles')}<button class="btn" id="brAddP">+ Persona</button></div></div>
      ${personas.length ? `<div class="br-g3" style="margin-top:12px">${personas.map(p => `<div class="br-pcard" data-p="${p.id}"><div class="br-bar"><h4>${esc(p.name)}</h4><div>${statusTag(p.status)}${p.data.awareness ? `<span class="br-tag">${esc(AW()[p.data.awareness] || '')}</span>` : ''}</div></div>
        <div class="tiny">${esc(p.data.demo || '')}</div><div style="font-size:13.5px">${esc(short(p.data.summary || p.data.desire, 180))}</div>
        ${p.data.push || p.data.anxiety ? `<div class="tiny"><b>Push:</b> ${esc(short(p.data.push, 80))}<br><b>Anxiety:</b> ${esc(short(p.data.anxiety, 80))}</div>` : ''}</div>`).join('')}</div>` : '<p class="hint" style="margin-top:8px">No personas yet.</p>'}</div>

    <div class="card"><div class="br-bar"><h3 class="br-h">Angle ideas <span class="tiny">${ideas.length} waiting for a yes or no</span></h3><div>${stepBtn('synthesis', 'Re-run personas and angles')}</div></div>
      ${ideas.length ? ideas.map(a => `<div class="br-call"><div><b>${esc(a.name)}</b> <span class="tiny">${esc(personaName(a.persona_id))}${a.awareness ? ' · ' + esc(AW()[a.awareness]) : ''}</span><div style="font-size:13.5px;margin-top:2px">${esc(a.argument)}</div>${a.lead ? `<div class="tiny">Opens with: ${esc(a.lead)}</div>` : ''}${a.note ? `<div class="tiny" style="${/Looks like the existing/.test(a.note) ? 'color:var(--warn)' : ''}">${esc(a.note)}</div>` : ''}</div>
        <div class="btns"><button class="btn primary" data-accept="${a.id}">Add to library</button><button class="btn" data-edit-a="${a.id}">Edit</button><button class="btn" data-dismiss="${a.id}">Dismiss</button></div></div>`).join('') : '<p class="hint" style="margin-top:8px">No ideas waiting. The research drafts them once it has personas.</p>'}</div>

    <div class="card"><div class="br-bar"><h3 class="br-h">Voice of customer <span class="tiny">${voc.length} quotes, ${voc.filter(v => v.status === 'draft').length} drafts</span></h3>
      <div>${stepBtn('voc', 'Re-run customer research')}${voc.some(v => v.status === 'draft') ? `<button class="btn" id="brVocOk">Approve all drafts</button>` : ''}<button class="btn" id="brAddQ">+ Quote</button></div></div>
      <div class="br-chips" style="margin:10px 0">${kinds.map(([k, l]) => `<span class="br-chip ${vk === k ? 'on' : ''}" data-vk="${k}">${l}<span class="n">${k === 'all' ? voc.length : voc.filter(v => v.kind === k).length}</span></span>`).join('')}</div>
      ${vrows.length ? `<div style="display:flex;flex-direction:column;gap:10px">${vrows.slice(0, 150).map(v => `<div class="br-bar" style="align-items:flex-start"><div class="br-quote ${esc(v.kind)}" style="flex:1;min-width:240px">${v.nugget ? '★ ' : ''}"${esc(v.quote)}"<div class="tiny">${esc(v.kind)}${v.theme ? ' · ' + esc(v.theme) : ''} · ${v.url ? `<a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.source || 'source')}</a>` : esc(v.source || 'no source')} ${v.status === 'draft' ? '<span class="br-tag draft">Draft</span>' : ''}</div></div>
        <div>${v.status === 'draft' ? `<button class="btn" style="padding:3px 9px" data-vok="${v.id}">Keep</button>` : ''}<button class="btn" style="padding:3px 9px" data-vdel="${v.id}">Remove</button></div></div>`).join('')}</div>` : '<p class="hint">No quotes here yet.</p>'}</div>

    <div class="card"><div class="br-bar"><h3 class="br-h">Competitors <span class="tiny">${comps.length}</span></h3><div>${stepBtn('competitors', 'Re-run competitors')}<button class="btn" id="brAddComp">+ Competitor</button></div></div>
      ${comps.length ? `<div class="br-g3" style="margin-top:12px">${comps.map(c => `<div class="br-pcard" data-comp="${c.id}"><div class="br-bar"><h4>${esc(c.name)}</h4>${statusTag(c.status)}</div>
        ${c.url ? `<div class="tiny">${esc(short(c.url, 50))}</div>` : ''}${c.data.price ? `<div class="tiny">${esc(c.data.price)}</div>` : ''}
        <div style="font-size:13px"><b>Promise:</b> ${esc(short(c.data.promise, 120))}</div>${c.data.mechanism ? `<div style="font-size:13px"><b>Mechanism:</b> ${esc(short(c.data.mechanism, 100))}</div>` : ''}
        ${(c.data.complaints || []).length ? `<div class="tiny"><b>Their buyers complain:</b> ${esc(short(lines(c.data.complaints).join(' · '), 160))}</div>` : ''}</div>`).join('')}</div>` : '<p class="hint" style="margin-top:8px">No competitors yet.</p>'}</div>`;

  el.querySelector('#brEditMarket').onclick = () => marketModal(L, m);
  el.querySelector('#brEditMech').onclick = () => docModal(L, 'mechanism', 'The mechanism', [['problem', 'Why what they tried before failed', 3], ['solution', 'Why this product works', 3]], mech);
  el.querySelector('#brAddP').onclick = () => personaModal(null, L);
  el.querySelectorAll('[data-p]').forEach(c => c.onclick = () => personaModal(d.personas.find(p => p.id === c.dataset.p), L));
  el.querySelectorAll('[data-comp]').forEach(c => c.onclick = () => compModal(d.comps.find(x => x.id === c.dataset.comp), L));
  el.querySelector('#brAddComp').onclick = () => compModal(null, L);
  el.querySelectorAll('[data-vk]').forEach(c => c.onclick = () => { S.vocKind = c.dataset.vk; repaint(); });
  el.querySelectorAll('[data-vok]').forEach(b => b.onclick = async () => { await saveRow('voc', { id: b.dataset.vok, status: 'approved' }); repaint(); });
  el.querySelectorAll('[data-vdel]').forEach(b => b.onclick = async () => { await delRow('voc', b.dataset.vdel); repaint(); });
  el.querySelector('#brVocOk')?.addEventListener('click', async e => {
    e.target.disabled = true;
    const rows = voc.filter(v => v.status === 'draft').map(v => ({ kind: 'voc', row: { id: v.id, status: 'approved' } }));
    for (let i = 0; i < rows.length; i += 150) S.d = await post('/api/brand/save-many', { rows: rows.slice(i, i + 150) });
    repaint();
  });
  el.querySelector('#brAddQ').onclick = () => quoteModal(L);
  el.querySelectorAll('[data-accept]').forEach(b => b.onclick = async () => { await saveRow('angle', { id: b.dataset.accept, status: 'active', source: 'ai' }); repaint(); });
  el.querySelectorAll('[data-dismiss]').forEach(b => b.onclick = async () => { await delRow('angle', b.dataset.dismiss); repaint(); });
  el.querySelectorAll('[data-edit-a]').forEach(b => b.onclick = () => angleModal(d.angles.find(a => a.id === b.dataset.editA)));
  el.querySelectorAll('[data-step]').forEach(b => b.onclick = () => runResearch('one', b.dataset.step));
}

function lineModal(line) {
  modal(line ? `Edit ${line.name}` : 'New product line', `<p class="hint">A product line is a group of products bought for the same reason. If a buyer chooses between two products for different jobs (energy strips vs sleep strips), they are separate lines. Research, personas and angles are done per line.</p>
    <div class="br-form">${inp('lN', 'Name', line?.name, { full: true, ph: 'Sleep strips' })}${inp('lA', 'What it is and why people buy it', line?.about, { rows: 2, full: true })}${inp('lP', 'Products in it', line?.products, { rows: 2, full: true })}</div>`,
  { wide: false, danger: line ? 'Delete line and its research' : null, onOpen: (w, ctl) => {
    w.onSubmit(async () => { const id = await saveRow('line', { id: line?.id, name: val(w, 'lN'), about: val(w, 'lA'), products: val(w, 'lP') }); S.line = id; localStorage.setItem(LS_LINE + ':' + S.act, id); ctl.close(); repaint(); });
    if (line) w.onDelete(async () => { await delRow('line', line.id); S.line = S.d.lines[0]?.id || null; ctl.close(); repaint(); });
  } });
}

function marketModal(L, m) {
  const Qo = Q();
  modal('The market', `<div class="br-form">
    ${inp('mD', 'What they want, in their words (the mass desire)', m.mass_desire, { rows: 2, full: true })}
    ${sel('mAw', 'Typical awareness', m.awareness, Qo.AWARENESS.map(([k, l, h]) => [k, `${l}: ${h}`]), { blank: 'Pick one', full: true })}
    ${inp('mAwW', 'Why', m.awareness_why, { rows: 2, full: true })}
    ${sel('mSt', 'Market stage (sophistication)', m.stage, Qo.STAGES.map(([k, l, h]) => [k, `${l}. ${h}`]), { blank: 'Pick one', full: true })}
    ${inp('mStW', 'Why', m.stage_why, { rows: 2, full: true })}
    ${inp('mC', 'Claims the market has already made', lines(m.claims_made).join('\n'), { rows: 3, full: true, hint: 'one per line' })}
    ${inp('mO', 'Open ground: what nobody is saying', lines(m.open_ground).join('\n'), { rows: 3, full: true, hint: 'one per line' })}</div>`, { onOpen: (w, ctl) => w.onSubmit(async () => {
    await putDoc(L, 'market', { mass_desire: val(w, 'mD'), awareness: val(w, 'mAw'), awareness_why: val(w, 'mAwW'), stage: val(w, 'mSt'), stage_why: val(w, 'mStW'), claims_made: lines(val(w, 'mC')), open_ground: lines(val(w, 'mO')) });
    ctl.close(); repaint();
  }) });
}
function docModal(L, key, title, fields, data) {
  modal(title, `<div class="br-form">${fields.map(([k, l, r]) => inp('d_' + k, l, Array.isArray(data[k]) ? data[k].join('\n') : data[k], { rows: r || 0, full: true })).join('')}</div>`, { onOpen: (w, ctl) => w.onSubmit(async () => {
    const out = { ...data }; for (const [k] of fields) out[k] = val(w, 'd_' + k);
    await putDoc(L, key, out); ctl.close(); repaint();
  }) });
}

function personaModal(p, L) {
  const Qo = Q();
  const d0 = p?.data || {};
  const isNew = !p;
  modal(isNew ? 'New persona' : p.name, `<div class="br-form">
      ${inp('pN', 'Name', p?.name, { ph: 'The Weekend Warrior' })}
      ${sel('pAw', 'Awareness', d0.awareness, Qo.AWARENESS.map(([k, l]) => [k, l]), { blank: 'Pick one' })}
      ${Qo.PERSONA_Q.map(([k, l]) => inp('pq_' + k, l, d0[k], { rows: 2, full: true })).join('')}
    </div>`, { cta: isNew ? 'Save' : (p.status === 'draft' ? 'Save and approve' : 'Save'), danger: isNew ? null : 'Delete persona', onOpen: (w, ctl) => {
    w.onSubmit(async () => {
      const data = { ...d0, awareness: val(w, 'pAw') };
      for (const [k] of Qo.PERSONA_Q) data[k] = val(w, 'pq_' + k);
      await saveRow('persona', { id: p?.id, line_id: L, name: val(w, 'pN'), data_json: data, status: 'approved', source: p?.source || 'staff' });
      ctl.close(); repaint();
    });
    if (!isNew) w.onDelete(async () => { await delRow('persona', p.id); ctl.close(); repaint(); });
  } });
}

function compModal(c, L) {
  const x = c?.data || {};
  modal(c ? c.name : 'New competitor', `<div class="br-form">
    ${inp('cN', 'Brand', c?.name)}${inp('cU', 'Website', c?.url, { type: 'url' })}
    ${inp('cPr', 'Price point', x.price)}${inp('cOf', 'Their offer', x.offer)}
    ${inp('cPm', 'Their main promise', x.promise, { rows: 2, full: true })}
    ${inp('cMe', 'The mechanism they claim', x.mechanism, { rows: 2, full: true })}
    ${inp('cAd', 'What their ads keep saying', lines(x.ad_themes).join('\n'), { rows: 3, full: true, hint: 'one per line' })}
    ${inp('cCo', 'What their unhappy buyers complain about', lines(x.complaints).join('\n'), { rows: 3, full: true, hint: 'one per line, quotes welcome' })}
    ${inp('cS', 'Strengths', x.strengths, { rows: 2 })}${inp('cW', 'Weaknesses', x.weaknesses, { rows: 2 })}</div>`,
  { cta: c?.status === 'draft' ? 'Save and approve' : 'Save', danger: c ? 'Delete' : null, onOpen: (w, ctl) => {
    w.onSubmit(async () => {
      await saveRow('comp', { id: c?.id, line_id: L, name: val(w, 'cN'), url: val(w, 'cU'), status: 'approved', data_json: { ...x, price: val(w, 'cPr'), offer: val(w, 'cOf'), promise: val(w, 'cPm'), mechanism: val(w, 'cMe'), ad_themes: lines(val(w, 'cAd')), complaints: lines(val(w, 'cCo')), strengths: val(w, 'cS'), weaknesses: val(w, 'cW') } });
      ctl.close(); repaint();
    });
    if (c) w.onDelete(async () => { await delRow('comp', c.id); ctl.close(); repaint(); });
  } });
}

function quoteModal(L) {
  modal('Add a customer quote', `<div class="br-form">
    ${inp('vQ', 'The exact words', '', { rows: 3, full: true })}
    ${sel('vK', 'Kind', 'pain', [['pain', 'Pain'], ['desire', 'Desire'], ['objection', 'Objection'], ['failed', 'Tried and failed'], ['trigger', 'Trigger'], ['transformation', 'Transformation']], { blank: null })}
    ${inp('vT', 'Theme', '')}${inp('vS', 'Source', '', { ph: 'Judge.me review' })}${inp('vU', 'Link', '', { type: 'url' })}
    <label class="br-f"><input type="checkbox" id="vNug"> Golden nugget: good enough to use as ad copy</label></div>`, { onOpen: (w, ctl) => w.onSubmit(async () => {
    await saveRow('voc', { line_id: L, quote: val(w, 'vQ'), kind: val(w, 'vK'), theme: val(w, 'vT'), source: val(w, 'vS'), url: val(w, 'vU'), nugget: w.querySelector('#vNug').checked ? 1 : 0, status: 'approved' });
    ctl.close(); repaint();
  }) });
}

/* The research run. 'all' = the website, then every line. 'line' = the three
   line steps. 'one' = a single step on the current line. */
async function runResearch(scope, only) {
  const d = S.d;
  if (S.running) return;
  const needsBrand = scope === 'all';
  const perLine = scope === 'all' ? null : [S.line];
  const est = scope === 'one' ? 'about $1 to $6' : scope === 'line' ? 'about $5 to $20' : `about $5 to $20 per product line`;
  const ok = await modal('Run the research', `<p class="hint">Uses Claude Opus 5 with live web search. ${scope === 'one' ? 'One step' : 'Each product line'} takes several minutes and costs ${est} (an estimate; the real cost shows as it runs). Keep this tab open; if it closes, finished steps are kept.</p>
    <p class="hint">Everything comes back as a draft. Earlier AI drafts for the same step are replaced; anything you approved or wrote yourself is kept.</p>
    ${needsBrand && !(d.docs['']?.profile?.website || d.onboard?.answers?.website) ? inp('rWeb', 'Brand website', '', { type: 'url', ph: 'https://grunkdolfer.com' }) : ''}`, { cta: 'Start', wide: false, onOpen: (w, ctl) => w.onSubmit(async () => {
    const web = val(w, 'rWeb');
    if (web !== undefined) {
      if (!web) throw new Error('Add the website so the research knows where to start.');
      await putDoc('', 'profile', { ...(S.d.docs['']?.profile || {}), website: web });
    }
    ctl.close(true);
  }) });
  if (!ok) return;
  const ac = new AbortController();
  S.running = ac; S.log = []; let spent = 0;
  const say = (html) => { S.log.push(html); const el = $('#brLog'); if (el) { el.innerHTML = S.log.join('\n'); el.scrollTop = el.scrollHeight; } else if (S.view === 'research') repaint(); };
  const step = async (name, lineId, label) => {
    say(`<b>${esc(label)}</b>`);
    const r = await ahStream('/api/research/step', { step: name, line_id: lineId }, o => {
      if (o.type === 'tool') say(`  ${o.name === 'web_fetch' ? 'reading' : 'searching'}: ${esc(short(o.text, 110))}`);
      else if (o.type === 'note') say(`  ${esc(o.text)}`);
    }, ac.signal);
    spent += r.cost || 0;
    say(`  <span class="ok">${esc(r.summary)}</span> <span class="tiny">($${(r.cost || 0).toFixed(2)})</span>`);
    await load();
  };
  if (S.view === 'research') repaint();
  try {
    if (needsBrand) await step('brand', null, 'Reading the website');
    const ids = perLine || S.d.lines.map(l => l.id);
    for (const id of ids) {
      const nm = S.d.lines.find(l => l.id === id)?.name || '';
      if (only) { await step(only, id, `${nm}: ${{ competitors: 'competitors', voc: 'voice of customer', synthesis: 'personas and angle ideas' }[only]}`); continue; }
      await step('competitors', id, `${nm}: finding competitors`);
      await step('voc', id, `${nm}: collecting what customers say`);
      await step('synthesis', id, `${nm}: personas, market and angle ideas`);
    }
    say(`<span class="ok"><b>Done.</b> About $${spent.toFixed(2)} in total. Review the drafts below.</span>`);
  } catch (e) {
    say(`<span class="e">${e.name === 'AbortError' ? 'Stopped. Finished steps are kept.' : esc(e.message)}</span>`);
    await load().catch(() => {});
  } finally {
    S.running = null;
    if (S.view === 'research') repaint();
  }
}

/* ======================================================================
   ONBOARDING
   ====================================================================== */
function answerHtml(f, v, files = true) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return null;
  if (v === '__unsure') return '<span style="color:var(--warn)">Not sure (flagged for our research)</span>';
  if (f.type === 'list' && Array.isArray(v)) {
    const cols = f.cols.filter(([k]) => v.some(r => r && r[k] != null && r[k] !== ''));
    if (!cols.length) return null;
    return `<table class="br-mini"><tr>${cols.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr>${v.filter(r => cols.some(([k]) => r[k])).map(r => `<tr>${cols.map(([k]) => `<td>${esc(r[k] === true ? 'Yes' : r[k] === false ? 'No' : r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</table>`;
  }
  if (f.type === 'file') return (Array.isArray(v) ? v : [v]).map(x => files ? `<a href="#" data-file="${esc(x.key)}">${esc(x.name)}</a>` : esc(x.name)).join(', ');
  if (f.type === 'yesno' || f.type === 'check') return v === true || v === 'yes' ? 'Yes' : v === false || v === 'no' ? 'No' : esc(v);
  if (f.type === 'money') return money(+v);
  return esc(v);
}
function paintOnboarding(body) {
  const d = S.d, o = d.onboard;
  const Qo = Q();
  if (!o) {
    body.innerHTML = `<div class="card" style="max-width:720px;display:flex;flex-direction:column;gap:10px"><h3 class="br-h">Send ${esc(d.account.name)} their onboarding link</h3>
      <p class="hint">One link, no login. It walks the client through ${Qo.STEPS.length} short steps (getting started, team, products, numbers, offers, customers, brand, competitors, access), saves as they go, explains why each question matters and has a help box for anything they are unsure of. "I'm not sure" is always allowed; it flags the question for our research instead.</p>
      <div><button class="btn primary" id="brMkLink">Create the link</button></div></div>`;
    body.querySelector('#brMkLink').onclick = async () => { S.d = await post('/api/brand/onboard', {}); repaint(); };
    return;
  }
  const link = FORM_BASE + o.token;
  const a = o.answers || {}, pf = o.prefill || {};
  const all = Qo.STEPS.flatMap(s => s.fields.filter(f => !f.calc));
  const done = all.filter(f => answerHtml(f, a[f.id]) != null).length;
  const pct = Math.round((done / Math.max(1, all.length)) * 100);
  body.innerHTML = `
    <div class="card"><div class="br-bar"><div style="min-width:240px;flex:1"><p class="br-lbl">Onboarding link · ${o.status === 'submitted' ? `<span style="color:var(--good)">submitted ${esc((o.submitted_at || '').slice(0, 10))}</span>` : o.status === 'started' ? '<span style="color:var(--warn)">in progress</span>' : 'not opened yet'}</p>
        <b style="word-break:break-all">${esc(link.replace('https://', ''))}</b>
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px"><div class="br-prog" style="flex:1;max-width:260px"><i style="width:${pct}%"></i></div><span class="tiny">${done} of ${all.length} answered</span></div></div>
      <div><button class="btn" id="brCopy">Copy link</button><a class="btn" href="${esc(link)}" target="_blank" rel="noopener">Open the form</a><button class="btn" id="brPrefill">${S.prefilling ? 'Reading the website…' : 'Pre-fill from website'}</button></div></div>
      <p class="tiny" style="margin:8px 0 0">Pre-fill reads the brand's website and puts suggested answers in front of the client, so they confirm instead of typing. To change an answer yourself, open the form: it saves the same way.</p>
      <div id="brPfLog"></div></div>
    ${Qo.STEPS.map(s => `<div class="card"><h3 class="br-h">${esc(s.title)}</h3>${s.fields.map(f => {
      const v = f.calc ? Qo.calc(f.id, a) : a[f.id];
      const h = f.calc ? (v != null ? money(v) : null) : answerHtml(f, v);
      const sug = h == null && pf[f.id] != null ? answerHtml(f, pf[f.id], false) : null;
      return `<div class="br-ans"><div class="l">${esc(f.label)}</div><div class="v ${h == null ? 'none' : ''}">${h ?? 'Not answered'}</div>${sug ? `<div class="sug">Suggested from the website: ${sug}</div>` : ''}</div>`;
    }).join('')}</div>`).join('')}`;
  body.querySelector('#brCopy').onclick = async e => { try { await navigator.clipboard.writeText(link); e.target.textContent = 'Copied'; } catch { helpModal('Copy this link', `<p><code style="user-select:all">${esc(link)}</code></p>`); } };
  body.querySelector('#brPrefill').onclick = async () => {
    if (S.prefilling) return;
    S.prefilling = true; repaint();
    const logEl = () => $('#brPfLog');
    const say = t => { const el = logEl(); if (el) el.innerHTML = `<div class="br-log" style="margin-top:10px">${t}</div>`; };
    try {
      const r = await ahStream('/api/research/prefill', {}, o2 => { if (o2.type === 'tool') say(`reading: ${esc(short(o2.text, 100))}`); });
      await load(); S.prefilling = false; repaint(); say(`<span class="ok">${esc(r.summary)}</span> ($${(r.cost || 0).toFixed(2)})`);
    } catch (e) { S.prefilling = false; repaint(); say(`<span class="e">${esc(e.message)}</span>`); }
  };
  body.querySelectorAll('[data-file]').forEach(x => x.onclick = async e => {
    e.preventDefault();
    const res = await fetch(`${S.url.replace(/\/+$/, '')}/api/brand/file?act=${encodeURIComponent(S.act)}&key=${encodeURIComponent(x.dataset.file)}`, { headers: { Authorization: 'Bearer ' + S.tok } });
    if (!res.ok) return helpModal('Could not open the file', '<p>It may have been removed.</p>');
    const blob = await res.blob(); const u = URL.createObjectURL(blob);
    const a2 = document.createElement('a'); a2.href = u; a2.download = x.textContent; a2.click(); setTimeout(() => URL.revokeObjectURL(u), 5000);
  });
}

/* ======================================================================
   HOW WE WRITE: the voice interview, the guide, the copy desk, the bank
   (2026-09-25). The Lucky Golf loop for every brand: the client talks through
   the interview (onboard/voice.html), rates sample lines, the AI writes the
   guide; then every line the team keeps or rejects here goes into the bank, and
   the next draft reads it. The AI is account-health voice.js.
   ====================================================================== */
const VOICE_BASE = 'https://tools.go-mobius-digital.com/onboard/voice.html?t=';
const DESK_FORMATS = ['Ad headline', 'Ad primary text', 'Email subject line', 'Email opener', 'Email body', 'Product description', 'Social caption', 'Video hook (first 3 seconds)', 'Video script', 'Landing page hero', 'Homepage headline'];

/* Just enough markdown for the guide: ## headings, - bullets, **bold**, paragraphs. */
function mdHtml(md) {
  const out = []; let list = false;
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  for (const raw of String(md || '').split('\n')) {
    const l = raw.trim();
    if (/^[-*] /.test(l)) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(l.slice(2))}</li>`); continue; }
    if (list) { out.push('</ul>'); list = false; }
    if (!l) continue;
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    out.push(h ? `<h4>${inline(h[2])}</h4>` : `<p>${inline(l)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('');
}
const slugOf = name => String(name || 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/* A Claude skill (SKILL.md) built from the guide and the bank, the same shape as lucky-golf-copy. */
function skillFile(name, guide, bank) {
  const yes = bank.filter(x => x.verdict === 'yes'), no = bank.filter(x => x.verdict === 'no');
  const row = x => `- [${x.format}] ${x.text}${x.why ? ` (why: ${x.why})` : ''}`;
  return [
    '---',
    `name: ${slugOf(name)}-copy`,
    `description: Write copy in the ${name} brand voice for any format: ad headlines, primary text, email subject lines and bodies, product descriptions, captions, video hooks and scripts, landing pages. Trigger whenever the user asks for copy, writing or drafts for ${name}, or to rewrite or improve existing ${name} copy.`,
    '---',
    '',
    `# ${name} copy`,
    '',
    'Read the whole guide below before writing a word. It wins on how the copy SOUNDS. The approved lines show the feel: match it, never reuse their phrases. The rejected lines, and the reasons, are what to avoid. Never invent a product fact, price, number or review; if you need one you do not have, ask. No em dashes.',
    '',
    'When the user approves or rejects a line, suggest they add it in Locus > Brand > Brand info > Copy desk, so the guide keeps learning.',
    '',
    guide || '(No guide yet. Run the voice interview first.)',
    '',
    `## Approved lines (${yes.length})`,
    yes.map(row).join('\n') || '- none yet',
    '',
    `## Rejected lines, and why (${no.length})`,
    no.map(row).join('\n') || '- none yet',
    '',
  ].join('\n');
}

function paintVoice(body) {
  const d = S.d, o = d.onboard;
  const iv = d.docs['']?.voice_interview || {};
  const g = d.docs['']?.voice_guide || {};
  const bankAll = d.docs['']?.voice_bank?.items || [];
  const bank = bankAll.slice().reverse();
  const link = o ? VOICE_BASE + o.token : '';
  const turns = iv.turns || [];
  const st = !turns.length ? 'not started' : iv.stage === 'done' ? `finished ${esc((iv.finished_at || '').slice(0, 10))}` : iv.stage === 'samples' ? `rating samples, round ${iv.round || 1}` : `talking, ${turns.length} answers`;
  const desk = S.desk && S.desk.act === S.act ? S.desk : (S.desk = { act: S.act, format: DESK_FORMATS[0], brief: '', n: 5, lines: [], busy: false, err: '' });
  const yesN = bank.filter(x => x.verdict === 'yes').length, noN = bank.length - yesN;
  body.innerHTML = `
    <div class="card"><div class="br-bar"><div style="min-width:240px;flex:1"><h3 class="br-h">How we write ${g.md ? (g._status === 'draft' ? `<span class="br-tag draft">Draft v${g.version || 1}</span>` : `<span class="br-tag win">Approved v${g.version || 1}</span>`) : ''}</h3>
        <p class="hint" style="margin:4px 0 0">The brand's writing guide, built the way Lucky Golf's was: the client talks through a voice interview and rates sample lines, then every line the team keeps or rejects on the copy desk teaches it more.</p></div>
      <div>${g.md && g._status === 'draft' ? '<button class="btn" id="vgOk">Approve</button>' : ''}${g.md ? '<button class="btn" id="vgEdit">Edit</button>' : ''}<button class="btn" id="vgRe">${S.vgBusy ? 'Writing… (about a minute)' : g.md ? 'Rewrite with new examples' : 'Write the guide'}</button>${g.md ? '<button class="btn" id="vgSkill">Download as a Claude skill</button>' : ''}</div></div>
      <p class="br-msg" id="vgMsg"></p>
      <div class="br-g2" style="margin-top:10px">
        <div><p class="br-lbl">Voice interview · ${st}</p>
          ${o ? `<b style="word-break:break-all;font-size:13px">${esc(link.replace('https://', ''))}</b>
            <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn" id="vCopy">Copy link</button><a class="btn" href="${esc(link)}" target="_blank" rel="noopener">Open it</a></div>
            <p class="tiny" style="margin:8px 0 0">Send it after the strategy call. The onboarding form's thank-you screen offers it too. About 20 minutes: they talk, it asks follow-ups, then they rate sample lines.</p>
            ${turns.length ? `<details style="margin-top:10px"><summary class="tiny" style="cursor:pointer">Read the interview (${turns.length} answers)</summary><div class="br-voicetx">${turns.map(t => `<p><b>${esc(t.q)}</b><br>${esc(t.a || 'Skipped')}</p>`).join('')}</div></details>` : ''}`
            : `<p class="tiny">The interview uses the onboarding link's code.</p><button class="btn" id="vMk">Create the links</button>`}
        </div>
        <div><p class="br-lbl">Example bank · ${yesN} kept · ${noN} rejected</p>
          <p class="tiny" style="margin:4px 0 0">Every line the client or the team approved or rejected, with the reason. The guide and the copy desk both read it.</p>
          ${bank.length ? `<details style="margin-top:8px"><summary class="tiny" style="cursor:pointer">Show the lines</summary><div class="br-bank">${bank.map(x => `<div class="br-bk"><span class="br-tag ${x.verdict === 'yes' ? 'win' : 'lose'}">${x.verdict === 'yes' ? 'Kept' : 'Rejected'}</span> <span class="tiny">${esc(x.format)} · ${esc(x.by || '')}</span><div>${esc(x.text)}</div>${x.why ? `<div class="tiny">Why: ${esc(x.why)}</div>` : ''}<button class="unsure-x" data-rm="${esc(x.id)}" title="Remove from the bank">Remove</button></div>`).join('')}</div></details>` : ''}
        </div>
      </div>
      ${g.md ? `<details style="margin-top:14px" ${S.vgOpen ? 'open' : ''} id="vgD"><summary style="cursor:pointer;font-weight:600">Read the guide</summary><div class="br-md">${mdHtml(g.md)}</div></details>` : ''}
    </div>
    <div class="card"><div class="br-bar"><h3 class="br-h">Copy desk</h3><span class="tiny">Writes from the guide and the bank. Keep or reject each line: that is how it learns.</span></div>
      <div class="br-form" style="margin-top:10px">
        ${sel('dF', 'Format', desk.format, DESK_FORMATS.map(f => [f, f]), { blank: null })}
        ${inp('dN', 'How many', desk.n, { type: 'number' })}
        ${inp('dB', 'Brief', desk.brief, { rows: 3, full: true, ph: 'The product, the angle, the offer. For example: Carver 02 Black, angle "nobody sees it coming", no discount.' })}
      </div>
      <div style="margin-top:10px;display:flex;gap:10px;align-items:center"><button class="btn primary" id="dGo" ${desk.busy ? 'disabled' : ''}>${desk.busy ? 'Writing…' : 'Write lines'}</button><span class="br-msg bad">${esc(desk.err || '')}</span></div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">${desk.lines.map(l => `<div class="br-desk ${l.done ? 'done' : ''}" data-l="${esc(l.id)}">
        <textarea class="br-in" rows="${Math.min(6, Math.max(2, Math.ceil(l.text.length / 80)))}" data-t aria-label="The line; edit it before keeping if you like">${esc(l.text)}</textarea>
        ${l.note ? `<div class="tiny" style="margin-top:4px">${esc(l.note)}</div>` : ''}
        ${l.done ? `<div class="tiny" style="margin-top:6px;color:var(${l.done === 'yes' ? '--good' : '--bad'})">${l.done === 'yes' ? 'Kept: in the bank' : 'Rejected: in the bank'}</div>` : `<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center"><button class="btn" data-k="yes">Keep</button><input class="br-in" data-why placeholder="Why it misses (the more specific the better)" aria-label="Why it misses" style="flex:1;min-width:200px;margin:0"><button class="btn" data-k="no">Reject</button></div>`}
      </div>`).join('')}</div>
    </div>`;
  const msg = (t, ok) => { const m = $('#vgMsg'); if (m) { m.textContent = t; m.className = 'br-msg ' + (ok ? 'ok' : 'bad'); } };
  body.querySelector('#vMk')?.addEventListener('click', async () => { S.d = await post('/api/brand/onboard', {}); repaint(); });
  body.querySelector('#vCopy')?.addEventListener('click', async e => { try { await navigator.clipboard.writeText(link); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Select the link above'; } });
  body.querySelector('#vgD')?.addEventListener('toggle', e => { S.vgOpen = e.target.open; });
  body.querySelector('#vgOk')?.addEventListener('click', async () => { await putDoc('', 'voice_guide', g, 'approved'); repaint(); });
  body.querySelector('#vgEdit')?.addEventListener('click', () => modal('How we write', inp('gMd', 'The guide', g.md, { rows: 24, full: true, hint: '## for headings, - for bullets' }), { onOpen: (w, ctl) => w.onSubmit(async () => {
    await putDoc('', 'voice_guide', { ...g, md: val(w, 'gMd'), version: (g.version || 1) + 1, from: 'staff' }, 'approved'); ctl.close(); repaint();
  }) }));
  body.querySelector('#vgRe').onclick = async () => {
    if (S.vgBusy) return;
    S.vgBusy = true; repaint();
    try { await ahStream('/api/voice/staff/guide', {}, () => {}); await load(); S.vgBusy = false; S.vgOpen = true; repaint(); msg('Guide rewritten as a draft. Read it, then Approve.', true); }
    catch (e) { S.vgBusy = false; repaint(); msg(e.message); }
  };
  body.querySelector('#vgSkill')?.addEventListener('click', () => {
    const blob = new Blob([skillFile(d.account.name, g.md, bankAll)], { type: 'text/markdown' });
    const u = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = u; a.download = 'SKILL.md'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 5000);
    msg(`Downloaded SKILL.md. Put it in a folder named ${slugOf(d.account.name)}-copy in your Claude skills. Download it again as the bank grows.`, true);
  });
  body.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await ahJson('/api/voice/staff/bank', { remove: b.dataset.rm }); await load(); repaint(); } catch (e) { msg(e.message); }
  });
  const grab = () => { desk.format = val(body, 'dF'); desk.brief = val(body, 'dB'); desk.n = Math.max(1, Math.min(10, +val(body, 'dN') || 5)); };
  body.querySelector('#dGo').onclick = async () => {
    grab(); desk.busy = true; desk.err = ''; repaint();
    try { const r = await ahStream('/api/voice/staff/desk', { format: desk.format, brief: desk.brief, n: desk.n }, () => {}); desk.lines = r.lines || []; }
    catch (e) { desk.err = e.message; }
    desk.busy = false; repaint();
  };
  body.querySelectorAll('.br-desk [data-k]').forEach(b => b.onclick = async () => {
    const box = b.closest('.br-desk'); const l = desk.lines.find(x => x.id === box.dataset.l);
    const text = box.querySelector('[data-t]').value.trim(); const whyEl = box.querySelector('[data-why]'); const why = whyEl?.value.trim() || '';
    const verdict = b.dataset.k;
    if (verdict === 'no' && !why) { whyEl.placeholder = 'Say why first: that is what it learns from'; whyEl.focus(); return; }
    grab();
    try {
      await ahJson('/api/voice/staff/bank', { item: { id: 's_' + l.id, format: desk.format, text, verdict, why: why || (text !== l.text ? 'Kept after an edit' : ''), by: 'team' } });
      l.text = text; l.done = verdict; await load(); repaint();
    } catch (e) { desk.err = e.message; repaint(); }
  });
}

/* ======================================================================
   PROFILE
   ====================================================================== */
function paintProfile(body) {
  const d = S.d, Qo = Q();
  const p = d.docs['']?.profile || {};
  const voice = d.docs['']?.voice || {};
  const a = d.onboard?.answers || {};
  const r = d.rules;
  const be = Qo.calc('breakeven', a);
  body.innerHTML = `
    <div class="br-g2">
      <div class="card"><div class="br-bar"><h3 class="br-h">At a glance</h3><button class="btn" id="brEditProf">Edit</button></div>
        <dl class="br-kv" style="margin-top:10px">
          <dt>Website</dt><dd>${esc(p.website || a.website || '-')}</dd>
          <dt>Google Drive</dt><dd>${p.drive ? `<a href="${esc(p.drive)}" target="_blank" rel="noopener">Client folder</a>` : '<span class="tiny">not set: the onboarding link cannot show the client their folder</span>'}</dd>
          <dt>Current offer</dt><dd>${esc(p.current_offer || a.offers || '-')}</dd>
          <dt>Free shipping over</dt><dd>${p.free_ship || a.free_ship ? money(+(p.free_ship || a.free_ship)) : '-'}</dd>
          <dt>Average order</dt><dd>${a.aov ? money(+a.aov) : '-'}${be != null ? ` · break-even cost per sale ${money(be)}` : ''}</dd>
          <dt>Product lines</dt><dd>${d.lines.map(l => esc(l.name)).join(', ') || '-'}</dd>
          <dt>Research</dt><dd>${d.personas.filter(x => x.status === 'approved').length} approved personas · ${d.voc.length} customer quotes · ${d.comps.length} competitors</dd>
          <dt>Tests</dt><dd>${d.batches.length} batches · ${d.angles.filter(x => x.status === 'active').length} angles in use</dd>
          <dt>Do</dt><dd>${esc(p.dos || '-')}</dd>
          <dt>Never</dt><dd>${esc(p.donts || a.dos_donts || '-')}</dd>
          <dt>Notes</dt><dd>${esc(p.notes || '-')}</dd>
        </dl></div>
      <div class="card"><div class="br-bar"><h3 class="br-h">Test rules</h3></div>
        <p class="hint" style="margin:6px 0 10px">When a test has spent enough to judge, and the CPA it is judged against. Sales are Triple Whale attribution. Locus suggests Winner, Keep running or Loser in Asana with the soft metrics beside it; the media buyer makes the call.</p>
        <div class="br-form">
          ${inp('rC', 'Target CPA', r.target_cpa || '', { type: 'number', hint: 'the cost per sale you want' })}
          ${inp('rS', 'Judge after spending', r.judge_spend, { type: 'number', hint: 'about 3x the target CPA' })}
          ${inp('rD', 'Or after this many days', r.judge_days, { type: 'number' })}

        </div>
        <div style="margin-top:10px;display:flex;gap:10px;align-items:center"><button class="btn primary" id="brRules">Save rules</button><span class="br-msg" id="brRulesMsg"></span></div></div>
    </div>
    <div class="card"><div class="br-bar"><h3 class="br-h">Brand voice ${voice._status === 'draft' ? '<span class="br-tag draft">Draft from the website</span>' : ''}</h3><div>${voice._status === 'draft' ? `<button class="btn" id="brVoiceOk">Approve</button>` : ''}<button class="btn" id="brVoice">Edit</button></div></div>
      <dl class="br-kv" style="margin-top:10px">
        <dt>In short</dt><dd>${esc(voice.summary || '-')}</dd>
        <dt>Traits</dt><dd>${lines(voice.traits).map(esc).join(' · ') || '-'}</dd>
        <dt>Words they use</dt><dd>${lines(voice.say).map(esc).join(' · ') || '-'}</dd>
        <dt>Words to avoid</dt><dd>${lines(voice.avoid).map(esc).join(' · ') || '-'}</dd>
        <dt>Examples</dt><dd>${lines(voice.examples).map(x => `"${esc(x)}"`).join('\n') || '-'}</dd>
      </dl></div>`;
  body.querySelector('#brEditProf').onclick = () => modal('At a glance', `<div class="br-form">
      ${inp('pW', 'Website', p.website || a.website, { type: 'url', full: true })}
      ${inp('pDr', 'Google Drive client folder', p.drive, { type: 'url', full: true, hint: 'the onboarding link shows it to the client' })}
      ${inp('pO', 'Current offer', p.current_offer, { rows: 2, full: true })}
      ${inp('pF', 'Free shipping over', p.free_ship, { type: 'number' })}
      ${inp('pDo', 'Do', p.dos, { rows: 3, full: true, hint: 'what always works or is always required' })}
      ${inp('pDn', 'Never', p.donts, { rows: 3, full: true, hint: 'the lines we never cross' })}
      ${inp('pN', 'Notes', p.notes, { rows: 3, full: true })}</div>`, { onOpen: (w, ctl) => w.onSubmit(async () => {
    await putDoc('', 'profile', { ...p, website: val(w, 'pW'), drive: val(w, 'pDr'), current_offer: val(w, 'pO'), free_ship: val(w, 'pF'), dos: val(w, 'pDo'), donts: val(w, 'pDn'), notes: val(w, 'pN') });
    ctl.close(); repaint();
  }) });
  body.querySelector('#brRules').onclick = async () => {
    const m = $('#brRulesMsg');
    try {
      await putDoc('', 'rules', { ...(S.d.docs['']?.rules || {}), target_cpa: +val(body, 'rC') || 0, judge_spend: +val(body, 'rS'), judge_days: +val(body, 'rD') });
      repaint(); const m2 = $('#brRulesMsg'); if (m2) { m2.textContent = 'Saved. The roadmap uses these now.'; m2.className = 'br-msg ok'; }
    } catch (e) { m.textContent = e.message; m.className = 'br-msg bad'; }
  };
  body.querySelector('#brVoice').onclick = () => docModal('', 'voice', 'Brand voice', [['summary', 'In short', 2], ['traits', 'Traits (one per line)', 3], ['say', 'Words they use (one per line)', 3], ['avoid', 'Words to avoid (one per line)', 3], ['examples', 'Examples, verbatim (one per line)', 4]], { ...voice, traits: lines(voice.traits), say: lines(voice.say), avoid: lines(voice.avoid), examples: lines(voice.examples) });
  body.querySelector('#brVoiceOk')?.addEventListener('click', async () => { await putDoc('', 'voice', voice, 'approved'); repaint(); });
}

window.BrandTab = { render };
})();
