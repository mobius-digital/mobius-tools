import { hub } from "@/hub.config";
import { brand } from "@/brand.config";

export const dynamic = "force-static";

/**
 * The agency's own app — the one that opens the brand picker.
 *
 * Scoped to "/" while each brand's manifest is scoped to /b/<slug>/, so a
 * phone treats them as separate installs: somebody at a client has their own
 * brand's icon, somebody who works across brands has this one, and both can
 * sit on the same home screen without colliding.
 */
export function GET() {
  return Response.json({
    id: "/",
    name: hub.name,
    short_name: hub.shortName,
    description: hub.tagline,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: brand.colors.background,
    theme_color: brand.colors.surface,
    icons: [
      { src: "/icons/hub-180.png", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "/icons/hub-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/hub-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/hub-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  });
}
