import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/auth";
import { ACCESS_JWT_HEADER, accessIsConfigured, verifyAccessJwt } from "@/lib/access";

/**
 * Gates every page and API route.
 *
 * Two modes. With Cloudflare Access configured, Cloudflare has already
 * authenticated the person and the only job here is to verify the token it
 * passed along. Without it, the app's own shared-password cookie is the gate.
 */
export async function middleware(request: NextRequest) {
  if (accessIsConfigured()) {
    const identity = await verifyAccessJwt(
      request.headers.get(ACCESS_JWT_HEADER),
    );

    // Access itself owns the login screen, so there is nowhere useful to
    // redirect to — a request without a valid token should simply be refused.
    if (!identity) {
      return new NextResponse("Not authorised.", { status: 401 });
    }

    return NextResponse.next();
  }

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
