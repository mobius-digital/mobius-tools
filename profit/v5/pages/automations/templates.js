/* Automations > Templates. The gallery: ready-made sentences in groups, every one off. "Use this" opens the
   one-sentence editor so the underlined words can be changed before it is switched on. Ready templates come first;
   the ones that wait for a trigger are folded under one row per group. account-health GET /api/automations (`templates`). */

import { h, put, em, button, pill, addStyles } from '../../kit.js';
import { pageHelp } from '../../defs.js';
import { style, ah, sentenceNode, openEditor, forBrand } from './_auto.js';
import { offPill } from './_bits.js';

const load = ctx => ah(ctx, '/api/automations');
const tip = (tone, word, title) => { const p = pill(tone, word); p.title = title; return p; };

function render(el, d, ctx) {
  style();
  addStyles('au-tpl-css', `.au-more{border:1px solid var(--line);border-radius:16px;background:var(--surface)}
.au-more>summary{display:flex;align-items:center;gap:10px;padding:14px 18px;cursor:pointer;list-style:none;font-size:13.5px;color:var(--ink-2)}
.au-more>summary::-webkit-details-marker{display:none}
.au-more>summary b{font-weight:600;color:var(--ink)}
.au-more>summary .s{margin-left:auto;font-size:13px;font-weight:550}
.au-more[open]>summary .s{font-size:0}
.au-more[open]>summary .s::after{content:"Hide";font-size:13px}
.au-more .au-list{padding:0 12px 12px}
.au-row.tpl{cursor:default}`);
  const done = async () => { if (ctx.sample) return; const fresh = await load(ctx).catch(() => null); if (fresh) render(el, fresh, ctx); };
  const list = (d && d.templates) || [];
  const groups = [...new Set(list.map(t => t.group))];
  const row = t => h('div', { class: 'au-row tpl' + (t.ready ? '' : ' dim') },
    sentenceNode(t.sentence),
    t.ready ? button(t.on ? 'Use again' : 'Use this', { onclick: () => openEditor({ ...t.automation, template: t.key, ...forBrand(t.sentence, ctx) }, d, ctx, done) }) : h('span'),
    h('div', { class: 'au-meta' },
      t.on ? tip('good', 'In use', 'This workspace already runs an automation made from this template.') : null,
      t.ai ? tip('', 'Uses AI', 'Each run asks the AI, so it uses some of the AI allowance.') : null,
      t.tap ? tip('', 'Waits for a tap', 'It suggests; a person taps yes before anything changes.') : null,
      t.ready ? (t.note ? h('span', null, t.note) : null) : h('span', null, t.waits)));
  const section = g => {
    const all = list.filter(t => t.group === g), ready = all.filter(t => t.ready), later = all.filter(t => !t.ready);
    return h('section', { class: 'au-g' }, h('h3', null, g),
      ready.length ? h('div', { class: 'au-list' }, ready.map(row)) : null,
      later.length ? h('details', { class: 'au-more' }, h('summary', null, h('b', null, later.length + ' more coming'), h('span', null, 'waiting on triggers that are not built yet'), h('span', { class: 's' }, 'Show')),
        h('div', { class: 'au-list' }, later.map(row))) : null);
  };
  /* groups with something ready first */
  const order = groups.slice().sort((a, b) => (list.some(t => t.group === b && t.ready) ? 1 : 0) - (list.some(t => t.group === a && t.ready) ? 1 : 0));
  put(el, h('div', { class: 'au' },
    h('div', { class: 'au-head' }, pageHelp({ body: [
      { title: 'What it is for', text: 'Ready-made automations. Every template starts off. Pick one, change the underlined words, try it, then switch it on.' },
      { title: 'The tags', text: 'In use: this workspace already runs one made from it. Uses AI: each run uses some of the AI allowance. Waits for a tap: it suggests, and a person says yes before anything changes.' },
    ] }), offPill(d, ctx)),
    order.map(section)));
}

export default {
  title: ['Start from ', em('a template')],
  eyebrow: 'Automations',
  ranges: false,
  load, render,
};
