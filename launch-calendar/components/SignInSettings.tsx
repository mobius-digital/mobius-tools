"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useDisplayName } from "./DisplayName";

/**
 * Who can get in, chosen from inside the app.
 *
 * Either a shared password on a link, or an invite list of Google accounts.
 * Everything here takes effect immediately — there is no redeploy step, which
 * is the whole point of keeping this in the app rather than in a dashboard.
 *
 * The Google option is deliberately disabled until it would actually work, and
 * says what is missing. It used to be selectable and then fail server-side, with
 * the explanation rendered far enough down the dialog to be off-screen — which
 * read as the button simply not responding.
 */

type Config = {
  mode: "password" | "google";
  googleClientId: string;
  passwordFallback: boolean;
  emails: string[];
};

export function SignInSettings({ onClose }: { onClose: () => void }) {
  const { ensureName } = useDisplayName();
  const [config, setConfig] = useState<Config | null>(null);
  const [clientId, setClientId] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings/signin")
      .then((r) => r.json() as Promise<Config>)
      .then((body) => {
        setConfig(body);
        setClientId(body.googleClientId);
      })
      .catch(() => setError("Could not load the current settings."));
  }, []);

  const send = useCallback(
    async (payload: Record<string, unknown>) => {
      const editor = await ensureName();
      if (!editor) return false;

      setBusy(true);
      setError(null);

      // Move the control now and correct it from the response. Waiting on a
      // round trip before the radio visibly changes reads as an unresponsive
      // button, especially when the request then fails.
      const optimistic =
        typeof payload.mode === "string" || typeof payload.passwordFallback === "boolean";
      if (optimistic) {
        setConfig((current) =>
          current
            ? {
                ...current,
                mode: (payload.mode as Config["mode"]) ?? current.mode,
                passwordFallback:
                  typeof payload.passwordFallback === "boolean"
                    ? payload.passwordFallback
                    : current.passwordFallback,
              }
            : current,
        );
      }

      try {
        const response = await fetch("/api/settings/signin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, editor }),
        });

        const body = (await response.json().catch(() => ({}))) as Config & {
          error?: string;
        };

        if (!response.ok) {
          setError(body.error ?? "Could not save that.");
          // Put the control back where the server says it actually is.
          if (optimistic) {
            const truth = (await fetch("/api/settings/signin")
              .then((r) => r.json())
              .catch(() => null)) as Config | null;
            if (truth) setConfig(truth);
          }
          return false;
        }

        setConfig(body);
        setClientId(body.googleClientId);
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

  // What still stands between this board and working Google sign-in.
  const missing: string[] = [];
  if (config) {
    if (!config.googleClientId) missing.push("a Google client ID");
    if (config.emails.length === 0) missing.push("at least one invited email");
  }
  const googleReady = Boolean(config) && missing.length === 0;

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
            <div className="choice">
              <label className="choice__option">
                <input
                  type="radio"
                  name="auth-mode"
                  checked={config.mode === "password"}
                  onChange={() => void send({ mode: "password" })}
                  disabled={busy}
                />
                <span>
                  <span className="choice__label">Shared password</span>
                  <span className="choice__hint">
                    One link, one password, everybody uses the same one.
                  </span>
                </span>
              </label>

              <label
                className={`choice__option${googleReady ? "" : " choice__option--blocked"}`}
              >
                <input
                  type="radio"
                  name="auth-mode"
                  checked={config.mode === "google"}
                  onChange={() => void send({ mode: "google", googleClientId: clientId })}
                  disabled={busy || !googleReady}
                />
                <span>
                  <span className="choice__label">Google sign-in, by invitation</span>
                  <span className="choice__hint">
                    Only the people listed below can get in, each with their own
                    Google account.
                  </span>
                  {!googleReady && (
                    <span className="choice__blocker">
                      Add {missing.join(" and ")} below first — otherwise nobody,
                      including you, could get back in.
                    </span>
                  )}
                </span>
              </label>
            </div>

            <hr className="dialog__rule" />

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

            {/* Folded away: needed once, then never again. */}
            <details className="disclose" open={!config.googleClientId}>
              <summary className="disclose__summary">
                Google client ID
                <span className="disclose__state">
                  {config.googleClientId ? "set" : "not set yet"}
                </span>
              </summary>

              <p className="dialog__body">
                Needed once, so Google knows which app is asking. Create one under{" "}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Cloud → Credentials
                </a>{" "}
                as an OAuth client ID for a web application, listing this site as
                an authorised JavaScript origin.
              </p>
              <p className="dialog__body dialog__body--muted">
                This is not a secret — every site with a Google button publishes
                its own in the page. The client <em>secret</em> is the sensitive
                one, and this app never asks for it.
              </p>

              <div className="emails__add">
                <input
                  className="input"
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  placeholder="…apps.googleusercontent.com"
                  aria-label="Google client ID"
                />
                <button
                  type="button"
                  className="button"
                  disabled={busy || clientId === config.googleClientId}
                  onClick={() => void send({ googleClientId: clientId })}
                >
                  Save
                </button>
              </div>
            </details>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={config.passwordFallback}
                disabled={busy}
                onChange={(event) => void send({ passwordFallback: event.target.checked })}
              />
              <span>
                <span className="choice__label">Also accept the team password</span>
                <span className="choice__hint">
                  Leave this on until Google sign-in is confirmed working. It is
                  the way back in if the client ID is wrong.
                </span>
              </span>
            </label>
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
