/**
 * The single source of truth for every brand-specific value in this app.
 *
 * Replicating the Launch Calendar for another brand means replacing this file
 * and redeploying — no other code changes. Nothing outside this file may
 * contain a brand colour, font family, font weight, brand name, or logo path.
 *
 * `brand.config.lucky-dark.ts` holds the original dark palette; swapping the
 * two files is the whole of a light/dark change.
 */
export const brand = {
  name: "Lucky Golf",
  logoUrl: "/logo.svg",
  colors: {
    background: "#F4F4F0", // warm off-white page
    surface: "#FFFFFF", // cards and panels
    primary: "#C9A227", // gold
    primaryText: "#1A1A18", // sits on the gold, so it stays dark
    text: "#1A1A18",
    textMuted: "#6B6B63",
    danger: "#B3352F",
    tentative: "#8A8A80",
    /**
     * The wash behind a modal. It cannot be derived from the palette: it has to
     * darken the page in a light theme and in a dark one alike, so mixing from
     * either the background or the text colour gets it backwards in one of them.
     */
    scrim: "#1A1A18",
  },
  font: {
    family: "Barlow", // Google Fonts
    headingWeight: 700,
    bodyWeight: 400,
  },
};

export type Brand = typeof brand;
