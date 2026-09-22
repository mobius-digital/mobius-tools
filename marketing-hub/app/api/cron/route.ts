import { NextResponse } from "next/server";
import { flushOutbox, pruneSlackHistory, runReminders } from "@/lib/slackNotify";
import { getDb } from "@/lib/db";
import { buildProducer, producerChecks, viewerFor } from "@/lib/producer";

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

  // The Producer's night, once a day (after 07:00 UTC, the first tick that
  // finds it not yet done today): plain checks per brand, no model call.
  try {
    results.producer = await producerNight(now);
  } catch (error) {
    console.error("Producer night failed:", error);
    results.producerError = String(error);
  }

  return NextResponse.json({ ok: true, ...results });
}

async function producerNight(now: Date): Promise<unknown> {
  if (now.getUTCHours() < 7) return "not yet";
  const db = getDb();
  const today = now.toISOString().slice(0, 10);
  const done = await db.prepare(`SELECT value FROM settings WHERE brand_id = '*' AND key = 'producer_night'`).first<{ value: string }>();
  if (done?.value === today) return "done today";
  await db.prepare(`INSERT OR REPLACE INTO settings (brand_id, key, value, updated_at) VALUES ('*', 'producer_night', ?1, ?2)`).bind(today, now.toISOString()).run();
  const { results } = await db.prepare(`SELECT id, name FROM brands`).all<{ id: string; name: string }>();
  const out: Record<string, number> = {};
  for (const b of results ?? []) {
    const env = { DB: db };
    const { engine, h } = buildProducer(env, b.id, b.name, viewerFor(null, false));
    const found = await producerChecks(env, b.id);
    const fresh = await engine.recordFindings(env, found, h());
    out[b.id] = fresh.length;
  }
  return out;
}
