"use client";

import { useEffect, useRef, useState } from "react";
import { useDisplayName } from "./DisplayName";

/**
 * The small settings menu in the nav.
 *
 * Deliberately thin: this tool has no accounts and almost no preferences, so the
 * menu holds only the things a person genuinely needs to reach again — who they
 * are editing as, and replaying the tour.
 */
export function SettingsMenu({ onReplayTour }: { onReplayTour: () => void }) {
  const { name, promptForName } = useDisplayName();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="settings" ref={wrapRef}>
      <button
        type="button"
        className="settings__trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Settings"
        title="Settings"
      >
        Settings
        <span className="settings__caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="settings__list" role="menu">
          <button
            type="button"
            role="menuitem"
            className="settings__item"
            onClick={() => {
              setOpen(false);
              void promptForName();
            }}
          >
            <span className="settings__label">Change your name</span>
            <span className="settings__hint">
              {name ? `Editing as ${name}` : "Not set on this device yet"}
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="settings__item"
            onClick={() => {
              setOpen(false);
              onReplayTour();
            }}
          >
            <span className="settings__label">Replay the walkthrough</span>
            <span className="settings__hint">A two-minute tour of the board</span>
          </button>
        </div>
      )}
    </div>
  );
}
