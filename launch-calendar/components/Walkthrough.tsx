"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "./Workspace";

const STORAGE_KEY = "lc_tour_done";

/**
 * The first-run guided tour.
 *
 * Steps point at real parts of the page rather than describing them, and the
 * ones that ask for an action advance by themselves once it happens — so the
 * tour teaches by having people do the thing, not by reading at them.
 *
 * A step whose target is missing is skipped. That matters because a brand new
 * board is empty: there are no cards to point at until the person has made one,
 * and the tour has to survive that without dead-ending.
 */

type Step = {
  id: string;
  /** CSS selector to spotlight. Omit for a centred, page-level step. */
  target?: string;
  title: string;
  body: string;
  /** Shown instead of "Next" when the step is waiting on the reader. */
  action?: string;
  /** When this becomes true the step completes on its own. */
  done?: (ctx: TourContext) => boolean;
};

type TourContext = {
  channel: string;
  eventCount: number;
  editorOpen: boolean;
  statusMenuOpen: boolean;
};

/**
 * Order matters. A brand new board is empty, so the tour gets them to create
 * something *before* it points at cards, filters or the changelog — otherwise
 * every one of those steps would find nothing on the page and be skipped, and a
 * first-time user would get the thinnest possible tour.
 */
const STEPS: Step[] = [
  {
    id: "welcome",
    title: "Welcome to the Launch Calendar",
    body: "This is where your team sees what is launching, when, and which channels need to care. Two minutes and you will know your way around.",
  },
  {
    id: "views",
    target: ".nav__links",
    title: "Three screens",
    body: "Pipeline is the board you will live in. Calendar is the same information as a timeline. Changelog records every edit automatically.",
  },
  {
    id: "create",
    target: ".page-header__actions .button--primary, .firstrun .button--primary",
    title: "Let's put something on the board",
    body: "Everything starts here. On the Calendar you can also click any day to start an event on that date.",
    action: "Open the editor to continue",
    done: (ctx) => ctx.editorOpen,
  },
  {
    id: "editor",
    target: ".sheet",
    title: "Only five things are required",
    body: "A name, a one-line brief, the launch date, which channels are involved, and who owns it. The run-up dates lower down — assets due, teasers, inventory — are what make this useful to other channels.",
    action: "Save it, or close the editor, to continue",
    done: (ctx) => !ctx.editorOpen,
  },
  {
    id: "channel",
    target: ".filters__chips",
    title: "Filter to your channel",
    body: "Pick the channel you work in and the board narrows to only what involves you. Your choice is remembered, so you land here filtered every time.",
    action: "Pick a channel to continue",
    done: (ctx) => ctx.channel !== "all",
  },
  {
    id: "status",
    target: ".card .status-menu, .entry-row .status-menu",
    title: "Say whether the date is real",
    body: "Confirmed means build against it. Tentative means it may still move. At risk means it was locked and is now wobbling. Change it right here — no need to open the event.",
    action: "Open a status menu to continue",
    done: (ctx) => ctx.statusMenuOpen,
  },
  {
    id: "week",
    target: ".tier--focus",
    title: "This week, in full",
    body: "The board gets quieter as it looks further ahead: this week in detail, next week as single lines, weeks three and four folded down. Launches and deadlines are mixed together in the order they need doing.",
  },
  {
    id: "recent",
    target: ".recent",
    title: "What changed since Monday",
    body: "Every date move, status change and rename lands here by itself. This is the panel to read at the start of a meeting.",
  },
  {
    id: "legend",
    target: ".legend, .legend__reopen",
    title: "The cheat sheet",
    body: "Every symbol on the board is explained here. It is always one click away if you forget what a flag means.",
  },
  {
    id: "done",
    title: "That's the whole thing",
    body: "You can replay this any time from the Settings menu. Now go and put your next launch on the board.",
  },
];

export function Walkthrough({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { channel, events } = useWorkspace();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  /** Live page facts the action steps watch. */
  const readContext = useCallback(
    (): TourContext => ({
      channel,
      eventCount: events.length,
      editorOpen: Boolean(document.querySelector(".sheet")),
      statusMenuOpen: Boolean(document.querySelector(".status-menu__list")),
    }),
    [channel, events.length],
  );

  const step = STEPS[index];

  const finish = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    onClose();
  }, [onClose]);

  const next = useCallback(() => {
    setIndex((current) => {
      // Skip any following step whose target is not on the page.
      let candidate = current + 1;
      while (candidate < STEPS.length) {
        const target = STEPS[candidate].target;
        if (!target || document.querySelector(target)) break;
        candidate += 1;
      }
      return candidate;
    });
  }, []);

  // Past the end means the tour is over.
  useEffect(() => {
    if (open && index >= STEPS.length) finish();
  }, [open, index, finish]);

  // Track where the spotlight should sit, and keep it there through scrolling
  // and layout changes.
  useEffect(() => {
    if (!open || !step) return;

    let frame = 0;

    const measure = () => {
      if (!step.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector(step.target);
      setRect(el ? el.getBoundingClientRect() : null);
    };

    const loop = () => {
      measure();
      frame = window.requestAnimationFrame(loop);
    };

    const el = step.target ? document.querySelector(step.target) : null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });

    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [open, step]);

  // Action steps complete themselves.
  useEffect(() => {
    if (!open || !step?.done) return;

    const timer = window.setInterval(() => {
      if (step.done!(readContext())) next();
    }, 250);

    return () => window.clearInterval(timer);
  }, [open, step, readContext, next]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      // Escape belongs to whatever is on top. While the editor, a dialog or a
      // status menu is open, that keypress is meant for them — ending the tour
      // as well would mean closing the editor mid-tour silently kills it.
      const somethingElseIsOpen = document.querySelector(
        ".sheet, .dialog, .status-menu__list",
      );
      if (somethingElseIsOpen) return;

      finish();
    };

    // Capture phase, deliberately. React's handlers sit inside the document and
    // run first on the way up, so by the time a bubbling listener saw the key
    // the editor had already closed itself and the guard above found nothing
    // open — which ended the tour every time somebody pressed Escape.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, finish]);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  if (!open || !step || index >= STEPS.length) return null;

  const pad = 8;
  const spotlight = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // Sit under the target when there is room, otherwise above it.
  const tipStyle: React.CSSProperties = spotlight
    ? (() => {
        const below = spotlight.top + spotlight.height + 14;
        const roomBelow = window.innerHeight - below > 220;
        return roomBelow
          ? { top: below, left: Math.max(16, Math.min(spotlight.left, window.innerWidth - 400)) }
          : {
              bottom: window.innerHeight - spotlight.top + 14,
              left: Math.max(16, Math.min(spotlight.left, window.innerWidth - 400)),
            };
      })()
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {spotlight ? (
        <div className="tour__spotlight" style={spotlight} aria-hidden />
      ) : (
        <div className="tour__dim" aria-hidden />
      )}

      <div className="tour__tip" style={tipStyle} ref={tipRef}>
        <div className="tour__progress">
          {STEPS.map((entry, i) => (
            <span
              key={entry.id}
              className={`tour__dot${i === index ? " tour__dot--current" : ""}${
                i < index ? " tour__dot--done" : ""
              }`}
            />
          ))}
        </div>

        <h2 className="tour__title" id="tour-title">
          {step.title}
        </h2>
        <p className="tour__body">{step.body}</p>

        <div className="tour__actions">
          <button type="button" className="button button--quiet" onClick={finish}>
            Skip tour
          </button>

          {step.action ? (
            <span className="tour__waiting">{step.action}</span>
          ) : (
            <button type="button" className="button button--primary" onClick={next}>
              {index === STEPS.length - 1 ? "Finish" : "Next"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** True when this device has never finished the tour. */
export function tourIsUnseen(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) !== "true";
}

export function resetTour(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
