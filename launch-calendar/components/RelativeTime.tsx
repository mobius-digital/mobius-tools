"use client";

import { useEffect, useState } from "react";
import { formatLong, relativeTime } from "@/lib/dates";

/**
 * Renders "3h ago" once mounted, and the absolute date before then.
 *
 * "How long ago" depends on the reader's clock, so computing it during server
 * rendering would produce markup the browser disagrees with. Starting from a
 * value both sides compute identically avoids a hydration mismatch.
 */
export function RelativeTime({ timestamp }: { timestamp: string }) {
  const [label, setLabel] = useState(() => formatLong(timestamp.slice(0, 10)));

  useEffect(() => {
    setLabel(relativeTime(timestamp));
  }, [timestamp]);

  return (
    <time dateTime={timestamp} title={new Date(timestamp).toLocaleString()}>
      {label}
    </time>
  );
}
