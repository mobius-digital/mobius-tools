/* Meetings > Pre-read: one page per brand, sent Monday 6am with last week's final numbers (Mon to Sun).
   Order: the verdict and three numbers, MER by week (the one chart), the one decision, last week's
   promises, then everything else folded away. Live data is what the team meeting screen loads. */

import { put } from '../../kit.js';
import { h, hero, em, kpi, sparkline, delta, statusDot, legend, button, avatar, toast, empty, skeleton } from '../../kit.js';
import { follow } from '../_parts.js';
import { css, loadMeeting, meetingOf, SENT_LABEL, rangeText, lightOf, trafficLight, tick, sentence, merChart, foldRow, detailTable, MEETING_START, ok, money, x } from './_meet.js';

const ui = { brand: null, open: new Set(), answer: {} };   // what the reader picked; kept across a refresh
try { ui.brand = sessionStorage.getItem('lx5.preread.brand'); } catch {}

const slug = id => String(id).replace(/^brand_/, '').replace(/_/g, '-');
const change = (now, was) => ok(now) && ok(was) && was > 0 ? (now - was) / was : null;

const spark = (values, goal) => sparkline(values, { fill: true, goal });

function draw(el, data, ctx) {
  css();
  const brands = (data && data.brands) || [];
  if (!brands.length) return put(el, empty({ title: 'No brands on the Monday meeting yet', text: 'A brand shows here once it has a weekly report.' }));
  const b = brands.find(k => k.id === ui.brand) || brands[0];
  const cur = b.currency || 'USD';
  const week = b.week || data.week;
  const light = lightOf(b.mer, b.goal_mer);
  const pick = id => { ui.brand = id; try { sessionStorage.setItem('lx5.preread.brand', id); } catch {} draw(el, data, ctx); };

  const picker = h('div', { class: 'mt-pick' },
    h('div', { class: 'mt-chips', role: 'tablist', 'aria-label': 'Brand' }, brands.map(k => {
      const l = lightOf(k.mer, k.goal_mer);
      return h('button', { type: 'button', role: 'tab', class: 'mt-chip' + (k.id === b.id ? ' on' : ''), 'aria-selected': String(k.id === b.id), onclick: () => pick(k.id) }, h('i', { class: l ? l.tone : '' }), k.name);
    })),
    h('span', { class: 'lx-stat good mt-sent' }, SENT_LABEL));

  /* the verdict: written for the brand when there is one, else said plainly from the numbers */
  const verdict = b.verdict ? sentence(b.verdict)
    : !b.connected ? null
    : ['Sales were ', h('b', null, money(b.sales, { cur })), ok(b.mer) ? [', MER ', h('b', null, x(b.mer)), ok(b.goal_mer) ? ` against a ${x(b.goal_mer)} goal.` : '. No MER goal is set.'] : '.'];

  const dS = change(b.sales, b.sales_prior), dP = change(b.spend, b.spend_prior);
  const three = b.connected ? h('div', { class: 'mt-three' },
    kpi({ label: 'Sales', value: money(b.sales, { cur }),
      delta: ok(dS) ? delta(dS, { bad: dS < 0 }) : null, sub: ok(b.sales_prior) ? `from ${money(b.sales_prior, { cur })} the week before` : null }),
    kpi({ label: 'Ad spend', value: ok(b.spend) ? money(b.spend, { cur }) : 'no data',
      delta: ok(dP) ? delta(dP, { plain: true }) : null, sub: ok(b.spend_prior) ? `from ${money(b.spend_prior, { cur })} the week before` : null }),
    h('div', { class: 'lx-kpi' }, h('span', { class: 'l' }, 'MER, whole store'),
      h('span', null, h('span', { class: 'lx-hero-num' }, ok(b.mer) ? x(b.mer) : 'no data')),
      h('span', { class: 's' }, ok(b.goal_mer) ? statusDot(light ? light.tone : 'off', 'goal ' + x(b.goal_mer)) : statusDot('off', 'No goal set'))))
    : h('div', { class: 'mt-three' }, h('div', { class: 'lx-kpi' }, h('span', { class: 'l' }, 'Sales'),
      h('span', { class: 'none' }, b.has_report === false ? 'No weekly report yet' : 'No sales source connected')));
  if (b.connected && b.weeks && b.weeks.length > 1) {
    const k = three.children;
    k[0].append(spark(b.weeks.map(w => w.sales)));
    k[1].append(spark(b.weeks.map(w => w.spend)));
    k[2].append(spark(b.weeks.map(w => w.mer), b.goal_mer));
  }

  /* the title names the brand picked on this page, so it is set here and drawn by the shell */
  ctx.setTitle([b.name + ', ', em(rangeText(week.from, week.to))], { eyebrow: 'Pre-read for Monday' });
  const head = hero({});
  head.classList.add('line', 'mt-hero');
  head.append(h('div', { class: 'mt-hero-top' }, h('div', null, verdict ? h('p', { class: 'mt-verdict' }, verdict) : null), h('span', { class: 'lx-sp' }), b.connected ? trafficLight(light) : ''), three);

  const parts = [picker, head];

  /* MER by week: its own full width row */
  if (b.connected) {
    const n = (b.weeks || []).filter(w => ok(w.mer)).length;
    parts.push(h('section', { class: 'lx-card mt-panel' },
      h('div', { class: 'mt-h' }, h('h3', null, 'MER by week'), h('span', null, n > 1 ? `whole store, last ${n} weeks` : 'whole store'),
        legend([{ name: 'MER', lead: true }, ...(ok(b.goal_mer) ? [{ name: 'Goal ' + x(b.goal_mer), dashed: true }] : [])])),
      merChart(b.weeks, b.goal_mer)));
  }

  /* the one decision */
  const dc = b.decision;
  if (dc) {
    const said = ui.answer[b.id];
    const say = (what, text) => () => { ui.answer[b.id] = what; draw(el, data, ctx); toast(ctx.sample ? 'Sample numbers: nothing is saved' : text); };
    parts.push(h('section', { class: 'lx-card raised mt-decide', 'aria-label': 'The one decision for Monday' },
      h('div', null, h('span', { class: 'lx-eyebrow' }, 'The one decision for Monday'), h('h2', null, dc.text), dc.win && h('p', null, dc.win),
        dc.owner && h('div', { class: 'mt-own' }, avatar({ name: dc.owner, photo: dc.owner_photo }, { size: 40 }), h('span', null, h('b', null, dc.owner), h('small', null, 'owner, speaks first')))),
      dc.number ? h('div', { class: 'mt-bignum' }, h('span', { class: 'lx-cap' }, 'The number'), h('span', { class: 'n' }, dc.number), dc.number_note && h('small', null, dc.number_note)) : h('span'),
      h('div', { class: 'mt-btns' },
        button('Yes', { primary: true, large: true, class: said === 'yes' ? 'picked' : '', onclick: say('yes', 'Marked yes on this screen. Saving decisions is not connected yet.') }),
        button('Change', { large: true, class: said === 'change' ? 'picked' : '', onclick: say('change', 'Change it in Run the meeting.') }))));
  } else if (b.connected) {
    parts.push(h('section', { class: 'lx-card raised mt-decide', 'aria-label': 'The one decision for Monday' },
      h('div', null, h('span', { class: 'lx-eyebrow' }, 'The one decision for Monday'), h('h2', null, 'No decision written yet.'), h('p', null, `The owner writes one decision, with a number, before ${ctx.settingNow('agency.meetingStart', MEETING_START)}am.`)),
      h('span'), h('div', { class: 'mt-btns' }, button('Run the meeting', { large: true, href: ctx.href('a-meetings', 'run') }))));
  }

  /* last week's promises */
  if (b.promises && b.promises.length) {
    const done = b.promises.filter(p => p.done).length;
    parts.push(h('section', { class: 'mt-open' },
      h('div', { class: 'mt-h' }, h('h3', null, "Last week's promises"), h('span', null, `${done} of ${b.promises.length} done`)),
      h('div', null, b.promises.map(p => h('div', { class: 'mt-prom' }, avatar({ name: p.owner, photo: p.owner_photo }, { size: 40 }),
        h('span', { class: 'what' }, p.text), h('span', { class: 'who' }, [p.owner, p.due && 'due ' + p.due].filter(Boolean).join(', ')), tick(!!p.done))))));
  } else if (b.connected) {
    parts.push(h('section', { class: 'mt-open' },
      h('div', { class: 'mt-h' }, h('h3', null, "Last week's promises"), h('span', null, b.promises ? 'none were written' : 'not connected yet'))));
  }

  /* everything else, folded */
  if (b.rows && b.rows.length) {
    parts.push(h('section', { class: 'mt-open', style: { gap: '14px' } },
      h('div', { class: 'mt-h' }, h('h3', null, 'Everything else'), h('span', null, 'open a row only if you need it')),
      h('div', { class: 'lx-card flush' }, b.rows.map(r => {
        const key = b.id + '|' + r.id;
        return foldRow({ ...r, id: slug(b.id) + '-' + r.id, open: ui.open.has(key), onToggle: on => { on ? ui.open.add(key) : ui.open.delete(key); },
          detail: () => h('div', null, detailTable(r.detail),
            r.go ? button('Open ' + r.label, { icon: 'arrow', href: `#/brand/${slug(b.id)}/${r.go[0]}/${r.go[1]}` }) : null) });
      }))));
  }
  /* Meta, Google and the pipeline come with the slow read: rows hold their place until it lands */
  if (data.waiting && data.waiting.screen) {
    parts.push(h('section', { class: 'mt-open', style: { gap: '14px' }, role: 'status', 'aria-label': 'Still reading Meta, Google and the pipeline' },
      (b.rows && b.rows.length) ? null : h('div', { class: 'mt-h' }, h('h3', null, 'Everything else'), h('span', null, 'reading Meta, Google and the pipeline')),
      h('div', null, skeleton('row', 3))));
  }

  if (data.note) parts.push(h('p', { class: 'lx-foot' }, data.note));
  put(el, h('div', { class: 'mt-page' }, parts));
}

/* each part of the meeting is painted as it lands */
const paint = (el, d, ctx) => follow(ctx, d, now => draw(el, meetingOf(now, ctx), ctx));

export default {
  title: 'Pre-read for Monday',
  eyebrow: 'Meetings, team',
  ranges: false,
  asOf: d => (d && d.parts ? (d.parts.cmd && d.parts.cmd.as_of) || d.at : d && d.as_of) || null,
  load: loadMeeting,
  render: paint,
  update: paint,
};
