import { NextResponse } from "next/server";
import { listChannels as listSlackChannels, postMessage } from "@/lib/slack";
import {
  mapChannel,
  rememberBoardUrl,
  setDayBefore,
  setEnabled,
  setReminderTiming,
  slackSettings,
  slackToken,
} from "@/lib/slackConfig";
import { buildTestMessage } from "@/lib/slackMessage";
import { flushOutbox, pendingCount } from "@/lib/slackNotify";
import { listChannels } from "@/lib/channelOptions";
import { ValidationError, validateEditorName } from "@/lib/validation";
import { viewerIsAdmin } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/**
 * Slack settings.
 *
 * Behind the sign-in gate like every other route, so only somebody already on
 * the board can point it at a Slack workspace.
 *
 * The response never contains the bot token — only the masked hint from
 * `slackSettings()`. There is no endpoint anywhere that returns the real one.
 *
 * Nor does it contain the workspace's channel list unless an agency admin is
 * asking. That list is the names of every channel Mobius has, and a board is
 * open to the client's own team — so browsing it was a way to read the
 * agency's org chart from inside a calendar. A board still shows where its own
 * notices land, because that is its own business; choosing from the full list
 * is Mobius's.
 */

/** Listing channels costs a Slack round trip, so it is asked for explicitly. */
async function payload(withChannels: boolean) {
  const [settings, marketingChannels, queue, admin] = await Promise.all([
    slackSettings(),
    listChannels(),
    pendingCount(),
    viewerIsAdmin(),
  ]);
  // `canChooseChannels` drives the screen; the guard is the `admin` check
  // below and on every write, not the flag.
  const base = { ...settings, marketingChannels, ...queue, canChooseChannels: admin };
  if (!withChannels || !settings.hasToken || !admin) {
    return { ...base, slackChannels: null };
  }

  const result = await listSlackChannels(await slackToken());
  return {
    ...base,
    slackChannels: result.ok ? result.channels : null,
    channelError: result.ok ? undefined : result.error,
  };
}

export async function GET(request: Request) {
  // Captured here because the cron has no real hostname of its own to link to.
  await rememberBoardUrl(request);

  const wantsChannels = new URL(request.url).searchParams.get("channels") === "1";
  return NextResponse.json(await payload(wantsChannels));
}

export async function POST(request: Request) {
  await rememberBoardUrl(request);

  let body: {
    action?: unknown;
    editor?: unknown;
    token?: unknown;
    enabled?: unknown;
    dayBefore?: unknown;
    channelKey?: unknown;
    slackId?: unknown;
    slackName?: unknown;
    reminderTime?: unknown;
    timezone?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  try {
    validateEditorName(body.editor);

    switch (body.action) {
      // The bot token is the agency's, shared by every board, and is set in
      // the Clients area. A board decides where its own notices land, not
      // which Slack account sends them.

      case "set-enabled": {
        const result = await setEnabled(body.enabled === true);
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
        break;
      }

      case "day-before":
        await setDayBefore(body.dayBefore === true);
        break;

      case "map": {
        if (!(await viewerIsAdmin())) {
          return NextResponse.json(
            { error: "Only Mobius can change where a board posts." },
            { status: 403 },
          );
        }
        const result = await mapChannel(body.channelKey, body.slackId, body.slackName);
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
        break;
      }

      case "timing": {
        const result = await setReminderTiming(body.reminderTime, body.timezone);
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
        break;
      }

      case "flush": {
        // "Send now": post everything waiting, window or not.
        const { posted } = await flushOutbox(new Date(), { force: true });
        return NextResponse.json({ ...(await payload(false)), flushed: posted });
      }

      case "test": {
        // Posting to an arbitrary channel id is a way to find out which ones
        // exist, so it is gated with the picker rather than beside it.
        if (!(await viewerIsAdmin())) {
          return NextResponse.json(
            { error: "Only Mobius can send a test message." },
            { status: 403 },
          );
        }
        const token = await slackToken();
        if (!token) {
          return NextResponse.json({ error: "Add a bot token first." }, { status: 422 });
        }
        if (typeof body.slackId !== "string" || !body.slackId) {
          return NextResponse.json({ error: "Pick a Slack channel first." }, { status: 422 });
        }

        const settings = await slackSettings();
        const result = await postMessage(
          token,
          body.slackId,
          buildTestMessage(settings.boardUrl),
        );
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

        return NextResponse.json({ ...(await payload(false)), sent: true });
      }

      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    return NextResponse.json(await payload(false));
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: error.message, fieldErrors: error.fieldErrors },
        { status: 422 },
      );
    }
    console.error("Slack settings failed:", error);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
