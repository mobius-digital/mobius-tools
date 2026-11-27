/* What works > Copy. "Which words earn the click, and do those clicks buy?"
   Live data: GET /api/hub/creative (profit worker) for clicks and Triple Whale sales per Meta ad, and GET /api/ad-creatives
   (account-health) for each ad's primary text and headline (the top 80 ads by spend). Ads with the same words are one row.
   Copy themes and the words inside the image are AI reads: hidden behind "Tags are being re-checked". */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, card, kpi, takeaway, segmented, em, money, num, x, skeleton, empty, platformChip, sourceLine } from '../../kit.js';
import { css, gate, noAds, loadAds, sampleAds, art, meter, roll, findingButton, thin, thinWords, p1, dl, helpBar, winOf, tileRow, adThumb } from './_ww.js';

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
      h('div', null, h('h4', null, 'Same picture, two texts'),
        h('div', { class: 'ab' },
          h('div', null, h('small', null, `Text A: ${p1(a.ctr)} click rate, on ${num(a.list.length)} ads`), q(a.text)),
          h('div', null, h('small', null, `Text B: ${p1(b.ctr)} click rate, on ${num(b.list.length)} ads`), q(b.text))),
        h('p', { class: 'ww-cp-n' }, 'They ran on different pictures, so the gap is not proven yet.')),
      h('div', { class: 'need' }, h('h4', null, 'How much each text needs'),
        need ? [h('small', null, `Impressions each text needs for this pair (${p1(a.ctr)} against ${p1(b.ctr)})`), h('b', null, num(need))] : null,
        small ? [h('small', null, 'Impressions each, if the gap is small (1.2% against 1.5%)'), h('b', null, num(small))] : null,
        h('small', null, 'Orders each, to judge on sales'), h('b', null, '100'))),
    h('details', { class: 'ww-how' }, h('summary', null, 'How to set it up in Meta'),
      h('ol', null, h('li', null, 'Copy the ad into the same ad set: same picture, page and days.'), h('li', null, 'Meta A/B test: change the primary text only, even split.'), h('li', null, 'Run 7 days, no early stop. Click rate picks the winner, then check cost per sale.'))),
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
    long ? h('a', { href: '#', style: { marginLeft: '6px', fontSize: '12.5px', fontWeight: 500 }, onclick: e => { e.preventDefault(); open ? ST.open.delete(r.text) : ST.open.add(r.text); e.target.closest('.ww-cp').replaceWith(row(r, i, d, ctx, maxCtr)); } }, open ? 'Show less' : 'Show all') : null);
  return h('div', { class: 'ww-cp' },
    h('span', { class: 'i' }, String(i + 1)),
    h('div', { class: 'tx' }, text,
      h('div', { class: 'ww-thumbs', style: { marginTop: '10px' } }, r.top.slice(0, 4).map(a => adThumb(ctx, d, a, null))),
      h('small', null, `Used in ${num(r.list.length)} ${r.list.length === 1 ? 'ad' : 'ads'}`)),
    h('div', { class: 'n c1' }, h('span', { class: 'k' }, 'Click rate'), h('b', null, p1(r.ctr)), meter(r.ctr, null, { max: maxCtr })),
    h('div', { class: 'n' }, h('span', { class: 'k' }, 'ROAS'), h('b', { class: !sales || dim ? 'dim' : '' }, sales ? x(r.roas) : 'no data'), sales ? meter(r.roas, d.goal_roas, { max: Math.max(d.goal_roas || 0, r.roas || 0) * 1.2 || 1, dim, goalTitle: d.goal_roas ? 'Goal ' + x(d.goal_roas) : null }) : null,
      sales ? h('small', null, dim ? thinWords(r.orders) : `Based on ${num(r.orders)} orders`) : null),
    h('div', { class: 'n s' }, h('span', { class: 'k' }, 'Spend'), h('b', null, money(Math.round(r.spend || 0)))),
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
    ctx.askWindow = winOf(ctx) || null;
    ctx.askContext = `What works, Copy, ${winOf(ctx) || 'these dates'}: ${num(rows.length)} ${word}s across ${num(all.ads)} Meta ads. Normal click rate ${p1(all.ctr)}`
      + (best ? `, best ${p1(best.ctr)} on "${best.text.slice(0, 80)}"` : '') + '. Clicks are Meta; ROAS is Triple Whale, last click.';
    put(body, ...[
      tileRow([
        kpi({ label: ST.field === 'body' ? 'Primary texts used' : 'Headlines used', value: num(rows.length), sub: `Across ${num(all.ads)} ads`, window: winOf(ctx), source: 'Meta' }),
        kpi({ label: dl('Normal click rate', 'click_rate'), value: p1(all.ctr), sub: 'Every ad with words read', window: winOf(ctx), source: 'Meta' }),
        kpi({ label: dl('Best click rate', 'click_rate'), value: best ? p1(best.ctr) : h('small', null, 'No data'), sub: best ? h('span', { class: 'ww-ell', title: best.text }, '"' + best.text + '"') : null, window: winOf(ctx), source: 'Meta' }),
      ], 3),
      best && d.has_sales && !thin(best.orders) ? takeaway(['Those clicks buy too: the best ', word, ' returns ', h('b', null, x(best.roas)), '.']) : null,
      card({ class: 'ww-cd', title: `Every ${word}, most spend first`, note: sourceLine(winOf(ctx), 'clicks Meta, ROAS Triple Whale, last click'), flush: true },
        h('div', { class: 'ww-cp ww-cp-h' }, h('span', { class: 'i' }, '#'), h('span', null, ST.field === 'body' ? 'Primary text' : 'Headline'), h('span', { class: 'c1' }, dl('Click rate', 'click_rate')), h('span', null, dl('ROAS', 'roas')), h('span', { class: 's' }, 'Spend'), h('span')),
        h('div', { class: 'ww-cps' }, rows.slice(0, 20).map((r, i) => row(r, i, d, ctx, maxCtr)))),
      testCard(rows, d, ctx)].filter(Boolean));
  };
  paint();
  return [
    helpBar([{ title: 'What it is for', text: 'Which words on the Meta ads earn the click, and whether those clicks buy. Ads with the same words are one row. Read it as hints to test: the picture matters more than the words.' },
      { title: 'The figures', text: 'Click rate: link clicks out of impressions. ROAS is gray under 30 orders: a hint, not a result. The tick on the ROAS bar is the brand\'s goal.' + (d.source === 'live' && d.covered ? ` Words are read for the top ${num(d.covered)} ads by spend.` : '') + ' Copy themes and the words inside the picture come back once those tags are checked.' }], {},
      platformChip('meta'), h('span', { class: 'note' }, 'Meta ads, the dates at the top')),
    h('div', { class: 'ww-bar' }, segmented([{ id: 'body', label: 'Primary text' }, { id: 'headline', label: 'Headline' }], ST.field, id => { ST.field = id; paint(); }),
      h('span', { class: 'note' }, ST.field === 'body' ? 'The text above the picture.' : 'The line under the picture.')),
    body,
  ];
}

const CSS = `.ww-cps{display:grid}
.ww-cp{display:grid;grid-template-columns:28px minmax(0,1fr) 150px 170px 90px 112px;gap:18px;align-items:start;padding:18px 28px;border-top:1px solid var(--line)}
.ww-cp:first-child{border-top:0}
.ww-cp .i{font-size:13px;color:var(--faint);padding-top:2px;font-variant-numeric:tabular-nums}
.ww-cp .tx small{display:block;margin-top:6px;font-size:12px;color:var(--muted)}
.ww-cp .n{display:grid;gap:5px;min-width:0;align-content:start}
.ww-cp .n .k{display:none;font-size:var(--fs-colhead,11.5px);font-weight:500;color:var(--muted)}
.ww-cp .s{text-align:right}
.ww-cp .b{justify-self:end}
.ww-ell{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.ww-cp .ww-thumbs>*{width:48px}
.ww-cp-h{padding-top:10px;padding-bottom:10px;font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted);align-items:end}
.ww-cps .ww-cp:first-child{border-top:1px solid var(--line)}
.ww-cp-n{margin-top:10px;font-size:12.5px;color:var(--muted)}
.ww-how{margin-top:14px;font-size:13px;color:var(--ink-2)}.ww-how summary{cursor:pointer;font-weight:600}.ww-how ol{margin:8px 0 0;padding-left:18px;display:grid;gap:6px}
.ww-test .need small{margin-bottom:2px!important}.ww-test .need b{margin-bottom:10px}
.ww-cp .n b{font-size:var(--num-s);font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.ww-cp .n b.dim{color:var(--faint);font-weight:500}
.ww-cp .n small{font-size:12px;color:var(--muted)}
@media (max-width:1040px){.ww-cp-h{display:none}.ww-cps .ww-cp:first-child{border-top:0}
  .ww-cp{grid-template-columns:22px repeat(3,minmax(0,1fr));gap:12px 16px;padding:16px 20px}.ww-cp .tx{grid-column:2/-1}
  .ww-cp .c1{grid-column:2}.ww-cp .n .k{display:block}.ww-cp .s{text-align:left}.ww-cp .b{grid-column:2/-1;justify-self:start}}
@media (max-width:759px){.ww-cp{padding:16px 18px;gap:12px}.ww-cp .b{justify-self:stretch}.ww-cp .b .lx-btn{width:100%}}`;

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
