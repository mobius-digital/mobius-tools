import { NextResponse } from "next/server";
import { flushOutbox, pruneSlackHistory, runReminders } from "@/lib/slackNotify";

export const dynamic = "force-dynamic";

/**
 * The scheduled tick.
 *
 * Reached only from `worker-entry.js`, which wraps the OpenNext worker to add a
 * `scheduled` handler and then calls back into the app through a synthetic
 * request. Going in the front door like this is what gives the cron a normal
 * Next request context, so `getCloudflareContext()` and every lib below it work
 * unchanged — a `scheduled` handler that talked to D1 directly would need its
 * own parallel copy of all of them.
 *
 * That does mean the route is on the public internet. It is excluded from the
 * sign-in middleware (a cron cannot present a session cookie), so the guard is
 * the nonce below: the wrapper mints a fresh random value per tick, keeps it on
 * `globalThis` where only code inside this isolate can read it, and clears it
 * as soon as the request returns. An outside caller has nothing to present.
 */

const HEADER = "x-lc-cron";

export async function POST(request: Request) {
  const expected = (globalThis as { __lcCronNonce?: string }).__lcCronNonce;
  const presented = request.headers.get(HEADER);

  if (!expected || !presented || presented !== expected) {
    return NextResponse.json({ error: "Not found." }, { status: 403 });
  }

  const now = new Date();

  // Each step is isolated: a Slack outage during the flush must not cost the
  // board its reminders, and neither must stop the housekeeping.
  const results: Record<string, unknown> = {};

  try {
    results.flushed = (await flushOutbox(now)).posted;
  } catch (error) {
    console.error("Slack flush failed:", error);
    results.flushError = String(error);
  }

  try {
    results.reminders = (await runReminders(now)).posted;
  } catch (error) {
    console.error("Slack reminders failed:", error);
    results.reminderError = String(error);
  }

  try {
    await pruneSlackHistory(now);
  } catch (error) {
    console.error("Slack prune failed:", error);
  }

  return NextResponse.json({ ok: true, ...results });
}
