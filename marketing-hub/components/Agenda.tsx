"use client";

import { useMemo } from "react";
import { useWorkspace } from "./Workspace";
import { StatusBadge } from "./StatusBadge";
import { BellIcon, BoxIcon, FlagIcon, MegaphoneIcon } from "./Icons";
import { buildAgenda, type AgendaEntry, MILESTONE_LABELS } from "@/lib/agenda";
import { MONTH_NAMES, WEEKDAY_LABELS, weekdayIndex } from "@/lib/dates";
import type { IsoDate } from "@/lib/types";

const KIND_ICON: Record<AgendaEntry["kind"], React.ReactNode> = {
  launch: <FlagIcon />,
  asset_deadline: <BellIcon />,
  teaser_start: <MegaphoneIcon />,
  inventory_date: <BoxIcon />,
};

/**
 * The calendar as a list: one block per day that has something on it.
 *
 * Launches and their run-up dates are interleaved, because "assets due
 * Wednesday" is worth a line of its own and often matters more to a designer
 * than a launch three weeks out. This is the phone's default view.
 */
export function Agenda({
  from,
  days,
  today,
  showCompleted,
}: {
  from: IsoDate;
  days: number;
  today: IsoDate;
  showCompleted: boolean;
}) {
  const { filteredEvents, openEditor, typeLabel, stageClassFor, stageFor } = useWorkspace();

  const agenda = useMemo(
    () => buildAgenda(filteredEvents, from, days, { includeCompleted: showCompleted }),
    [filteredEvents, from, days, showCompleted],
  );

  if (agenda.length === 0) {
    return (
      <div className="agenda__empty">
        Nothing scheduled in these {days / 7} weeks. Step ahead, or add a launch.
      </div>
    );
  }

  return (
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
              const { event } = entry;
              const stage = stageFor(event);
              const milestone = entry.kind !== "launch";
              const milestoneLabel = entry.kind === "launch" ? "" : MILESTONE_LABELS[entry.kind];
              return (
                <button
                  key={entry.key}
                  type="button"
                  className={`arow ${stageClassFor(event)}${milestone ? " arow--milestone" : ""} arow--${event.status}`}
                  onClick={() => openEditor(event)}
                >
                  <span className="stage-dot" aria-hidden />
                  <span className="arow__main">
                    <span className="arow__name">{event.name}</span>
                    <span className="arow__sub">
                      {milestone
                        ? `${milestoneLabel} · ${typeLabel(event.type)}`
                        : [typeLabel(event.type), stage?.label, event.owner]
                            .filter(Boolean)
                            .join(" · ")}
                    </span>
                  </span>
                  <span className="arow__kind">
                    {KIND_ICON[entry.kind]}
                    {milestone ? milestoneLabel : <StatusBadge status={event.status} always />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
