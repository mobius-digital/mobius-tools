/**
 * "Sign in with Google", verified in the Worker.
 *
 * The browser gets an ID token from Google and posts it here; this checks that
 * Google really signed it, that it was issued for this app, and that the address
 * is one somebody put on the invite list.
 *
 * Only a client ID is involved — no client secret. Google's Identity Services
 * button returns a signed ID token directly, so there is no secret to store, and
 * the client ID is public by design.
 */

import { verifyRs256 } from "./jwt";
import { nameFromEmail } from "./identity";

const GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

export type GoogleIdentity = {
  email: string;
  name: string;
};

/**
 * Returns who the token belongs to, or null if it is not a genuine, current
 * Google token issued for this app.
 */
export async function verifyGoogleToken(
  token: string,
  clientId: string,
): Promise<GoogleIdentity | null> {
  if (!token || !clientId) return null;

  const payload = await verifyRs256(token, GOOGLE_CERTS);
  if (!payload) return null;

  // Ties the token to this app. Without it, a token minted for any other Google
  // app the person has used would be accepted here.
  if (payload.aud !== clientId) return null;

  const iss = typeof payload.iss === "string" ? payload.iss : "";
  if (!GOOGLE_ISSUERS.includes(iss)) return null;

  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
  if (!email) return null;

  // Google sends this false for addresses it has not confirmed belong to the
  // account, which would otherwise let someone claim a colleague's address.
  if (payload.email_verified !== true && payload.email_verified !== "true") return null;

  const name = typeof payload.name === "string" && payload.name.trim()
    ? payload.name.trim()
    : nameFromEmail(email);

  return { email, name };
}

export { nameFromEmail };
