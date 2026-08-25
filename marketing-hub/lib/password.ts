/**
 * The shared team password (PRD §6).
 *
 * The password lives in the database rather than in a Cloudflare secret, so it
 * can be changed from inside the app instead of needing a redeploy. The secret
 * `APP_PASSWORD` is still honoured as the initial value: a fresh deployment has
 * no row yet, so it falls back to the env var until somebody changes it.
 *
 * Stored as PBKDF2-SHA256 rather than a bare digest — the database is only
 * reachable from the Worker, but a stored password should still be expensive to
 * reverse if it ever leaks.
 */

const ITERATIONS = 100_000;
const KEY_BITS = 256;
const TOKEN_LABEL = "launch-calendar:session:v2";

export const SESSION_COOKIE = "lc_session";

/** 90 days, in seconds. "Checked once" in the PRD means a long-lived cookie. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITERATIONS },
    key,
    KEY_BITS,
  );

  return new Uint8Array(bits);
}

/** `pbkdf2$iterations$salt$hash`, all base64. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, iterations, salt, expected] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterations || !salt || !expected) return false;

  const actual = await derive(password, fromBase64(salt));
  return timingSafeEqual(toBase64(actual), expected);
}

/** Constant-time-ish comparison, so a wrong guess leaks no length information. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/**
 * The cookie value for a given stored password.
 *
 * Derived from the hash, so changing the password invalidates every session
 * that was already open — the same property the old env-var scheme had.
 */
export async function sessionTokenFor(storedHash: string): Promise<string> {
  const data = new TextEncoder().encode(`${TOKEN_LABEL}:${storedHash}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toBase64Url(new Uint8Array(digest));
}
