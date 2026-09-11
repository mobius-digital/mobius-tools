import { NextResponse } from "next/server";
import {
  addStage,
  listStages,
  moveStage,
  recolorStage,
  removeStage,
  renameStage,
  stageUsage,
} from "@/lib/stages";
import { ValidationError, validateEditorName } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** The board's stages, in Board-column order, and how many live events sit in each. */
export async function GET() {
  const [stages, usage] = await Promise.all([listStages(), stageUsage()]);
  return NextResponse.json({ stages, usage });
}

export async function POST(request: Request) {
  let body: {
    action?: unknown;
    key?: unknown;
    label?: unknown;
    color?: unknown;
    direction?: unknown;
    editor?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  try {
    validateEditorName(body.editor);

    const result =
      body.action === "add"
        ? await addStage(body.label, body.color)
        : body.action === "rename"
          ? await renameStage(body.key, body.label)
          : body.action === "recolor"
            ? await recolorStage(body.key, body.color)
            : body.action === "move"
              ? await moveStage(body.key, body.direction)
              : body.action === "remove"
                ? await removeStage(body.key)
                : null;

    if (!result) {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json({ stages: result.stages, usage: await stageUsage() });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: error.message, fieldErrors: error.fieldErrors },
        { status: 422 },
      );
    }
    console.error("Stage change failed:", error);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
