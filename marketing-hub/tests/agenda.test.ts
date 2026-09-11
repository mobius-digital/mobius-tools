import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildAgenda,
  describeDistance,
  isStale,
  overdueEvents,
  visibleEvents,
} from "../lib/agenda.ts";
import type { Channels, LaunchEvent } from "../lib/types.ts";

let counter = 0;

function channels(spec: Partial<Record<keyof Channels, string>>): Channels {
  const build = (value?: string) =>
    value
      ? { involved: true, priority: value as "primary" | "supporting" | "fyi" }
      : { involved: false, priority: null };

  return {
    paid: build(spec.paid),
    email: build(spec.email),
    organic: build(spec.organic),
    sms: build(spec.sms),
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
    channels: channels({ paid: "primary" }),
    owner: "Dana",
    notes: null,
    assets_link: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    updated_by: "Dana",
    ...overrides,
  };
}

test("cancelled events are always hidden; completed ones are opt-in", () => {
  const events = [
    makeEvent({ status: "cancelled" }),
    makeEvent({ status: "completed" }),
    makeEvent({ status: "confirmed" }),
  ];
  assert.equal(visibleEvents(events).length, 1);
  assert.equal(visibleEvents(events, { includeCompleted: true }).length, 2);
});

test("the agenda lists only days with something on them, launches first", () => {
  const launch = makeEvent({
    name: "Zed",
    launch_date: "2026-08-12",
    asset_deadline: "2026-08-05",
  });
  const other = makeEvent({ name: "Alpha", launch_date: "2026-08-12" });

  const days = buildAgenda([launch, other], "2026-08-01", 28);
  assert.deepEqual(
    days.map((day) => day.date),
    ["2026-08-05", "2026-08-12"],
  );
  assert.deepEqual(
    days[1].entries.map((entry) => `${entry.kind}:${entry.event.name}`),
    ["launch:Alpha", "launch:Zed"],
  );
  assert.equal(days[0].entries[0].kind, "asset_deadline");
});

test("a run-up date outside the window is not listed", () => {
  const event = makeEvent({ launch_date: "2026-09-30", teaser_start: "2026-09-20" });
  const days = buildAgenda([event], "2026-08-01", 28);
  assert.equal(days.length, 0);
});

test("a cancelled event contributes no run-up lines either", () => {
  const event = makeEvent({ status: "cancelled", asset_deadline: "2026-08-03" });
  assert.equal(buildAgenda([event], "2026-08-01", 28).length, 0);
});

test("past-due active launches are surfaced, soonest first", () => {
  const late = makeEvent({ launch_date: "2026-08-01" });
  const later = makeEvent({ launch_date: "2026-07-20" });
  const done = makeEvent({ launch_date: "2026-07-01", status: "completed" });
  const ids = overdueEvents([late, later, done], "2026-08-10").map((event) => event.id);
  assert.deepEqual(ids, [later.id, late.id]);
});

test("staleness needs both an old record and an imminent launch", () => {
  const event = makeEvent({ launch_date: "2026-08-20" });
  assert.equal(isStale(event, "2026-08-01", 25), true);
  assert.equal(isStale(event, "2026-08-01", 5), false);
  assert.equal(isStale(makeEvent({ launch_date: "2026-12-01" }), "2026-08-01", 40), false);
});

test("staleness ignores launches in the past and closed events", () => {
  assert.equal(isStale(makeEvent({ launch_date: "2026-07-01" }), "2026-08-01", 40), false);
  assert.equal(
    isStale(makeEvent({ launch_date: "2026-08-10", status: "completed" }), "2026-08-01", 40),
    false,
  );
});

test("distances read the way people say them", () => {
  assert.equal(describeDistance("2026-08-10", "2026-08-10"), "today");
  assert.equal(describeDistance("2026-08-10", "2026-08-11"), "tomorrow");
  assert.equal(describeDistance("2026-08-10", "2026-08-22"), "in 12d");
  assert.equal(describeDistance("2026-08-10", "2026-08-07"), "3d ago");
});
