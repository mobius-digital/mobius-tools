/* Group production, offline: every row's access rules, then each ported read against its sample
   (same shape) and against a client login (no leak).
   Run from engine/worker: node --test "test/production/*.test.mjs" */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, asCaller, call, sameShape, genAccessTests, assertNoLeak, NORTH, RIVER, RIVER_IDS, NORTH_AD_ACCOUNT }
  from '../../src/platform/testkit/index.mjs';
import { routes } from '../../src/production/routes.js';

const sample = name => JSON.parse(readFileSync(new URL(`../../src/production/samples/${name}.json`, import.meta.url), 'utf8'));
const NORTH_AD = 'a'.repeat(24), RIVER_AD = 'b'.repeat(24), GONE_AD = 'c'.repeat(24);
const recent = new Date(Date.now() - 864e5).toISOString();
const old = new Date(Date.now() - 90 * 864e5).toISOString();

const request = (id, act, more = {}) => ({ id, act_id: act, kind: 'approval', what: null, ref: null, title: `Item ${id}`, body: '', link: null,
  status: 'open', by_email: 'sam@agency.test', by_name: 'Sam', by_role: 'team', created_at: recent, updated_at: recent, ...more });

const ROWS = {
  p_request: [
    request('rq_n_ads', NORTH, { what: 'studio', ref: `${NORTH_AD},${GONE_AD}`, title: 'Spring kite ads' }),
    request('rq_n_date', NORTH, { what: 'date', ref: 'ev_north', title: 'Spring sale date' }),
    request('rq_n_ask', NORTH, { kind: 'request', by_role: 'client', by_name: null, by_email: 'pat@northkites.test', title: 'New photos' }),
    request('rq_n_old', NORTH, { status: 'done', updated_at: old, title: 'Closed long ago' }),
    request('rq_r_ads', RIVER, { what: 'studio', ref: RIVER_AD, title: 'River tea ads', status: 'changes' }),
    request('rq_r_date', RIVER, { what: 'date', ref: 'ev_river', title: 'River tea date' }),
  ],
  p_request_msg: [
    { id: 'rm_1', request_id: 'rq_n_ads', by_email: null, by_name: 'Sam', by_role: 'team', text: 'Two ads for the spring line.', created_at: recent },
    { id: 'rm_2', request_id: 'rq_r_ads', by_email: null, by_name: 'Lee', by_role: 'client', text: 'River tea secret note', created_at: recent },
  ],
  p_studio_ad: [
    { id: NORTH_AD, act_id: NORTH, status: 'review', spec_json: { headline: 'Fly higher' }, has_final: 1, updated_at: '2026-01-05 15:00:00' },
    { id: GONE_AD, act_id: NORTH, status: 'deleted', spec_json: {}, has_final: 0 },
    { id: RIVER_AD, act_id: RIVER, status: 'approved', spec_json: { headline: 'River tea headline' }, has_final: 0 },
  ],
  p_asset: [
    { act_id: NORTH, file_id: 'file_one', name: 'kite-on-beach.jpg', path: 'Photos / Beach', w: 2000, h: 1500, status: 'tagged', people: 1,
      setting: 'lifestyle outdoor', shot: 'full body', products: 'Delta kite', colors: 'red, blue', descr: 'A person flying a red kite on a beach',
      thumb_key: 'assets/north-kites/file_one.jpg', modified: '2026-01-03T10:00:00.000Z', source: 'locus', kind: 'look', cost: 0.04,
      look_json: { who: 'a person' } },
    { act_id: NORTH, file_id: 'file_two', name: 'kite-flat.jpg', path: 'Photos', status: 'new', people: 0, setting: 'white background',
      modified: '2026-01-02T10:00:00.000Z' },
    { act_id: NORTH, file_id: 'file_gone', name: 'removed.jpg', status: 'gone', modified: '2026-01-01T10:00:00.000Z' },
    { act_id: RIVER, file_id: 'file_river', name: 'river-tea-secret.jpg', status: 'tagged', people: 0, setting: 'studio', descr: 'River tea tin',
      modified: '2026-01-03T10:00:00.000Z' },
  ],
  p_br_doc: [{ act_id: NORTH, line_id: '', key: 'assets', data_json: { folders: ['https://drive.example.test/drive/folders/extraextraextraextra02'] } }],
  connections: [{ id: 'drive:north', brand_id: NORTH, kind: 'drive', external_id: 'https://drive.example.test/drive/folders/folderfolderfolderfolder01', is_primary: 1 }],
  settings: [{ key: `assetsSyncAt:${NORTH}`, value: '2026-01-06T09:00:00.000Z' }, { key: `assetsSyncAt:${RIVER}`, value: '2026-01-07T09:00:00.000Z' }],
  p_inspo: [
    { id: 'in_north', act_id: NORTH, kind: 'link', url: 'https://example.test/a-kite-ad', image: 'https://example.test/a.jpg', title: 'A kite ad we like',
      site: 'example.test', note: 'The first second is the hook', created_by: 'team@agency.test', created_at: recent },
    { id: 'in_river', act_id: RIVER, kind: 'link', url: 'https://example.test/river-tea-secret', title: 'River tea secret', created_by: 'team@agency.test', created_at: recent },
  ],
  p_br_batch: [{ id: 'card_north', act_id: NORTH, num: '1', title: 'North card' }, { id: 'card_river', act_id: RIVER, num: '1', title: 'River card' }],
};

function env() {
  const e = makeEnv({ groups: ['production'], rows: ROWS });
  e.CAL.insert('events', [
    { id: 'ev_north', brand_id: 'north-kites', name: 'Spring sale', type: 'promo', status: 'tentative', brief: '20 percent off kites', launch_date: '2026-03-01', promo_end_date: '2026-03-05' },
    { id: 'ev_river', brand_id: 'river-tea', locus_brand: RIVER, name: 'River tea drop', type: 'product_launch', status: 'confirmed', brief: 'River tea secret offer', launch_date: '2026-03-02' },
  ]);
  return e;
}
const ported = r => assert.equal(r.engine, 'new', `not answered by the engine: ${r.status} ${r.text.slice(0, 200)}`);

genAccessTests(routes, { groups: ['production'] });

/* ---------- requests ---------- */

test('requests: one brand has the shape of the sample', async () => {
  const r = await call(env(), 'GET', `/ah/api/requests?act=${NORTH}`, { token: asCaller('owner') });
  ported(r);
  assert.equal(r.status, 200);
  const want = sample('requests');
  assert.deepEqual(sameShape(r.json, want), []);
  const byId = Object.fromEntries(r.json.items.map(i => [i.id, i]));
  assert.deepEqual(Object.keys(byId).sort(), ['rq_n_ads', 'rq_n_ask', 'rq_n_date']);          // closed 90 days ago is left out
  assert.deepEqual(sameShape(byId.rq_n_ads, want.items[0]), []);
  assert.deepEqual(sameShape(byId.rq_n_date, want.items[1]), []);
  assert.deepEqual(byId.rq_n_ads.ads, [{ id: NORTH_AD, img: 'final', v: '20260105150000', approved: false, headline: 'Fly higher' }]);   // the deleted ad is dropped
  assert.deepEqual(byId.rq_n_date.date, { id: 'ev_north', name: 'Spring sale', start: '2026-03-01', end: '2026-03-05', offer: '20 percent off kites', confirmed: false, cancelled: false });
  assert.equal(byId.rq_n_ask.by, 'Pat');                                                       // no name on the row: made from the email
  assert.ok(!('ads' in byId.rq_n_ask) && !('date' in byId.rq_n_ask));
  assert.equal(byId.rq_n_ads.thread.length, 1);
  assert.equal(r.json.waiting_client, 2);
  assert.equal(r.json.waiting_team, 1);
});

test('requests: the owner asking for all gets every brand, an old id works like the brand id', async () => {
  const e = env();
  const all = await call(e, 'GET', '/ah/api/requests?act=all', { token: asCaller('owner') });
  ported(all);
  assert.equal(all.json.items.length, 5);
  assert.equal(all.json.items.find(i => i.id === 'rq_r_date').date.confirmed, true);
  assert.equal(all.json.waiting_team, 2);
  const none = await call(e, 'GET', '/ah/api/requests', { token: asCaller('owner') });
  assert.equal(none.json.items.length, 5);
  const oldId = await call(e, 'GET', `/ah/api/requests?act=${NORTH_AD_ACCOUNT}`, { token: asCaller('owner') });
  assert.equal(oldId.json.items.length, 3);
});

test('requests: a teammate limited to one brand asking for all gets only that brand', async () => {
  const r = await call(env(), 'GET', '/ah/api/requests?act=all', { token: asCaller('limited') });
  ported(r);
  assert.ok(r.json.items.length === 3 && r.json.items.every(i => i.act_id === NORTH));
  assert.ok(!r.text.includes('River tea'));
});

test('requests: a client reads its own brand and nothing of the other', async () => {
  const { mine, none } = await assertNoLeak(env(), 'GET', '/ah/api/requests');
  ported(mine);
  assert.equal(mine.status, 200);
  assert.equal(mine.json.items.length, 3);
  assert.ok(!mine.text.includes('River tea') && !mine.text.includes(RIVER_AD));
  assert.ok(mine.json.items.every(i => !('by' in i)), 'who sent it is a team only key');
  assert.equal(none.status, 403);
  assert.equal(none.json.error, 'Pick your brand first.');
});

test('requests: a date of another brand is not shown even when an item points at it', async () => {
  const e = env();
  e.DB.insert('p_request', [request('rq_n_wrong', NORTH, { what: 'date', ref: 'ev_river', title: 'Wrong date' })]);
  const r = await call(e, 'GET', `/ah/api/requests?act=${NORTH}`, { token: asCaller('client') });
  ported(r);
  assert.equal(r.json.items.find(i => i.id === 'rq_n_wrong').date, null);
  assert.ok(!r.text.includes('River tea'));
});

/* ---------- the photo library ---------- */

test('assets: one brand has the shape of the sample', async () => {
  const r = await call(env(), 'GET', `/ah/api/assets?act=${NORTH}&limit=200`, { token: asCaller('team') });
  ported(r);
  assert.equal(r.status, 200);
  assert.deepEqual(sameShape(r.json, sample('assets')), []);
  assert.equal(r.json.act, NORTH);
  assert.deepEqual(r.json.items.map(i => i.file_id), ['file_one', 'file_two']);                // newest first, the gone one is left out
  assert.ok(!('look_json' in r.json.items[0]));
  assert.deepEqual(r.json.items[0].look, { who: 'a person' });
  assert.equal(r.json.items[1].look, null);
  assert.deepEqual(r.json.counts, { tagged: 1, new: 1, gone: 1 });
  assert.deepEqual(r.json.settings, [{ setting: 'lifestyle outdoor', n: 1 }]);
  assert.equal(r.json.looks, 1);
  assert.equal(r.json.synced_at, '2026-01-06T09:00:00.000Z');
  assert.deepEqual(r.json.sources, ['folderfolderfolderfolder01', 'extraextraextraextra02']);
});

test('assets: the search, people, setting and source filters', async () => {
  const e = env(), token = asCaller('team');
  const ids = async q => (await call(e, 'GET', `/ah/api/assets?act=${NORTH}&${q}`, { token })).json.items.map(i => i.file_id);
  assert.deepEqual(await ids('q=red+beach'), ['file_one']);
  assert.deepEqual(await ids('q=nothinglikethis'), []);
  assert.deepEqual(await ids('people=yes'), ['file_one']);
  assert.deepEqual(await ids('people=no'), ['file_two']);
  assert.deepEqual(await ids('setting=white+background'), ['file_two']);
  assert.deepEqual(await ids('source=locus'), ['file_one']);
  assert.deepEqual(await ids('limit=1'), ['file_one']);
});

test('assets: a brand is needed, and "all" is not one', async () => {
  const e = env(), token = asCaller('team');
  for (const path of ['/ah/api/assets', '/ah/api/assets?act=all']) {
    const r = await call(e, 'GET', path, { token });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'act is required');
  }
});

test('assets: a client reads its own library and nothing of the other brand', async () => {
  const { mine } = await assertNoLeak(env(), 'GET', '/ah/api/assets');
  ported(mine);
  assert.equal(mine.status, 200);
  assert.equal(mine.json.items.length, 2);
  assert.ok(!mine.text.includes('river-tea-secret') && !mine.text.includes('2026-01-07'));
});

/* ---------- saved reference ads ---------- */

test('inspo: one brand has the shape of the sample', async () => {
  const r = await call(env(), 'GET', `/pw/api/inspo?act=${NORTH}`, { token: asCaller('team') });
  ported(r);
  assert.equal(r.status, 200);
  assert.deepEqual(sameShape(r.json, sample('inspo')), []);
  assert.deepEqual(r.json.items.map(i => i.id), ['in_north']);
  assert.equal(r.json.items[0].act, NORTH);
});

test('inspo: no brand is a 400 with the old words, "all" is an empty list', async () => {
  const e = env(), token = asCaller('team');
  const none = await call(e, 'GET', '/pw/api/inspo', { token });
  assert.equal(none.status, 400);
  assert.equal(none.json.error, 'Pick a brand.');
  const all = await call(e, 'GET', '/pw/api/inspo?act=all', { token });
  ported(all);
  assert.deepEqual(all.json.items, []);
});

test('inspo: a client reads its own list and nothing of the other brand', async () => {
  const { mine } = await assertNoLeak(env(), 'GET', '/pw/api/inspo');
  ported(mine);
  assert.equal(mine.json.items.length, 1);
  assert.ok(!mine.text.includes('river-tea-secret'));
  assert.ok(!('by' in mine.json.items[0]), 'who saved it is a team only key');
});

/* ---------- forwarded rows that carry their own check ---------- */

test('card: a client may open its own card, and is refused the card of another brand', async () => {
  const e = env(), token = asCaller('client');
  const other = await call(e, 'GET', '/ah/api/production/card?id=card_river', { token });
  assert.equal(other.status, 403);
  assert.ok(!e.calls.some(c => c.path === '/api/production/card'), 'the old worker was asked for the other brand\'s card');
  const mine = await call(e, 'GET', '/ah/api/production/card?id=card_north', { token });
  assert.ok(mine.forwarded);
  const sent = e.calls.filter(c => c.path === '/api/production/card').pop();
  assert.equal(sent.search, '?id=card_north');
  assert.equal(sent.token, token);
});

test('no ported answer for a client holds an id of the other brand', async () => {
  const e = env(), token = asCaller('client');
  for (const path of ['/ah/api/requests', '/ah/api/assets', '/pw/api/inspo']) {
    const r = await call(e, 'GET', `${path}?act=${NORTH}`, { token });
    for (const id of RIVER_IDS) assert.ok(!r.text.includes(id), `${path} holds ${id}`);
  }
});
