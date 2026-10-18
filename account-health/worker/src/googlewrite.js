/**
 * THE STRATEGIST'S GOOGLE ADS HANDS (2026-10-17). Before this the Strategist could only pause / budget a campaign
 * through locus_write and add exact negatives from the leak finder. Now, with the metawrite.js rules (look up first,
 * the brand's own customer only, before -> after, Google checks it first with validateOnly, a p_ext_write row with the
 * inverse operations for undo, a Change Log line):
 *
 *   google_read         live structure: campaigns (status, type, budget, bidding + target), ad groups, keywords, RSAs
 *   google_status       pause / turn on a campaign, ad group, ad or keyword
 *   google_budget       a campaign's daily budget (over 50% in one step only when asked outright)
 *   google_target       a campaign's target ROAS or target CPA (Smart Bidding)
 *   google_rename       a campaign or ad group
 *   google_keywords     add keywords to an ad group (exact / phrase / broad, optional max CPC)
 *   google_keyword_bid  one keyword's max CPC (manual CPC ad groups)
 *   google_negative     add or remove a negative keyword on a campaign or ad group, any match type
 *   google_ad_text      rewrite a responsive search ad's headlines / descriptions / final URL
 *
 * Every operation goes to Google twice: once with validateOnly in the proposal (so a refusal shows on the card,
 * never at Apply), once for real. Undo replays the stored inverse operations.
 */
import { adsCustomer, adsQuery, adsMutate, adsError, adsDropCache, adsCampaignWrite } from './google.js';
import { recordWrite, registerUndo, doneNote, brandOf } from './extwrite.js';

const P = 'google';
const clip = (s, n) => String(s ?? '').slice(0, n);
const lc = s => String(s || '').replace(/_/g, ' ').toLowerCase();
const $ = v => v == null ? 'none' : `$${(+v).toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const esc = s => String(s).replace(/[\\'"]/g, '').replace(/[.*+?^${}()|[\]]/g, '\\\\$&');
const REASON = { type: 'string', description: 'Why, in one line with the number behind it (shown on the card and written in the Change Log).' };
const LEVELS = ['campaign', 'ad_group', 'ad', 'keyword'];

async function prep(env, d, input, ctx) {
  const brand = await brandOf(env, d, input.brand, ctx);
  if (!brand) return { error: `Which brand? No brand called "${input.brand || ''}".` };
  const cid = await adsCustomer(env, brand.act_id);
  if (!cid) return { error: `${brand.name} has no Google Ads account linked (Brand settings > Integrations > Google Ads).` };
  return { brand, cid };
}
const q = async (env, cid, sql) => { try { return (await adsQuery(env, cid, sql)).results || []; } catch (e) { throw new Error(`Google Ads did not answer: ${adsError(e)}`); } };
const byIdOrName = (field, idField, t) => /^\d{4,}$/.test(t) ? `${idField} = ${t}` : `${field} REGEXP_MATCH '(?i).*${esc(t)}.*'`;

/** One object, by id or words in its name, inside the brand's own customer. */
async function find(env, cid, level, target, extra = '') {
  const t = String(target || '').trim();
  if (!t) return { error: 'Name it, or give its id (read it with google_read first).' };
  let rows, pick;
  if (level === 'campaign') {
    rows = await q(env, cid, `SELECT campaign.id, campaign.name, campaign.status, campaign.resource_name, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.bidding_strategy, campaign.campaign_budget, campaign.maximize_conversion_value.target_roas, campaign.maximize_conversions.target_cpa_micros, campaign.target_roas.target_roas, campaign.target_cpa.target_cpa_micros FROM campaign WHERE campaign.status != 'REMOVED' AND ${byIdOrName('campaign.name', 'campaign.id', t)} LIMIT 20`);
    pick = r => ({ id: String(r.campaign.id), name: r.campaign.name, status: r.campaign.status, resource: r.campaign.resourceName, raw: r });
  } else if (level === 'ad_group') {
    rows = await q(env, cid, `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.resource_name, ad_group.type, ad_group.cpc_bid_micros, campaign.name FROM ad_group WHERE ad_group.status != 'REMOVED' AND ${byIdOrName('ad_group.name', 'ad_group.id', t)} ${extra} LIMIT 20`);
    pick = r => ({ id: String(r.adGroup.id), name: r.adGroup.name, status: r.adGroup.status, resource: r.adGroup.resourceName, where: `campaign "${r.campaign?.name}"`, raw: r });
  } else if (level === 'ad') {
    if (!/^\d{4,}$/.test(t)) return { error: 'Give the ad id (google_read with ads: true lists them).' };
    rows = await q(env, cid, `SELECT ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.status, ad_group_ad.resource_name, ad_group_ad.ad.resource_name, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group.name, campaign.name FROM ad_group_ad WHERE ad_group_ad.ad.id = ${t} AND ad_group_ad.status != 'REMOVED' LIMIT 5`);
    pick = r => ({ id: String(r.adGroupAd.ad.id), name: `${lc(r.adGroupAd.ad.type)} ad ${r.adGroupAd.ad.id}`, status: r.adGroupAd.status, resource: r.adGroupAd.resourceName, where: `ad group "${r.adGroup?.name}" in "${r.campaign?.name}"`, raw: r });
  } else if (level === 'keyword') {
    const w = /^\d{4,}$/.test(t) ? `ad_group_criterion.criterion_id = ${t}` : `ad_group_criterion.keyword.text REGEXP_MATCH '(?i)${esc(t)}'`;
    rows = await q(env, cid, `SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.resource_name, ad_group_criterion.cpc_bid_micros, ad_group.name, campaign.name FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE AND ad_group_criterion.status != 'REMOVED' AND ${w} ${extra} LIMIT 20`);
    pick = r => ({ id: String(r.adGroupCriterion.criterionId), name: `keyword [${r.adGroupCriterion.keyword?.text}] (${lc(r.adGroupCriterion.keyword?.matchType)})`, status: r.adGroupCriterion.status, resource: r.adGroupCriterion.resourceName, where: `ad group "${r.adGroup?.name}" in "${r.campaign?.name}"`, raw: r });
  } else return { error: `level is ${LEVELS.join(', ')}.` };
  const all = rows.map(pick);
  const exact = all.filter(o => o.id === t || String(o.name).toLowerCase() === t.toLowerCase() || o.name.toLowerCase().includes(`[${t.toLowerCase()}]`));
  const hit = exact.length === 1 ? exact[0] : (!exact.length && all.length === 1 ? all[0] : null);
  if (hit) return { obj: hit };
  if (!all.length) return { error: `No ${lc(level)} like "${t}" in this Google Ads account.` };
  return { error: `"${t}" matches ${all.length}: ${(exact.length ? exact : all).slice(0, 8).map(o => `${o.name} (${o.id}${o.where ? `, ${o.where}` : ''})`).join('; ')}. Say which, by id.` };
}
const SERVICE = { campaign: 'campaigns', ad_group: 'adGroups', ad: 'adGroupAds', keyword: 'adGroupCriteria' };

/** Google checks the operations now; the card only shows what Google would accept. */
async function check(env, cid, service, ops) {
  try { await adsMutate(env, cid, service, ops, true); return null; }
  catch (e) { return `Google Ads would refuse this: ${adsError(e)}`; }
}
/** The write itself, the record with the inverse operations, the cache dropped. */
async function run(env, p, ctx, { inverse, objectType, category }) {
  let j;
  try { j = await adsMutate(env, p.cid, p.service, p.ops); }
  catch (e) { return { error: `Google Ads refused it: ${adsError(e)}` }; }
  const made = (j.results || []).map(r => r.resourceName).filter(Boolean);
  const inv = typeof inverse === 'function' ? inverse(made) : inverse;
  await adsDropCache(env, p.brand);
  const id = await recordWrite(env, { platform: P, brand: p.brand, object: p.object, name: p.name, action: p.action, before: p.before || null, after: p.after || null,
    undo: inv ? { cid: p.cid, service: inv.service || p.service, ops: inv.ops } : null, summary: p.line, reason: p.reason, category, objectType, ctx });
  return { ok: true, write: id, made, note: doneNote(p.done || `${p.line}: done.`, id, !!inv) };
}

const statusAction = d => ({
  name: 'google_status',
  description: 'Pause or turn on ONE Google Ads campaign, ad group, ad or keyword. Read it with google_read first and name the level.',
  input_schema: { type: 'object', properties: { brand: { type: 'string' }, level: { type: 'string', enum: LEVELS }, target: { type: 'string', description: 'Its id, or words in its name (keyword text for a keyword).' }, status: { type: 'string', enum: ['pause', 'enable'] }, reason: REASON }, required: ['brand', 'level', 'target', 'status', 'reason'] },
  propose: async (env, i, h, ctx) => {
    const r = await prep(env, d, i, ctx); if (r.error) return r;
    let f; try { f = await find(env, r.cid, i.level, i.target); } catch (e) { return { error: e.message }; } if (f.error) return f;
    const to = i.status === 'pause' ? 'PAUSED' : 'ENABLED';
    if (f.obj.status === to) return { error: `${f.obj.name} is already ${lc(to)}.` };
    const op = s => [{ update: { resourceName: f.obj.resource, status: s }, updateMask: 'status' }];
    const bad = await check(env, r.cid, SERVICE[i.level], op(to)); if (bad) return { error: bad };
    const line = `${to === 'PAUSED' ? 'Pause' : 'Turn on'} Google ${lc(i.level)} "${f.obj.name}"`;
    return { summary: `${r.brand.name}: ${line}`, detail: `${lc(f.obj.status)} → ${lc(to)}.${f.obj.where ? ` In ${f.obj.where}.` : ''}\nWhy: ${clip(i.reason, 300)}`,
      patch: { cid: r.cid, brand: r.brand.act_id, service: SERVICE[i.level], ops: op(to), inv: op(f.obj.status), object: f.obj.resource, name: f.obj.name, action: 'google_status', before: { status: f.obj.status }, after: { status: to }, line, level: i.level, reason: clip(i.reason, 300) } };
  },
  apply: (env, p, h, ctx) => run(env, p, ctx, { inverse: { ops: p.inv }, objectType: `GOOGLE_${p.level.toUpperCase()}`, category: p.level === 'campaign' ? (p.after.status === 'PAUSED' ? 'campaign_paused' : 'campaign_relaunched') : 'other' }),
});

const budgetAction = d => ({
  name: 'google_budget',
  description: 'Change a Google Ads campaign\'s daily budget (dollars). Over 50% in one step only when the person asked for exactly that (big: true). Shared and total budgets are refused (they move other campaigns).',
  input_schema: { type: 'object', properties: { brand: { type: 'string' }, target: { type: 'string', description: 'The campaign id or name.' }, amount: { type: 'number' }, big: { type: 'boolean' }, reason: REASON }, required: ['brand', 'target', 'amount', 'reason'] },
  propose: async (env, i, h, ctx) => {
    const r = await prep(env, d, i, ctx); if (r.error) return r;
    let f; try { f = await find(env, r.cid, 'campaign', i.target); } catch (e) { return { error: e.message }; } if (f.error) return f;
    const dry = await adsCampaignWrite(env, r.brand.act_id, { kind: 'budget', object: f.obj.id, amount: i.amount, dry: true });
    if (dry.error) return { error: dry.error };
    const step = dry.before.budget ? Math.abs(dry.after.budget - dry.before.budget) / dry.before.budget : 0;
    if (step > 0.5 && !i.big) return { error: `${dry.summary}. That is over 50% in one step; propose a smaller step, or big: true if the person asked for exactly this.` };
    const val = await adsCampaignWrite(env, r.brand.act_id, { kind: 'budget', object: f.obj.id, amount: i.amount, validate: true });
    if (val.error) return { error: val.error };
    return { summary: `${r.brand.name}: ${dry.summary}`, detail: `Why: ${clip(i.reason, 300)}`, patch: { brand: r.brand.act_id, id: f.obj.id, name: f.obj.name, before: dry.before, after: dry.after, line: dry.summary, reason: clip(i.reason, 300) } };
  },
  apply: async (env, p, h, ctx) => {
    const w = await adsCampaignWrite(env, p.brand, { kind: 'budget', object: p.id, amount: p.after.budget, expect: p.before });
    if (w.error) return { error: w.error };
    const id = await recordWrite(env, { platform: P, brand: p.brand, object: p.id, name: p.name, action: 'google_budget', before: p.before, after: p.after,
      undo: { budget: { campaign: p.id, amount: p.before.budget } }, summary: p.line, reason: p.reason, category: 'budget', objectType: 'GOOGLE_CAMPAIGN', ctx });
    return { ok: true, write: id, note: doneNote(`${p.line}.`, id) };
  },
});

const TARGET_PATH = {
  MAXIMIZE_CONVERSION_VALUE: { key: 'maximizeConversionValue', field: 'targetRoas', mask: 'maximize_conversion_value.target_roas', kind: 'roas' },
  TARGET_ROAS: { key: 'targetRoas', field: 'targetRoas', mask: 'target_roas.target_roas', kind: 'roas' },
  MAXIMIZE_CONVERSIONS: { key: 'maximizeConversions', field: 'targetCpaMicros', mask: 'maximize_conversions.target_cpa_micros', kind: 'cpa' },
  TARGET_CPA: { key: 'targetCpa', field: 'targetCpaMicros', mask: 'target_cpa.target_cpa_micros', kind: 'cpa' },
};
const targetAction = d => ({
  name: 'google_target',
  description: 'Set (or clear with 0) a Google Ads campaign\'s Smart Bidding target: target ROAS as a multiple (3.5 = 350%) on Maximize conversion value / Target ROAS campaigns, or target CPA in dollars on Maximize conversions / Target CPA campaigns. Portfolio strategies are refused (they move other campaigns).',
  input_schema: { type: 'object', properties: { brand: { type: 'string' }, target: { type: 'string', description: 'The campaign id or name.' }, roas: { type: 'number', description: 'Target ROAS as a multiple: 3.5 means 350%.' }, cpa: { type: 'number', description: 'Target CPA in dollars.' }, reason: REASON }, required: ['brand', 'target', 'reason'] },
  propose: async (env, i, h, ctx) => {
    const r = await prep(env, d, i, ctx); if (r.error) return r;
    let f; try { f = await find(env, r.cid, 'campaign', i.target); } catch (e) { return { error: e.message }; } if (f.error) return f;
    const c = f.obj.raw.campaign;
    if (c.biddingStrategy) return { error: `"${c.name}" uses a portfolio bid strategy shared with other campaigns. Change it in Google Ads > Tools > Bid strategies.` };
    const t = TARGET_PATH[c.biddingStrategyType];
    if (!t) return { error: `"${c.name}" bids with ${lc(c.biddingStrategyType)}, which has no ROAS or CPA target.` };
    const want = t.kind === 'roas' ? i.roas : i.cpa;
    if (want == null) return { error: `"${c.name}" runs ${lc(c.biddingStrategyType)}: give ${t.kind === 'roas' ? 'roas (a multiple, 3.5 = 350%)' : 'cpa (dollars)'}.` };
    const curRaw = c[t.key]?.[t.field];
    const cur = curRaw == null ? null : t.kind === 'roas' ? +curRaw : +curRaw / 1e6;
    const to = +want > 0 ? (t.kind === 'roas' ? Math.round(+want * 100) / 100 : Math.round(+want * 100) / 100) : null;
    if (cur === to) return { error: 'It is already set that way.' };
    const show = v => v == null ? 'no target' : t.kind === 'roas' ? `${Math.round(v * 100)}%` : $(v);
    const val = v => v == null ? {} : { [t.field]: t.kind === 'roas' ? v : String(Math.round(v * 1e6)) };
    const op = v => [{ update: { resourceName: c.resourceName, [t.key]: val(v) }, updateMask: t.mask }];
    const bad = await check(env, r.cid, 'campaigns', op(to)); if (bad) return { error: bad };
    const big = cur && to && Math.abs(to - cur) / cur > 0.2 ? ' A move over 20% resets learning for a few days; Google suggests smaller steps.' : '';
    const line = `Google campaign "${c.name}" target ${t.kind.toUpperCase()} ${show(cur)} → ${show(to)}`;
    return { summary: `${r.brand.name}: ${line}`, detail: `${lc(c.biddingStrategyType)}.${big}\nWhy: ${clip(i.reason, 300)}`,
      patch: { cid: r.cid, brand: r.brand.act_id, service: 'campaigns', ops: op(to), inv: op(cur), object: c.resourceName, name: c.name, action: 'google_target', before: { [t.kind]: cur }, after: { [t.kind]: to }, line, reason: clip(i.reason, 300) } };
  },
  apply: (env, p, h, ctx) => run(env, p, ctx, { inverse: { ops: p.inv }, objectType: 'GOOGLE_CAMPAIGN', category: 'bid_strategy' }),
});

const renameAction = d => ({
  name: 'google_rename',
  description: 'Rename a Google Ads campaign or ad group.',
  input_schema: { type: 'object', properties: { brand: { type: 'string' }, level: { type: 'string', enum: ['campaign', 'ad_group'] }, target: { type: 'string' }, new_name: { type: 'string' }, reason: REASON }, required: ['brand', 'level', 'target', 'new_name'] },
  propose: async (env, i, h, ctx) => {
    const r = await prep(env, d, i, ctx); if (r.error) return r;
    let f; try { f = await find(env, r.cid, i.level, i.target); } catch (e) { return { error: e.message }; } if (f.error) return f;
    const to = clip(String(i.new_name || '').trim(), 250);
    if (!to || to === f.obj.name) return { error: 'Give a new name.' };
    const op = n => [{ update: { resourceName: f.obj.resource, name: n }, updateMask: 'name' }];
    const bad = await check(env, r.cid, SERVICE[i.level], op(to)); if (bad) return { error: bad };
    const line = `Rename Google ${lc(i.level)} "${f.obj.name}" → "${to}"`;
    return { summary: `${r.brand.name}: ${line}`, detail: '', patch: { cid: r.cid, brand: r.brand.act_id, service: SERVICE[i.level], ops: op(to), inv: op(f.obj.name), object: f.obj.resource, name: to, action: 'google_rename', before: { name: f.obj.name }, after: { name: to }, line, reason: clip(i.reason, 300) || null, level: i.level } };
  },
  apply: (env, p, h, ctx) => run(env, p, ctx, { inverse: { ops: p.inv }, objectType: `GOOGLE_${p.level.toUpperCase()}`, category: 'name' }),
});

const MATCH = ['EXACT', 'PHRASE', 'BROAD'];
const keywordsAction = d => ({
  name: 'google_keywords',
  description: 'Add keywords to a Google Ads ad group (Search): the words, the match type (exact / phrase / broad) and optionally a max CPC in dollars. Undo removes them.',
  input_schema: { type: 'object', properties: { brand: { type: 'string' }, ad_group: { type: 'string', description: 'The ad group id or name.' }, keywords: { type: 'array', items: { type: 'string' } }, match: { type: 'string', enum: MATCH.map(m => m.toLowerCase()) }, cpc: { type: 'number' }, paused: { type: 'boolean' }, reason: REASON }, required: ['brand', 'ad_group', 'keywords', 'reason'] },
  propose: async (env, i, h, ctx) => {
    const r = await prep(env, d, i, ctx); if (r.error) return r;
    let f; try { f = await find(env, r.cid, 'ad_group', i.ad_group); } catch (e) { return { error: e.message }; } if (f.error) return f;
    const words = [...new Set((i.keywords || []).map(k => String(k).trim().toLowerCase().replace(/^[[\]"+]+|[[\]"]+$/g, '').slice(0, 80)).filter(Boolean))].slice(0, 50);
    if (!words.length) return { error: 'Give the keywords.' };
    const match = MATCH.includes(String(i.match || '').toUpperCase()) ? String(i.match).toUpperCase() : 'PHRASE';
    const ops = words.map(text => ({ create: { adGroup: f.obj.resource, status: i.paused ? 'PAUSED' : 'ENABLED', keyword: { text, matchType: match }, ...(i.cpc > 0 ? { cpcBidMicros: String(Math.round(i.cpc * 1e6)) } : {}) } }));
    const bad = await check(env, r.cid, 'adGroupCriteria', ops); if (bad) return { error: bad };
    const line = `Add ${words.length} ${lc(match)} keyword${words.length > 1 ? 's' : ''} to Google ad group "${f.obj.name}"`;
    return { summary: `${r.brand.name}: ${line}`, detail: `${words.map(w => match === 'EXACT' ? `[${w}]` : match === 'PHRASE' ? `"${w}"` : w).join(', ')}${i.cpc > 0 ? `\nMax CPC ${$(i.cpc)}` : ''}${i.paused ? '\nAdded paused.' : ''}\nIn ${f.obj.where}.\nWhy: ${clip(i.reason, 300)}`,
      patch: { cid: r.cid, brand: r.brand.act_id, service: 'adGroupCriteria', ops, object: f.obj.resource, name: f.obj.name, action: 'google_keywords', after: { keywords: words, match }, line, reason: clip(i.reason, 300) } };
  },
  apply: (env, p, h, ctx) => run(env, p, ctx, { inverse: made => made.length ? { ops: made.map(rn => ({ remove: rn })) } : null, objectType: 'GOOGLE_AD_GROUP', category: 'targeting' }),
});

const keywordBidAction = d => ({
  name: 'google_keyword_bid',
  description: 'Set one Google Ads keyword\'s max CPC in dollars (it only bites on manual CPC ad groups; Smart Bidding ignores it). 0 clears it back to the ad group\'s bid.',
  input_schema: { type: 'object', properties: { brand: { type: 'string' }, keyword: { type: 'string', description: 'The keyword text or criterion id.' }, ad_group: { type: 'string', description: 'The ad group, when the same keyword sits in several.' }, cpc: { type: 'number' }, reason: REASON }, required: ['brand', 'keyword', 'cpc', 'reason'] },
  propose: async (env, i, h, ctx) => {
    const r = await prep(env, d, i, ctx); if (r.error) return r;
    const extra = i.ad_group ? `AND ${byIdOrName('ad_group.name', 'ad_group.id', String(i.ad_group))}` : '';
    let f; try { f = await find(env, r.cid, 'keyword', i.keyword, extra); } catch (e) { return { error: e.message }; } if (f.error) return f;
    const cur = f.obj.raw.adGroupCriterion.cpcBidMicros ? +f.obj.raw.adGroupCriterion.cpcBidMicros / 1e6 : null;
    const to = +i.cpc > 0 ? Math.round(+i.cpc * 100) / 100 : null;
    if (cur === to) return { error: 'It is already that.' };
    const op = v => [{ update: { resourceName: f.obj.resource, ...(v ? { cpcBidMicros: String(Math.round(v * 1e6)) } : {}) }, updateMask: 'cpc_bid_micros' }];
    const bad = await check(env, r.cid, 'adGroupCriteria', op(to)); if (bad) return { error: bad };
    const line = `Google ${f.obj.name} max CPC ${cur == null ? 'the ad group\'s' : $(cur)} → ${to == null ? 'the ad group\'s' : $(to)}`;
    return { summary: `${r.brand.name}: ${line}`, detail: `In ${f.obj.where}.\nWhy: ${clip(i.reason, 300)}`, patch: { cid: r.cid, brand: r.brand.act_id, service: 'adGroupCriteria', ops: op(to), inv: op(cur), object: f.obj.resource, name: f.obj.name, action: 'google_keyword_bid', before: { cpc: cur }, after: { cpc: to }, line, reason: clip(i.reason, 300) } };
  },
  apply: (env, p, h, ctx) => run(env, p, ctx, { inverse: { ops: p.inv }, objectType: 'GOOGLE_KEYWORD', category: 'bid_strategy' }),
});

const negativeAction = d => ({
  name: 'google_negative',
  description: 'Add (or remove) a NEGATIVE keyword on a Google Ads campaign or ad group, exact / phrase / broad, so a search term stops costing money. The leak finder\'s list says which terms; this does any of them, at any match type.',
  input_schema: { type: 'object', properties: { brand: { type: 'string' }, level: { type: 'string', enum: ['campaign', 'ad_group'] }, target: { type: 'string', description: 'The campaign or ad group id or name.' }, text: { type: 'string' }, match: { type: 'string', enum: MATCH.map(m => m.toLowerCase()) }, remove: { type: 'boolean' }, reason: REASON }, required: ['brand', 'level', 'target', 'text', 'reason'] },
  propose: async (env, i, h, ctx) => {
    const r = await prep(env, d, i, ctx); if (r.error) return r;
    const lvl = i.level === 'ad_group' ? 'ad_group' : 'campaign';
    let f; try { f = await find(env, r.cid, lvl, i.target); } catch (e) { return { error: e.message }; } if (f.error) return f;
    const text = String(i.text || '').trim().toLowerCase().replace(/^[[\]"]+|[[\]"]+$/g, '').slice(0, 80);
    if (!text) return { error: 'Which words?' };
    const match = MATCH.includes(String(i.match || '').toUpperCase()) ? String(i.match).toUpperCase() : 'EXACT';
    const service = lvl === 'campaign' ? 'campaignCriteria' : 'adGroupCriteria';
    const table = lvl === 'campaign' ? 'campaign_criterion' : 'ad_group_criterion';
    const parent = lvl === 'campaign' ? `campaign.id = ${f.obj.id}` : `ad_group.id = ${f.obj.id}`;
    const have = (await q(env, r.cid, `SELECT ${table}.resource_name, ${table}.keyword.text, ${table}.keyword.match_type FROM ${table} WHERE ${table}.negative = TRUE AND ${table}.type = 'KEYWORD' AND ${parent} AND ${table}.keyword.text = '${text.replace(/'/g, '')}'`))
      .map(x => x.campaignCriterion || x.adGroupCriterion).filter(x => !i.match || x.keyword?.matchType === match);
    const shown = match === 'EXACT' ? `[${text}]` : match === 'PHRASE' ? `"${text}"` : text;
    const parentKey = lvl === 'campaign' ? 'campaign' : 'adGroup';
    const createOp = { create: { [parentKey]: f.obj.resource, negative: true, keyword: { text, matchType: match } } };
    let ops, line, inv = null;
    if (i.remove) {
      if (!have.length) return { error: `There is no negative ${shown} on "${f.obj.name}".` };
      ops = have.map(x => ({ remove: x.resourceName }));
      inv = have.map(x => ({ create: { [parentKey]: f.obj.resource, negative: true, keyword: { text: x.keyword.text, matchType: x.keyword.matchType } } }));
      line = `Remove the negative ${shown} from Google ${lc(lvl)} "${f.obj.name}"`;
    } else {
      if (have.some(x => x.keyword?.matchType === match)) return { error: `${shown} is already a negative on "${f.obj.name}".` };
      ops = [createOp];
      line = `Negative ${shown} on Google ${lc(lvl)} "${f.obj.name}"`;
    }
    const bad = await check(env, r.cid, service, ops); if (bad) return { error: bad };
    return { summary: `${r.brand.name}: ${line}`, detail: `${i.remove ? 'Searches matching it can show the ads again.' : 'Searches matching it stop showing these ads.'}${f.obj.where ? ` In ${f.obj.where}.` : ''}\nWhy: ${clip(i.reason, 300)}`,
      patch: { cid: r.cid, brand: r.brand.act_id, service, ops, inv, object: f.obj.resource, name: f.obj.name, action: 'google_negative', after: { [i.remove ? 'removed' : 'negative']: shown }, line, reason: clip(i.reason, 300) } };
  },
  apply: (env, p, h, ctx) => run(env, p, ctx, { inverse: made => p.inv ? { ops: p.inv } : made.length ? { ops: made.map(rn => ({ remove: rn })) } : null, objectType: 'GOOGLE_NEGATIVE', category: 'targeting' }),
});

const adTextAction = d => ({
  name: 'google_ad_text',
  description: 'Rewrite a Google responsive search ad: its headlines (3 to 15, 30 characters each), descriptions (2 to 4, 90 each) and/or final URL. Give the full new list for what changes. The ad goes back through Google\'s review. Undo puts the old words (and pins) back.',
  input_schema: { type: 'object', properties: { brand: { type: 'string' }, ad: { type: 'string', description: 'The ad id (google_read ads: true).' }, headlines: { type: 'array', items: { type: 'string' } }, descriptions: { type: 'array', items: { type: 'string' } }, final_url: { type: 'string' }, reason: REASON }, required: ['brand', 'ad', 'reason'] },
  propose: async (env, i, h, ctx) => {
    const r = await prep(env, d, i, ctx); if (r.error) return r;
    let f; try { f = await find(env, r.cid, 'ad', i.ad); } catch (e) { return { error: e.message }; } if (f.error) return f;
    const ad = f.obj.raw.adGroupAd.ad;
    const rsa = ad.responsiveSearchAd;
    if (!rsa) return { error: `Ad ${ad.id} is a ${lc(ad.type)}, not a responsive search ad. Only RSAs can be rewritten in place.` };
    const H = i.headlines ? i.headlines.map(s => String(s).trim().replace(/\u2014/g, ',')).filter(Boolean) : null;
    const D = i.descriptions ? i.descriptions.map(s => String(s).trim().replace(/\u2014/g, ',')).filter(Boolean) : null;
    if (H && (H.length < 3 || H.length > 15 || H.some(s => s.length > 30))) return { error: `Headlines: 3 to 15, each 30 characters or fewer.${H.filter(s => s.length > 30).map(s => ` "${s}" is ${s.length}.`).join('')}` };
    if (D && (D.length < 2 || D.length > 4 || D.some(s => s.length > 90))) return { error: `Descriptions: 2 to 4, each 90 characters or fewer.${D.filter(s => s.length > 90).map(s => ` "${s.slice(0, 30)}..." is ${s.length}.`).join('')}` };
    const url = i.final_url ? String(i.final_url).trim() : null;
    if (url && !/^https:\/\//.test(url)) return { error: 'final_url must be a full https:// address.' };
    if (!H && !D && !url) return { error: 'Give new headlines, descriptions or a final URL.' };
    const asset = l => l.map(x => ({ text: x.text, ...(x.pinnedField ? { pinnedField: x.pinnedField } : {}) }));
    const mask = [H && 'responsive_search_ad.headlines', D && 'responsive_search_ad.descriptions', url && 'final_urls'].filter(Boolean).join(',');
    const body = (h0, d0, u0) => ({ resourceName: ad.resourceName, ...(h0 || d0 ? { responsiveSearchAd: { ...(h0 ? { headlines: h0 } : {}), ...(d0 ? { descriptions: d0 } : {}) } } : {}), ...(u0 ? { finalUrls: [u0] } : {}) });
    const ops = [{ update: body(H && H.map(text => ({ text })), D && D.map(text => ({ text })), url), updateMask: mask }];
    const inv = [{ update: body(H && asset(rsa.headlines || []), D && asset(rsa.descriptions || []), url && (ad.finalUrls || [])[0]), updateMask: mask }];
    const bad = await check(env, r.cid, 'ads', ops); if (bad) return { error: bad };
    const pins = [...(H ? rsa.headlines || [] : []), ...(D ? rsa.descriptions || [] : [])].some(x => x.pinnedField);
    const line = `Rewrite Google ad ${ad.id} (${[H && `${H.length} headlines`, D && `${D.length} descriptions`, url && 'final URL'].filter(Boolean).join(', ')})`;
    return { summary: `${r.brand.name}: ${line}`, detail: `In ${f.obj.where}.${H ? `\nHeadlines: ${H.join(' | ')}` : ''}${D ? `\nDescriptions: ${D.join(' | ')}` : ''}${url ? `\nFinal URL: ${url}` : ''}${pins ? '\nThe old pins are dropped (undo puts them back).' : ''}\nThe ad goes back through Google review.\nWhy: ${clip(i.reason, 300)}`,
      patch: { cid: r.cid, brand: r.brand.act_id, service: 'ads', ops, inv, object: ad.resourceName, name: `ad ${ad.id}`, action: 'google_ad_text', before: { headlines: (rsa.headlines || []).map(x => x.text), descriptions: (rsa.descriptions || []).map(x => x.text), final_url: (ad.finalUrls || [])[0] || null }, after: { headlines: H, descriptions: D, final_url: url }, line, reason: clip(i.reason, 300) } };
  },
  apply: (env, p, h, ctx) => run(env, p, ctx, { inverse: { ops: p.inv }, objectType: 'GOOGLE_AD', category: 'creative' }),
});

/* ---------------- google_read: the live structure ---------------- */
export function googleTools(d) {
  return [{
    def: { name: 'google_read',
      description: 'Read a brand\'s Google Ads account LIVE: every campaign (status, type, daily budget, bidding and its target), and on request the ad groups, keywords (with match type, status, max CPC) and responsive search ads (headlines, descriptions) of one campaign. Read this before any google_* change so the card names the right thing. Performance numbers: Triple Whale views and locus_get /api/google/ads.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, campaign: { type: 'string', description: 'One campaign (id or words in its name) for its ad groups, keywords and ads.' }, keywords: { type: 'boolean' }, ads: { type: 'boolean' }, all: { type: 'boolean', description: 'Paused campaigns too.' } } } },
    run: async (env, input, ctx) => {
      const r = await prep(env, d, input, ctx); if (r.error) return { is_error: true, text: r.error };
      try {
        const st = input.all ? `campaign.status != 'REMOVED'` : `campaign.status = 'ENABLED'`;
        const camps = await q(env, r.cid, `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.bidding_strategy, campaign_budget.amount_micros, campaign_budget.explicitly_shared, campaign.maximize_conversion_value.target_roas, campaign.maximize_conversions.target_cpa_micros, campaign.target_roas.target_roas, campaign.target_cpa.target_cpa_micros FROM campaign WHERE ${st} ORDER BY campaign.name LIMIT 200`);
        const out = { brand: r.brand.name, customer: r.cid, campaigns: camps.map(x => { const c = x.campaign; const t = TARGET_PATH[c.biddingStrategyType]; const tv = t ? c[t.key]?.[t.field] : null;
          return { id: String(c.id), name: c.name, status: lc(c.status), type: lc(c.advertisingChannelType), budget_per_day: x.campaignBudget?.amountMicros ? +x.campaignBudget.amountMicros / 1e6 : null, shared_budget: !!x.campaignBudget?.explicitlyShared, bidding: lc(c.biddingStrategyType), portfolio: !!c.biddingStrategy,
            target: tv == null ? null : t.kind === 'roas' ? `${Math.round(+tv * 100)}% ROAS` : `${$(+tv / 1e6)} CPA` }; }) };
        if (input.campaign) {
          const f = await find(env, r.cid, 'campaign', input.campaign); if (f.error) return { is_error: true, text: f.error };
          const cw = `campaign.id = ${f.obj.id}`;
          out.ad_groups = (await q(env, r.cid, `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, ad_group.cpc_bid_micros FROM ad_group WHERE ${cw} AND ad_group.status != 'REMOVED' LIMIT 200`))
            .map(x => ({ id: String(x.adGroup.id), name: x.adGroup.name, status: lc(x.adGroup.status), type: lc(x.adGroup.type), max_cpc: x.adGroup.cpcBidMicros ? +x.adGroup.cpcBidMicros / 1e6 : null }));
          if (input.keywords) out.keywords = (await q(env, r.cid, `SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.negative, ad_group_criterion.cpc_bid_micros, ad_group.name FROM ad_group_criterion WHERE ${cw} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED' LIMIT 500`))
            .map(x => ({ id: String(x.adGroupCriterion.criterionId), text: x.adGroupCriterion.keyword?.text, match: lc(x.adGroupCriterion.keyword?.matchType), status: lc(x.adGroupCriterion.status), negative: !!x.adGroupCriterion.negative, max_cpc: x.adGroupCriterion.cpcBidMicros ? +x.adGroupCriterion.cpcBidMicros / 1e6 : null, ad_group: x.adGroup?.name }));
          if (input.ads) out.ads = (await q(env, r.cid, `SELECT ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.status, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group.name FROM ad_group_ad WHERE ${cw} AND ad_group_ad.status != 'REMOVED' LIMIT 100`))
            .map(x => { const a = x.adGroupAd.ad; return { id: String(a.id), type: lc(a.type), status: lc(x.adGroupAd.status), ad_group: x.adGroup?.name, url: (a.finalUrls || [])[0] || null, headlines: (a.responsiveSearchAd?.headlines || []).map(h => h.text), descriptions: (a.responsiveSearchAd?.descriptions || []).map(h => h.text) }; });
        }
        const s = JSON.stringify(out);
        return { text: s.length > 20000 ? s.slice(0, 20000) + '... (trimmed: name one campaign)' : s };
      } catch (e) { return { is_error: true, text: e.message }; }
    },
  }];
}

registerUndo(P, async (env, d, row, u) => {
  if (u.budget) {
    const w = await adsCampaignWrite(env, row.brand, { kind: 'budget', object: u.budget.campaign, amount: u.budget.amount });
    return w.error ? { error: w.error } : { ok: true, note: `Undone: ${row.summary}.` };
  }
  try { await adsMutate(env, u.cid, u.service, u.ops); } catch (e) { return { error: `Google Ads refused the undo: ${adsError(e)}` }; }
  await adsDropCache(env, row.brand);
  return { ok: true, note: `Undone: ${row.summary}.` };
});

export function googleActions(d) {
  return [statusAction(d), budgetAction(d), targetAction(d), renameAction(d), keywordsAction(d), keywordBidAction(d), negativeAction(d), adTextAction(d)];
}
export const _test = { find, TARGET_PATH };
