/* Every statement the brands group runs. The data door fills in the brand filter (CONTRACT.md section 6).
   A brand's own tables file rows under the brand id. Meta's tables (ads, ad_daily) file rows under the
   ad account id, so they are reached through the brand's Meta connections. */

const META_OF_BRAND = `(SELECT external_id FROM connections WHERE brand_id = {{brand_id}} AND kind = 'meta')`;
const mine = (table, tail = '') => ({ scope: 'brand', sql: `SELECT * FROM ${table} WHERE act_id = {{brand_id}} ${tail}`.trim() });

export const queries = {
  /* GET /ah/api/brands */
  brandRows: { scope: 'brands',
    sql: `SELECT * FROM brands WHERE {{brands:id}} ORDER BY status = 'active' DESC, name` },
  connectionRows: { scope: 'brands',
    sql: `SELECT id, brand_id, kind, external_id, label, is_primary, status, config_json, last_sync, last_error, source
          FROM connections WHERE {{brands:brand_id}} ORDER BY kind, is_primary DESC` },

  /* GET /ah/api/accounts */
  accountRows: { scope: 'brands',
    sql: `SELECT * FROM brand_accounts WHERE {{brands:act_id}} ORDER BY active DESC, name` },
  metaAvailable: { scope: 'brands',
    sql: `SELECT act_id, name, currency, tz, account_status FROM accounts
          WHERE {{brands:act_id}} AND act_id NOT IN (SELECT external_id FROM connections WHERE kind = 'meta') ORDER BY name` },

  /* PUT /ah/api/accounts/:id */
  accountOne: { scope: 'brand',
    sql: `SELECT * FROM brand_accounts WHERE act_id = {{brand_id}}` },
  saveGoals: { scope: 'brand', write: true,
    sql: `UPDATE brands SET name = :name, monthly_budget = :monthly_budget, budgets_json = :budgets_json, tz = :tz,
            target_cpa = :target_cpa, target_roas = :target_roas, goals_json = :goals_json, updated_at = datetime('now')
          WHERE id = {{brand_id}}` },

  /* GET /pw/api/brand and GET /pw/api/brand/rules */
  brandAccount: { scope: 'brand',
    sql: `SELECT act_id, name, currency, tz, target_cpa, target_roas, tw_shop, meta_act FROM brand_accounts WHERE act_id = {{brand_id}}` },
  rulesDoc: { scope: 'brand',
    sql: `SELECT data_json FROM p_br_doc WHERE act_id = {{brand_id}} AND line_id = '' AND key = 'rules'` },
  lines: mine('p_br_line', 'ORDER BY sort, created_at'),
  docs: mine('p_br_doc'),
  personas: mine('p_br_persona', 'ORDER BY sort, updated_at'),
  voc: mine('p_br_voc', 'ORDER BY created_at'),
  comps: mine('p_br_comp', 'ORDER BY sort, name'),
  angles: mine('p_br_angle', 'ORDER BY created_at'),
  concepts: mine('p_br_concept', 'ORDER BY created_at'),
  batches: mine('p_br_batch'),
  runs: mine('p_br_run', 'ORDER BY started_at DESC LIMIT 40'),
  onboard: mine('p_br_onboard'),
  ads: { scope: 'brand',
    sql: `SELECT ad_id, name, created_time, status, media_type FROM ads WHERE act_id IN ${META_OF_BRAND}` },
  adSpend: { scope: 'brand',
    sql: `SELECT ad_id, SUM(spend) spend, MIN(CASE WHEN spend > 0 THEN date END) first, MAX(CASE WHEN spend > 0 THEN date END) last,
            SUM(CASE WHEN date >= :since THEN spend ELSE 0 END) spend30, SUM(impressions) impr, SUM(link_clicks) clicks,
            SUM(video_3s) v3, SUM(add_to_cart) atc
          FROM ad_daily WHERE act_id IN ${META_OF_BRAND} GROUP BY ad_id` },
  adRevenue: { scope: 'brand',
    sql: `SELECT ad_id, SUM(revenue) rev, SUM(orders) orders FROM tw_ad_attr
          WHERE act_id = {{brand_id}} AND model = 'lastPlatformClick' GROUP BY ad_id` },
  adTags: { scope: 'brand',
    sql: `SELECT ad_id, batch_id FROM p_br_adtag WHERE act_id = {{brand_id}}` },
};
