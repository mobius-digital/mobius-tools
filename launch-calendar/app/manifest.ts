import type { MetadataRoute } from "next";
import { brand } from "@/brand.config";
import { HOME_SCREEN_ICONS } from "@/lib/homeScreen";

/**
 * The web app manifest — what a phone or tablet reads when somebody adds the
 * board to their home screen. Served at /manifest.webmanifest.
 *
 * Built from brand.config.ts rather than shipped as a static file so a brand
 * swap changes the installed app's name and colours with no second edit.
 * `display: standalone` is what drops the browser chrome once installed.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${brand.name} ${brand.productName}`,
    short_name: brand.shortName,
    description: `What's going live, when — and which channels need to care.`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: brand.colors.background,
    theme_color: brand.colors.surface,
    icons: HOME_SCREEN_ICONS.map((icon) => ({
      src: icon.src,
      sizes: `${icon.size}x${icon.size}`,
      type: "image/png",
      purpose: icon.purpose,
    })),
  };
}
