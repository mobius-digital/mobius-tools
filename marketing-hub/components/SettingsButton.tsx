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
export function SettingsButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
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

      {open && <SettingsDialog onClose={() => setOpen(false)} />}
    </>
  );
}
