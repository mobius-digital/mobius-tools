/* The shell: side menu, top bar, brand switcher, account menu, bell, the page head (title, date
   range, "updated N min ago", tabs) and the bottom tab bar on a phone.
   It draws once and then only changes what moved. */

import { APP_NAME, APP_WORD, AI_NAME, ORG_NAME, OLD_LOCUS, OLD_UNTIL, LS5, SAMPLE, QS, legacyUrl } from './config.js';
import { mark, icon } from './icons.js';
import { menuFor, lineOf, PHONE_TABS, shownTabs } from './menu.js';
import { h, svgNode, tabs as tabsKit, avatar, count, asOf as asOfChip, sheet, empty, button, rangePicker } from './kit.js';
import { href, normalise, prefetch, currentRoute, currentContext, refresh } from './router.js';
import { heldHere } from './gate.js';
import { RANGES, rangeOf, settingNow, saveSetting } from './data.js';

const S = { me: null, brands: [], role: 'team', realRole: 'team', asClient: false, lastBrand: null, range: rangeOf(null), rangeSaved: null, counts: {} };
let root, rail, top, headTitle, headEyebrow, headAsOf, headRange, headEl, tabsHost, viewEl, tabbar, asBar, onSignOut;
const PALETTE = ['#14532D', '#1E3A8A', '#7C2D12', '#581C87', '#0F766E', '#9F1239', '#3F3A34', '#854D0E', '#155E75', '#4C1D95'];

export const slugOf = id => String(id || '').replace(/^brand_/, '').replace(/_/g, '-');
const colourOf = (b, i) => b.color || PALETTE[[...String(b.id)].reduce((a, c) => a + c.charCodeAt(0), i) % PALETTE.length];
/** The brand marker: a small gray circle with the brand's first letter. No color, so no brand outshouts another.
    brandMark() with no name is the neutral mark for "All brands" (the agency). */
function brandMark(name) {
  const letter = (String(name || '').trim().match(/[A-Za-z0-9]/) || [''])[0].toUpperCase();
  return h('span', { class: 'lx-bmark' + (name ? '' : ' all'), 'aria-hidden': 'true' }, name ? letter || '?' : svgNode(icon('grid')));
}
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };

/** The shell's state, read by the router and passed to every page as ctx. */
export const state = () => S;
export const brandBySlug = slug => S.brands.find(b => b.slug === slug) || null;

export function setData({ me, brands, counts }) {
  S.me = me || {};
  S.realRole = S.me.role === 'client' ? 'client' : S.me.role === 'owner' ? 'owner' : 'team';
  S.role = S.asClient ? 'client' : S.realRole;
  S.brands = (brands || []).map((b, i) => ({ ...b, slug: slugOf(b.id), color: colourOf(b, i) }));
  S.counts = { ...(S.me.counts || {}), ...(counts || {}) };
  S.lastBrand = ls(LS5.brand) || (S.brands[0] && S.brands[0].slug);
  S.rangeSaved = settingNow('range', null);          // the person's own choice, kept on this device
  S.range = rangeOf(S.rangeSaved);
}
/** New counts for the bell, My day or a menu line: setCounts({ bell: 6, myDay: 3 }). Only what changed is redrawn. */
export function setCounts(next) {
  const before = JSON.stringify(S.counts);
  S.counts = { ...S.counts, ...next };
  if (JSON.stringify(S.counts) === before || !root) return;
  const r = currentRoute(); if (!r) return;
  drawRail(r); drawTop(r); drawTabbar(r);
}

/** Build the shell inside `el`. Call once; later data changes go through update(). */
export function mount(el, opts = {}) {
  root = el; onSignOut = opts.onSignOut;
  let kept = false; try { kept = sessionStorage.getItem(LS5.asClient) === '1'; } catch {}
  S.asClient = S.realRole !== 'client' && (QS.get('as') === 'client' || kept);
  S.role = S.asClient ? 'client' : S.realRole;
  rail = h('nav', { class: 'lx-rail', 'aria-label': 'Menu' });
  top = h('header', { class: 'lx-top' });
  headEyebrow = h('span', { class: 'lx-eyebrow', hidden: true });
  headTitle = h('h1');
  headAsOf = h('span', { class: 'lx-asof-slot' });
  headRange = h('span', { class: 'lx-range-slot' });
  tabsHost = h('div', { class: 'lx-tabs-slot' });
  headEl = h('div', { class: 'lx-head' },
    h('div', { class: 'lx-head-row' }, h('div', { class: 'lx-head-t' }, headEyebrow, headTitle), h('span', { class: 'lx-sp' }), h('div', { class: 'lx-head-tools' }, headAsOf, headRange)),
    tabsHost);
  viewEl = h('div', { class: 'lx-view', id: 'lx-view' });
  tabbar = h('nav', { class: 'lx-tabbar', 'aria-label': 'Main' });
  asBar = h('div', { class: 'lx-asbar', hidden: true, role: 'status' });
  const shell = h('div', { class: 'lx-shell' }, rail, h('div', { class: 'lx-main' }, asBar, top, h('main', { class: 'lx-page' }, headEl, viewEl)), tabbar);
  root.replaceChildren(shell);

  /* one listener each: load a page's code when its menu item is hovered, focused or touched */
  const warm = e => { const a = e.target.closest && e.target.closest('a[data-line]'); if (a) prefetch(a.dataset.line, a.dataset.tab); };
  for (const box of [rail, tabbar, tabsHost]) { box.addEventListener('mouseover', warm); box.addEventListener('focusin', warm); box.addEventListener('touchstart', warm, { passive: true }); }
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      if (S.role === 'client') return;
      e.preventDefault(); askHere();
    }
  });
}

/* ---------- Ask in place: the top bar button, Ctrl K and the phone Ask tab ---------- */
/** Opens Ask Locus AI docked on the right (askpanel.js), with the page on screen as its context: title, brand, route,
    dates and the page's own ctx.askContext. It follows the person from page to page while open.
    On the Ask page itself it just puts the cursor in the page's own box. */
export function askContextNow() {
  const route = currentRoute(); if (!route) return null;
  const brand = route.view === 'brand' ? brandBySlug(route.brand) : null;
  const ctx = currentContext();
  /* a page with no date control (ranges: false) sends no dates; a page's own window (ctx.askWindow) wins over the head's */
  return { route, brand, range: ctx && ctx.noRange ? null : S.range, window: ctx && ctx.askWindow ? String(ctx.askWindow) : null,
    title: headTitle ? headTitle.textContent.trim() : '', context: ctx && ctx.askContext ? String(ctx.askContext) : null,
    href: href(normalise({ ...route, line: 'ask', tab: 'index' })) };
}
function askHere() {
  const route = currentRoute(); if (!route) return;
  if (route.line === 'ask') { const f = document.getElementById('lxAskIn'); if (f) f.focus(); else location.hash = href(normalise({ ...route, line: 'ask', tab: 'index' })); return; }
  import('./askpanel.js').then(m => m.openAskPanel({ ...askContextNow(), live: askContextNow }))
    .catch(() => { location.hash = href(normalise({ ...route, line: 'ask', tab: 'index' })); });
}

/* ---------- the page frame: called by the router on every route ---------- */
export function frame(route, line, tab) {
  if (route.view === 'brand' && route.brand !== 'none') { S.lastBrand = route.brand; ls(LS5.brand, route.brand); }
  ls(LS5.view, route.view);
  drawRail(route);
  drawTop(route);
  drawTabbar(route);
  drawAsBar();
  const tabsList = shownTabs(line, S.role);
  headEl.classList.toggle('has-tabs', tabsList.length > 1);
  tabsHost.replaceChildren(tabsList.length > 1 ? tabsKit(tabsList.map(x => ({ id: x.id, label: x.label, href: href({ ...route, tab: x.id }), count: x.id === 'suggestions' && S.counts[line.id] ? S.counts[line.id] : null, team: x.team && S.realRole !== 'client' && !S.asClient })), tab.id) : '');
  tabsHost.querySelectorAll('a[data-tab]').forEach(a => { a.dataset.line = line.id; });
  const on = tabsHost.querySelector('a.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const api = {
    el: viewEl,
    /** The page title: the plain question from the page. content is text or nodes (use em() for the serif phrase).
        eyebrow is the small line above it. With nothing given, the menu line's name shows. */
    setTitle(content, { eyebrow } = {}) {
      const kids = content == null || content === '' ? [line.label] : [].concat(content);
      headTitle.replaceChildren(...kids.filter(k => k != null && k !== false).map(k => k.nodeType ? k : document.createTextNode(String(k))));
      headEyebrow.textContent = eyebrow || ''; headEyebrow.hidden = !eyebrow;
    },
    /** "updated 4 min ago", drawn here for every page. busy shows the quiet dot while fresh numbers are on the way. */
    setAsOf(ts, busy) { const c = ts ? asOfChip(ts) : busy ? h('span', { class: 'lx-asof' }, 'getting the numbers') : null; if (c && busy) c.classList.add('busy'); headAsOf.replaceChildren(c || ''); },
    /** The date range control. A page that cannot honor it says ranges: false and the control hides. */
    setRanges(show) { headRange.replaceChildren(show ? rangeButton() : ''); },
  };
  api.setTitle(null);
  return api;
}

/* ---------- the date range ---------- */
function rangeButton() {
  return h('button', { class: 'lx-btn quiet lx-range', type: 'button', 'aria-haspopup': 'menu', 'aria-label': 'Dates, now ' + S.range.label + ', ' + S.range.dates, title: S.range.dates,
    onclick: e => rangeMenu(e.currentTarget) }, svgNode(icon('month')), h('span', null, S.range.label), svgNode(icon('chevron')));
}
function setRange(saved) {
  S.rangeSaved = saved; S.range = rangeOf(saved);
  saveSetting('range', saved).catch(() => {});       // a local key: kept per person on this device
  refresh();
}
function rangeMenu(anchor) {
  const now = S.range;
  const items = RANGES.map(r => {
    const d = r.id === 'custom' ? null : rangeOf({ preset: r.id });
    return h('button', { class: 'lx-item' + (now.preset === r.id ? ' on' : ''), role: 'menuitemradio', 'aria-checked': String(now.preset === r.id), type: 'button', 'data-close': r.id === 'custom' ? null : '1',
      onclick: () => { if (r.id === 'custom') customDates(anchor); else setRange({ preset: r.id }); } },
      r.label, h('small', null, d ? d.dates : now.preset === 'custom' ? now.dates : 'pick on a calendar'));
  });
  popover(anchor, items, { align: 'right', label: 'Dates', width: 300, class: 'lx-range-pop' });
}
/* Custom: the Locus calendar in the same spot (two months on a desktop, one on a phone). Never a native date input. */
function customDates(anchor) {
  const now = S.range, latest = rangeOf({ preset: 'today' }).to;
  const pick = rangePicker({
    from: now.preset === 'custom' ? now.from : null, to: now.preset === 'custom' ? now.to : null, max: latest,
    onApply: v => { closePop(); setRange({ preset: 'custom', from: v.from, to: v.to }); },
    onCancel: () => closePop(),
  });
  setTimeout(() => popover(anchor, [pick], { align: 'right', label: 'Pick dates', role: 'dialog', width: 608, class: 'lx-range-pop' }), 0);
}

/* ---------- side menu ---------- */
function navLink(route, l) {
  const tab = l.tabs[0].id;
  const n = S.role === 'client' ? 0 : S.counts[l.id];           // the counts are the team's to-do, never the client's
  return h('a', { class: 'lx-nav' + (l.icon && ['meta', 'google', 'tiktok', 'amazon'].includes(l.icon) ? ' plat' : '') + (l.gap ? ' gap' : '') + (l.workshop ? ' wsl' : '') + (route.line === l.id ? ' on' : ''),
    href: href(normalise({ view: route.view, brand: route.brand, line: l.id, tab })), title: l.label, 'aria-current': route.line === l.id ? 'page' : null, dataset: { line: l.id, tab } },
    svgNode(icon(l.icon)), h('span', { class: 't' }, l.label), l.note && h('span', { class: 'note' }, l.note), l.workshop ? h('span', { class: 'ws', title: 'In the workshop: being built', 'aria-label': 'In the workshop' }, svgNode(icon('wrench'))) : null, n ? h('span', { class: 'n' }, n) : null);
}
function menuNodes(route) {
  /* a client still on setup has one line: Get started (their profile is in the account menu) */
  if (heldHere(S, route)) return [navLink(route, lineOf('get-started'))];
  const out = [];
  for (const g of menuFor(route.view, S.role)) {
    if (g.foot) out.push(h('span', { class: 'lx-sp' }));
    else if (g.group) out.push(h('div', { class: 'lx-grp' }, g.group));
    g.lines.forEach((l, i) => { const a = navLink(route, l); if (i === 0 && g.group) a.dataset.first = '1'; out.push(a); });
  }
  return out;
}
let railKey = '';
function drawRail(route) {
  const key = [route.view, route.brand, S.role, JSON.stringify(S.counts), heldHere(S, route)].join('|');
  if (key === railKey) {            // same menu: only the active marker moves
    rail.querySelectorAll('.lx-nav').forEach(a => { const on = a.dataset.line === route.line; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
    return;
  }
  railKey = key;
  const keep = rail.scrollTop;
  rail.replaceChildren(h('a', { class: 'lx-logo', href: href(normalise({ view: route.view, brand: route.brand })), 'aria-label': APP_NAME + ' home' }, svgNode(mark(28)), h('b', null, APP_WORD)), ...menuNodes(route));
  rail.scrollTop = keep;
}

/* ---------- top bar ---------- */
let topKey = '';
function drawTop(route) {
  const brand = route.view === 'brand' ? brandBySlug(route.brand) : null;
  const key = [route.view, route.brand, S.role, S.asClient, S.brands.length, S.me.email, S.me.photo || S.me.picture, S.counts.myDay, S.counts.bell].join('|');
  if (key === topKey) return;
  topKey = key;
  const team = S.role !== 'client';
  const kids = [svgNode(mark(26))];
  const canSwitch = S.asClient ? false : S.brands.length > 1 || S.realRole !== 'client';
  const label = route.view === 'agency' ? [brandMark(), 'All brands'] : [brandMark(brand ? brand.name : '?'), brand ? brand.name : 'No brand yet'];
  kids.push(canSwitch
    ? h('button', { class: 'lx-btn lx-switch', type: 'button', 'aria-haspopup': 'menu', 'aria-label': 'Switch brand, now ' + (brand ? brand.name : 'All brands'), onclick: e => brandMenu(e.currentTarget, route) }, label, svgNode(icon('chevron')))
    : h('span', { class: 'lx-btn lx-switch still' }, label));
  if (S.realRole !== 'client' && route.view === 'brand' && !S.asClient) {
    kids.push(h('button', { class: 'lx-btn quiet lx-seeas', type: 'button', title: 'See as client', onclick: () => seeAs(true) }, svgNode(icon('eye')), 'See as client'));
  }
  kids.push(h('span', { class: 'lx-sp' }));
  if (SAMPLE) kids.push(h('span', { class: 'lx-chip', title: 'These are sample numbers, not a real brand' }, 'Sample numbers'));
  if (team) {
    kids.push(h('button', { class: 'lx-ask', type: 'button', 'aria-haspopup': 'dialog', title: 'Ask ' + AI_NAME + ' about this page (Ctrl K)', onclick: () => askHere() }, svgNode(icon('sparkle')), 'Ask ' + AI_NAME, h('kbd', null, 'Ctrl K')));
    kids.push(h('a', { class: 'lx-btn lx-myday', href: href(normalise({ ...route, line: 'my-day', tab: 'index' })), dataset: { line: 'my-day', tab: 'index' } }, 'My day', S.counts.myDay ? count(S.counts.myDay, 'ink sm') : null));
  }
  const bellN = S.asClient ? 0 : S.counts.bell;
  kids.push(h('button', { class: 'lx-btn lx-bell', type: 'button', 'aria-haspopup': 'dialog', 'aria-label': bellN ? `Notifications, ${bellN} need you` : 'Notifications', title: bellN ? `Notifications: ${bellN} need you` : 'Notifications', onclick: e => bellPanel(e.currentTarget, route) },
    svgNode(icon('bell')), bellN ? count(bellN, 'ink') : null));
  const who = S.asClient ? { name: brand ? brand.name : 'Client' } : { ...S.me, name: S.me.name || nameFrom(S.me.email) };
  const btn = h('button', { class: 'lx-avatar', type: 'button', 'aria-haspopup': 'menu', 'aria-label': 'Account menu for ' + who.name, title: 'Your account: profile, old ' + APP_NAME + ', sign out', onclick: e => accountMenu(e.currentTarget, route, who) });
  btn.append(...avatar(who).childNodes);
  kids.push(btn);
  top.replaceChildren(...kids);
  for (const a of top.querySelectorAll('a[data-line]')) a.addEventListener('mouseover', () => prefetch(a.dataset.line, a.dataset.tab));
}
const nameFrom = email => (email || 'You').split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/* "See as client": the WHOLE shell becomes the client's (menu, top bar, phone tabs, every page) until
   switched back. A bar across the top says so on every screen size, with the way back. */
function seeAs(on) {
  S.asClient = on; S.role = on ? 'client' : S.realRole;
  try { on ? sessionStorage.setItem(LS5.asClient, '1') : sessionStorage.removeItem(LS5.asClient); } catch {}
  railKey = topKey = tabKey = '';
  refresh();
}
function drawAsBar() {
  asBar.hidden = !S.asClient;
  if (S.asClient && !asBar.firstChild) asBar.append(svgNode(icon('eye')), h('span', null, 'You are seeing what the client sees'), h('button', { class: 'lx-btn', type: 'button', onclick: () => seeAs(false) }, 'Back to team view'));
}

/* ---------- popovers ---------- */
let openPop = null;
function closePop() { if (openPop) { openPop.pop.remove(); openPop.scrim.remove(); document.removeEventListener('keydown', openPop.key); const a = openPop.anchor; openPop = null; a && a.focus && a.focus(); } }
function popover(anchor, kids, { align = 'left', width, label, role = 'menu', class: cls } = {}) {
  closePop();
  const pop = h('div', { class: 'lx-pop' + (cls ? ' ' + cls : ''), role, 'aria-label': label || 'Menu', style: width ? { width: width + 'px' } : null }, kids);
  const scrim = h('div', { class: 'lx-scrim', onclick: closePop });
  const key = e => { if (e.key === 'Escape') closePop(); };
  document.body.append(scrim, pop);
  const r = anchor.getBoundingClientRect(), w = pop.offsetWidth;       // read first, then write
  const left = align === 'right' ? Math.max(12, r.right - w) : Math.min(r.left, window.innerWidth - w - 12);
  pop.style.top = (r.bottom + window.scrollY + 8) + 'px';
  pop.style.left = (left + window.scrollX) + 'px';
  document.addEventListener('keydown', key);
  openPop = { pop, scrim, key, anchor };
  pop.addEventListener('click', e => { if (e.target.closest('a,button[data-close]')) setTimeout(closePop, 0); });
  const first = pop.querySelector('a,button'); if (first) first.focus({ preventScroll: true });
  return pop;
}

function brandMenu(anchor, route) {
  const items = [];
  if (S.realRole !== 'client' && !S.asClient) {
    items.push(h('a', { class: 'lx-item' + (route.view === 'agency' ? ' on' : ''), role: 'menuitem', href: href(normalise({ view: 'agency', line: 'a-today' })) }, brandMark(), 'All brands', h('small', null, 'the agency')));
    items.push(h('hr'));
  }
  if (!S.brands.length) items.push(empty({ title: 'No brands yet', text: 'A brand shows here once it is added.' }));
  const keepLine = route.view === 'brand' ? { line: route.line, tab: route.tab } : { line: 'home' };
  for (const b of S.brands) {
    items.push(h('a', { class: 'lx-item' + (route.view === 'brand' && route.brand === b.slug ? ' on' : ''), role: 'menuitem', href: href(normalise({ view: 'brand', brand: b.slug, ...keepLine })) },
      brandMark(b.name), b.name, b.status && b.status !== 'active' ? h('small', null, b.status) : null));
  }
  popover(anchor, items, { label: 'Brands', width: 280 });
}

function accountMenu(anchor, route, who) {
  const line = lineOf(route.line), tab = line && line.tabs.find(x => x.id === route.tab);
  const brand = route.view === 'brand' ? brandBySlug(route.brand) : null;
  const old = (tab && legacyUrl(tab.legacy, brand ? brand.id : 'all')) || OLD_LOCUS;
  popover(anchor, [
    h('div', { class: 'lx-pop-h' }, h('b', null, who.name), h('span', null, S.asClient ? 'Seeing what the client sees' : S.realRole === 'client' ? (who.email || '') : ORG_NAME)),
    h('hr'),
    S.asClient ? h('button', { class: 'lx-item', role: 'menuitem', type: 'button', 'data-close': '1', onclick: () => seeAs(false) }, svgNode(icon('eye')), 'Back to team view')
      : h('a', { class: 'lx-item', role: 'menuitem', href: href(normalise({ ...route, line: 'profile', tab: 'index' })) }, svgNode(icon('customers')), 'Your profile'),
    h('a', { class: 'lx-item', role: 'menuitem', href: old }, svgNode(icon('swap')), 'Old ' + APP_NAME, h('small', null, OLD_UNTIL)),
    S.asClient ? null : h('button', { class: 'lx-item', role: 'menuitem', type: 'button', 'data-close': '1', onclick: () => onSignOut && onSignOut() }, svgNode(icon('signout')), 'Sign out'),
  ], { align: 'right', label: 'Account', width: 240 });
}

/* ---------- the bell: Needs you, Watching, Done today ----------
   The rows come from bell.js (loaded on the first open, or by app.js for the count):
   the notifications fixture in sample mode, the My work list in real mode. */
let bellTab = 'needs';
const BELL_TABS = [['needs', 'Needs you'], ['watching', 'Watching'], ['done', 'Done today']];
const BELL_EMPTY = {
  needs: ['Nothing needs you', 'When something is waiting on a yes, a no or a look from you, it shows here.'],
  watching: ['Nothing to watch', 'Things you handed to someone else show here until they are done.'],
  done: ['Nothing ticked off yet today', 'What you finish today is listed here.'],
};
function bellRow(r, route, lead) {
  const text = [].concat(r.text || '').map(p => (p && typeof p === 'object' ? h('b', null, p.b) : p));
  const b = r.btn;
  const link = b && (b.href || (b.line ? href(normalise({ view: route.view, brand: route.brand, line: b.line, tab: b.tab })) : null));
  return h('div', { class: 'lx-bell-row' + (r.urgent ? ' urgent' : '') },
    r.who ? avatar(r.who, { size: 38 }) : h('span', { class: 'lx-bell-mark', role: 'img', 'aria-label': APP_NAME }, svgNode(mark(18))),
    h('div', { class: 't' }, h('p', null, text), h('span', { class: 'm' }, [r.brand && h('b', null, r.brand), r.by, r.when].filter(Boolean).flatMap((x, i) => (i ? [h('i'), x] : [x])))),
    b && link ? button(b.label, { href: link, target: b.href && /^https?:/.test(b.href) ? '_blank' : null, primary: !!(lead && b.primary) }) : null);
}
async function bellPanel(anchor, route) {
  const body = h('div', { class: 'lx-bell-body' }, h('p', { class: 'lx-bell-wait' }, 'Getting your notifications'));
  const tabsRow = h('div', { class: 'lx-bell-tabs', role: 'tablist' });
  const client = S.role === 'client';
  const pop = popover(anchor, [
    h('div', { class: 'lx-bell-h' }, h('h2', null, 'Notifications'), S.asClient ? null : h('a', { href: href(normalise({ ...route, line: 'profile', tab: 'delivery' })) }, 'Settings')),
    tabsRow, body,
    h('div', { class: 'lx-bell-f' }, h('span', null, client ? (brandBySlug(route.brand) || {}).name || '' : 'All brands'),
      client ? null : h('a', { href: href(normalise({ ...route, line: 'my-day', tab: 'index' })) }, 'Open My day', svgNode(icon('arrow')))),
  ], { align: 'right', label: 'Notifications', width: 468, role: 'dialog', class: 'lx-bell-pop' });
  let data = null;
  const paint = () => {
    tabsRow.replaceChildren(...BELL_TABS.map(([id, label]) => h('button', { type: 'button', role: 'tab', class: id === bellTab ? 'on' : '', 'aria-selected': String(id === bellTab), onclick: () => { bellTab = id; paint(); } },
      label, data ? h('span', { class: 'n' }, (data[id] || []).length) : null)));
    if (!data) return;
    const rows = data[bellTab] || [];
    body.replaceChildren(...(rows.length ? rows.map((r, i) => bellRow(r, route, bellTab === 'needs' && i === 0)) : [h('div', { class: 'lx-bell-none' }, h('b', null, BELL_EMPTY[bellTab][0]), h('span', null, data.error || BELL_EMPTY[bellTab][1]))]));
  };
  paint();
  try {
    const m = await import('./bell.js');
    data = await m.loadBell({ me: S.me, role: S.role, asClient: S.asClient, brand: brandBySlug(route.brand), brands: S.brands });
  } catch (e) { data = { needs: [], watching: [], done: [], error: 'Notifications could not be read just now.' }; }
  if (!pop.isConnected) return;
  if (!S.asClient) setCounts({ bell: data.needs.length });
  paint();
}

/* ---------- phone: five tabs at the bottom, the rest under More ---------- */
let tabKey = '';
function drawTabbar(route) {
  const set = heldHere(S, route) ? PHONE_TABS.setup : S.role === 'client' ? PHONE_TABS.client : route.view === 'agency' ? PHONE_TABS.agency : PHONE_TABS.team;
  const active = (set.find(t => t.line === route.line) || (['meta', 'google', 'tiktok', 'amazon', 'a-meta', 'a-google'].includes(route.line) ? set[1] : null) || {}).id;
  const key = [route.view, route.brand, S.role, active, S.counts.myDay, heldHere(S, route)].join('|');
  if (key === tabKey) return;
  tabKey = key;
  tabbar.replaceChildren(...set.map(t => {
    const kids = [h('span', { class: 'badge' }, svgNode(icon(t.icon)), t.id === 'my-day' && S.counts.myDay ? count(S.counts.myDay, 'ink') : null), t.label];
    if (t.more) return h('button', { type: 'button', 'aria-haspopup': 'dialog', onclick: () => moreSheet(currentRoute() || route) }, kids);
    if (t.ask) return h('button', { type: 'button', class: 'ask', 'aria-haspopup': 'dialog', 'aria-label': 'Ask ' + AI_NAME + ' about this page', onclick: () => askHere() }, kids);
    return h('a', { class: (t.ask ? 'ask ' : '') + (t.id === active ? 'on' : ''), href: href(normalise({ view: route.view, brand: route.brand, line: t.line })), 'aria-current': t.id === active ? 'page' : null, dataset: { line: t.line } }, kids);
  }));
}
function moreSheet(route) {
  const brand = route.view === 'brand' ? brandBySlug(route.brand) : null;
  const body = h('div', { class: 'lx-more' }, menuNodes(route).filter(n => !n.classList.contains('lx-sp')));
  if (S.realRole !== 'client' && route.view === 'brand') {
    body.append(h('div', { class: 'lx-grp' }, 'View'), h('button', { class: 'lx-nav', type: 'button', onclick: () => { sh.close(); seeAs(!S.asClient); } }, svgNode(icon('eye')), S.asClient ? 'Back to team view' : 'See as client'));
  }
  const sh = sheet({ title: route.view === 'agency' ? 'All brands' : brand ? brand.name : 'Menu', body, side: 'bottom' });
  body.addEventListener('click', e => { if (e.target.closest('a')) sh.close(); });
}

/** The menus changed (an agency feature switch, menu.js setFeatures): draw the side menu, the More sheet and the
    phone tabs again, on the page that is open. */
export function redrawMenu() {
  railKey = topKey = tabKey = '';
  const r = currentRoute();
  if (!root || !r) return;
  drawRail(r); drawTop(r); drawTabbar(r);
}

/** After new data (brands, me, counts): redraw whatever depends on it. */
export function update(data) {
  setData(data);
  railKey = topKey = tabKey = '';
  refresh();
}
