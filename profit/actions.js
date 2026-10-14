/* ACTION ITEMS (2026-10-13, third pass: the approved mock, audited against Linear's triage, Asana's My Tasks, Todoist's
 * quick add and Fathom / Granola's meeting action items). ONE page, team only (AGENCY_TABS); old ids calls / monday /
 * meetings route here.
 *
 *   To approve   one card per call Locus read. Per brand (a block you fold; the Monday call has many), the items sit in
 *                labelled sections with column headers: Mobius does (jobs, on the list, Slack reminds the owner), New ads
 *                (each becomes a numbered brief in the brand's Asana Creative Brief column), Client does (an ask in the
 *                client's Requests, and the report's "What we need from you"), and Client reads (the report's "This week"
 *                lines, word for word). Owner and due open Locus's own menus (never the browser's). Each item carries the
 *                words from the call that created it (the quote button). Items with no owner or no date are flagged. The
 *                ⋯ menu moves an item to another section or brand, or leaves it out. One line of destinations above the
 *                button counts what approving does; Ctrl+Enter approves.
 *   The list     quick add that reads "Ahsan pause Retarget for Grunk friday" into owner, brand and date as you type;
 *                views Everyone / Mine / Late / Briefs; group by Brand / Due / Person; per row tick, words, owner and
 *                due edited in place; Waiting on the client from the Requests asks; Monday numbers per brand on Mondays.
 *   Done, Past calls  folded at the bottom.
 * Engine: account-health actions.js (/api/actions: items + waiting) + meetings.js (/api/meetings, /confirm, /skip,
 * /ingest, /poll, /monday, /theme). Classic script, own closure; the host hands in S, api, apiAH, show, pageHead, RUN.
 * Exports window.ActionsTab = { render(host, first) }.
 */
(() => {
  let H = null;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ROLE = { Cole: 'Owner', Ahsan: 'Strategist', Noma: 'Strategist', William: 'Designer', Ravo: 'Video', Radhesh: 'Google', Hamza: 'Amazon' };
  const HUE = { Cole: 'var(--brand)', Ahsan: 'var(--c-tiktok)', Noma: 'var(--c-email)', William: 'var(--c-google)', Ravo: 'var(--c-else)', Radhesh: 'var(--c-meta)', Hamza: 'var(--c-amazon)', Mobius: 'var(--muted)' }; /* never good / warn / bad: those mean status */
  const SEC = {
    team: { title: 'Mobius does', mark: 'M', c: 'good', sub: 'Jobs for our team. On the list; Slack reminds the owner the morning it is due.', cols: ['Job', 'Owner', 'Due'], add: 'Add a job' },
    brief: { title: 'New ads', mark: 'A', c: 'brand', sub: 'Each becomes a numbered brief in the brand’s Asana, Creative Brief column, with our template.', cols: ['What to make', 'Writes the brief', 'Brief due'], add: 'Add new ads' },
    client_owes: { title: 'Client does', mark: 'C', c: 'warn', sub: 'Shows in the client’s Requests (with a Done button) and in the report under What we need from you.', cols: ['What we need', 'Who', 'Needed by'], add: 'Add an ask' },
  };
  const ORDER = ['team', 'brief', 'client_owes'];
  const dt = iso => new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  const md = iso => iso ? dt(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const short = iso => iso ? dt(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const addDays = (iso, n) => { const d = dt(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const money = n => n == null ? '–' : '$' + (Math.abs(n) >= 10000 ? Math.round(n / 1000) + 'K' : Math.round(n).toLocaleString('en-US'));
  const pct = (a, b) => (a == null || !b) ? null : Math.round((a / b - 1) * 100);
  const firstName = s => String(s || '').split(/[@\s]/)[0].replace(/^./, c => c.toUpperCase());
  let D = null, MON = null, SEV = {}, DONE = null, CARDS = {};
  let VIEW = 'all', GROUP = 'brand', WHO = 'all', AGENDA = null;
  try { GROUP = localStorage.getItem('ai_group') || 'brand'; } catch {}

  /* ---------- look (tokens only) ---------- */
  function css() {
    if (document.getElementById('aicss')) return;
    const st = document.createElement('style'); st.id = 'aicss';
    st.textContent = `
      .ai{max-width:1120px}
      .ai .ai-sec{display:flex;align-items:baseline;gap:4px 10px;margin:28px 0 12px;flex-wrap:wrap}
      .ai .ai-sec h2{font-size:16px;font-weight:650;margin:0;white-space:nowrap}
      .ai .ai-sec small{color:var(--muted);font-size:13px}
      .ai .sp{flex:1}
      .ai .ai-card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:24px 28px;margin:0 0 14px}
      .ai .ai-card.ring{box-shadow:0 0 0 2px var(--brand)}
      .ai .ai-ch{display:flex;gap:14px;align-items:flex-start}
      .ai .ai-ch h3{margin:0;font-size:18px;font-weight:650}
      .ai .ai-ch small{display:block;color:var(--muted);font-size:13px;margin:4px 0 0}
      .ai .ai-lbl{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
      .ai .ai-sum{font-size:15px;line-height:1.65;color:var(--ink);opacity:.9;margin:8px 0 0;padding:2px 6px;margin-left:-6px;border-radius:6px}
      .ai [contenteditable]{outline:none;border-radius:6px;cursor:text}
      .ai [contenteditable]:hover{background:var(--surface-2)}
      .ai [contenteditable]:focus{background:var(--surface-2);box-shadow:0 0 0 1px var(--line-strong)}
      .ai .ai-flag{display:inline-flex;align-items:center;gap:8px;margin:14px 0 0;padding:8px 12px;border-radius:10px;background:color-mix(in srgb,var(--warn) 13%,transparent);color:var(--warn);font-size:13px}
      .ai .ai-brand{border-top:1px solid var(--line);margin:18px 0 0}
      .ai .ai-bh{display:flex;align-items:center;gap:10px;width:100%;padding:14px 0 6px;background:none;border:0;color:var(--ink);font:inherit;cursor:pointer;text-align:left}
      .ai .ai-bh b{font-size:15px;font-weight:650}
      .ai .ai-bh small{color:var(--muted);font-size:13px}
      .ai .ai-bh .chev{transition:transform .15s;color:var(--muted)}
      .ai .ai-brand.shut .ai-bh .chev{transform:rotate(-90deg)}
      .ai .ai-brand.shut .ai-bb{display:none}
      .ai .ai-brand.out .ai-bh b,.ai .ai-brand.out .ai-bh small{text-decoration:line-through;color:var(--muted)}
      .ai .ai-link{background:none;border:0;color:var(--muted);font:inherit;font-size:13px;cursor:pointer;padding:4px 2px;white-space:nowrap}
      .ai .ai-link:hover{color:var(--ink)}
      .ai .ai-dec{margin:4px 0 6px;padding:0 0 0 18px;font-size:14px;line-height:1.55;color:var(--ink-2)}
      .ai .ai-s{margin:14px 0 0}
      .ai .ai-sh{display:flex;align-items:center;gap:10px}
      .ai .ai-sh b{font-size:14.5px;font-weight:650}
      .ai .ai-sh small{color:var(--muted);font-size:12.5px}
      .ai .ai-mark{width:24px;height:24px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex:none}
      .ai .ai-mark.good{background:color-mix(in srgb,var(--good) 15%,transparent);color:var(--good)}
      .ai .ai-mark.brand{background:var(--brand-soft);color:var(--brand)}
      .ai .ai-mark.warn{background:color-mix(in srgb,var(--warn) 15%,transparent);color:var(--warn)}
      .ai .ai-ssub{font-size:12.5px;color:var(--muted);margin:2px 0 8px 34px}
      .ai .ai-grid{display:grid;grid-template-columns:minmax(0,1fr) 172px 150px 76px;gap:12px;align-items:center}
      .ai .ai-cols{padding:0 0 6px 34px;font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--faint,var(--muted))}
      .ai .ai-row{min-height:50px;border-top:1px solid var(--line);padding:5px 0 5px 34px}
      .ai .ai-row .t{font-size:14.5px;line-height:1.45;padding:3px 6px;margin-left:-6px}
      .ai .ai-row.off .t{text-decoration:line-through;color:var(--muted)}
      .ai .ai-row.off .ai-chip{opacity:.45}
      .ai .ai-acts{display:flex;justify-content:flex-end;gap:2px}
      .ai .ai-chip{height:34px;max-width:100%;padding:0 12px 0 6px;border-radius:999px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--ink);font:inherit;font-size:13.5px;display:inline-flex;align-items:center;gap:8px;cursor:pointer;white-space:nowrap;overflow:hidden}
      .ai .ai-chip.date{padding:0 12px}
      .ai .ai-chip:hover{border-color:var(--muted)}
      .ai .ai-chip.need{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 55%,transparent);border-style:dashed}
      .ai .ai-chip.late{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 55%,transparent)}
      .ai .ai-chip.now{color:var(--warn)}
      .ai .ai-chip.plain{border-color:transparent;background:transparent;cursor:default;color:var(--ink-2)}
      .ai .ai-av{width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#131316;flex:none}
      .ai .ai-ib{width:34px;height:34px;border-radius:8px;border:0;background:transparent;color:var(--muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
      .ai .ai-ib:hover{background:var(--surface-2);color:var(--ink)}
      .ai .ai-ib[disabled]{opacity:.25;cursor:default;background:transparent}
      .ai .ai-add{background:none;border:0;color:var(--muted);font:inherit;font-size:13px;cursor:pointer;padding:8px 0 0 34px}
      .ai .ai-add:hover{color:var(--ink)}
      .ai .ai-quote{margin:14px 0 0 34px;padding:14px 18px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line)}
      .ai .ai-quote ul{list-style:none;margin:6px 0 0;padding:0}
      .ai .ai-quote li{display:flex;gap:8px;align-items:flex-start;font-size:14.5px;line-height:1.5;padding:2px 0}
      .ai .ai-quote li::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--muted);margin:10px 4px 0 2px;flex:none}
      .ai .ai-quote li .t{flex:1;padding:1px 6px;margin-left:-6px}
      .ai .ai-quote .note{font-size:12.5px;color:var(--muted);margin:4px 0 0}
      .ai .ai-dest{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0 0;padding:14px 16px;border-radius:12px;background:var(--surface-2)}
      .ai .ai-dest .ai-lbl{width:100%;margin:0 0 2px}
      .ai .ai-d{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:999px;background:var(--surface);border:1px solid var(--line);font-size:13px;color:var(--ink)}
      .ai .ai-d b{font-weight:650}
      .ai .ai-foot{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:16px 0 0}
      .ai .ai-foot small{color:var(--muted);font-size:12.5px}
      .ai .ai-err{color:var(--bad);font-size:13px}
      .ai .ai-ok{font-size:14px;line-height:1.6}
      .ai .ai-ok ul{margin:6px 0 0;padding:0 0 0 18px}
      .ai .ai-warn{color:var(--warn);font-size:13px;margin:6px 0 0}
      .ai .ai-qa{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:10px 12px}
      .ai .ai-qa input{flex:1 1 320px;min-width:0;font:inherit;font-size:14.5px;border:0;background:transparent;color:var(--ink);padding:8px 6px;outline:none}
      .ai .ai-qa .hint{width:100%;font-size:12px;color:var(--muted);padding:0 6px}
      .ai .ai-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:14px 0 12px}
      .ai .ai-seg{display:inline-flex;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:3px}
      .ai .ai-seg button{height:30px;padding:0 12px;border:0;border-radius:7px;background:transparent;color:var(--ink-2);font:inherit;font-size:13px;cursor:pointer}
      .ai .ai-seg button.on{background:var(--surface-2);color:var(--ink);box-shadow:0 0 0 1px var(--line-strong)}
      .ai .ai-menu{height:36px;padding:0 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
      .ai .ai-menu span{color:var(--muted)}
      .ai .ai-group{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px 20px 10px;margin:0 0 12px}
      .ai .ai-gh{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin:0 0 6px}
      .ai .ai-gh h3{margin:0;font-size:15px;font-weight:650}
      .ai .ai-gh small{color:var(--muted);font-size:12.5px}
      .ai .ai-dot{width:9px;height:9px;border-radius:50%;background:var(--muted);display:inline-block}
      .ai .ai-dot.bad{background:var(--bad)}.ai .ai-dot.warn{background:var(--warn)}.ai .ai-dot.good{background:var(--good)}
      .ai .ai-read{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--ink-2);padding:4px 0 6px}
      .ai .ai-read b{color:var(--ink);font-weight:650}
      .ai .ai-read .up{color:var(--good)}.ai .ai-read .dn{color:var(--bad)}
      .ai details.ai-plan{margin:0 0 8px}
      .ai details.ai-plan summary{cursor:pointer;font-size:13px;color:var(--muted)}
      .ai details.ai-plan div{white-space:pre-wrap;font-size:13.5px;line-height:1.55;padding:8px 12px;margin:6px 0 0;background:var(--surface-2);border-radius:8px}
      .ai .ai-lgrid{display:grid;grid-template-columns:24px minmax(0,1fr) auto 160px 140px 34px;gap:12px;align-items:center}
      .ai .ai-lcols{padding:4px 0 6px;font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--faint,var(--muted))}
      .ai .ai-li{min-height:50px;border-top:1px solid var(--line);padding:5px 0}
      .ai .ai-li.hi{background:var(--brand-soft);border-radius:8px}
      .ai .ai-li .t{font-size:14.5px;line-height:1.45;padding:2px 6px;margin-left:-6px}
      .ai .ai-li .m{font-size:12px;color:var(--muted);margin:2px 0 0}
      .ai .ai-li.done .t{text-decoration:line-through;color:var(--muted)}
      .ai .ai-tick{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--line-strong);background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:transparent;padding:0}
      .ai .ai-tick:hover{border-color:var(--good);color:var(--good)}
      .ai .ai-li.done .ai-tick{background:var(--good);border-color:var(--good);color:var(--surface)}
      .ai .ai-kind{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;text-decoration:none}
      .ai .ai-kind.brief{background:var(--brand-soft);color:var(--brand)}
      .ai .ai-wait{margin:8px 0 6px;padding:10px 14px;border-radius:10px;background:color-mix(in srgb,var(--warn) 8%,transparent)}
      .ai .ai-wait .ai-lbl{color:var(--warn);margin:0 0 4px}
      .ai .ai-wait div.w{display:flex;gap:12px;font-size:13.5px;padding:3px 0}
      .ai .ai-wait div.w span:first-child{flex:1}
      .ai .ai-wait .ok{color:var(--good)}
      .ai .ai-theme{display:flex;gap:8px;align-items:flex-start;margin:10px 0 0}
      .ai .ai-theme textarea{flex:1;min-height:44px;font:inherit;font-size:14px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);color:var(--ink);resize:vertical}
      .ai details.ai-fold{margin:18px 0 0}
      .ai details.ai-fold > summary{cursor:pointer;font-size:13.5px;color:var(--muted);padding:6px 0}
      .ai .ai-call{border-top:1px solid var(--line);padding:10px 0}
      .ai .ai-call summary{display:flex;gap:10px;align-items:center;cursor:pointer;list-style:none;font-size:14px}
      .ai .ai-call summary::-webkit-details-marker{display:none}
      .ai .ai-call summary small{color:var(--muted);font-size:12.5px}
      .ai .ai-call .body{padding:8px 0 4px 2px;font-size:13.5px;line-height:1.55;color:var(--ink-2)}
      .ai .ai-st{font-size:11.5px;padding:3px 8px;border-radius:999px;background:var(--surface-2);color:var(--muted)}
      .ai .ai-st.good{color:var(--good)}.ai .ai-st.bad{color:var(--bad)}.ai .ai-st.warn{color:var(--warn)}
      .ai .ai-empty{color:var(--muted);font-size:14px;padding:10px 0}
      .ai-pop{position:fixed;z-index:9000;min-width:220px;max-width:320px;max-height:420px;overflow:auto;background:var(--surface-2);border:1px solid var(--line-strong);border-radius:12px;padding:6px;box-shadow:0 18px 44px rgba(0,0,0,.35);font-family:inherit;color:var(--ink)}
      .ai-pop .h{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);padding:7px 9px 5px}
      .ai-pop button.o{width:100%;height:36px;border:0;border-radius:8px;background:transparent;color:var(--ink);font:inherit;font-size:13.5px;display:flex;align-items:center;gap:10px;padding:0 9px;cursor:pointer;text-align:left}
      .ai-pop button.o:hover,.ai-pop button.o.on{background:var(--brand-soft)}
      .ai-pop button.o small{margin-left:auto;color:var(--muted);font-size:12px}
      .ai-pop button.o.danger{color:var(--bad)}
      .ai-pop hr{border:0;border-top:1px solid var(--line-strong);margin:5px 2px}
      .ai-pop .ai-av{width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#131316;flex:none}
      .ai-pop .cal{padding:4px 4px 2px}
      .ai-pop .cal .mh{display:flex;align-items:center;justify-content:space-between;font-size:12.5px;color:var(--ink-2);padding:2px 4px 6px}
      .ai-pop .cal .mh button{border:0;background:transparent;color:var(--muted);cursor:pointer;width:28px;height:28px;border-radius:6px;font-size:15px}
      .ai-pop .cal .mh button:hover{background:var(--brand-soft);color:var(--ink)}
      .ai-pop .cal .g{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
      .ai-pop .cal .g span{font-size:10.5px;color:var(--muted);padding:2px 0}
      .ai-pop .cal .g button{height:32px;border:0;border-radius:7px;background:transparent;color:var(--ink);font:inherit;font-size:12.5px;cursor:pointer}
      .ai-pop .cal .g button:hover{background:var(--brand-soft)}
      .ai-pop .cal .g button.past{color:var(--muted)}
      .ai-pop .cal .g button.today{box-shadow:inset 0 0 0 1px var(--line-strong)}
      .ai-pop .cal .g button.on{background:var(--brand);color:#10131A}
      .ai-pop blockquote{margin:6px 8px 8px;font-size:13.5px;line-height:1.55;color:var(--ink)}
      .ai-pop .at{font-size:12px;color:var(--muted);padding:0 8px 6px}
      @media (max-width:760px){.ai .ai-grid{grid-template-columns:1fr 1fr}.ai .ai-grid > .t{grid-column:1/-1}.ai .ai-cols{display:none}.ai .ai-row{padding-left:0}.ai .ai-ssub,.ai .ai-quote,.ai .ai-add{margin-left:0;padding-left:0}
        .ai .ai-lgrid{grid-template-columns:24px 1fr 1fr}.ai .ai-lgrid > .tc{grid-column:2/-1}.ai .ai-lcols{display:none}.ai .ai-card{padding:18px}}
    `;
    document.head.appendChild(st);
  }

  /* ---------- small helpers ---------- */
  const post = (path, body) => H.apiAH(path, { method: 'POST', body: JSON.stringify(body) });
  const toast = msg => { const t = document.createElement('div'); t.setAttribute('role', 'status'); t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));background:var(--ink);color:var(--surface);padding:10px 16px;border-radius:12px;font-size:13.5px;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,.25)'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 4500); };
  const brandName = id => id ? ((D.brands.find(b => b.act_id === id) || {}).name || id) : 'Agency-wide';
  const today = () => D.today || new Date().toISOString().slice(0, 10);
  const av = n => n ? `<span class="ai-av" style="background:${HUE[n] || 'var(--line-strong)'}">${esc(n[0])}</span>` : '<span class="ai-av" style="background:var(--line-strong);color:var(--ink)">?</span>';
  const ICON = {
    chev: '<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    cal: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    more: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
    quote: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6"/></svg>',
    check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  };
  function dueChip(due, attrs = '', open = true) {
    const t = today();
    if (!due) return `<button class="ai-chip date need" ${attrs}>${ICON.cal}<span>Add a date</span></button>`;
    const cls = !open ? '' : due < t ? ' late' : due === t ? ' now' : '';
    const label = due === t ? 'Today' : due === addDays(t, 1) ? 'Tomorrow' : md(due);
    return `<button class="ai-chip date${cls}" ${attrs}>${ICON.cal}<span>${esc(label)}${cls === ' late' ? ', late' : ''}</span></button>`;
  }
  const ownerChip = (o, attrs = '') => o ? `<button class="ai-chip" ${attrs}>${av(o)}<span>${esc(o)}</span></button>` : `<button class="ai-chip need" ${attrs}>${av('')}<span>Needs an owner</span></button>`;

  /* ---------- Locus's own menus (never the browser's select) ---------- */
  let POP = null;
  function closePop() { if (!POP) return; POP.el.remove(); document.removeEventListener('mousedown', POP.out, true); document.removeEventListener('keydown', POP.key, true); POP = null; }
  function pop(anchor, html, wire) {
    closePop();
    const el = document.createElement('div'); el.className = 'ai-pop'; el.setAttribute('role', 'menu'); el.innerHTML = html;
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

  /* ================= TO APPROVE ================= */
  let UID = 0;
  function modelOf(m) {
    const n = m.notes || { brands: [] };
    const brands = [...n.brands].sort((a, b) => (a.brand_id ? 1 : 0) - (b.brand_id ? 1 : 0)).map(b => ({
      brand_id: b.brand_id, decisions: b.decisions || [], skip: false,
      items: b.items.filter(i => i.kind !== 'client').map(i => ({ uid: ++UID, kind: ['team', 'brief', 'client_owes'].includes(i.kind) ? i.kind : 'team', text: i.text, owner: i.kind === 'client_owes' ? '' : (i.owner || ''), due: i.due || '', quote: i.quote || '', at: i.at || '', off: false })),
      hear: b.brand_id ? [...new Set([...(b.this_week || []), ...b.items.filter(i => i.kind === 'client').map(i => i.text)])] : [],
    }));
    const many = brands.length > 3;
    brands.forEach(b => { b.open = !many || b.items.some(i => (i.kind !== 'client_owes' && !i.owner) || !i.due); });
    return { id: m.id, title: m.title, date: m.date, duration: m.duration, attendees: m.attendees || [], summary: n.summary || '', brands };
  }
  const live = b => b.skip ? [] : b.items.filter(i => !i.off && i.text);
  function counts(b) {
    const it = live(b), c = k => it.filter(i => i.kind === k).length;
    const bits = [[c('team'), 'job'], [c('brief'), 'new ad brief'], [c('client_owes'), 'ask'], [b.skip ? 0 : b.hear.length, 'report line']].filter(x => x[0]).map(([n, w]) => `${n} ${w}${n === 1 ? '' : 's'}`);
    return bits.join(' · ') || 'nothing to send';
  }
  const flagsOf = card => { let o = 0, d = 0; for (const b of card.brands) for (const i of live(b)) { if (i.kind !== 'client_owes' && !i.owner) o++; if (!i.due) d++; } return { o, d }; };
  function cardHtml(card) {
    const who = card.attendees.map(a => a.displayName || a.email).filter(Boolean);
    const act = H.S.act || 'all';
    return `<article class="ai-card" data-mid="${esc(card.id)}" tabindex="-1">
      <div class="ai-ch"><div style="flex:1;min-width:0"><h3>${esc(card.title || 'Untitled call')}</h3><small>${esc(md(card.date))}${card.duration ? ` · ${Math.round(card.duration)} min` : ''}${who.length ? ` · ${esc(who.slice(0, 6).join(', '))}${who.length > 6 ? ` +${who.length - 6}` : ''}` : ''} · read from Fireflies</small></div>
        <button class="btn quiet" data-skip>Skip this call</button></div>
      <div class="ai-lbl" style="margin-top:18px">Summary</div>
      <p class="ai-sum" data-sum>${esc(card.summary)}</p>
      <div data-flag></div>
      ${card.brands.map((b, bi) => (act !== 'all' && b.brand_id && b.brand_id !== act) ? '' : brandHtml(card, b, bi)).join('')}
      <div class="ai-dest" data-dest></div>
      <div class="ai-foot"><button class="btn primary" data-approve style="height:42px;padding:0 20px">Approve and send</button><small>Ctrl+Enter · nothing reaches a client or Asana until you press it</small><span class="ai-err" data-err></span></div>
    </article>`;
  }
  function brandHtml(card, b, bi) {
    const nm = b.brand_id ? brandName(b.brand_id) : 'Everyone (agency-wide)';
    const secs = ORDER.filter(k => b.brand_id || k === 'team');
    return `<section class="ai-brand${b.open ? '' : ' shut'}${b.skip ? ' out' : ''}" data-bi="${bi}">
      <div style="display:flex;align-items:center;gap:8px"><button class="ai-bh" data-toggle aria-expanded="${b.open}">${ICON.chev}<b>${esc(nm)}</b><small data-count>${esc(counts(b))}</small></button>
        <button class="ai-link" data-skipbrand>${b.skip ? 'Put this brand back' : 'Leave this brand out'}</button></div>
      <div class="ai-bb">
        ${b.decisions.length ? `<div class="ai-lbl" style="margin:6px 0 0">Decided</div><ul class="ai-dec">${b.decisions.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${secs.map(k => secHtml(b, k)).join('')}
        ${b.brand_id ? `<div class="ai-quote"><div class="ai-lbl">${esc(nm)} reads this in Monday's weekly report</div>
          <div style="font-size:13px;font-weight:650;margin:10px 0 0">This week</div><ul data-hear>${b.hear.map(x => `<li><span class="t">${esc(x)}</span><button class="ai-ib" data-xl aria-label="Remove this line" title="Remove">×</button></li>`).join('')}</ul>
          <button class="ai-link" data-addline style="padding-left:0">+ Add a line</button>
          <div style="font-size:13px;font-weight:650;margin:10px 0 0">What we need from you</div><ul data-need>${b.items.filter(i => i.kind === 'client_owes' && !i.off).map(i => `<li><span>${esc(i.text)}${i.due ? `, by ${esc(md(i.due))}` : ''}</span></li>`).join('') || '<li style="color:var(--muted)">Nothing this week.</li>'}</ul>
          <div class="note">Filled from Client does above, so it is never typed twice.</div></div>` : ''}
      </div>
    </section>`;
  }
  function secHtml(b, k) {
    const s = SEC[k], rows = b.items.filter(i => i.kind === k);
    if (!rows.length) return `<div class="ai-s"><button class="ai-add" data-add="${k}" style="padding-left:0"><span class="ai-mark ${s.c}" style="width:20px;height:20px;font-size:11px;display:inline-flex;margin-right:8px;vertical-align:middle">${s.mark}</span>${esc(s.add)}</button></div>`;
    return `<div class="ai-s" data-k="${k}">
      <div class="ai-sh"><span class="ai-mark ${s.c}">${s.mark}</span><b>${esc(s.title)}</b><small>${rows.filter(i => !i.off).length}</small></div>
      <div class="ai-ssub">${esc(s.sub)}</div>
      <div class="ai-grid ai-cols"><div>${s.cols[0]}</div><div>${s.cols[1]}</div><div>${s.cols[2]}</div><div></div></div>
      ${rows.map(i => `<div class="ai-grid ai-row${i.off ? ' off' : ''}" data-uid="${i.uid}">
        <div class="t" data-f="text">${esc(i.text)}</div>
        <div>${k === 'client_owes' ? '<span class="ai-chip plain">The client</span>' : ownerChip(i.owner, 'data-f="owner" aria-label="Change the owner"')}</div>
        <div>${dueChip(i.due, 'data-f="due" aria-label="Change the date"')}</div>
        <div class="ai-acts"><button class="ai-ib" data-f="quote" ${i.quote ? '' : 'disabled'} aria-label="What was said on the call" title="${i.quote ? 'What was said on the call' : 'No quote for this one'}">${ICON.quote}</button><button class="ai-ib" data-f="more" aria-label="More for this item" title="Move or leave out">${ICON.more}</button></div>
      </div>`).join('')}
      <button class="ai-add" data-add="${k}">+ ${esc(s.add)}</button>
    </div>`;
  }
  function destHtml(card) {
    let team = 0, briefs = 0, asks = 0, lines = 0, notes = 0; const own = {}, briefBrands = new Set(), askBrands = new Set();
    for (const b of card.brands) {
      const it = live(b); if (!it.length && (b.skip || !b.hear.length) && !b.decisions.length) continue;
      if (!b.skip) notes++;
      for (const i of it) { if (i.kind === 'team') { team++; own[i.owner || 'nobody'] = (own[i.owner || 'nobody'] || 0) + 1; } if (i.kind === 'brief') { briefs++; if (b.brand_id) briefBrands.add(brandName(b.brand_id)); } if (i.kind === 'client_owes' && b.brand_id) { asks++; askBrands.add(brandName(b.brand_id)); } }
      if (b.brand_id && !b.skip) lines += b.hear.length + it.filter(i => i.kind === 'client_owes').length;
    }
    const d = [];
    if (team) d.push(`<span class="ai-d" title="On the Action items list. Slack reminds each owner the morning it is due."><b>${team}</b> job${team === 1 ? '' : 's'} on the list</span>`);
    if (briefs) d.push(`<span class="ai-d" title="Numbered briefs in ${esc([...briefBrands].join(', ') || 'Asana')}, Creative Brief column, with the template, owner and due date. Each is on the list too."><b>${briefs}</b> brief${briefs === 1 ? '' : 's'} to Asana</span>`);
    if (asks) d.push(`<span class="ai-d" title="In ${esc([...askBrands].join(', '))}'s Requests in Locus, with a Done button."><b>${asks}</b> ask${asks === 1 ? '' : 's'} to the client</span>`);
    if (lines) d.push(`<span class="ai-d" title="Into the open weekly report draft. They go out when the report is sent."><b>${lines}</b> report line${lines === 1 ? '' : 's'}</span>`);
    if (notes) d.push(`<span class="ai-d" title="One note per brand in its internal channel, agency items in the agency channel. Never a client channel."><b>${notes}</b> Slack note${notes === 1 ? '' : 's'}</span>`);
    return `<div class="ai-lbl">Approving sends</div>${d.join('') || '<span style="font-size:13px;color:var(--muted)">Nothing: every item is left out. Approve to file the notes, or skip the call.</span>'}`;
  }
  function refresh(cardEl, card) {
    $('[data-dest]', cardEl).innerHTML = destHtml(card);
    const f = flagsOf(card);
    $('[data-flag]', cardEl).innerHTML = f.o || f.d ? `<span class="ai-flag">${[f.o ? `${f.o} item${f.o === 1 ? '' : 's'} need${f.o === 1 ? 's' : ''} an owner` : '', f.d ? `${f.d} need${f.d === 1 ? 's' : ''} a date` : ''].filter(Boolean).join(' · ')}. You can still approve; reminders only go out for items with both.</span>` : '';
    $$('.ai-brand', cardEl).forEach(s => { const b = card.brands[+s.dataset.bi]; const c = $('[data-count]', s); if (c) c.textContent = counts(b); });
  }
  function paintCard(cardEl, card) {
    const fresh = document.createElement('div'); fresh.innerHTML = cardHtml(card);
    const el = fresh.firstElementChild; cardEl.replaceWith(el); wireCard(el, card); return el;
  }
  function wireCard(el, card) {
    const find = uid => { for (const b of card.brands) { const i = b.items.find(x => x.uid === uid); if (i) return [b, i]; } return []; };
    const redraw = () => paintCard(el, card);
    wireText($('[data-sum]', el), v => { card.summary = v; });
    $$('.ai-brand', el).forEach(s => {
      const b = card.brands[+s.dataset.bi];
      $('[data-toggle]', s).onclick = () => { b.open = !b.open; s.classList.toggle('shut', !b.open); $('[data-toggle]', s).setAttribute('aria-expanded', b.open); };
      $('[data-skipbrand]', s).onclick = () => { b.skip = !b.skip; redraw(); };
      $$('[data-hear] li', s).forEach((li, n) => { wireText($('.t', li), v => { b.hear[n] = v; refresh(el, card); }); $('[data-xl]', li).onclick = () => { b.hear.splice(n, 1); redraw(); }; });
      const al = $('[data-addline]', s); if (al) al.onclick = () => { b.hear.push(''); const e2 = redraw(); const lis = $$(`.ai-brand[data-bi="${s.dataset.bi}"] [data-hear] .t`, e2); const last = lis[lis.length - 1]; if (last) last.focus(); };
      $$('[data-add]', s).forEach(btn => btn.onclick = () => {
        const k = btn.dataset.add, it = { uid: ++UID, kind: k, text: '', owner: '', due: '', quote: '', at: '', off: false };
        b.items.push(it); b.open = true; const e2 = redraw(); const r = $(`.ai-row[data-uid="${it.uid}"] .t`, e2); if (r) r.focus();
      });
    });
    $$('.ai-row', el).forEach(r => {
      const [b, i] = find(+r.dataset.uid); if (!i) return;
      wireText($('[data-f=text]', r), v => { i.text = v; if (!v) { b.items.splice(b.items.indexOf(i), 1); redraw(); } else refresh(el, card); });
      const o = $('[data-f=owner]', r); if (o) o.onclick = () => ownerMenu(o, i.owner, v => { i.owner = v; o.outerHTML = ownerChip(v, 'data-f="owner" aria-label="Change the owner"'); redraw(); });
      const d = $('[data-f=due]', r); d.onclick = () => dueMenu(d, i.due, v => { i.due = v; redraw(); });
      const q = $('[data-f=quote]', r); if (i.quote) q.onclick = () => quoteMenu(q, i.quote, i.at);
      const m = $('[data-f=more]', r); m.onclick = () => {
        const opts = ORDER.filter(k => k !== i.kind && (b.brand_id || k === 'team')).map(k => ({ v: 'k:' + k, html: `<span class="ai-mark ${SEC[k].c}" style="width:20px;height:20px;font-size:11px">${SEC[k].mark}</span>Move to ${esc(SEC[k].title)}` }));
        const others = card.brands.map((x, n) => ({ x, n })).filter(o2 => o2.x !== b).map(o2 => ({ v: 'b:' + o2.n, label: `Move to ${o2.x.brand_id ? brandName(o2.x.brand_id) : 'Agency-wide'}` }));
        const rest = D.brands.filter(x => !card.brands.some(cb => cb.brand_id === x.act_id)).map(x => ({ v: 'n:' + x.act_id, label: `Move to ${x.name}` }));
        listMenu(m, 'This item', [...opts, '-', ...others, ...rest, '-', { v: 'off', label: i.off ? 'Put it back' : 'Leave it out', danger: !i.off }], v => {
          if (v === 'off') i.off = !i.off;
          else if (v.startsWith('k:')) { i.kind = v.slice(2); if (i.kind === 'client_owes') i.owner = ''; }
          else if (v.startsWith('b:')) { const to = card.brands[+v.slice(2)]; b.items.splice(b.items.indexOf(i), 1); if (!to.brand_id && i.kind !== 'team') i.kind = 'team'; to.items.push(i); to.open = true; }
          else if (v.startsWith('n:')) { b.items.splice(b.items.indexOf(i), 1); card.brands.push({ brand_id: v.slice(2), decisions: [], skip: false, items: [i], hear: [], open: true }); }
          redraw();
        });
      };
    });
    $('[data-skip]', el).onclick = async () => {
      if (window.confirmModal && !(await window.confirmModal('Skip this call?', 'Nothing from it goes anywhere. It stays under Past calls, where you can read it again.', 'Skip it'))) return;
      await post('/api/meetings/skip', { id: card.id }).catch(e => toast(e.message)); await load(); paint();
    };
    const go = $('[data-approve]', el), err = $('[data-err]', el);
    const approve = async () => {
      if (go.disabled) return; if (document.activeElement && document.activeElement.isContentEditable) document.activeElement.blur();
      go.disabled = true; go.textContent = 'Sending…'; err.textContent = '';
      try {
        const body = { id: card.id, summary: card.summary, brands: card.brands.filter(b => !b.skip).map(b => ({ brand_id: b.brand_id, decisions: b.decisions,
          items: live(b).map(i => ({ kind: i.kind, text: i.text, owner: i.owner, due: i.due })),
          this_week: b.brand_id ? b.hear.filter(Boolean) : [], need_from_client: b.brand_id ? live(b).filter(i => i.kind === 'client_owes').map(i => i.due ? `${i.text}, by ${md(i.due)}` : i.text) : [] })) };
        const r = (await post('/api/meetings/confirm', body)).result;
        el.innerHTML = doneHtml(card.title, r); delete CARDS[card.id];
        await load(true); paintList(); paintPast();
      } catch (e) { err.textContent = e.message; go.disabled = false; go.textContent = 'Approve and send'; }
    };
    go.onclick = approve;
    el.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); approve(); } });
    refresh(el, card);
  }
  function doneHtml(title, r, by) {
    const rows = [...(r.brands || []), ...(r.agency ? [r.agency] : [])].map(b => {
      const bits = [];
      if ((b.tasks || []).length) bits.push(`${b.tasks.length} on the list`);
      for (const x of b.briefs || []) bits.push(x.asana_url ? `<a href="${esc(x.asana_url)}" target="_blank" rel="noopener">brief ${esc(x.num)} in Asana</a>` : `brief "${esc(x.text)}" on the list only`);
      if ((b.asks || []).length) bits.push(`${b.asks.length} in Requests`);
      if (b.report) bits.push('report updated');
      if (b.slack) bits.push('Slack note posted');
      return `<li><b>${esc(b.name)}</b>: ${bits.join(', ') || 'notes filed'}</li>`;
    }).join('');
    return `<div class="ai-ok"><b>✓ Approved${by ? ` by ${esc(by)}` : ''}: ${esc(title || 'the call')}</b><ul>${rows}</ul>${(r.warnings || []).map(w => `<p class="ai-warn">${esc(w)}</p>`).join('')}</div>`;
  }

  /* ================= QUICK ADD: "Ahsan pause Retarget for Grunk friday" ================= */
  const DOW = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
  const MON3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  function parse(raw) {
    let s = ' ' + raw + ' ', owner = '', act = null, due = '';
    const cut = re => { const m = s.match(re); if (m) s = s.replace(m[0], ' '); return m; };
    for (const n of D.team) { if (cut(new RegExp(`\\s(?:for\\s|@)?${n}\\s`, 'i'))) { owner = n; break; } }
    for (const b of D.brands) {
      const first = b.name.split(/\s+/)[0];
      if (first.length < 3 || D.brands.filter(x => x.name.split(/\s+/)[0].toLowerCase() === first.toLowerCase()).length > 1) continue;
      if (cut(new RegExp(`\\s(?:for\\s|on\\s|#)?(?:${b.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${first})\\s`, 'i'))) { act = b.act_id; break; }
    }
    const t = today(), dow = dt(t).getUTCDay();
    let m;
    if (cut(/\s(?:by\s|on\s|due\s)?today\s/i)) due = t;
    else if (cut(/\s(?:by\s|on\s|due\s)?(?:tomorrow|tmrw)\s/i)) due = addDays(t, 1);
    else if (cut(/\s(?:by\s)?next week\s/i)) due = addDays(t, ((8 - dow) % 7) || 7);
    else if ((m = cut(/\sin (\d{1,2}) days?\s/i))) due = addDays(t, +m[1]);
    else if ((m = cut(/\s(?:by\s|on\s|due\s)?(next\s)?(sun|sunday|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday)\s/i))) { const w = DOW[m[2].toLowerCase()]; let n = ((w - dow + 7) % 7) || 7; if (m[1]) n += n < 7 ? 7 : 0; due = addDays(t, n); }
    else if ((m = cut(/\s(?:by\s|on\s|due\s)?(\d{1,2})\/(\d{1,2})\s/))) { const y = +t.slice(0, 4); let iso = `${y}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`; if (iso < t) iso = `${y + 1}${iso.slice(4)}`; due = iso; }
    else if ((m = cut(/\s(?:by\s|on\s|due\s)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s(\d{1,2})\s/i))) { const y = +t.slice(0, 4); let iso = `${y}-${String(MON3.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`; if (iso < t) iso = `${y + 1}${iso.slice(4)}`; due = iso; }
    return { text: s.replace(/\s+/g, ' ').trim(), owner, act, due };
  }
  const QA = { owner: null, act: null, due: null };   // a pick from a chip outranks what the words say
  function qaState() {
    const p = parse($('#aiQaText') ? $('#aiQaText').value : '');
    const pick = H.S.act && H.S.act !== 'all' ? H.S.act : '';
    return { text: p.text, owner: QA.owner ?? p.owner, act: QA.act ?? (p.act || pick), due: QA.due ?? (p.due || '') };
  }
  function paintQaChips() {
    const st = qaState(), host = $('#aiQaChips'); if (!host) return;
    host.innerHTML = `<button class="ai-chip" data-qa="act" style="padding-left:12px">${esc(st.act ? brandName(st.act) : 'Agency-wide')}</button>${ownerChip(st.owner, 'data-qa="owner"')}${dueChip(st.due, 'data-qa="due"')}`;
    const a = $('[data-qa=act]', host); a.onclick = () => listMenu(a, 'Brand', [{ v: '', label: 'Agency-wide', on: !st.act }, ...D.brands.map(b => ({ v: b.act_id, label: b.name, on: b.act_id === st.act }))], v => { QA.act = v; paintQaChips(); });
    const o = $('[data-qa=owner]', host); o.onclick = () => ownerMenu(o, st.owner, v => { QA.owner = v; paintQaChips(); });
    const d = $('[data-qa=due]', host); d.onclick = () => dueMenu(d, st.due, v => { QA.due = v; paintQaChips(); });
  }

  /* ================= THE LIST ================= */
  function rowHtml(i, showBrand) {
    const done = i.status && i.status !== 'open';
    const m = (D.meetings || []).find(x => x.id === i.source_id);
    const from = i.source === 'meeting' ? (m ? `From the ${esc(m.title || 'call')}, ${esc(short(m.date))}` : 'From a call') : i.source === 'monday' ? 'Added on the Monday call' : i.source === 'today' ? 'From Today’s calls' : i.source === 'strategist' ? 'From the Strategist' : i.created_by ? `Added by ${esc(firstName(i.created_by))}` : '';
    const meta = [showBrand ? esc(brandName(i.act_id)) : '', from, done ? `done${i.done_by ? ` by ${esc(firstName(i.done_by))}` : ''}${i.done_how === 'slack' ? ' in Slack' : ''}${i.done_at ? `, ${esc(short(i.done_at))}` : ''}` : ''].filter(Boolean).join(' · ');
    const kind = i.kind === 'brief' ? (i.asana_url ? `<a class="ai-kind brief" href="${esc(i.asana_url)}" target="_blank" rel="noopener">Brief · Asana ↗</a>` : '<span class="ai-kind brief">Brief</span>') : '';
    return `<div class="ai-lgrid ai-li${done ? ' done' : ''}${window.ACT_OPEN === i.id ? ' hi' : ''}" data-id="${esc(i.id)}">
      <button class="ai-tick" data-tick aria-label="${done ? 'Put it back on the list' : 'Mark it done'}" title="${done ? 'Put it back' : 'Done'}">${ICON.check}</button>
      <div class="tc"><div class="t" data-f="text">${esc(i.text)}</div>${meta ? `<div class="m">${meta}</div>` : ''}</div>
      <div>${kind}</div>
      <div>${done ? `<span class="ai-chip plain">${av(i.owner)}${esc(i.owner || 'nobody')}</span>` : ownerChip(i.owner, 'data-f="owner" aria-label="Change the owner"')}</div>
      <div>${dueChip(i.due, done ? 'disabled' : 'data-f="due" aria-label="Change the date"', !done)}</div>
      <div>${done ? '' : `<button class="ai-ib" data-f="more" aria-label="More for this item">${ICON.more}</button>`}</div>
    </div>`;
  }
  function readLine(b) {
    const r = b && b.report; if (!r) return '';
    const t = r.totals || {}, p = r.plan || {};
    const vs = (a, x, lower) => { const v = pct(a, x); if (v == null) return ''; const good = lower ? v <= 0 : v >= 0; return ` <span class="${Math.abs(v) < 3 ? '' : good ? 'up' : 'dn'}">${v > 0 ? '+' : ''}${v}% vs plan</span>`; };
    const plan = (b.thread || []).length ? `<details class="ai-plan"><summary>${esc(b.thread[0].by)}'s plan for this week</summary>${b.thread.map(x => `<div>${esc(x.text)}</div>`).join('')}</details>` : '<div class="ai-meta" style="font-size:12.5px;color:var(--muted);margin:0 0 8px">No plan posted under the weekly report yet.</div>';
    return `<div class="ai-read"><span>Last week: revenue <b>${money(t.sales)}</b>${vs(t.sales, p.sales)}</span><span>spend <b>${money(t.spend)}</b></span><span>MER <b>${t.mer != null ? (+t.mer).toFixed(2) + 'x' : '–'}</b>${vs(t.mer, p.mer)}</span><button class="ai-link" data-report="${esc(b.act_id)}">Open the report</button></div>${plan}`;
  }
  function waitHtml(list, showBrand) {
    if (!list.length) return '';
    const now = Date.now();
    return `<div class="ai-wait"><div class="ai-lbl">Waiting on the client</div>${list.map(w => { const days = Math.max(0, Math.floor((now - Date.parse(w.created_at)) / 864e5)); return `<div class="w"><span>${showBrand ? `<b>${esc(brandName(w.act_id))}</b>: ` : ''}${esc(w.title)}</span><span style="color:var(--muted)">${w.due ? `by ${esc(short(w.due))}` : ''}</span><span class="${w.status === 'open' ? '' : 'ok'}" style="${w.status === 'open' ? 'color:var(--warn)' : ''}">${w.status === 'open' ? (days ? `waiting ${days} day${days === 1 ? '' : 's'}` : 'asked today') : `done ${esc(short(w.done_at))}`}</span></div>`; }).join('')}</div>`;
  }
  const agendaOn = () => { if (AGENDA !== null) return AGENDA; const d = dt(today()).getUTCDay(); return d === 1 || d === 5 || d === 6 || d === 0; };
  function paintList() {
    const host = $('#aiList'); if (!host) return;
    const act = H.S.act || 'all', me = firstName(H.S.meEmail || ''), t = today();
    let items = D.items.filter(i => act === 'all' || i.act_id === act);
    const nLate = items.filter(i => i.due && i.due < t).length, nMine = items.filter(i => i.owner === me).length, nBrief = items.filter(i => i.kind === 'brief').length;
    if (VIEW === 'mine') items = items.filter(i => i.owner === me);
    if (VIEW === 'late') items = items.filter(i => i.due && i.due < t);
    if (VIEW === 'briefs') items = items.filter(i => i.kind === 'brief');
    if (WHO !== 'all') items = items.filter(i => (i.owner || '') === WHO);
    const waiting = (D.waiting || []).filter(w => act === 'all' || w.act_id === act);
    const showWait = VIEW === 'all' && WHO === 'all';
    let groups = [];
    if (GROUP === 'brand') {
      const ids = new Set(items.map(i => i.act_id));
      if (showWait) waiting.forEach(w => ids.add(w.act_id));
      if (agendaOn() && MON && VIEW === 'all' && WHO === 'all') MON.brands.forEach(b => { if (act === 'all' || b.act_id === act) ids.add(b.act_id); });
      const rank = { bad: 0, warn: 1, undefined: 2, good: 3 };
      groups = [...ids].sort((a, b) => (a ? 1 : 0) - (b ? 1 : 0) || (agendaOn() ? (rank[SEV[a]] ?? 2) - (rank[SEV[b]] ?? 2) : 0) || brandName(a).localeCompare(brandName(b)))
        .map(a => ({ key: a, title: brandName(a), dot: agendaOn() && a ? (SEV[a] || '') : null, items: items.filter(i => i.act_id === a), extra: (agendaOn() && MON ? readLine(MON.brands.find(x => x.act_id === a)) : '') + (showWait ? waitHtml(waiting.filter(w => w.act_id === a)) : ''), showBrand: false }));
    } else if (GROUP === 'due') {
      const wk = addDays(t, 7 - (((dt(t).getUTCDay() + 6) % 7)));
      const B = [['Late', i => i.due && i.due < t], ['Today', i => i.due === t], ['This week', i => i.due > t && i.due < wk], ['Later', i => i.due >= wk], ['No date', i => !i.due]];
      groups = B.map(([title, f]) => ({ key: title, title, items: items.filter(f), showBrand: true })).filter(g => g.items.length);
      if (showWait && waiting.length) groups.push({ key: 'wait', title: 'Waiting on clients', items: [], extra: waitHtml(waiting, true) });
    } else {
      const who = [...new Set(items.map(i => i.owner || ''))].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || (a === me ? -1 : b === me ? 1 : a.localeCompare(b)));
      groups = who.map(w => ({ key: w, title: w ? `${w}${w === me ? ' (you)' : ''}` : 'Nobody yet', items: items.filter(i => (i.owner || '') === w), showBrand: true }));
      if (showWait && waiting.length) groups.push({ key: 'wait', title: 'Waiting on clients', items: [], extra: waitHtml(waiting, true) });
    }
    const people = [...new Set([...D.team, ...D.items.map(i => i.owner).filter(Boolean)])];
    host.innerHTML = `<div class="ai-sec"><h2>The list</h2><small>${D.items.filter(i => act === 'all' || i.act_id === act).length} open${nLate ? `, <span style="color:var(--bad)">${nLate} late</span>` : ''}</small></div>
      <div class="ai-qa"><input id="aiQaText" placeholder="Add an item: “Ahsan pause the Retarget ad set for Grunk friday”" maxlength="300" aria-label="New item"><span id="aiQaChips" style="display:inline-flex;gap:6px;flex-wrap:wrap"></span><button class="btn primary" id="aiQaAdd">Add</button>
        <div class="hint">Name a person, a brand or a day in the words and Locus fills those in; click a chip to change it. Enter adds.</div></div>
      <div class="ai-bar"><div class="ai-seg" role="tablist">${[['all', 'Everyone'], ['mine', `Mine${nMine ? ` ${nMine}` : ''}`], ['late', `Late${nLate ? ` ${nLate}` : ''}`], ['briefs', `Briefs${nBrief ? ` ${nBrief}` : ''}`]].map(([k, l]) => `<button role="tab" aria-selected="${VIEW === k}" class="${VIEW === k ? 'on' : ''}" data-view="${k}">${l}</button>`).join('')}</div>
        <span class="sp"></span>
        <button class="ai-menu" id="aiWho"><span>Person</span> ${esc(WHO === 'all' ? 'Anyone' : WHO || 'Nobody yet')} ${ICON.chev}</button>
        <button class="ai-menu" id="aiGroup"><span>Group by</span> ${({ brand: 'Brand', due: 'Due date', person: 'Person' })[GROUP]} ${ICON.chev}</button></div>
      ${groups.length ? groups.map(g => `<div class="ai-group" data-g="${esc(g.key)}"><div class="ai-gh">${g.dot !== null && g.dot !== undefined ? `<span class="ai-dot ${g.dot}"></span>` : ''}<h3>${esc(g.title)}</h3><small>${g.items.length ? `${g.items.length} open` : 'nothing open'}</small></div>${g.extra || ''}
        ${g.items.length ? `<div class="ai-lgrid ai-lcols"><div></div><div>Item</div><div></div><div>Owner</div><div>Due</div><div></div></div>${g.items.map(i => rowHtml(i, g.showBrand)).join('')}` : ''}</div>`).join('')
        : `<p class="ai-empty">${VIEW === 'all' && WHO === 'all' ? 'Nothing open. Every item is done.' : 'Nothing here.'}</p>`}`;
    wireList(host, people);
    if (window.ACT_OPEN) { const el = $(`.ai-li[data-id="${CSS.escape(window.ACT_OPEN)}"]`, host); if (el) { el.scrollIntoView({ block: 'center' }); setTimeout(() => el.classList.remove('hi'), 2500); } window.ACT_OPEN = null; }
  }
  function wireList(host, people) {
    $$('[data-view]', host).forEach(b => b.onclick = () => { VIEW = b.dataset.view; paintList(); });
    const g = $('#aiGroup'); g.onclick = () => listMenu(g, 'Group by', [['brand', 'Brand'], ['due', 'Due date'], ['person', 'Person']].map(([v, l]) => ({ v, label: l, on: GROUP === v })), v => { GROUP = v; try { localStorage.setItem('ai_group', v); } catch {} paintList(); });
    const w = $('#aiWho'); w.onclick = () => listMenu(w, 'Person', [{ v: 'all', label: 'Anyone', on: WHO === 'all' }, ...people.map(n => ({ v: n, html: `${av(n)}${esc(n)}`, on: WHO === n })), { v: '', label: 'Nobody yet', on: WHO === '' }], v => { WHO = v; paintList(); });
    $$('[data-report]', host).forEach(b => b.onclick = () => { const s = document.getElementById('clientPick'); if (s && H.S.act !== b.dataset.report) { s.value = b.dataset.report; s.dispatchEvent(new Event('change')); } H.show('reports'); });
    for (const li of $$('.ai-li', host)) {
      const id = li.dataset.id, it = D.items.find(x => x.id === id); if (!it) continue;
      const save = async patch => { try { await post('/api/actions/edit', { id, ...patch }); Object.assign(it, patch); } catch (e) { toast(e.message); } };
      $('[data-tick]', li).onclick = async () => {
        li.classList.add('done');
        try { await post('/api/actions/done', { id, done: true }); toast('Done.'); setTimeout(async () => { await load(true); paintList(); paintDone(); }, 600); } catch (e) { toast(e.message); li.classList.remove('done'); }
      };
      wireText($('[data-f=text]', li), v => v ? save({ text: v }) : null);
      const o = $('[data-f=owner]', li); if (o) o.onclick = () => ownerMenu(o, it.owner, async v => { await save({ owner: v }); paintList(); });
      const d = $('[data-f=due]', li); if (d) d.onclick = () => dueMenu(d, it.due, async v => { await save({ due: v }); paintList(); });
      const m = $('[data-f=more]', li); if (m) m.onclick = () => listMenu(m, 'This item', [
        ...(it.source === 'meeting' && it.source_id ? [{ v: 'call', label: 'Open the call it came from' }] : []),
        { v: 'brand', label: `Brand: ${brandName(it.act_id)}`, small: 'change' },
        '-', { v: 'drop', label: 'Drop it (not happening)', danger: true }], async v => {
          if (v === 'call') { const pf = $('#aiPastFold'), dd = $(`details.ai-call[data-mid="${CSS.escape(it.source_id)}"]`); if (pf && dd) { pf.open = true; dd.open = true; dd.scrollIntoView({ block: 'center' }); } }
          if (v === 'brand') listMenu(m, 'Brand', [{ v: '', label: 'Agency-wide', on: !it.act_id }, ...D.brands.map(b => ({ v: b.act_id, label: b.name, on: b.act_id === it.act_id }))], async a => { await save({ act: a }); it.act_id = a; paintList(); });
          if (v === 'drop') { if (window.confirmModal && !(await window.confirmModal('Drop this item?', 'It leaves the list without being marked done. Use it for things that are no longer happening.', 'Drop it'))) return; await save({ status: 'dropped' }); await load(true); paintList(); }
        });
    }
    const inp = $('#aiQaText'), add = $('#aiQaAdd');
    inp.oninput = () => paintQaChips();
    const doAdd = async () => {
      const st = qaState(); if (!st.text) { inp.focus(); return; }
      add.disabled = true;
      try { await post('/api/actions', { act: st.act || '', text: st.text, owner: st.owner || '', due: st.due || '', kind: 'team', source: 'manual' }); QA.owner = QA.act = QA.due = null; await load(true); paintList(); toast('Added.'); const n = $('#aiQaText'); if (n) n.focus(); }
      catch (e) { toast(e.message); add.disabled = false; }
    };
    add.onclick = doAdd; inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } };
    paintQaChips();
  }
  function paintDone() {
    const host = $('#aiDone'); if (!host) return;
    if (!DONE) { host.innerHTML = '<p class="ai-empty">Loading…</p>'; return; }
    const act = H.S.act || 'all';
    const list = DONE.filter(i => act === 'all' || i.act_id === act);
    host.innerHTML = list.length ? `<div class="ai-group">${list.map(i => rowHtml(i, true)).join('')}</div>` : '<p class="ai-empty">Nothing done in the last 60 days.</p>';
    for (const li of $$('.ai-li', host)) $('[data-tick]', li).onclick = async () => { await post('/api/actions/done', { id: li.dataset.id, done: false }).catch(e => toast(e.message)); await load(true); DONE = (await H.apiAH('/api/actions?act=all&status=done')).items; paintList(); paintDone(); };
    const s = $('#aiDoneSum'); if (s) s.textContent = `Done in the last 60 days (${list.length})`;
  }

  /* ================= PAST CALLS ================= */
  const ST = { new: ['Reading', ''], extracted: ['To approve', 'warn'], confirmed: ['Approved', 'good'], skipped: ['Skipped', ''], error: ['Could not read', 'bad'] };
  function paintPast() {
    const host = $('#aiPast'); if (!host) return;
    const list = D.meetings.filter(m => m.status !== 'extracted' || !D.pending.some(p => p.id === m.id));
    host.innerHTML = `<p style="font-size:12.5px;color:var(--muted);margin:0 0 8px">${D.connected ? `Locus reads every Fireflies call within the hour. <button class="ai-link" id="aiPoll">Check Fireflies now</button>` : 'Fireflies is not connected (FIREFLIES_API_KEY on the worker).'}</p>
      ${list.length ? list.map(m => { const [l, c] = ST[m.status] || [m.status, '']; return `<details class="ai-call" data-mid="${esc(m.id)}"><summary><span style="flex:1;min-width:0">${esc(m.title || 'Untitled call')} <small>${esc(md(m.date))}${m.duration ? ` · ${Math.round(m.duration)} min` : ''}</small></span><span class="ai-st ${c}">${esc(l)}</span></summary><div class="body">Loading…</div></details>`; }).join('') : '<p class="ai-empty">No other calls in the last 60 days.</p>'}`;
    const poll = $('#aiPoll'); if (poll) poll.onclick = async () => { poll.disabled = true; poll.textContent = 'Checking…'; try { const r = await post('/api/meetings/poll', {}); await load(); paint(); toast(r.read && r.read.length ? `Read ${r.read.length} new call${r.read.length === 1 ? '' : 's'}.` : r.errors && r.errors.length ? `Fireflies: ${r.errors[0].error}` : 'Nothing new on Fireflies.'); } catch (e) { toast(e.message); poll.disabled = false; poll.textContent = 'Check Fireflies now'; } };
    for (const det of $$('details.ai-call', host)) det.ontoggle = async () => {
      if (!det.open || det.dataset.loaded) return; det.dataset.loaded = '1';
      const body = $('.body', det);
      const m = await H.apiAH(`/api/meetings?id=${encodeURIComponent(det.dataset.mid)}`).catch(e => ({ error: e.message }));
      if (m.error && !m.status) { body.textContent = m.error; return; }
      const again = m.status === 'skipped' || m.status === 'error';
      body.innerHTML = `${m.error ? `<p class="ai-warn">${esc(m.error)}</p>` : ''}${m.notes && m.notes.summary ? `<p style="margin:0 0 8px">${esc(m.notes.summary)}</p>` : ''}${m.result ? doneHtml(m.title, m.result, firstName(m.confirmed_by)) : ''}${again ? `<button class="btn" data-again>Read it again</button>` : ''}`;
      const a = $('[data-again]', body); if (a) a.onclick = async () => { a.disabled = true; a.textContent = 'Reading…'; try { await post('/api/meetings/ingest', { id: m.id }); await load(); paint(); } catch (e) { toast(e.message); a.disabled = false; a.textContent = 'Read it again'; } };
    };
  }

  /* ================= the page ================= */
  async function load(listOnly) {
    const [acts, meet] = await Promise.all([H.apiAH('/api/actions?act=all&status=open'), listOnly ? Promise.resolve(null) : H.apiAH('/api/meetings?open=0')]);
    if (meet) {
      const pend = meet.meetings.filter(m => m.status === 'extracted').slice(0, 8);
      const full = await Promise.all(pend.map(m => H.apiAH(`/api/meetings?id=${encodeURIComponent(m.id)}`).catch(() => null)));
      D = { ...(D || {}), meetings: meet.meetings, pending: full.filter(m => m && m.notes), today: meet.today, connected: meet.connected, webhook: meet.webhook };
      for (const m of D.pending) if (!CARDS[m.id]) CARDS[m.id] = modelOf(m);
      for (const id of Object.keys(CARDS)) if (!D.pending.some(m => m.id === id)) delete CARDS[id];
    }
    D = { ...D, items: acts.items, waiting: acts.waiting || [], team: acts.team, brands: acts.brands, remind: acts.remind };
    if (DONE) DONE = (await H.apiAH('/api/actions?act=all&status=done').catch(() => ({ items: DONE }))).items;
  }
  async function loadMonday() {
    try {
      const [m, cmd] = await Promise.all([H.apiAH('/api/meetings/monday'), H.api('/api/hub/command').catch(() => null)]);
      MON = m; SEV = {};
      if (cmd && Array.isArray(cmd.brands)) for (const b of cmd.brands) SEV[b.act_id] = b.paused ? undefined : (b.reasons || []).reduce((w, r) => r.sev === 'bad' ? 'bad' : (w === 'bad' ? w : r.sev === 'warn' ? 'warn' : w), 'good');
    } catch { MON = null; }
  }
  function paint() {
    closePop();
    const act = H.S.act || 'all';
    const pend = D.pending.filter(m => act === 'all' || m.notes.brands.some(b => b.brand_id === act));
    const head = H.pageHead('actions', 'Action items', 'Calls waiting for your OK on top; everything the team owes below.');
    $('#main').innerHTML = `<div class="v2 ai">${head}
      ${pend.length ? `<div class="ai-sec"><h2>To approve</h2><small>${pend.length} call${pend.length === 1 ? '' : 's'}. Read it, fix anything wrong by clicking it, press Approve.</small></div>${pend.map(m => `<div data-card="${esc(m.id)}"></div>`).join('')}` : ''}
      ${agendaOn() && MON ? `<div class="ai-card" style="padding:18px 22px"><div class="ai-ch"><div style="flex:1"><h3 style="font-size:16px">Monday ${esc(short(MON.monday))}: this week, every brand</h3><small>Saved for the week; the call notes pick it up. Each brand's numbers and plan sit with its items below, red brands first.</small></div><button class="btn quiet" id="aiHideMon">Hide</button></div>
        <div class="ai-theme"><textarea id="aiTheme" placeholder="This week, every brand: ...">${esc(MON.theme || '')}</textarea><button class="btn" id="aiThemeSave">Save</button></div></div>` : ''}
      <div id="aiList"></div>
      ${agendaOn() ? '' : '<p style="font-size:12.5px;color:var(--muted);margin:6px 0 0">On Mondays each brand also shows last week\'s numbers and the strategist\'s plan. <button class="ai-link" id="aiShowMon">Show them now</button></p>'}
      <details class="ai-fold" id="aiDoneFold"><summary id="aiDoneSum">Done in the last 60 days</summary><div id="aiDone"></div></details>
      <details class="ai-fold" id="aiPastFold"><summary>Past calls (${D.meetings.filter(m => m.status !== 'extracted').length})</summary><div id="aiPast"></div></details>
    </div>`;
    for (const m of pend) { const slot = $(`[data-card="${CSS.escape(m.id)}"]`); const card = CARDS[m.id]; slot.innerHTML = cardHtml(card); const el = slot.firstElementChild; slot.replaceWith(el); wireCard(el, card); }
    paintList(); paintPast();
    const df = $('#aiDoneFold'); df.ontoggle = async () => { if (df.open && !DONE) { paintDone(); DONE = (await H.apiAH('/api/actions?act=all&status=done').catch(() => ({ items: [] }))).items; } paintDone(); };
    const sm = $('#aiShowMon'); if (sm) sm.onclick = async () => { AGENDA = true; sm.disabled = true; if (!MON) await loadMonday(); paint(); };
    const hm = $('#aiHideMon'); if (hm) hm.onclick = () => { AGENDA = false; paint(); };
    const ts = $('#aiThemeSave'); if (ts) ts.onclick = async () => { ts.disabled = true; try { await post('/api/meetings/theme', { text: $('#aiTheme').value }); toast('Saved for this week.'); } catch (e) { toast(e.message); } ts.disabled = false; };
    const want = window.ACT_MEETING || new URLSearchParams(location.search).get('meeting'); window.ACT_MEETING = null;
    if (want) {
      const c = $(`.ai-card[data-mid="${CSS.escape(want)}"]`);
      if (c) { c.classList.add('ring'); c.scrollIntoView({ block: 'start' }); }
      else { const pf = $('#aiPastFold'), d = $(`details.ai-call[data-mid="${CSS.escape(want)}"]`); if (pf && d) { pf.open = true; d.open = true; d.scrollIntoView({ block: 'center' }); } }
      try { const u = new URL(location.href); u.searchParams.delete('meeting'); history.replaceState(null, '', u); } catch {}
    }
  }
  async function render(host, first) {
    H = host; css();
    const t = H.RUN();
    const head = H.pageHead('actions', 'Action items', 'Calls waiting for your OK on top; everything the team owes below.');
    if (first || !D) $('#main').innerHTML = `<div class="v2 ai">${head}<div class="ai-card"><p class="ai-empty">Loading…</p></div></div>`;
    try {
      const qs = new URLSearchParams(location.search); if (qs.get('item')) window.ACT_OPEN = qs.get('item');
      await load();
      if (agendaOn()) await loadMonday();
    } catch (e) { if (t === H.RUN()) $('#main').innerHTML = `<div class="v2 ai">${head}<div class="ai-card"><p style="color:var(--bad)">${esc(e.message)}</p></div></div>`; return; }
    if (t !== H.RUN()) return;
    paint();
  }
  window.ActionsTab = { render };
})();
