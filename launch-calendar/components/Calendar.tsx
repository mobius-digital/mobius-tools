"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "./Workspace";
import { ConnectionDot } from "./ConnectionDot";
import { FilterBar } from "./FilterBar";
import { StatusBadge } from "./StatusBadge";
import {
  WEEKDAY_LABELS,
  addDays,
  addMonths,
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


function SpanBar({
  segment,
  onOpen,
}: {
  segment: SpanSegment;
  onOpen: (event: SpanSegment["event"]) => void;
}) {
  const { event } = segment;
  const { typeLabel } = useWorkspace();

  const classes = [
    "span",
    `span--${event.status}`,
    segment.colliding ? "span--colliding" : "",
    segment.continuesLeft ? "span--continues-left" : "",
    segment.continuesRight ? "span--continues-right" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      style={{ gridColumn: `${segment.startCol + 1} / ${segment.endCol + 2}` }}
      onClick={() => onOpen(event)}
      title={`${event.name} — ${typeLabel(event.type)}. Bar runs from teaser start to promo end; ● marks launch day.`}
      aria-label={`${event.name}, edit`}
    >
      {segment.launchCol !== null && (
        <span className="span__anchor" aria-hidden>
          ●
        </span>
      )}
      <span className="span__name">{event.name}</span>
    </button>
  );
}

export function Calendar({ serverToday }: { serverToday: string }) {
  const { events, filteredEvents, openEditor, createEventOn, typeLabel } = useWorkspace();
  const [expandedClash, setExpandedClash] = useState<string | null>(null);

  const [today, setToday] = useState(serverToday);
  const [anchor, setAnchor] = useState(() => startOfMonth(serverToday));
  const [showCompleted, setShowCompleted] = useState(false);
  /**
   * Month answers "where are the gaps this quarter"; week answers "what lands
   * on which day". Same data, two resolutions.
   */
  const [view, setView] = useState<"month" | "week">("month");

  useEffect(() => {
    const local = todayIso();
    if (local !== serverToday) {
      setToday(local);
      setAnchor(startOfMonth(local));
    }
  }, [serverToday]);

  /**
   * Switching resolution should land somewhere useful. Going to week view from
   * the month you are standing in gives you *this* week, not whichever week
   * happens to contain the 1st — which is usually in the previous month.
   */
  function switchView(next: "month" | "week") {
    if (next === view) return;

    if (next === "week") {
      const showingThisMonth = today.slice(0, 7) === anchor.slice(0, 7);
      setAnchor(startOfWeek(showingThisMonth ? today : startOfMonth(anchor)));
    } else {
      setAnchor(startOfMonth(anchor));
    }

    setView(next);
  }

  const grid = useMemo(
    () =>
      view === "month"
        ? monthGrid(anchor)
        : [Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))],
    [anchor, view],
  );
  const calendar = useMemo(
    () =>
      buildMonthCalendar(filteredEvents, grid, { includeCompleted: showCompleted }),
    [filteredEvents, grid, showCompleted],
  );

  const currentMonth = anchor.slice(0, 7);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">
            {view === "month"
              ? formatMonthTitle(anchor)
              : formatRange(startOfWeek(anchor), addDays(startOfWeek(anchor), 6))}
          </h1>
          <p className="page-header__sub">
            Q{quarterOf(anchor)} {anchor.slice(0, 4)}
          </p>
        </div>

        <div className="page-header__actions">
          <ConnectionDot />
          <div className="segmented" role="group" aria-label="Calendar view">
            <button
              type="button"
              className={`segmented__option${view === "month" ? " segmented__option--active" : ""}`}
              onClick={() => switchView("month")}
              aria-pressed={view === "month"}
            >
              Month
            </button>
            <button
              type="button"
              className={`segmented__option${view === "week" ? " segmented__option--active" : ""}`}
              onClick={() => switchView("week")}
              aria-pressed={view === "week"}
            >
              Week
            </button>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(event) => setShowCompleted(event.target.checked)}
            />
            <span>Show completed</span>
          </label>
          <button
            type="button"
            className="button button--primary"
            onClick={() => openEditor()}
          >
            New event
          </button>
        </div>
      </div>

      <FilterBar />

      <nav className="cal-nav" aria-label="Calendar navigation">
        {view === "month" ? (
          <>
            <button
              type="button"
              className="button"
              onClick={() => setAnchor(addMonths(anchor, -3))}
              aria-label="Previous quarter"
            >
              « Quarter
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setAnchor(addMonths(anchor, -1))}
              aria-label="Previous month"
            >
              ‹ Month
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button"
            onClick={() => setAnchor(addDays(startOfWeek(anchor), -7))}
            aria-label="Previous week"
          >
            ‹ Week
          </button>
        )}

        <button
          type="button"
          className="button"
          onClick={() =>
            setAnchor(view === "month" ? startOfMonth(today) : startOfWeek(today))
          }
        >
          Today
        </button>

        {view === "month" ? (
          <>
            <button
              type="button"
              className="button"
              onClick={() => setAnchor(addMonths(anchor, 1))}
              aria-label="Next month"
            >
              Month ›
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setAnchor(addMonths(anchor, 3))}
              aria-label="Next quarter"
            >
              Quarter »
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button"
            onClick={() => setAnchor(addDays(startOfWeek(anchor), 7))}
            aria-label="Next week"
          >
            Week ›
          </button>
        )}
      </nav>

      {/* One banner per clash, expanding in place. The same facts used to
          appear here and again in a list at the bottom of the page, which
          pushed the grid itself well below the fold. */}
      {calendar.clustersInView.map((cluster) => {
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
              <span aria-hidden>⚠️</span>
              <span className="collision-banner__text">
                {cluster.length === 2
                  ? "2 primary launches within 7 days"
                  : `${cluster.length} primary launches between ${formatShort(
                      cluster[0].launch_date,
                    )} and ${formatShort(cluster[cluster.length - 1].launch_date)}`}
              </span>
              <span className="collision-banner__names">
                {cluster.map((event) => event.name).join(" · ")}
              </span>
              <span className="collision-banner__caret" aria-hidden>
                {expanded ? "▾" : "▸"}
              </span>
            </button>

            {expanded && (
              <ul className="collision__list">
                {cluster.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      className="beyond__row"
                      onClick={() => openEditor(event)}
                    >
                      <span className="beyond__date">
                        {formatShort(event.launch_date)}
                      </span>
                      <span className="beyond__name">{event.name}</span>
                      <span className="beyond__type">
                        {typeLabel(event.type)}
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

      <div className={`cal${view === "week" ? " cal--week" : ""}`}>
        <div className="cal__weekdays" aria-hidden>
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="cal__weekday">
              {label}
            </span>
          ))}
        </div>

        {grid.map((week, weekIndex) => (
          <div className="cal-week" key={week[0]}>
            <div className="cal-week__days">
              {week.map((day) => {
                // In week view every day is in scope, so nothing is dimmed.
                const outside = view === "month" && day.slice(0, 7) !== currentMonth;
                const isToday = day === today;
                return (
                  <button
                    type="button"
                    key={day}
                    className={`cal-day${outside ? " cal-day--outside" : ""}${
                      isToday ? " cal-day--today" : ""
                    }`}
                    onClick={() => createEventOn(day)}
                    aria-label={`New event launching ${formatLong(day)}`}
                    title={`Add an event launching ${formatLong(day)}`}
                  >
                    <span className="cal-day__number">
                      {Number(day.slice(8, 10))}
                    </span>
                    <span className="cal-day__add" aria-hidden>
                      +
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="cal-week__lanes">
              {calendar.lanesByWeek[weekIndex].length === 0 ? (
                <div className="cal-lane cal-lane--empty" />
              ) : (
                calendar.lanesByWeek[weekIndex].map((lane, laneIndex) => (
                  <div className="cal-lane" key={laneIndex}>
                    {lane.map((segment) => (
                      <SpanBar
                        key={segment.event.id}
                        segment={segment}
                        onOpen={openEditor}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

    </>
  );
}
