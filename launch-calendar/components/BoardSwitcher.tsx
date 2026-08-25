"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { brand } from "@/brand.config";
import { BrandLogo } from "@/components/BrandLogo";

type Entry = { label: string; url: string };

/**
 * The brand block in the nav — and, for someone with more than one board, a
 * switcher.
 *
 * Most people on a client board see exactly what they see today: the logo and
 * name, a link home. The menu only exists when this board's Settings list
 * other boards *this person* is allowed to see (the server filters by their
 * signed-in email), so a client team never learns the agency's other brands
 * from their nav.
 *
 * Each entry is simply the other board's address: separate deployments,
 * separate databases — the menu is the only thing they share.
 */
export function BoardSwitcher() {
  const [others, setOthers] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/boards")
      .then((r) => (r.ok ? (r.json() as Promise<{ visible?: Entry[] }>) : null))
      .then((data) => {
        if (cancelled || !data?.visible) return;
        // This board may be on its own list (one list pasted everywhere is the
        // easy way to maintain it), so entries pointing here are dropped.
        const origin = window.location.origin;
        setOthers(data.visible.filter((entry) => !entry.url.startsWith(origin)));
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

  if (others.length === 0) {
    return (
      <Link href="/" className="nav__brand">
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
        aria-label="Switch boards"
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
            <a key={entry.url} href={entry.url} role="menuitem" className="switcher__item">
              <span className="switcher__label">{entry.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
