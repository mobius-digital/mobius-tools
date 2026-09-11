"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "./Workspace";
import { CheckIcon, ChevronDownIcon } from "./Icons";
import type { LaunchEvent } from "@/lib/types";

/**
 * Where a launch is in its prep, as a menu on the card.
 *
 * On a desktop the Board's columns are the natural way to change a stage:
 * drag the card. On a phone there is no drag, and on the calendar there are
 * no columns, so the card carries the same choice as a menu.
 */
export function StageMenu({ event }: { event: LaunchEvent }) {
  const { stages, stageFor, stageClassFor, setStage } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const current = stageFor(event);

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

  async function choose(stage: string | null) {
    setOpen(false);
    if ((event.stage ?? null) === stage) return;

    setBusy(true);
    try {
      await setStage(event, stage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="menu stage-menu" ref={wrapRef}>
      <button
        type="button"
        className={`pill-menu ${stageClassFor(event)}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Where this launch is in its prep. Click to change."
      >
        <span className="stage-dot" aria-hidden />
        {busy ? "Saving" : (current?.label ?? "No stage")}
        <ChevronDownIcon className="pill-menu__caret" />
      </button>

      {open && (
        <div className={`menu__list${dropUp ? " menu__list--up" : ""}`} role="menu">
          <div className="menu__heading">Stage</div>
          {stages.map((stage) => {
            const isCurrent = stage.key === (event.stage ?? null);
            return (
              <button
                key={stage.key}
                type="button"
                role="menuitem"
                className={`menu__item stage-${stage.color}${isCurrent ? " menu__item--current" : ""}`}
                onClick={() => void choose(stage.key)}
              >
                <span className="stage-dot" aria-hidden />
                <span className="menu__label">{stage.label}</span>
                {isCurrent ? <CheckIcon className="menu__check" /> : <span />}
              </button>
            );
          })}
          <hr className="menu__rule" />
          <button
            type="button"
            role="menuitem"
            className={`menu__item stage-none${!current ? " menu__item--current" : ""}`}
            onClick={() => void choose(null)}
          >
            <span className="stage-dot" aria-hidden />
            <span className="menu__label">No stage</span>
            {!current ? <CheckIcon className="menu__check" /> : <span />}
          </button>
        </div>
      )}
    </div>
  );
}
