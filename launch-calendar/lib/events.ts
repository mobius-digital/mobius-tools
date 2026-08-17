import { getDb, rowToEvent } from "./db";
import { NotFoundError, validateEventInput } from "./validation";
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
 * a single choke point. A write that skipped this would silently lose its
 * history entry, which the PRD calls out as the one failure that must never
 * happen.
 */

const EVENT_COLUMNS = `id, name, type, status, brief, launch_date, promo_end_date,
  inventory_date, asset_deadline, teaser_start, channels, owner, notes,
  created_at, updated_at, updated_by`;

/**
 * Writes one changelog row per change, best-effort.
 *
 * `id` is nullable because not everything worth logging is an event — a
 * password change is not, and the foreign key would reject a made-up id.
 */
async function recordChanges(
  event: { id: string | null; name: string },
  summaries: string[],
  editor: string,
): Promise<void> {
  if (summaries.length === 0) return;

  try {
    const db = getDb();
    const now = new Date().toISOString();

    // A history write must never roll back an edit the user already saw succeed.
    await db.batch(
      summaries.map((summary) =>
        db
          .prepare(
            `INSERT INTO changelog (id, event_id, event_name, change_summary, changed_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(crypto.randomUUID(), event.id, event.name, summary, editor, now),
      ),
    );
  } catch (error) {
    console.error(`Changelog write failed for ${event.id}:`, error);
  }
}

/**
 * Records a password change in the shared history.
 *
 * It is not an event edit, but it is the single most disruptive thing anyone
 * can do here — everybody else gets signed out — so it belongs in the log.
 */
export async function recordPasswordChange(editor: string): Promise<void> {
  await recordChanges(
    { id: null, name: "Team settings" },
    ["Team password changed — everyone will need to sign in again"],
    editor,
  );
}

export async function listEvents(): Promise<LaunchEvent[]> {
  const { results } = await getDb()
    .prepare(`SELECT ${EVENT_COLUMNS} FROM events ORDER BY launch_date ASC, name ASC`)
    .all();

  return (results ?? []).map(rowToEvent);
}

export async function getEvent(id: string): Promise<LaunchEvent | null> {
  const row = await getDb()
    .prepare(`SELECT ${EVENT_COLUMNS} FROM events WHERE id = ?`)
    .bind(id)
    .first();

  return row ? rowToEvent(row) : null;
}

export async function listChangelog(limit = 100): Promise<ChangelogEntry[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT id, event_id, event_name, change_summary, changed_by, created_at
       FROM changelog ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all();

  return (results ?? []) as unknown as ChangelogEntry[];
}

export async function createEvent(raw: unknown, editor: string): Promise<LaunchEvent> {
  const input = validateEventInput(raw);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await getDb()
    .prepare(
      `INSERT INTO events (id, name, type, status, brief, launch_date, promo_end_date,
        inventory_date, asset_deadline, teaser_start, channels, owner, notes,
        created_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.name,
      input.type,
      input.status,
      input.brief,
      input.launch_date,
      input.promo_end_date,
      input.inventory_date,
      input.asset_deadline,
      input.teaser_start,
      JSON.stringify(input.channels),
      input.owner,
      input.notes,
      now,
      now,
      editor,
    )
    .run();

  const created = (await getEvent(id)) as LaunchEvent;
  await recordChanges(created, [describeCreation(created)], editor);
  return created;
}

export async function updateEvent(
  id: string,
  raw: unknown,
  editor: string,
): Promise<LaunchEvent> {
  const input = validateEventInput(raw);

  const existing = await getEvent(id);
  if (!existing) throw new NotFoundError();

  await getDb()
    .prepare(
      `UPDATE events SET name = ?, type = ?, status = ?, brief = ?, launch_date = ?,
        promo_end_date = ?, inventory_date = ?, asset_deadline = ?, teaser_start = ?,
        channels = ?, owner = ?, notes = ?, updated_at = ?, updated_by = ?
       WHERE id = ?`,
    )
    .bind(
      input.name,
      input.type,
      input.status,
      input.brief,
      input.launch_date,
      input.promo_end_date,
      input.inventory_date,
      input.asset_deadline,
      input.teaser_start,
      JSON.stringify(input.channels),
      input.owner,
      input.notes,
      new Date().toISOString(),
      editor,
      id,
    )
    .run();

  const updated = (await getEvent(id)) as LaunchEvent;
  // Diffed against the pre-edit row, named with the post-edit name so a rename
  // reads under the name people will look for.
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
  if (!EVENT_STATUSES.includes(status as EventStatus)) throw new NotFoundError();

  const existing = await getEvent(id);
  if (!existing) throw new NotFoundError();

  await getDb()
    .prepare(`UPDATE events SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?`)
    .bind(status as EventStatus, new Date().toISOString(), editor, id)
    .run();

  const updated = (await getEvent(id)) as LaunchEvent;
  await recordChanges(updated, diffEvents(existing, updated), editor);
  return updated;
}

/** Soft delete: cancelling keeps the row so its history stays attached (PRD §7). */
export async function cancelEvent(id: string, editor: string): Promise<LaunchEvent> {
  return setEventStatus(id, "cancelled", editor);
}

/** Hard delete, reachable only from the editor's admin action (PRD §7). */
export async function deleteEvent(id: string, editor: string): Promise<void> {
  const existing = await getEvent(id);
  if (!existing) throw new NotFoundError();

  // Recorded before the row goes, so the entry exists even though the foreign
  // key is about to be nulled. event_name is denormalised, so the history stays
  // readable after the event itself is gone.
  await recordChanges(existing, [describeDeletion(existing)], editor);

  await getDb().prepare(`DELETE FROM events WHERE id = ?`).bind(id).run();
}
