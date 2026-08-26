import { currentBrand } from "@/lib/brandContext";
import { DEFAULT_MARK_SVG } from "@/lib/defaultMark";

export const dynamic = "force-dynamic";

/**
 * The brand's mark. Brands created in the Clients screen carry their own SVG;
 * the rest get the bundled calendar mark. Served from here rather than
 * /public so every brand's logo has a stable, brand-scoped address the nav
 * and the favicon can share. (Inlined, not read from disk — there is no
 * filesystem inside the Worker.)
 */
export async function GET() {
  const brand = await currentBrand();
  const stored = brand.logoSvg;

  // A raster logo is stored as a data: URI; serve the bytes under their own
  // type so the address works anywhere an image is expected, whatever the
  // route is called.
  const raster = stored?.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/i);
  if (raster) {
    const bytes = Uint8Array.from(atob(raster[2]), (c) => c.charCodeAt(0));
    return new Response(bytes, {
      headers: {
        "Content-Type": raster[1],
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  return new Response(stored ?? DEFAULT_MARK_SVG, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
    },
  });
}
