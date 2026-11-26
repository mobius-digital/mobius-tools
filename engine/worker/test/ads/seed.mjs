/* Made up rows for the ads tests: two brands, a few ads each, one week and the week before it. */
import { NORTH, RIVER, NORTH_AD_ACCOUNT as N_ACT, RIVER_AD_ACCOUNT as R_ACT } from '../../src/platform/testkit/index.mjs';

export const FROM = '2026-01-05', TO = '2026-01-11';
export const WINDOW = `from=${FROM}&to=${TO}`;
const DAYS = ['2026-01-05', '2026-01-07', '2026-01-10'], BEFORE = ['2025-12-30', '2026-01-02'];

const adDay = (act_id, ad_id, date, spend, more = {}) => ({ act_id, ad_id, date, spend, impressions: spend * 100, reach: spend * 60,
  link_clicks: spend * 2, clicks_all: spend * 3, add_to_cart: 4, purchases: 2, revenue: spend * 2, video_3s: 300, video_thruplay: 90,
  video_plays: 500, video_p25: 200, video_p50: 120, video_p75: 80, video_p100: 40, initiate_checkout: 3, ...more });

const credit = (act_id, ad_id, date, model, revenue, orders, platform = 'meta') => ({ act_id, ad_id, date, model, platform, revenue, orders });

const tracker = (act_id, date, values) => Object.entries(values).map(([metric, value]) => ({ act_id, date, metric, value }));

const TRACKER_DAY = { netSales: 900, totalNetTaxes: 60, blendedAds: 210, fb_ads_spend: 120, ga_adCost: 50, totalGoogleAdsImpressions: 4000,
  totalGoogleAdsClicks: 90, ga_ROAS: 3, googleAllCpa: 25, tiktok_spend: 40, tiktokImpressions: 6000, tiktokCtr: 1.5,
  tiktok_complete_payment_roas: 1.2, tiktokPurchases: 2, amazonAds: 15, amazonAdsConversionValue: 70, klaviyoPlacedOrderSales: 130,
  totalKlaviyoPlacedOrderTotalPriceCampaigns: 80, totalKlaviyoPlacedOrderTotalPriceFlows: 50, newCustomersOrders: 7 };

const TAGS = { format: 'still', hook: 'question', person: 'none', product: 'kite', offer: 'none', message: 'light kites fly higher in soft wind', notes: 'blue sky' };

const activity = (id, act_id, event_time, more = {}) => ({ id, act_id, event_time, event_type: 'update_campaign_budget', actor: 'Team Person',
  object_type: 'CAMPAIGN', object_id: 'c1', object_name: 'Sales campaign', category: 'budget', summary: 'Budget up', confirmed: 1, ...more });

const launch = (id, act, meta_act, more = {}) => ({ id, act, meta_act, source: 'studio', num: '412', ad_id: '1001', ad_name: '412 A | Still',
  adset_id: 's1', adset_name: 'Broad', status: 'PAUSED', eff_status: 'PAUSED', by: 'team@agency.test', at: '2026-01-06T10:00:00Z',
  batch_id: 'b1', filed_at: '2026-01-07T10:00:00Z', verdict: 'winner', learning: 'Stills win', cards: '["a1","a2"]', ...more });

/** The rows makeEnv takes. */
export function seedRows() {
  return {
    brands: [{ id: NORTH, slug: 'north-kites', name: 'North Kites', legacy_key: N_ACT, target_cpa: 30, target_roas: 2.5 }],
    ads: [
      { act_id: N_ACT, ad_id: '1001', name: '412 A | Still', adset_id: 's1', campaign_id: 'c1', first_spend_date: '2026-01-02', media_type: 'image', asset_key: 'k1' },
      { act_id: N_ACT, ad_id: '1002', name: '412 B | Still', adset_id: 's1', campaign_id: 'c1', first_spend_date: '2025-12-30', media_type: 'image', asset_key: 'k2' },
      { act_id: N_ACT, ad_id: '1003', name: 'Giveaway | Video', adset_id: 's2', campaign_id: 'c2', created_time: '2026-01-04T08:00:00', media_type: 'video' },
      { act_id: R_ACT, ad_id: '2001', name: '77 A | Still', adset_id: 's9', campaign_id: 'c9', first_spend_date: '2026-01-03' },
    ],
    ad_daily: [
      ...DAYS.flatMap(d => [adDay(N_ACT, '1001', d, 40), adDay(N_ACT, '1002', d, 25), adDay(N_ACT, '1003', d, 10, { leads: 20, purchases: 0, revenue: 0 }), adDay(R_ACT, '2001', d, 70)]),
      ...BEFORE.flatMap(d => [adDay(N_ACT, '1002', d, 30), adDay(R_ACT, '2001', d, 55)]),
    ],
    daily_insights: [{ act_id: N_ACT, date: TO, spend: 75, impressions: 7000, reach: 4000, clicks: 200, link_clicks: 150, purchases: 5, revenue: 260 }],
    meta_campaigns: [
      { act_id: N_ACT, campaign_id: 'c1', name: 'Sales campaign', objective: 'OUTCOME_SALES', status: 'ACTIVE', daily_budget: 100 },
      { act_id: N_ACT, campaign_id: 'c2', name: 'Giveaway', objective: 'OUTCOME_LEADS', status: 'ACTIVE', daily_budget: 20 },
      { act_id: R_ACT, campaign_id: 'c9', name: 'Tea sales', objective: 'OUTCOME_SALES', status: 'ACTIVE', daily_budget: 90 },
    ],
    meta_adsets: [
      { act_id: N_ACT, adset_id: 's1', campaign_id: 'c1', name: 'Broad', status: 'ACTIVE', optimization_goal: 'OFFSITE_CONVERSIONS', min_spend: 5 },
      { act_id: N_ACT, adset_id: 's2', campaign_id: 'c2', name: 'Leads', status: 'ACTIVE', optimization_goal: 'LEAD_GENERATION' },
      { act_id: R_ACT, adset_id: 's9', campaign_id: 'c9', name: 'Tea broad', status: 'ACTIVE' },
    ],
    tw_ad_attr: [
      ...DAYS.flatMap(d => [credit(NORTH, '1001', d, 'lastPlatformClick', 120, 3), credit(NORTH, '1001', d, 'fullFirstClick', 200, 4),
        credit(NORTH, '1002', d, 'lastPlatformClick', 30, 1), credit(NORTH, 'g1', d, 'lastPlatformClick', 90, 2, 'google'),
        credit(NORTH, 't1', d, 'lastPlatformClick', 20, 1, 'tiktok'), credit(RIVER, '2001', d, 'lastPlatformClick', 310, 6)]),
      ...BEFORE.map(d => credit(NORTH, '1002', d, 'lastPlatformClick', 45, 1)),
    ],
    tw_daily: [...DAYS, ...BEFORE].flatMap(d => [...tracker(NORTH, d, TRACKER_DAY), ...tracker(RIVER, d, { netSales: 4000, totalNetTaxes: 200, blendedAds: 300 })]),
    tw_orders: [
      { act_id: NORTH, order_id: 'o1', customer_id: 'cu1', date: '2025-09-01', total: 50, source: 'meta' },
      { act_id: NORTH, order_id: 'o2', customer_id: 'cu1', date: '2025-10-01', total: 30, source: 'meta' },
      { act_id: NORTH, order_id: 'o3', customer_id: 'cu2', date: '2026-01-07', total: 65, source: 'meta' },
      { act_id: RIVER, order_id: 'o9', customer_id: 'cu9', date: '2026-01-07', total: 80, source: 'google' },
    ],
    tw_order_touch: [{ act_id: NORTH, order_id: 'o1', date: '2025-09-01', model: 'fullFirstClick', platform: 'meta', ad_id: '1001' }],
    ad_tag: [{ asset_key: 'k1', act_id: N_ACT, tags_json: TAGS }, { asset_key: 'k2', act_id: N_ACT, tags_json: TAGS }],
    p_br_doc: [{ act_id: NORTH, line_id: '', key: 'rules', data_json: { goal_metric: 'roas', goal_meta: 2.2, rules_v: 2 } }],
    p_br_angle: [{ id: 'a1', act_id: NORTH, name: 'Lightness' }],
    p_br_batch: [{ id: 'b1', act_id: NORTH, num: '412', title: 'Light kites', angle_id: 'a1', verdict: 'winner', learning: 'Stills win' }],
    activities: [
      activity('ev1', N_ACT, '2026-01-06T15:04:10', { note: 'Write mw_abc123', client_why: 'More budget behind the best ad.' }),
      activity('ev2', N_ACT, '2026-01-07T09:00:00', { category: 'new_creative', summary: 'New ad' }),
      activity('ev3', N_ACT, '2026-01-08T11:30:20', { event_type: 'google_budget', object_type: 'GOOGLE_CAMPAIGN', object_id: 'g1', client_why: 'Search is working.' }),
      activity('ev9', R_ACT, '2026-01-06T12:00:00', { object_name: 'Tea sales', client_why: 'Tea is selling.' }),
    ],
    p_meta_write: [
      { id: 'mw_abc123', act: N_ACT, brand: NORTH, level: 'campaign', object: 'c1', name: 'Sales campaign', action: 'budget', field: 'daily_budget', before: { daily_budget: 80 }, after: { daily_budget: 100 } },
    ],
    p_ext_write: [
      { id: 'xw_1', platform: 'google', brand: NORTH, object: 'g1', name: 'Search', action: 'budget', before: { budget: 40 }, after: { budget: 50 }, at: '2026-01-08T11:30:55' },
      { id: 'xw_9', platform: 'google', brand: RIVER, object: 'g9', name: 'Tea search', action: 'budget', before: { budget: 10 }, after: { budget: 20 }, at: '2026-01-08T11:30:55' },
    ],
    p_launch: [launch('l1', NORTH, N_ACT), launch('l9', RIVER, R_ACT, { ad_id: '2001', ad_name: '77 A | Still', batch_id: null, num: null, filed_at: null, verdict: null, learning: null })],
  };
}
