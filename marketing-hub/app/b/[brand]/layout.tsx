import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { brandCssVariables, googleFontUrl } from "@/lib/brand";
import { loadBrand } from "@/lib/brandContext";
import { hub } from "@/hub.config";
import { Nav } from "@/components/Nav";
import { BrandProvider } from "@/components/BrandProvider";
import { DisplayNameProvider } from "@/components/DisplayName";
import { TourProvider } from "@/components/Tour";
import { IDENTITY_COOKIE, readIdentityToken } from "@/lib/session";

/**
 * One brand's world.
 *
 * Everything under /b/[brand] renders inside this: the brand row becomes CSS
 * variables (overriding the hub defaults from the root layout), its font is
 * requested, and the client side gets the brand through context — the same
 * values `brand.config.ts` used to bake in at build time, now per request.
 */

type Params = { params: Promise<{ brand: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { brand: slug } = await params;
  const brand = await loadBrand(slug);
  if (!brand) return {};

  return {
    title: `${hub.name} · ${brand.name}`,
    description: `What's launching, when, and which channels need to care — ${brand.name}.`,
    // The wrapper is the product, the contents are the client's: the tab icon
    // and the installed app wear Lineup so nobody has to supply a logo per
    // client, and anyone working across brands keeps one recognizable icon.
    // The brand's own mark still leads the sign-in card and the nav inside.
    icons: { icon: "/lineup.svg", apple: "/icons/hub-180.png" },
    manifest: `/b/${slug}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      title: hub.shortName,
      statusBarStyle: "default",
    },
  };
}

export async function generateViewport({ params }: Params): Promise<Viewport> {
  const { brand: slug } = await params;
  const brand = await loadBrand(slug);

  return {
    width: "device-width",
    initialScale: 1,
    themeColor: brand?.colors.surface,
    viewportFit: "cover",
  };
}

export default async function BrandLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ brand: string }>;
}) {
  const { brand: slug } = await params;
  const brand = await loadBrand(slug);
  // The middleware already refused unknown slugs; this is belt and braces.
  if (!brand) return null;

  const identity = await readIdentityToken(
    (await cookies()).get(IDENTITY_COOKIE)?.value,
  );

  return (
    <>
      <link rel="stylesheet" href={googleFontUrl(brand)} />
      <style dangerouslySetInnerHTML={{ __html: brandCssVariables(brand) }} />
      <BrandProvider
        brand={{
          slug: brand.slug,
          name: brand.name,
          logoUrl: brand.logoUrl,
          logoTint: brand.logoTint,
        }}
      >
        <DisplayNameProvider identity={identity?.name ?? null}>
          {/* Mounted here, not in a page, so the tour survives moving between
              Pipeline, Calendar and Changelog. */}
          <TourProvider>
            <div className="shell">
              <Nav />
              <main className="main">{children}</main>
            </div>
          </TourProvider>
        </DisplayNameProvider>
      </BrandProvider>
    </>
  );
}
