/* Meta's own delivery numbers plus the credited sales, as one set of metrics. Every ratio is a
   formula from numbers/defs.js. */
// from profit/worker/src/hub.js (metaMetrics, withLeads, objKind)
import { roas, cpa, cpm, ctr, pct, safeDiv } from '../numbers/defs.js';
import { num } from './base.js';

const OBJ_SALES = /^(OUTCOME_SALES|CONVERSIONS|PRODUCT_CATALOG_SALES|OUTCOME_APP_PROMOTION|APP_INSTALLS)$/;
const OBJ_LEADS = /^(OUTCOME_LEADS|LEAD_GENERATION)$/;

/** What a campaign buys: sales, leads or reach. */
export const objKind = o => (!o || OBJ_SALES.test(o) ? 'sales' : OBJ_LEADS.test(o) ? 'leads' : 'reach');

/** One summed row of Meta columns -> the metrics. `credit` = { rev, ord } from the tracker, or null for
 *  Meta's own count. Leads are always Meta's own. */
export function metaMetrics(r, credit) {
  const spend = num(r.spend), impr = num(r.impr), clicks = num(r.clicks), atc = num(r.atc), reach = num(r.reach);
  const leads = num(r.leads), v3 = num(r.v3);
  const ord = credit ? credit.ord : num(r.p_ord), rev = credit ? credit.rev : num(r.p_rev);
  return { spend, impressions: impr, reach, clicks, atc, checkouts: r.ic == null ? null : num(r.ic), purchases: ord, revenue: rev,
    platform_purchases: num(r.p_ord), platform_revenue: num(r.p_rev),
    leads, cpl: cpa(spend, leads), lead_rate: pct(leads, clicks),
    roas: roas(rev, spend), cpa: cpa(spend, ord), cpm: cpm(spend, impr), ctr: ctr(clicks, impr), cpc: safeDiv(spend, clicks),
    cost_per_atc: safeDiv(spend, atc), atc_rate: pct(atc, clicks), purchase_rate: pct(ord, atc), frequency: safeDiv(impr, reach),
    hook: v3 ? pct(v3, impr) : null, hold: v3 ? pct(num(r.thru), v3) : null,
    /* Where people stop watching: the share of impressions still watching at 3 seconds, 25, 50, 75 percent and the end. */
    curve: v3 && num(r.p25) ? [v3, num(r.p25), num(r.p50), num(r.p75), num(r.p100)].map(v => pct(v, impr)) : null };
}

/** Lead campaigns buy leads, not sales: roas and cpa are over the sales spend, leads and cpl are the lead
 *  campaigns' own, and spend stays the whole account. */
export function withLeads(m, lead) {
  if (!m || !lead || !(lead.spend > 0)) return m;
  const sales = Math.max(0, m.spend - lead.spend);
  Object.assign(m, { lead_spend: lead.spend, sales_spend: sales, leads: lead.leads, cpl: cpa(lead.spend, lead.leads) });
  if (m.purchases != null) Object.assign(m, { roas: roas(m.revenue, sales), cpa: cpa(sales, m.purchases) });
  return m;
}

/** Today's credit has not landed yet: the credited numbers are "pending", never a false 0. */
export const PENDING = { purchases: null, revenue: null, roas: null, cpa: null, purchase_rate: null, attr_pending: true };

/** The lead campaign spend and leads per brand, for both windows. */
export async function leadSplit(ctx, acts, windows) {
  const out = {};
  if (!acts.length) return out;
  for (const r of await ctx.db.all('ads.leadSplitMany', { acts, ...windows })) {
    (out[r.act_id] ??= {})[r.win] = { spend: num(r.spend), leads: num(r.leads) };
  }
  return out;
}
