import type { Metadata, Viewport } from "next";
import { brand } from "@/brand.config";
import { hub } from "@/hub.config";
import { brandCssVariables, googleFontUrl } from "@/lib/brand";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

/**
 * The hub's outermost shell — shared by every page, brand or not.
 *
 * Deliberately thin: the default palette painted here is what the front door,
 * the Clients screen and the offline page wear. Each brand's own layout under
 * /b/[brand] overrides the variables with that brand's palette, so a client
 * only ever sees their colours.
 */
export const metadata: Metadata = {
  title: hub.name,
  description: hub.tagline,
  icons: { icon: "/logo.svg", apple: "/icons/hub-180.png" },
  manifest: "/manifest.webmanifest",
  // Installed from the front door, this is the agency's switcher app; a brand
  // installed from its own board is a separate icon with the brand's name.
  appleWebApp: {
    capable: true,
    title: hub.shortName,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: brand.colors.surface,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={googleFontUrl()} />
        <style dangerouslySetInnerHTML={{ __html: brandCssVariables() }} />
      </head>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
