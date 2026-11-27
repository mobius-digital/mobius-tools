/* What works > Learned. "What have we learned?" The log of lessons per brand, open tests on top.
   Live data: GET /api/brand?act= (profit worker): every test with its verdict and the learning the strategist filed,
   and the tests still running with their spend against the brand's judge rule. Proof pictures come from the Meta ads
   read (GET /api/hub/creative + /api/ad-creatives). Patterns, rules and competitor lessons have no store yet: in real
   mode only test lessons show. */

import { put } from '../../kit.js';
import { h, card, kpi, takeaway, segmented, pill, avatar, gauge, em, money, num, skeleton, empty } from '../../kit.js';
import { css, gate, loadBrand, loadAds, sampleAds, art, findingButton, def, chipDef, helpBar, figs, tileRow, adThumb } from './_ww.js';

const STRENGTH_DEF = { proven: { name: 'Proven', definition: 'A test settled it.' }, likely: { name: 'Likely', definition: 'A pattern across several ads, not yet tested.' }, hunch: { name: 'A hunch', definition: 'Too few ads or orders to say.' } };
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
  if (!d.open.length) return card({ class: 'ww-cd', title: 'Open questions', note: 'Tests running now' }, h('p', { class: 'ww-cp-n' }, 'No tests are running. A brief made from any finding shows here once its ads spend.'));
  return card({ class: 'ww-cd', title: 'Open questions', note: `${num(d.open.length)} tests running, judged after ${d.open[0].need ? money(d.open[0].need) : 'the brand\'s rule'} or ${num(d.judge_days)} days · since each test first spent · spend Meta, orders Triple Whale, last click` },
    h('div', { class: 'ww-rows', style: { marginTop: '8px' } }, d.open.map(t => {
      const share = t.need ? Math.min(1, t.spend / t.need) : null;
      return h('div', { class: 'ww-l' },
        h('div', null,
          h('div', { class: 'ww-txt' }, (t.num ? '#' + t.num + ' ' : '') + t.title, h('small', null, [t.angle, t.first ? 'first spent ' + day(t.first) : null].filter(Boolean).join(', '))),
          share != null ? (() => { const g = gauge({ value: share, max: 1, thin: true, tone: t.call ? 'good' : '' }); g.title = `${money(t.spend)} of the ${money(t.need)} judge line spent` + (t.call ? ': ready for a call' : ''); return h('div', { style: { marginTop: '10px', maxWidth: '520px' } }, h('span', { class: 'ww-cp-n', style: { display: 'block', margin: '0 0 4px' } }, `Spend toward the ${money(t.need)} judge line`), g); })() : null,
          h('div', { style: { marginTop: '10px', maxWidth: '300px' } }, figs([['Spent', money(t.spend)], ['Orders', num(t.orders)]], 2))),
        h('div', { class: 'side' }, t.call ? chipDef(pill('good', 'Ready for a call'), { name: 'Ready for a call', definition: 'It has spent past the judge line (or run the days the brand\'s rule asks for), so the media buyer makes the call. The bar turns green.' }) : pill('', 'Still running')));
    })));
}

function lessonRow(l, d, ctx) {
  const ads = (l.proof || []).map(id => (d.ads || []).find(a => a.id === id)).filter(Boolean);
  const [tone, word] = STRENGTH[l.strength] || STRENGTH.likely;
  return h('div', { class: 'ww-l' },
    h('div', null,
      h('div', { class: 't' + (l.overturned ? ' off' : '') }, l.text),
      h('div', { class: 'm', style: { marginTop: '8px' } },
        chipDef(pill(tone, word), STRENGTH_DEF[l.strength] || STRENGTH_DEF.likely), l.num ? h('span', null, 'From test #' + l.num) : h('span', null, 'From: ' + (HOW[l.how] || 'Pattern').toLowerCase()),
        l.angle ? h('span', null, 'Angle: ' + l.angle) : null,
        l.orders != null ? h('span', { title: 'Orders and cost per sale: Triple Whale, last platform click, over the test\'s own days. Spend: Meta.' }, `Proof: ${num(l.orders)} orders${l.cpa ? ' at ' + money(l.cpa) + ' a sale' : ''}, Triple Whale last click, over the test`) : null,
        l.note ? h('span', null, l.note) : null,
        !ctx.isClient && l.by ? h('span', { class: 'lx-row', style: { gap: '6px' } }, 'Called by', avatar(l.by, { size: 20 }), l.by.name) : null,
        h('span', null, 'On ' + day(l.date)),
        l.overturned ? pill('bad', 'Overturned ' + day(l.overturned)) : null,
        !ctx.isClient && l.led ? h('span', null, l.led) : null),
      ads.length ? h('div', { class: 'ww-thumbs', style: { marginTop: '12px' } }, ads.map(a => adThumb(ctx, d, a, a.name))) : null),
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
    let rows = lessons.filter(l => ST.show === 'all' || (ST.show === 'month' ? (l.date || '').startsWith(month) && !l.overturned : ST.show === 'old' ? l.overturned : l.strength === ST.show && !l.overturned));
    const cut = ST.more ? rows : rows.slice(0, 12);
    put(list, ...(cut.length ? cut.map(l => lessonRow(l, d, ctx)) : [h('p', { class: 'ww-cp-n', style: { padding: '20px 0' } }, 'Nothing in this group yet.')]),
      rows.length > cut.length ? h('div', { style: { padding: '16px 0' } }, h('button', { class: 'lx-btn', type: 'button', onclick: () => { ST.more = true; paint(); } }, `Show all ${rows.length}`)) : '');
  };
  paint();
  ctx.askWindow = 'All time';
  ctx.askContext = `What works, Learned: ${num(lessons.filter(l => !l.overturned).length)} lessons logged, ${num(proven.length)} proven by a test, ${num(thisMonth.length)} this month; ${num((d.open || []).length)} tests running, ${num((d.open || []).filter(t => t.call).length)} ready for a call.`
    + (latest ? ` Latest lesson: ${latest.text.slice(0, 140)}` : '');
  return [
    helpBar([{ title: 'What it is for', text: 'Every lesson this brand has learned, newest first, with the tests still running on top. A lesson is never deleted, only marked overturned.' },
      { title: 'How strong a lesson is', text: 'Proven: a test settled it. Likely: a pattern across several ads. A hunch: too few ads or orders to say.' + (d.source === 'live' ? ' Lessons come from the learning filed with each test call; patterns, rules and competitor lessons are kept here once their store is built.' : '') }],
      { src: 'Spend from Meta. Orders and cost per sale from Triple Whale, last platform click. Tests, calls and learnings come from the brand\'s test library.' }),
    tileRow([
      kpi({ label: 'Lessons logged', value: num(lessons.filter(l => !l.overturned).length), sub: `${num(proven.length)} proven by a test`, window: 'All time', source: 'Test library' }),
      kpi({ label: 'Learned this month', value: num(thisMonth.length), sub: 'Filed with a test call', window: new Date(month + '-15T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), source: 'Test library' }),
      kpi({ label: 'Tests running', value: num((d.open || []).length), sub: `${num((d.open || []).filter(t => t.call).length)} ready for a call`, window: 'Now', source: 'Test library, spend Meta' }),
    ], 3),
    latest ? takeaway(['The latest lesson: ', h('b', null, latest.text)]) : null,
    openTests(d),
    card({ class: 'ww-cd', title: 'Every lesson', note: 'Newest first. Never deleted, only marked overturned.' },
      h('div', { class: 'ww-bar', style: { margin: '14px 0 4px' } }, segmented([{ id: 'all', label: 'All' }, { id: 'month', label: 'This month' }, { id: 'proven', label: 'Proven' }, { id: 'likely', label: 'Likely' }, { id: 'hunch', label: 'Hunches' }, { id: 'old', label: 'Overturned' }], ST.show, id => { ST.show = id; ST.more = false; paint(); })),
      lessons.length ? list : empty({ title: 'No lessons yet', text: 'A lesson is filed when a test gets its call. Make a call on a finished test and its learning shows here.' })),
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
