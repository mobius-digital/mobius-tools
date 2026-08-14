import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ValidationError,
  normaliseChannels,
  validateEditorName,
  validateEventInput,
} from "../lib/validation.ts";

const ONE_PRIMARY = {
  paid: { involved: true, priority: "primary" },
  email: { involved: false, priority: null },
  organic: { involved: false, priority: null },
  sms: { involved: false, priority: null },
};

function baseEvent(overrides: Record<string, unknown> = {}) {
  return {
    name: "Patriot Putter Restock",
    type: "restock",
    status: "confirmed",
    launch_date: "2026-08-12",
    owner: "Dana",
    channels: ONE_PRIMARY,
    ...overrides,
  };
}

function errorsFrom(input: unknown): Record<string, string> {
  try {
    validateEventInput(input);
  } catch (error) {
    if (error instanceof ValidationError) return error.fieldErrors as Record<string, string>;
    throw error;
  }
  throw new assert.AssertionError({ message: "expected validation to fail" });
}

test("accepts an event with only the required fields", () => {
  const result = validateEventInput(baseEvent());

  assert.equal(result.name, "Patriot Putter Restock");
  assert.equal(result.launch_date, "2026-08-12");
  assert.equal(result.brief, "", "brief defaults to empty rather than null");
  assert.equal(result.notes, null);
  assert.equal(result.promo_end_date, null);
  assert.equal(result.teaser_start, null);
});

test("accepts an event with every field populated", () => {
  const result = validateEventInput(
    baseEvent({
      brief: "  Cold-weather capsule.  ",
      notes: "  https://example.com/brief  ",
      teaser_start: "2026-08-05",
      asset_deadline: "2026-07-29",
      inventory_date: "2026-08-10",
      promo_end_date: "2026-08-19",
      channels: {
        paid: { involved: true, priority: "primary" },
        email: { involved: true, priority: "supporting" },
        organic: { involved: true, priority: "fyi" },
        sms: { involved: true, priority: "primary" },
      },
    }),
  );

  assert.equal(result.brief, "Cold-weather capsule.", "trimmed");
  assert.equal(result.notes, "https://example.com/brief", "trimmed");
  assert.equal(result.teaser_start, "2026-08-05");
  assert.equal(result.promo_end_date, "2026-08-19");
  assert.equal(result.channels.sms.priority, "primary");
});

test("required fields each report their own message", () => {
  assert.equal(errorsFrom(baseEvent({ name: "   " })).name, "Give the event a name.");
  assert.equal(errorsFrom(baseEvent({ owner: "" })).owner, "Name who is accountable for this event.");
  assert.equal(errorsFrom(baseEvent({ type: "nope" })).type, "Choose a type.");
  assert.equal(errorsFrom(baseEvent({ status: "nope" })).status, "Choose a status.");
  assert.equal(
    errorsFrom(baseEvent({ launch_date: "" })).launch_date,
    "A launch date is required.",
  );
});

test("a missing launch date and a malformed one are different errors", () => {
  assert.equal(
    errorsFrom(baseEvent({ launch_date: "2026-02-31" })).launch_date,
    "That is not a real date.",
  );
  assert.equal(
    errorsFrom(baseEvent({ asset_deadline: "not-a-date" })).asset_deadline,
    "That is not a real date.",
  );
});

test("at least one channel has to be involved", () => {
  const errors = errorsFrom(
    baseEvent({
      channels: {
        paid: { involved: false, priority: null },
        email: { involved: false, priority: null },
        organic: { involved: false, priority: null },
        sms: { involved: false, priority: null },
      },
    }),
  );
  assert.equal(errors.channels, "At least one channel has to be involved.");
});

test("an involved channel must carry a priority", () => {
  const errors = errorsFrom(
    baseEvent({
      channels: {
        paid: { involved: true, priority: null },
        email: { involved: true, priority: null },
        organic: { involved: false, priority: null },
        sms: { involved: false, priority: null },
      },
    }),
  );
  assert.equal(errors.channels, "Set a priority for Paid, Email.");
});

test("date ordering is enforced against the launch date", () => {
  assert.equal(
    errorsFrom(baseEvent({ promo_end_date: "2026-08-01" })).promo_end_date,
    "The promo cannot end before it launches.",
  );
  assert.equal(
    errorsFrom(baseEvent({ teaser_start: "2026-09-01" })).teaser_start,
    "Teasers have to start on or before launch day.",
  );

  // Same-day boundaries are legitimate, not errors.
  const sameDay = validateEventInput(
    baseEvent({ promo_end_date: "2026-08-12", teaser_start: "2026-08-12" }),
  );
  assert.equal(sameDay.promo_end_date, "2026-08-12");
  assert.equal(sameDay.teaser_start, "2026-08-12");
});

test("several problems are reported together, not one at a time", () => {
  const errors = errorsFrom({ channels: {} });
  assert.deepEqual(Object.keys(errors).sort(), [
    "channels",
    "launch_date",
    "name",
    "owner",
    "status",
    "type",
  ]);
});

test("normaliseChannels fills gaps and strips contradictory priorities", () => {
  const result = normaliseChannels({
    paid: { involved: true, priority: "primary" },
    email: { involved: false, priority: "supporting" },
    organic: { involved: true, priority: "nonsense" },
  });

  assert.deepEqual(result.paid, { involved: true, priority: "primary" });
  assert.deepEqual(
    result.email,
    { involved: false, priority: null },
    "a channel that is not involved cannot keep a priority",
  );
  assert.deepEqual(
    result.organic,
    { involved: true, priority: null },
    "an unrecognised priority is dropped so validation can catch it",
  );
  assert.deepEqual(
    result.sms,
    { involved: false, priority: null },
    "missing channels are filled in",
  );
});

test("normaliseChannels copes with junk input", () => {
  for (const junk of [null, undefined, 42, "paid", []]) {
    const result = normaliseChannels(junk);
    assert.deepEqual(Object.keys(result).sort(), ["email", "organic", "paid", "sms"]);
  }
});

test("editor name is required and bounded", () => {
  assert.equal(validateEditorName("  Cole  "), "Cole");
  assert.equal(validateEditorName("x".repeat(60)).length, 40);

  for (const bad of ["", "   ", null, undefined, 7]) {
    assert.throws(() => validateEditorName(bad), ValidationError);
  }
});
