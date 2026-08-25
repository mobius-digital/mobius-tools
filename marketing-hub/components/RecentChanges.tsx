"use client";

import { useBrand } from "./BrandProvider";
import Link from "next/link";
import { useWorkspace } from "./Workspace";
import { RelativeTime } from "./RelativeTime";

/**
 * The five most recent edits, on the Pipeline (PRD §4.4).
 *
 * This is the leadership anchor: "what changed since we last spoke" without
 * anyone having to remember what the board looked like last Monday. A slipped
 * date should never be a surprise.
 */
export function RecentChanges() {
  const { path } = useBrand();
  const { recentChanges } = useWorkspace();
  const latest = recentChanges.slice(0, 5);

  return (
    <section className="recent">
      <header className="recent__head">
        <h2 className="recent__title">Recent changes</h2>
        <Link href={path("/changelog")} className="recent__all">
          Full history
        </Link>
      </header>

      {latest.length === 0 ? (
        <p className="recent__empty">No edits yet.</p>
      ) : (
        <ul className="recent__list">
          {latest.map((entry) => (
            <li key={entry.id} className="recent__item">
              <span className="recent__summary">{entry.change_summary}</span>
              <span className="recent__meta">
                {entry.event_name} · {entry.changed_by} ·{" "}
                <RelativeTime timestamp={entry.created_at} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
