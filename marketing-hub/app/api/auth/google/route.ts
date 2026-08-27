import { NextResponse } from "next/server";
import { verifyGoogleToken } from "@/lib/google";
import { googleClientId } from "@/lib/signin";
import { brandsFor, isAdmin } from "@/lib/brandContext";
import { IDENTITY_COOKIE, IDENTITY_MAX_AGE, issueIdentityToken } from "@/lib/session";
import { getPerson, rememberPerson } from "@/lib/people";

export const dynamic = "force-dynamic";

/**
 * Exchanges a Google ID token for a hub-wide identity.
 *
 * One sign-in for the whole hub: the token must be signed for this app, and
 * the address must be a member of at least one brand (or an agency admin).
 * Which brands that identity may open is decided per request by the gate,
 * not here — so removing somebody from a brand takes effect immediately.
 */
export async function POST(request: Request) {
  const clientId = await googleClientId();
  if (!clientId) {
    return NextResponse.json(
      { error: "Google sign-in is not configured yet." },
      { status: 400 },
    );
  }

  let credential = "";
  try {
    const body = (await request.json()) as { credential?: unknown };
    credential = typeof body.credential === "string" ? body.credential : "";
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const identity = await verifyGoogleToken(credential, clientId);
  if (!identity) {
    return NextResponse.json(
      { error: "That Google sign-in could not be verified. Try again." },
      { status: 401 },
    );
  }

  const [brands, admin] = await Promise.all([
    brandsFor(identity.email),
    isAdmin(identity.email),
  ]);
  if (brands.length === 0 && !admin) {
    return NextResponse.json(
      {
        error: `${identity.email} has not been given access to any board here. Ask whoever runs it to add you.`,
      },
      { status: 403 },
    );
  }

  // Seeds the row the first time and leaves a chosen name alone after that,
  // so signing in again never reverts a correction.
  await rememberPerson(identity.email, identity.name);
  const person = await getPerson(identity.email);

  const response = NextResponse.json({
    ok: true,
    name: person?.name ?? identity.name,
    brands,
    admin,
  });
  response.cookies.set(IDENTITY_COOKIE, await issueIdentityToken(identity), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: IDENTITY_MAX_AGE,
  });

  return response;
}
