"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { BoardLink } from "@/lib/boards";

/**
 * Settings → Other boards.
 *
 * Where an agency links its brands together. Each entry is another board's
 * address plus, optionally, who should see it: leave the emails empty and
 * everyone on this board gets the switcher entry; list addresses and only
 * those people (signed in with Google) do — which is how a client team stays
 * unaware of the agency's other brands.
 *
 * Configured per board: paste the same list on each board and the switcher
 * works from all of them. Entries pointing at the board you are on are
 * ignored by its own nav, so one identical list is fine everywhere.
 */
export function BoardSettings({ onClose }: { onClose: () => void }) {
  const [boards, setBoards] = useState<BoardLink[] | null>(null);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [emails, setEmails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings/boards")
      .then((r) => r.json() as Promise<{ boards: BoardLink[] }>)
      .then((data) => setBoards(data.boards))
      .catch(() => setError("Could not load the current list."));
  }, []);

  async function send(payload: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/settings/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => ({}))) as {
        boards?: BoardLink[];
        error?: string;
      };

      if (!response.ok || !body.boards) {
        setError(body.error ?? "Could not save that.");
        return false;
      }

      setBoards(body.boards);
      return true;
    } catch {
      setError("Network error — check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (await send({ action: "add", label, url, emails })) {
      setLabel("");
      setUrl("");
      setEmails("");
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
        className="dialog dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="boards-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <h2 className="dialog__title" id="boards-title">
          Other boards
        </h2>

        {error && (
          <p className="field__error field__error--banner" role="alert">
            {error}
          </p>
        )}

        <p className="dialog__body">
          Running boards for more than one brand? Link them here and the brand
          name in the top bar becomes a switcher. Leave &ldquo;who sees
          it&rdquo; empty to show an entry to everyone on this board, or list
          email addresses to show it only to those people when they are signed
          in with Google.
        </p>

        {boards === null ? (
          <p className="dialog__body">Loading…</p>
        ) : (
          <>
            {boards.length > 0 && (
              <ul className="boards">
                {boards.map((board) => (
                  <li key={board.url} className="boards__row">
                    <div className="boards__info">
                      <span className="boards__label">{board.label}</span>
                      <span className="boards__url">{board.url}</span>
                      <span className="boards__who">
                        {board.emails.length === 0
                          ? "Everyone on this board"
                          : `Only: ${board.emails.join(", ")}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="button button--quiet"
                      disabled={busy}
                      onClick={() => void send({ action: "remove", url: board.url })}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form className="dialog__form" onSubmit={add}>
              <label className="field">
                <span className="field__label">Brand name</span>
                <input
                  className="input"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Lucky Golf"
                  disabled={busy}
                />
              </label>
              <label className="field">
                <span className="field__label">Board address</span>
                <input
                  className="input"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://lucky-golf-calendar.example.workers.dev"
                  inputMode="url"
                  disabled={busy}
                />
              </label>
              <label className="field">
                <span className="field__label">Who sees it (optional)</span>
                <input
                  className="input"
                  value={emails}
                  onChange={(event) => setEmails(event.target.value)}
                  placeholder="you@agency.com, partner@agency.com"
                  inputMode="email"
                  disabled={busy}
                />
                <span className="field__hint">
                  Empty = everyone here. Emails only work for people who sign
                  in with Google.
                </span>
              </label>
              <div className="dialog__actions">
                <button
                  type="submit"
                  className="button button--outline"
                  disabled={busy || !label.trim() || !url.trim()}
                >
                  Add board
                </button>
                <button type="button" className="button button--primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
