/* Shared parts for the agency's Production pages (Pipeline, Needs someone).
   Data: GET /api/production?act=all on the account-health worker (every brand's board, team only), with the team's
   photos from GET /api/production/photos. The same read the brand board makes, for every brand at once. */

import { h, addStyles } from '../../kit.js';
import { loadBoard } from '../production/board.js';
import { OPEN, todayOf, weekOf, daysFrom } from '../production/_ui.js';

export const loadAll = ctx => loadBoard(ctx, 'all');

/** The brand's color dot and name. */
export function brandName(ctx, actId, name) {
  const b = (ctx.brands || []).find(x => x.id === actId);
  return h('span', { class: 'ap-brand' }, h('i', { style: { background: (b && b.color) || 'var(--slate)' } }), name || (b && b.name) || 'Brand');
}
/** The address of a brand's own board. */
export function boardOf(ctx, actId) {
  const b = (ctx.brands || []).find(x => x.id === actId);
  return b ? '#/brand/' + encodeURIComponent(b.slug) + '/production/board' : null;
}
/** Days a card is past its date (0 when on time or no date). */
export const lateBy = (c, today) => (c.late && c.due ? Math.max(0, daysFrom(c.due, today) || 0) : 0);
export const isOpen = c => OPEN.includes(c.board);
export { todayOf, weekOf, daysFrom };

const CSS = `
.ap-brand{display:inline-flex;align-items:center;gap:8px;min-width:0;font-weight:600}
.ap-brand i{width:9px;height:9px;border-radius:3px;flex:none}
.ap-bar{display:flex;height:8px;border-radius:999px;overflow:hidden;background:var(--bg-sunk);min-width:80px}
.ap-bar span{display:block;height:100%}
.ap-bar span+span{box-shadow:inset 2px 0 0 var(--surface)}
.s-brief{background:var(--line-strong)}
.s-making{background:var(--slate)}
.s-review{background:var(--watch)}
.s-ready{background:var(--good)}
.s-live{background:var(--ink)}
.ap-key{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted)}
.ap-key span{display:inline-flex;align-items:center;gap:6px}
.ap-key i{width:10px;height:10px;border-radius:3px}
.ap-n{font-variant-numeric:tabular-nums}
.ap-n.zero{color:var(--faint)}
.ap-late{color:var(--bad);font-weight:600}
.ap-old{color:var(--muted);font-size:12px}
.ap-list .pd-line{padding-left:20px;padding-right:20px}
.ap-list .pd-line .t small .ap-brand{font-weight:500;color:var(--ink-2)}
.ap-list .pd-line .t small .ap-brand i{width:7px;height:7px}
.ap-people{display:grid}
.ap-pn{display:inline-flex;align-items:center;gap:10px;font-weight:600}
.ap-person{display:grid;grid-template-columns:minmax(0,190px) minmax(0,1fr) auto;gap:18px;align-items:center;padding:12px 20px;border-top:1px solid var(--line)}
.ap-person:first-child{border-top:0}
.ap-person .nm{display:flex;align-items:center;gap:10px;min-width:0;font-weight:600}
.ap-person .nm span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-person .nums{font-size:13px;color:var(--muted);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.ap-load{display:flex;gap:3px;flex-wrap:wrap;cursor:default}
.ap-load i{width:14px;height:14px;border-radius:4px;background:var(--line-strong)}
.ap-load i.late{background:var(--bad)}
.ap-load i.week{background:var(--ink-2)}
@media (max-width:1040px){.ap-key:not(.ap-legend){display:none}}
@media (max-width:759px){
  .ap-person{grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;padding:12px 16px}
  .ap-person .ap-load{grid-column:1/-1;order:3}
  .ap-list .pd-line{padding-left:16px;padding-right:16px}
}
`;
export const apCss = () => addStyles('ap-css', CSS);
