"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * The first-run guided tour.
 *
 * Mounted once in the layout rather than inside a page, for two reasons the
 * previous version got wrong: it now survives navigating between Pipeline,
 * Calendar and Changelog — so the tour can actually show all three — and it
 * survives the board switching from its empty state to its populated one, which
 * used to remount the component and silently restart the tour the moment
 * somebody created their first event.
 *
 * Position is kept in sessionStorage for the same reason: a route change tears
 * down and rebuilds React state, and the reader should not lose their place.
 *
 * Steps read the live page rather than being told about it, so the ones that
 * ask for an action advance on their own once it happens.
 */

const DONE_KEY = "lc_tour_done";
const OPEN_KEY = "lc_tour_open";
const INDEX_KEY = "lc_tour_index";

type TourContext = {
  path: string;
  editorOpen: boolean;
  statusMenuOpen: boolean;
  filtered: boolean;
  hasCards: boolean;
};

type Step = {
  id: string;
  /** CSS selector to spotlight. Omit for a centred, page-level step. */
  target?: string;
  title: string;
  body: string;
  /** Route this step needs to be on; the tour navigates there itself. */
  goto?: string;
  /** Shown instead of "Next" while the step waits on the reader. */
  action?: string;
  /** When this becomes true the step completes on its own. */
  done?: (ctx: TourContext) => boolean;
  /**
   * Do not skip this step just because its target is missing at the instant we
   * arrive — wait for it. Used for anything that appears a beat later than the
   * step does: the editor fields, and the first card after it is saved.
   *
   * If it still has not appeared after the grace period the step is skipped,
   * so the reader never sits looking at a tip that highlights nothing.
   */
  keepIfMissing?: boolean;
};

const STEPS: Step[] = [
  {
    id: "welcome",
    goto: "/",
    title: "Welcome to the Launch Calendar",
    body: "This is where your team sees what is launching, when, and which channels need to care. A few minutes and you will know your way around — including how to add your first launch.",
  },
  {
    id: "views",
    goto: "/",
    target: ".nav__links",
    title: "Three screens",
    body: "Pipeline is the board you will live in. Calendar is the same information laid out as a timeline. Changelog records every edit automatically. We will visit all three.",
  },
  {
    id: "create",
    goto: "/",
    target: ".page-header__actions .button--primary, .firstrun .button--primary",
    title: "Let's put something on the board",
    body: "Everything starts here. Open it and we will go through the form together, field by field.",
    action: "Open the editor to continue",
    done: (ctx) => ctx.editorOpen,
  },

  // ---- inside the editor -------------------------------------------------
  {
    id: "f-name",
    target: "#event-name",
    keepIfMissing: true,
    title: "Name — what the team will call it",
    body: "Use the name people already say out loud, not a campaign code. Good: “Spring Collection Restock”, “Father's Day Sale”, “LGW02 Wedge Launch”. Avoid: “Q2-P3-FINAL”.",
  },
  {
    id: "f-brief",
    target: "#event-brief",
    keepIfMissing: true,
    title: "Brief — the offer in one sentence",
    body: "What a media buyer needs to know before writing an ad. Good: “25% off all wedges, sitewide, no code needed.” Or: “Three new putter colourways, limited to 200 units each.” One sentence is plenty.",
  },
  {
    id: "f-launch",
    target: "#event-launch_date",
    keepIfMissing: true,
    title: "Launch date — the anchor",
    body: "The day it goes live. Everything else on this form is described in relation to this date, so set it even if it is still a rough guess — you can mark it Tentative further down to say so.",
  },
  {
    id: "f-channels",
    target: ".fieldset .channel-rows",
    keepIfMissing: true,
    title: "Channels — who has work to do",
    body: "Tick every channel involved, then set how much it matters to each. Primary — this channel builds something; it is their main event. Supporting — they help, but it is not their headline. FYI — they just need to know it is happening. Say a wedge restock: Paid is Primary because it carries the launch, Email is Supporting with one send, Organic is FYI so social does not schedule something competing. Only Primary counts toward clash warnings, so use it honestly.",
  },
  {
    id: "f-owner",
    target: "#event-owner",
    keepIfMissing: true,
    title: "Owner — one name, not a team",
    body: "The person to ask when a date looks wrong. “Cole”, not “Marketing”. One name means nobody has to guess who to chase.",
  },
  {
    id: "f-type",
    target: "#event-type",
    keepIfMissing: true,
    title: "Type — what kind of thing this is",
    body: "Product launch for something genuinely new. Promo for a discount or offer on what you already sell. Restock when stock returns. Content moment for a campaign with no direct offer behind it. Evergreen push for turning up spend on something always-on. It is there so the board can be read at a glance, not to drive any logic.",
  },
  {
    id: "f-status",
    target: "#event-status",
    keepIfMissing: true,
    title: "Status — is this date real?",
    body: "Confirmed — locked, build against it. Tentative — it could still move, so do not book media yet. At risk — it was locked and is now slipping; this is the one that earns a red flag. Completed — it shipped, and it drops off the board unless you tick “Show completed”. Cancelled — it is off, but the event and its history stay so nobody wonders what happened to it.",
  },
  {
    id: "f-runup",
    // Not just ".date-grid": the launch date sits in one of those too, and it
    // comes first, so the plain selector spotlighted the wrong field.
    target: ".date-grid:not(.date-grid--single)",
    keepIfMissing: true,
    title: "Run-up dates — what makes this useful to everyone else",
    body: "These are the deadlines behind the launch, and they are why other channels care. Assets due: when creative must be finished — usually a week or two before. Teaser start: when you begin hinting publicly. Inventory: when stock actually lands. Promo end: when the offer stops. Fill in the ones you know; leave the rest blank.",
  },
  {
    id: "f-notes",
    target: "#event-notes",
    keepIfMissing: true,
    title: "Notes — the caveats",
    body: "Anything that would otherwise live in a DM. “Waiting on the factory to confirm shipping.” “Do not promote before the PR embargo lifts on the 12th.” This is the field that stops people asking the same question twice.",
  },
  {
    id: "save",
    target: ".sheet__footer",
    keepIfMissing: true,
    title: "Save it",
    body: "Only the starred fields are required — the rest can be filled in later as things firm up. Every change you make from here on is recorded automatically with your name against it.",
    action: "Save, or close the editor, to continue",
    done: (ctx) => !ctx.editorOpen,
  },

  // ---- back on the board -------------------------------------------------
  {
    id: "status-menu",
    goto: "/",
    target: ".card .status-menu, .entry-row .status-menu",
    // Kept even if the card has not painted yet: the reader has just created an
    // event, so skipping this would drop the step at exactly the moment it
    // finally has something to point at.
    keepIfMissing: true,
    title: "Change a status without opening anything",
    body: "That little badge on the card is a menu. When a date firms up or starts to wobble, change it right here — no need to open the event.",
  },
  {
    id: "channel-filter",
    goto: "/",
    target: ".filters__chips",
    title: "Filter to your channel",
    body: "Pick the channel you work in and the board narrows to only what involves you. Your choice is remembered per device, so you land here already filtered.",
  },
  {
    id: "week",
    goto: "/",
    target: ".tier--focus",
    title: "This week, in full",
    body: "The board gets quieter the further ahead it looks: this week in detail, next week as single lines, weeks three and four folded down. Launches and their deadlines are mixed together in the order they need doing — “assets due Wednesday” often matters more than a launch three weeks out.",
  },
  {
    id: "recent",
    goto: "/",
    target: ".recent",
    title: "What changed since Monday",
    body: "Every date move, status change and rename lands here by itself. This is the panel to read at the top of a meeting.",
  },
  {
    id: "legend",
    goto: "/",
    target: ".legend, .legend__reopen",
    title: "The cheat sheet",
    body: "Every symbol on the board is explained here, and it is always one click away if you forget what a flag means.",
  },

  // ---- the other two screens --------------------------------------------
  {
    id: "calendar",
    goto: "/calendar",
    target: ".cal",
    title: "Calendar — the same launches as a timeline",
    body: "Each launch stretches from its teaser start to the end of its promo, so you can see overlaps at a glance. Switch between month and week at the top.",
  },
  {
    id: "calendar-add",
    goto: "/calendar",
    target: ".cal-day__number, .cal-day__add",
    title: "Click any day to start an event on it",
    body: "Quicker than opening the editor and typing the date. It also warns you when two launches that both matter land within a week of each other.",
  },
  {
    id: "changelog",
    goto: "/changelog",
    target: ".log-day, .empty",
    title: "Changelog — who changed what, and when",
    body: "Written automatically on every edit, so nobody has to remember to record anything. If a date moved and you want to know who moved it and when, it is here.",
  },
  {
    id: "settings",
    goto: "/",
    target: ".nav .settings",
    title: "Settings — the four things you can change",
    body: "Change your name, which is what gets stamped on your edits. Replay this walkthrough. Event types — rename the options in that Type dropdown, or add your own. Who can sign in — a shared password, or invite people by email to sign in with Google. And change the team password, which signs everybody else out.",
  },
  {
    id: "done",
    goto: "/",
    title: "That's the whole thing",
    body: "You can replay this any time from Settings. Now go and put your next launch on the board.",
  },
];

// ---------------------------------------------------------------------------

type TourApi = { replay: () => void };
const TourControls = createContext<TourApi | null>(null);

export function useTour(): TourApi {
  const context = useContext(TourControls);
  if (!context) throw new Error("useTour must be used inside <TourProvider>");
  return context;
}

export function TourProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);

  // Restore where the reader had got to. Without this a route change — which
  // the tour now does on purpose — would drop them back at step one.
  useEffect(() => {
    const resumed = window.sessionStorage.getItem(OPEN_KEY) === "true";
    if (resumed) {
      setIndex(Number(window.sessionStorage.getItem(INDEX_KEY) ?? 0) || 0);
      setOpen(true);
    } else if (window.localStorage.getItem(DONE_KEY) !== "true") {
      setOpen(true);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.sessionStorage.setItem(OPEN_KEY, open ? "true" : "false");
    window.sessionStorage.setItem(INDEX_KEY, String(index));
  }, [open, index, ready]);

  const replay = useCallback(() => {
    window.localStorage.removeItem(DONE_KEY);
    setIndex(0);
    setOpen(true);
  }, []);

  const finish = useCallback(() => {
    window.localStorage.setItem(DONE_KEY, "true");
    window.sessionStorage.setItem(OPEN_KEY, "false");
    setOpen(false);
  }, []);

  return (
    <TourControls.Provider value={{ replay }}>
      {children}
      {/* Never over the sign-in screen. The provider wraps every route, and a
          first-time visitor arrives there before anywhere else — the tour would
          sit on top of the password box and block the way in. */}
      {ready && open && pathname !== "/password" && (
        <Walkthrough index={index} setIndex={setIndex} finish={finish} />
      )}
    </TourControls.Provider>
  );
}

function Walkthrough({
  index,
  setIndex,
  finish,
}: {
  index: number;
  setIndex: (value: number | ((current: number) => number)) => void;
  finish: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [rect, setRect] = useState<DOMRect | null>(null);
  // A dialog — the name prompt, change password, sign-in settings — has to be
  // usable while the tour is up. The tour paints above everything, so it steps
  // aside entirely rather than burying the dialog under its own dim.
  const [dialogOpen, setDialogOpen] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipHeight, setTipHeight] = useState(0);

  const step = STEPS[index];

  const readContext = useCallback(
    (): TourContext => ({
      path: window.location.pathname,
      editorOpen: Boolean(document.querySelector(".sheet")),
      statusMenuOpen: Boolean(document.querySelector(".status-menu__list")),
      filtered: Boolean(document.querySelector(".chip-filter--active")),
      hasCards: Boolean(document.querySelector(".card, .entry-row")),
    }),
    [],
  );

  const next = useCallback(() => {
    setIndex((current) => {
      let candidate = current + 1;
      while (candidate < STEPS.length) {
        const entry = STEPS[candidate];
        const onAnotherPage = entry.goto && entry.goto !== window.location.pathname;
        // Never skip on a missing target when the step lives on a page we have
        // not navigated to yet, or when it is an editor field that is about to
        // be rendered — in both cases "missing" only means "not yet".
        if (
          !entry.target ||
          entry.keepIfMissing ||
          onAnotherPage ||
          document.querySelector(entry.target)
        ) {
          break;
        }
        candidate += 1;
      }
      return candidate;
    });
  }, [setIndex]);

  useEffect(() => {
    if (index >= STEPS.length) finish();
  }, [index, finish]);

  // Take the reader to the screen this step is about.
  useEffect(() => {
    if (!step?.goto || step.goto === pathname) return;
    router.push(step.goto);
  }, [step, pathname, router]);

  // Watch for a dialog opening or closing.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setDialogOpen(Boolean(document.querySelector(".scrim > .dialog")));
    }, 200);
    return () => window.clearInterval(timer);
  }, []);

  /**
   * A step that waited for its target and never got one is skipped.
   *
   * Without this, "keep waiting" turned into "sit here forever pointing at
   * nothing" whenever the thing genuinely was not on the page — an empty week
   * has no card, so the status-menu step had nothing to highlight.
   */
  useEffect(() => {
    if (!step?.target || !step.keepIfMissing) return;
    if (document.querySelector(step.target)) return;

    const deadline = window.setTimeout(() => {
      if (!document.querySelector(step.target!)) next();
    }, 1200);

    return () => window.clearTimeout(deadline);
  }, [step, next]);

  useLayoutEffect(() => {
    const measured = tipRef.current?.offsetHeight ?? 0;
    if (measured && measured !== tipHeight) setTipHeight(measured);
  });

  // Keep the spotlight on the target through scrolling and layout changes.
  useEffect(() => {
    if (!step) return;
    let frame = 0;

    const loop = () => {
      if (step.target) {
        const el = document.querySelector(step.target);
        setRect(el ? el.getBoundingClientRect() : null);
      } else {
        setRect(null);
      }
      frame = window.requestAnimationFrame(loop);
    };

    const el = step.target ? document.querySelector(step.target) : null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });

    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [step]);

  // Action steps complete themselves.
  useEffect(() => {
    if (!step?.done) return;
    const timer = window.setInterval(() => {
      if (step.done!(readContext())) next();
    }, 250);
    return () => window.clearInterval(timer);
  }, [step, readContext, next]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      // Escape belongs to whatever is on top. While the editor, a dialog or a
      // status menu is open that keypress is meant for them — ending the tour
      // too would mean closing the editor mid-tour silently killed it.
      if (document.querySelector(".sheet, .dialog, .status-menu__list")) return;
      finish();
    };

    // Capture phase, deliberately. React's handlers run first on the way up, so
    // a bubbling listener would find the editor already closed and the guard
    // above would let the key through — ending the tour every time.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [finish]);

  if (!step || index >= STEPS.length) return null;
  // Yield the screen to a dialog rather than covering it.
  if (dialogOpen) return null;

  const pad = 8;
  const spotlight = rect && rect.width > 0
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  /**
   * Placed against the tip's measured height rather than a guess.
   *
   * The old version assumed 240px was enough room below; the longer steps are
   * closer to 400, so their buttons ended up under the bottom of the window
   * with no way to reach them.
   */
  const tipStyle: React.CSSProperties = spotlight
    ? (() => {
        const margin = 16;
        const height = tipHeight || 260;
        const left = Math.max(
          margin,
          Math.min(spotlight.left, window.innerWidth - 400),
        );

        const below = spotlight.top + spotlight.height + 14;
        const above = spotlight.top - height - 14;

        let top: number;
        if (below + height + margin <= window.innerHeight) {
          top = below;
        } else if (above >= margin) {
          top = above;
        } else {
          // Neither side fits — sit it where it is fully visible and let it
          // overlap the target rather than fall off the screen.
          top = Math.max(margin, window.innerHeight - height - margin);
        }

        return { top, left };
      })()
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div className="tour" role="dialog" aria-modal="false" aria-labelledby="tour-title">
      {spotlight ? (
        <div className="tour__spotlight" style={spotlight} aria-hidden />
      ) : (
        <div className="tour__dim" aria-hidden />
      )}

      <div className="tour__tip" style={tipStyle} ref={tipRef}>
        <div className="tour__progress">
          <span className="tour__count">
            {index + 1} of {STEPS.length}
          </span>
          <span className="tour__bar" aria-hidden>
            <span
              className="tour__bar-fill"
              style={{ width: `${((index + 1) / STEPS.length) * 100}%` }}
            />
          </span>
        </div>

        <h2 className="tour__title" id="tour-title">
          {step.title}
        </h2>
        <p className="tour__body">{step.body}</p>

        <div className="tour__actions">
          <button type="button" className="button button--quiet" onClick={finish}>
            Skip tour
          </button>

          {index > 0 && (
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
            >
              Back
            </button>
          )}

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
