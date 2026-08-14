/**
 * The original near-black Lucky Golf palette.
 *
 * Not imported by anything — copy it over `brand.config.ts` to switch the whole
 * app back to dark. Kept alongside the live config so the light/dark choice
 * stays a one-file swap rather than a rewrite.
 */
export const brand = {
  name: "Lucky Golf",
  logoUrl: "/logo.svg",
  colors: {
    background: "#0E0E0E", // near-black
    surface: "#1A1A1A",
    primary: "#C9A227", // gold
    primaryText: "#0E0E0E",
    text: "#F5F5F0",
    textMuted: "#9A9A94",
    danger: "#D9534F",
    tentative: "#6E6E68",
    scrim: "#000000",
  },
  font: {
    family: "Barlow", // Google Fonts
    headingWeight: 700,
    bodyWeight: 400,
  },
};

export type Brand = typeof brand;
