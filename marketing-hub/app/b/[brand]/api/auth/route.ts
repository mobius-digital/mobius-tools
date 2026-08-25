import { NextResponse } from "next/server";
import { currentBrandId } from "@/lib/brandContext";
import {
  SESSION_MAX_AGE,
  checkPassword,
  isPasswordConfigured,
  sessionCookieName,
  sessionToken,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const configured = await isPasswordConfigured();

  if (!configured) {
    return NextResponse.json(
      { error: "This board has no team password — sign in with Google instead." },
      { status: 403 },
    );
  }

  let submitted = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    submitted = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (!(await checkPassword(submitted))) {
    return NextResponse.json(
      { error: "That password is not right." },
      { status: 401 },
    );
  }

  const token = await sessionToken();
  if (!token) {
    return NextResponse.json(
      { error: "This board has no team password — sign in with Google instead." },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName(await currentBrandId()), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return response;
}
