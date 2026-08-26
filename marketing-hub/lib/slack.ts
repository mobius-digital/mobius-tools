/**
 * The Slack Web API, as much of it as this app needs.
 *
 * A bot token rather than incoming webhooks. Webhooks are one URL per channel,
 * created by hand, and cannot be enumerated — so mapping four marketing
 * channels would mean pasting four URLs and returning to Slack every time the
 * mapping changed. One bot token gives a real channel picker instead, and the
 * Pulse app already carries the scopes this needs:
 *
 *   chat:write     — post the notifications
 *   channels:read  — list public channels for the picker
 *   groups:read    — list private ones the bot has been invited to
 *
 * Nothing here reads the database or the request context, so it can be pointed
 * at a token from anywhere.
 */

import { hub } from "@/hub.config";

export type SlackChannel = {
  id: string;
  name: string;
  /** Whether the bot is in the channel. It cannot post to one it is not in. */
  isMember: boolean;
  isPrivate: boolean;
};

export type SlackResult = { ok: true } | { ok: false; error: string };

/**
 * Slack errors worth repeating to a person, in their words rather than
 * Slack's. Anything not listed falls through as the raw code, which is more
 * use to somebody searching than a vague "something went wrong".
 */
const ERROR_TEXT: Record<string, string> = {
  invalid_auth: "Slack rejected that token. Copy it again from your Slack app's OAuth page.",
  account_inactive: "That token belongs to a Slack app that has been removed from the workspace.",
  token_revoked: "That token has been revoked. Reinstall the Slack app and copy the new one.",
  not_authed: "No Slack token is set yet.",
  channel_not_found: "That Slack channel no longer exists, or the bot cannot see it.",
  not_in_channel: "The bot is not in that channel yet — invite it with /invite @your-bot.",
  is_archived: "That Slack channel is archived.",
  missing_scope: "That token is missing a permission this needs. Check chat:write and channels:read.",
  ratelimited: "Slack is rate-limiting us. It will be retried.",
};

export function explainSlackError(code: string): string {
  return ERROR_TEXT[code] ?? `Slack said: ${code}`;
}

/**
 * Errors where retrying differently is pointless — the token is wrong, or the
 * channel is unreachable. Used to decide whether the identity-override retry
 * below is worth attempting.
 */
const FATAL = new Set([
  "invalid_auth",
  "account_inactive",
  "token_revoked",
  "not_authed",
  "channel_not_found",
  "not_in_channel",
  "is_archived",
]);

type SlackResponse = { ok: boolean; error?: string; [key: string]: unknown };

async function call(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<SlackResponse> {
  try {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });

    const json = (await response.json()) as SlackResponse;
    if (!json.ok) console.error(`Slack ${method} failed: ${json.error}`);
    return json;
  } catch (error) {
    console.error(`Slack ${method} threw:`, error);
    return { ok: false, error: "network_error" };
  }
}

/** Confirms a token works, and reports which workspace it belongs to. */
export async function authTest(
  token: string,
): Promise<{ ok: true; team: string; bot: string } | { ok: false; error: string }> {
  const json = await call(token, "auth.test", {});
  if (!json.ok) return { ok: false, error: explainSlackError(json.error ?? "unknown") };
  return {
    ok: true,
    team: String(json.team ?? "your workspace"),
    bot: String(json.user ?? "the bot"),
  };
}

/**
 * Every channel the bot can see, public and private.
 *
 * conversations.list ignores a JSON body — its parameters have to go in the
 * query string, or `types` silently falls back to public channels only and the
 * private ones never appear. Pulse learned this the hard way; the same note
 * lives in its worker.
 */
export async function listChannels(
  token: string,
): Promise<{ ok: true; channels: SlackChannel[] } | { ok: false; error: string }> {
  const channels: SlackChannel[] = [];
  let cursor = "";

  do {
    const query = new URLSearchParams({
      types: "public_channel,private_channel",
      exclude_archived: "true",
      limit: "200",
      ...(cursor ? { cursor } : {}),
    });

    let json: SlackResponse;
    try {
      const response = await fetch(`https://slack.com/api/conversations.list?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      json = (await response.json()) as SlackResponse;
    } catch (error) {
      console.error("Slack conversations.list threw:", error);
      return { ok: false, error: "Could not reach Slack." };
    }

    if (!json.ok) return { ok: false, error: explainSlackError(json.error ?? "unknown") };

    for (const channel of (json.channels ?? []) as Record<string, unknown>[]) {
      channels.push({
        id: String(channel.id),
        name: String(channel.name),
        isMember: channel.is_member === true,
        isPrivate: channel.is_private === true,
      });
    }

    cursor = String(
      (json.response_metadata as { next_cursor?: string } | undefined)?.next_cursor ?? "",
    );
  } while (cursor);

  // Channels the bot is already in first — those are the ones that will work.
  channels.sort(
    (a, b) => Number(b.isMember) - Number(a.isMember) || a.name.localeCompare(b.name),
  );

  return { ok: true, channels };
}

/** How the app would like to appear, when the token is allowed to say so. */
const IDENTITY = { username: hub.name, icon_emoji: ":rocket:" };

/**
 * Posts one message.
 *
 * The bot token is shared with Pulse, so without help the post would arrive
 * under Pulse's name. `username`/`icon_emoji` fix that, but they need the
 * chat:write.customize scope — which the Pulse app does not have and which
 * cannot be added without reinstalling it. So this asks to be called Launch
 * Calendar, and on any non-fatal refusal quietly posts again as itself. The
 * message always lands; it just wears Pulse's name until somebody adds the
 * scope, at which point this starts working with no code change.
 */
export async function postMessage(
  token: string,
  channelId: string,
  message: { text: string; attachments?: unknown[]; blocks?: unknown[] },
): Promise<SlackResult> {
  // With attachments, a top-level `text` is rendered as the message body *and*
  // the card underneath repeats it — the first real post arrived doubled. The
  // attachment's `fallback` drives the notification preview without being
  // drawn, so the preview text goes there and the top level stays empty.
  const payload =
    message.attachments && message.attachments.length > 0
      ? {
          channel: channelId,
          attachments: message.attachments.map((attachment, index) =>
            index === 0
              ? { fallback: message.text, ...(attachment as Record<string, unknown>) }
              : attachment,
          ),
        }
      : { channel: channelId, ...message };

  const first = await call(token, "chat.postMessage", { ...payload, ...IDENTITY });
  if (first.ok) return { ok: true };

  const code = first.error ?? "unknown";
  if (FATAL.has(code)) return { ok: false, error: explainSlackError(code) };

  const second = await call(token, "chat.postMessage", payload);
  if (second.ok) return { ok: true };

  return { ok: false, error: explainSlackError(second.error ?? code) };
}
