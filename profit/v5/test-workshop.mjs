// node test-workshop.mjs (from profit/v5). No DOM, no network.
// workshop.js + menu.js + router.js: the team sees only the live pages, the owner sees everything with the
// Workshop group, a workshop address shows "being built" to the team with no data call, and a live line's
// other tabs open its first live tab.
import assert from 'node:assert/strict';

/* ---------- a tiny browser ---------- */
const store = new Map();
const mem = () => ({ getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) });
globalThis.location = { search: '', hostname: 'localhost', hash: '', pathname: '/' };
globalThis.localStorage = mem();
globalThis.sessionStorage = mem();
const handlers = {};
/* the first hashchange listener is the router's (start() below); keep it */
globalThis.window = { addEventListener: (t, f) => { handlers[t] = handlers[t] || f; }, dispatchEvent() {}, scrollTo() {} };
const node = () => ({ className: '', textContent: '', kids: [], append(...k) { this.kids.push(...k); }, replaceChildren(...k) { this.kids = k; } });
globalThis.document = { title: '', visibilityState: 'visible', addEventListener() {}, createElement: node };
globalThis.history = { replaceState: (_s, _t, u) => { location.hash = u; } };
let fetched = 0;
globalThis.fetch = async () => { fetched++; throw new Error('no network in this test'); };

const W = await import('./workshop.js');
const menu = await import('./menu.js');
const router = await import('./router.js');

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('ok  ' + name); };
const lines = (view, role) => menu.menuFor(view, role).flatMap(g => g.lines.map(l => l.id));
const groups = (view, role) => menu.menuFor(view, role).map(g => g.group);

/* ---------- the host the shell would be ---------- */
const S = { role: 'team', me: { role: 'team' }, brands: [{ id: 'brand_northlake', name: 'Northlake Golf', slug: 'northlake' }], lastBrand: 'northlake', range: {} };
let drawn = null;
const host = {
  state: () => S,
  brandBySlug: slug => S.brands.find(b => b.slug === slug) || null,
  frame: (route, line, tab) => (drawn = { route, line, tab, el: node(), setTitle() {}, setRanges() {}, setAsOf() {} }),
  signin() {},
};
const as = role => { S.role = role; S.me = { role }; };

/* ---------- the list ---------- */
await ok('every LIVE line and tab is a real route', () => {
  const routes = menu.allRoutes();
  for (const [line, tabs] of Object.entries(W.LIVE)) for (const tab of tabs) assert.ok(routes.some(r => r.line === line && r.tab === tab), `${line}/${tab}`);
});

/* ---------- menus ---------- */
await ok('team sees only live lines, brand view', () => {
  as('team');
  assert.deepEqual(lines('brand', 'team'), ['meta', 'production', 'black-friday', 'reports']);
  assert.equal(groups('brand', 'team').includes(W.WORKSHOP_GROUP), false);
});
await ok('team sees only live lines, agency view', () => {
  assert.deepEqual(lines('agency', 'team'), ['a-meta', 'a-production', 'a-black-friday', 'a-to-send']);
});
await ok('team sees only live tabs on a live line', () => {
  const meta = menu.menuFor('brand', 'team').flatMap(g => g.lines).find(l => l.id === 'meta');
  assert.deepEqual(meta.tabs.map(t => t.id), ['suggestions', 'changes']);
  assert.deepEqual(menu.shownTabs(menu.lineOf('meta'), 'team').map(t => t.id), ['suggestions', 'changes']);
  assert.deepEqual(menu.shownTabs(menu.lineOf('profile'), 'team').map(t => t.id), ['delivery']);
  /* the War Room's plan stays a hidden route, never a tab */
  assert.deepEqual(menu.shownTabs(menu.lineOf('black-friday'), 'team').map(t => t.id), ['war-room']);
});
await ok('a client sees the live lines only, never the team tabs', () => {
  assert.deepEqual(lines('brand', 'client'), ['meta', 'production', 'black-friday', 'reports']);
  assert.deepEqual(menu.shownTabs(menu.lineOf('meta'), 'client').map(t => t.id), ['changes']);
  assert.equal(groups('brand', 'client').includes(W.WORKSHOP_GROUP), false);
});
await ok('owner sees every line, the rest in one Workshop group, tagged', () => {
  for (const view of ['brand', 'agency']) {
    const g = menu.menuFor(view, 'owner');
    const shop = g.filter(x => x.group === W.WORKSHOP_GROUP);
    assert.equal(shop.length, 1, view);
    assert.equal(g[g.length - 1].group, W.WORKSHOP_GROUP, view + ': Workshop is last');
    for (const l of shop[0].lines) { assert.equal(W.lineLive(l.id), false, l.id); assert.equal(l.note, W.WORKSHOP_NOTE, l.id); }
    for (const x of g.filter(x => x !== shop[0])) for (const l of x.lines) assert.ok(W.lineLive(l.id), l.id);
  }
  assert.ok(lines('brand', 'owner').includes('home'));
  assert.ok(lines('agency', 'owner').includes('a-engine'));
  assert.equal(lines('brand', 'owner').length, menu.BRAND_MENU.flatMap(g => g.lines).length);
  /* the owner keeps every tab of a live line */
  assert.equal(menu.shownTabs(menu.lineOf('meta'), 'owner').length, menu.lineOf('meta').tabs.length);
});

/* ---------- routing ---------- */
/* start on a workshop address as team, so no page code loads in this test */
as('team');
location.hash = '#/brand/northlake/customers/ltv';
router.start(host);
const go = hash => { location.hash = hash; handlers.hashchange(); };

await ok('team with no address lands on the first live line', () => {
  as('team');
  const r = router.normalise({});
  assert.equal(r.line, 'meta'); assert.equal(r.tab, 'suggestions');
  assert.equal(router.normalise({ view: 'agency' }).line, 'a-meta');
});
await ok('a live line, non live tab: opens its first live tab', () => {
  as('team');
  assert.deepEqual(router.normalise({ view: 'brand', brand: 'northlake', line: 'meta', tab: 'overview' }).tab, 'suggestions');
  assert.deepEqual(router.normalise({ view: 'brand', brand: 'northlake', line: 'profile', tab: 'index' }).tab, 'delivery');
  assert.deepEqual(router.normalise({ view: 'brand', brand: 'northlake', line: 'black-friday', tab: 'plan' }).tab, 'plan');
});
await ok('the shell buttons (brand switcher, phone tabs) never end on a workshop page for the team', () => {
  as('team');
  /* the switcher asks for a line with no tab: All brands, and a brand from the agency view */
  assert.deepEqual(router.normalise({ view: 'agency', line: 'a-today' }), { view: 'agency', brand: 'all', line: 'a-meta', tab: 'suggestions' });
  assert.deepEqual(router.normalise({ view: 'brand', brand: 'northlake', line: 'home' }), { view: 'brand', brand: 'northlake', line: 'meta', tab: 'suggestions' });
  assert.equal(router.normalise({ view: 'brand', brand: 'northlake', line: 'platforms' }).line, 'meta');
  /* a live line with no tab keeps its line; a typed workshop address keeps its page ("being built") */
  assert.equal(router.normalise({ view: 'brand', brand: 'northlake', line: 'production' }).line, 'production');
  assert.equal(router.normalise({ view: 'brand', brand: 'northlake', line: 'my-day' }).line, 'my-day');
  assert.equal(router.normalise({ view: 'brand', brand: 'northlake', line: 'home', tab: 'index' }).line, 'home');
  as('owner');
  assert.equal(router.normalise({ view: 'agency', line: 'a-today' }).line, 'a-today');
});
await ok('the owner keeps every tab', () => {
  as('owner');
  assert.equal(router.normalise({ view: 'brand', brand: 'northlake', line: 'meta', tab: 'overview' }).tab, 'overview');
  assert.equal(router.normalise({ view: 'brand', brand: 'northlake' }).line, 'home');
});
await ok('a direct link to a workshop page as team: "being built", no data call', async () => {
  as('team');
  const before = fetched;
  go('#/brand/northlake/customers/ltv');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(location.hash, '#/brand/northlake/customers/ltv');
  assert.equal(drawn.line.id, 'customers');
  const box = drawn.el.kids[0];
  assert.equal(box.className, 'lx-empty');
  assert.ok(box.kids.some(k => k.textContent === 'This page is being built.'));
  assert.equal(fetched, before);
  /* a blocked page is never kept as the page the app reopens on */
  assert.ok(![...store.values()].some(v => String(v).includes('customers')));
  go('#/agency/all/a-today/index');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(drawn.line.id, 'a-today');
  assert.ok(drawn.el.kids[0].kids.some(k => k.textContent === 'This page is being built.'));
  assert.equal(fetched, before);
});
await ok('canOpen: the owner opens anything, others only live pages', () => {
  assert.equal(W.canOpen('owner', 'customers', 'ltv'), true);
  assert.equal(W.canOpen('team', 'customers', 'ltv'), false);
  assert.equal(W.canOpen('client', 'customers', 'ltv'), false);
  assert.equal(W.canOpen('team', 'meta', 'suggestions'), true);
  assert.equal(W.canOpen('team', 'meta', 'overview'), false);
});

console.log(`\n${n} passed`);
process.exit(0);   // the router's modules keep a handle open in node; the test is done
