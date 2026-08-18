import { NextResponse } from "next/server";
import { verifyGoogleToken } from "@/lib/google";
import { emailIsAllowed, signInConfig } from "@/lib/signin";
import { IDENTITY_COOKIE, IDENTITY_MAX_AGE, issueIdentityToken } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Exchanges a Google ID token for a session.
 *
 * Two gates, both required: Google must have signed the token for this app, and
 * the address must be on the invite list. A valid Google account that nobody
 * invited gets a clear refusal rather than a way in.
 */
export async function POST(request: Request) {
  const config = await signInConfig();

  if (config.mode !== "google") {
    return NextResponse.json(
      { error: "Google sign-in is not switched on for this board." },
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

  const identity = await verifyGoogleToken(credential, config.googleClientId);
  if (!identity) {
    return NextResponse.json(
      { error: "That Google sign-in could not be verified. Try again." },
      { status: 401 },
    );
  }

  if (!(await emailIsAllowed(identity.email))) {
    return NextResponse.json(
      {
        error: `${identity.email} has not been given access to this board. Ask whoever runs it to add you.`,
      },
      { status: 403 },
    );
  }

  const response = NextResponse.json({ ok: true, name: identity.name });
  response.cookies.set(IDENTITY_COOKIE, await issueIdentityToken(identity), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: IDENTITY_MAX_AGE,
  });

  return response;
}
