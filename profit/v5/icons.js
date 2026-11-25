/* Icons as SVG strings. Stroke icons on a 24 box, drawn with currentColor.
   The mark and the six platform glyphs come from the approved Look E theme. */

import { APP_NAME } from './config.js';

const wrap = (d, cls) => `<svg class="lx-ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const p = d => `<path d="${d}"/>`;

/** The mark: the L and the point. Needs the #lx-mark gradient (index.html holds it). */
export function mark(size = 28, { pulse = false, label = APP_NAME } = {}) {
  const ring = pulse ? '<circle class="lx-mark-ring" cx="31.5" cy="17.5" r="5"/>' : '';
  return `<svg class="lx-mark${pulse ? ' lx-spin' : ''}" width="${size}" height="${size}" viewBox="0 0 48 48" role="img" aria-label="${label}"><path d="M13 7V26A10 10 0 0 0 23 36H41" fill="none" stroke="url(#lx-mark) #FF7A1A" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>${ring}<circle class="lx-mark-pt" cx="31.5" cy="17.5" r="5" fill="#16130F"/></svg>`;
}

/* Platform glyphs: ink, never a brand colour. */
export const GLYPH = {
  meta: p('M3.5 12c0-3 1.7-5 3.8-5 3.7 0 5.7 10 9.4 10 2.1 0 3.8-2 3.8-5s-1.7-5-3.8-5c-3.7 0-5.7 10-9.4 10-2.1 0-3.8-2-3.8-5z'),
  google: p('M12 12h8a8 8 0 1 1-2.6-5.9'),
  youtube: '<rect x="3" y="6" width="18" height="12" rx="4"/><path class="f" d="M10.3 9.4v5.2l4.5-2.6z"/>',
  tiktok: p('M13.5 4v10.5a3.5 3.5 0 1 1-3.5-3.5M13.5 4c.4 2.6 2 4.2 4.5 4.5'),
  amazon: p('M3.5 10.5c5 4.6 12 4.6 17 0M17 9.5l3.500 1-1 3.5'),
  email: p('M3 6h18v12H3zM3 7l9 6.5L21 7'),
};
export const PLATFORM_NAME = { meta: 'Meta', google: 'Google', youtube: 'YouTube', tiktok: 'TikTok', amazon: 'Amazon', email: 'Email & SMS' };

const ICON = {
  home: p('M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'),
  month: p('M4 5h16v15H4zM4 10h16M9 3v4M15 3v4'),
  funnel: p('M3 4h18l-7 8v6l-4 2v-8z'),
  customers: '<circle cx="9" cy="8" r="4"/>' + p('M2 21a7 7 0 0 1 14 0M17 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6'),
  sales: p('M4 20V10M10 20V4M16 20v-7M22 20H2'),
  website: '<circle cx="12" cy="12" r="9"/>' + p('M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18'),
  grid: p('M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'),
  review: p('M4 5h16v14H4zM10 9v6l5-3z'),
  bulb: p('M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z'),
  board: p('M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v12h-4z'),
  creators: p('M4 6h11v12H4zM15 10l5-3v10l-5-3z'),
  library: p('M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4'),
  calendar: p('M4 5h16v15H4zM4 10h16'),
  offers: p('M3 12l9-9h8v8l-9 9z') + '<circle cx="16" cy="8" r="1.5"/>',
  star: p('M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.3l6.1-.7z'),
  report: p('M6 3h9l4 4v14H6zM9 12h7M9 16h7'),
  folder: p('M3 6h7l2 2h9v11H3z'),
  chat: p('M4 5h16v11H9l-5 4z'),
  gear: '<circle cx="12" cy="12" r="3"/>' + p('M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1'),
  send: p('M4 12l16-8-6 16-3-6z'),
  link: p('M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1'),
  monitor: p('M4 5h16v11H4zM9 20h6M12 16v4'),
  money: '<circle cx="12" cy="12" r="9"/>' + p('M14.500 9.2c-.5-.8-1.400-1.200-2.500-1.200-1.500 0-2.500.8-2.500 2s1 1.700 2.500 2 2.500.8 2.500 2-1 2-2.500 2c-1.100 0-2-.4-2.500-1.200M12 6.500V8M12 16v1.500'),
  pulse: p('M3 12h4l2.500-6 4 12 2.500-6h5'),
  bolt: p('M13 3L5 13.500h6L10 21l8-10.500h-6z'),
  /* controls */
  eye: p('M2 12s3.600-7 10-7 10 7 10 7-3.600 7-10 7-10-7-10-7z') + '<circle cx="12" cy="12" r="3"/>',
  chevron: p('M6 9l6 6 6-6'),
  sparkle: p('M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800z'),
  bell: p('M6 16V11a6 6 0 0 1 12 0v5l1.500 2h-15zM10 20.500a2.200 2.200 0 0 0 4 0'),
  arrow: p('M5 12h14M13 6l6 6-6 6'),
  swap: p('M4 8h14l-3-3M20 16H6l3 3'),
  signout: p('M10 5H5v14h5M14 8l4 4-4 4M18 12H9'),
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  check: p('M5 12.500l4.500 4.500L19 7.500'),
  close: p('M6 6l12 12M18 6L6 18'),
  day: p('M5 5h14v15H5zM5 10h14M9 14l2 2 4-4'),
  lock: p('M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z'),
  search: '<circle cx="11" cy="11" r="6.5"/>' + p('M16 16l4.500 4.500'),
};

/** A menu or control icon by name, or a platform glyph ('meta', 'google', ...). */
export function icon(name, cls) {
  if (GLYPH[name]) return wrap(GLYPH[name], cls);
  return wrap(ICON[name] || ICON.grid, cls);
}
export const ICON_NAMES = Object.keys(ICON);

/** Google's own four colour G, for the sign in button only. */
export const GOOGLE_G = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.060 5.060 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.09a6.600 6.600 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>';
