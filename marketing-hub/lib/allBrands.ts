import { getDb, rowToEvent } from "./db";
import type { BrandSummary } from "./brandContext";
import type { LaunchEvent } from "./types";

/**
 * Every launch across a set of boards, for the agency's all-brands calendar.
 *
 * This is the one read that crosses brands on purpose. It is only reachable
 * through the all-brands page, which the middleware opens to a signed-in
 * identity, and it is fed the list of brands that identity may open (see
 * `brandsFor`), so it never widens what a person can already see board by
 * board. Channels are left as stored: the all-brands view reads names,
 * dates, status and brand, and does not filter by channel.
 */

export type BrandEvent = LaunchEvent & { brand: BrandSummary };

const COLUMNS = `id, brand_id, name, type, status, stage, brief, launch_date, promo_end_date,
  inventory_date, asset_deadline, teaser_start, channels, owner, notes, assets_link,
  created_at, updated_at, updated_by`;

export async function listEventsAcross(brands: BrandSummary[]): Promise<BrandEvent[]> {
  if (brands.length === 0) return [];

  const placeholders = brands.map(() => "?").join(", ");
  const { results } = await getDb()
    .prepare(
      `SELECT ${COLUMNS} FROM events WHERE brand_id IN (${placeholders})
       ORDER BY launch_date ASC, name ASC`,
    )
    .bind(...brands.map((brand) => brand.slug))
    .all();

  const bySlug = new Map(brands.map((brand) => [brand.slug, brand]));
  return (results ?? []).flatMap((row) => {
    const brand = bySlug.get(String(row.brand_id));
    if (!brand) return [];
    return [{ ...rowToEvent(row), brand }];
  });
}
