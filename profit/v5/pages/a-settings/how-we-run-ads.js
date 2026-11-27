/* Agency settings > How we run ads. The ad call rules as plain sentences, with their numbers in boxes you can change.
   Real mode: profit GET /api/brand/rules?act=<brand id> for every brand. Every brand holds its own copy of the call rules
   today (cr_judge_x, cr_min_days, cr_scale_buys, cr_cut_zero_x, cr_cut_spend_x, cr_cut_cpa_x, judge_days); the page opens
   on the numbers most brands hold and lists any brand that differs. The agency standard itself has no server home yet,
   so a change here is kept on this device until the settings release and no brand's rules move. */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, em, empty, card, table, statusDot } from '../../kit.js';
import { css, stage, saveBar, group, say, numBox, dayChips, fold, setHelp, exampleChip, row } from '../brand-settings/_set.js';
import { defLabel } from '../../defs.js';

/* the words in the rule sentences that need a meaning on hover */
const T = {
  results: () => defLabel('results', { title: 'Results', body: 'What the ad set is set to get: a purchase for a sales campaign, a lead for a lead campaign. Counted by Triple Whale, last platform click.' }),
  goal: () => defLabel('goal', { title: 'Goal', body: 'The brand’s goal cost for one result (Brand settings, Goals). “Spent 2x its goal” means it spent twice that cost.' }),
  goalCost: () => defLabel('goal cost', { title: 'Goal cost', body: 'The most one result should cost for this brand: cost per sale, per new customer or per lead, set in Brand settings, Goals.' }),
  roas: () => defLabel('goal ROAS', 'roas'),
  freq: () => defLabel('frequency', 'frequency'),
  ctr: () => defLabel('click rate', 'ctr'),
  mer: () => defLabel('MER', 'mer'),
};
const chipText = x => x.key === 'cr_min_days' ? 'Wait ' + x.value + ' days' : x.key === 'judge_days' ? 'Judge on ' + x.value + ' days' : WORD[x.key] + ' ' + x.value + (x.key === 'cr_scale_buys' ? '' : 'x');

const CR = ['cr_judge_x', 'cr_min_days', 'cr_scale_buys', 'cr_cut_zero_x', 'cr_cut_spend_x', 'cr_cut_cpa_x', 'judge_days'];
const WORD = { cr_judge_x: 'Wait (times goal)', cr_min_days: 'Wait (days)', cr_scale_buys: 'Scale at results', cr_cut_zero_x: 'Cut, none (times goal)', cr_cut_spend_x: 'Cut, spent (times goal)', cr_cut_cpa_x: 'Cut, over goal', judge_days: 'Judge window' };

function draw(el, data, ctx) {
  css();
  if (!data) return put(el, empty({ title: 'No rules read yet', text: 'The brands did not answer. Try again in a minute.' }));
  const S = stage(ctx), d = data.standard || {};
  const k = n => 'agency.calls.' + n;
  const n = (key, fb, o = {}) => numBox(S, k(key), d[key] ?? fb, { width: o.width || 40, ...o, label: o.label || WORD[key] || key });
  const ex = data.exceptions || [];

  put(el, h('div', { class: 'lx-st' },
    saveBar(S, ctx, { note: ctx.sample ? undefined : 'The agency standard is kept on this device until the settings release. No brand’s rules change from here yet.', help: setHelp({
      about: 'The agency standard for running ads: the rules every daily Meta ad call follows, budget and launch rules for every platform, and the sale ladder. A brand can hold its own numbers (listed below). Hover or tap a dotted word for its meaning.',
      fixed: [
        ['Attribution for every call', 'Triple Whale, last platform click', 'Meta’s own count is a second opinion only. Not a setting.'],
        ['Undo', '24 hours on every change ' + APP_NAME + ' makes', 'Every change lands in Changes.'],
        ['Paused for 14 days', 'Never switched back on by ' + APP_NAME, 'A person turns it back on.'],
        ['A new prospecting ad set', 'Never turned off for weak ROAS', 'Its job is finding new buyers. Fix it with new ads.'],
      ] }) }),
    group('The daily Meta ad call', 'Meta. Every call follows these, in this order. The goal is each brand’s own.',
      say(h('b', null, 'Wait. '), 'Make no call on an ad set until it has spent ', n('cr_judge_x', 2, { suffix: 'x' }), ' its ', T.goal(), ' and run ', n('cr_min_days', 3, { suffix: 'days', width: 34 }), '.'),
      say(h('b', null, 'Ad set first. '), 'Judge the ad set before its ads. The ad taking most of the spend in a working set stays on: replace it, do not kill it.'),
      say(h('b', null, 'Scale '), 'an ad set with ', n('cr_scale_buys', 3), ' or more ', T.results(), ' on goal, or at the ', T.roas(), '. Raise it ', n('raise_pct', 20, { suffix: '%', label: 'Raise step' }), ' and watch ', n('watch_days', 3, { suffix: 'days', width: 34, label: 'Watch days' }), '.'),
      say(h('b', null, 'Cut '), 'when it spent ', n('cr_cut_zero_x', 3, { suffix: 'x' }), ' the goal with no result, or ', n('cr_cut_spend_x', 3, { suffix: 'x' }), ' the goal at more than ', n('cr_cut_cpa_x', 1.5, { suffix: 'x', step: 0.1 }), ' the ', T.goalCost(), '. Never while its ROAS beats the goal ROAS.'),
      say(h('b', null, 'Refresh '), 'when the ', T.ctr(), ' falls ', n('refresh_ctr', 20, { suffix: '%', label: 'Click rate drop' }), ' and ', T.freq(), ' rises.'),
      say(h('b', null, 'Slow ad sets '), 'with fewer than ', n('slow_results', 7, { label: 'Slow results a week' }), ' results a week are judged on ', n('slow_days', 14, { suffix: 'days', width: 34, label: 'Slow window' }), '.')),
    group('Budgets and launches', 'All platforms',
      say('Never move a budget more than ', n('max_step', 50, { suffix: '%', label: 'Largest step' }), ' in one step.'),
      say('A lead costs ', n('cpl_lo', 0.5, { prefix: '$', step: 0.05, width: 44, label: 'Lead cost low' }), ' to ', n('cpl_hi', 0.75, { prefix: '$', step: 0.05, width: 44, label: 'Lead cost high' }), ' on goal. Under the low end, scale hard.'),
      row('Launch days', 'New ads wait for the next launch day. A brand can keep its own.', dayChips(S, k('launch_days'), d.launch_days || ['mon', 'thu']))),
    group('In a sale', 'All platforms. Black Friday and every sale weekend, on whole store MER',
      say(T.mer(), ' at ', n('ladder_hi', 1.5, { suffix: 'x', step: 0.1, label: 'Raise hard at' }), ' the goal: raise ', n('ladder_hi_pct', 50, { suffix: '%', label: 'Raise hard by' }), '. At the goal: raise ', n('ladder_on_pct', 25, { suffix: '%', label: 'Raise by' }), '. Under break-even: cut ', n('ladder_cut_pct', 25, { suffix: '%', label: 'Cut by' }), '.')),
    card({ title: 'Brands with their own numbers', note: ex.length ? ex.length + (ex.length === 1 ? ' brand differs' : ' brands differ') + ' from the standard' : 'None. Every brand runs the standard.', flush: true, class: 'lx-st-card',
      action: data.example ? exampleChip() : null },
      ex.length ? table({ cols: [
        { key: 'name', label: 'Brand', render: r => h('b', null, r.name) },
        { key: 'diff', label: 'Its own numbers', render: r => h('span', { class: 'lx-hw-chips' }, r.diff.map(x => h('span', { class: 'lx-chip' }, chipText(x)))) },
        { key: 'go', label: '', num: true, class: 'hide-sm', render: r => h('a', { class: 'lx-hw-open', href: '#/brand/' + String(r.id).replace(/^brand_/, '').replace(/_/g, '-') + '/brand-settings/goals', 'aria-label': 'Open ' + (r.name || 'this brand') + ' goals' }, 'Open', h('span', { 'aria-hidden': 'true' }, ' ›')) },
      ], rows: ex }) : null),
    fold('Advanced', 'Guards rarely touched',
      say('An opener ad counts as working at ', n('opener_x', 1.3, { suffix: 'x', step: 0.1, label: 'Opener first click' }), ' first click and ', n('opener_sales', 2, { label: 'Opener sales' }), ' sales.'),
      say('The best ad set needs ', n('best_share', 25, { suffix: '%', label: 'Best set share' }), ' of results and ', n('best_results', 3, { label: 'Best set results' }), ' results.'),
      say('Flag a tracking gap at ', n('gap_sales', 3, { label: 'Gap sales' }), ' sales and ', n('gap_pct', 30, { suffix: '%', label: 'Gap share' }), ' apart.'),
      say('A stalled ad set spent under ', n('stall_spend', 20, { prefix: '$', label: 'Stalled spend' }), ' in 7 days.'),
      say('Hold a raise when the month is under ', n('hold_pace', 70, { suffix: '%', label: 'Hold under pace' }), ' of pace.')),
  ));
}

export default {
  title: ['How do we ', em('run ads?')],
  eyebrow: 'Agency settings',
  ranges: false,
  stamp: false,                  /* a form or a conversation, not numbers: no "updated" stamp in the head */
  async load(ctx) {
    const list = (ctx.brands || []).slice(0, 40);
    const got = await Promise.all(list.map(b => ctx.api('/api/brand/rules?act=' + encodeURIComponent(b.id), { signal: ctx.signal }).then(j => ({ b, r: j.rules || {} })).catch(e => { if (e && e.name === 'AbortError') throw e; return null; })));
    const rows = got.filter(Boolean);
    /* the standard = the value most brands hold, key by key */
    const standard = {};
    for (const key of CR) {
      const count = new Map();
      for (const { r } of rows) if (r[key] != null) count.set(+r[key], (count.get(+r[key]) || 0) + 1);
      const top = [...count].sort((a, b) => b[1] - a[1])[0];
      if (top) standard[key] = top[0];
    }
    const exceptions = rows.map(({ b, r }) => ({ id: b.id, name: b.name, diff: CR.filter(key => r[key] != null && standard[key] != null && +r[key] !== standard[key]).map(key => ({ key, value: +r[key] })) })).filter(x => x.diff.length);
    return { standard, exceptions, example: false };
  },
  render: draw,
};

import { addStyles } from '../../kit.js';
addStyles('lx-hw-css', `.lx-hw-chips{display:inline-flex;gap:6px;flex-wrap:wrap}
.lx-hw-open{font-size:13px;font-weight:600;color:var(--ink-2);text-decoration:none;white-space:nowrap}
.lx-hw-open:hover{color:var(--ink);text-decoration:underline}`);
