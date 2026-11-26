/* The Creative screen for one brand: every ad with spend, judged inside its ad set, with its tags,
   its customer value, its look alikes and the rollups. */
// from profit/worker/src/hub.js (creativeBrand, ltvByAd, formatOf, batchOf)
import { roas, cpa, pct, safeDiv } from '../numbers/defs.js';
import { addDays, dayDiff } from '../platform/time.js';
import { safeJson } from '../platform/text.js';
import { num, byKey, creditMaps } from './base.js';
import { metaMetrics, objKind } from './metamath.js';
import { lookAlikeGroups } from './alike.js';
import { fatigueOf, weeksOf, weeksStart, rollBy } from './creativeroll.js';
import { adGoals } from './goals.js';

const MAX_ADS = 400;
const FIRST_CLICK = 'fullFirstClick', LAST_CLICK = 'lastPlatformClick';
const firstDay = r => r.first_spend_date || (r.created_time || '').slice(0, 10) || null;

/* The format is the last part of an ad name after a bar. The batch is the number the name starts with. */
function formatOf(name) {
  const parts = String(name || '').split('|');
  if (parts.length < 2) return null;
  const t = parts[parts.length - 1].trim();
  return /[a-z]/i.test(t) ? t.replace(/\s+/g, ' ').slice(0, 24) : null;
}
const batchOf = name => { const m = String(name || '').match(/^\s*(?:[A-Z]{1,4}_)?(\d{2,4})\b/); return m ? m[1] : null; };

/* The tracker's credit per ad under the screen's model, plus first click and last click beside it:
   an ad credited far more on first click starts journeys, one credited more on last click closes them. */
async function readCredit(ctx, act, w, model) {
  if (model === 'platform') return { byAd: {}, first: {}, last: {}, orderAt: null };
  const read = m => ctx.db.all('ads.attrByAdDay', { act, model: m, from: w.from, to: w.to });
  const rows = await read(model);
  const byAd = creditMaps(rows).byAd;
  const orderAt = {};
  for (const r of rows) orderAt[`${r.ad_id}|${r.date}`] = r.ord;
  return { byAd, orderAt, first: model === FIRST_CLICK ? byAd : creditMaps(await read(FIRST_CLICK)).byAd,
    last: model === LAST_CLICK ? byAd : creditMaps(await read(LAST_CLICK)).byAd };
}

async function readNames(ctx, act) {
  const camps = await ctx.db.all('ads.campaigns', { act });
  const angles = await ctx.db.all('ads.batchAngles', { act });
  const tags = await ctx.db.all('ads.adTags', { act });
  return { campaign: byKey(camps, 'campaign_id', 'name'),
    obj: Object.fromEntries(camps.map(c => [c.campaign_id, objKind(c.objective)])),
    set: byKey(await ctx.db.all('ads.adsets', { act }), 'adset_id', 'name'),
    angle: Object.fromEntries(angles.map(b => [String(b.num).replace(/^\D+/, ''), b.angle])),
    tags: Object.fromEntries(tags.map(t => [t.asset_key, safeJson(t.tags_json, null)])) };
}

function adRow(r, names, credit, model, today) {
  const own = model === 'platform';
  const first = firstDay(r), batch = batchOf(r.name);
  return { id: r.ad_id, name: r.name || r.ad_id, media_type: r.media_type || (num(r.v3) > 0 ? 'video' : 'image'),
    campaign: names.campaign[r.campaign_id] || null, obj: names.obj[r.campaign_id] || 'sales', adset_id: r.adset_id || null,
    fc_rev: own ? null : num((credit.first[r.ad_id] || {}).rev), lc_rev: own ? null : num((credit.last[r.ad_id] || {}).rev),
    first_spend: first, age: first ? Math.max(0, dayDiff(first, today)) : null,
    format: formatOf(r.name), batch, angle: batch ? (names.angle[batch] || null) : null, asset_key: r.asset_key || null,
    tags: r.asset_key ? (names.tags[r.asset_key] || null) : null, last_day: r.last_day || null,
    ...metaMetrics(r, own ? null : (credit.byAd[r.ad_id] || { rev: 0, ord: 0 })) };
}

/* The ad set is the unit: every ad carries its ad set's totals, its share of that spend and its rank. */
function judgeInSets(rows, setNames) {
  const sets = {};
  for (const r of rows) {
    if (!r.adset_id) continue;
    const x = sets[r.adset_id] ||= { id: r.adset_id, name: setNames[r.adset_id] || null, spend: 0, revenue: 0, purchases: 0, ads: 0 };
    x.spend += r.spend; x.revenue += r.revenue || 0; x.purchases += r.purchases || 0; x.leads = (x.leads || 0) + (r.leads || 0); x.ads++;
  }
  for (const x of Object.values(sets)) { x.cpa = cpa(x.spend, x.purchases); x.roas = roas(x.revenue, x.spend); x.cpl = cpa(x.spend, x.leads); }
  const rank = {};
  for (const r of rows) {
    if (!r.adset_id) continue;
    const x = sets[r.adset_id];
    r.adset = { id: x.id, name: x.name, spend: x.spend, purchases: x.purchases, revenue: x.revenue, cpa: x.cpa, roas: x.roas,
      leads: x.leads || 0, cpl: x.cpl, ads: x.ads };
    r.set_share = pct(r.spend, x.spend);
    r.set_rank = rank[r.adset_id] = (rank[r.adset_id] || 0) + 1;
  }
}

/* Customer value per ad: what the customers an ad started spent in their first 90 days. Only customers whose
   first order is 90 or more days old count. It is a property of the ad, not of the window. */
async function addCustomerValue(ctx, act, rows, asOf) {
  const value = byKey(await ctx.db.all('ads.valueByAd', { act, as_of: asOf }), 'ad_id');
  for (const r of rows) {
    const v = value[r.id];
    if (!v || !v.n) continue;
    const first = v.first || 0, v90 = v.v90 || 0;
    r.ltv_n = v.n; r.ltv_first = safeDiv(first, v.n); r.ltv90 = safeDiv(v90, v.n); r.ltv_x = first ? safeDiv(v90, first) : null;
  }
}

/* Look alikes among the ads still spending in the last 7 days of the window. */
function markAlike(rows, to) {
  const liveFrom = addDays(to, -6);
  const groups = lookAlikeGroups(rows.filter(r => r.last_day && r.last_day >= liveFrom));
  const byId = byKey(rows, 'id');
  for (const g of groups) {
    for (const x of g.ads) {
      const r = byId[x.id];
      if (r) { r.twins = g.ads.filter(y => y.id !== x.id).map(y => ({ id: y.id, name: y.name })); r.twin_kind = g.kind; }
    }
  }
  return groups;
}

/** The whole Creative answer for one brand, without the model and window header. */
export async function creativeBrand(ctx, brand, w, model) {
  const act = brand.act_id, win = { act, from: w.from, to: w.to };
  const ads = await ctx.db.all('ads.creativeAds', win);
  const credit = await readCredit(ctx, act, w, model);
  const names = await readNames(ctx, act);
  const rows = ads.map(r => adRow(r, names, credit, model, w.to)).sort((x, y) => y.spend - x.spend);
  await addCustomerValue(ctx, act, rows, w.to);
  const alike = markAlike(rows, w.to);
  judgeInSets(rows, names.set);
  const fatigue = fatigueOf(rows, await ctx.db.all('ads.adDaysSpend', win), credit.orderAt);
  const spendDays = await ctx.db.all('ads.adDaysSpend', { act, from: weeksStart(w.to), to: w.to });
  const firsts = Object.fromEntries((await ctx.db.all('ads.adFirsts', { act })).map(r => [r.ad_id, r.first_spend_date || (r.created_time || '').slice(0, 10)]));
  return { act_id: act, name: brand.name, currency: brand.currency, goals: (await adGoals(ctx, [brand]))[act],
    ads: rows.slice(0, MAX_ADS), fatigue, weeks: weeksOf(w.to, firsts, spendDays),
    by_format: rollBy(rows, 'format'), by_angle: rollBy(rows, 'angle'), by_type: rollBy(rows, 'media_type'),
    alike: alike.map(g => ({ ...g, adset_name: names.set[g.adset_id] || null })) };
}
