/* Brands, goals and rules: the reads and the one simple settings write of the brands group. */
// from account-health/worker/src/brands.js (listBrands, KINDS)
// from account-health/worker/src/worker.js (listAccounts, metaAvailable, GET /api/accounts, PUT /api/accounts/<id>)
// from account-health/worker/src/brandguard.js (noDiscover, noDocSecrets)
// from profit/worker/src/brand.js (mustAccount, GET /api/brand, GET /api/brand/rules)
import { fail } from '../platform/errors.js';
import { safeJson, isPlainObject } from '../platform/text.js';
import { rulesFor } from './rules.js';
import { brandPage, pageReads } from './research.js';

/* Every kind a connection can be. The label is what a person reads. */
export const KINDS = {
  meta: 'Meta ad account', triple_whale: 'Triple Whale', shopify: 'Shopify',
  google_ads: 'Google Ads', ga4: 'Google Analytics', gsc: 'Search Console',
  tiktok: 'TikTok ads', klaviyo: 'Klaviyo', attentive: 'Attentive',
  asana: 'Asana project', drive: 'Drive folder', frame: 'Frame project',
};

const isClient = ctx => ctx.caller.kind === 'client';

/** GET /ah/api/brands: every brand in reach with its connections. Never a key. */
export async function listBrands(ctx) {
  const [brands, conns] = await ctx.db.batch([['brands.brandRows'], ['brands.connectionRows']]);
  const by = {};
  for (const c of conns) {
    const { config_json, ...rest } = c;
    (by[c.brand_id] || (by[c.brand_id] = [])).push({ ...rest, config: safeJson(config_json, {}) });
  }
  return { brands: brands.map(b => ({ ...b, connections: by[b.id] || [] })), kinds: KINDS };
}

/** GET /ah/api/accounts: the brands in the old row shape, the ad accounts no brand has yet, and when the
 *  last scan for ad accounts ran. A client never gets the scan stamp (the old noDiscover pass). */
export async function listAccounts(ctx) {
  const [rows, free] = await ctx.db.batch([['brands.accountRows'], ['brands.metaAvailable']]);
  const accounts = rows.map(a => ({ ...a, budgets: safeJson(a.budgets_json, {}), goals: safeJson(a.goals_json, {}) }));
  if (isClient(ctx)) return { accounts, meta_available: free };
  return { accounts, meta_available: free, lastDiscover: await ctx.settings.getJson('lastDiscover', null) };
}

/* What the old editor also takes, and why each goes to the old engine instead of being saved here. */
const HANDED_ON = [
  ['active', 'a status change can start a first sync or make a new brand'],
  ['tw_shop', 'the tracker shop is a connection, not a brand setting'],
  ['slack_channel', 'the channels decide where messages go'],
  ['brief_channel', 'the channels decide where messages go'],
  ['brief_enabled', 'the brief switch decides whether messages go out'],
];
const PATH_ID = /^(act_\d+|asana_\d+|brand_[a-z0-9_]+|demo_[a-z0-9_]+)$/;
const given = v => v !== undefined && v !== null;
const textOrNumber = v => typeof v === 'string' || typeof v === 'number';

/* '' clears a value, a missing value keeps what is there. */
function numOrKeep(v, keep) {
  if (v === '') return null;
  if (!given(v)) return keep === undefined ? null : keep;
  if (!textOrNumber(v)) fail(400, 'That value is not right.', 'input');
  return v;
}

function textOrKeep(v, keep) {
  if (!given(v)) return keep;
  if (!textOrNumber(v)) fail(400, 'That value is not right.', 'input');
  return String(v);
}

/** PUT /ah/api/accounts/:id: save a brand's name, time zone, budgets and goals. One row, nothing else.
 *  Status, channels, the brief switch and the tracker shop are sent on to the old engine. */
export async function saveAccount(ctx, input) {
  const body = input.body;
  if (!PATH_ID.test(input.params.id || '')) fail(404, 'not found');
  if (!isPlainObject(body)) fail(400, 'Send that as JSON.', 'input');
  for (const [key, why] of HANDED_ON) if (given(body[key])) return ctx.forward(why);
  const cur = await ctx.db.one('brands.accountOne');
  if (!cur) fail(404, 'unknown account');
  await ctx.db.run('brands.saveGoals', {
    name: textOrKeep(body.name, cur.name),
    monthly_budget: numOrKeep(body.monthly_budget, cur.monthly_budget),
    budgets_json: body.budgets ? JSON.stringify(body.budgets) : cur.budgets_json,
    tz: textOrKeep(body.tz, cur.tz),
    target_cpa: numOrKeep(body.target_cpa, cur.target_cpa),
    target_roas: numOrKeep(body.target_roas, cur.target_roas),
    goals_json: body.goals ? JSON.stringify(body.goals) : cur.goals_json,
  });
  return { ok: true };
}

/* The brand a profit route named, in the few columns those routes use. The old words for each refusal. */
async function mustAccount(ctx) {
  if (!ctx.scope.brand) fail(400, 'pick a brand first');
  const acct = await ctx.db.one('brands.brandAccount');
  if (!acct) fail(404, 'unknown account');
  return acct;
}

/* A client never gets the stored keys of the outside tools or the task tool's hook (the old noDocSecrets pass). */
const TEAM_DOC = /^(klaviyo|clarity|survey_.*|asana|google|tiktok)$/;
function withoutDocSecrets(page) {
  for (const line of Object.values(page.docs || {})) {
    if (!isPlainObject(line)) continue;
    for (const key of Object.keys(line)) if (TEAM_DOC.test(key)) delete line[key];
  }
  return page;
}

/** GET /pw/api/brand: one brand's research, angles and tests. */
export async function readBrand(ctx) {
  const acct = await mustAccount(ctx);
  const today = ctx.now.toISOString().slice(0, 10);
  const page = brandPage(acct, await ctx.db.batch(pageReads(today)), ctx.now);
  return isClient(ctx) ? withoutDocSecrets(page) : page;
}

/** GET /pw/api/brand/rules: the test and call rules of one brand. */
export async function readRules(ctx) {
  const acct = await mustAccount(ctx);
  const row = await ctx.db.one('brands.rulesDoc');
  return { ok: true, rules: rulesFor(acct, safeJson(row && row.data_json, {})), goal_roas: acct.target_roas > 0 ? +acct.target_roas : null };
}
