import { NextResponse } from "next/server";
import {
  addEventType,
  listEventTypes,
  removeEventType,
  renameEventType,
  typeUsage,
} from "@/lib/eventTypes";
import { ValidationError, validateEditorName } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** The board's event types, and how many events use each. */
export async function GET() {
  const [types, usage] = await Promise.all([listEventTypes(), typeUsage()]);
  return NextResponse.json({ types, usage });
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
        ? await addEventType(body.label)
        : body.action === "rename"
          ? await renameEventType(body.key, body.label)
          : body.action === "remove"
            ? await removeEventType(body.key)
            : null;

    if (!result) {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json({ types: result.types, usage: await typeUsage() });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: error.message, fieldErrors: error.fieldErrors },
        { status: 422 },
      );
    }
    console.error("Event type change failed:", error);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
