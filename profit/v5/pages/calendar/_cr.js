/* Local parts shared by the calendar, offers, Black Friday plan, reports, documents, requests,
   to send, shared links and client list pages. Nothing here touches the network.
   Kit gaps written here (see the report): the list row, the month grid, the "example" chip, copy a link. */

import { exampleChip as kitExampleChip } from '../../kit.js';
import { h, addStyles, button, toast, dateBlock, statusDot } from '../../kit.js';
import { pageHelp } from '../../defs.js';

/* ---------- dates (whole days, no time zones) ---------- */
const DAY = 864e5;
export const at = ymd => Date.parse(String(ymd).slice(0, 10) + 'T12:00:00Z');
export const ymd = ms => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d, n) => ymd(at(d) + n * DAY);
export const between = (a, b) => Math.round((at(b) - at(a)) / DAY);
const fmt = (d, o) => new Date(at(d)).toLocaleDateString('en-US', { timeZone: 'UTC', ...o });
export const short = d => fmt(d, { month: 'short', day: 'numeric' });
export const wday = d => fmt(d, { weekday: 'short' });
export const monthName = d => fmt(d, { month: 'long', year: 'numeric' });
/** "Nov 26", "Nov 26 to 30", "Nov 30 to Dec 4" */
export function span(a, b) {
  if (!a) return '';
  if (!b || b === a) return short(a);
  return a.slice(0, 7) === b.slice(0, 7) ? `${short(a)} to ${+b.slice(8, 10)}` : `${short(a)} to ${short(b)}`;
}
/** "today", "tomorrow", "in 6 days", "3 days ago" */
export function away(today, d) {
  const n = between(today, d);
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 0 ? `in ${n} days` : `${-n} days ago`;
}
/** A time stamp from the API ("2026-11-23T14:02:11Z" or "2026-11-23 14:02:11") as "Nov 23". */
export const dayOf = ts => ts ? short(String(ts).slice(0, 10)) : '';
export const todayYmd = () => { const n = new Date(); return ymd(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate(), 12)); };

/* ---------- small parts ---------- */
/** The chip on anything drawn from the fixture in real mode. */
export const exampleChip = kitExampleChip; /* one version, in the kit */

/** A section heading with a count and a quiet note. */
export function heading(title, n, note) {
  return h('div', { class: 'cr-h' }, h('h2', null, title), n != null && h('span', { class: 'lx-count' }, String(n)), note && h('span', { class: 'note' }, note));
}

/** row({ lead, title, sub, cells: [{ w, node, class, label }], action, onclick, late, one }). one: the sub on one line.
    One list row with a real height. Desktop: lead, words, fixed cells, the button. Phone: stacked. */
export function row({ lead, title, sub, cells = [], action, onclick, late, one } = {}) {
  /* a clickable row is a div with the button role (it can hold its own buttons, which a <button> may not) */
  return h('div', { class: 'cr-row' + (onclick ? ' click' : '') + (lead ? '' : ' nolead'), role: onclick ? 'button' : null, tabindex: onclick ? '0' : null, onclick,
    onkeydown: onclick ? e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onclick(e); } } : null },
    lead ? h('span', { class: 'cr-lead' }, lead) : null,
    h('span', { class: 'cr-what' }, h('b', null, title), sub ? h('span', { class: 'cr-sub' + (late ? ' late' : '') + (one ? ' one' : ''), title: one && typeof sub === 'string' ? sub : null }, sub) : null),
    cells.length ? h('span', { class: 'cr-cells' }, cells.filter(Boolean).map(c => h('span', { class: 'cr-cell ' + (c.class || ''), style: c.w ? { '--w': c.w + 'px' } : null }, c.label ? h('small', null, c.label) : null, c.node))) : null,
    /* the action slot is always there (empty when the row has none), so every row's cells stay in their columns */
    h('span', { class: 'cr-go' }, action || null));
}
/** list(rows, none, { head, first, go, sort, onSort, firstSort }) : the rows under one optional header row.
    head: [{ label, w, sort }] one entry per cell, same widths as the rows' cells; first: the words over the title column.
    go: the width of the action slot in px, so every row (with or without buttons) lines its cells up.
    sort: { key, dir } the order on screen; a head cell with `sort: 'key'` (and firstSort for the title column) is a
    button that calls onSort(key): the page flips the direction and redraws. Sorting is a desktop control (the header
    row is hidden on a phone, where the list keeps the page's own order).
    The header shows on a desktop only; on a phone each cell carries its own small label. */
export function list(rows, none, { head, first = '', go, sort, onSort, firstSort } = {}) {
  const el = h('div', { class: 'cr-list', style: go ? { '--go': go + 'px' } : null });
  const hc = (label, key) => {
    if (!key || !onSort) return label;
    const on = sort && sort.key === key;
    return h('button', { type: 'button', class: 'cr-sort' + (on ? ' on' : ''), 'aria-label': 'Sort by ' + label + (on ? (sort.dir === 'asc' ? ', now low to high' : ', now high to low') : ''),
      onclick: () => onSort(key) }, label, h('i', { 'aria-hidden': 'true' }, on ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'));
  };
  if (head && rows.length) el.append(h('div', { class: 'cr-row nolead cr-head' },
    h('span', { class: 'cr-what' }, hc(first, firstSort)),
    h('span', { class: 'cr-cells' }, head.filter(Boolean).map(c => h('span', { class: 'cr-cell ' + (c.class || ''), style: c.w ? { '--w': c.w + 'px' } : null }, hc(c.label, c.sort)))),
    h('span', { class: 'cr-go' })));
  el.append(...(rows.length ? rows : [h('p', { class: 'cr-none' }, none || 'Nothing here yet.')]));
  return el;
}
/** sortRows(rows, sort, valueOf) : a copy of rows in sort order. valueOf(row, key) gives a number or text; empty
    values go last whichever way. */
export function sortRows(rows, sort, valueOf) {
  if (!sort || !sort.key) return rows.slice();
  const m = sort.dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const va = valueOf(a, sort.key), vb = valueOf(b, sort.key);
    const ea = va == null || va === '', eb = vb == null || vb === '';
    if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
    return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * m;
  });
}
/** flipSort(sort, key, firstDir) : the next { key, dir } after a head click. */
export const flipSort = (sort, key, firstDir = 'asc') => sort && sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstDir };

/** box({ title, n, note, action }, ...kids) : the white card a list or a section sits in (the batch 1 card look:
    card title 14/600, a count, a quiet note, actions on the right). */
export function box({ title, n, note, action, class: cls } = {}, ...kids) {
  return h('section', { class: 'lx-card cr-box' + (cls ? ' ' + cls : '') },
    title || action ? h('div', { class: 'cr-box-h' }, title ? h('h3', { class: 'lx-card-t' }, title) : null, n != null ? h('span', { class: 'lx-count' }, String(n)) : null,
      note ? h('span', { class: 'note' }, note) : null, action ? h('div', { class: 'act' }, action) : null) : null,
    kids);
}

/** A quiet word in the action slot of a row that has no buttons ("Link ended"). */
export const goNote = text => h('span', { class: 'cr-gonote' }, text);

/** The quiet bar at the top of a page: the one "What is this page?" help, then anything else (no footers). */
export const helpBar = (body, ...kids) => h('div', { class: 'cr-bar-top cr-helpbar' }, pageHelp({ body }), ...kids);

/** The filter row: searchBox, selectBox and a "n of m, Clear" note. Built once; only the list under it redraws,
    so typing in the search never loses its place. */
export function searchBox(value, onInput, placeholder = 'Search') {
  const el = h('input', { class: 'lx-input cr-search', type: 'search', placeholder, 'aria-label': placeholder, value: value || '' });
  el.addEventListener('input', () => onInput(el.value));
  return el;
}
/** selectBox('Brand', [{ id, label }], value, onPick) */
export function selectBox(label, items, value, onPick) {
  const el = h('select', { class: 'lx-input cr-select', 'aria-label': label, title: label }, items.map(it => h('option', { value: it.id, selected: it.id === value ? true : null }, it.label)));
  el.value = value;
  el.addEventListener('change', () => onPick(el.value));
  return el;
}
/** "4 of 12 shown, Clear filters" when a filter is on, else nothing. */
export const filterNote = (n, m, on, onClear) => on ? h('span', { class: 'cr-fnote' }, n + ' of ' + m + ' shown', h('button', { type: 'button', class: 'cr-clear', onclick: onClear }, 'Clear filters')) : null;

/** A button that copies a link and says so. */
export function copyBtn(url, label = 'Copy link') {
  return button(label, { iconLeft: 'link', onclick: async e => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(url); toast('Link copied.'); }
    catch { toast('Could not copy. The link is ' + url, { ms: 6000 }); }
  } });
}

/** A brand's name with its color as a small square. */
export function brandTag(name, color) {
  return h('span', { class: 'cr-brand' }, h('i', { style: { '--dot': color || 'var(--faint)' } }), name);
}
export const colorOf = (ctx, id) => ((ctx.brands || []).find(b => b.id === id) || {}).color || null;

/* ---------- the month grid ---------- */
/** monthGrid({ month: '2026-11', today, events: [{ start, end, name, tone, color, id }], onPick })
    Weeks as rows, each event a bar across the days it runs. Three bars a week, then "+ n more". */
export function monthGrid({ month, today, events = [], onPick, lanes = 3 } = {}) {
  const first = month + '-01';
  const startDow = new Date(at(first)).getUTCDay();
  const gridStart = addDays(first, -startDow);
  const dim = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const weeks = Math.ceil((startDow + dim) / 7);
  const el = h('div', { class: 'cr-month', role: 'grid', 'aria-label': monthName(first) });
  el.append(h('div', { class: 'cr-dow' }, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => h('span', null, d))));
  for (let w = 0; w < weeks; w++) {
    const ws = addDays(gridStart, w * 7), we = addDays(ws, 6);
    const wk = h('div', { class: 'cr-week' });
    for (let d = 0; d < 7; d++) {
      const day = addDays(ws, d), out = day.slice(0, 7) !== month;
      wk.append(h('span', { class: 'cr-day' + (out ? ' out' : '') + (day === today ? ' today' : '') + (day < today ? ' past' : ''), style: { gridColumn: String(d + 1) } }, h('b', null, +day.slice(8, 10))));
    }
    const here = events.filter(e => e.start <= we && (e.end || e.start) >= ws).sort((a, b) => a.start.localeCompare(b.start) || (b.end || b.start).localeCompare(a.end || a.start));
    const used = [];           // per lane: the last column taken
    let more = Array(7).fill(0);
    for (const e of here) {
      const c0 = Math.max(0, between(ws, e.start)), c1 = Math.min(6, between(ws, e.end || e.start));
      let lane = used.findIndex(last => last < c0);
      if (lane < 0) lane = used.length;
      if (lane >= lanes) { for (let c = c0; c <= c1; c++) more[c]++; continue; }
      used[lane] = c1;
      const cont = e.start < ws, goes = (e.end || e.start) > we;
      wk.append(h('button', { type: 'button', class: 'cr-bar ' + (e.tone || '') + (cont ? ' cont' : '') + (goes ? ' goes' : ''), title: e.name + ', ' + span(e.start, e.end),
        style: { gridColumn: `${c0 + 1} / ${c1 + 2}`, gridRow: String(lane + 2) }, onclick: () => onPick && onPick(e) },
        e.color ? h('i', { style: { '--dot': e.color } }) : null, h('span', null, e.name)));
    }
    more.forEach((n, c) => { if (n) wk.append(h('span', { class: 'cr-more', style: { gridColumn: String(c + 1), gridRow: String(lanes + 2) } }, '+ ' + n + ' more')); });
    /* a week is only as tall as the bars it holds (a quiet week does not take a full 150px) */
    wk.style.setProperty('--lanes', String(Math.max(1, more.some(Boolean) ? lanes + 1 : used.length)));
    el.append(wk);
  }
  return el;
}

/** The legend under a calendar: the bar's left edge is its status; with brands, the small square is the brand's color. */
export const statusLegend = ({ brand = false } = {}) => h('div', { class: 'cr-legend' },
  h('span', { class: 'cr-lg-h' }, 'Left edge:'), statusDot('good', 'Confirmed'), statusDot('warn', 'Pencilled in'), statusDot('bad', 'No offer written'),
  brand ? h('span', { class: 'cr-lg-b' }, h('i'), 'Square = the brand') : null);

/** A date block that reads "NOV 26". */
export const dateOf = (d, today) => dateBlock(d, { month: true, now: d === today });

/* ---------- styles ---------- */
let done = false;
export function css() {
  if (done) return;
  done = true;
  addStyles('lx-cr-css', CSS);
}
const CSS = `
.cr-ex{background:#fff;box-shadow:inset 0 0 0 1px var(--line-strong);color:var(--muted)}
.cr-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-bottom:12px}
.cr-h h2{margin:0;font-size:17px;font-weight:600;letter-spacing:-.02em}
.cr-h .note{font-size:13px;color:var(--muted)}
.cr-h .sp{flex:1}
.cr-sect{display:grid;min-width:0}
.cr-bar-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-width:0}
.cr-bar-top .lx-seg{max-width:100%;overflow-x:auto;scrollbar-width:none}
.cr-bar-top .lx-seg button{flex:none;white-space:nowrap}
.cr-bar-top .sp{flex:1}
.cr-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0;padding-bottom:12px}
.cr-tools .lx-input{height:36px;font-size:13.5px;border-radius:10px;width:auto}
.cr-tools .cr-search{flex:1 1 220px;min-width:180px;max-width:320px}
.cr-tools .cr-select{flex:none;max-width:200px}
.cr-tools .cr-phonesort{display:none}
.cr-tools:not(:has(> :not(.cr-phonesort))){display:none}
.cr-fnote{display:inline-flex;gap:10px;align-items:center;font-size:13px;color:var(--muted)}
.cr-clear{border:0;background:none;padding:0;font:inherit;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer}
.cr-clear:hover{text-decoration:underline;text-underline-offset:3px}
.cr-fold{display:flex;align-items:center;gap:10px;width:100%;min-height:var(--row-h-roomy,48px);padding:10px 0;border:0;border-top:1px solid var(--line);background:none;font:inherit;font-size:14px;font-weight:600;color:var(--ink-2);text-align:left;cursor:pointer}
.cr-fold:hover{color:var(--ink)}
.cr-fold small{font-weight:400;color:var(--muted);font-size:13px}
.cr-sub.one{-webkit-line-clamp:1}
.cr-list{display:grid;min-width:0}
.cr-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;gap:18px;align-items:center;min-height:var(--row-h-roomy,48px);padding:10px 0;border:0;border-top:1px solid var(--line);background:transparent;width:100%;text-align:left;font:inherit;color:inherit;min-width:0}
.cr-row.nolead{grid-template-columns:minmax(0,1fr) auto auto}
.cr-row.click{cursor:pointer}
.cr-row.click:focus-visible{outline:2px solid var(--ink-2);outline-offset:2px;border-radius:8px}
.cr-row.click:hover{background:var(--row-hover);border-radius:10px;box-shadow:-10px 0 0 var(--row-hover),10px 0 0 var(--row-hover)}
.cr-lead{display:flex;align-items:center}
.cr-lead:empty{display:none}
.cr-what{min-width:0;display:block}
.cr-what b{display:block;font-size:15px;font-weight:600;letter-spacing:-.012em;line-height:1.35;overflow-wrap:anywhere}
.cr-sub{display:block;margin-top:3px;font-size:13px;color:var(--muted);line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.cr-sub.late{color:var(--bad)}
.cr-cells{display:flex;align-items:center;gap:22px}
.cr-cell{display:block;width:var(--w,120px);font-size:var(--fs-table,13px);color:var(--ink-2);font-variant-numeric:tabular-nums;min-width:0}
.cr-cell small{display:none;font-size:11.5px;color:var(--muted)}
.cr-cell.strong{font-weight:600;color:var(--ink)}
.cr-cell.num{text-align:right}
.cr-cell .lx-stat{white-space:normal}
.cr-go{display:flex;justify-content:flex-end;align-items:center;gap:8px;min-width:var(--go,0)}
.cr-go:empty{min-width:var(--go,0)}
.cr-gonote{font-size:13px;color:var(--muted);white-space:nowrap}
.cr-head{min-height:32px;padding:0;border-top:0}
.cr-head .cr-what,.cr-head .cr-cell{font-size:var(--fs-colhead,11.5px);font-weight:600;letter-spacing:0;text-transform:none;color:var(--muted)}
.cr-sort{display:inline-flex;align-items:center;gap:5px;border:0;background:none;padding:0;font:inherit;color:inherit;cursor:pointer}
.cr-sort i{font-style:normal;font-size:10.5px;color:var(--faint)}
.cr-sort:hover,.cr-sort.on{color:var(--ink)}
.cr-sort.on i{color:var(--ink)}
.cr-box{display:grid;gap:12px;align-content:start}
.cr-box-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0}
.cr-box-h .note{font-size:var(--fs-small,12.5px);color:var(--muted)}
.cr-box-h .act{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cr-box>.cr-list>.cr-head+.cr-row,.cr-box>.cr-list>.cr-row:first-child{border-top:1px solid var(--line)}
.cr-box .cr-tools{padding-bottom:0}
.cr-box .cr-month{box-shadow:inset 0 0 0 1px var(--line);border-radius:var(--r-tbl,12px)}
.cr-box .cr-legend{padding-top:0}
.cr-box .cr-nav h2{font-size:var(--fs-section,17px);min-width:150px}
.cr-head+.cr-row{border-top:1px solid var(--line)}
.cr-go .lx-btn{height:36px;white-space:nowrap}
.cr-none{padding:18px 0;border-top:1px solid var(--line);font-size:13.5px;color:var(--muted)}
.cr-brand{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;font-weight:500;color:var(--ink-2);min-width:0}
.cr-brand i{width:10px;height:10px;border-radius:3px;background:var(--dot);flex:none}
.cr-legend{display:flex;gap:18px;flex-wrap:wrap;padding-top:14px}

.cr-month{display:grid;border-radius:var(--r-card,16px);box-shadow:var(--sh-1);background:#fff;overflow:hidden;min-width:0}
.cr-dow{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border-bottom:1px solid var(--line)}
.cr-dow span{padding:10px 12px;font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted)}
.cr-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-template-rows:34px repeat(var(--lanes,4),26px);row-gap:3px;min-height:72px;padding-bottom:8px;border-top:1px solid var(--line);position:relative}
.cr-dow+.cr-week{border-top:0}
.cr-day{grid-row:1 / -1;padding:8px 10px;border-left:1px solid var(--line);min-width:0}
.cr-day:first-child{border-left:0}
.cr-day b{display:inline-grid;place-items:center;min-width:24px;height:24px;border-radius:999px;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;color:var(--ink)}
.cr-day.out b{color:var(--icon)}
.cr-day.past:not(.out) b{color:var(--muted)}
.cr-day.today b{background:var(--ink);color:#fff;padding:0 6px}
.cr-day.out{background:var(--surface-2)}
.cr-bar{display:flex;align-items:center;gap:6px;height:24px;margin:0 5px;padding:0 9px;border:0;border-radius:8px;background:var(--bg-sunk);font:inherit;font-size:12.5px;font-weight:500;color:var(--ink);text-align:left;cursor:pointer;min-width:0;z-index:1}
.cr-bar{box-shadow:inset 3px 0 0 var(--faint)}
.cr-bar.good{box-shadow:inset 3px 0 0 var(--good)}
.cr-bar.warn{box-shadow:inset 3px 0 0 var(--watch)}
.cr-bar.bad{box-shadow:inset 3px 0 0 var(--bad)}
.cr-bar.cont{box-shadow:none}
.cr-lg-h{font-size:12.5px;color:var(--muted)}
.cr-lg-b{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ink-2)}
.cr-lg-b i{width:8px;height:8px;border-radius:3px;background:var(--ink-2)}
.cr-prog{display:grid;gap:6px;margin:4px 0 2px}
.cr-prog .bar{height:8px;border-radius:999px;background:var(--bg-sunk);overflow:hidden}
.cr-prog .bar i{display:block;height:100%;background:var(--good);border-radius:999px}
.cr-prog small{font-size:12.5px;color:var(--muted)}
.cr-shead{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.cr-shead .when{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
.cr-shead .away{font-size:13px;color:var(--muted)}
/* a kpi whose value is words ("Running now", "2 days ago") is drawn at the smaller word size */
.lx-kpi .v.words{font-size:var(--num-m);letter-spacing:-.015em;line-height:1.25;white-space:normal}
.cr-tile-click{cursor:pointer;border-radius:12px}
.cr-tile-click:hover{background:var(--row-hover)}
.cr-tile-click.on{box-shadow:inset 0 0 0 1.5px var(--ink)}
.cr-bar.mail{background:transparent;color:var(--muted);font-weight:450}
.cr-bar.mail{box-shadow:inset 0 0 0 1px var(--line-strong)}
.cr-bar i{width:8px;height:8px;border-radius:3px;background:var(--dot);flex:none}
.cr-bar span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.cr-bar.cont{margin-left:0;border-top-left-radius:0;border-bottom-left-radius:0}
.cr-bar.goes{margin-right:0;border-top-right-radius:0;border-bottom-right-radius:0}
.cr-bar:hover{background:#E9E7E2}
.cr-bar.mail:hover{background:var(--surface-2)}
.cr-more{align-self:center;padding:0 12px;font-size:11.5px;color:var(--muted);z-index:1;white-space:nowrap}
.cr-nav{display:flex;align-items:center;gap:8px}
.cr-nav h2{margin:0 6px 0 0;font-size:19px;font-weight:600;letter-spacing:-.025em;min-width:172px}
.cr-nav .lx-btn.icon svg{width:16px;height:16px}

.cr-kv{display:grid;grid-template-columns:150px minmax(0,1fr);gap:8px 16px;font-size:14px}
.cr-kv dt{color:var(--muted);font-size:13.5px}
.cr-kv dd{margin:0;font-weight:500;overflow-wrap:anywhere}
.cr-steps{display:grid;margin-top:6px}
.cr-step{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 14px;padding:12px 0;border-top:1px solid var(--line);font-size:14px}
.cr-step b{font-weight:600}
.cr-step small{grid-column:1/-1;font-size:12.5px;color:var(--muted)}
.cr-sheet{display:grid;gap:20px}
.cr-sheet p.offer{font-size:16px;line-height:1.45;font-weight:500;letter-spacing:-.01em}
.cr-thread{display:grid;gap:12px}
.cr-msg{padding:12px 14px;border-radius:14px;background:var(--bg-sunk);font-size:14px;line-height:1.45;overflow-wrap:anywhere;white-space:pre-line}
.cr-msg.team{background:#fff;box-shadow:var(--sh-1)}
.cr-msg small{display:block;margin-bottom:4px;font-size:12px;color:var(--muted);font-weight:500}

.cr-offer{display:grid;grid-template-columns:44px minmax(0,1fr) 190px 150px;gap:18px;align-items:start;padding:20px 0;border-top:1px solid var(--line)}
.cr-offer .n{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:999px;background:var(--bg-sunk);font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
.cr-offer.lead .n{background:var(--ink);color:#fff}
.cr-offer .nm{font-size:13px;color:var(--muted)}
.cr-offer .deal{margin-top:2px;font-size:18px;font-weight:600;letter-spacing:-.02em;line-height:1.3;overflow-wrap:anywhere}
.cr-offer.lead .deal{font-size:22px}
.cr-offer .deal.none{color:var(--muted);font-weight:500;font-size:15px}
.cr-offer .detail{margin-top:6px;font-size:13.5px;color:var(--muted);line-height:1.45;max-width:70ch}
.cr-offer .when{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
.cr-offer .when small{display:block;margin-top:2px;font-size:12.5px;font-weight:400;color:var(--muted)}
.cr-offer .res{margin-top:10px;display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.cr-offer .res b{color:var(--ink);font-weight:600}

.cr-heroline{display:grid;gap:8px;min-width:0}
.cr-heroline .lab{font-size:13px;color:var(--muted)}
.cr-heroline .big{font-size:var(--num-l);font-weight:600;letter-spacing:-.035em;line-height:1.15;overflow-wrap:anywhere}
.cr-heroline .of{font-size:13.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.cr-herogrid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1.4fr);gap:44px;align-items:end}
/* a row of big tiles wrapped in .cr-fit keeps its count on one row: when the figures at full size would need a
   second row, they get smaller (never under 30px) until the row fits its box. If even 30px does not fit, the
   row wraps as it always did, at full size. --kpi-em is the widest figure, set by kit kpis(). */
.cr-fit{container-type:inline-size;min-width:0}
.cr-fit>.lx-kpis{--fit:calc((100cqw - (var(--cols) - 1) * var(--gap-kpi)) / var(--cols) / var(--kpi-em,4.55) - .5px)}
.cr-fit>.lx-kpis:has(>.lx-kpi.lg){--kpi-fs:max(min(var(--fs-hero),var(--fit)),min(var(--fs-hero),(30px - var(--fit)) * 9999))}
.cr-fit>.lx-kpis>.lx-kpi.lg .v{font-size:var(--kpi-fs)}
.cr-ladder{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px}
.cr-ladder div{display:grid;gap:4px;padding-top:14px;border-top:3px solid var(--bg-sunk)}
.cr-ladder .good{border-top-color:var(--good)}
.cr-ladder .warn{border-top-color:var(--watch)}
.cr-ladder .bad{border-top-color:var(--bad)}
.cr-ladder small{font-size:13px;color:var(--muted)}
.cr-ladder b{font-size:26px;font-weight:600;letter-spacing:-.035em;font-variant-numeric:tabular-nums}
.cr-ladder span{font-size:13px;color:var(--ink-2)}
.cr-check{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:0 36px}
.cr-check>div{display:flex;gap:12px;align-items:flex-start;padding:13px 0;border-top:1px solid var(--line);font-size:14px;min-height:56px}
.cr-check b{font-weight:600}
.cr-check small{display:block;font-size:12.5px;color:var(--muted);margin-top:2px}
.cr-tick{flex:none;display:inline-grid;place-items:center;width:22px;height:22px;border-radius:999px;box-shadow:inset 0 0 0 1.5px var(--line-strong);margin-top:1px}
.cr-tick.on{background:var(--good);box-shadow:none}
.cr-tick.on::after{content:"";width:9px;height:5px;border-left:2px solid #fff;border-bottom:2px solid #fff;transform:rotate(-45deg) translateY(-1px)}
.cr-people{display:flex;align-items:center;gap:12px;min-width:0}
.cr-foot{font-size:12.5px;color:var(--muted);line-height:1.5;max-width:90ch}

@media (max-width:1320px){.cr-cell.hide-lg{display:none}}
@media (min-width:760px) and (max-width:1040px){.cr-cell.hide-tab{display:none}}
@media (max-width:1040px){
  .cr-cells{gap:16px}
  .cr-cell.hide-md{display:none}
  .cr-herogrid{grid-template-columns:1fr;gap:28px}
  .cr-offer{grid-template-columns:44px minmax(0,1fr) 150px}
  .cr-offer .st{grid-column:2/-1}
}
@media (max-width:759px){
  .cr-row{grid-template-columns:auto minmax(0,1fr);gap:8px 14px;min-height:0;padding:15px 0;align-items:start}
  .cr-head{display:none}
  .cr-go:empty{display:none}
  .cr-row.nolead{grid-template-columns:minmax(0,1fr)}
  .cr-cells{grid-column:1/-1;flex-wrap:wrap;gap:6px 18px}
  .cr-cell{width:auto;text-align:left!important}
  .cr-cell.hide-sm{display:none}
  .cr-cell small{display:inline;margin-right:5px}
  .cr-go{grid-column:1/-1;justify-content:stretch;flex-wrap:wrap}
  .cr-go .lx-btn{flex:1;height:44px}
  .cr-month{border-radius:16px}
  .cr-dow span{padding:8px 0;text-align:center;font-size:11px}
  .cr-week{grid-template-rows:30px repeat(var(--lanes,4),8px);row-gap:3px;min-height:56px;padding-bottom:6px}
  .cr-day{padding:5px 0;text-align:center}
  .cr-day b{font-size:12px;min-width:22px;height:22px}
  .cr-bar{height:8px;margin:0 3px;padding:0;border-radius:4px;background:var(--faint)}
  .cr-bar span,.cr-bar i{display:none}
  .cr-bar,.cr-bar.good,.cr-bar.warn,.cr-bar.bad{box-shadow:none}
  .cr-bar.good{background:var(--good)}.cr-bar.warn{background:var(--watch)}.cr-bar.bad{background:var(--bad)}
  .cr-bar.mail{background:transparent;box-shadow:inset 0 0 0 1.5px var(--icon)}
  .cr-more{font-size:0;padding:0;justify-self:center;width:4px;height:4px;border-radius:50%;background:var(--muted)}
  .cr-tools .cr-search,.cr-tools .cr-select{flex:1 1 100%;max-width:none}
  .cr-tools .cr-phonesort{display:flex;flex:1 1 100%}
  .cr-tools:not(:has(> :not(.cr-phonesort))){display:flex}
  .cr-nav{width:100%}
  .cr-nav h2{flex:1;min-width:0;font-size:18px}
  .cr-kv{grid-template-columns:110px minmax(0,1fr)}
  .cr-offer{grid-template-columns:36px minmax(0,1fr);gap:8px 12px;padding:18px 0}
  .cr-offer .wh,.cr-offer .st{grid-column:2}
  .cr-offer .n{width:30px;height:30px;font-size:13px}
  .cr-offer.lead .deal{font-size:19px}
  .cr-heroline .big{font-size:24px}
  .cr-ladder{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
  .cr-ladder b{font-size:22px}
  .cr-people{flex-wrap:wrap}
}
`;
