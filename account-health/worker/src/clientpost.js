/* THE CLIENT POSTS (2026-10-19, the reporting audit, phase 1: docs/locus-reporting-audit.html).
 *
 * Everything a client channel receives is ONE post a day from Cole's own token, in one of two shapes. The text is
 * built here from stored numbers only, so the same data always draws the same lines and a test can read them.
 *
 *   The daily (sendBrief, worker.js), six lines at most, never more:
 *     *Dartee Golf · Saturday, Oct 17*
 *     Sales *$719* · Ads *$489* · *1.47x*   under plan
 *     Quiet Saturday: no repeat buyers at all, so the day only just paid for itself.   (the brief's headline)
 *     October: $19.6K of $30.6K planned, 17 days in.
 *     *Next:* Ahsan steps Meta back up Monday if the cost per new customer holds.      (only when a person wrote one)
 *   The full brief goes as the thread reply. One day per post; a missed day gets its own post, or nothing.
 *
 *   The weekly and the monthly (sendReport):
 *     *Grunk Dolfer · week of Oct 12*
 *     Sales *$5,890* ▼15% · Ads *$3,105* flat · *1.90x* (was 2.22x) · Profit *$1,784* ▼32%
 *     A slower week: same spend, fewer sales, mostly from the Burgundy drop cooling off.
 *     *This week*  bullets = the Monday call's confirmed lines + the calendar's confirmed dates in 14 days
 *     *From you:*  what the call asked for + the calendar's asks + open Requests
 *     <link|Open the report>
 *
 * Rules: one comparison per number (vs the prior period; plan lives on the page), one verdict word on the daily
 * (on plan / under plan / best day this month) instead of bracketed percentages, no "Hey Team" opener, no em dashes,
 * nothing the model invented in Next or This week. */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const noDash = s => String(s ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim();
const at = ymd => new Date(`${ymd}T12:00:00Z`);

/** "Saturday, Oct 17" */
export const dayLabel = ymd => `${DAYS[at(ymd).getUTCDay()]}, ${MONTHS[at(ymd).getUTCMonth()].slice(0, 3)} ${+ymd.slice(8, 10)}`;
/** "Oct 12" */
export const monDay = ymd => `${MONTHS[at(ymd).getUTCMonth()].slice(0, 3)} ${+ymd.slice(8, 10)}`;
/** Whole units, "$5,890"; null = " - ". */
export const money = (n, cur = 'USD') => n == null || !isFinite(n) ? ' - ' : new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(n);
/** Thousands shortened for the month line: "$19.6K"; under $10,000 stays whole. */
export const shortMoney = (n, cur = 'USD') => {
  if (n == null || !isFinite(n)) return ' - ';
  if (Math.abs(n) < 10000) return money(n, cur);
  const sym = money(0, cur).replace(/[\d.,\s]/g, '') || '$';
  return `${n < 0 ? '-' : ''}${sym}${(Math.abs(n) / 1000).toFixed(1).replace(/\.0$/, '')}K`;
};
const x = n => n == null || !isFinite(n) ? null : `${n.toFixed(2)}x`;

/** ▲15% / ▼15% / flat (under 2% either way) / '' when there is nothing to compare against. */
export function pctChange(now, before) {
  if (now == null || before == null || !(before > 0)) return '';
  const p = Math.round((now / before - 1) * 100);
  if (Math.abs(p) < 2) return 'flat';
  return `${p > 0 ? '▲' : '▼'}${Math.abs(p)}%`;
}

/** The brief's headline out of its stored text: the first bold line after the opener. Null when it has none (v1). */
export function headlineOf(text) {
  /* Only the opener paragraph (before the first blank line): a v1 brief's bold "*October 17*" day label comes after it. */
  for (const raw of String(text || '').split('\n')) {
    const l = raw.trim();
    if (!l) return null;
    if (/^hey team/i.test(l)) continue;
    const m = l.match(/^\*(.+)\*$/);
    return m ? noDash(m[1]).replace(/\.$/, '') : null;
  }
  return null;
}

/** One word on the day. Best day beats the plan read; no plan and not the best = no word. */
export function dailyVerdict({ sales, plan, others = [] }) {
  if (sales == null) return null;
  const rest = others.filter(v => v != null);
  if (rest.length >= 2 && sales > 0 && sales >= Math.max(...rest)) return 'best day this month';
  if (plan == null || !(plan > 0)) return null;
  return sales >= plan ? 'on plan' : 'under plan';
}

/** The client daily (2026-10-19, second pass after Cole: "structured, bulleted, clear on what everything is").
 *  `day` = {sales, spend, mer, amer, plan}; `month` = {ym, sales, plan, spend, day_of_month, days_in_month};
 *  `others` = the month's other finished days' sales (for "best day"). Returns the Slack text:
 *    *Dartee Golf · Thursday, Oct 15*
 *    _Strongest day of the week, with Meta returning 3.24 per dollar_
 *
 *    *Yesterday*
 *    • Sales: *$1,458* (plan $1,800, under plan)
 *    • Ad spend: *$519*
 *    • MER: *2.81x*
 *    • aMER (new customers): *1.95x*
 *
 *    *October so far* (15 of 31 days)
 *    • Sales: *$17.8K* of $27K planned
 *    • Ad spend: *$8.1K*
 *    • MER: *2.20x*
 *
 *    *Next:* ...   (only when a person wrote one)
 *    _Full update in the thread._ */
export function dailyPost({ brand, date, currency = 'USD', headline = null, day = {}, month = {}, others = [], next = null }) {
  const L = [`*${noDash(brand)} \u00b7 ${dayLabel(date)}*`];
  if (headline) L.push(`_${noDash(headline)}_`);
  const verdict = dailyVerdict({ sales: day.sales, plan: day.plan, others });
  const plan = day.plan > 0 ? `plan ${money(day.plan, currency)}` : '';
  const note = [plan, verdict].filter(Boolean).join(', ');
  L.push('', '*Yesterday*', `\u2022 Sales: *${money(day.sales, currency)}*${note ? ` (${note})` : ''}`, `\u2022 Ad spend: *${money(day.spend, currency)}*`);
  if (x(day.mer)) L.push(`\u2022 MER: *${x(day.mer)}*`);
  if (x(day.amer)) L.push(`\u2022 aMER (new customers): *${x(day.amer)}*`);
  if (month.sales != null) {
    const mName = month.ym ? MONTHS[+String(month.ym).slice(5, 7) - 1] : MONTHS[at(date).getUTCMonth()];
    const dom = month.day_of_month || +date.slice(8, 10);
    L.push('', `*${mName} so far* (${dom}${month.days_in_month ? ` of ${month.days_in_month}` : ''} days)`,
      `\u2022 Sales: *${shortMoney(month.sales, currency)}*${month.plan > 0 ? ` of ${shortMoney(month.plan, currency)} planned` : ''}`);
    if (month.spend != null) L.push(`\u2022 Ad spend: *${shortMoney(month.spend, currency)}*`);
    if (month.spend > 0) L.push(`\u2022 MER: *${x(month.sales / month.spend)}*`);
  }
  const n = noDash(next);
  if (n) L.push('', `*Next:* ${n.replace(/^next:\s*/i, '').slice(0, 240)}`);
  L.push('', '_Full update in the thread._');
  return L.join('\n');
}

/** The first sentence of the summary's "What it means" section (the report narrative), else null. */
export function sentenceOf(summary) {
  const s = String(summary || '');
  const t = s.match(/^[ \t]*\*?What it means\*?[ \t]*$/im);
  if (!t) return null;
  const after = s.slice(t.index + t[0].length).trim();
  const m = after.match(/^[\s\S]*?[.!?](?=\s|$)/);
  const out = noDash((m ? m[0] : after.split('\n')[0]).replace(/^[•\-\s]+/, ''));
  return out && out.length <= 260 ? out : null;
}

/** Plain words for a change: "up 7%", "down 15%", "flat"; '' when there is nothing to compare. */
export function changeWords(now, before) {
  const c = pctChange(now, before);
  return !c ? '' : c === 'flat' ? 'flat' : `${c[0] === '\u25B2' ? 'up' : 'down'} ${c.slice(1)}`;
}

/** The weekly or monthly client post: labelled bullets, one comparison each vs the period before.
 *    *Grunk Dolfer · Weekly report, Oct 12 to 18*
 *    _A slower week: same spend, fewer sales._
 *
 *    *The week* (compared with the week before)
 *    • Sales: *$5,890* (down 15%)
 *    • Ad spend: *$3,105* (flat)
 *    • MER: *1.90x* (was 2.22x)
 *    • aMER (new customers): *1.20x* (was 1.41x)
 *    • Profit: *$1,784* (was $2,620)
 *
 *    *This week*  • ...      *We need from you*  • ...
 *    <link|Open the full report> */
export function weeklyPost({ brand, period = 'weekly', start, end = null, currency = 'USD', totals = {}, previous = {}, sentence = null, this_week = [], from_you = [], url = null }) {
  const monthly = period === 'monthly';
  const endTxt = end ? (end.slice(5, 7) === start.slice(5, 7) ? String(+end.slice(8, 10)) : monDay(end)) : '';
  const span = monthly ? `${MONTHS[at(start).getUTCMonth()]} report` : `Weekly report, ${monDay(start)}${endTxt ? ` to ${endTxt}` : ''}`;
  const L = [`*${noDash(brand)} \u00b7 ${span}*`];
  if (sentence) L.push(`_${noDash(sentence)}_`);
  const t = totals || {}, p = previous || {};
  const pct = (a, b) => { const w = changeWords(a, b); return w ? ` (${w})` : ''; };
  const unit = monthly ? 'month' : 'week';
  L.push('', `*The ${unit}* (compared with the ${unit} before)`,
    `\u2022 Sales: *${money(t.sales, currency)}*${pct(t.sales, p.sales)}`,
    `\u2022 Ad spend: *${money(t.spend, currency)}*${pct(t.spend, p.spend)}`);
  if (x(t.mer)) L.push(`\u2022 MER: *${x(t.mer)}*${x(p.mer) ? ` (was ${x(p.mer)})` : ''}`);
  if (x(t.amer)) L.push(`\u2022 aMER (new customers): *${x(t.amer)}*${x(p.amer) ? ` (was ${x(p.amer)})` : ''}`);
  if (t.cm != null) L.push(`\u2022 Profit: *${money(t.cm, currency)}*${p.cm != null ? ` (was ${money(p.cm, currency)})` : ''}`);
  const clip = s => s.length <= 120 ? s : s.slice(0, 117).replace(/\s+\S*$/, '') + '...';
  const clean = list => [...new Set((Array.isArray(list) ? list : []).map(s => clip(noDash(s).replace(/^[\u2022\-\s]+/, ''))).filter(Boolean))];
  const tw = clean(this_week), fy = clean(from_you);
  if (tw.length) L.push('', `*This ${unit}*`, ...tw.slice(0, 5).map(s => `\u2022 ${s}`));
  if (fy.length) L.push('', '*We need from you*', ...fy.slice(0, 3).map(s => `\u2022 ${s}`));
  if (url) L.push('', `<${url}|Open the full report>`);
  return L.join('\n');
}

/** A brand with ONE channel (its internal channel is the client's) gets no internal post anywhere. */
export const oneChannel = a => !!(a && a.slack_channel && a.slack_channel === a.brief_channel);
/** The internal channel a team post may use: null for a one-channel brand or a brand with none. */
export const internalChannel = a => (a && a.slack_channel && !oneChannel(a)) ? a.slack_channel : null;
