import { test } from "node:test";
import assert from "node:assert/strict";

import { describeCreation, describeDeletion, diffEvents } from "../lib/changelog.ts";
import type { Channels, LaunchEvent } from "../lib/types.ts";

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
  return {
    id: "event-1",
    name: "Fall Apparel Drop",
    type: "product_launch",
    status: "tentative",
    brief: "A brief",
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

test("an unchanged save writes no history", () => {
  const before = makeEvent();
  assert.deepEqual(diffEvents(before, makeEvent()), []);
});

test("brief, notes and owner edits are not logged", () => {
  const before = makeEvent();
  const after = makeEvent({
    brief: "Completely different brief",
    notes: "Some notes",
    owner: "Morgan",
  });
  assert.deepEqual(diffEvents(before, after), []);
});

test("a moved launch date reads as a before and after", () => {
  const lines = diffEvents(makeEvent(), makeEvent({ launch_date: "2026-08-26" }));
  assert.deepEqual(lines, ["Launch date moved Aug 12 → Aug 26"]);
});

test("every date column is diffed, not just launch", () => {
  const lines = diffEvents(
    makeEvent(),
    makeEvent({
      teaser_start: "2026-08-05",
      asset_deadline: "2026-08-01",
      inventory_date: "2026-08-10",
      promo_end_date: "2026-08-19",
    }),
  );

  assert.deepEqual(lines, [
    "Promo end set: Aug 19",
    "Inventory date set: Aug 10",
    "Asset deadline set: Aug 1",
    "Teaser start set: Aug 5",
  ]);
});

test("clearing a date says so, and says what it was", () => {
  const before = makeEvent({ asset_deadline: "2026-08-01" });
  const lines = diffEvents(before, makeEvent({ asset_deadline: null }));
  assert.deepEqual(lines, ["Asset deadline removed (was Aug 1)"]);
});

test("status changes read plainly, and cancellation gets its own wording", () => {
  assert.deepEqual(
    diffEvents(makeEvent(), makeEvent({ status: "confirmed" })),
    ["Status: tentative → confirmed"],
  );
  assert.deepEqual(
    diffEvents(makeEvent(), makeEvent({ status: "cancelled" })),
    ["Event cancelled"],
  );
  assert.deepEqual(
    diffEvents(makeEvent({ status: "confirmed" }), makeEvent({ status: "at_risk" })),
    ["Status: confirmed → at risk"],
  );
});

test("channel involvement and priority changes are described", () => {
  const before = makeEvent({ channels: channels({ paid: "supporting", email: "primary" }) });
  const after = makeEvent({ channels: channels({ paid: "primary", sms: "fyi" }) });

  assert.deepEqual(diffEvents(before, after), [
    "Paid: supporting → primary",
    "Email removed",
    "SMS added (fyi)",
  ]);
});

test("a rename is logged with both names", () => {
  const lines = diffEvents(makeEvent(), makeEvent({ name: "Winter Drop" }));
  assert.deepEqual(lines, ['Renamed "Fall Apparel Drop" → "Winter Drop"']);
});

test("one save touching three things yields three separate entries", () => {
  const lines = diffEvents(
    makeEvent(),
    makeEvent({
      name: "Winter Drop",
      status: "confirmed",
      launch_date: "2026-09-01",
    }),
  );

  assert.equal(lines.length, 3);
  assert.ok(lines.some((line) => line.startsWith("Renamed")));
  assert.ok(lines.some((line) => line.startsWith("Status:")));
  assert.ok(lines.some((line) => line.startsWith("Launch date moved")));
});

test("creation and deletion carry the launch date", () => {
  assert.equal(
    describeCreation(makeEvent({ status: "confirmed" })),
    "Event created (launch Aug 12, confirmed)",
  );
  assert.equal(
    describeDeletion(makeEvent()),
    "Event deleted permanently (was launching Aug 12)",
  );
});
