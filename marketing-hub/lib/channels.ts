import {
  CHANNEL_KEYS,
  CHANNEL_PRIORITIES,
  type ChannelKey,
  type ChannelPriority,
  type LaunchEvent,
} from "./types.ts";

/**
 * The channel lens (PRD §4.3).
 *
 * "All" is the shared view; picking a channel answers the question the PRD
 * puts at the centre of the product — what does *my* channel need to do about
 * this — by dropping everything that channel is not involved in.
 */

export type ChannelFilter = ChannelKey | "all";

/** The filter options for a given channel list — "all" first, then each key. */
export function channelFilters(keys: readonly string[] = CHANNEL_KEYS): ChannelFilter[] {
  return ["all", ...keys];
}

/** The built-in list's filters; boards with their own channels use `channelFilters`. */
export const CHANNEL_FILTERS: ChannelFilter[] = channelFilters();

export function isChannelFilter(
  value: unknown,
  keys: readonly string[] = CHANNEL_KEYS,
): value is ChannelFilter {
  return typeof value === "string" && channelFilters(keys).includes(value);
}

export function filterByChannel(
  events: LaunchEvent[],
  channel: ChannelFilter,
): LaunchEvent[] {
  if (channel === "all") return events;
  // Optional chaining: an event saved before a channel was added carries no
  // entry for it until its next save, and that reads as "not involved".
  return events.filter((event) => event.channels[channel]?.involved === true);
}

/**
 * How strongly to present an event under the current lens.
 *
 * Filtering answers "is this mine"; elevation answers "how much of it is mine".
 * A primary channel has to build something, so it stays at full strength while
 * supporting and fyi recede — the PRD asks for elevation, not hiding.
 */
export function elevationFor(
  event: LaunchEvent,
  channel: ChannelFilter,
): ChannelPriority | "none" {
  if (channel === "all") return "none";
  const state = event.channels[channel];
  if (!state?.involved) return "none";
  return state.priority ?? "fyi";
}

/** Sorts primary work above supporting above fyi, preserving date order within each. */
export function byElevation(
  events: LaunchEvent[],
  channel: ChannelFilter,
): LaunchEvent[] {
  if (channel === "all") return events;

  const rank = (event: LaunchEvent) => {
    const priority = elevationFor(event, channel);
    const index = CHANNEL_PRIORITIES.indexOf(priority as ChannelPriority);
    return index === -1 ? CHANNEL_PRIORITIES.length : index;
  };

  return [...events].sort(
    (a, b) => rank(a) - rank(b) || a.launch_date.localeCompare(b.launch_date),
  );
}
