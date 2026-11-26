/* The kernel's own routes. */
import { queries } from './queries.js';
import { compare } from './compare.js';
import { read as readFlags, write as writeFlags } from './flags.js';
import { inner } from './inner.js';
import { describe } from './table.js';
import { registered } from './db.js';
import { DEFINITIONS } from '../numbers/defs.js';

export const name = 'platform';
export { queries };

async function health(ctx) {
  const flags = await readFlags(inner(ctx).env);
  return { ok: true, worker: 'locus-engine', mode: flags.mode, routes: inner(ctx).table.rows.length, time: ctx.now.toISOString() };
}

async function routeList(ctx) {
  const rows = inner(ctx).table.rows.map(describe);
  return { routes: rows, count: rows.length, forwarded: rows.filter(r => r.engine === 'forward').length,
    queries: registered() };
}

async function engineGet(ctx) {
  const flags = await readFlags(inner(ctx).env);
  return { mode: flags.mode, forward: [...flags.forward] };
}

async function enginePut(ctx, input) {
  await writeFlags(ctx, { mode: input.body.mode, forward: input.body.forward });
  return engineGet(ctx);
}

async function definitions() {
  return { definitions: DEFINITIONS };
}

const kernel = { engine: 'new', file: '' };

export const routes = [
  { method: 'GET', path: '/v1/health', access: { public: true, brand: 'none' }, input: null, handler: health,
    doc: 'Is the engine up, which mode it is in and how many routes it has.', source: kernel },
  { method: 'GET', path: '/v1/routes', access: { owner_only: true, brand: 'none' }, input: null, handler: routeList,
    doc: 'Owner only. Every route the engine knows: who may use it, what it is for and whether it is answered here or forwarded.', source: kernel },
  { method: 'POST', path: '/v1/compare', access: { owner_only: true, brand: 'opt' },
    input: { body: { path: 'string' } }, handler: compare,
    doc: 'Owner only. Run one read route on the old engine and on this one, as you, and list the differences.', source: kernel },
  { method: 'GET', path: '/v1/engine', access: { owner_only: true, brand: 'none' }, input: null, handler: engineGet,
    doc: 'Owner only. The switch: the mode (new or old) and the routes that are sent back to the old engine.', source: kernel },
  { method: 'PUT', path: '/v1/engine', access: { owner_only: true, brand: 'none' },
    input: { body: { mode: 'string?', forward: 'string[]?' } }, handler: enginePut,
    doc: 'Owner only. Set the mode to old to send everything back to the old engine, or list single routes to send back.', source: kernel },
  { method: 'GET', path: '/v1/metrics/definitions', access: { team: true, client: true, brand: 'none', scrub: false }, input: null,
    handler: definitions, doc: 'What every number on the screens means, in plain words, with its formula and source.', source: kernel },
];
