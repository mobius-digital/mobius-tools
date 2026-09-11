import type { Metadata, Viewport } from "next";
import { hub } from "@/hub.config";
import { FONT_URL, brandCssVariables } from "@/lib/brand";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

/**
 * The hub's outermost shell, shared by every page, brand or not.
 *
 * The one typeface is requested here, once. The accent painted here is
 * Mobius's own and dresses the front door, the Clients screen and the
 * offline page; each brand's layout under /b/[brand] overrides it with that
 * brand's color.
 */
export const metadata: Metadata = {
  title: hub.name,
  description: hub.tagline,
  icons: { icon: "/lineup.svg", apple: "/icons/hub-180.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: hub.shortName,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONT_URL} />
        <style dangerouslySetInnerHTML={{ __html: brandCssVariables() }} />
      </head>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
