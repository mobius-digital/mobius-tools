import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { currentBrandId } from "@/lib/brandContext";
import { listAllowedEmails } from "@/lib/signin";
import { namesFor, getPerson } from "@/lib/people";
import { IDENTITY_COOKIE, readIdentityToken } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Who could own an event on this board.
 *
 * Three sources, because no single one of them is complete:
 *
 *   the board's members — people invited by email, named if they have signed
 *   in at least once and guessed from their address if not;
 *
 *   whoever already owns an event here — which is the only way to know about
 *   somebody who does not use the app at all, and there are always some: a
 *   freelancer, a client's designer, whoever actually does the thing;
 *
 *   and you, since the person adding an event is usually the person who owns
 *   it.
 *
 * Names only. This is a picker for a text field, not a directory — a client's
 * team should not be able to read colleagues' addresses out of a dropdown.
 */
export async function GET() {
  const brandId = await currentBrandId();

  const identity = await readIdentityToken(
    (await cookies()).get(IDENTITY_COOKIE)?.value,
  );

  const [emails, owners, me] = await Promise.all([
    listAllowedEmails(),
    getDb()
      .prepare(
        `SELECT DISTINCT owner FROM events
         WHERE brand_id = ? AND owner IS NOT NULL AND TRIM(owner) <> ''
         ORDER BY owner`,
      )
      .bind(brandId)
      .all<{ owner: string }>(),
    identity ? getPerson(identity.email) : null,
  ]);

  const named = await namesFor(emails);

  const seen = new Set<string>();
  const people: string[] = [];
  const add = (value: string | undefined | null) => {
    const name = (value ?? "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    people.push(name);
  };

  // Members first — the people a board is actually run by.
  for (const email of emails) add(named.get(email));
  // Then names already in use here, so an existing event's owner is offered.
  for (const row of owners.results ?? []) add(row.owner);

  return NextResponse.json({
    people,
    me: me?.name ?? identity?.name ?? null,
  });
}
