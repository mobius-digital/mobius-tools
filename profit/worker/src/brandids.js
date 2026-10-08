/* Brand ids for the profit worker (brand-first phase 3, 2026-10-08).
 *
 * A local copy of the helpers in account-health/worker/src/brands.js that this worker needs. The
 * two workers are bundled separately and this one has never imported across folders, so these are
 * duplicated on purpose. KEEP THEIR BEHAVIOUR IDENTICAL to brands.js; change both or neither.
 *
 *   brand id     `brand_<slug>`. Every brand-owned table (p_*, tw_*, briefs, settings keys) files
 *                rows under it, in a column still called act_id.
 *   Meta tables  (accounts, activities, ad_daily, ads, daily_insights, hourly_insights, meta_adsets,
 *                meta_campaigns) stay keyed by the Meta ad account id (act_123...). A brand's Meta
 *                rows are `act_id IN ${metaOf(n)}` with ?n bound to the brand id.
 *   brand_accounts  a VIEW: each brand shaped like the old accounts row (act_id = brand id),
 *                plus meta_act (primary Meta account, null when none) and storage_prefix. */

/** SQL: the Meta ad account ids of the brand bound at ?n. Use as `act_id IN ${metaOf(1)}` on Meta tables. */
export const metaOf = n => `(SELECT external_id FROM connections WHERE brand_id = ?${n} AND kind = 'meta')`;

/** A brand id as the routes accept it (old act_ / asana_ ids are resolved to one by `resolveBrandId`). */
export const isBrandId = s => /^brand_[a-z0-9_]+$/.test(String(s || ''));

/** Any id a brand has ever had (brand_x, act_123, asana_456, its slug) -> the brand row, or null. */
async function brandOf(env, id) {
  if (!id) return null;
  const s = String(id);
  return (await env.DB.prepare(`SELECT * FROM brands WHERE id = ?1 OR slug = ?1 OR legacy_key = ?1 LIMIT 1`).bind(s).first())
    || (await env.DB.prepare(`SELECT b.* FROM brand_alias a JOIN brands b ON b.id = a.brand_id WHERE a.alias = ?1`).bind(s).first())
    || null;
}

/** Any id (brand id, old act_ id, asana_ id, demo id, slug) -> the brand id, or the input when unknown ('all' stays 'all'). */
export async function resolveBrandId(env, id) {
  if (!id || id === 'all' || isBrandId(id)) return id;
  const b = await brandOf(env, id).catch(() => null);
  return b ? b.id : id;
}

/** The R2 folder for a brand's files: its storage_prefix (old act id, where its files already are) or its id. */
export async function storagePrefix(env, brandId) {
  const bid = await resolveBrandId(env, brandId);
  const r = await env.DB.prepare(`SELECT storage_prefix FROM brands WHERE id = ?1`).bind(bid).first().catch(() => null);
  return r?.storage_prefix || bid;
}

