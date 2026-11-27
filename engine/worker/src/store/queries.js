/* The store group's statements. Every one is held to the caller's brands by the data door, and then
   pinned to the one brand id the handler took from the caller's own brand list (:act or :acts).
   Tracker tables (tw_*) file rows under the brand id. Ad platform tables file them under the ad
   account id, so those go through the brand's connections. */
// from profit/worker/src/hub.js (STORE_IDS, EMAIL_IDS, twPivotMany, stockAds) and worker.js (pivot, customerJourney)

/* The tracker numbers the sales screens read. */
export const STORE_IDS = ['totalNewGrossSales', 'totalSales', 'netSales', 'totalRefunds', 'totalTaxes', 'totalNetTaxes',
  'totalShippingPrice', 'totalOrders', 'totalOrdersCombinedItemsQuantity', 'newCustomersOrders', 'newCustomerSales', 'rcRevenue',
  'klaviyoPlacedOrderSales', 'totalAmazonSales', 'totalAmazonOrders', 'amazonNetSales', 'totalAmazonFees', 'totalAmazonRefunds',
  'totalTiktokShopsSales', 'totalTiktokShopsOrders', 'totalTiktokShopsNetSales', 'totalTiktokShopsRefunds', 'totalTiktokShopsFees',
  'pixelCostPerSession', 'pixelCostPerAtc', 'pixelPurchases', 'blendedAds'];

/* The tracker numbers the email screens read. */
export const EMAIL_IDS = ['klaviyoPlacedOrderSales', 'totalKlaviyoPlacedOrderTotalPriceCampaigns',
  'totalKlaviyoPlacedOrderTotalPriceFlows', 'totalKlaviyoClickedEmail', 'totalKlaviyoClickedSms', 'netSales', 'totalNetTaxes'];

/* A fixed list written into the statement text. Never built from what a caller sent. */
const listed = ids => ids.map(id => `'${id}'`).join(', ');
const META_ACCOUNTS = `(SELECT external_id FROM connections WHERE {{brands:brand_id}} AND brand_id = :act AND kind = 'meta')`;

export const queries = {
  storeDays: { scope: 'brands',
    sql: `SELECT act_id, date, metric, value FROM tw_daily WHERE {{brands:act_id}} AND act_id IN (:acts)
          AND date BETWEEN :from AND :to AND metric IN (${listed(STORE_IDS)})` },
  emailDays: { scope: 'brands',
    sql: `SELECT act_id, date, metric, value FROM tw_daily WHERE {{brands:act_id}} AND act_id IN (:acts)
          AND date BETWEEN :from AND :to AND metric IN (${listed(EMAIL_IDS)})` },
  allDays: { scope: 'brands',
    sql: `SELECT date, metric, value FROM tw_daily WHERE {{brands:act_id}} AND act_id = :act AND date BETWEEN :from AND :to` },
  cacDays: { scope: 'brands',
    sql: `SELECT date, metric, value FROM tw_daily WHERE {{brands:act_id}} AND act_id = :act AND date BETWEEN :from AND :to
          AND metric IN ('blendedAds', 'newCustomersOrders')` },
  metaSpendDays: { scope: 'brands',
    sql: `SELECT date, SUM(spend) AS spend FROM daily_insights WHERE act_id IN ${META_ACCOUNTS}
          AND date BETWEEN :from AND :to GROUP BY date` },
  costHealth: { scope: 'brands',
    sql: `SELECT verdict FROM p_cost_health WHERE {{brands:act_id}} AND act_id = :act` },
  costRuleOn: { scope: 'brands',
    sql: `SELECT id FROM p_cost_rule WHERE {{brands:act_id}} AND act_id = :act AND status = 'on' LIMIT 1` },
  adSpendExpense: { scope: 'brands',
    sql: `SELECT id FROM p_expense WHERE {{brands:act_id}} AND act_id = :act AND is_ad_spend <> 0 LIMIT 1` },
  ordersAll: { scope: 'brands',
    sql: `SELECT order_id, customer_id, date, total, products_json, source FROM tw_orders
          WHERE {{brands:act_id}} AND act_id = :act ORDER BY date, order_id` },
  ordersWindow: { scope: 'brands',
    sql: `SELECT products_json, total FROM tw_orders WHERE {{brands:act_id}} AND act_id = :act
          AND date BETWEEN :from AND :to AND products_json IS NOT NULL` },
  productNames: { scope: 'brands',
    sql: `SELECT key, value FROM settings WHERE key IN ('productTitles:' || :act, 'productNames:' || :act)
          AND EXISTS (SELECT 1 FROM brands WHERE {{brands:id}} AND id = :act)` },
  touchOrders: { scope: 'brands',
    sql: `SELECT t.ad_id, o.products_json FROM tw_order_touch t
          JOIN tw_orders o ON o.act_id = t.act_id AND o.order_id = t.order_id
          WHERE {{brands:t.act_id}} AND t.act_id = :act AND t.model = 'lastPlatformClick' AND t.date >= :from` },
  adSpendMonth: { scope: 'brands',
    sql: `SELECT d.ad_id, a.adset_id, SUM(d.spend) s30, SUM(CASE WHEN d.date >= :week THEN d.spend ELSE 0 END) s7
          FROM ad_daily d LEFT JOIN ads a ON a.ad_id = d.ad_id
          WHERE d.act_id IN ${META_ACCOUNTS} AND d.date >= :from GROUP BY d.ad_id` },
  /* The store source switch (profit storesource.js): is there any Shopify store total or setting for these brands? */
  shopAny: { scope: 'brands',
    sql: `SELECT act_id FROM p_shop_daily WHERE {{brands:act_id}} AND act_id IN (:acts) LIMIT 1` },
  storeModeAny: { scope: 'brands',
    sql: `SELECT b.act_id AS act_id FROM brand_accounts b JOIN settings s ON s.key = 'storeSource:' || b.act_id
          WHERE {{brands:b.act_id}} AND b.act_id IN (:acts) LIMIT 1` },
  adsetNames: { scope: 'brands',
    sql: `SELECT adset_id, name FROM meta_adsets WHERE act_id IN ${META_ACCOUNTS}` },
};
