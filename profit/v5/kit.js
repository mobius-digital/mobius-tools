/* The kit: small pure functions that return DOM or SVG nodes. No state, no network.
   Charts are inline SVG drawn at the real width of their box (see lineChart), so pages never draw their own.
   Ember (the gradient) is for the lead series only; everything else is slate or ink.

   Tooltips (2026-11-26): every sparkline, lineChart and barChart shows a small dark bubble on hover AND on
   tap, with the x label and each series value in the chart's own format, a thin crosshair (a soft band on
   column charts) and a dot on each line. A lineChart / barChart also takes keyboard focus (arrow keys,
   Home, End). On by default, nothing to pass. Options when the chart lacks words:
     sparkline(values, { labels: ['6am', ...], format: v => money(v), name: 'Sales' })
     lineChart({ ..., tipLabels: ['Thu 6am to 7am', ...], tipFormat: (v, series, i) => money(v) })
     barChart({ ..., name: 'Ad spend' })            the series name in the bubble
     tooltip: false                                  no bubble;  tooltip: i => nodes  your own lines
   The bubble itself is reusable: tipShow(owner, content, at), tipHide(owner), tipRow(swatch, name, value),
   placeFloat(el, at, gap). Definitions on hover/tap (dotted labels, (i) buttons, "What is this page?") are
   in defs.js. */

import { GLYPH, PLATFORM_NAME, icon } from './icons.js';
import { AI_NAME } from './config.js';

/* ---------- dom helpers ---------- */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** h('div', { class: 'x', onclick: fn, style: { width: '4px' }, dataset: { id: 1 } }, child, 'text', [more]) */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  setAttrs(el, attrs);
  add(el, kids);
  return el;
}
/** The same for SVG elements. */
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  setAttrs(el, attrs);
  add(el, kids);
  return el;
}
function setAttrs(el, attrs) {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') for (const [p, x] of Object.entries(v)) p.startsWith('--') ? el.style.setProperty(p, x) : (el.style[p] = x);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
}
function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}
/** An SVG string (from icons.js) as a node. */
export function svgNode(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstChild;
}
/** addStyles('hm-css', CSS) : a page's own layout rules, added to the document once. */
const SHEETS = new Map();   // id -> [{ text, el }]
export function addStyles(id, text) {
  const list = SHEETS.get(id) || SHEETS.set(id, []).get(id);
  let hit = list.find(k => k.text === text);
  if (!hit) {
    const el = document.createElement('style'); el.id = list.length ? id + '-' + (list.length + 1) : id; el.textContent = text; document.head.append(el);
    list.push(hit = { text, el });
  }
  /* two pages that picked the same id (and the same class names) used to leave the second one with the
     first one's layout. Each keeps its own sheet now, and only the caller's sheet is switched on. */
  if (list.length > 1) for (const k of list) k.el.disabled = k !== hit;
}
/** Text from a worker or a person, with any long dash turned into a comma. The dashes are written as escapes on purpose. */
export const noDash = t => String(t == null ? '' : t).replace(/\s*[\u2014\u2013]\s*/g, ', ');
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- numbers ---------- */
const NONE = 'no data';
const ok = n => n != null && isFinite(n);
/** money(44721) "$44,721"   money(12.5) "$12.50"   money(44721, { compact: true }) "$44.7k"   money(null) "no data" */
export function money(n, { cur = 'USD', compact = false, cents } = {}) {
  if (!ok(n)) return NONE;
  if (compact && Math.abs(n) >= 1000) {
    const sym = money(0, { cur, cents: false }).replace(/[\d.,\s]/g, '');
    const k = Math.abs(n) >= 1e6 ? [n / 1e6, 'M'] : [n / 1e3, 'k'];
    return (n < 0 ? '-' : '') + sym + Math.abs(k[0]).toFixed(Math.abs(k[0]) >= 100 ? 0 : 1).replace(/\.0$/, '') + k[1];
  }
  const digits = cents ?? (Math.abs(n) < 1000 && n % 1 !== 0) ? 2 : 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}
/** num(231) "231"   num(12840) "12,840"   num(1.234, 1) "1.2" */
export function num(n, digits = 0) {
  return ok(n) ? new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n) : NONE;
}
/** pct(0.094) "9%"   pct(0.094, { digits: 1 }) "9.4%"   pct(-0.2, { signed: true }) "-20%"   takes a fraction */
export function pct(n, { digits = 0, signed = false } = {}) {
  if (!ok(n)) return NONE;
  const v = +(n * 100).toFixed(digits);
  return (signed && v > 0 ? '+' : '') + (v === 0 ? '0' : v.toFixed(digits)) + '%';
}
/** x(1.754) "1.75x". ROAS for one platform, campaign or ad; MER for the whole store. */
export function x(n, digits = 2) { return ok(n) ? n.toFixed(digits) + 'x' : NONE; }
/** relativeTime(Date.now() - 240000) "4 min ago" */
export function relativeTime(ts, now = Date.now()) {
  if (!ts) return '';
  const sec = Math.max(0, Math.round((now - +new Date(ts)) / 1000));
  if (sec < 45) return 'just now';
  if (sec < 3600) return Math.max(1, Math.round(sec / 60)) + ' min ago';
  if (sec < 86400) { const hr = Math.round(sec / 3600); return hr + (hr === 1 ? ' hour ago' : ' hours ago'); }
  const d = Math.round(sec / 86400);
  return d === 1 ? 'yesterday' : d + ' days ago';
}

/* ---------- small parts ---------- */
/** statusDot('good' | 'warn' | 'bad' | 'info' | 'off', 'Ready') : a dot and a word */
export function statusDot(tone, text) { return h('span', { class: 'lx-stat ' + (tone || '') }, text); }
/** pill('good' | 'warn' | 'bad' | 'ai' | '', '0.75x under goal') */
export function pill(tone, text) { return h('span', { class: 'lx-pill ' + (tone || '') }, text); }
/** count(3) a small round count; count(3, 'ink') on ink */
export function count(n, tone) { return h('span', { class: 'lx-count ' + (tone || '') }, String(n)); }
/** delta(0.09) "▲ 9%" green; delta(0.68, { bad: true }) red; delta(-0.1, { plain: true }) no judgment */
export function delta(n, { bad = false, plain = false, text } = {}) {
  if (!ok(n)) return h('span', { class: 'lx-delta' }, NONE);
  const dir = n >= 0 ? 'up' : 'down';
  return h('span', { class: 'lx-delta ' + dir + (plain ? ' plain' : bad ? ' is-bad' : ' is-good') }, text || pct(Math.abs(n)));
}
/** button('Review all 6', { primary, large, ghost, icon: 'arrow', iconLeft: 'month', href, onclick, aria, title })
    An icon-only button (no label) MUST pass aria: the same words become its hover tooltip (title), so no icon is
    ever unexplained. title sets the tooltip for a labeled button. */
export function button(label, o = {}) {
  const tip = o.title || ((label == null || label === '') && o.aria ? o.aria : null);
  const cls = 'lx-btn' + (o.primary ? ' primary' : '') + (o.large ? ' lg' : '') + (o.ghost ? ' ghost' : '') + (o.class ? ' ' + o.class : '');
  const kids = [o.iconLeft && svgNode(icon(o.iconLeft)), label, o.icon && svgNode(icon(o.icon))];
  /* A link that opens a new tab never hands the new page a handle on this one (some hrefs are typed by clients). */
  return o.href ? h('a', { class: cls, href: o.href, target: o.target, rel: o.target === '_blank' ? 'noopener noreferrer' : null, 'aria-label': o.aria, title: tip }, kids)
    : h('button', { class: cls, type: 'button', onclick: o.onclick, disabled: o.disabled, 'aria-label': o.aria, title: tip }, kids);
}
/** platformChip('meta') glyph and name in ink; { chip: true } on a pill; { dot: '#2F6FED' } a 6px dot; { label } own text */
export function platformChip(id, { chip = false, dot, label } = {}) {
  const el = h('span', { class: 'lx-plat' + (chip ? ' chip' : '') });
  if (GLYPH[id]) el.append(svgNode(icon(id)));
  el.append(label || PLATFORM_NAME[id] || id);
  if (dot) el.append(h('i', { style: { '--dot': dot } }));
  return el;
}
/** The picture address a person carries, at the larger size when the address lets us ask.
    The API gives a Slack picture (image_192, image_72, or an address ending _72.jpg) or a Google one (=s96-c). */
export function photoOf(person = {}, size = 34) {
  const p = person.profile || {};
  let url = person.photo || person.picture || person.image_192 || p.image_192 || person.avatar_url || person.image_72 || p.image_72 || person.image || '';
  if (!url || typeof url !== 'string') return '';
  const want = size * 2 > 96 ? 192 : 96;                                  // twice the drawn size, for sharp screens
  url = url.replace(/_(24|32|48|72)(\.(?:jpg|jpeg|png|gif))(\?.*)?$/i, '_192$2$3');   // Slack: always ask for the 192
  url = url.replace(/=s\d+(-c)?$/, '=s' + want + '-c');                     // Google: the size is in the address
  return url;
}
/** The two letters shown when there is no picture: "Sam Rivera" is SR, "Northlake Golf" is NG, "sam@..." is S. */
export function initials(person = {}) {
  const name = String(person.name || (person.email || '').split('@')[0] || '?').trim();
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
/** avatar({ name, email, photo }, { size }) : the person's photo when the data carries one, initials on ink otherwise.
    A picture that fails to load falls back to the initials. size in px. */
export function avatar(person = {}, { size = 34 } = {}) {
  const name = person.name || (person.email || '').split('@')[0] || '?';
  const el = h('span', { class: 'lx-avatar', role: 'img', 'aria-label': name, style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.38) + 'px' } });
  const url = photoOf(person, size), letters = initials(person);
  if (url) {
    const img = h('img', { src: url, alt: '', width: size, height: size, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => { el.textContent = letters; }, { once: true });
    el.append(img);
  } else el.textContent = letters;
  return el;
}
/** dateBlock('2026-11-26') a soft block "THU 26"; { now: true } on ink; { month: true } shows "DEC 5" */
export function dateBlock(date, { now = false, month = false } = {}) {
  const d = typeof date === 'string' ? new Date(date + (date.length === 10 ? 'T12:00:00' : '')) : new Date(date);
  const top = month ? d.toLocaleDateString('en-US', { month: 'short' }) : d.toLocaleDateString('en-US', { weekday: 'short' });
  return h('span', { class: 'lx-date' + (now ? ' now' : '') }, h('span', null, h('small', null, top), h('b', null, d.getDate())));
}
/** takeaway(['Sales are ', h('b', null, '$3,797 ahead'), ' of plan.'], { action: button('Ask why') })
    The one sentence from the assistant. One per page. */
export function takeaway(content, { action, by } = {}) {
  return h('div', { class: 'lx-take' },
    h('span', { class: 'lx-gem' }, svgNode(icon('sparkle'))),
    h('span', { class: 'by' }, by || AI_NAME),
    h('span', { class: 'say' }, content), action || null);
}
/** skeleton('line' | 'title' | 'kpi' | 'chart' | 'row', n) : placeholders for a first ever visit only */
export function skeleton(kind = 'line', n = 1) {
  const f = document.createDocumentFragment();
  for (let i = 0; i < n; i++) f.append(h('div', { class: 'lx-skel ' + kind, 'aria-hidden': 'true' }));
  return f;
}
/** put(el, ...kids) : replace an element's children, leaving out null and false (replaceChildren would print "null"). */
export function put(el, ...kids) { el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false).map(k => k.nodeType ? k : document.createTextNode(String(k)))); return el; }
/** exampleChip() : marks a part that shows sample numbers until its read-only data feed is built. One wording everywhere. */
export const EXAMPLE_TEXT = 'Example until its data feed is built';
export function exampleChip({ title = 'These are example numbers. The real ones show here when the data feed is built.' } = {}) { return h('span', { class: 'lx-chip lx-ex', title }, EXAMPLE_TEXT); }
/** big(value, small) : a large figure outside a kpi (inside a table cell, a card head or a sheet). */
export function big(value, small) { return h('span', { class: 'lx-big' }, value, small && h('small', null, small)); }
/** card({ title, note, action, flush }, ...children) : a white card with a quiet section header */
export function card({ title, note, action, flush = false, class: cls } = {}, ...kids) {
  return h('section', { class: 'lx-card' + (flush ? ' flush' : '') + (cls ? ' ' + cls : '') },
    title ? h('div', { class: 'lx-sec' }, h('h3', null, title), note && h('span', { class: 'note' }, note), action && h('div', { class: 'act' }, action)) : null, kids);
}
/** hero({ line, class }, ...children) : the one hero band on a page (the big figures).
    The page title is drawn by the shell above the tabs, so a hero normally has no title of its own.
    eyebrow, title, sub and action still work for a band that needs its own heading (a sheet, sign in). */
export function hero({ eyebrow, title, sub, action, line = false, class: cls } = {}, ...kids) {
  const head = eyebrow || title || sub || action
    ? h('div', { class: 'lx-hero-h' }, h('div', null, eyebrow && h('span', { class: 'lx-eyebrow' }, eyebrow), title && h('h2', { class: 'lx-hero-t' }, title), sub && h('p', null, sub)), h('span', { class: 'lx-sp' }), action || null)
    : null;
  return h('section', { class: 'lx-hero' + (line ? ' line' : '') + (cls ? ' ' + cls : '') }, head, kids);
}
/** em('this month?') : the serif, ember gradient phrase. Page titles only, once per page: title: ctx => ['How is it going ', em('this month?')] */
export function em(text) { return h('span', { class: 'lx-serif lx-grad-text' }, text); }

/* ---------- toast and sheet ---------- */
let toastBox;
/** toast('Saved') ; toast('Could not save', { tone: 'bad', ms: 5000 }) */
export function toast(text, { tone = '', ms = 2600 } = {}) {
  if (!toastBox) { toastBox = h('div', { class: 'lx-toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(toastBox); }
  const el = h('div', { class: 'lx-toast ' + tone }, text);
  toastBox.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, ms);
  return el;
}
/** sheet({ title, body, side, onClose, class }) : THE detail pattern, one for the whole app. Returns { el, close }.
    Desktop (760px and wider): a centered modal sheet, rounded, soft shadow, at most 720px wide, scrolling inside.
    Phone (under 760px): a sheet that rises from the bottom.
    side is kept for old callers and only picks the width on desktop:
      'center'           a small dialog (560px): confirms, short forms
      'right' | 'bottom' | nothing   a detail sheet (720px). There is no side panel any more.
    A page that needs a wider detail sheet gives its own class a width (.lx-sheet.my-wide{width:min(900px,100%)}).
    Escape closes the top sheet only, a click on the dimmed backdrop closes it, Tab stays inside it (focus trap),
    and focus goes back to what had it when the sheet closes. The page under it does not scroll while one is open (app.css: html:has(body > .lx-overlay)). */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
/** safeHref(url) : the url when it is a plain http(s) link, else null (a data-derived link never runs script). */
export const safeHref = u => { const s = String(u || '').trim(); return /^https?:\/\//i.test(s) ? s : null; };

export function sheet({ title, body, side = 'right', onClose, class: cls } = {}) {
  const size = side === 'center' ? 'center' : 'center wide';
  const panel = h('div', { class: 'lx-sheet ' + size + (side !== 'center' ? ' ' + side : '') + (cls ? ' ' + cls : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': String(title || '').trim() || 'Details', tabindex: '-1' },
    h('div', { class: 'grab', 'aria-hidden': 'true' }),
    title ? h('div', { class: 'lx-sheet-h' }, h('h2', null, title), h('button', { class: 'lx-btn ghost icon', type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => close() }, svgNode(icon('close')))) : null,
    h('div', { class: 'lx-sheet-b' }, body));
  const wrap = h('div', { class: 'lx-overlay', onmousedown: e => { if (e.target === wrap) close(); } }, panel);
  const back = document.activeElement;
  const top = () => { const all = document.querySelectorAll('body > .lx-overlay'); return all[all.length - 1] === wrap; };
  const key = e => {
    if (!top()) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...panel.querySelectorAll(FOCUSABLE)].filter(n => n.offsetParent !== null || n === document.activeElement);
    if (!f.length) { e.preventDefault(); panel.focus(); return; }
    const first = f[0], last = f[f.length - 1];
    if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  let shut = false;
  /* a link inside the sheet moves the page on: the sheet goes with it */
  const nav = () => close();
  function close() {
    if (shut) return; shut = true;
    document.removeEventListener('keydown', key); window.removeEventListener('hashchange', nav); wrap.remove();
    try { if (back && back.focus && document.contains(back)) back.focus({ preventScroll: true }); } catch {}
    onClose && onClose();
  }
  document.addEventListener('keydown', key);
  window.addEventListener('hashchange', nav);
  document.body.append(wrap);
  /* desktop: focus the first field when the sheet is a form, else the sheet itself (so Escape and Tab work at once).
     phone: the sheet itself, so the keyboard does not jump up over it */
  requestAnimationFrame(() => { if (shut) return; const f = window.matchMedia && window.matchMedia('(max-width:759px)').matches ? null : panel.querySelector('.lx-sheet-b input:not([type=hidden]):not([disabled]),.lx-sheet-b textarea,.lx-sheet-b select'); try { (f || panel).focus({ preventScroll: true }); } catch {} });
  return { el: panel, close };
}

/* ---------- form fields ---------- */
/** field({ label, hint, type, value, placeholder, icon, oninput }) : a labeled input. Returns the wrapper; .input is the input. */
export function field({ label, hint, icon: ic, id = 'f' + Math.random().toString(36).slice(2, 8), ...attrs } = {}) {
  const input = h('input', { class: 'lx-input' + (ic ? ' has-icon' : ''), id, type: 'text', ...attrs });
  const el = h('div', { class: 'lx-field' }, label && h('label', { for: id }, label), h('div', { class: 'lx-input-wrap' }, ic && svgNode(icon(ic)), input), hint && h('p', { class: 'hint' }, hint));
  el.input = input;
  return el;
}
/** toggle({ label, checked, onchange }) : a switch */
export function toggle({ label, checked = false, onchange, ariaLabel, disabled = false } = {}) {
  const input = h('input', { type: 'checkbox', role: 'switch', checked: checked || null, disabled: disabled || null, 'aria-label': ariaLabel || null, onchange: e => onchange && onchange(e.target.checked) });
  input.checked = !!checked;
  return h('label', { class: 'lx-toggle' }, input, h('span', { class: 'track' }), label && h('span', null, label));
}
/** segmented([{ id, label }], activeId, onPick) : the small two or three way switch */
export function segmented(items, active, onPick) {
  const el = h('div', { class: 'lx-seg', role: 'tablist' });
  items.forEach(it => el.append(h('button', { type: 'button', role: 'tab', class: it.id === active ? 'on' : '', 'aria-selected': it.id === active, onclick: () => {
    el.querySelectorAll('button').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-selected', 'false'); });
    const b = el.children[items.indexOf(it)]; b.classList.add('on'); b.setAttribute('aria-selected', 'true');
    onPick && onPick(it.id);
  } }, it.label)));
  return el;
}

/* ---------- tabs ---------- */
/** tabs([{ id, label, href, count, team }], activeId, onPick) : sub pages across the top of a page.
    team: true adds a small "Team only" tag (clients never see that tab). The old lock icon is gone: it read as
    "locked" and nobody knew why. lock: true is still accepted and means the same as team. */
export function tabs(items, active, onPick) {
  const el = h('nav', { class: 'lx-tabs', 'aria-label': 'Sections' });
  for (const it of items) {
    el.append(h('a', { href: it.href || '#', class: it.id === active ? 'on' : '', 'aria-current': it.id === active ? 'page' : null, dataset: { tab: it.id },
      onclick: onPick ? e => { e.preventDefault(); onPick(it.id); } : null },
      it.label, it.count != null && h('span', { class: 'n' }, it.count),
      (it.team || it.lock) && h('span', { class: 'lx-team-tag', title: 'Team only: clients do not see this tab' }, 'Team only')));
  }
  return el;
}

/* ---------- KPI ---------- */
/** fmtUnit(v, unit) : one number in its unit. unit: 'money' | 'x' (ROAS, MER) | 'pct' (a fraction) | 'num' | a function. */
export function fmtUnit(v, unit, { cur } = {}) {
  if (typeof unit === 'function') return unit(v);
  return unit === 'money' ? money(v, { cur }) : unit === 'x' ? x(v) : unit === 'pct' ? pct(v, { digits: Math.abs(v) < 0.1 ? 1 : 0 }) : num(v, ok(v) && Math.abs(v) < 10 && v % 1 ? 1 : 0);
}
/** sourceLine(window, source) : the quiet line under a number that says what it covers and where it comes from:
    sourceLine('Nov 1 to 25', 'Triple Whale') "Nov 1 to 25 · Triple Whale". window may be text or a range
    ({ dates } from ctx.range). Either part may be left out. Triple Whale is the source for sales, ROAS and MER;
    a Meta figure says "Meta's own count". */
export function sourceLine(win, source) {
  const w = win && typeof win === 'object' ? win.dates || win.label : win;
  const parts = [w, source].filter(t => t != null && String(t).trim() !== '');
  return parts.length ? h('span', { class: 'lx-srcline' }, parts.join(' · ')) : null;
}
/** staleStamp({ at, onRefresh, busy, label }) : "Updated 4 min ago" and a round refresh button, for any card whose
    numbers can go stale. at: when the numbers were read (ms or a date). onRefresh: what the button does (it
    spins until the promise it returns settles). No onRefresh = the words only. */
export function staleStamp({ at, onRefresh, busy = false, label = 'Updated' } = {}) {
  const words = h('span', { class: 'lx-stale-t', title: at ? new Date(at).toLocaleString() : null }, at ? label + ' ' + relativeTime(at) : busy ? 'Getting the numbers' : 'Not read yet');
  const el = h('span', { class: 'lx-stale' + (busy ? ' busy' : '') }, words);
  if (onRefresh) {
    const b = h('button', { type: 'button', class: 'lx-btn ghost icon lx-stale-b', 'aria-label': 'Refresh these numbers', title: 'Refresh these numbers', onclick: async () => {
      if (el.classList.contains('busy')) return;
      el.classList.add('busy');
      try { await onRefresh(); } finally { if (el.isConnected) el.classList.remove('busy'); }
    } }, svgNode(REFRESH_SVG));
    el.append(b);
  }
  return el;
}
const REFRESH_SVG = '<svg class="lx-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 12.5a8 8 0 0 0 13.7 5.2l2.3-2.2"/><path d="M20 20v-4.5h-4.5"/></svg>';

/** kpi({ label, value, unit, small, sub, delta, spark, window, source, size: 'lg', href, src })
    value: formatted text, or a number with unit ('money' | 'x' | 'pct' | 'num') and the kit formats it.
    small sits beside it ("$111 each"). sub is a node or text under it. delta is a node from delta() or statusDot().
    window + source draw the line under the number: "Nov 1 to 25 · Triple Whale" (see sourceLine).
    spark is an array of numbers: an orange line with a soft fill, the low and high marked, and a scale under it
    (first and last sparkLabels, "Low · High" in sparkFormat or the unit). lead: false draws it slate. */
export function kpi({ label, value, unit, cur, small, sub, delta: d, spark, sparkLabels, sparkFormat, lead = true, size, href, src, window: win, source } = {}) {
  const shown = typeof value === 'number' || value == null && unit ? fmtUnit(value, unit || 'num', { cur }) : value;
  const sf = sparkFormat || (unit ? v => fmtUnit(v, unit, { cur }) : undefined);
  const kids = [
    h('span', { class: 'l' }, label, src && h('span', { class: 'lx-src' }, src)),
    h('span', { class: 'v' }, shown, small && h('small', null, small)),
    (d || sub) && h('span', { class: 's' }, d || null, sub || null),
    (win || source) && sourceLine(win, source),
    spark && spark.length > 1 ? sparkline(spark, { lead, fill: true, labels: sparkLabels, format: sf, axis: true }) : null,
  ];
  const cls = 'lx-kpi' + (size === 'lg' ? ' lg' : '');
  return href ? h('a', { class: cls, href }, kids) : h('div', { class: cls }, kids);
}
/** kpis(...kpi nodes) : the open row of figures. { cols: 4 } fixes the column count. */
export function kpis(list, { cols } = {}) {
  const el = h('div', { class: 'lx-kpis', style: cols ? { '--cols': cols } : null }, list);
  /* tell the grid how wide its longest figure is (in ems of the figure's own size), so a tile is never
     narrower than its number: app.css turns these into the smallest tile width and reflows from it.
     --kpi-em is the widest big (lg) figure, --kpi-em-s the widest standard one: a row of big figures with
     one standard tile in it is not sized as if that tile were big too. */
  let big = 0, std = 0;
  for (const k of el.children) {
    const v = k.querySelector && k.querySelector('.v'); if (!v) continue;
    const em = figureEm([...v.childNodes].filter(n => n.nodeName !== 'SMALL').map(n => n.textContent).join(''));
    if (k.classList.contains('lg')) big = Math.max(big, em); else std = Math.max(std, em);
  }
  if (big) { el.style.setProperty('--kpi-em', big.toFixed(2)); if (std) el.style.setProperty('--kpi-em-s', std.toFixed(2)); }
  else if (std) el.style.setProperty('--kpi-em', std.toFixed(2));
  return el;
}
/** tiles([kpi nodes], { cols: 2 | 3 | 4 }) : the one tile grid for every page (Home, Meta, Reports, the agency
    pages). Each kpi becomes a card: label as a card title, the figure at --num-l (never the hero size), the change,
    the window and source line and the orange sparkline. 3 a row by default, 2 under 1100px. */
export function tiles(list, { cols = 3, class: cls } = {}) {
  return h('div', { class: 'lx-tiles' + (cols === 4 ? ' c4' : cols === 2 ? ' c2' : '') + (cls ? ' ' + cls : '') }, list);
}
/** figureEm('$63,429') : about how wide a figure draws, in ems of its font size, never less than it really is.
    Measured on the app font at the figure's letter spacing: a digit is .61, a comma .23, a percent sign .96. */
export function figureEm(text) {
  let w = 0;
  for (const c of String(text ?? '').trim()) {
    w += /[0-9$+]/.test(c) ? .615 : /[.,:;'!|\s]/.test(c) ? .24 : c === '%' ? .97 : /[MWmw]/.test(c) ? .95 : /[fijlrt()\/-]/.test(c) ? .42 : /[A-Z]/.test(c) ? .72 : .6;
  }
  return w;
}
/** handEm(['$1,284,500', '2.68x']) : for a row of big tiles written by hand (class lx-kpis, no kpis()). Gives the
    width of its longest number in ems when that is more than the 4.55 a hand written row is sized for, else null.
    Put it on the row as --kpi-hand. Only numbers are measured, words are left alone, so a row of normal amounts
    draws exactly as before. */
export function handEm(texts) {
  let w = 0;
  for (const t of texts) { const s = String(t ?? '').trim(); if (s && /^[-+$\d.,%xkKMB\s]+$/.test(s)) w = Math.max(w, figureEm(s)); }
  return w > 4.55 ? w.toFixed(2) : null;
}

/* ---------- charts ----------
   One chart for every page. A chart is a box that follows its container: the drawing is made at the
   box's real pixel width (viewBox = pixels), so type is a true size on a phone and on a wide screen.
   One shared ResizeObserver watches only the WIDTH of each box. The height is set from the width, and
   the width never depends on the height, so a redraw cannot trigger another one. Pass `width` to pin it. */
const path = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
const niceMax = v => { if (!(v > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 1.5 ? 1.5 : m <= 2 ? 2 : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10) * p; };
const textW = (t, px = 6.4) => String(t ?? '').length * px;

/** sparkline([3854, 2703, ...], { lead, fill, width, height, goal, labels, format, name, tooltip, marks, axis })
    A thin line in brand orange (lead: false for a slate comparison line). goal draws a dashed level line
    (MER against its goal) and joins the scale. marks (on with axis) puts a small dot on the lowest and the
    highest value. axis: true returns a box with the line and a quiet scale under it: the first label, "Low $X ·
    High $Y" and the last label (labels and format give the words). Hover or tap shows the bubble: labels[i] over
    name + format(value). format defaults to a plain number; tooltip: false turns the bubble off. */
export function sparkline(values, { lead = true, fill = false, width = 226, height = 38, goal, labels, format, name, tooltip = true, marks, axis = false } = {}) {
  const at = values.map((val, i) => ok(val) ? i : -1).filter(i => i >= 0), v = at.map(i => values[i]);
  const svg = s('svg', { class: 'lx-spark', viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  if (v.length < 2) return svg;
  const max = Math.max(...v, ok(goal) ? goal : -Infinity), min = ok(goal) ? 0 : Math.min(...v), span = max - min || 1;
  const Y = val => (height - 8) - (height - 12) * (val - min) / span, X = k => width * k / (v.length - 1);
  const d = path(v.map((val, k) => [X(k), Y(val)]));
  if (ok(goal)) svg.append(s('line', { class: 'gref', x1: 0, x2: width, y1: Y(goal), y2: Y(goal) }));
  if (fill) svg.append(s('path', { class: 'fill' + (lead ? ' lead' : ''), d: `${d} L${width} ${height} L0 ${height} Z` }));
  svg.append(s('path', { class: 'ln' + (lead ? ' lead' : ''), d }));
  const lo = v.indexOf(Math.min(...v)), hi = v.indexOf(Math.max(...v));
  if (marks ?? axis) for (const k of new Set([lo, hi])) svg.append(s('path', { class: 'mm' + (lead ? ' lead' : ''), d: `M${X(k).toFixed(1)} ${Y(v[k]).toFixed(1)} l0 0` }));
  const f0 = format || plainNum;
  const out = axis ? h('div', { class: 'lx-spark-box' }, svg, h('div', { class: 'lx-spark-ax' },
    h('span', null, labels && labels[at[0]] != null ? labels[at[0]] : ''),
    h('span', { class: 'm' }, 'Low ' + f0(v[lo], at[lo]) + ' · High ' + f0(v[hi], at[hi])),
    h('span', null, labels && labels[at[at.length - 1]] != null ? labels[at[at.length - 1]] : ''))) : svg;
  if (tooltip === false) return out;
  /* the bubble. The drawing is stretched (preserveAspectRatio none), so the dot is a zero length round stroke. */
  const f = format || plainNum;
  const cur = s('line', { class: 'cur', y1: 0, y2: height, visibility: 'hidden' }), pt = s('path', { class: 'pt' + (lead ? ' lead' : ''), visibility: 'hidden' });
  svg.append(cur, pt);
  const show = e => {
    const box = svg.getBoundingClientRect(); if (!box.width) return;
    const k = Math.max(0, Math.min(v.length - 1, Math.round((e.clientX - box.left) / box.width * (v.length - 1)))), i = at[k];
    cur.setAttribute('x1', X(k)); cur.setAttribute('x2', X(k)); cur.setAttribute('visibility', 'visible');
    pt.setAttribute('d', `M${X(k).toFixed(1)} ${Y(v[k]).toFixed(1)} l0 0`); pt.setAttribute('visibility', 'visible');
    tipShow(svg, [labels && labels[i] != null && labels[i] !== '' ? h('div', { class: 'lx-tip-h' }, labels[i]) : null,
      tipRow(null, name || 'Value', f(v[k], i))], { x: e.clientX, y: box.top + box.height * Y(v[k]) / height }, e.pointerType === 'touch' ? 30 : 12);
  };
  svg._tipOff = () => { cur.setAttribute('visibility', 'hidden'); pt.setAttribute('visibility', 'hidden'); };
  svg.addEventListener('pointermove', show); svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') tipHide(svg); });
  return out;
}
/* a plain figure for a tooltip when the chart was given no format: 12,840 / 312 / 4.25 */
const plainNum = val => !ok(val) ? NONE : Math.abs(val) >= 100 || val % 1 === 0 ? num(val) : num(val, Math.abs(val) < 10 ? 2 : 1);

/* ---------- the tooltip bubble ----------
   One small dark bubble for the whole app (class lx-tip, colors from the --tip-* tokens in app.css).
   It is position: fixed on <body>, so a card or a sheet never clips it, and it is kept inside the viewport.
     tipShow(owner, content, at, gap)  content: nodes or text (arrays are fine). at: { x, y } in client pixels
                                        (a pointer) or a DOMRect / element (sits above it, below when no room).
     tipHide(owner)                    hides it when owner still owns it (no owner: always).
     tipRow(swatch, name, value)       one "name ... value" line; swatch 'lead' | 'slate' | 'ink' | 'dash' | ''.
   A tap anywhere else, Escape, a scroll or a route change hides it. Charts use it; a page may too. */
/* Hover intent, one rule for the chart bubble and the definition bubble (defs.js reads the same clock):
     a bubble opens after HOVER.open ms of the pointer resting on its owner, never while the page scrolls
     (a hover that starts within HOVER.quiet ms of a scroll or wheel is ignored), and closes HOVER.close ms
     after the pointer leaves (moving back in keeps it). A tap, a click or the keyboard opens it at once.
     Moving from one bubble straight to the next opens the next at once too (the bubble is already "warm"). */
export const HOVER = { open: 350, close: 120, quiet: 250, warm: 300 };
const CLOCK = { scroll: 0, press: 0, key: 0, shut: 0 };
if (typeof window !== 'undefined') {
  const sc = () => { CLOCK.scroll = Date.now(); };
  window.addEventListener('scroll', sc, { capture: true, passive: true });
  window.addEventListener('wheel', sc, { capture: true, passive: true });
  window.addEventListener('touchmove', sc, { capture: true, passive: true });
  document.addEventListener('pointerdown', () => { CLOCK.press = Date.now(); }, true);
  document.addEventListener('keydown', () => { CLOCK.key = Date.now(); }, true);
}
/** True while the page is scrolling (or just stopped): hovers do not open then. */
export const scrollingNow = () => Date.now() - CLOCK.scroll < HOVER.quiet;
/** True when the last thing the person did was a tap, a click or a key: a bubble opens at once. */
export const pressedNow = () => Date.now() - CLOCK.press < 90 || Date.now() - CLOCK.key < 150;
/** True when a bubble is open or closed a moment ago: the next one opens at once. */
export const bubbleWarm = () => (TIP && !TIP.hidden) || Date.now() - CLOCK.shut < HOVER.warm || !!(typeof document !== 'undefined' && document.querySelector('.lx-defpop'));
export const noteBubbleShut = () => { CLOCK.shut = Date.now(); };

let TIP = null, tipOwner = null, pend = null, hideT = 0;
function tipBox() {
  if (!TIP) {
    TIP = h('div', { class: 'lx-tip', role: 'tooltip', id: 'lx-tip', hidden: true });
    document.body.append(TIP);
    document.addEventListener('pointerdown', e => { if (tipOwner && !(tipOwner.contains && tipOwner.contains(e.target))) tipHide(); }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') tipHide(); });
    window.addEventListener('scroll', () => tipHide(), { capture: true, passive: true });
    window.addEventListener('hashchange', () => tipHide());
  }
  return TIP;
}
/** tipShow(owner, content, at, gap, { now }) : opens the bubble for owner (after the hover delay, see HOVER).
    Call it as often as you like while the pointer moves: the latest content and position win.
    now: true skips the delay (a page that opens the bubble from a click). */
export function tipShow(owner, content, at, gap = 12, { now = false } = {}) {
  const el = tipBox();
  clearTimeout(hideT);
  const open = !el.hidden;
  /* never while the page scrolls, even right after another bubble closed (a scroll closes the bubble, which would
     otherwise leave it "warm" and let the next pointermove under the scrolling page open one at once) */
  if (!now && !open && !pressedNow() && scrollingNow()) {
    if (pend && pend.owner === owner) { clearTimeout(pend.t); pend = null; }
    if (owner && owner._tipOff) owner._tipOff();
    return el;
  }
  if (!now && !open && !pressedNow() && !bubbleWarm()) {
    if (pend && pend.owner === owner) { Object.assign(pend, { content, at, gap }); return el; }
    if (pend) { clearTimeout(pend.t); if (pend.owner && pend.owner._tipOff) pend.owner._tipOff(); }
    pend = { owner, content, at, gap };
    pend.t = setTimeout(() => { const p = pend; pend = null; if (p) drawTip(p.owner, p.content, p.at, p.gap); }, HOVER.open);
    return el;
  }
  if (pend) { clearTimeout(pend.t); pend = null; }
  return drawTip(owner, content, at, gap);
}
function drawTip(owner, content, at, gap) {
  const el = tipBox();
  if (owner && owner.isConnected === false) return el;
  if (tipOwner && tipOwner !== owner) { if (tipOwner._tipOff) tipOwner._tipOff(); if (tipOwner.removeAttribute) tipOwner.removeAttribute('aria-describedby'); }
  tipOwner = owner || null;
  /* the owner points at the bubble only while it is open (a pointer at a node that is not there helps no one) */
  if (tipOwner && tipOwner.setAttribute) tipOwner.setAttribute('aria-describedby', 'lx-tip');
  put(el, [].concat(content));
  el.hidden = false;
  placeFloat(el, at, gap);
  return el;
}
/** tipHide(owner) : closes the bubble after the short grace (owner given), or at once (no owner, { now: true }). */
export function tipHide(owner, { now = false } = {}) {
  if (pend && (!owner || pend.owner === owner)) { clearTimeout(pend.t); if (pend.owner && pend.owner._tipOff && pend.owner !== tipOwner) pend.owner._tipOff(); pend = null; }
  if (!TIP || TIP.hidden || (owner && owner !== tipOwner)) return;
  clearTimeout(hideT);
  if (owner && !now) { hideT = setTimeout(() => { if (tipOwner === owner) shutTip(); }, HOVER.close); return; }
  shutTip();
}
function shutTip() {
  if (tipOwner && tipOwner._tipOff) tipOwner._tipOff();
  if (tipOwner && tipOwner.removeAttribute) tipOwner.removeAttribute('aria-describedby');
  TIP.hidden = true; tipOwner = null; noteBubbleShut();
}
/** tipRow(swatch, name, value) : one line of the bubble, the label on the left and the value (with its unit) on
    the right. A grid with a fixed label column, so a long value wraps under itself and never squeezes the label
    to one letter per line. swatch: 'lead' | 'slate' | 'ink' | 'dash' | null (no square). */
export function tipRow(swatch, name, value) {
  const sw = swatch != null && swatch !== '' ? h('i', { class: 'sw ' + swatch }) : null;
  const k = name ? h('span', { class: 'k' }, name) : null;
  const cls = 'lx-tip-r kv' + (sw && k ? ' c3' : sw || k ? '' : ' c1');
  return h('div', { class: cls }, sw, k, h('b', { class: 'v' }, value));
}
/** placeFloat(el, at, gap) : puts a position: fixed element above a point or a box, below it when there is no
    room above, always inside the viewport (8px margin). at: { x, y } | DOMRect | element. Used by the tooltip
    bubble and by the definitions in defs.js. */
export function placeFloat(el, at, gap = 12) {
  const r = at && at.getBoundingClientRect ? at.getBoundingClientRect() : at || { x: 0, y: 0 };
  const vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
  el.style.left = '0px'; el.style.top = '0px';
  const w = el.offsetWidth, ht = el.offsetHeight, box = r.width != null;
  const cx = box ? r.left + r.width / 2 : r.x, top = box ? r.top : r.y, bottom = box ? r.bottom : r.y;
  let y = top - gap - ht;
  if (y < 8) y = bottom + (box ? gap : gap + 10);
  y = Math.max(8, Math.min(vh - ht - 8, y));
  const x = Math.max(8, Math.min(vw - w - 8, cx - w / 2));
  el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
}
/* what a page's hover(i) returned, as bubble lines: the first item is the heading, every other item a line.
   Loose text loses the commas and spaces it was joined with. */
function tipLines(items) {
  const list = [].concat(items).flat(Infinity).filter(k => k != null && k !== false && k !== '')
    .map(k => k.nodeType ? k : String(k).trim().replace(/^,\s*|,\s*$/g, '')).filter(k => k !== '');
  return list.map((k, j) => h('div', { class: j ? 'lx-tip-r' : 'lx-tip-h' }, k));
}

const CHARTS = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(list => {
  for (const e of list) { const el = e.target, w = Math.round(e.contentRect.width); if (w > 40 && Math.abs(w - el._w) > 1) { el._w = w; el._paint(w); } }
});
/* the width a full row chart most likely gets, for the first drawing before the box is on the page */
const guessW = () => { const vw = window.innerWidth || 1280; return Math.max(260, Math.min(1124, vw - (vw < 760 ? 64 : vw < 1200 ? 172 : 352))); };
function chartBox(o, draw) {
  const el = h('div', { class: 'lx-chart' + (o.class ? ' ' + o.class : '') });
  el._paint = w => {
    const phone = w < 520, H = phone ? (o.phoneHeight || Math.min(o.height, 290)) : o.height;
    el.style.height = H + 'px';
    if ((tipOwner && el.contains(tipOwner)) || (pend && pend.owner && el.contains(pend.owner))) tipHide();   // the bubble belonged to the drawing being replaced
    el.replaceChildren(...draw(w, H, phone));
  };
  el._w = o.width || guessW();
  el._paint(el._w);
  if (!o.width && CHARTS) CHARTS.observe(el);
  return el;
}

/** lineChart({ series, labels, ... }) : THE chart. Lines, columns or both, on one dollar (or any) scale.
    Returns a <div class="lx-chart"> that follows its container. Give it its own full width row.

    series: [{ name, values, lead, dashed, type, axis, labels, points, end, tone, leadAt, dimAt }]
      lead: true        the ONE ember line (soft area under it when fill is on). Every other line is slate.
      dashed: true      a comparison line (last year, "sales needed"): gray dashes, no end label.
      type: 'bar'       columns instead of a line. tone: 'ink' (default) | 'dim' | 'slate'. leadAt: index of the
                        one ember column. dimAt: [indexes] or i => bool drawn pale.
      axis: 'right'     read against the right axis (see y2). For a share drawn over counts.
      labels: true      a figure on every point or column (v => text for your own words). Crowded ones are
                        dropped on a narrow screen; the last is always kept.
      points: true      a dot on every point.
      end: v => text    the words at the right end of the line (false for none). Default is the last value.
    labels: x axis text, one per point. On a narrow screen only as many as fit are drawn (first and last stay).
      Works for days ("Nov 4"), weeks ("Oct 26") and hours ("6am").
    ticks: [indexes]    name exactly which x labels to try (still thinned when they would touch).
    xs: [numbers]       real x positions when points are not evenly spaced (day 0, 30, 60, 90, 180, 365).
    slots: bool         points sit in the middle of equal slots. On by default when there is a column series.
    goal: { value, label, at: 'start' | 'end' }   a dashed level line with its words.
    notes: [{ index, text }]   a dated note: a dashed upright line with a few words. `note` takes one.
    marks: [{ at | index, value, axis, text, line }]   an ink dot with words (where two lines cross); line: true
                        adds an upright line. at is a free position (slot units, or x units with xs).
    now: index          an upright line at "now" (hour charts).
    y2: { max, format } the right axis for series with axis: 'right'.
    fill, endLabels     the soft area under the lead line; the figures at the right end (both on by default).
    format, endFormat   v => text for the left axis; for end and point labels (defaults to format).
    yMax, yTicks, axis  the top of the scale; grid steps (picked to land on round figures); axis: false hides the left axis (small cards).
    topLabel            with axis: false, one value label at the top gridline (the scale's max, e.g. "$1k").
    height, phoneHeight pixels. Real height, never squished: 350 and 290 by default.
    width               a fixed pixel width. Leave it out and the chart follows its container.
    tooltip             ON BY DEFAULT: hover, tap or the arrow keys (the chart takes focus) show a small dark
                        bubble that follows the pointer, with a crosshair (a soft band on column charts) and a
                        dot on each line. It reads the x label, then one line per series: swatch, name, value
                        (value = series tipFormat, else the series' labels fn, else endFormat / format; the
                        right axis series use y2.format). tooltip: false turns it off; tooltip: i => nodes
                        writes the bubble yourself (first node = the heading, each other node = one line).
    tipLabels: [text]   the bubble's heading per point when the x labels are missing or too short ("6am" on
                        the axis, "6am to 7am" in the bubble).
    tipFormat: (v, sr, i) => text   one format for every value in the bubble.
    hover: i => nodes   older name for tooltip: i => nodes (still works; now drawn in the bubble).
    label, empty        the spoken description; the words when there is nothing to draw.
    windowLabel         what the chart covers, drawn small at the top left: 'Daily, Nov 1 to 25'. Every chart
                        should say it (decision 8). The y axis has 2 or 3 steps; give format a unit ($, x, %).
    name                the series name in the bubble when the series has none of its own. */
export function lineChart(o = {}) {
  const opt = { height: 350, fill: true, endLabels: true, axis: true, label: 'Chart', empty: 'No data for these dates',
    format: v => money(v, { compact: true }), ...o };
  opt.notes = (o.notes || (o.note ? [o.note] : [])).filter(nt => nt && nt.index != null && nt.index >= 0);
  return chartBox(opt, (W, H, phone) => plot(opt, W, H, phone));
}

/** barChart({ values, labels, dim, lead, format, height, valueLabels, label, name }) : one column series.
    Columns are data marks: ink, with dim ones in gray. dim: array of indexes (or i => bool).
    lead: index of the one column to draw in ember. name: the series name in the tooltip bubble.
    The same responsive box and tooltip options as lineChart (tooltip, tipLabels, tipFormat, hover). */
export function barChart({ values = [], labels = [], dim, lead, tone, format = v => num(v), height = 240, valueLabels = false, name, ...rest } = {}) {
  /* the one series is the lead: brand orange columns. With a lead index, that column is orange and the rest slate. */
  return lineChart({ series: [{ type: 'bar', name, values, dimAt: dim, leadAt: lead, labels: valueLabels, tone: tone || (lead != null ? 'slate' : 'brand') }], labels, format, height, yTicks: 2, endLabels: false, min: 1, ...rest });
}

function plot(o, W, H, phone) {
  const series = (o.series || []).filter(Boolean).map(sr => ({ type: 'line', ...sr, values: sr.values || [] }));
  const n = Math.max(0, ...series.map(sr => sr.values.length));
  const svg = s('svg', { class: 'lx-plot', viewBox: `0 0 ${W} ${H}`, width: W, height: H, preserveAspectRatio: 'xMinYMin meet', role: 'img', 'aria-label': o.label });
  const left = series.filter(sr => sr.axis !== 'right');
  const vals = left.flatMap(sr => sr.values.filter(ok)).concat(o.goal && ok(o.goal.value) ? [o.goal.value] : []);
  if (!vals.length || n < (o.min || 2)) { svg.append(s('text', { class: 'tk', x: W / 2, y: H / 2, 'text-anchor': 'middle' }, o.empty)); return [svg]; }

  const bars = series.filter(sr => sr.type === 'bar'), lines = series.filter(sr => sr.type !== 'bar');
  const slots = o.slots ?? bars.length > 0;
  const fmt = o.format, endFmt = o.endFormat || fmt, labFmt = sr => typeof sr.labels === 'function' ? sr.labels : endFmt;
  const max = o.yMax || niceMax(Math.max(...vals) * (series.some(sr => sr.labels) ? 1.08 : 1));
  /* two or three grid steps that land on round figures: 3 for a top of 1.5, 3 or 6; else 2 */
  if (!o.yTicks) { const m = +(max / Math.pow(10, Math.floor(Math.log10(max)))).toPrecision(3); o = { ...o, yTicks: [1.5, 3, 6].includes(m) ? 3 : 2 }; }
  const yl = Array.from({ length: o.yTicks + 1 }, (_, g) => fmt(max * (o.yTicks - g) / o.yTicks));
  const lastOf = sr => sr.values.filter(ok).pop();
  const endText = sr => sr.end === false || sr.dashed && !sr.end || sr.labels || sr.type === 'bar' ? null : sr.end ? sr.end(lastOf(sr)) : endFmt(lastOf(sr));
  const ends = o.endLabels ? lines.map(endText).filter(Boolean) : [];
  const y2 = o.y2 && series.some(sr => sr.axis === 'right') ? o.y2 : null;
  const hasLab = series.some(sr => sr.labels), topNotes = phone && o.notes.length;

  const L = o.axis ? Math.max(30, Math.max(...yl.map(t => textW(t, 6.5))) + 14) : 2;
  const R = W - (y2 ? textW(y2.format(y2.max), 6.5) + 14 : ends.length ? Math.max(...ends.map(t => textW(t, 7.3))) + 16 : hasLab || !o.axis ? 14 : 8);
  const T = (o.top ?? 14) + (o.windowLabel ? 20 : 0) + (hasLab ? 14 : 0) + (topNotes ? 18 : 0) + (o.marks && o.marks.some(m => m.line) ? 20 : 0);
  /* the window label: what the chart covers, top left ("Daily, Nov 1 to 25") */
  if (o.windowLabel) svg.append(s('text', { class: 'win', x: 0, y: 12 }, o.windowLabel));
  const hasX = !!(o.labels && o.labels.length), B = H - (hasX ? 30 : 6);
  const xs = o.xs && o.xs.length === n ? o.xs : null, x0 = xs ? xs[0] : 0, x1 = xs ? xs[n - 1] : n - 1;
  const step = (R - L) / n, pad = o.pad ?? 0;
  const free = pos => slots ? L + step * pos : xs ? L + (R - L) * (pos - x0) / ((x1 - x0) || 1) : L + pad + (R - L - 2 * pad) * pos / Math.max(1, n - 1);
  const X = i => slots ? L + step * (i + 0.5) : free(xs ? xs[i] : i);
  const Y = v => B - (B - T) * Math.min(v, max) / max, Y2 = v => B - (B - T) * Math.min(v, y2.max) / y2.max;

  /* grid and the axes */
  for (let g = 0; g <= o.yTicks; g++) {
    const y = T + (B - T) * g / o.yTicks;
    svg.append(s('line', { class: g === o.yTicks ? 'ax' : 'gl', x1: L, x2: R, y1: y, y2: y }));
    if (o.axis) svg.append(s('text', { class: 'tk y', x: L - 8, y: y + 4 }, yl[g]));
    else if (o.topLabel && g === 0) svg.append(s('text', { class: 'tk', x: L + 2, y: y - 4, 'text-anchor': 'start' }, yl[g]));
    if (y2 && g < o.yTicks) svg.append(s('text', { class: 'tk', x: R + 8, y: y + 4 }, y2.format(y2.max * (o.yTicks - g) / o.yTicks)));
  }
  /* the tooltip's soft band behind the column under the pointer (column charts), drawn under the marks */
  const tipOn = o.tooltip !== false;
  const band = tipOn && slots ? s('rect', { class: 'hl', y: T - 4, height: B - T + 4, width: Math.max(4, step - 4), rx: 6, visibility: 'hidden' }) : null;
  if (band) svg.append(band);

  /* x labels: as many as fit. The first and the last always stay. */
  if (hasX) {
    let cand = Array.isArray(o.ticks) ? o.ticks.filter(i => i >= 0 && i < n) : [...Array(n).keys()].filter(i => o.labels[i] != null && o.labels[i] !== '');
    const gap = phone ? 10 : 18, wOf = i => textW(o.labels[i], 6.3);
    if (!Array.isArray(o.ticks) && cand.length > 2) {
      const fit = Math.max(2, Math.floor((R - L) / (Math.max(...cand.map(wOf)) + gap + 6)));
      /* an even step (every 2nd, every 5th day), then the last one */
      if (cand.length > fit) { const st = Math.ceil((cand.length - 1) / (fit - 1)); cand = cand.filter((_, j) => j % st === 0 || j === cand.length - 1); }
    }
    const box = i => {
      const w = wOf(i), cx = X(i), anchor = slots || pad ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      const a = anchor === 'start' ? cx : anchor === 'end' ? cx - w : cx - w / 2;
      return { i, cx, anchor, a, b: a + w };
    };
    const kept = [];
    cand.forEach((i, k) => {
      const bx = box(i);
      if (!kept.length || bx.a - kept[kept.length - 1].b >= gap) return kept.push(bx);
      if (k === cand.length - 1) { while (kept.length > 1 && bx.a - kept[kept.length - 1].b < gap) kept.pop(); kept.push(bx); }
    });
    kept.forEach(t => svg.append(s('text', { class: 'tk' + (t.i === o.now ? ' on' : ''), x: t.cx, y: B + 21, 'text-anchor': t.anchor }, o.labels[t.i])));
  }

  /* notes, the goal, now */
  const noteBoxes = [];
  o.notes.forEach(nt => {
    if (nt.index >= n) return;
    const nx = X(nt.index), flip = topNotes ? nx > W / 2 : nx > R - textW(nt.text, 6.3) - 16;
    svg.append(s('line', { class: 'ev', x1: nx, x2: nx, y1: T, y2: B }));
    /* two notes close together: the later one drops a line so the words never sit on each other */
    const tx = topNotes ? nx + (flip ? 4 : -4) : nx + (flip ? -8 : 8), tw = textW(nt.text, 6.3), a = flip ? tx - tw : tx;
    let ty = topNotes ? T - 8 : T + 12;
    while (noteBoxes.some(q => q.y === ty && a < q.b + 8 && q.a < a + tw + 8)) ty += 15;
    noteBoxes.push({ a, b: a + tw, y: ty });
    svg.append(s('text', { class: 'nt halo', x: tx, y: ty, 'text-anchor': flip ? 'end' : 'start' }, nt.text));
  });
  if (o.now != null && o.now < n) svg.append(s('line', { class: 'ev', x1: X(o.now), x2: X(o.now), y1: T, y2: B }));
  if (o.goal && ok(o.goal.value)) {
    const gy = Y(o.goal.value), start = o.goal.at === 'start';
    svg.append(s('line', { class: 'ref', x1: L, x2: R, y1: gy, y2: gy }));
    if (o.goal.label) svg.append(s('text', { class: 'nt on', x: start ? L + 8 : R - 4, y: start || gy - T < 18 ? gy + 16 : gy - 7, 'text-anchor': start ? 'start' : 'end' }, o.goal.label));
  }

  /* columns */
  const taken = [];                       // label boxes already drawn, so two figures never sit on each other
  const clear = (x, y, w) => !taken.some(t => Math.abs(t.y - y) < 14 && Math.abs(t.x - x) < (t.w + w) / 2 + 4);
  const put = (text, x, y, cls, must) => { const w = textW(text, 7); if (!must && !clear(x, y, w)) return false; taken.push({ x, y, w }); svg.append(s('text', { class: 'dl halo ' + (cls || ''), x, y, 'text-anchor': 'middle' }, text)); return true; };
  bars.forEach(sr => {
    const bw = Math.max(3, slots ? Math.min(o.barWidth || 46, step * 0.62) : Math.min(12, (R - L) / n * 0.55)), r = Math.min(4, bw / 3);
    const isDim = i => typeof sr.dimAt === 'function' ? sr.dimAt(i) : Array.isArray(sr.dimAt) && sr.dimAt.includes(i);
    sr.values.forEach((v, i) => {
      if (!ok(v)) return;
      const l = X(i) - bw / 2, rr = l + bw, t = Math.min(B - r, Y(v));
      const cls = i === sr.leadAt ? 'lead' : isDim(i) || sr.tone === 'dim' ? 'dim' : sr.tone === 'slate' ? 'slate' : sr.tone === 'brand' ? 'brand' : '';
      if (v > 0) svg.append(s('path', { class: 'col ' + cls, d: `M${l.toFixed(1)} ${B} V${(t + r).toFixed(1)} Q${l.toFixed(1)} ${t.toFixed(1)} ${(l + r).toFixed(1)} ${t.toFixed(1)} H${(rr - r).toFixed(1)} Q${rr.toFixed(1)} ${t.toFixed(1)} ${rr.toFixed(1)} ${(t + r).toFixed(1)} V${B} Z` },
        s('title', null, (o.labels && o.labels[i] ? o.labels[i] + ': ' : '') + labFmt(sr)(v, i))));
    });
  });

  /* lines: the lead line last, so it sits on top */
  const endsOut = [];
  [...lines].sort((a, b) => (a.lead ? 1 : 0) - (b.lead ? 1 : 0)).forEach(sr => {
    const yOf = sr.axis === 'right' && y2 ? Y2 : Y;
    const pts = sr.values.map((v, i) => ok(v) ? [X(i), yOf(v), i, v] : null).filter(Boolean);
    if (pts.length < 2) return;
    const d = path(pts), last = pts[pts.length - 1];
    if (sr.lead && o.fill) svg.append(s('path', { class: 'area', d: `${d} L${last[0].toFixed(1)} ${B} L${pts[0][0].toFixed(1)} ${B} Z` }));
    svg.append(s('path', { class: sr.dashed ? 'cmp' : sr.lead ? 's1' : 's2', d }));
    if (sr.points) pts.slice(0, -1).forEach(p => svg.append(s('circle', { class: sr.lead ? 'dot' : 'dot2', cx: p[0], cy: p[1], r: 3.5 })));
    if (sr.lead || sr.points) svg.append(s('circle', { class: sr.lead ? 'dot' : 'dot2', cx: last[0], cy: last[1], r: 4.5 }));
    const et = o.endLabels ? endText(sr) : null;
    if (et) endsOut.push({ y: last[1], text: et, lead: sr.lead });
    sr._pts = pts;
  });
  /* figures on points and columns. The last point first (it must stay), then the rest left to right. */
  series.forEach(sr => {
    if (!sr.labels) return;
    const f = labFmt(sr), isBar = sr.type === 'bar', yOf = sr.axis === 'right' && y2 ? Y2 : Y;
    const pts = isBar ? sr.values.map((v, i) => ok(v) ? [X(i), yOf(v), i, v] : null).filter(Boolean) : (sr._pts || []);
    const at = (p, k) => {
      const prev = pts[k - 1], next = pts[k + 1], dip = !isBar && prev && next && p[3] < prev[3] && p[3] <= next[3] && p[1] + 26 < B;
      return [p[0], dip ? p[1] + 21 : p[1] - (isBar ? 7 : 12)];
    };
    const order = pts.map((p, k) => k); if (!isBar && order.length) order.unshift(order.pop());
    order.forEach(k => { const p = pts[k], [lx, ly] = at(p, k), lastOne = k === pts.length - 1; put(f(p[3], p[2]), Math.max(L + 4, Math.min(W - 4 - textW(f(p[3], p[2]), 7) / 2, lx)), ly, lastOne && sr.lead ? 's1t' : isBar ? 'sub' : '', lastOne && !isBar); });
  });
  endsOut.sort((a, b) => a.y - b.y);
  for (let i = 1; i < endsOut.length; i++) if (endsOut[i].y - endsOut[i - 1].y < 15) endsOut[i].y = endsOut[i - 1].y + 15;
  endsOut.forEach(e => svg.append(s('text', { class: 'dl ' + (e.lead ? 's1t' : 's2t'), x: R + 10, y: e.y + 4 }, e.text)));

  /* marks: an ink dot and a few words */
  (o.marks || []).forEach(m => {
    const mx = m.at != null ? free(m.at) : X(m.index), my = ok(m.value) ? (m.axis === 'right' && y2 ? Y2 : Y)(m.value) : null;
    const right = mx > (L + R) * 0.6;
    if (m.line) svg.append(s('line', { class: 'ref', x1: mx, x2: mx, y1: T - 16, y2: B }));
    if (my != null) svg.append(s('circle', { class: 'mk', cx: mx, cy: my, r: 4 }));
    if (m.text) svg.append(s('text', { class: 'nt on halo', x: mx + (right ? -10 : 10), y: m.line || my == null ? T - 8 : my + (m.dy ?? 22), 'text-anchor': right ? 'end' : 'start' }, m.text));
  });

  if (!tipOn) return [svg];
  /* the tooltip: hover, tap or arrow keys pick one point; the bubble follows the pointer. Listeners sit on the
     svg, which a redraw replaces. A page's own words (tooltip: i => nodes, or the older hover) win. */
  const own = typeof o.tooltip === 'function' ? o.tooltip : o.hover;
  const heads = o.tipLabels || o.labels || [];
  const valFmt = sr => sr.tipFormat || (o.tipFormat ? (v, i) => o.tipFormat(v, sr, i) : sr.axis === 'right' && y2 ? y2.format : labFmt(sr));
  const swatch = (sr, i) => sr.type === 'bar' ? (i === sr.leadAt || sr.tone === 'brand' ? 'lead' : sr.tone === 'slate' ? 'slate' : 'ink') : sr.lead ? 'lead' : sr.dashed ? 'dash' : 'slate';
  const content = i => {
    if (own) return tipLines(own(i));
    const head = heads[i] != null && heads[i] !== '' ? h('div', { class: 'lx-tip-h' }, heads[i]) : null;
    /* one series: no color square (it would only repeat the one line); more series: the square names the line */
    const one = series.length === 1;
    const rows = series.filter(sr => ok(sr.values[i])).map(sr => tipRow(one ? null : swatch(sr, i), sr.name || o.name || null, valFmt(sr)(sr.values[i], i)));
    return [head, rows.length ? rows : h('div', { class: 'lx-tip-r' }, NONE)];
  };
  const cur = slots ? null : s('line', { class: 'cur', y1: T, y2: B, visibility: 'hidden' });
  const dots = lines.filter(sr => sr._pts).map(sr => ({ sr, c: s('circle', { class: 'hd' + (sr.lead ? ' lead' : ''), r: 4, visibility: 'hidden' }) }));
  svg.append(...[cur, ...dots.map(d => d.c)].filter(Boolean), s('rect', { class: 'hit', x: L, y: T, width: Math.max(0, R - L), height: Math.max(0, B - T) }));
  svg.setAttribute('tabindex', '0');
  const idxAt = px => Math.max(0, Math.min(n - 1, slots ? Math.floor((px - L) / step) : xs ? xs.reduce((best, v, k) => Math.abs(free(v) - px) < Math.abs(free(xs[best]) - px) ? k : best, 0) : Math.round((px - L - pad) / ((R - L - 2 * pad) || 1) * (n - 1))));
  let at = -1;
  const mark = i => {
    at = i;
    if (cur) { cur.setAttribute('x1', X(i)); cur.setAttribute('x2', X(i)); cur.setAttribute('visibility', 'visible'); }
    if (band) { band.setAttribute('x', X(i) - (step - 4) / 2); band.setAttribute('visibility', 'visible'); }
    dots.forEach(({ sr, c }) => { const v = sr.values[i]; if (!ok(v)) return c.setAttribute('visibility', 'hidden');
      c.setAttribute('cx', X(i)); c.setAttribute('cy', (sr.axis === 'right' && y2 ? Y2 : Y)(v)); c.setAttribute('visibility', 'visible'); });
  };
  /* the top of the highest mark at i, in client pixels: the bubble sits above it when the keyboard drives */
  const topAt = (i, box) => { const ys = series.filter(sr => ok(sr.values[i])).map(sr => (sr.axis === 'right' && y2 ? Y2 : Y)(sr.values[i])); return box.top + (ys.length ? Math.min(...ys) : T) * box.height / H; };
  svg._tipOff = () => { at = -1; if (cur) cur.setAttribute('visibility', 'hidden'); if (band) band.setAttribute('visibility', 'hidden'); dots.forEach(d => d.c.setAttribute('visibility', 'hidden')); };
  const move = e => {
    const box = svg.getBoundingClientRect(); if (!box.width) return;
    const i = idxAt((e.clientX - box.left) * W / box.width);
    mark(i);
    tipShow(svg, content(i), { x: e.clientX, y: Math.min(e.clientY, topAt(i, box)) }, e.pointerType === 'touch' ? 30 : 14);
  };
  const byKey = i => { const box = svg.getBoundingClientRect(); mark(i); tipShow(svg, content(i), { x: box.left + X(i) * box.width / W, y: topAt(i, box) }, 12); };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') tipHide(svg); });
  svg.addEventListener('focus', () => { if (svg.matches(':focus-visible')) byKey(at >= 0 ? at : n - 1); });
  svg.addEventListener('blur', () => tipHide(svg));
  svg.addEventListener('keydown', e => {
    const step1 = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); byKey(e.key === 'Home' ? 0 : n - 1); }
    else if (step1) { e.preventDefault(); byKey(Math.max(0, Math.min(n - 1, (at < 0 ? n - 1 : at) + step1))); }
  });
  return [svg];
}

/** legend([{ name, lead }, { name }, { name, dashed }, { name, square }]) : text with a line sample (a square for columns), for above a chart */
export function legend(items) {
  /* a legend with one item says nothing the chart's own title does not: it is left out */
  const list = (items || []).filter(Boolean);
  if (list.length < 2) return h('div', { class: 'lx-legend', hidden: true });
  return h('div', { class: 'lx-legend' }, list.map(it => h('span', { class: (it.lead ? 'lead' : it.dashed ? 'dash' : '') + (it.square ? ' sq' : ''), style: it.color ? { '--c': it.color } : null }, it.name)));
}

/** gauge({ value, max, goal, tone, thin, ticks })
    An ink measure on a soft track with a crisp goal tick. tone: 'good' | 'warn' | 'bad' colors the fill.
    ticks: [{ at, text, on, side: 'l' | 'r' }] labels under the track (at is in the same units as value). */
export function gauge({ value, max, goal, tone, thin = false, ticks } = {}) {
  const m = max || Math.max(value || 0, goal || 0) * 1.2 || 1;
  const p = v => Math.max(0, Math.min(100, 100 * v / m)).toFixed(1) + '%';
  const el = h('div', { class: 'lx-gauge' + (thin ? ' thin' : '') },
    h('div', { class: 'lx-gauge-track' },
      ok(value) && h('i', { class: 'fill ' + (tone || ''), style: { '--v': p(value) } }),
      ok(goal) && h('i', { class: 'goal', style: { '--v': p(goal) } })));
  if (ticks && ticks.length) el.append(h('div', { class: 'lx-gauge-ticks' }, ticks.map(t => h('span', { class: (t.side || '') + (t.on ? ' on' : ''), style: t.side ? null : { '--at': p(t.at) } }, t.text))));
  return el;
}

/* ---------- table ---------- */
/** table({ cols, rows, virtual, total, roomy, rowHeight, height, sort, onRow, empty })
    cols: [{ key, label, num, width, render(row, i), sortable, value(row) }]. num right aligns with tabular numerals.
    render returns text or a node; without it the cell is row[key].
    rows: array of objects. total: one more row object drawn as the band at the foot.
    Over 100 rows (or virtual: true) only the rows on screen are in the DOM (60 at most), inside a
    scrolling box of `height` px. Sorting works on the data: click a sortable header.
    Returns the wrapper element; .setRows(rows) swaps the data in place. */
export function table({ cols = [], rows = [], virtual, total, roomy = false, rowHeight, height = 560, sort, onRow, empty = 'Nothing here yet' } = {}) {
  const rh = rowHeight || (roomy ? 48 : 36);   /* app.css --row-h-roomy / --row-h */
  let data = rows.slice(), state = sort ? { ...sort } : null;
  const isVirtual = () => virtual === true || (virtual !== false && data.length > 100);
  const thead = h('thead', null, h('tr', null, cols.map(c => h('th', { class: (c.num ? 'num' : '') + (c.sortable ? ' can-sort' : '') + (c.class ? ' ' + c.class : ''), style: c.width ? { width: typeof c.width === 'number' ? c.width + 'px' : c.width } : null, dataset: c.sortable ? { key: c.key } : null, scope: 'col' }, c.label || ''))));
  const tbody = h('tbody');
  const tbl = h('table', { class: 'lx-table' + (roomy ? ' roomy' : '') }, thead, tbody);
  const wrap = h('div', { class: 'lx-table-wrap' }, tbl);
  const cell = (c, row, i) => { const v = c.render ? c.render(row, i) : row[c.key]; return h('td', { class: (c.num ? 'num' : '') + (c.class ? ' ' + c.class : '') }, v == null ? '' : v); };
  const tr = (row, i, cls) => h('tr', { class: cls || (onRow ? 'click' : ''), dataset: { i } }, cols.map(c => cell(c, row, i)));
  const spacer = px => h('tr', { class: 'spacer', 'aria-hidden': 'true' }, h('td', { colspan: cols.length, style: { height: px + 'px', padding: 0, border: 0 } }));
  let raf = 0;
  function draw() {
    raf = 0;
    const kids = [];
    if (!data.length) kids.push(h('tr', { class: 'empty' }, h('td', { colspan: cols.length }, empty)));
    else if (isVirtual()) {
      const top = wrap.scrollTop, view = wrap.clientHeight || height;
      const first = Math.max(0, Math.floor(top / rh) - 8), last = Math.min(data.length, first + Math.min(60, Math.ceil(view / rh) + 16));
      if (first > 0) kids.push(spacer(first * rh));
      for (let i = first; i < last; i++) kids.push(tr(data[i], i));
      if (last < data.length) kids.push(spacer((data.length - last) * rh));
    } else data.forEach((row, i) => kids.push(tr(row, i)));
    if (total) kids.push(tr(total, -1, 'total'));
    tbody.replaceChildren(...kids);
  }
  function applySort() {
    if (!state) return;
    const c = cols.find(k => k.key === state.key); if (!c) return;
    const val = c.value || (r => r[c.key]);
    data.sort((a, b) => { const x1 = val(a), y1 = val(b); if (x1 == null || y1 == null) return x1 == null ? (y1 == null ? 0 : 1) : -1;   /* no value sorts last, both ways */
      const r = typeof x1 === 'number' && typeof y1 === 'number' ? x1 - y1 : String(x1).localeCompare(String(y1)); return state.dir === 'asc' ? r : -r; });
    thead.querySelectorAll('th').forEach(th => { th.classList.toggle('sorted', th.dataset.key === state.key); th.classList.toggle('asc', th.dataset.key === state.key && state.dir === 'asc'); });
  }
  function setup() {
    wrap.classList.toggle('virtual', isVirtual());
    wrap.style.maxHeight = isVirtual() ? height + 'px' : '';
    tbl.style.setProperty('--rh', rh + 'px');
  }
  thead.addEventListener('click', e => {
    const th = e.target.closest('th[data-key]'); if (!th) return;
    state = { key: th.dataset.key, dir: state && state.key === th.dataset.key && state.dir === 'desc' ? 'asc' : 'desc' };
    applySort(); draw();
  });
  wrap.addEventListener('scroll', () => { if (isVirtual() && !raf) raf = requestAnimationFrame(draw); }, { passive: true });
  if (onRow) tbody.addEventListener('click', e => { const r = e.target.closest('tr[data-i]'); if (r && +r.dataset.i >= 0) onRow(data[+r.dataset.i], +r.dataset.i, e); });
  wrap.setRows = next => { data = next.slice(); setup(); applySort(); draw(); };
  setup(); applySort(); draw();
  return wrap;
}

/** asOf(ts) : "updated 4 min ago" as a quiet chip. The SHELL draws this in every page head from the
    as-of time; a page never calls it. */
export function asOf(ts) { return ts ? h('span', { class: 'lx-asof', title: new Date(ts).toLocaleString() }, 'updated ' + relativeTime(ts)) : null; }

/** empty({ title, text, action }) : the plain state for "not connected" or "no sales source". Never a zero. */
export function empty({ title, text, action } = {}) {
  return h('div', { class: 'lx-empty' }, title && h('h3', null, title), text && h('p', null, text), action || null);
}

/* ---------- the Locus calendar: dates are always picked here, never with a native date input ---------- */
const ymdOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dateOf = str => new Date(String(str) + 'T12:00:00');
const shortDay = str => dateOf(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** calendar({ from, to, min, max, months, onChange }) : a styled month grid that picks a span.
    Click a first day (the start), then a second (the end; before the start swaps them). While only the start
    is picked, the span under the pointer shows. months: 2 shows two months side by side (one on a phone).
    onChange({ from, to }) runs on every pick (to is null after the first click). from, to, min, max: 'YYYY-MM-DD'.
    Returns the element; .value() is the current { from, to }, .set({ from, to }) changes it. */
export function calendar({ from = null, to = null, min = null, max = null, months = 2, onChange } = {}) {
  const st = { from, to, hover: null };
  const anchor = dateOf(to || from || max || ymdOf(new Date()));
  let view = new Date(anchor.getFullYear(), anchor.getMonth() - (months > 1 ? 1 : 0), 1);
  const el = h('div', { class: 'lx-cal' + (months > 1 ? ' two' : ''), role: 'group', 'aria-label': 'Pick dates' });
  const off = d => (min && d < min) || (max && d > max);
  const inSpan = d => { const a = st.from, b = st.to || st.hover; if (!a || !b) return false; const lo = a < b ? a : b, hi = a < b ? b : a; return d >= lo && d <= hi; };
  function mark() {
    const a = st.from, b = st.to || st.hover, lo = a && b ? (a < b ? a : b) : a, hi = a && b ? (a < b ? b : a) : a;
    el.querySelectorAll('button.d').forEach(btn => {
      const d = btn.dataset.d;
      btn.classList.toggle('in', inSpan(d));
      btn.classList.toggle('start', d === lo);
      btn.classList.toggle('end', d === hi);
      btn.classList.toggle('pre', !st.to && !!st.hover && inSpan(d));
      btn.setAttribute('aria-pressed', String(d === st.from || d === st.to));
    });
  }
  function monthGrid(first) {
    const y = first.getFullYear(), m = first.getMonth(), days = new Date(y, m + 1, 0).getDate(), lead = first.getDay(), today = ymdOf(new Date());
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(h('span', { class: 'blank', 'aria-hidden': 'true' }));
    for (let dnum = 1; dnum <= days; dnum++) {
      const d = ymdOf(new Date(y, m, dnum));
      cells.push(h('button', { type: 'button', class: 'd' + (d === today ? ' today' : ''), dataset: { d }, disabled: off(d) || null, 'aria-label': dateOf(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }, String(dnum)));
    }
    return h('div', { class: 'lx-cal-m' },
      h('div', { class: 'lx-cal-t' }, first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })),
      h('div', { class: 'lx-cal-g' }, WEEK.map(w => h('span', { class: 'wd', 'aria-hidden': 'true' }, w)), cells));
  }
  function draw() {
    const shown = Array.from({ length: months }, (_, k) => new Date(view.getFullYear(), view.getMonth() + k, 1));
    const step = k => { view = new Date(view.getFullYear(), view.getMonth() + k, 1); draw(); };
    put(el,
      h('div', { class: 'lx-cal-nav' },
        h('button', { type: 'button', class: 'lx-btn ghost icon', 'aria-label': 'Earlier month', onclick: () => step(-1) }, svgNode('<svg class="lx-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>')),
        h('span', { class: 'lx-sp' }),
        h('button', { type: 'button', class: 'lx-btn ghost icon', 'aria-label': 'Later month', onclick: () => step(1) }, svgNode('<svg class="lx-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'))),
      h('div', { class: 'lx-cal-ms' }, shown.map(monthGrid)));
    mark();
  }
  el.addEventListener('click', e => {
    const b = e.target.closest('button.d'); if (!b || b.disabled) return;
    const d = b.dataset.d;
    if (!st.from || st.to) { st.from = d; st.to = null; }
    else if (d < st.from) { st.to = st.from; st.from = d; }
    else st.to = d;
    st.hover = null; mark();
    onChange && onChange({ from: st.from, to: st.to });
  });
  el.addEventListener('pointerover', e => { const b = e.target.closest('button.d'); if (!b || !st.from || st.to) return; st.hover = b.dataset.d; mark(); });
  el.addEventListener('pointerleave', () => { if (st.hover) { st.hover = null; mark(); } });
  el.value = () => ({ from: st.from, to: st.to });
  el.set = v => { st.from = v.from || null; st.to = v.to || null; draw(); };
  draw();
  return el;
}

/** rangePicker({ from, to, min, max, onApply, onCancel }) : the calendar with a summary line and Apply / Cancel.
    Two months side by side on a desktop, one on a phone. onApply({ from, to }) with both dates set
    (Apply waits until both are picked; one day = click it twice). The shell's date menu uses it for Custom. */
export function rangePicker({ from = null, to = null, min = null, max = null, onApply, onCancel } = {}) {
  const phone = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width:759px)').matches;
  const say = h('p', { class: 'lx-rp-say', 'aria-live': 'polite' });
  const apply = button('Apply', { primary: true, onclick: () => { const v = cal.value(); if (v.from && v.to) onApply && onApply(v); } });
  const cancel = button('Cancel', { ghost: true, onclick: () => onCancel && onCancel() });
  const tell = v => {
    const days = v.from && v.to ? Math.round((dateOf(v.to) - dateOf(v.from)) / 864e5) + 1 : 0;
    say.textContent = !v.from ? 'Pick the first day' : !v.to ? shortDay(v.from) + ' to ...  pick the last day' : (v.from === v.to ? shortDay(v.from) : shortDay(v.from) + ' to ' + shortDay(v.to)) + ' \u00b7 ' + days + (days === 1 ? ' day' : ' days');
    apply.disabled = !(v.from && v.to);
  };
  const cal = calendar({ from, to, min, max, months: phone ? 1 : 2, onChange: tell });
  tell({ from, to });
  return h('div', { class: 'lx-rp' }, cal, h('div', { class: 'lx-rp-foot' }, say, h('span', { class: 'lx-sp' }), cancel, apply));
}
