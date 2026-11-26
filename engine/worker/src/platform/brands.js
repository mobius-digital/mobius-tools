/* Brands. A brand is known by its brand id and by every id it ever had (an old id, an ad account id). */
// from account-health/worker/src/brands.js (brandOf, resolveBrandId) and brandguard.js (expandIds)
import './kernelq.js';
import { door, scopeOfCaller, SYSTEM, SYSTEM_SCOPE } from './db.js';
import { safeJson, isBrandId } from './text.js';
import { inner } from './inner.js';

const sys = (env, counters) => door(env, SYSTEM_SCOPE, counters || {}, 'DB', SYSTEM);

/** Any id a brand answers to -> its brand id. '' when no brand answers to it. 'all' stays 'all'. */
export async function resolveBrandId(env, anyId, counters) {
  const id = String(anyId || '');
  if (!id) return '';
  if (id === 'all') return 'all';
  const db = sys(env, counters);
  const row = (await db.one('platform.brandByAnyId', { id })) || (await db.one('platform.brandByAlias', { id }));
  return row && row.id ? row.id : '';
}

/** Every id a list of brands answers to, the brand ids included. */
export async function expandIds(env, brandIds, counters) {
  const list = [...new Set((brandIds || []).map(String).filter(Boolean))];
  const ids = new Set(list);
  if (!list.length) return ids;
  const db = sys(env, counters);
  const bids = (await db.all('platform.brandIdsOf', { list })).map(r => r.id).filter(Boolean);
  for (const b of bids) ids.add(b);
  if (bids.length) for (const r of await db.all('platform.aliasesOf', { list: bids })) if (r.id) ids.add(r.id);
  return ids;
}

/** The brand ids (never an old id) in a list of mixed ids. */
export async function brandIdsIn(env, anyIds, counters) {
  const list = [...new Set((anyIds || []).map(String).filter(Boolean))];
  if (!list.length) return [];
  const found = (await sys(env, counters).all('platform.brandIdsOf', { list })).map(r => r.id).filter(isBrandId);
  return [...new Set(found)];
}

const shaped = row => ({ ...row, budgets: safeJson(row.budgets_json, {}), goals: safeJson(row.goals_json, {}) });

/** The caller's brands, as rows of the old brand list (the brand_accounts view). Demo brands are left out. */
export async function listBrands(ctx, { active = true } = {}) {
  const db = inner(ctx).doorFor(scopeOfCaller(ctx.caller));
  return (await db.all('platform.brandList', { active: active ? 1 : 0 })).map(shaped);
}

/** One of the caller's brands by brand id, or null. */
export async function oneBrand(ctx, brandId) {
  if (!brandId) return null;
  const row = await inner(ctx).doorFor(scopeOfCaller(ctx.caller)).one('platform.brandOne', { id: String(brandId) });
  return row ? shaped(row) : null;
}

/** The bound form a handler gets as ctx.brands. */
export function brandsFor(ctx) {
  return { list: opts => listBrands(ctx, opts), one: id => oneBrand(ctx, id) };
}
