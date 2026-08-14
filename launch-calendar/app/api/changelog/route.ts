import { NextResponse } from "next/server";
import { listChangelog } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const entries = await listChangelog(
      Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 100,
    );
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load changelog.",
      },
      { status: 500 },
    );
  }
}
