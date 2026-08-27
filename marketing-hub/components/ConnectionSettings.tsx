"use client";

import { useEffect, useState } from "react";
import { CloseButton, useCloseGuard } from "./UnsavedGuard";

/**
 * The two accounts every board borrows: the Google app people sign in
 * through, and the Slack app that posts their notices.
 *
 * Both belong to Mobius, not to any client, so they are set once here rather
 * than pasted into each client's own settings where their team could read,
 * replace or clear them. A board is left with the decisions that are actually
 * its own — which Slack channel hears about which marketing channel.
 *
 * The token is write-only from here: what comes back is a masked hint, enough
 * to recognize which one is in place and never enough to use.
 */

type State = {
  googleClientId: string;
  slackTokenHint: string;
  slackConnected: boolean;
  note?: string;
};

export function ConnectionSettings({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [clientId, setClientId] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A client ID edited but not saved, or a token pasted but not connected.
  const dirty = Boolean(token.trim()) || (state !== null && clientId !== state.googleClientId);
  const { requestClose, prompt } = useCloseGuard(dirty, onClose);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json() as Promise<State>)
      .then((body) => {
        setState(body);
        setClientId(body.googleClientId);
      })
      .catch(() => setError("Could not load the connections."));
  }, []);

  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setNote(null);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as State & { error?: string };

      if (!response.ok) {
        setError(body.error ?? "Could not save that.");
        return false;
      }

      setState(body);
      setClientId(body.googleClientId);
      if (body.note) setNote(body.note);
      return true;
    } catch {
      setError("Network error — check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveToken() {
    if (await send({ action: "slack-token", token })) setToken("");
  }

  return (
    <div
      className="scrim"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        className="dialog dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connections-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") requestClose();
        }}
      >
        <header className="dialog__head">
          <h2 className="dialog__title" id="connections-title">
            Connections
          </h2>
          <CloseButton onClose={requestClose} />
        </header>
        <p className="dialog__body">
          Mobius&apos;s own Google and Slack apps, shared by every client board.
          Set once, here — no client ever sees these.
        </p>

        {error && (
          <p className="field__error field__error--banner" role="alert">
            {error}
          </p>
        )}
        {note && (
          <p className="dialog__note" role="status">
            {note}
          </p>
        )}

        {!state ? (
          <p className="dialog__body">Loading…</p>
        ) : (
          <>
            <hr className="dialog__rule" />

            <h3 className="dialog__section">
              Google sign-in
              <span className="disclose__state">
                {state.googleClientId ? "connected" : "not connected"}
              </span>
            </h3>
            <p className="dialog__body">
              So Google knows which app is asking. Create one under{" "}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
              >
                Google Cloud → Credentials
              </a>{" "}
              as an OAuth client ID for a web application, listing this site as
              an authorized JavaScript origin.
            </p>
            <p className="dialog__body dialog__body--muted">
              This one is not a secret — every site with a Google button
              publishes its own in the page. The client <em>secret</em> is the
              sensitive one, and this app never asks for it.
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
                disabled={busy || clientId === state.googleClientId}
                onClick={() => void send({ action: "google-client-id", googleClientId: clientId })}
              >
                Save
              </button>
            </div>

            <hr className="dialog__rule" />

            <h3 className="dialog__section">
              Slack
              <span className="disclose__state">
                {state.slackConnected
                  ? `connected · ${state.slackTokenHint}`
                  : "not connected"}
              </span>
            </h3>
            <p className="dialog__body">
              From the Slack app&apos;s <strong>OAuth &amp; Permissions</strong>{" "}
              page — the <em>Bot User OAuth Token</em>, starting{" "}
              <code>xoxb-</code>. It needs the <code>chat:write</code>,{" "}
              <code>channels:read</code> and <code>groups:read</code> scopes, and
              the bot has to be invited to each channel it should post in
              (<code>/invite @your-bot</code>).
            </p>

            <div className="emails__add">
              <input
                className="input"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="xoxb-…"
                aria-label="Slack bot token"
                autoComplete="off"
              />
              <button
                type="button"
                className="button"
                disabled={busy || !token.trim()}
                onClick={() => void saveToken()}
              >
                {busy ? "Checking…" : "Connect"}
              </button>
            </div>

            {state.slackConnected && (
              <>
                <p className="dialog__body dialog__body--muted">
                  A token is in place. Connecting a new one replaces it for
                  every client at once — each board keeps its own channel
                  mapping.
                </p>
                {/* Its own button rather than "save an empty box", because it
                    silences every client's notifications at once. */}
                <button
                  type="button"
                  className="button button--quiet button--small"
                  disabled={busy}
                  onClick={() => void send({ action: "slack-token", token: "" })}
                >
                  Disconnect Slack
                </button>
              </>
            )}
          </>
        )}

        <div className="dialog__actions">
          <button type="button" className="button button--primary" onClick={requestClose}>
            Done
          </button>
        </div>

        {prompt}
      </div>
    </div>
  );
}
