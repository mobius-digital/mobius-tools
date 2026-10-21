/* WORK > CALLS (2026-10-13 fourth pass, the approved mock in docs/handoffs/work-calls-tasks-production.md). An inbox:
 * every call Locus read waits here for an OK, and approving sends each item where it lives. Nothing lives here.
 *
 *   Monday block  on Mondays (and Friday to Sunday, for next Monday) the week's theme and each brand's numbers and plan,
 *                 red brands first. Any other day, "Show them now".
 *   Waiting on your OK  the first call is open: brand mark, "<Brand> with <client>", date, length, Transcript, the summary,
 *                 then ONE table (Item / Goes to / Who / Due) grouped Mobius does, New ads, Client does, Client reads; a
 *                 tick per row (unticked = dropped), every cell changes in place. Approve N / Skip this call. The other
 *                 calls are one line each with their counts and Review.
 *   History       Date, Brand, With, Length, What it made, Status, Open.
 * Where items go (account-health meetings.js confirm): Mobius does -> Tasks (p_action, with its area); New ads -> a
 * numbered brief in Asana and its card on Production; Client does -> the client's Requests and the report's "What we need
 * from you"; Client reads -> the weekly report's "This week".
 * 2026-10-20, the Locus kit: the page header is the host's (pageHead; the Brand menu goes through pageActions), the
 * "Run a call" cards are one row of three kit cards with a one-line caption each, the inbox and History as before.
 * Classic script, own closure; the host hands in S, api, apiAH, show, pageHead, RUN. window.CallsTab = { render }.
 */
(() => {
  let H = null;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ROLE = { Cole: 'Owner', Ahsan: 'Strategist', Noma: 'Strategist', William: 'Designer', Ravo: 'Video', Radhesh: 'Google', Hamza: 'Amazon' };
  const HUE = { Cole: 'var(--brand)', Ahsan: 'var(--c-tiktok)', Noma: 'var(--c-email)', William: 'var(--c-google)', Ravo: 'var(--c-else)', Radhesh: 'var(--c-meta)', Hamza: 'var(--c-amazon)', Mobius: 'var(--muted)' }; /* never good / warn / bad: those mean status */
  const dt = iso => new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  const md = iso => iso ? dt(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const short = iso => iso ? dt(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const addDays = (iso, n) => { const d = dt(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const money = n => n == null ? '–' : '$' + (Math.abs(n) >= 10000 ? Math.round(n / 1000) + 'K' : Math.round(n).toLocaleString('en-US'));
  const pct = (a, b) => (a == null || !b) ? null : Math.round((a / b - 1) * 100);
  const firstName = s => String(s || '').split(/[@\s]/)[0].replace(/^./, c => c.toUpperCase());
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const KIND = {
    team: { title: 'Mobius does', c: 'var(--brand)', go: 'Tasks', what: 'Tasks (Mobius does)' },
    brief: { title: 'New ads', c: 'var(--c-email)', go: 'Production · Brief', what: 'Production · Brief (new ads)' },
    client_owes: { title: 'Client does', c: 'var(--c-amazon)', go: 'Requests', what: 'Requests (client does)' },
    hear: { title: 'Client reads', c: 'var(--c-tiktok)', go: 'Next report', what: 'Next report (client reads)' },
  };
  const ORDER = ['team', 'brief', 'client_owes', 'hear'];
  const AREAS = [['ads', 'Ads'], ['email', 'Email'], ['organic', 'Organic'], ['site', 'Site'], ['ops', 'Ops'], ['client', 'Client']];
  const areaName = a => (AREAS.find(x => x[0] === a) || [])[1] || '';
  let D = null, MON = null, SEV = {}, CARDS = {}, OPEN = null, BR = 'all', AGENDA = null, UID = 0;

  /* ---------- look (tokens only) ---------- */
  function css() {
    if (document.getElementById('clcss')) return;
    const st = document.createElement('style'); st.id = 'clcss';
    st.textContent = `
      .cl{display:flex;flex-direction:column;gap:16px;max-width:1180px;min-width:0}
      .cl .cl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
      .cl .cl-head h1{font-size:22px;font-weight:700;margin:0;color:var(--ink)}
      .cl .cl-head p{color:var(--ink-2);margin:4px 0 0;font-size:13.5px;max-width:640px}
      .cl .muted{color:var(--muted)}
      .cl-menu{height:var(--ctl-h,32px);padding:0 12px;border-radius:var(--r-sm);border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;font-weight:550;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
      .cl-menu span{color:var(--muted);font-weight:500}
      .cl .cl-st{display:flex;align-items:center;gap:8px;margin-top:4px}
      .cl .cl-st b{font-weight:600;color:var(--ink);font-size:14px}
      .cl .cl-tag{font-size:11px;padding:2px 7px;border-radius:4px;font-weight:600;white-space:nowrap}
      .cl .cl-tag.warn{color:var(--warn);background:color-mix(in srgb,var(--warn) 14%,transparent)}
      .cl .cl-card{background:var(--surface);border:1px solid var(--line);border-radius:8px;min-width:0}
      .cl .cl-card.open{border-color:var(--line-strong)}
      .cl .cl-card.ring{box-shadow:0 0 0 2px var(--brand)}
      .cl .cl-run-g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .cl .cl-run-b{text-align:left;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:14px 16px;display:flex;flex-direction:column;gap:3px;min-width:0;font:inherit;cursor:pointer;transition:border-color var(--t-fast,120ms) var(--ease,ease)}
      .cl .cl-run-b:hover{border-color:var(--line-strong)}
      .cl .cl-run-b b{font-size:15px;font-weight:600;color:var(--ink);letter-spacing:-.005em}
      .cl .cl-run-b span{font-size:12px;font-weight:500;color:var(--muted);line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      @media (max-width:720px){.cl .cl-run-g{grid-template-columns:1fr}}
      .cl .cl-top{display:flex;align-items:flex-start;gap:14px;padding:14px 16px}
      .cl .cl-mark{width:34px;height:34px;border-radius:8px;background:var(--brand-soft);color:var(--brand);display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex:none}
      .cl .cl-tt{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
      .cl .cl-tt b{font-weight:600;color:var(--ink);font-size:14px}
      .cl .cl-tt span{color:var(--muted);font-size:13px}
      .cl .cl-tt a{color:var(--brand);text-decoration:none}
      .cl .cl-sum{color:var(--ink-2);margin:4px 0 0;line-height:1.45;font-size:13.5px;padding:2px 6px;margin-left:-6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .cl .cl-sum:focus,.cl .cl-sum.full{display:block;-webkit-line-clamp:unset}
      .cl [contenteditable]{outline:none;border-radius:6px;cursor:text}
      .cl [contenteditable]:hover{background:var(--surface-2)}
      .cl [contenteditable]:focus{background:var(--surface-2);box-shadow:0 0 0 1px var(--line-strong)}
      .cl .cl-sc{overflow-x:auto}
      .cl .cl-tr{display:grid;grid-template-columns:28px minmax(0,1fr) 160px 140px 120px 28px;gap:12px;align-items:center;padding:6px 16px;border-top:1px solid var(--line);min-width:640px}
      .cl .cl-th{padding:10px 16px 4px;font-size:11px;letter-spacing:.4px;text-transform:uppercase;color:var(--faint,var(--muted))}
      /* phone (2026-10-21): the item rows stack, the title full width and the meta under it, no 640px table on a 390px screen */
      @media (max-width:720px){.cl .cl-tr.cl-th{display:none}.cl .cl-tr{min-width:0;padding:10px 12px;gap:6px 8px;align-items:start;grid-template-columns:28px minmax(0,1fr) auto 28px;grid-template-areas:'ck tw tw tw' 'ck go go go' 'ck who due q'}.cl .cl-row>input{grid-area:ck;margin-top:2px}.cl .cl-row>.tw{grid-area:tw}.cl .cl-row>div:nth-child(3){grid-area:go}.cl .cl-row>div:nth-child(4){grid-area:who}.cl .cl-row>div:nth-child(5){grid-area:due}.cl .cl-row>div:nth-child(6){grid-area:q}.cl .cl-row>div{justify-self:start;min-width:0}.cl .cl-row>div:nth-child(6){justify-self:end}}
      .cl .cl-row .t{color:var(--ink);font-size:13.5px;line-height:1.4;padding:3px 6px;margin-left:-6px}
      .cl .cl-row.off .t{text-decoration:line-through;color:var(--muted)}
      .cl .cl-row .tw{min-width:0}
      .cl .cl-row .d{color:var(--ink-2);font-size:12.5px;line-height:1.4;padding:1px 6px 3px;margin-left:-6px;white-space:pre-wrap}
      .cl .cl-row .d.empty:not(:focus)::before{content:attr(data-ph);color:var(--faint,var(--muted))}
      .cl .cl-row .d.empty:not(:focus){padding-top:0;font-size:12px}
      .cl .cl-row.off .d{color:var(--muted)}
      .cl .cl-maybe{display:inline-block;margin:0 0 2px 6px;font-size:10.5px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--warn);border:1px dashed var(--warn);border-radius:4px;padding:0 5px;vertical-align:middle}
      .cl .cl-row.off .cl-go,.cl .cl-row.off .cl-chip{opacity:.45}
      .cl .cl-row input[type=checkbox]{width:15px;height:15px;accent-color:var(--good);margin:0;cursor:pointer}
      .cl .cl-sec{font-size:11px;letter-spacing:.4px;text-transform:uppercase;font-weight:600;padding:12px 16px 4px;border-top:1px solid var(--line)}
      .cl .cl-bh{display:flex;align-items:center;gap:10px;padding:10px 16px;border-top:1px solid var(--line);background:var(--surface-2)}
      .cl .cl-bh button.t{display:flex;align-items:center;gap:8px;background:none;border:0;color:var(--ink);font:inherit;cursor:pointer;padding:0;text-align:left;flex:1;min-width:0}
      .cl .cl-bh b{font-weight:600;font-size:13.5px}
      .cl .cl-bh small{color:var(--muted);font-size:12.5px}
      .cl .cl-bh .chev{transition:transform .15s;color:var(--muted)}
      .cl .cl-b.shut .cl-bh .chev{transform:rotate(-90deg)}
      .cl .cl-b.shut .cl-bb{display:none}
      .cl .cl-b.out .cl-bh b,.cl .cl-b.out .cl-bh small{text-decoration:line-through;color:var(--muted)}
      .cl .cl-go{height:30px;padding:0 8px;margin-left:-8px;border:0;border-radius:6px;background:transparent;color:var(--ink-2);font:inherit;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;max-width:100%;white-space:nowrap;overflow:hidden}
      .cl .cl-go:hover{background:var(--surface-2);color:var(--ink)}
      .cl .cl-go .chev{color:var(--faint,var(--muted))}
      .cl .cl-plain{color:var(--muted);font-size:13px}
      .cl .cl-link{background:none;border:0;color:var(--muted);font:inherit;font-size:12.5px;cursor:pointer;padding:4px 2px;white-space:nowrap}
      .cl .cl-link:hover{color:var(--ink)}
      .cl .cl-add{display:block;background:none;border:0;border-top:1px solid var(--line);width:100%;text-align:left;color:var(--muted);font:inherit;font-size:12.5px;cursor:pointer;padding:8px 16px 8px 56px}
      .cl .cl-add:hover{color:var(--ink)}
      .cl .cl-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 16px;border-top:1px solid var(--line)}
      .cl .cl-foot .muted{font-size:12.5px;margin-left:6px}
      .cl .cl-btn{height:32px;padding:0 14px;border-radius:6px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--ink)}
      .cl .cl-btn.pri{background:var(--brand);border-color:var(--brand);color:var(--surface)}
      .cl .cl-btn.s{height:28px;font-weight:500}
      .cl .cl-btn:disabled{opacity:.55;cursor:default}
      .cl .cl-err{color:var(--bad);font-size:12.5px}
      .cl .cl-warn{color:var(--warn)}
      .cl .cl-one{display:flex;align-items:center;gap:14px;padding:14px 16px}
      .cl .cl-one .x{flex:1;min-width:0}
      .cl .cl-one .c{color:var(--muted);margin-top:4px;font-size:13px}
      .cl .cl-ok{padding:14px 16px;font-size:13.5px;line-height:1.6}
      .cl .cl-ok ul{margin:6px 0 0;padding:0 0 0 18px}
      .cl .cl-ok a{color:var(--brand)}
      .cl .cl-hr{display:grid;grid-template-columns:110px 130px 110px 60px minmax(0,1fr) 190px 60px;gap:12px;align-items:center;padding:10px 16px;border-top:1px solid var(--line);font-size:13px;min-width:860px}
      .cl .cl-hr.h{border-top:0;padding-bottom:4px;font-size:11px;letter-spacing:.4px;text-transform:uppercase;color:var(--faint,var(--muted))}
      .cl .cl-hr .b{color:var(--ink)}
      .cl .cl-hr .good{color:var(--good)}.cl .cl-hr .bad{color:var(--bad)}
      .cl .cl-hr button{background:none;border:0;color:var(--brand);font:inherit;font-size:13px;cursor:pointer;padding:0;text-align:left}
      .cl .cl-hd{padding:4px 16px 14px;font-size:13px;line-height:1.55;color:var(--ink-2);min-width:860px}
      .cl .cl-hd p{margin:0 0 6px}
      .cl .cl-mb{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding:8px 16px;border-top:1px solid var(--line)}
      .cl .cl-mb > b{min-width:120px;font-weight:600;font-size:13.5px}
      .cl .cl-dot{width:8px;height:8px;border-radius:50%;background:var(--muted);display:inline-block;flex:none;align-self:center}
      .cl .cl-dot.bad{background:var(--bad)}.cl .cl-dot.warn{background:var(--warn)}.cl .cl-dot.good{background:var(--good)}
      .cl .cl-read{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--ink-2)}
      .cl .cl-read b{color:var(--ink);font-weight:600}
      .cl .cl-read .up{color:var(--good)}.cl .cl-read .dn{color:var(--bad)}
      .cl details.cl-plan{width:100%;margin:2px 0 0 18px}
      .cl details.cl-plan summary{cursor:pointer;font-size:12.5px;color:var(--muted)}
      .cl details.cl-plan div{white-space:pre-wrap;font-size:13px;line-height:1.55;padding:8px 12px;margin:6px 0 0;background:var(--surface-2);border-radius:8px}
      .cl .cl-theme{display:flex;gap:8px;align-items:flex-start;padding:0 16px 14px}
      .cl .cl-theme textarea{flex:1;min-height:40px;font:inherit;font-size:13.5px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface-2);color:var(--ink);resize:vertical}
      .cl .cl-empty{color:var(--muted);font-size:13.5px;padding:14px 16px}
      .cl .cl-chip{height:30px;max-width:100%;padding:0 8px 0 4px;margin-left:-4px;border-radius:999px;border:1px solid transparent;background:transparent;color:var(--ink);font:inherit;font-size:13px;display:inline-flex;align-items:center;gap:7px;cursor:pointer;white-space:nowrap;overflow:hidden}
      .cl .cl-chip.date{padding:0 8px}
      .cl .cl-chip:hover{background:var(--surface-2);border-color:var(--line-strong)}
      .cl .cl-chip.need{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 50%,transparent);border-style:dashed}
      .cl .cl-chip.late{color:var(--bad)}
      .cl .cl-chip.now{color:var(--warn)}
      .cl .cl-av{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#131316;flex:none}
      .cl .cl-ib{width:28px;height:28px;border-radius:6px;border:0;background:transparent;color:var(--muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
      .cl .cl-ib:hover{background:var(--surface-2);color:var(--ink)}
      .cl-pop{position:fixed;z-index:9600;min-width:220px;max-width:320px;max-height:420px;overflow:auto;background:var(--surface-2);border:1px solid var(--line-strong);border-radius:12px;padding:6px;box-shadow:0 18px 44px rgba(0,0,0,.35);font-family:inherit;color:var(--ink)}
      .cl-pop .h{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);padding:7px 9px 5px}
      .cl-pop button.o{width:100%;height:36px;border:0;border-radius:8px;background:transparent;color:var(--ink);font:inherit;font-size:13.5px;display:flex;align-items:center;gap:10px;padding:0 9px;cursor:pointer;text-align:left}
      .cl-pop button.o:hover,.cl-pop button.o.on{background:var(--brand-soft)}
      .cl-pop button.o small{margin-left:auto;color:var(--muted);font-size:12px}
      .cl-pop button.o.danger{color:var(--bad)}
      .cl-pop hr{border:0;border-top:1px solid var(--line-strong);margin:5px 2px}
      .cl-pop .cl-av{width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#131316;flex:none}
      .cl-pop .cal{padding:4px 4px 2px}
      .cl-pop .cal .mh{display:flex;align-items:center;justify-content:space-between;font-size:12.5px;color:var(--ink-2);padding:2px 4px 6px}
      .cl-pop .cal .mh button{border:0;background:transparent;color:var(--muted);cursor:pointer;width:28px;height:28px;border-radius:6px;font-size:15px}
      .cl-pop .cal .mh button:hover{background:var(--brand-soft);color:var(--ink)}
      .cl-pop .cal .g{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
      .cl-pop .cal .g span{font-size:10.5px;color:var(--muted);padding:2px 0}
      .cl-pop .cal .g button{height:32px;border:0;border-radius:7px;background:transparent;color:var(--ink);font:inherit;font-size:12.5px;cursor:pointer}
      .cl-pop .cal .g button:hover{background:var(--brand-soft)}
      .cl-pop .cal .g button.past{color:var(--muted)}
      .cl-pop .cal .g button.today{box-shadow:inset 0 0 0 1px var(--line-strong)}
      .cl-pop .cal .g button.on{background:var(--brand);color:var(--surface)}
      .cl-pop blockquote{margin:6px 8px 8px;font-size:13.5px;line-height:1.55;color:var(--ink)}
      @media (max-width:640px){.cl .cl-top{padding:12px}.cl .cl-one{flex-wrap:wrap}}
    `;
    document.head.appendChild(st);
  }

  /* ---------- small helpers ---------- */
  const post = (path, body) => H.apiAH(path, { method: 'POST', body: JSON.stringify(body) });
  const toast = msg => { const t = document.createElement('div'); t.setAttribute('role', 'status'); t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));background:var(--ink);color:var(--surface);padding:10px 16px;border-radius:12px;font-size:13.5px;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,.25)'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 4500); };
  const brandName = id => id ? ((D.brands.find(b => b.act_id === id) || {}).name || id) : 'Agency-wide';
  const today = () => D.today || new Date().toISOString().slice(0, 10);
  const av = n => n && window.ProdSheet && window.ProdSheet.photoOf(n) ? `<img class="cl-av" src="${esc(window.ProdSheet.photoOf(n))}" alt="" referrerpolicy="no-referrer" style="object-fit:cover">` : n ? `<span class="cl-av" style="background:${HUE[n] || 'var(--line-strong)'}">${esc(n[0])}</span>` : '<span class="cl-av" style="background:var(--line-strong);color:var(--ink)">?</span>';
  const ICON = {
    chev: '<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    cal: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    more: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
    quote: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6"/></svg>',
    check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  };
  function dueChip(due, attrs = '', open = true) {
    const t = today();
    if (!due) return `<button class="cl-chip date need" ${attrs}>${ICON.cal}<span>Add a date</span></button>`;
    const cls = !open ? '' : due < t ? ' late' : due === t ? ' now' : '';
    const label = due === t ? 'Today' : due === addDays(t, 1) ? 'Tomorrow' : md(due);
    return `<button class="cl-chip date${cls}" ${attrs}>${ICON.cal}<span>${esc(label)}${cls === ' late' ? ', late' : ''}</span></button>`;
  }
  const ownerChip = (o, attrs = '') => o ? `<button class="cl-chip" ${attrs}>${av(o)}<span>${esc(o)}</span></button>` : `<button class="cl-chip need" ${attrs}>${av('')}<span>Needs an owner</span></button>`;

  /* ---------- Locus's own menus (never the browser's select) ---------- */
  let POP = null;
  function closePop() { if (!POP) return; POP.el.remove(); document.removeEventListener('mousedown', POP.out, true); document.removeEventListener('keydown', POP.key, true); POP = null; }
  function pop(anchor, html, wire) {
    closePop();
    const el = document.createElement('div'); el.className = 'cl-pop'; el.setAttribute('role', 'menu'); el.innerHTML = html;
    document.body.appendChild(el);
    const place = () => { const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight; let top = r.bottom + 6, left = r.left; if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6); if (left + w > innerWidth - 8) left = Math.max(8, innerWidth - w - 8); el.style.top = top + 'px'; el.style.left = left + 'px'; };
    place();
    const out = e => { if (!el.contains(e.target) && !anchor.contains(e.target)) closePop(); };
    const key = e => { if (e.key === 'Escape') { closePop(); anchor.focus(); } };
    POP = { el, out, key, place };
    setTimeout(() => { document.addEventListener('mousedown', out, true); document.addEventListener('keydown', key, true); }, 0);
    wire(el, place);
    const f = el.querySelector('button.o.on') || el.querySelector('button'); if (f) f.focus({ preventScroll: true });
  }
  function ownerMenu(anchor, cur, onPick, { none = true } = {}) {
    const names = [...new Set([...(D.team || []), ...(cur && !D.team.includes(cur) ? [cur] : [])])];
    pop(anchor, `<div class="h">Who does it</div>${names.map(n => `<button class="o${n === cur ? ' on' : ''}" data-v="${esc(n)}">${av(n)}${esc(n)}<small>${esc(ROLE[n] || '')}</small></button>`).join('')}${none ? `<hr><button class="o" data-v="">Nobody yet</button>` : ''}`,
      el => $$('button.o', el).forEach(b => b.onclick = () => { closePop(); onPick(b.dataset.v); }));
  }
  function dueMenu(anchor, cur, onPick) {
    const t = today(), dow = dt(t).getUTCDay();
    const fri = addDays(t, ((5 - dow + 7) % 7) || 7), mon = addDays(t, ((8 - dow) % 7) || 7);
    const quick = [['Today', t], ['Tomorrow', addDays(t, 1)], [dow < 5 && dow > 0 ? 'This Friday' : 'Friday', fri], ['Next Monday', mon], ['In 2 weeks', addDays(t, 14)]];
    let month = (cur || t).slice(0, 7);
    const cal = () => {
      const [y, m] = month.split('-').map(Number), first = new Date(Date.UTC(y, m - 1, 1)), days = new Date(Date.UTC(y, m, 0)).getUTCDate(), lead = (first.getUTCDay() + 6) % 7;
      const name = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      let g = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(x => `<span>${x}</span>`).join('') + '<span></span>'.repeat(lead);
      for (let d = 1; d <= days; d++) { const iso = `${month}-${String(d).padStart(2, '0')}`; g += `<button data-v="${iso}" class="${iso === cur ? 'on' : iso === t ? 'today' : iso < t ? 'past' : ''}" aria-label="${esc(md(iso))}">${d}</button>`; }
      return `<div class="mh"><button data-m="-1" aria-label="Previous month">‹</button><span>${name}</span><button data-m="1" aria-label="Next month">›</button></div><div class="g">${g}</div>`;
    };
    pop(anchor, `<div class="h">Due</div>${quick.map(([l, iso]) => `<button class="o${iso === cur ? ' on' : ''}" data-v="${iso}">${l}<small>${esc(md(iso))}</small></button>`).join('')}<hr><div class="cal">${cal()}</div><hr><button class="o" data-v="">No due date</button>`,
      (el, place) => {
        const wire = () => {
          $$('button[data-v]', el).forEach(b => b.onclick = () => { closePop(); onPick(b.dataset.v); });
          $$('.cal [data-m]', el).forEach(b => b.onclick = e => { e.stopPropagation(); const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + +b.dataset.m, 1)); month = d.toISOString().slice(0, 7); $('.cal', el).innerHTML = cal(); wire(); place(); });
        };
        wire();
      });
  }
  function listMenu(anchor, title, opts, onPick) {
    pop(anchor, `${title ? `<div class="h">${esc(title)}</div>` : ''}${opts.map(o => o === '-' ? '<hr>' : `<button class="o${o.on ? ' on' : ''}${o.danger ? ' danger' : ''}" data-v="${esc(o.v)}">${o.html || esc(o.label)}${o.small ? `<small>${esc(o.small)}</small>` : ''}</button>`).join('')}`,
      el => $$('button.o', el).forEach(b => b.onclick = () => { closePop(); onPick(b.dataset.v); }));
  }
  function quoteMenu(anchor, q, at) {
    pop(anchor, `<div class="h">Said on the call${at ? ` at ${esc(at)}` : ''}</div><blockquote>“${esc(q)}”</blockquote>`, () => {});
  }
  /* contenteditable words: Enter commits, Escape reverts */
  function wireText(el, onCommit) {
    el.setAttribute('contenteditable', 'plaintext-only');
    if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'true');
    let was = el.textContent;
    el.onfocus = () => { was = el.textContent; };
    el.onkeydown = e => { if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); el.blur(); } if (e.key === 'Escape') { el.textContent = was; el.blur(); } };
    el.onblur = () => { const v = el.textContent.replace(/\s+/g, ' ').trim(); el.textContent = v; if (v !== was && onCommit) onCommit(v, was); };
  }

  /* ---------- the approve card (one per call) ---------- */
  const TEAM_DOMAIN = /go-mobius-digital\.com$/i;
  function modelOf(m) {
    const n = m.notes || { brands: [] };
    const brands = [...(n.brands || [])].sort((a, b) => (a.brand_id ? 1 : 0) - (b.brand_id ? 1 : 0)).map(b => ({
      brand_id: b.brand_id || '', decisions: b.decisions || [], skip: false,
      items: [
        ...(b.items || []).filter(i => i.kind !== 'client').map(i => ({ uid: ++UID, kind: ['team', 'brief', 'client_owes'].includes(i.kind) ? i.kind : 'team', text: i.text || '', detail: i.detail || '', maybe: i.sure === false, owner: i.kind === 'client_owes' ? '' : (i.owner || ''), due: i.due || '', area: i.area || '', quote: i.quote || '', at: i.at || '', off: i.sure === false })),
        ...(b.brand_id ? [...new Set([...(b.this_week || []), ...(b.items || []).filter(i => i.kind === 'client').map(i => i.text)])].filter(Boolean).map(t => ({ uid: ++UID, kind: 'hear', text: t, detail: '', maybe: false, owner: '', due: '', area: '', quote: '', at: '', off: false })) : []),
      ],
    }));
    brands.forEach(b => { b.open = brands.length <= 3 || b.items.some(i => (i.kind === 'team' || i.kind === 'brief') && !i.owner); });
    const with_ = (m.attendees || []).filter(a => !TEAM_DOMAIN.test(a.email || '')).map(a => firstName(a.displayName || a.email)).filter(Boolean);
    return { id: m.id, title: m.title, date: m.date, duration: m.duration, with: [...new Set(with_)].slice(0, 3), summary: n.summary || '', brands };
  }
  const live = b => b.skip ? [] : b.items.filter(i => !i.off && i.text.trim());
  const liveAll = card => card.brands.reduce((n, b) => n + live(b).length, 0);
  function countsOf(items, all = true) {
    const c = k => items.filter(i => i.kind === k).length;
    return ORDER.filter(k => all || c(k)).map(k => `${c(k)} ${KIND[k].title}`).join(' · ') || 'nothing to send';
  }
  function titleOf(card) {
    const names = card.brands.filter(b => b.brand_id).map(b => brandName(b.brand_id));
    return names.length === 1 && card.with.length ? `${names[0]} with ${card.with.join(', ')}` : (card.title || 'Untitled call');
  }
  const initials = s => String(s || '').split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w)).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'MD';
  function markOf(card) { const b = card.brands.find(x => x.brand_id); return initials(b ? brandName(b.brand_id) : card.title); }
  const goesTo = i => i.kind === 'team' ? `Tasks${areaName(i.area) ? ` · ${areaName(i.area)}` : ''}` : KIND[i.kind].go;

  function rowHtml(i) {
    const who = i.kind === 'team' || i.kind === 'brief' ? ownerChip(i.owner, 'data-f="owner" aria-label="Change who does it"') : i.kind === 'client_owes' ? '<span class="cl-plain">The client</span>' : '';
    const due = i.kind === 'hear' ? '<span class="cl-plain">Monday report</span>' : dueChip(i.due, 'data-f="due" aria-label="Change the date"');
    return `<div class="cl-tr cl-row${i.off ? ' off' : ''}" data-uid="${i.uid}">
      <input type="checkbox" data-f="on" ${i.off ? '' : 'checked'} aria-label="Keep this item">
      <div class="tw"><div class="t" data-f="text">${esc(i.text)}</div>${i.kind === 'hear' ? '' : `<div class="d${i.detail ? '' : ' empty'}" data-f="detail" data-ph="Details, if the title needs them">${esc(i.detail)}</div>`}${i.maybe ? `<span class="cl-maybe" title="Locus was not sure this was agreed. Tick it if it was.">Maybe</span>` : ''}</div>
      <div><button class="cl-go" data-f="go" aria-label="Change where it goes">${esc(goesTo(i))}${ICON.chev}</button></div>
      <div>${who}</div><div>${due}</div>
      <div>${i.quote ? `<button class="cl-ib" data-f="quote" aria-label="What was said on the call" title="What was said on the call">${ICON.quote}</button>` : ''}</div>
    </div>`;
  }
  function brandBlock(card, b, bi) {
    const multi = card.brands.length > 1;
    const secs = ORDER.filter(k => b.brand_id || k === 'team').map(k => {
      const rows = b.items.filter(i => i.kind === k); if (!rows.length) return '';
      return `<div class="cl-sec" style="color:${KIND[k].c}">${KIND[k].title} · ${rows.filter(i => !i.off).length}</div>${rows.map(rowHtml).join('')}`;
    }).join('');
    return `<div class="cl-b${multi && !b.open ? ' shut' : ''}${b.skip ? ' out' : ''}" data-bi="${bi}">
      ${multi ? `<div class="cl-bh"><button class="t" data-toggle aria-expanded="${b.open}">${ICON.chev}<b>${esc(b.brand_id ? brandName(b.brand_id) : 'Agency-wide')}</b><small>${esc(countsOf(live(b), false))}</small></button><button class="cl-link" data-skipbrand>${b.skip ? 'Put this brand back' : 'Leave this brand out'}</button></div>` : ''}
      <div class="cl-bb">${secs || '<div class="cl-empty">Nothing from this call for this brand.</div>'}<button class="cl-add" data-add>+ Add an item</button></div>
    </div>`;
  }
  function cardHtml(card) {
    const n = liveAll(card);
    let o = 0, d = 0;
    for (const b of card.brands) for (const i of live(b)) { if ((i.kind === 'team' || i.kind === 'brief') && !i.owner) o++; if (i.kind !== 'hear' && !i.due) d++; }
    const flag = o || d ? ` <span class="cl-warn">${[o ? `${plural(o, 'item')} need${o === 1 ? 's' : ''} someone` : '', d ? `${d} need${d === 1 ? 's' : ''} a date` : ''].filter(Boolean).join(', ')}.</span>` : '';
    return `<section class="cl-card open" data-mid="${esc(card.id)}" tabindex="-1">
      <div class="cl-top"><span class="cl-mark">${esc(markOf(card))}</span><div style="flex:1;min-width:0">
        <div class="cl-tt"><b>${esc(titleOf(card))}</b><span>${esc(md(card.date))}${card.duration ? ` · ${Math.round(card.duration)} min` : ''} · <a href="https://app.fireflies.ai/view/${encodeURIComponent(card.id)}" target="_blank" rel="noopener">Transcript</a></span></div>
        <p class="cl-sum" data-sum title="Click to read it all or change it">${esc(card.summary)}</p></div></div>
      <div class="cl-sc"><div class="cl-tr cl-th"><span></span><span>Item</span><span>Goes to</span><span>Who</span><span>Due</span><span></span></div>
        ${card.brands.map((b, bi) => brandBlock(card, b, bi)).join('')}</div>
      <div class="cl-foot"><button class="cl-btn pri" data-approve${n ? '' : ' disabled'}>Approve ${n}</button><button class="cl-btn" data-skip>Skip this call</button>
        <span class="muted">Click any cell to change it before you approve. Unticked items are dropped.${flag}</span><span class="cl-err" data-err></span></div>
    </section>`;
  }
  function oneHtml(m) {
    const card = CARDS[m.id];
    const items = card.brands.flatMap(live);
    return `<section class="cl-card cl-one" data-mid="${esc(m.id)}"><span class="cl-mark">${esc(markOf(card))}</span>
      <div class="x"><div class="cl-tt"><b>${esc(titleOf(card))}</b><span>${esc(md(card.date))}${card.duration ? ` · ${Math.round(card.duration)} min` : ''}</span></div><div class="c">${esc(countsOf(items))}</div></div>
      <button class="cl-btn s" data-review>Review</button></section>`;
  }
  function doneHtml(title, r, by) {
    const rows = [...(r.brands || []), ...(r.agency ? [r.agency] : [])].map(b => {
      const bits = [];
      if ((b.tasks || []).length) bits.push(`${plural(b.tasks.length, 'task')} in Tasks`);
      for (const x of b.briefs || []) bits.push(x.asana_url ? `<a href="${esc(x.asana_url)}" target="_blank" rel="noopener">brief ${esc(x.num)}</a> in Production` : `brief "${esc(x.text)}" as a task`);
      if ((b.asks || []).length) bits.push(`${plural(b.asks.length, 'ask')} in Requests`);
      if (b.report) bits.push('report updated');
      if (b.slack) bits.push('Slack note posted');
      return `<li><b>${esc(b.name)}</b>: ${bits.join(', ') || 'notes filed'}</li>`;
    }).join('');
    return `<div class="cl-ok"><b>Approved${by ? ` by ${esc(by)}` : ''}: ${esc(title || 'the call')}</b><ul>${rows}</ul>${(r.warnings || []).map(w => `<p class="cl-warn" style="margin:6px 0 0">${esc(w)}</p>`).join('')}</div>`;
  }
  function paintCard(el, card) {
    const fresh = document.createElement('div'); fresh.innerHTML = cardHtml(card);
    const n = fresh.firstElementChild; el.replaceWith(n); wireCard(n, card); return n;
  }
  function wireCard(el, card) {
    const redraw = () => paintCard(el, card);
    const sum = $('[data-sum]', el);
    wireText(sum, v => { card.summary = v; });
    $$('.cl-b', el).forEach(s => {
      const b = card.brands[+s.dataset.bi];
      const tg = $('[data-toggle]', s); if (tg) tg.onclick = () => { b.open = !b.open; s.classList.toggle('shut', !b.open); tg.setAttribute('aria-expanded', b.open); };
      const sk = $('[data-skipbrand]', s); if (sk) sk.onclick = () => { b.skip = !b.skip; redraw(); };
      $('[data-add]', s).onclick = () => {
        const it = { uid: ++UID, kind: 'team', text: '', detail: '', maybe: false, owner: '', due: '', area: '', quote: '', at: '', off: false };
        b.items.push(it); b.open = true; const e2 = redraw(); const t = $(`.cl-row[data-uid="${it.uid}"] .t`, e2); if (t) t.focus();
      };
    });
    const find = uid => { for (const b of card.brands) { const i = b.items.find(x => x.uid === uid); if (i) return [b, i]; } return []; };
    $$('.cl-row', el).forEach(r => {
      const [b, i] = find(+r.dataset.uid); if (!i) return;
      $('[data-f=on]', r).onchange = e => { i.off = !e.target.checked; redraw(); };
      wireText($('[data-f=text]', r), v => { i.text = v; if (!v) b.items.splice(b.items.indexOf(i), 1); redraw(); });
      const dl = $('[data-f=detail]', r); if (dl) wireText(dl, v => { i.detail = v; redraw(); });
      const o = $('[data-f=owner]', r); if (o) o.onclick = () => ownerMenu(o, i.owner, v => { i.owner = v; redraw(); });
      const d = $('[data-f=due]', r); if (d) d.onclick = () => dueMenu(d, i.due, v => { i.due = v; redraw(); });
      const q = $('[data-f=quote]', r); if (q) q.onclick = () => quoteMenu(q, i.quote, i.at);
      const g = $('[data-f=go]', r); g.onclick = () => {
        const opts = [];
        if (i.kind === 'team') { AREAS.forEach(([v, l]) => opts.push({ v: 'a:' + v, label: `Tasks · ${l}`, on: i.area === v })); opts.push('-'); }
        ORDER.filter(k => k !== i.kind && (b.brand_id || k === 'team')).forEach(k => opts.push({ v: 'k:' + k, label: KIND[k].what }));
        const others = card.brands.map((x, n) => ({ x, n })).filter(o2 => o2.x !== b).map(o2 => ({ v: 'b:' + o2.n, label: `Move to ${o2.x.brand_id ? brandName(o2.x.brand_id) : 'Agency-wide'}` }));
        const rest = (D.brands || []).filter(x => !card.brands.some(cb => cb.brand_id === x.act_id)).map(x => ({ v: 'n:' + x.act_id, label: `Move to ${x.name}` }));
        if (others.length || rest.length) opts.push('-', ...others, ...rest);
        listMenu(g, 'Goes to', opts, v => {
          if (v.startsWith('a:')) i.area = v.slice(2);
          else if (v.startsWith('k:')) { i.kind = v.slice(2); if (i.kind === 'client_owes' || i.kind === 'hear') i.owner = ''; if (i.kind === 'hear') i.due = ''; }
          else if (v.startsWith('b:')) { const to = card.brands[+v.slice(2)]; b.items.splice(b.items.indexOf(i), 1); if (!to.brand_id) i.kind = 'team'; to.items.push(i); to.open = true; }
          else if (v.startsWith('n:')) { b.items.splice(b.items.indexOf(i), 1); card.brands.push({ brand_id: v.slice(2), decisions: [], skip: false, items: [i], open: true }); }
          redraw();
        });
      };
    });
    $('[data-skip]', el).onclick = async () => {
      if (window.confirmModal && !(await window.confirmModal('Skip this call?', 'Nothing from it goes anywhere. It stays in History, where you can read it again.', 'Skip it'))) return;
      try { await post('/api/meetings/skip', { id: card.id }); delete CARDS[card.id]; if (OPEN === card.id) OPEN = null; await load(); paint(); } catch (e) { toast(e.message); }
    };
    const go = $('[data-approve]', el), err = $('[data-err]', el);
    const approve = async () => {
      if (go.disabled) return;
      if (document.activeElement && document.activeElement.isContentEditable) document.activeElement.blur();
      go.disabled = true; go.textContent = 'Sending...'; err.textContent = '';
      try {
        const body = { id: card.id, summary: card.summary, brands: card.brands.filter(b => !b.skip).map(b => ({ brand_id: b.brand_id, decisions: b.decisions,
          items: live(b).filter(i => i.kind !== 'hear').map(i => ({ kind: i.kind, text: i.text, detail: i.detail || '', owner: i.owner, due: i.due, area: i.kind === 'team' ? i.area : '' })),
          this_week: b.brand_id ? live(b).filter(i => i.kind === 'hear').map(i => i.text) : [],
          need_from_client: b.brand_id ? live(b).filter(i => i.kind === 'client_owes').map(i => i.due ? `${i.text}, by ${md(i.due)}` : i.text) : [] })) };
        const r = (await post('/api/meetings/confirm', body)).result || {};
        el.innerHTML = doneHtml(titleOf(card), r); el.classList.remove('open');
        delete CARDS[card.id]; OPEN = null;
        await load(); setTimeout(() => { if ($('#main .cl')) paint(); }, 2500);
      } catch (e) { err.textContent = e.message; go.disabled = false; go.textContent = `Approve ${liveAll(card)}`; }
    };
    go.onclick = approve;
    el.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); approve(); } });
  }

  /* ---------- Monday: the week's theme and each brand's numbers and plan ---------- */
  const agendaOn = () => { if (AGENDA !== null) return AGENDA; const d = dt(today()).getUTCDay(); return d === 1 || d === 5 || d === 6 || d === 0; };
  function readLine(b) {
    const r = b && b.report; if (!r) return '<span class="muted" style="font-size:13px">No weekly report drafted yet.</span>';
    const t = r.totals || {}, p = r.plan || {};
    const vs = (a, x, lower) => { const v = pct(a, x); if (v == null) return ''; const good = lower ? v <= 0 : v >= 0; return ` <span class="${Math.abs(v) < 3 ? '' : good ? 'up' : 'dn'}">${v > 0 ? '+' : ''}${v}% vs plan</span>`; };
    const plan = (b.thread || []).length ? `<details class="cl-plan"><summary>${esc(b.thread[0].by)}'s plan for this week</summary>${b.thread.map(x => `<div>${esc(x.text)}</div>`).join('')}</details>` : '';
    return `<span class="cl-read"><span>Last week: revenue <b>${money(t.sales)}</b>${vs(t.sales, p.sales)}</span><span>spend <b>${money(t.spend)}</b></span><span>MER <b>${t.mer != null ? (+t.mer).toFixed(2) + 'x' : '–'}</b>${vs(t.mer, p.mer)}</span><button class="cl-link" data-report="${esc(b.act_id)}" style="padding:0">Open the report</button></span>${plan}`;
  }
  function mondayHtml() {
    if (!agendaOn()) return `<p class="muted" style="font-size:12.5px;margin:0">On Mondays this page opens with the week's theme and each brand's numbers and plan. <button class="cl-link" id="clShowMon">Show them now</button></p>`;
    if (!MON) return '';
    const rank = { bad: 0, warn: 1, undefined: 2, good: 3 };
    const list = (MON.brands || []).filter(b => BR === 'all' || b.act_id === BR).sort((a, b) => (rank[SEV[a.act_id]] ?? 2) - (rank[SEV[b.act_id]] ?? 2) || brandName(a.act_id).localeCompare(brandName(b.act_id)));
    return `<section class="cl-card"><div class="cl-top"><div style="flex:1;min-width:0"><div class="cl-tt"><b>Monday ${esc(short(MON.monday))}: this week, every brand</b></div><p class="muted" style="margin:4px 0 0;font-size:13px">The theme is saved for the week and the call notes pick it up. Red brands first.</p></div><button class="cl-btn s" id="clHideMon">Hide</button></div>
      <div class="cl-theme"><textarea id="clTheme" placeholder="This week, every brand: ..." aria-label="This week's theme">${esc(MON.theme || '')}</textarea><button class="cl-btn" id="clThemeSave">Save</button></div>
      ${list.map(b => `<div class="cl-mb"><span class="cl-dot ${SEV[b.act_id] || ''}"></span><b>${esc(brandName(b.act_id))}</b>${readLine(b)}</div>`).join('')}</section>`;
  }

  /* ---------- History ---------- */
  const ST = { new: ['Reading the call', ''], confirmed: null, skipped: ['Skipped', ''], error: ['Could not read', 'bad'] };
  function madeOf(m) {
    if (m.status === 'new') return '<span class="muted">Not read yet</span>';
    if (m.status === 'error') return `<span class="muted">${esc(m.error || 'Fireflies or the reader failed')}</span>`;
    const x = m.made; if (!x) return '<span class="muted">Nothing to act on</span>';
    const bits = [[x.tasks, 'task'], [x.briefs, 'brief'], [x.asks, 'ask'], [x.report, 'report item']].filter(b => b[0]).map(([n, w]) => plural(n, w));
    return bits.length ? esc(bits.join(' · ')) : '<span class="muted">Nothing to act on</span>';
  }
  function statusOf(m) {
    if (m.status === 'confirmed') return `<span class="good">Approved${m.confirmed_by ? ` by ${esc(firstName(m.confirmed_by))}` : ''}${m.confirmed_at ? `, ${esc(short(m.confirmed_at))}` : ''}</span>`;
    const [l, c] = ST[m.status] || [m.status, '']; return `<span class="${c || 'muted'}">${esc(l)}</span>`;
  }
  function historyHtml(list) {
    if (!list.length) return '<div class="cl-empty">No other calls in the last 60 days.</div>';
    return `<div class="cl-sc"><div class="cl-hr h"><span>Date</span><span>Brand</span><span>With</span><span>Length</span><span>What it made</span><span>Status</span><span></span></div>
      ${list.map(m => `<div class="cl-hr" data-hid="${esc(m.id)}"><span>${esc(md(m.date))}</span><span class="b">${esc((m.brand_ids || []).map(brandName).join(', ') || 'Agency')}</span><span>${esc((m.with || []).map(firstName).join(', ') || 'Internal')}</span><span class="muted">${m.duration ? Math.round(m.duration) + ' min' : ''}</span><span>${madeOf(m)}</span>${statusOf(m)}<button data-hopen aria-expanded="false">Open</button></div><div class="cl-hd" data-hbody="${esc(m.id)}" hidden></div>`).join('')}</div>`;
  }
  function wireHistory(host) {
    $$('[data-hopen]', host).forEach(btn => btn.onclick = async () => {
      const id = btn.closest('.cl-hr').dataset.hid, body = $(`[data-hbody="${CSS.escape(id)}"]`, host);
      const open = body.hidden; body.hidden = !open; btn.textContent = open ? 'Close' : 'Open'; btn.setAttribute('aria-expanded', open);
      if (!open || body.dataset.loaded) return; body.dataset.loaded = '1'; body.textContent = 'Loading...';
      const m = await H.apiAH(`/api/meetings?id=${encodeURIComponent(id)}`).catch(e => ({ error: e.message }));
      if (m.error && !m.status) { body.textContent = m.error; return; }
      const again = m.status === 'skipped' || m.status === 'error';
      body.innerHTML = `${m.error ? `<p class="cl-warn">${esc(m.error)}</p>` : ''}${m.notes && m.notes.summary ? `<p>${esc(m.notes.summary)}</p>` : ''}${m.result ? doneHtml(m.title, m.result, firstName(m.confirmed_by)) : ''}<p><a href="https://app.fireflies.ai/view/${encodeURIComponent(id)}" target="_blank" rel="noopener" style="color:var(--brand)">Transcript</a></p>${again ? '<button class="cl-btn s" data-again>Read it again</button>' : ''}`;
      const a = $('[data-again]', body); if (a) a.onclick = async () => { a.disabled = true; a.textContent = 'Reading...'; try { await post('/api/meetings/ingest', { id }); await load(); paint(); } catch (e) { toast(e.message); a.disabled = false; a.textContent = 'Read it again'; } };
    });
  }

  /* ---------- the page ---------- */
  const inBrand = m => BR === 'all' || (m.notes ? (m.notes.brands || []).some(b => b.brand_id === BR) : (m.brand_ids || []).includes(BR));
  async function load() {
    const meet = await H.apiAH('/api/meetings?open=0');
    const pend = (meet.meetings || []).filter(m => m.status === 'extracted').slice(0, 8);
    const full = await Promise.all(pend.map(m => H.apiAH(`/api/meetings?id=${encodeURIComponent(m.id)}`).catch(() => null)));
    D = { meetings: meet.meetings || [], pending: full.filter(m => m && m.notes), today: meet.today, connected: meet.connected, brands: meet.brands || [], team: Object.keys(HUE) };
    for (const m of D.pending) if (!CARDS[m.id]) CARDS[m.id] = modelOf(m);
    for (const id of Object.keys(CARDS)) if (!D.pending.some(m => m.id === id)) delete CARDS[id];
  }
  async function loadMonday() {
    try {
      const [m, cmd] = await Promise.all([H.apiAH('/api/meetings/monday'), H.api('/api/hub/command').catch(() => null)]);
      MON = m && m.monday ? m : null; SEV = {};
      if (cmd && Array.isArray(cmd.brands)) for (const b of cmd.brands) SEV[b.act_id] = b.paused ? undefined : (b.reasons || []).reduce((w, r) => r.sev === 'bad' ? 'bad' : (w === 'bad' ? w : r.sev === 'warn' ? 'warn' : w), 'good');
    } catch { MON = null; }
  }
  /* 2026-10-19: the call screens (callscreen.js). The Monday agenda block that sat here is the Monday call screen now. */
  function runHtml() {
    const card = (k, title, cap) => `<button type="button" class="cl-run-b" data-run="${k}"><b>${title}</b><span>${cap}</span></button>`;
    return `<section class="cl-run"><div class="cl-st" style="margin:0 0 8px"><b>Run a call</b></div>
      <div class="cl-run-g">${card('monday', 'Monday call', 'Every brand, red first')}${card('client', 'Client call', 'One brand, the client watching')}${card('kickoff', 'Creative kickoff', 'Each brief with the design team')}</div></section>`;
  }
  const head = () => H.pageHead ? H.pageHead('calls', 'Meetings') : '<div class="ph"><div><div class="ph-t">Meetings</div></div><div class="ph-r"><span class="ph-acts"></span></div></div>';
  const acts = html => { if (typeof window.pageActions === 'function') window.pageActions(html); };
  function paint() {
    closePop();
    const pend = D.pending.filter(inBrand), hist = D.meetings.filter(m => m.status !== 'extracted').filter(inBrand);
    if (!OPEN || !pend.some(m => m.id === OPEN)) OPEN = pend.length ? pend[0].id : null;
    const ordered = [...pend.filter(m => m.id === OPEN), ...pend.filter(m => m.id !== OPEN)];
    const bname = BR === 'all' ? 'All brands' : brandName(BR);
    $('#main').innerHTML = `${head()}<div class="v2 cl">
      ${runHtml()}
      <div class="cl-st"><b>Waiting on your OK</b><span class="cl-tag warn">${pend.length}</span><span class="muted" style="font-size:12px">Untick what was not agreed. Maybe rows start unticked.</span></div>
      ${pend.length ? ordered.map(m => `<div data-slot="${esc(m.id)}"></div>`).join('') : `<section class="cl-card"><div class="cl-empty">${D.connected ? 'Nothing waiting.' : 'Connect Fireflies to read calls.'}</div></section>`}
      <div class="cl-st" style="margin-top:6px"><b>History</b><span class="muted" style="font-size:12px">What each meeting turned into</span><span style="flex:1"></span>${D.connected ? '<button class="cl-link" id="clPoll">Check Fireflies now</button>' : ''}</div>
      <section class="cl-card" id="clHist">${historyHtml(hist)}</section>
    </div>`;
    acts(`<button type="button" class="cl-menu" id="clBrand"><span>Brand</span> ${esc(bname)} ${ICON.chev}</button>`);
    for (const m of ordered) {
      const slot = $(`[data-slot="${CSS.escape(m.id)}"]`), card = CARDS[m.id];
      slot.innerHTML = m.id === OPEN ? cardHtml(card) : oneHtml(m);
      const el = slot.firstElementChild; slot.replaceWith(el);
      if (m.id === OPEN) wireCard(el, card);
      else $('[data-review]', el).onclick = () => { OPEN = m.id; paint(); const c = $(`.cl-card.open[data-mid="${CSS.escape(m.id)}"]`); if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
    }
    wireHistory($('#clHist'));
    $$('[data-run]').forEach(x => x.onclick = () => {
      /* A client call switches Locus to that client first (Home > Client call), so the shared screen shows only its pages. */
      if (x.dataset.run === 'client' && window.LocusPick) {
        if (BR !== 'all') return window.LocusPick(BR, 'ccall');
        return listMenu(x, 'Which client is on the call?', ((D.brands && D.brands.length ? D.brands : H.S.accounts) || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map(b => ({ v: b.act_id, label: b.name })), v => window.LocusPick(v, 'ccall'));
      }
      if (window.CallScreen) window.CallScreen.open(H, x.dataset.run, x.dataset.run === 'client' ? (BR !== 'all' ? BR : '') : ''); else toast('The call screen did not load. Hard-refresh (Ctrl+Shift+R).');
    });
    const b = $('#clBrand'); if (b) b.onclick = () => listMenu(b, 'Brand', [{ v: 'all', label: 'All brands', on: BR === 'all' }, ...(D.brands || []).map(x => ({ v: x.act_id, label: x.name, on: BR === x.act_id }))], v => { BR = v; paint(); });
    const poll = $('#clPoll'); if (poll) poll.onclick = async () => { poll.disabled = true; poll.textContent = 'Checking...'; try { const r = await post('/api/meetings/poll', {}); await load(); paint(); toast(r.read && r.read.length ? `Read ${plural(r.read.length, 'new call')}.` : r.errors && r.errors.length ? `Fireflies: ${r.errors[0].error}` : 'Nothing new on Fireflies.'); } catch (e) { toast(e.message); poll.disabled = false; poll.textContent = 'Check Fireflies now'; } };
    const sm = $('#clShowMon'); if (sm) sm.onclick = async () => { AGENDA = true; sm.disabled = true; if (!MON) await loadMonday(); paint(); };
    const hm = $('#clHideMon'); if (hm) hm.onclick = () => { AGENDA = false; paint(); };
    const ts = $('#clThemeSave'); if (ts) ts.onclick = async () => { ts.disabled = true; try { await post('/api/meetings/theme', { text: $('#clTheme').value }); toast('Saved for this week.'); } catch (e) { toast(e.message); } ts.disabled = false; };
    $$('[data-report]').forEach(x => x.onclick = () => { const s = document.getElementById('clientPick'); if (s && H.S.act !== x.dataset.report) { s.value = x.dataset.report; s.dispatchEvent(new Event('change')); } H.show('reports'); });
    const want = window.ACT_MEETING || new URLSearchParams(location.search).get('meeting'); window.ACT_MEETING = null;
    if (want) {
      try { const u = new URL(location.href); u.searchParams.delete('meeting'); history.replaceState(null, '', u); } catch {}
      if (D.pending.some(m => m.id === want) && OPEN !== want) { OPEN = want; BR = 'all'; paint(); }
      const c = $(`.cl-card.open[data-mid="${CSS.escape(want)}"]`);
      if (c) { c.classList.add('ring'); c.scrollIntoView({ block: 'start' }); setTimeout(() => c.classList.remove('ring'), 2500); }
      else { const btn = $(`.cl-hr[data-hid="${CSS.escape(want)}"] [data-hopen]`); if (btn) { btn.click(); btn.scrollIntoView({ block: 'center' }); } }
    }
  }
  async function render(host, first) {
    if (window.ProdSheet && !(host.S && host.S.client)) await window.ProdSheet.photos(host).catch(() => {});
    H = host; css(); BR = H.S.act || 'all';
    const t = H.RUN();
    if (first || !D) { $('#main').innerHTML = `${head()}<div class="v2 cl"><section class="cl-card"><div class="cl-empty">Loading</div></section></div>`; acts(''); }
    const run = new URLSearchParams(location.search).get('call') || window.CALL_OPEN; window.CALL_OPEN = null;
    if (run && window.CallScreen) { try { const u = new URL(location.href); u.searchParams.delete('call'); history.replaceState(null, '', u); } catch {} return window.CallScreen.open(H, run, H.S.act && H.S.act !== 'all' ? H.S.act : ''); }
    try { await load(); }
    catch (e) { if (t === H.RUN()) { $('#main').innerHTML = `${head()}<div class="v2 cl"><section class="cl-card"><div class="cl-empty" style="color:var(--bad)">${esc(e.message)}</div></section></div>`; acts(''); } return; }
    if (t !== H.RUN()) return;
    paint();
  }
  window.CallsTab = { render };
})();
