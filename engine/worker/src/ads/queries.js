/* Every statement of the ads group. The brand filter is the door's macro, never caller input.
   `:act` and `:acts` are brand ids the handler took from the caller's own brand list, so each
   statement is held twice: by the macro, and to the exact brands the old query named. */
// from profit/worker/src/hub.js and account-health/worker/src/worker.js, launch.js (the SQL)

/* The Meta ad accounts of one brand. Meta's own tables are filed by ad account id. */
const META_OF = `(SELECT external_id FROM connections WHERE kind = 'meta' AND brand_id = :act AND {{brands:brand_id}})`;
const META_JOIN = `JOIN connections c ON c.kind = 'meta' AND c.external_id = d.act_id`;
const MANY = `{{brands:c.brand_id}} AND c.brand_id IN (:acts)`;
const TWO_WINDOWS = `((d.date BETWEEN :from AND :to) OR (d.date BETWEEN :pf AND :pt))`;
const META_ATTR = `(platform = 'meta' OR platform IS NULL)`;
const COLS = `SUM(d.spend) spend, SUM(d.impressions) impr, SUM(d.reach) reach, SUM(d.link_clicks) clicks, SUM(d.clicks_all) clicks_all,
  SUM(d.add_to_cart) atc, SUM(d.purchases) p_ord, SUM(d.revenue) p_rev, SUM(d.video_3s) v3, SUM(d.video_thruplay) thru,
  SUM(d.video_plays) plays, SUM(d.video_p25) p25, SUM(d.video_p50) p50, SUM(d.video_p75) p75, SUM(d.video_p100) p100,
  SUM(d.leads) leads, SUM(d.initiate_checkout) ic`;
const TODAY_COLS = `SUM(spend) spend, SUM(impressions) impr, SUM(reach) reach, SUM(link_clicks) clicks, SUM(clicks) clicks_all,
  SUM(purchases) p_ord, SUM(revenue) p_rev`;
const ACTIVITY_COLS = `a.id, b.id AS act_id, a.act_id AS meta_act, a.event_time, a.event_type, a.translated, a.actor, a.object_type,
  a.object_id, a.object_name, a.extra_json, a.category, a.summary, a.reason, a.suggested_reason, a.note, a.confirmed, a.manual,
  a.created_at, a.client_why, b.name AS account_name`;
const ACTIVITY_FROM = `FROM activities a JOIN connections c ON c.kind = 'meta' AND c.external_id = a.act_id JOIN brands b ON b.id = c.brand_id`;

const many = {
  metaTotalsMany: { scope: 'brands',
    sql: `SELECT c.brand_id act_id, CASE WHEN d.date >= :from THEN 'cur' ELSE 'prev' END win, ${COLS} FROM ad_daily d ${META_JOIN}
          WHERE ${MANY} AND ${TWO_WINDOWS} GROUP BY c.brand_id, win` },
  metaDaysMany: { scope: 'brands',
    sql: `SELECT c.brand_id act_id, d.date, SUM(d.spend) spend, SUM(d.impressions) impr, SUM(d.link_clicks) clicks,
          SUM(d.purchases) p_ord, SUM(d.revenue) p_rev FROM ad_daily d ${META_JOIN}
          WHERE ${MANY} AND ${TWO_WINDOWS} GROUP BY c.brand_id, d.date` },
  metaTodayMany: { scope: 'brands',
    sql: `SELECT c.brand_id act_id, SUM(d.spend) spend, SUM(d.impressions) impr, SUM(d.reach) reach, SUM(d.link_clicks) clicks,
          SUM(d.clicks) clicks_all, SUM(d.purchases) p_ord, SUM(d.revenue) p_rev FROM daily_insights d ${META_JOIN}
          WHERE ${MANY} AND d.date = :day GROUP BY c.brand_id` },
  leadSplitMany: { scope: 'brands',
    sql: `SELECT c.brand_id act_id, CASE WHEN d.date >= :from THEN 'cur' ELSE 'prev' END win, SUM(d.spend) spend, SUM(d.leads) leads
          FROM ad_daily d ${META_JOIN} JOIN ads x ON x.ad_id = d.ad_id JOIN meta_campaigns mc ON mc.campaign_id = x.campaign_id
          WHERE mc.objective IN ('OUTCOME_LEADS', 'LEAD_GENERATION') AND ${MANY} AND ${TWO_WINDOWS} GROUP BY c.brand_id, win` },
  attrMetaMany: { scope: 'brands',
    sql: `SELECT act_id, date, SUM(revenue) rev, SUM(orders) ord FROM tw_ad_attr WHERE {{brands:act_id}} AND act_id IN (:acts)
          AND model = :model AND date BETWEEN :from AND :to AND ${META_ATTR} GROUP BY act_id, date` },
  attrPlatformMany: { scope: 'brands',
    sql: `SELECT act_id, date, SUM(revenue) rev, SUM(orders) ord FROM tw_ad_attr WHERE {{brands:act_id}} AND act_id IN (:acts)
          AND model = :model AND date BETWEEN :from AND :to AND platform = :platform GROUP BY act_id, date` },
  trackerDaysMany: { scope: 'brands',
    sql: `SELECT act_id, date, metric, value FROM tw_daily WHERE {{brands:act_id}} AND act_id IN (:acts)
          AND date BETWEEN :from AND :to AND metric IN (:metrics)` },
  newOrdersBySource: { scope: 'brands',
    sql: `SELECT o.act_id, o.source, COUNT(*) n FROM tw_orders o WHERE {{brands:o.act_id}} AND o.act_id IN (:acts)
          AND o.date BETWEEN :from AND :to AND o.customer_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM tw_orders p WHERE p.act_id = o.act_id AND p.customer_id = o.customer_id AND p.date < o.date)
          GROUP BY o.act_id, o.source` },
  /* The store source switch (profit storesource.js): any Shopify store totals or a store source setting for these
     brands? Then the all channels view goes to the old worker, which holds the switch. */
  shopAny: { scope: 'brands',
    sql: `SELECT act_id FROM p_shop_daily WHERE {{brands:act_id}} AND act_id IN (:acts) LIMIT 1` },
  storeModeAny: { scope: 'brands',
    sql: `SELECT b.act_id AS act_id FROM brand_accounts b JOIN settings s ON s.key = 'storeSource:' || b.act_id
          WHERE {{brands:b.act_id}} AND b.act_id IN (:acts) LIMIT 1` },
  goalDocs: { scope: 'brands',
    sql: `SELECT act_id, data_json FROM p_br_doc WHERE {{brands:act_id}} AND act_id IN (:acts) AND line_id = '' AND key = 'rules'` },
};

const one = {
  metaTotalOne: { scope: 'brands',
    sql: `SELECT ${COLS} FROM ad_daily d WHERE d.act_id IN ${META_OF} AND d.date BETWEEN :from AND :to` },
  metaTodayOne: { scope: 'brands',
    sql: `SELECT ${TODAY_COLS} FROM daily_insights WHERE act_id IN ${META_OF} AND date = :day` },
  attrTotalOne: { scope: 'brands',
    sql: `SELECT SUM(revenue) rev, SUM(orders) ord, COUNT(*) n FROM tw_ad_attr WHERE {{brands:act_id}} AND act_id = :act
          AND model = :model AND date BETWEEN :from AND :to AND ${META_ATTR}` },
  attrByAdDay: { scope: 'brands',
    sql: `SELECT ad_id, date, SUM(revenue) rev, SUM(orders) ord FROM tw_ad_attr WHERE {{brands:act_id}} AND act_id = :act
          AND model = :model AND date BETWEEN :from AND :to AND ${META_ATTR} GROUP BY ad_id, date` },
  metaDaysByCampaign: { scope: 'brands',
    sql: `SELECT d.date, COALESCE(x.campaign_id, '?') campaign_id, ${COLS} FROM ad_daily d LEFT JOIN ads x ON x.ad_id = d.ad_id
          WHERE d.act_id IN ${META_OF} AND d.date BETWEEN :from AND :to GROUP BY d.date, campaign_id ORDER BY d.date` },
  metaDaysOne: { scope: 'brands',
    sql: `SELECT d.date, SUM(d.spend) spend, SUM(d.purchases) p_ord, SUM(d.revenue) p_rev, SUM(d.impressions) impr,
          SUM(d.link_clicks) clicks FROM ad_daily d WHERE d.act_id IN ${META_OF} AND d.date BETWEEN :from AND :to
          GROUP BY d.date ORDER BY d.date` },
  metaAdRows: { scope: 'brands',
    sql: `SELECT d.ad_id, x.name ad_name, x.adset_id, x.campaign_id, x.media_type, x.first_spend_date, x.created_time, ${COLS}
          FROM ad_daily d LEFT JOIN ads x ON x.ad_id = d.ad_id WHERE d.act_id IN ${META_OF} AND d.date BETWEEN :from AND :to
          GROUP BY d.ad_id` },
  campaigns: { scope: 'brands',
    sql: `SELECT campaign_id, name, objective, status, daily_budget, lifetime_budget, bid_strategy FROM meta_campaigns
          WHERE act_id IN ${META_OF}` },
  adsets: { scope: 'brands',
    sql: `SELECT adset_id, campaign_id, name, status, daily_budget, optimization_goal, min_spend FROM meta_adsets
          WHERE act_id IN ${META_OF}` },
  prevBySet: { scope: 'brands',
    sql: `SELECT x.campaign_id, x.adset_id, SUM(d.spend) spend, SUM(d.purchases) p_ord FROM ad_daily d
          LEFT JOIN ads x ON x.ad_id = d.ad_id WHERE d.act_id IN ${META_OF} AND d.date BETWEEN :from AND :to GROUP BY x.adset_id` },
  prevAdIds: { scope: 'brands',
    sql: `SELECT DISTINCT d.ad_id, x.adset_id, x.campaign_id FROM ad_daily d LEFT JOIN ads x ON x.ad_id = d.ad_id
          WHERE d.act_id IN ${META_OF} AND d.date BETWEEN :from AND :to` },
  chartChanges: { scope: 'brands',
    sql: `SELECT substr(event_time,1,10) date, category, summary, actor, object_name FROM activities
          WHERE act_id IN ${META_OF} AND substr(event_time,1,10) BETWEEN :from AND :to
          AND category IN ('budget','new_campaign','campaign_paused','campaign_relaunched','bid_strategy','new_creative','new_adset','manual')
          ORDER BY event_time DESC LIMIT 60` },
};

const creative = {
  creativeAds: { scope: 'brands',
    sql: `SELECT d.ad_id, x.name, x.media_type, x.first_spend_date, x.created_time, x.campaign_id, x.adset_id, x.asset_key,
          MAX(d.date) last_day, ${COLS} FROM ad_daily d LEFT JOIN ads x ON x.ad_id = d.ad_id
          WHERE d.act_id IN ${META_OF} AND d.date BETWEEN :from AND :to GROUP BY d.ad_id HAVING SUM(d.spend) > 0` },
  batchAngles: { scope: 'brands',
    sql: `SELECT b.num, g.name angle FROM p_br_batch b LEFT JOIN p_br_angle g ON g.id = b.angle_id
          WHERE {{brands:b.act_id}} AND b.act_id = :act` },
  adTags: { scope: 'brands',
    sql: `SELECT asset_key, tags_json FROM ad_tag WHERE act_id IN ${META_OF} AND tags_json IS NOT NULL` },
  adDaysSpend: { scope: 'brands',
    sql: `SELECT d.ad_id, d.date, d.spend, d.impressions, d.link_clicks, d.purchases FROM ad_daily d
          WHERE d.act_id IN ${META_OF} AND d.date BETWEEN :from AND :to AND d.spend > 0` },
  adFirsts: { scope: 'brands',
    sql: `SELECT ad_id, first_spend_date, created_time FROM ads WHERE act_id IN ${META_OF}` },
  valueByAd: { scope: 'brands',
    sql: `WITH firsts AS (SELECT customer_id, MIN(date) fd FROM tw_orders WHERE {{brands:act_id}} AND act_id = :act
            AND customer_id IS NOT NULL GROUP BY customer_id),
          fo AS (SELECT o.order_id, o.customer_id, o.date fd, o.total ft FROM tw_orders o
            JOIN firsts f ON f.customer_id = o.customer_id AND f.fd = o.date WHERE o.act_id = :act AND o.date <= date(:as_of, '-90 day')),
          acq AS (SELECT DISTINCT t.ad_id, fo.customer_id, fo.fd, fo.ft FROM tw_order_touch t JOIN fo ON fo.order_id = t.order_id
            WHERE t.act_id = :act AND t.model = 'fullFirstClick' AND (t.platform = 'meta' OR t.platform IS NULL)),
          val AS (SELECT a.ad_id, a.customer_id, a.ft, (SELECT SUM(o.total) FROM tw_orders o WHERE o.act_id = :act
            AND o.customer_id = a.customer_id AND o.date >= a.fd AND o.date <= date(a.fd, '+90 day')) v90 FROM acq a)
          SELECT ad_id, COUNT(*) n, SUM(ft) first, SUM(v90) v90 FROM val GROUP BY ad_id` },
};

const changes = {
  activitiesAll: { scope: 'brands',
    sql: `SELECT ${ACTIVITY_COLS} ${ACTIVITY_FROM} WHERE {{brands:c.brand_id}} AND b.status = 'active'
          AND a.event_time BETWEEN :from AND :to ORDER BY a.event_time DESC LIMIT :limit` },
  activitiesOne: { scope: 'brand',
    sql: `SELECT ${ACTIVITY_COLS} ${ACTIVITY_FROM} WHERE {{brand:c.brand_id}} AND c.brand_id = :act
          AND a.event_time BETWEEN :from AND :to ORDER BY a.event_time DESC LIMIT :limit` },
  updateRows: { scope: 'brand',
    sql: `SELECT a.id, a.event_time, a.event_type, a.actor, a.object_type, a.object_id, a.object_name, a.category, a.summary,
          a.client_why AS reason, a.note, a.manual FROM activities a
          JOIN connections c ON c.kind = 'meta' AND c.external_id = a.act_id
          WHERE {{brand:c.brand_id}} AND c.brand_id = :act AND a.event_time BETWEEN :from AND :to AND a.confirmed <> -1
          AND TRIM(COALESCE(a.client_why, '')) <> '' ORDER BY a.event_time DESC LIMIT 400` },
  metaWrites: { scope: 'brand',
    sql: `SELECT id, level, object, name, action, field, before, after, undone FROM p_meta_write
          WHERE id IN (:ids) AND ({{brand:brand}} OR brand IS NULL)` },
  otherWrites: { scope: 'brand',
    sql: `SELECT id, platform, object, name, action, before, after, undone, at FROM p_ext_write
          WHERE {{brand:brand}} AND brand = :act AND at BETWEEN :from AND :to` },
  launchesAll: { scope: 'brands',
    sql: `SELECT * FROM p_launch WHERE {{brands:act}} ORDER BY at DESC LIMIT 500` },
  launchesOne: { scope: 'brand',
    sql: `SELECT * FROM p_launch WHERE {{brand:act}} AND act = :act ORDER BY at DESC LIMIT 200` },
  launchesToLink: { scope: 'brand',
    sql: `SELECT COUNT(*) n FROM p_launch l WHERE {{brand:l.act}} AND l.act = :act AND l.batch_id IS NULL AND l.num IS NOT NULL
          AND EXISTS (SELECT 1 FROM p_br_batch b WHERE b.act_id = l.act AND b.num = l.num)` },
  launchesToFile: { scope: 'brand',
    sql: `SELECT COUNT(*) n FROM p_launch l JOIN p_br_batch b ON b.id = l.batch_id WHERE {{brand:l.act}} AND l.act = :act
          AND l.filed_at IS NULL AND b.verdict IN ('winner', 'loser', 'cancelled')` },
};

export const queries = { ...many, ...one, ...creative, ...changes };
