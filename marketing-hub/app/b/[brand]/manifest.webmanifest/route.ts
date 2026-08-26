import { currentBrand, currentBrandId } from "@/lib/brandContext";
import { hub } from "@/hub.config";

export const dynamic = "force-dynamic";

/**
 * The web app manifest, per brand — what a phone reads when somebody adds
 * this board to their home screen.
 *
 * scope/start_url still pin the install to the brand's own corner, so a
 * client's icon opens their board and nothing else. The name and icons are
 * Lineup's on purpose: an icon per client would mean chasing an SVG for
 * every brand forever, and anyone who works across brands installs once and
 * switches inside. The brand's identity lives on the sign-in card, in the
 * nav, and in every colour on the board.
 */
export async function GET() {
  const [brand, slug] = await Promise.all([currentBrand(), currentBrandId()]);

  return Response.json({
    name: `${hub.name} · ${brand.name}`,
    short_name: hub.shortName,
    description: "What's going live, when — and which channels need to care.",
    start_url: `/b/${slug}/`,
    scope: `/b/${slug}/`,
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
