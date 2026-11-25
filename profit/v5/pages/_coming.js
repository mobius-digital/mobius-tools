/* The shared page for a route with no module yet, and the plain error state.
   One line, and a way to the same page in old Locus when there is one. */

import { put } from '../kit.js';
import { h, button } from '../kit.js';
import { APP_NAME, OLD_LOCUS } from '../config.js';

export default {
  title: 'Coming',
  render(el, _data, ctx) {
    put(el, h('div', { class: 'lx-empty' },
      h('span', { class: 'lx-eyebrow' }, ctx.view === 'agency' ? 'All brands' : ctx.brand ? ctx.brand.name : ''),
      h('h3', null, ctx.title),
      h('p', null, 'This page is being rebuilt.'),
      ctx.legacy && !ctx.isClient ? button('Open it in old ' + APP_NAME, { primary: true, large: true, href: ctx.legacy, icon: 'arrow' }) : null));
  },
  /** A page that failed to load its numbers. Says why in one line and offers a retry. */
  error(el, err, ctx, retry) {
    put(el, h('div', { class: 'lx-empty' },
      h('h3', null, 'This page could not load'),
      h('p', null, (err && err.message) || 'Something went wrong.'),
      h('div', { class: 'lx-row' },
        button('Try again', { primary: true, onclick: retry }),
        ctx.isClient ? null : button('Open it in old ' + APP_NAME, { href: ctx.legacy || OLD_LOCUS }))));
  },
};
