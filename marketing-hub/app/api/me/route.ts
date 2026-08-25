import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { brandsFor, isAdmin } from "@/lib/brandContext";
import { IDENTITY_COOKIE, readIdentityToken } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Who am I, and which brands may I open?
 *
 * Drives the switcher and the front door. A password-only session has no
 * identity, so it gets an empty list — the switcher simply does not appear,
 * which is exactly right for a client team on their own board.
 */
export async function GET() {
  const identity = await readIdentityToken(
    (await cookies()).get(IDENTITY_COOKIE)?.value,
  );

  if (!identity) return NextResponse.json({ brands: [], admin: false });

  const [brands, admin] = await Promise.all([
    brandsFor(identity.email),
    isAdmin(identity.email),
  ]);

  return NextResponse.json({
    name: identity.name,
    email: identity.email,
    brands: brands.map(({ slug, name, accent }) => ({ slug, name, accent })),
    admin,
  });
}
