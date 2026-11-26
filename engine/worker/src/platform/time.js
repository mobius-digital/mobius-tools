/* Days. A day is 'YYYY-MM-DD' in the brand's own time zone. */
// from profit/worker/src/worker.js (localDate, addDays, monthOf, windowFor)

export function dayIn(tz, date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const monthOf = day => String(day).slice(0, 7);

export const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));

/** How many days from a to b, counting neither end twice (a to a is 0). */
export const dayDiff = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400e3);

/** The old window rule. The window ends yesterday unless `to` names today or an earlier day.
 *  `days` counts back from today, as the old code does. `now` is for tests. */
export function windowFor(tz, { days = 30, from = null, to = null } = {}, now = new Date()) {
  const today = dayIn(tz, now);
  const yday = addDays(today, -1);
  const end = to && to <= today ? to : yday;
  const start = from || addDays(today, -days);
  return { today, from: start > end ? end : start, to: end };
}
