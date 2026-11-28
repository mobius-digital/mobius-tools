/* Brand settings > Goals. You give Locus four facts and it works out every goal from them, live as you type.
   Real mode reads the goals in use today from the brand list (account-health GET /api/brands), this month's sales
   goal and month to date from the plan (profit GET /api/plan, pace or actual, see _mtd.js) and the platform goals from the test rules (profit GET /api/brand/rules).
   The four facts have no server home yet, so they are kept on this device, and they never save a goal by themselves.
   Clients see this page and save from it too; the server logs every client change (activities) and puts a bell note
   on the team (brandguard clientAudit).
   WRITES SWITCHED ON (each behind the confirm sheet in _set.js, with its own error state):
     the goal ROAS and the goal cost the person types   account-health PUT /api/accounts/<brand id> { target_roas } / { target_cpa }
     the test and call rules for this brand             profit PUT /api/brand/rules?act=<brand id> { rules: { <name>: <number> } } */

import { put } from '../../kit.js';
import { mtdOf } from './_mtd.js';
import { h, hero, card, gauge, takeaway, kpis, kpi, statusDot, money, x, pct, em, empty, platformChip, addStyles } from '../../kit.js';
import { AI_NAME, APP_NAME } from '../../config.js';
import { css, stage, saveBar, numBox, seg, exampleChip, fold, say, setHelp } from './_set.js';
import { defLabel } from '../../defs.js';

/* hover definitions this page needs that the shared glossary does not have. Only the terms that are not obvious
   (MER, ROAS, break-even, goal MER, goal cost per new customer) carry the dotted mark; plain words are plain text
   and the help bar explains the rest. */
const DEF = {
  goal_roas: { title: 'Goal ROAS in use (all ads)', body: 'The ROAS every platform and campaign is judged on, unless a platform has its own goal below. Saved for everyone. ROAS is one platform or campaign: Triple Whale attributed sales (last click) divided by its spend.' },
  platform_goal: { title: 'Platform goal ROAS', body: 'Used instead of the all-ads goal ROAS for ads on this platform only.' },
  goal_cac: { title: 'Goal cost per new customer', body: 'The most the ads should spend to win one new customer and still leave the cents you asked for. Ad spend divided by new customers.' },
};

const ok = n => n != null && isFinite(n) && n > 0;
const STANCE = [{ id: 'profit', label: 'Profit now' }, { id: 'balanced', label: 'Balanced' }, { id: 'growth', label: 'Growth' }];
/* a label is drawn only when it has room: the hero number already says where MER is now */
const far = (v, others, max) => others.every(o => !ok(o) || Math.abs(v - o) / max > 0.2);
const STANCE_LEFT = { profit: 34, balanced: 22, growth: 10 };

/** Every goal from the four facts. Returns null fields when a fact is missing, never a made-up number. */
export function workOut({ keep, fixed, goal, left, first }) {
  const k = ok(keep) ? keep / 100 : null, l = left != null && isFinite(left) ? left / 100 : null;
  const fixedShare = k && ok(fixed) && ok(goal) ? fixed / goal : null;
  const be = k ? 1 / k : null;
  const beFixed = k && fixedShare != null && k - fixedShare > 0 ? 1 / (k - fixedShare) : null;
  const goalMer = k && l != null && k - l > 0 ? 1 / (k - l) : null;
  const beCac = k && ok(first) ? first * k : null;
  const goalCac = beCac != null && l != null ? Math.max(0, beCac - l * first) : null;
  return { k, l, fixedShare, be, beFixed, goalMer, beCac, goalCac };
}

function draw(el, data, ctx) {
  css();
  if (!data) return put(el, empty({ title: 'No brand picked', text: 'Pick a brand to see its goals.' }));
  const id = ctx.brand ? ctx.brand.id : 'none', key = n => 'brand:' + id + '.goal_' + n;
  const inp = data.inputs || {}, f = data.facts || {}, use = data.in_use || {}, ex = new Set(data.example || []);
  /* The two goals every page reads, and the test and call rules, are the writes switched on here.
       goal ROAS, goal cost   ctx.saveSetting -> account-health PUT /api/accounts/<brand id> { target_roas } / { target_cpa }
       a rule                 profit PUT /api/brand/rules?act=<brand id> { rules: { <name>: <number> } } (the worker merges one name at a time)
     Both go through the confirm sheet on Save. The four facts have no server home and stay on this device. */
  const live = n => 'brand:' + id + '.' + n, rk = n => 'brand:' + id + '.rule_' + n;
  const R = data.rules || null;
  const RULES = [['cr_judge_x', 'Wait, times the goal'], ['cr_min_days', 'Wait, days'], ['cr_scale_buys', 'Scale at results'], ['cr_cut_zero_x', 'Cut with no result, times the goal'],
    ['cr_cut_spend_x', 'Cut when spent, times the goal'], ['cr_cut_cpa_x', 'Cut when over the goal cost by'], ['judge_days', 'Judge a test after days'], ['judge_spend', 'Judge a test after spend']];
  const liveNow = { [live('target_roas')]: ok(use.target_roas) ? use.target_roas : null, [live('target_cpa')]: ok(use.target_cpa) ? use.target_cpa : null };
  const savers = {}, names = { [live('target_roas')]: 'Goal ROAS', [live('target_cpa')]: 'Goal cost per new customer' };
  for (const [n, label] of RULES) {
    names[rk(n)] = label;
    if (R) liveNow[rk(n)] = R[n] ?? null;
    if (R && !ctx.sample && ctx.brand) savers[rk(n)] = v => ctx.api('/api/brand/rules?act=' + encodeURIComponent(ctx.brand.id), { method: 'PUT', body: { rules: { [n]: v == null || !isFinite(v) || v < 0 ? 0 : +v } } });
  }
  const S = stage(ctx, { live: liveNow, savers, names });
  const mine = n => S.has(key(n));                   // a fact the person has not typed (and the server did not give) is still the example
  const read =() => ({ keep: S.get(key('keep'), inp.keep_pct), fixed: S.get(key('fixed'), inp.fixed_costs), goal: S.get(key('sales'), inp.sales_goal),
    left: S.get(key('left'), inp.left_cents), stance: S.get(key('stance'), inp.stance || 'profit'), first: f.first_order });

  /* the hero: MER now, on a track from break-even to goal */
  const top = h('div'), outs = h('div', { class: 'lx-st-rows' }), steps = h('div', { class: 'lx-gl-in' });
  const mer = data.mtd && ok(data.mtd.spend) && data.mtd.sales != null ? data.mtd.sales / data.mtd.spend : null;

  const paintTop = () => {
    const v = read(), w = workOut(v);
    /* the bar marks the goal in use (the saved goal ROAS, or what is typed in its box), the same goal Home reads;
       the worked out goal MER stands in only when no goal is set */
    const inUse = S.get(live('target_roas'), liveNow[live('target_roas')]);
    const goalNow = ok(+inUse) ? +inUse : w.goalMer;
    if (mer == null) return put(top, empty({ title: 'No sales source yet', text: 'MER needs store sales and ad spend. ' + (ctx.isClient ? '' : 'Connect the store under Integrations.') }));
    const tone = w.be && mer < w.be ? 'bad' : goalNow && mer >= goalNow ? 'good' : 'warn';
    const word = tone === 'bad' ? 'Under break-even' : tone === 'good' ? 'On goal' : w.be ? 'Above break-even, under goal' : 'No break-even yet';
    const max = Math.max(mer, goalNow || 0, w.be || 0) * 1.25;
    put(top, hero({ line: true },
      h('div', { class: 'lx-gl-top' },
        h('span', { class: 'lx-hero-num' }, x(mer)), h('span', { class: 'lab' }, defLabel('Store MER', 'mer'), ', ' + (data.mtd.dates || monthDates())), statusDot(tone, word),
        h('span', { class: 'lx-sp' }), h('span', { class: 'src' }, 'store sales ' + money(data.mtd.sales) + ' / all ad spend ' + money(data.mtd.spend) + ' · ' + (data.mtd.source || 'Triple Whale'))),
      gauge({ value: mer, max, goal: goalNow || undefined, tone, ticks: [
        w.be && { at: w.be, text: 'Break-even ' + x(w.be) }, far(mer, [w.be, goalNow], max) && { at: mer, text: 'Now ' + x(mer), on: true }, goalNow && { at: goalNow, text: 'Goal ' + x(goalNow) }].filter(Boolean) }),
      /* the gauge already shows now, break-even and goal: a line only when it adds something the gauge does not */
      w.be && goalNow
        ? (mer < goalNow ? takeaway(['At this ad spend the store needs ', h('b', null, money(Math.round((goalNow - mer) * data.mtd.spend))), ' more sales to reach the goal.']) : null)
        : takeaway('Fill in the four facts below to see break-even and the goal.')));
  };

  /* what Locus works out: each number shows its working, and the number in use today beside it */
  const outRow = (name, working, value, small, uCell) => h('div', { class: 'lx-gl-out' },
    h('div', null, h('div', { class: 'k' }, name), h('div', { class: 'w' }, working)),
    h('div', { class: 'v' }, h('b', null, value), small && h('small', null, small)),
    uCell || h('div', { class: 'u' }, statusDot('off', 'Worked out')));
  const cents = n => Math.round(n * 100) + '¢';
  const near = (a, b) => ok(a) && ok(b) && Math.abs(a - b) / b < 0.02;
  /* The goal in use is a box the person types in. The worked out number never saves itself: "Use" copies it in,
     and only when it was worked from this brand's own numbers, never from the example facts. Save asks first. */
  const goalCell = (name, liveKey, opts, show, worked, own) => {
    const state = h('span'), use1 = h('span');
    const box = numBox(S, liveKey, liveNow[liveKey], { ...opts, label: name, onInput: () => { bits(); paintTop(); } });
    function bits() {
      const now = S.get(liveKey, null), was = liveNow[liveKey], w = worked();
      state.replaceChildren(ok(now) && ok(was) && +now !== +was ? statusDot('warn', 'Not saved yet, was ' + show(was)) : !ok(now) ? statusDot('off', 'Not set') : !ok(was) ? statusDot('warn', 'Not saved yet') : w == null ? statusDot('off', 'In use today') : near(now, w) ? statusDot('good', 'Matches the working') : statusDot('warn', 'Set by hand'));
      use1.replaceChildren(w == null || near(now, w) ? '' : own() ? h('button', { class: 'lx-btn quiet', type: 'button', onclick: () => { box.querySelector('input').value = w; S.set(liveKey, w); bits(); } }, 'Use ' + show(w)) : h('small', null, 'Worked from example facts, so type the goal yourself.'));
    }
    const cell = h('div', { class: 'u' }, name === 'Goal ROAS' ? defLabel('Goal ROAS in use (all ads)', DEF.goal_roas) : defLabel('Goal cost in use', DEF.goal_cac), box, state, use1);
    cell.bits = bits;
    return cell;
  };
  const workedNow = () => workOut(read());
  const roasCell = goalCell('Goal ROAS', live('target_roas'), { suffix: 'x', step: 0.05, width: 54 }, v => x(+v),
    () => { const w = workedNow(); return w.goalMer ? Math.round(w.goalMer * 100) / 100 : null; }, () => ctx.sample || ((mine('keep') || !!data.own_keep) && mine('left')));
  const cpaCell = goalCell('Goal cost per new customer', live('target_cpa'), { prefix: '$', step: 1, width: 54 }, v => money(+v),
    () => { const w = workedNow(); return w.goalCac != null ? Math.round(w.goalCac) : null; }, () => ctx.sample || (!ex.has('facts') && (mine('keep') || !!data.own_keep) && mine('left')));
  const paintOut = () => {
    const v = read(), w = workOut(v);
    const need = what => 'Needs ' + what + '.';
    roasCell.bits(); cpaCell.bits();
    put(outs,
      h('div', { class: 'lx-gl-out head' }, h('div', null, 'Goal'), h('div', { class: 'v' }, 'Worked out'), h('div', { class: 'u' }, 'In use today')),
      outRow(defLabel('Break-even MER', 'break_even_mer'), w.be ? `An order keeps ${cents(w.k)} of each dollar, so ads can take up to ${cents(w.k)}. 1 / ${w.k.toFixed(2)}.` : need('what an order keeps'), w.be ? x(w.be) : 'not set', 'whole store'),
      outRow(defLabel('Break-even MER with fixed costs', { title: 'Break-even MER with fixed costs', body: 'The store MER where ads use up the profit on sales and the monthly fixed costs too (rent, people, software).' }), w.beFixed ? `Fixed costs are ${money(v.fixed)} a month, ${pct(w.fixedShare, { digits: 1 })} of sales at this goal. 1 / (${w.k.toFixed(2)} minus ${w.fixedShare.toFixed(3)}).` : need('fixed costs and a sales goal'), w.beFixed ? x(w.beFixed) : 'not set', 'whole store'),
      outRow(defLabel('Goal MER', 'target_mer'), w.goalMer ? `You want ${cents(w.l)} left after ads. 1 / (${w.k.toFixed(2)} minus ${w.l.toFixed(2)}).` : need('what an order keeps and the stance'), w.goalMer ? x(w.goalMer) : 'not set', 'whole store', roasCell),
      outRow(defLabel('Goal cost per new customer', DEF.goal_cac), w.goalCac != null ? `A first order is ${money(v.first)} and keeps ${cents(w.k)} of each dollar, so break-even is ${money(Math.round(w.beCac))}. Goal: ${money(Math.round(w.beCac))} minus ${cents(w.l)} of ${money(v.first)}.` : need('the first order size from the store'),
        w.goalCac != null ? money(Math.round(w.goalCac)) : 'not set', w.beCac != null ? 'break-even ' + money(Math.round(w.beCac)) : null, cpaCell),
      ...[['meta', use.goal_meta], ['google', use.goal_google], ['tiktok', use.goal_tiktok]].filter(p => ok(p[1])).map(([p, g]) =>
        h('div', { class: 'lx-gl-out' }, h('div', null, h('div', { class: 'k' }, platformChip(p, { label: ' ' }), defLabel('Goal ROAS, ' + ({ meta: 'Meta', google: 'Google', tiktok: 'TikTok' })[p], DEF.platform_goal)), h('div', { class: 'w' }, 'Used instead of the all-ads goal for this platform. Triple Whale credited sales, last click.')),
          h('div', { class: 'v' }, h('b', null, x(g))), h('div', { class: 'u' }, statusDot('warn', 'Set by hand')))));
  };

  /* the four facts */
  const step = (n, title, control, hint) => h('div', { class: 'lx-gl-step' }, h('div', { class: 'k' }, title), h('div', { class: 'c' }, control), hint ? h('p', { class: 'hint' }, hint) : null);
  /* a change to the facts redraws the working. It never stages a goal by itself (see goalCell). */
  const again = () => { paintTop(); paintOut(); };
  const leftBox = numBox(S, key('left'), inp.left_cents, { suffix: '¢', max: 90, onInput: again, label: 'Cents left after ads' });
  steps.append(
    step(1, 'What an order keeps', numBox(S, key('keep'), inp.keep_pct, { suffix: '%', max: 100, onInput: again, label: 'What an order keeps' }),
      ok(f.order_size) && ok(f.product) ? `${money(f.order_size)} order: ${money(f.product)} product, ${money(f.postage)} postage, ${money(f.fees)} fees. Keeps ${money(f.order_size - f.product - f.postage - f.fees)} before ads.` : 'The share of each sales dollar left after product, postage and fees, before ads.'),
    step(2, 'Fixed costs a month', numBox(S, key('fixed'), inp.fixed_costs, { prefix: '$', step: 100, width: 76, onInput: again, label: 'Fixed costs a month' }), 'Optional. Rent, people, software: what you pay whether or not an order comes in.'),
    step(3, (data.month || 'This month') + ' sales goal', numBox(S, key('sales'), inp.sales_goal, { prefix: '$', step: 1000, width: 86, onInput: again, label: 'Sales goal' }), ex.has('sales_goal') ? 'Agreed with the client on the plan.' : 'Read from the plan agreed with the client.'),
    step(4, 'Stance', [seg(S, key('stance'), inp.stance || 'profit', STANCE), h('span', { class: 'lx-gl-left' }, 'Left after ads, per sales dollar', leftBox)],
      'Profit now keeps the most; Growth spends it on new customers.'));
  S.onChange((k2, v2) => { if (k2 === key('stance') && v2 in STANCE_LEFT) { leftBox.querySelector('input').value = STANCE_LEFT[v2]; S.set(key('left'), STANCE_LEFT[v2]); } if (k2 === null || k2 === key('stance')) again(); });

  const factList = [
    ok(f.order_size) && { label: 'Order size', value: money(f.order_size), sub: 'paying orders only', window: 'Last 90 days', source: 'Triple Whale' },
    ok(f.first_order) && { label: 'First order size', value: money(f.first_order), sub: 'new customers', window: 'Last 90 days', source: 'Triple Whale' },
    f.repeat_90 != null && { label: 'Order again', value: pct(f.repeat_90, { digits: 1 }), sub: 'within 90 days of a first order', window: 'Last 90 days', source: 'Triple Whale' },
    f.returning_share != null && { label: 'Returning sales', value: pct(f.returning_share), sub: 'of store sales', window: 'Last 90 days', source: 'Triple Whale' },
    ok(f.store_mer_90) && { label: defLabel('Store MER', 'mer'), value: x(f.store_mer_90), window: 'Last 90 days', source: 'Triple Whale' },
  ].filter(Boolean);

  const rule = (n, o = {}) => numBox(S, rk(n), R ? R[n] : null, { width: 40, ...o, label: names[rk(n)] });
  /* after a save the goal cells read "in use today" again */
  S.onChange(k2 => { if (k2 === null) { roasCell.bits(); cpaCell.bits(); } });

  paintTop(); paintOut();
  put(el, h('div', { class: 'lx-st' },
    saveBar(S, ctx, { label: 'Save goals', note: data.saved ? 'Saved ' + data.saved.at + ' by ' + data.saved.by + '.' : undefined, help: setHelp({
      about: 'You give ' + APP_NAME + ' four facts about the brand and it works out break-even and the goals from them, live as you type. Save shows every change first, then writes the goal ROAS, the goal cost and the rules for everyone.' + (ctx.isClient ? ' Changes you make are logged and your team is told.' : ' A change a client makes is logged and the team gets a bell note.'),
      sections: [
        { title: 'Store MER and ROAS', text: 'Store MER is the whole store: all sales divided by all ad spend. ROAS is one platform or campaign: the sales Triple Whale credits to it, divided by its own spend. Hover or tap any dotted label for its meaning.' },
        { title: 'The four facts', text: 'What an order keeps is the share of each sales dollar left after product cost, postage and payment fees, before any ad spend (the margin). Left after ads is the cents of each sales dollar you want to keep once ads are paid: more cents left means a higher goal MER and less spend on new customers.' },
        { title: 'What ' + APP_NAME + ' reads itself', text: 'Order size is store sales divided by orders, paying orders only ($0 and creator sample orders left out). First order size is the same for a new customer\'s first order. Order again is the share of new customers who order a second time within 90 days. Returning sales is the share of store sales from customers who had ordered before.' },
      ],
      fixedTitle: 'How goals are used',
      fixed: [
        ['Used by', 'Home, This month, Suggestions, Black Friday, Reports, Ask ' + APP_NAME + ' AI', 'One set of goals, read everywhere.'],
        ['Ad call rules', data.rules_exception ? 'This brand has its own numbers' : 'Agency standard, the same for every brand', 'Change them in Agency settings, How we run ads.'],
        ['Attribution', 'Triple Whale, last platform click', 'Every sale and every ROAS. Not a setting.'],
        ['Months', 'Calendar months', 'Goals, pace and plans are all kept by calendar month.'],
      ] }) }),
    top,
    card({ title: 'What you tell ' + APP_NAME, note: ex.has('inputs') ? exampleChip() : '4 facts' }, steps),
    card({ title: 'What ' + APP_NAME + ' works out', note: 'Each number shows its working. A number set by hand never wins silently.', flush: true, class: 'lx-st-card' }, outs),
    factList.length ? card({ title: APP_NAME + ' reads these itself', note: ex.has('facts') ? exampleChip() : 'Facts from the store and Triple Whale, not settings.' }, h('div', { class: 'lx-gl-facts' }, kpis(factList.map(kpi), { cols: factList.length }))) : null,
    R ? fold('Test and call rules for this brand', ctx.sample ? 'Sample numbers' : 'Saved for everyone, after you confirm',
      say(h('b', null, 'Wait. '), 'Make no call on an ad set until it has spent ', rule('cr_judge_x', { suffix: 'x', step: 0.5 }), ' its goal and run ', rule('cr_min_days', { suffix: 'days', width: 34 }), '.'),
      say(h('b', null, 'Scale '), 'an ad set with ', rule('cr_scale_buys'), ' or more results on goal.'),
      say(h('b', null, 'Cut '), 'when it spent ', rule('cr_cut_zero_x', { suffix: 'x', step: 0.5 }), ' the goal with no result, or ', rule('cr_cut_spend_x', { suffix: 'x', step: 0.5 }), ' the goal at more than ', rule('cr_cut_cpa_x', { suffix: 'x', step: 0.1 }), ' the goal cost. Never while its ROAS beats the goal ROAS.'),
      say(h('b', null, 'A new test '), 'is judged after ', rule('judge_days', { suffix: 'days', width: 34 }), ' or once it has spent ', rule('judge_spend', { prefix: '$', width: 54 }), '. A spend of 0 means 3 times the goal cost.'),
      say('An empty box, or a 0, puts that rule back on the agency standard.')) : null));
}

addStyles('lx-goals-css', `
.lx-gl-top{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.lx-gl-top .lab{font-size:15px;color:var(--muted)}
.lx-gl-top .src{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.lx-gl-in{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(260px,1.3fr);gap:var(--sp-8);margin-top:var(--sp-5)}
.lx-gl-step{display:grid;gap:8px;align-content:start;min-width:0}
.lx-gl-step .n{font-size:11px;font-weight:600;color:var(--faint);letter-spacing:.08em}
.lx-gl-step .k{font-size:14px;font-weight:600}
.lx-gl-step .c{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.lx-gl-step .lx-st-box{height:46px;padding:0 14px;border-radius:12px}
.lx-gl-step .lx-st-num{font-size:22px;width:64px}
.lx-gl-step .lx-st-box i{font-size:16px}
.lx-gl-step .lx-seg{flex-wrap:wrap;height:auto}
.lx-gl-step .lx-seg button{white-space:nowrap;padding:5px 9px}
.lx-gl-left{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:var(--muted)}
.lx-gl-out.head{padding-top:10px;padding-bottom:10px;font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted)}
.lx-gl-out .k{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.lx-gl-facts{margin-top:var(--sp-5)}
.lx-gl-step .hint{font-size:12.5px;line-height:1.45;color:var(--muted)}
.lx-gl-out{display:grid;grid-template-columns:minmax(0,1fr) 150px 170px;gap:6px 28px;align-items:center;padding:16px 28px;border-top:1px solid var(--line)}
.lx-gl-out:first-child{border-top:0}
.lx-gl-out .k{font-size:14px;font-weight:600}
.lx-gl-out .w{margin-top:2px;font-size:12.5px;line-height:1.45;color:var(--muted);max-width:62ch}
.lx-gl-out .v{text-align:right}
.lx-gl-out .v b{display:block;font-size:var(--num-m);font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.15}
.lx-gl-out .v small{font-size:12px;color:var(--muted)}
.lx-gl-out .u{display:grid;gap:2px;justify-items:end;font-size:12px;color:var(--muted)}
.lx-gl-out .u small{max-width:170px;text-align:right;line-height:1.35}
.lx-gl-out .u .lx-st-box{height:34px}
.lx-gl-out .u .lx-btn{height:28px;padding:0 10px;font-size:12.5px}
.lx-gl-out .u b{font-size:15px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
@media (max-width:1040px){.lx-gl-in{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:759px){.lx-gl-out.head{display:none}}
@media (max-width:759px){
  .lx-gl-in{grid-template-columns:minmax(0,1fr);gap:var(--sp-6)}
  .lx-gl-out{grid-template-columns:minmax(0,1fr) auto;padding:14px 18px}
  .lx-gl-out>div:first-child{grid-column:1/-1}
  .lx-gl-out .v{text-align:left}
  .lx-gl-out .u small{text-align:right}
  .lx-gl-top .src{flex-basis:100%}
  .lx-gl-facts .lx-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:var(--sp-5)}
}
`);

const monthName = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long' });
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Nov 1 to 25": this month so far, ending yesterday (the plan month's numbers are whole days); "Nov 1" on the 2nd. */
function monthDates(now = new Date()) {
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (y.getMonth() !== now.getMonth()) return 'this month';
  return MON[y.getMonth()] + ' 1' + (y.getDate() > 1 ? ' to ' + y.getDate() : '');
}

export default {
  title: ['What is this brand ', em('aiming for?')],
  eyebrow: ctx => (ctx.brand ? ctx.brand.name + ', ' : '') + 'brand settings',
  ranges: false,
  async load(ctx) {
    if (!ctx.brand) return null;
    const id = encodeURIComponent(ctx.brand.id), soft = p => p.catch(e => { if (e && e.name === 'AbortError') throw e; return null; });
    const now = new Date(), ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const [brands, plan, rules, fx] = await Promise.all([
      soft(ctx.api('/api/brands', { worker: 'ah', signal: ctx.signal })),
      soft(ctx.api(`/api/plan?act=${id}&month=${ym}`, { signal: ctx.signal })),
      soft(ctx.api(`/api/brand/rules?act=${id}`, { signal: ctx.signal })),
      soft(ctx.fixture('goals.json')),
    ]);
    const b = ((brands && brands.brands) || []).find(r => r.id === ctx.brand.id) || {};
    const r = (rules && rules.rules) || {}, g = (plan && plan.goals) || {}, cur = mtdOf(plan) || {};
    const example = ['facts', 'inputs'];
    const goal = +g.revenue || +g.sales || +g.revenue_goal || null;
    const sales = cur.sales ?? null, spend = cur.spend ?? null;
    return {
      month: monthName(ctx.range.to), mtd: sales != null && spend ? { sales, spend, source: cur.source, dates: monthDates() } : null,
      inputs: { ...(fx ? fx.inputs : {}), ...(goal ? { sales_goal: goal } : {}), ...(+b.margin_pct > 0 ? { keep_pct: Math.round(b.margin_pct * (b.margin_pct <= 1 ? 100 : 1)) } : {}) },
      facts: fx ? fx.facts : {},
      in_use: { target_roas: +b.target_roas || +r.target_roas || null, target_cpa: +b.target_cpa || +r.target_cpa || null, goal_meta: +r.goal_meta || null, goal_google: +r.goal_google || null, goal_tiktok: +r.goal_tiktok || null },
      rules: rules && rules.rules ? Object.fromEntries(['cr_judge_x', 'cr_min_days', 'cr_scale_buys', 'cr_cut_zero_x', 'cr_cut_spend_x', 'cr_cut_cpa_x', 'judge_days', 'judge_spend'].map(n => [n, isFinite(+r[n]) ? +r[n] : null])) : null,
      own_keep: +b.margin_pct > 0,
      rules_exception: false, saved: null, example: goal ? example : [...example, 'sales_goal'],
    };
  },
  render: draw,
};
