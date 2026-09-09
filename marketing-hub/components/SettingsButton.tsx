"use client";

import { useState } from "react";
import { SettingsDialog } from "./SettingsDialog";

/**
 * The Settings button in the nav.
 *
 * It used to open a dropdown of eight items, each of which opened a dialog of
 * its own. Everything now lives in one window with a rail of sections down the
 * left, so this is only the way in — see SettingsDialog for the window itself.
 */
export function SettingsButton({ variant = "nav" }: { variant?: "nav" | "tab" }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "tab" ? (
        // The phone tab bar's way in: icon above label, like its siblings.
        <button
          type="button"
          className={`tabbar__item${open ? " tabbar__item--active" : ""}`}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
            <circle cx="8" cy="8" r="2.1" />
            <path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" />
          </svg>
          <span>Settings</span>
        </button>
      ) : (
        <button
          type="button"
          className="settings settings__trigger"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Settings"
        >
          Settings
        </button>
      )}

      {open && <SettingsDialog onClose={() => setOpen(false)} />}
    </>
  );
}
