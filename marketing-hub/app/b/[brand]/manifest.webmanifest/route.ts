import { currentBrand, currentBrandId } from "@/lib/brandContext";

export const dynamic = "force-dynamic";

/**
 * The web app manifest, per brand — what a phone reads when somebody adds
 * this board to their home screen. scope/start_url pin the install to the
 * brand's own corner of the hub, so two brands install as two separate apps
 * on the same phone.
 */
export async function GET() {
  const [brand, slug] = await Promise.all([currentBrand(), currentBrandId()]);

  return Response.json({
    name: `${brand.name} ${brand.productName}`,
    short_name: brand.shortName,
    description: "What's going live, when — and which channels need to care.",
    start_url: `/b/${slug}/`,
    scope: `/b/${slug}/`,
    display: "standalone",
    orientation: "any",
    background_color: brand.colors.background,
    theme_color: brand.colors.surface,
    icons: [
      { src: `/b/${slug}/icons/icon-180.png`, sizes: "180x180", type: "image/png", purpose: "any" },
      { src: `/b/${slug}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/b/${slug}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/b/${slug}/icons/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  });
}
