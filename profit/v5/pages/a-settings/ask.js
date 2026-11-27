/* Agency settings > Locus AI. How hard it thinks, what it knows about the agency, and what it has cost.
   Real mode:
     account-health GET /api/ask/settings        model (smart, quick, deep) and the standing instructions; saved with PUT /api/ask/settings
     account-health GET /api/ask/findings        brief: the "about your agency" text every answer reads; saved with PUT /api/ask/brief
     account-health GET /api/ask/usage?days=30   answers and cost by day, the chart
   The ideas bot switch and the client allowance have no server home yet: kept on this device. */

import { put } from '../../kit.js';
import { h, em, empty, card, lineChart, money, num } from '../../kit.js';
import { AI_NAME, APP_NAME } from '../../config.js';
import { css, stage, saveBar, group, row, fold, setHelp, seg, area, onOff, numBox } from '../brand-settings/_set.js';
import { defLabel } from '../../defs.js';
import { countTiles } from './_look.js';

function draw(el, data, ctx) {
  css();
  if (!data) return put(el, empty({ title: AI_NAME + ' did not answer', text: 'Try again in a minute.' }));
  const savers = ctx.sample ? {} : {
    'ai.model': v => ctx.api('/api/ask/settings', { worker: 'ah', method: 'PUT', body: { model: v } }),
    'ai.instructions': v => ctx.api('/api/ask/settings', { worker: 'ah', method: 'PUT', body: { instructions: v } }),
    'ai.brief': v => ctx.api('/api/ask/brief', { worker: 'ah', method: 'PUT', body: { text: v } }),
  };
  /* switched on: the depth and the standing instructions (PUT /api/ask/settings). Held: the brief (PUT /api/ask/brief). */
  const S = stage(ctx, { live: { 'ai.model': data.model, 'ai.instructions': data.instructions, 'ai.brief': data.brief }, savers, held: ['ai.brief'],
    names: { 'ai.model': 'Depth', 'ai.instructions': 'Standing instructions', 'ai.brief': 'About your agency' } });
  const u = data.usage || {}, days = u.by_day || [];
  const span = days.length ? new Date(days[0].day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' to ' + new Date(days[days.length - 1].day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Last 30 days';
  const labels = days.map(d => new Date(d.day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  const chart = days.length > 1 ? card({ class: 'lx-ai-chart' },
    h('div', { class: 'lx-chart-h' }, h('div', null, h('h3', { class: 'lx-ai-ct' }, 'Questions answered, by day'), h('p', null, 'Asked in Slack and in the app'))),
    lineChart({ windowLabel: 'Daily, ' + span, series: [{ name: 'Answers', values: days.map(d => d.answers), lead: true }], labels, format: v => num(v), height: 260, phoneHeight: 220,
      hover: i => [h('span', null, labels[i]), h('span', null, 'answers ', h('b', null, num(days[i].answers))), h('span', null, 'cost ', h('b', null, money(days[i].cost, { cents: true })))], label: 'Questions answered by day' })) : null;

  put(el, h('div', { class: 'lx-st' },
    saveBar(S, ctx, { help: setHelp({
      about: 'How ' + AI_NAME + ' works for the agency: how hard it thinks, what it knows about you, where it works, and what it has cost.',
      fixed: [
        ['What it reads', APP_NAME + ' numbers only, through its own read', 'It never makes up a number: every figure comes back from a query.'],
        ['Attribution', 'Triple Whale, last platform click', 'Every sale and ROAS it quotes.'],
        ['It acts', 'Only after a person taps Apply', 'Anything that changes an account is a proposal first.'],
      ] }) }),
    countTiles([
      { label: 'Answers', value: num(u.answers), sub: 'in Slack and in the app', window: span, source: 'Answer log' },
      { label: 'Cost', value: money(u.cost, { cents: false }), sub: u.answers ? money(u.cost / u.answers, { cents: true }) + ' each' : null, window: span, source: 'AI bill' },
      { label: 'Average wait', value: u.avg_seconds != null ? num(u.avg_seconds, 0) + 's' : 'No data', sub: 'from question to answer', window: span, source: 'Answer log' },
    ], { cols: 3 }),
    chart,
    group('How it thinks', null,
      row(defLabel('Depth', { title: 'Depth', body: 'How much ' + AI_NAME + ' reads before it answers. Quick: one short read, the cheapest. Smart: the default, reads the numbers it needs. Deep: reads more and checks itself, several times the cost of Smart and slower.' }),
        'Quick is cheapest. Deep reads more before it answers and costs more.' + (u.answers ? ' Answers cost about ' + money(u.cost / u.answers, { cents: true }) + ' each over the last 30 days.' : ''), seg(S, 'ai.model', data.model || 'smart', [{ id: 'quick', label: 'Quick' }, { id: 'smart', label: 'Smart' }, { id: 'deep', label: 'Deep' }])),
      row('About your agency', 'One text every answer reads: who you are, how you work, what matters.', area(S, 'ai.brief', data.brief || '', { rows: 5, placeholder: 'We run paid ads and creative for ecommerce brands. We judge every brand on MER first.', label: 'About your agency' }), { wide: true }),
      row('Standing instructions', 'How to answer. Plain sentences, numbers first, no jargon.', area(S, 'ai.instructions', data.instructions || '', { rows: 4, placeholder: 'Lead with the number. Two or three sentences.', label: 'Standing instructions' }), { wide: true })),
    group('Where it works', null,
      row('Ideas bot in Slack', 'A tag on an idea thread drafts a brief and a creator angle.', onOff(S, 'agency.ideasBot', data.ideas_bot ?? true, 'Ideas bot')),
      row('Daily allowance per client login', 'What one client can spend on questions a day.', numBox(S, 'agency.clientAskDaily', data.client_daily ?? 2, { prefix: '$', width: 44, label: 'Client daily allowance' }))),
    fold('Advanced', 'Rarely touched',
      row('Questions a day, whole team', 'It stops for the day at this many.', numBox(S, 'agency.askCap', data.cap ?? 200, { width: 56, label: 'Questions a day' }))),
  ));
}

export default {
  title: ['How does ', em(AI_NAME), ' work for us?'],
  eyebrow: 'Agency settings',
  ranges: false,
  stamp: false,                  /* a form or a conversation, not numbers: no "updated" stamp in the head */
  async load(ctx) {
    const soft = p => p.catch(e => { if (e && e.name === 'AbortError') throw e; return null; });
    const [st, fd, u] = await Promise.all([
      ctx.api('/api/ask/settings', { worker: 'ah', signal: ctx.signal }),
      soft(ctx.api('/api/ask/findings', { worker: 'ah', signal: ctx.signal })),
      soft(ctx.api('/api/ask/usage?days=30', { worker: 'ah', signal: ctx.signal })),
    ]);
    return {
      model: st.model || 'smart', instructions: st.instructions || '', brief: fd && typeof fd.brief === 'string' ? fd.brief : '',
      usage: u ? { answers: u.answers || 0, cost: u.cost || 0, avg_seconds: u.avg_seconds, by_day: (u.by_day || []).map(d => ({ day: d.day, answers: d.answers, cost: d.cost })) } : null,
    };
  },
  render: draw,
};

import { addStyles } from '../../kit.js';
addStyles('lx-ai-css', `.lx-ai-ct{font-size:var(--fs-card,14px);font-weight:600;letter-spacing:-.01em}.lx-ai-chart{position:relative}`);
