/* Automations > Run log. Every run, newest first: when, what happened, and the result. A row opens the whole story
   (the rule, what set it off, why it did or did not act, AI used) in the kit sheet. Filter by result.
   It answers "why did I not hear about this?" and "why did it do that?".
   account-health GET /api/automations (`runs`, the last 60 across every automation). */

import { h, put, em, card, empty, relativeTime, sheet, segmented, addStyles } from '../../kit.js';
import { pageHelp } from '../../defs.js';
import { style, ah, resultDot } from './_auto.js';
import { offPill, plainWhy } from './_bits.js';

const load = ctx => ah(ctx, '/api/automations');
const when = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const FILTERS = [{ id: 'all', label: 'All' }, { id: 'done', label: 'Done' }, { id: 'skipped', label: 'Skipped' }, { id: 'held', label: 'Held' }];
let pickNow = 'all';
const join = parts => parts.map(p => String(p || '').trim().replace(/\.+$/, '')).filter(Boolean).join('. ') + '.';

function render(el, d, ctx) {
  style();
  addStyles('au-log-css', `.au-lrow{display:grid;grid-template-columns:120px minmax(0,1fr) auto;gap:4px 16px;align-items:center;width:100%;padding:12px 14px;margin:0 -14px;border:0;border-radius:12px;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer}
.au-lrow:hover{background:var(--row-hover)}
.au-lrow+.au-lrow{box-shadow:0 -1px 0 var(--line)}
.au-lrow time{color:var(--muted);font-size:12.5px}
.au-lrow b{display:block;font-weight:600;font-size:14px;overflow-wrap:anywhere}
.au-lrow small{display:block;margin-top:2px;color:var(--muted);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.au-lsheet{display:grid;gap:14px}
.au-lsheet dl{margin:0;display:grid;border-top:1px solid var(--line)}
.au-lsheet dl>div{display:grid;grid-template-columns:140px minmax(0,1fr);gap:12px;padding:10px 0;border-bottom:1px solid var(--line);font-size:13.5px}
.au-lsheet dt{color:var(--muted)}
.au-lsheet dd{margin:0;overflow-wrap:anywhere}
@media (max-width:759px){.au-lrow{grid-template-columns:minmax(0,1fr) auto}.au-lrow time{grid-column:1/-1}.au-lsheet dl>div{grid-template-columns:minmax(0,1fr)}}`);
  const autos = Object.fromEntries(((d && d.automations) || []).map(a => [a.id, a]));
  const runs = ((d && d.runs) || []).filter(r => !ctx.brand || !r.brand_id || r.brand_id === ctx.brand.id);
  const head = h('div', { class: 'au-head' }, pageHelp({ body: [
    { title: 'What it is for', text: 'Every run, newest first: when it ran, what happened and the result. Open a row for the whole story: the rule, why it acted or did nothing, and any AI it used.' },
    { title: 'The results', text: 'Done: it acted. Skipped: there was nothing to do, or it already told someone. Held: it waits, for quiet hours or for a person to answer.' },
  ] }), offPill(d, ctx));
  if (!runs.length) return put(el, h('div', { class: 'au' }, head, empty({ title: 'Nothing has run yet', text: 'Each run shows here with what it did, who it reached, and when it did nothing, why.' })));

  const open = r => {
    const a = autos[r.automation_id] || {};
    sheet({ title: r.title || a.name || 'A run', body: h('div', { class: 'au-lsheet' },
      h('div', null, resultDot(r.result)),
      h('dl', null,
        h('div', null, h('dt', null, 'When'), h('dd', null, when(r.started_at) + ' (' + relativeTime(Date.parse(r.started_at)) + ')')),
        r.brand ? h('div', null, h('dt', null, 'Brand'), h('dd', null, r.brand)) : null,
        h('div', null, h('dt', null, 'The rule'), h('dd', null, (a.sentence && a.sentence.text) || a.name || 'Not found')),
        r.why ? h('div', null, h('dt', null, 'What happened'), h('dd', null, join([plainWhy(r.why)]))) : null,
        r.tapped_by ? h('div', null, h('dt', null, 'Answered by'), h('dd', null, r.tapped_by)) : null,
        r.ai_usd > 0 ? h('div', null, h('dt', null, 'AI used'), h('dd', null, 'About $' + r.ai_usd.toFixed(3))) : null)) });
  };
  const list = h('div', { class: 'au-log' });
  const paint = () => {
    const shown = pickNow === 'all' ? runs : runs.filter(r => r.result === pickNow);
    put(list, shown.length ? shown.map(r => h('button', { type: 'button', class: 'au-lrow', onclick: () => open(r), title: 'Open this run' },
      h('time', { datetime: r.started_at, title: relativeTime(Date.parse(r.started_at)) }, when(r.started_at)),
      h('span', null, h('b', null, r.title || (autos[r.automation_id] || {}).name || 'A run'), h('small', null, [r.brand, plainWhy(r.why)].filter(Boolean).join(' · ') || ' ')),
      resultDot(r.result))) : h('p', { class: 'lx-foot' }, 'No runs with this result.'));
  };
  paint();
  const ai = runs.reduce((s, r) => s + (r.ai_usd || 0), 0);
  put(el, h('div', { class: 'au' }, head,
    card({ title: 'The last ' + runs.length + ' runs', note: ai >= 0.005 ? 'AI used: about $' + ai.toFixed(2) : null,
      action: segmented(FILTERS, pickNow, id => { pickNow = id; paint(); }) }, list)));
}

export default {
  title: ['What ran, ', em('and why')],
  eyebrow: 'Automations',
  ranges: false,
  load, render,
};
