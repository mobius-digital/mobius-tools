"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { brand } from "@/brand.config";
import { DisplayNameBadge } from "@/components/DisplayName";
import { SettingsMenu } from "@/components/SettingsMenu";

/** Extended as views land; every entry must point at a route that exists. */
const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Pipeline" },
  { href: "/calendar", label: "Calendar" },
  { href: "/changelog", label: "Changelog" },
];

export function Nav() {
  const pathname = usePathname();

  // The password screen is its own full-page experience with no navigation.
  if (pathname === "/password") return null;

  return (
    <nav className="nav">
      <Link href="/" className="nav__brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoUrl} alt="" className="nav__logo" aria-hidden />
        <span className="nav__name">{brand.name}</span>
      </Link>
      <span className="nav__product" aria-hidden>
        Launch Calendar
      </span>

      <div className="nav__links">
        {LINKS.map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`nav__link${active ? " nav__link--active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
        <DisplayNameBadge />
        <SettingsMenu />
      </div>
    </nav>
  );
}
