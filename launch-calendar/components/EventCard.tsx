"use client";

import { EVENT_TYPE_LABELS, type LaunchEvent } from "@/lib/types";
import { formatShort } from "@/lib/dates";
import { ChannelChips } from "./ChannelChips";
import { RelativeTime } from "./RelativeTime";
import { StatusMenu } from "./StatusMenu";

export function EventCard({
  event,
  onOpen,
  showDate = true,
  colliding = false,
}: {
  event: LaunchEvent;
  onOpen: (event: LaunchEvent) => void;
  showDate?: boolean;
  /** Clashes are surfaced here too — the Pipeline is the view people live in. */
  colliding?: boolean;
}) {
  return (
    <article
      className={`card card--${event.status}${colliding ? " card--colliding" : ""}`}
    >
      {/* The body opens the editor; the status control below is a sibling
          rather than a nested button, which would be invalid and unusable. */}
      <button
        type="button"
        className="card__hit"
        onClick={() => onOpen(event)}
        aria-label={`Open ${event.name}`}
      >
        <span className="card__head">
          <span className="card__name">{event.name}</span>
          {showDate && (
            <span className="card__date">{formatShort(event.launch_date)}</span>
          )}
        </span>

        <span className="card__tags">
          <span className="type-badge">{EVENT_TYPE_LABELS[event.type]}</span>
          {colliding && (
            <span
              className="clash-flag"
              title="Another launch with a primary channel lands within 7 days of this one"
            >
              clash
            </span>
          )}
        </span>

        {event.brief && <span className="card__brief">{event.brief}</span>}

        <ChannelChips channels={event.channels} />
      </button>

      <footer className="card__foot">
        <span className="card__owner" title="Accountable for keeping this current">
          Owner · {event.owner}
        </span>
        <span className="card__updated">
          Updated by {event.updated_by} ·{" "}
          <RelativeTime timestamp={event.updated_at} />
        </span>
        <StatusMenu event={event} />
      </footer>
    </article>
  );
}
