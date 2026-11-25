/* Business > This month > Pace: is the month on course for its sales goal?
   Four figures against the plan, one sentence, the running total of sales against the plan line with
   where it is heading, what each day left needs, and where the ad budget went.

   The page is about the month in progress, so it has no date range of its own.
   Where the live numbers come from (all read only, profit worker):
     /api/client?act&from=<1st>&to=<yesterday>   the store by day, totals, the month's goals
     /api/forecast?act                           where the month lands (spending the budget, and at today's pace)
     /api/overview?days=7&cmp=none&series=0      the cost check (the goal ROAS comes from the brand's own goal, _m.js brandGoals)
     /api/season?act                             dated phases, for the notes on the chart and the day cells
   Only the first is needed; any other that fails leaves its part out. The plan splits evenly across the days. */

import { put } from '../../kit.js';
import { h, money, pct, x, card, hero, em, kpi, kpis, takeaway, button, statusDot, pill, gauge, legend, lineChart, table, platformChip, empty } from '../../kit.js';
import { ok, asDate, iso, addDays, dayLabel, weekday, monthName, daysIn, b, soft, brandFacts, brandGoals, hasSource, pickBrand, noSource, styles } from './_m.js';

/* ---------- live data ---------- */
async function load(ctx) {
  if (!ctx.brand) return null;
  const id = encodeURIComponent(ctx.brand.id), sig = { signal: ctx.signal };
  const now = new Date(), today = iso(now), ym = today.slice(0, 7), from = ym + '-01';
  const to = now.getDate() > 1 ? addDays(today, -1) : today;
  const [cl, fc, ov, season, goals] = await Promise.all([
    ctx.api(`/api/client?act=${id}&from=${from}&to=${to}`, sig),
    soft(ctx.api(`/api/forecast?act=${id}`, sig)),
    soft(ctx.api('/api/overview?days=7&cmp=none&series=0', sig)),
    soft(ctx.api(`/api/season?act=${id}`, sig)),
    brandGoals(ctx),
  ]);
  const rows = (cl.rows || []).filter(r => r.date >= from && r.date <= to && r.date < today);
  const facts = brandFacts(ov, cl, goals), t = cl.totals || {}, g = cl.goals || {};
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
    forecast: fc && ok(fc.projected) ? { projected: fc.projected, at_pace: fc.at_current_pace ? fc.at_current_pace.sales : null } : null,
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
  const gap = (actual, plan, cost) => {
    if (!ok(actual) || !ok(plan)) return null;
    const d = actual - plan, over = d >= 0;
    if (Math.abs(d) < 1) return statusDot('good', 'on plan');
    return cost ? statusDot(over ? 'bad' : 'good', money(Math.abs(d)) + (over ? ' over plan so far' : ' under plan so far'))
      : statusDot(over ? 'good' : 'warn', money(Math.abs(d)) + (over ? ' ahead of plan' : ' behind plan'));
  };
  const gm = data.goal_mer, merTone = ok(f.mer) && gm ? (f.mer >= gm ? 'good' : f.mer >= gm * 0.8 ? 'warn' : 'bad') : null;
  const list = [
    /* the goal rides in the label: beside a hero size figure it would run into the next column */
    { label: ok(g.sales) ? 'Sales, goal ' + money(g.sales) : 'Sales', value: money(t.sales), sub: gap(t.sales, f.planSales) || (ok(g.sales) ? null : 'no goal set'), spark: days.map(d => d.sales), href: ctx.href('sales', 'by-day') },
    { label: ok(g.spend) ? 'Ad spend, budget ' + money(g.spend) : 'Ad spend', value: money(t.spend), sub: gap(t.spend, f.planSpend, true) || (ok(g.spend) ? null : 'no budget set'), spark: days.map(d => d.spend), href: ctx.href('platforms', 'side-by-side') },
    { label: gm ? 'MER, goal ' + x(gm) : 'MER, whole store', value: x(f.mer), sub: merTone ? statusDot(merTone, f.mer >= gm ? 'At goal' : x(gm - f.mer) + ' under goal') : null,
      spark: days.map(d => (d.spend > 0 && ok(d.sales) ? d.sales / d.spend : null)) },
    data.profit_withheld
      ? { label: 'Profit after ads', value: 'held back', sub: 'the cost numbers need a check first', href: ctx.href('month', 'profit') }
      : { label: 'Profit after ads', value: money(t.profit), sub: ok(t.profit) && t.sales > 0 ? pct(t.profit / t.sales) + ' of sales' : null, spark: days.map(d => d.profit), href: ctx.href('month', 'profit') },
  ].map(k => kpi({ ...k, size: 'lg' }));
  return hero({}, kpis(list, { cols: 4 }));
}

/* One sentence, written by rule from the numbers on the page. */
function sentence(f) {
  const { t, left } = f;
  const days = left === 1 ? '1 day left' : left + ' days left';
  if (ok(f.planSales) && ok(f.planSpend) && ok(t.sales) && ok(t.spend)) {
    const ds = t.sales - f.planSales, dc = t.spend - f.planSpend, good = ds >= 0, cheap = dc <= 0;
    return ['Sales are ', b(money(Math.abs(ds)) + (good ? ' ahead' : ' behind')), good ? ' of plan with ' : ' plan with ', days, good === cheap ? ', and ads are ' : ', but ads are ',
      b(money(Math.abs(dc)) + (cheap ? ' under' : ' over')), ' budget.'];
  }
  if (ok(f.landing) && ok(t.sales)) return ['At this pace the month ends near ', b(money(Math.round(f.landing))), ' in sales, with ', days, '.'];
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
    h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, ok(g.sales) ? `Will ${name} hit its sales goal?` : `Where is ${name} heading?`)), h('p', null, 'running total of sales, by day')),
    legend([{ name: 'Sales so far', lead: true }, course && { name: f.fromForecast ? 'On course' : 'At this pace' }, plan && { name: 'Plan to goal', dashed: true }]));
  if (done < 2) return card({ class: 'mo-chart' }, head, empty({ title: 'Not enough days yet', text: 'The chart draws once the month has two days of numbers.' }));
  const short = v => money(v, { compact: true });
  const notes = (data.notes || []).map(nt => ({ index: dates.indexOf(nt.date), text: nt.text })).filter(nt => nt.index >= 0);
  return card({ class: 'mo-chart' }, head, verdict ? h('div', { class: 'mo-row', style: { marginBottom: '10px' } }, verdict, ok(g.sales) ? h('span', { class: 'lx-foot' }, 'goal ' + money(g.sales)) : null) : null,
    lineChart({
      series: [
        { name: 'Sales so far', values: cum, lead: true, end: false },
        course && { name: 'On course', values: course, end: short },
        plan && { name: 'Plan to goal', values: plan, dashed: true, end: v => 'goal ' + short(v) },
      ],
      labels: dates.map(dayLabel), now: last, notes,
      marks: [{ index: last, value: so, text: money(so) }],
      height: 380, label: `Running total of sales for ${name}, against the plan`,
      hover: i => [b(dayLabel(dates[i])), ok(cum[i]) ? h('span', null, 'Sales so far ', b(money(cum[i]))) : course && ok(course[i]) ? h('span', null, 'On course ', b(money(Math.round(course[i])))) : null,
        plan ? h('span', null, 'Plan by then ', b(money(Math.round(plan[i])))) : null],
    }));
}

/* What each day left needs. The plan splits evenly across the days, so every day left carries the same number. */
function needCard(data, ctx, f) {
  const { t, g, left, done, dim } = f, name = monthName(data.month);
  if (!data.goals) {
    return card({ title: 'What each day left needs' }, empty({ title: `No plan set for ${name}`, text: 'With a sales goal and an ad budget this card shows what every day left has to do.',
      action: ctx.isClient ? null : button('Open the plan', { href: ctx.href('month', 'plan'), icon: 'arrow' }) }));
  }
  if (!left) return null;
  const needSales = ok(g.sales) && ok(t.sales) ? Math.max(0, (g.sales - t.sales) / left) : null;
  const needSpend = ok(g.spend) && ok(t.spend) ? Math.max(0, (g.spend - t.spend) / left) : null;
  const met = ok(g.sales) && ok(t.sales) && t.sales >= g.sales, spent = ok(g.spend) && ok(t.spend) && t.spend >= g.spend;
  const soFar = (v, word) => (done && ok(v) ? `${money(Math.round(v / done))} a day so far` + (word ? ', ' + word : '') : null);
  const first = dim - left + 1, ev = Object.fromEntries((data.notes || []).map(nt => [nt.date, nt.text]));
  const show = Math.min(left, 8);
  const cells = Array.from({ length: show }, (_, i) => {
    const date = data.month + '-' + String(first + i).padStart(2, '0');
    return h('div', { class: ev[date] ? 'ev' : '' }, h('small', { title: ev[date] || null }, ev[date] || `${weekday(date)} ${asDate(date).getDate()}`),
      h('b', null, met ? 'goal met' : money(Math.round(needSales))), ok(needSpend) ? h('span', null, spent ? 'budget spent' : money(Math.round(needSpend)) + ' ads') : null);
  });
  return card({ title: 'What each day left needs', note: `${left} ${left === 1 ? 'day' : 'days'} left`, flush: true },
    h('div', { class: 'mo-need' },
      ok(needSales) ? h('div', null, h('small', null, 'Sales a day to hit the goal'), h('span', { class: 'lx-big' }, met ? 'Goal met' : money(Math.round(needSales))), h('span', null, soFar(t.sales))) : null,
      ok(needSpend) ? h('div', null, h('small', null, 'Ad budget a day that is left'), h('span', { class: 'lx-big' }, spent ? 'Spent' : money(Math.round(needSpend))), h('span', null, soFar(t.spend))) : null),
    h('div', { class: 'mo-days' }, cells),
    h('p', { class: 'mo-more' }, left > show ? `and ${left - show} more days at the same numbers` : ''));
}

function budgetCard(data, f) {
  const { t, g, days } = f;
  if (!(t.spend > 0)) return card({ title: 'Where the ad budget went' }, empty({ title: 'No ad spend this month yet', text: 'Each platform shows here with its share once it has spent.' }));
  const other = ok(t.meta_spend) || ok(t.google_spend) ? Math.max(0, t.spend - (t.meta_spend || 0) - (t.google_spend || 0)) : null;
  const rows = [['meta', t.meta_spend], ['google', t.google_spend], ['other', other]].filter(r => r[1] > 0.5).map(([id, spend]) => ({ id, spend, share: spend / t.spend }));
  const over = ok(f.planSpend) ? t.spend - f.planSpend : null;
  const shareCell = r => h('span', { class: 'mo-share' }, h('b', null, pct(r.share)), h('span', { class: 'lx-cellbar', style: { '--v': Math.round(r.share * 100) + '%' } }));
  const span = days.length ? `${dayLabel(days[0].date)} to ${asDate(days[days.length - 1].date).getDate()}` : '';
  return card({ title: 'Where the ad budget went', note: span, flush: true,
    action: over != null ? statusDot(over > 1 ? 'bad' : 'good', Math.abs(over) < 1 ? 'on plan' : money(Math.abs(over)) + (over > 0 ? ' over plan so far' : ' under plan so far')) : null },
    ok(g.spend) ? h('div', { class: 'mo-budget' }, gauge({ value: t.spend, max: Math.max(g.spend, t.spend), goal: f.planSpend, tone: over > 1 ? 'bad' : '',
      ticks: [{ side: 'l', text: 'spent ' + money(t.spend) }, { side: 'r', text: 'month budget ' + money(g.spend) }] })) : null,
    rows.length ? table({
      cols: [
        { key: 'id', label: 'Platform', class: 'name', render: r => (r.total ? 'All ads' : r.id === 'other' ? 'Other ads' : platformChip(r.id)) },
        { key: 'spend', label: 'Spend', num: true, render: r => money(r.spend) },
        { key: 'share', label: 'Share of spend', width: 260, render: shareCell },
      ],
      rows, total: { total: true, spend: t.spend, share: 1 },
    }) : null);
}

export default {
  title: (ctx, data) => (ctx.brand ? ['Is ' + ctx.brand.name + ' on pace for ', em(monthName((data && data.month) || iso(new Date()).slice(0, 7)) + '?')] : 'This month'),
  eyebrow: 'This month',
  ranges: false,                    // the page is the month in progress; the plan is agreed per month

  load,

  render(el, data, ctx) {
    styles();
    if (!ctx.brand) return put(el, pickBrand('Pace'));
    if (!data) return put(el, empty({ title: 'No numbers yet', text: 'This brand has nothing to show for this month yet.' }));
    if (!data.source) return put(el, noSource(ctx, 'sales against the plan'));
    const f = facts(data), say = sentence(f);
    put(el, h('div', { class: 'mo' }, [
      heroBlock(data, ctx, f),
      say ? takeaway(say, { action: ctx.isClient ? null : button('Ask why', { href: ctx.href('ask', 'index') }) }) : null,
      chartCard(data, f),
      needCard(data, ctx, f),
      budgetCard(data, f),
      h('p', { class: 'lx-foot' }, 'Sales are store sales less tax. MER is whole store sales over all ad spend. The plan splits evenly across the days of the month.'
        + (f.fromForecast ? ' On course is the forecast if the rest of the budget is spent.' : ' At this pace carries the daily average so far to the end of the month.')),
    ].filter(Boolean)));
  },
};
