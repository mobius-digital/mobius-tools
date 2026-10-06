/* Locus - the Season tab (2026-10-05; goals, results, desk and swipe 2026-10-06).
 *
 * The BFCM plan, in Locus instead of the standalone Q4 Playbook. Screens:
 *   All clients   Now (what is due this week, tick it; the board: brand x phase),
 *                 Week by week (every brand), Desk (three check-ins a day against the
 *                 ladder, with live Triple Whale numbers and what was done).
 *   One brand     The offers phase by phase with results once live, goals and the
 *                 ladder, what is still needed, this brand's weeks, the call sheet,
 *                 its own desk. Edit in place.
 *   Client link   ?season=<token>: offers, dates, results and what we did, read only.
 *
 * Dates for every deliverable are DERIVED from the phase dates by the worker
 * (briefs 23 days before live, built 9, loaded 4), so moving a launch moves its
 * work. Nothing here is typed twice: briefs live in Asana, this is the calendar.
 *
 * Own file and closure like amb.js. The host hands in token, URL, client, accounts.
 */
(function () {
'use strict';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { url: '', tok: '', act: 'all', accounts: [], pick: null, data: null, view: 'now', deskDate: null, live: {} };
const LS_VIEW = 'se_view';
const AH = 'https://mobius-account-health.mobius-digital.workers.dev';

async function api(path, opts = {}, base) {
  const res = await fetch((base || S.url).replace(/\/+$/, '') + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + S.tok, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
  return j;
}
const put = (p, b, m = 'PUT') => api(p, { method: m, body: JSON.stringify(b) });

/* ---------- dates (all plain YYYY-MM-DD strings, Central) ---------- */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toD = iso => new Date(iso + 'T00:00:00Z');
const addDays = (iso, n) => { const d = toD(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmtD = iso => iso ? `${MON[toD(iso).getUTCMonth()]} ${toD(iso).getUTCDate()}` : '';
const fmtDow = iso => iso ? `${DOW[toD(iso).getUTCDay()]} ${fmtD(iso)}` : '';
const fmtRange = (a, b) => !a ? 'no date' : (!b || b === a) ? fmtDow(a) : `${fmtD(a)} to ${fmtD(b)}`;
const monday = iso => addDays(iso, -((toD(iso).getUTCDay() + 6) % 7));
const daysBetween = (a, b) => Math.round((toD(b) - toD(a)) / 86400000);
const money = n => n == null ? ' - ' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const moneyK = n => n == null ? ' - ' : Math.abs(n) >= 10000 ? '$' + (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : money(n);
const x2 = n => n == null ? ' - ' : n.toFixed(2) + 'x';
const clock = iso => { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return String(iso); return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(d) + ' CT'; };

const GRP = { nov: ['November', 'var(--se-nov)'], bf: ['Black Friday', 'var(--se-bf)'], dec: ['December', 'var(--se-dec)'], late: ['After Christmas', 'var(--se-late)'], vday: ['Valentine\'s', 'var(--se-vday)'] };
const STATUS = { locked: ['Locked', 'good'], draft: ['Draft', 'warn'], missing: ['Missing', 'bad'], skip: ['Skipped', 'unk'] };
const pill = st => { const s = STATUS[st] || STATUS.missing; return `<span class="pill ${s[1]}">${s[0]}</span>`; };
const COLS = [['nov', 'November'], ['access', 'Thursday'], ['bf', 'Black Friday'], ['dec', 'December']];
const SLOTS = [['8am', '8:00 AM'], ['4pm', '4:00 PM'], ['12am', 'Midnight']];
const DESK_DAYS = ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30'];

/* The scaling ladder, the 2025 sheet's rule in code. A verdict needs real spend behind it:
   $20 at 5am with no sales is not "turn the ads off", it is night. The floor is three hours
   of the starting budget at half pace, never under $100. */
function spendFloor(goals) { return Math.max(100, ((goals && goals.start) || 0) * 3 / 24 * 0.5); }
function ladderOf(goals, mer, spent) {
  if (!goals || goals.be == null || goals.target == null) return { ok: false, text: 'Set the ladder on the brand page', cls: 'unk' };
  if (mer == null) return { ok: true, text: 'No spend yet', cls: 'unk' };
  if (spent != null && spent < spendFloor(goals)) return { ok: false, text: `Too early to grade: ${money(spent)} spent in 3 hours (needs ${money(spendFloor(goals))})`, cls: 'unk' };
  if (goals.s100 != null && mer >= goals.s100) return { ok: true, text: 'Scale by 100%', cls: 'good', key: 'scale100' };
  if (goals.s50 != null && mer >= goals.s50) return { ok: true, text: 'Scale by 50%', cls: 'good', key: 'scale50' };
  if (mer >= goals.target) return { ok: true, text: 'Hold', cls: 'unk', key: 'hold' };
  if (mer >= goals.be) return { ok: true, text: 'Pull back', cls: 'warn', key: 'pull' };
  return { ok: true, text: 'Rework the offer, consider turning ads off', cls: 'bad', key: 'off' };
}
const ladderDone = g => g && g.be != null && g.target != null && g.s50 != null && g.s100 != null;

/* ---------- css ---------- */
function injectCss() {
  if (document.getElementById('seCss')) return;
  const st = document.createElement('style');
  st.id = 'seCss';
  st.textContent = `
  .se{--se-nov:#2F6F9F;--se-bf:#1E7A45;--se-dec:#A8801F;--se-late:#9A3F2E;--se-vday:#A0435E}
  .se .card{margin-bottom:16px}
  .se .se-key{border-color:var(--brand,#1F6F8B);box-shadow:0 0 0 3px rgba(var(--brand-rgb,31,111,139),.14)}
  .se-verdict{font-family:var(--serif,Georgia,serif);font-size:19px;line-height:1.35;margin:0 0 12px}
  .se-seg{display:inline-flex;gap:4px;border:1px solid var(--line,#ddd);border-radius:99px;padding:3px;margin:0 0 14px;background:var(--bg,#fff);flex-wrap:wrap}
  .se-seg button{border:0;background:transparent;border-radius:99px;padding:6px 14px;font:600 13px var(--sans,system-ui);color:var(--muted,#667);cursor:pointer}
  .se-seg button.on{background:var(--ink,#111);color:var(--on-ink,#fff)}
  .se-task{display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:start;padding:9px 0;border-bottom:1px solid var(--line,#e5e5e5)}
  .se-task:last-child{border-bottom:0}
  .se-task input{margin:4px 0 0;width:16px;height:16px;accent-color:var(--good,#1E7A45);cursor:pointer}
  .se-task .n{font-size:14px;line-height:1.4}
  .se-task .n small{display:block;color:var(--muted,#667);font-size:12px;margin-top:1px}
  .se-task.done .n{color:var(--muted,#667);text-decoration:line-through}
  .se-task.done .n small{text-decoration:none}
  .se-task .r{text-align:right;font-size:12px;color:var(--muted,#667);white-space:nowrap;line-height:1.4}
  .se-task .r b{display:block;font-size:12.5px;color:var(--ink,#111)}
  .se-task.over .r b{color:var(--bad,#B03A2E)}
  .se-brand{display:inline-block;font:600 11px var(--sans,system-ui);letter-spacing:.02em;border-radius:6px;padding:1px 7px;margin-right:6px;background:var(--wash,#eef1f4);color:var(--ink,#111);vertical-align:1px}
  .se-brand.link{cursor:pointer}
  .se-when{font:600 11px var(--sans,system-ui);letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#667);margin:14px 0 4px}
  .se-when:first-child{margin-top:0}
  .se-board{width:100%;border-collapse:collapse;font-size:13.5px;table-layout:fixed}
  .se-board col.c-brand{width:150px}.se-board col.c-need{width:128px}
  .se-board th{text-align:left;font:600 11px var(--sans,system-ui);letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#667);padding:6px 10px;border-bottom:1px solid var(--line,#e5e5e5);white-space:nowrap}
  .se-board td{padding:10px;border-bottom:1px solid var(--line,#e5e5e5);vertical-align:top;white-space:normal;overflow-wrap:anywhere}
  .se-board tr:last-child td{border-bottom:0}
  .se-board tr.rowlink{cursor:pointer}
  .se-board tr.rowlink:hover td{background:var(--wash,#f4f6f8)}
  .se-board .bn{font-weight:700;white-space:normal}
  .se-board .cell small{display:block;color:var(--muted,#667);font-size:11.5px;margin-top:3px;line-height:1.3}
  .se-board .cell .o{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;font-size:12.5px;margin-top:3px;line-height:1.35}
  .se-weeks{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px}
  .se-wk{border:1px solid var(--line,#e5e5e5);border-radius:12px;padding:10px 12px;background:var(--surface,#fff);min-width:0}
  .se-wk.now{border-color:var(--good,#1E7A45);box-shadow:0 0 0 3px rgba(30,122,69,.14)}
  .se-wk.past{opacity:.72}
  .se-wk .h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px}
  .se-wk .h b{font-family:var(--serif,Georgia,serif);font-weight:400;font-size:16px}
  .se-wk .h span{font-size:11.5px;color:var(--muted,#667);white-space:nowrap}
  .se-wk .se-task{padding:5px 0}
  .se-phases{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
  .se-ph{border:1px solid var(--line,#e5e5e5);border-top:4px solid var(--c);border-radius:12px;padding:12px 14px;background:var(--surface,#fff);display:flex;flex-direction:column;gap:6px;min-width:0}
  .se-ph.skip{opacity:.55}
  .se-ph .t{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
  .se-ph .t b{font-family:var(--serif,Georgia,serif);font-weight:400;font-size:17px;line-height:1.2}
  .se-ph .d{font-size:12px;color:var(--muted,#667)}
  .se-ph .o{font-size:14.5px;font-weight:600;line-height:1.35}
  .se-ph .o.none{font-weight:400;color:var(--muted,#667);font-style:italic}
  .se-ph .x{font-size:12.5px;color:var(--muted,#667);line-height:1.45;white-space:pre-line}
  .se-ph .res{font-size:12.5px;line-height:1.45;background:var(--wash,#f4f6f8);border-radius:8px;padding:7px 9px}
  .se-ph .res b{font-size:13px}
  .se-ph .f{display:flex;gap:8px;align-items:center;margin-top:auto;padding-top:6px;flex-wrap:wrap}
  .se-ph .f .who{font-size:12px;color:var(--muted,#667);margin-right:auto}
  .se-swipe{grid-column:1/-1;border:1px solid var(--line,#e5e5e5);border-radius:12px;padding:12px;background:var(--surface,#fff)}
  .se-swipe .h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px;font-size:13px}
  .se-ads{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
  .se-ad{display:block;border:1px solid var(--line,#e5e5e5);border-radius:10px;overflow:hidden;background:var(--wash,#f4f6f8);color:inherit;text-decoration:none;min-width:0}
  .se-ad img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;background:#ddd}
  .se-ad .c{padding:6px 8px;font-size:11.5px;line-height:1.3}
  .se-ad .c b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .se-kv{display:grid;grid-template-columns:170px 1fr auto;gap:8px 14px;align-items:start;font-size:14px}
  .se-kv .k{color:var(--muted,#667);font-size:12.5px;padding-top:2px}
  .se-kv .v{white-space:pre-line;line-height:1.45;min-width:0}
  .se-kv .v.none{color:var(--muted,#667);font-style:italic}
  .se-kv .e{justify-self:end}
  .se-kv .sep{grid-column:1/-1;border-top:1px solid var(--line,#e5e5e5);margin:2px 0}
  .se-need{display:flex;flex-direction:column;gap:6px}
  .se-need div{display:grid;grid-template-columns:1fr auto;gap:10px;font-size:14px;padding:7px 10px;border-radius:8px;background:var(--wash,#f4f6f8)}
  .se-need div span:last-child{color:var(--muted,#667);font-size:12px;white-space:nowrap}
  .se-in{width:100%;border:1px solid var(--line,#ddd);border-radius:8px;padding:8px 10px;font:14px var(--sans,system-ui);background:var(--surface,#fff);color:inherit;box-sizing:border-box}
  textarea.se-in{min-height:84px;resize:vertical;line-height:1.45}
  .se-f{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
  .se-f label{font-size:12.5px;font-weight:600}
  .se-f small{color:var(--muted,#667);font-size:11.5px}
  .se-f2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .se-link{background:none;border:0;padding:0;font:inherit;color:var(--brand,#1F6F8B);cursor:pointer;text-decoration:underline}
  .se-mini{font-size:12.5px;padding:5px 10px}
  .se-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:5px;margin-bottom:16px}
  .se-strip .ru{background:var(--ink-panel,#1b2a36);border-radius:12px;padding:14px 18px;color:var(--on-ink,#fff)}
  .se-strip .ru-l{font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;opacity:.75}
  .se-strip .ru-v{font-family:var(--display,var(--sans,system-ui));font-weight:700;font-size:26px;line-height:1.1;margin-top:4px}
  .se-strip .ru-d{font-size:11px;opacity:.8;margin-top:5px;line-height:1.4}
  .se-strip .ru-v.bad{color:#F2A197}.se-strip .ru-v.warn{color:#E9CC7A}.se-strip .ru-v.good{color:#8FD8A8}
  .se-goals{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
  .se-g{border:1px solid var(--line,#e5e5e5);border-radius:10px;padding:8px 10px;min-width:0}
  .se-g .l{font-size:11px;color:var(--muted,#667);letter-spacing:.04em;text-transform:uppercase}
  .se-g .v{font-family:var(--display,var(--sans,system-ui));font-weight:700;font-size:20px;line-height:1.2;margin-top:2px}
  .se-g .v.none{color:var(--muted,#667);font-weight:400;font-size:14px;font-style:italic}
  .se-ladder{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
  .se-ladder span{font-size:12px;border-radius:99px;padding:3px 10px;background:var(--wash,#f4f6f8)}
  .se-days{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}
  .se-days button{border:1px solid var(--line,#ddd);background:var(--surface,#fff);border-radius:99px;padding:5px 12px;font:600 12.5px var(--sans,system-ui);cursor:pointer;color:inherit}
  .se-days button.on{background:var(--ink,#111);color:var(--on-ink,#fff);border-color:var(--ink,#111)}
  .se-desk{border:1px solid var(--line,#e5e5e5);border-radius:12px;padding:12px 14px;background:var(--surface,#fff);margin-bottom:10px}
  .se-desk .h{display:flex;gap:14px;align-items:baseline;flex-wrap:wrap;margin-bottom:8px}
  .se-desk .h b{font-family:var(--serif,Georgia,serif);font-weight:400;font-size:18px;cursor:pointer}
  .se-desk .live{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--muted,#667)}
  .se-desk .live b{color:var(--ink,#111);font-size:15px}
  .se-slot{display:grid;grid-template-columns:90px 1fr auto;gap:10px;align-items:center;padding:7px 0;border-top:1px dashed var(--line,#e5e5e5)}
  .se-slot .s{font-weight:700;font-size:13px}
  .se-slot .by{font-size:11.5px;color:var(--muted,#667);white-space:nowrap}
  .se-slot .did{font-size:13.5px;line-height:1.4}
  .se-slot .did small{display:block;color:var(--muted,#667);font-size:11.5px}
  .se-slot input.se-in{padding:6px 9px;font-size:13px}
  .se-share{max-width:900px;margin:0 auto}
  @media (max-width:820px){.se-kv{grid-template-columns:1fr}.se-kv .e{justify-self:start}.se-f2{grid-template-columns:1fr}.se-task .r{text-align:left;grid-column:2}.se-slot{grid-template-columns:1fr}}
  `;
  document.head.appendChild(st);
}

/* ---------- small modal: fields in, object out (or null) ---------- */
function formModal({ title, hint, fields, cta = 'Save', danger }) {
  return new Promise(resolve => {
    const w = document.createElement('div');
    w.className = 'modal-wrap';
    const f = fields.map(fd => {
      const id = 'sf_' + fd.k;
      let ctl;
      if (fd.type === 'textarea') ctl = `<textarea class="se-in" id="${id}" placeholder="${esc(fd.ph || '')}">${esc(fd.value || '')}</textarea>`;
      else if (fd.type === 'select') ctl = `<select class="se-in" id="${id}">${fd.options.map(([v, l]) => `<option value="${esc(v)}" ${v === fd.value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
      else ctl = `<input class="se-in" id="${id}" type="${fd.type || 'text'}" value="${esc(fd.value ?? '')}" placeholder="${esc(fd.ph || '')}" ${fd.step ? `step="${fd.step}"` : ''}>`;
      return `<div class="se-f"><label for="${id}">${esc(fd.label)}</label>${ctl}${fd.hint ? `<small>${esc(fd.hint)}</small>` : ''}</div>`;
    });
    let body = '', i = 0;
    while (i < f.length) {
      if (fields[i].half && fields[i + 1]?.half) { body += `<div class="se-f2">${f[i]}${f[i + 1]}</div>`; i += 2; }
      else { body += f[i]; i++; }
    }
    w.innerHTML = `<div class="modal" style="max-width:580px"><h3>${esc(title)}</h3>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
      <div style="margin-top:12px">${body}</div>
      <div class="row" style="justify-content:flex-end;gap:8px;margin:6px 0 0">
        ${danger ? `<button class="btn" data-m="del" style="margin-right:auto;color:var(--bad)">${esc(danger)}</button>` : ''}
        <button class="btn" data-m="no">Cancel</button><button class="btn primary" data-m="yes">${esc(cta)}</button></div></div>`;
    document.body.appendChild(w);
    const done = v => { w.remove(); document.removeEventListener('keydown', k); resolve(v); };
    const k = e => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', k);
    w.addEventListener('mousedown', e => { if (e.target === w) done(null); });
    w.querySelector('[data-m="no"]').onclick = () => done(null);
    const del = w.querySelector('[data-m="del"]'); if (del) del.onclick = () => done({ __delete: true });
    w.querySelector('[data-m="yes"]').onclick = () => done(Object.fromEntries(fields.map(fd => [fd.k, w.querySelector('#sf_' + fd.k).value.trim()])));
    const first = w.querySelector('.se-in'); if (first && !matchMedia('(max-width:720px)').matches) setTimeout(() => first.focus(), 30);
  });
}
function toast(msg, bad) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = `position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:${bad ? 'var(--bad,#B03A2E)' : 'var(--ink,#111)'};color:#fff;padding:9px 16px;border-radius:99px;font:600 13px var(--sans,system-ui);z-index:90;box-shadow:0 6px 20px rgba(0,0,0,.2)`;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
}

/* ---------- data ---------- */
async function load(act) { S.data = await api('/api/season?act=' + encodeURIComponent(act)); return S.data; }
const brandOf = id => (S.data?.accounts || []).find(a => a.act_id === id);
const keyPhase = (a, k) => a.phases.find(p => p.key === k);
function brandState(a) {
  const bf = keyPhase(a, 'bf');
  const early = keyPhase(a, 'early');
  if (bf?.status === 'locked' && (!early || early.status !== 'missing')) return ['ok', 'Locked'];
  if (bf?.status === 'locked') return ['warn', 'Weekend locked, November open'];
  if (bf?.status === 'draft') return ['warn', 'Draft'];
  return ['bad', 'No offer'];
}
function counts(a, today) {
  const wk0 = monday(today), wk1 = addDays(wk0, 6);
  const open = a.tasks.filter(t => !t.done && t.due);
  return { over: open.filter(t => t.due < today).length, week: open.filter(t => t.due >= wk0 && t.due <= wk1).length, locked: a.phases.filter(p => p.status === 'locked').length, counted: a.phases.filter(p => p.status !== 'skip' && !p.optional).length };
}

/* ---------- task rows ---------- */
function taskRow(t, a, today, showBrand) {
  const over = !t.done && t.due && t.due < today;
  return `<div class="se-task ${t.done ? 'done' : ''} ${over ? 'over' : ''}" data-act="${esc(a.act_id)}" data-id="${esc(t.id)}">
    <input type="checkbox" ${t.done ? 'checked' : ''} ${t.auto && t.kind !== 'live' ? 'disabled title="Ticks itself"' : ''} aria-label="Done">
    <div class="n">${showBrand ? `<span class="se-brand link" data-pick="${esc(a.act_id)}">${esc(a.name)}</span>` : ''}${esc(t.name)}${t.custom ? ` <button class="se-link se-mini" data-edit-task="${esc(t.id)}">edit</button>` : ''}<small>${esc(t.phase || '')}${t.done && t.done_by ? ` · done by ${esc(t.done_by)}` : ''}${t.note ? ` · ${esc(t.note)}` : ''}</small></div>
    <div class="r"><b>${over ? 'Overdue · ' : ''}${esc(t.due ? fmtDow(t.due) : 'no date')}</b>${esc(t.owner || '')}</div>
  </div>`;
}
function wireTasks(root) {
  root.querySelectorAll('.se-task input[type=checkbox]').forEach(cb => cb.onchange = async () => {
    const row = cb.closest('.se-task');
    try {
      const r = await put('/api/season/task', { act: row.dataset.act, id: row.dataset.id, done: cb.checked });
      const a = brandOf(row.dataset.act); const t = a?.tasks.find(x => x.id === row.dataset.id);
      if (t) { t.done = r.done; t.done_by = r.done_by; }
      row.classList.toggle('done', cb.checked);
    } catch (e) { cb.checked = !cb.checked; toast(e.message, true); }
  });
  root.querySelectorAll('[data-pick]').forEach(el => el.onclick = () => S.pick && S.pick(el.dataset.pick));
  root.querySelectorAll('[data-edit-task]').forEach(b => b.onclick = () => editTask(b.closest('.se-task').dataset.act, b.dataset.editTask));
}
async function editTask(act, id) {
  const a = brandOf(act); const t = id ? a.tasks.find(x => x.id === id) : null;
  const r = await formModal({
    title: t ? 'Edit task' : 'Add a task', hint: 'A one-off for this brand. Briefs, built, loaded and live dates come from the phase dates by themselves.',
    fields: [
      { k: 'name', label: 'What', value: t?.name || '', ph: 'e.g. Legal read of the giveaway rules' },
      { k: 'due', label: 'Due', type: 'date', value: t?.due || '', half: 1 },
      { k: 'owner', label: 'Owner', value: t?.owner || 'Cole', half: 1, hint: 'A name. Write "Client" for something the brand owes.' },
      { k: 'phase_key', label: 'Belongs to', type: 'select', value: t?.phase_key || '', options: [['', 'The season in general'], ...a.phases.filter(p => p.status !== 'skip').map(p => [p.key, p.name])] },
    ], cta: t ? 'Save' : 'Add', danger: t ? 'Delete' : null,
  });
  if (!r) return;
  try {
    if (r.__delete) await put('/api/season/task', { act, id }, 'DELETE');
    else if (!r.name) return toast('Give it a name', true);
    else await put('/api/season/task', { act, id: id || ('c:' + crypto.randomUUID().slice(0, 8)), name: r.name, due: r.due || null, owner: r.owner || 'Cole', phase_key: r.phase_key || null, custom: 1, kind: 'custom' });
    await refresh();
  } catch (e) { toast(e.message, true); }
}

/* ---------- weeks ---------- */
function weeksOf(accounts, today, from = '2026-10-05', to = '2027-02-08') {
  const rows = [];
  for (const a of accounts) for (const t of a.tasks) if (t.due) rows.push({ t, a });
  const out = [];
  for (let w = monday(from); w <= to; w = addDays(w, 7)) {
    const end = addDays(w, 6);
    const items = rows.filter(r => r.t.due >= w && r.t.due <= end).sort((x, y) => x.t.due.localeCompare(y.t.due) || x.a.name.localeCompare(y.a.name));
    const lives = [];
    for (const a of accounts) for (const p of a.phases) if (p.start && p.status !== 'skip' && p.start >= w && p.start <= end) lives.push(`${a.name}: ${p.name}`);
    out.push({ start: w, end, items, lives, now: today >= w && today <= end, past: end < today });
  }
  return out;
}
function weekBox(wk, today, showBrand) {
  const open = wk.items.filter(r => !r.t.done).length;
  const label = wk.now ? 'This week' : `Week of ${fmtD(wk.start)}`;
  const big = wk.start <= '2026-11-27' && wk.end >= '2026-11-27';
  return `<div class="se-wk ${wk.now ? 'now' : ''} ${wk.past ? 'past' : ''}"><div class="h"><b>${big ? 'BLACK FRIDAY · ' : ''}${label}</b><span>${wk.items.length ? `${open} open of ${wk.items.length}` : 'nothing due'}</span></div>
    ${wk.lives.length ? `<div class="tiny" style="margin-bottom:6px">Goes live: ${esc(wk.lives.join(' · '))}</div>` : ''}
    ${wk.items.map(r => taskRow(r.t, r.a, today, showBrand)).join('') || '<div class="tiny">Nothing scheduled.</div>'}
  </div>`;
}

/* ---------- the desk: three check-ins a day against the ladder ---------- */
function deskDates(brands, today) {
  const set = new Set([today, ...DESK_DAYS]);
  brands.forEach(a => (a.checkins || []).forEach(c => set.add(c.date)));
  return [...set].sort();
}
function deskCard(a, date, today) {
  const live = S.live[a.act_id];
  const isToday = date === today;
  const lad = live && !live.error ? ladderOf(a.goals, live.last3?.mer, live.last3?.spend) : null;
  const liveErr = e => /400|unknown|no shop|tw_shop/i.test(e) ? 'No Triple Whale store connected for this brand yet (Settings > Brands).' : e;
  const liveHtml = !isToday ? `<span>Live numbers show on today only. The log below is what was done.</span>`
    : !live ? `<span>Loading live numbers…</span>`
    : live.error ? `<span style="color:var(--muted)">${esc(liveErr(live.error))}</span>`
    : `<span>Last 3 hours <b>${x2(live.last3?.mer)}</b> on ${money(live.last3?.spend)}</span><span>Today so far <b>${x2(live.today?.mer)}</b> · ${money(live.today?.sales)} revenue · ${money(live.today?.spend)} spend</span><span>as of ${esc(clock(live.as_of))}</span>`;
  const verdict = isToday && lad ? `<span class="pill ${lad.cls}" title="Breakeven ${a.goals.be ?? '?'} · target ${a.goals.target ?? '?'} · 50% at ${a.goals.s50 ?? '?'} · 100% at ${a.goals.s100 ?? '?'}">${esc(lad.text)}</span>` : (isToday && !ladderDone(a.goals) ? `<span class="pill unk">Set the ladder on the brand page</span>` : '');
  const slots = SLOTS.map(([key, label]) => {
    const c = (a.checkins || []).find(x => x.date === date && x.slot === key);
    const saved = c && c.action;
    return `<div class="se-slot" data-act="${esc(a.act_id)}" data-slot="${key}">
      <div class="s">${label}</div>
      ${saved ? `<div class="did">${esc(c.action)}<small>${c.roas != null ? `3h ${x2(c.roas)} · ` : ''}${c.verdict ? `ladder said ${esc(c.verdict)} · ` : ''}${esc(c.by || '')} ${esc(clock(c.at))}</small></div><div><button class="btn se-mini" data-redo="1">Change</button></div>`
        : `<input class="se-in" placeholder="What you did, one line (e.g. Scaled 100%, new budget $8k)"><div><button class="btn primary se-mini" data-save="1">Save</button></div>`}
    </div>`;
  }).join('');
  return `<div class="se-desk"><div class="h"><b data-pick="${esc(a.act_id)}">${esc(a.name)}</b>${verdict}<div class="live">${liveHtml}</div></div>${slots}</div>`;
}
function wireDesk(root, date, today) {
  root.querySelectorAll('.se-slot [data-save]').forEach(b => b.onclick = async () => {
    const row = b.closest('.se-slot'); const inp = row.querySelector('input'); const act = row.dataset.act; const slot = row.dataset.slot;
    const text = inp.value.trim(); if (!text) return toast('Write what you did first', true);
    const a = brandOf(act); const live = S.live[act]; const lad = live && !live.error ? ladderOf(a.goals, live.last3?.mer, live.last3?.spend) : null;
    try {
      const r = await put('/api/season/checkin', { act, date, slot, action: text, roas: live?.last3?.mer ?? null, mer_day: live?.today?.mer ?? null, revenue: live?.today?.sales ?? null, spend: live?.today?.spend ?? null, verdict: lad?.ok ? lad.text : null });
      a.checkins = (a.checkins || []).filter(c => !(c.date === date && c.slot === slot)).concat([{ date, slot, action: text, roas: live?.last3?.mer ?? null, verdict: lad?.ok ? lad.text : null, by: r.by, at: r.at }]);
      const host = root.querySelector(`.se-desk [data-pick="${act}"]`)?.closest('.se-desk');
      if (host) { host.outerHTML = deskCard(a, date, today); wireDesk(root, date, today); }
    } catch (e) { toast(e.message, true); }
  });
  root.querySelectorAll('.se-slot input.se-in').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') i.closest('.se-slot').querySelector('[data-save]')?.click(); });
  root.querySelectorAll('.se-slot [data-redo]').forEach(b => b.onclick = () => {
    const row = b.closest('.se-slot'); const a = brandOf(row.dataset.act); const c = (a.checkins || []).find(x => x.date === date && x.slot === row.dataset.slot);
    row.innerHTML = `<div class="s">${esc(SLOTS.find(s => s[0] === row.dataset.slot)[1])}</div><input class="se-in" value="${esc(c?.action || '')}"><div><button class="btn primary se-mini" data-save="1">Save</button></div>`;
    wireDesk(root, date, today);
  });
  root.querySelectorAll('.se-desk [data-pick]').forEach(el => el.onclick = () => S.pick && S.pick(el.dataset.pick));
}
async function loadLive(brands, after) {
  await Promise.all(brands.map(async a => {
    try { S.live[a.act_id] = await api('/api/season/live?act=' + encodeURIComponent(a.act_id)); }
    catch (e) { S.live[a.act_id] = { error: e.message || 'no live numbers' }; }
  }));
  after();
}
function deskSection(brands, today, title) {
  const dates = deskDates(brands, today);
  if (!S.deskDate || !dates.includes(S.deskDate)) S.deskDate = today;
  const date = S.deskDate;
  return `<div class="card se-desk-wrap"><h3 style="margin:0 0 4px">${esc(title)}</h3>
    <p class="hint" style="margin:0 0 10px">Three check-ins a day, 8am, 4pm and midnight Central. The ladder grades the last three hours of blended MER (Triple Whale) against this brand's lines. Whoever acts writes one line. The client link shows the lines, never the numbers.</p>
    <div class="se-days">${dates.map(d => `<button data-day="${d}" class="${d === date ? 'on' : ''}">${d === today ? 'Today · ' : ''}${esc(fmtDow(d))}</button>`).join('')}</div>
    <div id="seDesk">${brands.map(a => deskCard(a, date, today)).join('')}</div></div>`;
}
function wireDeskSection(root, brands, today, repaint) {
  root.querySelectorAll('.se-days button').forEach(b => b.onclick = () => { S.deskDate = b.dataset.day; repaint(); });
  const host = root.querySelector('#seDesk');
  if (!host) return;
  wireDesk(host, S.deskDate, today);
  if (S.deskDate === today) {
    const missing = brands.filter(a => !S.live[a.act_id]);
    if (missing.length) loadLive(missing, () => { const h = root.querySelector('#seDesk'); if (!h) return; h.innerHTML = brands.map(a => deskCard(a, S.deskDate, today)).join(''); wireDesk(h, S.deskDate, today); });
  }
}

/* ---------- swipe file (Atria boards) ---------- */
async function showSwipe(host, board, title) {
  host.innerHTML = `<div class="se-swipe"><div class="h"><b>${esc(title)}</b><span class="tiny">Loading from Atria…</span></div></div>`;
  try {
    const r = await api('/api/atria/board?board_id=' + encodeURIComponent(board.id), {}, AH);
    if (r.reason === 'not_connected') { host.innerHTML = `<div class="se-swipe"><div class="h"><b>${esc(title)}</b></div><p class="hint" style="margin:0">Atria is not connected. Studio > Connections > Connect Atria, then this fills itself.</p></div>`; return; }
    const ads = r.ads || [];
    host.innerHTML = `<div class="se-swipe"><div class="h"><b>${esc(title)}</b><span class="tiny">${ads.length} saved in Atria · <b>${esc(board.name)}</b> · save more there and they show here</span><button class="se-link se-mini" data-close="1">close</button></div>
      ${ads.length ? `<div class="se-ads">${ads.map(a => `<a class="se-ad" href="${esc(a.url)}" target="_blank" rel="noopener">${a.img ? `<img src="${esc(a.img)}" alt="" referrerpolicy="no-referrer">` : '<div style="aspect-ratio:4/5"></div>'}<div class="c"><b>${esc(a.advertiser || '')}</b>${esc((a.title || a.body || '').slice(0, 70))}</div></a>`).join('')}</div>` : '<p class="hint" style="margin:0">Nothing saved to this board yet. In Atria, save an ad into it and it shows here.</p>'}</div>`;
    host.querySelector('[data-close]').onclick = () => { host.innerHTML = ''; };
  } catch (e) { host.innerHTML = `<div class="se-swipe"><div class="h"><b>${esc(title)}</b></div><p class="hint" style="margin:0;color:var(--bad)">${esc(e.message)}</p></div>`; }
}

/* ---------- ALL CLIENTS ---------- */
function crumb() { return typeof window.crumbFor === 'function' ? `<div class="ph-crumb">${window.crumbFor('season')}</div>` : ''; }
function head(title, sub) { return `<div>${crumb()}<h2>${title}</h2><p class="sub">${sub}</p></div>`; }

async function renderAll() {
  const main = $('#main');
  main.innerHTML = `<div class="se"><div class="card"><span class="hint">Loading…</span></div></div>`;
  await load('all');
  S.view = localStorage.getItem(LS_VIEW) || 'now';
  paintAll();
}
function paintAll() {
  const main = $('#main');
  const d = S.data, today = d.today;
  const brands = d.accounts.filter(a => a.in_season);
  const off = d.accounts.filter(a => !a.in_season);
  const days = daysBetween(today, d.bf);
  const wk0 = monday(today), wk1 = addDays(wk0, 6);
  const lockedN = brands.filter(a => brandState(a)[0] === 'ok').length;
  const noOffer = brands.filter(a => brandState(a)[0] === 'bad');
  const noGoal = brands.filter(a => a.goals.bf == null && a.goals.total == null);
  const openAll = brands.flatMap(a => a.tasks.filter(t => !t.done && t.due).map(t => ({ t, a })));
  const overdue = openAll.filter(r => r.t.due < today);
  const thisWeek = openAll.filter(r => r.t.due >= wk0 && r.t.due <= wk1);
  const verdict = noOffer.length
    ? `${noOffer.length} of ${brands.length} brands ${noOffer.length === 1 ? 'has' : 'have'} no Black Friday offer yet (${noOffer.map(a => a.name).join(', ')}). ${thisWeek.length} thing${thisWeek.length === 1 ? '' : 's'} due this week${overdue.length ? `, ${overdue.length} overdue` : ''}.`
    : `Every brand has a Black Friday offer. ${thisWeek.length} thing${thisWeek.length === 1 ? '' : 's'} due this week${overdue.length ? `, ${overdue.length} overdue` : ''}.`;

  const strip = `<div class="se-strip">
    <div class="ru"><div class="ru-l">Black Friday</div><div class="ru-v">${days} days</div><div class="ru-d">Fri Nov 27. Cyber Monday Nov 30.</div></div>
    <div class="ru"><div class="ru-l">Offers locked</div><div class="ru-v ${lockedN === brands.length ? 'good' : lockedN ? 'warn' : 'bad'}">${lockedN} of ${brands.length}</div><div class="ru-d">Black Friday weekend locked with the client.</div></div>
    <div class="ru"><div class="ru-l">Goals set</div><div class="ru-v ${noGoal.length ? 'warn' : 'good'}">${brands.length - noGoal.length} of ${brands.length}</div><div class="ru-d">${noGoal.length ? 'Missing: ' + esc(noGoal.map(a => a.name).join(', ')) : 'Every brand has a revenue goal.'}</div></div>
    <div class="ru"><div class="ru-l">Due this week</div><div class="ru-v">${thisWeek.length}</div><div class="ru-d">Mon ${fmtD(wk0)} to Sun ${fmtD(wk1)}, every brand.</div></div>
    <div class="ru"><div class="ru-l">Overdue</div><div class="ru-v ${overdue.length ? 'bad' : 'good'}">${overdue.length}</div><div class="ru-d">${overdue.length ? 'Past due and not ticked.' : 'Nothing slipping.'}</div></div>
  </div>`;

  const seg = `<div class="se-seg" role="tablist"><button data-v="now" class="${S.view === 'now' ? 'on' : ''}">Now</button><button data-v="cal" class="${S.view === 'cal' ? 'on' : ''}">Week by week</button><button data-v="desk" class="${S.view === 'desk' ? 'on' : ''}">Desk</button></div>`;

  let body = '';
  if (S.view === 'now') {
    const group = (rows) => { const by = {}; rows.forEach(r => (by[r.a.act_id] = by[r.a.act_id] || { a: r.a, rows: [] }).rows.push(r)); return Object.values(by).sort((x, y) => x.a.name.localeCompare(y.a.name)); };
    const list = (rows) => group(rows).map(g => `<div class="se-when">${esc(g.a.name)}</div>${g.rows.map(r => taskRow(r.t, r.a, today, false)).join('')}`).join('');
    body += `<div class="card se-key"><h3 style="margin:0 0 4px">This week</h3><p class="hint" style="margin:0 0 8px">Tick it when it is done. Overdue first. Click a brand name to open its season.</p>
      ${overdue.length ? `<div class="se-when" style="color:var(--bad)">Overdue</div>${overdue.sort((x, y) => x.t.due.localeCompare(y.t.due)).map(r => taskRow(r.t, r.a, today, true)).join('')}` : ''}
      ${thisWeek.length ? list(thisWeek.sort((x, y) => x.t.due.localeCompare(y.t.due))) : '<p class="hint" style="margin:8px 0 0">Nothing due this week.</p>'}
    </div>`;
    body += `<div class="card"><h3 style="margin:0 0 4px">The board</h3><p class="hint" style="margin:0 0 10px">One row per brand, one column per part of the season. Click a row to open it and see the full offer.</p>
      <div class="tbl-wrap" style="overflow-x:auto"><table class="se-board"><colgroup><col class="c-brand">${COLS.map(() => '<col>').join('')}<col class="c-need"></colgroup><thead><tr><th>Brand</th>${COLS.map(c => `<th>${c[1]}</th>`).join('')}<th>Needed</th></tr></thead><tbody>
      ${brands.map(a => {
        const st = brandState(a); const c = counts(a, today);
        const cell = (p) => p ? `<div class="cell">${pill(p.status)}${p.status !== 'skip' ? `<span class="o">${esc(p.offer || '')}</span><small>${esc(fmtRange(p.start, p.end))}</small>` : ''}</div>` : '<span class="tiny">none</span>';
        const grpCell = (g) => { const ps = a.phases.filter(p => p.grp === g && p.key !== 'access' && !(g === 'bf' && p.key === 'planb')); if (!ps.length) return '<span class="tiny">none</span>'; const main = ps.find(p => p.key === 'bf') || ps[0]; return `<div class="cell">${pill(main.status)}<span class="o">${esc(main.offer || '')}</span><small>${esc(fmtRange(main.start, main.end))}${ps.length > 1 ? ` · ${ps.length - 1} more` : ''}</small></div>`; };
        return `<tr class="rowlink" data-pick="${esc(a.act_id)}"><td class="bn">${esc(a.name)}<br><span class="pill ${st[0] === 'ok' ? 'good' : st[0] === 'warn' ? 'warn' : 'bad'}">${st[1]}</span></td>
          <td>${grpCell('nov')}</td><td>${cell(keyPhase(a, 'access'))}</td><td>${cell(keyPhase(a, 'bf'))}</td><td>${grpCell('dec')}</td>
          <td><small style="display:block;color:var(--muted);font-size:12px;line-height:1.4">${c.over ? `<b style="color:var(--bad)">${c.over} overdue</b><br>` : ''}${a.goals.bf == null && a.goals.total == null ? `<b style="color:var(--warn)">no goal</b><br>` : ''}${!ladderDone(a.goals) ? `no ladder<br>` : ''}${c.week} due this week<br>${esc(a.answers.strategist || 'Ahsan')} briefs</small></td></tr>`;
      }).join('')}</tbody></table></div>
      ${off.length ? `<p class="tiny" style="margin:10px 0 0">Not running a season: ${esc(off.map(a => a.name).join(', '))}. Open the brand and switch it on if that changes.</p>` : ''}
    </div>`;
  } else if (S.view === 'cal') {
    const wks = weeksOf(brands, today);
    body += `<div class="card"><h3 style="margin:0 0 4px">Week by week, every brand</h3><p class="hint" style="margin:0 0 12px">Each box is a week. The green one is now. Dates come from each brand's phase dates: briefs 23 days before a launch, built 9 days before, loaded 4 days before.</p>
      <div class="se-weeks">${wks.map(w => weekBox(w, today, true)).join('')}</div></div>`;
  } else {
    body += deskSection(brands, today, 'The desk: every brand, three times a day');
  }

  main.innerHTML = `<div class="se">${head('Season', 'Black Friday to Valentine\'s, every brand: what the offer is, when it runs, what is due this week, and over the weekend what the ladder says. Pick a client at the top to edit a brand.')}
    ${strip}<p class="se-verdict">${esc(verdict)}</p>${seg}${body}</div>`;
  main.querySelectorAll('.se-seg button').forEach(b => b.onclick = () => { S.view = b.dataset.v; localStorage.setItem(LS_VIEW, S.view); paintAll(); });
  main.querySelectorAll('tr.rowlink').forEach(tr => tr.onclick = e => { if (e.target.closest('a,button,input')) return; S.pick && S.pick(tr.dataset.pick); });
  wireTasks(main);
  if (S.view === 'desk') wireDeskSection(main, brands, today, paintAll);
  if (typeof window.pageActions === 'function') window.pageActions('');
}

/* ---------- ONE BRAND ---------- */
async function refresh() { await load(S.act); paintBrand(); }
async function renderBrand() {
  const main = $('#main');
  main.innerHTML = `<div class="se"><div class="card"><span class="hint">Loading…</span></div></div>`;
  await load(S.act);
  paintBrand();
}
const SHEET = [
  ['goal', 'Revenue goal, in words', 'The number and where it came from. The figures themselves go in Goals above.'],
  ['last_year', 'Last year by window', 'Early BF, the weekend, December. Year one: say so.'],
  ['winning_offer', 'Offers that have worked', 'The winner gets rebranded per holiday, not replaced.'],
  ['floor', 'Discount floor', 'The deepest discount that still clears margin.'],
  ['inventory', 'Inventory and PO', 'Units on hand for hero SKUs vs the goal. Has the Q4 PO been placed?'],
  ['cutoffs', 'Shipping cutoffs', 'Standard and expedited. The most important date in December.'],
  ['returns', 'Holiday return window', 'Gift buyers want returns open into January.'],
  ['gift_cards', 'Gift cards', 'Set up and tested? The only product that sells Dec 20 to 24.'],
  ['approver', 'Who approves on the client side', 'Name the person and the turnaround.'],
];
const SETUP = [
  ['shape', 'Season shape', 'select', [['standard', 'Standard: Early BF sale, then a bigger weekend'], ['blacknov', 'Black November: a new offer every week'], ['access', 'Early Access: build a list, Thursday pays']]],
  ['strategist', 'Who briefs the ads', 'text'],
  ['buyer', 'Who runs the ads', 'text'],
  ['email_owner', 'Who runs email and SMS', 'text'],
];
const GOAL_FIELDS = [
  ['early', 'November revenue goal', 'money'], ['bf', 'Black Friday weekend goal', 'money'], ['dec', 'December goal', 'money'], ['total', 'Nov + Dec total', 'money'],
  ['be', 'Breakeven MER', 'x'], ['target', 'Target MER', 'x'], ['s50', 'Scale 50% at', 'x'], ['s100', 'Scale 100% at', 'x'], ['start', 'Starting daily budget', 'money'], ['cap', 'Meta daily limit', 'money'],
];
function paintBrand() {
  const main = $('#main');
  const d = S.data; const a = d.accounts[0];
  if (!a) { main.innerHTML = `<div class="se">${head('Season', '')}<div class="card">This client is not in Locus.</div></div>`; return; }
  const today = d.today; const days = daysBetween(today, d.bf);
  const st = brandState(a); const c = counts(a, today);
  const open = a.tasks.filter(t => !t.done && t.due);
  const overdue = open.filter(t => t.due < today);
  const g = a.goals || {};

  const need = [];
  for (const p of a.phases) if (p.status === 'missing' && !p.optional) need.push([`${p.name}: no offer written`, fmtRange(p.start, p.end)]);
  const drafts = a.phases.filter(p => p.status === 'draft');
  if (drafts.length === 1) need.push([`${drafts[0].name}: lock it with ${a.answers.approver || 'the client'}`, fmtRange(drafts[0].start, drafts[0].end)]);
  else if (drafts.length > 1) need.push([`${drafts.length} phases are proposals, not agreed: lock them with ${a.answers.approver || 'the client'}`, drafts.map(p => p.name).join(', ')]);
  if (g.bf == null && g.total == null) need.push(['A revenue goal for the weekend or the season', 'Goals card']);
  if (!ladderDone(g)) need.push(['The ladder: breakeven, target, scale 50 and 100 lines', 'by Nov 13']);
  if (!a.answers.cutoffs) need.push(['Shipping cutoffs from the client', 'sets December']);
  if (!a.answers.gift_cards) need.push(['Gift cards: set up and tested?', 'by Dec 1']);

  const goalTile = g.bf != null ? [moneyK(g.bf), 'Black Friday weekend goal'] : g.total != null ? [moneyK(g.total), 'Season goal'] : ['none', 'No revenue goal yet'];
  const strip = `<div class="se-strip">
    <div class="ru"><div class="ru-l">Black Friday</div><div class="ru-v">${days} days</div><div class="ru-d">${esc(a.shape === 'access' ? 'Early Access shape' : a.shape === 'blacknov' ? 'Black November shape' : 'Standard shape')}</div></div>
    <div class="ru"><div class="ru-l">Offer</div><div class="ru-v ${st[0] === 'ok' ? 'good' : st[0] === 'warn' ? 'warn' : 'bad'}">${esc(st[1])}</div><div class="ru-d">${c.locked} of ${c.counted} phases locked.</div></div>
    <div class="ru"><div class="ru-l">Goal</div><div class="ru-v ${goalTile[0] === 'none' ? 'warn' : ''}">${esc(goalTile[0])}</div><div class="ru-d">${esc(goalTile[1])}${ladderDone(g) ? ` · ladder set` : ' · ladder not set'}</div></div>
    <div class="ru"><div class="ru-l">Due this week</div><div class="ru-v">${c.week}</div><div class="ru-d">${esc(a.answers.strategist || 'Ahsan')} briefs, ${esc(a.answers.buyer || 'Ahsan')} loads.</div></div>
    <div class="ru"><div class="ru-l">Overdue</div><div class="ru-v ${overdue.length ? 'bad' : 'good'}">${overdue.length}</div><div class="ru-d">${overdue.length ? esc(overdue[0].name) : 'Nothing slipping.'}</div></div>
  </div>`;

  const resLine = p => {
    if (!p.results) return '';
    const r = p.results; const goal = r.goal;
    const vs = goal ? ` · ${Math.round(r.sales / goal * 100)}% of the ${moneyK(goal)} goal` : '';
    return `<div class="res"><b>${money(r.sales)}</b> revenue so far on ${money(r.spend)} spend${r.mer != null ? ` · ${x2(r.mer)}` : ''}${r.orders ? ` · ${Math.round(r.orders)} orders` : ''}${vs}<br><span class="tiny">${esc(fmtD(r.from))} to ${esc(fmtD(r.to))}, same revenue line as P&L.</span></div>`;
  };
  const phaseCard = p => `<div class="se-ph ${p.status === 'skip' ? 'skip' : ''}" style="--c:${GRP[p.grp]?.[1] || 'var(--se-bf)'}">
    <div class="t"><b>${esc(p.name)}</b>${pill(p.status)}</div>
    <div class="d">${esc(fmtRange(p.start, p.end))}${p.who ? ` · ${esc(p.who)}` : ''}</div>
    ${p.status === 'skip' ? '' : `<div class="o ${p.offer ? '' : 'none'}">${esc(p.offer || (p.hint || 'No offer written yet.'))}</div>${p.detail ? `<div class="x">${esc(p.detail)}</div>` : ''}${resLine(p)}`}
    <div class="f"><span class="who"></span>${p.swipe && p.status !== 'skip' ? `<button class="btn se-mini" data-swipe="${esc(p.key)}">Swipe file</button>` : ''}<button class="btn se-mini" data-edit-phase="${esc(p.key)}">Edit</button></div>
  </div>`;

  const goalsHtml = `<div class="se-goals">${GOAL_FIELDS.slice(0, 4).map(([k, l, t]) => `<div class="se-g"><div class="l">${esc(l)}</div><div class="v ${g[k] == null ? 'none' : ''}">${g[k] == null ? 'not set' : moneyK(g[k])}</div></div>`).join('')}</div>
    <div class="se-ladder">${[['be', 'Breakeven'], ['target', 'Target'], ['s50', 'Scale 50% at'], ['s100', 'Scale 100% at']].map(([k, l]) => `<span>${l}: <b>${g[k] == null ? 'not set' : x2(g[k])}</b></span>`).join('')}<span>Start: <b>${g.start == null ? 'not set' : money(g.start)}/day</b></span><span>Meta cap: <b>${g.cap == null ? 'not set' : money(g.cap)}/day</b></span>${g.start && g.cap ? `<span>Headroom <b>${(g.cap / g.start).toFixed(1)}x</b>${g.cap / g.start < 4 ? ' (tight: ask Meta for a higher limit)' : ''}</span>` : ''}</div>
    ${g.note ? `<p class="tiny" style="margin:8px 0 0">${esc(g.note)}</p>` : ''}`;

  const sheetRows = SHEET.map(([k, label, hint]) => `<div class="k">${esc(label)}</div><div class="v ${a.answers[k] ? '' : 'none'}">${esc(a.answers[k] || hint)}</div><div class="e"><button class="btn se-mini" data-edit-answer="${k}">Edit</button></div>`).join('');
  const setupRows = SETUP.map(([k, label, type, opts]) => `<div class="k">${esc(label)}</div><div class="v ${a.answers[k] ? '' : 'none'}">${esc(type === 'select' ? (opts.find(o => o[0] === a.shape)?.[1] || '') : (a.answers[k] || (k === 'email_owner' ? 'Nick' : 'Ahsan')))}</div><div class="e"><button class="btn se-mini" data-edit-answer="${k}">Edit</button></div>`).join('');

  const wks = weeksOf([a], today).filter(w => w.items.length || w.lives.length);
  const upcoming = wks.filter(w => !w.past), past = wks.filter(w => w.past);

  main.innerHTML = `<div class="se">${head(`${esc(a.name)} season`, 'The offer for every part of the season, the goal and the ladder, what still needs an answer, and what is due week by week. Edit anything in place; the client link shows offers, dates and results only.')}
    ${strip}
    ${need.length ? `<div class="card se-key"><h3 style="margin:0 0 4px">Still needed</h3><p class="hint" style="margin:0 0 8px">Nothing below can be briefed or graded until it is answered.</p><div class="se-need">${need.map(n => `<div><span>${esc(n[0])}</span><span>${esc(n[1])}</span></div>`).join('')}</div></div>` : `<div class="card" style="border-left:4px solid var(--good)"><b>Nothing missing.</b> Every phase has an offer, the goal and ladder are set, and the dates that drive December are in.</div>`}
    <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="margin:0">The offers, phase by phase</h3><div style="display:flex;gap:8px">${a.swipe_brand ? `<button class="btn se-mini" id="seBrandSwipe">This brand's swipe file</button>` : ''}<button class="btn se-mini" id="seAddPhase">+ Add a phase</button></div></div>
      <p class="hint" style="margin:0 0 12px">When it runs, who gets it, the deal. Locked means the client said yes. Skip hides a phase this brand is not running. Once a phase is live its revenue shows on the card.</p>
      <div class="se-phases" id="sePhases">${a.phases.map(phaseCard).join('')}</div><div id="seSwipeHost" style="margin-top:10px"></div></div>
    <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="margin:0">Goals and the ladder</h3><button class="btn se-mini" id="seGoals">Edit</button></div>
      <p class="hint" style="margin:0 0 12px">The revenue goals the phases are graded against, and the MER lines the desk uses over the weekend: at or above the 100% line we double, above the 50% line we add half, at target we hold, under target we pull back, under breakeven we rework. Target MER elsewhere in Locus is Settings &gt; Goals; this ladder is for the season only.</p>
      ${goalsHtml}</div>
    ${deskSection([a], today, 'The desk')}
    <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="margin:0">What is due</h3><button class="btn se-mini" id="seAddTask">+ Add a task</button></div>
      <p class="hint" style="margin:0 0 12px">Briefs, built, loaded and live dates follow each phase's start date. Tick when done; the tick is shared with everyone.</p>
      <div class="se-weeks">${upcoming.map(w => weekBox(w, today, false)).join('') || '<div class="tiny">No dated phases yet. Set a start date on a phase to see its work.</div>'}</div>
      ${past.length ? `<details style="margin-top:12px"><summary class="tiny" style="cursor:pointer">Past weeks (${past.length})</summary><div class="se-weeks" style="margin-top:10px">${past.map(w => weekBox(w, today, false)).join('')}</div></details>` : ''}</div>
    <div class="card"><h3 style="margin:0 0 4px">Call sheet</h3><p class="hint" style="margin:0 0 12px">The answers that set the dates and the offer. Fill them on the call; leave the rest to the call.</p>
      <div class="se-kv">${sheetRows}<div class="sep"></div>${setupRows}</div></div>
    <p class="tiny"><button class="se-link" id="seToggleSeason">${a.in_season ? 'This brand is not running a season this year' : 'Put this brand back on the season board'}</button></p>
  </div>`;

  if (typeof window.pageActions === 'function') window.pageActions(`<button class="btn" id="seCopy">Copy offer sheet</button><button class="btn primary" id="seShare">Client link</button>`);
  const share = document.getElementById('seShare'); if (share) share.onclick = async () => {
    try { const r = await put('/api/season-share', { act: a.act_id }, 'POST'); await navigator.clipboard.writeText(r.url).catch(() => {}); toast('Client link copied'); window.open(r.url, '_blank', 'noopener'); } catch (e) { toast(e.message, true); }
  };
  const copy = document.getElementById('seCopy'); if (copy) copy.onclick = async () => {
    const lines = [`${a.name} BFCM 2026 (Black Friday is Fri Nov 27)`, ''];
    a.phases.filter(p => p.status !== 'skip').forEach((p, i) => { lines.push(`${i + 1}. ${p.name} (${fmtRange(p.start, p.end)}${p.who ? `, ${p.who}` : ''}): ${p.offer || 'offer not set'}${p.status !== 'locked' ? ` [${STATUS[p.status][0].toLowerCase()}]` : ''}`); if (p.detail) lines.push(`   ${p.detail.replace(/\n+/g, ' ')}`); });
    if (g.bf != null || g.total != null) lines.push('', `Goal: ${g.bf != null ? `BF weekend ${money(g.bf)}` : ''}${g.dec != null ? `, December ${money(g.dec)}` : ''}${g.total != null ? `, season ${money(g.total)}` : ''}`);
    if (a.answers.cutoffs) lines.push(`Shipping cutoffs: ${a.answers.cutoffs}`);
    if (a.answers.gift_cards) lines.push(`Gift cards: ${a.answers.gift_cards}`);
    try { await navigator.clipboard.writeText(lines.join('\n')); toast('Offer sheet copied'); } catch { toast('Could not copy here', true); }
  };
  main.querySelectorAll('[data-edit-phase]').forEach(b => b.onclick = () => editPhase(a, b.dataset.editPhase));
  main.querySelectorAll('[data-swipe]').forEach(b => b.onclick = () => { const p = a.phases.find(x => x.key === b.dataset.swipe); if (p?.swipe) showSwipe(document.getElementById('seSwipeHost'), p.swipe, `Swipe file: ${p.name}`); });
  const bs = document.getElementById('seBrandSwipe'); if (bs) bs.onclick = () => showSwipe(document.getElementById('seSwipeHost'), a.swipe_brand, `${a.name}'s own swipe file`);
  const ap = document.getElementById('seAddPhase'); if (ap) ap.onclick = () => editPhase(a, null);
  const at = document.getElementById('seAddTask'); if (at) at.onclick = () => editTask(a.act_id, null);
  const eg = document.getElementById('seGoals'); if (eg) eg.onclick = () => editGoals(a);
  main.querySelectorAll('[data-edit-answer]').forEach(b => b.onclick = () => editAnswer(a, b.dataset.editAnswer));
  const tg = document.getElementById('seToggleSeason'); if (tg) tg.onclick = async () => {
    const ok = typeof window.confirmModal === 'function' ? await window.confirmModal(a.in_season ? 'Take this brand off the season board?' : 'Put this brand on the season board?', a.in_season ? 'It disappears from All clients and the calendar. Nothing is deleted.' : 'It shows on the board again with everything it had.', a.in_season ? 'Take it off' : 'Put it on') : true;
    if (!ok) return;
    try { await put('/api/season/answer', { act: a.act_id, key: 'in_season', value: a.in_season ? 'no' : 'yes' }); await refresh(); } catch (e) { toast(e.message, true); }
  };
  wireTasks(main);
  wireDeskSection(main, [a], today, paintBrand);
}
async function editGoals(a) {
  const g = a.goals || {};
  const r = await formModal({
    title: `${a.name}: goals and ladder`, hint: 'Money in dollars, lines as blended MER (revenue divided by ad spend, Triple Whale). Leave a box empty if it is not set.',
    fields: [
      ...GOAL_FIELDS.map(([k, l, t]) => ({ k, label: l, type: 'number', step: t === 'x' ? '0.01' : '1', value: g[k] ?? '', half: 1 })),
      { k: 'note', label: 'Where these came from', value: g.note || '', ph: 'e.g. Goals from the Aug 25 call; ladder from last year, confirm by Nov 13' },
    ], cta: 'Save',
  });
  if (!r) return;
  const out = {};
  for (const [k] of GOAL_FIELDS) out[k] = r[k] === '' ? null : +r[k];
  out.note = r.note;
  try { await put('/api/season/answer', { act: a.act_id, key: 'goals', value: out }); await refresh(); } catch (e) { toast(e.message, true); }
}
async function editPhase(a, key) {
  const p = key ? a.phases.find(x => x.key === key) : null;
  const r = await formModal({
    title: p ? p.name : 'Add a phase', hint: p?.hint || 'Something this brand runs that is not on the standard list, like a creator launch or a second drop.',
    fields: [
      { k: 'name', label: 'Name', value: p?.name || '' },
      { k: 'start', label: 'Starts', type: 'date', value: p?.start || '', half: 1 },
      { k: 'end', label: 'Ends', type: 'date', value: p?.end || '', half: 1, hint: 'Same day for a one-day event.' },
      { k: 'who', label: 'Who gets it', value: p?.who || '', ph: 'Everyone, members only, the list, BFCM buyers' },
      { k: 'offer', label: 'The deal, one line', value: p?.offer || '', ph: 'e.g. Any club = free hat. First 400 orders = free polo.' },
      { k: 'detail', label: 'Mechanics and fine print', type: 'textarea', value: p?.detail || '', ph: 'Dates inside the phase, what switches when, Plan B rules, what is still open.' },
      { k: 'status', label: 'Status', type: 'select', value: p?.status || 'draft', options: [['missing', 'Missing: nothing decided'], ['draft', 'Draft: proposed, not agreed'], ['locked', 'Locked: the client said yes'], ['skip', 'Skip: this brand is not running it']] },
      ...(p ? [] : [{ k: 'grp', label: 'Part of the season', type: 'select', value: 'bf', options: Object.entries(GRP).map(([k, v]) => [k, v[0]]) }]),
    ], cta: 'Save', danger: p && p.tpl === 0 && !['early', 'access', 'bf', 'planb', 'drop', 'xmas', 'gift', 'boxing', 'ny', 'vday'].includes(p.key) ? 'Delete phase' : null,
  });
  if (!r) return;
  try {
    if (r.__delete) await put('/api/season/phase', { act: a.act_id, key: p.key }, 'DELETE');
    else {
      if (!r.name) return toast('Give it a name', true);
      const k = p ? p.key : ('x' + Date.now().toString(36));
      await put('/api/season/phase', { act: a.act_id, key: k, name: r.name, start: r.start || null, end: r.end || null, who: r.who, offer: r.offer, detail: r.detail, status: r.status, grp: p ? p.grp : r.grp, sort: p ? p.sort : 500 });
    }
    await refresh();
  } catch (e) { toast(e.message, true); }
}
async function editAnswer(a, key) {
  const sheet = SHEET.find(s => s[0] === key); const setup = SETUP.find(s => s[0] === key);
  const label = sheet ? sheet[1] : setup[1];
  const field = setup && setup[2] === 'select'
    ? { k: 'v', label, type: 'select', value: a.shape, options: setup[3], hint: 'Changes the November phase template for this brand. Dates you already set are kept.' }
    : { k: 'v', label, type: sheet ? 'textarea' : 'text', value: a.answers[key] || '', hint: sheet ? sheet[2] : 'A name, as it should read on the calendar.' };
  const r = await formModal({ title: label, fields: [field], cta: 'Save' });
  if (!r) return;
  try { await put('/api/season/answer', { act: a.act_id, key, value: r.v }); await refresh(); } catch (e) { toast(e.message, true); }
}

/* ---------- the client link ---------- */
async function renderShare(token, url) {
  injectCss();
  const main = $('#main');
  main.innerHTML = `<div class="se se-share"><div class="card"><span class="hint">Loading…</span></div></div>`;
  let d;
  try {
    const res = await fetch(url.replace(/\/+$/, '') + '/api/season/' + token);
    d = await res.json();
    if (!res.ok) throw new Error(d.error || 'This link is no longer valid.');
  } catch (e) { main.innerHTML = `<div class="gate"><h1>Season plan unavailable</h1><p>${esc(e.message)}</p></div>`; return; }
  const t = $('.hd-title'); if (t) t.innerHTML = `${esc(d.account.name)} <em>Season 2026</em>`;
  const days = daysBetween(d.today, d.bf);
  const dates = Object.entries(d.dates || {});
  const DL = { cutoffs: 'Shipping cutoffs', returns: 'Return window', gift_cards: 'Gift cards' };
  const byDay = {};
  (d.checkins || []).forEach(c => (byDay[c.date] = byDay[c.date] || []).push(c));
  main.innerHTML = `<div class="se se-share">
    <h2>${esc(d.account.name)}: the season, start to finish</h2>
    <p class="sub">What runs when, who gets it, and what the deal is. ${days > 0 ? `${days} days to Black Friday (Fri Nov 27).` : ''} Anything marked Draft is still being decided together. Once a phase is live, its revenue so far shows on the card.</p>
    <div class="se-phases">${d.phases.map(p => `<div class="se-ph" style="--c:${GRP[p.grp]?.[1] || 'var(--se-bf)'}">
      <div class="t"><b>${esc(p.name)}</b>${p.status === 'locked' ? '' : pill(p.status)}</div>
      <div class="d">${esc(fmtRange(p.start, p.end))}${p.who ? ` · ${esc(p.who)}` : ''}</div>
      <div class="o ${p.offer ? '' : 'none'}">${esc(p.offer || 'Being decided.')}</div>${p.detail ? `<div class="x">${esc(p.detail)}</div>` : ''}
      ${p.results ? `<div class="res"><b>${money(p.results.sales)}</b> revenue so far${p.results.orders ? ` · ${Math.round(p.results.orders)} orders` : ''}<br><span class="tiny">${esc(fmtD(p.results.from))} to ${esc(fmtD(p.results.to))}</span></div>` : ''}</div>`).join('')}</div>
    ${dates.length ? `<div class="card" style="margin-top:16px"><h3 style="margin:0 0 8px">Dates that matter</h3><div class="se-kv" style="grid-template-columns:170px 1fr">${dates.map(([k, v]) => `<div class="k">${esc(DL[k] || k)}</div><div class="v">${esc(v)}</div>`).join('')}</div></div>` : ''}
    ${Object.keys(byDay).length ? `<div class="card" style="margin-top:16px"><h3 style="margin:0 0 8px">What we did, check-in by check-in</h3>${Object.keys(byDay).sort().map(day => `<div class="se-when">${esc(fmtDow(day))}</div>${byDay[day].map(c => `<div class="se-slot" style="grid-template-columns:90px 1fr"><div class="s">${esc(SLOTS.find(s => s[0] === c.slot)?.[1] || c.slot)}</div><div class="did">${esc(c.action)}<small>${esc(c.by || 'Mobius')}</small></div></div>`).join('')}`).join('')}</div>` : ''}
    ${d.asks?.length ? `<div class="card" style="margin-top:16px"><h3 style="margin:0 0 8px">What we need from you</h3>${d.asks.map(x => `<div class="se-task"><span></span><div class="n">${esc(x.name)}<small>${esc(x.phase || '')}</small></div><div class="r"><b>${esc(x.due ? fmtDow(x.due) : '')}</b></div></div>`).join('')}</div>` : ''}
    <p class="tiny" style="margin-top:16px">Prepared by Mobius Digital. This page updates as the plan does.</p>
  </div>`;
}

/* ---------- entry ---------- */
async function render({ tok, url, act, accounts, pick }) {
  Object.assign(S, { tok, url, act, accounts: accounts || [], pick });
  injectCss();
  if (act === 'all') return renderAll();
  return renderBrand();
}
window.SeasonTab = { render, renderShare };
})();
