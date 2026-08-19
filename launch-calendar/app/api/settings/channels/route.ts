import { NextResponse } from "next/server";
import {
  addChannel,
  listChannels,
  removeChannel,
  renameChannel,
  channelUsage,
} from "@/lib/channelOptions";
import { ValidationError, validateEditorName } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** The board's marketing channels, and how many events involve each. */
export async function GET() {
  const [channels, usage] = await Promise.all([listChannels(), channelUsage()]);
  return NextResponse.json({ channels, usage });
}

export async function POST(request: Request) {
  let body: { action?: unknown; key?: unknown; label?: unknown; editor?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  try {
    validateEditorName(body.editor);

    const result =
      body.action === "add"
        ? await addChannel(body.label)
        : body.action === "rename"
          ? await renameChannel(body.key, body.label)
          : body.action === "remove"
            ? await removeChannel(body.key)
            : null;

    if (!result) {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json({ channels: result.channels, usage: await channelUsage() });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: error.message, fieldErrors: error.fieldErrors },
        { status: 422 },
      );
    }
    console.error("Channel change failed:", error);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
