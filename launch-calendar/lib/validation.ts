import { isValidIso } from "./dates.ts";
import {
  CHANNEL_KEYS,
  CHANNEL_LABELS,
  CHANNEL_PRIORITIES,
  EVENT_STATUSES,
  EVENT_TYPES,
  type ChannelPriority,
  type Channels,
  type EventInput,
  type EventStatus,
  type EventType,
} from "./types.ts";

/**
 * Pure input validation, deliberately free of any I/O so it can be exercised
 * directly by the test suite. `lib/events.ts` is the only caller and applies
 * this before every write.
 */

export type FieldErrors = Partial<Record<string, string>>;

export class ValidationError extends Error {
  fieldErrors: FieldErrors;

  constructor(fieldErrors: FieldErrors) {
    super("The event could not be saved.");
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

/** Raised when an id no longer resolves — usually someone else deleted it. */
export class NotFoundError extends Error {
  constructor() {
    super("That event no longer exists.");
    this.name = "NotFoundError";
  }
}

function asOptionalDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

/**
 * Forces the four channels into a complete, self-consistent shape: every key
 * present, and no priority left on a channel that is not involved.
 */
export function normaliseChannels(raw: unknown): Channels {
  const source = (raw ?? {}) as Record<string, unknown>;
  const result = {} as Channels;

  for (const key of CHANNEL_KEYS) {
    const entry = (source[key] ?? {}) as Record<string, unknown>;
    const involved = entry.involved === true;
    const priority = entry.priority;

    result[key] = {
      involved,
      priority:
        involved && CHANNEL_PRIORITIES.includes(priority as ChannelPriority)
          ? (priority as ChannelPriority)
          : null,
    };
  }

  return result;
}

/**
 * Validates and normalises editor input, returning a row-shaped value ready to
 * write, or throwing `ValidationError` with per-field messages.
 */
export function validateEventInput(
  raw: unknown,
  allowedTypes?: readonly string[],
): EventInput {
  const input = (raw ?? {}) as Record<string, unknown>;
  const errors: FieldErrors = {};

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) errors.name = "Give the event a name.";

  // Checked against the board's configured list when the caller supplies one,
  // since types are editable; the built-in list is the fallback.
  const type = input.type as EventType;
  const allowed = allowedTypes ?? (EVENT_TYPES as readonly string[]);
  if (typeof type !== "string" || !allowed.includes(type)) errors.type = "Choose a type.";

  const status = input.status as EventStatus;
  if (!EVENT_STATUSES.includes(status)) errors.status = "Choose a status.";

  const owner = typeof input.owner === "string" ? input.owner.trim() : "";
  if (!owner) errors.owner = "Name who is accountable for this event.";

  const launch_date =
    typeof input.launch_date === "string" ? input.launch_date : "";
  if (!launch_date) {
    errors.launch_date = "A launch date is required.";
  } else if (!isValidIso(launch_date)) {
    errors.launch_date = "That is not a real date.";
  }

  const optionalDates: Record<string, string | null> = {};
  for (const field of [
    "promo_end_date",
    "inventory_date",
    "asset_deadline",
    "teaser_start",
  ] as const) {
    const value = asOptionalDate(input[field]);
    if (value !== null && !isValidIso(value)) {
      errors[field] = "That is not a real date.";
    }
    optionalDates[field] = value;
  }

  const channels = normaliseChannels(input.channels);
  const involved = CHANNEL_KEYS.filter((key) => channels[key].involved);

  if (involved.length === 0) {
    errors.channels = "At least one channel has to be involved.";
  } else {
    const missingPriority = involved.filter(
      (key) => channels[key].priority === null,
    );
    if (missingPriority.length > 0) {
      const names = missingPriority.map((key) => CHANNEL_LABELS[key]).join(", ");
      errors.channels = `Set a priority for ${names}.`;
    }
  }

  // Ordering checks: a promo that ends before it starts, or a teaser that
  // begins after launch, would render as a reversed span on the calendar.
  if (
    !errors.launch_date &&
    optionalDates.promo_end_date &&
    isValidIso(optionalDates.promo_end_date) &&
    optionalDates.promo_end_date < launch_date
  ) {
    errors.promo_end_date = "The promo cannot end before it launches.";
  }

  if (
    !errors.launch_date &&
    optionalDates.teaser_start &&
    isValidIso(optionalDates.teaser_start) &&
    optionalDates.teaser_start > launch_date
  ) {
    errors.teaser_start = "Teasers have to start on or before launch day.";
  }

  if (Object.keys(errors).length > 0) throw new ValidationError(errors);

  return {
    name,
    type,
    status,
    brief: typeof input.brief === "string" ? input.brief.trim() : "",
    launch_date,
    promo_end_date: optionalDates.promo_end_date,
    inventory_date: optionalDates.inventory_date,
    asset_deadline: optionalDates.asset_deadline,
    teaser_start: optionalDates.teaser_start,
    channels,
    owner,
    notes:
      typeof input.notes === "string" && input.notes.trim() !== ""
        ? input.notes.trim()
        : null,
  };
}

export function validateEditorName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) {
    throw new ValidationError({
      editor: "Set your display name before editing.",
    });
  }
  return name.slice(0, 40);
}

/**
 * "Tour Drop" -> "tour_drop".
 *
 * The key is what events store, so it has to survive the label being renamed
 * later — that is the whole reason the two are kept apart.
 */
export function keyFromLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** Tidies a user-supplied label, or null if it is not usable as one. */
export function cleanLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const label = raw.trim().replace(/\s+/g, " ");
  if (label.length < 2 || label.length > 40) return null;
  return label;
}
