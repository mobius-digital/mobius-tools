/* The reports group, offline: the access rules of every row, the shape of every ported answer against
   its made up sample, and what a client or a limited teammate may never see. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, asCaller, call, sameShape, genAccessTests, assertNoLeak, NORTH, RIVER, RIVER_IDS } from '../../src/platform/testkit/index.mjs';
import { routes } from '../../src/reports/routes.js';

const sample = name => JSON.parse(readFileSync(new URL(`../../src/reports/samples/${name}.json`, import.meta.url), 'utf8'));
const iso = daysAgo => new Date(Date.now() - daysAgo * 864e5).toISOString();
const APP = 'https://app.test/profit/';
const CARD_TS = '1768200000.000100', REP_TS = '1768200000.000900';

const report = (act_id, start, end, status, more = {}) => ({ act_id, period: 'weekly', period_start: start, period_end: end, status,
  generated_at: '2026-01-12T12:00:00.000Z', sent_at: status === 'sent' ? '2026-01-12T15:00:00.000Z' : null, sent_channel: 'C0NORTH0002',
  summary: 'A steady week.', slack_ts: REP_TS, slack_channel: 'C0NORTH0001', steer: null,
  data_json: { totals: { sales: 1000, spend: 400, mer: 2.5, cm: 300 }, forecast: { sales: 1100, spend: 420, mer: 2.6 },
    previous: { sales: 900, spend: 380, mer: 2.4 }, account: { currency: 'USD' }, this_week: ['New kite ads go live'], need_from_you: ['Photos'] }, ...more });
const brief = (act_id, date, status) => ({ act_id, date, posted_at: '2026-01-12T13:00:00.000Z', channel: 'C0NORTH0002', status,
  text: 'Yesterday went to plan.', data_json: '{}', slack_ts: '1768220000.000200', slack_channel: 'C0NORTH0001', steer: null });
const action = (id, act_id, text) => ({ id, act_id, text, owner: 'Sam', due: '2026-01-09', kind: 'team', status: 'open', source: 'monday',
  created_at: '2026-01-05T10:00:00.000Z', area: 'ads' });
const snap = (token, act_id, more = {}) => ({ token, act_id, kind: 'card', title: 'Sales this month', page: 'home', html: '<p>x</p>',
  created_by: 'owner@agency.test', created_at: '2026-01-10 10:00:00', expires_at: '2099-01-01 00:00:00', views: 3, last_view: '2026-01-11 09:00:00', ...more });
const page = (token, slug, acts) => ({ token, slug, title: 'Growth plan', acts, html: '<p>x</p>', created_by: 'owner@agency.test',
  created_at: '2026-01-10 10:00:00', updated_at: '2026-01-11 10:00:00', views: 2, last_view: '2026-01-11 12:00:00' });
const msg = (ts, thread_ts, text, more = {}) => ({ channel: 'C0NORTH0001', ts, thread_ts, user: 'U1', name: 'Sam', bot: 0, text, day: '2026-01-12', ...more });

const ROWS = {
  reports: [report(NORTH, '2026-01-05', '2026-01-11', 'sent'), report(NORTH, '2025-12-29', '2026-01-04', 'draft'),
    report(RIVER, '2026-01-05', '2026-01-11', 'sent', { slack_channel: 'C0RIVER0001' })],
  p_report_read: [{ act_id: NORTH, period: 'weekly', period_start: '2025-12-29', status: 'drafted', draft: 'A draft read.', updated_at: '2026-01-05' },
    { act_id: NORTH, period: 'weekly', period_start: '2026-01-05', status: 'approved', read_text: 'The read.', updated_at: '2026-01-12' }],
  briefs: [brief(NORTH, '2026-01-11', 'sent'), brief(NORTH, '2026-01-10', 'draft'), brief(RIVER, '2026-01-11', 'sent')],
  p_snapshot: [snap('0123456789abcdef0123456789abcdef', NORTH), snap('1123456789abcdef0123456789abcdef', NORTH, { expires_at: '2020-01-01 00:00:00' }),
    snap('2123456789abcdef0123456789abcdef', RIVER)],
  p_client_page: [page('abcdef0123456789abcdef0123456789', 'north-plan', NORTH), page('bbcdef0123456789abcdef0123456789', 'tea-plan', RIVER),
    page('cbcdef0123456789abcdef0123456789', 'both-plan', `${NORTH},${RIVER}`)],
  p_meeting: [{ id: 'm_1', title: 'Monday call', date: iso(3).slice(0, 10), at: iso(3), duration: 42, organizer: 'owner@agency.test',
    attendees_json: [{ displayName: 'Pat', email: 'pat@northkites.test' }], chars: 12000, kind: 'monday_call', status: 'confirmed', cost: 0.05,
    confirmed_by: 'owner@agency.test', confirmed_at: iso(3), created_at: iso(3), updated_at: iso(3),
    notes_json: { kind: 'monday_call', summary: 'Went through the week.', brands: [{ brand_id: NORTH, decisions: ['Keep the budget'],
      items: [{ kind: 'team', text: 'Check the kite ads', owner: 'Sam', due: '2026-01-09' }], this_week: ['New kite ads go live'] }] },
    result_json: { brands: [{ brand_id: NORTH, tasks: [{ id: 'pa_1' }], briefs: [], asks: [], report: true }], agency: null } },
  { id: 'm_old', title: 'Long ago', date: '2020-01-01', at: '2020-01-01T10:00:00.000Z', created_at: '2020-01-01', updated_at: '2020-01-01' }],
  p_action: [action('pa_1', NORTH, 'Check the kite ads'), action('pa_2', '', 'Renew the tools'), action('pa_3', RIVER, 'Check the tea ads'),
    { ...action('pa_4', NORTH, 'Done already'), status: 'done' }],
  settings: [{ key: 'lastReportRun', value: { at: '2026-01-12T12:00:00.000Z', made: 1 } }, { key: 'meetingsSince', value: '2026-01-01T00:00:00.000Z' },
    { key: `morningCard:${NORTH}:2026-01-12`, value: { act: NORTH, date: '2026-01-12', channel: 'C0NORTH0001', ts: CARD_TS } }],
  slack_msg: [msg('1768200100.000100', CARD_TS, 'Plan for the week: two new batches.'), msg('1768200200.000100', CARD_TS, 'A bot line', { bot: 1 }),
    msg('1768200300.000100', REP_TS, 'A reply under the report post, not used when the card has one.')],
};
const OLD = {
  'GET /api/meetings': () => ({ meetings: [{ id: 'm_1', with: ['Pat'] }], open: [{ items: [{ url: `${APP}?open=actions&item=x` }] }],
    webhook: 'https://old-ah.test/fireflies/webhook', connected: true }),
  'GET /api/client-pages': () => ({ pages: [{ token: 'tok', url: `${APP}r.html?t=tok` }] }),
};
const OPTS = { groups: ['reports'], rows: ROWS, old: OLD };
const env = () => makeEnv(OPTS);
const get = (path, kind = 'owner') => call(env(), 'GET', path, { token: asCaller(kind) });

genAccessTests(routes, OPTS);

test('every ported answer has the shape of its sample', async () => {
  const cases = [['reports', `/ah/api/reports?act=${NORTH}`], ['reports', '/pw/api/reports?act=all'],
    ['report', `/ah/api/report?act=${NORTH}&period=weekly&start=2026-01-05`], ['report', `/pw/api/report?act=${NORTH}&period=weekly&start=2026-01-05`],
    ['briefs', `/ah/api/briefs?act=${NORTH}`], ['briefs', '/pw/api/briefs?act=all'], ['snapshots', '/pw/api/snapshots'],
    ['client-pages', '/pw/api/client-pages'], ['meetings', '/ah/api/meetings'], ['meeting', '/ah/api/meetings?id=m_1'], ['monday', '/ah/api/meetings/monday']];
  for (const [name, path] of cases) {
    const r = await get(path);
    assert.equal(r.status, 200, `${path}: ${r.text}`);
    assert.equal(r.engine, 'new', path);
    assert.deepEqual(sameShape(sample(name), r.json), [], path);
  }
});

test('reports and briefs: one brand, every brand, and what the old route answered when nothing fits', async () => {
  const one = await get(`/ah/api/reports?act=${NORTH}`);
  assert.deepEqual(one.json.rows.map(r => [r.act_id, r.period_start, r.status]), [[NORTH, '2026-01-05', 'sent'], [NORTH, '2025-12-29', 'draft']]);
  assert.deepEqual(one.json.lastRun, { at: '2026-01-12T12:00:00.000Z', made: 1 });
  assert.deepEqual(one.json.rows.map(r => r.read_status), ['approved', 'drafted'], 'How we read it status per row');
  assert.equal((await get('/ah/api/reports?act=all')).json.rows.find(r => r.act_id === RIVER).read_status, null, 'none started = null');
  assert.equal((await get('/ah/api/reports?act=all')).json.rows.length, 3);
  assert.equal((await get('/ah/api/briefs')).json.rows.length, 3);
  assert.equal((await get(`/ah/api/briefs?act=${NORTH}`)).json.rows[0].account_name, 'North Kites');
  const full = await get(`/ah/api/report?act=${NORTH}&period=weekly&start=2026-01-05`);
  assert.equal(full.json.data.totals.mer, 2.5);
  assert.ok(!('data_json' in full.json));
  for (const path of ['/ah/api/report?period=weekly&start=2026-01-05', `/ah/api/report?act=${NORTH}&period=monthly&start=2026-01-05`, `/ah/api/report?act=${NORTH}`]) {
    const r = await get(path);
    assert.equal(r.status, 404, path);
    assert.deepEqual(r.json, { error: 'no report for that period' });
  }
});

test('a client gets sent reports and briefs only, never the last run, a draft or a team only key', async () => {
  const list = await get(`/ah/api/reports?act=${NORTH}`, 'client');
  assert.deepEqual(list.json.rows.map(r => r.status), ['sent']);
  assert.ok(!('lastRun' in list.json));
  assert.ok(!('read_status' in list.json.rows[0]), 'the read status is team only');
  const briefs = await get(`/pw/api/briefs?act=${NORTH}`, 'client');
  assert.deepEqual(briefs.json.rows.map(r => r.status), ['sent']);
  for (const k of ['slack_ts', 'slack_channel', 'steer', 'channel']) assert.ok(!(k in briefs.json.rows[0]), k);
  const draft = await get(`/ah/api/report?act=${NORTH}&period=weekly&start=2025-12-29`, 'client');
  assert.equal(draft.status, 404);
  const sent = await get(`/ah/api/report?act=${NORTH}&period=weekly&start=2026-01-05`, 'client');
  assert.equal(sent.status, 200);
  for (const k of ['slack_ts', 'slack_channel', 'steer', 'sent_channel']) assert.ok(!(k in sent.json), k);
  assert.equal((await get('/ah/api/reports', 'client')).status, 403);
});

test('a client cannot read the other brand through any client route', async () => {
  for (const path of ['/ah/api/reports', '/pw/api/reports', '/ah/api/briefs', '/pw/api/briefs', '/pw/api/snapshots',
    '/ah/api/report?period=weekly&start=2026-01-05', '/pw/api/report?period=weekly&start=2026-01-05']) {
    await assertNoLeak(env(), 'GET', path);
  }
});

test('shared links: a client and a limited teammate get their own brand, and live is false once expired', async () => {
  const all = await get('/pw/api/snapshots');
  assert.equal(all.json.links.length, 3);
  assert.deepEqual(all.json.links.filter(l => l.act_id === NORTH).map(l => l.live).sort(), [false, true]);
  assert.equal(all.json.links[0].revoked, false);
  for (const kind of ['client', 'limited']) {
    const mine = await get('/pw/api/snapshots', kind);
    assert.deepEqual([...new Set(mine.json.links.map(l => l.act_id))], [NORTH], kind);
  }
  assert.ok(!('created_by' in (await get('/pw/api/snapshots', 'client')).json.links[0]));
});

test('client pages: the brand filter, the link, and a limited teammate keeps to their brands', async () => {
  const all = await get('/pw/api/client-pages');
  assert.equal(all.json.pages.length, 3);
  assert.equal(all.json.pages[0].url, `${APP}r.html?t=${all.json.pages[0].token}`);
  assert.deepEqual(all.json.pages.find(p => p.slug === 'both-plan').acts, [NORTH, RIVER]);
  assert.deepEqual((await get(`/pw/api/client-pages?act=${RIVER}`)).json.pages.map(p => p.slug).sort(), ['both-plan', 'tea-plan']);
  assert.equal((await get('/pw/api/client-pages?act=all')).json.pages.length, 0);
  assert.deepEqual((await get('/pw/api/client-pages', 'limited')).json.pages.map(p => p.slug).sort(), ['both-plan', 'north-plan']);
});

test('meetings: the list, the borrowed fields, one meeting, and open=0', async () => {
  const r = await get('/ah/api/meetings');
  assert.deepEqual(r.json.meetings.map(m => m.id), ['m_1']);
  const m = r.json.meetings[0];
  assert.deepEqual([m.with, m.brand_ids, m.counts, m.made], [['Pat'], [NORTH], { team: 1, brief: 0, client_owes: 0, client: 1 }, { tasks: 1, briefs: 0, asks: 0, report: 1 }]);
  assert.ok(!('notes_json' in m) && !('attendees_json' in m) && !('result_json' in m));
  assert.deepEqual(r.json.open.map(g => [g.brand_id, g.name, g.items.length]), [['', 'Agency-wide', 1], [NORTH, 'North Kites', 1], [RIVER, 'River Tea', 1]]);
  assert.equal(r.json.open[1].items[0].url, `${APP}?open=actions&act=${NORTH}&item=pa_1`);
  assert.equal(r.json.open[0].items[0].url, `${APP}?open=actions&item=pa_2`);
  assert.deepEqual([r.json.webhook, r.json.connected, r.json.since], ['https://old-ah.test/fireflies/webhook', true, '2026-01-01T00:00:00.000Z']);
  assert.match(r.json.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(`${r.json.monday}T12:00:00Z`).getUTCDay(), 1);
  assert.deepEqual((await get('/ah/api/meetings?open=0')).json.open, []);
  const one = await get('/ah/api/meetings?id=m_1');
  assert.equal(one.json.notes.brands[0].brand_id, NORTH);
  assert.equal(one.json.attendees[0].displayName, 'Pat');
  const none = await get('/ah/api/meetings?id=nope');
  assert.deepEqual([none.status, none.json], [404, { error: 'not found' }]);
});

test('the Monday screen: the stored numbers, the plan under the card, the open tasks', async () => {
  const r = await get('/ah/api/meetings/monday');
  assert.deepEqual(r.json.brands.map(b => b.act_id), [NORTH, RIVER]);
  const north = r.json.brands[0];
  assert.deepEqual(north.report.totals, { sales: 1000, spend: 400, mer: 2.5, cm: 300 });
  assert.deepEqual([north.report.period_start, north.report.plan.mer, north.report.prior.sales, north.report.currency], ['2026-01-05', 2.6, 900, 'USD']);
  assert.deepEqual(north.thread.map(t => [t.by, t.where, t.text]), [['Sam', 'thread', 'Plan for the week: two new batches.']]);
  assert.deepEqual(north.open.map(i => i.id), ['pa_1']);
  assert.deepEqual(r.json.agency_open.map(i => i.id), ['pa_2']);
  assert.equal(r.json.theme, '');
});

test('the Monday screen: week plans, the theme, and a long channel post when no thread has a plan', async () => {
  const monday = (await get('/ah/api/meetings/monday')).json.monday;
  const long = 'A plan posted in the channel itself. '.repeat(5);
  const rows = { ...ROWS,
    settings: [{ key: 'mondayTheme', value: { date: monday, text: 'Clean accounts' } },
      { key: `weekplan:${monday}`, value: { u1: { name: 'Sam', role: 'ads', at: '2026-01-12T09:00:00.000Z', theme: 'Tidy up',
        brands: [{ a: NORTH, focus: 'New angles', batches: [{ ch: 'google', text: 'Search ads' }] }],
        needs: [{ on: 'client', text: 'Photos' }, { on: 'lee', text: 'A yes' }, { text: 'A file' }] } } }],
    slack_msg: [msg('1768200400.000100', null, long), msg('1768200500.000100', null, 'short')] };
  const r = await call(makeEnv({ ...OPTS, rows }), 'GET', '/ah/api/meetings/monday', { token: asCaller('owner') });
  assert.equal(r.json.theme, 'Clean accounts');
  const north = r.json.brands[0];
  assert.deepEqual(north.thread.map(t => t.where), ['week', 'channel']);
  assert.equal(north.thread[0].text, ['Sam\'s week plan (ads)', 'Theme across brands: Tidy up', 'Main focus: New angles', 'Batch 1 (Google): Search ads',
    'Need from the client: Photos', 'Need from Lee: A yes', 'Need from the team: A file'].join('\n'));
  assert.equal(north.thread[1].text, long.slice(0, 4000));
  assert.deepEqual(r.json.brands[1].thread, []);
});

test('a limited teammate sees only their brands on the meetings list and the Monday screen', async () => {
  for (const path of ['/ah/api/meetings', '/ah/api/meetings/monday', '/ah/api/reports', '/ah/api/briefs?act=all']) {
    const r = await get(path, 'limited');
    assert.equal(r.status, 200, path);
    const text = JSON.stringify({ ...r.json, meetings: undefined });   // a meeting's own notes are not split per brand (old rule)
    for (const id of RIVER_IDS) assert.ok(!text.includes(id), `${path} holds ${id}`);
  }
  const list = await get('/ah/api/meetings', 'limited');
  /* The answer filter drops a key that looks like a brand id, brand_id among them, as the old guard did. So by name. */
  assert.deepEqual(list.json.open.map(g => g.name), ['Agency-wide', 'North Kites']);
});

test('the ported reads stay inside the statement budget and make no call they do not list', async () => {
  const e = env();
  const r = await call(e, 'GET', '/ah/api/meetings/monday', { token: asCaller('owner') });
  assert.equal(r.status, 200);
  const line = e.logs.find(l => l.route === 'GET /ah/api/meetings/monday');
  assert.ok(line.db <= 15, `the Monday screen ran ${line.db} statements`);
  assert.deepEqual(e.calls.filter(c => c.path !== '/api/me').map(c => `${c.worker} ${c.method} ${c.path}`), ['ah GET /api/meetings']);
  const e2 = env();
  await call(e2, 'GET', `/ah/api/reports?act=${NORTH}`, { token: asCaller('owner') });
  assert.deepEqual(e2.calls.filter(c => c.path !== '/api/me'), []);
});

test('reports list before p_report_read exists: the plain list, no read_status', async () => {
  const e = env();
  e.DB.exec('DROP TABLE p_report_read');
  const r = await call(e, 'GET', `/ah/api/reports?act=${NORTH}`, { token: asCaller('owner') });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.rows.length, 2);
  assert.ok(!('read_status' in r.json.rows[0]));
});
