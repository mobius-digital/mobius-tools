"use client";

import { useBrand } from "./BrandProvider";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useDisplayName } from "./DisplayName";
import { announceBoardConfigChange } from "@/lib/boardConfigEvents";
import { useReportDirty } from "./UnsavedGuard";
import { STAGE_COLORS, type StageColor, type StageOption } from "@/lib/types";
import { ChevronDownIcon, CheckIcon } from "./Icons";

/**
 * The board's stages, editable: the columns of the Board and the hue of
 * every chip on the calendar.
 *
 * Renaming changes the label only; events keep the underlying key. Removing
 * a stage that live events still sit in is refused rather than silently
 * reassigning somebody's launches. Order is the Board's column order.
 */

type Payload = {
  stages: StageOption[];
  usage: Record<string, number>;
};

const COLOR_NAMES: Record<StageColor, string> = {
  gray: "Gray",
  blue: "Blue",
  teal: "Teal",
  green: "Green",
  amber: "Amber",
  orange: "Orange",
  rose: "Rose",
  violet: "Violet",
};

export function StagesPanel() {
  const { path } = useBrand();
  const { ensureName } = useDisplayName();
  const [data, setData] = useState<Payload | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(path("/api/settings/stages"))
      .then((r) => r.json() as Promise<Payload>)
      .then(setData)
      .catch(() => setError("Could not load the current stages."));
  }, [path]);

  const send = useCallback(
    async (payload: Record<string, unknown>) => {
      const editor = await ensureName();
      if (!editor) return false;

      setBusy(true);
      setError(null);

      try {
        const response = await fetch(path("/api/settings/stages"), {
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
        announceBoardConfigChange();
        return true;
      } catch {
        setError("Network error. Check your connection and try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [ensureName, path],
  );

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!newLabel.trim()) return;
    if (await send({ action: "add", label: newLabel })) setNewLabel("");
  }

  useReportDirty("stages", Boolean(newLabel.trim()) || editingKey !== null);

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
        A stage is where a launch is in its prep: briefed, waiting on assets,
        built, scheduled. They are the columns of the Board, in this order, and
        the color of every chip on the calendar. Name them the way your team
        talks.
      </p>

      {!data ? (
        <p className="dialog__body">Loading</p>
      ) : (
        <>
          <ul className="stages">
            {data.stages.map((stage, index) => {
              const used = data.usage[stage.key] ?? 0;

              return (
                <li key={stage.key} className={`stages__row stage-${stage.color}`}>
                  <div className="stages__order">
                    <button
                      type="button"
                      className="stages__move"
                      disabled={busy || index === 0}
                      aria-label={`Move ${stage.label} up`}
                      onClick={() => void send({ action: "move", key: stage.key, direction: "up" })}
                    >
                      <ChevronDownIcon className="stages__up" />
                    </button>
                    <button
                      type="button"
                      className="stages__move"
                      disabled={busy || index === data.stages.length - 1}
                      aria-label={`Move ${stage.label} down`}
                      onClick={() => void send({ action: "move", key: stage.key, direction: "down" })}
                    >
                      <ChevronDownIcon />
                    </button>
                  </div>

                  <span className="stage-dot stage-dot--lg" aria-hidden />

                  {editingKey === stage.key ? (
                    <>
                      <input
                        className="input"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        aria-label={`Rename ${stage.label}`}
                        autoFocus
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void saveRename(stage.key);
                          if (event.key === "Escape") setEditingKey(null);
                        }}
                      />
                      <button
                        type="button"
                        className="button button--small"
                        disabled={busy}
                        onClick={() => void saveRename(stage.key)}
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
                      <span className="stages__label">
                        {stage.label}
                        <span className="types__usage">
                          {used === 0 ? "empty" : `${used} ${used === 1 ? "launch" : "launches"}`}
                        </span>
                      </span>

                      <div className="stages__colors" role="group" aria-label={`Color for ${stage.label}`}>
                        {STAGE_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={`stages__swatch stage-${color}${color === stage.color ? " stages__swatch--on" : ""}`}
                            title={COLOR_NAMES[color]}
                            aria-label={COLOR_NAMES[color]}
                            aria-pressed={color === stage.color}
                            disabled={busy}
                            onClick={() => void send({ action: "recolor", key: stage.key, color })}
                          >
                            {color === stage.color && <CheckIcon />}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        className="button button--small"
                        disabled={busy}
                        onClick={() => {
                          setDraft(stage.label);
                          setEditingKey(stage.key);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="button button--small button--danger"
                        disabled={busy || used > 0 || data.stages.length <= 1}
                        title={used > 0 ? "Move these launches to another stage first" : undefined}
                        onClick={() => void send({ action: "remove", key: stage.key })}
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
              placeholder="e.g. Waiting on photo shoot"
              aria-label="New stage"
              maxLength={40}
            />
            <button type="submit" className="button" disabled={busy || !newLabel.trim()}>
              Add
            </button>
          </form>

          <p className="dialog__body dialog__body--muted">
            Renaming is safe: launches already in a stage follow the new name. A
            stage with launches in it cannot be removed until they are moved.
          </p>
        </>
      )}
    </>
  );
}
