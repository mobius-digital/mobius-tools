/* Ads > Amazon > Creative. "On Amazon, the listing is the ad."
   Spend by ad type, the listing photos, the split tests and the brand ads are not in any worker yet, so
   with a real brand this page shows the live ad spend and says what is missing. Sample mode draws the
   whole page from the fixture. Locked parts (visits, conversion, Store pages, video views) need the
   owner's Amazon login whatever the mode. */

import { put } from '../../kit.js';
import { h, s, card, button, statusDot, gauge, em, pct, num, skeleton } from '../../kit.js';
import { css, usd, roas, splitBar, notConnected, needsLogin, loadTotals, winLabel } from './_ui.js';
import { def, defOn, headRow } from '../platforms/_ads.js';

/* ---------- stand-in pictures, until the real listing photo is in the data (item.image) ---------- */
const belt = (c1, c2) => [
  s('ellipse', { cx: 60, cy: 66, rx: 46, ry: 4, fill: 'rgba(28,20,10,.07)' }),
  s('rect', { x: 12, y: 36, width: 86, height: 18, rx: 4, fill: c1 }),
  s('path', { d: 'M18 40H84M18 50H84', stroke: '#fff', 'stroke-width': 1.2, 'stroke-dasharray': '3 3', fill: 'none', opacity: .55 }),
  s('circle', { cx: 26, cy: 45, r: 1.8, fill: '#fff', opacity: .8 }), s('circle', { cx: 36, cy: 45, r: 1.8, fill: '#fff', opacity: .8 }), s('circle', { cx: 46, cy: 45, r: 1.8, fill: '#fff', opacity: .8 }),
  s('rect', { x: 84, y: 30, width: 26, height: 30, rx: 5, fill: c2 }),
  s('rect', { x: 90, y: 36, width: 14, height: 18, rx: 2.5, fill: 'none', stroke: '#fff', 'stroke-width': 2, opacity: .85 }),
];
const golfer = (c1, c2) => [
  s('path', { d: 'M30 90C30 74 44 66 60 66C76 66 90 74 90 90Z', fill: '#D8D5CE' }),
  s('circle', { cx: 60, cy: 46, r: 17, fill: '#E4D5C3' }),
  s('path', { d: 'M42 42C42 28 50 20 60 20C70 20 78 28 78 40V42Z', fill: c1 }),
  s('path', { d: 'M75 38C84 38 91 42 92 46C84 44.5 79 44.5 74 44.5Z', fill: c2 }),
];
const chart = () => [
  s('rect', { x: 22, y: 18, width: 76, height: 54, rx: 5, fill: '#fff', stroke: 'rgba(28,20,10,.14)' }),
  s('path', { d: 'M22 34H98M22 48H98M22 60H98M48 18V72M74 18V72', stroke: 'rgba(28,20,10,.14)', fill: 'none' }),
];
function picture(item, w, ht) {
  if (item.image) return h('img', { src: item.image, alt: '', loading: 'lazy', decoding: 'async' });
  if (item.art === 'text') return h('span', { class: 'txt' }, item.text);
  const c1 = item.c1 || '#1F2937', c2 = item.c2 || '#111827';
  const kids = item.art === 'golfer' ? golfer(c1, c2) : item.art === 'chart' ? chart() : belt(c1, c2);
  return s('svg', { viewBox: '0 0 120 90', width: w, height: ht, 'aria-hidden': 'true' }, kids);
}

const sect = (title, note) => h('div', { class: 'az-sectitle' }, h('h2', null, title), note && h('span', null, note));
const stat = (label, value) => h('div', null, h('span', null, label), h('b', null, value == null ? notConnected() : value));
const AZ = "Amazon Ads' own count";

/* the lead: a titled card with the orange split bar, the same look as Amazon > Products */
function lead(d) {
  const sp = d.spend, total = sp.products + sp.brands + (sp.display || 0), wl = winLabel(d.window);
  return card({ title: 'Where the ad money goes', note: wl + ' · ' + AZ, class: 'az-splitc' },
    h('p', { class: 'az-say' }, h('b', null, pct(total ? sp.products / total : null)), ' of ad spend shows the listing itself: main photo, title, price and stars. No separate ad to design.'),
    splitBar([{ value: sp.products, color: 'var(--brand)' }, { value: sp.brands, color: 'var(--slate)' }, { value: sp.display || 0, color: 'var(--line-strong)' }],
      { thin: true, label: `Ad spend by ad type: ${usd(sp.products)} Sponsored Products, ${usd(sp.brands)} Sponsored Brands, ${usd(sp.display || 0)} Sponsored Display` }),
    h('div', { class: 'az-ends' },
      h('span', null, h('em', { class: 'az-dot', style: { '--c': 'var(--brand)' } }), h('b', null, usd(sp.products)), ' Sponsored Products, the listing'),
      h('span', null, h('em', { class: 'az-dot', style: { '--c': 'var(--slate)' } }), h('b', null, usd(sp.brands)), ' Sponsored Brands, pictures and video'),
      sp.display ? h('span', null, h('em', { class: 'az-dot', style: { '--c': 'var(--line-strong)' } }), h('b', null, usd(sp.display)), ' Sponsored Display') : null));
}

function listing(x) {
  return h('article', { class: 'az-card' },
    h('div', { class: 'az-ph' + (x.flip ? ' flip' : '') }, picture(x, 150, 112)),
    h('div', { class: 'az-body' },
      h('div', { class: 'az-name' }, x.name, h('small', null, x.shot)),
      h('div', { class: 'az-stats' }, stat(def('Ad click rate', 'click_rate'), pct(x.ctr, { digits: 2 })), stat('Units', num(x.units)), stat('Ad spend', usd(x.spend)))));
}

function test(t) {
  const win = t.winner;                       // 'a' | 'b' | null while it runs
  const side = (key, x) => h('div', { class: 'az-ph' + (win === key ? ' win' : '') }, h('span', { class: 'az-tag' }, key.toUpperCase()), picture(x, 120, 90));
  const rate = (key, x) => h('div', null, h('span', null, x.label), h('b', { class: win && win !== key ? 'dim' : '' }, pct(x.rate, { digits: 1 })));
  return h('article', { class: 'az-card' },
    h('div', { class: 'az-ab' }, side('a', t.a), side('b', t.b)),
    h('div', { class: 'az-body' },
      h('div', { class: 'az-namerow' }, h('div', { class: 'az-name' }, t.name, h('small', null, t.what + ', ' + t.dates)),
        win ? statusDot('good', win.toUpperCase() + ' kept') : statusDot('warn', 'Running')),
      h('div', { class: 'az-vs' }, rate('a', t.a), rate('b', t.b)),
      h('div', { class: 'az-chance' }, h('span', null, 'Chance B is better'), gauge({ value: t.chance * 100, max: 100, thin: true }), h('b', null, pct(t.chance)))));
}

export default {
  /* the plain question, drawn by the shell above the tabs */
  title: 'Amazon creative',
  eyebrow: 'Amazon',

  async load(ctx) {
    const t = await loadTotals(ctx);
    return { ...t, spend: null };       // no route reads spend by ad type, listings or tests yet
  },

  skeleton(el) { put(el, skeleton('chart'), skeleton('row', 4)); },

  render(el, d, ctx) {
    css();
    d = d || {};
    if (!d.spend) {
      put(el, needsLogin(ctx, d, {
        title: "Listing photos and tests need the owner's Amazon login",
        what: 'How that splits by ad type, each listing photo and the split tests are in Amazon itself. One sign in from the owner brings them here.',
      }));
      return;
    }
    const sp = d.spend, total = sp.products + sp.brands + (sp.display || 0);
    const owner = d.owner || 'the owner', wl = winLabel(d.window);
    ctx.askWindow = wl;
    ctx.askContext = `Amazon creative for ${ctx.brand ? ctx.brand.name : 'this brand'}, ${wl}: ${usd(sp.products)} of ad spend on Sponsored Products (the listing), ${usd(sp.brands)} on Sponsored Brands (Amazon Ads' own count).`;
    const kids = [
      headRow({ help: [
        { title: 'What it is for', text: 'On Amazon the listing is the ad: how ad spend splits by ad type, how each listing photo does, the split tests and the brand ads, ' + winLabel(d.window) + '.' },
        { title: 'Where the numbers come from', text: 'Spend and ad sales are Triple Whale and Amazon Ads. Tests are typed in by the Amazon buyer. Rank research stays in Data Dive. Numbers marked Not connected need the owner\'s Seller Central login.' },
      ] }),
      h('div', { class: 'lx-take az-ask' },
        h('span', { class: 'say' }, 'Visits, conversion, video views and Store page numbers need the owner\'s Amazon login. One login from ', h('b', null, owner), d.owner_role ? ', ' + d.owner_role + ',' : '', ' fills them in. About 5 minutes.'),
        !ctx.isClient ? button('Ask ' + owner, { icon: 'arrow', href: ctx.href('requests', 'index') }) : null),
      lead(d)];

    if (d.listings && d.listings.length) {
      kids.push(sect('Listing photos', `top ${d.listings.length} by sales · ${wl} · ${AZ}`), h('div', { class: 'az-grid four' }, d.listings.map(listing)));
    }
    if (d.tests && d.tests.length) {
      kids.push(sect('Split tests', "conversion, A against B · each test's own dates · Amazon's test count"), h('div', { class: 'az-grid three', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))' } }, d.tests.map(test)));
    }

    const ba = d.brand_ads;
    kids.push(sect('Brand ads and Store pages', pct(total ? sp.brands / total : null) + ' of ad spend · ' + wl + ' · ' + AZ),
      h('div', { class: 'az-two' },
        h('article', { class: 'az-card' }, h('div', { class: 'az-body roomy' },
          h('div', { class: 'az-name' }, 'Brand video and image ads', h('small', null, ba ? `Sponsored Brands, ${ba.live === 1 ? 'one campaign' : ba.live + ' campaigns'} live: ${ba.campaign}` : 'Sponsored Brands')),
          h('div', { class: 'az-stats start' }, stat('Spend', ba ? usd(ba.spend) : null), stat('Ad sales', ba ? usd(ba.ad_sales) : null), stat('ROAS, Amazon says', ba && ba.spend ? roas(ba.ad_sales / ba.spend) : null)))),
        h('article', { class: 'az-card' }, h('div', { class: 'az-body roomy' },
          h('div', { class: 'az-name' }, 'Store pages', h('small', null, d.store_name || 'The brand store on Amazon')),
          h('div', { class: 'az-stats start' }, stat('Visits', null), stat('Sales', null), stat('Best page', null))))));
    put(el, ...kids);
  },
};
