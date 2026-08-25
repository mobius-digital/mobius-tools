"use client";

import { useEffect, useState } from "react";

/**
 * "Wednesday, August 19" in the viewer's own calendar — the one piece of the
 * sign-in screen that is live.
 *
 * A client component because the server runs in UTC and a date rendered there
 * can be a day off for anyone west of Greenwich late in the evening. Empty on
 * the server and first paint so it never flashes the wrong day.
 */
export function TodayLabel({ className }: { className?: string }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    setLabel(
      new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(new Date()),
    );
  }, []);

  return (
    <span className={className} suppressHydrationWarning>
      {label || " "}
    </span>
  );
}
