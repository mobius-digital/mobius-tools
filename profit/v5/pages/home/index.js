/* Brand Home: how the brand is doing on the dates in the page head, on one page.
   Hero (four figures with sparklines), one sentence, sales against ad spend by day with the MER
   gauge, suggestions to decide, what is coming up, and each platform against the goal.

   Where the live numbers come from (all read only):
     /api/client?act&from&to              profit worker   the store by day, month to date, the plan
     /api/hub/paid?platform=all&act&...   profit worker   spend and Triple Whale credited sales per platform
     /api/overview?days=7&series=0        profit worker   the cost check
     ctx.setting brand:<id>.target_roas   account-health  goal ROAS and goal cost per customer, from the brand list (team only)
     /api/buyer-list?act                  account-health  Meta suggestions waiting (team only): n_do, or the rows that ask for a yes or a no
     /api/season?act                      profit worker   dated phases for Coming up and the chart note
     /api/notices                         account-health  "Needs you": rows an automation left for this person (automations/_notices.js).
                                                          Read by the card itself, never by load: off, empty or failing, the card is not drawn
   The page needs only the first; any other that fails leaves its own card in a plain empty state. */

import { put } from '../../kit.js';
import { homeNotices } from '../automations/_notices.js';
import { APP_NAME, OLD_LOCUS } from '../../config.js';
import { askWhy, helpBar, dl, rangeWords } from './_biz.js';
import { monthWord } from '../a-today/_ag.js';
import { h, money, num, pct, x, card, hero, em, kpi, kpis, takeaway, button, platformChip, statusDot, pill,
  delta, count, gauge, legend, lineChart, dateBlock, table, empty, addStyles } from '../../kit.js';

/* ---------- local styles (layout only; every color and size token comes from app.css) ---------- */
const CSS = `
.hm-mer{display:flex;align-items:center;gap:24px;margin-bottom:18px;flex-wrap:wrap}
.hm-mer .n{display:flex;align-items:baseline;gap:12px}
.hm-mer .lx-gauge{width:280px;max-width:100%}
.hm-narrow{display:none}
.hm-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;align-items:stretch}
.hm-pair.one{grid-template-columns:minmax(0,1fr)}
.hm-pair>.lx-card{display:flex;flex-direction:column}
.hm-big{display:flex;align-items:baseline;gap:14px;padding:6px 28px 0;color:var(--muted);font-size:13.5px}
.hm-list{padding:10px 28px 0}
.hm-list>*{display:flex;align-items:center;gap:10px;min-height:46px;border-top:1px solid var(--line);color:inherit;text-decoration:none}
.hm-list>:first-child{border-top:0}
.hm-list .q{margin-left:auto;font-size:12.5px;color:var(--muted)}
.hm-list .lx-count{margin-left:auto}
.hm-cta{margin-top:auto;padding:14px 28px 24px}
.hm-up{padding:4px 28px 14px}
.hm-up>div{display:flex;align-items:center;gap:14px;min-height:66px;border-top:1px solid var(--line)}
.hm-up>div:first-child{border-top:0}
.hm-up .t{min-width:0}
.hm-up .t b{display:block;font-weight:600}
.hm-up .t span{display:block;font-size:12.5px;color:var(--muted)}
.hm-up .lx-stat{margin-left:auto}
.hm-quiet{padding:8px 28px 24px;color:var(--muted)}
.hm-g{display:block;width:220px;max-width:100%}
.hm-total .lx-gauge-track{background:var(--line-strong)}
.hm-live{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;padding:10px 16px;border:1px solid var(--line);border-radius:14px;background:var(--surface);font-size:13.5px;color:var(--ink-2)}
.hm-live b{color:var(--ink);font-weight:600}
.hm-live .sp{flex:1}
.hm-live a{font-size:13px;color:var(--muted)}
.hm-sug{display:flex;align-items:center;gap:10px 16px;flex-wrap:wrap;padding:10px 16px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}
.hm-sug>b{font-weight:600}
.hm-sug a{display:inline-flex;align-items:center;gap:8px;padding:4px 10px;border-radius:999px;color:inherit;text-decoration:none;font-size:13.5px}
.hm-sug a:hover{background:var(--row-hover)}
.hm-plats{display:none;padding:0 18px 6px}
.hm-plats>div{display:grid;gap:8px;padding:14px 0;border-top:1px solid var(--line)}
.hm-plats>div:first-child{border-top:0}
.hm-plats .top{display:flex;align-items:center;gap:10px}
.hm-plats .top .lx-stat{margin-left:auto}
.hm-plats .nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;font-variant-numeric:tabular-nums}
.hm-plats .nums small{display:block;font-size:11.5px;color:var(--muted)}
.hm-plats .nums b{font-weight:600}
.hm-plats .tot{margin:0 -18px;padding:14px 18px;background:var(--band);border-top:0}
@media (max-width:759px){
  .hm-wide{display:none}
  .hm-narrow{display:block}
  .hm-pair{grid-template-columns:minmax(0,1fr);gap:16px}
  .hm-mer{gap:14px}
  .hm-mer .lx-gauge{width:100%;order:3}
  .hm-big,.hm-list,.hm-up{padding-left:18px;padding-right:18px}
  .hm-cta{padding:14px 18px 18px}
  .hm-cta .lx-btn{width:100%}
  .hm-quiet{padding:8px 18px 18px}
  .hm-plats{display:block}
  .hm-byp>.lx-sec .note{display:none}
}`;
function styles() {
  addStyles('hm-css', CSS);
}

/* ---------- small helpers ---------- */
const ok = n => n != null && isFinite(n);
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const asDate = str => new Date(str + 'T12:00:00');
const dayLabel = str => asDate(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const sum = (rows, key) => { let t = null; for (const r of rows) if (ok(r[key])) t = (t || 0) + r[key]; return t; };
const clip = (str, n) => { const v = String(str || '').trim(); return v.length > n ? v.slice(0, n - 1).trimEnd() + '…' : v; };

/* ---------- live data: shape the five answers into the one object the page draws ---------- */
const STATUS = { locked: ['good', 'Ready'], draft: ['warn', 'Draft offer'], missing: ['warn', 'No offer yet'] };
const PLATS = ['meta', 'google', 'tiktok', 'amazon', 'pinterest', 'email'];

function shape({ win, cl, paid, ov, buy, season, goals, isClient }) {
  const rows = (cl.rows || []).filter(r => r.date >= win.from && r.date <= win.to);
  const days = rows.map(r => ({
    date: r.date, sales: r.sales ?? null, spend: r.spend ?? null, new_customers: r.new_orders ?? null,
    profit: ok(r.gross_profit) && ok(r.spend) ? r.gross_profit - r.spend : null,
  }));
  const acct = ((ov && (ov.accounts || ov.brands)) || []).find(a => a.act_id === (cl.account && cl.account.act_id)) || {};
  const costsBroken = !!(acct.cost_health && acct.cost_health.verdict === 'broken');
  const t = cl.totals || {};
  const source = !!((cl.account && cl.account.tw_shop) || rows.some(r => r.sales > 0));
  /* goals_planned false: no goal for this month; goals and plan hold an earlier month's numbers and are never shown */
  const noGoal = cl.goals_planned === false ? monthWord(cl.month || (cl.plan && cl.plan.month) || String(win.from || '').slice(0, 7)) : null;
  const g = noGoal ? {} : cl.goals || {}, p = noGoal ? null : cl.plan || null;
  const planMer = ok(g.sales) && g.spend > 0 ? g.sales / g.spend : null;
  const today = (season && season.today) || iso(new Date());

  /* Coming up and the chart note both come from the dated season phases */
  const phases = (((season && season.accounts) || [])[0] || {}).phases || [];
  const live = phases.filter(ph => ph.status !== 'skip' && ph.start);
  const coming = live.filter(ph => ph.start >= today).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3).map(ph => {
    const st = STATUS[ph.status] || ['', ''];
    return { date: ph.start, title: ph.name, sub: clip(ph.offer, 44), tone: st[0], status: st[1] };
  });
  const ended = live.filter(ph => ph.end && ph.end >= win.from && ph.end < win.to).sort((a, b) => b.end.localeCompare(a.end))[0];

  const brand = ((paid && paid.brands) || [])[0];
  const platforms = brand ? (brand.rows || []).filter(r => PLATS.includes(r.id)).map(r => ({ id: r.id, spend: r.spend ?? null, sales: r.revenue ?? null })) : null;

  /* Suggestions waiting on a yes or a no. The worker counts them itself (n_do). Without that, count the rows that
     ask for an answer (card.decide); notes that need none and loaded ads (kind launch) are left out. */
  const calls = !buy ? null : ok(buy.n_do) ? buy.n_do
    : Array.isArray(buy.rows) ? buy.rows.filter(r => r.kind !== 'launch' && r.card && r.card.decide === true).length : null;

  return {
    today, range: win, source,
    totals: { sales: t.sales ?? null, spend: t.spend ?? null, new_customers: t.new_orders ?? null, cac: t.cac ?? null, profit: costsBroken ? null : (t.cm ?? null) },
    profit_withheld: costsBroken,
    /* a plan is agreed per month, so it is only compared on "This month"; any other dates show the numbers alone */
    plan: win.preset === 'month' && p && (ok(p.sales) || ok(p.spend)) ? { sales: p.sales ?? null, spend: p.spend ?? null } : null,
    no_goal: win.preset === 'month' ? noGoal : null,
    /* the brand's own goal first; the month plan (sales over spend) only when no goal ROAS is set */
    goal: { mer: (goals && goals.roas) || planMer || null, cac: (goals && goals.cpa) || null },
    days,
    note: ended ? { date: ended.end, text: `${ended.name} ended ${dayLabel(ended.end)}` } : null,
    suggestions: isClient ? null : { meta: calls, google: null },
    coming: season ? coming : null,
    platforms,
  };
}

/* ---------- pieces ---------- */
function heroBlock(data, ctx) {
  const t = data.totals || {}, p = data.plan, days = data.days || [], g = data.goal || {};
  if (!data.source) {
    return hero({}, empty({
      title: 'No sales source connected',
      text: ctx.isClient ? 'This page fills in with sales, new customers and profit once the store is connected.' : 'Connect the store and this page fills in with sales, new customers and profit.',
      action: ctx.isClient ? null : button('Open integrations', { href: ctx.href('brand-settings', 'integrations'), icon: 'arrow' }),
    }));
  }
  const vsPlan = (actual, plan, { cost } = {}) => {
    if (!ok(actual) || !(plan > 0)) return {};
    const gap = actual / plan - 1, up = gap >= 0;
    return cost
      ? { delta: delta(gap, up ? { bad: true } : { plain: true }), sub: [(up ? ' over ' : ' under '), dl('plan to date', 'plan_to_date'), ' ' + money(plan)] }
      : { delta: delta(gap, up ? {} : { bad: true }), sub: [(up ? ' ahead of ' : ' behind '), dl('plan to date', 'plan_to_date'), ' ' + money(plan)] };
  };
  const cac = ok(t.cac) ? Math.round(t.cac) : null;
  const list = [
    { label: dl('Sales', 'sales'), value: money(t.sales), ...(data.no_goal ? { sub: 'No goal set for ' + data.no_goal } : vsPlan(t.sales, p && p.sales)), spark: days.map(d => d.sales), href: ctx.href('month', 'pace') },
    { label: dl('Ad spend', 'ad_spend'), value: money(t.spend), ...vsPlan(t.spend, p && p.spend, { cost: true }), spark: days.map(d => d.spend), href: ctx.href('platforms', 'side-by-side') },
    { label: dl('New customers', 'new_customers'), value: num(t.new_customers), small: cac != null ? money(cac) + ' each' : null,
      sub: g.cac && cac != null ? statusDot(cac <= g.cac ? 'good' : 'warn', 'goal ' + money(g.cac) + ' each') : null,
      spark: days.map(d => d.new_customers), href: ctx.href('customers', 'snapshot') },
    data.profit_withheld
      ? { label: dl('Profit after ads', 'profit_after_ads'), value: 'withheld', sub: 'the cost numbers need a check first', href: ctx.href('month', 'profit') }
      : { label: dl('Profit after ads', 'profit_after_ads'), value: money(t.profit), sub: ok(t.profit) && t.sales > 0 ? pct(t.profit / t.sales) + ' of sales' : null, spark: days.map(d => d.profit), href: ctx.href('month', 'profit') },
  ].map(k => kpi({ ...k, size: 'lg' }));
  return hero({}, kpis(list, { cols: 4 }));
}

/* One sentence, only when it adds something the tiles do not show: the best day, and a warning when ad spend runs
   ahead of sales. The tiles already carry sales, spend and the plan, so those numbers are never restated here. */
function sentence(data) {
  const t = data.totals || {}, g = data.goal || {}, days = (data.days || []).filter(d => ok(d.sales));
  const b = v => h('b', null, v);
  const best = days.length > 2 ? days.reduce((m, d) => d.sales > m.sales ? d : m, days[0]) : null;
  const mer = t.spend > 0 && ok(t.sales) ? t.sales / t.spend : null;
  const parts = [];
  if (best) parts.push('Best day was ', b(dayLabel(best.date)), '.');
  if (g.mer && mer != null && mer < g.mer) parts.push(parts.length ? ' ' : '', 'Store MER is under goal: ad spend is growing faster than sales.');
  return parts.length ? parts : null;
}

function chartCard(data, ctx) {
  const t = data.totals || {}, g = data.goal || {}, days = data.days || [];
  const mer = t.spend > 0 && ok(t.sales) ? t.sales / t.spend : null;
  const head = h('div', { class: 'lx-chart-h' },
    h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'Are sales keeping up with ad spend?')), h('p', null, 'by day, whole store')),
    legend([{ name: 'Sales', lead: true }, { name: 'Ad spend' }]));
  const gap = mer != null && g.mer ? mer - g.mer : null;
  const row = h('div', { class: 'hm-mer' },
    h('div', { class: 'n' }, h('span', { class: 'lx-cap' }, dl('Store MER', 'mer'), ', ' + rangeWords(ctx, data.range)), h('span', { class: 'lx-hero-num' }, mer != null ? x(mer) : 'no data')),
    mer != null && g.mer ? gauge({ value: mer, max: Math.max(g.mer * 1.2, mer * 1.05), goal: g.mer, ticks: [{ side: 'l', text: '0' }, { at: g.mer, text: 'goal ' + x(g.mer), on: true }] }) : null,
    gap != null ? pill(gap >= 0 ? 'good' : 'warn', x(Math.abs(gap)) + (gap >= 0 ? ' over goal' : ' under goal')) : mer != null ? pill('', 'no goal set') : null);
  const enough = days.filter(d => ok(d.sales) || ok(d.spend)).length > 1;
  const b = v => h('b', null, v);
  const plot = enough
    ? lineChart({
        series: [{ name: 'Sales', values: days.map(d => d.sales), lead: true }, { name: 'Ad spend', values: days.map(d => d.spend) }],
        labels: days.map(d => dayLabel(d.date)),
        note: data.note ? { index: days.findIndex(d => d.date === data.note.date), text: data.note.text } : null,
        endFormat: v => money(v),
        label: `Sales and ad spend by day, ${dayLabel(days[0].date)} to ${dayLabel(days[days.length - 1].date)}`,
        hover: i => { const d = days[i]; return [b(dayLabel(d.date)), h('span', null, 'Sales ', b(money(d.sales))), h('span', null, 'Ad spend ', b(money(d.spend))),
          ok(d.sales) && d.spend > 0 ? h('span', null, 'MER ', b(x(d.sales / d.spend))) : null]; },
      })
    : empty({ title: 'Not enough days yet', text: 'The chart draws once there are two days of numbers.' });
  return card({}, head, row, plot);
}

/* Suggestions waiting on a yes or a no: one quiet strip under "Needs you", only the platforms with something waiting. */
function suggestStrip(data, ctx) {
  const sg = data.suggestions || {};
  const word = id => id === 'meta' ? 'Meta' : 'Google';
  const rows = ['meta', 'google'].filter(id => sg[id] > 0).map(id => h('a', { href: ctx.href(id, 'suggestions'), title: 'Open ' + word(id) + ' suggestions' },
    platformChip(id), h('span', null, num(sg[id]) + ' suggestion' + (sg[id] === 1 ? '' : 's'))));
  if (!rows.length) return null;
  return h('section', { class: 'hm-sug', role: 'note' }, h('b', null, 'Waiting on your yes'), ...rows);
}

/* What works in new Locus: one line, dismissed on this device (the same key as the My day note). */
const NOTE_KEY = 'lx5_live_note_v1';
function liveStrip(ctx) {
  if (ctx.isClient || ctx.role === 'client') return null;
  try { if (localStorage.getItem(NOTE_KEY) === '1') return null; } catch { /* storage off: show it */ }
  const box = h('section', { class: 'hm-live', role: 'note' },
    h('span', null, h('b', null, 'New ' + APP_NAME + ': '), 'ad calls, client updates, the War Room, creative and loading ads work here. Calendar edits, offers and meetings are still in old ' + APP_NAME + '.'),
    h('span', { class: 'sp' }),
    h('a', { href: OLD_LOCUS }, 'Open old ' + APP_NAME),
    button('Got it', { onclick: () => { try { localStorage.setItem(NOTE_KEY, '1'); } catch { /* hide for now */ } box.remove(); } }));
  return box;
}

function comingCard(data, ctx) {
  const list = data.coming, today = data.today || iso(new Date());
  const soon = asDate(today).getTime() + 7 * 864e5;
  const body = !list ? h('p', { class: 'hm-quiet' }, 'The calendar could not be read.')
    : !list.length ? h('p', { class: 'hm-quiet' }, 'Nothing dated in the next few weeks.')
    : h('div', { class: 'hm-up' }, list.map((it, i) => h('div', null,
        dateBlock(it.date, { now: i === 0 && asDate(it.date).getTime() <= soon, month: it.date.slice(0, 7) !== today.slice(0, 7) }),
        h('span', { class: 't' }, h('b', null, it.title), it.sub ? h('span', null, it.sub) : null),
        it.status ? statusDot(it.tone, it.status) : null)));
  return card({ title: 'Coming up', flush: true, action: h('a', { href: ctx.href('calendar', 'index') }, 'All dates') }, body);
}

function grade(roas, goal) {
  if (!ok(roas) || !goal) return null;
  const r = roas / goal;
  return r >= 1 ? ['good', 'At goal'] : r >= 0.8 ? ['warn', 'Close'] : r >= 0.6 ? ['warn', 'Under'] : ['bad', 'Far under'];
}
function platformCard(data, ctx) {
  const list = data.platforms, g = data.goal || {}, t = data.totals || {};
  const link = h('a', { href: ctx.href('platforms', 'side-by-side') }, 'Side by side');
  if (!list || !list.length) {
    return card({ title: 'By platform', action: link },
      empty({ title: list ? 'No ad platform has spent on these dates' : 'Platform numbers could not be read',
        text: !list ? 'Open Side by side for the full table.' : ctx.isClient ? 'Each ad platform shows here against the goal once it has spent.' : 'Connect Meta or Google in Brand settings and each one shows here against the goal.' }));
  }
  const rows = list.map(r => {
    const paidRow = r.spend > 0, roas = paidRow && ok(r.sales) ? r.sales / r.spend : null;
    return { ...r, paidRow, roas, grade: grade(roas, g.mer), fillTone: (grade(roas, g.mer) || [])[0] };
  });
  const mer = t.spend > 0 && ok(t.sales) ? t.sales / t.spend : null, mg = grade(mer, g.mer);
  const total = { total: true, spend: t.spend, sales: t.sales, roas: mer, paidRow: true, grade: mg && [mg[0] === 'bad' ? 'bad' : mg[0] === 'good' ? 'good' : 'warn', mg[1]], fillTone: '' };
  const bar = r => ok(r.roas) && g.mer ? h('span', { class: 'hm-g' + (r.total ? ' hm-total' : '') }, gauge({ value: r.roas, max: g.mer * 1.2, goal: g.mer, tone: r.fillTone, thin: true })) : '';
  const name = r => r.total ? 'Whole store' : platformChip(r.id);
  const spend = r => r.paidRow ? money(r.spend) : h('span', { class: 'dim' }, 'no ad spend');
  const roasText = r => r.total ? (ok(r.roas) ? h('span', null, dl('MER', 'mer'), ' ' + x(r.roas)) : 'no data') : r.paidRow ? x(r.roas) : '';
  const stat = r => r.grade ? statusDot(r.grade[0], r.grade[1]) : '';
  const wide = h('div', { class: 'hm-wide' }, table({
    roomy: true, total,
    cols: [
      { key: 'id', label: 'Platform', class: 'name', render: name },
      { key: 'spend', label: 'Spend', num: true, render: spend },
      { key: 'sales', label: dl('Sales from its ads', 'sales_from_its_ads'), num: true, render: r => money(r.sales) },
      { key: 'roas', label: dl('ROAS', 'roas'), num: true, class: 'strong', render: roasText },
      { key: 'bar', label: g.mer ? 'Against the store goal ' + x(g.mer) : '', width: 270, render: bar },
      { key: 'st', label: 'Status', width: 120, render: stat },
    ],
    rows,
  }));
  const cell = (label, v) => h('span', null, h('small', null, label), h('b', null, v));
  const narrow = h('div', { class: 'hm-plats' }, [...rows, total].map(r => h('div', { class: r.total ? 'tot' : '' },
    h('div', { class: 'top' }, r.total ? h('b', null, 'Whole store') : platformChip(r.id), stat(r) || null),
    h('div', { class: 'nums' }, cell('Spend', spend(r)), cell(r.total ? 'Sales' : 'Sales from its ads', money(r.sales)), cell(r.total ? 'MER' : 'ROAS', r.total ? x(r.roas) : r.paidRow ? x(r.roas) : h('span', { class: 'dim' }, 'none'))),
    bar(r) ? h('div', { class: r.total ? 'hm-total' : '' }, gauge({ value: r.roas, max: g.mer * 1.2, goal: g.mer, tone: r.fillTone, thin: true })) : null)));
  const names = rows.map(r => platformChip(r.id).textContent).join(', ');
  return card({ title: 'By platform', note: names, flush: true, action: link, class: 'hm-byp' }, wide, narrow);
}

/* ---------- the page ---------- */
const WORDS = { month: 'this month?', '7d': 'in the last 7 days?', '30d': 'in the last 30 days?', 'last-month': 'last month?', custom: 'on these dates?' };

export default {
  /* the plain question, drawn by the shell above the tabs */
  title: ctx => (ctx.brand ? ['How is ' + ctx.brand.name + ' doing ', em(WORDS[ctx.range.preset] || WORDS.month)] : 'Home'),
  eyebrow: 'Home',

  async load(ctx) {
    if (!ctx.brand) return null;
    /* act is the brand id from the brands endpoint (brand_...). The dates come from the page head. */
    const id = encodeURIComponent(ctx.brand.id), win = { from: ctx.range.from, to: ctx.range.to, preset: ctx.range.preset }, sig = { signal: ctx.signal };
    const isClient = ctx.isClient;
    const soft = p => p.catch(e => { if (e && e.name === 'AbortError') throw e; return null; });
    const goal = async name => { if (isClient) return null; const v = +(await ctx.setting('brand:' + ctx.brand.id + '.' + name, null)); return v > 0 ? v : null; };
    const [cl, paid, ov, buy, season, roas, cpa] = await Promise.all([
      ctx.api(`/api/client?act=${id}&from=${win.from}&to=${win.to}`, sig),
      soft(ctx.api(`/api/hub/paid?platform=all&act=${id}&from=${win.from}&to=${win.to}&cmp=none`, sig)),
      soft(ctx.api('/api/overview?days=7&cmp=none&series=0', sig)),
      isClient ? null : soft(ctx.api(`/api/buyer-list?act=${id}`, { worker: 'ah', ...sig })),
      soft(ctx.api(`/api/season?act=${id}`, sig)),
      goal('target_roas'), goal('target_cpa'),
    ]);
    return shape({ win, cl, paid, ov, buy, season, goals: { roas, cpa }, isClient });
  },

  render(el, data, ctx) {
    styles();
    if (!ctx.brand) return put(el, empty({ title: 'Pick a brand', text: 'Home shows one brand at a time. Choose one from the switcher at the top.' }));
    if (!data) return put(el, empty({ title: 'No numbers yet', text: 'This brand has nothing to show for these dates yet.' }));
    const say = data.source ? sentence(data) : null;
    const team = !ctx.isClient && data.suggestions;
    const title = 'How is ' + ctx.brand.name + ' doing';
    put(el, ...[
      helpBar([
        { title: 'What it is for', text: 'How ' + ctx.brand.name + ' is doing on the dates at the top of the page: sales, ad spend, new customers and profit, then each ad platform against the store goal.' },
        { title: 'Where the numbers come from', text: 'Sales are store sales less tax, from Triple Whale. Store MER is whole store sales over all ad spend. Each platform\'s sales are the ones Triple Whale credits to it, last click. Hover or tap any dotted label for its meaning.' },
        { title: 'Plan to date', text: 'On This month the tiles compare with the month plan split evenly over the days so far. On any other dates there is no plan comparison.' },
      ], h('span', { class: 'bz-chip' }, rangeWords(ctx, data.range) + ', whole store')),
      heroBlock(data, ctx),
      liveStrip(ctx),            /* team only: one line on what works in new Locus; "Got it" hides it on this device */
      homeNotices(ctx),          /* rows an automation left for this person; hidden when there are none */
      team ? suggestStrip(data, ctx) : null,
      say ? takeaway(say, { action: ctx.isClient ? null : askWhy(ctx, title) }) : null,
      data.source ? chartCard(data, ctx) : null,
      comingCard(data, ctx),
      data.source || (data.platforms && data.platforms.length) ? platformCard(data, ctx) : null,
    ].filter(Boolean));
  },
};
