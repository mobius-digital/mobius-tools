/* Sign in. This page does not sign anyone in itself: both buttons hand over to the live sign in
   (the old app's own page, and the Google hop that returns here). The session it stores is the
   one this shell reads, so coming back means being signed in. */

import { put } from '../kit.js';
import { h, s, svgNode, button, field, statusDot, legend, gauge, takeaway, em } from '../kit.js';
import { mark, icon, GOOGLE_G } from '../icons.js';
import { APP_NAME, APP_WORD, ORG_NAME, SIGNIN_URL, SIGNIN_GOOGLE_URL } from '../config.js';

/* the product picture on the right: sample figures, drawn once */
function picture() {
  const cum = [3850, 6650, 9100, 10250, 12400, 14700, 19300, 22000, 25600, 27900, 30000, 32400, 35100, 38200, 40100, 43500, 43950, 45050, 46100, 46700, 47200, 47641];
  const scale = 44721 / 47641, max = 50000, x1 = 470, yTop = 26, yBot = 196;
  const pts = cum.map((v, i) => [x1 * i / (cum.length - 1), yBot - (yBot - yTop) * v * scale / max]);
  let d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i], mx = ((p[0] + q[0]) / 2).toFixed(1);
    d += ` C${mx} ${p[1].toFixed(1)} ${mx} ${q[1].toFixed(1)} ${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  const py0 = yBot - (yBot - yTop) * 1860 / max, py1 = yBot - (yBot - yTop) * 40924 / max;
  const svg = s('svg', { class: 'ch lx-plot', viewBox: '0 0 520 220', preserveAspectRatio: 'none' },
    [50, 106, 162].map(y => s('line', { class: 'gl', x1: 28, x2: 492, y1: y, y2: y })),
    s('path', { class: 'area', d: `${d} L${last[0].toFixed(1)} 220 L0 220 Z` }),
    s('path', { class: 'cmp', d: `M0 ${py0.toFixed(1)} L${x1} ${py1.toFixed(1)}` }),
    s('path', { class: 's1', d }),
    s('circle', { class: 'dot', cx: last[0].toFixed(1), cy: last[1].toFixed(1), r: 5.5 }));
  return h('section', { class: 'lx-si-right', 'aria-hidden': 'true' },
    h('div', { class: 'lx-si-copy' }, h('h2', null, 'Every number,', h('br'), 'in its ', em('place.')), h('p', null, 'See what is working and what to do next.')),
    h('div', { class: 'lx-si-card lx-si-main' },
      h('div', { class: 'hd' }, h('div', { class: 'l' }, 'Sales this month'), h('div', { class: 'v' }, '$44,721'),
        h('div', { class: 'sub' }, statusDot('good', '9% ahead of plan'), h('span', null, 'plan $40,924'))),
      legend([{ name: 'Sales', lead: true }, { name: 'Plan', color: '#A3ABBD' }]), svg),
    h('div', { class: 'lx-si-card lx-si-side', style: { top: '316px' } },
      h('div', { class: 'l' }, 'MER, whole store'), h('div', { class: 'v' }, '1.75x'),
      h('div', { style: { marginTop: '14px' } }, gauge({ value: 1.75, goal: 2.5, max: 3, thin: true })),
      h('div', { class: 's', style: { display: 'flex', justifyContent: 'space-between', marginTop: '10px' } }, h('span', null, '0'), h('span', null, 'goal 2.50x'))),
    h('div', { class: 'lx-si-card lx-si-side', style: { top: '498px' } },
      h('div', { class: 'l' }, 'New customers'), h('div', { class: 'v' }, '231'), h('div', { class: 's' }, 'Nov 1 to 22')),
    h('div', { class: 'lx-si-ai' }, takeaway(['Sales are ', h('b', null, '$3,797 ahead'), ' of plan this month.'])));
}

export default {
  title: 'Sign in',
  render(el, _data, ctx = {}) {
    const email = field({ label: 'Email', type: 'email', placeholder: 'you@yourbrand.com', autocomplete: 'email', icon: 'email', id: 'si-email' });
    const next = ctx.sample ? './?sample=1' : SIGNIN_URL;
    const form = h('form', { class: 'lx-si-form', onsubmit: e => { e.preventDefault(); location.href = next; } },
      h('h1', null, 'Sign in to ' + APP_NAME),
      h('p', { class: 'lede' }, 'Your store, your ads and what to do next.'),
      ctx.message ? h('p', { class: 'lx-pill warn', style: { height: 'auto', padding: '8px 12px', marginBottom: '16px', whiteSpace: 'normal', lineHeight: '1.4' } }, ctx.message) : null,
      email,
      button('Continue', { primary: true, href: next, icon: 'arrow' }),
      h('div', { class: 'lx-si-or' }, 'or'),
      h('a', { class: 'lx-btn', href: ctx.sample ? next : SIGNIN_GOOGLE_URL }, svgNode(GOOGLE_G), 'Continue with Google'),
      h('div', { class: 'lx-si-client' }, svgNode(icon('link')), h('span', null, h('b', null, 'Clients:'), ' use the link in your invite')));
    put(el, h('div', { class: 'lx-si' },
      h('section', { class: 'lx-si-left' },
        h('a', { class: 'lx-logo', href: './', 'aria-label': APP_NAME }, svgNode(mark(34)), h('b', null, APP_WORD)),
        form,
        h('div', { class: 'lx-si-foot' }, h('span', null, 'by ' + ORG_NAME), h('span', null, h('a', { href: '../../privacy/' }, 'Privacy')))),
      picture()));
  },
};
