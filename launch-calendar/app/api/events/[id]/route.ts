import { NextResponse } from "next/server";
import {
  NotFoundError,
  ValidationError,
  cancelEvent,
  deleteEvent,
  setEventStatus,
  updateEvent,
  validateEditorName,
} from "@/lib/events";

export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

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
  let body: {
    event?: unknown;
    editor?: unknown;
    intent?: unknown;
    status?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  try {
    const editor = validateEditorName(body.editor);

    // Three shapes: a full form save, a one-click status change, and cancel
    // (which is just a status change with its own wording in the changelog).
    let event;
    if (body.intent === "cancel") {
      event = await cancelEvent(params.id, editor);
    } else if (body.intent === "status") {
      event = await setEventStatus(params.id, body.status, editor);
    } else {
      event = await updateEvent(params.id, body.event, editor);
    }

    return NextResponse.json({ event });
  } catch (error) {
    return failure(error, "Could not save event.");
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const url = new URL(request.url);
    const editor = validateEditorName(url.searchParams.get("editor"));
    await deleteEvent(params.id, editor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error, "Could not delete event.");
  }
}
