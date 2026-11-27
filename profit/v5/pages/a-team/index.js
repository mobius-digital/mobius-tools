/* Agency > Team. Who has too much this week? Every open Asana task due this week or late, by person, across brands.
   account-health GET /api/agency/workload. The "too much" line is the agency setting agency.teamBusy (10 tasks).
   Today's check-in (2026-11-26, a10, _checkin.js): who posted a plan and who is out, GET /api/mywork/plans. */
import { put } from '../../kit.js';
import { h, em, num, pill, statusDot, avatar, legend, lineChart, empty, sheet, card, addStyles } from '../../kit.js';
import { world, shortDay, longDay } from '../a-today/_ag.js';
import { style as baseStyle } from '../a-today/_more.js';
import { pageHelp } from '../../defs.js';
import { checkinCard } from './_checkin.js';
import { adm, countTiles } from '../a-settings/_look.js';

const CSS = `
.tm-r{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,2fr) 92px;gap:20px;align-items:center;padding:14px 28px;border-top:1px solid var(--line);cursor:pointer}
.tm-r:hover{background:var(--row-hover)}
.tm-r.tm-ci{grid-template-columns:minmax(0,1.3fr) minmax(0,2fr) auto;cursor:default}
.tm-r.tm-ci:hover{background:none}
.tm-ci .tm-n{white-space:nowrap}
.tm-p{display:flex;align-items:center;gap:12px;min-width:0}
.tm-p span{display:grid;min-width:0}
.tm-p b{font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tm-p small{font-size:12.5px;color:var(--muted)}
.tm-wk{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.tm-wk i{display:grid;place-items:center;height:30px;border-radius:8px;background:var(--bg-sunk);font-style:normal;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--ink-2)}
.tm-wk i.z{color:transparent}
.tm-wk i.late{background:var(--bad-bg);color:var(--bad)}
.tm-wk i.now{box-shadow:inset 0 0 0 1.5px var(--ink)}
.tm-hd{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,2fr) 92px;gap:20px;padding:0 28px 8px;font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted)}
.tm-hd .tm-wk span{text-align:center}
.tm-hd .tm-wk span.now{color:var(--ink)}
.tm-n{text-align:right;display:grid;justify-items:end;gap:4px}
.tm-n b{font-size:16px;font-variant-numeric:tabular-nums}
.tm-t{display:grid;gap:3px;min-width:0}
.tm-t b{font-weight:500;font-size:14px}
.tm-t small{color:var(--muted);font-size:12.5px}
.tm-legend{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;font-size:12.5px;color:var(--muted);padding:0 28px 10px}
.tm-legend i{display:inline-block;width:14px;height:14px;border-radius:4px;background:var(--bg-sunk);vertical-align:-3px;margin-right:6px}
.tm-legend i.now{box-shadow:inset 0 0 0 1.5px var(--ink)}
.tm-legend i.late{background:var(--bad-bg)}
.tm-warn{margin:0;padding:10px 14px;border-radius:12px;background:var(--bad-bg);color:var(--bad);font-size:13.5px;font-weight:500}
.tm-sh{display:grid;gap:18px}
.tm-who{display:flex;align-items:center;gap:12px}
.tm-who b{display:block;font-size:16px;font-weight:600}
.tm-who small{color:var(--muted);font-size:13px}
.tm-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.tm-tile{display:grid;gap:3px;padding:12px 14px;border-radius:14px;background:var(--bg-sunk)}
.tm-tile .l{font-size:12.5px;font-weight:600;color:var(--muted)}
.tm-tile .v{font-size:var(--num-m);font-weight:600;font-variant-numeric:tabular-nums}
.tm-tile .v.bad{color:var(--bad)}
.tm-grp{display:grid;gap:2px}
.tm-grp>h4{margin:0 0 4px;font-size:var(--fs-card,14px);font-weight:600;color:var(--ink)}
.tm-grp>h4.bad{color:var(--bad)}
.tm-task{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-top:1px solid var(--line)}
.tm-task i{flex:none;width:10px;height:10px;border-radius:3px;margin-top:5px;background:var(--dot)}
@media (max-width:759px){
  .tm-r{grid-template-columns:minmax(0,1fr) auto;padding:14px 18px;gap:10px 12px}
  .tm-r .tm-wk{grid-column:1/-1;order:3}
  .tm-hd{display:none}
  .tm-r.tm-ci{grid-template-columns:minmax(0,1fr) auto}
  .tm-ci .tm-t{grid-column:1/-1;order:3}
}`;
/* one name for the bucket everywhere: "Not assigned" (the chart, the tiles and the list) */
const nobody = p => /^(not assigned|unassigned)$/i.test(p.name || '');
const first = p => nobody(p) ? 'Not assigned' : String(p.name || '').split(' ')[0];
/* on a phone every bar keeps a name: initials ("RK"), "None" for the not assigned bucket */
const initials = p => nobody(p) ? 'None' : String(p.name || '?').split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('');
const phoneNow = () => { try { return window.matchMedia('(max-width:759px)').matches; } catch { return false; } };
const style = () => { baseStyle(); addStyles('tm-css', CSS); };

async function load(ctx) {
  const [d, busy, plans] = await Promise.all([ctx.api('/api/agency/workload', { worker: 'ah', signal: ctx.signal }), ctx.setting('agency.teamBusy', 10),
    ctx.api('/api/mywork/plans', { worker: 'ah', signal: ctx.signal }).catch(() => null)]);   // the page still draws without it
  return { ...d, busy: +busy || 10, plans };
}
async function sample(ctx) { const w = await world(); const plans = await ctx.fixture('plans.json').catch(() => null); return { ...w.team, busy: +ctx.settingNow('agency.teamBusy', 10) || 10, plans }; }

function tasksOf(p, week) { return [...(p.overdue || []), ...week.flatMap(dy => (p.days || {})[dy] || [])]; }

function openPerson(p, d, ctx) {
  const week = d.week || [], late = p.overdue || [];
  const colorOf = name => ((ctx.brands || []).find(b => b.name === name) || {}).color || 'var(--faint)';
  const dayLabel = dy => new Date(dy + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const byDay = week.map(dy => ({ dy, list: (p.days || {})[dy] || [] }));
  const busiest = byDay.reduce((m, x) => x.list.length > (m ? m.list.length : 0) ? x : m, null);
  const task = t => h('div', { class: 'tm-task' }, h('i', { style: { '--dot': colorOf(t.brand_name) }, title: t.brand_name || '' }),
    h('span', { class: 'tm-t', style: { flex: '1' } }, h('b', null, t.name), h('small', null, [t.brand_name, t.section].filter(Boolean).join(', '))),
    t.late ? pill('bad', 'Late, due ' + shortDay(t.due)) : null);
  const total = late.length + byDay.reduce((n, x) => n + x.list.length, 0);
  const body = h('div', { class: 'tm-sh' },
    h('div', { class: 'tm-who' }, avatar(p, { size: 44 }), h('span', null, h('b', null, p.name), h('small', null, p.role || 'Team'))),
    h('div', { class: 'tm-tiles' },
      h('div', { class: 'tm-tile' }, h('span', { class: 'l' }, 'Due this week'), h('span', { class: 'v' }, num(total - late.length))),
      h('div', { class: 'tm-tile' }, h('span', { class: 'l' }, 'Late'), h('span', { class: 'v' + (late.length ? ' bad' : '') }, num(late.length))),
      h('div', { class: 'tm-tile' }, h('span', { class: 'l' }, 'Busiest day'), h('span', { class: 'v' }, busiest ? new Date(busiest.dy + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }) + ', ' + busiest.list.length : 'None'))),
    total ? null : empty({ title: 'Nothing due this week' }),
    late.length ? h('section', { class: 'tm-grp' }, h('h4', { class: 'bad' }, 'Late (' + late.length + ')'), late.map(t => task({ ...t, late: true }))) : null,
    byDay.filter(x => x.list.length).map(x => h('section', { class: 'tm-grp' }, h('h4', null, dayLabel(x.dy) + ' (' + x.list.length + ')'), x.list.map(task))));
  sheet({ title: `${p.name}, this week`, body });
}

function render(el, d, ctx) {
  style();
  const people = (d && d.people) || [];
  const today1 = checkinCard(d && d.plans);
  if (!people.length) return put(el, today1, empty({ title: 'No tasks due this week', text: d && d.errors && d.errors.length ? 'Some Asana projects did not answer: ' + d.errors.map(e => e.brand || e).join(', ') : 'Nothing open in Asana is due this week.' }));
  const busy = d.busy, today = d.today;
  const list = [...people].sort((a, b) => (b.late || 0) - (a.late || 0) || b.n - a.n);
  const late = list.reduce((t, p) => t + (p.late || 0), 0), over = list.filter(p => p.n >= busy);
  const wk0 = d.week || [];
  const span = wk0.length ? shortDay(wk0[0]) + ' to ' + shortDay(wk0[wk0.length - 1]) : 'This week';
  const hero = countTiles([
    { label: 'Due this week, everyone', value: num(d.total ?? list.reduce((t, p) => t + p.n, 0)), sub: `${list.length} people, ${(d.brands || []).length} brands`, window: span, source: 'Asana' },
    { label: 'Already late', value: num(late), sub: late ? list.filter(p => p.late).map(p => first(p)).join(', ') : 'nothing late', window: 'Due before today', source: 'Asana' },
    { label: `${busy} or more this week`, value: String(over.length), sub: over.length ? over.map(p => first(p)).join(', ') : 'nobody over the line', window: span, source: 'Asana' },
  ], { cols: 3 });
  ctx.askContext = `Team workload ${span}: ${d.total ?? list.reduce((t, p) => t + p.n, 0)} Asana tasks due, ${late} late, ${over.length} people at ${busy} or more (${over.map(p => p.name).join(', ') || 'nobody'}).`;

  const order = [...people].sort((a, b) => b.n - a.n);
  const chart = h('section', { class: 'lx-card ag-chart' },
    h('div', { class: 'lx-chart-h' }, h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'Who is carrying the week?')), h('p', null, 'tasks due this week plus late ones, per person')),
      legend([{ name: `${busy} tasks is a full week`, dashed: true }])),
    lineChart({ windowLabel: 'Tasks per person, ' + span, series: [{ type: 'bar', tone: 'brand', values: order.map(p => p.n), dimAt: i => order[i].n < busy, labels: v => num(v) }], goal: { value: busy, label: `${busy} tasks`, at: 'end' },
      labels: order.map(phoneNow() ? initials : first), height: 300, endLabels: false, yTicks: 3, format: v => num(v), label: 'Tasks this week per person',
      hover: i => [h('b', null, nobody(order[i]) ? 'Not assigned' : order[i].name), h('span', null, 'Tasks ', h('b', null, num(order[i].n))), h('span', null, 'Late ', h('b', null, num(order[i].late || 0)))] }));

  const wk = d.week || [];
  const strip = p => h('div', { class: 'tm-wk' }, wk.map(dy => { const n = ((p.days || {})[dy] || []).length + (dy === today ? (p.overdue || []).length : 0);
    const isLate = dy < today && n > 0 || (dy === today && (p.overdue || []).length);
    const lateN = dy === today ? (p.overdue || []).length : isLate ? n : 0;
    return h('i', { class: (n ? '' : 'z') + (isLate ? ' late' : '') + (dy === today ? ' now' : ''),
      title: longDay(dy) + ': ' + (n ? n + ' due' + (lateN ? ', ' + lateN + ' of them late' : '') : 'nothing due') + (dy === today ? ' (today)' : '') }, n ? String(n) : ''); }));
  const people1 = card({ title: 'Person by person', note: 'Late first, then most tasks. Tap a person for their list', flush: true },
    h('div', { class: 'tm-legend' }, h('span', null, h('i', { class: 'now' }), 'outlined = today (late work is counted here)'), h('span', null, h('i', { class: 'late' }), 'red = late'), h('span', null, 'empty = nothing due')),
    h('div', { class: 'tm-hd' }, h('span', null, 'Person'), h('div', { class: 'tm-wk' }, wk.map(dy => h('span', { class: dy === today ? 'now' : null }, new Date(dy + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + new Date(dy + 'T12:00:00').getDate()))), h('span', { style: { textAlign: 'right' } }, 'Total')),
    list.map(p => h('div', { class: 'tm-r', role: 'button', tabindex: '0', onclick: () => openPerson(p, d, ctx), onkeydown: e => { if (e.key === 'Enter') openPerson(p, d, ctx); } },
      h('div', { class: 'tm-p' }, avatar(p, { size: 34 }), h('span', null, h('b', null, nobody(p) ? 'Not assigned' : p.name), h('small', null, p.role || ''))),
      strip(p),
      h('div', { class: 'tm-n' }, h('b', null, num(p.n)), p.late ? pill('bad', `${p.late} late`) : p.n >= busy ? pill('warn', 'Full week') : statusDot('good', 'Room')))));
  const errs = d.errors && d.errors.length ? h('p', { class: 'tm-warn' }, 'Some Asana projects did not answer, so their tasks are missing: ' + d.errors.map(e => e.brand || e.name || e).join(', ')) : null;
  const help = h('div', { class: 'cr-bar-top' }, pageHelp({ body: [
    { title: 'What it is for', text: 'Who has too much this week: every open Asana task due this week or already late, by person, across every brand.' },
    { title: 'What is counted', text: `Open Asana tasks due ${wk.length ? shortDay(wk[0]) + ' to ' + shortDay(wk[wk.length - 1]) : 'this week'}, plus late ones (counted on today). A full week is ${busy} tasks; change it in Agency settings.` },
  ] }));
  const root = adm(help, hero, errs, today1, chart, people1); root.classList.add('ag');
  put(el, root);
}

export default {
  title: ['Who has ', em('too much this week?')],
  eyebrow: 'Team',
  ranges: false,
  asOf: d => d && d.as_of,
  load, sample, render,
};
