import type { IsoDate } from "./types";

/**
 * Calendar-date arithmetic on `YYYY-MM-DD` strings.
 *
 * Every function here parses to UTC and formats back to a string. A `Date`
 * built from `new Date("2026-08-12")` is midnight UTC, which is 8pm the
 * previous day in New York — enough to shift a launch into the wrong week for
 * every user west of Greenwich. Nothing in this module ever constructs a local
 * `Date` from an ISO string, and nothing outside it does date maths at all.
 *
 * The one deliberate exception is `todayIso`, which must read the viewer's
 * local calendar day to answer "what is this week for me".
 */

const MS_PER_DAY = 86_400_000;

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MONTH_NAMES_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIso(value: string | null | undefined): value is IsoDate {
  if (!value || !ISO_PATTERN.test(value)) return false;
  // Reject impossible dates such as 2026-02-31, which would otherwise roll over.
  return toIso(toUtcMs(value)) === value;
}

function toUtcMs(iso: IsoDate): number {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return Date.UTC(year, month - 1, day);
}

function toIso(ms: number): IsoDate {
  const date = new Date(ms);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The viewer's local calendar day, as an ISO string. */
export function todayIso(now: Date = new Date()): IsoDate {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return toIso(toUtcMs(iso) + days * MS_PER_DAY);
}

/** Whole days from `from` to `to`; negative when `to` precedes `from`. */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Inclusive on both ends. */
export function isBetween(iso: IsoDate, start: IsoDate, end: IsoDate): boolean {
  return iso >= start && iso <= end;
}

export function minIso(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxIso(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso: IsoDate): number {
  return (new Date(toUtcMs(iso)).getUTCDay() + 6) % 7;
}

/** The Monday of the week containing `iso`. */
export function startOfWeek(iso: IsoDate): IsoDate {
  return addDays(iso, -weekdayIndex(iso));
}

export function startOfMonth(iso: IsoDate): IsoDate {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: IsoDate): IsoDate {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  // Day 0 of the following month is the last day of this one.
  return toIso(Date.UTC(year, month, 0));
}

export function addMonths(iso: IsoDate, months: number): IsoDate {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const target = Date.UTC(year, month - 1 + months, 1);
  const targetYear = new Date(target).getUTCFullYear();
  const targetMonth = new Date(target).getUTCMonth();
  // Clamp so that 31 Jan + 1 month lands on 28/29 Feb rather than rolling over.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return toIso(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)));
}

export function formatShort(iso: IsoDate): string {
  const month = MONTH_NAMES[Number(iso.slice(5, 7)) - 1];
  const day = Number(iso.slice(8, 10));
  return `${month} ${day}`;
}

export function formatLong(iso: IsoDate): string {
  return `${formatShort(iso)}, ${iso.slice(0, 4)}`;
}

export function formatMonthTitle(iso: IsoDate): string {
  const month = MONTH_NAMES_LONG[Number(iso.slice(5, 7)) - 1];
  return `${month} ${iso.slice(0, 4)}`;
}

/** "Jul 27 – Aug 2" */
export function formatRange(start: IsoDate, end: IsoDate): string {
  return `${formatShort(start)} – ${formatShort(end)}`;
}

export function quarterOf(iso: IsoDate): number {
  return Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1;
}

export type WeekBucket = {
  key: string;
  label: string;
  start: IsoDate;
  end: IsoDate;
  rangeLabel: string;
};

/**
 * The four Monday–Sunday rows of the Pipeline view, starting with the week
 * containing `today`.
 */
export function weekBuckets(today: IsoDate): WeekBucket[] {
  const firstMonday = startOfWeek(today);

  return [0, 1, 2, 3].map((offset) => {
    const start = addDays(firstMonday, offset * 7);
    const end = addDays(start, 6);
    return {
      key: `week-${offset}`,
      label: offset === 0 ? "This Week" : `Week ${offset + 1}`,
      start,
      end,
      rangeLabel: formatRange(start, end),
    };
  });
}

/** The last day covered by the four-week window. */
export function horizonEnd(today: IsoDate): IsoDate {
  return addDays(startOfWeek(today), 27);
}

/**
 * The Monday-aligned grid for a month view: whole weeks covering the month,
 * including the leading and trailing days that belong to neighbouring months.
 */
export function monthGrid(monthAnchor: IsoDate): IsoDate[][] {
  const first = startOfMonth(monthAnchor);
  const last = endOfMonth(monthAnchor);
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(startOfWeek(last), 6);

  const weeks: IsoDate[][] = [];
  let cursor = gridStart;

  while (cursor <= gridEnd) {
    const week: IsoDate[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(addDays(cursor, i));
    }
    weeks.push(week);
    cursor = addDays(cursor, 7);
  }

  return weeks;
}

/**
 * "3h ago" / "2d ago" — deliberately coarse; the exact timestamp is available
 * on hover wherever this is used.
 */
export function relativeTime(timestamp: string, now: Date = new Date()): string {
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return "unknown";

  const seconds = Math.round((now.getTime() - then) / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.round(months / 12)}y ago`;
}

/** Whole days between a stored timestamp and now — used by the staleness rule. */
export function daysSince(timestamp: string, now: Date = new Date()): number {
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.floor((now.getTime() - then) / MS_PER_DAY);
}

/** "Thu Aug 27" — the weekday matters when a launch date is read in Slack. */
export function formatWithWeekday(iso: IsoDate): string {
  return `${WEEKDAY_LABELS[weekdayIndex(iso)]} ${formatShort(iso)}`;
}
