/* Business > This month > Profit: what is left of the sales after every cost, on the dates in the page head.
   Four figures, one sentence, a full width chart of what each day keeps before ads against that day's ad
   spend (the gap is the profit), then where every dollar of sales went, line by line.

   Profit after ads is sales less product, delivery, handling, payment fees and all ad spend.
   Fixed costs (rent, software, fees) come off after that and give net profit.
   When the cost numbers have failed their check the profit figures are held back, never guessed.
   Where the live numbers come from (read only, profit worker):
     /api/client?act&from&to                     the store by day, totals, fixed costs, the plan so far
     /api/overview?days=7&cmp=none&series=0      the cost check for the brand */

import { put } from '../../kit.js';
import { h, money, num, pct, card, hero, em, kpi, kpis, takeaway, button, statusDot, legend, lineChart, empty } from '../../kit.js';
import { ok, dayLabel, b, soft, brandFacts, hasSource, pickBrand, noSource, noDays, styles } from './_m.js';

/* ---------- live data ---------- */
async function load(ctx) {
  if (!ctx.brand) return null;
  const id = encodeURIComponent(ctx.brand.id), w = ctx.range, sig = { signal: ctx.signal };
  const [cl, ov] = await Promise.all([
    ctx.api(`/api/client?act=${id}&from=${w.from}&to=${w.to}`, sig),
    soft(ctx.api('/api/overview?days=7&cmp=none&series=0', sig)),
  ]);
  const rows = (cl.rows || []).filter(r => r.date >= w.from && r.date <= w.to);
  const facts = brandFacts(ov, cl), t = cl.totals || {}, fx = cl.fixed || {}, p = cl.plan || null;
  const flat = ok(cl.margin_pct) ? cl.margin_pct : null;
  const held = facts.costsBroken || !ok(t.gross_profit);
  return {
    range: { from: w.from, to: w.to, preset: w.preset }, source: hasSource(cl),
    withheld: held, withheld_why: facts.costsBroken ? 'check' : !ok(t.gross_profit) ? 'none' : null,
    /* a flat margin replaces the whole cost chain, so the single lines are not shown with it */
    flat_margin: flat,
    totals: {
      sales: t.sales ?? null, spend: t.spend ?? null, orders: t.orders ?? null,
      cogs: held || flat != null ? null : t.cogs ?? null, ship_cost: held || flat != null ? null : t.ship_cost ?? null,
      handling: held || flat != null ? null : t.handling ?? null, fees: held || flat != null ? null : t.fees ?? null,
      before_ads: held ? null : t.gross_profit ?? null, profit: held ? null : t.cm ?? null,
    },
    /* the names of the fixed costs are the team's; a client gets the total */
    fixed: held || !(fx.total > 0) ? null : { total: fx.total, items: ctx.isClient ? [] : (fx.items || []).map(it => ({ name: it.name, amount: it.amount })) },
    plan_profit: w.preset === 'month' && p && ok(p.cm) && !held ? p.cm : null,
    days: rows.map(r => ({ date: r.date, sales: r.sales ?? null, spend: r.spend ?? null, before_ads: held ? null : r.gross_profit ?? null })),
  };
}

function heroBlock(data, ctx) {
  const t = data.totals, days = data.days || [];
  const of = v => (ok(v) && t.sales > 0 ? pct(v / t.sales) + ' of sales' : null);
  let list;
  if (data.withheld) {
    list = [
      { label: 'Sales', value: money(t.sales), spark: days.map(d => d.sales) },
      { label: 'Ad spend', value: money(t.spend), sub: of(t.spend), spark: days.map(d => d.spend) },
      { label: 'Profit after ads', value: 'held back', sub: data.withheld_why === 'check' ? 'the cost numbers need a check first' : 'no product costs to read yet' },
    ];
  } else {
    const plan = data.plan_profit, gap = ok(plan) && ok(t.profit) ? t.profit - plan : null;
    list = [
      { label: 'Profit after ads', value: money(t.profit), sub: gap != null ? statusDot(gap >= 0 ? 'good' : 'warn', money(Math.abs(gap)) + (gap >= 0 ? ' ahead of plan' : ' behind plan')) : of(t.profit),
        small: gap != null ? of(t.profit) : null, spark: days.map(d => (ok(d.before_ads) && ok(d.spend) ? Math.max(0, d.before_ads - d.spend) : null)), lead: true },
      { label: 'Left before ads', value: money(t.before_ads), sub: of(t.before_ads), spark: days.map(d => d.before_ads) },
      { label: 'Ad spend', value: money(t.spend), sub: of(t.spend), spark: days.map(d => d.spend), href: ctx.href('platforms', 'side-by-side') },
      t.orders > 0 && ok(t.profit) ? { label: 'Profit an order', value: money(t.profit / t.orders, { cents: true }), sub: num(t.orders) + ' orders' } : null,
    ].filter(Boolean);
  }
  return hero({}, kpis(list.map(k => kpi({ ...k, size: 'lg' })), { cols: list.length }));
}

/* One sentence, by rule: every $100 of sales, split three ways. */
function sentence(data) {
  const t = data.totals;
  if (data.withheld || !(t.sales > 0) || !ok(t.before_ads) || !ok(t.spend) || !ok(t.profit)) return null;
  const per = v => money(Math.round(v / t.sales * 100));
  return t.profit >= 0
    ? ['Of every $100 in sales, ', b(per(t.before_ads)), ' is left after product and delivery, ads take ', b(per(t.spend)), ', and ', b(per(t.profit)), ' is profit.']
    : ['Of every $100 in sales, ', b(per(t.before_ads)), ' is left after product and delivery, but ads take ', b(per(t.spend)), ', a loss of ', b(per(-t.profit)), '.'];
}

function chartCard(data) {
  const days = data.days || [];
  const head = h('div', { class: 'lx-chart-h' },
    h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'Does each day cover its ads?')), h('p', null, 'what a day keeps before ads, against that day\'s ad spend. The gap is the profit.')),
    legend([{ name: 'Left before ads', lead: true }, { name: 'Ad spend' }]));
  const enough = days.filter(d => ok(d.before_ads)).length > 1;
  if (!enough) return card({ class: 'mo-chart' }, head, empty({ title: 'Not enough days yet', text: 'The chart draws once there are two days of numbers.' }));
  const short = days.filter(d => ok(d.before_ads) && ok(d.spend) && d.before_ads < d.spend).length;
  return card({ class: 'mo-chart' }, head,
    h('div', { class: 'mo-row', style: { marginBottom: '10px' } }, statusDot(short ? 'warn' : 'good', short ? `${short} of ${days.length} days did not cover their ads` : 'every day covered its ads')),
    lineChart({
      series: [{ name: 'Left before ads', values: days.map(d => d.before_ads), lead: true }, { name: 'Ad spend', values: days.map(d => d.spend) }],
      labels: days.map(d => dayLabel(d.date)), endFormat: v => money(Math.round(v)), height: 360,
      label: 'What each day keeps before ads, against its ad spend',
      hover: i => { const d = days[i]; return [b(dayLabel(d.date)), h('span', null, 'Left before ads ', b(money(d.before_ads))), h('span', null, 'Ad spend ', b(money(d.spend))),
        ok(d.before_ads) && ok(d.spend) ? h('span', null, 'Profit ', b(money(d.before_ads - d.spend))) : null]; },
    }));
}

/* Where every dollar of sales went: each cost as its slice of the sales bar, each result as what is left. */
function dollarsCard(data, ctx) {
  const t = data.totals, fx = data.fixed, S = t.sales;
  if (!(S > 0) || !ok(t.before_ads)) return null;
  const rows = [{ name: 'Sales', amount: S, res: true, left: 0, width: 1 }];
  let at = 1;                                          // where the next cost slice ends, as a share of sales
  const cost = (name, v) => { if (!(v > 0)) return; at -= v / S; rows.push({ name, amount: -v, left: at, width: v / S }); };
  const result = (name, v) => rows.push({ name, amount: v, res: true, left: 0, width: v / S, neg: v < 0 });
  if (data.flat_margin != null) cost('Product, delivery and fees', S - t.before_ads);
  else {
    cost('Product', t.cogs); cost('Delivery', t.ship_cost); cost('Handling', t.handling); cost('Payment fees', t.fees);
    const rest = S - t.before_ads - (t.cogs || 0) - (t.ship_cost || 0) - (t.handling || 0) - (t.fees || 0);
    if (rest > 1) cost('Other costs', rest);
  }
  at = t.before_ads / S;
  result('Left before ads', t.before_ads);
  cost('Ad spend', t.spend);
  result('Profit after ads', t.profit);
  if (fx) {
    at = t.profit / S;
    /* the names of the fixed costs are the team's; a client sees one line (also true for the saved copy and sample mode) */
    if (fx.items.length && !ctx.isClient) fx.items.forEach(it => cost(it.name, it.amount)); else cost('Fixed costs', fx.total);
    result('Net profit', t.profit - fx.total);
  }
  const clamp = v => Math.max(0, Math.min(1, v));
  return card({ title: 'Where every dollar of sales went', note: data.flat_margin != null && !ctx.isClient ? `costs before ads are a flat ${pct(1 - data.flat_margin)} of sales` : null, flush: true },
    h('div', { class: 'mo-wf' }, rows.map(r => h('div', { class: (r.res ? 'res' : '') + (r.neg || (r.res && r.amount < 0) ? ' neg' : '') },
      h('span', { class: 'n' }, r.name),
      h('span', { class: 't' }, h('i', { style: { '--l': (clamp(r.left) * 100).toFixed(1) + '%', '--w': (clamp(Math.abs(r.width)) * 100).toFixed(1) + '%' } })),
      h('span', { class: 'a' }, r.amount < 0 ? '-' + money(-r.amount) : money(r.amount)),
      h('span', { class: 'p' }, pct(Math.abs(r.amount) / S))))));
}

function heldCard(data, ctx) {
  const check = data.withheld_why === 'check';
  return empty({
    title: check ? 'Profit is held back until the cost numbers are checked' : 'No product costs to read yet',
    text: check ? 'Some days book more cost than the store took in, so a profit figure here would mislead. Sales and ad spend above are sound.'
      : 'Profit needs what the products and delivery cost. Sales and ad spend above are sound.',
    action: ctx.isClient || !ctx.legacy ? null : button('Check the costs', { href: ctx.legacy, icon: 'arrow' }),
  });
}

const WORDS = { month: 'this month?', '7d': 'in the last 7 days?', '30d': 'in the last 30 days?', 'last-month': 'last month?', custom: 'on these dates?' };

export default {
  title: ctx => ['What is left after every cost ', em(WORDS[ctx.range.preset] || WORDS.month)],
  eyebrow: 'This month',

  load,

  render(el, data, ctx) {
    styles();
    if (!ctx.brand) return put(el, pickBrand('Profit'));
    if (!data) return put(el, noDays());
    if (!data.source) return put(el, noSource(ctx, 'what is left after product, delivery and ads'));
    if (!(data.days || []).length) return put(el, noDays());
    const say = sentence(data);
    put(el, h('div', { class: 'mo' }, [
      heroBlock(data, ctx),
      say ? takeaway(say, { action: ctx.isClient ? null : button('Ask why', { href: ctx.href('ask', 'index') }) }) : null,
      data.withheld ? heldCard(data, ctx) : chartCard(data),
      data.withheld ? null : dollarsCard(data, ctx),
      h('p', { class: 'lx-foot' }, 'Sales are store sales less tax. Profit after ads is sales less product, delivery, handling, payment fees and all ad spend. Fixed costs come off after that.'),
    ].filter(Boolean)));
  },
};
