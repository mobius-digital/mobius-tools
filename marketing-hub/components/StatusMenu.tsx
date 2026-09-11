"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "./Workspace";
import { ChevronDownIcon } from "./Icons";
import {
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
  type EventStatus,
  type LaunchEvent,
} from "@/lib/types";

export const STATUS_HINTS: Record<EventStatus, string> = {
  confirmed: "The date is locked. Build against it.",
  tentative: "The date may still move. Do not prep hard.",
  at_risk: "Was confirmed, now in danger of slipping.",
  completed: "Shipped. Hidden from the views by default.",
  cancelled: "Called off. Hidden everywhere but the changelog.",
};

/**
 * One-click status change.
 *
 * The Monday call mostly produces three edits: that shipped, that date is
 * locked now, that one is wobbling. Making those a menu instead of a trip
 * through the full editor is the difference between the board being updated
 * live on the call and being updated never.
 */
export function StatusMenu({ event }: { event: LaunchEvent }) {
  const { setStatus } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 320 && rect.top > spaceBelow);
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (pointerEvent: MouseEvent) => {
      if (!wrapRef.current?.contains(pointerEvent.target as Node)) setOpen(false);
    };
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function choose(status: EventStatus) {
    setOpen(false);
    if (status === event.status) return;

    setBusy(true);
    try {
      await setStatus(event, status);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="menu status-menu" ref={wrapRef}>
      <button
        type="button"
        className="pill-menu"
        onClick={() => (open ? setOpen(false) : openMenu())}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${EVENT_STATUS_LABELS[event.status]}. ${STATUS_HINTS[event.status]} Click to change.`}
      >
        <span className={`status-dot status-dot--${event.status}`} aria-hidden />
        {busy ? "Saving" : EVENT_STATUS_LABELS[event.status]}
        <ChevronDownIcon className="pill-menu__caret" />
      </button>

      {open && (
        <div className={`menu__list${dropUp ? " menu__list--up" : ""}`} role="menu">
          <div className="menu__heading">Is the date real?</div>
          {EVENT_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              role="menuitem"
              className={`menu__item${status === event.status ? " menu__item--current" : ""}`}
              onClick={() => void choose(status)}
            >
              <span className={`status-dot status-dot--${status}`} aria-hidden />
              <span className="menu__label">{EVENT_STATUS_LABELS[status]}</span>
              <span />
              <span className="menu__hint">{STATUS_HINTS[status]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
