/* What works > Copy. "Which words earn the click, and do those clicks buy?"
   Live data: GET /api/hub/creative (profit worker) for clicks and Triple Whale sales per Meta ad, and GET /api/ad-creatives
   (account-health) for each ad's primary text and headline (the top 80 ads by spend). Ads with the same words are one row.
   Copy themes and the words inside the image are AI reads: hidden behind "Tags are being re-checked". */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, card, kpi, kpis, takeaway, segmented, em, money, num, x, skeleton, empty, button } from '../../kit.js';
import { css, gate, noAds, loadAds, sampleAds, art, meter, roll, tagsNote, findingButton, foot, thin, thinWords, p1, SRC_NOTE } from './_ww.js';

const ST = { field: 'body', open: new Set() };
const clean = t => String(t || '').replace(/\s+/g, ' ').trim();

function texts(d, field) {
  const by = new Map();
  for (const a of d.ads) {
    const t = clean(a[field]);
    if (!t || !(a.spend > 0)) continue;
    const k = t.toLowerCase();
    if (!by.has(k)) by.set(k, { text: t, list: [] });
    by.get(k).list.push(a);
  }
  return [...by.values()].map(r => ({ ...r, ...roll(r.list), top: [...r.list].sort((a, b) => b.spend - a.spend) })).sort((a, b) => b.spend - a.spend);
}

/* views each side needs to tell two click rates apart (95% sure, 80% of the time) */
function viewsFor(p1v, p2v) {
  const dlt = Math.abs(p1v - p2v);
  if (!(dlt > 0)) return null;
  return Math.ceil(7.84 * (p1v * (1 - p1v) + p2v * (1 - p2v)) / (dlt * dlt));
}

function testCard(rows, d, ctx) {
  const ok = rows.filter(r => r.ctr != null && r.impr >= 1000);
  if (ok.length < 2) return null;
  const a = ok.reduce((p, c) => (c.ctr > p.ctr ? c : p)), b = ok.filter(r => r !== a).reduce((p, c) => (c.spend > p.spend ? c : p));
  const need = viewsFor(a.ctr, b.ctr), small = viewsFor(0.012, 0.015);
  const q = t => '"' + (t.length > 110 ? t.slice(0, 108).trim() + '...' : t) + '"';
  return card({ class: 'ww-cd', title: 'Test this', note: 'The only fair copy test: same picture, same ad set, two texts.' },
    h('div', { class: 'ww-test', style: { marginTop: '16px' } },
      h('div', null, h('h4', null, '1. Same picture, two texts'),
        h('div', { class: 'ab' },
          h('div', null, h('small', null, `A: ${p1(a.ctr)} click rate today, on ${num(a.list.length)} ads`), q(a.text)),
          h('div', null, h('small', null, `B: ${p1(b.ctr)} click rate today, on ${num(b.list.length)} ads`), q(b.text))),
        h('p', { class: 'lx-foot', style: { marginTop: '10px' } }, 'They ran on different pictures, so the gap is not proven yet.')),
      h('div', null, h('h4', null, '2. Meta setup'),
        h('ol', null, h('li', null, 'Copy the ad into the same ad set: same picture, page and days.'), h('li', null, 'Meta A/B test: change the primary text only, even split.'), h('li', null, 'Run 7 days, no early stop. Click rate picks the winner, then check cost per sale.'))),
      h('div', { class: 'need' }, h('h4', null, '3. How much each text needs'),
        need ? [h('b', null, num(need) + ' views'), h('small', null, `each, for this pair (${p1(a.ctr)} against ${p1(b.ctr)})`)] : null,
        small ? [h('b', null, num(small) + ' views'), h('small', null, 'each, if the gap is small (1.2% against 1.5%)')] : null,
        h('b', null, '100 orders'), h('small', null, 'each, to judge on sales'))),
    !ctx.isClient ? h('div', { style: { marginTop: '14px' } }, findingButton(ctx, () => ({
      say: ['Two texts, two click rates: ', h('b', null, p1(a.ctr)), ' against ', h('b', null, p1(b.ctr)), '. Same picture would settle it.'], measure: 'click rate',
      proof: [{ value: a.ctr, text: p1(a.ctr), name: 'Text A', sub: num(a.list.length) + ' ads' }, { value: b.ctr, text: p1(b.ctr), name: 'Text B', sub: num(b.list.length) + ' ads' }],
      brief: { title: 'Copy test: text A against text B', make: 'One picture, two primary texts, same ad set', why: 'The click rates differ, but on different pictures.', count: 2 },
    }), 'Set up this test')) : null);
}

function row(r, i, d, ctx, maxCtr) {
  const open = ST.open.has(r.text), long = r.text.length > 150;
  const sales = d.has_sales, dim = thin(r.orders);
  const text = h('div', { class: 'ww-txt' }, '"' + (open || !long ? r.text : r.text.slice(0, 148).trim() + '...') + '"',
    long ? h('a', { href: '#', style: { marginLeft: '6px', fontSize: '12.5px', fontWeight: 550 }, onclick: e => { e.preventDefault(); open ? ST.open.delete(r.text) : ST.open.add(r.text); e.target.closest('.ww-cp').replaceWith(row(r, i, d, ctx, maxCtr)); } }, open ? 'Show less' : 'Show all') : null);
  return h('div', { class: 'ww-cp' },
    h('span', { class: 'i' }, String(i + 1)),
    h('div', { class: 'tx' }, text,
      h('div', { class: 'ww-thumbs', style: { marginTop: '10px' } }, r.top.slice(0, 4).map(a => h('div', null, art(a)))),
      h('small', null, `Used in ${num(r.list.length)} ${r.list.length === 1 ? 'ad' : 'ads'}`)),
    h('div', { class: 'n c1' }, h('span', { class: 'k' }, 'Click rate'), h('b', null, p1(r.ctr)), meter(r.ctr, null, { max: maxCtr })),
    h('div', { class: 'n' }, h('span', { class: 'k' }, 'ROAS'), h('b', { class: !sales || dim ? 'dim' : '' }, sales ? x(r.roas) : 'no data'), sales ? meter(r.roas, d.goal_roas, { max: Math.max(d.goal_roas || 0, r.roas || 0) * 1.2 || 1, dim }) : null,
      sales ? h('small', null, dim ? thinWords(r.orders) : `Based on ${num(r.orders)} orders`) : null),
    h('div', { class: 'n s' }, h('span', { class: 'k' }, 'Spend'), h('b', null, money(r.spend))),
    h('div', { class: 'b' }, findingButton(ctx, () => ({
      say: ['These words earn ', h('b', null, p1(r.ctr)), ' click rate' + (sales && !dim ? ' and ' + x(r.roas) + ' ROAS.' : '.')], measure: 'click rate',
      proof: r.top.slice(0, 3).map(a => ({ value: a.ctr || 0, text: p1(a.ctr), name: a.name.slice(0, 16), sub: a.kind === 'video' ? 'video' : 'still' })),
      brief: { title: 'Use these words again', make: 'Three new pictures carrying this text', why: '"' + r.text.slice(0, 90) + (r.text.length > 90 ? '...' : '') + '"', count: 3 },
    }), 'Use again')));
}

function view(d, ctx) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  if (!d.ads || !d.ads.length) return [noAds(ctx)];
  const body = h('div', { class: 'ww-stack' });
  const paint = () => {
    const rows = texts(d, ST.field);
    if (!rows.length) return put(body, empty({ title: 'No words read yet', text: APP_NAME + ' reads the words of the ads with the most spend. None of them came back on these dates.' }));
    const all = roll(rows.flatMap(r => r.list));
    const maxCtr = Math.max(...rows.map(r => r.ctr || 0)) * 1.15 || 0.01;
    const best = rows.filter(r => r.impr >= 1000 && r.ctr != null).sort((a, b) => b.ctr - a.ctr)[0];
    const word = ST.field === 'body' ? 'primary text' : 'headline';
    put(body, ...[
      kpis([
        kpi({ label: ST.field === 'body' ? 'Primary texts used' : 'Headlines used', value: num(rows.length), sub: `across ${num(all.ads)} ads`, size: 'lg' }),
        kpi({ label: 'Normal click rate', value: p1(all.ctr), sub: 'every ad with words read', size: 'lg' }),
        kpi({ label: 'Best click rate', value: best ? p1(best.ctr) : 'no data', sub: best ? '"' + best.text.slice(0, 40) + (best.text.length > 40 ? '..."' : '"') : null, size: 'lg' }),
      ], { cols: 3 }),
      best ? takeaway(['The ', word, ' with the best click rate earns ', h('b', null, p1(best.ctr)), ' against ', h('b', null, p1(all.ctr)), ' normal',
        d.has_sales && !thin(best.orders) ? [', and those clicks return ', h('b', null, x(best.roas)), '.'] : '. Too few orders to judge its sales.']) : null,
      card({ class: 'ww-cd', title: `Every ${word}, most spend first`, note: 'The picture matters more than the words, so read this as hints to test.', flush: true },
        h('div', { class: 'ww-cps' }, rows.slice(0, 20).map((r, i) => row(r, i, d, ctx, maxCtr)))),
      testCard(rows, d, ctx)].filter(Boolean));
  };
  paint();
  return [
    h('div', { class: 'ww-bar' }, segmented([{ id: 'body', label: 'Primary text' }, { id: 'headline', label: 'Headline' }], ST.field, id => { ST.field = id; paint(); }),
      h('span', { class: 'note' }, ST.field === 'body' ? 'The text above the picture.' : 'The line under the picture.')),
    body,
    card({ class: 'ww-cd', title: 'Copy themes and the words inside the image', action: tagsNote('Copy theme and in-image word tags') },
      h('p', { class: 'lx-foot', style: { marginTop: '10px' } }, 'Themes, the headline written on the picture and the call to action on it are read by ' + APP_NAME + ' AI. They come back once a person has checked them.')),
    foot(d.source === 'live' && d.covered ? `Words are read for the top ${num(d.covered)} ads by spend.` : null, 'Grey = under 30 orders.', SRC_NOTE),
  ];
}

const CSS = `.ww-cps{display:grid}
.ww-cp{display:grid;grid-template-columns:28px minmax(0,1fr) 150px 170px 80px auto;gap:18px;align-items:start;padding:18px 28px;border-top:1px solid var(--line)}
.ww-cp:first-child{border-top:0}
.ww-cp .i{font-size:13px;color:var(--faint);padding-top:2px;font-variant-numeric:tabular-nums}
.ww-cp .tx small{display:block;margin-top:6px;font-size:12px;color:var(--muted)}
.ww-cp .n{display:grid;gap:5px;min-width:0}
.ww-cp .n .k{font-size:10.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--faint)}
.ww-cp .n b{font-size:20px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.ww-cp .n b.dim{color:var(--faint);font-weight:500}
.ww-cp .n small{font-size:12px;color:var(--muted)}
.ww-cp .s b{font-size:15px}
@media (max-width:1040px){.ww-cp{grid-template-columns:22px minmax(0,1fr) 1fr;padding:16px 20px}.ww-cp .tx{grid-column:2/-1}.ww-cp .n{grid-column:auto}.ww-cp .c1{grid-column:2}.ww-cp .s{display:none}.ww-cp .b{grid-column:2/-1}}
@media (max-width:759px){.ww-cp{padding:16px 18px;gap:12px}.ww-cp .b .lx-btn{width:100%}}`;

export default {
  title: ['Which words ', em('earn the click?')],
  eyebrow: 'What works',
  load: ctx => loadAds(ctx, { covers: 'more' }),
  sample: () => sampleAds(),
  skeleton(el) { put(el, skeleton('kpi', 3), skeleton('row', 6)); },
  render(el, d, ctx) {
    css();
    if (!document.getElementById('ww-cp-css')) { const st = document.createElement('style'); st.id = 'ww-cp-css'; st.textContent = CSS; document.head.append(st); }
    put(el, ...view(d, ctx));
  },
};
