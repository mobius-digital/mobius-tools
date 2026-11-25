/* Creative > What works and Creative review: the parts every tab shares.
   - the page's own layout rules (ww- classes, added once)
   - the ad picture (a real cover when the data has one, a drawn tile when it does not)
   - the two small notes: "Tags are being re-checked" and "Example until its data feed is built"
   - the live readers (one Meta ads read, one brand read) and the plain states
   - the "From a finding to new ads" sheet, opened from a button on any finding. Read only for now. */

import { exampleChip as kitExampleChip } from '../../kit.js';
import { h, s, addStyles, button, sheet, gauge, empty, statusDot, avatar, platformChip, barChart, money, num, pct, x } from '../../kit.js';
import { AI_NAME, legacyUrl, APP_NAME } from '../../config.js';
import { fixture } from '../../data.js';

/* ---------- words used on every tab ---------- */
export const SRC_NOTE = 'Meta ads in sales campaigns. Sales and ROAS from Triple Whale, last click per platform. Spend, clicks and views from Meta.';
export const FLOOR_ORDERS = 30;                       // under this many orders a ROAS is a hint, not a result
export const thin = orders => !(orders >= FLOOR_ORDERS);
export const thinWords = orders => (orders > 0 ? `Only ${num(orders)} ${orders === 1 ? 'order' : 'orders'}. Too early to say.` : 'No orders yet.');
export const p1 = v => (v == null ? 'no data' : pct(v, { digits: v < 0.1 ? 2 : 0 }));
export const p0 = v => (v == null ? 'no data' : pct(v));

/* ---------- layout rules ---------- */
const CSS = `
.ww-stack{display:grid;gap:var(--sp-8);min-width:0}
.ww-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-width:0}
.ww-bar .lx-seg{max-width:100%;overflow-x:auto;scrollbar-width:none}
.ww-bar .lx-seg button{white-space:nowrap}
.ww-bar .sp{flex:1 1 auto}
.ww-bar .note{font-size:13px;color:var(--muted)}
.ww-note{gap:7px}
.ww-note::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--watch);flex:none}
.ww-note.ex::before{background:var(--slate)}
.ww-art{position:relative;display:block;width:100%;aspect-ratio:var(--ar,4/5);border-radius:12px;overflow:hidden;background:var(--tone,var(--bg-sunk));color:#fff;box-shadow:inset 0 0 0 1px var(--line)}
.ww-art img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ww-art svg{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;opacity:.9}
.ww-art.plain{color:var(--icon)}
.ww-art .cap{position:absolute;left:8px;top:8px;right:44px;font-size:11px;font-weight:550;line-height:1.25;text-shadow:0 1px 2px rgba(0,0,0,.35)}
.ww-art .len{position:absolute;right:8px;top:8px;font-size:11px;font-weight:600;background:rgba(0,0,0,.45);border-radius:6px;padding:1px 6px}
.ww-art .over{position:absolute;left:8px;right:8px;bottom:10px;text-align:center;font-size:12.5px;font-weight:700;line-height:1.2;text-shadow:0 1px 3px rgba(0,0,0,.5)}
.ww-art .kind{position:absolute;left:8px;top:8px;font-size:11px;font-weight:600;color:#fff;background:rgba(22,19,15,.72);border-radius:6px;padding:2px 7px}
.ww-art .pc{position:absolute;left:6px;bottom:6px;font-size:11px;font-weight:700;background:rgba(0,0,0,.5);border-radius:5px;padding:0 5px}
.ww-thumbs{display:flex;gap:8px;flex-wrap:wrap}
.ww-thumbs>*{width:56px;flex:none}
.ww-thumbs .ww-art{border-radius:8px}
.ww-thumbs .ww-art .over,.ww-thumbs .ww-art .len,.ww-thumbs .ww-art .cap{display:none}
.ww-thumbs .ww-art svg{width:18px;height:18px;margin:-9px 0 0 -9px}
.ww-thumbs small{display:block;margin-top:4px;font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ww-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:20px;min-width:0}
.ww-c{display:flex;flex-direction:column;gap:12px;min-width:0;padding:12px 12px 14px;border-radius:var(--r-lg);background:#fff;box-shadow:var(--sh-1)}
.ww-c .nm{display:flex;align-items:flex-start;gap:8px;font-size:14px;font-weight:600;line-height:1.3;min-width:0}
.ww-c .nm span:first-child{min-width:0;overflow-wrap:anywhere}
.ww-c .nm .lx-cap{margin-left:auto;padding-top:3px}
.ww-c .sub{font-size:12px;color:var(--muted);overflow-wrap:anywhere}
.ww-st{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px}
.ww-st>div{min-width:0}
.ww-st span{display:block;font-size:10.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--faint)}
.ww-st b{display:block;font-size:19px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.ww-st b.dim{color:var(--faint);font-weight:500}
.ww-st b.bad{color:var(--bad)}
.ww-st small{display:block;font-size:11.5px;color:var(--muted)}
.ww-3{display:grid;gap:6px;padding-top:10px;border-top:1px solid var(--line)}
.ww-3 .r{display:grid;grid-template-columns:78px 1fr auto;gap:8px;align-items:center;font-size:12px;color:var(--ink-2)}
.ww-3 .r b{font-weight:600;font-variant-numeric:tabular-nums;min-width:44px;text-align:right}
.ww-3 .t{height:5px;border-radius:999px;background:var(--bg-sunk);position:relative}
.ww-3 .t i{position:absolute;left:0;top:0;bottom:0;width:var(--v,0%);border-radius:999px;background:var(--ink)}
.ww-3 .t i.s{background:var(--slate)}
.ww-3 .cnt{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:12px;color:var(--muted)}
.ww-3 .cnt b{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.ww-say{font-size:12.5px;line-height:1.4;color:var(--ink-2)}
.ww-say .lx-cap{color:var(--brand-ink);margin-right:6px}
.ww-ft{display:flex;align-items:center;gap:8px;margin-top:auto;padding-top:10px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
.ww-ft .lx-stat{margin-left:auto}
.ww-c .lx-btn{width:100%}
.ww-q{display:grid;grid-template-columns:220px minmax(0,1fr);gap:24px}
.ww-q h3{font-size:16px;font-weight:600;letter-spacing:-.015em}
.ww-q .meta{display:grid;gap:6px;align-content:start;font-size:13px;color:var(--muted)}
.ww-q .meta b{color:var(--ink);font-variant-numeric:tabular-nums}
.ww-q .care{font-size:12.5px;color:var(--ink-2);padding:10px 12px;border-radius:10px;background:var(--surface-2)}
.ww-gs{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px;min-width:0}
.ww-g{display:grid;gap:8px;align-content:start;min-width:0}
.ww-g .hd{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600}
.ww-g .hd .lx-stat{margin-left:auto}
.ww-g .v{font-size:28px;font-weight:600;letter-spacing:-.035em;font-variant-numeric:tabular-nums;line-height:1.1}
.ww-g .v small{font-size:12px;font-weight:500;color:var(--muted);letter-spacing:0;margin-left:6px}
.ww-g .v.dim{color:var(--faint)}
.ww-g p{font-size:12.5px;color:var(--muted)}
.ww-rows{display:grid}
.ww-row{display:grid;grid-template-columns:minmax(150px,1.2fr) 74px minmax(120px,1.4fr) 74px auto;gap:18px;align-items:center;padding:16px 0;border-top:1px solid var(--line);min-width:0}
.ww-row:first-child{border-top:0}
.ww-row .nm{font-size:14.5px;font-weight:600}
.ww-row .nm small{display:block;font-size:12px;font-weight:400;color:var(--muted)}
.ww-row .big{font-size:24px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.ww-row .big.dim{color:var(--faint)}
.ww-row .mid small{display:block;margin-top:5px;font-size:12px;color:var(--muted)}
.ww-row .side{font-size:13px;font-variant-numeric:tabular-nums;color:var(--ink-2)}
.ww-row .side small{display:block;font-size:10.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--faint)}
.ww-row .ww-thumbs>*{width:44px}
.ww-find{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}
.ww-f{display:grid;gap:12px;align-content:start;padding:18px 20px;border-radius:var(--r-lg);background:#fff;box-shadow:var(--sh-1);min-width:0}
.ww-f .say{font-size:15px;line-height:1.4;color:var(--ink)}
.ww-f .ft{font-size:12px;color:var(--muted)}
.ww-f .lx-btn{justify-self:start}
.ww-l{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px 24px;padding:20px 0;border-top:1px solid var(--line)}
.ww-l:first-child{border-top:0}
.ww-l .t{font-size:17px;font-weight:550;line-height:1.35;letter-spacing:-.01em}
.ww-l .t.off{color:var(--muted);text-decoration:line-through}
.ww-l .m{display:flex;gap:8px 14px;flex-wrap:wrap;align-items:center;font-size:12.5px;color:var(--muted)}
.ww-l .side{display:grid;gap:10px;justify-items:end;align-content:start}
.ww-shelf{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:8px 0 -8px}
.ww-shelf h3{font-size:15px;font-weight:600}
.ww-shelf span{font-size:13px;color:var(--muted)}
.ww-hk .q{font-size:14px;font-weight:600;line-height:1.3;overflow-wrap:anywhere}
.ww-hk .q.none{color:var(--muted);font-weight:500}
.ww-hk .hr{display:flex;align-items:baseline;gap:8px}
.ww-hk .hr b{font-size:22px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.ww-hk .hr span{font-size:12px;color:var(--muted)}
.ww-hk .hr .lx-delta{margin-left:auto}
.ww-pg{display:grid;grid-template-columns:44px minmax(0,1.6fr) repeat(4,minmax(64px,.6fr)) auto;gap:16px;align-items:center;padding:14px 28px;border-top:1px solid var(--line);cursor:pointer;background:none;border-left:0;border-right:0;border-bottom:0;width:100%;text-align:left;font:inherit;color:inherit}
.ww-pg:hover{background:var(--surface-2)}
.ww-pg.hd{cursor:default;padding-top:6px;padding-bottom:8px;border-top:0}
.ww-pg.hd:hover{background:none}
.ww-pg .n{text-align:right;font-variant-numeric:tabular-nums}
.ww-pg .n b{display:block;font-size:15px;font-weight:600}
.ww-pg .n small{display:block;font-size:11.5px;color:var(--muted)}
.ww-pg .n .dim{color:var(--faint);font-weight:500}
.ww-pg .pth{min-width:0}
.ww-pg .pth b{display:block;font-size:14px;font-weight:600;overflow-wrap:anywhere}
.ww-pg .pth small{display:block;font-size:12px;color:var(--muted)}
.ww-mini{width:44px;height:64px;border-radius:7px;box-shadow:inset 0 0 0 1px var(--line-strong);background:#fff;padding:5px;display:grid;gap:3px;align-content:start}
.ww-mini i{display:block;height:3px;border-radius:2px;background:var(--line-strong)}
.ww-mini i.b{height:20px;background:var(--bg-sunk)}
.ww-ph{width:220px;max-width:100%;aspect-ratio:9/17;border-radius:26px;box-shadow:0 0 0 1px var(--line-strong),var(--sh-1);background:#fff;padding:10px;overflow:hidden;justify-self:center}
.ww-ph iframe{width:100%;height:100%;border:0;border-radius:16px;background:var(--bg-sunk)}
.ww-ph .sk{display:grid;gap:8px;align-content:start;height:100%}
.ww-ph .sk i{display:block;border-radius:6px;background:var(--bg-sunk)}
.ww-ph .sk .tb{height:16px;background:var(--ink);border-radius:5px;color:#fff;font:600 8px/16px var(--sans);text-align:center;letter-spacing:.06em}
.ww-ph .sk .two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ww-steps{display:grid;gap:12px}
.ww-steps .r{display:grid;gap:5px;font-size:13px}
.ww-steps .r>div:first-child{display:flex;gap:8px;align-items:baseline}
.ww-steps .r b{margin-left:auto;font-variant-numeric:tabular-nums}
.ww-steps .r small{color:var(--muted);font-size:12px}
.ww-cmp{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:18px}
.ww-cmp .ww-c{padding:10px 10px 12px;gap:8px}
.ww-watch{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
.ww-watch>div{padding:14px 16px;border-radius:14px;background:var(--surface-2);min-width:0}
.ww-watch b{display:block;font-size:14.5px}
.ww-watch small{display:block;font-size:12px;color:var(--muted);overflow-wrap:anywhere}
.ww-watch .k{display:flex;gap:16px;margin-top:10px;font-size:12px;color:var(--muted)}
.ww-watch .k b{display:inline;font-size:16px;margin-right:4px;font-variant-numeric:tabular-nums}
.ww-test{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px}
.ww-test h4{margin:0 0 10px;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
.ww-test .ab{display:grid;gap:10px}
.ww-test .ab div{padding-left:12px;border-left:2px solid var(--ink);font-size:13px;line-height:1.4}
.ww-test .ab div+div{border-left-color:var(--slate)}
.ww-test .ab small{display:block;font-size:12px;color:var(--muted)}
.ww-test ol{margin:0;padding-left:18px;display:grid;gap:8px;font-size:13px;color:var(--ink-2)}
.ww-test .need b{display:block;font-size:20px;font-weight:600;letter-spacing:-.03em}
.ww-test .need small{display:block;font-size:12px;color:var(--muted);margin-bottom:10px}
.ww-txt{font-size:14.5px;line-height:1.4;font-weight:500;overflow-wrap:anywhere}
.ww-txt small{display:block;margin-top:4px;font-size:12px;font-weight:400;color:var(--muted)}
@media (min-width:760px){.lx-sheet.ww-flow{width:min(1100px,calc(100% - 32px))}.lx-sheet.ww-wide{width:min(900px,calc(100% - 32px))}}
.ww-fl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px;align-items:start}
.ww-fl .stp{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:600;margin-bottom:16px}
.ww-fl .stp i{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--ink);color:#fff;font:600 13px/1 var(--sans);flex:none}
.ww-fl .lead{font-size:18px;line-height:1.35;color:var(--ink-2);margin-bottom:10px}
.ww-fl .lead b{color:var(--ink)}
.ww-fbar{margin-top:8px}.ww-fsub{display:flex;font-size:11.5px;color:var(--muted);margin-top:8px;line-height:1.3}.ww-fsub span{flex:1;min-width:0;text-align:center;padding:0 4px;overflow-wrap:anywhere}.ww-fsub b{display:block;font-size:12.5px;font-weight:600;color:var(--ink)}
.ww-bars{display:flex;align-items:flex-end;gap:14px;height:220px;margin-top:16px}
.ww-bars>div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;min-width:0;text-align:center}
.ww-bars b{font-size:24px;font-weight:600;letter-spacing:-.03em}
.ww-bars i{display:block;border-radius:8px 8px 0 0;background:var(--ink);height:var(--v,10%);min-height:6px;margin-top:4px}
.ww-bars .n i{background:var(--slate-soft)}
.ww-bars .n b{color:var(--muted)}
.ww-bars span{display:block;margin-top:8px;font-size:12.5px;font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ww-bars small{display:block;font-size:11.5px;color:var(--muted)}
.ww-bf{padding:18px 20px;border-radius:var(--r-lg);box-shadow:var(--sh-2);background:#fff}
.ww-bf h3{font-size:17px;font-weight:600;letter-spacing:-.02em;margin:8px 0 6px}
.ww-bf .by{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)}
.ww-bf .by .lx-gem{width:18px;height:18px}
.ww-bf dl{margin:0}
.ww-bf dl div{display:grid;grid-template-columns:86px 1fr;gap:10px;padding:11px 0;border-top:1px solid var(--line);font-size:14px}
.ww-bf dt{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);padding-top:3px}
.ww-bf dd{margin:0;font-weight:550;overflow-wrap:anywhere}
.ww-bd{padding:16px;border-radius:var(--r-lg);background:var(--band);display:grid;gap:10px}
.ww-bd .col{font-size:12.5px;font-weight:600;color:var(--ink-2)}
.ww-bd .k{padding:12px 14px;border-radius:12px;background:#fff;box-shadow:var(--sh-1);font-size:13.5px;font-weight:550}
.ww-bd .k small{display:block;font-size:12px;font-weight:400;color:var(--muted);margin-top:2px}
.ww-bd .k.new{box-shadow:var(--sh-2)}
.ww-bd .k.new .lx-pill{float:right;background:var(--ink);color:#fff}
.ww-bd .k.old{color:var(--muted);box-shadow:inset 0 0 0 1px var(--line);background:rgba(255,255,255,.6)}
.ww-end{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:8px;padding-top:16px;border-top:1px solid var(--line)}
.ww-end p{flex:1 1 260px;font-size:13px;color:var(--muted)}
@media (max-width:1040px){.ww-q{grid-template-columns:1fr;gap:14px}.ww-fl{grid-template-columns:1fr}.ww-bars{height:170px}
  .ww-row{grid-template-columns:minmax(0,1fr) auto;gap:8px 14px}.ww-row .mid{grid-column:1/-1}.ww-row .ww-thumbs{grid-column:1/-1}.ww-row .side{display:none}
  .ww-pg{grid-template-columns:44px minmax(0,1fr) auto auto;padding-left:20px;padding-right:20px}.ww-pg .hm{display:none}}
@media (max-width:759px){.ww-cd>.lx-sec{flex-wrap:wrap;row-gap:4px}.ww-cd>.lx-sec h3{flex:1 1 100%}.ww-cd>.lx-sec .act{margin-left:0}
  .ww-grid{grid-template-columns:1fr;gap:16px}.ww-grid .ww-art{--ar:16/10}.ww-grid.two{grid-template-columns:1fr 1fr;gap:12px}.ww-grid.two .ww-art{--ar:4/5}
  .ww-l{grid-template-columns:1fr}.ww-l .side{justify-items:start}.ww-cmp{grid-template-columns:1fr 1fr;gap:12px}
  .ww-pg{grid-template-columns:minmax(0,1fr) auto auto;gap:12px;padding-left:16px;padding-right:16px}.ww-pg .ww-mini,.ww-pg .go{display:none}
  .ww-gs{grid-template-columns:1fr}.ww-bar .sp{display:none}}
`;
export const css = () => addStyles('ww-css', CSS);

/* ---------- small parts ---------- */
const PLAY = () => s('svg', { viewBox: '0 0 34 34', 'aria-hidden': 'true' }, s('circle', { cx: 17, cy: 17, r: 15, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }), s('path', { d: 'M14 11.5L23 17L14 22.5Z', fill: 'currentColor' }));
const PIC = () => s('svg', { viewBox: '0 0 34 34', 'aria-hidden': 'true' }, s('rect', { x: 5, y: 8, width: 24, height: 18, rx: 3, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }), s('path', { d: 'M8 23L14 17L18 21L22 16L26 21', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));

/** The ad's picture. a: { thumb, kind: 'video' | 'image', tone, cap, len, over }. o: { ratio, kind (chip text), pc (a figure on the tile) }.
    A real cover is drawn when the data has one; a failed picture falls back to the plain tile. */
export function art(a = {}, o = {}) {
  const el = h('span', { class: 'ww-art' + (a.tone ? '' : ' plain'), style: { '--tone': a.tone || null, '--ar': o.ratio || null }, role: 'img', 'aria-label': (a.kind === 'video' ? 'Video: ' : 'Picture: ') + (a.name || 'ad') });
  el.append(a.kind === 'video' ? PLAY() : PIC());
  if (a.thumb) {
    const img = h('img', { src: a.thumb, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => img.remove(), { once: true });
    el.append(img);
  }
  if (o.kind) el.append(h('span', { class: 'kind' }, o.kind));
  else if (a.cap) el.append(h('span', { class: 'cap' }, a.cap));
  if (a.len) el.append(h('span', { class: 'len' }, a.len));
  if (a.over) el.append(h('span', { class: 'over' }, a.over));
  if (o.pc) el.append(h('span', { class: 'pc' }, o.pc));
  return el;
}
/** A short row of small pictures, each with a word or figure under it. */
export function thumbs(list = [], label = a => a.name) {
  return h('div', { class: 'ww-thumbs' }, list.slice(0, 4).map(a => h('div', null, art(a), label(a) != null && h('small', null, label(a)))));
}
/** The two small notes. */
export const tagsNote = (what = 'Format, hook and words tags') => h('span', { class: 'lx-chip ww-note', title: what + ' are read by ' + AI_NAME + ' and are being checked by a person before they come back.' }, 'Tags are being re-checked');
export const exampleChip = kitExampleChip; /* one version, in the kit */
export const isExample = (d, ctx) => !ctx.sample && d && d.example;
/** A measure against its goal: an ink bar with the goal tick, grey when it is too early to say. */
export const meter = (value, goal, { max, dim } = {}) => { const g = gauge({ value: value || 0, goal, max: max || Math.max(value || 0, goal || 0) * 1.25 || 1, thin: true }); if (dim) g.style.opacity = '.45'; return g; };
export const foot = (...words) => h('p', { class: 'lx-foot' }, words.filter(Boolean).join(' '));

/* ---------- plain states ---------- */
export function notConnected(ctx, what = 'Meta ads') {
  return empty({ title: what + ' are not connected for this brand', text: 'Once the ad account is connected, every ad with spend shows here.',
    action: ctx.isClient ? null : button('Open integrations', { href: ctx.href('brand-settings', 'integrations') }) });
}
export const noAds = ctx => empty({ title: 'No ads spent on these dates', text: 'Pick a longer range at the top right.' });
/** One guard for every tab that reads the Meta ads. Returns a node to show, or null to carry on. */
export function gate(d, ctx) {
  if (!ctx.brand) return empty({ title: 'Pick a brand', text: 'This page is about one brand at a time.' });
  if (!d) return empty({ title: 'Nothing to show yet' });
  if (d.state === 'off') return notConnected(ctx);
  if (d.state === 'error') return empty({ title: 'The ads did not load', text: d.error || 'Try again in a minute.' });
  return null;
}

/* ---------- the live readers ---------- */
const brandQ = ctx => 'act=' + encodeURIComponent(ctx.brand.id);
const kindOf = t => (t === 'video' ? 'video' : 'image');
/** role from Triple Whale first click against last click sales: 1.3 times either way, nothing under one goal cost per sale. */
export function roleOf(a, goalCpa) {
  if (a.fc == null || a.lc == null) return null;
  if (a.fc + a.lc < (goalCpa || 1)) return 'thin';
  if (a.fc >= a.lc * 1.3) return 'opener';
  if (a.lc >= a.fc * 1.3) return 'closer';
  return 'both';
}
/** Every Meta ad with spend on the dates, slimmed to what these pages draw.
    GET /api/hub/creative (profit worker) and, when covers are asked for, GET /api/ad-creatives (account-health) for the top 40 by spend. */
export async function loadAds(ctx, { covers = false } = {}) {
  if (!ctx.brand) return { state: 'none' };
  let j;
  try { j = await ctx.api(`/api/hub/creative?${brandQ(ctx)}&from=${ctx.range.from}&to=${ctx.range.to}&model=lastPlatformClick&cmp=none`, { signal: ctx.signal }); }
  catch (e) { if (e.status === 404) return { state: 'off' }; if (e.status === 401 || e.name === 'AbortError') throw e; return { state: 'error', error: e.message }; }
  const goals = j.goals || {};
  const goal_cpa = +goals.cpa || +goals.target_cpa || +ctx.brand.target_cpa || null, goal_roas = +goals.roas || +goals.target_roas || +ctx.brand.target_roas || null;
  const to = (j.window || {}).to || ctx.range.to;
  const liveFrom = new Date(Date.parse(to) - 2 * 864e5).toISOString().slice(0, 10);
  const ads = (j.ads || []).filter(r => r.obj !== 'leads').map(r => ({
    id: r.id, name: r.name, kind: kindOf(r.media_type), set: (r.adset || {}).name || null, campaign: r.campaign || null, key: r.asset_key || r.id,
    spend: r.spend, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, atc: r.atc, atc_rate: r.atc_rate, hook: r.hook, hold: r.hold, end: r.curve ? r.curve[4] : null,
    tw_orders: r.purchases, tw_sales: r.revenue, meta_orders: r.platform_purchases, fc: r.fc_rev, lc: r.lc_rev,
    roas: r.roas, cpa: r.cpa, angle: r.angle || null, person: (r.tags || {}).person || null,
    last_day: r.last_day, live: !!(r.last_day && r.last_day >= liveFrom), age: r.age,
  }));
  if (covers && ads.length) {
    /* the route takes 40 ids a call; the top 80 by spend cover nearly all of the money */
    const chunks = [ads.slice(0, 40), ads.slice(40, covers === 'more' ? 80 : 40)].filter(c => c.length);
    await Promise.all(chunks.map(async list => {
      try {
        const c = await ctx.api('/api/ad-creatives?ads=' + list.map(a => a.id).join(','), { worker: 'ah', signal: ctx.signal });
        for (const a of list) { const v = (c.assets || {})[a.id]; if (v) { a.thumb = v.thumb || v.image || v.thumbnail || null; a.body = v.body || null; a.headline = v.headline || null; a.link = v.link || null; a.cta = v.cta || null; } }
      } catch (e) { if (e.name === 'AbortError') throw e; }
    }));
    ads.covered = Math.min(ads.length, covers === 'more' ? 80 : 40);
  }
  /* a brand with no sales source would read 0 sales on every ad: say "no data", never a zero */
  const has_sales = ads.some(a => a.tw_orders > 0 || a.fc > 0 || a.lc > 0);
  return { state: 'ok', source: 'live', goal_cpa, goal_roas, has_sales, to, ads, covered: ads.covered || 0 };
}
/** The sample ads every creative tab shares (Northlake Golf), so the numbers agree from page to page. */
export const sampleAds = () => fixture('creative-review/_sample/index.json');
/** "/pages/black-friday" from a full link; "/" for the home page; null when Meta has no link. */
export function pageOf(link) {
  if (!link) return null;
  try { const u = new URL(link); return (u.pathname.replace(/\/+$/, '') || '/'); } catch { return null; }
}
/** The brand's own research: angles, tests and the brands it watches. GET /api/brand?act= (profit worker). */
export async function loadBrand(ctx) {
  try { return await ctx.api('/api/brand?' + brandQ(ctx), { signal: ctx.signal }); }
  catch (e) { if (e.status === 401 || e.name === 'AbortError') throw e; return null; }
}
/** Sum a list of ads into one group line. */
export function roll(list) {
  const t = { ads: list.length, spend: 0, sales: 0, orders: 0, impr: 0, clicks: 0 };
  for (const a of list) { t.spend += a.spend || 0; t.sales += a.tw_sales || 0; t.orders += a.tw_orders || 0; t.impr += a.impressions || 0; t.clicks += a.clicks || 0; }
  return { ...t, roas: t.spend ? t.sales / t.spend : null, cpa: t.orders ? t.spend / t.orders : null, ctr: t.impr ? t.clicks / t.impr : null };
}

/* ---------- "From a finding to new ads" ----------
   f: { say: text | nodes, platform, measure, proof: [{ value, text, name, sub, ...art }], normal: { value, text, name, sub },
        brief: { title, make, why, hook, format, count, due, by: { name, role } }, board: [names already on the To make column] }
   Read only for now: the last step hands over to old Locus. */
export function openFinding(ctx, f = {}) {
  css();
  const b = f.brief || {};
  /* the words may be nodes already on the page: draw copies, never move them out of their card */
  const say = f.say == null ? null : [].concat(f.say).flat(Infinity).map(n => (n && n.nodeType ? n.cloneNode(true) : n));
  const due = b.due || new Date(Date.now() + 7 * 864e5).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const bars = [...(f.proof || []).slice(0, 3), f.normal && { ...f.normal, n: true }].filter(Boolean);
  const top = Math.max(...bars.map(q => q.value || 0), 0.0001);
  const row = (k, v) => (v == null || v === '' ? null : h('div', null, h('dt', null, k), h('dd', null, v)));
  const old = legacyUrl('production', ctx.brand && ctx.brand.id);
  const body = h('div', null,
    h('div', { class: 'ww-fl' },
      h('div', null,
        h('div', { class: 'stp' }, h('i', null, '1'), AI_NAME + ' found this'),
        h('p', { class: 'lead' }, say || 'A pattern across these ads.'),
        h('div', { class: 'ww-bar' }, platformChip(f.platform || 'meta'), f.measure && h('span', { class: 'note' }, f.measure)),
        bars.length ? h('div', { class: 'ww-fbar' }, barChart({ values: bars.map(q => q.value || 0), dim: bars.map((q, i) => (q.n ? i : -1)), valueLabels: (v, i) => bars[i].text,
          format: v => (top < 1 ? pct(v) : money(v, { compact: true })), height: 260, phoneHeight: 220, axis: false, label: 'The proof against normal' }),
          h('div', { class: 'ww-fsub' }, bars.map(q => h('span', null, h('b', null, q.name), q.sub || '')))) : null),
      h('div', null,
        h('div', { class: 'stp' }, h('i', null, '2'), 'Turn it into a brief'),
        h('div', { class: 'ww-bf' },
          h('div', { class: 'by' }, 'Filled in by ' + AI_NAME),
          h('h3', null, b.title || 'A new version of what works'),
          h('dl', null, row('Make', b.make), row('Why', b.why), row('Hook', b.hook), row('Format', b.format), row('How many', b.count != null ? String(b.count) : '3'), row('Due', due),
            row('Made by', b.by ? h('span', { class: 'ww-bar' }, avatar(b.by, { size: 24 }), b.by.name + (b.by.role ? ', ' + b.by.role : '')) : 'Picked when the brief is made')))),
      h('div', null,
        h('div', { class: 'stp' }, h('i', null, '3'), 'It lands in Production'),
        h('div', { class: 'ww-bd' },
          h('span', { class: 'col' }, 'To make'),
          h('div', { class: 'k new' }, h('span', { class: 'lx-pill' }, 'New'), b.title || 'A new version of what works', h('small', null, `${b.count || 3} to make, due ${due}`), h('small', null, 'Proof attached: ' + ((f.proof || []).map(q => q.text).join(' and ') || 'the ads above'))),
          (f.board || []).slice(0, 3).map(n => h('div', { class: 'k old' }, n))))),
    h('div', { class: 'ww-end' },
      h('p', null, 'When the new ads go live, their result comes back to this finding. This view is read only for now: the brief itself is still made in old ' + APP_NAME + '.'),
      old ? button('Create the brief in old ' + APP_NAME, { primary: true, large: true, icon: 'arrow', href: old, target: '_blank' }) : null));
  return sheet({ title: 'From a finding to new ads', side: 'center', class: 'ww-flow', body });
}
/** The button that opens it. Team only: a client never briefs. */
export function findingButton(ctx, f, label = 'Make new ads from this', o = {}) {
  if (ctx.isClient) return null;
  return button(label, { ...o, onclick: e => { e.stopPropagation(); openFinding(ctx, typeof f === 'function' ? f() : f); } });
}
export { statusDot, money, num, x };
