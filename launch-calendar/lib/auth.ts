/**
 * Shared-password gate (PRD §6).
 *
 * There are no accounts. The whole site sits behind one password; passing it
 * sets a long-lived cookie whose value is derived from the password itself, so
 * rotating APP_PASSWORD invalidates every session that was already open.
 *
 * Uses Web Crypto rather than node:crypto so the same helper runs in
 * middleware (edge runtime) and in the route handler.
 */

export const SESSION_COOKIE = "lc_session";

/** 90 days, in seconds. "Checked once" in the PRD means a long-lived cookie. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90;

const TOKEN_SALT = "launch-calendar:v1";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The cookie value for the currently configured password, or null when
 * APP_PASSWORD is unset — in which case nothing can authenticate and the gate
 * stays closed rather than falling open.
 */
export async function sessionToken(): Promise<string | null> {
  const password = process.env.APP_PASSWORD;
  if (!password) return null;

  const data = new TextEncoder().encode(`${TOKEN_SALT}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toBase64Url(new Uint8Array(digest));
}

/** Constant-time-ish comparison, so a wrong guess leaks no length information. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function isPasswordConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}
