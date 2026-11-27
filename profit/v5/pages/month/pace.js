/* Business > This month > Pace: is the month on course for its sales goal?
   Four figures against the plan, one sentence, the running total of sales against the plan line with
   where it is heading, what each day left needs, and where the ad budget went.

   The page is about the month in progress, so it has no date range of its own.
   Where the live numbers come from (all read only, profit worker):
     /api/client?act&from=<1st>&to=<yesterday>   the store by day, totals, the month's goals
     /api/forecast?act                           where the month lands (spending the budget, and at today's pace)
     /api/overview?days=7&cmp=none&series=0      the cost check (the goal ROAS comes from the brand's own goal, _m.js brandGoals)
     /api/season?act                             dated phases, for the notes on the chart and the day cells
     /api/plan?act&month=YYYY-MM                 planned: false = nobody typed a goal for this month. /api/client then
                                                 hands back an earlier month's goal, which is never shown as this month's:
                                                 no goal, no plan line, no budget forecast, one "No goal set for <Month>" line.
   Only the first is needed; any other that fails leaves its part out. The plan splits evenly across the days. */

import { put } from '../../kit.js';
import { askWhy, helpBar, dl } from '../home/_biz.js';
import { h, money, pct, x, card, em, takeaway, button, statusDot, pill, gauge, legend, lineChart, table, platformChip, empty, sourceLine } from '../../kit.js';
import { ok, asDate, iso, addDays, dayLabel, weekday, monthName, daysIn, span, b, soft, brandFacts, brandGoals, hasSource, pickBrand, noSource, styles, tileRow, tipRows, chartCap, pageStamp, isPhone, TW } from './_m.js';

/** The one line a month with no goal of its own shows (same words as the client daily and the reports). */
const noGoalLine = ym => 'No goal set for ' + monthName(ym);

/* ---------- live data ---------- */
async function load(ctx) {
  if (!ctx.brand) return null;
  const id = encodeURIComponent(ctx.brand.id), sig = { signal: ctx.signal };
  const now = new Date(), today = iso(now), ym = today.slice(0, 7), from = ym + '-01';
  const to = now.getDate() > 1 ? addDays(today, -1) : today;
  const [cl, fc, ov, season, goals, mp] = await Promise.all([
    ctx.api(`/api/client?act=${id}&from=${from}&to=${to}`, sig),
    soft(ctx.api(`/api/forecast?act=${id}`, sig)),
    soft(ctx.api('/api/overview?days=7&cmp=none&series=0', sig)),
    soft(ctx.api(`/api/season?act=${id}`, sig)),
    brandGoals(ctx),
    soft(ctx.api(`/api/plan?act=${id}&month=${ym}`, sig)),
  ]);
  const unset = !!mp && mp.planned === false;      /* no answer (a client, an old server): as before */
  const rows = (cl.rows || []).filter(r => r.date >= from && r.date <= to && r.date < today);
  const facts = brandFacts(ov, cl, goals), t = cl.totals || {}, g = unset ? {} : cl.goals || {};
  const phases = (((season && season.accounts) || [])[0] || {}).phases || [];
  const end = ym + '-' + String(daysIn(ym)).padStart(2, '0');
  const notes = [];
  for (const ph of phases) {
    if (ph.status === 'skip') continue;
    if (ph.start && ph.start >= from && ph.start <= end) notes.push({ date: ph.start, text: ph.name });
    else if (ph.end && ph.end >= from && ph.end < to) notes.push({ date: ph.end, text: `${ph.name} ended` });
  }
  const planMer = ok(g.sales) && g.spend > 0 ? g.sales / g.spend : null;
  return {
    month: ym, today, days_in_month: daysIn(ym), source: hasSource(cl),
    days: rows.map(r => ({ date: r.date, sales: r.sales ?? null, spend: r.spend ?? null, profit: ok(r.cm) ? r.cm : null })),
    totals: { sales: t.sales ?? null, spend: t.spend ?? null, profit: facts.costsBroken ? null : (t.cm ?? null), meta_spend: t.meta_spend ?? null, google_spend: t.google_spend ?? null },
    profit_withheld: facts.costsBroken,
    goals: ok(g.sales) || ok(g.spend) ? { sales: g.sales ?? null, spend: g.spend ?? null } : null,
    goal_mer: facts.goalRoas || planMer,
    no_goal: unset,
    /* the forecast spends the month's ad budget, an inherited one when nobody typed a goal: at this pace instead */
    forecast: !unset && fc && ok(fc.projected) ? { projected: fc.projected, at_pace: fc.at_current_pace ? fc.at_current_pace.sales : null } : null,
    notes: notes.sort((p, q) => p.date.localeCompare(q.date)).slice(0, 3),
  };
}

/* ---------- the numbers every part reads ---------- */
function facts(data) {
  const t = data.totals || {}, g = data.goals || {}, dim = data.days_in_month, days = data.days || [];
  const done = days.length, left = Math.max(0, dim - done), share = dim ? done / dim : 0;
  const planSales = ok(g.sales) ? g.sales * share : null, planSpend = ok(g.spend) ? g.spend * share : null;
  const mer = t.spend > 0 && ok(t.sales) ? t.sales / t.spend : null;
  const pace = done && ok(t.sales) ? t.sales / done * dim : null;
  const fc = data.forecast, landing = fc && ok(fc.projected) ? fc.projected : pace;
  return { t, g, dim, days, done, left, planSales, planSpend, mer, landing, fromForecast: !!(fc && ok(fc.projected)) };
}

function heroBlock(data, ctx, f) {
  const { t, g, days } = f;
  const when = days.length ? span(days[0].date, days[days.length - 1].date) : null;
  const gap = (actual, plan, cost) => {
    if (!ok(actual) || !ok(plan)) return null;
    const d = actual - plan, over = d >= 0;
    if (Math.abs(d) < 1) return statusDot('good', 'on plan to date');
    return cost ? statusDot(over ? 'bad' : 'good', money(Math.abs(d)) + (over ? ' over' : ' under'))
      : statusDot(over ? 'good' : 'warn', money(Math.abs(d)) + (over ? ' ahead' : ' behind'));
  };
  /* the sub names both plans: to date (what the status compares with) and the whole month */
  const planSub = (actual, toDate, month, cost) => ok(toDate)
    ? [gap(actual, toDate, cost), ' ', dl('plan to date', 'plan_to_date'), ' ' + money(Math.round(toDate)),
       h('span', { class: 'mo-kpi2' }, (cost ? 'month budget ' : 'month goal ') + money(month))]
    : data.no_goal ? (cost ? null : noGoalLine(data.month)) : (cost ? 'no budget set' : 'no goal set');
  const gm = data.goal_mer, merTone = ok(f.mer) && gm ? (f.mer >= gm ? 'good' : f.mer >= gm * 0.8 ? 'warn' : 'bad') : null;
  const list = [
    { label: 'Sales', value: money(t.sales), unit: 'money', sub: planSub(t.sales, f.planSales, g.sales), spark: days.map(d => d.sales), href: ctx.href('sales', 'by-day') },
    { label: 'Ad spend', value: money(t.spend), unit: 'money', sub: planSub(t.spend, f.planSpend, g.spend, true), spark: days.map(d => d.spend), href: ctx.href('platforms', 'side-by-side'), source: 'All ad platforms' },
    { label: h('span', null, dl('Store MER', 'mer'), gm ? ', goal ' + x(gm) : ''), value: x(f.mer), sub: merTone ? statusDot(merTone, f.mer >= gm ? 'At goal' : x(gm - f.mer) + ' under goal') : null,
      spark: days.map(d => (d.spend > 0 && ok(d.sales) ? d.sales / d.spend : null)), sparkFormat: v => x(v) },
    data.profit_withheld
      ? { label: dl('Profit after ads', 'profit_after_ads'), value: 'held back', sub: 'the cost numbers need a check first', href: ctx.href('month', 'profit'), source: TW + ' costs' }
      : { label: dl('Profit after ads', 'profit_after_ads'), value: money(t.profit), unit: 'money', sub: ok(t.profit) && t.sales > 0 ? pct(t.profit / t.sales) + ' of sales' : null, spark: days.map(d => d.profit), href: ctx.href('month', 'profit'), source: TW + ' costs' },
  ];
  return tileRow(list, { cols: 4, window: when, source: TW, labels: days.map(d => dayLabel(d.date)) });
}

/* One sentence, only for a warning the tiles do not show: ads running over budget leave less a day for the rest
   of the month, and sales behind plan with ads over budget. The tiles carry the amounts, so none are restated. */
function sentence(f) {
  const { t, left } = f;
  if (!left || !ok(f.planSpend) || !ok(t.spend)) return null;
  const days = left === 1 ? 'the last day has' : `the ${left} days left have`;
  const overSpend = t.spend - f.planSpend > 1, behind = ok(f.planSales) && ok(t.sales) && t.sales < f.planSales;
  if (overSpend && behind) return ['Ads are over budget and sales are behind plan, so ', days, ' less to spend each day and more to sell.'];
  if (overSpend) return ['Ads are over budget so far, so ', days, ' less to spend each day than the days so far.'];
  return null;
}

function chartCard(data, f) {
  const { g, dim, days, done } = f, name = monthName(data.month);
  const dates = Array.from({ length: dim }, (_, i) => data.month + '-' + String(i + 1).padStart(2, '0'));
  let run = 0; const cum = dates.map((d, i) => { const r = days[i]; if (!r || !ok(r.sales)) return null; run += r.sales; return run; });
  const last = done - 1, so = cum[last];
  const course = ok(f.landing) && done < dim ? dates.map((d, i) => (i < last ? null : so + (f.landing - so) * (i - last) / (dim - 1 - last))) : null;
  const plan = ok(g.sales) ? dates.map((d, i) => g.sales * (i + 1) / dim) : null;
  const verdict = !ok(f.landing) ? null : !ok(g.sales) ? pill('', 'Heading for ' + money(Math.round(f.landing)))
    : pill(f.landing >= g.sales ? 'good' : f.landing >= g.sales * 0.9 ? 'warn' : 'bad', 'On course for ' + money(Math.round(f.landing)));
  const head = h('div', { class: 'lx-chart-h' },
    h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, ok(g.sales) ? `Will ${name} hit its sales goal?` : `Where is ${name} heading?`)), h('p', null, 'Sales added up day by day, whole store · ' + TW)),
    legend([{ name: 'Sales so far', lead: true }, course && { name: f.fromForecast ? 'On course' : 'At this pace' }, plan && { name: 'Plan to goal', dashed: true }]));
  if (done < 2) return card({ class: 'mo-chart' }, head, empty({ title: 'Not enough days yet', text: 'The chart draws once the month has two days of numbers.' }));
  const short = v => money(v, { compact: true });
  let notes = (data.notes || []).map(nt => ({ index: dates.indexOf(nt.date), text: nt.text })).filter(nt => nt.index >= 0);
  /* on a phone the dated notes stack over the line: keep only the one nearest today */
  if (isPhone() && notes.length > 1) notes = [notes.reduce((m, nt) => (Math.abs(nt.index - last) < Math.abs(m.index - last) ? nt : m), notes[0])];
  return card({ class: 'mo-chart' }, head, verdict ? h('div', { class: 'mo-row', style: { marginBottom: '10px' } }, verdict, ok(g.sales) ? h('span', { class: 'mo-goal' }, 'month goal ' + money(g.sales)) : null) : null,
    lineChart({
      series: [
        { name: 'Sales so far', values: cum, lead: true, end: false },
        course && { name: 'On course', values: course, end: short },
        plan && { name: 'Plan to goal', values: plan, dashed: true, end: v => 'goal ' + short(v) },
      ],
      labels: dates.map(dayLabel), now: last, notes,
      marks: [{ index: last, value: so, text: money(so) }],
      windowLabel: `Added up by day, ${span(dates[0], dates[dim - 1])}`, format: short,
      height: 380, label: `Running total of sales for ${name}, against the plan`,
      hover: i => tipRows(dayLabel(dates[i]), [ok(cum[i]) ? ['Sales so far', money(cum[i]), 'lead'] : course && ok(course[i]) ? ['On course', money(Math.round(course[i])), 'slate'] : null,
        plan ? ['Plan by then', money(Math.round(plan[i])), 'dash'] : null]),
    }));
}

/* What each day left needs. The plan splits evenly across the days, so every day left carries the same number:
   the two figures say it once, and only the named days (Black Friday, Cyber Monday) are shown as chips. */
function needCard(data, ctx, f) {
  const { t, g, left, done, dim } = f, name = monthName(data.month);
  if (!data.goals) {
    return card({ title: 'What each day left needs' }, empty({ title: data.no_goal ? noGoalLine(data.month) : `No plan set for ${name}`, text: 'With a sales goal and an ad budget this card shows what every day left has to do.',
      action: ctx.isClient ? null : button('Open the plan', { href: ctx.href('month', 'plan'), icon: 'arrow' }) }));
  }
  if (!left) return null;
  const needSales = ok(g.sales) && ok(t.sales) ? Math.max(0, (g.sales - t.sales) / left) : null;
  const needSpend = ok(g.spend) && ok(t.spend) ? Math.max(0, (g.spend - t.spend) / left) : null;
  const met = ok(g.sales) && ok(t.sales) && t.sales >= g.sales, spent = ok(g.spend) && ok(t.spend) && t.spend >= g.spend;
  const soFar = (v, word) => (done && ok(v) ? `${money(Math.round(v / done))} a day so far` + (word ? ', ' + word : '') : null);
  const first = dim - left + 1;
  const last = data.month + '-' + String(dim).padStart(2, '0'), firstDate = data.month + '-' + String(first).padStart(2, '0');
  const named = (data.notes || []).filter(nt => nt.date >= firstDate && nt.date <= last);
  return card({ title: 'What each day left needs', note: `${left} ${left === 1 ? 'day' : 'days'} left, the same each day`, flush: true },
    h('div', { class: 'mo-src' }, sourceLine(`Month goal and budget, ${monthName(data.month)}`, 'sales ' + TW + ', spend from the ad platforms')),
    h('div', { class: 'mo-need' },
      ok(needSales) ? h('div', null, h('small', null, 'Sales a day to hit the month goal'), h('span', { class: 'lx-big' }, met ? 'Goal met' : money(Math.round(needSales))), h('span', null, soFar(t.sales))) : null,
      ok(needSpend) ? h('div', null, h('small', null, 'Ad budget a day that is left'), h('span', { class: 'lx-big' }, spent ? 'Spent' : money(Math.round(needSpend))), h('span', null, soFar(t.spend))) : null),
    named.length ? h('div', { class: 'mo-evs' }, named.map(nt => h('span', null, h('b', null, nt.text), `${weekday(nt.date)} ${asDate(nt.date).getDate()}`))) : h('div', { style: { height: '18px' } }));
}

function budgetCard(data, f) {
  const { t, g, days } = f;
  if (!(t.spend > 0)) return card({ title: 'Where the ad budget went' }, empty({ title: 'No ad spend this month yet', text: 'Each platform shows here with its share once it has spent.' }));
  const other = ok(t.meta_spend) || ok(t.google_spend) ? Math.max(0, t.spend - (t.meta_spend || 0) - (t.google_spend || 0)) : null;
  const rows = [['meta', t.meta_spend], ['google', t.google_spend], ['other', other]].filter(r => r[1] > 0.5).map(([id, spend]) => ({ id, spend, share: spend / t.spend }));
  const over = ok(f.planSpend) ? t.spend - f.planSpend : null;
  const shareCell = r => h('span', { class: 'mo-share' }, h('b', null, pct(r.share)), h('span', { class: 'lx-cellbar', style: { '--v': Math.round(r.share * 100) + '%' } }));
  const span = days.length ? `${dayLabel(days[0].date)} to ${asDate(days[days.length - 1].date).getDate()}` : '';
  return card({ title: 'Where the ad budget went', note: span + ' · spend from each platform', flush: true,
    action: over != null ? statusDot(over > 1 ? 'bad' : 'good', Math.abs(over) < 1 ? 'on plan' : money(Math.abs(over)) + (over > 0 ? ' over plan so far' : ' under plan so far')) : null },
    ok(g.spend) ? h('div', { class: 'mo-budget' }, gauge({ value: t.spend, max: Math.max(g.spend, t.spend), goal: f.planSpend, tone: over > 1 ? 'bad' : '',
      ticks: [{ side: 'l', text: 'spent ' + money(t.spend) }, { side: 'r', text: 'month budget ' + money(g.spend) }] })) : null,
    rows.length ? table({
      cols: [
        { key: 'id', label: 'Platform', class: 'name', render: r => (r.total ? 'All ads' : r.id === 'other' ? 'Other ads' : platformChip(r.id)) },
        { key: 'spend', label: 'Spend', num: true, sortable: true, render: r => money(r.spend) },
        { key: 'share', label: 'Share of spend', width: 260, sortable: true, render: shareCell },
      ],
      rows, sort: { key: 'spend', dir: 'desc' }, total: { total: true, spend: t.spend, share: 1 },
    }) : null);
}

export default {
  title: (ctx, data) => (ctx.brand ? ['Is ' + ctx.brand.name + ' on pace for ', em(monthName((data && data.month) || iso(new Date()).slice(0, 7)) + '?')] : 'This month'),
  eyebrow: 'This month',
  stamp: false,                     /* Home's stamp with a refresh button sits in the help bar */
  ranges: false,                    // the page is the month in progress; the plan is agreed per month

  /* ?sample=1&nogoal=1: the same month with no goal typed (what load makes of /api/plan planned: false) */
  async sample(ctx) {
    const d = await ctx.fixture('pace.json');
    return d && new URLSearchParams(location.search).get('nogoal') ? { ...d, no_goal: true, goals: null, forecast: null } : d;
  },
  load,

  render(el, data, ctx) {
    styles();
    if (!ctx.brand) return put(el, pickBrand('Pace'));
    if (!data) return put(el, empty({ title: 'No numbers yet', text: 'This brand has nothing to show for this month yet.' }));
    if (!data.source) return put(el, noSource(ctx, 'sales against the plan'));
    const f = facts(data), say = sentence(f);
    const name = monthName(data.month);
    ctx.askWindow = `${name}, day ${f.done} of ${f.dim}`;
    ctx.askContext = `${ctx.brand.name} pace for ${name}, day ${f.done} of ${f.dim}: sales ${money(f.t.sales)}${ok(f.g.sales) ? ' against a month goal of ' + money(f.g.sales) + ' (plan to date ' + money(Math.round(f.planSales)) + ')' : ', no goal set'}, ad spend ${money(f.t.spend)}${ok(f.g.spend) ? ' of a ' + money(f.g.spend) + ' budget' : ''}, store MER ${x(f.mer)}${data.goal_mer ? ' against ' + x(data.goal_mer) : ''}.` + (ok(f.landing) ? ` Heading for ${money(Math.round(f.landing))}.` : '');
    put(el, h('div', { class: 'mo' }, [
      helpBar([
        { title: 'What it is for', text: `Is ${name} on course for its sales goal? The month so far against the plan, where the month is heading, and what each day left needs.` },
        { title: 'How it is counted', text: 'Sales are store sales less tax (Triple Whale). Store MER is whole store sales over all ad spend. The plan splits evenly across the days of the month, so plan to date is the month goal times the share of days gone.' },
        { title: 'The line on the chart', text: f.fromForecast ? 'On course is the forecast if the rest of the ad budget is spent.' : 'At this pace carries the daily average so far to the end of the month.' },
      ], h('span', { class: 'bz-chip' }, `${name}, day ${f.done} of ${f.dim}`), pageStamp(ctx)),
      heroBlock(data, ctx, f),
      say ? takeaway(say, { action: ctx.isClient ? null : askWhy(ctx, `Is ${ctx.brand.name} on pace for ${name}?`) }) : null,
      chartCard(data, f),
      needCard(data, ctx, f),
      budgetCard(data, f),
    ].filter(Boolean)));
  },
};
