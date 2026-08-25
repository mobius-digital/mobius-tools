"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "./Workspace";
import {
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
  type EventStatus,
  type LaunchEvent,
} from "@/lib/types";

const STATUS_HINTS: Record<EventStatus, string> = {
  confirmed: "The date is locked — build against it",
  tentative: "The date may still move — do not prep hard",
  at_risk: "Was confirmed, now in danger of slipping",
  completed: "Shipped; hidden from the board by default",
  cancelled: "Killed; hidden everywhere but the changelog",
};

/**
 * One-click status change.
 *
 * The Monday call mostly produces three edits — that shipped, that date is
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

  /**
   * Opens upward when the trigger sits too close to the bottom of the window.
   * The list is tall enough that a card low on the page would otherwise push
   * its options off-screen.
   */
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
    <div className="status-menu" ref={wrapRef}>
      <button
        type="button"
        className={`status-menu__trigger status-menu__trigger--${event.status}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${EVENT_STATUS_LABELS[event.status]} — ${STATUS_HINTS[event.status]}. Click to change.`}
      >
        {busy ? "Saving…" : EVENT_STATUS_LABELS[event.status]}
        <span className="status-menu__caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div
          className={`status-menu__list${dropUp ? " status-menu__list--up" : ""}`}
          role="menu"
        >
          {EVENT_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              role="menuitem"
              className={`status-menu__item${status === event.status ? " status-menu__item--current" : ""}`}
              onClick={() => void choose(status)}
            >
              <span className={`status-dot status-dot--${status}`} aria-hidden />
              <span className="status-menu__label">{EVENT_STATUS_LABELS[status]}</span>
              <span className="status-menu__hint">{STATUS_HINTS[status]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
