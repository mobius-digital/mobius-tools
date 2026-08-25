import { getDb, rowToEvent } from "./db";
import { currentBrandId } from "./brandContext";
import { NotFoundError, validateEventInput } from "./validation";
import { listEventTypes } from "./eventTypes";
import { channelKeys, channelLabeller, hydrateChannels, listChannels } from "./channelOptions";
import { describeCreation, describeDeletion, diffEvents } from "./changelog";
import { queueChanged, queueCreated } from "./slackNotify";
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
  inventory_date, asset_deadline, teaser_start, channels, owner, notes, assets_link,
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
    const brandId = await currentBrandId();
    const now = new Date().toISOString();

    // A history write must never roll back an edit the user already saw succeed.
    await db.batch(
      summaries.map((summary) =>
        db
          .prepare(
            `INSERT INTO changelog (id, brand_id, event_id, event_name, change_summary, changed_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(crypto.randomUUID(), brandId, event.id, event.name, summary, editor, now),
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

/** The type keys this board currently accepts. */
async function allowedTypeKeys(): Promise<string[]> {
  return (await listEventTypes()).map((option) => option.key);
}

/**
 * Validates against both configurable lists at once.
 *
 * Read together so a save cannot see a type list from before an edit and a
 * channel list from after it.
 */
async function validateAgainstBoard(raw: unknown) {
  const [types, channels] = await Promise.all([allowedTypeKeys(), listChannels()]);
  return validateEventInput(raw, types, channels);
}

/**
 * Every read fills in the board's current channel list, so an event saved
 * before "Affiliate" existed still shows an Affiliate row (uninvolved) in the
 * editor, and one saved with a since-removed channel does not resurrect it.
 */
function hydrate(event: LaunchEvent, keys: readonly string[]): LaunchEvent {
  return { ...event, channels: hydrateChannels(event.channels, keys) };
}

export async function listEvents(): Promise<LaunchEvent[]> {
  const [{ results }, keys] = await Promise.all([
    getDb()
      .prepare(`SELECT ${EVENT_COLUMNS} FROM events WHERE brand_id = ? ORDER BY launch_date ASC, name ASC`)
      .bind(await currentBrandId())
      .all(),
    channelKeys(),
  ]);

  return (results ?? []).map((row) => hydrate(rowToEvent(row), keys));
}

export async function getEvent(id: string): Promise<LaunchEvent | null> {
  const [row, keys] = await Promise.all([
    getDb()
      .prepare(`SELECT ${EVENT_COLUMNS} FROM events WHERE brand_id = ? AND id = ?`)
      .bind(await currentBrandId(), id)
      .first(),
    channelKeys(),
  ]);

  return row ? hydrate(rowToEvent(row), keys) : null;
}

export async function listChangelog(limit = 100): Promise<ChangelogEntry[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT id, event_id, event_name, change_summary, changed_by, created_at
       FROM changelog WHERE brand_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(await currentBrandId(), limit)
    .all();

  return (results ?? []) as unknown as ChangelogEntry[];
}

export async function createEvent(raw: unknown, editor: string): Promise<LaunchEvent> {
  const input = await validateAgainstBoard(raw);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await getDb()
    .prepare(
      `INSERT INTO events (id, brand_id, name, type, status, brief, launch_date, promo_end_date,
        inventory_date, asset_deadline, teaser_start, channels, owner, notes, assets_link,
        created_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      await currentBrandId(),
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
      input.assets_link,
      now,
      now,
      editor,
    )
    .run();

  const created = (await getEvent(id)) as LaunchEvent;
  await recordChanges(created, [describeCreation(created)], editor);
  await queueCreated(created, editor);
  return created;
}

export async function updateEvent(
  id: string,
  raw: unknown,
  editor: string,
): Promise<LaunchEvent> {
  const input = await validateAgainstBoard(raw);

  const existing = await getEvent(id);
  if (!existing) throw new NotFoundError();

  await getDb()
    .prepare(
      `UPDATE events SET name = ?, type = ?, status = ?, brief = ?, launch_date = ?,
        promo_end_date = ?, inventory_date = ?, asset_deadline = ?, teaser_start = ?,
        channels = ?, owner = ?, notes = ?, assets_link = ?, updated_at = ?, updated_by = ?
       WHERE brand_id = ? AND id = ?`,
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
      input.assets_link,
      new Date().toISOString(),
      editor,
      await currentBrandId(),
      id,
    )
    .run();

  const updated = (await getEvent(id)) as LaunchEvent;
  // Diffed against the pre-edit row, named with the post-edit name so a rename
  // reads under the name people will look for.
  const changes = diffEvents(existing, updated, await channelLabeller());
  await recordChanges(updated, changes, editor);
  // Slack is told with the same words the history uses, from the same diff.
  await queueChanged(existing, updated, changes, editor);
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
    .prepare(`UPDATE events SET status = ?, updated_at = ?, updated_by = ? WHERE brand_id = ? AND id = ?`)
    .bind(status as EventStatus, new Date().toISOString(), editor, await currentBrandId(), id)
    .run();

  const updated = (await getEvent(id)) as LaunchEvent;
  const changes = diffEvents(existing, updated, await channelLabeller());
  await recordChanges(updated, changes, editor);
  await queueChanged(existing, updated, changes, editor);
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

  await getDb()
    .prepare(`DELETE FROM events WHERE brand_id = ? AND id = ?`)
    .bind(await currentBrandId(), id)
    .run();
}
