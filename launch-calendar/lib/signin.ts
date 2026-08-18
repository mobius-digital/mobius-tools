/**
 * How people get in — chosen from inside the app, not from a dashboard.
 *
 * Two modes:
 *   password — one shared password, the same link for everybody
 *   google   — an invite list of email addresses, each signing in with Google
 *
 * Both settings and the invite list live in the database, so switching modes or
 * adding a colleague takes effect immediately with no redeploy.
 */

import { getDb } from "./db";
import { normaliseEmail } from "./identity";

export { normaliseEmail };

export type AuthMode = "password" | "google";

export type SignInConfig = {
  mode: AuthMode;
  googleClientId: string;
  /**
   * Whether the shared password still works while in Google mode.
   *
   * On by default when switching, as the way back in if the Google client ID
   * turns out to be wrong. Without it a bad value locks everybody out of their
   * own board with no route to fix it.
   */
  passwordFallback: boolean;
};

const MODE_KEY = "auth_mode";
const CLIENT_ID_KEY = "google_client_id";
const FALLBACK_KEY = "password_fallback";

async function readSetting(key: string): Promise<string | null> {
  const row = await getDb()
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

async function writeSetting(key: string, value: string): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(key, value, new Date().toISOString())
    .run();
}

export async function signInConfig(): Promise<SignInConfig> {
  const [mode, clientId, fallback] = await Promise.all([
    readSetting(MODE_KEY),
    readSetting(CLIENT_ID_KEY),
    readSetting(FALLBACK_KEY),
  ]);

  return {
    // Anything unrecognised falls back to the password gate rather than to no
    // gate at all.
    mode: mode === "google" ? "google" : "password",
    googleClientId: clientId ?? "",
    passwordFallback: fallback !== "off",
  };
}

export async function listAllowedEmails(): Promise<string[]> {
  const { results } = await getDb()
    .prepare(`SELECT email FROM allowed_emails ORDER BY email ASC`)
    .all<{ email: string }>();
  return (results ?? []).map((row) => row.email);
}

export async function emailIsAllowed(email: string): Promise<boolean> {
  const row = await getDb()
    .prepare(`SELECT 1 AS ok FROM allowed_emails WHERE email = ?`)
    .bind(email.trim().toLowerCase())
    .first();
  return Boolean(row);
}

export async function addAllowedEmail(email: string, addedBy: string): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO allowed_emails (email, added_by, created_at) VALUES (?, ?, ?)
       ON CONFLICT(email) DO NOTHING`,
    )
    .bind(email, addedBy, new Date().toISOString())
    .run();
}

export async function removeAllowedEmail(email: string): Promise<void> {
  await getDb().prepare(`DELETE FROM allowed_emails WHERE email = ?`).bind(email).run();
}

/**
 * Applies a settings change, refusing the ones that would lock everybody out.
 *
 * Google mode with no client ID, or with nobody on the invite list, is a board
 * nobody can open — including the person making the change.
 */
export async function updateSignInConfig(next: {
  mode?: unknown;
  googleClientId?: unknown;
  passwordFallback?: unknown;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await signInConfig();

  const mode: AuthMode =
    next.mode === "google" ? "google" : next.mode === "password" ? "password" : current.mode;

  const clientId =
    typeof next.googleClientId === "string"
      ? next.googleClientId.trim()
      : current.googleClientId;

  const fallback =
    typeof next.passwordFallback === "boolean"
      ? next.passwordFallback
      : current.passwordFallback;

  if (mode === "google") {
    if (!clientId) {
      return { ok: false, error: "Add your Google client ID before switching to Google sign-in." };
    }
    if (!clientId.endsWith(".apps.googleusercontent.com")) {
      return {
        ok: false,
        error: "That does not look like a Google client ID — it should end in .apps.googleusercontent.com",
      };
    }
    const allowed = await listAllowedEmails();
    if (allowed.length === 0) {
      return {
        ok: false,
        error: "Add at least one email address first, or nobody will be able to get in.",
      };
    }
  }

  await Promise.all([
    writeSetting(MODE_KEY, mode),
    writeSetting(CLIENT_ID_KEY, clientId),
    writeSetting(FALLBACK_KEY, fallback ? "on" : "off"),
  ]);

  return { ok: true };
}
