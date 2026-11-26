/* What a report's frozen numbers say, as plain data. Pure: no DOM, no network.
   Shared by the client's report page (v5/report.html) and the brand Reports page, so both read the
   platforms, the best ads and the margin line the same way.

   Attribution rule: every sales or ROAS figure for a platform or an ad is Triple Whale's (last platform
   click). Spend stays the platform's own. A platform figure that did not come from Triple Whale is never shown. */

export const ATTR_MODEL = 'lastPlatformClick';
/** The paid platforms, in the order the page lists them. Email and Amazon are not ad platforms. */
export const PAID = ['meta', 'google', 'tiktok', 'pinterest'];
const NAME = { meta: 'Meta', google: 'Google', tiktok: 'TikTok', pinterest: 'Pinterest' };

/** One row per paid platform that spent in the period:
    { id, label, spend, sales, roas, low, waiting, note }
    low: too few orders to read a ROAS. waiting: no Triple Whale sales to show, note says why (not credited yet, or
    a platform Triple Whale does not credit, like TikTok and Pinterest: spend only, as in the Slack post). */
export function platformRows(data) {
  const out = [];
  for (const c of (data && data.channels) || []) {
    if (!PAID.includes(c.id) || !c.cur || !(c.cur.spend > 0)) continue;
    const cur = c.cur;
    /* Only Meta and Google are re-credited by Triple Whale (source 'Triple Whale'). An older report that kept the
       platform's own figure ('Meta-reported', 'Google-reported') and TikTok / Pinterest (platform figures, no source)
       show spend only, so no platform's own claim is ever labeled Triple Whale. */
    const tw = cur.source === 'Triple Whale';
    const waiting = !!cur.awaiting_attr || !tw;
    const note = cur.awaiting_attr || c.id === 'meta' || c.id === 'google' ? 'not credited yet' : 'spend only';
    const sales = waiting ? null : (cur.revenue != null ? cur.revenue : (cur.roas != null ? cur.roas * cur.spend : null));
    out.push({
      id: c.id, label: c.label || NAME[c.id] || c.id, spend: cur.spend,
      sales, roas: waiting ? null : (cur.roas != null ? cur.roas : (sales != null ? sales / cur.spend : null)),
      low: !waiting && !!cur.low_signal, waiting, note: waiting ? note : null,
    });
  }
  return out.sort((a, b) => PAID.indexOf(a.id) - PAID.indexOf(b.id));
}

/** Amazon's line when the report carries one: { sales, orders } or null. */
export function amazonOf(data) {
  const c = ((data && data.channels) || []).find(x => x.id === 'amazon');
  return c && c.cur && (c.cur.sales > 0 || c.cur.orders > 0) ? { sales: c.cur.sales, orders: c.cur.orders } : null;
}

/** A plain name for an ad: its headline when Meta has one, else its name with the code segments dropped. */
export function adName(a) {
  const head = String((a && a.headline) || '').trim();
  if (head) return head.length > 70 ? head.slice(0, 68) + '...' : head;
  const parts = String((a && a.name) || '').split(/\s*[|/]\s*/).map(s => s.trim()).filter(s => s && !/^[A-Z0-9-]{2,}$/.test(s) && !/^\d/.test(s));
  const best = parts.sort((x, y) => y.length - x.length)[0] || 'An ad';
  return best.length > 70 ? best.slice(0, 68) + '...' : best;
}
/** Only pictures the page may draw: a baked data URI or an https address. */
export const safeThumb = t => typeof t === 'string' && /^(data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,]|https:\/\/)/i.test(t) ? t : null;

/** Up to n best ads: from the ads that carried real money, ranked on Triple Whale ROAS when the report has
    Triple Whale's ad credit, else on spend. Each: { id, platform, name, spend, revenue, purchases, cpa, roas, thumb, video }
    (platform: the ad's own, else 'meta': the report's ad list is Meta's) (roas, revenue null = not read; purchases and
    cpa only when the credit carries an order count, and then cpa is always spend / purchases). */
export function bestAds(data, n = 3) {
  const top = (data && data.ads && data.ads.top) || [];
  if (!top.length) return [];
  const tw = data.attr && data.attr.ads && data.attr.ads[ATTR_MODEL];
  const rows = top.map(a => {
    const credit = tw ? (tw[a.ad_id] || { revenue: 0 }) : null;   /* no row under the model is a real zero */
    const revenue = credit ? credit.revenue || 0 : null;
    const n = credit ? credit.orders ?? credit.purchases ?? null : null, purchases = n != null && isFinite(n) ? +n : null;
    return { id: a.ad_id, platform: a.platform || 'meta', name: adName(a), spend: a.spend, revenue, purchases,
      cpa: purchases > 0 && a.spend > 0 ? a.spend / purchases : null,
      roas: credit && a.spend > 0 ? revenue / a.spend : null, thumb: safeThumb(a.thumb), video: !!a.video };
  });
  if (tw) rows.sort((a, b) => (b.roas || 0) - (a.roas || 0) || b.spend - a.spend);
  return rows.slice(0, n);
}

/** Contribution margin, only when the report froze it for the client (the in_posts rule) and the costs are trusted. */
export function marginOf(data) {
  const t = (data && data.totals) || {};
  return data && data.fixed && data.fixed.in_posts && data.cm_ok && t.cm != null ? { cur: t.cm, prev: data.previous ? data.previous.cm : null } : null;
}

/** "this week" / "this month" lists, cleaned. */
export const linesOf = v => (Array.isArray(v) ? v : []).map(s => String(s == null ? '' : s).trim()).filter(Boolean);

/** Change against the period before as a fraction, or null. */
export const change = (a, b) => a != null && b > 0 ? a / b - 1 : null;

/* No goal typed, no goal shown (2026-11-26). The months in a report with no goal of their own, sorted: the worker's
   `no_goal` list (report-view), else forecast.months[ym].planned === false and pacing.planned === false (GET /api/report).
   A month listed here never shows a goal, a forecast or pacing; the page says "No goal set for <Month>" instead. */
export function noGoalOf(data) {
  if (!data) return [];
  const out = new Set(Array.isArray(data.no_goal) ? data.no_goal.filter(m => /^\d{4}-\d{2}$/.test(m)) : []);
  const months = data.forecast && data.forecast.months;
  if (months && typeof months === 'object') for (const [ym, m] of Object.entries(months)) if (m && m.planned === false) out.add(ym);
  if (data.pacing && data.pacing.planned === false && data.pacing.month) out.add(data.pacing.month);
  return [...out].sort();
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "No goal set for December", or "No goal set for November and December". Null when every month had one. */
export function noGoalLine(list) {
  const names = (list || []).map(ym => MONTHS[+ym.slice(5, 7) - 1]).filter(Boolean);
  if (!names.length) return null;
  return 'No goal set for ' + (names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]);
}
