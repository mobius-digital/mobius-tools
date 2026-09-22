/**
 * Lineup: the Producer.
 *
 * The assistant inside the marketing calendar, on the Ask engine
 * (./ask/engine.js, this app's copy of the engine every Mobius assistant
 * runs). What is launching and when, what is stuck, who moved what, which
 * channel has work to do; it proposes a new launch, a new date, a stage, a
 * status or an edit, and nothing changes until someone taps Apply.
 *
 * Lineup is multi-tenant and client teams sign in to it, so this assistant is
 * built per brand and sees ONLY that brand: its SQL is scoped by shadowing
 * `events` and `changelog` with that brand's rows, every other table is
 * refused, and the only stored values it can read are that brand's own
 * non-secret settings. An agency admin additionally gets one cross-brand view.
 *
 * Writes go through lib/events.ts, the same functions the screens call, so
 * validation and the changelog work exactly as they do from the calendar.
 */

import { createAssistant, makeAppView, makeSecretKey, scopeSql } from "./ask/engine.js";
import { getDb } from "./db";
import {
  cancelEvent,
  createEvent,
  getEvent,
  listChangelog,
  listEvents,
  setEventStage,
  setEventStatus,
  shiftEvent,
  updateEvent,
  validateEventInput,
} from "./events";
import { listStages } from "./stages";
import { listChannels } from "./channelOptions";
import { listEventTypes } from "./eventTypes";
import { addDays, todayIso } from "./dates";
import { DEFAULT_STAGES, EVENT_STATUSES, type LaunchEvent, type StageOption } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Env = { DB: D1Database; ANTHROPIC_API_KEY?: string };
type Viewer = { editor: string; admin: boolean; owner: boolean };

const WHO = (brandName: string) => `
You are the Producer for ${brandName}, working inside Lineup, the marketing
calendar Mobius Digital runs for its brands. Lineup holds what a customer sees
on a date: launches, drops, promos, emails, and which channels (paid, email,
organic, SMS and so on) have work to do for each. You answer what is going
live and when, where each launch is in its prep, what is stuck, who changed
what, and which channel owes work; and you propose changes to the calendar.
`;

const SCHEMA = `
## Tables (this brand's rows only; nothing else is readable)

events     one row per launch or dated moment: id, name, type, status
           ('confirmed' | 'tentative' | 'at_risk' | 'completed' | 'cancelled'),
           stage (a key from the board's stage list; NULL = unsorted), brief,
           launch_date, promo_end_date, inventory_date, asset_deadline,
           teaser_start (all 'YYYY-MM-DD'), channels (JSON:
           {"<channel key>": {"involved": true|false, "priority": "primary" |
           "supporting" | "fyi" | null}}), owner, notes, assets_link,
           created_at, updated_at, updated_by
changelog  every change anyone made: event_id, event_name, change_summary,
           changed_by, created_at. Use it for "who moved", "what changed".
`;

const RULES = `
## Rules
- Dates are 'YYYY-MM-DD'. "This week", "next month" are relative to today.
- A launch that is cancelled or completed is not upcoming; leave it out unless asked.
- Stage and channel KEYS are stored; say their LABELS (the config view has both).
- When you name a launch, give its date and its stage.
`;

const PLAYBOOK = `
- A calendar is only useful if the dates are real. A launch inside a week still in an early stage is the first thing to say.
- Name the channel that owes work, not just the launch: "email has nothing for the Oct 3 drop".
- A launch moved three times is a planning problem, not a date problem; say so.
- An empty next month is a finding for the team, not a fact to report.
- Prefer proposing the change (a date, a stage, a status, a new launch) over describing it. A proposal costs nothing until someone taps Apply.
- Never invent a launch, a date or an owner. Ask for the one missing detail instead.
`.trim();

const VIEW_BLURBS: Record<string, string> = {
  upcoming: "every launch from a week ago to `days` ahead (default 60): date, name, type, stage, status, owner, the channels involved with their priority. Start here for \"what is coming up\".",
  board: "the Board: every open launch grouped by stage, in stage order, with counts. Use it for \"what is stuck\" or \"where is everything\".",
  launch: "one launch in full, found by name (pass `name` or `id`), with its change history.",
  changelog: "the latest changes on the calendar, newest first: who, what, when.",
  config: "the board's stage list, channel list and event types, with their keys and labels.",
  all_brands: "agency admins only: every brand's launches in the next `days` (default 60), counted per brand, and brands with nothing planned next month.",
  findings: "everything the nightly checks currently have open for this brand.",
};

/* ---- the calendar, read the way the screens read it ---- */

async function boardLists() {
  const [stages, channels, types] = await Promise.all([listStages(), listChannels(), listEventTypes()]);
  return { stages, channels, types };
}

function slim(e: LaunchEvent, stages: StageOption[], channels: { key: string; label: string }[]) {
  const stage = stages.find((s) => s.key === e.stage);
  const involved = Object.entries(e.channels || {})
    .filter(([, v]: any) => v?.involved)
    .map(([k, v]: any) => `${channels.find((c) => c.key === k)?.label ?? k}${v.priority ? ` (${v.priority})` : ""}`);
  return {
    id: e.id, name: e.name, type: e.type, status: e.status, stage: stage?.label ?? (e.stage || "unsorted"),
    launch_date: e.launch_date, teaser_start: e.teaser_start, promo_end_date: e.promo_end_date,
    asset_deadline: e.asset_deadline, inventory_date: e.inventory_date, owner: e.owner, channels: involved,
    brief: e.brief ? e.brief.slice(0, 300) : "", notes: e.notes ? e.notes.slice(0, 300) : null, assets_link: e.assets_link,
  };
}

async function findEvent(want: unknown): Promise<LaunchEvent | null> {
  const w = String(want ?? "").trim().toLowerCase();
  if (!w) return null;
  const byId = await getEvent(String(want));
  if (byId) return byId;
  const all = (await listEvents()).filter((e) => e.status !== "cancelled");
  const today = todayIso();
  const hits = all.filter((e) => e.name.toLowerCase().includes(w));
  if (!hits.length) return null;
  // the upcoming one of that name first, then the most recent
  return hits.find((e) => e.launch_date >= today) ?? hits[hits.length - 1];
}

function buildViews(brand: string, viewer: Viewer) {
  return {
    upcoming: async (_env: Env, a: any) => {
      const days = Math.min(365, Math.max(7, Number(a.days) || 60));
      const { stages, channels } = await boardLists();
      const today = todayIso(), from = addDays(today, -7), to = addDays(today, days);
      const list = (await listEvents()).filter((e) => e.launch_date >= from && e.launch_date <= to && e.status !== "cancelled");
      return { today, from, to, launches: list.map((e) => slim(e, stages, channels)), how_to_read: VIEW_BLURBS.upcoming };
    },
    board: async () => {
      const { stages, channels } = await boardLists();
      const open = (await listEvents()).filter((e) => !["cancelled", "completed"].includes(e.status));
      const cols = [...stages.map((s) => ({ key: s.key, label: s.label })), { key: "", label: "Unsorted" }].map((c) => {
        const items = open.filter((e) => (e.stage || "") === c.key);
        return { stage: c.label, count: items.length, launches: items.map((e) => ({ name: e.name, launch_date: e.launch_date, status: e.status, owner: e.owner })) };
      });
      return { columns: cols, how_to_read: VIEW_BLURBS.board + " Stages run left to right in the order listed." };
    },
    launch: async (_env: Env, a: any) => {
      const e = await findEvent(a.id || a.name || a.q);
      if (!e) return { error: "No launch matches that. Give its name or id." };
      const { stages, channels } = await boardLists();
      const history = (await listChangelog(200)).filter((c) => c.event_id === e.id).slice(0, 25);
      return { launch: slim(e, stages, channels), history, how_to_read: VIEW_BLURBS.launch };
    },
    changelog: async (_env: Env, a: any) => ({ changes: (await listChangelog(Math.min(100, Number(a.limit) || 40))), how_to_read: VIEW_BLURBS.changelog }),
    config: async () => ({ ...(await boardLists()), statuses: EVENT_STATUSES, how_to_read: VIEW_BLURBS.config }),
    all_brands: async (env: Env, a: any) => {
      if (!viewer.admin) return { error: "Only agency admins can see across brands." };
      const days = Math.min(365, Math.max(7, Number(a.days) || 60));
      const today = todayIso(), to = addDays(today, days);
      const next = nextMonth(today);
      const { results } = await env.DB.prepare(
        `SELECT b.id, b.name,
           SUM(CASE WHEN e.launch_date BETWEEN ?1 AND ?2 AND e.status NOT IN ('cancelled','completed') THEN 1 ELSE 0 END) AS upcoming,
           SUM(CASE WHEN substr(e.launch_date, 1, 7) = ?3 AND e.status != 'cancelled' THEN 1 ELSE 0 END) AS next_month
         FROM brands b LEFT JOIN events e ON e.brand_id = b.id GROUP BY b.id ORDER BY b.name`,
      ).bind(today, to, next).all();
      return { from: today, to, next_month: next, brands: results ?? [], how_to_read: VIEW_BLURBS.all_brands };
    },
  };
}

function nextMonth(today: string) {
  const d = new Date(`${today.slice(0, 7)}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 7);
}

/* ---- actions: each proposes; the tap runs the same lib/events.ts function ---- */

function resolveKey(list: { key: string; label: string }[], want: unknown): string | null {
  const w = String(want ?? "").trim().toLowerCase();
  if (!w) return null;
  return (list.find((x) => x.key.toLowerCase() === w) ?? list.find((x) => x.label.toLowerCase() === w) ?? list.find((x) => x.label.toLowerCase().includes(w)))?.key ?? null;
}

function buildActions(viewer: Viewer) {
  const channelSchema = { type: "array", items: { type: "object", properties: {
    channel: { type: "string", description: "Channel label or key." }, priority: { type: "string", enum: ["primary", "supporting", "fyi"] } }, required: ["channel"] } };
  const withChannels = async (current: Record<string, any>, list: any[] | undefined, remove: string[] | undefined) => {
    const { channels } = await boardLists();
    const out: Record<string, any> = { ...current };
    for (const c of list ?? []) {
      const key = resolveKey(channels, c.channel);
      if (!key) throw new Error(`No channel called "${c.channel}". The config view lists them.`);
      out[key] = { involved: true, priority: c.priority || out[key]?.priority || "supporting" };
    }
    for (const r of remove ?? []) {
      const key = resolveKey(channels, r);
      if (key) out[key] = { involved: false, priority: null };
    }
    return out;
  };
  const guard = (fn: any) => async (...args: any[]) => { try { return await fn(...args); } catch (e: any) {
    const fields = e?.fieldErrors ? Object.values(e.fieldErrors).join(" ") : "";
    return { error: fields || String(e?.message || e) }; } };

  return [
    { name: "add_launch",
      description: "Add a launch to the calendar: name, type, launch date, the channels involved with a priority each, and the owner. Optional: teaser start, promo end, asset deadline, inventory date, brief, notes, stage, status (default tentative). Ask for a missing required detail rather than inventing it.",
      input_schema: { type: "object", properties: {
        name: { type: "string" }, type: { type: "string", description: "Event type label or key (config view)." }, launch_date: { type: "string" },
        teaser_start: { type: "string" }, promo_end_date: { type: "string" }, asset_deadline: { type: "string" }, inventory_date: { type: "string" },
        channels: channelSchema, owner: { type: "string" }, brief: { type: "string" }, notes: { type: "string" },
        stage: { type: "string" }, status: { type: "string", enum: [...EVENT_STATUSES] }, summary: { type: "string" } },
        required: ["name", "type", "launch_date", "channels", "owner", "summary"] },
      propose: guard(async (_env: Env, i: any) => {
        const { stages, channels, types } = await boardLists();
        const type = resolveKey(types as any, i.type);
        if (!type) return { error: `No event type called "${i.type}". The config view lists them.` };
        const raw: any = { name: i.name, type, status: i.status || "tentative", stage: i.stage ? resolveKey(stages, i.stage) : null,
          brief: i.brief || "", launch_date: i.launch_date, promo_end_date: i.promo_end_date || null, inventory_date: i.inventory_date || null,
          asset_deadline: i.asset_deadline || null, teaser_start: i.teaser_start || null,
          channels: await withChannels(Object.fromEntries(channels.map((c) => [c.key, { involved: false, priority: null }])), i.channels, []),
          owner: i.owner, notes: i.notes || null, assets_link: null };
        validateEventInput(raw, types.map((t: any) => t.key), channels, stages);
        const ch = Object.entries(raw.channels).filter(([, v]: any) => v.involved).map(([k, v]: any) => `${channels.find((c) => c.key === k)?.label ?? k} (${v.priority})`);
        return { summary: i.summary, detail: `${raw.name} · ${raw.launch_date} · ${types.find((t: any) => t.key === type)?.label ?? type} · owner ${raw.owner}\nChannels: ${ch.join(", ")}${raw.teaser_start ? `\nTeaser from ${raw.teaser_start}` : ""}${raw.promo_end_date ? `, promo to ${raw.promo_end_date}` : ""}`, patch: raw };
      }),
      apply: guard(async (_env: Env, raw: any) => { const e = await createEvent(raw, viewer.editor); return { ok: true, note: `${e.name} is on the calendar.` }; }) },

    { name: "move_launch",
      description: "Move a launch to a new launch date. Its other dates (teaser, promo end, deadlines) move with it by the same number of days, exactly as dragging it on the calendar does.",
      input_schema: { type: "object", properties: { launch: { type: "string" }, to: { type: "string", description: "'YYYY-MM-DD' new launch date" }, summary: { type: "string" } }, required: ["launch", "to", "summary"] },
      propose: guard(async (_env: Env, i: any) => {
        const e = await findEvent(i.launch); if (!e) return { error: `No launch called "${i.launch}".` };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(i.to || "")) return { error: "to must be 'YYYY-MM-DD'." };
        const days = Math.round((Date.parse(`${i.to}T12:00:00Z`) - Date.parse(`${e.launch_date}T12:00:00Z`)) / 86400e3);
        if (!days) return { error: `${e.name} is already on ${i.to}.` };
        return { summary: i.summary, detail: `${e.name}: ${e.launch_date} → ${i.to} (${days > 0 ? "+" : ""}${days} days). Its other dates move with it.`, patch: { id: e.id, days } };
      }),
      apply: guard(async (_env: Env, p: any) => { const e = await shiftEvent(p.id, p.days, viewer.editor); return { ok: true, note: `${e.name} moved to ${e.launch_date}.` }; }) },

    { name: "set_stage",
      description: "Move a launch to another stage on the Board (by stage label or key).",
      input_schema: { type: "object", properties: { launch: { type: "string" }, stage: { type: "string" }, summary: { type: "string" } }, required: ["launch", "stage", "summary"] },
      propose: guard(async (_env: Env, i: any) => {
        const e = await findEvent(i.launch); if (!e) return { error: `No launch called "${i.launch}".` };
        const { stages } = await boardLists();
        const key = resolveKey(stages, i.stage); if (!key) return { error: `No stage called "${i.stage}". The config view lists them.` };
        return { summary: i.summary, detail: `${e.name} (${e.launch_date}): ${stages.find((s) => s.key === e.stage)?.label ?? "unsorted"} → ${stages.find((s) => s.key === key)?.label}.`, patch: { id: e.id, stage: key } };
      }),
      apply: guard(async (_env: Env, p: any) => { const e = await setEventStage(p.id, p.stage, viewer.editor); return { ok: true, note: `${e.name} moved on the Board.` }; }) },

    { name: "set_status",
      description: "Change a launch's status: confirmed, tentative, at_risk, completed.",
      input_schema: { type: "object", properties: { launch: { type: "string" }, status: { type: "string", enum: EVENT_STATUSES.filter((s) => s !== "cancelled") }, summary: { type: "string" } }, required: ["launch", "status", "summary"] },
      propose: guard(async (_env: Env, i: any) => {
        const e = await findEvent(i.launch); if (!e) return { error: `No launch called "${i.launch}".` };
        return { summary: i.summary, detail: `${e.name} (${e.launch_date}): ${e.status} → ${i.status}.`, patch: { id: e.id, status: i.status } };
      }),
      apply: guard(async (_env: Env, p: any) => { const e = await setEventStatus(p.id, p.status, viewer.editor); return { ok: true, note: `${e.name} is ${e.status}.` }; }) },

    { name: "edit_launch",
      description: "Edit a launch: rename it, rewrite the brief or notes, change the owner, the teaser/promo/deadline/inventory dates, the assets link, or add and remove channels. For the launch date itself use move_launch.",
      input_schema: { type: "object", properties: {
        launch: { type: "string" }, name: { type: "string" }, brief: { type: "string" }, notes: { type: "string" }, owner: { type: "string" }, assets_link: { type: "string" },
        teaser_start: { type: "string" }, promo_end_date: { type: "string" }, asset_deadline: { type: "string" }, inventory_date: { type: "string" },
        add_channels: channelSchema, remove_channels: { type: "array", items: { type: "string" } }, summary: { type: "string" } }, required: ["launch", "summary"] },
      propose: guard(async (_env: Env, i: any) => {
        const e = await findEvent(i.launch); if (!e) return { error: `No launch called "${i.launch}".` };
        const { stages, channels, types } = await boardLists();
        const raw: any = { ...e, channels: await withChannels(e.channels as any, i.add_channels, i.remove_channels) };
        const lines: string[] = [];
        for (const k of ["name", "brief", "notes", "owner", "assets_link", "teaser_start", "promo_end_date", "asset_deadline", "inventory_date"]) {
          if (i[k] !== undefined) { raw[k] = i[k] === "" ? null : i[k]; lines.push(`${k.replace(/_/g, " ")} → ${String(i[k]).slice(0, 80) || "cleared"}`); }
        }
        if (i.add_channels?.length) lines.push(`add ${i.add_channels.map((c: any) => c.channel).join(", ")}`);
        if (i.remove_channels?.length) lines.push(`remove ${i.remove_channels.join(", ")}`);
        if (!lines.length) return { error: "Nothing to change." };
        validateEventInput(raw, types.map((t: any) => t.key), channels, stages);
        return { summary: i.summary, detail: `${e.name} (${e.launch_date}): ${lines.join("; ")}.`, patch: { id: e.id, raw } };
      }),
      apply: guard(async (_env: Env, p: any) => { const e = await updateEvent(p.id, p.raw, viewer.editor); return { ok: true, note: `${e.name} updated.` }; }) },

    { name: "cancel_launch",
      description: "Cancel a launch (it stays on the calendar as cancelled, with its history; it can be reinstated by setting its status again). Never deletes.",
      input_schema: { type: "object", properties: { launch: { type: "string" }, summary: { type: "string" } }, required: ["launch", "summary"] },
      propose: guard(async (_env: Env, i: any) => {
        const e = await findEvent(i.launch); if (!e) return { error: `No launch called "${i.launch}".` };
        return { summary: i.summary, detail: `Cancel ${e.name} (${e.launch_date}). It stays in the history.`, patch: { id: e.id } };
      }),
      apply: guard(async (_env: Env, p: any) => { const e = await cancelEvent(p.id, viewer.editor); return { ok: true, note: `${e.name} cancelled.` }; }) },
  ];
}

/* ---- the nightly checks: plain SQL with the brand bound, no request needed ---- */

async function stageOrder(db: D1Database, brand: string): Promise<StageOption[]> {
  const row = await db.prepare(`SELECT value FROM settings WHERE brand_id = ?1 AND key = 'stages'`).bind(brand).first<{ value: string }>();
  try { const v = JSON.parse(row?.value || "[]"); return Array.isArray(v) && v.length ? v : DEFAULT_STAGES; } catch { return DEFAULT_STAGES; }
}

export async function producerChecks(env: Env, brand: string) {
  const db = env.DB, today = todayIso(), month = today.slice(0, 7), out: any[] = [];
  const stages = await stageOrder(db, brand);
  const early = new Set(stages.slice(0, Math.ceil(stages.length / 2)).map((s) => s.key));
  const { results: soon } = await db.prepare(`SELECT id, name, launch_date, stage, channels, status FROM events
      WHERE brand_id = ?1 AND launch_date BETWEEN ?2 AND ?3 AND status NOT IN ('cancelled','completed')`).bind(brand, today, addDays(today, 30)).all<any>();
  for (const e of soon ?? []) {
    /* 1. A launch inside a week still in an early stage (or unsorted). */
    if (e.launch_date <= addDays(today, 7) && (!e.stage || early.has(e.stage)))
      out.push({ key: `early:${e.id}:${e.launch_date}`, kind: "early-stage", severity: "high", amount: null, month,
        title: `${e.name} goes live ${e.launch_date} and is still ${stages.find((s) => s.key === e.stage)?.label ?? "unsorted"}`,
        detail: "Less than a week out. Either the work is further along than the Board says (move the stage), or the date is at risk (mark it at risk or move it).", evidence: { id: e.id } });
    /* 2. A launch with no channel involved. */
    let ch: any = {}; try { ch = JSON.parse(e.channels || "{}"); } catch { /* ignore */ }
    if (!Object.values(ch).some((v: any) => v?.involved))
      out.push({ key: `nochan:${e.id}`, kind: "no-channels", severity: "med", amount: null, month,
        title: `${e.name} (${e.launch_date}) has no channel doing anything for it`,
        detail: "No channel is marked involved, so nobody gets the reminders. Add the channels that should carry it.", evidence: { id: e.id } });
  }
  /* 3. Nothing planned next month (only for a board that is in use). */
  const next = nextMonth(today);
  const counts = await db.prepare(`SELECT COUNT(*) AS all_n, SUM(CASE WHEN substr(launch_date,1,7) = ?2 AND status != 'cancelled' THEN 1 ELSE 0 END) AS next_n FROM events WHERE brand_id = ?1`).bind(brand, next).first<any>();
  if ((counts?.all_n || 0) >= 3 && !counts?.next_n && Number(today.slice(8)) >= 10)
    out.push({ key: `empty:${next}`, kind: "empty-month", severity: "med", amount: null, month,
      title: `Nothing is planned for ${next}`, detail: "The calendar is empty for next month. Worth a planning conversation before the month starts.", evidence: {} });
  /* 4. A launch moved three or more times. */
  const { results: moved } = await db.prepare(`SELECT c.event_id, c.event_name, COUNT(*) AS n FROM changelog c JOIN events e ON e.id = c.event_id
      WHERE c.brand_id = ?1 AND e.brand_id = ?1 AND e.launch_date >= ?2 AND e.status NOT IN ('cancelled','completed')
        AND (c.change_summary LIKE '%aunch date%' OR c.change_summary LIKE '%oved%') GROUP BY c.event_id HAVING n >= 3`).bind(brand, today).all<any>();
  for (const m of moved ?? [])
    out.push({ key: `moved:${m.event_id}:${m.n}`, kind: "moved-often", severity: "low", amount: null, month,
      title: `${m.event_name} has been moved ${m.n} times`, detail: "Repeated moves are usually a planning problem, not a date problem. Worth finding out what keeps slipping.", evidence: { id: m.event_id } });
  return out;
}

/* ---- assembly, one per brand per request ---- */

const OWNER_EMAIL = "cole@go-mobius-digital.com";

export function buildProducer(env: Env, brand: string, brandName: string, viewer: Viewer) {
  const secretKey = makeSecretKey(["password_hash", "session_key", "google_client_id", "slack_token", "cron_secret"]);
  const getSetting = async (_e: Env, key: string) =>
    (await env.DB.prepare(`SELECT value FROM settings WHERE brand_id = ?1 AND key = ?2`).bind(brand, key).first<{ value: string }>())?.value ?? null;
  const putSetting = async (_e: Env, key: string, value: string) =>
    env.DB.prepare(`INSERT OR REPLACE INTO settings (brand_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4)`).bind(brand, key, String(value), new Date().toISOString()).run();
  const safeJson = (s: any, fb: any) => { if (s == null) return fb; if (typeof s === "object") return s; try { return JSON.parse(s); } catch { return fb; } };
  const views = buildViews(brand, viewer);
  const app = makeAppView({
    views, blurbs: VIEW_BLURBS, secretKey, getSetting, safeJson, fallbackTables: ["events", "changelog"],
    listStored: async () => ((await env.DB.prepare(`SELECT key, length(value) AS size, substr(value, 1, 120) AS peek FROM settings WHERE brand_id = ?1 ORDER BY key`).bind(brand).all<any>()).results ?? []),
    getStored: (_e: Env, key: string) => getSetting(env, key),
  });
  const h = () => ({
    getSetting, putSetting, safeJson, centralDate: () => todayIso(), monthOf: (x: string) => String(x).slice(0, 7),
    slack: async () => ({ ok: false }),
    appView: app.appView, appViews: app.appViews, viewBlurbs: app.viewBlurbs,
    readableTables: async () => ["events", "changelog"],
  });
  const engine = createAssistant({
    name: "Producer", app: "Lineup", memoryPrefix: "producer", owner: "Cole",
    repoPath: "marketing-hub/ (Next.js on Cloudflare via OpenNext: pages in app/b/[brand], logic in lib/, this assistant in lib/producer.ts)",
    who: WHO(brandName), schema: SCHEMA, rules: RULES, tables: ["events", "changelog"], sqlTool: "query_calendar",
    findingsTable: `producer_findings_${brand.replace(/[^a-z0-9]/g, "_")}`,
    forbidWords: /\b(settings|brands|memberships|people|slack_[a-z_]+|sqlite_[a-z_]+)\b/i,
    sqlWrap: (sql: string) => scopeSql(sql, {
      events: `SELECT * FROM main.events WHERE brand_id = '${brand}'`,
      changelog: `SELECT * FROM main.changelog WHERE brand_id = '${brand}'`,
    }),
    brief: `${brandName}'s marketing calendar. Each launch has a date, a stage on the Board, and the channels that carry it. The team plans here; the Board shows what each launch is waiting on.`,
    playbook: PLAYBOOK,
    checkKinds: ["early-stage", "no-channels", "empty-month", "moved-often"],
    checks: (e: Env) => producerChecks(e, brand),
    actions: buildActions(viewer),
  });
  return { engine, h, env };
}

export function viewerFor(identity: { email: string; name: string } | null, admin: boolean): Viewer {
  const who = identity?.name || identity?.email || "the team";
  return { editor: `${who} (via the Producer)`, admin, owner: String(identity?.email || "").toLowerCase() === OWNER_EMAIL };
}
