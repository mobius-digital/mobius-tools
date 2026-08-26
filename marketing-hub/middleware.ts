import { NextResponse, type NextRequest } from "next/server";
import { safeEqual, sessionCookieName, sessionTokenForBrand } from "@/lib/auth";
import { IDENTITY_COOKIE, readIdentityToken } from "@/lib/session";
import { BRAND_HEADER, emailMayOpen, isAdmin, isValidSlug, loadBrandRow } from "@/lib/brandContext";

/**
 * The hub's gate. One deployment serves every brand, so this is where "who
 * are you" meets "which brand is this request about":
 *
 *   /b/<brand>/…   a brand's board and its APIs. Open to a Google identity
 *                  that is a member of the brand (agency admins are members
 *                  of everything), or to that brand's team-password cookie.
 *                  On success the slug is stamped onto the x-brand-id header
 *                  — the single source of brand truth for everything behind
 *                  the gate.
 *   /admin, /api/admin
 *                  agency admins only.
 *   /              the front door: brand picker for the signed-in, sign-in
 *                  for everyone else. The page sorts that out itself.
 *
 * The incoming x-brand-id is always stripped first: the header means
 * "verified here", never "claimed by the caller".
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(BRAND_HEADER);

  const identity = await readIdentityToken(
    request.cookies.get(IDENTITY_COOKIE)?.value,
  );

  // ---- Admin area -------------------------------------------------------
  if (pathname === "/admin" || pathname.startsWith("/api/admin")) {
    if (identity && (await isAdmin(identity.email))) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Admins only." }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  // ---- Brand routes -----------------------------------------------------
  const match = pathname.match(/^\/b\/([^/]+)(\/.*)?$/);
  if (!match) {
    // The root, sign-in APIs, /offline — public; pages decide what to show.
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const [, slug, rest = "/"] = match;
  if (!isValidSlug(slug) || !(await loadBrandRow(slug))) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  requestHeaders.set(BRAND_HEADER, slug);
  const proceed = () => NextResponse.next({ request: { headers: requestHeaders } });

  // What a phone fetches cookieless at install time, plus the gate itself.
  if (
    rest === "/password" ||
    rest === "/api/auth" ||
    rest === "/manifest.webmanifest" ||
    rest === "/logo.svg" ||
    rest.startsWith("/icons/")
  ) {
    return proceed();
  }

  // A member's Google session opens the brand; membership is re-checked on
  // every request so removing somebody ends their open session immediately.
  if (identity && (await emailMayOpen(identity.email, slug))) {
    return proceed();
  }

  // The brand's shared team password.
  const presented = request.cookies.get(sessionCookieName(slug))?.value;
  if (presented) {
    const expected = await sessionTokenForBrand(slug);
    if (expected && safeEqual(presented, expected)) {
      return proceed();
    }
  }

  const target = request.nextUrl.clone();
  target.pathname = `/b/${slug}/password`;
  target.search = "";
  const from = pathname + request.nextUrl.search;
  if (from && from !== `/b/${slug}`) target.searchParams.set("from", from);

  const response = NextResponse.redirect(target);
  if (presented) response.cookies.delete(sessionCookieName(slug));
  if (identity === null && request.cookies.get(IDENTITY_COOKIE)) {
    response.cookies.delete(IDENTITY_COOKIE);
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   api/auth/google — issues the identity cookie, must stay reachable
     *   api/cron        — guards itself with the per-tick nonce
     *   _next/*, static files, sw.js, offline
     */
    "/((?!api/auth/google|api/cron|_next/static|_next/image|favicon.ico|logo.svg|icons/|manifest.webmanifest|sw.js|offline).*)",
  ],
};
