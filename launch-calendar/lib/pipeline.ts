import {
  diffDays,
  horizonEnd,
  isBetween,
  weekBuckets,
  type WeekBucket,
} from "./dates.ts";
import type { IsoDate, LaunchEvent } from "./types.ts";

/**
 * Arranges events into the four-week Pipeline (PRD §4.1).
 *
 * The important idea here is that an event appears in a week for two different
 * reasons: because it *launches* that week, or because one of its lead-up dates
 * falls that week. Channels work backwards from launch, so "assets due Tuesday"
 * matters more to a designer than a launch three weeks out — both are rendered,
 * and one event can therefore show up in several rows.
 */

export const MILESTONE_KINDS = [
  "asset_deadline",
  "teaser_start",
  "inventory_date",
] as const;

export type MilestoneKind = (typeof MILESTONE_KINDS)[number];

export const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  asset_deadline: "Assets due",
  teaser_start: "Teasers start",
  inventory_date: "Inventory lands",
};

export const MILESTONE_ICONS: Record<MilestoneKind, string> = {
  asset_deadline: "🔔",
  teaser_start: "📣",
  inventory_date: "📦",
};

export type Milestone = {
  key: string;
  kind: MilestoneKind;
  date: IsoDate;
  event: LaunchEvent;
};

/**
 * One dated thing in a week, whether it is a launch or a piece of run-up work.
 *
 * Launches and milestones are interleaved into a single ordered stream rather
 * than split into separate bands, because "assets due Wednesday" genuinely
 * outranks a launch that is still three weeks away, and stacking them in
 * separate zones hides that.
 */
export type PipelineEntry = {
  key: string;
  kind: "launch" | MilestoneKind;
  date: IsoDate;
  event: LaunchEvent;
};

export type PipelineWeek = WeekBucket & {
  launches: LaunchEvent[];
  milestones: Milestone[];
  /** Launches and milestones together, in date order. */
  entries: PipelineEntry[];
  /** True when the week has nothing at all — still rendered, since that is information. */
  empty: boolean;
};

export type Pipeline = {
  weeks: PipelineWeek[];
  beyond: LaunchEvent[];
  /**
   * Active events whose launch date has already passed. They are shown in the
   * first row rather than dropped: an event that slipped and was never closed
   * out must not disappear from the board that the weekly call runs on.
   */
  overdue: LaunchEvent[];
};

export type PipelineOptions = {
  /** Completed events are hidden by default (PRD §5) but can be revealed. */
  includeCompleted?: boolean;
};

/** Cancelled events never appear in a planning view; completed ones are opt-in. */
export function visibleEvents(
  events: LaunchEvent[],
  { includeCompleted = false }: PipelineOptions = {},
): LaunchEvent[] {
  return events.filter((event) => {
    if (event.status === "cancelled") return false;
    if (event.status === "completed" && !includeCompleted) return false;
    return true;
  });
}

function byDateThenName(a: LaunchEvent, b: LaunchEvent): number {
  return (
    a.launch_date.localeCompare(b.launch_date) || a.name.localeCompare(b.name)
  );
}

export function buildPipeline(
  events: LaunchEvent[],
  today: IsoDate,
  options: PipelineOptions = {},
): Pipeline {
  const visible = visibleEvents(events, options);
  const buckets = weekBuckets(today);
  const windowStart = buckets[0].start;
  const windowEnd = horizonEnd(today);

  const weeks: PipelineWeek[] = buckets.map((bucket) => {
    const launches = visible
      .filter((event) => isBetween(event.launch_date, bucket.start, bucket.end))
      .sort(byDateThenName);

    const milestones: Milestone[] = [];
    for (const event of visible) {
      for (const kind of MILESTONE_KINDS) {
        const date = event[kind];
        if (date && isBetween(date, bucket.start, bucket.end)) {
          milestones.push({ key: `${event.id}:${kind}`, kind, date, event });
        }
      }
    }

    milestones.sort(
      (a, b) => a.date.localeCompare(b.date) || a.event.name.localeCompare(b.event.name),
    );

    const entries: PipelineEntry[] = [
      ...launches.map((event) => ({
        key: `${event.id}:launch`,
        kind: "launch" as const,
        date: event.launch_date,
        event,
      })),
      ...milestones.map((milestone) => ({
        key: milestone.key,
        kind: milestone.kind,
        date: milestone.date,
        event: milestone.event,
      })),
    ].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        // On a shared day the launch leads; the run-up work hangs off it.
        Number(a.kind !== "launch") - Number(b.kind !== "launch") ||
        a.event.name.localeCompare(b.event.name),
    );

    return {
      ...bucket,
      launches,
      milestones,
      entries,
      empty: launches.length === 0 && milestones.length === 0,
    };
  });

  const beyond = visible
    .filter((event) => event.launch_date > windowEnd)
    .sort(byDateThenName);

  const overdue = visible
    .filter((event) => event.launch_date < windowStart)
    .sort(byDateThenName);

  return { weeks, beyond, overdue };
}

/**
 * Splits a week's entries into its seven days, for the day rail.
 *
 * Always returns seven buckets, including empty ones — a quiet Thursday is
 * part of the shape of the week and has to hold its column.
 */
export function entriesByDay(week: PipelineWeek): PipelineEntry[][] {
  const days: PipelineEntry[][] = [[], [], [], [], [], [], []];

  for (const entry of week.entries) {
    const index = diffDays(week.start, entry.date);
    if (index >= 0 && index < 7) days[index].push(entry);
  }

  return days;
}

/**
 * Staleness marker rule (PRD §6): untouched for 21+ days *and* launching within
 * the next 30. Both halves matter — an old record for a distant launch is fine,
 * and a fresh record for an imminent one needs no chasing.
 */
export function isStale(
  event: LaunchEvent,
  today: IsoDate,
  daysSinceUpdate: number,
): boolean {
  if (event.status === "cancelled" || event.status === "completed") return false;
  if (daysSinceUpdate < 21) return false;

  const daysToLaunch = Math.round(
    (Date.parse(`${event.launch_date}T00:00:00Z`) -
      Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );

  return daysToLaunch >= 0 && daysToLaunch <= 30;
}
