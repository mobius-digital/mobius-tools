/* Agency > Money > Margin. Which clients are worth the team's time? Owner only.
   account-health GET /api/agency/economics: Ledger money in, team cost split by each person's share of finished
   Asana tasks per client (an estimate), and AI cost. Margin is money in less team and AI cost.
   The floor per team hour is the agency setting agency.perHourFloor (75 until it is set). */
import { put } from '../../kit.js';
import { helpBar, dl } from '../home/_biz.js';
import { tileRow, tipRows, pageStamp } from '../month/_m.js';
import { h, em, money, pct, num, takeaway, legend, lineChart, empty, statusDot } from '../../kit.js';
import { style, ok, figures, brandRows, brandName, brandHref, quiet, refused } from '../a-today/_ag.js';
import { loadMoney, sampleMoney } from './_money.js';

async function load(ctx) {
  const [d, floor] = await Promise.all([loadMoney(ctx), ctx.setting('agency.perHourFloor', 75)]);
  return { ...d, floor: +floor || 75 };
}
async function sample(ctx) { return { ...(await sampleMoney()), floor: +ctx.settingNow('agency.perHourFloor', 75) || 75 }; }

function render(el, d, ctx) {
  style();
  const no = refused(d, ctx, 'Margin'); if (no) return put(el, no);
  if (!d || !d.rows || !d.rows.length) return put(el, empty({ title: 'Nothing to work out yet', text: 'Margin shows once money and finished tasks land for a client this month.' }));
  const t = d.totals, floor = d.floor;
  const m = v => money(ok(v) ? Math.round(v) : v);                 /* whole dollars everywhere, AI cost included */
  const rows = d.rows.map(r => ({ ...r, id: r.brand, href: brandHref(r.brand, 'month', 'profit'), goTitle: 'Open ' + r.name + ' profit this month', per_hour: ok(r.per_hour) ? r.per_hour : r.hours > 0 ? (r.revenue || 0) / r.hours : null }));
  const low = rows.filter(r => ok(r.per_hour) && r.per_hour < floor);
  const hero = tileRow([
    { label: 'Margin', value: m(t.margin), sub: t.revenue > 0 ? `${pct(t.margin / t.revenue)} of what came in` : '' },
    { label: dl('Per team hour', 'per_team_hour'), value: t.hours > 0 ? m(t.revenue / t.hours) : 'no data', sub: `${num(t.hours)} hours on ${num(t.tasks)} tasks` },
    { label: 'Team and AI cost', value: m(t.team_cost + t.ai_cost), sub: `of which AI ${m(t.ai_cost)}` },
    { label: `Under ${m(floor)} an hour`, value: String(low.length), sub: low.length ? low.map(r => r.name).join(', ') : 'every client clears it' },
  ], { window: d.label || 'This month', source: 'Ledger and team hours, an estimate' });
  ctx.askWindow = d.label || 'This month';
  ctx.askContext = `Margin per client, ${d.label || 'this month'}: margin ${m(t.margin)} on ${m(t.revenue)} received, ${t.hours > 0 ? m(t.revenue / t.hours) + ' per team hour' : 'no hours logged'}. Under ${m(floor)} an hour: ${low.length ? low.map(r => r.name).join(', ') : 'none'}.`;
  const order = rows.filter(r => ok(r.per_hour)).sort((a, b) => b.per_hour - a.per_hour);
  const chart = order.length > 1 ? h('section', { class: 'lx-card ag-chart' },
    h('div', { class: 'lx-chart-h' }, h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'What does an hour on each client bring in?')), h('p', null, 'Money received over estimated team hours · Ledger and team hours')),
      legend([{ name: 'Per team hour', square: true, color: 'var(--brand)' }, { name: `Floor ${money(floor)}`, dashed: true }])),
    lineChart({ series: [{ type: 'bar', tone: 'brand', values: order.map(r => r.per_hour), dimAt: i => order[i].per_hour < floor, labels: v => money(Math.round(v)) }], goal: { value: floor },
      labels: order.map(r => r.name.split(' ')[0]), height: 320, endLabels: false, yTicks: 3, format: v => money(Math.round(v)), yMax: Math.ceil(Math.max(...order.map(r => r.per_hour), floor) * 1.15 / 30) * 30, label: 'Money per team hour by client', windowLabel: 'By client, ' + (d.label || 'this month'),
      hover: i => tipRows(order[i].name, [['Per team hour', money(Math.round(order[i].per_hour)), 'ink'], ['Hours', num(order[i].hours, 1)], ['Received', m(order[i].revenue)]]) })) : null;
  const tot = { total: true, name: 'All clients', ...t, margin_pct: t.revenue > 0 ? 100 * t.margin / t.revenue : null, per_hour: t.hours > 0 ? t.revenue / t.hours : null };
  const tbl = brandRows({
    title: 'Client by client', note: d.label, sort: { key: 'per_hour', dir: 'asc' }, rows, total: tot,
    cols: [
      { key: 'name', label: 'Client', class: 'name', render: r => r.total ? r.name : brandName(r, ctx, r.href) },
      { key: 'revenue', label: 'Received', num: true, class: 'hide-sm', render: r => m(r.revenue) },
      { key: 'hours', label: 'Team hours', num: true, class: 'hide-md', render: r => num(r.hours, r.hours % 1 ? 1 : 0) },
      { key: 'cost', label: 'Team and AI', num: true, class: 'hide-md', render: r => m((r.team_cost || 0) + (r.ai_cost || 0)) },
      { key: 'margin', label: 'Margin', num: true, sortable: true, class: 'strong', render: r => [m(r.margin), ok(r.margin_pct) ? h('span', { class: 'sub' }, pct(r.margin_pct / 100)) : null] },
      { key: 'per_hour', label: dl('Per team hour', 'per_team_hour'), num: true, sortable: true, value: r => r.per_hour ?? -1, render: r => ok(r.per_hour) ? (r.total ? money(Math.round(r.per_hour)) : statusDot(r.per_hour < floor ? 'bad' : 'good', money(Math.round(r.per_hour)))) : quiet('no hours') },
    ],
    item: (r, isTotal) => ({ href: r.href, head: isTotal ? h('b', null, r.name) : brandName(r, ctx), tail: ok(r.per_hour) && !isTotal ? statusDot(r.per_hour < floor ? 'bad' : 'good', money(Math.round(r.per_hour)) + ' an hour') : null,
      figs: [['Received', m(r.revenue)], ['Hours', num(r.hours, r.hours % 1 ? 1 : 0)], ['Margin', m(r.margin)]] }),
    rowHeight: 56,                                                  /* the margin cell holds two lines */
  });
  const help = helpBar([
    { title: 'What it is for', text: 'Which clients are worth the team\'s time: money received this month against the team time and AI it took.' },
    { title: 'It is an estimate', text: (d.model || 'Estimate.') + (d.people_set === false ? ' Team costs are not set yet, so margin reads high: set them in Agency settings.' : '') },
    { title: 'Clicking a client', text: 'Opens that brand\'s profit for this month.' },
  ], h('span', { class: 'bz-chip', title: d.model || null }, 'Estimate'), pageStamp(ctx));
  put(el, h('div', { class: 'ag' }, help, hero, d.sentence ? takeaway(d.sentence) : null, chart, tbl));
}

export default {
  title: ['Which clients are ', em('worth the time?')],
  eyebrow: (ctx, d) => d && d.label ? 'Money, ' + d.label : 'Money',
  ranges: false,
  stamp: false,                     /* Home's stamp with a refresh button sits in the help bar */
  load, sample, render,
};
