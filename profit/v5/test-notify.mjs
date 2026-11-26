// node test-notify.mjs (from profit/v5). No DOM, no network.
// 1. pages/profile/_notify.js: the same fill and custom rules as the worker (account-health src/notify.js), on the
//    catalog of the sample (pages/profile/_sample/delivery.json), the shared fixture.
// 2. menu.js: a line whose agency feature is off leaves the menus; by default it stays.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { fillPreset, defaultNotify, normalNotify, applyPreset, applyChannels, applyCell, isCustom, cellOn } from './pages/profile/_notify.js';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const sample = JSON.parse(readFileSync(here('./pages/profile/_sample/delivery.json'), 'utf8'));
const types = sample.catalog.types;
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const on = (notify, ch) => Object.entries(notify.types).filter(([, c]) => c[ch]).map(([id]) => id).sort();
const ids = preset => types.filter(t => t.presets.includes(preset)).map(t => t.id).sort();
const urgent = types.filter(t => t.group === 'urgent').map(t => t.id).sort();

ok('the catalog has every group and preset', () => {
  assert.ok(types.length >= 10);
  assert.deepEqual([...new Set(types.map(t => t.group))].sort(), ['brief', 'needs_me', 'urgent']);
  assert.deepEqual(sample.catalog.presets.map(p => p.id), ['only_urgent', 'urgent_brief', 'everything', 'custom']);
});

ok('the default sends nothing outside Locus', () => {
  const d = defaultNotify(types);
  assert.equal(d.preset, 'urgent_brief');
  assert.deepEqual(d.channels, { slack_dm: false, email: false, push: false });
  for (const ch of ['slack_dm', 'email', 'push']) assert.deepEqual(on(d, ch), []);
  for (const t of types) assert.equal(cellOn(d, t.id, 'in_app'), true);
  assert.deepEqual(normalNotify(null, types), d);
});

ok('each preset fills the right cells for the channels that are on', () => {
  const ch = { slack_dm: true, email: false, push: false };
  for (const p of ['only_urgent', 'urgent_brief', 'everything']) {
    const cells = fillPreset(types, p, ch);
    assert.deepEqual(Object.keys(cells).sort(), types.map(t => t.id).sort());
    assert.deepEqual(Object.entries(cells).filter(([, c]) => c.slack_dm).map(([id]) => id).sort(), ids(p));
    assert.ok(Object.values(cells).every(c => !c.email && !c.push));
  }
  assert.deepEqual(ids('only_urgent'), urgent);
  assert.deepEqual(ids('urgent_brief'), [...urgent, 'morning_brief'].sort());
  assert.equal(ids('everything').length, types.length);
  /* the catalog object works the same as the list */
  assert.deepEqual(fillPreset(sample.catalog, 'everything', ch), fillPreset(types, 'everything', ch));
});

ok('picking a preset sets it and refills; custom is not a choice', () => {
  let s = applyChannels(defaultNotify(types), types, { slack_dm: true });
  s = applyPreset(s, types, 'everything');
  assert.equal(s.preset, 'everything');
  assert.equal(on(s, 'slack_dm').length, types.length);
  assert.deepEqual(applyPreset(s, types, 'custom'), s);
});

ok('a channel change refills unless custom', () => {
  let s = applyPreset(defaultNotify(types), types, 'only_urgent');
  s = applyChannels(s, types, { email: true });
  assert.equal(s.preset, 'only_urgent');
  assert.deepEqual(on(s, 'email'), urgent);
  assert.deepEqual(on(s, 'slack_dm'), []);
  /* custom: cells stay as stored; an off channel reads as off; back on restores them */
  s = applyCell(s, types, 'morning_brief', 'email', true);
  assert.equal(s.preset, 'custom');
  const off = applyChannels(s, types, { email: false });
  assert.equal(off.preset, 'custom');
  assert.equal(off.types.morning_brief.email, true);
  assert.equal(cellOn(off, 'morning_brief', 'email'), false);
  const back = applyChannels(off, types, { email: true });
  assert.equal(cellOn(back, 'morning_brief', 'email'), true);
  assert.deepEqual(on(back, 'email'), [...urgent, 'morning_brief'].sort());
});

ok('one cell edit sets custom and is never matched back to a preset', () => {
  let s = applyChannels(defaultNotify(types), types, { slack_dm: true });
  assert.equal(isCustom(s), false);
  s = applyCell(s, types, 'spend_low', 'slack_dm', false);
  assert.equal(isCustom(s), true);
  assert.equal(s.types.spend_low.slack_dm, false);
  s = applyCell(s, types, 'spend_low', 'slack_dm', true);
  assert.equal(s.preset, 'custom');
  assert.deepEqual(on(s, 'slack_dm'), ids('urgent_brief'));
  /* an unknown type or channel changes nothing */
  assert.deepEqual(applyCell(s, types, 'nope', 'slack_dm', true), s);
  assert.deepEqual(applyCell(s, types, 'spend_low', 'in_app', false), s);
});

ok('a saved notify is cleaned against the catalog', () => {
  const raw = { preset: 'custom', channels: { slack_dm: 1, fax: true }, types: { spend_high: { slack_dm: 1, fax: true }, gone: { slack_dm: true } } };
  const s = normalNotify(raw, types);
  assert.deepEqual(s.channels, { slack_dm: true, email: false, push: false });
  assert.deepEqual(s.types.spend_high, { slack_dm: true, email: false, push: false });
  assert.equal('gone' in s.types, false);
  assert.equal(Object.keys(s.types).length, types.length);
  assert.equal(normalNotify({ preset: 'weird' }, types).preset, 'urgent_brief');
});

ok('the sample state matches its preset', () => {
  const s = normalNotify(sample.notify, types);
  assert.deepEqual(s.types, sample.notify.types);
});

/* ---------- 2. menu.js and the agency feature switches ---------- */
globalThis.location = { search: '', hostname: 'localhost', hash: '', pathname: '/' };
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const menu = await import('./menu.js');
const lines = (view, role, o) => menu.menuFor(view, role, o).flatMap(g => g.lines.map(l => l.id));

ok('Creators shows by default', () => {
  assert.equal(menu.featuresNow().creatorProgram, true);
  assert.ok(lines('brand', 'team').includes('creators'));
  assert.ok(lines('agency', 'owner').includes('a-creators'));
});

ok('creatorProgram off drops creators and a-creators; the page still opens', () => {
  assert.equal(menu.setFeatures({ creatorProgram: false, socialPosting: false }), true);
  assert.equal(lines('brand', 'team').includes('creators'), false);
  assert.equal(lines('brand', 'client').includes('creators'), false);
  assert.equal(lines('agency', 'owner').includes('a-creators'), false);
  assert.ok(lines('agency', 'owner', { allFeatures: true }).includes('a-creators'));
  assert.ok(menu.lineOf('creators'));
  assert.ok(menu.allRoutes().some(r => r.line === 'a-creators'));
  assert.equal(menu.setFeatures({ creatorProgram: false }), false);
  assert.equal(menu.setFeatures(null), false);
});

ok('back on brings them back', () => {
  assert.equal(menu.setFeatures({ creatorProgram: true }), true);
  assert.ok(lines('brand', 'team').includes('creators'));
  assert.ok(lines('agency', 'team').includes('a-creators'));
});

console.log(n + ' passed');
