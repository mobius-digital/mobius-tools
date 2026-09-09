"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBrand } from "@/components/BrandProvider";
import { hub } from "@/hub.config";
import { DisplayNameBadge } from "@/components/DisplayName";
import { BoardSwitcher } from "@/components/BoardSwitcher";
import { SettingsButton } from "@/components/SettingsButton";

/** Extended as views land; every entry must point at a route that exists. */
const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Pipeline" },
  { href: "/calendar", label: "Calendar" },
  { href: "/changelog", label: "Changelog" },
];

/* One 16x16 stroked icon per destination, matching stroke weight so the bar
   reads as one set. Only the phone tab bar renders them; the top nav stays
   text-only. */
const ICONS: Record<string, React.ReactNode> = {
  "/": (
    // Pipeline: staggered spans on a timeline.
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
      <path d="M2 4.5h6M5.5 8h8M3 11.5h6" />
    </svg>
  ),
  "/calendar": (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
    </svg>
  ),
  "/changelog": (
    // Changelog: a clock, because it answers "what happened, when".
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5.2V8l2.2 1.6" />
    </svg>
  ),
};

export function Nav() {
  const pathname = usePathname();
  const brand = useBrand();
  const { path } = useBrand();

  // The password screen is its own full-page experience with no navigation.
  if (pathname.endsWith("/password")) return null;

  // Next serves the board itself as /b/<brand> while path() builds
  // /b/<brand>/ — compare without the trailing slash or Pipeline never
  // reads as the page you are on.
  const trim = (value: string) => value.replace(/\/+$/, "");
  const isActive = (href: string) =>
    href === "/"
      ? trim(pathname) === trim(path("/"))
      : trim(pathname).startsWith(trim(path(href)));

  return (
    <>
      <nav className="nav">
        <BoardSwitcher />
        <span className="nav__product" aria-hidden>
          {hub.name}
        </span>

        <div className="nav__links">
          {LINKS.map((link) => {
            const href = path(link.href);
            const active = isActive(link.href);

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
          <SettingsButton />
        </div>
      </nav>

      {/* The phone's navigation: the same three destinations plus Settings,
          fixed at the bottom of the screen where thumbs live. CSS decides
          which of the two navs is visible; the bar exists only under 720px. */}
      <nav className="tabbar" aria-label="Primary">
        {LINKS.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={path(link.href)}
              className={`tabbar__item${active ? " tabbar__item--active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {ICONS[link.href]}
              <span>{link.label}</span>
            </Link>
          );
        })}
        <SettingsButton variant="tab" />
      </nav>
    </>
  );
}
