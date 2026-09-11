import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { brandCssVariables } from "@/lib/brand";
import { loadBrand } from "@/lib/brandContext";
import { hub } from "@/hub.config";
import { Nav } from "@/components/Nav";
import { BrandProvider } from "@/components/BrandProvider";
import { DisplayNameProvider } from "@/components/DisplayName";
import { TourProvider } from "@/components/Tour";
import { IDENTITY_COOKIE, readIdentityToken } from "@/lib/session";
import { getPerson } from "@/lib/people";

/**
 * One brand's world.
 *
 * Everything under /b/[brand] renders inside this: the brand's accent becomes
 * a CSS variable (overriding the hub's own from the root layout) and the
 * client side gets the brand through context. Everything else about the look
 * is Lineup's and comes from the stylesheet.
 */

type Params = { params: Promise<{ brand: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { brand: slug } = await params;
  const brand = await loadBrand(slug);
  if (!brand) return {};

  return {
    title: `${hub.name} · ${brand.name}`,
    description: `What's launching, when, and which channels need to care: ${brand.name}.`,
    // The wrapper is the product, the contents are the client's: the tab icon
    // and the installed app wear Lineup so nobody has to supply a logo per
    // client, and anyone working across brands keeps one recognizable icon.
    icons: { icon: "/lineup.svg", apple: "/icons/hub-180.png" },
    manifest: `/b/${slug}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      title: hub.shortName,
      statusBarStyle: "default",
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: "#ffffff",
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

  // The cookie carries the name Google gave at sign-in; the stored one is the
  // name this person actually chose, and it wins.
  const person = identity ? await getPerson(identity.email) : null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: brandCssVariables(brand) }} />
      <BrandProvider
        brand={{
          slug: brand.slug,
          name: brand.name,
          logoUrl: brand.logoUrl,
          logoTint: brand.logoTint,
        }}
      >
        <DisplayNameProvider
          identity={identity ? (person?.name ?? identity.name) : null}
          needsName={Boolean(identity) && person?.confirmed !== true}
        >
          {/* Mounted here, not in a page, so the tour survives moving between
              Calendar, Board and Changelog. */}
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
