import { currentBrandId } from "./brandContext";
import { getDb } from "./db";
import { hashPassword, sessionTokenFor, verifyPassword } from "./password";

export {
  SESSION_MAX_AGE,
  timingSafeEqual as safeEqual,
} from "./password";

/**
 * Each brand's shared team password.
 *
 * The stored hash is the source of truth, per brand, in the settings table.
 * There is no environment-variable seed any more: a brand is born from the
 * Clients screen, which sets the first password — and it is changed from the
 * board's own Settings after that. The cookie is scoped per brand too, so
 * being signed in to one client's board says nothing about another's.
 */

const SETTINGS_KEY = "password_hash";

/** One cookie per brand: lc_s_lucky-golf. */
export function sessionCookieName(brandId: string): string {
  return `lc_s_${brandId}`;
}

async function readStoredHash(brandId: string): Promise<string | null> {
  const row = await getDb()
    .prepare(`SELECT value FROM settings WHERE brand_id = ? AND key = ?`)
    .bind(brandId, SETTINGS_KEY)
    .first<{ value: string }>();

  return row?.value ?? null;
}

export async function writeStoredHash(brandId: string, hash: string): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO settings (brand_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(brand_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(brandId, SETTINGS_KEY, hash, new Date().toISOString())
    .run();
}

/** Null means the brand has no team password — Google members only. */
export async function currentPasswordHash(brandId?: string): Promise<string | null> {
  return readStoredHash(brandId ?? (await currentBrandId()));
}

export async function isPasswordConfigured(): Promise<boolean> {
  try {
    return (await currentPasswordHash()) !== null;
  } catch {
    return false;
  }
}

/** The cookie value a valid session for this brand should carry right now. */
export async function sessionTokenForBrand(brandId: string): Promise<string | null> {
  const hash = await readStoredHash(brandId);
  return hash ? sessionTokenFor(hash) : null;
}

export async function sessionToken(): Promise<string | null> {
  return sessionTokenForBrand(await currentBrandId());
}

export async function checkPassword(candidate: string): Promise<boolean> {
  const hash = await currentPasswordHash();
  if (!hash) return false;
  return verifyPassword(candidate, hash);
}

/** Sets a brand's password outright — the Clients screen's reset. */
export async function setPassword(brandId: string, password: string): Promise<void> {
  await writeStoredHash(brandId, await hashPassword(password));
}

/**
 * Changes the current brand's password, after proving the current one.
 * Returns the new session token so the person doing it stays signed in.
 */
export async function changePassword(
  currentPassword: string,
  nextPassword: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const brandId = await currentBrandId();
  const hash = await readStoredHash(brandId);
  if (!hash) return { ok: false, error: "This board has no team password set." };

  if (!(await verifyPassword(currentPassword, hash))) {
    return { ok: false, error: "That is not the current password." };
  }

  const trimmed = nextPassword.trim();
  if (trimmed.length < 8) {
    return { ok: false, error: "Use at least 8 characters." };
  }
  if (await verifyPassword(trimmed, hash)) {
    return { ok: false, error: "That is already the password." };
  }

  const nextHash = await hashPassword(trimmed);
  await writeStoredHash(brandId, nextHash);

  return { ok: true, token: await sessionTokenFor(nextHash) };
}
