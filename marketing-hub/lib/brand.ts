import { brand as defaultBrand, type Brand } from "@/brand.config";

/**
 * Turns `brand.config.ts` into the CSS custom properties every component reads.
 *
 * This is the only place brand values cross from TypeScript into CSS. Every
 * stylesheet rule references these variables via `var(--…)`; none of them may
 * restate a literal color or font.
 */
export function brandCssVariables(brand: Brand = defaultBrand): string {
  const { colors, font } = brand;

  const declarations: Record<string, string> = {
    "--color-background": colors.background,
    "--color-surface": colors.surface,
    "--color-primary": colors.primary,
    "--color-primary-text": colors.primaryText,
    "--color-text": colors.text,
    "--color-text-muted": colors.textMuted,
    "--color-danger": colors.danger,
    "--color-tentative": colors.tentative,
    "--color-scrim": colors.scrim,
    "--font-family": `"${font.family}", system-ui, sans-serif`,
    "--font-weight-heading": String(font.headingWeight),
    "--font-weight-body": String(font.bodyWeight),
  };

  const body = Object.entries(declarations)
    .map(([property, value]) => `  ${property}: ${value};`)
    .join("\n");

  return `:root {\n${body}\n}`;
}

/**
 * Builds the Google Fonts stylesheet URL for the configured family and weights.
 *
 * `next/font/google` is deliberately not used here: it resolves the family name
 * at compile time from a string literal, which would mean a brand swap to a
 * different typeface required a code change. The PRD's promise is that a new
 * brand is config-plus-deploy only, so the font is requested at runtime from
 * whatever `brand.font.family` says.
 */
export function googleFontUrl(brand: Brand = defaultBrand): string {
  const family = brand.font.family.trim().replace(/\s+/g, "+");
  const weights = Array.from(
    new Set([brand.font.bodyWeight, brand.font.headingWeight]),
  ).sort((a, b) => a - b);

  return `https://fonts.googleapis.com/css2?family=${family}:wght@${weights.join(";")}&display=swap`;
}
