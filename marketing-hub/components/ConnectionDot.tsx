"use client";

import { useWorkspace } from "./Workspace";

const COPY = {
  connecting: "Checking for updates…",
  live: "Up to date — the board re-checks every few seconds",
  offline:
    "Can't reach the server. Your own edits still save; other people's will appear once the connection is back.",
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
