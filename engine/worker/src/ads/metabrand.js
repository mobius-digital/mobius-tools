/* Paid > Meta for one brand: totals, campaign > ad set > ad, the day series and the change markers. */
// from profit/worker/src/hub.js (metaBrand)
import { roas, cpa, cpm, ctr } from '../numbers/defs.js';
import { num, byKey, twoWindows, creditByAd } from './base.js';
import { metaMetrics, withLeads, leadSplit, objKind, PENDING } from './metamath.js';
import { adGoals } from './goals.js';

const SUMMED = ['spend', 'impr', 'reach', 'clicks', 'clicks_all', 'atc', 'p_ord', 'p_rev', 'v3', 'thru', 'plays', 'leads'];
const NO_CREDIT = { byAd: {}, byDate: {} };
const LEVELS = r => [['camp', r.campaign_id], ['set', r.adset_id]];

function addInto(total, row) {
  for (const k of SUMMED) total[k] = (total[k] || 0) + num(row[k]);
}

async function total(ctx, act, from, to, w, model) {
  let r = await ctx.db.one('ads.metaTotalOne', { act, from, to });
  /* Today: the ad rows land overnight, so the account's own totals so far are used when they are empty. */
  const live = from === to && to === w.today;
  if (live && !num(r && r.spend)) r = (await ctx.db.one('ads.metaTodayOne', { act, day: to })) || r;
  const at = model === 'platform' ? null : await ctx.db.one('ads.attrTotalOne', { act, model, from, to });
  const m = metaMetrics(r || {}, at ? { rev: num(at.rev), ord: num(at.ord) } : null);
  if (live && at && !num(at.n)) Object.assign(m, PENDING);
  return m;
}

/* Spend and purchases of the window before, per campaign and per ad set. */
function prevBuckets(prevAds, prevAdIds, prevCredit, model) {
  const by = { camp: {}, set: {} };
  const bucket = (k, id) => (by[k][id] ||= { spend: 0, p_ord: 0, ord: 0 });
  for (const r of prevAds) for (const [k, id] of LEVELS(r)) { const b = bucket(k, id); b.spend += num(r.spend); b.p_ord += num(r.p_ord); }
  if (model !== 'platform') {
    for (const r of prevAdIds) {
      const c = prevCredit[r.ad_id];
      if (c) for (const [k, id] of LEVELS(r)) bucket(k, id).ord += c.ord;
    }
  }
  return by;
}

function campaignMap(adRows, camps, sets, byAd, model) {
  const map = {};
  for (const r of adRows) {
    const cid = r.campaign_id || '?', sid = r.adset_id || '?';
    const cm = camps[cid], sm = sets[sid];
    const c = map[cid] ||= { id: cid, name: (cm && cm.name) || (cid === '?' ? 'Unknown campaign' : `Campaign ${cid}`),
      objective: (cm && cm.objective) || null, status: (cm && cm.status) || null, budget: cm ? cm.daily_budget ?? null : null,
      raw: {}, attr: { rev: 0, ord: 0 }, sets: {} };
    const s = c.sets[sid] ||= { id: sid, name: (sm && sm.name) || `Ad set ${sid}`, status: (sm && sm.status) || null,
      budget: sm ? sm.daily_budget ?? null : null, min_spend: sm ? sm.min_spend ?? null : null,
      goal: (sm && sm.optimization_goal) || null, raw: {}, attr: { rev: 0, ord: 0 }, ads: [] };
    const credit = byAd[r.ad_id] || { rev: 0, ord: 0 };
    addInto(c.raw, r); addInto(s.raw, r);
    c.attr.rev += credit.rev; c.attr.ord += credit.ord; s.attr.rev += credit.rev; s.attr.ord += credit.ord;
    s.ads.push({ id: r.ad_id, name: r.ad_name || r.ad_id, media_type: r.media_type || null,
      first_spend: r.first_spend_date || (r.created_time || '').slice(0, 10) || null,
      ...metaMetrics(r, model === 'platform' ? null : credit) });
  }
  return map;
}

function campaignTree(map, prevBy, model) {
  const own = model === 'platform';
  const bySpend = (x, y) => y.spend - x.spend;
  const before = b => {
    if (!b) return null;
    const bought = own ? b.p_ord : b.ord;
    return { spend: b.spend, purchases: bought, cpa: cpa(b.spend, bought) };
  };
  return Object.values(map).map(c => ({ id: c.id, name: c.name, objective: c.objective, obj: objKind(c.objective), status: c.status,
    budget: c.budget, ...metaMetrics(c.raw, own ? null : c.attr), prev: before(prevBy.camp[c.id]),
    adsets: Object.values(c.sets).map(s => ({ id: s.id, name: s.name, status: s.status, budget: s.budget, min_spend: s.min_spend,
      goal: s.goal, ...metaMetrics(s.raw, own ? null : s.attr), prev: before(prevBy.set[s.id]), ads: s.ads.sort(bySpend) }))
      .sort(bySpend) })).sort(bySpend);
}

/* The day series: spend by campaign, purchases and revenue under the model. */
function daySeries(daily, byDate, model) {
  const byDay = {};
  for (const r of daily) {
    const d = byDay[r.date] ||= { date: r.date, spend: 0, p_ord: 0, p_rev: 0, impr: 0, clicks: 0, atc: 0, camps: {} };
    d.spend += num(r.spend); d.p_ord += num(r.p_ord); d.p_rev += num(r.p_rev); d.impr += num(r.impr); d.clicks += num(r.clicks); d.atc += num(r.atc);
    d.camps[r.campaign_id] = (d.camps[r.campaign_id] || 0) + num(r.spend);
  }
  return Object.values(byDay).sort((x, y) => (x.date < y.date ? -1 : 1)).map(d => {
    const c = byDate[d.date];
    const ord = model === 'platform' ? d.p_ord : (c ? c.ord : 0), rev = model === 'platform' ? d.p_rev : (c ? c.rev : 0);
    return { date: d.date, spend: d.spend, purchases: ord, revenue: rev, platform_revenue: d.p_rev, cpa: cpa(d.spend, ord),
      roas: roas(rev, d.spend), ctr: ctr(d.clicks, d.impr), cpm: cpm(d.spend, d.impr), impressions: d.impr, clicks: d.clicks, camps: d.camps };
  });
}

function prevSeries(prevDaily, byDate, model) {
  return prevDaily.map(d => {
    const c = byDate[d.date], spend = num(d.spend);
    const ord = model === 'platform' ? num(d.p_ord) : (c ? c.ord : 0), rev = model === 'platform' ? num(d.p_rev) : (c ? c.rev : 0);
    return { date: d.date, spend, purchases: ord, revenue: rev, cpa: cpa(spend, ord), roas: roas(rev, spend),
      ctr: ctr(num(d.clicks), num(d.impr)), cpm: cpm(spend, num(d.impr)) };
  });
}

async function detail(ctx, act, w, model) {
  const cur = { act, from: w.from, to: w.to }, before = { act, from: w.pf, to: w.pt };
  const daily = await ctx.db.all('ads.metaDaysByCampaign', cur);
  const credit = await creditByAd(ctx, act, w.from, w.to, model);
  const prevDaily = w.pf ? await ctx.db.all('ads.metaDaysOne', before) : [];
  const prevCredit = w.pf ? await creditByAd(ctx, act, w.pf, w.pt, model) : NO_CREDIT;
  const adRows = await ctx.db.all('ads.metaAdRows', cur);
  const camps = byKey(await ctx.db.all('ads.campaigns', { act }), 'campaign_id');
  const sets = byKey(await ctx.db.all('ads.adsets', { act }), 'adset_id');
  const prevAds = w.pf ? await ctx.db.all('ads.prevBySet', before) : [];
  const prevAdIds = w.pf ? await ctx.db.all('ads.prevAdIds', before) : [];
  const prevBy = prevBuckets(prevAds, prevAdIds, prevCredit.byAd, model);
  return { campaigns: campaignTree(campaignMap(adRows, camps, sets, credit.byAd, model), prevBy, model),
    series: daySeries(daily, credit.byDate, model), prev_series: prevSeries(prevDaily, prevCredit.byDate, model),
    /* The account's own changes in the window (budget, launches, pauses), for chart markers. */
    changes: await ctx.db.all('ads.chartChanges', cur) };
}

/** One brand in full. */
export async function metaBrand(ctx, brand, w, model) {
  const act = brand.act_id;
  const leads = (await leadSplit(ctx, [act], twoWindows(w)))[act] || {};
  const cur = withLeads(await total(ctx, act, w.from, w.to, w, model), leads.cur);
  const prev = w.pf ? withLeads(await total(ctx, act, w.pf, w.pt, w, model), leads.prev) : null;
  const goals = (await adGoals(ctx, [brand]))[act];
  return { act_id: act, name: brand.name, currency: brand.currency, goals, cur, prev, ...(await detail(ctx, act, w, model)) };
}
