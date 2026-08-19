"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useDisplayName } from "./DisplayName";
import { announceBoardConfigChange } from "@/lib/boardConfigEvents";

/**
 * The board's event types, editable.
 *
 * Type is the only field on an event that is purely a label — nothing branches
 * on it — which is why this is safe to open up when status and channel are not.
 *
 * Renaming changes the label only; events keep the underlying key, so a rename
 * never orphans anything already on the board. Removing a type that is still in
 * use is refused rather than silently reassigning somebody's events.
 */

type Payload = {
  types: { key: string; label: string }[];
  usage: Record<string, number>;
};

export function EventTypeSettings({ onClose }: { onClose: () => void }) {
  const { ensureName } = useDisplayName();
  const [data, setData] = useState<Payload | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings/types")
      .then((r) => r.json() as Promise<Payload>)
      .then(setData)
      .catch(() => setError("Could not load the current types."));
  }, []);

  const send = useCallback(
    async (payload: Record<string, unknown>) => {
      const editor = await ensureName();
      if (!editor) return false;

      setBusy(true);
      setError(null);

      try {
        const response = await fetch("/api/settings/types", {
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

  async function saveRename(key: string) {
    if (await send({ action: "rename", key, label: draft })) setEditingKey(null);
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
        aria-labelledby="types-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <h2 className="dialog__title" id="types-title">
          Event types
        </h2>

        {error && (
          <p className="field__error field__error--banner" role="alert">
            {error}
          </p>
        )}

        <p className="dialog__body">
          These are the options in the Type dropdown. They are labels for reading
          the board at a glance — nothing in the app behaves differently because
          of them, so name them however your team talks.
        </p>

        {!data ? (
          <p className="dialog__body">Loading…</p>
        ) : (
          <>
            <ul className="emails">
              {data.types.map((type) => {
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
                              ? "unused"
                              : `${used} event${used === 1 ? "" : "s"}`}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="button button--quiet button--small"
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
                          className="button button--quiet button--small"
                          disabled={busy || used > 0 || data.types.length <= 1}
                          title={
                            used > 0
                              ? "Change these events to another type first"
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
                placeholder="e.g. Tour Drop"
                aria-label="New event type"
                maxLength={40}
              />
              <button type="submit" className="button" disabled={busy || !newLabel.trim()}>
                Add
              </button>
            </form>

            <p className="dialog__body dialog__body--muted">
              Renaming is safe — events already using a type follow the new name.
              A type in use cannot be removed until those events are moved.
            </p>
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
