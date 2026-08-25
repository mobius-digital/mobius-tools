"use client";

import { useBrand } from "./BrandProvider";

/**
 * The brand mark, tinted to the accent colour.
 *
 * An SVG loaded through <img> cannot inherit the page's colour — `currentColor`
 * inside it resolves to black, whatever the theme. So a single-colour mark is
 * painted as a CSS mask instead: the file supplies the shape, the page supplies
 * the colour. That is what lets one logo file work on a light theme and a dark
 * one without being redrawn.
 *
 * Brands with a full-colour logo set `logoTint: false` in brand.config.ts and get
 * the file rendered exactly as drawn.
 */
export function BrandLogo({ className }: { className: string }) {
  const brand = useBrand();
  const tint = brand.logoTint !== false;

  if (!tint) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brand.logoUrl} alt="" className={className} aria-hidden />;
  }

  const mask = `url("${brand.logoUrl}") center / contain no-repeat`;
  return (
    <span
      className={`${className} logo--tinted`}
      style={{ WebkitMask: mask, mask }}
      aria-hidden
    />
  );
}
