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
 *     • Sales: *$1,458* (goal $1,800, under goal)      one verdict: on goal / under goal / best day this month
 *     • Ad spend: *$519*
 *     • MER: *2.81x*
 *     • aMER (new customers): *1.95x*
 *     *October so far* (15 of 31 days)
 *     • Sales: *$17.8K* of $27K goal  • Ad spend  • MER
 *     *Next:* ...                                         only when a person wrote one
 *     _More numbers in the thread._
 *   The thread reply (dailyThread) is numbers only: orders, new vs returning, each ad channel that spent (Meta, Google)
 *   with the sales Triple Whale tracked to it, contribution margin when the cost data is trusted, and one line saying
 *   what those words mean. The old AI narrative (What we saw / What it means / What we're doing) is gone from the client.
 *   One day per post; a missed day gets its own post, or nothing.
 *
 *   The weekly and the monthly (sendReport), after the Monday call (new order 2026-11-26, the client reports rebuild):
 *     *Sample Golf Co · Weekly report, Oct 12 to 18*
 *     *How we read it*   the read a PERSON approved in Locus (reportread.js); without one (a draft preview) the
 *                        rule sentence (weekSentence) stands in. sendReport refuses a report with no approved read.
 *     *The numbers* (compared with the week before)
 *     • Sales (up 7%)  • Ad spend (down 22%)  • MER (whole store) (was 1.46x)  • Amazon  • Contribution margin + net
 *       (only when the report's frozen in_posts switch says so)
 *     *By platform* (Triple Whale attributed)   • Meta: $X spent, 2.40x ROAS   (low signal: "too few orders to read")
 *     *This week*        = the Monday call's lines + the calendar's confirmed dates in the next 7 days
 *     *We need from you* = the call's asks + the calendar's asks + open Requests, each with when it was asked and when it is needed
 *     <link|Open the full report>
 *
 * Rules: one comparison per number (vs the prior period; the goal lives on the page), no "Hey Team" opener, no em dashes,
 * no channel named in the top post, nothing invented. */

import { houseMessage } from './house.js';

const MONTHS =['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
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

/** One word on the day. Best day beats the goal read; no goal and not the best = no word.
 *  CLIENT WORDING (2026-11-26, Cole): a client reads "goal", never "plan". The number is the month's sales goal the team
 *  typed on the Plan page (accounts.goals_json[month]), split evenly over the days of the month (briefData). It is a
 *  target, not a forecast: no model or day of week curve shapes it. A month with no goal typed inherits the last
 *  month's (or the default) in briefData; the client daily drops it (dailyPost goal_set false). Code keys stay plan. */
export function dailyVerdict({ sales, plan, others = [] }) {
  if (sales == null) return null;
  const rest = others.filter(v => v != null);
  if (rest.length >= 2 && sales > 0 && sales >= Math.max(...rest)) return 'best day this month';
  if (plan == null || !(plan > 0)) return null;
  return sales >= plan ? 'on goal' : 'under goal';
}

/** The client daily. `day` = {sales, spend, mer, amer, plan}; `month` = {ym, sales, plan, spend, day_of_month,
 *  days_in_month}; `others` = the month's other finished days' sales (for "best day"); `next` = the human line. */
/* NO GOAL TYPED, NO GOAL SHOWN (2026-11-26, Cole's team): a month with no goal typed for it must never reuse an earlier
   month's goal in front of a client. `goal_set: false` (briefData goals_planned false) drops the day's goal, the on or
   under goal word and the month's "of $X goal", and says "No goal set for <Month>" instead. Best day this month stays.
   Left out or true = every line exactly as before. */
export const noGoalLine = ym => `No goal set for ${MONTHS[+String(ym).slice(5, 7) - 1]}`;
export function dailyPost({ brand, date, currency = 'USD', day = {}, month = {}, others = [], next = null, amazon = null, goal_set = true }) {
  const L = [`*${noDash(brand)} · Daily update*`];
  if (goal_set === false) { day = { ...day, plan: null }; month = { ...month, plan: null }; }
  const verdict = dailyVerdict({ sales: day.sales, plan: day.plan, others });
  const plan = day.plan > 0 ? `goal ${money(day.plan, currency)}` : '';
  const note = [plan, verdict].filter(Boolean).join(', ');
  L.push(`*Yesterday, ${dayLabel(date)}*`, `• Sales: *${money(day.sales, currency)}*${note ? ` (${note})` : ''}`, `• Ad spend: *${money(day.spend, currency)}*`);
  if (x(day.mer)) L.push(`• MER: *${x(day.mer)}*`);
  if (x(day.amer)) L.push(`• aMER (new customers): *${x(day.amer)}*`);
  /* Amazon (2026-11-16, Floyd at Bonk): its sales are inside the sales line above; this says how much of it was Amazon. */
  if (amazon?.day) L.push(`• Amazon: *${money(amazon.day.sales, currency)}* (${amazon.day.orders} order${amazon.day.orders === 1 ? '' : 's'})`);
  if (month.sales != null) {
    const mName = month.ym ? MONTHS[+String(month.ym).slice(5, 7) - 1] : MONTHS[at(date).getUTCMonth()];
    const dom = month.day_of_month || +date.slice(8, 10);
    L.push('', `*${mName} so far* (${dom}${month.days_in_month ? ` of ${month.days_in_month}` : ''} days)`,
      `• Sales: *${shortMoney(month.sales, currency)}*${month.plan > 0 ? ` of ${shortMoney(month.plan, currency)} goal` : ''}`);
    if (month.spend != null) L.push(`• Ad spend: *${shortMoney(month.spend, currency)}*`);
    if (month.spend > 0) L.push(`• MER: *${x(month.sales / month.spend)}*`);
    if (amazon?.month?.orders > 0) L.push(`• Amazon: *${shortMoney(amazon.month.sales, currency)}* (${amazon.month.orders} orders)`);
  }
  if (goal_set === false) L.push(`• ${noGoalLine(month.ym || date.slice(0, 7))}`);
  const n = noDash(next);
  if (n) L.push('', `*Next:* ${n.replace(/^next:\s*/i, '').slice(0, 240)}`);
  L.push('', '_More numbers in the thread._');
  return L.join('\n');
}

export const CM_WORDS = 'Contribution margin = sales minus product cost, shipping, fees and ad spend.';
export const NET_WORDS = 'Net profit = contribution margin minus the fixed costs you entered, each spread evenly over the days it covers.';
export const NET_WORDS_AD = 'Net profit = contribution margin minus the fixed costs you entered, each spread evenly over the days it covers, and minus the extra ad costs: costs you marked as ad spend that no ad platform reports.';
/** The bullet lines under Contribution margin, so the sum is on the page: fixed costs, the extra ad costs when there
 *  are any (this contribution margin does not hold them), then net profit. cm minus the lines above net = net. */
const netLines = (x, currency, was = '') => [`• Fixed costs: *${money(x.fixed ?? 0, currency)}*`,
  ...(x.ad_expense > 0 ? [`• Extra ad costs: *${money(x.ad_expense, currency)}*`] : []), `• Net profit: *${money(x.net, currency)}*${was}`];

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
  if (cm_ok && day.cm != null && day.net != null) L.push(...netLines(day, currency));
  if (L.length === 1) return '';
  const notes = [];
  if (chans.length && day.attr !== false) notes.push('Sales tracked to a channel are Triple Whale’s count, so the channels can add up to more than the day.');
  if (cm_ok && day.cm != null) notes.push(CM_WORDS);
  if (cm_ok && day.cm != null && day.net != null) notes.push(day.ad_expense > 0 ? NET_WORDS_AD : NET_WORDS);
  if (notes.length) L.push('', `_${notes.join(' ')}_`);
  return L.join('\n');
}

/* ---------------------------------------------------------------------------------------------------------------- *
 * THE CLIENT DAILY IN THE HOUSE STYLE (2026-11-26, Cole approved the v2 look). Sent from the next morning's run on.
 *
 *   header   "<Brand> · Wed, Nov 25"                       the day the post covers
 *   summary  "Ahead of goal: $4,860 in sales against $4,200."  one plain sentence (dailyVerdictLine), then the
 *            person's Next line when it fits in the summary (else it gets its own line under the numbers)
 *   fields   *Yesterday*            *November so far*         the same rows in the same order in both columns:
 *            Sales / Goal / Ad spend / MER / aMER / Amazon    Goal only with a goal, Amazon only for an Amazon brand;
 *                                                             a row shows when either column has it ("-" for the other)
 *   context  "Triple Whale · 7:05am CT · aMER = new customer MER · ad spend by channel in the thread"
 *
 *   The thread (threadCard): header "Ad spend by channel", one field per channel that spent (biggest first) with
 *   Spend, ROAS and CPA (Triple Whale, last platform click; under two tracked orders the rates are withheld and the
 *   order count shows), New ROAS and New CPA (first orders, tw_orders) when that data exists, then Profit (contribution
 *   margin, and net profit when the brand puts it in posts) when the cost data is trusted.
 *
 * Every card returns { text, blocks, plain }: `text` is the Slack notification fallback (header plus summary, house
 * rule 9), `blocks` the message, and `plain` the same words as mrkdwn lines. `plain` is what the team reads on the
 * draft card and edits in the Edit the post box; an EDITED draft is sent as that person's text exactly as typed (a
 * plain text post, house rule 10), an unedited one as these blocks. No line here is written by a model. */

const DOW3 = ymd => DAYS[at(ymd).getUTCDay()].slice(0, 3);
/** "Wed, Nov 25" */
export const headerDay = ymd => `${DOW3(ymd)}, ${monDay(ymd)}`;
const nextDay = ymd => { const d = at(ymd); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const monthName = ym => MONTHS[+String(ym).slice(5, 7) - 1];
const has = v => v != null && isFinite(v);

/** The one sentence under the header. Best day beats the goal read; within 5% of the goal is on goal. */
export function dailyVerdictLine({ sales, plan, others = [], goal_set = true, ym, currency = 'USD' }) {
  const noGoal = goal_set === false ? `No goal set for ${monthName(ym)}` : '';
  if (!has(sales)) return noGoal ? `${noGoal}. No sales numbers for this day yet.` : 'No sales numbers for this day yet.';
  const rest = others.filter(has);
  const best = rest.length >= 2 && sales > 0 && sales >= Math.max(...rest);
  const goal = goal_set !== false && plan > 0 ? plan : null;
  const against = goal ? ` against ${money(goal, currency)}` : '';
  if (best) return `Best day this month: ${money(sales, currency)} in sales${against}.${noGoal ? ` ${noGoal}.` : ''}`;
  if (goal) {
    const word = sales >= goal * 1.05 ? 'Ahead of goal' : sales >= goal * 0.95 ? 'On goal' : 'Under goal';
    return `${word}: ${money(sales, currency)} in sales${against}.`;
  }
  return noGoal ? `${noGoal}: ${money(sales, currency)} in sales.` : `${money(sales, currency)} in sales.`;
}

/** Two columns of labeled rows that line up: a row is kept when either side has a value; the other side shows "-". */
function twoColumns(rows) {
  const keep = rows.filter(([, a, b]) => a != null || b != null);
  const col = i => keep.map(r => `${r[0]}: ${r[i] != null ? `*${r[i]}*` : '-'}`).join('\n');
  return keep.length ? [col(1), col(2)] : null;
}

/** The blocks as mrkdwn lines, in block order, no blank lines: the draft card and the edit box show this. */
export function cardText(m) {
  const all = [...(m?.blocks || []), ...((m?.attachments || []).flatMap(a => a.blocks || []))];
  const L = [];
  for (const b of all) {
    if (b.type === 'header') L.push(`*${b.text.text}*`);
    else if (b.type === 'section') { if (b.text?.text) L.push(b.text.text); for (const f of b.fields || []) L.push(f.text); }
    else if (b.type === 'context') L.push(`_${(b.elements || []).map(e => e.text).join(' ')}_`);
  }
  return L.join('\n');
}

/** An edited daily is the same as a built one when only the context line (its time) differs. */
export const sameDaily = (a, b) => {
  const norm = s => String(s ?? '').replace(/\r/g, '').split('\n').filter(l => !/^_(Triple Whale|Shopify)\b/.test(l.trim())).map(l => l.trim()).join('\n').trim();
  return a != null && b != null && norm(a) === norm(b);
};

/** The client daily as a house style card. Same inputs as dailyPost, plus `today` (the send day, "Yesterday" only when
 *  the post covers the day before it), `thread` (false = no thread reply, so the context line does not promise one),
 *  `at` / `now` (the context time; tests pass both). `month.new_rev` gives the month's aMER. */
export function dailyCard({ brand, date, currency = 'USD', day = {}, month = {}, others = [], next = null, amazon = null, goal_set = true, today = null, thread = true, at: when = null, now = null, store = null, store_label = null }) {
  const ym = month.ym || date.slice(0, 7);
  const goalOn = goal_set !== false && (day.plan > 0 || month.plan > 0);
  const mer = month.spend > 0 && has(month.sales) ? month.sales / month.spend : null;
  const amer = month.spend > 0 && has(month.new_rev) ? month.new_rev / month.spend : null;
  const rows = [
    ['Sales', has(day.sales) ? money(day.sales, currency) : null, has(month.sales) ? shortMoney(month.sales, currency) : null],
    ...(goalOn ? [['Goal', day.plan > 0 ? money(day.plan, currency) : null, month.plan > 0 ? shortMoney(month.plan, currency) : null]] : []),
    ['Ad spend', has(day.spend) ? money(day.spend, currency) : null, has(month.spend) ? shortMoney(month.spend, currency) : null],
    ['MER', x(day.mer), x(mer)],
    ['aMER', x(day.amer), x(amer)],
    ...(amazon ? [['Amazon', amazon.day ? money(amazon.day.sales, currency) : null, amazon.month ? shortMoney(amazon.month.sales, currency) : null]] : []),
  ];
  const cols = twoColumns(rows);
  const dayName = !today || today === nextDay(date) ? 'Yesterday' : DAYS[at(date).getUTCDay()];
  const verdict = dailyVerdictLine({ sales: day.sales, plan: day.plan, others, goal_set, ym, currency });
  const n = noDash(next).replace(/^next:\s*/i, '').slice(0, 240);
  const withNext = n ? `${verdict} Next: ${n}` : verdict;
  const nextFits = withNext.length <= 200;
  const showsAmer = !!cols && /^aMER:/m.test(cols[0]);
  const msg = houseMessage({
    title: `${noDash(brand)} · ${headerDay(date)}`,
    summary: nextFits ? withNext : verdict,
    numbers: cols ? [{ label: dayName, value: cols[0] }, { label: `${monthName(ym)} so far`, value: cols[1] }] : [],
    lines: n && !nextFits ? [`Next: ${n}`] : [],
    /* The store source (storesource.js), named and nothing more: a client never reads our sync status. */
    source: store === 'shopify' ? 'Shopify' : 'Triple Whale', at: when || now || new Date(), now: now || undefined,
    context: [showsAmer ? 'aMER = new customer MER' : '', thread ? 'ad spend by channel in the thread' : ''].filter(Boolean).join(' · '),
  });
  return { ...msg, plain: cardText(msg) };
}

/** The thread under the client daily, "Ad spend by channel". `channels` = [{name, spend, attr: {rev, orders} | null,
 *  nc: {rev, orders} | null}] (attr null = Triple Whale attribution not synced for the day: spend only; nc null = no
 *  first-order data); `profit` = {cm, net, fixed, ad_expense}, shown only with `cm_ok`. null when there is nothing. */
export function threadCard({ currency = 'USD', channels = [], cm_ok = false, profit = {}, at: when = null, now = null }) {
  const chans = (channels || []).filter(c => c && c.spend > 0).sort((a, b) => b.spend - a.spend);
  const cells = [];
  let anyAttr = false, anyCpa = false, anyNew = false;
  for (const c of chans) {
    const r = [`Spend: *${money(c.spend, currency)}*`];
    if (c.attr) {
      anyAttr = true;
      const ord = Math.round(c.attr.orders || 0);
      if (ord < 2) r.push(`Orders: *${ord}*`);
      else { r.push(`ROAS: *${x((c.attr.rev || 0) / c.spend)}*`, `CPA: *${money(c.spend / ord, currency)}*`); anyCpa = true; }
    }
    if (c.nc && Math.round(c.nc.orders || 0) >= 2) {
      anyNew = true;
      r.push(`New ROAS: *${x((c.nc.rev || 0) / c.spend)}*`, `New CPA: *${money(c.spend / Math.round(c.nc.orders), currency)}*`);
    }
    cells.push({ label: noDash(c.name), value: r.join('\n') });
  }
  const p = profit || {};
  const showCm = cm_ok && has(p.cm), showNet = showCm && has(p.net);
  if (showCm) {
    const r = [`Contribution margin: *${money(p.cm, currency)}*`];
    if (showNet) r.push(`Fixed costs: *${money(p.fixed ?? 0, currency)}*`, ...(p.ad_expense > 0 ? [`Extra ad costs: *${money(p.ad_expense, currency)}*`] : []), `Net profit: *${money(p.net, currency)}*`);
    cells.push({ label: 'Profit', value: r.join('\n') });
  }
  if (!cells.length) return null;
  const notes = [anyAttr ? 'Triple Whale, last platform click' : 'Triple Whale', anyCpa ? 'CPA = ad spend per order' : '', anyNew ? 'New = first orders from new customers' : '',
    showCm ? CM_WORDS : '', showNet ? (p.ad_expense > 0 ? NET_WORDS_AD : NET_WORDS) : ''].filter(Boolean);
  const msg = houseMessage({ title: 'Ad spend by channel', numbers: cells, maxNumbers: 10,
    source: notes[0], at: when || now || new Date(), now: now || undefined, context: notes.slice(1).join(' · ') });
  return { ...msg, plain: cardText(msg) };
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

/** The weekly or monthly client post: labeled bullets, one comparison each vs the period before. */
/* OUR WORK (2026-11-21, Cole: learn from Well Copy's weekly report, for an ADS agency): every weekly report shows the
   client the work, the way Well Copy shows "16 to 24 emails a month": new ads launched (Meta, by created time) and the
   changes we made that the client can read about (Ads > Updates rows with a client why), with the link to those. */
export function workLines(w) {
  if (!w || !(w.ads > 0 || w.changes > 0)) return [];
  const L = [];
  if (w.ads > 0) L.push(`• New ads launched: *${w.ads}*${w.ads_prev != null ? ` (${w.ads_prev} the week before)` : ''}`);
  if (w.changes > 0) L.push(`• Changes we made to your ads: *${w.changes}*${w.updates_url ? ` (<${w.updates_url}|see each one and why>)` : ''}`);
  return L;
}

/** One line per paid platform that spent, Triple Whale attributed (2026-11-26, client reports rebuild). `platforms` =
 *  [{name, spend, roas, low_signal}]; roas is null when it is not Triple Whale's (spend only). Biggest spend first. */
export function platformLines(platforms, currency = 'USD') {
  return (Array.isArray(platforms) ? platforms : []).filter(c => c && c.spend > 0).sort((a, b) => b.spend - a.spend).map(c => {
    const tail = c.low_signal ? ', too few orders to read' : x(c.roas) ? `, ${x(c.roas)} ROAS` : '';
    return `• ${noDash(c.name)}: ${money(c.spend, currency)} spent${tail}`;
  });
}

/* THE WEEKLY AND MONTHLY POST, NEW ORDER (2026-11-26, Cole: "CEOs want our read"): the title, *How we read it* (the
   person-approved read, line breaks kept), *The numbers* (Sales, Ad spend, MER of the whole store, Amazon, contribution
   margin and net only when the caller passes them), *By platform* (Triple Whale attributed), Our work, This week, We
   need from you, the link. The rule sentence (weekSentence) only stands in when there is no read (a draft preview). */
export function weeklyPost({ brand, period = 'weekly', start, end = null, currency = 'USD', totals = {}, previous = {}, read = null, sentence, platforms = [], this_week = [], from_you = [], url = null, amazon = null, work = null }) {
  const monthly = period === 'monthly';
  const endTxt = end ? (end.slice(5, 7) === start.slice(5, 7) ? String(+end.slice(8, 10)) : monDay(end)) : '';
  const span = monthly ? `${MONTHS[at(start).getUTCMonth()]} report` : `Weekly report, ${monDay(start)}${endTxt ? ` to ${endTxt}` : ''}`;
  const L = [`*${noDash(brand)} · ${span}*`];
  const unit = monthly ? 'month' : 'week';
  const readLines = String(read ?? '').replace(/\r/g, '').split('\n').map(l => l.trim() ? noDash(l) : '');
  while (readLines.length && !readLines[0]) readLines.shift();
  while (readLines.length && !readLines[readLines.length - 1]) readLines.pop();
  if (readLines.length) L.push('', '*How we read it*', ...readLines);
  else {
    const line = sentence === undefined ? weekSentence(totals, previous, unit) : sentence;
    if (line) L.push(`_${noDash(line)}_`);
  }
  const t = totals || {}, p = previous || {};
  const pct = (a, b) => { const w = changeWords(a, b); return w ? ` (${w})` : ''; };
  L.push('', `*The numbers* (compared with the ${unit} before)`,
    `• Sales: *${money(t.sales, currency)}*${pct(t.sales, p.sales)}`,
    `• Ad spend: *${money(t.spend, currency)}*${pct(t.spend, p.spend)}`);
  if (x(t.mer)) L.push(`• MER (whole store): *${x(t.mer)}*${x(p.mer) ? ` (was ${x(p.mer)})` : ''}`);
  if (amazon?.cur?.orders > 0) L.push(`• Amazon: *${money(amazon.cur.sales, currency)}* (${amazon.cur.orders} orders${amazon.prev?.orders > 0 ? `, was ${money(amazon.prev.sales, currency)}` : ''})`);
  if (t.cm != null) L.push(`• Contribution margin: *${money(t.cm, currency)}*${p.cm != null ? ` (was ${money(p.cm, currency)})` : ''}`, `_${CM_WORDS}_`);
  if (t.cm != null && t.net != null) L.push(...netLines(t, currency, p.net != null ? ` (was ${money(p.net, currency)})` : ''), `_${t.ad_expense > 0 ? NET_WORDS_AD : NET_WORDS}_`);
  const pl = platformLines(platforms, currency);
  if (pl.length) L.push('', '*By platform* (Triple Whale attributed)', ...pl);
  const clip = s => s.length <= 160 ? s : s.slice(0, 157).replace(/\s+\S*$/, '') + '...';
  const clean = list => [...new Set((Array.isArray(list) ? list : []).map(s => clip(noDash(askLine(s)).replace(/^[•\-\s]+/, ''))).filter(Boolean))];
  const wl = workLines(work);
  if (wl.length) L.push('', `*Our work this ${unit}*`, ...wl);
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
