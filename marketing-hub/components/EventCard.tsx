"use client";

import { type LaunchEvent } from "@/lib/types";
import { useWorkspace } from "./Workspace";
import { formatShort } from "@/lib/dates";
import { ChannelChips } from "./ChannelChips";
import { RelativeTime } from "./RelativeTime";
import { StatusMenu } from "./StatusMenu";

export function EventCard({
  event,
  onOpen,
  showDate = true,
  colliding = false,
  stale = false,
}: {
  event: LaunchEvent;
  onOpen: (event: LaunchEvent) => void;
  showDate?: boolean;
  /** Clashes are surfaced here too — the Pipeline is the view people live in. */
  colliding?: boolean;
  /** Untouched for 21+ days while launching inside 30 (PRD §6). */
  stale?: boolean;
}) {
  const { typeLabel } = useWorkspace();

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
          <span className="type-badge">{typeLabel(event.type)}</span>
          {colliding && (
            <span
              className="clash-flag"
              title="Another launch with a primary channel lands within 7 days of this one"
            >
              clash
            </span>
          )}
          {stale && (
            <span
              className="stale-flag"
              title="Not updated in 3+ weeks and launching within 30 days — worth confirming this is still accurate"
            >
              needs review
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
        {event.assets_link && (
          <a
            className="card__assets"
            href={event.assets_link}
            target="_blank"
            rel="noreferrer"
            title="Open the assets folder"
            onClick={(clickEvent) => clickEvent.stopPropagation()}
          >
            Assets ↗
          </a>
        )}
        <span className="card__updated">
          Updated by {event.updated_by} ·{" "}
          <RelativeTime timestamp={event.updated_at} />
        </span>
        <StatusMenu event={event} />
      </footer>
    </article>
  );
}
