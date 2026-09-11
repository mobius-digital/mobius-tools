"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "./Workspace";
import { ConnectionDot } from "./ConnectionDot";
import { FilterBar } from "./FilterBar";
import { StatusBadge } from "./StatusBadge";
import { StageMenu } from "./StageMenu";
import { PlusIcon } from "./Icons";
import { buildBoard, UNSORTED_KEY, type BoardColumn } from "@/lib/board";
import { describeDistance, isStale, visibleEvents } from "@/lib/agenda";
import { collidingEventIds } from "@/lib/calendar";
import { daysSince, diffDays, formatWithWeekday, todayIso } from "@/lib/dates";
import { requestNewEvent } from "@/lib/boardConfigEvents";
import type { LaunchEvent } from "@/lib/types";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function Card({
  event,
  today,
  colliding,
  onOpen,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  event: LaunchEvent;
  today: string;
  colliding: boolean;
  onOpen: (event: LaunchEvent) => void;
  onDragStart: (event: LaunchEvent) => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const { typeLabel, channelOptions, channelLabel } = useWorkspace();

  const days = diffDays(today, event.launch_date);
  const closed = event.status === "completed" || event.status === "cancelled";
  const whenClass =
    !closed && days < 0
      ? " bcard__when--past"
      : !closed && days <= 7
        ? " bcard__when--soon"
        : "";
  const stale = isStale(event, today, daysSince(event.updated_at));

  const involved = channelOptions.filter((option) => event.channels[option.key]?.involved);

  return (
    <article
      className={`bcard bcard--${event.status}${dragging ? " bcard--dragging" : ""}`}
      draggable
      onDragStart={(dragEvent) => {
        dragEvent.dataTransfer.effectAllowed = "move";
        dragEvent.dataTransfer.setData("text/plain", event.id);
        onDragStart(event);
      }}
      onDragEnd={onDragEnd}
    >
      <button
        type="button"
        className="bcard__hit"
        onClick={() => onOpen(event)}
        aria-label={`Open ${event.name}`}
      >
        <span className="bcard__top">
          <span className="bcard__name">{event.name}</span>
          {colliding && (
            <span className="clash-flag" title="Another primary launch lands within 7 days of this one">
              Clash
            </span>
          )}
        </span>

        <span className="bcard__date">
          <span>{formatWithWeekday(event.launch_date)}</span>
          <span className={`bcard__when${whenClass}`}>{describeDistance(today, event.launch_date)}</span>
        </span>

        {event.brief && <span className="bcard__brief">{event.brief}</span>}

        <span className="bcard__tags">
          <span className="type-badge">{typeLabel(event.type)}</span>
          <StatusBadge status={event.status} />
          {stale && (
            <span className="stale-flag" title="Not updated in 3+ weeks and launching within 30 days">
              Needs review
            </span>
          )}
          {involved.length > 0 && (
            <span className="cdots" aria-label="Channels">
              {involved.map((option) => (
                <span
                  key={option.key}
                  className={`cdot cdot--${event.channels[option.key]?.priority ?? "fyi"}`}
                  title={`${channelLabel(option.key)}: ${event.channels[option.key]?.priority ?? "fyi"}`}
                >
                  {channelLabel(option.key).slice(0, 5)}
                </span>
              ))}
            </span>
          )}
        </span>
      </button>

      <footer className="bcard__foot">
        <span className="bcard__owner" title="Accountable for keeping this current">
          <span className="avatar" aria-hidden>
            {initials(event.owner)}
          </span>
          {event.owner}
        </span>
        {event.assets_link && (
          <a
            className="bcard__assets"
            href={event.assets_link}
            target="_blank"
            rel="noreferrer"
            title="Open the assets folder"
          >
            Assets
          </a>
        )}
        <StageMenu event={event} />
      </footer>
    </article>
  );
}

function Column({
  column,
  today,
  colliding,
  onOpen,
  dragging,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  column: BoardColumn;
  today: string;
  colliding: Set<string>;
  onOpen: (event: LaunchEvent) => void;
  dragging: LaunchEvent | null;
  onDragStart: (event: LaunchEvent) => void;
  onDragEnd: () => void;
  onDrop: (column: BoardColumn) => void;
}) {
  const [over, setOver] = useState(false);
  const canReceive = dragging !== null && (dragging.stage ?? null) !== (column.stage?.key ?? null);

  return (
    <section
      className={`col stage-${column.color}${over && canReceive ? " col--over" : ""}`}
      aria-label={column.label}
      onDragOver={(dragEvent) => {
        if (!canReceive) return;
        dragEvent.preventDefault();
        dragEvent.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      }}
      onDragLeave={(dragEvent) => {
        if (dragEvent.currentTarget.contains(dragEvent.relatedTarget as Node)) return;
        setOver(false);
      }}
      onDrop={(dragEvent) => {
        dragEvent.preventDefault();
        setOver(false);
        if (canReceive) onDrop(column);
      }}
    >
      <header className="col__head">
        <span className="stage-dot" aria-hidden />
        <h2 className="col__label">{column.label}</h2>
        <span className="col__count">{column.events.length}</span>
      </header>

      <div className="col__body">
        {column.events.length === 0 && (
          <p className="col__empty">
            {dragging ? "Drop here" : "Nothing here yet"}
          </p>
        )}
        {column.events.map((event) => (
          <Card
            key={event.id}
            event={event}
            today={today}
            colliding={colliding.has(event.id)}
            onOpen={onOpen}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            dragging={dragging?.id === event.id}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * The Board: one column per stage, cards are launches.
 *
 * It answers the question the calendar cannot: not "when" but "where is it
 * in its prep". Dragging a card between columns is the edit; on a phone the
 * stage menu on each card does the same.
 */
export function Board({ serverToday }: { serverToday: string }) {
  const { events, filteredEvents, stages, openEditor, setStage } = useWorkspace();
  const [today, setToday] = useState(serverToday);
  const [showCompleted, setShowCompleted] = useState(false);
  const [dragging, setDragging] = useState<LaunchEvent | null>(null);

  useEffect(() => {
    const local = todayIso();
    if (local !== serverToday) setToday(local);
  }, [serverToday]);

  const columns = useMemo(
    () => buildBoard(filteredEvents, stages, { includeCompleted: showCompleted }),
    [filteredEvents, stages, showCompleted],
  );

  const colliding = useMemo(() => collidingEventIds(events), [events]);
  const live = visibleEvents(filteredEvents).length;

  function handleDrop(column: BoardColumn) {
    if (!dragging) return;
    const target = column.key === UNSORTED_KEY ? null : column.key;
    const moved = dragging;
    setDragging(null);
    void setStage(moved, target);
  }

  return (
    <>
      <div className="toolbar">
        <div className="toolbar__lead">
          <h1 className="toolbar__title">Board</h1>
          <span className="toolbar__sub">
            {live === 0 ? "Nothing in prep" : `${live} ${live === 1 ? "launch" : "launches"} in prep`}
          </span>
        </div>
        <div className="toolbar__spacer" />
        <div className="toolbar__group">
          <label className="toggle">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(event) => setShowCompleted(event.target.checked)}
            />
            <span>Show completed</span>
          </label>
          <ConnectionDot />
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: "calc(-1 * var(--space-2))" }}>
        <FilterBar />
      </div>

      {events.length === 0 ? (
        <div className="empty-state">
          <svg className="empty-state__art" viewBox="0 0 72 72" fill="none" aria-hidden>
            <rect x="6" y="10" width="17" height="52" rx="4" stroke="currentColor" strokeWidth="2" />
            <rect x="27.5" y="10" width="17" height="34" rx="4" stroke="currentColor" strokeWidth="2" />
            <rect x="49" y="10" width="17" height="44" rx="4" stroke="currentColor" strokeWidth="2" />
            <rect x="10" y="16" width="9" height="6" rx="2" fill="currentColor" opacity="0.35" />
            <rect x="31.5" y="16" width="9" height="6" rx="2" fill="currentColor" opacity="0.35" />
            <rect x="53" y="16" width="9" height="6" rx="2" fill="currentColor" opacity="0.35" />
          </svg>
          <h2 className="empty-state__title">Nothing in prep yet</h2>
          <p className="empty-state__body">
            Every launch you add lands here as a card. Drag it between columns
            as it moves from briefed to built to scheduled.
          </p>
          <button type="button" className="button button--primary" onClick={requestNewEvent}>
            <PlusIcon />
            New event
          </button>
        </div>
      ) : (
        <div className="board" role="list">
          {columns.map((column) => (
            <Column
              key={column.key}
              column={column}
              today={today}
              colliding={colliding}
              onOpen={openEditor}
              dragging={dragging}
              onDragStart={setDragging}
              onDragEnd={() => setDragging(null)}
              onDrop={handleDrop}
            />
          ))}
        </div>
      )}
    </>
  );
}
