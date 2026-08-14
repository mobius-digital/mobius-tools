import { createServerClient } from "./supabase/server";
import {
  NotFoundError,
  normaliseChannels,
  validateEventInput,
} from "./validation";
import { describeCreation, describeDeletion, diffEvents } from "./changelog";
import { EVENT_STATUSES, type ChangelogEntry, type EventStatus, type LaunchEvent } from "./types";

export {
  NotFoundError,
  ValidationError,
  validateEditorName,
  validateEventInput,
  type FieldErrors,
} from "./validation";

/**
 * The one place events are written.
 *
 * Every mutation funnels through here so validation and changelog diffing have
 * a single choke point. A write that went straight to Supabase from a component
 * would silently skip its history entry, which the PRD calls out as the one
 * failure that must never happen.
 */

// Kept as a single literal: supabase-js parses this string into result types,
// and concatenation defeats that, collapsing rows to an error union.
const EVENT_COLUMNS =
  "id, name, type, status, brief, launch_date, promo_end_date, inventory_date, asset_deadline, teaser_start, channels, owner, notes, created_at, updated_at, updated_by";

const CHANGELOG_COLUMNS =
  "id, event_id, event_name, change_summary, changed_by, created_at";

/** Rows come back with `channels` already parsed by supabase-js. */
function hydrate(row: Record<string, unknown>): LaunchEvent {
  return {
    ...(row as unknown as LaunchEvent),
    channels: normaliseChannels(row.channels),
  };
}

/**
 * Writes one changelog row per change. Best-effort by design: a history write
 * must never roll back an edit the user already saw succeed, so a failure here
 * is logged rather than thrown.
 */
async function recordChanges(
  event: Pick<LaunchEvent, "id" | "name">,
  summaries: string[],
  editor: string,
): Promise<void> {
  if (summaries.length === 0) return;

  const supabase = createServerClient();
  const { error } = await supabase.from("changelog").insert(
    summaries.map((summary) => ({
      event_id: event.id,
      event_name: event.name,
      change_summary: summary,
      changed_by: editor,
    })),
  );

  if (error) {
    console.error(`Changelog write failed for ${event.id}: ${error.message}`);
  }
}

export async function listEvents(): Promise<LaunchEvent[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .order("launch_date", { ascending: true });

  if (error) throw new Error(`Could not load events: ${error.message}`);

  return (data ?? []).map(hydrate);
}

export async function getEvent(id: string): Promise<LaunchEvent | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Could not load event: ${error.message}`);
  return data ? hydrate(data) : null;
}

export async function listChangelog(limit = 100): Promise<ChangelogEntry[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("changelog")
    .select(CHANGELOG_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not load changelog: ${error.message}`);
  return (data ?? []) as unknown as ChangelogEntry[];
}

export async function createEvent(
  raw: unknown,
  editor: string,
): Promise<LaunchEvent> {
  const input = validateEventInput(raw);
  const supabase = createServerClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("events")
    .insert({ ...input, updated_at: now, updated_by: editor })
    .select(EVENT_COLUMNS)
    .single();

  if (error) throw new Error(`Could not create event: ${error.message}`);

  const created = hydrate(data);
  await recordChanges(created, [describeCreation(created)], editor);
  return created;
}

export async function updateEvent(
  id: string,
  raw: unknown,
  editor: string,
): Promise<LaunchEvent> {
  const input = validateEventInput(raw);
  const supabase = createServerClient();

  const existing = await getEvent(id);
  if (!existing) throw new NotFoundError();

  const { data, error } = await supabase
    .from("events")
    .update({
      ...input,
      updated_at: new Date().toISOString(),
      updated_by: editor,
    })
    .eq("id", id)
    .select(EVENT_COLUMNS)
    .single();

  if (error) throw new Error(`Could not save event: ${error.message}`);

  const updated = hydrate(data);
  // Diffed against the pre-edit row, and named with the post-edit name so a
  // rename reads under the name people will look for.
  await recordChanges(updated, diffEvents(existing, updated), editor);
  return updated;
}

/**
 * Partial status change, for the one-click menus on cards and rows. Routed
 * through here rather than the client so it lands in the changelog like any
 * other edit.
 */
export async function setEventStatus(
  id: string,
  status: unknown,
  editor: string,
): Promise<LaunchEvent> {
  if (!EVENT_STATUSES.includes(status as EventStatus)) {
    throw new NotFoundError();
  }

  const supabase = createServerClient();
  const existing = await getEvent(id);
  if (!existing) throw new NotFoundError();

  const { data, error } = await supabase
    .from("events")
    .update({
      status: status as EventStatus,
      updated_at: new Date().toISOString(),
      updated_by: editor,
    })
    .eq("id", id)
    .select(EVENT_COLUMNS)
    .single();

  if (error) throw new Error(`Could not update status: ${error.message}`);

  const updated = hydrate(data);
  await recordChanges(updated, diffEvents(existing, updated), editor);
  return updated;
}

/** Soft delete: cancelling keeps the row so its history stays attached (PRD §7). */
export async function cancelEvent(
  id: string,
  editor: string,
): Promise<LaunchEvent> {
  return setEventStatus(id, "cancelled", editor);
}

/** Hard delete, reachable only from the editor's admin action (PRD §7). */
export async function deleteEvent(id: string, editor: string): Promise<void> {
  const supabase = createServerClient();

  const existing = await getEvent(id);
  if (!existing) throw new NotFoundError();

  // Recorded before the row goes, so the entry exists even though the FK is
  // about to be nulled. event_name is denormalised, so the history stays
  // readable after the event itself is gone.
  await recordChanges(existing, [describeDeletion(existing)], editor);

  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw new Error(`Could not delete event: ${error.message}`);
}
