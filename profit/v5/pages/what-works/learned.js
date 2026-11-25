/* What works > Learned. "What have we learned?" The log of lessons per brand, open tests on top.
   Live data: GET /api/brand?act= (profit worker): every test with its verdict and the learning the strategist filed,
   and the tests still running with their spend against the brand's judge rule. Proof pictures come from the Meta ads
   read (GET /api/hub/creative + /api/ad-creatives). Patterns, rules and competitor lessons have no store yet: in real
   mode only test lessons show. */

import { put } from '../../kit.js';
import { h, card, kpi, kpis, takeaway, segmented, pill, avatar, gauge, em, money, num, skeleton, empty } from '../../kit.js';
import { css, gate, loadBrand, loadAds, sampleAds, art, findingButton, foot } from './_ww.js';
import { fixture } from '../../data.js';

const HOW = { test: 'Test', pattern: 'Pattern', rule: 'Rule', competitor: 'Seen at a competitor' };
const STRENGTH = { proven: ['good', 'Proven'], likely: ['', 'Likely'], hunch: ['warn', 'A hunch'] };
const day = d => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const ST = { show: 'all', more: false };

async function load(ctx) {
  if (!ctx.brand) return { state: 'none' };
  const [b, ads] = await Promise.all([loadBrand(ctx), loadAds(ctx, { covers: true }).catch(() => null)]);
  if (!b) return { state: 'error', error: 'The brand library did not load.' };
  const rules = b.rules || {};
  const need = +rules.judge_spend || (rules.target_cpa ? rules.target_cpa * 3 : null);
  const ang = Object.fromEntries((b.angles || []).map(a => [a.id, a.name]));
  const batches = b.batches || [];
  const lessons = batches.filter(x => x.learning || ['winner', 'loser'].includes(x.verdict)).map(x => ({
    text: x.learning || `${x.title}: ${x.verdict === 'winner' ? 'it won' : 'it lost'}.`,
    how: 'test', strength: x.thin ? 'hunch' : ['winner', 'loser'].includes(x.verdict) ? 'proven' : 'likely',
    num: x.num, angle: ang[x.angle_id] || null, by: x.verdict_by && x.verdict_by !== 'staff' ? { name: x.verdict_by } : null,
    date: String(x.verdict_at || x.updated_at || '').slice(0, 10), spend: (x.stats || {}).spend, orders: (x.stats || {}).orders, cpa: (x.stats || {}).cpa,
    proof: (x.ad_ids || []).slice(0, 4),
  })).sort((p, q) => String(q.date).localeCompare(String(p.date))).slice(0, 80);
  const open = batches.filter(x => x.box === 'running' || x.box === 'call').map(x => ({
    num: x.num, title: x.title, angle: ang[x.angle_id] || null, spend: (x.stats || {}).spend || 0, orders: (x.stats || {}).orders || 0,
    first: (x.stats || {}).first || null, need, call: x.box === 'call',
  })).sort((p, q) => (q.call ? 1 : 0) - (p.call ? 1 : 0) || q.spend - p.spend);
  return { state: 'ok', source: 'live', goal_cpa: rules.target_cpa || null, judge_days: rules.judge_days || 7, open, lessons,
    ads: ads && ads.ads ? ads.ads.filter(a => a.thumb).map(a => ({ id: a.id, name: a.name, kind: a.kind, thumb: a.thumb })) : [] };
}

function openTests(d) {
  if (!d.open.length) return card({ class: 'ww-cd', title: 'Open questions', note: 'Tests running now' }, h('p', { class: 'lx-foot', style: { marginTop: '10px' } }, 'No tests are running. A brief made from any finding shows here once its ads spend.'));
  return card({ class: 'ww-cd', title: 'Open questions', note: `${num(d.open.length)} tests running, judged after ${d.open[0].need ? money(d.open[0].need) : 'the brand\'s rule'} or ${num(d.judge_days)} days` },
    h('div', { class: 'ww-rows', style: { marginTop: '8px' } }, d.open.map(t => {
      const share = t.need ? Math.min(1, t.spend / t.need) : null;
      return h('div', { class: 'ww-l' },
        h('div', null,
          h('div', { class: 'ww-txt' }, (t.num ? '#' + t.num + ' ' : '') + t.title, h('small', null, [t.angle, t.first ? 'first spent ' + day(t.first) : null].filter(Boolean).join(', '))),
          share != null ? h('div', { style: { marginTop: '10px', maxWidth: '520px' } }, gauge({ value: share, max: 1, thin: true, tone: t.call ? 'good' : '' })) : null),
        h('div', { class: 'side' }, t.call ? pill('good', 'Ready for a call') : pill('', 'Still running'),
          h('span', { class: 'lx-foot' }, `${money(t.spend)}${t.need ? ' of ' + money(t.need) : ''} spent, ${num(t.orders)} ${t.orders === 1 ? 'order' : 'orders'}`)));
    })));
}

function lessonRow(l, d, ctx) {
  const ads = (l.proof || []).map(id => (d.ads || []).find(a => a.id === id)).filter(Boolean);
  const [tone, word] = STRENGTH[l.strength] || STRENGTH.likely;
  return h('div', { class: 'ww-l' },
    h('div', null,
      h('div', { class: 't' + (l.overturned ? ' off' : '') }, l.text),
      h('div', { class: 'm', style: { marginTop: '8px' } },
        pill(tone, word), h('span', null, HOW[l.how] || 'Pattern'), l.num ? h('span', null, 'Test #' + l.num) : null,
        l.angle ? h('span', null, l.angle) : null,
        l.orders != null ? h('span', null, `${num(l.orders)} orders${l.cpa ? ', ' + money(l.cpa) + ' a sale' : ''}`) : null,
        l.note ? h('span', null, l.note) : null,
        !ctx.isClient && l.by ? h('span', { class: 'lx-row', style: { gap: '6px' } }, avatar(l.by, { size: 20 }), l.by.name) : null,
        h('span', null, day(l.date)),
        l.overturned ? pill('bad', 'Overturned ' + day(l.overturned)) : null,
        !ctx.isClient && l.led ? h('span', null, l.led) : null),
      ads.length ? h('div', { class: 'ww-thumbs', style: { marginTop: '12px' } }, ads.map(a => h('div', null, art(a), h('small', null, a.name)))) : null),
    h('div', { class: 'side' }, l.overturned ? null : findingButton(ctx, () => ({
      say: l.text, measure: l.how === 'test' ? 'test result' : 'pattern',
      proof: ads.slice(0, 3).map(a => ({ value: a.ctr || 0.01, text: a.ctr ? (100 * a.ctr).toFixed(1) + '%' : a.name, name: a.name, sub: a.kind === 'video' ? 'video' : 'still' })),
      brief: { title: 'Build on: ' + l.text.slice(0, 48) + (l.text.length > 48 ? '...' : ''), make: 'Three new ads that use this lesson', why: l.text, count: 3 },
    }), 'Make new ads from this')));
}

function view(d, ctx) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  const lessons = d.lessons || [];
  const month = (ctx.range ? ctx.range.to : '').slice(0, 7) || new Date().toISOString().slice(0, 7);
  const thisMonth = lessons.filter(l => (l.date || '').startsWith(month) && !l.overturned);
  const proven = lessons.filter(l => l.strength === 'proven' && !l.overturned);
  const latest = proven[0] || lessons.find(l => !l.overturned);
  const list = h('div', { class: 'ww-rows' });
  const paint = () => {
    let rows = lessons.filter(l => ST.show === 'all' || (ST.show === 'old' ? l.overturned : l.strength === ST.show && !l.overturned));
    const cut = ST.more ? rows : rows.slice(0, 12);
    put(list, ...(cut.length ? cut.map(l => lessonRow(l, d, ctx)) : [h('p', { class: 'lx-foot', style: { padding: '20px 0' } }, 'Nothing in this group yet.')]),
      rows.length > cut.length ? h('div', { style: { padding: '16px 0' } }, h('button', { class: 'lx-btn', type: 'button', onclick: () => { ST.more = true; paint(); } }, `Show all ${rows.length}`)) : '');
  };
  paint();
  return [
    kpis([
      kpi({ label: 'Lessons logged', value: num(lessons.filter(l => !l.overturned).length), sub: `${num(proven.length)} proven by a test`, size: 'lg' }),
      kpi({ label: 'Learned this month', value: num(thisMonth.length), size: 'lg' }),
      kpi({ label: 'Tests running', value: num((d.open || []).length), sub: `${num((d.open || []).filter(t => t.call).length)} ready for a call`, size: 'lg' }),
    ], { cols: 3 }),
    latest ? takeaway(['The latest lesson: ', h('b', null, latest.text)]) : null,
    openTests(d),
    thisMonth.length ? card({ class: 'ww-cd', title: 'Learned this month', note: 'The top lines, as they go on the Monday meeting page' },
      h('ol', { class: 'ww-month' }, thisMonth.slice(0, 5).map(l => h('li', null, l.text, ' ', pill(STRENGTH[l.strength][0], STRENGTH[l.strength][1]))))) : null,
    card({ class: 'ww-cd', title: 'Every lesson', note: 'Newest first. Never deleted, only marked overturned.' },
      h('div', { class: 'ww-bar', style: { margin: '14px 0 4px' } }, segmented([{ id: 'all', label: 'All' }, { id: 'proven', label: 'Proven' }, { id: 'likely', label: 'Likely' }, { id: 'hunch', label: 'Hunches' }, { id: 'old', label: 'Overturned' }], ST.show, id => { ST.show = id; ST.more = false; paint(); })),
      lessons.length ? list : empty({ title: 'No lessons yet', text: 'A lesson is filed when a test gets its call. Make a call on a finished test and its learning shows here.' })),
    foot(d.source === 'live' ? 'Lessons come from the learning filed with each test call. Patterns, rules and competitor lessons are kept here once their store is built.' : null,
      'Proven = a test settled it. Likely = a pattern across several ads. A hunch = too few ads or orders to say.'),
  ].filter(Boolean);
}

export default {
  title: ['What have we ', em('learned?')],
  eyebrow: 'What works',
  ranges: false,
  load,
  async sample() { const [d, a] = await Promise.all([fixture('what-works/_sample/learned.json'), sampleAds()]); d.ads = a.ads; return d; },
  skeleton(el) { put(el, skeleton('kpi', 3), skeleton('row', 6)); },
  render(el, d, ctx) {
    css();
    if (!document.getElementById('ww-l-css')) { const st = document.createElement('style'); st.id = 'ww-l-css'; st.textContent = '.ww-month{margin:14px 0 0;padding-left:20px;display:grid;gap:10px;font-size:15px;line-height:1.4}.ww-month .lx-pill{margin-left:6px;vertical-align:1px}'; document.head.append(st); }
    put(el, ...view(d, ctx));
  },
};
