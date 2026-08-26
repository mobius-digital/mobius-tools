"use client";

import { useBrand } from "./BrandProvider";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useDisplayName } from "./DisplayName";
import { announceBoardConfigChange } from "@/lib/boardConfigEvents";
import { useReportDirty } from "./UnsavedGuard";

/**
 * The board's marketing channels, editable.
 *
 * Unlike event types, the app branches on channels — the filter bar, "what's
 * mine" elevation, clash warnings and the Slack mapping all read this list. So
 * what a board edits is the *set*; the shape of a channel (a key, a label, a
 * priority from the fixed three) stays put. Adding one here gives it a filter
 * chip, a row in the event editor and a Slack mapping row straight away.
 *
 * Renaming changes the label only; events, the Slack mapping and saved filters
 * hold the key, so a rename never orphans anything. Removing a channel that
 * events still involve is refused rather than silently dropping it from them.
 */

type Payload = {
  channels: { key: string; label: string }[];
  usage: Record<string, number>;
};

export function ChannelsPanel() {
  const { path } = useBrand();
  const { ensureName } = useDisplayName();
  const [data, setData] = useState<Payload | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(path("/api/settings/channels"))
      .then((r) => r.json() as Promise<Payload>)
      .then(setData)
      .catch(() => setError("Could not load the current channels."));
  }, []);

  const send = useCallback(
    async (payload: Record<string, unknown>) => {
      const editor = await ensureName();
      if (!editor) return false;

      setBusy(true);
      setError(null);

      try {
        const response = await fetch(path("/api/settings/channels"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, editor }),
        });

        const body = (await response.json().catch(() => ({}))) as Payload & {
          error?: string;
        };

        if (!response.ok) {
          setError(body.error ?? "Could not save that.");
          return false;
        }

        setData(body);
        // The board is outside this dialog; tell it so the new list is on the
        // New event form and the filter bar before this dialog even closes.
        announceBoardConfigChange();
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

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!newLabel.trim()) return;
    if (await send({ action: "add", label: newLabel })) setNewLabel("");
  }

  useReportDirty("channels", Boolean(newLabel.trim()) || editingKey !== null);

  async function saveRename(key: string) {
    if (await send({ action: "rename", key, label: draft })) setEditingKey(null);
  }

  return (
    <>
      {error && (
        <p className="field__error field__error--banner" role="alert">
          {error}
        </p>
      )}

      <p className="dialog__body">
        The marketing channels this board plans around. Each one gets a filter
        chip, a row on every event, and its own Slack channel to notify.
        Priority — primary, supporting, FYI — stays the same for all of them.
      </p>

      {!data ? (
        <p className="dialog__body">Loading…</p>
      ) : (
        <>
          <ul className="emails">
            {data.channels.map((type) => {
              const used = data.usage[type.key] ?? 0;

              return (
                <li key={type.key} className="emails__row">
                  {editingKey === type.key ? (
                    <>
                      <input
                        className="input"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        aria-label={`Rename ${type.label}`}
                        autoFocus
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void saveRename(type.key);
                          if (event.key === "Escape") setEditingKey(null);
                        }}
                      />
                      <button
                        type="button"
                        className="button button--small"
                        disabled={busy}
                        onClick={() => void saveRename(type.key)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="button button--quiet button--small"
                        onClick={() => setEditingKey(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="emails__address">
                        {type.label}
                        <span className="types__usage">
                          {used === 0
                            ? "no events"
                            : `${used} event${used === 1 ? "" : "s"}`}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="button button--small"
                        disabled={busy}
                        onClick={() => {
                          setDraft(type.label);
                          setEditingKey(type.key);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="button button--small button--danger"
                        disabled={busy || used > 0 || data.channels.length <= 1}
                        title={
                          used > 0
                            ? "Take this channel off those events first"
                            : undefined
                        }
                        onClick={() => void send({ action: "remove", key: type.key })}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          <form className="emails__add" onSubmit={add}>
            <input
              className="input"
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder="e.g. Affiliate"
              aria-label="New channel"
              maxLength={40}
            />
            <button type="submit" className="button" disabled={busy || !newLabel.trim()}>
              Add
            </button>
          </form>

          <p className="dialog__body dialog__body--muted">
            Renaming is safe — events, the Slack mapping and saved filters all
            follow the new name. A channel that events still involve cannot be
            removed until they are taken off it. Removing one also clears its
            Slack mapping.
          </p>
        </>
      )}
    </>
  );
}
