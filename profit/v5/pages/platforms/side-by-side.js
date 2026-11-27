/* Ads > All platforms > Side by side.
   One equal row per ad platform (glyph and name, spend, share, sales, ROAS against goal, cost),
   the whole store as the last row (MER), and ad spend a day against the plan.
   Spend is each platform's own number. Sales per platform are Triple Whale, last platform click.
   Window: this month so far, through yesterday. */

import { put } from '../../kit.js';
import { def, defOn, headRow } from './_ads.js';
import { h, em, svgNode, money, pct, x, button, platformChip, statusDot, delta, takeaway, card, legend, lineChart, gauge, table, empty, addStyles, handEm, kpi, tiles } from '../../kit.js';
import { icon, PLATFORM_NAME } from '../../icons.js';
import { askWhy } from '../home/_biz.js';

/* ---------- dates ---------- */
const day = d => new Date(d + 'T12:00:00');
const shortDay = d => day(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
function windowText(w) {
  if (!w || !w.from || !w.to) return '';
  const a = day(w.from), b = day(w.to);
  return a.getMonth() === b.getMonth() ? `${shortDay(w.from)} to ${b.getDate()}` : `${shortDay(w.from)} to ${shortDay(w.to)}`;
}

/* ---------- real mode ---------- */
const PAID = ['meta', 'google', 'amazon', 'tiktok', 'pinterest'];
const sumOf = (rows, f) => { let t = 0, any = false; for (const r of rows) { const v = f(r); if (v != null && isFinite(v)) { t += v; any = true; } } return any ? t : null; };

async function load(ctx) {
  const act = ctx.brand && ctx.brand.id;
  if (!act) return { connected: false, no_brand: true };
  const w = ctx.range;                                 // the dates in the page head
  const q = `from=${w.from}&to=${w.to}`;
  const opt = { signal: ctx.signal };
  const soft = p => p.catch(e => { if (e && (e.name === 'AbortError' || e.status === 401)) throw e; return null; });
  const [client, overview, accounts, calls] = await Promise.all([
    ctx.api(`/api/client?act=${encodeURIComponent(act)}&${q}`, opt),                       // the store by day, the plan
    soft(ctx.api(`/api/overview?${q}&cmp=none`, opt)),                                    // the platform split
    soft(ctx.api('/api/accounts', { ...opt, worker: 'ah' })),                             // the goal ROAS
    ctx.isClient ? null : soft(ctx.api(`/api/buyer-list?act=${encodeURIComponent(act)}&ads=0`, { ...opt, worker: 'ah' })),
  ]);
  const rows = (client.rows || []).filter(r => r.date >= client.from && r.date <= client.to);
  const tot = client.totals || {};
  const ov = overview && (overview.accounts || []).find(a => a.act_id === act || a.name === ctx.brand.name);
  const acct = accounts && (accounts.accounts || []).find(a => a.act_id === act || a.id === act || a.name === ctx.brand.name);
  const hasSales = !!(client.account && client.account.tw_shop) && tot.sales != null;
  const ch = (ov && ov.channels) || [];
  let platforms = ch.filter(c => PAID.includes(c.id) && c.spend > 0).map(c => ({
    id: c.id, spend: c.spend, sales: hasSales ? c.revenue : null, roas: hasSales ? c.roas : null, cost: hasSales ? c.cpa : null,
  }));
  if (!platforms.length) {                                                                // the split did not load: the store rows still know Meta and Google
    for (const [id, v] of [['meta', tot.meta_spend], ['google', tot.google_spend]]) if (v > 0) platforms.push({ id, spend: v, sales: null, roas: null, cost: null, no_split: true });
  }
  const email = ch.find(c => c.id === 'email');
  const plan = client.plan || null, goals = client.goals || {};
  /* a plan is agreed per month, so it is only compared on "This month" */
  const planDay = w.preset === 'month' && plan && plan.month && plan.month.spend != null && plan.days_in_month ? plan.month.spend / plan.days_in_month : null;
  /* the worker's own count of rows waiting on a yes or a no; without it, the rows that ask for an answer */
  const metaCalls = !calls ? null : calls.n_do != null && isFinite(calls.n_do) ? calls.n_do
    : Array.isArray(calls.rows) ? calls.rows.filter(r => r.kind !== 'launch' && r.card && r.card.decide === true).length : null;
  return {
    window: { from: client.from, to: client.to },
    connected: platforms.length > 0 || tot.spend > 0,
    sales_source: hasSales, sales_source_name: 'Triple Whale',
    spend: tot.spend ?? null,
    plan_spend: planDay != null ? planDay * rows.length : null,
    sales: hasSales ? tot.sales : null,
    mer: hasSales ? tot.mer : null,
    goal_mer: goals.sales != null && goals.spend ? goals.sales / goals.spend : null,
    goal_roas: acct && +acct.target_roas > 0 ? +acct.target_roas : null,
    store_cost: hasSales && tot.orders > 0 && tot.spend != null ? tot.spend / tot.orders : null,
    cost_kind: 'sale',
    suggestions: metaCalls != null ? { meta: metaCalls, google: null } : null,
    platforms,
    email: hasSales && email && email.revenue != null ? { sales: email.revenue } : null,
    daily: {
      dates: rows.map(r => r.date),
      total: rows.map(r => r.spend ?? null),
      sales: hasSales ? rows.map(r => r.sales ?? null) : null,
      meta: rows.some(r => r.meta_spend > 0) ? rows.map(r => r.meta_spend ?? null) : null,
      plan_day: planDay, note: null,
    },
  };
}

/* ---------- local parts (see Kit gaps in the build notes) ---------- */
const CSS = `
.sbs{display:grid;gap:var(--sp-8)}
.sbs-kpi{display:grid;gap:4px;align-content:start;min-width:0;color:inherit;text-decoration:none}
.sbs-kpi .lx-hero-num{justify-self:start;margin-top:2px}
.sbs-kpi .v.words{font-size:15px;font-weight:500;letter-spacing:0;line-height:1.3;white-space:normal;color:var(--ink-2);padding:8px 0}
.sbs-pl{display:inline-flex;align-items:center;gap:10px}
.sbs-pl small{display:inline-flex;font-size:12.5px;color:var(--muted)}
.sbs-pl small .lx-plat{font-size:12.5px;font-weight:400;color:var(--muted);gap:6px}
.sbs-pl small .lx-ic{width:15px;height:15px}
.sbs-sp{display:grid;justify-items:end;gap:4px}
.sbs-sp small{font-size:11.5px;color:var(--muted)}
.sbs-sp .lx-cellbar{display:block;width:72px;margin:0}
.sbs-wide .lx-table{table-layout:auto}
.sbs-wide .lx-table td.name{width:30%}
.sbs-q{color:var(--muted);font-weight:400}
.sbs-open{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;color:var(--muted)}
.sbs-open:hover{background:var(--bg-sunk);color:var(--ink)}
.sbs-open .lx-ic{width:16px;height:16px;stroke-width:2;transform:rotate(-90deg)}
.sbs-wide .lx-table .g{padding-left:22px}
.sbs-wide tr.total .lx-gauge-track{background:var(--line-strong)}
.sbs-wide tr.total .lx-gauge .goal{box-shadow:0 0 0 1.5px var(--band)}
.sbs-list{display:none}
.sbs-chart{padding:28px 32px 20px}
@media (max-width:759px){
  .sbs{gap:var(--sp-5)}
  .sbs-wide{display:none}
  .sbs-list{display:block}
  .sbs-item{display:grid;gap:12px;padding:16px 18px;border-top:1px solid var(--line);color:inherit;text-decoration:none}
  .sbs-item.total{background:var(--band)}
  .sbs-item-h{display:flex;align-items:center;gap:10px;min-width:0}
  .sbs-item-h b{font-size:15px;font-weight:600}
  .sbs-item-h>.sbs-q{font-size:12.5px;white-space:nowrap}
  .sbs-item-h .sbs-pl{gap:4px 8px;min-width:0;flex-wrap:wrap}
  .sbs-item-h .sbs-open{margin-left:auto;margin-right:-6px}
  .sbs-figs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
  .sbs-figs span{display:grid;gap:2px;min-width:0}
  .sbs-figs small{font-size:12px;color:var(--muted)}
  .sbs-figs b{font-size:16px;font-weight:600;letter-spacing:-.015em;font-variant-numeric:tabular-nums;white-space:nowrap}
  .sbs-figs b.sbs-q{font-size:13px;font-weight:400;white-space:normal;letter-spacing:0}
  .sbs-item .lx-gauge-ticks{margin-top:2px}
  .sbs-item.total .lx-gauge-track{background:var(--line-strong)}
  .sbs .lx-card.flush>.lx-sec{flex-wrap:wrap}
  .sbs .lx-card.flush>.lx-sec .act{margin-left:0;width:100%;order:4}
  .sbs .lx-card.flush>.lx-sec .act .lx-btn{width:100%;height:44px;justify-content:center}
  .sbs-chart{padding:18px 14px 12px}
}`;
function style() {
  addStyles('sbs-css', CSS);
}

const quiet = text => h('span', { class: 'sbs-q' }, text);
const tone = (roas, goal) => goal == null || roas == null ? '' : roas >= goal ? 'good' : roas >= goal * 0.8 ? 'warn' : 'bad';
/* the goal tick sits at the same place on every row, so the rows can be read down the column */
const against = (value, goal, t) => value == null ? null : gauge({ value, goal, max: goal ? goal * 1.6 : Math.max(value * 1.2, 1), tone: t, thin: true });

/* ---------- the page ---------- */
function render(el, data, ctx) {
  style();
  const team = !ctx.isClient;
  if (!data || !data.connected) {
    put(el, empty({
      title: 'No ad platform connected',
      text: 'When Meta, Google, TikTok or Amazon is connected for this brand, each one gets a row here.',
      action: team && ctx.brand ? button('Open integrations', { primary: true, href: ctx.href('brand-settings', 'integrations'), icon: 'arrow' }) : null,
    }));
    return;
  }
  const d = data, hasSales = d.sales_source !== false;
  const noSales = () => quiet('No sales source connected');
  const paidSpend = d.platforms.reduce((t, p) => t + (p.spend || 0), 0);
  const share = p => paidSpend > 0 && p.spend != null ? p.spend / paidSpend : null;
  const bySpend = [...d.platforms].sort((a, b) => (b.spend || 0) - (a.spend || 0));
  const top = bySpend[0], second = bySpend[1];
  const sug = d.suggestions ? [['meta', d.suggestions.meta], ['google', d.suggestions.google]].filter(v => v[1] != null) : [];
  const sugTotal = sug.reduce((t, v) => t + v[1], 0);
  const sugHref = ctx.href((sug.find(v => v[1] > 0) || ['meta'])[0], 'suggestions');
  const costLabel = d.cost_kind === 'new_customer' ? def('New customer cost', 'ncpa') : def('Cost per sale', 'cpa');

  /* --- the figures: every tile with its daily line, or none (one lone line stretches the row). The suggestion count is
     the Platform by platform card's button, so it is not a tile of its own. --- */
  const over = d.plan_spend > 0 && d.spend != null ? d.spend / d.plan_spend - 1 : null;
  const wl = windowText(d.window), TW = d.sales_source_name || 'Triple Whale';
  const dl = d.daily || {}, nd = dl.dates ? dl.dates.length : 0, labels = nd > 1 ? dl.dates.map(shortDay) : null;
  const ser = labels ? {
    spend: dl.total && dl.total.length === nd ? dl.total : null,
    mer: hasSales && dl.sales && dl.sales.length === nd ? dl.sales.map((v, i) => (v != null && dl.total[i] > 0 ? v / dl.total[i] : null)) : null,
    share: top && top.id === 'meta' && dl.meta && dl.meta.length === nd ? dl.meta.map((v, i) => (v != null && dl.total[i] > 0 ? v / dl.total[i] : null)) : null,
  } : {};
  const all = !!(ser.spend && (ser.mer || !hasSales) && (ser.share || !top));
  const sp = (key, fmt) => (all && ser[key] ? { spark: ser[key], sparkLabels: labels, sparkFormat: fmt } : {});
  const figures = [
    kpi({ label: 'Total ad spend', value: money(d.spend), href: ctx.href('month', 'pace'), window: wl, source: 'each platform',
      sub: over == null ? 'no spend plan set'
        : Math.abs(over) < 0.005 ? `on plan ${money(d.plan_spend)}`
        : [delta(over, { bad: over > 0, plain: over < 0 }), `${over > 0 ? 'over' : 'under'} plan ${money(d.plan_spend)}`],
      ...sp('spend', v => money(v)) }),
    kpi({ label: h('span', null, def('MER', 'mer'), ', whole store'), value: hasSales ? x(d.mer) : 'No sales source connected', href: ctx.href('month', 'pace'), window: wl, source: hasSales ? TW : null,
      sub: hasSales && d.goal_mer != null ? statusDot(d.mer >= d.goal_mer ? 'good' : d.mer >= d.goal_mer * 0.6 ? 'warn' : 'bad', 'goal ' + x(d.goal_mer)) : hasSales ? 'no goal set' : '',
      ...sp('mer', v => x(v)) }),
    top ? kpi({ label: `${PLATFORM_NAME[top.id] || top.id} share of ad spend`, value: pct(share(top)), href: ctx.href(top.id, 'overview'), window: wl, source: 'each platform',
      sub: second ? `${PLATFORM_NAME[second.id] || second.id} ${pct(share(second))}` : 'the only platform spending', ...sp('share', v => pct(v)) }) : null,
  ].filter(Boolean);
  const heroBand = tiles(figures, { cols: figures.length === 3 ? 3 : figures.length === 2 ? 2 : 4 });
  ctx.askWindow = wl || null;
  ctx.askContext = `All ad platforms for ${ctx.brand ? ctx.brand.name : 'this brand'}, ${wl}: total ad spend ${money(d.spend)}` + (hasSales ? `, whole store MER ${x(d.mer)} (Triple Whale)` : '') + '. ' + bySpend.map(p => `${PLATFORM_NAME[p.id] || p.id} spend ${money(p.spend)}${p.roas != null ? ', ROAS ' + x(p.roas) : ''}`).join('; ') + '.';

  /* --- the one sentence --- */
  const take = headRow({ ask: team ? askWhy(ctx, 'How do the ad platforms compare, and why?') : null, help: [
    { title: 'What it is for', text: 'Every ad platform side by side for the dates in the page head: spend, sales from its ads, ROAS against the goal and the cost per sale. Tap a platform to open it.' },
    { title: 'Where the numbers come from', text: `Spend is each platform's own number. ${hasSales ? 'Sales per platform are Triple Whale, last platform click, so platforms can overlap. ' : ''}ROAS is one platform; MER is the whole store.` },
  ] });

  /* --- one equal row per platform --- */
  const chip = r => h('span', { class: 'sbs-pl' }, platformChip(r.id, { chip: true }),
    r.with === 'youtube' ? h('small', null, platformChip('youtube', { label: 'with YouTube' })) : null);
  const open = r => h('a', { class: 'sbs-open', href: r.href, 'aria-label': 'Open ' + r.name }, svgNode(icon('chevron')));
  const rows = d.platforms.map(p => ({ ...p, name: PLATFORM_NAME[p.id] || p.id, share: share(p), tone: tone(p.roas, d.goal_roas), goal: d.goal_roas, href: ctx.href(p.id, 'overview') }));
  if (d.email) rows.push({ id: 'email', name: PLATFORM_NAME.email, spend: null, sales: d.email.sales, roas: null, cost: null, email: true, href: ctx.href('email', 'snapshot') });
  const total = { total: true, name: 'Whole store', spend: d.spend, sales: d.sales, roas: d.mer, cost: d.store_cost, goal: d.goal_mer, tone: '' };

  const cSpend = r => r.email ? quiet('no ad cost') : money(r.spend);
  const cSales = r => !hasSales ? noSales() : r.sales == null ? quiet('not tracked') : money(r.sales);
  const cRoas = r => r.email ? quiet('no ads') : !hasSales ? quiet('no data') : r.roas == null ? quiet('no data') : (r.total ? 'MER ' : '') + x(r.roas);
  const cCost = r => r.email ? '' : !hasSales ? '' : r.cost == null ? (r.total ? '' : quiet('not tracked')) : money(r.cost);
  const wide = table({
    roomy: true, rowHeight: 68, total, sort: { key: 'spend', dir: 'desc' },
    cols: [
      { key: 'name', label: 'Platform', class: 'name', render: r => r.total ? r.name : chip(r) },
      { key: 'spend', label: 'Spend, share', num: true, sortable: true, value: r => r.spend ?? -1,
        render: r => r.share == null ? cSpend(r) : h('span', { class: 'sbs-sp' }, h('span', null, cSpend(r)), h('span', { class: 'lx-cellbar', style: { '--v': (r.share * 100).toFixed(1) + '%' } }), h('small', null, pct(r.share) + ' of spend')) },
      { key: 'sales', label: 'Sales from its ads', num: true, sortable: true, value: r => r.sales ?? -1, render: cSales },
      { key: 'roas', label: def('ROAS', 'roas'), num: true, sortable: true, class: 'strong', value: r => r.roas ?? -1, render: cRoas },
      { key: 'goal', label: def(d.goal_roas != null ? 'Against goal ' + x(d.goal_roas) : 'Against goal', 'goal_roas'), class: 'g hide-md', render: r => r.email || !hasSales ? '' : against(r.roas, r.goal, r.tone) },
      { key: 'cost', label: costLabel, num: true, render: cCost },
      { key: 'open', label: '', width: 36, num: true, render: r => r.total ? '' : open(r) },
    ],
    rows,
    onRow: (r, _i, e) => { if (!e.target.closest('a')) location.hash = r.href; },
  });
  const fig = (label, node) => h('span', null, h('small', null, label), typeof node === 'string' ? h('b', null, node) : h('b', { class: 'sbs-q' }, node.textContent));
  const item = r => h(r.total ? 'div' : 'a', { class: 'sbs-item' + (r.total ? ' total' : ''), href: r.total ? null : r.href },
    h('div', { class: 'sbs-item-h' }, r.total ? h('b', null, r.name) : chip(r), r.share != null ? quiet(pct(r.share) + ' of spend') : null, r.total ? null : h('span', { class: 'sbs-open' }, svgNode(icon('chevron')))),
    h('div', { class: 'sbs-figs' }, fig('Spend', cSpend(r)), fig('Sales', cSales(r)), fig(r.total ? 'MER' : 'ROAS', r.total && hasSales && r.roas != null ? x(r.roas) : cRoas(r))),
    r.email || !hasSales || r.roas == null ? null : against(r.roas, r.goal, r.tone));
  const list = h('div', { class: 'sbs-list' }, [...rows].sort((a, b) => (b.spend ?? -1) - (a.spend ?? -1)).map(item), item(total));
  const note = [windowText(d.window), hasSales ? `spend each platform, sales and ROAS ${d.sales_source_name || 'Triple Whale'}, last click` : 'No sales source connected'].filter(Boolean).join(' · ');
  const platforms = card({
    title: 'Platform by platform', note, flush: true,
    action: team && sugTotal > 0 ? button(`Review ${sugTotal} suggestion${sugTotal === 1 ? '' : 's'}`, { primary: true, href: sugHref, icon: 'arrow' }) : null,
  }, h('div', { class: 'sbs-wide' }, wide), list);

  /* --- ad spend a day against the plan --- */
  let chart = null;
  if (d.daily && d.daily.dates && d.daily.dates.length > 1) {
    const dl = d.daily, hasPlan = dl.plan_day != null;
    const label = `Ad spend by day, ${windowText({ from: dl.dates[0], to: dl.dates[dl.dates.length - 1] })}, all platforms${dl.meta ? ' and Meta' : ''}${hasPlan ? ', against the daily plan' : ''}`;
    const bb = v => h('b', null, v);
    chart = h('section', { class: 'lx-card sbs-chart' },
      h('div', { class: 'lx-chart-h' },
        h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'Ad spend by day')), h('p', null, 'All platforms, each platform\'s own spend' + (hasPlan ? ', against the daily plan' : ''))),
        legend([{ name: 'All platforms', lead: true }, dl.meta && { name: 'Meta' }, hasPlan && { name: 'Plan a day', dashed: true }])),
      lineChart({
        series: [{ name: 'All platforms', lead: true, values: dl.total }, dl.meta && { name: 'Meta', values: dl.meta }],
        labels: dl.dates.map(shortDay),
        goal: hasPlan ? { value: dl.plan_day, label: `Plan ${money(dl.plan_day)} a day`, at: 'start' } : null,
        note: dl.note ? { index: dl.dates.indexOf(dl.note.date), text: dl.note.text } : null,
        format: v => money(v, { compact: true }), endFormat: v => money(v),
        height: 330, label, empty: 'No ad spend for these dates', windowLabel: 'Daily, ' + windowText({ from: dl.dates[0], to: dl.dates[dl.dates.length - 1] }), name: 'Spend',
        hover: i => [bb(shortDay(dl.dates[i])), h('span', null, 'All platforms ', bb(money(dl.total[i]))), dl.meta ? h('span', null, 'Meta ', bb(money(dl.meta[i]))) : null],
      }));
  }

  put(el, h('div', { class: 'sbs' }, take, heroBand, platforms, chart));
}

export default {
  /* the plain question, drawn by the shell above the tabs */
  title: 'All platforms',
  eyebrow: 'All platforms',
  load, render,
};
