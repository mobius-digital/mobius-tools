"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBrand } from "@/components/BrandProvider";
import { DisplayNameBadge } from "@/components/DisplayName";
import { BoardSwitcher } from "@/components/BoardSwitcher";
import { SettingsMenu } from "@/components/SettingsMenu";

/** Extended as views land; every entry must point at a route that exists. */
const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Pipeline" },
  { href: "/calendar", label: "Calendar" },
  { href: "/changelog", label: "Changelog" },
];

export function Nav() {
  const pathname = usePathname();
  const brand = useBrand();
  const { path } = useBrand();

  // The password screen is its own full-page experience with no navigation.
  if (pathname.endsWith("/password")) return null;

  return (
    <nav className="nav">
      <BoardSwitcher />
      <span className="nav__product" aria-hidden>
        {brand.productName}
      </span>

      <div className="nav__links">
        {LINKS.map((link) => {
          const href = path(link.href);
          // Next serves the board itself as /b/<brand> while path() builds
          // /b/<brand>/ — compare without the trailing slash or Pipeline never
          // reads as the page you are on.
          const trim = (value: string) => value.replace(/\/+$/, "");
          const active =
            link.href === "/"
              ? trim(pathname) === trim(path("/"))
              : trim(pathname).startsWith(trim(path(link.href)));

          return (
            <Link
              key={link.href}
              href={href}
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
