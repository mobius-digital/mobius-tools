/**
 * Sessions for Google sign-in.
 *
 * The password gate can get away with a cookie derived from the stored hash,
 * because every session is identical — there is nobody to tell apart. Google
 * sign-in has to carry *who* signed in, so the cookie holds a small payload and
 * an HMAC over it. Signed, not encrypted: the contents are the person's own
 * email and name, which they already know.
 *
 * The signing key is generated once and kept in the database. Rotating it (or
 * removing somebody from the invite list) invalidates sessions on the spot.
 */

import { getDb } from "./db";
import { bytesToBase64Url, base64UrlToBytes } from "./jwt";

export type SessionIdentity = {
  email: string;
  name: string;
};

const KEY_SETTING = "session_key";

/** 30 days. Shorter than the password cookie: this one names a person. */
export const IDENTITY_MAX_AGE = 60 * 60 * 24 * 30;

async function signingKey(): Promise<CryptoKey> {
  const db = getDb();
  const row = await db
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .bind(KEY_SETTING)
    .first<{ value: string }>();

  let secret = row?.value;

  if (!secret) {
    secret = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    await db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO NOTHING`,
      )
      .bind(KEY_SETTING, secret, new Date().toISOString())
      .run();

    // A concurrent request may have won the insert; re-read so both agree.
    const settled = await db
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .bind(KEY_SETTING)
      .first<{ value: string }>();
    secret = settled?.value ?? secret;
  }

  return crypto.subtle.importKey(
    "raw",
    base64UrlToBytes(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** `payload.signature`, both base64url. */
export async function issueIdentityToken(identity: SessionIdentity): Promise<string> {
  const payload = bytesToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        e: identity.email,
        n: identity.name,
        x: Math.floor(Date.now() / 1000) + IDENTITY_MAX_AGE,
      }),
    ),
  );

  const key = await signingKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload) as BufferSource,
  );

  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

/**
 * Returns the identity a cookie vouches for, or null if the signature is wrong
 * or the session has aged out.
 */
export async function readIdentityToken(
  token: string | undefined | null,
): Promise<SessionIdentity | null> {
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  let valid = false;
  try {
    const key = await signingKey();
    valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signature) as BufferSource,
      new TextEncoder().encode(payload) as BufferSource,
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  try {
    const body = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
    if (typeof body.x !== "number" || body.x * 1000 < Date.now()) return null;
    if (typeof body.e !== "string" || typeof body.n !== "string") return null;
    return { email: body.e, name: body.n };
  } catch {
    return null;
  }
}

export const IDENTITY_COOKIE = "lc_identity";
