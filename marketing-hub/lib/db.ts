import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Channels, LaunchEvent } from "./types";

/**
 * Cloudflare D1 access.
 *
 * D1 is SQLite, reachable only from the Worker — never from a browser. That is
 * why there is no row-level security here and no key shipped to the client: the
 * password gate in front of the site is the whole access story.
 */

type D1Row = Record<string, unknown>;

export function getDb(): D1Database {
  const { env } = getCloudflareContext();
  const db = (env as { DB?: D1Database }).DB;

  if (!db) {
    throw new Error(
      "No D1 binding found. Check the [[d1_databases]] binding named DB in wrangler.jsonc.",
    );
  }

  return db;
}

/** SQLite has no JSON type, so channels round-trips through a TEXT column. */
export function rowToEvent(row: D1Row): LaunchEvent {
  return {
    id: String(row.id),
    name: String(row.name),
    type: row.type as LaunchEvent["type"],
    status: row.status as LaunchEvent["status"],
    brief: String(row.brief ?? ""),
    launch_date: String(row.launch_date),
    promo_end_date: (row.promo_end_date as string | null) ?? null,
    inventory_date: (row.inventory_date as string | null) ?? null,
    asset_deadline: (row.asset_deadline as string | null) ?? null,
    teaser_start: (row.teaser_start as string | null) ?? null,
    channels: JSON.parse(String(row.channels)) as Channels,
    owner: String(row.owner),
    notes: (row.notes as string | null) ?? null,
    assets_link: (row.assets_link as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    updated_by: String(row.updated_by),
  };
}
