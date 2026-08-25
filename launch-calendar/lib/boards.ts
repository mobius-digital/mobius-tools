/**
 * Links to an agency's other boards, so one person can hop between brands.
 *
 * Every brand still runs as its own deployment with its own database — that
 * separation is the point of the product. What this adds is purely a menu:
 * each board keeps a list of the others, and the brand name in the nav becomes
 * a switcher for whoever is allowed to see an entry.
 *
 * Visibility, not security: an entry can be limited to certain emails so a
 * client team never sees the agency's other brands in their nav. That check
 * runs against the Google-verified identity. It hides the menu; it does not
 * guard the other board, which has its own gate. Anyone who can open Settings
 * can see the configured list there — same one-level-of-access stance as the
 * rest of the app.
 *
 * Stored as JSON in `settings`, like channels and event types.
 */

import { getDb } from "./db";
import { cleanLabel, normaliseLink } from "./validation";
import {
  MAX_BOARDS,
  MAX_EMAILS,
  normaliseEmails,
  parseBoards,
  type BoardLink,
} from "./boardLinks";

export { visibleTo, parseBoards, normaliseEmails, MAX_BOARDS, MAX_EMAILS } from "./boardLinks";
export type { BoardLink } from "./boardLinks";

const SETTING_KEY = "boards";

export async function listBoards(): Promise<BoardLink[]> {
  const row = await getDb()
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .bind(SETTING_KEY)
    .first<{ value: string }>();

  return parseBoards(row?.value);
}

async function writeBoards(boards: BoardLink[]): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(SETTING_KEY, JSON.stringify(boards), new Date().toISOString())
    .run();
}

type Result = { ok: true; boards: BoardLink[] } | { ok: false; error: string };

export async function addBoard(
  rawLabel: unknown,
  rawUrl: unknown,
  rawEmails: unknown,
): Promise<Result> {
  const label = cleanLabel(rawLabel);
  if (!label) return { ok: false, error: "Name it in 2 to 40 characters." };

  const url = normaliseLink(rawUrl);
  if (url === null) return { ok: false, error: "Paste the board's address." };
  if (url === false) return { ok: false, error: "That does not look like a web address." };

  const emails = normaliseEmails(rawEmails);
  if (emails === false) {
    return {
      ok: false,
      error: `Emails only, separated by commas — up to ${MAX_EMAILS}.`,
    };
  }

  const boards = await listBoards();
  if (boards.length >= MAX_BOARDS) {
    return { ok: false, error: `That is the most boards this can hold (${MAX_BOARDS}).` };
  }
  if (boards.some((board) => board.url === url)) {
    return { ok: false, error: "That board is already on the list." };
  }

  const next = [...boards, { label, url, emails }];
  await writeBoards(next);
  return { ok: true, boards: next };
}

export async function removeBoard(rawUrl: unknown): Promise<Result> {
  const boards = await listBoards();
  const url = typeof rawUrl === "string" ? rawUrl : "";
  if (!boards.some((board) => board.url === url)) {
    return { ok: false, error: "That board is no longer on the list." };
  }

  const next = boards.filter((board) => board.url !== url);
  await writeBoards(next);
  return { ok: true, boards: next };
}
