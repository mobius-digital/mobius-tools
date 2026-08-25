import { NextResponse } from "next/server";
import {
  ValidationError,
  createEvent,
  listEvents,
  validateEditorName,
} from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ events: await listEvents() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load events." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: { event?: unknown; editor?: unknown };

  try {
    body = (await request.json()) as { event?: unknown; editor?: unknown };
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  try {
    const editor = validateEditorName(body.editor);
    const event = await createEvent(body.event, editor);
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: error.message, fieldErrors: error.fieldErrors },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create event." },
      { status: 500 },
    );
  }
}
