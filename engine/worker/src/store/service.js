/* The store group's handlers: customers, sales, email sales, stock against ad spend.
   Each returns the same JSON as the old route. A request this code does not cover is handed to the
   old worker for that one request, with the reason in the log. */
// from profit/worker/src/worker.js (the /api/customers route) and profit/worker/src/hub.js (handleHub)
import { isEngineError } from '../platform/errors.js';
import { swallowed } from '../platform/log.js';
import { NeedsOld, soft, hubBrands, oneBrand, askedRange, sharedWindow, shopifyInPlay } from './shared.js';
import { windowFor } from '../platform/time.js';
import { customerEconomics } from './economics.js';
import { customerJourney } from './journey.js';
import { storeMany, emailMany } from './sales.js';
import { stockAds } from './stock.js';

const MODELS = { lastPlatformClick: 'Triple Whale, last platform click', fullFirstClick: 'Triple Whale, first click',
  fullLastClick: 'Triple Whale, last click', linear: 'Triple Whale, linear (paid)', linearAll: 'Triple Whale, linear (all)',
  platform: 'Platform reported' };
const COMPARE = ['prev', 'yoy', 'none'];

/* Run a handler. A NeedsOld thrown anywhere inside becomes a forward of this one request. */
const orForward = run => async (ctx, input) => {
  try {
    return await run(ctx, input);
  } catch (e) {
    if (e instanceof NeedsOld) return ctx.forward(e.message);
    throw e;
  }
};

/* The keys every hub answer starts with. */
function hubBase(query) {
  const model = Object.hasOwn(MODELS, query.model || '') ? query.model : 'lastPlatformClick';
  const cmp = COMPARE.includes(query.cmp) ? query.cmp : 'prev';
  return { model, model_label: MODELS[model], cmp };
}

/* The cut down day model in economics.js does not cover a brand with its own cost rules or with an
   extra cost that counts as ad spend. Those go to the old worker, which holds the full money model. */
async function needsFullModel(ctx, act) {
  const why = 'the table is not there yet, which the old route read as none';
  if (await soft(ctx.db.one('store.costRuleOn', { act }), null, why)) return 'the brand has its own cost rules, the old worker holds the full money model';
  if (await soft(ctx.db.one('store.adSpendExpense', { act }), null, why)) return 'the brand has an extra cost that counts as ad spend, the old worker holds the full money model';
  return '';
}

/* The journey rides on the same call. A failure there never hides the unit numbers. */
async function journeyOrReason(ctx, acct, from, to) {
  try {
    return await customerJourney(ctx, acct, from, to);
  } catch (e) {
    if (isEngineError(e) || e instanceof NeedsOld) throw e;
    swallowed('the journey could not be built, the unit numbers still answer', e);
    return { have: false, reason: e.message };
  }
}

/** GET /pw/api/customers: what a new customer costs and whether the first order pays it back. */
export const customers = orForward(async (ctx, input) => {
  const q = input.query;
  const acct = await oneBrand(ctx);
  const full = await needsFullModel(ctx, acct.act_id);
  if (full) throw new NeedsOld(full);
  if (await shopifyInPlay(ctx, [acct.act_id])) throw new NeedsOld(SHOPIFY_WHY);
  const asked = askedRange(q);
  const range = asked.from || asked.to ? windowFor(acct.tz, asked, ctx.now) : null;
  const snap = await soft(ctx.db.one('store.costHealth', { act: acct.act_id }), null, 'no cost check row could be read');
  const r = await customerEconomics(ctx, acct, Math.min(+q.months || 6, 12), asked.days, range);
  const journey = q.journey === '0' ? null : await journeyOrReason(ctx, acct, r.window.from, r.window.to);
  const bad = !!snap && (snap.verdict === 'broken' || snap.verdict === 'none');
  return { data: { ...r, journey, cm_ok: r.margin_pct != null || !bad },
    meta: { window: { from: r.window.from, to: r.window.to, tz: acct.tz } } };
});

const SHOPIFY_WHY = 'the brand has Shopify store totals or a store source setting, the old worker holds the switch';

/* The shared start of the two windowed hub reads. */
async function hubRead(ctx, input, rowsFor) {
  const accts = await hubBrands(ctx);
  if (await shopifyInPlay(ctx, accts.map(a => a.act_id))) throw new NeedsOld(SHOPIFY_WHY);
  const base = hubBase(input.query);
  const w = sharedWindow(ctx, accts, askedRange(input.query), base.cmp);
  return { data: { ...base, window: w, brands: await rowsFor(ctx, accts, w) },
    meta: { window: { from: w.from, to: w.to, tz: accts[0].tz } } };
}

/** GET /pw/api/hub/store: sales, orders, discounts, returns and what sells, per brand. */
export const hubStore = orForward((ctx, input) => hubRead(ctx, input, storeMany));

/** GET /pw/api/hub/email: email sales, campaigns against flows, per brand. */
export const hubEmail = orForward((ctx, input) => hubRead(ctx, input, emailMany));

/** GET /pw/api/hub/stockads: the ad spend tied to each product over 30 days. */
export const hubStockAds = orForward(async ctx => {
  const accts = await hubBrands(ctx);
  if (accts.length > 1) throw new NeedsOld('many brands at once: the engine reads stock against ads one brand at a time');
  return { brands: [await stockAds(ctx, accts[0])] };
});
