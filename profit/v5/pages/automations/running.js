/* Automations > Running. Every automation this workspace has saved, each as one sentence with an on/off switch and
   when it last ran. Tap a row to change its words. account-health GET /api/automations.
   The "automations are off" strip shows here only (the other tabs show a small "Workspace off" pill). */

import { h, put, em, button, empty, addStyles } from '../../kit.js';
import { pageHelp } from '../../defs.js';
import { style, ah, autoRow, openEditor, forBrand } from './_auto.js';
import { workspaceStrip, plainStatus } from './_bits.js';

const load = ctx => ah(ctx, '/api/automations');

/* the shared row, with plain words: the underlined words read as "tap to change" (not as a definition), and the
   last run is one dotted line ("Last ran 2 days ago · Nothing was missing, so nobody was told") */
function row(a, d, ctx, reload) {
  const node = autoRow(a, d, ctx, reload);
  node.title = 'Click to change the words';
  node.querySelectorAll('.au-slot').forEach(s => { s.title = 'Click to change'; });
  const meta = node.querySelector('.au-meta');
  if (meta) { meta.querySelectorAll(':scope > span:not(.lx-pill)').forEach(s => s.remove()); meta.append(plainStatus(a)); }
  return node;
}

function render(el, d, ctx) {
  style();
  addStyles('au-running-css', `.au-running .au-row .au-slot.ro{border-bottom:1.5px solid var(--line-strong);border-bottom-style:solid;cursor:pointer}
.au-running .au-row:hover .au-slot.ro{border-bottom-color:var(--brand)}
.au-running .au-row:hover{background:var(--row-hover)}`);
  const reload = async () => { if (ctx.sample) return; const fresh = await load(ctx).catch(() => null); if (fresh) render(el, fresh, ctx); };
  const mine = ((d && d.automations) || []).filter(a => !ctx.brand || a.brand === 'all' || a.brand === ctx.brand.id);
  const on = mine.filter(a => a.state === 'on'), off = mine.filter(a => a.state !== 'on');
  const blank = { state: 'draft', when: { type: 'card_status', status: 'review' }, if: [], do: [], tell: { who: [{ kind: 'me' }] },
    sentence: { text: '', parts: [{ t: 'text', text: 'When a production card moves to ' }, { t: 'slot', key: 'when.status', text: 'Review' }, { t: 'text', text: ', for ' }, { t: 'slot', key: 'brand', text: 'any brand' }, { t: 'text', text: ', tell ' }, { t: 'slot', key: 'tell.who.0', text: 'me' }, { t: 'text', text: ', each in their own way.' }] } };
  Object.assign(blank, forBrand(blank.sentence, ctx));   // in a brand view the words name that brand
  const waiting = d && d.power === false;
  put(el, h('div', { class: 'au au-running' },
    h('div', { class: 'au-head' }, pageHelp({ body: [
      { title: 'What it is for', text: 'Every automation this workspace has saved. Each one is a sentence: when this happens, do this, and tell these people. Tap a row to change its words; the switch turns it on or off.' },
      { title: 'How it reaches people', text: 'Each person picks how an automation reaches them in Your profile, How things reach me. Who "the buyer" or "the brand owner" is, is set under Who does what.' },
    ] })),
    workspaceStrip(d, ctx, reload),
    h('div', { class: 'au-top' },
      h('p', null, on.length ? (waiting ? `${on.length} set to on, waiting for the workspace switch.` : `${on.length} switched on.`) : 'Nothing is switched on. Start from a template, or write your own.'),
      button('Who does what', { href: ctx.href('automations', 'people') }),
      button('Templates', { href: ctx.href('automations', 'templates') }),
      button('New automation', { primary: true, onclick: () => openEditor(blank, d, ctx, reload) })),
    !mine.length ? empty({ title: 'No automations yet', text: 'An automation is one sentence: when this happens, do this, and tell these people. Pick a template to start.', action: button('See the templates', { primary: true, href: ctx.href('automations', 'templates') }) }) : null,
    on.length ? h('section', { class: 'au-g' }, h('h3', null, waiting ? 'Set to on' : 'On'), h('div', { class: 'au-list' }, on.map(a => row(a, d, ctx, reload)))) : null,
    off.length ? h('section', { class: 'au-g' }, h('h3', null, 'Off'), h('div', { class: 'au-list' }, off.map(a => row(a, d, ctx, reload)))) : null));
}

export default {
  title: ['What runs ', em('by itself')],
  eyebrow: 'Automations',
  ranges: false,
  load, render,
};
