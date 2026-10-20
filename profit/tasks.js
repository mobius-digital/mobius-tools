/* WORK > TASKS (2026-10-20, the tasks audit; before that the 2026-10-13 fourth pass). A workspace: what the team owes,
 * from calls and quick adds, as a List or a Board (one Group by drives the list sections and the board columns).
 *
 * Cole, 2026-10-20: "so much text on there; these tasks should be easy to read, and if you want details you click
 * into it", "I can't right click on it, it's not like Asana". So:
 *   A task is a SHORT TITLE and the details under it (p_action.detail). The row shows the title, who and when. Nothing
 *   else. Brand only when the list is not grouped by brand. The details, the area, where it came from live in the sheet.
 *   Right-click (long press on a phone) any row or card: Done, Who, Due, Brand, Area, Open, Copy link, Drop.
 *   Click the person or the date on a row to change it in place. Hover shows the ⋯ menu.
 *   Ctrl/Cmd-click or Shift-click selects; the bulk bar does Done / Who / Due / Brand / Drop on all of them.
 *   Keys: ↑ ↓ move, Enter opens, Space ticks done, x selects, w who, t date, m menu, Esc clears.
 *   Quick add: one typed line; account-health /api/actions/quick splits it into title, details, who, when, brand, area.
 *   Waiting on client: the Requests asks still open, last, with a coral dashed tick (they close in Requests).
 * Classic script, own closure; window.TasksTab = { render }.
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
  const firstName = s => String(s || '').split(/[@\s]/)[0].replace(/^./, c => c.toUpperCase());
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const TOUCH = () => matchMedia('(pointer:coarse)').matches;
  const AREA = { ads: ['Ads', 'var(--brand)'], email: ['Email', 'var(--c-email)'], organic: ['Organic', 'var(--c-tiktok)'], site: ['Site', 'var(--warn)'], ops: ['Ops', 'var(--muted)'], client: ['Client', 'var(--c-amazon)'], other: ['Other', 'var(--faint, var(--muted))'] };
  const AREA_KEYS = ['ads', 'email', 'organic', 'site', 'ops', 'client'];
  const areaOf = i => AREA[i.area] ? i.area : 'other';
  const BUCKETS = [['late', 'Late'], ['today', 'Today'], ['week', 'This week'], ['later', 'Later'], ['none', 'No date']];
  let D = null, P = { view: 'list', group: 'brand', area: 'all', mine: false }, SHOW_DONE = false, DRAG = null, SEL = new Set(), ANCHOR = null, FOCUS = null, LP = null;
  try { Object.assign(P, JSON.parse(localStorage.getItem('tk_prefs') || '{}')); } catch {}
  if (!['brand', 'person', 'due', 'area'].includes(P.group)) P.group = 'brand';
  if (!['list', 'board'].includes(P.view)) P.view = 'list';
  const save = () => { try { localStorage.setItem('tk_prefs', JSON.stringify(P)); } catch {} };

  /* ---------- look (tokens only) ---------- */
  function css() {
    if (document.getElementById('tkcss')) return;
    const st = document.createElement('style'); st.id = 'tkcss';
    st.textContent = `
      .tk{display:flex;flex-direction:column;gap:14px;min-width:0}
      .tk .muted{color:var(--muted)}
      .tk .tk-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px 24px;flex-wrap:wrap}
      .tk .tk-head h1{font-size:22px;font-weight:700;margin:0;color:var(--ink)}
      .tk .tk-head p{color:var(--ink-2);margin:4px 0 0;font-size:13.5px}
      .tk .tk-qa{display:flex;gap:8px;align-items:center;margin:0;flex-wrap:wrap}
      .tk .tk-qa input{width:380px;max-width:100%;height:34px;box-sizing:border-box;padding:0 12px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:13px}
      .tk .tk-qa input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}
      .tk .tk-btn{height:34px;padding:0 14px;border-radius:8px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--ink)}
      .tk .tk-btn.pri{background:var(--brand);border-color:var(--brand);color:var(--surface)}
      .tk .tk-btn:disabled{opacity:.55;cursor:default}
      .tk .tk-bar{display:flex;align-items:center;gap:10px 16px;flex-wrap:wrap}
      .tk .tk-bar .lb{font-size:12px;color:var(--muted)}
      .tk .tk-segw{display:flex;align-items:center;gap:8px}
      .tk .tk-seg{display:flex;gap:2px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:2px}
      .tk .tk-seg button{height:28px;padding:0 12px;border-radius:6px;font:inherit;font-size:13px;cursor:pointer;background:transparent;color:var(--muted);border:1px solid transparent}
      .tk .tk-seg button.on{background:var(--surface-2);color:var(--ink);border-color:var(--line-strong)}
      .tk .tk-chip{height:28px;padding:0 10px;border-radius:999px;font:inherit;font-size:12.5px;cursor:pointer;background:transparent;color:var(--ink-2);border:1px solid var(--line-strong);white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
      .tk .tk-chip.on{background:var(--cc,var(--ink));border-color:transparent;color:var(--surface);font-weight:600}
      .tk .tk-hint{font-size:12px;color:var(--muted);margin:-4px 0 0}
      .tk .tk-areas{display:none}
      .tk .tk-card{background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden}
      .tk .tk-gh{display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--surface-2)}
      .tk .tk-gh b{font-weight:600;color:var(--ink);font-size:13px}
      .tk .tk-gh b.wait{color:var(--c-amazon)}
      .tk .tk-gh .n{font-size:12px;color:var(--muted)}
      /* a row: tick · title · who · due · menu */
      .tk .tk-row{display:grid;grid-template-columns:18px minmax(0,1fr) 24px 86px 26px;gap:10px;align-items:center;padding:0 10px 0 14px;min-height:40px;border-top:1px solid var(--line);cursor:default;outline:none;position:relative;user-select:none}
      .tk .tk-row:hover{background:var(--surface-2)}
      .tk .tk-row:focus-visible{box-shadow:inset 0 0 0 2px var(--brand)}
      .tk .tk-row.sel{background:var(--brand-soft)}
      .tk .tk-row.hi{background:var(--brand-soft)}
      .tk .tk-row .t{color:var(--ink);min-width:0;font-size:13.5px;line-height:1.35;display:flex;align-items:center;gap:8px;overflow:hidden}
      .tk .tk-row .t .w{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tk .tk-row.done .t .w{text-decoration:line-through;color:var(--muted)}
      .tk .tk-row .t .b{flex:none;font-size:11px;color:var(--muted);background:var(--surface-2);border:1px solid var(--line);border-radius:4px;padding:1px 6px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tk .tk-row:hover .t .b{background:var(--surface)}
      .tk .tk-row .t .d{flex:none;color:var(--faint,var(--muted));display:inline-flex}
      .tk .tk-tick{width:16px;height:16px;border-radius:50%;border:1.5px solid var(--muted);background:transparent;padding:0;cursor:pointer;flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--surface)}
      .tk .tk-tick:hover{border-color:var(--good);background:color-mix(in srgb,var(--good) 20%,transparent)}
      .tk .tk-row.done .tk-tick{background:var(--good);border-color:var(--good)}
      .tk .tk-tick.wait{border-color:var(--c-amazon);border-style:dashed;cursor:default;background:transparent}
      .tk .tk-av{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#131316;flex:0 0 22px;cursor:pointer;border:0;padding:0;object-fit:cover}
      .tk .tk-av.none{background:transparent;border:1.5px dashed var(--line-strong);color:var(--muted);font-weight:500}
      .tk .tk-av:hover{box-shadow:0 0 0 2px var(--brand-soft)}
      .tk .tk-due{font-size:12px;white-space:nowrap;color:var(--muted);text-align:right;background:none;border:0;padding:4px 6px;border-radius:6px;font:inherit;font-size:12px;cursor:pointer;justify-self:end}
      .tk .tk-due:hover{background:var(--surface);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line-strong)}
      .tk .tk-due.late{color:var(--bad)}.tk .tk-due.now{color:var(--warn)}.tk .tk-due.none{color:var(--faint,var(--muted))}
      .tk .tk-more{width:26px;height:26px;border:0;border-radius:6px;background:transparent;color:var(--muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;opacity:0;padding:0}
      .tk .tk-row:hover .tk-more,.tk .tk-row:focus-within .tk-more,.tk .tk-bc:hover .tk-more{opacity:1}
      .tk .tk-more:hover{background:var(--surface);color:var(--ink)}
      .tk .tk-foot{display:flex;align-items:center;gap:10px;padding:4px 2px;font-size:13px}
      .tk .tk-link{background:none;border:0;color:var(--brand);font:inherit;font-size:13px;cursor:pointer;padding:0}
      .tk .tk-empty{color:var(--muted);font-size:13.5px;padding:14px}
      /* the board */
      .tk .tk-board{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;align-items:flex-start;min-width:0}
      .tk .tk-col{flex:0 0 260px;background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:8px;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;min-height:120px;max-height:calc(100vh - 260px)}
      .tk .tk-col.over{border-color:var(--brand)}
      .tk .tk-col .tk-gh{padding:4px 4px 6px;background:none}
      .tk .tk-col .cards{display:flex;flex-direction:column;gap:6px;overflow-y:auto;min-height:20px;scrollbar-width:thin}
      .tk .tk-bc{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:9px 10px;display:flex;flex-direction:column;gap:7px;cursor:grab;outline:none;user-select:none;position:relative}
      .tk .tk-bc:hover{border-color:var(--line-strong)}
      .tk .tk-bc:focus-visible{box-shadow:0 0 0 2px var(--brand)}
      .tk .tk-bc.sel{background:var(--brand-soft);border-color:var(--brand)}
      .tk .tk-bc.drag{opacity:.45}
      .tk .tk-bc .t{color:var(--ink);line-height:1.35;font-size:13px;padding-right:22px}
      .tk .tk-bc .tk-more{position:absolute;top:6px;right:6px}
      .tk .tk-bc .r{display:flex;align-items:center;gap:6px;min-width:0}
      .tk .tk-bc .r .b{font-size:11px;color:var(--muted);background:var(--surface-2);border:1px solid var(--line);border-radius:4px;padding:1px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px}
      .tk .tk-bc .r .tk-due{padding:2px 4px}
      .tk .tk-bc.wait{cursor:default;border-style:dashed;border-color:color-mix(in srgb,var(--c-amazon) 50%,transparent)}
      .tk .tk-add{align-self:flex-start;height:28px;padding:0 10px;border-radius:999px;font:inherit;font-size:12px;cursor:pointer;background:transparent;border:1px dashed var(--line-strong);color:var(--muted)}
      .tk .tk-add:hover{color:var(--ink)}
      .tk .tk-addin{width:100%;box-sizing:border-box;height:32px;padding:0 8px;border-radius:6px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:13px}
      /* the bulk bar */
      .tk-bulk{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9840;display:flex;align-items:center;gap:4px;max-width:calc(100vw - 24px);overflow-x:auto;scrollbar-width:none;background:var(--ink);color:var(--surface);border-radius:12px;padding:6px 6px 6px 14px;font-size:12.5px;box-shadow:0 12px 32px -10px rgba(15,15,25,.4)}
      .tk-bulk b{white-space:nowrap;margin-right:8px;font-weight:600}
      .tk-bulk button{font:inherit;font-size:12.5px;font-weight:500;color:var(--surface);background:rgba(255,255,255,.1);border:0;border-radius:7px;padding:6px 9px;cursor:pointer;white-space:nowrap}
      .tk-bulk button:hover{background:rgba(255,255,255,.18)}
      .tk-bulk button.x{background:none;color:var(--faint,#aaa);font-size:16px;padding:4px 8px}
      /* the sheet */
      .tk-scrim{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9500;padding:16px}
      .tk-modal{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:20px;width:min(520px,100%);display:flex;flex-direction:column;gap:14px;box-shadow:0 18px 44px rgba(0,0,0,.35);max-height:calc(100vh - 32px);overflow:auto}
      .tk-modal .lb{font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin:0 0 6px}
      .tk-modal input.ti{font:inherit;font-size:16px;font-weight:600;color:var(--ink);background:transparent;border:0;border-bottom:1px solid var(--line);padding:4px 0 8px;width:100%;box-sizing:border-box}
      .tk-modal input.ti:focus{outline:none;border-color:var(--brand)}
      .tk-modal textarea{font:inherit;font-size:13.5px;color:var(--ink);background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:8px 10px;width:100%;box-sizing:border-box;min-height:84px;resize:vertical;line-height:1.45}
      .tk-modal textarea:focus{outline:none;border-color:var(--brand)}
      .tk-modal .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .tk-modal .chips{display:flex;gap:6px;flex-wrap:wrap}
      .tk-modal .ft{display:flex;align-items:center;gap:8px;margin-top:2px;flex-wrap:wrap}
      .tk-modal .ft .sp{flex:1}
      .tk-modal .meta{font-size:12px;color:var(--muted)}
      .tk-modal .tk-btn{height:34px;padding:0 14px;border-radius:8px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--ink)}
      .tk-modal .tk-btn.pri{background:var(--brand);border-color:var(--brand);color:var(--surface)}
      .tk-modal .tk-btn.good{color:var(--good)}
      .tk-modal .tk-x{background:none;border:0;color:var(--bad);font:inherit;font-size:13px;cursor:pointer;padding:0}
      .tk-modal .tk-chip{height:30px;padding:0 10px;border-radius:999px;font:inherit;font-size:12.5px;cursor:pointer;background:transparent;color:var(--ink-2);border:1px solid var(--line-strong);display:inline-flex;align-items:center;gap:6px}
      .tk-modal .tk-chip.on{background:var(--cc,var(--ink));border-color:transparent;color:var(--surface);font-weight:600}
      .tk-modal .tk-pick{height:34px;max-width:100%;padding:0 12px 0 6px;border-radius:999px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--ink);font:inherit;font-size:13px;display:inline-flex;align-items:center;gap:8px;cursor:pointer;white-space:nowrap;overflow:hidden}
      .tk-modal .tk-chip.date,.tk-modal .tk-chip.need{height:34px;padding:0 12px}
      .tk-modal .tk-chip.need{color:var(--warn);border-style:dashed}
      .tk-modal .tk-chip.late{color:var(--bad)}
      .tk-modal .tk-av{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#131316;flex:none;object-fit:cover}
      /* menus */
      .tk-pop{position:fixed;z-index:9600;min-width:220px;max-width:320px;max-height:420px;overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:6px;box-shadow:0 12px 32px -10px rgba(15,15,25,.3),0 2px 6px rgba(15,15,25,.08);font-family:inherit;color:var(--ink)}
      .tk-pop .h{font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:6px 10px 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tk-pop button.o{width:100%;min-height:32px;border:0;border-radius:6px;background:transparent;color:var(--ink);font:inherit;font-size:13px;display:flex;align-items:center;gap:9px;padding:6px 10px;cursor:pointer;text-align:left}
      .tk-pop button.o:hover,.tk-pop button.o.on,.tk-pop button.o:focus-visible{background:var(--surface-2);outline:none}
      .tk-pop button.o.on{background:var(--brand-soft)}
      .tk-pop button.o small{margin-left:auto;color:var(--muted);font-size:11.5px;padding-left:12px}
      .tk-pop button.o kbd{margin-left:auto;color:var(--faint,var(--muted));font:inherit;font-size:11px;padding-left:12px}
      .tk-pop button.o.danger{color:var(--bad)}
      .tk-pop hr{border:0;border-top:1px solid var(--line);margin:5px 2px}
      .tk-pop blockquote{margin:4px 10px 8px;font-size:13px;color:var(--ink-2);line-height:1.45}
      .tk-pop .tk-av{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#131316;flex:none;object-fit:cover}
      .tk-pop .cal{padding:4px 4px 2px}
      .tk-pop .cal .mh{display:flex;align-items:center;justify-content:space-between;font-size:12.5px;color:var(--ink-2);padding:2px 4px 6px}
      .tk-pop .cal .mh button{border:0;background:transparent;color:var(--muted);cursor:pointer;width:28px;height:28px;border-radius:6px;font-size:15px}
      .tk-pop .cal .mh button:hover{background:var(--brand-soft);color:var(--ink)}
      .tk-pop .cal .g{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
      .tk-pop .cal .g span{font-size:10.5px;color:var(--muted);padding:2px 0}
      .tk-pop .cal .g button{height:30px;border:0;border-radius:7px;background:transparent;color:var(--ink);font:inherit;font-size:12.5px;cursor:pointer}
      .tk-pop .cal .g button:hover{background:var(--brand-soft)}
      .tk-pop .cal .g button.past{color:var(--muted)}
      .tk-pop .cal .g button.today{box-shadow:inset 0 0 0 1px var(--line-strong)}
      .tk-pop .cal .g button.on{background:var(--brand);color:var(--surface)}
      @media (max-width:760px){
        .tk .tk-qa input{width:100%}.tk .tk-qa{width:100%}
        .tk .tk-row{grid-template-columns:18px minmax(0,1fr) 24px 70px;padding-right:12px}.tk .tk-row .tk-more{display:none}
        .tk .tk-hint{display:none}
        .tk-bulk{left:12px;right:12px;transform:none;bottom:calc(74px + env(safe-area-inset-bottom));max-width:none;border-radius:14px;padding:8px 8px 8px 14px}
        .tk-bulk button{min-height:38px}
        .tk .tk-col{flex:0 0 min(300px,calc(100vw - 48px))}
      }
    `;
    document.head.appendChild(st);
  }

  /* ---------- small helpers ---------- */
  const post = (path, body) => H.apiAH(path, { method: 'POST', body: JSON.stringify(body) });
  const toast = msg => { const t = document.createElement('div'); t.setAttribute('role', 'status'); t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));background:var(--ink);color:var(--surface);padding:10px 16px;border-radius:12px;font-size:13.5px;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,.25)'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 4000); };
  const brandName = id => id ? ((D.brands.find(b => b.act_id === id) || {}).name || id) : 'Agency-wide';
  const today = () => D.today || new Date().toISOString().slice(0, 10);
  const pic = n => (window.ProdSheet && window.ProdSheet.photoOf(n)) || null;   // the person's photo (Google sign-in, else Slack)
  /* tag = 'span' inside another button (a menu row, the sheet's picker): a button in a button breaks out of it */
  const av = (n, attrs = '', tag = 'button') => n && pic(n) ? `<img class="tk-av" ${attrs} title="${esc(n)}" src="${esc(pic(n))}" alt="${esc(n)}" referrerpolicy="no-referrer">` : n ? `<${tag} ${tag === 'button' ? 'type="button"' : ''} class="tk-av" ${attrs} title="${esc(n)}" style="background:${HUE[n] || 'var(--line-strong)'}">${esc(n[0])}</${tag}>` : `<${tag} ${tag === 'button' ? 'type="button"' : ''} class="tk-av none" ${attrs} title="Nobody yet. Click to pick">+</${tag}>`;
  const ICON = {
    chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    cal: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    more: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
    lines: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
    check: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  };
  function dueChip(due, attrs = '', open = true) {
    const t = today();
    if (!due) return `<button class="tk-chip date need" ${attrs}>${ICON.cal}<span>Add a date</span></button>`;
    const cls = !open ? '' : due < t ? ' late' : due === t ? ' now' : '';
    const label = due === t ? 'Today' : due === addDays(t, 1) ? 'Tomorrow' : md(due);
    return `<button class="tk-chip date${cls}" ${attrs}>${ICON.cal}<span>${esc(label)}${cls === ' late' ? ', late' : ''}</span></button>`;
  }

  /* ---------- Locus's own menus (never the browser's select) ---------- */
  let POP = null;
  function closePop() { if (!POP) return; POP.el.remove(); document.removeEventListener('mousedown', POP.out, true); document.removeEventListener('keydown', POP.key, true); POP = null; }
  /** anchor = an element, or {x, y} (a right-click). */
  function pop(anchor, html, wire) {
    closePop();
    const el = document.createElement('div'); el.className = 'tk-pop'; el.setAttribute('role', 'menu'); el.innerHTML = html;
    document.body.appendChild(el);
    const place = () => {
      const w = el.offsetWidth, h = el.offsetHeight;
      let top, left;
      if (anchor instanceof Element) { const r = anchor.getBoundingClientRect(); top = r.bottom + 6; left = r.left; if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6); }
      else { top = anchor.y + 2; left = anchor.x + 2; if (top + h > innerHeight - 8) top = Math.max(8, innerHeight - h - 8); }
      if (left + w > innerWidth - 8) left = Math.max(8, innerWidth - w - 8);
      el.style.top = top + 'px'; el.style.left = left + 'px';
    };
    place();
    const out = e => { if (!el.contains(e.target) && !(anchor instanceof Element && anchor.contains(e.target))) closePop(); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); closePop(); if (anchor instanceof Element) anchor.focus(); } };
    POP = { el, out, key, place };
    setTimeout(() => { document.addEventListener('mousedown', out, true); document.addEventListener('keydown', key, true); }, 0);
    wire(el, place);
    const f = el.querySelector('button.o.on') || el.querySelector('button.o'); if (f) f.focus({ preventScroll: true });
  }
  function ownerMenu(anchor, cur, onPick, { none = true, title = 'Who does it' } = {}) {
    const names = [...new Set([...(D.team || []), ...(cur && !D.team.includes(cur) ? [cur] : [])])];
    pop(anchor, `<div class="h">${esc(title)}</div>${names.map(n => `<button class="o${n === cur ? ' on' : ''}" data-v="${esc(n)}">${av(n, '', 'span')}${esc(n)}<small>${esc(ROLE[n] || '')}</small></button>`).join('')}${none ? `<hr><button class="o" data-v="">Nobody yet</button>` : ''}`,
      el => $$('button.o', el).forEach(b => b.onclick = () => { closePop(); onPick(b.dataset.v); }));
  }
  function dueMenu(anchor, cur, onPick, { title = 'Due' } = {}) {
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
    pop(anchor, `<div class="h">${esc(title)}</div>${quick.map(([l, iso]) => `<button class="o${iso === cur ? ' on' : ''}" data-v="${iso}">${l}<small>${esc(md(iso))}</small></button>`).join('')}<hr><div class="cal">${cal()}</div><hr><button class="o" data-v="">No due date</button>`,
      (el, place) => {
        const wire = () => {
          $$('button[data-v]', el).forEach(b => b.onclick = () => { closePop(); onPick(b.dataset.v); });
          $$('.cal [data-m]', el).forEach(b => b.onclick = e => { e.stopPropagation(); const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + +b.dataset.m, 1)); month = d.toISOString().slice(0, 7); $('.cal', el).innerHTML = cal(); wire(); place(); });
        };
        wire();
      });
  }
  function listMenu(anchor, title, opts, onPick) {
    pop(anchor, `${title ? `<div class="h">${esc(title)}</div>` : ''}${opts.map(o => o === '-' ? '<hr>' : `<button class="o${o.on ? ' on' : ''}${o.danger ? ' danger' : ''}" data-v="${esc(o.v)}">${o.html || esc(o.label)}${o.small ? `<small>${esc(o.small)}</small>` : ''}${o.kbd ? `<kbd>${esc(o.kbd)}</kbd>` : ''}</button>`).join('')}`,
      el => $$('button.o', el).forEach(b => b.onclick = () => { closePop(); onPick(b.dataset.v); }));
  }
  const brandMenu = (anchor, cur, onPick) => listMenu(anchor, 'Brand', [{ v: '', label: 'Agency-wide', on: !cur }, ...D.brands.map(b => ({ v: b.act_id, label: b.name, on: b.act_id === cur }))], onPick);
  const areaMenu = (anchor, cur, onPick) => listMenu(anchor, 'Area', [...AREA_KEYS.map(k => ({ v: k, label: AREA[k][0], on: cur === k })), '-', { v: '', label: 'Other', on: !AREA[cur] }], onPick);

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
  /* Inside a group: late first, then by date, no date last. */
  const byDue = (a, b) => (a.due ? 0 : 1) - (b.due ? 0 : 1) || String(a.due).localeCompare(String(b.due)) || String(a.created_at).localeCompare(String(b.created_at));
  const groupsOf = (items, all) => columns(items, all).map(k => ({ key: k, label: labelOf(k), items: items.filter(i => keyOf(i) === k).sort(byDue) })).filter(g => all || g.items.length);
  function fromOf(i) {
    if (i.source === 'meeting') return `From a call, ${short(i.created_at)}`;
    return ({ monday: 'From the Monday call', today: 'From Today’s ad calls', strategist: 'From the Strategist', manual: 'Typed in' })[i.source] || 'Typed in';
  }
  const showBrand = () => P.group !== 'brand' && (!H.S.act || H.S.act === 'all');
  function dueBtn(i, open = true) {
    const b = open && i.due ? bucketOf(i.due) : '';
    const cls = !i.due ? ' none' : b === 'late' ? ' late' : b === 'today' ? ' now' : '';
    const label = !i.due ? 'No date' : b === 'today' ? 'Today' : i.due === addDays(today(), 1) ? 'Tomorrow' : short(i.due);
    return `<button type="button" class="tk-due${cls}" data-due title="${i.due ? esc(md(i.due)) + (b === 'late' ? ', late' : '') + '. Click to change' : 'Add a date'}">${esc(label)}</button>`;
  }
  const brandChip = i => showBrand() ? `<span class="b" title="${esc(brandName(i.act_id))}">${esc(brandName(i.act_id))}</span>` : '';
  const detailMark = i => i.detail ? `<span class="d" title="${esc(i.detail.slice(0, 400))}">${ICON.lines}</span>` : '';

  /* ---------- List ---------- */
  function rowHtml(i, done) {
    return `<div class="tk-row${done ? ' done' : ''}${SEL.has(i.id) ? ' sel' : ''}${window.ACT_OPEN === i.id ? ' hi' : ''}" data-id="${esc(i.id)}" tabindex="0" aria-label="${esc(i.text)}">
      <button type="button" class="tk-tick" data-tick aria-label="${done ? 'Put it back on the list' : 'Mark it done'}" title="${done ? 'Put it back' : 'Done'}">${done ? ICON.check : ''}</button>
      <span class="t">${brandChip(i)}<span class="w">${esc(i.text)}</span>${detailMark(i)}</span>
      ${av(i.owner, 'data-who')}${done ? `<span class="tk-due none" style="cursor:default">done ${esc(short(i.done_at))}</span>` : dueBtn(i)}
      <button type="button" class="tk-more" data-menu aria-label="More" title="More">${ICON.more}</button></div>`;
  }
  function waitRow(w) {
    const done = w.status !== 'open';
    return `<div class="tk-row${done ? ' done' : ''}" data-wait="${esc(w.id)}" tabindex="0" title="The client marks it done in Requests. Click to open.">
      <span class="tk-tick wait" aria-hidden="true"></span><span class="t">${showBrand() ? `<span class="b">${esc(brandName(w.act_id))}</span>` : ''}<span class="w">${esc(w.title)}</span></span><span></span>${done ? `<span class="tk-due none" style="cursor:default">done ${esc(short(w.done_at))}</span>` : `<span class="tk-due${w.due && w.due < today() ? ' late' : ''}" style="cursor:default">${w.due ? esc(short(w.due)) : 'No date'}</span>`}<span></span></div>`;
  }
  function listHtml(items, wait) {
    const groups = groupsOf(items, false);
    const wk = addDays(today(), -((dt(today()).getUTCDay() + 6) % 7));
    const doneWk = (D.done || []).filter(i => i.status === 'done' && inAct(i) && String(i.done_at || '').slice(0, 10) >= wk);
    return `<div style="display:flex;flex-direction:column;gap:12px">
      ${groups.map(g => `<section class="tk-card" data-sec="${esc(g.key)}"><div class="tk-gh"><b>${esc(g.label)}</b><span class="n">${g.items.length}</span></div>${g.items.map(i => rowHtml(i)).join('')}</section>`).join('')}
      ${wait.length ? `<section class="tk-card"><div class="tk-gh"><b class="wait">Waiting on client</b><span class="n">${wait.filter(w => w.status === 'open').length}</span></div>${wait.map(waitRow).join('')}</section>` : ''}
      ${!groups.length && !wait.length ? `<section class="tk-card"><div class="tk-empty">${P.mine || P.area !== 'all' ? 'Nothing here with these filters.' : 'Nothing open. Every task is done.'}</div></section>` : ''}
      <div class="tk-foot muted"><span>Done this week · ${doneWk.length}</span>${doneWk.length ? `<button class="tk-link" id="tkDoneShow">${SHOW_DONE ? 'Hide' : 'Show'}</button>` : ''}</div>
      ${SHOW_DONE && doneWk.length ? `<section class="tk-card">${doneWk.map(i => rowHtml(i, true)).join('')}</section>` : ''}
    </div>`;
  }

  /* ---------- Board ---------- */
  function cardHtml(i) {
    return `<div class="tk-bc${SEL.has(i.id) ? ' sel' : ''}" draggable="${TOUCH() ? 'false' : 'true'}" data-id="${esc(i.id)}" tabindex="0" aria-label="${esc(i.text)}"><div class="t">${esc(i.text)}</div>
      <button type="button" class="tk-more" data-menu aria-label="More" title="More">${ICON.more}</button>
      <div class="r">${av(i.owner, 'data-who')}${brandChip(i)}${detailMark(i)}<span style="flex:1"></span>${dueBtn(i)}</div></div>`;
  }
  function boardHtml(items, wait) {
    const cols = groupsOf(items, true);
    return `<div class="tk-board">${cols.map(g => `<section class="tk-col" data-col="${esc(g.key)}"${P.group === 'due' && g.key === 'late' ? ' data-nodrop' : ''}>
        <div class="tk-gh"><b>${esc(g.label)}</b><span class="n">${g.items.length}</span></div><div class="cards">${g.items.map(cardHtml).join('')}</div>
        ${P.group === 'due' && g.key === 'late' ? '' : `<button class="tk-add" data-addcol="${esc(g.key)}">+ Add</button>`}</section>`).join('')}
      ${wait.length ? `<section class="tk-col"><div class="tk-gh"><b class="wait">Waiting on client</b><span class="n">${wait.filter(w => w.status === 'open').length}</span></div><div class="cards">${wait.map(w => `<div class="tk-bc wait" data-wait="${esc(w.id)}" title="The client marks it done in Requests"><div class="t">${esc(w.title)}</div><div class="r"><span class="b">${esc(brandName(w.act_id))}</span><span style="flex:1"></span>${w.status === 'open' ? `<span class="tk-due${w.due && w.due < today() ? ' late' : ' none'}" style="cursor:default">${w.due ? esc(short(w.due)) : 'No date'}</span>` : `<span class="tk-due none">done ${esc(short(w.done_at))}</span>`}</div></div>`).join('')}</div></section>` : ''}
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

  /* ---------- the task sheet ---------- */
  function editTask(it) {
    closePop();
    const st = { text: it.text, detail: it.detail || '', owner: it.owner || '', due: it.due || '', area: it.area || '', act: it.act_id || '' };
    const w = document.createElement('div'); w.className = 'tk-scrim';
    const draw = () => {
      w.innerHTML = `<div class="tk-modal" role="dialog" aria-modal="true" aria-labelledby="tkEdT">
        <div><input class="ti" id="tkEdText" maxlength="150" value="${esc(st.text)}" placeholder="What needs doing, in a few words" aria-label="Title"></div>
        <div><div class="lb">Details</div><textarea id="tkEdDetail" maxlength="2000" placeholder="Anything the title does not say: the why, the numbers, a link, what exactly.">${esc(st.detail)}</textarea></div>
        <div class="row"><div><div class="lb">Who</div><button class="tk-pick" id="tkEdWho">${av(st.owner, '', 'span')}<span>${esc(st.owner || 'Nobody yet')}</span></button></div>
          <div><div class="lb">Due</div>${dueChip(st.due, 'id="tkEdDue"')}</div></div>
        <div class="row"><div><div class="lb">Brand</div><button class="tk-pick" id="tkEdBrand" style="padding-left:12px">${esc(brandName(st.act))}</button></div>
          <div><div class="lb">Area</div><button class="tk-pick" id="tkEdArea" style="padding-left:12px">${esc(AREA[st.area] ? AREA[st.area][0] : 'Other')}</button></div></div>
        <div class="meta">${esc(fromOf(it))}${it.created_by ? `, added by ${esc(firstName(it.created_by))}` : ''}${it.status === 'done' ? `. Done ${esc(short(it.done_at))}${it.done_by ? ` by ${esc(firstName(it.done_by))}` : ''}` : ''}</div>
        <div class="ft">${it.status === 'done' ? `<button class="tk-btn" id="tkEdDone">Put it back</button>` : `<button class="tk-btn good" id="tkEdDone">Mark done</button>`}<button class="tk-x" id="tkEdDrop">Drop it</button><span class="sp"></span><button class="tk-btn" id="tkEdX">Cancel</button><button class="tk-btn pri" id="tkEdSave">Save</button></div></div>`;
      const ti = $('#tkEdText', w); ti.oninput = () => { st.text = ti.value; };
      ti.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#tkEdSave', w).click(); } };
      const ta = $('#tkEdDetail', w); ta.oninput = () => { st.detail = ta.value; };
      ta.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#tkEdSave', w).click(); } };
      $('#tkEdWho', w).onclick = e => ownerMenu(e.currentTarget, st.owner, v => { st.owner = v; draw(); });
      $('#tkEdDue', w).onclick = e => dueMenu(e.currentTarget, st.due, v => { st.due = v; draw(); });
      $('#tkEdBrand', w).onclick = e => brandMenu(e.currentTarget, st.act, v => { st.act = v; draw(); });
      $('#tkEdArea', w).onclick = e => areaMenu(e.currentTarget, st.area, v => { st.area = v; draw(); });
      $('#tkEdX', w).onclick = close;
      $('#tkEdSave', w).onclick = async () => {
        const patch = {};
        const text = st.text.replace(/\s+/g, ' ').trim(); if (!text) { ti.focus(); return; }
        if (text !== it.text) patch.text = text;
        if (st.detail.trim() !== (it.detail || '')) patch.detail = st.detail.trim();
        if (st.owner !== (it.owner || '')) patch.owner = st.owner;
        if (st.due !== (it.due || '')) patch.due = st.due;
        if (st.area !== (it.area || '')) patch.area = st.area;
        if (st.act !== (it.act_id || '')) patch.act = st.act;
        close();
        if (Object.keys(patch).length) await edit(it, patch);
      };
      $('#tkEdDone', w).onclick = async () => { close(); await tick(it.id, it.status !== 'done'); };
      $('#tkEdDrop', w).onclick = async () => { close(); await drop([it]); };
    };
    const close = () => { closePop(); w.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape' && !document.querySelector('.tk-pop')) close(); };
    document.addEventListener('keydown', key);
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    draw(); document.body.appendChild(w);
    const ti = $('#tkEdText', w); ti.focus(); try { ti.setSelectionRange(ti.value.length, ti.value.length); } catch {}
  }

  /* ---------- the menu (right-click, long press, the ⋯ button, the m key) ---------- */
  function menuFor(anchor, it) {
    const el = anchor instanceof Element ? anchor : null;
    const rowEl = () => $(`[data-id="${CSS.escape(it.id)}"]`, $('#main .tk'));
    const done = it.status === 'done';
    listMenu(anchor, it.text.length > 46 ? it.text.slice(0, 44) + '…' : it.text, [
      { v: 'done', label: done ? 'Put it back' : 'Mark done', kbd: 'Space' },
      { v: 'open', label: 'Open', kbd: 'Enter' },
      '-',
      { v: 'who', label: it.owner ? `Who: ${it.owner}` : 'Who does it', kbd: 'w' },
      { v: 'due', label: it.due ? `Due: ${short(it.due)}` : 'Due date', kbd: 't' },
      { v: 'brand', label: `Brand: ${brandName(it.act_id)}` },
      { v: 'area', label: `Area: ${AREA[it.area] ? AREA[it.area][0] : 'Other'}` },
      '-',
      { v: 'select', label: SEL.has(it.id) ? 'Unselect' : 'Select', kbd: 'x' },
      { v: 'link', label: 'Copy link' },
      '-',
      { v: 'drop', label: 'Drop it', danger: true, kbd: 'Del' },
    ], v => {
      const r = rowEl() || el || anchor;
      if (v === 'done') tick(it.id, !done);
      else if (v === 'open') editTask(it);
      else if (v === 'who') ownerMenu(r, it.owner || '', o => edit(it, { owner: o }));
      else if (v === 'due') dueMenu(r, it.due || '', d => edit(it, { due: d }));
      else if (v === 'brand') brandMenu(r, it.act_id || '', b => edit(it, { act: b }));
      else if (v === 'area') areaMenu(r, it.area || '', a => edit(it, { area: a }));
      else if (v === 'select') toggleSel(it.id);
      else if (v === 'link') { const u = it.url || `${location.origin}${location.pathname}?open=tasks${it.act_id ? `&act=${encodeURIComponent(it.act_id)}` : ''}&item=${encodeURIComponent(it.id)}`; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('Link copied.'), () => prompt('Copy the link', u)); }
      else if (v === 'drop') drop([it]);
    });
  }

  /* ---------- selection and the bulk bar ---------- */
  const orderedIds = () => $$('#main .tk [data-id]').map(x => x.dataset.id);
  function toggleSel(id, shift = false) {
    if (shift && ANCHOR && ANCHOR !== id) {
      const list = orderedIds(), a = list.indexOf(ANCHOR), b = list.indexOf(id);
      if (a >= 0 && b >= 0) list.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => SEL.add(x));
    } else { if (SEL.has(id)) SEL.delete(id); else SEL.add(id); ANCHOR = id; }
    $$('#main .tk [data-id]').forEach(x => x.classList.toggle('sel', SEL.has(x.dataset.id)));
    bulk();
  }
  function clearSel() { SEL.clear(); ANCHOR = null; $$('#main .tk .sel').forEach(x => x.classList.remove('sel')); bulk(); }
  const selected = () => [...SEL].map(id => D.items.find(x => x.id === id)).filter(Boolean);
  function bulk() {
    const old = $('.tk-bulk'); if (old) old.remove();
    if (!SEL.size || !$('#main .tk')) return;
    const b = document.createElement('div'); b.className = 'tk-bulk'; b.setAttribute('role', 'toolbar'); b.setAttribute('aria-label', 'Selected tasks');
    b.innerHTML = `<b>${plural(SEL.size, 'task')} selected</b><button data-b="done">Done</button><button data-b="who">Who</button><button data-b="due">Due</button><button data-b="brand">Brand</button><button data-b="drop">Drop</button><button class="x" data-b="x" aria-label="Clear the selection">×</button>`;
    document.body.appendChild(b);
    $$('[data-b]', b).forEach(x => x.onclick = async () => {
      const list = selected(); const k = x.dataset.b;
      if (k === 'x') return clearSel();
      if (k === 'done') { for (const it of list) await tick(it.id, true, true); clearSel(); toast(`${plural(list.length, 'task')} done.`); return reload(); }
      if (k === 'who') return ownerMenu(x, '', o => many(list, { owner: o }), { title: 'Who does all of them' });
      if (k === 'due') return dueMenu(x, '', d => many(list, { due: d }), { title: 'Due, all of them' });
      if (k === 'brand') return brandMenu(x, '', v => many(list, { act: v }));
      if (k === 'drop') return drop(list);
    });
  }
  async function many(list, patch) {
    let n = 0;
    for (const it of list) { try { const r = await post('/api/actions/edit', { id: it.id, ...patch }); if (!r || r.error) throw new Error((r && r.error) || 'no'); n++; } catch {} }
    clearSel(); toast(`Changed ${plural(n, 'task')}.`); await reload();
  }

  /* ---------- writes ---------- */
  async function edit(it, patch) {
    try {
      const r = await post('/api/actions/edit', { id: it.id, ...patch }); if (r && r.error) throw new Error(r.error);
      if ('act' in patch) it.act_id = patch.act;
      for (const k of ['text', 'detail', 'owner', 'due', 'area']) if (k in patch) it[k] = patch[k];
      paint();
    } catch (e) { toast(e.message || 'Could not save it.'); await reload(); }
  }
  async function tick(id, done, quiet = false) {
    const row = $(`#main .tk [data-id="${CSS.escape(id)}"]`); if (row) row.classList.toggle('done', done);
    try {
      const r = await post('/api/actions/done', { id, done }); if (r && r.error) throw new Error(r.error);
      if (!quiet) { toast(done ? 'Done.' : 'Back on the list.'); setTimeout(reload, done ? 450 : 0); }
    } catch (e) { toast(e.message); if (row) row.classList.toggle('done', !done); }
  }
  async function drop(list) {
    const one = list.length === 1;
    if (window.confirmModal && !(await window.confirmModal(one ? 'Drop this task?' : `Drop ${plural(list.length, 'task')}?`, one ? 'It leaves the list without being marked done. Use it for things that are no longer happening.' : 'They leave the list without being marked done.', one ? 'Drop it' : 'Drop them'))) return;
    let n = 0;
    for (const it of list) { try { const r = await post('/api/actions/edit', { id: it.id, status: 'dropped' }); if (!r || r.error) throw new Error(); n++; D.items = D.items.filter(x => x.id !== it.id); } catch {} }
    clearSel(); toast(one ? 'Dropped.' : `Dropped ${plural(n, 'task')}.`); paint();
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
      toast(`Added${p.owner ? ` for ${p.owner}` : ''}${p.due ? `, due ${md(p.due)}` : ''}${p.act ? `, ${brandName(p.act)}` : ''}.`);
    } catch { await add(text); toast('Added as typed.'); }
  }

  /* ---------- the page ---------- */
  function paint() {
    closePop();
    const all = D.items.filter(inAct), t = today();
    const late = all.filter(i => i.due && i.due < t).length, waitN = D.waiting.filter(inAct).filter(w => w.status === 'open').length;
    const items = visible(), wait = visibleWait();
    const seg = (key, opts) => `<div class="tk-seg" role="tablist">${opts.map(([v, l]) => `<button role="tab" aria-selected="${P[key] === v}" class="${P[key] === v ? 'on' : ''}" data-${key}="${v}">${l}</button>`).join('')}</div>`;
    if (P.view === 'cal') P.view = 'list';   // the calendar view is the Calendar rail page (2026-10-15)
    const body = P.view === 'board' ? boardHtml(items, wait) : listHtml(items, wait);
    const areaLabel = P.area === 'all' ? 'Every area' : AREA[P.area] ? AREA[P.area][0] : 'Other';
    $('#main').innerHTML = `<div class="v2 tk">
      <header class="tk-head"><div><h1>Tasks</h1><p>${all.length} open${late ? `, <span style="color:var(--bad)">${late} late</span>` : ''}${waitN ? `, ${waitN} waiting on clients` : ''}.</p></div>
        <form class="tk-qa" id="tkQa"><input id="tkQuick" type="text" maxlength="300" placeholder="Add a task: Dartee raise Prospecting 1 to $400/day by Wed" autocomplete="off" aria-label="Add a task"><button type="submit" class="tk-btn pri" id="tkQuickGo">Add</button></form></header>
      <div class="tk-bar"><div class="tk-segw">${seg('view', [['list', 'List'], ['board', 'Board']])}<button class="tk-link" id="tkToCal" style="margin-left:6px">Calendar &#8599;</button></div>
        <div class="tk-segw"><span class="lb">Group by</span>${seg('group', [['brand', 'Brand'], ['person', 'Person'], ['due', 'Due'], ['area', 'Area']])}</div>
        <button class="tk-chip${P.area !== 'all' ? ' on' : ''}" style="--cc:${P.area !== 'all' && AREA[P.area] ? AREA[P.area][1] : 'var(--ink)'}" id="tkArea">${esc(areaLabel)} ${ICON.chev}</button>
        <button class="tk-chip${P.mine ? ' on' : ''}" style="--cc:var(--brand)" id="tkMine" aria-pressed="${P.mine}">Only mine</button></div>
      <div class="tk-areas" hidden>${[['all', 'Every area'], ...AREA_KEYS.map(k => [k, AREA[k][0]]), ['other', 'Other']].map(([v, l]) => `<button type="button" data-areaf="${v}" class="tk-chip${P.area === v ? ' on' : ''}"${AREA[v] ? ` style="--cc:${AREA[v][1]}"` : ''}>${l}</button>`).join('')}</div>
      ${TOUCH() ? '' : '<p class="tk-hint">Right-click a task for everything. Click the person or the date to change it. Ctrl-click to select a few.</p>'}
      ${body}
    </div>`;
    wire();
    bulk();
  }
  function wire() {
    const root = $('#main .tk');
    $$('.tk-bar [data-view]', root).forEach(b => b.onclick = () => { P.view = b.dataset.view; save(); paint(); });
    $$('.tk-bar [data-group]', root).forEach(b => b.onclick = () => { P.group = b.dataset.group; save(); paint(); });
    $('#tkArea', root).onclick = e => listMenu(e.currentTarget, 'Area', [{ v: 'all', label: 'Every area', on: P.area === 'all' }, '-', ...AREA_KEYS.map(k => ({ v: k, label: AREA[k][0], on: P.area === k })), ...(D.items.some(i => areaOf(i) === 'other') ? [{ v: 'other', label: 'Other', on: P.area === 'other' }] : [])], v => { P.area = v; save(); paint(); });
    $('#tkMine', root).onclick = () => { P.mine = !P.mine; save(); paint(); };
    $$('[data-areaf]', root).forEach(b => b.onclick = () => { P.area = b.dataset.areaf; save(); paint(); });   /* the phone's Filters sheet (phone.js) clicks these */
    /* ONE CALENDAR (2026-10-15): the tasks' calendar is the Calendar rail page, opened on the month with Tasks showing. */
    $('#tkToCal', root).onclick = () => { if (window.CalendarTab && window.CalendarTab.focus) window.CalendarTab.focus('tasks', 'month'); H.show('calendar'); };
    const ds = $('#tkDoneShow', root); if (ds) ds.onclick = () => { SHOW_DONE = !SHOW_DONE; paint(); };
    const qa = $('#tkQa', root), qi = $('#tkQuick', root), qg = $('#tkQuickGo', root);
    qa.onsubmit = async e => { e.preventDefault(); const v = qi.value.trim(); if (!v) { qi.focus(); return; } qg.disabled = true; qi.disabled = true; await quick(v); await reload(); const n = $('#tkQuick'); if (n) n.focus(); };
    const itemOf = el => { const id = el.dataset.id; return D.items.find(x => x.id === id) || (D.done || []).find(x => x.id === id); };
    /* every task, as a row or a card */
    $$('[data-id]', root).forEach(el => {
      const it = itemOf(el); if (!it) return;
      const tk = $('[data-tick]', el); if (tk) tk.onclick = e => { e.stopPropagation(); tick(it.id, it.status === 'done' ? false : !el.classList.contains('done')); };
      const who = $('[data-who]', el); if (who) who.onclick = e => { e.stopPropagation(); ownerMenu(who, it.owner || '', o => edit(it, { owner: o })); };
      const due = $('[data-due]', el); if (due) due.onclick = e => { e.stopPropagation(); dueMenu(due, it.due || '', d => edit(it, { due: d })); };
      const more = $('[data-menu]', el); if (more) more.onclick = e => { e.stopPropagation(); menuFor(more, it); };
      el.onclick = e => {
        if (e.target.closest('button,img,a')) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); toggleSel(it.id, e.shiftKey); return; }
        if (SEL.size && TOUCH()) { toggleSel(it.id); return; }
        editTask(it);
      };
      el.addEventListener('contextmenu', e => { e.preventDefault(); FOCUS = it.id; menuFor({ x: e.clientX, y: e.clientY }, it); });
      /* long press on a phone opens the same menu */
      el.addEventListener('touchstart', e => { const t = e.touches[0]; LP = setTimeout(() => { LP = null; if (navigator.vibrate) navigator.vibrate(8); menuFor({ x: t.clientX, y: t.clientY }, it); }, 480); }, { passive: true });
      for (const ev of ['touchend', 'touchmove', 'touchcancel']) el.addEventListener(ev, () => { if (LP) { clearTimeout(LP); LP = null; } }, { passive: true });
      el.onfocus = () => { FOCUS = it.id; };
      el.onkeydown = e => {
        if (e.target !== el) return;
        const list = $$('[data-id]', root), n = list.indexOf(el);
        const go = i => { const x = list[i]; if (x) { x.focus(); x.scrollIntoView({ block: 'nearest' }); } };
        if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); go(n + 1); }
        else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); go(n - 1); }
        else if (e.key === 'Enter') { e.preventDefault(); editTask(it); }
        else if (e.key === ' ') { e.preventDefault(); tick(it.id, it.status === 'done' ? false : !el.classList.contains('done')); }
        else if (e.key === 'x') { e.preventDefault(); toggleSel(it.id, e.shiftKey); }
        else if (e.key === 'w') { e.preventDefault(); ownerMenu(el, it.owner || '', o => edit(it, { owner: o })); }
        else if (e.key === 't') { e.preventDefault(); dueMenu(el, it.due || '', d => edit(it, { due: d })); }
        else if (e.key === 'm') { e.preventDefault(); menuFor(el, it); }
        else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); drop(SEL.has(it.id) ? selected() : [it]); }
        else if (e.key === 'Escape') { if (SEL.size) clearSel(); else el.blur(); }
      };
    });
    $$('[data-wait]', root).forEach(r => r.onclick = () => { const w = D.waiting.find(x => x.id === r.dataset.wait); if (!w) return; const s = document.getElementById('clientPick'); if (s && w.act_id && H.S.act !== w.act_id) { s.value = w.act_id; s.dispatchEvent(new Event('change')); } H.show('requests'); });
    /* the board: drag moves (the selection moves together) */
    $$('.tk-bc[draggable="true"][data-id]', root).forEach(c => {
      c.addEventListener('dragstart', e => { DRAG = SEL.has(c.dataset.id) ? [...SEL] : [c.dataset.id]; c.classList.add('drag'); try { e.dataTransfer.setData('text/plain', c.dataset.id); e.dataTransfer.effectAllowed = 'move'; } catch {} });
      c.addEventListener('dragend', () => { c.classList.remove('drag'); DRAG = null; $$('.over', root).forEach(x => x.classList.remove('over')); });
    });
    $$('.tk-col[data-col]:not([data-nodrop])', root).forEach(col => {
      col.addEventListener('dragover', e => { if (!DRAG) return; e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
      col.addEventListener('drop', async e => {
        e.preventDefault(); col.classList.remove('over');
        const ids = DRAG || [e.dataTransfer.getData('text/plain')], k = col.dataset.col;
        const list = ids.map(id => D.items.find(x => x.id === id)).filter(it => it && keyOf(it) !== k);
        if (!list.length) return;
        if (list.length === 1) return edit(list[0], patchFor(k));
        await many(list, patchFor(k));
      });
    });
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
      const el = $(`[data-id="${CSS.escape(id)}"]`, root);
      const it = D.items.find(x => x.id === id);
      if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); setTimeout(() => el.classList.remove('hi'), 2500); }
      else if (it) editTask(it);
      else if ((D.done || []).some(x => x.id === id)) toast('That task is already done.');
    } else if (FOCUS) { const el = $(`[data-id="${CSS.escape(FOCUS)}"]`, root); if (el && !document.querySelector('.tk-scrim')) el.focus({ preventScroll: true }); }
  }
  async function load() {
    const [open, done] = await Promise.all([H.apiAH('/api/actions?act=all&status=open'), H.apiAH('/api/actions?act=all&status=done').catch(() => ({ items: [] }))]);
    if (open && open.error) throw new Error(open.error);
    const cdate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    D = { items: (open.items || []).filter(i => i.kind !== 'brief'), waiting: open.waiting || [], brands: open.brands || [], team: open.team && open.team.length ? open.team : Object.keys(HUE), done: (done && done.items) || [], today: /^\d{4}-\d{2}-\d{2}$/.test(cdate) ? cdate : '' };
    const ids = new Set(D.items.map(i => i.id)); SEL = new Set([...SEL].filter(id => ids.has(id)));
  }
  async function reload() { try { await load(); } catch (e) { toast(e.message); } if ($('#main .tk')) paint(); }
  async function render(host, first) {
    if (window.ProdSheet && !(host.S && host.S.client)) await window.ProdSheet.photos(host).catch(() => {});
    H = host; css();
    const t = H.RUN();
    if (first || !D) $('#main').innerHTML = '<div class="v2 tk"><header class="tk-head"><div><h1>Tasks</h1><p>Loading the tasks...</p></div></header></div>';
    try { await load(); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = `<div class="v2 tk"><header class="tk-head"><div><h1>Tasks</h1><p style="color:var(--bad)">${esc(e.message)}</p></div></header></div>`; return; }
    if (t !== H.RUN()) return;
    paint();
  }
  /* leaving the page takes the bulk bar with it */
  document.addEventListener('click', e => { if ($('.tk-bulk') && !$('#main .tk') ) { const b = $('.tk-bulk'); if (b) b.remove(); } }, true);
  window.TasksTab = { render };
})();
