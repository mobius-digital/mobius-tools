/**
 * Just enough JWT to verify an RS256 token against a published JWK set.
 *
 * Used for Google's ID tokens. The signature is checked rather than the payload
 * merely decoded — an unverified JWT is a claim, not a fact, and anyone can mint
 * one that says whatever they like.
 */

type Jwk = JsonWebKey & { kid?: string };

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
}

const KEY_TTL_MS = 60 * 60 * 1000;
const keyCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();

async function signingKeys(certsUrl: string): Promise<Jwk[]> {
  const cached = keyCache.get(certsUrl);
  if (cached && Date.now() - cached.fetchedAt < KEY_TTL_MS) return cached.keys;

  const response = await fetch(certsUrl);
  if (!response.ok) throw new Error(`Could not fetch signing keys: ${response.status}`);

  const body = (await response.json()) as { keys?: Jwk[] };
  const keys = body.keys ?? [];
  keyCache.set(certsUrl, { keys, fetchedAt: Date.now() });
  return keys;
}

/**
 * Verifies signature and expiry, and returns the payload — or null for anything
 * malformed, expired or not actually signed by the issuer.
 *
 * Callers still have to check the claims they care about (audience, issuer).
 */
export async function verifyRs256(
  token: string,
  certsUrl: string,
): Promise<Record<string, unknown> | null> {
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

  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (exp * 1000 < Date.now()) return null;

  let keys: Jwk[];
  try {
    keys = await signingKeys(certsUrl);
  } catch {
    return null;
  }

  // Only the key the token names. Falling back to "try them all" would let a
  // token signed by a retired key keep working past its rotation.
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) return null;

  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlToBytes(signatureSegment) as BufferSource,
      new TextEncoder().encode(`${headerSegment}.${payloadSegment}`) as BufferSource,
    );

    return valid ? payload : null;
  } catch {
    return null;
  }
}
