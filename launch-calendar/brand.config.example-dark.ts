/**
 * Worked example: a near-black theme with a warm accent.
 *
 * Not imported by anything. Copy it over `brand.config.ts` to see the whole app
 * flip to dark — it is here to prove that a theme change is one file and no
 * code, and to show what a full palette looks like filled in.
 */
export const brand = {
  name: "Example Dark",
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
