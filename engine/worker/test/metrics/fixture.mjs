/* Made up store data for the metrics tests: two brands, about nine months of tracker rows, ad platform
   spend, credited revenue, cost rules, extra costs, goals, a saved plan and a stored cost check.
   Every number comes from a fixed seed, so each run is the same but for the dates, which follow today. */
import { NORTH, RIVER, NORTH_AD_ACCOUNT, RIVER_AD_ACCOUNT } from '../../src/platform/testkit/index.mjs';
import { dayIn, addDays, monthOf } from '../../src/platform/time.js';

export const TZ = 'America/Chicago';
export const today = () => dayIn(TZ);
export const NORTH_SECOND_AD_ACCOUNT = 'act_112';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = x => Math.round(x * 100) / 100;

/* One day of tracker metrics for a brand. `i` is how many days ago. Some days have gaps on purpose. */
function trackerDay(rnd, scale, i) {
  const orders = Math.round((18 + rnd() * 14) * scale);
  const total = r2(orders * (52 + rnd() * 16));
  const fresh = r2(total * (0.45 + rnd() * 0.2));
  const m = {
    netSales: total, totalNetTaxes: r2(total * 0.04), totalShippingPrice: r2(orders * (3 + rnd() * 4)),
    totalShippingCosts: r2(orders * 5.1), totalHandlingFees: r2(orders * 0.4), totalOrders: orders,
    ga_adCost: r2(60 * scale + rnd() * 30), newCustomerSales: fresh, rcRevenue: r2(total - fresh),
    totalProductCosts: r2(total * (0.27 + rnd() * 0.05)), totalPaymentGatewayCosts: r2(total * 0.029),
    newCustomersOrders: Math.round(orders * 0.55), klaviyoPlacedOrderSales: r2(total * 0.18),
    totalKlaviyoPlacedOrderTotalPriceCampaigns: r2(total * 0.1), totalKlaviyoPlacedOrderTotalPriceFlows: r2(total * 0.08),
    tiktokAdsSpend: r2(20 * scale + rnd() * 10), notUsedByTheModel: 7,
  };
  if (i % 9 !== 0) m.blendedAds = r2(260 * scale + rnd() * 120);   // every ninth day falls back to the platforms' own spend
  if (i % 31 === 0) { m.totalProductCosts = r2(total * 1.4); }      // a stock delivery booked as one day's cost
  return m;
}

function storeRows(brand, adAccount, seed, scale, days) {
  const rnd = seeded(seed);
  const t = today();
  const tw = [], ads = [], attr = [];
  for (let i = 1; i <= days; i++) {
    const date = addDays(t, -i);
    if (i === 40) continue;                                          // a day the tracker never synced
    for (const [metric, value] of Object.entries(trackerDay(rnd, scale, i))) tw.push({ act_id: brand, date, metric, value });
    const spend = r2(180 * scale + rnd() * 90);
    ads.push({ act_id: adAccount, date, spend, impressions: Math.round(spend * 90), reach: Math.round(spend * 60),
      clicks: Math.round(spend * 2.1), link_clicks: Math.round(spend * 1.6), purchases: Math.round(spend / 30),
      revenue: r2(spend * 2.4), video_views: Math.round(spend * 12) });
    if (i === 2) continue;                                           // credited revenue for that day has not landed yet
    attr.push({ act_id: brand, date, ad_id: `${adAccount}_ad1`, model: 'lastPlatformClick', revenue: r2(spend * 1.9), orders: Math.round(spend / 34), platform: i > 150 ? null : 'meta' });
    attr.push({ act_id: brand, date, ad_id: 'g1', model: 'lastPlatformClick', revenue: r2(140 * scale), orders: 2, platform: i > 150 ? null : 'google' });
    attr.push({ act_id: brand, date, ad_id: `${adAccount}_ad1`, model: 'fullFirstClick', revenue: 999, orders: 9, platform: 'meta' });
  }
  return { tw, ads, attr };
}

/** Rows for makeEnv({ rows }). */
export function storeData({ days = 270 } = {}) {
  const t = today(), ym = monthOf(t);
  const north = storeRows(NORTH, NORTH_AD_ACCOUNT, 11, 1, days);
  const river = storeRows(RIVER, RIVER_AD_ACCOUNT, 23, 0.6, days);
  const second = [1, 2, 3, 5, 8].map(i => ({ act_id: NORTH_SECOND_AD_ACCOUNT, date: addDays(t, -i), spend: 25 + i, impressions: 900,
    reach: 500, clicks: 30, link_clicks: 20, purchases: 1, revenue: 60, video_views: 100 }));
  const fresh = new Date(Date.now() - 3600e3).toISOString().slice(0, 19).replace('T', ' ');
  return {
    tw_daily: [...north.tw, ...river.tw],
    daily_insights: [...north.ads, ...river.ads, ...second],
    tw_ad_attr: [...north.attr, ...river.attr],
    ads: [{ act_id: NORTH_AD_ACCOUNT, ad_id: `${NORTH_AD_ACCOUNT}_ad1`, name: 'kite ad' }, { act_id: RIVER_AD_ACCOUNT, ad_id: `${RIVER_AD_ACCOUNT}_ad1`, name: 'river one' }],
    connections: [
      { id: 'tw:north', brand_id: NORTH, kind: 'triple_whale', external_id: 'north-kites.example', is_primary: 1 },
      { id: 'tw:river', brand_id: RIVER, kind: 'triple_whale', external_id: 'river-tea.example', is_primary: 1 },
      { id: `meta:${NORTH_SECOND_AD_ACCOUNT}`, brand_id: NORTH, kind: 'meta', external_id: NORTH_SECOND_AD_ACCOUNT, is_primary: 0 },
      { id: 'kl:north', brand_id: NORTH, kind: 'klaviyo', external_id: 'kl-north', is_primary: 1 },
    ],
    settings: [{ key: `emailTool:${RIVER}`, value: 'omnisend' }],
    p_cost_rule: [
      { act_id: NORTH, cost: 'shipping', rule: 'per_order', source: 'typed', amount: 6.5, start_date: addDays(t, -60) },
      { act_id: NORTH, cost: 'product', rule: 'pct_revenue', source: 'sheet', amount: 31, start_date: addDays(t, -20), status: 'off' },
      { act_id: RIVER, cost: 'product', rule: 'pct_revenue', source: 'typed', amount: 35, start_date: addDays(t, -400) },
    ],
    p_expense: [
      { act_id: NORTH, name: 'Podcast read', category: 'marketing', kind: 'monthly', amount: 900, start_date: addDays(t, -200), is_ad_spend: 1 },
      { act_id: NORTH, name: 'Warehouse', category: 'rent', kind: 'monthly', amount: 2400, start_date: addDays(t, -300) },
      { act_id: NORTH, name: 'Trade show', category: 'other', kind: 'once', amount: 1500, start_date: addDays(t, -12) },
      { act_id: RIVER, name: 'River secret cost', category: 'team', kind: 'pct_revenue', amount: 3, start_date: addDays(t, -90) },
    ],
    p_plan: [
      { act_id: NORTH, month: ym, growth_pct: 0.1, basis_sales: 50000, basis_label: 'made up', required_spend: 9000, expected_cm: 12000,
        agreed_by: 'someone', share_token: 'tok', assumptions_json: JSON.stringify({ amer: 2.2, margin: '', spend_floor_per_day: 150 }) },
      { act_id: RIVER, month: ym, growth_pct: 0.2, basis_sales: 30000, note: 'river plan note' },
    ],
    p_cost_health: [
      { act_id: NORTH, verdict: 'good', reason: null, blended: 0.6, p10: 0.5, p90: 0.7, negatives: 0, days: 59, checked_at: fresh },
      { act_id: RIVER, verdict: 'noisy', reason: 'made up reason', blended: 0.5, p10: 0.3, p90: 0.8, negatives: 1, days: 59, checked_at: fresh },
    ],
    activities: [
      { id: 'a1', act_id: NORTH_AD_ACCOUNT, event_time: `${addDays(t, -5)}T15:00:00+0000`, category: 'budget', summary: 'Budget up', confirmed: 0 },
      { id: 'a2', act_id: NORTH_AD_ACCOUNT, event_time: `${addDays(t, -4)}T15:00:00+0000`, category: 'other', summary: 'Not a chart event' },
      { id: 'a3', act_id: NORTH_AD_ACCOUNT, event_time: `${addDays(t, -3)}T15:00:00+0000`, category: 'budget', summary: 'Rejected', confirmed: -1 },
      { id: 'a4', act_id: RIVER_AD_ACCOUNT, event_time: `${addDays(t, -3)}T15:00:00+0000`, category: 'budget', summary: 'river budget change' },
    ],
  };
}

/** Goals for the two brands, set after makeEnv (the kit seeds the brand rows itself). */
export function setGoals(env) {
  const ym = monthOf(today());
  const goals = { default: { sales: 40000, spend: 9000, cm_pct: null }, [ym]: { sales: 52000, spend: 11000, amer: 2.1 } };
  env.DB.raw.prepare('UPDATE brands SET goals_json = ? WHERE id = ?').run(JSON.stringify(goals), NORTH);
  env.DB.raw.prepare('UPDATE brands SET goals_json = ?, report_config_json = ? WHERE id = ?')
    .run(JSON.stringify({ default: { sales: 20000, spend: 5000, cm_pct: 0.55 } }), JSON.stringify({ secret: 'team only' }), RIVER);
}
