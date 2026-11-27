/* Local parts for Google > Ads and videos. Kit gaps written here, not in the frame:
   a video tile, the "how far people watch" mini columns, a share bar in three parts,
   an asset row and a cell bar. Styles are added to the page once. No ember in here. */

import { h, svgNode, addStyles } from '../../kit.js';
import { icon } from '../../icons.js';

const CSS = `
/* frame gap, fixed here until app.css has it: a one column grid must let its column shrink, or the tab row widens the whole page on a phone */
.gv-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px}
.gv-vid{display:grid;gap:14px;align-content:start;min-width:0;cursor:pointer;border-radius:var(--r-card,16px);padding:8px;margin:-8px}
.gv-l{display:block;font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted)}
.gv-thumb{position:relative;aspect-ratio:16/9;border-radius:var(--r-tbl,12px);overflow:hidden;background:linear-gradient(180deg,#ECEAE6 0%,#DEDBD5 100%);box-shadow:inset 0 0 0 1px rgba(28,20,10,.06)}
.gv-thumb.b{background:linear-gradient(180deg,#E6E9F0 0%,#D5D9E3 100%)}
.gv-thumb.c{background:linear-gradient(90deg,#CFCAC2 0 34%,#E4E1DB 34% 66%,#CFCAC2 66%)}
.gv-thumb.d{background:linear-gradient(180deg,#F1EFEC 0%,#E7E4DF 100%)}
.gv-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.gv-play{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:#fff;box-shadow:0 2px 10px rgba(28,20,10,.18)}
.gv-play::after{content:"";position:absolute;left:16px;top:13px;border-left:10px solid var(--ink);border-top:7px solid transparent;border-bottom:7px solid transparent}
.gv-dur{position:absolute;right:8px;bottom:8px;padding:2px 7px;border-radius:7px;background:rgba(22,19,15,.86);color:#fff;font-size:11.5px;font-weight:600;font-variant-numeric:tabular-nums}
.gv-tag{position:absolute;left:8px;top:8px;padding:2px 9px;border-radius:999px;background:#fff;font-size:11.5px;font-weight:500;box-shadow:0 0 0 1px var(--line-strong)}
.gv-vid h4{margin:0;font-size:15px;font-weight:600;letter-spacing:-.015em;overflow-wrap:anywhere}
.gv-vid .sub{font-size:12.5px;color:var(--muted);line-height:1.45}
.gv-roas{display:flex;align-items:flex-end;justify-content:space-between;gap:10px}
.gv-roas .big{font-size:var(--num-l);font-weight:600;letter-spacing:-.035em;line-height:1.1;font-variant-numeric:tabular-nums}
.gv-roas .big.na{color:var(--faint)}
.gv-roas .r{text-align:right;font-size:12px;color:var(--muted);line-height:1.3}
.gv-roas .r b{display:block;font-size:16px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.gv-says{font-size:12px;color:var(--muted)}
.gv-three{display:grid;grid-template-columns:repeat(3,auto);justify-content:space-between;gap:10px}
.gv-three span{display:grid;gap:2px;font-size:12px;color:var(--muted)}
.gv-three b{font-size:14.5px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.gv-q{display:flex;align-items:flex-end;gap:14px}
.gv-q .cols{display:grid;grid-template-columns:repeat(4,24px);gap:5px;align-items:end;height:48px}
.gv-q .cols i{display:block;border-radius:4px 4px 2px 2px;background:var(--ink);min-height:3px}
.gv-q .cols i.q2{background:#4A4641}.gv-q .cols i.q3{background:#8A857D}.gv-q .cols i.q4{background:var(--slate)}
.gv-q .lab{display:grid;grid-template-columns:repeat(4,24px);gap:5px;margin-top:4px;font-size:10.5px;color:var(--faint);text-align:center;font-variant-numeric:tabular-nums}
.gv-q .say{font-size:12px;color:var(--muted);line-height:1.35}
.gv-q .say b{display:block;font-size:16px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.gv-share{display:flex;gap:3px;height:6px;margin:16px 0 10px}
.gv-share i{display:block;border-radius:999px;min-width:4px}
.gv-share .good{background:var(--good)}.gv-share .mid{background:#C4C9D4}.gv-share .bad{background:var(--bad)}
.gv-cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:40px;margin-top:22px}
.gv-asset{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line);min-width:0}
.gv-asset:first-of-type{border-top:0}
.gv-asset .sw{flex:none;width:42px;height:42px;border-radius:10px;background:linear-gradient(180deg,#F1EFEC,#E2DFD9);display:grid;place-items:center;font-family:var(--serif);font-size:17px;color:var(--ink-2);position:relative}
.gv-asset .sw.v::after{content:"";width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(28,20,10,.2)}
.gv-asset .t{min-width:0;flex:1}
.gv-asset .t b{display:block;font-size:13.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gv-asset .t span{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.gv-bar{display:inline-block;width:150px;max-width:100%;height:4px;border-radius:999px;background:var(--bg-sunk);position:relative;vertical-align:middle}
.gv-bar::after{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--v,0%);background:var(--ink);border-radius:999px}
.gv-note{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted)}
.gv-note .lx-ic{width:15px;height:15px}
.gv-strip{display:flex;align-items:center;gap:16px;padding:18px 22px;border-radius:var(--r-card,16px);background:var(--band)}
.gv-strip .ic{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:#fff;box-shadow:0 0 0 1px var(--line)}
.gv-strip .tx{min-width:0;flex:1}
.gv-strip .tx b{display:block;font-size:15px;font-weight:600}
.gv-strip .tx span{font-size:13px;color:var(--muted)}
@media (max-width:1180px){.gv-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:28px 24px}}
@media (max-width:759px){
  .gv-grid{grid-template-columns:1fr;gap:28px}
  .gv-cols{grid-template-columns:1fr;gap:22px}
  .gv-strip{flex-wrap:wrap;padding:16px}
  .gv-rate>.lx-sec{flex-wrap:wrap}.gv-rate>.lx-sec .act{margin-left:0;width:100%}.gv-rate>.lx-sec .lx-btn{width:100%;height:46px}
  .gv-strip .lx-btn{width:100%;height:46px}
  .gv-bar{width:64px}
  .gv-heads th:first-child,.gv-heads td:first-child{width:34px}
  .gv-heads th,.gv-groups th{white-space:normal;line-height:1.2}
}`;

/** Add the local styles once. */
export function styles() {
  addStyles('gv-css', CSS);
}

/** A 16:9 tile: the real cover when there is one, else a quiet drawn one. */
export function thumb({ src, dur, tag, look = '' } = {}) {
  return h('div', { class: 'gv-thumb ' + look },
    src && h('img', { src, alt: '', loading: 'lazy', decoding: 'async' }),
    h('span', { class: 'gv-play', 'aria-hidden': 'true' }),
    tag && h('span', { class: 'gv-tag' }, tag),
    dur && h('span', { class: 'gv-dur' }, dur));
}

/** How far people watch: four columns (25, 50, 75, 100 percent of the video) and the share who finish. */
export function quartiles(q, endText = 'of viewers watch to the end') {
  if (!q || q.length < 4 || q.some(v => v == null)) return null;
  const top = Math.max(...q, 1);
  return h('div', { class: 'gv-q', role: 'img', 'aria-label': `Watched 25 percent ${q[0]}%, half ${q[1]}%, 75 percent ${q[2]}%, all ${q[3]}%` },
    h('div', null,
      h('div', { class: 'cols' }, q.map((v, i) => h('i', { class: 'q' + (i + 1), style: { height: Math.max(6, Math.round(100 * v / top)) + '%' } }))),
      h('div', { class: 'lab' }, ['25', '50', '75', '100'].map(t => h('span', null, t)))),
    h('div', { class: 'say' }, h('b', null, q[3] + '%'), endText));
}

/** Three parts of a whole as one thin bar. */
export function shareBar(parts) {
  return h('div', { class: 'gv-share', 'aria-hidden': 'true' }, parts.filter(p => p.n > 0).map(p => h('i', { class: p.tone, style: { flex: p.n + ' 1 0' } })));
}

/** One asset row: a swatch, a name, one stat, and the rating on the right. */
export function assetRow({ kind, name, stat, right }) {
  return h('div', { class: 'gv-asset' },
    h('span', { class: 'sw' + (kind === 'video' ? ' v' : '') }, kind === 'headline' ? 'Aa' : ''),
    h('span', { class: 't' }, h('b', { title: name }, name), stat && h('span', null, stat)), right || null);
}

/** A thin ink bar for a table cell. v is 0 to 1. */
export function cellBar(v) { return h('span', { class: 'gv-bar', style: { '--v': Math.max(0, Math.min(100, 100 * v)).toFixed(1) + '%' } }); }

/** A quiet strip with an icon, two lines and one action. */
export function strip({ ic = 'google', title, text, action }) {
  return h('div', { class: 'gv-strip' }, h('span', { class: 'ic' }, svgNode(icon(ic))), h('span', { class: 'tx' }, h('b', null, title), h('span', null, text)), action || null);
}
