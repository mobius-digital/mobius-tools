import { test } from "node:test";
import assert from "node:assert/strict";

import {
  addDays,
  addMonths,
  compareIso,
  daysSince,
  diffDays,
  endOfMonth,
  formatRange,
  horizonEnd,
  isBetween,
  isValidIso,
  monthGrid,
  quarterOf,
  relativeTime,
  startOfWeek,
  todayIso,
  weekBuckets,
  weekdayIndex,
} from "../lib/dates.ts";

test("addDays crosses month and year boundaries", () => {
  assert.equal(addDays("2026-07-31", 1), "2026-08-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29", "2028 is a leap year");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01", "2026 is not");
});

test("addDays is stable across a DST transition", () => {
  // US DST begins 2026-03-08. Naive local-midnight arithmetic drifts here.
  assert.equal(addDays("2026-03-07", 1), "2026-03-08");
  assert.equal(addDays("2026-03-08", 1), "2026-03-09");
  assert.equal(diffDays("2026-03-01", "2026-03-31"), 30);
  // And the southern-hemisphere direction, where clocks go back.
  assert.equal(addDays("2026-11-01", 1), "2026-11-02");
  assert.equal(diffDays("2026-10-25", "2026-11-08"), 14);
});

test("diffDays is signed and symmetric", () => {
  assert.equal(diffDays("2026-07-27", "2026-08-03"), 7);
  assert.equal(diffDays("2026-08-03", "2026-07-27"), -7);
  assert.equal(diffDays("2026-07-27", "2026-07-27"), 0);
});

test("weekdayIndex treats Monday as the start of the week", () => {
  assert.equal(weekdayIndex("2026-07-27"), 0, "Monday");
  assert.equal(weekdayIndex("2026-08-01"), 5, "Saturday");
  assert.equal(weekdayIndex("2026-08-02"), 6, "Sunday");
});

test("startOfWeek snaps back to Monday, including from a Sunday", () => {
  assert.equal(startOfWeek("2026-07-27"), "2026-07-27", "already Monday");
  assert.equal(startOfWeek("2026-07-30"), "2026-07-27", "Thursday");
  assert.equal(
    startOfWeek("2026-08-02"),
    "2026-07-27",
    "Sunday belongs to the week that began six days earlier",
  );
});

test("weekBuckets produces four Monday-aligned weeks across a month boundary", () => {
  const buckets = weekBuckets("2026-07-30"); // a Thursday

  assert.equal(buckets.length, 4);
  assert.deepEqual(
    buckets.map((bucket) => bucket.label),
    ["This Week", "Week 2", "Week 3", "Week 4"],
  );
  assert.deepEqual(
    buckets.map((bucket) => bucket.start),
    ["2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17"],
  );
  assert.deepEqual(
    buckets.map((bucket) => bucket.end),
    ["2026-08-02", "2026-08-09", "2026-08-16", "2026-08-23"],
  );
  assert.equal(buckets[0].rangeLabel, "Jul 27 – Aug 2");

  // Buckets must tile without gaps or overlaps.
  for (let i = 1; i < buckets.length; i += 1) {
    assert.equal(addDays(buckets[i - 1].end, 1), buckets[i].start);
    assert.equal(diffDays(buckets[i].start, buckets[i].end), 6);
  }
});

test("horizonEnd is the last day of the fourth week", () => {
  assert.equal(horizonEnd("2026-07-30"), "2026-08-23");
  assert.equal(horizonEnd("2026-07-27"), "2026-08-23");
  assert.equal(
    horizonEnd("2026-08-02"),
    "2026-08-23",
    "Sunday sits in the same window as the Monday before it",
  );
});

test("endOfMonth handles February in leap and common years", () => {
  assert.equal(endOfMonth("2026-02-10"), "2026-02-28");
  assert.equal(endOfMonth("2028-02-10"), "2028-02-29");
  assert.equal(endOfMonth("2026-07-01"), "2026-07-31");
  assert.equal(endOfMonth("2026-12-25"), "2026-12-31");
});

test("addMonths clamps rather than rolling into the next month", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-08-15", -1), "2026-07-15");
  assert.equal(addMonths("2026-12-15", 1), "2027-01-15");
  assert.equal(addMonths("2026-01-15", -1), "2025-12-15");
  assert.equal(addMonths("2026-05-31", 3), "2026-08-31");
});

test("monthGrid covers the month in whole Monday-aligned weeks", () => {
  const grid = monthGrid("2026-08-15");

  assert.ok(grid.length >= 4 && grid.length <= 6);
  for (const week of grid) {
    assert.equal(week.length, 7);
    assert.equal(weekdayIndex(week[0]), 0, "each row starts on a Monday");
  }

  const flat = grid.flat();
  assert.ok(flat.includes("2026-08-01"), "includes the first of the month");
  assert.ok(flat.includes("2026-08-31"), "includes the last of the month");
  assert.equal(flat[0], "2026-07-27", "leads in with the trailing July days");

  // Consecutive days throughout, with no repeats.
  for (let i = 1; i < flat.length; i += 1) {
    assert.equal(addDays(flat[i - 1], 1), flat[i]);
  }
  assert.equal(new Set(flat).size, flat.length);
});

test("monthGrid handles a month that starts on a Sunday", () => {
  // 2026-11-01 is a Sunday, the worst case for Monday-aligned grids.
  const grid = monthGrid("2026-11-01");
  assert.equal(grid[0][0], "2026-10-26");
  assert.ok(grid.flat().includes("2026-11-30"));
});

test("isValidIso rejects malformed and impossible dates", () => {
  assert.equal(isValidIso("2026-07-27"), true);
  assert.equal(isValidIso("2026-02-31"), false, "rolls over, so not a real day");
  assert.equal(isValidIso("2026-13-01"), false);
  assert.equal(isValidIso("2026-7-1"), false, "unpadded");
  assert.equal(isValidIso(""), false);
  assert.equal(isValidIso(null), false);
  assert.equal(isValidIso(undefined), false);
  assert.equal(isValidIso("2028-02-29"), true, "leap day is real");
});

test("todayIso reads the local calendar day, not the UTC one", () => {
  // Late-evening local time is the following day in UTC for negative offsets
  // and the same day for positive ones; either way todayIso must say the 27th.
  const lateEvening = new Date(2026, 6, 27, 23, 30, 0);
  assert.equal(todayIso(lateEvening), "2026-07-27");

  const earlyMorning = new Date(2026, 6, 27, 0, 15, 0);
  assert.equal(todayIso(earlyMorning), "2026-07-27");

  const newYearsEve = new Date(2026, 11, 31, 22, 0, 0);
  assert.equal(todayIso(newYearsEve), "2026-12-31");
});

test("comparison and range helpers", () => {
  assert.equal(compareIso("2026-07-01", "2026-07-02"), -1);
  assert.equal(compareIso("2026-07-02", "2026-07-01"), 1);
  assert.equal(compareIso("2026-07-01", "2026-07-01"), 0);

  assert.equal(isBetween("2026-07-15", "2026-07-01", "2026-07-31"), true);
  assert.equal(isBetween("2026-07-01", "2026-07-01", "2026-07-31"), true);
  assert.equal(isBetween("2026-07-31", "2026-07-01", "2026-07-31"), true);
  assert.equal(isBetween("2026-08-01", "2026-07-01", "2026-07-31"), false);
});

test("quarterOf maps months to quarters", () => {
  assert.equal(quarterOf("2026-01-15"), 1);
  assert.equal(quarterOf("2026-03-31"), 1);
  assert.equal(quarterOf("2026-04-01"), 2);
  assert.equal(quarterOf("2026-09-30"), 3);
  assert.equal(quarterOf("2026-10-01"), 4);
});

test("formatRange renders a readable week label", () => {
  assert.equal(formatRange("2026-07-27", "2026-08-02"), "Jul 27 – Aug 2");
  assert.equal(formatRange("2026-08-03", "2026-08-09"), "Aug 3 – Aug 9");
});

test("relativeTime and daysSince describe elapsed time", () => {
  const now = new Date("2026-07-27T12:00:00Z");

  assert.equal(relativeTime("2026-07-27T11:59:30Z", now), "just now");
  assert.equal(relativeTime("2026-07-27T11:30:00Z", now), "30m ago");
  assert.equal(relativeTime("2026-07-27T09:00:00Z", now), "3h ago");
  assert.equal(relativeTime("2026-07-25T12:00:00Z", now), "2d ago");
  assert.equal(relativeTime("2026-05-27T12:00:00Z", now), "2mo ago");

  assert.equal(daysSince("2026-07-06T12:00:00Z", now), 21);
  assert.equal(daysSince("2026-07-27T12:00:00Z", now), 0);
});
