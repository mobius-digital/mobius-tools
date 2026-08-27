"use client";

import { useBrand } from "./BrandProvider";

/**
 * The brand mark, tinted to the accent color.
 *
 * An SVG loaded through <img> cannot inherit the page's color — `currentColor`
 * inside it resolves to black, whatever the theme. So a single-color mark is
 * painted as a CSS mask instead: the file supplies the shape, the page supplies
 * the color. That is what lets one logo file work on a light theme and a dark
 * one without being redrawn.
 *
 * Brands with a full-color logo set `logoTint: false` in brand.config.ts and get
 * the file rendered exactly as drawn.
 */
export function BrandLogo({ className }: { className: string }) {
  const brand = useBrand();
  const tint = brand.logoTint !== false;

  if (!tint) {
    // `logo--raster` carries object-fit: contain. Every slot a mark goes in is
    // a fixed square, and without it a wide file is stretched to fill one —
    // which is how a logo ends up looking crushed in the nav. New uploads are
    // squared by the cropper; this covers the ones saved before it existed.
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={brand.logoUrl}
        alt=""
        className={`${className} logo--raster`}
        aria-hidden
      />
    );
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
