"use client";

import { useEffect, useMemo, useState } from "react";
import type { BrandSummary } from "@/lib/brandContext";
import type { BrandEvent } from "@/lib/allBrands";
import { buildMonthCalendar, type SpanSegment } from "@/lib/calendar";
import { buildAgenda, MILESTONE_LABELS } from "@/lib/agenda";
import {
  MONTH_NAMES,
  WEEKDAY_LABELS,
  addDays,
  addMonths,
  formatLong,
  formatMonthTitle,
  formatRange,
  monthGrid,
  quarterOf,
  startOfMonth,
  startOfWeek,
  todayIso,
  weekdayIndex,
} from "@/lib/dates";
import { EVENT_STATUS_LABELS, type IsoDate } from "@/lib/types";
import { ChevronLeftIcon, ChevronRightIcon } from "./Icons";

type View = "month" | "week" | "agenda";

const VIEW_KEY = "lc_all_view";
const HIDDEN_KEY = "lc_all_hidden";
const PHONE_QUERY = "(max-width: 720px)";
const AGENDA_DAYS = 28;

/** A brand's hue as the chip's stage variables, so the chip CSS needs no new rules. */
function brandVars(brand: BrandSummary): React.CSSProperties {
  return {
    "--stage-c": brand.accent,
    "--stage-bg": `color-mix(in oklab, ${brand.accent} 13%, var(--surface))`,
    "--stage-ink": `color-mix(in oklab, ${brand.accent} 68%, var(--ink))`,
    "--brand-c": brand.accent,
  } as React.CSSProperties;
}

function open(event: BrandEvent) {
  window.location.href = `/b/${event.brand.slug}/?event=${encodeURIComponent(event.id)}`;
}

function Chip({ segment, week }: { segment: SpanSegment; week: IsoDate[] }) {
  const event = segment.event as BrandEvent;
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
    `evt--${event.status}`,
    phase === "before" ? "evt--before" : "",
    phase === "split" ? "evt--split" : "",
    phase === "launch-first" ? "evt--launch-first" : "",
    segment.continuesLeft ? "evt--cont-l" : "",
    segment.continuesRight ? "evt--cont-r" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      style={{
        ...brandVars(event.brand),
        gridColumn: `${segment.startCol + 1} / ${segment.endCol + 2}`,
        "--x": `${x}%`,
      } as React.CSSProperties}
      onClick={() => open(event)}
      title={`${event.brand.name}: ${event.name}\nLaunches ${formatLong(event.launch_date)}\n${EVENT_STATUS_LABELS[event.status]}. Opens on the ${event.brand.name} board.`}
    >
      {(phase === "split" || phase === "launch-first") && <span className="evt__launch" aria-hidden />}
      <span className="evt__brand" aria-hidden />
      <span className="evt__name">{event.name}</span>
    </button>
  );
}

export function AllCalendar({
  brands,
  events,
  serverToday,
}: {
  brands: BrandSummary[];
  events: BrandEvent[];
  serverToday: string;
}) {
  const [today, setToday] = useState(serverToday);
  const [anchor, setAnchor] = useState(() => startOfMonth(serverToday));
  const [view, setView] = useState<View>("month");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    const local = todayIso();
    if (local !== serverToday) {
      setToday(local);
      setAnchor(startOfMonth(local));
    }
    try {
      const stored = window.localStorage.getItem(VIEW_KEY);
      let preferred: View | null =
        stored === "month" || stored === "week" || stored === "agenda" ? stored : null;
      if (!preferred && window.matchMedia(PHONE_QUERY).matches) preferred = "agenda";
      if (preferred) switchView(preferred, local);
      const off = JSON.parse(window.localStorage.getItem(HIDDEN_KEY) ?? "[]");
      if (Array.isArray(off)) setHidden(new Set(off.filter((v) => typeof v === "string")));
    } catch {
      // Private mode: defaults it is.
    }
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchView(next: View, day = today) {
    if (next === "week") setAnchor(startOfWeek(day));
    else if (next === "month") setAnchor(startOfMonth(day));
    else setAnchor(day);
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Fine.
    }
  }

  function toggleBrand(slug: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      try {
        window.localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
      } catch {
        // Fine.
      }
      return next;
    });
  }

  const shown = useMemo(
    () => events.filter((event) => !hidden.has(event.brand.slug)),
    [events, hidden],
  );

  const grid = useMemo(
    () =>
      view === "week"
        ? [Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))]
        : monthGrid(anchor),
    [anchor, view],
  );

  const calendar = useMemo(
    () => buildMonthCalendar(shown, grid, { includeCompleted: showCompleted }),
    [shown, grid, showCompleted],
  );

  const agenda = useMemo(
    () => buildAgenda(shown, anchor, AGENDA_DAYS, { includeCompleted: showCompleted }),
    [shown, anchor, showCompleted],
  );

  const step = (direction: -1 | 1) => {
    if (view === "month") setAnchor(addMonths(anchor, direction));
    else if (view === "week") setAnchor(addDays(startOfWeek(anchor), 7 * direction));
    else setAnchor(addDays(anchor, 14 * direction));
  };

  const title =
    view === "month"
      ? formatMonthTitle(anchor)
      : view === "week"
        ? formatRange(startOfWeek(anchor), addDays(startOfWeek(anchor), 6))
        : formatRange(anchor, addDays(anchor, AGENDA_DAYS - 1));

  const currentMonth = anchor.slice(0, 7);

  return (
    <>
      <div className="toolbar">
        <div className="toolbar__lead">
          <h1 className="toolbar__title">{title}</h1>
          <span className="toolbar__sub">
            {view === "agenda" ? `Next ${AGENDA_DAYS / 7} weeks` : `Q${quarterOf(anchor)} ${anchor.slice(0, 4)}`}
          </span>
        </div>

        <div className="toolbar__nav" aria-label="Calendar navigation">
          <button type="button" className="button button--icon" onClick={() => step(-1)} aria-label="Back">
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            className="button"
            onClick={() =>
              setAnchor(view === "month" ? startOfMonth(today) : view === "week" ? startOfWeek(today) : today)
            }
          >
            Today
          </button>
          <button type="button" className="button button--icon" onClick={() => step(1)} aria-label="Forward">
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
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: "calc(-1 * var(--space-2))" }}>
        <div className="brandkey" role="group" aria-label="Brands shown">
          {brands.map((brand) => (
            <button
              key={brand.slug}
              type="button"
              className={`brandkey__item${hidden.has(brand.slug) ? " brandkey__item--off" : ""}`}
              onClick={() => toggleBrand(brand.slug)}
              aria-pressed={!hidden.has(brand.slug)}
              title={hidden.has(brand.slug) ? `Show ${brand.name}` : `Hide ${brand.name}`}
            >
              <span className="brandkey__swatch" style={{ background: brand.accent }} aria-hidden />
              {brand.name}
            </button>
          ))}
        </div>
      </div>

      {view === "agenda" ? (
        agenda.length === 0 ? (
          <div className="agenda__empty">Nothing scheduled across these boards in the next {AGENDA_DAYS / 7} weeks.</div>
        ) : (
          <div className="agenda">
            {agenda.map((day) => (
              <section
                key={day.date}
                className={`agenda__day${day.date === today ? " agenda__day--today" : ""}`}
              >
                <div className="agenda__date">
                  <span className="agenda__weekday">
                    {day.date === today ? "Today" : WEEKDAY_LABELS[weekdayIndex(day.date)]}
                  </span>
                  <span className="agenda__num">{Number(day.date.slice(8, 10))}</span>
                  <span className="agenda__month">{MONTH_NAMES[Number(day.date.slice(5, 7)) - 1]}</span>
                </div>
                <div className="agenda__items">
                  {day.entries.map((entry) => {
                    const event = entry.event as BrandEvent;
                    const milestone = entry.kind !== "launch";
                    return (
                      <button
                        key={entry.key}
                        type="button"
                        className={`arow${milestone ? " arow--milestone" : ""} arow--${event.status}`}
                        style={brandVars(event.brand)}
                        onClick={() => open(event)}
                      >
                        <span className="stage-dot" aria-hidden />
                        <span className="arow__main">
                          <span className="arow__name">{event.name}</span>
                          <span className="arow__sub">
                            {event.brand.name}
                            {milestone ? ` · ${MILESTONE_LABELS[entry.kind as keyof typeof MILESTONE_LABELS]}` : ""}
                          </span>
                        </span>
                        <span className="arow__kind">
                          {milestone
                            ? MILESTONE_LABELS[entry.kind as keyof typeof MILESTONE_LABELS]
                            : EVENT_STATUS_LABELS[event.status]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )
      ) : (
        <div className={`cal${view === "week" ? " cal--week" : ""}`}>
          <div className="cal__head" aria-hidden>
            {WEEKDAY_LABELS.map((label, index) => (
              <span key={label} className={`cal__weekday${index >= 5 ? " cal__weekday--weekend" : ""}`}>
                {label}
              </span>
            ))}
          </div>

          {grid.map((week, weekIndex) => (
            <div className="cal-week" key={week[0]}>
              <div className="cal-week__days">
                {week.map((day, col) => {
                  const outside = view === "month" && day.slice(0, 7) !== currentMonth;
                  return (
                    <div
                      key={day}
                      className={`day${outside ? " day--outside" : ""}${day === today ? " day--today" : ""}${
                        col >= 5 ? " day--weekend" : ""
                      }`}
                    >
                      <span className="day__num">{Number(day.slice(8, 10))}</span>
                    </div>
                  );
                })}
              </div>
              <div
                className={`cal-week__lanes${
                  calendar.lanesByWeek[weekIndex].length === 0 ? " cal-week__lanes--empty" : ""
                }`}
              >
                {calendar.lanesByWeek[weekIndex].map((lane, laneIndex) => (
                  <div className="lane" key={laneIndex}>
                    {lane.map((segment) => (
                      <Chip key={segment.event.id} segment={segment} week={week} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
