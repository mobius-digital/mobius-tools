/* Shared parts for Creators: To review, Videos, People.
   Data: account-health GET /api/trybe?act= (Videos and People: queue, live, creators, account, counts) and
   GET /api/trybe/review?act= (To review: the videos waiting in the creator platform). A client reads /api/trybe only (its brand's Live
   and Creators); the review list and the launch queue are the team's.
   Sales and cost per sale are Triple Whale (last platform click); spend is Meta's. */

import { put } from '../../kit.js';
import { h, button, toast, sheet, addStyles, statusDot, empty } from '../../kit.js';
import { SAMPLE } from '../../data.js';
import { ORG_SHORT } from '../../config.js';
import { picture, day, daysFrom, todayOf, plural } from '../production/_ui.js';

/** /api/trybe for this brand, with "no key" turned into a plain answer instead of an error. */
export async function loadCreators(ctx) {
  try { return await ctx.api('/api/trybe?act=' + encodeURIComponent(ctx.brand.id), { worker: 'ah', signal: ctx.signal }); }
  catch (e) { if (e && e.name === 'AbortError') throw e; if (e && (e.status === 400 || e.status === 404)) return { has_key: false, error: e.message }; throw e; }
}

/** The plain state when the brand has no creator platform key yet, or nothing at all. */
export function notConnected(ctx, data) {
  return empty({
    title: 'Creators are not connected for this brand',
    text: ctx.isClient ? 'Your ' + ORG_SHORT + ' team connects your creator program. Ask them in Requests.'
      : 'Add the brand\'s creator platform key in Brand settings > Integrations, then the videos and the people show here.',
    action: !ctx.isClient && ctx.href ? button('Open Integrations', { href: ctx.href('brand-settings', 'integrations'), icon: 'arrow' }) : null,
  });
}

/** A video tile picture, 9:16, with the play mark. */
export const clip = v => picture({ src: v.thumb, art: v.art, video: v.media !== 'image', ratio: '9/16', alt: v.creator ? 'Video by ' + v.creator : '' });

/** Press play: the creator platform gives a 20 minute link (GET /api/trybe/video, a read). In sample mode there is nothing to play. */
export async function play(ctx, v) {
  if (SAMPLE) { toast('The video plays here with real data.'); return; }
  const box = h('div', { class: 'cr-play' }, h('p', { class: 'cr-quiet' }, 'Getting the video...'));
  const sh = sheet({ title: v.creator + (v.product ? ', ' + v.product : ''), body: box, class: 'cr-sheet' });
  try {
    const r = await ctx.api(`/api/trybe/video?act=${encodeURIComponent(ctx.brand.id)}&sub=${encodeURIComponent(v.sub_id || v.id)}`, { worker: 'ah' });
    const url = r && (r.url || r.video_url || r.src);
    if (!url) throw new Error('The creator platform did not send a link for this video.');
    put(box, r.media === 'image' ? h('img', { src: url, alt: '' }) : h('video', { src: url, controls: true, playsinline: true, autoplay: true, preload: 'metadata' }),
      v.line ? h('p', null, '"' + v.line + '"') : null);
  } catch (e) { put(box, h('p', { class: 'cr-quiet' }, (e && e.message) || 'This video could not play.')); }
  return sh;
}

/** "3 days ago" for a date, from the data's own today. */
export const ago = (d, today) => { const n = daysFrom(String(d || '').slice(0, 10), today); return n == null ? '' : n <= 0 ? 'today' : n === 1 ? 'yesterday' : n + ' days ago'; };

/** Cost per sale beside the account's: green at or under, crimson above, nothing when there are no sales. */
export function cpaDot(cpa, acct) {
  if (cpa == null) return statusDot('off', 'No sales yet');
  if (acct == null) return null;
  return cpa <= acct ? statusDot('good', 'Under the account') : statusDot('bad', 'Over the account');
}

export { todayOf, day, plural };

const CSS = `
.cr-grid{display:grid;grid-template-columns:repeat(var(--cols,6),minmax(0,1fr));gap:18px}
.cr-tile{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;min-width:0;align-content:start}
.cr-tile>button{padding:0;border:0;background:none;cursor:pointer;display:block;width:100%;text-align:left}
.cr-tile .pd-pic{border-radius:14px;box-shadow:0 0 0 1px var(--line)}
.cr-tile b{display:block;font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cr-tile small{display:block;font-size:12.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cr-tile q{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;font-size:12.5px;line-height:1.4;color:var(--ink-2);quotes:none}
.cr-nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding-top:8px;border-top:1px solid var(--line)}
.cr-nums span{display:grid;gap:1px;min-width:0}
.cr-nums em{font-style:normal;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
.cr-nums b{font-size:14px;font-variant-numeric:tabular-nums}
.cr-q .pd-line{padding-left:20px;padding-right:20px}
.cr-mini{display:block;width:34px}
.cr-mini .pd-pic{border-radius:7px}
.cr-mini .pd-play{display:none}
.cr-quiet{color:var(--muted);font-size:13px}
.cr-play{display:grid;gap:12px}
.cr-play video{width:100%;max-height:70vh;border-radius:12px;background:#000}
.cr-who{display:flex;align-items:center;gap:10px;min-width:0}
.cr-who>div{min-width:0}
.cr-who b{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cr-who small{display:block;font-size:12.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:1180px){.cr-grid{--cols:4!important}}
.cr-tag{justify-self:start;max-width:100%;overflow:hidden;text-overflow:ellipsis}
@media (max-width:900px){.cr-grid{--cols:3!important}}
@media (max-width:759px){.cr-grid{--cols:2!important;gap:14px}}
`;
export const crCss = () => addStyles('cr-css', CSS);
