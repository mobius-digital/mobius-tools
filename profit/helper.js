/* THE HELPER'S FACE (2026-10-11, session D, after the brand kit landed on the brand-kit branch: logo/kit.css,
 * logo/locus/direction-2-<state>.svg, "the bead"). Every <span class="lx-face" data-state="asleep|thinking|found|clear">
 * in the app (the ask bar, the nudge badge and stack, the morning strip) is filled with the kit's drawing for its
 * state, inline so it takes the box's colour (the SVGs draw in currentColor). The four files are fetched once from
 * ../logo/locus/ and kept in the page; while they load, or if they cannot be read, the plain dot the slot already
 * draws stays. A change of data-state swaps the drawing (one MutationObserver on the document).
 * States are separate drawings, not CSS (the kit's rule); only a thinking helper breathes. */
(() => {
  const STATES = ['asleep', 'thinking', 'found', 'clear'];
  const FILE = s => `../logo/locus/direction-2-${s}.svg`;
  const SVG = {};
  let loading = null;
  const load = () => loading || (loading = Promise.all(STATES.map(async s => {
    try { const r = await fetch(FILE(s), { cache: 'force-cache' }); if (!r.ok) throw new Error(String(r.status)); const t = await r.text(); if (/<svg[\s>]/i.test(t) && !/<script/i.test(t)) SVG[s] = t.replace(/<\?xml[^>]*>/, '').trim(); } catch {}
  })).then(() => SVG));
  function fill(el) {
    const s = STATES.includes(el.dataset.state) ? el.dataset.state : 'asleep';
    if (!SVG[s]) { if (el.dataset.face !== 'dot') { el.dataset.face = 'dot'; } return; }
    if (el.dataset.face === s) return;
    el.innerHTML = SVG[s]; el.dataset.face = s;
  }
  function all(root) { (root || document).querySelectorAll('.lx-face').forEach(fill); }
  function start() {
    if (window.__lxHelper) return; window.__lxHelper = 1;
    load().then(() => all());
    new MutationObserver(ms => {
      if (!Object.keys(SVG).length) return;
      for (const m of ms) {
        if (m.type === 'attributes') fill(m.target);
        else for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.classList && n.classList.contains('lx-face')) fill(n); else all(n); }
      }
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.LxHelper = { load, fill, all, STATES, FILE };
})();
