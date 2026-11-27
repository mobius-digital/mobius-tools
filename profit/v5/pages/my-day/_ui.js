/* Local parts for My day, Your profile and "How it reaches you". Nothing here touches the network.
   The kit has no page stylesheet hook, so each page calls css() once; the rules are scoped by lx-md-, lx-pf-, lx-rc-. */

import { h, svgNode, avatar, addStyles } from '../../kit.js';

let done = false;
/** Add this folder's styles to the document, once. */
export function css() {
  if (done) return;
  done = true;
  addStyles('lx-myday-css', CSS);
}

/** A person's picture with the white ring used on the hero. */
export function face(person, size, ring) {
  const el = avatar(person, { size });
  if (ring) el.classList.add('lx-md-ring');
  return el;
}

/** A small stroked icon the shared set does not have. */
const PATHS = {
  hash: 'M9 4 7 20M17 4l-2 16M4 9h17M3 15h17',
  mail: 'M3 6h18v12H3zM3 7l9 7 9-7',
  phone: 'M8 3h8v18H8zM11 17.500h2',
  plus: 'M12 5v14M5 12h14',
  camera: 'M4 8h3l2-2.500h6L17 8h3v11H4zM12 16.500a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.500 2h-15zM10 20.500a2.200 2.200 0 0 0 4 0',
  check: 'M5 12.500l4.500 4.500L19 7.500',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z',
};
export function ic(name, cls) {
  return svgNode(`<svg class="lx-ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${PATHS[name] || ''}"/></svg>`);
}

/** A section heading with its count: "Needs you today  4". */
export function heading(title, n, note) {
  return h('div', { class: 'lx-md-h' }, h('h2', null, title), n != null && h('span', { class: 'lx-count' }, String(n)), note && h('span', { class: 'note' }, note));
}

/** Read and write a small JSON setting on this device. Never throws. */
export const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } },
};

const CSS = `
.lx-md-ring{box-shadow:0 0 0 3px #fff,0 0 0 4px rgba(28,20,10,.10),0 12px 26px -12px rgba(28,20,10,.35)}
.lx-md-hero .lx-hero-h{align-items:center;gap:20px}
.lx-md-acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.lx-md-cols{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:40px;align-items:start}
.lx-md-main{display:grid;gap:36px;min-width:0}
.lx-md-side{display:grid;gap:28px;min-width:0}
.lx-md-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-width:0}
.lx-md-bar .lx-seg{max-width:100%;overflow-x:auto;scrollbar-width:none}
.lx-md-bar .lx-seg button{flex:none;white-space:nowrap}
.lx-md-bar .lx-asof{margin-left:auto}
.lx-md-h{display:flex;align-items:center;gap:10px}
.lx-md-h h2{margin:0;font-size:17px;font-weight:600;letter-spacing:-.02em}
.lx-md-h .note{margin-left:auto;font-size:12.5px;color:var(--faint)}
.lx-md-grp .lx-md-h{padding-bottom:12px}
.lx-md-row{display:grid;grid-template-columns:minmax(0,1fr) 104px 84px 158px;gap:18px;align-items:center;min-height:76px;padding:12px 0;border-top:1px solid var(--line)}
.lx-md-row .what{min-width:0}
.lx-md-row .what b{display:block;font-size:15px;font-weight:600;letter-spacing:-.012em;line-height:1.35;overflow-wrap:anywhere}
.lx-md-row .why{display:flex;align-items:center;gap:7px;margin-top:3px;font-size:13px;color:var(--muted);min-width:0}
.lx-md-row .brand{font-size:13.5px;color:var(--ink-2);font-weight:500}
.lx-md-row .due{font-size:13.5px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--ink);white-space:nowrap}
.lx-md-row .due.late{color:var(--bad)}
.lx-md-row .go{display:flex;justify-content:flex-end}
.lx-md-k{flex:none;display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:var(--r-chip,6px);background:var(--bg-sunk);color:var(--ink-2);font-size:12px;font-weight:600;white-space:nowrap}
.lx-md-row .go .lx-btn{height:36px;white-space:nowrap;max-width:100%}
.lx-md-none{padding:18px 0;border-top:1px solid var(--line);font-size:13.5px;color:var(--muted)}
.lx-md-band{padding:22px 22px 10px}
.lx-md-meet{display:flex;align-items:center;gap:14px;padding:11px 0;border-top:1px solid var(--line)}
.lx-md-h+.lx-md-meet{border-top:0}
.lx-md-meet .lx-date{width:54px}
.lx-md-meet .lx-date b{font-size:15px}
.lx-md-meet b.t{display:block;font-size:14px;font-weight:600;line-height:1.3}
.lx-md-sub{display:block;font-size:12.5px;color:var(--muted);font-weight:400}
.lx-md-band .lx-btn.wide{width:100%;margin:10px 0 12px}
.lx-md-quiet{padding:6px 0 14px;font-size:13.5px;color:var(--muted);line-height:1.45}
.lx-md-doneb{padding:0 22px}
.lx-md-done{display:flex;gap:10px;padding:10px 0;font-size:13.5px;color:var(--ink-2);line-height:1.4}
.lx-md-done .lx-ic{width:16px;height:16px;margin-top:2px;stroke:var(--good);stroke-width:2.2}
.lx-md-form{display:grid;gap:14px}

.lx-pf-hero .lx-hero-h{align-items:center;gap:22px}
.lx-pf-side{display:grid;gap:8px;justify-items:end}
.lx-pf-cols{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:48px;align-items:start}
.lx-pf-row{display:grid;grid-template-columns:166px minmax(0,1fr) auto;gap:12px;align-items:center;min-height:66px;padding:12px 0;border-top:1px solid var(--line)}
.lx-pf-row:first-child{border-top:0}
.lx-pf-row .k{font-size:13.5px;color:var(--muted)}
.lx-pf-row .v{font-size:15.5px;font-weight:600;letter-spacing:-.012em;min-width:0;overflow-wrap:anywhere}
.lx-pf-row .v .lx-stat{font:inherit;color:var(--ink);white-space:normal}
.lx-pf-row .n{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);text-align:right}
.lx-pf-row .n .lx-ic{width:13px;height:13px}
.lx-pf-row select{height:36px;border:0;border-radius:10px;padding:0 10px;background:var(--bg-sunk);font:inherit;font-size:13.5px;font-weight:500;color:var(--ink);max-width:100%}
.lx-pf-band{display:grid;gap:14px}
.lx-pf-band h3{font-size:16px;font-weight:600;letter-spacing:-.015em}
.lx-pf-prev{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;background:#fff;box-shadow:var(--sh-1);font-size:14px;min-width:0}
.lx-pf-prev.top{align-items:flex-start}
.lx-pf-prev .t{min-width:0;flex:1;overflow-wrap:anywhere}
.lx-pf-prev small{font-size:12.5px;color:var(--muted);font-weight:400}
.lx-pf-prev .r{font-size:12.5px;color:var(--muted);white-space:nowrap}

.lx-rc-grid{padding:0;overflow:hidden}
.lx-rc-row{display:grid;grid-template-columns:minmax(0,1fr) repeat(4,142px);align-items:center;min-height:68px;padding:8px 28px;border-top:1px solid var(--line)}
.lx-rc-row.hd{border-top:0;align-items:end;padding-top:18px;padding-bottom:14px}
.lx-rc-row.hd p{font-size:13px;color:var(--muted)}
.lx-rc-col{display:grid;justify-items:center;gap:6px;text-align:center}
.lx-rc-col .lx-ic{width:18px;height:18px;color:var(--ink-2)}
.lx-rc-col b{font-size:13.5px;font-weight:600}
.lx-rc-col small{font-size:11.5px;color:var(--muted);white-space:nowrap}
.lx-rc-kind{min-width:0}
.lx-rc-kind b{display:block;font-size:15px;font-weight:600;letter-spacing:-.012em}
.lx-rc-kind span{display:block;margin-top:2px;font-size:13px;color:var(--muted)}
.lx-rc-cell{display:flex;justify-content:center}
.lx-rc-cell .lx-ic{color:var(--muted)}
.lx-rc-cell .lx-toggle.off{opacity:.45;cursor:default}
.lx-rc-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;align-items:stretch}
.lx-rc-card{display:flex;flex-direction:column;gap:6px}
.lx-rc-card .l{font-size:13px;color:var(--muted)}
.lx-rc-card .big{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:var(--num-l);font-weight:600;letter-spacing:-.04em;line-height:1.1;font-variant-numeric:tabular-nums}
.lx-rc-card .big small{font-size:14px;font-weight:400;letter-spacing:0;color:var(--muted)}
.lx-rc-card .big.word{font-size:22px;letter-spacing:-.025em;padding:6px 0}
.lx-rc-card p{font-size:13.5px;color:var(--muted);padding:6px 0 14px}
.lx-rc-time{border:0;background:transparent;font:inherit;color:inherit;letter-spacing:inherit;padding:0;min-width:0;max-width:100%;border-radius:8px;cursor:pointer}
.lx-rc-time:hover,.lx-rc-time:focus{background:var(--bg-sunk)}
.lx-rc-time::-webkit-calendar-picker-indicator{display:none}
.lx-rc-line{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:50px;border-top:1px solid var(--line);font-size:13.5px;color:var(--ink-2)}
.lx-rc-step{display:flex;align-items:center;gap:12px;padding:5px 0;font-size:13.5px;color:var(--ink-2)}
.lx-rc-card .lx-btn.primary{align-self:flex-start;margin-top:14px}

@media (max-width:1180px){
  .lx-md-cols,.lx-pf-cols{grid-template-columns:1fr;gap:28px}
  .lx-rc-three{grid-template-columns:1fr}
  .lx-rc-row{grid-template-columns:minmax(0,1fr) repeat(4,96px)}
}
@media (max-width:759px){
  .lx-md-hero .lx-hero-h,.lx-pf-hero .lx-hero-h{gap:14px}
  .lx-md-acts{width:100%}
  .lx-md-acts .lx-btn{flex:1;height:42px}
  .lx-md-main{gap:26px}
  .lx-md-row{grid-template-columns:minmax(0,1fr) auto auto;gap:6px 12px;min-height:0;padding:14px 0;align-items:center}
  .lx-md-row .what{grid-column:1/-1}
  .lx-md-row .due{text-align:right}
  /* a secondary button sits at the right end of the brand and due line, its own width; the first row's main button stays full width */
  .lx-md-row .go .lx-btn{width:auto;height:36px}
  .lx-md-row .go.main,.lx-md-row .go.lx-md-go2{grid-column:1/-1;margin-top:6px}
  .lx-md-row .go.main .lx-btn{width:100%;height:44px}
  .lx-md-band{padding:18px 18px 8px;border-radius:22px}
  .lx-md-doneb{padding:0 4px}
  .lx-pf-side{justify-items:stretch;width:100%}
  .lx-pf-side .lx-md-acts .lx-btn{flex:1}
  .lx-pf-row{grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;min-height:0;padding:13px 0}
  .lx-pf-row .k{grid-column:1/-1}
  .lx-pf-band{padding:18px;border-radius:22px}
  .lx-rc-row{grid-template-columns:minmax(0,1fr) repeat(4,48px);padding:10px 14px;min-height:62px}
  .lx-rc-row.hd p{font-size:12px}
  .lx-rc-col b{font-size:10.5px;line-height:1.15}
  .lx-rc-col small{display:none}
  .lx-rc-kind b{font-size:14px}
  .lx-rc-kind span{font-size:12px}
  .lx-rc-cell .lx-toggle{transform:scale(.88)}
  .lx-rc-three{gap:16px}
  .lx-rc-card .lx-btn.primary{align-self:stretch;height:46px}
}
`;
