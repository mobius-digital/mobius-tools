import { EVENT_STATUS_LABELS, type EventStatus } from "@/lib/types";

/**
 * Statuses that carry an explicit label on the card. Confirmed is the norm and
 * needs no shouting; the other three are exceptions the reader must notice.
 */
const LABELLED: EventStatus[] = ["tentative", "at_risk", "completed"];

export function StatusBadge({ status }: { status: EventStatus }) {
  if (!LABELLED.includes(status)) return null;

  return (
    <span className={`status-badge status-badge--${status}`}>
      {status === "at_risk" ? "AT RISK" : EVENT_STATUS_LABELS[status].toUpperCase()}
    </span>
  );
}
