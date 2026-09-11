import { addDays, diffDays, isBetween } from "./dates.ts";
import type { IsoDate, LaunchEvent } from "./types.ts";

/**
 * What the planning views show, and the calendar's list form.
 *
 * Cancelled events never appear in a planning view; completed ones are
 * opt-in. The agenda is the calendar read as a list: one block per day that
 * has something on it, where "something" is a launch or one of its run-up
 * dates. Channels work backwards from launch, so "assets due Tuesday" is
 * worth a line of its own even when the launch is weeks out.
 */

export type VisibilityOptions = {
  /** Completed events are hidden by default but can be revealed. */
  includeCompleted?: boolean;
};

export function visibleEvents(
  events: LaunchEvent[],
  { includeCompleted = false }: VisibilityOptions = {},
): LaunchEvent[] {
  return events.filter((event) => {
    if (event.status === "cancelled") return false;
    if (event.status === "completed" && !includeCompleted) return false;
    return true;
  });
}

export const MILESTONE_KINDS = ["asset_deadline", "teaser_start", "inventory_date"] as const;

export type MilestoneKind = (typeof MILESTONE_KINDS)[number];

export const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  asset_deadline: "Assets due",
  teaser_start: "Teasers start",
  inventory_date: "Inventory lands",
};

/** One dated thing on a day: a launch, or a piece of its run-up work. */
export type AgendaEntry = {
  key: string;
  kind: "launch" | MilestoneKind;
  date: IsoDate;
  event: LaunchEvent;
};

export type AgendaDay = { date: IsoDate; entries: AgendaEntry[] };

function byKindThenName(a: AgendaEntry, b: AgendaEntry): number {
  return (
    // On a shared day the launch leads; the run-up work hangs off it.
    Number(a.kind !== "launch") - Number(b.kind !== "launch") ||
    a.event.name.localeCompare(b.event.name)
  );
}

/**
 * The days from `from` for `days` days that have something on them, in order.
 * Empty days are left out: a list is for reading, and a quiet Thursday is
 * not worth a row of its own the way it is on a grid.
 */
export function buildAgenda(
  events: LaunchEvent[],
  from: IsoDate,
  days: number,
  options: VisibilityOptions = {},
): AgendaDay[] {
  const end = addDays(from, days - 1);
  const visible = visibleEvents(events, options);
  const byDay = new Map<IsoDate, AgendaEntry[]>();

  const put = (entry: AgendaEntry) => {
    if (!isBetween(entry.date, from, end)) return;
    const list = byDay.get(entry.date) ?? [];
    list.push(entry);
    byDay.set(entry.date, list);
  };

  for (const event of visible) {
    put({ key: `${event.id}:launch`, kind: "launch", date: event.launch_date, event });
    for (const kind of MILESTONE_KINDS) {
      const date = event[kind];
      if (date) put({ key: `${event.id}:${kind}`, kind, date, event });
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries]) => ({ date, entries: entries.sort(byKindThenName) }));
}

/**
 * Active launches whose date has passed without being closed out. They are
 * surfaced rather than dropped: a slipped launch nobody marked completed must
 * not quietly leave the board.
 */
export function overdueEvents(events: LaunchEvent[], today: IsoDate): LaunchEvent[] {
  return visibleEvents(events)
    .filter((event) => event.launch_date < today)
    .sort((a, b) => a.launch_date.localeCompare(b.launch_date) || a.name.localeCompare(b.name));
}

/**
 * Staleness rule: untouched for 21+ days *and* launching within the next 30.
 * Both halves matter. An old record for a distant launch is fine, and a fresh
 * record for an imminent one needs no chasing.
 */
export function isStale(
  event: LaunchEvent,
  today: IsoDate,
  daysSinceUpdate: number,
): boolean {
  if (event.status === "cancelled" || event.status === "completed") return false;
  if (daysSinceUpdate < 21) return false;

  const daysToLaunch = diffDays(today, event.launch_date);
  return daysToLaunch >= 0 && daysToLaunch <= 30;
}

/** "today", "in 12d", "3d ago": the distance to a date, for a card. */
export function describeDistance(today: IsoDate, date: IsoDate): string {
  const days = diffDays(today, date);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return `in ${days}d`;
  return `${-days}d ago`;
}
