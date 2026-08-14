import type { Metadata } from "next";
import { brand } from "@/brand.config";
import { brandCssVariables, googleFontUrl } from "@/lib/brand";
import { Nav } from "@/components/Nav";
import { DisplayNameProvider } from "@/components/DisplayName";
import "./globals.css";

export const metadata: Metadata = {
  title: `Launch Calendar · ${brand.name}`,
  description: `What's launching, when, and which channels need to care — ${brand.name}.`,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
        <DisplayNameProvider>
          <div className="shell">
            <Nav />
            <main className="main">{children}</main>
          </div>
        </DisplayNameProvider>
      </body>
    </html>
  );
}
