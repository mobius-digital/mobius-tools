/* WORK > TASKS (2026-10-20, on the Locus kit, phase 2 of the UX audit; before that the tasks audit of the same day).
 * A workspace: what the team owes, from calls and quick adds, as a List or a Board (one Group by drives the list
 * sections and the board columns).
 *
 *   The host draws the page header (index.html pageHead); this file puts one "+ Task" button in it (pageActions).
 *   ONE control row: List | Board | Calendar, then four pills: Group, brand (Agency view only), area, Only mine.
 *   Sections carry their count ("Late · 1"); done this week is folded under a Show link.
 *   A row is tick · title · brand chip (only when not grouped by brand) · avatar · due · hover ⋯.
 *   Right-click (long press on a phone) any row or card: Done, Open, Who, Due, Brand, Area, Select, Copy link, Drop.
 *   Click the person or the date on a row to change it in place. Ctrl/Cmd-click or Shift-click selects; the bulk bar
 *   does Done / Who / Due / Brand / Drop on all of them.
 *   Keys: ↑ ↓ j k move, Enter opens, Space ticks done, x selects, w who, t date, m menu, Delete drops, Esc clears.
 *   A task opens in the shared SIDE PANEL (window.V2.panel; a bottom sheet on a phone): title, where it came from
 *   (with a way back to the call, Today's ad calls or the leak), Who / Due / Brand / Area as pill menus, Details,
 *   Mark done, Drop. Every change saves on its own. Without V2.panel the old modal still works.
 *   Board: empty columns are not drawn (a "Show empty columns" link in the control row brings them back).
 *   Waiting on client: the Requests asks still open, last, with a coral dashed tick (they close in Requests).
 * Classic script, own closure; window.TasksTab = { render }. Tokens only, no em dashes, no prompt()/alert().
 * phone.css and phone.js rely on: .tk, .tk-bar, .tk-areas with [data-areaf] buttons, [data-group] buttons inside
 * .tk-bar, #tkMine, #tkArea, .tk-tick, .tk-av, .tk-due, .tk-more, .tk-seg, .tk-chip (the Filters chip).
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
  const GROUPS = [['brand', 'Brand'], ['person', 'Person'], ['due', 'Due'], ['area', 'Area']];
  let D = null, P = { view: 'list', group: 'due', area: 'all', mine: false, brand: '', empties: false }, SHOW_DONE = false, DRAG = null, SEL = new Set(), ANCHOR = null, FOCUS = null, LP = null;
  try { Object.assign(P, JSON.parse(localStorage.getItem('tk_prefs') || '{}')); } catch {}
  if (!['brand', 'person', 'due', 'area'].includes(P.group)) P.group = 'due';
  if (!['list', 'board'].includes(P.view)) P.view = 'list';
  if (typeof P.brand !== 'string') P.brand = '';
  const save = () => { try { localStorage.setItem('tk_prefs', JSON.stringify(P)); } catch {} };

  /* ---------- look (the kit's tokens only) ---------- */
  function css() {
    if (document.getElementById('tkcss')) return;
    const st = document.createElement('style'); st.id = 'tkcss';
    st.textContent = `
      .tk{display:flex;flex-direction:column;gap:12px;min-width:0;font-size:14px}
      .tk .muted{color:var(--muted)}
      /* the control row: 32px controls, radius --r-sm */
      .tk .tk-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .tk .tk-segw{display:flex;align-items:center;gap:8px}
      .tk .tk-seg{display:inline-flex;gap:2px;padding:3px;height:32px;box-sizing:border-box;background:var(--surface-2);border-radius:var(--r-lg)}
      .tk .tk-seg button{height:26px;padding:0 12px;border:0;border-radius:var(--r-sm);background:transparent;color:var(--muted);font:inherit;font-size:13px;font-weight:550;cursor:pointer;white-space:nowrap}
      .tk .tk-seg button:hover{color:var(--ink)}
      .tk .tk-seg button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.18)}
      .tk .tk-pill,.tk-pn .tk-pill{height:32px;max-width:100%;padding:0 9px 0 11px;border-radius:var(--r-sm);border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;box-sizing:border-box}
      .tk .tk-pill:hover,.tk-pn .tk-pill:hover{border-color:var(--ink-2)}
      .tk .tk-pill .k,.tk-pn .tk-pill .k{color:var(--muted)}
      .tk .tk-pill > span,.tk-pn .tk-pill > span{overflow:hidden;text-overflow:ellipsis}
      .tk .tk-pill svg,.tk-pn .tk-pill svg{color:var(--muted);flex:none}
      .tk .tk-pill.on{background:var(--brand-soft);border-color:var(--brand)}
      .tk-pn .tk-pill.need{border-style:dashed;color:var(--muted)}
      .tk-pn .tk-pill.late{color:var(--bad)}.tk-pn .tk-pill.now{color:var(--warn)}
      .tk .tk-chip{height:32px;padding:0 10px;border-radius:var(--r-sm);font:inherit;font-size:13px;cursor:pointer;background:var(--surface);color:var(--ink);border:1px solid var(--line-strong);white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
      .tk .tk-chip.on{background:var(--brand-soft);border-color:var(--brand)}
      .tk .tk-areas,.tk .tk-hid{display:none}
      .tk .tk-link{background:none;border:0;color:var(--brand);font:inherit;font-size:13px;font-weight:500;cursor:pointer;padding:0;white-space:nowrap}
      .tk .tk-link:hover{text-decoration:underline}
      .tk .tk-btn,.tk-pn .tk-btn,.tk-modal .tk-btn{height:32px;padding:0 12px;border-radius:var(--r-sm);font:inherit;font-size:13px;font-weight:550;cursor:pointer;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
      .tk .tk-btn:hover,.tk-pn .tk-btn:hover,.tk-modal .tk-btn:hover{border-color:var(--ink-2)}
      .tk .tk-btn.pri,.tk-pn .tk-btn.pri,.tk-modal .tk-btn.pri{background:var(--brand);border-color:var(--brand);color:var(--on-brand,var(--surface))}
      .tk .tk-btn.drop,.tk-pn .tk-btn.drop,.tk-modal .tk-btn.drop{color:var(--bad)}
      .tk .tk-btn:disabled,.tk-pn .tk-btn:disabled{opacity:.55;cursor:default}
      /* a section: 15px/600 title with its count */
      .tk .tk-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden}
      .tk .tk-gh{display:flex;align-items:center;gap:10px;padding:0 14px;min-height:40px;box-sizing:border-box}
      .tk .tk-gh h3{margin:0;font-size:15px;font-weight:600;color:var(--ink);line-height:1.3;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tk .tk-gh h3 .n{color:var(--muted);font-weight:500;font-size:13px;margin-left:5px}
      .tk .tk-gh h3.wait{color:var(--c-amazon)}
      .tk .tk-gh.done{padding:0 2px;min-height:32px}
      .tk .tk-empty{color:var(--muted);font-size:14px;padding:12px 14px}
      /* a row: tick · title · who · due · menu (40px) */
      .tk .tk-row{display:grid;grid-template-columns:18px minmax(0,1fr) 24px 86px 26px;gap:10px;align-items:center;padding:0 10px 0 14px;min-height:40px;border-top:1px solid var(--line);cursor:default;outline:none;position:relative;user-select:none}
      .tk .tk-row:hover{background:var(--surface-2)}
      .tk .tk-row:focus-visible{box-shadow:inset 0 0 0 2px var(--brand)}
      .tk .tk-row.sel,.tk .tk-row.hi{background:var(--brand-soft)}
      .tk .tk-row .t{color:var(--ink);min-width:0;font-size:14px;line-height:1.35;display:flex;align-items:center;gap:8px;overflow:hidden}
      .tk .tk-row .t .w{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tk .tk-row.done .t .w{text-decoration:line-through;color:var(--muted)}
      .tk .t .b{flex:none;font-size:11px;font-weight:500;color:var(--muted);background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-xs);padding:1px 6px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tk .tk-row:hover .t .b{background:var(--surface)}
      .tk .t .d{flex:none;color:var(--faint,var(--muted));display:inline-flex}
      .tk .tk-tick{width:16px;height:16px;border-radius:50%;border:1.5px solid var(--muted);background:transparent;padding:0;cursor:pointer;flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--surface)}
      .tk .tk-tick:hover{border-color:var(--good);background:color-mix(in srgb,var(--good) 20%,transparent)}
      .tk .done .tk-tick{background:var(--good);border-color:var(--good)}
      .tk .tk-tick.wait{border-color:var(--c-amazon);border-style:dashed;cursor:default;background:transparent}
      .tk .tk-av,.tk-pn .tk-av,.tk-pop .tk-av,.tk-modal .tk-av{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#131316;flex:0 0 22px;cursor:pointer;border:0;padding:0;object-fit:cover}
      .tk-pn .tk-av,.tk-pop .tk-av,.tk-modal .tk-av{width:20px;height:20px;flex-basis:20px;font-size:9px;cursor:inherit}
      .tk .tk-av.none,.tk-pn .tk-av.none{background:transparent;border:1.5px dashed var(--line-strong);color:var(--muted);font-weight:500}
      .tk .tk-av:hover{box-shadow:0 0 0 2px var(--brand-soft)}
      .tk .tk-due{white-space:nowrap;color:var(--muted);text-align:right;background:none;border:0;padding:4px 6px;border-radius:var(--r-sm);font:inherit;font-size:12px;font-weight:500;cursor:pointer;justify-self:end}
      .tk .tk-due:hover{background:var(--surface);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line-strong)}
      .tk .tk-due.late{color:var(--bad)}.tk .tk-due.now{color:var(--warn)}.tk .tk-due.none{color:var(--faint,var(--muted))}
      .tk .tk-more{width:26px;height:26px;border:0;border-radius:var(--r-sm);background:transparent;color:var(--muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;opacity:0;padding:0}
      .tk .tk-row:hover .tk-more,.tk .tk-row:focus-within .tk-more,.tk .tk-bc:hover .tk-more{opacity:1}
      .tk .tk-more:hover{background:var(--surface);color:var(--ink)}
      /* the board */
      .tk .tk-board{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;align-items:flex-start;min-width:0}
      .tk .tk-col{flex:0 0 260px;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-lg);padding:8px;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;min-height:120px;max-height:calc(100vh - 260px)}
      .tk .tk-col.over{border-color:var(--brand)}
      .tk .tk-col .tk-gh{padding:2px 4px 4px;min-height:32px;background:none}
      .tk .tk-col .cards{display:flex;flex-direction:column;gap:6px;overflow-y:auto;min-height:20px;scrollbar-width:thin}
      .tk .tk-bc{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:9px 10px;display:flex;flex-direction:column;gap:7px;cursor:grab;outline:none;user-select:none;position:relative}
      .tk .tk-bc:hover{border-color:var(--line-strong)}
      .tk .tk-bc:focus-visible{box-shadow:0 0 0 2px var(--brand)}
      .tk .tk-bc.sel{background:var(--brand-soft);border-color:var(--brand)}
      .tk .tk-bc.drag{opacity:.45}
      .tk .tk-bc .t{color:var(--ink);line-height:1.35;font-size:14px;padding-right:22px;display:flex;align-items:flex-start;gap:8px}
      .tk .tk-bc .t .tk-tick{margin-top:1px}
      .tk .tk-bc .t .w{min-width:0;overflow-wrap:anywhere}
      .tk .tk-bc.done{opacity:.55}
      .tk .tk-bc.done .t .w{text-decoration:line-through}
      .tk .tk-bc .tk-more{position:absolute;top:6px;right:6px}
      .tk .tk-bc .r{display:flex;align-items:center;gap:6px;min-width:0}
      .tk .tk-bc .r .b{max-width:110px}
      .tk .tk-bc .r .tk-due{padding:2px 4px}
      .tk .tk-bc.wait{cursor:default;border-style:dashed;border-color:color-mix(in srgb,var(--c-amazon) 50%,transparent)}
      .tk .tk-add{align-self:flex-start;height:28px;padding:0 10px;border-radius:var(--r-sm);font:inherit;font-size:12px;font-weight:500;cursor:pointer;background:transparent;border:1px dashed var(--line-strong);color:var(--muted)}
      .tk .tk-add:hover{color:var(--ink)}
      .tk .tk-addin{width:100%;box-sizing:border-box;height:32px;padding:0 8px;border-radius:var(--r-sm);border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:13px}
      .tk .tk-addin:focus{outline:none;border-color:var(--brand)}
      /* the bulk bar */
      .tk-bulk{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9840;display:flex;align-items:center;gap:4px;max-width:calc(100vw - 24px);overflow-x:auto;scrollbar-width:none;background:var(--ink);color:var(--surface);border-radius:var(--r-xl);padding:6px 6px 6px 14px;font-size:12.5px;box-shadow:0 12px 32px -10px rgba(15,15,25,.4)}
      .tk-bulk b{white-space:nowrap;margin-right:8px;font-weight:600}
      .tk-bulk button{font:inherit;font-size:12.5px;font-weight:500;color:var(--surface);background:rgba(255,255,255,.1);border:0;border-radius:var(--r-sm);padding:6px 9px;cursor:pointer;white-space:nowrap}
      .tk-bulk button:hover{background:rgba(255,255,255,.18)}
      .tk-bulk button.x{background:none;color:var(--faint,#aaa);font-size:16px;padding:4px 8px}
      /* the task, in the side panel */
      .tk-pn{display:flex;flex-direction:column;gap:14px;font-size:14px;color:var(--ink)}
      .tk-pn input.ti{font:inherit;font-size:17px;font-weight:600;color:var(--ink);background:transparent;border:0;border-bottom:1px solid var(--line);padding:2px 0 8px;width:100%;box-sizing:border-box}
      .tk-pn input.ti:focus{outline:none;border-color:var(--brand)}
      .tk-pn input.ti.done{text-decoration:line-through;color:var(--muted)}
      .tk-pn .from{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;font-weight:500;color:var(--muted);line-height:1.4}
      .tk-pn .from .tk-btn{height:26px;padding:0 9px;font-size:12px}
      .tk-pn .lb{font-size:12px;font-weight:500;color:var(--muted);margin:0 0 6px}
      .tk-pn .fld{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
      .tk-pn .fld > div{min-width:0}
      .tk-pn .fld .tk-pill{width:100%;justify-content:flex-start}
      .tk-pn .fld .tk-pill svg:last-child{margin-left:auto}
      .tk-pn textarea{font:inherit;font-size:14px;color:var(--ink);background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-sm);padding:8px 10px;width:100%;box-sizing:border-box;min-height:96px;resize:vertical;line-height:1.45}
      .tk-pn textarea:focus{outline:none;border-color:var(--brand)}
      .tk-pn .ft{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:4px;border-top:1px solid var(--line)}
      .tk-pn .ft .sp{flex:1}
      .tk-pn .meta{font-size:12px;font-weight:500;color:var(--muted)}
      /* the old modal: only when the host has no side panel */
      .tk-scrim{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9500;padding:16px}
      .tk-modal{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:var(--r-xl);padding:20px;width:min(520px,100%);display:flex;flex-direction:column;gap:14px;box-shadow:0 18px 44px rgba(0,0,0,.35);max-height:calc(100vh - 32px);overflow:auto}
      .tk-modal .lb{font-size:12px;font-weight:500;color:var(--muted);margin:0 0 6px}
      .tk-modal input.ti{font:inherit;font-size:16px;font-weight:600;color:var(--ink);background:transparent;border:0;border-bottom:1px solid var(--line);padding:4px 0 8px;width:100%;box-sizing:border-box}
      .tk-modal input.ti:focus{outline:none;border-color:var(--brand)}
      .tk-modal textarea{font:inherit;font-size:14px;color:var(--ink);background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-sm);padding:8px 10px;width:100%;box-sizing:border-box;min-height:84px;resize:vertical;line-height:1.45}
      .tk-modal .ft{display:flex;align-items:center;gap:8px;margin-top:2px;flex-wrap:wrap}
      .tk-modal .ft .sp{flex:1}
      .tk-modal .meta{font-size:12px;color:var(--muted)}
      /* menus */
      .tk-pop{position:fixed;z-index:9600;min-width:220px;max-width:320px;max-height:420px;overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:6px;box-shadow:0 12px 32px -10px rgba(15,15,25,.3),0 2px 6px rgba(15,15,25,.08);font-family:inherit;color:var(--ink)}
      .tk-pop .h{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);padding:6px 10px 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tk-pop button.o{width:100%;min-height:32px;border:0;border-radius:var(--r-sm);background:transparent;color:var(--ink);font:inherit;font-size:13px;display:flex;align-items:center;gap:9px;padding:6px 10px;cursor:pointer;text-align:left}
      .tk-pop button.o:hover,.tk-pop button.o.on,.tk-pop button.o:focus-visible{background:var(--surface-2);outline:none}
      .tk-pop button.o.on{background:var(--brand-soft)}
      .tk-pop button.o small{margin-left:auto;color:var(--muted);font-size:11.5px;padding-left:12px}
      .tk-pop button.o kbd{margin-left:auto;color:var(--faint,var(--muted));font:inherit;font-size:11px;padding-left:12px}
      .tk-pop button.o.danger{color:var(--bad)}
      .tk-pop hr{border:0;border-top:1px solid var(--line);margin:5px 2px}
      .tk-pop .cal{padding:4px 4px 2px}
      .tk-pop .cal .mh{display:flex;align-items:center;justify-content:space-between;font-size:12.5px;color:var(--ink-2);padding:2px 4px 6px}
      .tk-pop .cal .mh button{border:0;background:transparent;color:var(--muted);cursor:pointer;width:28px;height:28px;border-radius:var(--r-sm);font-size:15px}
      .tk-pop .cal .mh button:hover{background:var(--brand-soft);color:var(--ink)}
      .tk-pop .cal .g{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
      .tk-pop .cal .g span{font-size:10.5px;color:var(--muted);padding:2px 0}
      .tk-pop .cal .g button{height:30px;border:0;border-radius:var(--r-sm);background:transparent;color:var(--ink);font:inherit;font-size:12.5px;cursor:pointer}
      .tk-pop .cal .g button:hover{background:var(--brand-soft)}
      .tk-pop .cal .g button.past{color:var(--muted)}
      .tk-pop .cal .g button.today{box-shadow:inset 0 0 0 1px var(--line-strong)}
      .tk-pop .cal .g button.on{background:var(--brand);color:var(--surface)}
      @media (max-width:760px){
        .tk .tk-row{grid-template-columns:18px minmax(0,1fr) 24px 70px;padding-right:12px}.tk .tk-row .tk-more{display:none}
        .tk-bulk{left:12px;right:12px;transform:none;bottom:calc(74px + env(safe-area-inset-bottom));max-width:none;border-radius:var(--r-xl);padding:8px 8px 8px 14px}
        .tk-bulk button{min-height:38px}
        .tk .tk-col{flex:0 0 min(300px,calc(100vw - 48px))}
        .tk-pn .fld{grid-template-columns:minmax(0,1fr)}
      }
    `;
    document.head.appendChild(st);
  }

  /* ---------- small helpers ---------- */
  const post = (path, body) => H.apiAH(path, { method: 'POST', body: JSON.stringify(body) });
  const toast = msg => { const t = document.createElement('div'); t.setAttribute('role', 'status'); t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));background:var(--ink);color:var(--surface);padding:10px 16px;border-radius:12px;font-size:13.5px;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,.25)'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 4000); };
  const brandName = id => id ? ((D.brands.find(b => b.act_id === id) || {}).name || id) : 'Agency-wide';
  const today = () => D.today || new Date().toISOString().slice(0, 10);
  const agency = () => !H.S.act || H.S.act === 'all';
  const pic = n => (window.ProdSheet && window.ProdSheet.photoOf(n)) || null;   // the person's photo (Google sign-in, else Slack)
  /* tag = 'span' inside another button (a menu row, a pill): a button in a button breaks out of it */
  const av = (n, attrs = '', tag = 'button') => n && pic(n) ? `<img class="tk-av" ${attrs} title="${esc(n)}" src="${esc(pic(n))}" alt="${esc(n)}" referrerpolicy="no-referrer">` : n ? `<${tag} ${tag === 'button' ? 'type="button"' : ''} class="tk-av" ${attrs} title="${esc(n)}" style="background:${HUE[n] || 'var(--line-strong)'}">${esc(n[0])}</${tag}>` : `<${tag} ${tag === 'button' ? 'type="button"' : ''} class="tk-av none" ${attrs} title="Who">+</${tag}>`;
  const ICON = {
    chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    cal: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    more: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
    lines: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
    check: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  };
  const dueLabel = (due, open = true) => { const t = today(); return !due ? 'Add a date' : due === t ? 'Today' : due === addDays(t, 1) ? 'Tomorrow' : md(due) + (open && due < t ? ', late' : ''); };
  const dueCls = (due, open = true) => { const t = today(); return !due ? ' need' : !open ? '' : due < t ? ' late' : due === t ? ' now' : ''; };
  /* a field pill (the panel and the modal): value + chevron */
  const pill = (id, inner, cls = '') => `<button type="button" class="tk-pill${cls}" id="${id}">${inner}${ICON.chev}</button>`;
  const copyText = async u => { try { await navigator.clipboard.writeText(u); return true; } catch {} try { const ta = document.createElement('textarea'); ta.value = u; ta.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; } };
  /* switch the picker to a brand, then open a page */
  const goBrand = (act, page) => { const s = document.getElementById('clientPick'); if (s && act && H.S.act !== act) { s.value = act; s.dispatchEvent(new Event('change')); } if (page) H.show(page); };

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
  function ownerMenu(anchor, cur, onPick, { none = true, title = 'Who' } = {}) {
    const names = [...new Set([...(D.team || []), ...(cur && !D.team.includes(cur) ? [cur] : [])])];
    pop(anchor, `<div class="h">${esc(title)}</div>${names.map(n => `<button class="o${n === cur ? ' on' : ''}" data-v="${esc(n)}">${av(n, '', 'span')}${esc(n)}<small>${esc(ROLE[n] || '')}</small></button>`).join('')}${none ? `<hr><button class="o" data-v="">Nobody</button>` : ''}`,
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
    pop(anchor, `<div class="h">${esc(title)}</div>${quick.map(([l, iso]) => `<button class="o${iso === cur ? ' on' : ''}" data-v="${iso}">${l}<small>${esc(md(iso))}</small></button>`).join('')}<hr><div class="cal">${cal()}</div><hr><button class="o" data-v="">No date</button>`,
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
  const inAct = i => agency() ? (!P.brand || i.act_id === P.brand) : i.act_id === H.S.act;
  const visible = () => D.items.filter(i => inAct(i) && (P.area === 'all' || areaOf(i) === P.area) && (!P.mine || i.owner === me()));
  const visibleWait = () => P.mine || (P.area !== 'all' && P.area !== 'client') ? [] : D.waiting.filter(inAct);
  const filtered = () => P.mine || P.area !== 'all' || (agency() && !!P.brand);
  function keyOf(i) { return P.group === 'brand' ? (i.act_id || '') : P.group === 'person' ? (i.owner || '') : P.group === 'due' ? bucketOf(i.due) : areaOf(i); }
  function labelOf(k) {
    if (P.group === 'brand') return brandName(k);
    if (P.group === 'person') return k ? `${k}${k === me() ? ' (you)' : ''}` : 'Nobody';
    if (P.group === 'due') return (BUCKETS.find(b => b[0] === k) || [k, k])[1];
    return AREA[k][0];
  }
  function columns(items, all) {
    if (P.group === 'due') return BUCKETS.map(b => b[0]);
    if (P.group === 'area') return [...AREA_KEYS, 'other'].filter(k => all || k !== 'other' || items.some(i => areaOf(i) === 'other'));
    if (P.group === 'person') { const names = [...new Set([...(all ? D.team : []), ...items.map(i => i.owner || '')])]; return names.sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || (D.team.indexOf(a) + 1 || 99) - (D.team.indexOf(b) + 1 || 99) || a.localeCompare(b)); }
    const ids = [...new Set(items.map(i => i.act_id || ''))];
    if (all && !agency() && !ids.includes(H.S.act)) ids.push(H.S.act);
    if (all && agency() && P.brand && !ids.includes(P.brand)) ids.push(P.brand);
    return ids.sort((a, b) => (a ? 1 : 0) - (b ? 1 : 0) || brandName(a).localeCompare(brandName(b)));
  }
  /* Inside a group: late first, then by date, no date last. */
  const byDue = (a, b) => (a.due ? 0 : 1) - (b.due ? 0 : 1) || String(a.due).localeCompare(String(b.due)) || String(a.created_at).localeCompare(String(b.created_at));
  const groupsOf = (items, all) => columns(items, all).map(k => ({ key: k, label: labelOf(k), items: items.filter(i => keyOf(i) === k).sort(byDue) })).filter(g => all || g.items.length);
  /* where a task came from, and the page that shows it */
  function sourceOf(i) {
    if (i.source === 'leak') { const t = i.source_title || i.leak_title || i.text; return { text: `From the leak finder · ${esc(t)} · ${short(i.created_at)}`, go: 'Open the leak', page: i.go || i.source_go || 'leaks' }; }
    if (i.source === 'meeting') return { text: `From a call · ${short(i.created_at)}`, go: i.source_id ? 'Open the call' : '', page: 'calls', meeting: i.source_id };
    if (i.source === 'monday') return { text: 'From the Monday call', go: '', page: '' };
    if (i.source === 'today') return { text: 'From Today’s ad calls', go: 'Open Today', page: 'today' };
    if (i.source === 'strategist') return { text: 'From the Strategist', go: '', page: '' };
    return { text: 'Typed by hand', go: '', page: '' };
  }
  const showBrand = () => P.group !== 'brand' && agency() && !P.brand;
  function dueBtn(i, open = true) {
    const b = open && i.due ? bucketOf(i.due) : '';
    const cls = !i.due ? ' none' : b === 'late' ? ' late' : b === 'today' ? ' now' : '';
    const label = !i.due ? 'No date' : b === 'today' ? 'Today' : i.due === addDays(today(), 1) ? 'Tomorrow' : short(i.due);
    return `<button type="button" class="tk-due${cls}" data-due title="${i.due ? esc(md(i.due)) + (b === 'late' ? ', late' : '') : 'Due'}">${esc(label)}</button>`;
  }
  const brandChip = i => showBrand() ? `<span class="b" title="${esc(brandName(i.act_id))}">${esc(brandName(i.act_id))}</span>` : '';
  const detailMark = i => i.detail ? `<span class="d" title="${esc(i.detail.slice(0, 400))}">${ICON.lines}</span>` : '';
  const secTitle = (label, n, cls = '') => `<h3 class="${cls}">${esc(label)}<span class="n">· ${n}</span></h3>`;
  const emptyLine = () => `<div class="tk-empty">${filtered() ? 'Nothing here. Clear a filter.' : 'No tasks. Add one above.'}</div>`;

  /* ---------- List ---------- */
  function rowHtml(i, done) {
    return `<div class="tk-row${done ? ' done' : ''}${SEL.has(i.id) ? ' sel' : ''}${window.ACT_OPEN === i.id ? ' hi' : ''}" data-id="${esc(i.id)}" tabindex="0" aria-label="${esc(i.text)}">
      <button type="button" class="tk-tick" data-tick aria-label="${done ? 'Put it back' : 'Mark done'}" title="${done ? 'Put it back' : 'Done'}">${done ? ICON.check : ''}</button>
      <span class="t">${brandChip(i)}<span class="w">${esc(i.text)}</span>${detailMark(i)}</span>
      ${av(i.owner, 'data-who')}${done ? `<span class="tk-due none" style="cursor:default">done ${esc(short(i.done_at))}</span>` : dueBtn(i)}
      <button type="button" class="tk-more" data-menu aria-label="More" title="More">${ICON.more}</button></div>`;
  }
  function waitRow(w) {
    const done = w.status !== 'open';
    return `<div class="tk-row${done ? ' done' : ''}" data-wait="${esc(w.id)}" tabindex="0" title="Open in Requests">
      <span class="tk-tick wait" aria-hidden="true"></span><span class="t">${showBrand() ? `<span class="b">${esc(brandName(w.act_id))}</span>` : ''}<span class="w">${esc(w.title)}</span></span><span></span>${done ? `<span class="tk-due none" style="cursor:default">done ${esc(short(w.done_at))}</span>` : `<span class="tk-due${w.due && w.due < today() ? ' late' : ''}" style="cursor:default">${w.due ? esc(short(w.due)) : 'No date'}</span>`}<span></span></div>`;
  }
  function listHtml(items, wait) {
    const groups = groupsOf(items, false);
    const wk = addDays(today(), -((dt(today()).getUTCDay() + 6) % 7));
    const doneWk = (D.done || []).filter(i => i.status === 'done' && inAct(i) && String(i.done_at || '').slice(0, 10) >= wk);
    return `<div style="display:flex;flex-direction:column;gap:12px">
      ${groups.map(g => `<section class="tk-card" data-sec="${esc(g.key)}"><div class="tk-gh">${secTitle(g.label, g.items.length)}</div>${g.items.map(i => rowHtml(i)).join('')}</section>`).join('')}
      ${wait.length ? `<section class="tk-card"><div class="tk-gh">${secTitle('Waiting on client', wait.filter(w => w.status === 'open').length, 'wait')}</div>${wait.map(waitRow).join('')}</section>` : ''}
      ${!groups.length && !wait.length ? `<section class="tk-card">${emptyLine()}</section>` : ''}
      <div class="tk-gh done">${secTitle('Done this week', doneWk.length)}${doneWk.length ? `<button type="button" class="tk-link" id="tkDoneShow">${SHOW_DONE ? 'Hide' : 'Show'}</button>` : ''}</div>
      ${SHOW_DONE && doneWk.length ? `<section class="tk-card">${doneWk.map(i => rowHtml(i, true)).join('')}</section>` : ''}
    </div>`;
  }

  /* ---------- Board ---------- */
  function cardHtml(i) {
    return `<div class="tk-bc${SEL.has(i.id) ? ' sel' : ''}" draggable="${TOUCH() ? 'false' : 'true'}" data-id="${esc(i.id)}" tabindex="0" aria-label="${esc(i.text)}"><div class="t"><button type="button" class="tk-tick" data-tick aria-label="Mark done" title="Done"></button><span class="w">${esc(i.text)}</span></div>
      <button type="button" class="tk-more" data-menu aria-label="More" title="More">${ICON.more}</button>
      <div class="r">${av(i.owner, 'data-who')}${brandChip(i)}${detailMark(i)}<span style="flex:1"></span>${dueBtn(i)}</div></div>`;
  }
  /* empty columns are not drawn unless P.empties: {cols, hidden} */
  function boardCols(items) {
    const all = groupsOf(items, true);
    const cols = P.empties ? all : all.filter(g => g.items.length);
    return { cols, hidden: all.length - cols.length };
  }
  function boardHtml(items, wait) {
    const { cols } = boardCols(items);
    return `<div class="tk-board">${cols.map(g => `<section class="tk-col" data-col="${esc(g.key)}"${P.group === 'due' && g.key === 'late' ? ' data-nodrop' : ''}>
        <div class="tk-gh">${secTitle(g.label, g.items.length)}</div><div class="cards">${g.items.map(cardHtml).join('')}</div>
        ${P.group === 'due' && g.key === 'late' ? '' : `<button type="button" class="tk-add" data-addcol="${esc(g.key)}">+ Add</button>`}</section>`).join('')}
      ${wait.length ? `<section class="tk-col"><div class="tk-gh">${secTitle('Waiting on client', wait.filter(w => w.status === 'open').length, 'wait')}</div><div class="cards">${wait.map(w => `<div class="tk-bc wait" data-wait="${esc(w.id)}" title="Open in Requests"><div class="t">${esc(w.title)}</div><div class="r"><span class="b">${esc(brandName(w.act_id))}</span><span style="flex:1"></span>${w.status === 'open' ? `<span class="tk-due${w.due && w.due < today() ? ' late' : ' none'}" style="cursor:default">${w.due ? esc(short(w.due)) : 'No date'}</span>` : `<span class="tk-due none">done ${esc(short(w.done_at))}</span>`}</div></div>`).join('')}</div></section>` : ''}
      ${!cols.length && !wait.length ? `<section class="tk-card" style="flex:1">${emptyLine()}</section>` : ''}
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

  /* ---------- the task, in the side panel ---------- */
  const hasPanel = () => !!(window.V2 && window.V2.panel);
  function editTask(it) { closePop(); if (hasPanel()) return taskPanel(it); return editModal(it); }
  function fieldsHtml(st, p) {
    return `<div class="fld">
      <div><div class="lb">Who</div>${pill(p + 'Who', `${av(st.owner, '', 'span')}<span>${esc(st.owner || 'Nobody')}</span>`)}</div>
      <div><div class="lb">Due</div>${pill(p + 'Due', `${ICON.cal}<span>${esc(dueLabel(st.due))}</span>`, dueCls(st.due))}</div>
      <div><div class="lb">Brand</div>${pill(p + 'Brand', `<span>${esc(brandName(st.act))}</span>`)}</div>
      <div><div class="lb">Area</div>${pill(p + 'Area', `<span>${esc(AREA[st.area] ? AREA[st.area][0] : 'Other')}</span>`)}</div></div>`;
  }
  function wireFields(root, st, p, onPick) {
    $(`#${p}Who`, root).onclick = e => ownerMenu(e.currentTarget, st.owner, v => { st.owner = v; onPick({ owner: v }); });
    $(`#${p}Due`, root).onclick = e => dueMenu(e.currentTarget, st.due, v => { st.due = v; onPick({ due: v }); });
    $(`#${p}Brand`, root).onclick = e => brandMenu(e.currentTarget, st.act, v => { st.act = v; onPick({ act: v }); });
    $(`#${p}Area`, root).onclick = e => areaMenu(e.currentTarget, st.area, v => { st.area = v; onPick({ area: v }); });
  }
  function taskPanel(it) {
    const done = it.status === 'done';
    const st = { text: it.text, detail: it.detail || '', owner: it.owner || '', due: it.due || '', area: it.area || '', act: it.act_id || '' };
    const body = window.V2.panel(done ? 'Done task' : 'Task', '');
    const src = sourceOf(it);
    let timer = null;
    const saved = msg => { const m = $('#tkPnSaved', body); if (m) { m.textContent = msg; if (msg) setTimeout(() => { if (m.isConnected && m.textContent === msg) m.textContent = ''; }, 1800); } };
    /* the words save on their own: on blur, Enter, Ctrl+Enter, or 800ms after the last keystroke */
    const saveText = async () => {
      clearTimeout(timer); timer = null;
      const patch = {};
      const text = st.text.replace(/\s+/g, ' ').trim();
      if (text && text !== it.text) patch.text = text;
      if (st.detail.trim() !== (it.detail || '')) patch.detail = st.detail.trim();
      if (!Object.keys(patch).length) return;
      await edit(it, patch); saved('Saved');
    };
    const draw = () => {
      body.innerHTML = `<div class="tk-pn">
        <input class="ti${done ? ' done' : ''}" id="tkPnT" maxlength="150" value="${esc(st.text)}" placeholder="Title" aria-label="Title">
        <div class="from"><span>${src.text}${it.created_by ? ` · ${esc(firstName(it.created_by))}` : ''}${done ? ` · done ${esc(short(it.done_at))}${it.done_by ? ` by ${esc(firstName(it.done_by))}` : ''}` : ''}</span>${src.go ? `<button type="button" class="tk-btn" id="tkPnGo">${esc(src.go)}</button>` : ''}</div>
        ${fieldsHtml(st, 'tkPn')}
        <div><div class="lb">Details</div><textarea id="tkPnD" maxlength="2000" placeholder="Details">${esc(st.detail)}</textarea></div>
        <div class="ft"><button type="button" class="tk-btn${done ? '' : ' pri'}" id="tkPnDone">${done ? 'Put it back' : 'Mark done'}</button><button type="button" class="tk-btn drop" id="tkPnDrop">Drop</button><span class="sp"></span><span class="meta" id="tkPnSaved"></span></div>
      </div>`;
      const ti = $('#tkPnT', body); ti.oninput = () => { st.text = ti.value; clearTimeout(timer); timer = setTimeout(saveText, 800); }; ti.onblur = saveText;
      ti.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); saveText(); ti.blur(); } };
      const ta = $('#tkPnD', body); ta.oninput = () => { st.detail = ta.value; clearTimeout(timer); timer = setTimeout(saveText, 800); }; ta.onblur = saveText;
      ta.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveText(); } };
      wireFields(body, st, 'tkPn', async patch => { await edit(it, patch); if (body.isConnected) { draw(); saved('Saved'); } });
      const go = $('#tkPnGo', body); if (go) go.onclick = () => { window.V2.closePanel(); if (src.meeting) window.ACT_MEETING = src.meeting; goBrand(it.act_id, src.page); };
      $('#tkPnDone', body).onclick = async () => { await saveText(); window.V2.closePanel(); await tick(it.id, !done); };
      $('#tkPnDrop', body).onclick = async () => { window.V2.closePanel(); await drop([it]); };
    };
    draw();
    const ti = $('#tkPnT', body); if (!done) { ti.focus(); try { ti.setSelectionRange(ti.value.length, ti.value.length); } catch {} }
  }
  /* + Task: a new task in the same panel. Only words typed = the quick add reads who, when, brand and area from them. */
  function newTask() {
    closePop();
    if (!hasPanel()) return newModal();
    const st = { text: '', detail: '', owner: '', due: '', area: '', act: agency() ? '' : H.S.act };
    const body = window.V2.panel('New task', '');
    const draw = () => {
      body.innerHTML = `<div class="tk-pn">
        <input class="ti" id="tkNwT" maxlength="300" value="${esc(st.text)}" placeholder="Dartee: raise Prospecting 1 to $400 a day by Wed" aria-label="Title">
        ${fieldsHtml(st, 'tkNw')}
        <div><div class="lb">Details</div><textarea id="tkNwD" maxlength="2000" placeholder="Details">${esc(st.detail)}</textarea></div>
        <div class="ft"><button type="button" class="tk-btn pri" id="tkNwAdd">Add</button><span class="sp"></span></div>
      </div>`;
      const ti = $('#tkNwT', body); ti.oninput = () => { st.text = ti.value; };
      ti.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#tkNwAdd', body).click(); } };
      const ta = $('#tkNwD', body); ta.oninput = () => { st.detail = ta.value; };
      ta.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#tkNwAdd', body).click(); } };
      wireFields(body, st, 'tkNw', () => draw());
      $('#tkNwAdd', body).onclick = async () => {
        const text = st.text.replace(/\s+/g, ' ').trim(); if (!text) { ti.focus(); return; }
        const b = $('#tkNwAdd', body); b.disabled = true;
        const plain = !st.owner && !st.due && !st.area && !st.detail.trim() && st.act === (agency() ? '' : H.S.act);
        try {
          if (plain) await quick(text);
          else { await add(text, { owner: st.owner, due: st.due, area: st.area, act: st.act, detail: st.detail.trim() }); toast('Added.'); }
          window.V2.closePanel(); await reload();
        } catch (e) { toast(e.message || 'Could not add it.'); b.disabled = false; }
      };
    };
    draw();
    $('#tkNwT', body).focus();
  }

  /* ---------- the old modal: only when the host has no side panel ---------- */
  function modalShell(html) {
    const w = document.createElement('div'); w.className = 'tk-scrim';
    w.innerHTML = `<div class="tk-modal" role="dialog" aria-modal="true">${html}</div>`;
    const close = () => { closePop(); w.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape' && !document.querySelector('.tk-pop')) close(); };
    document.addEventListener('keydown', key);
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    document.body.appendChild(w);
    return { w, close };
  }
  function editModal(it) {
    const st = { text: it.text, detail: it.detail || '', owner: it.owner || '', due: it.due || '', area: it.area || '', act: it.act_id || '' };
    const src = sourceOf(it);
    let m = null;
    const draw = () => {
      const html = `<div><input class="ti" id="tkEdText" maxlength="150" value="${esc(st.text)}" placeholder="Title" aria-label="Title"></div>
        <div class="meta">${src.text}${it.created_by ? ` · ${esc(firstName(it.created_by))}` : ''}${it.status === 'done' ? ` · done ${esc(short(it.done_at))}` : ''}</div>
        <div class="tk-pn" style="gap:12px">${fieldsHtml(st, 'tkEd')}</div>
        <div><div class="lb">Details</div><textarea id="tkEdDetail" maxlength="2000" placeholder="Details">${esc(st.detail)}</textarea></div>
        <div class="ft"><button type="button" class="tk-btn" id="tkEdDone">${it.status === 'done' ? 'Put it back' : 'Mark done'}</button><button type="button" class="tk-btn drop" id="tkEdDrop">Drop</button><span class="sp"></span><button type="button" class="tk-btn" id="tkEdX">Cancel</button><button type="button" class="tk-btn pri" id="tkEdSave">Save</button></div>`;
      if (m) m.w.firstElementChild.innerHTML = html; else m = modalShell(html);
      const w = m.w;
      const ti = $('#tkEdText', w); ti.oninput = () => { st.text = ti.value; };
      ti.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#tkEdSave', w).click(); } };
      const ta = $('#tkEdDetail', w); ta.oninput = () => { st.detail = ta.value; };
      ta.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#tkEdSave', w).click(); } };
      wireFields(w, st, 'tkEd', () => draw());
      $('#tkEdX', w).onclick = m.close;
      $('#tkEdSave', w).onclick = async () => {
        const patch = {};
        const text = st.text.replace(/\s+/g, ' ').trim(); if (!text) { ti.focus(); return; }
        if (text !== it.text) patch.text = text;
        if (st.detail.trim() !== (it.detail || '')) patch.detail = st.detail.trim();
        if (st.owner !== (it.owner || '')) patch.owner = st.owner;
        if (st.due !== (it.due || '')) patch.due = st.due;
        if (st.area !== (it.area || '')) patch.area = st.area;
        if (st.act !== (it.act_id || '')) patch.act = st.act;
        m.close();
        if (Object.keys(patch).length) await edit(it, patch);
      };
      $('#tkEdDone', w).onclick = async () => { m.close(); await tick(it.id, it.status !== 'done'); };
      $('#tkEdDrop', w).onclick = async () => { m.close(); await drop([it]); };
    };
    draw();
    const ti = $('#tkEdText', m.w); ti.focus(); try { ti.setSelectionRange(ti.value.length, ti.value.length); } catch {}
  }
  function newModal() {
    const m = modalShell(`<div><input class="ti" id="tkNwText" maxlength="300" placeholder="Dartee: raise Prospecting 1 to $400 a day by Wed" aria-label="Title"></div>
      <div class="ft"><span class="sp"></span><button type="button" class="tk-btn" id="tkNwX">Cancel</button><button type="button" class="tk-btn pri" id="tkNwGo">Add</button></div>`);
    const ti = $('#tkNwText', m.w); ti.focus();
    const go = async () => { const v = ti.value.trim(); if (!v) { ti.focus(); return; } $('#tkNwGo', m.w).disabled = true; await quick(v); m.close(); await reload(); };
    ti.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
    $('#tkNwGo', m.w).onclick = go; $('#tkNwX', m.w).onclick = m.close;
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
      { v: 'who', label: it.owner ? `Who: ${it.owner}` : 'Who', kbd: 'w' },
      { v: 'due', label: it.due ? `Due: ${short(it.due)}` : 'Due', kbd: 't' },
      { v: 'brand', label: `Brand: ${brandName(it.act_id)}` },
      { v: 'area', label: `Area: ${AREA[it.area] ? AREA[it.area][0] : 'Other'}` },
      '-',
      { v: 'select', label: SEL.has(it.id) ? 'Unselect' : 'Select', kbd: 'x' },
      { v: 'link', label: 'Copy link' },
      '-',
      { v: 'drop', label: 'Drop', danger: true, kbd: 'Del' },
    ], v => {
      const r = rowEl() || el || anchor;
      if (v === 'done') tick(it.id, !done);
      else if (v === 'open') editTask(it);
      else if (v === 'who') ownerMenu(r, it.owner || '', o => edit(it, { owner: o }));
      else if (v === 'due') dueMenu(r, it.due || '', d => edit(it, { due: d }));
      else if (v === 'brand') brandMenu(r, it.act_id || '', b => edit(it, { act: b }));
      else if (v === 'area') areaMenu(r, it.area || '', a => edit(it, { area: a }));
      else if (v === 'select') toggleSel(it.id);
      else if (v === 'link') { const u = it.url || `${location.origin}${location.pathname}?open=tasks${it.act_id ? `&act=${encodeURIComponent(it.act_id)}` : ''}&item=${encodeURIComponent(it.id)}`; copyText(u).then(ok => toast(ok ? 'Link copied.' : 'Could not copy the link.')); }
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
      if (k === 'done') { for (const it of list) await tick(it.id, true, true); clearSel(); toast(`${plural(list.length, 'task')} done.`); return paint(); }
      if (k === 'who') return ownerMenu(x, '', o => many(list, { owner: o }), { title: 'Who, all of them' });
      if (k === 'due') return dueMenu(x, '', d => many(list, { due: d }), { title: 'Due, all of them' });
      if (k === 'brand') return brandMenu(x, '', v => many(list, { act: v }));
      if (k === 'drop') return drop(list);
    });
  }
  async function many(list, patch) {
    let n = 0;
    for (const it of list) { try { const r = await post('/api/actions/edit', { id: it.id, ...patch }); if (!r || r.error) throw new Error((r && r.error) || 'no'); n++; } catch {} }
    for (const it of list) { if ('act' in patch) it.act_id = patch.act; for (const k of ['owner', 'due']) if (k in patch) it[k] = patch[k]; }
    clearSel(); toast(`Changed ${plural(n, 'task')}.`); paint();
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
  /* Ticking a task changes it here and redraws in place: no reload, the scroll stays put (2026-10-20, Cole). */
  function markLocal(id, done) {
    if (done) {
      const it = D.items.find(x => x.id === id); if (!it) return;
      D.items = D.items.filter(x => x.id !== id); SEL.delete(id);
      D.done = [{ ...it, status: 'done', done_at: new Date().toISOString() }, ...(D.done || []).filter(x => x.id !== id)];
    } else {
      const it = (D.done || []).find(x => x.id === id); if (!it) return;
      D.done = D.done.filter(x => x.id !== id);
      D.items = [...D.items, { ...it, status: 'open', done_at: null }];
    }
  }
  async function tick(id, done, quiet = false) {
    const row = $(`#main .tk [data-id="${CSS.escape(id)}"]`); if (row) row.classList.toggle('done', done);
    try {
      const r = await post('/api/actions/done', { id, done }); if (r && r.error) throw new Error(r.error);
      markLocal(id, done);
      if (!quiet) { toast(done ? 'Done.' : 'Back on the list.'); setTimeout(paint, done ? 450 : 0); }
    } catch (e) { toast(e.message); if (row) row.classList.toggle('done', !done); }
  }
  async function drop(list) {
    const one = list.length === 1;
    if (window.confirmModal && !(await window.confirmModal(one ? 'Drop this task?' : `Drop ${plural(list.length, 'task')}?`, 'Off the list, not marked done.', 'Drop'))) return;
    let n = 0;
    for (const it of list) { try { const r = await post('/api/actions/edit', { id: it.id, status: 'dropped' }); if (!r || r.error) throw new Error(); n++; D.items = D.items.filter(x => x.id !== it.id); } catch {} }
    clearSel(); toast(one ? 'Dropped.' : `Dropped ${plural(n, 'task')}.`); paint();
  }
  async function add(text, patch = {}) {
    const act = 'act' in patch ? patch.act : (agency() ? '' : H.S.act);
    const body = { act, text, owner: patch.owner || '', due: patch.due || '', area: patch.area || '', kind: 'team', source: 'manual' };
    if (patch.detail) body.detail = patch.detail;
    const r = await post('/api/actions', body);
    if (r && r.error) throw new Error(r.error);
  }
  async function quick(text) {
    const act = agency() ? '' : H.S.act;
    try {
      const r = await post('/api/actions/quick', { text, act }); if (!r || r.error || !r.item) throw new Error((r && r.error) || 'no item');
      const p = r.parsed || {};
      toast(`Added${p.owner ? ` for ${p.owner}` : ''}${p.due ? `, due ${md(p.due)}` : ''}${p.act ? `, ${brandName(p.act)}` : ''}.`);
    } catch { await add(text); toast('Added as typed.'); }
  }

  /* ---------- the page ---------- */
  const shell = body => `<div class="v2 tk">${H.pageHead ? H.pageHead('tasks', 'Tasks') : ''}${body}</div>`;
  const actions = html => { const pa = H.pageActions || window.pageActions; if (typeof pa === 'function') { try { pa(html); } catch {} } };
  /* Every redraw keeps the page, the board and each column where they were scrolled. */
  function paint() {
    const sc = [document.scrollingElement, document.querySelector('.content'), document.getElementById('main')].filter(Boolean).map(el => [el, el.scrollTop]);
    const bd = $('#main .tk-board'), bx = bd ? bd.scrollLeft : 0;
    const cols = {}; $$('#main .tk-col[data-col]').forEach(c => { const k = $('.cards', c); if (k) cols[c.dataset.col] = k.scrollTop; });
    draw();
    sc.forEach(([el, y]) => { el.scrollTop = y; });
    const nb = $('#main .tk-board'); if (nb) nb.scrollLeft = bx;
    $$('#main .tk-col[data-col]').forEach(c => { const k = $('.cards', c); if (k && cols[c.dataset.col] != null) k.scrollTop = cols[c.dataset.col]; });
  }
  function draw() {
    closePop();
    const items = visible(), wait = visibleWait();
    if (P.view === 'cal') P.view = 'list';   // the calendar view is the Calendar rail page (2026-10-15)
    const body = P.view === 'board' ? boardHtml(items, wait) : listHtml(items, wait);
    const hidden = P.view === 'board' ? boardCols(items).hidden : 0;
    const groupLabel = (GROUPS.find(g => g[0] === P.group) || GROUPS[2])[1];
    const areaLabel = P.area === 'all' ? 'All areas' : AREA[P.area] ? AREA[P.area][0] : 'Other';
    const seg = `<div class="tk-seg" role="tablist">${[['list', 'List'], ['board', 'Board'], ['cal', 'Calendar']].map(([v, l]) => `<button type="button" role="tab" aria-selected="${P.view === v}" class="${P.view === v ? 'on' : ''}" data-view="${v}"${v === 'cal' ? ' id="tkToCal"' : ''}>${l}</button>`).join('')}</div>`;
    /* the second .tk-segw is the one phone.css folds into the Filters sheet (with #tkArea, #tkMine and .tk-areas) */
    $('#main').innerHTML = shell(`
      <div class="tk-bar">
        <div class="tk-segw">${seg}</div>
        <div class="tk-segw">${pill('tkGroup', `<span class="k">Group:</span><span>${esc(groupLabel)}</span>`)}${agency() ? pill('tkBrand', `<span>${esc(P.brand ? brandName(P.brand) : 'All brands')}</span>`, P.brand ? ' on' : '') : ''}</div>
        ${pill('tkArea', `<span>${esc(areaLabel)}</span>`, P.area !== 'all' ? ' on' : '')}
        <button type="button" class="tk-pill${P.mine ? ' on' : ''}" id="tkMine" aria-pressed="${P.mine}"><span>Only mine</span></button>
        ${hidden || (P.view === 'board' && P.empties) ? `<button type="button" class="tk-link" id="tkEmpties">${P.empties ? 'Hide empty columns' : 'Show empty columns'}</button>` : ''}
        <span class="tk-hid" hidden>${GROUPS.map(([v, l]) => `<button type="button" data-group="${v}" class="${P.group === v ? 'on' : ''}">${l}</button>`).join('')}</span>
      </div>
      <div class="tk-areas" hidden>${[['all', 'All areas'], ...AREA_KEYS.map(k => [k, AREA[k][0]]), ['other', 'Other']].map(([v, l]) => `<button type="button" data-areaf="${v}" class="tk-chip${P.area === v ? ' on' : ''}"${AREA[v] ? ` style="--cc:${AREA[v][1]}"` : ''}>${l}</button>`).join('')}</div>
      ${body}`);
    actions('<button type="button" class="btn primary" id="tkNew">+ Task</button>');
    wire();
    bulk();
  }
  function wire() {
    const root = $('#main .tk');
    const nb = document.getElementById('tkNew'); if (nb) nb.onclick = newTask;
    $$('.tk-bar [data-view]', root).forEach(b => b.onclick = () => {
      /* ONE CALENDAR (2026-10-15): the tasks' calendar is the Calendar rail page, opened on the month with Tasks showing. */
      if (b.dataset.view === 'cal') { if (window.CalendarTab && window.CalendarTab.focus) window.CalendarTab.focus('tasks', 'month'); H.show('calendar'); return; }
      P.view = b.dataset.view; save(); paint();
    });
    $$('.tk-bar [data-group]', root).forEach(b => b.onclick = () => { P.group = b.dataset.group; save(); paint(); });   /* the phone's Filters sheet (phone.js) clicks these */
    $('#tkGroup', root).onclick = e => listMenu(e.currentTarget, 'Group by', GROUPS.map(([v, l]) => ({ v, label: l, on: P.group === v })), v => { P.group = v; save(); paint(); });
    const bp = $('#tkBrand', root); if (bp) bp.onclick = e => listMenu(e.currentTarget, 'Brand', [{ v: '', label: 'All brands', on: !P.brand }, '-', ...D.brands.map(b => ({ v: b.act_id, label: b.name, on: b.act_id === P.brand }))], v => { P.brand = v; save(); paint(); });
    $('#tkArea', root).onclick = e => listMenu(e.currentTarget, 'Area', [{ v: 'all', label: 'All areas', on: P.area === 'all' }, '-', ...AREA_KEYS.map(k => ({ v: k, label: AREA[k][0], on: P.area === k })), ...(D.items.some(i => areaOf(i) === 'other') ? [{ v: 'other', label: 'Other', on: P.area === 'other' }] : [])], v => { P.area = v; save(); paint(); });
    $('#tkMine', root).onclick = () => { P.mine = !P.mine; save(); paint(); };
    $$('[data-areaf]', root).forEach(b => b.onclick = () => { P.area = b.dataset.areaf; save(); paint(); });   /* the phone's Filters sheet (phone.js) clicks these */
    const em = $('#tkEmpties', root); if (em) em.onclick = () => { P.empties = !P.empties; save(); paint(); };
    const ds = $('#tkDoneShow', root); if (ds) ds.onclick = () => { SHOW_DONE = !SHOW_DONE; paint(); };
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
    $$('[data-wait]', root).forEach(r => r.onclick = () => { const w = D.waiting.find(x => x.id === r.dataset.wait); if (!w) return; goBrand(w.act_id, 'requests'); });
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
      inp.className = 'tk-addin'; inp.placeholder = 'Title, Enter adds'; inp.maxLength = 300; inp.setAttribute('aria-label', 'New task'); b.replaceWith(inp); inp.focus();
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
    } else if (FOCUS) {
      /* never steal the focus from the panel or the modal while someone is typing in it */
      const a = document.activeElement, busy = !!(a && (a.closest('#v2panel') || a.closest('.tk-scrim')));
      const el = $(`[data-id="${CSS.escape(FOCUS)}"]`, root); if (el && !busy && !document.querySelector('.tk-scrim')) el.focus({ preventScroll: true });
    }
  }
  async function load() {
    const [open, done] = await Promise.all([H.apiAH('/api/actions?act=all&status=open'), H.apiAH('/api/actions?act=all&status=done').catch(() => ({ items: [] }))]);
    if (open && open.error) throw new Error(open.error);
    const cdate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    D = { items: (open.items || []).filter(i => i.kind !== 'brief'), waiting: open.waiting || [], brands: open.brands || [], team: open.team && open.team.length ? open.team : Object.keys(HUE), done: (done && done.items) || [], today: /^\d{4}-\d{2}-\d{2}$/.test(cdate) ? cdate : '' };
    const ids = new Set(D.items.map(i => i.id)); SEL = new Set([...SEL].filter(id => ids.has(id)));
    if (P.brand && !D.brands.some(b => b.act_id === P.brand)) P.brand = '';
  }
  async function reload() { try { await load(); } catch (e) { toast(e.message); } if ($('#main .tk')) paint(); }
  async function render(host, first) {
    if (window.ProdSheet && !(host.S && host.S.client)) await window.ProdSheet.photos(host).catch(() => {});
    H = host; css();
    const t = H.RUN();
    if (first || !D) $('#main').innerHTML = shell('<section class="tk-card"><div class="tk-empty">Loading tasks...</div></section>');
    try { await load(); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell(`<section class="tk-card"><div class="tk-empty" style="color:var(--bad)">${esc(e.message)}</div></section>`); return; }
    if (t !== H.RUN()) return;
    paint();
  }
  /* leaving the page takes the bulk bar with it */
  document.addEventListener('click', e => { if ($('.tk-bulk') && !$('#main .tk') ) { const b = $('.tk-bulk'); if (b) b.remove(); } }, true);
  window.TasksTab = { render };
})();
