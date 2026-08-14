import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildMonthCalendar,
  collidingEventIds,
  collisionClusters,
  collisionPairs,
  eventSpan,
  hasPrimaryChannel,
  lanesForWeek,
} from "../lib/calendar.ts";
import { monthGrid } from "../lib/dates.ts";
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
    brief: "",
    launch_date: "2026-08-12",
    promo_end_date: null,
    inventory_date: null,
    asset_deadline: null,
    teaser_start: null,
    channels: channels({ paid: "primary" }),
    owner: "Dana",
    notes: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-27T00:00:00Z",
    updated_by: "Cole",
    ...overrides,
  };
}

test("a launch-only event spans a single day", () => {
  const span = eventSpan(makeEvent({ launch_date: "2026-08-12" }));
  assert.deepEqual(span, { start: "2026-08-12", end: "2026-08-12" });
});

test("spans fall back from teaser start and promo end independently", () => {
  assert.deepEqual(
    eventSpan(makeEvent({ launch_date: "2026-08-12", teaser_start: "2026-08-05" })),
    { start: "2026-08-05", end: "2026-08-12" },
    "teaser but no promo end",
  );
  assert.deepEqual(
    eventSpan(makeEvent({ launch_date: "2026-08-12", promo_end_date: "2026-08-19" })),
    { start: "2026-08-12", end: "2026-08-19" },
    "promo end but no teaser",
  );
  assert.deepEqual(
    eventSpan(
      makeEvent({
        launch_date: "2026-08-12",
        teaser_start: "2026-08-05",
        promo_end_date: "2026-08-19",
      }),
    ),
    { start: "2026-08-05", end: "2026-08-19" },
  );
});

test("hasPrimaryChannel needs the channel to be both involved and primary", () => {
  assert.equal(hasPrimaryChannel(makeEvent({ channels: channels({ paid: "primary" }) })), true);
  assert.equal(
    hasPrimaryChannel(makeEvent({ channels: channels({ paid: "supporting", email: "fyi" }) })),
    false,
  );

  const notInvolved = makeEvent();
  notInvolved.channels.paid = { involved: false, priority: "primary" };
  assert.equal(
    hasPrimaryChannel(notInvolved),
    false,
    "a priority left on an uninvolved channel does not count",
  );
});

test("two primary launches five days apart collide", () => {
  const events = [
    makeEvent({ name: "A", launch_date: "2026-08-12" }),
    makeEvent({ name: "B", launch_date: "2026-08-17" }),
  ];

  const pairs = collisionPairs(events);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].daysApart, 5);
  assert.deepEqual([...collidingEventIds(events)].sort(), [events[0].id, events[1].id].sort());
});

test("the window is inclusive at seven days and clear at eight", () => {
  const atSeven = [
    makeEvent({ launch_date: "2026-08-12" }),
    makeEvent({ launch_date: "2026-08-19" }),
  ];
  assert.equal(collisionPairs(atSeven).length, 1, "exactly 7 days apart still collides");

  const atEight = [
    makeEvent({ launch_date: "2026-08-12" }),
    makeEvent({ launch_date: "2026-08-20" }),
  ];
  assert.equal(collisionPairs(atEight).length, 0);
});

test("a supporting-only event never collides", () => {
  const events = [
    makeEvent({ name: "Primary", launch_date: "2026-08-12" }),
    makeEvent({
      name: "Supporting",
      launch_date: "2026-08-15",
      channels: channels({ email: "supporting", organic: "fyi" }),
    }),
  ];

  assert.equal(collisionPairs(events).length, 0);
  assert.equal(collidingEventIds(events).size, 0);
});

test("collisions ignore completed and cancelled events", () => {
  const events = [
    makeEvent({ launch_date: "2026-08-12" }),
    makeEvent({ launch_date: "2026-08-14", status: "cancelled" }),
    makeEvent({ launch_date: "2026-08-15", status: "completed" }),
  ];
  assert.equal(collisionPairs(events).length, 0);
});

test("collisions are detected across a month boundary", () => {
  const events = [
    makeEvent({ name: "Aug", launch_date: "2026-08-30" }),
    makeEvent({ name: "Sep", launch_date: "2026-09-02" }),
  ];

  const pairs = collisionPairs(events);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].daysApart, 3);
});

test("three clashing launches produce three pairs but two-plus distinct events", () => {
  const events = [
    makeEvent({ launch_date: "2026-08-10" }),
    makeEvent({ launch_date: "2026-08-12" }),
    makeEvent({ launch_date: "2026-08-14" }),
  ];

  assert.equal(collisionPairs(events).length, 3);
  assert.equal(collidingEventIds(events).size, 3);
});

test("week lanes stack overlapping spans and leave disjoint ones side by side", () => {
  const week = monthGrid("2026-08-15")[2]; // a full in-month week
  const [monday, , , , , , sunday] = week;

  const overlapA = makeEvent({ launch_date: monday, promo_end_date: sunday });
  const overlapB = makeEvent({ launch_date: monday, promo_end_date: sunday });
  const stacked = lanesForWeek([overlapA, overlapB], week, new Set());
  assert.equal(stacked.length, 2, "two overlapping spans need two lanes");

  const early = makeEvent({ launch_date: monday });
  const late = makeEvent({ launch_date: sunday });
  const shared = lanesForWeek([early, late], week, new Set());
  assert.equal(shared.length, 1, "disjoint spans share a lane");
  assert.equal(shared[0].length, 2);
});

test("a span crossing a week edge is marked as continuing", () => {
  const grid = monthGrid("2026-08-15");
  const week = grid[1];
  const event = makeEvent({
    launch_date: week[0],
    teaser_start: "2026-07-28", // well before this row
    promo_end_date: "2026-09-10", // well after it
  });

  const [lane] = lanesForWeek([event], week, new Set());
  const segment = lane[0];

  assert.equal(segment.continuesLeft, true);
  assert.equal(segment.continuesRight, true);
  assert.equal(segment.startCol, 0);
  assert.equal(segment.endCol, 6);
  assert.equal(segment.launchCol, 0, "launch day is marked within the row");
});

test("launchCol is null in rows the launch does not fall in", () => {
  const grid = monthGrid("2026-08-15");
  const event = makeEvent({
    launch_date: grid[0][0],
    promo_end_date: grid[2][6],
  });

  const laterRow = lanesForWeek([event], grid[2], new Set())[0][0];
  assert.equal(laterRow.launchCol, null);
  assert.equal(laterRow.continuesLeft, true);
});

test("buildMonthCalendar reports colliding events visible in the month", () => {
  const grid = monthGrid("2026-08-15");
  const events = [
    makeEvent({ name: "Clash A", launch_date: "2026-08-12" }),
    makeEvent({ name: "Clash B", launch_date: "2026-08-15" }),
    makeEvent({ name: "Lonely", launch_date: "2026-08-28" }),
  ];

  const calendar = buildMonthCalendar(events, grid);
  assert.deepEqual(
    calendar.collidingInView.map((e) => e.name).sort(),
    ["Clash A", "Clash B"],
  );
  assert.equal(calendar.lanesByWeek.length, grid.length);
});

test("a collision outside the viewed month does not raise a banner there", () => {
  const events = [
    makeEvent({ name: "Nov A", launch_date: "2026-11-10" }),
    makeEvent({ name: "Nov B", launch_date: "2026-11-13" }),
  ];

  const august = buildMonthCalendar(events, monthGrid("2026-08-15"));
  assert.equal(august.collidingInView.length, 0);

  const november = buildMonthCalendar(events, monthGrid("2026-11-15"));
  assert.equal(november.collidingInView.length, 2);
});

test("cancelled events are absent from the grid entirely", () => {
  const grid = monthGrid("2026-08-15");
  const calendar = buildMonthCalendar(
    [makeEvent({ status: "cancelled", launch_date: "2026-08-12" })],
    grid,
  );
  assert.equal(calendar.lanesByWeek.flat(2).length, 0);
});

test("separate clashes are reported as separate clusters", () => {
  const events = [
    makeEvent({ name: "Aug A", launch_date: "2026-08-10" }),
    makeEvent({ name: "Aug B", launch_date: "2026-08-13" }),
    makeEvent({ name: "Nov A", launch_date: "2026-11-10" }),
    makeEvent({ name: "Nov B", launch_date: "2026-11-13" }),
  ];

  const clusters = collisionClusters(events);
  assert.equal(clusters.length, 2, "two problems, not one pile of four");
  assert.deepEqual(clusters[0].map((e) => e.name), ["Aug A", "Aug B"]);
  assert.deepEqual(clusters[1].map((e) => e.name), ["Nov A", "Nov B"]);
});

test("a chain of near-launches stays a single cluster", () => {
  // A-B is 6 days, B-C is 5 days, but A-C is 11 — still one rolling clash.
  const events = [
    makeEvent({ name: "A", launch_date: "2026-08-01" }),
    makeEvent({ name: "B", launch_date: "2026-08-07" }),
    makeEvent({ name: "C", launch_date: "2026-08-12" }),
  ];

  const clusters = collisionClusters(events);
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].map((e) => e.name), ["A", "B", "C"]);
});

test("no collisions means no clusters", () => {
  assert.deepEqual(
    collisionClusters([
      makeEvent({ launch_date: "2026-08-01" }),
      makeEvent({ launch_date: "2026-09-01" }),
    ]),
    [],
  );
});

test("a cluster with only one member on screen raises no banner", () => {
  const events = [
    makeEvent({ name: "In August", launch_date: "2026-08-31" }),
    makeEvent({ name: "In September", launch_date: "2026-09-03" }),
  ];

  // The August grid trails into early September, so both are visible there.
  const august = buildMonthCalendar(events, monthGrid("2026-08-15"));
  assert.equal(august.clustersInView.length, 1);
  assert.equal(august.clustersInView[0].length, 2);

  // October sees neither, so nothing is announced.
  const october = buildMonthCalendar(events, monthGrid("2026-10-15"));
  assert.equal(october.clustersInView.length, 0);
});
