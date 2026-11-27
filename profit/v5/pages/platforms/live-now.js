/* Ads > All platforms > Live now, for one brand: every ad platform today, side by side.
   Four figures for the store today, one equal row per platform (spend so far, against a usual day, sales from
   its ads, ROAS), then today's store sales hour by hour against a usual day. About today, so the date range
   in the page head is hidden. Read only: a row opens a sheet, nothing is changed.

   Spend is each platform's own number. Sales per platform are Triple Whale, last platform click, and are
   left blank (never a zero) until Triple Whale has credited today's orders.

   Real mode reads (GET only):
     profit          /api/hub/live?act=                                   the store today: sales, ad spend, orders
     profit          /api/hub/paid?platform=all&act=&from=today&to=today  spend and Triple Whale sales per platform, today
     profit          /api/hub/paid?platform=all&act=&from=-7d&to=-1d      the last 7 days per platform (a usual day, ROAS)
     account-health  /api/pacing?act=                                     Meta spend by hour today and on a usual day
     profit          /api/season/war?act=&live=1                          store sales by hour today and a usual day's curve
   No route gives Google, TikTok or Amazon spend by the hour, so "against a usual day by now" is judged for Meta only;
   the other platforms show the day so far against their usual whole day. */

import { put } from '../../kit.js';
import { h, em, svgNode, card, kpi, kpis, tiles, table, gauge, lineChart, legend, statusDot, platformChip, sheet, button, empty, skeleton, money, num, x, addStyles } from '../../kit.js';
import { icon, PLATFORM_NAME } from '../../icons.js';
import { def, headRow } from './_ads.js';

const CSS = `
.pl{display:grid;gap:var(--sp-8);min-width:0}
.pl-q{color:var(--muted);font-weight:400}
.pl-use{display:grid;gap:5px;min-width:150px}
.pl-use small{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.pl-open{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;color:var(--muted)}
.pl-open .lx-ic{width:16px;height:16px;stroke-width:2;transform:rotate(-90deg)}
.pl-wide tr{cursor:pointer}
.pl-list{display:none}
.pl-chart{padding:28px 32px 20px}
.pl-big{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:2px 0 10px}
.pl-big b{font-size:var(--num-l);font-weight:600;letter-spacing:-.03em;line-height:1.1;font-variant-numeric:tabular-nums}
.pl-big span{color:var(--muted);font-size:13.5px}
.pl-kv{display:grid}
.pl-kv>div{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:12px 0;border-top:1px solid var(--line);font-size:14px}
.pl-kv>div:first-child{border-top:0}
.pl-kv small{font-size:13px;color:var(--muted)}
.pl-kv b{font-weight:600;font-variant-numeric:tabular-nums;text-align:right}
.pl-kv b.pl-q{font-weight:400;font-size:13px}
@media (max-width:759px){
  .pl{gap:var(--sp-5)}
  .pl-wide{display:none}
  .pl-list{display:block}
  button.pl-item{display:grid;gap:12px;width:100%;padding:16px 18px;border:0;border-top:1px solid var(--line);background:transparent;font:inherit;color:inherit;text-align:left;cursor:pointer}
  .pl-item.total{background:var(--band)}
  .pl-item-h{display:flex;align-items:center;gap:10px;min-width:0}
  .pl-item-h>b{font-size:15px;font-weight:600}
  .pl-item-h .lx-stat{font-size:12.5px}
  .pl-item-h .pl-open{margin-left:auto;margin-right:-6px}
  .pl-figs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
  .pl-figs span{display:grid;gap:2px;min-width:0}
  .pl-figs small{font-size:12px;color:var(--muted)}
  .pl-figs b{font-size:16px;font-weight:600;letter-spacing:-.015em;font-variant-numeric:tabular-nums;white-space:nowrap}
  .pl-figs b.pl-q{font-size:13px;font-weight:400;white-space:normal;letter-spacing:0}
  .pl-chart{padding:18px 14px 12px}
}`;

const ok = n => n != null && isFinite(n);
const usd = (n, cur) => money(ok(n) ? Math.round(n) : n, { cur });
const div = (a, b) => (ok(a) && ok(b) && b > 0 ? a / b : null);
const hourWord = hr => (hr % 24 === 0 ? '12am' : hr === 12 ? 'Noon' : hr < 12 ? hr + 'am' : (hr - 12) + 'pm');
const quiet = text => h('span', { class: 'pl-q' }, text);
const PAID = ['meta', 'google', 'tiktok', 'amazon', 'pinterest'];
const platName = id => PLATFORM_NAME[id] || id;
const ymd = d => d.toISOString().slice(0, 10);
const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };

/* ---------- load: real mode ---------- */
async function load(ctx) {
  if (!ctx.brand) return { no_brand: true };
  const act = encodeURIComponent(ctx.brand.id);
  const soft = p => p.catch(e => { if (e && (e.name === 'AbortError' || e.status === 401)) throw e; return null; });
  const get = (path, worker) => soft(ctx.api(path, { worker: worker || 'profit', signal: ctx.signal }));
  /* "today" is the brand's own day: the pacing and the season reads both say which day that is */
  const [pace, war, live] = await Promise.all([get(`/api/pacing?act=${act}`, 'ah'), get(`/api/season/war?act=${act}&live=1`), get(`/api/hub/live?act=${act}`)]);
  const L = war && war.live && !war.live.error ? war.live : null;
  const today = (pace && pace.today) || (L && L.date) || (war && war.today) || ymd(new Date());
  const paid = (from, to) => get(`/api/hub/paid?platform=all&act=${act}&from=${from}&to=${to}&cmp=none`);
  /* the goal ROAS lives on the account-health brand row (the brand in the switcher carries only id and name) */
  const goalRoas = ctx.isClient ? null : ctx.setting('brand:' + ctx.brand.id + '.target_roas', null);
  const [td, wk, goal] = await Promise.all([paid(today, today), paid(addDays(today, -7), addDays(today, -1)), goalRoas]);
  const tb = td && td.brands && td.brands[0], wb = wk && wk.brands && wk.brands[0];
  const st = live && live.brands && live.brands[0];
  if (!tb && !wb && !st && !pace) return { connected: false };

  const pending = !!(tb && tb.paid && tb.paid.attr_pending);
  const tRow = id => ((tb && tb.rows) || []).find(r => r.id === id) || {}, wRow = id => ((wb && wb.rows) || []).find(r => r.id === id) || {};
  /* Is there a sales source? Only from something that is truly missing for a brand with no store connected:
     the live store read carries a sales figure, or the season read does not flag no_sales and has sales, or
     Triple Whale credited real money today or in the last 7 days. /api/hub/paid sends brand.revenue 0 (a number,
     never null) for a brand with no store, so a zero there is not a source. */
  const noSalesFlag = !!(L && L.today && L.today.no_sales);
  const hasSales = !noSalesFlag && (!!(st && ok(st.sales)) || !!(tb && tb.revenue > 0) || !!(wb && wb.revenue > 0) || !!(L && L.today && L.today.sales > 0));
  const metaNow = pace && !pace.error && ok(pace.spent) ? pace : null;
  const platforms = PAID.filter(id => tRow(id).spend > 0 || wRow(id).spend > 0 || (id === 'meta' && metaNow)).map(id => {
    const t = tRow(id), w = wRow(id), m = id === 'meta' ? metaNow : null;
    const spend = m ? m.spent : (ok(t.spend) ? t.spend : (tb ? 0 : null));       // a platform that spent this week and has no row today has spent nothing yet
    const sales = pending || !hasSales ? null : (ok(t.revenue) ? t.revenue : null);
    return { id, spend, usual_day: m && ok(m.l7_daily_avg) ? m.l7_daily_avg : (w.spend > 0 ? w.spend / 7 : null), usual_by_now: m && ok(m.l7_by_now) ? m.l7_by_now : null,
      projected: m && ok(m.projected) ? m.projected : null, sales, roas: div(sales, spend), roas7: w.spend > 0 && ok(w.revenue) ? w.revenue / w.spend : null };
  });
  const spendAll = platforms.reduce((t, p) => t + (p.spend || 0), 0);
  const store = { sales: !hasSales ? null : st && ok(st.sales) ? st.sales : (tb && ok(tb.revenue) ? tb.revenue : null), orders: st && ok(st.orders) ? st.orders : null,
    spend: platforms.length ? spendAll : (st && st.spend > 0 ? st.spend : null) };

  /* hour by hour: store sales against a usual day when the read is there, else Meta spend against its usual day */
  let chart = null;
  if (L && Array.isArray(L.hours) && L.hours.length && hasSales) {
    chart = { kind: 'sales', hour: L.hours.length, today: L.hours.map(r => Math.round(r.cum_sales || 0)), usual: Array.isArray(L.plan_curve) ? L.plan_curve.map(v => Math.round(v || 0)) : null,
      usual_name: L.in_sale ? 'The plan for today' : 'A usual day', total: L.today && ok(L.today.sales) ? L.today.sales : null, goal: L.day && ok(L.day.goal) ? L.day.goal : null, pace: L.day && ok(L.day.pace) ? L.day.pace : null };
  } else if (metaNow && (metaNow.today_cum || []).length) {
    chart = { kind: 'meta', hour: metaNow.hour ?? metaNow.today_cum.length, today: metaNow.today_cum, usual: metaNow.l7_cum || null, usual_name: 'A usual day, last 7 days', total: metaNow.spent, goal: metaNow.l7_daily_avg ?? null, pace: null };
  }
  return {
    as_of: (st && st.as_of) || (pace && pace.pulled_at) || new Date().toISOString(), today, hour: metaNow ? metaNow.hour : (chart ? chart.hour : null),
    currency: (tb && tb.currency) || (st && st.currency) || 'USD', connected: platforms.length > 0 || ok(store.sales),
    sales_source: hasSales, sales_pending: pending, goal_roas: +goal > 0 ? +goal : null,
    store: { ...store, mer: div(store.sales, store.spend) }, platforms, chart,
  };
}

/* ---------- parts ---------- */
/* a platform's day so far against its usual whole day: the tick is the usual day */
function useBar(p, cur) {
  if (!ok(p.spend)) return quiet('not read');
  if (!ok(p.usual_day)) return quiet('no usual day yet');
  const over = p.spend > p.usual_day;
  return h('span', { class: 'pl-use' }, gauge({ value: p.spend, goal: p.usual_day, max: Math.max(p.usual_day * 1.4, p.spend * 1.05), thin: true, tone: over ? 'warn' : '' }),
    h('small', null, `${Math.round(100 * p.spend / p.usual_day)}% of a usual ${usd(p.usual_day, cur)} day`));
}
/* only where the hours are read (Meta today): ahead of, behind or level with a usual day by this hour */
function paceWord(p, cur) {
  if (!ok(p.usual_by_now) || !ok(p.spend)) return null;
  const gap = p.spend - p.usual_by_now;
  if (Math.abs(gap) < Math.max(5, p.usual_by_now * 0.1)) return statusDot('good', 'Level with a usual day');
  return statusDot(gap > 0 ? 'warn' : '', `${usd(Math.abs(gap), cur)} ${gap > 0 ? 'ahead of' : 'behind'} a usual day`);
}
const liveHref = (id, ctx) => ctx.href(id, id === 'meta' || id === 'tiktok' ? 'live-now' : 'overview');

function openPlatform(p, d, ctx) {
  const cur = d.currency, kv = (label, value) => h('div', null, h('small', null, label), typeof value === 'string' ? h('b', null, value) : h('b', { class: 'pl-q' }, value));
  const none = d.sales_pending ? quiet('not in yet') : !d.sales_source ? quiet('No sales source connected') : quiet('none credited yet');
  sheet({ title: platName(p.id) + ' today', body: h('div', { style: { display: 'grid', gap: '16px' } },
    h('div', { class: 'pl-kv' }, [
      kv('Spend so far', ok(p.spend) ? usd(p.spend, cur) : quiet('not read')),
      ok(p.usual_by_now) ? kv('A usual day by now', usd(p.usual_by_now, cur)) : null,
      kv('A usual whole day', ok(p.usual_day) ? usd(p.usual_day, cur) : quiet('no usual day yet')),
      ok(p.projected) ? kv('At this pace today ends near', usd(p.projected, cur)) : null,
      kv('Sales from its ads today', ok(p.sales) ? usd(p.sales, cur) : none),
      kv('ROAS today', ok(p.roas) ? x(p.roas) : none.cloneNode(true)),
      kv('ROAS, last 7 days', ok(p.roas7) ? x(p.roas7) + (d.goal_roas ? `, goal ${x(d.goal_roas)}` : '') : quiet('no data')),
    ].filter(Boolean)),
    paceWord(p, cur),
    !ok(p.usual_by_now) ? h('p', { class: 'pl-q', style: { margin: 0 } }, `${platName(p.id)} reports spend by the day, not by the hour, so this is the day so far against its usual whole day.`) : null,
    button(p.id === 'meta' || p.id === 'tiktok' ? `Open ${platName(p.id)} live now` : `Open ${platName(p.id)}`, { primary: true, href: liveHref(p.id, ctx), icon: 'arrow' })) });
}

function chartCard(d) {
  const c = d.chart, cur = d.currency;
  if (!c || !(c.today || []).length) return null;
  const hr = Math.max(0, Math.min(24, c.hour ?? c.today.length));
  /* point i is the total by the end of hour i; the line starts at zero at midnight */
  const today = [0, ...c.today.slice(0, hr)], usual = c.usual && c.usual.some(v => v > 0) ? [0, ...c.usual.slice(0, 24)] : null;
  const sales = c.kind === 'sales', what = sales ? 'Store sales' : 'Meta spend';
  const b = v => h('b', null, v);
  return h('section', { class: 'lx-card pl-chart' },
    h('div', { class: 'lx-chart-h' },
      h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, sales ? 'Sales so far today, hour by hour' : 'Meta spend so far today, hour by hour')), h('p', null, sales ? 'Store sales, Triple Whale' : 'Meta spend, Meta')),
      legend([{ name: 'Today', lead: true }, usual && { name: c.usual_name, dashed: true }])),
    h('div', { class: 'pl-big' }, h('b', null, usd(ok(c.total) ? c.total : today[today.length - 1], cur)), h('span', null, sales ? 'in sales so far today' : 'spent so far today'),
      ok(c.pace) ? statusDot(c.pace >= 1 ? 'good' : c.pace >= 0.8 ? 'warn' : 'bad', `${Math.round(Math.abs(c.pace - 1) * 100)}% ${c.pace >= 1 ? 'ahead of' : 'behind'} ${c.usual_name.toLowerCase()} by now`) : null),
    lineChart({
      series: [{ name: 'Today', lead: true, values: today.concat(Array(Math.max(0, 25 - today.length)).fill(null)), end: v => usd(v, cur) },
        usual && { name: c.usual_name, dashed: true, values: usual, end: v => usd(v, cur) }],
      labels: Array.from({ length: 25 }, (_, i) => hourWord(i)), ticks: [0, 3, 6, 9, 12, 15, 18, 21, 24], now: today.length - 1,
      format: v => money(v, { cur, compact: true }), height: 360, empty: sales ? 'No sales yet today' : 'No spend yet today', windowLabel: 'By hour, today', name: sales ? 'Sales' : 'Spend',
      label: `${what} today by hour against ${c.usual_name.toLowerCase()}. ${usd(today[today.length - 1], cur)} so far.`,
      hover: i => [b(hourWord(i)), ok(today[i]) ? h('span', null, 'Today ', b(usd(today[i], cur))) : null, usual && ok(usual[i]) ? h('span', null, c.usual_name + ' ', b(usd(usual[i], cur))) : null],
    }));
}

/* ---------- render ---------- */
function render(el, d, ctx) {
  addStyles('pl-css', CSS);
  if (!ctx.brand || !d || d.no_brand) return put(el, empty({ title: 'Pick a brand', text: 'Live now is one brand at a time.' }));
  if (!d.connected) return put(el, empty({ title: 'No ad platform connected', text: 'When Meta, Google, TikTok or Amazon is connected for this brand, today\'s spend and sales show here.',
    action: ctx.isClient ? null : button('Open integrations', { primary: true, href: ctx.href('brand-settings', 'integrations'), icon: 'arrow' }) }));
  const cur = d.currency, s = d.store || {}, by = ok(d.hour) ? ' by ' + hourWord(d.hour) : ' so far';
  const usualAll = d.platforms.every(p => ok(p.usual_day)) && d.platforms.length ? d.platforms.reduce((t, p) => t + p.usual_day, 0) : null;
  const noSales = () => quiet(!d.sales_source ? 'No sales source connected' : d.sales_pending ? 'not in yet' : 'none credited yet');

  const T = 'Today' + by, TW = 'Triple Whale';
  const top = tiles([
    kpi({ label: 'Ad spend today', value: ok(s.spend) ? usd(s.spend, cur) : 'not read', window: T, source: 'each platform', sub: ok(usualAll) ? `a usual whole day is ${usd(usualAll, cur)}` : 'all platforms' + by }),
    kpi({ label: 'Store sales today', value: ok(s.sales) ? usd(s.sales, cur) : 'no data', window: T, source: ok(s.sales) ? TW : null, sub: ok(s.sales) ? 'every sale, ads or not' : 'No sales source connected' }),
    kpi({ label: def('MER today', 'mer'), value: ok(s.mer) ? x(s.mer) : 'no data', window: T, source: ok(s.mer) ? TW : null, sub: ok(s.mer) ? 'store sales over all ad spend' : ok(s.sales) ? 'no ad spend yet today' : '' }),
    kpi({ label: 'Orders today', value: ok(s.orders) ? num(s.orders) : 'no data', window: T, source: ok(s.orders) ? TW : null, sub: ok(s.orders) && s.orders > 0 && ok(s.sales) ? usd(s.sales / s.orders, cur) + ' each' : '' }),
  ], { cols: 4 });
  ctx.askWindow = T;
  ctx.askContext = `Live today for ${ctx.brand.name || 'this brand'}${by}: ad spend ${usd(s.spend, cur)}, store sales ${ok(s.sales) ? usd(s.sales, cur) : 'not read'} (Triple Whale), MER ${ok(s.mer) ? x(s.mer) : 'not read'}. ` + d.platforms.map(p => `${platName(p.id)} spent ${usd(p.spend, cur)}`).join(', ') + '.';

  const rows = [...d.platforms].sort((a, b) => (b.spend || 0) - (a.spend || 0)).map(p => ({ ...p, name: platName(p.id) }));
  const total = { total: true, name: 'Whole store', spend: s.spend, usual_day: usualAll, sales: s.sales, roas: s.mer };
  const cSpend = r => ok(r.spend) ? usd(r.spend, cur) : quiet('not read');
  const cSales = r => ok(r.sales) ? usd(r.sales, cur) : r.total ? quiet('no data') : noSales();
  const cRoas = r => ok(r.roas) ? (r.total ? 'MER ' : '') + x(r.roas) : r.total ? quiet('no data') : ok(r.roas7) ? quiet(`${x(r.roas7)} last 7 days`) : quiet('no data');
  const wide = table({
    roomy: true, rowHeight: 72, total,
    cols: [
      { key: 'name', label: 'Platform', class: 'name', render: r => r.total ? r.name : platformChip(r.id, { chip: true }) },
      { key: 'spend', label: def('Spend so far', 'spent_today'), num: true, render: cSpend },
      { key: 'use', label: def('Against a usual day', 'usual_day'), width: 230, render: r => useBar(r, cur) },
      { key: 'pace', label: 'By now', width: 210, render: r => r.total ? '' : paceWord(r, cur) || quiet('no hour by hour read') },
      { key: 'sales', label: def('Sales from its ads', 'roas'), num: true, render: cSales },
      { key: 'roas', label: def('ROAS today', 'roas'), num: true, class: 'strong', render: cRoas },
      { key: 'open', label: '', width: 44, num: true, render: r => r.total ? '' : h('span', { class: 'pl-open' }, svgNode(icon('chevron'))) },
    ],
    rows,
    onRow: r => { if (r && !r.total) openPlatform(r, d, ctx); },
  });
  const fig = (label, node) => h('span', null, h('small', null, label), typeof node === 'string' ? h('b', null, node) : h('b', { class: 'pl-q' }, node.textContent));
  const item = r => h('button', { type: 'button', class: 'pl-item' + (r.total ? ' total' : ''), disabled: r.total || null, onclick: r.total ? null : () => openPlatform(r, d, ctx) },
    h('div', { class: 'pl-item-h' }, r.total ? h('b', null, r.name) : platformChip(r.id, { chip: true }), r.total ? null : paceWord(r, cur), r.total ? null : h('span', { class: 'pl-open' }, svgNode(icon('chevron')))),
    h('div', { class: 'pl-figs' }, fig('Spend so far', cSpend(r)), fig(r.total ? 'Store sales' : 'Sales', cSales(r)), fig(r.total ? 'MER' : 'ROAS', ok(r.roas) ? x(r.roas) : cRoas(r))),
    ok(r.spend) && ok(r.usual_day) ? useBar(r, cur) : null);
  const platforms = rows.length ? card({ title: 'Platform by platform, today', note: 'Today' + by + ' · ' + (d.sales_source ? 'spend each platform, sales and ROAS Triple Whale, last click' : 'spend each platform, no sales source connected'), flush: true },
    h('div', { class: 'pl-wide' }, wide), h('div', { class: 'pl-list' }, rows.map(item), item(total)))
    : card({ title: 'Platform by platform, today' }, h('p', { class: 'pl-q' }, 'No ad platform has spent today or in the last 7 days.'));

  const help = [
    { title: 'What it is for', text: 'What every ad platform is doing today: spend so far against a usual day, the store\'s sales and MER, and today hour by hour. Tap a platform for its numbers.' },
    { title: 'Where the numbers come from', text: `Spend is each platform's own number, so far today. ${d.sales_source ? `Sales per platform are Triple Whale, last platform click${d.sales_pending ? ', and today\'s are not credited yet' : ''}. ` : ''}A usual day is the average of the last 7 days. Only Meta is read by the hour, so only Meta is judged against the time of day. ROAS is one platform; MER is the whole store.` },
  ];
  put(el, h('div', { class: 'pl' }, headRow({ help }), top, platforms, chartCard(d)));
}

export default {
  title: 'Live now on every platform',
  eyebrow: 'All platforms',
  ranges: false,
  asOf: d => d && d.as_of,
  load,
  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('row', 4), skeleton('chart', 1)); },
  render,
};
