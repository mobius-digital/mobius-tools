/* THE HELPER'S FACE (2026-10-11, session D). Every <span class="lx-face" data-state="asleep|thinking|found|clear"> in
 * the app (the ask bar, the nudge badge and stack, the morning strip) shows the helper for its state. Since the rendered
 * character landed on main (logo/locus/character/<state>.png, transparent 200px cut-outs, the glossy blue bead with an
 * orbit ring, the same style as Cashew's character) the slot holds that PNG as an <img>, object-fit contain; the vector
 * bead (logo/locus/direction-2.svg, logo/locus/icons/) stays the logo, the favicon and the manifest icon. The plain dot
 * the slot draws by itself stays until the image has loaded, and if it never does. A change of data-state swaps the
 * image (one MutationObserver on the document). States are separate drawings, not CSS; only a thinking helper breathes. */
(() => {
  const STATES = ['asleep', 'thinking', 'found', 'clear'];
  const FILE = s => `../logo/locus/character/${s}.png`;
  const READY = {};
  const preload = () => STATES.forEach(s => { const i = new Image(); i.onload = () => { READY[s] = 1; all(); }; i.src = FILE(s); });
  function fill(el) {
    const s = STATES.includes(el.dataset.state) ? el.dataset.state : 'asleep';
    if (!READY[s]) { if (el.dataset.face !== 'dot') el.dataset.face = 'dot'; return; }
    if (el.dataset.face === s) return;
    let img = el.querySelector('img');
    if (!img) { el.innerHTML = ''; img = document.createElement('img'); img.alt = ''; img.draggable = false; img.decoding = 'async'; el.appendChild(img); }
    img.src = FILE(s); el.dataset.face = s;
  }
  function all(root) { (root || document).querySelectorAll('.lx-face').forEach(fill); }
  function start() {
    if (window.__lxHelper) return; window.__lxHelper = 1;
    preload(); all();
    new MutationObserver(ms => {
      for (const m of ms) {
        if (m.type === 'attributes') fill(m.target);
        else for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.classList && n.classList.contains('lx-face')) fill(n); else all(n); }
      }
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.LxHelper = { fill, all, STATES, FILE };
})();
