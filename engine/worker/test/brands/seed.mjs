/* Made up rows for the brands tests: two brands, each with research, tests, ads and a rules doc.
   Every River Tea row carries its own ids and names, so a leak would show. */
import { NORTH, RIVER, NORTH_AD_ACCOUNT, RIVER_AD_ACCOUNT } from '../../src/platform/testkit/index.mjs';

const day = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function research(brand, tag) {
  const line = `${tag}line1`;
  return {
    p_br_line: [{ id: line, act_id: brand, name: `${tag} main line`, about: 'What it is for', products: 'One, two', sort: 1, created_at: '2026-01-05 10:00:00' }],
    p_br_doc: [
      { act_id: brand, line_id: '', key: 'rules', data_json: { rules_v: 2, judge_spend: 90, judge_days: 5, goal_metric: 'cpa', goal_meta: 31, cr_judge_x: 2 }, status: 'approved', source: 'staff', updated_at: '2026-02-01 09:00:00' },
      { act_id: brand, line_id: '', key: 'profile', data_json: { summary: `${tag} makes things` }, status: 'approved', source: 'staff', updated_at: '2026-02-01 09:00:00' },
      { act_id: brand, line_id: '', key: 'klaviyo', data_json: { key: `${tag}-stored-key` }, status: 'approved', source: 'staff', updated_at: '2026-02-01 09:00:00' },
      { act_id: brand, line_id: line, key: 'market', data_json: { size: 'large' }, status: 'draft', source: 'ai', updated_at: '2026-02-02 09:00:00' },
    ],
    p_br_persona: [{ id: `${tag}per1`, act_id: brand, line_id: line, name: 'Weekend flyer', data_json: { age: '30 to 45' }, status: 'approved', source: 'ai', sort: 1, updated_at: '2026-02-03 09:00:00' }],
    p_br_voc: [{ id: `${tag}voc1`, act_id: brand, line_id: line, persona_id: `${tag}per1`, kind: 'pain', quote: 'It broke on day one', source: 'review', url: null, theme: 'quality', nugget: 1, status: 'approved', created_at: '2026-02-04 09:00:00' }],
    p_br_comp: [{ id: `${tag}comp1`, act_id: brand, line_id: line, name: 'Other Maker', url: 'https://other.test', data_json: { price: 'higher' }, status: 'approved', sort: 1, updated_at: '2026-02-05 09:00:00' }],
    p_br_angle: [{ id: `${tag}ang1`, act_id: brand, line_id: line, persona_id: `${tag}per1`, name: 'Built to last', argument: 'It does not break', awareness: 'problem', stage: 'cold', lead: 'story', status: 'active', source: 'staff', note: null, created_at: '2026-02-06 09:00:00', updated_at: '2026-02-06 09:00:00' }],
    p_br_concept: [{ id: `${tag}con1`, act_id: brand, angle_id: `${tag}ang1`, name: 'Drop test', about: 'Drop it on camera', format: 'video', created_at: '2026-02-07 09:00:00' }],
    p_br_onboard: [{ act_id: brand, token: `${tag}tok`, answers_json: { q1: 'yes' }, prefill_json: { q2: 'maybe' }, status: 'started', step: 2, submitted_at: null, created_at: '2026-01-02 09:00:00', updated_at: '2026-01-03 09:00:00' }],
    p_br_run: [{ id: `${tag}run1`, act_id: brand, line_id: line, step: 'market', status: 'done', searches: 3, in_tokens: 1200, out_tokens: 800, error: null, started_at: '2026-02-02 08:00:00', finished_at: '2026-02-02 08:05:00' }],
  };
}

function tests(brand, account, tag) {
  const ad = n => `${tag}ad${n}`;
  return {
    p_br_batch: [
      { id: `${tag}b101`, act_id: brand, num: '101', title: 'Drop test, three hooks', angle_id: `${tag}ang1`, concept_id: `${tag}con1`, level: 'concept', stage: 'live', verdict: null, legacy_json: null, source: 'asana', created_at: `${day(-12)} 09:00:00`, updated_at: `${day(-2)} 09:00:00`, asana_result: null, asana_url: 'https://tasks.test/101' },
      { id: `${tag}b100`, act_id: brand, num: '100', title: 'Old winner', angle_id: `${tag}ang1`, concept_id: null, level: 'angle', stage: 'done', verdict: 'winner', legacy_json: { sheet_row: 4 }, source: 'sheet', created_at: '2026-03-01 09:00:00', updated_at: '2026-03-20 09:00:00' },
      { id: `${tag}b102`, act_id: brand, num: '102', title: 'Still a brief', angle_id: null, concept_id: null, level: 'variation', stage: 'idea', verdict: null, legacy_json: null, source: 'asana', created_at: `${day(-3)} 09:00:00`, updated_at: `${day(-3)} 09:00:00` },
    ],
    p_br_adtag: [{ act_id: brand, ad_id: ad(3), batch_id: `${tag}b101`, tagged_by: 'staff' }],
    ads: [
      { act_id: account, ad_id: ad(1), name: '101-1 | Still', created_time: `${day(-10)}T10:00:00+0000`, status: 'ACTIVE', media_type: 'image' },
      { act_id: account, ad_id: ad(2), name: '101-2 | Video', created_time: `${day(-10)}T10:00:00+0000`, status: 'ACTIVE', media_type: 'video' },
      { act_id: account, ad_id: ad(3), name: 'Creator clip, no number', created_time: `${day(-9)}T10:00:00+0000`, status: 'ACTIVE', media_type: 'video' },
      { act_id: account, ad_id: ad(4), name: 'Loose ad trybe=abc', created_time: `${day(-8)}T10:00:00+0000`, status: 'PAUSED', media_type: 'image' },
      { act_id: account, ad_id: ad(5), name: '100-1 | Still', created_time: '2026-03-02T10:00:00+0000', status: 'PAUSED', media_type: 'image' },
    ],
    ad_daily: [
      { act_id: account, ad_id: ad(1), date: day(-9), spend: 40.5, impressions: 5000, link_clicks: 60, video_3s: 0, add_to_cart: 4 },
      { act_id: account, ad_id: ad(1), date: day(-2), spend: 55.25, impressions: 6100, link_clicks: 75, video_3s: 0, add_to_cart: 6 },
      { act_id: account, ad_id: ad(2), date: day(-4), spend: 61, impressions: 9000, link_clicks: 110, video_3s: 2700, add_to_cart: 9 },
      { act_id: account, ad_id: ad(3), date: day(-3), spend: 22, impressions: 2500, link_clicks: 20, video_3s: 700, add_to_cart: 1 },
      { act_id: account, ad_id: ad(4), date: day(-5), spend: 18.4, impressions: 1900, link_clicks: 12, video_3s: 0, add_to_cart: 0 },
      { act_id: account, ad_id: ad(5), date: '2026-03-05', spend: 300, impressions: 30000, link_clicks: 400, video_3s: 0, add_to_cart: 30 },
    ],
    tw_ad_attr: [
      { act_id: brand, date: day(-2), ad_id: ad(1), model: 'lastPlatformClick', revenue: 180, orders: 3, platform: 'meta' },
      { act_id: brand, date: day(-4), ad_id: ad(2), model: 'lastPlatformClick', revenue: 95.5, orders: 2, platform: 'meta' },
      { act_id: brand, date: day(-4), ad_id: ad(2), model: 'firstClick', revenue: 999, orders: 9, platform: 'meta' },
      { act_id: brand, date: '2026-03-05', ad_id: ad(5), model: 'lastPlatformClick', revenue: 1200, orders: 20, platform: 'meta' },
    ],
  };
}

/** Rows for makeEnv({ rows }): both brands filled, one ad account no brand has, the scan stamp. */
export function seedRows() {
  const out = {};
  for (const [brand, account, tag] of [[NORTH, NORTH_AD_ACCOUNT, 'nk'], [RIVER, RIVER_AD_ACCOUNT, 'rt']]) {
    const all = { ...research(brand, tag), ...tests(brand, account, tag) };
    for (const [table, rows] of Object.entries(all)) (out[table] || (out[table] = [])).push(...rows);
  }
  out.accounts = [{ act_id: 'act_999', name: 'Unclaimed ads', currency: 'USD', tz: 'America/Chicago', account_status: 1 }];
  out.settings = [{ key: 'lastDiscover', value: JSON.stringify({ at: '2026-11-01T06:00:00.000Z', found: 3, fresh: 1 }) }];
  return out;
}

/** Goals on both brand rows. Run after makeEnv: the kit seeds the brands itself. */
export function setGoals(env) {
  env.DB.exec(`UPDATE brands SET target_cpa = 28, target_roas = 2.5, monthly_budget = 9000,
    budgets_json = '{"2026-11":9000}', goals_json = '{"default":{"sales":40000}}' WHERE id = '${NORTH}'`);
  env.DB.exec(`UPDATE brands SET target_cpa = 41, target_roas = 3, monthly_budget = 5000 WHERE id = '${RIVER}'`);
}
