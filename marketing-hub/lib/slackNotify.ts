/**
 * Deciding what Slack hears about, and when.
 *
 * Two halves. Writes go through `queue*`, called from `lib/events.ts` on the
 * same path that writes the changelog — a notification and a history entry come
 * from the same edit, so they are decided in the same place. Sends go through
 * `flushOutbox` and `runReminders`, called only by the cron tick.
 *
 * Nothing here may throw into a save. A Slack outage must never fail an edit
 * the user has already watched succeed, which is the same rule `recordChanges`
 * follows and for the same reason.
 *
 * The rules themselves — which edits are news, who hears about them, and when
 * the batch window closes — live in `lib/slackPlan.ts`, where they are pure
 * and directly testable. This module is the part that talks to D1 and Slack.
 *
 * The window is global, so everything touched before standup goes out together
 * when it closes — one short message per event, with that event's edits merged.
 */

import { getDb, rowToEvent } from "./db";
import { currentBrand, currentBrandId } from "./brandContext";
import { channelLabeller } from "./channelOptions";
import { listEventTypes } from "./eventTypes";
import { addDays, todayIso } from "./dates";
import { postMessage } from "./slack";
import {
  channelMap,
  lastReminderSweep,
  localDate,
  localMinutes,
  markReminderSweep,
  slackSettings,
  slackToken,
  type SlackChannelMap,
} from "./slackConfig";
import {
  buildEventMessage,
  buildReminderMessage,
  type NotifyItem,
  type NotifyKind,
} from "./slackMessage";
import {
  foldItem,
  involvedChannels,
  nextDueAt,
  planForChange,
  planForCreation,
  type PlannedNotice,
} from "./slackPlan";
import { type ChannelKey, type LaunchEvent } from "./types";

/** Give up on a stubborn row rather than retrying it for ever. */
const MAX_ATTEMPTS = 5;

/** A ceiling on one tick's work, so a backlog cannot blow the CPU limit. */
const FLUSH_LIMIT = 200;

type OutboxRow = {
  id: string;
  event_id: string;
  event_name: string;
  kind: NotifyKind;
  lines: string;
  channel_keys: string;
  actor: string;
  attempts: number;
  sent_to: string;
};

/**
 * Reads one event.
 *
 * Deliberately not `getEvent` from `lib/events.ts`: that module calls into this
 * one, and importing it back would make the pair circular. A four-line query is
 * cheaper than the fragility.
 */
async function readEvent(id: string): Promise<LaunchEvent | null> {
  const row = await getDb()
    .prepare(
      `SELECT id, name, type, status, brief, launch_date, promo_end_date,
        inventory_date, asset_deadline, teaser_start, channels, owner, notes,
        assets_link, created_at, updated_at, updated_by
       FROM events WHERE brand_id = ? AND id = ?`,
    )
    .bind(await currentBrandId(), id)
    .first();

  return row ? rowToEvent(row) : null;
}

function parseList(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * When the current window closes.
 *
 * Joins an open one if there is one; otherwise opens a new window from now.
 */
async function windowDueAt(now: Date): Promise<string> {
  const row = await getDb()
    .prepare(
      `SELECT MIN(due_at) AS due FROM slack_outbox
       WHERE brand_id = ? AND sent_at IS NULL AND due_at > ?`,
    )
    .bind(await currentBrandId(), now.toISOString())
    .first<{ due: string | null }>();

  return nextDueAt(row?.due ?? null, now);
}

async function enqueue(
  event: LaunchEvent,
  kind: NotifyKind,
  lines: string[],
  actor: string,
  targets: ChannelKey[],
): Promise<void> {
  if (targets.length === 0) return;

  const now = new Date();
  await getDb()
    .prepare(
      `INSERT INTO slack_outbox
         (id, brand_id, event_id, event_name, kind, lines, channel_keys, actor, created_at, due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      await currentBrandId(),
      event.id,
      event.name,
      kind,
      JSON.stringify(lines),
      JSON.stringify(targets),
      actor,
      now.toISOString(),
      await windowDueAt(now),
    )
    .run();
}

/**
 * True when there is any point queueing at all.
 *
 * Checked before every write so a board that has never configured Slack does
 * not silently accumulate outbox rows nobody will ever send.
 */
async function shouldQueue(): Promise<boolean> {
  const settings = await slackSettings();
  return settings.enabled && Object.keys(settings.channels).length > 0;
}

async function enqueuePlan(
  event: LaunchEvent,
  actor: string,
  notices: PlannedNotice[],
): Promise<void> {
  for (const notice of notices) {
    await enqueue(event, notice.kind, notice.lines, actor, notice.targets);
  }
}

/** A new event: everybody involved hears the whole thing. */
export async function queueCreated(event: LaunchEvent, actor: string): Promise<void> {
  try {
    if (!(await shouldQueue())) return;
    await enqueuePlan(event, actor, planForCreation(event));
  } catch (error) {
    console.error("Slack queue (created) failed:", error);
  }
}

/**
 * An edited event.
 *
 * `lines` is the changelog diff, passed in rather than recomputed: whatever the
 * history panel says about this edit is exactly what Slack says. Which of those
 * edits are worth a message, and to whom, is `planForChange`.
 */
export async function queueChanged(
  before: LaunchEvent,
  after: LaunchEvent,
  lines: string[],
  actor: string,
): Promise<void> {
  try {
    if (!(await shouldQueue())) return;
    await enqueuePlan(after, actor, planForChange(before, after, lines));
  } catch (error) {
    console.error("Slack queue (changed) failed:", error);
  }
}

/* ------------------------------------------------------------------ */
/*  Sending                                                            */
/* ------------------------------------------------------------------ */

/** A Slack channel's worth of batched items, each with the rows that fed it. */
type Bundle = {
  slackId: string;
  /** The marketing channel whose lens the links should carry. */
  channelKey: ChannelKey;
  items: NotifyItem[];
  /** event id → outbox rows folded into that event's item. */
  rowsByEvent: Map<string, string[]>;
};

/** Slack's per-channel posting limit is about one a second; this stays under it. */
const POST_GAP_MS = 350;

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function typeLabeller(): Promise<(key: string) => string> {
  const types = await listEventTypes();
  return (key: string) => types.find((option) => option.key === key)?.label ?? key;
}

/**
 * Posts everything whose window has closed.
 *
 * Rows are marked per Slack channel, not wholesale: a row that reaches #paid
 * but fails on #email is retried only for #email, so nobody gets a duplicate
 * because somebody else's channel was misconfigured.
 */
export async function flushOutbox(
  now: Date = new Date(),
  options: { force?: boolean } = {},
): Promise<{ posted: number }> {
  const db = getDb();
  const stamp = now.toISOString();

  // `force` is the Settings screen's "Send now": everything waiting goes,
  // window or not. Used to test the wiring, and for the day somebody needs a
  // change out *this minute* rather than in fifteen.
  const { results } = await db
    .prepare(
      `SELECT id, event_id, event_name, kind, lines, channel_keys, actor, attempts, sent_to
       FROM slack_outbox
       WHERE brand_id = ? AND sent_at IS NULL AND (due_at <= ? OR ?)
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .bind(await currentBrandId(), stamp, options.force ? 1 : 0, FLUSH_LIMIT)
    .all<OutboxRow>();

  const rows = results ?? [];
  if (rows.length === 0) return { posted: 0 };

  const settings = await slackSettings();

  // Switched off, or unconfigured, while these were waiting. Drop them rather
  // than posting news that is now unwanted or hours stale.
  if (!settings.enabled) {
    await db
      .prepare(
        `UPDATE slack_outbox SET sent_at = ? WHERE brand_id = ? AND sent_at IS NULL AND (due_at <= ? OR ?)`,
      )
      .bind(stamp, await currentBrandId(), stamp, options.force ? 1 : 0)
      .run();
    return { posted: 0 };
  }

  const [token, map, typeLabel, channelLabel] = await Promise.all([
    slackToken(),
    channelMap(),
    typeLabeller(),
    channelLabeller(),
  ]);
  const { colors } = await currentBrand();

  // One read per distinct event, rendered from the current row rather than a
  // snapshot: a message that goes out at 09:15 should describe the event as it
  // stands at 09:15, even though the change that triggered it landed at 09:02.
  const events = new Map<string, LaunchEvent | null>();
  for (const row of rows) {
    if (!events.has(row.event_id)) events.set(row.event_id, await readEvent(row.event_id));
  }

  const bundles = new Map<string, Bundle>();
  /** Rows with nowhere left to go — already delivered, or their event is gone. */
  const finished = new Set<string>();

  for (const row of rows) {
    const event = events.get(row.event_id) ?? null;
    if (!event) {
      finished.add(row.id);
      continue;
    }

    const alreadySent = new Set(parseList(row.sent_to));
    const item: NotifyItem = {
      kind: row.kind,
      event,
      lines: [...parseList(row.lines)],
      actor: row.actor,
    };

    let pending = 0;
    for (const channelKey of parseList(row.channel_keys) as ChannelKey[]) {
      const target = (map as SlackChannelMap)[channelKey];
      if (!target || alreadySent.has(target.id)) continue;

      pending += 1;
      const bundle = bundles.get(target.id) ?? {
        slackId: target.id,
        channelKey,
        items: [],
        rowsByEvent: new Map<string, string[]>(),
      };
      const rowsForEvent = bundle.rowsByEvent.get(row.event_id) ?? [];
      rowsForEvent.push(row.id);
      bundle.rowsByEvent.set(row.event_id, rowsForEvent);
      foldItem(bundle.items, item);
      bundles.set(target.id, bundle);
    }

    // Every channel this row named is unmapped or already served.
    if (pending === 0) finished.add(row.id);
  }

  let posted = 0;

  // One message per event per Slack channel — never a digest. Slack folds a
  // tall attachment behind "Show more", which once hid a brand-new event under
  // another event's date change. Several edits to one event are still one
  // message: the fold above merged them into a single item.
  for (const bundle of bundles.values()) {
    let first = true;
    for (const item of bundle.items) {
      if (!first) await pause(POST_GAP_MS);
      first = false;

      const message = buildEventMessage(item, {
        channelKey: bundle.channelKey,
        boardUrl: settings.boardUrl,
        typeLabel,
        channelLabel,
        accent: colors.primary,
        danger: colors.danger,
      });

      const result = await postMessage(token, bundle.slackId, message);
      const rowIds = [...new Set(bundle.rowsByEvent.get(item.event.id) ?? [])];

      if (result.ok) {
        posted += 1;
        for (const rowId of rowIds) {
          const row = rows.find((candidate) => candidate.id === rowId);
          if (!row) continue;
          const sentTo = [...new Set([...parseList(row.sent_to), bundle.slackId])];
          row.sent_to = JSON.stringify(sentTo);
          await db
            .prepare(`UPDATE slack_outbox SET sent_to = ? WHERE id = ?`)
            .bind(row.sent_to, rowId)
            .run();
        }
      } else {
        console.error(`Slack post to ${bundle.slackId} failed: ${result.error}`);
        for (const rowId of rowIds) {
          await db
            .prepare(`UPDATE slack_outbox SET attempts = attempts + 1 WHERE id = ?`)
            .bind(rowId)
            .run();
        }
      }
    }
  }

  // A row is done when every channel it named has been served, or when it has
  // been tried enough times that something is clearly wrong with its target.
  for (const row of rows) {
    if (finished.has(row.id)) continue;

    const alreadySent = new Set(parseList(row.sent_to));
    const outstanding = (parseList(row.channel_keys) as ChannelKey[]).filter((key) => {
      const target = (map as SlackChannelMap)[key];
      return target && !alreadySent.has(target.id);
    });

    if (outstanding.length === 0) finished.add(row.id);
    else if (row.attempts + 1 >= MAX_ATTEMPTS) {
      console.error(`Giving up on Slack notification ${row.id} for "${row.event_name}".`);
      finished.add(row.id);
    }
  }

  for (const rowId of finished) {
    await db
      .prepare(`UPDATE slack_outbox SET sent_at = ? WHERE id = ?`)
      .bind(stamp, rowId)
      .run();
  }

  return { posted };
}

/* ------------------------------------------------------------------ */
/*  Reminders                                                          */
/* ------------------------------------------------------------------ */

const REMINDER_OFFSETS = { week: 7, day: 1 } as const;

type ReminderKind = keyof typeof REMINDER_OFFSETS;

async function alreadyReminded(
  eventId: string,
  kind: ReminderKind,
  launchDate: string,
): Promise<boolean> {
  const row = await getDb()
    .prepare(
      `SELECT 1 AS ok FROM slack_reminders_sent
       WHERE brand_id = ? AND event_id = ? AND kind = ? AND launch_date = ?`,
    )
    .bind(await currentBrandId(), eventId, kind, launchDate)
    .first();
  return Boolean(row);
}

async function markReminded(
  eventId: string,
  kind: ReminderKind,
  launchDate: string,
): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO slack_reminders_sent (brand_id, event_id, kind, launch_date, sent_at)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
    )
    .bind(await currentBrandId(), eventId, kind, launchDate, new Date().toISOString())
    .run();
}

/**
 * The daily reminder sweep: one week out, and optionally the day before.
 *
 * Runs once per local calendar day, the first time the tick sees the configured
 * hour has passed there. A tick that crashes half way is safe to repeat — each
 * reminder is recorded against `(event, kind, launch date)` before the day is
 * marked swept, so nothing sends twice. Keying on the launch date rather than
 * just the event is deliberate: a launch that genuinely moves is due a fresh
 * one-week warning at its new date.
 */
export async function runReminders(now: Date = new Date()): Promise<{ posted: number }> {
  const settings = await slackSettings();
  if (!settings.enabled) return { posted: 0 };

  const today = localDate(now, settings.timezone);
  if ((await lastReminderSweep()) === today) return { posted: 0 };

  const [hour, minute] = settings.reminderTime.split(":").map(Number);
  if (localMinutes(now, settings.timezone) < hour * 60 + minute) return { posted: 0 };

  const kinds: ReminderKind[] = settings.dayBefore ? ["week", "day"] : ["week"];
  const [token, map, typeLabel, channelLabel] = await Promise.all([
    slackToken(),
    channelMap(),
    typeLabeller(),
    channelLabeller(),
  ]);
  const { colors } = await currentBrand();

  const db = getDb();
  let posted = 0;
  let failed = false;

  for (const kind of kinds) {
    const target = addDays(today, REMINDER_OFFSETS[kind]);

    const { results } = await db
      .prepare(
        `SELECT id FROM events
         WHERE brand_id = ? AND launch_date = ? AND status NOT IN ('completed','cancelled')`,
      )
      .bind(await currentBrandId(), target)
      .all<{ id: string }>();

    for (const { id } of results ?? []) {
      if (await alreadyReminded(id, kind, target)) continue;

      const event = await readEvent(id);
      if (!event) continue;

      // One post per Slack channel even where two marketing channels share it.
      const rooms = new Map<string, ChannelKey>();
      for (const channelKey of involvedChannels(event)) {
        const room = (map as SlackChannelMap)[channelKey];
        if (room && !rooms.has(room.id)) rooms.set(room.id, channelKey);
      }
      if (rooms.size === 0) continue;

      let allSent = true;
      for (const [slackId, channelKey] of rooms) {
        const message = buildReminderMessage(event, kind, {
          channelKey,
          boardUrl: settings.boardUrl,
          typeLabel,
          channelLabel,
          accent: colors.primary,
          danger: colors.danger,
        });
        const result = await postMessage(token, slackId, message);
        if (result.ok) posted += 1;
        else {
          allSent = false;
          failed = true;
        }
      }

      // Only recorded once it actually went out, so a Slack blip means a
      // retry on the next tick rather than a reminder nobody ever received.
      if (allSent) await markReminded(id, kind, target);
    }
  }

  // The day is only marked done when everything went out. Marking it after a
  // failure would strand the reminders that did not send until tomorrow, by
  // which point a one-week warning is a six-day one. Leaving it unmarked lets
  // the next tick retry; the per-event record above stops anything sending
  // twice, so retrying is free.
  if (!failed) await markReminderSweep(today);
  return { posted };
}

/** How many changes are waiting for their window to close. */
export async function pendingCount(): Promise<{ pending: number; nextDue: string | null }> {
  const row = await getDb()
    .prepare(`SELECT COUNT(*) AS n, MIN(due_at) AS due FROM slack_outbox WHERE brand_id = ? AND sent_at IS NULL`)
    .bind(await currentBrandId())
    .first<{ n: number; due: string | null }>();
  return { pending: Number(row?.n ?? 0), nextDue: row?.due ?? null };
}

/**
 * Housekeeping: sent rows are history nobody reads, and reminders for launches
 * long past cannot fire again. Trimmed on the tick so the tables stay small on
 * a free D1.
 */
export async function pruneSlackHistory(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const db = getDb();

  await db
    .prepare(`DELETE FROM slack_outbox WHERE brand_id = ? AND sent_at IS NOT NULL AND sent_at < ?`)
    .bind(await currentBrandId(), cutoff)
    .run();

  await db
    .prepare(`DELETE FROM slack_reminders_sent WHERE brand_id = ? AND launch_date < ?`)
    .bind(await currentBrandId(), addDays(todayIso(now), -60))
    .run();
}
