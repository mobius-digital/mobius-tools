/* Ads > TikTok > Changes. Who changed what on TikTok and why. No route carries TikTok changes yet
   (the change list holds Meta and Google), so real mode shows the plain state. */

import { put } from '../../kit.js';
import { h, card, table, empty, button } from '../../kit.js';
import { TT_TITLES, styles, loadTikTok, sampleTikTok, gate, ttHead } from './_tt.js';
import { dayCards, changesCss } from '../platforms/changes.js';

export function view(d, ctx) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  const rows = d.changes;
  changesCss();
  const head = ttHead(d, ctx, 'Who changed what on TikTok, and why, newest first. Tap a change for the whole of it.', [{ title: 'What is listed', text: 'Changes made in TikTok through the app. Changes made inside TikTok Ads Manager do not come through this connection yet.' }]);
  if (!rows || !rows.length) {
    return [empty({ title: 'No TikTok changes on record', text: 'Changes made in TikTok Ads Manager do not come through this connection yet. Changes on Meta and Google are under All platforms.',
      action: button('Open all changes', { href: ctx.href('platforms', 'changes'), icon: 'arrow' }) })].filter(Boolean);
  }
  const as = (r, i) => ({ id: 'tt' + i, at: r.at || r.date, platform: 'tiktok', cat: r.cat || 'other', what: r.what, name: r.name || '', level: r.level || '', who: r.who, via: r.via || '', why: r.why || '' });
  return [head, ...dayCards(rows.map(as), { client_view: !!ctx.isClient }, ctx, () => {})].filter(Boolean);
}

export default {
  title: TT_TITLES.changes,
  eyebrow: 'TikTok',
  load: loadTikTok,
  sample: sampleTikTok,
  render(el, d, ctx) { styles(); put(el, ...view(d, ctx)); },
};
