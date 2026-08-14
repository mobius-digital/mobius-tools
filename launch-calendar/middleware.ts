import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/auth";

/**
 * Gates every page and API route behind the shared password.
 *
 * The matcher below excludes the password screen itself, the endpoint that
 * grants the cookie, and static assets — everything else redirects when the
 * cookie is missing or stale.
 */
export async function middleware(request: NextRequest) {
  const presented = request.cookies.get(SESSION_COOKIE)?.value;
  const expected = await sessionToken();

  if (expected && presented && safeEqual(presented, expected)) {
    return NextResponse.next();
  }

  const target = request.nextUrl.clone();
  target.pathname = "/password";
  target.search = "";

  const from = request.nextUrl.pathname + request.nextUrl.search;
  if (from && from !== "/") target.searchParams.set("from", from);

  const response = NextResponse.redirect(target);

  // A cookie that no longer matches (rotated password) is cleared rather than
  // left to be re-sent on every subsequent request.
  if (presented) response.cookies.delete(SESSION_COOKIE);

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   password        — the gate itself
     *   api/auth        — the endpoint that issues the cookie
     *   _next/*         — build output
     *   logo.svg, favicon.ico, and other root-level static files
     */
    "/((?!password|api/auth|_next/static|_next/image|favicon.ico|logo.svg).*)",
  ],
};
