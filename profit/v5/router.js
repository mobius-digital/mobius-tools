/* Routing and the page life cycle.
   Address:  /v5/#/<view>/<brand>/<line>/<tab>
     view   brand | agency
     brand  the brand slug (northlake-golf), or all in the agency view
     line   a main menu line id from menu.js
     tab    one of that line's tab ids (index when the line has no sub pages)
   A page module lives at pages/<line>/<tab>.js and is loaded with import() only when visited.
   No module at that path = the shared "Coming" page. */

import { SAMPLE, cached, getSaved, putSaved, pageKey, fixture, api, STALE_MS, setting, settingNow, saveSetting } from './data.js';
import { lineOf, viewOf, menuFor } from './menu.js';
import { legacyUrl, LS5, APP_NAME } from './config.js';
import { gateOf, gateRoute, heldBrand } from './gate.js';
import { seesWorkshop, lineLive, tabsFor, canOpen, renderBuilding } from './workshop.js';

let host = null;          // { state(), frame(route, line, tab), brandBySlug(slug) } from the shell
let current = null;       // the route on screen
let ticket = 0;           // a slow page never paints over the one you moved to
let shownAt = 0;
const MODS = new Map();

export const parse = hash => {
  const p = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (p[0] === 'signin') return { signin: true };
  return { view: p[0], brand: p[1], line: p[2], tab: p[3] };
};
export const href = r => '#/' + [r.view, r.brand, r.line, r.tab || 'index'].map(encodeURIComponent).join('/');
export const currentRoute = () => current;
let currentCtx = null;
/** The ctx of the page on screen (the Ask panel reads ctx.askContext from it, live). */
export const currentContext = () => currentCtx;

/** Go to a route. go({ line: 'meta', tab: 'top-ads' }) keeps the view and brand you are in. */
export function go(r, { replace = false } = {}) {
  const next = href(normalise({ ...(current || {}), tab: undefined, ...r }));
  if (replace) history.replaceState(null, '', next); else location.hash = next;
  if (replace) onHash();
}

/* The new client gate lives in gate.js (per brand; shell.js and app.js read it too). */
export { gateOf };

/** Make any address a valid one for this person: a view they may see, a brand they have, a real line and tab. */
export function normalise(r) {
  const st = host.state();
  const role = st.role;
  /* a gated client sees Get started and their profile for a brand still being set up; a brand already running stays open */
  const gate = gateOf(st);
  if (gate) r = gateRoute(r, gate);
  let line = lineOf(r.line);
  let view = r.view === 'agency' && role !== 'client' ? 'agency' : 'brand';
  if (line) { const v = viewOf(line.id); if (v && !(v === 'agency' && role === 'client')) view = v; }
  /* every line, even one whose agency feature is off: it leaves the menu, but its page still opens by its address */
  const menu = menuFor(view, role, { allFeatures: true, workshop: true }).flatMap(g => g.lines);
  const top = line && line.top && (line.who === 'all' || role !== 'client');
  /* no line asked for: the owner lands where they always did, anyone else on the first live line (workshop.js).
     A workshop line asked for with no tab is a button of the shell (the brand switcher, the phone tabs), not a typed
     address: it goes to the first live line too, so switching brands never ends on "being built". */
  if (!line || !(top || menu.some(l => l.id === line.id)) || (!r.tab && !seesWorkshop(role) && !lineLive(line.id))) line = seesWorkshop(role) ? menu[0] : menuFor(view, role, { allFeatures: true }).flatMap(g => g.lines).find(l => lineLive(l.id)) || menu[0];
  const tabs = tabsFor(line, role).filter(x => role !== 'client' || !x.team);
  const tab = tabs.find(x => x.id === r.tab) || tabs[0];
  let brand = 'all';
  if (view === 'brand') {
    const b = host.brandBySlug(r.brand) || host.brandBySlug(st.lastBrand) || st.brands[0];
    brand = b ? b.slug : 'none';
  }
  /* the brand picked above (the last one, or the first) can be one still being set up */
  if (gate && view === 'brand' && line.id !== 'profile' && line.id !== 'get-started' && heldBrand(gate, brand)) return { view: 'brand', brand, line: 'get-started', tab: 'index' };
  return { view, brand, line: line.id, tab: tab.id };
}

function importPage(line, tab) {
  const key = line + '/' + tab;
  if (!MODS.has(key)) MODS.set(key, import(`./pages/${line}/${tab}.js`).then(m => m.default || null, () => null));
  return MODS.get(key);
}
const coming = () => import('./pages/_coming.js').then(m => m.default);

function ctxFor(route, line, tab, signal, frame) {
  const st = host.state();
  const brand = route.view === 'brand' ? host.brandBySlug(route.brand) : null;
  return {
    route, view: route.view, line, tab, brand, brands: st.brands, me: st.me, role: st.role,
    /** True for a client, and for the team while "See as client" is on. Team-only words and links must check this. */
    isClient: st.role === 'client',
    /** True only while the team has "See as client" on. A real client login is isClient && !asClient. */
    asClient: !!st.asClient,
    sample: SAMPLE, signal,
    /** The dates in the page head: { preset, label, from, to, days, dates }. Always real dates. */
    range: st.range,
    api, cached,
    /** Settings, wherever they live: await ctx.setting('agency.morningHour', 5), ctx.settingNow('me.tab', 'a'), await ctx.saveSetting(key, value) */
    setting, settingNow, saveSetting,
    /** A fixture in this line's folder: ctx.fixture('extra.json') reads pages/<line>/_sample/extra.json */
    fixture: name => fixture(`${line.id}/_sample/${name}`),
    /** The address of another page in the same view and brand. */
    href: (lineId, tabId) => href(normalise({ view: route.view, brand: route.brand, line: lineId, tab: tabId })),
    go,
    /** Change the page title from inside the page (a brand picked inside the page): ctx.setTitle(['Northlake Golf, ', em('Nov 16 to 22')], { eyebrow }) */
    setTitle: (content, opts) => frame.setTitle(content, opts),
    /** This page in old Locus, or null. */
    legacy: legacyUrl(tab.legacy, brand ? brand.id : 'all'),
    title: tab.label ? `${line.label}: ${tab.label}` : line.label,
    /** A page may set ctx.askContext = 'one or two plain sentences of what this page shows now'. Ask Locus AI sends
        it with every question asked from this page (askpanel.js). Leave it unset and only the title, route, brand
        and dates go. */
    askContext: null,
    /** A page may set ctx.askWindow = 'Nov 17 to 23', the real window of its numbers, when that is not the head's dates. */
    askWindow: null,
    /** true on a page that says ranges: false (set by the router); Ask then sends no dates. */
    noRange: false,
  };
}
const SAMPLE_AGE = 4 * 60e3;       // a fixture reads "updated 4 min ago"

let ctl = null;
async function show(route, { soft = false, fresh = false } = {}) {
  const my = ++ticket;
  if (ctl) ctl.abort();
  ctl = new AbortController();
  const line = lineOf(route.line), tab = line.tabs.find(x => x.id === route.tab) || line.tabs[0];
  const frame = host.frame(route, line, tab);          // rail, title and tabs change at once
  const ctx = ctxFor(route, line, tab, ctl.signal, frame);
  currentCtx = ctx;
  document.title = `${ctx.title} · ${APP_NAME}`;
  /* a page in the workshop, for anyone but the owner: "being built", no page code, no data call (and never the page the app reopens on) */
  if (canOpen(ctx.role, line.id, tab.id)) { try { localStorage.setItem(LS5.last, href(route)); } catch {} }
  else { frame.setRanges(false); frame.setAsOf(null); frame.setTitle(null); renderBuilding(frame.el, ctx); if (!soft) scrollTop(); return; }
  const mod = await importPage(line.id, tab.id);
  if (my !== ticket) return;
  const el = frame.el;
  const val = (v, data) => typeof v === 'function' ? v(ctx, data) : v;
  /* the title and the small line above it come from the page: text, nodes, or (ctx, data) => either */
  const head = (m, data) => frame.setTitle(val(m.title, data), { eyebrow: val(m.eyebrow, data) });
  const paint = (m, data, method = 'render') => { if (my !== ticket) return; head(m, data); if (method === 'render') el.replaceChildren(); dataWindow(m, data); (m[method] || m.render)(el, data, ctx); };
  /* the Ask panel gets the window the numbers really cover (data.window or data.range) unless the page sets its own */
  const dataWindow = (m, data) => {
    if (m.ranges === false || !data || typeof data !== 'object') return;
    const w = data.window || data.range;
    if (!w || typeof w !== 'object') return;
    const md = v => { const d = new Date(v + 'T12:00:00'); return isNaN(d) ? null : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
    const f = w.from && md(w.from), t = w.to && md(w.to);
    const lab = f && t ? (f === t ? f : f.slice(0, 3) === t.slice(0, 3) ? `${f} to ${t.slice(4)}` : `${f} to ${t}`) : typeof w.label === 'string' ? w.label : null;
    if (lab) ctx.askWindow = lab;
  };
  if (!mod) { frame.setRanges(false); frame.setAsOf(null); const c = await coming(); if (my !== ticket) return; frame.setTitle(null); el.replaceChildren(); c.render(el, null, ctx); if (!soft) scrollTop(); return; }
  const ranged = mod.ranges !== false;
  ctx.noRange = !ranged;
  /* a page that draws its own freshness stamp says stamp: false, and the head's copy stays empty */
  const asOf = mod.stamp === false ? () => frame.setAsOf(null) : (ts, busy) => frame.setAsOf(ts, busy);
  frame.setRanges(ranged);
  head(mod, null);
  /* one stamp for every page: a page may say when its numbers were read (asOf), else it is when they were fetched */
  const stamp = (data, at) => asOf((mod.asOf && mod.asOf(data)) || at || null);
  try {
    const still = SAMPLE ? (mod.sample === null || (mod.sample === undefined && !mod.load)) : !mod.load;   // a page with no data
    if (still) { paint(mod, null); asOf(null); }
    else if (SAMPLE) {
      const data = typeof mod.sample === 'function' ? await mod.sample(ctx) : mod.sample !== undefined ? mod.sample : await fixture(`${line.id}/_sample/${tab.id}.json`);
      paint(mod, data); stamp(data, Date.now() - SAMPLE_AGE);
    } else {
      /* the dates are part of the key only for a page that honors them, so the others keep one saved copy */
      const key = pageKey({ view: route.view, brandId: ctx.brand ? ctx.brand.id : 'all', line: line.id, tab: tab.id, range: ranged ? ctx.range : null, client: ctx.isClient });
      /* After a write: read the page again before drawing, so the saved copy from before the write never comes back.
         The screen keeps what the write already drew until the new answer lands. If the read fails, fall through. */
      if (fresh) {
        let data = null, got = false;
        try { data = await mod.load(ctx); got = true; } catch (e) { if (e && e.name === 'AbortError') return; }
        if (my !== ticket) return;
        if (got) {
          const rec = await putSaved(key, data);
          if (my !== ticket) return;
          paint(mod, data); stamp(data, rec.asOf); shownAt = rec.asOf;
          return;
        }
      }
      const saved = await getSaved(key);
      if (my !== ticket) return;
      if (!saved) { el.replaceChildren(); (mod.skeleton || defaultSkeleton)(el, ctx); asOf(null, true); }   // first ever visit only
      else asOf(saved.asOf, Date.now() - saved.asOf > 20e3);
      const onFresh = rec => { if (my !== ticket) return; paint(mod, rec.data, mod.update ? 'update' : 'render'); stamp(rec.data, rec.asOf); shownAt = rec.asOf; };
      onFresh.touch = at => { if (my === ticket) { asOf(at); shownAt = at; } };
      onFresh.error = () => { if (my === ticket) asOf(saved ? saved.asOf : null); };
      const rec = await cached(key, () => mod.load(ctx), onFresh);
      if (my !== ticket) return;
      paint(mod, rec.data);
      if (rec.fresh) stamp(rec.data, rec.asOf);
      shownAt = rec.asOf;
    }
  } catch (e) {
    if (my !== ticket || (e && e.name === 'AbortError')) return;
    (await coming()).error(el, e, ctx, () => show(route));
    asOf(null);
  }
  if (!soft) scrollTop();
}
function scrollTop() { try { window.scrollTo(0, 0); } catch {} }
function defaultSkeleton(el) {
  el.innerHTML = '<div class="lx-skel-grid"><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div></div><div class="lx-skel chart"></div>';
}

/** Load a page's code before the click (menu hover, focus or touch). */
export function prefetch(lineId, tabId) {
  const line = lineOf(lineId); if (!line) return;
  importPage(line.id, tabId || line.tabs[0].id);
}

function onHash() {
  const raw = parse(location.hash);
  if (raw.signin) { host.signin(); current = null; return; }
  const route = normalise(raw);
  const want = href(route);
  if (location.hash !== want) { history.replaceState(null, '', want); }
  const same = current && href(current) === want;
  current = route;
  show(route, { soft: same });
}

/** Start routing. The shell passes itself in as the host. */
export function start(shellHost) {
  host = shellHost;
  window.addEventListener('hashchange', onHash);
  /* Events, not timers: refresh when the tab comes back and the copy on screen is older than 5 minutes. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && current && !SAMPLE && shownAt && Date.now() - shownAt > STALE_MS) show(current, { soft: true });
  });
  if (!location.hash || location.hash === '#' || location.hash === '#/') {
    let last = null; try { last = localStorage.getItem(LS5.last); } catch {}
    /* a page kept from before it went into the workshop is not where the team starts */
    if (last) { const p = parse(last); if (!canOpen(host.state().role, p.line, p.tab)) last = null; }
    history.replaceState(null, '', last && !SAMPLE ? last : href(normalise({})));
  }
  onHash();
}
/** Draw the page on screen again (after the brand list or the role changed). */
export function refresh({ fresh = false } = {}) { if (current) { current = normalise(current); history.replaceState(null, '', href(current)); show(current, { soft: true, fresh }); } }
