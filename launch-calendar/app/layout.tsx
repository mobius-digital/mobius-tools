import type { Metadata } from "next";
import { headers } from "next/headers";
import { ACCESS_JWT_HEADER, verifyAccessJwt } from "@/lib/access";
import { brand } from "@/brand.config";
import { brandCssVariables, googleFontUrl } from "@/lib/brand";
import { Nav } from "@/components/Nav";
import { DisplayNameProvider } from "@/components/DisplayName";
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
  // With Cloudflare Access on, the signed-in identity comes from the verified
  // token rather than from a name somebody typed into their own browser.
  const identity = await verifyAccessJwt(
    (await headers()).get(ACCESS_JWT_HEADER),
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
          <div className="shell">
            <Nav />
            <main className="main">{children}</main>
          </div>
        </DisplayNameProvider>
      </body>
    </html>
  );
}
