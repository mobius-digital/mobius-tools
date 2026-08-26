"use client";

import { useBrand } from "./BrandProvider";
import { useState, type FormEvent } from "react";
import { useDisplayName } from "./DisplayName";
import { useReportDirty } from "./UnsavedGuard";

/**
 * Changes the shared team password from inside the app.
 *
 * The current password is required, so an unattended open laptop cannot be used
 * to lock everyone else out. Everyone else is signed out by the change, which
 * the form says plainly before you commit to it.
 *
 * A section rather than a dialog of its own: it sits under the invited people
 * in Settings → Users, where the two ways into the board are read together.
 */
export function ChangePasswordSection() {
  const { path } = useBrand();
  const { ensureName } = useDisplayName();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useReportDirty("password", !done && Boolean(current || next || confirm));

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

  if (done) {
    return (
      <>
        <h3 className="dialog__section">Password changed</h3>
        <p className="dialog__body">
          Everyone else has been signed out and will need the new password. You
          are still signed in on this device.
        </p>
      </>
    );
  }

  return (
    <>
      <h3 className="dialog__section">Change the team password</h3>
      <p className="dialog__body">
        Changing it signs everybody out — including you on your other devices.
        If you do not know the current one, an agency admin can reset it from
        the Clients screen without it.
      </p>

      <form className="dialog__form" onSubmit={handleSubmit}>
        <div className="field">
          <label className="field__label" htmlFor="pw-current">
            Current password
          </label>
          <input
            id="pw-current"
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
  );
}
