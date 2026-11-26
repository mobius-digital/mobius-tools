/* The Creative screen's rollups: fatigue by ad age, the 12 week launch cadence, and by format, angle and type. */
// from profit/worker/src/hub.js (creativeBrand: fatigue, weeks, roll)
import { roas, cpa, ctr, pct } from '../numbers/defs.js';
import { addDays, dayDiff } from '../platform/time.js';
import { num } from './base.js';

const BUCKETS = [[0, 3, 'Days 0-3'], [4, 7, 'Days 4-7'], [8, 14, 'Week 2'], [15, 21, 'Week 3'], [22, 30, 'Week 4'], [31, 60, 'Month 2'], [61, 9999, 'Older']];
const WEEKS = 12;

/** Cost per purchase by days since an ad first spent, over every ad day in the window. Lead ads stay out:
 *  they buy leads, not sales. `orderAt` = credited orders per 'ad|day', or null for Meta's own count. */
export function fatigueOf(rows, adDays, orderAt) {
  const firstOf = Object.fromEntries(rows.map(r => [r.id, r.first_spend]));
  const leadAd = new Set(rows.filter(r => r.obj === 'leads').map(r => r.id));
  const fat = BUCKETS.map(([lo, hi, label]) => ({ label, lo, hi, spend: 0, orders: 0, impr: 0, clicks: 0, ads: new Set() }));
  for (const r of adDays) {
    const first = firstOf[r.ad_id];
    if (!first || leadAd.has(r.ad_id)) continue;
    const age = dayDiff(first, r.date);
    const b = fat.find(x => age >= x.lo && age <= x.hi);
    if (!b) continue;
    b.spend += num(r.spend);
    b.orders += orderAt ? num(orderAt[`${r.ad_id}|${r.date}`]) : num(r.purchases);
    b.impr += num(r.impressions); b.clicks += num(r.link_clicks); b.ads.add(r.ad_id);
  }
  return fat.map(b => ({ label: b.label, spend: b.spend, orders: b.orders, cpa: cpa(b.spend, b.orders), ctr: ctr(b.clicks, b.impr), ads: b.ads.size }));
}

/** 12 weeks ending on `to`: new ads per week and the share of spend on ads under 14 days old.
 *  `firsts` = ad id -> the day it first spent. `spendDays` = every ad day with spend in those weeks. */
export function weeksOf(to, firsts, spendDays) {
  const start = addDays(to, -(WEEKS * 7 - 1));
  const weeks = Array.from({ length: WEEKS }, (_, i) => ({ week: addDays(start, i * 7), launched: 0, spend: 0, fresh: 0 }));
  const indexOf = day => Math.min(WEEKS - 1, Math.floor(dayDiff(start, day) / 7));
  for (const first of Object.values(firsts)) if (first && first >= start && first <= to) weeks[indexOf(first)].launched++;
  for (const r of spendDays) {
    const i = indexOf(r.date);
    if (i < 0) continue;
    weeks[i].spend += num(r.spend);
    const first = firsts[r.ad_id];
    if (first && dayDiff(first, r.date) < 14) weeks[i].fresh += num(r.spend);
  }
  return weeks.map(x => ({ ...x, fresh_share: pct(x.fresh, x.spend) }));
}

/** The 12 week window's first day, for the statement that reads its ad days. */
export const weeksStart = to => addDays(to, -(WEEKS * 7 - 1));

/** Ads added up by one of their keys (format, angle, media_type). Lead ads stay out. */
export function rollBy(rows, key) {
  const by = {};
  for (const r of rows) {
    if (r.obj === 'leads') continue;
    const k = r[key] || 'Untagged';
    const b = by[k] ||= { key: k, ads: 0, spend: 0, revenue: 0, purchases: 0, impr: 0, clicks: 0, v3: 0 };
    b.ads++; b.spend += r.spend; b.revenue += r.revenue; b.purchases += r.purchases; b.impr += r.impressions; b.clicks += r.clicks;
    b.v3 += (r.hook || 0) * r.impressions;
  }
  return Object.values(by).map(b => ({ ...b, roas: roas(b.revenue, b.spend), cpa: cpa(b.spend, b.purchases), ctr: ctr(b.clicks, b.impr),
    hook: b.v3 ? pct(b.v3, b.impr) : null })).sort((x, y) => y.spend - x.spend);
}
