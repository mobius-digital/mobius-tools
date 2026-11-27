/* What works > Competitors. "What are the brands we watch running?" No results: what is live, since when, how many
   versions, and what launched together.
   Live data: GET /api/brand?act= (profit worker) for who we watch (the brand's competitor list).
   Not built yet: a feed of their ads (Meta Ad Library or Atria, on a schedule). Until then the ads, the weekly read and
   "launched together" render from the example below, behind "Example until its data feed is built". */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, card, kpi, segmented, pill, em, num, skeleton, empty, platformChip } from '../../kit.js';
import { css, gate, loadBrand, art, findingButton, exampleChip, dl, helpBar, tileRow, secHead } from './_ww.js';
import { fixture } from '../../data.js';

const ST = { brand: 'all' };
const day = d => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
/** A web address as a person typed it ("northlake.example", "www.northlake.example/shop", with or without https://)
    as { href, host }, or null when it is not an address. The brand's list is typed by hand, so never trust it. */
export function site(u) {
  const t = String(u == null ? '' : u).trim();
  if (!t || /\s/.test(t)) return null;
  try {
    const full = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : 'https://' + t.replace(/^\/+/, ''));
    if (!/^https?:$/.test(full.protocol) || full.username || full.password || !/\.[a-z]{2,}$/i.test(full.hostname)) return null;
    return { href: full.href, host: full.hostname.replace(/^www\./, '') };
  } catch { return null; }
}

async function load(ctx) {
  if (!ctx.brand) return { state: 'none' };
  const [b, ex] = await Promise.all([loadBrand(ctx), fixture('what-works/_sample/competitors.json')]);
  const watch = ((b && Array.isArray(b.comps) && b.comps) || []).filter(c => c && (c.name || c.url)).map(c => ({ name: c.name || (site(c.url) || {}).host || 'Competitor', url: c.url || null, note: (c.data || {}).why || (c.data || {}).note || (c.data || {}).summary || null }));
  /* the feed has no route yet: its parts come from the example, and the page says so */
  return { state: 'ok', source: 'live', watch, watch_live: true, example: true, reads: ex.reads, ads: ex.ads, batches: ex.batches, example_watch: ex.watch };
}

function adCard(a, ctx) {
  return h('article', { class: 'ww-c ww-cmpc' },
    art(a, { kind: a.kind === 'video' ? 'Video' : 'Still' }),
    h('div', null, h('div', { class: 'nm' }, h('span', null, a.name)), h('div', { class: 'sub' }, a.brand)),
    a.first_line ? h('div', { class: 'ww-txt' }, '"' + a.first_line + '"', h('small', null, 'First line said')) : a.headline ? h('div', { class: 'ww-txt' }, a.headline, h('small', null, 'Headline')) : null,
    h('div', { class: 'ww-st' },
      h('div', null, h('span', null, a.live ? 'Running' : 'Ran'), h('b', null, num(a.days) + ' days'), h('small', null, 'since it first went live')),
      h('div', null, h('span', null, 'Versions'), h('b', null, num(a.versions || 1)), h('small', null, 'live in their account'))),
    h('div', { class: 'ww-ft' }, 'Since ' + day(a.started), a.live ? h('span', { class: 'lx-stat good' }, 'Live') : h('span', { class: 'lx-stat off' }, 'Stopped')),
    findingButton(ctx, () => ({ say: [h('b', null, a.brand), ` has run "${a.name}" for ${num(a.days)} days. Long running is a sign it pays them, not proof.`], measure: 'days running',
      proof: [{ value: a.days, text: num(a.days) + ' days', name: a.name.slice(0, 16), sub: a.brand }],
      brief: { title: 'Steal the shape: ' + a.name, make: 'Two ads in our own words on the same shape', why: 'Steal the shape, not the brand.', hook: a.first_line ? '"' + a.first_line + '"' : null, count: 2 } }), 'Brief this'));
}

function view(d, ctx) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  const ex = () => (d.example && !ctx.sample ? exampleChip() : null);
  const watch = d.watch && d.watch.length ? d.watch : [];
  const brands = [...new Set((d.ads || []).map(a => a.brand))];
  const pick = list => list.filter(a => ST.brand === 'all' || a.brand === ST.brand);
  const ads = d.ads || [];
  const fresh = ads.filter(a => a.days <= 7), still = ads.filter(a => a.live && a.days > 7).sort((a, b) => b.days - a.days);
  const body = h('div', { class: 'ww-stack' });
  const paint = () => put(body, 
    card({ class: 'ww-cd', title: APP_NAME + ' AI read this week', note: 'One read per brand, with the ads as proof', action: ex() },
      h('div', { class: 'ww-find', style: { marginTop: '16px' } }, (d.reads || []).filter(r => ST.brand === 'all' || r.brand === ST.brand).map(r => h('div', { class: 'ww-f' },
        h('span', { class: 'lx-cap' }, r.brand), h('p', { class: 'say' }, r.text),
        h('div', { class: 'ww-thumbs' }, (r.proof || []).map(id => ads.find(a => a.id === id)).filter(Boolean).map(a => h('div', null, art(a), h('small', null, a.name)))))))),
    secHead('Still running, longest first', 'The shelf worth studying · Meta Ad Library', ex()),
    pick(still).length ? h('div', { class: 'ww-grid ww-cmpg' }, pick(still).slice(0, 10).map(a => adCard(a, ctx))) : empty({ title: 'Nothing live from this brand' }),
    secHead('New this week', 'Launched in the last 7 days · Meta Ad Library', ex()),
    pick(fresh).length ? h('div', { class: 'ww-grid ww-cmpg' }, pick(fresh).map(a => adCard(a, ctx))) : empty({ title: 'Nothing new this week' }),
    card({ class: 'ww-cd', title: 'Launched together', note: 'Ads that started the same day are their test. What is still live a month later is what won.', action: ex() },
      h('div', { class: 'ww-rows', style: { marginTop: '8px' } }, (d.batches || []).filter(b => ST.brand === 'all' || b.brand === ST.brand).map(b => {
        const list = ads.filter(a => a.batch === b.id), live = list.filter(a => a.live);
        return h('div', { class: 'ww-l' },
          h('div', null, h('div', { class: 'ww-txt' }, `${b.brand}, ${day(b.date)}`, h('small', null, `${num(list.length)} ads launched, ${num(live.length)} still live`)),
            h('p', { class: 'ww-an-note', style: { margin: '6px 0 10px', fontSize: '13px', color: 'var(--ink-2)' } }, b.note),
            h('div', { class: 'ww-thumbs' }, list.map(a => h('div', { style: { opacity: a.live ? 1 : 0.45 } }, art(a), h('small', null, a.live ? 'live' : 'stopped'))))),
          h('div', { class: 'side' }, pill(live.length ? 'good' : '', live.length ? num(live.length) + ' live' : 'All stopped')));
      }))));
  paint();
  ctx.askWindow = 'Now';
  ctx.askContext = `What works, Competitors: we watch ${num(watch.length)} brands. From the Meta Ad Library${d.example && !ctx.sample ? ' (an example until the feed is built)' : ''}: ${num(fresh.length)} new ads in the last 7 days, ${num(still.filter(a => a.days >= 60).length)} running 60 days or more. Their spend and results are not public.`;
  return [
    helpBar([{ title: 'What it is for', text: 'What the brands we watch are running on Meta: what is live, since when, how many versions, and what launched together.' },
      { title: 'What is knowable', text: 'What a competitor runs, since when and how many versions is public. Their spend and results are not, so nothing here is called a winner. Long running is a sign an ad pays them, not proof.' }],
      { src: 'Ads from the Meta Ad Library. Days running count from the date an ad first went live. The list of brands we watch is the brand\'s own research list.' },
      platformChip('meta', { label: 'Meta Ad Library' })),
    tileRow([
      kpi({ label: 'Brands we watch', value: num(watch.length), sub: d.watch_live ? 'From the brand\'s research list' : null, window: 'Now', source: 'Brand research' }),
      kpi({ label: 'New ads this week', value: num(fresh.length), sub: ex() || 'Launched in the last 7 days', window: 'Last 7 days', source: 'Meta Ad Library' }),
      kpi({ label: 'Running 60+ days', value: num(still.filter(a => a.days >= 60).length), sub: ex() || 'A sign they pay, not proof', window: 'Now', source: 'Meta Ad Library' }),
    ], 3),
    card({ class: 'ww-cd', title: 'Who we watch', note: watch.length ? null : 'No competitors are listed for this brand yet.' },
      watch.length ? h('div', { class: 'ww-watch', style: { marginTop: '14px' } }, watch.map(w => { const s = site(w.url); return h('div', null, h('b', null, w.name), w.note ? h('small', null, w.note) : null,
        s ? h('a', { href: s.href, target: '_blank', rel: 'noopener', style: { fontSize: '12px', fontWeight: 500 } }, s.host) : null); }))
        : h('p', { class: 'ww-an-note', style: { marginTop: '10px', fontSize: '13px', color: 'var(--muted)' } }, ctx.isClient ? 'Your team adds the brands to watch.' : 'Add them on the brand\'s research page in old ' + APP_NAME + '.')),
    brands.length > 1 ? h('div', { class: 'ww-bar' }, segmented([{ id: 'all', label: 'All brands' }, ...brands.map(b => ({ id: b, label: b }))], ST.brand, id => { ST.brand = id; paint(); })) : null,
    body,
  ].filter(Boolean);
}

export default {
  title: ['What are competitors ', em('running?')],
  eyebrow: 'What works',
  ranges: false,
  load,
  skeleton(el) { put(el, skeleton('kpi', 3), skeleton('row', 6)); },
  render(el, d, ctx) {
    css();
    if (!document.getElementById('ww-cmp-css')) { const st = document.createElement('style'); st.id = 'ww-cmp-css'; st.textContent = '.ww-cmpg{grid-template-columns:repeat(3,minmax(0,1fr))}.ww-cmpc .ww-ft{margin-left:16px;margin-right:16px}@media (max-width:1040px){.ww-cmpg{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:759px){.ww-cmpg{grid-template-columns:minmax(0,1fr)}}'; document.head.append(st); }
    put(el, ...view(d, ctx));
  },
};
