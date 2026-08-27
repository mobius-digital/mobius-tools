import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { brandsFor, isAdmin } from "@/lib/brandContext";
import { IDENTITY_COOKIE, readIdentityToken } from "@/lib/session";
import { getPerson, setPersonName } from "@/lib/people";

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

  const [brands, admin, person] = await Promise.all([
    brandsFor(identity.email),
    isAdmin(identity.email),
    getPerson(identity.email),
  ]);

  return NextResponse.json({
    name: person?.name ?? identity.name,
    email: identity.email,
    brands: brands.map(({ slug, name, accent }) => ({ slug, name, accent })),
    admin,
  });
}

/**
 * Sets the name this person's edits are signed with.
 *
 * Against the account rather than the browser, so it follows them to every
 * device and every board. Only ever their own — the address comes from the
 * signed cookie, never from the request body.
 */
export async function POST(request: Request) {
  const identity = await readIdentityToken(
    (await cookies()).get(IDENTITY_COOKIE)?.value,
  );
  if (!identity) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { name?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const result = await setPersonName(identity.email, String(body.name ?? ""));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  return NextResponse.json({ name: result.name });
}
