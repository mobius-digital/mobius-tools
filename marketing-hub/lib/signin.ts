/**
 * How people get into a brand's board.
 *
 * Two doors, both always available per brand:
 *   - Google, for anyone on the brand's member list (agency admins are
 *     members of everything). Membership is re-checked on every request.
 *   - the brand's shared team password, if one is set.
 *
 * The Google client ID belongs to the hub, not to any brand — one origin, one
 * ID, stored once in the platform settings row.
 */

import { getDb } from "./db";
import { currentBrandId, PLATFORM } from "./brandContext";
import { currentPasswordHash } from "./auth";
import { normalizeEmail } from "./identity";

export { normalizeEmail };

export type SignInConfig = {
  googleClientId: string;
  /** Whether this brand has a shared team password set. */
  passwordEnabled: boolean;
};

const CLIENT_ID_KEY = "google_client_id";

export async function googleClientId(): Promise<string> {
  const row = await getDb()
    .prepare(`SELECT value FROM settings WHERE brand_id = ? AND key = ?`)
    .bind(PLATFORM, CLIENT_ID_KEY)
    .first<{ value: string }>();
  return row?.value ?? "";
}

export async function setGoogleClientId(value: string): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO settings (brand_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(brand_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(PLATFORM, CLIENT_ID_KEY, value, new Date().toISOString())
    .run();
}

export async function signInConfig(): Promise<SignInConfig> {
  const [clientId, hash] = await Promise.all([googleClientId(), currentPasswordHash()]);
  return { googleClientId: clientId, passwordEnabled: hash !== null };
}

/** This brand's Google members. Agency admins are not listed — they are on everything. */
export async function listAllowedEmails(brandId?: string): Promise<string[]> {
  const { results } = await getDb()
    .prepare(`SELECT email FROM memberships WHERE brand_id = ? ORDER BY email ASC`)
    .bind(brandId ?? (await currentBrandId()))
    .all<{ email: string }>();
  return (results ?? []).map((row) => row.email);
}

export async function addAllowedEmail(email: string, brandId?: string): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error("Not an email address.");
  await getDb()
    .prepare(
      `INSERT INTO memberships (brand_id, email, created_at) VALUES (?, ?, ?)
       ON CONFLICT(brand_id, email) DO NOTHING`,
    )
    .bind(brandId ?? (await currentBrandId()), normalized, new Date().toISOString())
    .run();
}

/**
 * Removes a member — refusing the removal that would leave a passwordless
 * board with nobody able to open it.
 */
export async function removeAllowedEmail(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const brandId = await currentBrandId();
  const [members, hash] = await Promise.all([listAllowedEmails(brandId), currentPasswordHash()]);

  const target = normalizeEmail(email);
  if (!target) return { ok: false, error: "That is not an email address." };

  if (!hash && members.length <= 1 && members.includes(target)) {
    return {
      ok: false,
      error:
        "This board has no team password, so removing its last member would lock everyone out. Set a password first, or add somebody else.",
    };
  }

  await getDb()
    .prepare(`DELETE FROM memberships WHERE brand_id = ? AND email = ?`)
    .bind(brandId, target)
    .run();
  return { ok: true };
}
