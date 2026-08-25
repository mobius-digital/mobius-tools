import { formatShort } from "./dates.ts";
import {
  DATE_FIELDS,
  EVENT_STATUS_LABELS,
  fallbackChannelLabel,
  type DateField,
  type EventInput,
  type IsoDate,
  type LaunchEvent,
} from "./types.ts";

/**
 * Turns an edit into human-readable history (PRD §3).
 *
 * Pure on purpose: every mutation in `lib/events.ts` calls this, and the exact
 * wording is the product. Date and status changes are the entries people rely
 * on, so each date column is diffed explicitly — there is no generic
 * "fields changed" fallback that could swallow one.
 *
 * Brief and owner edits are deliberately *not* logged; the PRD lists the
 * meaningful set as dates, status, channels, name, creation and cancellation.
 * Two later additions pass the same test the dates do — they change what a
 * channel does next: the assets link, and the note. A note is where the *why*
 * lives ("customs is slow, may slip", "embargo lifted — go"), and a changed
 * why is news even when no date moved. The text itself is not repeated in the
 * history line; it can be long, and every card that matters shows it.
 */

const DATE_LABELS: Record<DateField, string> = {
  launch_date: "Launch date",
  promo_end_date: "Promo end",
  inventory_date: "Inventory date",
  asset_deadline: "Asset deadline",
  teaser_start: "Teaser start",
};

function describeDate(
  field: DateField,
  before: IsoDate | null,
  after: IsoDate | null,
): string | null {
  if (before === after) return null;

  const label = DATE_LABELS[field];

  if (before && after) return `${label} moved ${formatShort(before)} → ${formatShort(after)}`;
  if (!before && after) return `${label} set: ${formatShort(after)}`;
  return `${label} removed (was ${formatShort(before as IsoDate)})`;
}

/** How a channel key reads in history. Configured labels win; built-ins fall back. */
export type ChannelLabeller = (key: string) => string;

function describeChannels(
  before: LaunchEvent["channels"],
  after: LaunchEvent["channels"],
  channelLabel: ChannelLabeller,
): string[] {
  const lines: string[] = [];

  // The union, in `after`'s order (the configured order at save time), so a
  // channel that was removed from the board still gets its farewell line.
  const keys = [...Object.keys(after), ...Object.keys(before).filter((k) => !(k in after))];

  for (const key of keys) {
    const was = before[key] ?? { involved: false, priority: null };
    const now = after[key] ?? { involved: false, priority: null };
    const label = channelLabel(key);

    if (!was.involved && now.involved) {
      lines.push(`${label} added (${now.priority ?? "no priority"})`);
    } else if (was.involved && !now.involved) {
      lines.push(`${label} removed`);
    } else if (was.involved && now.involved && was.priority !== now.priority) {
      lines.push(`${label}: ${was.priority} → ${now.priority}`);
    }
  }

  return lines;
}

/**
 * Every meaningful difference between two versions of an event, one readable
 * line each. An empty result means nothing worth recording changed — a no-op
 * save writes no history.
 */
export function diffEvents(
  before: LaunchEvent,
  after: EventInput | LaunchEvent,
  channelLabel: ChannelLabeller = fallbackChannelLabel,
): string[] {
  const lines: string[] = [];

  if (before.name !== after.name) {
    lines.push(`Renamed "${before.name}" → "${after.name}"`);
  }

  // Cancellation reads better than a bare status transition, and it is the one
  // status change people scan the log for.
  if (before.status !== after.status) {
    lines.push(
      after.status === "cancelled"
        ? "Event cancelled"
        : `Status changed: ${EVENT_STATUS_LABELS[before.status].toLowerCase()} → ${EVENT_STATUS_LABELS[after.status].toLowerCase()}`,
    );
  }

  for (const field of DATE_FIELDS) {
    const line = describeDate(field, before[field], after[field]);
    if (line) lines.push(line);
  }

  lines.push(...describeChannels(before.channels, after.channels, channelLabel));

  const link = describeAssetsLink(before.assets_link, after.assets_link);
  if (link) lines.push(link);

  const note = describeNote(before.notes, after.notes);
  if (note) lines.push(note);

  return lines;
}

/** Whitespace-only edits are not a changed note. */
function cleanNote(value: string | null): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function describeNote(before: string | null, after: string | null): string | null {
  const was = cleanNote(before);
  const now = cleanNote(after);
  if (was === now) return null;
  if (!was && now) return "Note added";
  if (was && !now) return "Note removed";
  return "Note updated";
}

/**
 * The link itself is not repeated in the line — it is long, and the card and
 * the Slack message both render it as a button. The history only needs to
 * say that it arrived.
 */
export function describeAssetsLink(before: string | null, after: string | null): string | null {
  if (before === after) return null;
  if (!before && after) return "Assets link added";
  if (before && !after) return "Assets link removed";
  return "Assets link updated";
}

export function describeCreation(event: LaunchEvent): string {
  return `Event created (launch ${formatShort(event.launch_date)}, ${EVENT_STATUS_LABELS[
    event.status
  ].toLowerCase()})`;
}

export function describeDeletion(event: LaunchEvent): string {
  return `Event deleted permanently (was launching ${formatShort(event.launch_date)})`;
}
