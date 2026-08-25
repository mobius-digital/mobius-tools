/**
 * The board-link shapes and rules, database-free so they can be unit-tested.
 * Reading and writing the stored list lives in `lib/boards.ts`.
 */

export type BoardLink = {
  label: string;
  url: string;
  /** Lowercased. Empty means everyone on this board sees the entry. */
  emails: string[];
};

/** An agency with more brands than this needs a different product. */
export const MAX_BOARDS = 12;

/** Per entry — the people who hop between brands, not the whole roster. */
export const MAX_EMAILS = 20;

function isBoard(value: unknown): value is BoardLink {
  const board = value as BoardLink;
  return (
    Boolean(board) &&
    typeof board.label === "string" &&
    board.label.length > 0 &&
    typeof board.url === "string" &&
    board.url.length > 0 &&
    Array.isArray(board.emails) &&
    board.emails.every((email) => typeof email === "string")
  );
}

export function parseBoards(raw: string | null | undefined): BoardLink[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isBoard) : [];
  } catch {
    return [];
  }
}

/**
 * The entries a given person's nav should offer.
 *
 * `email` is the Google-verified address, or null under the shared password —
 * where nobody has a proven identity, so only unrestricted entries show.
 */
export function visibleTo(boards: BoardLink[], email: string | null): BoardLink[] {
  const mine = email?.trim().toLowerCase() ?? null;
  return boards.filter(
    (board) => board.emails.length === 0 || (mine !== null && board.emails.includes(mine)),
  );
}

/**
 * A pasted email list — commas, spaces, newlines — as stored addresses.
 * False means something in it does not look like an email at all.
 */
export function normaliseEmails(raw: unknown): string[] | false {
  if (raw == null) return [];
  const text = typeof raw === "string" ? raw : "";
  const parts = text
    .split(/[\s,;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  const unique = [...new Set(parts)];
  if (unique.length > MAX_EMAILS) return false;
  if (unique.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return false;
  return unique;
}
