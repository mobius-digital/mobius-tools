/* Group production: every statement by name. The data door fills the brand filter (CONTRACT.md section 6). */

/* One text the search words are matched against. */
const HAY = `lower(COALESCE(descr,'') || ' ' || COALESCE(name,'') || ' ' || COALESCE(products,'') || ' ' || COALESCE(tags_json,'') || ' ' || COALESCE(path,''))`;
const WORDS = [1, 2, 3, 4, 5, 6].map(i => `AND (:w${i} = '' OR ${HAY} LIKE :w${i})`).join('\n          ');

export const queries = {
  /* ---- requests and approvals ---- */
  requestRows: { scope: 'brands',
    sql: `SELECT * FROM p_request WHERE {{brands:act_id}} AND (:exact = '' OR act_id = :exact)
          AND (status != 'done' OR updated_at >= :since) ORDER BY updated_at DESC LIMIT 200` },
  requestMessages: { scope: 'brands',
    sql: `SELECT m.* FROM p_request_msg m JOIN p_request r ON r.id = m.request_id
          WHERE {{brands:r.act_id}} AND m.request_id IN (:ids) ORDER BY m.created_at` },
  brandNames: { scope: 'brands',
    sql: `SELECT act_id, name FROM brand_accounts WHERE {{brands:act_id}}` },
  studioAds: { scope: 'brands',
    sql: `SELECT id, status, has_final, updated_at, spec_json FROM p_studio_ad WHERE {{brands:act_id}} AND id IN (:ids)` },
  /* The calendar database. Old rows carry the brand as a slug, new rows as a brand id. */
  calendarDates: { scope: 'brands',
    sql: `SELECT id, name, type, status, brief, launch_date, promo_end_date FROM (
            SELECT id, name, type, status, brief, launch_date, promo_end_date,
              COALESCE(NULLIF(locus_brand, ''), 'brand_' || replace(brand_id, '-', '_')) AS act FROM events WHERE id IN (:ids))
          WHERE {{brands:act}}` },

  /* ---- the photo library ---- */
  assetRows: { scope: 'brand',
    sql: `SELECT file_id, name, path, w, h, status, people, setting, shot, products, colors, descr, thumb_key, modified,
            source, kind, cost, look_json
          FROM p_asset WHERE act_id = {{brand_id}} AND status IN ('tagged', 'new')
          AND (:people = '' OR (:people = 'yes' AND people > 0) OR (:people = 'no' AND people = 0))
          AND (:setting = '' OR setting = :setting)
          AND (:locus = 0 OR source = 'locus')
          ${WORDS}
          ORDER BY modified DESC LIMIT :limit` },
  assetCounts: { scope: 'brand',
    sql: `SELECT status, COUNT(*) n FROM p_asset WHERE act_id = {{brand_id}} GROUP BY status` },
  assetSettings: { scope: 'brand',
    sql: `SELECT setting, COUNT(*) n FROM p_asset WHERE act_id = {{brand_id}} AND status = 'tagged' GROUP BY setting ORDER BY n DESC` },
  assetLooks: { scope: 'brand',
    sql: `SELECT COUNT(*) n FROM p_asset WHERE act_id = {{brand_id}} AND source = 'locus' AND status = 'tagged'` },
  assetSyncedAt: { scope: 'brand',
    sql: `SELECT value FROM settings WHERE key = 'assetsSyncAt:' || {{brand_id}}` },
  assetDrive: { scope: 'brand',
    sql: `SELECT external_id FROM connections WHERE brand_id = {{brand_id}} AND kind = 'drive' ORDER BY is_primary DESC, added_at LIMIT 1` },
  assetFolders: { scope: 'brand',
    sql: `SELECT data_json FROM p_br_doc WHERE act_id = {{brand_id}} AND line_id = '' AND key = 'assets'` },

  /* ---- saved reference ads ---- */
  inspoRows: { scope: 'brand',
    sql: `SELECT * FROM p_inspo WHERE act_id = {{brand_id}} ORDER BY created_at DESC LIMIT 200` },
};
