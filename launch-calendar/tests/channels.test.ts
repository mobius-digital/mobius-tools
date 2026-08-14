import { test } from "node:test";
import assert from "node:assert/strict";

import {
  byElevation,
  elevationFor,
  filterByChannel,
  isChannelFilter,
} from "../lib/channels.ts";
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

test("all shows everything, a channel shows only its own work", () => {
  const events = [
    makeEvent({ name: "Paid only", channels: channels({ paid: "primary" }) }),
    makeEvent({ name: "Email only", channels: channels({ email: "supporting" }) }),
    makeEvent({ name: "Both", channels: channels({ paid: "fyi", email: "primary" }) }),
  ];

  assert.equal(filterByChannel(events, "all").length, 3);
  assert.deepEqual(
    filterByChannel(events, "paid").map((e) => e.name),
    ["Paid only", "Both"],
  );
  assert.deepEqual(
    filterByChannel(events, "email").map((e) => e.name),
    ["Email only", "Both"],
  );
  assert.deepEqual(filterByChannel(events, "sms").map((e) => e.name), []);
});

test("elevation reports how much of an event belongs to the lens", () => {
  const event = makeEvent({ channels: channels({ paid: "primary", email: "fyi" }) });

  assert.equal(elevationFor(event, "paid"), "primary");
  assert.equal(elevationFor(event, "email"), "fyi");
  assert.equal(elevationFor(event, "sms"), "none", "not involved");
  assert.equal(elevationFor(event, "all"), "none", "no lens, no elevation");
});

test("an involved channel with no priority still counts as involved", () => {
  const event = makeEvent();
  event.channels.organic = { involved: true, priority: null };
  assert.equal(elevationFor(event, "organic"), "fyi", "falls back to the quietest");
  assert.equal(filterByChannel([event], "organic").length, 1);
});

test("elevation sorting puts primary work first, then date order", () => {
  const events = [
    makeEvent({ name: "Late primary", launch_date: "2026-09-01", channels: channels({ paid: "primary" }) }),
    makeEvent({ name: "Early fyi", launch_date: "2026-08-01", channels: channels({ paid: "fyi" }) }),
    makeEvent({ name: "Mid supporting", launch_date: "2026-08-15", channels: channels({ paid: "supporting" }) }),
    makeEvent({ name: "Early primary", launch_date: "2026-08-05", channels: channels({ paid: "primary" }) }),
  ];

  assert.deepEqual(
    byElevation(events, "paid").map((e) => e.name),
    ["Early primary", "Late primary", "Mid supporting", "Early fyi"],
  );

  assert.deepEqual(
    byElevation(events, "all").map((e) => e.name),
    events.map((e) => e.name),
    "no lens means no reordering",
  );
});

test("isChannelFilter rejects anything that is not a real lens", () => {
  for (const good of ["all", "paid", "email", "organic", "sms"]) {
    assert.equal(isChannelFilter(good), true);
  }
  for (const bad of ["", "Paid", "everything", null, undefined, 7]) {
    assert.equal(isChannelFilter(bad), false);
  }
});
