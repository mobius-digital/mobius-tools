"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useBrand } from "./BrandProvider";
import { BrandLogo } from "@/components/BrandLogo";
import { CheckIcon, ChevronDownIcon } from "@/components/Icons";

type Entry = { slug: string; name: string; admin?: boolean; all?: boolean };

/**
 * The brand block in the bar, and, for someone with access to more than one
 * brand, the switcher.
 *
 * Access comes straight from memberships: /api/me answers with the brands the
 * signed-in Google identity may open (agency admins get all of them, plus the
 * Clients screen and the all-brands calendar). Someone on exactly one brand,
 * which is every client team, sees the plain mark-and-name link; the menu
 * never exists for them. Password-only sessions have no identity, so they
 * see the plain link too.
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
        const list: Entry[] = [...data.brands];
        if (list.length > 1) list.push({ slug: "", name: "All brands", all: true });
        if (data.admin) list.push({ slug: "", name: "Clients", admin: true });
        setEntries(list);
      })
      .catch(() => {
        // No menu, then; the bar still works as a plain brand link.
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

  const others = entries.filter((entry) => entry.admin || entry.all || entry.slug !== brand.slug);
  if (others.length === 0) {
    return (
      <Link href={brand.path("/")} className="brand">
        <BrandLogo className="brand__logo" />
        <span className="brand__name">{brand.name}</span>
      </Link>
    );
  }

  const boards = others.filter((entry) => !entry.admin && !entry.all);
  const extras = others.filter((entry) => entry.admin || entry.all);

  return (
    <div className="menu" ref={wrapRef}>
      <button
        type="button"
        className="brand brand--menu"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch brands"
      >
        <BrandLogo className="brand__logo" />
        <span className="brand__name">{brand.name}</span>
        <ChevronDownIcon className="brand__caret" />
      </button>

      {open && (
        <div className="menu__list menu__list--left" role="menu">
          <div className="menu__heading">Boards</div>
          <div className="menu__item menu__item--current" aria-current="true">
            <span />
            <span className="menu__label">{brand.name}</span>
            <CheckIcon className="menu__check" />
          </div>
          {boards.map((entry) => (
            <a key={entry.slug} href={`/b/${entry.slug}/`} role="menuitem" className="menu__item">
              <span />
              <span className="menu__label">{entry.name}</span>
            </a>
          ))}
          {extras.length > 0 && <hr className="menu__rule" />}
          {extras.map((entry) => (
            <a
              key={entry.admin ? "admin" : "all"}
              href={entry.admin ? "/admin" : "/all"}
              role="menuitem"
              className="menu__item"
            >
              <span />
              <span className="menu__label">{entry.name}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
