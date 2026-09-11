import { brand as defaultBrand, type Brand } from "@/brand.config";

/**
 * What a brand contributes to the page: its accent, and nothing else.
 *
 * Lineup has one look. The ground, the type, the greys and the stage hues
 * are the product's own (see app/globals.css), so every board reads as the
 * same app and a person working across several brands never has to relearn
 * it. The brand's color still leads: the primary button, today's date, the
 * chips of anything not yet sorted into a stage, and its mark in the bar.
 *
 * `primaryText` is whatever sits legibly on the accent, worked out when the
 * brand was created (lib/palette.ts).
 */
export function brandCssVariables(brand: Brand = defaultBrand): string {
  return [
    ":root {",
    `  --accent: ${brand.colors.primary};`,
    `  --accent-text: ${brand.colors.primaryText};`,
    "}",
  ].join("\n");
}

/** The one typeface, requested once from the root layout. */
export const FONT_URL =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap";

/** Kept for the callers that used to ask per brand; there is one answer now. */
export function googleFontUrl(): string {
  return FONT_URL;
}
