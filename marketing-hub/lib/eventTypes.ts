/**
 * Event types, editable per board.
 *
 * Type is the one field on an event that is purely a label — nothing in the
 * app branches on it. That is exactly why it is safe to let a team define their
 * own, where status and channel are not: those drive clash detection, the red
 * flag, what "Show completed" hides and what the channel filter means, so a
 * custom value would have no defined behavior.
 *
 * Stored as JSON in `settings` so the list travels with the board and changing
 * it needs no redeploy.
 */

import { getDb } from "./db";
import { currentBrandId } from "./brandContext";

import { DEFAULT_EVENT_TYPES } from "./types";
import { cleanLabel, keyFromLabel } from "./validation";

export { cleanLabel, keyFromLabel };

export type EventTypeOption = {
  /** Stable id stored on events. Never changes, so renaming is safe. */
  key: string;
  label: string;
};

const SETTING_KEY = "event_types";

export const MAX_TYPES = 20;

function isOption(value: unknown): value is EventTypeOption {
  const option = value as EventTypeOption;
  return (
    Boolean(option) &&
    typeof option.key === "string" &&
    typeof option.label === "string" &&
    option.key.length > 0 &&
    option.label.length > 0
  );
}

/** The configured list, falling back to the built-in one on a fresh board. */
export async function listEventTypes(): Promise<EventTypeOption[]> {
  const row = await getDb()
    .prepare(`SELECT value FROM settings WHERE brand_id = ? AND key = ?`)
    .bind(await currentBrandId(), SETTING_KEY)
    .first<{ value: string }>();

  if (!row?.value) return [...DEFAULT_EVENT_TYPES];

  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [...DEFAULT_EVENT_TYPES];
    const options = parsed.filter(isOption);
    return options.length > 0 ? options : [...DEFAULT_EVENT_TYPES];
  } catch {
    return [...DEFAULT_EVENT_TYPES];
  }
}

async function writeEventTypes(options: EventTypeOption[]): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO settings (brand_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(brand_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(await currentBrandId(), SETTING_KEY, JSON.stringify(options), new Date().toISOString())
    .run();
}



/** How many events currently carry each type, so nothing is removed blindly. */
export async function typeUsage(): Promise<Record<string, number>> {
  const { results } = await getDb()
    .prepare(`SELECT type, COUNT(*) AS n FROM events WHERE brand_id = ? GROUP BY type`)
    .bind(await currentBrandId())
    .all<{ type: string; n: number }>();

  const usage: Record<string, number> = {};
  for (const row of results ?? []) usage[row.type] = Number(row.n);
  return usage;
}

export async function addEventType(
  rawLabel: unknown,
): Promise<{ ok: true; types: EventTypeOption[] } | { ok: false; error: string }> {
  const label = cleanLabel(rawLabel);
  if (!label) return { ok: false, error: "Use between 2 and 40 characters." };

  const key = keyFromLabel(label);
  if (!key) return { ok: false, error: "That name needs at least one letter or number." };

  const types = await listEventTypes();
  if (types.length >= MAX_TYPES) {
    return { ok: false, error: `That is the most types a board can have (${MAX_TYPES}).` };
  }
  if (types.some((type) => type.key === key)) {
    return { ok: false, error: `“${label}” is already a type.` };
  }

  const next = [...types, { key, label }];
  await writeEventTypes(next);
  return { ok: true, types: next };
}

export async function renameEventType(
  key: unknown,
  rawLabel: unknown,
): Promise<{ ok: true; types: EventTypeOption[] } | { ok: false; error: string }> {
  const label = cleanLabel(rawLabel);
  if (!label) return { ok: false, error: "Use between 2 and 40 characters." };

  const types = await listEventTypes();
  if (!types.some((type) => type.key === key)) {
    return { ok: false, error: "That type no longer exists." };
  }

  // Only the label moves. Events keep pointing at the same key, so a rename
  // never orphans anything already on the board.
  const next = types.map((type) => (type.key === key ? { ...type, label } : type));
  await writeEventTypes(next);
  return { ok: true, types: next };
}

export async function removeEventType(
  key: unknown,
): Promise<{ ok: true; types: EventTypeOption[] } | { ok: false; error: string }> {
  const types = await listEventTypes();
  if (types.length <= 1) {
    return { ok: false, error: "Keep at least one type — every event needs one." };
  }
  if (!types.some((type) => type.key === key)) {
    return { ok: false, error: "That type no longer exists." };
  }

  // Removing a type that events still use would leave them labeled with a key
  // nothing can resolve, so it is refused rather than silently reassigned.
  const usage = await typeUsage();
  const inUse = usage[key as string] ?? 0;
  if (inUse > 0) {
    return {
      ok: false,
      error: `${inUse} event${inUse === 1 ? " still uses" : "s still use"} this type. Change ${
        inUse === 1 ? "it" : "them"
      } to another type first.`,
    };
  }

  const next = types.filter((type) => type.key !== key);
  await writeEventTypes(next);
  return { ok: true, types: next };
}
