import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildPipeline,
  entriesByDay,
  isStale,
  visibleEvents,
} from "../lib/pipeline.ts";
import type { LaunchEvent } from "../lib/types.ts";

const TODAY = "2026-07-30"; // a Thursday; the week runs Jul 27 – Aug 2

let counter = 0;

function makeEvent(overrides: Partial<LaunchEvent> = {}): LaunchEvent {
  counter += 1;
  return {
    id: `event-${counter}`,
    name: `Event ${counter}`,
    type: "product_launch",
    status: "confirmed",
    brief: "",
    launch_date: "2026-07-30",
    promo_end_date: null,
    inventory_date: null,
    asset_deadline: null,
    teaser_start: null,
    channels: {
      paid: { involved: true, priority: "primary" },
      email: { involved: false, priority: null },
      organic: { involved: false, priority: null },
      sms: { involved: false, priority: null },
    },
    owner: "Dana",
    notes: null,
    assets_link: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-29T00:00:00Z",
    updated_by: "Cole",
    ...overrides,
  };
}

test("launches land in the week containing their launch date", () => {
  const pipeline = buildPipeline(
    [
      makeEvent({ name: "This week", launch_date: "2026-07-30" }),
      makeEvent({ name: "Week 2", launch_date: "2026-08-05" }),
      makeEvent({ name: "Week 3", launch_date: "2026-08-11" }),
      makeEvent({ name: "Week 4", launch_date: "2026-08-23" }),
    ],
    TODAY,
  );

  assert.deepEqual(
    pipeline.weeks.map((week) => week.launches.map((e) => e.name)),
    [["This week"], ["Week 2"], ["Week 3"], ["Week 4"]],
  );
  assert.equal(pipeline.beyond.length, 0);
  assert.equal(pipeline.overdue.length, 0);
});

test("Sunday and Monday boundaries fall on the correct side", () => {
  const pipeline = buildPipeline(
    [
      makeEvent({ name: "Sunday", launch_date: "2026-08-02" }),
      makeEvent({ name: "Monday", launch_date: "2026-08-03" }),
    ],
    TODAY,
  );

  assert.deepEqual(pipeline.weeks[0].launches.map((e) => e.name), ["Sunday"]);
  assert.deepEqual(pipeline.weeks[1].launches.map((e) => e.name), ["Monday"]);
});

test("an event appears as a milestone in one week and a card in another", () => {
  const pipeline = buildPipeline(
    [
      makeEvent({
        name: "Fall Apparel Drop",
        launch_date: "2026-08-19", // week 4
        asset_deadline: "2026-08-04", // week 2
      }),
    ],
    TODAY,
  );

  assert.deepEqual(pipeline.weeks[1].milestones.map((m) => m.kind), [
    "asset_deadline",
  ]);
  assert.equal(pipeline.weeks[1].launches.length, 0, "no card in week 2");
  assert.deepEqual(pipeline.weeks[3].launches.map((e) => e.name), [
    "Fall Apparel Drop",
  ]);
  assert.equal(pipeline.weeks[3].milestones.length, 0);
});

test("lead-up dates surface even when the launch is beyond the window", () => {
  const pipeline = buildPipeline(
    [
      makeEvent({
        name: "Holiday Campaign",
        launch_date: "2026-11-20", // far beyond four weeks
        teaser_start: "2026-07-29", // this week
      }),
    ],
    TODAY,
  );

  assert.deepEqual(pipeline.weeks[0].milestones.map((m) => m.kind), [
    "teaser_start",
  ]);
  assert.equal(pipeline.weeks[0].launches.length, 0);
  assert.deepEqual(pipeline.beyond.map((e) => e.name), ["Holiday Campaign"]);
});

test("all three lead-up kinds are recognised, and only those", () => {
  const pipeline = buildPipeline(
    [
      makeEvent({
        launch_date: "2026-09-30",
        asset_deadline: "2026-07-28",
        teaser_start: "2026-07-29",
        inventory_date: "2026-07-30",
        promo_end_date: "2026-07-31",
      }),
    ],
    TODAY,
  );

  assert.deepEqual(
    pipeline.weeks[0].milestones.map((m) => m.kind),
    ["asset_deadline", "teaser_start", "inventory_date"],
    "sorted by date; promo_end_date is not a lead-up milestone",
  );
});

test("cancelled events are always hidden; completed ones are opt-in", () => {
  const events = [
    makeEvent({ name: "Live", status: "confirmed" }),
    makeEvent({ name: "Done", status: "completed" }),
    makeEvent({ name: "Dead", status: "cancelled" }),
  ];

  assert.deepEqual(visibleEvents(events).map((e) => e.name), ["Live"]);
  assert.deepEqual(
    visibleEvents(events, { includeCompleted: true }).map((e) => e.name),
    ["Live", "Done"],
  );

  const hidden = buildPipeline(events, TODAY);
  assert.deepEqual(hidden.weeks[0].launches.map((e) => e.name), ["Live"]);

  const shown = buildPipeline(events, TODAY, { includeCompleted: true });
  assert.deepEqual(shown.weeks[0].launches.map((e) => e.name), ["Done", "Live"]);
});

test("a cancelled event contributes no milestones either", () => {
  const pipeline = buildPipeline(
    [makeEvent({ status: "cancelled", launch_date: "2026-09-30", asset_deadline: "2026-07-29" })],
    TODAY,
  );
  assert.equal(pipeline.weeks[0].milestones.length, 0);
});

test("past-due active launches are surfaced rather than dropped", () => {
  const pipeline = buildPipeline(
    [makeEvent({ name: "Slipped", launch_date: "2026-07-20" })],
    TODAY,
  );

  assert.deepEqual(pipeline.overdue.map((e) => e.name), ["Slipped"]);
  assert.equal(
    pipeline.weeks[0].launches.length,
    0,
    "it is not silently folded into this week's launches",
  );
});

test("empty weeks are still reported, and flagged as empty", () => {
  const pipeline = buildPipeline(
    [makeEvent({ launch_date: "2026-08-11" })],
    TODAY,
  );

  assert.deepEqual(
    pipeline.weeks.map((week) => week.empty),
    [true, true, false, true],
  );
  assert.equal(pipeline.weeks.length, 4, "always four rows");
});

test("beyond-four-weeks starts the day after the window ends", () => {
  const pipeline = buildPipeline(
    [
      makeEvent({ name: "Last day in", launch_date: "2026-08-23" }),
      makeEvent({ name: "First day out", launch_date: "2026-08-24" }),
    ],
    TODAY,
  );

  assert.deepEqual(pipeline.weeks[3].launches.map((e) => e.name), ["Last day in"]);
  assert.deepEqual(pipeline.beyond.map((e) => e.name), ["First day out"]);
});

test("staleness needs both an old record and an imminent launch", () => {
  const imminent = makeEvent({ launch_date: "2026-08-10" }); // 11 days out
  const distant = makeEvent({ launch_date: "2026-12-01" });

  assert.equal(isStale(imminent, TODAY, 25), true, "old and imminent");
  assert.equal(isStale(imminent, TODAY, 20), false, "recently touched");
  assert.equal(isStale(distant, TODAY, 25), false, "old but far off");
  assert.equal(isStale(imminent, TODAY, 21), true, "21 days is the threshold");
});

test("staleness ignores launches in the past and closed events", () => {
  assert.equal(
    isStale(makeEvent({ launch_date: "2026-07-01" }), TODAY, 40),
    false,
    "already launched",
  );
  assert.equal(
    isStale(makeEvent({ launch_date: "2026-08-10", status: "completed" }), TODAY, 40),
    false,
  );
  assert.equal(
    isStale(makeEvent({ launch_date: "2026-08-10", status: "cancelled" }), TODAY, 40),
    false,
  );
  assert.equal(
    isStale(makeEvent({ launch_date: "2026-08-29", status: "confirmed" }), TODAY, 40),
    true,
    "30 days out is still inside the window",
  );
});

test("entries interleave launches and milestones in date order", () => {
  const pipeline = buildPipeline(
    [
      makeEvent({ name: "Later launch", launch_date: "2026-07-31" }),
      makeEvent({
        name: "Distant drop",
        launch_date: "2026-09-15",
        asset_deadline: "2026-07-28",
      }),
    ],
    TODAY,
  );

  assert.deepEqual(
    pipeline.weeks[0].entries.map((entry) => [entry.date, entry.kind]),
    [
      ["2026-07-28", "asset_deadline"],
      ["2026-07-31", "launch"],
    ],
    "the earlier milestone outranks the later launch",
  );
});

test("on a shared day the launch leads its own run-up work", () => {
  const pipeline = buildPipeline(
    [
      makeEvent({
        name: "Same day",
        launch_date: "2026-07-30",
        inventory_date: "2026-07-30",
      }),
    ],
    TODAY,
  );

  assert.deepEqual(
    pipeline.weeks[0].entries.map((entry) => entry.kind),
    ["launch", "inventory_date"],
  );
});

test("entriesByDay always returns seven buckets, including empty ones", () => {
  const pipeline = buildPipeline(
    [
      makeEvent({ name: "Monday", launch_date: "2026-07-27" }),
      makeEvent({ name: "Sunday", launch_date: "2026-08-02" }),
    ],
    TODAY,
  );

  const days = entriesByDay(pipeline.weeks[0]);
  assert.equal(days.length, 7);
  assert.deepEqual(days.map((day) => day.length), [1, 0, 0, 0, 0, 0, 1]);
  assert.equal(days[0][0].event.name, "Monday");
  assert.equal(days[6][0].event.name, "Sunday");
});

test("entriesByDay places several items on one day together", () => {
  const pipeline = buildPipeline(
    [
      makeEvent({ name: "A", launch_date: "2026-07-29" }),
      makeEvent({ name: "B", launch_date: "2026-07-29" }),
      makeEvent({ name: "C", launch_date: "2026-09-01", teaser_start: "2026-07-29" }),
    ],
    TODAY,
  );

  const days = entriesByDay(pipeline.weeks[0]);
  assert.equal(days[2].length, 3, "Wednesday holds two launches and a teaser");
});

test("an empty week yields seven empty day buckets", () => {
  const pipeline = buildPipeline([], TODAY);
  const days = entriesByDay(pipeline.weeks[0]);
  assert.deepEqual(days.map((day) => day.length), [0, 0, 0, 0, 0, 0, 0]);
});
