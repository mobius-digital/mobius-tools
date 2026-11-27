/* Ads > Amazon > Search terms. "Which searches are we paying for?"
   The search term report lives in Amazon Ads and no worker reads it yet, so with a real brand this page
   shows the live ad spend and says what is missing. Sample mode draws the whole page from the fixture. */

import { put } from '../../kit.js';
import { h, card, kpi, tiles, sheet, takeaway, button, table, em, toast, pct, num, money, skeleton, svgNode, addStyles } from '../../kit.js';
import { icon } from '../../icons.js';
import { css, usd, roas, say, splitBar, needsLogin, loadTotals, winLabel, AZ } from './_ui.js';
import { def, headRow } from '../platforms/_ads.js';
import { askWhy } from '../home/_biz.js';

const SOFT = 'var(--line-strong)';     // many small misses: a quiet gray, not a third status color
const ok = n => n != null && isFinite(n);
const AZS_CSS = `
.azo-sheet{display:grid;gap:18px}
.azo-sheet .azp-figs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 14px}
.azo-sheet .azp-figs span{display:grid;gap:2px;min-width:0}
.azo-sheet .azp-figs small{font-size:12px;color:var(--muted)}
.azo-sheet .azp-figs b{font-size:var(--num-m);font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.azo-sheet .azp-note{margin:0;font-size:var(--fs-small,12.5px);color:var(--muted)}`;

/* three tiles, then the split bar in its own titled card (the batch 1 look) */
function lead(d) {
  const sold = d.sold, big = d.waste_big, small = d.waste_small, line = d.line || 10;
  const lost = big.spend + small.spend, total = d.spend_total || sold.spend + lost;
  const share = v => (total ? pct(v / total) + ' of spend on terms' : '');
  const W = 'Last ' + (d.days || 30) + ' days', wl = winLabel(d.window);
  const row = tiles([
    kpi({ label: 'Spend on terms that sold', value: usd(sold.spend), window: W, source: AZ, sub: `${num(sold.terms)} terms, ${share(sold.spend)}` }),
    kpi({ label: `Over $${line}, no sale`, value: usd(big.spend), window: W, source: AZ, sub: `${num(big.terms)} terms, ${share(big.spend)}` }),
    kpi({ label: `Under $${line} each, no sale`, value: usd(small.spend), window: W, source: AZ, sub: `${num(small.terms)} terms, ${share(small.spend)}` }),
  ], { cols: 3 });
  const key = (color, amount, text) => h('span', null, h('em', { class: 'az-dot', style: { '--c': color } }), h('b', null, usd(amount)), ' ' + text);
  const bar = card({ title: 'Where the search money went', note: wl + ' · ' + AZ, class: 'az-splitc' },
    h('p', { class: 'az-say' }, h('b', null, pct(total ? lost / total : null)), ` of spend went to ${num(big.terms + small.terms)} terms with no sale: ${usd(lost)} of ${usd(total)}.`),
    splitBar([{ value: sold.spend, color: 'var(--brand)' }, { value: big.spend, color: 'var(--bad)' }, { value: small.spend, color: SOFT }],
      { thin: true, label: `Ad spend split: ${usd(sold.spend)} on terms that sold, ${usd(big.spend)} on ${big.terms} terms over $${line} with no sale, ${usd(small.spend)} on ${num(small.terms)} small terms with no sale` }),
    h('div', { class: 'az-ends' },
      key('var(--brand)', sold.spend, 'on terms that sold'), key('var(--bad)', big.spend, `over $${line}, no sale`), key(SOFT, small.spend, `under $${line} each, no sale`)));
  return [row, bar];
}

/* one search term, every figure */
function termSheet(r, wl, sold) {
  const f = (label, value) => h('span', null, h('small', null, label), h('b', null, value));
  sheet({ title: r.term, side: 'center', body: h('div', { class: 'azo-sheet' },
    h('p', { class: 'azp-note' }, ['Amazon search term', wl, AZ].join(' · ')),
    h('div', { class: 'azp-figs' },
      f('Spend', usd(r.spend)), f('Orders', num(r.orders || 0)),
      sold ? f('ROAS, Amazon says', roas(r.roas)) : f('Clicks', ok(r.clicks) ? num(r.clicks) : 'no data'),
      sold && r.orders ? f('Per order', usd(r.spend / r.orders)) : !sold && r.clicks ? f('Per click', money(r.spend / r.clicks, { cents: true })) : null),
    h('p', { class: 'azp-note' }, sold ? 'It sold: keep it, and think about a keyword of its own if it is not one yet.' : 'It spent with no sale: worth adding as a negative keyword in Amazon Ads.')) });
}

function sellTable(d) {
  const wl = winLabel(d.window);
  return card({ title: 'Terms that sell', note: `top ${d.sell_rows.length} by orders · ${wl} · ${AZ}`, flush: true },
    table({
      roomy: true,
      cols: [
        { key: 'term', label: 'Search term', class: 'name', render: r => (r.total ? `${num(r.terms)} more that sold` : r.term) },
        { key: 'spend', label: 'Spend', num: true, sortable: true, render: r => usd(r.spend) },
        { key: 'orders', label: def('Orders', { title: 'Orders', body: 'Orders Amazon Ads credits to the search term.', source: 'Amazon Ads' }), num: true, sortable: true },
        { key: 'roas', label: def('ROAS, Amazon says', 'roas'), num: true, sortable: true, class: 'strong', render: r => roas(r.roas) },
      ],
      rows: d.sell_rows, sort: { key: 'orders', dir: 'desc' },
      total: d.sell_more && { ...d.sell_more, total: true },
      onRow: r => { if (!r.total) termSheet(r, wl, true); },
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
  const wl = winLabel(d.window);
  return card({ title: 'Terms that waste', note: `over $${line}, no sale · ${wl} · ${AZ}`, flush: true, action: !ctx.isClient ? send : null },
    table({
      roomy: true,
      cols: [
        { key: 'term', label: h('span', { class: 'az-term' }, ctx.isClient ? null : all, 'Search term'), class: 'name', render: r => (r.total ? `${num(r.terms)} more, under $${line} each` : h('span', { class: 'az-term' }, ctx.isClient ? null : check(r), r.term)) },
        { key: 'spend', label: 'Spend', num: true, class: 'strong', render: r => usd(r.spend) },
        { key: 'clicks', label: 'Clicks', num: true, render: r => num(r.clicks) },
        { key: 'orders', label: 'Orders', num: true, render: r => (r.total ? r.orders : h('span', { class: 'dim' }, r.orders)) },
      ],
      rows: d.waste_rows,
      total: d.waste_small && { ...d.waste_small, orders: 0, total: true },
      onRow: (r, _i, e) => { if (!r.total && !(e && e.target && e.target.closest && e.target.closest('.az-ck'))) termSheet(r, wl, false); },
    }));
}

export default {
  /* the plain question, drawn by the shell above the tabs */
  title: 'Amazon search terms',
  eyebrow: 'Amazon · last 30 days',
  ranges: false,

  async load(ctx) {
    const t = await loadTotals(ctx);
    return { ...t, sold: null };       // no route reads the search term report yet
  },

  skeleton(el) { put(el, skeleton('chart'), skeleton('row', 6)); },

  render(el, d, ctx) {
    css(); addStyles('azs-css', AZS_CSS);
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
    ] }), ...lead(d)];
    ctx.askWindow = winLabel(d.window);
    ctx.askContext = `Amazon search terms for ${ctx.brand ? ctx.brand.name : 'this brand'}, the last ${d.days || 30} days: ${usd(d.sold.spend)} on terms that sold, ${usd(d.waste_big.spend + d.waste_small.spend)} on terms with no sale (Amazon Ads' own count).`;
    if (d.take) kids.push(takeaway(say(d.take), { action: !ctx.isClient ? askWhy(ctx, 'Read the Amazon search terms for me', 'Read this for me') : null }));
    kids.push(h('div', { class: 'az-two' }, sellTable(d), wasteTable(d, ctx)));
    put(el, ...kids);
  },
};
