"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useBrand } from "./BrandProvider";
import { BrandLogo } from "@/components/BrandLogo";

type Entry = { slug: string; name: string; admin?: boolean };

/**
 * The brand block in the nav — and, for someone with access to more than one
 * brand, the switcher.
 *
 * Access comes straight from memberships: /api/me answers with the brands the
 * signed-in Google identity may open (agency admins get all of them, plus the
 * Clients screen). Someone on exactly one brand — every client team — sees
 * the plain logo-and-name link they have always seen; the menu simply never
 * exists for them. Password-only sessions have no identity, so they see the
 * plain link too.
 */
export function BoardSwitcher() {
  const brand = useBrand();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((r) => (r.ok ? (r.json() as Promise<{ brands?: Entry[]; admin?: boolean }>) : null))
      .then((data) => {
        if (cancelled || !data?.brands) return;
        const list: Entry[] = data.brands;
        if (data.admin) list.push({ slug: "", name: "All clients", admin: true });
        setEntries(list);
      })
      .catch(() => {
        // No menu, then — the nav still works as a plain brand link.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const others = entries.filter((entry) => entry.admin || entry.slug !== brand.slug);
  if (others.length === 0) {
    return (
      <Link href={brand.path("/")} className="nav__brand">
        <BrandLogo className="nav__logo" />
        <span className="nav__name">{brand.name}</span>
      </Link>
    );
  }

  return (
    <div className="switcher" ref={wrapRef}>
      <button
        type="button"
        className="nav__brand switcher__trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch brands"
      >
        <BrandLogo className="nav__logo" />
        <span className="nav__name">{brand.name}</span>
        <span className="switcher__caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="switcher__list" role="menu">
          <div className="switcher__item switcher__item--current" aria-current="true">
            <span className="switcher__label">{brand.name}</span>
            <span className="switcher__check" aria-hidden>
              ✓
            </span>
          </div>
          {others.map((entry) => (
            <a
              key={entry.slug || "admin"}
              href={entry.admin ? "/admin" : `/b/${entry.slug}/`}
              role="menuitem"
              className={`switcher__item${entry.admin ? " switcher__item--admin" : ""}`}
            >
              <span className="switcher__label">{entry.name}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
