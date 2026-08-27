/**
 * The icons a phone or tablet uses once the board is on its home screen.
 *
 * These are PNGs in `public/icons/`, generated from `public/logo.svg` and the
 * brand colors by `npm run icons` (see scripts/make-icons.mjs). They have to be
 * PNG: iOS will not take an SVG for a home-screen icon, and it cannot tint one
 * the way the in-app logo is tinted, so the accent is baked in at build time.
 *
 * Listed here once so the manifest, the <head> tags and the generator script
 * all agree on the file names.
 */
export const HOME_SCREEN_ICONS = [
  { src: "/icons/icon-180.png", size: 180, purpose: "any" as const },
  { src: "/icons/icon-192.png", size: 192, purpose: "any" as const },
  { src: "/icons/icon-512.png", size: 512, purpose: "any" as const },
  { src: "/icons/icon-maskable-512.png", size: 512, purpose: "maskable" as const },
];

/** The one iOS reads for apple-touch-icon. */
export const APPLE_TOUCH_ICON = HOME_SCREEN_ICONS[0].src;
