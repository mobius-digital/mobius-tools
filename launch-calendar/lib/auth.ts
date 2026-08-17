import { getDb } from "./db";
import { hashPassword, sessionTokenFor, verifyPassword } from "./password";

export {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  timingSafeEqual as safeEqual,
} from "./password";

/**
 * Reading and changing the shared team password.
 *
 * The stored hash is the source of truth. `APP_PASSWORD` is only the seed for a
 * brand new deployment: the first time anybody signs in, the env value is hashed
 * into the database and from then on the app owns it, which is what lets the
 * password be changed from Settings without a redeploy.
 */

const SETTINGS_KEY = "password_hash";

async function readStoredHash(): Promise<string | null> {
  const row = await getDb()
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .bind(SETTINGS_KEY)
    .first<{ value: string }>();

  return row?.value ?? null;
}

async function writeStoredHash(hash: string): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(SETTINGS_KEY, hash, new Date().toISOString())
    .run();
}

/**
 * The hash the app should currently be checking against, seeding it from
 * APP_PASSWORD the first time. Null means the deployment has no password at all
 * and nobody can sign in — deliberately, rather than falling open.
 */
export async function currentPasswordHash(): Promise<string | null> {
  const stored = await readStoredHash();
  if (stored) return stored;

  const seed = process.env.APP_PASSWORD;
  if (!seed) return null;

  const hash = await hashPassword(seed);
  await writeStoredHash(hash);
  return hash;
}

export async function isPasswordConfigured(): Promise<boolean> {
  try {
    return (await currentPasswordHash()) !== null;
  } catch {
    return false;
  }
}

/** The cookie value a valid session should carry right now. */
export async function sessionToken(): Promise<string | null> {
  const hash = await currentPasswordHash();
  return hash ? sessionTokenFor(hash) : null;
}

export async function checkPassword(candidate: string): Promise<boolean> {
  const hash = await currentPasswordHash();
  if (!hash) return false;
  return verifyPassword(candidate, hash);
}

/**
 * Changes the password, after proving the current one. Returns the new session
 * token so the person doing it is not signed out by their own change.
 */
export async function changePassword(
  currentPassword: string,
  nextPassword: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const hash = await currentPasswordHash();
  if (!hash) return { ok: false, error: "This deployment has no password set." };

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
  await writeStoredHash(nextHash);

  return { ok: true, token: await sessionTokenFor(nextHash) };
}
