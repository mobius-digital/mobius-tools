import { NextResponse } from "next/server";
import {
  addAllowedEmail,
  listAllowedEmails,
  normaliseEmail,
  removeAllowedEmail,
  signInConfig,
  updateSignInConfig,
} from "@/lib/signin";
import { ValidationError, validateEditorName } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Reading and changing how people sign in.
 *
 * Behind the gate like every other route, so only somebody already inside can
 * change who else gets in.
 */
export async function GET() {
  const [config, emails] = await Promise.all([signInConfig(), listAllowedEmails()]);
  return NextResponse.json({ ...config, emails });
}

export async function POST(request: Request) {
  let body: {
    action?: unknown;
    email?: unknown;
    editor?: unknown;
    mode?: unknown;
    googleClientId?: unknown;
    passwordFallback?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  try {
    const editor = validateEditorName(body.editor);

    if (body.action === "add-email" || body.action === "remove-email") {
      const email = normaliseEmail(body.email);
      if (!email) {
        return NextResponse.json(
          { error: "That does not look like an email address." },
          { status: 422 },
        );
      }

      if (body.action === "add-email") {
        await addAllowedEmail(email, editor);
      } else {
        const config = await signInConfig();
        const remaining = (await listAllowedEmails()).filter((e) => e !== email);

        // Emptying the list while Google sign-in is live would lock everyone out.
        if (config.mode === "google" && remaining.length === 0) {
          return NextResponse.json(
            { error: "That is the last address. Removing it would lock everybody out." },
            { status: 422 },
          );
        }
        await removeAllowedEmail(email);
      }
    } else {
      const result = await updateSignInConfig(body);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 422 });
      }
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
