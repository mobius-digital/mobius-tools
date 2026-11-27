/* Agency > Creators > To review. "Which creator videos need a yes, on any brand?"
   Every creator video waiting in the creator platform, grouped by brand, oldest first. The brand whose video has
   waited longest sits on top. A video opens a sheet: watch it, read what the creator says. Approve and Skip are
   switched off here (approving pays the creator and tells them), so the yes is given in old Locus.
   Data: GET /api/trybe/review?act=<brand id> on the account-health worker, once per brand with a creator program
   (there is no all-brands review route yet). The route answers 400 for a brand with no creator platform key, so the
   page first reads which brands have one (GET /api/trybe?act=all, keyedBrands in creators/_cr.js) and asks only
   those. A 400 that still comes back means "no creator program": the brand is left out, never shown as 0.
   The video file: GET /api/trybe/video?act=&sub= (a read; the link lasts 20 minutes, so it is asked for on play).
   Falling behind (2026-11-26, a45): GET /api/trybe/asks, this morning's asks the creator post made (_asks.js). */

import { h, kpi, tiles, em, button, statusDot, empty, skeleton, sheet, addStyles } from '../../kit.js';
import { SAMPLE } from '../../data.js';
import { legacyUrl, APP_NAME } from '../../config.js';
import { put, css, plural, day, pageTop, oldLocus } from '../production/_ui.js';
import { crCss, clip, keyedBrands } from '../creators/_cr.js';
import { asksSection } from './_asks.js';

/* ---------- shared with By brand ---------- */
/** The brands worth asking: live ones only. */
export const liveBrands = ctx => (ctx.brands || []).filter(b => !b.status || b.status === 'active');

/** One read per brand, all at once. Each answer is { act_id, data } or { act_id, none: true } (no creator platform
    key, or no access) or { act_id, failed: 'why' }. One brand failing never fails the page.
    `only` is a Set of brand ids to ask (the ones with a creator program); the others are not called at all. */
export async function perBrand(ctx, path, only = null) {
  const brands = liveBrands(ctx).filter(b => !only || only.has(b.id));
  return Promise.all(brands.map(async b => {
    try { return { act_id: b.id, data: await ctx.api(path + encodeURIComponent(b.id), { worker: 'ah', signal: ctx.signal }) }; }
    catch (e) {
      if (e && e.name === 'AbortError') throw e;
      if (e && (e.status === 400 || e.status === 403 || e.status === 404)) return { act_id: b.id, none: true };
      return { act_id: b.id, failed: (e && e.message) || 'no answer' };
    }
  }));
}

export const brandOf = (ctx, actId) => (ctx.brands || []).find(b => b.id === actId) || null;
/** The brand's color dot and name. */
export function brandName(ctx, actId, name) {
  const b = brandOf(ctx, actId);
  return h('span', { class: 'ac-brand' }, h('i', { style: { background: (b && b.color) || 'var(--slate)' } }), (b && b.name) || name || 'Brand');
}
/** A page in the brand's own Creators line. */
export function brandPage(ctx, actId, tab) {
  const b = brandOf(ctx, actId);
  return b ? '#/brand/' + encodeURIComponent(b.slug) + '/creators/' + tab : null;
}
/** The brand's creator page in old Locus (team only). */
export const oldCreators = actId => legacyUrl('trybe', actId);
export const todayStr = () => new Date().toLocaleDateString('en-CA');
/** "Could not read: A, B." under a page, when a brand did not answer. */
export function notRead(ctx, failed) {
  return failed && failed.length ? h('p', { class: 'cr-quiet ac-miss' }, statusDot('warn', 'Could not read ' + failed.map(f => (brandOf(ctx, f.act_id) || {}).name || f.name || 'a brand').join(', ') + '. Its videos are not counted here.')) : null;
}

const AC_CSS = `
.ac-brand{display:inline-flex;align-items:center;gap:8px;min-width:0;font-weight:600}
.ac-brand i{width:9px;height:9px;border-radius:3px;flex:none}
.ac-group{display:grid;gap:16px;min-width:0}
.ac-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding-top:18px;border-top:1px solid var(--line)}
.ac-group:first-of-type .ac-head{border-top:0;padding-top:0}
.ac-head h2{font-size:var(--fs-section,17px);font-weight:600;letter-spacing:-.015em;display:flex;align-items:center;gap:10px;min-width:0}
.ac-head h2 i{width:11px;height:11px;border-radius:4px;flex:none}
.ac-head>span{font-size:13px;color:var(--muted)}
.ac-sheet .cr-play{display:grid;gap:12px}
.ac-sheet .cr-play .pd-pic{max-width:260px;justify-self:center;border-radius:14px}
.ac-sheet .cr-play img{width:100%;border-radius:12px}
.ac-facts{display:grid;gap:8px;font-size:13.5px}
.ac-facts div{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px}
.ac-facts dt{color:var(--muted)}
.ac-facts dd{margin:0;min-width:0;overflow-wrap:anywhere}
.ac-said{font-size:14px;line-height:1.5;color:var(--ink-2);quotes:none;display:block}
.ac-off{display:grid;gap:10px;padding-top:14px;border-top:1px solid var(--line)}
.ac-off p{font-size:12.5px;color:var(--muted);line-height:1.45}
.ac-miss{margin-top:-4px}
@media (max-width:759px){
  .ac-head{gap:6px 10px}
  .ac-head .lx-sp{display:none}
  .ac-facts div{grid-template-columns:84px minmax(0,1fr)}
}
`;
export const acCss = () => addStyles('ac-css', AC_CSS);

/* ---------- this page ---------- */
const at = d => new Date(String(d).slice(0, 10) + 'T12:00:00');
/** Whole days a video has waited, or null when it carries no date. */
const ageOf = (it, today) => { const d = String(it.created_at || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? Math.max(0, Math.round((at(today) - at(d)) / 864e5)) : null; };
const agoText = n => (n == null ? '' : n === 0 ? 'today' : n === 1 ? 'yesterday' : n + ' days ago');
const byOldest = (a, b) => String(a.created_at || '9').localeCompare(String(b.created_at || '9'));

/** The sheet for one video: watch it, read it. Approve and Skip are switched off. */
function openVideo(ctx, group, it, today) {
  const box = h('div', { class: 'cr-play' });
  const age = ageOf(it, today);
  const old = ctx.isClient ? null : oldCreators(group.act_id);
  const body = h('div', { class: 'ac-group' },
    box,
    h('dl', { class: 'ac-facts' },
      h('div', null, h('dt', null, 'Brand'), h('dd', null, brandName(ctx, group.act_id, group.name))),
      it.product ? h('div', null, h('dt', null, 'Product'), h('dd', null, it.product)) : null,
      it.program ? h('div', null, h('dt', null, 'Program'), h('dd', null, it.program)) : null,
      it.angle ? h('div', null, h('dt', null, 'Angle'), h('dd', null, it.angle)) : null,
      it.created_at ? h('div', null, h('dt', null, 'Sent'), h('dd', null, day(it.created_at) + (age != null ? ', ' + agoText(age) : ''))) : null),
    it.line ? h('q', { class: 'ac-said' }, '"' + it.line + '"') : null,
    h('div', { class: 'ac-off' },
      old ? h('div', { class: 'lx-row' }, oldLocus(ctx, { label: 'Approve in old ' + APP_NAME, href: old, primary: true })) : null,
      h('p', null, 'Approving pays the creator and tells them, so the yes is given in old ' + APP_NAME + ' or the creator platform.')));
  const sh = sheet({ title: it.creator || 'Creator', body, class: 'cr-sheet ac-sheet' });
  window.addEventListener('hashchange', () => sh.close(), { once: true });   // leaving the page closes the sheet
  if (SAMPLE) { put(box, clip(it), h('p', { class: 'cr-quiet' }, 'Sample numbers: the video itself plays here with real data.')); return; }
  put(box, h('p', { class: 'cr-quiet' }, 'Getting the video...'));
  ctx.api(`/api/trybe/video?act=${encodeURIComponent(group.act_id)}&sub=${encodeURIComponent(it.sub_id || it.id)}`, { worker: 'ah' }).then(r => {
    const url = r && (r.url || r.video_url || r.src);
    if (!url) throw new Error('The creator platform did not send a link for this video.');
    put(box, (r.media || it.media) === 'image' ? h('img', { src: url, alt: '' }) : h('video', { src: url, controls: true, playsinline: true, autoplay: true, preload: 'metadata' }));
  }).catch(e => put(box, clip(it), h('p', { class: 'cr-quiet' }, (e && e.message) || 'This video could not play.')));
}

export default {
  title: ['Which creator videos ', em('need a yes?')],
  eyebrow: 'Creators, all brands',
  ranges: false,                     // what is waiting now, not a span of days

  async load(ctx) {
    const [got, asks] = await Promise.all([perBrand(ctx, '/api/trybe/review?act=', await keyedBrands(ctx)),
      /* Falling behind (a45): this morning's asks; a page without it still draws */
      SAMPLE ? Promise.resolve(null) : ctx.api('/api/trybe/asks', { worker: 'ah', signal: ctx.signal }).catch(() => null)]);
    const out = { today: todayStr(), brands: [], connected: 0, failed: [], asks };
    for (const g of got) {
      if (g.failed) { out.failed.push({ act_id: g.act_id, why: g.failed }); continue; }
      if (g.none || !g.data) continue;
      out.connected++;
      const items = (g.data.items || []).map(x => ({ id: x.id, creator: x.creator, product: x.product, program: x.program, angle: x.angle, media: x.media, thumb: x.thumb, line: x.line, created_at: x.created_at }));
      if (items.length) out.brands.push({ act_id: g.act_id, items });
    }
    if (!out.connected && out.failed.length) throw new Error('The creator platform did not answer for any brand. ' + out.failed[0].why);
    return out;
  },
  skeleton(el) { put(el, skeleton('kpi', 3), skeleton('chart')); },

  render(el, data, ctx) {
    css(); crCss(); acCss();
    const today = (data && data.today) || todayStr();
    const groups = ((data && data.brands) || []).map(g => {
      const items = (g.items || []).slice().sort(byOldest);
      const ages = items.map(i => ageOf(i, today)).filter(n => n != null);
      return { ...g, items, oldest: ages.length ? Math.max(...ages) : null };
    }).filter(g => g.items.length).sort((a, b) => (b.oldest ?? -1) - (a.oldest ?? -1) || b.items.length - a.items.length);
    const failed = (data && data.failed) || [];
    const behind = asksSection(data && data.asks, (act, name) => brandName(ctx, act, name));

    if (!groups.length) {
      put(el, behind,
        data && data.connected === 0 && !failed.length
          ? empty({ title: 'No brand has creators connected', text: 'Add a brand\'s creator platform key in its Brand settings > Integrations. Then every video waiting for a yes shows here.' })
          : empty({ title: 'Nothing waiting for a yes', text: 'When a creator sends a video for any brand, it shows here.' }),
        notRead(ctx, failed));
      return;
    }

    const all = groups.flatMap(g => g.items);
    const people = new Set(groups.flatMap(g => g.items.map(i => g.act_id + '|' + i.creator))).size;
    const worst = groups[0];
    const late = groups.filter(g => g.oldest != null && g.oldest >= 3);
    const tilesRow = tiles([
          kpi({ label: 'Waiting for a yes', value: String(all.length), sub: plural(people, 'creator') + ', ' + plural(groups.length, 'brand'), window: 'Now', source: 'Creator platform' }),
          kpi({ label: 'Oldest', value: worst.oldest != null ? plural(worst.oldest, 'day') : 'no date',
            sub: worst.oldest == null ? null : worst.oldest >= 3 ? statusDot('bad', ((brandOf(ctx, worst.act_id) || {}).name || worst.name || 'A brand') + ', over the 3 day line') : statusDot('good', 'Inside the 3 day line'), window: 'Now', source: 'Creator platform' }),
          kpi({ label: 'Brands waiting 3 days or more', value: String(late.length), sub: late.length ? statusDot('bad', 'Review these first') : statusDot('good', 'None'), window: 'Now', source: 'Creator platform' }),
        ], { cols: 3 });
    put(el,
      pageTop([
        { title: 'What it is for', text: 'Every creator video waiting for a yes on any brand, grouped by brand, the longest wait on top and oldest first inside a brand. A wait of 3 days or more is over the line.' },
        { title: 'Why approving is not here', text: 'Approving pays the creator and tells them, so it is done in old ' + APP_NAME + ' or the creator platform. Tap a video to watch it; the sheet has the button. A brand with no creator platform connected is not listed.' },
      ]),
      tilesRow,
      behind,
      groups.map(g => {
        const b = brandOf(ctx, g.act_id), to = brandPage(ctx, g.act_id, 'to-review');
        return h('section', { class: 'ac-group' },
          h('div', { class: 'ac-head' },
            h('h2', null, h('i', { style: { background: (b && b.color) || 'var(--slate)' } }), (b && b.name) || g.name || 'Brand'),
            h('span', null, plural(g.items.length, 'video') + ' waiting' + (g.oldest != null ? ', oldest ' + agoText(g.oldest) : '')),
            g.oldest != null && g.oldest >= 3 ? statusDot('bad', '3 days or more') : null,
            h('span', { class: 'lx-sp' }),
            to ? button('Open the brand', { href: to, icon: 'arrow', ghost: true }) : null),
          h('div', { class: 'cr-grid' }, g.items.map(it => h('article', { class: 'cr-tile' },
            h('button', { type: 'button', 'aria-label': 'Open the video by ' + (it.creator || 'a creator'), onclick: () => openVideo(ctx, g, it, today) }, clip(it, agoText(ageOf(it, today)))),
            h('div', null, h('b', null, it.creator || 'Creator'), it.product ? h('small', null, it.product) : null),
            it.angle ? h('span', { class: 'lx-chip cr-tag' }, 'Angle: ' + it.angle) : null,
            it.line ? h('q', null, it.line) : null))));
      }),
      notRead(ctx, failed));
  },
};
