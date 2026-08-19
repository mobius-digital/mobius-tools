import { test } from "node:test";
import assert from "node:assert/strict";

import {
  WINDOW_MS,
  foldItem,
  involvedChannels,
  nextDueAt,
  planForChange,
  planForCreation,
} from "../lib/slackPlan.ts";
import type { NotifyItem } from "../lib/slackMessage.ts";
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
    channels: channels({ paid: "primary", email: "supporting" }),
    owner: "Dana",
    notes: null,
    assets_link: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-27T00:00:00Z",
    updated_by: "Cole",
    ...overrides,
  };
}

test("a new event is news to every channel it involves", () => {
  const plan = planForCreation(makeEvent());

  assert.equal(plan.length, 1);
  assert.equal(plan[0].kind, "created");
  assert.deepEqual(plan[0].targets, ["paid", "email"]);
});

test("a new event involving nobody notifies nobody", () => {
  const plan = planForCreation(makeEvent({ channels: channels({}) }));
  assert.deepEqual(plan, []);
});

test("a moved launch date reaches every involved channel", () => {
  const before = makeEvent();
  const after = makeEvent({ launch_date: "2026-08-19" });

  const plan = planForChange(before, after, ["Launch date moved Aug 12 → Aug 19"]);

  assert.equal(plan.length, 1);
  assert.equal(plan[0].kind, "changed");
  assert.deepEqual(plan[0].targets, ["paid", "email"]);
  assert.deepEqual(plan[0].lines, ["Launch date moved Aug 12 → Aug 19"]);
});

test("a status change is news", () => {
  const plan = planForChange(makeEvent(), makeEvent({ status: "at_risk" }), ["Status: …"]);

  assert.equal(plan.length, 1);
  assert.equal(plan[0].kind, "changed");
});

test("a cancellation is news, so nobody keeps building for it", () => {
  const plan = planForChange(makeEvent(), makeEvent({ status: "cancelled" }), [
    "Event cancelled",
  ]);

  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0].lines, ["Event cancelled"]);
});

test("a reworded brief, a new owner or a moved asset deadline stay off Slack", () => {
  const before = makeEvent();
  const after = makeEvent({
    brief: "Rewritten",
    owner: "Sam",
    asset_deadline: "2026-08-01",
  });

  assert.deepEqual(planForChange(before, after, ["Asset deadline set: Aug 1"]), []);
});

test("the diff still carries every change, not only the triggering one", () => {
  // One save moved both dates. The launch date is what makes it news; the
  // asset deadline is what the reader also needs to know.
  const lines = ["Launch date moved Aug 12 → Aug 19", "Asset deadline set: Aug 1"];
  const plan = planForChange(
    makeEvent(),
    makeEvent({ launch_date: "2026-08-19", asset_deadline: "2026-08-01" }),
    lines,
  );

  assert.deepEqual(plan[0].lines, lines);
});

test("a channel added later hears about the event it missed", () => {
  const before = makeEvent({ channels: channels({ paid: "primary" }) });
  const after = makeEvent({ channels: channels({ paid: "primary", sms: "fyi" }) });

  const plan = planForChange(before, after, []);

  assert.equal(plan.length, 1);
  assert.equal(plan[0].kind, "added");
  assert.deepEqual(plan[0].targets, ["sms"]);
});

test("a newly added channel is told once, not twice in one batch", () => {
  const before = makeEvent({ channels: channels({ paid: "primary" }) });
  const after = makeEvent({
    launch_date: "2026-08-19",
    channels: channels({ paid: "primary", sms: "fyi" }),
  });

  const plan = planForChange(before, after, ["Launch date moved Aug 12 → Aug 19"]);

  assert.equal(plan.length, 2);

  const changed = plan.find((notice) => notice.kind === "changed");
  const added = plan.find((notice) => notice.kind === "added");

  // The date move goes to the channel that already knew the event…
  assert.deepEqual(changed?.targets, ["paid"]);
  // …and the new one gets the whole event instead.
  assert.deepEqual(added?.targets, ["sms"]);
});

test("a removed channel is not told anything", () => {
  const before = makeEvent({ channels: channels({ paid: "primary", sms: "fyi" }) });
  const after = makeEvent({
    launch_date: "2026-08-19",
    channels: channels({ paid: "primary" }),
  });

  const plan = planForChange(before, after, ["Launch date moved Aug 12 → Aug 19"]);
  assert.deepEqual(plan[0].targets, ["paid"]);
});

test("involvedChannels reads the channel map in a stable order", () => {
  const event = makeEvent({ channels: channels({ sms: "fyi", paid: "primary" }) });
  assert.deepEqual(involvedChannels(event), ["paid", "sms"]);
});

/* ---------------------------------------------------------------- */
/*  The batch window                                                 */
/* ---------------------------------------------------------------- */

test("the first change of a quiet morning opens a 15-minute window", () => {
  const now = new Date("2026-08-18T09:00:00.000Z");
  assert.equal(nextDueAt(null, now), "2026-08-18T09:15:00.000Z");
  assert.equal(WINDOW_MS, 15 * 60 * 1000);
});

test("later changes join the open window rather than pushing it back", () => {
  // The whole point: five edits between 09:00 and 09:14 go out at 09:15 as one
  // message. A debounce would move the deadline to 09:29 and keep moving it.
  const open = "2026-08-18T09:15:00.000Z";

  assert.equal(nextDueAt(open, new Date("2026-08-18T09:02:00.000Z")), open);
  assert.equal(nextDueAt(open, new Date("2026-08-18T09:14:59.000Z")), open);
});

test("a change after the window closed opens a fresh one", () => {
  const now = new Date("2026-08-18T09:20:00.000Z");
  assert.equal(nextDueAt(null, now), "2026-08-18T09:35:00.000Z");
});

/* ---------------------------------------------------------------- */
/*  Merging within one Slack channel                                 */
/* ---------------------------------------------------------------- */

function item(overrides: Partial<NotifyItem> = {}): NotifyItem {
  return { kind: "changed", event: makeEvent(), lines: [], actor: "Cole", ...overrides };
}

test("two marketing channels sharing one Slack room list the event once", () => {
  // Paid and Email both pointed at #marketing: one entry, not two.
  const items: NotifyItem[] = [];
  foldItem(items, item({ lines: ["Launch date moved Aug 12 → Aug 19"] }));
  foldItem(items, item({ lines: ["Launch date moved Aug 12 → Aug 19"] }));

  assert.equal(items.length, 1);
  assert.deepEqual(items[0].lines, ["Launch date moved Aug 12 → Aug 19"]);
});

test("separate edits to one event merge their change lines", () => {
  const items: NotifyItem[] = [];
  foldItem(items, item({ lines: ["Launch date moved Aug 12 → Aug 19"] }));
  foldItem(items, item({ lines: ["Status: tentative → confirmed"] }));

  assert.equal(items.length, 1);
  assert.deepEqual(items[0].lines, [
    "Launch date moved Aug 12 → Aug 19",
    "Status: tentative → confirmed",
  ]);
});

test("an event created and then edited in one window still reads as new", () => {
  const items: NotifyItem[] = [];
  foldItem(items, item({ kind: "changed", lines: ["Status: tentative → confirmed"] }));
  foldItem(items, item({ kind: "created" }));

  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "created");
});

test("folding does not mutate the item it was handed", () => {
  const source = item({ lines: ["Launch date moved Aug 12 → Aug 19"] });
  const items: NotifyItem[] = [];
  foldItem(items, source);
  foldItem(items, item({ lines: ["Status: tentative → confirmed"] }));

  assert.deepEqual(source.lines, ["Launch date moved Aug 12 → Aug 19"]);
});

test("different events stay as separate entries", () => {
  const items: NotifyItem[] = [];
  foldItem(items, item());
  foldItem(items, item({ event: makeEvent({ id: "event-2", name: "Winter Drop" }) }));

  assert.equal(items.length, 2);
});

/* ---------------------------------------------------------------- */
/*  Assets link                                                      */
/* ---------------------------------------------------------------- */

test("filling in the assets link is news to every channel on the event", () => {
  const plan = planForChange(
    makeEvent(),
    makeEvent({ assets_link: "https://drive.google.com/drive/folders/abc" }),
    ["Assets link added"],
  );

  assert.equal(plan.length, 1);
  assert.equal(plan[0].kind, "assets");
  assert.deepEqual(plan[0].targets, ["paid", "email"]);
});

test("changing the assets link to a new folder is news again", () => {
  const plan = planForChange(
    makeEvent({ assets_link: "https://drive.google.com/old" }),
    makeEvent({ assets_link: "https://drive.google.com/new" }),
    ["Assets link updated"],
  );

  assert.equal(plan.length, 1);
  assert.equal(plan[0].kind, "assets");
});

test("removing the assets link is not news — the assets did not un-arrive", () => {
  const plan = planForChange(
    makeEvent({ assets_link: "https://drive.google.com/old" }),
    makeEvent({ assets_link: null }),
    ["Assets link removed"],
  );

  assert.deepEqual(plan, []);
});

test("assets landing and a date move in one save are two notices, not one muddle", () => {
  const plan = planForChange(
    makeEvent(),
    makeEvent({ launch_date: "2026-08-19", assets_link: "https://drive.google.com/x" }),
    ["Launch date moved Aug 12 → Aug 19", "Assets link added"],
  );

  assert.deepEqual(
    plan.map((notice) => notice.kind),
    ["changed", "assets"],
  );
});

test("a channel added in the same save as the assets link is told once, via its own notice", () => {
  const before = makeEvent({ channels: channels({ paid: "primary" }) });
  const after = makeEvent({
    channels: channels({ paid: "primary", sms: "fyi" }),
    assets_link: "https://drive.google.com/x",
  });

  const plan = planForChange(before, after, ["Assets link added"]);
  const assets = plan.find((notice) => notice.kind === "assets");
  const added = plan.find((notice) => notice.kind === "added");

  assert.deepEqual(assets?.targets, ["paid"]);
  assert.deepEqual(added?.targets, ["sms"]);
});

test("assets news outranks a date change in the same batch, but not creation", () => {
  const items: NotifyItem[] = [];
  foldItem(items, item({ kind: "changed", lines: ["Status: tentative → confirmed"] }));
  foldItem(items, item({ kind: "assets" }));
  assert.equal(items[0].kind, "assets");

  foldItem(items, item({ kind: "created" }));
  assert.equal(items[0].kind, "created");
});

/* ---------------------------------------------------------------- */
/*  Notes                                                            */
/* ---------------------------------------------------------------- */

test("writing or rewriting the note is news to every channel on the event", () => {
  const added = planForChange(makeEvent(), makeEvent({ notes: "Embargo lifted — go." }), ["Note added"]);
  assert.equal(added.length, 1);
  assert.equal(added[0].kind, "changed");
  assert.deepEqual(added[0].targets, ["paid", "email"]);

  const rewritten = planForChange(
    makeEvent({ notes: "Customs is slow." }),
    makeEvent({ notes: "Customs cleared — date holds." }),
    ["Note updated"],
  );
  assert.equal(rewritten.length, 1);
});

test("clearing the note, or only re-spacing it, sends nothing", () => {
  assert.deepEqual(planForChange(makeEvent({ notes: "x" }), makeEvent({ notes: null }), ["Note removed"]), []);
  assert.deepEqual(planForChange(makeEvent({ notes: "a  b" }), makeEvent({ notes: " a b " }), []), []);
});
