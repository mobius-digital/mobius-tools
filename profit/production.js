/* Work > Production (2026-10-15, the Asana-grade board). Every ad from brief to live: one card per numbered brief, five
 * columns Brief > Making > Review > Ready > Live, a view over p_br_batch served by account-health /api/production.
 *
 * The board (plan: docs/handoffs + the Production Board Plan artifact, Cole: "ours looks like the downgraded version of
 * Asana"): 268px columns that each scroll on their own under a sticky header, the board scrolls sideways under the filter
 * bar, a column collapses to a 44px rail; cards carry everything they know in rows that only show when there is
 * something to say. Act from the outside: right-click, the pencil or "." on a focused card opens the menu (Open, Open in
 * Asana, Copy card link, Move to, Assign to, Due date, Format, Send to the client, Launch to Meta, Duplicate as iteration,
 * Delete card); the avatar, the date and the format pill on the card open the same pickers; arrows move between cards.
 * Select many: the tick on hover, Ctrl/Cmd-click, Shift-click for a range, or Select in the bar; a floating bar at the
 * bottom moves, assigns, dates, sends, launches (one Launch window per card, in turn), copies links or deletes them all;
 * dragging a selected card drags them all. iPhone (under 600px): one column per screen with a column picker and a swipe
 * between columns, Filters in a bottom sheet, a long press opens the menu as a bottom sheet, the bulk bar sits above the
 * tab bar. iPad: 300px columns, the same long press.
 *
 * A drag moves the card in Locus and the task in Asana (Review lives only in Locus). A card opens its sheet
 * (prodsheet.js: the brief, ads, comments); ?card=<id> opens a card (the Slack DM links). A client login gets its own
 * Needs you + Coming up page instead of the board (ProdSheet.client). Own closure, CSS #pd-css, classes .pd-*, tokens
 * only, no em dashes, in-app modals only. */
(() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let OPENED = false;   // the ?card= link is opened once per page load
const dt = iso => new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
const short = iso => iso ? dt(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

const COLS = [
  { k: 'brief', label: 'Brief', hint: 'written, not started', dot: 'var(--muted)' },
  { k: 'making', label: 'Making', hint: 'in the studio', dot: 'var(--brand)' },
  { k: 'review', label: 'Review', hint: 'Cole or client notes', dot: 'var(--warn)' },
  { k: 'ready', label: 'Ready', hint: 'approved, not launched', dot: 'var(--good)' },
  { k: 'live', label: 'Live', hint: 'in the account', dot: 'var(--c-email)' },
];
const COL_OF = Object.fromEntries(COLS.map(c => [c.k, c]));
const FMT = { Static: 'var(--brand)', Video: 'var(--c-email)', UGC: 'var(--c-tiktok)', Carousel: 'var(--c-google)' }; /* never good / warn / bad: those mean status */
const SORTS = [['due', 'Due date'], ['num', 'Number'], ['new', 'Newest first']];

let H = null, D = null, LOADING = null, BRAND = 'all', FORMAT = 'all', ALL_LIVE = false, DRAG = null;
let SORT = 'due', COLLAPSED = new Set(), SEL = new Set(), SELMODE = false, ANCHOR = null, FOCUS = null, PHONE_COL = 'making', MENU = null, KEYS = false, SIZED = false;
try { SORT = localStorage.getItem('pd_sort') || 'due'; COLLAPSED = new Set(JSON.parse(localStorage.getItem('pd_collapsed') || '[]')); PHONE_COL = localStorage.getItem('pd_col') || 'making'; } catch { /* no storage */ }
const remember = (k, v) => { try { localStorage.setItem(k, v); } catch { /* no storage */ } };
const PHONE = () => matchMedia('(max-width:600px)').matches;
const TOUCH = () => matchMedia('(pointer:coarse)').matches;

const post = (path, body) => H.apiAH(path, { method: 'POST', body: JSON.stringify(body) });
const toast = (msg, opts = {}) => {
  $$('.pd-toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.setAttribute('role', 'status'); t.className = 'pd-toast' + (opts.bad ? ' bad' : '');
  t.innerHTML = `<span>${esc(msg)}</span>${opts.undo ? '<button type="button" class="pd-undo">Undo</button>' : ''}`;
  document.body.appendChild(t);
  const timer = setTimeout(() => t.remove(), opts.undo ? 8000 : 4000);
  if (opts.undo) t.querySelector('.pd-undo').onclick = () => { clearTimeout(timer); t.remove(); opts.undo(); };
};
const today = () => (D && D.today) || new Date().toISOString().slice(0, 10);
const initials = name => String(name || '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase();
const av = (n, size = 22) => window.ProdSheet ? window.ProdSheet.av(n, size) : (n ? `<span class="pd-av" title="${esc(n)}">${esc(n[0])}</span>` : '<span class="pd-av pd-none" title="Nobody yet">?</span>');
const openCard = (id, tab) => window.ProdSheet && window.ProdSheet.open(H, id, { tab, onChange: () => render(H, false) });
const ico = (name, size = 14) => window.icon ? window.icon(name, { size }) : '';
const ago = iso => {
  if (!iso) return '';
  const t = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : String(iso).replace(' ', 'T') + 'Z');
  if (!t) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hour${h === 1 ? '' : 's'} ago` : `${Math.round(h / 24)} days ago`;
};
const cardLink = id => `${location.origin}${location.pathname}?open=production&card=${encodeURIComponent(id)}`;

function css() {
  if ($('#pd-css')) return;
  const s = document.createElement('style'); s.id = 'pd-css';
  s.textContent = `
.pd{display:flex;flex-direction:column;gap:12px;min-width:0;font-size:14px}
.pd-head{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap}
.pd-head h1{font-size:22px;font-weight:650;margin:0 0 2px;color:var(--ink);letter-spacing:-.015em}
.pd-head .pd-r{margin-left:auto;display:flex;align-items:center;gap:10px}
.pd-sync{font-size:12px;font-weight:500;color:var(--muted);white-space:nowrap}
.pd-btn{height:var(--ctl-h,32px);padding:0 12px;border-radius:var(--r-sm,6px);border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;font-weight:550;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;transition:border-color var(--t-fast,.12s) var(--ease,ease),background var(--t-fast,.12s) var(--ease,ease)}
.pd-btn:hover{border-color:var(--ink-2)}
.pd-btn.pri{background:var(--brand);border-color:var(--brand);color:var(--on-brand,var(--surface))}
.pd-btn.on{background:var(--ink);border-color:var(--ink);color:var(--surface)}
.pd-btn:disabled{opacity:.5;cursor:default}
/* the control bar (2026-10-20, the kit): one row of pills that show their value, a quiet pill for Archived */
.pd-filt{display:flex;align-items:center;gap:8px;flex-wrap:wrap;position:relative;z-index:2}
.pd-filt .sp{flex:1}
.pd-ctl{height:var(--ctl-h,32px);padding:0 9px 0 11px;border-radius:var(--r-sm,6px);border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;font-weight:550;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;max-width:240px;transition:border-color var(--t-fast,.12s) var(--ease,ease)}
.pd-ctl:hover{border-color:var(--ink-2)}
.pd-ctl .v{min-width:0;overflow:hidden;text-overflow:ellipsis}
.pd-ctl .dot{width:8px;height:8px;border-radius:50%;flex:none}
.pd-ctl svg{flex:none;color:var(--muted)}
.pd-ctl.set{border-color:var(--ink-2)}
.pd-ctl.quiet{border-color:transparent;background:transparent;color:var(--ink-2)}
.pd-ctl.quiet:hover{background:var(--surface-2);color:var(--ink)}
.pd-ctl.on{background:var(--ink);border-color:var(--ink);color:var(--surface)}
.pd-ph{display:none}
.pd-chip{height:var(--ctl-h,32px);padding:0 11px;border-radius:var(--r-sm,6px);border:1px solid var(--line-strong);background:transparent;color:var(--ink-2);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
.pd-chip.on{background:var(--cc,var(--ink));border-color:var(--cc,var(--ink));color:var(--surface);font-weight:600}
/* the board: columns side by side, each its own scroll, the board scrolls sideways under the bar */
.pd-wrap{display:flex;gap:12px;align-items:stretch;overflow-x:auto;overflow-y:hidden;min-width:0;height:var(--pd-h,70vh);padding-bottom:6px;scrollbar-width:thin;scrollbar-color:var(--line-strong) transparent;outline:none}
/* 2026-10-15 polish: the arrow is the cursor on a card (Asana); the hand shows only while a drag or a pan is under way */
.pd-wrap.pan,.pd-wrap.pan *{cursor:grabbing!important}
.pd.dragging .pd-card{cursor:grabbing}
.pd-col{flex:0 0 300px;min-width:0;display:flex;flex-direction:column;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-lg,8px);transition:border-color .12s,background .12s,flex-basis .15s}
.pd-col.over{border-color:var(--brand);background:color-mix(in srgb,var(--brand) 6%,var(--surface-2))}
.pd-col.cl{flex-basis:44px}
.pd-col.cl .pd-cards,.pd-col.cl .pd-ch .n2,.pd-col.cl .pd-ch .ic{display:none}
.pd-col.cl .pd-ch{flex-direction:column;padding:12px 0;gap:8px;writing-mode:vertical-rl;transform:rotate(180deg);justify-content:flex-end;cursor:pointer}
.pd-ch{display:flex;align-items:center;gap:7px;padding:10px 10px 8px 12px;font-size:13px;flex:none;position:relative}
.pd-ch .dot{width:8px;height:8px;border-radius:50%;flex:none}
.pd-ch b{font-weight:600;color:var(--ink);white-space:nowrap}
.pd-ch .n{color:var(--muted)}
.pd-ch .sp{flex:1}
.pd-ch .ic{display:flex;gap:1px;opacity:0;transition:opacity .12s}
.pd-col:hover .pd-ch .ic,.pd-ch .ic:focus-within{opacity:1}
.pd-ch .ic button{width:24px;height:24px;border:0;border-radius:var(--r-sm,6px);background:transparent;color:var(--muted);display:grid;place-items:center;cursor:pointer;padding:0;font:inherit}
.pd-ch .ic button:hover{background:var(--surface);color:var(--ink)}
/* overscroll-behavior-Y only: a column swallows its own vertical overscroll, but a sideways trackpad swipe or Shift+wheel
   over a column must reach the board (contain on both axes ate every horizontal swipe) */
.pd-cards{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:8px;padding:0 12px 12px;scrollbar-width:thin;overscroll-behavior-y:contain}
.pd-card{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg,8px);padding:11px 13px 11px;display:flex;flex-direction:column;gap:7px;cursor:default;user-select:none;box-shadow:0 1px 0 rgba(15,15,20,.02);outline:none}
.pd-card:hover{border-color:var(--line-strong)}
.pd-card:focus-visible{border-color:var(--brand);box-shadow:0 0 0 2px var(--brand-soft)}
.pd-card.sel{border-color:var(--brand);box-shadow:0 0 0 2px var(--brand-soft)}
.pd-card.drag{opacity:.45}
.pd-card.busy{opacity:.6;pointer-events:none}
.pd-tick{position:absolute;top:8px;left:9px;width:16px;height:16px;border-radius:4px;border:1.5px solid var(--line-strong);background:var(--surface);opacity:0;transition:opacity .12s;cursor:pointer;z-index:1}
.pd-card:hover .pd-tick,.pd-card.sel .pd-tick,.pd.selmode .pd-tick,.pd-card:focus-visible .pd-tick{opacity:1}
.pd-card.sel .pd-tick{background:var(--brand);border-color:var(--brand)}
.pd-card.sel .pd-tick::after{content:"";position:absolute;left:4px;top:1px;width:5px;height:9px;border:solid var(--surface);border-width:0 2px 2px 0;transform:rotate(45deg)}
.pd-card:hover .pd-r1,.pd-card.sel .pd-r1,.pd.selmode .pd-r1,.pd-card:focus-visible .pd-r1{padding-left:22px}
.pd-card.has-img:hover .pd-r1,.pd-card.has-img.sel .pd-r1,.pd.selmode .pd-card.has-img .pd-r1{padding-left:0}
.pd-card.has-img .pd-tick{top:8px;left:8px;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.pd-pen{position:absolute;top:7px;right:8px;width:22px;height:22px;border-radius:var(--r-sm,6px);border:1px solid var(--line);background:var(--surface);color:var(--muted);display:grid;place-items:center;opacity:0;cursor:pointer;padding:0;z-index:1}
.pd-card:hover .pd-pen,.pd-card:focus-visible .pd-pen{opacity:1}
.pd-card.has-img .pd-pen{box-shadow:0 1px 4px rgba(0,0,0,.2)}
.pd-pen:hover{color:var(--ink);border-color:var(--line-strong)}
.pd-r1{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);min-width:0;transition:padding .12s}
.pd-r1 .num{font-weight:700;color:var(--ink);white-space:nowrap}
.pd-r1 .br{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pd-r1 .sp{flex:1}
.pd-fmt{font-size:10.5px;padding:1px 7px;border-radius:999px;font-weight:600;color:var(--fc);background:color-mix(in srgb,var(--fc) 14%,transparent);white-space:nowrap;border:0;font-family:inherit;cursor:pointer}
.pd-fmt:hover{background:color-mix(in srgb,var(--fc) 26%,transparent)}
.pd-t{color:var(--ink);line-height:1.3;font-size:14px;font-weight:600;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pd-pills{display:flex;flex-wrap:wrap;gap:4px}
.pd-pill{font-size:10.5px;font-weight:500;padding:1px 7px;border-radius:999px;border:1px solid var(--line-strong);color:var(--ink-2);white-space:nowrap}
.pd-pill.w{background:color-mix(in srgb,var(--warn) 14%,transparent);color:var(--warn);border-color:transparent;font-weight:600}
.pd-pill.b{background:color-mix(in srgb,var(--bad) 12%,transparent);color:var(--bad);border-color:transparent;font-weight:600}
.pd-pill.g{background:color-mix(in srgb,var(--good) 14%,transparent);color:var(--good);border-color:transparent;font-weight:600}
.pd-r3{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:500;color:var(--muted);min-width:0}
.pd-r3 .sp{flex:1}
.pd-r3 .m{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:none}
.pd-due{font:inherit;font-size:12px;font-weight:500;color:var(--muted);background:none;border:0;padding:1px 4px;margin-left:-4px;border-radius:var(--r-xs,4px);cursor:pointer;white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis}
.pd-due:hover{background:var(--surface-2);color:var(--ink)}
.pd-due.late{color:var(--bad);font-weight:600}
.pd-due.soon{color:var(--good)}
.pd-avb{border:0;background:none;padding:0;cursor:pointer;display:inline-flex;border-radius:50%}
.pd-avb:hover{box-shadow:0 0 0 2px var(--brand-soft)}
/* the card's action (Launch to Meta, Open review) is its own last row: a small full-width button that cannot run past the edge */
.pd-r4{display:flex;min-width:0;margin-top:1px}
.pd-act{flex:1;min-width:0;height:28px;padding:0 10px;font:inherit;font-size:12px;font-weight:600;color:var(--brand);background:color-mix(in srgb,var(--brand) 9%,transparent);border:1px solid color-mix(in srgb,var(--brand) 28%,transparent);border-radius:var(--r-sm,6px);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.pd-act:hover{background:color-mix(in srgb,var(--brand) 16%,transparent);border-color:var(--brand)}
.pd-av{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--surface);background:var(--line-strong);flex:none}
.pd-av.pd-none{background:var(--line-strong);color:var(--ink)}
.pd-card .pd-img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--r-sm,6px);background:var(--surface-2);display:block}
.pd-add{height:32px;border:1px dashed var(--line-strong);border-radius:var(--r-sm,6px);background:transparent;color:var(--muted);font:inherit;font-size:13px;font-weight:550;cursor:pointer;flex:none}
.pd-add:hover{color:var(--ink);border-color:var(--ink-2)}
.pd-more{font:inherit;font-size:12px;color:var(--brand);background:none;border:0;padding:4px 2px;cursor:pointer;text-align:left;flex:none}
.pd-empty{font-size:12px;font-weight:500;color:var(--muted);padding:6px 2px}
.pd-sk{height:84px;border-radius:var(--r-lg,8px);background:var(--surface);opacity:.6;flex:none}
/* the menu (right-click, the pencil, a long press), also the pickers */
.pd-menu{position:fixed;z-index:9860;width:236px;max-height:min(70vh,520px);overflow-y:auto;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:var(--r-lg,8px);box-shadow:var(--sh-pop,0 12px 32px -10px rgba(15,15,25,.22),0 2px 6px rgba(15,15,25,.06));padding:6px;font-size:13px;animation:pd-pop .14s var(--ease,ease) both}
.pd-menu .mh{display:flex;align-items:center;gap:8px;padding:6px 10px 4px;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.pd-menu .mh span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pd-menu .mh button{flex:none;font:inherit;font-size:12px;letter-spacing:0;text-transform:none;font-weight:600;color:var(--brand);background:none;border:0;padding:0;cursor:pointer}
.pd-menu .mi{display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;border:0;border-radius:var(--r-sm,6px);background:none;color:var(--ink);font:inherit;font-size:13px;text-align:left;cursor:pointer;min-height:32px}
.pd-menu .mi:hover,.pd-menu .mi:focus-visible{background:var(--surface-2);outline:none}
.pd-menu .mi.on{background:var(--brand-soft)}
.pd-menu .mi .k{margin-left:auto;color:var(--faint);font-size:11px;padding-left:8px}
.pd-menu .mi.bad{color:var(--bad)}
.pd-menu .mi.off{color:var(--faint);cursor:default}
.pd-menu .mi .pd-av{width:20px;height:20px;font-size:10px}
.pd-menu hr{border:0;border-top:1px solid var(--line);margin:5px 2px}
.pd-menu .dq{display:flex;flex-wrap:wrap;gap:4px;padding:4px 6px 6px}
.pd-menu .dq button{font:inherit;font-size:12.5px;font-weight:550;color:var(--ink-2);background:var(--surface-2);border:0;border-radius:var(--r-sm,6px);height:28px;padding:0 10px;cursor:pointer}
.pd-menu .dq button:hover{color:var(--ink);background:var(--line-strong)}
.pd-menu .di{display:flex;gap:6px;padding:2px 6px 6px}
.pd-menu .di input{flex:1;min-width:0;height:32px;font:inherit;font-size:13px;color:var(--ink);background:var(--surface-2);border:1px solid var(--line-strong);border-radius:var(--r-sm,6px);padding:0 9px;box-sizing:border-box}
.pd-menu .di button{font:inherit;font-size:12.5px;font-weight:600;color:var(--on-brand,var(--surface));background:var(--brand);border:0;border-radius:var(--r-sm,6px);height:32px;padding:0 12px;cursor:pointer}
.pd-mscrim{position:fixed;inset:0;z-index:9855;background:transparent}
.pd-mscrim.dim{background:rgba(10,10,12,.35)}
.pd-menu.sheet{left:0;right:0;bottom:0;top:auto;width:auto;max-height:80dvh;border-radius:16px 16px 0 0;padding:8px 12px calc(14px + env(safe-area-inset-bottom));animation:pd-up .18s var(--ease,ease) both}
.pd-menu.sheet::before{content:"";display:block;width:36px;height:4px;border-radius:2px;background:var(--line-strong);margin:0 auto 8px}
.pd-menu.sheet .mi{min-height:44px;font-size:15px;padding:9px 10px}
.pd-menu.sheet .mh{font-size:12px;padding:8px 10px 6px}
.pd-menu.sheet .dq button,.pd-menu.sheet .di input,.pd-menu.sheet .di button{min-height:40px;font-size:14px}
@keyframes pd-up{from{transform:translateY(24px);opacity:.6}to{transform:none;opacity:1}}
/* the bulk bar */
.pd-bulk{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9840;display:flex;align-items:center;gap:4px;max-width:calc(100vw - 24px);overflow-x:auto;scrollbar-width:none;background:var(--ink);color:var(--surface);border-radius:12px;padding:6px 6px 6px 14px;font-size:12.5px;box-shadow:var(--sh-pop,0 12px 32px -10px rgba(15,15,25,.4));animation:pd-up .18s var(--ease,ease) both}
.pd-bulk b{white-space:nowrap;margin-right:8px;font-weight:600}
.pd-bulk button{font:inherit;font-size:12.5px;font-weight:500;color:var(--surface);background:rgba(255,255,255,.1);border:0;border-radius:var(--r-sm,6px);padding:6px 9px;cursor:pointer;white-space:nowrap}
.pd-bulk button:hover{background:rgba(255,255,255,.18)}
.pd-bulk button.p{background:var(--brand);font-weight:600}
.pd-bulk button.x{background:none;color:var(--faint);font-size:16px;padding:4px 8px}
.pd-bulk button:disabled{opacity:.45;cursor:default}
/* toasts */
.pd-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));background:var(--ink);color:var(--surface);padding:10px 12px 10px 16px;border-radius:12px;font-size:13.5px;z-index:9900;display:flex;align-items:center;gap:12px;box-shadow:var(--sh-pop,0 8px 24px rgba(0,0,0,.25))}
.pd-toast.bad{background:var(--bad)}
.pd-toast .pd-undo{font:inherit;font-size:12.5px;font-weight:700;color:var(--surface);background:rgba(255,255,255,.14);border:0;border-radius:var(--r-sm,6px);padding:5px 10px;cursor:pointer}
/* modals (New brief, confirms) */
.pd-scrim{position:fixed;inset:0;background:rgba(10,10,12,.5);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:9850;padding:16px;animation:pd-fade var(--t,.2s) var(--ease,ease) both}
.pd-modal{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:var(--r-xl,18px);padding:22px 22px 18px;width:min(440px,100%);display:flex;flex-direction:column;gap:12px;box-shadow:var(--sh-sheet,0 30px 70px -20px rgba(0,0,0,.6));animation:pd-pop var(--t,.2s) var(--ease,ease) both}
@keyframes pd-fade{from{opacity:0}to{opacity:1}}@keyframes pd-pop{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}
.pd-modal h3{margin:0;font-size:16px;font-weight:650;letter-spacing:-.005em}
.pd-modal p{margin:0;font-size:14px;line-height:1.5;color:var(--ink-2)}
.pd-modal label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:500;color:var(--muted)}
.pd-modal input,.pd-modal select,.pd-modal textarea{font:inherit;font-size:14px;color:var(--ink);background:var(--surface-2);border:1px solid var(--line-strong);border-radius:var(--r-sm,6px);padding:7px 10px;width:100%;box-sizing:border-box}
.pd-modal input,.pd-modal select{height:var(--ctl-h,32px);padding:0 10px}
.pd-modal textarea{min-height:56px;resize:vertical}
.pd-modal .pd-hint{font-size:12px;font-weight:500;color:var(--muted)}
.pd-modal .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pd-modal .ft{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
.pd-modal .err{color:var(--bad);font-size:12.5px}
.pd-modal .pd-fchips{display:flex;flex-wrap:wrap;gap:6px}
/* Archived (the list behind "Delete card") */
.pd-arch{display:flex;flex-direction:column;gap:6px;max-height:min(56vh,480px);overflow-y:auto;margin:0 -4px;padding:0 4px}
.pd-arch .ar{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:var(--r-lg,8px);background:var(--surface-2);min-width:0}
.pd-arch .ar .t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.pd-arch .ar .t b{font-size:13px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pd-arch .ar .t span{font-size:12px;font-weight:500;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pd-arch .ar .pd-btn{flex:none}
.pd-arch .ar.gone{opacity:.45;pointer-events:none}
/* iPad and touch: the pencil always there (no hover on touch) */
@media (pointer:coarse){.pd-pen{opacity:1}.pd-ch .ic{opacity:1}}
/* iPhone: one column per screen, a column picker, a swipe between columns, Filters in a sheet */
.pd-seg{display:none}
@media (max-width:600px){
  .pd{gap:10px}
  .pd-sync{display:none}
  .pd-head .pd-r{margin-left:auto;gap:8px}
  .pd-filt .pd-dk{display:none}
  .pd-ph{display:inline-flex}
  .pd-seg{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;padding:0 0 2px;margin:0 -2px}
  .pd-seg button{flex:none;height:36px;min-height:0;padding:0 12px;border-radius:var(--r-sm,6px);border:0;background:var(--surface-2);color:var(--ink-2);font:inherit;font-size:13px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
  .pd-seg button.on{background:var(--ink);color:var(--surface);font-weight:600}
  .pd-seg button i{font-style:normal;opacity:.65;font-size:12px}
  .pd-wrap{scroll-snap-type:x mandatory;scrollbar-width:none;gap:12px}
  .pd-wrap::-webkit-scrollbar{display:none}
  .pd-col,.pd-col.cl{flex:0 0 100%;scroll-snap-align:start;scroll-snap-stop:always;background:transparent;border:0}
  .pd-col.cl .pd-cards{display:flex}
  .pd-col.cl .pd-ch{flex-direction:row;writing-mode:horizontal-tb;transform:none;padding:4px 2px 8px}
  .pd-ch{padding:4px 2px 8px}
  .pd-ch .ic{display:none}
  .pd-cards{padding:0 2px 12px;gap:10px}
  .pd-card{padding:11px 12px 10px;gap:7px}
  .pd-t{font-size:14.5px}
  .pd-r3,.pd-due{font-size:12.5px}
  .pd-pen{display:none}
  .pd-bulk{left:12px;right:12px;transform:none;bottom:calc(74px + env(safe-area-inset-bottom));max-width:none;border-radius:14px;padding:8px 8px 8px 14px}
  .pd-bulk button{min-height:38px}
  .pd-toast{bottom:calc(80px + env(safe-area-inset-bottom))}
  html .pd-scrim{align-items:flex-end;padding:0}
  html .pd-modal{width:100%;border-radius:16px 16px 0 0;max-height:92dvh;overflow-y:auto;padding:18px 16px calc(18px + env(safe-area-inset-bottom))}
  html .pd-modal .row{grid-template-columns:1fr}
  .pd-modal .pd-chip{height:40px;font-size:14px}
}
@media (prefers-reduced-motion:reduce){.pd-menu,.pd-bulk,.pd-scrim,.pd-modal,.pd-col{animation:none;transition:none}}
`;
  document.head.appendChild(s);
}

/* ================================================================================================================ */
/*  data                                                                                                             */
/* ================================================================================================================ */
async function load() {
  const act = H.S.act || 'all';
  LOADING = H.apiAH(`/api/production?act=${encodeURIComponent(act)}`);
  try { D = await LOADING; D.act = act; } catch (e) { D = { error: e.message || 'Could not load the board.', cards: [], brands: [], team: [], live: { shown: 0, total: 0 }, act }; }
  if (D.act !== 'all' || !D.brands.some(b => b.act_id === BRAND)) BRAND = 'all';
  const ids = new Set(D.cards.map(c => c.id));
  SEL = new Set([...SEL].filter(id => ids.has(id)));
}
const cardOf = id => D && D.cards.find(c => c.id === id);
const teamOf = () => (D && D.team && D.team.length ? D.team : ['Cole', 'Ahsan', 'Noma', 'William', 'Ravo']);
const shownCards = () => D.cards.filter(c => (BRAND === 'all' || c.act_id === BRAND) && (FORMAT === 'all' || c.format === FORMAT));
function sortCards(list, col) {
  const l = [...list];
  if (col === 'live') return l.sort((a, b) => String(b.since).localeCompare(String(a.since)));
  if (SORT === 'num') return l.sort((a, b) => (parseInt(b.num, 10) || 0) - (parseInt(a.num, 10) || 0));
  if (SORT === 'new') return l.sort((a, b) => String(b.since).localeCompare(String(a.since)) || (parseInt(b.num, 10) || 0) - (parseInt(a.num, 10) || 0));
  return l.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (parseInt(b.num, 10) || 0) - (parseInt(a.num, 10) || 0));
}
function listOf(k) {
  let list = sortCards(shownCards().filter(x => x.board === k), k);
  if (k === 'live') { const cap = D.live?.shown || list.length; if (!ALL_LIVE && list.length > cap) list = list.slice(0, cap); }
  return list;
}

/* the page head: the host's kit header (crumb, title, .ph-acts, the "..." menu) when it offers one, else the board's own */
const head = () => H && typeof H.pageHead === 'function' ? H.pageHead('production', 'Production') : '<div class="pd-head"><div><h1>Production</h1></div></div>';
/* the page's own buttons go through the host's pageActions (the kit writes them into .ph-acts, else #hdActions) */
function actions() {
  const pa = H && typeof H.pageActions === 'function' ? H.pageActions : (typeof window.pageActions === 'function' ? window.pageActions : null);
  if (!pa) return;
  pa('<button type="button" class="btn primary" id="pdNewBrief">+ New brief</button>');
  const b = document.getElementById('pdNewBrief'); if (b) b.onclick = () => newBrief();
}
function skeleton() {
  $('#main').innerHTML = `<div class="pd">${head()}<div class="pd-filt"><span class="pd-sync">Loading the board...</span></div>
    <div class="pd-wrap">${COLS.map(c => `<div class="pd-col"><div class="pd-ch"><span class="dot" style="background:${c.dot}"></span><b>${c.label}</b></div><div class="pd-cards"><div class="pd-sk"></div><div class="pd-sk"></div></div></div>`).join('')}</div></div>`;
  actions();
  size();
}

/* ================================================================================================================ */
/*  cards                                                                                                            */
/* ================================================================================================================ */
function dueOf(c) {
  const t = today();
  if (c.board === 'live') return { text: `Live ${short(c.since)}`, cls: '' };
  if (c.board === 'ready') return { text: c.since ? `Approved ${short(c.since)}` : 'Approved', cls: 'soon' };
  if (!c.due) return { text: 'No date', cls: '' };
  if (c.late) return { text: `${short(c.due)}, late`, cls: 'late' };
  if (c.due === t) return { text: `${short(c.due)}, today`, cls: 'late' };
  return { text: short(c.due), cls: '' };
}
function cardHtml(c) {
  const act = c.board === 'review' && c.versions ? `<button type="button" class="pd-act" data-review="${esc(c.id)}">Open review</button>`
    : c.board === 'ready' ? `<button type="button" class="pd-act" data-launch="${esc(c.id)}">Launch to Meta</button>` : '';
  const img = c.thumb && (c.board === 'review' || c.board === 'ready' || c.board === 'live');
  /* ONE status chip per card (2026-10-20): the thing that needs a person first; the upload count is a muted word on the date row */
  const status = c.needs_client ? `<span class="pd-pill w">Waiting on the client${c.needs_client === 'idea' ? ' (the idea)' : ''}</span>`
    : c.open_notes ? `<span class="pd-pill b">${plural(c.open_notes, 'open note')}</span>`
    : c.board === 'ready' && c.approved_by ? `<span class="pd-pill g">Approved</span>`
    : c.board === 'live' && c.result ? `<span class="pd-pill">${esc(c.result)}</span>` : '';
  const ups = c.versions && c.board !== 'live' ? `<span class="m">${plural(c.versions, 'upload')}</span>` : '';
  const due = dueOf(c);
  return `<div class="pd-card${SEL.has(c.id) ? ' sel' : ''}${img ? ' has-img' : ''}" draggable="${TOUCH() ? 'false' : 'true'}" data-id="${esc(c.id)}" tabindex="0" aria-label="${esc(`#${c.num} ${c.title || 'Untitled brief'}`)}">
    <span class="pd-tick" data-tick="${esc(c.id)}" role="checkbox" aria-checked="${SEL.has(c.id)}" aria-label="Select"></span>
    <button type="button" class="pd-pen" data-menu="${esc(c.id)}" aria-label="Card menu" title="Menu">${ico('pencil', 12) || '✎'}</button>
    ${img ? `<img class="pd-img" src="${esc(c.thumb)}" alt="" loading="lazy" draggable="false">` : ''}
    <div class="pd-r1"><span class="num">${esc(initials(c.brand))} #${esc(c.num)}</span>${D.act === 'all' && BRAND === 'all' ? `<span class="br">${esc(c.brand)}</span>` : ''}<span class="sp"></span><button type="button" class="pd-fmt" data-pop="format" data-id="${esc(c.id)}" style="--fc:${FMT[c.format] || 'var(--brand)'}" title="Change the format">${esc(c.format || 'Static')}</button></div>
    <div class="pd-t">${esc(c.title || 'Untitled brief')}</div>
    ${status ? `<div class="pd-pills">${status}</div>` : ''}
    <div class="pd-r3"><button type="button" class="pd-avb" data-pop="owner" data-id="${esc(c.id)}" title="${esc(c.assignee ? `Owner: ${c.assignee}` : 'Owner: nobody yet')}">${av(c.assignee, 20)}</button><button type="button" class="pd-due ${due.cls}" data-pop="due" data-id="${esc(c.id)}" title="Due date">${esc(due.text)}</button><span class="sp"></span>${ups}</div>
    ${act ? `<div class="pd-r4">${act}</div>` : ''}
  </div>`;
}

/* ================================================================================================================ */
/*  the board                                                                                                        */
/* ================================================================================================================ */
function colHtml(c) {
  const list = listOf(c.k);
  let more = '';
  if (c.k === 'live') {
    const total = D.live?.total || list.length;
    if (!ALL_LIVE && total > list.length) more = `<button class="pd-more" id="pdAllLive">Show all ${total}</button>`;
    else if (ALL_LIVE && total > list.length) more = `<div class="pd-empty">Older live ads are in Asana, Analyze Results.</div>`;
  }
  const EMPTY = { brief: 'No briefs yet. Add one.', making: 'Nothing being made.', review: 'Nothing to review.', ready: 'Nothing ready to launch.', live: 'Nothing live yet.' };
  const n = c.k === 'live' && BRAND === 'all' && FORMAT === 'all' ? (D.live?.total ?? list.length) : list.length;
  const cl = COLLAPSED.has(c.k) && !PHONE();
  return `<div class="pd-col${cl ? ' cl' : ''}" data-col="${c.k}">
    <div class="pd-ch" ${cl ? `data-expand="${c.k}" title="Expand ${c.label}"` : ''}><span class="dot" style="background:${c.dot}"></span><b>${c.label}</b><span class="n">${n}</span><span class="sp n2"></span>
      <span class="ic"><button type="button" data-collapse="${c.k}" title="Collapse" aria-label="Collapse ${c.label}">${ico('chevron-left', 14) || '‹'}</button>${c.k === 'brief' ? `<button type="button" data-newbrief title="New brief" aria-label="New brief">${ico('plus', 14) || '+'}</button>` : ''}<button type="button" data-colmenu="${c.k}" title="More" aria-label="${c.label} menu">${ico('more-horizontal', 14) || '…'}</button></span></div>
    <div class="pd-cards" data-cards="${c.k}">${list.map(cardHtml).join('') || `<div class="pd-empty">${EMPTY[c.k]}</div>`}${more}${c.k === 'brief' && !PHONE() ? '<button class="pd-add" data-newbrief>+ Brief</button>' : ''}</div>
  </div>`;
}

function paint() {
  if (D.error) { $('#main').innerHTML = `<div class="pd">${head()}<div class="pd-filt"><span class="pd-sync" style="color:var(--bad)">${esc(D.error)}</span><button type="button" class="pd-btn" id="pdRetry">Try again</button></div></div>`; actions(); $('#pdRetry').onclick = () => render(H, true); return; }
  /* keep every scroll position across a repaint */
  const old = $('#main .pd');
  const scrolls = {}; let left = 0;
  if (old) { $$('.pd-cards', old).forEach(el => { scrolls[el.dataset.cards] = el.scrollTop; }); const w = $('.pd-wrap', old); left = w ? w.scrollLeft : 0; }
  const chev = ico('chevron-down', 14) || '<span aria-hidden="true">⌄</span>';
  const brandName = BRAND === 'all' ? 'All brands' : ((D.brands.find(b => b.act_id === BRAND) || {}).name || 'Brand');
  const brandPill = D.act === 'all' && D.brands.length > 1
    ? `<button type="button" class="pd-ctl pd-dk${BRAND !== 'all' ? ' set' : ''}" data-brandmenu aria-haspopup="menu"><span class="v">${esc(brandName)}</span>${chev}</button>` : '';
  const fmtPill = `<button type="button" class="pd-ctl pd-dk${FORMAT !== 'all' ? ' set' : ''}" data-fmtmenu aria-haspopup="menu">${FORMAT !== 'all' ? `<span class="dot" style="background:${FMT[FORMAT]}"></span>` : ''}<span class="v">${FORMAT === 'all' ? 'All formats' : esc(FORMAT)}</span>${chev}</button>`;
  const sortPill = `<button type="button" class="pd-ctl pd-dk" data-sortmenu aria-haspopup="menu"><span class="v">Sort: ${esc((SORTS.find(s => s[0] === SORT) || SORTS[0])[1])}</span>${chev}</button>`;
  const nFilt = (BRAND !== 'all' ? 1 : 0) + (FORMAT !== 'all' ? 1 : 0);
  const seg = `<div class="pd-seg" role="tablist" aria-label="Column">${COLS.map(c => `<button type="button" role="tab" class="${PHONE_COL === c.k ? 'on' : ''}" data-seg="${c.k}" aria-selected="${PHONE_COL === c.k}">${c.label}<i>${c.k === 'live' && BRAND === 'all' && FORMAT === 'all' ? (D.live?.total ?? listOf(c.k).length) : listOf(c.k).length}</i></button>`).join('')}</div>`;
  $('#main').innerHTML = `<div class="pd${SELMODE ? ' selmode' : ''}">
    ${head()}
    <div class="pd-filt">${brandPill}${fmtPill}${sortPill}<button type="button" class="pd-ctl quiet pd-dk" data-archived title="Deleted in the last 60 days">Archived</button>
      <button type="button" class="pd-ctl pd-ph${nFilt ? ' set' : ''}" data-filters>Filters${nFilt ? ` · ${nFilt}` : ''}${chev}</button>
      <span class="sp"></span>
      <span class="pd-sync">${D.mirror === false ? 'Asana mirror off' : `Mirrored to Asana${D.synced_at ? `, synced ${ago(D.synced_at)}` : ''}`}</span>
      <button type="button" class="pd-ctl quiet${SELMODE ? ' on' : ''}" data-selmode>${SELMODE ? 'Done' : 'Select'}</button></div>
    ${seg}
    <div class="pd-wrap" tabindex="-1">${COLS.map(colHtml).join('')}</div>
  </div>`;
  actions();
  const root = $('#main .pd');
  $$('.pd-cards', root).forEach(el => { if (scrolls[el.dataset.cards]) el.scrollTop = scrolls[el.dataset.cards]; });
  size();
  const wrap = $('.pd-wrap', root);
  if (PHONE()) { const i = Math.max(0, COLS.findIndex(c => c.k === PHONE_COL)); wrap.scrollLeft = i * wrap.clientWidth; } else wrap.scrollLeft = left;
  wire();
  bulk();
  if (FOCUS) { const el = $(`.pd-card[data-id="${CSS.escape(FOCUS)}"]`, root); if (el && (document.activeElement === document.body || document.activeElement.closest('.pd'))) el.focus({ preventScroll: true }); }
}

/* the board is as tall as the window leaves it, so each column scrolls on its own */
function size() {
  const wrap = $('#main .pd-wrap'); if (!wrap) return;
  const top = wrap.getBoundingClientRect().top + (window.scrollY || 0);
  const tb = $('#tabbar'); const bar = tb && getComputedStyle(tb).display !== 'none' ? tb.getBoundingClientRect().height : 0;
  const h = Math.max(420, window.innerHeight - (wrap.getBoundingClientRect().top) - bar - (PHONE() ? 8 : 20));
  wrap.style.setProperty('--pd-h', `${h}px`);
  void top;
  if (!SIZED) { SIZED = true; let t = null; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if ($('#main .pd-wrap')) paint(); }, 120); }); }
}

/* a single card repainted in place (no flicker, scroll kept) */
function patch(id) {
  const c = cardOf(id); const el = $(`#main .pd-card[data-id="${CSS.escape(id)}"]`);
  if (!c || !el) return paint();
  const col = el.closest('.pd-col');
  if (!col || col.dataset.col !== c.board) return paint();
  const tmp = document.createElement('div'); tmp.innerHTML = cardHtml(c);
  const n = tmp.firstElementChild; el.replaceWith(n); wireCard(n);
  if (FOCUS === id) n.focus({ preventScroll: true });
}

function wire() {
  const root = $('#main .pd');
  /* the control pills: each opens the same menu helper the cards use, with the current value marked */
  const bm = $('[data-brandmenu]', root); if (bm) bm.onclick = () => {
    const brands = D.brands.filter(b => D.cards.some(c => c.act_id === b.act_id));
    showMenu({ anchor: bm, title: 'Brand', items: [{ k: 'all', l: 'All brands', on: BRAND === 'all' }, 'sep', ...brands.map(b => ({ k: b.act_id, l: b.name, on: BRAND === b.act_id }))], onPick: k => { closeMenu(); BRAND = k; paint(); } });
  };
  const fm = $('[data-fmtmenu]', root); if (fm) fm.onclick = () => {
    showMenu({ anchor: fm, title: 'Format', items: [{ k: 'all', l: 'All formats', on: FORMAT === 'all' }, 'sep', ...Object.keys(FMT).map(f => ({ k: f, l: f, on: FORMAT === f, ico: `<span class="dot" style="width:8px;height:8px;border-radius:50%;background:${FMT[f]}"></span>` }))], onPick: k => { closeMenu(); FORMAT = k; paint(); } });
  };
  const sm = $('[data-sortmenu]', root); if (sm) sm.onclick = () => {
    showMenu({ anchor: sm, title: 'Sort', items: SORTS.map(([k, l]) => ({ k, l, on: SORT === k })), onPick: k => { closeMenu(); SORT = k; remember('pd_sort', SORT); paint(); } });
  };
  $$('[data-newbrief]', root).forEach(b => b.onclick = () => newBrief());
  $$('[data-selmode]', root).forEach(b => b.onclick = () => { SELMODE = !SELMODE; if (!SELMODE) SEL.clear(); paint(); });
  $$('[data-filters]', root).forEach(b => b.onclick = () => filtersSheet());
  $$('[data-archived]', root).forEach(b => b.onclick = () => archivedBox());
  const all = $('#pdAllLive', root); if (all) all.onclick = () => { ALL_LIVE = true; paint(); };
  $$('[data-collapse]', root).forEach(b => b.onclick = e => { e.stopPropagation(); COLLAPSED.add(b.dataset.collapse); remember('pd_collapsed', JSON.stringify([...COLLAPSED])); paint(); });
  $$('[data-expand]', root).forEach(h => h.onclick = () => { COLLAPSED.delete(h.dataset.expand); remember('pd_collapsed', JSON.stringify([...COLLAPSED])); paint(); });
  $$('[data-colmenu]', root).forEach(b => b.onclick = e => { e.stopPropagation(); colMenu(b.dataset.colmenu, b); });
  $$('.pd-card', root).forEach(wireCard);
  $$('.pd-col', root).forEach(col => {
    col.addEventListener('dragover', e => { if (!DRAG) return; e.preventDefault(); col.classList.add('over'); edgeScroll(e); });
    col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
    col.addEventListener('drop', e => { e.preventDefault(); col.classList.remove('over'); const ids = DRAG || [e.dataTransfer.getData('text/plain')].filter(Boolean); if (ids.length) moveMany(ids, col.dataset.col); });
  });
  /* phone: the column picker and the swipe */
  const wrap = $('.pd-wrap', root);
  $$('[data-seg]', root).forEach(b => b.onclick = () => { PHONE_COL = b.dataset.seg; remember('pd_col', PHONE_COL); const i = COLS.findIndex(c => c.k === PHONE_COL); wrap.scrollTo({ left: i * wrap.clientWidth, behavior: 'smooth' }); segOn(); });
  if (PHONE()) { let t = null; wrap.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => { const i = Math.round(wrap.scrollLeft / Math.max(1, wrap.clientWidth)); const k = (COLS[i] || COLS[0]).k; if (k !== PHONE_COL) { PHONE_COL = k; remember('pd_col', k); segOn(); } }, 80); }, { passive: true }); }
  else sideways(wrap);
  keys();
}
/* Sideways on a desktop (2026-10-15 polish, what Asana gives a mouse): a wheel over a column header or the gaps between
   columns scrolls the board (over the cards the column scrolls, Shift+wheel and a trackpad swipe chain to the board on
   their own now that the columns only contain the vertical axis), and dragging empty board space pans it. */
function sideways(wrap) {
  wrap.addEventListener('wheel', e => {
    if (e.ctrlKey || e.target.closest('.pd-cards, .pd-menu')) return;   /* over the cards: the column's own scroll, chained to the board by the browser */
    const dx = e.deltaX || e.deltaY; if (!dx) return;
    e.preventDefault(); wrap.scrollLeft += dx;
  }, { passive: false });
  let pan = null;
  wrap.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const t = e.target;
    if (t.closest('.pd-card, button, a, input, select, .pd-add, .pd-more, .pd-menu')) return;
    const cards = t.closest('.pd-cards');
    if (cards && t !== cards && !t.classList.contains('pd-empty')) return;
    pan = { x: e.clientX, y: e.clientY, left: wrap.scrollLeft, top: cards ? cards.scrollTop : 0, cards, moved: false, id: e.pointerId };
  });
  wrap.addEventListener('pointermove', e => {
    if (!pan || e.pointerId !== pan.id) return;
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (!pan.moved) { if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return; pan.moved = true; wrap.classList.add('pan'); try { wrap.setPointerCapture(e.pointerId); } catch { /* fine */ } }
    wrap.scrollLeft = pan.left - dx;
    if (pan.cards) pan.cards.scrollTop = pan.top - dy;
  });
  const end = e => {
    if (!pan || (e && e.pointerId !== pan.id)) return;
    const moved = pan.moved; pan = null; wrap.classList.remove('pan');
    if (moved) { const eat = ev => { ev.stopPropagation(); ev.preventDefault(); }; wrap.addEventListener('click', eat, { capture: true, once: true }); setTimeout(() => wrap.removeEventListener('click', eat, { capture: true }), 0); }
  };
  wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
}
function segOn() { $$('#main [data-seg]').forEach(b => { const on = b.dataset.seg === PHONE_COL; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }); }
function edgeScroll(e) {
  const wrap = $('#main .pd-wrap'); if (!wrap) return;
  const r = wrap.getBoundingClientRect();
  if (e.clientX < r.left + 40) wrap.scrollLeft -= 14; else if (e.clientX > r.right - 40) wrap.scrollLeft += 14;
  const col = e.target.closest && e.target.closest('.pd-cards'); if (col) { const cr = col.getBoundingClientRect(); if (e.clientY < cr.top + 40) col.scrollTop -= 12; else if (e.clientY > cr.bottom - 40) col.scrollTop += 12; }
}

function wireCard(el) {
  const id = el.dataset.id;
  el.addEventListener('click', e => {
    if (el.dataset.lp) { delete el.dataset.lp; return; }
    const t = e.target;
    if (t.closest('[data-tick]')) { toggle(id, e.shiftKey); return; }
    if (t.closest('[data-menu]')) { e.stopPropagation(); menu(id, { anchor: t.closest('[data-menu]') }); return; }
    if (t.closest('[data-pop]')) { e.stopPropagation(); const b = t.closest('[data-pop]'); pick(b.dataset.pop, [id], { anchor: b }); return; }
    if (t.closest('[data-review]')) { e.stopPropagation(); openReview(id); return; }
    if (t.closest('[data-launch]')) { e.stopPropagation(); launchCards([id]); return; }
    if (e.ctrlKey || e.metaKey) { toggle(id, false); return; }
    if (e.shiftKey) { toggle(id, true); return; }
    if (SELMODE) { toggle(id, false); return; }
    FOCUS = id; openCard(id);
  });
  el.addEventListener('contextmenu', e => { if (e.target.closest('input,textarea')) return; e.preventDefault(); FOCUS = id; menu(id, { x: e.clientX, y: e.clientY }); });
  el.addEventListener('focus', () => { FOCUS = id; });
  el.addEventListener('dragstart', e => {
    DRAG = SEL.has(id) ? [...SEL] : [id];
    DRAG.forEach(x => { const c = $(`#main .pd-card[data-id="${CSS.escape(x)}"]`); if (c) c.classList.add('drag'); });
    const root = $('#main .pd'); if (root) root.classList.add('dragging');   /* the hand shows only now (Asana) */
    try { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; } catch { /* old browsers */ }
  });
  el.addEventListener('dragend', () => { $$('#main .pd-card.drag').forEach(c => c.classList.remove('drag')); DRAG = null; $$('#main .pd-col.over').forEach(c => c.classList.remove('over')); const root = $('#main .pd'); if (root) root.classList.remove('dragging'); });
  /* a long press on touch opens the menu as a bottom sheet */
  let timer = null, sx = 0, sy = 0;
  el.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || e.target.closest('button,a')) return;
    sx = e.clientX; sy = e.clientY;
    timer = setTimeout(() => { timer = null; el.dataset.lp = '1'; if (navigator.vibrate) navigator.vibrate(8); FOCUS = id; menu(id, { sheet: true }); }, 450);
  });
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener('pointermove', e => { if (timer && (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8)) cancel(); });
  el.addEventListener('pointerup', cancel); el.addEventListener('pointercancel', cancel); el.addEventListener('pointerleave', cancel);
}

/* ================================================================================================================ */
/*  selection + the bulk bar                                                                                         */
/* ================================================================================================================ */
function toggle(id, range) {
  const c = cardOf(id); if (!c) return;
  if (range && ANCHOR && cardOf(ANCHOR) && cardOf(ANCHOR).board === c.board) {
    const list = listOf(c.board).map(x => x.id); const a = list.indexOf(ANCHOR), b = list.indexOf(id);
    if (a >= 0 && b >= 0) { list.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => SEL.add(x)); }
  } else { if (SEL.has(id)) SEL.delete(id); else SEL.add(id); ANCHOR = id; }
  $$('#main .pd-card').forEach(el => { const on = SEL.has(el.dataset.id); el.classList.toggle('sel', on); const t = $('[data-tick]', el); if (t) t.setAttribute('aria-checked', on); });
  bulk();
}
function clearSel() { SEL.clear(); ANCHOR = null; $$('#main .pd-card.sel').forEach(el => { el.classList.remove('sel'); const t = $('[data-tick]', el); if (t) t.setAttribute('aria-checked', 'false'); }); bulk(); }
function bulk() {
  const old = $('.pd-bulk'); if (old) old.remove();
  if (!SEL.size || !$('#main .pd')) return;
  const ids = [...SEL], cards = ids.map(cardOf).filter(Boolean);
  const launchable = cards.filter(c => c.board === 'ready');
  const b = document.createElement('div'); b.className = 'pd-bulk'; b.setAttribute('role', 'toolbar'); b.setAttribute('aria-label', 'Selected cards');
  b.innerHTML = `<b>${plural(SEL.size, 'card')} selected</b>
    <button type="button" data-b="move">Move to ▾</button><button type="button" data-b="owner">Assign ▾</button><button type="button" data-b="due">Due ▾</button>
    <button type="button" data-b="send">Send to client</button>
    ${launchable.length ? `<button type="button" class="p" data-b="launch">Launch ${launchable.length} to Meta</button>` : ''}
    <button type="button" data-b="copy">Copy links</button><button type="button" data-b="del">Delete</button>
    <button type="button" class="x" data-b="x" aria-label="Clear the selection">✕</button>`;
  document.body.appendChild(b);
  $$('[data-b]', b).forEach(btn => btn.onclick = () => {
    const k = btn.dataset.b;
    if (k === 'x') return clearSel();
    if (k === 'move' || k === 'owner' || k === 'due') return pick(k, ids, { anchor: btn, above: true });
    if (k === 'send') return sendMany(ids);
    if (k === 'launch') return launchCards(launchable.map(c => c.id));
    if (k === 'copy') return copyLinks(ids);
    if (k === 'del') return archiveMany(ids);
  });
}

/* ================================================================================================================ */
/*  the menu and the pickers                                                                                         */
/* ================================================================================================================ */
function closeMenu() { if (MENU) { MENU.remove(); MENU = null; } $$('.pd-mscrim').forEach(s => s.remove()); }
/** A floating list (or a bottom sheet on a phone). items: {k, l, key, sub, bad, off, html, on} or 'sep'. */
function showMenu({ x, y, anchor, above, sheet, title, back, items, onPick, onBack }) {
  closeMenu();
  sheet = sheet || PHONE();
  const scrim = document.createElement('div'); scrim.className = 'pd-mscrim' + (sheet ? ' dim' : ''); document.body.appendChild(scrim);
  const m = document.createElement('div'); m.className = 'pd-menu' + (sheet ? ' sheet' : ''); m.setAttribute('role', 'menu');
  m.innerHTML = `${title || back ? `<div class="mh">${back ? `<button type="button" data-back>‹ Back</button>` : ''}<span>${esc(title || '')}</span></div>` : ''}
    ${items.map(it => it === 'sep' ? '<hr>' : it.html ? it.html : `<button type="button" class="mi${it.bad ? ' bad' : ''}${it.off ? ' off' : ''}${it.on ? ' on' : ''}" role="menuitem" data-k="${esc(it.k)}" ${it.off ? 'aria-disabled="true"' : ''}>${it.ico || ''}${esc(it.l)}${it.key ? `<span class="k">${esc(it.key)}</span>` : it.sub ? '<span class="k">›</span>' : it.off && it.hint ? `<span class="k">${esc(it.hint)}</span>` : ''}</button>`).join('')}`;
  document.body.appendChild(m); MENU = m;
  if (!sheet) {
    const r = { width: m.offsetWidth, height: m.offsetHeight }; /* layout size: the pop-in animation scales the box for a frame */
    let px = x, py = y;
    if (anchor) {
      const a = anchor.getBoundingClientRect(); px = a.left; py = above ? a.top - r.height - 8 : a.bottom + 6;
      const bar = anchor.closest('.pd-bulk'); if (bar) py = Math.min(py, window.innerHeight - 18 - bar.offsetHeight - r.height - 8); /* the bar slides in; place against where it lands */
    }
    px = Math.max(8, Math.min(px, window.innerWidth - r.width - 8)); py = Math.max(8, Math.min(py, window.innerHeight - r.height - 8));
    m.style.left = `${px}px`; m.style.top = `${py}px`;
  }
  const done = () => closeMenu();
  scrim.addEventListener('mousedown', done); scrim.addEventListener('touchstart', done, { passive: true });
  $$('.mi', m).forEach(b => b.onclick = () => { if (b.classList.contains('off')) return; onPick(b.dataset.k, b); });
  const bk = $('[data-back]', m); if (bk) bk.onclick = () => onBack && onBack();
  const key = e => {
    if (!MENU) { document.removeEventListener('keydown', key, true); return; }
    const list = $$('.mi:not(.off)', MENU); const i = list.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); (list[i + 1] || list[0])?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (list[i - 1] || list[list.length - 1])?.focus(); }
    else if (e.key === 'ArrowLeft' && bk) { e.preventDefault(); bk.click(); }
    else if (e.key === 'Tab') { done(); }
  };
  document.addEventListener('keydown', key, true);
  const first = $('.mi:not(.off)', m); if (first && !sheet) first.focus();
  return m;
}

/** The card's menu. */
function menu(id, where = {}) {
  const c = cardOf(id); if (!c) return;
  const items = [
    { k: 'open', l: 'Open', key: 'Enter' }, c.asana_url ? { k: 'asana', l: 'Open in Asana' } : null, { k: 'copy', l: 'Copy card link', key: 'C' }, 'sep',
    { k: 'move', l: 'Move to…', sub: true, key: 'M' }, { k: 'owner', l: 'Assign to…', sub: true, key: 'A' }, { k: 'due', l: 'Due date…', sub: true, key: 'D' }, { k: 'format', l: 'Format…', sub: true }, 'sep',
    { k: 'send', l: c.needs_client ? 'Take it back from the client' : 'Send to the client' },
    { k: 'launch', l: 'Launch to Meta', off: c.board !== 'ready', hint: 'Ready only' }, { k: 'dup', l: 'Duplicate as iteration' }, 'sep',
    { k: 'del', l: 'Delete card', bad: true },
  ].filter(Boolean);
  showMenu({ ...where, title: where.sheet || PHONE() ? `#${c.num} · ${c.title || 'Untitled brief'}` : '', items, onPick: k => {
    if (k === 'move' || k === 'owner' || k === 'due' || k === 'format') return pick(k, [id], { ...where, back: () => menu(id, where) });
    closeMenu();
    if (k === 'open') openCard(id);
    else if (k === 'asana') window.open(c.asana_url, '_blank', 'noopener');
    else if (k === 'copy') copyLinks([id]);
    else if (k === 'send') sendMany([id]);
    else if (k === 'launch') launchCards([id]);
    else if (k === 'dup') duplicate(id);
    else if (k === 'del') archiveMany([id]);
  } });
}
/** The column header's menu. */
function colMenu(k, anchor) {
  const col = COL_OF[k];
  const items = [
    { k: 'collapse', l: COLLAPSED.has(k) ? 'Expand' : 'Collapse' },
    k === 'brief' ? { k: 'new', l: 'New brief' } : null,
    { k: 'selall', l: `Select all in ${col.label}` }, 'sep',
    ...SORTS.map(([s, l]) => ({ k: `sort:${s}`, l: `Sort by ${l.toLowerCase()}`, on: SORT === s })),
    k === 'live' && !ALL_LIVE ? { k: 'alllive', l: `Show all ${D.live?.total || ''} live` } : null,
  ].filter(Boolean);
  showMenu({ anchor, title: col.label, items, onPick: key => {
    closeMenu();
    if (key === 'collapse') { if (COLLAPSED.has(k)) COLLAPSED.delete(k); else COLLAPSED.add(k); remember('pd_collapsed', JSON.stringify([...COLLAPSED])); paint(); }
    else if (key === 'new') newBrief();
    else if (key === 'selall') { listOf(k).forEach(c => SEL.add(c.id)); SELMODE = true; paint(); }
    else if (key.startsWith('sort:')) { SORT = key.slice(5); remember('pd_sort', SORT); paint(); }
    else if (key === 'alllive') { ALL_LIVE = true; paint(); }
  } });
}
/** A picker for one field of one or many cards: move, owner, due, format. */
function pick(kind, ids, where = {}) {
  const cards = ids.map(cardOf).filter(Boolean); if (!cards.length) return;
  const one = cards.length === 1 ? cards[0] : null;
  const same = f => { const v = cards.map(f); return v.every(x => x === v[0]) ? v[0] : undefined; };
  const label = one ? `#${one.num}` : plural(cards.length, 'card');
  const back = where.back || null;
  const onBack = back ? () => back() : null;
  if (kind === 'move') {
    const cur = same(c => c.board);
    showMenu({ ...where, back: !!back, onBack, title: `Move ${label} to`, items: COLS.map(c => ({ k: c.k, l: c.label, on: c.k === cur, ico: `<span class="dot" style="width:8px;height:8px;border-radius:50%;background:${c.dot}"></span>` })), onPick: k => { closeMenu(); moveMany(ids, k); } });
  } else if (kind === 'owner') {
    const cur = same(c => c.assignee);
    const names = [...new Set([...teamOf(), ...cards.map(c => c.assignee)].filter(Boolean))];
    showMenu({ ...where, back: !!back, onBack, title: `Who makes ${label}`, items: [...names.map(n => ({ k: n, l: n, on: n === cur, ico: av(n, 20) })), 'sep', { k: '', l: 'Nobody yet', on: cur === '' }], onPick: k => { closeMenu(); setMany(ids, { owner: k }, k ? `${k} makes ${label}.` : `${label}: nobody yet.`); } });
  } else if (kind === 'format') {
    const cur = same(c => c.format);
    showMenu({ ...where, back: !!back, onBack, title: `Format of ${label}`, items: Object.keys(FMT).map(f => ({ k: f, l: f, on: f === cur, ico: `<span class="dot" style="width:8px;height:8px;border-radius:50%;background:${FMT[f]}"></span>` })), onPick: k => { closeMenu(); setMany(ids, { format: k }, `${label}: ${k}.`); } });
  } else if (kind === 'due') {
    const cur = same(c => c.due) || '';
    dateMenu({ ...where, back: !!back, onBack, title: `Due date of ${label}`, value: cur, onPick: v => setMany(ids, { due: v }, v ? `${label}: due ${short(v)}.` : `${label}: no due date.`) });
  }
}
/** A small date popover: quick picks (Today, Tomorrow, Friday, Next Monday, Clear) and a date input inside it. */
function dateMenu({ title, value, onPick, ...where }) {
  const cur = value || '';
  const t = today(), d = new Date(t + 'T12:00:00Z');
  const plus = n => new Date(d.getTime() + n * 864e5).toISOString().slice(0, 10);
  const fri = plus(((5 - d.getUTCDay()) + 7) % 7 || 7), mon = plus(((8 - d.getUTCDay()) % 7) || 7);
  const quick = [['Today', t], ['Tomorrow', plus(1)], ['Friday', fri], ['Next Monday', mon], ['Clear', '']];
  const html = `<div class="dq">${quick.map(([l, v]) => `<button type="button" data-q="${v}"${v && v === cur ? ' style="color:var(--brand)"' : ''}>${l}</button>`).join('')}</div><div class="di"><input type="date" value="${esc(cur)}" aria-label="${esc(title || 'Date')}"><button type="button" data-set>Set</button></div>`;
  const m = showMenu({ ...where, title: `${title || 'Date'}${cur ? `, now ${short(cur)}` : ''}`, items: [{ html }], onPick: () => {} });
  const go = v => { closeMenu(); onPick(v); };
  $$('[data-q]', m).forEach(b => b.onclick = () => go(b.dataset.q));
  const inp = $('input', m); $('[data-set]', m).onclick = () => go(inp.value);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(inp.value); } });
  if (!PHONE()) inp.focus();
  return m;
}
/** The same pickers for the card sheet (prodsheet.js): kind owner | format | due | launch, the current value, the
 *  button that opened it, onPick(value). Nothing is written here; the sheet saves through its own route. */
function pickMenu({ kind, value, anchor, team, title, onPick }) {
  const cur = value == null ? '' : String(value);
  const done = v => { closeMenu(); onPick(v); };
  if (kind === 'owner') {
    const names = [...new Set([...(team && team.length ? team : teamOf()), cur].filter(Boolean))];
    showMenu({ anchor, title: title || 'Owner', items: [...names.map(n => ({ k: n, l: n, on: n === cur, ico: av(n, 20) })), 'sep', { k: '', l: 'Nobody yet', on: cur === '' }], onPick: done });
  } else if (kind === 'format') {
    showMenu({ anchor, title: title || 'Format', items: Object.keys(FMT).map(f => ({ k: f, l: f, on: f === cur, ico: `<span class="dot" style="width:8px;height:8px;border-radius:50%;background:${FMT[f]}"></span>` })), onPick: done });
  } else {
    dateMenu({ anchor, title: title || (kind === 'launch' ? 'Launch date' : 'Due date'), value: cur, onPick });
  }
}

/* ================================================================================================================ */
/*  actions                                                                                                          */
/* ================================================================================================================ */
async function move(id, to) { return moveMany([id], to); }
async function moveMany(ids, to) {
  const cards = ids.map(cardOf).filter(c => c && c.board !== to); if (!cards.length) return;
  const t0 = today(), was = new Map(cards.map(c => [c.id, { board: c.board, since: c.since, late: c.late }]));
  for (const c of cards) { c.board = to; c.since = t0; c.late = to === 'live' || to === 'ready' ? false : !!c.due && c.due < t0; }
  paint();
  const col = COL_OF[to].label; let ok = 0, asana = 0; const why = [];
  for (const c of cards) {
    try { const r = await post('/api/production/move', { id: c.id, to }); if (r.error) throw new Error(r.error); ok++; if (r.asana && r.asana.moved) asana++; else if (r.asana && r.asana.why && !why.includes(r.asana.why)) why.push(r.asana.why); }
    catch (e) { const w = was.get(c.id); Object.assign(c, w); why.push(`#${c.num}: ${e.message || 'could not move it'}`); }
  }
  if (ok !== cards.length) paint();
  const n = cards.length;
  toast(n === 1 ? (asana ? `Moved to ${col}. Moved in Asana.` : ok ? `Moved to ${col}. ${why[0] || 'Asana was not changed.'}` : `Could not move it: ${why[0] || 'try again'}`)
    : `${ok} of ${n} moved to ${col}${asana ? `, ${asana} in Asana too` : ''}.${why.length ? ' ' + why.slice(0, 2).join(' ') : ''}`, { bad: !ok });
}
async function setMany(ids, patch, say) {
  const cards = ids.map(cardOf).filter(Boolean); if (!cards.length) return;
  const keep = new Map(cards.map(c => [c.id, { ...c }]));
  for (const c of cards) {
    if ('owner' in patch) c.assignee = patch.owner;
    if ('due' in patch) { c.due = patch.due; c.late = !!patch.due && patch.due < today() && c.board !== 'ready' && c.board !== 'live'; }
    if ('format' in patch) c.format = patch.format;
  }
  cards.forEach(c => patchCard(c.id));
  const fails = []; let asanaWhy = '';
  for (const c of cards) {
    try { const r = await post('/api/production/field', { id: c.id, ...patch }); if (r.error) throw new Error(r.error); if (r.card) { Object.assign(c, { assignee: r.card.assignee, due: r.card.due, late: r.card.late, format: r.card.format, launch_on: r.card.launch_on }); } if (r.asana && !r.asana.written && r.asana.why && !/mirror is off|no Asana task/.test(r.asana.why)) asanaWhy = r.asana.why; }
    catch (e) { Object.assign(c, keep.get(c.id)); fails.push(`#${c.num}: ${e.message || 'not saved'}`); }
    patchCard(c.id);
  }
  if (fails.length) toast(fails.slice(0, 2).join(' '), { bad: true });
  else toast(say + (asanaWhy ? ` Asana: ${asanaWhy}` : ''));
}
const patchCard = id => patch(id);
async function sendMany(ids) {
  const cards = ids.map(cardOf).filter(Boolean); if (!cards.length) return;
  const back = cards.every(c => c.needs_client);
  const what = c => back ? '' : (c.versions ? 'ad' : 'idea');
  const title = back ? (cards.length === 1 ? 'Take it back from the client?' : `Take ${cards.length} back from the client?`) : (cards.length === 1 ? `Send #${cards[0].num} to the client?` : `Send ${cards.length} cards to the client?`);
  const text = back ? 'It leaves their Needs you list.' : 'Goes to their Needs you list: the newest ad when one is uploaded, else the idea.';
  if (!(await confirmBox(title, text, back ? 'Take back' : 'Send'))) return;
  let ok = 0; const why = [];
  for (const c of cards) { try { const r = await post('/api/production/send', { id: c.id, what: what(c) }); if (r.error) throw new Error(r.error); ok++; } catch (e) { why.push(`#${c.num}: ${e.message}`); } }
  await render(H, false);
  toast(`${ok === cards.length ? (back ? 'Taken back.' : ok === 1 ? 'Sent to the client.' : `Sent ${ok} to the client.`) : `${ok} of ${cards.length} sent.`}${why.length ? ' ' + why.slice(0, 2).join(' ') : ''}`, { bad: !ok });
  if (ok) clearSel();
}
async function archiveMany(ids) {
  const cards = ids.map(cardOf).filter(Boolean); if (!cards.length) return;
  const title = cards.length === 1 ? `Delete #${cards[0].num}?` : `Delete ${cards.length} cards?`;
  if (!(await confirmBox(title, `Goes to Archived for 60 days; the Asana task is marked complete.`, 'Delete'))) return;
  const done = []; const why = [];
  for (const c of cards) { try { const r = await post('/api/production/card/delete', { id: c.id }); if (r.error) throw new Error(r.error); done.push({ id: c.id, to: r.was || c.board }); } catch (e) { why.push(`#${c.num}: ${e.message}`); } }
  D.cards = D.cards.filter(c => !done.some(x => x.id === c.id)); done.forEach(x => SEL.delete(x.id)); paint();
  toast(`${done.length === cards.length ? (done.length === 1 ? 'Deleted.' : `Deleted ${done.length}.`) : `${done.length} of ${cards.length} deleted.`}${why.length ? ' ' + why.slice(0, 2).join(' ') : ''}`, {
    bad: !done.length,
    undo: done.length ? async () => { for (const x of done) await post('/api/production/card/restore', { id: x.id, to: x.to }).catch(() => {}); await render(H, false); toast(done.length === 1 ? 'Put back.' : `Put ${done.length} back.`); } : null,
  });
}
async function duplicate(id) {
  const c = cardOf(id); if (!c) return;
  toast(`Making an iteration of #${c.num}...`);
  try { const r = await post('/api/production/duplicate', { id }); if (r.error) throw new Error(r.error); await render(H, false); toast(`#${r.num} is on the board, an iteration of #${c.num}.`); openCard(r.id); }
  catch (e) { toast(e.message || 'Could not duplicate it.', { bad: true }); }
}
async function copyLinks(ids) {
  const text = ids.map(cardLink).join('\n');
  try { await navigator.clipboard.writeText(text); toast(ids.length === 1 ? 'Link copied.' : `${ids.length} links copied.`); }
  catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Link copied.'); } catch { toast('Could not copy. The link: ' + text, { bad: true }); } ta.remove(); }
}
function openReview(id) {
  const c = cardOf(id); if (!c) return;
  if (c.versions && window.ProdSheet) { window.ProdSheet.review(H, c.id, { onChange: () => render(H, false) }); return; }
  if (c.asset_url) { window.open(c.asset_url, '_blank', 'noopener'); return; }
  openCard(c.id, 'files');
}
/** Launch to Meta for one or many Ready cards: the batch window per card, in turn (each test picks its own ad set). */
function launchCards(ids) {
  const cards = ids.map(cardOf).filter(c => c && c.board === 'ready');
  if (!cards.length) return toast('Only a Ready card can be launched.', { bad: true });
  if (!window.LaunchToMeta) return toast('The Launch window did not load. Hard-refresh.', { bad: true });
  if (cards.length === 1 && !cards[0].versions && !cards[0].studio_ad) { toast(`#${cards[0].num} has no approved ad yet. Upload it on the Ads tab, approve it, then launch.`); openCard(cards[0].id, 'files'); return; }
  const queue = cards.map(c => ({ cardId: c.id, act: c.act_id, num: c.num, title: c.title, studio: !c.versions && c.studio_ad ? c.studio_ad : null }));
  const first = queue.shift();
  const onDone = () => { clearSel(); render(H, false); };
  if (first.studio && !queue.length) { window.LaunchToMeta.open({ act: first.act, tok: H.S.tok, studioAd: first.studio, onDone }); return; }
  if (!window.LaunchToMeta.openBatch) return toast('Approve the ad on the card first, then Launch to Meta from the Ads tab.', { bad: true });
  window.LaunchToMeta.openBatch({ act: first.act, tok: H.S.tok, cardId: first.cardId, queue, step: 1, total: cards.length, onDone, onBrief: () => openCard(first.cardId, 'brief') });
}
function launch(c) { if (c) launchCards([c.id]); }

/* ================================================================================================================ */
/*  keyboard                                                                                                         */
/* ================================================================================================================ */
function keys() {
  if (KEYS) return; KEYS = true;
  document.addEventListener('keydown', e => {
    const root = $('#main .pd'); if (!root || MENU) return;
    const a = document.activeElement;
    if (a && (a.matches('input,textarea,select,[contenteditable="true"]') || a.closest('#v2panel,.pd-scrim,.modal-wrap,.ps-sheet'))) return;
    if ($('#v2panel.on') || $('.pd-scrim') || $('.modal-wrap')) return;
    const card = a && a.closest ? a.closest('.pd-card') : null;
    const id = card ? card.dataset.id : FOCUS;
    const go = el => { if (el) { FOCUS = el.dataset.id; el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } };
    if (e.key === 'Escape') { if (SEL.size) { clearSel(); if (SELMODE) { SELMODE = false; paint(); } } return; }
    if (!id && ['ArrowDown', 'ArrowRight'].includes(e.key) && a && a !== document.body && !a.closest('.pd-wrap')) return;
    const cols = $$('.pd-col:not(.cl)', root);
    if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const cur = id ? $(`.pd-card[data-id="${CSS.escape(id)}"]`, root) : null;
      if (!cur) { go($('.pd-col:not(.cl) .pd-card', root)); return; }
      const col = cur.closest('.pd-col'), list = $$('.pd-card', col), i = list.indexOf(cur);
      if (e.key === 'ArrowDown') go(list[i + 1] || cur);
      else if (e.key === 'ArrowUp') go(list[i - 1] || cur);
      else { const ci = cols.indexOf(col); const next = cols[ci + (e.key === 'ArrowRight' ? 1 : -1)]; if (next) { const nl = $$('.pd-card', next); go(nl[Math.min(i, nl.length - 1)] || cur); } }
      return;
    }
    if (!id) return;
    const c = cardOf(id); if (!c) return;
    const cur = $(`.pd-card[data-id="${CSS.escape(id)}"]`, root);
    if (e.key === 'Enter') { e.preventDefault(); openCard(id); }
    else if (e.key === '.' || e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) { e.preventDefault(); menu(id, { anchor: cur }); }
    else if (e.key === 'x' || e.key === 'X' || e.key === ' ') { e.preventDefault(); toggle(id, e.shiftKey); }
    else if (e.key === 'd' || e.key === 'D') { e.preventDefault(); pick('due', SEL.has(id) ? [...SEL] : [id], { anchor: cur }); }
    else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); pick('move', SEL.has(id) ? [...SEL] : [id], { anchor: cur }); }
    else if (e.key === 'a' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); pick('owner', SEL.has(id) ? [...SEL] : [id], { anchor: cur }); }
    else if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); listOf(c.board).forEach(x => SEL.add(x.id)); toggle(id, false); toggle(id, false); }
    else if (e.key === 'c' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); copyLinks([id]); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); archiveMany(SEL.has(id) ? [...SEL] : [id]); }
  });
}

/* ================================================================================================================ */
/*  modals: confirm, filters (phone), New brief                                                                      */
/* ================================================================================================================ */
function confirmBox(title, text, ok = 'OK') {
  return new Promise(res => {
    const w = document.createElement('div'); w.className = 'pd-scrim';
    w.innerHTML = `<div class="pd-modal" role="alertdialog" aria-modal="true" aria-label="${esc(title)}"><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}
      <div class="ft"><button type="button" class="pd-btn" data-x>Cancel</button><button type="button" class="pd-btn pri" data-ok>${esc(ok)}</button></div></div>`;
    document.body.appendChild(w);
    const done = v => { w.remove(); document.removeEventListener('keydown', key, true); res(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } if (e.key === 'Enter') { e.preventDefault(); done(true); } };
    document.addEventListener('keydown', key, true);
    $('[data-x]', w).onclick = () => done(false); $('[data-ok]', w).onclick = () => done(true);
    w.addEventListener('mousedown', e => { if (e.target === w) done(false); });
    $('[data-ok]', w).focus();
  });
}
/** Phone: brand, format and sort in one bottom sheet. */
function filtersSheet() {
  const w = document.createElement('div'); w.className = 'pd-scrim';
  const chips = (list, cur, attr) => `<div class="pd-fchips">${list.map(([v, l, cc]) => `<button type="button" class="pd-chip${cur === v ? ' on' : ''}" data-${attr}="${esc(v)}"${cc ? ` style="--cc:${cc}"` : ''}>${esc(l)}</button>`).join('')}</div>`;
  const brands = D.act === 'all' && D.brands.length > 1 ? [['all', 'All brands'], ...D.brands.filter(b => D.cards.some(c => c.act_id === b.act_id)).map(b => [b.act_id, b.name])] : null;
  w.innerHTML = `<div class="pd-modal" role="dialog" aria-modal="true" aria-label="Filters"><h3>Filters</h3>
    ${brands ? `<label>Brand${chips(brands, BRAND, 'brand')}</label>` : ''}
    <label>Format${chips([['all', 'All formats'], ...Object.keys(FMT).map(f => [f, f, FMT[f]])], FORMAT, 'fmt')}</label>
    <label>Sort${chips(SORTS.map(([k, l]) => [k, l]), SORT, 'sortv')}</label>
    <button type="button" class="pd-btn" data-archived style="width:100%;justify-content:center">Archived</button>
    <div class="ft"><button type="button" class="pd-btn" data-clear>Clear</button><button type="button" class="pd-btn pri" data-done>Done</button></div></div>`;
  document.body.appendChild(w);
  const close = () => { w.remove(); paint(); };
  $('[data-archived]', w).onclick = () => { close(); archivedBox(); };
  $$('[data-brand]', w).forEach(b => b.onclick = () => { BRAND = b.dataset.brand; $$('[data-brand]', w).forEach(x => x.classList.toggle('on', x === b)); });
  $$('[data-fmt]', w).forEach(b => b.onclick = () => { FORMAT = b.dataset.fmt; $$('[data-fmt]', w).forEach(x => x.classList.toggle('on', x === b)); });
  $$('[data-sortv]', w).forEach(b => b.onclick = () => { SORT = b.dataset.sortv; remember('pd_sort', SORT); $$('[data-sortv]', w).forEach(x => x.classList.toggle('on', x === b)); });
  $('[data-clear]', w).onclick = () => { BRAND = 'all'; FORMAT = 'all'; close(); };
  $('[data-done]', w).onclick = close;
  w.addEventListener('mousedown', e => { if (e.target === w) close(); });
}

/** Archived (2026-10-15 polish): the cards deleted from the board in the last 60 days, each with Put back. "Delete card"
 *  archives, and until now the only way back was Undo on the toast. Put back asks which column (the one it left is marked)
 *  and calls the same restore route the toast's Undo uses. */
function archivedBox() {
  const w = document.createElement('div'); w.className = 'pd-scrim';
  const brandName = D.act !== 'all' ? (D.brands.find(b => b.act_id === D.act) || {}).name : (BRAND !== 'all' ? (D.brands.find(b => b.act_id === BRAND) || {}).name : '');
  w.innerHTML = `<div class="pd-modal" role="dialog" aria-modal="true" aria-labelledby="pdArT"><h3 id="pdArT">Archived</h3>
    <p class="pd-hint">Deleted in the last 60 days${brandName ? `, ${esc(brandName)}` : ''}. Put back returns a card to the board${D.mirror === false ? '' : ' and its Asana task'}.</p>
    <div class="pd-arch" id="pdArList"><div class="pd-sk" style="height:44px"></div><div class="pd-sk" style="height:44px"></div></div>
    <div class="ft"><button type="button" class="pd-btn" data-x>Close</button></div></div>`;
  document.body.appendChild(w);
  let changed = false;
  const close = () => { w.remove(); document.removeEventListener('keydown', key, true); if (changed) render(H, false); };
  const key = e => { if (e.key === 'Escape' && !MENU) { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true);
  $('[data-x]', w).onclick = close;
  w.addEventListener('mousedown', e => { if (e.target === w) close(); });
  const list = $('#pdArList', w);
  const act = D.act !== 'all' ? D.act : (BRAND !== 'all' ? BRAND : 'all');
  H.apiAH(`/api/production/archived?act=${encodeURIComponent(act)}`).then(r => {
    if (r.error) throw new Error(r.error);
    const cards = r.cards || [];
    if (!cards.length) { list.innerHTML = '<div class="pd-empty">Nothing archived in the last 60 days.</div>'; return; }
    list.innerHTML = cards.map(c => `<div class="ar" data-ar="${esc(c.id)}"><div class="t"><b>${esc(initials(c.brand))} #${esc(c.num)} ${esc(c.title || 'Untitled brief')}</b><span>${esc(c.brand)} · ${esc(c.format || 'Static')}${c.assignee ? ` · ${esc(c.assignee)}` : ''} · deleted ${esc(short(c.archived_at) || 'recently')}</span></div><button type="button" class="pd-btn" data-back="${esc(c.id)}">Put back</button></div>`).join('');
    $$('[data-back]', list).forEach(b => b.onclick = () => {
      const c = cards.find(x => x.id === b.dataset.back); if (!c) return;
      showMenu({ anchor: b, title: `Put #${c.num} back in`, items: COLS.map(col => ({ k: col.k, l: col.label, on: col.k === c.was, ico: `<span class="dot" style="width:8px;height:8px;border-radius:50%;background:${col.dot}"></span>` })), onPick: async k => {
        closeMenu();
        const row = b.closest('.ar'); b.disabled = true; b.textContent = 'Putting back...';
        try {
          const res = await post('/api/production/card/restore', { id: c.id, to: k }); if (res.error) throw new Error(res.error);
          changed = true; row.classList.add('gone'); b.textContent = `Back in ${COL_OF[k].label}`;
          toast(`#${c.num} is back in ${COL_OF[k].label}.${res.asana && res.asana.moved ? ' Moved in Asana.' : ''}`);
          if (!$$('.ar:not(.gone)', list).length) list.insertAdjacentHTML('beforeend', '<div class="pd-empty">Nothing else archived in the last 60 days.</div>');
        } catch (e) { b.disabled = false; b.textContent = 'Put back'; toast(e.message || 'Could not put it back.', { bad: true }); }
      } });
    });
  }).catch(e => { list.innerHTML = `<div class="pd-empty" style="color:var(--bad)">${esc(e.message || 'Could not load the archive.')}</div>`; });
}

function newBrief() {
  const brands = D.brands || [];
  const act0 = D.act !== 'all' ? D.act : (BRAND !== 'all' ? BRAND : '');
  const team = teamOf();
  const w = document.createElement('div'); w.className = 'pd-scrim';
  w.innerHTML = `<div class="pd-modal" role="dialog" aria-modal="true" aria-labelledby="pdNbT">
    <h3 id="pdNbT">New brief</h3>
    <p class="pd-hint">${D.mirror === false ? 'Goes to the Brief column with the next number.' : "Goes to the Brief column and the brand's Asana project with the next number."}</p>
    <label>Brand<select id="pdNbAct"><option value="">Pick the brand</option>${brands.map(b => `<option value="${esc(b.act_id)}"${b.act_id === act0 ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
    <label>Name<textarea id="pdNbText" maxlength="300" placeholder="Fall polo UGC hooks"></textarea><span class="pd-hint">Short, like a test title. The number goes in front.</span></label>
    <div class="row"><label>Owner<select id="pdNbOwner"><option value="">Nobody yet</option>${team.map(n => `<option>${esc(n)}</option>`).join('')}</select></label>
      <label>Due<input type="date" id="pdNbDue"></label></div>
    <div class="err" id="pdNbErr" hidden></div>
    <div class="ft"><button class="pd-btn" id="pdNbX">Cancel</button><button class="pd-btn pri" id="pdNbGo">Make the brief</button></div>
  </div>`;
  document.body.appendChild(w);
  const close = () => { w.remove(); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  w.addEventListener('mousedown', e => { if (e.target === w) close(); });
  $('#pdNbX', w).onclick = close;
  $('#pdNbText', w).focus();
  $('#pdNbGo', w).onclick = async () => {
    const act = $('#pdNbAct', w).value, text = $('#pdNbText', w).value.trim(), err = $('#pdNbErr', w), go = $('#pdNbGo', w);
    err.hidden = true;
    if (!act) { err.textContent = 'Pick the brand.'; err.hidden = false; return; }
    if (!text) { err.textContent = 'Name the brief.'; err.hidden = false; return; }
    go.disabled = true; go.textContent = 'Making it...';
    try {
      const r = await post('/api/production/brief', { act, text, owner: $('#pdNbOwner', w).value, due: $('#pdNbDue', w).value });
      if (r.error) throw new Error(r.error);
      close();
      toast(r.local ? `Brief #${r.num} is on the board.` : r.asana_later ? `Brief #${r.num} is on the board. Its Asana task follows.` : r.num ? `Brief #${r.num} is on the board and in Asana.` : 'The brief is on the board.');
      await render(H, false);
      if (r.id) openCard(r.id);
    } catch (e) { err.textContent = e.message || 'Could not make the brief.'; err.hidden = false; go.disabled = false; go.textContent = 'Make the brief'; }
  };
}

/* ================================================================================================================ */
/*  render                                                                                                           */
/* ================================================================================================================ */
async function render(host, first) {
  H = host; css();
  if (window.ProdSheet && (H.S.role === 'client' || H.S.client)) return window.ProdSheet.client(H);
  if (window.ProdSheet) { window.ProdSheet.css(); await window.ProdSheet.photos(H); }
  const t = H.RUN();
  if (first || !D || D.act !== (H.S.act || 'all')) { ALL_LIVE = false; skeleton(); }
  await load();
  if (t !== H.RUN()) return;
  paint();
  if (!OPENED) {
    OPENED = true;
    const id = new URLSearchParams(location.search).get('card') || window.PD_CARD;
    if (id) openCard(id);
  }
}
/* leaving the page takes the bulk bar and any menu with it */
const leaving = () => { if (!$('#main .pd')) { const b = $('.pd-bulk'); if (b) b.remove(); closeMenu(); } };
new MutationObserver(leaving).observe(document.body, { childList: true, subtree: false });
document.addEventListener('click', e => { if ($('#main .pd') === null) leaving(); else if (!e.target.closest('#main')) { /* a click elsewhere keeps the selection */ } });

window.ProductionTab = { render, mirrorCard: (el, h) => window.ProdSheet && window.ProdSheet.mirrorCard(el, h), move, launch, pickMenu, closeMenu };
})();
