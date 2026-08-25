"use client";

import { useBrand } from "./BrandProvider";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useDisplayName } from "./DisplayName";

/**
 * Changes the shared team password from inside the app.
 *
 * The current password is required, so an unattended open laptop cannot be used
 * to lock everyone else out. Everyone else is signed out by the change, which
 * the dialog says plainly before you commit to it.
 */
export function ChangePassword({ onClose }: { onClose: () => void }) {
  const { path } = useBrand();
  const { ensureName } = useDisplayName();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (next !== confirm) {
      setError("The two new passwords do not match.");
      return;
    }

    const editor = await ensureName();
    if (!editor) {
      setError("Set your name first — the change is recorded against it.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(path("/api/password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next, editor }),
      });

      const body = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(body.error ?? "Could not change the password.");
        return;
      }

      setDone(true);
    } catch {
      setError("Network error — the password was not changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="scrim"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <h2 className="dialog__title" id="password-title">
          {done ? "Password changed" : "Change the team password"}
        </h2>

        {done ? (
          <>
            <p className="dialog__body">
              Everyone else has been signed out and will need the new password.
              You are still signed in on this device.
            </p>
            <div className="dialog__actions">
              <button type="button" className="button button--primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="dialog__body">
              This is the one password the whole team shares. Changing it signs
              everybody out — including you on your other devices.
            </p>

            <form className="dialog__form" onSubmit={handleSubmit}>
              <div className="field">
                <label className="field__label" htmlFor="pw-current">
                  Current password
                </label>
                <input
                  id="pw-current"
                  ref={firstRef}
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={current}
                  onChange={(event) => setCurrent(event.target.value)}
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="pw-next">
                  New password
                </label>
                <input
                  id="pw-next"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  onChange={(event) => setNext(event.target.value)}
                />
                <p className="field__hint">At least 8 characters.</p>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="pw-confirm">
                  New password again
                </label>
                <input
                  id="pw-confirm"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </div>

              {error && (
                <p className="field__error" role="alert">
                  {error}
                </p>
              )}

              <div className="dialog__actions">
                <button type="button" className="button button--quiet" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button--primary"
                  disabled={busy || !current || !next || !confirm}
                >
                  {busy ? "Changing…" : "Change password"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
