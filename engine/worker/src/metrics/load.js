/* Reads for the money model. One statement per table for every brand of the request at once, so a home
   page with many brands stays far inside the statement budget. The old code read brand by brand. */
// from profit/worker/src/worker.js (listAccounts, pivot, seriesFor, channelsFor), costs.js (loadCostRules), expenses.js (loadExpenses)
import { safeJson } from '../platform/text.js';
import { isEngineError } from '../platform/errors.js';
import { swallowed } from '../platform/log.js';
import { TW_METRICS } from './money.js';
import { storeMode } from './storesource.js';

const TW_ROWS_A_READ = 25000;
const TW_MAX_PARTS = 6;

const group = (rows, key = 'act_id') => {
  const out = {};
  for (const r of rows) (out[r[key]] ??= []).push(r);
  return out;
};

/** The caller's brands as the old profit worker listed them: demo brands left out, goals read. */
export async function listAccounts(ctx, activeOnly = true) {
  return (await ctx.brands.list({ active: activeOnly })).map(a => ({ ...a, goals: safeJson(a.goals_json, {}) }));
}

/** The one brand a request named, or null. A demo brand is never found (the old list left it out). */
export async function oneAccount(ctx) {
  const id = ctx.scope.brand;
  if (!id) return null;
  const a = await ctx.brands.one(id);
  if (!a || +a.demo === 1) return null;
  return { ...a, goals: safeJson(a.goals_json, {}) };
}

function pivots(rows) {
  const piv = {};
  for (const r of rows) ((piv[r.act_id] ??= {})[r.metric] ??= {})[r.date] = r.value;
  return piv;
}

function metaByDate(rows) {
  const meta = {};
  for (const r of rows) (meta[r.act_id] ??= {})[r.date] = { date: r.date, spend: r.spend };
  return meta;
}

/* The tracker table is the big one: a row per brand, day and metric. Many brands over a long window are
   read a few brands at a time, so no single answer from the database grows too large. At most
   TW_MAX_PARTS statements, so the statement budget of a request always holds. */
function trackerReads(acts, from, to) {
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
  const fit = Math.max(1, Math.floor(TW_ROWS_A_READ / (days * TW_METRICS.length)));
  const size = Math.max(fit, Math.ceil(acts.length / TW_MAX_PARTS));
  const reads = [];
  for (let i = 0; i < acts.length; i += size) reads.push(['metrics.twDays', { acts: acts.slice(i, i + size), from, to }]);
  return reads;
}

/* One soft read: the Shopify table only exists once a store has synced, so a failure reads as nothing. */
async function softAll(ctx, name, params) {
  try {
    return await ctx.db.all(name, params);
  } catch (e) {
    if (isEngineError(e)) throw e;
    swallowed('the Shopify store totals could not be read, the tracker answers as before', e);
    return [];
  }
}

/** Shopify daily store totals and each brand's store source setting (storesource.js), for the switch.
 *  Returns { rows: { brand: [day rows] }, modes: { brand: mode }, now }. Two light reads, one after the other. */
export async function loadShop(ctx, acts, from, to) {
  const out = { rows: {}, modes: {}, now: ctx.now.getTime() };
  if (!acts.length) return out;
  for (const r of await softAll(ctx, 'metrics.shopDays', { acts, from, to })) (out.rows[r.act_id] ??= []).push(r);
  for (const r of await softAll(ctx, 'metrics.storeModes', { acts })) out.modes[r.act_id] = storeMode(r.value);
  return out;
}

/** Tracker rows and ad platform spend per day for some brands over one window.
 *  Returns { piv: { brand: { metric: { date: value } } }, meta: { brand: { date: { date, spend } } } }. */
export async function loadDays(ctx, acts, from, to) {
  if (!acts.length) return { piv: {}, meta: {} };
  const tw = trackerReads(acts, from, to);
  const out = await ctx.db.batch([...tw, ['metrics.metaSpendDays', { acts, from, to }]]);
  return { piv: pivots(out.slice(0, tw.length).flat()), meta: metaByDate(out[tw.length]), shop: await loadShop(ctx, acts, from, to) };
}

/** Everything the day model needs for some brands over one window: loadDays plus each brand's cost rules
 *  and extra costs. With `attr`, also the revenue the tracker credits to each platform per day. */
export async function loadRaw(ctx, acts, from, to, { attr = false } = {}) {
  if (!acts.length) return { piv: {}, meta: {}, rules: {}, exp: {}, attr: {}, shop: null };
  const p = { acts, from, to };
  const tw = trackerReads(acts, from, to);
  const list = [...tw, ['metrics.metaSpendDays', p], ['metrics.costRulesOn', { acts }], ['metrics.expensesOf', { acts }]];
  if (attr) list.push(['metrics.attrDays', p]);
  const out = await ctx.db.batch(list);
  const [meta, rules, exp, attrRows] = out.slice(tw.length);
  return { piv: pivots(out.slice(0, tw.length).flat()), meta: metaByDate(meta), rules: group(rules), exp: group(exp),
    attr: group(attrRows || []), shop: await loadShop(ctx, acts, from, to) };
}

/** What the home page shows beside the numbers: the stored cost check, what each brand has connected and
 *  the name of its email tool. */
export async function loadCards(ctx) {
  const [health, conns, tools] = await ctx.db.batch([['metrics.costHealth', {}], ['metrics.connKinds', {}], ['metrics.emailTools', {}]]);
  const connKinds = {};
  for (const r of conns) (connKinds[r.brand_id] ??= new Set()).add(r.kind);
  return { byAct: Object.fromEntries(health.map(r => [r.act_id, r])), connKinds,
    emailTool: Object.fromEntries(tools.map(r => [r.act_id, r.value])) };
}
