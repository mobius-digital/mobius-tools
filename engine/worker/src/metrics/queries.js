/* Every statement the metrics group runs. The brand filter is filled in by the data door from the caller's
   scope. `:acts` narrows further to the brands this request builds and never widens it.
   Store tables (tw_daily, tw_ad_attr, p_*) are filed under the brand id. Ad platform tables
   (daily_insights, activities, ads) are filed under the ad account id, reached through `connections`. */
// from profit/worker/src/worker.js (pivot, seriesFor, channelsFor, /api/overview, /api/plan),
//      profit/worker/src/costs.js (loadCostRules), expenses.js (loadExpenses),
//      account-health/worker/src/worker.js (/api/series, twMetaDaily, seriesEvents)
import { TW_METRICS } from './money.js';

const metricList = TW_METRICS.map(m => `'${m}'`).join(', ');
const META_OF_ACT = `(SELECT external_id FROM connections WHERE brand_id = :act AND kind = 'meta')`;
const TW_META_ROW = `(t.platform = 'meta' OR (t.platform IS NULL AND a.ad_id IS NOT NULL))`;

export const queries = {
  twDays: { scope: 'brands',
    sql: `SELECT act_id, date, metric, value FROM tw_daily
          WHERE {{brands:act_id}} AND act_id IN (:acts) AND date BETWEEN :from AND :to AND metric IN (${metricList})` },
  metaSpendDays: { scope: 'brands',
    sql: `SELECT c.brand_id AS act_id, d.date AS date, SUM(d.spend) AS spend FROM daily_insights d
          JOIN (SELECT DISTINCT brand_id, external_id FROM connections WHERE kind = 'meta') c ON c.external_id = d.act_id
          WHERE {{brands:c.brand_id}} AND c.brand_id IN (:acts) AND d.date BETWEEN :from AND :to
          GROUP BY c.brand_id, d.date` },
  costRulesOn: { scope: 'brands',
    sql: `SELECT * FROM p_cost_rule WHERE {{brands:act_id}} AND act_id IN (:acts) AND status = 'on' ORDER BY id` },
  expensesOf: { scope: 'brands',
    sql: `SELECT * FROM p_expense WHERE {{brands:act_id}} AND act_id IN (:acts) ORDER BY id` },
  attrDays: { scope: 'brands',
    sql: `SELECT act_id, date, platform, SUM(revenue) AS rev, SUM(orders) AS ord FROM tw_ad_attr
          WHERE {{brands:act_id}} AND act_id IN (:acts) AND model = 'lastPlatformClick' AND date BETWEEN :from AND :to
          GROUP BY act_id, date, platform` },
  costHealth: { scope: 'brands',
    sql: `SELECT * FROM p_cost_health WHERE {{brands:act_id}}` },
  connKinds: { scope: 'brands',
    sql: `SELECT brand_id, kind FROM connections WHERE {{brands:brand_id}}` },
  /* Shopify daily store totals (profit shopsync.js) and the brand's store source setting (storesource.js).
     Read on their own, softly: the table only exists once the first store has synced. */
  shopDays: { scope: 'brands',
    sql: `SELECT act_id, day, sales, total_sales, taxes, shipping, gross_sales, refunds, orders, new_orders,
                 returning_orders, zero_orders, orders_source, synced_at, orders_at FROM p_shop_daily
          WHERE {{brands:act_id}} AND act_id IN (:acts) AND day BETWEEN :from AND :to` },
  storeModes: { scope: 'brands',
    sql: `SELECT b.act_id AS act_id, s.value AS value FROM brand_accounts b
          JOIN settings s ON s.key = 'storeSource:' || b.act_id WHERE {{brands:b.act_id}} AND b.act_id IN (:acts)` },
  emailTools: { scope: 'brands',
    sql: `SELECT b.act_id AS act_id, s.value AS value FROM brand_accounts b
          JOIN settings s ON s.key = 'emailTool:' || b.act_id WHERE {{brands:b.act_id}}` },
  planRow: { scope: 'brand',
    sql: `SELECT * FROM p_plan WHERE {{brand:act_id}} AND act_id = :act AND month = :month` },
  adDays: { scope: 'brand',
    sql: `SELECT d.* FROM daily_insights d
          WHERE {{brand:d.act_id}} AND d.act_id IN ${META_OF_ACT} AND d.date >= :from ORDER BY d.date` },
  twMetaDays: { scope: 'brand',
    sql: `SELECT t.date AS date,
                 SUM(CASE WHEN ${TW_META_ROW} THEN t.revenue ELSE 0 END) AS rev,
                 SUM(CASE WHEN ${TW_META_ROW} THEN t.orders ELSE 0 END) AS ord
          FROM tw_ad_attr t LEFT JOIN ads a ON a.ad_id = t.ad_id AND a.act_id IN ${META_OF_ACT}
          WHERE {{brand:t.act_id}} AND t.act_id = :act AND t.model = 'lastPlatformClick' AND t.date >= :from AND t.date <= :to
          GROUP BY t.date` },
  chartEvents: { scope: 'brand',
    sql: `SELECT id, event_time, category, summary, reason, suggested_reason, manual FROM activities
          WHERE {{brand:act_id}} AND act_id IN ${META_OF_ACT} AND event_time >= :from AND confirmed != -1
            AND (category IN ('budget','new_campaign','campaign_paused','campaign_relaunched','bid_strategy','targeting') OR manual = 1)
          ORDER BY event_time` },
};
