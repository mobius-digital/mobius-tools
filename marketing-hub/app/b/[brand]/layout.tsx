import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { brandCssVariables, googleFontUrl } from "@/lib/brand";
import { loadBrand } from "@/lib/brandContext";
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
    title: `${brand.productName} · ${brand.name}`,
    description: `What's launching, when, and which channels need to care — ${brand.name}.`,
    icons: { icon: brand.logoUrl, apple: `/b/${slug}/icons/icon-180.png` },
    manifest: `/b/${slug}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      title: brand.shortName,
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
          productName: brand.productName,
          shortName: brand.shortName,
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
