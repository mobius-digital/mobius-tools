import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { listAllowedEmails } from "@/lib/signin";
import { namesFor, getPerson } from "@/lib/people";
import { IDENTITY_COOKIE, readIdentityToken } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Who could own an event on this board: the people on it, and you.
 *
 * Names already typed on past events are deliberately NOT included. They are
 * loose text rather than anybody in particular, so the same person arrived
 * twice — once as themselves and once as whatever an old event happened to
 * call them, "Cole" beside "Cole Wetzler". A list of people should have one
 * row per person. Anyone who is not on the board is still reachable through
 * "Someone else", which is where a freelancer or a client's designer belongs.
 *
 * A member who has never signed in has no name of their own yet, so one is
 * worked out from their address — a poor guess, and it stops being a guess
 * the first time they sign in and are asked.
 *
 * Names only. This is a picker for a text field, not a directory — a client's
 * team should not be able to read colleagues' addresses out of a dropdown.
 */
export async function GET() {
  const identity = await readIdentityToken(
    (await cookies()).get(IDENTITY_COOKIE)?.value,
  );

  const [emails, me] = await Promise.all([
    listAllowedEmails(),
    identity ? getPerson(identity.email) : null,
  ]);

  const named = await namesFor(emails);
  const myName = me?.name ?? identity?.name ?? null;

  const seen = new Set<string>();
  const people: string[] = [];
  const add = (value: string | undefined | null) => {
    const name = (value ?? "").trim();
    if (!name) return;
    // Case-insensitively, so one person cannot appear as two rows.
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    people.push(name);
  };

  for (const email of emails) add(named.get(email));
  // An agency admin is on every board without being a member of any, so they
  // would otherwise be missing from the list they are standing in front of.
  add(myName);

  people.sort((a, b) => a.localeCompare(b));

  return NextResponse.json({ people, me: myName });
}
