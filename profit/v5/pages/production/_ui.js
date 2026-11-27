/* Shared parts for Production, Creators and Library (brand view) and Production in the agency view.
   Pictures, stage names, dates, the "example" chip and the small layout rules these pages need.
   Everything here is read only: a button that would change a card opens old Locus instead. */

import { APP_NAME } from '../../config.js';
import { exampleChip as kitExampleChip, put as kitPut } from '../../kit.js';
import { h, s, svgNode, button, avatar, addStyles } from '../../kit.js';
import { icon } from '../../icons.js';
import { defined, pageHelp } from '../../defs.js';

/* ---------- stages ---------- */
/* The board's own columns (the worker's names) and the five columns people read.
   Scheduled sits in "Ready to load" with a mark; Off sits in "Live" as Ended. */
export const COLS = [
  { id: 'brief', label: 'Brief', has: ['brief'] },
  { id: 'making', label: 'Making', has: ['making'] },
  { id: 'review', label: 'Review', has: ['review'] },
  { id: 'ready', label: 'Ready to load', has: ['ready', 'scheduled'] },
  { id: 'live', label: 'Live', has: ['live', 'off'] },
];
/* The eight steps on a card's own track. */
export const STEPS = ['Brief', 'Making', 'Team review', 'Client review', 'Ready', 'Scheduled', 'Live', 'Ended'];
export function stepOf(c) {
  const b = c.board;
  if (b === 'brief') return 0;
  if (b === 'making') return 1;
  if (b === 'review') return c.needs_client ? 3 : 2;
  if (b === 'ready') return 4;
  if (b === 'scheduled') return 5;
  if (b === 'live') return 6;
  return 7;
}
export const OPEN = ['brief', 'making', 'review', 'ready'];

/* ---------- dates ---------- */
const at = d => new Date(String(d).slice(0, 10) + 'T12:00:00');
export const isDay = d => /^\d{4}-\d{2}-\d{2}/.test(String(d || ''));
/** day('2026-11-26') "Nov 26"; day(x, true) "Thu Nov 26" */
export function day(d, week = false) {
  if (!isDay(d)) return '';
  return at(d).toLocaleDateString('en-US', week ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' });
}
export const daysFrom = (a, b) => (isDay(a) && isDay(b) ? Math.round((at(b) - at(a)) / 864e5) : null);
export const todayOf = data => (data && isDay(data.today) ? data.today : new Date().toLocaleDateString('en-CA'));
/** Monday to Sunday around a day, as two dates. */
export function weekOf(today) {
  const d = at(today), dow = (d.getDay() + 6) % 7;
  const a = new Date(d); a.setDate(d.getDate() - dow);
  const b = new Date(a); b.setDate(a.getDate() + 6);
  return [a.toLocaleDateString('en-CA'), b.toLocaleDateString('en-CA')];
}
/** "Due today", "Due Nov 25", "Nov 26" for a card on the board. */
export function dueText(c, today) {
  if (c.board === 'live') return c.since ? 'Since ' + day(c.since) : 'Live';
  if (c.board === 'off') return c.off_on ? 'Ended ' + day(c.off_on) : 'Ended';
  if (c.board === 'ready' || c.board === 'scheduled') return c.launch_on ? 'Goes live ' + day(c.launch_on) : c.due ? day(c.due) : 'No date';
  if (!c.due) return 'No date';
  return c.due === today ? 'Due today' : 'Due ' + day(c.due);
}
export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');
export const kb = n => (n == null ? '' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

/* ---------- pictures ---------- */
/* Stand-in drawings for sample mode, until a real picture is in the data. */
const ART = {
  belt: (a, b) => [
    s('ellipse', { cx: 60, cy: 64, rx: 44, ry: 4, fill: 'rgba(28,20,10,.08)' }),
    s('rect', { x: 14, y: 36, width: 82, height: 18, rx: 4, fill: a }),
    s('path', { d: 'M20 40H82M20 50H82', stroke: '#fff', 'stroke-width': 1.1, 'stroke-dasharray': '3 3', fill: 'none', opacity: .5 }),
    s('rect', { x: 82, y: 30, width: 26, height: 30, rx: 5, fill: b }),
    s('rect', { x: 88, y: 36, width: 14, height: 18, rx: 2.5, fill: 'none', stroke: '#fff', 'stroke-width': 2, opacity: .85 }),
  ],
  golfer: (a, b) => [
    s('path', { d: 'M28 90C28 72 43 64 60 64C77 64 92 72 92 90Z', fill: a }),
    s('circle', { cx: 60, cy: 44, r: 16, fill: '#E4D5C3' }),
    s('path', { d: 'M43 40C43 27 51 19 60 19C69 19 77 27 77 38V40Z', fill: b }),
    s('path', { d: 'M74 36C83 36 90 40 91 44C83 42.500 78 42.500 73 42.500Z', fill: b }),
  ],
  green: (a, b) => [
    s('path', { d: 'M0 62C24 50 44 54 62 58C84 63 100 56 120 50V90H0Z', fill: a }),
    s('path', { d: 'M78 56V22', stroke: '#fff', 'stroke-width': 1.6, fill: 'none' }),
    s('path', { d: 'M78 22L96 28L78 34Z', fill: b }),
    s('circle', { cx: 46, cy: 66, r: 3, fill: '#fff' }),
  ],
  box: (a, b) => [
    s('rect', { x: 30, y: 34, width: 60, height: 36, rx: 4, fill: a }),
    s('rect', { x: 26, y: 26, width: 68, height: 12, rx: 3, fill: b }),
    s('path', { d: 'M60 26V70', stroke: '#fff', 'stroke-width': 3, opacity: .8, fill: 'none' }),
    s('path', { d: 'M60 26C52 14 42 20 60 26C78 20 68 14 60 26', fill: 'none', stroke: '#fff', 'stroke-width': 2, opacity: .8 }),
  ],
};
function draw(art) {
  const a = art.c1 || '#1F2937', b = art.c2 || '#111827';
  if (art.kind === 'text') return h('span', { class: 'pd-art-t' }, art.text || '');
  if (art.kind === 'ad') {     // a whole sample ad: wordmark, the offer, the product, the button
    return h('div', { class: 'pd-admock' }, h('span', { class: 'm' }, art.brand || ''), h('span', { class: 'k' }, art.kicker || ''), h('b', null, art.text || ''),
      s('svg', { viewBox: '0 20 120 50', 'aria-hidden': 'true' }, ART.belt(art.c1 || '#E9E4DA', art.c2 || '#C9A45C')), h('span', { class: 'f' }, art.foot || ''), art.cta ? h('span', { class: 'c' }, art.cta) : null);
  }
  return s('svg', { viewBox: '0 0 120 90', preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' }, (ART[art.kind] || ART.belt)(a, b));
}
const glyph = video => svgNode(video
  ? '<svg viewBox="0 0 24 24" class="lx-ic" aria-hidden="true"><path d="M8 5.500v13l11-6.500z"/></svg>'
  : '<svg viewBox="0 0 24 24" class="lx-ic" aria-hidden="true"><rect x="3.500" y="5" width="17" height="14" rx="2"/><path d="M3.500 16l5-4.500 4 3.500 3-2.500 5 4"/><circle cx="9" cy="9.500" r="1.300"/></svg>');

/** picture({ src, art, video, ratio, alt, badge }) : a real picture when there is an address, the sample
    drawing when the fixture carries one, else a quiet mark. ratio: '4/3' (default), '4/5', '9/16', '1/1'. */
export function picture({ src, art, video = false, ratio = '4/3', alt = '', badge } = {}) {
  const el = h('div', { class: 'pd-pic', style: { aspectRatio: ratio, background: art && art.bg ? art.bg : null } });
  const blank = () => h('span', { class: 'pd-pic-none' }, glyph(video));
  if (src) {
    const img = h('img', { src, alt, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => { img.replaceWith(blank()); }, { once: true });
    el.append(img);
  } else if (art) el.append(draw(art));
  else el.append(blank());
  if (video && (src || art)) el.append(h('span', { class: 'pd-play' }, glyph(true)));
  if (badge) el.append(h('span', { class: 'pd-badge' }, badge));
  return el;
}

/* ---------- people ---------- */
/** who('Riley Chen', photos) : the photo when the data has one, initials otherwise (the full name on hover);
    a small "Nobody" tag when nobody owns it. */
export function who(name, photos, size = 22) {
  if (!name) return h('span', { class: 'pd-nobody', title: 'Nobody has this card yet' }, 'Nobody');
  const first = String(name).split(' ')[0];
  const el = avatar({ name, photo: (photos && (photos[name] || photos[first])) || null }, { size });
  el.title = name;
  return el;
}

/* ---------- small parts ---------- */
/** put(el, ...kids) : el.replaceChildren without printing "null" for a part that is left out. */
export const put = kitPut; /* one version, in the kit */
/** The chip on anything drawn from a fixture while real numbers are on (its data feed is not built yet). */
export const exampleChip = kitExampleChip; /* one version, in the kit */
/** The one way to change something from these pages for now. Hidden from a client. */
export function oldLocus(ctx, { label = 'Open in old ' + APP_NAME, href, large = false, primary = false } = {}) {
  const to = href || ctx.legacy;
  return !to || ctx.isClient ? null : button(label, { href: to, target: '_blank', icon: 'arrow', large, primary, ghost: !primary, title: 'Opens old ' + APP_NAME + ' in a new tab' });
}
/** The small "Team only" tag (same look as the kit tabs), with its hover definition. */
export const teamTag = () => defined(h('span', { class: 'lx-team-tag' }, 'Team only'), 'team_only');
/** The one row at the top of a page, the same layout as the Creative pages' help row: the source chip and its quiet
    line on the left; the "Team only" tag, its link or button, then "What is this page?" on the right.
    body: text or [{ title, text }] (the help sheet). extras: nodes in any order; buttons and the team tag go right. */
export function pageTop(body, ...extras) {
  const list = extras.filter(Boolean);
  const isRight = n => !!(n && n.nodeType === 1 && (n.matches('.lx-btn, a, button, .lx-team-tag') || n.querySelector('.lx-team-tag')));
  return h('div', { class: 'pd-top' }, h('div', { class: 'l' }, ...list.filter(n => !isRight(n))), h('span', { class: 'lx-sp' }), ...list.filter(isRight), pageHelp({ body }));
}
/** A status dot that explains itself on hover or tap. */
export const dotDef = (dot, name, definition) => defined(dot, { name, definition });
export const cardLink = (ctx, id) => (ctx.legacy && id ? ctx.legacy + '&card=' + encodeURIComponent(id) : ctx.legacy);
export const sect = (title, note, right) => h('div', { class: 'pd-sect' }, h('h2', null, title), note != null && note !== '' ? h('span', null, note) : null, h('span', { class: 'lx-sp' }), right || null);
export const lucide = name => svgNode(icon(name));

/* ---------- layout rules ---------- */
const CSS = `
.pd-tools{display:flex;gap:12px 16px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap}
.pd-th h2{margin:0;font-size:var(--fs-section,17px);font-weight:600;line-height:1.25}
.pd-th p{margin:2px 0 0;font-size:var(--fs-small,12.5px);color:var(--muted)}
.pd-filt{max-width:100%;overflow-x:auto;scrollbar-width:none}
.pd-filt .lx-seg button{white-space:nowrap}
.pd-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap;min-width:0}
.pd-top>.cr-quiet,.pd-top>.note{font-size:13px;color:var(--muted)}
.pd-top>.l{display:flex;align-items:center;gap:8px 10px;flex-wrap:wrap;min-width:0}
.pd-top>.l>.cr-quiet,.pd-top>.l>.note{font-size:13px;color:var(--muted)}
.pd-kpi-go{cursor:pointer;transition:box-shadow var(--t) var(--ease)}
.pd-kpi-go:hover{box-shadow:var(--sh-2)}
.pd-kpi-go:focus-visible{outline:2px solid var(--ink-2);outline-offset:2px}
.pd-sect{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:-12px}
.pd-sect h2{font-size:var(--fs-section,17px);font-weight:600;letter-spacing:-.015em}
.pd-sect>span{font-size:13px;color:var(--muted)}
.pd-ex{background:var(--warn-bg);color:var(--warn)}
.pd-pic{position:relative;width:100%;border-radius:var(--r-chip,6px);overflow:hidden;background:var(--bg-sunk);display:grid;place-items:center;min-width:0}
.pd-pic>img,.pd-pic>svg{width:100%;height:100%;object-fit:cover;display:block}
.pd-pic-none{color:var(--icon);display:grid;place-items:center}
.pd-pic-none .lx-ic{width:22px;height:22px}
.pd-art-t{padding:10px;font-size:13px;font-weight:600;letter-spacing:-.01em;line-height:1.2;color:#fff;text-align:center}
.pd-pic:has(.pd-admock){container-type:inline-size;place-items:stretch}
.pd-admock{display:grid;grid-template-rows:auto auto auto 1fr auto;gap:2.500cqw;padding:7cqw;color:#fff;text-align:left;min-width:0}
.pd-admock .m{font-size:3.600cqw;font-weight:700;letter-spacing:.16em;text-transform:uppercase;opacity:.9}
.pd-admock .k{margin-top:5cqw;font-size:3.200cqw;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:#C9A45C}
.pd-admock b{font-size:9.500cqw;line-height:1.04;letter-spacing:-.03em;font-weight:700}
.pd-admock svg{width:100%;height:100%;min-height:0}
.pd-admock .f{font-size:3.600cqw;opacity:.8}
.pd-admock .c{position:absolute;right:7cqw;bottom:6cqw;padding:2cqw 4.500cqw;border-radius:99px;background:#fff;color:#16130F;font-size:3.400cqw;font-weight:600}
.pb-week{display:grid;gap:8px}
.pb-week>div:first-child{display:flex;justify-content:space-between;gap:12px;font-size:13px;color:var(--muted)}
.pb-week b{color:var(--ink);font-weight:600}
.pd-play{position:absolute;left:8px;bottom:8px;width:26px;height:26px;border-radius:50%;background:rgba(22,19,15,.72);color:#fff;display:grid;place-items:center}
.pd-play .lx-ic{width:13px;height:13px;fill:currentColor;stroke:none}
.pd-badge{position:absolute;right:8px;bottom:8px;padding:2px 7px;border-radius:999px;background:rgba(22,19,15,.72);color:#fff;font-size:11.5px;font-weight:600;font-variant-numeric:tabular-nums}
.pd-nobody{display:inline-flex;align-items:center;height:18px;padding:0 7px;border-radius:999px;background:var(--bg-sunk);color:var(--muted);font-size:10.5px;font-weight:600;white-space:nowrap;flex:none}

/* the board */
.pd-board{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;align-items:start}
.pd-col{background:var(--band);border-radius:var(--r-card,16px);padding:10px;display:grid;grid-template-columns:minmax(0,1fr);gap:10px;min-width:0;align-content:start}
.pd-col-h{display:flex;justify-content:space-between;align-items:center;padding:6px 6px 0;font-size:var(--fs-card,14px);font-weight:600}
.pd-col-h span{color:var(--muted);font-weight:500;font-variant-numeric:tabular-nums}
.pd-col-none{padding:4px 6px 8px;font-size:12.5px;color:var(--faint)}
.pd-col-more{padding:2px 6px 6px;font-size:12.5px;color:var(--muted)}
.pd-card{display:grid;gap:8px;width:100%;min-width:0;padding:10px;border:0;border-radius:var(--r-tbl,12px);background:var(--surface);box-shadow:var(--sh-1);text-align:left;cursor:pointer;transition:box-shadow var(--t) var(--ease),transform var(--t) var(--ease)}
.pd-card:hover{box-shadow:var(--sh-2)}
.pd-meta{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);min-width:0;flex-wrap:wrap}
.pd-meta b{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.pd-meta .lx-stat{margin-left:auto;font-size:11.5px}
.pd-t{font-size:13.5px;font-weight:600;line-height:1.3;letter-spacing:-.01em;overflow-wrap:anywhere}
.pd-foot{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);min-width:0}
.pd-foot>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pd-foot .lx-avatar,.pd-foot .pd-nobody{margin-left:auto}
.pd-foot .late{color:var(--bad);font-weight:600}
.pd-body{display:grid;gap:6px;min-width:0}

/* rows of cards in a list (agency pages, coming up) */
.pd-list{display:flex;flex-direction:column}
.pd-line:hover{background:var(--row-hover)}
.pd-line{display:grid;grid-template-columns:54px minmax(0,1fr) auto auto;gap:14px;align-items:center;padding:12px 0;border-top:1px solid var(--line);color:inherit;text-decoration:none;background:none;border-left:0;border-right:0;border-bottom:0;width:100%;text-align:left;cursor:pointer;font:inherit}
.pd-line:first-child{border-top:0}
.pd-line .n{font-weight:600;font-variant-numeric:tabular-nums;color:var(--muted)}
.pd-line .t{min-width:0}
.pd-line .t b{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pd-line .t small{display:block;font-size:12.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pd-line .w{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-2);white-space:nowrap}
.pd-line .d{font-size:13px;color:var(--muted);white-space:nowrap;text-align:right;min-width:86px;font-variant-numeric:tabular-nums}
.pd-line .d.late{color:var(--bad);font-weight:600}

/* grids of pictures (creators, library) */
.pd-grid{display:grid;grid-template-columns:repeat(var(--cols,4),minmax(0,1fr));gap:18px}
.pd-tile{display:grid;grid-template-columns:minmax(0,1fr);gap:9px;min-width:0;align-content:start;padding:0;border:0;background:none;text-align:left;font:inherit;color:inherit;text-decoration:none;cursor:pointer}
.pd-tile .pd-pic{border-radius:var(--r-tbl,12px);box-shadow:0 0 0 1px var(--line)}
.pd-tile:hover .pd-pic{box-shadow:0 0 0 1px var(--line),var(--sh-2)}
.pd-tile b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:13.5px;font-weight:600;line-height:1.3;overflow:hidden}
.pd-tile small{display:block;font-size:12.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pd-tile q{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12.5px;color:var(--ink-2);quotes:none;line-height:1.4}
.pd-by{display:flex;align-items:center;gap:8px;min-width:0}
.pd-by>div{min-width:0}
.pd-search{max-width:280px;flex:1 1 200px}
.pd-chips{display:flex;gap:6px;flex-wrap:wrap}
.pd-chips button{height:30px;padding:0 12px;border:0;border-radius:var(--r-chip,6px);background:var(--bg-sunk);color:var(--ink-2);font-size:13px;font-weight:500;cursor:pointer}
.pd-chips button.on{background:var(--surface);color:var(--ink);box-shadow:var(--sh-1),inset 0 0 0 1px var(--line)}
.pd-chips button span{margin-left:6px;opacity:.65;font-variant-numeric:tabular-nums}
.pd-cell{display:flex;align-items:center;gap:10px;min-width:0}
.pd-cell .pd-pic{width:38px;flex:none;border-radius:8px}
.pd-cell>div:last-child{min-width:0}
.pd-cell b{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:36ch}
.pd-cell small{display:block;font-size:12.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:44ch}

@media (max-width:1040px){
  .pd-grid{--cols:3!important}
}
@media (max-width:759px){
  .pd-board{grid-template-columns:minmax(0,1fr)}
  .pd-card{grid-template-columns:92px minmax(0,1fr);align-items:center;gap:12px}
  .pd-grid{--cols:2!important;gap:14px}
  .pd-line{grid-template-columns:40px minmax(0,1fr) auto;gap:10px}
  .pd-line .w span{display:none}
  .pd-line .d{grid-column:2/4;text-align:left;min-width:0;margin-top:-8px}
  .pd-search{max-width:none;flex-basis:100%}
  .pd-cell b{max-width:20ch}
  .pd-cell small{max-width:22ch}
}
`;
export const css = () => addStyles('pd-css', CSS);
