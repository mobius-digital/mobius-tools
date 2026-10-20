/* THE CLIENT POSTS (2026-10-19, the reporting audit, phase 1: docs/locus-reporting-audit.html; third pass the same night
 * after Cole's review: "it shouldn't sound like AI, it should sound like it's coming from the team").
 *
 * Everything a client channel receives is ONE post a day from Cole's own token, in one of two shapes. The text is built
 * here from stored numbers by fixed rules, so the same data always draws the same lines and a test can read them.
 * NO MODEL WRITES ANY LINE a client reads. The only words that are not numbers come from a person: the daily's Next
 * (the buyer's note) and the weekly's This week (typed on the Monday call) and We need from you (the call's asks).
 *
 *   The daily (sendBrief, worker.js), posted the morning after the day it covers:
 *     *Dartee Golf · Daily update*
 *     *Yesterday, Thursday Oct 15*
 *     • Sales: *$1,458* (plan $1,800, under plan)      one verdict: on plan / under plan / best day this month
 *     • Ad spend: *$519*
 *     • MER: *2.81x*
 *     • aMER (new customers): *1.95x*
 *     *October so far* (15 of 31 days)
 *     • Sales: *$17.8K* of $27K planned  • Ad spend  • MER
 *     *Next:* ...                                         only when a person wrote one
 *     _More numbers in the thread._
 *   The thread reply (dailyThread) is numbers only: orders, new vs returning, each ad channel that spent (Meta, Google)
 *   with the sales Triple Whale tracked to it, contribution margin when the cost data is trusted, and one line saying
 *   what those words mean. The old AI narrative (What we saw / What it means / What we're doing) is gone from the client.
 *   One day per post; a missed day gets its own post, or nothing.
 *
 *   The weekly and the monthly (sendReport), after the Monday call:
 *     *Grunk Dolfer · Weekly report, Oct 12 to 18*
 *     _Sales up 7% on 22% less ad spend, so each ad dollar brought back more._   (weekSentence: a rule, not a model)
 *     *The week* (compared with the week before)
 *     • Sales (up 7%)  • Ad spend (down 22%)  • MER (was 1.46x)  • aMER (was 1.09x)  • Contribution margin (was $355)
 *     _Contribution margin = sales minus product cost, shipping, fees and ad spend._
 *     *This week*        = the Monday call's lines + the calendar's confirmed dates in the next 7 days
 *     *We need from you* = the call's asks + the calendar's asks + open Requests, each with when it was asked and when it is needed
 *     <link|Open the full report>
 *
 * Rules: one comparison per number (vs the prior period; plan lives on the page), no "Hey Team" opener, no em dashes,
 * no channel named in the top post, nothing invented. */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const noDash = s => String(s ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim();
const at = ymd => new Date(`${ymd}T12:00:00Z`);

/** "Thursday Oct 15" */
export const dayLabel = ymd => `${DAYS[at(ymd).getUTCDay()]} ${MONTHS[at(ymd).getUTCMonth()].slice(0, 3)} ${+ymd.slice(8, 10)}`;
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
const whole = n => n == null || !isFinite(n) ? null : Math.round(n).toLocaleString('en-US');

/** ▲15% / ▼15% / flat (under 2% either way) / '' when there is nothing to compare against. */
export function pctChange(now, before) {
  if (now == null || before == null || !(before > 0)) return '';
  const p = Math.round((now / before - 1) * 100);
  if (Math.abs(p) < 2) return 'flat';
  return `${p > 0 ? '▲' : '▼'}${Math.abs(p)}%`;
}

/** One word on the day. Best day beats the plan read; no plan and not the best = no word. */
export function dailyVerdict({ sales, plan, others = [] }) {
  if (sales == null) return null;
  const rest = others.filter(v => v != null);
  if (rest.length >= 2 && sales > 0 && sales >= Math.max(...rest)) return 'best day this month';
  if (plan == null || !(plan > 0)) return null;
  return sales >= plan ? 'on plan' : 'under plan';
}

/** The client daily. `day` = {sales, spend, mer, amer, plan}; `month` = {ym, sales, plan, spend, day_of_month,
 *  days_in_month}; `others` = the month's other finished days' sales (for "best day"); `next` = the human line. */
export function dailyPost({ brand, date, currency = 'USD', day = {}, month = {}, others = [], next = null }) {
  const L = [`*${noDash(brand)} · Daily update*`];
  const verdict = dailyVerdict({ sales: day.sales, plan: day.plan, others });
  const plan = day.plan > 0 ? `plan ${money(day.plan, currency)}` : '';
  const note = [plan, verdict].filter(Boolean).join(', ');
  L.push(`*Yesterday, ${dayLabel(date)}*`, `• Sales: *${money(day.sales, currency)}*${note ? ` (${note})` : ''}`, `• Ad spend: *${money(day.spend, currency)}*`);
  if (x(day.mer)) L.push(`• MER: *${x(day.mer)}*`);
  if (x(day.amer)) L.push(`• aMER (new customers): *${x(day.amer)}*`);
  if (month.sales != null) {
    const mName = month.ym ? MONTHS[+String(month.ym).slice(5, 7) - 1] : MONTHS[at(date).getUTCMonth()];
    const dom = month.day_of_month || +date.slice(8, 10);
    L.push('', `*${mName} so far* (${dom}${month.days_in_month ? ` of ${month.days_in_month}` : ''} days)`,
      `• Sales: *${shortMoney(month.sales, currency)}*${month.plan > 0 ? ` of ${shortMoney(month.plan, currency)} planned` : ''}`);
    if (month.spend != null) L.push(`• Ad spend: *${shortMoney(month.spend, currency)}*`);
    if (month.spend > 0) L.push(`• MER: *${x(month.sales / month.spend)}*`);
  }
  const n = noDash(next);
  if (n) L.push('', `*Next:* ${n.replace(/^next:\s*/i, '').slice(0, 240)}`);
  L.push('', '_More numbers in the thread._');
  return L.join('\n');
}

export const CM_WORDS = 'Contribution margin = sales minus product cost, shipping, fees and ad spend.';

/** The thread reply under the daily: more numbers for the same day, nothing written by a model.
 *  `day` = {orders, new_orders, new_rev, ret_rev, cm, attr (true when Triple Whale attribution is synced for the day),
 *  channels: [{name, spend, roas, purchases}]}; `cm_ok` = the brand's cost data is trusted (judgeCogs).
 *  The channel rule: every ad channel that spent that day, biggest first, with the sales Triple Whale tracked to it;
 *  under two tracked orders the rate is withheld ("too few orders to rate yet"); no attribution synced = spend only. */
export function dailyThread({ date, currency = 'USD', day = {}, cm_ok = false }) {
  const L = [`*More on ${dayLabel(date)}*`];
  if (day.orders != null) L.push(`• Orders: *${whole(day.orders)}*${day.new_orders != null ? ` (${whole(day.new_orders)} from new customers)` : ''}${day.orders > 0 && day.sales != null ? `, average order ${money(day.sales / day.orders, currency)}` : ''}`);
  if (day.new_rev != null && day.ret_rev != null) L.push(`• Sales from new customers: *${money(day.new_rev, currency)}*, returning *${money(day.ret_rev, currency)}*`);
  const chans = (day.channels || []).filter(c => c && c.spend > 0).sort((a, b) => b.spend - a.spend);
  for (const c of chans) {
    let tail = '';
    if (day.attr === false) tail = '';
    else if (c.purchases != null && c.purchases < 2) tail = ', too few tracked orders to rate yet';
    else if (c.roas != null && isFinite(c.roas)) tail = `, *${money(c.roas * c.spend, currency)}* in sales tracked to it (${x(c.roas)})`;
    L.push(`• ${c.name}: *${money(c.spend, currency)}* spent${tail}`);
  }
  if (cm_ok && day.cm != null) L.push(`• Contribution margin: *${money(day.cm, currency)}*`);
  if (L.length === 1) return '';
  const notes = [];
  if (chans.length && day.attr !== false) notes.push('Sales tracked to a channel are Triple Whale’s count, so the channels can add up to more than the day.');
  if (cm_ok && day.cm != null) notes.push(CM_WORDS);
  if (notes.length) L.push('', `_${notes.join(' ')}_`);
  return L.join('\n');
}

/** Plain words for a change: "up 7%", "down 15%", "flat"; '' when there is nothing to compare. */
export function changeWords(now, before) {
  const c = pctChange(now, before);
  return !c ? '' : c === 'flat' ? 'flat' : `${c[0] === '▲' ? 'up' : 'down'} ${c.slice(1)}`;
}

/** The one sentence under the weekly title, from the numbers alone, the same way every week (no model):
 *  sales and ad spend against the period before, and what that did to each ad dollar. */
export function weekSentence(totals = {}, previous = {}, unit = 'week') {
  const t = totals || {}, p = previous || {};
  const s = changeWords(t.sales, p.sales), a = changeWords(t.spend, p.spend);
  if (!s && !a) return null;
  const merUp = t.mer != null && p.mer != null ? (t.mer > p.mer * 1.02 ? 'up' : t.mer < p.mer * 0.98 ? 'down' : 'flat') : null;
  /* "22% less ad spend" / "25% more ad spend" / "the same ad spend" */
  const A = a === 'flat' ? 'the same ad spend' : a.startsWith('down') ? `${a.slice(5)} less ad spend` : a.startsWith('up') ? `${a.slice(3)} more ad spend` : '';
  const on = A ? ` on ${A}` : '';
  if (s === 'flat' && a === 'flat') return `A steady ${unit}: sales and ad spend both about where they were.`;
  if (s.startsWith('up') && a.startsWith('down')) return `Sales ${s}${on}, so each ad dollar brought back more.`;
  if (s.startsWith('up') && a.startsWith('up')) return merUp === 'down' ? `Sales ${s}${on}, but each ad dollar brought back a little less.` : merUp === 'up' ? `Sales ${s}${on}, and it paid: each ad dollar brought back more.` : `Sales ${s}${on}, with each ad dollar bringing back about the same.`;
  if (s.startsWith('up')) return `Sales ${s}${on}.`;
  if (s.startsWith('down') && a.startsWith('down')) return `A quieter ${unit}: sales ${s}${on}${merUp === 'up' ? ', though each ad dollar brought back more' : ''}.`;
  if (s.startsWith('down') && a.startsWith('up')) return `Sales ${s}${on}, so each ad dollar brought back less.`;
  if (s.startsWith('down')) return `A quieter ${unit}: sales ${s}${on}.`;
  if (a.startsWith('down')) return `Sales held${on}, so each ad dollar brought back more.`;
  if (a.startsWith('up')) return `Sales held${on}, so each ad dollar brought back less.`;
  return null;
}

/** An ask line with its context: "Photos for Splatter (asked Oct 13, needed by Oct 22)". Strings pass through. */
function askLine(a) {
  if (typeof a === 'string') return a;
  const bits = [];
  if (a.asked) bits.push(`asked ${monDay(a.asked)}`);
  if (a.due) bits.push(`needed by ${monDay(a.due)}`);
  return `${a.text || ''}${bits.length ? ` (${bits.join(', ')})` : ''}`;
}

/** The weekly or monthly client post: labelled bullets, one comparison each vs the period before. */
export function weeklyPost({ brand, period = 'weekly', start, end = null, currency = 'USD', totals = {}, previous = {}, sentence, this_week = [], from_you = [], url = null }) {
  const monthly = period === 'monthly';
  const endTxt = end ? (end.slice(5, 7) === start.slice(5, 7) ? String(+end.slice(8, 10)) : monDay(end)) : '';
  const span = monthly ? `${MONTHS[at(start).getUTCMonth()]} report` : `Weekly report, ${monDay(start)}${endTxt ? ` to ${endTxt}` : ''}`;
  const L = [`*${noDash(brand)} · ${span}*`];
  const unit = monthly ? 'month' : 'week';
  const line = sentence === undefined ? weekSentence(totals, previous, unit) : sentence;
  if (line) L.push(`_${noDash(line)}_`);
  const t = totals || {}, p = previous || {};
  const pct = (a, b) => { const w = changeWords(a, b); return w ? ` (${w})` : ''; };
  L.push('', `*The ${unit}* (compared with the ${unit} before)`,
    `• Sales: *${money(t.sales, currency)}*${pct(t.sales, p.sales)}`,
    `• Ad spend: *${money(t.spend, currency)}*${pct(t.spend, p.spend)}`);
  if (x(t.mer)) L.push(`• MER: *${x(t.mer)}*${x(p.mer) ? ` (was ${x(p.mer)})` : ''}`);
  if (x(t.amer)) L.push(`• aMER (new customers): *${x(t.amer)}*${x(p.amer) ? ` (was ${x(p.amer)})` : ''}`);
  if (t.cm != null) L.push(`• Contribution margin: *${money(t.cm, currency)}*${p.cm != null ? ` (was ${money(p.cm, currency)})` : ''}`, `_${CM_WORDS}_`);
  const clip = s => s.length <= 160 ? s : s.slice(0, 157).replace(/\s+\S*$/, '') + '...';
  const clean = list => [...new Set((Array.isArray(list) ? list : []).map(s => clip(noDash(askLine(s)).replace(/^[•\-\s]+/, ''))).filter(Boolean))];
  const tw = clean(this_week), fy = clean(from_you);
  if (tw.length) L.push('', `*This ${unit}*`, ...tw.slice(0, 5).map(s => `• ${s}`));
  if (fy.length) L.push('', '*We need from you*', ...fy.slice(0, 3).map(s => `• ${s}`));
  if (url) L.push('', `<${url}|Open the full report>`);
  return L.join('\n');
}

/** A brand with ONE channel (its internal channel is the client's) gets no internal post anywhere. */
export const oneChannel = a => !!(a && a.slack_channel && a.slack_channel === a.brief_channel);
/** The internal channel a team post may use: null for a one-channel brand or a brand with none. */
export const internalChannel = a => (a && a.slack_channel && !oneChannel(a)) ? a.slack_channel : null;
