"use client";

import { useState } from "react";
import { SettingsDialog } from "./SettingsDialog";
import { GearIcon } from "./Icons";

/**
 * The way into Settings: a gear in the bar, or the fourth tab on a phone.
 * Everything lives in one window with a rail of sections down the left; see
 * SettingsDialog for the window itself.
 */
export function SettingsButton({ variant = "nav" }: { variant?: "nav" | "tab" }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "tab" ? (
        <button
          type="button"
          className={`tabbar__item${open ? " tabbar__item--active" : ""}`}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <GearIcon />
          <span>Settings</span>
        </button>
      ) : (
        <button
          type="button"
          className="iconbtn settings"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Settings"
          title="Settings"
        >
          <GearIcon />
        </button>
      )}

      {open && <SettingsDialog onClose={() => setOpen(false)} />}
    </>
  );
}
