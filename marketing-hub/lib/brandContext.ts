/**
 * Which brand this request is about, and that brand's identity.
 *
 * The hub serves every brand from one deployment: pages live under
 * /b/<brand>/…, and the middleware — after checking the caller may open that
 * brand — stamps the slug onto the `x-brand-id` request header. Everything
 * server-side reads it from here; nothing else is allowed to decide the brand.
 * The middleware strips any incoming `x-brand-id` from the outside world, so
 * the header always means "verified by the gate".
 *
 * `loadBrand` turns the brands row into the same shape `brand.config.ts` used
 * to export when a brand was a build — so the rest of the app reads
 * `brand.name`, `brand.colors.primary`, … exactly as it always did, just per
 * request instead of per deployment.
 */

import { headers } from "next/headers";
import { brand as defaultBrand, type Brand } from "@/brand.config";
import { getDb } from "./db";

export const BRAND_HEADER = "x-brand-id";

/** The settings/membership rows that are the hub's own, not any brand's. */
export const PLATFORM = "*";

const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;

export function isValidSlug(value: string): boolean {
  return SLUG.test(value);
}

/** The verified brand slug for this request. Throws where there is none. */
export async function currentBrandId(): Promise<string> {
  const value = (await headers()).get(BRAND_HEADER);
  if (!value || !SLUG.test(value)) {
    throw new Error("No brand on this request — route is outside /b/<brand>.");
  }
  return value;
}

export type BrandRow = {
  id: string;
  name: string;
  product_name: string;
  short_name: string;
  colors: string;
  font: string;
  logo_svg: string | null;
  logo_tint: number;
  icons: string | null;
};

export type LoadedBrand = Brand & {
  slug: string;
  logoSvg: string | null;
  icons: Record<string, string>;
};

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function brandFromRow(row: BrandRow): LoadedBrand {
  return {
    slug: row.id,
    name: row.name,
    productName: row.product_name || defaultBrand.productName,
    shortName: row.short_name || defaultBrand.shortName,
    logoUrl: `/b/${row.id}/logo.svg`,
    logoTint: row.logo_tint !== 0,
    logoSvg: row.logo_svg,
    colors: { ...defaultBrand.colors, ...parseJson(row.colors, {}) },
    font: { ...defaultBrand.font, ...parseJson(row.font, {}) },
    icons: parseJson(row.icons, {}),
  };
}

export async function loadBrandRow(slug: string): Promise<BrandRow | null> {
  if (!SLUG.test(slug)) return null;
  return getDb()
    .prepare(`SELECT * FROM brands WHERE id = ?`)
    .bind(slug)
    .first<BrandRow>();
}

export async function loadBrand(slug: string): Promise<LoadedBrand | null> {
  const row = await loadBrandRow(slug);
  return row ? brandFromRow(row) : null;
}

/** The brand for the current request — the per-request brand.config. */
export async function currentBrand(): Promise<LoadedBrand> {
  const slug = await currentBrandId();
  const brand = await loadBrand(slug);
  if (!brand) throw new Error(`Brand "${slug}" no longer exists.`);
  return brand;
}

/* ----------------------------------------------------------------------- *
 * Membership
 * ----------------------------------------------------------------------- */

export type BrandSummary = {
  slug: string;
  name: string;
  accent: string;
  logoSvg: string | null;
};

/** True when this email is an agency admin (member of the platform brand). */
export async function isAdmin(email: string): Promise<boolean> {
  const row = await getDb()
    .prepare(`SELECT 1 AS ok FROM memberships WHERE brand_id = ? AND email = ?`)
    .bind(PLATFORM, email.trim().toLowerCase())
    .first();
  return Boolean(row);
}

export async function emailMayOpen(email: string, slug: string): Promise<boolean> {
  const row = await getDb()
    .prepare(
      `SELECT 1 AS ok FROM memberships
       WHERE email = ? AND brand_id IN (?, ?)`,
    )
    .bind(email.trim().toLowerCase(), slug, PLATFORM)
    .first();
  return Boolean(row);
}

/** Every brand this email can open — admins get all of them. */
export async function brandsFor(email: string): Promise<BrandSummary[]> {
  const normalised = email.trim().toLowerCase();
  const admin = await isAdmin(normalised);

  type Row = { id: string; name: string; colors: string; logo_svg: string | null };

  const { results } = admin
    ? await getDb()
        .prepare(`SELECT id, name, colors, logo_svg FROM brands ORDER BY created_at ASC`)
        .all<Row>()
    : await getDb()
        .prepare(
          `SELECT b.id, b.name, b.colors, b.logo_svg FROM brands b
           JOIN memberships m ON m.brand_id = b.id
           WHERE m.email = ? ORDER BY b.created_at ASC`,
        )
        .bind(normalised)
        .all<Row>();

  return (results ?? []).map((row) => ({
    slug: row.id,
    name: row.name,
    accent: parseJson<{ primary?: string }>(row.colors, {}).primary ?? "#2563EB",
    logoSvg: row.logo_svg,
  }));
}
