/**
 * What a notification actually says.
 *
 * Pure: no database, no network, no clock beyond what is passed in — so the
 * exact wording can be pinned down in tests, which matters because the wording
 * is the product. The same reasoning as `lib/changelog.ts`, and in fact the
 * "what changed" lines here *are* changelog lines: they are produced by
 * `diffEvents` and passed straight through, so Slack and the history panel can
 * never drift into describing the same edit two different ways.
 *
 * Presentation follows Pulse's alert style — a coloured bar down the left, a
 * bold title, muted detail underneath — so the two tools look related in a
 * channel.
 *
 * ── The one rule that shapes everything here ───────────────────────────────
 * Slack folds any attachment taller than about five blocks behind "Show more".
 * The first real batch proved it: a date change and a brand-new event shared a
 * window, and the new event was hidden behind the fold — the exact news the
 * message existed to deliver. So: one event per message, never a digest, and
 * every message is at most FOUR blocks. The batch window still merges several
 * edits to the *same* event into one message; it no longer merges different
 * events into one post.
 */

import { brand } from "../brand.config.ts";
import { hub } from "../hub.config.ts";
import { formatShort, formatWithWeekday } from "./dates.ts";
import {
  EVENT_STATUS_LABELS,
  fallbackChannelLabel,
  type ChannelKey,
  type ChannelPriority,
  type LaunchEvent,
} from "./types.ts";

export type NotifyKind = "created" | "changed" | "added" | "assets";

export type NotifyItem = {
  kind: NotifyKind;
  event: LaunchEvent;
  /** Changelog-style lines. Empty for a creation, which is its own news. */
  lines: string[];
  actor: string;
};

/** How keys become words. Both default to the built-in labels, falling back to the key. */
export type MessageOptions = {
  channelKey: ChannelKey;
  boardUrl: string;
  typeLabel: (key: string) => string;
  channelLabel?: (key: string) => string;
  /** The brand's own colours for the attachment bar; defaults keep the hub palette. */
  accent?: string;
  danger?: string;
};

export type SlackMessage = {
  /** The notification preview, and the fallback where blocks cannot render. */
  text: string;
  /**
   * An attachment rather than top-level blocks, because the coloured bar down
   * the left only exists on attachments — and that bar is what makes an at-risk
   * launch readable at a glance in a busy channel.
   */
  attachments: unknown[];
};

/** Brief text is a paragraph in the app; in Slack it is a glance. */
const BRIEF_LIMIT = 180;

/**
 * Notes are the caveats — "customs is slow, date may slip", "embargo lifts on
 * the 12th" — which is exactly the *why* behind a change. So they ride along
 * on every message about the event, one line, trimmed — and writing or
 * rewriting one is news in its own right (see `planForChange`).
 */
const NOTES_LIMIT = 200;

/**
 * Slack's mrkdwn reserves three characters. An event called "Buy 1 & Get 1"
 * or "<Secret> Drop" would otherwise arrive mangled or partly swallowed.
 */
function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(text: string, limit: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1).trimEnd()}…`;
}

function section(text: string) {
  return { type: "section", text: { type: "mrkdwn", text } };
}

function context(text: string) {
  return { type: "context", elements: [{ type: "mrkdwn", text }] };
}

/** An event in trouble should not arrive wearing the same colour as good news. */
function barColour(event: LaunchEvent, options: MessageOptions): string {
  return event.status === "at_risk" || event.status === "cancelled"
    ? (options.danger ?? brand.colors.danger)
    : (options.accent ?? brand.colors.primary);
}

/**
 * What this event asks of the channel reading it.
 *
 * Every Slack channel maps to one marketing channel, so the reader is known —
 * and "you're primary on this" is what turns a broadcast into something with
 * a name on it. Deliberately plain: three states, three sentences.
 */
const ROLE_TEXT: Record<ChannelPriority, string> = {
  primary: "*You're primary on this*",
  supporting: "*You're supporting on this*",
  fyi: "*FYI only* — nothing to build",
};

function roleLine(event: LaunchEvent, channelKey: ChannelKey): string | null {
  const state = event.channels[channelKey];
  if (!state?.involved) return null;
  return ROLE_TEXT[state.priority ?? "fyi"];
}

/** "Also: Email (supporting) · SMS (fyi)" — everyone else on this. */
function othersSummary(
  event: LaunchEvent,
  channelKey: ChannelKey,
  channelLabel: (key: string) => string,
): string {
  const others = Object.keys(event.channels)
    .filter((key) => key !== channelKey && event.channels[key]?.involved)
    .map((key) => {
      const priority = event.channels[key].priority;
      return priority ? `${channelLabel(key)} (${priority})` : channelLabel(key);
    });

  return others.length > 0 ? `Also: ${others.join(" · ")}` : "";
}

/** The run-up dates that are actually set, in the order a card shows them. */
function runUpSummary(event: LaunchEvent): string {
  const parts: string[] = [];
  if (event.teaser_start) parts.push(`Teaser ${formatShort(event.teaser_start)}`);
  if (event.asset_deadline) parts.push(`Assets due ${formatShort(event.asset_deadline)}`);
  if (event.inventory_date) parts.push(`Inventory ${formatShort(event.inventory_date)}`);
  if (event.promo_end_date) parts.push(`Promo ends ${formatShort(event.promo_end_date)}`);
  return parts.join(" · ");
}

/**
 * "Goes live Thu Aug 27 · Confirmed · Owner: Cole"
 *
 * "Goes live" rather than "Launches": the board's anchor is called the launch
 * date, but the things on it are promos, restocks and content moments as
 * often as product launches, and a promo does not launch. Type-neutral.
 */
function headline(event: LaunchEvent): string {
  return [
    `Goes live ${formatWithWeekday(event.launch_date)}`,
    EVENT_STATUS_LABELS[event.status],
    event.owner ? `Owner: ${escape(event.owner)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The assets link as a real button, not a bare URL. A folder link is long and
 * says nothing on its own; a button says what pressing it does.
 */
function assetsButton(event: LaunchEvent) {
  if (!event.assets_link) return null;
  return {
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Open assets", emoji: true },
        url: event.assets_link,
      },
    ],
  };
}

function boardLink(boardUrl: string, event: LaunchEvent, channelKey: ChannelKey): string {
  if (!boardUrl) return "";
  // The lens travels with the link, so somebody opening this from #paid lands
  // on the board already filtered to their own work.
  const url = `${boardUrl}/?channel=${channelKey}&event=${encodeURIComponent(event.id)}`;
  return `<${url}|Open in ${escape(hub.name)} →>`;
}

/**
 * "Product Launch" → "product launch", "Tour Drop" → "tour drop", "SMS Blast"
 * → "SMS blast" — a type label lowered to sit after "New", with acronyms left
 * alone.
 */
function asNoun(label: string): string {
  return label
    .split(/\s+/)
    .map((word) => (word.length > 1 && word === word.toUpperCase() ? word : word.toLowerCase()))
    .join(" ");
}

/**
 * What a change message is *about*, for the title.
 *
 * The lines are the changelog's own wording, produced by `diffEvents`, so the
 * prefixes checked here are ours — the same strings the history panel shows.
 * One title, chosen by what matters most: a cancellation beats a risk flag
 * beats a date move beats anything else.
 */
function changeTitle(lines: string[]): { icon: string; label: string } {
  if (lines.includes("Event cancelled")) return { icon: "🚫", label: "Cancelled" };
  if (lines.some((line) => line.startsWith("Status changed:") && line.endsWith("→ at risk"))) {
    return { icon: "⚠️", label: "At risk" };
  }
  if (lines.some((line) => line.startsWith("Launch date "))) {
    return { icon: "📅", label: "Date moved" };
  }
  if (lines.some((line) => line.startsWith("Status changed:"))) {
    return { icon: "✏️", label: "Updated" };
  }
  if (lines.includes("Note added")) return { icon: "📝", label: "Note added" };
  if (lines.includes("Note updated")) return { icon: "📝", label: "Note updated" };
  return { icon: "✏️", label: "Updated" };
}

/**
 * Every title is "<what happened> — <event>", so a channel scanning a day of
 * posts reads the verbs down the left: New promo, Date moved, Assets are in.
 */
function titleFor(
  item: NotifyItem,
  channelKey: ChannelKey,
  typeLabel: (key: string) => string,
  channelLabel: (key: string) => string,
): string {
  const name = escape(item.event.name);

  if (item.kind === "created") {
    return `🚀 *New ${escape(asNoun(typeLabel(item.event.type)))} — ${name}*`;
  }
  if (item.kind === "added") {
    return `📌 *${escape(channelLabel(channelKey))} is now on ${name}*`;
  }
  if (item.kind === "assets") return `📎 *Assets are in — ${name}*`;

  const { icon, label } = changeTitle(item.lines);
  return `${icon} *${label} — ${name}*`;
}

/**
 * One event, as at most four blocks:
 *
 *   1. title, with the change lines directly under it (one section)
 *   2. what the reader needs to know: role · launch · status · owner · type,
 *      then run-up dates, then the brief — stacked inside one context block
 *   3. the assets button, when there is a folder
 *   4. footer: who else · who changed it · link
 *
 * A creation and a newly-added channel both describe the whole event, because
 * the reader has never seen it before. A change leads with what moved — that is
 * the news — and states the event underneath for context.
 */
function eventBlocks(
  item: NotifyItem,
  channelKey: ChannelKey,
  boardUrl: string,
  typeLabel: (key: string) => string,
  channelLabel: (key: string) => string,
): unknown[] {
  const title = titleFor(item, channelKey, typeLabel, channelLabel);
  // A bullet that only restates the title is dropped: "Note added" (the note
  // itself is printed below, marked new or updated), "Event cancelled" under
  // a Cancelled title, "Assets link added" under Assets are in. Bullets that
  // add something — where a date moved *from*, what the status *was* — stay.
  const lines = item.lines
    .filter((line) => !NOTE_LINES.has(line) && !saidByTitle(item.kind, line))
    .map((line) => `• ${escape(line)}`)
    .join("\n");
  const blocks: unknown[] = [section(lines ? `${title}\n${lines}` : title)];

  blocks.push(context(detailLines(item.event, channelKey, typeLabel, noteState(item.lines))));

  // On an assets notice the button *is* the message; on anything else it is a
  // reminder that assets exist, so it sits after the detail either way.
  const button = assetsButton(item.event);
  if (button) blocks.push(button);

  const others = othersSummary(item.event, channelKey, channelLabel);
  const link = boardLink(boardUrl, item.event, channelKey);
  const footer = [others, `Changed by ${escape(item.actor)}`, link].filter(Boolean).join("  ·  ");
  if (footer) blocks.push(context(footer));

  return blocks;
}

/**
 * The reader's own role first — that is the sentence they scan for — then the
 * essentials, the run-up dates and the brief, each on its own line but all in
 * one context block so the card stays under Slack's fold.
 */
/** The changelog's own words for a note change, so the card can recognise them. */
const NOTE_LINES = new Set(["Note added", "Note updated", "Note removed"]);

/** Change lines the title already states, by the kind of post they appear on. */
function saidByTitle(kind: NotifyItem["kind"], line: string): boolean {
  if (line === "Event cancelled") return true;
  if (kind === "assets") return line === "Assets link added" || line === "Assets link updated";
  return false;
}

/** How to label the note line: fresh, rewritten, or just along for the ride. */
function noteState(lines: string[]): "new" | "updated" | "unchanged" {
  if (lines.includes("Note added")) return "new";
  if (lines.includes("Note updated")) return "updated";
  return "unchanged";
}

function detailLines(
  event: LaunchEvent,
  channelKey: ChannelKey,
  typeLabel: (key: string) => string,
  note: "new" | "updated" | "unchanged" = "unchanged",
): string {
  const role = roleLine(event, channelKey);
  const meta = `${headline(event)} · ${escape(typeLabel(event.type))}`;
  const parts = [role ? `${role}  ·  ${meta}` : meta];

  const runUp = runUpSummary(event);
  if (runUp) parts.push(runUp);

  if (event.brief.trim()) parts.push(`_${escape(truncate(event.brief, BRIEF_LIMIT))}_`);

  if (event.notes?.trim()) {
    const label = note === "new" ? "New note" : note === "updated" ? "Note updated" : "Note";
    parts.push(`📝 ${label}: ${escape(truncate(event.notes, NOTES_LIMIT))}`);
  }

  return parts.join("\n");
}

/** The one-line preview a phone shows before anyone opens Slack. */
function previewText(
  item: NotifyItem,
  channelKey: ChannelKey,
  typeLabel: (key: string) => string,
  channelLabel: (key: string) => string,
): string {
  if (item.kind === "created") {
    return `New ${asNoun(typeLabel(item.event.type))}: ${item.event.name}`;
  }
  if (item.kind === "added") return `${channelLabel(channelKey)} is now on ${item.event.name}`;
  if (item.kind === "assets") return `Assets are in: ${item.event.name}`;
  return `${changeTitle(item.lines).label}: ${item.event.name} — ${item.lines[0] ?? "updated"}`;
}

/**
 * One event's news for one Slack channel, as one message.
 *
 * Several edits to the same event inside a window have already been folded
 * into this one item by the flush, so this still honours the "five edits, one
 * post" promise — per event. Different events get different messages, always.
 */
export function buildEventMessage(item: NotifyItem, options: MessageOptions): SlackMessage {
  const { channelKey, boardUrl, typeLabel } = options;
  const channelLabel = options.channelLabel ?? fallbackChannelLabel;

  return {
    text: previewText(item, channelKey, typeLabel, channelLabel),
    attachments: [
      {
        color: barColour(item.event, options),
        blocks: eventBlocks(item, channelKey, boardUrl, typeLabel, channelLabel),
      },
    ],
  };
}

export type ReminderKind = "week" | "day";

/** The scheduled nudge — one week out, or the morning before. */
export function buildReminderMessage(
  event: LaunchEvent,
  kind: ReminderKind,
  options: MessageOptions,
): SlackMessage {
  const { channelKey, boardUrl, typeLabel } = options;
  const channelLabel = options.channelLabel ?? fallbackChannelLabel;
  const title = kind === "week" ? "⏰ *One week out*" : "🔔 *Live tomorrow*";

  const blocks: unknown[] = [
    section(`${title} — *${escape(event.name)}*`),
    context(detailLines(event, channelKey, typeLabel)),
  ];

  const button = assetsButton(event);
  if (button) blocks.push(button);

  const footer = [
    othersSummary(event, channelKey, channelLabel),
    boardLink(boardUrl, event, channelKey),
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (footer) blocks.push(context(footer));

  return {
    text:
      kind === "week"
        ? `One week out: ${event.name} goes live ${formatWithWeekday(event.launch_date)}`
        : `Live tomorrow: ${event.name}`,
    attachments: [{ color: barColour(event, options), blocks }],
  };
}

/** Proof the wiring works, sent from the settings screen. */
export function buildTestMessage(boardUrl: string): SlackMessage {
  return {
    text: `${hub.name} is connected to this channel.`,
    attachments: [
      {
        color: brand.colors.primary,
        blocks: [
          section(`✅ *${escape(hub.name)} is connected to this channel.*`),
          context(
            "New events, date moves, status changes and assets landing for the marketing channels mapped here will arrive here — one short message per event, at most once every 15 minutes.",
          ),
          ...(boardUrl ? [context(`<${boardUrl}|Open the board →>`)] : []),
        ],
      },
    ],
  };
}
