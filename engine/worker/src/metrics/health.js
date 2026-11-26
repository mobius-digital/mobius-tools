/* The cost check: can a brand's cost data be trusted? Real cost data is steady day to day. Costs that are
   only partly filled in make the daily margin swing or go negative, and a wrong profit figure is worse
   than none, so it is graded and the screens hold profit back when it fails. */
// from profit/worker/src/worker.js (judgeCosts, retailMargin, the inline verdict in /api/overview, refreshIfStale)
import { pct, sum as sumKey } from '../numbers/defs.js';

/** The store's real margin when some days carry cost with no matching revenue (a wholesale order paid
 *  outside the store, a stock delivery booked as one day's cost). Such days only ever add cost, so the low
 *  end of the daily cost ratios is the clean signal. */
export function retailMargin(rows) {
  const days = rows.filter(r => r.sales > 0 && r.cogs != null)
    .map(r => ({ date: r.date, sales: r.sales, cogs: r.cogs, ratio: pct(r.cogs, r.sales) }));
  if (days.length < 10) return null;
  const ratios = days.map(d => d.ratio).sort((a, b) => a - b);
  const base = ratios[Math.floor((ratios.length - 1) * 0.25)];
  // A day is clean while its cost ratio stays near that base.
  const cutoff = Math.max(base * 1.5, base + 0.1);
  const clean = days.filter(d => d.ratio <= cutoff);
  const flagged = days.filter(d => d.ratio > cutoff).sort((a, b) => b.cogs - a.cogs);
  if (!clean.length) return null;
  const cleanSales = clean.reduce((a, d) => a + d.sales, 0);
  const cleanCogs = clean.reduce((a, d) => a + d.cogs, 0);
  const margin = cleanSales > 0 ? 1 - pct(cleanCogs, cleanSales) : null;
  const excessCost = flagged.reduce((a, d) => a + (d.cogs - d.sales * base), 0);
  return {
    margin, clean_days: clean.length, flagged_days: flagged.length, total_days: days.length,
    cutoff, base,
    unexplained_cost: excessCost,
    top_flagged: flagged.slice(0, 5).map(d => ({ date: d.date, sales: d.sales, cogs: d.cogs, ratio: d.ratio })),
  };
}

/* The words for a failed or noisy check. */
function verdictOf(n, negatives, costWord, blended, p10, p90) {
  const spread = p90 - p10;
  const r = x => Math.round(x * 100);
  // Only a pattern of bad days (more than a tenth of the window) means the cost data cannot be trusted.
  const heavy = negatives > Math.max(1, n * 0.1);
  if (heavy || (blended != null && blended <= 0.15) || spread > 0.6) {
    return { verdict: 'broken', reason: heavy
      ? `${negatives} of ${n} days record more ${costWord} than the store took in, typically wholesale orders paid outside Shopify, or an inventory delivery booked as one day's cost`
      : blended != null && blended <= 0.15
        ? `trailing margin of ${r(blended)}% is implausibly thin for this kind of product`
        : `daily margin swings ${r(p10)}% to ${r(p90)}%, which no real product mix does` };
  }
  if (negatives > 0) {
    return { verdict: 'noisy', reason: `${negatives} of ${n} days record more ${costWord} than the store took in, almost always a wholesale order paid outside Shopify or an inventory delivery booked to one day. The other ${n - negatives} days are consistent, so the profit figures still stand` };
  }
  if (spread > 0.4) return { verdict: 'noisy', reason: `daily margin ranges ${r(p10)}% to ${r(p90)}%, likely a few products missing COGS` };
  return null;
}

/** Grade the cost data behind a list of day rows. */
export function judgeCosts(rows) {
  const margins = rows.filter(r => r.margin != null && r.sales > 0).map(r => r.margin);
  const n = margins.length;
  if (!n) return { verdict: 'none', reason: 'no cost data in Triple Whale', days: 0 };
  const sorted = margins.slice().sort((a, b) => a - b);
  const p10 = sorted[Math.floor(n * 0.1)], p90 = sorted[Math.floor(n * 0.9)];
  // A day only counts as negative past minus 5 percent. Anything shallower is ordinary product mix.
  const negatives = margins.filter(m => m < -0.05).length;
  // Say "product cost" only when product cost alone beat revenue.
  const cogsOver = rows.filter(r => r.sales > 0 && r.cogs != null && r.cogs > r.sales).length;
  const costWord = cogsOver >= Math.max(1, negatives * 0.5) ? 'product cost' : 'variable cost';
  const gp = sumKey(rows, 'gross_profit'), sales = sumKey(rows, 'sales');
  const blended = sales > 0 && gp != null ? pct(gp, sales) : null;
  const out = { verdict: 'good', days: n, blended, p10, p90, spread: p90 - p10, negatives, cogs_over: cogsOver };
  out.retail = retailMargin(rows);
  const bad = verdictOf(n, negatives, costWord, blended, p10, p90);
  if (bad) { out.verdict = bad.verdict; out.reason = bad.reason; }
  return out;
}

/** The verdict shown for a brand with no stored check yet. */
export function inlineHealth(rows, marginPct) {
  return marginPct != null
    ? { verdict: 'override', reason: `using a flat ${Math.round(marginPct * 100)}% margin override`, blended: marginPct }
    : judgeCosts(rows);
}

/** Is the stored check old? The old engine refreshes it in the background when an overview is read, so a
 *  stale check is the sign to send that one request there. Judged on the caller's own active brands:
 *  one with no stored check, or one checked more than `maxAgeHours` ago. */
export function checkIsStale(accounts, byAct, now, maxAgeHours = 12) {
  for (const a of accounts) {
    const row = byAct[a.act_id];
    if (!row || !row.checked_at) return true;
    const at = new Date(`${String(row.checked_at).replace(' ', 'T')}Z`).getTime();
    if (!(now - at <= maxAgeHours * 3600e3)) return true;
  }
  return false;
}
