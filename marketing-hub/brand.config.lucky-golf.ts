/**
 * Lucky Golf — Mobius's own deploy of the Launch Calendar.
 *
 * Not imported by anything yet. When the Lucky Golf 2 design system lands,
 * update these values from its tokens, restore a Lucky logo at
 * `public/logo.svg`, then copy this file over `brand.config.ts` and redeploy.
 * That is the entire rebrand.
 *
 * These are the pre-design-system values (light theme, gold accent), kept as
 * the starting point so Lucky Golf is one copy away at any time.
 */
export const brand = {
  name: "Lucky Golf",
  logoUrl: "/logo.svg",
  /**
   * true  — a single-colour SVG mark, painted in your accent colour (works on
   *         light and dark themes from one file). This is the default.
   * false — a full-colour logo or PNG, shown exactly as drawn.
   */
  logoTint: true,
  colors: {
    background: "#F4F4F0", // warm off-white page
    surface: "#FFFFFF",
    primary: "#C9A227", // gold — replace from the LG2 design system
    primaryText: "#1A1A18",
    text: "#1A1A18",
    textMuted: "#6B6B63",
    danger: "#B3352F",
    tentative: "#8A8A80",
    scrim: "#1A1A18",
  },
  font: {
    family: "Barlow", // replace from the LG2 design system
    headingWeight: 700,
    bodyWeight: 400,
  },
};

export type Brand = typeof brand;
