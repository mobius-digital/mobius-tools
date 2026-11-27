/* Meetings > Pre-read: one page per brand, sent Monday 6am with last week's final numbers (Mon to Sun).
   Order: the verdict and three numbers, MER by week (the one chart), the one decision, last week's
   promises, then everything else folded away. Live data is what the team meeting screen loads. */

import { put } from '../../kit.js';
import { h, em, kpi, tiles, delta, statusDot, legend, button, avatar, empty, skeleton } from '../../kit.js';
import { defLabel, pageHelp } from '../../defs.js';
import { follow } from '../_parts.js';
import { css, loadMeeting, meetingOf, SENT_LABEL, rangeText, lightOf, trafficLight, tick, sentence, merChart, foldRow, detailTable, MEETING_START, ok, money, x } from './_meet.js';

const ui = { brand: null, open: new Set(), answer: {} };   // what the reader picked; kept across a refresh
try { ui.brand = sessionStorage.getItem('lx5.preread.brand'); } catch {}

const slug = id => String(id).replace(/^brand_/, '').replace(/_/g, '-');
const change = (now, was) => ok(now) && ok(was) && was > 0 ? (now - was) / was : null;


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

  /* the verdict: only the reason, written for the brand. The numbers are in the tiles right under it, so a
     sentence built from them would only repeat them. */
  const verdict = b.verdict ? sentence(b.verdict) : null;

  const dS = change(b.sales, b.sales_prior), dP = change(b.spend, b.spend_prior);
  /* the three numbers as batch 1 tiles: label, value, change, window and source, the weekly sparkline with its scale */
  const wk = (b.weeks || []).length > 1 ? b.weeks : null;
  const win = rangeText(week.from, week.to);
  const sl = wk ? wk.map(w => 'Week of ' + (w.label || '')) : null;
  const three = b.connected ? tiles([
    kpi({ label: 'Sales', value: money(b.sales, { cur }), window: win, source: 'Triple Whale',
      delta: ok(dS) ? delta(dS, { bad: dS < 0 }) : null, sub: ok(b.sales_prior) ? `from ${money(b.sales_prior, { cur })} the week before` : null,
      spark: wk && wk.map(w => w.sales), sparkLabels: sl, sparkFormat: v => money(v, { cur }) }),
    kpi({ label: 'Ad spend', value: ok(b.spend) ? money(b.spend, { cur }) : 'no data', window: win, source: 'All ad platforms',
      delta: ok(dP) ? delta(dP, { plain: true }) : null, sub: ok(b.spend_prior) ? `from ${money(b.spend_prior, { cur })} the week before` : null,
      spark: wk && wk.map(w => w.spend), sparkLabels: sl, sparkFormat: v => money(v, { cur }) }),
    kpi({ label: defLabel('Store MER', 'mer'), value: ok(b.mer) ? x(b.mer) : 'no data', window: win, source: 'Triple Whale',
      sub: ok(b.goal_mer) ? statusDot(light ? light.tone : 'off', 'goal ' + x(b.goal_mer)) : statusDot('off', 'No goal set'),
      spark: wk && wk.map(w => w.mer), sparkLabels: sl, sparkFormat: v => x(v) }),
  ], { cols: 3 })
    : h('section', { class: 'lx-card' }, h('span', { class: 'lx-card-t' }, 'Sales'),
      h('p', { class: 'mt-quiet' }, b.has_report === false ? 'No weekly report yet' : 'No sales source connected'));

  /* the title names the brand picked on this page, so it is set here and drawn by the shell */
  ctx.setTitle([b.name + ', ', em(rangeText(week.from, week.to))], { eyebrow: 'Pre-read for Monday' });
  /* the verdict in its own card, the status on the right; the three tiles under it */
  const head = h('div', { class: 'mt-heads' },
    h('section', { class: 'lx-card mt-vcard' }, h('div', { class: 'mt-hero-top' }, h('div', null, verdict ? h('p', { class: 'mt-verdict' }, verdict) : h('p', { class: 'mt-verdict quiet' }, 'Last week for ' + b.name + ', ' + win + '.')), h('span', { class: 'lx-sp' }), b.connected ? trafficLight(light) : '')),
    three);
  ctx.askContext = 'Monday pre-read for ' + b.name + ', ' + win + ': sales ' + (ok(b.sales) ? money(b.sales, { cur }) : 'no data') + ', ad spend ' + (ok(b.spend) ? money(b.spend, { cur }) : 'no data') + ', Store MER ' + (ok(b.mer) ? x(b.mer) : 'no data') + (ok(b.goal_mer) ? ' against a ' + x(b.goal_mer) + ' goal' : '') + ' (Triple Whale).' + (b.decision ? ' Decision: ' + b.decision.text : '');

  const parts = [h('div', { class: 'mt-helpbar' }, pageHelp({ body: [
    { title: 'What it is for', text: 'One page per brand to read before the Monday team meeting: last week\'s numbers, MER by week, the one decision and last week\'s promises. Everything else is folded.' },
    { title: 'The numbers', text: 'Last week, Monday to Sunday, final. Sales are every store order (Triple Whale); Store MER is all sales divided by all ad spend. The Meta and Google rows are Triple Whale last click ROAS, compared with the store goal. The status pill compares Store MER with the brand\'s goal: On goal at or over it, Close within 10% under, Under goal more than 10% under.' },
    { title: 'When it is sent', text: SENT_LABEL + '. Decisions are made in Run the meeting, not here.' },
  ] })), picker, head];

  /* MER by week: its own full width row */
  if (b.connected) {
    const n = (b.weeks || []).filter(w => ok(w.mer)).length;
    parts.push(h('section', { class: 'lx-card mt-panel' },
      h('div', { class: 'mt-h' }, h('h3', null, 'Store MER by week'), h('span', null, n > 1 ? `whole store, last ${n} weeks` : 'whole store'),
        legend([{ name: 'MER', lead: true }, ...(ok(b.goal_mer) ? [{ name: 'Goal ' + x(b.goal_mer), dashed: true }] : [])])),
      merChart(b.weeks, b.goal_mer)));
  }

  /* the one decision */
  const dc = b.decision;
  if (dc) {
    /* Yes and Change only toasted "not connected": no save route exists, so the decision is made in Run the meeting. */
    parts.push(h('section', { class: 'lx-card raised mt-decide', 'aria-label': 'The one decision for Monday' },
      h('div', null, h('span', { class: 'lx-eyebrow' }, 'The one decision for Monday'), h('h2', null, dc.text), dc.win && h('p', null, dc.win),
        dc.owner && h('div', { class: 'mt-own' }, avatar({ name: dc.owner, photo: dc.owner_photo }, { size: 40 }), h('span', null, h('b', null, dc.owner), h('small', null, 'owner, speaks first')))),
      dc.number ? h('div', { class: 'mt-bignum' }, h('span', { class: 'lx-cap' }, 'The number'), h('span', { class: 'n' }, dc.number), dc.number_note && h('small', null, dc.number_note)) : h('span'),
      h('div', { class: 'mt-btns' },
        button('Decide it in Run the meeting', { large: true, href: ctx.href('a-meetings', 'run'), icon: 'arrow' }),
        h('small', { class: 'mt-quiet' }, 'Decided in the meeting, not here'))));
  } else if (b.connected) {
    parts.push(h('section', { class: 'lx-card raised mt-decide', 'aria-label': 'The one decision for Monday' },
      h('div', null, h('span', { class: 'lx-eyebrow' }, 'The one decision for Monday'), h('h2', null, 'No decision written yet.'), h('p', null, `The owner writes one decision, with a number, before ${ctx.settingNow('agency.meetingStart', MEETING_START)}am.`)),
      h('span'), h('div', { class: 'mt-btns' }, button('Run the meeting', { large: true, href: ctx.href('a-meetings', 'run') }))));
  }

  /* last week's promises */
  if (b.promises && b.promises.length) {
    const done = b.promises.filter(p => p.done).length;
    parts.push(h('section', { class: 'lx-card mt-card' },
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
      h('div', { class: 'mt-h' }, h('h3', null, 'Everything else'), h('span', null, win + ' · Triple Whale unless a row says otherwise. Open a row only if you need it.')),
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
