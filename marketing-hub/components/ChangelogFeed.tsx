"use client";

import { useMemo } from "react";
import { RelativeTime } from "./RelativeTime";
import { formatLong } from "@/lib/dates";
import type { ChangelogEntry } from "@/lib/types";

/**
 * Reverse-chronological history (PRD §4.4), grouped by day so that "what
 * happened on Tuesday" is answerable without reading timestamps.
 *
 * Entries survive their events: `event_name` is denormalised and the foreign
 * key is nulled on delete, so a hard-deleted event still has readable history.
 */
export function ChangelogFeed({ entries }: { entries: ChangelogEntry[] }) {
  const days = useMemo(() => {
    const grouped = new Map<string, ChangelogEntry[]>();
    for (const entry of entries) {
      const day = entry.created_at.slice(0, 10);
      const bucket = grouped.get(day);
      if (bucket) bucket.push(entry);
      else grouped.set(day, [entry]);
    }
    return [...grouped.entries()];
  }, [entries]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Changelog</h1>
          <p className="page-header__sub">
            Every date, status, channel and name change, newest first.
          </p>
        </div>
      </div>

      {days.length === 0 ? (
        <p className="empty">
          No changes recorded yet. Every edit from here on will be listed.
        </p>
      ) : (
        days.map(([day, dayEntries]) => (
          <section className="log-day" key={day}>
            <h2 className="log-day__title">{formatLong(day)}</h2>
            <ul className="log-list">
              {dayEntries.map((entry) => (
                <li className="log-item" key={entry.id}>
                  <span className="log-item__summary">{entry.change_summary}</span>
                  <span className="log-item__meta">
                    {entry.event_name} · {entry.changed_by} ·{" "}
                    <RelativeTime timestamp={entry.created_at} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
