import { EVENT_STATUS_LABELS, type EventStatus } from "@/lib/types";

/**
 * Statuses that carry an explicit label on a card. Confirmed is the norm and
 * needs no shouting; the others are exceptions the reader must notice. Pass
 * `always` where every row shows its status, as the agenda does.
 */
const LABELLED: EventStatus[] = ["tentative", "at_risk", "completed"];

export function StatusBadge({ status, always = false }: { status: EventStatus; always?: boolean }) {
  if (!always && !LABELLED.includes(status)) return null;

  return (
    <span className={`status-badge status-badge--${status}`}>
      <span className={`status-dot status-dot--${status}`} aria-hidden />
      {EVENT_STATUS_LABELS[status]}
    </span>
  );
}
