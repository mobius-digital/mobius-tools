import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { PLATFORM } from "@/lib/brandContext";
import { googleClientId, setGoogleClientId } from "@/lib/signin";
import { maskToken, platformSlackToken, setPlatformSlackToken } from "@/lib/slackConfig";
import { authTest } from "@/lib/slack";

export const dynamic = "force-dynamic";

/**
 * The connections every brand shares: the Google app people sign in through,
 * and the Slack app that posts their notices. Both belong to the agency, so
 * both live here rather than in a client's own settings — the middleware only
 * lets admins this far.
 *
 * Neither secret is ever returned. The Slack token comes back masked, enough
 * to recognise which one is in place and never enough to use.
 */
async function state() {
  const [clientId, token] = await Promise.all([googleClientId(), platformSlackToken()]);
  return {
    googleClientId: clientId,
    slackTokenHint: maskToken(token),
    slackConnected: Boolean(token),
  };
}

export async function GET() {
  return NextResponse.json(await state());
}

export async function POST(request: Request) {
  let body: { action?: unknown; googleClientId?: unknown; token?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  try {
    if (body.action === "google-client-id") {
      const value = String(body.googleClientId ?? "").trim();
      if (value && !value.endsWith(".apps.googleusercontent.com")) {
        return NextResponse.json(
          {
            error:
              "That does not look like a Google client ID — it should end in .apps.googleusercontent.com",
          },
          { status: 422 },
        );
      }
      await setGoogleClientId(value);
      return NextResponse.json(await state());
    }

    if (body.action === "slack-token") {
      const value = String(body.token ?? "").trim();

      if (!value) {
        await setPlatformSlackToken("");
        return NextResponse.json({ ...(await state()), note: "Slack disconnected." });
      }

      if (!value.startsWith("xoxb-")) {
        return NextResponse.json(
          { error: "That is not a bot token — a bot token starts with xoxb-." },
          { status: 422 },
        );
      }

      // Prove it works now, rather than letting the first real notification be
      // the thing that discovers it does not.
      const check = await authTest(value);
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 422 });

      await setPlatformSlackToken(value);
      return NextResponse.json({
        ...(await state()),
        note: `Connected to ${check.team} as ${check.bot}.`,
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("Connection settings failed:", error);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
