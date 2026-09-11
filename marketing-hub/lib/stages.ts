/**
 * Stages, editable per board.
 *
 * A stage is where a launch is in its preparation: briefed, waiting on assets,
 * built, scheduled. The list is the board's own (a golf brand wants "Waiting
 * on photo shoot", an agency wants "With client") so, like event types, each
 * stage is a stable key stored on events plus a label that may change. Unlike
 * event types a stage also carries a color, because the whole point is to be
 * read at a glance: the calendar chips and the Board columns are painted with
 * it.
 *
 * Stored as JSON in `settings` so the list travels with the board.
 */

import { getDb } from "./db";
import { currentBrandId } from "./brandContext";
import { DEFAULT_STAGES, isStageColor, type StageColor, type StageOption } from "./types";
import { cleanLabel, keyFromLabel } from "./validation";

const SETTING_KEY = "stages";

/** Past this a Board stops fitting on a screen. */
export const MAX_STAGES = 10;

function isOption(value: unknown): value is StageOption {
  const option = value as StageOption;
  return (
    Boolean(option) &&
    typeof option.key === "string" &&
    typeof option.label === "string" &&
    option.key.length > 0 &&
    option.label.length > 0 &&
    isStageColor(option.color)
  );
}

function defaults(): StageOption[] {
  return DEFAULT_STAGES.map((stage) => ({ ...stage }));
}

/** The configured list, falling back to the built-in one on a fresh board. */
export async function listStages(): Promise<StageOption[]> {
  const row = await getDb()
    .prepare(`SELECT value FROM settings WHERE brand_id = ? AND key = ?`)
    .bind(await currentBrandId(), SETTING_KEY)
    .first<{ value: string }>();

  if (!row?.value) return defaults();

  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return defaults();
    const options = parsed.filter(isOption);
    return options.length > 0 ? options : defaults();
  } catch {
    return defaults();
  }
}

/** A resolver from key to label, for history lines written server-side. */
export async function stageLabeler(): Promise<(key: string) => string> {
  const options = await listStages();
  return (key: string) => options.find((option) => option.key === key)?.label ?? key;
}

async function writeStages(options: StageOption[]): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO settings (brand_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(brand_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(await currentBrandId(), SETTING_KEY, JSON.stringify(options), new Date().toISOString())
    .run();
}

/** How many live events currently sit in each stage, so nothing is removed blindly. */
export async function stageUsage(): Promise<Record<string, number>> {
  const { results } = await getDb()
    .prepare(
      `SELECT stage, COUNT(*) AS n FROM events
       WHERE brand_id = ? AND stage IS NOT NULL AND status NOT IN ('completed', 'cancelled')
       GROUP BY stage`,
    )
    .bind(await currentBrandId())
    .all<{ stage: string; n: number }>();

  const usage: Record<string, number> = {};
  for (const row of results ?? []) usage[row.stage] = Number(row.n);
  return usage;
}

type Result = { ok: true; stages: StageOption[] } | { ok: false; error: string };

/** The first color in the cycle the list is not already using. */
function pickColor(stages: StageOption[]): StageColor {
  const used = new Set(stages.map((stage) => stage.color));
  const order: StageColor[] = ["blue", "teal", "green", "amber", "orange", "rose", "violet", "gray"];
  return order.find((color) => !used.has(color)) ?? order[stages.length % order.length];
}

export async function addStage(rawLabel: unknown, rawColor?: unknown): Promise<Result> {
  const label = cleanLabel(rawLabel);
  if (!label) return { ok: false, error: "Use between 2 and 40 characters." };

  const key = keyFromLabel(label);
  if (!key) return { ok: false, error: "That name needs at least one letter or number." };

  const stages = await listStages();
  if (stages.length >= MAX_STAGES) {
    return { ok: false, error: `That is the most stages a board can have (${MAX_STAGES}).` };
  }
  if (stages.some((stage) => stage.key === key)) {
    return { ok: false, error: `"${label}" is already a stage.` };
  }

  const color = isStageColor(rawColor) ? rawColor : pickColor(stages);
  const next = [...stages, { key, label, color }];
  await writeStages(next);
  return { ok: true, stages: next };
}

export async function renameStage(key: unknown, rawLabel: unknown): Promise<Result> {
  const label = cleanLabel(rawLabel);
  if (!label) return { ok: false, error: "Use between 2 and 40 characters." };

  const stages = await listStages();
  if (!stages.some((stage) => stage.key === key)) {
    return { ok: false, error: "That stage no longer exists." };
  }

  // Only the label moves; events keep pointing at the same key.
  const next = stages.map((stage) => (stage.key === key ? { ...stage, label } : stage));
  await writeStages(next);
  return { ok: true, stages: next };
}

export async function recolorStage(key: unknown, color: unknown): Promise<Result> {
  if (!isStageColor(color)) return { ok: false, error: "Pick one of the listed colors." };

  const stages = await listStages();
  if (!stages.some((stage) => stage.key === key)) {
    return { ok: false, error: "That stage no longer exists." };
  }

  const next = stages.map((stage) => (stage.key === key ? { ...stage, color } : stage));
  await writeStages(next);
  return { ok: true, stages: next };
}

/** Moves a stage one place up or down. The order is the Board's column order. */
export async function moveStage(key: unknown, direction: unknown): Promise<Result> {
  const stages = await listStages();
  const index = stages.findIndex((stage) => stage.key === key);
  if (index === -1) return { ok: false, error: "That stage no longer exists." };

  const step = direction === "up" ? -1 : direction === "down" ? 1 : 0;
  const target = index + step;
  if (step === 0 || target < 0 || target >= stages.length) {
    return { ok: true, stages };
  }

  const next = [...stages];
  [next[index], next[target]] = [next[target], next[index]];
  await writeStages(next);
  return { ok: true, stages: next };
}

export async function removeStage(key: unknown): Promise<Result> {
  const stages = await listStages();
  if (stages.length <= 1) {
    return { ok: false, error: "Keep at least one stage. The Board needs a column." };
  }
  if (!stages.some((stage) => stage.key === key)) {
    return { ok: false, error: "That stage no longer exists." };
  }

  // Removing a stage that live events still sit in would leave them in a
  // column nothing can draw, so it is refused rather than silently reassigned.
  const usage = await stageUsage();
  const inUse = usage[key as string] ?? 0;
  if (inUse > 0) {
    return {
      ok: false,
      error: `${inUse} event${inUse === 1 ? " is" : "s are"} in this stage. Move ${
        inUse === 1 ? "it" : "them"
      } to another stage first.`,
    };
  }

  const next = stages.filter((stage) => stage.key !== key);
  await writeStages(next);
  return { ok: true, stages: next };
}
