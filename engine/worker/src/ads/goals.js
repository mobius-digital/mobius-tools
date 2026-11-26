/* The ad goal a Meta screen colors against: the brand's goal in its own measure, the Meta goal first. */
// from profit/worker/src/hub.js (adGoalMap) and profit/worker/src/brand.js (rulesFor, goalOf, LEAD_CPL)
import { safeJson } from '../platform/text.js';

const MEASURES = ['cpa', 'ncpa', 'roas', 'cpl'];
/* The agency's cost per lead band: under lo is cheap, up to hi is on goal. */
const LEAD_BAND = { lo: 0.5, hi: 0.75 };
const above0 = v => (+v > 0 ? +v : 0);

/* The few rule values the ad goal needs, read the way the old rules reader did. */
function rulesOf(brand, doc) {
  const d = doc || {};
  const r = { goal_metric: MEASURES.includes(d.goal_metric) ? d.goal_metric : 'cpa' };
  r.target_cpa = +d.target_cpa > 0 ? +d.target_cpa : brand.target_cpa > 0 ? +brand.target_cpa : null;
  r.target_roas = brand.target_roas > 0 ? +brand.target_roas : null;
  r.goal_meta = above0(d.goal_meta);
  r.goal_ncpa = above0(d.goal_ncpa);
  r.goal_cpl = above0(d.goal_cpl);
  r.goal_cpl_auto = !(r.goal_cpl > 0);
  if (r.goal_cpl_auto) r.goal_cpl = LEAD_BAND.hi;
  return r;
}

/* The goal for one measure: the Meta goal when it is in the brand's main measure, else the brand's own. */
function goalOf(r, measure) {
  if (measure === r.goal_metric && r.goal_meta) return r.goal_meta;
  if (measure === 'cpa') return r.target_cpa;
  if (measure === 'roas') return r.target_roas;
  if (measure === 'ncpa') return r.goal_ncpa || null;
  return measure === 'cpl' ? r.goal_cpl || null : null;
}

/** brand id -> { metric, cpa, roas, ncpa, cpl, cpl_lo, cpl_auto }. One statement for every brand. */
export async function adGoals(ctx, brands) {
  const acts = brands.map(b => b.act_id);
  if (!acts.length) return {};
  const docs = {};
  for (const row of await ctx.db.all('ads.goalDocs', { acts })) docs[row.act_id] = safeJson(row.data_json || '{}', null);
  const out = {};
  for (const b of brands) {
    const r = rulesOf(b, docs[b.act_id] || null), m = r.goal_metric;
    out[b.act_id] = { metric: m, cpa: (m === 'cpa' ? goalOf(r, 'cpa') : r.target_cpa) || null,
      roas: (m === 'roas' ? goalOf(r, 'roas') : r.target_roas) || null,
      ncpa: (m === 'ncpa' ? goalOf(r, 'ncpa') : r.goal_ncpa) || null,
      cpl: r.goal_cpl || null, cpl_lo: LEAD_BAND.lo, cpl_auto: r.goal_cpl_auto };
  }
  return out;
}
