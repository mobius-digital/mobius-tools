/**
 * Pure helpers for email addresses and the names shown beside an edit.
 *
 * Kept free of imports so it stays cheap to test on its own.
 */

/** Rejects anything that is obviously not an address before it reaches the list. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 200) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/**
 * "cole.wetzl@example.com" -> "Cole Wetzl".
 *
 * A fallback for the rare Google account with no name set on it.
 */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || email
  );
}
