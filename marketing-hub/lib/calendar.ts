import { diffDays, maxIso, minIso } from "./dates.ts";
import { visibleEvents, type PipelineOptions } from "./pipeline.ts";
import type { IsoDate, LaunchEvent } from "./types.ts";

/**
 * Calendar-view math (PRD §4.2): how far an event stretches, which events
 * collide, and how spans stack inside a week row.
 */

/** Two primary launches this close together are the thing we warn about. */
export const COLLISION_WINDOW_DAYS = 7;

export type Span = { start: IsoDate; end: IsoDate };

/**
 * An event occupies the calendar from the first pre-launch comms through to
 * the end of the promo — the run-up is the part channels actually work on, so
 * showing only launch day would understate it.
 */
export function eventSpan(event: LaunchEvent): Span {
  return {
    start: event.teaser_start ?? event.launch_date,
    end: event.promo_end_date ?? event.launch_date,
  };
}

/** True when any involved channel is marked `primary`. */
export function hasPrimaryChannel(event: LaunchEvent): boolean {
  return Object.values(event.channels).some(
    (state) => state?.involved && state.priority === "primary",
  );
}

export type CollisionPair = { a: LaunchEvent; b: LaunchEvent; daysApart: number };

/**
 * Pairs of events that both carry a primary channel and launch within a
 * rolling seven-day window of each other.
 *
 * Deliberately a rolling window on the launch dates rather than "same calendar
 * week" — a Sunday and the following Tuesday are two days apart and collide,
 * even though they sit in different weeks.
 */
export function collisionPairs(events: LaunchEvent[]): CollisionPair[] {
  const candidates = visibleEvents(events).filter(hasPrimaryChannel);
  const pairs: CollisionPair[] = [];

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const daysApart = Math.abs(
        diffDays(candidates[i].launch_date, candidates[j].launch_date),
      );
      if (daysApart <= COLLISION_WINDOW_DAYS) {
        pairs.push({ a: candidates[i], b: candidates[j], daysApart });
      }
    }
  }

  return pairs;
}

/** Ids of every event involved in at least one collision. */
export function collidingEventIds(events: LaunchEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const pair of collisionPairs(events)) {
    ids.add(pair.a.id);
    ids.add(pair.b.id);
  }
  return ids;
}

/**
 * Groups colliding events into separate clashes.
 *
 * Two launches in August and two more in November are two problems, not one
 * pile of four — a single count across all of them would read as a crisis that
 * is not happening. Each cluster is a connected component of the pair graph, so
 * a chain (A near B, B near C) stays one clash even though A and C may sit more
 * than seven days apart.
 */
export function collisionClusters(events: LaunchEvent[]): LaunchEvent[][] {
  const pairs = collisionPairs(events);
  if (pairs.length === 0) return [];

  const adjacency = new Map<string, Set<string>>();
  const byId = new Map<string, LaunchEvent>();

  for (const { a, b } of pairs) {
    byId.set(a.id, a);
    byId.set(b.id, b);
    if (!adjacency.has(a.id)) adjacency.set(a.id, new Set());
    if (!adjacency.has(b.id)) adjacency.set(b.id, new Set());
    adjacency.get(a.id)!.add(b.id);
    adjacency.get(b.id)!.add(a.id);
  }

  const seen = new Set<string>();
  const clusters: LaunchEvent[][] = [];

  for (const id of adjacency.keys()) {
    if (seen.has(id)) continue;

    const cluster: LaunchEvent[] = [];
    const queue = [id];
    seen.add(id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      cluster.push(byId.get(current)!);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    cluster.sort(
      (a, b) =>
        a.launch_date.localeCompare(b.launch_date) || a.name.localeCompare(b.name),
    );
    clusters.push(cluster);
  }

  return clusters.sort((a, b) => a[0].launch_date.localeCompare(b[0].launch_date));
}

export type SpanSegment = {
  event: LaunchEvent;
  /** Column indices within the week row, 0 = Monday. */
  startCol: number;
  endCol: number;
  /** The span continues past this row's edge. */
  continuesLeft: boolean;
  continuesRight: boolean;
  /** Column of launch day, when it falls inside this row. */
  launchCol: number | null;
  colliding: boolean;
};

/**
 * Packs the spans crossing one week into lanes, so that overlapping events
 * stack instead of drawing on top of each other.
 */
export function lanesForWeek(
  events: LaunchEvent[],
  week: IsoDate[],
  colliding: Set<string>,
): SpanSegment[][] {
  const weekStart = week[0];
  const weekEnd = week[6];

  const segments: SpanSegment[] = events
    .map((event) => ({ event, span: eventSpan(event) }))
    .filter(({ span }) => span.start <= weekEnd && span.end >= weekStart)
    .sort(
      (left, right) =>
        left.span.start.localeCompare(right.span.start) ||
        left.event.name.localeCompare(right.event.name),
    )
    .map(({ event, span }) => {
      const visibleStart = maxIso(span.start, weekStart);
      const visibleEnd = minIso(span.end, weekEnd);
      const launchInRow =
        event.launch_date >= weekStart && event.launch_date <= weekEnd;

      return {
        event,
        startCol: diffDays(weekStart, visibleStart),
        endCol: diffDays(weekStart, visibleEnd),
        continuesLeft: span.start < weekStart,
        continuesRight: span.end > weekEnd,
        launchCol: launchInRow ? diffDays(weekStart, event.launch_date) : null,
        colliding: colliding.has(event.id),
      };
    });

  const lanes: SpanSegment[][] = [];

  for (const segment of segments) {
    const lane = lanes.find(
      (candidate) =>
        !candidate.some(
          (placed) =>
            segment.startCol <= placed.endCol && placed.startCol <= segment.endCol,
        ),
    );

    if (lane) lane.push(segment);
    else lanes.push([segment]);
  }

  return lanes;
}

export type MonthCalendar = {
  lanesByWeek: SpanSegment[][][];
  /** Events colliding *and* visible somewhere in this month. */
  collidingInView: LaunchEvent[];
  /** Those events grouped into distinct clashes, for the warning banners. */
  clustersInView: LaunchEvent[][];
};

export function buildMonthCalendar(
  events: LaunchEvent[],
  grid: IsoDate[][],
  options: PipelineOptions = {},
): MonthCalendar {
  const visible = visibleEvents(events, options);

  // Collisions are computed against the whole dataset, not just this month, so
  // that scrolling to a different month cannot make a clash disappear.
  const colliding = collidingEventIds(events);

  const lanesByWeek = grid.map((week) => lanesForWeek(visible, week, colliding));

  const seen = new Set<string>();
  const collidingInView: LaunchEvent[] = [];
  for (const week of lanesByWeek) {
    for (const lane of week) {
      for (const segment of lane) {
        if (segment.colliding && !seen.has(segment.event.id)) {
          seen.add(segment.event.id);
          collidingInView.push(segment.event);
        }
      }
    }
  }

  // Only surface a clash once at least two of its members are actually on
  // screen; a lone survivor of an off-screen pair is not a clash the reader
  // can act on here.
  const clustersInView = collisionClusters(events)
    .map((cluster) => cluster.filter((event) => seen.has(event.id)))
    .filter((cluster) => cluster.length >= 2);

  return { lanesByWeek, collidingInView, clustersInView };
}
