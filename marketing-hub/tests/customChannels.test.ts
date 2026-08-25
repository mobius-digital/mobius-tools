import { test } from "node:test";
import assert from "node:assert/strict";

import { channelFilters, elevationFor, filterByChannel, isChannelFilter } from "../lib/channels.ts";
import { hasPrimaryChannel } from "../lib/calendar.ts";
import { diffEvents } from "../lib/changelog.ts";
import { involvedChannels, planForChange, planForCreation } from "../lib/slackPlan.ts";
import { buildEventMessage } from "../lib/slackMessage.ts";
import { normaliseChannels, validateEventInput } from "../lib/validation.ts";
import {
  emptyChannels,
  hydrateChannels,
  type ChannelOption,
  type Channels,
  type LaunchEvent,
} from "../lib/types.ts";

/**
 * A board that has added "Affiliate" and "Retail" to the built-in four.
 *
 * Every test here uses a channel that did not exist when the app was written,
 * because that is the whole point: nothing may still assume the fixed four.
 */
const BOARD: ChannelOption[] = [
  { key: "paid", label: "Paid" },
  { key: "email", label: "Email" },
  { key: "organic", label: "Organic" },
  { key: "sms", label: "SMS" },
  { key: "affiliate", label: "Affiliate" },
  { key: "retail", label: "Retail" },
];
const KEYS = BOARD.map((option) => option.key);
const label = (key: string) => BOARD.find((option) => option.key === key)?.label ?? key;

function channels(spec: Record<string, string>): Channels {
  const result = emptyChannels(KEYS);
  for (const [key, priority] of Object.entries(spec)) {
    result[key] = { involved: true, priority: priority as "primary" | "supporting" | "fyi" };
  }
  return result;
}

function makeEvent(overrides: Partial<LaunchEvent> = {}): LaunchEvent {
  return {
    id: "event-1",
    name: "Retail Partner Drop",
    type: "product_launch",
    status: "confirmed",
    brief: "",
    launch_date: "2026-09-10",
    promo_end_date: null,
    inventory_date: null,
    asset_deadline: null,
    teaser_start: null,
    channels: channels({ affiliate: "primary", paid: "supporting" }),
    owner: "Dana",
    notes: null,
    assets_link: null,
    created_at: "",
    updated_at: "",
    updated_by: "",
    ...overrides,
  };
}

/* ---------------- shape ---------------- */

test("emptyChannels builds one uninvolved entry per key, in order", () => {
  const empty = emptyChannels(KEYS);
  assert.deepEqual(Object.keys(empty), KEYS);
  assert.deepEqual(empty.affiliate, { involved: false, priority: null });
});

test("normaliseChannels keeps configured keys, drops unknown ones, in configured order", () => {
  const result = normaliseChannels(
    { retail: { involved: true, priority: "primary" }, ghost: { involved: true, priority: "primary" }, paid: {} },
    KEYS,
  );
  assert.deepEqual(Object.keys(result), KEYS);
  assert.equal(result.retail.involved, true);
  assert.equal("ghost" in result, false);
});

test("hydrateChannels fills a channel added after the event was saved", () => {
  // Saved when the board had four channels; read after Affiliate was added.
  const four = emptyChannels(["paid", "email", "organic", "sms"]);
  four.paid = { involved: true, priority: "primary" };

  const hydrated = hydrateChannels(four, KEYS);
  assert.deepEqual(Object.keys(hydrated), KEYS);
  assert.deepEqual(hydrated.affiliate, { involved: false, priority: null });
  assert.equal(hydrated.paid.involved, true);
});

test("hydrateChannels drops a channel the board has since removed", () => {
  const stale = { ...emptyChannels(KEYS), fax: { involved: false, priority: null } };
  assert.equal("fax" in hydrateChannels(stale, KEYS), false);
});

/* ---------------- validation ---------------- */

test("an event can involve only a custom channel", () => {
  const input = validateEventInput(
    {
      name: "Retail Partner Drop",
      type: "product_launch",
      status: "confirmed",
      launch_date: "2026-09-10",
      owner: "Dana",
      channels: { affiliate: { involved: true, priority: "primary" } },
    },
    ["product_launch"],
    BOARD,
  );
  assert.equal(input.channels.affiliate.involved, true);
  assert.deepEqual(Object.keys(input.channels), KEYS);
});

test("a missing priority names the custom channel by its label", () => {
  try {
    validateEventInput(
      {
        name: "X",
        type: "product_launch",
        status: "confirmed",
        launch_date: "2026-09-10",
        owner: "Dana",
        channels: { retail: { involved: true, priority: null } },
      },
      ["product_launch"],
      BOARD,
    );
    assert.fail("should have thrown");
  } catch (error) {
    assert.match(String((error as { fieldErrors: { channels: string } }).fieldErrors.channels), /Retail/);
  }
});

/* ---------------- the lens ---------------- */

test("the filter bar offers every configured channel", () => {
  assert.deepEqual(channelFilters(KEYS), ["all", ...KEYS]);
});

test("a custom channel is a valid filter, and a removed one is not", () => {
  assert.equal(isChannelFilter("affiliate", KEYS), true);
  assert.equal(isChannelFilter("fax", KEYS), false);
  assert.equal(isChannelFilter("all", KEYS), true);
});

test("filtering by a custom channel finds the events that involve it", () => {
  const events = [
    makeEvent({ id: "a" }),
    makeEvent({ id: "b", channels: channels({ paid: "primary" }) }),
  ];
  assert.deepEqual(filterByChannel(events, "affiliate").map((e) => e.id), ["a"]);
});

test("filtering copes with an event that predates the channel", () => {
  const old = makeEvent({ id: "old", channels: emptyChannels(["paid"]) });
  assert.deepEqual(filterByChannel([old], "affiliate"), []);
  assert.equal(elevationFor(old, "affiliate"), "none");
});

test("a custom channel marked primary counts toward clash warnings", () => {
  assert.equal(hasPrimaryChannel(makeEvent()), true);
  assert.equal(hasPrimaryChannel(makeEvent({ channels: channels({ retail: "fyi" }) })), false);
});

/* ---------------- history ---------------- */

test("the changelog names a custom channel by its label", () => {
  const before = makeEvent({ channels: channels({ paid: "primary" }) });
  const after = makeEvent({ channels: channels({ paid: "primary", retail: "supporting" }) });

  assert.deepEqual(diffEvents(before, after, label), ["Retail added (supporting)"]);
});

test("the changelog still describes a channel the board later removed", () => {
  const before = makeEvent({ channels: { ...emptyChannels(KEYS), fax: { involved: true, priority: "fyi" } } });
  const after = makeEvent({ channels: emptyChannels(KEYS) });

  assert.deepEqual(diffEvents(before, after, label), ["fax removed"]);
});

/* ---------------- Slack ---------------- */

test("Slack plans reach a custom channel like any other", () => {
  assert.deepEqual(involvedChannels(makeEvent()), ["paid", "affiliate"]);
  assert.deepEqual(planForCreation(makeEvent())[0].targets, ["paid", "affiliate"]);

  const plan = planForChange(
    makeEvent({ channels: channels({ paid: "primary" }) }),
    makeEvent({ channels: channels({ paid: "primary", retail: "fyi" }) }),
    [],
  );
  assert.deepEqual(plan[0].targets, ["retail"]);
});

test("Slack messages use the configured label for a custom channel", () => {
  const message = buildEventMessage(
    { kind: "added", event: makeEvent({ channels: channels({ retail: "fyi", paid: "primary" }) }), lines: [], actor: "Cole" },
    { channelKey: "retail", boardUrl: "", typeLabel: (k: string) => k, channelLabel: label },
  );
  assert.equal(message.text, "Retail is now on Retail Partner Drop");
  assert.ok(JSON.stringify(message.attachments).includes("Also: Paid (primary)"));
});

test("Slack messages fall back to the key when no labeller is given", () => {
  const message = buildEventMessage(
    { kind: "added", event: makeEvent(), lines: [], actor: "Cole" },
    { channelKey: "affiliate", boardUrl: "", typeLabel: (k: string) => k },
  );
  assert.equal(message.text, "affiliate is now on Retail Partner Drop");
});
