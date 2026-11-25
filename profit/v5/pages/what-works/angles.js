/* What works > Angles. "Which reasons to buy work?" Each angle's score and test history, and "have we tested this?".
   Live data: GET /api/brand?act= (profit worker): the angle library with its tests, verdicts, learnings and Triple Whale
   spend and sales per test. Judged on ROAS against the brand's goal. The search runs in the browser over the names of
   every angle and test (no AI call). Offers run one after another, so they live on the Offers page, not in a bar here. */

import { put } from '../../kit.js';
import { h, card, kpi, kpis, takeaway, lineChart, legend, pill, sheet, field, em, money, num, x, skeleton, empty, button } from '../../kit.js';
import { css, gate, loadBrand, meter, findingButton, foot, thin, thinWords } from './_ww.js';

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
  sheet({ title: a.name, side: 'right', class: 'ww-wide', body: h('div', { class: 'ww-stack', style: { gap: '20px' } },
    h('div', { class: 'lx-row' }, pill(tone, word), a.note ? h('span', { class: 'lx-foot' }, a.note) : null),
    kpis([
      { label: 'Tests', value: num(s.batches || 0) }, { label: 'Won', value: s.judged ? `${num(s.winners)} of ${num(s.judged)}` : 'none judged' },
      { label: 'ROAS', value: s.roas == null || thin(s.orders) ? 'too early' : x(s.roas) }, { label: 'Spend', value: money(s.spend || 0) },
    ].map(k => h('div', { class: 'lx-kpi' }, h('span', { class: 'l' }, k.label), h('span', { class: 'v', style: { fontSize: '22px' } }, k.value)))),
    a.tests.length ? h('div', { class: 'ww-rows' }, a.tests.map(t => {
      const v = VERDICT[t.verdict] || ['warn', 'Running'];
      return h('div', { class: 'ww-l' },
        h('div', null, h('div', { class: 'ww-txt' }, `#${t.num} ${t.title}`, h('small', null, [LEVEL[t.level] || 'Test', t.variable ? 'testing the ' + t.variable : null, day(t.date)].filter(Boolean).join(', '))),
          t.learning ? h('p', { class: 'lx-foot', style: { marginTop: '6px', color: 'var(--ink-2)' } }, t.learning) : null),
        h('div', { class: 'side' }, pill(v[0], v[1]), h('span', { class: 'lx-foot' }, `${money(t.spend)}, ` + (thin(t.orders) ? thinWords(t.orders) : `${num(t.orders)} orders, ${x(t.roas)}`))));
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
      h('div', { class: 'ww-txt', style: { flex: 1 } }, r.t ? `${r.kind} ${r.t.title}` : r.a.name, h('small', null, r.t ? `Under ${r.a.name}` + (r.t.verdict ? ', ' + (VERDICT[r.t.verdict] || [, 'judged'])[1].toLowerCase() : ', no call yet') : 'An angle, ' + labelOf(r.a)[1].toLowerCase())))) : [h('div', null, pill('', 'New'), h('span', { class: 'lx-foot' }, 'Nothing like it has been filed here. It looks new.'))]));
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
  return [
    kpis([
      kpi({ label: 'Angles', value: num(live.length), sub: `${num(list.length - live.length)} retired`, size: 'lg' }),
      kpi({ label: 'Proven', value: num(proven.length), sub: 'won at least 1 in 5 judged tests', size: 'lg' }),
      kpi({ label: 'Tests filed', value: num(list.reduce((t, a) => t + (a.stats.batches || 0), 0)), size: 'lg' }),
      kpi({ label: 'Untested ideas', value: num(live.filter(a => !a.stats.batches).length), size: 'lg' }),
    ], { cols: 4 }),
    best ? takeaway([h('b', null, best.name), ` returns ${x(best.stats.roas)} on ${money(best.stats.spend)}` + (d.goal_roas ? `, against a ${x(d.goal_roas)} goal.` : '.'),
      proven.length ? ` ${num(proven.length)} ${proven.length === 1 ? 'angle has' : 'angles have'} won tests.` : '']) : null,
    chartList.length >= 2 ? card({ class: 'ww-cd', title: 'ROAS by angle', note: 'The angles with the most spend. Grey under 30 orders.', action: legend([{ name: 'ROAS', square: true, color: 'var(--ink)' }, d.goal_roas && { name: 'Goal', dashed: true }]) },
      h('div', { style: { marginTop: '18px' } }, lineChart({ series: [{ type: 'bar', values: chartList.map(a => a.stats.roas), leadAt: bestI, dimAt: i => thin(chartList[i].stats.orders), labels: v => x(v) }],
        labels: chartList.map(a => (a.name.length > 22 ? a.name.slice(0, 21).trim() + '.' : a.name)), goal: d.goal_roas ? { value: d.goal_roas, label: 'Goal ' + x(d.goal_roas) } : null,
        format: v => x(v, 1), height: 300, phoneHeight: 250, endLabels: false, label: 'ROAS by angle', hover: i => [h('b', null, chartList[i].name), ` ${x(chartList[i].stats.roas)}, ${money(chartList[i].stats.spend)}, ${num(chartList[i].stats.orders)} orders`] }))) : null,
    search(d),
    card({ class: 'ww-cd', title: 'Every angle', note: 'Tap one for its tests in order.', flush: true },
      h('div', { class: 'ww-an' }, list.map(a => {
        const [tone, word] = labelOf(a), s = a.stats || {}, dim = thin(s.orders);
        return h('button', { class: 'ww-anr', type: 'button', onclick: () => openAngle(a, d, ctx) },
          h('div', { class: 'nm' }, h('b', null, a.name), h('small', null, s.batches ? `${num(s.batches)} ${s.batches === 1 ? 'test' : 'tests'}, last ${day(s.last)}` : 'Not tested yet')),
          pill(tone, word),
          h('div', { class: 'n' }, h('span', null, 'Won'), h('b', null, s.judged ? `${num(s.winners)} of ${num(s.judged)}` : 'none')),
          h('div', { class: 'n r' }, h('span', null, 'ROAS'), h('b', { class: dim ? 'dim' : '' }, s.roas == null ? 'no data' : x(s.roas)), s.roas != null ? meter(s.roas, d.goal_roas, { max: Math.max(d.goal_roas || 0, ...list.map(z => z.stats.roas || 0)) * 1.1 || 1, dim }) : null),
          h('div', { class: 'n s' }, h('span', null, 'Spend'), h('b', null, money(s.spend || 0))));
      }))),
    foot('Proven = won at least 1 in 5 judged tests. Dead = 2 or more judged and none won. Results are Triple Whale, last click per platform.'),
  ].filter(Boolean);
}

const CSS = `.ww-an{display:grid}
.ww-anr{display:grid;grid-template-columns:minmax(0,1.6fr) 120px 90px minmax(140px,1fr) 90px;gap:18px;align-items:center;padding:14px 28px;border:0;border-top:1px solid var(--line);background:none;text-align:left;font:inherit;color:inherit;cursor:pointer;width:100%}
.ww-anr .lx-pill{justify-self:start}.ww-anr:first-child{border-top:0}.ww-anr:hover{background:var(--surface-2)}
.ww-anr .nm b{display:block;font-size:14.5px;font-weight:600}.ww-anr .nm small{display:block;font-size:12px;color:var(--muted)}
.ww-anr .n{display:grid;gap:4px}.ww-anr .n span{font-size:10.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--faint)}
.ww-anr .n b{font-size:16px;font-weight:600;font-variant-numeric:tabular-nums}.ww-anr .n b.dim{color:var(--faint);font-weight:500}
.ww-hits{display:grid;margin-top:10px}.ww-hits>div{display:flex;align-items:center;gap:12px;padding:8px 0;border-top:1px solid var(--line)}.ww-hits>div:first-child{border-top:0}
@media (max-width:1040px){.ww-anr{grid-template-columns:minmax(0,1fr) auto;padding:14px 20px}.ww-anr .n{grid-column:1/-1}.ww-anr .s{display:none}.ww-anr .n:not(.r){display:none}}
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
