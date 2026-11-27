/* The agency and admin pages' shared look (2026-11-26 deep audit). One place for:
   countTiles(list, { cols })  the batch 1 tile cards (kit tiles() + kpi()) for the count figures at the top of a page.
                               Each item: { label, value, unit, sub, delta, window, source, href, spark, sparkLabels,
                               sparkFormat, onclick, on, title }.
                               A tile with onclick is a button (Shared links filters by it); on = the picked one.
   look()                      the page CSS below: list heads in sentence case (the shared calendar list still draws
                               them in caps), links that underline on hover only, and the picked tile.
   adm(...kids)                the page wrapper that carries the class the CSS is scoped to.
   datePick(value, opts)       one date picked on the Locus calendar (never the native date input): a field-styled button
                               that opens one month under it. The node works like an input: .value (YYYY-MM-DD or ''),
                               a 'change' event on a pick, .btn is the button (give it the label's id). opts: { optional,
                               min, max, empty }. optional adds "Clear the date". Closes on a pick, Escape, a press
                               outside or focus leaving it.
   Pages under a-clients, a-team, a-to-send, a-shared-links, a-status, a-engine, ask, get-started, a-settings and
   brand-settings import it. Nothing here reads or writes data. */

import { h, kpi, tiles, addStyles, put, calendar, button } from '../../kit.js';

const CSS = `
.adm{display:grid;gap:var(--gap-5,24px);min-width:0}
.adm>*{margin-top:0;margin-bottom:0}
.adm .cr-head .cr-what,.adm .cr-head .cr-cell{text-transform:none;letter-spacing:0;font-size:var(--fs-colhead,11.5px)}
.adm a.adm-link{color:var(--ink);text-decoration:none}
.adm a.adm-link:hover{text-decoration:underline}
.adm .lx-tiles>.lx-kpi.adm-pick{cursor:pointer;text-align:left;font:inherit;border:0}
.adm .lx-tiles>.lx-kpi.adm-pick:hover{box-shadow:var(--sh-2)}
.adm .lx-tiles>.lx-kpi.adm-pick.on{box-shadow:inset 3px 0 0 var(--brand),var(--sh-1)}
.adm .lx-tiles>.lx-kpi .adm-hint{font-size:var(--fs-small,12.5px);color:var(--muted);margin-top:auto}
.adm-head{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;min-width:0}
.adm-head>.adm-sp{flex:1}
.adm-head h3{margin:0;font-size:var(--fs-section,17px);font-weight:600;letter-spacing:-.01em;line-height:var(--lh-head,1.25)}
.adm-head .note{font-size:var(--fs-small,12.5px);color:var(--muted)}
.adm-datef{position:relative;min-width:0}
.adm-date{display:flex;align-items:center;width:100%;text-align:left;cursor:pointer;font:inherit;color:var(--ink)}
.adm-date.none{color:var(--muted)}
.adm-cal{position:absolute;z-index:30;top:100%;left:0;margin-top:6px;padding:12px;display:grid;gap:8px;border-radius:var(--r-tbl,12px);background:var(--surface,#fff);box-shadow:var(--sh-2)}
.adm-cal[hidden]{display:none}
.adm-cal>.lx-btn{justify-self:start}
@media (max-width:759px){.adm{gap:var(--gap-4,16px)}}`;

export function look() { addStyles('adm-look-css', CSS); }

export function adm(...kids) { look(); return h('div', { class: 'adm' }, ...kids); }

/** A section heading in the batch 1 style: title, quiet note, then anything on the right (a stamp, a button). */
export function sectionHead(title, note, ...right) {
  return h('div', { class: 'adm-head' }, h('h3', null, title), note ? h('span', { class: 'note' }, note) : null, h('span', { class: 'adm-sp' }), ...right);
}

export function countTiles(list, { cols } = {}) {
  look();
  const items = list.filter(Boolean);
  const nodes = items.map(k => {
    const node = kpi({ label: k.label, value: k.value, unit: k.unit, sub: k.sub, delta: k.delta, window: k.window, source: k.source, href: k.href, spark: k.spark, sparkLabels: k.sparkLabels, sparkFormat: k.sparkFormat });
    if (k.onclick) {
      node.classList.add('adm-pick');
      if (k.on) node.classList.add('on');
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
      node.setAttribute('aria-pressed', String(!!k.on));
      if (k.title) node.title = k.title;
      node.addEventListener('click', k.onclick);
      node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); k.onclick(e); } });
    }
    return node;
  });
  return tiles(nodes, { cols: cols || (items.length >= 4 ? 4 : items.length === 2 ? 2 : 3) });
}

const fmtDay = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export function datePick(value, { optional = false, min = null, max = null, empty } = {}) {
  look();
  let v = value || '';
  const blank = empty || (optional ? 'No date' : 'Pick a date');
  const shown = h('span', null, v ? fmtDay(v) : blank);
  const pop = h('div', { class: 'adm-cal', hidden: true, role: 'dialog', 'aria-label': 'Pick a date' });
  const btn = h('button', { type: 'button', class: 'lx-input adm-date' + (v ? '' : ' none'), 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, shown);
  const wrap = h('div', { class: 'adm-datef' }, btn, pop);
  const paint = () => { shown.textContent = v ? fmtDay(v) : blank; btn.classList.toggle('none', !v); };
  const outside = e => { if (!wrap.contains(e.target)) close(false); };
  function close(focus) {
    if (pop.hidden) return;
    pop.hidden = true; btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    if (focus) btn.focus();
  }
  const pick = nv => { v = nv || ''; paint(); close(true); wrap.dispatchEvent(new Event('change')); };
  function open() {
    put(pop, calendar({ from: v || null, to: v || null, min, max, months: 1, onChange: ({ from }) => { if (from) pick(from); } }),
      optional && v ? button('Clear the date', { ghost: true, onclick: () => pick('') }) : null);
    pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
  }
  btn.addEventListener('click', () => (pop.hidden ? open() : close(false)));
  wrap.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { e.stopPropagation(); close(true); } });
  wrap.addEventListener('focusout', e => { if (e.relatedTarget && !wrap.contains(e.relatedTarget)) close(false); });
  Object.defineProperty(wrap, 'value', { get: () => v, set: nv => { v = nv || ''; paint(); } });
  wrap.btn = btn;
  return wrap;
}
