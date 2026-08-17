import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  checkPassword,
  isPasswordConfigured,
  sessionToken,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const configured = await isPasswordConfigured();

  if (!configured) {
    return NextResponse.json(
      { error: "APP_PASSWORD is not set on the server." },
      { status: 503 },
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
      { error: "APP_PASSWORD is not set on the server." },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return response;
}
