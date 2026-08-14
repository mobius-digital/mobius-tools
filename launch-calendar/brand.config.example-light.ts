/**
 * Worked example: a warm light theme with a gold accent.
 *
 * Not imported by anything. Copy it over `brand.config.ts` to see the whole app
 * change — it is here to prove that a rebrand is one file and no code.
 */
export const brand = {
  name: "Example Light",
  logoUrl: "/logo.svg",
  colors: {
    background: "#F4F4F0", // warm off-white
    surface: "#FFFFFF",
    primary: "#C9A227", // gold
    primaryText: "#1A1A18",
    text: "#1A1A18",
    textMuted: "#6B6B63",
    danger: "#B3352F",
    tentative: "#8A8A80",
    scrim: "#1A1A18",
  },
  font: {
    family: "Barlow", // Google Fonts
    headingWeight: 700,
    bodyWeight: 400,
  },
};

export type Brand = typeof brand;
