/* Product names for the ids in the tracker's orders.
   The old worker keeps a list per brand in the settings table for a day, and reads the store's public
   product list when that copy is older. The engine makes no outside call, so it answers from the kept
   copy and hands the request to the old worker when the copy is older than a day (the old worker then
   renews it). Names typed by hand (productNames) always win. */
// from profit/worker/src/worker.js (productTitles)
import { safeJson } from '../platform/text.js';
import { NeedsOld } from './shared.js';

const KEEP_MS = 24 * 3600e3;

/** { product id: name } for one brand. {} when the brand has no store or no ids were asked. */
export async function productTitles(ctx, acct, ids) {
  if (!acct.tw_shop || !ids.length) return {};
  const rows = await ctx.db.all('store.productNames', { act: acct.act_id });
  const value = key => (rows.find(r => r.key === `${key}:${acct.act_id}`) || {}).value;
  const cache = safeJson(value('productTitles'), null);
  const manual = safeJson(value('productNames'), {});
  const fresh = cache && cache.at && ctx.now.getTime() - cache.at < KEEP_MS;
  if (!fresh) throw new NeedsOld('the kept product names are older than a day, the old worker reads the store again');
  return { ...(cache.map || {}), ...manual };
}
