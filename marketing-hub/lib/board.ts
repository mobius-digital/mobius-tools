import { visibleEvents, type VisibilityOptions } from "./agenda.ts";
import type { LaunchEvent, StageColor, StageOption } from "./types.ts";

/**
 * The Board: one column per stage, cards are launches.
 *
 * The columns follow the board's stage list in its configured order. Events
 * with no stage, or with a stage that has since been removed from the list,
 * gather in an "Unsorted" column at the front, which only appears when it
 * has something in it. Inside a column the soonest launch is at the top.
 */

export const UNSORTED_KEY = "__unsorted";

export type BoardColumn = {
  key: string;
  label: string;
  color: StageColor | "none";
  /** The stage behind the column; null for Unsorted. */
  stage: StageOption | null;
  events: LaunchEvent[];
};

function byDateThenName(a: LaunchEvent, b: LaunchEvent): number {
  return a.launch_date.localeCompare(b.launch_date) || a.name.localeCompare(b.name);
}

export function buildBoard(
  events: LaunchEvent[],
  stages: readonly StageOption[],
  options: VisibilityOptions = {},
): BoardColumn[] {
  const visible = visibleEvents(events, options);
  const known = new Set(stages.map((stage) => stage.key));

  const unsorted = visible
    .filter((event) => !event.stage || !known.has(event.stage))
    .sort(byDateThenName);

  const columns: BoardColumn[] = stages.map((stage) => ({
    key: stage.key,
    label: stage.label,
    color: stage.color,
    stage,
    events: visible.filter((event) => event.stage === stage.key).sort(byDateThenName),
  }));

  if (unsorted.length > 0) {
    columns.unshift({
      key: UNSORTED_KEY,
      label: "Unsorted",
      color: "none",
      stage: null,
      events: unsorted,
    });
  }

  return columns;
}

/** The stage an event is in, or null when it has none or its stage was removed. */
export function stageOf(
  event: Pick<LaunchEvent, "stage">,
  stages: readonly StageOption[],
): StageOption | null {
  if (!event.stage) return null;
  return stages.find((stage) => stage.key === event.stage) ?? null;
}

/** The CSS class that paints an element in an event's stage hue. */
export function stageClass(
  event: Pick<LaunchEvent, "stage">,
  stages: readonly StageOption[],
): string {
  const stage = stageOf(event, stages);
  return stage ? `stage-${stage.color}` : "stage-none";
}
