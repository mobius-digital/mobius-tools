import { test } from "node:test";
import assert from "node:assert/strict";

import { buildBoard, stageClass, stageOf, UNSORTED_KEY } from "../lib/board.ts";
import { DEFAULT_STAGES, type Channels, type LaunchEvent } from "../lib/types.ts";
import { normalizeStage, validateEventInput } from "../lib/validation.ts";

let counter = 0;

function channels(): Channels {
  return {
    paid: { involved: true, priority: "primary" },
    email: { involved: false, priority: null },
    organic: { involved: false, priority: null },
    sms: { involved: false, priority: null },
  };
}

function makeEvent(overrides: Partial<LaunchEvent> = {}): LaunchEvent {
  counter += 1;
  return {
    id: `event-${counter}`,
    name: `Event ${counter}`,
    type: "product_launch",
    status: "confirmed",
    stage: null,
    brief: "",
    launch_date: "2026-08-12",
    promo_end_date: null,
    inventory_date: null,
    asset_deadline: null,
    teaser_start: null,
    channels: channels(),
    owner: "Dana",
    notes: null,
    assets_link: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    updated_by: "Dana",
    ...overrides,
  };
}

test("columns follow the stage list in order, soonest launch first", () => {
  const a = makeEvent({ stage: "built", launch_date: "2026-08-20" });
  const b = makeEvent({ stage: "built", launch_date: "2026-08-10" });
  const c = makeEvent({ stage: "briefed" });

  const columns = buildBoard([a, b, c], DEFAULT_STAGES);
  assert.deepEqual(
    columns.map((column) => column.key),
    DEFAULT_STAGES.map((stage) => stage.key),
  );
  const built = columns.find((column) => column.key === "built")!;
  assert.deepEqual(built.events.map((event) => event.id), [b.id, a.id]);
  assert.equal(columns.find((column) => column.key === "briefed")!.events.length, 1);
});

test("events with no stage, or a removed stage, gather in Unsorted at the front", () => {
  const none = makeEvent({ stage: null });
  const gone = makeEvent({ stage: "retired_stage" });
  const columns = buildBoard([none, gone], DEFAULT_STAGES);
  assert.equal(columns[0].key, UNSORTED_KEY);
  assert.equal(columns[0].events.length, 2);
});

test("Unsorted is absent when nothing needs sorting", () => {
  const columns = buildBoard([makeEvent({ stage: "planned" })], DEFAULT_STAGES);
  assert.notEqual(columns[0].key, UNSORTED_KEY);
});

test("completed and cancelled launches leave the board unless asked for", () => {
  const done = makeEvent({ stage: "scheduled", status: "completed" });
  const dead = makeEvent({ stage: "scheduled", status: "cancelled" });
  const hidden = buildBoard([done, dead], DEFAULT_STAGES);
  assert.equal(hidden.find((column) => column.key === "scheduled")!.events.length, 0);
  const shown = buildBoard([done, dead], DEFAULT_STAGES, { includeCompleted: true });
  assert.equal(shown.find((column) => column.key === "scheduled")!.events.length, 1);
});

test("stageOf and stageClass resolve against the list", () => {
  assert.equal(stageOf({ stage: "built" }, DEFAULT_STAGES)?.label, "Built");
  assert.equal(stageOf({ stage: "nope" }, DEFAULT_STAGES), null);
  assert.equal(stageClass({ stage: "built" }, DEFAULT_STAGES), "stage-teal");
  assert.equal(stageClass({ stage: null }, DEFAULT_STAGES), "stage-none");
});

test("a stage is validated against the board's list when one is given", () => {
  assert.equal(normalizeStage("", DEFAULT_STAGES), null);
  assert.equal(normalizeStage("built", DEFAULT_STAGES), "built");
  assert.equal(normalizeStage("nope", DEFAULT_STAGES), false);
  assert.equal(normalizeStage("anything"), "anything");

  const base = {
    name: "Drop",
    type: "product_launch",
    status: "confirmed",
    owner: "Dana",
    launch_date: "2026-08-12",
    channels: channels(),
  };
  assert.equal(
    validateEventInput({ ...base, stage: "built" }, undefined, undefined, DEFAULT_STAGES).stage,
    "built",
  );
  assert.equal(validateEventInput({ ...base }, undefined, undefined, DEFAULT_STAGES).stage, null);
  assert.throws(
    () => validateEventInput({ ...base, stage: "nope" }, undefined, undefined, DEFAULT_STAGES),
    /could not be saved/,
  );
});
