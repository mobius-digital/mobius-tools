/* The paid and creative handlers. Each answers the old JSON shape from the shared database. */
// from profit/worker/src/hub.js (handleHub: /api/hub/paid, /api/hub/creative)
import { switches, windowOf, brandsAsked, MAX_BRANDS } from './base.js';
import { metaBrand } from './metabrand.js';
import { metaMany } from './metamany.js';
import { platformMany, allChannelsMany } from './channels.js';
import { creativeBrand } from './creative.js';

const PLATFORMS = ['meta', 'google', 'tiktok', 'all'];

/* One window for every brand on an all brands screen: the one that ends first. */
function sharedWindow(brands, query, cmp, now) {
  return brands.map(b => windowOf(b, query, cmp, now)).sort((x, y) => (x.to < y.to ? -1 : 1))[0];
}

/* A statement takes 100 values at most. The brand ids, the caller's own ids and about 30 metric ids all count. */
const tooMany = (ctx, brands) => brands.length > MAX_BRANDS || brands.length + (ctx.scope.ids || []).length > MAX_BRANDS + 20;

/** GET /pw/api/hub/paid: spend, delivery and credited sales per brand for Meta, Google, TikTok or all channels. */
export async function hubPaid(ctx, input) {
  const q = input.query, base = switches(q);
  const brands = await brandsAsked(ctx);
  if (tooMany(ctx, brands)) return ctx.forward('more brands than one statement can name');
  const w = sharedWindow(brands, q, base.cmp, ctx.now);
  const platform = PLATFORMS.includes(q.platform) ? q.platform : 'meta';
  let out;
  if (platform === 'meta') out = brands.length === 1 ? [await metaBrand(ctx, brands[0], w, base.model)] : await metaMany(ctx, brands, w, base.model);
  else if (platform === 'all') out = await allChannelsMany(ctx, brands, w, base.model);
  else out = await platformMany(ctx, brands, w, base.model, platform);
  return { data: { ...base, platform, window: w, brands: out }, meta: metaOf(w, brands[0]) };
}

/** GET /pw/api/hub/creative: every Meta ad of one brand with spend in the window, and the rollups. */
export async function hubCreative(ctx, input) {
  const base = switches(input.query);
  const brand = (await brandsAsked(ctx))[0];
  const w = windowOf(brand, input.query, base.cmp, ctx.now);
  return { data: { ...base, window: w, ...(await creativeBrand(ctx, brand, w, base.model)) }, meta: metaOf(w, brand) };
}

const metaOf = (w, brand) => ({ source: 'database', window: { from: w.from, to: w.to, tz: brand.tz || null } });
