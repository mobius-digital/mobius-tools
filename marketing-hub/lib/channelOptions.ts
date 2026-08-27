/**
 * Marketing channels, editable per board.
 *
 * Channels are not labels the way event types are — the app branches on them.
 * The filter bar, "what's mine" elevation, clash detection and the Slack
 * mapping all read this list. That is exactly why the *set* is the thing a
 * board configures, while the shape of a channel stays fixed: a stable key
 * stored on every event, a label, and a priority drawn from the closed set of
 * primary / supporting / fyi. Add "Affiliate" here and it gets a filter chip, a
 * row in the event editor and a Slack mapping row with no code change.
 *
 * Stored as JSON in `settings`, like event types, so it travels with the board.
 */

import { getDb } from "./db";
import { currentBrandId } from "./brandContext";

import { DEFAULT_CHANNELS, hydrateChannels, type ChannelOption, type Channels } from "./types";
import { cleanLabel, keyFromLabel } from "./validation";

export type { ChannelOption };
export { hydrateChannels };

const SETTING_KEY = "channels";

/** Enough for any marketing org; past this the filter bar stops being a bar. */
export const MAX_CHANNELS = 12;

function isOption(value: unknown): value is ChannelOption {
  const option = value as ChannelOption;
  return (
    Boolean(option) &&
    typeof option.key === "string" &&
    typeof option.label === "string" &&
    option.key.length > 0 &&
    option.label.length > 0
  );
}

/** The configured list, falling back to the built-in four on a fresh board. */
export async function listChannels(): Promise<ChannelOption[]> {
  const row = await getDb()
    .prepare(`SELECT value FROM settings WHERE brand_id = ? AND key = ?`)
    .bind(await currentBrandId(), SETTING_KEY)
    .first<{ value: string }>();

  if (!row?.value) return [...DEFAULT_CHANNELS];

  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [...DEFAULT_CHANNELS];
    const options = parsed.filter(isOption);
    return options.length > 0 ? options : [...DEFAULT_CHANNELS];
  } catch {
    return [...DEFAULT_CHANNELS];
  }
}

export async function channelKeys(): Promise<string[]> {
  return (await listChannels()).map((option) => option.key);
}

/** A resolver from key to label, for anything rendering channels server-side. */
export async function channelLabeler(): Promise<(key: string) => string> {
  const options = await listChannels();
  return (key: string) => options.find((option) => option.key === key)?.label ?? key;
}

async function writeChannels(options: ChannelOption[]): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO settings (brand_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(brand_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(await currentBrandId(), SETTING_KEY, JSON.stringify(options), new Date().toISOString())
    .run();
}

/**
 * How many events currently involve each channel.
 *
 * Channels live inside a JSON column, so this is counted in the app rather
 * than in SQL. The events table is small — a planning board, not a ledger.
 */
export async function channelUsage(): Promise<Record<string, number>> {
  const { results } = await getDb()
    .prepare(`SELECT channels FROM events WHERE brand_id = ?`)
    .bind(await currentBrandId())
    .all<{ channels: string }>();

  const usage: Record<string, number> = {};
  for (const row of results ?? []) {
    let parsed: Channels;
    try {
      parsed = JSON.parse(row.channels) as Channels;
    } catch {
      continue;
    }
    for (const [key, state] of Object.entries(parsed)) {
      if (state?.involved) usage[key] = (usage[key] ?? 0) + 1;
    }
  }
  return usage;
}

type Result = { ok: true; channels: ChannelOption[] } | { ok: false; error: string };

export async function addChannel(rawLabel: unknown): Promise<Result> {
  const label = cleanLabel(rawLabel);
  if (!label) return { ok: false, error: "Use between 2 and 40 characters." };

  const key = keyFromLabel(label);
  if (!key) return { ok: false, error: "That name needs at least one letter or number." };
  if (key === "all") return { ok: false, error: "“All” is what the filter bar calls every channel together." };

  const channels = await listChannels();
  if (channels.length >= MAX_CHANNELS) {
    return { ok: false, error: `That is the most channels a board can have (${MAX_CHANNELS}).` };
  }
  if (channels.some((channel) => channel.key === key)) {
    return { ok: false, error: `“${label}” is already a channel.` };
  }

  const next = [...channels, { key, label }];
  await writeChannels(next);
  return { ok: true, channels: next };
}

export async function renameChannel(key: unknown, rawLabel: unknown): Promise<Result> {
  const label = cleanLabel(rawLabel);
  if (!label) return { ok: false, error: "Use between 2 and 40 characters." };

  const channels = await listChannels();
  if (!channels.some((channel) => channel.key === key)) {
    return { ok: false, error: "That channel no longer exists." };
  }

  // Only the label moves. Events, the Slack mapping and saved filters all hold
  // the key, so a rename never orphans anything.
  const next = channels.map((channel) =>
    channel.key === key ? { ...channel, label } : channel,
  );
  await writeChannels(next);
  return { ok: true, channels: next };
}

export async function removeChannel(key: unknown): Promise<Result> {
  const channels = await listChannels();
  if (channels.length <= 1) {
    return { ok: false, error: "Keep at least one channel — every event needs one." };
  }
  if (!channels.some((channel) => channel.key === key)) {
    return { ok: false, error: "That channel no longer exists." };
  }

  // A channel events still involve is refused rather than silently dropped
  // from them: those events would lose the record of who was on them.
  const usage = await channelUsage();
  const inUse = usage[key as string] ?? 0;
  if (inUse > 0) {
    return {
      ok: false,
      error: `${inUse} event${inUse === 1 ? " still involves" : "s still involve"} this channel. Take ${
        inUse === 1 ? "it" : "them"
      } off first.`,
    };
  }

  const next = channels.filter((channel) => channel.key !== key);
  await writeChannels(next);

  // Its Slack mapping goes with it, so nothing keeps posting to a room on
  // behalf of a channel that no longer exists.
  await getDb()
    .prepare(`DELETE FROM slack_channel_map WHERE brand_id = ? AND channel_key = ?`)
    .bind(await currentBrandId(), key as string)
    .run();

  return { ok: true, channels: next };
}
