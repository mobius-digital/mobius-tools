// node test-first-preset.mjs (from profit/v5). No DOM, no network.
// pages/profile/_first-preset.js: the one time "how should Locus reach you?" sheet. Who is asked, what it shows, what
// a save or a dismiss sends, on the sample catalog (pages/profile/_sample/delivery.json).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { CHOICES, DEFAULT_PRESET, choices, startPreset, shouldFetch, shouldShow, saveBody, knownKey } from './pages/profile/_first-preset.js';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const sample = JSON.parse(readFileSync(here('./pages/profile/_sample/delivery.json'), 'utf8'));
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

ok('three choices in order, Only urgent + morning brief is the default', () => {
  assert.deepEqual(CHOICES, ['only_urgent', 'urgent_brief', 'everything']);
  assert.equal(DEFAULT_PRESET, 'urgent_brief');
  assert.equal(startPreset(null), 'urgent_brief');
  assert.equal(startPreset({ preset: 'custom' }), 'urgent_brief', 'custom is never a choice here');
  assert.equal(startPreset({ preset: 'everything' }), 'everything');
});

ok('the team reads the server words; custom never shows', () => {
  const c = choices({ client: false, catalog: sample.catalog });
  assert.deepEqual(c.map(x => x.id), CHOICES);
  for (const x of c) {
    const s = sample.catalog.presets.find(p => p.id === x.id);
    assert.equal(x.name, s.name); assert.equal(x.sub, s.sub);
  }
  assert.ok(!c.some(x => x.id === 'custom'));
  assert.deepEqual(choices({}).map(x => x.name), ['Only urgent', 'Only urgent + morning brief', 'Everything that needs me'], 'fallback words with no catalog');
});

ok('a client reads client words, never the team alarms', () => {
  const c = choices({ client: true, catalog: sample.catalog });
  assert.deepEqual(c.map(x => x.name), ['Only urgent', 'Only urgent + morning brief', 'Everything that needs me']);
  assert.ok(c.every(x => !/money at risk|broken|bell/i.test(x.sub)), 'no agency alarm words');
  assert.ok(c.some(x => /your team/i.test(x.sub)));
});

ok('shows only on an explicit notify_chosen false from a server with presets', () => {
  assert.equal(shouldShow({ ...sample, notify_chosen: false }), true);
  assert.equal(shouldShow({ ...sample, notify_chosen: true }), false, 'a saved preset never asks again');
  assert.equal(shouldShow(sample), false, 'an older server (no notify_chosen) shows nothing');
  assert.equal(shouldShow({ notify_chosen: false }), false, 'no catalog: nothing');
  assert.equal(shouldShow(null), false);
  assert.equal(shouldShow(null, { forced: true }), true, '?firstpreset=1 in sample');
});

ok('who is asked: not in sample, not as client preview, not on Get started, not once known', () => {
  assert.equal(shouldFetch({}), true);
  assert.equal(shouldFetch({ sample: true }), false);
  assert.equal(shouldFetch({ sample: true, forced: true }), true);
  assert.equal(shouldFetch({ asClient: true }), false);
  assert.equal(shouldFetch({ held: true }), false);
  assert.equal(shouldFetch({ known: true }), false);
});

ok('Save sends the pick; a dismiss or anything odd sends the default', () => {
  assert.deepEqual(saveBody('only_urgent'), { notify: { preset: 'only_urgent' } });
  assert.deepEqual(saveBody('everything'), { notify: { preset: 'everything' } });
  assert.deepEqual(saveBody(DEFAULT_PRESET), { notify: { preset: 'urgent_brief' } });
  assert.deepEqual(saveBody('custom'), { notify: { preset: 'urgent_brief' } });
  assert.deepEqual(saveBody(undefined), { notify: { preset: 'urgent_brief' } });
});

ok('the remembered key is per login', () => {
  assert.equal(knownKey(' Sam@Agency.Example '), 'lx5_first_preset|sam@agency.example');
  assert.notEqual(knownKey('a@x.example'), knownKey('b@x.example'));
});

ok('no em or en dashes in the sheet file', () => {
  assert.ok(!/[–—]/.test(readFileSync(here('./pages/profile/_first-preset.js'), 'utf8')));
});

console.log(`test-first-preset: ${n} checks passed`);
