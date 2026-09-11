import { NextResponse } from "next/server";
import {
  NotFoundError,
  ValidationError,
  cancelEvent,
  deleteEvent,
  setEventStage,
  setEventStatus,
  shiftEvent,
  updateEvent,
  validateEditorName,
} from "@/lib/events";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

function failure(error: unknown, fallback: string) {
  if (error instanceof ValidationError) {
    return NextResponse.json(
      { error: error.message, fieldErrors: error.fieldErrors },
      { status: 422 },
    );
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  let body: {
    event?: unknown;
    editor?: unknown;
    intent?: unknown;
    status?: unknown;
    stage?: unknown;
    days?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  try {
    const editor = validateEditorName(body.editor);

    // Five shapes: a full form save, a one-click status change, a stage
    // change from the Board, a drag on the calendar (every date shifts by
    // the same number of days), and cancel (a status change with its own
    // wording in the changelog).
    let event;
    if (body.intent === "cancel") {
      event = await cancelEvent(id, editor);
    } else if (body.intent === "status") {
      event = await setEventStatus(id, body.status, editor);
    } else if (body.intent === "stage") {
      event = await setEventStage(id, body.stage, editor);
    } else if (body.intent === "shift") {
      event = await shiftEvent(id, body.days, editor);
    } else {
      event = await updateEvent(id, body.event, editor);
    }

    return NextResponse.json({ event });
  } catch (error) {
    return failure(error, "Could not save event.");
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  try {
    const url = new URL(request.url);
    const editor = validateEditorName(url.searchParams.get("editor"));
    await deleteEvent(id, editor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error, "Could not delete event.");
  }
}
