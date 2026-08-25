import { NextResponse } from "next/server";
import { authTest, listChannels as listSlackChannels, postMessage } from "@/lib/slack";
import {
  mapChannel,
  rememberBoardUrl,
  setDayBefore,
  setEnabled,
  setReminderTiming,
  setToken,
  slackSettings,
  slackToken,
} from "@/lib/slackConfig";
import { buildTestMessage } from "@/lib/slackMessage";
import { flushOutbox, pendingCount } from "@/lib/slackNotify";
import { listChannels } from "@/lib/channelOptions";
import { ValidationError, validateEditorName } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Slack settings.
 *
 * Behind the sign-in gate like every other route, so only somebody already on
 * the board can point it at a Slack workspace.
 *
 * The response never contains the bot token — only the masked hint from
 * `slackSettings()`. There is no endpoint anywhere that returns the real one.
 */

/** Listing channels costs a Slack round trip, so it is asked for explicitly. */
async function payload(withChannels: boolean) {
  const [settings, marketingChannels, queue] = await Promise.all([
    slackSettings(),
    listChannels(),
    pendingCount(),
  ]);
  const base = { ...settings, marketingChannels, ...queue };
  if (!withChannels || !settings.hasToken) return { ...base, slackChannels: null };

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
      case "set-token": {
        const result = await setToken(body.token);
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

        // Confirm the token works now rather than letting the first real
        // notification be the thing that discovers it does not.
        const token = await slackToken();
        if (token) {
          const check = await authTest(token);
          if (!check.ok) {
            await setToken("");
            return NextResponse.json({ error: check.error }, { status: 422 });
          }
          return NextResponse.json({
            ...(await payload(true)),
            connected: `Connected to ${check.team} as ${check.bot}.`,
          });
        }
        break;
      }

      case "set-enabled": {
        const result = await setEnabled(body.enabled === true);
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
        break;
      }

      case "day-before":
        await setDayBefore(body.dayBefore === true);
        break;

      case "map": {
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
