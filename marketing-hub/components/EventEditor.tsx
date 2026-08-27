"use client";

import { useBrand } from "./BrandProvider";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useDisplayName } from "./DisplayName";
import { CloseButton, useCloseGuard } from "./UnsavedGuard";
import { useWorkspace } from "./Workspace";
import {
  emptyChannels,
  CHANNEL_PRIORITIES,
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
  type ChannelPriority,
  type Channels,
  type EventStatus,
  type EventType,
  type LaunchEvent,
} from "@/lib/types";

const BRIEF_PLACEHOLDER =
  "The offer/angle in one sentence — what would a media buyer need to know?";

type FormState = {
  name: string;
  type: EventType;
  status: EventStatus;
  brief: string;
  launch_date: string;
  teaser_start: string;
  asset_deadline: string;
  inventory_date: string;
  promo_end_date: string;
  channels: Channels;
  owner: string;
  notes: string;
  assets_link: string;
};

function toFormState(
  event: LaunchEvent | null,
  defaultLaunchDate: string | null,
  channelKeys: readonly string[],
): FormState {
  return {
    name: event?.name ?? "",
    type: event?.type ?? "product_launch",
    status: event?.status ?? "tentative",
    brief: event?.brief ?? "",
    launch_date: event?.launch_date ?? defaultLaunchDate ?? "",
    teaser_start: event?.teaser_start ?? "",
    asset_deadline: event?.asset_deadline ?? "",
    inventory_date: event?.inventory_date ?? "",
    promo_end_date: event?.promo_end_date ?? "",
    channels: event ? structuredClone(event.channels) : emptyChannels(channelKeys),
    owner: event?.owner ?? "",
    notes: event?.notes ?? "",
    assets_link: event?.assets_link ?? "",
  };
}

const DATE_FIELDS: {
  key: "launch_date" | "teaser_start" | "asset_deadline" | "inventory_date" | "promo_end_date";
  label: string;
  hint: string;
  required?: boolean;
}[] = [
  {
    key: "launch_date",
    label: "Launch date",
    hint: "The anchor date everything works back from.",
    required: true,
  },
  {
    key: "teaser_start",
    label: "Teaser start",
    hint: "When pre-launch comms begin.",
  },
  {
    key: "asset_deadline",
    label: "Asset deadline",
    hint: "Creative and assets due.",
  },
  {
    key: "inventory_date",
    label: "Inventory date",
    hint: "Product in hand.",
  },
  {
    key: "promo_end_date",
    label: "Promo end",
    hint: "For promos and sales.",
  },
];

/**
 * Opens the browser's own date picker.
 *
 * A native date input hides its calendar behind a small icon at the right edge,
 * which is easy to miss — clicking the field itself only puts you in
 * type-the-digits mode. Calling this on click surfaces the calendar from
 * anywhere in the field, which matters most on a phone.
 */
function openNativePicker(input: HTMLInputElement) {
  if (typeof input.showPicker !== "function") return;
  try {
    input.showPicker();
  } catch {
    // Browsers refuse when the call is not tied to a user gesture, and Safari
    // has no picker to show. Typing into the field still works either way.
  }
}

/**
 * What to call each field when something is wrong with it. The server answers
 * with keys; a person needs the words that are actually on the form.
 */
const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  launch_date: "Launch date",
  teaser_start: "Teaser start",
  asset_deadline: "Assets due",
  inventory_date: "Inventory lands",
  promo_end_date: "Promo ends",
  owner: "Owner",
  channels: "Channels",
  type: "Type",
  status: "Status",
  assets_link: "Assets link",
};

/**
 * The order these appear on the form, so a summary reads top to bottom like
 * the page does. Keep in step with the JSX below; the `data-field` markers on
 * each container are what the scroll actually follows.
 */
const FIELD_ORDER = [
  "name",
  "launch_date",
  "channels",
  "owner",
  "type",
  "status",
  "teaser_start",
  "asset_deadline",
  "inventory_date",
  "promo_end_date",
  "assets_link",
] as const;

/** Why a save did not happen, in the words of the thing that stopped it. */
function reasonFor(status: number, serverMessage: string | undefined, fallback: string): string {
  if (serverMessage) return serverMessage;
  if (status === 401 || status === 403) {
    return "You are not signed in any more. Reload the page and sign in again — nothing here is lost.";
  }
  if (status === 404) {
    return "This board could not be reached. Reload the page; if it keeps happening, tell Mobius.";
  }
  if (status >= 500) {
    return "The server could not save this. Nothing was changed — try again in a moment.";
  }
  return fallback;
}

export function EventEditor({
  event,
  defaultLaunchDate = null,
  onClose,
  onSaved,
}: {
  event: LaunchEvent | null;
  defaultLaunchDate?: string | null;
  onClose: () => void;
  onSaved: (event: LaunchEvent, deleted: boolean) => void;
}) {
  const { path } = useBrand();
  const { ensureName } = useDisplayName();
  const { eventTypes, channelOptions } = useWorkspace();
  const [form, setForm] = useState<FormState>(() =>
    toFormState(
      event,
      defaultLaunchDate,
      channelOptions.map((option) => option.key),
    ),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const isNew = event === null;

  const missingFields = FIELD_ORDER.filter((key) => fieldErrors[key]);

  /**
   * The form as it was when the sheet opened. Captured on the first render —
   * `form` is still the initial state at that moment — so "changed" means
   * changed by the person, not merely different from the event row.
   */
  const openedAsRef = useRef<string | null>(null);
  if (openedAsRef.current === null) openedAsRef.current = JSON.stringify(form);
  const dirty = JSON.stringify(form) !== openedAsRef.current;

  const { requestClose, prompt } = useCloseGuard(dirty, onClose);

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    firstFieldRef.current?.focus();

    return () => {
      returnFocusRef.current?.focus?.();
    };
  }, []);

  /*
   * A refused save used to say only that it was refused. The form is taller
   * than the sheet, so whatever was wrong could be well below the fold with
   * nothing to say where. Now the first bad field is brought into view and
   * focused, and the banner above stays put while you fix it.
   */
  useEffect(() => {
    if (Object.keys(fieldErrors).length === 0) return;
    /*
     * Found by the `data-field` marker on each container rather than by
     * hunting for an error message: Channels is a group, not a labelled
     * input, so looking inside a `.field` located nothing to focus and left
     * the reader where they were.
     */
    // Worked out here rather than taken from `missingFields`: that array is
    // rebuilt every render, so depending on it re-ran this on renders where
    // nothing had failed — re-scrolling and stealing focus as you typed.
    const firstKey = FIELD_ORDER.find((key) => fieldErrors[key]);
    const first = panelRef.current?.querySelector<HTMLElement>(
      `[data-field="${firstKey}"]`,
    );
    if (!firstKey || !first) return;

    /*
     * Deliberately not `behavior: "smooth"`. It is a no-op in some engines and
     * is ignored outright for anyone who has asked for reduced motion, and a
     * scroll that silently does not happen is exactly the bug being fixed
     * here — the reader is told a field is wrong and left nowhere near it.
     * Landing there immediately is also the kinder behaviour: nobody wants to
     * watch a long form slide past on the way to their mistake.
     */
    first.scrollIntoView({ block: "center" });
    // The scroll above has already put it on screen; focus must not re-do it.
    first.querySelector<HTMLElement>("input, select, textarea")?.focus({
      preventScroll: true,
    });
  }, [fieldErrors]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setChannel(key: string, involved: boolean, priority: ChannelPriority | null) {
    setForm((current) => ({
      ...current,
      channels: { ...current.channels, [key]: { involved, priority } },
    }));
  }

  /** Keeps Tab inside the panel while it is open. */
  function handleKeyDown(keyEvent: React.KeyboardEvent) {
    if (keyEvent.key === "Escape") {
      keyEvent.stopPropagation();
      requestClose();
      return;
    }

    if (keyEvent.key !== "Tab" || !panelRef.current) return;

    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
    );
    const visible = Array.from(focusable).filter((node) => !node.hasAttribute("disabled"));
    if (visible.length === 0) return;

    const first = visible[0];
    const last = visible[visible.length - 1];

    if (keyEvent.shiftKey && document.activeElement === first) {
      keyEvent.preventDefault();
      last.focus();
    } else if (!keyEvent.shiftKey && document.activeElement === last) {
      keyEvent.preventDefault();
      first.focus();
    }
  }

  async function withEditor(
    action: (editor: string) => Promise<Response>,
    fallbackMessage: string,
  ): Promise<{ event?: LaunchEvent; ok: boolean }> {
    const editor = await ensureName();
    if (!editor) {
      setFormError("Set your name before saving — edits are attributed.");
      return { ok: false };
    }

    setBusy(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const response = await action(editor);
      const body = (await response.json().catch(() => ({}))) as {
        event?: LaunchEvent;
        error?: string;
        fieldErrors?: Record<string, string>;
      };

      if (!response.ok) {
        const fields = body.fieldErrors ?? {};
        setFieldErrors(fields);
        // With field errors the banner lists them instead; a server message
        // here would only repeat what each field already says.
        setFormError(
          Object.keys(fields).length > 0
            ? null
            : reasonFor(response.status, body.error, fallbackMessage),
        );
        return { ok: false };
      }

      return { event: body.event, ok: true };
    } catch {
      setFormError(
        "No connection — your change was not saved. It is still on this form, so try again once you are back online.",
      );
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(submitEvent: FormEvent) {
    submitEvent.preventDefault();

    const payload = {
      ...form,
      teaser_start: form.teaser_start || null,
      asset_deadline: form.asset_deadline || null,
      inventory_date: form.inventory_date || null,
      promo_end_date: form.promo_end_date || null,
      notes: form.notes || null,
      assets_link: form.assets_link || null,
    };

    const result = await withEditor(
      (editor) =>
        // path(): without it these go to /api/events, which is nobody's board
        // and does not exist — so creating, and saving an edit, 404'd on every
        // brand. Every other call in this file was already scoped; these two
        // were missed in the move to one deployment per many boards.
        fetch(path(isNew ? "/api/events" : `/api/events/${event.id}`), {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: payload, editor }),
        }),
      "Could not save this event.",
    );

    if (result.ok && result.event) onSaved(result.event, false);
  }

  async function handleCancelEvent() {
    if (!event) return;

    const result = await withEditor(
      (editor) =>
        fetch(path(`/api/events/${event.id}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent: "cancel", editor }),
        }),
      "Could not cancel this event.",
    );

    if (result.ok && result.event) onSaved(result.event, false);
  }

  async function handleDelete() {
    if (!event) return;

    const result = await withEditor(
      (editor) =>
        fetch(
          path(`/api/events/${event.id}?editor=${encodeURIComponent(editor)}`),
          { method: "DELETE" },
        ),
      "Could not delete this event.",
    );

    if (result.ok) onSaved(event, true);
  }

  return (
    <div
      className="scrim scrim--right"
      role="presentation"
      onClick={(clickEvent) => {
        if (clickEvent.target === clickEvent.currentTarget) requestClose();
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
        ref={panelRef}
        onKeyDown={handleKeyDown}
      >
        <header className="sheet__header">
          <h2 className="sheet__title" id="editor-title">
            {isNew ? "New event" : "Edit event"}
          </h2>
          <CloseButton onClose={requestClose} label="Close editor" />
        </header>

        <form className="sheet__body" onSubmit={handleSubmit} id="event-form">
          {(formError || missingFields.length > 0) && (
            <div className="error-banner" role="alert">
              {missingFields.length > 0 ? (
                <>
                  <strong>
                    {missingFields.length === 1
                      ? "One field needs your attention"
                      : `${missingFields.length} fields need your attention`}
                  </strong>
                  <span className="error-banner__fields">
                    {missingFields.map((key) => FIELD_LABELS[key] ?? key).join(" · ")}
                  </span>
                </>
              ) : (
                formError
              )}
            </div>
          )}

          <div className="field" data-field="name">
            <label className="field__label" htmlFor="event-name">
              Name <span className="field__required">*</span>
            </label>
            <input
              id="event-name"
              ref={firstFieldRef}
              className={`input${fieldErrors.name ? " input--invalid" : ""}`}
              value={form.name}
              onChange={(changeEvent) => set("name", changeEvent.target.value)}
              placeholder="e.g. Spring Collection Restock"
              maxLength={120}
            />
            {fieldErrors.name && <p className="field__error">{fieldErrors.name}</p>}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="event-brief">
              Brief
            </label>
            <textarea
              id="event-brief"
              className="textarea"
              value={form.brief}
              onChange={(changeEvent) => set("brief", changeEvent.target.value)}
              placeholder={BRIEF_PLACEHOLDER}
              rows={2}
              maxLength={280}
            />
          </div>

          <div className="date-grid date-grid--single">
              {DATE_FIELDS.filter((field) => field.key === "launch_date").map((field) => (
                <div className="field" data-field={field.key} key={field.key}>
                  <label className="field__label" htmlFor={`event-${field.key}`}>
                    {field.label}
                    {field.required && <span className="field__required"> *</span>}
                  </label>
                  <input
                    id={`event-${field.key}`}
                    type="date"
                    className={`input input--date${fieldErrors[field.key] ? " input--invalid" : ""}`}
                    value={form[field.key]}
                    onChange={(changeEvent) =>
                      set(field.key, changeEvent.target.value)
                    }
                    onClick={(clickEvent) =>
                      openNativePicker(clickEvent.currentTarget)
                    }
                  />
                  {fieldErrors[field.key] ? (
                    <p className="field__error">{fieldErrors[field.key]}</p>
                  ) : (
                    <p className="field__hint">{field.hint}</p>
                  )}
                </div>
              ))}
            </div>

          <div className="fieldset" data-field="channels" role="group" aria-labelledby="channels-legend">
            <span className="fieldset__legend" id="channels-legend">
              Channels <span className="field__required">*</span>
            </span>
            <p className="field__hint">
              Primary = this channel builds something. Supporting = helps but is not
              the lead. FYI = just needs to know.
            </p>
            {fieldErrors.channels && (
              <p className="field__error">{fieldErrors.channels}</p>
            )}

            <div className="channel-rows">
              {channelOptions.map(({ key, label }) => {
                const state = form.channels[key] ?? { involved: false, priority: null };
                return (
                  <div className="channel-row" key={key}>
                    <label className="channel-row__toggle">
                      <input
                        type="checkbox"
                        checked={state.involved}
                        onChange={(changeEvent) =>
                          setChannel(
                            key,
                            changeEvent.target.checked,
                            changeEvent.target.checked
                              ? (state.priority ?? "supporting")
                              : null,
                          )
                        }
                      />
                      <span>{label}</span>
                    </label>

                    <select
                      className="select select--compact"
                      value={state.priority ?? ""}
                      disabled={!state.involved}
                      aria-label={`${label} priority`}
                      onChange={(changeEvent) =>
                        setChannel(
                          key,
                          true,
                          changeEvent.target.value as ChannelPriority,
                        )
                      }
                    >
                      {!state.involved && <option value="">—</option>}
                      {CHANNEL_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="field" data-field="owner">
            <label className="field__label" htmlFor="event-owner">
              Owner <span className="field__required">*</span>
            </label>
            <input
              id="event-owner"
              className={`input${fieldErrors.owner ? " input--invalid" : ""}`}
              value={form.owner}
              onChange={(changeEvent) => set("owner", changeEvent.target.value)}
              placeholder="Who keeps this event's info current"
              maxLength={80}
            />
            {fieldErrors.owner && <p className="field__error">{fieldErrors.owner}</p>}
          </div>

          <div className="field-row">
            <div className="field" data-field="type">
              <label className="field__label" htmlFor="event-type">
                Type <span className="field__required">*</span>
              </label>
              <select
                id="event-type"
                className={`select${fieldErrors.type ? " select--invalid" : ""}`}
                value={form.type}
                onChange={(changeEvent) =>
                  set("type", changeEvent.target.value as EventType)
                }
              >
                {eventTypes.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
                {/* An event created under a type that has since been removed
                    keeps its value rather than silently switching to another. */}
                {!eventTypes.some((option) => option.key === form.type) && form.type && (
                  <option value={form.type}>{form.type}</option>
                )}
              </select>
              {fieldErrors.type && <p className="field__error">{fieldErrors.type}</p>}
            </div>

            <div className="field" data-field="status">
              <label className="field__label" htmlFor="event-status">
                Status <span className="field__required">*</span>
              </label>
              <select
                id="event-status"
                className={`select${fieldErrors.status ? " select--invalid" : ""}`}
                value={form.status}
                onChange={(changeEvent) =>
                  set("status", changeEvent.target.value as EventStatus)
                }
              >
                {EVENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {EVENT_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
              {fieldErrors.status && (
                <p className="field__error">{fieldErrors.status}</p>
              )}
            </div>
          </div>

          <div className="fieldset" role="group" aria-labelledby="runup-legend">
            <span className="fieldset__legend" id="runup-legend">
              Run-up dates (optional)
            </span>
            <p className="field__hint">
              These drive the milestones channels work back from.
            </p>
            <div className="date-grid">
              {DATE_FIELDS.filter((field) => field.key !== "launch_date").map((field) => (
                <div className="field" key={field.key}>
                  <label className="field__label" htmlFor={`event-${field.key}`}>
                    {field.label}
                    {field.required && <span className="field__required"> *</span>}
                  </label>
                  <input
                    id={`event-${field.key}`}
                    type="date"
                    className={`input input--date${fieldErrors[field.key] ? " input--invalid" : ""}`}
                    value={form[field.key]}
                    onChange={(changeEvent) =>
                      set(field.key, changeEvent.target.value)
                    }
                    onClick={(clickEvent) =>
                      openNativePicker(clickEvent.currentTarget)
                    }
                  />
                  {fieldErrors[field.key] ? (
                    <p className="field__error">{fieldErrors[field.key]}</p>
                  ) : (
                    <p className="field__hint">{field.hint}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* One link, not many: a folder holds the rest. Filling it in is what
              tells Slack the assets have landed, which is why it is a field and
              not a line in the notes — a note edit cannot be told from a typo. */}
          <div className="field" data-field="assets_link">
            <label className="field__label" htmlFor="event-assets-link">
              Assets link
            </label>
            <input
              id="event-assets-link"
              type="url"
              inputMode="url"
              className={`input${fieldErrors.assets_link ? " input--invalid" : ""}`}
              value={form.assets_link}
              onChange={(changeEvent) => set("assets_link", changeEvent.target.value)}
              placeholder="Drive or Dropbox folder with the finished photos, video, copy…"
              maxLength={2000}
            />
            {fieldErrors.assets_link ? (
              <p className="field__error">{fieldErrors.assets_link}</p>
            ) : (
              <p className="field__hint">
                Add it once the assets are ready — every channel on this event is
                told, with a button straight to the folder.
              </p>
            )}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="event-notes">
              Notes
            </label>
            <textarea
              id="event-notes"
              className="textarea"
              value={form.notes}
              onChange={(changeEvent) => set("notes", changeEvent.target.value)}
              placeholder="Freeform detail, links to briefs or docs."
              rows={3}
            />
            <p className="field__hint">
              The place to say why — “customs is slow, may slip a week”. Travels
              with every Slack message about this event, and writing or changing
              it is a notification in its own right.
            </p>
          </div>

          {!isNew && (
            <div className="danger-zone">
              {!confirmingCancel ? (
                <button
                  type="button"
                  className="button button--danger"
                  onClick={() => setConfirmingCancel(true)}
                  disabled={busy || event.status === "cancelled"}
                >
                  {event.status === "cancelled" ? "Already cancelled" : "Cancel event"}
                </button>
              ) : (
                <div className="danger-zone__confirm">
                  <p className="field__hint">
                    Cancelling hides this event from the planning views. Its
                    history stays in the changelog.
                  </p>
                  <div className="danger-zone__actions">
                    <button
                      type="button"
                      className="button button--quiet"
                      onClick={() => setConfirmingCancel(false)}
                    >
                      Keep it
                    </button>
                    <button
                      type="button"
                      className="button button--danger"
                      onClick={handleCancelEvent}
                      disabled={busy}
                    >
                      Cancel this event
                    </button>
                  </div>
                </div>
              )}

              <details className="danger-zone__admin">
                <summary>Admin</summary>
                {!confirmingDelete ? (
                  <button
                    type="button"
                    className="button button--quiet"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete permanently
                  </button>
                ) : (
                  <div className="danger-zone__confirm">
                    <p className="field__hint">
                      This removes the row for good. Prefer cancelling — deletion
                      cannot be undone.
                    </p>
                    <div className="danger-zone__actions">
                      <button
                        type="button"
                        className="button button--quiet"
                        onClick={() => setConfirmingDelete(false)}
                      >
                        Keep it
                      </button>
                      <button
                        type="button"
                        className="button button--danger"
                        onClick={handleDelete}
                        disabled={busy}
                      >
                        Delete permanently
                      </button>
                    </div>
                  </div>
                )}
              </details>
            </div>
          )}
        </form>

        <footer className="sheet__footer">
          <button type="button" className="button button--quiet" onClick={requestClose}>
            Discard
          </button>
          <button
            type="submit"
            form="event-form"
            className="button button--primary"
            disabled={busy}
          >
            {busy ? "Saving…" : isNew ? "Create event" : "Save changes"}
          </button>
        </footer>

        {prompt}
      </div>
    </div>
  );
}
