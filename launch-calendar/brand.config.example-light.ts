/**
 * Worked example: a warm light theme with a gold accent.
 *
 * Not imported by anything. Copy it over `brand.config.ts` to see the whole app
 * change — it is here to prove that a rebrand is one file and no code.
 */
export const brand = {
  name: "Example Light",
  /**
   * What the app calls itself — in the nav, the tab title, the sign-in page,
   * and as the name on its Slack posts. "Marketing Calendar" is the default; a
   * team that only ever ships product launches might prefer "Launch Calendar". Purely a label: nothing else changes.
   */
  productName: "Marketing Calendar",
  /**
   * The name under the icon when somebody adds the app to their phone or
   * tablet home screen. iOS shows about eleven characters before it starts
   * trimming, so keep this short — "Calendar", "LG Calendar", "Launches".
   */
  shortName: "Calendar",
  logoUrl: "/logo.svg",
  /**
   * true  — a single-colour SVG mark, painted in your accent colour (works on
   *         light and dark themes from one file). This is the default.
   * false — a full-colour logo or PNG, shown exactly as drawn.
   */
  logoTint: true,
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
