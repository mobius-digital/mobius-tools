import { NextResponse } from "next/server";
import {
  addAllowedEmail,
  listAllowedEmails,
  normaliseEmail,
  removeAllowedEmail,
  signInConfig,
} from "@/lib/signin";
import { ValidationError, validateEditorName } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Who can open this brand's board with Google.
 *
 * Behind the gate like every other route, so only somebody already inside can
 * change who else gets in. The Google client ID itself is the hub's, set once
 * by the agency — brands only manage their member list here. Agency admins
 * are members of everything and are not listed per brand.
 */
export async function GET() {
  const [config, emails] = await Promise.all([signInConfig(), listAllowedEmails()]);
  return NextResponse.json({ ...config, emails });
}

export async function POST(request: Request) {
  let body: { action?: unknown; email?: unknown; editor?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  try {
    validateEditorName(body.editor);

    const email = normaliseEmail(body.email);
    if (!email) {
      return NextResponse.json(
        { error: "That does not look like an email address." },
        { status: 422 },
      );
    }

    if (body.action === "add-email") {
      await addAllowedEmail(email);
    } else if (body.action === "remove-email") {
      const result = await removeAllowedEmail(email);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 422 });
      }
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    const [config, emails] = await Promise.all([signInConfig(), listAllowedEmails()]);
    return NextResponse.json({ ...config, emails });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: error.message, fieldErrors: error.fieldErrors },
        { status: 422 },
      );
    }
    console.error("Sign-in settings failed:", error);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
