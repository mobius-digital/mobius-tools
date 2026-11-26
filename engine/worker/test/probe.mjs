/* A made up group used only by the kernel's own tests. It has one small table (p_inspo, a table the
   access check knows) and a route of every kind. */
import { fail } from '../src/platform/errors.js';

export const SCHEMA = `CREATE TABLE IF NOT EXISTS p_inspo (id TEXT PRIMARY KEY, act_id TEXT, title TEXT, slack_channel TEXT, notes_internal TEXT);`;

export const ROWS = { p_inspo: [
  { id: 'n1', act_id: 'brand_north_kites', title: 'north one', slack_channel: 'C0NORTH0001', notes_internal: 'team only' },
  { id: 'n2', act_id: 'act_111', title: 'north old id', slack_channel: null, notes_internal: null },
  { id: 'r1', act_id: 'brand_river_tea', title: 'river one', slack_channel: 'C0RIVER0001', notes_internal: 'team only' },
] };

const queries = {
  one: { scope: 'brand', sql: `SELECT id, act_id, title, slack_channel, notes_internal FROM p_inspo WHERE {{brand:act_id}} ORDER BY id` },
  many: { scope: 'brands', sql: `SELECT id, act_id, title FROM p_inspo WHERE {{brands:act_id}} ORDER BY {{pick:order}}`,
    pick: { order: { id: 'id', title: 'title DESC' } } },
  unfiltered: { scope: 'none', why: 'a test of the last filter: this statement forgets the brand on purpose',
    sql: `SELECT id, act_id, title FROM p_inspo ORDER BY id` },
  rename: { scope: 'brand', write: true, sql: `UPDATE p_inspo SET title = :title WHERE id = :id AND {{brand:act_id}}` },
  add: { scope: 'brand', write: true, sql: `INSERT INTO p_inspo (id, act_id, title) VALUES (:id, {{brand_id}}, :title)` },
  mine: { scope: 'none', why: 'a per person row, held to the caller by :email',
    sql: `SELECT value FROM settings WHERE key = 'prefs:' || :email` },
};

const src = (extra = {}) => ({ old: 'pw', file: 'test/probe.mjs', engine: 'new', ...extra });
const open = { team: true, client: true };

export const probe = { name: 'probe', queries, routes: [
  { method: 'GET', path: '/pw/api/probe/one', access: { ...open, brand: 'need' }, input: { query: { act: 'brand?' } },
    handler: async ctx => ({ rows: await ctx.db.all('probe.one') }), doc: 'The rows of one brand.', source: src() },
  { method: 'GET', path: '/pw/api/probe/many', access: { ...open, brand: 'opt' }, input: { query: { act: 'brand?', order: 'string?', days: 'int?' } },
    handler: async (ctx, input) => ({ rows: await ctx.db.all('probe.many', { order: input.query.order || 'id' }), days: input.query.days ?? null }),
    doc: 'The rows of every brand in scope.', source: src() },
  { method: 'GET', path: '/pw/api/probe/unfiltered', access: { ...open, brand: 'opt' }, input: null,
    handler: async ctx => ({ rows: await ctx.db.all('probe.unfiltered') }), doc: 'Rows with no brand filter, team only statement.', source: src() },
  { method: 'PUT', path: '/pw/api/probe/item', input: { body: { id: 'id', title: 'string', note: 'string?' } },
    access: { ...open, brand: 'need', fields: ['id', 'title'], own: [{ in: 'body', key: 'id', table: 'p_inspo' }] },
    handler: async (ctx, input) => ({ ok: true, ...(await ctx.db.run('probe.rename', { id: input.body.id, title: input.body.title })) }),
    doc: 'Rename one row of the brand.', source: src() },
  { method: 'POST', path: '/pw/api/probe/item', input: { body: { id: 'id', title: 'string' } }, access: { ...open, brand: 'need' },
    handler: async (ctx, input) => ({ ok: true, ...(await ctx.db.run('probe.add', { id: input.body.id, title: input.body.title })) }),
    doc: 'Add one row to the brand.', source: src() },
  { method: 'GET', path: '/pw/api/probe/fwd', access: { ...open, brand: 'opt' }, input: null, handler: 'forward',
    doc: 'A forwarded read.', source: src({ engine: 'forward', why: 'a test forward' }) },
  { method: 'POST', path: '/ah/api/probe/fwd', access: { team: true, brand: 'opt' }, input: null, handler: 'forward',
    doc: 'A forwarded write.', source: src({ old: 'ah', engine: 'forward', why: 'a test forward' }) },
  { method: 'GET', path: '/pw/api/probe/boom', access: { team: true, brand: 'none' }, input: null,
    handler: async () => { throw new TypeError('a bug in a handler'); }, doc: 'A handler that breaks.', source: src() },
  { method: 'PUT', path: '/pw/api/probe/boom', access: { team: true, brand: 'none' }, input: null,
    handler: async () => { throw new TypeError('a bug in a write'); }, doc: 'A write that breaks.', source: src() },
  { method: 'GET', path: '/pw/api/probe/gone', access: { team: true, brand: 'none' }, input: null,
    handler: async () => fail(404, 'unknown account'), doc: 'A handler that answers 404.', source: src() },
  { method: 'GET', path: '/pw/api/probe/setting', access: { ...open, brand: 'none' }, input: null,
    handler: async ctx => ({ value: await ctx.settings.get('probeSetting', 'none') }), doc: 'An agency setting.', source: src() },
  { method: 'GET', path: '/pw/api/probe/mine', access: { ...open, brand: 'none' }, input: { query: { as: 'string?' } },
    handler: async (ctx, input) => ({ row: await ctx.db.one('probe.mine', { email: input.query.as || ctx.caller.email }) }),
    doc: 'A per person row.', source: src() },
  { method: 'GET', path: '/pw/api/probe/later', access: { team: true, brand: 'none' }, input: { query: { live: 'bool?' } },
    handler: async (ctx, input) => (input.query.live ? ctx.forward('a live read') : { data: { ok: true }, meta: { source: 'test', window: { from: '2026-01-01', to: '2026-01-07', tz: 'UTC' } } }),
    doc: 'Forwards one request when asked for a live read.', source: src() },
  { method: 'GET', path: '/pw/api/probe/borrow', access: { team: true, brand: 'none' }, input: null,
    handler: async ctx => ({ connected: (await ctx.legacy.get('ah', '/api/settings', { cache_s: 60 })).chat_connected }),
    doc: 'Borrows one field from the old engine.', source: src({ borrows: ['connected'] }) },
  { method: 'GET', path: '/pw/api/probe/brands', access: { ...open, brand: 'opt' }, input: null,
    handler: async ctx => ({ accounts: await ctx.brands.list(), scope: ctx.scope }), doc: 'The caller\'s brands.', source: src({ compare: { ignore: ['scope'] } }) },
  { method: 'PUT', path: '/ah/api/probe/brand/:id', access: { ...open, brand: 'path', fields: ['name'] }, input: { body: { name: 'string?' }, loose: true },
    handler: async ctx => ({ ok: true, brand: ctx.scope.brand }), doc: 'A brand named in the path.', source: src({ old: 'ah' }) },
  { method: 'PUT', path: '/pw/api/probe/owner', access: { owner_only: true, brand: 'none' }, input: null,
    handler: async () => ({ ok: true }), doc: 'Something only the owner may do.', source: src() },
] };
