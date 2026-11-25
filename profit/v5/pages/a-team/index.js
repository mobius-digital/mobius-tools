/* Agency > Team. Who has too much this week? Every open Asana task due this week or late, by person, across brands.
   account-health GET /api/agency/workload. The "too much" line is the agency setting agency.teamBusy (10 tasks). */
import { put } from '../../kit.js';
import { h, em, num, pill, statusDot, avatar, legend, lineChart, empty, sheet, card, addStyles } from '../../kit.js';
import { world, figures, shortDay, longDay } from '../a-today/_ag.js';
import { style as baseStyle } from '../a-today/_more.js';

const CSS = `
.tm-r{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,2fr) 92px;gap:20px;align-items:center;padding:14px 28px;border-top:1px solid var(--line);cursor:pointer}
.tm-r:hover{background:var(--band)}
.tm-p{display:flex;align-items:center;gap:12px;min-width:0}
.tm-p span{display:grid;min-width:0}
.tm-p b{font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tm-p small{font-size:12.5px;color:var(--muted)}
.tm-wk{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.tm-wk i{display:grid;place-items:center;height:30px;border-radius:8px;background:var(--bg-sunk);font-style:normal;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--ink-2)}
.tm-wk i.z{color:var(--faint);font-weight:400}
.tm-wk i.late{background:var(--bad-bg);color:var(--bad)}
.tm-wk i.now{box-shadow:inset 0 0 0 1.5px var(--ink)}
.tm-hd{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,2fr) 92px;gap:20px;padding:0 28px 8px;font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.tm-hd .tm-wk span{text-align:center}
.tm-n{text-align:right;display:grid;justify-items:end;gap:4px}
.tm-n b{font-size:16px;font-variant-numeric:tabular-nums}
.tm-t{display:grid;gap:3px;min-width:0}
.tm-t b{font-weight:550;font-size:14px}
.tm-t small{color:var(--muted);font-size:12.5px}
@media (max-width:759px){
  .tm-r{grid-template-columns:minmax(0,1fr) auto;padding:14px 18px;gap:10px 12px}
  .tm-r .tm-wk{grid-column:1/-1;order:3}
  .tm-hd{display:none}
}`;
const first = p => /^not assigned$/i.test(p.name || '') ? 'Unassigned' : String(p.name || '').split(' ')[0];
const style = () => { baseStyle(); addStyles('tm-css', CSS); };

async function load(ctx) {
  const [d, busy] = await Promise.all([ctx.api('/api/agency/workload', { worker: 'ah', signal: ctx.signal }), ctx.setting('agency.teamBusy', 10)]);
  return { ...d, busy: +busy || 10 };
}
async function sample(ctx) { const w = await world(); return { ...w.team, busy: +ctx.settingNow('agency.teamBusy', 10) || 10 }; }

function tasksOf(p, week) { return [...(p.overdue || []), ...week.flatMap(dy => (p.days || {})[dy] || [])]; }

function openPerson(p, d, ctx) {
  const all = tasksOf(p, d.week);
  const row = t => h('div', null, h('span', { class: 'tm-t', style: { flex: '1' } }, h('b', null, t.name),
    h('small', null, [t.brand_name, t.section].filter(Boolean).join(', '))),
    t.late ? pill('bad', 'Late, ' + shortDay(t.due)) : statusDot('', shortDay(t.due)));
  sheet({ title: `${p.name}, this week`, body: all.length ? h('div', { class: 'lx-rows' }, all.map(row)) : empty({ title: 'Nothing due this week' }) });
}

function render(el, d, ctx) {
  style();
  const people = (d && d.people) || [];
  if (!people.length) return put(el, empty({ title: 'No tasks due this week', text: d && d.errors && d.errors.length ? 'Some Asana projects did not answer: ' + d.errors.map(e => e.brand || e).join(', ') : 'Nothing open in Asana is due this week.' }));
  const busy = d.busy, today = d.today;
  const list = [...people].sort((a, b) => (b.late || 0) - (a.late || 0) || b.n - a.n);
  const late = list.reduce((t, p) => t + (p.late || 0), 0), over = list.filter(p => p.n >= busy);
  const hero = figures([
    { label: 'Due this week, everyone', value: num(d.total ?? list.reduce((t, p) => t + p.n, 0)), lead: true, sub: `${list.length} people, ${(d.brands || []).length} brands` },
    { label: 'Already late', value: num(late), sub: late ? list.filter(p => p.late).map(p => first(p)).join(', ') : 'nothing late' },
    { label: `${busy} or more this week`, value: String(over.length), sub: over.length ? over.map(p => first(p)).join(', ') : 'nobody over the line' },
  ]);

  const order = [...people].sort((a, b) => b.n - a.n);
  const chart = h('section', { class: 'lx-card ag-chart' },
    h('div', { class: 'lx-chart-h' }, h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'Who is carrying the week?')), h('p', null, 'tasks due this week plus late ones, per person')),
      legend([{ name: 'Tasks', square: true }, { name: `${busy} is a full week`, dashed: true }])),
    lineChart({ series: [{ type: 'bar', values: order.map(p => p.n), dimAt: i => order[i].n < busy, labels: v => num(v) }], goal: { value: busy, label: `${busy} tasks`, at: 'end' },
      labels: order.map(first), height: 300, endLabels: false, yTicks: 3, format: v => num(v), label: 'Tasks this week per person',
      hover: i => [h('b', null, order[i].name), h('span', null, 'Tasks ', h('b', null, num(order[i].n))), h('span', null, 'Late ', h('b', null, num(order[i].late || 0)))] }));

  const wk = d.week || [];
  const strip = p => h('div', { class: 'tm-wk' }, wk.map(dy => { const n = ((p.days || {})[dy] || []).length + (dy === today ? (p.overdue || []).length : 0);
    const isLate = dy < today && n > 0 || (dy === today && (p.overdue || []).length);
    return h('i', { class: (n ? '' : 'z') + (isLate ? ' late' : '') + (dy === today ? ' now' : ''), title: longDay(dy) }, n ? String(n) : '0'); }));
  const people1 = card({ title: 'Person by person', note: 'Late work is counted on today. Tap a person for their list.', flush: true },
    h('div', { class: 'tm-hd' }, h('span', null, 'Person'), h('div', { class: 'tm-wk' }, wk.map(dy => h('span', null, new Date(dy + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })))), h('span', { style: { textAlign: 'right' } }, 'Total')),
    list.map(p => h('div', { class: 'tm-r', role: 'button', tabindex: '0', onclick: () => openPerson(p, d, ctx), onkeydown: e => { if (e.key === 'Enter') openPerson(p, d, ctx); } },
      h('div', { class: 'tm-p' }, avatar(p, { size: 34 }), h('span', null, h('b', null, p.name), h('small', null, p.role || ''))),
      strip(p),
      h('div', { class: 'tm-n' }, h('b', null, num(p.n)), p.late ? pill('bad', `${p.late} late`) : p.n >= busy ? pill('warn', 'Full week') : statusDot('good', 'Room')))));
  const errs = d.errors && d.errors.length ? h('p', { class: 'lx-foot' }, 'Did not answer: ' + d.errors.map(e => e.brand || e.name || e).join(', ')) : null;
  const foot = h('p', { class: 'lx-foot' }, `Open Asana tasks due ${wk.length ? shortDay(wk[0]) + ' to ' + shortDay(wk[wk.length - 1]) : 'this week'}, and late ones. A full week is ${busy} tasks (Agency settings).`);
  put(el, h('div', { class: 'ag' }, hero, chart, people1, errs, foot));
}

export default {
  title: ['Who has ', em('too much this week?')],
  eyebrow: 'Team',
  ranges: false,
  asOf: d => d && d.as_of,
  load, sample, render,
};
