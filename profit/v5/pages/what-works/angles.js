/* What works > Angles. "Which reasons to buy work?" Each angle's score and test history, and "have we tested this?".
   Live data: GET /api/brand?act= (profit worker): the angle library with its tests, verdicts, learnings and Triple Whale
   spend and sales per test. Judged on ROAS against the brand's goal. The search runs in the browser over the names of
   every angle and test (no AI call). Offers run one after another, so they live on the Offers page, not in a bar here. */

import { put } from '../../kit.js';
import { h, card, kpi, kpis, lineChart, legend, pill, sheet, field, em, money, num, x, skeleton, empty, sourceLine } from '../../kit.js';
import { css, gate, loadBrand, meter, findingButton, thin, dl, def, chipDef, helpBar, figs, tileRow } from './_ww.js';

const PILL_KEY = { Proven: 'proven', Dead: 'dead', Mixed: 'mixed', 'Not judged': 'not_judged', 'Untested idea': 'untested', Retired: 'retired' };
const labelPill = (tone, word) => chipDef(pill(tone, word), PILL_KEY[word] || word);

const day = d => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.slice(0, 4) === String(new Date().getFullYear()) ? undefined : 'numeric' }) : 'never');
const LEVEL = { angle: 'New angle', concept: 'New concept', variation: 'Variation', offer: 'Offer' };
const VERDICT = { winner: ['good', 'Winner'], loser: ['bad', 'Loser'], cancelled: ['', 'Stopped'], keep: ['', 'Keep running'] };
const words = t => String(t || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'our', 'your', 'that', 'this', 'are', 'not'].includes(w));

function labelOf(a) {
  const s = a.stats || {};
  if (a.status === 'retired') return ['', 'Retired'];
  if (!s.batches) return ['', 'Untested idea'];
  if (!s.judged) return ['warn', 'Not judged'];
  if (s.winners / s.judged >= 0.2) return ['good', 'Proven'];
  if (!s.winners && s.judged >= 2) return ['bad', 'Dead'];
  return ['', 'Mixed'];
}

async function load(ctx) {
  if (!ctx.brand) return { state: 'none' };
  const b = await loadBrand(ctx);
  if (!b) return { state: 'error', error: 'The angle library did not load.' };
  const tests = {};
  for (const t of b.batches || []) {
    if (!t.angle_id) continue;
    (tests[t.angle_id] ||= []).push({ num: t.num, title: t.title, level: t.level, variable: t.variable, verdict: t.verdict || (t.asana_result === 'keep' ? 'keep' : null),
      spend: (t.stats || {}).spend || 0, orders: (t.stats || {}).orders || 0, roas: (t.stats || {}).roas, date: (t.stats || {}).first || String(t.created_at || '').slice(0, 10), learning: t.learning || null });
  }
  const angles = (b.angles || []).map(a => {
    const list = (tests[a.id] || []).sort((p, q) => String(q.date).localeCompare(String(p.date)));
    return { id: a.id, name: a.name, status: a.status, note: a.note || a.why || null, stats: { ...(a.stats || {}), orders: list.reduce((t, x2) => t + x2.orders, 0) }, tests: list };
  });
  return { state: 'ok', source: 'live', goal_roas: (b.account || {}).target_roas || (b.rules || {}).target_roas || null, goal_cpa: (b.rules || {}).target_cpa || null, angles };
}

function openAngle(a, d, ctx) {
  const [tone, word] = labelOf(a);
  const s = a.stats || {};
  sheet({ title: a.name, body: h('div', { class: 'ww-stack', style: { gap: '20px' } },
    h('div', { class: 'lx-row' }, labelPill(tone, word), a.note ? h('span', { class: 'ww-an-note' }, a.note) : null),
    h('div', { class: 'ww-an-k' }, kpis([
      kpi({ label: 'Tests', value: num(s.batches || 0), sub: 'all time' }), kpi({ label: dl('Won', 'won'), value: s.judged ? `${num(s.winners)} of ${num(s.judged)}` : 'none judged' }),
      kpi({ label: dl('ROAS', 'roas'), value: s.roas == null || thin(s.orders) ? 'too early' : x(s.roas), sub: 'all time' + (d.goal_roas ? ', goal ' + x(d.goal_roas) : '') }), kpi({ label: 'Spend', value: money(s.spend || 0), sub: 'all time' }),
    ], { cols: 4 })),
    a.tests.length ? h('div', { class: 'ww-rows' }, a.tests.map(t => {
      const v = VERDICT[t.verdict] || ['warn', 'Running'];
      return h('div', { class: 'ww-l' },
        h('div', null, h('div', { class: 'ww-txt' }, `#${t.num} ${t.title}`, h('small', null, [LEVEL[t.level] || 'Test', t.variable ? 'testing the ' + t.variable : null, day(t.date)].filter(Boolean).join(', '))),
          t.learning ? h('p', { class: 'ww-an-note', style: { marginTop: '6px' } }, t.learning) : null,
          h('div', { style: { marginTop: '10px', maxWidth: '360px' } }, figs([['Spend', money(t.spend)], [dl('Orders', 'tw_orders'), num(t.orders), { cls: thin(t.orders) ? 'dim' : '' }], [dl('ROAS', 'roas'), t.roas == null ? 'no data' : x(t.roas), { cls: thin(t.orders) ? 'dim' : '' }]], 3))),
        h('div', { class: 'side' }, pill(v[0], v[1])));
    })) : empty({ title: 'Never tested', text: 'No test has been filed under this angle yet.' }),
    findingButton(ctx, () => ({ say: [h('b', null, a.name), s.judged ? ` won ${num(s.winners)} of ${num(s.judged)} tests.` : ' has not been tested yet.'], measure: 'ROAS',
      proof: a.tests.filter(t => t.roas != null).slice(0, 3).map(t => ({ value: t.roas, text: x(t.roas), name: '#' + t.num, sub: LEVEL[t.level] || 'test' })),
      normal: d.goal_roas ? { value: d.goal_roas, text: x(d.goal_roas), name: 'Goal', sub: 'ROAS' } : null,
      brief: { title: 'New concept: ' + a.name, make: 'A new concept on this angle, 3 ads', why: a.note || a.name, count: 3 } }), 'Brief a new concept')) });
}

function search(d) {
  const out = h('div', { class: 'ww-hits' });
  const f = field({ label: 'Have we tested this?', placeholder: 'Type an idea, for example "a gift for dad"', hint: 'Searches the names of every angle, test and learning here.' });
  const all = d.angles.flatMap(a => [{ kind: 'Angle', a, text: a.name + ' ' + (a.note || '') }, ...a.tests.map(t => ({ kind: '#' + t.num, a, t, text: t.title + ' ' + (t.learning || '') }))]);
  let timer = 0;
  f.input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => {
    const q = words(f.input.value);
    if (!q.length) return put(out, );
    const hits = all.map(r => ({ r, n: q.filter(w => words(r.text).some(v => v.startsWith(w) || w.startsWith(v))).length })).filter(o => o.n).sort((p, q2) => q2.n - p.n).slice(0, 6);
    put(out, ...(hits.length ? hits.map(({ r, n }) => h('div', null,
      pill(n >= q.length ? 'good' : '', n >= q.length ? 'Tested' : 'Close'),
      h('div', { class: 'ww-txt', style: { flex: 1 } }, r.t ? `${r.kind} ${r.t.title}` : r.a.name, h('small', null, r.t ? `Under ${r.a.name}` + (r.t.verdict ? ', ' + (VERDICT[r.t.verdict] || [, 'judged'])[1].toLowerCase() : ', no call yet') : 'An angle, ' + labelOf(r.a)[1].toLowerCase())))) : [h('div', null, pill('', 'New'), h('span', { class: 'ww-an-note' }, 'Nothing like it has been filed here. It looks new.'))]));
  }, 160); });
  return card({}, f, out);
}

function view(d, ctx) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  const list = (d.angles || []).slice().sort((p, q) => (q.stats.spend || 0) - (p.stats.spend || 0));
  if (!list.length) return [empty({ title: 'No angles yet', text: 'Angles are filed as tests are briefed. The first test brief starts the library.' })];
  const live = list.filter(a => a.status !== 'retired');
  const proven = live.filter(a => labelOf(a)[1] === 'Proven');
  const chartList = live.filter(a => a.stats.roas != null).slice(0, 8);
  const bestI = chartList.reduce((bi, a, i) => (!thin(a.stats.orders) && (bi < 0 || a.stats.roas > chartList[bi].stats.roas) ? i : bi), -1);
  const best = bestI >= 0 ? chartList[bestI] : null;
  const top = Math.max(d.goal_roas || 0, ...chartList.map(a => a.stats.roas || 0));
  /* round ticks: 0, 2x, 4x (or 0, 3x, 6x...) */
  const yMax = Math.max(2, Math.ceil(top * 1.15 / 2) * 2);
  /* a column figure that would sit on the dashed goal line moves into the x label instead (the chart draws it 7px over the column) */
  const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 759px)').matches;
  const plotH = (narrow ? 250 : 300) - 60;
  const onGoal = v => d.goal_roas != null && v != null && (d.goal_roas - v) / yMax * plotH >= -4 && (d.goal_roas - v) / yMax * plotH <= 22;
  const cut = (t, n) => (t.length > n ? t.slice(0, n - 1).trim() + '.' : t);
  ctx.askWindow = 'All time';
  ctx.askContext = `What works, Angles, all time: ${num(live.length)} angles in use, ${num(proven.length)} proven (won at least 1 in 5 judged tests)`
    + (best ? `; best ROAS ${best.name} at ${x(best.stats.roas)}` : '') + (d.goal_roas ? `; goal ${x(d.goal_roas)}` : '') + '. Spend Meta, ROAS Triple Whale, last click.';
  return [
    helpBar([{ title: 'What it is for', text: 'Every reason to buy this brand has tested, scored on its tests so far, all time. Tap an angle for its tests in order, or search to check whether an idea was tried.' },
      { title: 'The labels', text: 'Proven: won at least 1 in 5 judged tests. Dead: 2 or more judged and none won. Mixed: some won, under 1 in 5. A ROAS under 30 orders is drawn in gray: a hint, not a result.' }],
      { src: 'Spend from Meta. Sales and ROAS from Triple Whale, last platform click, added up over every test filed under the angle, all time. Tests and calls come from the brand\'s test library.' }),
    tileRow([
      kpi({ label: 'Angles', value: num(live.length), sub: `${num(list.length - live.length)} retired`, window: 'All time', source: 'Test library' }),
      kpi({ label: dl('Proven', 'proven'), value: num(proven.length), sub: 'Won at least 1 in 5 judged tests', window: 'All time', source: 'Test library' }),
      kpi({ label: 'Tests filed', value: num(list.reduce((t, a) => t + (a.stats.batches || 0), 0)), sub: 'Every test under an angle', window: 'All time', source: 'Test library' }),
      kpi({ label: dl('Untested ideas', 'untested'), value: num(live.filter(a => !a.stats.batches).length), sub: 'Filed, never tested', window: 'Now', source: 'Test library' }),
    ], 4),
    chartList.length >= 2 ? card({ class: 'ww-cd', title: 'ROAS by angle', note: sourceLine('All time', 'Triple Whale, last click. Gray under 30 orders'), action: legend([{ name: 'Best angle', square: true, color: 'var(--brand)' }, { name: 'Other angles', square: true, color: '#C9D0DE' }, d.goal_roas && { name: 'Goal ' + x(d.goal_roas), dashed: true }]) },
      h('div', { style: { marginTop: '18px' } }, lineChart({ windowLabel: 'Per angle, all time', series: [{ type: 'bar', tone: 'slate', name: 'ROAS', values: chartList.map(a => a.stats.roas), leadAt: bestI, dimAt: i => thin(chartList[i].stats.orders), labels: v => (onGoal(v) ? '' : x(v)) }],
        labels: chartList.map(a => (onGoal(a.stats.roas) ? cut(a.name, 14) + ', ' + x(a.stats.roas) : cut(a.name, 22))), goal: d.goal_roas ? { value: d.goal_roas, label: 'Goal ' + x(d.goal_roas) } : null,
        format: v => x(v, 0), yMax, yTicks: 2, height: 300, phoneHeight: 250, endLabels: false, label: 'ROAS by angle', hover: i => [h('b', null, chartList[i].name), ` ${x(chartList[i].stats.roas)}, ${money(chartList[i].stats.spend)}, ${num(chartList[i].stats.orders)} orders`] }))) : null,
    search(d),
    card({ class: 'ww-cd', title: 'Every angle', note: sourceLine('All time', 'spend Meta, ROAS Triple Whale, last click'), flush: true },
      h('div', { class: 'ww-an' }, h('div', { class: 'ww-anr hd' }, h('span', null, 'Angle'), h('span', null, 'Status'), h('span', null, dl('Won', 'won')), h('span', null, dl('ROAS', 'roas')), h('span', { class: 's' }, 'Spend')), list.map(a => {
        const [tone, word] = labelOf(a), s = a.stats || {}, dim = thin(s.orders);
        return h('button', { class: 'ww-anr', type: 'button', onclick: () => openAngle(a, d, ctx) },
          h('div', { class: 'nm' }, h('b', null, a.name), h('small', null, s.batches ? `${num(s.batches)} ${s.batches === 1 ? 'test' : 'tests'}, last ${day(s.last)}` : 'Not tested yet')),
          labelPill(tone, word),
          h('div', { class: 'n' }, h('b', null, s.judged ? `${num(s.winners)} of ${num(s.judged)}` : 'none')),
          h('div', { class: 'n r' }, h('span', { class: 'k' }, 'ROAS'), h('b', { class: dim ? 'dim' : '' }, s.roas == null ? 'no data' : x(s.roas)), s.roas != null ? meter(s.roas, d.goal_roas, { max: Math.max(d.goal_roas || 0, ...list.map(z => z.stats.roas || 0)) * 1.1 || 1, dim, goalTitle: d.goal_roas ? 'Goal ' + x(d.goal_roas) : null }) : null,
            h('small', { class: 'p2' }, `Won ${s.judged ? num(s.winners) + ' of ' + num(s.judged) : 'none yet'} · ${money(Math.round(s.spend || 0))} spend`)),
          h('div', { class: 'n s' }, h('b', null, money(Math.round(s.spend || 0)))));
      }))),
  ].filter(Boolean);
}

const CSS = `.ww-an{display:grid}
.ww-anr{display:grid;grid-template-columns:minmax(0,1.6fr) 120px 90px minmax(140px,1fr) 100px;gap:18px;align-items:center;padding:14px 28px;border:0;border-top:1px solid var(--line);background:none;text-align:left;font:inherit;color:inherit;cursor:pointer;width:100%}
.ww-anr.hd{cursor:default;padding-top:8px;padding-bottom:8px;border-top:0;font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted)}
.ww-anr.hd:hover{background:none}
.ww-anr .lx-pill{justify-self:start}.ww-anr:hover{background:var(--row-hover)}
.ww-anr .s{text-align:right}
.ww-anr .nm b{display:block;font-size:var(--fs-body,14px);font-weight:600}.ww-anr .nm small{display:block;font-size:12px;color:var(--muted)}
.ww-an-note{font-size:13px;color:var(--ink-2)}
.ww-an-k .lx-kpis{--kpi-em:5}
.ww-anr .n{display:grid;gap:4px;align-content:start}.ww-anr .n .k{display:none;font-size:var(--fs-colhead,11.5px);color:var(--muted)}
.ww-anr .n .p2{display:none;font-size:12px;color:var(--muted)}
.ww-anr .n b{font-size:var(--num-s);font-weight:600;font-variant-numeric:tabular-nums}.ww-anr .n b.dim{color:var(--faint);font-weight:500}
.ww-hits{display:grid;margin-top:10px}.ww-hits>div{display:flex;align-items:center;gap:12px;padding:8px 0;border-top:1px solid var(--line)}.ww-hits>div:first-child{border-top:0}
@media (max-width:1040px){.ww-anr{grid-template-columns:minmax(0,1fr) auto;padding:14px 20px}.ww-anr.hd{display:none}.ww-anr .n{grid-column:1/-1}.ww-anr .s{display:none}.ww-anr .n:not(.r){display:none}.ww-anr .n .k,.ww-anr .n .p2{display:block}}
@media (max-width:759px){.ww-anr{padding:14px 18px}}`;

export default {
  title: ['Which reasons to buy ', em('work?')],
  eyebrow: 'What works',
  ranges: false,
  load,
  skeleton(el) { put(el, skeleton('kpi', 4), skeleton('chart'), skeleton('row', 6)); },
  render(el, d, ctx) {
    css();
    if (!document.getElementById('ww-an-css')) { const st = document.createElement('style'); st.id = 'ww-an-css'; st.textContent = CSS; document.head.append(st); }
    put(el, ...view(d, ctx));
    if (new URLSearchParams(location.search).get('open') === '1') { const b = el.querySelector('button.ww-anr'); if (b) b.click(); }
  },
};
