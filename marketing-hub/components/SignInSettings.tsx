"use client";

import { useBrand } from "./BrandProvider";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useDisplayName } from "./DisplayName";

/**
 * Who can open this board, chosen from inside the app.
 *
 * Two doors are always open: the people invited here, each with their own
 * Google account, and the board's shared team password for anyone who has the
 * link. This screen manages the first — adding or removing takes effect on the
 * next page load, with no redeploy, which is the whole point of it living in
 * the app rather than in a dashboard.
 *
 * The Google app behind the button is Mobius's, connected once in the Clients
 * area, so there is nothing to configure here beyond the list itself.
 */

type Config = {
  googleClientId: string;
  passwordEnabled: boolean;
  emails: string[];
};

export function SignInSettings({ onClose }: { onClose: () => void }) {
  const { path } = useBrand();
  const { ensureName } = useDisplayName();
  const [config, setConfig] = useState<Config | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(path("/api/settings/signin"))
      .then((r) => r.json() as Promise<Config>)
      .then(setConfig)
      .catch(() => setError("Could not load the current settings."));
  }, []);

  const send = useCallback(
    async (payload: Record<string, unknown>) => {
      const editor = await ensureName();
      if (!editor) return false;

      setBusy(true);
      setError(null);

      try {
        const response = await fetch(path("/api/settings/signin"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, editor }),
        });

        const body = (await response.json().catch(() => ({}))) as Config & {
          error?: string;
        };

        if (!response.ok) {
          setError(body.error ?? "Could not save that.");
          return false;
        }

        setConfig(body);
        return true;
      } catch {
        setError("Network error — check your connection and try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [ensureName],
  );

  async function addEmail(event: FormEvent) {
    event.preventDefault();
    if (!newEmail.trim()) return;
    if (await send({ action: "add-email", email: newEmail })) setNewEmail("");
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
        className="dialog dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <h2 className="dialog__title" id="signin-title">
          Who can sign in
        </h2>

        {/* At the top, where it will be read. */}
        {error && (
          <p className="field__error field__error--banner" role="alert">
            {error}
          </p>
        )}

        {!config ? (
          <p className="dialog__body">Loading…</p>
        ) : (
          <>
            <h3 className="dialog__section">Invited people</h3>
            <p className="dialog__body">
              These addresses can sign in with Google. Adding or removing takes
              effect straight away — no redeploy, and somebody you remove is
              signed out on their next page load.
            </p>

            {config.emails.length > 0 ? (
              <ul className="emails">
                {config.emails.map((email) => (
                  <li key={email} className="emails__row">
                    <span className="emails__address">{email}</span>
                    <button
                      type="button"
                      className="button button--quiet button--small"
                      disabled={busy}
                      onClick={() => void send({ action: "remove-email", email })}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dialog__body dialog__body--muted">Nobody invited yet.</p>
            )}

            <form className="emails__add" onSubmit={addEmail}>
              <input
                className="input"
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder="name@company.com"
                aria-label="Email address to invite"
              />
              <button type="submit" className="button" disabled={busy || !newEmail.trim()}>
                Invite
              </button>
            </form>

            <hr className="dialog__rule" />

            {/* Said plainly, because it is the part people forget: the link and
                password are a second way in, alongside every invitation above. */}
            <h3 className="dialog__section">The team password</h3>
            <p className="dialog__body dialog__body--muted">
              {config.passwordEnabled
                ? "This board also opens with its shared password, for anyone who has the link. Change it from Settings → Change the team password."
                : "This board has no shared password — the invited people above are the only way in."}
            </p>

            {!config.googleClientId && (
              <p className="dialog__body dialog__body--muted">
                Google sign-in is not connected yet. Ask Mobius to connect it;
                until then the team password is the way in.
              </p>
            )}
          </>
        )}

        <div className="dialog__actions">
          <button type="button" className="button button--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
