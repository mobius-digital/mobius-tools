/* Shared parts for Library: Photos, Footage, Reference ads. A grid of pictures, a filter row, a search box and a
   sheet for one item. Read only: syncing Drive, uploading and removing stay in old Locus. */

import { h, sheet, addStyles, field, button, segmented } from '../../kit.js';
export { pageTop, teamTag } from '../production/_ui.js';
import { picture } from '../production/_ui.js';

/** A filter row of chips: items [{ id, label, n }], the picked id, onPick. */
export function chips(items, pick, onPick, label) {
  return h('div', { class: 'lb-filt', 'aria-label': label || null }, label ? h('span', { class: 'lb-chl' }, label) : null,
    segmented(items.map(x => ({ id: x.id, label: x.n == null ? x.label : x.label + ' ' + x.n })), pick, onPick));
}

/** A search box that calls onInput with the words, lower case. */
export function search(placeholder, value, onInput) {
  const f = field({ type: 'search', placeholder, value: value || '', 'aria-label': placeholder });
  f.classList.add('pd-search');
  f.input.addEventListener('input', () => onInput(f.input.value.trim().toLowerCase()));
  return f;
}

/** One item, large, with its facts. facts = [[label, value], ...]; actions = nodes. */
export function openItem({ title, pic, facts = [], text, actions = [] }) {
  addStyles('lb-css', CSS);
  return sheet({ title, class: 'lb-sheet', body: h('div', { class: 'lb-one' },
    h('div', { class: 'lb-big' }, pic),
    text ? h('p', { class: 'lb-text' }, text) : null,
    facts.length ? h('dl', { class: 'lb-facts' }, facts.filter(f => f[1] != null && f[1] !== '').map(([k, v]) => [h('dt', null, k), h('dd', null, v)])) : null,
    actions.filter(Boolean).length ? h('div', { class: 'lb-acts' }, actions) : null) });
}

export { picture };

/** The Assets button in a Library page's tools row: opens the brand's own photo and video folder when the page
    knows the link (assets_link from withAssets), else the Assets page, where the link is pasted. */
export function assetsButton(ctx, link) {
  return link && link.url ? button('Assets', { iconLeft: 'folder', href: link.url, target: '_blank', aria: 'Open the photo and video folder' })
    : button('Assets', { iconLeft: 'folder', href: ctx.href('assets', 'index') });
}
/** A Library load with the brand's folder link beside it (account-health GET /api/brand/assets-link). The link never
    holds the page up: a refusal or an older worker leaves assets_link null. */
export async function withAssets(ctx, main) {
  const [d, a] = await Promise.all([main, ctx.api('/api/brand/assets-link?act=' + encodeURIComponent(ctx.brand.id), { worker: 'ah', signal: ctx.signal }).catch(() => null)]);
  return d && typeof d === 'object' && !Array.isArray(d) ? { ...d, assets_link: a && a.url ? a : null } : d;
}

const CSS = `
.lb-grid{display:grid;grid-template-columns:repeat(var(--cols,5),minmax(0,1fr));gap:18px}
.lb-tile{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;min-width:0;align-content:start;padding:0;border:0;background:none;text-align:left;font:inherit;color:inherit;cursor:pointer;text-decoration:none}
.lb-tile .pd-pic{border-radius:12px;box-shadow:0 0 0 1px var(--line);transition:box-shadow var(--t) var(--ease)}
.lb-tile:hover .pd-pic{box-shadow:0 0 0 1px var(--line-strong),var(--sh-2)}
.lb-tile b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:13.5px;font-weight:600;line-height:1.3;overflow:hidden}
.lb-tile small{display:block;font-size:12.5px;color:var(--muted)}
.lb-tags{display:flex;gap:4px;flex-wrap:wrap}
.lb-tags span{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:var(--r-chip,6px);background:var(--bg-sunk);color:var(--ink-2);font-size:11.5px;white-space:nowrap}
.lb-chl{align-self:center;font-size:12.5px;font-weight:600;color:var(--muted);min-width:56px}
.lb-filt{display:flex;align-items:center;gap:8px 10px;min-width:0;max-width:100%}
.lb-filt .lx-seg{max-width:100%;overflow-x:auto;scrollbar-width:none}
.lb-filt .lx-seg button{white-space:nowrap}
.lb-row{display:flex;gap:10px 24px;flex-wrap:wrap;align-items:center}
.lb-tile q{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12.5px;line-height:1.4;color:var(--ink-2);quotes:none}
.lb-grid.lb-wide{--cols:4}
.lb-tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.lb-quiet{color:var(--muted);font-size:13px}
.lb-sheet .lx-sheet-b{display:block}
.lb-one{display:grid;gap:18px;min-width:0}
.lb-big .pd-pic{border-radius:var(--r-tbl,12px);box-shadow:0 0 0 1px var(--line);max-height:62vh}
.lb-big .pd-pic>img{object-fit:contain;background:var(--bg-sunk)}
.lb-text{font-size:14px;line-height:1.5}
.lb-facts{display:grid;grid-template-columns:110px minmax(0,1fr);gap:8px 14px;margin:0}
.lb-facts dt{padding-top:1px;font-size:var(--fs-small,12.5px);color:var(--muted)}
.lb-facts dd{margin:0;font-size:13.5px;overflow-wrap:anywhere}
.lb-acts{display:flex;gap:10px;flex-wrap:wrap}
@media (max-width:1180px){.lb-grid{--cols:4!important}}
@media (max-width:900px){.lb-grid{--cols:3!important}}
@media (max-width:759px){.lb-filt{flex-wrap:wrap}.lb-chl{flex:1 1 100%}.lb-grid{--cols:2!important;gap:14px}.lb-facts{grid-template-columns:minmax(0,1fr);gap:2px}.lb-facts dd{margin-bottom:8px}}
`;
export const lbCss = () => addStyles('lb-css', CSS);
