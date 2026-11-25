/* Automations > Templates. The gallery: ready-made sentences in five groups, every one off. "Use this" opens the
   one-sentence editor so the underlined words can be changed before it is switched on. A template that is not ready
   says what it waits for and cannot be switched on. account-health GET /api/automations (`templates`). */

import { h, put, em, button, pill } from '../../kit.js';
import { style, ah, powerBar, sentenceNode, openEditor } from './_auto.js';

const load = ctx => ah(ctx, '/api/automations');

function render(el, d, ctx) {
  style();
  const done = async () => { if (ctx.sample) return; const fresh = await load(ctx).catch(() => null); if (fresh) render(el, fresh, ctx); };
  const list = (d && d.templates) || [];
  const groups = [...new Set(list.map(t => t.group))];
  const row = t => h('div', { class: 'au-row' + (t.ready ? '' : ' dim'), style: { cursor: 'default' } },
    sentenceNode(t.sentence),
    t.ready ? button(t.on ? 'Use again' : 'Use this', { primary: !t.on, onclick: () => openEditor({ ...t.automation, template: t.key, brand: ctx.brand ? ctx.brand.id : 'all', sentence: t.sentence }, d, ctx, done) }) : h('span'),
    h('div', { class: 'au-meta' },
      t.on ? pill('good', 'In use') : pill('', 'Off'),
      t.ai ? pill('', 'Uses AI') : null,
      t.tap ? pill('', 'Waits for a tap') : null,
      t.ready ? (t.note ? h('span', null, t.note) : null) : h('span', null, t.waits)));
  put(el, h('div', { class: 'au' },
    powerBar(d, ctx, done),
    h('div', { class: 'au-top' }, h('p', null, 'Every template starts off. Pick one, change the underlined words, try it, then switch it on.')),
    groups.map(g => h('section', { class: 'au-g' }, h('h3', null, g), h('div', { class: 'au-list' }, list.filter(t => t.group === g).map(row))))));
}

export default {
  title: ['Start from ', em('a template')],
  eyebrow: 'Automations',
  ranges: false,
  load, render,
};
