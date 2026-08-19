import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/auth";
import { IDENTITY_COOKIE, readIdentityToken } from "@/lib/session";
import { emailIsAllowed, signInConfig } from "@/lib/signin";

/**
 * Gates every page and API route.
 *
 * A signed-in Google session is accepted whenever one is presented and still
 * valid, and the shared password is accepted in password mode — or in Google
 * mode while the fallback is deliberately left on, which is what stops a wrong
 * client ID locking a team out of their own board.
 */
export async function middleware(request: NextRequest) {
  const config = await signInConfig();

  const identity = await readIdentityToken(
    request.cookies.get(IDENTITY_COOKIE)?.value,
  );

  // Checked on every request, not just at sign-in: removing somebody from the
  // invite list has to end the session they already have open.
  if (identity && config.mode === "google" && (await emailIsAllowed(identity.email))) {
    return NextResponse.next();
  }

  const passwordAccepted =
    config.mode === "password" || config.passwordFallback;

  if (passwordAccepted) {
    const presented = request.cookies.get(SESSION_COOKIE)?.value;
    const expected = await sessionToken();
    if (expected && presented && safeEqual(presented, expected)) {
      return NextResponse.next();
    }
  }

  const target = request.nextUrl.clone();
  target.pathname = "/password";
  target.search = "";

  const from = request.nextUrl.pathname + request.nextUrl.search;
  if (from && from !== "/") target.searchParams.set("from", from);

  const response = NextResponse.redirect(target);

  // Cookies that no longer open anything — a rotated password, a revoked
  // invitation — are cleared rather than re-sent on every later request.
  if (request.cookies.get(SESSION_COOKIE)) response.cookies.delete(SESSION_COOKIE);
  if (identity === null && request.cookies.get(IDENTITY_COOKIE)) {
    response.cookies.delete(IDENTITY_COOKIE);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   password        — the gate itself
     *   api/auth        — the endpoints that issue a cookie
     *   api/cron        — the scheduled tick, which has no cookie to present
     *                     and guards itself with a per-tick nonce instead
     *   _next/*         — build output
     *   logo.svg, favicon.ico, and other root-level static files
     *   manifest.webmanifest, icons/*, sw.js, offline
     *                   — what a phone fetches (without cookies) when the board
     *                     is added to a home screen; a redirect here makes iOS
     *                     silently install a bookmark instead of an app
     */
    "/((?!password|api/auth|api/cron|_next/static|_next/image|favicon.ico|logo.svg|manifest.webmanifest|icons/|sw.js|offline).*)",
  ],
};
