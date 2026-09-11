"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBrand } from "@/components/BrandProvider";
import { hub } from "@/hub.config";
import { DisplayNameBadge } from "@/components/DisplayName";
import { BoardSwitcher } from "@/components/BoardSwitcher";
import { SettingsButton } from "@/components/SettingsButton";
import { requestNewEvent } from "@/lib/boardConfigEvents";
import { BoardIcon, CalendarIcon, ClockIcon, PlusIcon } from "@/components/Icons";

/**
 * The app's chrome.
 *
 * Desktop: one bar. The brand on the left, the three views in the middle as
 * a segmented set, and on the right the primary action, who is editing, and
 * Settings. Under 720px the views move to a bottom tab bar and the primary
 * action becomes a floating button, both where thumbs are.
 */
const LINKS: { href: string; label: string; icon: React.ReactNode }[] = [
  { href: "/", label: "Calendar", icon: <CalendarIcon /> },
  { href: "/board", label: "Board", icon: <BoardIcon /> },
  { href: "/changelog", label: "Changelog", icon: <ClockIcon /> },
];

export function Nav() {
  const pathname = usePathname();
  const { path } = useBrand();

  // The password screen is its own full-page experience with no navigation.
  if (pathname.endsWith("/password")) return null;

  // Next serves the board itself as /b/<brand> while path() builds
  // /b/<brand>/; compare without the trailing slash or the calendar never
  // reads as the page you are on.
  const trim = (value: string) => value.replace(/\/+$/, "");
  const isActive = (href: string) =>
    href === "/"
      ? trim(pathname) === trim(path("/"))
      : trim(pathname).startsWith(trim(path(href)));

  return (
    <>
      <header className="topbar">
        <div className="topbar__left">
          <BoardSwitcher />
          <span className="topbar__product" aria-hidden>
            {hub.name}
          </span>
        </div>

        <nav className="topbar__tabs" aria-label="Views">
          {LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={path(link.href)}
                className={`tab${active ? " tab--active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {link.icon}
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="topbar__right">
          <button type="button" className="button button--primary" onClick={requestNewEvent}>
            <PlusIcon />
            New event
          </button>
          <DisplayNameBadge />
          <SettingsButton />
        </div>
      </header>

      {/* The phone's navigation: the same three destinations plus Settings,
          fixed at the bottom of the screen. CSS decides which of the two navs
          is visible; the bar exists only under 720px. */}
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
              {link.icon}
              <span>{link.label}</span>
            </Link>
          );
        })}
        <SettingsButton variant="tab" />
      </nav>

      <button type="button" className="fab" onClick={requestNewEvent} aria-label="New event">
        <PlusIcon />
      </button>
    </>
  );
}
