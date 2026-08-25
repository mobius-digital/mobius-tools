import { NextResponse } from "next/server";
import { SESSION_MAX_AGE, changePassword, sessionCookieName } from "@/lib/auth";
import { currentBrandId } from "@/lib/brandContext";
import { recordPasswordChange } from "@/lib/events";
import { ValidationError, validateEditorName } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Changes the shared team password.
 *
 * Requires the current password, so simply being signed in is not enough — an
 * unattended laptop should not be able to lock the rest of the team out.
 */
export async function POST(request: Request) {
  let body: { current?: unknown; next?: unknown; editor?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  try {
    const editor = validateEditorName(body.editor);
    const current = typeof body.current === "string" ? body.current : "";
    const next = typeof body.next === "string" ? body.next : "";

    const result = await changePassword(current, next);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    // Worth a line in the history: everyone else is about to be signed out.
    await recordPasswordChange(editor);

    // Re-issue this person's cookie so they are not logged out by their own change.
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookieName(await currentBrandId()), result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: error.message, fieldErrors: error.fieldErrors },
        { status: 422 },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not change the password.",
      },
      { status: 500 },
    );
  }
}
