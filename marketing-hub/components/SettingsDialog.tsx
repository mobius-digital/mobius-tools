"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDisplayName } from "./DisplayName";
import { useTour } from "./Tour";
import { UsersPanel } from "./UsersPanel";
import { EventTypesPanel } from "./EventTypesPanel";
import { SlackPanel } from "./SlackPanel";
import { ChannelsPanel } from "./ChannelsPanel";
import { InstallPanel } from "./InstallPanel";
import { CloseButton, DirtyProvider, useCloseGuard, useDirtyTracker } from "./UnsavedGuard";

/**
 * Settings, as one window with a rail of sections down the left — the shape
 * every desktop app settles on, and the reason it does: a person can see
 * everything the board can be told to do without opening anything.
 *
 * It replaces a dropdown of eight items, each of which opened a dialog of its
 * own. That worked, but the list vanished the moment you chose from it, so
 * finding a setting meant remembering which of eight labels it lived under,
 * and closing your way back out when it did not. Here the list stays put and
 * only the pane beside it changes.
 *
 * Each section is its own component and fetches its own data, so nothing loads
 * until that section is opened.
 */

type SectionId = "you" | "tour" | "install" | "types" | "channels" | "slack" | "users";

type Section = {
  id: SectionId;
  /** The rail label. Short — it has to read as a list. */
  label: string;
  /** One line under the label in the rail. */
  hint: string;
  group: string;
};

const SECTIONS: Section[] = [
  {
    id: "you",
    label: "Your account",
    hint: "The name stamped on your edits",
    group: "You",
  },
  /*
   * Its own row rather than a button inside Your account. In the old dropdown
   * "Replay the walkthrough" was visible at a glance; buried one click in,
   * under a heading that does not say "tour", it may as well not exist — the
   * first person to look for it could not find it.
   */
  {
    id: "tour",
    label: "Walkthrough",
    hint: "Replay the two-minute tour",
    group: "You",
  },
  {
    id: "install",
    label: "Add to your phone",
    hint: "An icon on your home screen",
    group: "You",
  },
  {
    id: "types",
    label: "Event types",
    hint: "The options in the Type dropdown",
    group: "This board",
  },
  {
    id: "channels",
    label: "Channels",
    hint: "Paid, Email, Organic — and any you add",
    group: "This board",
  },
  {
    id: "slack",
    label: "Slack notifications",
    hint: "Which Slack channel hears about which",
    group: "This board",
  },
  {
    id: "users",
    label: "Users",
    hint: "Who can open this board",
    group: "Access",
  },
];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState<SectionId>("you");
  const paneRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);

  // Most of this window saves the instant you change something, so there is
  // usually nothing to warn about. The exceptions are the boxes you type into
  // before pressing anything — a new channel, an invitation, a new password —
  // and each panel says for itself when it is holding one.
  const { dirty, report } = useDirtyTracker();
  const { requestClose, prompt } = useCloseGuard(dirty, onClose);

  // The rail is a tablist, so the arrow keys have to move between sections the
  // way they do in every other one.
  function onRailKey(event: React.KeyboardEvent) {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = SECTIONS.findIndex((section) => section.id === active);
    const next = SECTIONS[(index + step + SECTIONS.length) % SECTIONS.length];
    setActive(next.id);
    railRef.current
      ?.querySelector<HTMLButtonElement>(`[data-section="${next.id}"]`)
      ?.focus();
  }

  // A pane left half-scrolled would carry that scroll into the next section,
  // which reads as a section that opened halfway down.
  useEffect(() => {
    paneRef.current?.scrollTo({ top: 0 });
  }, [active]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, Section[]>();
    for (const section of SECTIONS) {
      if (!byGroup.has(section.group)) {
        byGroup.set(section.group, []);
        order.push(section.group);
      }
      byGroup.get(section.group)!.push(section);
    }
    return order.map((name) => ({ name, sections: byGroup.get(name)! }));
  }, []);

  const current = SECTIONS.find((section) => section.id === active)!;

  return (
    <div
      className="scrim"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        className="dialog dialog--settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") requestClose();
        }}
      >
        <header className="settings-window__head">
          <h2 className="dialog__title" id="settings-title">
            Settings
          </h2>
          <CloseButton onClose={requestClose} label="Close settings" />
        </header>

        <div className="settings-window__body">
          <div
            className="settings-rail"
            role="tablist"
            aria-orientation="vertical"
            aria-label="Settings sections"
            ref={railRef}
            onKeyDown={onRailKey}
          >
            {groups.map((group) => (
              <div className="settings-rail__group" key={group.name}>
                <p className="settings-rail__heading">{group.name}</p>
                {group.sections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    role="tab"
                    data-section={section.id}
                    id={`settings-tab-${section.id}`}
                    aria-selected={active === section.id}
                    aria-controls="settings-pane"
                    tabIndex={active === section.id ? 0 : -1}
                    className={`settings-rail__item${
                      active === section.id ? " settings-rail__item--active" : ""
                    }`}
                    onClick={() => setActive(section.id)}
                  >
                    <span className="settings-rail__label">{section.label}</span>
                    <span className="settings-rail__hint">{section.hint}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div
            className="settings-pane"
            id="settings-pane"
            role="tabpanel"
            aria-labelledby={`settings-tab-${active}`}
            tabIndex={-1}
            ref={paneRef}
          >
            <h3 className="settings-pane__title">{current.label}</h3>

            <DirtyProvider report={report}>
              {active === "you" && <AccountPanel />}
              {active === "tour" && <WalkthroughPanel onClose={onClose} />}
              {active === "install" && <InstallPanel />}
              {active === "types" && <EventTypesPanel />}
              {active === "channels" && <ChannelsPanel />}
              {active === "slack" && <SlackPanel />}
              {active === "users" && <UsersPanel />}
            </DirtyProvider>
          </div>
        </div>

        {prompt}
      </div>
    </div>
  );
}

/** The name a person's edits are stamped with. */
function AccountPanel() {
  const { name, promptForName, verified } = useDisplayName();

  return (
    <>
      <p className="dialog__body">
        Your edits are stamped with this name, so the changelog can say who
        moved a launch.{" "}
        {verified
          ? "It is saved against your account, so it is the same on every device and every board you can open."
          : "This board was opened with the shared password, so there is no account to keep it on — it is remembered on this device only."}
      </p>
      <div className="settings-fact">
        <span className="settings-fact__label">
          {verified ? "Signed in as" : "Editing as"}
        </span>
        <span className="settings-fact__value">
          {name || "Not set on this device yet"}
        </span>
        <button
          type="button"
          className="button"
          onClick={() => void promptForName()}
        >
          {name ? "Change" : "Set your name"}
        </button>
      </div>
    </>
  );
}

/** Replaying the tour, and saying plainly what it will do. */
function WalkthroughPanel({ onClose }: { onClose: () => void }) {
  const { replay } = useTour();

  return (
    <>
      <p className="dialog__body">
        A two-minute tour of the board — the pipeline, the calendar, what makes
        a date confirmed rather than tentative, the clash warnings, and the
        changelog. It runs by itself the first time somebody opens this board,
        and it is remembered per board, so a team given their own still gets it.
      </p>
      <p className="dialog__body">
        Replaying it is safe: it only points at things and never changes
        anything on the board.
      </p>
      {/* The tour points at the board behind this window, so the window has to
          get out of its way first. */}
      <button
        type="button"
        className="button button--primary"
        onClick={() => {
          onClose();
          replay();
        }}
      >
        Replay the walkthrough
      </button>
    </>
  );
}
