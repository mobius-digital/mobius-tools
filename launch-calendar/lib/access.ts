/**
 * Optional Cloudflare Access (Zero Trust) sign-in.
 *
 * When `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are set, Cloudflare handles login —
 * Google, Microsoft, whatever the Access policy says — and the app stops asking
 * for its shared password. Two things get better: nobody types a password, and
 * every edit is stamped with a real verified identity instead of a name someone
 * typed into their own browser.
 *
 * When those variables are absent the app behaves exactly as before. This is an
 * opt-in layer, not a replacement.
 *
 * The JWT is verified properly rather than trusted. Reading the email header
 * without checking the signature would mean anyone who could reach the Worker
 * directly could simply assert whoever they liked.
 */

type Jwk = JsonWebKey & { kid?: string };

type AccessIdentity = {
  email: string;
  /** A display name derived from the email local part, e.g. "cole" -> "Cole". */
  name: string;
};

/** Cached signing keys, refetched when they age out. */
let cachedKeys: { keys: Jwk[]; fetchedAt: number } | null = null;
const KEY_TTL_MS = 60 * 60 * 1000;

export function accessIsConfigured(): boolean {
  return Boolean(process.env.ACCESS_TEAM_DOMAIN && process.env.ACCESS_AUD);
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
}

async function signingKeys(): Promise<Jwk[]> {
  const fresh = cachedKeys && Date.now() - cachedKeys.fetchedAt < KEY_TTL_MS;
  if (fresh) return cachedKeys!.keys;

  const team = process.env.ACCESS_TEAM_DOMAIN;
  const response = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error(`Could not fetch Access keys: ${response.status}`);

  const body = (await response.json()) as { keys?: Jwk[] };
  const keys = body.keys ?? [];
  cachedKeys = { keys, fetchedAt: Date.now() };
  return keys;
}

/**
 * Verifies an Access JWT and returns who it belongs to, or null if the token is
 * missing, expired, for another application, or not actually signed by
 * Cloudflare.
 */
export async function verifyAccessJwt(token: string | null): Promise<AccessIdentity | null> {
  if (!token || !accessIsConfigured()) return null;

  const [headerSegment, payloadSegment, signatureSegment] = token.split(".");
  if (!headerSegment || !payloadSegment || !signatureSegment) return null;

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = decodeSegment(headerSegment);
    payload = decodeSegment(payloadSegment);
  } catch {
    return null;
  }

  // The audience tag ties the token to this specific Access application, so a
  // valid token for some other app on the same account will not open this one.
  const aud = payload.aud;
  const expected = process.env.ACCESS_AUD;
  const audMatches = Array.isArray(aud) ? aud.includes(expected) : aud === expected;
  if (!audMatches) return null;

  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (exp * 1000 < Date.now()) return null;

  let keys: Jwk[];
  try {
    keys = await signingKeys();
  } catch {
    return null;
  }

  const jwk = keys.find((key) => key.kid === header.kid) ?? keys[0];
  if (!jwk) return null;

  let valid = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );

    valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlToBytes(signatureSegment) as BufferSource,
      new TextEncoder().encode(`${headerSegment}.${payloadSegment}`) as BufferSource,
    );
  } catch {
    return null;
  }

  if (!valid) return null;

  const email = typeof payload.email === "string" ? payload.email : "";
  if (!email) return null;

  return { email, name: nameFromEmail(email) };
}

/**
 * "cole.wetzl@example.com" -> "Cole Wetzl".
 *
 * Good enough to stamp on an edit, and better than asking a person to type
 * their own name into a box nobody verifies.
 */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || email
  );
}

/** The header Cloudflare Access puts the signed identity in. */
export const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
