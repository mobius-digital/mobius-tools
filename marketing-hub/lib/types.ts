export const EVENT_TYPES = [
  "product_launch",
  "promo",
  "restock",
  "content_moment",
  "evergreen_push",
  "other",
] as const;

/**
 * Type is a free label, not an enum.
 *
 * Boards can define their own — a golf brand wants "Tour Drop", not
 * "Content Moment" — so this cannot be a closed union. Nothing branches on the
 * value; it exists to be read. Status and channel stay closed unions precisely
 * because they do drive behavior.
 */
export type EventType = string;

export const EVENT_STATUSES = [
  "confirmed",
  "tentative",
  "at_risk",
  "completed",
  "cancelled",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

/**
 * The channels a fresh board starts with.
 *
 * Channels used to be a closed union, because the app branches on them — the
 * filter bar, "what's mine" elevation, clash detection, the Slack mapping. They
 * still drive all of that, but the *set* is now per board, edited from Settings
 * and stored beside the event types. What stays fixed is the shape: every
 * channel is a stable key plus a label, and every event carries a state for
 * every configured key. Priority stays a closed union — it is what the app
 * actually branches on.
 */
export const CHANNEL_KEYS = ["paid", "email", "organic", "sms"] as const;

/** A channel key. Free-form because boards define their own; see above. */
export type ChannelKey = string;

/** One configurable channel: a stable key stored on events, and a label. */
export type ChannelOption = { key: string; label: string };

export const CHANNEL_PRIORITIES = ["primary", "supporting", "fyi"] as const;

export type ChannelPriority = (typeof CHANNEL_PRIORITIES)[number];

export type ChannelState = {
  involved: boolean;
  priority: ChannelPriority | null;
};

export type Channels = Record<ChannelKey, ChannelState>;

/** A complete, all-uninvolved channel map for the given keys, in that order. */
export function emptyChannels(keys: readonly string[]): Channels {
  const result: Channels = {};
  for (const key of keys) result[key] = { involved: false, priority: null };
  return result;
}

/**
 * Fills in any configured channel an event was saved without, and drops any
 * it carries that the board no longer has, so every reader sees the same
 * complete shape in the configured order. Pure; applied on every read.
 */
export function hydrateChannels(channels: Channels, keys: readonly string[]): Channels {
  const result: Channels = {};
  for (const key of keys) {
    result[key] = channels[key] ?? { involved: false, priority: null };
  }
  return result;
}

/** The five date columns, in the order they appear on a card. */
export const DATE_FIELDS = [
  "launch_date",
  "promo_end_date",
  "inventory_date",
  "asset_deadline",
  "teaser_start",
] as const;

export type DateField = (typeof DATE_FIELDS)[number];

/**
 * Dates are `YYYY-MM-DD` strings end to end — never `Date` objects — so that a
 * viewer west of UTC cannot see a launch slide a day backwards. See
 * `lib/dates.ts` for the arithmetic helpers that operate on this shape.
 */
export type IsoDate = string;

export type LaunchEvent = {
  id: string;
  name: string;
  type: EventType;
  status: EventStatus;
  brief: string;
  launch_date: IsoDate;
  promo_end_date: IsoDate | null;
  inventory_date: IsoDate | null;
  asset_deadline: IsoDate | null;
  teaser_start: IsoDate | null;
  channels: Channels;
  owner: string;
  notes: string | null;
  /** Where the finished assets live — a folder link. Filling it in is news. */
  assets_link: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string;
};

/** The shape the editor submits; the server fills in ids and timestamps. */
export type EventInput = {
  name: string;
  type: EventType;
  status: EventStatus;
  brief: string;
  launch_date: IsoDate;
  promo_end_date: IsoDate | null;
  inventory_date: IsoDate | null;
  asset_deadline: IsoDate | null;
  teaser_start: IsoDate | null;
  channels: Channels;
  owner: string;
  notes: string | null;
  assets_link: string | null;
};

export type ChangelogEntry = {
  id: string;
  event_id: string | null;
  event_name: string;
  change_summary: string;
  changed_by: string;
  created_at: string;
};

/** The built-in four, uninvolved. Callers with a configured list use `emptyChannels`. */
export const EMPTY_CHANNELS: Channels = emptyChannels(CHANNEL_KEYS);

/** Labels for the built-in channels, and the seed for a new board. */
export const CHANNEL_LABELS: Record<string, string> = {
  paid: "Paid",
  email: "Email",
  organic: "Organic",
  sms: "SMS",
};

/** The list a board starts with, before anybody edits it. */
export const DEFAULT_CHANNELS: ChannelOption[] = CHANNEL_KEYS.map((key) => ({
  key,
  label: CHANNEL_LABELS[key],
}));

/** Label for a channel key when no configured list is to hand. */
export function fallbackChannelLabel(key: string): string {
  return CHANNEL_LABELS[key] ?? key;
}

/** Labels for the built-in types, and the seed for a new board. */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  product_launch: "Product Launch",
  promo: "Promo",
  restock: "Restock",
  content_moment: "Content Moment",
  evergreen_push: "Evergreen Push",
  other: "Other",
};

/** The list a board starts with, before anybody edits it. */
export const DEFAULT_EVENT_TYPES: { key: string; label: string }[] = EVENT_TYPES.map(
  (key) => ({ key, label: EVENT_TYPE_LABELS[key] }),
);

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  confirmed: "Confirmed",
  tentative: "Tentative",
  at_risk: "At Risk",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Statuses hidden from both planning views by default (PRD §5). */
export const HIDDEN_BY_DEFAULT: EventStatus[] = ["completed", "cancelled"];
