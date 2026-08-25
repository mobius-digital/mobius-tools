"use client";

import { useEffect, useRef, useState } from "react";
import { useDisplayName } from "./DisplayName";
import { ChangePassword } from "./ChangePassword";
import { SignInSettings } from "./SignInSettings";
import { EventTypeSettings } from "./EventTypeSettings";
import { SlackSettings } from "./SlackSettings";
import { ChannelSettings } from "./ChannelSettings";
import { InstallGuide } from "./InstallGuide";
import { BoardSettings } from "./BoardSettings";
import { useTour } from "./Tour";

/**
 * The small settings menu in the nav.
 *
 * Deliberately thin: this tool has no accounts and almost no preferences, so the
 * menu holds only the things a person genuinely needs to reach again — who they
 * are editing as, and replaying the tour.
 */
export function SettingsMenu() {
  const { name, promptForName, verified } = useDisplayName();
  const { replay } = useTour();
  const [open, setOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [editingSignIn, setEditingSignIn] = useState(false);
  const [editingTypes, setEditingTypes] = useState(false);
  const [editingSlack, setEditingSlack] = useState(false);
  const [editingChannels, setEditingChannels] = useState(false);
  const [showingInstall, setShowingInstall] = useState(false);
  const [editingBoards, setEditingBoards] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="settings" ref={wrapRef}>
      <button
        type="button"
        className="settings__trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Settings"
        title="Settings"
      >
        Settings
        <span className="settings__caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="settings__list" role="menu">
          {verified ? (
            <div className="settings__item settings__item--static">
              <span className="settings__label">Signed in as {name}</span>
              <span className="settings__hint">Verified by your organisation's login</span>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="settings__item"
              onClick={() => {
                setOpen(false);
                void promptForName();
              }}
            >
              <span className="settings__label">Change your name</span>
              <span className="settings__hint">
                {name ? `Editing as ${name}` : "Not set on this device yet"}
              </span>
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            className="settings__item"
            onClick={() => {
              setOpen(false);
              replay();
            }}
          >
            <span className="settings__label">Replay the walkthrough</span>
            <span className="settings__hint">A two-minute tour of the board</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="settings__item"
            onClick={() => {
              setOpen(false);
              setShowingInstall(true);
            }}
          >
            <span className="settings__label">Add to your phone</span>
            <span className="settings__hint">
              An icon on your home screen, full-screen, no App Store
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="settings__item"
            onClick={() => {
              setOpen(false);
              setEditingTypes(true);
            }}
          >
            <span className="settings__label">Event types</span>
            <span className="settings__hint">
              The options in the Type dropdown
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="settings__item"
            onClick={() => {
              setOpen(false);
              setEditingChannels(true);
            }}
          >
            <span className="settings__label">Channels</span>
            <span className="settings__hint">
              Paid, Email, Organic, SMS — and any you add
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="settings__item"
            onClick={() => {
              setOpen(false);
              setEditingSlack(true);
            }}
          >
            <span className="settings__label">Slack notifications</span>
            <span className="settings__hint">
              Which Slack channel hears about which marketing channel
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="settings__item"
            onClick={() => {
              setOpen(false);
              setEditingBoards(true);
            }}
          >
            <span className="settings__label">Other boards</span>
            <span className="settings__hint">
              Link your other brands&apos; boards — the name up top becomes a switcher
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="settings__item"
            onClick={() => {
              setOpen(false);
              setEditingSignIn(true);
            }}
          >
            <span className="settings__label">Who can sign in</span>
            <span className="settings__hint">
              Shared password, or invite people by email
            </span>
          </button>

          {/* The shared password is unused when your organisation's login is
              handling sign-in, so offering to change it would only confuse. */}
          {!verified && (
            <button
              type="button"
              role="menuitem"
              className="settings__item"
              onClick={() => {
                setOpen(false);
                setChangingPassword(true);
              }}
            >
              <span className="settings__label">Change the team password</span>
              <span className="settings__hint">Signs everybody out</span>
            </button>
          )}
        </div>
      )}

      {changingPassword && (
        <ChangePassword onClose={() => setChangingPassword(false)} />
      )}

      {editingSignIn && <SignInSettings onClose={() => setEditingSignIn(false)} />}

      {editingTypes && <EventTypeSettings onClose={() => setEditingTypes(false)} />}

      {editingSlack && <SlackSettings onClose={() => setEditingSlack(false)} />}

      {editingChannels && <ChannelSettings onClose={() => setEditingChannels(false)} />}

      {showingInstall && <InstallGuide onClose={() => setShowingInstall(false)} />}

      {editingBoards && <BoardSettings onClose={() => setEditingBoards(false)} />}
    </div>
  );
}
