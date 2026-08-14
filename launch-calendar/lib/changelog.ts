import { formatShort } from "./dates.ts";
import {
  CHANNEL_KEYS,
  CHANNEL_LABELS,
  DATE_FIELDS,
  EVENT_STATUS_LABELS,
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
 * Brief, notes and owner edits are deliberately *not* logged; the PRD lists the
 * meaningful set as dates, status, channels, name, creation and cancellation.
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

function describeChannels(before: LaunchEvent["channels"], after: LaunchEvent["channels"]): string[] {
  const lines: string[] = [];

  for (const key of CHANNEL_KEYS) {
    const was = before[key];
    const now = after[key];
    const label = CHANNEL_LABELS[key];

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
export function diffEvents(before: LaunchEvent, after: EventInput | LaunchEvent): string[] {
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
        : `Status: ${EVENT_STATUS_LABELS[before.status].toLowerCase()} → ${EVENT_STATUS_LABELS[after.status].toLowerCase()}`,
    );
  }

  for (const field of DATE_FIELDS) {
    const line = describeDate(field, before[field], after[field]);
    if (line) lines.push(line);
  }

  lines.push(...describeChannels(before.channels, after.channels));

  return lines;
}

export function describeCreation(event: LaunchEvent): string {
  return `Event created (launch ${formatShort(event.launch_date)}, ${EVENT_STATUS_LABELS[
    event.status
  ].toLowerCase()})`;
}

export function describeDeletion(event: LaunchEvent): string {
  return `Event deleted permanently (was launching ${formatShort(event.launch_date)})`;
}
