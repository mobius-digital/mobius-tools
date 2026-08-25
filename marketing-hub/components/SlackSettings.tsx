"use client";

import { useBrand } from "./BrandProvider";
import { useCallback, useEffect, useState } from "react";
import { useDisplayName } from "./DisplayName";
import type { ChannelKey, ChannelOption } from "@/lib/types";

/**
 * Slack notifications, configured from inside the app.
 *
 * Ordered as the job actually goes: connect a bot, say which Slack channel
 * hears about which marketing channel, then switch it on. The switch is last
 * and stays off until the first two steps are done, so nobody turns on
 * notifications that have nowhere to go.
 *
 * The token is write-only from here. What comes back is a masked hint —
 * enough to recognise which token is in place, never enough to use.
 */

type SlackChannel = {
  id: string;
  name: string;
  isMember: boolean;
  isPrivate: boolean;
};

type Settings = {
  enabled: boolean;
  tokenHint: string;
  hasToken: boolean;
  channels: Record<ChannelKey, { id: string; name: string }>;
  /** The board's own channels — the rows of the mapping. */
  marketingChannels: ChannelOption[];
  dayBefore: boolean;
  reminderTime: string;
  timezone: string;
  boardUrl: string;
  slackChannels: SlackChannel[] | null;
  channelError?: string;
  connected?: string;
  sent?: boolean;
  /** Changes waiting for their 15-minute window to close. */
  pending: number;
  nextDue: string | null;
  flushed?: number;
};

export function SlackSettings({ onClose }: { onClose: () => void }) {
  const { path } = useBrand();
  const { ensureName } = useDisplayName();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [token, setToken] = useState("");
  const [time, setTime] = useState("");
  const [zone, setZone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<ChannelKey | null>(null);

  const absorb = useCallback((body: Settings) => {
    setSettings(body);
    setTime(body.reminderTime);
    setZone(body.timezone);
  }, []);

  useEffect(() => {
    fetch(path("/api/settings/slack?channels=1"))
      .then((r) => r.json() as Promise<Settings>)
      .then(absorb)
      .catch(() => setError("Could not load the Slack settings."));
  }, [absorb]);

  const send = useCallback(
    async (payload: Record<string, unknown>) => {
      const editor = await ensureName();
      if (!editor) return false;

      setBusy(true);
      setError(null);
      setNote(null);

      try {
        const response = await fetch(path("/api/settings/slack"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, editor }),
        });

        const body = (await response.json().catch(() => ({}))) as Settings & {
          error?: string;
        };

        if (!response.ok) {
          setError(body.error ?? "Could not save that.");
          return false;
        }

        // A save that did not ask for the channel list must not wipe the one
        // already on screen, or every toggle would empty the pickers.
        absorb({ ...body, slackChannels: body.slackChannels ?? settings?.slackChannels ?? null });
        if (body.connected) setNote(body.connected);
        if (body.sent) setNote("Sent — check the channel.");
        if (typeof body.flushed === "number") {
          setNote(
            body.flushed === 0
              ? "Nothing was waiting."
              : `Sent ${body.flushed} message${body.flushed === 1 ? "" : "s"} — check Slack.`,
          );
        }
        return true;
      } catch {
        setError("Network error — check your connection and try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [absorb, ensureName, settings?.slackChannels],
  );

  async function saveToken() {
    if (await send({ action: "set-token", token })) setToken("");
  }

  async function test(channelKey: ChannelKey, slackId: string) {
    setTesting(channelKey);
    await send({ action: "test", slackId });
    setTesting(null);
  }

  const mapped = settings ? Object.keys(settings.channels).length : 0;
  const canEnable = Boolean(settings?.hasToken) && mapped > 0;

  return (
    <div
      className="scrim"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="slack-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <h2 className="dialog__title" id="slack-title">
          Slack notifications
        </h2>

        {error && (
          <p className="field__error field__error--banner" role="alert">
            {error}
          </p>
        )}
        {note && (
          <p className="dialog__note" role="status">
            {note}
          </p>
        )}

        {!settings ? (
          <p className="dialog__body">Loading…</p>
        ) : (
          <>
            <p className="dialog__body">
              When an event is created, moves its launch date, changes status,
              gets its assets link or has its note written, every Slack channel
              mapped to the marketing channels on that event hears about it —
              one short message per event. Several edits to the same event within 15 minutes arrive as
              one message, not five.
            </p>

            {/* Needed once. Folded away afterwards, like the Google client ID. */}
            <details className="disclose" open={!settings.hasToken}>
              <summary className="disclose__summary">
                Slack bot token
                <span className="disclose__state">
                  {settings.hasToken ? settings.tokenHint : "not set yet"}
                </span>
              </summary>

              <p className="dialog__body">
                From your Slack app's <strong>OAuth &amp; Permissions</strong> page —
                the <em>Bot User OAuth Token</em>, starting <code>xoxb-</code>. It
                needs the <code>chat:write</code>, <code>channels:read</code> and{" "}
                <code>groups:read</code> scopes, and the bot has to be invited to
                each channel you want it to post in (<code>/invite @your-bot</code>).
              </p>

              <div className="emails__add">
                <input
                  className="input"
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="xoxb-…"
                  aria-label="Slack bot token"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="button"
                  disabled={busy || !token.trim()}
                  onClick={() => void saveToken()}
                >
                  Save
                </button>
              </div>

              {settings.hasToken && (
                <p className="dialog__body dialog__body--muted">
                  A token is set. Saving a new one replaces it; saving an empty one
                  removes it and switches notifications off.
                </p>
              )}
            </details>

            <hr className="dialog__rule" />

            <h3 className="dialog__section">Where each channel posts</h3>

            {settings.channelError && (
              <p className="dialog__body dialog__body--muted">{settings.channelError}</p>
            )}

            {!settings.hasToken ? (
              <p className="dialog__body dialog__body--muted">
                Add a bot token above and the channel list will appear here.
              </p>
            ) : (
              <ul className="slack-map">
                {settings.marketingChannels.map(({ key, label }) => {
                  const current = settings.channels[key];

                  return (
                    <li key={key} className="slack-map__row">
                      <span className="slack-map__label">{label}</span>

                      <select
                        className="select"
                        value={current?.id ?? ""}
                        disabled={busy || !settings.slackChannels}
                        aria-label={`Slack channel for ${label}`}
                        onChange={(event) => {
                          const slackId = event.target.value;
                          const match = settings.slackChannels?.find(
                            (channel) => channel.id === slackId,
                          );
                          void send({
                            action: "map",
                            channelKey: key,
                            slackId,
                            slackName: match?.name ?? "",
                          });
                        }}
                      >
                        <option value="">Don't notify</option>
                        {/* A channel the bot is not in cannot be posted to, so
                            it is offered but labelled rather than hidden — the
                            fix is one /invite away and worth naming. */}
                        {settings.slackChannels?.map((channel) => (
                          <option key={channel.id} value={channel.id}>
                            {channel.isPrivate ? "🔒" : "#"}
                            {channel.name}
                            {channel.isMember ? "" : " — invite the bot first"}
                          </option>
                        ))}
                      </select>

                      {current ? (
                        <button
                          type="button"
                          className="button button--quiet button--small"
                          disabled={busy}
                          onClick={() => void test(key, current.id)}
                        >
                          {testing === key ? "Sending…" : "Test"}
                        </button>
                      ) : (
                        <span className="slack-map__unmapped">notifies nowhere</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <hr className="dialog__rule" />

            <h3 className="dialog__section">Reminders</h3>
            <p className="dialog__body">
              A nudge before each launch, to the same channels. Sent once a day at
              the time below, in your timezone.
            </p>

            <div className="slack-timing">
              <label className="field">
                <span className="field__label">Send at</span>
                <input
                  className="input"
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  onBlur={() => void send({ action: "timing", reminderTime: time, timezone: zone })}
                  disabled={busy}
                />
              </label>

              <label className="field">
                <span className="field__label">Timezone</span>
                <input
                  className="input"
                  value={zone}
                  onChange={(event) => setZone(event.target.value)}
                  onBlur={() => void send({ action: "timing", reminderTime: time, timezone: zone })}
                  placeholder="America/Chicago"
                  disabled={busy}
                />
              </label>
            </div>

            <p className="dialog__body dialog__body--muted">
              One week before each launch, always.
            </p>

            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.dayBefore}
                disabled={busy}
                onChange={(event) =>
                  void send({ action: "day-before", dayBefore: event.target.checked })
                }
              />
              Also remind the day before
            </label>

            <hr className="dialog__rule" />

            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.enabled}
                disabled={busy || (!settings.enabled && !canEnable)}
                onChange={(event) =>
                  void send({ action: "set-enabled", enabled: event.target.checked })
                }
              />
              Send notifications to Slack
            </label>

            {!canEnable && !settings.enabled && (
              <p className="dialog__body dialog__body--muted">
                {!settings.hasToken
                  ? "Add a bot token first."
                  : "Map at least one channel above first."}
              </p>
            )}

            {/* The queue. Changes wait up to 15 minutes so a flurry of edits is
                one message; this is the override for when something has to go
                out now — and for testing without watching the clock. */}
            {settings.enabled && (
              <p className="slack-queue">
                {settings.pending === 0
                  ? "Nothing waiting to send."
                  : `${settings.pending} change${settings.pending === 1 ? "" : "s"} waiting for the next window.`}
                {settings.pending > 0 && (
                  <button
                    type="button"
                    className="button button--small button--outline"
                    disabled={busy}
                    onClick={() => void send({ action: "flush" })}
                  >
                    Send now
                  </button>
                )}
              </p>
            )}
          </>
        )}

        <div className="dialog__actions">
          <button type="button" className="button button--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
