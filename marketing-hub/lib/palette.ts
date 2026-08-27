/**
 * Three colors in, the calendar's full palette out.
 *
 * The Clients screen asks for accent, background and text — the three choices
 * a brand actually has an opinion about — and the rest is derived to match:
 * surfaces, muted text, the color that sits on the accent. Same math the
 * standalone console used, kept here so brands created in-app and any future
 * importer agree.
 */

function hexToRgb(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function rgbToHex(rgb: number[]): string {
  return "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function mix(hexA: string, hexB: string, amountOfB: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * amountOfB));
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const HEX = /^#[0-9a-fA-F]{6}$/;

export type PaletteSeed = { accent: string; background: string; text: string };

export function derivePalette({ accent, background, text }: PaletteSeed) {
  const lightPage = luminance(background) > 0.4;
  return {
    background,
    surface: lightPage ? "#FFFFFF" : mix(background, "#FFFFFF", 0.07),
    primary: accent,
    // White on a dark accent, the text color on a light one.
    primaryText: luminance(accent) > 0.45 ? text : "#FFFFFF",
    text,
    textMuted: mix(text, background, 0.42),
    danger: "#B3352F",
    tentative: mix(text, background, 0.55),
    scrim: text,
  };
}
