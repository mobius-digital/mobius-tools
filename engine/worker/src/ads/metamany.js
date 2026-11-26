/* Meta totals and the day series for many brands at once: a fixed number of statements, whatever the
   brand count. */
// from profit/worker/src/hub.js (metaMany, attrMany)
import { roas, cpa, cpm, ctr } from '../numbers/defs.js';
import { num, dates, lowDay, twoWindows, sumCredit } from './base.js';
import { metaMetrics, withLeads, leadSplit, PENDING } from './metamath.js';
import { adGoals } from './goals.js';

/** The tracker's credit per brand per day for one platform. Empty maps under the platform model. */
export async function creditMany(ctx, acts, from, to, model, platform) {
  const out = Object.fromEntries(acts.map(a => [a, {}]));
  if (model === 'platform') return out;
  const rows = platform === 'meta'
    ? await ctx.db.all('ads.attrMetaMany', { acts, model, from, to })
    : await ctx.db.all('ads.attrPlatformMany', { acts, model, from, to, platform });
  for (const r of rows) (out[r.act_id] ??= {})[r.date] = { rev: r.rev || 0, ord: r.ord || 0 };
  return out;
}

function seriesOf(days, credit, from, to, model) {
  return dates(from, to).map(d => {
    const r = (days && days[d]) || {}, c = credit && credit[d];
    const spend = num(r.spend), impr = num(r.impr), clicks = num(r.clicks);
    const ord = model === 'platform' ? num(r.p_ord) : (c ? c.ord : 0), rev = model === 'platform' ? num(r.p_rev) : (c ? c.rev : 0);
    return { date: d, spend, impressions: impr, clicks, purchases: ord, revenue: rev, roas: roas(rev, spend), cpa: cpa(spend, ord),
      cpm: cpm(spend, impr), ctr: ctr(clicks, impr) };
  });
}

async function readMany(ctx, acts, w, model) {
  const windows = twoWindows(w);
  const totals = {}, byDay = {};
  for (const r of await ctx.db.all('ads.metaTotalsMany', { acts, ...windows })) (totals[r.act_id] ??= {})[r.win] = r;
  for (const r of await ctx.db.all('ads.metaDaysMany', { acts, ...windows })) (byDay[r.act_id] ??= {})[r.date] = r;
  const credit = await creditMany(ctx, acts, lowDay(w), w.to, model, 'meta');
  const leads = await leadSplit(ctx, acts, windows);
  /* Today: Meta's account totals so far (the ad rows land overnight). */
  const live = w.from === w.to && w.to === w.today;
  if (live) {
    for (const r of await ctx.db.all('ads.metaTodayMany', { acts, day: w.to })) {
      if (!num(totals[r.act_id]?.cur?.spend)) (totals[r.act_id] ??= {}).cur = r;
    }
  }
  return { totals, byDay, credit, leads, live };
}

/** One row per brand: goals, this window, the window before, and a line per day for each. */
export async function metaMany(ctx, brands, w, model) {
  const acts = brands.map(b => b.act_id);
  const { totals, byDay, credit, leads, live } = await readMany(ctx, acts, w, model);
  const goals = await adGoals(ctx, brands);
  return brands.map(b => {
    const id = b.act_id, own = model === 'platform';
    const curCredit = own ? null : sumCredit(credit[id], w.from, w.to);
    const prevCredit = own || !w.pf ? null : sumCredit(credit[id], w.pf, w.pt);
    const cur = withLeads(metaMetrics(totals[id]?.cur || {}, curCredit), leads[id]?.cur);
    if (live && !own && !credit[id]?.[w.to]) Object.assign(cur, PENDING);
    return { act_id: id, name: b.name, currency: b.currency, goals: goals[id], cur,
      prev: w.pf ? withLeads(metaMetrics(totals[id]?.prev || {}, prevCredit), leads[id]?.prev) : null,
      series: seriesOf(byDay[id], credit[id], w.from, w.to, model),
      prev_series: w.pf ? seriesOf(byDay[id], credit[id], w.pf, w.pt, model) : [] };
  });
}
