/* Automations > Running. Every automation this workspace has saved, each as one sentence with an on/off switch and
   when it last ran. Tap a row to change its words. account-health GET /api/automations. */

import { h, put, em, button, empty } from '../../kit.js';
import { style, ah, powerBar, autoRow, openEditor } from './_auto.js';

const load = ctx => ah(ctx, '/api/automations');

function render(el, d, ctx) {
  style();
  const reload = async () => { if (ctx.sample) return; const fresh = await load(ctx).catch(() => null); if (fresh) render(el, fresh, ctx); };
  const mine = ((d && d.automations) || []).filter(a => !ctx.brand || a.brand === 'all' || a.brand === ctx.brand.id);
  const on = mine.filter(a => a.state === 'on'), off = mine.filter(a => a.state !== 'on');
  const blank = { brand: ctx.brand ? ctx.brand.id : 'all', state: 'draft', when: { type: 'card_status', status: 'review' }, if: [], do: [], tell: { who: [{ kind: 'me' }] },
    sentence: { text: '', parts: [{ t: 'text', text: 'When a production card moves to ' }, { t: 'slot', key: 'when.status', text: 'Review' }, { t: 'text', text: ', for ' }, { t: 'slot', key: 'brand', text: 'any brand' }, { t: 'text', text: ', tell ' }, { t: 'slot', key: 'tell.who.0', text: 'me' }, { t: 'text', text: ', each in their own way.' }] } };
  put(el, h('div', { class: 'au' },
    powerBar(d, ctx, reload),
    h('div', { class: 'au-top' },
      h('p', null, on.length ? `${on.length} switched on. Each person picks how it reaches them in Your profile, How things reach me.` : 'Nothing is switched on. Start from a template, or write your own.'),
      button('Templates', { href: ctx.href('automations', 'templates') }),
      button('New automation', { primary: true, onclick: () => openEditor(blank, d, ctx, reload) })),
    !mine.length ? empty({ title: 'No automations yet', text: 'An automation is one sentence: when this happens, do this, and tell these people. Pick a template to start.', action: button('See the templates', { primary: true, href: ctx.href('automations', 'templates') }) }) : null,
    on.length ? h('section', { class: 'au-g' }, h('h3', null, 'On'), h('div', { class: 'au-list' }, on.map(a => autoRow(a, d, ctx, reload)))) : null,
    off.length ? h('section', { class: 'au-g' }, h('h3', null, 'Off'), h('div', { class: 'au-list' }, off.map(a => autoRow(a, d, ctx, reload)))) : null));
}

export default {
  title: ['What runs ', em('by itself')],
  eyebrow: 'Automations',
  ranges: false,
  load, render,
};
