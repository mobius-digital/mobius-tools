"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "./Workspace";
import { EventCard } from "./EventCard";
import { StatusMenu } from "./StatusMenu";
import { BoardLegend } from "./BoardLegend";
import { ConnectionDot } from "./ConnectionDot";
import { FilterBar } from "./FilterBar";
import { RecentChanges } from "./RecentChanges";
import { SettingsMenu } from "./SettingsMenu";
import { Walkthrough, resetTour, tourIsUnseen } from "./Walkthrough";
import { WEEKDAY_LABELS, addDays, daysSince, formatLong, formatShort, todayIso } from "@/lib/dates";
import {
  MILESTONE_ICONS,
  MILESTONE_LABELS,
  buildPipeline,
  entriesByDay,
  isStale,
  type PipelineEntry,
  type PipelineWeek,
} from "@/lib/pipeline";
import { collidingEventIds } from "@/lib/calendar";
import { elevationFor } from "@/lib/channels";
import { EVENT_TYPE_LABELS, type LaunchEvent } from "@/lib/types";

/**
 * The Pipeline is a briefing, not a timeline.
 *
 * Attention falls off across the four weeks on purpose: this week gets a day
 * rail and full cards, week two gets dated one-liners, and weeks three and four
 * collapse to a summary you can open. Nobody acts on week four during a Monday
 * call — they only need to know it is not empty.
 */

function entryLabel(entry: PipelineEntry): string {
  return entry.kind === "launch"
    ? entry.event.name
    : `${MILESTONE_LABELS[entry.kind]} — ${entry.event.name}`;
}

function entryTooltip(entry: PipelineEntry): string {
  return entry.kind === "launch"
    ? `${entry.event.name} launches ${formatLong(entry.date)}`
    : `${MILESTONE_LABELS[entry.kind]} for ${entry.event.name} on ${formatLong(entry.date)}`;
}

/** A dated line: used for week two, expanded later weeks, and the overdue strip. */
function EntryRow({
  entry,
  colliding,
  stale = false,
  elevation,
  onOpen,
  showStatusMenu = false,
}: {
  entry: PipelineEntry;
  colliding: boolean;
  stale?: boolean;
  elevation?: string;
  onOpen: (event: LaunchEvent) => void;
  showStatusMenu?: boolean;
}) {
  const classes = [
    "entry",
    `entry--${entry.kind === "launch" ? "launch" : "milestone"}`,
    `entry--${entry.event.status}`,
    elevation && elevation !== "none" ? `entry--lens-${elevation}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="entry-row">
      <button
        type="button"
        className={classes}
        onClick={() => onOpen(entry.event)}
        title={entryTooltip(entry)}
      >
        <span className="entry__date">{formatShort(entry.date)}</span>
        {entry.kind !== "launch" && (
          <span className="entry__icon" aria-hidden>
            {MILESTONE_ICONS[entry.kind]}
          </span>
        )}
        <span className="entry__label">{entryLabel(entry)}</span>
        {entry.kind === "launch" && colliding && (
          <span
            className="clash-flag"
            title="Another launch with a primary channel lands within 7 days of this one"
          >
            clash
          </span>
        )}
        {entry.kind === "launch" && stale && (
          <span
            className="stale-flag"
            title="Not updated in 3+ weeks and launching within 30 days — worth confirming this is still accurate"
          >
            needs review
          </span>
        )}
      </button>

      {showStatusMenu && entry.kind === "launch" && <StatusMenu event={entry.event} />}
    </div>
  );
}

/**
 * The Mon–Sun strip for the current week — a minimap, not a second list.
 *
 * It used to repeat the stream below it in words, which read as the same
 * information twice. Icon-only markers give the shape of the week at a glance
 * and leave the reading to the stream.
 */
function DayRail({
  week,
  today,
  onOpen,
}: {
  week: PipelineWeek;
  today: string;
  onOpen: (event: LaunchEvent) => void;
}) {
  const days = entriesByDay(week);

  return (
    <div className="rail" aria-label="This week at a glance">
      {days.map((entries, index) => {
        const dayIso = addDays(week.start, index);
        const isToday = dayIso === today;
        const past = dayIso < today;

        return (
          <div
            className={`rail__day${isToday ? " rail__day--today" : ""}${
              past ? " rail__day--past" : ""
            }`}
            key={dayIso}
          >
            <span className="rail__label">
              {WEEKDAY_LABELS[index]} {Number(dayIso.slice(8, 10))}
            </span>
            <div className="rail__items">
              {entries.map((entry) => (
                <button
                  type="button"
                  key={entry.key}
                  className={`pip pip--${entry.kind === "launch" ? "launch" : "milestone"} pip--${entry.event.status}`}
                  onClick={() => onOpen(entry.event)}
                  title={entryTooltip(entry)}
                  aria-label={entryTooltip(entry)}
                >
                  {entry.kind === "launch" ? "●" : MILESTONE_ICONS[entry.kind]}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Weeks three and four: one line, openable, but never hiding status. */
function SummaryWeek({
  week,
  colliding,
  staleFor,
  onOpen,
}: {
  week: PipelineWeek;
  colliding: Set<string>;
  staleFor: (event: LaunchEvent) => boolean;
  onOpen: (event: LaunchEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const milestoneCount = week.milestones.length;

  return (
    <section className="tier tier--summary">
      <button
        type="button"
        className="tier__summary"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        disabled={week.empty}
      >
        <span className="tier__name">{week.label}</span>
        <span className="tier__range">{week.rangeLabel}</span>

        <span className="tier__gist">
          {week.launches.length === 0 && milestoneCount === 0 && "nothing scheduled"}

          {/* Status travels with the name: an at-risk launch must not flatten
              into a bare string just because its week is collapsed. */}
          {week.launches.length > 0 && week.launches.length <= 3 && (
            <span className="tier__names">
              {week.launches.map((event) => (
                <span className="tier__namechip" key={event.id}>
                  <span
                    className={`status-dot status-dot--${event.status}`}
                    aria-hidden
                  />
                  {event.name}
                  {colliding.has(event.id) && (
                    <span className="clash-flag clash-flag--mini">clash</span>
                  )}
                  {staleFor(event) && (
                    <span className="stale-flag stale-flag--mini">review</span>
                  )}
                </span>
              ))}
            </span>
          )}
          {week.launches.length > 3 && `${week.launches.length} launches`}

          {milestoneCount > 0 && (
            <span className="tier__milestoneCount">
              {week.launches.length > 0 ? " · " : ""}
              {milestoneCount} milestone{milestoneCount === 1 ? "" : "s"}
            </span>
          )}
        </span>

        {!week.empty && (
          <span className="tier__chevron" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
        )}
      </button>

      {open && !week.empty && (
        <div className="tier__rows">
          {week.entries.map((entry) => (
            <EntryRow
              key={entry.key}
              entry={entry}
              colliding={colliding.has(entry.event.id)}
              stale={staleFor(entry.event)}
              onOpen={onOpen}
              showStatusMenu
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function Pipeline({ serverToday }: { serverToday: string }) {
  const { events, filteredEvents, channel, openEditor } = useWorkspace();
  const [showCompleted, setShowCompleted] = useState(false);
  const [beyondOpen, setBeyondOpen] = useState(false);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  // The tour runs itself the first time somebody opens the board on a device.
  useEffect(() => {
    if (tourIsUnseen()) setTourOpen(true);
  }, []);

  function replayTour() {
    resetTour();
    setTourOpen(true);
  }

  // Start from the server's date so the first paint matches, then correct to
  // the viewer's own calendar day — a reader in Los Angeles and a server in UTC
  // do not always agree on what "this week" is.
  const [today, setToday] = useState(serverToday);
  useEffect(() => {
    const local = todayIso();
    if (local !== serverToday) setToday(local);
  }, [serverToday]);

  const pipeline = useMemo(
    () => buildPipeline(filteredEvents, today, { includeCompleted: showCompleted }),
    [filteredEvents, today, showCompleted],
  );

  // Collisions are computed against every event, not the filtered set: a clash
  // does not stop being a clash because you are looking through the email lens.
  const colliding = useMemo(() => collidingEventIds(events), [events]);

  const [thisWeek, weekTwo, ...laterWeeks] = pipeline.weeks;

  // PRD §6: untouched for 21+ days while launching inside the next 30.
  const staleFor = (event: LaunchEvent) =>
    isStale(event, today, daysSince(event.updated_at));
  const dueThisWeek = thisWeek.entries.length;
  const boardIsEmpty = events.length === 0;

  if (boardIsEmpty) {
    return (
      <>
        {/* Settings has to live here too. A brand new team sees this screen and
            nothing else, and this is exactly when they need to change the
            password they were handed. */}
        <div className="firstrun__bar">
          <SettingsMenu onReplayTour={replayTour} />
        </div>

        <div className="firstrun">
        <h1 className="firstrun__title">Nothing on the board yet</h1>
        <p className="firstrun__body">
          This is where the team sees what is launching over the next four weeks,
          whether each date is locked or still soft, and what each channel needs
          to do about it.
        </p>
        <button
          type="button"
          className="button button--primary"
          onClick={() => openEditor()}
        >
          Add the first event
        </button>
        <button type="button" className="firstrun__tour" onClick={replayTour}>
          or take the two-minute tour
        </button>

        <Walkthrough open={tourOpen} onClose={() => setTourOpen(false)} />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Pipeline</h1>
          <p className="page-header__sub">
            The next four weeks — launches and the lead-up work behind them.
          </p>
        </div>

        <div className="page-header__actions">
          <ConnectionDot />
          <SettingsMenu onReplayTour={replayTour} />
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
      <BoardLegend />

      {/* This week leads. Everything else on the page is context for it. */}
      <section className="tier tier--focus">
        <header className="tier__head">
          <h2 className="tier__name tier__name--focus">{thisWeek.label}</h2>
          <span className="tier__range">{thisWeek.rangeLabel}</span>
          {dueThisWeek > 0 && (
            <span
              className="tier__count"
              title="Launches plus run-up deadlines falling this week"
            >
              {dueThisWeek} this week
            </span>
          )}
        </header>

        {thisWeek.empty ? (
          <p className="tier__empty">Nothing scheduled this week.</p>
        ) : (
          <>
            <DayRail week={thisWeek} today={today} onOpen={openEditor} />

            <div className="tier__stream">
              {thisWeek.entries.map((entry) =>
                entry.kind === "launch" ? (
                  <EventCard
                    key={entry.key}
                    event={entry.event}
                    onOpen={openEditor}
                    colliding={colliding.has(entry.event.id)}
                    stale={staleFor(entry.event)}
                  />
                ) : (
                  <EntryRow
                    key={entry.key}
                    entry={entry}
                    colliding={false}
                    onOpen={openEditor}
                  />
                ),
              )}
            </div>
          </>
        )}
      </section>

      {/* Chores, not emergencies — below this week and closed by default. */}
      {pipeline.overdue.length > 0 && (
        <section className="overdue">
          <button
            type="button"
            className="overdue__toggle"
            onClick={() => setOverdueOpen((value) => !value)}
            aria-expanded={overdueOpen}
          >
            <span aria-hidden>{overdueOpen ? "▾" : "▸"}</span>
            {pipeline.overdue.length} past their launch date, still open
            <span className="overdue__hint">— mark them completed to clear</span>
          </button>

          {overdueOpen && (
            <div className="tier__rows">
              {pipeline.overdue.map((event) => (
                <EntryRow
                  key={event.id}
                  entry={{
                    key: event.id,
                    kind: "launch",
                    date: event.launch_date,
                    event,
                  }}
                  colliding={colliding.has(event.id)}
                  elevation={elevationFor(event, channel)}
                  onOpen={openEditor}
                  showStatusMenu
                />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="tier tier--condensed">
        <header className="tier__head">
          <h2 className="tier__name">{weekTwo.label}</h2>
          <span className="tier__range">{weekTwo.rangeLabel}</span>
        </header>

        {weekTwo.empty ? (
          <p className="tier__empty">Nothing scheduled.</p>
        ) : (
          <div className="tier__rows">
            {weekTwo.entries.map((entry) => (
              <EntryRow
                key={entry.key}
                entry={entry}
                colliding={colliding.has(entry.event.id)}
                stale={staleFor(entry.event)}
                elevation={elevationFor(entry.event, channel)}
                onOpen={openEditor}
                showStatusMenu
              />
            ))}
          </div>
        )}
      </section>

      {laterWeeks.map((week) => (
        <SummaryWeek
          key={week.key}
          week={week}
          colliding={colliding}
          staleFor={staleFor}
          onOpen={openEditor}
        />
      ))}

      <section className="beyond">
        <button
          type="button"
          className="beyond__toggle"
          onClick={() => setBeyondOpen((open) => !open)}
          aria-expanded={beyondOpen}
        >
          <span aria-hidden>{beyondOpen ? "▾" : "▸"}</span>
          Beyond 4 weeks ({pipeline.beyond.length})
        </button>

        {beyondOpen &&
          (pipeline.beyond.length === 0 ? (
            <p className="empty">Nothing further out yet.</p>
          ) : (
            <ul className="beyond__list">
              {pipeline.beyond.map((event) => (
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
                      {EVENT_TYPE_LABELS[event.type]}
                    </span>
                    <span
                      className={`status-dot status-dot--${event.status}`}
                      title={event.status}
                      aria-label={event.status}
                    />
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </section>

      <RecentChanges />

      <Walkthrough open={tourOpen} onClose={() => setTourOpen(false)} />
    </>
  );
}
