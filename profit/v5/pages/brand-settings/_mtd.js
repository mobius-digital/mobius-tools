/* Month to date store sales and ad spend for Brand settings > Goals, from GET /api/plan (engine metrics/plan.js, old
   profit worker.js; same shape). The month in flight has them in `pace` (mtd_sales, mtd_spend); `actual` (sales, spend)
   is the month's own row from the history. `current_month` is only the month's name ("2026-11"), never the numbers.
   The source is the plan's own store_source (Shopify through Locus's app when it covers the dates, else Triple Whale).
   No DOM: test-goals-mtd.mjs. */
const num = v => (v == null || v === '' || !isFinite(+v) ? null : +v);
export const SOURCE_WORD = { shopify: 'Shopify', triple_whale: 'Triple Whale' };

/** { sales, spend, source } or null when the plan has no month to date. */
export function mtdOf(plan) {
  if (!plan || typeof plan !== 'object') return null;
  const pace = plan.pace && typeof plan.pace === 'object' ? plan.pace : null;
  const act = plan.actual && typeof plan.actual === 'object' ? plan.actual : null;
  const sales = num(pace && pace.mtd_sales) ?? num(act && act.sales);
  const spend = num(pace && pace.mtd_spend) ?? num(act && act.spend);
  if (sales == null && spend == null) return null;
  const src = (pace && pace.store_source) || plan.store_source || null;
  return { sales, spend, source: SOURCE_WORD[src] || (src ? String(src) : 'Triple Whale') };
}
