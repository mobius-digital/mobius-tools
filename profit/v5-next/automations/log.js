/* Automations > Run log. Every run, newest first: when, what set it off, what it did, and when it did nothing, why,
   in plain words. It answers "why did I not hear about this?" and "why did it do that?".
   account-health GET /api/automations (`runs`, the last 60 across every automation). */

import { h, put, em, card, empty, relativeTime } from '../../kit.js';
import { style, ah, resultDot } from './_auto.js';

const load = ctx => ah(ctx, '/api/automations');
const when = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };

function render(el, d, ctx) {
  style();
  const name = Object.fromEntries(((d && d.automations) || []).map(a => [a.id, a.name]));
  const runs = ((d && d.runs) || []).filter(r => !ctx.brand || !r.brand_id || r.brand_id === ctx.brand.id);
  if (!runs.length) return put(el, empty({ title: 'Nothing has run yet', text: 'Each run shows here with what it did, who it reached, and when it did nothing, why.' }));
  const ai = runs.reduce((s, r) => s + (r.ai_usd || 0), 0);
  put(el, h('div', { class: 'au' },
    card({ title: 'The last ' + runs.length + ' runs', note: ai > 0 ? 'AI used by these runs: about $' + ai.toFixed(2) + '. A report draft is counted as an estimate. Runs that only read numbers cost nothing.' : 'None of these runs used AI.' },
      h('div', { class: 'au-log' }, runs.map(r => h('div', { class: 'au-run' },
        h('time', { datetime: r.started_at, title: relativeTime(Date.parse(r.started_at)) }, when(r.started_at)),
        h('div', null, h('b', null, r.title || name[r.automation_id] || 'A run'), h('p', null, [name[r.automation_id], r.brand, r.why].filter(Boolean).join('. ')),
          r.tapped_by ? h('p', null, 'Answered by ' + r.tapped_by) : null),
        resultDot(r.result)))))));
}

export default {
  title: ['What ran, ', em('and why')],
  eyebrow: 'Automations',
  ranges: false,
  load, render,
};
