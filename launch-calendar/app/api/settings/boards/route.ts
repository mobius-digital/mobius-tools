import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { addBoard, listBoards, removeBoard, visibleTo } from "@/lib/boards";
import { IDENTITY_COOKIE, readIdentityToken } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The agency's other boards.
 *
 * `boards` is the full configured list, for the Settings dialog. `visible` is
 * what the caller's own nav should offer — filtered server-side against their
 * Google-verified email, so a restricted entry never even reaches a client
 * team's browser.
 */
export async function GET() {
  const identity = await readIdentityToken(
    (await cookies()).get(IDENTITY_COOKIE)?.value,
  );

  const boards = await listBoards();
  return NextResponse.json({
    boards,
    visible: visibleTo(boards, identity?.email ?? null).map(({ label, url }) => ({
      label,
      url,
    })),
  });
}

export async function POST(request: Request) {
  let body: { action?: unknown; label?: unknown; url?: unknown; emails?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  try {
    const result =
      body.action === "add"
        ? await addBoard(body.label, body.url, body.emails)
        : body.action === "remove"
          ? await removeBoard(body.url)
          : null;

    if (!result) {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json({ boards: result.boards });
  } catch (error) {
    console.error("Board list change failed:", error);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
