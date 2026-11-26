/* The test and call rules of one brand, worked out from its saved rules doc and its goals.
   Goal cost and goal ROAS live on the brand row. The rules doc holds the test settings only. */
// from profit/worker/src/brand.js (DEFAULT_RULES, TEST_KEYS, GOAL_METRICS, LEAD_CPL, OLD_DEFAULTS, RULES_V, rulesFor)

const DEFAULT_RULES = { target_cpa: 0, judge_spend: 150, judge_days: 7, win_roas: 2, lose_roas: 1.2 };

/* Every test setting and its default. The cr_ names are the ad call rules: a set waits until it has
   spent cr_judge_x goals and run cr_min_days, scales at cr_scale_buys results on goal, and is cut at
   cr_cut_zero_x goals with no result or cr_cut_spend_x goals at over cr_cut_cpa_x the goal. */
export const TEST_KEYS = { judge_spend: 0, judge_days: 7, yellow_pct: 30, min_track: 0, min_days: 7, min_cap_pct: 25, monday_post: 0,
  cr_judge_x: 2, cr_min_days: 3, cr_scale_buys: 3, cr_cut_zero_x: 3, cr_cut_spend_x: 3, cr_cut_cpa_x: 1.5, cr_anchor_pct: 50,
  goal_ncpa: 0, goal_cpl: 0, goal_meta: 0, goal_google: 0, goal_tiktok: 0 };

/* What a brand is judged on: cost per sale, cost per new customer, ROAS or cost per lead. */
export const GOAL_METRICS = ['cpa', 'ncpa', 'roas', 'cpl'];

/* The cost per lead band: under lo is cheap, up to hi is on goal. */
export const LEAD_CPL = { lo: 0.5, hi: 0.75 };

/* A doc saved before version 2 holds the old defaults as typed numbers. Those are not a choice, so they are skipped. */
const OLD_DEFAULTS = { cr_judge_x: 1, cr_scale_buys: 2, cr_cut_spend_x: 2 };
export const RULES_V = 2;

const round2 = n => Math.round(n * 100) / 100;

function goalsInto(r, acct, doc) {
  if (doc && +doc.target_cpa > 0) r.target_cpa = +doc.target_cpa;
  else if (acct && acct.target_cpa > 0) r.target_cpa = +acct.target_cpa;
  r.target_roas = acct && acct.target_roas > 0 ? +acct.target_roas : null;
  if (r.target_roas) { r.win_roas = r.target_roas; r.lose_roas = round2(r.target_roas * 0.6); }
}

/* New tests are Meta ads, so they are judged on the Meta goal when one is set. */
function testGoalsInto(r, doc) {
  const metaGoal = doc && +doc.goal_meta > 0 ? +doc.goal_meta : null;
  r.test_cpa = (r.goal_metric === 'cpa' || r.goal_metric === 'ncpa') && metaGoal ? metaGoal : r.target_cpa;
  r.test_roas = r.goal_metric === 'roas' && metaGoal ? metaGoal : r.target_roas || null;
  if (r.test_roas) { r.win_roas = r.test_roas; r.lose_roas = round2(r.test_roas * 0.6); }
}

/** acct = the brand row (target_cpa, target_roas). doc = the saved rules doc, or null. */
export function rulesFor(acct, doc) {
  const r = { ...DEFAULT_RULES, ...TEST_KEYS, target_cpa: null };
  goalsInto(r, acct, doc);
  const old = !(doc && +doc.rules_v >= RULES_V);
  for (const k of Object.keys(TEST_KEYS)) if (doc && +doc[k] > 0 && !(old && OLD_DEFAULTS[k] === +doc[k])) r[k] = +doc[k];
  r.min_track = !!(doc && +doc.min_track > 0);
  r.acct_avg = doc && +doc.acct_avg_cpa > 0 ? +doc.acct_avg_cpa : null;
  r.acct_avg_month = (doc && doc.acct_avg_month) || null;
  r.monday_post = !!(doc && +doc.monday_post > 0);
  r.goal_metric = GOAL_METRICS.includes(doc && doc.goal_metric) ? doc.goal_metric : 'cpa';
  r.roas_guard = !(doc && doc.roas_guard === 'off');
  r.cpa_guard = !(doc && doc.cpa_guard === 'off');
  testGoalsInto(r, doc);
  /* A brand with no lead goal of its own gets the top of the band. */
  r.goal_cpl_auto = !(r.goal_cpl > 0);
  if (r.goal_cpl_auto) r.goal_cpl = LEAD_CPL.hi;
  r.window_auto = !(doc && doc.window_auto === 'off');
  r.judge_spend_auto = !(doc && +doc.judge_spend > 0);
  if (r.judge_spend_auto) r.judge_spend = r.test_cpa ? Math.round(r.test_cpa * 3) : DEFAULT_RULES.judge_spend;
  r.set = !!(doc && Object.keys(TEST_KEYS).some(k => +doc[k] > 0));
  return r;
}
