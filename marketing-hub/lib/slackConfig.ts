/**
 * Slack settings, stored in the database and edited from inside the app.
 *
 * The bot token lives in the `settings` table rather than in a Worker secret,
 * for the same reason the team password and the Google client ID do: everything
 * configurable here is meant to be changeable without a redeploy, and somebody
 * handed this project should be able to switch Slack on without touching
 * wrangler. D1 is reachable only from the Worker, and the whole site sits
 * behind the sign-in gate, so the token is no more exposed than the password
 * hash beside it.
 *
 * It is still never sent to a browser. `slackSettings()` returns a masked
 * token; only `slackToken()` returns the real one, and only the server calls it.
 */

import { getDb } from "./db";
import { currentBrandId } from "./brandContext";

import { channelKeys } from "./channelOptions";
import type { ChannelKey } from "./types";

const TOKEN_KEY = "slack_token";
const ENABLED_KEY = "slack_enabled";
const DAY_BEFORE_KEY = "slack_day_before";
const TIME_KEY = "slack_reminder_time";
const ZONE_KEY = "slack_timezone";
const SWEPT_KEY = "slack_reminder_swept";
const BOARD_URL_KEY = "board_url";

/** Matches Pulse, which reports in the same timezone. */
export const DEFAULT_TIMEZONE = "America/Chicago";
export const DEFAULT_REMINDER_TIME = "09:00";

export type SlackChannelMap = Record<ChannelKey, { id: string; name: string }>;

export type SlackSettings = {
  enabled: boolean;
  /** `xoxb-…4f2a`, or "" when no token is set. Never the real thing. */
  tokenHint: string;
  hasToken: boolean;
  channels: SlackChannelMap;
  /** The day-before reminder, off unless a board asks for it. */
  dayBefore: boolean;
  reminderTime: string;
  timezone: string;
  boardUrl: string;
};

async function readSetting(key: string): Promise<string | null> {
  const row = await getDb()
    .prepare(`SELECT value FROM settings WHERE brand_id = ? AND key = ?`)
    .bind(await currentBrandId(), key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

async function writeSetting(key: string, value: string): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO settings (brand_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(brand_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(await currentBrandId(), key, value, new Date().toISOString())
    .run();
}

/**
 * Enough of the token to recognise, not enough to use.
 *
 * Slack tokens carry their kind in the prefix, so showing it lets somebody
 * confirm at a glance that they pasted a bot token and not a user one.
 */
export function maskToken(token: string): string {
  if (!token) return "";
  const prefix = token.slice(0, 5);
  const tail = token.slice(-4);
  return `${prefix}…${tail}`;
}

/** The real token. Server-side callers only — this must never reach a browser. */
export async function slackToken(): Promise<string> {
  const stored = await readSetting(TOKEN_KEY);
  if (stored) return stored;

  // A token set as a Worker var seeds the setting on first use, the same way
  // APP_PASSWORD seeds the password hash on a fresh deploy.
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const seed = (getCloudflareContext().env as { SLACK_BOT_TOKEN?: string }).SLACK_BOT_TOKEN;
  if (!seed) return "";

  await writeSetting(TOKEN_KEY, seed);
  return seed;
}

export async function channelMap(): Promise<SlackChannelMap> {
  const [{ results }, keys] = await Promise.all([
    getDb()
      .prepare(`SELECT channel_key, slack_id, slack_name FROM slack_channel_map WHERE brand_id = ?`)
      .bind(await currentBrandId())
      .all<{ channel_key: string; slack_id: string; slack_name: string }>(),
    channelKeys(),
  ]);

  // Only channels the board still has. A mapping for a removed one is deleted
  // with it, but a stale row must not resurrect a channel here either way.
  const map: SlackChannelMap = {};
  for (const row of results ?? []) {
    if (keys.includes(row.channel_key)) {
      map[row.channel_key] = { id: row.slack_id, name: row.slack_name };
    }
  }
  return map;
}

export async function slackSettings(): Promise<SlackSettings> {
  const [token, enabled, dayBefore, time, zone, boardUrl, channels] = await Promise.all([
    slackToken(),
    readSetting(ENABLED_KEY),
    readSetting(DAY_BEFORE_KEY),
    readSetting(TIME_KEY),
    readSetting(ZONE_KEY),
    readSetting(BOARD_URL_KEY),
    channelMap(),
  ]);

  return {
    // Nothing is sent anywhere until somebody deliberately switches it on, and
    // a board with no token cannot be on however the setting reads.
    enabled: enabled === "on" && Boolean(token),
    tokenHint: maskToken(token),
    hasToken: Boolean(token),
    channels,
    dayBefore: dayBefore === "on",
    reminderTime: time ?? DEFAULT_REMINDER_TIME,
    timezone: zone ?? DEFAULT_TIMEZONE,
    boardUrl: boardUrl ?? "",
  };
}

/** True when Slack is on, has a token, and at least one channel is mapped. */
export async function slackIsLive(): Promise<boolean> {
  const settings = await slackSettings();
  return settings.enabled && Object.keys(settings.channels).length > 0;
}

export function isValidTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** "09:00" — 24-hour, on the hour or the half, anything a picker emits. */
export function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

export async function setToken(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = typeof raw === "string" ? raw.trim() : "";

  // Clearing is deliberate and allowed; it also switches notifications off, so
  // an emptied token cannot leave the board thinking it is still posting.
  if (!token) {
    await Promise.all([writeSetting(TOKEN_KEY, ""), writeSetting(ENABLED_KEY, "off")]);
    return { ok: true };
  }

  if (!token.startsWith("xoxb-")) {
    return {
      ok: false,
      error: "A bot token starts with xoxb-. Copy the Bot User OAuth Token, not the app or user one.",
    };
  }

  await writeSetting(TOKEN_KEY, token);
  return { ok: true };
}

export async function setEnabled(on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  if (on && !(await slackToken())) {
    return { ok: false, error: "Add a bot token before switching notifications on." };
  }
  await writeSetting(ENABLED_KEY, on ? "on" : "off");
  return { ok: true };
}

export async function setDayBefore(on: boolean): Promise<void> {
  await writeSetting(DAY_BEFORE_KEY, on ? "on" : "off");
}

export async function setReminderTiming(
  time: unknown,
  zone: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const nextTime = typeof time === "string" ? time.trim() : "";
  const nextZone = typeof zone === "string" ? zone.trim() : "";

  if (!isValidTime(nextTime)) return { ok: false, error: "Use a time like 09:00." };
  if (!isValidTimezone(nextZone)) {
    return { ok: false, error: `“${nextZone}” is not a timezone name. Try America/Chicago.` };
  }

  await Promise.all([writeSetting(TIME_KEY, nextTime), writeSetting(ZONE_KEY, nextZone)]);
  return { ok: true };
}

export async function mapChannel(
  channelKey: unknown,
  slackId: unknown,
  slackName: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof channelKey !== "string" || !(await channelKeys()).includes(channelKey)) {
    return { ok: false, error: "That is not one of this board's channels." };
  }

  // An empty Slack id means "stop notifying this channel", which is a normal
  // thing to want and should not need a separate control.
  if (!slackId || typeof slackId !== "string") {
    await getDb()
      .prepare(`DELETE FROM slack_channel_map WHERE brand_id = ? AND channel_key = ?`)
      .bind(await currentBrandId(), channelKey)
      .run();
    return { ok: true };
  }

  await getDb()
    .prepare(
      `INSERT INTO slack_channel_map (brand_id, channel_key, slack_id, slack_name, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(brand_id, channel_key) DO UPDATE SET
         slack_id = excluded.slack_id,
         slack_name = excluded.slack_name,
         updated_at = excluded.updated_at`,
    )
    .bind(await currentBrandId(), channelKey, slackId, String(slackName ?? slackId), new Date().toISOString())
    .run();

  return { ok: true };
}

/**
 * Remembers where the board lives, so a message posted by the cron can link
 * back to it.
 *
 * The scheduled handler reaches the app through a synthetic request with no
 * real hostname, so the origin has to be captured from a request a person
 * made. Every visit to the Slack settings screen records it, and configuring
 * Slack at all means visiting that screen.
 */
export async function rememberBoardUrl(request: Request): Promise<void> {
  try {
    const origin = new URL(request.url).origin;
    if (!origin.startsWith("http") || origin.includes("cron.internal")) return;
    if ((await readSetting(BOARD_URL_KEY)) === origin) return;
    await writeSetting(BOARD_URL_KEY, origin);
  } catch {
    // A missing link is a worse message, not a failed request.
  }
}

/** The local calendar date in the board's timezone, as `YYYY-MM-DD`. */
export function localDate(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Minutes past local midnight in the board's timezone. */
export function localMinutes(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  const [hour, minute] = parts.split(":").map(Number);
  return hour * 60 + minute;
}

export async function lastReminderSweep(): Promise<string> {
  return (await readSetting(SWEPT_KEY)) ?? "";
}

export async function markReminderSweep(date: string): Promise<void> {
  await writeSetting(SWEPT_KEY, date);
}
