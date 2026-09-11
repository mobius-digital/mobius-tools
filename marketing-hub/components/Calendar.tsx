"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "./Workspace";
import { ConnectionDot } from "./ConnectionDot";
import { FilterBar } from "./FilterBar";
import { StatusBadge } from "./StatusBadge";
import { Agenda } from "./Agenda";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  WarningIcon,
} from "./Icons";
import {
  WEEKDAY_LABELS,
  addDays,
  addMonths,
  diffDays,
  formatLong,
  formatMonthTitle,
  formatRange,
  formatShort,
  monthGrid,
  quarterOf,
  startOfMonth,
  startOfWeek,
  todayIso,
} from "@/lib/dates";
import { buildMonthCalendar, type SpanSegment } from "@/lib/calendar";
import { requestNewEvent } from "@/lib/boardConfigEvents";
import type { IsoDate, LaunchEvent } from "@/lib/types";

type View = "month" | "week" | "agenda";

/** Where the last-chosen view is remembered, per device. */
const VIEW_KEY = "lc_cal_view";
/** Below this, seven columns cannot show a name; the agenda is the default. */
const PHONE_QUERY = "(max-width: 720px)";
/** How far the agenda looks ahead from its anchor. */
const AGENDA_DAYS = 28;

/** What a chip carries while it is being dragged. */
type Drag = { event: LaunchEvent; grabbed: IsoDate };

/**
 * One chip: a launch as it crosses one week row.
 *
 * The chip runs from teaser start to promo end. Where launch day falls inside
 * this row the chip is split: hatched before it, solid from it on, with a dot
 * on the day itself. A row entirely before launch is all hatch; a row after
 * it is all solid.
 */
function Chip({
  segment,
  week,
  onOpen,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  segment: SpanSegment;
  week: IsoDate[];
  onOpen: (event: LaunchEvent) => void;
  onDragStart: (drag: Drag) => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const { event } = segment;
  const { typeLabel, stageClassFor, stageFor } = useWorkspace();
  const cols = segment.endCol - segment.startCol + 1;

  let phase: "before" | "after" | "split" | "launch-first";
  let x = 0;
  if (segment.launchCol === null) {
    phase = event.launch_date > week[6] ? "before" : "after";
  } else if (segment.launchCol === segment.startCol) {
    phase = "launch-first";
  } else {
    phase = "split";
    x = ((segment.launchCol - segment.startCol) / cols) * 100;
  }

  const classes = [
    "evt",
    stageClassFor(event),
    `evt--${event.status}`,
    phase === "before" ? "evt--before" : "",
    phase === "split" ? "evt--split" : "",
    phase === "launch-first" ? "evt--launch-first" : "",
    segment.colliding ? "evt--clash" : "",
    segment.continuesLeft ? "evt--cont-l" : "",
    segment.continuesRight ? "evt--cont-r" : "",
    dragging ? "evt--dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const stage = stageFor(event);
  const title = [
    `${event.name} (${typeLabel(event.type)})`,
    `Launches ${formatLong(event.launch_date)}`,
    stage ? `Stage: ${stage.label}` : "No stage yet",
    "Drag to move the whole launch.",
  ].join("\n");

  return (
    <button
      type="button"
      className={classes}
      style={
        {
          gridColumn: `${segment.startCol + 1} / ${segment.endCol + 2}`,
          "--x": `${x}%`,
        } as React.CSSProperties
      }
      onClick={() => onOpen(event)}
      title={title}
      aria-label={`${event.name}, edit`}
      draggable
      onDragStart={(dragEvent) => {
        // Remember which day was under the pointer, so a chip grabbed by its
        // tail lands where it was dropped rather than jumping by its length.
        const rect = dragEvent.currentTarget.getBoundingClientRect();
        const within = Math.max(0, Math.min(cols - 1, Math.floor(((dragEvent.clientX - rect.left) / rect.width) * cols)));
        const grabbed = week[segment.startCol + within];
        dragEvent.dataTransfer.effectAllowed = "move";
        dragEvent.dataTransfer.setData("text/plain", event.id);
        onDragStart({ event, grabbed });
      }}
      onDragEnd={onDragEnd}
    >
      {(phase === "split" || phase === "launch-first") && (
        <span className="evt__launch" aria-hidden />
      )}
      <span className="evt__name">{event.name}</span>
    </button>
  );
}

export function Calendar({ serverToday }: { serverToday: string }) {
  const { events, filteredEvents, openEditor, createEventOn, typeLabel, moveEvent } =
    useWorkspace();
  const [expandedClash, setExpandedClash] = useState<string | null>(null);

  const [today, setToday] = useState(serverToday);
  const [anchor, setAnchor] = useState(() => startOfMonth(serverToday));
  const [showCompleted, setShowCompleted] = useState(false);
  const [view, setView] = useState<View>("month");
  const [drag, setDrag] = useState<Drag | null>(null);
  /** The week row and column a drag is currently over, for the highlight. */
  const [over, setOver] = useState<{ week: number; col: number } | null>(null);

  useEffect(() => {
    const local = todayIso();
    if (local !== serverToday) {
      setToday(local);
      setAnchor(startOfMonth(local));
    }
  }, [serverToday]);

  /**
   * The view you chose last time is the view you get back. Before any choice
   * has been made a phone opens on the agenda: seven month columns at phone
   * width cut every name to a letter, and the agenda answers "what is next",
   * which is the question somebody on a phone is asking.
   */
  useEffect(() => {
    let preferred: View | null = null;
    try {
      const stored = window.localStorage.getItem(VIEW_KEY);
      if (stored === "month" || stored === "week" || stored === "agenda") preferred = stored;
    } catch {
      // Private mode or storage disabled: fall through to the width default.
    }
    if (!preferred && window.matchMedia(PHONE_QUERY).matches) preferred = "agenda";
    if (preferred && preferred !== view) switchView(preferred);
    // Runs once, on mount: a later resize must not yank the view around.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Switching resolution should land somewhere useful. Going to week view from
   * the month you are standing in gives you *this* week, not whichever week
   * happens to contain the 1st. The agenda starts today.
   */
  function switchView(next: View) {
    if (next === view) return;

    if (next === "week") {
      const showingThisMonth = today.slice(0, 7) === anchor.slice(0, 7);
      setAnchor(startOfWeek(showingThisMonth ? today : startOfMonth(anchor)));
    } else if (next === "month") {
      setAnchor(startOfMonth(anchor));
    } else {
      const showingThisMonth = today.slice(0, 7) === anchor.slice(0, 7);
      setAnchor(showingThisMonth ? today : startOfMonth(anchor));
    }

    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Nothing to do: the choice just will not survive a reload.
    }
  }

  const grid = useMemo(
    () =>
      view === "week"
        ? [Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))]
        : monthGrid(anchor),
    [anchor, view],
  );
  const calendar = useMemo(
    () =>
      buildMonthCalendar(filteredEvents, grid, { includeCompleted: showCompleted }),
    [filteredEvents, grid, showCompleted],
  );

  const currentMonth = anchor.slice(0, 7);

  const step = useCallback(
    (direction: -1 | 1) => {
      if (view === "month") setAnchor(addMonths(anchor, direction));
      else if (view === "week") setAnchor(addDays(startOfWeek(anchor), 7 * direction));
      else setAnchor(addDays(anchor, 14 * direction));
    },
    [anchor, view],
  );

  const goToday = useCallback(() => {
    if (view === "month") setAnchor(startOfMonth(today));
    else if (view === "week") setAnchor(startOfWeek(today));
    else setAnchor(today);
  }, [today, view]);

  const title =
    view === "month"
      ? formatMonthTitle(anchor)
      : view === "week"
        ? formatRange(startOfWeek(anchor), addDays(startOfWeek(anchor), 6))
        : formatRange(anchor, addDays(anchor, AGENDA_DAYS - 1));

  const subtitle =
    view === "agenda"
      ? `Next ${AGENDA_DAYS / 7} weeks`
      : `Q${quarterOf(anchor)} ${anchor.slice(0, 4)}`;

  // ---- drag to move --------------------------------------------------------

  const lanesRefs = useRef<(HTMLDivElement | null)[]>([]);

  const columnAt = (weekIndex: number, clientX: number): number | null => {
    const row = lanesRefs.current[weekIndex];
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    const col = Math.floor(((clientX - rect.left) / rect.width) * 7);
    return Math.max(0, Math.min(6, col));
  };

  const finishDrag = useCallback(() => {
    setDrag(null);
    setOver(null);
  }, []);

  function handleDrop(weekIndex: number, clientX: number) {
    if (!drag) return;
    const col = columnAt(weekIndex, clientX);
    if (col === null) return finishDrag();
    const target = grid[weekIndex][col];
    const days = diffDays(drag.grabbed, target);
    finishDrag();
    if (days !== 0) void moveEvent(drag.event, days);
  }

  const dropPreview =
    drag && over
      ? (() => {
          const target = grid[over.week][over.col];
          const days = diffDays(drag.grabbed, target);
          return addDays(drag.event.launch_date, days);
        })()
      : null;

  return (
    <>
      <div className="toolbar">
        <div className="toolbar__lead">
          <h1 className="toolbar__title">{title}</h1>
          <span className="toolbar__sub">{subtitle}</span>
        </div>

        <div className="toolbar__nav" aria-label="Calendar navigation">
          <button
            type="button"
            className="button button--icon"
            onClick={() => step(-1)}
            aria-label={view === "month" ? "Previous month" : view === "week" ? "Previous week" : "Two weeks back"}
          >
            <ChevronLeftIcon />
          </button>
          <button type="button" className="button" onClick={goToday}>
            Today
          </button>
          <button
            type="button"
            className="button button--icon"
            onClick={() => step(1)}
            aria-label={view === "month" ? "Next month" : view === "week" ? "Next week" : "Two weeks ahead"}
          >
            <ChevronRightIcon />
          </button>
        </div>

        <div className="toolbar__spacer" />

        <div className="toolbar__group">
          <div className="segmented" role="group" aria-label="Calendar view">
            {(["month", "week", "agenda"] as View[]).map((option) => (
              <button
                key={option}
                type="button"
                className={`segmented__option${view === option ? " segmented__option--active" : ""}`}
                onClick={() => switchView(option)}
                aria-pressed={view === option}
              >
                {option === "month" ? "Month" : option === "week" ? "Week" : "Agenda"}
              </button>
            ))}
          </div>
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

      {events.length === 0 && (
        <div className="hello">
          <span>
            <strong>Nothing on this board yet.</strong> Click any day to add the first
            launch, or start from the button.
          </span>
          <button type="button" className="button button--small" onClick={requestNewEvent}>
            <PlusIcon />
            New event
          </button>
        </div>
      )}

      {/* One banner per clash, expanding in place. */}
      {view !== "agenda" &&
        calendar.clustersInView.map((cluster) => {
          const id = cluster[0].id;
          const expanded = expandedClash === id;

          return (
            <div className="collision" key={id}>
              <button
                type="button"
                className="collision-banner"
                onClick={() => setExpandedClash(expanded ? null : id)}
                aria-expanded={expanded}
              >
                <WarningIcon className="collision-banner__icon" />
                <span className="collision-banner__text">
                  {cluster.length === 2
                    ? "Two primary launches within 7 days"
                    : `${cluster.length} primary launches between ${formatShort(
                        cluster[0].launch_date,
                      )} and ${formatShort(cluster[cluster.length - 1].launch_date)}`}
                </span>
                <span className="collision-banner__names">
                  {cluster.map((event) => event.name).join(" · ")}
                </span>
                <ChevronDownIcon className="collision-banner__caret" />
              </button>

              {expanded && (
                <ul className="collision__list">
                  {cluster.map((event) => (
                    <li key={event.id}>
                      <button
                        type="button"
                        className="arow"
                        onClick={() => openEditor(event)}
                      >
                        <span className="arow__kind">{formatShort(event.launch_date)}</span>
                        <span className="arow__main">
                          <span className="arow__name">{event.name}</span>
                          <span className="arow__sub">{typeLabel(event.type)}</span>
                        </span>
                        <StatusBadge status={event.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

      {view === "agenda" ? (
        <Agenda from={anchor} days={AGENDA_DAYS} today={today} showCompleted={showCompleted} />
      ) : (
        <div className={`cal${view === "week" ? " cal--week" : ""}`}>
          <div className="cal__head" aria-hidden>
            {WEEKDAY_LABELS.map((label, index) => (
              <span
                key={label}
                className={`cal__weekday${index >= 5 ? " cal__weekday--weekend" : ""}`}
              >
                {label}
              </span>
            ))}
          </div>

          {grid.map((week, weekIndex) => (
            <div
              className="cal-week"
              key={week[0]}
              onDragOver={(dragEvent) => {
                if (!drag) return;
                dragEvent.preventDefault();
                dragEvent.dataTransfer.dropEffect = "move";
                const col = columnAt(weekIndex, dragEvent.clientX);
                if (col !== null && (over?.week !== weekIndex || over?.col !== col)) {
                  setOver({ week: weekIndex, col });
                }
              }}
              onDragLeave={(dragEvent) => {
                if (dragEvent.currentTarget.contains(dragEvent.relatedTarget as Node)) return;
                if (over?.week === weekIndex) setOver(null);
              }}
              onDrop={(dragEvent) => {
                dragEvent.preventDefault();
                handleDrop(weekIndex, dragEvent.clientX);
              }}
            >
              <div className="cal-week__days">
                {week.map((day, col) => {
                  // In week view every day is in scope, so nothing is dimmed.
                  const outside = view === "month" && day.slice(0, 7) !== currentMonth;
                  const isToday = day === today;
                  return (
                    <button
                      type="button"
                      key={day}
                      className={`day${outside ? " day--outside" : ""}${
                        isToday ? " day--today" : ""
                      }${col >= 5 ? " day--weekend" : ""}`}
                      onClick={() => createEventOn(day)}
                      aria-label={`New event launching ${formatLong(day)}`}
                      title={`Add an event launching ${formatLong(day)}`}
                    >
                      <span className="day__num">{Number(day.slice(8, 10))}</span>
                      <PlusIcon className="day__add" />
                    </button>
                  );
                })}
              </div>

              <div
                className={`cal-week__lanes${
                  calendar.lanesByWeek[weekIndex].length === 0 ? " cal-week__lanes--empty" : ""
                }`}
                ref={(node) => {
                  lanesRefs.current[weekIndex] = node;
                }}
              >
                {drag && (
                  <div className="cal-week__drop" aria-hidden>
                    {week.map((day, col) => (
                      <span
                        key={day}
                        data-over={over?.week === weekIndex && over.col === col ? "true" : "false"}
                      />
                    ))}
                  </div>
                )}
                {calendar.lanesByWeek[weekIndex].map((lane, laneIndex) => (
                  <div className="lane" key={laneIndex}>
                    {lane.map((segment) => (
                      <Chip
                        key={segment.event.id}
                        segment={segment}
                        week={week}
                        onOpen={openEditor}
                        onDragStart={setDrag}
                        onDragEnd={finishDrag}
                        dragging={drag?.event.id === segment.event.id}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {drag && dropPreview && (
        <div className="toast" role="status" aria-live="polite">
          <span className="toast__text">
            Drop to move {drag.event.name} to {formatLong(dropPreview)}
          </span>
        </div>
      )}
    </>
  );
}
