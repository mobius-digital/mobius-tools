/* Ads > Amazon > Search terms. "Which searches are we paying for?"
   The search term report lives in Amazon Ads and no worker reads it yet, so with a real brand this page
   shows the live ad spend and says what is missing. Sample mode draws the whole page from the fixture. */

import { put } from '../../kit.js';
import { h, card, takeaway, button, table, em, toast, pct, num, skeleton, svgNode } from '../../kit.js';
import { icon } from '../../icons.js';
import { css, usd, roas, say, splitBar, needsLogin, loadTotals, winLabel } from './_ui.js';
import { def, headRow } from '../platforms/_ads.js';
import { askWhy } from '../home/_biz.js';

const SOFT = 'var(--line-strong)';     // many small misses: a quiet gray, not a third status color

function lead(d) {
  const sold = d.sold, big = d.waste_big, small = d.waste_small;
  const lost = big.spend + small.spend, total = d.spend_total || sold.spend + lost;
  const share = total ? lost / total : null;
  const key = (cls, amount, color, text, w) => h('div', { class: 'az-key ' + cls, style: w ? { '--w': w } : null },
    h('b', null, usd(amount)), h('span', null, h('em', { style: { '--c': color } }), text));
  return h('section', { class: 'lx-hero line' },
    h('div', { class: 'az-lead' },
      h('span', { class: 'lx-hero-num' }, pct(share)),
      h('div', null, h('b', null, `of spend went to ${num(big.terms + small.terms)} terms with no sale`),
        h('p', null, `${usd(lost)} of ${usd(total)}, Amazon, the last ${d.days || 30} days`))),
    h('div', null,
      splitBar([{ value: sold.spend, color: 'var(--ink)' }, { value: big.spend, color: 'var(--bad)' }, { value: small.spend, color: SOFT }],
        { label: `Ad spend split: ${usd(sold.spend)} on terms that sold, ${usd(big.spend)} on ${big.terms} terms over $${d.line || 10} with no sale, ${usd(small.spend)} on ${num(small.terms)} small terms with no sale` }),
      h('div', { class: 'az-keys' },
        key('first', sold.spend, 'var(--ink)', `Spend on terms that sold (${num(sold.terms)})`, (100 * sold.spend / total).toFixed(2) + '%'),
        key('mid', big.spend, 'var(--bad)', `Over $${d.line || 10}, no sale (${num(big.terms)})`),
        key('', small.spend, SOFT, `Under $${d.line || 10} each, no sale (${num(small.terms)})`))));
}

function sellTable(d) {
  return card({ title: 'Terms that sell', note: `top ${d.sell_rows.length} by orders`, flush: true },
    table({
      roomy: true,
      cols: [
        { key: 'term', label: 'Search term', class: 'name', render: r => (r.total ? `${num(r.terms)} more that sold` : r.term) },
        { key: 'spend', label: def('Spend', 'ad_spend'), num: true, sortable: true, render: r => usd(r.spend) },
        { key: 'orders', label: def('Orders', { title: 'Orders', body: 'Orders Amazon Ads credits to the search term.', source: 'Amazon Ads' }), num: true, sortable: true },
        { key: 'roas', label: def('ROAS', 'roas'), num: true, sortable: true, class: 'strong', render: r => roas(r.roas) },
      ],
      rows: d.sell_rows, sort: { key: 'orders', dir: 'desc' },
      total: d.sell_more && { ...d.sell_more, total: true },
    }));
}

function wasteTable(d, ctx) {
  const picked = new Set(d.waste_rows.map(r => r.term));
  const who = d.buyer || 'the buyer';
  const label = document.createTextNode('');
  const first = String(who).split(' ')[0];
  const all = h('button', { class: 'az-ck on', type: 'button', 'aria-pressed': 'true', 'aria-label': 'Pick every term', title: 'Pick every term', onclick: () => {
    const on = picked.size !== d.waste_rows.length;
    picked.clear(); if (on) d.waste_rows.forEach(r => picked.add(r.term));
    boxes.forEach(b => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); paint();
  } }, svgNode(icon('check')));
  const boxes = [];
  const paint = () => { label.textContent = `Send to ${first} (${picked.size})`; send.disabled = !picked.size; const on = picked.size === d.waste_rows.length; all.classList.toggle('on', on); all.setAttribute('aria-pressed', String(on)); };
  const send = button(label, { onclick: async () => {
    const list = d.waste_rows.filter(r => picked.has(r.term)).map(r => `${r.term} (${usd(r.spend)}, ${r.clicks} clicks, no sale)`).join('\n');
    let copied = false;
    try { await navigator.clipboard.writeText(list); copied = true; } catch {}
    toast(copied ? `${picked.size} terms copied. Paste them to ${who}: sending from here comes next.` : `Sending to ${who} from here comes next.`, { ms: 4200 });
  } });
  paint();
  const check = r => {
    const b = h('button', { class: 'az-ck on', type: 'button', 'aria-pressed': 'true', 'aria-label': 'Pick ' + r.term, onclick: () => {
      const on = !picked.has(r.term);
      on ? picked.add(r.term) : picked.delete(r.term);
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); paint();
    } }, svgNode(icon('check')));
    boxes.push(b);
    return b;
  };
  const line = d.line || 10;
  return card({ title: 'Terms that waste', note: `over $${line}, no sale`, flush: true, action: !ctx.isClient ? send : null },
    table({
      roomy: true,
      cols: [
        { key: 'term', label: h('span', { class: 'az-term' }, ctx.isClient ? null : all, 'Search term'), class: 'name', render: r => (r.total ? `${num(r.terms)} more, under $${line} each` : h('span', { class: 'az-term' }, ctx.isClient ? null : check(r), r.term)) },
        { key: 'spend', label: def('Spend', 'ad_spend'), num: true, class: 'strong', render: r => usd(r.spend) },
        { key: 'clicks', label: 'Clicks', num: true, render: r => num(r.clicks) },
        { key: 'orders', label: 'Orders', num: true, render: r => (r.total ? r.orders : h('span', { class: 'dim' }, r.orders)) },
      ],
      rows: d.waste_rows,
      total: d.waste_small && { ...d.waste_small, orders: 0, total: true },
    }));
}

export default {
  /* the plain question, drawn by the shell above the tabs */
  title: ['Which searches are we ', em('paying for?')],
  eyebrow: 'Amazon, last 30 days',
  ranges: false,

  async load(ctx) {
    const t = await loadTotals(ctx);
    return { ...t, sold: null };       // no route reads the search term report yet
  },

  skeleton(el) { put(el, skeleton('chart'), skeleton('row', 6)); },

  render(el, d, ctx) {
    css();
    d = d || {};
    if (!d.sold) {
      put(el, needsLogin(ctx, d, {
        title: "Search terms need the owner's Amazon login",
        what: 'Which searches that money went to is in Amazon Ads itself. One sign in from the owner brings it here.',
      }));
      return;
    }
    const kids = [headRow({ help: [
      { title: 'What it is for', text: 'Which Amazon searches the ads pay for, which ones sell and which spend with no sale, over the last ' + (d.days || 30) + ' days. Pick the waste and send the list to the Amazon buyer.' },
      { title: 'Where the numbers come from', text: 'Spend and orders per search term are Amazon Ads. Totals are Triple Whale. Rank research stays in Data Dive.' },
    ] }), lead(d)];
    if (d.take) kids.push(takeaway(say(d.take), { action: !ctx.isClient ? askWhy(ctx, 'Read the Amazon search terms for me', 'Read this for me') : null }));
    kids.push(h('div', { class: 'az-two' }, sellTable(d), wasteTable(d, ctx)));
    put(el, ...kids);
  },
};
