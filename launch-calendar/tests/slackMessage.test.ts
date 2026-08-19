import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildEventMessage,
  buildReminderMessage,
  buildTestMessage,
  type NotifyItem,
} from "../lib/slackMessage.ts";
import { brand } from "../brand.config.ts";
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
    status: "confirmed",
    brief: "Limited run of 200, one weekend only.",
    launch_date: "2026-08-27",
    promo_end_date: null,
    inventory_date: "2026-08-15",
    asset_deadline: "2026-08-18",
    teaser_start: "2026-08-20",
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

function item(overrides: Partial<NotifyItem> = {}): NotifyItem {
  return { kind: "changed", event: makeEvent(), lines: [], actor: "Cole", ...overrides };
}

const OPTIONS = {
  channelKey: "paid" as const,
  boardUrl: "https://launch-calendar.example.workers.dev",
  typeLabel: (key: string) => (key === "product_launch" ? "Product Launch" : key),
};

/** Everything rendered, flattened, so assertions can be about what is said. */
function textOf(message: { attachments: unknown[] }): string {
  return JSON.stringify(message.attachments);
}

function blocksOf(message: { attachments: unknown[] }): unknown[] {
  return (message.attachments[0] as { blocks: unknown[] }).blocks;
}

/**
 * Slack folds an attachment taller than about five blocks behind "Show more",
 * which once hid a brand-new event. Nothing here may come near that.
 */
const MAX_BLOCKS = 4;

test("a single change reads as a notice", () => {
  const message = buildEventMessage(item({ lines: ["Launch date moved Aug 12 → Aug 27"] }), OPTIONS);

  assert.equal(message.text, "Date moved: Fall Apparel Drop — Launch date moved Aug 12 → Aug 27");
  assert.ok(textOf(message).includes("Launch date moved Aug 12 → Aug 27"));
});

test("the change lines sit directly under the title, in the same block", () => {
  const message = buildEventMessage(
    item({ lines: ["Launch date moved Aug 12 → Aug 27", "Status changed: tentative → confirmed"] }),
    OPTIONS,
  );
  const first = blocksOf(message)[0] as { text: { text: string } };
  assert.ok(first.text.text.startsWith("📅 *Date moved — Fall Apparel Drop*"));
  assert.ok(first.text.text.includes("• Launch date moved Aug 12 → Aug 27"));
  assert.ok(first.text.text.includes("• Status changed: tentative → confirmed"));
});

test("no message — however full the event — can reach Slack's fold", () => {
  // Everything set: brief, all four run-up dates, assets, three change lines,
  // other channels. This is the tallest a card can get.
  const full = makeEvent({
    promo_end_date: "2026-09-05",
    assets_link: "https://drive.google.com/drive/folders/abc",
    notes: "Customs is running slow on the first container; the date may slip a week. Do not promote before the PR embargo lifts.",
    channels: channels({ paid: "primary", email: "supporting", organic: "fyi", sms: "fyi" }),
  });
  const message = buildEventMessage(
    item({ event: full, lines: ["Launch date moved Aug 12 → Aug 27", "Status: …", "Asset deadline moved …"] }),
    OPTIONS,
  );
  assert.ok(blocksOf(message).length <= MAX_BLOCKS, `got ${blocksOf(message).length} blocks`);

  const reminder = buildReminderMessage(full, "week", OPTIONS);
  assert.ok(blocksOf(reminder).length <= MAX_BLOCKS);

  const created = buildEventMessage(item({ kind: "created", event: full }), OPTIONS);
  assert.ok(blocksOf(created).length <= MAX_BLOCKS);
});

test("there is no digest: one item in, one event out", () => {
  // The batch window merges edits to the same event; it never merges events.
  const message = buildEventMessage(item({ kind: "created" }), OPTIONS);
  assert.ok(!textOf(message).includes("updates for"));
  assert.ok(!textOf(message).includes('"divider"'));
});

test("the launch date carries its weekday, and the run-up dates come with it", () => {
  const body = textOf(buildEventMessage(item({ kind: "created" }), OPTIONS));

  assert.ok(body.includes("Goes live Thu Aug 27"));
  assert.ok(body.includes("Teaser Aug 20"));
  assert.ok(body.includes("Assets due Aug 18"));
  assert.ok(body.includes("Inventory Aug 15"));
  assert.ok(body.includes("Owner: Dana"));
  assert.ok(body.includes("You're primary on this"));
  assert.ok(body.includes("Email (supporting)"));
});

test("the link opens the event, through the reader's own channel lens", () => {
  const body = textOf(buildEventMessage(item(), OPTIONS));
  assert.ok(body.includes(`${OPTIONS.boardUrl}/?channel=paid&event=event-1`));
});

test("a board with no known address still sends a usable message", () => {
  // The URL is captured from a real visit; a board that has never been opened
  // since Slack was configured should still notify, just without the link.
  const message = buildEventMessage(item(), { ...OPTIONS, boardUrl: "" });
  assert.ok(!textOf(message).includes("Open in Launch Calendar"));
  assert.ok(textOf(message).includes("Fall Apparel Drop"));
});

test("names with Slack's reserved characters survive intact", () => {
  const message = buildEventMessage(item({ event: makeEvent({ name: "Buy 1 & Get 1 <Members Only>" }) }), OPTIONS,
  );

  const body = textOf(message);
  assert.ok(body.includes("Buy 1 &amp; Get 1 &lt;Members Only&gt;"));
  // The preview line is plain text, so it is not escaped there.
  assert.ok(message.text.includes("Buy 1 & Get 1 <Members Only>"));
});

test("an at-risk launch is coloured differently from good news", () => {
  const healthy = buildEventMessage(item({ kind: "created" }), OPTIONS);
  const risky = buildEventMessage(item({ event: makeEvent({ status: "at_risk" }), lines: ["Status: …"] }), OPTIONS,
  );

  assert.equal((healthy.attachments[0] as { color: string }).color, brand.colors.primary);
  assert.equal((risky.attachments[0] as { color: string }).color, brand.colors.danger);
});

test("a long brief is trimmed rather than filling the channel", () => {
  const message = buildEventMessage(item({ kind: "created", event: makeEvent({ brief: "word ".repeat(200) }) }), OPTIONS,
  );

  assert.ok(textOf(message).includes("…"));
  assert.ok(textOf(message).length < 4000);
});


test("a newly added channel is told the event is now theirs", () => {
  const message = buildEventMessage(item({ kind: "added" }), { ...OPTIONS, channelKey: "sms" });

  assert.equal(message.text, "SMS is now on Fall Apparel Drop");
  assert.ok(textOf(message).includes("SMS is now on Fall Apparel Drop"));
});

test("the one-week reminder says what it is and when", () => {
  const message = buildReminderMessage(makeEvent(), "week", OPTIONS);

  assert.equal(message.text, "One week out: Fall Apparel Drop goes live Thu Aug 27");
  assert.ok(textOf(message).includes("One week out"));
  assert.ok(textOf(message).includes("Assets due Aug 18"));
});

test("the day-before reminder reads as tomorrow, not as a week", () => {
  const message = buildReminderMessage(makeEvent(), "day", OPTIONS);

  assert.equal(message.text, "Live tomorrow: Fall Apparel Drop");
  assert.ok(textOf(message).includes("Live tomorrow"));
});

test("the test message names the channel it landed in", () => {
  const message = buildTestMessage(OPTIONS.boardUrl);

  assert.equal(message.text, `${brand.productName} is connected to this channel.`);
  assert.ok(textOf(message).includes("connected to this channel"));
});

/* ---------------------------------------------------------------- */
/*  The reader's role, and the assets button                         */
/* ---------------------------------------------------------------- */

test("the message leads with the reader's own role", () => {
  const paid = textOf(buildEventMessage(item({ kind: "created" }), OPTIONS));
  const email = textOf(
    buildEventMessage(item({ kind: "created" }), { ...OPTIONS, channelKey: "email" }),
  );

  assert.ok(paid.includes("You're primary on this"));
  assert.ok(email.includes("You're supporting on this"));
});

test("an FYI channel is told plainly that there is nothing to build", () => {
  const event = makeEvent({ channels: channels({ paid: "primary", sms: "fyi" }) });
  const body = textOf(
    buildEventMessage(item({ kind: "created", event }), { ...OPTIONS, channelKey: "sms" }),
  );

  assert.ok(body.includes("FYI only"));
  assert.ok(body.includes("nothing to build"));
});

test("everybody else on the event is listed as 'Also', without repeating the reader", () => {
  const body = textOf(buildEventMessage(item({ kind: "created" }), OPTIONS));

  assert.ok(body.includes("Also: Email (supporting)"));
  assert.ok(!body.includes("Also: Paid"));
});

test("an assets notice carries a button to the folder", () => {
  const event = makeEvent({ assets_link: "https://drive.google.com/drive/folders/abc" });
  const message = buildEventMessage(item({ kind: "assets", event }), OPTIONS);

  assert.equal(message.text, "Assets are in: Fall Apparel Drop");
  const body = textOf(message);
  assert.ok(body.includes("Assets are in"));
  assert.ok(body.includes('"type":"button"'));
  assert.ok(body.includes("Open assets"));
  assert.ok(body.includes("https://drive.google.com/drive/folders/abc"));
});

test("an event with assets shows the button on every later message, including reminders", () => {
  const event = makeEvent({ assets_link: "https://drive.google.com/x" });

  const change = textOf(buildEventMessage(item({ event, lines: ["Status: …"] }), OPTIONS));
  const reminder = textOf(buildReminderMessage(event, "week", OPTIONS));

  assert.ok(change.includes("Open assets"));
  assert.ok(reminder.includes("Open assets"));
});

test("an event without assets shows no button", () => {
  const body = textOf(buildEventMessage(item({ kind: "created" }), OPTIONS));
  assert.ok(!body.includes("Open assets"));
});

/* ---------------------------------------------------------------- */
/*  Titles say what happened                                          */
/* ---------------------------------------------------------------- */

function titleOf(message: { attachments: unknown[] }): string {
  const [firstLine] = (blocksOf(message)[0] as { text: { text: string } }).text.text.split(/\r?\n/);
  return firstLine;
}

test("a new event is named by its type, not called a launch regardless", () => {
  const promo = buildEventMessage(item({ kind: "created", event: makeEvent({ type: "promo" }) }), {
    ...OPTIONS,
    typeLabel: () => "Promo",
  });
  assert.equal(titleOf(promo), "🚀 *New promo — Fall Apparel Drop*");
  assert.equal(promo.text, "New promo: Fall Apparel Drop");

  const custom = buildEventMessage(item({ kind: "created", event: makeEvent({ type: "tour_drop" }) }), {
    ...OPTIONS,
    typeLabel: () => "Tour Drop",
  });
  assert.equal(titleOf(custom), "🚀 *New tour drop — Fall Apparel Drop*");

  const acronym = buildEventMessage(item({ kind: "created", event: makeEvent({ type: "sms_blast" }) }), {
    ...OPTIONS,
    typeLabel: () => "SMS Blast",
  });
  assert.equal(titleOf(acronym), "🚀 *New SMS blast — Fall Apparel Drop*");
});

test("every change message says what kind of change it is", () => {
  assert.equal(
    titleOf(buildEventMessage(item({ lines: ["Status changed: tentative → confirmed"] }), OPTIONS)),
    "✏️ *Updated — Fall Apparel Drop*",
  );
  assert.equal(
    titleOf(buildEventMessage(item({ lines: ["Launch date moved Aug 12 → Aug 27"] }), OPTIONS)),
    "📅 *Date moved — Fall Apparel Drop*",
  );
  assert.equal(
    titleOf(buildEventMessage(item({ lines: ["Status changed: confirmed → at risk"] }), OPTIONS)),
    "⚠️ *At risk — Fall Apparel Drop*",
  );
  assert.equal(
    titleOf(buildEventMessage(item({ lines: ["Event cancelled"] }), OPTIONS)),
    "🚫 *Cancelled — Fall Apparel Drop*",
  );
});

test("a cancellation is not bulleted under a title that already says Cancelled", () => {
  const alone = buildEventMessage(item({ lines: ["Event cancelled"] }), OPTIONS);
  const first = (blocksOf(alone)[0] as { text: { text: string } }).text.text;
  assert.ok(!first.includes(String.fromCharCode(10)), "title only, no redundant bullet");

  // Other lines still ride along; only the cancellation bullet is dropped.
  const withDate = buildEventMessage(
    item({ lines: ["Launch date moved Aug 12 → Aug 27", "Event cancelled"] }),
    OPTIONS,
  );
  const text = (blocksOf(withDate)[0] as { text: { text: string } }).text.text;
  assert.match(text, /• Launch date moved/);
  assert.doesNotMatch(text, /Event cancelled/);
});

test("when several things changed, the title is the one that matters most", () => {
  // A cancelled event also had its date moved: cancelled wins the headline.
  const both = buildEventMessage(
    item({ lines: ["Launch date moved Aug 12 → Aug 27", "Event cancelled"] }),
    OPTIONS,
  );
  assert.equal(titleOf(both), "🚫 *Cancelled — Fall Apparel Drop*");

  // At risk beats a date move.
  const risk = buildEventMessage(
    item({ lines: ["Launch date moved Aug 12 → Aug 27", "Status changed: confirmed → at risk"] }),
    OPTIONS,
  );
  assert.equal(titleOf(risk), "⚠️ *At risk — Fall Apparel Drop*");
});

test("the product name on the link follows brand.config", () => {
  const body = textOf(buildEventMessage(item(), OPTIONS));
  assert.ok(body.includes(`Open in ${brand.productName} →`));
});

/* ---------------------------------------------------------------- */
/*  Notes travel with the event                                      */
/* ---------------------------------------------------------------- */

test("the note rides along on every message about the event", () => {
  const event = makeEvent({ notes: "Customs is slow — date may slip a week." });

  const change = buildEventMessage(item({ event, lines: ["Status changed: confirmed → tentative"] }), OPTIONS);
  const created = buildEventMessage(item({ kind: "created", event }), OPTIONS);
  const reminder = buildReminderMessage(event, "week", OPTIONS);

  for (const message of [change, created, reminder]) {
    assert.ok(textOf(message).includes("Note: Customs is slow — date may slip a week."));
  }
});

test("a long note is trimmed to one line, and a missing note adds nothing", () => {
  const long = buildEventMessage(item({ event: makeEvent({ notes: "word ".repeat(120) }) }), OPTIONS);
  assert.ok(textOf(long).includes("Note:"));
  assert.ok(textOf(long).includes("…"));

  const none = buildEventMessage(item({ event: makeEvent({ notes: null }) }), OPTIONS);
  assert.ok(!textOf(none).includes("Note:"));
});

test("the note sits in the details block, not a block of its own", () => {
  const message = buildEventMessage(item({ event: makeEvent({ notes: "Embargo lifts on the 12th." }) }), OPTIONS);
  assert.ok(blocksOf(message).length <= MAX_BLOCKS);
  const details = blocksOf(message)[1] as { elements: { text: string }[] };
  assert.ok(details.elements[0].text.includes("Note: Embargo lifts on the 12th."));
});

test("a note-only change gets its own title; with a date move the date leads", () => {
  const noteOnly = buildEventMessage(
    item({ event: makeEvent({ notes: "Embargo lifted — go." }), lines: ["Note updated"] }),
    OPTIONS,
  );
  assert.equal(titleOf(noteOnly), "📝 *Note updated — Fall Apparel Drop*");
  assert.ok(textOf(noteOnly).includes("Note updated: Embargo lifted — go."));
  // No bullet repeating what the title and the note line already say.
  assert.ok(!textOf(noteOnly).includes("• Note updated"));

  const firstNote = buildEventMessage(
    item({ event: makeEvent({ notes: "Embargo lifted — go." }), lines: ["Note added"] }),
    OPTIONS,
  );
  assert.equal(titleOf(firstNote), "📝 *Note added — Fall Apparel Drop*");
  assert.ok(textOf(firstNote).includes("New note: Embargo lifted — go."));
  assert.ok(!textOf(firstNote).includes("• Note added"));

  const withDate = buildEventMessage(
    item({ event: makeEvent({ notes: "Customs is slow." }), lines: ["Launch date moved Aug 12 → Aug 27", "Note updated"] }),
    OPTIONS,
  );
  assert.equal(titleOf(withDate), "📅 *Date moved — Fall Apparel Drop*");
  // The date is bulleted; the note change is shown on the note line instead.
  assert.ok(textOf(withDate).includes("• Launch date moved Aug 12 → Aug 27"));
  assert.ok(!textOf(withDate).includes("• Note updated"));
  assert.ok(textOf(withDate).includes("Note updated: Customs is slow."));

  const withStatus = buildEventMessage(
    item({ event: makeEvent({ notes: "Customs is slow." }), lines: ["Status changed: confirmed → tentative", "Note updated"] }),
    OPTIONS,
  );
  assert.equal(titleOf(withStatus), "✏️ *Updated — Fall Apparel Drop*");
});
