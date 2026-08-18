import type { Metadata } from "next";
import { cookies } from "next/headers";
import { brand } from "@/brand.config";
import { brandCssVariables, googleFontUrl } from "@/lib/brand";
import { Nav } from "@/components/Nav";
import { DisplayNameProvider } from "@/components/DisplayName";
import { TourProvider } from "@/components/Tour";
import { IDENTITY_COOKIE, readIdentityToken } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: `Launch Calendar · ${brand.name}`,
  description: `What's launching, when, and which channels need to care — ${brand.name}.`,
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
      </body>
    </html>
  );
}
