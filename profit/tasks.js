/* WORK > TASKS (2026-10-13 fourth pass, the approved mock in docs/handoffs/work-calls-tasks-production.md). A workspace:
 * what the team owes, from approved calls and quick adds, shown as a List, a Board or a Calendar (the Asana / ClickUp
 * model: one Group by drives the list sections and the board columns).
 *
 *   Quick add     one typed line; account-health /api/actions/quick reads brand, owner, due and area out of it (Haiku),
 *                 falling back to the plain words.
 *   View          List / Board / Calendar. Group by Brand / Person / Due / Area. Only mine. Area chips. Remembered in
 *                 localStorage (tk_prefs).
 *   List          Task / Brand / Area / From / Who / Due, one card per group, round tick, "Done this week · N  Show".
 *   Board         a column per group value; dragging a card changes that field; "+ Add" prefills it.
 *   Calendar      Mon to Sun plus "Later / no date" (or the month); dragging a card to a day changes its due date.
 *   Waiting on client  the Requests asks still open (and done in the last week), last, with a coral dashed tick. They
 *                 close when the client marks the ask done, never from here.
 * Clicking a task opens the edit window (words, who, due, area, brand, done, drop). New ads live on Production, so
 * brief rows are left out here. Classic script, own closure; window.TasksTab = { render }.
 */
(() => {
  let H = null;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ROLE = { Cole: 'Owner', Ahsan: 'Strategist', Noma: 'Strategist', William: 'Designer', Ravo: 'Video', Radhesh: 'Google', Hamza: 'Amazon' };
  const HUE = { Cole: '#8FB3FF', Ahsan: '#5FD292', Noma: '#EBBF63', William: '#C9A2FF', Ravo: '#F09182', Radhesh: '#7FD7E0', Hamza: '#F2A65A' };
  const dt = iso => new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  const md = iso => iso ? dt(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const short = iso => iso ? dt(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const addDays = (iso, n) => { const d = dt(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const firstName = s => String(s || '').split(/[@\s]/)[0].replace(/^./, c => c.toUpperCase());
  const AREA = { ads: ['Ads', 'var(--brand)'], email: ['Email', 'var(--c-email)'], organic: ['Organic', 'var(--c-tiktok)'], site: ['Site', 'var(--warn)'], ops: ['Ops', 'var(--muted)'], client: ['Client', 'var(--c-amazon)'], other: ['Other', 'var(--faint, var(--muted))'] };
  const AREA_KEYS = ['ads', 'email', 'organic', 'site', 'ops', 'client'];
  const areaOf = i => AREA[i.area] ? i.area : 'other';
  const BUCKETS = [['late', 'Late'], ['today', 'Today'], ['week', 'This week'], ['later', 'Later'], ['none', 'No date']];
  let D = null, P = { view: 'list', group: 'brand', area: 'all', mine: false, cal: 'week' }, CW = 0, SHOW_DONE = false, DRAG = null;
  try { Object.assign(P, JSON.parse(localStorage.getItem('tk_prefs') || '{}')); } catch {}
  const save = () => { try { localStorage.setItem('tk_prefs', JSON.stringify(P)); } catch {} };

  /* ---------- look (tokens only) ---------- */
  function css() {
    if (document.getElementById('tkcss')) return;
    const st = document.createElement('style'); st.id = 'tkcss';
    st.textContent = `
      .tk{display:flex;flex-direction:column;gap:16px;min-width:0}
      .tk .muted{color:var(--muted)}
      .tk .tk-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px 24px;flex-wrap:wrap}
      .tk .tk-head h1{font-size:22px;font-weight:700;margin:0;color:var(--ink)}
      .tk .tk-head p{color:var(--ink-2);margin:4px 0 0;font-size:13.5px}
      .tk .tk-qa{display:flex;gap:8px;align-items:center;margin:0;flex-wrap:wrap}
      .tk .tk-qa label{font-size:12px;color:var(--muted);white-space:nowrap}
      .tk .tk-qa input{width:360px;max-width:100%;height:32px;box-sizing:border-box;padding:0 10px;border-radius:6px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:13px}
      .tk .tk-btn{height:32px;padding:0 14px;border-radius:6px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--ink)}
      .tk .tk-btn.pri{background:var(--brand);border-color:var(--brand);color:var(--surface)}
      .tk .tk-btn:disabled{opacity:.55;cursor:default}
      .tk .tk-bar{display:flex;align-items:center;gap:12px 20px;flex-wrap:wrap}
      .tk .tk-bar .lb,.tk .tk-areas .lb{font-size:12px;color:var(--muted)}
      .tk .tk-segw{display:flex;align-items:center;gap:8px}
      .tk .tk-seg{display:flex;gap:2px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:2px}
      .tk .tk-seg button{height:28px;padding:0 12px;border-radius:6px;font:inherit;font-size:13px;cursor:pointer;background:transparent;color:var(--muted);border:1px solid transparent}
      .tk .tk-seg button.on{background:var(--surface-2);color:var(--ink);border-color:var(--line-strong)}
      .tk .tk-areas{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .tk .tk-chip{height:26px;padding:0 10px;border-radius:999px;font:inherit;font-size:12px;cursor:pointer;background:transparent;color:var(--ink-2);border:1px solid var(--line-strong);white-space:nowrap}
      .tk .tk-chip.on{background:var(--cc,var(--ink));border-color:transparent;color:var(--surface);font-weight:600}
      .tk .tk-card{background:var(--surface);border:1px solid var(--line);border-radius:8px}
      .tk .tk-tr{display:grid;grid-template-columns:16px minmax(0,1fr) 110px 70px 100px 22px 76px;gap:12px;align-items:center;padding:9px 12px;border-top:1px solid var(--line)}
      .tk .tk-th{border-top:0;padding:0 12px;font-size:11px;letter-spacing:.4px;text-transform:uppercase;color:var(--faint,var(--muted))}
      .tk .tk-gh{display:flex;align-items:center;gap:8px;padding:10px 12px}
      .tk .tk-gh b{font-weight:600;color:var(--ink)}
      .tk .tk-gh b.wait{color:var(--c-amazon)}
      .tk .tk-row{cursor:pointer}
      .tk .tk-row:hover{background:var(--surface-2)}
      .tk .tk-row.hi{background:var(--brand-soft)}
      .tk .tk-row .t{color:var(--ink);min-width:0;font-size:13.5px;line-height:1.4}
      .tk .tk-row.done .t{text-decoration:line-through;color:var(--muted)}
      .tk .tk-row .s{color:var(--muted);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tk .tk-tick{width:16px;height:16px;border-radius:50%;border:1.5px solid var(--muted);background:transparent;padding:0;cursor:pointer;flex:none}
      .tk .tk-tick:hover{border-color:var(--good);background:color-mix(in srgb,var(--good) 20%,transparent)}
      .tk .tk-row.done .tk-tick{background:var(--good);border-color:var(--good)}
      .tk .tk-tick.wait{border-color:var(--c-amazon);border-style:dashed;cursor:default;background:transparent}
      .tk .tk-tag{font-size:11px;padding:2px 7px;border-radius:4px;font-weight:600;white-space:nowrap;color:var(--ac);background:color-mix(in srgb,var(--ac) 14%,transparent)}
      .tk .tk-av{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#131316;flex:0 0 22px}
      .tk .tk-due{font-size:12px;white-space:nowrap;color:var(--muted);text-align:right}
      .tk .tk-due.late{color:var(--bad)}.tk .tk-due.now{color:var(--warn)}
      .tk .tk-foot{display:flex;align-items:center;gap:10px;padding:4px 12px;font-size:13px}
      .tk .tk-link{background:none;border:0;color:var(--brand);font:inherit;font-size:13px;cursor:pointer;padding:0}
      .tk .tk-board{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;align-items:flex-start;min-width:0}
      .tk .tk-col{flex:0 0 252px;background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:10px;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;min-height:120px}
      .tk .tk-col.over{border-color:var(--brand)}
      .tk .tk-col .tk-gh{padding:2px 2px 6px}
      .tk .tk-bc{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px;cursor:grab}
      .tk .tk-bc.drag{opacity:.45}
      .tk .tk-bc .t{color:var(--ink);line-height:1.35;font-size:13px}
      .tk .tk-bc .r{display:flex;align-items:center;gap:6px;min-width:0}
      .tk .tk-bc .r .s{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tk .tk-bc.wait{cursor:default;border-style:dashed;border-color:color-mix(in srgb,var(--c-amazon) 50%,transparent)}
      .tk .tk-add{align-self:flex-start;height:26px;padding:0 10px;border-radius:999px;font:inherit;font-size:12px;cursor:pointer;background:transparent;border:1px dashed var(--line-strong);color:var(--muted)}
      .tk .tk-add:hover{color:var(--ink)}
      .tk .tk-addin{width:100%;box-sizing:border-box;height:32px;padding:0 8px;border-radius:6px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:13px}
      .tk .tk-calh{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .tk .tk-calh b{font-weight:600;color:var(--ink)}
      .tk .tk-calh .nav{display:flex;align-items:center;gap:6px}
      .tk .tk-calh .nav button.ar{width:28px;height:28px;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer}
      .tk .tk-week{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:8px;align-items:start;overflow-x:auto}
      .tk .tk-day{min-height:260px;border-radius:8px;border:1px solid var(--line);background:var(--surface-2);min-width:110px}
      .tk .tk-day.today{border-color:var(--line-strong);background:var(--surface)}
      .tk .tk-day.later{border-style:dashed;background:transparent}
      .tk .tk-day.over{border-color:var(--brand)}
      .tk .tk-day .dh{display:flex;align-items:center;justify-content:space-between;padding:8px 8px 6px;font-size:12px;font-weight:600;color:var(--ink-2)}
      .tk .tk-day.today .dh span:first-child{color:var(--warn)}
      .tk .tk-day.we .dh span:first-child{color:var(--muted)}
      .tk .tk-day .tk-bc{margin:0 6px 6px;padding:8px;gap:6px}
      .tk .tk-day .tk-bc .t{font-size:12px;line-height:1.3}
      .tk .tk-month{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;overflow-x:auto}
      .tk .tk-month .wd{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;padding:2px 4px}
      .tk .tk-mc{min-height:96px;border:1px solid var(--line);border-radius:6px;background:var(--surface-2);padding:4px;display:flex;flex-direction:column;gap:3px;min-width:80px}
      .tk .tk-mc.out{opacity:.45}.tk .tk-mc.today{border-color:var(--warn)}.tk .tk-mc.over{border-color:var(--brand)}
      .tk .tk-mc .n{font-size:11px;color:var(--muted)}
      .tk .tk-mc .it{font-size:11.5px;line-height:1.25;padding:3px 5px;border-radius:4px;background:var(--surface);border:1px solid var(--line);cursor:grab;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tk .tk-empty{color:var(--muted);font-size:13.5px;padding:14px 12px}
      .tk-scrim{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9500;padding:16px}
      .tk-modal{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:20px;width:min(480px,100%);display:flex;flex-direction:column;gap:12px;box-shadow:0 18px 44px rgba(0,0,0,.35);max-height:calc(100vh - 32px);overflow:auto}
      .tk-modal h3{margin:0;font-size:17px}
      .tk-modal .lb{font-size:12px;color:var(--ink-2);margin:0 0 5px}
      .tk-modal textarea{font:inherit;font-size:14px;color:var(--ink);background:var(--surface-2);border:1px solid var(--line-strong);border-radius:8px;padding:8px 10px;width:100%;box-sizing:border-box;min-height:70px;resize:vertical}
      .tk-modal .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .tk-modal .chips{display:flex;gap:6px;flex-wrap:wrap}
      .tk-modal .ft{display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap}
      .tk-modal .ft .sp{flex:1}
      .tk-modal .meta{font-size:12px;color:var(--muted)}
      .tk-modal .tk-btn{height:34px;padding:0 14px;border-radius:8px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--ink)}
      .tk-modal .tk-btn.pri{background:var(--brand);border-color:var(--brand);color:var(--surface)}
      .tk-modal .tk-btn.good{color:var(--good)}
      .tk-modal .tk-x{background:none;border:0;color:var(--bad);font:inherit;font-size:13px;cursor:pointer;padding:0}
      .tk-modal .tk-chip{height:28px;padding:0 10px;border-radius:999px;font:inherit;font-size:12px;cursor:pointer;background:transparent;color:var(--ink-2);border:1px solid var(--line-strong)}
      .tk-modal .tk-chip.on{background:var(--cc,var(--ink));border-color:transparent;color:var(--surface);font-weight:600}
      .tk-modal .tk-pick{height:34px;max-width:100%;padding:0 12px 0 6px;border-radius:999px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--ink);font:inherit;font-size:13px;display:inline-flex;align-items:center;gap:8px;cursor:pointer;white-space:nowrap;overflow:hidden}
      .tk-modal .tk-chip.date,.tk-modal .tk-chip.need{height:34px;padding:0 12px;display:inline-flex;align-items:center;gap:8px}
      .tk-modal .tk-chip.need{color:var(--warn);border-style:dashed}
      .tk-modal .tk-chip.late{color:var(--bad)}
      .tk-modal .tk-av{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#131316;flex:none}
      .tk-pop{position:fixed;z-index:9600;min-width:220px;max-width:320px;max-height:420px;overflow:auto;background:var(--surface-2);border:1px solid var(--line-strong);border-radius:12px;padding:6px;box-shadow:0 18px 44px rgba(0,0,0,.35);font-family:inherit;color:var(--ink)}
      .tk-pop .h{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);padding:7px 9px 5px}
      .tk-pop button.o{width:100%;height:36px;border:0;border-radius:8px;background:transparent;color:var(--ink);font:inherit;font-size:13.5px;display:flex;align-items:center;gap:10px;padding:0 9px;cursor:pointer;text-align:left}
      .tk-pop button.o:hover,.tk-pop button.o.on{background:var(--brand-soft)}
      .tk-pop button.o small{margin-left:auto;color:var(--muted);font-size:12px}
      .tk-pop button.o.danger{color:var(--bad)}
      .tk-pop hr{border:0;border-top:1px solid var(--line-strong);margin:5px 2px}
      .tk-pop .tk-av{width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#131316;flex:none}
      .tk-pop .cal{padding:4px 4px 2px}
      .tk-pop .cal .mh{display:flex;align-items:center;justify-content:space-between;font-size:12.5px;color:var(--ink-2);padding:2px 4px 6px}
      .tk-pop .cal .mh button{border:0;background:transparent;color:var(--muted);cursor:pointer;width:28px;height:28px;border-radius:6px;font-size:15px}
      .tk-pop .cal .mh button:hover{background:var(--brand-soft);color:var(--ink)}
      .tk-pop .cal .g{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
      .tk-pop .cal .g span{font-size:10.5px;color:var(--muted);padding:2px 0}
      .tk-pop .cal .g button{height:32px;border:0;border-radius:7px;background:transparent;color:var(--ink);font:inherit;font-size:12.5px;cursor:pointer}
      .tk-pop .cal .g button:hover{background:var(--brand-soft)}
      .tk-pop .cal .g button.past{color:var(--muted)}
      .tk-pop .cal .g button.today{box-shadow:inset 0 0 0 1px var(--line-strong)}
      .tk-pop .cal .g button.on{background:var(--brand);color:var(--surface)}
      @media (max-width:760px){.tk .tk-qa input{width:100%}.tk .tk-qa{width:100%}.tk .tk-tr{grid-template-columns:16px minmax(0,1fr) 22px 70px}.tk .tk-tr > .hm{display:none}}
    `;
    document.head.appendChild(st);
  }

  /* ---------- small helpers ---------- */
  const post = (path, body) => H.apiAH(path, { method: 'POST', body: JSON.stringify(body) });
  const toast = msg => { const t = document.createElement('div'); t.setAttribute('role', 'status'); t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));background:var(--ink);color:var(--surface);padding:10px 16px;border-radius:12px;font-size:13.5px;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,.25)'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 4500); };
  const brandName = id => id ? ((D.brands.find(b => b.act_id === id) || {}).name || id) : 'Agency-wide';
  const today = () => D.today || new Date().toISOString().slice(0, 10);
  const av = n => n ? `<span class="tk-av" style="background:${HUE[n] || 'var(--line-strong)'}">${esc(n[0])}</span>` : '<span class="tk-av" style="background:var(--line-strong);color:var(--ink)">?</span>';
  const ICON = {
    chev: '<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    cal: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    more: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
    quote: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6"/></svg>',
    check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  };
  function dueChip(due, attrs = '', open = true) {
    const t = today();
    if (!due) return `<button class="tk-chip date need" ${attrs}>${ICON.cal}<span>Add a date</span></button>`;
    const cls = !open ? '' : due < t ? ' late' : due === t ? ' now' : '';
    const label = due === t ? 'Today' : due === addDays(t, 1) ? 'Tomorrow' : md(due);
    return `<button class="tk-chip date${cls}" ${attrs}>${ICON.cal}<span>${esc(label)}${cls === ' late' ? ', late' : ''}</span></button>`;
  }
  const ownerChip = (o, attrs = '') => o ? `<button class="tk-chip" ${attrs}>${av(o)}<span>${esc(o)}</span></button>` : `<button class="tk-chip need" ${attrs}>${av('')}<span>Needs an owner</span></button>`;

  /* ---------- Locus's own menus (never the browser's select) ---------- */
  let POP = null;
  function closePop() { if (!POP) return; POP.el.remove(); document.removeEventListener('mousedown', POP.out, true); document.removeEventListener('keydown', POP.key, true); POP = null; }
  function pop(anchor, html, wire) {
    closePop();
    const el = document.createElement('div'); el.className = 'tk-pop'; el.setAttribute('role', 'menu'); el.innerHTML = html;
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

  /* ---------- the data, cut the way the controls say ---------- */
  const me = () => firstName(H.S.meEmail || '');
  const weekEnd = () => { const t = today(); return addDays(t, (7 - dt(t).getUTCDay()) % 7); };   // this Sunday
  const bucketOf = due => { const t = today(); return !due ? 'none' : due < t ? 'late' : due === t ? 'today' : due <= weekEnd() ? 'week' : 'later'; };
  const inAct = i => !H.S.act || H.S.act === 'all' || i.act_id === H.S.act;
  const visible = () => D.items.filter(i => inAct(i) && (P.area === 'all' || areaOf(i) === P.area) && (!P.mine || i.owner === me()));
  const visibleWait = () => P.mine || (P.area !== 'all' && P.area !== 'client') ? [] : D.waiting.filter(inAct);
  function keyOf(i) { return P.group === 'brand' ? (i.act_id || '') : P.group === 'person' ? (i.owner || '') : P.group === 'due' ? bucketOf(i.due) : areaOf(i); }
  function labelOf(k) {
    if (P.group === 'brand') return brandName(k);
    if (P.group === 'person') return k ? `${k}${k === me() ? ' (you)' : ''}` : 'Nobody yet';
    if (P.group === 'due') return (BUCKETS.find(b => b[0] === k) || [k, k])[1];
    return AREA[k][0];
  }
  function columns(items, all) {
    if (P.group === 'due') return BUCKETS.map(b => b[0]);
    if (P.group === 'area') return [...AREA_KEYS, 'other'].filter(k => all || k !== 'other' || items.some(i => areaOf(i) === 'other'));
    if (P.group === 'person') { const names = [...new Set([...(all ? D.team : []), ...items.map(i => i.owner || '')])]; return names.sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || (D.team.indexOf(a) + 1 || 99) - (D.team.indexOf(b) + 1 || 99) || a.localeCompare(b)); }
    const ids = [...new Set(items.map(i => i.act_id || ''))];
    if (all && H.S.act && H.S.act !== 'all' && !ids.includes(H.S.act)) ids.push(H.S.act);
    return ids.sort((a, b) => (a ? 1 : 0) - (b ? 1 : 0) || brandName(a).localeCompare(brandName(b)));
  }
  const groupsOf = (items, all) => columns(items, all).map(k => ({ key: k, label: labelOf(k), items: items.filter(i => keyOf(i) === k) })).filter(g => all || g.items.length);
  function fromOf(i) {
    if (i.source === 'meeting') return `Call ${short(i.created_at)}`;
    return ({ monday: 'Monday call', today: 'Today’s calls', strategist: 'Strategist', manual: 'Quick add' })[i.source] || 'Quick add';
  }
  function dueHtml(due, open = true) {
    if (!due) return '<span class="tk-due">No date</span>';
    const b = open ? bucketOf(due) : '';
    return `<span class="tk-due${b === 'late' ? ' late' : b === 'today' ? ' now' : ''}">${b === 'today' ? 'Today' : `${esc(short(due))}${b === 'late' ? ', late' : ''}`}</span>`;
  }
  const areaTag = i => { const [l, c] = AREA[areaOf(i)]; return `<span class="tk-tag" style="--ac:${c}">${l}</span>`; };
  const tav = n => n ? `<span class="tk-av" title="${esc(n)}" style="background:${HUE[n] || 'var(--line-strong)'}">${esc(n[0])}</span>` : '<span class="tk-av" title="Nobody yet" style="background:var(--line-strong);color:var(--ink)">?</span>';

  /* ---------- List ---------- */
  function rowHtml(i, done) {
    return `<div class="tk-tr tk-row${done ? ' done' : ''}${window.ACT_OPEN === i.id ? ' hi' : ''}" data-id="${esc(i.id)}">
      <button class="tk-tick" data-tick aria-label="${done ? 'Put it back on the list' : 'Mark it done'}" title="${done ? 'Put it back' : 'Done'}"></button>
      <span class="t">${esc(i.text)}</span><span class="s hm">${esc(brandName(i.act_id))}</span><span class="hm">${areaTag(i)}</span><span class="s hm">${esc(fromOf(i))}</span>${tav(i.owner)}${done ? `<span class="tk-due">${esc(short(i.done_at))}</span>` : dueHtml(i.due)}</div>`;
  }
  function waitRow(w) {
    const done = w.status !== 'open';
    return `<div class="tk-tr tk-row${done ? ' done' : ''}" data-wait="${esc(w.id)}" title="Closes when the client marks it done in Requests">
      <span class="tk-tick wait" aria-hidden="true"></span><span class="t">${esc(w.title)}</span><span class="s hm">${esc(brandName(w.act_id))}</span><span class="hm"><span class="tk-tag" style="--ac:var(--c-amazon)">Client</span></span><span class="s hm">Requests</span><span></span>${done ? `<span class="tk-due">done ${esc(short(w.done_at))}</span>` : dueHtml(w.due)}</div>`;
  }
  function listHtml(items, wait) {
    const groups = groupsOf(items, false);
    const wk = addDays(today(), -((dt(today()).getUTCDay() + 6) % 7));
    const doneWk = (D.done || []).filter(i => i.status === 'done' && inAct(i) && String(i.done_at || '').slice(0, 10) >= wk);
    return `<div style="display:flex;flex-direction:column;gap:14px">
      <div class="tk-tr tk-th"><span></span><span>Task</span><span class="hm">Brand</span><span class="hm">Area</span><span class="hm">From</span><span>Who</span><span style="text-align:right">Due</span></div>
      ${groups.map(g => `<section class="tk-card"><div class="tk-gh"><b>${esc(g.label)}</b><span class="muted">${g.items.length}</span></div>${g.items.map(i => rowHtml(i)).join('')}</section>`).join('')}
      ${wait.length ? `<section class="tk-card"><div class="tk-gh"><b class="wait">Waiting on client</b><span class="muted">${wait.filter(w => w.status === 'open').length}</span></div>${wait.map(waitRow).join('')}</section>` : ''}
      ${!groups.length && !wait.length ? `<section class="tk-card"><div class="tk-empty">${P.mine || P.area !== 'all' ? 'Nothing here with these filters.' : 'Nothing open. Every task is done.'}</div></section>` : ''}
      <div class="tk-foot muted"><span>Done this week · ${doneWk.length}</span>${doneWk.length ? `<button class="tk-link" id="tkDoneShow">${SHOW_DONE ? 'Hide' : 'Show'}</button>` : ''}</div>
      ${SHOW_DONE && doneWk.length ? `<section class="tk-card">${doneWk.map(i => rowHtml(i, true)).join('')}</section>` : ''}
    </div>`;
  }

  /* ---------- Board ---------- */
  function cardHtml(i) {
    return `<div class="tk-bc" draggable="true" data-id="${esc(i.id)}"><div class="t">${esc(i.text)}</div>
      <div class="r">${areaTag(i)}<span class="s">${esc(brandName(i.act_id))}</span><span style="flex:1"></span>${tav(i.owner)}</div>
      <div class="r" style="justify-content:space-between"><span class="s">${esc(fromOf(i))}</span>${dueHtml(i.due)}</div></div>`;
  }
  function boardHtml(items, wait) {
    const cols = groupsOf(items, true);
    return `<div class="tk-board">${cols.map(g => `<section class="tk-col" data-col="${esc(g.key)}"${P.group === 'due' && g.key === 'late' ? ' data-nodrop' : ''}>
        <div class="tk-gh"><b>${esc(g.label)}</b><span class="muted">${g.items.length}</span></div>${g.items.map(cardHtml).join('')}
        ${P.group === 'due' && g.key === 'late' ? '' : `<button class="tk-add" data-addcol="${esc(g.key)}">+ Add</button>`}</section>`).join('')}
      ${wait.length ? `<section class="tk-col"><div class="tk-gh"><b class="wait">Waiting on client</b><span class="muted">${wait.filter(w => w.status === 'open').length}</span></div>${wait.map(w => `<div class="tk-bc wait" data-wait="${esc(w.id)}" title="Closes when the client marks it done in Requests"><div class="t">${esc(w.title)}</div><div class="r"><span class="tk-tag" style="--ac:var(--c-amazon)">Client</span><span class="s">${esc(brandName(w.act_id))}</span><span style="flex:1"></span>${w.status === 'open' ? dueHtml(w.due) : `<span class="tk-due">done ${esc(short(w.done_at))}</span>`}</div></div>`).join('')}</section>` : ''}
    </div>`;
  }
  /* what a drop on (or an add in) a column sets */
  function patchFor(k) {
    if (P.group === 'brand') return { act: k };
    if (P.group === 'person') return { owner: k };
    if (P.group === 'area') return { area: k === 'other' ? '' : k };
    const t = today(), fri = addDays(t, (5 - dt(t).getUTCDay() + 7) % 7);
    return { due: k === 'today' ? t : k === 'week' ? (fri > t && fri <= weekEnd() ? fri : weekEnd()) : k === 'later' ? addDays(weekEnd(), 7) : '' };
  }

  /* ---------- Calendar ---------- */
  function weekHtml(items) {
    const t = today(), mon = addDays(addDays(t, -((dt(t).getUTCDay() + 6) % 7)), CW * 7), sun = addDays(mon, 6);
    const days = [...Array(7)].map((_, n) => addDays(mon, n));
    const later = items.filter(i => !i.due || i.due > sun || i.due < mon).sort((a, b) => (a.due || 'z').localeCompare(b.due || 'z'));
    const head = `${short(mon)} to ${dt(mon).getUTCMonth() === dt(sun).getUTCMonth() ? dt(sun).getUTCDate() : short(sun)}`;
    return `<div class="tk-calh"><div class="nav"><button class="ar" data-cw="-1" aria-label="Previous week">‹</button><b>${esc(head)}</b><button class="ar" data-cw="1" aria-label="Next week">›</button>${CW ? '<button class="tk-link" data-cw="0">This week</button>' : ''}</div>
        <span class="muted">${P.cal === 'week' ? 'Week · <button class="tk-link" data-calv="month">Month</button>' : '<button class="tk-link" data-calv="week">Week</button> · Month'}</span></div>
      <div class="tk-week">${days.map((d, n) => { const its = items.filter(i => i.due === d); return `<section class="tk-day${d === t ? ' today' : ''}${n > 4 ? ' we' : ''}" data-day="${d}"><div class="dh"><span>${esc(dt(d).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }))} ${dt(d).getUTCDate()}</span><span class="muted">${its.length || ''}</span></div>${its.map(i => `<div class="tk-bc" draggable="true" data-id="${esc(i.id)}"><div class="t">${esc(i.text)}</div><div class="r">${areaTag(i)}<span style="flex:1"></span>${tav(i.owner)}</div></div>`).join('')}</section>`; }).join('')}
        <section class="tk-day later" data-day=""><div class="dh"><span>Later / no date</span><span class="muted">${later.length || ''}</span></div>${later.map(i => `<div class="tk-bc" draggable="true" data-id="${esc(i.id)}"><div class="t">${esc(i.text)}</div><div class="r">${areaTag(i)}<span style="flex:1"></span>${dueHtml(i.due)}</div></div>`).join('')}</section></div>`;
  }
  function monthHtml(items) {
    const t = today(), base = dt(t); base.setUTCDate(1); base.setUTCMonth(base.getUTCMonth() + CW);
    const ym = base.toISOString().slice(0, 7), first = `${ym}-01`, start = addDays(first, -((dt(first).getUTCDay() + 6) % 7));
    const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const cells = []; for (let d = start; d <= last || cells.length % 7; d = addDays(d, 1)) cells.push(d);
    const none = items.filter(i => !i.due).length;
    return `<div class="tk-calh"><div class="nav"><button class="ar" data-cw="-1" aria-label="Previous month">‹</button><b>${esc(base.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }))}</b><button class="ar" data-cw="1" aria-label="Next month">›</button>${CW ? '<button class="tk-link" data-cw="0">This month</button>' : ''}</div>
        <span class="muted"><button class="tk-link" data-calv="week">Week</button> · Month</span></div>
      <div class="tk-month">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => `<div class="wd">${w}</div>`).join('')}
        ${cells.map(d => { const its = items.filter(i => i.due === d); return `<div class="tk-mc${d.slice(0, 7) !== ym ? ' out' : ''}${d === t ? ' today' : ''}" data-day="${d}"><span class="n">${dt(d).getUTCDate()}</span>${its.slice(0, 3).map(i => `<div class="it" draggable="true" data-id="${esc(i.id)}" title="${esc(i.text)}">${esc(i.text)}</div>`).join('')}${its.length > 3 ? `<span class="n">+${its.length - 3} more</span>` : ''}</div>`; }).join('')}</div>
      ${none ? `<p class="muted" style="margin:0;font-size:12.5px">${none} with no date. They show in the week view under Later / no date.</p>` : ''}`;
  }

  /* ---------- edit window ---------- */
  function editTask(it) {
    closePop();
    const st = { text: it.text, owner: it.owner || '', due: it.due || '', area: it.area || '', act: it.act_id || '' };
    const w = document.createElement('div'); w.className = 'tk-scrim';
    const draw = () => {
      w.innerHTML = `<div class="tk-modal" role="dialog" aria-modal="true" aria-labelledby="tkEdT"><h3 id="tkEdT">Task</h3>
        <div><div class="lb">What</div><textarea id="tkEdText" maxlength="300">${esc(st.text)}</textarea></div>
        <div class="row"><div><div class="lb">Who</div><button class="tk-pick" id="tkEdWho">${tav(st.owner)}<span>${esc(st.owner || 'Nobody yet')}</span></button></div>
          <div><div class="lb">Due</div>${dueChip(st.due, 'id="tkEdDue"')}</div></div>
        <div><div class="lb">Area</div><div class="chips">${AREA_KEYS.map(k => `<button class="tk-chip${st.area === k ? ' on' : ''}" style="--cc:${AREA[k][1]}" data-area="${k}">${AREA[k][0]}</button>`).join('')}</div></div>
        <div><div class="lb">Brand</div><button class="tk-pick" id="tkEdBrand" style="padding-left:12px">${esc(brandName(st.act))}</button></div>
        <div class="meta">${esc(fromOf(it))}${it.created_by ? `, added by ${esc(firstName(it.created_by))}` : ''}</div>
        <div class="ft"><button class="tk-btn good" id="tkEdDone">Mark done</button><button class="tk-x" id="tkEdDrop">Drop it</button><span class="sp"></span><button class="tk-btn" id="tkEdX">Cancel</button><button class="tk-btn pri" id="tkEdSave">Save</button></div></div>`;
      const ta = $('#tkEdText', w); ta.oninput = () => { st.text = ta.value; };
      $('#tkEdWho', w).onclick = e => ownerMenu(e.currentTarget, st.owner, v => { st.owner = v; draw(); });
      $('#tkEdDue', w).onclick = e => dueMenu(e.currentTarget, st.due, v => { st.due = v; draw(); });
      $$('[data-area]', w).forEach(b => b.onclick = () => { st.area = st.area === b.dataset.area ? '' : b.dataset.area; draw(); });
      $('#tkEdBrand', w).onclick = e => listMenu(e.currentTarget, 'Brand', [{ v: '', label: 'Agency-wide', on: !st.act }, ...D.brands.map(b => ({ v: b.act_id, label: b.name, on: b.act_id === st.act }))], v => { st.act = v; draw(); });
      $('#tkEdX', w).onclick = close;
      $('#tkEdSave', w).onclick = async () => {
        const patch = {};
        const text = st.text.replace(/\s+/g, ' ').trim(); if (!text) { ta.focus(); return; }
        if (text !== it.text) patch.text = text;
        if (st.owner !== (it.owner || '')) patch.owner = st.owner;
        if (st.due !== (it.due || '')) patch.due = st.due;
        if (st.area !== (it.area || '')) patch.area = st.area;
        if (st.act !== (it.act_id || '')) patch.act = st.act;
        close();
        if (Object.keys(patch).length) await edit(it, patch);
      };
      $('#tkEdDone', w).onclick = async () => { close(); await tick(it.id, true); };
      $('#tkEdDrop', w).onclick = async () => {
        close();
        if (window.confirmModal && !(await window.confirmModal('Drop this task?', 'It leaves the list without being marked done. Use it for things that are no longer happening.', 'Drop it'))) return;
        await edit(it, { status: 'dropped' });
      };
    };
    const close = () => { closePop(); w.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape' && !document.querySelector('.tk-pop')) close(); };
    document.addEventListener('keydown', key);
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    draw(); document.body.appendChild(w); $('#tkEdText', w).focus();
  }

  /* ---------- writes ---------- */
  async function edit(it, patch) {
    try {
      const r = await post('/api/actions/edit', { id: it.id, ...patch }); if (r && r.error) throw new Error(r.error);
      if (patch.status === 'dropped') { D.items = D.items.filter(x => x.id !== it.id); toast('Dropped.'); }
      else { if ('act' in patch) it.act_id = patch.act; for (const k of ['text', 'owner', 'due', 'area']) if (k in patch) it[k] = patch[k]; }
      paint();
    } catch (e) { toast(e.message || 'Could not save it.'); await reload(); }
  }
  async function tick(id, done) {
    const row = $(`.tk-row[data-id="${CSS.escape(id)}"]`); if (row) row.classList.toggle('done', done);
    try {
      const r = await post('/api/actions/done', { id, done }); if (r && r.error) throw new Error(r.error);
      toast(done ? 'Done.' : 'Back on the list.');
      setTimeout(reload, done ? 500 : 0);
    } catch (e) { toast(e.message); if (row) row.classList.toggle('done', !done); }
  }
  async function add(text, patch = {}) {
    const act = 'act' in patch ? patch.act : (H.S.act && H.S.act !== 'all' ? H.S.act : '');
    const r = await post('/api/actions', { act, text, owner: patch.owner || '', due: patch.due || '', area: patch.area || '', kind: 'team', source: 'manual' });
    if (r && r.error) throw new Error(r.error);
  }
  async function quick(text) {
    const act = H.S.act && H.S.act !== 'all' ? H.S.act : '';
    try {
      const r = await post('/api/actions/quick', { text, act }); if (!r || r.error || !r.item) throw new Error((r && r.error) || 'no item');
      const p = r.parsed || {};
      toast(`Added${p.owner ? ` for ${p.owner}` : ''}${p.due ? `, due ${md(p.due)}` : ''}${p.act ? `, ${brandName(p.act)}` : ''}${p.area && AREA[p.area] ? `, ${AREA[p.area][0]}` : ''}.`);
    } catch { await add(text); toast('Added as typed.'); }
  }

  /* ---------- the page ---------- */
  function paint() {
    closePop();
    const all = D.items.filter(inAct), t = today();
    const late = all.filter(i => i.due && i.due < t).length, waitN = D.waiting.filter(inAct).filter(w => w.status === 'open').length;
    const items = visible(), wait = visibleWait();
    const seg = (key, opts) => `<div class="tk-seg" role="tablist">${opts.map(([v, l]) => `<button role="tab" aria-selected="${P[key] === v}" class="${P[key] === v ? 'on' : ''}" data-${key}="${v}">${l}</button>`).join('')}</div>`;
    const body = P.view === 'board' ? boardHtml(items, wait) : P.view === 'cal' ? (P.cal === 'month' ? monthHtml(items) : weekHtml(items)) : listHtml(items, wait);
    $('#main').innerHTML = `<div class="v2 tk">
      <header class="tk-head"><div><h1>Tasks</h1><p>What the team owes, from approved calls and quick adds. ${all.length} open, ${late} late, ${waitN} waiting on clients.</p></div>
        <form class="tk-qa" id="tkQa"><label for="tkQuick">Quick add</label><input id="tkQuick" type="text" maxlength="300" placeholder="Dartee raise Prospecting 1 to $400/day by Wed" autocomplete="off"><button type="submit" class="tk-btn pri" id="tkQuickGo">Add</button></form></header>
      <div class="tk-bar"><div class="tk-segw"><span class="lb">View</span>${seg('view', [['list', 'List'], ['board', 'Board'], ['cal', 'Calendar']])}</div>
        <div class="tk-segw"><span class="lb">Group by</span>${seg('group', [['brand', 'Brand'], ['person', 'Person'], ['due', 'Due'], ['area', 'Area']])}</div>
        <span style="flex:1"></span><button class="tk-chip${P.mine ? ' on' : ''}" style="--cc:var(--brand)" id="tkMine" aria-pressed="${P.mine}">Only mine</button></div>
      <div class="tk-areas"><span class="lb" style="margin-right:4px">Area</span>${[['all', 'All', 'var(--ink)'], ...AREA_KEYS.map(k => [k, AREA[k][0], AREA[k][1]]), ...(D.items.some(i => areaOf(i) === 'other') ? [['other', 'Other', AREA.other[1]]] : [])].map(([k, l, c]) => `<button class="tk-chip${P.area === k ? ' on' : ''}" style="--cc:${c}" data-areaf="${k}">${l}</button>`).join('')}</div>
      ${body}
    </div>`;
    wire();
  }
  function wire() {
    const root = $('#main .tk');
    $$('[data-view]', root).forEach(b => b.onclick = () => { P.view = b.dataset.view; CW = 0; save(); paint(); });
    $$('[data-group]', root).forEach(b => b.onclick = () => { P.group = b.dataset.group; save(); paint(); });
    $$('[data-areaf]', root).forEach(b => b.onclick = () => { P.area = b.dataset.areaf; save(); paint(); });
    $('#tkMine', root).onclick = () => { P.mine = !P.mine; save(); paint(); };
    $$('[data-calv]', root).forEach(b => b.onclick = () => { P.cal = b.dataset.calv; CW = 0; save(); paint(); });
    $$('[data-cw]', root).forEach(b => b.onclick = () => { CW = b.dataset.cw === '0' ? 0 : CW + +b.dataset.cw; paint(); });
    const ds = $('#tkDoneShow', root); if (ds) ds.onclick = () => { SHOW_DONE = !SHOW_DONE; paint(); };
    const qa = $('#tkQa', root), qi = $('#tkQuick', root), qg = $('#tkQuickGo', root);
    qa.onsubmit = async e => { e.preventDefault(); const v = qi.value.trim(); if (!v) { qi.focus(); return; } qg.disabled = true; qi.disabled = true; await quick(v); await reload(); const n = $('#tkQuick'); if (n) n.focus(); };
    /* rows: tick, or open the task */
    $$('.tk-row[data-id]', root).forEach(r => {
      const id = r.dataset.id, done = r.classList.contains('done');
      $('[data-tick]', r).onclick = e => { e.stopPropagation(); tick(id, !done); };
      r.onclick = () => { const it = D.items.find(x => x.id === id); if (it) editTask(it); };
    });
    $$('[data-wait]', root).forEach(r => r.onclick = () => { const w = D.waiting.find(x => x.id === r.dataset.wait); if (!w) return; const s = document.getElementById('clientPick'); if (s && w.act_id && H.S.act !== w.act_id) { s.value = w.act_id; s.dispatchEvent(new Event('change')); } H.show('requests'); });
    /* cards on the board and the calendar: click opens, drag moves */
    $$('[draggable="true"][data-id]', root).forEach(c => {
      c.onclick = () => { const it = D.items.find(x => x.id === c.dataset.id); if (it) editTask(it); };
      c.addEventListener('dragstart', e => { DRAG = c.dataset.id; c.classList.add('drag'); try { e.dataTransfer.setData('text/plain', DRAG); e.dataTransfer.effectAllowed = 'move'; } catch {} });
      c.addEventListener('dragend', () => { c.classList.remove('drag'); DRAG = null; $$('.over', root).forEach(x => x.classList.remove('over')); });
    });
    const target = (el, onDrop) => {
      el.addEventListener('dragover', e => { if (!DRAG) return; e.preventDefault(); el.classList.add('over'); });
      el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('over'); });
      el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('over'); const id = DRAG || e.dataTransfer.getData('text/plain'); const it = D.items.find(x => x.id === id); if (it) onDrop(it); });
    };
    $$('.tk-col[data-col]:not([data-nodrop])', root).forEach(col => target(col, it => { const k = col.dataset.col; if (keyOf(it) === k) return; edit(it, patchFor(k)); }));
    $$('[data-day]', root).forEach(day => target(day, it => { const d = day.dataset.day; if ((it.due || '') === d || (!d && !it.due)) return; edit(it, { due: d }); }));
    /* + Add in a board column: the column's value comes with it */
    $$('[data-addcol]', root).forEach(b => b.onclick = () => {
      const k = b.dataset.addcol, inp = document.createElement('input');
      inp.className = 'tk-addin'; inp.placeholder = 'What needs doing? Enter adds'; inp.maxLength = 300; b.replaceWith(inp); inp.focus();
      inp.onkeydown = async e => {
        if (e.key === 'Escape') { paint(); return; }
        if (e.key !== 'Enter' || !inp.value.trim()) return;
        inp.disabled = true;
        try { await add(inp.value.trim(), patchFor(k)); toast('Added.'); await reload(); } catch (er) { toast(er.message); inp.disabled = false; }
      };
      inp.onblur = () => { if (!inp.value.trim() && !inp.disabled) paint(); };
    });
    /* ?open=tasks&item=<id> (Slack reminders) */
    if (window.ACT_OPEN) {
      const id = window.ACT_OPEN; window.ACT_OPEN = null;
      const el = $(`.tk-row[data-id="${CSS.escape(id)}"], [data-id="${CSS.escape(id)}"]`, root);
      const it = D.items.find(x => x.id === id);
      if (el) { el.scrollIntoView({ block: 'center' }); setTimeout(() => el.classList.remove('hi'), 2500); }
      else if (it) editTask(it);
      else if ((D.done || []).some(x => x.id === id)) toast('That task is already done.');
    }
  }
  async function load() {
    const [open, done] = await Promise.all([H.apiAH('/api/actions?act=all&status=open'), H.apiAH('/api/actions?act=all&status=done').catch(() => ({ items: [] }))]);
    if (open && open.error) throw new Error(open.error);
    const cdate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    D = { items: (open.items || []).filter(i => i.kind !== 'brief'), waiting: open.waiting || [], brands: open.brands || [], team: open.team && open.team.length ? open.team : Object.keys(HUE), done: (done && done.items) || [], today: /^\d{4}-\d{2}-\d{2}$/.test(cdate) ? cdate : '' };
  }
  async function reload() { try { await load(); } catch (e) { toast(e.message); } if ($('#main .tk')) paint(); }
  async function render(host, first) {
    H = host; css();
    const t = H.RUN();
    if (first || !D) $('#main').innerHTML = '<div class="v2 tk"><header class="tk-head"><div><h1>Tasks</h1><p>Loading the tasks...</p></div></header></div>';
    try { await load(); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = `<div class="v2 tk"><header class="tk-head"><div><h1>Tasks</h1><p style="color:var(--bad)">${esc(e.message)}</p></div></header></div>`; return; }
    if (t !== H.RUN()) return;
    paint();
  }
  window.TasksTab = { render };
})();
