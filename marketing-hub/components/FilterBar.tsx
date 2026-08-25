"use client";

import { useWorkspace } from "./Workspace";
import { channelFilters, type ChannelFilter } from "@/lib/channels";

/**
 * The channel lens, shared by both views (PRD §4.3).
 *
 * Selecting a channel is the single most useful thing an operator can do here:
 * it turns a whole-company board into "what paid has to build". The choice is
 * remembered per device and reflected in the URL, so it survives a reload and
 * can be pasted to a colleague.
 */
export function FilterBar() {
  const { channel, setChannel, events, filteredEvents, channelOptions, channelLabel } =
    useWorkspace();

  const labelFor = (option: ChannelFilter) =>
    option === "all" ? "All channels" : channelLabel(option);

  return (
    <div className="filters">
      <div className="filters__chips" role="group" aria-label="Filter by channel">
        {channelFilters(channelOptions.map((option) => option.key)).map((option) => {
          const active = option === channel;
          return (
            <button
              key={option}
              type="button"
              className={`chip-filter${active ? " chip-filter--active" : ""}`}
              onClick={() => setChannel(option)}
              aria-pressed={active}
            >
              {labelFor(option)}
            </button>
          );
        })}
      </div>

      {channel !== "all" && (
        <p className="filters__note">
          Showing {filteredEvents.length} of {events.length} — everything{" "}
          {labelFor(channel).toLowerCase()} is involved in. Its most important work
          is highlighted.
        </p>
      )}
    </div>
  );
}
