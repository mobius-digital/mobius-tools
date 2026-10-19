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

/** The six-line daily. `day` = {sales, spend, mer, plan}; `month` = {ym, sales, goal, day_of_month};
 *  `others` = the month's other finished days' sales (for "best day"). Returns the Slack text. */
export function dailyPost({ brand, date, currency = 'USD', headline = null, day = {}, month = {}, others = [], next = null }) {
  const L = [`*${noDash(brand)} · ${dayLabel(date)}*`];
  const nums = [`Sales *${money(day.sales, currency)}*`, `Ads *${money(day.spend, currency)}*`];
  if (x(day.mer)) nums.push(`*${x(day.mer)}*`);
  const verdict = dailyVerdict({ sales: day.sales, plan: day.plan, others });
  L.push(`${nums.join(' · ')}${verdict ? `   ${verdict}` : ''}`);
  if (headline) L.push(noDash(headline));
  const mName = month.ym ? MONTHS[+String(month.ym).slice(5, 7) - 1] : MONTHS[at(date).getUTCMonth()];
  const dom = month.day_of_month || +date.slice(8, 10);
  const days = `${dom} day${dom === 1 ? '' : 's'} in`;
  if (month.sales != null) {
    L.push(month.goal > 0 ? `${mName}: ${shortMoney(month.sales, currency)} of ${shortMoney(month.goal, currency)} planned, ${days}.`
      : `${mName} so far: ${shortMoney(month.sales, currency)}, ${days}.`);
  }
  const n = noDash(next);
  if (n) L.push(`*Next:* ${n.replace(/^next:\s*/i, '').slice(0, 240)}`);
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

/** The weekly or monthly client post. */
export function weeklyPost({ brand, period = 'weekly', start, currency = 'USD', totals = {}, previous = {}, sentence = null, this_week = [], from_you = [], url = null }) {
  const monthly = period === 'monthly';
  const L = [`*${noDash(brand)} · ${monthly ? MONTHS[at(start).getUTCMonth()] : `week of ${monDay(start)}`}*`];
  const t = totals || {}, p = previous || {};
  const cmp = (a, b) => { const c = pctChange(a, b); return c ? ` ${c}` : ''; };
  const nums = [`Sales *${money(t.sales, currency)}*${cmp(t.sales, p.sales)}`, `Ads *${money(t.spend, currency)}*${cmp(t.spend, p.spend)}`];
  if (x(t.mer)) nums.push(`*${x(t.mer)}*${x(p.mer) ? ` (was ${x(p.mer)})` : ''}`);
  /* Profit swings by hundreds of percent off a small base ($355 to $1,907 is "+437%"), so past 100% it reads "(was $355)". */
  const big = t.cm != null && p.cm != null && Math.abs(t.cm / Math.abs(p.cm || 1) - 1) > 1;
  if (t.cm != null) nums.push(`Profit *${money(t.cm, currency)}*${big ? ` (was ${money(p.cm, currency)})` : cmp(t.cm, p.cm)}`);
  L.push(nums.join(' · '));
  if (sentence) L.push(noDash(sentence));
  const clean = list => [...new Set((Array.isArray(list) ? list : []).map(s => noDash(s).replace(/^[•\-\s]+/, '').slice(0, 220)).filter(Boolean))];
  const tw = clean(this_week), fy = clean(from_you);
  if (tw.length) L.push(`*${monthly ? 'This month' : 'This week'}*`, ...tw.slice(0, 6).map(s => `• ${s}`));
  if (fy.length === 1) L.push(`*From you:* ${fy[0]}`);
  else if (fy.length) L.push('*From you*', ...fy.slice(0, 5).map(s => `• ${s}`));
  if (url) L.push(`<${url}|Open the report>`);
  return L.join('\n');
}

/** A brand with ONE channel (its internal channel is the client's) gets no internal post anywhere. */
export const oneChannel = a => !!(a && a.slack_channel && a.slack_channel === a.brief_channel);
/** The internal channel a team post may use: null for a one-channel brand or a brand with none. */
export const internalChannel = a => (a && a.slack_channel && !oneChannel(a)) ? a.slack_channel : null;
