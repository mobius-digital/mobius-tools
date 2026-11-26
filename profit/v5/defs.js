/* What a number means, shown on hover or tap. The list comes from the new engine
   (GET /v1/metrics/definitions, written once in engine/worker/src/numbers/catalog.js) and is read once.
     definitions()            the whole list
     definitionFor('sales')   one number, by its id or by the key the old answers carry it under
     defined(node, 'sales')   marks a node: hover, focus or tap shows the name, the meaning, the sum and the source
   Used on Agency > Engine only for now. When the list cannot be read the node is left as it was. */

import { h, addStyles } from './kit.js';
import { SAMPLE } from './config.js';
import { engineApi } from './engine.js';

const CSS = `
.lx-def{text-decoration:underline dotted var(--icon);text-underline-offset:3px;cursor:help}
.lx-defpop{position:absolute;z-index:60;max-width:min(340px,calc(100vw - 24px));padding:12px 14px;border-radius:12px;background:var(--ink);color:#fff;
  font-size:12.5px;line-height:1.45;box-shadow:0 8px 24px rgba(28,20,10,.22);display:grid;gap:6px}
.lx-defpop b{font-size:13px;font-weight:600}
.lx-defpop span{color:rgba(255,255,255,.72)}
.lx-defpop code{font:inherit;color:#fff}`;

let LIST = null;
/** Every definition: [{ id, name, definition, formula, source, unit, returns, old_keys }]. [] when it cannot be read. */
export function definitions() {
  if (SAMPLE) return Promise.resolve([]);
  LIST ||= engineApi('/v1/metrics/definitions').then(j => (j && j.definitions) || [], () => { LIST = null; return []; });
  return LIST;
}

/** One definition by id ('revenue') or by an old answer key ('sales'). null when there is none. */
export async function definitionFor(key) {
  const k = String(key || '').toLowerCase();
  const all = await definitions();
  return all.find(d => d.id === k) || all.find(d => (d.old_keys || []).includes(k)) || null;
}

let pop = null;
function hide() { if (pop) { pop.remove(); pop = null; } }
function show(node, d) {
  hide();
  addStyles('lx-def-css', CSS);
  pop = h('div', { class: 'lx-defpop', role: 'tooltip' },
    h('b', null, d.name), h('div', null, d.definition),
    d.formula ? h('span', null, 'How it is worked out: ', h('code', null, d.formula)) : null,
    d.source ? h('span', null, 'From: ' + d.source) : null);
  document.body.append(pop);
  const r = node.getBoundingClientRect();
  const left = Math.max(12, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 12));
  pop.style.left = left + 'px';
  pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
}

/** defined(node, 'sales') : the node shows its definition on hover, focus and tap. Returns the node at once;
    it is marked only when a definition exists. */
export function defined(node, key) {
  definitionFor(key).then(d => {
    if (!d) return;
    addStyles('lx-def-css', CSS);
    node.classList.add('lx-def');
    node.tabIndex = 0;
    node.setAttribute('aria-label', `${d.name}: ${d.definition}`);
    node.addEventListener('mouseenter', () => show(node, d));
    node.addEventListener('focus', () => show(node, d));
    node.addEventListener('mouseleave', hide);
    node.addEventListener('blur', hide);
    node.addEventListener('click', e => { e.stopPropagation(); show(node, d); });   // a tap. A tap anywhere else closes it
  });
  return node;
}
document.addEventListener('click', hide);
window.addEventListener('hashchange', hide);
