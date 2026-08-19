"use client";

import { useWorkspace } from "./Workspace";
import type { Channels } from "@/lib/types";

/**
 * Channel chips carry the priority in their weight: a `primary` channel is the
 * one that has to build something, `supporting` and `fyi` recede. Reading a
 * card should answer "does my channel need to do anything" without any legend.
 */
export function ChannelChips({ channels }: { channels: Channels }) {
  const { channelOptions, channelLabel } = useWorkspace();

  // Configured order, so chips line up the same way on every card.
  const involved = channelOptions
    .map((option) => option.key)
    .filter((key) => channels[key]?.involved);

  if (involved.length === 0) return null;

  return (
    <ul className="chips">
      {involved.map((key) => {
        const priority = channels[key].priority ?? "fyi";
        return (
          <li key={key} className={`chip chip--${priority}`}>
            {channelLabel(key)}
            <span className="chip__priority">{priority}</span>
          </li>
        );
      })}
    </ul>
  );
}
