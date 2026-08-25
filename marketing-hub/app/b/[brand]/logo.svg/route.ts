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

  return new Response(brand.logoSvg ?? DEFAULT_MARK_SVG, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
    },
  });
}
