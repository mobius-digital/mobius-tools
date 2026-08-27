/**
 * What to notify, and when — decided without touching anything.
 *
 * Split out of `lib/slackNotify.ts` for the same reason `lib/validation.ts` is
 * split out of `lib/events.ts`: these are the rules, and rules that decide who
 * gets told what should be provable in a test rather than inferred from a
 * database. Everything here is a pure function of its arguments.
 */

import type { ChannelKey, LaunchEvent } from "./types.ts";
import type { NotifyItem, NotifyKind } from "./slackMessage.ts";

/** How long a batch window stays open. */
export const WINDOW_MS = 15 * 60 * 1000;

/** One queued notification: some news, and the channels it is news to. */
export type PlannedNotice = {
  kind: NotifyKind;
  lines: string[];
  targets: ChannelKey[];
};

/**
 * The channels an event involves, in the order they were saved — which is the
 * board's configured order at the time, since `normalizeChannels` writes them
 * that way.
 */
export function involvedChannels(event: LaunchEvent): ChannelKey[] {
  return Object.keys(event.channels).filter((key) => event.channels[key]?.involved);
}

/** A new event is news to everybody it involves. */
export function planForCreation(event: LaunchEvent): PlannedNotice[] {
  const targets = involvedChannels(event);
  return targets.length > 0 ? [{ kind: "created", lines: [], targets }] : [];
}

/**
 * What an edit is worth telling Slack about.
 *
 * Five triggers: the launch date moved, the status changed, a marketing channel
 * was newly added to the event, the assets link was filled in, or the note was
 * written or rewritten.
 *
 * The third is not just symmetry. Without it, adding Paid to an event next week
 * means #paid is never told about that event at all — it was not involved when
 * the event was created, and a later date move is not the first thing it should
 * hear. So a newly-added channel gets the whole event as its own notice, and is
 * deliberately left out of the change notice going to everyone else: it should
 * hear about this event once, not twice in the same message.
 *
 * The assets link is its own kind of news — "the photos are in" — with its own
 * message, so it is planned as a separate notice rather than folded into a
 * date/status change. Removing the link is not news; the assets did not
 * un-arrive.
 *
 * The note is news on its own because it is where the *why* lives — "embargo
 * lifted, go", "factory confirmed, date holds" — and those change what a
 * channel does next even when no date moved. A cleared note is not news, like
 * a removed assets link. A typo fix right after saving joins the same window;
 * a later one costs one short card, which is the price of never missing the
 * real ones.
 *
 * Everything else — a reworded brief, a new owner, an asset deadline on its own
 * — stays off Slack entirely. `lines` still carries the full changelog diff, so
 * a save that moved the launch date *and* the asset deadline reports both.
 */
export function planForChange(
  before: LaunchEvent,
  after: LaunchEvent,
  lines: string[],
): PlannedNotice[] {
  const notices: PlannedNotice[] = [];

  const newlyAdded = Object.keys(after.channels).filter(
    (key) => !before.channels[key]?.involved && after.channels[key]?.involved,
  );

  const noteNow = (after.notes ?? "").trim().replace(/\s+/g, " ");
  const noteWas = (before.notes ?? "").trim().replace(/\s+/g, " ");
  const noteChanged = noteNow !== "" && noteNow !== noteWas;

  const notable =
    before.launch_date !== after.launch_date ||
    before.status !== after.status ||
    noteChanged;

  if (notable) {
    const targets = involvedChannels(after).filter((key) => !newlyAdded.includes(key));
    if (targets.length > 0) notices.push({ kind: "changed", lines, targets });
  }

  if (newlyAdded.length > 0) {
    notices.push({ kind: "added", lines: [], targets: newlyAdded });
  }

  // A newly-added channel's own notice already shows the link, so it is left
  // out here for the same once-not-twice reason as above.
  if (after.assets_link && before.assets_link !== after.assets_link) {
    const targets = involvedChannels(after).filter((key) => !newlyAdded.includes(key));
    if (targets.length > 0) notices.push({ kind: "assets", lines: [], targets });
  }

  return notices;
}

/**
 * When a change queued now should go out.
 *
 * `openWindowDue` is the earliest deadline among notifications still waiting.
 * If there is one, this change joins it rather than starting its own — a
 * tumbling window, not a debounce. A debounce would let each new edit push the
 * message further out, so the busiest morning would be the quietest Slack.
 */
export function nextDueAt(openWindowDue: string | null, now: Date): string {
  return openWindowDue ?? new Date(now.getTime() + WINDOW_MS).toISOString();
}

/** Later news about the same event wins the headline. */
const KIND_RANK: Record<NotifyKind, number> = { created: 4, added: 3, assets: 2, changed: 1 };

/**
 * Folds one item into a channel's batch.
 *
 * Two marketing channels can point at the same Slack channel — a small team
 * might send Paid and Email both to #marketing — so the same event can arrive
 * twice for the same room. Merging keeps it as one entry with the change lines
 * combined, rather than the same launch listed twice in one message.
 *
 * Mutates and returns `items` because the caller is accumulating a batch.
 */
export function foldItem(items: NotifyItem[], incoming: NotifyItem): NotifyItem[] {
  const existing = items.find((entry) => entry.event.id === incoming.event.id);

  if (!existing) {
    items.push({ ...incoming, lines: [...incoming.lines] });
    return items;
  }

  if (KIND_RANK[incoming.kind] > KIND_RANK[existing.kind]) existing.kind = incoming.kind;
  for (const line of incoming.lines) {
    if (!existing.lines.includes(line)) existing.lines.push(line);
  }

  return items;
}
