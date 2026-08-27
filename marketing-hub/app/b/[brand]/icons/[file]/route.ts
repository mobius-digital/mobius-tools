import { currentBrand } from "@/lib/brandContext";

export const dynamic = "force-dynamic";

/**
 * Home-screen icons, per brand, from the brands row.
 *
 * They are PNGs painted in the brand's colors when the brand was created
 * (the Clients screen renders them in the browser). A brand with none —
 * possible only for rows made outside that screen — falls back to the
 * bundled default icons so an install never gets a broken image.
 */
const SIZES: Record<string, string> = {
  "icon-180.png": "180",
  "icon-192.png": "192",
  "icon-512.png": "512",
  "icon-maskable-512.png": "maskable",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const key = SIZES[file];
  if (!key) return new Response("Not found.", { status: 404 });

  const brand = await currentBrand();
  const base64 = brand.icons[key];

  if (!base64) {
    return Response.redirect(new URL(`/icons/${file}`, request.url), 307);
  }

  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=300",
    },
  });
}
