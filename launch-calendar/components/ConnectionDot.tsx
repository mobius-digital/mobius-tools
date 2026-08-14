"use client";

import { useWorkspace } from "./Workspace";

const COPY = {
  connecting: "Connecting for live updates…",
  live: "Live — other people's edits appear here automatically",
  offline:
    "Live updates are off. Your own edits still save normally; reload to pick up other people's.",
} as const;

/**
 * Connection health as a quiet dot rather than an alarm.
 *
 * This used to be a full-width red banner directly under the page title, which
 * meant the first thing a new person read was "something is broken" — about a
 * background convenience that does not stop anyone working.
 */
export function ConnectionDot() {
  const { connection } = useWorkspace();

  if (connection === "live") return null;

  return (
    <span
      className={`conn conn--${connection}`}
      title={COPY[connection]}
      role="status"
    >
      <span className="conn__dot" aria-hidden />
      {connection === "offline" ? "Not live" : "Connecting"}
    </span>
  );
}
