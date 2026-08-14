/**
 * The single source of truth for every brand-specific value in this app.
 *
 * THIS IS THE FILE YOU REPLACE. Nothing else in the codebase contains a colour,
 * a font, a brand name, or a logo path — they all read from here through CSS
 * variables. Change these values, drop in your own `public/logo.svg`, redeploy,
 * and the whole product is yours.
 *
 * Two worked examples ship alongside this file:
 *   brand.config.example-dark.ts   — a near-black palette with a gold accent
 *   brand.config.example-light.ts  — the same brand in a light theme
 *
 * Notes for whoever swaps this:
 *   - `primaryText` sits on top of `primary`, so those two must contrast.
 *   - `scrim` is the wash behind modals. It has to darken the page in both
 *     light and dark themes, so it is not derived from the rest of the palette.
 *   - Lettering uses a derived shade of `primary` pulled towards `text`, so a
 *     bright accent stays readable as body copy. Fills keep the pure colour.
 *   - `font.family` is requested from Google Fonts at runtime, so any family
 *     available there works with no code change.
 */
export const brand = {
  name: "Your Brand",
  logoUrl: "/logo.svg",
  colors: {
    background: "#F7F7F8", // page
    surface: "#FFFFFF", // cards and panels
    primary: "#2563EB", // accent — replace with your own
    primaryText: "#FFFFFF", // sits on the accent
    text: "#18181B",
    textMuted: "#6B7280",
    danger: "#B91C1C",
    tentative: "#8B8B93",
    scrim: "#18181B",
  },
  font: {
    family: "Inter", // any Google Fonts family
    headingWeight: 700,
    bodyWeight: 400,
  },
};

export type Brand = typeof brand;
