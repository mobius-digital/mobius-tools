// node test-first-preset.mjs (from profit/v5). No DOM, no network.
// pages/profile/_first-preset.js: the one time "how should Locus reach you?" sheet. Who is asked, what it shows, what
// a save or a dismiss sends, on the sample catalog (pages/profile/_sample/delivery.json).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { CHOICES, DEFAULT_PRESET, choices, startPreset, shouldFetch, shouldShow, saveBody, knownKey, channelChoices, startChannels,
  reachesOutside, savedOk, closeOutcome } from './pages/profile/_first-preset.js';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const sample = JSON.parse(readFileSync(here('./pages/profile/_sample/delivery.json'), 'utf8'));
const clientSample = JSON.parse(readFileSync(here('./pages/profile/_sample/delivery-client.json'), 'utf8'));
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
  const s = choices({ client: true, catalog: clientSample.catalog });
  for (const x of s) assert.equal(x.sub, clientSample.catalog.presets.find(p => p.id === x.id).sub, 'the server\'s client words');
  assert.ok(s.every(x => !/money at risk|broken|bell/i.test(x.sub)));
  assert.deepEqual(choices({ client: false, catalog: clientSample.catalog }).map(x => x.sub), choices({}).map(x => x.sub), 'the team never reads client words');
});

ok('shows only on an explicit notify_chosen false from a server with presets', () => {
  assert.equal(shouldShow({ ...sample, notify_chosen: false }), true);
  assert.equal(shouldShow({ ...sample, notify_chosen: true }), false, 'a saved preset never asks again');
  assert.equal(shouldShow(sample), false, 'an older server (no notify_chosen) shows nothing');
  assert.equal(shouldShow({ notify_chosen: false }), false, 'no catalog: nothing');
  assert.equal(shouldShow(null), false);
  assert.equal(shouldShow(null, { forced: true }), true, '?firstpreset=1 in sample');
  assert.equal(shouldShow({ ...clientSample, notify_chosen: false }, { client: true }), true, 'a client with the client list');
  assert.equal(shouldShow({ ...sample, notify_chosen: false }, { client: true }), false, 'a client never gets the team list');
  assert.equal(shouldShow({ ...clientSample, notify_chosen: false }), false, 'the team never gets the client list');
  assert.equal(shouldShow({ ...clientSample, notify_chosen: true }, { client: true }), false, 'a client who saved is not asked again');
});

ok('who is asked: a teammate and a client login; not in sample, not as client preview, not on Get started, not once known', () => {
  assert.equal(shouldFetch({}), true);
  assert.equal(shouldFetch({ client: true }), true, 'a client login is asked too, with its own list');
  assert.equal(shouldFetch({ client: true, sample: true, forced: true }), true, 'the sample shows the client words');
  assert.equal(shouldFetch({ client: true, held: true }), false, 'not while held on Get started');
  assert.equal(shouldFetch({ sample: true }), false);
  assert.equal(shouldFetch({ sample: true, forced: true }), true);
  assert.equal(shouldFetch({ asClient: true }), false);
  assert.equal(shouldFetch({ held: true }), false);
  assert.equal(shouldFetch({ known: true }), false);
});

ok('Also send to: only Slack DM and email that are ready; a client gets the same channels as the team', () => {
  const cat = { channels: [{ id: 'in_app', ready: true, always: true }, { id: 'slack_dm', name: 'Slack DM', ready: true },
    { id: 'email', name: 'Email', ready: false }, { id: 'push', name: 'Phone', ready: false }] };
  assert.deepEqual(channelChoices({ catalog: cat }).map(c => c.id), ['slack_dm']);
  assert.deepEqual(channelChoices({ catalog: { channels: cat.channels.map(c => ({ ...c, ready: true })) } }).map(c => c.id), ['slack_dm', 'email'], 'never in_app or push');
  assert.deepEqual(channelChoices({ catalog: { channels: cat.channels.map(c => ({ ...c, ready: true })) }, client: true }).map(c => c.id), ['slack_dm', 'email']);
  assert.deepEqual(channelChoices({ catalog: clientSample.catalog }).map(c => c.id), ['slack_dm'], 'the client sample: Slack ready, email not yet');
  assert.deepEqual(startChannels(clientSample.notify, [{ id: 'slack_dm' }, { id: 'email' }]), { slack_dm: false, email: false }, 'a client starts with nothing on');
  assert.deepEqual(channelChoices({}), [], 'no catalog: nothing to turn on');
  assert.deepEqual(channelChoices({ catalog: sample.catalog }).map(c => c.id), ['slack_dm'], 'the sample: Slack ready, email not yet');
});

ok('the switches open on what the server has on: a new teammate starts off, the DM list starts with Slack DM on', () => {
  const offered = [{ id: 'slack_dm' }, { id: 'email' }];
  assert.deepEqual(startChannels({ channels: { slack_dm: false, email: false, push: false } }, offered), { slack_dm: false, email: false });
  assert.deepEqual(startChannels(sample.notify, offered), { slack_dm: true, email: false });
  assert.deepEqual(startChannels(null, offered), { slack_dm: false, email: false });
  assert.equal(reachesOutside({ slack_dm: false, email: false }), false, 'nothing on: the sheet says it stays in the app');
  assert.equal(reachesOutside({ slack_dm: true }), true);
});

ok('Save sends the pick and the switches; anything odd sends the default', () => {
  assert.deepEqual(saveBody('everything', { slack_dm: true, email: false }), { notify: { channels: { slack_dm: true, email: false }, preset: 'everything' } });
  assert.deepEqual(saveBody('only_urgent', { push: true }), { notify: { preset: 'only_urgent' } }, 'push is never sent from here');
  assert.deepEqual(saveBody('only_urgent', {}), { notify: { preset: 'only_urgent' } }, 'no switch offered: channels left as they are');
  assert.deepEqual(saveBody('only_urgent'), { notify: { preset: 'only_urgent' } });
  assert.deepEqual(saveBody('everything'), { notify: { preset: 'everything' } });
  assert.deepEqual(saveBody(DEFAULT_PRESET), { notify: { preset: 'urgent_brief' } });
  assert.deepEqual(saveBody('custom'), { notify: { preset: 'urgent_brief' } });
  assert.deepEqual(saveBody(undefined), { notify: { preset: 'urgent_brief' } });
});

ok('only an answer that says notify_chosen true counts as saved', () => {
  assert.equal(savedOk({ ok: true, notify_chosen: true }), true);
  assert.equal(savedOk({ ok: true }), false, 'an engine answer without notify is not a save');
  assert.equal(savedOk({ ok: true, notify_chosen: false }), false);
  assert.equal(savedOk(null), false);
});

ok('only Save writes; a dismiss or the Profile link stops asking here; a route change asks again', () => {
  assert.deepEqual(closeOutcome('save'), { put: true, remember: true });
  assert.deepEqual(closeOutcome('dismiss'), { put: false, remember: true }, 'Escape never saves a snapshot');
  assert.deepEqual(closeOutcome('link'), { put: false, remember: true });
  assert.deepEqual(closeOutcome('route'), { put: false, remember: false }, 'browser Back is not an answer');
  assert.deepEqual(closeOutcome(undefined), { put: false, remember: false });
});

ok('the remembered key is per login', () => {
  assert.equal(knownKey(' Sam@Agency.Example '), 'lx5_first_preset|sam@agency.example');
  assert.notEqual(knownKey('a@x.example'), knownKey('b@x.example'));
});

ok('no em or en dashes in the sheet file', () => {
  assert.ok(!/[–—]/.test(readFileSync(here('./pages/profile/_first-preset.js'), 'utf8')));
});

console.log(`test-first-preset: ${n} checks passed`);
