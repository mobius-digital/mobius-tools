/**
 * The single source of truth for every brand-specific value in this app.
 *
 * THIS IS THE FILE YOU REPLACE. Nothing else in the codebase contains a color,
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
 *     bright accent stays readable as body copy. Fills keep the pure color.
 *   - `font.family` is requested from Google Fonts at runtime, so any family
 *     available there works with no code change.
 */
/*
 * The DEFAULT palette, which is Mobius's own.
 *
 * This is deliberately NOT the client-facing look: a brand's colours come from
 * its `brands` row at request time, so every client page still paints itself.
 * What this file dresses is the handful of surfaces the hub owns rather than
 * rents - the front door, the agency admin screen and the offline page - and
 * those were sitting on a stock #2563EB blue and Inter while every other
 * Mobius tool moved to the shared system. Matched to /mobius.css by hand
 * because this app cannot link it: no literal colour may enter globals.css,
 * which is what makes the white-labelling work.
 */
export const brand = {
  name: "Mobius Digital",
  logoUrl: "/logo.svg",
  /**
   * true  — a single-color SVG mark, painted in your accent color (works on
   *         light and dark themes from one file). This is the default.
   * false — a full-color logo or PNG, shown exactly as drawn.
   */
  logoTint: true,
  colors: {
    background: "#EFF4F7", // page — matches --bg in /mobius.css
    surface: "#FFFFFF", // cards and panels
    primary: "#14608C", // Mobius brand ink
    primaryText: "#FFFFFF", // sits on the accent
    text: "#13202B",
    textMuted: "#647684",
    danger: "#9C3A2E",
    tentative: "#8195A2",
    scrim: "#0C161D",
  },
  font: {
    family: "Instrument Sans", // the Mobius face, on Google Fonts
    headingWeight: 700,
    bodyWeight: 400,
  },
};

export type Brand = typeof brand;
