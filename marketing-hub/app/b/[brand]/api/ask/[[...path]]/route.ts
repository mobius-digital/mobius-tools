import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";
import { currentBrandId, loadBrand, isAdmin } from "@/lib/brandContext";
import { IDENTITY_COOKIE, readIdentityToken } from "@/lib/session";
import { buildProducer, viewerFor } from "@/lib/producer";

export const dynamic = "force-dynamic";

/**
 * The Producer's door, one route for all of it:
 *   POST /b/<brand>/api/ask            a question (the chat)
 *   POST /b/<brand>/api/ask/apply      the Apply / No thanks tap on a proposal
 *   GET  /b/<brand>/api/ask/findings   what the checks found, its memory, its brief and playbook
 *   GET  /b/<brand>/api/ask/reports    the reports it has built
 *   POST /b/<brand>/api/ask/finding    Done / Not now / Wrong on a finding
 *   POST /b/<brand>/api/ask/forget     forget a note, stop a watch
 *   PUT  /b/<brand>/api/ask/brief      what it knows about the brand
 *   PUT  /b/<brand>/api/ask/playbook   how it thinks
 *   POST /b/<brand>/api/ask/run        run the checks now
 *
 * The middleware has already decided this caller may open this brand, and
 * stamped the brand on the request; nothing here takes a brand from the body.
 */

type Ctx = { params: Promise<{ brand: string; path?: string[] }> };

async function producer() {
  const brand = await currentBrandId();
  const row = await loadBrand(brand);
  const identity = await readIdentityToken((await cookies()).get(IDENTITY_COOKIE)?.value);
  const admin = identity ? await isAdmin(identity.email) : false;
  const { env } = getCloudflareContext();
  const e = { DB: getDb(), ANTHROPIC_API_KEY: (env as { ANTHROPIC_API_KEY?: string }).ANTHROPIC_API_KEY };
  const viewer = viewerFor(identity, admin);
  return { ...buildProducer(e, brand, row?.name ?? brand, viewer), viewer };
}

const fail = (error: unknown, status = 500) =>
  NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const sub = ((await ctx.params).path ?? []).join("/");
    const { engine, h, env } = await producer();
    if (sub === "findings") {
      const hh = h();
      return NextResponse.json({
        findings: await engine.openFindings(env, hh),
        memory: await engine.memory(env, hh),
        brief: await engine.getBrief(env, hh),
        playbook: await engine.getPlaybook(env, hh),
        briefing: hh.safeJson(await hh.getSetting(env, engine.keys.lastBriefing), null),
      });
    }
    if (sub === "reports") return NextResponse.json({ reports: await engine.reportsList(env, h()) });
    return fail("Not found.", 404);
  } catch (error) { return fail(error); }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const sub = ((await ctx.params).path ?? []).join("/");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { engine, h, env, viewer } = await producer();
    const hh = h();
    if (sub === "") {
      const findings = await engine.openFindings(env, hh).catch(() => []);
      const r = await engine.answerWeb(env, body.question, body.history, hh, { findings: findings.slice(0, 6), screen: body.screen ?? null });
      return NextResponse.json({ ...r, isOwner: viewer.owner });
    }
    if (sub === "apply") return NextResponse.json(await engine.applyProposal(env, String(body.id ?? ""), hh, { cancel: Boolean(body.cancel) }));
    if (sub === "finding") {
      if (!body.key) return fail("key required", 400);
      return NextResponse.json(await engine.setFindingState(env, String(body.key), String(body.state ?? "done")));
    }
    if (sub === "forget") {
      const key = body.kind === "watch" ? engine.keys.watches : engine.keys.notes;
      const list = (hh.safeJson(await hh.getSetting(env, key), []) || []) as { id?: string }[];
      const kept = body.kind === "watch" ? list.map((w) => (w.id === body.id ? { ...w, active: false } : w)) : list.filter((_n, i) => i !== Number(body.index));
      await hh.putSetting(env, key, JSON.stringify(kept));
      return NextResponse.json({ ok: true });
    }
    if (sub === "run") {
      const found = await (await import("@/lib/producer")).producerChecks(env, await currentBrandId());
      const fresh = await engine.recordFindings(env, found, hh);
      return NextResponse.json({ found: found.length, fresh: fresh.length });
    }
    if (sub === "briefing") return NextResponse.json({ text: await engine.briefing(env, hh, { force: true }) });
    return fail("Not found.", 404);
  } catch (error) { return fail(error); }
}

export async function PUT(request: Request, ctx: Ctx) {
  try {
    const sub = ((await ctx.params).path ?? []).join("/");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { engine, h, env } = await producer();
    const hh = h();
    if (sub === "brief") { await hh.putSetting(env, engine.keys.brief, String(body.text ?? "").slice(0, 4000)); return NextResponse.json({ ok: true }); }
    if (sub === "playbook") { await hh.putSetting(env, engine.keys.playbook, String(body.text ?? "").slice(0, 8000)); return NextResponse.json({ ok: true }); }
    return fail("Not found.", 404);
  } catch (error) { return fail(error); }
}
