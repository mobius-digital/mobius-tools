import { getDb } from "./db";
import { nameFromEmail, normalizeEmail } from "./identity";

/**
 * What each person is called.
 *
 * A name belongs to the person, not to a board and not to a browser. It used
 * to live in localStorage, which meant the same person could sign two
 * different names into the changelog from a laptop and a phone, and a name
 * that came from Google could not be corrected at all. Both are fixed by
 * keying it on the email address instead.
 *
 * `confirmed_at` is the difference between a name we guessed and a name they
 * chose. Google's is a good guess and is used immediately; it just does not
 * count as confirmed until they have been shown it.
 */

export type Person = {
  email: string;
  name: string;
  /** False until they have been asked what they want to be called. */
  confirmed: boolean;
};

/** Trimmed, and bounded so a name cannot be used as a paragraph. */
export function cleanName(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, 40) : "";
}

export async function getPerson(email: string): Promise<Person | null> {
  const key = normalizeEmail(email);
  if (!key) return null;

  const row = await getDb()
    .prepare(`SELECT email, name, confirmed_at FROM people WHERE email = ?`)
    .bind(key)
    .first<{ email: string; name: string; confirmed_at: string | null }>();

  if (!row) return null;
  return { email: row.email, name: row.name, confirmed: row.confirmed_at !== null };
}

/**
 * Records a person we have just seen, without overwriting a name they chose.
 *
 * Called on every Google sign-in. The first time it seeds the row from
 * whatever Google says; after that it deliberately leaves the stored name
 * alone, because somebody who corrected their name here does not want it
 * quietly reverted the next time they sign in.
 */
export async function rememberPerson(email: string, suggestedName: string): Promise<void> {
  const key = normalizeEmail(email);
  if (!key) return;

  await getDb()
    .prepare(
      `INSERT INTO people (email, name, confirmed_at, updated_at)
       VALUES (?, ?, NULL, ?)
       ON CONFLICT(email) DO NOTHING`,
    )
    .bind(key, cleanName(suggestedName) || nameFromEmail(key), new Date().toISOString())
    .run();
}

/** The name a person chose. Marks it confirmed, so they stop being asked. */
export async function setPersonName(
  email: string,
  rawName: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const key = normalizeEmail(email);
  if (!key) return { ok: false, error: "No signed-in account to name." };

  const name = cleanName(rawName);
  if (!name) return { ok: false, error: "Enter a name so your edits are attributable." };

  const now = new Date().toISOString();
  await getDb()
    .prepare(
      `INSERT INTO people (email, name, confirmed_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         name = excluded.name,
         confirmed_at = COALESCE(people.confirmed_at, excluded.confirmed_at),
         updated_at = excluded.updated_at`,
    )
    .bind(key, name, now, now)
    .run();

  return { ok: true, name };
}

/**
 * Names for a set of addresses, for the people we know about.
 *
 * Anyone with no row falls back to a name worked out from their address,
 * which is a poor guess — "admin@…" becomes "Admin" — but better than showing
 * a raw address in a picker. They stop being a guess once they sign in.
 */
export async function namesFor(emails: string[]): Promise<Map<string, string>> {
  const keys = emails.map(normalizeEmail).filter((value): value is string => Boolean(value));
  const names = new Map<string, string>();
  if (keys.length === 0) return names;

  const placeholders = keys.map(() => "?").join(", ");
  const { results } = await getDb()
    .prepare(`SELECT email, name FROM people WHERE email IN (${placeholders})`)
    .bind(...keys)
    .all<{ email: string; name: string }>();

  for (const row of results ?? []) names.set(row.email, row.name);
  for (const key of keys) {
    if (!names.has(key)) names.set(key, nameFromEmail(key));
  }
  return names;
}
