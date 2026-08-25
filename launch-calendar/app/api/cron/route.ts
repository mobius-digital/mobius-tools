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
const KEY_HEADER = "x-cron-key";

/**
 * A sibling board's tick is the second accepted caller: Cloudflare's free plan
 * caps scheduled triggers per account, so a fleet of boards shares one — the
 * board that has it fans out to the others (see worker-entry.js), presenting
 * the shared `CRON_SECRET`. A board with no secret set accepts only its own
 * wrapper's nonce, exactly as before.
 */
function keyAccepted(presented: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !presented || presented.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) {
    diff |= secret.charCodeAt(i) ^ presented.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: Request) {
  const expected = (globalThis as { __lcCronNonce?: string }).__lcCronNonce;
  const presented = request.headers.get(HEADER);
  const nonceOk = Boolean(expected && presented && presented === expected);

  if (!nonceOk && !keyAccepted(request.headers.get(KEY_HEADER))) {
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
