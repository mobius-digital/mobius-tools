import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { brand } from "@/brand.config";
import { brandCssVariables, googleFontUrl } from "@/lib/brand";
import { APPLE_TOUCH_ICON } from "@/lib/homeScreen";
import { Nav } from "@/components/Nav";
import { DisplayNameProvider } from "@/components/DisplayName";
import { TourProvider } from "@/components/Tour";
import { ServiceWorker } from "@/components/ServiceWorker";
import { IDENTITY_COOKIE, readIdentityToken } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: `${brand.productName} · ${brand.name}`,
  description: `What's launching, when, and which channels need to care — ${brand.name}.`,
  icons: { icon: brand.logoUrl, apple: APPLE_TOUCH_ICON },
  manifest: "/manifest.webmanifest",
  // Added to a home screen, the board opens full-screen under its short name
  // rather than as a Safari tab. The manifest carries the same for Android.
  appleWebApp: {
    capable: true,
    title: brand.shortName,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: brand.colors.surface,
  // Lets the page run under the notch and home indicator; the nav and main
  // pad themselves with env(safe-area-inset-*) so nothing sits beneath them.
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // After a Google sign-in the name comes from the person's own account, so
  // edits are stamped with a verified identity rather than one they typed.
  const identity = await readIdentityToken(
    (await cookies()).get(IDENTITY_COOKIE)?.value,
  );

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href={googleFontUrl()} />
        <style dangerouslySetInnerHTML={{ __html: brandCssVariables() }} />
      </head>
      <body>
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
        <ServiceWorker />
      </body>
    </html>
  );
}
